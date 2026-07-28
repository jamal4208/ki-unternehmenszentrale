"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
//
// Beweist, dass drei bestehende Agenten (Projektmanager-, Recherche-/
// Analyse- und Dokumentations-Agent) gemeinsam einen realen Arbeitsauftrag
// von der Auftragsklärung bis zu einem prüfbaren Ergebnis bearbeiten
// können. Gleiches, bereits etabliertes Architekturmuster wie
// health-reference-work-run-service.js: GENAU EIN kanonischer Pilotauftrag,
// additive Governance-Tabellen, keine zweite generische Arbeitsauftrags-
// Architektur (die bestehende kundenseitige work-order-service.js bleibt
// unangetastet und unabhängig von diesem Modul).
//
// Harte Grenzen (Auftrag "Pilotbetrieb vorbereiten"):
//   - Dieses Modul führt NIEMALS eine echte externe Aktion aus (keine
//     E-Mail, keine Veröffentlichung, kein Commit, kein Push, kein
//     Deployment) und ändert NIEMALS eine Datei im Health Upgrade Kompass.
//   - Dieses Modul legt NIEMALS einen neuen Agenten an und erweitert
//     NIEMALS das kanonische 25-Agenten-Register (agent-registry.js).
//   - `APPROVED_FOR_EXECUTION` und `COMPLETED` werden NIEMALS automatisch
//     durch einen Agenten erreicht – ausschließlich über Jamals
//     ausdrückliche, mit `confirmed: true` gesicherte Entscheidung
//     (gleiches Muster wie health-reference-work-run-service.js#
//     recordFinalAcceptance).
//   - Der Projektmanager-Filter (runProjectManagerFilter) ist eine reine,
//     deterministische Funktion ohne I/O und entscheidet, ob eine
//     Rollenübergabe weitergegeben werden darf.
//
// Agentenzuordnung (Auftrag "welche bestehenden Agenten entsprechen den
// drei Pilotrollen?"): ausschließlich bereits bestehende, kanonische
// AGENTS.md-Agenten. "Projektmanager-Agent" und "Dokumentations-Agent"
// (= bestehender "Wissens-/Archiv-Agent", siehe AGENTS.md Nr. 11: "Status,
// Entscheidungen, Historie" / "dokumentieren") sind exakte Treffer. Für
// "Recherche-/Analyse-Agent" existiert KEIN separat benannter Agent im
// 25er-Register (siehe AGENTS.md "Noch zu normalisieren"); dieser Pilot
// verwendet dafür den bestehenden "Produktmanager-Agent" (AGENTS.md Nr. 3:
// "Idee/Nutzerbedarf → Produktstruktur", die inhaltlich nächstliegende
// bestehende Rolle) – eine bewusste, offen dokumentierte Pilotentscheidung,
// KEINE Änderung des 25er-Registers und KEIN Agent 26. Jamal sollte diese
// Zuordnung bestätigen oder korrigieren (siehe Abschlussbericht).

const crypto = require("crypto");
const agentRegistry = require("./agent-registry");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");

const PILOT_WORK_ORDER_STATUS_VALUES = migrations.PILOT_WORK_ORDER_STATUS_VALUES;
const PILOT_ROLE_VALUES = migrations.PILOT_ROLE_VALUES;
const PILOT_HANDOFF_FROM_VALUES = migrations.PILOT_HANDOFF_FROM_VALUES;

const CANONICAL_PILOT_ORDER_ID = "pilot-three-agent-work-order-v1";

class PilotWorkOrderError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PilotWorkOrderError";
    this.statusCode = statusCode;
  }
}
function badRequest(message) {
  return new PilotWorkOrderError(message, 400);
}
function notFound(message) {
  return new PilotWorkOrderError(message, 404);
}
function conflict(message) {
  return new PilotWorkOrderError(message, 409);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}
function truncate(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isNonEmptyString(entry));
}

