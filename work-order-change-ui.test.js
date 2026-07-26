"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt P/N) – Bedienbarkeits-/
// Wortlaut-Abnahme der Owner-Betriebsübersicht für Änderungswünsche und
// Ergebnisversionen (owner-work-orders.html/owner-work-orders.js). Reine
// Quelltext-/Struktur-Prüfung ohne Browser, gleiches Muster wie
// work-order-ui.test.js/work-order-result-ui.test.js.
//
// Verbindliche Produktregel für diesen Bereich: der Owner sieht Änderungs-
// wünsche und Ergebnisversionen ausschließlich lesend. Es darf hier keinen
// Button/Formular geben, mit dem der Owner freigibt, ablehnt oder im Namen
// des Kunden eine Änderung anfordert.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const REPO_ROOT = __dirname;

function readFile(name) {
  return fs.readFileSync(path.join(REPO_ROOT, name), "utf8");
}

function extractVisibleHtmlText(source) {
  return source.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
}

const ownerHtml = readFile("owner-work-orders.html");
const ownerJs = readFile("owner-work-orders.js");

// ---------------------------------------------------------------------------
// 1. Änderungswunsch-Bereich vorhanden und wird beim Öffnen eines Auftrags
//    nachgeladen.
// ---------------------------------------------------------------------------

