"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt D/H/I/J) – kontrollierte
// Übergabe eines READY_FOR_PROCESSING-Arbeitsauftrags an die interne
// Agentenzentrale und Erzeugung eines prüfbaren internen Ergebnisses.
//
// Gleiches Trennungsmuster wie work-order-service.js: reine Geschäftslogik,
// kennt weder HTTP noch Request-/Response-Objekte. Persistenz ausschließlich
// über auth-db.js; dieses Modul importiert NIEMALS better-sqlite3 selbst.
//
// Startlogik (Auftrag Abschnitt H, Architekturentscheidung): der Lauf wird
// in diesem Schritt AUSSCHLIESSLICH über eine kontrollierte Owner-Aktion
// gestartet ("Technischen Agentenlauf starten"), NICHT automatisch bei
// READY_FOR_PROCESSING. Begründung: work-order-routes.test.js/
// work-order-security.test.js/work-order-ui.test.js prüfen bereits fest,
// dass ein frisch angelegter Auftrag SOFORT (innerhalb derselben Anfrage)
// mit Status READY_FOR_PROCESSING zurückkommt – ein automatischer,
// synchroner Agentenlauf innerhalb von createForCustomer() würde entweder
// diese bestehenden, nicht abzuschwächenden Prüfungen brechen ODER einen
// asynchronen Hintergrundprozess/eine Warteschlange erfordern, was dem
// Auftrag widerspricht ("keine künstliche Modulvermehrung", "Qualität vor
// Geschwindigkeit", reproduzierbarer synchroner Lauf ohne Polling). Die
// hier exportierte Funktion `startRunForWorkOrder` kennt keinen HTTP-Owner
// und keinen HTTP-Kontext – sie ist bewusst so geschnitten, dass ein
// späterer automatischer Trigger (z. B. direkt nach der automatischen
// Vollständigkeitsregel) dieselbe Funktion mit actorUserId = null
// aufrufen kann, ohne dieses Modul zu ändern (Auftrag Abschnitt H:
// "dieselbe Servicefunktion muss später automatisierbar sein").
//
// Synchrones Ausführungsmodell (Auftrag Abschnitt B.8: reproduzierbar ohne
// externe Tools): die gesamte Fachagenten-/Qualitätsagentenarbeit in
// work-order-agent-orchestrator.js ist eine reine, deterministische
// Funktion ohne I/O. Es gibt daher bewusst KEINE Warteschlange, KEIN
// Polling, KEIN asynchrones Fortschritts-Tracking – ein Lauf beginnt und
// endet innerhalb derselben Anfrage.

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const businessUsePolicy = require("./business-use-policy");
const orchestrator = require("./work-order-agent-orchestrator");

class WorkOrderExecutionError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "WorkOrderExecutionError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function notFound(message) {
  return new WorkOrderExecutionError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function conflict(message) {
  return new WorkOrderExecutionError(409, "CONFLICT", message || "Aktion steht im Widerspruch zum aktuellen Zustand.");
}

function badRequest(message) {
  return new WorkOrderExecutionError(400, "BAD_REQUEST", message || "Anfrage ungültig.");
}

function nowIso() {
  return new Date().toISOString();
}

// Identisches fail-closed-Auditmuster wie work-order-service.js#auditSafe,
// erweitert um runId/agentKey/failureCode (Auftrag Abschnitt N). Niemals
// Auftragstext, Ergebnistext, Systemprompts oder Chain-of-Thought.
function auditSafe(db, { eventType, result, actorUserId, tenantId, workOrderId, runId, agentKey, statusTransition, reasonCode, severity, failureCode }) {
  if (!db) return;
  try {
    const metadata = {};
    if (workOrderId) metadata.workOrderId = workOrderId;
    if (runId) metadata.runId = runId;
    if (agentKey) metadata.agentKey = agentKey;
    if (statusTransition) metadata.statusTransition = statusTransition;
    if (reasonCode) metadata.reasonCode = reasonCode;
    if (severity) metadata.severity = severity;
    if (failureCode) metadata.failureCode = failureCode;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: tenantId || null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf eine Laufaktion niemals zum Absturz bringen. */
  }
}

const RUNNABLE_FROM_STATUS = "READY_FOR_PROCESSING";

