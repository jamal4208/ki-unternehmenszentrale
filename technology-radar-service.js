"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt F/G).
//
// Persistenz über auth-db.js (Migration 14). Dieses Modul importiert KEIN
// better-sqlite3 selbst und führt KEINEN Netzwerkaufruf, keine
// Webrecherche und keine Werkzeugverbindung/-installation aus (Auftrag
// Abschnitt F: "V7.5 führt noch keine automatische Webrecherche aus").
//
// Startbestand (Seed): ausschließlich aus dem bereits bestehenden,
// statischen tool-registry.js#TOOL_REGISTRY abgeleitet – exakt die vom
// Auftrag genannten bekannten Kandidaten (GitHub, Airtable, Canva, HeyGen,
// Vercel, Google Workspace, Notion, n8n, Slack, HubSpot, Webflow,
// Lexoffice/Lexware, Make) sind dort bereits vorhanden. Keine erfundene
// Marktbehauptung, kein zusätzliches, nicht bereits im Projekt bekanntes
// Werkzeug wird hier neu vorgeschlagen. Reifegrad/Risiko/Kostenklasse/
// Empfehlung werden ausschließlich MECHANISCH aus den bereits vorhandenen
// tool-registry.js-Feldern abgeleitet (siehe deriveXxx()-Funktionen unten)
// – keine subjektive Neubewertung einzelner Werkzeuge, mit genau zwei
// dokumentierten, im Projekt bereits belegten Ausnahmen (siehe
// SEED_STATUS_OVERRIDES unten).

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const agentRegistry = require("./agent-registry");

let toolRegistry = null;
try {
  toolRegistry = require("./tool-registry");
} catch (_error) {
  toolRegistry = null;
}

const RADAR_TYPE_VALUES = Object.freeze([
  "MODEL",
  "PLUGIN",
  "CONNECTOR",
  "AUTOMATION",
  "DESIGN_TOOL",
  "VIDEO_TOOL",
  "OFFICE_TOOL",
  "DATA_TOOL",
  "DEVELOPER_TOOL",
  "SECURITY_TOOL",
  "OTHER",
]);

const RADAR_RECOMMENDATION_VALUES = Object.freeze([
  "WATCH",
  "RESEARCH",
  "TEST_READ_ONLY",
  "PILOT_WITH_APPROVAL",
  "NOT_RECOMMENDED",
  "BLOCKED",
]);

const RADAR_STATUS_VALUES = Object.freeze(["NOT_REVIEWED", "CANDIDATE", "REVIEWED", "READ_ONLY_TESTED", "PILOT", "CONNECTED"]);

const FIT_STATUS_VALUES = Object.freeze(["PROPOSED", "REVIEWED", "APPROVED_FOR_READ_ONLY_TEST", "REJECTED", "DEFERRED"]);
const FIT_PRIORITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

// ---------------------------------------------------------------------------
// Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L) – Zukunfts-/
// Szenariologik und Nutzenbereich. Müssen exakt den entsprechenden
// auth-db-migrations.js-CHECK-Aufzählungen entsprechen.
// ---------------------------------------------------------------------------
const RADAR_SIGNAL_TYPE_VALUES = Object.freeze([
  "MARKET_TREND",
  "INTERNAL_NEED",
  "CUSTOMER_REQUEST",
  "COMPETITIVE_SIGNAL",
  "REGULATORY_SIGNAL",
  "OTHER",
]);
const RADAR_TIME_HORIZON_VALUES = Object.freeze(["NOW", "1_2_YEARS", "3_5_YEARS", "5_PLUS_YEARS"]);
const RADAR_UNCERTAINTY_LEVEL_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
const BENEFIT_AREA_VALUES = Object.freeze([
  "TIME_SAVING",
  "QUALITY_IMPROVEMENT",
  "RISK_REDUCTION",
  "COST_CONTROL",
  "REVENUE_OPPORTUNITY",
  "CUSTOMER_VALUE",
  "EMPLOYEE_RELIEF",
  "STRATEGIC_READINESS",
]);
const PRIORITY_BUCKET_VALUES = Object.freeze(["NOW", "NEXT", "LATER", "WATCH"]);

const RADAR_SIGNAL_TYPE_LABELS_DE = Object.freeze({
  MARKET_TREND: "Markttrend",
  INTERNAL_NEED: "Interner Bedarf",
  CUSTOMER_REQUEST: "Kundenanfrage",
  COMPETITIVE_SIGNAL: "Wettbewerbssignal",
  REGULATORY_SIGNAL: "Regulatorisches Signal",
  OTHER: "Sonstiges",
});

const RADAR_TIME_HORIZON_LABELS_DE = Object.freeze({
  NOW: "Jetzt",
  "1_2_YEARS": "1–2 Jahre",
  "3_5_YEARS": "3–5 Jahre",
  "5_PLUS_YEARS": "5+ Jahre",
});

