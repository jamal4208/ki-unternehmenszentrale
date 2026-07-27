"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und Technologie-/
// Plugin-Marktradar (Auftrag Abschnitt N, Punkte 21/22): Bedienbarkeits-/
// Wortlaut-/Grenzenprüfung der neuen Führungsansicht "Agenten führen"
// (index.html/agent-leadership-ui.js/styles.css). Reine Quelltext-/
// Struktur-Prüfung ohne Browser/DOM (gleiches Muster wie
// jamal-canva-ui.test.js/jamal-work-mode-ui.test.js) – keine neue
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
const js = readFile("agent-leadership-ui.js");
const css = readFile("styles.css");
const routesJs = readFile("agent-leadership-routes.js");

// ---------------------------------------------------------------------------
// 1. Neue Führungsansicht "Agenten führen" ist registriert.
// ---------------------------------------------------------------------------

check("die Navigation enthält einen Eintrag 'Agenten führen'", () => {
  assert.match(html, /data-view="agent-leadership"/);
  assert.match(html, />Agenten führen</);
});

check("die Ansicht 'Agenten führen' existiert als eigener View-Container", () => {
  assert.match(html, /id="agent-leadership-view"/);
  assert.match(html, /data-title="Agenten führen"/);
});

check("das neue UI-Skript wird eingebunden", () => {
  assert.match(html, /<script src="agent-leadership-ui\.js"><\/script>/);
});

// ---------------------------------------------------------------------------
// 2. Oben sichtbar: Agentenzahl, HR-Laufstatus, wichtigste Entscheidung,
//    höchstens drei priorisierte Hinweise, Radar-Hinweis (Auftrag
//    Abschnitt L, Ziffer 1-5).
// ---------------------------------------------------------------------------

check("die Kompaktübersicht zeigt die Agentenzahl", () => {
  assert.match(js, /agentCount/);
  assert.match(html, /id="agent-leadership-summary-output"/);
});

check("die Kompaktübersicht zeigt den heutigen HR-Laufstatus", () => {
  assert.match(js, /hrDailyRunStatusLabel/);
});

check("die Kompaktübersicht zeigt die wichtigste heutige Entscheidung", () => {
  assert.match(js, /topDecision/);
  assert.match(js, /Wichtigste heutige Entscheidung/);
});

check("höchstens drei priorisierte Agentenhinweise werden serverseitig begrenzt", () => {
  const routesSource = routesJs;
  assert.match(routesSource, /\.slice\(0,\s*3\)/);
});

check("ein Technologie-Radar-Hinweis (neue Kandidaten/prüfbereit/blockiert) ist sichtbar", () => {
  assert.match(js, /radarHint/);
  assert.match(js, /newCandidates/);
  assert.match(js, /readyForReview/);
  assert.match(js, /blocked/);
});

// ---------------------------------------------------------------------------
// 3. Fünf Hauptbereiche (Auftrag Abschnitt L).
// ---------------------------------------------------------------------------

check("die fünf geforderten Hauptbereiche existieren als Tabs", () => {
  ["organization", "hr", "autonomy", "radar", "fit"].forEach((tabName) => {
    assert.match(html, new RegExp(`data-leadership-tab="${tabName}"`));
    assert.match(html, new RegExp(`data-leadership-panel="${tabName}"`));
  });
  assert.match(html, />Organisation</);
  assert.match(html, />Heute entwickeln</);
  assert.match(html, />Autonomie prüfen</);
  assert.match(html, />Technologie-Radar</);
  assert.match(html, />Agenten &amp;.*Werkzeuge</);
});

// ---------------------------------------------------------------------------
// 4. UX-Regeln: keine 25 großen Karten gleichzeitig, kompakte
//    Gruppenansicht/progressive Offenlegung, Filter nach Bereich/
//    Empfehlung/Status.
// ---------------------------------------------------------------------------

check("die Organisation wird gruppiert und über <details> progressiv offengelegt (kein 25-Karten-Grid)", () => {
  assert.match(js, /agent-leadership-group-details/);
  assert.match(js, /<details class="v71-details">/);
  assert.ok(!/v71-card-list/.test(js), "verwendet das 25-Karten-Rastermuster");
});

check("ein Filter nach Bereich (Organisation) existiert", () => {
  assert.match(js, /data-filter="orgDepartment"/);
});

