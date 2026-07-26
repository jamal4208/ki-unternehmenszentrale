"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt C/D/E/F/J/K) – Kundenänderungs-
// wunsch zu einem vorliegenden Ergebnis UND kontrollierter Revisionslauf.
//
// Gleiches Trennungsmuster wie work-order-execution-service.js: reine
// Geschäftslogik, kennt weder HTTP noch Request-/Response-Objekte.
// Persistenz ausschließlich über auth-db.js; dieses Modul importiert
// NIEMALS better-sqlite3 selbst.
//
// Verbindliche Produktregel (Auftrag): ausschließlich der Kunde darf einen
// Änderungswunsch stellen. Der OWNER erscheint in keiner Funktion dieses
// Moduls als fachlich Handelnder – es gibt bewusst KEINE Owner-Funktion, die
// einen Änderungswunsch anfordert, ablehnt oder bearbeitet.
//
// Wiederverwendung statt Parallelsystem (Auftrag Abschnitt F: "kein
// paralleles zweites System bauen"): der Revisionslauf ruft exakt dieselben
// Orchestrator-Funktionen wie ein regulärer Erstlauf auf
// (work-order-agent-orchestrator.js#selectAgentsForWorkOrder/buildWorkPlan/
// detectMissingInformation/generateResult/runQualityCheck) – OHNE
// Signaturänderung an jenem Modul. Der Änderungswunsch (Kundenangabe) wird
// dafür in ein zusätzliches "context"-Segment der bestehenden
// {title, desiredResult, context, deadlineText}-Feldstruktur eingebettet
// (siehe composeRevisionFields unten), niemals in ein neues Parameterformat.
//
// Synchrones Ausführungsmodell (identisch zu work-order-execution-
// service.js): der gesamte Revisionslauf beginnt und endet innerhalb
// derselben HTTP-Anfrage, kein Polling, keine Warteschlange.

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const businessUsePolicy = require("./business-use-policy");
const orchestrator = require("./work-order-agent-orchestrator");

class WorkOrderChangeError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "WorkOrderChangeError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function notFound(message) {
  return new WorkOrderChangeError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function conflict(message) {
  return new WorkOrderChangeError(409, "CONFLICT", message || "Aktion steht im Widerspruch zum aktuellen Zustand.");
}

function badRequest(message) {
  return new WorkOrderChangeError(400, "BAD_REQUEST", message || "Anfrage ungültig.");
}

function nowIso() {
  return new Date().toISOString();
}

// Identisches fail-closed-Auditmuster wie work-order-execution-service.js#auditSafe.
function auditSafe(db, { eventType, result, actorUserId, tenantId, workOrderId, changeRequestId, runId, resultId, resultVersion, statusTransition, reasonCode, severity, failureCode }) {
  if (!db) return;
  try {
    const metadata = {};
    if (workOrderId) metadata.workOrderId = workOrderId;
    if (changeRequestId) metadata.changeRequestId = changeRequestId;
    if (runId) metadata.runId = runId;
    if (resultId) metadata.resultId = resultId;
    if (resultVersion) metadata.resultVersion = resultVersion;
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
    /* Audit darf eine Änderungswunsch-/Revisionsaktion niemals zum Absturz bringen. */
  }
}

// ---------------------------------------------------------------------------
// Feldvalidierung (Auftrag Abschnitt E: "maximal klar begrenzter Text",
// Pflichtfeld Änderungswunsch, zwei optionale Felder). Bewusst deutlich
// kleinere Grenzen als work-order-service.js#DESIRED_RESULT_MAX/CONTEXT_MAX,
// weil der komponierte Revisionstext (Auftragstext + Änderungswunsch) sonst
// die Feldlängen der generierten Ergebnisversion sprengen könnte (siehe
// composeRevisionFields unten).
// ---------------------------------------------------------------------------

const REQUEST_TEXT_MAX = 2000;
const PRESERVE_TEXT_MAX = 1000;
const IMPORTANT_NOTE_MAX = 500;

