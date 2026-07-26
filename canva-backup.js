"use strict";

// V7.1 Phase C – Backup/Restore für Canva-Auftragspakete und
// Ergebnis-Metadaten (Auftrag Abschnitt O).
//
// Exportiert AUSSCHLIESSLICH strukturierte Metadaten aus canva-store.js:
// Jobpaket-Metadaten, Mandantenbindung, Briefing, Freigabestatus,
// Kandidaten-IDs, ausgewählte Kandidaten-ID, Design-ID, Transaktionsstatus,
// Ergebnisreferenzen, Kostenstatus, Kundenreviewstatus. NIEMALS:
// Canva-Credentials, Tokens, vollständige Canva-Antworten, Bilder/Videos,
// private Brand-Kit-Assets, private Templates, temporäre
// Editing-Operation-Payloads, Session-Cookies, App-Support-Dateien.
//
// Restore startet KEINE Generierung, erzeugt KEIN Design, startet KEINE
// Editing-Transaktion, speichert KEINE Bearbeitung, veröffentlicht nichts,
// lädt keine Assets herunter, setzt Freigaben nicht neu. Die einzige
// erlaubte Schreibwirkung ist das Markieren abgelaufener Aufträge als STALE.

const canvaStore = require("./canva-store");
const canvaDesignJobPackage = require("./canva-design-job-package");
// V7.1 Phase C.1 (Auftrag Abschnitt H) – zusätzlich die kanonische
// Pilot-Ergebnisakte des real durchgeführten Canva-Pilotlaufs. Ausschließlich
// bereits durch canva-pilot-result-record.js/canva-pilot-store.js
// strukturierte, sichere Metadaten – niemals Bilder, Canva-Dateien,
// Vorschaubilder, Tokens, Credentials, Provider-Komplettantworten, private
// Canva-URLs, Brand-Kit-Assets oder App-Support-Dateien.
const canvaPilotStore = require("./canva-pilot-store");

const CANVA_BACKUP_FORMAT_VERSION = "canva-phase-c-backup-1";
const SUPPORTED_CANVA_BACKUP_FORMAT_VERSIONS = Object.freeze([CANVA_BACKUP_FORMAT_VERSION]);
const APPLICATION_NAME = "KI-Unternehmenszentrale";

const ALLOWED_ROOT_FIELDS = Object.freeze([
  "backupFormatVersion",
  "exportedAt",
  "applicationName",
  "scope",
  "jobPackages",
  "jobResults",
  "editingTransactions",
  "pilotResults",
  "summary",
  "safetyNotice",
]);

// Strikte Allowlist je Jobpaket-Export – bewusst kein "...rest" Spread,
// damit künftige, versehentlich hinzugefügte Felder (z. B. interne Pfade)
// niemals automatisch mitexportiert werden.
const PACKAGE_EXPORT_FIELDS = Object.freeze([
  "schemaVersion",
  "jobPackageId",
  "sourceRunId",
  "customerId",
  "brandId",
  "campaignId",
  "projectId",
  "createdAt",
  "createdBy",
  "requestingAgentId",
  "expiresAt",
  "purpose",
  "designOperation",
  "designType",
  "title",
  "brief",
  "primaryMessage",
  "callToAction",
  "targetAudience",
  "tone",
  "language",
  "dimensions",
  "brandKitReference",
  "brandTemplateReference",
  "sourceDesignReference",
  "sourceAssetReferences",
  "textContent",
  "visualDirection",
  "requiredPages",
  "outputPurpose",
  "dataClassification",
  "containsPersonalData",
  "containsCustomerData",
  "containsHealthData",
  "containsChildren",
  "assetRightsConfirmed",
  "brandRightsConfirmed",
  "externalTransferApproved",
  "internalCostApprovalStatus",
  "costPackageStatus",
  "internalCostCeiling",
  "customerPackageId",
  "billableUnit",
  "briefingApproved",
  "assetsAndRightsApproved",
  "customerDraftApprovalStatus",
  "customerChangeRequestNote",
  "publicationApprovalStatus",
  "canvaFolderReference",
  "selectedCandidateId",
  "allowedCanvaActions",
  "forbiddenActions",
  "packageFingerprint",
  "status",
  "blockReasons",
]);