// ---------------------------------------------------------------------------
// Agentenzuteilung – ausschließlich bereits vorhandene, kanonische Agenten.
// ---------------------------------------------------------------------------
function resolveCanonicalAgent(canonicalName) {
  const agentKey = agentRegistry.ROLE_NAME_MAPPING[canonicalName];
  if (!agentKey || !agentRegistry.hasAgentId(agentKey)) {
    throw new Error(`pilot-work-order-service: unbekannte kanonische Agentenrolle "${canonicalName}".`);
  }
  const agent = agentRegistry.getAgentById(agentKey);
  return Object.freeze({ canonicalName, agentKey, technicalName: agent.name, technicalRole: agent.role });
}

const PROJECT_MANAGER_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Projektmanager-Agent"),
  pilotRole: "PROJEKTMANAGER",
  pilotRoleLabel: "Projektmanager-Agent",
  focus: "Koordiniert den Pilotauftrag, filtert jede Rollenübergabe (Projektmanager-Filter) und eskaliert Entscheidungen an Jamal.",
  isExactRoleMatch: true,
});

const RESEARCH_ANALYSIS_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Produktmanager-Agent"),
  pilotRole: "RECHERCHE_ANALYSE",
  pilotRoleLabel: "Recherche-/Analyse-Agent",
  focus: "Erarbeitet belastbare, nachvollziehbar begründete Inhalte für den Pilotauftrag.",
  isExactRoleMatch: false,
  mappingNote:
    "Kein separat benannter Recherche-/Analyse-Agent im 25er-Register vorhanden; nächstliegende bestehende Rolle " +
    "ist der Produktmanager-Agent (AGENTS.md Nr. 3). Offener Normalisierungspunkt für Jamal.",
});

const DOCUMENTATION_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Wissens-/Archiv-Agent"),
  pilotRole: "DOKUMENTATION",
  pilotRoleLabel: "Dokumentations-Agent",
  focus: "Erstellt aus den geprüften Ergebnissen ein klar strukturiertes, prüfbares Ergebnis.",
  isExactRoleMatch: true,
  mappingNote: "Entspricht dem bestehenden Wissens-/Archiv-Agent (AGENTS.md Nr. 11: „Status, Entscheidungen, Historie“ / „dokumentieren“).",
});

const PILOT_TEAM = Object.freeze([PROJECT_MANAGER_AGENT, RESEARCH_ANALYSIS_AGENT, DOCUMENTATION_AGENT]);
const PILOT_TEAM_BY_ROLE = new Map(PILOT_TEAM.map((agent) => [agent.pilotRole, agent]));

const PILOT_STATUS_LABELS_DE = Object.freeze({
  DRAFT: "Entwurf",
  READY_FOR_JAMAL_APPROVAL: "Wartet auf Jamal-Freigabe",
  APPROVED_FOR_EXECUTION: "Für Ausführung freigegeben",
  IN_EXECUTION: "In Ausführung",
  READY_FOR_REVIEW: "Wartet auf Abschlussprüfung",
  COMPLETED: "Abgeschlossen",
  RETURNED: "Zurückgegeben",
  BLOCKED: "Blockiert",
});

const NEXT_STEP_BY_STATUS = Object.freeze({
  DRAFT: "Pilotauftrag prüfen und für Jamals Freigabe vorbereiten (markReadyForApproval).",
  READY_FOR_JAMAL_APPROVAL: "Jamal entscheidet über die Freigabe zur Ausführung (approveForExecution mit confirmed: true).",
  APPROVED_FOR_EXECUTION: "Ausführung starten (startExecution) – Rollenübergaben können danach beginnen.",
  IN_EXECUTION: "Nächste Rollenübergabe einreichen (submitHandoff) oder zur Abschlussprüfung vorlegen (submitForReview).",
  READY_FOR_REVIEW: "Jamal entscheidet über den Abschluss (approveCompletion mit confirmed: true) oder gibt zur Überarbeitung zurück.",
  COMPLETED: "Pilotlauf abgeschlossen – kein weiterer Schritt in diesem Lauf.",
  RETURNED: "Ursache klären, danach erneut in den Entwurf überführen (reopenFromReturned).",
  BLOCKED: "Blocker mit Jamal klären, danach kontrolliert entsperren (unblockOrder).",
});

