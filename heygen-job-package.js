"use strict";

// V7.1 Phase B – HeyGen als ersten echten, kontrollierten Medien-Connector
// vorbereiten. Kanonisches, additives Auftragsmodell ("heygenJobPackage").
//
// Architektur-Entscheidung: HeyGen ist in Phase B ein CONTROLLED_CONNECTOR_
// HANDOFF, kein direkter HTTP-Client mit API-Key. Dieses Modul erzeugt und
// validiert ausschließlich ein sicheres, kopier- bzw. connectorfähiges
// Auftragspaket. Es enthält KEINE Netzwerklogik, KEINE Zugangsdaten und
// startet KEINE HeyGen-Aktion. Die tatsächliche Aktion läuft – falls
// überhaupt – über den vorhandenen, authentifizierten HeyGen-Connector
// außerhalb dieses lokalen Node-Servers (siehe heygen-connector.js für die
// Hand-off-Vorbereitung).
//
// Reuse only: project-registry.js bleibt die einzige Projektquelle,
// agent-registry.js die einzige Agentenquelle. Keine zweite Wahrheit.

const crypto = require("crypto");

const projectRegistry = require("./project-registry");
const agentRegistry = require("./agent-registry");
const agencyTenantRegistry = require("./agency-tenant-registry");

// ---------------------------------------------------------------------------
// Abschnitt C – HeyGen-Capability-Profil (sachlich, additiv, ehrlich).
// ---------------------------------------------------------------------------

const HEYGEN_CAPABILITY_PROFILE = Object.freeze({
  provider: "HeyGen",
  supportedOrPlanned: Object.freeze([
    "Avatarvideo aus bestehendem Avatar",
    "Video aus Bild",
    "Text-to-Speech-Avatarvideo",
    "Lip-Sync (nur vorgemerkt, kein erster Pilot)",
    "Videoübersetzung (nur vorgemerkt, kein erster Pilot)",
    "Untertitel",
    "Seitenverhältnisse 16:9 und 9:16",
    "Auflösungen abhängig vom Tarif und gewähltem Modus",
    "öffentliches oder privates Avatarprofil",
    "Statusabfrage asynchroner Jobs",
    "Ergebnisreferenz auf Video/Thumbnail/Untertitel",
  ]),
  explicitlyNotAvailableInFirstPilot: Object.freeze([
    "Digital Twin",
    "Voice Clone",
    "private Avatarerstellung",
    "Löschen von HeyGen-Videos",
  ]),
  firstPilotScope: Object.freeze([
    "Ausschließlich AVATAR_VIDEO mit bestehendem öffentlichem HeyGen-Avatar oder einem vorhandenen, ausdrücklich genehmigten Asset.",
    "Kein Avatar von Jamal, Conny, Kunden oder realen Personen ohne gesonderte Zustimmung und Herkunftsnachweis.",
  ]),
  notes: Object.freeze([
    "Nicht jede hier gelistete Fähigkeit ist für den aktuellen Tarif garantiert verfügbar.",
    "Private Avatare benötigen dokumentierte Zustimmung.",
    "Kein autonomer HeyGen-Renderlauf in Phase B ohne separate Jamal-Freigabe.",
  ]),
});

// ---------------------------------------------------------------------------
// Enums / Konstanten (Abschnitt D)
// ---------------------------------------------------------------------------

const HEYGEN_SCHEMA_VERSION = 1;

const HEYGEN_VIDEO_TYPES = Object.freeze(["AVATAR_VIDEO", "IMAGE_ANIMATION", "VIDEO_TRANSLATION", "LIPSYNC"]);

// Nur AVATAR_VIDEO ist für den ersten Pilot vorgesehen (Auftrag Abschnitt C/G).
const HEYGEN_PILOT_ALLOWED_VIDEO_TYPES = Object.freeze(["AVATAR_VIDEO"]);

const HEYGEN_ASPECT_RATIOS = Object.freeze(["16:9", "9:16"]);

const HEYGEN_JOB_STATUSES = Object.freeze([
  "DRAFT",
  "READY_FOR_REVIEW",
  "BLOCKED",
  "APPROVED_FOR_HANDOFF",
  "HANDED_OFF",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "STALE",
]);

