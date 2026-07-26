"use strict";

// V7.2 Phase B Schritt 1 (Auftrag Abschnitt H) – Arbeitsauftrag anlegen,
// prüfen, Status verfolgen: reine Geschäftslogik. Kennt weder HTTP noch
// Request-/Response-Objekte (gleiches Trennungsmuster wie
// owner-admin-service.js/customer-portal-service.js). Erhält ausschließlich
// die bereits vom Auth-Route-Guard validierte `identity` – niemals rohe
// Query-/Body-Tenant-/User-Werte des Browsers (Auftrag Leitprinzip: "Tenant
// ausschließlich aus validierter Session").
//
// Persistenz ausschließlich über auth-db.js; dieses Modul importiert
// NIEMALS better-sqlite3 selbst. Jede statusverändernde Operation läuft über
// eine einzelne, atomare auth-db.js-Funktion (compare-and-set inkl.
// Ausgangsstatus, siehe dort) – kein Lesen-dann-Schreiben ohne Statusschutz.
//
// ---------------------------------------------------------------------------
// PRODUKTKORREKTUR (Selbstbedienungs-Fluss) – verbindlich für dieses Modul:
// ---------------------------------------------------------------------------
// Der OWNER ist KEIN fachlicher Prüfer von Kundenprojekten und KEIN
// regulärer Pflichtschritt im Kundenarbeitsfluss. Jamal kann und soll
// weder Marketing- noch Design-, Strategie- oder sonstige Kundenaufträge
// inhaltlich prüfen oder zur Bearbeitung freigeben – die
// KI-Unternehmenszentrale ist eine Selbstbedienungs-Agentenzentrale.
//
// Normalablauf (dieses Modul bildet die ersten drei Schritte ab, der Rest
// ist noch nicht Teil von V7.2 Phase B Schritt 1):
//   Kunde erstellt Auftrag
//   -> Zentrale prüft automatisch Vollständigkeit (evaluateAutomaticDecision)
//   -> [zukünftig] Projektmanager-Agent strukturiert den Auftrag
//   -> bei Bedarf stellt die Zentrale dem Kunden eine automatische Rückfrage
//   -> [zukünftig] Auftrag wird automatisch an Agenten übergeben
//   -> [zukünftig] Ergebnis geht an den Kunden
//   -> [zukünftig] Kunde fordert Änderungen an ODER gibt das Ergebnis SELBST frei
//
// Der OWNER ist ausschließlich für Ausnahmefälle vorgesehen (Sicherheit,
// Missbrauch, rechtliche Sensibilität, außergewöhnliche Kosten, technische
// Blockade, explizite Eskalation) – siehe escalateForOwner/stopForOwner
// unten. Es gibt in diesem Schritt und auch strukturell für später KEINE
// Owner-Funktion, die einen Auftrag regulär fachlich freigibt oder ablehnt.
// Nur der Kunde kann ein Ergebnis später fachlich freigeben
// (CUSTOMER_APPROVED, siehe REACHABLE_STATUS_VALUES) – das ist in diesem
// Schritt bereits im Datenmodell vorbereitet, aber noch nicht erreichbar,
// weil es noch keinen Ergebnisfluss gibt.
// ---------------------------------------------------------------------------
//
// V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt C/D,
// siehe BUSINESS_USE_POLICY.md/SAFETY_ENFORCEMENT_MODEL.md): jede
// Auftragsspeicherung (Erstanlage UND erneutes Einreichen) läuft zusätzlich
// durch das lokale Business-Use-Safety-Gate (business-use-policy.js),
// BEVOR die automatische Vollständigkeitsregel greift. BLOCK verhindert
// jede Speicherung als normaler Auftrag; ESCALATE speichert den Auftrag
// direkt mit Status ESCALATED statt der automatischen Einstufung. Siehe
// enforceBusinessUsePolicy unten.
// ---------------------------------------------------------------------------

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const businessUsePolicy = require("./business-use-policy");

const TITLE_MAX = 200;
const DESIRED_RESULT_MAX = 4000;
const CONTEXT_MAX = 4000;
const DEADLINE_TEXT_MAX = 200;
const STATUS_NOTE_MAX = 4000;

// In diesem Schritt tatsächlich erreichbare Status (Auftrag: "Erlaubte
// Statuswerte für Schritt 1"). Die vier weiteren, in der Datenbank-CHECK-
// Aufzählung bereits vorbereiteten Werte (IN_PROGRESS/RESULT_READY/
// CHANGES_REQUESTED/CUSTOMER_APPROVED, siehe auth-db-migrations.js) werden
// von KEINER Funktion dieses Moduls jemals gesetzt oder vorausgesetzt –
// reine Datenmodell-Vorbereitung für spätere Schritte.
const REACHABLE_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "NEEDS_CLARIFICATION",
  "READY_FOR_PROCESSING",
  "ESCALATED",
  "CANCELLED",
]);

