"use strict";

// V7.1 Phase B – Bestandsschutz- und Ausgangsprüfungen für den HeyGen-
// Connector-Pilot (Auftrag Abschnitt N, Pflichttests 1-5 und 67-80).
// Ergänzt v71-integration.test.js additiv (kein Ersatz), mit Fokus auf die
// HeyGen-spezifischen Ausgangsbedingungen und den Bestandsschutz gegenüber
// V7.0/V7.1 Phase A, Health, Fixture, Canva/Shopify und Deployment.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const agentRegistry = require("./agent-registry");
const projectRegistry = require("./project-registry");
const documentRegistry = require("./document-registry");
const toolRegistry = require("./tool-registry");
const pluginGateway = require("./plugin-gateway");
const executionExecutorRegistry = require("./execution-executor-registry");
const executionMockAdapter = require("./execution-mock-adapter");
const executionCodexAdapter = require("./execution-codex-adapter");
const v7FreezeStatusModule = require("./v7-freeze-status");
const serverStatusModule = require("./server-status");
const v71RegistryBackupModule = require("./v71-registry-backup");
const heygenJobPackage = require("./heygen-job-package");
const heygenConnector = require("./heygen-connector");
// V7.1 Phase B.1 – zusätzliche, additive Module (Mandantenbasis, Pilot-
// Review, Ergebnisrückführung, Agentur-Backup).
const agencyTenantRegistry = require("./agency-tenant-registry");
const heygenPilotReview = require("./heygen-pilot-review");
const heygenResultLifecycle = require("./heygen-result-lifecycle");
const agencyBackup = require("./agency-backup");

// V7.1 Phase B.1 – dieselben Bestandsschutzprüfungen (74-80 unten) müssen
// auch die neuen additiven Module abdecken, nicht nur die Phase-B-Module.
const HEYGEN_PHASE_B_FILES = ["heygen-job-package.js", "heygen-connector.js", "heygen-job-result.js", "heygen-backup.js", "heygen-store.js"];
const HEYGEN_PHASE_B1_FILES = [
  "agency-tenant-registry.js",
  "heygen-pilot-review.js",
  "heygen-result-lifecycle.js",
  "agency-backup.js",
];
const ALL_HEYGEN_AGENCY_FILES = [...HEYGEN_PHASE_B_FILES, ...HEYGEN_PHASE_B1_FILES];

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

// ---------------------------------------------------------------------------
// N. Ausgang/Registry (1-5)
// ---------------------------------------------------------------------------

// 1. V7.0 bleibt FROZEN.
check("1. V7.0 bleibt FROZEN", () => {
  assert.ok(v7FreezeStatusModule.isValidManualFreezeDecision(v7FreezeStatusModule.MANUAL_FREEZE_DECISION));
  assert.strictEqual(serverStatusModule.CENTRAL_APP_VERSION, "V7.0 FROZEN");
  assert.ok(!changedFiles.includes("v7-freeze-status.js"));
  assert.ok(!changedFiles.includes("server-status.js"));
});

// 2. V7.1 Phase A bleibt grün.
check("2. V7.1 Phase A bleibt grün (Dokumentregister/Werkzeugregister/Plugin-Gateway/Backup-Format unverändert)", () => {
  assert.ok(!changedFiles.includes("document-registry.js"));
  assert.ok(!changedFiles.includes("plugin-gateway.js"));
  assert.strictEqual(v71RegistryBackupModule.V71_EXPORT_FORMAT_VERSION, "v71-phase-a-metadata-1");
  assert.strictEqual(typeof documentRegistry.registerDocument, "function");
  assert.ok(toolRegistry.TOOL_REGISTRY.length > 0);
});

// 3. HeyGen zunächst nicht DIRECT.
check("3. HeyGen ist in der kanonischen Basiswahrheit weiterhin nicht DIRECT und nicht CONNECTED", () => {
  const heygen = toolRegistry.getToolById("heygen");
  assert.ok(heygen);
  assert.notStrictEqual(heygen.executionMode, "DIRECT");
  assert.notStrictEqual(heygen.connectionStatus, "CONNECTED");
  const pilotStatus = heygenConnector.buildHeygenPilotStatus();
  assert.notStrictEqual(pilotStatus.pilotExecutionMode, "DIRECT");
  assert.strictEqual(pilotStatus.directOrAutonomousConnection, false);
});

