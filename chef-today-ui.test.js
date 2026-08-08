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
// V8.7 Stufe C – ausschließlich lesend für die statischen Abgrenzungsprüfungen
// 49/50 unten (keine Änderung an der Pilotauftrags-Detailansicht oder am
// Service durch dieses Arbeitspaket).
const pilotUiJs = readFile("pilot-work-order-ui.js");
const pilotServiceJs = readFile("pilot-work-order-service.js");

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

// V8.9.4 – im Unterschied zum bisherigen No-Op hält dieser Stub den
// tatsächlich gebundenen Klick-Handler fest (bindActionHandlersOnce() bindet
// weiterhin genau einen einzigen "click"-Listener auf #chef-today-card,
// siehe die eigene Prüfung dazu unten). So lässt sich ein bewusster Klick
// auf den neuen, statischen "Aktuellen Stand neu laden"-Button real über
// dieselbe Delegation auslösen wie im echten Browser – ohne einen zweiten,
// eigenen Aufrufpfad im Test zu erfinden.
let chefTodayCardClickHandlerCount = 0;
let chefTodayCardClickHandler = null;
domElements["chef-today-card"] = {
  addEventListener(type, handler) {
    if (type === "click") {
      chefTodayCardClickHandlerCount += 1;
      chefTodayCardClickHandler = handler;
    }
  },
};

// V8.9.4 – bildet exakt das echte DOM-Verhalten von Element.closest() für
// ein einzelnes, bereits mit dem gesuchten Attribut versehenes Zielelement
// nach (kein Elternketten-Nachbau nötig, da der neue Button selbst das
// Attribut trägt, siehe index.html).
function makeChefTodayActionTarget(action, orderId) {
  return {
    closest(selector) {
      return selector === "[data-chef-today-action]" ? this : null;
    },
    getAttribute(name) {
      if (name === "data-chef-today-action") return action;
      if (name === "data-order-id") return orderId === undefined ? null : orderId;
      return null;
    },
  };
}

function clickChefTodayAction(action, orderId) {
  assert.ok(chefTodayCardClickHandler, "der Klick-Handler auf #chef-today-card muss gebunden sein");
  chefTodayCardClickHandler({ target: makeChefTodayActionTarget(action, orderId) });
}

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

// V8.7 Stufe C ("aktuellen Entscheidungsgrund im Chefmodus 'Heute wichtig'
// sichtbar machen") – zusätzliche, rein additive Fake-Backend-Steuerung für
// das bereits bestehende Overview-Feld `currentDecisionReason` (siehe
// pilot-work-order-service.js#buildOverview, Stufe A). Standard: kein
// Eintrag, also `null`, wie im echten Dienst ohne gespeicherten Grund.
// `decisionReasonHistory` wird – wortgleich zum echten HTTP-Vertrag –
// IMMER mitgeliefert (auch ohne currentDecisionReason-Override), damit die
// Prüfpunkte unten real nachweisen können, dass chef-today-ui.js dieses
// Feld niemals liest, niemals in den State kopiert und niemals rendert.
let backendDecisionReasonByOrderId = {};

// Fixe, von jedem currentDecisionReason-Override unabhängige Historie –
// absichtlich mit eindeutig erkennbarem, nie erwartetem Text/Zeitpunkt/
// Akteur, damit ein versehentliches Rendern oder Kopieren sofort auffällt.
const DECISION_REASON_HISTORY_FIXTURE = [
  {
    kind: "RETURN",
    text: "Historischer Testgrund einer fr\u00fcheren Revision (darf niemals im Chefmodus erscheinen).",
    setAt: "2020-01-01T00:00:00.000Z",
    setByUserId: "user-secret-history-actor",
    fromStatus: "READY_FOR_REVIEW",
    toStatus: "RETURNED",
    orderRevision: 1,
  },
];

// Fixture-Erzeugung eines Entscheidungsgrundes, wortgleich zur echten
// Feldstruktur aus pilot-work-order-service.js#rowToDecisionReasonView.
function makeDecisionReason(overrides) {
  return Object.assign(
    {
      kind: "BLOCK",
      text: "Der Blocker muss zuerst mit dem Kunden gekl\u00e4rt werden.",
      setAt: "2026-05-01T09:00:00.000Z",
      setByUserId: "user-secret-reason-actor",
      fromStatus: "IN_EXECUTION",
      toStatus: "BLOCKED",
      orderRevision: 4,
    },
    overrides || {},
  );
}

function setCurrentDecisionReason(orderId, reason) {
  backendDecisionReasonByOrderId[orderId] = reason;
}

