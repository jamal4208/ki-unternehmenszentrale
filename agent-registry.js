"use strict";

(function initAgentRegistry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AgentRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAgentRegistryApi() {
  const PRODUCTIVE_AGENT_REGISTRY = Object.freeze([
    { id: "strategy-agent", name: "Strategie-Agent", role: "Bewertet Ziel, Richtung und Priorität", category: "strategy", active: true, readOnly: true },
    { id: "product-agent", name: "Produkt-Agent", role: "Ordnet Auftrag produktlogisch ein", category: "product", active: true, readOnly: true },
    { id: "project-status-agent", name: "Projektstatus-Agent", role: "Verdichtet Ist-Stand und Fortschritt", category: "project", active: true, readOnly: true },
    { id: "prioritization-agent", name: "Priorisierungs-Agent", role: "Sortiert Aufgaben nach Dringlichkeit und Nutzen", category: "prioritization", active: true, readOnly: true },
    { id: "ui-agent", name: "UI-Agent", role: "Prüft UI-Bezug und Darstellungsfolgen", category: "ui", active: true, readOnly: true },
    { id: "api-agent", name: "API-Agent", role: "Prüft API-Bezug und Antwortstruktur", category: "api", active: true, readOnly: true },
    { id: "security-agent", name: "Sicherheits-Agent", role: "Bewertet Sicherheitsgrenzen und Risiken", category: "security", active: true, readOnly: true },
    { id: "quality-test-agent", name: "QS-/Test-Agent", role: "Empfiehlt Prüf- und Testschritte", category: "quality", active: true, readOnly: true },
    { id: "documentation-agent", name: "Dokumentations-Agent", role: "Strukturiert Übergabe und Dokumentation", category: "documentation", active: true, readOnly: true },
    { id: "release-agent", name: "Release-Agent", role: "Bewertet Finish- und Release-Reife", category: "release", active: true, readOnly: true },
    { id: "health-compass-agent", name: "Health-Kompass-Agent", role: "Ordnet Health-Upgrade-Kompass-Bezug ein", category: "health", active: true, readOnly: true },
    { id: "customer-value-agent", name: "Kundenwert-Agent", role: "Bewertet Nutzen aus Kundensicht", category: "customer", active: true, readOnly: true },
    { id: "risk-agent", name: "Risiko-Agent", role: "Identifiziert auftragsbezogene Risiken", category: "risk", active: true, readOnly: true },
    { id: "decision-agent", name: "Entscheidungs-Agent", role: "Formuliert Entscheidungsoptionen read-only", category: "decision", active: true, readOnly: true },
    { id: "next-actions-agent", name: "Nächste-Aktionen-Agent", role: "Leitet konkrete nächste Schritte ab", category: "actions", active: true, readOnly: true },
    { id: "open-points-agent", name: "Open-Points-Agent", role: "Sammelt offene Klärungspunkte", category: "open-points", active: true, readOnly: true },
    { id: "workflow-agent", name: "Workflow-Agent", role: "Bewertet Ablauf und Reihenfolge", category: "workflow", active: true, readOnly: true },
    { id: "data-structure-agent", name: "Datenstruktur-Agent", role: "Prüft Daten- und Ergebnisstruktur", category: "data", active: true, readOnly: true },
    { id: "integration-agent", name: "Integrations-Agent", role: "Bewertet Integrationsbezug ohne Ausführung", category: "integration", active: true, readOnly: true },
    { id: "communication-agent", name: "Kommunikations-Agent", role: "Formuliert Übergabe und Kommunikation", category: "communication", active: true, readOnly: true },
    { id: "operations-agent", name: "Betriebs-Agent", role: "Bewertet Betriebs- und Nutzbarkeit", category: "operations", active: true, readOnly: true },
    { id: "error-analysis-agent", name: "Fehleranalyse-Agent", role: "Analysiert Fehlerursachen read-only", category: "error", active: true, readOnly: true },
    { id: "review-agent", name: "Review-Agent", role: "Führt read-only Qualitätsreview durch", category: "review", active: true, readOnly: true },
    { id: "closure-agent", name: "Abschluss-Agent", role: "Bewertet Abschluss- und Finish-Fähigkeit", category: "closure", active: true, readOnly: true },
    { id: "orchestrator-agent", name: "Orchestrator-Agent", role: "Koordiniert Agentenperspektiven read-only", category: "orchestration", active: true, readOnly: true },
  ].map((agent) => Object.freeze(agent)));

  const ROLE_NAME_MAPPING = Object.freeze({
    "Projektmanager-Agent": "orchestrator-agent",
    "Geschäftsführer-Agent": "strategy-agent",
    "Produktmanager-Agent": "product-agent",
    "Design-Director-Agent": "ui-agent",
    "Entwickler-Agent": "api-agent",
    "Compliance-/Risiko-Agent": "risk-agent",
    "Wissens-/Archiv-Agent": "documentation-agent",
    "Plugin-/Tool-Agent": "integration-agent",
    "QA-/QS-Agent": "quality-test-agent",
  });

  function getAgentById(agentId) {
    const agent = PRODUCTIVE_AGENT_REGISTRY.find((entry) => entry.id === agentId);
    return agent ? { ...agent } : null;
  }

  function hasAgentId(agentId) {
    return PRODUCTIVE_AGENT_REGISTRY.some((entry) => entry.id === agentId);
  }

  return Object.freeze({
    CANONICAL_AGENT_COUNT: PRODUCTIVE_AGENT_REGISTRY.length,
    PRODUCTIVE_AGENT_REGISTRY,
    ROLE_NAME_MAPPING,
    getAgentById,
    hasAgentId,
  });
});
