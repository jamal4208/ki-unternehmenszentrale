"use strict";

// Chefmodus P1 – Startseite "Heute". Zwei Prüfebenen in einer Datei:
//
// 1. Statisch (index.html, chef-today-ui.js, styles.css, server.js,
//    route-access-policy.js, package.json): Die Startkarte ist der führende
//    erste Bereich im Cockpit, enthält keine zweite Auftragserfassung, keinen
//    schreibenden Aufruf und keinen der bewusst nicht führenden Bereiche
//    (Agentenregister, Audit, Runner, Digests, IDs, Projektverwaltung,
//    Rollenübergaben, Historie, Technik, Qualität, Wissensdatenbank).
//
// 2. Laufzeit: chef-today-ui.js wird mit DOM-Stub und Fake-Backend
//    ausgeführt (gleiches Muster wie
//    pilot-work-order-command-center-ui.test.js). Geprüft werden die
//    Bereichsauswahl, die genau eine Empfehlung, die Obergrenze von fünf
//    laufenden Vorgängen und vor allem das Nichtstun: kein POST, keine
//    Statusänderung, keine zweite Priorisierung, keine zweite
//    Auftragserfassung.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function readFile(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

const html = readFile("index.html");
const js = readFile("chef-today-ui.js");
const css = readFile("styles.css");
const serverJs = readFile("server.js");
const policyJs = readFile("route-access-policy.js");
const packageJson = readFile("package.json");

// Die Fixture-Statuswerte müssen echte Statuswerte des bestehenden Dienstes
// sein – sonst prüfte dieser Test eine erfundene Welt.
const pilotService = require("./pilot-work-order-service");
const STATUS_VALUES = pilotService.PILOT_WORK_ORDER_STATUS_VALUES;
const STATUS_LABELS = pilotService.PILOT_STATUS_LABELS_DE;

// ---------------------------------------------------------------------------
// DOM-Stub: nur so viel, wie chef-today-ui.js tatsächlich anfasst.
// ---------------------------------------------------------------------------

const domElements = {};
domElements["chef-today-output"] = { innerHTML: "" };
domElements["chef-today-card"] = {
  addEventListener() {},
};

// Nachbau der bestehenden Pilotauftrags-Karte: ausschließlich die
// Bedienelemente, an die die Startseite delegiert. Jeder Klick wird
// protokolliert, damit nachweisbar bleibt, dass die Startseite selbst nichts
// tut, sondern nur die vorhandene Karte bedient.
//
// P1.1 ("Zielgenaue Navigation"): scrollTargets protokolliert nicht nur,
// *dass* gescrollt wurde, sondern *wohin* – so lässt sich nachweisen, dass
// nicht mehr die ganze Karte, sondern das tatsächliche Zielelement
// (Anlageformular bzw. Auftragszeile/Detailbereich) angesprungen wird.
// createFormOpen simuliert das synchrone Rendering der bestehenden Karte
// (pilot-work-order-ui.js#bindActionHandlersOnce, Fall "toggle-create-form"):
// ein Klick auf den Umschalter lässt das bestehende Titelfeld unmittelbar
// im DOM erscheinen bzw. wieder verschwinden – ohne dass chef-today-ui.js
// dafür irgendetwas Neues erzeugt.
const pilotClicks = [];
const scrollTargets = [];
let focusCalls = 0;
let pilotControls = [];
let createFormOpen = false;

function trackScroll(label) {
  return function scrollIntoView() {
    scrollTargets.push(label);
  };
}

function makePilotControl(action, orderId) {
  return {
    getAttribute(name) {
      if (name === "data-action") return action;
      if (name === "data-order-id") return orderId === undefined ? null : orderId;
      return null;
    },
    scrollIntoView: trackScroll(action === "select-order" ? `row:${orderId}` : `control:${action}`),
    click() {
      pilotClicks.push({ action, orderId: orderId === undefined ? null : orderId });
      if (action === "toggle-create-form") {
        createFormOpen = !createFormOpen;
        if (createFormOpen) {
          domElements["pilot-order-create-title"] = {
            value: "",
            scrollIntoView: trackScroll("create-form-title"),
            focus() {
              focusCalls += 1;
            },
          };
        } else {
          delete domElements["pilot-order-create-title"];
        }
      }
    },
  };
}

domElements["pilot-work-order-card"] = {
  querySelectorAll(selector) {
    const match = selector.match(/^\[data-action="([^"]+)"\]$/);
    const action = match ? match[1] : null;
    return pilotControls.filter((control) => control.getAttribute("data-action") === action);
  },
  scrollIntoView: trackScroll("card"),
};

// Bestehender, auftragsbezogener Detail-/Arbeitsbereich der Pilotauftrags-
// Karte (schon vor P1.1 vorhanden, statisch im Markup) – Standardziel beim
// Öffnen eines Vorgangs.
domElements["pilot-work-order-output"] = {
  scrollIntoView: trackScroll("detail"),
};

global.document = {
  readyState: "complete",
  getElementById(id) {
    return Object.prototype.hasOwnProperty.call(domElements, id) ? domElements[id] : null;
  },
  addEventListener() {},
};

// ---------------------------------------------------------------------------
// Fake-Backend: spiegelt den HTTP-Vertrag von pilot-work-order-routes.js für
// die beiden gelesenen Routen.
// ---------------------------------------------------------------------------

let backendOrders = [];
const backendProgress = {};
const fetchCalls = [];

// V8.4 – zusätzliche, rein additive Fake-Backend-Steuerung für das bereits
// bestehende Feld `overview.openDecision` (Standard: kein Eintrag, also
// `null`, wie im echten Dienst ohne offene Entscheidung) und zur
// Simulation eines fehlschlagenden Einzelabrufs (Netzwerkfehler). Beides
// betrifft ausschließlich die Testsicht auf die unveränderte HTTP-Route
// GET /api/pilot-work-order/orders/:id.
let backendOpenDecisionByOrderId = {};
let backendFailingDetailIds = new Set();

function setOpenDecision(orderId, text) {
  backendOpenDecisionByOrderId[orderId] = text;
}

function clearOpenDecisionOverrides() {
  backendOpenDecisionByOrderId = {};
}

function markDetailFetchFailing(orderId) {
  backendFailingDetailIds.add(orderId);
}

function clearFailingDetailFetches() {
  backendFailingDetailIds = new Set();
}

// V8.5 ("Entscheidungen im Chefmodus besser vorbereiten") – zusätzliche,
// rein additive Fake-Backend-Steuerung für die beiden bereits bestehenden
// Overview-Felder `handoffs` und `risksAndLimits` (siehe
// pilot-work-order-service.js#buildOverview). Standard: leere Liste, wie im
// echten Dienst ohne Rollenübergaben. Betrifft ausschließlich die
// Testsicht auf die unveränderte HTTP-Route
// GET /api/pilot-work-order/orders/:id.
let backendHandoffsByOrderId = {};
let backendRisksAndLimitsByOrderId = {};

function setHandoffs(orderId, handoffs) {
  backendHandoffsByOrderId[orderId] = handoffs;
}

function setRisksAndLimits(orderId, risksAndLimits) {
  backendRisksAndLimitsByOrderId[orderId] = risksAndLimits;
}

function clearHandoffAndRiskOverrides() {
  backendHandoffsByOrderId = {};
  backendRisksAndLimitsByOrderId = {};
}

// Fixture-Erzeugung eines Dokumentations-Handoffs, wortgleich zur echten
// Feldstruktur aus pilot-work-order-service.js#rowToHandoffView – nur die
// für V8.5 tatsächlich gelesenen Felder (toPilotRole, pmFilterStatus,
// resultOrRecommendation) sind fachlich relevant.
function makeDocumentationHandoff(overrides) {
  return Object.assign(
    {
      id: "handoff-test",
      toPilotRole: "DOKUMENTATION",
      pmFilterStatus: "PASSED",
      resultOrRecommendation: "Die Dokumentation empfiehlt die Freigabe.",
    },
    overrides || {},
  );
}

// V8.4 – liefert einen ISO-Zeitstempel, dessen LOKALER Kalendertag exakt
// `daysAgo` Tage vor dem heutigen lokalen Kalendertag liegt (unabhängig von
// der aktuellen Uhrzeit im Testlauf, da bewusst mittags/lokal 9 Uhr
// verankert – kein Risiko einer Mitternachtsgrenze zwischen Testaufbau und
// Auswertung).
function isoAtLocalDaysAgo(daysAgo) {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  local.setDate(local.getDate() - daysAgo);
  return local.toISOString();
}

function setOrders(orders) {
  backendOrders = orders.map((order, index) => ({
    id: order.id || `pilot-order-test-${index + 1}`,
    title: order.title,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    revision: order.revision || 1,
    updatedAt: order.updatedAt || "2026-08-04T08:00:00.000Z",
  }));
  backendOrders.forEach((order) => {
    backendProgress[order.id] = { rolesPassed: 1, rolesTotal: 3 };
  });
  return backendOrders;
}