const RESULT_EXPORT_FIELDS = Object.freeze([
  "jobPackageId",
  // V7.1 Phase C – Ergebnisrückgaben sind mandantengebunden (Auftrag
  // Abschnitt D, Regel 17); die Bindung wird von canva-store.js abgeleitet,
  // nie vom Client übernommen.
  "customerId",
  "brandId",
  "campaignId",
  "projectId",
  "provider",
  "providerOperation",
  "providerJobId",
  "candidateIds",
  "selectedCandidateId",
  "designId",
  "editingTransactionId",
  "providerStatus",
  "localValidationStatus",
  "previewReference",
  "editReference",
  "viewReference",
  "pageCount",
  "designType",
  "completedAt",
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

// Editing-Transaktionen: Operationsinhalte selbst sind "temporäre
// Editing-Operation-Payloads" (Auftrag Abschnitt O, ausdrücklich
// ausgeschlossen) – exportiert wird nur der Fingerprint und Statusverlauf,
// niemals die konkreten Operationen oder die Vorschau-URL.
const EDITING_TRANSACTION_EXPORT_FIELDS = Object.freeze([
  "editingTransactionId",
  "jobPackageId",
  "designId",
  "customerId",
  "brandId",
  "campaignId",
  "status",
  "operationsFingerprint",
  "startedAt",
  "updatedAt",
]);

// V7.1 Phase C.1 (Auftrag Abschnitt H) – strikte Allowlist je Pilot-
// Ergebnisakte. Zulässig: Pilot-IDs, Design-ID, Titel, Status, interne
// Bewertungsnotizen (evidence), Kundenfeedback (feedbackHistory),
// Änderungshistorie (changeRequestHistory), Entscheidungsverlauf
// (decisionHistory), Mandanten-Fingerprint. Nicht zulässig und daher hier
// bewusst NICHT gelistet: Bilder, Canva-Dateien, Vorschaubilder, Tokens,
// Credentials, Provider-Komplettantworten, private Canva-URLs,
// Brand-Kit-Assets, App-Support-Dateien – das Datenmodell selbst enthält
// diese Felder ohnehin nie (siehe canva-pilot-result-record.js).
const PILOT_RESULT_EXPORT_FIELDS = Object.freeze([
  "schemaVersion",
  "pilotId",
  "toolId",
  "connectorType",
  "customerId",
  "brandId",
  "campaignId",
  "projectId",
  "jobPackageId",
  "providerJobId",
  "candidateId",
  "designId",
  "designTitle",
  "designType",
  "pageCount",
  "costPackageStatus",
  "providerExecutionStatus",
  "internalReviewStatus",
  "customerReviewStatus",
  "publicationApprovalStatus",
  // V7.1 Phase C.1.1 – kanonisches, rollenbasiertes Reviewmodell (additiv).
  "serviceTier",
  "reviewMode",
  "ownerReviewRequired",
  "customerSelfReviewAllowed",
  "humanReviewRequired",
  "riskEscalationRequired",
  "reviewerRole",
  "reviewedByActorId",
  "qualityReviewStatus",
  "createdAt",
  "updatedAt",
  "evidence",
  "feedbackHistory",
  "changeRequestHistory",
  "agentQaHistory",
  "decisionHistory",
  "immutableTenantFingerprint",
]);

// Felder, die unter keinen Umständen im Export auftauchen dürfen, selbst
// wenn sie sich künftig versehentlich in einen Datensatz einschleichen
// (defensiver Zweitschutz, analog heygen-backup.js).
const FORBIDDEN_FIELD_NAMES = Object.freeze([
  "apiKey",
  "credential",
  "credentials",
  "token",
  "accessToken",
  "secret",
  "designBuffer",
  "imageBuffer",
  "videoBuffer",
  "fileBuffer",
  "base64Content",
  "filePath",
  "appSupportPath",
  "handoffPayload",
  "providerRawResponse",
  "operations",
  "sessionCookie",
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

// Private Brand-Kit-/Template-Referenzen werden nicht als exportierbares
// Metadatum dupliziert (Auftrag Abschnitt O: "private Brand-Kit-Assets" und
// "private Templates" bleiben ausgeschlossen). Nur ihre Bezeichner-Existenz
// bleibt zur Nachvollziehbarkeit erhalten, niemals bestätigte Auswahldetails
// eines echten, privaten Templates.
function sanitizeBrandKitReferenceForBackup(brandKitReference) {
  if (!brandKitReference) return null;
  return { brandKitId: "[REFERENCE-ONLY]", confirmedSelected: brandKitReference.confirmedSelected === true };
}

function sanitizeBrandTemplateReferenceForBackup(brandTemplateReference) {
  if (!brandTemplateReference) return null;
  return { templateId: "[REFERENCE-ONLY]", confirmedSelected: brandTemplateReference.confirmedSelected === true };
}

function sanitizePackageForExport(record) {
  const picked = pickFields(record, PACKAGE_EXPORT_FIELDS);
  picked.brandKitReference = sanitizeBrandKitReferenceForBackup(record.brandKitReference);
  picked.brandTemplateReference = sanitizeBrandTemplateReferenceForBackup(record.brandTemplateReference);
  return picked;
}

function sanitizeResultForExport(record) {
  return pickFields(record, RESULT_EXPORT_FIELDS);
}

function sanitizeEditingTransactionForExport(record) {
  return pickFields(record, EDITING_TRANSACTION_EXPORT_FIELDS);
}

function sanitizePilotResultForExport(record) {
  return pickFields(record, PILOT_RESULT_EXPORT_FIELDS);
}

function exportCanvaBackup(options = {}) {
  const paths = canvaStore.resolveCanvaStorePaths(options);
  const packages = canvaStore.listPackages(paths, options.filter).map(sanitizePackageForExport);
  const results = canvaStore.listResults(paths).map(sanitizeResultForExport);
  const editingTransactions = canvaStore.listEditingTransactions(paths).map(sanitizeEditingTransactionForExport);
  const pilotStorePaths = canvaPilotStore.resolveCanvaPilotStorePaths(options);
  const pilotResults = canvaPilotStore.listPilotResultRecords(pilotStorePaths, options.filter).map(sanitizePilotResultForExport);

  return {
    backupFormatVersion: CANVA_BACKUP_FORMAT_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    applicationName: APPLICATION_NAME,
    scope:
      "V7.1 Phase C/C.1 – Canva-Jobpaket-Metadaten, Ergebnis-Metadaten, Editing-Transaktionsstatus und kanonische " +
      "Pilot-Ergebnisakte(n) mit Kundenfeedback-Historie (kein Rendermaterial).",
    jobPackages: packages,
    jobResults: results,
    editingTransactions,
    pilotResults,
    summary: {
      jobPackageCount: packages.length,
      jobResultCount: results.length,
      editingTransactionCount: editingTransactions.length,
      pilotResultCount: pilotResults.length,
    },
    safetyNotice:
      "Diese Sicherung enthält ausschließlich strukturierte Metadaten. Keine Canva-Credentials, keine Tokens, keine " +
      "vollständigen Canva-Antworten, keine Bilder oder Videos, keine privaten Brand-Kit-Assets, keine privaten " +
      "Templates, keine temporären Editing-Operation-Payloads, keine Session-Cookies, keine App-Support-Dateien, " +
      "keine privaten Canva-URLs. Ein Restore startet keine Generierung, erzeugt kein Design, startet keine " +
      "Editing-Transaktion, speichert keine Bearbeitung, veröffentlicht nichts, lädt keine Assets herunter, lädt " +
      "keine Providerdaten nach und setzt keine Freigabe neu. Die einzige Schreibwirkung eines Restores ist das " +
      "Markieren bereits abgelaufener Aufträge als STALE.",
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

function validateCanvaBackup(exportData) {
  if (!isPlainObject(exportData)) {
    return { ok: false, error: "Ungültiges Canva-Sicherungsformat: Wurzel muss ein Objekt sein." };
  }
  const unexpectedFields = Object.keys(exportData).filter((key) => !ALLOWED_ROOT_FIELDS.includes(key));
  if (unexpectedFields.length > 0) {
    return { ok: false, error: `Unerwartete Felder in der Canva-Sicherung: ${unexpectedFields.join(", ")}` };
  }
  if (!SUPPORTED_CANVA_BACKUP_FORMAT_VERSIONS.includes(exportData.backupFormatVersion)) {
    return { ok: false, error: `Nicht unterstützte Canva-Sicherungsformat-Version: ${exportData.backupFormatVersion}` };
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
  if (!Array.isArray(exportData.editingTransactions)) {
    return { ok: false, error: "editingTransactions muss ein Array sein." };
  }
  // pilotResults ist additiv (Phase C.1); ältere Sicherungen aus Phase C
  // enthalten es noch nicht und werden weiterhin akzeptiert.
  if (exportData.pilotResults !== undefined && !Array.isArray(exportData.pilotResults)) {
    return { ok: false, error: "pilotResults muss ein Array sein." };
  }
  for (const pkg of exportData.jobPackages) {
    if (!isPlainObject(pkg) || typeof pkg.jobPackageId !== "string" || !pkg.jobPackageId) {
      return { ok: false, error: "Beschädigter Jobpaket-Eintrag in der Canva-Sicherung." };
    }
  }
  for (const result of exportData.jobResults) {
    if (!isPlainObject(result) || typeof result.jobPackageId !== "string" || !result.jobPackageId) {
      return { ok: false, error: "Beschädigter Ergebnis-Eintrag in der Canva-Sicherung." };
    }
  }
  for (const transaction of exportData.editingTransactions) {
    if (!isPlainObject(transaction) || typeof transaction.editingTransactionId !== "string" || !transaction.editingTransactionId) {
      return { ok: false, error: "Beschädigter Editing-Transaktions-Eintrag in der Canva-Sicherung." };
    }
  }
  for (const pilotResult of exportData.pilotResults || []) {
    if (!isPlainObject(pilotResult) || typeof pilotResult.pilotId !== "string" || !pilotResult.pilotId) {
      return { ok: false, error: "Beschädigter Pilot-Ergebnisakte-Eintrag in der Canva-Sicherung." };
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
  const staleCandidates = exportData.jobPackages.filter((pkg) => canvaDesignJobPackage.isPackageExpired(pkg, now));
  const projectIds = [...new Set(exportData.jobPackages.map((pkg) => pkg.projectId).filter(Boolean))];
  const affectedCustomerIds = [...new Set(exportData.jobPackages.map((pkg) => pkg.customerId).filter(Boolean))];
  return {
    jobPackageCount: exportData.jobPackages.length,
    jobResultCount: exportData.jobResults.length,
    editingTransactionCount: exportData.editingTransactions.length,
    pilotResultCount: (exportData.pilotResults || []).length,
    staleCandidateCount: staleCandidates.length,
    staleCandidateJobPackageIds: staleCandidates.map((pkg) => pkg.jobPackageId),
    affectedProjectIds: projectIds,
    affectedCustomerIds,
    exportedAt: exportData.exportedAt,
  };
}

// Read-only Vorschau – schreibt nichts, startet nichts. Gleiches Muster wie
// heygen-backup.js#previewHeygenBackupRestore.
function previewCanvaBackupRestore(exportData, options = {}) {
  const validation = validateCanvaBackup(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  return {
    ok: true,
    preview: buildRestorePreview(exportData, options),
    startedGeneration: false,
    createdDesign: false,
    startedEditingTransaction: false,
    savedEdit: false,
    publishedAnything: false,
    downloadedAssets: false,
    resetApprovals: false,
    writesAppliedToLiveStore: false,
  };
}

// Einzige erlaubte Schreibwirkung eines Restores (Auftrag Abschnitt O):
// abgelaufene Aufträge werden als STALE markiert. Freigaben, Fingerprint,
// Inhalt und alle übrigen Felder bleiben unverändert. Es wird niemals eine
// Generierung gestartet, kein Design erzeugt, keine Editing-Transaktion
// gestartet, nichts gespeichert, nichts veröffentlicht und nichts
// heruntergeladen. Ergebnis-/Transaktions-Metadaten werden unverändert als
// Datensatz übernommen (reine Historie, kein aktiver Auftrag).
function applyCanvaBackupRestore(exportData, options = {}) {
  const validation = validateCanvaBackup(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const paths = canvaStore.resolveCanvaStorePaths(options);
  const now = options.now || Date.now();
  let staleMarkedCount = 0;
  // V7.1 Phase C (Auftrag Abschnitt D/O) – ein Restore darf die
  // Mandantenzuordnung niemals verändern. Ein Datensatz, der einem bereits
  // anders zugeordneten Jobpaket widerspricht, wird abgewiesen statt den
  // gesamten Restore abzubrechen oder die Zuordnung stillschweigend zu
  // überschreiben.
  const rejectedJobPackageIds = [];
  const rejectedJobResultJobPackageIds = [];
  const rejectedEditingTransactionIds = [];
  const rejectedPilotResultIds = [];

  const restoredPackages = exportData.jobPackages
    .map((pkg) => {
      const isExpired = canvaDesignJobPackage.isPackageExpired(pkg, now);
      const isTerminal = ["FAILED", "CANCELLED", "STALE"].includes(pkg.status);
      let restored = { ...pkg };
      if (isExpired && !isTerminal) {
        restored = {
          ...pkg,
          status: "STALE",
          blockReasons: [...new Set([...(pkg.blockReasons || []), "Auftrag ist nach Wiederherstellung abgelaufen (STALE)."])],
        };
        staleMarkedCount += 1;
      }
      try {
        canvaStore.savePackage(paths, restored);
        return restored;
      } catch (_error) {
        rejectedJobPackageIds.push(pkg.jobPackageId);
        return null;
      }
    })
    .filter(Boolean);

  const restoredResultCount = exportData.jobResults.filter((result) => {
    try {
      canvaStore.saveResult(paths, result.jobPackageId, result);
      return true;
    } catch (_error) {
      rejectedJobResultJobPackageIds.push(result.jobPackageId);
      return false;
    }
  }).length;

  const restoredEditingTransactionCount = exportData.editingTransactions.filter((transaction) => {
    try {
      canvaStore.saveEditingTransaction(paths, transaction);
      return true;
    } catch (_error) {
      rejectedEditingTransactionIds.push(transaction.editingTransactionId);
      return false;
    }
  }).length;

  // V7.1 Phase C.1 (Auftrag Abschnitt H) – Pilot-Ergebnisakten werden
  // unverändert als Datensatz übernommen (reine Historie inklusive
  // Feedback-/Änderungs-/Entscheidungsverlauf). Kein Feld dieses Datensatzes
  // löst eine Canva-Aktion, eine Veröffentlichung oder eine neue
  // Kosten-/Rechtefreigabe aus; die Mandantenbindung bleibt unveränderlich
  // (siehe canva-pilot-store.js#assertNoTenantReassignment).
  const pilotStorePaths = canvaPilotStore.resolveCanvaPilotStorePaths(options);
  const restoredPilotResultCount = (exportData.pilotResults || []).filter((pilotResult) => {
    try {
      canvaPilotStore.savePilotResultRecord(pilotStorePaths, pilotResult);
      return true;
    } catch (_error) {
      rejectedPilotResultIds.push(pilotResult.pilotId);
      return false;
    }
  }).length;

  return {
    ok: true,
    restoredJobPackageCount: restoredPackages.length,
    restoredJobResultCount: restoredResultCount,
    restoredEditingTransactionCount,
    restoredPilotResultCount,
    rejectedJobPackageIds,
    rejectedJobResultJobPackageIds,
    rejectedEditingTransactionIds,
    rejectedPilotResultIds,
    tenantSeparationPreserved: true,
    staleMarkedCount,
    startedGeneration: false,
    createdDesign: false,
    startedEditingTransaction: false,
    savedEdit: false,
    publishedAnything: false,
    downloadedAssets: false,
    resetApprovals: false,
  };
}

module.exports = {
  CANVA_BACKUP_FORMAT_VERSION,
  SUPPORTED_CANVA_BACKUP_FORMAT_VERSIONS,
  APPLICATION_NAME,
  ALLOWED_ROOT_FIELDS,
  PACKAGE_EXPORT_FIELDS,
  RESULT_EXPORT_FIELDS,
  EDITING_TRANSACTION_EXPORT_FIELDS,
  PILOT_RESULT_EXPORT_FIELDS,
  exportCanvaBackup,
  validateCanvaBackup,
  previewCanvaBackupRestore,
  applyCanvaBackupRestore,
};
