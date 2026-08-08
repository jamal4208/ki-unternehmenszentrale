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

check("58. keine Änderung an dieser Detailansicht durch den Chefmodus (pilot-work-order-ui.js bleibt von chef-today-ui.js unberührt)", () => {
  // Diese Datei (pilot-work-order-ui.js) selbst darf durch den Chefmodus
  // nie berührt werden – das gilt unverändert seit V8.7 Stufe B und bleibt
  // die einzige hier tatsächlich geprüfte Richtung.
  assert.doesNotMatch(js, /chef-today/);
  const chefJs = readFile("chef-today-ui.js");
  assert.doesNotMatch(chefJs, /pilot-decision-reason/);
  // Mechanisch erzwungene Folgeanpassung durch V8.7 Stufe C ("aktuellen
  // Entscheidungsgrund im Chefmodus 'Heute wichtig' sichtbar machen",
  // analog zur bereits in V8.7 Stufe A dokumentierten Anpassung der
  // Migrationsliste): bis einschließlich Stufe B war ein Feldzugriff auf
  // `currentDecisionReason` in chef-today-ui.js noch nicht vorgesehen –
  // genau das ist inzwischen der gesamte, explizit beauftragte Zweck von
  // Stufe C. Die Prüfung bleibt für `decisionReasonHistory` unverändert
  // scharf (Chefmodus liest ausschließlich das aktuelle Feld, niemals die
  // Historie) und für eine neue Rückgabe-/Blockier-Schaltfläche
  // unverändert scharf (`.decisionReasonHistory` bzw. eine CSS-Berührung
  // des Klassenraums `pilot-decision-reason` wären weiterhin ein Befund).
  assert.doesNotMatch(chefJs, /\.decisionReasonHistory/);
});

// ---------------------------------------------------------------------------
// Arbeitspaket Rückgabe Pilotauftrag ("Rückgabe im Pilotauftrag über die
// Oberfläche bedienbar machen"): rein additive Quelltextprüfungen. Das
// tatsächliche Verhalten (kein Request beim Öffnen, genau ein POST beim
// Absenden, Konflikt-/Fehlerverhalten, Bestandsschutz der positiven
// Hauptaktionen) wird in pilot-work-order-command-center-ui.test.js
// ausgeführt geprüft.
// ---------------------------------------------------------------------------

const RETURN_LABEL_SOURCE = "Zur \\u00dcberarbeitung zur\\u00fcckgeben";