function sanitizeChangeRequestFields(input) {
  const requestText = String((input && input.requestText) || "").trim();
  const rawPreserveText = input && input.preserveText;
  const rawImportantNote = input && input.importantNote;
  const preserveText = rawPreserveText === undefined || rawPreserveText === null ? null : String(rawPreserveText).trim() || null;
  const importantNote = rawImportantNote === undefined || rawImportantNote === null ? null : String(rawImportantNote).trim() || null;

  if (!requestText) {
    throw badRequest("Bitte beschreiben Sie den gewünschten Änderungswunsch.");
  }
  if (requestText.length > REQUEST_TEXT_MAX) {
    throw badRequest(`Der Änderungswunsch darf höchstens ${REQUEST_TEXT_MAX} Zeichen lang sein.`);
  }
  if (preserveText && preserveText.length > PRESERVE_TEXT_MAX) {
    throw badRequest(`Der Hinweis "Was soll erhalten bleiben?" darf höchstens ${PRESERVE_TEXT_MAX} Zeichen lang sein.`);
  }
  if (importantNote && importantNote.length > IMPORTANT_NOTE_MAX) {
    throw badRequest(`Der Hinweis "Was ist Ihnen besonders wichtig?" darf höchstens ${IMPORTANT_NOTE_MAX} Zeichen lang sein.`);
  }
  return { requestText, preserveText, importantNote };
}

// ---------------------------------------------------------------------------
// Business-Use-/Safety-Gate-Adapter (Auftrag Abschnitt D/K: Safety-Gate
// greift 1. beim Änderungswunsch, 2. direkt vor dem Revisionslauf, 3. vor
// finaler Ergebnisbereitstellung). business-use-policy.js#evaluateWorkOrderContent
// erwartet dieselbe {title, desiredResult, context, deadlineText}-
// Feldstruktur wie work-order-service.js#sanitizeFields – dieser Adapter
// bildet den Änderungswunsch OHNE Änderung an business-use-policy.js darauf
// ab (kein paralleles zweites Prüfmodul).
// ---------------------------------------------------------------------------

function changeRequestGateFields(order, fields) {
  return {
    title: order.title,
    desiredResult: fields.requestText,
    context: fields.preserveText,
    deadlineText: fields.importantNote,
  };
}

const BLOCKED_BY_POLICY_MESSAGE =
  "Dieser Änderungswunsch kann in dieser Form nicht angenommen werden. Bitte prüfen Sie Ihren Text oder wenden Sie sich bei Fragen an die Zentrale.";

// Identische Zuordnung wie work-order-service.js#actionTakenFor.
function actionTakenFor(gateResult) {
  if (gateResult.decision === "BLOCK") {
    return gateResult.severity === "CRITICAL" ? "LICENSE_REVIEW_REQUIRED" : "BLOCKED";
  }
  return "ESCALATED";
}

// Ein einzelner Gate-Durchlauf an einem der drei vorgesehenen Punkte.
// Wirft bei BLOCK; gibt bei ESCALATE ein Objekt mit escalated:true zurück
// (der Aufrufer versetzt den Auftrag in ESCALATED und bricht kontrolliert
// ab); gibt bei ALLOW null zurück (Aufrufer fährt fort).
function runSafetyGate(db, { order, fields, actorUserId, blockedEventType, escalatedEventType, orderFromStatus }) {
  const gateResult = businessUsePolicy.evaluateWorkOrderContent(changeRequestGateFields(order, fields));

  if (gateResult.decision === "ALLOW") {
    return null;
  }

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
      eventType: blockedEventType,
      result: "DENIED",
      actorUserId,
      tenantId: order.tenantId,
      workOrderId: order.id,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
    });
    throw badRequest(BLOCKED_BY_POLICY_MESSAGE);
  }

  // ESCALATE: der Auftrag wechselt direkt in ESCALATED, kein Revisionslauf,
  // keine neue Ergebnisversion, keine Kundenfreigabe möglich (Auftrag
  // Abschnitt K).
  const updatedOrder = authDb.transitionWorkOrder(db, order.id, {
    tenantId: order.tenantId,
    fromStatuses: [orderFromStatus],
    toStatus: "ESCALATED",
    statusNote: null,
    decidedByUserId: null,
  });
  if (!updatedOrder) {
    throw conflict("Dieser Änderungswunsch kann derzeit nicht angenommen werden.");
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
    eventType: escalatedEventType,
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    reasonCode: gateResult.reasonCode,
    severity: gateResult.severity,
    statusTransition: `${orderFromStatus}->ESCALATED`,
  });
  return { escalated: true, workOrderStatus: "ESCALATED" };
}

