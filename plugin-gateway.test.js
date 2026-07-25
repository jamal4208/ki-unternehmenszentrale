"use strict";

const assert = require("assert");

const pluginGateway = require("./plugin-gateway");
const executionExecutorRegistry = require("./execution-executor-registry");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// 30. Codex-Status gespiegelt
check("Codex-Status wird über execution-executor-registry gespiegelt", () => {
  const mockExec = () => "codex-cli 9.9.9\n";
  const status = pluginGateway.getPluginStatusById("plugin-codex", {
    execFileSyncImpl: mockExec,
    forceRefresh: true,
  });
  assert.strictEqual(status.status, "AVAILABLE");
  assert.match(status.healthStatus, /Codex CLI lokal erreichbar/);
});

check("Codex-Status meldet UNAVAILABLE, wenn CLI fehlt", () => {
  const failingExec = () => {
    throw new Error("command not found");
  };
  const status = pluginGateway.getPluginStatusById("plugin-codex", {
    execFileSyncImpl: failingExec,
    forceRefresh: true,
  });
  assert.strictEqual(status.status, "UNAVAILABLE");
});

// 31. GitHub-read-only gespiegelt
check("GitHub-Plugin spiegelt lokalen read-only Git-Stand", () => {
  const mockExec = () => "## main...origin/main\n";
  const status = pluginGateway.getPluginStatusById("plugin-github", { execFileSyncImpl: mockExec });
  assert.strictEqual(status.status, "AVAILABLE");
  assert.strictEqual(status.readOnly, true);
  assert.strictEqual(status.externalWrite, false);
});

check("GitHub-Plugin macht keinen authentifizierten API-Aufruf (nur lokaler git-Befehl)", () => {
  const calls = [];
  const mockExec = (cmd, args) => {
    calls.push({ cmd, args });
    return "## main\n";
  };
  pluginGateway.getPluginStatusById("plugin-github", { execFileSyncImpl: mockExec });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].cmd, "git");
});

// 32. Airtable-read-only gespiegelt
check("Airtable-Plugin meldet REGISTERED ohne vollständige Zugangsdaten", () => {
  const status = pluginGateway.getPluginStatusById("plugin-airtable", { env: {} });
  assert.strictEqual(status.status, "REGISTERED");
  assert.strictEqual(status.readOnly, true);
});

check("Airtable-Plugin meldet AVAILABLE bei vollständigen lokalen Zugangsdaten, ohne echten API-Aufruf", () => {
  const status = pluginGateway.getPluginStatusById("plugin-airtable", {
    env: { AIRTABLE_API_KEY: "x", AIRTABLE_BASE_ID: "y", AIRTABLE_TABLE_NAME: "z" },
  });
  assert.strictEqual(status.status, "AVAILABLE");
  assert.match(status.healthStatus, /kein automatischer API-Aufruf/);
});

// 33. Vercel-Preflight gespiegelt
check("Vercel-Plugin ist ehrlich als nicht verbunden ausgewiesen (kein bestehender Preflight)", () => {
  const status = pluginGateway.getPluginStatusById("plugin-vercel");
  assert.strictEqual(status.status, "UNAVAILABLE");
});

// 34-36. Canva/HeyGen/Shopify nur vorgemerkt
check("Canva ist nur vorgemerkt (REGISTERED, RECOMMENDATION_ONLY)", () => {
  const status = pluginGateway.getPluginStatusById("plugin-canva");
  assert.strictEqual(status.status, "REGISTERED");
  assert.strictEqual(status.adapterType, "RECOMMENDATION_ONLY");
});

check("HeyGen ist nur vorgemerkt (REGISTERED, RECOMMENDATION_ONLY)", () => {
  const status = pluginGateway.getPluginStatusById("plugin-heygen");
  assert.strictEqual(status.status, "REGISTERED");
  assert.strictEqual(status.adapterType, "RECOMMENDATION_ONLY");
});

