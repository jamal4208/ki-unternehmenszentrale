"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Schritt 1: Canva als
// erster Produktionskorridor (Auftrag Abschnitt C/F/G/H/J/K).
//
// Statusführung, Persistenz (über auth-db.js, Migration 13) und der
// kontrollierte (Stub-)Connectoraufruf für Jamals internen Arbeitsmodus.
// Dieses Modul importiert KEIN better-sqlite3 selbst (erhält stets ein
// bereits geöffnetes Datenbankobjekt, gleiches Prinzip wie
// jamal-work-mode-store.js/work-order-execution-service.js) und kennt
// KEINE Auth-Rollen/Mandanten (ausschließlich Jamal/OWNER – die Rollenprüfung
// selbst lebt in route-access-policy.js, nicht hier).
//
// Wichtig (Auftrag Leitprinzipien):
//   - Der Canva-Korridor gilt ausschließlich für Jamals internen
//     Arbeitsmodus (Auftrag Abschnitt C) – kein Kundenzugriff auf Jamals
//     Canva-Konto, keine Kundenrolle kennt dieses Modul.
//   - Externer Werkzeugaufruf ist eine Produktionshandlung, KEINE
//     Veröffentlichung: publicationLocked bleibt immer true, es gibt keine
//     Publish-/Social-Media-/Billing-Aktion.
//   - Kein echter Connectoraufruf ohne explizite Freigabe
//     (APPROVED_FOR_HANDOFF), keine automatische Wiederholung mit Kosten,
//     kein stiller Fallback auf einen anderen Provider.
//   - Alte Briefingrevisionen bleiben unverändert nachvollziehbar
//     (siehe auth-db.js#upsertJamalCanvaProduction-Kopfkommentar).
//
// Architekturabgleich (V7.4 Architektur-/Baseline-Abgleich vor Commit):
// Gemeinsame Kernarchitektur statt zweier Canva-Systeme, wo dies eine
// tatsächlich identische Aufgabe ist – getrennt, wo es zwei unterschiedliche
// Produktprozesse sind:
//   - GETEILT: die Ergebnis-/Linkvalidierung kommt ausschließlich aus dem
//     bestehenden Canva-Kern (canva-design-result.js#validateResultReferenceUrl,
//     siehe startHandoff() unten) – keine zweite Implementierung dieser
//     sicherheitskritischen Prüfung.
//   - BEWUSST GETRENNT: Persistenz (dieses Modul nutzt die bereits für den
//     gesamten Arbeitsmodus verwendete SQLite-Datenbank statt der
//     dateisystembasierten JSON-Ablage aus canva-store.js, die für den
//     mandantenfähigen Kunden-/Agenturbetrieb gebaut ist), Statusmodell
//     (bewusst einstufiger Owner-Freigabeprozess statt des siebenstufigen
//     Kunden-/Agenturprozesses) und Revisionsverfolgung (einfache
//     revisionNumber statt der mandantengebundenen changeRequestHistory aus
//     canva-pilot-result-record.js). Keine Vermischung von Kundenmandanten
//     mit Jamals Owner-Modus.
//   - GEMEINSAME CONNECTOR-SCHNITTSTELLE FÜR SPÄTER: weder canva-connector.js
//     (bereitet nur ein Hand-off-Payload für eine manuelle Aktion in Jamals
//     authentifizierter Canva-Sitzung vor) noch dieses Modul rufen heute
//     echt einen Canva-Server auf. startHandoff() unten kapselt die künftige
//     reale Aktion hinter genau einer injizierbaren Schnittstelle:
//       async function connector(payload) ->
//         { providerStatus, canvaDesignId, designTitle, editLink, viewLink }
//         | wirft bei Providerfehler
//     Ein späterer echter, programmatischer Canva-Client sollte an dieser
//     einen Stelle angeschlossen werden, statt einen zweiten echten
//     Provideradapter parallel zu canva-connector.js zu bauen.

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const briefing = require("./jamal-canva-briefing");
const canvaDesignResult = require("./canva-design-result");

class JamalCanvaProductionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "JamalCanvaProductionError";
    this.statusCode = statusCode;
  }
}

function conflict(message) {
  return new JamalCanvaProductionError(message, 409);
}

function badRequest(message) {
  return new JamalCanvaProductionError(message, 400);
}