// Generische, geheimnisfreie Kundenmeldung bei BLOCK (Auftrag Abschnitt J:
// "generische Kundenaussage") – nennt niemals Kategorie oder Textauszug.
const GENERIC_BLOCKED_MESSAGE =
  "Dieser Auftrag kann derzeit nicht bearbeitet werden. Bitte wenden Sie sich bei Fragen an die Zentrale.";

// Identische Zuordnung wie work-order-service.js#actionTakenFor
// (SAFETY_ENFORCEMENT_MODEL.md Abschnitt 4).
function actionTakenFor(gateResult) {
  if (gateResult.decision === "BLOCK") {
    return gateResult.severity === "CRITICAL" ? "LICENSE_REVIEW_REQUIRED" : "BLOCKED";
  }
  return "ESCALATED";
}

function fieldsFromOrder(order) {
  return {
    title: order.title,
    desiredResult: order.desiredResult,
    context: order.context,
    deadlineText: order.deadlineText,
  };
}

// ---------------------------------------------------------------------------
// Owner-/Betriebsansicht eines Laufs (Auftrag Abschnitt M) – ausschließlich
// technische Felder, keine Systemprompts, keine Chain-of-Thought, keine
// Safety-Details, keine Providerdaten.
// ---------------------------------------------------------------------------

function runAgentOwnerView(agent) {
  return {
    agentKey: agent.agentKey,
    agentRole: agent.agentRole,
    sequenceNumber: agent.sequenceNumber,
    selectionReason: agent.selectionReason,
    status: agent.status,
    startedAt: agent.startedAt,
    completedAt: agent.completedAt,
  };
}

function runOwnerView(db, run) {
  const agents = authDb.listWorkOrderRunAgents(db, run.id).map(runAgentOwnerView);
  const result = authDb.getWorkOrderResultByRunId(db, run.id);
  return {
    id: run.id,
    workOrderId: run.workOrderId,
    runNumber: run.runNumber,
    status: run.status,
    orchestratorVersion: run.orchestratorVersion,
    failureCode: run.failureCode,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failedAt: run.failedAt,
    createdAt: run.createdAt,
    agents,
    qualityStatus: result ? result.qualityStatus : null,
  };
}

// ---------------------------------------------------------------------------
// Laufstart (Auftrag Abschnitt C/H/I/J). Einziger Einstiegspunkt für einen
// neuen Lauf – wird in diesem Schritt ausschließlich vom Owner-Endpunkt
// `POST /api/owner/work-orders/:id/run` aufgerufen (actorUserId gesetzt).
// ---------------------------------------------------------------------------

