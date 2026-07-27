"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt C).
//
// Reines, deterministisches Ableitungsmodul OHNE eigene Persistenz und
// OHNE better-sqlite3-Import (gleiches Prinzip wie agent-runtime.js
// gegenüber agent-registry.js). Die Organisationssicht ist vollständig aus
// dem bereits bestehenden, eingefrorenen agent-registry.js abgeleitet –
// KEINE zweite Agentenliste, KEIN Erfinden/Löschen/Ändern einer
// Agenten-ID (Auftrag Leitprinzipien).
//
// Warum keine eigene Tabelle: siehe auth-db-migrations.js#Migration-14-
// Kopfkommentar. Jeder Aufruf von buildOrganizationOverview() berechnet die
// Sicht frisch aus agent-registry.js (+ optional tool-registry.js für die
// Werkzeugfähigkeit) – es gibt nichts, was hier veralten könnte.
//
// Die Zuordnung zu den zehn Zielstrukturen (Auftrag Abschnitt C) sowie
// Führungsebene/Berichtslinie/Regelkontakte/Qualitätsverantwortung sind
// bewusst als kleine, kommentierte Regeltabelle (AGENT_ORGANIZATION_RULES)
// unten dokumentiert – jede Zeile referenziert die bereits bestehende
// role-/category-Beschreibung aus agent-registry.js als Begründung, statt
// eine neue, unbegründete Aussage zu erfinden.

const agentRegistry = require("./agent-registry");
const companyPrinciples = require("./company-principles");

let toolRegistry = null;
try {
  toolRegistry = require("./tool-registry");
} catch (_error) {
  toolRegistry = null;
}

// ---------------------------------------------------------------------------
// Zielstruktur (Auftrag Abschnitt C) – exakt zehn Bereiche, jeder Agent wird
// unten genau einem davon primär zugeordnet.
// ---------------------------------------------------------------------------
const ORGANIZATION_GROUPS = Object.freeze([
  "Unternehmensführung",
  "Projekt- und Portfoliosteuerung",
  "Marketing und Kommunikation",
  "Design und Medien",
  "Vertrieb und Kunden",
  "Office und Verwaltung",
  "Einkauf und Recherche",
  "Finance und Controlling",
  "Produkt und Technologie",
  "Qualität, Sicherheit und HR",
]);

const LEADERSHIP_LEVELS = Object.freeze(["FÜHRUNG", "KOORDINATION", "FACHAUSFÜHRUNG"]);

// orchestrator-agent ist laut ROLE_NAME_MAPPING ("Projektmanager-Agent")
// bereits der bestehende zentrale Orchestrator (agent-runtime.js#
// PROJEKTMANAGER_ROLE_NAME) – hier lediglich fachlich gespiegelt, nicht neu
// erfunden.
const CENTRAL_ORCHESTRATOR_AGENT_ID = "orchestrator-agent";
const REPORTS_TO_JAMAL_DIRECTLY = Object.freeze(["strategy-agent", "decision-agent", CENTRAL_ORCHESTRATOR_AGENT_ID]);