// Zustände, in denen bereits eine externe Aktion läuft oder ein Ergebnis
// auf eine Jamal-Entscheidung wartet – hier ist weder ein erneutes
// "Briefing vorbereiten" noch ein zweiter Handoff zulässig (Auftrag
// Abschnitt H: "kein paralleler Handoff", "doppelter Start blockiert").
// WICHTIG: "NEEDS_REVISION" gehört bewusst NICHT hierher – requestRevision()
// unten markiert die alte Revision zuerst als NEEDS_REVISION und ruft
// anschließend, innerhalb desselben Aufrufs, prepareBriefing() für exakt
// diesen Arbeitswunsch erneut auf, um die neue Revision zu erzeugen; eine
// NEEDS_REVISION-Revision ist danach ohnehin nur noch Teil der Historie
// (siehe getCanvaSafeView), niemals mehr die aktuelle Revision.
const IN_FLIGHT_STATUSES = Object.freeze([
  "APPROVED_FOR_HANDOFF",
  "HANDOFF_STARTED",
  "WAITING_FOR_CANVA",
  "RESULT_RECEIVED",
]);

// Zustände VOR jedem Handoff – ein erneutes "Briefing vorbereiten"
// aktualisiert dieselbe Revision (kein neuer Datensatz, keine neue
// Revisionsnummer), weil noch keine externe Aktion stattgefunden hat.
const RE_PREPARABLE_STATUSES = Object.freeze(["DRAFT", "READY_FOR_APPROVAL", "BLOCKED"]);

// Abgeschlossene Zustände – ein erneutes "Briefing vorbereiten" beginnt
// bewusst eine NEUE Revision (Auftrag Abschnitt K: "Revisionsnummer wird
// erhöht", "keine stille Überschreibung").
const TERMINAL_STATUSES = Object.freeze(["ACCEPTED_INTERNAL", "FAILED", "CANCELLED"]);

// Eine bereits gestartete oder freigegebene Übergabe kann nicht mehr
// "weggeklickt" werden (Auftrag Abschnitt H: kontrollierte Fehlerbehandlung
// statt stiller Abbruch mitten im Connectoraufruf) – sie muss entweder
// erfolgreich enden (RESULT_RECEIVED) oder als FAILED landen.
const NON_CANCELLABLE_IN_FLIGHT_STATUSES = Object.freeze(["APPROVED_FOR_HANDOFF", "HANDOFF_STARTED", "WAITING_FOR_CANVA"]);

const CANVA_STATUS_LABELS_DE = Object.freeze({
  DRAFT: "Entwurf",
  READY_FOR_APPROVAL: "Bereit zur Freigabe",
  APPROVED_FOR_HANDOFF: "Für Übergabe freigegeben",
  HANDOFF_STARTED: "Übergabe gestartet",
  WAITING_FOR_CANVA: "Warte auf Canva",
  RESULT_RECEIVED: "Ergebnis erhalten",
  NEEDS_REVISION: "Überarbeitung angefordert",
  ACCEPTED_INTERNAL: "Intern als passend markiert",
  FAILED: "Fehlgeschlagen",
  CANCELLED: "Abgebrochen",
  BLOCKED: "Blockiert",
});

const CANVA_QUALITY_LABELS_DE = Object.freeze({
  PASSED: "Ohne Einschränkung geprüft",
  PASSED_WITH_NOTES: "Geprüft, mit Hinweisen",
  REVISION_REQUIRED: "Überarbeitung erforderlich",
  BLOCKED: "Blockiert",
});

const CANVA_SUITABILITY_LABELS_DE = Object.freeze({
  CANVA_RECOMMENDED: "Canva ist für dieses Ergebnis geeignet.",
  CANVA_OPTIONAL: "Canva könnte für dieses Ergebnis passen.",
  CANVA_NOT_SUITABLE: "Canva ist für dieses Ergebnis nicht geeignet.",
  CANVA_BLOCKED_BY_POLICY: "Dieser Auftrag ist für eine externe Produktion gesperrt.",
});

// Arbeitswunschstatus, ab denen eine Canva-Produktion sinnvoll vorbereitet
// werden kann (jamal-work-mode.js#STATUS.RESULT_READY/DONE) – vor einem
// vorliegenden internen Ergebnis gibt es fachlich nichts zu übergeben.
const ELIGIBLE_WORK_ITEM_STATUSES = Object.freeze(["RESULT_READY", "DONE"]);

