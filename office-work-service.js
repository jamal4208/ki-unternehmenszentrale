"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt H/I/
// J/K/L/M).
//
// Dieses Modul baut das Office-Agentenmodell (H) sowie das persistente
// Office-Auftragsmodell (I) inklusive der vier deterministischen,
// vollständig lokalen Offline-Korridore (J Gmail, K Kalender, L Drive/
// Dokumente, M Kontakte). Es importiert KEIN better-sqlite3 selbst (erhält
// stets ein bereits geöffnetes Datenbankobjekt), führt KEINEN
// Netzwerkaufruf aus und ruft NIEMALS google-workspace-connector.js mit
// einer echten Providerfunktion auf.
//
// Sicherheitsgrenze (Auftrag Abschnitt I, nicht verhandelbar): Diese Datei
// darf einen Office-Auftrag technisch NIEMALS über den Ausführungsstatus
// "WAITING_FOR_AUTHENTICATION" hinaus weiterschalten (kein
// "READY_FOR_PROVIDER", kein "EXECUTED"). Siehe assertExecutionStatusAllowed
// unten – das ist keine Empfehlung, sondern eine harte Prüfung, die bei
// Verstoß eine Ausnahme wirft.

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");
const capabilityService = require("./google-workspace-capability-service");

const CATEGORY_VALUES = migrations.OFFICE_WORK_ITEM_CATEGORY_VALUES;
const EXTERNAL_EFFECT_VALUES = migrations.OFFICE_EXTERNAL_EFFECT_VALUES;
const APPROVAL_STATUS_VALUES = migrations.OFFICE_WORK_ITEM_APPROVAL_STATUS_VALUES;
const EXECUTION_STATUS_VALUES = migrations.OFFICE_WORK_ITEM_EXECUTION_STATUS_VALUES;
const DATA_SENSITIVITY_VALUES = migrations.DATA_SENSITIVITY_VALUES;

// V7.6.1 für diesen Lauf technisch erreichbare Höchststufe (Auftrag
// Abschnitt I: "maximal bis WAITING_FOR_AUTHENTICATION"). Jeder Versuch,
// darüber hinauszugehen, wird von assertExecutionStatusAllowed blockiert.
const MAX_REACHABLE_EXECUTION_STATUS = "WAITING_FOR_AUTHENTICATION";
const ALLOWED_EXECUTION_STATUS_VALUES = Object.freeze([
  "NOT_STARTED",
  "WAITING_FOR_AUTHENTICATION",
  "EXECUTION_BLOCKED",
  "FAILED",
  "CANCELLED",
]);

class OfficeWorkError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "OfficeWorkError";
    this.statusCode = statusCode;
  }
}
function badRequest(message) {
  return new OfficeWorkError(message, 400);
}
function notFound(message) {
  return new OfficeWorkError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}
