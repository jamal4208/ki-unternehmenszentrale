"use strict";

// V7.1 Phase B.1 – kleine, kanonische Mandantenbasis für den späteren
// mandantenfähigen Marketing-Agenturbetrieb (Auftrag Abschnitt C/D).
//
// Enthält AUSSCHLIESSLICH neutrale Testmandanten – keine echten Kundendaten,
// keine echten Kontaktdaten, keine echten Marken. Dieses Modul ist die
// EINZIGE Quelle für Kunden-/Marken-/Kampagnendaten (keine zweite,
// parallele Registry). project-registry.js bleibt weiterhin die einzige
// Projektquelle; diese Registry referenziert Projekte ausschließlich über
// ihre bestehende projectId, ohne sie zu duplizieren.
//
// Dieses Modul enthält keine Netzwerklogik, keine Zugangsdaten und keine
// Schreibfunktion, die Kunden dynamisch anlegt – die Mandantenbasis ist
// bewusst ein kleiner, statischer Testbestand (keine produktive
// Kundenanlage in dieser Phase, siehe Auftrag Arbeitsmodus).

const projectRegistry = require("./project-registry");

const CUSTOMER_STATUSES = Object.freeze(["ACTIVE_TEST_TENANT", "INACTIVE"]);
const BRAND_STATUSES = Object.freeze(["ACTIVE", "PAUSED"]);
const CAMPAIGN_STATUSES = Object.freeze(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]);

