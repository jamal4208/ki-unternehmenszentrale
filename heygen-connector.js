"use strict";

// V7.1 Phase B – kontrollierter HeyGen-Connector-Adapter
// (CONTROLLED_CONNECTOR_HANDOFF, siehe Auftrag Abschnitt G).
//
// Dieser Adapter ist AUSDRÜCKLICH KEIN direkter HTTP-Client mit API-Key. Er
// validiert ein bestehendes heygenJobPackage, prüft Freigaben, Fingerprint
// und Ablaufzeit, und erzeugt ausschließlich ein minimales, kopier- bzw.
// connectorfähiges Hand-off-Payload. Die tatsächliche HeyGen-Aktion läuft –
// falls überhaupt – über den vorhandenen, authentifizierten HeyGen-Connector
// außerhalb dieses lokalen Node-Servers. Dieses Modul selbst enthält keinen
// Netzwerkaufruf (kein http/https/fetch), keine Zugangsdaten und keine
// Speicherung von Secrets.
//
// Tokenarchitektur: es wird bewusst KEINE zweite Token-Wahrheit eingeführt.
// Sowohl der Hand-off-Token (PREPARE_HEYGEN_HANDOFF) als auch der
// Ergebnis-Token (VALIDATE_HEYGEN_RESULT) nutzen ausschließlich die
// bestehenden, RAM-only, einmaligen Tokens aus execution-bridge.js
// (mintToken/consumeToken). execution-bridge.js selbst wird von diesem
// Modul nur gelesen (require), niemals verändert.

const crypto = require("crypto");

const executionBridge = require("./execution-bridge");
const heygenJobPackage = require("./heygen-job-package");
const heygenJobResult = require("./heygen-job-result");
const pluginGateway = require("./plugin-gateway");
const toolRegistry = require("./tool-registry");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

// ---------------------------------------------------------------------------
// Minimales Hand-off-Payload (Auftrag Abschnitt G) – strikte Allowlist.
// Enthält ausschließlich die für die HeyGen-Aktion notwendigen Felder;
// keine internen Pfade, keine App-Support-Pfade, keine vollständigen
// Projektdateien, keine Secrets, keine Governance-/Freigabefelder.
// ---------------------------------------------------------------------------

const HANDOFF_PAYLOAD_ALLOWED_FIELDS = Object.freeze([
  "jobPackageId",
  "videoType",
  "title",
  "script",
  "language",
  "aspectRatio",
  "durationTargetSeconds",
  "resolutionPreference",
  "captionRequested",
  "avatarReference",
  "allowedHeyGenActions",
  "forbiddenActions",
  "packageFingerprint",
  "expiresAt",
]);

function sanitizeAvatarReferenceForHandoff(avatarReference) {
  if (!avatarReference) return null;
  // consentReference ist eine interne Governance-Notiz, kein für HeyGen
  // notwendiges Feld – bewusst ausgeschlossen (Auftrag: "nur die für die
  // jeweilige HeyGen-Aktion notwendigen Felder").
  return { avatarId: avatarReference.avatarId, visibility: avatarReference.visibility };
}

function buildMinimalHandoffPayload(pkg) {
  const payload = {};
  HANDOFF_PAYLOAD_ALLOWED_FIELDS.forEach((field) => {
    if (field === "avatarReference") {
      payload.avatarReference = sanitizeAvatarReferenceForHandoff(pkg.avatarReference);
      return;
    }
    payload[field] = pkg[field] !== undefined ? pkg[field] : null;
  });
  return payload;
}

