"use strict";

// V8.0 – Pilotauftrag aus einem Satz vorausfüllen.
//
// Prüft ausschließlich pilot-work-order-draft-profiles.js: deterministisch,
// browserlokal, kein Netzwerk, keine Speicherung, keine eigene
// Geschäftsvalidierung. Jedes erzeugte Feldset muss durch die bestehende,
// unveränderte Funktion pilot-work-order-service.js#validatePilotOrderInput()
// akzeptiert werden (echte Wiederverwendung, keine Nachbildung).

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const draftProfiles = require("./pilot-work-order-draft-profiles");
const pilotWorkOrderService = require("./pilot-work-order-service");
const pilotAgentExecutionService = require("./pilot-agent-execution-service");
const agentRegistry = require("./agent-registry");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const CHAIN_SELECTABLE_FILES = pilotAgentExecutionService.CHAIN_SELECTABLE_FILES;
const CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES = pilotAgentExecutionService.CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES;
const PILOT_TEAM = pilotWorkOrderService.PILOT_TEAM;

function baseContext(overrides = {}) {
  return Object.assign(
    {
      chainSelectableFiles: CHAIN_SELECTABLE_FILES.slice(),
      chainRecommendedFiles: CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.slice(),
      involvedAgents: PILOT_TEAM,
    },
    overrides,
  );
}

const USER_PERSPECTIVE_SENTENCE = "Prüfe bitte, wie wir die Unternehmenszentrale für den täglichen Gebrauch einfacher machen.";
const UNSUPPORTED_MARKETING_SENTENCE = "Bereite bitte einen ProWin-Vertriebstermin für Canva- und HeyGen-Marketingassets vor.";

// ---------------------------------------------------------------------------
// 1. Determinismus.
// ---------------------------------------------------------------------------

check("1. identische Eingabe ergibt bei 100 Wiederholungen deepStrictEqual dieselbe Ausgabe", () => {
  const input = { sentence: USER_PERSPECTIVE_SENTENCE, context: baseContext() };
  const first = draftProfiles.buildPilotWorkOrderDraft(input);
  for (let i = 0; i < 100; i += 1) {
    const repeated = draftProfiles.buildPilotWorkOrderDraft({ sentence: USER_PERSPECTIVE_SENTENCE, context: baseContext() });
    assert.deepStrictEqual(repeated, first);
  }
});

// ---------------------------------------------------------------------------
// 2./3./4./5. Eindeutiger Nutzerperspektive-Satz ergibt einen gültigen DRAFT.
// ---------------------------------------------------------------------------

const draft = draftProfiles.buildPilotWorkOrderDraft({ sentence: USER_PERSPECTIVE_SENTENCE, context: baseContext() });

check("2. ein eindeutiger Nutzerperspektive-Satz ergibt DRAFT mit Profil USER_PERSPECTIVE", () => {
  assert.strictEqual(draft.outcome, "DRAFT");
  assert.strictEqual(draft.profileId, "USER_PERSPECTIVE");
  assert.strictEqual(draft.unsupportedReason, null);
});

check("3. DRAFT enthält exakt die acht von validatePilotOrderInput verlangten Felder", () => {
  const expectedKeys = [
    "title",
    "desiredOutcome",
    "requestedBy",
    "qualityCriteria",
    "allowedTools",
    "forbiddenActions",
    "requiredApprovals",
    "timeframe",
  ];
  assert.deepStrictEqual(Object.keys(draft.fields).sort(), expectedKeys.slice().sort());
});

check("4. validatePilotOrderInput(draft.fields) akzeptiert den Entwurf (echte, unveränderte Funktion)", () => {
  assert.doesNotThrow(() => pilotWorkOrderService.validatePilotOrderInput(draft.fields));
});

check("5. alle vier Array-Felder sind nicht leer", () => {
  ["qualityCriteria", "allowedTools", "forbiddenActions", "requiredApprovals"].forEach((field) => {
    assert.ok(Array.isArray(draft.fields[field]) && draft.fields[field].length > 0, `${field} darf nicht leer sein`);
  });
});

// ---------------------------------------------------------------------------
// 6./7. Dateiempfehlung.
// ---------------------------------------------------------------------------

check("6. jeder empfohlene Pfad liegt in CHAIN_SELECTABLE_FILES", () => {
  draft.recommendedFiles.forEach((relativePath) => {
    assert.ok(CHAIN_SELECTABLE_FILES.includes(relativePath), `${relativePath} muss in CHAIN_SELECTABLE_FILES enthalten sein`);
  });
});