function clearDecisionReasonOverrides() {
  backendDecisionReasonByOrderId = {};
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
            currentDecisionReason: Object.prototype.hasOwnProperty.call(backendDecisionReasonByOrderId, orderId)
              ? backendDecisionReasonByOrderId[orderId]
              : null,
            // V8.7 Stufe C: wortgleich zum echten HTTP-Vertrag immer als
            // Array vorhanden, unabhängig vom currentDecisionReason-
            // Override oben (siehe DECISION_REASON_HISTORY_FIXTURE).
            decisionReasonHistory: DECISION_REASON_HISTORY_FIXTURE,
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

// V8.8.1 ("Reihenfolge und Ruhe im Chefmodus") – im Unterschied zu
// sectionHtml() (löst aus, wenn der Bereich fehlt) prüft dies bewusst
// zerstörungsfrei, OB ein Bereich überhaupt gerendert wurde: "Läuft" und
// "Fertig" sollen im Leerzustand vollständig entfallen (siehe TESTANFOR-
// DERUNGEN 4/6).
function sectionExists(key) {
  return new RegExp(`data-chef-today-section="${key}"`).test(outputHtml());
}

// V8.8.1 – die tatsächliche Reihenfolge der gerenderten Bereiche, in der
// Reihenfolge, in der ihre data-chef-today-section-Marker im HTML
// erscheinen. Ausschließlich lesend, keine Annahme über die Anzahl der
// Bereiche (leere Bereiche fehlen bewusst, siehe renderRunningSection()/
// renderDoneSection()).
function sectionOrder() {
  const matches = outputHtml().match(/data-chef-today-section="([a-z-]+)"/g) || [];
  return matches.map((entry) => entry.match(/data-chef-today-section="([a-z-]+)"/)[1]);
}

function rowTitles(key) {
  const matches = sectionHtml(key).match(/<span class="chef-today-row-title">([^<]*)<\/span>/g) || [];
  return matches.map((entry) => entry.replace(/<[^>]+>/g, ""));
}

// V8.9.7 – zerlegt den Body von "Heute wichtig" in die einzelnen,
// vollständigen Zeilen-Buttons (nicht-gierig vom öffnenden bis zum
// zugehörigen schließenden </button>), damit der Informationsbestand JEDER
// einzelnen Zeile (nicht nur der ersten, visuell stärker geführten) geprüft
// werden kann – exakt das, was renderTodayRow() heute unverändert liefert.
function todayRowHtmlList() {
  const matches = sectionHtml("today").match(/<button type="button" class="chef-today-row"[\s\S]*?<\/button>/g) || [];
  return matches;
}

// V8.9.6 – die neue, benannte Fußzone (kein Tagesabschnitt, siehe
// renderFootActions()/Modulkopf V8.9.6): eigener Marker
// data-chef-today-foot="actions" statt data-chef-today-section, damit
// sectionHtml()/sectionExists()/sectionOrder() sie bewusst NICHT als
// Tagesabschnitt behandeln.
function footHtml() {
  const match = outputHtml().match(/<div class="chef-today-foot" data-chef-today-foot="actions">[\s\S]*?<\/div>/);
  assert.ok(match, "die Fu\u00dfzone muss gerendert sein");
  return match[0];
}

function footCount() {
  const matches = outputHtml().match(/data-chef-today-foot="actions"/g) || [];
  return matches.length;
}

// V8.9.6 – die Fußzone ist niemals Teil von sectionOrder() (kein
// data-chef-today-section), muss aber real das letzte Element innerhalb
// von #chef-today-output sein: ihr Startindex muss hinter dem des letzten
// Tagesabschnitts-Markers liegen (bzw. an Index 0 stehen, falls kein
// einziger Tagesabschnitt sichtbar ist).
function footIsLast() {
  const html = outputHtml();
  const footIndex = html.indexOf('data-chef-today-foot="actions"');
  assert.ok(footIndex > -1, "die Fu\u00dfzone muss auffindbar sein");
  const sectionIndexes = (html.match(/data-chef-today-section="[a-z-]+"/g) || []).map((marker) => html.indexOf(marker));
  const lastSectionIndex = sectionIndexes.length > 0 ? Math.max(...sectionIndexes) : -1;
  return footIndex > lastSectionIndex;
}

function postCalls() {
  return fetchCalls.filter((entry) => entry.method !== "GET");
}

// V8.9.4 – saubere Trennung zwischen den drei bestehenden Navigations-/
// Arbeitsaktionen aus chef-today-ui.js (jsChefTodayActions(), unverändert
// seit P1/V8.4/V8.5/V8.7 Stufe C) und der einen statischen Aktualisierungs-
// aktion aus index.html (htmlStaticChefTodayActions()). Die vier
// bestehenden Guard-Prüfungen zur Aktionsmenge (V8.7 Stufe C (48), V8.8.4
// (15), V8.8.5 (21/22/23/24/25), V8.9.2 (23)) nutzen ab V8.9.4 beide Helfer
// zusätzlich zueinander, damit sie nicht stillschweigend grün blieben,
// obwohl index.html inzwischen eine vierte Aktion besitzt – ein reiner
// js-Quelltextvergleich allein würde diese vierte, rein statische Aktion
// nie erfassen (siehe V8.9.4-Prüfpunkte unten).
function jsChefTodayActions() {
  return Array.from(new Set(js.match(/data-chef-today-action="([a-z-]+)"/g) || []));
}

function htmlChefTodayCardSection() {
  const match = html.match(/<section class="chef-today-card"[\s\S]*?<\/section>/);
  assert.ok(match, "die Startkarte muss in index.html auffindbar sein");
  return match[0];
}

function htmlStaticChefTodayActions() {
  return Array.from(new Set(htmlChefTodayCardSection().match(/data-chef-today-action="([a-z-]+)"/g) || []));
}

// V8.7 Stufe C – extrahiert ausschließlich die neue Grundzeile (falls
// gerendert) aus einem Abschnitts-HTML, damit data-Attribut-/Aktionsprüfungen
// nicht versehentlich den umschließenden Zeilen-Button (mit seinem
// bestehenden data-chef-today-action="open-order") treffen.
function reasonLineHtml(sectionHtmlText) {
  const match = sectionHtmlText.match(/<span class="chef-today-row-line chef-today-row-reason">[\s\S]*?<\/span><\/span>/);
  return match ? match[0] : null;
}

// V8.9.4 – lässt die von fetchStub() erzeugten, bereits aufgelösten
// Promise-Ketten (Promise.resolve()-basiert) tatsächlich durchlaufen, ohne
// wie reload() den Rückgabewert von load() zu kennen (ein realer Klick über
// clickChefTodayAction() hat, wie im echten Browser, keinen direkten Zugriff
// auf das von load() zurückgegebene Promise). setTimeout(0) läuft erst nach
// allen bereits eingereihten Microtasks – ausreichend für die hier
// verwendeten, synchron auflösenden Fake-Backend-Promises.
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  await check(
    "V8.9.5: die Auswahlfunktion bestimmt weiterhin genau eine empfohlene n\u00e4chste Arbeit, aber der Abschnitt selbst entf\u00e4llt (reine Wiederholung der ersten Zeile aus \u201eHeute wichtig\u201c)",
    () => {
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).id, "order-zurueck");
      assert.strictEqual(
        sectionExists("recommendation"),
        false,
        "die Empfehlung entspricht exakt der ersten Zeile aus \u201eHeute wichtig\u201c und tr\u00e4gt keine eigene Aussage",
      );
    },
  );

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

  await check("jeder Bereich hat h\u00f6chstens eine Hauptaktion (V8.9.6: kein Bereich mehr besitzt \u00fcberhaupt einen primary-button)", () => {
    ["today", "done", "running"].forEach((key) => {
      const buttons = sectionHtml(key).match(/class="primary-button"/g) || [];
      assert.ok(buttons.length <= 1, `Bereich ${key} h\u00e4tte ${buttons.length} Hauptaktionen`);
    });
    // V8.9.5 – in diesem Fixture (mehrere offene Entscheidungen) entf\u00e4llt
    // "recommendation" vollst\u00e4ndig (siehe oben): kein Bereich, keine
    // Hauptaktion zu pr\u00fcfen.
    assert.strictEqual(sectionExists("recommendation"), false);
    // V8.9.6 – "new-order" ist kein Bereich mehr; der gesamte Output enth\u00e4lt
    // \u00fcberhaupt keinen primary-button mehr.
    assert.strictEqual(sectionExists("new-order"), false);
    assert.doesNotMatch(outputHtml(), /class="primary-button"/);
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

  await check(
    "V8.9.5: openRecommendedWork()/\u201eopen-recommended\u201c existieren nicht mehr (totes Markup entfernt) – der von selectRecommendedNextWork() bestimmte Auftrag bleibt vollst\u00e4ndig \u00fcber seine sichtbare Zeile in \u201eHeute wichtig\u201c \u00f6ffenbar (keine Handlungsm\u00f6glichkeit verloren)",
    () => {
      assert.strictEqual(typeof ui.openRecommendedWork, "undefined", "openRecommendedWork() muss vollst\u00e4ndig entfernt sein");
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      const statusesBefore = ui.getState().orders.map((order) => order.status);
      const recommended = ui.selectRecommendedNextWork(ui.getState().orders);
      assert.strictEqual(recommended.id, "order-zurueck");
      const opened = ui.openOrder(recommended.id);
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "order-zurueck" }]);
      assert.deepStrictEqual(postCalls(), []);
      assert.deepStrictEqual(
        ui.getState().orders.map((order) => order.status),
        statusesBefore,
        "das \u00d6ffnen einer Zeile \u00e4ndert keinen Status",
      );
    },
  );

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

  await check(
    "V8.9.5 (Fall D, \u201enur l\u00e4uft\u201c): ohne entscheidungsrelevanten Vorgang bestimmt die Auswahlfunktion weiterhin genau eine laufende Arbeit, aber der Empfehlungsabschnitt entf\u00e4llt (reine Wiederholung der ersten Zeile aus \u201eL\u00e4uft\u201c)",
    () => {
      assert.deepStrictEqual(rowTitles("today"), []);
      // V8.9.3 – "Heute wichtig" trägt im Leerzustand keine eigene Aussage mehr
      // (leerer Abschnittskörper, kein Verneinungstext).
      assert.ok(!sectionHtml("today").includes('class="chef-today-empty"'));
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).title, "Laufende Arbeit 1");
      assert.strictEqual(
        sectionExists("recommendation"),
        false,
        "die Empfehlung entspricht exakt der ersten Zeile aus \u201eL\u00e4uft\u201c und tr\u00e4gt keine eigene Aussage",
      );
      assert.deepStrictEqual(rowTitles("running")[0], "Laufende Arbeit 1", "die empfohlene Arbeit bleibt vollst\u00e4ndig \u00fcber \u201eL\u00e4uft\u201c sichtbar/\u00f6ffenbar");
    },
  );

  await check(
    "V8.8.1 (1/2/3/4/5/6/7/8/9): ein leerer Tag bleibt ruhig, zeigt weiterhin Heute wichtig/Empfehlung, aber keine leeren Sektionen \u201eL\u00e4uft\u201c/\u201eFertig\u201c mehr, kein Fehler; V8.9.6: \u201eNeuer Auftrag\u201c ist kein eigener Bereich mehr, die Aktion bleibt vollst\u00e4ndig \u00fcber die Fu\u00dfzone erhalten",
    async () => {
      setOrders([]);
      await reload();
      // 1/2/3 – die zwei verbleibenden handlungsorientierten Bereiche bleiben
      // vollständig (Sektionen weiterhin gerendert). Seit V8.9.3 trägt
      // ausschließlich "Empfohlene nächste Arbeit" eine Aussage im
      // Leerzustand – siehe die dortigen V8.9.3-Prüfpunkte weiter unten.
      // V8.9.6: "Neuer Auftrag" ist kein Bereich mehr, sondern die Fußzone
      // (siehe eigene Prüfpunkte weiter unten) – die Handlungsmöglichkeit
      // selbst geht dadurch nicht verloren.
      assert.ok(!sectionHtml("today").includes('class="chef-today-empty"'));
      assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));
      assert.strictEqual(sectionExists("new-order"), false, "V8.9.6: \u201eNeuer Auftrag\u201c ist kein eigener Bereich mehr");
      assert.ok(footHtml().includes("Neuen Auftrag anlegen"), "die Aktion bleibt \u00fcber die Fu\u00dfzone vollst\u00e4ndig erhalten");
      // 4/6 – "Läuft" und "Fertig" werden im Leerzustand gar nicht gerendert.
      assert.strictEqual(sectionExists("running"), false, 'V8.8.1: die leere Sektion "L\u00e4uft" darf im Leerzustand nicht gerendert werden');
      assert.strictEqual(sectionExists("done"), false, 'V8.8.1: die leere Sektion "Fertig" darf im Leerzustand nicht gerendert werden');
      // 5/7 – die bisherigen Verneinungstexte erscheinen nirgends mehr.
      assert.ok(
        !outputHtml().includes("Gerade l\u00e4uft keine Arbeit."),
        "V8.8.1: der bisherige Verneinungstext zu \u201eL\u00e4uft\u201c darf im Leerzustand nicht mehr erscheinen",
      );
      assert.ok(
        !outputHtml().includes("Noch nichts abgeschlossen."),
        "V8.8.1: der bisherige Verneinungstext zu \u201eFertig\u201c darf im Leerzustand nicht mehr erscheinen",
      );
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders), null);
      // 8 – V8.9.6: kein primärer Startknopf mehr im Leerzustand; die
      // Fußaktion bleibt als einzige verbleibende Bedienmöglichkeit
      // (sekundär, secondary-button).
      const buttons = outputHtml().match(/class="primary-button"/g) || [];
      assert.strictEqual(buttons.length, 0, "V8.9.6: kein primary-button mehr im Chefmodus-Output");
      assert.strictEqual(footCount(), 1, "genau eine Fu\u00dfzone bleibt \u00fcbrig");
      // 9 – kein schreibender Request im Leerzustand.
      assert.deepStrictEqual(postCalls(), []);
    },
  );

  await check("\u00fcber den gesamten Ablauf wurde kein einziger schreibender Aufruf gesendet", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------
  // V8.8.1 ("Reihenfolge und Ruhe im Chefmodus") – neue Reihenfolge bei
  // vorhandenem Inhalt, unveränderter Inhalt/Navigation von "Läuft" und
  // "Fertig", sowie die beiden reinen Leerzustands-Kombinationen. Nummerierung
  // der Prüfpunkte folgt dem Arbeitspaket (TESTANFORDERUNGEN).
  // -------------------------------------------------------------------

  await check(
    "V8.8.1 (10): bei vorhandenem Inhalt steht Heute wichtig vor L\u00e4uft vor Fertig (V8.9.5: \u201eEmpfohlene n\u00e4chste Arbeit\u201c entf\u00e4llt hier, da eine offene Entscheidung vorliegt und die Empfehlung sie nur wiederholen w\u00fcrde; V8.9.6: \u201eNeuer Auftrag\u201c ist kein Bereich mehr, die Fu\u00dfaktion steht zus\u00e4tzlich und immer zuletzt)",
    async () => {
      setOrders([
        { id: "v881-today", title: "Wichtiger Auftrag", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v881-running", title: "Laufender Auftrag", status: "IN_EXECUTION" },
        { id: "v881-done", title: "Fertiger Auftrag", status: "COMPLETED" },
      ]);
      await reload();
      assert.deepStrictEqual(sectionOrder(), ["today", "running", "done"]);
      assert.strictEqual(sectionExists("recommendation"), false);
      assert.strictEqual(sectionExists("new-order"), false, "V8.9.6: \u201eNeuer Auftrag\u201c ist kein eigener Bereich mehr");
      assert.strictEqual(footCount(), 1);
      assert.ok(footIsLast(), "die Fu\u00dfzone steht hinter dem letzten Tagesabschnitt");
    },
  );

  await check(
    "V8.8.1 (11/12): \u201eL\u00e4uft\u201c erscheint vollst\u00e4ndig, wenn mindestens ein laufender Auftrag vorhanden ist; Inhalt und Navigation bleiben unver\u00e4ndert",
    () => {
      assert.deepStrictEqual(rowTitles("running"), ["Laufender Auftrag"]);
      assert.ok(sectionHtml("running").includes("1 von 3 Rollen abgeschlossen"));
      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      const opened = ui.openOrder("v881-running");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v881-running" }]);
      assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen einer laufenden Zeile l\u00f6st keinen weiteren Abruf aus");
    },
  );

  await check(
    "V8.8.1 (13/14): \u201eFertig\u201c erscheint vollst\u00e4ndig, wenn mindestens ein abgeschlossener Auftrag vorhanden ist; Inhalt und Navigation bleiben unver\u00e4ndert",
    () => {
      assert.deepStrictEqual(rowTitles("done"), ["Fertiger Auftrag"]);
      assert.ok(sectionHtml("done").includes(STATUS_LABELS.COMPLETED));
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      const opened = ui.openOrder("v881-done");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v881-done" }]);
      assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen einer fertigen Zeile l\u00f6st keinen weiteren Abruf aus");
    },
  );

  await check("V8.8.1 (17): mehrfaches Rendern liefert eine konsistente Reihenfolge", () => {
    const first = outputHtml();
    ui.render();
    ui.render();
    const second = outputHtml();
    assert.strictEqual(first, second);
    // V8.9.5 – weiterhin dieselbe Fixture wie V8.8.1 (10) (offene Entscheidung
    // vorhanden), deshalb bleibt "recommendation" konsistent abwesend.
    // V8.9.6 – "new-order" ist kein Bereich mehr; die Fußzone bleibt bei
    // mehrfachem Rendern konsistent genau einmal und zuletzt.
    assert.deepStrictEqual(sectionOrder(), ["today", "running", "done"]);
    assert.strictEqual(footCount(), 1, "kein Doppel- oder Restcontainer nach mehrfachem Rendern");
    assert.ok(footIsLast());
  });

  await check('V8.8.1 (15): nur laufender Inhalt zeigt "L\u00e4uft", aber nicht "Fertig"', async () => {
    setOrders([{ id: "v881-only-running", title: "Nur laufend", status: "IN_EXECUTION" }]);
    await reload();
    assert.strictEqual(sectionExists("running"), true);
    assert.strictEqual(sectionExists("done"), false);
  });

  await check('V8.8.1 (16): nur abgeschlossener Inhalt zeigt "Fertig", aber nicht "L\u00e4uft"', async () => {
    setOrders([{ id: "v881-only-done", title: "Nur fertig", status: "COMPLETED" }]);
    await reload();
    assert.strictEqual(sectionExists("done"), true);
    assert.strictEqual(sectionExists("running"), false);
  });

  await check("V8.8.1 (24): die neue Darstellung mutiert keine Auftragsdaten", () => {
    const before = ui.getState().orders.map((order) => `${order.id}:${order.status}`);
    ui.render();
    ui.render();
    assert.deepStrictEqual(
      ui.getState().orders.map((order) => `${order.id}:${order.status}`),
      before,
    );
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
  //
  // Sprachpaket A: buildOverview() liefert diese beiden Wortlaute inzwischen
  // nicht mehr; die Statuscodes sind bereits an der Quelle entfernt. Der
  // Filter bleibt trotzdem bestehen und wird hier unver\u00e4ndert
  // weitergepr\u00fcft, damit die Chefmodus-Ebene auch gegen einen sp\u00e4teren
  // R\u00fcckfall technischer Zus\u00e4tze abgesichert bleibt. Die Konstanten hei\u00dfen
  // deshalb jetzt LEGACY_*. Die neue Produktsprache wird direkt darunter
  // zus\u00e4tzlich gepr\u00fcft.
  // -------------------------------------------------------------------

  const LEGACY_OPEN_DECISION_COMPLETED =
    "Jamal muss das Ergebnis abnehmen (COMPLETED) oder zur \u00dcberarbeitung zur\u00fcckgeben.";
  const LEGACY_OPEN_DECISION_APPROVED =
    "Jamal muss die Ausf\u00fchrung freigeben (APPROVED_FOR_EXECUTION) oder den Auftrag zur\u00fcckgeben.";

  await check(
    "V8.4-Korrektur: sanitizeChefDecisionText() entfernt bekannte technische Zus\u00e4tze, l\u00e4sst normale Klammertexte und unbekannte Texte unver\u00e4ndert (isolierte Funktionspr\u00fcfung)",
    () => {
      assert.strictEqual(
        ui.sanitizeChefDecisionText(LEGACY_OPEN_DECISION_COMPLETED),
        "Jamal muss das Ergebnis abnehmen oder zur \u00dcberarbeitung zur\u00fcckgeben.",
      );
      assert.strictEqual(
        ui.sanitizeChefDecisionText(LEGACY_OPEN_DECISION_APPROVED),
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
      const original = LEGACY_OPEN_DECISION_COMPLETED;
      ui.sanitizeChefDecisionText(original);
      assert.strictEqual(original, LEGACY_OPEN_DECISION_COMPLETED);
    },
  );

  await check(
    "V8.4-Korrektur: whyTextFor() zeigt historische openDecision-Texte mit (COMPLETED)/(APPROVED_FOR_EXECUTION) bereinigt an (isolierte Funktionspr\u00fcfung)",
    () => {
      ui.getState().todayOverviewByOrderId["v84-fix-review-unit"] = {
        openDecision: LEGACY_OPEN_DECISION_COMPLETED,
        nextStep: null,
      };
      assert.strictEqual(
        ui.whyTextFor({ id: "v84-fix-review-unit", status: "READY_FOR_REVIEW" }),
        "Jamal muss das Ergebnis abnehmen oder zur \u00dcberarbeitung zur\u00fcckgeben.",
      );
      delete ui.getState().todayOverviewByOrderId["v84-fix-review-unit"];

      ui.getState().todayOverviewByOrderId["v84-fix-approval-unit"] = {
        openDecision: LEGACY_OPEN_DECISION_APPROVED,
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
    "V8.4-Korrektur: historische, wortgleiche openDecision-Texte aus dem Fake-Backend erscheinen in der Startkarte ohne technischen Statuscode, das technische Originalfeld bleibt unangetastet",
    async () => {
      setOrders([
        { id: "v84-fix-review", title: "Ergebnis liegt wirklich vor", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
        { id: "v84-fix-approval", title: "Freigabe wartet wirklich", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("v84-fix-review", LEGACY_OPEN_DECISION_COMPLETED);
      setOpenDecision("v84-fix-approval", LEGACY_OPEN_DECISION_APPROVED);
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
      assert.strictEqual(backendOpenDecisionByOrderId["v84-fix-review"], LEGACY_OPEN_DECISION_COMPLETED);
      assert.strictEqual(backendOpenDecisionByOrderId["v84-fix-approval"], LEGACY_OPEN_DECISION_APPROVED);
      // und ebenso das nachgeladene Overview im Client-Zustand
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["v84-fix-review"].openDecision,
        LEGACY_OPEN_DECISION_COMPLETED,
      );
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["v84-fix-approval"].openDecision,
        LEGACY_OPEN_DECISION_APPROVED,
      );
      assert.deepStrictEqual(postCalls(), [], "weiterhin kein schreibender Request");

      clearOpenDecisionOverrides();
    },
  );

  // -------------------------------------------------------------------
  // Sprachpaket A – die bereinigte Produktsprache aus buildOverview() muss
  // im Chefmodus unver\u00e4ndert und vollst\u00e4ndig ankommen. Die Wortlaute
  // werden zus\u00e4tzlich gegen den echten Dienstquelltext verankert, damit
  // diese Pr\u00fcfung nicht wie die urspr\u00fcnglichen V8.4-Tests von der Quelle
  // abdriften kann.
  // -------------------------------------------------------------------

  const NEW_OPEN_DECISION_REVIEW =
    "Du musst das Ergebnis abnehmen oder den Auftrag zur \u00dcberarbeitung zur\u00fcckgeben.";
  const NEW_OPEN_DECISION_APPROVAL =
    "Du musst die Ausf\u00fchrung freigeben oder den Auftrag zur \u00dcberarbeitung zur\u00fcckgeben.";
  const NEW_OPEN_DECISION_BLOCKED =
    "Du musst die Blockade kl\u00e4ren, bevor der Pilotlauf fortgesetzt werden kann.";

  await check(
    "Sprachpaket A: die drei bereinigten openDecision-Wortlaute stehen wortgleich im echten Dienst (Schutz gegen Abdriften dieser Testfixturen)",
    () => {
      for (const text of [NEW_OPEN_DECISION_REVIEW, NEW_OPEN_DECISION_APPROVAL, NEW_OPEN_DECISION_BLOCKED]) {
        assert.ok(
          pilotServiceJs.includes(text),
          "pilot-work-order-service.js muss den Wortlaut wortgleich enthalten: " + text,
        );
      }
    },
  );

  await check(
    "Sprachpaket A: die bereinigten openDecision-Texte erscheinen im Chefmodus vollst\u00e4ndig, unver\u00e4ndert und ohne technische Reste",
    async () => {
      setOrders([
        { id: "sprachpaket-a-review", title: "Ergebnis liegt vor", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
        { id: "sprachpaket-a-approval", title: "Freigabe wartet", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
        { id: "sprachpaket-a-blocked", title: "Auftrag steht", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setOpenDecision("sprachpaket-a-review", NEW_OPEN_DECISION_REVIEW);
      setOpenDecision("sprachpaket-a-approval", NEW_OPEN_DECISION_APPROVAL);
      setOpenDecision("sprachpaket-a-blocked", NEW_OPEN_DECISION_BLOCKED);
      fetchCalls.length = 0;
      await reload();

      const section = sectionHtml("today");
      // der Filter darf die neue Sprache nicht anfassen: Wortlaut identisch
      assert.ok(section.includes(NEW_OPEN_DECISION_REVIEW), "der READY_FOR_REVIEW-Satz muss wortgleich sichtbar sein");
      assert.ok(section.includes(NEW_OPEN_DECISION_APPROVAL), "der READY_FOR_JAMAL_APPROVAL-Satz muss wortgleich sichtbar sein");
      assert.ok(section.includes(NEW_OPEN_DECISION_BLOCKED), "der BLOCKED-Satz muss wortgleich sichtbar sein");

      const visibleText = section.replace(/<[^>]*>/g, " ");
      assert.doesNotMatch(visibleText, /APPROVED_FOR_EXECUTION/, "kein technischer Statuscode sichtbar");
      assert.doesNotMatch(visibleText, /approveForExecution|approveCompletion|unblockOrder/, "kein interner Funktionsname sichtbar");
      assert.doesNotMatch(visibleText, /confirmed:\s*true/, "keine interne Parameterschreibweise sichtbar");
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
  // Teilpaket 1 ("Historischen decisionNeeded-Text nicht mehr als aktuelle
  // Entscheidung anzeigen") – Regressionsschutz für den Chefmodus, der in
  // diesem Paket bewusst KEINE eigene Codeänderung erhalten hat.
  //
  // Bis zu dieser Korrektur lieferte der Server für einen zurückgegebenen
  // Auftrag den historischen `decisionNeeded`-Text einer alten Rollenübergabe
  // als `openDecision` – der Chefmodus zeigte ihn dadurch wortwörtlich als
  // "Zu entscheiden" an, obwohl die Rückgabe längst erfolgt war. Der Server
  // liefert jetzt `null` (nachgewiesen in pilot-work-order.test.js#TP1-4),
  // und genau das ist hier der Vorgabewert des Fake-Backends. Geprüft wird
  // deshalb, was der Chefmodus aus dieser korrigierten Antwort macht: sein
  // bereits vorhandener fachlicher RETURNED-Satz bleibt wirksam, der
  // aktuelle Rückgabegrund bleibt sichtbar, und der Handofftext taucht an
  // keiner Stelle der Zeile auf.
  // -------------------------------------------------------------------

  await check(
    "TP1: RETURNED zeigt keinen historischen Handoff-Text als aktuelle Entscheidung; RETURNED-Fallback und aktueller R\u00fcckgabegrund bleiben wirksam",
    async () => {
      const historicDecisionNeeded =
        "Jamal entscheidet \u00fcber den Abschluss dieses Pilotlaufs oder gibt ihn zur \u00dcberarbeitung zur\u00fcck.";
      const returnReason = "Zur\u00fcckgegeben: die Quellenangaben im Ergebnis sind noch nicht belastbar.";
      setOrders([
        { id: "tp1-returned", title: "Zur\u00fcckgegeben mit altem Entscheidungstext", status: "RETURNED", updatedAt: new Date().toISOString() },
      ]);
      setHandoffs("tp1-returned", [makeDocumentationHandoff({ decisionNeeded: historicDecisionNeeded })]);
      setCurrentDecisionReason(
        "tp1-returned",
        makeDecisionReason({ kind: "RETURN", text: returnReason, fromStatus: "READY_FOR_REVIEW", toStatus: "RETURNED" }),
      );
      await reload();

      const section = sectionHtml("today");
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["tp1-returned"].openDecision,
        null,
        "der Server liefert f\u00fcr RETURNED keine offene Entscheidung mehr",
      );
      assert.ok(
        section.includes("Der Auftrag wurde zur\u00fcckgegeben und wartet auf deine n\u00e4chste Entscheidung."),
        "der bestehende fachliche RETURNED-Fallback bleibt unver\u00e4ndert wirksam",
      );
      assert.ok(!section.includes("Jamal entscheidet"), "der historische Handofftext darf nirgends als aktuelle Entscheidung erscheinen");
      assert.ok(!section.includes("Pilotlaufs"), "auch kein Bruchst\u00fcck des historischen Textes darf erscheinen");
      assert.ok(section.includes("Warum zur\u00fcckgegeben?"), "der aktuelle R\u00fcckgabegrund bleibt unver\u00e4ndert beschriftet");
      assert.ok(section.includes(returnReason), "der aktuelle R\u00fcckgabegrund bleibt unver\u00e4ndert sichtbar");
      assert.deepStrictEqual(postCalls(), [], "diese Pr\u00fcfung bleibt vollst\u00e4ndig lesend");

      clearHandoffAndRiskOverrides();
      clearDecisionReasonOverrides();
    },
  );

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

  await check("V8.5 (7): READY_FOR_REVIEW zeigt maximal einen Risiko-/Grenztext (V8.8.5: als fester Kurztext, kein Volltext auf Ebene 1)", async () => {
    setOrders([
      { id: "v85-risk-max-one", title: "Ergebnis mit mehreren Hinweisen", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-max-one", ["Erster Hinweis.", "Zweiter Hinweis.", "Dritter Hinweis."]);
    await reload();
    const section = sectionHtml("today");
    const riskLines = section.match(/Wichtig zu beachten:/g) || [];
    assert.strictEqual(riskLines.length, 1, "es darf h\u00f6chstens ein Risiko-/Grenztext erscheinen");
    assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT), "der feste Kurztext muss erscheinen");
    assert.ok(!section.includes("Dritter Hinweis."), "der Volltext des letzten Eintrags darf auf Ebene 1 nicht mehr erscheinen");
    assert.strictEqual(ui.riskTextFor(ui.getState().orders[0]), "Dritter Hinweis.", "die reine Ableitungsfunktion liefert weiterhin den letzten Eintrag vollst\u00e4ndig");
    clearHandoffAndRiskOverrides();
  });

  await check("V8.5 (8): READY_FOR_JAMAL_APPROVAL zeigt belastbaren Risiko-/Grenztext, sofern vorhanden (V8.8.5: als fester Kurztext)", async () => {
    setOrders([
      { id: "v85-risk-approval", title: "Freigabe mit Risikohinweis", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-approval", ["Die Datenbasis ist noch unvollst\u00e4ndig."]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
    assert.ok(!section.includes("Die Datenbasis ist noch unvollst\u00e4ndig."), "der Volltext darf auf Ebene 1 nicht mehr erscheinen");
    assert.strictEqual(ui.riskTextFor(ui.getState().orders[0]), "Die Datenbasis ist noch unvollst\u00e4ndig.");
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

  await check("V8.5 (11): der letzte nicht leere risksAndLimits-Eintrag wird verwendet (V8.8.5: die reine Ableitungsfunktion liefert ihn vollständig, Ebene 1 zeigt nur den Kurztext)", async () => {
    setOrders([
      { id: "v85-risk-last", title: "Ergebnis mit leerem letzten Eintrag", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
    ]);
    setRisksAndLimits("v85-risk-last", ["Erster Hinweis.", "Letzter belastbarer Hinweis.", "   "]);
    await reload();
    assert.strictEqual(ui.riskTextFor(ui.getState().orders[0]), "Letzter belastbarer Hinweis.");
    const section = sectionHtml("today");
    assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
    assert.doesNotMatch(section, /Letzter belastbarer Hinweis\./);
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

  // V8.8.4 ("Verf\u00fcgbare Aktion aus 'Heute wichtig' entfernen"): die vier
  // isolierten V8.5-Pr\u00fcfpunkte (13)\u2013(16) f\u00fcr die inzwischen entfernte
  // Funktion primaryActionLabelFor() entfallen ersatzlos (siehe Auftrag
  // V8.8.4, TESTANFORDERUNGEN) \u2013 die Funktion und ihre Konstante
  // PRIMARY_ACTION_LABEL_BY_STATUS existieren nicht mehr. (17) pr\u00fcft jetzt
  // stattdessen das Gegenteil des urspr\u00fcnglichen V8.5-Befunds: keine der
  // vier ehemaligen Aktionsbeschriftungen und keine Zeile "Verf\u00fcgbare
  // Aktion" erscheint mehr auf Ebene 1. Die Auftrags-IDs bleiben
  // unver\u00e4ndert (v85-action-blocked wird von V8.5 (19) weiterhin
  // verwendet).
  await check(
    "V8.8.4 (17): keine Zeile \u201eVerf\u00fcgbare Aktion\u201c und keiner der vier ehemaligen Aktionstexte mehr auf Ebene 1",
    async () => {
      setOrders([
        { id: "v85-action-returned", title: "Zur\u00fcckgegeben", status: "RETURNED", updatedAt: new Date().toISOString() },
        { id: "v85-action-review", title: "Pr\u00fcfung", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
        { id: "v85-action-blocked", title: "Blockiert", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v85-action-approval", title: "Freigabe", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
      ]);
      await reload();
      const section = sectionHtml("today");
      assert.doesNotMatch(section, /Verf\u00fcgbare Aktion/, "die Zeile \u201eVerf\u00fcgbare Aktion\u201c darf nicht mehr erscheinen");
      assert.doesNotMatch(section, /chef-today-row-action/, "die zugeh\u00f6rige CSS-Klasse darf nicht mehr gerendert werden");
      assert.doesNotMatch(section, /Erneut als Entwurf starten/);
      assert.doesNotMatch(section, /Ergebnis abnehmen/);
      assert.doesNotMatch(section, /Entsperren \(zur\u00fcckgeben\)/);
      assert.doesNotMatch(section, /Ausf\u00fchrung freigeben/);
    },
  );

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

  await check(
    "V8.5 (23): normale Klammertexte in Empfehlung bleiben auf Ebene 1 erhalten; im Risikotext bleiben sie in der reinen Ableitungsfunktion erhalten (V8.8.5: Ebene 1 zeigt nur den Kurztext)",
    async () => {
      setOrders([
        { id: "v85-brackets", title: "Ergebnis mit fachlichem Klammertext", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setHandoffs("v85-brackets", [makeDocumentationHandoff({ resultOrRecommendation: "Freigabe empfohlen (Vier-Augen-Prinzip beachtet)." })]);
      setRisksAndLimits("v85-brackets", ["Datenbasis unvollst\u00e4ndig (siehe Anhang)."]);
      await reload();
      const section = sectionHtml("today");
      assert.ok(section.includes("Freigabe empfohlen (Vier-Augen-Prinzip beachtet)."));
      assert.strictEqual(ui.riskTextFor(ui.getState().orders[0]), "Datenbasis unvollst\u00e4ndig (siehe Anhang).");
      assert.ok(!section.includes("Datenbasis unvollst\u00e4ndig (siehe Anhang)."), "der Risiko-Volltext darf auf Ebene 1 nicht mehr erscheinen");
      assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
      clearHandoffAndRiskOverrides();
    },
  );

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

  // -------------------------------------------------------------------
  // V8.7 Stufe C ("aktuellen Entscheidungsgrund im Chefmodus 'Heute
  // wichtig' sichtbar machen") – die neue, optionale Grundzeile direkt
  // unter "Zu entscheiden". Nummerierung der Prüfpunkte folgt dem
  // Arbeitspaket (TESTANFORDERUNGEN 1–50).
  // -------------------------------------------------------------------

  await check(
    "V8.7 Stufe C (1/2/5): BLOCKED mit aktuellem Grund zeigt „Warum blockiert?“, den konkreten Grundtext, „Zu entscheiden“ bleibt zusätzlich sichtbar",
    async () => {
      setOrders([
        { id: "v87c-blocked", title: "Auftrag mit gespeichertem Blockiergrund", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason(
        "v87c-blocked",
        makeDecisionReason({ kind: "BLOCK", text: "Der Kunde muss zuerst die fehlenden Unterlagen liefern." }),
      );
      await reload();
      const section = sectionHtml("today");
      assert.ok(section.includes('<span class="chef-today-row-line-label">Warum blockiert?</span>'));
      assert.ok(section.includes("Der Kunde muss zuerst die fehlenden Unterlagen liefern."));
      assert.ok(
        section.includes('<span class="chef-today-row-line-label">Zu entscheiden:</span>'),
        "„Zu entscheiden“ bleibt zusätzlich sichtbar, wird nicht ersetzt",
      );
      clearDecisionReasonOverrides();
    },
  );

  await check(
    "V8.7 Stufe C (3/4/5): RETURNED mit aktuellem Grund zeigt „Warum zurückgegeben?“, den konkreten Grundtext, „Zu entscheiden“ bleibt zusätzlich sichtbar",
    async () => {
      setOrders([
        { id: "v87c-returned", title: "Auftrag mit gespeichertem Rückgabegrund", status: "RETURNED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason(
        "v87c-returned",
        makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED", text: "Das Ergebnis erfüllt noch nicht die vereinbarten Kriterien." }),
      );
      await reload();
      const section = sectionHtml("today");
      assert.ok(section.includes('<span class="chef-today-row-line-label">Warum zurückgegeben?</span>'));
      assert.ok(section.includes("Das Ergebnis erfüllt noch nicht die vereinbarten Kriterien."));
      assert.ok(section.includes('<span class="chef-today-row-line-label">Zu entscheiden:</span>'));
      clearDecisionReasonOverrides();
    },
  );

  // ---------------------------------------------------------------------
  // V8.7 Stufe C – Browserabnahme-Korrektur ("Warum blockiert?:"/"Warum
  // zurückgegeben?:" statt "Warum blockiert?"/"Warum zurückgegeben?"):
  // renderTodayRowLine() hängt an ein bereits mit "?" endendes Label keinen
  // zusätzlichen Doppelpunkt mehr an. Bestehende Labels ohne "?" ("Zu
  // entscheiden", "Empfehlung", "Wichtig zu beachten") behalten ihren
  // Doppelpunkt unverändert.
  // ---------------------------------------------------------------------

  await check('sichtbar exakt „Warum blockiert?“ – kein zusätzlicher Doppelpunkt nach dem Fragezeichen', async () => {
    setOrders([{ id: "v87c-label-blocked", title: "Auftrag", status: "BLOCKED", updatedAt: new Date().toISOString() }]);
    setCurrentDecisionReason("v87c-label-blocked", makeDecisionReason({ kind: "BLOCK", text: "Kurzer Grund." }));
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-line-label">Warum blockiert?</span>'));
    assert.doesNotMatch(section, /Warum blockiert\?:/);
    clearDecisionReasonOverrides();
  });

  await check('sichtbar exakt „Warum zurückgegeben?“ – kein zusätzlicher Doppelpunkt nach dem Fragezeichen', async () => {
    setOrders([{ id: "v87c-label-returned", title: "Auftrag", status: "RETURNED", updatedAt: new Date().toISOString() }]);
    setCurrentDecisionReason("v87c-label-returned", makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED", text: "Kurzer Grund." }));
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-line-label">Warum zurückgegeben?</span>'));
    assert.doesNotMatch(section, /Warum zurückgegeben\?:/);
    clearDecisionReasonOverrides();
  });

  await check('„Warum blockiert?:“ kommt im gesamten „Heute wichtig“-Abschnitt nicht vor', async () => {
    setOrders([
      { id: "v87c-label-blocked-scan", title: "Auftrag", status: "BLOCKED", updatedAt: new Date().toISOString() },
      { id: "v87c-label-returned-scan", title: "Auftrag", status: "RETURNED", updatedAt: new Date().toISOString() },
    ]);
    setCurrentDecisionReason("v87c-label-blocked-scan", makeDecisionReason({ kind: "BLOCK", text: "Grund A." }));
    setCurrentDecisionReason("v87c-label-returned-scan", makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED", text: "Grund B." }));
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Warum blockiert\?:/);
    clearDecisionReasonOverrides();
  });

  await check('„Warum zurückgegeben?:“ kommt im gesamten „Heute wichtig“-Abschnitt nicht vor', async () => {
    setOrders([
      { id: "v87c-label-blocked-scan-2", title: "Auftrag", status: "BLOCKED", updatedAt: new Date().toISOString() },
      { id: "v87c-label-returned-scan-2", title: "Auftrag", status: "RETURNED", updatedAt: new Date().toISOString() },
    ]);
    setCurrentDecisionReason("v87c-label-blocked-scan-2", makeDecisionReason({ kind: "BLOCK", text: "Grund A." }));
    setCurrentDecisionReason("v87c-label-returned-scan-2", makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED", text: "Grund B." }));
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Warum zurückgegeben\?:/);
    clearDecisionReasonOverrides();
  });

  await check('„Zu entscheiden:“ bleibt durch die Label-Korrektur unverändert (weiterhin mit Doppelpunkt)', async () => {
    setOrders([{ id: "v87c-label-decision-unchanged", title: "Auftrag", status: "BLOCKED", updatedAt: new Date().toISOString() }]);
    setCurrentDecisionReason("v87c-label-decision-unchanged", makeDecisionReason({ kind: "BLOCK", text: "Grund." }));
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-line-label">Zu entscheiden:</span>'));
    clearDecisionReasonOverrides();
  });

  await check('„Empfehlung:“ bleibt durch die Label-Korrektur unverändert (weiterhin mit Doppelpunkt)', async () => {
    setOrders([{ id: "v87c-label-recommendation-unchanged", title: "Auftrag", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() }]);
    setHandoffs("v87c-label-recommendation-unchanged", [makeDocumentationHandoff({ resultOrRecommendation: "Empfehlungstext." })]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-line-label">Empfehlung:</span>'));
    clearHandoffAndRiskOverrides();
  });

  await check('„Wichtig zu beachten:“ bleibt durch die Label-Korrektur unverändert (weiterhin mit Doppelpunkt)', async () => {
    setOrders([{ id: "v87c-label-risk-unchanged", title: "Auftrag", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() }]);
    setRisksAndLimits("v87c-label-risk-unchanged", ["Ein Restrisiko."]);
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-line-label">Wichtig zu beachten:</span>'));
    clearHandoffAndRiskOverrides();
  });

  await check(
    "V8.7 Stufe C (6/7/8/9/14): ein anderer Status (READY_FOR_REVIEW) zeigt keine Grundzeile; Empfehlung und Risiko bleiben unabhängig vom Grundtext",
    async () => {
      setOrders([
        { id: "v87c-review-inconsistent", title: "Ergebnis mit inkonsistentem Grund", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setHandoffs("v87c-review-inconsistent", [makeDocumentationHandoff({ resultOrRecommendation: "Die Dokumentation empfiehlt die Freigabe." })]);
      setRisksAndLimits("v87c-review-inconsistent", ["Ein Restrisiko bleibt bestehen."]);
      setCurrentDecisionReason(
        "v87c-review-inconsistent",
        makeDecisionReason({ text: "Ein Grund, der bei diesem Status nie erscheinen darf." }),
      );
      await reload();
      const order = ui.getState().orders[0];
      const section = sectionHtml("today");
      assert.doesNotMatch(section, /Warum blockiert\?|Warum zurückgegeben\?/);
      assert.ok(!section.includes("Ein Grund, der bei diesem Status nie erscheinen darf."));
      assert.strictEqual(ui.decisionReasonTextFor(order), null, "der Status-Schutz gilt auch isoliert (nur BLOCKED/RETURNED)");
      assert.strictEqual(ui.recommendationTextFor(order), "Die Dokumentation empfiehlt die Freigabe.", "Empfehlung bleibt unabhängig sichtbar");
      assert.strictEqual(ui.riskTextFor(order), "Ein Restrisiko bleibt bestehen.", "Risiko/Grenze bleibt unabhängig als reine Ableitungsfunktion sichtbar");
      assert.ok(section.includes("Die Dokumentation empfiehlt die Freigabe."));
      assert.ok(!section.includes("Ein Restrisiko bleibt bestehen."), "V8.8.5: der Risiko-Volltext darf auf Ebene 1 nicht mehr erscheinen");
      assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
      clearHandoffAndRiskOverrides();
      clearDecisionReasonOverrides();
    },
  );

  await check(
    "V8.7 Stufe C (10/12/13): BLOCKED/RETURNED ohne gespeicherten Grund (currentDecisionReason null) zeigt keine Grundzeile und nichts Erfundenes",
    async () => {
      setOrders([
        { id: "v87c-blocked-no-reason", title: "Blockiert ohne gespeicherten Grund", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v87c-returned-no-reason", title: "Zurückgegeben ohne gespeicherten Grund", status: "RETURNED", updatedAt: new Date().toISOString() },
      ]);
      await reload();
      const section = sectionHtml("today");
      assert.doesNotMatch(section, /Warum blockiert\?/);
      assert.doesNotMatch(section, /Warum zurückgegeben\?/);
      assert.ok(
        section.includes("Der Auftrag ist blockiert und wartet auf deine Entscheidung."),
        "die bestehende Fallback-Zeile bleibt der einzige Text, kein Ersatz erfunden",
      );
      assert.ok(section.includes("Der Auftrag wurde zurückgegeben und wartet auf deine nächste Entscheidung."));
    },
  );

  await check("V8.7 Stufe C (11): currentDecisionReason undefined zerstört die Karte nicht (isolierte Funktionsprüfung)", () => {
    ui.getState().todayOverviewByOrderId["v87c-undefined-unit"] = {
      openDecision: null,
      nextStep: null,
      handoffs: [],
      risksAndLimits: [],
      currentDecisionReason: undefined,
    };
    assert.doesNotThrow(() => ui.decisionReasonTextFor({ id: "v87c-undefined-unit", status: "BLOCKED" }));
    assert.strictEqual(ui.decisionReasonTextFor({ id: "v87c-undefined-unit", status: "BLOCKED" }), null);
    delete ui.getState().todayOverviewByOrderId["v87c-undefined-unit"];
  });

  await check(
    "V8.7 Stufe C (15): ein inkonsistenter DRAFT-Auftrag mit currentDecisionReason zeigt keine Grundzeile (isolierte Funktionsprüfung)",
    () => {
      ui.getState().todayOverviewByOrderId["v87c-draft-unit"] = {
        openDecision: null,
        nextStep: null,
        handoffs: [],
        risksAndLimits: [],
        currentDecisionReason: makeDecisionReason({ text: "Grund bei einem Entwurf – darf nie erscheinen." }),
      };
      assert.strictEqual(ui.decisionReasonTextFor({ id: "v87c-draft-unit", status: "DRAFT" }), null);
      delete ui.getState().todayOverviewByOrderId["v87c-draft-unit"];
    },
  );

  await check("V8.7 Stufe C (16): decisionReasonHistory wird nirgends gerendert", async () => {
    setOrders([
      { id: "v87c-history-hidden", title: "Auftrag mit Historie im Rohvertrag", status: "BLOCKED", updatedAt: new Date().toISOString() },
    ]);
    setCurrentDecisionReason("v87c-history-hidden", makeDecisionReason());
    await reload();
    const visible = outputHtml();
    assert.ok(!visible.includes("Historischer Testgrund"), "der Historientext darf niemals erscheinen");
    assert.ok(!visible.includes("user-secret-history-actor"));
    clearDecisionReasonOverrides();
  });

  await check("V8.7 Stufe C (17): decisionReasonHistory wird nicht in den Chefmodus-State kopiert", async () => {
    setOrders([
      { id: "v87c-history-state", title: "Auftrag mit Historie im Rohvertrag", status: "RETURNED", updatedAt: new Date().toISOString() },
    ]);
    setCurrentDecisionReason("v87c-history-state", makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED" }));
    await reload();
    const entry = ui.getState().todayOverviewByOrderId["v87c-history-state"];
    assert.ok(entry, "der Overview-Eintrag muss vorhanden sein");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(entry, "decisionReasonHistory"),
      false,
      "decisionReasonHistory darf nicht in den Chefmodus-State übernommen werden",
    );
    clearDecisionReasonOverrides();
  });

  await check(
    "V8.7 Stufe C (18/19/20/21/22): setAt, setByUserId, fromStatus und orderRevision sind im sichtbaren Text nicht enthalten",
    async () => {
      setOrders([
        { id: "v87c-rawfields", title: "Auftrag mit vollständigem Rohvertrag", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason(
        "v87c-rawfields",
        makeDecisionReason({
          setAt: "2026-06-15T08:30:00.000Z",
          setByUserId: "user-secret-visible-check",
          fromStatus: "IN_EXECUTION",
          toStatus: "BLOCKED",
          orderRevision: 9,
        }),
      );
      await reload();
      const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
      assert.doesNotMatch(visibleText, /2026-06-15/);
      assert.doesNotMatch(visibleText, /user-secret-visible-check/);
      assert.doesNotMatch(visibleText, /IN_EXECUTION/);
      assert.doesNotMatch(visibleText, /\bBLOCKED\b/);
      assert.doesNotMatch(visibleText, /\b9\b/);
      clearDecisionReasonOverrides();
    },
  );

  await check(
    "V8.7 Stufe C (23/24): die rohen Werte BLOCK/RETURN erscheinen nicht als eigenständige Token im sichtbaren Text",
    async () => {
      setOrders([
        { id: "v87c-raw-block", title: "Auftrag mit Blockiergrund", status: "BLOCKED", updatedAt: new Date().toISOString() },
        { id: "v87c-raw-return", title: "Auftrag mit Rückgabegrund", status: "RETURNED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason("v87c-raw-block", makeDecisionReason({ kind: "BLOCK" }));
      setCurrentDecisionReason(
        "v87c-raw-return",
        makeDecisionReason({ kind: "RETURN", toStatus: "RETURNED", text: "Der Auftrag muss zurück an den Kunden." }),
      );
      await reload();
      const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
      assert.doesNotMatch(visibleText, /\bBLOCK\b/);
      assert.doesNotMatch(visibleText, /\bRETURN\b/);
      clearDecisionReasonOverrides();
    },
  );

  await check("V8.7 Stufe C (25): keine technischen Statuscodes im sichtbaren Text der neuen Grundzeile", () => {
    const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /READY_FOR|IN_EXECUTION/);
  });

  await check(
    "V8.7 Stufe C (26/27/28/29): HTML-artiger Grundtext wird sicher maskiert; Umlaute, Klammern und Anführungszeichen bleiben erhalten",
    async () => {
      const dangerousText =
        'Kunde verlangt <b>sofort</b> Rückruf & "Klarheit" (dringend) <script>alert(1)</script><img src=x onerror=alert(1)>';
      setOrders([
        { id: "v87c-danger", title: "Auftrag mit heiklem Grundtext", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason("v87c-danger", makeDecisionReason({ text: dangerousText }));
      await reload();
      const section = sectionHtml("today");
      assert.ok(
        section.includes(ui.escapeHtml(dangerousText)),
        "der Grundtext muss vollständig, aber ausschließlich maskiert enthalten sein",
      );
      assert.doesNotMatch(section, /<script>/i);
      assert.doesNotMatch(section, /<img[^>]*onerror/i);
      assert.doesNotMatch(section, /<b>sofort<\/b>/);
      assert.ok(section.includes("Rückruf"), "Umlaute bleiben erhalten");
      assert.ok(section.includes("(dringend)"), "Klammern bleiben erhalten");
      assert.ok(
        section.includes(ui.escapeHtml('"Klarheit"')),
        "Anführungszeichen bleiben als sichtbarer, maskierter Text erhalten",
      );
      clearDecisionReasonOverrides();
    },
  );

  await check("V8.7 Stufe C (30): Zeilenumbrüche im Grundtext werden kompakt behandelt (kein <br>)", async () => {
    setOrders([
      { id: "v87c-newline", title: "Auftrag mit Zeilenumbruch im Grund", status: "BLOCKED", updatedAt: new Date().toISOString() },
    ]);
    setCurrentDecisionReason("v87c-newline", makeDecisionReason({ text: "Erste Zeile.\nZweite Zeile." }));
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /<br/i);
    assert.ok(section.includes("Erste Zeile.") && section.includes("Zweite Zeile."), "beide Teile des Grundtextes bleiben vorhanden");
    clearDecisionReasonOverrides();
  });

  await check(
    "V8.7 Stufe C (31): ein Grund über 200 Zeichen wird über die bestehende Logik gekürzt, die reine Ableitungsfunktion liefert weiterhin den vollen Text",
    async () => {
      const longReasonText = "Ausführliche Begründung für die Blockierung. ".repeat(10).trim();
      assert.ok(longReasonText.length > ui.CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT, "der Testtext muss die bestehende Anzeigegrenze überschreiten");
      setOrders([
        { id: "v87c-long-reason", title: "Auftrag mit sehr langem Grund", status: "BLOCKED", updatedAt: new Date().toISOString() },
      ]);
      setCurrentDecisionReason("v87c-long-reason", makeDecisionReason({ text: longReasonText }));
      await reload();
      const order = ui.getState().orders[0];
      assert.strictEqual(ui.decisionReasonTextFor(order), longReasonText, "die reine Ableitungsfunktion liefert weiterhin den vollen Text");
      const section = sectionHtml("today");
      assert.ok(!section.includes(longReasonText), "die Anzeige selbst darf den vollen Text nicht unbegrenzt zeigen");
      assert.ok(section.includes("\u2026"), "eine gekürzte Anzeige muss erkennbar sein (Ellipse)");
      clearDecisionReasonOverrides();
    },
  );

  await check("V8.7 Stufe C (32): keine neue Kürzungsgrenze – weiterhin nur die drei bestehenden *_LIMIT-Konstanten", () => {
    const limitDeclarations = js.match(/var\s+[A-Z_]*LIMIT[A-Z_]*\s*=/g) || [];
    assert.deepStrictEqual(
      limitDeclarations.slice().sort(),
      ["var CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT =", "var RUNNING_LIMIT =", "var TODAY_OVERVIEW_FETCH_LIMIT ="].sort(),
      "es darf keine zusätzliche *_LIMIT-Konstante für den Entscheidungsgrund entstehen",
    );
  });

  await check(
    "V8.7 Stufe C (33/34): der gespeicherte Originaltext und das Overview bleiben durch die Darstellung unverändert",
    async () => {
      const originalReason = makeDecisionReason({ text: "Unveränderter Ausgangsgrund." });
      setOrders([{ id: "v87c-no-mutation", title: "Auftrag ohne Mutation", status: "RETURNED", updatedAt: new Date().toISOString() }]);
      setCurrentDecisionReason("v87c-no-mutation", originalReason);
      await reload();
      const order = ui.getState().orders[0];
      ui.decisionReasonTextFor(order);
      ui.render();
      assert.strictEqual(originalReason.text, "Unveränderter Ausgangsgrund.");
      assert.strictEqual(
        ui.getState().todayOverviewByOrderId["v87c-no-mutation"].currentDecisionReason,
        originalReason,
        "dasselbe Overview-Objekt bleibt referenzgleich, keine Kopie mit Veränderung",
      );
      clearDecisionReasonOverrides();
    },
  );

  await check("V8.7 Stufe C (35): wiederholtes Rendern der Grundzeile bleibt konsistent", () => {
    const first = outputHtml();
    ui.render();
    ui.render();
    const second = outputHtml();
    assert.strictEqual(first, second);
  });

  await check(
    "V8.7 Stufe C (36/37): die neue Grundzeile enthält kein data-action/data-chef-today-action und löst keine eigene Aktion aus",
    async () => {
      setOrders([{ id: "v87c-no-action", title: "Auftrag mit Grund ohne eigene Aktion", status: "BLOCKED", updatedAt: new Date().toISOString() }]);
      setCurrentDecisionReason("v87c-no-action", makeDecisionReason());
      await reload();
      const section = sectionHtml("today");
      const line = reasonLineHtml(section);
      assert.ok(line, "die Grundzeile muss auffindbar sein");
      assert.doesNotMatch(line, /data-action/);
      assert.doesNotMatch(line, /data-chef-today-action/);
      clearDecisionReasonOverrides();
    },
  );

  await check("V8.7 Stufe C (38/39): weiterhin kein schreibender Request und keine neue Route über den gesamten Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
    const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
    assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
  });

  await check("V8.7 Stufe C (40): „Entscheidung öffnen“ bleibt unverändert sichtbar, auch bei vorhandenem Grund", async () => {
    setOrders([{ id: "v87c-open-label", title: "Auftrag mit Grund", status: "BLOCKED", updatedAt: new Date().toISOString() }]);
    setCurrentDecisionReason("v87c-open-label", makeDecisionReason());
    await reload();
    const section = sectionHtml("today");
    assert.ok(section.includes('<span class="chef-today-row-open">Entscheidung öffnen</span>'));
    clearDecisionReasonOverrides();
  });

  await check("V8.7 Stufe C: Öffnen einer Zeile mit Grund nutzt weiterhin ausschließlich das bestehende openOrder()", () => {
    pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
    pilotClicks.length = 0;
    fetchCalls.length = 0;
    const opened = ui.openOrder("v87c-open-label");
    assert.strictEqual(opened, true);
    assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v87c-open-label" }]);
    assert.deepStrictEqual(fetchCalls, [], "das Öffnen selbst löst keinen weiteren Abruf aus");
  });

  await check("V8.7 Stufe C (41): die Abrufgrenze bleibt bei maximal fünf Overviews, auch mit gespeicherten Gründen", async () => {
    setOrders(
      Array.from({ length: 7 }, (unused, index) => ({
        id: `v87c-limit-${index + 1}`,
        title: `Wichtiger Vorgang mit Grund ${index + 1}`,
        status: "BLOCKED",
        updatedAt: new Date().toISOString(),
      })),
    );
    fetchCalls.length = 0;
    await reload();
    const detailCalls = fetchCalls.filter((entry) => /^\/api\/pilot-work-order\/orders\/.+/.test(entry.url));
    assert.strictEqual(ui.TODAY_OVERVIEW_FETCH_LIMIT, 5);
    assert.strictEqual(detailCalls.length, 5);
  });

  await check("V8.7 Stufe C: kein zusätzlicher Hinweis auf die Detailansicht im sichtbaren Text („Entscheidung öffnen“ reicht)", () => {
    const visibleText = sectionHtml("today").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(visibleText, /Detailansicht/i);
  });

  // Quelltext-/CSS-Prüfungen (43–50).

  await check("V8.7 Stufe C (43): die neue CSS-Klasse .chef-today-row-reason ist vorhanden", () => {
    assert.match(css, /\.chef-today-row-reason\b/);
  });

  await check(
    "V8.7 Stufe C (44): der Entscheidungsgrund nutzt ausschließlich die bestehende renderTodayRowLine()-/escapeHtml-Konvention",
    () => {
      const fnMatch = js.match(/function decisionReasonTextFor\(order\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(fnMatch, "decisionReasonTextFor muss auffindbar sein");
      assert.doesNotMatch(fnMatch[0], /innerHTML/);
      assert.match(js, /renderTodayRowLine\(\s*\n?\s*"chef-today-row-reason"/);
    },
  );

  await check("V8.7 Stufe C (45): keine neue POST-/PATCH-/DELETE-Logik", () => {
    assert.doesNotMatch(js, /"POST"|'POST'|"PATCH"|'PATCH'|"DELETE"|'DELETE'/);
  });

  await check("V8.7 Stufe C (46): kein tatsächlicher Zugriff (Property-Lesezugriff) auf decisionReasonHistory im Quelltext", () => {
    // Bewusst nur ein echter Property-Zugriff (führender Punkt) ist ein
    // Befund – der Modulkopf erklärt in Prosa/Backticks ausdrücklich, WARUM
    // decisionReasonHistory bewusst NICHT gelesen wird, das ist erlaubt.
    assert.doesNotMatch(js, /\.decisionReasonHistory\b/);
  });

  await check("V8.7 Stufe C (47): keine Nutzung von setAt/setByUserId/fromStatus/toStatus/orderRevision im Quelltext", () => {
    assert.doesNotMatch(js, /\.setAt\b/);
    assert.doesNotMatch(js, /\.setByUserId\b/);
    assert.doesNotMatch(js, /\.fromStatus\b/);
    assert.doesNotMatch(js, /\.toStatus\b/);
    assert.doesNotMatch(js, /\.orderRevision\b/);
  });

  await check("V8.7 Stufe C (48): keine Änderung an der Chefmodus-Navigation (weiterhin genau zwei bekannte Aktionen, seit V8.9.5 ohne open-recommended)", () => {
    const actions = jsChefTodayActions();
    // V8.9.5 – "open-recommended" wurde entfernt (sein Markup wird nie mehr
    // gerendert, siehe renderRecommendationSection()); die verbleibende
    // Zielhandlung bleibt vollständig über "open-order" erreichbar.
    assert.deepStrictEqual(
      actions.slice().sort(),
      ['data-chef-today-action="open-order"', 'data-chef-today-action="open-new-order"'].sort(),
    );
    // V8.9.4 – zusätzlich zur unveränderten Dreierliste aus chef-today-ui.js
    // ehrlich mitprüfen, dass index.html seit V8.9.4 genau eine zusätzliche,
    // rein statische Aktion trägt (kein stillschweigendes Vorbeirutschen an
    // dieser Stelle).
    assert.deepStrictEqual(htmlStaticChefTodayActions(), ['data-chef-today-action="reload-today"']);
  });

  await check("V8.7 Stufe C (49): pilot-work-order-ui.js enthält keine neue Logik dieses Arbeitspakets (keine Änderung)", () => {
    assert.doesNotMatch(pilotUiJs, /chef-today-row-reason/);
    assert.doesNotMatch(pilotUiJs, /decisionReasonLineLabel/);
    assert.doesNotMatch(pilotUiJs, /decisionReasonTextFor/);
    assert.doesNotMatch(pilotUiJs, /V8\.7 Stufe C/);
  });

  await check("V8.7 Stufe C (50): pilot-work-order-service.js enthält keine neue Logik dieses Arbeitspakets (keine Service-Änderung)", () => {
    assert.doesNotMatch(pilotServiceJs, /chef-today-row-reason/);
    assert.doesNotMatch(pilotServiceJs, /decisionReasonLineLabel/);
    assert.doesNotMatch(pilotServiceJs, /decisionReasonTextFor/);
    assert.doesNotMatch(pilotServiceJs, /V8\.7 Stufe C/);
  });

  await check(
    "V8.7 Stufe C: die neue Zeile wirkt gleichwertig, nicht stärker als „Zu entscheiden“ (keine Warnfarbe, kein Icon, keine zusätzliche Karte)",
    () => {
      const reasonRuleMatches = css.match(/\.chef-today-row-reason[^{}]*\{[^}]*\}/g) || [];
      assert.ok(reasonRuleMatches.length > 0, "es muss mindestens eine CSS-Regel für .chef-today-row-reason existieren");
      reasonRuleMatches.forEach((rule) => {
        assert.doesNotMatch(rule, /color:\s*(red|orange|#c0392b|#e74c3c|var\(--danger|var\(--warning)/i);
        assert.doesNotMatch(rule, /background/i);
        assert.doesNotMatch(rule, /::before|content:/i);
      });
    },
  );

  // -------------------------------------------------------------------
  // V8.8.4 ("Verfügbare Aktion aus 'Heute wichtig' entfernen", rein
  // darstellend) – Nummerierung folgt den TESTANFORDERUNGEN aus dem
  // freigegebenen Architekturbericht V8.8.4. Eine gemischte Liste (je ein
  // Auftrag BLOCKED, RETURNED, READY_FOR_REVIEW, READY_FOR_JAMAL_APPROVAL)
  // deckt zugleich die vier Einzelfälle A–D und den gemischten Fall E der
  // Browserabnahme ab. Alle bereits bestehenden Zeilenbestandteile
  // (Kategorie, Titel, Zu entscheiden, Warum blockiert/zurückgegeben,
  // Empfehlung, Wichtig zu beachten, Wartedauer, Entscheidung öffnen)
  // müssen unverändert vollständig bleiben – ausschließlich "Verfügbare
  // Aktion" entfällt.
  // -------------------------------------------------------------------

  await check("V8.8.4 (1): kein Chefmodus-Eintrag enthält den Text „Verfügbare Aktion“", async () => {
    setOrders([
      { id: "v884-blocked", title: "Blockierter Auftrag", status: "BLOCKED", updatedAt: isoAtLocalDaysAgo(3) },
      { id: "v884-returned", title: "Zurückgegebener Auftrag", status: "RETURNED", updatedAt: isoAtLocalDaysAgo(0) },
      { id: "v884-review", title: "Prüfung wartet", status: "READY_FOR_REVIEW", updatedAt: isoAtLocalDaysAgo(1) },
      { id: "v884-approval", title: "Freigabe wartet", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: isoAtLocalDaysAgo(0) },
    ]);
    setCurrentDecisionReason(
      "v884-blocked",
      makeDecisionReason({ kind: "BLOCK", text: "Die Schnittstelle ist noch nicht abgenommen." }),
    );
    setCurrentDecisionReason(
      "v884-returned",
      makeDecisionReason({ kind: "RETURN", text: "Der Text muss vor Freigabe gek\u00fcrzt werden." }),
    );
    setHandoffs("v884-review", [makeDocumentationHandoff({ resultOrRecommendation: "Die Dokumentation empfiehlt die Freigabe." })]);
    setRisksAndLimits("v884-approval", ["Die Datenbasis ist noch unvollst\u00e4ndig."]);
    await reload();
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Verf\u00fcgbare Aktion/, "die Zeile „Verfügbare Aktion“ darf in keinem Eintrag mehr erscheinen");
  });

  await check("V8.8.4 (2): keiner der vier ehemaligen Aktionstexte erscheint mehr auf Ebene 1", () => {
    const section = sectionHtml("today");
    assert.doesNotMatch(section, /Erneut als Entwurf starten/);
    assert.doesNotMatch(section, /Ergebnis abnehmen/);
    assert.doesNotMatch(section, /Entsperren \(zur\u00fcckgeben\)/);
    assert.doesNotMatch(section, /Ausf\u00fchrung freigeben/);
  });

  await check("V8.8.4 (3): Kategorie bleibt für jeden Eintrag vollständig erhalten", () => {
    const section = sectionHtml("today");
    assert.ok(section.includes("Entscheidung notwendig"));
    assert.ok(section.includes("Ergebnis wartet auf Pr\u00fcfung"));
    assert.ok(section.includes("Auftrag blockiert"));
    assert.ok(section.includes("Freigabe erforderlich"));
  });

  await check("V8.8.4 (4): Titel bleibt für jeden Eintrag vollständig erhalten", () => {
    assert.deepStrictEqual(rowTitles("today"), [
      "Zur\u00fcckgegebener Auftrag",
      "Pr\u00fcfung wartet",
      "Blockierter Auftrag",
      "Freigabe wartet",
    ]);
  });

  await check(
    "V8.8.4 (5): „Zu entscheiden“ bleibt für jeden Eintrag vollständig erhalten (statusspezifischer Fallback-Satz)",
    () => {
      const section = sectionHtml("today");
      assert.ok(section.includes("Zu entscheiden:"));
      assert.ok(section.includes("Der Auftrag wurde zur\u00fcckgegeben und wartet auf deine n\u00e4chste Entscheidung."));
      assert.ok(section.includes("Das Ergebnis wartet auf deine Pr\u00fcfung."));
      assert.ok(section.includes("Der Auftrag ist blockiert und wartet auf deine Entscheidung."));
      assert.ok(section.includes("Der Auftrag wartet auf deine Freigabe."));
    },
  );

  await check("V8.8.4 (6): „Warum blockiert?“/„Warum zurückgegeben?“ bleibt vollständig erhalten", () => {
    const section = sectionHtml("today");
    assert.ok(section.includes("Warum blockiert?"));
    assert.ok(section.includes("Die Schnittstelle ist noch nicht abgenommen."));
    assert.ok(section.includes("Warum zur\u00fcckgegeben?"));
    assert.ok(section.includes("Der Text muss vor Freigabe gek\u00fcrzt werden."));
  });

  await check("V8.8.4 (7): „Empfehlung“ bleibt vollständig erhalten", () => {
    const section = sectionHtml("today");
    assert.ok(section.includes("Empfehlung:"));
    assert.ok(section.includes("Die Dokumentation empfiehlt die Freigabe."));
  });

  await check("V8.8.4 (8): „Wichtig zu beachten“ bleibt als Zeile vollständig erhalten (V8.8.5: seither als fester Kurztext statt Volltext)", () => {
    const section = sectionHtml("today");
    assert.ok(section.includes("Wichtig zu beachten:"));
    assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
    assert.ok(!section.includes("Die Datenbasis ist noch unvollst\u00e4ndig."), "V8.8.5: der Volltext darf auf Ebene 1 nicht mehr erscheinen");
  });

  await check("V8.8.4 (9): Wartedauer bleibt für jeden Eintrag vollständig erhalten", () => {
    const section = sectionHtml("today");
    const waitLabels = (section.match(/<span class="chef-today-row-wait">([^<]*)<\/span>/g) || []).map((entry) =>
      entry.replace(/<[^>]+>/g, ""),
    );
    assert.deepStrictEqual(waitLabels.slice().sort(), ["Gestern", "Heute", "Heute", "Seit 3 Tagen"].sort());
  });

  await check("V8.8.4 (10): „Entscheidung öffnen“ bleibt für jeden Eintrag vollständig erhalten", () => {
    const section = sectionHtml("today");
    const openLabels = section.match(/<span class="chef-today-row-open">Entscheidung \u00f6ffnen<\/span>/g) || [];
    assert.strictEqual(openLabels.length, 4, "jede Zeile beh\u00e4lt ihre eigene „Entscheidung öffnen“-Beschriftung");
  });

  await check(
    "V8.8.4 (11): die Detailansicht (Pilotauftrags-Karte) enthält weiterhin den echten, unveränderten Aktionsknopf",
    () => {
      assert.match(pilotUiJs, /function renderPrimaryAction/, "renderPrimaryAction() bleibt vollst\u00e4ndig in der Pilotauftrags-Karte erhalten");
      assert.doesNotMatch(js, /function renderPrimaryAction/, "chef-today-ui.js erzeugt keinen eigenen Aktionsknopf");
      assert.doesNotMatch(pilotUiJs, /V8\.8\.4/, "die Pilotauftrags-Karte wird durch V8.8.4 nicht ver\u00e4ndert");
    },
  );

  await check("V8.8.4 (12): keine POST-/PATCH-/DELETE-Aufrufe", () => {
    assert.deepStrictEqual(postCalls(), []);
    assert.doesNotMatch(js, /"POST"|'POST'|"PATCH"|'PATCH'|"DELETE"|'DELETE'/);
  });

  await check("V8.8.4 (13): keine neue Route", () => {
    const routeMatches = js.match(/\/api\/[a-zA-Z0-9\-\/]+/g) || [];
    assert.ok(routeMatches.length > 0, "die bestehenden Leseroute muss weiterhin verwendet werden");
    routeMatches.forEach((route) => {
      assert.ok(route.startsWith("/api/pilot-work-order/orders"), `keine neue Route erwartet, gefunden: ${route}`);
    });
  });

  await check("V8.8.4 (14): keine Mutation der Auftragsdaten", () => {
    const orders = ui.getState().orders;
    const before = orders.map((order) => JSON.stringify(order));
    ui.render();
    const after = ui.getState().orders.map((order) => JSON.stringify(order));
    assert.deepStrictEqual(before, after, "das Rendern der Startkarte darf die Auftragsdaten nicht ver\u00e4ndern");
  });

  await check(
    "V8.8.4 (15): Navigation unverändert (weiterhin genau zwei bekannte Aktionen seit V8.9.5, „Entscheidung öffnen“ ruft weiterhin openOrder())",
    () => {
      const actions = jsChefTodayActions();
      // V8.9.5 – "open-recommended" entfernt, siehe V8.7 Stufe C (48).
      assert.deepStrictEqual(
        actions.slice().sort(),
        ['data-chef-today-action="open-order"', 'data-chef-today-action="open-new-order"'].sort(),
      );
      // V8.9.4 – ehrliche Ergänzung: die eine statische Aktualisierungsaktion
      // aus index.html bleibt von der Navigation getrennt und unverändert.
      assert.deepStrictEqual(htmlStaticChefTodayActions(), ['data-chef-today-action="reload-today"']);
      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      const opened = ui.openOrder("v884-blocked");
      assert.strictEqual(opened, true);
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v884-blocked" }]);
      assert.deepStrictEqual(fetchCalls, [], "\u201eEntscheidung \u00f6ffnen\u201c l\u00f6st weiterhin keinen Abruf aus");
    },
  );

  await check(
    "V8.8.4: styles.css enthält keine .chef-today-row-action-Regel mehr, die übrigen Zeilenklassen bleiben unverändert",
    () => {
      assert.doesNotMatch(css, /\.chef-today-row-action\b/);
      assert.match(css, /\.chef-today-row-decision\b/);
      assert.match(css, /\.chef-today-row-reason\b/);
      assert.match(css, /\.chef-today-row-recommendation\b/);
      assert.match(css, /\.chef-today-row-risk\b/);
      assert.match(css, /\.chef-today-row-line\b/);
      assert.match(css, /\.chef-today-row-open\b/);
    },
  );

  await check(
    "V8.8.4: chef-today-ui.js enthält keinen Rest von PRIMARY_ACTION_LABEL_BY_STATUS/primaryActionLabelFor mehr (nur die erklärende Prosa im Modulkopf über die Entfernung bleibt zulässig)",
    () => {
      // Bewusst nur echte Code-Nutzung ist ein Befund (Definition, Zugriff,
      // Aufruf, Export) – dieselbe Konvention wie bei der bestehenden
      // decisionReasonHistory-Prüfung (siehe V8.7 Stufe C (46)): der
      // Modulkopf erklärt in Prosa ausdrücklich, WARUM/WAS entfernt wurde,
      // das ist erlaubt und gewollt.
      assert.doesNotMatch(js, /\bvar PRIMARY_ACTION_LABEL_BY_STATUS\b/);
      assert.doesNotMatch(js, /PRIMARY_ACTION_LABEL_BY_STATUS\[/);
      assert.doesNotMatch(js, /PRIMARY_ACTION_LABEL_BY_STATUS:\s*PRIMARY_ACTION_LABEL_BY_STATUS/);
      assert.doesNotMatch(js, /\bfunction primaryActionLabelFor\b/);
      assert.doesNotMatch(js, /primaryActionLabelFor\(order\)/);
      assert.doesNotMatch(js, /primaryActionLabelFor:\s*primaryActionLabelFor/);
      assert.strictEqual(typeof ui.primaryActionLabelFor, "undefined", "die Funktion darf nicht mehr exportiert werden");
      assert.strictEqual(typeof ui.PRIMARY_ACTION_LABEL_BY_STATUS, "undefined", "die Konstante darf nicht mehr exportiert werden");
    },
  );

  await check("V8.8.4: weiterhin kein schreibender Request über den gesamten V8.8.4-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------
  // V8.8.5 ("Volltext bei 'Wichtig zu beachten' auf Ebene 1 durch
  // 'Hinweis vorhanden' ersetzen", rein darstellend, Alternative D) –
  // Nummerierung folgt den TESTANFORDERUNGEN aus dem freigegebenen
  // Architektur-, UX- und Sicherheitsbericht V8.8.5. (1)/(2) – BLOCKED/
  // RETURNED zeigen weiterhin keine Zeile – bereits vollständig durch
  // V8.5 (9)/(10) oben nachgewiesen (unverändert, riskTextFor() liefert
  // für diese beiden Status weiterhin immer null). (10)–(16) – Kategorie,
  // Titel, „Zu entscheiden“, „Warum blockiert?“/„Warum zurückgegeben?“,
  // Empfehlung, Wartedauer und „Entscheidung öffnen“ – bereits vollständig
  // durch V8.8.4 (3)–(10) oben nachgewiesen (unverändert, keine dieser
  // Zeilen wird durch V8.8.5 berührt) und zusätzlich unten erneut
  // stichprobenhaft geprüft.
  // -------------------------------------------------------------------

  await check(
    "V8.8.5 (3): READY_FOR_REVIEW mit gültigem Risiko-/Grenztext zeigt exakt „Wichtig zu beachten: Hinweis vorhanden“",
    async () => {
      setOrders([
        { id: "v885-review-hint", title: "Ergebnis mit Risikohinweis", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setRisksAndLimits("v885-review-hint", ["Die Datenbasis ist noch unvollst\u00e4ndig."]);
      await reload();
      const section = sectionHtml("today");
      assert.ok(
        section.includes(
          '<span class="chef-today-row-line-label">Wichtig zu beachten:</span> <span class="chef-today-row-line-text">Hinweis vorhanden</span>',
        ),
        "exakt „Wichtig zu beachten: Hinweis vorhanden“ muss sichtbar sein",
      );
      assert.strictEqual(ui.CHEF_TODAY_RISK_HINT_TEXT, "Hinweis vorhanden");
      clearHandoffAndRiskOverrides();
    },
  );

  await check(
    "V8.8.5 (4): READY_FOR_JAMAL_APPROVAL mit gültigem Risiko-/Grenztext zeigt exakt „Wichtig zu beachten: Hinweis vorhanden“",
    async () => {
      setOrders([
        { id: "v885-approval-hint", title: "Freigabe mit Risikohinweis", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
      ]);
      setRisksAndLimits("v885-approval-hint", ["Ein Restrisiko bleibt bestehen."]);
      await reload();
      const section = sectionHtml("today");
      assert.ok(
        section.includes(
          '<span class="chef-today-row-line-label">Wichtig zu beachten:</span> <span class="chef-today-row-line-text">Hinweis vorhanden</span>',
        ),
      );
      clearHandoffAndRiskOverrides();
    },
  );

  await check(
    "V8.8.5 (5): READY_FOR_JAMAL_APPROVAL ohne Risiko-/Grenztext zeigt weiterhin keine Zeile „Wichtig zu beachten“",
    async () => {
      setOrders([
        { id: "v885-approval-no-hint", title: "Freigabe ohne Risikohinweis", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: new Date().toISOString() },
      ]);
      await reload();
      const section = sectionHtml("today");
      assert.doesNotMatch(section, /Wichtig zu beachten:/);
    },
  );

  await check(
    "V8.8.5 (6): der ursprüngliche Volltext erscheint auf Ebene 1 nicht mehr, obwohl riskTextFor() ihn als reine Ableitungsfunktion weiterhin vollständig liefert",
    async () => {
      setOrders([
        { id: "v885-no-fulltext", title: "Ergebnis mit langem Risikotext", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setRisksAndLimits("v885-no-fulltext", ["Ein sehr spezifischer, nur f\u00fcr diesen Test einmaliger Risikotext."]);
      await reload();
      const order = ui.getState().orders[0];
      assert.strictEqual(
        ui.riskTextFor(order),
        "Ein sehr spezifischer, nur f\u00fcr diesen Test einmaliger Risikotext.",
        "riskTextFor() bleibt unverändert die reine Ableitungsfunktion mit dem vollen Text",
      );
      const section = sectionHtml("today");
      assert.ok(
        !section.includes("Ein sehr spezifischer, nur f\u00fcr diesen Test einmaliger Risikotext."),
        "der Volltext darf auf Ebene 1 nicht mehr erscheinen",
      );
      assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
      clearHandoffAndRiskOverrides();
    },
  );

  await check(
    "V8.8.5 (7/8): mehrere Risiken führen weiterhin zu höchstens einer Zeile, kein Volltext aus irgendeinem Eintrag erscheint auf Ebene 1",
    async () => {
      setOrders([
        { id: "v885-multi-risk", title: "Ergebnis mit mehreren Hinweisen", status: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() },
      ]);
      setRisksAndLimits("v885-multi-risk", ["Erster Einzelhinweis.", "Zweiter Einzelhinweis.", "Dritter Einzelhinweis."]);
      await reload();
      const section = sectionHtml("today");
      const riskLines = section.match(/Wichtig zu beachten:/g) || [];
      assert.strictEqual(riskLines.length, 1, "es darf höchstens eine Zeile „Wichtig zu beachten“ erscheinen");
      assert.ok(!section.includes("Erster Einzelhinweis."));
      assert.ok(!section.includes("Zweiter Einzelhinweis."));
      assert.ok(!section.includes("Dritter Einzelhinweis."));
      assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
      clearHandoffAndRiskOverrides();
    },
  );

  await check(
    "V8.8.5 (9): unerwartete, leere oder ungültige risksAndLimits-Werte bleiben defensiv behandelt (riskTextFor() liefert weiterhin ausschließlich den einzig gültigen Eintrag)",
    () => {
      ui.getState().todayOverviewByOrderId["v885-invalid"] = {
        openDecision: null,
        nextStep: null,
        handoffs: [],
        risksAndLimits: [null, 42, {}, "   ", "Echter Hinweis."],
      };
      assert.strictEqual(ui.riskTextFor({ id: "v885-invalid", status: "READY_FOR_REVIEW" }), "Echter Hinweis.");
      delete ui.getState().todayOverviewByOrderId["v885-invalid"];
    },
  );

  await check(
    "V8.8.5: Kategorie, Titel, „Zu entscheiden“, Empfehlung, Wartedauer und „Entscheidung öffnen“ bleiben durch die Kurztext-Umstellung unverändert vollständig erhalten (Fall F: gemischte Liste)",
    async () => {
      setOrders([
        { id: "v885-mixed-blocked", title: "Blockierter Auftrag", status: "BLOCKED", updatedAt: isoAtLocalDaysAgo(2) },
        { id: "v885-mixed-review", title: "Pr\u00fcfung wartet", status: "READY_FOR_REVIEW", updatedAt: isoAtLocalDaysAgo(0) },
        { id: "v885-mixed-approval", title: "Freigabe wartet", status: "READY_FOR_JAMAL_APPROVAL", updatedAt: isoAtLocalDaysAgo(1) },
      ]);
      setHandoffs("v885-mixed-review", [makeDocumentationHandoff({ resultOrRecommendation: "Die Dokumentation empfiehlt die Freigabe." })]);
      setRisksAndLimits("v885-mixed-approval", ["Ein Restrisiko bleibt bestehen."]);
      await reload();
      const section = sectionHtml("today");
      assert.ok(section.includes("Auftrag blockiert"));
      assert.ok(section.includes("Ergebnis wartet auf Pr\u00fcfung"));
      assert.ok(section.includes("Freigabe erforderlich"));
      assert.deepStrictEqual(rowTitles("today"), ["Pr\u00fcfung wartet", "Blockierter Auftrag", "Freigabe wartet"]);
      assert.ok(section.includes("Zu entscheiden:"));
      assert.ok(section.includes("Empfehlung:"));
      assert.ok(section.includes("Die Dokumentation empfiehlt die Freigabe."));
      const waitLabels = (section.match(/<span class="chef-today-row-wait">([^<]*)<\/span>/g) || []).map((entry) =>
        entry.replace(/<[^>]+>/g, ""),
      );
      assert.deepStrictEqual(waitLabels.slice().sort(), ["Gestern", "Heute", "Seit 2 Tagen"].sort());
      const openLabels = section.match(/<span class="chef-today-row-open">Entscheidung \u00f6ffnen<\/span>/g) || [];
      assert.strictEqual(openLabels.length, 3);
      assert.ok(section.includes(ui.CHEF_TODAY_RISK_HINT_TEXT));
      const riskLines = section.match(/Wichtig zu beachten:/g) || [];
      assert.strictEqual(riskLines.length, 1, "keine doppelten Hinweise in der gemischten Liste");
      clearHandoffAndRiskOverrides();
    },
  );

  await check(
    "V8.8.5 (17/18): die Pilotauftrags-Detailansicht zeigt weiterhin alle Risiken/Grenzen vollständig über renderRisks(), vor dem echten Aktionsknopf",
    () => {
      assert.match(pilotUiJs, /function renderRisks/, "renderRisks() bleibt vollständig in der Pilotauftrags-Karte erhalten");
      const risksCallIndex = pilotUiJs.indexOf("renderRisks(overview)");
      const primaryActionCallIndex = pilotUiJs.indexOf("renderPrimaryAction(overview)");
      assert.ok(risksCallIndex > -1 && primaryActionCallIndex > -1, "beide Aufrufe müssen im Rendering der Detailansicht vorkommen");
      assert.ok(risksCallIndex < primaryActionCallIndex, "renderRisks() muss im Rendering vor renderPrimaryAction() aufgerufen werden");
      assert.doesNotMatch(pilotUiJs, /V8\.8\.5/, "die Pilotauftrags-Detailansicht wird durch V8.8.5 nicht verändert");
      assert.doesNotMatch(pilotServiceJs, /V8\.8\.5/, "der Service wird durch V8.8.5 nicht verändert");
    },
  );

  await check("V8.8.5 (19/20): keine POST-/PATCH-/DELETE-Aufrufe, keine Mutation der Overview-Daten durch das Rendern", () => {
    assert.deepStrictEqual(postCalls(), []);
    assert.doesNotMatch(js, /"POST"|'POST'|"PATCH"|'PATCH'|"DELETE"|'DELETE'/);
    const before = JSON.stringify(ui.getState().todayOverviewByOrderId);
    ui.render();
    const after = JSON.stringify(ui.getState().todayOverviewByOrderId);
    assert.strictEqual(before, after, "das erneute Rendern darf die übernommenen Overview-Daten nicht verändern");
  });

  await check(
    "V8.8.5 (21/22/23/24/25): Navigation, Routen und Bedienzustand bleiben durch die Kurztext-Umstellung unverändert; keine Datenbank-/Statuslogik im Skript",
    () => {
      const routeMatches = js.match(/\/api\/[a-zA-Z0-9\-\/]+/g) || [];
      assert.ok(routeMatches.length > 0, "die bestehende Leseroute muss weiterhin verwendet werden");
      routeMatches.forEach((route) => {
        assert.ok(route.startsWith("/api/pilot-work-order/orders"), `keine neue Route erwartet, gefunden: ${route}`);
      });
      const actions = jsChefTodayActions();
      // V8.9.5 – "open-recommended" entfernt, siehe V8.7 Stufe C (48).
      assert.deepStrictEqual(
        actions.slice().sort(),
        ['data-chef-today-action="open-order"', 'data-chef-today-action="open-new-order"'].sort(),
      );
      // V8.9.4 – ehrliche Ergänzung: die eine statische Aktualisierungsaktion
      // aus index.html bleibt von der Navigation getrennt und unverändert.
      assert.deepStrictEqual(htmlStaticChefTodayActions(), ['data-chef-today-action="reload-today"']);
      assert.doesNotMatch(js, /INSERT INTO|UPDATE .* SET|DELETE FROM/i, "keine Datenbankzugriffe in chef-today-ui.js");
    },
  );

  await check("V8.8.5: weiterhin kein schreibender Request über den gesamten V8.8.5-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------------
  // V8.9.1 – Sichtbarer Rückweg "Zurück zu Heute" in der Pilotauftrags-Karte:
  // rein statische Prüfung von index.html/styles.css. Nativer HTML-Anker,
  // reine Navigation zu #chef-today-card, kein JavaScript, kein neuer
  // Event-Handler, keine Zustandslogik. chef-today-ui.js und
  // pilot-work-order-ui.js bleiben durch dieses Arbeitspaket unverändert.
  // -------------------------------------------------------------------------

  await check('V8.9.1 (1): der sichtbare Text "Zurück zu Heute" existiert exakt einmal', () => {
    const matches = html.match(/Zur\u00fcck zu Heute/g) || [];
    assert.strictEqual(matches.length, 1);
  });

  await check("V8.9.1 (2/3/4): der Rückweg steht innerhalb von #pilot-work-order-card, nach #pilot-work-order-output und vor dem unteren aufklappbaren Nachschaubereich", () => {
    const cardOpenIndex = html.indexOf('id="pilot-work-order-card"');
    const cardCloseIndex = html.indexOf("</section>", cardOpenIndex);
    const outputIndex = html.indexOf('id="pilot-work-order-output"', cardOpenIndex);
    const backLinkIndex = html.indexOf("Zur\u00fcck zu Heute", cardOpenIndex);
    const detailsIndex = html.indexOf('<details class="pilot-work-order-details">', cardOpenIndex);
    assert.ok(cardOpenIndex > -1, "#pilot-work-order-card muss existieren");
    assert.ok(outputIndex > -1 && backLinkIndex > -1 && detailsIndex > -1, "alle vier Bezugspunkte müssen existieren");
    assert.ok(backLinkIndex < cardCloseIndex, "der Rückweg muss innerhalb von #pilot-work-order-card stehen");
    assert.ok(outputIndex < backLinkIndex, "der Rückweg muss nach #pilot-work-order-output stehen");
    assert.ok(backLinkIndex < detailsIndex, "der Rückweg muss vor dem unteren aufklappbaren Nachschaubereich stehen");
  });

  await check("V8.9.1 (5/6): href lautet exakt #chef-today-card, die Ziel-ID chef-today-card existiert exakt einmal", () => {
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.ok(backLinkMatch, "der Rückweg muss als <a>-Element mit exakt diesem Text vorliegen");
    assert.match(backLinkMatch[0], /href="#chef-today-card"/, "href muss exakt #chef-today-card sein");
    const targetIdMatches = html.match(/id="chef-today-card"/g) || [];
    assert.strictEqual(targetIdMatches.length, 1, "die Ziel-ID chef-today-card darf nur exakt einmal existieren");
  });

  await check("V8.9.1 (7/8/9/10/11/12): der Rückweg ist ein reiner <a>, kein Button/Formularelement, ohne data-action/data-chef-today-action/data-view-jump/data-view-anchor", () => {
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.ok(backLinkMatch, "der Rückweg muss ein <a>-Element sein");
    const tag = backLinkMatch[0];
    assert.doesNotMatch(tag, /data-action=/);
    assert.doesNotMatch(tag, /data-chef-today-action=/);
    assert.doesNotMatch(tag, /data-view-jump=/);
    assert.doesNotMatch(tag, /data-view-anchor=/);
    assert.doesNotMatch(tag, /role="button"/);
    const cardOpenIndex = html.indexOf('id="pilot-work-order-card"');
    const cardCloseIndex = html.indexOf("</section>", cardOpenIndex);
    const cardSection = html.slice(cardOpenIndex, cardCloseIndex);
    assert.ok(!/<button[^>]*>Zur\u00fcck zu Heute<\/button>/.test(cardSection), "kein <button> mit diesem Text");
    assert.ok(!/<(input|select|textarea|form)\b[^>]*Zur\u00fcck zu Heute/.test(cardSection), "kein Formularelement mit diesem Text");
  });

  await check("V8.9.1 (13/14/15): kein neuer JavaScript-Handler, chef-today-ui.js und pilot-work-order-ui.js bleiben unverändert", () => {
    assert.doesNotMatch(js, /V8\.9\.1/, "chef-today-ui.js wird durch V8.9.1 nicht verändert");
    assert.doesNotMatch(pilotUiJs, /V8\.9\.1/, "pilot-work-order-ui.js wird durch V8.9.1 nicht verändert");
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.ok(backLinkMatch, "der Rückweg muss als <a>-Element auffindbar sein");
    assert.doesNotMatch(backLinkMatch[0], /data-view-jump/, "der neue Rückweg selbst darf keinen data-view-jump-Mechanismus verwenden");
    assert.doesNotMatch(backLinkMatch[0], /data-view-anchor/, "der neue Rückweg selbst darf keinen data-view-anchor-Mechanismus verwenden");
    assert.doesNotMatch(backLinkMatch[0], /onclick=/i, "kein neuer inline Event-Handler");
  });

  await check("V8.9.1 (16): der Rückweg erzeugt keine API-Anfrage und keine Schreibaktion", () => {
    assert.deepStrictEqual(postCalls(), []);
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.doesNotMatch(backLinkMatch[0], /\/api\//, "der native Anker darf keine API-Route referenzieren");
  });

  await check("V8.9.1 (17): der sichtbare Text enthält keine technische Sprache", () => {
    const visibleText = "Zur\u00fcck zu Heute";
    assert.strictEqual(visibleText, "Zurück zu Heute");
    assert.doesNotMatch(visibleText, /ID|API|JSON|URL|Route|Anker|Handler|Event/i);
    assert.doesNotMatch(visibleText, /[_#{}<>/]/, "keine technischen Sonderzeichen im sichtbaren Text");
  });

  await check("V8.9.1 (18/19): die CSS-Klasse ist additiv vorhanden und nicht als Primärbutton gestaltet", () => {
    assert.match(css, /\.pilot-work-order-back-to-today\s*\{/, "die neue Klasse muss additiv in styles.css existieren");
    const classBlockMatch = css.match(/\.pilot-work-order-back-to-today\s*\{[^}]*\}/);
    assert.ok(classBlockMatch, "der Regelblock muss auffindbar sein");
    assert.doesNotMatch(classBlockMatch[0], /border-radius:\s*999px/, "keine Pillenform wie die echten Primärbuttons");
    assert.doesNotMatch(classBlockMatch[0], /^\s*background:/m, "keine gefüllte Hintergrundfläche wie ein Primärbutton");
    assert.match(classBlockMatch[0], /text-decoration:\s*underline/, "als normaler Textlink erkennbar");
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.match(backLinkMatch[0], /class="pilot-work-order-back-to-today"/, "das <a>-Element muss die neue Klasse tragen");
  });

  await check("V8.9.1 (20): bestehende Chefmodus-, Navigations- und Sicherheitsprüfungen dieser Datei bleiben vollständig grün", () => {
    assert.match(html, /id="chef-today-card"/);
    assert.match(html, /id="pilot-work-order-card"/);
    assert.match(html, /id="pilot-work-order-output"/);
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------------
  // V8.9.2 – Anzahl offener Entscheidungen in "Heute wichtig" sichtbar
  // machen: renderTodaySection() zeigt im Nicht-Leerzustand jetzt
  // "Heute wichtig (" + items.length + ")" statt immer nur "Heute wichtig".
  // items ist unverändert dasselbe, bereits vorhandene selectToday(orders)-
  // Ergebnis – keine neue Berechnung, kein neuer State, keine Begrenzung
  // durch TODAY_OVERVIEW_FETCH_LIMIT. Der Leerzustand bleibt exakt "Heute
  // wichtig" ohne "(0)".
  // -------------------------------------------------------------------------

  function todayHeadingText() {
    const match = sectionHtml("today").match(/<h3>([^<]*)<\/h3>/);
    assert.ok(match, 'die \u00dcberschrift von "Heute wichtig" muss auffindbar sein');
    return match[1];
  }

  await check('V8.9.2 (1): Leerzustand zeigt exakt "Heute wichtig" ohne "(0)"', async () => {
    setOrders([]);
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig");
    assert.doesNotMatch(todayHeadingText(), /\(0\)/);
    // Seit V8.9.3 trägt "Heute wichtig" im Leerzustand keinen eigenen Text
    // mehr (siehe dortige V8.9.3-Prüfpunkte) – hier wird ausschließlich die
    // Überschrift selbst geprüft, unverändert seit V8.9.2.
  });

  await check('V8.9.2 (2): genau 1 entscheidungsrelevanter Auftrag zeigt exakt "Heute wichtig (1)"', async () => {
    setOrders([{ id: "v892-one", title: "Einzelner wichtiger Auftrag", status: "BLOCKED" }]);
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig (1)");
  });

  await check('V8.9.2 (3): genau 2 entscheidungsrelevante Auftr\u00e4ge zeigen exakt "Heute wichtig (2)"', async () => {
    setOrders([
      { id: "v892-two-1", title: "Auftrag 1", status: "RETURNED" },
      { id: "v892-two-2", title: "Auftrag 2", status: "BLOCKED" },
    ]);
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig (2)");
  });

  await check('V8.9.2 (4): genau 3 entscheidungsrelevante Auftr\u00e4ge zeigen exakt "Heute wichtig (3)"', async () => {
    setOrders([
      { id: "v892-three-1", title: "Auftrag 1", status: "RETURNED" },
      { id: "v892-three-2", title: "Auftrag 2", status: "READY_FOR_REVIEW" },
      { id: "v892-three-3", title: "Auftrag 3", status: "BLOCKED" },
    ]);
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig (3)");
  });

  await check('V8.9.2 (5): genau 5 entscheidungsrelevante Auftr\u00e4ge zeigen exakt "Heute wichtig (5)"', async () => {
    setOrders(
      Array.from({ length: 5 }, (unused, index) => ({
        id: `v892-five-${index + 1}`,
        title: `Auftrag ${index + 1}`,
        status: "BLOCKED",
      })),
    );
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig (5)");
  });

  await check(
    'V8.9.2 (6): mehr als f\u00fcnf (acht) entscheidungsrelevante Auftr\u00e4ge zeigen exakt "Heute wichtig (8)", nicht "(5)" – die Overview-Abrufgrenze begrenzt die sichtbare Zahl nicht',
    async () => {
      setOrders(
        Array.from({ length: 8 }, (unused, index) => ({
          id: `v892-eight-${index + 1}`,
          title: `Auftrag ${index + 1}`,
          status: "BLOCKED",
        })),
      );
      await reload();
      assert.strictEqual(ui.TODAY_OVERVIEW_FETCH_LIMIT, 5, "die Abrufgrenze selbst bleibt unver\u00e4ndert 5");
      assert.strictEqual(todayHeadingText(), "Heute wichtig (8)");
      assert.notStrictEqual(todayHeadingText(), "Heute wichtig (5)");
      // alle acht entscheidungsrelevanten Aufträge bleiben sichtbar –
      // die Abrufgrenze begrenzt nur das Nachladen der Einzel-Overviews.
      assert.strictEqual(rowTitles("today").length, 8);
    },
  );

  await check("V8.9.2 (7): die Zahl basiert ausschlie\u00dflich auf selectToday()", async () => {
    const orders = ui.getState().orders;
    const match = todayHeadingText().match(/^Heute wichtig \((\d+)\)$/);
    assert.ok(match, "die \u00dcberschrift muss dem Muster \u201eHeute wichtig (n)\u201c entsprechen");
    assert.strictEqual(Number(match[1]), ui.selectToday(orders).length);
  });

  await check(
    "V8.9.2 (8/9/10/11/12/13/14/15): gemischte Statusliste – DRAFT, APPROVED_FOR_EXECUTION, IN_EXECUTION und COMPLETED z\u00e4hlen nicht; RETURNED, READY_FOR_REVIEW, BLOCKED und READY_FOR_JAMAL_APPROVAL z\u00e4hlen",
    async () => {
      setOrders([
        { id: "v892-mixed-draft", title: "Entwurf", status: "DRAFT" },
        { id: "v892-mixed-approved", title: "Freigegeben, nicht gestartet", status: "APPROVED_FOR_EXECUTION" },
        { id: "v892-mixed-running", title: "L\u00e4uft gerade", status: "IN_EXECUTION" },
        { id: "v892-mixed-done", title: "Abgeschlossen", status: "COMPLETED" },
        { id: "v892-mixed-returned", title: "Zur\u00fcckgegeben", status: "RETURNED" },
        { id: "v892-mixed-review", title: "Ergebnis liegt vor", status: "READY_FOR_REVIEW" },
        { id: "v892-mixed-blocked", title: "Blockiert", status: "BLOCKED" },
        { id: "v892-mixed-approval", title: "Wartet auf Freigabe", status: "READY_FOR_JAMAL_APPROVAL" },
      ]);
      await reload();
      assert.strictEqual(todayHeadingText(), "Heute wichtig (4)");
      assert.strictEqual(ui.selectToday(ui.getState().orders).length, 4);
    },
  );

  await check(
    "V8.9.2 (16/17): Reihenfolge der Vorg\u00e4nge und Inhalt der Zeilen bleiben unver\u00e4ndert",
    () => {
      assert.deepStrictEqual(rowTitles("today"), [
        "Zur\u00fcckgegeben",
        "Ergebnis liegt vor",
        "Blockiert",
        "Wartet auf Freigabe",
      ]);
      const section = sectionHtml("today");
      assert.ok(section.includes("Entscheidung notwendig"));
      assert.ok(section.includes("Ergebnis wartet auf Pr\u00fcfung"));
      assert.ok(section.includes("Auftrag blockiert"));
      assert.ok(section.includes("Freigabe erforderlich"));
      assert.ok(section.includes("Entscheidung \u00f6ffnen"));
    },
  );

  await check(
    'V8.9.2 (18): Leerzustand von "L\u00e4uft" und "Fertig" bleibt unver\u00e4ndert (weiterhin nicht gerendert, wenn kein laufender/abgeschlossener Auftrag vorhanden ist)',
    async () => {
      setOrders([{ id: "v892-only-today", title: "Nur ein wichtiger Auftrag", status: "BLOCKED" }]);
      await reload();
      assert.strictEqual(sectionExists("running"), false);
      assert.strictEqual(sectionExists("done"), false);
      assert.strictEqual(todayHeadingText(), "Heute wichtig (1)");
    },
  );

  await check("V8.9.2 (19/21/22): keine neue API-Anfrage, keine schreibenden Aufrufe, keine neue Route", () => {
    assert.deepStrictEqual(postCalls(), []);
    fetchCalls.forEach((entry) => {
      assert.strictEqual(entry.method, "GET");
      assert.match(entry.url, /^\/api\/pilot-work-order\/orders/);
    });
    const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
    assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
  });

  await check("V8.9.2 (20): keine Mutation der Auftragsdaten", () => {
    const before = ui.getState().orders.map((order) => `${order.id}:${order.status}`);
    ui.render();
    const after = ui.getState().orders.map((order) => `${order.id}:${order.status}`);
    assert.deepStrictEqual(before, after);
    assert.deepStrictEqual(
      ui.getState().orders.map((order) => `${order.id}:${order.status}`),
      backendOrders.map((order) => `${order.id}:${order.status}`),
    );
  });

  await check("V8.9.2 (23): keine neue Interaktion – dieselben zwei bestehenden Aktionen seit V8.9.5, kein neuer Handler an der \u00dcberschrift", () => {
    const actions = jsChefTodayActions();
    // V8.9.5 – "open-recommended" entfernt, siehe V8.7 Stufe C (48).
    assert.deepStrictEqual(
      actions.slice().sort(),
      ['data-chef-today-action="open-order"', 'data-chef-today-action="open-new-order"'].sort(),
    );
    // V8.9.4 – ehrliche Ergänzung: die eine statische Aktualisierungsaktion
    // aus index.html bleibt von der Navigation getrennt und unverändert.
    assert.deepStrictEqual(htmlStaticChefTodayActions(), ['data-chef-today-action="reload-today"']);
    const headingMatch = sectionHtml("today").match(/<h3>[^<]*<\/h3>/);
    assert.ok(headingMatch, "die \u00dcberschrift muss auffindbar sein");
    assert.doesNotMatch(headingMatch[0], /data-|onclick=/i, "die \u00dcberschrift selbst bleibt reiner Text ohne Bedienelement");
  });

  await check('V8.9.2 (24): der V8.9.1-R\u00fcckweg "Zur\u00fcck zu Heute" bleibt unver\u00e4ndert vorhanden', () => {
    const matches = html.match(/Zur\u00fcck zu Heute/g) || [];
    assert.strictEqual(matches.length, 1);
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.ok(backLinkMatch, "der R\u00fcckweg muss weiterhin als <a>-Element existieren");
    assert.match(backLinkMatch[0], /href="#chef-today-card"/);
  });

  await check("V8.9.2 (25): der sichtbare Zahl-Zusatz enth\u00e4lt keine technische Sprache", async () => {
    setOrders([{ id: "v892-final", title: "Letzter Test-Auftrag", status: "RETURNED" }]);
    await reload();
    const heading = todayHeadingText();
    assert.strictEqual(heading, "Heute wichtig (1)");
    assert.doesNotMatch(heading, /ID|API|JSON|URL|Route|Status|DRAFT|RETURNED|BLOCKED/i);
    assert.doesNotMatch(heading, /[_#{}<>%]/);
  });

  await check("V8.9.2: keine neue Hilfsfunktion und keine Pluralregel wurden erg\u00e4nzt", () => {
    const section = js.match(/function renderTodaySection\(orders\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(section, "renderTodaySection muss auffindbar sein");
    assert.match(
      section[0],
      /"Heute wichtig \(" \+ items\.length \+ "\)"/,
      "die \u00dcberschrift muss items.length direkt und unformatiert einsetzen",
    );
    assert.doesNotMatch(
      section[0],
      /items\.length === 1 \?|items\.length > 1 \?/,
      "keine Fallunterscheidung nach Anzahl (keine Pluralregel)",
    );
    assert.doesNotMatch(section[0], /toFixed|toLocaleString|Math\.min|Math\.max/, "keine Zahlformatierung oder Begrenzung");
  });

  await check("V8.9.2: weiterhin kein schreibender Request \u00fcber den gesamten V8.9.2-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------------
  // V8.9.3 – Ein einziger, klarer Abschlusssatz im Leerzustand: die frühere
  // doppelte Verneinung (R7 aus dem Architekturbericht "V8.9 – Der
  // 15-Sekunden-Chefmodus") entfällt. "Heute wichtig" zeigt im Leerzustand
  // keinen eigenen Text mehr (leerer Abschnittskörper, Überschrift
  // unverändert). "Empfohlene nächste Arbeit" trägt jetzt den einen
  // verbleibenden Satz "Im Moment wartet keine Entscheidung auf dich." –
  // bewusst auf offene Entscheidungen begrenzt statt auf "den ganzen Tag",
  // damit der Satz unabhängig von der offenen Statuslücke R3
  // (DRAFT/APPROVED_FOR_EXECUTION bleiben im Chefmodus unsichtbar) wahr
  // bleibt. Ausschließlich Textänderungen in chef-today-ui.js – keine neue
  // Route, kein neuer Zustand, keine Änderung an styles.css oder index.html.
  // -------------------------------------------------------------------------

  await check('V8.9.3 (1): leerer Tag – "Heute wichtig" bleibt gerendert, aber ohne eigenen Text', async () => {
    setOrders([]);
    await reload();
    assert.strictEqual(sectionExists("today"), true, '"Heute wichtig" muss auch im Leerzustand weiterhin gerendert werden');
    assert.strictEqual(todayHeadingText(), "Heute wichtig");
    assert.ok(
      !sectionHtml("today").includes('class="chef-today-empty"'),
      '"Heute wichtig" darf im Leerzustand keinen Verneinungs-/Ersatztext mehr enthalten',
    );
  });

  await check('V8.9.3 (2): leerer Tag – "Empfohlene n\u00e4chste Arbeit" tr\u00e4gt exakt den einen Abschlusssatz', () => {
    assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));
  });

  await check("V8.9.3 (3): leerer Tag – beide fr\u00fcheren Verneinungstexte erscheinen nirgends mehr", () => {
    assert.ok(!outputHtml().includes("Heute wartet nichts auf deine Entscheidung."));
    assert.ok(!outputHtml().includes("Es gibt heute keine Arbeit, die auf dich wartet."));
  });

  await check("V8.9.3 (4): leerer Tag – der eine Abschlusssatz erscheint genau einmal im gesamten Output", () => {
    const matches = outputHtml().match(/Im Moment wartet keine Entscheidung auf dich\./g) || [];
    assert.strictEqual(matches.length, 1);
  });

  await check('V8.9.3 (5): leerer Tag – "Neuen Auftrag anlegen" bleibt vollst\u00e4ndig erhalten (V8.9.6: nicht mehr als eigener Bereich, sondern als Fu\u00dfaktion)', () => {
    assert.strictEqual(sectionExists("new-order"), false, "V8.9.6: \u201eNeuer Auftrag\u201c ist kein eigener Bereich mehr");
    assert.ok(footHtml().includes("Neuen Auftrag anlegen"));
    const buttons = outputHtml().match(/class="primary-button"/g) || [];
    assert.strictEqual(buttons.length, 0, "V8.9.6: kein prim\u00e4rer Startknopf mehr im Leerzustand");
  });

  await check(
    'V8.9.3 (6)/V8.9.5 (Fall D): "nur l\u00e4uft" (mindestens ein IN_EXECUTION, keine Entscheidung offen) – "Heute wichtig" bleibt ohne Text, die Empfehlung entf\u00e4llt jetzt vollst\u00e4ndig (reine Wiederholung der ersten Zeile aus "L\u00e4uft", keine eigene Aussage), der Abschlusssatz erscheint zu Recht nicht',
    async () => {
      setOrders([{ id: "v893-only-running", title: "Laufender Auftrag ohne Entscheidung", status: "IN_EXECUTION" }]);
      await reload();
      assert.ok(!sectionHtml("today").includes('class="chef-today-empty"'));
      assert.strictEqual(
        sectionExists("recommendation"),
        false,
        "V8.9.5: die Empfehlung entspricht exakt der ersten Zeile aus \u201eL\u00e4uft\u201c und darf nicht gerendert werden",
      );
      assert.ok(!outputHtml().includes("Im Moment wartet keine Entscheidung auf dich."));
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).title, "Laufender Auftrag ohne Entscheidung");
      assert.deepStrictEqual(rowTitles("running"), ["Laufender Auftrag ohne Entscheidung"], "die empfohlene Arbeit bleibt vollst\u00e4ndig \u00fcber \u201eL\u00e4uft\u201c sichtbar/\u00f6ffenbar");
    },
  );

  await check(
    'V8.9.3 (7): "nur fertig" (mindestens ein COMPLETED, keine Entscheidung offen, nichts l\u00e4uft) – "Heute wichtig" bleibt ohne Text, die Empfehlung zeigt den einen Abschlusssatz',
    async () => {
      setOrders([{ id: "v893-only-done", title: "Abgeschlossener Auftrag", status: "COMPLETED" }]);
      await reload();
      assert.ok(!sectionHtml("today").includes('class="chef-today-empty"'));
      assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));
      assert.ok(sectionHtml("done").includes("Abgeschlossener Auftrag"), '"Fertig" bleibt von V8.9.3 unber\u00fchrt');
    },
  );

  await check(
    "V8.9.3 (8)/V8.9.5 (Fall B): Normalfall (genau eine offene Entscheidung) – der Abschlusssatz erscheint zu Recht nicht, die Empfehlung entf\u00e4llt jetzt vollst\u00e4ndig (reine Wiederholung der einzigen Zeile aus \u201eHeute wichtig\u201c)",
    async () => {
      setOrders([{ id: "v893-decision-open", title: "Wichtiger Auftrag", status: "BLOCKED" }]);
      await reload();
      assert.strictEqual(todayHeadingText(), "Heute wichtig (1)");
      assert.deepStrictEqual(rowTitles("today"), ["Wichtiger Auftrag"]);
      assert.ok(!outputHtml().includes("Im Moment wartet keine Entscheidung auf dich."));
      assert.ok(!outputHtml().includes("Heute wartet nichts auf deine Entscheidung."));
      assert.ok(!outputHtml().includes("Es gibt heute keine Arbeit, die auf dich wartet."));
      assert.strictEqual(
        sectionExists("recommendation"),
        false,
        "V8.9.5: die Empfehlung entspricht exakt der einzigen Zeile aus \u201eHeute wichtig\u201c und darf nicht gerendert werden",
      );
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders).title, "Wichtiger Auftrag");
    },
  );

  await check("V8.9.3 (9): die beiden Reihenfolge-Anker bleiben unber\u00fchrt (Nicht-Leerzustand); V8.9.5: \u201eEmpfohlene n\u00e4chste Arbeit\u201c entf\u00e4llt hier zus\u00e4tzlich, da eine offene Entscheidung vorliegt; V8.9.6: \u201eNeuer Auftrag\u201c ist kein Bereich mehr", async () => {
    setOrders([
      { id: "v893-order-today", title: "Wichtiger Auftrag", status: "BLOCKED" },
      { id: "v893-order-running", title: "Laufender Auftrag", status: "IN_EXECUTION" },
      { id: "v893-order-done", title: "Fertiger Auftrag", status: "COMPLETED" },
    ]);
    await reload();
    assert.deepStrictEqual(sectionOrder(), ["today", "running", "done"]);
    assert.strictEqual(footCount(), 1);
    assert.ok(footIsLast());
  });

  await check("V8.9.3 (10): renderTodaySection() liefert im Leerzustand einen leeren String statt renderEmpty(...)", () => {
    const section = js.match(/function renderTodaySection\(orders\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(section, "renderTodaySection muss auffindbar sein");
    assert.match(section[0], /return renderSection\("today", "Heute wichtig", ""\);/, "der Leerzustand von \u201eHeute wichtig\u201c muss einen leeren Abschnittsk\u00f6rper liefern");
    assert.doesNotMatch(section[0], /renderEmpty\(/, "renderEmpty darf im Leerzustand von \u201eHeute wichtig\u201c nicht mehr aufgerufen werden");
  });

  await check('V8.9.3 (11): renderRecommendationSection() nutzt exakt den festgelegten Wortlaut, keine neue Ableitungsfunktion', () => {
    const section = js.match(/function renderRecommendationSection\(orders\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(section, "renderRecommendationSection muss auffindbar sein");
    assert.match(
      section[0],
      /renderEmpty\("Im Moment wartet keine Entscheidung auf dich\."\)/,
      "der Leerzustand von \u201eEmpfohlene n\u00e4chste Arbeit\u201c muss exakt den festgelegten Wortlaut verwenden",
    );
  });

  await check("V8.9.3 (12): keine Ver\u00e4nderung an styles.css oder index.html durch dieses Paket", () => {
    assert.doesNotMatch(css, /chef-today-empty[a-z-]/i, "keine neue, spezialisierte CSS-Klasse f\u00fcr den Leerzustand");
    assert.doesNotMatch(html, /Im Moment wartet keine Entscheidung auf dich/, "der Text lebt ausschlie\u00dflich in chef-today-ui.js, nicht statisch in index.html");
  });

  await check("V8.9.3 (13): keine neue Route, kein schreibender Aufruf, keine Mutation \u00fcber den gesamten V8.9.3-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
    const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
    assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
  });

  // -------------------------------------------------------------------------
  // V8.9.4 – Manuelles "Tag neu laden" im Chefmodus (Jamals Produktentscheidung
  // zum exakten Wortlaut "Aktuellen Stand neu laden" liegt vor): ein neuer,
  // statischer Button in index.html (innerhalb von .chef-today-head, außerhalb
  // von #chef-today-output) löst über die bestehende Klick-Delegation in
  // bindActionHandlersOnce() ausschließlich das bereits bestehende,
  // unveränderte load() aus. Kein Wrapper, kein neuer Event-Listener, kein
  // neuer State, keine neue Route, kein Auto-Refresh, kein Timer, kein
  // Polling, keine Aktualisierung ohne bewusste Nutzerhandlung.
  // -------------------------------------------------------------------------

  await check('V8.9.4 (1): der Button "Aktuellen Stand neu laden" existiert genau einmal in index.html', () => {
    const matches = html.match(/Aktuellen Stand neu laden/g) || [];
    assert.strictEqual(matches.length, 1);
  });

  await check("V8.9.4 (2): der Button liegt innerhalb von #chef-today-card", () => {
    assert.match(htmlChefTodayCardSection(), /Aktuellen Stand neu laden/);
  });

  await check("V8.9.4 (3): der Button liegt innerhalb von .chef-today-head", () => {
    const headMatch = htmlChefTodayCardSection().match(/<div class="chef-today-head">[\s\S]*?<\/div>\s*<div id="chef-today-output"/);
    assert.ok(headMatch, "der Kartenkopf .chef-today-head muss auffindbar und vor #chef-today-output geschlossen sein");
    assert.match(headMatch[0], /Aktuellen Stand neu laden/);
  });

  await check("V8.9.4 (4): der Button steht statisch vor #chef-today-output", () => {
    const card = htmlChefTodayCardSection();
    const buttonIndex = card.indexOf("Aktuellen Stand neu laden");
    const outputIndex = card.indexOf('id="chef-today-output"');
    assert.ok(buttonIndex > -1 && outputIndex > -1);
    assert.ok(buttonIndex < outputIndex, "der Button muss vor #chef-today-output im Markup stehen");
  });

  await check('V8.9.4 (5): der Button ist ein echtes <button type="button">-Element', () => {
    const tagMatch = htmlChefTodayCardSection().match(/<button[^>]*>Aktuellen Stand neu laden<\/button>/);
    assert.ok(tagMatch, "muss als <button>...</button> vorliegen");
    assert.match(tagMatch[0], /type="button"/);
  });

  await check("V8.9.4 (6): der Button ist kein Link (kein <a>, kein href, kein role)", () => {
    const tagMatch = htmlChefTodayCardSection().match(/<button[^>]*>Aktuellen Stand neu laden<\/button>/);
    assert.ok(tagMatch);
    assert.doesNotMatch(tagMatch[0], /href=/);
    assert.doesNotMatch(tagMatch[0], /role=/);
    assert.doesNotMatch(htmlChefTodayCardSection(), /<a\s[^>]*>Aktuellen Stand neu laden<\/a>/);
  });

  await check('V8.9.4 (7): der Button verwendet class="secondary-button"', () => {
    const tagMatch = htmlChefTodayCardSection().match(/<button[^>]*>Aktuellen Stand neu laden<\/button>/);
    assert.match(tagMatch[0], /class="secondary-button"/);
  });

  await check('V8.9.4 (8): der Button verwendet nicht class="primary-button"', () => {
    const tagMatch = htmlChefTodayCardSection().match(/<button[^>]*>Aktuellen Stand neu laden<\/button>/);
    assert.doesNotMatch(tagMatch[0], /primary-button/);
  });

  await check('V8.9.4 (9): der sichtbare Wortlaut lautet exakt "Aktuellen Stand neu laden" (Jamals Produktentscheidung)', () => {
    const match = htmlChefTodayCardSection().match(/<button[^>]*data-chef-today-action="reload-today"[^>]*>([^<]*)<\/button>/);
    assert.ok(match, 'der Button mit data-chef-today-action="reload-today" muss auffindbar sein');
    assert.strictEqual(match[1], "Aktuellen Stand neu laden");
  });

  await check("V8.9.4 (10): der Wortlaut kommt genau einmal innerhalb der Chefmodus-Karte vor", () => {
    const matches = htmlChefTodayCardSection().match(/Aktuellen Stand neu laden/g) || [];
    assert.strictEqual(matches.length, 1);
  });

  await check("V8.9.4 (11): styles.css enth\u00e4lt keine neue CSS-Klasse f\u00fcr diesen Button (secondary-button wird wiederverwendet)", () => {
    assert.doesNotMatch(css, /reload-today/i);
    assert.doesNotMatch(css, /chef-today-reload/i);
    assert.doesNotMatch(css, /chef-today-head[^{]*secondary-button/i);
  });

  await check("V8.9.4 (12): kein zus\u00e4tzlicher Event-Listener (weiterhin genau ein click-Listener auf #chef-today-card, genau zwei addEventListener-Stellen im Quelltext)", () => {
    assert.strictEqual(chefTodayCardClickHandlerCount, 1, "bindActionHandlersOnce() darf w\u00e4hrend des gesamten Testlaufs nur genau einmal binden");
    const addEventListenerCalls = js.match(/\.addEventListener\(/g) || [];
    assert.strictEqual(addEventListenerCalls.length, 2, "weiterhin genau zwei addEventListener-Aufrufe (Kartendelegation, DOMContentLoaded) – kein dritter, neuer Listener");
  });

  await check("V8.9.4 (13): weiterhin kein Auto-Refresh (kein setInterval/setTimeout/requestAnimationFrame/visibilitychange/fokusbasierter Refresh/Polling-Implementierung)", () => {
    assert.doesNotMatch(js, /setInterval/);
    assert.doesNotMatch(js, /setTimeout/);
    assert.doesNotMatch(js, /requestAnimationFrame/);
    assert.doesNotMatch(js, /visibilitychange/);
    assert.doesNotMatch(js, /addEventListener\(\s*["']focus["']/);
    // Bewusst keine reine Textsuche nach dem Wort "Polling": der Modulkopf
    // dokumentiert an mehreren Stellen ausdrücklich dessen Abwesenheit ("kein
    // Polling"). Stattdessen werden die tatsächlichen, aus pilot-work-order-
    // ui.js bekannten Polling-Bausteine ausgeschlossen.
    assert.doesNotMatch(js, /startStatusPolling|stopStatusPolling|statusPolling[A-Za-z]*|syncStatusPollingFromOverview/);
  });

  await check("V8.9.4 (14): weiterhin ausschlie\u00dflich die beiden bestehenden GET-Leserouten, keine neue Route durch den neuen Aktionszweig", () => {
    const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
    assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
    const methods = js.match(/method:\s*"([A-Z]+)"/g) || [];
    assert.deepStrictEqual(methods, ['method: "GET"']);
  });

  await check("V8.9.4 (15): ein bewusster Klick sendet keinen Anfragek\u00f6rper", async () => {
    setOrders([{ id: "v894-a", title: "Auftrag A", status: "BLOCKED" }]);
    await reload();
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    assert.ok(fetchCalls.length > 0, "der Klick muss mindestens einen Abruf ausl\u00f6sen");
    fetchCalls.forEach((call) => assert.strictEqual(call.body, undefined));
  });

  await check("V8.9.4 (16): ein bewusster Klick l\u00f6st genau einen GET auf /api/pilot-work-order/orders aus", async () => {
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    const listCalls = fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(listCalls.length, 1);
  });

  await check("V8.9.4 (17): mehrfaches render() ohne Klick l\u00f6st keinen neuen Abruf aus", () => {
    fetchCalls.length = 0;
    ui.render();
    ui.render();
    ui.render();
    assert.deepStrictEqual(fetchCalls, []);
  });

  await check("V8.9.4 (18): Warten ohne Nutzerhandlung l\u00f6st keinen neuen Abruf aus (kein Auto-Refresh in Echtzeit)", async () => {
    fetchCalls.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepStrictEqual(fetchCalls, [], "ohne Klick darf w\u00e4hrend des Wartens kein einziger Abruf entstehen");
  });

  await check("V8.9.4 (19): zwei bewusste Klicks l\u00f6sen genau zwei Listenabrufe aus, kein Fehler", async () => {
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    clickChefTodayAction("reload-today");
    await flushAsync();
    const listCalls = fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(listCalls.length, 2);
  });

  await check("V8.9.4 (20): eine Statusänderung im Test-Backend bleibt vor dem Klick unsichtbar", () => {
    const before = outputHtml();
    setOrders([
      { id: "v894-b1", title: "Neuer Auftrag B1", status: "RETURNED" },
      { id: "v894-b2", title: "Neuer Auftrag B2", status: "BLOCKED" },
    ]);
    // Bewusst kein reload(), kein Klick – reine Backend-\u00c4nderung, die
    // Karte darf sich davon nicht von selbst beeinflussen lassen.
    assert.strictEqual(outputHtml(), before, "der sichtbare Stand darf sich ohne Klick nicht \u00e4ndern");
  });

  await check("V8.9.4 (21): nach dem bewussten Klick zeigt der Chefmodus den neuen Serverstand", async () => {
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    assert.ok(outputHtml().includes("Neuer Auftrag B1"));
    assert.ok(outputHtml().includes("Neuer Auftrag B2"));
    assert.strictEqual(todayHeadingText(), "Heute wichtig (2)");
  });

  await check("V8.9.4 (22): der Aktualisierungsklick l\u00f6st weder einen Pilotauftrags-Klick noch eine Navigation/Fokus\u00e4nderung aus", async () => {
    pilotClicks.length = 0;
    scrollTargets.length = 0;
    focusCalls = 0;
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    assert.deepStrictEqual(pilotClicks, [], "die Startseite darf dabei selbst nichts in der Pilotauftrags-Karte ausl\u00f6sen");
    assert.deepStrictEqual(scrollTargets, [], "kein Scrollziel wird durch das Aktualisieren ausgel\u00f6st");
    assert.strictEqual(focusCalls, 0, "kein Fokuswechsel wird durch das Aktualisieren ausgel\u00f6st");
  });

  await check("V8.9.4 (23): \u00fcber den gesamten V8.9.4-Testlauf hinweg keine POST-/PATCH-/DELETE-Operation", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  await check("V8.9.4 (24): die bestehenden primary-button-Regeln bleiben unver\u00e4ndert (h\u00f6chstens eine Hauptaktion je Bereich); V8.9.6: kein Bereich und kein Output tr\u00e4gt \u00fcberhaupt noch einen primary-button", () => {
    ["today"].forEach((key) => {
      const buttons = sectionHtml(key).match(/class="primary-button"/g) || [];
      assert.ok(buttons.length <= 1, `Bereich ${key} h\u00e4tte ${buttons.length} Hauptaktionen`);
    });
    // V8.9.5 – zu diesem Zeitpunkt liegen zwei offene Entscheidungen vor
    // (siehe V8.9.4 (20)/(21) oben), "recommendation" entf\u00e4llt deshalb
    // vollst\u00e4ndig.
    assert.strictEqual(sectionExists("recommendation"), false);
    // V8.9.6 – "new-order" ist kein Bereich mehr; der gesamte Output enth\u00e4lt
    // keinen primary-button mehr.
    assert.strictEqual(sectionExists("new-order"), false);
    assert.doesNotMatch(outputHtml(), /class="primary-button"/);
  });

  await check("V8.9.4 (25): der V8.9.3-Leerzustand bleibt unver\u00e4ndert, der Button bleibt sichtbar und bedienbar", async () => {
    setOrders([]);
    await reload();
    assert.strictEqual(todayHeadingText(), "Heute wichtig");
    assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));
    // Der Button selbst ist statisch in index.html verankert, nicht Teil von
    // #chef-today-output – er bleibt unabh\u00e4ngig vom Leerzustand vorhanden.
    assert.strictEqual((html.match(/Aktuellen Stand neu laden/g) || []).length, 1);
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    assert.strictEqual(
      fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders").length,
      1,
      "der Button bleibt auch im Leerzustand bedienbar",
    );
  });

  await check('V8.9.4 (26): V8.9.2 "Heute wichtig (n)" bleibt nach einem manuellen Neuladen unver\u00e4ndert korrekt', async () => {
    setOrders([
      { id: "v894-c1", title: "Auftrag C1", status: "BLOCKED" },
      { id: "v894-c2", title: "Auftrag C2", status: "RETURNED" },
      { id: "v894-c3", title: "Auftrag C3", status: "READY_FOR_REVIEW" },
    ]);
    fetchCalls.length = 0;
    clickChefTodayAction("reload-today");
    await flushAsync();
    assert.strictEqual(todayHeadingText(), "Heute wichtig (3)");
  });

  await check('V8.9.4 (27): V8.9.1 "Zur\u00fcck zu Heute" bleibt unver\u00e4ndert vorhanden und korrekt verlinkt', () => {
    const matches = html.match(/Zur\u00fcck zu Heute/g) || [];
    assert.strictEqual(matches.length, 1);
    const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
    assert.ok(backLinkMatch, "der R\u00fcckweg muss weiterhin als <a>-Element existieren");
    assert.match(backLinkMatch[0], /href="#chef-today-card"/);
  });

  await check("V8.9.4: load() selbst, todayOverviewByOrderId und progressByOrderId wurden funktional nicht ver\u00e4ndert (nur der neue Aufrufpfad kam hinzu)", () => {
    const loadFn = js.match(/function load\(\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(loadFn, "load() muss auffindbar sein");
    assert.match(loadFn[0], /fetchJson\("\/api\/pilot-work-order\/orders"\)/);
    assert.match(loadFn[0], /Promise\.all\(\[loadRunningProgress\(\), loadTodayOverviews\(\)\]\)/);
    assert.doesNotMatch(loadFn[0], /reload-today/, "load() selbst kennt den neuen Aktionsnamen nicht \u2013 er wird ausschlie\u00dflich in bindActionHandlersOnce() verwendet");
  });

  // -------------------------------------------------------------------------
  // V8.9.5 – Empfehlungsabschnitt nur zeigen, wenn er eine eigene Aussage
  // trägt (rein darstellend, additiv zu V8.8.1/V8.9.2/V8.9.3/V8.9.4 – Ziel
  // des von Jamal geprüften und freigegebenen V8.9.5-Analyseberichts):
  // selectRecommendedNextWork() liefert strukturell immer entweder den
  // ersten Eintrag aus selectToday() oder, falls dort nichts steht, den
  // ersten Eintrag aus selectRunning() (siehe buildAgenda()) – also
  // denselben Auftrag, der bereits als erste Zeile in "Heute wichtig" bzw.
  // "Läuft" sichtbar ist. renderRecommendationSection() rendert den
  // Abschnitt deshalb jetzt nur noch, wenn selectRecommendedNextWork()
  // `null` liefert (keine offene Entscheidung, keine laufende Arbeit) –
  // dann unverändert mit der bereits in V8.9.3 freigegebenen Überschrift
  // und dem einen Abschlusssatz. Fälle A–J unten decken exakt die im
  // freigegebenen Analysebericht benannte Fallmatrix ab.
  // -------------------------------------------------------------------------

  await check(
    "V8.9.5 (A): vollst\u00e4ndig leerer Tag \u2013 Empfehlungsabschnitt bleibt vorhanden, \u00dcberschrift und Satz exakt; V8.9.6: \u201eNeuer Auftrag\u201c bleibt \u00fcber die Fu\u00dfzone erhalten (kein eigener Bereich mehr)",
    async () => {
      setOrders([]);
      await reload();
      assert.strictEqual(
        sectionExists("recommendation"),
        true,
        "im vollst\u00e4ndig leeren Zustand tr\u00e4gt die Sektion die einzige eigene Aussage",
      );
      const section = sectionHtml("recommendation");
      const headingMatch = section.match(/<h3>([^<]*)<\/h3>/);
      assert.ok(headingMatch, "die \u00dcberschrift muss auffindbar sein");
      assert.strictEqual(
        headingMatch[1],
        "Empfohlene n\u00e4chste Arbeit",
        "die \u00dcberschrift bleibt exakt unver\u00e4ndert (keine Umbenennung in V8.9.5)",
      );
      assert.ok(
        section.includes("Im Moment wartet keine Entscheidung auf dich."),
        "der V8.9.3-Satz muss exakt unver\u00e4ndert sichtbar sein",
      );
      assert.strictEqual(sectionExists("new-order"), false, "V8.9.6: \u201eNeuer Auftrag\u201c ist kein eigener Bereich mehr");
      assert.ok(footHtml().includes("Neuen Auftrag anlegen"), "\u201eNeuer Auftrag\u201c bleibt unabh\u00e4ngig \u00fcber die Fu\u00dfzone bestehen");
      assert.ok(footIsLast());
    },
  );

  await check(
    "V8.9.5 (B): genau eine offene Entscheidung \u2013 Empfehlung vollst\u00e4ndig abwesend, \u201eHeute wichtig (1)\u201c korrekt, Auftrag weiterhin \u00f6ffenbar",
    async () => {
      setOrders([{ id: "v895-single-decision", title: "Einzelne offene Entscheidung", status: "BLOCKED" }]);
      await reload();
      assert.strictEqual(sectionExists("recommendation"), false);
      assert.strictEqual(todayHeadingText(), "Heute wichtig (1)");
      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
      pilotClicks.length = 0;
      const opened = ui.openOrder("v895-single-decision");
      assert.strictEqual(opened, true, "der Auftrag bleibt vollst\u00e4ndig \u00fcber seine Zeile in \u201eHeute wichtig\u201c \u00f6ffenbar");
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v895-single-decision" }]);
    },
  );

  await check(
    "V8.9.5 (C): mehrere offene Entscheidungen \u2013 Empfehlung vollst\u00e4ndig abwesend, alle Entscheidungszeilen bleiben sichtbar und \u00f6ffenbar",
    async () => {
      setOrders([
        { id: "v895-multi-1", title: "Erste offene Entscheidung", status: "RETURNED" },
        { id: "v895-multi-2", title: "Zweite offene Entscheidung", status: "READY_FOR_REVIEW" },
        { id: "v895-multi-3", title: "Dritte offene Entscheidung", status: "BLOCKED" },
      ]);
      await reload();
      assert.strictEqual(sectionExists("recommendation"), false);
      assert.deepStrictEqual(rowTitles("today"), [
        "Erste offene Entscheidung",
        "Zweite offene Entscheidung",
        "Dritte offene Entscheidung",
      ]);
      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
      ["v895-multi-1", "v895-multi-2", "v895-multi-3"].forEach((orderId) => {
        pilotClicks.length = 0;
        const opened = ui.openOrder(orderId);
        assert.strictEqual(opened, true, `${orderId} muss weiterhin \u00f6ffenbar sein`);
      });
    },
  );

  await check(
    "V8.9.5 (D): nur laufende Arbeit \u2013 Empfehlung vollst\u00e4ndig abwesend, \u201eL\u00e4uft\u201c vorhanden, Auftrag weiterhin \u00f6ffenbar",
    async () => {
      setOrders([{ id: "v895-only-running", title: "Laufende Arbeit ohne Entscheidung", status: "IN_EXECUTION" }]);
      await reload();
      assert.strictEqual(sectionExists("recommendation"), false);
      assert.strictEqual(sectionExists("running"), true);
      assert.deepStrictEqual(rowTitles("running"), ["Laufende Arbeit ohne Entscheidung"]);
      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));
      pilotClicks.length = 0;
      const opened = ui.openOrder("v895-only-running");
      assert.strictEqual(opened, true, "der laufende Auftrag bleibt vollst\u00e4ndig \u00fcber seine Zeile in \u201eL\u00e4uft\u201c \u00f6ffenbar");
    },
  );

  await check(
    "V8.9.5 (E): nur abgeschlossene Arbeit \u2013 Empfehlung bleibt vorhanden mit dem V8.9.3-Satz, \u201eFertig\u201c korrekt sichtbar",
    async () => {
      setOrders([{ id: "v895-only-done", title: "Abgeschlossene Arbeit", status: "COMPLETED" }]);
      await reload();
      assert.strictEqual(
        sectionExists("recommendation"),
        true,
        "ohne offene Entscheidung und ohne laufende Arbeit tr\u00e4gt die Sektion wieder die eigene Aussage",
      );
      assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));
      assert.strictEqual(sectionExists("done"), true);
      assert.deepStrictEqual(rowTitles("done"), ["Abgeschlossene Arbeit"]);
    },
  );

  await check(
    "V8.9.5 (F): offene Entscheidung + laufende Arbeit \u2013 Empfehlung vollst\u00e4ndig abwesend, \u201eHeute wichtig\u201c und \u201eL\u00e4uft\u201c korrekt, keine Doppelung",
    async () => {
      setOrders([
        { id: "v895-mixed-decision", title: "Offene Entscheidung", status: "BLOCKED" },
        { id: "v895-mixed-running", title: "Laufende Arbeit", status: "IN_EXECUTION" },
      ]);
      await reload();
      assert.strictEqual(sectionExists("recommendation"), false);
      assert.deepStrictEqual(rowTitles("today"), ["Offene Entscheidung"]);
      assert.deepStrictEqual(rowTitles("running"), ["Laufende Arbeit"]);
      assert.strictEqual(
        ui.selectRecommendedNextWork(ui.getState().orders).title,
        "Offene Entscheidung",
        "Bereich A gewinnt weiterhin vor Bereich C (buildAgenda() unver\u00e4ndert)",
      );
    },
  );

  await check(
    "V8.9.5 (G): Nachweis der strukturellen Regel \u2013 bei recommended !== null kein Recommendation-Markup, bei recommended === null genau ein Recommendation-Abschnitt",
    async () => {
      setOrders([{ id: "v895-structural-decision", title: "Strukturtest-Auftrag", status: "BLOCKED" }]);
      await reload();
      assert.ok(ui.selectRecommendedNextWork(ui.getState().orders));
      assert.doesNotMatch(outputHtml(), /data-chef-today-section="recommendation"/);
      assert.doesNotMatch(outputHtml(), /chef-today-recommendation-title/);
      assert.doesNotMatch(outputHtml(), /Diese Arbeit \u00f6ffnen/);

      setOrders([]);
      await reload();
      assert.strictEqual(ui.selectRecommendedNextWork(ui.getState().orders), null);
      const matches = outputHtml().match(/data-chef-today-section="recommendation"/g) || [];
      assert.strictEqual(matches.length, 1, "genau ein Recommendation-Abschnitt im Leerzustand");
    },
  );

  await check(
    "V8.9.5 (H): Abschnittsreihenfolge \u2013 nicht-leerer Mischfall ohne recommendation, vollst\u00e4ndiger Leerzustand weiterhin mit recommendation an zweiter Stelle; V8.9.6: die Fu\u00dfzone ist in beiden F\u00e4llen zus\u00e4tzlich und immer zuletzt, aber nie Teil von sectionOrder()",
    async () => {
      setOrders([
        { id: "v895-order-decision", title: "Wichtiger Auftrag", status: "BLOCKED" },
        { id: "v895-order-running", title: "Laufender Auftrag", status: "IN_EXECUTION" },
        { id: "v895-order-done", title: "Fertiger Auftrag", status: "COMPLETED" },
      ]);
      await reload();
      assert.deepStrictEqual(sectionOrder(), ["today", "running", "done"]);
      assert.strictEqual(footCount(), 1);
      assert.ok(footIsLast());

      setOrders([]);
      await reload();
      assert.deepStrictEqual(sectionOrder(), ["today", "recommendation"]);
      assert.strictEqual(footCount(), 1);
      assert.ok(footIsLast());
    },
  );

  await check(
    "V8.9.5 (I): Bestandsschutz \u2013 V8.9.2 \u201eHeute wichtig (n)\u201c, V8.9.3-Leerzustand, V8.9.4-Reload-Button und V8.9.1-R\u00fcckweg bleiben unver\u00e4ndert",
    async () => {
      setOrders([
        { id: "v895-regress-1", title: "Auftrag 1", status: "RETURNED" },
        { id: "v895-regress-2", title: "Auftrag 2", status: "BLOCKED" },
      ]);
      await reload();
      assert.strictEqual(todayHeadingText(), "Heute wichtig (2)");

      setOrders([]);
      await reload();
      assert.strictEqual(todayHeadingText(), "Heute wichtig");
      assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));

      assert.strictEqual((html.match(/Aktuellen Stand neu laden/g) || []).length, 1);
      fetchCalls.length = 0;
      clickChefTodayAction("reload-today");
      await flushAsync();
      assert.strictEqual(
        fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders").length,
        1,
        "der V8.9.4-Button bleibt unver\u00e4ndert bedienbar",
      );

      const matches = html.match(/Zur\u00fcck zu Heute/g) || [];
      assert.strictEqual(matches.length, 1);
      const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
      assert.match(backLinkMatch[0], /href="#chef-today-card"/, "der V8.9.1-R\u00fcckweg bleibt unver\u00e4ndert");
    },
  );

  await check(
    "V8.9.5 (J): keine neue Komplexit\u00e4t \u2013 keine neue Route, kein POST/PATCH/DELETE, kein neuer Fetch, keine neue Sortierung/Priorisierung, kein Auto-Refresh, keine neue CSS-Klasse",
    () => {
      assert.deepStrictEqual(postCalls(), []);
      assert.doesNotMatch(js, /"POST"|'POST'|"PATCH"|'PATCH'|"DELETE"|'DELETE'/);
      const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
      assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
      assert.doesNotMatch(js, /setInterval|setTimeout\(load|requestAnimationFrame|visibilitychange/);
      const recommend = js.match(/function selectRecommendedNextWork\(orders\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(recommend, "selectRecommendedNextWork muss auffindbar sein");
      assert.doesNotMatch(recommend[0], /sort|score|weight|priorit/i, "keine neue Sortierungs-/Priorisierungslogik");
      const buildAgendaFn = js.match(/function buildAgenda\(orders\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(buildAgendaFn, "buildAgenda muss auffindbar sein");
      assert.match(
        buildAgendaFn[0],
        /selectToday\(orders\)\.concat\(selectRunning\(orders\)\)/,
        "buildAgenda() bleibt unver\u00e4ndert",
      );
      assert.doesNotMatch(css, /\.chef-today-recommendation-(hidden|collapsed|guard)/, "keine neue CSS-Klasse f\u00fcr das Ausblenden");
    },
  );

  await check(
    "V8.9.5: der tote Bedienpfad \u201eopen-recommended\u201c existiert im produktiven Chefmodus-Markup nicht mehr und ist auch nicht mehr als HTML-Literal im Quelltext vorhanden",
    () => {
      assert.doesNotMatch(js, /data-chef-today-action="open-recommended"/);
      assert.doesNotMatch(html, /data-chef-today-action="open-recommended"/);
      assert.strictEqual(typeof ui.openRecommendedWork, "undefined", "openRecommendedWork() muss vollst\u00e4ndig entfernt sein");
    },
  );

  await check(
    "V8.9.5: selectRecommendedNextWork(), buildAgenda(), selectToday(), selectRunning() und selectDone() bleiben unver\u00e4ndert exportiert (keine neue Auswahllogik)",
    () => {
      assert.strictEqual(typeof ui.selectRecommendedNextWork, "function");
      assert.strictEqual(typeof ui.buildAgenda, "function");
      assert.strictEqual(typeof ui.selectToday, "function");
      assert.strictEqual(typeof ui.selectRunning, "function");
      assert.strictEqual(typeof ui.selectDone, "function");
    },
  );

  await check("V8.9.5: weiterhin kein schreibender Request \u00fcber den gesamten V8.9.5-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------------
  // V8.9.6 ("'Neuer Auftrag' zur sekund\u00e4ren Fu\u00dfaktion herabstufen", rein
  // darstellend \u2013 Ergebnis des von Jamal gepr\u00fcften und freigegebenen
  // V8.9.6-Analyseberichts): der bisherige eigene Abschnitt "Neuer Auftrag"
  // (renderNewOrderSection(), <section data-chef-today-section="new-order">,
  // eigene \u00dcberschrift, eigener Erkl\u00e4rsatz, primary-button) entf\u00e4llt
  // vollst\u00e4ndig. renderFootActions() rendert stattdessen eine benannte,
  // ungestylte Fu\u00dfzone (<div class="chef-today-foot"
  // data-chef-today-foot="actions">) mit genau einem secondary-button, der
  // weiterhin exakt data-chef-today-action="open-new-order" tr\u00e4gt und
  // openNewOrder() unver\u00e4ndert ausl\u00f6st. render() h\u00e4ngt die Fu\u00dfzone jetzt
  // als letztes Element an #chef-today-output an.
  // -------------------------------------------------------------------------

  await check(
    "V8.9.6 (A): kein new-order-Abschnitt mehr in irgendeinem gepr\u00fcften Datenzustand \u2013 weder Marker noch \u00dcberschrift noch Erkl\u00e4rsatz",
    async () => {
      const states = [
        [],
        [{ id: "v896-a-decision", title: "Offene Entscheidung", status: "BLOCKED" }],
        [{ id: "v896-a-running", title: "Laufender Auftrag", status: "IN_EXECUTION" }],
        [{ id: "v896-a-done", title: "Fertiger Auftrag", status: "COMPLETED" }],
        [
          { id: "v896-a-decision2", title: "Offene Entscheidung 2", status: "BLOCKED" },
          { id: "v896-a-running2", title: "Laufender Auftrag 2", status: "IN_EXECUTION" },
          { id: "v896-a-done2", title: "Fertiger Auftrag 2", status: "COMPLETED" },
        ],
      ];
      for (const orders of states) {
        setOrders(orders);
        await reload();
        assert.strictEqual(sectionExists("new-order"), false, 'kein data-chef-today-section="new-order"');
        assert.doesNotMatch(outputHtml(), /Neuer Auftrag(?!\s*<)/, 'die \u00dcberschrift "Neuer Auftrag" darf nirgends erscheinen');
        assert.doesNotMatch(
          outputHtml(),
          /Ein neuer Auftrag entsteht weiterhin im Pilotauftrag\./,
          "der bisherige Erkl\u00e4rsatz darf nirgends erscheinen",
        );
      }
      assert.doesNotMatch(js, /data-chef-today-section="new-order"/, "der Quelltext selbst darf dieses Literal nicht mehr enthalten");
      assert.doesNotMatch(js, /function renderNewOrderSection/, "renderNewOrderSection() muss vollst\u00e4ndig entfernt sein");
    },
  );

  await check(
    "V8.9.6 (B): genau eine Fu\u00dfzone im Output, eindeutiger Marker data-chef-today-foot=\"actions\", sie ist das letzte Element und steht hinter dem letzten sichtbaren Tagesabschnitt",
    async () => {
      setOrders([
        { id: "v896-b-decision", title: "Offene Entscheidung", status: "BLOCKED" },
        { id: "v896-b-running", title: "Laufender Auftrag", status: "IN_EXECUTION" },
        { id: "v896-b-done", title: "Fertiger Auftrag", status: "COMPLETED" },
      ]);
      await reload();
      assert.strictEqual(footCount(), 1);
      assert.ok(footIsLast());
      const currentHtml = outputHtml();
      const footIndex = currentHtml.indexOf('data-chef-today-foot="actions"');
      const lastSectionCloseIndex = currentHtml.lastIndexOf("</section>");
      assert.ok(footIndex > lastSectionCloseIndex, "die Fu\u00dfzone steht nach dem letzten schlie\u00dfenden </section>-Tag");
      assert.ok(currentHtml.trim().endsWith("</div>"), "die Fu\u00dfzone ist das letzte Element im Output");
    },
  );

  await check(
    'V8.9.6 (C): genau ein Button in der Fu\u00dfzone, echtes <button type="button">, class="secondary-button", kein primary-button, data-chef-today-action="open-new-order", exakter Wortlaut, kein <a>/href/role/disabled/aria-hidden',
    () => {
      const foot = footHtml();
      const buttonTags = foot.match(/<button\b[^>]*>/g) || [];
      assert.strictEqual(buttonTags.length, 1, "genau ein Button in der Fu\u00dfzone");
      const buttonTag = buttonTags[0];
      assert.match(buttonTag, /type="button"/);
      assert.match(buttonTag, /class="secondary-button"/);
      assert.doesNotMatch(buttonTag, /primary-button/);
      assert.match(buttonTag, /data-chef-today-action="open-new-order"/);
      assert.doesNotMatch(buttonTag, /href=/);
      assert.doesNotMatch(buttonTag, /\brole=/);
      assert.doesNotMatch(buttonTag, /disabled/);
      assert.doesNotMatch(buttonTag, /aria-hidden/);
      assert.doesNotMatch(foot, /<a[\s>]/);
      const wordingMatch = foot.match(/<button[^>]*>([^<]*)<\/button>/);
      assert.ok(wordingMatch, "der Button-Text muss auffindbar sein");
      assert.strictEqual(wordingMatch[1], "Neuen Auftrag anlegen");
    },
  );

  await check(
    "V8.9.6 (D): Regressionsguard gegen Wiederaufstieg \u2013 chef-today-ui.js enth\u00e4lt kein primary-button-Literal mehr, der Output enth\u00e4lt in keinem gepr\u00fcften Datenzustand einen primary-button, die Aktion bleibt trotzdem sichtbar und bedienbar",
    async () => {
      // Bewusst nur das tatsächliche Code-Literal (Attributwert in
      // Anführungszeichen), nicht das bloße Wort in erklärender Prosa: der
      // Modulkopf beschreibt die Entfernung von "primary-button" additiv
      // (siehe V8.9.6-Eintrag oben) – das ist gewollte Dokumentation, kein
      // Wiederaufstieg des Codes selbst.
      assert.doesNotMatch(js, /class="primary-button"/, "chef-today-ui.js darf das primary-button-Klassenliteral nicht mehr enthalten");
      const states = [
        [],
        [{ id: "v896-d-decision", title: "Entscheidung", status: "BLOCKED" }],
        [{ id: "v896-d-running", title: "L\u00e4uft", status: "IN_EXECUTION" }],
        [{ id: "v896-d-done", title: "Fertig", status: "COMPLETED" }],
      ];
      for (const orders of states) {
        setOrders(orders);
        await reload();
        assert.doesNotMatch(outputHtml(), /class="primary-button"/);
        assert.ok(footHtml().includes("Neuen Auftrag anlegen"), "die Aktion bleibt sichtbar");
      }
    },
  );

  await check(
    "V8.9.6 (E): Section-Reihenfolge in allen gepr\u00fcften Zust\u00e4nden \u2013 die Fu\u00dfzone ist jeweils zus\u00e4tzlich und immer zuletzt, aber niemals Teil von sectionOrder()",
    async () => {
      const matrix = [
        { label: "leerer Tag", orders: [], expected: ["today", "recommendation"] },
        {
          label: "eine offene Entscheidung",
          orders: [{ id: "v896-e-1", title: "Entscheidung 1", status: "BLOCKED" }],
          expected: ["today"],
        },
        {
          label: "mehrere offene Entscheidungen",
          orders: [
            { id: "v896-e-2a", title: "Entscheidung 2a", status: "RETURNED" },
            { id: "v896-e-2b", title: "Entscheidung 2b", status: "BLOCKED" },
          ],
          expected: ["today"],
        },
        {
          label: "nur l\u00e4uft",
          orders: [{ id: "v896-e-3", title: "L\u00e4uft 3", status: "IN_EXECUTION" }],
          expected: ["today", "running"],
        },
        {
          label: "nur fertig",
          orders: [{ id: "v896-e-4", title: "Fertig 4", status: "COMPLETED" }],
          expected: ["today", "recommendation", "done"],
        },
        {
          label: "offen + l\u00e4uft",
          orders: [
            { id: "v896-e-5a", title: "Entscheidung 5", status: "BLOCKED" },
            { id: "v896-e-5b", title: "L\u00e4uft 5", status: "IN_EXECUTION" },
          ],
          expected: ["today", "running"],
        },
        {
          label: "offen + l\u00e4uft + fertig",
          orders: [
            { id: "v896-e-6a", title: "Entscheidung 6", status: "BLOCKED" },
            { id: "v896-e-6b", title: "L\u00e4uft 6", status: "IN_EXECUTION" },
            { id: "v896-e-6c", title: "Fertig 6", status: "COMPLETED" },
          ],
          expected: ["today", "running", "done"],
        },
      ];
      for (const testCase of matrix) {
        setOrders(testCase.orders);
        await reload();
        assert.deepStrictEqual(sectionOrder(), testCase.expected, `Zustand "${testCase.label}"`);
        assert.strictEqual(sectionExists("new-order"), false, `Zustand "${testCase.label}": kein new-order-Bereich`);
        assert.strictEqual(footCount(), 1, `Zustand "${testCase.label}": genau eine Fu\u00dfzone`);
        assert.ok(footIsLast(), `Zustand "${testCase.label}": Fu\u00dfzone steht zuletzt`);
      }
    },
  );

  await check(
    "V8.9.6 (F): Bestandsschutz V8.9.1\u2013V8.9.5 \u2013 \u201eHeute wichtig (n)\u201c, V8.9.3-Satz, Reload-Button, Recommendation-Sichtbarkeit und R\u00fcckweg bleiben unver\u00e4ndert",
    async () => {
      setOrders([
        { id: "v896-f-1", title: "Auftrag F1", status: "RETURNED" },
        { id: "v896-f-2", title: "Auftrag F2", status: "BLOCKED" },
      ]);
      await reload();
      // V8.9.2
      assert.strictEqual(todayHeadingText(), "Heute wichtig (2)");
      // V8.9.5 – Empfehlung entfällt bei offener Entscheidung
      assert.strictEqual(sectionExists("recommendation"), false);

      setOrders([]);
      await reload();
      // V8.9.2 Leerzustand ohne Klammerzusatz
      assert.strictEqual(todayHeadingText(), "Heute wichtig");
      // V8.9.3-Satz
      assert.ok(sectionHtml("recommendation").includes("Im Moment wartet keine Entscheidung auf dich."));

      // V8.9.4 – Reload-Button
      assert.strictEqual((html.match(/Aktuellen Stand neu laden/g) || []).length, 1);
      fetchCalls.length = 0;
      clickChefTodayAction("reload-today");
      await flushAsync();
      assert.strictEqual(
        fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders").length,
        1,
        "der V8.9.4-Reload-Button bleibt unver\u00e4ndert bedienbar",
      );

      // V8.9.1 – Rückweg
      const backLinkMatch = html.match(/<a\s[^>]*>Zur\u00fcck zu Heute<\/a>/);
      assert.ok(backLinkMatch);
      assert.match(backLinkMatch[0], /href="#chef-today-card"/);
    },
  );

  await check(
    "V8.9.6 (G): ein delegierter Klick auf die neue Fu\u00dfaktion l\u00f6st weiterhin exakt das bestehende openNewOrder()-Verhalten aus \u2013 Formular \u00f6ffnet sich, Titelfeld wird gescrollt und fokussiert, kein zweites Formular, kein Fetch, kein POST, keine Statusänderung; ein bereits ge\u00f6ffnetes Formular wird nicht geschlossen",
    async () => {
      delete domElements["pilot-order-create-title"];
      createFormOpen = false;
      setOrders([{ id: "v896-g-1", title: "Auftrag G1", status: "BLOCKED" }]);
      await reload();
      const statusesBefore = ui.getState().orders.map((order) => order.status);

      pilotControls = [makePilotControl("toggle-create-form")];
      pilotClicks.length = 0;
      scrollTargets.length = 0;
      focusCalls = 0;
      fetchCalls.length = 0;
      clickChefTodayAction("open-new-order");
      assert.deepStrictEqual(pilotClicks, [{ action: "toggle-create-form", orderId: null }], "das bestehende Anlageformular wird ge\u00f6ffnet");
      assert.deepStrictEqual(scrollTargets, ["create-form-title"], "das Titelfeld wird gescrollt");
      assert.strictEqual(focusCalls, 1, "das Titelfeld wird fokussiert");
      assert.deepStrictEqual(postCalls(), [], "kein Fetch, kein POST durch den Klick");
      assert.deepStrictEqual(
        ui.getState().orders.map((order) => order.status),
        statusesBefore,
        "keine Statusänderung durch den Klick",
      );

      // Erneutes Auslösen bei bereits offenem Formular: es bleibt offen.
      pilotClicks.length = 0;
      scrollTargets.length = 0;
      focusCalls = 0;
      clickChefTodayAction("open-new-order");
      assert.deepStrictEqual(pilotClicks, [], "ein bereits offenes Formular wird nicht erneut umgeschaltet, also nicht geschlossen");
      assert.deepStrictEqual(scrollTargets, ["create-form-title"]);
      assert.strictEqual(focusCalls, 1, "das bereits offene Formular wird weiterhin korrekt fokussiert");

      delete domElements["pilot-order-create-title"];
      createFormOpen = false;
    },
  );

  await check(
    "V8.9.6 (H): keine neue Komplexit\u00e4t \u2013 keine neue Route, keine neue API, kein neuer State, kein neuer Event-Listener, kein neuer Export, kein Auto-Refresh, kein Polling, kein Timer, keine neue CSS-Regel",
    () => {
      assert.deepStrictEqual(postCalls(), []);
      const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
      assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
      assert.strictEqual(chefTodayCardClickHandlerCount, 1, "weiterhin genau ein click-Listener auf #chef-today-card");
      assert.doesNotMatch(js, /setInterval|setTimeout\(load|requestAnimationFrame|visibilitychange/);
      assert.doesNotMatch(css, /\.chef-today-foot/, "styles.css bleibt ohne eigene Regel f\u00fcr die neue Fu\u00dfzone (erster Versuch bewusst ungestylt)");
      assert.deepStrictEqual(
        Object.keys(ui.getState()).sort(),
        ["error", "loading", "orders", "progressByOrderId", "todayOverviewByOrderId"].sort(),
        "kein neues State-Feld",
      );
      assert.strictEqual(typeof ui.renderFootActions, "undefined", "renderFootActions() ist bewusst nicht exportiert (wie zuvor renderNewOrderSection())");
      assert.strictEqual(typeof ui.renderNewOrderSection, "undefined");
      assert.strictEqual(Object.keys(ui).length, 30, "die Anzahl exportierter Namen bleibt unver\u00e4ndert");
    },
  );

  await check("V8.9.6: weiterhin kein schreibender Request \u00fcber den gesamten V8.9.6-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  // -------------------------------------------------------------------------
  // V8.9.7 ("Zweistufige Zeilendarstellung in 'Heute wichtig'", CSS-only \u2013
  // Jamals Produktentscheidung Variante A "Ruhiger, aber vollst\u00e4ndig"): die
  // fr\u00fchere V8.9-Planungsformulierung, nach der Zeilen 2+ fachlich weniger
  // Information tragen sollten, wird hier bewusst NICHT umgesetzt \u2013
  // "kompakt" bedeutet ab V8.9.7 verbindlich ausschlie\u00dflich optisch
  // kompakter, niemals informationsreduziert. renderTodayRow(),
  // renderTodaySection(), selectToday(), TODAY_STATUS_ORDER, selectRunning(),
  // selectDone(), buildAgenda(), selectRecommendedNextWork(),
  // renderRecommendationSection(), openOrder(), openNewOrder(), load() und
  // die Reload-Logik bleiben unver\u00e4ndert \u2013 chef-today-ui.js ist bis auf den
  // additiven Modulkopf-Kommentar funktional bytegleich. Die gesamte
  // visuelle Zweistufigkeit entsteht ausschlie\u00dflich \u00fcber neue, auf
  // [data-chef-today-section="today"] gescopte CSS-Regeln
  // (:first-child/:not(:first-child) auf der bereits vorhandenen
  // .chef-today-row) \u2013 keine neue Klasse, kein neuer Index-Parameter, keine
  // neue Sortierung, kein Score, keine Gewichtung. "L\u00e4uft" und "Fertig"
  // sind nicht betroffen.
  // -------------------------------------------------------------------------

  await check(
    "V8.9.7 (1): die neuen CSS-Regeln existieren, sind CSS-only und ausschlie\u00dflich auf [data-chef-today-section=\"today\"] gescoped \u2013 keine neue Klasse und kein neuer Index-Parameter in chef-today-ui.js",
    () => {
      const v897CssMarker = '[data-chef-today-section="today"] .chef-today-list';
      const v897CssIndex = css.indexOf(v897CssMarker);
      assert.ok(v897CssIndex > -1, "die neuen V8.9.7-Regeln m\u00fcssen auffindbar sein");
      const v897Css = css.slice(v897CssIndex);
      assert.match(v897Css, /\.chef-today-row:first-child\s*\{/);
      assert.match(v897Css, /\.chef-today-row:first-child \.chef-today-row-title\s*\{/);
      assert.match(v897Css, /\.chef-today-row:not\(:first-child\)\s*\{/);

      // Gegenprobe: es existiert im gesamten Stylesheet keine weitere
      // First-Row-/Compact-Regel als die drei oben genannten \u2013 insbesondere
      // keine f\u00fcr "L\u00e4uft" oder "Fertig".
      const firstChildMatches = css.match(/\.chef-today-row:first-child/g) || [];
      assert.strictEqual(firstChildMatches.length, 2, "genau die Basis- und Titel-Regel der Today-Section, keine weitere");
      const notFirstChildMatches = css.match(/\.chef-today-row:not\(:first-child\)/g) || [];
      assert.strictEqual(notFirstChildMatches.length, 1, "genau eine Kompakt-Regel, ausschlie\u00dflich f\u00fcr die Today-Section");

      assert.doesNotMatch(
        js,
        /chef-today-row--|chef-today-row-lead|chef-today-row-compact|chef-today-row-first/,
        "keine neue Modifier-Klasse in chef-today-ui.js",
      );
      assert.doesNotMatch(js, /function renderTodayRow\(order, ?\s*index/, "renderTodayRow() erh\u00e4lt keinen neuen Index-Parameter");
      assert.doesNotMatch(js, /function renderTodaySection\(orders, ?\s*index/, "renderTodaySection() erh\u00e4lt keinen neuen Index-Parameter");
    },
  );

  await check(
    'V8.9.7 (2): "L\u00e4uft" und "Fertig" bekommen keine neue First-Row-/Compact-Regel und bleiben inhaltlich unver\u00e4ndert',
    async () => {
      setOrders([
        { id: "v897-scope-running1", title: "L\u00e4uft 1", status: "IN_EXECUTION" },
        { id: "v897-scope-running2", title: "L\u00e4uft 2", status: "IN_EXECUTION" },
        { id: "v897-scope-done1", title: "Fertig 1", status: "COMPLETED" },
        { id: "v897-scope-done2", title: "Fertig 2", status: "COMPLETED" },
      ]);
      await reload();
      assert.doesNotMatch(css, /\[data-chef-today-section="running"\][^{]*:first-child/);
      assert.doesNotMatch(css, /\[data-chef-today-section="done"\][^{]*:first-child/);
      assert.doesNotMatch(css, /\[data-chef-today-section="running"\][^{]*:not\(:first-child\)/);
      assert.doesNotMatch(css, /\[data-chef-today-section="done"\][^{]*:not\(:first-child\)/);
      const runningSection = sectionHtml("running");
      const doneSection = sectionHtml("done");
      assert.strictEqual((runningSection.match(/<button type="button" class="chef-today-row"/g) || []).length, 2);
      assert.strictEqual((doneSection.match(/<button type="button" class="chef-today-row"/g) || []).length, 2);
      assert.match(runningSection, /<span class="chef-today-row-title">L\u00e4uft 1<\/span>/);
      assert.match(doneSection, /<span class="chef-today-row-title">Fertig 1<\/span>/);
    },
  );

  await check(
    "V8.9.7 (3): die vollst\u00e4ndige Zeilenzahl bleibt bei 1/2/3/5/6 offenen Entscheidungen erhalten \u2013 keine Zeile entf\u00e4llt oder entsteht neu durch die Darstellung",
    async () => {
      const statuses = ["RETURNED", "READY_FOR_REVIEW", "BLOCKED", "READY_FOR_JAMAL_APPROVAL"];
      for (const count of [1, 2, 3, 5, 6]) {
        const orders = [];
        for (let i = 0; i < count; i += 1) {
          orders.push({
            id: `v897-count-${count}-${i}`,
            title: `Auftrag ${count}-${i}`,
            status: statuses[i % statuses.length],
            updatedAt: isoAtLocalDaysAgo(i),
          });
        }
        setOrders(orders);
        await reload();
        assert.strictEqual(todayRowHtmlList().length, count, `bei ${count} offenen Entscheidungen m\u00fcssen genau ${count} Zeilen gerendert werden`);
        assert.strictEqual(rowTitles("today").length, count);
      }
    },
  );

  await check(
    "V8.9.7 (4): die Reihenfolge der Today-Titel bleibt exakt die bestehende Statusreihenfolge (RETURNED \u2192 READY_FOR_REVIEW \u2192 BLOCKED \u2192 READY_FOR_JAMAL_APPROVAL) \u2013 V8.9.7 sortiert nicht um",
    async () => {
      setOrders([
        { id: "v897-order-approval", title: "D Freigabe", status: "READY_FOR_JAMAL_APPROVAL" },
        { id: "v897-order-blocked", title: "C Blockiert", status: "BLOCKED" },
        { id: "v897-order-review", title: "B Pr\u00fcfung", status: "READY_FOR_REVIEW" },
        { id: "v897-order-returned", title: "A Zur\u00fcckgegeben", status: "RETURNED" },
      ]);
      await reload();
      assert.deepStrictEqual(rowTitles("today"), ["A Zur\u00fcckgegeben", "B Pr\u00fcfung", "C Blockiert", "D Freigabe"]);
    },
  );

  await check(
    "V8.9.7 (5): keine neue Sortierungs-/Priorisierungslogik \u2013 renderTodayRow()/renderTodaySection() enthalten kein sort/score/weight/priorit, TODAY_STATUS_ORDER bleibt unver\u00e4ndert",
    () => {
      const renderTodayRowFn = js.match(/function renderTodayRow\(order\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(renderTodayRowFn, "renderTodayRow muss auffindbar sein");
      assert.doesNotMatch(renderTodayRowFn[0], /sort|score|weight|priorit/i);
      const renderTodaySectionFn = js.match(/function renderTodaySection\(orders\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(renderTodaySectionFn, "renderTodaySection muss auffindbar sein");
      assert.doesNotMatch(renderTodaySectionFn[0], /sort|score|weight|priorit/i);
      assert.match(
        js,
        /var TODAY_STATUS_ORDER = \["RETURNED", "READY_FOR_REVIEW", "BLOCKED", "READY_FOR_JAMAL_APPROVAL"\];/,
        "TODAY_STATUS_ORDER bleibt unver\u00e4ndert",
      );
    },
  );

  await check(
    "V8.9.7 (6/7): der vollst\u00e4ndige Informationsbestand (Kategorie, Titel, Zu entscheiden, Wartedauer, Entscheidung \u00f6ffnen) bleibt in JEDER Zeile erhalten \u2013 Blockier-/R\u00fcckgabegrund UND Empfehlung/Hinweis bleiben sichtbar, auch wenn sie in Zeile 2 bzw. 3 stehen (nicht in der ersten, hervorgehobenen Zeile)",
    async () => {
      setOrders([
        { id: "v897-info-1", title: "Zeile 1: Zur\u00fcckgegeben", status: "RETURNED", updatedAt: isoAtLocalDaysAgo(0) },
        { id: "v897-info-2", title: "Zeile 2: Pr\u00fcfung", status: "READY_FOR_REVIEW", updatedAt: isoAtLocalDaysAgo(3) },
        { id: "v897-info-3", title: "Zeile 3: Blockiert", status: "BLOCKED", updatedAt: isoAtLocalDaysAgo(5) },
      ]);
      setCurrentDecisionReason("v897-info-1", makeDecisionReason({ kind: "RETURN", text: "Zeile 1 R\u00fcckgabegrund." }));
      setCurrentDecisionReason("v897-info-3", makeDecisionReason({ kind: "BLOCK", text: "Zeile 3 Blockiergrund, nicht die erste Zeile." }));
      setHandoffs("v897-info-2", [makeDocumentationHandoff({ resultOrRecommendation: "Zeile 2 Empfehlung, nicht die erste Zeile." })]);
      setRisksAndLimits("v897-info-2", ["Zeile 2 Risiko, nicht die erste Zeile."]);
      await reload();

      const rows = todayRowHtmlList();
      assert.strictEqual(rows.length, 3);
      rows.forEach((rowHtml, index) => {
        assert.match(rowHtml, /<span class="chef-today-row-meta">/, `Zeile ${index + 1} muss die Kategorie tragen`);
        assert.match(rowHtml, /<span class="chef-today-row-title">/, `Zeile ${index + 1} muss den Titel tragen`);
        assert.match(
          rowHtml,
          /<span class="chef-today-row-line chef-today-row-decision">/,
          `Zeile ${index + 1} muss "Zu entscheiden" tragen`,
        );
        assert.match(rowHtml, /<span class="chef-today-row-wait">/, `Zeile ${index + 1} muss die Wartedauer tragen`);
        assert.match(
          rowHtml,
          /<span class="chef-today-row-open">Entscheidung \u00f6ffnen<\/span>/,
          `Zeile ${index + 1} muss "Entscheidung \u00f6ffnen" tragen`,
        );
      });

      // Zeile 1 (RETURNED) tr\u00e4gt ihren eigenen R\u00fcckgabegrund.
      assert.match(rows[0], /<span class="chef-today-row-line chef-today-row-reason">[\s\S]*Zeile 1 R\u00fcckgabegrund\.[\s\S]*?<\/span>/);

      // Zeile 2 (READY_FOR_REVIEW) tr\u00e4gt Empfehlung UND "Hinweis vorhanden" \u2013
      // ausdr\u00fccklich NICHT die erste, visuell hervorgehobene Zeile.
      assert.match(
        rows[1],
        /<span class="chef-today-row-line chef-today-row-recommendation">[\s\S]*Zeile 2 Empfehlung, nicht die erste Zeile\.[\s\S]*?<\/span>/,
      );
      assert.match(rows[1], /<span class="chef-today-row-line chef-today-row-risk">[\s\S]*Hinweis vorhanden[\s\S]*?<\/span>/);
      assert.doesNotMatch(rows[1], /chef-today-row-reason/, "READY_FOR_REVIEW zeigt keinen Blockier-/R\u00fcckgabegrund");

      // Zeile 3 (BLOCKED) tr\u00e4gt ihren eigenen Blockiergrund \u2013 ausdr\u00fccklich
      // NICHT die erste Zeile.
      assert.match(
        rows[2],
        /<span class="chef-today-row-line chef-today-row-reason">[\s\S]*Zeile 3 Blockiergrund, nicht die erste Zeile\.[\s\S]*?<\/span>/,
      );
    },
  );

  await check(
    "V8.9.7 (E): bei 6 offenen Entscheidungen bleibt auch Zeile 6 strukturell vollwertig \u2013 V8.9.7 f\u00fchrt keine zus\u00e4tzliche Reduktion jenseits der bereits bestehenden Abrufgrenze ein",
    async () => {
      const statuses = ["RETURNED", "READY_FOR_REVIEW", "BLOCKED", "READY_FOR_JAMAL_APPROVAL"];
      const orders = [];
      for (let i = 0; i < 6; i += 1) {
        orders.push({ id: `v897-six-${i}`, title: `Sechs ${i + 1}`, status: statuses[i % statuses.length] });
      }
      setOrders(orders);
      await reload();
      const rows = todayRowHtmlList();
      assert.strictEqual(rows.length, 6);
      rows.forEach((rowHtml, index) => {
        assert.match(rowHtml, /<span class="chef-today-row-meta">/, `Zeile ${index + 1}`);
        assert.match(rowHtml, /<span class="chef-today-row-title">/, `Zeile ${index + 1}`);
        assert.match(rowHtml, /<span class="chef-today-row-line chef-today-row-decision">/, `Zeile ${index + 1}`);
        assert.match(rowHtml, /<span class="chef-today-row-open">Entscheidung \u00f6ffnen<\/span>/, `Zeile ${index + 1}`);
      });
      assert.match(sectionHtml("today"), /Weitere wichtige Vorg\u00e4nge vorhanden\./);
    },
  );

  await check(
    "V8.9.7 (8/9/10): jede Zeile bleibt ein echtes <button type=\"button\"> mit data-chef-today-action=\"open-order\" und data-order-id; ein delegierter Klick \u00f6ffnet real auch Zeile 2 UND Zeile 5 (nicht nur die erste, hervorgehobene Zeile) korrekt \u00fcber das unver\u00e4nderte openOrder()",
    async () => {
      setOrders([
        { id: "v897-click-1", title: "Zeile A", status: "RETURNED" },
        { id: "v897-click-2", title: "Zeile B", status: "READY_FOR_REVIEW" },
        { id: "v897-click-3", title: "Zeile C", status: "BLOCKED" },
        { id: "v897-click-4", title: "Zeile D", status: "READY_FOR_JAMAL_APPROVAL" },
        { id: "v897-click-5", title: "Zeile E", status: "READY_FOR_JAMAL_APPROVAL" },
      ]);
      await reload();
      assert.deepStrictEqual(rowTitles("today"), ["Zeile A", "Zeile B", "Zeile C", "Zeile D", "Zeile E"]);

      const rows = todayRowHtmlList();
      assert.strictEqual(rows.length, 5);
      rows.forEach((rowHtml, index) => {
        assert.match(rowHtml, /^<button type="button" class="chef-today-row"/, `Zeile ${index + 1} muss ein echtes <button type="button"> sein`);
        assert.match(rowHtml, /data-chef-today-action="open-order"/, `Zeile ${index + 1} muss data-chef-today-action="open-order" tragen`);
        assert.match(rowHtml, /data-order-id="v897-click-\d"/, `Zeile ${index + 1} muss data-order-id tragen`);
      });

      pilotControls = ui.getState().orders.map((order) => makePilotControl("select-order", order.id));

      // Zeile 2 (Index 1) – real \u00fcber die bestehende Klick-Delegation.
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      clickChefTodayAction("open-order", "v897-click-2");
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v897-click-2" }], "Zeile 2 muss den richtigen Auftrag \u00f6ffnen");
      assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen selbst l\u00f6st keinen weiteren Abruf aus");

      // Zeile 5 (Index 4) – real \u00fcber dieselbe Klick-Delegation.
      pilotClicks.length = 0;
      fetchCalls.length = 0;
      clickChefTodayAction("open-order", "v897-click-5");
      assert.deepStrictEqual(pilotClicks, [{ action: "select-order", orderId: "v897-click-5" }], "Zeile 5 muss den richtigen Auftrag \u00f6ffnen");
      assert.deepStrictEqual(fetchCalls, [], "das \u00d6ffnen selbst l\u00f6st keinen weiteren Abruf aus");
    },
  );

  await check(
    "V8.9.7 (11/12/13/14): keine neue opacity/pointer-events/disabled/filter/cursor:default, keine neue Akzent-/Statusfarbe, kein box-shadow/outline und keine neue @media-Regel in den neuen Regeln \u2013 der bestehende focus-visible-Ring bleibt unangetastet",
    () => {
      const v897CssIndex = css.indexOf('[data-chef-today-section="today"] .chef-today-list');
      assert.ok(v897CssIndex > -1);
      const v897Css = css.slice(v897CssIndex);
      assert.doesNotMatch(v897Css, /opacity\s*:/, "keine neue opacity");
      assert.doesNotMatch(v897Css, /pointer-events\s*:/, "keine neue pointer-events");
      assert.doesNotMatch(v897Css, /disabled/, "kein disabled-Bezug");
      assert.doesNotMatch(v897Css, /filter\s*:/, "kein neuer filter");
      assert.doesNotMatch(v897Css, /cursor\s*:\s*default/, "kein cursor: default");
      assert.doesNotMatch(v897Css, /box-shadow\s*:/, "kein neues box-shadow \u2013 der bestehende focus-visible-Ring bleibt unangetastet");
      assert.doesNotMatch(v897Css, /outline\s*:/, "kein neues outline");
      assert.doesNotMatch(v897Css, /color\s*:/, "keine neue eigene Textfarbe (keine neue Akzent-/Statusfarbe)");
      assert.doesNotMatch(v897Css, /background/, "kein neuer eigener Hintergrund");
      assert.doesNotMatch(v897Css, /var\(--accent/, "keine neue Verwendung der Akzentfarbe");
      assert.doesNotMatch(v897Css, /@media/, "keine neue @media-Regel im ersten Versuch");
    },
  );

  await check(
    "V8.9.7 (15): Bestandsschutz V8.9.1\u2013V8.9.6 \u2013 R\u00fcckweg, \u00dcberschriftzahl, V8.9.3-Satz, Reload-Button, Recommendation-Sichtbarkeit und Fu\u00dfzone bleiben vollst\u00e4ndig unver\u00e4ndert",
    async () => {
      // V8.9.1 – sichtbarer Rückweg unverändert.
      assert.match(html, /<a href="#chef-today-card" id="pilot-work-order-back-to-today"/);

      // V8.9.2 – Überschrift trägt weiterhin die Anzahl.
      setOrders([
        { id: "v897-bestand-1", title: "Auftrag 1", status: "BLOCKED" },
        { id: "v897-bestand-2", title: "Auftrag 2", status: "READY_FOR_REVIEW" },
      ]);
      await reload();
      assert.match(sectionHtml("today"), /<h3>Heute wichtig \(2\)<\/h3>/);

      // V8.9.3 – Leerzustand ohne zweite Verneinung, einziger Satz in der Empfehlung.
      setOrders([]);
      await reload();
      assert.doesNotMatch(
        sectionHtml("today"),
        /chef-today-list|chef-today-empty/,
        "V8.9.3: der Leerzustand von \u201eHeute wichtig\u201c bleibt ohne Zeilen und ohne Ersatztext",
      );
      assert.match(sectionHtml("recommendation"), /Im Moment wartet keine Entscheidung auf dich\./);

      // V8.9.4 – der statische Reload-Button existiert unverändert in index.html.
      assert.match(html, /data-chef-today-action="reload-today"/);

      // V8.9.5 – Empfehlungsabschnitt entfällt weiterhin bei konkreter offener Entscheidung.
      setOrders([{ id: "v897-bestand-3", title: "Auftrag 3", status: "BLOCKED" }]);
      await reload();
      assert.strictEqual(sectionExists("recommendation"), false, "V8.9.5: Empfehlungsabschnitt entf\u00e4llt weiterhin bei konkreter Entscheidung");

      // V8.9.6 – die Fußzone bleibt genau einmal und immer zuletzt.
      assert.strictEqual(footCount(), 1);
      assert.ok(footIsLast());
    },
  );

  await check(
    "V8.9.7 (16/17): keine neue Route, kein neuer Fetch, kein POST/PATCH/DELETE, Exportanzahl unver\u00e4ndert \u2013 chef-today-ui.js bleibt bis auf den additiven Modulkopf-Kommentar funktional unver\u00e4ndert",
    () => {
      assert.deepStrictEqual(postCalls(), []);
      const urls = Array.from(new Set(js.match(/"\/api\/[^"]*"/g) || []));
      assert.deepStrictEqual(urls.sort(), ['"/api/pilot-work-order/orders"', '"/api/pilot-work-order/orders/"'].sort());
      assert.doesNotMatch(js, /"POST"|'POST'|"PATCH"|'PATCH'|"DELETE"|'DELETE'/);
      assert.strictEqual(Object.keys(ui).length, 30, "die Anzahl exportierter Namen bleibt unver\u00e4ndert");
      assert.doesNotMatch(js, /setInterval|setTimeout\(load|requestAnimationFrame|visibilitychange/);
    },
  );

  await check("V8.9.7: weiterhin kein schreibender Request \u00fcber den gesamten V8.9.7-Testlauf hinweg", () => {
    assert.deepStrictEqual(postCalls(), []);
  });

  clearDecisionReasonOverrides();
  clearHandoffAndRiskOverrides();

  console.log(`chef-today-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("chef-today-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