const AUTONOMY_BOUNDARIES_NOTICE = Object.freeze({
  noExternalAction: true,
  noEmailOrMessageSent: true,
  noPublication: true,
  noPaymentOrContract: true,
  noDeployment: true,
  noHealthUpgradeKompassChange: true,
  noNewAgentCreated: true,
  noAutonomyIncrease: true,
  autoApprovalByAgentAllowed: false,
  executionApprovalRequiresExplicitJamalConfirmation: true,
  completionApprovalRequiresExplicitJamalConfirmation: true,
  disclaimer:
    "Dieser Pilotlauf bereitet die Drei-Agenten-Zusammenarbeit vor und begleitet sie. Er ist keine externe Aktion, " +
    "kein Commit, kein Push und kein Deployment.",
});

function assertOrderIsMutable(order) {
  if (!order) throw notFound("Der Pilotauftrag wurde noch nicht angelegt.");
  if (order.status === "COMPLETED") {
    throw conflict("Der Pilotauftrag ist bereits abgeschlossen (COMPLETED) und kann nicht mehr verändert werden.");
  }
}

// ---------------------------------------------------------------------------
// Validierung des Pilotauftragsobjekts (Auftrag Abschnitt 1). Wird
// unabhängig getestet ("gültige Pilotauftragserstellung" /
// "Ablehnung unvollständiger Aufträge").
// ---------------------------------------------------------------------------
function validatePilotOrderInput(input = {}) {
  const errors = [];
  if (!isNonEmptyString(input.title)) errors.push("title");
  if (!isNonEmptyString(input.desiredOutcome)) errors.push("desiredOutcome");
  if (!isNonEmptyString(input.requestedBy)) errors.push("requestedBy");
  if (!isNonEmptyStringArray(input.qualityCriteria)) errors.push("qualityCriteria");
  if (!isNonEmptyStringArray(input.allowedTools)) errors.push("allowedTools");
  if (!isNonEmptyStringArray(input.forbiddenActions)) errors.push("forbiddenActions");
  if (!isNonEmptyStringArray(input.requiredApprovals)) errors.push("requiredApprovals");
  if (!isNonEmptyString(input.timeframe)) errors.push("timeframe");
  if (errors.length > 0) {
    throw badRequest(`Pilotauftrag ist unvollständig, es fehlen: ${errors.join(", ")}.`);
  }
}

// Kanonischer Pilotauftragsinhalt (Auftrag Abschnitt 1) – der einzige Inhalt,
// mit dem getOrCreateCanonicalPilotOrder den kanonischen Lauf anlegt.
const CANONICAL_PILOT_ORDER_INPUT = Object.freeze({
  title: "Pilotauftrag: Drei-Agenten-Zusammenarbeit von Auftragsklärung bis prüfbarem Ergebnis",
  desiredOutcome:
    "Nachweis, dass Projektmanager-, Recherche-/Analyse- und Dokumentations-Agent gemeinsam einen realen " +
    "Arbeitsauftrag von der Auftragsklärung bis zu einem geprüften, klar dokumentierten Ergebnis führen können " +
    "– vollständig vorbereitend, read-only und ohne externe Aktion.",
  requestedBy: "Jamal",
  qualityCriteria: Object.freeze([
    "Ergebnis beantwortet die Auftragsfrage vollständig",
    "Quellen oder Grundlagen sind nachvollziehbar benannt",
    "Risiken und Grenzen sind offen benannt",
    "keine verbotene Aktion wurde ausgeführt",
    "Ergebnis ist klar strukturiert (Titel, Kernaussage, Belege, offene Punkte)",
  ]),
  allowedTools: Object.freeze([
    "interne Dokumentenablage (read-only)",
    "bestehende kanonische Register (project-registry.js, agent-registry.js, read-only)",
    "bestehende Plugin-/Tool-Radar-Übersicht (read-only)",
  ]),
  forbiddenActions: Object.freeze([
    "externe Schreibzugriffe",
    "E-Mails oder Nachrichten versenden",
    "Veröffentlichung",
    "Zahlungen oder Verträge",
    "Deployment",
    "automatische Freigabe durch einen Agenten",
    "Änderung am Health Upgrade Kompass",
  ]),
  requiredApprovals: Object.freeze([
    "Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)",
    "Freigabe des finalen Ergebnisses (COMPLETED)",
    "jede externe Aktion oder Autonomieerhöhung",
  ]),
  timeframe: "Pilotlauf ohne festes Enddatum; Start ausschließlich nach Jamals ausdrücklicher Freigabe eines realen Arbeitsauftrags.",
});