function truncate(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// ---------------------------------------------------------------------------
// H. Office-Agentenmodell – fachliche Zuordnung ausschließlich VORHANDENER
// agent-registry.js-Agenten. Erzeugt keinen 26. Agenten, kaschiert die
// Finance-Capability-Gap nicht (dort steht ausdrücklich kein Agent,
// gleicher Befund wie agent-organization-service.js#CAPABILITY_GAP).
// Genau ein ownerRole je Office-Rolle – Contributors sind an anderer Stelle
// (pro Auftrag) frei wählbar, siehe createWorkItem unten.
// ---------------------------------------------------------------------------
const OFFICE_AGENT_ROLE_MODEL = Object.freeze([
  {
    role: "OFFICE_LEAD",
    roleLabel: "Office Lead",
    agentId: "orchestrator-agent",
    note: "Koordiniert Agentenperspektiven read-only (agent-registry.js); orchestriert Office-Aufträge, entscheidet selbst nichts final.",
  },
  {
    role: "EMAIL_PREPARATION",
    roleLabel: "E-Mail-Vorbereitung",
    agentId: "communication-agent",
    note: "Formuliert Übergabe und Kommunikation; bereitet Gmail-Entwürfe vor, sendet nichts.",
  },
  {
    role: "CALENDAR_COORDINATION",
    roleLabel: "Kalenderkoordination",
    agentId: "workflow-agent",
    note: "Bewertet Ablauf und Reihenfolge; bereitet Terminentwürfe vor, erstellt keine echten Termine.",
  },
  {
    role: "DOCUMENT_MANAGEMENT",
    roleLabel: "Dokumentenmanagement",
    agentId: "documentation-agent",
    note: "Strukturiert Übergabe und Dokumentation; bereitet Drive-/Dokumententwürfe vor, erstellt keine echten Dateien.",
  },
  {
    role: "CONTACTS_STAKEHOLDERS",
    roleLabel: "Kontakte/Stakeholder",
    agentId: "customer-value-agent",
    note: "Bewertet Nutzen aus Kundensicht; bereitet Kontaktsuchaufträge vor, liest keine echten Kontakte.",
  },
  {
    role: "PROJECT_MANAGER_ORCHESTRATION",
    roleLabel: "Projektmanager-Orchestrierung",
    agentId: "project-status-agent",
    note: "Verdichtet Ist-Stand und Fortschritt über alle Office-Aufträge hinweg.",
  },
  {
    role: "QUALITY_SECURITY",
    roleLabel: "Qualität/Sicherheit",
    agentId: "security-agent",
    note: "Bewertet Sicherheitsgrenzen und Risiken jedes Office-Auftrags vor einer möglichen Freigabe.",
  },
  {
    role: "JAMAL_APPROVAL",
    roleLabel: "Jamal-Freigabe",
    agentId: null,
    note: "Kein Agent – ausschließlich Jamal selbst entscheidet über jede externe Wirkung (OWNER, kein Agentenkonto).",
  },
]);

function listOfficeAgentRoleModel() {
  return OFFICE_AGENT_ROLE_MODEL.map((entry) => ({ ...entry }));
}

function assertKnownAgentId(agentId, fieldLabel) {
  if (agentId === null || agentId === undefined) return;
  const knownAgentIds = capabilityService.ALL_CAPABILITIES.reduce((set, item) => {
    item.allowedAgentIds.forEach((id) => set.add(id));
    return set;
  }, new Set(OFFICE_AGENT_ROLE_MODEL.filter((entry) => entry.agentId).map((entry) => entry.agentId)));
  if (!knownAgentIds.has(agentId)) {
    throw badRequest(`${fieldLabel} muss einer der bekannten Office-Agenten sein.`);
  }
}

function assertExecutionStatusAllowed(executionStatus) {
  if (!ALLOWED_EXECUTION_STATUS_VALUES.includes(executionStatus)) {
    throw badRequest(
      `V7.6.1 erlaubt lokal maximal den Ausführungsstatus "${MAX_REACHABLE_EXECUTION_STATUS}". "${executionStatus}" würde einen echten Provideraufruf voraussetzen und ist in diesem Lauf technisch gesperrt.`,
    );
  }
}

// ---------------------------------------------------------------------------
// J. Gmail-Offline-Korridor – rein lokale, deterministische Klassifikation
// und Entwurfsvorbereitung. Führt niemals eine Aktion in einem echten
// Postfach aus.
// ---------------------------------------------------------------------------
const EMAIL_ACTION_VALUES = Object.freeze([
  "NEW_MESSAGE",
  "REPLY_DRAFT",
  "FORWARD_NOTE",
  "ARCHIVE_OR_LABEL_SUGGESTION",
]);

function prepareEmailDraft(input = {}) {
  const action = input.action;
  if (!EMAIL_ACTION_VALUES.includes(action)) {
    throw badRequest("emailAction muss NEW_MESSAGE, REPLY_DRAFT, FORWARD_NOTE oder ARCHIVE_OR_LABEL_SUGGESTION sein.");
  }
  const recipient = truncate(input.recipient, 200);
  const subject = truncate(input.subject, 200);
  const bodyDraft = truncate(input.bodyDraft, 3000);
  const missing = [];
  if (!recipient) missing.push("Empfänger fehlt.");
  if (!subject) missing.push("Betreff fehlt.");
  if (!bodyDraft) missing.push("Textvorschlag fehlt.");
  const attachmentsDescribed = Array.isArray(input.attachmentsDescribed)
    ? input.attachmentsDescribed.map((entry) => truncate(entry, 200)).filter(Boolean).slice(0, 20)
    : [];
  const sensitiveContentFlag = Boolean(input.sensitiveContentFlag);

  return Object.freeze({
    corridor: "GMAIL_OFFLINE",
    action,
    recipient: recipient || null,
    subject: subject || null,
    bodyDraft: bodyDraft || null,
    attachmentsDescribed,
    attachmentsNote: "Anhänge werden nur beschrieben, niemals hochgeladen.",
    sensitiveContentFlag,
    missingInformation: missing,
    safePreview: subject ? `Entwurfsvorschau – Betreff: "${subject}"` : "Entwurfsvorschau – noch kein Betreff hinterlegt.",
    externalEffectIfSent: "DIRECT_EXTERNAL_COMMUNICATION",
    notExecuted: ["senden", "in Gmail speichern", "weiterleiten", "archivieren", "labeln", "löschen"],
  });
}

// ---------------------------------------------------------------------------
// K. Kalender-Offline-Korridor
// ---------------------------------------------------------------------------
function prepareCalendarDraft(input = {}) {
  const participants = Array.isArray(input.participants)
    ? input.participants.map((entry) => truncate(entry, 200)).filter(Boolean).slice(0, 50)
    : [];
  const missing = [];
  const title = truncate(input.title, 200);
  const date = truncate(input.date, 40);
  const time = truncate(input.time, 40);
  if (!title) missing.push("Titel fehlt.");
  if (!date) missing.push("Datum fehlt.");
  if (!time) missing.push("Uhrzeit fehlt.");
  if (participants.length === 0) missing.push("Keine Teilnehmer erfasst.");

  return Object.freeze({
    corridor: "CALENDAR_OFFLINE",
    title: title || null,
    date: date || null,
    time: time || null,
    timezone: truncate(input.timezone, 60) || "Europe/Berlin",
    durationMinutes: Number.isFinite(input.durationMinutes) ? input.durationMinutes : null,
    participants,
    location: truncate(input.location, 200) || null,
    description: truncate(input.description, 1000) || null,
    reminders: truncate(input.reminders, 200) || null,
    busyFree: input.busyFree === "BUSY" || input.busyFree === "FREE" ? input.busyFree : "UNKNOWN",
    invitationNeeded: Boolean(input.invitationNeeded),
    conflictRisk: "AVAILABILITY_NOT_VERIFIED",
    systemResponsibility: input.systemResponsibility === "APPLE" ? "APPLE" : "GOOGLE_WORKSPACE",
    availabilityVerified: false,
    availabilityNote: "AVAILABILITY_NOT_VERIFIED – keine echte Verfügbarkeitsprüfung in V7.6.1.",
    missingInformation: missing,
    notExecuted: ["Termine lesen", "Termine erstellen", "Apple-Kalender verändern", "automatische Einladung senden"],
    futurePreparation: {
      laterReadOnlyAvailabilityCheck: true,
      laterEventCreateGate: true,
      automaticInvitation: false,
    },
  });
}

// ---------------------------------------------------------------------------
// L. Drive-/Dokumenten-Korridor
// ---------------------------------------------------------------------------
const DOCUMENT_TYPE_VALUES = Object.freeze([
  "DOCUMENT_DRAFT",
  "FOLDER_PLAN",
  "FILE_NAMING_CONVENTION",
  "HANDOVER_DOCUMENT",
  "MEETING_NOTE",
  "DECISION_TEMPLATE",
  "PROJECT_STATUS",
  "PROCESS_DESCRIPTION",
]);

function prepareDocumentDraft(input = {}) {
  const documentType = DOCUMENT_TYPE_VALUES.includes(input.documentType) ? input.documentType : null;
  if (!documentType) {
    throw badRequest(`documentType muss einer von ${DOCUMENT_TYPE_VALUES.join(", ")} sein.`);
  }
  const title = truncate(input.title, 200);
  const missing = [];
  if (!title) missing.push("Titel fehlt.");
  const externalRecipients = Array.isArray(input.externalRecipients)
    ? input.externalRecipients.map((entry) => truncate(entry, 200)).filter(Boolean).slice(0, 20)
    : [];

  return Object.freeze({
    corridor: "DRIVE_DOCS_OFFLINE",
    documentType,
    targetFolder: truncate(input.targetFolder, 200) || null,
    owner: truncate(input.owner, 200) || null,
    title: title || null,
    contentPreview: truncate(input.content, 2000) || null,
    version: truncate(input.version, 40) || "v0.1-Entwurf",
    sensitivity: DATA_SENSITIVITY_VALUES.includes(input.sensitivity) ? input.sensitivity : "MEDIUM",
    plannedSharing: truncate(input.plannedSharing, 300) || null,
    externalRecipients,
    retentionRule: truncate(input.retentionRule, 300) || null,
    missingInformation: missing,
    notExecuted: ["Drive lesen", "Datei erstellen", "Datei verschieben", "Datei teilen", "Datei löschen"],
  });
}

// ---------------------------------------------------------------------------
// M. Kontakt-Korridor
// ---------------------------------------------------------------------------
function prepareContactSearchRequest(input = {}) {
  const expectedName = truncate(input.expectedName, 200);
  const missing = [];
  if (!expectedName) missing.push("Erwarteter Name fehlt.");
  if (!truncate(input.purpose, 300)) missing.push("Zweck fehlt.");

  return Object.freeze({
    corridor: "CONTACTS_OFFLINE",
    expectedName: expectedName || null,
    company: truncate(input.company, 200) || null,
    role: truncate(input.role, 200) || null,
    neededInformation: truncate(input.neededInformation, 300) || null,
    purpose: truncate(input.purpose, 300) || null,
    privacyClass: DATA_SENSITIVITY_VALUES.includes(input.privacyClass) ? input.privacyClass : "MEDIUM",
    plannedUse: truncate(input.plannedUse, 300) || null,
    missingInformation: missing,
    notExecuted: ["echte Kontakte lesen", "echte Kontakte verändern"],
  });
}

const CATEGORY_DRAFT_BUILDERS = Object.freeze({
  EMAIL: prepareEmailDraft,
  CALENDAR: prepareCalendarDraft,
  DOCUMENT: prepareDocumentDraft,
  CONTACT: prepareContactSearchRequest,
  GENERAL_OFFICE: (input) => Object.freeze({
    corridor: "GENERAL_OFFICE_OFFLINE",
    note: truncate(input.note, 1000) || null,
    missingInformation: truncate(input.note, 1000) ? [] : ["Kein Hinweistext hinterlegt."],
    notExecuted: ["jede externe Aktion"],
  }),
});

function buildSafeSummary(category, draftPayload) {
  if (category === "EMAIL") {
    return `E-Mail-Entwurf (${draftPayload.action || "unbekannte Aktion"}) an "${draftPayload.recipient || "unbekannt"}" – nicht gesendet.`;
  }
  if (category === "CALENDAR") {
    return `Terminentwurf "${draftPayload.title || "ohne Titel"}" am ${draftPayload.date || "unbekanntes Datum"} – Verfügbarkeit nicht geprüft, nicht erstellt.`;
  }
  if (category === "DOCUMENT") {
    return `Dokumententwurf (${draftPayload.documentType}) "${draftPayload.title || "ohne Titel"}" – keine echte Drive-Datei erzeugt.`;
  }
  if (category === "CONTACT") {
    return `Kontaktsuchauftrag für "${draftPayload.expectedName || "unbekannt"}" – keine echten Kontakte gelesen.`;
  }
  return "Allgemeiner Office-Auftrag – rein vorbereitend, keine externe Aktion.";
}

// ---------------------------------------------------------------------------
// I. Office-Auftragsmodell – persistente Anlage.
// ---------------------------------------------------------------------------
function createWorkItem(db, input = {}) {
  const category = input.category;
  if (!CATEGORY_VALUES.includes(category)) {
    throw badRequest(`category muss einer von ${CATEGORY_VALUES.join(", ")} sein.`);
  }
  const title = truncate(input.title, 200);
  const requestedOutcome = truncate(input.requestedOutcome, 500);
  if (!title) throw badRequest("title ist erforderlich.");
  if (!requestedOutcome) throw badRequest("requestedOutcome ist erforderlich.");

  const ownerAgentId = input.ownerAgentId;
  if (!ownerAgentId) throw badRequest("ownerAgentId ist erforderlich (genau ein Owner je Office-Auftrag).");
  assertKnownAgentId(ownerAgentId, "ownerAgentId");

  const contributorAgentIds = Array.isArray(input.contributorAgentIds)
    ? Array.from(new Set(input.contributorAgentIds.filter(Boolean)))
    : [];
  contributorAgentIds.forEach((id) => assertKnownAgentId(id, "contributorAgentIds"));
  if (contributorAgentIds.includes(ownerAgentId)) {
    throw badRequest("ownerAgentId darf nicht zugleich als contributorAgentIds auftreten.");
  }

  let requestedCapability = null;
  if (input.requestedCapabilityId) {
    requestedCapability = capabilityService.getCapabilityById(input.requestedCapabilityId);
    if (!requestedCapability) throw badRequest("requestedCapabilityId ist keine bekannte Fähigkeit.");
  }

  const permissionLevelRequired = requestedCapability
    ? requestedCapability.recommendedInitialState
    : (capabilityService.PERMISSION_LEVEL_VALUES.includes(input.permissionLevelRequired)
      ? input.permissionLevelRequired
      : "PREPARE_DRAFT");
  const dataSensitivity = requestedCapability
    ? requestedCapability.dataSensitivity
    : (DATA_SENSITIVITY_VALUES.includes(input.dataSensitivity) ? input.dataSensitivity : "MEDIUM");
  const externalEffect = requestedCapability
    ? (EXTERNAL_EFFECT_VALUES.includes(requestedCapability.externalEffect) ? requestedCapability.externalEffect : "NONE")
    : (EXTERNAL_EFFECT_VALUES.includes(input.externalEffect) ? input.externalEffect : "NONE");

  const draftBuilder = CATEGORY_DRAFT_BUILDERS[category];
  const draftPayload = draftBuilder(input.draftInput || {});
  const safeSummary = buildSafeSummary(category, draftPayload);
  const draftPayloadJson = JSON.stringify(draftPayload);
  if (draftPayloadJson.length > 4000) {
    throw badRequest("Der Entwurfsinhalt ist zu umfangreich für die lokale Vorbereitung (maximal 4000 Zeichen).");
  }

  const now = input.now || new Date();
  const record = {
    id: crypto.randomUUID(),
    title,
    requestedOutcome,
    category,
    targetIdentityId: input.targetIdentityId || null,
    ownerAgentId,
    contributorAgentIdsJson: JSON.stringify(contributorAgentIds),
    requestedCapabilityId: requestedCapability ? requestedCapability.capabilityId : null,
    permissionLevelRequired,
    dataSensitivity,
    externalEffect,
    draftPayloadJson,
    safeSummary,
    approvalStatus: "DRAFT",
    executionStatus: "NOT_STARTED",
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  };
  const inserted = authDb.insertOfficeWorkItem(db, record);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "OFFICE_WORK_ITEM_CREATED",
      result: "OK",
      actorUserId: input.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { officeWorkItemId: record.id, officeCategory: category },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Anlage nicht rückgängig machen. */
  }

  return rowToWorkItemView(inserted);
}

