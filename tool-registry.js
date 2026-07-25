"use strict";

// V7.1 Phase A – kanonisches Werkzeug- und Lizenzregister.
//
// Rein statischer, code-basierter Katalog (Muster: project-registry.js /
// agent-registry.js). Ein hier vorgemerktes Werkzeug bedeutet ausdrücklich
// NICHT, dass es technisch verbunden ist. Keine echten Zugangsdaten, keine
// Tokens, keine Secrets – ausschließlich sichere Statusaussagen. Live-Status
// (Codex, lokaler Git-Stand, Airtable-Zugangsdaten-Anwesenheit) wird
// ausschließlich von plugin-gateway.js gespiegelt, nicht hier.

const TOOL_CATEGORIES = Object.freeze([
  "KI-Modelle",
  "Code-Executor",
  "Design",
  "Bild",
  "Video",
  "Avatar",
  "Präsentation",
  "Commerce",
  "Website/Deployment",
  "Daten/CRM",
  "Kommunikation",
  "Automatisierung",
  "Recherche",
  "Dokumente",
]);

const AVAILABILITY_STATUSES = Object.freeze(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]);
const CONNECTION_STATUSES = Object.freeze(["CONNECTED", "PARTIALLY_CONNECTED", "NOT_CONNECTED", "MANUAL_ONLY"]);
const EXECUTION_MODES = Object.freeze(["DIRECT", "CONTROLLED_HANDOFF", "RECOMMENDATION_ONLY"]);
const DATA_CLASSIFICATIONS = Object.freeze(["NORMAL", "SENSITIVE", "SECRET"]);
const COST_MODELS = Object.freeze(["FREE", "SUBSCRIPTION", "USAGE_BASED", "UNKNOWN"]);
const LICENSE_STATUSES = Object.freeze(["NONE", "ACTIVE", "EXPIRED", "UNKNOWN"]);

const BASE_SAFETY_NOTES = Object.freeze([
  "Vormerkung bedeutet keine technische Verbindung.",
  "Keine automatische Ausführung, kein automatischer Kauf, kein automatisches Upgrade.",
]);

function createTool(overrides) {
  return {
    toolId: null,
    displayName: null,
    category: null,
    provider: null,
    availabilityStatus: "UNKNOWN",
    connectionStatus: "NOT_CONNECTED",
    executionMode: "RECOMMENDATION_ONLY",
    capabilities: [],
    allowedDataClassifications: ["NORMAL"],
    readCapability: false,
    writeCapability: false,
    externalTransferRequired: true,
    publicationCapability: false,
    costModel: "UNKNOWN",
    estimatedUnitCost: null,
    currency: "EUR",
    monthlyBudget: null,
    currentUsage: null,
    usageSource: "UNKNOWN",
    licenseStatus: "UNKNOWN",
    licenseOwner: null,
    licenseSeats: null,
    renewalDate: null,
    allowedProjects: "ALL",
    allowedAgents: [],
    requiredApproval: "JAMAL",
    fallbackToolIds: [],
    lastVerifiedAt: "2026-07-25",
    verificationSource: "V7.1 Phase A Werkzeug-/Lizenzregister-Vormerkung",
    notes: [...BASE_SAFETY_NOTES],
    ...overrides,
  };
}

