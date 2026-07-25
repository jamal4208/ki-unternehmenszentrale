"use strict";

// V7.1 Phase A – kanonisches Plugin-Gateway-Grundmodell + Tool-Routing.
//
// Kein offenes Universal-Plugin-System. Ein kleines, kontrolliertes Gateway,
// das ausschließlich bestehende, bereits vorhandene read-only Statusquellen
// spiegelt (Codex-Executor, lokaler Git-Stand als "GitHub"-Referenz, lokale
// Airtable-Zugangsdaten-Anwesenheit) und für Canva/HeyGen/Shopify/Vercel
// ehrlich nur eine Vormerkung ohne technische Verbindung ausweist. Es werden
// hier keine neuen Netzwerkaufrufe eingeführt: Airtable wird ausschließlich
// auf Zugangsdaten-Anwesenheit geprüft (kein automatischer API-Call bei jedem
// Statusabruf), GitHub wird ausschließlich als lokaler, read-only Git-Stand
// dieses Repositories gespiegelt (keine authentifizierte GitHub-API-Anbindung
// existiert vor Phase A).
//
// Abgrenzung zur bestehenden PRODUCTIVE_PLUGIN_REGISTRY (server.js, V6.34.2):
// jene ist eine eigenständige, V7.0-eingefrorene UI-Textsammlung
// (readOnlyAllowedActions/blockedActions/safetyBoundary als Erzählkarten) für
// den älteren Cockpit-"Plugin-Leitstand" bzw. die Content-Design-Plugin-Task-
// Flows. Sie kennt keinen technischen Verbindungs-, Ausführungs- oder
// Datenklassifizierungsstatus und wird von diesem Modul nicht gelesen,
// verändert oder dupliziert. Kanonisch für V7.1 gilt ausschließlich:
// Werkzeugidentität/-fähigkeiten -> tool-registry.js; Live-/Adapterzustand
// und Tool-Routing -> dieses Modul (plugin-gateway.js). Siehe
// v71-integration.test.js für einen Bestandsschutztest, der beide Quellen
// auf Widerspruchsfreiheit prüft, ohne sie zusammenzuführen.

const path = require("path");
const { execFileSync } = require("child_process");

const toolRegistry = require("./tool-registry");
const executionExecutorRegistry = require("./execution-executor-registry");

const PLUGIN_STATUSES = Object.freeze(["REGISTERED", "AVAILABLE", "DEGRADED", "UNAVAILABLE", "BLOCKED"]);
const ADAPTER_TYPES = Object.freeze([
  "DIRECT_CONNECTOR",
  "LOCAL_CLI",
  "CONTROLLED_EXPORT",
  "MANUAL_HANDOFF",
  "RECOMMENDATION_ONLY",
]);
const EXECUTION_MODE_RANK = Object.freeze({ DIRECT: 3, CONTROLLED_HANDOFF: 2, RECOMMENDATION_ONLY: 1 });
const CONNECTION_STATUS_RANK = Object.freeze({
  CONNECTED: 4,
  PARTIALLY_CONNECTED: 3,
  MANUAL_ONLY: 2,
  NOT_CONNECTED: 1,
});

const HEALTH_PROJECT_ID = executionExecutorRegistry.HEALTH_PROJECT_ID;
const GIT_STATUS_TIMEOUT_MS = 4000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Live-Spiegelung bestehender, read-only Statusquellen. Keine dieser
// Funktionen schreibt irgendetwas oder löst eine externe/kostenpflichtige
// Aktion aus.
// ---------------------------------------------------------------------------

function checkCodexPluginStatus(options = {}) {
  const availability = executionExecutorRegistry
    .describeExecutorsForClient(options)
    .find((entry) => entry.id === "codex");
  if (!availability) {
    return { status: "UNAVAILABLE", healthStatus: "Codex-Executor-Deskriptor nicht gefunden.", lastCheckedAt: new Date().toISOString() };
  }
  return {
    status: availability.available ? "AVAILABLE" : "UNAVAILABLE",
    healthStatus: availability.available
      ? `Codex CLI lokal erreichbar${availability.version ? ` (${availability.version})` : ""}.`
      : `Codex CLI nicht verfügbar: ${availability.unavailableReason || "UNGEKLÄRT"}.`,
    lastCheckedAt: new Date().toISOString(),
  };
}