function returnDraftSubmitSource() {
  const match = js.match(/function submitReturnDraft\(\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(match, "submitReturnDraft muss auffindbar sein");
  return match[0];
}

function returnDraftPanelSource() {
  const match = js.match(/function renderReturnDraftPanel\(draft\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(match, "renderReturnDraftPanel muss auffindbar sein");
  return match[0];
}

check("RÜCK-Q1. der Rückgabe-Wortlaut ist genau einmal definiert und gilt dadurch identisch in beiden Entscheidungsstatus", () => {
  const buttonFnMatch = js.match(/function renderReturnActionButton\(disabledAttr\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(buttonFnMatch, "renderReturnActionButton muss auffindbar sein");
  assert.ok(buttonFnMatch[0].includes(RETURN_LABEL_SOURCE), "der verbindliche Wortlaut muss unverändert im Quelltext stehen");
  // Beide Entscheidungsstatus verwenden denselben Aufruf – ein abweichender
  // Wortlaut je Status ist dadurch strukturell ausgeschlossen.
  // genau eine Definition und genau zwei Aufrufstellen (die beiden
  // Entscheidungsstatus) – nirgends sonst.
  const occurrences = js.match(/renderReturnActionButton\(disabledAttr\)/g) || [];
  assert.strictEqual(occurrences.length, 3, "die Rückgabeaktion darf ausschließlich in den beiden Entscheidungsstatus stehen");
});

check("RÜCK-Q2. visuelle Hierarchie: positive Hauptaktion primary-button, Rückgabe secondary-button, kein Rot, keine Danger-Klasse", () => {
  assert.match(js, /<button type="button" class="primary-button" data-action="approve-for-execution"/);
  assert.match(js, /<button type="button" class="primary-button" data-action="approve-completion"/);
  assert.match(js, /<button type="button" class="secondary-button" data-action="open-return-draft"/);
  const classAttributes = (js.match(/class="[^"]*"/g) || []).join(" ");
  assert.doesNotMatch(classAttributes, /danger|warn|error-button|destructive/i, "keine destruktive/rote Semantik");
  assert.doesNotMatch(classAttributes, /pilot-return/, "die Rückgabe darf keine eigene CSS-Klasse einführen");
});

check("RÜCK-Q3. keine neue CSS-Klasse und keine Änderung an styles.css/index.html für die Rückgabe", () => {
  assert.doesNotMatch(css, /pilot-return/, "styles.css darf keine Regel für die Rückgabefläche enthalten");
  assert.doesNotMatch(html, /pilot-return/, "index.html darf kein statisches Rückgabe-Markup enthalten");
  // Die verwendeten Klassen existieren bereits.
  assert.match(css, /\.primary-button/);
  assert.match(css, /\.secondary-button/);
  assert.match(css, /\.button-row \{/);
  assert.match(css, /\.pilot-work-order-action-error/);
});

check("RÜCK-Q4. kein neuer Endpunkt: die Rückgabe nutzt ausschließlich die bestehende return-order-Route über das bestehende postAction-Muster", () => {
  const submitSource = returnDraftSubmitSource();
  assert.match(submitSource, /postAction\(pilotOrderId, "return-order", \{ note: note, expectedRevision: expectedRevision \}\)/);
  assert.doesNotMatch(submitSource, /fetch\(/, "kein eigener fetch außerhalb des bestehenden postAction-Musters");
  assert.doesNotMatch(submitSource, /fetchJson\(/);
  // Die einzige Stelle, die die Route überhaupt nennt.
  const returnOrderCalls = js.match(/postAction\([^,]+, "return-order"/g) || [];
  assert.strictEqual(returnOrderCalls.length, 1, "die return-order-Aktion darf im Quelltext genau einmal aufgerufen werden");
  const apiCalls = js.match(/\/api\/[a-z0-9\-/]+/gi) || [];
  apiCalls.forEach((call) => assert.match(call, /^\/api\/pilot-work-order\//));
});

check("RÜCK-Q5. der Rückgabe-Body enthält ausschließlich note und expectedRevision – insbesondere niemals confirmed", () => {
  const submitSource = returnDraftSubmitSource();
  assert.doesNotMatch(submitSource, /confirmed/, "die Rückgabe verlangt serverseitig kein confirmed und darf es niemals senden");
  // Die einzige Validierung im Frontend ist die leere Eingabe.
  assert.match(submitSource, /isNonEmptyString\(note\)/);
  assert.match(submitSource, /Bitte einen Grund angeben\./);
  assert.doesNotMatch(submitSource, /length < 5|length > 500|\.slice\(|substring\(/, "keine zweite Validierungslogik und keine stille Kürzung im Frontend");
});

check("RÜCK-Q6. kein neuer Status und keine neue Bedienhandlung: IN_EXECUTION und block-order bleiben ausgeschlossen", () => {
  assert.match(js, /var RETURN_DRAFT_STATUSES = \["READY_FOR_JAMAL_APPROVAL", "READY_FOR_REVIEW"\];/);
  assert.doesNotMatch(js, /data-action="block-order"/);
  assert.doesNotMatch(js, /"block-order"/);
});

check("RÜCK-Q7. Accessibility: echte Buttons, echtes Textfeld, echtes Label, sichtbares Abbrechen – kein Modal, kein alertdialog, kein aria-modal", () => {
  const panelSource = returnDraftPanelSource();
  assert.match(panelSource, /<label>Grund der R\\u00fcckgabe<textarea id=\\"/, "echtes Label mit echtem textarea");
  assert.match(panelSource, /RETURN_DRAFT_NOTE_FIELD_ID/);
  assert.match(panelSource, /<\/textarea><\/label>/);
  assert.match(panelSource, /data-action="cancel-return-draft"[^]*?Abbrechen/);
  assert.match(panelSource, /role="group" aria-label="/);
  assert.doesNotMatch(panelSource, /alertdialog/);
  assert.doesNotMatch(panelSource, /aria-modal/);
  assert.doesNotMatch(panelSource, /type="checkbox"/, "keine zweite Bestätigungsstufe");
  const buttonTags = panelSource.match(/<button[^>]*/g) || [];
  assert.strictEqual(buttonTags.length, 2, "die Rückgabefläche hat genau zwei Knöpfe (Abbrechen und Absenden)");
  buttonTags.forEach((tag) => assert.match(tag, /type="button"/));
});

check("RÜCK-Q8. die Rückgabefläche lebt innerhalb der bestehenden renderPrimaryAction()-Struktur (keine zweite Renderkette)", () => {
  const primaryFnMatch = js.match(/function renderPrimaryAction\(overview\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(primaryFnMatch, "renderPrimaryAction muss auffindbar sein");
  assert.match(primaryFnMatch[0], /renderReturnDraftPanel\(state\.returnDraft\)/);
  assert.match(primaryFnMatch[0], /isReturnDraftStatus\(status\) && isReturnDraftOpenForOrder\(overview\.order\.id\)/);
  // genau eine Definition und genau eine Aufrufstelle (in renderPrimaryAction).
  const panelOccurrences = js.match(/renderReturnDraftPanel\(/g) || [];
  assert.strictEqual(panelOccurrences.length, 2, "die Rückgabefläche darf ausschließlich aus renderPrimaryAction heraus gerendert werden");
});

check("RÜCK-Q9. der lokale Rückgabezustand ist an den Auftrag gebunden und wird beim Auftragswechsel verworfen", () => {
  assert.match(js, /returnDraft: null,/);
  assert.match(js, /state\.returnDraft\.pilotOrderId === orderId/);
  const selectFnMatch = js.match(/function selectOrder\(orderId\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(selectFnMatch, "selectOrder muss auffindbar sein");
  assert.match(selectFnMatch[0], /state\.returnDraft = null;/);
  const openFnMatch = js.match(/function openReturnDraft\(\)\s*\{[\s\S]*?\n {2}\}/);
  const cancelFnMatch = js.match(/function cancelReturnDraft\(\)\s*\{[\s\S]*?\n {2}\}/);
  [openFnMatch[0], cancelFnMatch[0]].forEach((source) => {
    assert.doesNotMatch(source, /postAction\(|fetch\(|fetchJson\(/, "Öffnen und Abbrechen dürfen niemals einen Request auslösen");
  });
});

check("RÜCK-Q10. der Chefmodus bleibt vollständig unberührt und read-only", () => {
  const chefJs = readFile("chef-today-ui.js");
  assert.doesNotMatch(chefJs, /return-order/);
  assert.doesNotMatch(chefJs, /open-return-draft/);
  assert.doesNotMatch(chefJs, /"POST"|'POST'/);
});

check("RÜCK-Q11. die neuen deutschen Literale folgen der bestehenden \\uXXXX-Konvention", () => {
  assert.ok(js.includes(RETURN_LABEL_SOURCE));
  assert.match(js, /Grund der R\\u00fcckgabe/);
  assert.match(js, /Der Auftrag wird erst mit deinem Klick zur\\u00fcckgegeben\./);
  assert.match(js, /Wird zur\\u00fcckgegeben\\u2026/);
});

// ---------------------------------------------------------------------------
// Arbeitspaket "Rein darstellende Fehler in der Pilotauftragskarte bereinigen":
// die sichtbare Überschrift der Schritt-Empfehlung in der Kettenstatuskarte
// wird ausschließlich beim Zusammenbau von .pilot-chain-status-card__next
// gesetzt. Vorher setzten zusätzlich sieben Textzweige und nextChainStepHint()
// dieselbe Überschrift in ihren eigenen Text, wodurch sichtbar
// "Nächster sicherer Schritt: Nächster sicherer Schritt: …" bzw.
// "Nächster sicherer Schritt: Nächster erlaubter Schritt: …" entstand.
// ---------------------------------------------------------------------------

// V8.10.2: die beiden Überschriften benennen jetzt ausdrücklich die Ebene
// (Agentenkette statt Auftrag). Die Struktur – genau eine Konstante je
// Überschrift, Label und Text strikt getrennt – ist unverändert und wird von
// DARST-Q1 bis DARST-Q5 weiterhin unverändert scharf geprüft.
const NEXT_STEP_LABEL_SAFE_SOURCE = 'var NEXT_STEP_LABEL_SAFE = "N\\u00e4chster Schritt in der Agentenkette";';
const NEXT_STEP_LABEL_ALLOWED_SOURCE =
  'var NEXT_STEP_LABEL_ALLOWED = "M\\u00f6glicher n\\u00e4chster Schritt in der Agentenkette";';

function chainStatusCardSource() {
  const match = js.match(/function renderChainStatusCard\(overview\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(match, "renderChainStatusCard muss auffindbar sein");
  return match[0];
}

function nextChainStepHintSource() {
  const match = js.match(/function nextChainStepHint\(chain\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(match, "nextChainStepHint muss auffindbar sein");
  return match[0];
}

check("DARST-Q1. beide sichtbaren Überschriften existieren genau einmal als Konstante (eine einzige Quelle, \\uXXXX-Konvention)", () => {
  assert.ok(js.includes(NEXT_STEP_LABEL_SAFE_SOURCE), "NEXT_STEP_LABEL_SAFE muss als Konstante existieren");
  assert.ok(js.includes(NEXT_STEP_LABEL_ALLOWED_SOURCE), "NEXT_STEP_LABEL_ALLOWED muss als Konstante existieren");
  // Die Überschrift darf nirgends sonst als Literal auftauchen – weder als
  // Klartext noch in \uXXXX-Schreibweise. Genau diese Doppelung war der Fehler.
  const safeLiterals = js.match(/N(?:ä|\\u00e4)chster Schritt in der Agentenkette/g) || [];
  const allowedLiterals = js.match(/M(?:ö|\\u00f6)glicher n(?:ä|\\u00e4)chster Schritt in der Agentenkette/g) || [];
  assert.strictEqual(safeLiterals.length, 1, "„Nächster Schritt in der Agentenkette“ darf ausschließlich in NEXT_STEP_LABEL_SAFE stehen");
  assert.strictEqual(
    allowedLiterals.length,
    1,
    "„Möglicher nächster Schritt in der Agentenkette“ darf ausschließlich in NEXT_STEP_LABEL_ALLOWED stehen",
  );
  // V8.10.2: die beiden alten Überschriften sind vollständig verschwunden –
  // auch aus Kommentaren, damit kein späterer Zweig sie versehentlich
  // wiederbelebt.
  assert.strictEqual((js.match(/N(?:ä|\\u00e4)chster sicherer Schritt/g) || []).length, 0, "die alte Überschrift „sicher“ ist entfernt");
  assert.strictEqual((js.match(/N(?:ä|\\u00e4)chster erlaubter Schritt/g) || []).length, 0, "die alte Überschrift „erlaubt“ ist entfernt");
});

check("DARST-Q2. genau eine Stelle setzt die sichtbare Überschrift: die Renderzeile der Kettenstatuskarte", () => {
  assert.match(
    js,
    /html \+= '<p class="pilot-chain-status-card__next"><strong>' \+ escapeHtml\(nextStepLabel\) \+ ':<\/strong> ' \+ escapeHtml\(nextStepText\) \+ "<\/p>";/,
    "die Überschrift muss aus nextStepLabel kommen, nicht aus einem festen Literal",
  );
  const cardSource = chainStatusCardSource();
  assert.match(cardSource, /var nextStepLabel = NEXT_STEP_LABEL_SAFE;/, "Standardüberschrift ist „sicher“");
  // Kein Textzweig darf die Überschrift in nextStepText schreiben.
  const textAssignments = cardSource.match(/nextStepText = [^\n]*/g) || [];
  assert.ok(textAssignments.length >= 8, "die bekannten Textzweige müssen erhalten bleiben");
  textAssignments.forEach((assignment) => {
    assert.doesNotMatch(assignment, /NEXT_STEP_LABEL_(SAFE|ALLOWED)/, `kein Textzweig darf die Überschrift in den Text schreiben: ${assignment}`);
    assert.doesNotMatch(assignment, /Schritt: /, `kein Textzweig darf eine Überschrift mit Doppelpunkt voranstellen: ${assignment}`);
  });
});

check("DARST-Q3. die fachliche Abschwächung „erlaubt“ bleibt erhalten und wird ausschließlich über die Überschrift getragen", () => {
  const cardSource = chainStatusCardSource();
  const hintSource = nextChainStepHintSource();
  // Der Zweig der vollständig durchgelaufenen Kette schwächt bewusst ab.
  assert.match(
    cardSource,
    /nextStepLabel = NEXT_STEP_LABEL_ALLOWED;\s*\n\s*nextStepText = "bei Bedarf oben manuell zur Abschlussprüfung vorlegen\.";/,
    "der COMPLETED-Kettenzweig muss weiterhin „erlaubt“ statt „sicher“ sagen",
  );
  assert.match(
    hintSource,
    /chain\.chainStatus === "COMPLETED"[\s\S]*?label: NEXT_STEP_LABEL_ALLOWED/,
    "nextChainStepHint muss die Abschwächung für die abgeschlossene Kette beibehalten",
  );
  const allowedUses = (cardSource + hintSource).match(/NEXT_STEP_LABEL_ALLOWED/g) || [];
  assert.strictEqual(allowedUses.length, 2, "genau zwei fachlich begründete Abschwächungsstellen");
});

check("DARST-Q4. nextChainStepHint liefert Überschrift und Text getrennt und erzeugt damit kein Doppelpräfix", () => {
  const hintSource = nextChainStepHintSource();
  const returns = hintSource.match(/return [^\n]*/g) || [];
  assert.strictEqual(returns.length, 4, "alle vier bisherigen Rückgabewege bleiben erhalten");
  returns.forEach((entry) => {
    assert.match(entry, /\{ label: NEXT_STEP_LABEL_(SAFE|ALLOWED), text: /, `jeder Rückgabeweg muss label und text trennen: ${entry}`);
    assert.doesNotMatch(entry, /Schritt: /, `kein Rückgabetext darf eine Überschrift voranstellen: ${entry}`);
  });
  assert.match(js, /var chainStepHint = nextChainStepHint\(activeChain\);\s*\n\s*nextStepLabel = chainStepHint\.label;\s*\n\s*nextStepText = chainStepHint\.text;/);
});

check("DARST-Q5. keine fragile String-Reparatur: das Doppelpräfix wird strukturell vermieden, nicht nachträglich weggeschnitten", () => {
  const cardSource = chainStatusCardSource();
  const hintSource = nextChainStepHintSource();
  [cardSource, hintSource].forEach((source) => {
    assert.doesNotMatch(source, /\.replace\(/, "keine nachträgliche String-Reparatur an der Schritt-Empfehlung");
    assert.doesNotMatch(source, /indexOf\("N/, "kein Suchen-und-Abschneiden der Überschrift");
    assert.doesNotMatch(source, /startsWith\(/, "kein Präfix-Abgleich zur Laufzeit");
  });
});

check("DARST-Q6. reine Darstellungsänderung: keine neue Route, kein neuer Fetch, kein neuer Zustand, kein neuer Eventlistener", () => {
  const cardSource = chainStatusCardSource();
  const hintSource = nextChainStepHintSource();
  [cardSource, hintSource].forEach((source) => {
    assert.doesNotMatch(source, /fetch\(|fetchJson\(|postAction\(/, "die Kettenstatuskarte bleibt rein darstellend");
    assert.doesNotMatch(source, /addEventListener/, "kein neuer Eventlistener");
    assert.doesNotMatch(source, /state\.[a-zA-Z]+ = /, "kein neuer oder veränderter Bedienzustand beim Rendern");
  });
  // Der lokale Zustand der Karte bleibt exakt derselbe wie zuvor.
  assert.doesNotMatch(js, /nextStepLabel:/, "nextStepLabel ist eine lokale Rendervariable, kein neues State-Feld");
});

check("DARST-Q7. alle bisherigen Kettenzustände und ihre Hinweise bleiben im Quelltext vollständig erhalten", () => {
  const cardSource = chainStatusCardSource();
  [
    // Teilpaket 2: der frühere Pauschaltext „Drei-Agenten-Kette ist noch nicht
    // aktiv.“ stand hier bewusst NICHT mehr. Er war nachweislich falsch, sobald
    // ein Auftrag außerhalb von „In Ausführung“ eine real vorhandene Kette
    // besaß. An seine Stelle treten die kettenbezogenen Vergangenheitsaussagen
    // (TP2-UI-1 unten). Alle übrigen Zustände bleiben unverändert erhalten.
    /title = "Noch keine Drei-Agenten-Kette vorbereitet\.";/,
    /title = "Start wurde angenommen\. Der Agent wird gestartet\.";/,
    /title = "Verbindung unterbrochen – Statusprüfung läuft weiter\.";/,
    /title = "Alle drei Schritte abgeschlossen\.";/,
    /lines\.push\("Codex arbeitet ausschließlich lesend\."\);/,
    /lines\.push\("Typische Dauer: 1-3 Minuten\."\);/,
    /lines\.push\("Bitte nicht erneut klicken\."\);/,
    /lines\.push\("Gestartet um " \+ startedAtClock \+ " Uhr\."\);/,
    /lines\.push\("Läuft seit " \+ elapsedText \+ "\."\);/,
    /lines\.push\("Es wurde nichts automatisch weitergestartet\."\);/,
    /lines\.push\("Der 15-Minuten-Sicherheitsdeckel wurde erreicht\."\);/,
    /technicalDetailsHtml = buildChainFailureTechnicalDetailsHtml\(context, failurePresentation\);/,
    /nextStepText = failurePresentation\.action;/,
    /data-action="reload-chain-status"/,
  ].forEach((pattern) => assert.match(cardSource, pattern, `erhaltener Kettenzustand/Hinweis fehlt: ${pattern}`));
});

// ---------------------------------------------------------------------------
// Teilpaket 2 – "Kettenstatus nach Ausführung zeitlich und fachlich wahr
// darstellen".
//
// Ursache des Fehlers: renderChainStatusCard() hat als ERSTEN Zweig pauschal
// auf overview.status !== "IN_EXECUTION" geprüft und daraufhin behauptet, die
// Drei-Agenten-Kette sei "noch nicht aktiv" – auch dann, wenn die Kettendaten
// eine vollständig abgeschlossene Kette belegten. Der Auftragsstatus wurde
// damit als Beweis über die Kette missbraucht.
//
// Die Korrektur liegt ausschließlich in der Darstellung: außerhalb des
// laufenden Ausführungsstatus beschreibt die Karte die Kette rückblickend,
// ausschließlich aus den Kettendaten. Hier wird der Quelltext geprüft; das
// tatsächlich gerenderte Ergebnis prüft pilot-agent-execution-chain-ui.test.js.
// ---------------------------------------------------------------------------

check("TP2-UI-1. der pauschale Falschtext existiert nirgends mehr im Quelltext", () => {
  assert.ok(
    !js.includes("Drei-Agenten-Kette ist noch nicht aktiv"),
    "der widerlegte Pauschaltext darf in keiner Form zurückkehren",
  );
  assert.ok(
    !js.includes("Die Kette kann erst im laufenden Ausführungsstatus gestartet werden."),
    "die Begleitzeile des Pauschaltexts darf nicht zurückkehren",
  );
});

check("TP2-UI-2. die Zeitachse ist eine einzige, klar lesbare Entscheidung – der Auftragsstatus überstimmt keine Kettenwahrheit mehr", () => {
  const cardSource = chainStatusCardSource();
  assert.match(
    cardSource,
    /var chainHistoryOnly = overview\.status !== "IN_EXECUTION" && !hasRunning && !bridge;/,
    "die Zeitachse muss genau eine Bedingung sein: nicht in Ausführung, nichts läuft, keine angenommene Startanforderung",
  );
  assert.match(cardSource, /if \(chainHistoryOnly\) \{/, "der Rückblick ist ein eigener, klar benannter Zweig");
  // Die Bedingung darf nicht ersatzlos verschwinden: der Auftragsstatus wird
  // weiterhin gelesen, entscheidet aber nur noch über die Zeitform.
  const statusComparisons = cardSource.match(/overview\.status !== "IN_EXECUTION"/g) || [];
  assert.strictEqual(statusComparisons.length, 1, "der Auftragsstatus wird für die Zeitachse genau einmal gelesen");
});

check("TP2-UI-3. alle sechs verbindlichen Vergangenheitsaussagen stehen genau einmal im Rückblickzweig", () => {
  const cardSource = chainStatusCardSource();
  [
    'title = "Für diesen Auftrag wurde keine Drei-Agenten-Kette verwendet.";',
    'title = "Eine Drei-Agenten-Kette wurde vorbereitet, aber nicht gestartet.";',
    'title = "Die Drei-Agenten-Kette wurde teilweise ausgeführt.";',
    'title = "Die Drei-Agenten-Kette wurde vollständig abgeschlossen.";',
    '"Die Drei-Agenten-Kette wurde während der Ausführung blockiert."',
    '"Die Drei-Agenten-Kette konnte nicht vollständig abgeschlossen werden."',
  ].forEach((literal) => {
    assert.ok(cardSource.includes(literal), `verbindliche Produktformulierung fehlt: ${literal}`);
    const occurrences = js.split(literal).length - 1;
    assert.strictEqual(occurrences, 1, `die Formulierung darf genau einmal existieren: ${literal}`);
  });
});

check("TP2-UI-4. „vollständig abgeschlossen“ wird ausschließlich aus chainStatus === \"COMPLETED\" abgeleitet, niemals aus 3 von 3", () => {
  const cardSource = chainStatusCardSource();
  assert.match(
    cardSource,
    /\} else if \(activeChain\.chainStatus === "COMPLETED"\) \{\s*\n\s*variant = "success";\s*\n\s*title = "Die Drei-Agenten-Kette wurde vollständig abgeschlossen\.";/,
    "die Abschlussaussage hängt unmittelbar an chainStatus === \"COMPLETED\"",
  );
  assert.doesNotMatch(cardSource, /chainRoleProgress/, "die Karte darf die Rollenverbuchung nicht als Abschlussbeweis lesen");
  assert.doesNotMatch(cardSource, /rolesPassed/, "die Karte darf rolesPassed nicht als Abschlussbeweis lesen");
  assert.doesNotMatch(cardSource, /bookedCount/, "die Karte darf bookedCount nicht als Abschlussbeweis lesen");
});

check("TP2-UI-5. im Rückblick erscheint keine Zukunfts-/Handlungsaufforderung und keine Auftragsentscheidung", () => {
  const cardSource = chainStatusCardSource();
  const historyBranch = cardSource.match(/if \(chainHistoryOnly\) \{[\s\S]*?\n {4}\} else if \(!activeChain\) \{/);
  assert.ok(historyBranch, "der Rückblickzweig muss abgrenzbar sein");
  // Geprüft wird ausschließlich der sichtbar wirksame Code, nicht die
  // Begründung in den Kommentaren.
  const branch = historyBranch[0]
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  [/jetzt starten/, /freigeben/, /oben vorlegen/, /bei Bedarf/, /erneut/, /Abschlussprüfung/, /abnehmen/, /zurückgegeben/].forEach((pattern) => {
    assert.doesNotMatch(branch, pattern, `im Rückblick darf keine Handlungs-/Auftragsformulierung stehen: ${pattern}`);
  });
  // Der Handlungssatz der Fehlerdarstellung weist in die Zukunft und bleibt
  // deshalb dem Gegenwartszweig vorbehalten.
  assert.doesNotMatch(branch, /failurePresentation\.action|historicFailure\.action/, "kein Zukunftssatz aus der Fehlerdarstellung im Rückblick");
  // Die Kettenkarte wiederholt die Auftragsentscheidung nicht mehr.
  assert.doesNotMatch(cardSource, /overview\.nextStep/, "der Auftrags-Nächster-Schritt gehört in die Primäraktion, nicht in die Kettenkarte");
  // V8.10.2: die Stelle ist unverändert, nur die Überschrift benennt jetzt die
  // Ebene und kommt aus einer einzigen Konstante statt aus vier Literalen.
  assert.match(
    js,
    /"<p><strong>" \+ escapeHtml\(ORDER_NEXT_STEP_LABEL\) \+ ":<\/strong> " \+ escapeHtml\(overview\.nextStep\) \+ "<\/p>"/,
    "der Auftrags-Nächster-Schritt bleibt an seiner bisherigen Stelle sichtbar",
  );
  assert.match(js, /var ORDER_NEXT_STEP_LABEL = "N\\u00e4chster Schritt im Auftrag";/, "die Auftragsebene hat genau eine Überschriftsquelle");
  assert.doesNotMatch(cardSource, /ORDER_NEXT_STEP_LABEL/, "die Auftragsüberschrift gehört nicht in die Kettenkarte");
});

check("TP2-UI-6. die bestehende Fehlerdarstellung bleibt auch im Rückblick vollständig erreichbar", () => {
  const cardSource = chainStatusCardSource();
  assert.match(
    cardSource,
    /var historicFailure = resolveFailurePresentation\(resolveFailureReasonCodeFromContext\(context\), null\);\s*\n\s*lines\.push\(historicFailure\.cause\);\s*\n\s*technicalDetailsHtml = buildChainFailureTechnicalDetailsHtml\(context, historicFailure\);/,
    "Ursache und technische Details bleiben im Rückblick erhalten",
  );
});

check("TP2-UI-7. die neue Ableitung „vorbereitet, aber nie gestartet“ ist rein und ändert keinen Zustand", () => {
  const match = js.match(/function chainWasNeverStarted\(chain\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(match, "chainWasNeverStarted muss auffindbar sein");
  const source = match[0];
  assert.doesNotMatch(source, /fetch\(|fetchJson\(|postAction\(/, "keine Netzwerkaktion");
  assert.doesNotMatch(source, /addEventListener/, "kein Eventlistener");
  assert.doesNotMatch(source, /state\./, "kein Zugriff auf den Bedienzustand");
  assert.doesNotMatch(source, /(chain|step)\.[a-zA-Z]+ = /, "keine Zuweisung an Kettendaten");
  assert.doesNotMatch(source, /push\(|splice\(|sort\(/, "die übergebenen Kettendaten werden nicht verändert");
  assert.match(source, /step\.startedAt \|\| step\.executionRunId \|\| step\.stepStatus !== "PENDING"/, "jede Spur eines Starts beendet die Aussage");
});

check("TP2-UI-8. die Karteninvariante bleibt: genau zwei Aufrufstellen, keine dritte Karte", () => {
  const calls = js.match(/renderChainStatusCard\(overview\)/g) || [];
  assert.strictEqual(calls.length, 3, "genau eine Definition und genau zwei Aufrufstellen");
  assert.match(js, /html \+= renderChainStatusCard\(overview\);/, "obere Arbeitskarte");
  assert.match(js, /\n\s*renderChainStatusCard\(overview\) \+\n/, "Detailbereich");
});

check("TP2-UI-9. reine Darstellungsänderung: kein neuer Fetch, kein neuer Zustand, kein neuer Eventlistener, keine neue Route", () => {
  const cardSource = chainStatusCardSource();
  assert.doesNotMatch(cardSource, /fetch\(|fetchJson\(|postAction\(/);
  assert.doesNotMatch(cardSource, /addEventListener/);
  assert.doesNotMatch(cardSource, /state\.[a-zA-Z]+ = /);
  assert.doesNotMatch(cardSource, /\/api\//, "die Kettenstatuskarte kennt keine Route");
});

// ---------------------------------------------------------------------------
// Teilpaket 1 – "Historischen decisionNeeded-Text nicht mehr als aktuelle
// Entscheidung anzeigen". Die Korrektur selbst liegt vollständig im Dienst
// (pilot-work-order-service.js#buildOverview, geprüft in
// pilot-work-order.test.js). Hier wird ausschließlich nachgewiesen, dass die
// Darstellung dabei unangetastet bleibt: die Faktenzeile verschwindet nicht,
// und der historische Text bleibt in den Übergabedetails vollständig lesbar.
// ---------------------------------------------------------------------------

check("TP1-UI-1. die Faktenzeile \"Offene Entscheidung\" bleibt erhalten und zeigt ohne aktuelle Entscheidung weiterhin \"Keine\"", () => {
  assert.match(js, /\["Offene Entscheidung", overview\.openDecision \? escapeHtml\(overview\.openDecision\) : "Keine"\]/);
});

check("TP1-UI-2. der historische Übergabetext bleibt in den Übergabedetails vollständig sichtbar", () => {
  assert.match(js, /if \(handoff\.decisionNeeded\) \{/);
  assert.match(js, /rows\.push\("<p>Ben\\u00f6tigte Entscheidung: " \+ escapeHtml\(handoff\.decisionNeeded\) \+ "<\/p>"\);/);
  assert.match(js, /<summary>\\u00dcbergabedetails<\/summary>/);
});

check("TP1-UI-3. die Darstellung leitet die offene Entscheidung weiterhin allein aus dem Server-Overview ab (keine eigene UI-Regel)", () => {
  // Genau zwei Fundstellen für decisionNeeded in der Darstellungsrichtung:
  // die Übergabedetails oben (Anzeige) und ihre Bedingung. Alle weiteren
  // Fundstellen gehören zum Übergabe-Entwurfsformular (Eingaberichtung).
  const factsSection = js.slice(js.indexOf('["Offene Entscheidung"'), js.indexOf('["Offene Entscheidung"') + 400);
  assert.doesNotMatch(factsSection, /decisionNeeded/, "die Faktenzeile darf niemals selbst auf einen Handofftext zurückgreifen");
});

// ---------------------------------------------------------------------------
// V8.10.2 ("Nächster Schritt: Auftrag und Agentenkette klar trennen"):
// Auftragsebene und Kettenebene beantworten zwei verschiedene Fragen. Beide
// Überschriften benennen deshalb jetzt ihre Ebene. Das Paket ist eine reine
// Umbenennung von drei Konstantenwerten – die folgenden Prüfungen halten
// genau das fest.
// ---------------------------------------------------------------------------

check("V8.10.2-10./15./16./17./18. reine Umbenennung: keine neue Kettenlogik, kein neuer Fetch, kein neuer Zustand, kein neuer Listener, keine neue Route", () => {
  // Die drei sichtbaren Überschriften kommen aus genau drei Konstanten.
  assert.match(js, /var ORDER_NEXT_STEP_LABEL = "N\\u00e4chster Schritt im Auftrag";/);
  assert.match(js, /var NEXT_STEP_LABEL_SAFE = "N\\u00e4chster Schritt in der Agentenkette";/);
  assert.match(js, /var NEXT_STEP_LABEL_ALLOWED = "M\\u00f6glicher n\\u00e4chster Schritt in der Agentenkette";/);
  // Die Ableitung der Kettenlage bleibt vollständig unangetastet.
  ["deriveActiveRun", "findLatestChain", "hasServerRunningState", "waitingStepNumberForChain", "nextChainStepHint"].forEach((fn) => {
    assert.ok(js.includes(`function ${fn}(`), `${fn} muss unverändert vorhanden sein`);
  });
  // Karteninvariante, Präfixschutz, Fetch-/Listener-/Zustandsfreiheit prüfen
  // unverändert TP2-UI-8 sowie DARST-Q5/Q6; V8.10.2 fügt dort nichts hinzu und
  // lockert nichts.
});

check("V8.10.2 Ebenentrennung: die Auftragsüberschrift steht ausschließlich in der Primäraktion, die Kettenüberschriften ausschließlich in der Kettenkarte", () => {
  const cardSource = chainStatusCardSource();
  const hintSource = nextChainStepHintSource();
  // Die Auftragsüberschrift darf niemals in die Kettenebene wandern.
  assert.doesNotMatch(cardSource, /ORDER_NEXT_STEP_LABEL/, "die Auftragsüberschrift gehört nicht in die Kettenkarte");
  assert.doesNotMatch(hintSource, /ORDER_NEXT_STEP_LABEL/, "die Auftragsüberschrift gehört nicht in nextChainStepHint");
  // Und umgekehrt: die Kettenüberschriften nicht in die Primäraktion.
  const primarySource = js.match(/function renderPrimaryAction\(overview\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(primarySource, "renderPrimaryAction muss auffindbar sein");
  assert.doesNotMatch(primarySource[0], /NEXT_STEP_LABEL_(SAFE|ALLOWED)/, "die Kettenüberschriften gehören nicht in die Primäraktion");
  assert.strictEqual(
    (primarySource[0].match(/ORDER_NEXT_STEP_LABEL/g) || []).length,
    4,
    "alle vier Ausgabewege der Primäraktion nutzen dieselbe Überschriftsquelle",
  );
});

// ---------------------------------------------------------------------------
// V8.10.3 ("technische Fehlermeldungen und Fehlercodes sicher darstellen"):
// die bereits für Kettenfehler bestehende Regel gilt jetzt auch im
// Direktlauf-/Übergabepfad. Entscheidend ist, dass dabei GENAU EINE
// Sicherheitsregel existiert – die folgenden Prüfungen halten fest, dass
// keine zweite Sanitizing-Funktion und keine zweite Musterliste entstanden ist.
// ---------------------------------------------------------------------------

check("V8.10.3-J: es gibt weiterhin genau eine Sanitizing-Funktion, eine Musterliste, einen Ersatztext und eine Längengrenze", () => {
  assert.strictEqual((js.match(/function sanitizeErrorMessageForDisplay\(/g) || []).length, 1);
  assert.strictEqual((js.match(/var UNSAFE_ERROR_MESSAGE_PATTERNS = /g) || []).length, 1);
  assert.strictEqual((js.match(/var UNSAFE_ERROR_MESSAGE_FALLBACK_TEXT =/g) || []).length, 1);
  assert.strictEqual((js.match(/var MAX_SAFE_ERROR_MESSAGE_CHARS = /g) || []).length, 1);
  assert.strictEqual((js.match(/function normalizeFailureReasonCode\(/g) || []).length, 1);
});

check("V8.10.3-A1/A4: run.errorMessage und run.handoffErrorMessage werden nirgends mehr ungefiltert gerendert", () => {
  assert.doesNotMatch(js, /escapeHtml\(run\.errorMessage\)/, "die Rohmeldung darf nicht direkt escaped ausgegeben werden");
  assert.doesNotMatch(js, /escapeHtml\(run\.handoffErrorMessage/, "die Rohmeldung darf nicht direkt escaped ausgegeben werden");
  assert.match(js, /sanitizeErrorMessageForDisplay\(run\.errorMessage\)/);
  assert.match(js, /sanitizeErrorMessageForDisplay\(run\.handoffErrorMessage\)/);
});

check("V8.10.3-A2/A3: diag.reasonCode und step.failureReasonCode laufen durch die bestehende Failure-Reason-Code-Normalisierung", () => {
  assert.doesNotMatch(js, /escapeHtml\(String\(diag\.reasonCode\)\)/, "ein unbekannter Rohwert darf nicht durchgereicht werden");
  assert.doesNotMatch(js, /escapeHtml\(step\.failureReasonCode\)/, "ein unbekannter Rohwert darf nicht durchgereicht werden");
  assert.match(js, /normalizeFailureReasonCode\(diag\.reasonCode, null\)/);
  assert.match(js, /normalizeFailureReasonCode\(step\.failureReasonCode, null\)/);
});

check("V8.10.3-Bestandsschutz: Exit-Code, Signal, Diagnosehinweis und die bestehenden Runner-/Modellangaben bleiben unverändert im Quelltext", () => {
  assert.match(js, /"Exit-Code: " \+ escapeHtml\(String\(diag\.exitCode\)\)/);
  assert.match(js, /"Signal: " \+ escapeHtml\(String\(diag\.signal\)\)/);
  assert.match(js, /run\.resultSummary\.diagnosticNotice/);
  assert.match(js, /"<br>Runner: " \+ escapeHtml\(run\.runnerLabel \|\| run\.runnerId\)/);
  assert.match(js, /"<br>Modell: " \+ escapeHtml\(run\.modelLabel\)/);
});

console.log(`pilot-work-order-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
