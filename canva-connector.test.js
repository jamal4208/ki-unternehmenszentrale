"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const canvaDesignJobPackage = require("./canva-design-job-package");
const canvaConnector = require("./canva-connector");
const executionBridge = require("./execution-bridge");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function buildApprovedPackage(overrides = {}) {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "Café-Sonntagsfrühstück-Post",
    brief: "Ein freundlicher Instagram-Post für das Sonntagsfrühstück im fiktiven Café.",
    primaryMessage: "Genießen Sie unser Sonntagsfrühstück!",
    dataClassification: "NORMAL",
    brandRightsConfirmed: true,
    sourceRunId: "run-canva-pilot-1",
    ...overrides,
  });
  const { package: validated } = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(draft);
  const briefingApproved = canvaDesignJobPackage.approveBriefingAndText(validated);
  const assetsApproved = canvaDesignJobPackage.approveAssetsAndRights(briefingApproved);
  const transferApproved = canvaDesignJobPackage.approveExternalTransfer(assetsApproved);
  const costApproved = canvaDesignJobPackage.setInternalCostApproval(transferApproved, "WITHIN_APPROVED_LIMIT");
  return costApproved;
}

// 37. minimales Payload / 40. keine unnötigen Felder
check("Hand-off-Payload enthält ausschließlich die erlaubten, minimalen Felder", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  assert.strictEqual(tokenResult.ok, true);
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  assert.strictEqual(handoff.ok, true);
  const keys = Object.keys(handoff.payload);
  keys.forEach((key) => assert.ok(canvaConnector.HANDOFF_PAYLOAD_ALLOWED_FIELDS.includes(key), `${key} ist nicht in der Allowlist`));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "internalCostCeiling"));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "externalTransferApproved"));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "requestingAgentId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(handoff.payload, "customerId"));
});

// 38. keine internen Pfade
check("Hand-off-Payload enthält keine internen Dateipfade", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  const serialized = JSON.stringify(handoff.payload);
  assert.ok(!serialized.includes(__dirname));
  assert.ok(!/\/Users\//.test(serialized));
  assert.ok(!/Application Support/.test(serialized));
});

// 39. keine Credentials
check("Hand-off-Payload enthält keine Zugangsdaten/Secrets", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  const serialized = JSON.stringify(handoff.payload);
  assert.ok(!/apiKey|API_KEY|Bearer|sk-[A-Za-z0-9]/.test(serialized));
});

// 41. nur erlaubte Operation
check("nur serverautoritativ erlaubte Aktionen sind im Payload enthalten", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  handoff.payload.allowedCanvaActions.forEach((action) => {
    assert.ok(!canvaDesignJobPackage.CANVA_ALWAYS_FORBIDDEN_ACTIONS.includes(action));
  });
  assert.deepStrictEqual(handoff.payload.allowedCanvaActions, ["GENERATE_DESIGN_CANDIDATES", "CREATE_SELECTED_CANDIDATE"]);
  assert.strictEqual(handoff.payload.providerOperation, "GENERATE_DESIGN_CANDIDATES");
});

check("ein nicht für den ersten Pilot vorgesehenes designOperation/Hand-off wird bereits bei der Tokenanfrage blockiert", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "CREATE_FROM_BRAND_TEMPLATE",
    designType: "INSTAGRAM_POST",
    title: "x",
    brief: "Test",
    primaryMessage: "Test",
    brandRightsConfirmed: true,
    brandTemplateReference: { templateId: "tpl-1", confirmedSelected: true },
  });
  const tokenResult = canvaConnector.requestHandoffToken(draft, "SEARCH_BRAND_TEMPLATES");
  assert.strictEqual(tokenResult.ok, false);
});

// 42/43/44/45. kein Veröffentlichen, kein öffentliches Teilen, keine Einladung, keine Löschung
check("keine Veröffentlichungs-, Teilungs-, Einladungs- oder Löschaktion ist jemals erlaubt", () => {
  const pkg = buildApprovedPackage();
  const forbidden = ["PUBLISH_DESIGN", "SHARE_PUBLICLY", "INVITE_CUSTOMER", "INVITE_TEAM_MEMBER", "DELETE_DESIGN", "PURCHASE_CREDITS"];
  forbidden.forEach((action) => assert.ok(pkg.forbiddenActions.includes(action)));
  assert.throws(() => {
    const tampered = { ...pkg, allowedCanvaActions: [...pkg.allowedCanvaActions, "PUBLISH_DESIGN"] };
    const tokenResult = canvaConnector.requestHandoffToken(tampered, "PUBLISH_DESIGN");
    canvaConnector.prepareHandoffPayload(tampered, "PUBLISH_DESIGN", tokenResult.token);
  });
});