function rowToOrderView(row) {
  if (!row) return null;
  let involvedAgents = PILOT_TEAM;
  try {
    const parsed = JSON.parse(row.involvedAgentsJson);
    if (Array.isArray(parsed) && parsed.length === PILOT_TEAM.length) involvedAgents = PILOT_TEAM;
  } catch (_error) {
    /* Fällt sicher auf die aktuelle, im Code definierte Teamzuordnung zurück. */
  }
  return {
    id: row.id,
    title: row.title,
    desiredOutcome: row.desiredOutcome,
    requestedBy: row.requestedBy,
    status: row.status,
    statusLabel: PILOT_STATUS_LABELS_DE[row.status] || row.status,
    involvedAgents,
    qualityCriteria: JSON.parse(row.qualityCriteriaJson),
    allowedTools: JSON.parse(row.allowedToolsJson),
    forbiddenActions: JSON.parse(row.forbiddenActionsJson),
    requiredApprovals: JSON.parse(row.requiredApprovalsJson),
    timeframe: row.timeframe,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToHandoffView(row) {
  if (!row) return null;
  let pmFilterReasons = [];
  try {
    pmFilterReasons = row.pmFilterReasonsJson ? JSON.parse(row.pmFilterReasonsJson) : [];
  } catch (_error) {
    pmFilterReasons = [];
  }
  return {
    id: row.id,
    pilotOrderId: row.pilotOrderId,
    sequence: row.sequence,
    fromPilotRole: row.fromPilotRole,
    toPilotRole: row.toPilotRole,
    toPilotRoleLabel: (PILOT_TEAM_BY_ROLE.get(row.toPilotRole) || {}).pilotRoleLabel || row.toPilotRole,
    shortFinding: row.shortFinding,
    resultOrRecommendation: row.resultOrRecommendation,
    basisUsed: row.basisUsed,
    riskOrLimit: row.riskOrLimit,
    nextStep: row.nextStep,
    decisionNeeded: row.decisionNeeded,
    forbiddenActionOccurred: Boolean(row.forbiddenActionOccurred),
    autonomyBoundaryRespected: Boolean(row.autonomyBoundaryRespected),
    pmFilterStatus: row.pmFilterStatus,
    pmFilterReasons,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Anlage/Abruf des kanonischen Pilotauftrags – idempotent, genau eine feste
// ID (Auftrag Abschnitt 1).
// ---------------------------------------------------------------------------
function getOrCreateCanonicalPilotOrder(db, options = {}) {
  const now = options.now || new Date();
  let orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  const alreadyExisted = Boolean(orderRow);

  if (!orderRow) {
    validatePilotOrderInput(CANONICAL_PILOT_ORDER_INPUT);
    orderRow = authDb.insertPilotWorkOrderIfMissing(db, {
      id: CANONICAL_PILOT_ORDER_ID,
      title: CANONICAL_PILOT_ORDER_INPUT.title,
      desiredOutcome: CANONICAL_PILOT_ORDER_INPUT.desiredOutcome,
      requestedBy: CANONICAL_PILOT_ORDER_INPUT.requestedBy,
      involvedAgentsJson: JSON.stringify(PILOT_TEAM.map((agent) => ({ pilotRole: agent.pilotRole, canonicalName: agent.canonicalName }))),
      status: "DRAFT",
      qualityCriteriaJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.qualityCriteria),
      allowedToolsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.allowedTools),
      forbiddenActionsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.forbiddenActions),
      requiredApprovalsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.requiredApprovals),
      timeframe: CANONICAL_PILOT_ORDER_INPUT.timeframe,
      createdAt: nowIso(now),
      updatedAt: nowIso(now),
    });
  }

  if (!alreadyExisted) {
    try {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_WORK_ORDER_CREATED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID },
      });
    } catch (_error) {
      /* Audit-Fehler dürfen die bereits gültige Anlage nicht rückgängig machen. */
    }
  }

  return orderRow ? buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID)) : null;
}

