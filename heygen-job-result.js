"use strict";

// V7.1 Phase B – strukturierte Rückführung eines HeyGen-Ergebnisses
// ("heygenJobResult", Auftrag Abschnitt H).
//
// Dieses Modul enthält bewusst KEINEN Netzwerkaufruf, KEIN Dateisystem-
// Schreiben und KEINEN automatischen Download. Es validiert ausschließlich
// eine vom Connector/Jamal übergebene Ergebnisstruktur (z. B. eine von
// HeyGen zurückgemeldete Job-Status-Antwort) rein strukturell: gültige,
// erlaubte HTTPS-Referenzen, keine Credentials in URLs, kein
// providerJobId-allein-als-Erfolg, strukturierte Fehler statt Stacktraces.
// Videos/Audios/Bilder werden niemals selbst gespeichert – ausschließlich
// ihre Referenz (URL) wird registriert.

const crypto = require("crypto");

const HEYGEN_RESULT_STATUSES = Object.freeze(["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"]);
const HEYGEN_RESULT_COST_STATUSES = Object.freeze(["UNKNOWN", "WITHIN_APPROVED_LIMIT", "REQUIRES_APPROVAL", "NOT_AVAILABLE"]);
const HEYGEN_RESULT_SOURCES = Object.freeze(["PROVIDER_STATUS_QUERY", "MANUAL_PASTE"]);

const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 2000;

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
// URL-Sicherheitsprüfung (Auftrag Abschnitt H): nur https, kein localhost,
// keine private-IP-Adresse, keine Zugangsdaten in der URL.
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
  // IPv6 loopback/link-local/unique-local (grob, konservativ).
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

// ---------------------------------------------------------------------------
// Fingerprint – ausschließlich über inhaltsbestimmende Ergebnisfelder.
// ---------------------------------------------------------------------------

function computeResultFingerprint(resultInput) {
  const r = resultInput || {};
  const snapshot = {
    jobPackageId: r.jobPackageId || null,
    providerJobId: r.providerJobId || null,
    status: r.status || null,
    videoReference: r.videoReference || null,
    thumbnailReference: r.thumbnailReference || null,
    subtitleReference: r.subtitleReference || null,
    durationSeconds: r.durationSeconds ?? null,
    failureCode: r.failureCode || null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// ---------------------------------------------------------------------------
// Validierung. Trennt bewusst: Providerstatus (was HeyGen behauptet) / lokal
// validierte Rückgabe (was strukturell nachweisbar ist) / Jamal-Abnahme
// (immer PENDING, niemals automatisch gesetzt) / Veröffentlichung (immer
// NOT_APPROVED in Phase B).
// ---------------------------------------------------------------------------

function validateHeygenJobResult(input = {}, options = {}) {
  const reasons = [];

  const jobPackageId = trimmedOrNull(input.jobPackageId, 200);
  if (!jobPackageId) reasons.push("jobPackageId fehlt.");

  const provider = trimmedOrNull(input.provider, 60) || "HeyGen";
  const providerJobId = trimmedOrNull(input.providerJobId, 200);
  if (!providerJobId) reasons.push("providerJobId fehlt.");

  const status = String(input.status || "").trim();
  if (!HEYGEN_RESULT_STATUSES.includes(status)) {
    reasons.push(`status "${status}" ist ungültig (erlaubt: ${HEYGEN_RESULT_STATUSES.join(", ")}).`);
  }

  const videoCheck = validateResultReferenceUrl(input.videoReference, "videoReference");
  if (!videoCheck.ok) reasons.push(videoCheck.reason);
  const thumbnailCheck = validateResultReferenceUrl(input.thumbnailReference, "thumbnailReference");
  if (!thumbnailCheck.ok) reasons.push(thumbnailCheck.reason);
  const subtitleCheck = validateResultReferenceUrl(input.subtitleReference, "subtitleReference");
  if (!subtitleCheck.ok) reasons.push(subtitleCheck.reason);

  // providerJobId allein ist kein Erfolg (Auftrag Abschnitt H, Regel #42):
  // SUCCEEDED erfordert zwingend eine gültige, lokal geprüfte
  // Ergebnisreferenz, niemals nur eine Provider-ID.
  let locallyVerifiedSuccess = false;
  if (status === "SUCCEEDED") {
    if (!videoCheck.value) {
      reasons.push("SUCCEEDED erfordert eine gültige videoReference; providerJobId allein ist kein Erfolg.");
    } else {
      locallyVerifiedSuccess = reasons.length === 0;
    }
  }

  const failureCode = trimmedOrNull(input.failureCode, 100);
  const failureMessage = trimmedOrNull(input.failureMessage, MAX_TEXT_LENGTH);
  if (status === "FAILED") {
    if (!failureCode) reasons.push("failureCode fehlt für status FAILED.");
    if (!failureMessage) reasons.push("failureMessage fehlt für status FAILED.");
    if (failureMessage && /at Object\.|at Module\.|\.js:\d+:\d+/.test(failureMessage)) {
      reasons.push("failureMessage darf keine Stacktrace-artigen Details enthalten.");
    }
  }

  const costStatus = String(input.costStatus || "UNKNOWN").trim();
  if (!HEYGEN_RESULT_COST_STATUSES.includes(costStatus)) {
    reasons.push(`costStatus "${costStatus}" ist ungültig.`);
  }

  const source = String(input.source || "MANUAL_PASTE").trim();
  if (!HEYGEN_RESULT_SOURCES.includes(source)) {
    reasons.push(`source "${source}" ist ungültig (erlaubt: ${HEYGEN_RESULT_SOURCES.join(", ")}).`);
  }

  const durationSecondsRaw = input.durationSeconds;
  const durationSeconds =
    durationSecondsRaw === undefined || durationSecondsRaw === null ? null : Number(durationSecondsRaw);
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
    reasons.push("durationSeconds muss eine nicht-negative Zahl oder null sein.");
  }

  const ok = reasons.length === 0;
  const resultRecord = {
    jobPackageId,
    provider,
    providerJobId,
    status,
    submittedAt: trimmedOrNull(input.submittedAt, 40),
    completedAt: trimmedOrNull(input.completedAt, 40),
    videoReference: videoCheck.value || null,
    thumbnailReference: thumbnailCheck.value || null,
    subtitleReference: subtitleCheck.value || null,
    durationSeconds,
    failureCode: status === "FAILED" ? failureCode : null,
    failureMessage: status === "FAILED" ? failureMessage : null,
    costStatus,
    usageNote: trimmedOrNull(input.usageNote, 400),
    source,
    // Providerstatus vs. lokal validierte Rückgabe: getrennt ausgewiesen.
    providerClaimedStatus: status,
    locallyVerifiedSuccess,
    // Jamal-Abnahme ist strukturell von der Providerantwort getrennt und
    // wird von diesem Modul NIE automatisch gesetzt.
    jamalAcceptanceStatus: "PENDING",
    // Veröffentlichung bleibt unabhängig vom Renderstatus immer eine eigene,
    // spätere Freigabe (Auftrag Abschnitt H/I).
    publicationApproved: false,
    verifiedAt: ok ? nowIso(options.now) : null,
    resultFingerprint: computeResultFingerprint(input),
  };

  return { ok, reasons, result: clone(resultRecord) };
}

module.exports = {
  HEYGEN_RESULT_STATUSES,
  HEYGEN_RESULT_COST_STATUSES,
  HEYGEN_RESULT_SOURCES,
  validateResultReferenceUrl,
  computeResultFingerprint,
  validateHeygenJobResult,
};
