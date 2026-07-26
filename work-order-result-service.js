"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt H/K/L) – Lese-/Formatierungs-
// schicht für gespeicherte Arbeitsauftragsergebnisse. Reine Geschäftslogik
// (kein HTTP), gleiches Trennungsmuster wie work-order-service.js. Erzeugt
// und ändert NIEMALS ein Ergebnis (append-only, siehe
// work-order-execution-service.js/auth-db.js) – ausschließlich Lesen und
// kundensichere/betreibersichere Projektion.

const authDb = require("./auth-db");

class WorkOrderResultError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "WorkOrderResultError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function notFound(message) {
  return new WorkOrderResultError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function conflict(message) {
  return new WorkOrderResultError(409, "CONFLICT", message || "Für diesen Auftrag liegt kein Ergebnis vor.");
}

// Auftrag Abschnitt K: Qualitätsstatus in deutscher Sprache statt
// technischem Enum-Wert.
const QUALITY_STATUS_LABELS = Object.freeze({
  PASSED: "Qualitätsprüfung bestanden",
  PASSED_WITH_NOTES: "Qualitätsprüfung bestanden (mit Hinweisen)",
});

function qualityStatusLabel(status) {
  return QUALITY_STATUS_LABELS[status] || "Unbekannt";
}

const RESULT_DISCLAIMER = "Dieses Ergebnis wurde noch nicht vom Kunden freigegeben.";
const RESULT_NEXT_STEP_NOTE =
  "Sie können das Ergebnis derzeit ansehen. Änderungswünsche und Freigabe folgen im nächsten Schritt.";

function parseOpenPoints(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Kundenansicht (Auftrag Abschnitt H/K/L). Zeigt AUSSCHLIESSLICH die in
// Abschnitt K explizit als kundensichtbar benannten Felder: Ergebnis,
// verständliche Zusammenfassung, Status, Hinweis auf den nächsten Schritt.
// Bewusst KEINE Agentenliste (Abschnitt K nennt "verwendete Agenten" als
// Teil des internen Datensatzes, aber die unmittelbar folgende
// Kundensicht-Aufzählung in Abschnitt K sowie die Portal-UI-Vorgabe in
// Abschnitt L listen keine Agentennamen für den Kunden auf) – das bleibt
// eine reine Owner-Betriebsinformation (work-order-execution-service.js).
// ---------------------------------------------------------------------------

function customerResultView(order, result) {
  return {
    workOrderId: order.id,
    versionNumber: result.versionNumber,
    title: result.resultTitle,
    summary: result.resultSummary,
    body: result.resultBody,
    qualityStatus: result.qualityStatus,
    qualityStatusLabel: qualityStatusLabel(result.qualityStatus),
    qualityNote: result.qualityNote,
    openPoints: parseOpenPoints(result.openPoints),
    disclaimer: RESULT_DISCLAIMER,
    nextStepNote: RESULT_NEXT_STEP_NOTE,
    createdAt: result.createdAt,
  };
}

// Fremde/unbekannte Auftrag-ID: identisches generisches 404 wie
// work-order-service.js#getForCustomer (keine Existenzbestätigung).
function getResultForCustomer(db, identity, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order || order.tenantId !== identity.tenantId) {
    throw notFound();
  }
  const result = authDb.getLatestWorkOrderResultForWorkOrder(db, workOrderId);
  if (!result) {
    throw conflict("Für diesen Auftrag liegt noch kein Ergebnis vor.");
  }
  return customerResultView(order, result);
}

// Optional (Auftrag Abschnitt H): reiner technischer Laufstatus für den
// Kunden, ohne Agenten-/Fehlerdetails (die bleiben Owner-only, siehe
// work-order-execution-service.js#runOwnerView).
function getRunStatusForCustomer(db, identity, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order || order.tenantId !== identity.tenantId) {
    throw notFound();
  }
  const runs = authDb.listWorkOrderRunsForWorkOrder(db, workOrderId);
  const latestRun = runs.length > 0 ? runs[0] : null;
  return {
    workOrderId: order.id,
    workOrderStatus: order.status,
    runNumber: latestRun ? latestRun.runNumber : null,
    runStatus: latestRun ? latestRun.status : null,
    startedAt: latestRun ? latestRun.startedAt : null,
    completedAt: latestRun ? latestRun.completedAt : null,
  };
}

module.exports = {
  WorkOrderResultError,
  QUALITY_STATUS_LABELS,
  RESULT_DISCLAIMER,
  RESULT_NEXT_STEP_NOTE,
  qualityStatusLabel,
  getResultForCustomer,
  getRunStatusForCustomer,
};
