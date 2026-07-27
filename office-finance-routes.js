"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt S).
//
// Kleines, separates HTTP-Glue-Modul (gleiches Muster wie
// agent-leadership-routes.js): übersetzt ausschließlich HTTP (Body lesen,
// bekannte Felder prüfen, Fehler auf Statuscodes abbilden) und stellt die
// Daten für die neue Ansicht "Office & Finanzen" zusammen. Jede Fachregel
// selbst lebt in external-identity-service.js/
// google-workspace-capability-service.js/office-work-service.js/
// finance-handoff-service.js. Dieses Modul importiert NIEMALS
// better-sqlite3 direkt; die Datenbank wird ihm bei jedem Aufruf über
// `deps.getDb()` gereicht.
//
// CSRF, Origin-/Host-Prüfung und OWNER_ONLY-Zugriff laufen bereits VOR
// jedem Aufruf dieser Handler (route-access-policy.js/
// auth-route-guard.js/server.js), gleiches etabliertes Muster wie
// dispatchAgentLeadershipActionPostPrefix. Keine Route dieses Moduls führt
// eine echte externe Aktion aus, keine Loginroute, keine OAuthroute, keine
// Callbackroute, keine Send-/Create-/Delete-Providerroute.

const externalIdentityService = require("./external-identity-service");
const capabilityService = require("./google-workspace-capability-service");
const officeWorkService = require("./office-work-service");
const financeHandoffService = require("./finance-handoff-service");

const OFFICE_FINANCE_API_MAX_BODY_BYTES = 8 * 1024;

function readJsonRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    if (!/^application\/json(;|$)/i.test(contentType.trim())) {
      reject(Object.assign(new Error("Content-Type muss application/json sein."), { statusCode: 415 }));
      return;
    }
    let received = 0;
    const chunks = [];
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBytes) {
        rejected = true;
        reject(Object.assign(new Error("Anfragekörper überschreitet die Größenbegrenzung."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(Object.assign(new Error("Anfragekörper muss ein JSON-Objekt sein."), { statusCode: 400 }));
          return;
        }
        resolve(parsed);
      } catch (_error) {
        reject(Object.assign(new Error("Anfragekörper ist kein gültiges JSON."), { statusCode: 400 }));
      }
    });
    req.on("error", () => {
      if (rejected) return;
      reject(Object.assign(new Error("Anfrage konnte nicht gelesen werden."), { statusCode: 400 }));
    });
  });
}