check("Connector besitzt keine Lösch-, Veröffentlichungs- oder Einladungsfunktion", () => {
  assert.strictEqual(typeof canvaConnector.deleteDesign, "undefined");
  assert.strictEqual(typeof canvaConnector.publish, "undefined");
  assert.strictEqual(typeof canvaConnector.inviteCustomer, "undefined");
  assert.strictEqual(typeof canvaConnector.shareDesign, "undefined");
});

// 46. keine automatische Ausführung
check("keine automatische Ausführung: Connector führt keinen Netzwerkaufruf aus", () => {
  const source = fs.readFileSync(path.join(__dirname, "canva-connector.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
  assert.ok(!/\.request\(/.test(source));
});

check("Hand-off setzt executionStarted/externalNetworkCallMade/costIncurred/publicationTriggered explizit auf false", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  assert.strictEqual(handoff.executionStarted, false);
  assert.strictEqual(handoff.externalNetworkCallMade, false);
  assert.strictEqual(handoff.costIncurred, false);
  assert.strictEqual(handoff.publicationTriggered, false);
});

// 47. Tokenbindung
check("Tokenbindung: Hand-off-Token ist an Paket/Fingerprint/Projekt/Aktion gebunden", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  assert.strictEqual(tokenResult.ok, true);
  assert.ok(typeof tokenResult.token === "string" && tokenResult.token.length > 0);
  const handoff = canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  assert.strictEqual(handoff.ok, true);
});

// 48. Token-Reuse blockiert
check("Token-Reuse wird blockiert (einmalig verwendbar)", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token);
  assert.throws(() => canvaConnector.prepareHandoffPayload(pkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token));
});

check("ein Token für eine Aktion kann nicht für eine andere Aktion eingelöst werden", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  assert.throws(() => canvaConnector.prepareHandoffPayload(pkg, "CREATE_SELECTED_CANDIDATE", tokenResult.token));
});

check("Token für ein anderes Paket wird blockiert (49. falscher Mandant/Paket blockiert)", () => {
  const pkgA = buildApprovedPackage({ sourceRunId: "run-a" });
  const pkgB = buildApprovedPackage({ sourceRunId: "run-b" });
  const tokenResult = canvaConnector.requestHandoffToken(pkgA, "GENERATE_DESIGN_CANDIDATES");
  assert.throws(() => canvaConnector.prepareHandoffPayload(pkgB, "GENERATE_DESIGN_CANDIDATES", tokenResult.token));
});

// 49. falscher Fingerprint blockiert
check("abweichender Fingerprint (Paket nach Tokenanfrage verändert) wird blockiert", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  const tampered = { ...pkg, brief: "Ein komplett neuer, anderer Text für den Post." };
  assert.throws(() => canvaConnector.prepareHandoffPayload(tampered, "GENERATE_DESIGN_CANDIDATES", tokenResult.token));
});

check("abgelaufenes Paket wird auch mit gültigem Token blockiert", () => {
  const pkg = buildApprovedPackage({ expiresAt: new Date(Date.now() + 10_000).toISOString() });
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "GENERATE_DESIGN_CANDIDATES");
  assert.strictEqual(tokenResult.ok, true);
  const expiredPkg = { ...pkg, expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.throws(() => canvaConnector.prepareHandoffPayload(expiredPkg, "GENERATE_DESIGN_CANDIDATES", tokenResult.token));
});

check("fehlende Freigaben verhindern bereits die Tokenanfrage", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "x",
    brief: "Ein kurzer Testtext.",
    primaryMessage: "Test",
    brandRightsConfirmed: true,
  });
  const tokenResult = canvaConnector.requestHandoffToken(draft, "GENERATE_DESIGN_CANDIDATES");
  assert.strictEqual(tokenResult.ok, false);
  assert.ok(tokenResult.missing.length > 0);
});

// ---------------------------------------------------------------------------
// Kandidatenlogik (Pflichttests 54-57).
// ---------------------------------------------------------------------------

function buildCandidatesResult(pkg, overrides = {}) {
  return {
    jobPackageId: pkg.jobPackageId,
    customerId: pkg.customerId,
    candidateIds: ["cand-1", "cand-2", "cand-3"],
    resultFingerprint: "fp-candidates-1",
    ...overrides,
  };
}

// 57. CREATE_SELECTED_CANDIDATE erst nach Auswahlfreigabe.
check("CREATE_SELECTED_CANDIDATE ist erst nach Kandidatenauswahlfreigabe möglich", () => {
  const pkg = buildApprovedPackage();
  const tokenResult = canvaConnector.requestHandoffToken(pkg, "CREATE_SELECTED_CANDIDATE");
  assert.strictEqual(tokenResult.ok, false);
  assert.ok(tokenResult.missing.some((m) => /Designkandidat/.test(m)));
});