const TOOL_REGISTRY = Object.freeze(
  [
    createTool({
      toolId: "chatgpt",
      displayName: "ChatGPT",
      category: "KI-Modelle",
      provider: "OpenAI",
      capabilities: ["Text", "Recherche-Unterstützung", "Entwurf"],
      allowedDataClassifications: ["NORMAL"],
      readCapability: true,
      writeCapability: false,
      costModel: "SUBSCRIPTION",
      licenseStatus: "UNKNOWN",
      allowedAgents: ["strategy-agent", "product-agent", "communication-agent"],
      fallbackToolIds: ["chatgpt-work"],
      notes: [...BASE_SAFETY_NOTES, "Keine Zugangsdaten im Register; Nutzung außerhalb der Zentrale."],
    }),
    createTool({
      toolId: "chatgpt-work",
      displayName: "ChatGPT Work",
      category: "KI-Modelle",
      provider: "OpenAI",
      capabilities: ["Text", "Team-Arbeitsbereich"],
      allowedDataClassifications: ["NORMAL", "SENSITIVE"],
      readCapability: true,
      costModel: "SUBSCRIPTION",
      fallbackToolIds: ["chatgpt"],
    }),
    createTool({
      toolId: "codex",
      displayName: "Codex",
      category: "Code-Executor",
      provider: "OpenAI (lokale CLI)",
      executionMode: "DIRECT",
      capabilities: ["isolierte Code-Ausführung gegen Fixture-Repository"],
      allowedDataClassifications: ["NORMAL"],
      readCapability: true,
      writeCapability: true,
      externalTransferRequired: false,
      publicationCapability: false,
      costModel: "UNKNOWN",
      requiredApproval: "JAMAL_PER_ATTEMPT",
      allowedAgents: ["api-agent", "integration-agent"],
      fallbackToolIds: ["cursor"],
      notes: [
        ...BASE_SAFETY_NOTES,
        "Live-Verfügbarkeit/Autorisierung wird von execution-executor-registry.js gespiegelt (Plugin-Gateway).",
        "Ausschließlich gegen das Execution-Bridge-Fixture-Repository; Health hart blockiert.",
      ],
    }),
    createTool({
      toolId: "cursor",
      displayName: "Cursor",
      category: "Code-Executor",
      provider: "Anysphere",
      connectionStatus: "MANUAL_ONLY",
      executionMode: "RECOMMENDATION_ONLY",
      capabilities: ["IDE-gestützte Entwicklung außerhalb der Zentrale"],
      readCapability: true,
      writeCapability: true,
      externalTransferRequired: false,
      allowedAgents: ["api-agent"],
      fallbackToolIds: ["codex"],
      notes: [...BASE_SAFETY_NOTES, "Wird von Jamal direkt bedient, nicht von der Zentrale gestartet."],
    }),
    createTool({
      toolId: "github",
      displayName: "GitHub",
      category: "Code-Executor",
      provider: "GitHub",
      connectionStatus: "MANUAL_ONLY",
      executionMode: "CONTROLLED_HANDOFF",
      capabilities: ["lokaler Git-Status (read-only)"],
      readCapability: true,
      writeCapability: false,
      externalTransferRequired: true,
      allowedAgents: ["api-agent", "integration-agent"],
      notes: [
        ...BASE_SAFETY_NOTES,
        "Es existiert keine authentifizierte GitHub-API-Verbindung; gespiegelt wird ausschließlich der lokale, read-only Git-Stand der Zentrale.",
      ],
    }),
    createTool({
      toolId: "airtable",
      displayName: "Airtable",
      category: "Daten/CRM",
      provider: "Airtable",
      executionMode: "CONTROLLED_HANDOFF",
      capabilities: ["read-only Datenabfrage (bei vollständigen lokalen Zugangsdaten)"],
      allowedDataClassifications: ["NORMAL"],
      readCapability: true,
      writeCapability: false,
      externalTransferRequired: true,
      costModel: "SUBSCRIPTION",
      allowedAgents: ["integration-agent", "data-structure-agent"],
      notes: [
        ...BASE_SAFETY_NOTES,
        "Verbindungsstatus wird ausschließlich über die Anwesenheit lokaler .env.local-Zugangsdaten gespiegelt, niemals über gespeicherte Tokens im Register.",
      ],
    }),
    createTool({
      toolId: "vercel",
      displayName: "Vercel",
      category: "Website/Deployment",
      provider: "Vercel",
      executionMode: "CONTROLLED_HANDOFF",
      capabilities: ["Deployment-Preflight (geplant)"],
      readCapability: false,
      writeCapability: false,
      publicationCapability: true,
      externalTransferRequired: true,
      costModel: "SUBSCRIPTION",
      allowedAgents: ["api-agent", "operations-agent"],
      notes: [
        ...BASE_SAFETY_NOTES,
        "Kein bestehender Vercel-Preflight vor Phase A gefunden; Status ist ehrlich UNKNOWN/NOT_CONNECTED, kein Deployment möglich.",
      ],
    }),
    createTool({
      toolId: "canva",
      displayName: "Canva",
      category: "Design",
      provider: "Canva",
      capabilities: ["Design-/Präsentationserstellung (geplant)"],
      allowedDataClassifications: ["NORMAL"],
      writeCapability: false,
      publicationCapability: true,
      costModel: "SUBSCRIPTION",
      allowedAgents: ["ui-agent"],
      fallbackToolIds: ["figma"],
      notes: [...BASE_SAFETY_NOTES, "Kein autonomer Canva-Produktivlauf in Phase A."],
    }),
    createTool({
      toolId: "heygen",
      displayName: "HeyGen",
      category: "Avatar",
      provider: "HeyGen",
      // V7.1 Phase B – additiv erweitertes, sachliches Capability-Profil
      // (Auftrag Abschnitt C). Ausführliche Details (unterstützt/vorgesehen,
      // ausdrücklich nicht im ersten Pilot, Pilotumfang) liegen zusätzlich
      // strukturiert in heygen-job-package.js#HEYGEN_CAPABILITY_PROFILE –
      // dieses Feld bleibt bewusst kurz für das allgemeine Werkzeugregister.
      capabilities: [
        "Avatarvideo aus bestehendem Avatar",
        "Video aus Bild",
        "Text-to-Speech-Avatarvideo",
        "Untertitel",
        "Lip-Sync (nur vorgemerkt, kein erster Pilot)",
        "Videoübersetzung (nur vorgemerkt, kein erster Pilot)",
      ],
      allowedDataClassifications: ["NORMAL"],
      publicationCapability: true,
      costModel: "USAGE_BASED",
      allowedAgents: [],
      // connectionStatus/executionMode bleiben bewusst auf der Phase-A-
      // Basiswahrheit (NOT_CONNECTED/RECOMMENDATION_ONLY): Es fand noch
      // keine tatsächliche, authentifizierte HeyGen-Verbindungserkennung
      // statt (Auftrag Abschnitt K: Hochstufung "erst ... wenn ... nach
      // erfolgreicher Verbindungserkennung"). Der additive, technisch
      // getestete CONTROLLED_HANDOFF-Pilotpfad wird ausschließlich separat
      // über heygen-connector.js#buildHeygenPilotStatus() ausgewiesen, ohne
      // diese Basiswahrheit zu verändern (keine zweite, widersprüchliche
      // Quelle).
      notes: [
        ...BASE_SAFETY_NOTES,
        "Kein autonomer HeyGen-Renderlauf in Phase A oder Phase B.",
        "Phase B: additiver, getesteter CONTROLLED_CONNECTOR_HANDOFF-Pilotpfad vorbereitet (heygen-job-package.js/heygen-connector.js/heygen-job-result.js); keine echte HeyGen-Anfrage, kein API-Key gespeichert.",
        "Erster Pilot ausschließlich AVATAR_VIDEO mit öffentlichem Avatar, NORMAL-Daten, ohne Veröffentlichung; echter Renderlauf erfordert separate Jamal-Freigabe.",
      ],
    }),
    createTool({
      toolId: "bildgenerierung",
      displayName: "Bildgenerierung (allgemein)",
      category: "Bild",
      provider: "UNGEKLÄRT",
      capabilities: ["Bildgenerierung (geplant)"],
      publicationCapability: false,
      costModel: "USAGE_BASED",
      allowedAgents: ["ui-agent"],
    }),
    createTool({
      toolId: "video-rendering-generisch",
      displayName: "Video-Bearbeitung (allgemein)",
      category: "Video",
      provider: "UNGEKLÄRT",
      capabilities: ["Videoschnitt/-export (geplant)"],
      publicationCapability: true,
      notes: [...BASE_SAFETY_NOTES, "Platzhaltereintrag; kein konkretes Werkzeug in Phase A ausgewählt."],
    }),
    createTool({
      toolId: "praesentationswerkzeug-generisch",
      displayName: "Präsentationswerkzeug (allgemein)",
      category: "Präsentation",
      provider: "UNGEKLÄRT",
      capabilities: ["Foliensatz-Erstellung (geplant)"],
      fallbackToolIds: ["canva"],
      notes: [...BASE_SAFETY_NOTES, "Platzhaltereintrag; z. B. Canva/Google Workspace könnten diese Fähigkeit später übernehmen."],
    }),
    createTool({
      toolId: "shopify",
      displayName: "Shopify",
      category: "Commerce",
      provider: "Shopify",
      capabilities: ["Produktanlage/Shop-Betrieb (geplant)"],
      writeCapability: false,
      publicationCapability: true,
      costModel: "SUBSCRIPTION",
      allowedAgents: [],
      notes: [...BASE_SAFETY_NOTES, "Kein autonomer Shopify-Produktivlauf in Phase A."],
    }),
    createTool({
      toolId: "figma",
      displayName: "Figma",
      category: "Design",
      provider: "Figma",
      capabilities: ["UI-/UX-Design (geplant)"],
      allowedAgents: ["ui-agent"],
      fallbackToolIds: ["canva"],
    }),
    createTool({
      toolId: "webflow",
      displayName: "Webflow",
      category: "Website/Deployment",
      provider: "Webflow",
      capabilities: ["Website-Aufbau (geplant)"],
      publicationCapability: true,
      allowedAgents: ["ui-agent"],
      fallbackToolIds: ["vercel"],
    }),
    createTool({
      toolId: "google-workspace",
      displayName: "Google Workspace",
      category: "Dokumente",
      provider: "Google",
      capabilities: ["Dokumente/Tabellen/Drive (geplant)"],
      allowedDataClassifications: ["NORMAL", "SENSITIVE"],
      readCapability: false,
      writeCapability: false,
      costModel: "SUBSCRIPTION",
      allowedAgents: ["documentation-agent"],
      fallbackToolIds: ["notion"],
    }),
    createTool({
      toolId: "slack",
      displayName: "Slack",
      category: "Kommunikation",
      provider: "Slack",
      capabilities: ["Team-Kommunikation (geplant)"],
      allowedAgents: ["communication-agent"],
    }),
    createTool({
      toolId: "notion",
      displayName: "Notion",
      category: "Dokumente",
      provider: "Notion",
      capabilities: ["Wissensdokumentation (geplant)"],
      allowedDataClassifications: ["NORMAL", "SENSITIVE"],
      allowedAgents: ["documentation-agent"],
      fallbackToolIds: ["google-workspace"],
    }),
    createTool({
      toolId: "n8n",
      displayName: "n8n",
      category: "Automatisierung",
      provider: "n8n (selbstgehostet oder Cloud)",
      capabilities: ["Workflow-Automatisierung (geplant)"],
      writeCapability: false,
      allowedAgents: ["integration-agent", "workflow-agent"],
      fallbackToolIds: ["make"],
    }),
    createTool({
      toolId: "make",
      displayName: "Make",
      category: "Automatisierung",
      provider: "Make (Celonis)",
      capabilities: ["Workflow-Automatisierung (geplant)"],
      allowedAgents: ["integration-agent", "workflow-agent"],
      fallbackToolIds: ["n8n"],
    }),
    createTool({
      toolId: "hubspot",
      displayName: "HubSpot",
      category: "Daten/CRM",
      provider: "HubSpot",
      capabilities: ["CRM/Vertriebsdaten (geplant)"],
      allowedDataClassifications: ["NORMAL", "SENSITIVE"],
      allowedAgents: ["customer-value-agent"],
      fallbackToolIds: ["airtable"],
    }),
    createTool({
      toolId: "lexoffice",
      displayName: "Lexoffice/Lexware",
      category: "Daten/CRM",
      provider: "Lexware",
      capabilities: ["Buchhaltung/Rechnungsstellung (geplant)"],
      allowedDataClassifications: ["SENSITIVE"],
      publicationCapability: false,
      allowedAgents: [],
      notes: [...BASE_SAFETY_NOTES, "Finanz-/Buchhaltungsbezug; keine automatische Buchung oder Zahlung in Phase A."],
    }),
    createTool({
      toolId: "recherche-werkzeug-generisch",
      displayName: "Recherche-Werkzeug (allgemein)",
      category: "Recherche",
      provider: "UNGEKLÄRT",
      capabilities: ["Websuche/Recherche (geplant)"],
      allowedAgents: ["strategy-agent"],
      notes: [...BASE_SAFETY_NOTES, "Platzhaltereintrag ohne konkrete technische Anbindung."],
    }),
  ].map((tool) => Object.freeze(tool)),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listTools(filter = {}) {
  let tools = TOOL_REGISTRY;
  if (filter.category) {
    tools = tools.filter((tool) => tool.category === filter.category);
  }
  return tools.map(clone);
}

function getToolById(toolId) {
  const tool = TOOL_REGISTRY.find((entry) => entry.toolId === toolId);
  return tool ? clone(tool) : null;
}

function isDataClassificationAllowedForTool(toolId, classification) {
  const tool = getToolById(toolId);
  if (!tool) return false;
  return tool.allowedDataClassifications.includes(classification);
}

function buildToolsResponse() {
  return {
    version: "V7.1-Phase-A",
    registrySource: "tool-registry.js",
    toolCount: TOOL_REGISTRY.length,
    categories: TOOL_CATEGORIES,
    tools: listTools(),
    licenseNotice:
      "Ein vorgemerktes Werkzeug bedeutet keine technische Verbindung. Eine Lizenz wird niemals automatisch als CONNECTED interpretiert.",
    credentialNotice: "Keine API-Keys, Tokens oder Zugangsdaten in diesem Register.",
    writeOperationsBlocked: true,
    madeExternalRequest: false,
  };
}

module.exports = {
  TOOL_CATEGORIES,
  AVAILABILITY_STATUSES,
  CONNECTION_STATUSES,
  EXECUTION_MODES,
  DATA_CLASSIFICATIONS,
  COST_MODELS,
  LICENSE_STATUSES,
  TOOL_REGISTRY,
  listTools,
  getToolById,
  isDataClassificationAllowedForTool,
  buildToolsResponse,
};
