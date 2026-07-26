"use strict";

// V7.1 Phase C – strukturierte Rückführung eines Canva-Ergebnisses
// ("canvaDesignJobResult", Auftrag Abschnitt I).
//
// Dieses Modul enthält bewusst KEINEN Netzwerkaufruf, KEIN Dateisystem-
// Schreiben und KEINEN automatischen Download. Es validiert ausschließlich
// eine vom Connector/Jamal übergebene Ergebnisstruktur rein strukturell:
// gültige, erlaubte HTTPS-Referenzen, keine Credentials in URLs, keine
// Provider-Job-ID-allein-als-Erfolg, keine Kandidaten-ID-als-Design-ID,
// strukturierte Fehler statt Stacktraces. Designs/Bilder werden niemals
// selbst gespeichert – ausschließlich ihre Referenz (URL) wird registriert.

const crypto = require("crypto");

const canvaDesignJobPackage = require("./canva-design-job-package");

const CANVA_RESULT_PROVIDER_STATUSES = Object.freeze([
  "PROCESSING",
  "CANDIDATES_READY",
  "DESIGN_CREATED",
  "EDIT_PREVIEW_READY",
  "SAVED",
  "FAILED",
  "CANCELLED",
]);

const CANVA_RESULT_LOCAL_VALIDATION_STATUSES = Object.freeze(["NOT_VERIFIED", "STRUCTURALLY_VALID", "STRUCTURALLY_INVALID"]);

const CANVA_RESULT_SOURCES = Object.freeze(["PROVIDER_STATUS_QUERY", "MANUAL_PASTE"]);

const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 2000;
const MAX_CANDIDATE_IDS = 8;

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimmedOrNull(value, maxLength) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

// ---------------------------------------------------------------------------
// URL-Sicherheitsprüfung (analog heygen-job-result.js): nur https, kein
// localhost, keine private-IP-Adresse, keine Zugangsdaten in der URL.
// ---------------------------------------------------------------------------

const PRIVATE_IPV4_PATTERNS = Object.freeze([
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\.0\.0\.0$/,
]);

const LOCALHOST_HOSTNAMES = Object.freeze(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const CREDENTIAL_IN_URL_QUERY_KEYS = Object.freeze(["token", "apikey", "api_key", "access_token", "secret", "auth"]);

function isPrivateOrLoopbackHostname(hostname) {
  const lower = String(hostname || "").toLowerCase();
  if (LOCALHOST_HOSTNAMES.includes(lower)) return true;
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(lower))) return true;
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

function validateResultReferenceUrl(rawUrl, fieldName) {
  if (rawUrl === null || rawUrl === undefined) {
    return { ok: true, value: null };
  }
  const value = String(rawUrl).trim();
  if (!value) return { ok: true, value: null };
  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `${fieldName}: URL ist zu lang.` };
  }
  if (/^file:\/\//i.test(value) || value.startsWith("/") || value.startsWith("~")) {
    return { ok: false, reason: `${fieldName}: lokale Dateipfade sind keine gültige Ergebnisreferenz.` };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    return { ok: false, reason: `${fieldName}: keine gültige URL.` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `${fieldName}: nur https-Referenzen werden akzeptiert.` };
  }
  if (isPrivateOrLoopbackHostname(parsed.hostname)) {
    return { ok: false, reason: `${fieldName}: localhost- oder private-IP-Adressen werden nicht akzeptiert.` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: `${fieldName}: Zugangsdaten in der URL sind nicht erlaubt.` };
  }
  const lowerQueryKeys = [...parsed.searchParams.keys()].map((key) => key.toLowerCase());
  if (lowerQueryKeys.some((key) => CREDENTIAL_IN_URL_QUERY_KEYS.includes(key))) {
    return { ok: false, reason: `${fieldName}: mögliche Zugangsdaten im Query-String sind nicht erlaubt.` };
  }
  return { ok: true, value };
}

