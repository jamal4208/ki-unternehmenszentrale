"use strict";

// V7.3 – Jamal-Arbeitsmodus (Auftrag Abschnitt N/P): Bedienbarkeits-/
// Wortlaut-Abnahme der zentralen Arbeitskarte "Heute arbeiten"
// (index.html/jamal-work-mode-ui.js/styles.css). Reine Quelltext-/
// Struktur-Prüfung ohne Browser/DOM (gleiches Muster wie
// work-order-change-ui.test.js/v71-ui.test.js) – keine neue npm-Abhängigkeit.

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
const js = readFile("jamal-work-mode-ui.js");
const css = readFile("styles.css");

// ---------------------------------------------------------------------------
// 1. „Heute arbeiten“ sichtbar.
// ---------------------------------------------------------------------------

check("„Heute arbeiten“ ist sichtbar und steht oben im Cockpit", () => {
  assert.match(html, /id="jamal-work-card"/);
  assert.match(html, /<h2 id="jamal-work-title">Heute arbeiten<\/h2>/);
  const cardIndex = html.indexOf('id="jamal-work-card"');
  const dailyRunIndex = html.indexOf('id="daily-work-run-section"');
  assert.ok(cardIndex >= 0 && dailyRunIndex > cardIndex, "Heute-arbeiten-Karte muss vor dem bisherigen Tageslauf stehen");
});

// ---------------------------------------------------------------------------
// 2. priorisiertes Projekt sichtbar.
// ---------------------------------------------------------------------------

check("priorisiertes Projekt ist sichtbar", () => {
  assert.match(js, /function renderProjectLine/);
  assert.match(js, /item\.projectDisplayName/);
  assert.match(js, /jamal-work-project/);
});

// ---------------------------------------------------------------------------
// 3. Ergebniswunsch sichtbar.
// ---------------------------------------------------------------------------

check("Ergebniswunsch-Eingabe ist sichtbar", () => {
  assert.match(js, /Welches Ergebnis möchtest du erreichen\?/);
  assert.match(js, /name="desiredOutcome"/);
});

// ---------------------------------------------------------------------------
// 4. genau eine primäre Hauptaktion je Zustand.
// ---------------------------------------------------------------------------