// ---------------------------------------------------------------------------
// C/D/E. Änderungswunsch entgegennehmen (Auftrag Abschnitt C/D/E). Nur aus
// RESULT_READY heraus, bezogen auf die aktuell gültige (neueste)
// Ergebnisversion. Safety-Gate Nr. 1 läuft VOR jeder Speicherung.
// ---------------------------------------------------------------------------

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

function requestChanges(db, identity, workOrderId, input) {
  const order = getOrderForCustomerOrThrow(db, identity, workOrderId);
  if (order.status !== "RESULT_READY") {
    throw conflict("Für diesen Arbeitsauftrag kann derzeit kein Änderungswunsch gestellt werden.");
  }
  const latestResult = authDb.getLatestWorkOrderResultForWorkOrder(db, workOrderId);
  if (!latestResult) {
    throw conflict("Für diesen Arbeitsauftrag liegt noch kein Ergebnis vor.");
  }

  const fields = sanitizeChangeRequestFields(input);

  // Safety-Gate Nr. 1 (Auftrag Abschnitt D/K) – beim Änderungswunsch.
  const gateOutcome = runSafetyGate(db, {
    order,
    fields,
    actorUserId: identity.userId,
    blockedEventType: "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY",
    escalatedEventType: "WORK_ORDER_CHANGE_ESCALATED_BY_POLICY",
    orderFromStatus: "RESULT_READY",
  });
  if (gateOutcome) {
    return gateOutcome;
  }

  // ALLOW: Änderungswunsch anlegen und Auftrag auf CHANGES_REQUESTED setzen
  // – eine einzelne atomare Transaktion (gleiches Muster wie
  // work-order-execution-service.js#startRunForWorkOrder), damit niemals ein
  // Änderungswunsch ohne passenden Auftragsstatus (oder umgekehrt) entsteht.
  // Der partielle UNIQUE-Index aus Migration 11 ist eine zusätzliche,
  // datenbankinterne Verteidigungslinie gegen einen zweiten aktiven
  // Änderungswunsch für denselben Auftrag.
  let changeRequest;
  let updatedOrder;
  try {
    const outcome = authDb.withAuthTransaction(db, () => {
      const existingActive = authDb.getActiveWorkOrderChangeRequestForWorkOrder(db, workOrderId);
      if (existingActive) {
        throw conflict("Für diesen Arbeitsauftrag liegt bereits ein aktiver Änderungswunsch vor.");
      }
      const createdChangeRequest = authDb.createWorkOrderChangeRequest(db, {
        workOrderId: order.id,
        tenantId: order.tenantId,
        requestedByUserId: identity.userId,
        basedOnResultId: latestResult.id,
        requestText: fields.requestText,
        preserveText: fields.preserveText,
        importantNote: fields.importantNote,
      });
      const orderAfterTransition = authDb.transitionWorkOrder(db, workOrderId, {
        tenantId: order.tenantId,
        fromStatuses: ["RESULT_READY"],
        toStatus: "CHANGES_REQUESTED",
        statusNote: null,
        decidedByUserId: null,
      });
      if (!orderAfterTransition) {
        throw conflict("Für diesen Arbeitsauftrag kann derzeit kein Änderungswunsch gestellt werden.");
      }
      return { createdChangeRequest, orderAfterTransition };
    });
    changeRequest = outcome.createdChangeRequest;
    updatedOrder = outcome.orderAfterTransition;
  } catch (error) {
    if (error instanceof WorkOrderChangeError) throw error;
    throw conflict("Für diesen Arbeitsauftrag liegt bereits ein aktiver Änderungswunsch vor.");
  }

  auditSafe(db, {
    eventType: "WORK_ORDER_CHANGES_REQUESTED",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    changeRequestId: changeRequest.id,
    resultId: latestResult.id,
    resultVersion: latestResult.versionNumber,
    statusTransition: "RESULT_READY->CHANGES_REQUESTED",
  });

  return startRevisionRun(db, identity.userId, updatedOrder, changeRequest, fields);
}