function startRunForWorkOrder(db, actorUserId, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }

  // Idempotenz-/Parallelitätsschutz (Auftrag Abschnitt I): niemals zwei
  // aktive Läufe für denselben Auftrag. Da better-sqlite3 synchron
  // arbeitet und dieser gesamte Funktionskörper ohne await ausgeführt
  // wird, kann zwischen dieser Prüfung und der Laufanlage weiter unten
  // (innerhalb derselben Transaktion) kein weiterer Prozess dazwischen
  // schreiben.
  const existingActiveRun = authDb.getActiveWorkOrderRunForWorkOrder(db, workOrderId);
  if (existingActiveRun) {
    throw conflict("Für diesen Auftrag läuft bereits ein aktiver Lauf.");
  }

  if (order.status !== RUNNABLE_FROM_STATUS) {
    throw conflict("Dieser Auftrag kann derzeit keinen Lauf starten.");
  }

  const fields = fieldsFromOrder(order);

  // Safety-Gate Nr. 2 (Auftrag Abschnitt J) – direkt vor Agentenausführung,
  // zusätzlich zur bereits beim Einreichen erfolgten Prüfung in
  // work-order-service.js#enforceBusinessUsePolicy.
  const gateResult = businessUsePolicy.evaluateWorkOrderContent(fields);

  if (gateResult.decision === "BLOCK") {
    authDb.recordPolicyViolation(db, {
      tenantId: order.tenantId,
      userId: order.createdByUserId,
      workOrderId: order.id,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
      actionTaken: actionTakenFor(gateResult),
    });
    auditSafe(db, {
      eventType: "WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY",
      result: "DENIED",
      actorUserId,
      tenantId: order.tenantId,
      workOrderId: order.id,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
    });
    throw badRequest(GENERIC_BLOCKED_MESSAGE);
  }

  if (gateResult.decision === "ESCALATE") {
    const updatedOrder = authDb.transitionWorkOrder(db, workOrderId, {
      tenantId: order.tenantId,
      fromStatuses: [RUNNABLE_FROM_STATUS],
      toStatus: "ESCALATED",
      statusNote: null,
      decidedByUserId: null,
    });
    if (!updatedOrder) {
      throw conflict("Dieser Auftrag kann derzeit keinen Lauf starten.");
    }
    authDb.recordPolicyViolation(db, {
      tenantId: order.tenantId,
      userId: order.createdByUserId,
      workOrderId: order.id,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
      actionTaken: actionTakenFor(gateResult),
    });
    auditSafe(db, {
      eventType: "WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY",
      result: "OK",
      actorUserId,
      tenantId: order.tenantId,
      workOrderId: order.id,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
      statusTransition: `${RUNNABLE_FROM_STATUS}->ESCALATED`,
    });
    return { started: false, workOrderStatus: "ESCALATED", run: null };
  }

  // ALLOW: Lauf anlegen und Auftrag auf IN_PROGRESS setzen – eine einzelne
  // atomare Transaktion (gleiches Muster wie work-order-service.js), damit
  // niemals ein Lauf ohne passenden Auftragsstatus (oder umgekehrt)
  // entsteht.
  const startedAt = nowIso();
  const outcome = authDb.withAuthTransaction(db, () => {
    const raceRun = authDb.getActiveWorkOrderRunForWorkOrder(db, workOrderId);
    if (raceRun) {
      throw conflict("Für diesen Auftrag läuft bereits ein aktiver Lauf.");
    }
    const createdRun = authDb.createWorkOrderRun(db, {
      workOrderId,
      tenantId: order.tenantId,
      status: "IN_PROGRESS",
      orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
      startedAt,
      now: startedAt,
    });
    const orderAfterTransition = authDb.transitionWorkOrder(db, workOrderId, {
      tenantId: order.tenantId,
      fromStatuses: [RUNNABLE_FROM_STATUS],
      toStatus: "IN_PROGRESS",
      statusNote: null,
      decidedByUserId: null,
      now: startedAt,
    });
    if (!orderAfterTransition) {
      throw conflict("Dieser Auftrag kann derzeit keinen Lauf starten.");
    }
    return { createdRun, orderAfterTransition };
  });
  const run = outcome.createdRun;
  const updatedOrder = outcome.orderAfterTransition;

  // Zwei Auditfakten für dieselbe atomare Anlage (identisches Muster wie
  // work-order-service.js#createForCustomer: WORK_ORDER_CREATED +
  // WORK_ORDER_SUBMITTED für einen Insert). "PREPARED" dokumentiert, dass
  // der Lauf-Datensatz nun existiert; "STARTED" dokumentiert den
  // tatsächlichen Auftragsstatuswechsel auf IN_PROGRESS.
  auditSafe(db, {
    eventType: "WORK_ORDER_RUN_PREPARED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    runId: run.id,
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_RUN_STARTED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    runId: run.id,
    statusTransition: `${RUNNABLE_FROM_STATUS}->IN_PROGRESS`,
  });

  return executeRun(db, actorUserId, updatedOrder, run, fields);
}

// ---------------------------------------------------------------------------
// Kontrollierte Ausführung (Auftrag Abschnitt D/K) – Projektmanager
// strukturiert, Fachagenten arbeiten (rein textbasiert, deterministisch),
// Qualitätsagent prüft, Ergebnis wird gespeichert. Bei jedem unerwarteten
// Fehler: kontrollierter Fehlerzustand statt stiller Teilverarbeitung
// (Auftrag Abschnitt C: "keine stille Teilverarbeitung").
// ---------------------------------------------------------------------------

function selectionListInOrder(selection) {
  const list = [selection.projectManager, ...selection.specialists, selection.quality];
  return list.map((agent, index) => ({ ...agent, sequenceNumber: index + 1 }));
}