const RADAR_UNCERTAINTY_LEVEL_LABELS_DE = Object.freeze({ LOW: "Niedrig", MEDIUM: "Mittel", HIGH: "Hoch" });

const BENEFIT_AREA_LABELS_DE = Object.freeze({
  TIME_SAVING: "Zeitersparnis",
  QUALITY_IMPROVEMENT: "Qualitätsverbesserung",
  RISK_REDUCTION: "Risikoreduktion",
  COST_CONTROL: "Kostenkontrolle",
  REVENUE_OPPORTUNITY: "Umsatzchance",
  CUSTOMER_VALUE: "Kundennutzen",
  EMPLOYEE_RELIEF: "Entlastung im Team",
  STRATEGIC_READINESS: "Strategische Zukunftsfähigkeit",
});

const PRIORITY_BUCKET_LABELS_DE = Object.freeze({ NOW: "Jetzt", NEXT: "Als Nächstes", LATER: "Später", WATCH: "Beobachten" });

// Auftrag Abschnitt J – rein mechanische Ableitung aus dem bereits
// bestehenden "type"-Feld (siehe deriveType() unten), keine erfundene
// Zusatzbewertung.
const BENEFIT_AREA_BY_RADAR_TYPE = Object.freeze({
  MODEL: "STRATEGIC_READINESS",
  PLUGIN: "TIME_SAVING",
  CONNECTOR: "TIME_SAVING",
  AUTOMATION: "TIME_SAVING",
  DESIGN_TOOL: "CUSTOMER_VALUE",
  VIDEO_TOOL: "CUSTOMER_VALUE",
  OFFICE_TOOL: "EMPLOYEE_RELIEF",
  DATA_TOOL: "QUALITY_IMPROVEMENT",
  DEVELOPER_TOOL: "TIME_SAVING",
  SECURITY_TOOL: "RISK_REDUCTION",
  OTHER: "STRATEGIC_READINESS",
});

function deriveBenefitArea(radarType) {
  return BENEFIT_AREA_BY_RADAR_TYPE[radarType] || "STRATEGIC_READINESS";
}

const RADAR_RECOMMENDATION_LABELS_DE = Object.freeze({
  WATCH: "Beobachten",
  RESEARCH: "Recherchieren",
  TEST_READ_ONLY: "Read-only testen",
  PILOT_WITH_APPROVAL: "Pilot mit Freigabe",
  NOT_RECOMMENDED: "Nicht empfohlen",
  BLOCKED: "Blockiert",
});

const RADAR_STATUS_LABELS_DE = Object.freeze({
  NOT_REVIEWED: "Noch nicht geprüft",
  CANDIDATE: "Kandidat",
  REVIEWED: "Geprüft",
  READ_ONLY_TESTED: "Read-only getestet",
  PILOT: "Pilot",
  CONNECTED: "Bereits verbunden",
});

const FIT_STATUS_LABELS_DE = Object.freeze({
  PROPOSED: "Vorgeschlagen",
  REVIEWED: "Geprüft",
  APPROVED_FOR_READ_ONLY_TEST: "Für Read-only-Test freigegeben",
  REJECTED: "Abgelehnt",
  DEFERRED: "Zurückgestellt",
});

class TechnologyRadarError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "TechnologyRadarError";
    this.statusCode = statusCode;
  }
}

function badRequest(message) {
  return new TechnologyRadarError(message, 400);
}