check("7. recommendedFiles entspricht bei USER_PERSPECTIVE unverändert context.chainRecommendedFiles", () => {
  assert.deepStrictEqual(draft.recommendedFiles, CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.slice());
});

// ---------------------------------------------------------------------------
// 8./9. Team/Rollen.
// ---------------------------------------------------------------------------

check("8. jede dargestellte Agenten-ID/Rollenreferenz ist im kanonischen Agentenregister auflösbar", () => {
  assert.ok(draft.team.length > 0, "das Team darf nicht leer sein");
  draft.team.forEach((member) => {
    assert.ok(agentRegistry.hasAgentId(member.agentKey), `unbekannte Agenten-ID ${member.agentKey}`);
  });
});

check("9. Rollenabweichungen werden nicht entfernt", () => {
  const mismatches = draft.team.filter((member) => member.isExactRoleMatch === false);
  assert.ok(mismatches.length > 0, "die Testfixtur muss mindestens eine Rollenabweichung enthalten");
  mismatches.forEach((member) => {
    assert.ok(typeof member.mappingNote === "string" && member.mappingNote.length > 0, "mappingNote muss erhalten bleiben");
  });
  const uncertaintyText = draft.uncertainties.join(" | ");
  mismatches.forEach((member) => {
    assert.ok(uncertaintyText.includes(member.mappingNote), "die Rollenabweichung muss in den Unsicherheiten sichtbar sein");
  });
});

// ---------------------------------------------------------------------------
// 10./11./12./13. UNSUPPORTED-Fälle.
// ---------------------------------------------------------------------------

check("10. leerer Satz ergibt UNSUPPORTED", () => {
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence: "", context: baseContext() });
  assert.strictEqual(result.outcome, "UNSUPPORTED");
});

check("11. Satz nur aus Leerzeichen ergibt UNSUPPORTED", () => {
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence: "     ", context: baseContext() });
  assert.strictEqual(result.outcome, "UNSUPPORTED");
});

check("12. nicht unterstützter Marketing-/ProWin-/Canva-/HeyGen-Satz ergibt UNSUPPORTED", () => {
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence: UNSUPPORTED_MARKETING_SENTENCE, context: baseContext() });
  assert.strictEqual(result.outcome, "UNSUPPORTED");
});

check("13. UNSUPPORTED enthält fields === null und löst nichts aus (keine Datei-/Teamempfehlung)", () => {
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence: UNSUPPORTED_MARKETING_SENTENCE, context: baseContext() });
  assert.strictEqual(result.fields, null);
  assert.strictEqual(result.profileId, null);
  assert.deepStrictEqual(result.recommendedFiles, []);
  assert.deepStrictEqual(result.team, []);
  assert.ok(typeof result.unsupportedReason === "string" && result.unsupportedReason.length > 0);
});

// ---------------------------------------------------------------------------
// 14./15. Robustheit bei Feldgrenzen und Sonderzeichen.
// ---------------------------------------------------------------------------

check("14. ein sehr langer Satz hält alle Feldgrenzen ein", () => {
  const longSentence = "täglich einfacher bedienen: " + "x".repeat(5000);
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence: longSentence, context: baseContext() });
  assert.strictEqual(result.outcome, "DRAFT");
  assert.ok(result.fields.title.length <= 200);
  assert.ok(result.fields.desiredOutcome.length <= 2000);
  assert.ok(result.fields.requestedBy.length <= 200);
  assert.ok(result.fields.timeframe.length <= 500);
  assert.doesNotThrow(() => pilotWorkOrderService.validatePilotOrderInput(result.fields));
  // keine stille Kürzung mitten im Satz: der Satz erscheint entweder
  // vollständig oder gar nicht (kein abgeschnittenes Fragment).
  const containsPartialFragment = result.fields.desiredOutcome.includes("x".repeat(50)) && !result.fields.desiredOutcome.includes(longSentence);
  assert.strictEqual(containsPartialFragment, false, "der lange Satz darf nicht mitten im Satz abgeschnitten erscheinen");
});

check("15. Sonderzeichen und Umlaute bleiben korrekt erhalten", () => {
  const sentence = "Mach die Bedienung übersichtlicher – Umlaute: äöüÄÖÜß, Sonderzeichen: „“–%&/()?!.";
  const result = draftProfiles.buildPilotWorkOrderDraft({ sentence, context: baseContext() });
  assert.strictEqual(result.outcome, "DRAFT");
  assert.ok(result.fields.desiredOutcome.includes(sentence), "der Originalsatz muss unverändert als Ausgangsfrage erscheinen");
});