const HEYGEN_DATA_CLASSIFICATIONS = Object.freeze(["NORMAL", "SENSITIVE", "SECRET"]);
// Verbindlich für den ersten Pilot (Auftrag Abschnitt E): ausschließlich NORMAL.
const HEYGEN_PILOT_ALLOWED_DATA_CLASSIFICATIONS = Object.freeze(["NORMAL"]);

const HEYGEN_COST_STATUSES = Object.freeze(["UNKNOWN", "WITHIN_APPROVED_LIMIT", "REQUIRES_APPROVAL", "NOT_AVAILABLE"]);

// V7.1 Phase B.1 – Kunden-/Paketzuordnung (Auftrag Abschnitt G). Getrennt von
// HEYGEN_COST_STATUSES (interne Freigabeentscheidung): dies ist die
// Abrechnungsklassifizierung gegenüber dem Kundenpaket. Keine erfundenen
// Preise, keine automatische Abrechnung.
const HEYGEN_COST_PACKAGE_STATUSES = Object.freeze([
  "INCLUDED_IN_PACKAGE",
  "ADDITIONAL_APPROVAL_REQUIRED",
  "UNKNOWN",
  "NOT_BILLABLE_TEST",
]);

// V7.1 Phase B.1 – fünfte, getrennte Freigabestufe (Auftrag Abschnitt E):
// Kundenentwurfsfreigabe. Ausdrücklich NICHT gleichbedeutend mit
// Veröffentlichung (Auftrag Abschnitt H/L, Regel 39).
const HEYGEN_CUSTOMER_DRAFT_APPROVAL_STATUSES = Object.freeze(["PENDING", "APPROVED", "CHANGES_REQUESTED"]);

const HEYGEN_PILOT_MAX_DURATION_SECONDS = 30;
const HEYGEN_PILOT_MIN_DURATION_SECONDS = 1;
const HEYGEN_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h – bewusst kurzlebig.

const MAX_TEXT_FIELD_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_SOURCE_ASSET_REFERENCES = 10;

