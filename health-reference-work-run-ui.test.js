"use strict";

// V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
// der KI-Unternehmenszentrale verankern (Auftrag Abschnitt 13,
// Prüfpunkte 17, 18) – Bedienbarkeits-/Wortlautprüfung der kompakten
// Health-Referenzlauf-Karte (index.html/health-reference-work-run-ui.js/
// styles.css). Reine Quelltext-/Struktur-Prüfung ohne Browser/DOM (gleiches
// Muster wie office-finance-ui.test.js) – keine neue npm-Abhängigkeit.

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
const js = readFile("health-reference-work-run-ui.js");
const css = readFile("styles.css");

// ---------------------------------------------------------------------------
// Karte ist registriert, "Oben arbeiten. Unten nachschauen." – kompakte
// Ebene oben, aufklappbare Details darunter (Auftrag Abschnitt 11).
// ---------------------------------------------------------------------------

check("die Health-Referenzlauf-Karte existiert im Cockpit", () => {
  assert.match(html, /id="health-reference-run-card"/);
  assert.match(html, /id="health-reference-run-output"/);
});

check("das UI-Skript wird eingebunden", () => {
  assert.match(html, /<script src="health-reference-work-run-ui\.js"><\/script>/);
});

check("die Karte steht nach der zentralen Arbeitskarte 'Heute arbeiten' (additiv, kein Umbau bestehender Karten)", () => {
  const workCardIndex = html.indexOf('id="jamal-work-card"');
  const healthCardIndex = html.indexOf('id="health-reference-run-card"');
  assert.ok(workCardIndex >= 0 && healthCardIndex > workCardIndex, "Health-Referenzlauf-Karte muss nach der Heute-arbeiten-Karte stehen");
});

check("Details sind über <details>/<summary> aufklappbar, keine Textwand auf der ersten Ebene", () => {
  assert.match(html, /<details class="health-reference-run-details">/);
  assert.match(html, /<summary>Team, Arbeitspakete, Freigaben, Nicht-Ziele, Abschlusskriterien, Nachweise<\/summary>/);
});

// ---------------------------------------------------------------------------
// Oben sichtbar (Auftrag Abschnitt 11): Projekt, Ergebniswunsch, Status,
// Hauptverantwortlicher, nächstes Arbeitspaket, Blocker, Fortschritt als
// Arbeitspakete (kein erfundener Prozentwert).
// ---------------------------------------------------------------------------

check("Projekt und Ergebniswunsch sind oben sichtbar", () => {
  assert.match(js, /Health Upgrade Kompass/);
  assert.match(js, /run\.outcomeText/);
});

check("Status und Hauptverantwortlicher sind oben sichtbar", () => {
  assert.match(js, /run\.statusLabel/);
  assert.match(js, /run\.team\.mainAgent\.canonicalName/);
});

check("das nächste Arbeitspaket ist oben sichtbar", () => {
  assert.match(js, /run\.nextWorkPackage/);
  assert.match(js, /N(ä|\\u00e4)chstes Arbeitspaket/);
});

check("der größte Blocker ist oben sichtbar", () => {
  assert.match(js, /function biggestBlockerText/);
  assert.match(js, /Gr(ö|\\u00f6)(ß|\\u00df)ter Blocker/);
});

check("Fortschritt wird als Arbeitspakete gezählt, nicht als erfundener Prozentwert", () => {
  assert.match(js, /function progressLabel/);
  assert.match(js, /von .+Arbeitspaketen abgeschlossen/);
  assert.ok(!/\d+\s*%/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "enthält einen Prozentwert im Quelltext");
});

// ---------------------------------------------------------------------------
// 17. genau eine klare nächste Handlung.
// ---------------------------------------------------------------------------

check("17. genau eine klare nächste Handlung ist sichtbar (renderPrimaryAction, höchstens ein primärer Button je Zustand)", () => {
  assert.match(js, /function renderPrimaryAction/);
  const functionMatch = js.match(/function renderPrimaryAction\(run\) \{([\s\S]*?)\n  \}/);
  assert.ok(functionMatch, "renderPrimaryAction nicht gefunden");
  const branches = functionMatch[1].split(/\}\s*else if\s*\(/);
  branches.forEach((branch) => {
    const buttonMatches = branch.match(/<button/g) || [];
    assert.ok(buttonMatches.length <= 1, `mehr als ein Button in einem Zustand gefunden: ${branch.slice(0, 80)}`);
  });
  assert.match(js, /N(ä|\\u00e4)chste Handlung/);
});

// ---------------------------------------------------------------------------
// keine Schaltfläche führt echte Health-Arbeit aus, committet oder pusht.
// ---------------------------------------------------------------------------