// 4. CONTROLLED_HANDOFF erst nach vollständiger Strecke.
check("4. CONTROLLED_HANDOFF-Pilotstatus wird nur ausgewiesen, wenn Modell+Adapter+Ergebnisrückführung vollständig implementiert sind", () => {
  assert.strictEqual(typeof heygenJobPackage.prepareHeygenJobPackage, "function");
  assert.strictEqual(typeof heygenJobPackage.validateHeygenJobPackageContent, "function");
  assert.strictEqual(typeof heygenConnector.requestHandoffToken, "function");
  assert.strictEqual(typeof heygenConnector.prepareHandoffPayload, "function");
  assert.strictEqual(typeof heygenConnector.requestResultValidationToken, "function");
  assert.strictEqual(typeof heygenConnector.validateHandoffResult, "function");
  const pilotStatus = heygenConnector.buildHeygenPilotStatus();
  assert.strictEqual(pilotStatus.controlledHandoffPathImplemented, true);
  assert.strictEqual(pilotStatus.pilotExecutionMode, "CONTROLLED_HANDOFF");
  // Die kanonische Phase-A-Basiswahrheit (tool-registry.js) bleibt davon
  // unverändert – keine zweite, widersprüchliche Quelle.
  assert.strictEqual(pilotStatus.baseExecutionMode, "RECOMMENDATION_ONLY");
});

// 5. Canva/Shopify unverändert.
check("5. Canva/Shopify sind von Phase B unverändert und nicht CONNECTED/DIRECT", () => {
  ["canva", "shopify"].forEach((id) => {
    const tool = toolRegistry.getToolById(id);
    assert.ok(tool);
    assert.notStrictEqual(tool.connectionStatus, "CONNECTED");
    assert.notStrictEqual(tool.executionMode, "DIRECT");
  });
  const source = fs.readFileSync(path.join(__dirname, "tool-registry.js"), "utf8");
  const canvaBlock = source.match(/toolId: "canva"[\s\S]*?\}\),/);
  const shopifyBlock = source.match(/toolId: "shopify"[\s\S]*?\}\),/);
  assert.ok(canvaBlock && !/heygen|HeyGen/.test(canvaBlock[0]));
  assert.ok(shopifyBlock && !/heygen|HeyGen/.test(shopifyBlock[0]));
});

// ---------------------------------------------------------------------------
// N. Bestandsschutz (67-80)
// ---------------------------------------------------------------------------

// 67. 25 Agenten.
check("67. 25 Agenten bleiben erhalten", () => {
  assert.strictEqual(agentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
  assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
});

// 68. 17 Projekte.
check("68. 17 Projekte bleiben erhalten", () => {
  assert.strictEqual(projectRegistry.PROJECT_REGISTRY.length, 17);
});

// 69. Phase-A-Dokumentregister.
check("69. Phase-A-Dokumentregister bleibt unverändert und funktionsfähig", () => {
  assert.ok(!changedFiles.includes("document-registry.js"));
  assert.strictEqual(typeof documentRegistry.listDocuments, "function");
});

// 70. Phase-A-Toolregister.
check("70. Phase-A-Toolregister bleibt strukturell intakt (additiv erweitert, keine Kategorie verloren)", () => {
  const response = toolRegistry.buildToolsResponse();
  assert.ok(response.toolCount >= 14);
  assert.ok(response.categories.includes("Avatar"));
  const heygen = toolRegistry.getToolById("heygen");
  assert.ok(heygen.capabilities.length > 0);
});

// 71. Phase-A-Plugin-Gateway.
check("71. Phase-A-Plugin-Gateway bleibt unverändert und funktionsfähig", () => {
  assert.ok(!changedFiles.includes("plugin-gateway.js"));
  const status = pluginGateway.getPluginStatusById("plugin-heygen");
  assert.ok(status);
  assert.notStrictEqual(status.status, "AVAILABLE");
});

// 72. Mock.
check("72. Mock-Executor bleibt grün", () => {
  assert.ok(Array.isArray(executionMockAdapter.SUPPORTED_SCENARIOS));
  assert.ok(executionMockAdapter.SUPPORTED_SCENARIOS.length > 0);
});

// 73. Codex.
check("73. Codex-Adapter bleibt grün (strukturelle Verfügbarkeitserkennung)", () => {
  const availability = executionCodexAdapter.detectCodexAvailability({
    forceRefresh: true,
    execFileSyncImpl: () => "codex-cli 1.0.0\n",
  });
  assert.strictEqual(availability.available, true);
});

// 74. Health-Hardblock.
check("74. Health-Hardblock gilt weiterhin (Executor-Register und Plugin-Gateway/Tool-Routing)", () => {
  assert.strictEqual(executionExecutorRegistry.isHealthAllowedForExecutor("codex"), false);
  const status = pluginGateway.getPluginStatusById("plugin-codex", { projectId: executionExecutorRegistry.HEALTH_PROJECT_ID });
  assert.strictEqual(status.status, "BLOCKED");
});

// 75. Health unverändert.
check("75. Health-Repository wird von den neuen HeyGen-Modulen nicht berührt (kein Pfad, kein Schreibzugriff)", () => {
  ALL_HEYGEN_AGENCY_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("health-upgrade-kompass"));
    assert.ok(!/writeFile|fs\.write/.test(source.match(/health/gi) ? source : ""));
  });
});

