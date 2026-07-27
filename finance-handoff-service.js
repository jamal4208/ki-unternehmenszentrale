"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt N/O).
//
// Sicherer Handoff-Korridor für Finance-/Controlling-Vorbereitung. Baut
// AUSDRÜCKLICH keinen vollwertigen Buchhaltungsagenten und schließt die
// bestehende Capability Gap (agent-organization-service.js#CAPABILITY_GAP,
// Gruppe "Finance und Controlling") nicht – diese Lücke bleibt sichtbar und
// ehrlich dokumentiert (siehe FINANCE_CAPABILITY_GAP_STATUS unten).
//
// executionBlocked ist zusätzlich zur DB-CHECK-Constraint
// (auth-db-migrations.js: "CHECK (executionBlocked = 1)") hier
// programmatisch fixiert: KEIN Codepfad dieses Moduls kann jemals buchen,
// zahlen, eine Rechnung versenden, ein Bankkonto verbinden oder Lexoffice/
// Lexware ansprechen. Dieses Modul importiert KEIN better-sqlite3 selbst
// und führt KEINEN Netzwerkaufruf aus.

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");

const TYPE_VALUES = migrations.FINANCE_HANDOFF_TYPE_VALUES;
const TAX_RELEVANCE_VALUES = migrations.FINANCE_TAX_RELEVANCE_VALUES;
const CONFIDENCE_VALUES = migrations.FINANCE_CONFIDENCE_VALUES;
const APPROVAL_STATUS_VALUES = migrations.FINANCE_HANDOFF_APPROVAL_STATUS_VALUES;
const DATA_SENSITIVITY_VALUES = migrations.DATA_SENSITIVITY_VALUES;

// Auftrag Abschnitt N "Finance-Status" – vier übergeordnete, für die UI
// gedachte Statuswerte. FINANCE_CAPABILITY_GAP_STATUS ist konstant "true":
// V7.6.1 ändert an der fehlenden Finance-Fachrolle nichts.
const FINANCE_STATUS_VALUES = Object.freeze([
  "CAPABILITY_GAP",
  "PREPARATION_ONLY",
  "SPECIALIST_REVIEW_REQUIRED",
  "JAMAL_APPROVAL_REQUIRED",
]);
const FINANCE_CAPABILITY_GAP_STATUS = Object.freeze({
  capabilityGap: true,
  note: "Kein bestehender agent-registry.js-Agent beschreibt eine Budget-/Buchhaltungs-/Controllingfunktion (gleicher Befund wie agent-organization-service.js#CAPABILITY_GAP). V7.6.1 erzeugt keinen 26. Agenten und keinen automatischen Buchhaltungsagenten.",
  currentOverallStatus: "PREPARATION_ONLY",
});

class FinanceHandoffError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "FinanceHandoffError";
    this.statusCode = statusCode;
  }
}
function badRequest(message) {
  return new FinanceHandoffError(message, 400);
}
function notFound(message) {
  return new FinanceHandoffError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}