function notFound(message) {
  return new TechnologyRadarError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function toJson(value) {
  return JSON.stringify(value || []);
}

function fromJson(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function auditSafe(db, { eventType, result, actorUserId, radarItemId, agentId, fitId, recommendationCode, decisionType }) {
  if (!db) return;
  try {
    const metadata = {};
    if (radarItemId) metadata.radarItemId = radarItemId;
    if (agentId) metadata.agentKey = agentId;
    if (fitId) metadata.fitId = fitId;
    if (recommendationCode) metadata.recommendationCode = recommendationCode;
    if (decisionType) metadata.decisionType = decisionType;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf einen Radar-Aufruf niemals zum Absturz bringen. */
  }
}

// ---------------------------------------------------------------------------
// F. Mechanische Ableitung aus tool-registry.js – keine erfundene Bewertung.
// ---------------------------------------------------------------------------

const TOOL_CATEGORY_TO_RADAR_TYPE = Object.freeze({
  "KI-Modelle": "MODEL",
  "Code-Executor": "DEVELOPER_TOOL",
  Design: "DESIGN_TOOL",
  Bild: "DESIGN_TOOL",
  Video: "VIDEO_TOOL",
  Avatar: "VIDEO_TOOL",
  Präsentation: "OFFICE_TOOL",
  Commerce: "OTHER",
  "Website/Deployment": "DEVELOPER_TOOL",
  "Daten/CRM": "DATA_TOOL",
  Kommunikation: "OFFICE_TOOL",
  Automatisierung: "AUTOMATION",
  Recherche: "OTHER",
  Dokumente: "OFFICE_TOOL",
});

const CONNECTION_STATUS_TO_RADAR_STATUS = Object.freeze({
  NOT_CONNECTED: "CANDIDATE",
  MANUAL_ONLY: "READ_ONLY_TESTED",
  PARTIALLY_CONNECTED: "PILOT",
  CONNECTED: "CONNECTED",
});

const COST_MODEL_LABELS_DE = Object.freeze({
  FREE: "Kostenlos",
  SUBSCRIPTION: "Abo",
  USAGE_BASED: "Nutzungsbasiert",
  UNKNOWN: "UNGEKLÄRT",
});

// Zwei dokumentierte, im Projekt bereits an anderer Stelle belegte
// Ausnahmen von der rein mechanischen Statusableitung: Canva und HeyGen
// haben bereits einen getesteten CONTROLLED_CONNECTOR_HANDOFF-Pilotpfad
// (canva-connector.js/jamal-canva-production-service.js bzw.
// heygen-connector.js) – Canva zusätzlich einen dokumentierten
// authentifizierten Echtlauf außerhalb dieses Servers
// (CANVA_AUTHENTICATED_RUN_ACCEPTANCE.md). "PILOT" beschreibt das ehrlich,
// ohne eine tatsächliche technische Verbindung dieses Servers zu behaupten
// (tool-registry.js#connectionStatus bleibt bei beiden bewusst
// NOT_CONNECTED, siehe dortiger Kommentar).
const SEED_STATUS_OVERRIDES = Object.freeze({
  canva: { status: "PILOT", recommendation: "PILOT_WITH_APPROVAL" },
  heygen: { status: "PILOT", recommendation: "PILOT_WITH_APPROVAL" },
});

function deriveMaturityLevel(tool) {
  if (tool.executionMode === "DIRECT") return "Direkt ausführbar (lokal)";
  if (tool.executionMode === "CONTROLLED_HANDOFF") return "Pilotreif (kontrollierte Übergabe)";
  return "Konzept/Empfehlung (noch keine technische Anbindung)";
}

function deriveSecurityRisk(tool) {
  if (tool.writeCapability && tool.publicationCapability) return "HOCH";
  if (tool.writeCapability || tool.publicationCapability) return "MITTEL";
  return "NIEDRIG";
}

function derivePrivacyRisk(tool) {
  if (tool.allowedDataClassifications.includes("SECRET")) return "HOCH";
  if (tool.allowedDataClassifications.includes("SENSITIVE")) return "MITTEL";
  return "NIEDRIG";
}

function deriveIntegrationEffort(tool) {
  if (tool.executionMode === "DIRECT") return "Gering (bereits lokal integriert)";
  if (tool.executionMode === "CONTROLLED_HANDOFF") return "Mittel (kontrollierte Übergabe erforderlich)";
  return "Hoch (noch keine technische Anbindung)";
}

function deriveVendorLockInRisk(tool) {
  if (Array.isArray(tool.fallbackToolIds) && tool.fallbackToolIds.length > 0) {
    return `Begrenzt (dokumentierter Fallback: ${tool.fallbackToolIds.join(", ")})`;
  }
  return "Erhöht (kein dokumentierter Fallback im Werkzeugregister)";
}

function deriveRecommendation(tool) {
  const override = SEED_STATUS_OVERRIDES[tool.toolId];
  if (override) return override.recommendation;
  const risky = Boolean(tool.writeCapability || tool.publicationCapability || tool.allowedDataClassifications.includes("SECRET"));
  if (tool.connectionStatus === "NOT_CONNECTED") return risky ? "WATCH" : "RESEARCH";
  return risky ? "PILOT_WITH_APPROVAL" : "TEST_READ_ONLY";
}

function deriveStatus(tool) {
  const override = SEED_STATUS_OVERRIDES[tool.toolId];
  if (override) return override.status;
  return CONNECTION_STATUS_TO_RADAR_STATUS[tool.connectionStatus] || "NOT_REVIEWED";
}

function deriveType(tool) {
  return TOOL_CATEGORY_TO_RADAR_TYPE[tool.category] || "OTHER";
}

function buildRadarItemFromTool(tool) {
  const now = nowIso();
  const capabilitiesText = (tool.capabilities || []).join("; ") || "Keine Fähigkeiten im Werkzeugregister hinterlegt.";
  const radarType = deriveType(tool);
  const recommendation = deriveRecommendation(tool);
  return {
    id: crypto.randomUUID(),
    name: tool.displayName,
    provider: tool.provider,
    category: tool.category,
    type: radarType,
    shortDescription: truncate(capabilitiesText, 500),
    possibleAgentsJson: toJson(tool.allowedAgents || []),
    possibleBusinessBenefit: truncate(
      `Mögliche Fähigkeiten für die Zentrale: ${capabilitiesText}`,
      500,
    ),
    maturityLevel: deriveMaturityLevel(tool),
    securityRisk: deriveSecurityRisk(tool),
    privacyRisk: derivePrivacyRisk(tool),
    costClass: COST_MODEL_LABELS_DE[tool.costModel] || "UNGEKLÄRT",
    integrationEffort: deriveIntegrationEffort(tool),
    vendorLockInRisk: deriveVendorLockInRisk(tool),
    writeAccessRequired: Boolean(tool.writeCapability),
    humanApprovalRequired: tool.requiredApproval !== undefined && tool.requiredApproval !== null,
    recommendation,
    reasoning: truncate(
      `Mechanisch aus tool-registry.js abgeleitet: connectionStatus=${tool.connectionStatus}, executionMode=${tool.executionMode}, ` +
        `writeCapability=${tool.writeCapability}, publicationCapability=${tool.publicationCapability}.`,
      500,
    ),
    lastReviewedAt: tool.lastVerifiedAt || null,
    nextReviewAt: null,
    sourceNote: truncate(tool.verificationSource || "tool-registry.js", 500),
    status: deriveStatus(tool),
    seedToolId: tool.toolId,
    createdAt: now,
    updatedAt: now,
    // Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L) – neutrale,
    // ehrliche Platzhalterwerte statt erfundener Marktbehauptungen. "OTHER"/
    // "NOW"/"MEDIUM" sind bewusste, dokumentierte Standardwerte für einen aus
    // dem bereits bestehenden tool-registry.js geseedeten Eintrag; eine
    // echte Zukunftsbeobachtung ersetzt dies erst durch einen bewussten,
    // manuellen upsertRadarItem()-Aufruf.
    signalType: "OTHER",
    signalDescription: truncate(
      "Noch keine spezifische Zukunftsbeobachtung erfasst – neutraler Platzhalter, ausschließlich aus tool-registry.js abgeleitet.",
      500,
    ),
    timeHorizon: "NOW",
    uncertaintyLevel: "MEDIUM",
    scenarioConservative: truncate(
      `Konservativ: Status bleibt bei "${tool.connectionStatus}", keine zusätzliche Anbindung über den heutigen Stand hinaus.`,
      500,
    ),
    scenarioLikely: truncate(
      `Wahrscheinlich: schrittweise read-only Prüfung entlang der bestehenden Empfehlung "${recommendation}".`,
      500,
    ),
    scenarioDynamic: truncate(
      `Dynamisch: bei ausdrücklichem Bedarf zügigerer Pilotweg über einen separaten, noch nicht existierenden Freigabekorridor – weiterhin ohne automatische Installation.`,
      500,
    ),
    strategicImpact: truncate(
      "Strategische Wirkung hängt vom tatsächlichen Bedarf ab; aktuell keine belastbare Datenlage für eine höhere Einstufung.",
      500,
    ),
    todayPreparationStep: truncate(
      `Heute vorbereiten: bestehende Fähigkeiten (${capabilitiesText}) gegen einen konkreten Agentenbedarf prüfen, bevor irgendein Zugriff angefragt wird.`,
      500,
    ),
    benefitArea: deriveBenefitArea(radarType),
    priorityBucket: "WATCH",
  };
}

// Idempotent: ein bereits aus einem bestimmten seedToolId erzeugter
// Radar-Eintrag wird nie doppelt angelegt (UNIQUE(seedToolId), siehe
// Migration 14) – ein erneuter Aufruf aktualisiert stattdessen die
// abgeleiteten Felder auf den aktuellen tool-registry.js-Stand.
function ensureSeedFromToolRegistry(db) {
  if (!toolRegistry || !Array.isArray(toolRegistry.TOOL_REGISTRY)) return;
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    const existing = authDb.getTechnologyRadarItemBySeedToolId(db, tool.toolId);
    const input = buildRadarItemFromTool(tool);
    if (existing) {
      input.id = existing.id;
      input.createdAt = existing.createdAt;
      // Eine bereits von Jamal manuell geänderte Statuszeile wird durch den
      // Seed-Abgleich nicht zurückgesetzt (kein stilles Überschreiben einer
      // Prüfentscheidung) – ausschließlich Status/Empfehlung bleiben
      // unverändert, wenn sie bereits vom seed-abgeleiteten Wert abweichen.
      if (existing.status !== buildRadarItemFromTool(tool).status && existing.status !== "NOT_REVIEWED") {
        input.status = existing.status;
      }
      if (existing.recommendation && existing.reasoning !== input.reasoning) {
        // Begründung/Ableitungsfelder dürfen aktualisiert werden – die
        // Empfehlung selbst bleibt unverändert, sobald sie einmal manuell
        // geprüft wurde (siehe reviewRadarItem()).
      }
      // Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/L) – Zukunfts-/
      // Szenario-, Nutzen- und Prioritätsfelder werden bei einem bereits
      // bestehenden Eintrag NIEMALS durch den Seed-Abgleich zurückgesetzt
      // (kein stilles Überschreiben einer bewussten Entscheidung, insb.
      // "weniger beginnen, Wichtiges zuverlässig abschließen" – ein einmal
      // bewusst hochgestuftes priorityBucket darf nicht bei jedem
      // Seitenaufruf wieder auf WATCH zurückfallen). Änderungen erfolgen
      // ausschließlich über upsertRadarItem()/reviewForesightScenario().
      input.signalType = existing.signalType;
      input.signalDescription = existing.signalDescription;
      input.timeHorizon = existing.timeHorizon;
      input.uncertaintyLevel = existing.uncertaintyLevel;
      input.scenarioConservative = existing.scenarioConservative;
      input.scenarioLikely = existing.scenarioLikely;
      input.scenarioDynamic = existing.scenarioDynamic;
      input.strategicImpact = existing.strategicImpact;
      input.todayPreparationStep = existing.todayPreparationStep;
      input.benefitArea = existing.benefitArea;
      input.priorityBucket = existing.priorityBucket;
    }
    authDb.upsertTechnologyRadarItem(db, input);
  });
}