// ---------------------------------------------------------------------------
// F. Kontrollierter Revisionslauf (Auftrag Abschnitt F/K) – wiederverwendet
// exakt dieselben Orchestrator-Funktionen wie ein regulärer Erstlauf (siehe
// work-order-execution-service.js#executeRun). Safety-Gate Nr. 2 läuft
// direkt vor Aufruf des Orchestrators.
// ---------------------------------------------------------------------------

// Bettet den Änderungswunsch in das bestehende {title, desiredResult,
// context, deadlineText}-Feldformat ein, OHNE orchestrator.js zu ändern.
// desiredResult bleibt das ursprüngliche gewünschte Ergebnis (Kontinuität);
// der Änderungswunsch UND die beiden optionalen Hinweise werden als
// zusätzliche, klar beschriftete Abschnitte an den bestehenden Hintergrund
// angehängt (context ist dadurch nie leer, siehe Kommentar in
// startRevisionRun unten).
function composeRevisionFields(order, changeRequest) {
  const contextParts = [];
  if (order.context) {
    contextParts.push(`Bisheriger Hintergrund (Kundenangabe):\n${order.context}`);
  }
  contextParts.push(`Angeforderte Änderung (Kundenangabe):\n${changeRequest.requestText}`);
  if (changeRequest.preserveText) {
    contextParts.push(`Soll erhalten bleiben (Kundenangabe):\n${changeRequest.preserveText}`);
  }
  if (changeRequest.importantNote) {
    contextParts.push(`Besonders wichtig (Kundenangabe):\n${changeRequest.importantNote}`);
  }
  return {
    title: order.title,
    desiredResult: order.desiredResult,
    context: contextParts.join("\n\n"),
    deadlineText: order.deadlineText,
  };
}

// Ergänzt die deterministische Basisqualitätsprüfung des Orchestrators um
// die für eine Revision zusätzlich verlangten Prüfpunkte (Auftrag Abschnitt
// F: "Änderungswunsch erfüllt? Erhaltenswerte Punkte beibehalten? [...]
// Ergebnis bereit zur erneuten Kundenprüfung?") – rein deterministisch,
// keine KI-Bewertung, gleiches Prinzip wie
// work-order-agent-orchestrator.js#runQualityCheck.
function runRevisionQualityCheck(baseFields, changeRequest, baseQualityCheck) {
  const openPoints = baseQualityCheck.openPoints.slice();
  let qualityNote = `${baseQualityCheck.qualityNote} Der Änderungswunsch wurde bei dieser Überarbeitung berücksichtigt.`;
  if (changeRequest.preserveText) {
    openPoints.push("Bitte prüfen Sie, dass die als erhaltenswert markierten Punkte weiterhin vollständig enthalten sind.");
  }
  return {
    qualityStatus: baseQualityCheck.qualityStatus,
    qualityNote,
    openPoints,
  };
}

const TECHNICAL_FAILURE_CODE = "ORCHESTRATION_ERROR";

