"use strict";

// V7.1 Phase A – additive Backup/Restore-Erweiterung für die neuen sicheren
// Metadaten (Dokumentregister, Werkzeug-/Lizenzregister, Plugin-Status).
//
// Bewusst ein separates, neues Schema (nicht Teil von local-data-backup.js):
// local-data-backup.js bleibt unverändert und sichert ausschließlich die
// bestehenden Browser-localStorage-Bereiche (Schema v1, Tageslauf v1/v2).
// Diese Datei sichert stattdessen die neuen, dateisystembasierten V7.1-
// Register, die nicht in localStorage liegen.
//
// Restore ist in Phase A bewusst konservativ: er validiert Schema, Version
// und Inhalt vollständig und liefert eine Vorschau, schreibt aber nichts in
// das laufende Dokumentregister zurück (kein Überschreiben von
// Originaldateien, kein Start irgendeiner Aktion). Ein produktiver,
// schreibender Restore-Pfad für Dokumentmetadaten wäre eine eigene,
// sorgfältig zu entwerfende Erweiterung (Konfliktbehandlung, verwaiste
// Referenzen auf fehlende Originaldateien) und ist bewusst nicht Teil dieser
// Phase, um keine unsichere Schnelllösung zu bauen.

const documentRegistry = require("./document-registry");
const toolRegistry = require("./tool-registry");
const pluginGateway = require("./plugin-gateway");

const V71_EXPORT_FORMAT_VERSION = "v71-phase-a-metadata-1";
const SUPPORTED_V71_EXPORT_FORMAT_VERSIONS = Object.freeze([V71_EXPORT_FORMAT_VERSION]);
const APPLICATION_NAME = "KI-Unternehmenszentrale";

const ALLOWED_ROOT_FIELDS = Object.freeze([
  "exportFormatVersion",
  "exportedAt",
  "applicationName",
  "scope",
  "documents",
  "toolRegistrySnapshot",
  "pluginStatusSnapshot",
  "summary",
  "safetyNotice",
]);

