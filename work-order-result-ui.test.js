"use strict";

// V7.2 Phase C Schritt 1+2 (Auftrag Abschnitt P/M) – Bedienbarkeits-/
// Wortlaut-Abnahme der Ergebnisdarstellung im Kundenportal (RESULT_READY/
// CHANGES_REQUESTED/CUSTOMER_APPROVED). Reine Quelltext-/Struktur-Prüfung
// ohne Browser, gleiches Muster wie work-order-ui.test.js.
//
// Schritt 2 kehrt die ursprünglichen Schritt-1-Prüfpunkte 8/9 bewusst um:
// Freigabe und Änderungswunsch waren in Schritt 1 explizit NICHT erlaubt
// (Scope-Sperre), sind aber der eigentliche Auftragsgegenstand von Schritt
// 2 (Auftrag Abschnitt E/G) – die Sperre ist damit korrekt aufgehoben,
// nicht vergessen. Die feingranulare Verhaltensprüfung (echte HTTP-Aufrufe,
// Statuswechsel, Sicherheit) lebt in work-order-change.test.js.

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
// 8+9. Freigabe- und Änderungsfunktion (Auftrag Abschnitt E/G, Schritt 2):
//      ausschließlich der Kunde bedient beide Formulare, kein Owner-Bezug,
//      keine Veröffentlichung/kein Billing daran gekoppelt.
// ---------------------------------------------------------------------------

check("der Ergebnisbereich bietet eine Freigabefunktion an, die ausschließlich der Kunde auslöst", () => {
  assert.match(portalHtml, /id="work-order-approve-section"/);
  assert.match(portalHtml, /id="work-order-approve-form"/);
  assert.match(extractVisibleHtmlText(portalHtml), /Ergebnis freigeben/i);
  assert.match(portalUiJs, /work-order-approve-form/);
  assert.match(portalUiJs, /\/approve"/);
  // Kein Owner-Bezug: der Kunde freigibt über /api/portal/..., niemals über
  // eine /api/owner/-Route (siehe work-order-approval-service.js: OWNER hat
  // keine entsprechende Funktion).
  assert.doesNotMatch(portalUiJs, /owner[\s\S]{0,80}approve|approve[\s\S]{0,80}owner/i);
});

check("der Ergebnisbereich bietet eine Änderungsfunktion an, die ausschließlich der Kunde auslöst", () => {
  assert.match(portalHtml, /id="work-order-change-request-section"/);
  assert.match(portalHtml, /id="work-order-change-request-form"/);
  assert.match(extractVisibleHtmlText(portalHtml), /Änderung anfordern/i);
  assert.match(portalUiJs, /work-order-change-request-form/);
  assert.match(portalUiJs, /\/change-request"/);
});

// ---------------------------------------------------------------------------
// 10. Ehrlicher Folgehinweis, statusabhängig (Schritt 2: Änderung/Freigabe
//     sind jetzt tatsächlich möglich, kein falsches "abgeschlossen"/
//     "veröffentlicht").
// ---------------------------------------------------------------------------

check("der Ergebnisbereich enthält einen ehrlichen, statusabhängigen Folgehinweis ohne falsche Veröffentlichungsbehauptung", () => {
  assert.strictEqual(resultService.RESULT_NEXT_STEP_NOTE, "Sie können das Ergebnis ansehen, eine Änderung anfordern oder es freigeben.");
  assert.match(portalHtml, /id="work-order-result-next-step"/);
  assert.doesNotMatch(extractVisibleHtmlText(portalHtml), /ist abgeschlossen|wurde veröffentlicht/i);
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
// 18. Fokuszustände (Schritt 2): die neuen interaktiven Elemente
//     (Änderungswunsch-/Freigabeformular) verwenden ausschließlich die
//     bereits bestehenden Klassen mit definiertem :focus-visible
//     (.portal-field textarea/.portal-button aus portal.css) statt eigener,
//     ungeprüfter Bedienelemente.
// ---------------------------------------------------------------------------

check("die neuen Änderungswunsch-/Freigabe-Formularfelder nutzen ausschließlich Klassen mit definiertem Fokuszustand", () => {
  const startMarker = '<div class="portal-section" id="work-order-change-request-section"';
  const endMarker = '<div class="portal-section" id="work-order-versions-section"';
  const startIndex = portalHtml.indexOf(startMarker);
  const endIndex = portalHtml.indexOf(endMarker);
  assert.ok(startIndex >= 0 && endIndex > startIndex, "Änderungswunsch-/Freigabebereich nicht gefunden");
  const sectionHtml = portalHtml.slice(startIndex, endIndex);
  const buttons = sectionHtml.match(/<button[^>]*>/g) || [];
  assert.ok(buttons.length >= 2, "erwartete mindestens zwei Buttons (Änderung anfordern/Ergebnis freigeben)");
  buttons.forEach((button) => assert.match(button, /class="portal-button"/, `Button ohne portal-button-Klasse: ${button}`));
  const textareas = sectionHtml.match(/<textarea[^>]*>/g) || [];
  assert.ok(textareas.length >= 4, "erwartete mindestens vier Textfelder (3 Änderungswunsch + 1 Freigabenotiz)");
  assert.doesNotMatch(sectionHtml, /<a\s|<select/i, "unerwartetes neues interaktives Element ohne geprüften Fokuszustand");
});

check("die Versionsansicht fügt keine neuen interaktiven Bedienelemente hinzu (rein lesend)", () => {
  const startMarker = '<div class="portal-section" id="work-order-versions-section"';
  const endMarker = '<div class="portal-section" id="work-order-resubmit-section"';
  const startIndex = portalHtml.indexOf(startMarker);
  const endIndex = portalHtml.indexOf(endMarker);
  assert.ok(startIndex >= 0 && endIndex > startIndex, "Versionsbereich nicht gefunden");
  const versionsSectionHtml = portalHtml.slice(startIndex, endIndex);
  assert.doesNotMatch(versionsSectionHtml, /<button|<a\s|<input|<textarea|<select/i);
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