// Jede Zeile begründet ihre Gruppen-/Ebenenzuordnung mit der bereits
// bestehenden agent.role-/agent.category-Beschreibung aus
// agent-registry.js – keine erfundene Zusatzaussage über die 25 Agenten.
const AGENT_ORGANIZATION_RULES = Object.freeze({
  "strategy-agent": {
    group: "Unternehmensführung",
    leadershipLevel: "FÜHRUNG",
    note: "role: \"Bewertet Ziel, Richtung und Priorität\" – Unternehmensführungsperspektive.",
  },
  "decision-agent": {
    group: "Unternehmensführung",
    leadershipLevel: "FÜHRUNG",
    note: "role: \"Formuliert Entscheidungsoptionen read-only\" – Führungsentscheidungsvorbereitung.",
  },
  "orchestrator-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "FÜHRUNG",
    note: "role: \"Koordiniert Agentenperspektiven read-only\"; ROLE_NAME_MAPPING = Projektmanager-Agent, zentraler Orchestrator.",
  },
  "project-status-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Verdichtet Ist-Stand und Fortschritt\".",
  },
  "prioritization-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Sortiert Aufgaben nach Dringlichkeit und Nutzen\".",
  },
  "release-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Bewertet Finish- und Release-Reife\".",
  },
  "next-actions-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Leitet konkrete nächste Schritte ab\".",
  },
  "open-points-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Sammelt offene Klärungspunkte\".",
  },
  "closure-agent": {
    group: "Projekt- und Portfoliosteuerung",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Bewertet Abschluss- und Finish-Fähigkeit\".",
  },
  "communication-agent": {
    group: "Marketing und Kommunikation",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Formuliert Übergabe und Kommunikation\".",
  },
  "ui-agent": {
    group: "Design und Medien",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Prüft UI-Bezug und Darstellungsfolgen\".",
  },
  "customer-value-agent": {
    group: "Vertrieb und Kunden",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Bewertet Nutzen aus Kundensicht\".",
  },
  "documentation-agent": {
    group: "Office und Verwaltung",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Strukturiert Übergabe und Dokumentation\".",
  },
  "workflow-agent": {
    group: "Office und Verwaltung",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Bewertet Ablauf und Reihenfolge\".",
  },
  "operations-agent": {
    group: "Office und Verwaltung",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Bewertet Betriebs- und Nutzbarkeit\".",
  },
  "integration-agent": {
    group: "Einkauf und Recherche",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Bewertet Integrationsbezug ohne Ausführung\" – Werkzeug-/Tool-Bewertung ohne Beschaffung.",
  },
  "product-agent": {
    group: "Produkt und Technologie",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Ordnet Auftrag produktlogisch ein\".",
  },
  "api-agent": {
    group: "Produkt und Technologie",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Prüft API-Bezug und Antwortstruktur\".",
  },
  "data-structure-agent": {
    group: "Produkt und Technologie",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Prüft Daten- und Ergebnisstruktur\".",
  },
  "health-compass-agent": {
    group: "Produkt und Technologie",
    leadershipLevel: "KOORDINATION",
    note: "role: \"Ordnet Health-Upgrade-Kompass-Bezug ein\" – produktspezifische Einordnung.",
  },
  "security-agent": {
    group: "Qualität, Sicherheit und HR",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Bewertet Sicherheitsgrenzen und Risiken\".",
  },
  "quality-test-agent": {
    group: "Qualität, Sicherheit und HR",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Empfiehlt Prüf- und Testschritte\".",
  },
  "risk-agent": {
    group: "Qualität, Sicherheit und HR",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Identifiziert auftragsbezogene Risiken\".",
  },
  "error-analysis-agent": {
    group: "Qualität, Sicherheit und HR",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Analysiert Fehlerursachen read-only\".",
  },
  "review-agent": {
    group: "Qualität, Sicherheit und HR",
    leadershipLevel: "FACHAUSFÜHRUNG",
    note: "role: \"Führt read-only Qualitätsreview durch\".",
  },
});

// Finance und Controlling bleibt in V7.5 ehrlich ohne primär zugeordneten
// Agenten: keiner der 25 bestehenden agent-registry.js-Rollentexte
// beschreibt eine Budget-/Liquiditäts-/Controllingfunktion. Ein Agent wird
// nicht künstlich in eine unpassende Gruppe gezwungen, nur um jede
// Zielstruktur zu befüllen (siehe Abschlussbericht Abschnitt B/Frage 9).

function assertRuleTableMatchesRegistry() {
  const registryIds = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => agent.id);
  const ruleIds = Object.keys(AGENT_ORGANIZATION_RULES);
  const missing = registryIds.filter((id) => !ruleIds.includes(id));
  const extra = ruleIds.filter((id) => !registryIds.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `agent-organization-service: Regeltabelle weicht vom kanonischen Register ab (fehlend: ${missing.join(", ") || "keine"}; überzählig: ${extra.join(", ") || "keine"}).`,
    );
  }
}