// 76. Fixture unverändert.
check("76. Fixture-Repository wird von den neuen HeyGen-Modulen nicht berührt", () => {
  ALL_HEYGEN_AGENCY_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("execution-bridge-demo"));
  });
});

// 77. Serverstatus V7.0 FROZEN.
check("77. Serverstatus meldet weiterhin V7.0 FROZEN", () => {
  assert.strictEqual(serverStatusModule.CENTRAL_APP_VERSION, "V7.0 FROZEN");
});

// 78. kein Deployment.
check("78. keine HeyGen-Route löst ein Deployment aus (kein Vercel-/Deploy-Bezug in den neuen Modulen)", () => {
  ALL_HEYGEN_AGENCY_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/deploy|vercel/i.test(source));
  });
});

// 79. keine Canva-/Shopify-Änderung.
check("79. keine Canva-/Shopify-Route oder -Logik wurde durch Phase B verändert", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.ok(!serverSource.includes('"/api/v71/canva'));
  assert.ok(!serverSource.includes('"/api/v71/shopify'));
  ALL_HEYGEN_AGENCY_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/canva|shopify/i.test(source));
  });
});

// 80. keine Marketing-Agentur-Gesamtfunktion.
check("80. keine Marketing-Agentur-Gesamtumsetzung: HeyGen bleibt ein isolierter, einzelner Connector-Pilot", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const heygenSectionMatch = serverSource.match(/V7\.1 Phase B – HeyGen[\s\S]*?const getRoutes = buildRouteMap/);
  assert.ok(heygenSectionMatch, "HeyGen-Routenabschnitt nicht gefunden");
  // "marketing-agentur-os" ist ein vorbestehender Projekteintrag (siehe
  // project-registry.js) und kein Marketing-Agentur-Gesamtsystem, das durch
  // Phase B eingeführt würde – die Prüfung bleibt daher gezielt auf den
  // neuen HeyGen-Routenabschnitt und die neuen HeyGen-Module beschränkt.
  assert.ok(!/marketing-agentur|marketingAgentur/i.test(heygenSectionMatch[0]));
  assert.ok(!serverSource.includes('"/api/v71/marketing'));
  // agency-tenant-registry.js referenziert "marketing-agentur-os" bewusst
  // ausschließlich als bereits vorbestehende projectId (project-registry.js)
  // für den zweiten Testmandanten, nicht als neues Gesamtsystem – deshalb
  // gezielt aus dieser Prüfung ausgenommen (siehe eigene 70./80.-Prüfungen
  // unten für die Abgrenzung "keine zweite Registry"/"keine Phase C").
  HEYGEN_PHASE_B_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/marketing-agentur|marketingAgentur/i.test(source));
  });
});

// Zusätzliche, HeyGen-spezifische Ausgangs-/Bestandsschutzprüfung: der
// vollständige Rundlauf bleibt lokal, ohne echten Netzwerkaufruf.
check("HeyGen-Connector enthält keinen direkten Netzwerkaufruf (kein http/https-Client, kein fetch)", () => {
  [...HEYGEN_PHASE_B_FILES.filter((f) => f !== "heygen-backup.js" && f !== "heygen-store.js"), ...HEYGEN_PHASE_B1_FILES].forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/require\(["']https?["']\)/.test(source), `${file} darf keinen http(s)-Client importieren`);
    assert.ok(!/\bfetch\(/.test(source), `${file} darf kein fetch() verwenden`);
  });
});

check("keine Route für API-Key-Speicherung existiert (Phase B J: 'keine Route für API-Key speichern')", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.ok(!/apiKey.*heygen|heygen.*apiKey/i.test(serverSource));
});