function buildOverview(db, orderRow) {
  if (!orderRow) return null;
  const order = rowToOrderView(orderRow);
  const handoffs = authDb.listPilotHandoffs(db, orderRow.id).map(rowToHandoffView);

  const lastHandoff = handoffs.length > 0 ? handoffs[handoffs.length - 1] : null;
  let openDecision = null;
  if (order.status === "READY_FOR_JAMAL_APPROVAL") {
    openDecision = "Jamal muss die Ausführung freigeben (APPROVED_FOR_EXECUTION) oder den Auftrag zurückgeben.";
  } else if (order.status === "READY_FOR_REVIEW") {
    openDecision = "Jamal muss das Ergebnis abnehmen (COMPLETED) oder zur Überarbeitung zurückgeben.";
  } else if (order.status === "BLOCKED") {
    openDecision = "Jamal muss den Blocker klären, bevor der Pilotlauf fortgesetzt werden kann.";
  } else if (lastHandoff && lastHandoff.decisionNeeded) {
    openDecision = lastHandoff.decisionNeeded;
  }

  const risksAndLimits = Array.from(new Set(handoffs.map((handoff) => handoff.riskOrLimit).filter(Boolean)));

  const passedRoles = new Set(handoffs.filter((handoff) => handoff.pmFilterStatus === "PASSED").map((handoff) => handoff.toPilotRole));

  return {
    order,
    involvedAgents: order.involvedAgents,
    status: order.status,
    statusLabel: order.statusLabel,
    handoffs,
    openDecision,
    risksAndLimits,
    nextStep: NEXT_STEP_BY_STATUS[order.status] || NEXT_STEP_BY_STATUS.DRAFT,
    progress: { rolesPassed: passedRoles.size, rolesTotal: PILOT_ROLE_VALUES.length, handoffsSubmitted: handoffs.length },
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function getPilotOverview(db) {
  return getOrCreateCanonicalPilotOrder(db);
}

function auditStatusChanged(db, options = {}) {
  const { previousStatus, nextStatus, actorUserId, now } = options;
  if (previousStatus === nextStatus) return;
  try {
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_WORK_ORDER_STATUS_CHANGED",
      result: "OK",
      actorUserId: actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID, previousStatus, nextStatus },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Statusänderung nicht rückgängig machen. */
  }
}

function transitionStatus(db, order, nextStatus, options) {
  const previousStatus = order.status;
  authDb.updatePilotWorkOrderStatus(db, { id: order.id, status: nextStatus, updatedAt: nowIso(options.now) });
  auditStatusChanged(db, { previousStatus, nextStatus, actorUserId: options.actorUserId, now: options.now });
}

// ---------------------------------------------------------------------------
// Statusübergänge (Auftrag Abschnitt 4). Keine automatische Freigabe durch
// Agenten: APPROVED_FOR_EXECUTION und COMPLETED erfordern `confirmed: true`.
// ---------------------------------------------------------------------------
function markReadyForApproval(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "DRAFT") {
    throw conflict(`Der Pilotauftrag kann nur aus DRAFT heraus zur Freigabe vorgelegt werden (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "READY_FOR_JAMAL_APPROVAL", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function approveForExecution(db, options = {}) {
  if (options.confirmed !== true) {
    throw badRequest("Die Freigabe zur Ausführung erfordert confirmed === true (Jamals ausdrückliche Bestätigung).");
  }
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "READY_FOR_JAMAL_APPROVAL") {
    throw conflict(`Eine Ausführungsfreigabe ist nur aus READY_FOR_JAMAL_APPROVAL möglich (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "APPROVED_FOR_EXECUTION", options);
  try {
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_EXECUTION_APPROVAL_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(options.now),
      metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Freigabe nicht rückgängig machen. */
  }
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function startExecution(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "APPROVED_FOR_EXECUTION") {
    throw conflict(`Die Ausführung kann nur nach Freigabe (APPROVED_FOR_EXECUTION) gestartet werden (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "IN_EXECUTION", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

// ---------------------------------------------------------------------------
// Werkzeugprüfung (Auftrag Abschnitt "erlaubte Werkzeuge"/"verbotene
// Aktionen") – reine Funktion, wirft bei nicht erlaubtem/verbotenem
// Werkzeug oder Aktion.
// ---------------------------------------------------------------------------
function assertToolOrActionAllowed(order, toolOrActionName) {
  const name = String(toolOrActionName || "").trim();
  const forbidden = (order.forbiddenActions || []).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (forbidden) {
    throw new PilotWorkOrderError(`"${forbidden}" ist eine verbotene Aktion in diesem Pilotauftrag und wird blockiert.`, 403);
  }
  const allowed = (order.allowedTools || []).some((entry) => entry.toLowerCase() === name.toLowerCase());
  if (!allowed) {
    throw new PilotWorkOrderError(`"${name}" ist kein erlaubtes Werkzeug in diesem Pilotauftrag und wird blockiert.`, 403);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Projektmanager-Filter (Auftrag Abschnitt 3) – reine, deterministische
// Funktion ohne I/O. Der Projektmanager darf ein Ergebnis nur weitergeben,
// wenn alle fünf Kriterien erfüllt sind.
// ---------------------------------------------------------------------------
function runProjectManagerFilter(order, handoffInput = {}) {
  const checks = [
    {
      key: "MATCHES_ORDER",
      label: "Ergebnis passt zum Auftrag",
      passed: isNonEmptyString(handoffInput.resultOrRecommendation) && handoffInput.pilotOrderId === order.id,
    },
    {
      key: "BASIS_TRACEABLE",
      label: "Quellen oder Grundlagen sind nachvollziehbar",
      passed: isNonEmptyString(handoffInput.basisUsed),
    },
    {
      key: "RISKS_NAMED",
      label: "Risiken sind genannt",
      passed: isNonEmptyString(handoffInput.riskOrLimit),
    },
    {
      key: "NO_FORBIDDEN_ACTION",
      label: "keine verbotene Aktion ist erfolgt",
      passed: handoffInput.forbiddenActionOccurred !== true,
    },
    {
      key: "WITHIN_JAMAL_APPROVAL_BOUNDARY",
      label: "Jamals Freigabegrenze ist eingehalten",
      passed: handoffInput.autonomyBoundaryRespected !== false,
    },
  ];
  const passed = checks.every((check) => check.passed);
  return { passed, checks, reasons: checks.filter((check) => !check.passed).map((check) => check.label) };
}

// ---------------------------------------------------------------------------
// Rollenübergabe (Auftrag Abschnitt 2) – nur während IN_EXECUTION möglich.
// Läuft automatisch durch den Projektmanager-Filter, bevor sie als
// angenommen gilt.
// ---------------------------------------------------------------------------
function submitHandoff(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(`Rollenübergaben sind nur während IN_EXECUTION möglich (aktuell ${orderRow.status}).`);
  }
  const fromPilotRole = options.fromPilotRole || "JAMAL";
  const toPilotRole = options.toPilotRole;
  if (!PILOT_HANDOFF_FROM_VALUES.includes(fromPilotRole)) throw badRequest("fromPilotRole ist unbekannt.");
  if (!PILOT_ROLE_VALUES.includes(toPilotRole)) throw badRequest("toPilotRole ist unbekannt.");

  const requiredTextFields = ["shortFinding", "resultOrRecommendation", "basisUsed", "riskOrLimit", "nextStep"];
  const missing = requiredTextFields.filter((field) => !isNonEmptyString(options[field]));
  if (missing.length > 0) {
    throw badRequest(`Rollenübergabe ist unvollständig, es fehlen: ${missing.join(", ")}.`);
  }

  const now = options.now || new Date();
  const order = rowToOrderView(orderRow);
  const filterInput = {
    pilotOrderId: CANONICAL_PILOT_ORDER_ID,
    resultOrRecommendation: options.resultOrRecommendation,
    basisUsed: options.basisUsed,
    riskOrLimit: options.riskOrLimit,
    forbiddenActionOccurred: Boolean(options.forbiddenActionOccurred),
    autonomyBoundaryRespected: options.autonomyBoundaryRespected !== false,
  };
  const filterResult = runProjectManagerFilter(order, filterInput);
  const pmFilterStatus = filterResult.passed ? "PASSED" : "REJECTED";

  const existingHandoffs = authDb.listPilotHandoffs(db, CANONICAL_PILOT_ORDER_ID);
  const sequence = existingHandoffs.length + 1;

  const handoffRow = authDb.insertPilotHandoff(db, {
    id: crypto.randomUUID(),
    pilotOrderId: CANONICAL_PILOT_ORDER_ID,
    sequence,
    fromPilotRole,
    toPilotRole,
    shortFinding: truncate(options.shortFinding, 1000),
    resultOrRecommendation: truncate(options.resultOrRecommendation, 4000),
    basisUsed: truncate(options.basisUsed, 2000),
    riskOrLimit: truncate(options.riskOrLimit, 2000),
    nextStep: truncate(options.nextStep, 1000),
    decisionNeeded: options.decisionNeeded ? truncate(options.decisionNeeded, 1000) : null,
    forbiddenActionOccurred: Boolean(options.forbiddenActionOccurred),
    autonomyBoundaryRespected: options.autonomyBoundaryRespected !== false,
    pmFilterStatus,
    pmFilterReasonsJson: JSON.stringify(filterResult.reasons),
    createdAt: nowIso(now),
  });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_HANDOFF_SUBMITTED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID, pilotHandoffId: handoffRow.id, pilotRole: toPilotRole },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Einreichung nicht rückgängig machen. */
  }

  if (options.forbiddenActionOccurred === true) {
    transitionStatus(db, orderRow, "BLOCKED", options);
    try {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION",
        result: "DENIED",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID, pilotHandoffId: handoffRow.id },
      });
    } catch (_error) {
      /* Audit-Fehler dürfen die Blockierung nicht rückgängig machen. */
    }
  } else if (!filterResult.passed) {
    transitionStatus(db, orderRow, "RETURNED", options);
    try {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_REJECTED_BY_PM_FILTER",
        result: "DENIED",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID, pilotHandoffId: handoffRow.id, pmFilterStatus },
      });
    } catch (_error) {
      /* Audit-Fehler dürfen die Ablehnung nicht rückgängig machen. */
    }
  } else {
    try {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_ACCEPTED_BY_PM_FILTER",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID, pilotHandoffId: handoffRow.id, pmFilterStatus },
      });
    } catch (_error) {
      /* Audit-Fehler dürfen die Annahme nicht rückgängig machen. */
    }
  }

  return { handoff: rowToHandoffView(handoffRow), filterResult };
}

function submitForReview(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(`Nur ein Auftrag in IN_EXECUTION kann zur Abschlussprüfung vorgelegt werden (aktuell ${orderRow.status}).`);
  }
  const handoffs = authDb.listPilotHandoffs(db, CANONICAL_PILOT_ORDER_ID).map(rowToHandoffView);
  const hasPassedDocumentationHandoff = handoffs.some(
    (handoff) => handoff.toPilotRole === "DOKUMENTATION" && handoff.pmFilterStatus === "PASSED",
  );
  if (!hasPassedDocumentationHandoff) {
    throw badRequest("Es liegt noch kein vom Projektmanager-Filter angenommenes Dokumentations-Ergebnis vor.");
  }
  transitionStatus(db, orderRow, "READY_FOR_REVIEW", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function approveCompletion(db, options = {}) {
  if (options.confirmed !== true) {
    throw badRequest("Der Abschluss erfordert confirmed === true (Jamals ausdrückliche Bestätigung).");
  }
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "READY_FOR_REVIEW") {
    throw conflict(`Ein Abschluss ist nur aus READY_FOR_REVIEW möglich (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "COMPLETED", options);
  try {
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_COMPLETION_APPROVAL_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(options.now),
      metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Abnahme nicht rückgängig machen. */
  }
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function returnOrder(db, options = {}) {
  if (!isNonEmptyString(options.note)) throw badRequest("note ist erforderlich (Grund der Rückgabe).");
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (!["READY_FOR_JAMAL_APPROVAL", "READY_FOR_REVIEW", "IN_EXECUTION"].includes(orderRow.status)) {
    throw conflict(`Eine Rückgabe ist aus ${orderRow.status} nicht möglich.`);
  }
  transitionStatus(db, orderRow, "RETURNED", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function reopenFromReturned(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "RETURNED") {
    throw conflict(`Nur ein zurückgegebener Auftrag (RETURNED) kann neu gestartet werden (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "DRAFT", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function blockOrder(db, options = {}) {
  if (!isNonEmptyString(options.reason)) throw badRequest("reason ist erforderlich.");
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  transitionStatus(db, orderRow, "BLOCKED", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

function unblockOrder(db, options = {}) {
  const orderRow = authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID);
  assertOrderIsMutable(orderRow);
  if (orderRow.status !== "BLOCKED") {
    throw conflict(`Nur ein blockierter Auftrag (BLOCKED) kann entsperrt werden (aktuell ${orderRow.status}).`);
  }
  transitionStatus(db, orderRow, "RETURNED", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, CANONICAL_PILOT_ORDER_ID));
}

module.exports = {
  CANONICAL_PILOT_ORDER_ID,
  CANONICAL_PILOT_ORDER_INPUT,
  PILOT_WORK_ORDER_STATUS_VALUES,
  PILOT_ROLE_VALUES,
  PILOT_HANDOFF_FROM_VALUES,
  PROJECT_MANAGER_AGENT,
  RESEARCH_ANALYSIS_AGENT,
  DOCUMENTATION_AGENT,
  PILOT_TEAM,
  PILOT_STATUS_LABELS_DE,
  NEXT_STEP_BY_STATUS,
  AUTONOMY_BOUNDARIES_NOTICE,
  PilotWorkOrderError,
  resolveCanonicalAgent,
  validatePilotOrderInput,
  assertToolOrActionAllowed,
  runProjectManagerFilter,
  getOrCreateCanonicalPilotOrder,
  getPilotOverview,
  markReadyForApproval,
  approveForExecution,
  startExecution,
  submitHandoff,
  submitForReview,
  approveCompletion,
  returnOrder,
  reopenFromReturned,
  blockOrder,
  unblockOrder,
};
