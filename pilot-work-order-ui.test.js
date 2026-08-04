"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
// Bedienbarkeits-/Wortlautprüfung der kompakten Pilotauftrags-Karte
// (index.html/pilot-work-order-ui.js/styles.css). Reine Quelltext-/
// Struktur-Prüfung ohne Browser/DOM (gleiches Muster wie
// health-reference-work-run-ui.test.js) – keine neue npm-Abhängigkeit.

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
const js = readFile("pilot-work-order-ui.js");
const css = readFile("styles.css");

// ---------------------------------------------------------------------------
// Karte ist registriert, "Oben arbeiten. Unten nachschauen." – kompakte
// Ebene oben, aufklappbare Details darunter. Keine große UI-Neugestaltung.
// ---------------------------------------------------------------------------

check("die Pilotauftrags-Karte existiert im Cockpit", () => {
  assert.match(html, /id="pilot-work-order-card"/);
  assert.match(html, /id="pilot-work-order-output"/);
});

check("das UI-Skript wird eingebunden", () => {
  assert.match(html, /<script src="pilot-work-order-ui\.js"><\/script>/);
});

check("die Karte steht nach der bestehenden Health-Referenzlauf-Karte (additiv, kein Umbau bestehender Karten)", () => {
  const healthCardIndex = html.indexOf('id="health-reference-run-card"');
  const pilotCardIndex = html.indexOf('id="pilot-work-order-card"');
  assert.ok(healthCardIndex >= 0 && pilotCardIndex > healthCardIndex, "Pilotauftrags-Karte muss nach der Health-Referenzlauf-Karte stehen");
});

check("Details sind über <details>/<summary> aufklappbar, keine Textwand auf der ersten Ebene", () => {
  assert.match(html, /<details class="pilot-work-order-details">/);
  assert.match(html, /<summary>Agentenzuordnung, Qualitätskriterien, Werkzeuge, Freigaben, Rollenübergaben<\/summary>/);
});

// ---------------------------------------------------------------------------
// Oben sichtbar: Auftrag, beteiligte Agenten, Status, offene Entscheidung,
// Risiken/Grenzen, nächster Schritt (Auftrag "Ergebnisübersicht").
// ---------------------------------------------------------------------------

check("Auftrag (Titel/gewünschtes Ergebnis) ist oben sichtbar", () => {
  assert.match(js, /overview\.order\.title/);
  assert.match(js, /overview\.order\.desiredOutcome/);
});

check("Status und beteiligte Agenten sind oben sichtbar", () => {
  assert.match(js, /overview\.statusLabel/);
  assert.match(js, /overview\.involvedAgents/);
});

check("offene Entscheidung und Risiken/Grenzen sind oben sichtbar", () => {
  assert.match(js, /overview\.openDecision/);
  assert.match(js, /overview\.risksAndLimits/);
});

check("der nächste sinnvolle Schritt ist oben sichtbar", () => {
  assert.match(js, /overview\.nextStep/);
});

check("bisherige Ergebnisse (Rollenübergaben) sind aufklappbar sichtbar", () => {
  assert.match(js, /overview\.handoffs/);
  assert.match(js, /Rollen\\u00fcbergaben/);
});

// ---------------------------------------------------------------------------
// Keine Schaltfläche löst eine echte externe Aktion, eine automatische
// Freigabe oder ein Commit/Push/Deployment aus.
// ---------------------------------------------------------------------------

