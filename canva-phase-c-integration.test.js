"use strict";

// V7.1 Phase C – Bestandsschutz- und Ausgangsprüfungen für den Canva-
// Connector-Pilot (Auftrag Abschnitt P, Pflichttests 1-7 und 101-116).
// Ergänzt canva-design-job-package.test.js/canva-connector.test.js/
// canva-store.test.js/canva-backup.test.js/canva-design-result.test.js/
// server-v71-canva-routes.test.js/canva-ui.test.js additiv (kein Ersatz),
// mit Fokus auf die Canva-spezifischen Ausgangsbedingungen und den
// Bestandsschutz gegenüber V7.0/V7.1 Phase A/B/B.1, Health, Fixture,
// HeyGen/Shopify und Deployment. Enthält außerdem den lokalen, nicht
// externen Trockenlauf (Auftrag Abschnitt Q).

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
const agencyTenantRegistry = require("./agency-tenant-registry");
const agencyBackup = require("./agency-backup");

const canvaDesignJobPackage = require("./canva-design-job-package");
const canvaConnector = require("./canva-connector");
const canvaStore = require("./canva-store");
const canvaBackup = require("./canva-backup");

const CANVA_PHASE_C_FILES = [
  "canva-design-job-package.js",
  "canva-design-result.js",
  "canva-connector.js",
  "canva-store.js",
  "canva-backup.js",
  // V7.1 Phase C.1 – additive Pilot-Ergebnisakte/Kundenfeedback-Schleife,
  // unterliegt denselben Bestandsschutzprüfungen wie die Phase-C-Dateien.
  "canva-pilot-result-record.js",
  "canva-pilot-store.js",
];
const HEYGEN_FILES = ["heygen-job-package.js", "heygen-connector.js", "heygen-job-result.js", "heygen-backup.js", "heygen-store.js"];
const HEYGEN_AGENCY_FILES = ["agency-tenant-registry.js", "heygen-pilot-review.js", "heygen-result-lifecycle.js", "agency-backup.js"];

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

function makeTempAppSupportDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "canva-phase-c-test-"));
}

// ---------------------------------------------------------------------------
// Ausgang und Registry (1-7)
// ---------------------------------------------------------------------------

// 1. V7.0 bleibt FROZEN.
check("1. V7.0 bleibt FROZEN", () => {
  assert.ok(v7FreezeStatusModule.isValidManualFreezeDecision(v7FreezeStatusModule.MANUAL_FREEZE_DECISION));
  assert.strictEqual(serverStatusModule.CENTRAL_APP_VERSION, "V7.0 FROZEN");
  assert.ok(!changedFiles.includes("v7-freeze-status.js"));
  assert.ok(!changedFiles.includes("server-status.js"));
});

// 2. Phase A/B/B.1 bleiben grün.
check("2. V7.1 Phase A/B/B.1 bleiben strukturell unverändert und grün", () => {
  assert.ok(!changedFiles.includes("document-registry.js"));
  assert.strictEqual(v71RegistryBackupModule.V71_EXPORT_FORMAT_VERSION, "v71-phase-a-metadata-1");
  assert.strictEqual(typeof heygenJobPackage.prepareHeygenJobPackage, "function");
  assert.strictEqual(typeof heygenConnector.buildHeygenPilotStatus, "function");
  const heygenPilotStatus = heygenConnector.buildHeygenPilotStatus();
  assert.strictEqual(heygenPilotStatus.pilotExecutionMode, "CONTROLLED_HANDOFF");
  assert.strictEqual(typeof agencyTenantRegistry.listCustomers, "function");
});

// 3. Canva-Basisstatus bleibt NOT_CONNECTED.
check("3. Canva-Basisstatus bleibt NOT_CONNECTED", () => {
  const canva = toolRegistry.getToolById("canva");
  assert.ok(canva);
  assert.strictEqual(canva.connectionStatus, "NOT_CONNECTED");
});

// 4. Canva-Basisstatus bleibt RECOMMENDATION_ONLY.
check("4. Canva-Basisstatus bleibt RECOMMENDATION_ONLY", () => {
  const canva = toolRegistry.getToolById("canva");
  assert.strictEqual(canva.executionMode, "RECOMMENDATION_ONLY");
});

