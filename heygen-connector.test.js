"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const heygenJobPackage = require("./heygen-job-package");
const heygenConnector = require("./heygen-connector");
const executionBridge = require("./execution-bridge");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function buildApprovedPackage(overrides = {}) {
  const { package: draft } = heygenJobPackage.prepareHeygenJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    videoType: "AVATAR_VIDEO",
    title: "Café-Testvideo",
    script: "Willkommen in unserem Café. Heute gibt es einen neuen Kaffee.",
    aspectRatio: "9:16",
    durationTargetSeconds: 20,
    avatarReference: { avatarId: "public-demo-avatar-1", visibility: "PUBLIC" },
    dataClassification: "NORMAL",
    sourceRunId: "run-heygen-pilot-1",
    ...overrides,
  });
  const { package: validated } = heygenJobPackage.validateHeygenJobPackageContent(draft);
  const contentApproved = heygenJobPackage.approveContent(validated);
  const transferApproved = heygenJobPackage.approveExternalTransfer(contentApproved);
  const costApproved = heygenJobPackage.setCostApproval(transferApproved, "WITHIN_APPROVED_LIMIT");
  return costApproved;
}

// 26. minimales Payload / 29. keine unnötigen Felder
check("Hand-off-Payload enthält ausschließlich die erlaubten, minimalen Felder", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  assert.strictEqual(tokenResult.ok, true);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  assert.strictEqual(handoff.ok, true);
  const keys = Object.keys(handoff.payload);
  keys.forEach((key) => assert.ok(heygenConnector.HANDOFF_PAYLOAD_ALLOWED_FIELDS.includes(key), `${key} ist nicht in der Allowlist`));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "costCeiling"));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "externalTransferApproved"));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "requestingAgentId"));
});

// 27. keine internen Pfade
check("Hand-off-Payload enthält keine internen Dateipfade", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  const serialized = JSON.stringify(handoff.payload);
  assert.ok(!serialized.includes(__dirname));
  assert.ok(!/\/Users\//.test(serialized));
  assert.ok(!/Application Support/.test(serialized));
});

// 28. keine Secrets
check("Hand-off-Payload enthält keine Zugangsdaten/Secrets", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  const serialized = JSON.stringify(handoff.payload);
  assert.ok(!/apiKey|API_KEY|Bearer|sk-[A-Za-z0-9]/.test(serialized));
});

// 30. nur erlaubte Aktion
check("nur serverautoritativ erlaubte Aktionen sind im Payload enthalten", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  handoff.payload.allowedHeyGenActions.forEach((action) => {
    assert.ok(!heygenJobPackage.HEYGEN_ALWAYS_FORBIDDEN_ACTIONS.includes(action));
  });
  assert.deepStrictEqual(handoff.payload.allowedHeyGenActions, ["GENERATE_AVATAR_VIDEO", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"]);
});

// 31/32/33/34. keine Löschaktion / Avatarerstellung / Voice-Erstellung / Veröffentlichung
check("keine Löschaktion, Avatar-/Voice-Erstellung oder Veröffentlichung ist jemals erlaubt", () => {
  const pkg = buildApprovedPackage();
  const forbidden = ["DELETE_VIDEO", "DELETE_AVATAR", "CREATE_AVATAR", "CLONE_AVATAR", "CREATE_VOICE", "CLONE_VOICE", "PUBLISH_VIDEO"];
  forbidden.forEach((action) => assert.ok(pkg.forbiddenActions.includes(action)));
  assert.throws(() => {
    const tampered = { ...pkg, allowedHeyGenActions: [...pkg.allowedHeyGenActions, "PUBLISH_VIDEO"] };
    const tokenResult = heygenConnector.requestHandoffToken(tampered);
    heygenConnector.prepareHandoffPayload(tampered, tokenResult.token);
  });
});

check("Connector besitzt keine Löschfunktion", () => {
  assert.strictEqual(typeof heygenConnector.deleteVideo, "undefined");
  assert.strictEqual(typeof heygenConnector.deleteAvatar, "undefined");
  assert.strictEqual(typeof heygenConnector.createAvatar, "undefined");
  assert.strictEqual(typeof heygenConnector.cloneVoice, "undefined");
  assert.strictEqual(typeof heygenConnector.publish, "undefined");
});

// 35. Tokenbindung
check("Tokenbindung: Hand-off-Token ist an Paket/Fingerprint/Projekt gebunden", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  assert.strictEqual(tokenResult.ok, true);
  assert.ok(typeof tokenResult.token === "string" && tokenResult.token.length > 0);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  assert.strictEqual(handoff.ok, true);
});