check("ein Klick auf approve-for-execution/approve-completion sendet niemals direkt confirmed:true, sondern öffnet nur eine lokale Bestätigungsfläche", () => {
  // Der Klick-Handler selbst darf für diese beiden Aktionen ausschließlich
  // die lokale Bestätigungsfläche öffnen (kein API-Aufruf beim Öffnen, siehe
  // V7.7.1/openJamalConfirmationDialog) – kein hartkodierter Ein-Klick-Aufruf
  // mit `confirmed: true` irgendwo in der Datei.
  assert.doesNotMatch(js, /postAction\(\s*"approve-for-execution"\s*,\s*\{\s*confirmed:\s*true/);
  assert.doesNotMatch(js, /postAction\(\s*"approve-completion"\s*,\s*\{\s*confirmed:\s*true/);
  assert.match(
    js,
    /action === "approve-for-execution" \|\| action === "approve-completion"\) \{[\s\S]{0,200}openJamalConfirmationDialog\(action\)/,
  );
});

check("die endgültige Bestätigung erfordert eine aktiv gesetzte Checkbox und sendet confirmed:true erst nach einem eigenen Bestätigungsklick", () => {
  assert.match(js, /Ich best\\u00e4tige diese Ausf\\u00fchrungsfreigabe ausdr\\u00fccklich\./);
  assert.match(js, /function confirmJamalConfirmation\(\)/);
  assert.match(js, /if \(!confirmation \|\| confirmation\.submitting \|\| !confirmation\.checked\) return Promise\.resolve\(\);/);
  assert.match(js, /postAction\(pilotOrderId, action, \{ confirmed: true, expectedRevision: expectedRevision \}\)/);
});

check("Abbrechen/Schließen der Bestätigungsfläche löst keinen Request aus (rein lokaler Zustand)", () => {
  assert.match(js, /function cancelJamalConfirmation\(\)/);
  const cancelFnMatch = js.match(/function cancelJamalConfirmation\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(cancelFnMatch, "cancelJamalConfirmation muss auffindbar sein");
  assert.doesNotMatch(cancelFnMatch[0], /fetch|postAction/);
});

check("das Öffnen der Bestätigungsfläche selbst löst keinen Request aus (kein versteckter API-Aufruf beim Öffnen)", () => {
  const openFnMatch = js.match(/function openJamalConfirmationDialog\(action\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(openFnMatch, "openJamalConfirmationDialog muss auffindbar sein");
  assert.doesNotMatch(openFnMatch[0], /fetch|postAction/);
});

check("keine Publish-/Send-/Deploy-/Commit-/Push-Aktion wird als data-action/postAction ausgelöst", () => {
  const actionCalls = js.match(/data-action="[a-z-]+"|postAction\("[a-z-]+"/gi) || [];
  assert.ok(actionCalls.length > 0, "es sollten Aktionen im Skript vorhanden sein");
  actionCalls.forEach((call) => assert.doesNotMatch(call, /publish|send-email|deploy|commit|push/i));
});

check("das UI-Skript spricht ausschließlich /api/pilot-work-order/ an", () => {
  const apiCalls = js.match(/\/api\/[a-z0-9\-\/]+/gi) || [];
  apiCalls.forEach((call) => assert.match(call, /^\/api\/pilot-work-order\//));
});

// ---------------------------------------------------------------------------
// statisches Asset ist als OWNER_ONLY registriert; CSS-Klassen vorhanden.
// ---------------------------------------------------------------------------

check("das statische UI-Skript ist in route-access-policy.js als OWNER_ONLY registriert", () => {
  const policy = readFile("route-access-policy.js");
  assert.match(policy, /staticOwnerOnly\("\/pilot-work-order-ui\.js"/);
  assert.match(policy, /ownerGet\("\/api\/pilot-work-order\/status"/);
  assert.match(policy, /ownerPostPrefix\("\/api\/pilot-work-order\/"/);
});

check("die Karte hat eigene, additive CSS-Klassen (kein Umbau bestehender Karten)", () => {
  assert.match(css, /\.pilot-work-order-card/);
  assert.match(css, /\.pilot-work-order-primary-action/);
});

// ---------------------------------------------------------------------------
// V8.7 Stufe B ("gespeicherte Entscheidungsgründe in der
// Pilotauftrags-Detailansicht sichtbar machen") – Prüfpunkte 44–58.
// Reine Quelltext-/Wortlautprüfung, gleiches Muster wie oben.
// ---------------------------------------------------------------------------

check("44. die neuen, additiven CSS-Klassen für die Gründe-Anzeige existieren", () => {
  assert.match(css, /\.pilot-decision-reason-card/);
  assert.match(css, /\.pilot-decision-reason-text/);
  assert.match(css, /\.pilot-decision-reason-history/);
});

check("45. escapeHtml() wird in den neuen Renderfunktionen für jeden sichtbaren dynamischen Grundwert verwendet", () => {
  const cardFnMatch = js.match(/function renderDecisionReasonCard\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(cardFnMatch, "renderDecisionReasonCard muss auffindbar sein");
  assert.match(cardFnMatch[0], /escapeHtml\(current\.text\)/);
  assert.match(cardFnMatch[0], /escapeHtml\(formatTimestamp\(current\.setAt\)\)/);

  const historyFnMatch = js.match(/function renderDecisionReasonHistory\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(historyFnMatch, "renderDecisionReasonHistory muss auffindbar sein");
  assert.match(historyFnMatch[0], /escapeHtml\(entry\.text\)/);
  assert.match(historyFnMatch[0], /escapeHtml\(formatTimestamp\(entry\.setAt\)\)/);
});

check("46./47. white-space: pre-wrap und overflow-wrap: anywhere sind im neuen Grundtext-Stil vorhanden", () => {
  const textRuleMatch = css.match(/\.pilot-decision-reason-text\s*\{[^}]*\}/);
  assert.ok(textRuleMatch, ".pilot-decision-reason-text muss auffindbar sein");
  assert.match(textRuleMatch[0], /white-space:\s*pre-wrap/);
  assert.match(textRuleMatch[0], /overflow-wrap:\s*anywhere/);
});

check("48./49./50. kein max-height, kein text-overflow und kein nowrap im gesamten neuen Klassenraum .pilot-decision-reason-*", () => {
  const rules = css.match(/\.pilot-decision-reason-[a-z-]+\s*\{[^}]*\}/g) || [];
  assert.ok(rules.length > 0, "es müssen .pilot-decision-reason-*-Regeln vorhanden sein");
  rules.forEach((rule) => {
    assert.doesNotMatch(rule, /max-height/);
    assert.doesNotMatch(rule, /text-overflow/);
    assert.doesNotMatch(rule, /nowrap/);
  });
});

check("keine Ersetzung von Zeilenumbrüchen durch <br> im Grundtext (Rohtext bleibt unverändert, CSS übernimmt den Umbruch)", () => {
  const cardFnMatch = js.match(/function renderDecisionReasonCard\(overview\)\s*\{[\s\S]*?\n  \}/);
  const historyFnMatch = js.match(/function renderDecisionReasonHistory\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.doesNotMatch(cardFnMatch[0], /replace\(.*\\n/);
  assert.doesNotMatch(cardFnMatch[0], /<br/);
  assert.doesNotMatch(historyFnMatch[0], /<br/);
});

check("51. setByUserId wird in der Renderlogik nicht verwendet (weder gelesen noch ausgegeben)", () => {
  assert.doesNotMatch(js, /\.setByUserId/);
});

check("52. fromStatus/toStatus werden in der Renderlogik nicht verwendet", () => {
  assert.doesNotMatch(js, /current\.fromStatus/);
  assert.doesNotMatch(js, /current\.toStatus/);
  assert.doesNotMatch(js, /entry\.fromStatus/);
  assert.doesNotMatch(js, /entry\.toStatus/);
});

check("53. orderRevision wird ausschließlich für den Ausschlussvergleich verwendet, niemals für sichtbares HTML", () => {
  const deriveFnMatch = js.match(/function deriveDecisionReasonHistoryEntries\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(deriveFnMatch, "deriveDecisionReasonHistoryEntries muss auffindbar sein");
  assert.match(deriveFnMatch[0], /entry\.orderRevision !== currentRevision/);
  const cardFnMatch = js.match(/function renderDecisionReasonCard\(overview\)\s*\{[\s\S]*?\n  \}/);
  const historyFnMatch = js.match(/function renderDecisionReasonHistory\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.doesNotMatch(cardFnMatch[0], /["']\s*\+\s*current\.orderRevision|current\.orderRevision\s*\+\s*["']/);
  assert.doesNotMatch(historyFnMatch[0], /["']\s*\+\s*entry\.orderRevision|entry\.orderRevision\s*\+\s*["']/);
});

check("54./55. keine neue Route, kein POST/PATCH/DELETE im Zusammenhang mit den Entscheidungsgründen", () => {
  assert.doesNotMatch(js, /\/decision-reason/i);
  const apiCalls = js.match(/\/api\/[a-z0-9\-\/]+/gi) || [];
  apiCalls.forEach((call) => assert.match(call, /^\/api\/pilot-work-order\//));
});

check("56. keine neue Primäraktion: renderPrimaryAction() bleibt unverändert, der neue Bereich enthält keinen Button/kein data-action", () => {
  const cardFnMatch = js.match(/function renderDecisionReasonCard\(overview\)\s*\{[\s\S]*?\n  \}/);
  const historyFnMatch = js.match(/function renderDecisionReasonHistory\(overview\)\s*\{[\s\S]*?\n  \}/);
  assert.doesNotMatch(cardFnMatch[0], /<button/);
  assert.doesNotMatch(cardFnMatch[0], /data-action/);
  assert.doesNotMatch(historyFnMatch[0], /<button/);
  assert.doesNotMatch(historyFnMatch[0], /data-action/);
  assert.match(js, /renderChainStatusCard\(overview\) \+\s*\n\s*renderDecisionReasonCard\(overview\) \+\s*\n\s*renderPrimaryAction\(overview\);/);
});

check("57. die neuen deutschen Literale folgen der bestehenden \\uXXXX-Konvention", () => {
  assert.match(js, /Warum der Auftrag blockiert ist/);
  assert.match(js, /Warum der Auftrag zur\\u00fcckgegeben wurde/);
  assert.match(js, /F\\u00fcr diesen Auftrag wurde kein konkreter Grund gespeichert\./);
  assert.match(js, /Fr\\u00fchere Gr\\u00fcnde/);
  assert.match(js, /G\\u00fcltig seit: /);
});

check("58. keine Änderung am Chefmodus (chef-today-ui.js/.test.js werden von V8.7 Stufe B nicht berührt, kein aktiver Feldzugriff)", () => {
  assert.doesNotMatch(js, /chef-today/);
  const chefJs = readFile("chef-today-ui.js");
  assert.doesNotMatch(chefJs, /pilot-decision-reason/);
  // Der bestehende, unveränderte Kopfkommentar aus V8.7 Stufe A ERWÄHNT die
  // beiden Feldnamen bewusst (siehe dort: "liest diese Felder... bewusst
  // noch NICHT") – das ist unverändert korrekt und keine Berührung durch
  // Stufe B. Geprüft wird deshalb ausschließlich, dass kein tatsächlicher
  // Feldzugriff (".currentDecisionReason"/".decisionReasonHistory") und
  // keine neue Rückgabe-/Blockier-Schaltfläche hinzugekommen ist.
  assert.doesNotMatch(chefJs, /\.currentDecisionReason/);
  assert.doesNotMatch(chefJs, /\.decisionReasonHistory/);
});

console.log(`pilot-work-order-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