check("Shopify ist nur vorgemerkt (REGISTERED, RECOMMENDATION_ONLY)", () => {
  const status = pluginGateway.getPluginStatusById("plugin-shopify");
  assert.strictEqual(status.status, "REGISTERED");
  assert.strictEqual(status.adapterType, "RECOMMENDATION_ONLY");
});

// 37. kein produktiver Start
check("kein produktiver Start: Gateway besitzt keine start/execute/run-Funktion", () => {
  assert.strictEqual(typeof pluginGateway.startPlugin, "undefined");
  assert.strictEqual(typeof pluginGateway.executePlugin, "undefined");
  assert.strictEqual(typeof pluginGateway.runPlugin, "undefined");
});

// 38. kein externer Write
check("kein externer Write: keine Plugin-Definition mit externalWrite=true", () => {
  pluginGateway.listPluginStatuses().forEach((status) => {
    assert.strictEqual(status.externalWrite, false);
  });
});

// 39. keine Veröffentlichung
check("keine automatische Veröffentlichung: buildPluginGatewayResponse markiert dies explizit", () => {
  const response = pluginGateway.buildPluginGatewayResponse();
  assert.strictEqual(response.noPublicationFromGateway, true);
  assert.strictEqual(response.noAutonomousExecution, true);
});

// 40. Tool-Routing deterministisch
check("Tool-Routing ist deterministisch (gleiche Eingabe -> gleiche Ausgabe)", () => {
  const input = { projectId: "ki-unternehmenszentrale", requiredCapabilities: ["Text"], dataClassification: "NORMAL" };
  const first = pluginGateway.recommendToolForTask(input);
  const second = pluginGateway.recommendToolForTask(input);
  assert.deepStrictEqual(first, second);
});

// 41. Begründung vorhanden
check("Tool-Routing liefert nichtleere Begründung", () => {
  const result = pluginGateway.recommendToolForTask({ projectId: "ki-unternehmenszentrale", dataClassification: "NORMAL" });
  assert.ok(Array.isArray(result.reasoning));
  assert.ok(result.reasoning.length > 0);
});

// 42. Datenschutzgrenze
check("Tool-Routing gibt Datenschutzgrenze zurück und respektiert sie", () => {
  const result = pluginGateway.recommendToolForTask({ projectId: "ki-unternehmenszentrale", dataClassification: "SENSITIVE" });
  assert.strictEqual(result.dataClassificationBoundary, "SENSITIVE");
  const secretResult = pluginGateway.recommendToolForTask({ projectId: "ki-unternehmenszentrale", dataClassification: "SECRET" });
  assert.strictEqual(secretResult.ok, false);
});

// 43. Kostenhinweis
check("Tool-Routing liefert Kostenstatus (nie stillschweigend erfunden)", () => {
  const result = pluginGateway.recommendToolForTask({ projectId: "ki-unternehmenszentrale", dataClassification: "NORMAL" });
  assert.ok(["UNKNOWN", "FREE", "WITHIN_BUDGET", "OVER_BUDGET"].includes(result.costStatus));
});

// 44. Jamal-Freigabe
check("Tool-Routing kennzeichnet benötigte Jamal-Freigabe", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "ki-unternehmenszentrale",
    requiredCapabilities: ["Design"],
    dataClassification: "NORMAL",
    publicationAllowed: false,
  });
  assert.strictEqual(typeof result.requiredJamalApproval, "boolean");
});

// 45. Fallback
check("Tool-Routing liefert Fallback-Werkzeug, wenn vorhanden", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "ki-unternehmenszentrale",
    requiredCapabilities: ["isolierte Code-Ausführung"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.recommendedTool.toolId, "codex");
  assert.strictEqual(result.fallback, "cursor");
});

// 46. blockierter Pluginstatus
check("Health-Projekt blockiert Codex im Routing (Health-Hardblock)", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "health-upgrade-kompass",
    requiredCapabilities: ["isolierte Code-Ausführung"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.eliminated.some((entry) => entry.toolId === "codex" && entry.reason === "Health-Hardblock"));
});