function assertOnlyAllowedActions(pkg) {
  const allowedForType = new Set(
    (heygenJobPackage.HEYGEN_ALWAYS_FORBIDDEN_ACTIONS || []).length
      ? Object.freeze(["GENERATE_AVATAR_VIDEO", "GENERATE_IMAGE_ANIMATION", "GENERATE_VIDEO_TRANSLATION", "GENERATE_LIPSYNC", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"])
      : [],
  );
  const actions = Array.isArray(pkg.allowedHeyGenActions) ? pkg.allowedHeyGenActions : [];
  actions.forEach((action) => {
    if (heygenJobPackage.HEYGEN_ALWAYS_FORBIDDEN_ACTIONS.includes(action)) {
      throw new Error(`Aktion "${action}" ist grundsätzlich verboten (Löschung/Erstellung/Veröffentlichung/Einkauf).`);
    }
    if (!allowedForType.has(action)) {
      throw new Error(`Aktion "${action}" ist keine zulässige, sichere HeyGen-Aktion.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Abschnitt J – Hand-off-Token. Bindet an: action, projectId (im vorhandenen
// Feld targetRepositoryIdentity), sourceRunId (im vorhandenen Feld runId),
// jobPackageId (im vorhandenen Feld executionPackageId), packageFingerprint
// (im vorhandenen Feld fingerprint). dataClassification und costCeiling sind
// bereits Bestandteil des Fingerprints (siehe heygen-job-package.js), eine
// Änderung daran ändert daher automatisch den Fingerprint und macht den
// Token ungültig. Es entsteht bewusst keine zweite, parallele
// Token-Speicherstruktur.
// ---------------------------------------------------------------------------

function tokenBindingForPackage(pkg) {
  return {
    action: "PREPARE_HEYGEN_HANDOFF",
    runId: pkg.sourceRunId || pkg.jobPackageId,
    executionPackageId: pkg.jobPackageId,
    fingerprint: pkg.packageFingerprint,
    targetRepositoryIdentity: pkg.projectId,
  };
}

function requestHandoffToken(pkgInput, options = {}) {
  const pkg = clone(pkgInput);
  const readiness = heygenJobPackage.evaluateHandoffReadiness(pkg, options);
  if (!readiness.ready) {
    return {
      ok: false,
      reason: "Handoff-Voraussetzungen nicht erfüllt.",
      missing: readiness.missing,
      noAutomaticExecution: true,
    };
  }
  if (pkg.videoType && !heygenJobPackage.HEYGEN_PILOT_ALLOWED_VIDEO_TYPES.includes(pkg.videoType)) {
    return {
      ok: false,
      reason: `videoType "${pkg.videoType}" ist im ersten Pilot nicht für ein Hand-off vorgesehen.`,
      missing: [],
      noAutomaticExecution: true,
    };
  }
  const token = executionBridge.mintToken(tokenBindingForPackage(pkg), { ttlMs: options.ttlMs });
  return {
    ok: true,
    token,
    action: "PREPARE_HEYGEN_HANDOFF",
    expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS,
    noAutomaticExecution: true,
  };
}

// ---------------------------------------------------------------------------
// Hand-off-Vorbereitung. Verbraucht den Token EINMALIG, prüft erneut
// Fingerprint/Ablaufzeit/Freigaben (Schutz gegen Veränderung zwischen
// Tokenanfrage und Einlösung) und liefert ausschließlich das minimale
// Payload zurück. Startet KEINE HTTP-Anfrage, KEINE HeyGen-Ausführung.
// ---------------------------------------------------------------------------

function prepareHandoffPayload(pkgInput, token, options = {}) {
  const pkg = clone(pkgInput);

  const readiness = heygenJobPackage.evaluateHandoffReadiness(pkg, options);
  if (!readiness.ready) {
    throw new Error("Handoff-Voraussetzungen sind nicht mehr erfüllt (Paket wurde verändert oder ist abgelaufen).");
  }
  if (pkg.videoType && !heygenJobPackage.HEYGEN_PILOT_ALLOWED_VIDEO_TYPES.includes(pkg.videoType)) {
    throw new Error(`videoType "${pkg.videoType}" ist im ersten Pilot nicht für ein Hand-off vorgesehen.`);
  }
  if (heygenJobPackage.isPublicationApproved(pkg)) {
    throw new Error("Veröffentlichung ist in Phase B nicht freigegeben; kein Hand-off möglich.");
  }
  assertOnlyAllowedActions(pkg);

  const consumeResult = executionBridge.consumeToken(token, tokenBindingForPackage(pkg));
  if (!consumeResult.ok) {
    throw new Error(`Hand-off-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }

  const payload = buildMinimalHandoffPayload(pkg);
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
// Abschnitt J – zweiter, symmetrisch aufgebauter Token für die
// Ergebnisrückführung (VALIDATE_HEYGEN_RESULT). Bindet an jobPackageId (im
// vorhandenen Feld executionPackageId), resultFingerprint (im vorhandenen
// Feld fingerprint) und providerJobId (im vorhandenen Feld
// targetRepositoryIdentity) – dieselbe Tokenwahrheit, keine zweite.
// ---------------------------------------------------------------------------

function resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }) {
  return {
    action: "VALIDATE_HEYGEN_RESULT",
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
  const resultFingerprint = heygenJobResult.computeResultFingerprint(input.resultCandidate || {});
  const token = executionBridge.mintToken(
    resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }),
    { ttlMs: options.ttlMs },
  );
  return { ok: true, token, resultFingerprint, action: "VALIDATE_HEYGEN_RESULT", expiresInMs: options.ttlMs || executionBridge.TOKEN_TTL_MS };
}

function validateHandoffResult(token, resultInput = {}, options = {}) {
  const jobPackageId = String(resultInput.jobPackageId || "").trim();
  const providerJobId = String(resultInput.providerJobId || "").trim();
  const resultFingerprint = heygenJobResult.computeResultFingerprint(resultInput);
  const consumeResult = executionBridge.consumeToken(
    token,
    resultTokenBinding({ jobPackageId, providerJobId, resultFingerprint }),
  );
  if (!consumeResult.ok) {
    throw new Error(`Ergebnis-Token ungültig, abgelaufen, bereits verwendet oder falsch gebunden (${consumeResult.reason}).`);
  }
  return heygenJobResult.validateHeygenJobResult(resultInput, options);
}

// ---------------------------------------------------------------------------
// Abschnitt K – additiver, klar getrennter Pilot-Statussurface. Dieser
// Status verändert NICHT die kanonischen Phase-A-Register (tool-registry.js,
// plugin-gateway.js) und darf deren bestehende, bereits getestete
// REGISTERED/RECOMMENDATION_ONLY-Aussage niemals überschreiben. Er zeigt
// zusätzlich, additiv, den Phase-B-Pilotstatus, sobald die kontrollierte
// Hand-off-Strecke technisch vollständig implementiert und getestet ist –
// ohne jemals DIRECT oder autonom verbunden zu behaupten.
// ---------------------------------------------------------------------------

// Diese Konstante wird ausschließlich lokal, durch den Umsetzungsauftrag
// selbst, auf true gesetzt, nachdem Modell (heygen-job-package.js), Adapter
// (dieses Modul) und Ergebnisrückführung (heygen-job-result.js) vollständig
// implementiert UND von der zugehörigen Testsuite grün bestätigt sind. Sie
// bedeutet AUSDRÜCKLICH NICHT, dass eine echte, authentifizierte
// HeyGen-Verbindung besteht oder geprüft wurde.
const CONTROLLED_HANDOFF_PATH_IMPLEMENTED = true;

function buildHeygenPilotStatus(options = {}) {
  const baseTool = toolRegistry.getToolById("heygen");
  const basePlugin = pluginGateway.getPluginStatusById("plugin-heygen", options);
  return {
    toolId: "heygen",
    // Unveränderte Phase-A-Wahrheit (read-only gespiegelt, nie mutiert):
    baseAdapterType: basePlugin ? basePlugin.adapterType : "RECOMMENDATION_ONLY",
    baseStatus: basePlugin ? basePlugin.status : "REGISTERED",
    baseConnectionStatus: baseTool ? baseTool.connectionStatus : "NOT_CONNECTED",
    baseExecutionMode: baseTool ? baseTool.executionMode : "RECOMMENDATION_ONLY",
    // Additiver Phase-B-Pilotstatus:
    pilotConnectionStatus: CONTROLLED_HANDOFF_PATH_IMPLEMENTED ? "PARTIALLY_CONNECTED" : "NOT_CONNECTED",
    pilotExecutionMode: CONTROLLED_HANDOFF_PATH_IMPLEMENTED ? "CONTROLLED_HANDOFF" : "RECOMMENDATION_ONLY",
    controlledHandoffPathImplemented: CONTROLLED_HANDOFF_PATH_IMPLEMENTED,
    directOrAutonomousConnection: false,
    dataClassificationLimit: "NORMAL",
    costBearing: true,
    externalWrite: false,
    publication: true,
    publicationApproved: false,
    requiredApprovals: ["Inhalt freigeben", "externe Übertragung freigeben", "Kostenrahmen freigeben"],
    noAutonomousExecution: true,
    noRealHeyGenRequestMade: true,
    firstPilotScope: heygenJobPackage.HEYGEN_CAPABILITY_PROFILE.firstPilotScope,
  };
}

// ---------------------------------------------------------------------------
// V7.1 Phase B.1 (Auftrag Abschnitt F) – Agentur-Connectorbetrieb. Rein
// beschreibend/dokumentierend: kein echter HeyGen-Ordner, kein Sub-
// Workspace, keine Verbindungsaktion. Der Connector bleibt
// CONTROLLED_HANDOFF, ist nicht kundenbedienbar und nicht öffentlich
// erreichbar. Kunden erhalten niemals einen HeyGen-Login oder persönliche
// Kontodaten.
// ---------------------------------------------------------------------------

function buildAgencyConnectorOperatingModel() {
  return {
    operatingModel: "AGENCY_SERVICE_ACCOUNT",
    connectorMode: "CONTROLLED_HANDOFF",
    customerHasHeyGenLogin: false,
    customerCanTriggerRender: false,
    customerCanPublish: false,
    connectorVisibility: "INTERNAL_ONLY",
    connectorPubliclyReachable: false,
    customerAssignmentModel: "INTERNAL_ONLY_VIA_CUSTOMER_BRAND_CAMPAIGN_ID",
    providerFolderStrategy: "PLANNED_NOT_YET_CREATED",
    providerCredentialsExposedToCustomer: false,
    personalAccountDataExposedToCustomer: false,
    jobStatusFeedbackPath: [
      "PROVIDER_PROCESSING",
      "PROVIDER_SUCCEEDED_OR_FAILED",
      "LOCAL_VALIDATED",
      "INTERNAL_REVIEW",
      "READY_FOR_CUSTOMER_REVIEW",
      "CUSTOMER_APPROVED_OR_CHANGES_REQUESTED",
      "PUBLICATION_NOT_APPROVED",
    ],
    resultReferenceFeedback: "Ausschließlich strukturierte Metadaten/Referenzen, kein Medien-Download durch diesen Connector.",
    noRealHeyGenFolderCreatedInThisPhase: true,
    noSubWorkspaceCreatedInThisPhase: true,
    noConnectorActionExecuted: true,
  };
}

function buildHeygenCapabilityResponse(options = {}) {
  const pilotStatus = buildHeygenPilotStatus(options);
  return {
    version: "V7.1-Phase-B.1",
    provider: "HeyGen",
    capabilityProfile: heygenJobPackage.HEYGEN_CAPABILITY_PROFILE,
    pilotStatus,
    pilotVideoTypesAllowed: heygenJobPackage.HEYGEN_PILOT_ALLOWED_VIDEO_TYPES,
    pilotAspectRatios: heygenJobPackage.HEYGEN_ASPECT_RATIOS,
    pilotMaxDurationSeconds: heygenJobPackage.HEYGEN_PILOT_MAX_DURATION_SECONDS,
    pilotAllowedDataClassifications: heygenJobPackage.HEYGEN_PILOT_ALLOWED_DATA_CLASSIFICATIONS,
    forbiddenActionsAlways: heygenJobPackage.HEYGEN_ALWAYS_FORBIDDEN_ACTIONS,
    agencyConnectorOperatingModel: buildAgencyConnectorOperatingModel(),
    noApiKeyStored: true,
    noAutomaticExecution: true,
  };
}

module.exports = {
  HANDOFF_PAYLOAD_ALLOWED_FIELDS,
  buildMinimalHandoffPayload,
  requestHandoffToken,
  prepareHandoffPayload,
  requestResultValidationToken,
  validateHandoffResult,
  buildHeygenPilotStatus,
  buildAgencyConnectorOperatingModel,
  buildHeygenCapabilityResponse,
};