check("die Owner-Detailansicht enthält einen Änderungswunsch-Bereich, der beim Öffnen nachgeladen wird", () => {
  assert.match(ownerHtml, /id="work-order-change-requests-section"/);
  assert.match(ownerHtml, /id="work-order-change-requests-list"/);
  assert.match(ownerJs, /loadWorkOrderChangeRequests\(workOrder\.id\)/);
  assert.match(ownerJs, /\/change-requests"/);
});

// ---------------------------------------------------------------------------
// 2. Ergebnisversionen-Bereich vorhanden und wird nachgeladen.
// ---------------------------------------------------------------------------

check("die Owner-Detailansicht enthält einen Ergebnisversionen-Bereich, der beim Öffnen nachgeladen wird", () => {
  assert.match(ownerHtml, /id="work-order-versions-section"/);
  assert.match(ownerHtml, /id="work-order-versions-list"/);
  assert.match(ownerJs, /loadWorkOrderResultVersions\(workOrder\.id\)/);
  assert.match(ownerJs, /\/result-versions"/);
});

// ---------------------------------------------------------------------------
// 3+4. Rein lesend: kein Button/Formular/interaktives Element in beiden
//      neuen Bereichen.
// ---------------------------------------------------------------------------

function sliceSection(html, startMarker, endMarker) {
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Bereich nicht gefunden: ${startMarker} .. ${endMarker}`);
  return html.slice(startIndex, endIndex);
}

check("der Änderungswunsch-Bereich der Owner-Ansicht enthält keinerlei Bedienelement (rein lesend)", () => {
  const section = sliceSection(
    ownerHtml,
    '<div class="portal-section" id="work-order-change-requests-section"',
    '<div class="portal-section" id="work-order-versions-section"',
  );
  assert.doesNotMatch(section, /<button|<a\s|<input|<textarea|<select|<form/i);
});

check("der Ergebnisversionen-Bereich der Owner-Ansicht enthält keinerlei Bedienelement (rein lesend)", () => {
  const section = sliceSection(
    ownerHtml,
    '<div class="portal-section" id="work-order-versions-section"',
    '<div class="portal-section" id="work-order-action-section"',
  );
  assert.doesNotMatch(section, /<button|<a\s|<input|<textarea|<select|<form/i);
});

// ---------------------------------------------------------------------------
// 5. Explizite Beschriftung, dass der Owner hier nicht freigeben/ablehnen/
//    anfordern kann (verbindliche Produktregel sichtbar dokumentiert).
// ---------------------------------------------------------------------------

check("die Owner-Ansicht macht die Rollentrennung für den Betrachter erkennbar (kein Freigabe-/Ablehnungs-/Anforderungsrecht)", () => {
  const visibleText = extractVisibleHtmlText(ownerHtml);
  assert.match(visibleText, /ausschließlich der Kunde[\s\S]{0,60}(freigeben|Änderungswunsch|anfordern)/i);
  assert.match(visibleText, /Owner[\s\S]{0,40}(nicht|weder)[\s\S]{0,60}(freigeben|ablehnen|anfordern)/i);
});

// ---------------------------------------------------------------------------
// 6. Keine eigene Owner-Route für Freigabe/Ablehnung/Änderungswunsch im
//    JavaScript referenziert (kein "/approve" oder "/change-request" als
//    ausgehender Owner-Request außerhalb der reinen Leseroute).
// ---------------------------------------------------------------------------

check("owner-work-orders.js ruft niemals eine Freigabe- oder Änderungswunsch-Schreibroute auf", () => {
  assert.doesNotMatch(ownerJs, /fetchJson\([^)]*\/approve/);
  assert.doesNotMatch(ownerJs, /fetchJson\([^)]*\/change-request"/);
  assert.doesNotMatch(ownerJs, /method:\s*["']POST["'][\s\S]{0,200}\/approve/);
});

// ---------------------------------------------------------------------------
// 7. Statuswerte werden übersetzt (kein rohes Enum sichtbar).
// ---------------------------------------------------------------------------

check("Änderungswunsch-Status werden in deutscher Sprache angezeigt (kein rohes Enum)", () => {
  assert.match(ownerJs, /CHANGE_REQUEST_STATUS_LABELS/);
  const match = ownerJs.match(/var CHANGE_REQUEST_STATUS_LABELS = \{([\s\S]*?)\};/);
  assert.ok(match, "CHANGE_REQUEST_STATUS_LABELS nicht gefunden");
  const labelValues = [...match[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labelValues.length >= 4);
  labelValues.forEach((label) => assert.doesNotMatch(label, /^[A-Z_]+$/, `Label "${label}" sieht wie ein technisches Enum aus`));
});

// ---------------------------------------------------------------------------
// 8. Freigabeinformation (wer/wann) wird in der Versionsliste angezeigt,
//    ohne dass der Owner selbst freigeben kann.
// ---------------------------------------------------------------------------

check("die Versionsliste zeigt Freigabeinformationen (wer/wann) rein informativ an", () => {
  assert.match(ownerJs, /isApproved/);
  assert.match(ownerJs, /approvedByDisplayName/);
  assert.match(ownerJs, /noch nicht freigegeben/);
});

// ---------------------------------------------------------------------------
// 9+10. Keine Systemprompts/Chain-of-Thought, kein Kundentext-Leck über die
//       vorgesehenen Felder hinaus (requestText ist bewusst sichtbar, siehe
//       work-order-change-service.js#ownerChangeRequestView).
// ---------------------------------------------------------------------------

check("weder Systemprompts noch Chain-of-Thought erscheinen im Owner-Quelltext für Änderungswünsche/Versionen", () => {
  [ownerHtml, ownerJs].forEach((source) => {
    assert.doesNotMatch(source, /system[- ]?prompt/i);
    assert.doesNotMatch(source, /chain[- ]?of[- ]?thought/i);
  });
});

// ---------------------------------------------------------------------------
// 11. Keine Veröffentlichung/kein Billing/keine Providerwahl in diesem
//     Bereich.
// ---------------------------------------------------------------------------

check("der Änderungswunsch-/Versionsbereich der Owner-Ansicht erwähnt weder Veröffentlichung noch Billing noch Providerwahl", () => {
  const section = sliceSection(
    ownerHtml,
    '<div class="portal-section" id="work-order-change-requests-section"',
    '<div class="portal-section" id="work-order-action-section"',
  );
  const visibleText = extractVisibleHtmlText(section);
  assert.doesNotMatch(visibleText, /veröffentlich|publish/i);
  assert.doesNotMatch(visibleText, /billing|rechnung|zahlung/i);
  assert.doesNotMatch(visibleText, /provider|canva|heygen/i);
});

// ---------------------------------------------------------------------------
// 12. Leerzustand vorhanden (empty hint), kein leeres/kaputtes Rendering.
// ---------------------------------------------------------------------------

check("beide neuen Bereiche besitzen einen erkennbaren Leerzustands-Hinweis", () => {
  assert.match(ownerHtml, /id="work-order-change-requests-empty-hint"/);
  assert.match(ownerHtml, /id="work-order-versions-empty-hint"/);
  assert.match(ownerJs, /work-order-change-requests-empty-hint/);
  assert.match(ownerJs, /work-order-versions-empty-hint/);
});

console.log(`work-order-change-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