// 5. Pilotstatus nicht DIRECT.
check("5. Canva-Pilotstatus ist nicht DIRECT und kennzeichnet sich ausdrücklich nicht als autonome Verbindung", () => {
  const pilotStatus = canvaConnector.buildCanvaPilotStatus();
  assert.notStrictEqual(pilotStatus.pilotExecutionMode, "DIRECT");
  assert.strictEqual(pilotStatus.pilotExecutionMode, "CONTROLLED_HANDOFF");
  assert.strictEqual(pilotStatus.directOrAutonomousConnection, false);
  assert.strictEqual(pilotStatus.pilotConnectionStatus, "PARTIALLY_CONNECTED");
  // Die kanonische Basiswahrheit (tool-registry.js) bleibt davon unverändert.
  assert.strictEqual(pilotStatus.baseConnectionStatus, "NOT_CONNECTED");
  assert.strictEqual(pilotStatus.baseExecutionMode, "RECOMMENDATION_ONLY");
});

// 6. HeyGen unverändert.
check("6. HeyGen bleibt von Phase C unverändert (kein Canva-Bezug in den HeyGen-Dateien)", () => {
  HEYGEN_FILES.concat(HEYGEN_AGENCY_FILES).forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/canva/i.test(source), `${file} darf keinen Canva-Bezug enthalten`);
  });
  const heygen = toolRegistry.getToolById("heygen");
  assert.notStrictEqual(heygen.connectionStatus, "CONNECTED");
  assert.notStrictEqual(heygen.executionMode, "DIRECT");
});

// 7. Shopify unverändert.
check("7. Shopify bleibt unverändert (keine Shopify-Route, kein Shopify-Bezug in Canva-Dateien)", () => {
  const shopify = toolRegistry.getToolById("shopify");
  assert.ok(shopify);
  assert.notStrictEqual(shopify.connectionStatus, "CONNECTED");
  assert.notStrictEqual(shopify.executionMode, "DIRECT");
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.ok(!serverSource.includes('"/api/v71/shopify'));
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/shopify/i.test(source), `${file} darf keinen Shopify-Bezug enthalten`);
  });
});

// ---------------------------------------------------------------------------
// Bestandsschutz (101-116)
// ---------------------------------------------------------------------------

// 101. 25 Agenten.
check("101. 25 Agenten bleiben erhalten", () => {
  assert.strictEqual(agentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
  assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
});

// 102. 17 Projekte.
check("102. 17 Projekte bleiben erhalten", () => {
  assert.strictEqual(projectRegistry.PROJECT_REGISTRY.length, 17);
});

// 103. Dokumentregister.
check("103. Phase-A-Dokumentregister bleibt unverändert und funktionsfähig", () => {
  assert.ok(!changedFiles.includes("document-registry.js"));
  assert.strictEqual(typeof documentRegistry.listDocuments, "function");
});

// 104. Toolregister.
check("104. Toolregister bleibt strukturell intakt (additiv erweitert, keine Kategorie verloren)", () => {
  const response = toolRegistry.buildToolsResponse();
  assert.ok(response.toolCount >= 14);
  assert.ok(response.categories.includes("Design"));
  const canva = toolRegistry.getToolById("canva");
  assert.ok(canva.capabilities.length > 0);
});

// 105. Plugin-Gateway.
check("105. Plugin-Gateway bleibt unverändert und funktionsfähig", () => {
  assert.ok(!changedFiles.includes("plugin-gateway.js"));
  const status = pluginGateway.getPluginStatusById("plugin-canva");
  assert.ok(status);
  assert.notStrictEqual(status.status, "AVAILABLE");
});

// 106. Mock.
check("106. Mock-Executor bleibt grün", () => {
  assert.ok(Array.isArray(executionMockAdapter.SUPPORTED_SCENARIOS));
  assert.ok(executionMockAdapter.SUPPORTED_SCENARIOS.length > 0);
});

// 107. Codex.
check("107. Codex-Adapter bleibt grün (strukturelle Verfügbarkeitserkennung)", () => {
  const availability = executionCodexAdapter.detectCodexAvailability({
    forceRefresh: true,
    execFileSyncImpl: () => "codex-cli 1.0.0\n",
  });
  assert.strictEqual(availability.available, true);
});

// 108. Health-Hardblock.
check("108. Health-Hardblock gilt weiterhin (Executor-Register und Plugin-Gateway/Tool-Routing)", () => {
  assert.strictEqual(executionExecutorRegistry.isHealthAllowedForExecutor("codex"), false);
  const status = pluginGateway.getPluginStatusById("plugin-codex", { projectId: executionExecutorRegistry.HEALTH_PROJECT_ID });
  assert.strictEqual(status.status, "BLOCKED");
});

// 109. Health unverändert.
check("109. Health-Repository wird von den neuen Canva-Modulen nicht berührt (kein Pfad, kein Schreibzugriff)", () => {
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("health-upgrade-kompass"));
    assert.ok(!/395bf9e0/.test(source));
  });
});

