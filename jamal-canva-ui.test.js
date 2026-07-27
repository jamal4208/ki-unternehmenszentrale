"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
// (Auftrag Abschnitt P): Bedienbarkeits-/Wortlaut-Abnahme des Canva-Bereichs
// innerhalb der Hauptarbeitskarte "Heute arbeiten" (index.html/
// jamal-canva-ui.js/styles.css). Reine Quelltext-/Struktur-Prüfung ohne
// Browser/DOM (gleiches Muster wie jamal-work-mode-ui.test.js) – keine neue
// npm-Abhängigkeit.

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

const html = readFile("index.html");
const js = readFile("jamal-canva-ui.js");
const css = readFile("styles.css");

// ---------------------------------------------------------------------------
// 1. Canva-Empfehlung sichtbar.
// ---------------------------------------------------------------------------

check("die Canva-Empfehlung ist sichtbar (Hinweistext aus suitability.decisionLabel)", () => {
  assert.match(js, /jamal-canva-hint/);
  assert.match(js, /suitability\.decisionLabel/);
});

// ---------------------------------------------------------------------------
// 2. Format sichtbar.
// ---------------------------------------------------------------------------

check("das vorgeschlagene Format ist sichtbar", () => {
  assert.match(js, /<dt>Format<\/dt>/);
  assert.match(js, /suitability\.suggestedFormat/);
});

// ---------------------------------------------------------------------------
// 3. Briefingstatus sichtbar.
// ---------------------------------------------------------------------------

check("der Briefingstatus ist sichtbar", () => {
  assert.match(js, /<dt>Briefingstatus<\/dt>/);
});

// ---------------------------------------------------------------------------
// 4. Rechte-/Consentstatus sichtbar.
// ---------------------------------------------------------------------------

check("der Rechte-/Consentstatus ist sichtbar und deutsch übersetzt", () => {
  assert.match(js, /<dt>Rechte\/Consent<\/dt>/);
  assert.match(js, /function rightsLabel/);
  assert.match(js, /RIGHTS_LABELS_DE/);
});

// ---------------------------------------------------------------------------
// 5+6. genau eine primäre Aktion je Zustand; "Canva-Produktion starten".
// ---------------------------------------------------------------------------