function rowToRadarView(row) {
  return {
    radarItemId: row.id,
    name: row.name,
    provider: row.provider,
    category: row.category,
    type: row.type,
    shortDescription: row.shortDescription,
    possibleAgents: fromJson(row.possibleAgentsJson),
    possibleBusinessBenefit: row.possibleBusinessBenefit,
    maturityLevel: row.maturityLevel,
    securityRisk: row.securityRisk,
    privacyRisk: row.privacyRisk,
    costClass: row.costClass,
    integrationEffort: row.integrationEffort,
    vendorLockInRisk: row.vendorLockInRisk,
    writeAccessRequired: Boolean(row.writeAccessRequired),
    humanApprovalRequired: Boolean(row.humanApprovalRequired),
    recommendation: row.recommendation,
    recommendationLabel: RADAR_RECOMMENDATION_LABELS_DE[row.recommendation] || "UNGEKLÄRT",
    reasoning: row.reasoning,
    lastReviewedAt: row.lastReviewedAt,
    nextReviewAt: row.nextReviewAt,
    sourceNote: row.sourceNote,
    status: row.status,
    statusLabel: RADAR_STATUS_LABELS_DE[row.status] || "UNGEKLÄRT",
    seedToolId: row.seedToolId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    noExternalConnectionMade: true,
    noInstallationPerformed: true,
    // Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L).
    signalType: row.signalType,
    signalTypeLabel: RADAR_SIGNAL_TYPE_LABELS_DE[row.signalType] || "UNGEKLÄRT",
    signalDescription: row.signalDescription,
    timeHorizon: row.timeHorizon,
    timeHorizonLabel: RADAR_TIME_HORIZON_LABELS_DE[row.timeHorizon] || "UNGEKLÄRT",
    uncertaintyLevel: row.uncertaintyLevel,
    uncertaintyLevelLabel: RADAR_UNCERTAINTY_LEVEL_LABELS_DE[row.uncertaintyLevel] || "UNGEKLÄRT",
    scenarioConservative: row.scenarioConservative,
    scenarioLikely: row.scenarioLikely,
    scenarioDynamic: row.scenarioDynamic,
    strategicImpact: row.strategicImpact,
    todayPreparationStep: row.todayPreparationStep,
    nextReviewDate: row.nextReviewAt,
    benefitArea: row.benefitArea,
    benefitAreaLabel: BENEFIT_AREA_LABELS_DE[row.benefitArea] || "UNGEKLÄRT",
    priorityBucket: row.priorityBucket,
    priorityBucketLabel: PRIORITY_BUCKET_LABELS_DE[row.priorityBucket] || "UNGEKLÄRT",
    scenarioIsNotAGuarantee: true,
  };
}