function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function fromJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function requireWorkItem(workItem) {
  if (!workItem || !workItem.id) {
    throw badRequest("Es ist noch kein Arbeitswunsch angelegt.");
  }
  return workItem;
}

function assertWorkItemEligible(workItem) {
  if (!ELIGIBLE_WORK_ITEM_STATUSES.includes(workItem.status)) {
    throw badRequest(
      "Für diesen Arbeitswunsch liegt noch kein internes Ergebnis vor – eine Canva-Produktion kann erst nach einem Arbeitslauf vorbereitet werden.",
    );
  }
}

// Fail-closed-Auditmuster (identisch zu work-order-execution-service.js#
// auditSafe): Audit darf eine Canva-Aktion niemals zum Absturz bringen.
// Ausschließlich Felder aus auth-audit.js#METADATA_ALLOWLIST, niemals
// Briefingtext, Provider-Rohantwort oder ein Zugangstoken.
function auditSafe(db, { eventType, result, actorUserId, workItemId, canvaJobId, canvaDesignId, format, revisionNumber, reasonCode, rightsCode, failureCode }) {
  if (!db) return;
  try {
    const metadata = {};
    if (workItemId) metadata.workItemId = workItemId;
    if (canvaJobId) metadata.canvaJobId = canvaJobId;
    if (canvaDesignId) metadata.canvaDesignId = canvaDesignId;
    if (format) metadata.format = format;
    if (Number.isInteger(revisionNumber)) metadata.revisionNumber = revisionNumber;
    if (reasonCode) metadata.reasonCode = reasonCode;
    if (rightsCode) metadata.rightsCode = rightsCode;
    if (failureCode) metadata.failureCode = failureCode;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf eine Canva-Aktion niemals zum Absturz bringen. */
  }
}

function rowToSafeView(row) {
  if (!row) return null;
  const suitability = fromJson(row.suitabilityJson);
  const rights = fromJson(row.rightsJson);
  const briefingRecord = fromJson(row.briefingJson);
  const qualityNotes = fromJson(row.qualityNotesJson) || [];
  return {
    id: row.id,
    workItemId: row.workItemId,
    revisionNumber: row.revisionNumber,
    status: row.status,
    statusLabel: CANVA_STATUS_LABELS_DE[row.status] || "UNGEKLÄRT",
    suitability: suitability
      ? {
          decision: suitability.decision,
          decisionLabel: CANVA_SUITABILITY_LABELS_DE[suitability.decision] || "UNGEKLÄRT",
          reasoning: suitability.reasoning,
          suggestedFormat: suitability.suggestedFormat,
          requiredSourceMaterials: suitability.requiredSourceMaterials || [],
          openRightsQuestions: suitability.openRightsQuestions || [],
          estimatedDesignCount: suitability.estimatedDesignCount || 0,
        }
      : null,
    rights: rights ? { status: rights.status, notes: rights.notes || [] } : null,
    briefing: briefingRecord,
    reviewMode: row.reviewMode,
    changeRequestText: row.changeRequestText || null,
    approvedAt: row.approvedAt || null,
    handoffStartedAt: row.handoffStartedAt || null,
    design:
      row.canvaDesignId || row.editLink || row.viewLink
        ? {
            canvaDesignId: row.canvaDesignId || null,
            designTitle: row.designTitle || null,
            editLink: row.editLink || null,
            viewLink: row.viewLink || null,
            providerStatus: row.providerStatus || null,
          }
        : null,
    errorCode: row.errorCode || null,
    resultReceivedAt: row.resultReceivedAt || null,
    quality: row.qualityStatus
      ? {
          status: row.qualityStatus,
          statusLabel: CANVA_QUALITY_LABELS_DE[row.qualityStatus] || "UNGEKLÄRT",
          notes: qualityNotes,
        }
      : null,
    cancelledAt: row.cancelledAt || null,
    cancelReason: row.cancelReason || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    availableActions: {
      canPrepare: RE_PREPARABLE_STATUSES.includes(row.status) || TERMINAL_STATUSES.includes(row.status),
      canApprove: row.status === "READY_FOR_APPROVAL",
      canStart: row.status === "APPROVED_FOR_HANDOFF",
      canRequestRevision: row.status === "RESULT_RECEIVED",
      canAccept: row.status === "RESULT_RECEIVED",
      canCancel: !TERMINAL_STATUSES.includes(row.status) && !NON_CANCELLABLE_IN_FLIGHT_STATUSES.includes(row.status),
    },
  };
}