function persistRunAgents(db, runId, orderedAgents, timestamp) {
  return orderedAgents.map((agent) =>
    authDb.createWorkOrderRunAgent(db, {
      runId,
      agentKey: agent.agentKey,
      agentRole: agent.role,
      sequenceNumber: agent.sequenceNumber,
      selectionReason: agent.reason,
      status: "COMPLETED",
      startedAt: timestamp,
      completedAt: timestamp,
    }),
  );
}

function auditAgentsSelected(db, { actorUserId, tenantId, workOrderId, runId, orderedAgents }) {
  orderedAgents.forEach((agent) => {
    auditSafe(db, {
      eventType: "WORK_ORDER_AGENT_SELECTED",
      result: "OK",
      actorUserId,
      tenantId,
      workOrderId,
      runId,
      agentKey: agent.agentKey,
    });
  });
}

// Technischer Fehlercode für Audit/Owner-Ansicht – niemals die rohe
// Fehlermeldung oder ein Stacktrace (Auftrag Abschnitt G/N: "sichere
// Fehler").
const TECHNICAL_FAILURE_CODE = "ORCHESTRATION_ERROR";

function handleTechnicalFailure(db, { actorUserId, order, run }) {
  const failedAt = nowIso();
  authDb.withAuthTransaction(db, () => {
    authDb.transitionWorkOrderRun(db, run.id, {
      fromStatuses: ["IN_PROGRESS"],
      toStatus: "FAILED",
      failedAt,
      failureCode: TECHNICAL_FAILURE_CODE,
      now: failedAt,
    });
    // Zurück auf READY_FOR_PROCESSING (Auftrag Abschnitt I: "FAILED-Lauf
    // darf später neu gestartet werden") statt dauerhaft in IN_PROGRESS
    // hängen zu bleiben.
    authDb.transitionWorkOrder(db, order.id, {
      tenantId: order.tenantId,
      fromStatuses: ["IN_PROGRESS"],
      toStatus: RUNNABLE_FROM_STATUS,
      statusNote: null,
      decidedByUserId: null,
      now: failedAt,
    });
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_RUN_FAILED",
    result: "ERROR",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    runId: run.id,
    failureCode: TECHNICAL_FAILURE_CODE,
  });
  throw new WorkOrderExecutionError(
    500,
    "TECHNICAL_ERROR",
    "Der Agentenlauf konnte technisch nicht abgeschlossen werden. Der Auftrag kann erneut gestartet werden.",
  );
}