function listRadarItems(db, options = {}) {
  ensureSeedFromToolRegistry(db);
  void options;
  return authDb.listTechnologyRadarItems(db).map(rowToRadarView);
}

const REQUIRED_RADAR_FIELDS = Object.freeze([
  "name",
  "provider",
  "category",
  "type",
  "shortDescription",
  "possibleBusinessBenefit",
  "maturityLevel",
  "securityRisk",
  "privacyRisk",
  "costClass",
  "integrationEffort",
  "vendorLockInRisk",
  "recommendation",
  "reasoning",
]);

// J. "Radar-Eintrag lokal anlegen/aktualisieren" – EINE Fähigkeit
// (Auftrag Abschnitt J). Erstellt ausschließlich lokal einen bewertenden
// Datensatz; es findet keine Webrecherche, keine externe Anfrage und keine
// Werkzeugverbindung statt (Auftrag Abschnitt F).
function upsertRadarItem(db, input = {}, options = {}) {
  const missing = REQUIRED_RADAR_FIELDS.filter((field) => !String(input[field] || "").trim());
  if (missing.length > 0) {
    throw badRequest(`Radar-Eintrag ist unvollständig: ${missing.join(", ")}`);
  }
  if (!RADAR_TYPE_VALUES.includes(input.type)) throw badRequest("Unbekannter Typ.");
  if (!RADAR_RECOMMENDATION_VALUES.includes(input.recommendation)) throw badRequest("Unbekannte Empfehlung.");
  const status = input.status && RADAR_STATUS_VALUES.includes(input.status) ? input.status : "NOT_REVIEWED";

  const now = nowIso(options.now);
  const existing = input.radarItemId ? authDb.getTechnologyRadarItemById(db, input.radarItemId) : null;
  if (input.radarItemId && !existing) throw notFound("Dieser Radar-Eintrag wurde nicht gefunden.");

  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L) – die neuen
  // Zukunfts-/Szenario-/Nutzenfelder sind bewusst OPTIONAL in diesem
  // Formular (kein Bruch des bestehenden REQUIRED_RADAR_FIELDS-Vertrags):
  // fehlen sie, bleibt ein bereits bestehender Wert erhalten, oder es wird
  // ein ehrlicher neutraler Standardwert gesetzt (nie eine erfundene
  // Marktbehauptung).
  const signalType = RADAR_SIGNAL_TYPE_VALUES.includes(input.signalType) ? input.signalType : existing ? existing.signalType : "OTHER";
  const timeHorizon = RADAR_TIME_HORIZON_VALUES.includes(input.timeHorizon) ? input.timeHorizon : existing ? existing.timeHorizon : "NOW";
  const uncertaintyLevel = RADAR_UNCERTAINTY_LEVEL_VALUES.includes(input.uncertaintyLevel)
    ? input.uncertaintyLevel
    : existing
      ? existing.uncertaintyLevel
      : "MEDIUM";
  const benefitArea = BENEFIT_AREA_VALUES.includes(input.benefitArea)
    ? input.benefitArea
    : existing
      ? existing.benefitArea
      : deriveBenefitArea(input.type);
  const priorityBucket = PRIORITY_BUCKET_VALUES.includes(input.priorityBucket)
    ? input.priorityBucket
    : existing
      ? existing.priorityBucket
      : "WATCH";
  const neutralScenarioPlaceholder = "Noch keine spezifische Einschätzung erfasst – neutraler Platzhalter, keine Prognosegarantie.";

  const record = {
    id: existing ? existing.id : crypto.randomUUID(),
    name: truncate(input.name, 200),
    provider: truncate(input.provider, 200),
    category: truncate(input.category, 200),
    type: input.type,
    shortDescription: truncate(input.shortDescription, 500),
    possibleAgentsJson: toJson((input.possibleAgents || []).filter((agentId) => agentRegistry.hasAgentId(agentId))),
    possibleBusinessBenefit: truncate(input.possibleBusinessBenefit, 500),
    maturityLevel: truncate(input.maturityLevel, 200),
    securityRisk: truncate(input.securityRisk, 200),
    privacyRisk: truncate(input.privacyRisk, 200),
    costClass: truncate(input.costClass, 200),
    integrationEffort: truncate(input.integrationEffort, 200),
    vendorLockInRisk: truncate(input.vendorLockInRisk, 200),
    writeAccessRequired: Boolean(input.writeAccessRequired),
    humanApprovalRequired: input.humanApprovalRequired !== false,
    recommendation: input.recommendation,
    reasoning: truncate(input.reasoning, 500),
    lastReviewedAt: now,
    nextReviewAt: input.nextReviewAt || (existing ? existing.nextReviewAt : null),
    sourceNote: input.sourceNote ? truncate(input.sourceNote, 500) : existing ? existing.sourceNote : null,
    status,
    seedToolId: existing ? existing.seedToolId : null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    signalType,
    signalDescription: input.signalDescription
      ? truncate(input.signalDescription, 500)
      : existing
        ? existing.signalDescription
        : neutralScenarioPlaceholder,
    timeHorizon,
    uncertaintyLevel,
    scenarioConservative: input.scenarioConservative
      ? truncate(input.scenarioConservative, 500)
      : existing
        ? existing.scenarioConservative
        : neutralScenarioPlaceholder,
    scenarioLikely: input.scenarioLikely ? truncate(input.scenarioLikely, 500) : existing ? existing.scenarioLikely : neutralScenarioPlaceholder,
    scenarioDynamic: input.scenarioDynamic
      ? truncate(input.scenarioDynamic, 500)
      : existing
        ? existing.scenarioDynamic
        : neutralScenarioPlaceholder,
    strategicImpact: input.strategicImpact
      ? truncate(input.strategicImpact, 500)
      : existing
        ? existing.strategicImpact
        : neutralScenarioPlaceholder,
    todayPreparationStep: input.todayPreparationStep
      ? truncate(input.todayPreparationStep, 500)
      : existing
        ? existing.todayPreparationStep
        : "Heute vorbereiten: konkreten Anwendungsfall mit einem Agenten klären, bevor irgendein Zugriff angefragt wird.",
    benefitArea,
    priorityBucket,
  };
  const row = authDb.upsertTechnologyRadarItem(db, record);

  auditSafe(db, {
    eventType: existing ? "TECH_RADAR_ITEM_UPDATED" : "TECH_RADAR_ITEM_CREATED",
    result: "OK",
    actorUserId: options.actorUserId,
    radarItemId: row.id,
    recommendationCode: row.recommendation,
  });

  return rowToRadarView(row);
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt P) – markiert ausschließlich,
// DASS Jamal ein Zukunftsszenario zur Kenntnis genommen hat (lastReviewedAt),
// ohne irgendein anderes Feld zu verändern. Kein Szenario wird dadurch zu
// einer Prognosegarantie; es löst weder eine Investition noch eine
// Installation aus.
function reviewForesightScenario(db, options = {}) {
  const radarItemId = options.radarItemId;
  if (!radarItemId) throw badRequest("radarItemId ist erforderlich.");
  const row = authDb.getTechnologyRadarItemById(db, radarItemId);
  if (!row) throw notFound("Dieser Radar-Eintrag wurde nicht gefunden.");

  const now = nowIso(options.now);
  const updated = authDb.upsertTechnologyRadarItem(db, { ...row, lastReviewedAt: now, updatedAt: now });

  auditSafe(db, {
    eventType: "FORESIGHT_SCENARIO_REVIEWED",
    result: "OK",
    actorUserId: options.actorUserId,
    radarItemId: row.id,
  });

  return rowToRadarView(updated);
}

