"use strict";

// V7.5 – Unternehmensleitlinien V1.0 als verbindliche Betriebslogik
// (Auftrag Abschnitt H): Hochzuverlässigkeits-Signale.
//
// Eigenständiges, kleines Modul statt Erweiterung von
// agent-hr-coaching-service.js/technology-radar-service.js: ein Signal kann
// wahlweise zu genau einem HR-Vorschlag, zu genau einem Radar-Eintrag oder
// zu keinem von beiden gehören (reiner Agentenbezug) und besitzt einen
// eigenen, von PROPOSED/REVIEWED/APPROVED/... unabhängigen Status-/
// Entscheidungsverlauf (siehe auth-db-migrations.js#agent_reliability_signals).
//
// Dieses Modul importiert KEIN better-sqlite3 selbst (erhält stets ein
// bereits geöffnetes Datenbankobjekt) und führt KEINEN Netzwerkaufruf aus.
//
// Verbindliche Regeln (Auftrag Abschnitt H, nicht verhandelbar):
//   - keine automatische Sanktion
//   - keine automatische Autonomiereduktion
//   - keine dramatisierende Sprache (das Modul selbst formuliert keinen
//     Beobachtungstext – der Aufrufer/Jamal liefert ihn; das Modul prüft
//     ausschließlich Struktur/Länge/Wertebereich)
//   - keine erfundenen Vorfälle (kein Codepfad erzeugt hier automatisch ein
//     Signal ohne expliziten Aufruf)
//   - ein Signal kann präventiv als UNCERTAINTY erfasst werden

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const agentRegistry = require("./agent-registry");

const RELIABILITY_SIGNAL_TYPE_VALUES = Object.freeze([
  "UNCERTAINTY",
  "EARLY_WARNING",
  "DEVIATION",
  "NEAR_MISS",
  "SAFETY_ESCALATION",
]);

const RELIABILITY_SIGNAL_STATUS_VALUES = Object.freeze(["OPEN", "REVIEWED", "MONITORING", "RESOLVED", "ESCALATED"]);

// "OPEN" ist ausschließlich der Anlagestatus – eine Prüfung darf niemals
// zurück auf OPEN setzen (kein stilles Zurücksetzen einer bereits
// begonnenen Prüfung).
const REVIEW_TARGET_STATUS_VALUES = Object.freeze(["REVIEWED", "MONITORING", "RESOLVED", "ESCALATED"]);

const RELIABILITY_SIGNAL_TYPE_LABELS_DE = Object.freeze({
  UNCERTAINTY: "Unsicherheit",
  EARLY_WARNING: "Frühes Warnsignal",
  DEVIATION: "Abweichung",
  NEAR_MISS: "Beinahefehler",
  SAFETY_ESCALATION: "Sicherheitsrelevante Eskalation",
});

const RELIABILITY_SIGNAL_STATUS_LABELS_DE = Object.freeze({
  OPEN: "Offen",
  REVIEWED: "Geprüft",
  MONITORING: "Wird beobachtet",
  RESOLVED: "Abgeschlossen",
  ESCALATED: "Eskaliert",
});

class ReliabilitySignalError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ReliabilitySignalError";
    this.statusCode = statusCode;
  }
}

function badRequest(message) {
  return new ReliabilitySignalError(message, 400);
}

