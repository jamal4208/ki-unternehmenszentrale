"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const agentRegistry = require("./agent-registry");
const projectRegistry = require("./project-registry");
const documentRegistry = require("./document-registry");
const guidedWorkUi = require("./guided-work-ui");
const executionExecutorRegistry = require("./execution-executor-registry");
const executionMockAdapter = require("./execution-mock-adapter");
const executionCodexAdapter = require("./execution-codex-adapter");
const pluginGateway = require("./plugin-gateway");
const v7FreezeStatusModule = require("./v7-freeze-status");
const serverStatusModule = require("./server-status");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function gitChangedFiles() {
  const raw = execFileSync("git", ["status", "--short"], {
    cwd: __dirname,
    encoding: "utf8",
    shell: false,
  });
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[AMD?!\s]+/, "").trim());
}

const changedFiles = gitChangedFiles();

// 48. 25 Agenten
check("25 Agenten bleiben erhalten", () => {
  assert.strictEqual(agentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
  assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
});

// 49. 17 Projekte
check("17 Projekte bleiben erhalten", () => {
  assert.strictEqual(projectRegistry.PROJECT_REGISTRY.length, 17);
});

// 50. Guided Work verwendet Dokumentreferenzen
check("Guided Work kann registrierte Dokumentreferenzen für das fokussierte Projekt lesen", () => {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "v71-integration-test-"));
  const paths = documentRegistry.resolveDocumentPaths({ appSupportDir });
  documentRegistry.ensureDocumentDirs(paths);
  const registered = documentRegistry.registerDocument(
    { projectId: "ki-unternehmenszentrale", title: "Guided-Work-Referenz", sourceType: "MANUAL_NOTE", note: "x" },
    { paths },
  );
  const references = documentRegistry.listDocumentReferencesForGuidedWork("ki-unternehmenszentrale", { paths });
  assert.ok(references.some((doc) => doc.documentId === registered.document.documentId));
});

// 51. Team-Editor erhalten
check("Team-Editor (Guided Work UI) bleibt erhalten und unverändert", () => {
  assert.strictEqual(typeof guidedWorkUi.renderTeamEditor, "function");
  assert.ok(!changedFiles.includes("guided-work-ui.js"), "guided-work-ui.js darf in Phase A nicht verändert werden");
});

// 52. Executor-Bridge unverändert
check("Execution Bridge und zugehörige Module bleiben unverändert (kein Diff)", () => {
  [
    "execution-bridge.js",
    "execution-mock-adapter.js",
    "execution-codex-adapter.js",
    "execution-executor-registry.js",
    "guided-work.js",
  ].forEach((file) => {
    assert.ok(!changedFiles.includes(file), `${file} darf in V7.1 Phase A nicht verändert werden`);
  });
});

// 53. Mock grün
check("Mock-Executor bleibt grün (unterstützte Szenarien vorhanden)", () => {
  assert.ok(Array.isArray(executionMockAdapter.SUPPORTED_SCENARIOS));
  assert.ok(executionMockAdapter.SUPPORTED_SCENARIOS.length > 0);
});

// 54. Codex grün
check("Codex-Adapter bleibt grün (Verfügbarkeitserkennung funktioniert strukturell)", () => {
  const availability = executionCodexAdapter.detectCodexAvailability({
    forceRefresh: true,
    execFileSyncImpl: () => "codex-cli 1.0.0\n",
  });
  assert.strictEqual(availability.available, true);
});

// 55. Health-Hardblock
check("Health-Hardblock gilt sowohl im Executor-Register als auch im Plugin-Gateway/Tool-Routing", () => {
  assert.strictEqual(executionExecutorRegistry.isHealthAllowedForExecutor("codex"), false);
  const status = pluginGateway.getPluginStatusById("plugin-codex", { projectId: executionExecutorRegistry.HEALTH_PROJECT_ID });
  assert.strictEqual(status.status, "BLOCKED");
  const routing = pluginGateway.recommendToolForTask({
    projectId: executionExecutorRegistry.HEALTH_PROJECT_ID,
    requiredCapabilities: ["isolierte Code-Ausführung"],
    dataClassification: "NORMAL",
  });
  assert.strictEqual(routing.ok, false);
});

// 56. Health unverändert
check("Health-Repository wird ausschließlich read-only referenziert (kein localPath-Schreibzugriff in neuen Modulen)", () => {
  ["document-registry.js", "tool-registry.js", "plugin-gateway.js", "v71-registry-backup.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/health-upgrade-kompass.*writeFile|writeFile.*health-upgrade-kompass/.test(source));
  });
});