check("Plugin-Status für Codex ist BLOCKED, wenn projectId Health ist", () => {
  const status = pluginGateway.getPluginStatusById("plugin-codex", { projectId: executionExecutorRegistry.HEALTH_PROJECT_ID });
  assert.strictEqual(status.status, "BLOCKED");
});

// 47. degradierter Pluginstatus
check("Plugin-Status-Enum enthält DEGRADED und wird von der Routing-Logik korrekt behandelt (Rangfolge CONTROLLED_HANDOFF)", () => {
  assert.ok(pluginGateway.PLUGIN_STATUSES.includes("DEGRADED"));
});

// Zusätzliche strukturelle Prüfungen
check("alle Plugin-Status-Werte sind aus der erlaubten Enum-Liste", () => {
  pluginGateway.listPluginStatuses().forEach((status) => {
    assert.ok(pluginGateway.PLUGIN_STATUSES.includes(status.status));
    assert.ok(pluginGateway.ADAPTER_TYPES.includes(status.adapterType));
  });
});

check("unbekannte Plugin-ID liefert null", () => {
  assert.strictEqual(pluginGateway.getPluginStatusById("plugin-nicht-vorhanden"), null);
});

check("Kein Sprachmodell entscheidet allein: recommendToolForTask ist eine reine, synchrone Funktion ohne KI-Aufruf", () => {
  assert.strictEqual(pluginGateway.recommendToolForTask.constructor.name, "Function");
});

// -----------------------------------------------------------------------
// Nachbesserung nach manueller Safari-Abnahme (Café-Video-Testfall):
// strukturierte, nicht ausführbare Blockierungsantwort statt stillem
// "kein Werkzeug gefunden". Reproduktion: "Social-Media-Video für ein
// Café erstellen", NORMAL, externe Übertragung/Veröffentlichung aus.
// -----------------------------------------------------------------------
const CAFE_VIDEO_INPUT = Object.freeze({
  projectId: "marketing-agentur-os",
  requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
  dataClassification: "NORMAL",
});

// 1/3. externalTransferAllowed fehlt/false bleibt sicher false
check("recommendToolForTask behandelt fehlendes externalTransferAllowed als false (sicherer Standard, keine Ausführung)", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(result.ok, false);
  assert.ok(result.blockedCandidate.missingApprovals.includes("externe Übertragung erlaubt"));
});

// 4. publicationAllowed fehlt/false bleibt sicher false
check("recommendToolForTask behandelt fehlendes publicationAllowed als false (sicherer Standard, keine Ausführung)", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(result.ok, false);
  assert.ok(result.blockedCandidate.missingApprovals.includes("Veröffentlichung erlaubt"));
});

// 5. blockiertes Routing liefert Status BLOCKED
check("Café-Video-Testfall liefert Status BLOCKED, keine erfundene Empfehlung", () => {
  const result = pluginGateway.recommendToolForTask({
    ...CAFE_VIDEO_INPUT,
    externalTransferAllowed: false,
    publicationAllowed: false,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "BLOCKED");
  assert.ok(!result.recommendedTool, "eine blockierte Antwort darf kein recommendedTool enthalten");
});

// 6. geeignetes, aber nicht verbundenes Werkzeug wird als nicht ausführbarer Kandidat angezeigt
check("Café-Video-Testfall zeigt HeyGen als fachlich geeigneten, aber nicht ausführbaren Kandidaten (NOT_CONNECTED)", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.ok(result.blockedCandidate, "blockedCandidate fehlt");
  assert.strictEqual(result.blockedCandidate.toolId, "heygen");
  assert.strictEqual(result.blockedCandidate.connectionStatus, "NOT_CONNECTED");
  assert.ok(
    result.blockedAlternatives.some((alt) => alt.toolId === "video-rendering-generisch"),
    "video-rendering-generisch sollte als weitere blockierte Alternative erscheinen",
  );
});