function notFound(message) {
  return new ReliabilitySignalError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function auditSafe(db, { eventType, result, actorUserId, agentId, signalId, hrProposalId, radarItemId, decisionType }) {
  if (!db) return;
  try {
    const metadata = {};
    if (agentId) metadata.agentKey = agentId;
    if (signalId) metadata.signalId = signalId;
    if (hrProposalId) metadata.hrProposalId = hrProposalId;
    if (radarItemId) metadata.radarItemId = radarItemId;
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
    /* Audit darf einen Reliability-Signal-Aufruf niemals zum Absturz bringen. */
  }
}

function rowToSignalView(row) {
  return {
    id: row.id,
    agentId: row.agentId,
    ownerAgentId: row.agentId,
    relatedHrProposalId: row.relatedHrProposalId || null,
    relatedRadarItemId: row.relatedRadarItemId || null,
    signalType: row.signalType,
    signalTypeLabel: RELIABILITY_SIGNAL_TYPE_LABELS_DE[row.signalType] || "UNGEKLÄRT",
    observation: row.observation,
    possibleImpact: row.possibleImpact,
    recommendedReview: row.recommendedReview,
    status: row.status,
    statusLabel: RELIABILITY_SIGNAL_STATUS_LABELS_DE[row.status] || "UNGEKLÄRT",
    jamalDecisionNote: row.jamalDecisionNote || null,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt || null,
    noAutomaticSanction: true,
    noAutonomyChangeApplied: true,
  };
}

// H. Legt EIN Hochzuverlässigkeitssignal lokal an. Kein automatischer
// Aufruf irgendwo im Projekt erzeugt dies selbstständig – ausschließlich
// eine bewusste, explizite Aktion (agent-leadership-routes.js#
// record-reliability-signal).
function recordReliabilitySignal(db, input = {}) {
  if (!input.agentId || !agentRegistry.hasAgentId(input.agentId)) {
    throw badRequest("Ein gültiges agentId aus dem kanonischen Register ist erforderlich.");
  }
  if (!RELIABILITY_SIGNAL_TYPE_VALUES.includes(input.signalType)) {
    throw badRequest("Ein gültiger Signaltyp ist erforderlich.");
  }
  const observation = truncate(input.observation, 500);
  const possibleImpact = truncate(input.possibleImpact, 500);
  const recommendedReview = truncate(input.recommendedReview, 500);
  if (!observation || !possibleImpact || !recommendedReview) {
    throw badRequest("Beobachtung, mögliche Auswirkung und empfohlene Prüfung sind erforderlich.");
  }
  if (input.relatedHrProposalId && !authDb.getAgentHrDailyProposalById(db, input.relatedHrProposalId)) {
    throw badRequest("Der referenzierte HR-Vorschlag wurde nicht gefunden.");
  }
  if (input.relatedRadarItemId && !authDb.getTechnologyRadarItemById(db, input.relatedRadarItemId)) {
    throw badRequest("Der referenzierte Radar-Eintrag wurde nicht gefunden.");
  }

  const now = nowIso(input.now);
  const row = authDb.insertAgentReliabilitySignal(db, {
    id: crypto.randomUUID(),
    agentId: input.agentId,
    relatedHrProposalId: input.relatedHrProposalId || null,
    relatedRadarItemId: input.relatedRadarItemId || null,
    signalType: input.signalType,
    observation,
    possibleImpact,
    recommendedReview,
    status: "OPEN",
    createdAt: now,
  });

  auditSafe(db, {
    eventType: "RELIABILITY_SIGNAL_RECORDED",
    result: "OK",
    actorUserId: input.actorUserId,
    agentId: row.agentId,
    signalId: row.id,
    hrProposalId: row.relatedHrProposalId,
    radarItemId: row.relatedRadarItemId,
  });

  return rowToSignalView(row);
}

// H. Ändert ausschließlich status/jamalDecisionNote/reviewedAt eines
// bestehenden Signals. Löst niemals automatisch eine Sanktion oder
// Autonomiereduktion aus (dafür existiert in dieser Tabelle kein Feld).
function reviewReliabilitySignal(db, input = {}) {
  if (!input.signalId) throw badRequest("signalId ist erforderlich.");
  if (!REVIEW_TARGET_STATUS_VALUES.includes(input.status)) {
    throw badRequest("Ein gültiger Prüfstatus ist erforderlich (REVIEWED, MONITORING, RESOLVED oder ESCALATED).");
  }
  const row = authDb.getAgentReliabilitySignalById(db, input.signalId);
  if (!row) throw notFound("Dieses Hochzuverlässigkeitssignal wurde nicht gefunden.");

  const now = nowIso(input.now);
  const updated = authDb.updateAgentReliabilitySignalReview(db, {
    id: input.signalId,
    status: input.status,
    jamalDecisionNote: input.jamalDecisionNote ? truncate(input.jamalDecisionNote, 500) : row.jamalDecisionNote,
    reviewedAt: now,
  });

  auditSafe(db, {
    eventType: "RELIABILITY_SIGNAL_REVIEWED",
    result: "OK",
    actorUserId: input.actorUserId,
    agentId: row.agentId,
    signalId: row.id,
    decisionType: input.status,
  });

  return rowToSignalView(updated);
}

function listReliabilitySignals(db, filter = {}) {
  const rows = authDb.listAgentReliabilitySignals(db, filter);
  return rows.map(rowToSignalView);
}

module.exports = {
  ReliabilitySignalError,
  RELIABILITY_SIGNAL_TYPE_VALUES,
  RELIABILITY_SIGNAL_STATUS_VALUES,
  RELIABILITY_SIGNAL_TYPE_LABELS_DE,
  RELIABILITY_SIGNAL_STATUS_LABELS_DE,
  recordReliabilitySignal,
  reviewReliabilitySignal,
  listReliabilitySignals,
  rowToSignalView,
};