global.fetch = function fetchStub(url, options) {
  const opts = options || {};
  fetchCalls.push({ url, method: opts.method || "GET", body: opts.body });
  if (url.startsWith("/api/pilot-work-order/orders/")) {
    const failingOrderId = decodeURIComponent(url.slice("/api/pilot-work-order/orders/".length));
    if (backendFailingDetailIds.has(failingOrderId)) {
      // V8.4: simulierter Netzwerkfehler eines einzelnen Detailabrufs –
      // fetchJson()/loadTodayOverviews() müssen das defensiv abfangen.
      return Promise.reject(new Error("V8.4-Test: simulierter Netzwerkfehler beim Einzelabruf"));
    }
  }
  let payload = null;
  if (url === "/api/pilot-work-order/orders") {
    payload = { ok: true, orders: backendOrders.map((order) => ({ ...order })) };
  } else if (url.startsWith("/api/pilot-work-order/orders/")) {
    const orderId = decodeURIComponent(url.slice("/api/pilot-work-order/orders/".length));
    const order = backendOrders.find((entry) => entry.id === orderId);
    payload = order
      ? {
          ok: true,
          overview: {
            order: { ...order },
            status: order.status,
            progress: backendProgress[order.id],
            openDecision: Object.prototype.hasOwnProperty.call(backendOpenDecisionByOrderId, orderId)
              ? backendOpenDecisionByOrderId[orderId]
              : null,
            nextStep: "NEXT_STEP_BY_STATUS-Text (technisch, wird von chef-today-ui.js nicht dargestellt)",
            handoffs: Object.prototype.hasOwnProperty.call(backendHandoffsByOrderId, orderId)
              ? backendHandoffsByOrderId[orderId]
              : [],
            risksAndLimits: Object.prototype.hasOwnProperty.call(backendRisksAndLimitsByOrderId, orderId)
              ? backendRisksAndLimitsByOrderId[orderId]
              : [],
          },
        }
      : { ok: false };
  }
  return Promise.resolve({
    status: payload ? 200 : 404,
    json: () => Promise.resolve(payload || {}),
  });
};

// Ausgangsbestand vor dem Laden des Moduls: das Skript startet beim Require
// selbst (document.readyState === "complete").
setOrders([
  { id: "order-entwurf", title: "Auftrag A: Entwurf", status: "DRAFT" },
  { id: "order-freigabe", title: "Auftrag B: Wartet auf Freigabe", status: "READY_FOR_JAMAL_APPROVAL" },
  { id: "order-pruefung", title: "Auftrag C: Ergebnis liegt vor", status: "READY_FOR_REVIEW" },
  { id: "order-blockiert", title: "Auftrag D: Blockiert", status: "BLOCKED" },
  { id: "order-zurueck", title: "Auftrag E: Zurückgegeben", status: "RETURNED" },
  { id: "order-laeuft", title: "Auftrag F: Läuft gerade", status: "IN_EXECUTION" },
  { id: "order-fertig", title: "Auftrag G: Abgeschlossen", status: "COMPLETED" },
  { id: "order-freigegeben", title: "Auftrag H: Freigegeben, nicht gestartet", status: "APPROVED_FOR_EXECUTION" },
]);

const ui = require("./chef-today-ui.js");

function outputHtml() {
  return domElements["chef-today-output"].innerHTML;
}

function sectionHtml(key) {
  const match = outputHtml().match(new RegExp(`data-chef-today-section="${key}"[\\s\\S]*?</section>`));
  assert.ok(match, `Bereich "${key}" muss gerendert sein`);
  return match[0];
}

function rowTitles(key) {
  const matches = sectionHtml(key).match(/<span class="chef-today-row-title">([^<]*)<\/span>/g) || [];
  return matches.map((entry) => entry.replace(/<[^>]+>/g, ""));
}

function postCalls() {
  return fetchCalls.filter((entry) => entry.method !== "GET");
}

async function reload() {
  await ui.load();
}