function rowToWorkItemView(row) {
  if (!row) return null;
  let draftPayload = null;
  try {
    draftPayload = row.draftPayloadJson ? JSON.parse(row.draftPayloadJson) : null;
  } catch (_error) {
    draftPayload = null;
  }
  let contributorAgentIds = [];
  try {
    contributorAgentIds = row.contributorAgentIdsJson ? JSON.parse(row.contributorAgentIdsJson) : [];
  } catch (_error) {
    contributorAgentIds = [];
  }
  return {
    id: row.id,
    title: row.title,
    requestedOutcome: row.requestedOutcome,
    category: row.category,
    targetIdentityId: row.targetIdentityId,
    ownerAgentId: row.ownerAgentId,
    contributorAgentIds,
    requestedCapabilityId: row.requestedCapabilityId,
    permissionLevelRequired: row.permissionLevelRequired,
    dataSensitivity: row.dataSensitivity,
    externalEffect: row.externalEffect,
    draftPayload,
    safeSummary: row.safeSummary,
    approvalStatus: row.approvalStatus,
    executionStatus: row.executionStatus,
    providerReference: row.providerReference,
    resultSummary: row.resultSummary,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    maxReachableExecutionStatus: MAX_REACHABLE_EXECUTION_STATUS,
    noRealProviderCall: true,
  };
}