// 57. Fixture unverändert
check("Fixture-Repository wird von den neuen V7.1-Modulen nicht berührt", () => {
  ["document-registry.js", "tool-registry.js", "plugin-gateway.js", "v71-registry-backup.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("execution-bridge-demo"));
  });
});

// 58. V7.0-Freeze bleibt gültig
check("V7.0-Freeze-Entscheidung bleibt gültig und unverändert", () => {
  assert.ok(v7FreezeStatusModule.isValidManualFreezeDecision(v7FreezeStatusModule.MANUAL_FREEZE_DECISION));
  assert.ok(!changedFiles.includes("v7-freeze-status.js"));
});

// 59. Serverstatus V7.0 FROZEN
check("Server-Status meldet weiterhin CENTRAL_APP_VERSION V7.0 FROZEN", () => {
  assert.strictEqual(serverStatusModule.CENTRAL_APP_VERSION, "V7.0 FROZEN");
  assert.ok(!changedFiles.includes("server-status.js"));
});

// 60. keine V7.0-Funktion umgeschrieben
check("server.js wurde nur additiv erweitert (bestehende Execution-Routen unverändert vorhanden)", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  [
    "/api/execution/prepare",
    "/api/execution/attempts/start",
    "/api/execution/attempts/cancel",
    "/api/execution/apply",
    "/api/execution/attempts/status",
    "/api/execution/attempts/result",
    "/api/execution/executors",
    "/api/server-status",
    "/api/v7-freeze-status",
  ].forEach((routePath) => {
    assert.ok(serverSource.includes(`"${routePath}"`), `${routePath} muss weiterhin registriert sein`);
  });
});

// Zusätzlich (Section B): genau eine Wahrheitsquelle je Frage. Die bestehende
// PRODUCTIVE_PLUGIN_REGISTRY (server.js, V6.34.2) ist eine eigene, V7.0-
// eingefrorene UI-Textsammlung für den Cockpit-"Plugin-Leitstand" und darf
// keinem gemeinsamen toolId niemals einen "verbundener/ausführbarer" Zustand
// zuschreiben, der dem neuen, kanonischen Plugin-Gateway widerspricht.
check("Plugin-Wahrheitsquellen widersprechen sich nicht (server.js PRODUCTIVE_PLUGIN_REGISTRY vs. plugin-gateway.js)", () => {
  const { PRODUCTIVE_PLUGIN_REGISTRY: legacyRegistry } = require("./server");
  assert.ok(Array.isArray(legacyRegistry) && legacyRegistry.length > 0);
  const legacyConnectedLikeStatuses = new Set(["connected", "live", "executable", "production-ready"]);
  legacyRegistry.forEach((legacyEntry) => {
    assert.ok(
      !legacyConnectedLikeStatuses.has(String(legacyEntry.status || "").toLowerCase()),
      `Legacy-Plugin-Eintrag ${legacyEntry.id} darf keinen produktiv-verbundenen Status vortäuschen`,
    );
    const gatewayStatus = pluginGateway.getPluginStatusForTool(legacyEntry.id);
    if (!gatewayStatus) return;
    // Kein gemeinsamer Eintrag darf im neuen Gateway einen aktiven externen
    // Schreibzugriff ausweisen, solange die Legacy-Karte Schreiben/Löschen
    // ausdrücklich blockiert. "publication" ist bewusst ausgenommen: dieses
    // Feld ist eine Fähigkeits-/Freigabeklassifizierung (löst in der
    // Routing-Logik zwingend requiredJamalApproval aus), keine Aussage über
    // eine bereits erfolgte oder autonome Veröffentlichung.
    const legacyBlocksWrites = (legacyEntry.blockedActions || []).some((action) =>
      /schreiben|löschen/i.test(action),
    );
    if (legacyBlocksWrites) {
      assert.strictEqual(gatewayStatus.externalWrite, false);
    }
    // Wenn die Legacy-Karte Veröffentlichung blockiert, muss das Gateway bei
    // Publikationsfähigkeit zwingend eine Jamal-Freigabe für Veröffentlichung
    // im Tool-Routing verlangen, niemals eine autonome Direktausführung.
    const legacyBlocksPublication = (legacyEntry.blockedActions || []).some((action) => /veröffentlichen/i.test(action));
    if (legacyBlocksPublication && gatewayStatus.publication) {
      const routing = pluginGateway.recommendToolForTask({
        requiredCapabilities: [],
        dataClassification: "NORMAL",
        publicationAllowed: false,
      });
      if (routing.ok && routing.recommendedTool.toolId === legacyEntry.id) {
        assert.notStrictEqual(routing.recommendedTool.executionMode, "DIRECT");
        assert.strictEqual(routing.requiredJamalApproval, true);
      }
    }
  });
});

console.log(`v71-integration.test.js: ${passed} Prüfpunkte erfolgreich`);
