"use strict";

// V7.1 Phase C – Canva als zweiten echten, kontrollierten Medien-Connector
// vorbereiten. Kanonisches, additives Auftragsmodell ("canvaDesignJobPackage").
//
// Architektur-Entscheidung: Canva ist in Phase C ein CONTROLLED_CONNECTOR_
// HANDOFF, kein direkter HTTP-Client mit API-Key. Dieses Modul erzeugt und
// validiert ausschließlich ein sicheres, kopier- bzw. connectorfähiges
// Auftragspaket. Es enthält KEINE Netzwerklogik, KEINE Zugangsdaten und
// startet KEINE Canva-Aktion. Die tatsächliche Aktion läuft – falls
// überhaupt – über den vorhandenen, authentifizierten Canva-Connector
// außerhalb dieses lokalen Node-Servers (siehe canva-connector.js für die
// Hand-off-Vorbereitung).
//
// Reuse only: project-registry.js bleibt die einzige Projektquelle,
// agent-registry.js die einzige Agentenquelle, agency-tenant-registry.js die
// einzige Mandantenquelle. Keine zweite Wahrheit.

const crypto = require("crypto");

const projectRegistry = require("./project-registry");
const agentRegistry = require("./agent-registry");
const agencyTenantRegistry = require("./agency-tenant-registry");

// ---------------------------------------------------------------------------
// Abschnitt C – Canva-Capability-Profil (sachlich, additiv, ehrlich).
// ---------------------------------------------------------------------------

const CANVA_CAPABILITY_PROFILE = Object.freeze({
  provider: "Canva",
  supportedOrPlanned: Object.freeze([
    "neues Social-Media-Design generieren",
    "Instagram-Post",
    "Instagram-/Facebook-Story",
    "Facebook-Post",
    "Flyer",
    "Poster",
    "Infografik",
    "YouTube-Thumbnail",
    "Dokument und visuelles Angebot",
    "vorhandenes Design lesen",
    "vorhandenes Design kopieren",
    "vorhandenes Design bearbeiten",
    "Text gezielt ersetzen",
    "Bilder oder Videos in Designs einsetzen oder ersetzen",
    "Designentwurf über Brand-Template erzeugen",
    "Designs in interne Canva-Ordner verschieben",
    "Design-Metadaten und Vorschau zurückführen",
  ]),
  explicitlyNotAvailableInFirstPilot: Object.freeze([
    "jedes Canva-Format",
    "jede Premium-Funktion",
    "jedes Brand-Kit",
    "jedes Brand-Template",
    "öffentliche Veröffentlichung",
    "Social-Media-Posting",
    "Canva-Websites",
    "Video-Rendering",
    "Druckbestellungen",
    "automatische Freigabe an Kunden",
    "automatische Team- oder Kontoeinladungen",
    "automatische Ordner-/Berechtigungsadministration",
    "Entfernung oder Löschung produktiver Designs",
  ]),
  firstPilotScope: Object.freeze([
    "Ausschließlich GENERATE_NEW_DESIGN (Designkandidaten generieren, danach genau einen auswählen) für einen neutralen Testmandanten.",
    "Kein Brand-Kit, kein privates Brand-Template, keine reale Marke, keine Kundendaten im ersten Pilot.",
    "Keine Edit-Transaktion im ersten realen Pilot; Bearbeitungslogik wird nur modelliert und getestet.",
  ]),
  notes: Object.freeze([
    "Brand-Kit-Funktionen können zusätzliche Berechtigungen benötigen.",
    "Ein Brand-Template darf nur verwendet werden, wenn es vorher gefunden, geprüft und ausdrücklich ausgewählt wurde.",
    "Ein generierter Kandidat ist noch kein dauerhaft gespeichertes, bearbeitbares Design.",
    "Ein Bearbeitungsentwurf ist noch nicht gespeichert.",
    "Änderungen werden erst nach einer separaten Commit-/Save-Freigabe dauerhaft in Canva übernommen.",
    "Canva-Veröffentlichung bleibt außerhalb dieser Phase.",
    "Kein autonomer Canva-Produktivlauf in Phase C ohne separate Jamal-Freigabe.",
  ]),
});

// ---------------------------------------------------------------------------
// Enums / Konstanten (Abschnitt D)
// ---------------------------------------------------------------------------

const CANVA_SCHEMA_VERSION = 1;

const CANVA_DESIGN_OPERATIONS = Object.freeze([
  "GENERATE_NEW_DESIGN",
  "CREATE_FROM_BRAND_TEMPLATE",
  "AUTOFILL_BRAND_TEMPLATE",
  "COPY_EXISTING_DESIGN",
  "EDIT_EXISTING_DESIGN",
]);

// Nur GENERATE_NEW_DESIGN ist für den ersten Pilot vorgesehen (Auftrag
// Abschnitt G: "im ersten Pilot nur GENERATE_DESIGN_CANDIDATES,
// CREATE_SELECTED_CANDIDATE").
const CANVA_PILOT_ALLOWED_DESIGN_OPERATIONS = Object.freeze(["GENERATE_NEW_DESIGN"]);

const CANVA_DESIGN_TYPES = Object.freeze([
  "INSTAGRAM_POST",
  "STORY",
  "FACEBOOK_POST",
  "FLYER",
  "POSTER",
  "INFOGRAPHIC",
  "DOCUMENT",
  "YOUTUBE_THUMBNAIL",
]);