function assertKnownFieldsOnly(body, allowedFields, label) {
  const unknown = Object.keys(body || {}).filter((key) => !allowedFields.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label}: unbekannte Felder werden abgewiesen (${unknown.join(", ")}).`);
  }
}

function genericErrorPayload(message) {
  return { ok: false, message: message || "Aktion ist im aktuellen Zustand nicht möglich." };
}

function actorUserIdFromContext(context) {
  const identity = context && context.identity;
  return identity && !identity.isBypass ? identity.userId : null;
}

function sendServiceError(res, sendJson, error) {
  if (
    error &&
    (error.name === "ExternalIdentityError" || error.name === "OfficeWorkError" || error.name === "FinanceHandoffError")
  ) {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload(error && error.message));
}

// ---------------------------------------------------------------------------
// Sicherheits-/Autonomiegrenzen (Auftrag Abschnitt U/Y) – als fester,
// unveränderlicher Textblock in JEDER Antwort dieses Moduls sichtbar,
// gleiches Prinzip wie agent-leadership-routes.js#AUTONOMY_BOUNDARIES_NOTICE.
// ---------------------------------------------------------------------------
const OFFICE_FINANCE_BOUNDARIES_NOTICE = Object.freeze({
  architecture: "APPLE_FIRST_GOOGLE_CONTROLLED",
  noFullMigration: true,
  noRealGoogleConnection: true,
  noOAuthPerformed: true,
  noEmailSent: true,
  noCalendarEventCreated: true,
  noDriveFileCreated: true,
  noContactsRead: true,
  noBookingPerformed: true,
  noPaymentTriggered: true,
  noInvoiceSent: true,
  financeIsPreparationOnly: true,
  maxLocalPermissionLevel: "PREPARE_DRAFT",
  maxLocalExecutionStatus: officeWorkService.MAX_REACHABLE_EXECUTION_STATUS,
  laterActivationRequiresSeparateJamalApproval: true,
});

// ---------------------------------------------------------------------------
// C. Apple-first / Google-controlled Systemlandkarte (kompakte, für die UI
// gedachte Zusammenfassung; die ausführliche Fassung steht in
// APPLE_GOOGLE_OPERATING_MODEL.md – eine einzige inhaltliche Wahrheit,
// hier nur strukturiert für die Oberfläche wiedergegeben).
// ---------------------------------------------------------------------------
const SYSTEM_MAP = Object.freeze({
  architecture: "APPLE_FIRST_GOOGLE_CONTROLLED",
  appleWorkspace: {
    role: "Persönlicher Arbeitsraum von Jamal",
    leadsFor: ["Persönlicher Kalender", "Persönliche Kontakte", "Private Notizen", "Erinnerungen", "Fotos", "Private Dokumente", "iPhone-/Mac-Arbeitsweise"],
    dataRead: false,
    migrationPerformed: false,
  },
  googleWorkspace: {
    role: "Kontrollierter Unternehmens- und Agentenraum",
    leadsFor: ["office@jacogbr.de", "Geschäftliche Office-Kommunikation", "Unternehmenskalender", "Zentrale Unternehmensdokumente", "Kontrollierte Agentenentwürfe", "Projekt-/Übergabedokumente"],
    connectionStatus: "DISCONNECTED",
    oauthPerformed: false,
  },
  noFullMigration: true,
  noAutomaticBidirectionalSync: true,
  documentReference: "APPLE_GOOGLE_OPERATING_MODEL.md",
});

function handleSystemMap(res, deps) {
  const { sendJson } = deps;
  sendJson(res, 200, {
    ok: true,
    systemMap: SYSTEM_MAP,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

function handleIdentities(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const identities = externalIdentityService.listIdentities(db);
  sendJson(res, 200, {
    ok: true,
    identityCount: identities.length,
    identities,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

function handleCapabilities(res, deps, categoryFilter) {
  const { sendJson } = deps;
  const category = categoryFilter && String(categoryFilter).trim() ? String(categoryFilter).trim() : null;
  const capabilities = capabilityService.listCapabilities(category ? { category } : {});
  sendJson(res, 200, {
    ok: true,
    capabilityCount: capabilities.length,
    capabilities,
    permissionLevels: capabilityService.PERMISSION_LEVEL_VALUES,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

// G. Freigabematrix – aus den bestehenden 33 Fähigkeiten abgeleitet (eine
// einzige Wahrheit, keine zweite, parallele Matrixdatenquelle). Die
// ausführliche, für Menschen lesbare Fassung steht in
// GOOGLE_WORKSPACE_APPROVAL_MATRIX.md.
function buildApprovalMatrixRow(capability) {
  return {
    capabilityId: capability.capabilityId,
    provider: capability.provider,
    category: capability.category,
    action: capability.action,
    allowedAgentIds: capability.allowedAgentIds,
    dataSensitivity: capability.dataSensitivity,
    currentLevel: capability.status,
    recommendedInitialState: capability.recommendedInitialState,
    riskLevel: capability.riskLevel,
    externalEffect: capability.externalEffect,
    requiresJamalApproval: capability.requiresJamalApproval,
    reapprovalRequiredPerExecution: capability.readOrWrite === "WRITE",
    auditRequired: capability.auditRequired,
    reversible: capability.action !== "DELETE_MESSAGE" && capability.action !== "DELETE_FILE" && capability.action !== "DELETE_EVENT",
    recommendedPilotPhase: capability.recommendedInitialState === "PREPARE_DRAFT" ? "PHASE_1_READ_AND_DRAFT" : "LATER_PHASE",
  };
}

function handleApprovalMatrix(res, deps) {
  const { sendJson } = deps;
  const rows = capabilityService.ALL_CAPABILITIES.map(buildApprovalMatrixRow);
  sendJson(res, 200, {
    ok: true,
    rowCount: rows.length,
    rows,
    principles: [
      "Lesen, Vorbereiten und Ausführen sind getrennt.",
      "Kleinste Berechtigung zuerst.",
      "Keine breiten OAuth-Scopes ohne Bedarf.",
      "Keine vollständige Mailboxfreigabe, wenn Metadaten genügen.",
      "Keine Schreibrechte für den ersten Pilot.",
      "Senden, Löschen, Teilen und externe Einladung sind immer gesondert freizugeben.",
    ],
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

function handleWorkItems(res, deps, categoryFilter) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const category = categoryFilter && String(categoryFilter).trim() ? String(categoryFilter).trim() : null;
  const items = officeWorkService.listWorkItems(db, category ? { category } : {});
  sendJson(res, 200, {
    ok: true,
    workItemCount: items.length,
    workItems: items,
    officeAgentRoleModel: officeWorkService.listOfficeAgentRoleModel(),
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

function handleFinanceHandoffs(res, deps, typeFilter) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const type = typeFilter && String(typeFilter).trim() ? String(typeFilter).trim() : null;
  const handoffs = financeHandoffService.listHandoffs(db, type ? { type } : {});
  sendJson(res, 200, {
    ok: true,
    handoffCount: handoffs.length,
    handoffs,
    financeCapabilityGap: financeHandoffService.FINANCE_CAPABILITY_GAP_STATUS,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

function handleAuthenticationStatus(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const identities = externalIdentityService.listIdentities(db);
  const pendingIdentities = identities.filter((identity) => identity.authenticationState !== "AUTHENTICATED");
  const workItems = officeWorkService.listWorkItems(db);
  const pendingWorkItems = workItems.filter((item) => item.executionStatus === "WAITING_FOR_AUTHENTICATION");
  sendJson(res, 200, {
    ok: true,
    pendingIdentityCount: pendingIdentities.length,
    pendingIdentities: pendingIdentities.map((identity) => ({
      id: identity.id,
      emailAddress: identity.emailAddress,
      authenticationState: identity.authenticationState,
      status: identity.status,
    })),
    pendingWorkItemCount: pendingWorkItems.length,
    pendingWorkItems: pendingWorkItems.map((item) => ({ id: item.id, title: item.title, category: item.category })),
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

// V. Spätere Freigabeschritte / W. Spätere Finance-Aktivierung – strukturierte
// Metadaten für die UI. Der vollständige, für Jamal gedachte Wortlaut lebt
// ausschließlich in den beiden Checklisten-Dokumenten (eine Wahrheit, keine
// zweite Textkopie hier).
const ACTIVATION_CHECKLISTS = Object.freeze([
  {
    id: "GOOGLE_WORKSPACE_ACTIVATION",
    title: "Google Workspace kontrolliert und einzeln authentifizieren",
    documentReference: "V7.6_GOOGLE_WORKSPACE_ACTIVATION_CHECKLIST.md",
    stepCount: 16,
    firstStep: "office@jacogbr.de Identität bestätigen",
    status: "NOT_STARTED",
  },
  {
    id: "FINANCE_ACTIVATION",
    title: "Finance-Zielsystem auswählen und kontrolliert testen",
    documentReference: "V7.6_FINANCE_ACTIVATION_CHECKLIST.md",
    stepCount: 12,
    firstStep: "Finance-Zielsystem auswählen (Lexoffice/Lexware/Steuerberaterportal/manuell/anderes)",
    status: "NOT_STARTED",
  },
]);

function handleActivationChecklists(res, deps) {
  const { sendJson } = deps;
  sendJson(res, 200, {
    ok: true,
    checklists: ACTIVATION_CHECKLISTS,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

// U. Kompakte Kopfkarte für die neue Ansicht "Office & Finanzen" – höchstens
// drei wichtige Entscheidungen (Auftrag Abschnitt U, Ziffer 4).
function handleSummary(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const identities = externalIdentityService.listIdentities(db);
  const officeIdentity = identities.find((identity) => identity.identityType === "COMPANY_OFFICE");
  const pendingAuthCount = identities.filter((identity) => identity.authenticationState !== "AUTHENTICATED").length;
  const workItems = officeWorkService.listWorkItems(db);
  const financeHandoffs = financeHandoffService.listHandoffs(db);

  const decisions = [];
  if (officeIdentity && officeIdentity.status === "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION") {
    decisions.push("office@jacogbr.de ist lokal nicht nachweisbar eingerichtet – Bestätigung außerhalb von Cursor erforderlich.");
  }
  const readyForReviewWorkItems = workItems.filter((item) => item.approvalStatus === "READY_FOR_REVIEW");
  if (readyForReviewWorkItems.length > 0) {
    decisions.push(`${readyForReviewWorkItems.length} Office-Auftrag/Aufträge warten auf Prüfung.`);
  }
  const financeDecisionsRequired = financeHandoffs.filter((handoff) => handoff.approvalStatus === "JAMAL_APPROVAL_REQUIRED");
  if (financeDecisionsRequired.length > 0) {
    decisions.push(`${financeDecisionsRequired.length} Finance-Handoff(s) benötigen eine Jamal-Entscheidung.`);
  }

  sendJson(res, 200, {
    ok: true,
    architecture: "APPLE_FIRST_GOOGLE_CONTROLLED",
    googleAccountStatus: officeIdentity ? officeIdentity.status : "UNKNOWN",
    pendingAuthenticationCount: pendingAuthCount,
    topDecisions: decisions.slice(0, 3),
    maxTopDecisions: 3,
    financeCapabilityGap: financeHandoffService.FINANCE_CAPABILITY_GAP_STATUS,
    todayNextStep: "Google Workspace kontrolliert und einzeln authentifizieren.",
    workItemCount: workItems.length,
    financeHandoffCount: financeHandoffs.length,
    autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE,
  });
}

// ---------------------------------------------------------------------------
// POST-Aktionen – ein einziger Prefix (gleiches Muster wie
// /api/agent-leadership/).
// ---------------------------------------------------------------------------

const OFFICE_FINANCE_ACTIONS = Object.freeze({
  "review-external-identity": {
    fields: ["identityId", "status", "notes"],
    run: (db, body, now, actorUserId) => ({
      identity: externalIdentityService.reviewIdentity(db, {
        identityId: body.identityId,
        status: body.status,
        notes: body.notes,
        now,
        actorUserId,
      }),
    }),
  },
  "create-office-work-item": {
    fields: [
      "title",
      "requestedOutcome",
      "category",
      "targetIdentityId",
      "ownerAgentId",
      "contributorAgentIds",
      "requestedCapabilityId",
      "permissionLevelRequired",
      "dataSensitivity",
      "externalEffect",
      "draftInput",
    ],
    run: (db, body, now, actorUserId) => ({
      workItem: officeWorkService.createWorkItem(db, { ...body, now, actorUserId }),
    }),
  },
  "review-office-work-item": {
    fields: ["workItemId", "approvalStatus", "executionStatus"],
    run: (db, body, now, actorUserId) => ({
      workItem: officeWorkService.reviewWorkItem(db, {
        workItemId: body.workItemId,
        approvalStatus: body.approvalStatus,
        executionStatus: body.executionStatus,
        now,
        actorUserId,
      }),
    }),
  },
  "create-finance-handoff": {
    fields: [
      "title",
      "type",
      "period",
      "companyIdentity",
      "sourceDescription",
      "amount",
      "currency",
      "taxRelevance",
      "sensitivity",
      "proposedCategory",
      "confidence",
      "missingInformation",
      "requiredSpecialist",
    ],
    run: (db, body, now, actorUserId) => ({
      handoff: financeHandoffService.createHandoff(db, { ...body, now, actorUserId }),
    }),
  },
  "review-finance-handoff": {
    fields: ["handoffId", "approvalStatus", "jamalDecision"],
    run: (db, body, now, actorUserId) => ({
      handoff: financeHandoffService.reviewHandoff(db, {
        handoffId: body.handoffId,
        approvalStatus: body.approvalStatus,
        jamalDecision: body.jamalDecision,
        now,
        actorUserId,
      }),
    }),
  },
});

function isOfficeFinanceAction(actionName) {
  return Object.prototype.hasOwnProperty.call(OFFICE_FINANCE_ACTIONS, actionName);
}

async function dispatchOfficeFinanceAction(res, context, deps, actionName) {
  const { getDb, sendJson } = deps;
  const action = OFFICE_FINANCE_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, OFFICE_FINANCE_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `office-finance-action-${actionName}`);
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const actorUserId = actorUserIdFromContext(context);
    const result = action.run(db, body, new Date(), actorUserId);
    sendJson(res, 200, { ok: true, ...result, autonomyBoundaries: OFFICE_FINANCE_BOUNDARIES_NOTICE });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

module.exports = {
  OFFICE_FINANCE_ACTIONS,
  OFFICE_FINANCE_BOUNDARIES_NOTICE,
  SYSTEM_MAP,
  ACTIVATION_CHECKLISTS,
  isOfficeFinanceAction,
  dispatchOfficeFinanceAction,
  handleSystemMap,
  handleIdentities,
  handleCapabilities,
  handleApprovalMatrix,
  handleWorkItems,
  handleFinanceHandoffs,
  handleAuthenticationStatus,
  handleActivationChecklists,
  handleSummary,
};