// 55. unbekannter Kandidat blockiert.
check("unbekannter Kandidat blockiert die Auswahlfreigabe-Tokenanfrage", () => {
  const pkg = buildApprovedPackage();
  const candidatesResult = buildCandidatesResult(pkg);
  assert.throws(() => canvaConnector.requestCandidateApprovalToken(pkg, candidatesResult, "cand-unbekannt"));
});

// 56. Kandidat bleibt mandantengebunden.
check("Kandidatenergebnis eines anderen Mandanten wird abgewiesen", () => {
  const pkg = buildApprovedPackage();
  const foreignCandidatesResult = buildCandidatesResult(pkg, { customerId: "test-customer-fiktives-fitnessstudio" });
  assert.throws(() => canvaConnector.requestCandidateApprovalToken(pkg, foreignCandidatesResult, "cand-1"));
});

// 54. Auswahl separat.
check("Kandidatenauswahl ist ein eigener, getrennter Freigabeschritt mit eigenem Token", () => {
  const pkg = buildApprovedPackage();
  const candidatesResult = buildCandidatesResult(pkg);
  const approvalToken = canvaConnector.requestCandidateApprovalToken(pkg, candidatesResult, "cand-2");
  assert.strictEqual(approvalToken.ok, true);
  const updatedPkg = canvaConnector.approveCandidateSelection(pkg, candidatesResult, "cand-2", approvalToken.token);
  assert.strictEqual(updatedPkg.selectedCandidateId, "cand-2");
  assert.strictEqual(updatedPkg.status, "CANDIDATES_READY");

  // Erst jetzt ist CREATE_SELECTED_CANDIDATE möglich.
  const handoffTokenResult = canvaConnector.requestHandoffToken(updatedPkg, "CREATE_SELECTED_CANDIDATE");
  assert.strictEqual(handoffTokenResult.ok, true);
  const handoff = canvaConnector.prepareHandoffPayload(updatedPkg, "CREATE_SELECTED_CANDIDATE", handoffTokenResult.token);
  assert.strictEqual(handoff.payload.selectedCandidateId, "cand-2");
});

check("Kandidatenfreigabe-Token ist einmalig (Reuse blockiert)", () => {
  const pkg = buildApprovedPackage();
  const candidatesResult = buildCandidatesResult(pkg);
  const approvalToken = canvaConnector.requestCandidateApprovalToken(pkg, candidatesResult, "cand-1");
  canvaConnector.approveCandidateSelection(pkg, candidatesResult, "cand-1", approvalToken.token);
  assert.throws(() => canvaConnector.approveCandidateSelection(pkg, candidatesResult, "cand-1", approvalToken.token));
});

// ---------------------------------------------------------------------------
// Editing-Transaktionslogik (Pflichttests 58-66). Wird im ersten realen
// Pilot nicht ausgeführt, aber vollständig modelliert und getestet.
// ---------------------------------------------------------------------------

function baseTransactionInput(overrides = {}) {
  return {
    designId: "design-abc",
    jobPackageId: "canva-job-edit-1",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    ...overrides,
  };
}

// 58. gültige Design-ID erforderlich.
check("eine Bearbeitungstransaktion erfordert eine gültige Design-ID", () => {
  assert.throws(() => canvaConnector.startEditingTransaction(baseTransactionInput({ designId: "" })));
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  assert.strictEqual(record.status, "STARTED");
});

// 59. Transaktion separat (eigene ID, unabhängig vom Design).
check("jede Editing-Transaktion erhält eine eigene, separate ID", () => {
  const recordA = canvaConnector.startEditingTransaction(baseTransactionInput());
  const recordB = canvaConnector.startEditingTransaction(baseTransactionInput());
  assert.notStrictEqual(recordA.editingTransactionId, recordB.editingTransactionId);
});

// 60. Edit-Operationen fingerprintgebunden.
check("Edit-Operationen sind fingerprintgebunden; neue Operationen entwerten eine Vorschau", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT", target: "headline", value: "Neu" }]);
  assert.strictEqual(applied.status, "OPERATIONS_APPLIED");
  assert.notStrictEqual(applied.operationsFingerprint, record.operationsFingerprint);
  const withPreview = canvaConnector.registerEditPreview(applied, "https://static.canva.example/preview.png");
  assert.strictEqual(withPreview.status, "PREVIEW_READY");
  const reApplied = canvaConnector.applyEditOperations(withPreview, [{ op: "REPLACE_TEXT", target: "headline", value: "Neu2" }]);
  assert.strictEqual(reApplied.previewReference, null);
});