// Auftrag Abschnitt D: "designType für den ersten Pilot mindestens" nennt
// genau diese sechs Typen.
const CANVA_PILOT_ALLOWED_DESIGN_TYPES = Object.freeze([
  "INSTAGRAM_POST",
  "STORY",
  "FACEBOOK_POST",
  "FLYER",
  "DOCUMENT",
  "YOUTUBE_THUMBNAIL",
]);

const CANVA_CANONICAL_DIMENSIONS_BY_DESIGN_TYPE = Object.freeze({
  INSTAGRAM_POST: Object.freeze({ widthPx: 1080, heightPx: 1350, label: "Instagram-Post (Hochformat 4:5)" }),
  STORY: Object.freeze({ widthPx: 1080, heightPx: 1920, label: "Story (9:16)" }),
  FACEBOOK_POST: Object.freeze({ widthPx: 1200, heightPx: 630, label: "Facebook-Post" }),
  FLYER: Object.freeze({ widthPx: 2480, heightPx: 3508, label: "Flyer (A4, 300dpi)" }),
  POSTER: Object.freeze({ widthPx: 3508, heightPx: 4961, label: "Poster (A3, 300dpi)" }),
  INFOGRAPHIC: Object.freeze({ widthPx: 1080, heightPx: 3000, label: "Infografik (lang)" }),
  DOCUMENT: Object.freeze({ widthPx: 2480, heightPx: 3508, label: "Dokument (A4)" }),
  YOUTUBE_THUMBNAIL: Object.freeze({ widthPx: 1280, heightPx: 720, label: "YouTube-Thumbnail" }),
});

const CANVA_OUTPUT_PURPOSES = Object.freeze([
  "SOCIAL_MEDIA_POST",
  "PRINT_MATERIAL",
  "INTERNAL_DOCUMENT",
  "CUSTOMER_OFFER",
  "OTHER",
]);

const CANVA_JOB_STATUSES = Object.freeze([
  "DRAFT",
  "READY_FOR_REVIEW",
  "BLOCKED",
  "APPROVED_FOR_HANDOFF",
  "HANDED_OFF",
  "CANDIDATES_READY",
  "DRAFT_EDITING",
  "PREVIEW_READY",
  "APPROVED_TO_SAVE",
  "SAVED",
  "INTERNAL_REVIEW",
  "READY_FOR_CUSTOMER_REVIEW",
  "CUSTOMER_CHANGES_REQUESTED",
  "CUSTOMER_APPROVED",
  "PUBLICATION_NOT_APPROVED",
  "FAILED",
  "CANCELLED",
  "STALE",
]);

const CANVA_DATA_CLASSIFICATIONS = Object.freeze(["NORMAL", "SENSITIVE", "SECRET"]);
// Verbindlich für den ersten Pilot (Auftrag Abschnitt E): ausschließlich NORMAL.
const CANVA_PILOT_ALLOWED_DATA_CLASSIFICATIONS = Object.freeze(["NORMAL"]);

// Interne Kostenfreigabe (Freigabestufe 4) – getrennt von der
// Kundenpaket-/Abrechnungsklassifizierung unten.
const CANVA_INTERNAL_COST_APPROVAL_STATUSES = Object.freeze([
  "UNKNOWN",
  "WITHIN_APPROVED_LIMIT",
  "REQUIRES_APPROVAL",
  "NOT_AVAILABLE",
]);

// Abschnitt K – Kunden-/Paketzuordnung. Keine erfundenen Preise, keine
// automatische Abrechnung.
const CANVA_COST_PACKAGE_STATUSES = Object.freeze([
  "NOT_BILLABLE_TEST",
  "INCLUDED_IN_PACKAGE",
  "ADDITIONAL_APPROVAL_REQUIRED",
  "UNKNOWN",
]);

// Achte, getrennte Freigabestufe (Auftrag Abschnitt F): Kundenentwurf.
// Ausdrücklich NICHT gleichbedeutend mit Veröffentlichung.
const CANVA_CUSTOMER_DRAFT_APPROVAL_STATUSES = Object.freeze(["PENDING", "APPROVED", "CHANGES_REQUESTED"]);

// Veröffentlichung bleibt in dieser Phase strukturell unerreichbar: der
// einzige jemals gültige Wert ist PUBLICATION_NOT_APPROVED. Es gibt bewusst
// keine Funktion in diesem Modul, die einen anderen Wert setzen kann.
const CANVA_PUBLICATION_APPROVAL_STATUSES = Object.freeze(["PUBLICATION_NOT_APPROVED"]);

const CANVA_PILOT_MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const CANVA_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h – bewusst kurzlebig.

const MAX_TEXT_FIELD_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_SHORT_FIELD_LENGTH = 400;
const MAX_SOURCE_ASSET_REFERENCES = 10;
const MAX_TEXT_CONTENT_ENTRIES = 20;
const MAX_TEXT_CONTENT_VALUE_LENGTH = 500;
const MIN_REQUIRED_PAGES = 1;
const MAX_REQUIRED_PAGES = 20;

// Vollständiger Katalog aller später vom Connector unterstützten
// Hand-off-Aktionen (Auftrag Abschnitt G). Serverautoritativ je
// designOperation zugeordnet – niemals vom Client übernommen.
const CANVA_HANDOFF_ACTIONS = Object.freeze([
  "GENERATE_DESIGN_CANDIDATES",
  "CREATE_SELECTED_CANDIDATE",
  "SEARCH_BRAND_TEMPLATES",
  "CREATE_FROM_SELECTED_TEMPLATE",
  "AUTOFILL_SELECTED_TEMPLATE",
  "COPY_SELECTED_DESIGN",
  "START_EDITING_TRANSACTION",
  "APPLY_APPROVED_EDIT_OPERATIONS",
  "COMMIT_APPROVED_EDITING_TRANSACTION",
  "CANCEL_EDITING_TRANSACTION",
  "MOVE_SAVED_DESIGN_TO_INTERNAL_FOLDER",
]);