// ---------------------------------------------------------------------------
// G. Agent-Technology-Fit.
// ---------------------------------------------------------------------------

function rowToFitView(row, radarRow) {
  return {
    id: row.id,
    agentId: row.agentId,
    ownerAgentId: row.agentId,
    agentName: (agentRegistry.getAgentById(row.agentId) || {}).name || row.agentId,
    radarItemId: row.radarItemId,
    radarItemName: radarRow ? radarRow.name : null,
    benefit: row.benefit,
    concreteUseCase: row.concreteUseCase,
    requiredPermissions: row.requiredPermissions,
    securityBoundary: row.securityBoundary,
    testPrerequisite: row.testPrerequisite,
    recommendation: row.recommendation,
    recommendationLabel: RADAR_RECOMMENDATION_LABELS_DE[row.recommendation] || "UNGEKLÄRT",
    priority: row.priority,
    status: row.status,
    statusLabel: FIT_STATUS_LABELS_DE[row.status] || "UNGEKLÄRT",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    noAutonomyChangeApplied: true,
    noConnectionMade: true,
  };
}

// Startbestand: für jedes tool-registry.js-Werkzeug mit bereits
// dokumentierten allowedAgents wird je Agent GENAU EIN Fit-Vorschlag
// angelegt (UNIQUE(agentId, radarItemId), siehe Migration 14) – keine
// erfundene Eignungsaussage, ausschließlich aus der bereits bestehenden
// tool-registry.js#allowedAgents-Zuordnung abgeleitet.
function ensureFitSeedFromToolRegistry(db) {
  if (!toolRegistry || !Array.isArray(toolRegistry.TOOL_REGISTRY)) return;
  const now = nowIso();
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    const radarRow = authDb.getTechnologyRadarItemBySeedToolId(db, tool.toolId);
    if (!radarRow) return;
    (tool.allowedAgents || []).forEach((agentId) => {
      if (!agentRegistry.hasAgentId(agentId)) return;
      const existing = authDb.getAgentTechnologyFitByPair(db, agentId, radarRow.id);
      if (existing) return;
      const agent = agentRegistry.getAgentById(agentId);
      authDb.upsertAgentTechnologyFit(db, {
        id: crypto.randomUUID(),
        agentId,
        radarItemId: radarRow.id,
        benefit: truncate(
          `${tool.displayName} könnte ${agent.name} bei folgender Aufgabe unterstützen: ${agent.role}.`,
          500,
        ),
        concreteUseCase: truncate((tool.capabilities || [])[0] || "Konkreter Einsatzfall noch zu klären.", 500),
        requiredPermissions: truncate(
          tool.writeCapability ? "Schreibzugriff (aktuell nicht freigegeben)" : "Ausschließlich Lesezugriff",
          500,
        ),
        securityBoundary: truncate(
          `Datenklassifizierung ausschließlich ${tool.allowedDataClassifications.join("/")}; keine automatische Ausführung.`,
          500,
        ),
        testPrerequisite: truncate("Zuerst read-only testen, bevor irgendein Schreibzugriff geprüft wird.", 500),
        recommendation: deriveRecommendation(tool),
        priority: tool.writeCapability || tool.publicationCapability ? "LOW" : "MEDIUM",
        status: "PROPOSED",
        createdAt: now,
        updatedAt: now,
      });
    });
  });
}