// 61. Vorschau ist nicht gespeichert.
check("Vorschau ist ausdrücklich nicht gespeichert (Status bleibt PREVIEW_READY)", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT" }]);
  const withPreview = canvaConnector.registerEditPreview(applied, "https://static.canva.example/preview.png");
  assert.strictEqual(withPreview.status, "PREVIEW_READY");
  assert.notStrictEqual(withPreview.status, "SAVED");
  assert.notStrictEqual(withPreview.status, "COMMITTED");
});

// 62. Save-Freigabe separat / 63. kein Auto-Commit.
check("Speicherfreigabe ist ein eigener, getrennter Schritt; ohne Token kein Commit", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT" }]);
  const withPreview = canvaConnector.registerEditPreview(applied, "https://static.canva.example/preview.png");
  assert.throws(() => canvaConnector.commitEditingTransaction(withPreview, "kein-gueltiger-token"));
  const saveToken = canvaConnector.requestSaveToken(withPreview);
  assert.strictEqual(saveToken.ok, true);
  const committed = canvaConnector.commitEditingTransaction(withPreview, saveToken.token);
  assert.strictEqual(committed.ok, true);
  assert.strictEqual(committed.transaction.status, "COMMITTED");
  assert.strictEqual(committed.savedNow, true);
});

check("Save-Token ist einmalig (Reuse blockiert)", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT" }]);
  const withPreview = canvaConnector.registerEditPreview(applied, "https://static.canva.example/preview.png");
  const saveToken = canvaConnector.requestSaveToken(withPreview);
  canvaConnector.commitEditingTransaction(withPreview, saveToken.token);
  assert.throws(() => canvaConnector.commitEditingTransaction(withPreview, saveToken.token));
});

// 64. Cancel verwirft Draft.
check("Abbruch verwirft die Transaktion kontrolliert", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT" }]);
  const cancelled = canvaConnector.cancelEditingTransaction(applied);
  assert.strictEqual(cancelled.status, "CANCELLED");
  assert.deepStrictEqual(cancelled.operations, []);
  assert.throws(() => canvaConnector.cancelEditingTransaction(cancelled));
});

// 65. falsche Transaktion blockiert.
check("ein Save-Token für eine Transaktion kann nicht für eine andere Transaktion eingelöst werden", () => {
  const recordA = canvaConnector.startEditingTransaction(baseTransactionInput());
  const appliedA = canvaConnector.applyEditOperations(recordA, [{ op: "REPLACE_TEXT" }]);
  const previewA = canvaConnector.registerEditPreview(appliedA, "https://static.canva.example/preview-a.png");
  const saveTokenA = canvaConnector.requestSaveToken(previewA);

  const recordB = canvaConnector.startEditingTransaction(baseTransactionInput({ designId: "design-def" }));
  const appliedB = canvaConnector.applyEditOperations(recordB, [{ op: "REPLACE_TEXT" }]);
  const previewB = canvaConnector.registerEditPreview(appliedB, "https://static.canva.example/preview-b.png");

  assert.throws(() => canvaConnector.commitEditingTransaction(previewB, saveTokenA.token));
});

// 66. Mandantenwechsel blockiert.
check("ein Mandantenwechsel zwischen Tokenanfrage und Commit macht den Save-Token ungültig", () => {
  const record = canvaConnector.startEditingTransaction(baseTransactionInput());
  const applied = canvaConnector.applyEditOperations(record, [{ op: "REPLACE_TEXT" }]);
  const withPreview = canvaConnector.registerEditPreview(applied, "https://static.canva.example/preview.png");
  const saveToken = canvaConnector.requestSaveToken(withPreview);
  const tenantSwitched = { ...withPreview, customerId: "test-customer-fiktives-fitnessstudio" };
  assert.throws(() => canvaConnector.commitEditingTransaction(tenantSwitched, saveToken.token));
});

// ---------------------------------------------------------------------------
// Ergebnis-Token-Rundlauf.
// ---------------------------------------------------------------------------

check("Ergebnis-Token-Rundlauf: gültiges Ergebnis wird nach Tokenprüfung validiert", () => {
  const resultCandidate = {
    jobPackageId: "canva-job-xyz",
    providerJobId: "cv-999",
    providerOperation: "GENERATE_DESIGN_CANDIDATES",
    providerStatus: "CANDIDATES_READY",
    candidateIds: ["c-1", "c-2"],
  };
  const tokenResult = canvaConnector.requestResultValidationToken({
    jobPackageId: "canva-job-xyz",
    providerJobId: "cv-999",
    resultCandidate,
  });
  assert.strictEqual(tokenResult.ok, true);
  const validated = canvaConnector.validateHandoffResult(tokenResult.token, resultCandidate);
  assert.strictEqual(validated.ok, true);
  assert.strictEqual(validated.result.locallyVerifiedSuccess, true);
});