// Kontrollierter Fehlerzustand (Auftrag Abschnitt C: "keine stille
// Teilverarbeitung") – identisches Prinzip wie
// work-order-execution-service.js#handleTechnicalFailure: der
// Änderungswunsch wird CANCELLED, der Lauf FAILED, der Auftrag fällt auf
// RESULT_READY zurück (die vorherige, weiterhin gültige Ergebnisversion
// bleibt unverändert abrufbar).
function handleRevisionFailure(db, { actorUserId, order, changeRequest, run, failureCode }) {
  const failedAt = nowIso();
  authDb.withAuthTransaction(db, () => {
    if (run) {
      authDb.transitionWorkOrderRun(db, run.id, {
        fromStatuses: ["IN_PROGRESS"],
        toStatus: "FAILED",
        failedAt,
        failureCode: failureCode || TECHNICAL_FAILURE_CODE,
        now: failedAt,
      });
    }
    authDb.transitionWorkOrderChangeRequest(db, changeRequest.id, {
      fromStatuses: ["SUBMITTED", "IN_PROGRESS"],
      toStatus: "CANCELLED",
      cancelledAt: failedAt,
    });
    authDb.transitionWorkOrder(db, order.id, {
      tenantId: order.tenantId,
      fromStatuses: ["IN_PROGRESS", "CHANGES_REQUESTED"],
      toStatus: "RESULT_READY",
      statusNote: null,
      decidedByUserId: null,
      now: failedAt,
    });
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_CHANGE_REQUEST_FAILED",
    result: "ERROR",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    changeRequestId: changeRequest.id,
    runId: run ? run.id : null,
    failureCode: failureCode || TECHNICAL_FAILURE_CODE,
  });
  throw new WorkOrderChangeError(
    500,
    "TECHNICAL_ERROR",
    "Der Änderungswunsch konnte technisch nicht abgeschlossen werden. Die bisherige Ergebnisversion bleibt gültig.",
  );
}

function startRevisionRun(db, actorUserId, order, changeRequest, fields) {
  // Safety-Gate Nr. 2 (Auftrag Abschnitt D/K) – direkt vor dem
  // Revisionslauf, zusätzlich zum bereits erfolgten Gate Nr. 1 beim
  // Änderungswunsch selbst.
  const gateOutcome = runSafetyGate(db, {
    order,
    fields,
    actorUserId,
    blockedEventType: "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY",
    escalatedEventType: "WORK_ORDER_CHANGE_ESCALATED_BY_POLICY",
    orderFromStatus: "CHANGES_REQUESTED",
  });
  if (gateOutcome) {
    authDb.transitionWorkOrderChangeRequest(db, changeRequest.id, {
      fromStatuses: ["SUBMITTED"],
      toStatus: "CANCELLED",
      cancelledAt: nowIso(),
    });
    return gateOutcome;
  }

  const startedAt = nowIso();
  let run;
  let acceptedChangeRequest;
  try {
    const outcome = authDb.withAuthTransaction(db, () => {
      const existingActiveRun = authDb.getActiveWorkOrderRunForWorkOrder(db, order.id);
      if (existingActiveRun) {
        throw conflict("Für diesen Arbeitsauftrag läuft bereits ein aktiver Lauf.");
      }
      const createdRun = authDb.createWorkOrderRun(db, {
        workOrderId: order.id,
        tenantId: order.tenantId,
        status: "IN_PROGRESS",
        orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
        startedAt,
        now: startedAt,
      });
      const orderAfterTransition = authDb.transitionWorkOrder(db, order.id, {
        tenantId: order.tenantId,
        fromStatuses: ["CHANGES_REQUESTED"],
        toStatus: "IN_PROGRESS",
        statusNote: null,
        decidedByUserId: null,
        now: startedAt,
      });
      if (!orderAfterTransition) {
        throw conflict("Für diesen Änderungswunsch kann derzeit kein Revisionslauf gestartet werden.");
      }
      const changeRequestAfterTransition = authDb.transitionWorkOrderChangeRequest(db, changeRequest.id, {
        fromStatuses: ["SUBMITTED"],
        toStatus: "IN_PROGRESS",
        runId: createdRun.id,
        acceptedAt: startedAt,
      });
      if (!changeRequestAfterTransition) {
        throw conflict("Für diesen Änderungswunsch kann derzeit kein Revisionslauf gestartet werden.");
      }
      return { createdRun, changeRequestAfterTransition };
    });
    run = outcome.createdRun;
    acceptedChangeRequest = outcome.changeRequestAfterTransition;
  } catch (error) {
    if (error instanceof WorkOrderChangeError) throw error;
    throw conflict("Für diesen Änderungswunsch kann derzeit kein Revisionslauf gestartet werden.");
  }

  auditSafe(db, {
    eventType: "WORK_ORDER_CHANGE_REQUEST_STARTED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    changeRequestId: changeRequest.id,
    runId: run.id,
    statusTransition: "CHANGES_REQUESTED->IN_PROGRESS",
  });

  return executeRevisionRun(db, actorUserId, order, acceptedChangeRequest, run);
}

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
      resultId: null,
    });
  });
}

