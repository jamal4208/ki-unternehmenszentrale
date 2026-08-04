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
  let payload = null;
  if (url === "/api/pilot-work-order/orders") {
    payload = { ok: true, orders: backendOrders.map((order) => ({ ...order })) };
  } else if (url.startsWith("/api/pilot-work-order/orders/")) {
    const orderId = decodeURIComponent(url.slice("/api/pilot-work-order/orders/".length));
    const order = backendOrders.find((entry) => entry.id === orderId);
    payload = order
      ? { ok: true, overview: { order: { ...order }, status: order.status, progress: backendProgress[order.id] } }
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
    const urls = js.match(/"\/api\/[^"]*"/g) || [];
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

  console.log(`chef-today-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("chef-today-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