// 36. Token-Reuse blockiert
check("Token-Reuse wird blockiert (einmalig verwendbar)", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  assert.throws(() => heygenConnector.prepareHandoffPayload(pkg, tokenResult.token));
});

// 37. falsches Paket blockiert
check("Token für ein anderes Paket wird blockiert", () => {
  const pkgA = buildApprovedPackage({ sourceRunId: "run-a" });
  const pkgB = buildApprovedPackage({ sourceRunId: "run-b" });
  const tokenResult = heygenConnector.requestHandoffToken(pkgA);
  assert.throws(() => heygenConnector.prepareHandoffPayload(pkgB, tokenResult.token));
});

// 38. falscher Fingerprint blockiert
check("abweichender Fingerprint (Paket nach Tokenanfrage verändert) wird blockiert", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  const tampered = { ...pkg, script: "Ein komplett neuer, anderer Text für das Video." };
  assert.throws(() => heygenConnector.prepareHandoffPayload(tampered, tokenResult.token));
});

// 39. abgelaufenes Paket blockiert
check("abgelaufenes Paket wird auch mit gültigem Token blockiert", () => {
  const pkg = buildApprovedPackage({ expiresAt: new Date(Date.now() + 10_000).toISOString() });
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  assert.strictEqual(tokenResult.ok, true);
  const expiredPkg = { ...pkg, expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.throws(() => heygenConnector.prepareHandoffPayload(expiredPkg, tokenResult.token));
});

check("fehlende Freigaben verhindern bereits die Tokenanfrage", () => {
  const { package: draft } = heygenJobPackage.prepareHeygenJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    videoType: "AVATAR_VIDEO",
    title: "x",
    script: "Ein kurzer Testtext.",
    aspectRatio: "9:16",
    durationTargetSeconds: 10,
    avatarReference: { avatarId: "public-demo-avatar-1", visibility: "PUBLIC" },
  });
  const tokenResult = heygenConnector.requestHandoffToken(draft);
  assert.strictEqual(tokenResult.ok, false);
  assert.ok(tokenResult.missing.length > 0);
});