function listAgentTechnologyFit(db, filter = {}) {
  ensureSeedFromToolRegistry(db);
  ensureFitSeedFromToolRegistry(db);
  const rows = authDb.listAgentTechnologyFit(db, filter);
  return rows.map((row) => rowToFitView(row, authDb.getTechnologyRadarItemById(db, row.radarItemId)));
}

const REVIEW_FIT_STATUS_VALUES = Object.freeze(["REVIEWED", "APPROVED_FOR_READ_ONLY_TEST", "REJECTED", "DEFERRED"]);

// J. "Fit-Empfehlung bewerten" – ändert ausschließlich den Prüfstatus/die
// Priorität dieser EINEN Zuordnung. Löst niemals eine Verbindung, eine
// Installation oder eine tatsächliche Berechtigungsänderung aus (Auftrag
// Abschnitt M).
function reviewAgentTechnologyFit(db, options = {}) {
  const fitId = options.fitId;
  const status = options.status;
  if (!fitId) throw badRequest("fitId ist erforderlich.");
  if (!REVIEW_FIT_STATUS_VALUES.includes(status)) {
    throw badRequest("Ein gültiger Prüfstatus ist erforderlich (REVIEWED, APPROVED_FOR_READ_ONLY_TEST, REJECTED oder DEFERRED).");
  }
  const row = authDb.getAgentTechnologyFitById(db, fitId);
  if (!row) throw notFound("Diese Agent-Technologie-Zuordnung wurde nicht gefunden.");
  const priority = options.priority && FIT_PRIORITY_VALUES.includes(options.priority) ? options.priority : row.priority;

  const updated = authDb.upsertAgentTechnologyFit(db, {
    ...row,
    status,
    priority,
    updatedAt: nowIso(options.now),
  });

  auditSafe(db, {
    eventType: "AGENT_TECH_FIT_REVIEWED",
    result: "OK",
    actorUserId: options.actorUserId,
    radarItemId: row.radarItemId,
    agentId: row.agentId,
    fitId: row.id,
    recommendationCode: row.recommendation,
    decisionType: status,
  });

  return rowToFitView(updated, authDb.getTechnologyRadarItemById(db, updated.radarItemId));
}