// GET-Zustand (Auftrag Abschnitt L/M): niemals Teil von
// jamal-work-mode.js#getSafeView – bewusst ein vollständig getrennter,
// zusätzlicher Blick, damit der bestehende Jamal-Arbeitsmodus-Hauptfluss
// (jamal-work-mode.js/jamal-work-mode-ui.js) unverändert ohne jeden
// Canva-Bezug bleibt (siehe jamal-work-mode-ui.test.js#"kein Provider").
function getCanvaSafeView(db, workItem) {
  if (!workItem || !workItem.id) {
    return { hasWorkItem: false, eligibleForCanva: false, current: null, history: [] };
  }
  const eligibleForCanva = ELIGIBLE_WORK_ITEM_STATUSES.includes(workItem.status);
  const rows = authDb.listJamalCanvaProductionsForWorkItem(db, workItem.id);
  const latest = rows.length ? rows[rows.length - 1] : null;
  return {
    hasWorkItem: true,
    eligibleForCanva,
    current: latest ? rowToSafeView(latest) : null,
    history: rows.slice(0, -1).map(rowToSafeView),
  };
}

// ---------------------------------------------------------------------------
// D/E/I. Briefing vorbereiten (Canva-Eignung + Briefing + Rechte/Consent).
// ---------------------------------------------------------------------------

function prepareBriefing(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  assertWorkItemEligible(workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);

  const existing = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (existing && IN_FLIGHT_STATUSES.includes(existing.status)) {
    throw conflict(
      "Es läuft bereits eine Canva-Produktion für diesen Arbeitswunsch. Bitte zuerst abschließen oder eine Änderung anfordern.",
    );
  }

  const reuseRow = Boolean(existing) && RE_PREPARABLE_STATUSES.includes(existing.status);
  const revisionNumber = reuseRow ? existing.revisionNumber : existing ? existing.revisionNumber + 1 : 1;
  const id = reuseRow ? existing.id : crypto.randomUUID();
  const createdAt = reuseRow ? existing.createdAt : iso;

  const suitability = briefing.evaluateCanvaSuitability(workItem);
  const rights = briefing.evaluateRightsAndConsent(options.rightsInput || {});
  const briefingRecord = briefing.buildCanvaBriefing(workItem, suitability, rights, { revisionNumber });

  let status;
  let auditEventType;
  let auditResult = "OK";
  if (suitability.decision === "CANVA_BLOCKED_BY_POLICY") {
    status = "BLOCKED";
    auditEventType = "CANVA_HANDOFF_BLOCKED_BY_POLICY";
    auditResult = "DENIED";
  } else if (rights.status !== "CLEAR") {
    status = "BLOCKED";
    auditEventType = "CANVA_HANDOFF_BLOCKED_BY_RIGHTS";
    auditResult = "DENIED";
  } else {
    status = "READY_FOR_APPROVAL";
    auditEventType = "CANVA_BRIEFING_PREPARED";
  }

  const row = authDb.upsertJamalCanvaProduction(db, {
    id,
    workItemId: workItem.id,
    revisionNumber,
    status,
    suitabilityDecision: suitability.decision,
    suitabilityJson: toJson(suitability),
    briefingJson: toJson(briefingRecord),
    rightsStatus: rights.status,
    rightsJson: toJson(rights),
    reviewMode: "OWNER_REVIEW",
    changeRequestText: reuseRow ? existing.changeRequestText : options.changeRequestText || null,
    createdAt,
    updatedAt: iso,
  });

  auditSafe(db, {
    eventType: auditEventType,
    result: auditResult,
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber,
    format: briefingRecord.desiredFormat,
    reasonCode: status === "BLOCKED" ? suitability.policyReasonCode || null : null,
    rightsCode: rights.status,
  });

  return rowToSafeView(row);
}

// ---------------------------------------------------------------------------
// F. Externe Freigabegrenze – explizite technische Freigabe durch Jamal.
// ---------------------------------------------------------------------------