// Bewusst konservativ: im ersten Agenturbetrieb ist ausschließlich NORMAL
// erlaubt (siehe heygen-job-package.js, Auftrag Abschnitt B/E).
const TENANT_DATA_CLASSIFICATION_LIMITS = Object.freeze(["NORMAL"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// Kanonischer Testbestand. Ausschließlich fiktive, klar als Test erkennbare
// Namen. Keine echten Kunden, keine echten Kontaktdaten.
// ---------------------------------------------------------------------------

const CUSTOMERS = freezeDeep([
  freezeDeep({
    customerId: "test-customer-fiktives-cafe",
    displayName: "Testmandant – Fiktives Café Sonnenseite (kein echter Kunde)",
    status: "ACTIVE_TEST_TENANT",
    dataClassificationLimit: "NORMAL",
    externalProcessingAllowed: true,
    monthlyBudget: null,
    currency: "EUR",
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
  freezeDeep({
    customerId: "test-customer-fiktives-fitnessstudio",
    displayName: "Testmandant – Fiktives Fitnessstudio Nordlicht (kein echter Kunde)",
    status: "ACTIVE_TEST_TENANT",
    dataClassificationLimit: "NORMAL",
    externalProcessingAllowed: true,
    monthlyBudget: null,
    currency: "EUR",
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
]);

const BRANDS = freezeDeep([
  freezeDeep({
    brandId: "test-brand-fiktives-cafe",
    customerId: "test-customer-fiktives-cafe",
    displayName: "Fiktives Café Sonnenseite – Testmarke",
    brandStatus: "ACTIVE",
    allowedProjects: freezeDeep(["ki-unternehmenszentrale"]),
    brandAssetReferences: freezeDeep([]),
    tone: "neutral, freundlich, keine echte Werbeaussage",
    forbiddenClaims: freezeDeep(["Heilversprechen", "Preisgarantie", "Verfügbarkeitsgarantie"]),
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
  freezeDeep({
    brandId: "test-brand-fiktives-fitnessstudio",
    customerId: "test-customer-fiktives-fitnessstudio",
    displayName: "Fiktives Fitnessstudio Nordlicht – Testmarke",
    brandStatus: "ACTIVE",
    allowedProjects: freezeDeep(["marketing-agentur-os"]),
    brandAssetReferences: freezeDeep([]),
    tone: "neutral, motivierend, keine echte Gesundheitsaussage",
    forbiddenClaims: freezeDeep(["Gesundheitsversprechen", "Erfolgsgarantie"]),
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
]);

const CAMPAIGNS = freezeDeep([
  freezeDeep({
    campaignId: "test-campaign-fiktives-cafe-pilot",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    projectId: "ki-unternehmenszentrale",
    title: "Testkampagne – neutraler Café-Pilot (nicht abrechenbar)",
    purpose: "Interner, neutraler HeyGen-Connector-Pilot ohne reale Marke.",
    status: "ACTIVE",
    budgetCeiling: null,
    publicationChannels: freezeDeep(["INTERNAL_TEST_ONLY"]),
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
  freezeDeep({
    campaignId: "test-campaign-fiktives-fitnessstudio-demo",
    customerId: "test-customer-fiktives-fitnessstudio",
    brandId: "test-brand-fiktives-fitnessstudio",
    projectId: "marketing-agentur-os",
    title: "Testkampagne – neutrale Fitnessstudio-Demo (nicht abrechenbar)",
    purpose: "Zweiter, getrennter Testmandant zur Prüfung der Mandantentrennung.",
    status: "DRAFT",
    budgetCeiling: null,
    publicationChannels: freezeDeep(["INTERNAL_TEST_ONLY"]),
    createdAt: "2026-07-25T00:00:00.000Z",
  }),
]);

// ---------------------------------------------------------------------------
// Lesende Zugriffsfunktionen.
// ---------------------------------------------------------------------------

function listCustomers() {
  return CUSTOMERS.map(clone);
}

function getCustomerById(customerId) {
  const found = CUSTOMERS.find((entry) => entry.customerId === customerId);
  return found ? clone(found) : null;
}

function listBrands(filter = {}) {
  let records = BRANDS.map(clone);
  if (filter.customerId) {
    records = records.filter((entry) => entry.customerId === filter.customerId);
  }
  return records;
}

function getBrandById(brandId) {
  const found = BRANDS.find((entry) => entry.brandId === brandId);
  return found ? clone(found) : null;
}

function listCampaigns(filter = {}) {
  let records = CAMPAIGNS.map(clone);
  if (filter.customerId) {
    records = records.filter((entry) => entry.customerId === filter.customerId);
  }
  if (filter.brandId) {
    records = records.filter((entry) => entry.brandId === filter.brandId);
  }
  return records;
}

function getCampaignById(campaignId) {
  const found = CAMPAIGNS.find((entry) => entry.campaignId === campaignId);
  return found ? clone(found) : null;
}

// ---------------------------------------------------------------------------
// Registrierungsintegrität – keine doppelten IDs, keine Vermischung
// zwischen Kunden (Auftrag Abschnitt C, Pflichttest 13).
// ---------------------------------------------------------------------------

function findDuplicateIds(records, idField) {
  const seen = new Set();
  const duplicates = new Set();
  records.forEach((record) => {
    const id = record[idField];
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}

function checkRegistryIntegrity() {
  const duplicateCustomerIds = findDuplicateIds(CUSTOMERS, "customerId");
  const duplicateBrandIds = findDuplicateIds(BRANDS, "brandId");
  const duplicateCampaignIds = findDuplicateIds(CAMPAIGNS, "campaignId");
  const orphanBrands = BRANDS.filter((brand) => !CUSTOMERS.some((c) => c.customerId === brand.customerId)).map(
    (brand) => brand.brandId,
  );
  const orphanCampaigns = CAMPAIGNS.filter(
    (campaign) =>
      !BRANDS.some((b) => b.brandId === campaign.brandId && b.customerId === campaign.customerId) ||
      !CUSTOMERS.some((c) => c.customerId === campaign.customerId),
  ).map((campaign) => campaign.campaignId);
  const unknownProjectCampaigns = CAMPAIGNS.filter((campaign) => !projectRegistry.getProjectById(campaign.projectId)).map(
    (campaign) => campaign.campaignId,
  );

  const ok =
    duplicateCustomerIds.length === 0 &&
    duplicateBrandIds.length === 0 &&
    duplicateCampaignIds.length === 0 &&
    orphanBrands.length === 0 &&
    orphanCampaigns.length === 0 &&
    unknownProjectCampaigns.length === 0;

  return {
    ok,
    duplicateCustomerIds,
    duplicateBrandIds,
    duplicateCampaignIds,
    orphanBrands,
    orphanCampaigns,
    unknownProjectCampaigns,
  };
}

// ---------------------------------------------------------------------------
// Mandantenbindungsprüfung – jede Medien-/Dokument-/Ergebnisreferenz muss an
// customerId/brandId/projectId (optional campaignId) gebunden sein (Auftrag
// Abschnitt D). Unbekannte oder nicht zusammengehörige IDs blockieren.
// ---------------------------------------------------------------------------

function validateTenantBinding(input = {}) {
  const reasons = [];
  const customerId = typeof input.customerId === "string" ? input.customerId.trim() : "";
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";

  if (!customerId) {
    reasons.push("customerId fehlt.");
    return { ok: false, reasons };
  }
  const customer = getCustomerById(customerId);
  if (!customer) {
    reasons.push(`Unbekannte Kunden-ID "${customerId}".`);
    return { ok: false, reasons };
  }
  if (customer.status !== "ACTIVE_TEST_TENANT") {
    reasons.push(`Kunde "${customerId}" ist nicht aktiv.`);
  }

  if (!brandId) {
    reasons.push("brandId fehlt.");
  } else {
    const brand = getBrandById(brandId);
    if (!brand) {
      reasons.push(`Unbekannte Marken-ID "${brandId}".`);
    } else if (brand.customerId !== customerId) {
      reasons.push(`Marke "${brandId}" gehört nicht zum angegebenen Kunden "${customerId}".`);
    } else if (projectId && !brand.allowedProjects.includes(projectId)) {
      reasons.push(`Projekt "${projectId}" ist für Marke "${brandId}" nicht freigegeben.`);
    }
  }

  if (campaignId) {
    const campaign = getCampaignById(campaignId);
    if (!campaign) {
      reasons.push(`Unbekannte Kampagnen-ID "${campaignId}".`);
    } else {
      if (campaign.customerId !== customerId) {
        reasons.push(`Kampagne "${campaignId}" gehört nicht zum angegebenen Kunden "${customerId}".`);
      }
      if (campaign.brandId !== brandId) {
        reasons.push(`Kampagne "${campaignId}" gehört nicht zur angegebenen Marke "${brandId}".`);
      }
      if (projectId && campaign.projectId !== projectId) {
        reasons.push(`Projektbindung stimmt nicht: Kampagne "${campaignId}" gehört zu Projekt "${campaign.projectId}".`);
      }
    }
  }

  if (projectId && !projectRegistry.getProjectById(projectId)) {
    reasons.push(`Unbekannte Projekt-ID "${projectId}".`);
  }

  return { ok: reasons.length === 0, reasons };
}

function assertValidTenantBindingOrThrow(input) {
  const result = validateTenantBinding(input);
  if (!result.ok) {
    throw new Error(`Mandantenbindung ungültig: ${result.reasons.join(" ")}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Trennungs-Hilfsfunktionen (Auftrag Abschnitt D).
// ---------------------------------------------------------------------------

function isSameCustomer(recordCustomerId, requestingCustomerId) {
  if (!requestingCustomerId) return true; // Admin-/Chef-Ansicht: kein Kundenfilter aktiv.
  return recordCustomerId === requestingCustomerId;
}

// Filtert eine Liste von Datensätzen (jeweils mit customerId-Feld) auf genau
// den angefragten Mandanten. Ohne requestingCustomerId (interner
// Admin-Betrieb) bleibt die Liste unverändert.
function filterRecordsForCustomerView(records, requestingCustomerId) {
  if (!requestingCustomerId) return records;
  return records.filter((record) => record && record.customerId === requestingCustomerId);
}

module.exports = {
  CUSTOMER_STATUSES,
  BRAND_STATUSES,
  CAMPAIGN_STATUSES,
  TENANT_DATA_CLASSIFICATION_LIMITS,
  CUSTOMERS,
  BRANDS,
  CAMPAIGNS,
  listCustomers,
  getCustomerById,
  listBrands,
  getBrandById,
  listCampaigns,
  getCampaignById,
  checkRegistryIntegrity,
  validateTenantBinding,
  assertValidTenantBindingOrThrow,
  isSameCustomer,
  filterRecordsForCustomerView,
};
