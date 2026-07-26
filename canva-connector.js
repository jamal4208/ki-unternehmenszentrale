"use strict";

// V7.1 Phase C – kontrollierter Canva-Connector-Adapter
// (CONTROLLED_CONNECTOR_HANDOFF, siehe Auftrag Abschnitt G).
//
// Dieser Adapter ist AUSDRÜCKLICH KEIN direkter HTTP-Client mit API-Key. Er
// validiert ein bestehendes canvaDesignJobPackage, prüft Freigaben,
// Fingerprint und Ablaufzeit, und erzeugt ausschließlich ein minimales,
// kopier- bzw. connectorfähiges Hand-off-Payload. Die tatsächliche
// Canva-Aktion läuft – falls überhaupt – über den vorhandenen,
// authentifizierten Canva-Connector außerhalb dieses lokalen Node-Servers.
// Dieses Modul selbst enthält keinen Netzwerkaufruf (kein http/https/fetch),
// keine Zugangsdaten und keine Speicherung von Secrets.
//
// Tokenarchitektur: es wird bewusst KEINE zweite Token-Wahrheit eingeführt.
// Hand-off-Token (PREPARE_CANVA_HANDOFF), Kandidatenfreigabe-Token
// (APPROVE_CANVA_CANDIDATE), Ergebnis-Token (VALIDATE_CANVA_RESULT) und
// Speicherfreigabe-Token (APPROVE_CANVA_SAVE) nutzen ausschließlich die
// bestehenden, RAM-only, einmaligen Tokens aus execution-bridge.js
// (mintToken/consumeToken). execution-bridge.js selbst wird von diesem
// Modul nur gelesen (require), niemals verändert.

const crypto = require("crypto");

const executionBridge = require("./execution-bridge");
const canvaDesignJobPackage = require("./canva-design-job-package");
const canvaDesignResult = require("./canva-design-result");
const pluginGateway = require("./plugin-gateway");
const toolRegistry = require("./tool-registry");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function computeOperationsFingerprint(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || null)).digest("hex");
}

// ---------------------------------------------------------------------------
// Minimales Hand-off-Payload (Auftrag Abschnitt G) – strikte Allowlist.
// Enthält ausschließlich die für die jeweilige Canva-Aktion notwendigen
// Felder; keine internen Pfade, keine App-Support-Pfade, keine
// vollständigen Projektakten, keine Secrets, keine Governance-/
// Freigabefelder außer den zur Ausführung notwendigen.
// ---------------------------------------------------------------------------

const HANDOFF_PAYLOAD_ALLOWED_FIELDS = Object.freeze([
  "jobPackageId",
  "providerOperation",
  "designType",
  "title",
  "brief",
  "primaryMessage",
  "callToAction",
  "targetAudience",
  "tone",
  "language",
  "dimensions",
  "textContent",
  "visualDirection",
  "requiredPages",
  "selectedCandidateId",
  "allowedCanvaActions",
  "forbiddenActions",
  "packageFingerprint",
  "expiresAt",
]);

function buildMinimalHandoffPayload(pkg, providerOperation) {
  const payload = {};
  HANDOFF_PAYLOAD_ALLOWED_FIELDS.forEach((field) => {
    if (field === "providerOperation") {
      payload.providerOperation = providerOperation;
      return;
    }
    payload[field] = pkg[field] !== undefined ? pkg[field] : null;
  });
  return payload;
}