// ---------------------------------------------------------------------------
// V7.1 Phase B.1 (Auftrag Abschnitt L, Pflichttests 66-80) – Bestandsschutz
// unter der exakten Nummerierung des aktuellen Auftrags. Ergänzt die oben
// bereits vorhandenen (nach Phase-B-Nummerierung benannten) Prüfungen
// additiv, ersetzt sie nicht.
// ---------------------------------------------------------------------------

// 66. V7.0 FROZEN.
check("66. V7.0 bleibt FROZEN (Phase B.1)", () => {
  assert.strictEqual(serverStatusModule.CENTRAL_APP_VERSION, "V7.0 FROZEN");
  assert.ok(v7FreezeStatusModule.isValidManualFreezeDecision(v7FreezeStatusModule.MANUAL_FREEZE_DECISION));
});

// 67. V7.1 Phase A.
check("67. V7.1 Phase A bleibt unverändert (Phase B.1)", () => {
  assert.ok(!changedFiles.includes("document-registry.js"));
  assert.ok(!changedFiles.includes("plugin-gateway.js"));
  assert.strictEqual(v71RegistryBackupModule.V71_EXPORT_FORMAT_VERSION, "v71-phase-a-metadata-1");
});

// 68. V7.1 Phase B.
check("68. V7.1 Phase B (HeyGen-Connector-Pilot) bleibt strukturell erhalten (Phase B.1 ist rein additiv)", () => {
  assert.strictEqual(typeof heygenJobPackage.approveContent, "function");
  assert.strictEqual(typeof heygenJobPackage.approveExternalTransfer, "function");
  assert.strictEqual(typeof heygenJobPackage.setCostApproval, "function");
  assert.strictEqual(typeof heygenConnector.buildHeygenPilotStatus, "function");
  const pilotStatus = heygenConnector.buildHeygenPilotStatus();
  assert.strictEqual(pilotStatus.pilotExecutionMode, "CONTROLLED_HANDOFF");
});

// 69. 25 Agenten.
check("69. 25 Agenten bleiben erhalten (Phase B.1)", () => {
  assert.strictEqual(agentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
  assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
});

// 70. 17 Projekte.
check("70. 17 Projekte bleiben erhalten (Phase B.1); keine zweite Projekt-/Agentenregistry für die Mandantenbasis", () => {
  assert.strictEqual(projectRegistry.PROJECT_REGISTRY.length, 17);
  const registrySource = fs.readFileSync(path.join(__dirname, "agency-tenant-registry.js"), "utf8");
  assert.ok(!/PROJECT_REGISTRY\s*=|AGENT_REGISTRY\s*=/.test(registrySource), "agency-tenant-registry.js darf keine zweite Projekt-/Agentenregistry definieren");
});

// 71. Mock.
check("71. Mock-Executor bleibt grün (Phase B.1)", () => {
  assert.ok(Array.isArray(executionMockAdapter.SUPPORTED_SCENARIOS));
  assert.ok(executionMockAdapter.SUPPORTED_SCENARIOS.length > 0);
});

// 72. Codex.
check("72. Codex-Adapter bleibt grün (Phase B.1, strukturelle Verfügbarkeitserkennung)", () => {
  const availability = executionCodexAdapter.detectCodexAvailability({
    forceRefresh: true,
    execFileSyncImpl: () => "codex-cli 1.0.0\n",
  });
  assert.strictEqual(availability.available, true);
});

// 73. Health-Hardblock.
check("73. Health-Hardblock gilt weiterhin (Phase B.1 führt keine Health-Ausnahme ein)", () => {
  assert.strictEqual(executionExecutorRegistry.isHealthAllowedForExecutor("codex"), false);
  const status = pluginGateway.getPluginStatusById("plugin-codex", { projectId: executionExecutorRegistry.HEALTH_PROJECT_ID });
  assert.strictEqual(status.status, "BLOCKED");
});

// 74. Health unverändert (kein Health-Bezug in den neuen Modulen).
check("74. Health-Repository wird von den Phase-B.1-Modulen nicht berührt", () => {
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("health-upgrade-kompass"));
    assert.ok(!/395bf9e0/.test(source));
  });
});

// 75. Fixture unverändert.
check("75. Fixture-Repository wird von den Phase-B.1-Modulen nicht berührt", () => {
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("execution-bridge-demo"));
    assert.ok(!/e38c1985/.test(source));
  });
});

// 76. Canva/Shopify unverändert.
check("76. Canva/Shopify bleiben von Phase B.1 unverändert und nicht CONNECTED/DIRECT", () => {
  ["canva", "shopify"].forEach((id) => {
    const tool = toolRegistry.getToolById(id);
    assert.ok(tool);
    assert.notStrictEqual(tool.connectionStatus, "CONNECTED");
    assert.notStrictEqual(tool.executionMode, "DIRECT");
  });
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/canva|shopify/i.test(source));
  });
});