// Auftrag Abschnitt J: verständlicher deutscher Text statt technischem Code
// – gilt für die Kundenoberfläche. Für die Owner-Oberfläche wird derselbe
// Text mitgeliefert (bessere Lesbarkeit), zusätzlich aber auch der rohe
// Statuscode (Owner ist eine interne Rolle, kein Kunde). Enthält auch die
// vier für später vorbereiteten, in diesem Schritt unerreichbaren Status
// (rein dokumentarisch, damit ein künftiger Schritt hier nur noch Verhalten
// ergänzen muss, keine neuen Übersetzungen erfinden muss).
const STATUS_LABELS = Object.freeze({
  DRAFT: "Entwurf",
  SUBMITTED: "Eingereicht – wird geprüft",
  NEEDS_CLARIFICATION: "Rückfrage offen",
  READY_FOR_PROCESSING: "Bereit zur Bearbeitung",
  ESCALATED: "In besonderer Prüfung",
  CANCELLED: "Storniert",
  IN_PROGRESS: "In Bearbeitung",
  RESULT_READY: "Ergebnis verfügbar",
  CHANGES_REQUESTED: "Änderung angefordert",
  CUSTOMER_APPROVED: "Vom Kunden freigegeben",
});

function statusLabel(status) {
  return STATUS_LABELS[status] || "Unbekannt";
}

class WorkOrderError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "WorkOrderError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function notFound(message) {
  return new WorkOrderError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function badRequest(message) {
  return new WorkOrderError(400, "BAD_REQUEST", message || "Anfrage ungültig.");
}

function conflict(message) {
  return new WorkOrderError(409, "CONFLICT", message || "Aktion steht im Widerspruch zum aktuellen Zustand.");
}

function nowIso() {
  return new Date().toISOString();
}

// Gleiches fail-closed-Auditmuster wie owner-admin-service.js#auditSafe:
// ein Auditfehler darf eine Kunden-/Owner-Aktion niemals zum Absturz
// bringen. Nur workOrderId (interne ID), statusTransition (reiner
// Statuscode-Übergang wie "SUBMITTED->ESCALATED") sowie – seit der
// Schutz-/Einwilligungsgrundlage – reasonCode/severity (reine
// Kategorie-/Schweregrad-Codes aus business-use-policy.js, z. B.
// "ILLEGAL_PURPOSE"/"HIGH") werden mitgeführt – niemals Auftragstext,
// Titel, Ergebnisbeschreibung oder Status-Notiz (Auftrag Abschnitt I:
// "Audit darf nicht enthalten: vollständiger Auftragstext").
function auditSafe(db, { eventType, result, actorUserId, tenantId, workOrderId, statusTransition, reasonCode, severity }) {
  if (!db) return;
  try {
    const metadata = {};
    if (workOrderId) metadata.workOrderId = workOrderId;
    if (statusTransition) metadata.statusTransition = statusTransition;
    if (reasonCode) metadata.reasonCode = reasonCode;
    if (severity) metadata.severity = severity;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: tenantId || null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf eine Arbeitsauftragsaktion niemals zum Absturz bringen. */
  }
}

// ---------------------------------------------------------------------------
// Feldvalidierung (Auftrag Abschnitt C: "Textlängen begrenzen", "wenig
// Felder", "nur Titel und gewünschtes Ergebnis sind Pflichtfelder"). Wirft
// bei jeder Verletzung, statt stillschweigend zu kürzen – identisches
// Fail-closed-Prinzip wie owner-admin-service.js#inviteUser.
// ---------------------------------------------------------------------------

function sanitizeFields(input) {
  const title = String((input && input.title) || "").trim();
  const desiredResult = String((input && input.desiredResult) || "").trim();
  const rawContext = input && input.context;
  const rawDeadlineText = input && input.deadlineText;
  const context = rawContext === undefined || rawContext === null ? null : String(rawContext).trim() || null;
  const deadlineText =
    rawDeadlineText === undefined || rawDeadlineText === null ? null : String(rawDeadlineText).trim() || null;

  if (!title) {
    throw badRequest("Bitte einen Titel angeben.");
  }
  if (title.length > TITLE_MAX) {
    throw badRequest(`Der Titel darf höchstens ${TITLE_MAX} Zeichen lang sein.`);
  }
  if (!desiredResult) {
    throw badRequest("Bitte das gewünschte Ergebnis beschreiben.");
  }
  if (desiredResult.length > DESIRED_RESULT_MAX) {
    throw badRequest(`Die Ergebnisbeschreibung darf höchstens ${DESIRED_RESULT_MAX} Zeichen lang sein.`);
  }
  if (context && context.length > CONTEXT_MAX) {
    throw badRequest(`Der Hintergrundtext darf höchstens ${CONTEXT_MAX} Zeichen lang sein.`);
  }
  if (deadlineText && deadlineText.length > DEADLINE_TEXT_MAX) {
    throw badRequest(`Der gewünschte Zeitpunkt darf höchstens ${DEADLINE_TEXT_MAX} Zeichen lang sein.`);
  }
  return { title, desiredResult, context, deadlineText };
}