function approveHandoff(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);

  const row = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (!row || row.status !== "READY_FOR_APPROVAL") {
    throw conflict("Diese Canva-Produktion ist derzeit nicht zur Freigabe bereit.");
  }
  // Verteidigung in der Tiefe: Rechte müssen bei der Freigabe weiterhin CLEAR sein.
  if (row.rightsStatus !== "CLEAR") {
    throw conflict("Die Rechte-/Consent-Fragen sind noch nicht geklärt – keine Freigabe möglich.");
  }

  const updated = authDb.upsertJamalCanvaProduction(db, {
    ...row,
    status: "APPROVED_FOR_HANDOFF",
    approvedAt: iso,
    approvedByUserId: options.actorUserId || null,
    updatedAt: iso,
  });

  auditSafe(db, {
    eventType: "CANVA_HANDOFF_APPROVED",
    result: "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber: row.revisionNumber,
  });

  return rowToSafeView(updated);
}

// ---------------------------------------------------------------------------
// H. Canva-Adapter (Stub-/Fixturemodus per Default; echter Connector nur
// über explizite Injektion, niemals über einen Client-Parameter steuerbar).
// ---------------------------------------------------------------------------

// Deterministischer Stub (Auftrag Abschnitt H/Q): kein Netzwerkzugriff, kein
// Provider-Secret. "designId" wird technisch neu erzeugt (crypto.randomUUID,
// gleiches zulässiges Muster wie jamal-work-mode-store.js#versionToRow für
// reine Identifikatorerzeugung) – niemals eine erfundene, fachliche Aussage.
function defaultCanvaConnectorStub(payload) {
  const shortId = crypto.randomUUID().slice(0, 8);
  return {
    providerStatus: "SAVED",
    canvaDesignId: `stub-design-${shortId}`,
    designTitle: (payload && payload.briefing && payload.briefing.designGoal
      ? String(payload.briefing.designGoal)
      : "Canva-Design"
    ).slice(0, 120),
    editLink: `https://www.canva.com/design/stub-${shortId}/edit`,
    viewLink: `https://www.canva.com/design/stub-${shortId}/view`,
  };
}

// Rein deterministische, interne Qualitätsprüfung (Auftrag Abschnitt J) –
// kein KI-Modell, keine Zufallszahl. Prüft ausschließlich strukturelle
// Vollständigkeit des Briefings/Ergebnisses (gleiches Prinzip wie
// work-order-agent-orchestrator.js#runQualityCheck).
function runCanvaQualityCheck(briefingRecord, providerResult) {
  const notes = [];
  let status = "PASSED";

  if (!providerResult.designTitle) {
    notes.push("Kein Design-Titel vom Provider übernommen.");
    status = "PASSED_WITH_NOTES";
  }
  if (briefingRecord.targetAudience === "UNGEKLÄRT – von Jamal zu ergänzen") {
    notes.push("Zielgruppe war im Briefing nicht angegeben.");
    status = "PASSED_WITH_NOTES";
  }
  if (briefingRecord.visualDirection === "UNGEKLÄRT – von Jamal zu ergänzen") {
    notes.push("Visuelle Richtung war im Briefing nicht angegeben.");
    status = "PASSED_WITH_NOTES";
  }
  return { status, notes };
}