function executeRevisionRun(db, actorUserId, order, changeRequest, run) {
  const revisionFields = composeRevisionFields(order, changeRequest);

  let selection;
  let clarificationQuestion;
  try {
    selection = orchestrator.selectAgentsForWorkOrder(revisionFields);
    orchestrator.buildWorkPlan(revisionFields, selection);
    // Praktisch unerreichbar: revisionFields.context enthält immer
    // mindestens den (Pflicht-)Änderungswunschtext, daher erkennt
    // detectMissingInformation hier nie eine fehlende Grundlage. Der
    // Codepfad bleibt dennoch vorhanden (Auftrag Abschnitt C: die
    // Systemübergangsregel IN_PROGRESS -> NEEDS_CLARIFICATION muss auch für
    // den Revisionslauf technisch existieren).
    clarificationQuestion = orchestrator.detectMissingInformation(revisionFields);
  } catch (_error) {
    return handleRevisionFailure(db, { actorUserId, order, changeRequest, run });
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
        authDb.transitionWorkOrderChangeRequest(db, changeRequest.id, {
          fromStatuses: ["IN_PROGRESS"],
          toStatus: "CANCELLED",
          cancelledAt: timestamp,
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
      return handleRevisionFailure(db, { actorUserId, order, changeRequest, run });
    }
    auditAgentsSelected(db, { actorUserId, tenantId: order.tenantId, workOrderId: order.id, runId: run.id, orderedAgents });
    auditSafe(db, {
      eventType: "WORK_ORDER_CHANGE_REQUEST_FAILED",
      result: "OK",
      actorUserId,
      tenantId: order.tenantId,
      workOrderId: order.id,
      changeRequestId: changeRequest.id,
      runId: run.id,
      statusTransition: "IN_PROGRESS->NEEDS_CLARIFICATION",
    });
    return { started: true, workOrderStatus: "NEEDS_CLARIFICATION" };
  }

  let resultDraft;
  let baseQualityCheck;
  try {
    resultDraft = orchestrator.generateResult(revisionFields, selection);
    baseQualityCheck = orchestrator.runQualityCheck(revisionFields);
  } catch (_error) {
    return handleRevisionFailure(db, { actorUserId, order, changeRequest, run });
  }
  const qualityCheck = runRevisionQualityCheck(revisionFields, changeRequest, baseQualityCheck);

  // Safety-Gate Nr. 3 (Auftrag Abschnitt D/K) – vor finaler
  // Ergebnisbereitstellung. Prüft den soeben erzeugten Ergebnisentwurf
  // erneut gegen dieselbe deterministische Regelbasis (Verteidigung in der
  // Tiefe, gleiche Funktion wie Gate 1/2).
  const finalGateResult = businessUsePolicy.evaluateWorkOrderContent({
    title: resultDraft.title,
    desiredResult: resultDraft.summary,
    context: resultDraft.body,
    deadlineText: null,
  });
  if (finalGateResult.decision === "BLOCK") {
    authDb.recordPolicyViolation(db, {
      tenantId: order.tenantId,
      userId: order.createdByUserId,
      workOrderId: order.id,
      reasonCode: finalGateResult.reasonCode,
      severity: finalGateResult.severity,
      actionTaken: actionTakenFor(finalGateResult),
    });
    return handleRevisionFailure(db, {
      actorUserId,
      order,
      changeRequest,
      run,
      failureCode: "BLOCKED_BEFORE_DELIVERY",
    });
  }
  if (finalGateResult.decision === "ESCALATE") {
    authDb.recordPolicyViolation(db, {
      tenantId: order.tenantId,
      userId: order.createdByUserId,
      workOrderId: order.id,
      reasonCode: finalGateResult.reasonCode,
      severity: finalGateResult.severity,
      actionTaken: actionTakenFor(finalGateResult),
    });
    return handleRevisionFailure(db, {
      actorUserId,
      order,
      changeRequest,
      run,
      failureCode: "ESCALATED_BEFORE_DELIVERY",
    });
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
      authDb.transitionWorkOrderChangeRequest(db, changeRequest.id, {
        fromStatuses: ["IN_PROGRESS"],
        toStatus: "COMPLETED",
        resultingResultId: createdResult.id,
        completedAt: timestamp,
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
    return handleRevisionFailure(db, { actorUserId, order, changeRequest, run });
  }

  auditAgentsSelected(db, { actorUserId, tenantId: order.tenantId, workOrderId: order.id, runId: run.id, orderedAgents });
  auditSafe(db, {
    eventType: "WORK_ORDER_RESULT_VERSION_CREATED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    changeRequestId: changeRequest.id,
    runId: run.id,
    resultId: createdResult.id,
    resultVersion: createdResult.versionNumber,
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_CHANGE_REQUEST_COMPLETED",
    result: "OK",
    actorUserId,
    tenantId: order.tenantId,
    workOrderId: order.id,
    changeRequestId: changeRequest.id,
    runId: run.id,
    statusTransition: "IN_PROGRESS->RESULT_READY",
  });

  return { started: true, workOrderStatus: "RESULT_READY", resultId: createdResult.id, resultVersion: createdResult.versionNumber };
}

// ---------------------------------------------------------------------------
// Lesefunktionen (Auftrag Abschnitt H): eigene Änderungswünsche des Kunden.
// ---------------------------------------------------------------------------

function customerChangeRequestView(changeRequest) {
  return {
    id: changeRequest.id,
    requestText: changeRequest.requestText,
    preserveText: changeRequest.preserveText,
    importantNote: changeRequest.importantNote,
    status: changeRequest.status,
    basedOnResultId: changeRequest.basedOnResultId,
    resultingResultId: changeRequest.resultingResultId,
    createdAt: changeRequest.createdAt,
    acceptedAt: changeRequest.acceptedAt,
    completedAt: changeRequest.completedAt,
    cancelledAt: changeRequest.cancelledAt,
  };
}

function listChangeRequestsForCustomer(db, identity, workOrderId) {
  const order = getOrderForCustomerOrThrow(db, identity, workOrderId);
  return authDb.listWorkOrderChangeRequestsForWorkOrder(db, order.id).map(customerChangeRequestView);
}

// ---------------------------------------------------------------------------
// Owner-Betriebsansicht (Auftrag Abschnitt N) – ausschließlich Lesen, keine
// Aktion. Rein technische/statusbezogene Felder, kein Ergebnistext im
// Übermaß (requestText selbst ist Kundentext, kein Systemgeheimnis, bleibt
// aber auf die Betriebsübersicht beschränkt – identisches Prinzip wie
// work-order-service.js#ownerView, das ebenfalls Kundentext zeigt).
// ---------------------------------------------------------------------------

function ownerChangeRequestView(changeRequest) {
  return {
    id: changeRequest.id,
    status: changeRequest.status,
    requestText: changeRequest.requestText,
    basedOnResultId: changeRequest.basedOnResultId,
    resultingResultId: changeRequest.resultingResultId,
    runId: changeRequest.runId,
    createdAt: changeRequest.createdAt,
    acceptedAt: changeRequest.acceptedAt,
    completedAt: changeRequest.completedAt,
    cancelledAt: changeRequest.cancelledAt,
  };
}

function listChangeRequestsForOwner(db, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  return authDb.listWorkOrderChangeRequestsForWorkOrder(db, workOrderId).map(ownerChangeRequestView);
}

module.exports = {
  WorkOrderChangeError,
  REQUEST_TEXT_MAX,
  PRESERVE_TEXT_MAX,
  IMPORTANT_NOTE_MAX,
  requestChanges,
  listChangeRequestsForCustomer,
  listChangeRequestsForOwner,
};