// Grund für eine Owner-Ausnahmeaktion (Eskalation/Stopp) – bewusst NICHT
// "für den Kunden" formuliert wie im ursprünglichen Konzept, weil dieser
// Grund internen Charakter hat (z. B. Sicherheits-/Missbrauchsverdacht) und
// dem Kunden NICHT wörtlich angezeigt wird (siehe customerMessageFor
// unten). Der Kunde erfährt nur die neutrale, feste Statusmeldung.
function sanitizeOwnerActionReason(input) {
  const reason = String((input && input.reason) || "").trim();
  if (!reason) {
    throw badRequest("Bitte einen Grund für diese Aktion angeben.");
  }
  if (reason.length > STATUS_NOTE_MAX) {
    throw badRequest(`Der Grund darf höchstens ${STATUS_NOTE_MAX} Zeichen lang sein.`);
  }
  return reason;
}

// ---------------------------------------------------------------------------
// Automatische Vollständigkeitsregel (Auftrag: "Zentrale prüft automatisch
// Vollständigkeit und Sicherheit"). Bewusst einfach, VOLLSTÄNDIG
// DETERMINISTISCH und hier dokumentiert – kein KI-Modell, kein Agent, keine
// externe Prüfung, nur eine nachvollziehbare Regel. Wird bei jeder
// Einreichung (Erstanlage UND erneutes Absenden) einheitlich angewendet,
// damit dieselben Angaben immer dieselbe Entscheidung ergeben.
//
// Die "Sicherheit"-Dimension aus dem Normalablauf ist damit in Schritt 1
// bewusst NICHT als eigene inhaltliche Prüfung abgedeckt (dafür gäbe es noch
// keinen ehrlichen, nachvollziehbaren Prüfmechanismus ohne echten Agenten) –
// als Verteidigung in der Tiefe existieren bereits die Feldlängenlimits,
// die strikte Feld-Allowlist (work-order-routes.js#assertKnownFieldsOnly)
// und die reine textContent-Darstellung im UI (kein HTML-Rendering). Eine
// echte automatische Sicherheits-/Missbrauchsprüfung ist ausdrücklich einem
// späteren Schritt vorbehalten (siehe Abschlussbericht).
const MIN_MEANINGFUL_DESIRED_RESULT_LENGTH = 15;

const AUTO_CLARIFICATION_NOTE =
  "Bitte das gewünschte Ergebnis genauer beschreiben (mindestens ein aussagekräftiger Satz), damit der Auftrag automatisch zur Bearbeitung freigegeben werden kann.";

function evaluateAutomaticDecision(fields) {
  if (fields.desiredResult.length < MIN_MEANINGFUL_DESIRED_RESULT_LENGTH) {
    return {
      status: "NEEDS_CLARIFICATION",
      statusNote: AUTO_CLARIFICATION_NOTE,
      eventType: "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
    };
  }
  return { status: "READY_FOR_PROCESSING", statusNote: null, eventType: "WORK_ORDER_AUTO_READY" };
}

// ---------------------------------------------------------------------------
// Ausgabeprojektionen. Ausschließlich sichere, bereits übersetzte Felder
// (Auftrag Abschnitt J: "keine technischen Codes", "keine IDs für Kunden" –
// `id` bleibt Teil der JSON-Antwort, weil das Kunden-UI ihn für den
// Detail-/Resubmit-/Cancel-Aufruf benötigt, wird aber vom Client niemals
// als sichtbarer Text dargestellt, siehe portal-work-order.js).
//
// statusNote wird dem Kunden AUSSCHLIESSLICH bei NEEDS_CLARIFICATION
// gezeigt (dort stammt der Inhalt von der automatischen Vollständigkeits-
// regel, ist also grundsätzlich kundensicher). Bei ESCALATED/CANCELLED
// kommt der Inhalt ggf. vom OWNER und kann interne Ausnahme-Gründe
// enthalten (Sicherheit/Missbrauch/...) – dafür gibt es stattdessen die
// feste, neutrale customerMessage.
// ---------------------------------------------------------------------------