// Serverautoritativ je videoType – niemals vom Client übernommen (siehe
// buildAllowedActionsForVideoType). Deckt ausschließlich sichere,
// lesende/vorbereitende Aktionen ab. Löschen, Erstellen von Avataren/Voices
// und Veröffentlichung sind hier grundsätzlich nicht enthalten.
const ALLOWED_ACTIONS_BY_VIDEO_TYPE = Object.freeze({
  AVATAR_VIDEO: Object.freeze(["GENERATE_AVATAR_VIDEO", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"]),
  IMAGE_ANIMATION: Object.freeze(["GENERATE_IMAGE_ANIMATION", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"]),
  VIDEO_TRANSLATION: Object.freeze(["GENERATE_VIDEO_TRANSLATION", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"]),
  LIPSYNC: Object.freeze(["GENERATE_LIPSYNC", "CHECK_JOB_STATUS", "FETCH_RESULT_REFERENCE"]),
});

// Immer verboten, unabhängig von videoType oder Freigabestufe (Auftrag
// Abschnitt G, Punkte 13–15 und Abschnitt J "Keine Route für").
const HEYGEN_ALWAYS_FORBIDDEN_ACTIONS = Object.freeze([
  "DELETE_VIDEO",
  "DELETE_AVATAR",
  "CREATE_AVATAR",
  "CLONE_AVATAR",
  "CREATE_VOICE",
  "CLONE_VOICE",
  "PUBLISH_VIDEO",
  "PURCHASE_CREDITS",
  "UPGRADE_PLAN",
]);

// Credential-/Geheimnis-Muster, angewendet auf freie Textfelder (Skript,
// Titel, Zweck, Ton, Zielgruppe, Hintergrund). Analog zu den bestehenden
// Mustern in v71-registry-backup.js/document-registry.js, hier zusätzlich
// auf Fließtext statt nur Dateinamen/JSON angewendet.
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
// Abschnitt E: "keine persönlichen Telefonnummern, Adressen oder E-Mails").
const PERSONAL_CONTACT_PATTERNS = Object.freeze([
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // E-Mail
  /\+?\d[\d\s()/-]{7,}\d/, // Telefonnummer-ähnliche Ziffernfolge
]);

const ABSOLUTE_PATH_PATTERNS = Object.freeze([/^\//, /^~/, /^[A-Za-z]:[\\/]/, /^file:\/\//i]);

// Substring-Varianten derselben Muster, für freien Fließtext (Skript,
// Titel, Zweck …), in dem ein absoluter Pfad nicht zwingend am Anfang der
// Zeichenkette steht.
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
// Freigabefelder. Eine Änderung an Script/Avatar/Kostenrahmen/Datenklassi-
// fizierung ändert den Fingerprint und macht dadurch jede frühere,
// fingerprintgebundene Freigabe automatisch ungültig (Auftrag Abschnitt D).
// ---------------------------------------------------------------------------

function computePackageFingerprint(pkg) {
  const contentSnapshot = {
    videoType: pkg.videoType,
    title: pkg.title,
    script: pkg.script,
    language: pkg.language,
    targetAudience: pkg.targetAudience,
    tone: pkg.tone,
    durationTargetSeconds: pkg.durationTargetSeconds,
    aspectRatio: pkg.aspectRatio,
    resolutionPreference: pkg.resolutionPreference,
    avatarReference: pkg.avatarReference,
    voiceReference: pkg.voiceReference,
    visualStyle: pkg.visualStyle,
    background: pkg.background,
    captionRequested: pkg.captionRequested,
    sourceAssetReferences: pkg.sourceAssetReferences,
    dataClassification: pkg.dataClassification,
    costCeiling: pkg.costCeiling,
    currency: pkg.currency,
    // V7.1 Phase B.1 – Mandantenbindung ist inhaltsbestimmend: eine
    // nachträgliche Umzuordnung zu einem anderen Kunden/einer anderen
    // Marke/Kampagne ändert den Fingerprint und invalidiert damit jede
    // frühere, fingerprintgebundene Freigabe.
    customerId: pkg.customerId,
    brandId: pkg.brandId,
    campaignId: pkg.campaignId,
  };
  return crypto.createHash("sha256").update(JSON.stringify(contentSnapshot)).digest("hex");
}

function buildAllowedActionsForVideoType(videoType) {
  return [...(ALLOWED_ACTIONS_BY_VIDEO_TYPE[videoType] || [])];
}

// ---------------------------------------------------------------------------
// Erzeugung (DRAFT). Wirft ausschließlich bei strukturell ungültiger
// Eingabe (unbekanntes Projekt/Agent, ungültiger Enum-Wert, fehlendes
// Pflichtfeld ohne sinnvollen Default). Inhaltliche/rechtliche Verstöße
// führen NICHT zu einer Exception, sondern zu einem Paket mit Status
// BLOCKED und nachvollziehbaren Gründen (Auftrag Abschnitt E).
// ---------------------------------------------------------------------------

function assertProjectExists(projectId) {
  const project = projectRegistry.getProjectById(projectId);
  if (!project) {
    throw new Error("Unbekannte Projekt-ID. Es wurde kein HeyGen-Auftragspaket erzeugt.");
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

// V7.1 Phase B.1 (Auftrag Abschnitt C/D/E) – customerId/brandId/campaignId
// sind auf jedem Medienauftrag verpflichtend. Unbekannte oder nicht
// zusammengehörige IDs blockieren strukturell (wie unbekanntes Projekt/
// Agent), analog zu assertProjectExists/assertKnownAgentIfProvided.
function assertValidTenantBinding(input) {
  const customerId = String(input.customerId || "").trim();
  const brandId = String(input.brandId || "").trim();
  const campaignId = String(input.campaignId || "").trim();
  if (!customerId) throw new Error("customerId fehlt. Jeder HeyGen-Auftrag benötigt einen Kunden.");
  if (!brandId) throw new Error("brandId fehlt. Jeder HeyGen-Auftrag benötigt eine Marke.");
  if (!campaignId) throw new Error("campaignId fehlt. Jeder HeyGen-Auftrag benötigt eine Kampagne.");
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

function normalizeAvatarReference(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("avatarReference muss ein Objekt sein.");
  }
  const avatarId = trimmedOrNull(value.avatarId, 200);
  if (!avatarId) {
    throw new Error("avatarReference.avatarId fehlt.");
  }
  const visibility = value.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
  return {
    avatarId,
    visibility,
    consentReference: trimmedOrNull(value.consentReference, 400),
  };
}

function normalizeVoiceReference(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("voiceReference muss ein Objekt sein.");
  }
  return {
    voiceId: trimmedOrNull(value.voiceId, 200),
    isClone: value.isClone === true,
  };
}

function buildDefaultExpiresAt(now) {
  return new Date((now || Date.now()) + HEYGEN_DEFAULT_EXPIRY_MS).toISOString();
}

function prepareHeygenJobPackage(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error("Eingabe für das HeyGen-Auftragspaket muss ein Objekt sein.");
  }

  const projectId = String(input.projectId || "").trim();
  assertProjectExists(projectId);

  const { customerId, brandId, campaignId } = assertValidTenantBinding({ ...input, projectId });

  const requestingAgentId = assertKnownAgentIfProvided(input.requestingAgentId);

  const videoType = String(input.videoType || "").trim();
  assertKnownEnum(videoType, HEYGEN_VIDEO_TYPES, "videoType");

  const title = trimmedOrNull(input.title, MAX_TITLE_LENGTH);
  if (!title) {
    throw new Error("title fehlt.");
  }

  const script = trimmedOrNull(input.script, MAX_TEXT_FIELD_LENGTH);
  const aspectRatio = String(input.aspectRatio || "").trim();
  assertKnownEnum(aspectRatio, HEYGEN_ASPECT_RATIOS, "aspectRatio");

  const durationTargetSeconds = Number(input.durationTargetSeconds);
  if (!Number.isFinite(durationTargetSeconds) || durationTargetSeconds <= 0) {
    throw new Error("durationTargetSeconds fehlt oder ist ungültig.");
  }

  const avatarReference = normalizeAvatarReference(input.avatarReference);
  const voiceReference = normalizeVoiceReference(input.voiceReference);
  const sourceAssetReferences = normalizeSourceAssetReferences(input.sourceAssetReferences);

  const dataClassification = String(input.dataClassification || "NORMAL").trim();
  assertKnownEnum(dataClassification, HEYGEN_DATA_CLASSIFICATIONS, "dataClassification");

  const costCeilingRaw = input.costCeiling;
  const costCeiling = costCeilingRaw === undefined || costCeilingRaw === null ? null : Number(costCeilingRaw);
  if (costCeiling !== null && (!Number.isFinite(costCeiling) || costCeiling < 0)) {
    throw new Error("costCeiling muss eine nicht-negative Zahl oder null sein.");
  }

  // V7.1 Phase B.1 (Auftrag Abschnitt G) – Kundenpaket-/Abrechnungsstatus.
  // Default UNKNOWN statt erfundener Werte; ein Client kann NOT_BILLABLE_TEST
  // nur als expliziten, bewussten Wert setzen (z. B. für Testaufträge).
  const costPackageStatus = String(input.costPackageStatus || "UNKNOWN").trim();
  assertKnownEnum(costPackageStatus, HEYGEN_COST_PACKAGE_STATUSES, "costPackageStatus");
  const customerPackageId = trimmedOrNull(input.customerPackageId, 200);
  const billableUnit = trimmedOrNull(input.billableUnit, 200) || "1 Videoauftrag (Einheit gemäß Kundenpaket)";

  const createdAt = nowIso(options.now);
  const jobPackageId = randomId("heygen-job");

  let pkg = {
    schemaVersion: HEYGEN_SCHEMA_VERSION,
    jobPackageId,
    projectId,
    // V7.1 Phase B.1 – verpflichtende Mandantenbindung (Auftrag Abschnitt
    // C/D/E). Bereits oben strukturell geprüft (assertValidTenantBinding).
    customerId,
    brandId,
    campaignId,
    // Keine echte HeyGen-Ordner-/Sub-Workspace-Anlage in dieser Phase
    // (Auftrag Abschnitt F). Nur eine geplante, noch nicht angelegte
    // Referenz.
    providerFolderReference: { status: "PLANNED_NOT_CREATED", reference: null },
    billableUnit,
    customerPackageId,
    costPackageStatus,
    sourceRunId: trimmedOrNull(input.sourceRunId, 200),
    createdAt,
    createdBy: trimmedOrNull(input.createdBy, 80) || "Jamal",
    requestingAgentId,
    purpose: trimmedOrNull(input.purpose, MAX_TEXT_FIELD_LENGTH),
    videoType,
    title,
    script,
    language: trimmedOrNull(input.language, 40) || "de",
    targetAudience: trimmedOrNull(input.targetAudience, 400),
    tone: trimmedOrNull(input.tone, 200),
    durationTargetSeconds,
    aspectRatio,
    resolutionPreference: trimmedOrNull(input.resolutionPreference, 40) || "720p (sicherer Standard)",
    avatarReference,
    voiceReference,
    visualStyle: trimmedOrNull(input.visualStyle, 400),
    background: trimmedOrNull(input.background, 400),
    captionRequested: input.captionRequested === true,
    sourceAssetReferences,
    dataClassification,
    containsPersonalData: input.containsPersonalData === true,
    containsCustomerData: input.containsCustomerData === true,
    containsHealthData: input.containsHealthData === true,
    containsChildren: input.containsChildren === true,
    avatarConsentConfirmed: input.avatarConsentConfirmed === true,
    voiceConsentConfirmed: input.voiceConsentConfirmed === true,
    // Beide Freigaben starten IMMER auf false, unabhängig von der Eingabe
    // (Auftrag Abschnitt D/E: "externalTransferApproved: false ist
    // Standard"). Eine Freigabe entsteht ausschließlich über die dafür
    // vorgesehenen, separaten Funktionen weiter unten.
    externalTransferApproved: false,
    costApprovalStatus: "UNKNOWN",
    // V7.1 Phase B.1 – fünfte, getrennte Freigabestufe: Kundenentwurfs-
    // freigabe. Startet IMMER auf PENDING, unabhängig von der Eingabe, und
    // ist ausdrücklich NICHT gleichbedeutend mit Veröffentlichung.
    customerDraftApprovalStatus: "PENDING",
    currency: trimmedOrNull(input.currency, 10) || "EUR",
    // Veröffentlichung bleibt in Phase B IMMER false – kein Eingabewert kann
    // dies überschreiben (Auftrag Abschnitt D/I).
    publicationApproved: false,
    contentApproved: false,
    allowedHeyGenActions: buildAllowedActionsForVideoType(videoType),
    forbiddenActions: [...HEYGEN_ALWAYS_FORBIDDEN_ACTIONS],
    expiresAt: trimmedOrNull(input.expiresAt, 40) || buildDefaultExpiresAt(options.now),
    status: "DRAFT",
    blockReasons: [],
    nextAllowedStep: "Inhalt prüfen (validateHeygenJobPackageContent).",
  };
  pkg.packageFingerprint = computePackageFingerprint(pkg);

  return { ok: true, package: clone(pkg) };
}

// ---------------------------------------------------------------------------
// Abschnitt E – Datenschutz-/Rechteprüfung. Rein lesend, verändert das
// übergebene Paket nicht; liefert eine bewertete Kopie zurück.
// ---------------------------------------------------------------------------

function validateHeygenJobPackageContent(pkgInput) {
  if (!isPlainObject(pkgInput)) {
    throw new Error("HeyGen-Auftragspaket muss ein Objekt sein.");
  }
  const pkg = clone(pkgInput);
  const reasons = [];

  if (!pkg.script || !pkg.script.trim()) {
    reasons.push("Scripttext fehlt.");
  } else {
    const combinedText = [pkg.script, pkg.title, pkg.purpose, pkg.targetAudience, pkg.tone, pkg.background, pkg.visualStyle]
      .filter(Boolean)
      .join("\n");
    if (containsCredentialLikeText(combinedText)) {
      reasons.push("Möglicher Zugangsdaten-/Geheimnisinhalt im Skript oder Begleittext erkannt.");
    }
    if (containsPersonalContactDetails(combinedText)) {
      reasons.push("Möglicher persönlicher Kontaktdatum (E-Mail/Telefonnummer) im Skript oder Begleittext erkannt.");
    }
  }

  if (!HEYGEN_PILOT_ALLOWED_VIDEO_TYPES.includes(pkg.videoType)) {
    reasons.push(
      `videoType "${pkg.videoType}" ist für den ersten Pilot nicht vorgesehen (nur ${HEYGEN_PILOT_ALLOWED_VIDEO_TYPES.join(", ")}).`,
    );
  }

  if (!HEYGEN_ASPECT_RATIOS.includes(pkg.aspectRatio)) {
    reasons.push(`Seitenverhältnis "${pkg.aspectRatio}" ist ungültig (erlaubt: ${HEYGEN_ASPECT_RATIOS.join(", ")}).`);
  }

  if (
    !Number.isFinite(pkg.durationTargetSeconds) ||
    pkg.durationTargetSeconds < HEYGEN_PILOT_MIN_DURATION_SECONDS ||
    pkg.durationTargetSeconds > HEYGEN_PILOT_MAX_DURATION_SECONDS
  ) {
    reasons.push(
      `Laufzeit ${pkg.durationTargetSeconds}s überschreitet das Pilotlimit (max. ${HEYGEN_PILOT_MAX_DURATION_SECONDS}s).`,
    );
  }

  if (pkg.avatarReference && pkg.avatarReference.visibility === "PRIVATE" && pkg.avatarConsentConfirmed !== true) {
    reasons.push("Privater Avatar ohne dokumentierte Zustimmung ist nicht erlaubt.");
  }
  if (!pkg.avatarReference && pkg.videoType === "AVATAR_VIDEO") {
    reasons.push("avatarReference fehlt für AVATAR_VIDEO.");
  }

  if (pkg.voiceReference && pkg.voiceReference.isClone === true) {
    reasons.push("Voice Clone ist im ersten Pilot ausdrücklich nicht erlaubt.");
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

  if (!HEYGEN_PILOT_ALLOWED_DATA_CLASSIFICATIONS.includes(pkg.dataClassification)) {
    reasons.push(
      `Datenklassifizierung "${pkg.dataClassification}" ist im ersten Pilot nicht erlaubt (nur ${HEYGEN_PILOT_ALLOWED_DATA_CLASSIFICATIONS.join(", ")}).`,
    );
  }

  const freeTextPathCandidates = [pkg.script, pkg.title, pkg.purpose, pkg.background, pkg.visualStyle];
  const referencePathCandidates = [
    pkg.avatarReference && pkg.avatarReference.avatarId,
    pkg.voiceReference && pkg.voiceReference.voiceId,
    ...(pkg.sourceAssetReferences || []),
  ];
  const hasAbsolutePath =
    freeTextPathCandidates.some((entry) => scanTextForAbsolutePaths(entry)) ||
    referencePathCandidates.some((entry) => containsAbsolutePath(entry));
  if (hasAbsolutePath) {
    reasons.push("Absolute Datei- oder Systempfade sind nicht erlaubt.");
  }

  if (pkg.publicationApproved === true) {
    // Defensive Zweitsicherung – prepareHeygenJobPackage erzwingt dies
    // bereits, dieser Zweig sollte praktisch nie erreicht werden.
    reasons.push("Veröffentlichung ist in Phase B ausdrücklich nicht freigegeben.");
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
      ? "Inhalt ist strukturell und rechtlich unauffällig. Jamal kann Inhalt, externe Übertragung und Kostenrahmen getrennt freigeben."
      : `Paket ist BLOCKED. Grund: ${reasons[0]} Nächster zulässiger Schritt: Ursache beheben und Paket erneut prüfen.`,
  };
  return { ok, package: clone(updated), blockReasons: reasons };
}

// ---------------------------------------------------------------------------
// Freigabestufen (Abschnitt I) – vier getrennte Entscheidungen, keine
// Sammelfreigabe. Jede Funktion mutiert nur ihr eigenes Feld und liefert
// eine neue Kopie zurück.
// ---------------------------------------------------------------------------

function approveContent(pkgInput) {
  const pkg = clone(pkgInput);
  if (pkg.status !== "READY_FOR_REVIEW") {
    throw new Error("Inhalt kann nur aus dem Status READY_FOR_REVIEW freigegeben werden.");
  }
  pkg.contentApproved = true;
  return clone(pkg);
}

function approveExternalTransfer(pkgInput) {
  const pkg = clone(pkgInput);
  pkg.externalTransferApproved = true;
  return clone(pkg);
}

// costStatus muss ausdrücklich WITHIN_APPROVED_LIMIT sein, um als Freigabe
// zu zählen; alle anderen Werte sind ehrliche Nicht-Freigaben (Auftrag
// Abschnitt F: keine erfundenen Preise, kein automatischer Kauf).
function setCostApproval(pkgInput, costStatus) {
  const pkg = clone(pkgInput);
  assertKnownEnum(costStatus, HEYGEN_COST_STATUSES, "costApprovalStatus");
  pkg.costApprovalStatus = costStatus;
  return clone(pkg);
}

// V7.1 Phase B.1 (Auftrag Abschnitt G) – Kundenpaket-/Abrechnungs-
// klassifizierung, getrennt von der internen Kostenfreigabe oben. Keine
// erfundenen Preise, keine automatische Abrechnung.
function setCostPackageStatus(pkgInput, costPackageStatus) {
  const pkg = clone(pkgInput);
  assertKnownEnum(costPackageStatus, HEYGEN_COST_PACKAGE_STATUSES, "costPackageStatus");
  pkg.costPackageStatus = costPackageStatus;
  return clone(pkg);
}

// V7.1 Phase B.1 (Auftrag Abschnitt E) – fünfte, getrennte Freigabestufe.
// Ausdrücklich NICHT gleichbedeutend mit Veröffentlichung (Regel 39): diese
// Funktion setzt niemals publicationApproved.
function approveCustomerDraft(pkgInput) {
  const pkg = clone(pkgInput);
  if (pkg.contentApproved !== true) {
    throw new Error("Kundenentwurfsfreigabe setzt eine bereits erteilte interne Inhaltsfreigabe voraus.");
  }
  pkg.customerDraftApprovalStatus = "APPROVED";
  return clone(pkg);
}

function requestCustomerDraftChanges(pkgInput, note) {
  const pkg = clone(pkgInput);
  pkg.customerDraftApprovalStatus = "CHANGES_REQUESTED";
  pkg.customerChangeRequestNote = trimmedOrNull(note, MAX_TEXT_FIELD_LENGTH);
  return clone(pkg);
}

// Veröffentlichung bleibt in Phase B strukturell unerreichbar – es gibt
// bewusst keine Funktion, die publicationApproved auf true setzt.
function isPublicationApproved(pkg) {
  return pkg && pkg.publicationApproved === true;
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
  const contentCheck = validateHeygenJobPackageContent(pkg);
  if (!contentCheck.ok) {
    missing.push("Inhalt (blockiert)");
  }
  if (pkg.contentApproved !== true) missing.push("Inhalt freigeben");
  if (pkg.externalTransferApproved !== true) missing.push("Externe Übertragung bestätigen");
  if (pkg.costApprovalStatus !== "WITHIN_APPROVED_LIMIT") missing.push("Kostenrahmen bestätigen");
  if (isPackageExpired(pkg, options.now)) missing.push("Paket ist abgelaufen (STALE)");
  const currentFingerprint = computePackageFingerprint(pkg);
  if (pkg.packageFingerprint !== currentFingerprint) missing.push("Fingerprint stimmt nicht mehr überein (Inhalt wurde verändert)");

  return {
    ready: missing.length === 0,
    missing,
    // publicationApproved ist bewusst NICHT Teil der Handoff-Voraussetzung
    // (Auftrag Abschnitt I: nur 1–3 werden für den ersten Piloten benötigt).
    publicationApproved: isPublicationApproved(pkg),
  };
}

module.exports = {
  HEYGEN_CAPABILITY_PROFILE,
  HEYGEN_SCHEMA_VERSION,
  HEYGEN_VIDEO_TYPES,
  HEYGEN_PILOT_ALLOWED_VIDEO_TYPES,
  HEYGEN_ASPECT_RATIOS,
  HEYGEN_JOB_STATUSES,
  HEYGEN_DATA_CLASSIFICATIONS,
  HEYGEN_PILOT_ALLOWED_DATA_CLASSIFICATIONS,
  HEYGEN_COST_STATUSES,
  HEYGEN_COST_PACKAGE_STATUSES,
  HEYGEN_CUSTOMER_DRAFT_APPROVAL_STATUSES,
  HEYGEN_PILOT_MAX_DURATION_SECONDS,
  HEYGEN_PILOT_MIN_DURATION_SECONDS,
  HEYGEN_ALWAYS_FORBIDDEN_ACTIONS,
  computePackageFingerprint,
  prepareHeygenJobPackage,
  validateHeygenJobPackageContent,
  approveContent,
  approveExternalTransfer,
  setCostApproval,
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