function assertOnlyAllowedAction(pkg, providerOperation) {
  if (canvaDesignJobPackage.CANVA_ALWAYS_FORBIDDEN_ACTIONS.includes(providerOperation)) {
    throw new Error(`Aktion "${providerOperation}" ist grundsätzlich verboten (Veröffentlichung/Teilen/Einladung/Löschung/Kauf).`);
  }
  if (!canvaDesignJobPackage.CANVA_HANDOFF_ACTIONS.includes(providerOperation)) {
    throw new Error(`Aktion "${providerOperation}" ist keine bekannte Canva-Hand-off-Aktion.`);
  }
  if (!Array.isArray(pkg.allowedCanvaActions) || !pkg.allowedCanvaActions.includes(providerOperation)) {
    throw new Error(`Aktion "${providerOperation}" ist für designOperation "${pkg.designOperation}" nicht zulässig.`);
  }
  if (!canvaDesignJobPackage.CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS.includes(providerOperation)) {
    throw new Error(
      `Aktion "${providerOperation}" ist im ersten Pilot nicht vorgesehen (nur ${canvaDesignJobPackage.CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS.join(", ")}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Abschnitt L – Hand-off-Token. Bindet an: action, projectId (im vorhandenen
// Feld targetRepositoryIdentity, zusätzlich um providerOperation ergänzt,
// damit ein für eine Aktion ausgestellter Token nicht für eine andere Aktion
// eingelöst werden kann), sourceRunId (im vorhandenen Feld runId),
// jobPackageId (im vorhandenen Feld executionPackageId), packageFingerprint
// (im vorhandenen Feld fingerprint). customerId/brandId/campaignId/
// costCeiling sind bereits Bestandteil des Fingerprints (siehe
// canva-design-job-package.js), eine Änderung daran ändert daher
// automatisch den Fingerprint und macht den Token ungültig. Es entsteht
// bewusst keine zweite, parallele Token-Speicherstruktur.
// ---------------------------------------------------------------------------

function tokenBindingForPackage(pkg, providerOperation) {
  return {
    action: "PREPARE_CANVA_HANDOFF",
    runId: pkg.sourceRunId || pkg.jobPackageId,
    executionPackageId: pkg.jobPackageId,
    fingerprint: pkg.packageFingerprint,
    targetRepositoryIdentity: `${pkg.projectId}::${providerOperation}`,
  };
}

function requestHandoffToken(pkgInput, providerOperation, options = {}) {
  const pkg = clone(pkgInput);
  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness(pkg, options);
  if (!readiness.ready) {
    return {
      ok: false,
      reason: "Handoff-Voraussetzungen nicht erfüllt.",
      missing: readiness.missing,
      noAutomaticExecution: true,
    };
  }
  try {
    assertOnlyAllowedAction(pkg, providerOperation);
  } catch (error) {
    return { ok: false, reason: error.message, missing: [], noAutomaticExecution: true };
  }
  // Freigabestufe 6 (Auftrag Abschnitt F/H): CREATE_SELECTED_CANDIDATE ist
  // erst nach einer separaten, bereits erteilten Kandidatenauswahlfreigabe
  // zulässig – niemals aus GENERATE_DESIGN_CANDIDATES automatisch.
  if (providerOperation === "CREATE_SELECTED_CANDIDATE" && !pkg.selectedCandidateId) {
    return {
      ok: false,
      reason: "Kein ausgewählter Kandidat. Zuerst einen Designkandidaten auswählen und freigeben (approveCandidateSelection).",
      missing: ["Designkandidat auswählen"],
      noAutomaticExecution: true,
    };
  }
  const token = executionBridge.mintToken(tokenBindingForPackage(pkg, providerOperation), { ttlMs: options.ttlMs });
  return {
    ok: true,
    token,
    action: "PREPARE_CANVA_HANDOFF",
    providerOperation,
    expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS,
    noAutomaticExecution: true,
  };
}

// ---------------------------------------------------------------------------
// Hand-off-Vorbereitung. Verbraucht den Token EINMALIG, prüft erneut
// Fingerprint/Ablaufzeit/Freigaben (Schutz gegen Veränderung zwischen
// Tokenanfrage und Einlösung) und liefert ausschließlich das minimale
// Payload zurück. Startet KEINE HTTP-Anfrage, KEINE Canva-Ausführung.
// ---------------------------------------------------------------------------

function prepareHandoffPayload(pkgInput, providerOperation, token, options = {}) {
  const pkg = clone(pkgInput);

  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness(pkg, options);
  if (!readiness.ready) {
    throw new Error("Handoff-Voraussetzungen sind nicht mehr erfüllt (Paket wurde verändert oder ist abgelaufen).");
  }
  assertOnlyAllowedAction(pkg, providerOperation);
  if (providerOperation === "CREATE_SELECTED_CANDIDATE" && !pkg.selectedCandidateId) {
    throw new Error("Kein ausgewählter Kandidat. Kandidatenauswahl ist eine eigene, vorgelagerte Freigabe.");
  }
  if (canvaDesignJobPackage.isPublicationApproved(pkg)) {
    throw new Error("Veröffentlichung ist in Phase C nicht freigegeben; kein Hand-off möglich.");
  }

  const consumeResult = executionBridge.consumeToken(token, tokenBindingForPackage(pkg, providerOperation));
  if (!consumeResult.ok) {
    throw new Error(`Hand-off-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }

  const payload = buildMinimalHandoffPayload(pkg, providerOperation);
  return {
    ok: true,
    payload,
    handedOffAt: nowIso(options.now),
    package: { ...pkg, status: "HANDED_OFF" },
    executionStarted: false,
    externalNetworkCallMade: false,
    costIncurred: false,
    publicationTriggered: false,
    noAutomaticExecution: true,
  };
}

// ---------------------------------------------------------------------------
// Abschnitt F/H – Kandidatenlogik. Ein generierter Kandidat ist noch kein
// dauerhaft gespeichertes, bearbeitbares Design (Auftrag Abschnitt C/H).
// Die Auswahl ist eine eigene, getrennte Freigabestufe (6) mit eigenem
// Token – niemals automatisch aus der Kandidatengenerierung abgeleitet.
// ---------------------------------------------------------------------------

function candidateApprovalTokenBinding({ jobPackageId, candidateId, candidatesFingerprint }) {
  return {
    action: "APPROVE_CANVA_CANDIDATE",
    executionPackageId: jobPackageId,
    fingerprint: candidatesFingerprint,
    targetRepositoryIdentity: candidateId,
  };
}

function assertCandidateBelongsToResult(pkg, candidatesResult, candidateId) {
  if (!candidatesResult || candidatesResult.jobPackageId !== pkg.jobPackageId) {
    throw new Error("Kandidatenergebnis gehört nicht zu diesem Auftragspaket.");
  }
  if (candidatesResult.customerId && candidatesResult.customerId !== pkg.customerId) {
    throw new Error("Kandidatenergebnis ist einem anderen Mandanten zugeordnet.");
  }
  if (!Array.isArray(candidatesResult.candidateIds) || !candidatesResult.candidateIds.includes(candidateId)) {
    throw new Error(`Unbekannter Kandidat "${candidateId}".`);
  }
}

function requestCandidateApprovalToken(pkg, candidatesResult, candidateId, options = {}) {
  assertCandidateBelongsToResult(pkg, candidatesResult, candidateId);
  const token = executionBridge.mintToken(
    candidateApprovalTokenBinding({
      jobPackageId: pkg.jobPackageId,
      candidateId,
      candidatesFingerprint: candidatesResult.resultFingerprint,
    }),
    { ttlMs: options.ttlMs },
  );
  return {
    ok: true,
    token,
    action: "APPROVE_CANVA_CANDIDATE",
    candidateId,
    expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS,
  };
}

// Auswahl ist strukturell getrennt von der Kandidatengenerierung (Regel 54);
// unbekannte Kandidaten blockieren (Regel 55); Mandantenbindung bleibt
// erhalten, da candidatesResult bereits mandantengebunden geprüft wurde
// (Regel 56). CREATE_SELECTED_CANDIDATE (siehe requestHandoffToken) ist erst
// danach möglich (Regel 57).
function approveCandidateSelection(pkgInput, candidatesResult, candidateId, token, options = {}) {
  const pkg = clone(pkgInput);
  assertCandidateBelongsToResult(pkg, candidatesResult, candidateId);
  const consumeResult = executionBridge.consumeToken(
    token,
    candidateApprovalTokenBinding({
      jobPackageId: pkg.jobPackageId,
      candidateId,
      candidatesFingerprint: candidatesResult.resultFingerprint,
    }),
  );
  if (!consumeResult.ok) {
    throw new Error(`Kandidatenfreigabe-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }
  pkg.selectedCandidateId = candidateId;
  pkg.status = "CANDIDATES_READY";
  return clone(pkg);
}

// ---------------------------------------------------------------------------
// Abschnitt L – zweiter, symmetrisch aufgebauter Token für die
// Ergebnisrückführung (VALIDATE_CANVA_RESULT). Bindet an jobPackageId (im
// vorhandenen Feld executionPackageId), resultFingerprint (im vorhandenen
// Feld fingerprint) und providerJobId (im vorhandenen Feld
// targetRepositoryIdentity) – dieselbe Tokenwahrheit, keine zweite.
// ---------------------------------------------------------------------------

function resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }) {
  return {
    action: "VALIDATE_CANVA_RESULT",
    executionPackageId: jobPackageId,
    fingerprint: resultFingerprint,
    targetRepositoryIdentity: providerJobId,
  };
}

function requestResultValidationToken(input = {}, options = {}) {
  const jobPackageId = String(input.jobPackageId || "").trim();
  const providerJobId = String(input.providerJobId || "").trim();
  if (!jobPackageId || !providerJobId) {
    throw new Error("jobPackageId und providerJobId sind für den Ergebnis-Token erforderlich.");
  }
  const resultFingerprint = canvaDesignResult.computeResultFingerprint(input.resultCandidate || {});
  const token = executionBridge.mintToken(
    resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }),
    { ttlMs: options.ttlMs },
  );
  return { ok: true, token, resultFingerprint, action: "VALIDATE_CANVA_RESULT", expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS };
}

function validateHandoffResult(token, resultInput = {}, options = {}) {
  const jobPackageId = String(resultInput.jobPackageId || "").trim();
  const providerJobId = String(resultInput.providerJobId || "").trim();
  const resultFingerprint = canvaDesignResult.computeResultFingerprint(resultInput);
  const consumeResult = executionBridge.consumeToken(
    token,
    resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }),
  );
  if (!consumeResult.ok) {
    throw new Error(`Ergebnis-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }
  return canvaDesignResult.validateCanvaDesignJobResult(resultInput, options);
}

// ---------------------------------------------------------------------------
// Abschnitt H – Editing-Transaktionslogik. Wird im ersten realen Pilot NICHT
// ausgeführt (Auftrag Abschnitt G: "keine Brand-Template- oder
// Edit-Transaktion im ersten realen Pilot"), aber vollständig modelliert und
// getestet. Niemals Entwurf als gespeichert anzeigen, niemals Commit ohne
// eigene Freigabe, niemals Bearbeitung ohne gültige Design-ID.
// ---------------------------------------------------------------------------

const EDITING_TRANSACTION_STATUSES = Object.freeze([
  "STARTED",
  "OPERATIONS_APPLIED",
  "PREVIEW_READY",
  "COMMITTED",
  "CANCELLED",
]);

function startEditingTransaction(input = {}, options = {}) {
  const designId = String(input.designId || "").trim();
  if (!designId) {
    throw new Error("Eine Bearbeitungstransaktion erfordert eine gültige, bereits gespeicherte Design-ID.");
  }
  const jobPackageId = String(input.jobPackageId || "").trim();
  if (!jobPackageId) throw new Error("jobPackageId fehlt.");
  const customerId = String(input.customerId || "").trim();
  const brandId = String(input.brandId || "").trim();
  const campaignId = String(input.campaignId || "").trim();
  if (!customerId || !brandId || !campaignId) {
    throw new Error("Mandantenbindung (customerId/brandId/campaignId) fehlt für die Bearbeitungstransaktion.");
  }
  return {
    editingTransactionId: `canva-edit-${crypto.randomBytes(12).toString("hex")}`,
    jobPackageId,
    designId,
    customerId,
    brandId,
    campaignId,
    status: "STARTED",
    operations: [],
    operationsFingerprint: computeOperationsFingerprint([]),
    previewReference: null,
    startedAt: nowIso(options.now),
    updatedAt: nowIso(options.now),
  };
}

function applyEditOperations(recordInput, operations, options = {}) {
  const record = clone(recordInput);
  // Neue Operationen dürfen auch nach einer bereits registrierten Vorschau
  // angewendet werden – sie entwerten die Vorschau dann kontrolliert (siehe
  // unten), statt sie fälschlich weiter als aktuell auszuweisen.
  if (!["STARTED", "OPERATIONS_APPLIED", "PREVIEW_READY"].includes(record.status)) {
    throw new Error(`Edit-Operationen können nicht aus Status "${record.status}" angewendet werden.`);
  }
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("operations muss eine nicht-leere Liste sein.");
  }
  record.operations = operations;
  // Operationen sind fingerprintgebunden (Regel 60): jede Änderung an den
  // Operationen entwertet eine bereits registrierte Vorschau.
  record.operationsFingerprint = computeOperationsFingerprint(operations);
  record.status = "OPERATIONS_APPLIED";
  record.previewReference = null;
  record.updatedAt = nowIso(options.now);
  return record;
}

// Vorschau ist ausdrücklich nicht gespeichert (Regel 61): der Status bleibt
// PREVIEW_READY, niemals SAVED/COMMITTED.
function registerEditPreview(recordInput, previewReference, options = {}) {
  const record = clone(recordInput);
  if (record.status !== "OPERATIONS_APPLIED") {
    throw new Error(`Eine Vorschau kann nur aus Status "OPERATIONS_APPLIED" registriert werden (aktuell "${record.status}").`);
  }
  const check = canvaDesignResult.validateResultReferenceUrl(previewReference, "previewReference");
  if (!check.ok) throw new Error(check.reason);
  if (!check.value) throw new Error("previewReference fehlt.");
  record.previewReference = check.value;
  record.status = "PREVIEW_READY";
  record.updatedAt = nowIso(options.now);
  return record;
}

// Speicherfreigabe-Token (APPROVE_CANVA_SAVE, Abschnitt L). Bindet
// zusätzlich an customerId/brandId/campaignId, damit ein Mandantenwechsel
// zwischen Tokenanfrage und Einlösung den Token strukturell ungültig macht
// (Regel 66).
function saveTokenBinding(record) {
  return {
    action: "APPROVE_CANVA_SAVE",
    runId: record.jobPackageId,
    executionPackageId: record.editingTransactionId,
    fingerprint: computeOperationsFingerprint({
      operationsFingerprint: record.operationsFingerprint,
      designId: record.designId,
      customerId: record.customerId,
      brandId: record.brandId,
      campaignId: record.campaignId,
    }),
    targetRepositoryIdentity: record.designId,
  };
}

function requestSaveToken(recordInput, options = {}) {
  const record = clone(recordInput);
  if (record.status !== "PREVIEW_READY") {
    return { ok: false, reason: `Speicherfreigabe ist nur aus Status "PREVIEW_READY" möglich (aktuell "${record.status}").` };
  }
  const token = executionBridge.mintToken(saveTokenBinding(record), { ttlMs: options.ttlMs });
  return { ok: true, token, action: "APPROVE_CANVA_SAVE", expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS };
}

// Ohne Commit geht der Entwurf verloren (Regel: kein Auto-Commit); Commit
// erfordert immer einen gültigen, frisch eingelösten Token.
function commitEditingTransaction(recordInput, token, options = {}) {
  const record = clone(recordInput);
  if (record.status !== "PREVIEW_READY") {
    throw new Error(`Commit ist nur aus Status "PREVIEW_READY" möglich (aktuell "${record.status}").`);
  }
  const consumeResult = executionBridge.consumeToken(token, saveTokenBinding(record));
  if (!consumeResult.ok) {
    throw new Error(`Speicherfreigabe-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }
  record.status = "COMMITTED";
  record.updatedAt = nowIso(options.now);
  return { ok: true, transaction: record, savedNow: true, noAutomaticExecution: true };
}

// Abbruch verwirft die Transaktion kontrolliert (Regel 64).
function cancelEditingTransaction(recordInput, options = {}) {
  const record = clone(recordInput);
  if (["COMMITTED", "CANCELLED"].includes(record.status)) {
    throw new Error(`Transaktion im Status "${record.status}" kann nicht mehr abgebrochen werden.`);
  }
  record.status = "CANCELLED";
  record.operations = [];
  record.previewReference = null;
  record.updatedAt = nowIso(options.now);
  return record;
}

// ---------------------------------------------------------------------------
// Abschnitt M – additiver, klar getrennter Pilot-Statussurface. Dieser
// Status verändert NICHT die kanonischen Phase-A-Register (tool-registry.js,
// plugin-gateway.js) und darf deren bestehende, bereits getestete
// REGISTERED/RECOMMENDATION_ONLY-Aussage niemals überschreiben. Er zeigt
// zusätzlich, additiv, den Phase-C-Pilotstatus, sobald die kontrollierte
// Hand-off-Strecke technisch vollständig implementiert und getestet ist –
// ohne jemals DIRECT oder autonom verbunden zu behaupten.
// ---------------------------------------------------------------------------

// Diese Konstante wird ausschließlich lokal, durch den Umsetzungsauftrag
// selbst, auf true gesetzt, nachdem Modell (canva-design-job-package.js),
// Adapter (dieses Modul) und Ergebnisrückführung (canva-design-result.js)
// vollständig implementiert UND von der zugehörigen Testsuite grün
// bestätigt sind. Sie bedeutet AUSDRÜCKLICH NICHT, dass eine echte,
// authentifizierte Canva-Verbindung besteht oder geprüft wurde.
const CONTROLLED_HANDOFF_PATH_IMPLEMENTED = true;

function buildCanvaPilotStatus(options = {}) {
  const baseTool = toolRegistry.getToolById("canva");
  const basePlugin = pluginGateway.getPluginStatusById("plugin-canva", options);
  return {
    toolId: "canva",
    // Unveränderte Phase-A-Wahrheit (read-only gespiegelt, nie mutiert):
    baseAdapterType: basePlugin ? basePlugin.adapterType : "RECOMMENDATION_ONLY",
    baseStatus: basePlugin ? basePlugin.status : "REGISTERED",
    baseConnectionStatus: baseTool ? baseTool.connectionStatus : "NOT_CONNECTED",
    baseExecutionMode: baseTool ? baseTool.executionMode : "RECOMMENDATION_ONLY",
    // Additiver Phase-C-Pilotstatus:
    pilotConnectionStatus: CONTROLLED_HANDOFF_PATH_IMPLEMENTED ? "PARTIALLY_CONNECTED" : "NOT_CONNECTED",
    pilotExecutionMode: CONTROLLED_HANDOFF_PATH_IMPLEMENTED ? "CONTROLLED_HANDOFF" : "RECOMMENDATION_ONLY",
    controlledHandoffPathImplemented: CONTROLLED_HANDOFF_PATH_IMPLEMENTED,
    directOrAutonomousConnection: false,
    dataClassificationLimit: "NORMAL",
    costBearing: true,
    externalWrite: false,
    publication: true,
    publicationApproved: false,
    requiredApprovals: [
      "Briefing freigeben",
      "Assets und Rechte freigeben",
      "externe Übertragung bestätigen",
      "Kostenrahmen bestätigen",
      "Canva-Übergabe freigeben",
    ],
    noAutonomousExecution: true,
    noRealCanvaRequestMade: true,
    firstPilotScope: canvaDesignJobPackage.CANVA_CAPABILITY_PROFILE.firstPilotScope,
  };
}

// ---------------------------------------------------------------------------
// Auftrag Abschnitt J – Agentur-Connectorbetrieb. Rein beschreibend/
// dokumentierend: kein echter Canva-Ordner, keine Verbindungsaktion. Der
// Connector bleibt CONTROLLED_HANDOFF, ist nicht kundenbedienbar und nicht
// öffentlich erreichbar. Kunden erhalten niemals einen Canva-Login oder
// persönliche Kontodaten.
// ---------------------------------------------------------------------------

function buildAgencyConnectorOperatingModel() {
  return {
    operatingModel: "AGENCY_SERVICE_ACCOUNT",
    connectorMode: "CONTROLLED_HANDOFF",
    customerHasCanvaLogin: false,
    customerCanTriggerGeneration: false,
    customerCanSave: false,
    customerCanPublish: false,
    connectorVisibility: "INTERNAL_ONLY",
    connectorPubliclyReachable: false,
    customerAssignmentModel: "INTERNAL_ONLY_VIA_CUSTOMER_BRAND_CAMPAIGN_ID",
    canvaFolderStrategy: "PLANNED_NOT_YET_CREATED",
    providerCredentialsExposedToCustomer: false,
    personalAccountDataExposedToCustomer: false,
    jobStatusFeedbackPath: [
      "DRAFT",
      "READY_FOR_REVIEW",
      "APPROVED_FOR_HANDOFF",
      "HANDED_OFF",
      "CANDIDATES_READY",
      "SAVED",
      "INTERNAL_REVIEW",
      "READY_FOR_CUSTOMER_REVIEW",
      "CUSTOMER_APPROVED_OR_CHANGES_REQUESTED",
      "PUBLICATION_NOT_APPROVED",
    ],
    resultReferenceFeedback: "Ausschließlich strukturierte Metadaten/Referenzen, kein Medien-Download durch diesen Connector.",
    noRealCanvaFolderCreatedInThisPhase: true,
    noConnectorActionExecuted: true,
  };
}

function buildCanvaCapabilityResponse(options = {}) {
  const pilotStatus = buildCanvaPilotStatus(options);
  return {
    version: "V7.1-Phase-C",
    provider: "Canva",
    capabilityProfile: canvaDesignJobPackage.CANVA_CAPABILITY_PROFILE,
    pilotStatus,
    pilotDesignTypesAllowed: canvaDesignJobPackage.CANVA_PILOT_ALLOWED_DESIGN_TYPES,
    pilotDesignOperationsAllowed: canvaDesignJobPackage.CANVA_PILOT_ALLOWED_DESIGN_OPERATIONS,
    pilotHandoffActionsAllowed: canvaDesignJobPackage.CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS,
    pilotAllowedDataClassifications: canvaDesignJobPackage.CANVA_PILOT_ALLOWED_DATA_CLASSIFICATIONS,
    forbiddenActionsAlways: canvaDesignJobPackage.CANVA_ALWAYS_FORBIDDEN_ACTIONS,
    agencyConnectorOperatingModel: buildAgencyConnectorOperatingModel(),
    noApiKeyStored: true,
    noAutomaticExecution: true,
  };
}

module.exports = {
  HANDOFF_PAYLOAD_ALLOWED_FIELDS,
  EDITING_TRANSACTION_STATUSES,
  buildMinimalHandoffPayload,
  requestHandoffToken,
  prepareHandoffPayload,
  requestCandidateApprovalToken,
  approveCandidateSelection,
  requestResultValidationToken,
  validateHandoffResult,
  startEditingTransaction,
  applyEditOperations,
  registerEditPreview,
  requestSaveToken,
  commitEditingTransaction,
  cancelEditingTransaction,
  buildCanvaPilotStatus,
  buildAgencyConnectorOperatingModel,
  buildCanvaCapabilityResponse,
};