check("ein Filter nach Empfehlung existiert (HR und Radar)", () => {
  assert.match(js, /data-filter="hrRecommendation"/);
  assert.match(js, /data-filter="radarRecommendation"/);
});

check("ein Filter nach Status existiert (HR und Radar)", () => {
  assert.match(js, /data-filter="hrStatus"/);
  assert.match(js, /data-filter="radarStatus"/);
});

check("pro HR-Vorschlag existiert ein klarer nächster Schritt (benötigte Entscheidung + Aktionen)", () => {
  assert.match(js, /Benötigte Entscheidung/);
  assert.match(js, /data-hr-action="APPROVED"/);
  assert.match(js, /data-hr-action="REJECTED"/);
  assert.match(js, /data-hr-action="DEFERRED"/);
});

check("bestehendes Designsystem wird wiederverwendet (v71-Klassen, kein neues Grundlayout)", () => {
  assert.match(js, /v71-details/);
  assert.match(js, /v71-detail-list/);
  assert.match(js, /primary-button/);
  assert.match(js, /secondary-button/);
});

// ---------------------------------------------------------------------------
// 5. Sicherheits-/Autonomiegrenzen sichtbar (Auftrag Abschnitt M).
// ---------------------------------------------------------------------------

check("ein fester Hinweistext zu Autonomie-/Sicherheitsgrenzen ist im UI verankert", () => {
  assert.match(js, /keine Autonomieänderung/);
  assert.match(js, /installiert nichts/);
  assert.match(js, /Jamal bleibt Entscheider/);
});

check("die Autonomie-Ansicht weist explizit darauf hin, dass eine Empfehlung keine Autonomie ändert", () => {
  assert.match(js, /renderAutonomy/);
  assert.match(js, /ändert noch keine tatsächliche Autonomiestufe/);
});

check("das Radar-Erfassungsformular weist auf 'keine Webrecherche, keine Verbindung, keine Installation' hin", () => {
  assert.match(js, /Keine Webrecherche, keine Verbindung, keine Installation/);
});

// ---------------------------------------------------------------------------
// 6. Grundlegende UI-Hygiene (gleiche Regeln wie bestehende V7.x-Ansichten).
// ---------------------------------------------------------------------------

check("Formularfelder besitzen echte Labels", () => {
  const labelForMatches = js.match(/<label for="[^"]+">/g) || [];
  assert.ok(labelForMatches.length > 5);
});

check("aria-live ist auf den zentralen Ausgabebereichen gesetzt", () => {
  assert.match(html, /id="agent-leadership-summary-output" class="v71-output" aria-live="polite"/);
  assert.match(html, /id="agent-leadership-organization-output" class="v71-output" aria-live="polite"/);
});

check("keine externe Ressource im neuen UI-Skript", () => {
  assert.ok(!/https?:\/\/(?!www\.canva\.com)/.test(js), "enthält eine externe URL");
});

check("kein Tracking im neuen UI-Skript", () => {
  assert.ok(!/analytics|gtag|pixel/i.test(js));
});

check("kein LocalStorage für Führungsdaten (Persistenz läuft ausschließlich über die API)", () => {
  assert.ok(!/localStorage/.test(js));
});

check("keine Veröffentlichungs-/Social-Media-/Billing-Aktion im neuen UI-Skript", () => {
  assert.ok(!/publish|veröffentlich|social.?media|billing|zahlung/i.test(js));
});

check("keine Plugininstallation/-verbindung wird vom UI ausgelöst (nur lokale Erfassung/Bewertung)", () => {
  assert.ok(!/installTool|connectTool|install-plugin/i.test(js));
});

check("alle Aktionen laufen ausschließlich über /api/agent-leadership/*", () => {
  const actionUrls = js.match(/\/api\/[a-z0-9\-/]+/gi) || [];
  actionUrls.forEach((url) => assert.match(url, /^\/api\/agent-leadership\//));
});

check("keine Systemprompts oder Chain-of-Thought im Quelltext", () => {
  assert.ok(!/systemPrompt|chainOfThought|chain-of-thought/i.test(js));
});

check("mobile Darstellung ist über bestehende v71-/responsive Klassen vorgesehen (kein separates Desktop-only-Layout)", () => {
  assert.match(css, /\.agent-leadership-tabs/);
  assert.match(css, /\.agent-leadership-panel/);
});

console.log(`agent-leadership-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
