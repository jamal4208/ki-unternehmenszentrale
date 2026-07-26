"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt P) – Bedienbarkeits-/Wortlaut-
// Abnahme der neuen Ergebnisdarstellung im Kundenportal (RESULT_READY).
// Reine Quelltext-/Struktur-Prüfung ohne Browser, gleiches Muster wie
// work-order-ui.test.js.

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

const portalHtml = readFile("portal.html");
const portalUiJs = readFile("portal-ui.js");
const resultService = require("./work-order-result-service");

// ---------------------------------------------------------------------------
// 1. RESULT_READY-Ergebnisbereich ist vorhanden und wird bei RESULT_READY
//    nachgeladen (portal-ui.js#renderWorkOrderDetail).
// ---------------------------------------------------------------------------

check("das Portal enthält einen Ergebnisbereich, der bei RESULT_READY nachgeladen wird", () => {
  assert.match(portalHtml, /id="work-order-result-section"/);
  assert.match(portalUiJs, /workOrder\.status === "RESULT_READY"/);
  assert.match(portalUiJs, /loadWorkOrderResult\(workOrder\.id\)/);
});

// ---------------------------------------------------------------------------
// 2. Ergebniszusammenfassung sichtbar.
// ---------------------------------------------------------------------------

check("die Ergebniszusammenfassung wird angezeigt", () => {
  assert.match(portalHtml, /id="work-order-result-summary"/);
  assert.match(portalUiJs, /work-order-result-summary"\)\.textContent = result\.summary/);
});

// ---------------------------------------------------------------------------
// 3. Vollständiger Ergebnistext sichtbar.
// ---------------------------------------------------------------------------

check("das vollständige Ergebnis wird angezeigt", () => {
  assert.match(portalHtml, /id="work-order-result-body"/);
  assert.match(portalUiJs, /work-order-result-body"\)\.textContent = result\.body/);
});

// ---------------------------------------------------------------------------
// 4. Qualitätsstatus in deutscher Sprache.
// ---------------------------------------------------------------------------

check("der Qualitätsstatus wird in deutscher Sprache angezeigt (kein rohes Enum)", () => {
  assert.match(portalUiJs, /qualityBadge\.textContent = result\.qualityStatusLabel/);
  Object.values(resultService.QUALITY_STATUS_LABELS).forEach((label) => {
    assert.doesNotMatch(label, /^[A-Z_]+$/, `Label "${label}" sieht wie ein technisches Enum aus`);
  });
});

// ---------------------------------------------------------------------------
// 5. Keine technische Agentenlogausgabe im Kundenportal.
// ---------------------------------------------------------------------------

check("das Kundenportal zeigt keine technische Agentenlog-/Agentenlistenausgabe an", () => {
  assert.doesNotMatch(portalUiJs, /agentKey|selectionReason|runOwnerView|orchestratorVersion/i);
  assert.doesNotMatch(extractVisibleHtmlText(portalHtml), /agent(en)?[- ]?log/i);
});

// ---------------------------------------------------------------------------
// 6+7. Keine Systemprompts, keine Chain-of-Thought.
// ---------------------------------------------------------------------------

check("weder Systemprompts noch Chain-of-Thought erscheinen im Kundenportal-Quelltext", () => {
  [portalHtml, portalUiJs].forEach((source) => {
    assert.doesNotMatch(source, /system[- ]?prompt/i);
    assert.doesNotMatch(source, /chain[- ]?of[- ]?thought/i);
  });
});

// ---------------------------------------------------------------------------
// 8+9. Keine Freigabe-/Änderungsfunktion im Ergebnisbereich.
// ---------------------------------------------------------------------------

check("der Ergebnisbereich bietet keine Freigabefunktion an", () => {
  assert.doesNotMatch(portalHtml, /work-order-result[\s\S]{0,2000}?data-action="approve"/);
  assert.doesNotMatch(extractVisibleHtmlText(portalHtml), /jetzt freigeben|ergebnis freigeben|ergebnis genehmigen/i);
  assert.doesNotMatch(portalUiJs, /CUSTOMER_APPROVED/);
});

check("der Ergebnisbereich bietet keine Änderungsfunktion an", () => {
  assert.doesNotMatch(extractVisibleHtmlText(portalHtml), /änderung(en)? anfordern|changes[_-]?requested/i);
  assert.doesNotMatch(portalUiJs, /CHANGES_REQUESTED/);
});

// ---------------------------------------------------------------------------
// 10. Ehrlicher Folgehinweis (Freigabe/Änderungen folgen im nächsten
//     Schritt), kein falsches "abgeschlossen"/"veröffentlicht".
// ---------------------------------------------------------------------------

check("der Ergebnisbereich enthält einen ehrlichen Folgehinweis ohne falsche Abschluss-/Veröffentlichungsbehauptung", () => {
  assert.strictEqual(
    resultService.RESULT_NEXT_STEP_NOTE,
    "Sie können das Ergebnis derzeit ansehen. Änderungswünsche und Freigabe folgen im nächsten Schritt.",
  );
  assert.match(portalHtml, /id="work-order-result-next-step"/);
  assert.doesNotMatch(extractVisibleHtmlText(portalHtml), /ist abgeschlossen|wurde veröffentlicht|ist freigegeben/i);
});

// ---------------------------------------------------------------------------
// 11. Kein "von Jamal geprüft"-Hinweis.
// ---------------------------------------------------------------------------

check("es gibt keinen Hinweis auf eine Prüfung/Freigabe durch Jamal oder den Owner", () => {
  [portalHtml, portalUiJs].forEach((source) => {
    assert.doesNotMatch(source, /jamal/i);
    assert.doesNotMatch(extractVisibleHtmlText(source), /vom\s+(betreiber|owner)\s+geprüft/i);
  });
});

// ---------------------------------------------------------------------------
// 12+13+14. Keine Veröffentlichung, kein Billing, keine Providerwahl.
// ---------------------------------------------------------------------------

check("der Ergebnisbereich erwähnt weder Veröffentlichung noch Billing noch Providerwahl", () => {
  const visibleText = extractVisibleHtmlText(portalHtml);
  assert.doesNotMatch(visibleText, /veröffentlich|publish/i);
  assert.doesNotMatch(visibleText, /billing|rechnung|zahlung/i);
  assert.doesNotMatch(visibleText, /provider|canva|heygen/i);
});

// ---------------------------------------------------------------------------
// 15. Mobile Darstellung (bereits vorhandenes Viewport-Meta, hier erneut
//     für die geänderte Datei bestätigt).
// ---------------------------------------------------------------------------

check("portal.html besitzt weiterhin ein Viewport-Meta für mobile Darstellung", () => {
  assert.match(portalHtml, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
});

// ---------------------------------------------------------------------------
// 16. Labels: jedes Datum im Ergebnisbereich hat eine erkennbare
//     Beschriftung (portal-kv-key).
// ---------------------------------------------------------------------------

check("Ergebnisversion und Qualitätsstatus tragen erkennbare Beschriftungen (Labels)", () => {
  assert.match(portalHtml, /<span class="portal-kv-key">Ergebnisversion<\/span><span id="work-order-result-version">/);
  assert.match(portalHtml, /<span class="portal-kv-key">Qualitätsstatus<\/span><span id="work-order-result-quality"/);
});

// ---------------------------------------------------------------------------
// 17. aria-live für den Ergebnisbereich.
// ---------------------------------------------------------------------------

check("der Ergebnisbereich ist eine aria-live-Region", () => {
  assert.match(portalHtml, /id="work-order-result-section" hidden aria-live="polite"/);
});

// ---------------------------------------------------------------------------
// 18. Fokuszustände (bereits bestehende, wiederverwendete Klassen im
//     Ergebnisbereich: portal-lede/portal-badge/portal-kv-list nutzen keine
//     eigenen interaktiven Elemente; es gibt keinen neuen fokussierbaren
//     Bedienelement-Typ, der ohne :focus-visible bliebe).
// ---------------------------------------------------------------------------

check("der Ergebnisbereich fügt kein neues interaktives Element ohne sichtbaren Fokuszustand hinzu", () => {
  const startMarker = '<div class="portal-section" id="work-order-result-section"';
  const endMarker = '<div class="portal-section" id="work-order-resubmit-section"';
  const startIndex = portalHtml.indexOf(startMarker);
  const endIndex = portalHtml.indexOf(endMarker);
  assert.ok(startIndex >= 0 && endIndex > startIndex, "Ergebnisbereich nicht gefunden");
  const resultSectionHtml = portalHtml.slice(startIndex, endIndex);
  assert.doesNotMatch(resultSectionHtml, /<button|<a\s|<input|<textarea|<select/i);
});

// ---------------------------------------------------------------------------
// 19. Keine externe Ressource.
// ---------------------------------------------------------------------------

check("weder portal.html noch portal-ui.js referenzieren eine externe URL im Ergebniskontext", () => {
  assert.doesNotMatch(portalHtml, /https?:\/\//i);
  assert.doesNotMatch(portalUiJs, /https?:\/\//i);
});

// ---------------------------------------------------------------------------
// 20. Kein Storage.
// ---------------------------------------------------------------------------

check("portal-ui.js verwendet für das Ergebnis kein localStorage/sessionStorage", () => {
  assert.doesNotMatch(portalUiJs, /\blocalStorage\b/);
  assert.doesNotMatch(portalUiJs, /\bsessionStorage\b/);
});

console.log(`work-order-result-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