check("genau eine primäre Hauptaktion je Zustandsfunktion", () => {
  const allFunctionStarts = [...js.matchAll(/\n  function \w+\(/g)].map((m) => m.index);
  function sliceFunction(fnName) {
    const start = js.indexOf(`function ${fnName}(`);
    assert.ok(start >= 0, `${fnName} nicht gefunden`);
    const nextStart = allFunctionStarts.find((index) => index > start);
    return js.slice(start, nextStart || start + 4000);
  }
  ["renderReadyForApproval", "renderConfirmPanel", "renderRunning", "renderRightsForm"].forEach((fnName) => {
    const matches = sliceFunction(fnName).match(/class="primary-button"/g) || [];
    assert.ok(matches.length <= 1, `mehr als eine primäre Hauptaktion in ${fnName}: ${matches.length} Treffer`);
  });
  // renderResultReceived verwendet zwei sich gegenseitig ausschließende,
  // auf demselben state.mode-Vergleich basierende Anzeigemodi
  // (Ergebnisansicht: "Passt" primär / Änderungsformular: "Änderung
  // senden" primär) – zur Laufzeit ist daher weiterhin nur je EINE
  // primäre Aktion sichtbar, im Quelltext stehen beide Zweige nebeneinander
  // (gleiches Prinzip wie jamal-work-mode-ui.test.js#"genau eine primäre
  // Hauptaktion je Zustand", dort für eine if/else-if-Kette).
  const resultBody = sliceFunction("renderResultReceived");
  assert.match(resultBody, /state\.mode === "CHANGE_FORM"[\s\S]*?primary-button"[^>]*>Änderung senden</);
  assert.match(resultBody, /state\.mode !== "CHANGE_FORM"[\s\S]*?primary-button"[^>]*>Passt</);
  const totalMatches = resultBody.match(/class="primary-button"/g) || [];
  assert.strictEqual(totalMatches.length, 2, "renderResultReceived darf im Quelltext genau zwei sich gegenseitig ausschließende primäre Aktionen enthalten");
});

check("„Canva-Produktion starten“ ist die primäre Aktion zur Freigabe", () => {
  assert.match(js, /data-action="open-confirm-handoff">Canva-Produktion starten</);
  assert.match(js, /data-action="confirm-start-handoff">Canva-Produktion starten</);
});

// ---------------------------------------------------------------------------
// 7. Laufstatus verständlich ("Canva-Produktion läuft").
// ---------------------------------------------------------------------------

check("der Laufstatus ist verständlich als „Canva-Produktion läuft“ sichtbar", () => {
  assert.match(js, /function renderRunning/);
  assert.match(js, />Canva-Produktion läuft</);
});

// ---------------------------------------------------------------------------
// 8+9. Ergebnisstatus sichtbar, Design-Titel sichtbar.
// ---------------------------------------------------------------------------

check("der Ergebnisstatus ist sichtbar", () => {
  assert.match(js, /function renderResultReceived/);
  assert.match(js, /quality\.statusLabel/);
});

check("der Design-Titel ist sichtbar", () => {
  assert.match(js, /design\.designTitle \|\| "Canva-Design"/);
});

// ---------------------------------------------------------------------------
// 10. Qualitätsstatus deutsch (kommt bereits über qualityStatus-Label vom
//     Server, hier wird sichergestellt, dass kein Rohstatuscode ausgegeben
//     wird).
// ---------------------------------------------------------------------------

check("der Qualitätsstatus wird ausschließlich als übersetzter Text angezeigt (kein Rohcode)", () => {
  assert.match(js, /escapeHtml\(quality\.statusLabel\)/);
  assert.doesNotMatch(js, /escapeHtml\(quality\.status\)/);
});

// ---------------------------------------------------------------------------
// 11+12. „Passt“, „Änderung anfordern“.
// ---------------------------------------------------------------------------

check("„Passt“-Aktion ist vorhanden", () => {
  assert.match(js, /data-action="accept-result">Passt</);
});

check("„Änderung anfordern“-Aktion ist vorhanden", () => {
  assert.match(js, /data-action="open-change-form">Änderung anfordern</);
});

// ---------------------------------------------------------------------------
// 13. „In Canva öffnen“ ist sekundär (kein primary-button).
// ---------------------------------------------------------------------------

check("„In Canva öffnen“ ist eine sekundäre Aktion (kein primary-button)", () => {
  assert.match(js, /secondary-button" href="' \+ escapeHtml\(editHref\)[^]*?>In Canva öffnen</);
  assert.doesNotMatch(js, /primary-button"[^>]*>In Canva öffnen</);
});

// ---------------------------------------------------------------------------
// 14+15+16. keine Publish-/Social-Media-/Billing-Aktion.
// ---------------------------------------------------------------------------

check("keine Publish-Aktion im Canva-Bereich", () => {
  // Bewusst nur eine tatsächliche Publish-AKTION (Button/data-action)
  // prüfen, nicht die erwünschte, wiederholte Verneinung "es erfolgt noch
  // keine Veröffentlichung" (Auftrag Abschnitt F/L).
  assert.doesNotMatch(js, /data-action="[^"]*publish/i);
  assert.doesNotMatch(js, />\s*Veröffentlichen\s*</);
});

check("keine Social-Media-Aktion im Canva-Bereich", () => {
  // Bewusst nur eine tatsächliche Social-Media-AKTION prüfen; der
  // Kopfkommentar der Datei beschreibt zulässig, was NICHT vorhanden ist
  // ("keine Publish-/Social-Media-/Billing-Schaltfläche").
  assert.doesNotMatch(js, /data-action="[^"]*(social|post-)/i);
  assert.doesNotMatch(js, />\s*(Auf Social Media (posten|teilen)|Posten)\s*</i);
});

check("keine Billing-Aktion im Canva-Bereich", () => {
  // Bewusst nur eine tatsächliche Billing-AKTION/-Anzeige prüfen; der
  // Kopfkommentar der Datei beschreibt zulässig, was NICHT vorhanden ist
  // ("keine ... Billing-Schaltfläche").
  const bodySource = js.slice(js.indexOf("(function () {"));
  assert.doesNotMatch(bodySource, /billing|rechnung|zahlung|payment|preis/i);
});

// ---------------------------------------------------------------------------
// 17+18. keine Tokenanzeige, keine Providerdetails im Hauptbereich.
// ---------------------------------------------------------------------------

check("keine Tokenanzeige im Canva-Bereich", () => {
  assert.doesNotMatch(js, /accessToken|apiKey|clientSecret|refreshToken/i);
});

check("keine Providerdetails im Hauptbereich (nur in der separaten Diagnostik)", () => {
  const mainRenderSource = js.slice(js.indexOf("function renderMain"), js.indexOf("function renderDiagnostics"));
  assert.doesNotMatch(mainRenderSource, /providerStatus/);
  assert.match(js, /function renderDiagnostics/);
  assert.match(js, /jamal-canva-diagnostics-output/);
  assert.match(js.slice(js.indexOf("function renderDiagnostics")), /providerStatus/);
});

// ---------------------------------------------------------------------------
// 19. echte Labels.
// ---------------------------------------------------------------------------

check("Formularfelder besitzen echte Labels", () => {
  assert.match(js, /<label for="' \+ idPrefix \+ '-owns-rights">/);
  assert.match(js, /<label for="jamal-canva-change-input">/);
  assert.match(js, /id="jamal-canva-change-input"/);
});

// ---------------------------------------------------------------------------
// 20. aria-live.
// ---------------------------------------------------------------------------

check("aria-live ist auf den zentralen Canva-Ausgabebereichen gesetzt", () => {
  assert.match(html, /id="jamal-canva-output" aria-live="polite"/);
  assert.match(html, /id="jamal-canva-diagnostics-output" aria-live="polite"/);
});

// ---------------------------------------------------------------------------
// 21. Fokuszustände (globale Regel, kein eigener Fokus-Reset im Canva-Skript).
// ---------------------------------------------------------------------------

check("sichtbare Fokuszustände bleiben erhalten (kein eigener Fokus-Reset im Canva-Skript)", () => {
  assert.doesNotMatch(js, /outline:\s*none/);
  assert.doesNotMatch(js, /tabindex="-1"/);
});

// ---------------------------------------------------------------------------
// 22. mobile Darstellung.
// ---------------------------------------------------------------------------

check("mobile Darstellung ist für den Canva-Bereich vorgesehen", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.jamal-canva/);
});

// ---------------------------------------------------------------------------
// 23. keine externe Ressource außer dem kontrollierten Canva-Link.
// ---------------------------------------------------------------------------

check("keine externe Ressource außer dem kontrollierten, serverseitig geprüften Canva-Link", () => {
  const urlLikeMatches = [...js.matchAll(/https?:\/\/[^\s"'\\]+/g)].map((m) => m[0]);
  urlLikeMatches.forEach((url) => {
    assert.match(url, /^https:\/\/www\.canva\.com\//, `unerwartete externe Ressource: ${url}`);
  });
  assert.match(js, /function safeCanvaHref/);
  assert.match(js, /\/\^https:\\\/\\\/www\\\.canva\\\.com\\\//);
});

// ---------------------------------------------------------------------------
// 24. kein Tracking.
// ---------------------------------------------------------------------------

check("kein Tracking im Canva-Bereich", () => {
  assert.doesNotMatch(js, /analytics|gtag|tracking[- ]?pixel/i);
});

// ---------------------------------------------------------------------------
// 25. kein sensibles LocalStorage.
// ---------------------------------------------------------------------------

check("kein LocalStorage für Canva-Arbeitsdaten", () => {
  assert.doesNotMatch(js, /localStorage/);
});

// ---------------------------------------------------------------------------
// Zusätzliche Härtung (Auftrag Abschnitt L/M/O): eigenständiges Skript,
// ausschließlich /api/jamal-work-mode/canva-*-Routen, kein Kundenkonto-Zugriff,
// keine Vermischung mit jamal-work-mode-ui.js.
// ---------------------------------------------------------------------------

check("alle Aktionen laufen ausschließlich über /api/jamal-work-mode/*", () => {
  assert.match(js, /"\/api\/jamal-work-mode\/" \+ action/);
  assert.doesNotMatch(js, /\/api\/(owner|portal|v71)\//);
});

check("keine Systemprompts oder Chain-of-Thought im Quelltext", () => {
  [html, js].forEach((source) => {
    assert.doesNotMatch(source, /system[- ]?prompt/i);
    assert.doesNotMatch(source, /chain[- ]?of[- ]?thought/i);
  });
});

check("kein Kundenkonto-Zugriff (kein Mandanten-/Kundenbezug im Canva-Skript)", () => {
  assert.doesNotMatch(js, /tenant|customer|mandant/i);
});

check("der Canva-Bereich liegt innerhalb derselben Hauptarbeitskarte, getrennt von jamal-work-mode-ui.js", () => {
  const cardIndex = html.indexOf('id="jamal-work-card"');
  const canvaCardIndex = html.indexOf('id="jamal-canva-card"');
  const cardSectionEnd = html.indexOf("</section>", cardIndex);
  assert.ok(canvaCardIndex > cardIndex && canvaCardIndex < cardSectionEnd, "Canva-Karte muss innerhalb der Heute-arbeiten-Karte liegen");
  assert.match(html, /<script src="jamal-canva-ui\.js"><\/script>/);
});

console.log(`jamal-canva-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