const CUSTOMER_VISIBLE_STATUS_NOTE_STATUSES = Object.freeze(["NEEDS_CLARIFICATION"]);

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt L) ergänzt IN_PROGRESS/
// RESULT_READY, OHNE die bestehende READY_FOR_PROCESSING-Meldung zu
// verändern (work-order-ui.test.js prüft deren genauen Wortlaut fest –
// die Meldung bleibt weiterhin wahr: "in diesem Schritt" beschreibt den
// Moment, in dem der Auftrag gerade READY_FOR_PROCESSING wird, nicht eine
// dauerhafte Aussage über den gesamten Produktlebenszyklus).
// V7.2 Phase C Schritt 2 (Auftrag Abschnitt M) aktualisiert den
// RESULT_READY-Text (Änderung/Freigabe sind jetzt tatsächlich möglich,
// nicht mehr "im nächsten Schritt") und ergänzt CHANGES_REQUESTED/
// CUSTOMER_APPROVED, OHNE READY_FOR_PROCESSING/IN_PROGRESS/ESCALATED/
// CANCELLED zu verändern.
const CUSTOMER_STATUS_MESSAGES = Object.freeze({
  READY_FOR_PROCESSING:
    "Der Auftrag wurde automatisch geprüft und ist bereit zur Bearbeitung. Die Bearbeitung durch Agenten ist in diesem Schritt noch nicht gestartet.",
  IN_PROGRESS: "Die Unternehmenszentrale bearbeitet Ihren Auftrag.",
  RESULT_READY: "Für diesen Auftrag liegt ein Ergebnis vor. Sie können das Ergebnis ansehen, eine Änderung anfordern oder es freigeben.",
  CHANGES_REQUESTED: "Für dieses Ergebnis wurde ein Änderungswunsch gestellt. Die Zentrale erstellt eine überarbeitete Ergebnisversion.",
  CUSTOMER_APPROVED: "Sie haben das Ergebnis dieses Auftrags freigegeben.",
  ESCALATED: "Dieser Auftrag wird derzeit gesondert von der Zentrale geprüft.",
  CANCELLED: "Dieser Auftrag wurde gestoppt und wird nicht weiter bearbeitet.",
});

function customerMessageFor(status) {
  return CUSTOMER_STATUS_MESSAGES[status] || null;
}

function customerView(order) {
  return {
    id: order.id,
    title: order.title,
    desiredResult: order.desiredResult,
    context: order.context,
    deadlineText: order.deadlineText,
    status: order.status,
    statusLabel: statusLabel(order.status),
    statusNote: CUSTOMER_VISIBLE_STATUS_NOTE_STATUSES.includes(order.status) ? order.statusNote : null,
    customerMessage: customerMessageFor(order.status),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    submittedAt: order.submittedAt,
    decidedAt: order.decidedAt,
    cancellable: CUSTOMER_CANCELLABLE_FROM.includes(order.status),
  };
}

function ownerView(db, order) {
  const creator = authDb.getUserById(db, order.createdByUserId);
  const tenant = authDb.getTenantProjectionById(db, order.tenantId);
  const decidedBy = order.decidedByUserId ? authDb.getUserById(db, order.decidedByUserId) : null;
  return {
    id: order.id,
    tenantDisplayName: tenant ? tenant.displayName : "Unbekannter Mandant",
    title: order.title,
    desiredResult: order.desiredResult,
    context: order.context,
    deadlineText: order.deadlineText,
    status: order.status,
    statusLabel: statusLabel(order.status),
    statusNote: order.statusNote,
    createdByDisplayName: creator ? creator.displayName : "Unbekannt",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    submittedAt: order.submittedAt,
    decidedAt: order.decidedAt,
    decidedByDisplayName: decidedBy ? decidedBy.displayName : null,
    // Reine Anzeigehilfen, aus denselben Statuslisten abgeleitet, die auch
    // escalateForOwner/stopForOwner serverseitig erzwingen (Single Source
    // of Truth) – das Owner-UI muss die Übergangsregeln nicht selbst kennen.
    escalatable: OWNER_ESCALATABLE_FROM.includes(order.status),
    stoppable: OWNER_STOPPABLE_FROM.includes(order.status),
  };
}

// ---------------------------------------------------------------------------
// Kundenfunktionen (Auftrag Abschnitt E). `identity` stammt ausschließlich
// aus dem bereits validierten Auth-Route-Guard-Kontext.
// ---------------------------------------------------------------------------

function listForCustomer(db, identity) {
  return authDb.listWorkOrdersByTenantId(db, identity.tenantId).map(customerView);
}

// Fremde oder unbekannte Auftrag-ID: identisches generisches 404 in beiden
// Fällen (Auftrag Abschnitt E: "keine Existenzbestätigung"). Nur der
// tatsächliche Tenant-Mismatch (Auftrag existiert, gehört aber einem
// anderen Mandanten) wird zusätzlich auditiert – eine schlicht unbekannte ID
// ist kein sicherheitsrelevantes Ereignis.
function getForCustomer(db, identity, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  if (order.tenantId !== identity.tenantId) {
    auditSafe(db, {
      eventType: "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
      result: "DENIED",
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      workOrderId: order.id,
    });
    throw notFound();
  }
  return customerView(order);
}