// Im ersten Pilot ausschließlich diese beiden Aktionen (Auftrag Abschnitt G):
// Brand-Template- oder Edit-Transaktionen werden nur modelliert und getestet.
const CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS = Object.freeze(["GENERATE_DESIGN_CANDIDATES", "CREATE_SELECTED_CANDIDATE"]);

const ALLOWED_ACTIONS_BY_DESIGN_OPERATION = Object.freeze({
  GENERATE_NEW_DESIGN: Object.freeze(["GENERATE_DESIGN_CANDIDATES", "CREATE_SELECTED_CANDIDATE"]),
  CREATE_FROM_BRAND_TEMPLATE: Object.freeze(["SEARCH_BRAND_TEMPLATES", "CREATE_FROM_SELECTED_TEMPLATE"]),
  AUTOFILL_BRAND_TEMPLATE: Object.freeze(["SEARCH_BRAND_TEMPLATES", "AUTOFILL_SELECTED_TEMPLATE"]),
  COPY_EXISTING_DESIGN: Object.freeze(["COPY_SELECTED_DESIGN"]),
  EDIT_EXISTING_DESIGN: Object.freeze([
    "START_EDITING_TRANSACTION",
    "APPLY_APPROVED_EDIT_OPERATIONS",
    "COMMIT_APPROVED_EDITING_TRANSACTION",
    "CANCEL_EDITING_TRANSACTION",
  ]),
});

// Immer verboten, unabhängig von designOperation oder Freigabestufe (Auftrag
// Abschnitt G, Punkte 13–16 und Abschnitt L "Keine Route für").
const CANVA_ALWAYS_FORBIDDEN_ACTIONS = Object.freeze([
  "PUBLISH_DESIGN",
  "SHARE_PUBLICLY",
  "INVITE_CUSTOMER",
  "INVITE_TEAM_MEMBER",
  "DELETE_DESIGN",
  "PURCHASE_CREDITS",
  "UPGRADE_PLAN",
  "MANAGE_FOLDER_PERMISSIONS",
  "CREATE_TEAM_ACCOUNT",
  "ADMIN_ACCOUNT_SETTINGS",
]);

// Credential-/Geheimnis-Muster, angewendet auf freie Textfelder (Briefing,
// Titel, Botschaft, Call-to-Action, Zielgruppe, Ton, visuelle Richtung,
// Textinhalte). Analog zu heygen-job-package.js.
const CREDENTIAL_LIKE_TEXT_PATTERNS = Object.freeze([
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,
  /sk-[A-Za-z0-9]{10,}/,
  /AKIA[0-9A-Z]{12,}/,
  /api[_-]?key\s*[:=]/i,
  /"?token"?\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/i,
  /"?secret"?\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]);

// Grobe, bewusst konservative Muster für persönliche Kontaktdaten (Auftrag
// Abschnitt E: "keine persönlichen E-Mail-Adressen oder Telefonnummern").
const PERSONAL_CONTACT_PATTERNS = Object.freeze([
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // E-Mail
  /\+?\d[\d\s()/-]{7,}\d/, // Telefonnummer-ähnliche Ziffernfolge
]);