function truncate(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function determineRequiredSpecialist(type) {
  if (type === "INVOICE_DRAFT" || type === "PAYMENT_PROPOSAL") return "Steuerberatung/Buchhaltung";
  if (type === "ADVISOR_HANDOFF") return "Steuerberatung";
  if (type === "MONTHLY_OVERVIEW" || type === "LIQUIDITY_NOTE") return "Controlling/Steuerberatung";
  return null;
}

function createHandoff(db, input = {}) {
  const type = input.type;
  if (!TYPE_VALUES.includes(type)) {
    throw badRequest(`type muss einer von ${TYPE_VALUES.join(", ")} sein.`);
  }
  const title = truncate(input.title, 200);
  const sourceDescription = truncate(input.sourceDescription, 500);
  if (!title) throw badRequest("title ist erforderlich.");
  if (!sourceDescription) throw badRequest("sourceDescription ist erforderlich.");

  let amount = null;
  if (input.amount !== undefined && input.amount !== null && input.amount !== "") {
    const parsed = Number(input.amount);
    if (!Number.isFinite(parsed)) throw badRequest("amount muss eine Zahl sein, falls angegeben.");
    amount = Math.round(parsed * 100) / 100;
  }

  const taxRelevance = TAX_RELEVANCE_VALUES.includes(input.taxRelevance) ? input.taxRelevance : "UNKNOWN";
  const sensitivity = DATA_SENSITIVITY_VALUES.includes(input.sensitivity) ? input.sensitivity : "MEDIUM";
  const confidence = CONFIDENCE_VALUES.includes(input.confidence) ? input.confidence : "LOW";
  const requiredSpecialist = truncate(input.requiredSpecialist, 200) || determineRequiredSpecialist(type);

  const now = input.now || new Date();
  const record = {
    id: crypto.randomUUID(),
    title,
    type,
    period: truncate(input.period, 50) || null,
    companyIdentity: truncate(input.companyIdentity, 200) || null,
    sourceDescription,
    amount,
    currency: truncate(input.currency, 10) || (amount !== null ? "EUR" : null),
    taxRelevance,
    sensitivity,
    proposedCategory: truncate(input.proposedCategory, 200) || null,
    confidence,
    missingInformation: truncate(input.missingInformation, 500) || null,
    requiredSpecialist,
    approvalStatus: "DRAFT",
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  };
  const inserted = authDb.insertFinanceHandoff(db, record);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "FINANCE_HANDOFF_CREATED",
      result: "OK",
      actorUserId: input.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { financeHandoffId: record.id, financeType: type },
    });
    if (requiredSpecialist) {
      authAudit.recordAuditEvent(db, {
        eventType: "FINANCE_SPECIALIST_REQUIRED",
        result: "OK",
        actorUserId: input.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { financeHandoffId: record.id, financeType: type },
      });
    }
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Anlage nicht rückgängig machen. */
  }

  return rowToHandoffView(inserted);
}

function rowToHandoffView(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    period: row.period,
    companyIdentity: row.companyIdentity,
    sourceDescription: row.sourceDescription,
    amount: row.amount,
    currency: row.currency,
    taxRelevance: row.taxRelevance,
    sensitivity: row.sensitivity,
    proposedCategory: row.proposedCategory,
    confidence: row.confidence,
    missingInformation: row.missingInformation,
    requiredSpecialist: row.requiredSpecialist,
    jamalDecision: row.jamalDecision,
    approvalStatus: row.approvalStatus,
    executionBlocked: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    noRealBookingOrPayment: true,
  };
}

function listHandoffs(db, filter = {}) {
  return authDb.listFinanceHandoffs(db, filter).map(rowToHandoffView);
}

function getHandoffById(db, id) {
  const row = authDb.getFinanceHandoffById(db, id);
  return row ? rowToHandoffView(row) : null;
}

function reviewHandoff(db, options = {}) {
  const handoffId = options.handoffId;
  if (!handoffId) throw badRequest("handoffId ist erforderlich.");
  const row = authDb.getFinanceHandoffById(db, handoffId);
  if (!row) throw notFound("Dieser Finance-Handoff wurde nicht gefunden.");

  const approvalStatus = options.approvalStatus || row.approvalStatus;
  if (!APPROVAL_STATUS_VALUES.includes(approvalStatus)) {
    throw badRequest("Ein gültiger approvalStatus ist erforderlich.");
  }
  const jamalDecision = options.jamalDecision !== undefined ? truncate(options.jamalDecision, 500) || null : row.jamalDecision;

  const now = options.now || new Date();
  const updated = authDb.updateFinanceHandoffReview(db, {
    id: handoffId,
    approvalStatus,
    jamalDecision,
    updatedAt: nowIso(now),
  });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "FINANCE_HANDOFF_REVIEWED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { financeHandoffId: handoffId, approvalStatusCode: approvalStatus },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Prüfung nicht rückgängig machen. */
  }

  return rowToHandoffView(updated);
}

module.exports = {
  TYPE_VALUES,
  TAX_RELEVANCE_VALUES,
  CONFIDENCE_VALUES,
  APPROVAL_STATUS_VALUES,
  FINANCE_STATUS_VALUES,
  FINANCE_CAPABILITY_GAP_STATUS,
  FinanceHandoffError,
  createHandoff,
  listHandoffs,
  getHandoffById,
  reviewHandoff,
};