// ---------------------------------------------------------------------------
// Business-Use-/Safety-Gate-Verdrahtung (Auftrag Abschnitt C/D). Siehe
// BUSINESS_USE_POLICY.md und SAFETY_ENFORCEMENT_MODEL.md für die
// vollständige Beschreibung. business-use-policy.js selbst ist eine reine
// Funktion ohne Datenbankzugriff; hier findet die eigentliche Verdrahtung
// (Verstoßprotokoll, Audit, automatischer Sessionwiderruf bei CRITICAL)
// statt.
// ---------------------------------------------------------------------------

// Generische, geheimnisfreie Kundenmeldung bei BLOCK – nennt niemals die
// erkannte Kategorie oder einen Hinweis darauf, welcher Teil des Textes den
// Ausschlag gab (Auftrag Abschnitt C: "generische Kundenmeldung").
const BLOCKED_BY_POLICY_MESSAGE =
  "Dieser Auftrag kann in dieser Form nicht angelegt werden. Bitte prüfen Sie Titel und gewünschtes Ergebnis oder wenden Sie sich bei Fragen an die Zentrale.";

// Bildet eine Gate-Entscheidung auf einen policy_violations.actionTaken-Wert
// ab (SAFETY_ENFORCEMENT_MODEL.md Abschnitt 4). CRITICAL erhält
// LICENSE_REVIEW_REQUIRED statt BLOCKED: das ist die vorgesehene
// "Markierung zur sofortigen Betreiberprüfung" – ausdrücklich KEIN
// automatischer Lizenzentzug, nur eine Markierung für Jamal.
function actionTakenFor(gateResult) {
  if (gateResult.decision === "BLOCK") {
    return gateResult.severity === "CRITICAL" ? "LICENSE_REVIEW_REQUIRED" : "BLOCKED";
  }
  return "ESCALATED";
}

// Läuft vor JEDER Speicherung von Kundenfreitext (Erstanlage UND erneutes
// Einreichen) – noch bevor die automatische Vollständigkeitsregel greift.
// Wirft bei BLOCK (kein Auftrag wird angelegt/aktualisiert); gibt bei
// ALLOW/ESCALATE das Gate-Ergebnis an den Aufrufer zurück, damit dieser bei
// ESCALATE den Auftrag mit dem passenden Direktstatus speichert (siehe
// createForCustomer/resubmitForCustomer).
function enforceBusinessUsePolicy(db, identity, fields) {
  const gateResult = businessUsePolicy.evaluateWorkOrderContent(fields);
  if (gateResult.decision === "ALLOW") {
    return gateResult;
  }
  if (gateResult.decision === "BLOCK") {
    authDb.recordPolicyViolation(db, {
      tenantId: identity.tenantId,
      userId: identity.userId,
      workOrderId: null,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
      actionTaken: actionTakenFor(gateResult),
    });
    auditSafe(db, {
      eventType: "WORK_ORDER_BLOCKED_BY_POLICY",
      result: "DENIED",
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      reasonCode: gateResult.reasonCode,
      severity: gateResult.severity,
    });
    if (gateResult.severity === "CRITICAL") {
      // Einzige automatische Sofortmaßnahme dieses Schritts (Auftrag
      // Abschnitt D: "bei CRITICAL: Sessions widerrufen"). KEINE
      // automatische Mandanten-/Benutzersperre, KEIN automatischer
      // Lizenzentzug – das bleibt eine bewusste Betreiberentscheidung
      // (siehe BUSINESS_USE_POLICY.md Abschnitt 4).
      authDb.revokeAllSessionsForUser(db, identity.userId);
      auditSafe(db, {
        eventType: "USER_SESSIONS_REVOKED",
        result: "OK",
        actorUserId: null,
        tenantId: identity.tenantId,
        reasonCode: gateResult.reasonCode,
        severity: gateResult.severity,
      });
    }
    throw badRequest(BLOCKED_BY_POLICY_MESSAGE);
  }
  // ESCALATE: der Aufrufer erzeugt/aktualisiert den Auftrag selbst mit
  // Status ESCALATED (siehe unten) und übergibt danach die entstandene
  // workOrderId an recordEscalationViolation, damit die Verstoßzeile den
  // tatsächlichen Auftrag referenziert.
  return gateResult;
}

// Wird NACH dem Anlegen/Aktualisieren eines ESCALATE-Auftrags aufgerufen
// (workOrderId ist dann bekannt) – getrennt von enforceBusinessUsePolicy,
// damit die Verstoßzeile korrekt auf den tatsächlich entstandenen Auftrag
// verweist (Auftrag Abschnitt D: "work_order_id optional").
function recordEscalationViolation(db, identity, workOrderId, gateResult) {
  authDb.recordPolicyViolation(db, {
    tenantId: identity.tenantId,
    userId: identity.userId,
    workOrderId,
    reasonCode: gateResult.reasonCode,
    severity: gateResult.severity,
    actionTaken: actionTakenFor(gateResult),
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_AUTO_ESCALATED_BY_POLICY",
    result: "OK",
    actorUserId: null,
    tenantId: identity.tenantId,
    workOrderId,
    reasonCode: gateResult.reasonCode,
    severity: gateResult.severity,
  });
}

