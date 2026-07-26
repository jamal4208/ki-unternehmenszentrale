"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt G/J) – Kundenfreigabe eines
// vorliegenden Ergebnisses (work_order_customer_approvals, Migration 11).
//
// Gleiches Trennungsmuster wie work-order-service.js/work-order-change-
// service.js: reine Geschäftslogik, kennt weder HTTP noch Request-/
// Response-Objekte. Persistenz ausschließlich über auth-db.js.
//
// Verbindliche Produktregel (Auftrag): ausschließlich der Kunde darf ein
// Ergebnis fachlich freigeben. Der OWNER darf nicht freigeben, nicht
// ablehnen und keine Änderungen im Namen des Kunden anfordern – dieses
// Modul exportiert bewusst KEINE Owner-Freigabefunktion. Die Freigabe löst
// keine Veröffentlichung, keine externe Provideraktion und kein Billing
// aus (reiner interner Statuswechsel plus append-only Freigabeprotokoll).

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");

class WorkOrderApprovalError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "WorkOrderApprovalError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function notFound(message) {
  return new WorkOrderApprovalError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function conflict(message) {
  return new WorkOrderApprovalError(409, "CONFLICT", message || "Aktion steht im Widerspruch zum aktuellen Zustand.");
}

function badRequest(message) {
  return new WorkOrderApprovalError(400, "BAD_REQUEST", message || "Anfrage ungültig.");
}

function nowIso() {
  return new Date().toISOString();
}

const APPROVAL_NOTE_MAX = 1000;

function sanitizeApprovalNote(input) {
  const raw = input && input.approvalNote;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.length > APPROVAL_NOTE_MAX) {
    throw badRequest(`Die Freigabenotiz darf höchstens ${APPROVAL_NOTE_MAX} Zeichen lang sein.`);
  }
  return trimmed;
}

function auditSafe(db, { eventType, result, actorUserId, tenantId, workOrderId, resultId, resultVersion, statusTransition }) {
  if (!db) return;
  try {
    const metadata = {};
    if (workOrderId) metadata.workOrderId = workOrderId;
    if (resultId) metadata.resultId = resultId;
    if (resultVersion) metadata.resultVersion = resultVersion;
    if (statusTransition) metadata.statusTransition = statusTransition;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: tenantId || null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf eine Freigabeaktion niemals zum Absturz bringen. */
  }
}

// Fremde/unbekannte Auftrag-ID: identisches generisches 404 wie
// work-order-service.js#getForCustomer (keine Existenzbestätigung).
function getOrderForCustomerOrThrow(db, identity, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order || order.tenantId !== identity.tenantId) {
    if (order) {
      auditSafe(db, {
        eventType: "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
        result: "DENIED",
        actorUserId: identity.userId,
        tenantId: identity.tenantId,
        workOrderId: order.id,
      });
    }
    throw notFound();
  }
  return order;
}

// ---------------------------------------------------------------------------
// G. Kundenfreigabe (Auftrag Abschnitt G/J). Bezieht sich AUSSCHLIESSLICH auf
// die aktuell gültige (neueste) Ergebnisversion – der Aufrufer kann keine
// beliebige/veraltete Version übergeben (es gibt bewusst keinen
// resultId-Parameter in der Eingabe), womit eine Freigabe einer veralteten
// Version bereits strukturell ausgeschlossen ist.
// ---------------------------------------------------------------------------

function approveResult(db, identity, workOrderId, input) {
  const order = getOrderForCustomerOrThrow(db, identity, workOrderId);
  if (order.status !== "RESULT_READY") {
    throw conflict("Dieses Ergebnis kann derzeit nicht freigegeben werden.");
  }
  const latestResult = authDb.getLatestWorkOrderResultForWorkOrder(db, workOrderId);
  if (!latestResult) {
    throw conflict("Für diesen Arbeitsauftrag liegt noch kein Ergebnis vor.");
  }
  const approvalNote = sanitizeApprovalNote(input);

  const now = nowIso();
  let updatedOrder;
  let approval;
  try {
    const outcome = authDb.withAuthTransaction(db, () => {
      const existingApproval = authDb.getWorkOrderCustomerApprovalByResultId(db, latestResult.id);
      if (existingApproval) {
        throw conflict("Diese Ergebnisversion wurde bereits freigegeben.");
      }
      const orderAfterTransition = authDb.transitionWorkOrder(db, workOrderId, {
        tenantId: order.tenantId,
        fromStatuses: ["RESULT_READY"],
        toStatus: "CUSTOMER_APPROVED",
        statusNote: null,
        decidedByUserId: null,
        now,
      });
      if (!orderAfterTransition) {
        throw conflict("Dieses Ergebnis kann derzeit nicht freigegeben werden.");
      }
      const createdApproval = authDb.createWorkOrderCustomerApproval(db, {
        workOrderId: order.id,
        tenantId: order.tenantId,
        resultId: latestResult.id,
        approvedByUserId: identity.userId,
        approvalVersion: latestResult.versionNumber,
        approvalNote,
        now,
      });
      return { orderAfterTransition, createdApproval };
    });
    updatedOrder = outcome.orderAfterTransition;
    approval = outcome.createdApproval;
  } catch (error) {
    if (error instanceof WorkOrderApprovalError) throw error;
    throw conflict("Diese Ergebnisversion wurde bereits freigegeben.");
  }

  auditSafe(db, {
    eventType: "WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    resultId: latestResult.id,
    resultVersion: latestResult.versionNumber,
    statusTransition: "RESULT_READY->CUSTOMER_APPROVED",
  });

  const approver = authDb.getUserById(db, identity.userId);
  return {
    workOrder: { id: updatedOrder.id, status: updatedOrder.status },
    approval: {
      resultId: approval.resultId,
      approvalVersion: approval.approvalVersion,
      approvalNote: approval.approvalNote,
      approvedAt: approval.approvedAt,
      approvedByDisplayName: approver ? approver.displayName : "Unbekannt",
    },
  };
}

// ---------------------------------------------------------------------------
// Lesefunktionen (Auftrag Abschnitt H/N).
// ---------------------------------------------------------------------------

function getApprovalForResult(db, resultId) {
  return authDb.getWorkOrderCustomerApprovalByResultId(db, resultId);
}

// Owner-Betriebsansicht (Auftrag Abschnitt N) – ausschließlich Lesen, kein
// approvalNote-Volltext nötig für die Betriebsübersicht, aber unschädlich
// (Kundentext, kein Systemgeheimnis) – dennoch bewusst weggelassen, um die
// Owner-Ansicht knapp auf Statusinformationen zu beschränken.
function listApprovalsForOwner(db, workOrderId) {
  return authDb.listWorkOrderCustomerApprovalsForWorkOrder(db, workOrderId).map((approval) => ({
    resultId: approval.resultId,
    approvalVersion: approval.approvalVersion,
    approvedAt: approval.approvedAt,
  }));
}

module.exports = {
  WorkOrderApprovalError,
  APPROVAL_NOTE_MAX,
  approveResult,
  getApprovalForResult,
  listApprovalsForOwner,
};
