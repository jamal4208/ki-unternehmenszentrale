"use strict";

// V7.1 Phase B.1 – Backup/Restore für die Mandantenbasis (Testkunden/
// Marken/Kampagnen) und das kanonische Pilot-Review (Auftrag Abschnitt J).
//
// Exportiert AUSSCHLIESSLICH strukturierte Metadaten. Kunden/Marken/
// Kampagnen sind in dieser Phase ein statischer, code-definierter
// Testbestand (agency-tenant-registry.js) – ein Restore kann diesen Bestand
// daher strukturell validieren und eine Vorschau liefern, verändert aber
// keine Live-Registrierung, startet keinen Render, wiederholt keinen
// Hand-off, veröffentlicht nichts und setzt keine Freigabe neu.

const tenantRegistry = require("./agency-tenant-registry");
const pilotReview = require("./heygen-pilot-review");

const AGENCY_BACKUP_FORMAT_VERSION = "agency-phase-b1-backup-1";
const SUPPORTED_AGENCY_BACKUP_FORMAT_VERSIONS = Object.freeze([AGENCY_BACKUP_FORMAT_VERSION]);
const APPLICATION_NAME = "KI-Unternehmenszentrale";

const ALLOWED_ROOT_FIELDS = Object.freeze([
  "backupFormatVersion",
  "exportedAt",
  "applicationName",
  "scope",
  "customers",
  "brands",
  "campaigns",
  "pilotReviews",
  "summary",
  "safetyNotice",
]);

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
  "providerRawResponse",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function exportAgencyBackup(options = {}) {
  const customers = tenantRegistry.listCustomers();
  const brands = tenantRegistry.listBrands();
  const campaigns = tenantRegistry.listCampaigns();
  const pilotReviews = [pilotReview.getCanonicalFirstPilotReview()];

  return {
    backupFormatVersion: AGENCY_BACKUP_FORMAT_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    applicationName: APPLICATION_NAME,
    scope:
      "V7.1 Phase B.1 – Testmandanten-/Marken-/Kampagnenmetadaten und Pilot-Review (keine echten Kundendaten, kein Rendermaterial).",
    customers,
    brands,
    campaigns,
    pilotReviews,
    summary: {
      customerCount: customers.length,
      brandCount: brands.length,
      campaignCount: campaigns.length,
      pilotReviewCount: pilotReviews.length,
    },
    safetyNotice:
      "Diese Sicherung enthält ausschließlich strukturierte Testmandanten-Metadaten und das kanonische Pilot-Review. " +
      "Keine echten Kundendaten, keine Videos/Bilder/Audios, keine API-Keys, keine Tokens, keine Provider-" +
      "Komplettantworten. Ein Restore verändert die code-definierte Mandantenbasis nicht, startet keinen HeyGen-Job, " +
      "wiederholt keinen Hand-off, veröffentlicht nichts und setzt keine Freigabe neu.",
  };
}

function validateAgencyBackup(exportData) {
  if (!isPlainObject(exportData)) {
    return { ok: false, error: "Ungültiges Agentur-Sicherungsformat: Wurzel muss ein Objekt sein." };
  }
  const unexpectedFields = Object.keys(exportData).filter((key) => !ALLOWED_ROOT_FIELDS.includes(key));
  if (unexpectedFields.length > 0) {
    return { ok: false, error: `Unerwartete Felder in der Agentur-Sicherung: ${unexpectedFields.join(", ")}` };
  }
  if (!SUPPORTED_AGENCY_BACKUP_FORMAT_VERSIONS.includes(exportData.backupFormatVersion)) {
    return { ok: false, error: `Nicht unterstützte Agentur-Sicherungsformat-Version: ${exportData.backupFormatVersion}` };
  }
  if (exportData.applicationName !== APPLICATION_NAME) {
    return { ok: false, error: "Die Sicherung stammt nicht von der KI-Unternehmenszentrale." };
  }
  if (!Array.isArray(exportData.customers) || !Array.isArray(exportData.brands) || !Array.isArray(exportData.campaigns)) {
    return { ok: false, error: "customers/brands/campaigns müssen Arrays sein." };
  }
  if (!Array.isArray(exportData.pilotReviews)) {
    return { ok: false, error: "pilotReviews muss ein Array sein." };
  }
  if (containsForbiddenFieldNames(exportData)) {
    return { ok: false, error: "Die Sicherung enthält unzulässige Felder (Secrets/Tokens/Binärdaten) und wird abgewiesen." };
  }
  if (containsForbiddenSecretPatterns(exportData)) {
    return { ok: false, error: "Die Sicherung enthält mögliche Zugangsdaten oder Geheimnisse und wird abgewiesen." };
  }
  return { ok: true };
}

// Read-only Vorschau. Die Mandantenbasis ist in dieser Phase code-definiert
// (keine produktive Kundenanlage) – ein Restore kann daher ausschließlich
// prüfen, ob der importierte Bestand mit der aktuellen, kanonischen
// Registry übereinstimmt (Mandantentrennung bleibt gewahrt). Es wird nichts
// geschrieben, kein Job gestartet, kein Hand-off wiederholt, nichts
// veröffentlicht.
function previewAgencyBackupRestore(exportData) {
  const validation = validateAgencyBackup(exportData);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const currentIntegrity = tenantRegistry.checkRegistryIntegrity();
  const currentCustomerIds = new Set(tenantRegistry.listCustomers().map((c) => c.customerId));
  const importedCustomerIds = exportData.customers.map((c) => c.customerId);
  const unknownCustomerIds = importedCustomerIds.filter((id) => !currentCustomerIds.has(id));
  const matchesCurrentRegistry = unknownCustomerIds.length === 0 && currentIntegrity.ok;

  return {
    ok: true,
    preview: {
      customerCount: exportData.customers.length,
      brandCount: exportData.brands.length,
      campaignCount: exportData.campaigns.length,
      pilotReviewCount: exportData.pilotReviews.length,
      unknownCustomerIds,
      matchesCurrentRegistry,
      exportedAt: exportData.exportedAt,
    },
    startedHeygenJob: false,
    repeatedHandoff: false,
    publishedAnything: false,
    purchasedAnything: false,
    resetApprovals: false,
    writesAppliedToLiveStore: false,
    tenantSeparationPreserved: true,
  };
}

module.exports = {
  AGENCY_BACKUP_FORMAT_VERSION,
  SUPPORTED_AGENCY_BACKUP_FORMAT_VERSIONS,
  APPLICATION_NAME,
  ALLOWED_ROOT_FIELDS,
  exportAgencyBackup,
  validateAgencyBackup,
  previewAgencyBackupRestore,
};