// Auftrag Abschnitt C: Kunde erzeugt einen Auftrag, der SOFORT eingereicht
// wird (kein separater "Als Entwurf speichern"-Schritt in diesem Schritt –
// die Kundenoberfläche bietet Abschnitt D zufolge genau einen Button
// "Arbeitsauftrag absenden"). DRAFT bleibt als gültiger Statuswert im
// Datenmodell vorbereitet (Abschnitt C), wird von diesem Ablauf aber nicht
// erzeugt.
//
// Produktkorrektur (Selbstbedienungs-Fluss): die automatische
// Vollständigkeitsregel entscheidet INNERHALB derselben Anfrage, ob der
// Auftrag READY_FOR_PROCESSING oder NEEDS_CLARIFICATION wird – kein Owner
// dazwischen. Drei Auditereignisse markieren die drei wahren Tatsachen
// dieser einen Aktion: die Zeile wurde angelegt, sie wurde eingereicht, UND
// sie wurde automatisch entschieden (WORK_ORDER_CREATED wird ohne
// statusTransition auditiert; ein Auftrag "wird" nicht selbst erstellt,
// sondern EXISTIERT ab diesem Zeitpunkt – die beiden Statusübergänge folgen
// als eigene Ereignisse).
function createForCustomer(db, identity, input) {
  const fields = sanitizeFields(input);
  const now = nowIso();

  // Business-Use-/Safety-Gate VOR jeder Speicherung (Auftrag Abschnitt C).
  // Wirft bei BLOCK (kein Auftrag entsteht).
  const gateResult = enforceBusinessUsePolicy(db, identity, fields);

  if (gateResult.decision === "ESCALATE") {
    // Minimale, sichere Form: der Auftrag wird direkt mit Status ESCALATED
    // gespeichert, OHNE die automatische Vollständigkeitsregel zu
    // durchlaufen (Auftrag Abschnitt C: "kein normaler
    // READY_FOR_PROCESSING-Status"). statusNote bleibt NULL – der Grund
    // steht ausschließlich als Kategorie in policy_violations, nicht als
    // Freitext im Auftrag.
    const order = authDb.createWorkOrder(db, {
      tenantId: identity.tenantId,
      createdByUserId: identity.userId,
      title: fields.title,
      desiredResult: fields.desiredResult,
      context: fields.context,
      deadlineText: fields.deadlineText,
      status: "ESCALATED",
      statusNote: null,
      decidedAt: now,
      now,
    });
    auditSafe(db, {
      eventType: "WORK_ORDER_CREATED",
      result: "OK",
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      workOrderId: order.id,
    });
    auditSafe(db, {
      eventType: "WORK_ORDER_SUBMITTED",
      result: "OK",
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      workOrderId: order.id,
      statusTransition: "DRAFT->SUBMITTED",
    });
    recordEscalationViolation(db, identity, order.id, gateResult);
    return customerView(order);
  }

  const decision = evaluateAutomaticDecision(fields);
  const order = authDb.createWorkOrder(db, {
    tenantId: identity.tenantId,
    createdByUserId: identity.userId,
    title: fields.title,
    desiredResult: fields.desiredResult,
    context: fields.context,
    deadlineText: fields.deadlineText,
    status: decision.status,
    statusNote: decision.statusNote,
    decidedAt: now,
    now,
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_CREATED",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: identity.tenantId,
    workOrderId: order.id,
  });
  auditSafe(db, {
    eventType: "WORK_ORDER_SUBMITTED",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: identity.tenantId,
    workOrderId: order.id,
    statusTransition: "DRAFT->SUBMITTED",
  });
  // Automatische Systementscheidung: actorUserId bewusst NULL (kein
  // Owner-, kein Kunden-Akteur), damit das Auditprotokoll selbst
  // unmissverständlich zeigt, dass hier keine Person entschieden hat.
  auditSafe(db, {
    eventType: decision.eventType,
    result: "OK",
    actorUserId: null,
    tenantId: identity.tenantId,
    workOrderId: order.id,
    statusTransition: `SUBMITTED->${decision.status}`,
  });
  return customerView(order);
}

