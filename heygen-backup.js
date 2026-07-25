"use strict";

// V7.1 Phase B – Backup/Restore für HeyGen-Auftragspakete und
// Ergebnis-Metadaten (Auftrag Abschnitt M).
//
// Exportiert AUSSCHLIESSLICH strukturierte Metadaten aus heygen-store.js:
// Jobpaket-Metadaten, Freigabestatus, Provider-Job-ID, Ergebnis-Metadaten,
// Kostenstatus, Referenzen (URLs). NIEMALS: Videos/Audios/Bilder selbst,
// API-Keys, Tokens, Credentials, private Avatar-/Voice-Asset-IDs,
// App-Support-Dateipfade, temporäre Connector-Payloads, vollständige
// Providerantworten.
//
// Restore startet KEINEN HeyGen-Job, wiederholt KEINEN Hand-off,
// veröffentlicht nichts, kauft nichts und setzt keine Freigabe neu. Die
// einzige erlaubte Schreibwirkung ist das Markieren abgelaufener Pakete als
// STALE.

const heygenStore = require("./heygen-store");
const heygenJobPackage = require("./heygen-job-package");

const HEYGEN_BACKUP_FORMAT_VERSION = "heygen-phase-b-backup-1";
const SUPPORTED_HEYGEN_BACKUP_FORMAT_VERSIONS = Object.freeze([HEYGEN_BACKUP_FORMAT_VERSION]);
const APPLICATION_NAME = "KI-Unternehmenszentrale";

const ALLOWED_ROOT_FIELDS = Object.freeze([
  "backupFormatVersion",
  "exportedAt",
  "applicationName",
  "scope",
  "jobPackages",
  "jobResults",
  "summary",
  "safetyNotice",
]);

// Strikte Allowlist je Jobpaket-Export – bewusst kein "...rest" Spread,
// damit künftige, versehentlich hinzugefügte Felder (z. B. interne Pfade)
// niemals automatisch mitexportiert werden.
const PACKAGE_EXPORT_FIELDS = Object.freeze([
  "schemaVersion",
  "jobPackageId",
  "projectId",
  "sourceRunId",
  "createdAt",
  "createdBy",
  "requestingAgentId",
  "purpose",
  "videoType",
  "title",
  "script",
  "language",
  "targetAudience",
  "tone",
  "durationTargetSeconds",
  "aspectRatio",
  "resolutionPreference",
  "avatarReference",
  "voiceReference",
  "visualStyle",
  "background",
  "captionRequested",
  "sourceAssetReferences",
  "dataClassification",
  "containsPersonalData",
  "containsCustomerData",
  "containsHealthData",
  "containsChildren",
  "avatarConsentConfirmed",
  "voiceConsentConfirmed",
  "externalTransferApproved",
  "costApprovalStatus",
  "costCeiling",
  "currency",
  "publicationApproved",
  "contentApproved",
  "allowedHeyGenActions",
  "forbiddenActions",
  "packageFingerprint",
  "expiresAt",
  "status",
  "blockReasons",
]);

const RESULT_EXPORT_FIELDS = Object.freeze([
  "jobPackageId",
  "provider",
  "providerJobId",
  "status",
  "submittedAt",
  "completedAt",
  "videoReference",
  "thumbnailReference",
  "subtitleReference",
  "durationSeconds",
  "failureCode",
  "failureMessage",
  "costStatus",
  "usageNote",
  "source",
  "providerClaimedStatus",
  "locallyVerifiedSuccess",
  "jamalAcceptanceStatus",
  "publicationApproved",
  "verifiedAt",
  "resultFingerprint",
]);