check("genau eine primäre Hauptaktion je Zustand", () => {
  const functionMatch = js.match(/function renderPrimaryAndSecondary\(view\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(functionMatch, "renderPrimaryAndSecondary nicht gefunden");
  const body = functionMatch[1];
  const branches = body.split(/\}\s*else if\s*\(/);
  branches.forEach((branch) => {
    const matches = branch.match(/class="primary-button"/g) || [];
    assert.ok(matches.length <= 1, `mehr als eine primäre Hauptaktion in einem Zustand gefunden: ${branch.slice(0, 80)}`);
  });
});

// ---------------------------------------------------------------------------
// 5. nächster Schritt sichtbar.
// ---------------------------------------------------------------------------

check("nächster Schritt ist sichtbar", () => {
  assert.match(js, /jamal-work-next-step/);
  assert.match(js, /Beschreibe, welches Ergebnis du heute erreichen möchtest/);
});

// ---------------------------------------------------------------------------
// 6. Rückfrage sichtbar.
// ---------------------------------------------------------------------------

check("Rückfrage ist sichtbar und einzeln beantwortbar", () => {
  assert.match(js, /function renderClarification/);
  assert.match(js, /Rückfrage:/);
  assert.match(js, /name="answer"/);
});

// ---------------------------------------------------------------------------
// 7. Ergebnis oben sichtbar (innerhalb der obersten Karte, nicht weiter unten).
// ---------------------------------------------------------------------------

check("Ergebnis erscheint innerhalb der obersten Arbeitskarte", () => {
  assert.match(js, /function renderResult/);
  const cardSectionEnd = html.indexOf("</section>", html.indexOf('id="jamal-work-card"'));
  const outputIndex = html.indexOf('id="jamal-work-output"');
  assert.ok(outputIndex > 0 && outputIndex < cardSectionEnd, "jamal-work-output muss innerhalb der Heute-arbeiten-Karte liegen");
});

// ---------------------------------------------------------------------------
// 8+9. Status verständlich deutsch, keine Rohstatuscodes im Hauptfluss.
// ---------------------------------------------------------------------------

check("Status wird ausschließlich als verständlicher deutscher Text angezeigt", () => {
  assert.match(js, /escapeHtml\(view\.statusLabel\)/);
  assert.doesNotMatch(js, /escapeHtml\(item\.status\)/);
});

check("keine Rohstatuscodes im sichtbaren Text", () => {
  const mainRenderSource = js.slice(js.indexOf("function renderMain"), js.indexOf("function renderDiagnostics"));
  assert.doesNotMatch(mainRenderSource, />\s*NOT_STARTED\s*</);
  assert.doesNotMatch(mainRenderSource, />\s*RESULT_READY\s*</);
});

// ---------------------------------------------------------------------------
// 10. keine technischen IDs im Hauptfluss.
// ---------------------------------------------------------------------------

check("keine technischen IDs im Hauptfluss", () => {
  const mainRenderSource = js.slice(js.indexOf("function renderMain"), js.indexOf("function renderDiagnostics"));
  assert.doesNotMatch(mainRenderSource, /item\.id\b/);
  assert.doesNotMatch(mainRenderSource, /agentKey/);
});

// ---------------------------------------------------------------------------
// 11+12. keine Systemprompts, keine Chain-of-Thought.
// ---------------------------------------------------------------------------

check("keine Systemprompts oder Chain-of-Thought im Quelltext", () => {
  [html, js].forEach((source) => {
    assert.doesNotMatch(source, /system[- ]?prompt/i);
    assert.doesNotMatch(source, /chain[- ]?of[- ]?thought/i);
  });
});

// ---------------------------------------------------------------------------
// 13. Agentenbeitrag verständlich (deutsche Rollenbezeichnung).
// ---------------------------------------------------------------------------

check("Agentenbeitrag wird verständlich (deutsche Rollenbezeichnung) angezeigt", () => {
  assert.match(js, /roleLabel/);
  assert.doesNotMatch(js, /escapeHtml\(agent\.role\)/);
});

// ---------------------------------------------------------------------------
// 14. Qualitätsstatus verständlich.
// ---------------------------------------------------------------------------

check("Qualitätsstatus wird verständlich übersetzt", () => {
  assert.match(js, /QUALITY_LABELS/);
  assert.doesNotMatch(js, /escapeHtml\(latest\.qualityStatus\)/);
});

// ---------------------------------------------------------------------------
// 15+16+17. Passt-, Änderung-anfordern- und Später-Aktionen.
// ---------------------------------------------------------------------------

check("„Passt“-Aktion ist vorhanden", () => {
  assert.match(js, /data-action="mark-done"/);
  assert.match(js, />Passt</);
});

check("„Änderung anfordern“-Aktion ist vorhanden", () => {
  assert.match(js, /data-action="open-change-form"/);
  assert.match(js, />Änderung anfordern</);
  assert.match(js, /runActionWithFallback\("request-change"/);
});

check("„Später“ ist eine ruhigere Sekundäraktion (kein primary-button)", () => {
  assert.match(js, /secondary-button" data-action="mark-later"/);
  assert.doesNotMatch(js, /primary-button" data-action="mark-later"/);
});

// ---------------------------------------------------------------------------
// 18+19. technische Details weiter unten und einklappbar.
// ---------------------------------------------------------------------------

check("technische Details liegen unterhalb des Hauptergebnisses und sind einklappbar", () => {
  const outputIndex = html.indexOf('id="jamal-work-output"');
  const diagnosticsIndex = html.indexOf('id="jamal-work-diagnostics-output"');
  assert.ok(diagnosticsIndex > outputIndex, "technische Details müssen unterhalb des Hauptergebnisses stehen");
  const detailsOpenIndex = html.lastIndexOf("<details", diagnosticsIndex);
  assert.ok(detailsOpenIndex >= 0 && detailsOpenIndex < diagnosticsIndex);
});

// ---------------------------------------------------------------------------
// 20. mobile Darstellung.
// ---------------------------------------------------------------------------

check("mobile Darstellung ist vorgesehen", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.jamal-work-head/);
  assert.match(css, /\.jamal-work-primary-row,\s*\n\s*\.jamal-work-secondary-row/);
});

// ---------------------------------------------------------------------------
// 21. echte Labels.
// ---------------------------------------------------------------------------

check("Formularfelder besitzen echte Labels", () => {
  assert.match(js, /<label for="jamal-work-outcome-input">/);
  assert.match(js, /id="jamal-work-outcome-input"/);
  assert.match(js, /<label for="jamal-work-answer-input">/);
  assert.match(js, /id="jamal-work-answer-input"/);
});

// ---------------------------------------------------------------------------
// 22. aria-live.
// ---------------------------------------------------------------------------

check("aria-live ist auf den zentralen Ausgabebereichen gesetzt", () => {
  assert.match(html, /id="jamal-work-output" aria-live="polite"/);
  assert.match(html, /id="jamal-work-diagnostics-output" aria-live="polite"/);
});

// ---------------------------------------------------------------------------
// 23. sichtbare Fokuszustände (globale Regel, kein Fokus-Reset in diesem
//     Bereich).
// ---------------------------------------------------------------------------

check("sichtbare Fokuszustände bleiben erhalten (kein eigener Fokus-Reset)", () => {
  assert.match(css, /button:focus-visible,\s*\n\s*input:focus-visible,\s*\n\s*select:focus-visible,\s*\n\s*textarea:focus-visible \{\s*\n\s*outline: none;\s*\n\s*box-shadow: var\(--focus\);/);
  assert.doesNotMatch(js, /outline:\s*none/);
  assert.doesNotMatch(js, /tabindex="-1"/);
});

// ---------------------------------------------------------------------------
// 24+25+26. keine externe Ressource, kein Tracking, kein sensibles
//           LocalStorage.
// ---------------------------------------------------------------------------

check("keine externe Ressource", () => {
  assert.doesNotMatch(js, /https?:\/\//);
});

check("kein Tracking", () => {
  assert.doesNotMatch(js, /analytics|gtag|tracking[- ]?pixel/i);
});

check("kein LocalStorage für diese Arbeitsdaten", () => {
  assert.doesNotMatch(js, /localStorage/);
});

// ---------------------------------------------------------------------------
// 27+28. keine Veröffentlichung, kein Billing.
// ---------------------------------------------------------------------------

check("keine Veröffentlichungsfunktion im Jamal-Arbeitsmodus", () => {
  assert.doesNotMatch(js, /veröffentlich|publish/i);
});

check("kein Billing-Bezug im Jamal-Arbeitsmodus", () => {
  assert.doesNotMatch(js, /billing|rechnung|zahlung|payment/i);
});

check("kein Provider (Canva/HeyGen) im Jamal-Arbeitsmodus", () => {
  assert.doesNotMatch(js, /canva|heygen/i);
});

check("alle Aktionen laufen ausschließlich über /api/jamal-work-mode/*", () => {
  const actionCalls = [...js.matchAll(/(?:runAction|runActionWithFallback|postAction)\(\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(actionCalls.length >= 8, "zu wenige Aktionen gefunden");
  assert.match(js, /"\/api\/jamal-work-mode\/" \+ action/);
  assert.doesNotMatch(js, /\/api\/(owner|portal|v71)\//);
});

// ---------------------------------------------------------------------------
// 29. V8.8.2 – "Bisheriger Tageslauf" (Guided Work, Execution Bridge) bleibt
//     vollständig vorhanden, ist aber standardmäßig geschlossen. Prüft
//     gezielt das äußere <details class="jamal-work-secondary">-Element
//     (nicht irgendein inneres <details>) und alle bisherigen
//     Vollständigkeitsmerkmale bleiben additiv erhalten.
// ---------------------------------------------------------------------------

check(
  "„Bisheriger Tageslauf“ (Guided Work, Execution Bridge) ist vollständig vorhanden und standardmäßig geschlossen (V8.8.2)",
  () => {
    const classIndex = html.indexOf('class="jamal-work-secondary"');
    assert.ok(classIndex >= 0, "Container .jamal-work-secondary muss weiterhin vorhanden sein");

    const outerDetailsStart = html.lastIndexOf("<details", classIndex);
    assert.ok(
      outerDetailsStart >= 0 && outerDetailsStart < classIndex,
      "äußeres <details>-Element von .jamal-work-secondary muss auffindbar sein"
    );

    const outerDetailsTagEnd = html.indexOf(">", classIndex);
    assert.ok(outerDetailsTagEnd > classIndex, "öffnendes <details>-Tag muss abgeschlossen sein");
    const outerDetailsOpenTag = html.slice(outerDetailsStart, outerDetailsTagEnd + 1);

    assert.strictEqual(
      outerDetailsOpenTag,
      '<details class="jamal-work-secondary">',
      "das äußere <details>-Element von .jamal-work-secondary darf kein open-Attribut tragen"
    );
    assert.doesNotMatch(
      outerDetailsOpenTag,
      /\bopen\b/,
      "das äußere <details>-Element von .jamal-work-secondary darf kein open-Attribut tragen"
    );

    const summaryText = "<summary>Bisheriger Tageslauf (Guided Work, Execution Bridge)</summary>";
    assert.ok(html.includes(summaryText), "Zusammenfassungszeile muss unverändert weiterhin vorhanden sein");
    const summaryIndex = html.indexOf(summaryText);
    assert.ok(
      summaryIndex > outerDetailsStart,
      "Zusammenfassungszeile muss innerhalb des äußeren <details>-Elements von .jamal-work-secondary stehen"
    );

    assert.ok(html.includes('id="daily-work-run-section"'), "#daily-work-run-section muss weiterhin enthalten sein");
    const dailyRunIndex = html.indexOf('id="daily-work-run-section"');
    assert.ok(
      dailyRunIndex > summaryIndex,
      "#daily-work-run-section muss innerhalb des Bereichs nach der Zusammenfassungszeile stehen"
    );

    const outerDetailsCloseIndex = html.indexOf("</details>", dailyRunIndex);
    assert.ok(
      outerDetailsCloseIndex > dailyRunIndex,
      "das äußere <details>-Element von .jamal-work-secondary muss erst nach #daily-work-run-section schließen"
    );
  }
);

console.log(`jamal-work-mode-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