assertRuleTableMatchesRegistry();

// Regelmäßige Zusammenarbeit: jede Fachagentengruppe arbeitet regelmäßig
// mit dem zentralen Orchestrator sowie mit den anderen Agenten derselben
// Zielstruktur zusammen (Auftrag Abschnitt C: "Querverbindungen dürfen
// zusätzlich bestehen"). Deterministisch aus der Gruppenzuordnung
// berechnet, keine zusätzliche Handpflege nötig.
function computeWorksRegularlyWith(agentId, group) {
  const peers = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.filter((agent) => {
    if (agent.id === agentId) return false;
    const rule = AGENT_ORGANIZATION_RULES[agent.id];
    return rule && rule.group === group;
  }).map((agent) => agent.id);
  if (agentId !== CENTRAL_ORCHESTRATOR_AGENT_ID) {
    peers.unshift(CENTRAL_ORCHESTRATOR_AGENT_ID);
  }
  return Array.from(new Set(peers));
}

function computeReportsTo(agentId) {
  if (REPORTS_TO_JAMAL_DIRECTLY.includes(agentId)) return "Jamal";
  return CENTRAL_ORCHESTRATOR_AGENT_ID;
}

// Qualitätsverantwortung: die fünf Qualitäts-/Sicherheits-/Risiko-/Fehler-/
// Review-Agenten tragen laut ihrer bestehenden role-Beschreibung bereits
// eine übergreifende Qualitätsverantwortung; jeder andere Agent trägt die
// Qualitätsverantwortung für sein eigenes Fachergebnis (kein Agent ohne
// jede Qualitätsverantwortung).
const CROSS_CUTTING_QUALITY_AGENT_IDS = Object.freeze([
  "security-agent",
  "quality-test-agent",
  "risk-agent",
  "error-analysis-agent",
  "review-agent",
]);

function computeQualityResponsibility(agentId, agent) {
  if (CROSS_CUTTING_QUALITY_AGENT_IDS.includes(agentId)) {
    return `Übergreifend: ${agent.role}`;
  }
  return `Eigenes Fachergebnis: ${agent.role}`;
}

// Plugin-/Werkzeugfähigkeit: ausschließlich aus dem bestehenden
// tool-registry.js#TOOL_REGISTRY abgeleitet (allowedAgents-Feld) – keine
// zweite Werkzeugliste, keine erfundene Fähigkeit. Fällt tool-registry.js
// aus irgendeinem Grund weg, liefert dies ehrlich eine leere Liste statt
// eines Fehlers (Organisationssicht bleibt trotzdem nutzbar).
function computeToolCapability(agentId) {
  if (!toolRegistry || !Array.isArray(toolRegistry.TOOL_REGISTRY)) return [];
  return toolRegistry.TOOL_REGISTRY.filter((tool) => Array.isArray(tool.allowedAgents) && tool.allowedAgents.includes(agentId)).map(
    (tool) => ({ toolId: tool.toolId, displayName: tool.displayName, connectionStatus: tool.connectionStatus }),
  );
}

// Autonomierahmen: ausschließlich aus agent.readOnly/agent.active
// abgeleitet (agent-registry.js) – kein hartkodierter Wert, der von der
// Registrierung abweichen könnte.
function computeAutonomyScope(agent) {
  if (!agent.active) return "INAKTIV";
  return agent.readOnly ? "READ_ONLY_BERATEND" : "AUSFÜHREND";
}