function normalizeCandidateIds(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new Error("candidateIds muss eine Liste sein.");
  }
  return [...new Set(values.slice(0, MAX_CANDIDATE_IDS).map((entry) => trimmedOrNull(entry, 200)).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Fingerprint – ausschließlich über inhaltsbestimmende Ergebnisfelder.
// ---------------------------------------------------------------------------

function computeResultFingerprint(resultInput) {
  const r = resultInput || {};
  const snapshot = {
    jobPackageId: r.jobPackageId || null,
    providerJobId: r.providerJobId || null,
    providerOperation: r.providerOperation || null,
    candidateIds: r.candidateIds || null,
    selectedCandidateId: r.selectedCandidateId || null,
    designId: r.designId || null,
    editingTransactionId: r.editingTransactionId || null,
    providerStatus: r.providerStatus || null,
    previewReference: r.previewReference || null,
    editReference: r.editReference || null,
    viewReference: r.viewReference || null,
    failureCode: r.failureCode || null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// ---------------------------------------------------------------------------
// Validierung. Trennt bewusst: Providerstatus (was Canva behauptet) / lokal
// validierte Rückgabe (was strukturell nachweisbar ist) / Jamal-Abnahme
// (immer PENDING, niemals automatisch gesetzt) / Veröffentlichung (immer
// NOT_APPROVED in Phase C).
// ---------------------------------------------------------------------------

function validateCanvaDesignJobResult(input = {}, options = {}) {
  const reasons = [];

  const jobPackageId = trimmedOrNull(input.jobPackageId, 200);
  if (!jobPackageId) reasons.push("jobPackageId fehlt.");

  const provider = trimmedOrNull(input.provider, 60) || "Canva";
  const providerJobId = trimmedOrNull(input.providerJobId, 200);
  if (!providerJobId) reasons.push("providerJobId fehlt.");

  const providerOperation = String(input.providerOperation || "").trim();
  if (!canvaDesignJobPackage.CANVA_HANDOFF_ACTIONS.includes(providerOperation)) {
    reasons.push(`providerOperation "${providerOperation}" ist ungültig.`);
  } else if (!canvaDesignJobPackage.CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS.includes(providerOperation)) {
    reasons.push(
      `providerOperation "${providerOperation}" ist im ersten Pilot nicht vorgesehen (nur ${canvaDesignJobPackage.CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS.join(", ")}).`,
    );
  }

  const providerStatus = String(input.providerStatus || "").trim();
  if (!CANVA_RESULT_PROVIDER_STATUSES.includes(providerStatus)) {
    reasons.push(`providerStatus "${providerStatus}" ist ungültig (erlaubt: ${CANVA_RESULT_PROVIDER_STATUSES.join(", ")}).`);
  }

  const candidateIds = normalizeCandidateIds(input.candidateIds);
  const selectedCandidateId = trimmedOrNull(input.selectedCandidateId, 200);
  const designId = trimmedOrNull(input.designId, 200);
  const editingTransactionId = trimmedOrNull(input.editingTransactionId, 200);

  const previewCheck = validateResultReferenceUrl(input.previewReference, "previewReference");
  if (!previewCheck.ok) reasons.push(previewCheck.reason);
  const editCheck = validateResultReferenceUrl(input.editReference, "editReference");
  if (!editCheck.ok) reasons.push(editCheck.reason);
  const viewCheck = validateResultReferenceUrl(input.viewReference, "viewReference");
  if (!viewCheck.ok) reasons.push(viewCheck.reason);

  // Provider-Job-ID allein ist kein Erfolg (Auftrag Abschnitt I, Regel #51):
  // jeder "erfolgreiche" providerStatus erfordert eine strukturell
  // nachweisbare, dazu passende Referenz/ID, niemals nur die Job-ID.
  let locallyVerifiedSuccess = false;
  if (providerStatus === "CANDIDATES_READY") {
    if (candidateIds.length === 0) {
      reasons.push("CANDIDATES_READY erfordert mindestens eine candidateId; providerJobId allein ist kein Erfolg.");
    } else {
      locallyVerifiedSuccess = true;
    }
  } else if (providerStatus === "DESIGN_CREATED" || providerStatus === "SAVED") {
    if (!designId) {
      reasons.push(`${providerStatus} erfordert eine gültige designId; providerJobId allein ist kein Erfolg.`);
    } else {
      locallyVerifiedSuccess = true;
    }
    // Candidate-ID ist keine Design-ID (Auftrag Abschnitt I, Regel #53).
    if (designId && candidateIds.includes(designId)) {
      reasons.push("designId darf nicht identisch mit einer candidateId sein (Candidate-ID ist keine Design-ID).");
    }
  } else if (providerStatus === "EDIT_PREVIEW_READY") {
    if (!designId || !editingTransactionId || !previewCheck.value) {
      reasons.push("EDIT_PREVIEW_READY erfordert designId, editingTransactionId und previewReference.");
    } else {
      locallyVerifiedSuccess = true;
    }
  }

  const pageCountRaw = input.pageCount;
  const pageCount = pageCountRaw === undefined || pageCountRaw === null ? null : Number(pageCountRaw);
  if (pageCount !== null && (!Number.isFinite(pageCount) || pageCount < 1)) {
    reasons.push("pageCount muss eine positive Zahl oder null sein.");
  }

  const designType = trimmedOrNull(input.designType, 60);
  if (designType && !canvaDesignJobPackage.CANVA_DESIGN_TYPES.includes(designType)) {
    reasons.push(`designType "${designType}" ist ungültig.`);
  }

  const failureCode = trimmedOrNull(input.failureCode, 100);
  const failureMessage = trimmedOrNull(input.failureMessage, MAX_TEXT_LENGTH);
  if (providerStatus === "FAILED") {
    if (!failureCode) reasons.push("failureCode fehlt für providerStatus FAILED.");
    if (!failureMessage) reasons.push("failureMessage fehlt für providerStatus FAILED.");
    if (failureMessage && /at Object\.|at Module\.|\.js:\d+:\d+/.test(failureMessage)) {
      reasons.push("failureMessage darf keine Stacktrace-artigen Details enthalten.");
    }
  }

  const costStatus = String(input.costStatus || "UNKNOWN").trim();
  if (!canvaDesignJobPackage.CANVA_COST_PACKAGE_STATUSES.includes(costStatus)) {
    reasons.push(`costStatus "${costStatus}" ist ungültig.`);
  }

  const source = String(input.source || "MANUAL_PASTE").trim();
  if (!CANVA_RESULT_SOURCES.includes(source)) {
    reasons.push(`source "${source}" ist ungültig (erlaubt: ${CANVA_RESULT_SOURCES.join(", ")}).`);
  }

  const ok = reasons.length === 0;
  const resultRecord = {
    jobPackageId,
    customerId: trimmedOrNull(input.customerId, 200),
    brandId: trimmedOrNull(input.brandId, 200),
    campaignId: trimmedOrNull(input.campaignId, 200),
    provider,
    providerOperation,
    providerJobId,
    candidateIds,
    selectedCandidateId,
    designId,
    editingTransactionId,
    providerStatus,
    localValidationStatus: ok
      ? locallyVerifiedSuccess
        ? "STRUCTURALLY_VALID"
        : "NOT_VERIFIED"
      : "STRUCTURALLY_INVALID",
    previewReference: previewCheck.value || null,
    editReference: editCheck.value || null,
    viewReference: viewCheck.value || null,
    pageCount,
    designType: designType || null,
    completedAt: trimmedOrNull(input.completedAt, 40),
    failureCode: providerStatus === "FAILED" ? failureCode : null,
    failureMessage: providerStatus === "FAILED" ? failureMessage : null,
    costStatus,
    usageNote: trimmedOrNull(input.usageNote, 400),
    source,
    providerClaimedStatus: providerStatus,
    locallyVerifiedSuccess,
    // Jamal-Abnahme ist strukturell von der Providerantwort getrennt und
    // wird von diesem Modul NIE automatisch gesetzt.
    jamalAcceptanceStatus: "PENDING",
    // Ein gespeichertes Design ist keine Veröffentlichung (Auftrag
    // Abschnitt I, Regel #70): publicationApproved bleibt unabhängig vom
    // Providererfolg immer false.
    publicationApproved: false,
    verifiedAt: ok ? nowIso(options.now) : null,
    resultFingerprint: computeResultFingerprint(input),
  };

  return { ok, reasons, result: clone(resultRecord) };
}

module.exports = {
  CANVA_RESULT_PROVIDER_STATUSES,
  CANVA_RESULT_LOCAL_VALIDATION_STATUSES,
  CANVA_RESULT_SOURCES,
  validateResultReferenceUrl,
  computeResultFingerprint,
  validateCanvaDesignJobResult,
};