function checkGithubPluginStatus(options = {}) {
  const exec = options.execFileSyncImpl || execFileSync;
  const cwd = options.repoDir || path.resolve(__dirname);
  try {
    const branchOut = exec("git", ["status", "--short", "--branch"], {
      cwd,
      timeout: options.timeoutMs || GIT_STATUS_TIMEOUT_MS,
      maxBuffer: 8 * 1024,
      encoding: "utf8",
      shell: false,
      env: { PATH: process.env.PATH || "", LANG: "C" },
    });
    const firstLine = String(branchOut || "").split("\n")[0] || "";
    return {
      status: "AVAILABLE",
      healthStatus: `Lokaler, read-only Git-Stand gespiegelt: ${firstLine.replace(/^## /, "") || "unbekannter Branch"}.`,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (_error) {
    return {
      status: "UNAVAILABLE",
      healthStatus: "Lokaler Git-Stand konnte nicht read-only gelesen werden.",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

function checkAirtablePluginStatus(options = {}) {
  const env = options.env || process.env;
  const hasToken = Boolean(env.AIRTABLE_API_KEY || env.AIRTABLE_API_TOKEN || env.AIRTABLE_PAT);
  const hasBaseId = Boolean(env.AIRTABLE_BASE_ID);
  const hasTable = Boolean(env.AIRTABLE_TABLE_ID || env.AIRTABLE_TABLE_NAME || env.AIRTABLE_TABLE_PROJECTS);
  const credentialsPresent = hasToken && hasBaseId && hasTable;
  return {
    status: credentialsPresent ? "AVAILABLE" : "REGISTERED",
    healthStatus: credentialsPresent
      ? "Lokale Zugangsdaten vorhanden (ungeprüft, kein automatischer API-Aufruf). Gilt nicht automatisch als verbunden."
      : "Keine vollständigen lokalen Zugangsdaten gefunden (Credential vorhanden: nein).",
    credentialPresent: credentialsPresent,
    lastCheckedAt: new Date().toISOString(),
  };
}

const LIVE_CHECKS = Object.freeze({
  codex: checkCodexPluginStatus,
  github: checkGithubPluginStatus,
  airtable: checkAirtablePluginStatus,
});

// ---------------------------------------------------------------------------
// Kanonische Plugin-Definitionen. Ein Eintrag bedeutet ausdrücklich keine
// technische Verbindung, solange status nicht AVAILABLE ist.
// ---------------------------------------------------------------------------

const PLUGIN_DEFINITIONS = Object.freeze([
  Object.freeze({
    pluginId: "plugin-codex",
    toolId: "codex",
    adapterType: "LOCAL_CLI",
    liveCheckKey: "codex",
    staticStatus: null,
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-github",
    toolId: "github",
    adapterType: "LOCAL_CLI",
    liveCheckKey: "github",
    staticStatus: null,
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-airtable",
    toolId: "airtable",
    adapterType: "DIRECT_CONNECTOR",
    liveCheckKey: "airtable",
    staticStatus: null,
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-vercel",
    toolId: "vercel",
    adapterType: "CONTROLLED_EXPORT",
    liveCheckKey: null,
    staticStatus: "UNAVAILABLE",
    staticHealthStatus: "Kein bestehender Vercel-Preflight-Status vor Phase A gefunden; ehrlich als nicht verbunden ausgewiesen.",
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-canva",
    toolId: "canva",
    adapterType: "RECOMMENDATION_ONLY",
    liveCheckKey: null,
    staticStatus: "REGISTERED",
    staticHealthStatus: "Nur vorgemerkt. Keine technische Verbindung, kein produktiver Lauf in Phase A.",
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-heygen",
    toolId: "heygen",
    adapterType: "RECOMMENDATION_ONLY",
    liveCheckKey: null,
    staticStatus: "REGISTERED",
    staticHealthStatus: "Nur vorgemerkt. Keine technische Verbindung, kein produktiver Lauf in Phase A.",
    fallbackMode: "MANUAL_HANDOFF",
  }),
  Object.freeze({
    pluginId: "plugin-shopify",
    toolId: "shopify",
    adapterType: "RECOMMENDATION_ONLY",
    liveCheckKey: null,
    staticStatus: "REGISTERED",
    staticHealthStatus: "Nur vorgemerkt. Keine technische Verbindung, kein produktiver Lauf in Phase A.",
    fallbackMode: "MANUAL_HANDOFF",
  }),
]);

function deriveDataClassificationLimit(tool) {
  if (!tool) return "NORMAL";
  if (tool.allowedDataClassifications.includes("SENSITIVE")) return "SENSITIVE";
  return "NORMAL";
}

function buildPluginStatus(definition, options = {}) {
  const tool = toolRegistry.getToolById(definition.toolId);
  let live = { status: definition.staticStatus || "REGISTERED", healthStatus: definition.staticHealthStatus || "Kein Live-Check in Phase A.", lastCheckedAt: new Date().toISOString() };
  if (definition.liveCheckKey && LIVE_CHECKS[definition.liveCheckKey]) {
    live = LIVE_CHECKS[definition.liveCheckKey](options);
  }
  const forcedHealthBlock = options.projectId === HEALTH_PROJECT_ID && definition.toolId === "codex";
  const status = forcedHealthBlock ? "BLOCKED" : live.status;
  return {
    pluginId: definition.pluginId,
    toolId: definition.toolId,
    adapterType: definition.adapterType,
    status,
    capabilities: tool ? tool.capabilities : [],
    allowedActions: tool
      ? tool.executionMode === "DIRECT"
        ? ["ausführen (isoliert, nach Freigabe)", "empfehlen", "übergeben"]
        : tool.executionMode === "CONTROLLED_HANDOFF"
          ? ["übergeben", "empfehlen"]
          : ["empfehlen"]
      : ["empfehlen"],
    dataClassificationLimit: deriveDataClassificationLimit(tool),
    readOnly: tool ? !tool.writeCapability : true,
    externalWrite: tool ? tool.externalTransferRequired && tool.writeCapability : false,
    publication: tool ? tool.publicationCapability : false,
    costBearing: tool ? tool.costModel !== "FREE" : false,
    healthStatus: forcedHealthBlock
      ? "Health-Hardblock: Codex ist für das Health-Projekt technisch gesperrt (siehe execution-executor-registry.js)."
      : live.healthStatus,
    lastCheckedAt: live.lastCheckedAt,
    requiredApproval: tool ? tool.requiredApproval : "JAMAL",
    fallbackMode: definition.fallbackMode,
  };
}

function listPluginStatuses(options = {}) {
  return PLUGIN_DEFINITIONS.map((definition) => buildPluginStatus(definition, options));
}

function getPluginStatusById(pluginId, options = {}) {
  const definition = PLUGIN_DEFINITIONS.find((entry) => entry.pluginId === pluginId);
  if (!definition) return null;
  return buildPluginStatus(definition, options);
}

function getPluginStatusForTool(toolId, options = {}) {
  const definition = PLUGIN_DEFINITIONS.find((entry) => entry.toolId === toolId);
  if (!definition) return null;
  return buildPluginStatus(definition, options);
}

function buildPluginGatewayResponse(options = {}) {
  return {
    version: "V7.1-Phase-A",
    registrySource: "plugin-gateway.js",
    pluginCount: PLUGIN_DEFINITIONS.length,
    plugins: listPluginStatuses(options),
    noAutonomousExecution: true,
    noExternalWriteFromGateway: true,
    noPublicationFromGateway: true,
  };
}

// ---------------------------------------------------------------------------
// Tool-Routing – deterministisch, erklärbar, ohne Sprachmodell-Entscheidung.
// ---------------------------------------------------------------------------

// Festes, auditierbares Schlüsselwortregister zur Normalisierung natürlicher
// Aufgabenbeschreibungen (z. B. "Social-Media-Video für ein Café erstellen")
// auf kanonische Fähigkeits-Schlagworte, die auch in tool-registry.js
// vorkommen. Kein Sprachmodell, keine Ähnlichkeits-/Fuzzy-Bewertung:
// ausschließlich feste Substring-Treffer gegen diese explizite Liste. Ein
// Treffer erweitert lediglich die Prüfmenge additiv (siehe capabilityMatches)
// und erfindet nie ein Werkzeug – ohne Treffer gilt weiterhin die bisherige
// direkte Substring-Prüfung unverändert.
const CAPABILITY_KEYWORD_MAP = Object.freeze({
  video: ["video", "clip", "reel", "imagefilm", "werbefilm", "videoschnitt", "social-media-video", "social media video"],
  avatar: ["avatar", "heygen", "sprechervideo", "sprecher-video"],
  bild: ["bild", "foto", "grafik", "image", "bildgenerierung"],
  design: ["design", "layout", "logo"],
  praesentation: ["präsentation", "praesentation", "folien", "pitch deck", "pitchdeck", "foliensatz"],
  text: ["text", "artikel", "blogpost", "beitrag", "entwurf"],
  code: ["code", "programmier", "skript", "script"],
  shop: ["shop", "produktanlage", "produktseite", "commerce"],
  website: ["website", "webseite"],
  crm: ["crm", "vertriebsdat"],
  kommunikation: ["kommunikation", "team-chat", "teamchat"],
  wissen: ["wissensdokumentation", "wissensdatenbank"],
  automatisierung: ["automatisierung", "workflow"],
  buchhaltung: ["buchhaltung", "rechnungsstellung"],
  recherche: ["recherche", "websuche"],
});

function extractCapabilityKeywords(lowerText) {
  const matched = new Set();
  Object.entries(CAPABILITY_KEYWORD_MAP).forEach(([canonical, triggers]) => {
    if (triggers.some((trigger) => lowerText.includes(trigger))) {
      matched.add(canonical);
    }
  });
  return matched;
}

function capabilityMatches(toolCapabilities, requiredCapabilities) {
  if (!requiredCapabilities || requiredCapabilities.length === 0) return true;
  const haystack = toolCapabilities.map((c) => c.toLowerCase());
  const toolKeywordSets = haystack.map((cap) => extractCapabilityKeywords(cap));
  return requiredCapabilities.some((needed) => {
    const neededLower = String(needed).toLowerCase();
    const directMatch = haystack.some((cap) => cap.includes(neededLower) || neededLower.includes(cap));
    if (directMatch) return true;
    const neededKeywords = extractCapabilityKeywords(neededLower);
    if (neededKeywords.size === 0) return false;
    return toolKeywordSets.some((keywordSet) => [...neededKeywords].some((keyword) => keywordSet.has(keyword)));
  });
}

function capExecutionMode(mode, cap) {
  if (EXECUTION_MODE_RANK[cap] < EXECUTION_MODE_RANK[mode]) return cap;
  return mode;
}

// Reasons produced by the elimination filters below that describe a tool
// which is fachlich geeignet (capability + Datenklassifizierung passen),
// aber wegen einer fehlenden Freigabe oder eines harten Sicherheitsblocks
// nicht ausführbar ist. Diese Menge grenzt sich bewusst von "Fähigkeit
// nicht gefunden" und "Datenklassifizierung ... nicht erlaubt" ab: nur für
// diese Fälle darf eine strukturierte, nicht ausführbare Kandidatenauskunft
// gebaut werden – niemals eine Empfehlung.
const BLOCKED_BUT_ELIGIBLE_REASONS = new Set(["externe Übertragung nicht erlaubt", "Health-Hardblock"]);

// Baut aus einem fachlich geeigneten, aber blockierten Werkzeug eine
// ehrliche, nicht ausführbare Kandidatenauskunft. Es wird hier nichts
// gestartet, nichts übertragen, nichts veröffentlicht und keine
// Kostenfreigabe simuliert – ausschließlich Anzeige bereits bekannter,
// bestehender Registerdaten.
function buildBlockedCandidateInfo(tool, reasonCode, ctx) {
  const missingApprovals = [];
  if (tool.externalTransferRequired && !ctx.externalTransferAllowed) {
    missingApprovals.push("externe Übertragung erlaubt");
  }
  if (tool.publicationCapability && !ctx.publicationAllowed) {
    missingApprovals.push("Veröffentlichung erlaubt");
  }
  if (reasonCode === "Health-Hardblock") {
    missingApprovals.push("Health-Hardblock (kann nicht durch Jamal-Freigabe aufgehoben werden)");
  }

  let costStatus = "UNKNOWN";
  if (tool.costModel === "FREE") {
    costStatus = "FREE";
  } else if (ctx.costCeiling !== null && Number.isFinite(tool.monthlyBudget)) {
    costStatus = tool.monthlyBudget <= ctx.costCeiling ? "WITHIN_BUDGET" : "OVER_BUDGET";
  } else if (ctx.costCeiling !== null && tool.estimatedUnitCost !== null && Number.isFinite(tool.estimatedUnitCost)) {
    costStatus = tool.estimatedUnitCost <= ctx.costCeiling ? "WITHIN_BUDGET" : "UNKNOWN";
  }

  return {
    toolId: tool.toolId,
    displayName: tool.displayName,
    category: tool.category,
    connectionStatus: tool.connectionStatus,
    blockReason: reasonCode,
    missingApprovals,
    dataClassificationBoundary: null,
    costStatus,
    fallback: tool.fallbackToolIds[0] || null,
  };
}

function recommendToolForTask(input = {}, options = {}) {
  const projectId = String(input.projectId || "").trim() || null;
  const requiredCapabilities = Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [];
  const dataClassification = ["NORMAL", "SENSITIVE", "SECRET"].includes(input.dataClassification)
    ? input.dataClassification
    : "NORMAL";
  const externalTransferAllowed = input.externalTransferAllowed === true;
  const publicationAllowed = input.publicationAllowed === true;
  const costCeiling = Number.isFinite(input.costCeiling) ? input.costCeiling : null;

  const reasoning = [];
  const eliminated = [];
  let candidates = toolRegistry.listTools();

  if (dataClassification === "SECRET") {
    reasoning.push("Datenklassifizierung SECRET: kein Werkzeug in Phase A ist für SECRET freigegeben.");
    candidates.forEach((tool) => eliminated.push({ toolId: tool.toolId, reason: "Datenklassifizierung SECRET nicht erlaubt" }));
    candidates = [];
  } else {
    const beforeCapability = candidates;
    candidates = candidates.filter((tool) => {
      const ok = capabilityMatches(tool.capabilities, requiredCapabilities);
      if (!ok) eliminated.push({ toolId: tool.toolId, reason: "Fähigkeit nicht gefunden" });
      return ok;
    });
    if (requiredCapabilities.length > 0) {
      reasoning.push(
        `${candidates.length} von ${beforeCapability.length} Werkzeugen passen zu den benötigten Fähigkeiten (${requiredCapabilities.join(", ")}).`,
      );
    }

    candidates = candidates.filter((tool) => {
      const ok = tool.allowedDataClassifications.includes(dataClassification);
      if (!ok) eliminated.push({ toolId: tool.toolId, reason: `Datenklassifizierung ${dataClassification} nicht erlaubt` });
      return ok;
    });
    reasoning.push(`Datenschutzgrenze: nur Werkzeuge zugelassen, die ${dataClassification} verarbeiten dürfen.`);

    candidates = candidates.filter((tool) => {
      const ok = !tool.externalTransferRequired || externalTransferAllowed;
      if (!ok) eliminated.push({ toolId: tool.toolId, reason: "externe Übertragung nicht erlaubt" });
      return ok;
    });

    if (projectId === HEALTH_PROJECT_ID) {
      const beforeHealth = candidates.length;
      candidates = candidates.filter((tool) => {
        if (tool.toolId === "codex" && !executionExecutorRegistry.isHealthAllowedForExecutor("codex")) {
          eliminated.push({ toolId: tool.toolId, reason: "Health-Hardblock" });
          return false;
        }
        return true;
      });
      if (candidates.length !== beforeHealth) {
        reasoning.push("Health-Hardblock aktiv: Codex ist für das Health-Projekt technisch gesperrt und wurde entfernt.");
      }
    }
  }

  const enriched = candidates.map((tool) => {
    const pluginStatus = getPluginStatusForTool(tool.toolId, { ...options, projectId });
    let effectiveExecutionMode = tool.executionMode;
    const pluginState = pluginStatus ? pluginStatus.status : "REGISTERED";
    if (pluginState === "BLOCKED") {
      effectiveExecutionMode = "RECOMMENDATION_ONLY";
    } else if (pluginState === "DEGRADED") {
      effectiveExecutionMode = capExecutionMode(effectiveExecutionMode, "CONTROLLED_HANDOFF");
    } else if (pluginState === "UNAVAILABLE" || pluginState === "REGISTERED") {
      effectiveExecutionMode = capExecutionMode(effectiveExecutionMode, "RECOMMENDATION_ONLY");
    }
    if (tool.publicationCapability && !publicationAllowed) {
      effectiveExecutionMode = capExecutionMode(effectiveExecutionMode, "CONTROLLED_HANDOFF");
    }
    let costStatus = "UNKNOWN";
    if (tool.costModel === "FREE") {
      costStatus = "FREE";
    } else if (costCeiling !== null && Number.isFinite(tool.monthlyBudget)) {
      costStatus = tool.monthlyBudget <= costCeiling ? "WITHIN_BUDGET" : "OVER_BUDGET";
    } else if (costCeiling !== null && tool.estimatedUnitCost !== null && Number.isFinite(tool.estimatedUnitCost)) {
      costStatus = tool.estimatedUnitCost <= costCeiling ? "WITHIN_BUDGET" : "UNKNOWN";
    }
    return { tool, pluginStatus, effectiveExecutionMode, costStatus };
  });

  enriched.sort((a, b) => {
    const rankDiff = EXECUTION_MODE_RANK[b.effectiveExecutionMode] - EXECUTION_MODE_RANK[a.effectiveExecutionMode];
    if (rankDiff !== 0) return rankDiff;
    const connDiff =
      (CONNECTION_STATUS_RANK[b.tool.connectionStatus] || 0) - (CONNECTION_STATUS_RANK[a.tool.connectionStatus] || 0);
    if (connDiff !== 0) return connDiff;
    return a.tool.toolId.localeCompare(b.tool.toolId);
  });

  if (enriched.length === 0) {
    // Fachlich geeignete, aber blockierte Kandidaten strukturiert anzeigen
    // (statt sie stillschweigend nur in "eliminated" zu vergraben). Es wird
    // weiterhin kein Werkzeug erfunden, empfohlen oder gestartet – lediglich
    // ehrlich gezeigt, was fachlich passen würde und welche Freigabe fehlt.
    const blockedCandidates = eliminated
      .filter((entry) => BLOCKED_BUT_ELIGIBLE_REASONS.has(entry.reason))
      .map((entry) => {
        const tool = toolRegistry.getToolById(entry.toolId);
        if (!tool) return null;
        const info = buildBlockedCandidateInfo(tool, entry.reason, { externalTransferAllowed, publicationAllowed, costCeiling });
        info.dataClassificationBoundary = dataClassification;
        return info;
      })
      .filter(Boolean);

    const bestBlockedCandidate = blockedCandidates[0] || null;
    const nextAllowedJamalStep = bestBlockedCandidate
      ? bestBlockedCandidate.missingApprovals.length > 0
        ? `Jamal müsste zunächst freigeben: ${bestBlockedCandidate.missingApprovals.join(" und ")}. Erst danach ist für ${bestBlockedCandidate.displayName} ein kontrolliertes Übergabepaket oder eine reine Empfehlung möglich – keine automatische Ausführung.`
        : `${bestBlockedCandidate.displayName} ist fachlich geeignet, aber technisch nicht verbunden (${bestBlockedCandidate.connectionStatus}). Keine automatische Ausführung.`
      : "Kein fachlich geeignetes Werkzeug vorgemerkt. Nächster zulässiger Schritt: Bedarf mit Jamal klären, ggf. ein neues Werkzeug im Werkzeug-/Lizenzregister vormerken. Keine automatische Ausführung.";

    return {
      ok: false,
      status: "BLOCKED",
      projectId,
      reasoning: [...reasoning, "Kein Werkzeug erfüllt die Anforderungen. Es wird keine Empfehlung erfunden."],
      eliminated,
      dataClassificationBoundary: dataClassification,
      costStatus: bestBlockedCandidate ? bestBlockedCandidate.costStatus : "UNKNOWN",
      requiredJamalApproval: true,
      noAutomaticExecution: true,
      blockedCandidate: bestBlockedCandidate,
      blockedAlternatives: blockedCandidates.slice(1, 3),
      fallback: bestBlockedCandidate ? bestBlockedCandidate.fallback : null,
      nextAllowedJamalStep,
    };
  }

  const top = enriched[0];
  const alternatives = enriched.slice(1, 3).map((entry) => ({
    toolId: entry.tool.toolId,
    displayName: entry.tool.displayName,
    executionMode: entry.effectiveExecutionMode,
  }));

  reasoning.push(
    `Empfehlung: ${top.tool.displayName} (${top.effectiveExecutionMode}), da es die verbleibenden Kriterien am besten erfüllt (Ausführungsmodus- und Verbindungsrang).`,
  );
  if (top.effectiveExecutionMode !== top.tool.executionMode) {
    reasoning.push(
      `Ausführungsmodus wurde von ${top.tool.executionMode} auf ${top.effectiveExecutionMode} herabgestuft (Plugin-Status oder Veröffentlichungsgrenze).`,
    );
  }

  const requiresApproval =
    top.effectiveExecutionMode !== "RECOMMENDATION_ONLY" ||
    top.tool.publicationCapability ||
    top.tool.externalTransferRequired ||
    top.tool.costModel !== "FREE";

  return {
    ok: true,
    status: "OK",
    projectId,
    recommendedTool: {
      toolId: top.tool.toolId,
      displayName: top.tool.displayName,
      category: top.tool.category,
      executionMode: top.effectiveExecutionMode,
    },
    reasoning,
    alternatives,
    costStatus: top.costStatus,
    dataClassificationBoundary: dataClassification,
    requiredJamalApproval: requiresApproval,
    approvalReason: requiresApproval
      ? "Externe Übertragung, kostenpflichtige Nutzung und Veröffentlichung bleiben getrennte Jamal-Freigaben."
      : null,
    fallback: top.tool.fallbackToolIds[0] || null,
    noAutomaticExecution: true,
  };
}

module.exports = {
  PLUGIN_STATUSES,
  ADAPTER_TYPES,
  PLUGIN_DEFINITIONS,
  HEALTH_PROJECT_ID,
  checkCodexPluginStatus,
  checkGithubPluginStatus,
  checkAirtablePluginStatus,
  listPluginStatuses,
  getPluginStatusById,
  getPluginStatusForTool,
  buildPluginGatewayResponse,
  recommendToolForTask,
};