check("Ergebnis-Token ist einmalig (Reuse blockiert)", () => {
  const resultCandidate = {
    jobPackageId: "canva-job-reuse",
    providerJobId: "cv-reuse",
    providerOperation: "GENERATE_DESIGN_CANDIDATES",
    providerStatus: "PROCESSING",
  };
  const tokenResult = canvaConnector.requestResultValidationToken({
    jobPackageId: "canva-job-reuse",
    providerJobId: "cv-reuse",
    resultCandidate,
  });
  canvaConnector.validateHandoffResult(tokenResult.token, resultCandidate);
  assert.throws(() => canvaConnector.validateHandoffResult(tokenResult.token, resultCandidate));
});

// ---------------------------------------------------------------------------
// Pilotstatus (additiv, Phase A unverändert).
// ---------------------------------------------------------------------------

check("Pilotstatus behauptet niemals DIRECT oder autonome Verbindung", () => {
  const status = canvaConnector.buildCanvaPilotStatus();
  assert.notStrictEqual(status.pilotExecutionMode, "DIRECT");
  assert.strictEqual(status.directOrAutonomousConnection, false);
  assert.strictEqual(status.publicationApproved, false);
});

check("Pilotstatus verändert nicht die Phase-A-Basiswahrheit (weiterhin REGISTERED/RECOMMENDATION_ONLY/NOT_CONNECTED)", () => {
  const status = canvaConnector.buildCanvaPilotStatus();
  assert.strictEqual(status.baseStatus, "REGISTERED");
  assert.strictEqual(status.baseAdapterType, "RECOMMENDATION_ONLY");
  assert.strictEqual(status.baseConnectionStatus, "NOT_CONNECTED");
});

check("additiver Pilotstatus zeigt PARTIALLY_CONNECTED/CONTROLLED_HANDOFF", () => {
  const status = canvaConnector.buildCanvaPilotStatus();
  assert.strictEqual(status.pilotConnectionStatus, "PARTIALLY_CONNECTED");
  assert.strictEqual(status.pilotExecutionMode, "CONTROLLED_HANDOFF");
});

// ---------------------------------------------------------------------------
// Agentur-Connectorbetrieb (Auftrag Abschnitt J).
// ---------------------------------------------------------------------------

check("Agentur-Connectorbetrieb: Kunden erhalten keinen Canva-Login und keine Kontodaten", () => {
  const model = canvaConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.customerHasCanvaLogin, false);
  assert.strictEqual(model.customerCanTriggerGeneration, false);
  assert.strictEqual(model.customerCanSave, false);
  assert.strictEqual(model.customerCanPublish, false);
  assert.strictEqual(model.providerCredentialsExposedToCustomer, false);
  assert.strictEqual(model.personalAccountDataExposedToCustomer, false);
});

check("Agentur-Connectorbetrieb bleibt CONTROLLED_HANDOFF, intern und nicht öffentlich erreichbar", () => {
  const model = canvaConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.connectorMode, "CONTROLLED_HANDOFF");
  assert.strictEqual(model.connectorVisibility, "INTERNAL_ONLY");
  assert.strictEqual(model.connectorPubliclyReachable, false);
});

check("Agentur-Connectorbetrieb legt keine echten Canva-Ordner an", () => {
  const model = canvaConnector.buildAgencyConnectorOperatingModel();
  assert.strictEqual(model.canvaFolderStrategy, "PLANNED_NOT_YET_CREATED");
  assert.strictEqual(model.noRealCanvaFolderCreatedInThisPhase, true);
  assert.strictEqual(model.noConnectorActionExecuted, true);
});

check("Capability-Antwort enthält additiv das Agentur-Betriebsmodell, ohne die Basiswahrheit zu verändern", () => {
  const response = canvaConnector.buildCanvaCapabilityResponse();
  assert.ok(response.agencyConnectorOperatingModel);
  assert.strictEqual(response.agencyConnectorOperatingModel.customerHasCanvaLogin, false);
  assert.strictEqual(response.pilotStatus.directOrAutonomousConnection, false);
  assert.strictEqual(response.noApiKeyStored, true);
  assert.strictEqual(response.noAutomaticExecution, true);
});

console.log(`canva-connector.test.js: ${passed} Prüfpunkte erfolgreich`);