// 40. keine automatische Ausführung
check("keine automatische Ausführung: Connector führt keinen Netzwerkaufruf aus", () => {
  const source = fs.readFileSync(path.join(__dirname, "heygen-connector.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
  assert.ok(!/\.request\(/.test(source));
});

check("Hand-off setzt executionStarted/externalNetworkCallMade/costIncurred/publicationTriggered explizit auf false", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = heygenConnector.requestHandoffToken(pkg);
  const handoff = heygenConnector.prepareHandoffPayload(pkg, tokenResult.token);
  assert.strictEqual(handoff.executionStarted, false);
  assert.strictEqual(handoff.externalNetworkCallMade, false);
  assert.strictEqual(handoff.costIncurred, false);
  assert.strictEqual(handoff.publicationTriggered, false);
});

// Zusätzliche strukturelle Prüfungen (Abschnitt K – Pilotstatus additiv, Phase A unverändert)
check("Pilotstatus behauptet niemals DIRECT oder autonome Verbindung", () => {
  const status = heygenConnector.buildHeygenPilotStatus();
  assert.notStrictEqual(status.pilotExecutionMode, "DIRECT");
  assert.strictEqual(status.directOrAutonomousConnection, false);
  assert.strictEqual(status.publicationApproved, false);
});

check("Pilotstatus verändert nicht die Phase-A-Basiswahrheit (weiterhin REGISTERED/RECOMMENDATION_ONLY)", () => {
  const status = heygenConnector.buildHeygenPilotStatus();
  assert.strictEqual(status.baseStatus, "REGISTERED");
  assert.strictEqual(status.baseAdapterType, "RECOMMENDATION_ONLY");
});

check("Ergebnis-Token-Rundlauf: gültiges Ergebnis wird nach Tokenprüfung validiert", () => {
  const resultCandidate = {
    jobPackageId: "heygen-job-xyz",
    providerJobId: "hg-999",
    status: "SUCCEEDED",
    videoReference: "https://files.heygen.example/output/video.mp4",
  };
  const tokenResult = heygenConnector.requestResultValidationToken({
    jobPackageId: "heygen-job-xyz",
    providerJobId: "hg-999",
    resultCandidate,
  });
  assert.strictEqual(tokenResult.ok, true);
  const validated = heygenConnector.validateHandoffResult(tokenResult.token, resultCandidate);
  assert.strictEqual(validated.ok, true);
  assert.strictEqual(validated.result.locallyVerifiedSuccess, true);
});

check("Ergebnis-Token ist einmalig (Reuse blockiert)", () => {
  const resultCandidate = {
    jobPackageId: "heygen-job-reuse",
    providerJobId: "hg-reuse",
    status: "PROCESSING",
  };
  const tokenResult = heygenConnector.requestResultValidationToken({
    jobPackageId: "heygen-job-reuse",
    providerJobId: "hg-reuse",
    resultCandidate,
  });
  heygenConnector.validateHandoffResult(tokenResult.token, resultCandidate);
  assert.throws(() => heygenConnector.validateHandoffResult(tokenResult.token, resultCandidate));
});

// ---------------------------------------------------------------------------
// V7.1 Phase B.1 (Auftrag Abschnitt F) – Agentur-Connectorbetrieb.
// ---------------------------------------------------------------------------

check("Agentur-Connectorbetrieb: Kunden erhalten keinen HeyGen-Login und keine Kontodaten", () => {
  const model = heygenConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.customerHasHeyGenLogin, false);
  assert.strictEqual(model.customerCanTriggerRender, false);
  assert.strictEqual(model.customerCanPublish, false);
  assert.strictEqual(model.providerCredentialsExposedToCustomer, false);
  assert.strictEqual(model.personalAccountDataExposedToCustomer, false);
});

check("Agentur-Connectorbetrieb bleibt CONTROLLED_HANDOFF, intern und nicht öffentlich erreichbar", () => {
  const model = heygenConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.connectorMode, "CONTROLLED_HANDOFF");
  assert.strictEqual(model.connectorVisibility, "INTERNAL_ONLY");
  assert.strictEqual(model.connectorPubliclyReachable, false);
});

check("Agentur-Connectorbetrieb legt keine echten HeyGen-Ordner oder Sub-Workspaces an", () => {
  const model = heygenConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.providerFolderStrategy, "PLANNED_NOT_YET_CREATED");
  assert.strictEqual(model.noRealHeyGenFolderCreatedInThisPhase, true);
  assert.strictEqual(model.noSubWorkspaceCreatedInThisPhase, true);
  assert.strictEqual(model.noConnectorActionExecuted, true);
});

check("Capability-Antwort enthält additiv das Agentur-Betriebsmodell, ohne die Basiswahrheit zu verändern", () => {
  const response = heygenConnector.buildHeygenCapabilityResponse();
  assert.ok(response.agencyConnectorOperatingModel);
  assert.strictEqual(response.agencyConnectorOperatingModel.customerHasHeyGenLogin, false);
  assert.strictEqual(response.pilotStatus.directOrAutonomousConnection, false);
});

console.log(`heygen-connector.test.js: ${passed} Prüfpunkte erfolgreich`);