// Auftrag Abschnitt H: Providerfehler UND Zeitüberschreitung werden
// kontrolliert behandelt (Status FAILED, Fehlercode, keine Endlosschleife,
// keine automatische Wiederholung). "connector" ist ausschließlich für
// Tests injizierbar (jamal-canva-production.test.js) – die Produktivroute
// (jamal-canva-routes.js) übergibt niemals einen vom Client gewählten
// Connector.
async function startHandoff(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);
  const connector = typeof options.connector === "function" ? options.connector : defaultCanvaConnectorStub;

  const row = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (!row || row.status !== "APPROVED_FOR_HANDOFF") {
    throw conflict("Diese Canva-Produktion ist derzeit nicht für den Start bereit (fehlende Freigabe oder bereits gestartet).");
  }

  const briefingRecord = fromJson(row.briefingJson);

  // Zwischenstand VOR dem eigentlichen Connectoraufruf persistieren: ein
  // Absturz mitten im Aufruf hinterlässt so einen nachvollziehbaren,
  // wiederaufnehmbaren Zustand statt eines stillen Datenverlusts.
  const startedRow = authDb.upsertJamalCanvaProduction(db, {
    ...row,
    status: "HANDOFF_STARTED",
    handoffStartedAt: iso,
    updatedAt: iso,
  });
  auditSafe(db, {
    eventType: "CANVA_HANDOFF_STARTED",
    result: "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber: row.revisionNumber,
    format: briefingRecord ? briefingRecord.desiredFormat : null,
  });

  let providerResult;
  try {
    providerResult = await connector({ briefing: briefingRecord, format: briefingRecord ? briefingRecord.desiredFormat : null });
  } catch (error) {
    const failIso = nowIso();
    const failedRow = authDb.upsertJamalCanvaProduction(db, {
      ...startedRow,
      status: "FAILED",
      providerStatus: "FAILED",
      errorCode: "PROVIDER_CALL_FAILED",
      updatedAt: failIso,
    });
    auditSafe(db, {
      eventType: "CANVA_HANDOFF_FAILED",
      result: "ERROR",
      actorUserId: options.actorUserId,
      workItemId: workItem.id,
      revisionNumber: row.revisionNumber,
      failureCode: "PROVIDER_CALL_FAILED",
    });
    void error;
    return rowToSafeView(failedRow);
  }

  if (!providerResult || providerResult.providerStatus === "FAILED" || providerResult.failed) {
    const failIso = nowIso();
    const errorCode = (providerResult && providerResult.errorCode) || "PROVIDER_REPORTED_FAILURE";
    const failedRow = authDb.upsertJamalCanvaProduction(db, {
      ...startedRow,
      status: "FAILED",
      providerStatus: (providerResult && providerResult.providerStatus) || "FAILED",
      errorCode,
      updatedAt: failIso,
    });
    auditSafe(db, {
      eventType: "CANVA_HANDOFF_FAILED",
      result: "ERROR",
      actorUserId: options.actorUserId,
      workItemId: workItem.id,
      revisionNumber: row.revisionNumber,
      failureCode: errorCode,
    });
    return rowToSafeView(failedRow);
  }

  const editLinkCheck = canvaDesignResult.validateResultReferenceUrl(providerResult.editLink, "editLink");
  const viewLinkCheck = canvaDesignResult.validateResultReferenceUrl(providerResult.viewLink, "viewLink");
  if (!editLinkCheck.ok || !viewLinkCheck.ok) {
    const failIso = nowIso();
    const failedRow = authDb.upsertJamalCanvaProduction(db, {
      ...startedRow,
      status: "FAILED",
      providerStatus: providerResult.providerStatus || null,
      errorCode: "INVALID_RESULT_REFERENCE",
      updatedAt: failIso,
    });
    auditSafe(db, {
      eventType: "CANVA_HANDOFF_FAILED",
      result: "ERROR",
      actorUserId: options.actorUserId,
      workItemId: workItem.id,
      revisionNumber: row.revisionNumber,
      failureCode: "INVALID_RESULT_REFERENCE",
    });
    return rowToSafeView(failedRow);
  }

  const qualityCheck = runCanvaQualityCheck(briefingRecord || {}, providerResult);
  const resultIso = nowIso();
  const resultRow = authDb.upsertJamalCanvaProduction(db, {
    ...startedRow,
    status: "RESULT_RECEIVED",
    canvaJobId: startedRow.canvaJobId || crypto.randomUUID(),
    canvaDesignId: providerResult.canvaDesignId || null,
    designTitle: providerResult.designTitle || null,
    editLink: editLinkCheck.value,
    viewLink: viewLinkCheck.value,
    providerStatus: providerResult.providerStatus,
    resultReceivedAt: resultIso,
    qualityStatus: qualityCheck.status,
    qualityNotesJson: toJson(qualityCheck.notes),
    updatedAt: resultIso,
  });

  auditSafe(db, {
    eventType: "CANVA_RESULT_RECEIVED",
    result: "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    canvaDesignId: providerResult.canvaDesignId,
    revisionNumber: row.revisionNumber,
  });
  auditSafe(db, {
    eventType: "CANVA_RESULT_REVIEWED",
    result: qualityCheck.status === "BLOCKED" ? "DENIED" : "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber: row.revisionNumber,
  });

  return rowToSafeView(resultRow);
}