// Felder, die unter keinen Umständen im Export auftauchen dürfen, selbst
// wenn sie sich künftig versehentlich in einen Datensatz einschleichen
// (defensiver Zweitschutz, analog v71-registry-backup.js).
const FORBIDDEN_FIELD_NAMES = Object.freeze([
  "apiKey",
  "credential",
  "credentials",
  "token",
  "accessToken",
  "secret",
  "videoBuffer",
  "imageBuffer",
  "audioBuffer",
  "fileBuffer",
  "base64Content",
  "filePath",
  "appSupportPath",
  "handoffPayload",
  "providerRawResponse",
  "consentReference",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickFields(record, allowedFields) {
  const picked = {};
  allowedFields.forEach((field) => {
    picked[field] = Object.prototype.hasOwnProperty.call(record, field) ? record[field] : null;
  });
  return picked;
}

// Private Avatar-/Voice-Assets werden nicht als exportierbares Metadatum
// dupliziert (Auftrag Abschnitt M: "private Avatar- oder Voice-Assets"
// bleiben ausgeschlossen). Öffentliche Avatarreferenzen sind unkritisch und
// bleiben zur Nachvollziehbarkeit erhalten.
function sanitizeAvatarReferenceForBackup(avatarReference) {
  if (!avatarReference) return null;
  if (avatarReference.visibility === "PRIVATE") {
    return { avatarId: "[REDACTED-PRIVATE-ASSET]", visibility: "PRIVATE" };
  }
  return { avatarId: avatarReference.avatarId, visibility: avatarReference.visibility || "PUBLIC" };
}

function sanitizeVoiceReferenceForBackup(voiceReference) {
  if (!voiceReference) return null;
  if (voiceReference.isClone === true) {
    return { voiceId: "[REDACTED-VOICE-CLONE]", isClone: true };
  }
  return { voiceId: voiceReference.voiceId || null, isClone: false };
}

function sanitizePackageForExport(record) {
  const picked = pickFields(record, PACKAGE_EXPORT_FIELDS);
  picked.avatarReference = sanitizeAvatarReferenceForBackup(record.avatarReference);
  picked.voiceReference = sanitizeVoiceReferenceForBackup(record.voiceReference);
  return picked;
}

function sanitizeResultForExport(record) {
  return pickFields(record, RESULT_EXPORT_FIELDS);
}

function exportHeygenBackup(options = {}) {
  const paths = heygenStore.resolveHeygenStorePaths(options);
  const packages = heygenStore.listPackages(paths, options.filter).map(sanitizePackageForExport);
  const results = heygenStore.listResults(paths).map(sanitizeResultForExport);

  return {
    backupFormatVersion: HEYGEN_BACKUP_FORMAT_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    applicationName: APPLICATION_NAME,
    scope: "V7.1 Phase B – HeyGen-Jobpaket-Metadaten und Ergebnis-Metadaten (kein Connector-Pilot, kein Rendermaterial).",
    jobPackages: packages,
    jobResults: results,
    summary: {
      jobPackageCount: packages.length,
      jobResultCount: results.length,
    },
    safetyNotice:
      "Diese Sicherung enthält ausschließlich strukturierte Metadaten. Keine Videos, Audios oder Bilder, keine " +
      "API-Keys, keine Tokens, keine Zugangsdaten, keine privaten Avatar-/Voice-Assets, keine App-Support-Dateipfade, " +
      "keine temporären Connector-Payloads, keine vollständigen Provider-Antworten. Ein Restore startet keinen " +
      "HeyGen-Job, wiederholt keinen Hand-off, veröffentlicht nichts, kauft nichts und setzt keine Freigabe neu. " +
      "Die einzige Schreibwirkung eines Restores ist das Markieren bereits abgelaufener Pakete als STALE.",
  };
}

function containsForbiddenFieldNames(value) {
  const text = JSON.stringify(value || {});
  return FORBIDDEN_FIELD_NAMES.some((name) => new RegExp(`"${name}"\\s*:`, "i").test(text));
}

function containsForbiddenSecretPatterns(value) {
  const text = JSON.stringify(value || {});
  const patterns = [
    /Bearer\s+[A-Za-z0-9._-]{10,}/i,
    /sk-[A-Za-z0-9]{10,}/,
    /AKIA[0-9A-Z]{12,}/,
    /"apiKey"\s*:\s*"[^"]{4,}"/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function validateHeygenBackup(exportData) {
  if (!isPlainObject(exportData)) {
    return { ok: false, error: "Ungültiges HeyGen-Sicherungsformat: Wurzel muss ein Objekt sein." };
  }
  const unexpectedFields = Object.keys(exportData).filter((key) => !ALLOWED_ROOT_FIELDS.includes(key));
  if (unexpectedFields.length > 0) {
    return { ok: false, error: `Unerwartete Felder in der HeyGen-Sicherung: ${unexpectedFields.join(", ")}` };
  }
  if (!SUPPORTED_HEYGEN_BACKUP_FORMAT_VERSIONS.includes(exportData.backupFormatVersion)) {
    return { ok: false, error: `Nicht unterstützte HeyGen-Sicherungsformat-Version: ${exportData.backupFormatVersion}` };
  }
  if (exportData.applicationName !== APPLICATION_NAME) {
    return { ok: false, error: "Die Sicherung stammt nicht von der KI-Unternehmenszentrale." };
  }
  if (!Array.isArray(exportData.jobPackages)) {
    return { ok: false, error: "jobPackages muss ein Array sein." };
  }
  if (!Array.isArray(exportData.jobResults)) {
    return { ok: false, error: "jobResults muss ein Array sein." };
  }
  for (const pkg of exportData.jobPackages) {
    if (!isPlainObject(pkg) || typeof pkg.jobPackageId !== "string" || !pkg.jobPackageId) {
      return { ok: false, error: "Beschädigter Jobpaket-Eintrag in der HeyGen-Sicherung." };
    }
  }
  for (const result of exportData.jobResults) {
    if (!isPlainObject(result) || typeof result.jobPackageId !== "string" || !result.jobPackageId) {
      return { ok: false, error: "Beschädigter Ergebnis-Eintrag in der HeyGen-Sicherung." };
    }
  }
  if (containsForbiddenFieldNames(exportData)) {
    return { ok: false, error: "Die Sicherung enthält unzulässige Felder (Secrets/Tokens/Binärdaten) und wird abgewiesen." };
  }
  if (containsForbiddenSecretPatterns(exportData)) {
    return { ok: false, error: "Die Sicherung enthält mögliche Zugangsdaten oder Geheimnisse und wird abgewiesen." };
  }
  return { ok: true };
}

function buildRestorePreview(exportData, options = {}) {
  const now = options.now || Date.now();
  const staleCandidates = exportData.jobPackages.filter((pkg) => heygenJobPackage.isPackageExpired(pkg, now));
  const projectIds = [...new Set(exportData.jobPackages.map((pkg) => pkg.projectId).filter(Boolean))];
  return {
    jobPackageCount: exportData.jobPackages.length,
    jobResultCount: exportData.jobResults.length,
    staleCandidateCount: staleCandidates.length,
    staleCandidateJobPackageIds: staleCandidates.map((pkg) => pkg.jobPackageId),
    affectedProjectIds: projectIds,
    exportedAt: exportData.exportedAt,
  };
}

// Read-only Vorschau – schreibt nichts, startet nichts. Gleiches Muster wie
// v71-registry-backup.js#importV71MetadataPreview.
function previewHeygenBackupRestore(exportData, options = {}) {
  const validation = validateHeygenBackup(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  return {
    ok: true,
    preview: buildRestorePreview(exportData, options),
    startedHeygenJob: false,
    repeatedHandoff: false,
    publishedAnything: false,
    purchasedAnything: false,
    resetApprovals: false,
    writesAppliedToLiveStore: false,
  };
}

// Einzige erlaubte Schreibwirkung eines Restores (Auftrag Abschnitt M):
// abgelaufene Pakete werden als STALE markiert. Freigaben, Fingerprint,
// Inhalt und alle übrigen Felder bleiben unverändert. Es wird niemals ein
// Hand-off wiederholt, kein HeyGen-Job gestartet, nichts veröffentlicht und
// nichts gekauft. Ergebnis-Metadaten werden unverändert als Datensatz
// übernommen (reine Historie, kein aktiver Job).
function applyHeygenBackupRestore(exportData, options = {}) {
  const validation = validateHeygenBackup(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const paths = heygenStore.resolveHeygenStorePaths(options);
  const now = options.now || Date.now();
  let staleMarkedCount = 0;

  const restoredPackages = exportData.jobPackages.map((pkg) => {
    const isExpired = heygenJobPackage.isPackageExpired(pkg, now);
    const isTerminal = ["SUCCEEDED", "FAILED", "CANCELLED", "STALE"].includes(pkg.status);
    let restored = { ...pkg };
    if (isExpired && !isTerminal) {
      restored = {
        ...pkg,
        status: "STALE",
        blockReasons: [...new Set([...(pkg.blockReasons || []), "Paket ist nach Wiederherstellung abgelaufen (STALE)."])],
      };
      staleMarkedCount += 1;
    }
    heygenStore.savePackage(paths, restored);
    return restored;
  });

  exportData.jobResults.forEach((result) => {
    heygenStore.saveResult(paths, result.jobPackageId, result);
  });

  return {
    ok: true,
    restoredJobPackageCount: restoredPackages.length,
    restoredJobResultCount: exportData.jobResults.length,
    staleMarkedCount,
    startedHeygenJob: false,
    repeatedHandoff: false,
    publishedAnything: false,
    purchasedAnything: false,
    resetApprovals: false,
  };
}

module.exports = {
  HEYGEN_BACKUP_FORMAT_VERSION,
  SUPPORTED_HEYGEN_BACKUP_FORMAT_VERSIONS,
  APPLICATION_NAME,
  ALLOWED_ROOT_FIELDS,
  PACKAGE_EXPORT_FIELDS,
  RESULT_EXPORT_FIELDS,
  exportHeygenBackup,
  validateHeygenBackup,
  previewHeygenBackupRestore,
  applyHeygenBackupRestore,
};