function listWorkItems(db, filter = {}) {
  return authDb.listOfficeWorkItems(db, filter).map(rowToWorkItemView);
}

function getWorkItemById(db, id) {
  const row = authDb.getOfficeWorkItemById(db, id);
  return row ? rowToWorkItemView(row) : null;
}

// Jamal-Prüfung eines Office-Auftrags: bewegt approvalStatus/executionStatus
// innerhalb der in V7.6.1 erlaubten Grenze weiter. "APPROVED_FOR_EXTERNAL_
// ACTION" (approvalStatus) ist zulässig – das ist Jamals fachliche
// Freigabeentscheidung; die TECHNISCHE Ausführung bleibt trotzdem auf
// WAITING_FOR_AUTHENTICATION begrenzt (siehe assertExecutionStatusAllowed).
function reviewWorkItem(db, options = {}) {
  const workItemId = options.workItemId;
  if (!workItemId) throw badRequest("workItemId ist erforderlich.");
  const row = authDb.getOfficeWorkItemById(db, workItemId);
  if (!row) throw notFound("Dieser Office-Auftrag wurde nicht gefunden.");

  const approvalStatus = options.approvalStatus || row.approvalStatus;
  if (!APPROVAL_STATUS_VALUES.includes(approvalStatus)) {
    throw badRequest("Ein gültiger approvalStatus ist erforderlich.");
  }
  let executionStatus = row.executionStatus;
  if (approvalStatus === "APPROVED_FOR_EXTERNAL_ACTION" && executionStatus === "NOT_STARTED") {
    executionStatus = "WAITING_FOR_AUTHENTICATION";
  }
  if (options.executionStatus) {
    executionStatus = options.executionStatus;
  }
  assertExecutionStatusAllowed(executionStatus);

  const now = options.now || new Date();
  const updated = authDb.updateOfficeWorkItemStatus(db, {
    id: workItemId,
    approvalStatus,
    executionStatus,
    resultSummary: row.resultSummary,
    errorCode: row.errorCode,
    updatedAt: nowIso(now),
  });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "OFFICE_WORK_ITEM_REVIEWED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { officeWorkItemId: workItemId, approvalStatusCode: approvalStatus },
    });
    if (approvalStatus === "APPROVED_FOR_EXTERNAL_ACTION") {
      authAudit.recordAuditEvent(db, {
        eventType: "OFFICE_EXTERNAL_ACTION_APPROVED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { officeWorkItemId: workItemId },
      });
    }
    if (executionStatus === "WAITING_FOR_AUTHENTICATION") {
      authAudit.recordAuditEvent(db, {
        eventType: "OFFICE_AUTHENTICATION_REQUIRED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { officeWorkItemId: workItemId },
      });
    }
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Prüfung nicht rückgängig machen. */
  }

  return rowToWorkItemView(updated);
}

module.exports = {
  CATEGORY_VALUES,
  EXTERNAL_EFFECT_VALUES,
  APPROVAL_STATUS_VALUES,
  EXECUTION_STATUS_VALUES,
  MAX_REACHABLE_EXECUTION_STATUS,
  DOCUMENT_TYPE_VALUES,
  EMAIL_ACTION_VALUES,
  OFFICE_AGENT_ROLE_MODEL,
  OfficeWorkError,
  listOfficeAgentRoleModel,
  prepareEmailDraft,
  prepareCalendarDraft,
  prepareDocumentDraft,
  prepareContactSearchRequest,
  createWorkItem,
  listWorkItems,
  getWorkItemById,
  reviewWorkItem,
};
