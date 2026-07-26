"use strict";

// V7.2 Phase C Schritt 1+2 (Auftrag Abschnitt H/K/L, erweitert um Abschnitt
// H "Versionsansicht") – Lese-/Formatierungsschicht für gespeicherte
// Arbeitsauftragsergebnisse. Reine Geschäftslogik (kein HTTP), gleiches
// Trennungsmuster wie work-order-service.js. Erzeugt und ändert NIEMALS ein
// Ergebnis (append-only, siehe work-order-execution-service.js/
// work-order-change-service.js/auth-db.js) – ausschließlich Lesen und
// kundensichere/betreibersichere Projektion.
//
// Schritt 2 ergänzt die Versionsansicht (alle Ergebnisversionen eines
// Arbeitsauftrags, unveränderlich, mit Freigabestatus je Version) sowie
// eine statusabhängige Kunden-Handlungsanweisung (disclaimer/nextStepNote),
// die jetzt auch Änderungswunsch und Freigabe erwähnt statt wie in Schritt 1
// pauschal auf "folgt im nächsten Schritt" zu verweisen.

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

// Beibehalten als Fallback/Standardwert (u. a. für Bestandstests) – die
// tatsächlich angezeigten Texte kommen jetzt statusabhängig aus
// disclaimerForStatus/nextStepNoteForStatus unten.
const RESULT_DISCLAIMER = "Dieses Ergebnis wurde noch nicht vom Kunden freigegeben.";
const RESULT_NEXT_STEP_NOTE =
  "Sie können das Ergebnis ansehen, eine Änderung anfordern oder es freigeben.";

// Auftrag Abschnitt H/K (Schritt 2): der Hinweistext richtet sich nach dem
// tatsächlichen Auftragsstatus, statt wie in Schritt 1 immer denselben
// Platzhaltertext zu zeigen. RESULT_READY ist der einzige Status, in dem
// tatsächlich eine neue Aktion (Änderung anfordern/freigeben) möglich ist
// (siehe work-order-change-service.js#requestChanges/
// work-order-approval-service.js#approveResult, beide verlangen exakt
// diesen Status) – alle anderen Texte sind rein informativ.
function disclaimerForStatus(status) {
  switch (status) {
    case "RESULT_READY":
      return RESULT_DISCLAIMER;
    case "CUSTOMER_APPROVED":
      return "Dieses Ergebnis wurde von Ihnen freigegeben.";
    case "CHANGES_REQUESTED":
      return "Für dieses Ergebnis wurde ein Änderungswunsch gestellt.";
    default:
      return RESULT_DISCLAIMER;
  }
}

function nextStepNoteForStatus(status) {
  switch (status) {
    case "RESULT_READY":
      return RESULT_NEXT_STEP_NOTE;
    case "CUSTOMER_APPROVED":
      return "Es ist derzeit keine weitere Aktion erforderlich.";
    case "CHANGES_REQUESTED":
      return "Eine überarbeitete Ergebnisversion wird erstellt, sobald die Änderung bearbeitet wurde.";
    default:
      return RESULT_NEXT_STEP_NOTE;
  }
}

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

function customerResultView(db, order, result) {
  const approval = authDb.getWorkOrderCustomerApprovalByResultId(db, result.id);
  return {
    workOrderId: order.id,
    workOrderStatus: order.status,
    versionNumber: result.versionNumber,
    title: result.resultTitle,
    summary: result.resultSummary,
    body: result.resultBody,
    qualityStatus: result.qualityStatus,
    qualityStatusLabel: qualityStatusLabel(result.qualityStatus),
    qualityNote: result.qualityNote,
    openPoints: parseOpenPoints(result.openPoints),
    disclaimer: disclaimerForStatus(order.status),
    nextStepNote: nextStepNoteForStatus(order.status),
    isApproved: Boolean(approval),
    approvedAt: approval ? approval.approvedAt : null,
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
  return customerResultView(db, order, result);
}

// ---------------------------------------------------------------------------
// H. Versionsansicht (Auftrag Abschnitt H, Schritt 2): der Kunde kann ALLE
// bisherigen Ergebnisversionen eines Arbeitsauftrags ansehen und
// vergleichen, rein lesend. Jede Version bleibt unveränderlich (Migration
// 10/append-only work_order_results) – diese Funktion erzeugt oder ändert
// nie eine Version, sie liest ausschließlich bereits vorhandene Datensätze.
// ---------------------------------------------------------------------------

function listResultVersionsForCustomer(db, identity, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order || order.tenantId !== identity.tenantId) {
    throw notFound();
  }
  const results = authDb.listWorkOrderResultsForWorkOrder(db, workOrderId);
  return {
    workOrderId: order.id,
    workOrderStatus: order.status,
    versions: results.map((result) => customerResultView(db, order, result)),
  };
}

// Owner-Betriebsansicht (Auftrag Abschnitt N): dieselbe Versionsliste,
// zusätzlich mit approvedByDisplayName (interne Betriebsinformation, kein
// Kundengeheimnis) statt approvalNote-Volltext – gleiches Zurückhaltungs-
// prinzip wie work-order-change-service.js#ownerChangeRequestView.
function ownerResultVersionView(db, result, approval) {
  const approver = approval ? authDb.getUserById(db, approval.approvedByUserId) : null;
  return {
    resultId: result.id,
    versionNumber: result.versionNumber,
    title: result.resultTitle,
    qualityStatus: result.qualityStatus,
    qualityStatusLabel: qualityStatusLabel(result.qualityStatus),
    createdAt: result.createdAt,
    isApproved: Boolean(approval),
    approvedAt: approval ? approval.approvedAt : null,
    approvedByDisplayName: approver ? approver.displayName : null,
  };
}

function listResultVersionsForOwner(db, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  const results = authDb.listWorkOrderResultsForWorkOrder(db, workOrderId);
  return results.map((result) =>
    ownerResultVersionView(db, result, authDb.getWorkOrderCustomerApprovalByResultId(db, result.id)),
  );
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
  listResultVersionsForCustomer,
  listResultVersionsForOwner,
};