// 110. Fixture unverändert.
check("110. Fixture-Repository wird von den neuen Canva-Modulen nicht berührt", () => {
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("execution-bridge-demo"));
    assert.ok(!/e38c1985/.test(source));
  });
});

// 111. HeyGen-Agenturbetrieb.
check("111. HeyGen-Agenturbetrieb (Testmandant/Pilot-Review) bleibt strukturell erhalten", () => {
  assert.strictEqual(typeof heygenJobPackage.approveContent, "function");
  assert.strictEqual(typeof heygenConnector.buildHeygenPilotStatus, "function");
  const pilotStatus = heygenConnector.buildHeygenPilotStatus();
  assert.strictEqual(pilotStatus.pilotExecutionMode, "CONTROLLED_HANDOFF");
});

// 112. kein weiterer HeyGen-Render.
check("112. kein Canva-Modul löst automatisch einen HeyGen-Render/Netzwerkaufruf aus (keine funktionale HeyGen-Kopplung, nur erlaubte Architektur-Kommentare)", () => {
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/require\(["'.\/]*heygen/i.test(source), `${file} darf HeyGen-Module nicht requiren`);
    assert.ok(!/heygenJobPackage|heygenConnector|heygenStore|heygenResultLifecycle/.test(source), `${file} darf keine HeyGen-Funktionen aufrufen`);
    assert.ok(!/\bfetch\(|require\(["']https?["']\)/.test(source), `${file} darf keinen Netzwerkaufruf enthalten`);
  });
});

// 113. kein Shopify.
check("113. kein Shopify-Bezug in Canva-Modulen oder -Routen", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const canvaSectionMatch = serverSource.match(/\/\/ V7\.1 Phase C – Canva als zweiter kontrollierter Medien-Connector[\s\S]*?const getRoutes = buildRouteMap/);
  assert.ok(canvaSectionMatch, "Canva-Routenabschnitt nicht gefunden");
  assert.ok(!/shopify/i.test(canvaSectionMatch[0]));
});

// 114. kein Deployment.
check("114. keine Canva-Route/-Modul löst ein Deployment aus (kein Vercel-/Deploy-Bezug)", () => {
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/deploy|vercel/i.test(source));
  });
});

// 115. keine Veröffentlichung.
check("115. keine Veröffentlichung: kein Canva-Modul kann publicationApprovalStatus auf APPROVED/PUBLISHED setzen", () => {
  Object.keys(canvaDesignJobPackage).forEach((key) => {
    if (typeof canvaDesignJobPackage[key] !== "function") return;
    assert.ok(!/publish|veröffentlich/i.test(key), `Funktion "${key}" deutet auf eine schreibende Veröffentlichungsaktion hin`);
  });
  const prepared = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "Bestandsschutztest",
    brief: "Neutraler Testauftrag ohne echte Daten.",
    primaryMessage: "Testbotschaft",
    dataClassification: "NORMAL",
  });
  assert.strictEqual(prepared.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
});

