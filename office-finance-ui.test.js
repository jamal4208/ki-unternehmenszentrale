"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt X,
// Prüfpunkte 39-43): Bedienbarkeits-/Wortlaut-/Grenzenprüfung der neuen
// Hauptansicht "Office & Finanzen" (index.html/office-finance-ui.js/
// styles.css). Reine Quelltext-/Struktur-Prüfung ohne Browser/DOM (gleiches
// Muster wie agent-leadership-ui.test.js) – keine neue npm-Abhängigkeit.

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
const js = readFile("office-finance-ui.js");
const css = readFile("styles.css");
const routesJs = readFile("office-finance-routes.js");

// ---------------------------------------------------------------------------
// 1. Neue Hauptansicht "Office & Finanzen" ist registriert.
// ---------------------------------------------------------------------------

check("die Navigation enthält einen Eintrag 'Office & Finanzen'", () => {
  assert.match(html, /data-view="office-finance"/);
  assert.match(html, />Office &amp;.*Finanzen</);
});

check("die Ansicht 'Office & Finanzen' existiert als eigener View-Container", () => {
  assert.match(html, /id="office-finance-view"/);
  assert.match(html, /data-title="Office &amp; Finanzen"/);
});

check("das neue UI-Skript wird eingebunden", () => {
  assert.match(html, /<script src="office-finance-ui\.js"><\/script>/);
});

// ---------------------------------------------------------------------------
// 39-42. Oben sichtbar: Apple-first-Status, Google-controlled-Status,
// Authentifizierung ausstehend, Finance-Gap, höchstens drei Entscheidungen.
// ---------------------------------------------------------------------------

check("39. die Kompaktübersicht zeigt den Apple-first-Status", () => {
  assert.match(js, /Apple-first \/ Google-controlled/);
});

check("40. die Kompaktübersicht zeigt den Google-controlled-Kontenstatus", () => {
  assert.match(js, /googleAccountStatus/);
  assert.match(js, /Google-Kontenstatus/);
});

check("41. die Kompaktübersicht zeigt die ausstehende Authentifizierung", () => {
  assert.match(js, /pendingAuthenticationCount/);
  assert.match(js, /Authentifizierung ausstehend/);
});

check("42. die Kompaktübersicht zeigt den Finance-Capability-Gap", () => {
  assert.match(js, /financeCapabilityGap/);
  assert.match(js, /Finance-Capability-Gap/);
});

check("die Kompaktübersicht zeigt den heutigen nächsten Schritt", () => {
  assert.match(js, /todayNextStep/);
  assert.match(js, /Heutiger nächster Schritt/);
});

check("43. höchstens drei wichtige Entscheidungen werden serverseitig UND clientseitig begrenzt", () => {
  assert.match(routesJs, /decisions\.slice\(0,\s*3\)/);
  assert.match(js, /\.slice\(0, d\.maxTopDecisions \|\| 3\)/);
});

// ---------------------------------------------------------------------------
// 2. Acht geforderte Hauptbereiche (Auftrag Abschnitt U).
// ---------------------------------------------------------------------------

check("die acht geforderten Bereiche existieren als Tabs", () => {
  ["system", "identities", "email", "calendar", "documents", "contacts", "finance", "approvals", "connections"].forEach((tabName) => {
    assert.match(html, new RegExp(`data-office-finance-tab="${tabName}"`));
    assert.match(html, new RegExp(`data-office-finance-panel="${tabName}"`));
  });
  assert.match(html, />Systemaufteilung</);
  assert.match(html, />E-Mail</);
  assert.match(html, />Kalender</);
  assert.match(html, />Dokumente</);
  assert.match(html, />Kontakte</);
  assert.match(html, />Finanzen</);
  assert.match(html, />Freigaben</);
  assert.match(html, />Verbindungen</);
});

// ---------------------------------------------------------------------------
// 3. UX-Regeln: progressive Offenlegung, Read-only/Entwurf/Schreiben
// unterscheidbar, keine vortäuschende "Verbinden"-Schaltfläche.
// ---------------------------------------------------------------------------

check("Identitäten/Fähigkeiten werden über <details> progressiv offengelegt (keine Textwand)", () => {
  assert.match(js, /<details class="v71-details">/);
});

check("Read-only/Entwurf/Schreiben sind pro Fähigkeit sichtbar unterschieden", () => {
  assert.match(js, /Lesen\/Schreiben/);
  assert.match(js, /recommendedInitialStateLabel/);
  assert.match(js, /kein echter Verbindungsversuch/);
});