// ---------------------------------------------------------------------------
// K. Revisionsfluss – neue Briefingversion, alte Revision bleibt
// nachvollziehbar erhalten, jeder weitere externe Lauf braucht erneut eine
// klare Freigabe.
// ---------------------------------------------------------------------------

function requestRevision(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);
  const changeText = String(options.changeText || "").trim();
  if (!changeText) {
    throw badRequest("Änderungswunsch ist erforderlich.");
  }

  const row = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (!row || row.status !== "RESULT_RECEIVED") {
    throw conflict("Eine Änderung kann erst nach einem vorliegenden Canva-Ergebnis angefordert werden.");
  }

  const markedRow = authDb.upsertJamalCanvaProduction(db, {
    ...row,
    status: "NEEDS_REVISION",
    updatedAt: iso,
  });

  auditSafe(db, {
    eventType: "CANVA_REVISION_REQUESTED",
    result: "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber: row.revisionNumber,
  });

  void markedRow;

  // Neue Revision entsteht sofort als neues, eigenständiges Briefing
  // (Auftrag Abschnitt K: "neue Briefingversion erzeugen") – erneut READY_
  // FOR_APPROVAL oder BLOCKED, niemals automatisch freigegeben.
  return prepareBriefing(db, {
    workItem,
    rightsInput: options.rightsInput || {},
    actorUserId: options.actorUserId,
    changeRequestText: changeText,
    now,
  });
}

// ---------------------------------------------------------------------------
// J. "Passt" – intern als passend markieren. Niemals Veröffentlichung,
// niemals Kundenfreigabe.
// ---------------------------------------------------------------------------

function acceptResult(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);

  const row = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (!row || row.status !== "RESULT_RECEIVED") {
    throw conflict("Es liegt kein annehmbares Canva-Ergebnis vor.");
  }

  const updated = authDb.upsertJamalCanvaProduction(db, {
    ...row,
    status: "ACCEPTED_INTERNAL",
    updatedAt: iso,
  });

  auditSafe(db, {
    eventType: "CANVA_RESULT_ACCEPTED_INTERNAL",
    result: "OK",
    actorUserId: options.actorUserId,
    workItemId: workItem.id,
    revisionNumber: row.revisionNumber,
  });

  return rowToSafeView(updated);
}

// ---------------------------------------------------------------------------
// F. "Noch nicht" / "Intern weiterbearbeiten" – bricht eine noch nicht
// gestartete Vorbereitung ab (Auftrag Abschnitt G: Zustand CANCELLED).
// ---------------------------------------------------------------------------

function cancelProduction(db, options = {}) {
  const workItem = requireWorkItem(options.workItem);
  const now = options.now || new Date();
  const iso = nowIso(now);

  const row = authDb.getLatestJamalCanvaProductionForWorkItem(db, workItem.id);
  if (!row || TERMINAL_STATUSES.includes(row.status)) {
    throw conflict("Diese Canva-Produktion ist bereits abgeschlossen.");
  }
  if (NON_CANCELLABLE_IN_FLIGHT_STATUSES.includes(row.status)) {
    throw conflict("Eine bereits gestartete Übergabe kann nicht mehr abgebrochen werden.");
  }

  const updated = authDb.upsertJamalCanvaProduction(db, {
    ...row,
    status: "CANCELLED",
    cancelledAt: iso,
    cancelReason: options.reason ? String(options.reason).slice(0, 500) : null,
    updatedAt: iso,
  });

  return rowToSafeView(updated);
}

module.exports = {
  JamalCanvaProductionError,
  IN_FLIGHT_STATUSES,
  RE_PREPARABLE_STATUSES,
  TERMINAL_STATUSES,
  NON_CANCELLABLE_IN_FLIGHT_STATUSES,
  ELIGIBLE_WORK_ITEM_STATUSES,
  CANVA_STATUS_LABELS_DE,
  CANVA_QUALITY_LABELS_DE,
  CANVA_SUITABILITY_LABELS_DE,
  getCanvaSafeView,
  prepareBriefing,
  approveHandoff,
  startHandoff,
  requestRevision,
  acceptResult,
  cancelProduction,
  defaultCanvaConnectorStub,
  runCanvaQualityCheck,
  rowToSafeView,
};