async function run() {
  await ui.getInitPromise();

  // -------------------------------------------------------------------
  // Statische Prüfungen – Einordnung und Grenzen der neuen Startseite.
  // -------------------------------------------------------------------

  await check("die Startseite \u201eHeute\u201c ist der f\u00fchrende erste Bereich im Cockpit", () => {
    const cockpit = html.match(/<section class="view is-active" id="cockpit-view"[\s\S]*?<section class="[^"]*card" id="([a-z-]+)"/);
    assert.ok(cockpit, "der Cockpit-Bereich muss auffindbar sein");
    assert.strictEqual(cockpit[1], "chef-today-card", "die erste Karte im Cockpit ist die Startseite");
    assert.match(html, /<h2 id="chef-today-title">Heute<\/h2>/);
    assert.ok(
      html.indexOf('id="chef-today-card"') < html.indexOf('id="jamal-work-card"'),
      "die Startkarte muss vor der bisherigen Arbeitskarte stehen",
    );
  });

  await check("die bestehenden Bereiche bleiben erhalten (die Startseite ersetzt nichts)", () => {
    ["jamal-work-card", "health-reference-run-card", "pilot-work-order-card", "daily-work-run-section"].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `${id} muss erhalten bleiben`);
    });
  });

  await check("die Startkarte enth\u00e4lt kein eigenes Eingabefeld (keine zweite Auftragserfassung)", () => {
    const card = html.match(/<section class="chef-today-card"[\s\S]*?<\/section>/);
    assert.ok(card, "die Startkarte muss auffindbar sein");
    assert.doesNotMatch(card[0], /<input|<textarea|<select|<form/);
    assert.doesNotMatch(js, /<input|<textarea|<select|<form/);
  });

  await check("das Skript enth\u00e4lt keinen einzigen schreibenden Aufruf (kein POST, kein CSRF-Token)", () => {
    assert.doesNotMatch(js, /"POST"|'POST'/);
    assert.doesNotMatch(js, /x-kuz-csrf|readCsrfToken|readCookie/);
    assert.doesNotMatch(js, /postAction|runAction/);
    assert.doesNotMatch(js, /body:/, "eine reine Leseanfrage hat keinen Anfragek\u00f6rper");
    // Der einzige Methodenwert im gesamten Skript ist GET.
    const methods = js.match(/method:\s*"([A-Z]+)"/g) || [];
    assert.deepStrictEqual(methods, ['method: "GET"']);
  });

  await check("das Skript nutzt ausschlie\u00dflich bestehende Leserouten (keine neue Route)", () => {
    // V8.4: dieselbe Einzelroute wird jetzt an zwei Stellen aufgerufen
    // (loadRunningProgress() seit P1, loadTodayOverviews() neu seit V8.4) –
    // deshalb hier auf eindeutige URL-Literale prüfen statt auf die reine
    // Trefferliste.
    const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
    assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
  });

  await check("keine neue Gesch\u00e4ftslogik: Titel, Statustext und Fortschritt kommen unver\u00e4ndert vom Server", () => {
    // Kein eigenes Statuslabel-Mapping und keine eigene Fortschrittsrechnung.
    assert.match(js, /order\.statusLabel/);
    assert.match(js, /overview\.progress/);
    assert.doesNotMatch(js, /statusLabel\s*[:=]\s*["']/);
    assert.doesNotMatch(js, /Math\.round|Math\.floor|\/\s*100|percent/i);
  });

  await check("es gibt genau eine Ordnung – Bereich A, Bereich C und die Empfehlung lesen dieselbe Tagesordnung", () => {
    const agenda = js.match(/function buildAgenda\(orders\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(agenda, "buildAgenda muss auffindbar sein");
    assert.match(agenda[0], /selectToday\(orders\)\.concat\(selectRunning\(orders\)\)/);
    const recommend = js.match(/function selectRecommendedNextWork\(orders\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(recommend, "selectRecommendedNextWork muss auffindbar sein");
    assert.match(recommend[0], /buildAgenda\(orders\)/);
    assert.doesNotMatch(recommend[0], /sort|score|weight|priorit/i);
  });

  await check("das Skript ist als eigenes, nur f\u00fcr Jamal erreichbares Asset registriert", () => {
    assert.match(serverJs, /\["\/chef-today-ui\.js", "chef-today-ui\.js"\]/);
    assert.match(policyJs, /staticOwnerOnly\("\/chef-today-ui\.js"/);
    assert.match(html, /<script src="chef-today-ui\.js"><\/script>/);
  });

  await check("die Startkarte hat eine eigene, ruhige Darstellung", () => {
    assert.match(css, /\.chef-today-card \{/);
    assert.match(css, /\.chef-today-section \{/);
    assert.match(css, /\.chef-today-row \{/);
  });

  await check("der Test ist in npm test und npm run check eingetragen", () => {
    assert.match(packageJson, /node chef-today-ui\.test\.js/);
    assert.match(packageJson, /node --check chef-today-ui\.js/);
    assert.match(packageJson, /node --check chef-today-ui\.test\.js/);
  });

  await check("die Fixture-Statuswerte sind echte Statuswerte des bestehenden Dienstes", () => {
    backendOrders.forEach((order) => {
      assert.ok(STATUS_VALUES.includes(order.status), `${order.status} muss ein echter Statuswert sein`);
    });
    ui.TODAY_STATUS_ORDER.forEach((status) => {
      assert.ok(STATUS_VALUES.includes(status), `${status} muss ein echter Statuswert sein`);
    });
    assert.ok(STATUS_VALUES.includes(ui.RUNNING_STATUS));
    assert.ok(STATUS_VALUES.includes(ui.DONE_STATUS));
  });

  // -------------------------------------------------------------------
  // Laufzeit – Öffnen der Startseite.
  // -------------------------------------------------------------------

  await check("das \u00d6ffnen der Startseite l\u00f6st keinen POST aus (nur lesende Abrufe)", () => {
    assert.deepStrictEqual(postCalls(), []);
    assert.ok(fetchCalls.length > 0, "die Startseite muss den vorhandenen Stand gelesen haben");
    fetchCalls.forEach((entry) => {
      assert.strictEqual(entry.method, "GET");
      assert.match(entry.url, /^\/api\/pilot-work-order\/orders/);
    });
  });

  await check("das \u00d6ffnen der Startseite \u00e4ndert keinen Status", () => {
    assert.deepStrictEqual(
      ui.getState().orders.map((order) => `${order.id}:${order.status}`),
      backendOrders.map((order) => `${order.id}:${order.status}`),
    );
  });

  await check("Heute wichtig zeigt ausschlie\u00dflich entscheidungsrelevante Vorg\u00e4nge", () => {
    assert.deepStrictEqual(rowTitles("today"), [
      "Auftrag E: Zur\u00fcckgegeben",
      "Auftrag C: Ergebnis liegt vor",
      "Auftrag D: Blockiert",
      "Auftrag B: Wartet auf Freigabe",
    ]);
    const section = sectionHtml("today");
    ["Auftrag A: Entwurf", "Auftrag F: L\u00e4uft gerade", "Auftrag G: Abgeschlossen", "Auftrag H: Freigegeben"].forEach(
      (title) => {
        assert.ok(!section.includes(title), `${title} geh\u00f6rt nicht in "Heute wichtig"`);
      },
    );
  });

  await check("Heute wichtig nennt den Grund in Chefsprache statt eines technischen Zustands", () => {
    const section = sectionHtml("today");
    ["Entscheidung notwendig", "Ergebnis wartet auf Pr\u00fcfung", "Auftrag blockiert", "Freigabe erforderlich"].forEach(
      (reason) => {
        assert.ok(section.includes(reason), `Grund "${reason}" muss sichtbar sein`);
      },
    );
    // Sichtbarer Text ohne Markup: kein technischer Zustand, keine ID.
    const visibleText = section.replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /READY_FOR|RETURNED|BLOCKED|IN_EXECUTION/);
    assert.doesNotMatch(visibleText, /order-|Rev\./);
  });

  await check("Fertig zeigt keine laufenden Arbeiten", () => {
    assert.deepStrictEqual(rowTitles("done"), ["Auftrag G: Abgeschlossen"]);
    const section = sectionHtml("done");
    ["Auftrag F: L\u00e4uft gerade", "Auftrag A: Entwurf", "Auftrag D: Blockiert"].forEach((title) => {
      assert.ok(!section.includes(title), `${title} geh\u00f6rt nicht in "Fertig"`);
    });
  });

  await check("L\u00e4uft zeigt nur aktive Arbeiten und den Fortschritt aus dem bestehenden Auftrag", () => {
    assert.deepStrictEqual(rowTitles("running"), ["Auftrag F: L\u00e4uft gerade"]);
    assert.ok(sectionHtml("running").includes("1 von 3 Rollen abgeschlossen"));
    assert.ok(
      !sectionHtml("running").includes("Auftrag H: Freigegeben"),
      "ein freigegebener, aber nicht gestarteter Auftrag l\u00e4uft nicht",
    );
  });

  await check("die Startseite zeigt keinen der bewusst nicht f\u00fchrenden Bereiche offen", () => {
    const visible = outputHtml().replace(/<[^>]*>/g, " ");
    [
      /Agentenregister/i,
      /Audit/i,
      /Runner/i,
      /Digest/i,
      /Projektverwaltung/i,
      /Rollen\u00fcbergabe/i,
      /Historie/i,
      /Technik/i,
      /Qualit\u00e4t/i,
      /Wissensdatenbank/i,
      /Kette/i,
      /Revision|Rev\./,
      /order-/,
    ].forEach((pattern) => {
      assert.doesNotMatch(visible, pattern, `die Startseite darf ${pattern} nicht f\u00fchren`);
    });
  });

  await check("es gibt genau eine empfohlene n\u00e4chste Arbeit", () => {
    const section = sectionHtml("recommendation");
    const titles = section.match(/<p class="chef-today-recommendation-title">([^<]*)<\/p>/g) || [];
    assert.strictEqual(titles.length, 1);
    assert.ok(section.includes("Auftrag E: Zur\u00fcckgegeben"));
    assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).id, "order-zurueck");
  });

  await check("die Empfehlung ist genau der erste Eintrag derselben Tagesordnung (keine zweite Priorisierung)", () => {
    const orders = ui.getState().orders;
    assert.strictEqual(ui.selectRecommendedNextWork(orders), ui.buildAgenda(orders)[0]);
    assert.strictEqual(ui.buildAgenda(orders)[0], ui.selectToday(orders)[0]);
    assert.deepStrictEqual(
      ui.buildAgenda(orders),
      ui.selectToday(orders).concat(ui.selectRunning(orders)),
      "die Tagesordnung ist Bereich A gefolgt von Bereich C – nichts anderes",
    );
  });

  await check("jeder Bereich hat h\u00f6chstens eine Hauptaktion", () => {
    ["today", "done", "running", "recommendation", "new-order"].forEach((key) => {
      const buttons = sectionHtml(key).match(/class="primary-button"/g) || [];
      assert.ok(buttons.length <= 1, `Bereich ${key} h\u00e4tte ${buttons.length} Hauptaktionen`);
    });
  });

  await check("erneutes Rendern l\u00f6st keinen Request aus", () => {
    fetchCalls.length = 0;
    ui.render();
    ui.render();
    assert.deepStrictEqual(fetchCalls, []);
  });

  // -------------------------------------------------------------------
  // Laufzeit – Hauptaktionen führen in die bestehende Pilotauftrags-Karte.
  // -------------------------------------------------------------------

  await check("ein Vorgang wird in der bestehenden Pilotauftrags-Karte ge\u00f6ffnet, nicht in der Startseite", () => {
    pilotControls = backendOrders
      .map((order) => makePilotControl("select-order", order.id))
      .concat([makePilotControl("toggle-create-form")]);
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    scrollTargets.length = 0;
    const opened = ui.openOrder("order-blockiert");
    assert.strictEqual(opened, true);
    assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "order-blockiert" }]);
    assert.deepStrictEqual(fetchCalls, [], "die Startseite darf dabei selbst nichts abrufen");
  });

  await check(
    "P1.1: der richtige Auftrag markiert die Zeile, das Scrollziel ist der Detailbereich (nicht mehr die ganze Karte)",
    () => {
      pilotClicks.length = 0;
      scrollTargets.length = 0;
      const opened = ui.openOrder("order-freigabe");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(
        pilotClicks,
        [{ action: "select-order", orderId: "order-freigabe" }],
        "es wird genau der gew\u00e4hlte Auftrag markiert, kein anderer",
      );
      assert.deepStrictEqual(
        scrollTargets,
        ["detail"],
        "bevorzugtes Scrollziel ist der bestehende Detail-/Arbeitsbereich, nicht die ganze Karte",
      );
    },
  );

  await check(
    "P1.1: fehlt der Detailbereich, wird stattdessen zuverl\u00e4ssig die markierte Auftragszeile angesprungen",
    () => {
      const detailBackup = domElements["pilot-work-order-output"];
      delete domElements["pilot-work-order-output"];
      pilotClicks.length = 0;
      scrollTargets.length = 0;
      const opened = ui.openOrder("order-pruefung");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(scrollTargets, ["row:order-pruefung"], "Ersatzziel ist genau die gew\u00e4hlte Zeile");
      domElements["pilot-work-order-output"] = detailBackup;
    },
  );

  await check(
    "P1.1: ein fehlendes Zielelement (weder Detailbereich noch Zeile) l\u00f6st keinen Fehler aus (Fallback auf die Karte)",
    () => {
      const detailBackup = domElements["pilot-work-order-output"];
      delete domElements["pilot-work-order-output"];
      pilotClicks.length = 0;
      scrollTargets.length = 0;
      assert.doesNotThrow(() => {
        const opened = ui.openOrder("order-existiert-nicht");
        assert.strictEqual(opened, false, "ein unbekannter Auftrag markiert nichts");
      });
      assert.deepStrictEqual(pilotClicks, [], "ohne passende Zeile wird nichts geklickt");
      assert.deepStrictEqual(scrollTargets, ["card"], "letzter Ausweg ist die Karte selbst, kein Fehler");
      domElements["pilot-work-order-output"] = detailBackup;
    },
  );

  await check("die empfohlene Arbeit \u00f6ffnet genau diesen einen Vorgang und \u00e4ndert keinen Status", () => {
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    const statusesBefore = ui.getState().orders.map((order) => order.status);
    ui.openRecommendedWork();
    assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "order-zurueck" }]);
    assert.deepStrictEqual(postCalls(), []);
    assert.deepStrictEqual(
      ui.getState().orders.map((order) => order.status),
      statusesBefore,
      "eine Hauptaktion der Startseite ver\u00e4ndert keinen Status",
    );
  });

  await check("Neuer Auftrag verwendet die bestehende Anlage des Pilotauftrags", () => {
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    scrollTargets.length = 0;
    focusCalls = 0;
    const opened = ui.openNewOrder();
    assert.strictEqual(opened, true);
    assert.deepStrictEqual(pilotClicks, [{ action: "toggle-create-form", orderId: null }]);
    assert.deepStrictEqual(postCalls(), [], "die Anlage selbst bleibt Sache der bestehenden Karte");
    assert.ok(!outputHtml().includes("<input"), "die Startseite \u00f6ffnet kein eigenes Formular");
    assert.ok(
      Object.keys(domElements).filter((id) => id === "pilot-order-create-title").length === 1,
      "es entsteht genau ein Anlageformular, kein zweites",
    );
  });

  await check("P1.1: das sichtbar gemachte Anlageformular ist selbst das Navigationsziel (nicht die ganze Karte)", () => {
    assert.deepStrictEqual(
      scrollTargets,
      ["create-form-title"],
      "Scrollziel ist das bestehende Anlageformular, nicht mehr die ganze Pilotauftrags-Karte",
    );
  });

  await check("P1.1: das erste geeignete Eingabefeld des Anlageformulars wird fokussiert", () => {
    assert.strictEqual(focusCalls, 1, "genau ein Fokusaufruf auf das bestehende Titelfeld");
  });

  await check("ein bereits ge\u00f6ffnetes Anlageformular wird nicht wieder geschlossen", () => {
    domElements["pilot-order-create-title"] = {
      value: "",
      scrollIntoView: trackScroll("create-form-title-already-open"),
      focus() {
        focusCalls += 1;
      },
    };
    pilotClicks.length = 0;
    scrollTargets.length = 0;
    focusCalls = 0;
    ui.openNewOrder();
    assert.deepStrictEqual(pilotClicks, [], "kein zweiter Umschaltklick auf ein offenes Formular");
    assert.deepStrictEqual(
      scrollTargets,
      ["create-form-title-already-open"],
      "stattdessen nur der Sprung zum bereits offenen Formularfeld",
    );
    assert.strictEqual(focusCalls, 1, "das bereits offene Formular wird weiterhin fokussiert");
    delete domElements["pilot-order-create-title"];
    createFormOpen = false;
  });

  await check("P1.1: wiederholtes \u00d6ffnen \u00fcber die Startseite bleibt konsistent (kein Doppelklick-Zustand)", () => {
    pilotClicks.length = 0;
    scrollTargets.length = 0;
    focusCalls = 0;
    ui.openNewOrder();
    ui.openNewOrder();
    assert.deepStrictEqual(
      pilotClicks,
      [{ action: "toggle-create-form", orderId: null }],
      "nur der erste Aufruf schaltet das Formular um, der zweite findet es bereits offen vor",
    );
    assert.strictEqual(focusCalls, 2, "beide Aufrufe fokussieren dasselbe, weiterhin einzige Formularfeld");
    delete domElements["pilot-order-create-title"];
    createFormOpen = false;
  });

  // -------------------------------------------------------------------
  // Laufzeit – Obergrenzen und ruhige Randfälle.
  // -------------------------------------------------------------------

  await check("L\u00e4uft zeigt auch bei mehr aktiven Arbeiten h\u00f6chstens f\u00fcnf Vorg\u00e4nge", async () => {
    setOrders(
      Array.from({ length: 9 }, (unused, index) => ({
        id: `order-laeuft-${index + 1}`,
        title: `Laufende Arbeit ${index + 1}`,
        status: "IN_EXECUTION",
      })),
    );
    await reload();
    assert.strictEqual(ui.RUNNING_LIMIT, 5);
    assert.strictEqual(rowTitles("running").length, 5);
    assert.deepStrictEqual(rowTitles("running"), [
      "Laufende Arbeit 1",
      "Laufende Arbeit 2",
      "Laufende Arbeit 3",
      "Laufende Arbeit 4",
      "Laufende Arbeit 5",
    ]);
    assert.deepStrictEqual(postCalls(), []);
  });

  await check("h\u00f6chstens f\u00fcnf laufende Vorg\u00e4nge werden nachgelesen (keine unbegrenzte Abfragewelle)", () => {
    const detailCalls = fetchCalls.filter((entry) => /\/api\/pilot-work-order\/orders\/.+/.test(entry.url));
    assert.strictEqual(detailCalls.length, 5);
  });

  await check("ohne entscheidungsrelevanten Vorgang empfiehlt die Startseite genau eine laufende Arbeit", () => {
    assert.deepStrictEqual(rowTitles("today"), []);
    assert.ok(sectionHtml("today").includes("Heute wartet nichts auf deine Entscheidung."));
    const titles = sectionHtml("recommendation").match(/<p class="chef-today-recommendation-title">/g) || [];
    assert.strictEqual(titles.length, 1);
    assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).title, "Laufende Arbeit 1");
  });

  await check("ein leerer Tag bleibt ruhig: kein Fehler, keine Aktion au\u00dfer dem neuen Auftrag", async () => {
    setOrders([]);
    await reload();
    assert.ok(sectionHtml("today").includes("Heute wartet nichts auf deine Entscheidung."));
    assert.ok(sectionHtml("done").includes("Noch nichts abgeschlossen."));
    assert.ok(sectionHtml("running").includes("Gerade l\u00e4uft keine Arbeit."));
    assert.ok(sectionHtml("recommendation").includes("Es gibt heute keine Arbeit, die auf dich wartet."));
    assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders), null);
    const buttons = outputHtml().match(/class="primary-button"/g) || [];
    assert.strictEqual(buttons.length, 1, "\u00fcbrig bleibt genau die Anlage eines neuen Auftrags");
    assert.ok(sectionHtml("new-order").includes("Neuen Auftrag anlegen"));
    assert.deepStrictEqual(postCalls(), []);
  });

  await check("\u00fcber den gesamten Ablauf wurde kein einziger schreibender Aufruf gesendet", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------
  // V8.4 – Chefmodus "Heute wichtig": Warum-Satz, Wartedauer, Abrufgrenze.
  // Isolierte Funktionsprüfungen (whyTextFor/waitLabelFor) ergänzen die
  // Zustandswechsel-Prüfungen gegen das Fake-Backend darunter.
  // -------------------------------------------------------------------

  await check("V8.4: Fallback READY_FOR_REVIEW korrekt (isolierte Funktionspr\u00fcfung)", () => {
    assert.strictEqual(
      ui.whyTextFor({ id: "v84-unit-missing-1", status: "READY_FOR_REVIEW" }),
      "Das Ergebnis wartet auf deine Pr\u00fcfung.",
    );
  });

  await check("V8.4: Fallback READY_FOR_JAMAL_APPROVAL korrekt (isolierte Funktionspr\u00fcfung)", () => {
    assert.strictEqual(
      ui.whyTextFor({ id: "v84-unit-missing-2", status: "READY_FOR_JAMAL_APPROVAL" }),
      "Der Auftrag wartet auf deine Freigabe.",
    );
  });

  await check("V8.4: Fallback BLOCKED korrekt (isolierte Funktionspr\u00fcfung)", () => {
    assert.strictEqual(
      ui.whyTextFor({ id: "v84-unit-missing-3", status: "BLOCKED" }),
      "Der Auftrag ist blockiert und wartet auf deine Entscheidung.",
    );
  });

  await check("V8.4: Fallback RETURNED korrekt (isolierte Funktionspr\u00fcfung)", () => {
    assert.strictEqual(
      ui.whyTextFor({ id: "v84-unit-missing-4", status: "RETURNED" }),
      "Der Auftrag wurde zur\u00fcckgegeben und wartet auf deine n\u00e4chste Entscheidung.",
    );
  });

  await check("V8.4: openDecision hat Vorrang vor dem Fallback-Satz (isolierte Funktionspr\u00fcfung)", () => {
    ui.getState().todayOverviewByOrderId["v84-unit-open-decision"] = {
      openDecision: "Individuelle Entscheidung aus dem Einzel-Overview.",
      nextStep: null,
    };
    assert.strictEqual(
      ui.whyTextFor({ id: "v84-unit-open-decision", status: "BLOCKED" }),
      "Individuelle Entscheidung aus dem Einzel-Overview.",
    );
    delete ui.getState().todayOverviewByOrderId["v84-unit-open-decision"];
  });

  await check("V8.4: Wartedauer \u201eHeute\u201c", () => {
    assert.strictEqual(ui.waitLabelFor({ updatedAt: new Date().toISOString() }), "Heute");
  });

  await check("V8.4: Wartedauer \u201eGestern\u201c", () => {
    assert.strictEqual(ui.waitLabelFor({ updatedAt: isoAtLocalDaysAgo(1) }), "Gestern");
  });

  await check("V8.4: Wartedauer \u201eSeit X Tagen\u201c", () => {
    assert.strictEqual(ui.waitLabelFor({ updatedAt: isoAtLocalDaysAgo(5) }), "Seit 5 Tagen");
  });

  await check("V8.4: ung\u00fcltiges oder fehlendes updatedAt wird defensiv behandelt (keine Anzeige, kein Fehler)", () => {
    assert.strictEqual(ui.waitLabelFor({ updatedAt: "kein-datum" }), "");
    assert.strictEqual(ui.waitLabelFor({ updatedAt: null }), "");
    assert.strictEqual(ui.waitLabelFor({}), "");
    assert.doesNotThrow(() => ui.waitLabelFor(null));
  });

  await check("V8.4: Overview wird nur f\u00fcr entscheidungsrelevante Eintr\u00e4ge geladen (keine anderen Status)", async () => {
    setOrders([
      { id: "v84-order-draft", title: "Entwurf", status: "DRAFT" },
      { id: "v84-order-returned", title: "Zur\u00fcckgegeben", status: "RETURNED", updatedAt: new Date().toISOString() },
      { id: "v84-order-review", title: "Pr\u00fcfung", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      { id: "v84-order-completed", title: "Fertig", status: "COMPLETED" },
    ]);
    fetchCalls.length = 0;
    await reload();
    const detailIds = fetchCalls
      .filter((entry) => /^\/api\/pilot-work-order\/orders\/.+/.test(entry.url))
      .map((entry) => decodeURIComponent(entry.url.slice("/api/pilot-work-order/orders/".length)));
    assert.deepStrictEqual(detailIds.slice().sort(), ["v84-order-returned", "v84-order-review"].sort());
  });

  await check("V8.4: h\u00f6chstens f\u00fcnf Overview-Abrufe f\u00fcr entscheidungsrelevante Auftr\u00e4ge", async () => {
    setOrders(
      Array.from({ length: 7 }, (unused, index) => ({
        id: `v84-order-many-${index + 1}`,
        title: `Wichtiger Vorgang ${index + 1}`,
        status: "RETURNED",
        updatedAt: new Date().toISOString(),
      })),
    );
    fetchCalls.length = 0;
    await reload();
    const detailCalls = fetchCalls.filter((entry) => /^\/api\/pilot-work-order\/orders\/.+/.test(entry.url));
    assert.strictEqual(ui.TODAY_OVERVIEW_FETCH_LIMIT, 5);
    assert.strictEqual(detailCalls.length, ui.TODAY_OVERVIEW_FETCH_LIMIT);
  });

  await check("V8.4: mehr als f\u00fcnf wichtige Vorg\u00e4nge bleiben trotzdem vollst\u00e4ndig sichtbar", () => {
    assert.strictEqual(rowTitles("today").length, 7);
    const section = sectionHtml("today");
    for (let index = 1; index <= 7; index += 1) {
      assert.ok(section.includes(`Wichtiger Vorgang ${index}`), `Vorgang ${index} muss sichtbar bleiben`);
    }
    assert.ok(
      section.includes("Weitere wichtige Vorg\u00e4nge vorhanden."),
      "ein ruhiger Hinweis auf weitere Vorg\u00e4nge muss erscheinen",
    );
  });

  await check(
    "V8.4: echtes openDecision aus dem Overview erscheint im Warum-Satz, ein fehlgeschlagener Detailabruf zerst\u00f6rt die Karte nicht",
    async () => {
      setOrders([
        { id: "v84-order-ok", title: "Normaler Vorgang", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v84-order-fails", title: "Vorgang mit Fehler", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("v84-order-ok", "Jamal muss den Blocker aus dem echten Overview kl\u00e4ren.");
      markDetailFetchFailing("v84-order-fails");
      fetchCalls.length = 0;
      await assert.doesNotReject(async () => reload());
      assert.strictEqual(ui.getState().error, null, "ein fehlgeschlagener Detailabruf darf keinen Kartenfehler ausl\u00f6sen");
      assert.deepStrictEqual(rowTitles("today"), ["Normaler Vorgang", "Vorgang mit Fehler"]);
      const section = sectionHtml("today");
      assert.ok(
        section.includes("Jamal muss den Blocker aus dem echten Overview kl\u00e4ren."),
        "das echte openDecision-Feld muss den Fallback-Satz verdr\u00e4ngen",
      );
      assert.ok(
        section.includes("Der Auftrag ist blockiert und wartet auf deine Entscheidung."),
        "der fehlgeschlagene Abruf f\u00e4llt auf den Fallback-Satz zur\u00fcck, statt die Karte zu zerst\u00f6ren",
      );
      clearOpenDecisionOverrides();
      clearFailingDetailFetches();
    },
  );

  await check("V8.4: keine technischen Statuscodes und keine ID/Revision im sichtbaren Text der angereicherten Zeilen", () => {
    const visibleText = outputHtml().replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /READY_FOR|RETURNED|BLOCKED|IN_EXECUTION/);
    assert.doesNotMatch(visibleText, /v84-order-|Rev\./);
    assert.doesNotMatch(visibleText, /NEXT_STEP_BY_STATUS/, "nextStep wird bewusst nicht dargestellt");
  });

  await check(
    "V8.4/V8.5: die Schaltfl\u00e4che \u201eEntscheidung \u00f6ffnen\u201c bleibt Teil des bestehenden, einzigen Zeilen-Buttons (kein zweites Bedienelement)",
    () => {
      const section = sectionHtml("today");
      const rowButtons = section.match(/<button type="button" class="chef-today-row"/g) || [];
      const allButtons = section.match(/<button/g) || [];
      assert.strictEqual(rowButtons.length, allButtons.length, "es entsteht kein zweites Bedienelement je Zeile");
      assert.ok(
        section.includes('<span class="chef-today-row-open">Entscheidung \u00f6ffnen</span>'),
        "\u201eEntscheidung \u00f6ffnen\u201c muss sichtbar sein",
      );
      assert.doesNotMatch(section, /Freigeben|Ablehnen|Genehmigen|Zur\u00fcckweisen/);
    },
  );

  await check("V8.4: \u00d6ffnen einer Zeile nutzt weiterhin ausschlie\u00dflich das bestehende openOrder()", () => {
    pilotControls = backendOrders.map((order) => makePilotControl("select-order", order.id));
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    const opened = ui.openOrder("v84-order-ok");
    assert.strictEqual(opened, true);
    assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v84-order-ok" }]);
    assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen selbst l\u00f6st keinen weiteren Abruf aus");
  });

  await check("V8.4: weiterhin kein schreibender Request \u00fcber alle neuen Abl\u00e4ufe hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------
  // V8.4-Korrekturlauf – Chefsprache in den sichtbaren Warum-S\u00e4tzen.
  // Die Browserabnahme wies nach, dass zwei REALE openDecision-Texte aus
  // buildOverview() (pilot-work-order-service.js) einen technischen
  // Statuscode in Klammern enthalten. Die bisherigen V8.4-Tests oben nutzten
  // dafür ausschlie\u00dflich frei erfundene Fake-Backend-Texte ohne diese
  // Zus\u00e4tze (siehe z. B. "Jamal muss den Blocker aus dem echten Overview
  // kl\u00e4ren.") und erkannten den Befund deshalb nicht. Die folgenden
  // Pr\u00fcfungen verwenden deshalb bewusst wortgleiche Texte aus dem echten
  // Dienst.
  // -------------------------------------------------------------------

  const REAL_OPEN_DECISION_COMPLETED =
    "Jamal muss das Ergebnis abnehmen (COMPLETED) oder zur \u00dcberarbeitung zur\u00fcckgeben.";
  const REAL_OPEN_DECISION_APPROVED =
    "Jamal muss die Ausf\u00fchrung freigeben (APPROVED_FOR_EXECUTION) oder den Auftrag zur\u00fcckgeben.";

  await check(
    "V8.4-Korrektur: sanitizeChefDecisionText() entfernt bekannte technische Zus\u00e4tze, l\u00e4sst normale Klammertexte und unbekannte Texte unver\u00e4ndert (isolierte Funktionspr\u00fcfung)",
    () => {
      assert.strictEqual(
        ui.sanitizeChefDecisionText(REAL_OPEN_DECISION_COMPLETED),
        "Jamal muss das Ergebnis abnehmen oder zur \u00dcberarbeitung zur\u00fcckgeben.",
      );
      assert.strictEqual(
        ui.sanitizeChefDecisionText(REAL_OPEN_DECISION_APPROVED),
        "Jamal muss die Ausf\u00fchrung freigeben oder den Auftrag zur\u00fcckgeben.",
      );
      // normaler fachlicher Klammertext bleibt unangetastet (keine pauschale
      // Klammerentfernung)
      assert.strictEqual(
        ui.sanitizeChefDecisionText("Freigabe durch Jamal (Vier-Augen-Prinzip) erforderlich."),
        "Freigabe durch Jamal (Vier-Augen-Prinzip) erforderlich.",
      );
      // unbekannter, normaler Text bleibt unver\u00e4ndert
      assert.strictEqual(
        ui.sanitizeChefDecisionText("Der Kunde wartet noch auf eine R\u00fcckmeldung von Jamal."),
        "Der Kunde wartet noch auf eine R\u00fcckmeldung von Jamal.",
      );
      // mehrfach vorkommende bekannte Zus\u00e4tze werden vollst\u00e4ndig entfernt,
      // ohne doppelte Leerzeichen oder Leerzeichen vor Satzzeichen
      assert.strictEqual(
        ui.sanitizeChefDecisionText(
          "Status (COMPLETED) und erneut (COMPLETED) sowie (APPROVED_FOR_EXECUTION) .",
        ),
        "Status und erneut sowie.",
      );
      // defensiv: null/undefined/leer/nur-technisch -> null (Fallback beim
      // Aufrufer)
      assert.strictEqual(ui.sanitizeChefDecisionText(null), null);
      assert.strictEqual(ui.sanitizeChefDecisionText(undefined), null);
      assert.strictEqual(ui.sanitizeChefDecisionText(""), null);
      assert.strictEqual(ui.sanitizeChefDecisionText("   "), null);
      assert.strictEqual(ui.sanitizeChefDecisionText(" (COMPLETED) (APPROVED_FOR_EXECUTION) "), null);
      // das \u00fcbergebene Original wird nicht mutiert (Strings sind in
      // JavaScript ohnehin unver\u00e4nderlich, hier zus\u00e4tzlich real gepr\u00fcft)
      const original = REAL_OPEN_DECISION_COMPLETED;
      ui.sanitizeChefDecisionText(original);
      assert.strictEqual(original, REAL_OPEN_DECISION_COMPLETED);
    },
  );

  await check(
    "V8.4-Korrektur: whyTextFor() zeigt reale openDecision-Texte mit (COMPLETED)/(APPROVED_FOR_EXECUTION) bereinigt an (isolierte Funktionspr\u00fcfung)",
    () => {
      ui.getState().todayOverviewByOrderId["v84-fix-review-unit"] = {
        openDecision: REAL_OPEN_DECISION_COMPLETED,
        nextStep: null,
      };
      assert.strictEqual(
        ui.whyTextFor({ id: "v84-fix-review-unit", status: "READY_FOR_REVIEW" }),
        "Jamal muss das Ergebnis abnehmen oder zur \u00dcberarbeitung zur\u00fcckgeben.",
      );
      delete ui.getState().todayOverviewByOrderId["v84-fix-review-unit"];

      ui.getState().todayOverviewByOrderId["v84-fix-approval-unit"] = {
        openDecision: REAL_OPEN_DECISION_APPROVED,
        nextStep: null,
      };
      assert.strictEqual(
        ui.whyTextFor({ id: "v84-fix-approval-unit", status: "READY_FOR_JAMAL_APPROVAL" }),
        "Jamal muss die Ausf\u00fchrung freigeben oder den Auftrag zur\u00fcckgeben.",
      );
      delete ui.getState().todayOverviewByOrderId["v84-fix-approval-unit"];
    },
  );

  await check(
    "V8.4-Korrektur: reale, wortgleiche openDecision-Texte aus dem Fake-Backend erscheinen in der Startkarte ohne technischen Statuscode, das technische Originalfeld bleibt unangetastet",
    async () => {
      setOrders([
        { id: "v84-fix-review", title: "Ergebnis liegt wirklich vor", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
        { id: "v84-fix-approval", title: "Freigabe wartet wirklich", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("v84-fix-review", REAL_OPEN_DECISION_COMPLETED);
      setOpenDecision("v84-fix-approval", REAL_OPEN_DECISION_APPROVED);
      fetchCalls.length = 0;
      await reload();

      const section = sectionHtml("today");
      assert.ok(
        section.includes("Jamal muss das Ergebnis abnehmen oder zur \u00dcberarbeitung zur\u00fcckgeben."),
        "der bereinigte READY_FOR_REVIEW-Satz muss sichtbar sein",
      );
      assert.ok(
        section.includes("Jamal muss die Ausf\u00fchrung freigeben oder den Auftrag zur\u00fcckgeben."),
        "der bereinigte READY_FOR_JAMAL_APPROVAL-Satz muss sichtbar sein",
      );
      const visibleText = section.replace(/<[^>]*>/g, " ");
      assert.doesNotMatch(visibleText, /COMPLETED/, "kein technischer Statuscode COMPLETED sichtbar");
      assert.doesNotMatch(visibleText, /APPROVED_FOR_EXECUTION/, "kein technischer Statuscode APPROVED_FOR_EXECUTION sichtbar");
      // die beiden exakten Erwartungss\u00e4tze oben belegen bereits, dass kein
      // doppeltes Leerzeichen und kein Leerzeichen vor dem Satzpunkt entsteht

      // das zugrunde liegende, technische Originalfeld im Fake-Backend
      // (Stellvertreter f\u00fcr das unver\u00e4nderte Feld openDecision aus
      // buildOverview()) bleibt wortgleich erhalten
      assert.strictEqual(backendOpenDecisionByOrderId["v84-fix-review"], REAL_OPEN_DECISION_COMPLETED);
      assert.strictEqual(backendOpenDecisionByOrderId["v84-fix-approval"], REAL_OPEN_DECISION_APPROVED);
      // und ebenso das nachgeladene Overview im Client-Zustand
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["v84-fix-review"].openDecision,
        REAL_OPEN_DECISION_COMPLETED,
      );
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["v84-fix-approval"].openDecision,
        REAL_OPEN_DECISION_APPROVED,
      );
      assert.deepStrictEqual(postCalls(), [], "weiterhin kein schreibender Request");

      clearOpenDecisionOverrides();
    },
  );

  await check(
    "V8.4-Korrektur: ein normaler fachlicher Klammertext aus dem Overview bleibt in der Startkarte vollst\u00e4ndig erhalten",
    async () => {
      setOrders([
        { id: "v84-fix-normal-brackets", title: "Auftrag mit fachlichem Hinweis", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("v84-fix-normal-brackets", "Freigabe durch Jamal (Vier-Augen-Prinzip) erforderlich.");
      await reload();
      const section = sectionHtml("today");
      assert.ok(
        section.includes("Freigabe durch Jamal (Vier-Augen-Prinzip) erforderlich."),
        "ein normaler Klammertext darf nicht durch die Bereinigung besch\u00e4digt werden",
      );
      clearOpenDecisionOverrides();
    },
  );

  await check(
    "V8.4-Korrektur: null/undefined/leeres openDecision verwendet weiterhin den bestehenden Status-Fallback (keine Regression durch die Bereinigung)",
    async () => {
      setOrders([
        { id: "v84-fix-null", title: "Ohne Overview-Text (null)", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v84-fix-empty", title: "Mit leerem Overview-Text", status: "RETURNED", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("v84-fix-empty", "");
      await reload();
      const section = sectionHtml("today");
      assert.ok(
        section.includes("Der Auftrag ist blockiert und wartet auf deine Entscheidung."),
        "null openDecision f\u00e4llt weiterhin auf den BLOCKED-Fallback zur\u00fcck",
      );
      assert.ok(
        section.includes("Der Auftrag wurde zur\u00fcckgegeben und wartet auf deine n\u00e4chste Entscheidung."),
        "leeres openDecision f\u00e4llt weiterhin auf den RETURNED-Fallback zur\u00fcck",
      );
      clearOpenDecisionOverrides();
    },
  );

  await check(
    "V8.4-Korrektur: die bestehende Detailnavigation \u00fcber openOrder() bleibt von der Textbereinigung unber\u00fchrt",
    () => {
      pilotControls = backendOrders.map((order) => makePilotControl("select-order", order.id));
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      const opened = ui.openOrder("v84-fix-null");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v84-fix-null" }]);
      assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen selbst l\u00f6st weiterhin keinen weiteren Abruf aus");
    },
  );

  await check("V8.4-Korrektur: weiterhin kein schreibender Request \u00fcber den gesamten Korrekturlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------
  // V8.5 ("Entscheidungen im Chefmodus besser vorbereiten") – Empfehlung,
  // Risiko/Grenze und verfügbare Aktion je Eintrag in "Heute wichtig".
  // Nummerierung der Prüfpunkte folgt dem Arbeitspaket (TESTANFORDERUNGEN).
  // -------------------------------------------------------------------

  await check("V8.5 (1): READY_FOR_REVIEW mit bestandenem Dokumentations-Handoff zeigt die Empfehlung", async () => {
    setOrders([
      { id: "v85-rec-passed", title: "Ergebnis mit bestandenem Handoff", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-rec-passed", [makeDocumentationHandoff({ resultOrRecommendation: "Die Dokumentation empfiehlt die Freigabe." })]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(
      section.includes('<span class="chef-today-row-line-label">Empfehlung:</span>'),
      "die Empfehlungszeile muss beschriftet sichtbar sein",
    );
    assert.ok(section.includes("Die Dokumentation empfiehlt die Freigabe."));
    assert.strictEqual(ui.recommendationTextFor(ui.getState().orders[0]), "Die Dokumentation empfiehlt die Freigabe.");
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (2): READY_FOR_REVIEW ohne Dokumentations-Handoff zeigt keine Empfehlungszeile", async () => {
    setOrders([
      { id: "v85-rec-none", title: "Ergebnis ohne Handoff", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Empfehlung:/, "ohne belastbaren Handoff darf keine Empfehlungszeile erscheinen");
    assert.strictEqual(ui.recommendationTextFor(ui.getState().orders[0]), null);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (3): READY_FOR_REVIEW mit REJECTED-Handoff zeigt keine Empfehlung", async () => {
    setOrders([
      { id: "v85-rec-rejected", title: "Ergebnis mit abgelehntem Handoff", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-rec-rejected", [makeDocumentationHandoff({ pmFilterStatus: "REJECTED", resultOrRecommendation: "Abgelehnter Text." })]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Empfehlung:/);
    assert.doesNotMatch(section, /Abgelehnter Text\./);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (4): READY_FOR_REVIEW mit leerem resultOrRecommendation zeigt keine Empfehlung", async () => {
    setOrders([
      { id: "v85-rec-empty", title: "Ergebnis mit leerem Handofftext", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-rec-empty", [makeDocumentationHandoff({ resultOrRecommendation: "   " })]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Empfehlung:/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (5): BLOCKED zeigt trotz vorhandener alter Handoffs keine Empfehlung", async () => {
    setOrders([
      { id: "v85-rec-blocked", title: "Blockiert mit altem Handoff", status: "BLOCKED", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-rec-blocked", [makeDocumentationHandoff({ resultOrRecommendation: "Alte Empfehlung aus fr\u00fcherer Bearbeitungsphase." })]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Empfehlung:/);
    assert.doesNotMatch(section, /Alte Empfehlung/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (6): RETURNED zeigt trotz vorhandener alter Handoffs keine Empfehlung", async () => {
    setOrders([
      { id: "v85-rec-returned", title: "Zur\u00fcckgegeben mit altem Handoff", status: "RETURNED", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-rec-returned", [makeDocumentationHandoff({ resultOrRecommendation: "Alte Empfehlung aus fr\u00fcherer Bearbeitungsphase." })]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Empfehlung:/);
    assert.doesNotMatch(section, /Alte Empfehlung/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (7): READY_FOR_REVIEW zeigt maximal einen Risiko-/Grenztext", async () => {
    setOrders([
      { id: "v85-risk-max-one", title: "Ergebnis mit mehreren Hinweisen", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-max-one", ["Erster Hinweis.", "Zweiter Hinweis.", "Dritter Hinweis."]);
    await reload();
    const section = sectionHtml("today");
    const riskLines = section.match(/Wichtig zu beachten:/g) || [];
    assert.strictEqual(riskLines.length, 1, "es darf h\u00f6chstens ein Risiko-/Grenztext erscheinen");
    assert.ok(section.includes("Dritter Hinweis."), "der letzte Eintrag muss verwendet werden");
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (8): READY_FOR_JAMAL_APPROVAL zeigt belastbaren Risiko-/Grenztext, sofern vorhanden", async () => {
    setOrders([
      { id: "v85-risk-approval", title: "Freigabe mit Risikohinweis", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-approval", ["Die Datenbasis ist noch unvollst\u00e4ndig."]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes("Die Datenbasis ist noch unvollst\u00e4ndig."));
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (9): BLOCKED zeigt trotz risksAndLimits keinen Risiko-/Grenztext", async () => {
    setOrders([
      { id: "v85-risk-blocked", title: "Blockiert mit altem Risiko", status: "BLOCKED", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-blocked", ["Altes Risiko aus fr\u00fcherer Bearbeitungsphase."]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Wichtig zu beachten:/);
    assert.doesNotMatch(section, /Altes Risiko/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (10): RETURNED zeigt trotz risksAndLimits keinen Risiko-/Grenztext", async () => {
    setOrders([
      { id: "v85-risk-returned", title: "Zur\u00fcckgegeben mit altem Risiko", status: "RETURNED", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-returned", ["Altes Risiko aus fr\u00fcherer Bearbeitungsphase."]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Wichtig zu beachten:/);
    assert.doesNotMatch(section, /Altes Risiko/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (11): der letzte nicht leere risksAndLimits-Eintrag wird verwendet", async () => {
    setOrders([
      { id: "v85-risk-last", title: "Ergebnis mit leerem letzten Eintrag", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-last", ["Erster Hinweis.", "Letzter belastbarer Hinweis.", "   "]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes("Letzter belastbarer Hinweis."));
    assert.doesNotMatch(section, /Erster Hinweis\./);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (12): ung\u00fcltige risksAndLimits-Werte werden defensiv ignoriert", () => {
    ui.getState().todayOverviewByOrderId["v85-risk-invalid"] = {
      openDecision: null,
      nextStep: null,
      handoffs: [],
      risksAndLimits: [null, 42, {}, "   ", "Echter Hinweis."],
    };
    assert.strictEqual(ui.riskTextFor({ id: "v85-risk-invalid", status: "READY_FOR_REVIEW" }), "Echter Hinweis.");
    delete ui.getState().todayOverviewByOrderId["v85-risk-invalid"];
  });

  await check("V8.5 (13): verf\u00fcgbare Aktion RETURNED korrekt", () => {
    assert.strictEqual(ui.primaryActionLabelFor({ status: "RETURNED" }), "Erneut als Entwurf starten");
  });

  await check("V8.5 (14): verf\u00fcgbare Aktion READY_FOR_REVIEW korrekt", () => {
    assert.strictEqual(ui.primaryActionLabelFor({ status: "READY_FOR_REVIEW" }), "Ergebnis abnehmen");
  });

  await check(
    "V8.5 (15): verf\u00fcgbare Aktion BLOCKED korrekt (spiegelt wortgleich den tats\u00e4chlichen Button-Text \u201eEntsperren (zur\u00fcckgeben)\u201c)",
    () => {
      assert.strictEqual(ui.primaryActionLabelFor({ status: "BLOCKED" }), "Entsperren (zur\u00fcckgeben)");
    },
  );

  await check("V8.5 (16): verf\u00fcgbare Aktion READY_FOR_JAMAL_APPROVAL korrekt", () => {
    assert.strictEqual(ui.primaryActionLabelFor({ status: "READY_FOR_JAMAL_APPROVAL" }), "Ausf\u00fchrung freigeben");
    assert.strictEqual(ui.primaryActionLabelFor({ status: "DRAFT" }), null, "keine weiteren Statuswerte erfunden");
    assert.strictEqual(ui.primaryActionLabelFor(null), null);
  });

  await check("V8.5 (17): keine erfundene zweite Option sichtbar (genau eine verf\u00fcgbare Aktion je Eintrag)", async () => {
    setOrders([
      { id: "v85-action-returned", title: "Zur\u00fcckgegeben", status: "RETURNED", updatedAt: new Date().toISOString() },
      { id: "v85-action-review", title: "Pr\u00fcfung", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      { id: "v85-action-blocked", title: "Blockiert", status: "BLOCKED", updatedAt: new Date().toISOString() },
      { id: "v85-action-approval", title: "Freigabe", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
    ]);
    await reload();
    const section = sectionHtml("today");
    const actionLines = section.match(/Verf\u00fcgbare Aktion:/g) || [];
    assert.strictEqual(actionLines.length, 4, "genau eine verf\u00fcgbare Aktion je Eintrag, keine zweite");
    assert.ok(section.includes("Erneut als Entwurf starten"));
    assert.ok(section.includes("Ergebnis abnehmen"));
    assert.ok(section.includes("Entsperren (zur\u00fcckgeben)"));
    assert.ok(section.includes("Ausf\u00fchrung freigeben"));
    assert.doesNotMatch(section, /Optionen/, "keine Darstellung als Options-Plural");
  });

  await check("V8.5 (18): keine direkte Aktionsschaltfl\u00e4che auf der Startkarte (nur der bestehende Zeilen-Button)", () => {
    const section = sectionHtml("today");
    const rowButtons = section.match(/<button type="button" class="chef-today-row"/g) || [];
    const allButtons = section.match(/<button/g) || [];
    assert.strictEqual(rowButtons.length, allButtons.length, "es entsteht kein zweites Bedienelement je Zeile");
    assert.doesNotMatch(section, /data-action="(approve-completion|approve-for-execution|unblock-order|reopen-from-returned)"/);
  });

  await check("V8.5 (19): \u201eEntscheidung \u00f6ffnen\u201c nutzt weiterhin ausschlie\u00dflich das bestehende openOrder()", () => {
    pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    const opened = ui.openOrder("v85-action-blocked");
    assert.strictEqual(opened, true);
    assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v85-action-blocked" }]);
    assert.deepStrictEqual(fetchCalls, [], "\u201eEntscheidung \u00f6ffnen\u201c l\u00f6st selbst keinen Abruf aus");
  });

  await check("V8.5 (20): keine technischen Statuscodes im sichtbaren Text der neuen Zeilen", () => {
    const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /READY_FOR|RETURNED|BLOCKED|IN_EXECUTION/);
  });

  await check("V8.5 (21): keine IDs oder Revisionen im sichtbaren Text der neuen Zeilen", () => {
    const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /v85-action-|Rev\./);
  });

  await check("V8.5 (22): keine PM-Filter-Codes im sichtbaren Text", async () => {
    setOrders([
      { id: "v85-nofiltercode", title: "Ergebnis mit Handoff", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-nofiltercode", [makeDocumentationHandoff({ resultOrRecommendation: "Die Freigabe ist fachlich begr\u00fcndet." })]);
    await reload();
    const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /PASSED|REJECTED|pmFilterStatus|toPilotRole|DOKUMENTATION/);
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (23): normale Klammertexte in Empfehlung und Risiko bleiben erhalten", async () => {
    setOrders([
      { id: "v85-brackets", title: "Ergebnis mit fachlichem Klammertext", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-brackets", [makeDocumentationHandoff({ resultOrRecommendation: "Freigabe empfohlen (Vier-Augen-Prinzip beachtet)." })]);
    setRisksAndLimits("v85-brackets", ["Datenbasis unvollst\u00e4ndig (siehe Anhang)."]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes("Freigabe empfohlen (Vier-Augen-Prinzip beachtet)."));
    assert.ok(section.includes("Datenbasis unvollst\u00e4ndig (siehe Anhang)."));
    clearHandoffAndRiskOverrides();
  });

  await check(
    "V8.5 (24): ein fehlgeschlagener Overview-Abruf zerst\u00f6rt die Karte nicht (Empfehlung/Risiko entfallen ersatzlos)",
    async () => {
      setOrders([
        { id: "v85-fetch-fails", title: "Ergebnis mit fehlschlagendem Abruf", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      markDetailFetchFailing("v85-fetch-fails");
      fetchCalls.length = 0;
      await assert.doesNotReject(async () => reload());
      assert.strictEqual(ui.getState().error, null);
      const section = sectionHtml("today");
      assert.ok(section.includes("Ergebnis mit fehlschlagendem Abruf"));
      assert.doesNotMatch(section, /Empfehlung:/);
      assert.doesNotMatch(section, /Wichtig zu beachten:/);
      clearFailingDetailFetches();
    },
  );

  await check("V8.5 (25): die bestehende Abrufgrenze von f\u00fcnf Overviews bleibt unver\u00e4ndert", async () => {
    setOrders(
      Array.from({ length: 8 }, (unused, index) => ({
        id: `v85-limit-${index + 1}`,
        title: `Wichtiger Vorgang ${index + 1}`,
        status: "READY_FOR_REVIEW",
        updatedAt: new Date().toISOString(),
      })),
    );
    fetchCalls.length = 0;
    await reload();
    const detailCalls = fetchCalls.filter((entry) => /^\/api\/pilot-work-order\/orders\/.+/.test(entry.url));
    assert.strictEqual(ui.TODAY_OVERVIEW_FETCH_LIMIT, 5);
    assert.strictEqual(detailCalls.length, 5);
  });

  await check("V8.5 (26): alle wichtigen Auftr\u00e4ge bleiben trotz Abrufgrenze vollst\u00e4ndig sichtbar", () => {
    assert.strictEqual(rowTitles("today").length, 8);
    const section = sectionHtml("today");
    for (let index = 1; index <= 8; index += 1) {
      assert.ok(section.includes(`Wichtiger Vorgang ${index}`), `Vorgang ${index} muss sichtbar bleiben`);
    }
  });

  await check("V8.5 (28): weiterhin kein schreibender Request \u00fcber den gesamten V8.5-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  await check("V8.5 (29): Original-Overview- und Handoff-Daten werden durch die Ableitung nicht mutiert", async () => {
    const originalHandoff = makeDocumentationHandoff({ resultOrRecommendation: "Unver\u00e4nderter Ausgangstext." });
    const originalRisks = ["Unver\u00e4nderter Risikotext."];
    setOrders([
      { id: "v85-no-mutation", title: "Ergebnis ohne Mutation", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setHandoffs("v85-no-mutation", [originalHandoff]);
    setRisksAndLimits("v85-no-mutation", originalRisks);
    await reload();
    ui.recommendationTextFor(ui.getState().orders[0]);
    ui.riskTextFor(ui.getState().orders[0]);
    ui.render();
    assert.strictEqual(originalHandoff.resultOrRecommendation, "Unver\u00e4nderter Ausgangstext.");
    assert.deepStrictEqual(originalRisks, ["Unver\u00e4nderter Risikotext."]);
    assert.strictEqual(
      ui.getState().todayOverviewByOrderId["v85-no-mutation"].handoffs[0].resultOrRecommendation,
      "Unver\u00e4nderter Ausgangstext.",
    );
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (30): optionale Zeilen werden bei fehlenden Daten vollst\u00e4ndig weggelassen (kein Platzhaltertext)", async () => {
    setOrders([
      { id: "v85-no-placeholder", title: "Ergebnis ohne Empfehlung und Risiko", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Keine Empfehlung vorhanden/);
    assert.doesNotMatch(section, /Kein Risiko vorhanden/);
    assert.doesNotMatch(section, /Empfehlung:/);
    assert.doesNotMatch(section, /Wichtig zu beachten:/);
    clearHandoffAndRiskOverrides();
  });

  await check(
    "V8.5 (Begrenzung, Auftrag Abschnitt F): sehr lange Freitexte werden auf der Startkarte rein darstellend begrenzt, die reine Ableitungsfunktion liefert weiterhin den vollen Text",
    async () => {
      const longText = "Ausf\u00fchrliche Begr\u00fcndung. ".repeat(30).trim();
      assert.ok(longText.length > ui.CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT, "der Testtext muss die Anzeigegrenze tats\u00e4chlich \u00fcberschreiten");
      setOrders([
        { id: "v85-long-text", title: "Ergebnis mit sehr langem Text", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setHandoffs("v85-long-text", [makeDocumentationHandoff({ resultOrRecommendation: longText })]);
      await reload();
      assert.strictEqual(
        ui.recommendationTextFor(ui.getState().orders[0]),
        longText,
        "die reine Ableitungsfunktion liefert weiterhin den vollst\u00e4ndigen, unver\u00e4nderten Text",
      );
      const section = sectionHtml("today");
      assert.ok(!section.includes(longText), "die Anzeige selbst darf den vollen Text nicht unbegrenzt zeigen");
      assert.ok(section.includes("\u2026"), "eine gek\u00fcrzte Anzeige muss erkennbar sein (Ellipse)");
      clearHandoffAndRiskOverrides();
    },
  );

  await check("V8.5: erneut alle bereits ge\u00f6ffneten Auftragsarten (Regression) – Reihenfolge und Kategorie bleiben unver\u00e4ndert", async () => {
    setOrders([
      { id: "v85-order-returned", title: "Auftrag zur\u00fcckgegeben", status: "RETURNED", updatedAt: new Date().toISOString() },
      { id: "v85-order-review", title: "Auftrag in Pr\u00fcfung", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      { id: "v85-order-blocked", title: "Auftrag blockiert", status: "BLOCKED", updatedAt: new Date().toISOString() },
      { id: "v85-order-approval", title: "Auftrag wartet auf Freigabe", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
    ]);
    await reload();
    assert.deepStrictEqual(rowTitles("today"), [
      "Auftrag zur\u00fcckgegeben",
      "Auftrag in Pr\u00fcfung",
      "Auftrag blockiert",
      "Auftrag wartet auf Freigabe",
    ]);
    const section = sectionHtml("today");
    ["Entscheidung notwendig", "Ergebnis wartet auf Pr\u00fcfung", "Auftrag blockiert", "Freigabe erforderlich"].forEach((reason) => {
      assert.ok(section.includes(reason), `Kategorie \u201e${reason}\u201c muss weiterhin sichtbar sein`);
    });
  });

  console.log(`chef-today-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("chef-today-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