check("keine Schaltfläche täuscht einen echten Google-Zugriff vor ('Verbinden' existiert nicht als aktive Aktion)", () => {
  assert.ok(!/>Verbinden</.test(js), "enthält eine vortäuschende 'Verbinden'-Schaltfläche");
  assert.match(js, /Verbindung später gemeinsam einrichten/);
  assert.match(js, /<button type="button" class="secondary-button" disabled>Verbindung später gemeinsam einrichten<\/button>/);
});

check("die Verbindungsschaltfläche ist ausdrücklich funktionslos gekennzeichnet", () => {
  assert.match(js, /Diese Schaltfläche verbindet nichts\./);
});

check("bestehendes Designsystem wird wiederverwendet (v71-Klassen, kein neues Grundlayout)", () => {
  assert.match(js, /v71-details/);
  assert.match(js, /v71-detail-list/);
  assert.match(js, /v71-card/);
  assert.match(js, /secondary-button/);
});

// ---------------------------------------------------------------------------
// 4. Sicherheits-/Autonomiegrenzen sichtbar (Auftrag Abschnitt Y).
// ---------------------------------------------------------------------------

check("ein fester Hinweistext zu Apple-first/Google-controlled-Grenzen ist im UI verankert", () => {
  assert.match(js, /kein Apple-Datenzugriff, keine Migration/);
  assert.match(js, /keine echte Verbindung, kein OAuth, keine Mail, kein Termin, keine Drive-Datei, keine Kontakte/);
});

check("Finance wird ausdrücklich als Preparation-only ohne Buchung/Zahlung/Rechnungsversand gekennzeichnet", () => {
  assert.match(js, /Finance bleibt Preparation-only: keine Buchung, keine Zahlung, kein Rechnungsversand\./);
  assert.match(js, /Ausführung gesperrt<\/dt><dd>Ja – keine Buchung, keine Zahlung, kein Versand/);
});

check("Identitäten weisen explizit auf 'kein Passwort, kein Token, kein Recovery-Code' hin", () => {
  assert.match(js, /Kein Passwort, kein Token, kein Recovery-Code wird gespeichert\. Kein Agent erhält eigene Zugangsdaten\./);
});

// ---------------------------------------------------------------------------
// 5. Grundlegende UI-Hygiene (gleiche Regeln wie bestehende V7.x-Ansichten).
// ---------------------------------------------------------------------------

check("aria-live ist auf den zentralen Ausgabebereichen gesetzt", () => {
  assert.match(html, /id="office-finance-summary-output" class="v71-output" aria-live="polite"/);
  assert.match(html, /id="office-finance-system-output" class="v71-output" aria-live="polite"/);
});

check("keine externe Ressource im neuen UI-Skript", () => {
  assert.ok(!/https?:\/\//.test(js), "enthält eine externe URL");
});

check("kein Tracking im neuen UI-Skript", () => {
  assert.ok(!/analytics|gtag|pixel/i.test(js));
});

check("kein LocalStorage für Office-/Finance-Daten (Persistenz läuft ausschließlich über die API)", () => {
  assert.ok(!/localStorage/.test(js));
});

check("keine echte externe Aktion wird vom UI ausgelöst (kein send/create/delete/pay/book/login/oauth-Aufruf)", () => {
  assert.ok(!/postAction\(\s*["'](send|create|delete|pay|book|login|oauth)/i.test(js));
  assert.ok(!/installTool|connectTool|install-plugin|google-login|oauth-start|oauth-callback/i.test(js));
});

check("alle Aktionen laufen ausschließlich über /api/office-finance/*", () => {
  const actionUrls = js.match(/\/api\/[a-z0-9\-/]+/gi) || [];
  assert.ok(actionUrls.length > 0);
  actionUrls.forEach((url) => assert.match(url, /^\/api\/office-finance\//));
});

check("keine Systemprompts oder Chain-of-Thought im Quelltext", () => {
  assert.ok(!/systemPrompt|chainOfThought|chain-of-thought/i.test(js));
});

check("mobile Darstellung ist über bestehende v71-/responsive Klassen vorgesehen (kein separates Desktop-only-Layout)", () => {
  assert.match(css, /\.office-finance-tabs/);
  assert.match(css, /\.office-finance-panel/);
  assert.match(css, /\.office-finance-summary-grid/);
  assert.match(css, /\.office-finance-table/);
});

console.log(`office-finance-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