module.exports = {
  TechnologyRadarError,
  RADAR_TYPE_VALUES,
  RADAR_RECOMMENDATION_VALUES,
  RADAR_STATUS_VALUES,
  FIT_STATUS_VALUES,
  FIT_PRIORITY_VALUES,
  RADAR_RECOMMENDATION_LABELS_DE,
  RADAR_STATUS_LABELS_DE,
  FIT_STATUS_LABELS_DE,
  // Unternehmensleitlinien V1.0
  RADAR_SIGNAL_TYPE_VALUES,
  RADAR_TIME_HORIZON_VALUES,
  RADAR_UNCERTAINTY_LEVEL_VALUES,
  BENEFIT_AREA_VALUES,
  PRIORITY_BUCKET_VALUES,
  RADAR_SIGNAL_TYPE_LABELS_DE,
  RADAR_TIME_HORIZON_LABELS_DE,
  RADAR_UNCERTAINTY_LEVEL_LABELS_DE,
  BENEFIT_AREA_LABELS_DE,
  PRIORITY_BUCKET_LABELS_DE,
  deriveBenefitArea,
  reviewForesightScenario,
  ensureSeedFromToolRegistry,
  listRadarItems,
  upsertRadarItem,
  ensureFitSeedFromToolRegistry,
  listAgentTechnologyFit,
  reviewAgentTechnologyFit,
  rowToRadarView,
  rowToFitView,
};