const FORBIDDEN_DOCUMENT_FIELDS = Object.freeze(["originalContent", "fileBuffer", "base64Content"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeDocumentForExport(record) {
  // Nur Metadaten – niemals Dateiinhalte. document-registry.js hält ohnehin
  // niemals Originaldateiinhalte im JSON-Datensatz; dies ist eine zusätzliche
  // defensive Absicherung gegen künftige Feldänderungen.
  const { ...safe } = record;
  FORBIDDEN_DOCUMENT_FIELDS.forEach((field) => delete safe[field]);
  return safe;
}

function exportV71Metadata(options = {}) {
  const documents = documentRegistry.listDocuments({}, options).map(sanitizeDocumentForExport);
  const toolRegistrySnapshot = toolRegistry.listTools();
  const pluginStatusSnapshot = pluginGateway.listPluginStatuses(options).map((status) => ({
    pluginId: status.pluginId,
    toolId: status.toolId,
    adapterType: status.adapterType,
    status: status.status,
    dataClassificationLimit: status.dataClassificationLimit,
    readOnly: status.readOnly,
    externalWrite: status.externalWrite,
    publication: status.publication,
    costBearing: status.costBearing,
    requiredApproval: status.requiredApproval,
    fallbackMode: status.fallbackMode,
    // lastCheckedAt/healthStatus bewusst ausgeschlossen: Momentaufnahmen ohne
    // dauerhaften Aussagewert, kein Grund für einen Backup-Eintrag.
  }));

  return {
    exportFormatVersion: V71_EXPORT_FORMAT_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    applicationName: APPLICATION_NAME,
    scope: "V7.1 Phase A – Dokumentmetadaten, Werkzeug-/Lizenzregister-Schnappschuss, Plugin-Status-Schnappschuss",
    documents,
    toolRegistrySnapshot,
    pluginStatusSnapshot,
    summary: {
      documentCount: documents.length,
      toolCount: toolRegistrySnapshot.length,
      pluginCount: pluginStatusSnapshot.length,
    },
    safetyNotice:
      "Diese Sicherung enthält ausschließlich sichere Metadaten. Keine Originaldateien, keine API-Keys, keine Tokens, " +
      "keine Zugangsdaten, keine App-Support-Workspace-Inhalte, keine Quarantäne-Dateiinhalte. Ein Restore schreibt " +
      "nichts in das laufende Dokumentregister zurück, startet kein Plugin, erzeugt keine externe Übertragung, kauft " +
      "nichts und veröffentlicht nichts.",
  };
}

function containsForbiddenSecrets(value) {
  const text = JSON.stringify(value);
  const patterns = [
    /AIRTABLE_API_KEY/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    /"apiKey"\s*:\s*"[^"]{4,}"/i,
    /"token"\s*:\s*"[^"]{8,}"/i,
    /"secret"\s*:\s*"[^"]{4,}"/i,
    /sk-[A-Za-z0-9]{10,}/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function validateV71Export(exportData) {
  if (!isPlainObject(exportData)) {
    return { ok: false, error: "Ungültiges V7.1-Exportformat: Wurzel muss ein Objekt sein." };
  }
  const unexpectedFields = Object.keys(exportData).filter((key) => !ALLOWED_ROOT_FIELDS.includes(key));
  if (unexpectedFields.length > 0) {
    return { ok: false, error: `Unerwartete V7.1-Exportfelder: ${unexpectedFields.join(", ")}` };
  }
  if (typeof exportData.exportFormatVersion !== "string") {
    return { ok: false, error: "V7.1-Exportformat-Version fehlt oder ist ungültig." };
  }
  if (!SUPPORTED_V71_EXPORT_FORMAT_VERSIONS.includes(exportData.exportFormatVersion)) {
    return { ok: false, error: `Nicht unterstützte V7.1-Exportformat-Version: ${exportData.exportFormatVersion}` };
  }
  if (exportData.applicationName !== APPLICATION_NAME) {
    return { ok: false, error: "Die Sicherung stammt nicht von der KI-Unternehmenszentrale." };
  }
  if (!Array.isArray(exportData.documents)) {
    return { ok: false, error: "documents muss ein Array sein." };
  }
  if (!Array.isArray(exportData.toolRegistrySnapshot)) {
    return { ok: false, error: "toolRegistrySnapshot muss ein Array sein." };
  }
  if (!Array.isArray(exportData.pluginStatusSnapshot)) {
    return { ok: false, error: "pluginStatusSnapshot muss ein Array sein." };
  }
  for (const doc of exportData.documents) {
    if (!isPlainObject(doc) || typeof doc.documentId !== "string") {
      return { ok: false, error: "Beschädigter Dokumenteintrag in der Sicherung." };
    }
    for (const forbiddenField of FORBIDDEN_DOCUMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(doc, forbiddenField)) {
        return { ok: false, error: `Sicherung enthält unzulässiges Feld ${forbiddenField} (Originaldatei-Inhalt).` };
      }
    }
  }
  if (containsForbiddenSecrets(exportData)) {
    return { ok: false, error: "Die Sicherung enthält mögliche Zugangsdaten oder Geheimnisse und wird abgewiesen." };
  }
  return { ok: true };
}

function buildRestorePreview(exportData) {
  const classificationCounts = { NORMAL: 0, SENSITIVE: 0, SECRET: 0 };
  exportData.documents.forEach((doc) => {
    if (classificationCounts[doc.classification] !== undefined) {
      classificationCounts[doc.classification] += 1;
    }
  });
  const projectIds = [...new Set(exportData.documents.map((doc) => doc.projectId).filter(Boolean))];
  return {
    documentCount: exportData.documents.length,
    toolCount: exportData.toolRegistrySnapshot.length,
    pluginCount: exportData.pluginStatusSnapshot.length,
    classificationCounts,
    affectedProjectIds: projectIds,
    exportedAt: exportData.exportedAt,
  };
}

// Bewusst ohne Schreibzugriff (siehe Kommentar am Dateikopf): validiert
// streng und liefert eine Vorschau, verändert aber nie das laufende
// Dokumentregister, den Werkzeugkatalog oder den Plugin-Status.
function importV71MetadataPreview(exportData) {
  const validation = validateV71Export(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  return {
    ok: true,
    preview: buildRestorePreview(exportData),
    startedPlugin: false,
    startedExternalTransfer: false,
    purchasedAnything: false,
    publishedAnything: false,
    overwroteOriginalFiles: false,
    writesAppliedToLiveRegistry: false,
  };
}

module.exports = {
  V71_EXPORT_FORMAT_VERSION,
  SUPPORTED_V71_EXPORT_FORMAT_VERSIONS,
  APPLICATION_NAME,
  ALLOWED_ROOT_FIELDS,
  exportV71Metadata,
  validateV71Export,
  importV71MetadataPreview,
};