// 116. keine Marketing-Agentur-Gesamtfunktion.
check("116. keine Marketing-Agentur-Gesamtumsetzung: Canva bleibt ein isolierter, einzelner Connector-Pilot", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const canvaSectionMatch = serverSource.match(/\/\/ V7\.1 Phase C – Canva als zweiter kontrollierter Medien-Connector[\s\S]*?const getRoutes = buildRouteMap/);
  assert.ok(canvaSectionMatch, "Canva-Routenabschnitt nicht gefunden");
  assert.ok(!/marketing-agentur|marketingAgentur/i.test(canvaSectionMatch[0]));
  assert.ok(!serverSource.includes('"/api/v71/marketing'));
  CANVA_PHASE_C_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!/marketing-agentur|marketingAgentur/i.test(source));
  });
});

// Zusätzliche Bestandsschutzprüfung: Canva-Backup respektiert dieselben
// Metadaten-only-Regeln wie das bestehende HeyGen-Backup.
check("canva-backup.js exportiert ausschließlich Metadaten und keine Credentials/Tokens/Medien", () => {
  const tmpDir = makeTempAppSupportDir();
  try {
    const paths = canvaStore.resolveCanvaStorePaths({ appSupportDir: tmpDir });
    const prepared = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
      projectId: "ki-unternehmenszentrale",
      customerId: "test-customer-fiktives-cafe",
      brandId: "test-brand-fiktives-cafe",
      campaignId: "test-campaign-fiktives-cafe-pilot",
      designOperation: "GENERATE_NEW_DESIGN",
      designType: "INSTAGRAM_POST",
      title: "Backup-Bestandsschutztest",
      brief: "Neutraler Testauftrag ohne echte Daten.",
      primaryMessage: "Testbotschaft",
      dataClassification: "NORMAL",
    });
    canvaStore.savePackage(paths, prepared.package);
    const exported = canvaBackup.exportCanvaBackup(paths);
    const serialized = JSON.stringify(exported);
    assert.ok(!/"apiKey"\s*:|"token"\s*:|"credential[s]?"\s*:/i.test(serialized));
    assert.ok(exported.jobPackages.length >= 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Q. Lokaler Trockenlauf (Auftrag Abschnitt Q) – neutraler Testkunde,
// fiktives Café, Instagram-Post, deutsche Botschaft, keine reale Marke,
// keine Kundendaten, NOT_BILLABLE_TEST. Ausschließlich lokal, keine
// tatsächliche Canva-Aktion.
// ---------------------------------------------------------------------------

check("Q. lokaler Trockenlauf: neutraler Café-Pilotauftrag durchläuft DRAFT bis freigegebenes Hand-off, ohne echte Canva-Aktion", () => {
  const tmpDir = makeTempAppSupportDir();
  try {
    const paths = canvaStore.resolveCanvaStorePaths({ appSupportDir: tmpDir });

    // 1. Auftrag DRAFT.
    const prepared = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
      projectId: "ki-unternehmenszentrale",
      customerId: "test-customer-fiktives-cafe",
      brandId: "test-brand-fiktives-cafe",
      campaignId: "test-campaign-fiktives-cafe-pilot",
      designOperation: "GENERATE_NEW_DESIGN",
      designType: "INSTAGRAM_POST",
      title: "Sonntagsfrühstück im Test-Café",
      brief: "Neutraler Trockenlauf ohne echte Marke, ohne Kundendaten.",
      primaryMessage: "Sonntagsfrühstück ab 9 Uhr – neutraler Test.",
      dataClassification: "NORMAL",
      assetRightsConfirmed: true,
      brandRightsConfirmed: true,
      costPackageStatus: "NOT_BILLABLE_TEST",
    });
    assert.strictEqual(prepared.package.status, "DRAFT");
    canvaStore.savePackage(paths, prepared.package);

    // 2. Briefing geprüft.
    const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(prepared.package);
    assert.strictEqual(validated.package.status, "READY_FOR_REVIEW");
    canvaStore.savePackage(paths, validated.package);

    // 3. Assets/Rechte getrennt freigegeben (bereits bei prepare bestätigt,
    // Freigabe selbst bleibt ein eigener Aufruf).
    let pkg = canvaDesignJobPackage.approveBriefingAndText(validated.package);
    pkg = canvaDesignJobPackage.approveAssetsAndRights(pkg);
    assert.strictEqual(pkg.briefingApproved, true);
    assert.strictEqual(pkg.assetsAndRightsApproved, true);

    // 4. externe Verarbeitung getrennt freigegeben.
    pkg = canvaDesignJobPackage.approveExternalTransfer(pkg);
    assert.strictEqual(pkg.externalTransferApproved, true);

    // 5. Kostenrahmen getrennt freigegeben.
    pkg = canvaDesignJobPackage.setInternalCostApproval(pkg, "WITHIN_APPROVED_LIMIT");
    assert.strictEqual(pkg.internalCostApprovalStatus, "WITHIN_APPROVED_LIMIT");
    canvaStore.savePackage(paths, pkg);

    // 6. Handoff freigegeben (Token-Anforderung + Vorbereitung).
    const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
    assert.strictEqual(tokenResult.ok, true);
    assert.ok(tokenResult.token);

    // 7. minimales Handoff-Payload erzeugt.
    const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
    assert.strictEqual(handoff.ok, true);
    assert.ok(handoff.payload);
    assert.strictEqual(handoff.payload.providerOperation, "GENERATE_DESIGN_CANDIDATES");
    assert.strictEqual(handoff.package.status, "HANDED_OFF");
    assert.strictEqual(handoff.executionStarted, false);
    assert.strictEqual(handoff.externalNetworkCallMade, false);
    assert.strictEqual(handoff.costIncurred, false);
    assert.strictEqual(handoff.publicationTriggered, false);

    // 8. keine Canva-Aktion gestartet (kein Netzwerkaufruf im Adapter).
    const connectorSource = fs.readFileSync(path.join(__dirname, "canva-connector.js"), "utf8");
    assert.ok(!/\bfetch\(|require\(["']https?["']\)/.test(connectorSource));

    // 9. keine Kosten.
    assert.strictEqual(pkg.costPackageStatus, "NOT_BILLABLE_TEST");

    // 10. keine Veröffentlichung.
    assert.strictEqual(handoff.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");

    // 11. kein öffentlicher Link im Handoff-Payload.
    assert.ok(!JSON.stringify(handoff.payload).includes("http"));

    // 12. kein Kunde eingeladen (kein Einladungsfeld/-funktion im gesamten Modul).
    assert.ok(!/invite|einladen/i.test(connectorSource));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// V7.1 Phase C.1.1 – Reviewmodell-Skalierung belässt Health/Fixture unberührt.
// ---------------------------------------------------------------------------

check("C.1.1-15. Health unverändert (Reviewmodell-Module referenzieren Health nicht)", () => {
  ["canva-pilot-result-record.js", "canva-pilot-store.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("health-upgrade-kompass"));
    assert.ok(!/395bf9e0/.test(source));
  });
});

check("C.1.1-16. Fixture unverändert (Reviewmodell-Module referenzieren Fixture nicht)", () => {
  ["canva-pilot-result-record.js", "canva-pilot-store.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.ok(!source.includes("execution-bridge-demo"));
    assert.ok(!/e38c1985/.test(source));
  });
});

check("C.1.1. Reviewmodell-Enums und Agenten-QS-Funktionen sind exportiert", () => {
  const pilot = require("./canva-pilot-result-record");
  assert.ok(pilot.CANVA_PILOT_REVIEW_MODES.includes("CUSTOMER_SELF_REVIEW"));
  assert.ok(pilot.CANVA_PILOT_SERVICE_TIERS.includes("STANDARD"));
  assert.ok(pilot.CANVA_PILOT_QUALITY_REVIEW_STATUSES.includes("AGENT_QA_PASSED"));
  assert.strictEqual(typeof pilot.recordAgentQaResult, "function");
  assert.strictEqual(typeof pilot.recordHumanReview, "function");
  assert.strictEqual(typeof pilot.escalate, "function");
});

console.log(`canva-phase-c-integration.test.js: ${passed} Prüfpunkte erfolgreich`);