// Auftrag Abschnitt C/E: NEEDS_CLARIFICATION -> SUBMITTED -> (automatisch)
// READY_FOR_PROCESSING|NEEDS_CLARIFICATION, Kunde darf dabei die Felder
// ergänzen. getForCustomer wirft bereits das identische generische 404 bei
// fremdem/unbekanntem Auftrag (inkl. Tenant-Mismatch-Audit) – hier wird
// zusätzlich der Ausgangsstatus geprüft (409 bei ungültigem Übergang, z. B.
// erneutes Absenden eines bereits READY_FOR_PROCESSING-Auftrags).
function resubmitForCustomer(db, identity, workOrderId, input) {
  const existing = getForCustomer(db, identity, workOrderId);
  if (existing.status !== "NEEDS_CLARIFICATION") {
    throw conflict("Dieser Auftrag kann derzeit nicht erneut abgesendet werden.");
  }
  const fields = sanitizeFields(input);

  // Business-Use-/Safety-Gate VOR jeder erneuten Speicherung (identische
  // Regel wie bei der Erstanlage – Auftrag Abschnitt C). Wirft bei BLOCK;
  // der bestehende Auftrag bleibt dabei unverändert in NEEDS_CLARIFICATION.
  const gateResult = enforceBusinessUsePolicy(db, identity, fields);

  if (gateResult.decision === "ESCALATE") {
    const updated = authDb.resubmitWorkOrder(db, workOrderId, identity.tenantId, "NEEDS_CLARIFICATION", {
      ...fields,
      status: "ESCALATED",
      statusNote: null,
    });
    if (!updated) {
      throw conflict("Dieser Auftrag kann derzeit nicht erneut abgesendet werden.");
    }
    auditSafe(db, {
      eventType: "WORK_ORDER_RESUBMITTED",
      result: "OK",
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      workOrderId: updated.id,
      statusTransition: "NEEDS_CLARIFICATION->SUBMITTED",
    });
    recordEscalationViolation(db, identity, updated.id, gateResult);
    return customerView(updated);
  }

  const decision = evaluateAutomaticDecision(fields);
  const updated = authDb.resubmitWorkOrder(db, workOrderId, identity.tenantId, "NEEDS_CLARIFICATION", {
    ...fields,
    status: decision.status,
    statusNote: decision.statusNote,
  });
  if (!updated) {
    // Wettlaufsituation (z. B. zwischenzeitlich bereits storniert) –
    // derselbe Konfliktfehler wie beim vorherigen Statuscheck.
    throw conflict("Dieser Auftrag kann derzeit nicht erneut abgesendet werden.");
  }
  auditSafe(db, {
    eventType: "WORK_ORDER_RESUBMITTED",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: identity.tenantId,
    workOrderId: updated.id,
    statusTransition: "NEEDS_CLARIFICATION->SUBMITTED",
  });
  auditSafe(db, {
    eventType: decision.eventType,
    result: "OK",
    actorUserId: null,
    tenantId: identity.tenantId,
    workOrderId: updated.id,
    statusTransition: `SUBMITTED->${decision.status}`,
  });
  return customerView(updated);
}

// Auftrag: "Kunden-Cancel, sofern sicher und im Scope". Der Kunde darf
// einen eigenen, noch nicht abgeschlossenen Auftrag jederzeit selbst
// zurückziehen – bewusst NICHT aus ESCALATED heraus (siehe
// CUSTOMER_CANCELLABLE_FROM): ein vom Owner aus Sicherheits-/
// Missbrauchsgründen eskalierter Fall soll sich nicht durch eine einfache
// Kundenaktion der weiteren Prüfung entziehen können.
const CUSTOMER_CANCELLABLE_FROM = Object.freeze(["SUBMITTED", "NEEDS_CLARIFICATION", "READY_FOR_PROCESSING"]);

function cancelForCustomer(db, identity, workOrderId) {
  const existing = getForCustomer(db, identity, workOrderId);
  if (!CUSTOMER_CANCELLABLE_FROM.includes(existing.status)) {
    throw conflict("Dieser Auftrag kann derzeit nicht storniert werden.");
  }
  const updated = authDb.transitionWorkOrder(db, workOrderId, {
    tenantId: identity.tenantId,
    fromStatuses: CUSTOMER_CANCELLABLE_FROM,
    toStatus: "CANCELLED",
    statusNote: null,
    decidedByUserId: identity.userId,
  });
  if (!updated) {
    throw conflict("Dieser Auftrag kann derzeit nicht storniert werden.");
  }
  auditSafe(db, {
    eventType: "WORK_ORDER_CANCELLED",
    result: "OK",
    actorUserId: identity.userId,
    tenantId: identity.tenantId,
    workOrderId: updated.id,
    statusTransition: `${existing.status}->CANCELLED`,
  });
  return customerView(updated);
}

// ---------------------------------------------------------------------------
// Ownerfunktionen (Auftrag Abschnitt F, PRODUKTKORRIGIERT). Der Owner sieht
// mandantenübergreifend alle Aufträge ausschließlich als Betriebsübersicht
// und darf AUSSCHLIESSLICH zwei Ausnahmeaktionen auslösen – beide erfordern
// einen Grund. Es gibt bewusst KEINE Funktion, die einen Auftrag regulär
// fachlich freigibt oder ablehnt.
// ---------------------------------------------------------------------------