// 77. kein weiterer HeyGen-Render.
check("77. kein Modul löst automatisch einen weiteren HeyGen-Render/Netzwerkaufruf aus", () => {
  assert.strictEqual(typeof heygenPilotReview.getCanonicalFirstPilotReview, "function");
  const pilot = heygenPilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(pilot.renderStatus, "PROVIDER_SUCCEEDED");
  assert.strictEqual(pilot.source, "MANUAL_REPORT_BY_JAMAL");
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/\bfetch\(|require\(["']https?["']\)/.test(source), `${file} darf keinen Netzwerkaufruf enthalten`);
  });
});

// 78 (Section-L-Nummerierung). kein Deployment durch Phase B.1.
check("78. keine Phase-B.1-Route/-Modul löst ein Deployment aus", () => {
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/deploy|vercel/i.test(source));
  });
});

// 79 (Section-L-Nummerierung). keine Veröffentlichung möglich.
check("79. keine Veröffentlichung: kein Modul kann publicationStatus/publicationApproved auf PUBLISHED/true setzen", () => {
  assert.strictEqual(typeof heygenResultLifecycle.approveByCustomer, "function");
  const record = heygenResultLifecycle.initLifecycleRecord({ jobPackageId: "x", providerClaimedStatus: "SUCCEEDED", customerId: "c", brandId: "b", campaignId: "k" });
  assert.strictEqual(record.publicationStatus, "PUBLICATION_NOT_APPROVED");
  Object.keys(heygenResultLifecycle).forEach((key) => {
    if (typeof heygenResultLifecycle[key] !== "function") return;
    // "isPublished" ist ein reiner, lesender Statusabfrager (kein Setter) und
    // daher bewusst ausgenommen; jede schreibende Funktion mit "publish" im
    // Namen (z. B. "publish"/"markPublished"/"approvePublication") wäre
    // hingegen ein Regelverstoß.
    if (key === "isPublished") return;
    assert.ok(!/publish/i.test(key), `Funktion "${key}" deutet auf eine schreibende Veröffentlichungsaktion hin`);
  });
  const pilotReviewSource = fs.readFileSync(path.join(__dirname, "heygen-pilot-review.js"), "utf8");
  assert.ok(!/publicationStatus\s*=\s*["']PUBLISHED["']/.test(pilotReviewSource));
});

// 80 (Section-L-Nummerierung). keine Phase C.
check("80. keine Phase C: Module/Routen tragen keine V7.1-Phase-C-Kennzeichnung, kein produktiver Kundenanlage-Mechanismus", () => {
  // Gezielt "V7.1 Phase C" (die hier verbotene, zukünftige Ausbaustufe),
  // NICHT das historische, bereits bestehende "V7.0 Phase C" (Execution
  // Bridge Isolation) fälschlich als Verstoß werten.
  const v71PhaseCPattern = /V7\.1[\s-]?Phase[\s-]?C\b/i;
  HEYGEN_PHASE_B1_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!v71PhaseCPattern.test(source));
  });
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.ok(!v71PhaseCPattern.test(serverSource));
  // Testkunden sind statisch/code-definiert – kein Schreibpfad für eine
  // produktive Neuanlage echter Kunden in dieser Phase.
  assert.strictEqual(typeof agencyTenantRegistry.listCustomers, "function");
  assert.ok(!Object.keys(agencyTenantRegistry).some((key) => /createCustomer|addCustomer|registerCustomer/i.test(key)));
});

// Zusätzliche Bestandsschutzprüfung: Agentur-Backup respektiert dieselben
// Metadaten-only-Regeln wie das bestehende HeyGen-Backup.
check("agency-backup.js exportiert ausschließlich Metadaten und erfindet keine echten Kundendaten", () => {
  const exported = agencyBackup.exportAgencyBackup();
  assert.ok(exported.customers.every((c) => /Testmandant|kein echter Kunde/i.test(c.displayName)));
  // Beschreibender Text ("keine Tokens", "keine API-Keys") in safetyNotice
  // ist erlaubt; geprüft wird gezielt auf tatsächliche Schlüssel-Wert-Paare.
  assert.ok(!/"apiKey"\s*:|"token"\s*:|"credential[s]?"\s*:/i.test(JSON.stringify(exported)));
});

console.log(`heygen-phase-b-integration.test.js: ${passed} Prüfpunkte erfolgreich`);