check("keine Schaltfläche führt eine echte Health-Ausführung, einen Commit oder einen Push aus", () => {
  assert.ok(!/data-action="(commit|push|deploy|execute-health|run-health)"/i.test(js));
  assert.ok(!/postAction\(\s*["'](commit|push|deploy|execute)/i.test(js));
});

check("alle schreibenden Aktionen laufen ausschließlich über /api/health-reference/*", () => {
  const actionUrls = js.match(/\/api\/[a-z0-9\-/]+/gi) || [];
  assert.ok(actionUrls.length > 0);
  actionUrls.forEach((url) => assert.match(url, /^\/api\/health-reference\//));
});

check("die finale Abnahme kann nicht ungeprüft per Klick ausgelöst werden (erfordert Jamals ausdrückliche Bestätigung außerhalb der Schaltfläche)", () => {
  assert.match(js, /erfordert eine ausdr(ü|\\u00fc)ckliche Best(ä|\\u00e4)tigung durch Jamal/);
  assert.ok(!/confirmed:\s*true/.test(js), "UI darf confirmed:true nicht selbst fest verdrahten");
});

// ---------------------------------------------------------------------------
// 18. UI behauptet keine Produktionsreife.
// ---------------------------------------------------------------------------

check("18. die Karte behauptet an keiner Stelle Produktionsreife (fester Disclaimer sichtbar)", () => {
  assert.match(js, /function renderDisclaimer/);
  assert.match(js, /autonomyBoundaries/);
  assert.ok(!/produktionsreif\b/i.test(js) || /kein Nachweis.*produktionsreif/i.test(js));
});

// ---------------------------------------------------------------------------
// Grundlegende UI-Hygiene (gleiche Regeln wie bestehende V7.x-Ansichten).
// ---------------------------------------------------------------------------

check("aria-live ist auf den zentralen Ausgabebereichen gesetzt", () => {
  assert.match(html, /id="health-reference-run-output" aria-live="polite"/);
  assert.match(html, /id="health-reference-run-diagnostics-output" aria-live="polite"/);
});

check("keine externe Ressource im neuen UI-Skript", () => {
  assert.ok(!/https?:\/\//.test(js), "enthält eine externe URL");
});

check("kein Tracking im neuen UI-Skript", () => {
  assert.ok(!/analytics|gtag|pixel/i.test(js));
});

check("kein LocalStorage für Health-Referenzlaufdaten (Persistenz läuft ausschließlich über die API)", () => {
  assert.ok(!/localStorage/.test(js));
});

check("keine Systemprompts oder Chain-of-Thought im Quelltext", () => {
  assert.ok(!/systemPrompt|chainOfThought|chain-of-thought/i.test(js));
});

check("CSRF-Header wird bei jeder schreibenden Aktion mitgesendet (gleiches Muster wie office-finance-ui.js)", () => {
  assert.match(js, /x-kuz-csrf/);
});

check("bestehendes Kartendesign wird über eigene, additive Klassen gestaltet (kein Umbau bestehender .jamal-work-*-Klassen)", () => {
  assert.match(css, /\.health-reference-run-card/);
  assert.match(css, /\.health-reference-run-facts/);
  assert.match(css, /\.health-reference-run-primary-action/);
  assert.ok(!/\.jamal-work-card\s*\{[^}]*health-reference/i.test(css));
});

// ---------------------------------------------------------------------------
// V7.6.4 – einzelne Health-Arbeitspakete korrekt abschließen (Auftrag
// Abschnitt 8, Prüfpunkt 11): die Karte besitzt an keiner Stelle eine
// Schaltfläche, die eine erneute QA-Prüfung für ein bereits abgeschlossenes
// (COMPLETED) Arbeitspaket auslöst – QA/Ergebnis-Erfassung läuft
// ausschließlich außerhalb dieser rein lesenden/vorbereitenden Karte.
// ---------------------------------------------------------------------------

check("V7.6.4-11. keine Schaltfläche löst eine (erneute) QA-Prüfung oder Ergebniseinreichung aus", () => {
  assert.ok(!/data-action="(submit-qa-finding|submit-qa|submit-result-report|request-changes)"/i.test(js));
  assert.ok(!/postAction\(\s*["'](submit-qa-finding|submit-result-report|request-changes)/i.test(js));
});

check("V7.6.4-9/10. Fortschritt und nächstes Arbeitspaket werden generisch aus run.progress/run.nextWorkPackage abgeleitet (kein hartcodiertes '1 von 7')", () => {
  assert.ok(!/1\s+von\s+7/.test(js), "Fortschritt darf nicht als fester Text verdrahtet sein");
  assert.match(js, /progress\.completed/);
  assert.match(js, /progress\.total/);
});

check("V7.6.4-7. abgeschlossene Arbeitspakete zeigen ihren Status (pkg.statusLabel), keinen erfundenen Text", () => {
  assert.match(js, /pkg\.statusLabel/);
});

console.log(`health-reference-work-run-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