const ABSOLUTE_PATH_PATTERNS = Object.freeze([/^\//, /^~/, /^[A-Za-z]:[\\/]/, /^file:\/\//i]);

const ABSOLUTE_PATH_SUBSTRING_PATTERNS = Object.freeze([
  /(^|\s)\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+/,
  /(^|\s)~\/[A-Za-z0-9_.-]/,
  /(^|\s)[A-Za-z]:[\\/][^\s]+/,
  /file:\/\/\//i,
]);

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}`;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsAbsolutePath(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  return ABSOLUTE_PATH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function scanTextForAbsolutePaths(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  if (containsAbsolutePath(text)) return true;
  return ABSOLUTE_PATH_SUBSTRING_PATTERNS.some((pattern) => pattern.test(text));
}

function containsCredentialLikeText(text) {
  if (!text) return false;
  return CREDENTIAL_LIKE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function containsPersonalContactDetails(text) {
  if (!text) return false;
  return PERSONAL_CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Fingerprint – ausschließlich über inhaltsbestimmende Felder, NICHT über
// Freigabefelder. Eine Änderung an Briefing/Assets/Marke/Kostenrahmen ändert
// den Fingerprint und macht dadurch jede frühere, fingerprintgebundene
// Freigabe automatisch ungültig (Auftrag Abschnitt D).
// ---------------------------------------------------------------------------

function computePackageFingerprint(pkg) {
  const contentSnapshot = {
    designOperation: pkg.designOperation,
    designType: pkg.designType,
    title: pkg.title,
    brief: pkg.brief,
    primaryMessage: pkg.primaryMessage,
    callToAction: pkg.callToAction,
    targetAudience: pkg.targetAudience,
    tone: pkg.tone,
    language: pkg.language,
    dimensions: pkg.dimensions,
    brandKitReference: pkg.brandKitReference,
    brandTemplateReference: pkg.brandTemplateReference,
    sourceDesignReference: pkg.sourceDesignReference,
    sourceAssetReferences: pkg.sourceAssetReferences,
    textContent: pkg.textContent,
    visualDirection: pkg.visualDirection,
    requiredPages: pkg.requiredPages,
    outputPurpose: pkg.outputPurpose,
    dataClassification: pkg.dataClassification,
    internalCostCeiling: pkg.internalCostCeiling,
    // V7.1 Phase C – Mandantenbindung ist inhaltsbestimmend: eine
    // nachträgliche Umzuordnung zu einem anderen Kunden/einer anderen
    // Marke/Kampagne ändert den Fingerprint und invalidiert damit jede
    // frühere, fingerprintgebundene Freigabe.
    customerId: pkg.customerId,
    brandId: pkg.brandId,
    campaignId: pkg.campaignId,
  };
  return crypto.createHash("sha256").update(JSON.stringify(contentSnapshot)).digest("hex");
}

function buildAllowedActionsForDesignOperation(designOperation) {
  return [...(ALLOWED_ACTIONS_BY_DESIGN_OPERATION[designOperation] || [])];
}

function assertProjectExists(projectId) {
  const project = projectRegistry.getProjectById(projectId);
  if (!project) {
    throw new Error("Unbekannte Projekt-ID. Es wurde kein Canva-Auftragspaket erzeugt.");
  }
  return project;
}

function assertKnownAgentIfProvided(agentId) {
  if (agentId === undefined || agentId === null || agentId === "") return null;
  if (!agentRegistry.hasAgentId(agentId)) {
    throw new Error(`Unbekannte Agenten-ID: ${agentId}`);
  }
  return agentId;
}

function assertValidTenantBinding(input) {
  const customerId = String(input.customerId || "").trim();
  const brandId = String(input.brandId || "").trim();
  const campaignId = String(input.campaignId || "").trim();
  if (!customerId) throw new Error("customerId fehlt. Jeder Canva-Auftrag benötigt einen Kunden.");
  if (!brandId) throw new Error("brandId fehlt. Jeder Canva-Auftrag benötigt eine Marke.");
  if (!campaignId) throw new Error("campaignId fehlt. Jeder Canva-Auftrag benötigt eine Kampagne.");
  const binding = agencyTenantRegistry.validateTenantBinding({
    customerId,
    brandId,
    campaignId,
    projectId: input.projectId,
  });
  if (!binding.ok) {
    throw new Error(`Mandantenbindung ungültig: ${binding.reasons.join(" ")}`);
  }
  return { customerId, brandId, campaignId };
}

function assertKnownEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName}: unbekannter oder fehlender Wert "${value}".`);
  }
}

function normalizeSourceAssetReferences(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new Error("sourceAssetReferences muss eine Liste sein.");
  }
  return values.slice(0, MAX_SOURCE_ASSET_REFERENCES).map((entry) => trimmedOrNull(entry, 800)).filter(Boolean);
}

function normalizeTextContent(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new Error("textContent muss eine Liste sein.");
  }
  return values.slice(0, MAX_TEXT_CONTENT_ENTRIES).map((entry) => {
    if (!isPlainObject(entry)) {
      throw new Error("jeder textContent-Eintrag muss ein Objekt mit targetElement/text sein.");
    }
    return {
      targetElement: trimmedOrNull(entry.targetElement, 120) || "unbenannt",
      text: trimmedOrNull(entry.text, MAX_TEXT_CONTENT_VALUE_LENGTH),
    };
  });
}

function normalizeBrandKitReference(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("brandKitReference muss ein Objekt sein.");
  }
  const brandKitId = trimmedOrNull(value.brandKitId, 200);
  if (!brandKitId) throw new Error("brandKitReference.brandKitId fehlt.");
  return { brandKitId, confirmedSelected: value.confirmedSelected === true };
}

function normalizeBrandTemplateReference(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("brandTemplateReference muss ein Objekt sein.");
  }
  const templateId = trimmedOrNull(value.templateId, 200);
  if (!templateId) throw new Error("brandTemplateReference.templateId fehlt.");
  return { templateId, confirmedSelected: value.confirmedSelected === true };
}

function normalizeSourceDesignReference(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("sourceDesignReference muss ein Objekt sein.");
  }
  const designId = trimmedOrNull(value.designId, 200);
  if (!designId) throw new Error("sourceDesignReference.designId fehlt.");
  return { designId };
}

function normalizeDimensions(value, designType) {
  const canonical = CANVA_CANONICAL_DIMENSIONS_BY_DESIGN_TYPE[designType] || null;
  if (value === undefined || value === null) {
    return canonical ? { ...canonical } : null;
  }
  if (!isPlainObject(value)) {
    throw new Error("dimensions muss ein Objekt sein.");
  }
  const widthPx = Number(value.widthPx);
  const heightPx = Number(value.heightPx);
  if (!Number.isFinite(widthPx) || widthPx <= 0 || !Number.isFinite(heightPx) || heightPx <= 0) {
    throw new Error("dimensions.widthPx/heightPx müssen positive Zahlen sein.");
  }
  return {
    widthPx,
    heightPx,
    label: trimmedOrNull(value.label, 120) || (canonical ? canonical.label : "benutzerdefiniert"),
  };
}