function listForOwner(db) {
  return authDb.listAllWorkOrders(db).map((order) => ownerView(db, order));
}

function getForOwner(db, workOrderId) {
  const order = authDb.getWorkOrderById(db, workOrderId);
  if (!order) {
    throw notFound();
  }
  return ownerView(db, order);
}

// Ausnahmefall "explizite Eskalation": der Owner markiert einen laufenden
// Auftrag für besondere Aufmerksamkeit (Sicherheit, Missbrauch, rechtliche
// Sensibilität, außergewöhnliche Kosten, technische Blockade). ESCALATED
// ist in diesem Schritt selbst noch nicht terminal – der einzige
// vorgesehene Folgeschritt ist stopForOwner (siehe dort); ein Zurückführen
// in den Normalablauf ist bewusst NICHT Teil von Schritt 1.
const OWNER_ESCALATABLE_FROM = Object.freeze(["SUBMITTED", "NEEDS_CLARIFICATION", "READY_FOR_PROCESSING"]);

function escalateForOwner(db, workOrderId, actorUserId, input) {
  const existing = authDb.getWorkOrderById(db, workOrderId);
  if (!existing) {
    throw notFound();
  }
  const reason = sanitizeOwnerActionReason(input);
  if (!OWNER_ESCALATABLE_FROM.includes(existing.status)) {
    throw conflict("Dieser Auftrag kann derzeit nicht eskaliert werden.");
  }
  const updated = authDb.transitionWorkOrder(db, workOrderId, {
    fromStatuses: OWNER_ESCALATABLE_FROM,
    toStatus: "ESCALATED",
    statusNote: reason,
    decidedByUserId: actorUserId || null,
  });
  if (!updated) {
    throw conflict("Dieser Auftrag kann derzeit nicht eskaliert werden.");
  }
  auditSafe(db, {
    eventType: "WORK_ORDER_ESCALATED",
    result: "OK",
    actorUserId,
    tenantId: updated.tenantId,
    workOrderId: updated.id,
    statusTransition: `${existing.status}->ESCALATED`,
  });
  return ownerView(db, updated);
}

// Einzige weitere Owner-Aktion: ein Auftrag wird "aus Sicherheits-/
// Betriebsgründen gestoppt" (Auftrag). Bewusst NICHT an eine vorherige
// Eskalation gekoppelt – ein dringender Sicherheitsstopp darf nicht an
// einen zusätzlichen Zwischenschritt gebunden sein. CANCELLED ist terminal.
const OWNER_STOPPABLE_FROM = Object.freeze(["SUBMITTED", "NEEDS_CLARIFICATION", "READY_FOR_PROCESSING", "ESCALATED"]);

function stopForOwner(db, workOrderId, actorUserId, input) {
  const existing = authDb.getWorkOrderById(db, workOrderId);
  if (!existing) {
    throw notFound();
  }
  const reason = sanitizeOwnerActionReason(input);
  if (!OWNER_STOPPABLE_FROM.includes(existing.status)) {
    throw conflict("Dieser Auftrag kann derzeit nicht gestoppt werden.");
  }
  const updated = authDb.transitionWorkOrder(db, workOrderId, {
    fromStatuses: OWNER_STOPPABLE_FROM,
    toStatus: "CANCELLED",
    statusNote: reason,
    decidedByUserId: actorUserId || null,
  });
  if (!updated) {
    throw conflict("Dieser Auftrag kann derzeit nicht gestoppt werden.");
  }
  auditSafe(db, {
    eventType: "WORK_ORDER_CANCELLED",
    result: "OK",
    actorUserId,
    tenantId: updated.tenantId,
    workOrderId: updated.id,
    statusTransition: `${existing.status}->CANCELLED`,
  });
  return ownerView(db, updated);
}

const OWNER_ACTIONS = Object.freeze({
  escalate: escalateForOwner,
  stop: stopForOwner,
});

function actionForOwner(db, workOrderId, action, actorUserId, input) {
  const handler = OWNER_ACTIONS[action];
  if (!handler) {
    throw badRequest("Unbekannte Aktion.");
  }
  return handler(db, workOrderId, actorUserId, input);
}

module.exports = {
  WorkOrderError,
  STATUS_LABELS,
  REACHABLE_STATUS_VALUES,
  TITLE_MAX,
  DESIRED_RESULT_MAX,
  CONTEXT_MAX,
  DEADLINE_TEXT_MAX,
  STATUS_NOTE_MAX,
  statusLabel,
  listForCustomer,
  getForCustomer,
  createForCustomer,
  resubmitForCustomer,
  cancelForCustomer,
  listForOwner,
  getForOwner,
  actionForOwner,
};