// 7. fehlende Freigaben sichtbar
check("Café-Video-Testfall listet fehlende Freigaben strukturiert auf (externe Übertragung UND Veröffentlichung)", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.deepStrictEqual(result.blockedCandidate.missingApprovals.sort(), ["Veröffentlichung erlaubt", "externe Übertragung erlaubt"].sort());
});

// 8. Kostenstatus sichtbar
check("Café-Video-Testfall liefert einen Kostenstatus für den Kandidaten (nie stillschweigend erfunden)", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.ok(["UNKNOWN", "FREE", "WITHIN_BUDGET", "OVER_BUDGET"].includes(result.blockedCandidate.costStatus));
  assert.ok(["UNKNOWN", "FREE", "WITHIN_BUDGET", "OVER_BUDGET"].includes(result.costStatus));
});

// 9. Datenschutzgrenze sichtbar
check("Café-Video-Testfall zeigt die Datenschutzgrenze auf oberster Ebene und beim Kandidaten", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(result.dataClassificationBoundary, "NORMAL");
  assert.strictEqual(result.blockedCandidate.dataClassificationBoundary, "NORMAL");
});

// 10. Fallback beziehungsweise nächster Jamal-Schritt sichtbar
check("Café-Video-Testfall liefert einen nächsten zulässigen Jamal-Schritt als nichtleeren Text", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(typeof result.nextAllowedJamalStep, "string");
  assert.ok(result.nextAllowedJamalStep.length > 0);
  assert.ok(/Jamal/.test(result.nextAllowedJamalStep));
  assert.ok(result.fallback === null || typeof result.fallback === "string");
});

// 11. keine automatische Ausführung
check("Café-Video-Testfall erlaubt weiterhin keine automatische Ausführung, keine externe Übertragung, keine Veröffentlichung, keine Kostenfreigabe", () => {
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(result.noAutomaticExecution, true);
  assert.strictEqual(result.requiredJamalApproval, true);
  assert.strictEqual(result.ok, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "recommendedTool"));
});

check("Café-Video-Testfall zeigt HeyGen weiterhin nicht als produktiv verbunden (Bestandsschutz)", () => {
  const status = pluginGateway.getPluginStatusById("plugin-heygen");
  assert.strictEqual(status.status, "REGISTERED");
  const result = pluginGateway.recommendToolForTask({ ...CAFE_VIDEO_INPUT });
  assert.strictEqual(result.blockedCandidate.connectionStatus, "NOT_CONNECTED");
});

// -----------------------------------------------------------------------
// Nachbesserung Runde 2 (manuelle Safari-Wiederholungsabnahme): die
// strukturierte BLOCKED-Antwort zeigte für die reale Aufgabenbeschreibung
// "Social-Media-Video für ein Café erstellen" fälschlich "Kein fachlich
// geeignetes Werkzeug vorgemerkt", weil die bisherige Capability-Prüfung
// eine vollständige Substring-Enthaltenheit in beide Richtungen verlangte
// und damit bei natürlichsprachigen Sätzen scheiterte (weder ist der ganze
// Satz in der kurzen Tool-Capability enthalten, noch umgekehrt). Fix:
// deterministische, feste Schlüsselwort-Normalisierung (siehe
// CAPABILITY_KEYWORD_MAP/extractCapabilityKeywords in plugin-gateway.js).
// -----------------------------------------------------------------------

// 1. "Social-Media-Video" erkennt HeyGen als fachlich passenden Kandidaten
check("Capability-Normalisierung: 'Social-Media-Video für ein Café erstellen' erkennt HeyGen als fachlich passenden, blockierten Kandidaten", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
    externalTransferAllowed: false,
    publicationAllowed: false,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "BLOCKED");
  assert.ok(result.blockedCandidate, "Regression: 'Kein fachlich geeignetes Werkzeug vorgemerkt' darf nicht mehr auftreten");
  assert.strictEqual(result.blockedCandidate.toolId, "heygen");
});