function buildOrganizationProfile(agentId) {
  const agent = agentRegistry.getAgentById(agentId);
  if (!agent) return null;
  const rule = AGENT_ORGANIZATION_RULES[agentId];
  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.name,
    responsibilityPurpose: agent.role,
    department: rule.group,
    leadershipLevel: rule.leadershipLevel,
    reportsTo: computeReportsTo(agentId),
    worksRegularlyWith: computeWorksRegularlyWith(agentId, rule.group),
    qualityResponsibility: computeQualityResponsibility(agentId, agent),
    autonomyScope: computeAutonomyScope(agent),
    toolCapability: computeToolCapability(agentId),
    status: agent.active ? "ACTIVE" : "INACTIVE",
    isCentralOrchestrator: agentId === CENTRAL_ORCHESTRATOR_AGENT_ID,
    groupAssignmentNote: rule.note,
    // Unternehmensleitlinien V1.0 (Auftrag Abschnitt K) – "Jede Aufgabe und
    // jede Empfehlung besitzt genau eine verantwortliche Agentenrolle":
    // ownerAgentId ist bewusst identisch mit agentId (jeder Agent ist immer
    // ausschließlich sein eigener Owner); worksRegularlyWith bleibt die
    // Contributor-Liste (Beiträge, keine Mitverantwortung).
    ownerAgentId: agent.id,
    contributorAgentIds: computeWorksRegularlyWith(agentId, rule.group),
  };
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt M) – "Finance-/Controlling-
// Lücke ehrlich verankern": kein vorhandener Agent wird künstlich
// zugeordnet, kein automatischer 26. Agent wird erzeugt. Generisch für JEDE
// leere Zielstruktur formuliert (aktuell betrifft dies ausschließlich
// "Finance und Controlling"), damit eine künftige weitere Lücke nicht
// separat nachgepflegt werden müsste.
const CAPABILITY_GAP_DECISION_OPTIONS = Object.freeze([
  "EXISTING_AGENT_TRAINING",
  "DEFINE_NEW_AGENT",
  "EXTERNAL_TOOL_OR_PARTNER",
  "LEAVE_OPEN_DELIBERATELY",
]);

function buildOrganizationOverview() {
  const profiles = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => buildOrganizationProfile(agent.id));
  const groups = ORGANIZATION_GROUPS.map((groupName) => {
    const agentsInGroup = profiles.filter((profile) => profile.department === groupName);
    const capabilityStatus = agentsInGroup.length > 0 ? "STAFFED" : "CAPABILITY_GAP";
    return {
      group: groupName,
      agentCount: agentsInGroup.length,
      agents: agentsInGroup.map((profile) => profile.agentId),
      capabilityStatus,
      capabilityGapNote:
        capabilityStatus === "CAPABILITY_GAP"
          ? "Erkannte organisatorische Lücke – kein bestehender Agent wurde künstlich zugeordnet, kein automatischer 26. Agent wird erzeugt. Spätere Entscheidung durch Jamal erforderlich."
          : null,
      capabilityGapDecisionOptions: capabilityStatus === "CAPABILITY_GAP" ? CAPABILITY_GAP_DECISION_OPTIONS : [],
    };
  });
  return {
    version: "V7.5",
    registrySource: "agent-registry.js",
    agentCount: profiles.length,
    canonicalAgentCount: agentRegistry.CANONICAL_AGENT_COUNT,
    groups,
    profiles,
    centralOrchestratorAgentId: CENTRAL_ORCHESTRATOR_AGENT_ID,
    projectManagerRoleName: "Projektmanager-Agent",
    hrRoleNote:
      "HR bleibt Entwicklungs- und Autonomieempfehlungsinstanz (agent-hr-coaching-service.js); kein eigener 26. Agent, keine automatische Autonomieänderung.",
    jamalIsSoleDecisionMaker: true,
    companyPrinciplesVersion: companyPrinciples.COMPANY_PRINCIPLES_VERSION,
  };
}

module.exports = {
  ORGANIZATION_GROUPS,
  LEADERSHIP_LEVELS,
  CENTRAL_ORCHESTRATOR_AGENT_ID,
  CAPABILITY_GAP_DECISION_OPTIONS,
  buildOrganizationProfile,
  buildOrganizationOverview,
};