function executeRun(db, actorUserId, order, run, fields) {
  let selection;
  let plan;
  let clarificationQuestion;
  try {
    selection = orchestrator.selectAgentsForWorkOrder(fields);
    plan = orchestrator.buildWorkPlan(fields, selection);
    clarificationQuestion = orchestrator.detectMissingInformation(fields);
  } catch (_error) {
    return handleTechnicalFailure(db, { actorUserId, order, run });
  }

  const orderedAgents = selectionListInOrder(selection);
  const timestamp = nowIso();

  if (clarificationQuestion) {
    let finalOrder;
    try {
      authDb.withAuthTransaction(db, () => {
        persistRunAgents(db, run.id, orderedAgents, timestamp);
        authDb.transitionWorkOrderRun(db, run.id, {
          fromStatuses: ["IN_PROGRESS"],
          toStatus: "NEEDS_CLARIFICATION",
          completedAt: timestamp,
          now: timestamp,
        });
        finalOrder = authDb.transitionWorkOrder(db, order.id, {
          tenantId: order.tenantId,
          fromStatuses: ["IN_PROGRESS"],
          toStatus: "NEEDS_CLARIFICATION",
          statusNote: clarificationQuestion,
          decidedByUserId: null,
          now: timestamp,
        });
        if (!finalOrder) {
          throw new Error("Auftragsstatus konnte nicht auf NEEDS_CLARIFICATION gesetzt werden.");
        }
      });
    } catch (_error) {
      return handleTechnicalFailure(db, { actorUserId, order, run });
    }
    auditAgentsSelected(db, { actorUserId, tenantId: order.tenantId, workOrderId: order.id, runId: run.id, orderedAgents });
    // Auftrag Abschnitt N listet neun feste Ereignistypen; eine echte
    // fachliche Rückfrage beendet den Lauf ebenso endgültig wie ein
    // Ergebnis – WORK_ORDER_RUN_COMPLETED dokumentiert hier bewusst "der
    // Lauf ist regulär beendet" (Laufstatus selbst zeigt NEEDS_CLARIFICATION
    // in statusTransition), es gibt kein separates
    // "WORK_ORDER_RUN_NEEDS_CLARIFICATION"-Ereignis.
    auditSafe(db, {
      eventType: "WORK_ORDER_RUN_COMPLETED",
      result: "OK",
      actorUserId,
      tenantId: order.tenantId,
      workOrderId: order.id,
      runId: run.id,
      statusTransition: "IN_PROGRESS->NEEDS_CLARIFICATION",
    });
    return { started: true, workOrderStatus: "NEEDS_CLARIFICATION", run: runOwnerView(db, authDb.getWorkOrderRunById(db, run.id)) };
  }

  let resultDraft;
  let qualityCheck;
  try {
    resultDraft = orchestrator.generateResult(fields, selection);
    qualityCheck = orchestrator.runQualityCheck(fields);
  } catch (_error) {
    return handleTechnicalFailure(db, { actorUserId, order, run });
  }

  let createdResult;
  try {
    authDb.withAuthTransaction(db, () => {
      persistRunAgents(db, run.id, orderedAgents, timestamp);
      createdResult = authDb.createWorkOrderResult(db, {
        workOrderId: order.id,
        runId: run.id,
        tenantId: order.tenantId,
        resultTitle: resultDraft.title,
        resultSummary: resultDraft.summary,
        resultBody: resultDraft.body,
        qualityStatus: qualityCheck.qualityStatus,
        qualityNote: qualityCheck.qualityNote,
        openPoints: qualityCheck.openPoints.length > 0 ? JSON.stringify(qualityCheck.openPoints) : null,
        now: timestamp,
      });
      authDb.transitionWorkOrderRun(db, run.id, {
        fromStatuses: ["IN_PROGRESS"],
        toStatus: "COMPLETED",
        completedAt: timestamp,
        now: timestamp,
      });
      const finalOrder = authDb.transitionWorkOrder(db, order.id, {
        tenantId: order.tenantId,
        fromStatuses: ["IN_PROGRESS"],
        toStatus: "RESULT_READY",
        statusNote: null,
        decidedByUserId: null,
        now: timestamp,
      });
      if (!finalOrder) {
        throw new Error("Auftragsstatus konnte nicht auf RESULT_READY gesetzt werden.");
      }
    });
  } catch (_error) {
    return handleTechnicalFailure(db, { actorUserId, order, run });
  }

  auditAgentsSelected(db, { actorUserId, tenantId: order.tenantId, workOrderId: order.id, runId: run.id, orderedAgents });
  auditSafe(db, {
    eventType: "WORK_ORDER_RESULT_CREATED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    runId: run.id,
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_RUN_COMPLETED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    runId: run.id,
    statusTransition: "IN_PROGRESS->COMPLETED",
  });

  return {
    started: true,
    workOrderStatus: "RESULT_READY",
    run: runOwnerView(db, authDb.getWorkOrderRunById(db, run.id)),
    resultId: createdResult.id,
  };
}

// ---------------------------------------------------------------------------
// Owner-Betriebsansicht (Auftrag Abschnitt H/M) – ausschließlich Lesen,
// keine fachliche Freigabe, keine Ergebnisänderung.
// ---------------------------------------------------------------------------

function listRunsForOwner(db, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  return authDb.listWorkOrderRunsForWorkOrder(db, workOrderId).map((run) => runOwnerView(db, run));
}

function getRunForOwner(db, workOrderId, runId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  const run = authDb.getWorkOrderRunById(db, runId);
  if (!run || run.workOrderId !== order.id) {
    throw notFound();
  }
  return runOwnerView(db, run);
}

module.exports = {
  WorkOrderExecutionError,
  RUNNABLE_FROM_STATUS,
  TECHNICAL_FAILURE_CODE,
  startRunForWorkOrder,
  listRunsForOwner,
  getRunForOwner,
};