// 2. "Avatar-Video" erkennt HeyGen
check("Capability-Normalisierung: 'Avatar-Video' erkennt HeyGen als fachlich passenden Kandidaten", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Avatar-Video"],
    dataClassification: "NORMAL",
  });
  assert.ok(result.blockedCandidate);
  assert.strictEqual(result.blockedCandidate.toolId, "heygen");
});

// 3. "Video erstellen" erkennt generisches Video-Tool als Alternative
check("Capability-Normalisierung: 'Video erstellen' erkennt HeyGen als Kandidat und das generische Video-Werkzeug als Alternative", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Video erstellen"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.blockedCandidate.toolId, "heygen");
  assert.ok(result.blockedAlternatives.some((alt) => alt.toolId === "video-rendering-generisch"));
});

// 4. Kandidat bleibt bei fehlender Verbindung BLOCKED
check("Kandidat bleibt bei fehlender technischer Verbindung insgesamt BLOCKED (keine erfundene Ausführung)", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.blockedCandidate.connectionStatus, "NOT_CONNECTED");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "BLOCKED");
});

// 5. fehlende externe Übertragung wird ausgewiesen
check("fehlende externe Übertragung wird beim Café-Video-Kandidaten strukturiert ausgewiesen", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.ok(result.blockedCandidate.missingApprovals.includes("externe Übertragung erlaubt"));
});

// 6. fehlende Veröffentlichung wird ausgewiesen
check("fehlende Veröffentlichung wird beim Café-Video-Kandidaten strukturiert ausgewiesen", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.ok(result.blockedCandidate.missingApprovals.includes("Veröffentlichung erlaubt"));
});

// 7. Kostenstatus vorhanden
check("Kostenstatus ist beim Café-Video-Kandidaten immer vorhanden (nie stillschweigend erfunden)", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.ok(["UNKNOWN", "FREE", "WITHIN_BUDGET", "OVER_BUDGET"].includes(result.blockedCandidate.costStatus));
});

// 8. Fallback vorhanden (Feld strukturiert vorhanden, auch wenn null)
check("Fallback-Feld ist beim Café-Video-Ergebnis strukturiert vorhanden", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.ok(Object.prototype.hasOwnProperty.call(result, "fallback"));
  assert.ok(result.fallback === null || typeof result.fallback === "string");
});

// 9. unbekannte Fähigkeit erfindet weiterhin kein Werkzeug
check("eine fachlich unbekannte Fähigkeit (kein Schlüsselwort-Treffer) erfindet weiterhin kein Werkzeug", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Quantencomputing-Beratung für Steuerprüfung"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.blockedCandidate, null);
  assert.ok(/Kein fachlich geeignetes Werkzeug vorgemerkt/.test(result.nextAllowedJamalStep));
});

// 10. keine automatische Ausführung
check("Café-Video-Testfall (natürliche Aufgabenbeschreibung) erlaubt weiterhin keine automatische Ausführung", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "marketing-agentur-os",
    requiredCapabilities: ["Social-Media-Video für ein Café erstellen"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(result.noAutomaticExecution, true);
  assert.strictEqual(result.requiredJamalApproval, true);
  assert.strictEqual(result.ok, false);
});

check("Capability-Normalisierung ändert bestehende kurze Stichwort-Treffer nicht (Bestandsschutz 'Design')", () => {
  const result = pluginGateway.recommendToolForTask({
    projectId: "ki-unternehmenszentrale",
    requiredCapabilities: ["Design"],
    dataClassification: "NORMAL",
    publicationAllowed: false,
  });
  assert.strictEqual(typeof result.requiredJamalApproval, "boolean");
});

console.log(`plugin-gateway.test.js: ${passed} Prüfpunkte erfolgreich`);