// ---------------------------------------------------------------------------
// 16. keine verbotenen Aufrufe/Abhängigkeiten im Modul.
// ---------------------------------------------------------------------------

check("16. kein Math.random, Date, fetch, auth-db, business-use-policy oder LLM-/Codex-Aufruf im Modul", () => {
  const source = fs.readFileSync(path.join(__dirname, "pilot-work-order-draft-profiles.js"), "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /new\s+Date\s*\(/);
  assert.doesNotMatch(source, /\bDate\.now\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /require\(\s*["']\.\/auth-db["']\s*\)/);
  assert.doesNotMatch(source, /require\(\s*["']\.\/business-use-policy["']\s*\)/);
  // "Codex"/"LLM" dürfen in Kopfkommentaren erklären, dass genau das NICHT
  // passiert (siehe Modulkopf) – geprüft wird ausschließlich die Abwesenheit
  // eines tatsächlichen Aufrufs/Imports/einer Ausführung.
  assert.doesNotMatch(source, /require\([^)]*codex[^)]*\)/i);
  assert.doesNotMatch(source, /codex(Runner|Adapter|Approval)/i);
  assert.doesNotMatch(source, /\bLLM\s*\(/i);
});

// ---------------------------------------------------------------------------
// 17. keine unbekannten Eingabefelder gelangen in die Ausgabe.
// ---------------------------------------------------------------------------

check("17. keine unbekannten Eingabefelder gelangen in die Ausgabe", () => {
  const result = draftProfiles.buildPilotWorkOrderDraft({
    sentence: USER_PERSPECTIVE_SENTENCE,
    context: baseContext(),
    unexpectedTopLevelField: "sollte ignoriert werden",
    extraContext: { anything: true },
  });
  const expectedKeys = ["outcome", "profileId", "fields", "rationale", "recommendedFiles", "team", "uncertainties", "unsupportedReason"];
  assert.deepStrictEqual(Object.keys(result).sort(), expectedKeys.slice().sort());
});

// ---------------------------------------------------------------------------
// 18. kein nutzerinhaltsabhängiger Throw-Pfad.
// ---------------------------------------------------------------------------

check("18. das Modul besitzt keinen nutzerinhaltsabhängigen Throw-Pfad", () => {
  const trickyInputs = [
    undefined,
    null,
    {},
    { sentence: undefined },
    { sentence: null },
    { sentence: 12345 },
    { sentence: {} },
    { sentence: [] },
    { sentence: "irgendein Satz", context: null },
    { sentence: "irgendein Satz", context: "kein-objekt" },
    { sentence: "irgendein Satz", context: { chainSelectableFiles: null, chainRecommendedFiles: null, involvedAgents: null } },
    { sentence: "einfacher bedienen", context: { chainSelectableFiles: "kein-array", chainRecommendedFiles: 5, involvedAgents: "kein-array" } },
    { sentence: "a".repeat(100000) },
  ];
  trickyInputs.forEach((input) => {
    assert.doesNotThrow(() => draftProfiles.buildPilotWorkOrderDraft(input), `darf nicht werfen bei ${JSON.stringify(input)}`);
  });
});

// ---------------------------------------------------------------------------
// 19. exakte Feldgrenzen.
// ---------------------------------------------------------------------------

check("19. title <= 200, desiredOutcome <= 2000, requestedBy <= 200, timeframe <= 500", () => {
  assert.ok(draft.fields.title.length <= 200);
  assert.ok(draft.fields.desiredOutcome.length <= 2000);
  assert.ok(draft.fields.requestedBy.length <= 200);
  assert.ok(draft.fields.timeframe.length <= 500);
});

// ---------------------------------------------------------------------------
// 20. keine Policy-Entscheidung im Ergebnis.
// ---------------------------------------------------------------------------

check("20. Ergebnis enthält weder BLOCK noch ESCALATE noch ALLOW als Policy-Entscheidung", () => {
  [draft, draftProfiles.buildPilotWorkOrderDraft({ sentence: UNSUPPORTED_MARKETING_SENTENCE, context: baseContext() })].forEach((result) => {
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /"BLOCK"/);
    assert.doesNotMatch(serialized, /"ESCALATE"/);
    assert.doesNotMatch(serialized, /"ALLOW"/);
  });
});

console.log(`pilot-work-order-draft-profiles.test.js: ${passed} Prüfpunkte erfolgreich`);