function buildDefaultExpiresAt(now) {
  return new Date((now || Date.now()) + CANVA_DEFAULT_EXPIRY_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Erzeugung (DRAFT). Wirft ausschließlich bei strukturell ungültiger
// Eingabe (unbekanntes Projekt/Agent/Mandant, ungültiger Enum-Wert,
// fehlendes Pflichtfeld ohne sinnvollen Default). Inhaltliche/rechtliche
// Verstöße führen NICHT zu einer Exception, sondern zu einem Paket mit
// Status BLOCKED und nachvollziehbaren Gründen (Auftrag Abschnitt E).
// ---------------------------------------------------------------------------

function prepareCanvaDesignJobPackage(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error("Eingabe für das Canva-Auftragspaket muss ein Objekt sein.");
  }

  const projectId = String(input.projectId || "").trim();
  assertProjectExists(projectId);

  const { customerId, brandId, campaignId } = assertValidTenantBinding({ ...input, projectId });

  const requestingAgentId = assertKnownAgentIfProvided(input.requestingAgentId);

  const designOperation = String(input.designOperation || "").trim();
  assertKnownEnum(designOperation, CANVA_DESIGN_OPERATIONS, "designOperation");

  const designType = String(input.designType || "").trim();
  assertKnownEnum(designType, CANVA_DESIGN_TYPES, "designType");

  const title = trimmedOrNull(input.title, MAX_TITLE_LENGTH);
  if (!title) throw new Error("title fehlt.");

  const brief = trimmedOrNull(input.brief, MAX_TEXT_FIELD_LENGTH);
  const primaryMessage = trimmedOrNull(input.primaryMessage, MAX_SHORT_FIELD_LENGTH);

  const outputPurpose = String(input.outputPurpose || "SOCIAL_MEDIA_POST").trim();
  assertKnownEnum(outputPurpose, CANVA_OUTPUT_PURPOSES, "outputPurpose");

  const requiredPagesRaw = input.requiredPages;
  const requiredPages = requiredPagesRaw === undefined || requiredPagesRaw === null ? 1 : Number(requiredPagesRaw);
  if (!Number.isFinite(requiredPages) || requiredPages < MIN_REQUIRED_PAGES || requiredPages > MAX_REQUIRED_PAGES) {
    throw new Error(`requiredPages muss zwischen ${MIN_REQUIRED_PAGES} und ${MAX_REQUIRED_PAGES} liegen.`);
  }

  const dimensions = normalizeDimensions(input.dimensions, designType);
  const brandKitReference = normalizeBrandKitReference(input.brandKitReference);
  const brandTemplateReference = normalizeBrandTemplateReference(input.brandTemplateReference);
  const sourceDesignReference = normalizeSourceDesignReference(input.sourceDesignReference);
  const sourceAssetReferences = normalizeSourceAssetReferences(input.sourceAssetReferences);
  const textContent = normalizeTextContent(input.textContent);

  const dataClassification = String(input.dataClassification || "NORMAL").trim();
  assertKnownEnum(dataClassification, CANVA_DATA_CLASSIFICATIONS, "dataClassification");

  const internalCostCeilingRaw = input.internalCostCeiling;
  const internalCostCeiling =
    internalCostCeilingRaw === undefined || internalCostCeilingRaw === null ? null : Number(internalCostCeilingRaw);
  if (internalCostCeiling !== null && (!Number.isFinite(internalCostCeiling) || internalCostCeiling < 0)) {
    throw new Error("internalCostCeiling muss eine nicht-negative Zahl oder null sein.");
  }

  const costPackageStatus = String(input.costPackageStatus || "UNKNOWN").trim();
  assertKnownEnum(costPackageStatus, CANVA_COST_PACKAGE_STATUSES, "costPackageStatus");
  const customerPackageId = trimmedOrNull(input.customerPackageId, 200);
  const billableUnit = trimmedOrNull(input.billableUnit, 200) || "1 Designauftrag (Einheit gemäß Kundenpaket)";

  const createdAt = nowIso(options.now);
  const jobPackageId = randomId("canva-job");

  let pkg = {
    schemaVersion: CANVA_SCHEMA_VERSION,
    jobPackageId,
    sourceRunId: trimmedOrNull(input.sourceRunId, 200),
    customerId,
    brandId,
    campaignId,
    projectId,
    createdAt,
    createdBy: trimmedOrNull(input.createdBy, 80) || "Jamal",
    requestingAgentId,
    expiresAt: trimmedOrNull(input.expiresAt, 40) || buildDefaultExpiresAt(options.now),
    purpose: trimmedOrNull(input.purpose, MAX_TEXT_FIELD_LENGTH),
    designOperation,
    designType,
    title,
    brief,
    primaryMessage,
    callToAction: trimmedOrNull(input.callToAction, MAX_SHORT_FIELD_LENGTH),
    targetAudience: trimmedOrNull(input.targetAudience, MAX_SHORT_FIELD_LENGTH),
    tone: trimmedOrNull(input.tone, 200),
    language: trimmedOrNull(input.language, 40) || "de",
    dimensions,
    brandKitReference,
    brandTemplateReference,
    sourceDesignReference,
    sourceAssetReferences,
    textContent,
    visualDirection: trimmedOrNull(input.visualDirection, 800),
    requiredPages,
    outputPurpose,
    dataClassification,
    containsPersonalData: input.containsPersonalData === true,
    containsCustomerData: input.containsCustomerData === true,
    containsHealthData: input.containsHealthData === true,
    containsChildren: input.containsChildren === true,
    assetRightsConfirmed: input.assetRightsConfirmed === true,
    brandRightsConfirmed: input.brandRightsConfirmed === true,
    // Alle Freigabefelder starten IMMER auf ihrem sichersten Wert,
    // unabhängig von der Eingabe (Auftrag Abschnitt D/E).
    externalTransferApproved: false,
    internalCostApprovalStatus: "UNKNOWN",
    costPackageStatus,
    internalCostCeiling,
    customerPackageId,
    billableUnit,
    briefingApproved: false,
    assetsAndRightsApproved: false,
    customerDraftApprovalStatus: "PENDING",
    customerChangeRequestNote: null,
    // Veröffentlichung bleibt in Phase C IMMER PUBLICATION_NOT_APPROVED –
    // kein Eingabewert kann dies überschreiben (Auftrag Abschnitt D/F).
    publicationApprovalStatus: "PUBLICATION_NOT_APPROVED",
    // Geplante, noch nicht angelegte interne Ordnerreferenz (Auftrag
    // Abschnitt J) – keine echte Ordneranlage in dieser Phase.
    canvaFolderReference: { status: "PLANNED_NOT_CREATED", reference: null },
    selectedCandidateId: null,
    allowedCanvaActions: buildAllowedActionsForDesignOperation(designOperation),
    forbiddenActions: [...CANVA_ALWAYS_FORBIDDEN_ACTIONS],
    status: "DRAFT",
    blockReasons: [],
    nextAllowedStep: "Inhalt prüfen (validateCanvaDesignJobPackageContent).",
  };
  pkg.packageFingerprint = computePackageFingerprint(pkg);

  return { ok: true, package: clone(pkg) };
}

// ---------------------------------------------------------------------------
// Abschnitt E – Datenschutz-/Rechteprüfung. Rein lesend, verändert das
// übergebene Paket nicht; liefert eine bewertete Kopie zurück.
// ---------------------------------------------------------------------------

function validateCanvaDesignJobPackageContent(pkgInput) {
  if (!isPlainObject(pkgInput)) {
    throw new Error("Canva-Auftragspaket muss ein Objekt sein.");
  }
  const pkg = clone(pkgInput);
  const reasons = [];

  if (!pkg.brief || !pkg.brief.trim()) {
    reasons.push("Briefing fehlt.");
  }
  if (!pkg.primaryMessage || !pkg.primaryMessage.trim()) {
    reasons.push("Botschaft (primaryMessage) fehlt.");
  }

  const textContentValues = Array.isArray(pkg.textContent) ? pkg.textContent.map((entry) => entry && entry.text) : [];
  const combinedText = [
    pkg.brief,
    pkg.title,
    pkg.primaryMessage,
    pkg.callToAction,
    pkg.targetAudience,
    pkg.tone,
    pkg.visualDirection,
    ...textContentValues,
  ]
    .filter(Boolean)
    .join("\n");
  if (combinedText) {
    if (containsCredentialLikeText(combinedText)) {
      reasons.push("Möglicher Zugangsdaten-/Geheimnisinhalt im Briefing oder Begleittext erkannt.");
    }
    if (containsPersonalContactDetails(combinedText)) {
      reasons.push("Möglicher persönlicher Kontaktdatum (E-Mail/Telefonnummer) im Briefing oder Begleittext erkannt.");
    }
  }

  if (!CANVA_DESIGN_TYPES.includes(pkg.designType)) {
    reasons.push(`designType "${pkg.designType}" ist ungültig.`);
  } else if (!CANVA_PILOT_ALLOWED_DESIGN_TYPES.includes(pkg.designType)) {
    reasons.push(
      `designType "${pkg.designType}" ist für den ersten Pilot nicht vorgesehen (nur ${CANVA_PILOT_ALLOWED_DESIGN_TYPES.join(", ")}).`,
    );
  }

  if (!CANVA_DESIGN_OPERATIONS.includes(pkg.designOperation)) {
    reasons.push(`designOperation "${pkg.designOperation}" ist ungültig.`);
  } else if (!CANVA_PILOT_ALLOWED_DESIGN_OPERATIONS.includes(pkg.designOperation)) {
    reasons.push(
      `designOperation "${pkg.designOperation}" ist für den ersten Pilot nicht vorgesehen (nur ${CANVA_PILOT_ALLOWED_DESIGN_OPERATIONS.join(", ")}).`,
    );
  }

  if (["COPY_EXISTING_DESIGN", "EDIT_EXISTING_DESIGN"].includes(pkg.designOperation) && !pkg.sourceDesignReference) {
    reasons.push("sourceDesignReference fehlt für diese designOperation.");
  }

  if (["CREATE_FROM_BRAND_TEMPLATE", "AUTOFILL_BRAND_TEMPLATE"].includes(pkg.designOperation)) {
    if (!pkg.brandTemplateReference || pkg.brandTemplateReference.confirmedSelected !== true) {
      reasons.push(
        "Ein Brand-Template darf nur verwendet werden, wenn es vorher gefunden, geprüft und ausdrücklich ausgewählt wurde.",
      );
    }
  }

  if (Array.isArray(pkg.sourceAssetReferences) && pkg.sourceAssetReferences.length > 0 && pkg.assetRightsConfirmed !== true) {
    reasons.push("Assetrechte sind nicht bestätigt (assetRightsConfirmed).");
  }

  if (pkg.brandRightsConfirmed !== true) {
    reasons.push("Markenrechte sind nicht bestätigt (brandRightsConfirmed).");
  }

  if (pkg.containsHealthData === true) {
    reasons.push("Gesundheitsdaten sind im ersten Pilot nicht erlaubt.");
  }
  if (pkg.containsCustomerData === true) {
    reasons.push("Echte Kundendaten sind im ersten Pilot nicht erlaubt.");
  }
  if (pkg.containsChildren === true) {
    reasons.push("Daten von Kindern/Minderjährigen sind nicht erlaubt.");
  }

  if (!CANVA_PILOT_ALLOWED_DATA_CLASSIFICATIONS.includes(pkg.dataClassification)) {
    reasons.push(
      `Datenklassifizierung "${pkg.dataClassification}" ist im ersten Pilot nicht erlaubt (nur ${CANVA_PILOT_ALLOWED_DATA_CLASSIFICATIONS.join(", ")}).`,
    );
  }

  const freeTextPathCandidates = [pkg.brief, pkg.title, pkg.purpose, pkg.visualDirection, ...textContentValues];
  const referencePathCandidates = [
    pkg.brandKitReference && pkg.brandKitReference.brandKitId,
    pkg.brandTemplateReference && pkg.brandTemplateReference.templateId,
    pkg.sourceDesignReference && pkg.sourceDesignReference.designId,
    ...(pkg.sourceAssetReferences || []),
  ];
  const hasAbsolutePath =
    freeTextPathCandidates.some((entry) => scanTextForAbsolutePaths(entry)) ||
    referencePathCandidates.some((entry) => containsAbsolutePath(entry));
  if (hasAbsolutePath) {
    reasons.push("Absolute Datei- oder Systempfade sind nicht erlaubt.");
  }

  if (pkg.publicationApprovalStatus !== "PUBLICATION_NOT_APPROVED") {
    // Defensive Zweitsicherung – prepareCanvaDesignJobPackage erzwingt dies
    // bereits, dieser Zweig sollte praktisch nie erreicht werden.
    reasons.push("Veröffentlichung ist in Phase C ausdrücklich nicht freigegeben.");
  }

  const recomputedFingerprint = computePackageFingerprint(pkg);
  if (pkg.packageFingerprint && pkg.packageFingerprint !== recomputedFingerprint) {
    reasons.push("Paketfingerprint stimmt nicht mit dem aktuellen Inhalt überein (Paket wurde nach der Prüfung verändert).");
  }

  const ok = reasons.length === 0;
  const updated = {
    ...pkg,
    packageFingerprint: recomputedFingerprint,
    blockReasons: reasons,
    status: ok ? "READY_FOR_REVIEW" : "BLOCKED",
    nextAllowedStep: ok
      ? "Inhalt ist strukturell und rechtlich unauffällig. Jamal kann Briefing, Assets/Rechte, externe Übertragung und Kostenrahmen getrennt freigeben."
      : `Paket ist BLOCKED. Grund: ${reasons[0]} Nächster zulässiger Schritt: Ursache beheben und Paket erneut prüfen.`,
  };
  return { ok, package: clone(updated), blockReasons: reasons };
}

// ---------------------------------------------------------------------------
// Freigabestufen (Abschnitt F) – getrennte Entscheidungen, keine
// Sammelfreigabe. Jede Funktion mutiert nur ihr eigenes Feld und liefert
// eine neue Kopie zurück. Nur Stufen 1–7 werden für den ersten Pilot
// benötigt (Stufe 6/7 leben im Connector, siehe canva-connector.js).
// ---------------------------------------------------------------------------

function approveBriefingAndText(pkgInput) {
  const pkg = clone(pkgInput);
  if (pkg.status !== "READY_FOR_REVIEW") {
    throw new Error("Briefing kann nur aus dem Status READY_FOR_REVIEW freigegeben werden.");
  }
  pkg.briefingApproved = true;
  return clone(pkg);
}

function approveAssetsAndRights(pkgInput) {
  const pkg = clone(pkgInput);
  if (pkg.status !== "READY_FOR_REVIEW") {
    throw new Error("Assets/Rechte können nur aus dem Status READY_FOR_REVIEW freigegeben werden.");
  }
  pkg.assetsAndRightsApproved = true;
  return clone(pkg);
}

function approveExternalTransfer(pkgInput) {
  const pkg = clone(pkgInput);
  pkg.externalTransferApproved = true;
  return clone(pkg);
}

// internalCostApprovalStatus muss ausdrücklich WITHIN_APPROVED_LIMIT sein,
// um als Freigabe zu zählen; alle anderen Werte sind ehrliche
// Nicht-Freigaben (Auftrag Abschnitt F/K: keine erfundenen Preise).
function setInternalCostApproval(pkgInput, costStatus) {
  const pkg = clone(pkgInput);
  assertKnownEnum(costStatus, CANVA_INTERNAL_COST_APPROVAL_STATUSES, "internalCostApprovalStatus");
  pkg.internalCostApprovalStatus = costStatus;
  return clone(pkg);
}

function setCostPackageStatus(pkgInput, costPackageStatus) {
  const pkg = clone(pkgInput);
  assertKnownEnum(costPackageStatus, CANVA_COST_PACKAGE_STATUSES, "costPackageStatus");
  pkg.costPackageStatus = costPackageStatus;
  return clone(pkg);
}

// Achte, getrennte Freigabestufe. Ausdrücklich NICHT gleichbedeutend mit
// Veröffentlichung: diese Funktion setzt niemals publicationApprovalStatus.
//
// Sicherheits-/Fachkorrektur (nach Fund bei der manuellen Safari-Abnahme):
// Eine bloße Briefingfreigabe allein bedeutet NICHT, dass bereits ein
// mandantengebundener Kundenentwurf existiert. Ein echter Kundenentwurf
// setzt voraus, dass mindestens ein Designkandidat erzeugt UND ausdrücklich
// ausgewählt wurde (selectedCandidateId) und der Auftrag den Status
// READY_FOR_CUSTOMER_REVIEW erreicht hat (erst nach Kandidat -> Design
// beziehungsweise gespeichertem internem Entwurf -> internem Review
// erreichbar). Ohne diese Voraussetzungen gibt es fachlich schlicht noch
// keinen Kundenentwurf, der freigegeben oder zu dem Änderungen angefordert
// werden könnten.
function assertCustomerDraftExists(pkg) {
  if (!pkg.selectedCandidateId) {
    throw new Error(
      "Kundenentwurfsaktion setzt einen bereits ausgewählten Designkandidaten voraus (selectedCandidateId fehlt); es existiert noch kein Kundenentwurf.",
    );
  }
  if (pkg.status !== "READY_FOR_CUSTOMER_REVIEW") {
    throw new Error(
      `Kundenentwurfsaktion setzt mindestens den Status READY_FOR_CUSTOMER_REVIEW voraus (aktueller Status: "${pkg.status}"); ein generierter Kandidat oder ein bloßes Hand-off allein genügt nicht.`,
    );
  }
}

function approveCustomerDraft(pkgInput) {
  const pkg = clone(pkgInput);
  assertCustomerDraftExists(pkg);
  pkg.customerDraftApprovalStatus = "APPROVED";
  return clone(pkg);
}

function requestCustomerDraftChanges(pkgInput, note) {
  const pkg = clone(pkgInput);
  assertCustomerDraftExists(pkg);
  pkg.customerDraftApprovalStatus = "CHANGES_REQUESTED";
  pkg.customerChangeRequestNote = trimmedOrNull(note, MAX_TEXT_FIELD_LENGTH);
  return clone(pkg);
}

// Veröffentlichung bleibt in Phase C strukturell unerreichbar – es gibt
// bewusst keine Funktion, die publicationApprovalStatus verändern kann.
function isPublicationApproved(pkg) {
  return Boolean(pkg) && pkg.publicationApprovalStatus === "PUBLICATION_APPROVED";
}

function isPackageExpired(pkgInput, now) {
  const pkg = pkgInput || {};
  if (!pkg.expiresAt) return false;
  const expiryTime = new Date(pkg.expiresAt).getTime();
  if (!Number.isFinite(expiryTime)) return false;
  return (now || Date.now()) > expiryTime;
}

function evaluateHandoffReadiness(pkgInput, options = {}) {
  const pkg = clone(pkgInput);
  const missing = [];
  const contentCheck = validateCanvaDesignJobPackageContent(pkg);
  if (!contentCheck.ok) {
    missing.push("Inhalt (blockiert)");
  }
  if (pkg.briefingApproved !== true) missing.push("Briefing freigeben");
  if (pkg.assetsAndRightsApproved !== true) missing.push("Assets und Rechte freigeben");
  if (pkg.externalTransferApproved !== true) missing.push("Externe Übertragung bestätigen");
  if (pkg.internalCostApprovalStatus !== "WITHIN_APPROVED_LIMIT") missing.push("Kostenrahmen bestätigen");
  if (isPackageExpired(pkg, options.now)) missing.push("Paket ist abgelaufen (STALE)");
  const currentFingerprint = computePackageFingerprint(pkg);
  if (pkg.packageFingerprint !== currentFingerprint) missing.push("Fingerprint stimmt nicht mehr überein (Inhalt wurde verändert)");

  return {
    ready: missing.length === 0,
    missing,
    // publicationApprovalStatus ist bewusst NICHT Teil der
    // Handoff-Voraussetzung (Auftrag Abschnitt F: nur 1–7 werden für den
    // ersten Piloten benötigt).
    publicationApproved: isPublicationApproved(pkg),
  };
}

module.exports = {
  CANVA_CAPABILITY_PROFILE,
  CANVA_SCHEMA_VERSION,
  CANVA_DESIGN_OPERATIONS,
  CANVA_PILOT_ALLOWED_DESIGN_OPERATIONS,
  CANVA_DESIGN_TYPES,
  CANVA_PILOT_ALLOWED_DESIGN_TYPES,
  CANVA_CANONICAL_DIMENSIONS_BY_DESIGN_TYPE,
  CANVA_OUTPUT_PURPOSES,
  CANVA_JOB_STATUSES,
  CANVA_DATA_CLASSIFICATIONS,
  CANVA_PILOT_ALLOWED_DATA_CLASSIFICATIONS,
  CANVA_INTERNAL_COST_APPROVAL_STATUSES,
  CANVA_COST_PACKAGE_STATUSES,
  CANVA_CUSTOMER_DRAFT_APPROVAL_STATUSES,
  CANVA_PUBLICATION_APPROVAL_STATUSES,
  CANVA_HANDOFF_ACTIONS,
  CANVA_PILOT_ALLOWED_HANDOFF_ACTIONS,
  ALLOWED_ACTIONS_BY_DESIGN_OPERATION,
  CANVA_ALWAYS_FORBIDDEN_ACTIONS,
  computePackageFingerprint,
  prepareCanvaDesignJobPackage,
  validateCanvaDesignJobPackageContent,
  approveBriefingAndText,
  approveAssetsAndRights,
  approveExternalTransfer,
  setInternalCostApproval,
  setCostPackageStatus,
  approveCustomerDraft,
  requestCustomerDraftChanges,
  isPublicationApproved,
  isPackageExpired,
  evaluateHandoffReadiness,
  containsAbsolutePath,
  scanTextForAbsolutePaths,
  containsCredentialLikeText,
  containsPersonalContactDetails,
};
