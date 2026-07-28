"use strict";

// V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
// der KI-Unternehmenszentrale verankern.
//
// Kleines, separates HTTP-Glue-Modul (gleiches Muster wie
// office-finance-routes.js): übersetzt ausschließlich HTTP (Body lesen,
// bekannte Felder prüfen, Fehler auf Statuscodes abbilden). Jede Fachregel
// selbst lebt in health-reference-work-run-service.js. Dieses Modul
// importiert NIEMALS better-sqlite3 direkt; die Datenbank wird ihm bei
// jedem Aufruf über `deps.getDb()` gereicht.
//
// CSRF, Origin-/Host-Prüfung und OWNER_ONLY-Zugriff laufen bereits VOR
// jedem Aufruf dieser Handler (route-access-policy.js/auth-route-guard.js/
// server.js), gleiches etabliertes Muster wie
// dispatchOfficeFinanceActionPostPrefix. Keine Route dieses Moduls ändert
// eine Health-Repository-Datei, führt eine echte Health-Ausführung aus,
// committet oder pusht.

const service = require("./health-reference-work-run-service");

const HEALTH_REFERENCE_API_MAX_BODY_BYTES = 8 * 1024;

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
  if (error && error.name === "HealthReferenceWorkRunError") {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload(error && error.message));
}

// ---------------------------------------------------------------------------
// Lesende Endpunkte.
// ---------------------------------------------------------------------------

function handleRunStatus(res, deps) {
  const { getDb, sendJson } = deps;
  try {
    const run = service.getRunView(getDb());
    sendJson(res, 200, { ok: true, run });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Schreibende Aktionen – ein einziger Prefix (gleiches Muster wie
// /api/office-finance/).
// ---------------------------------------------------------------------------

const HEALTH_REFERENCE_ACTIONS = Object.freeze({
  "ensure-run": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({
      run: service.getOrCreateCanonicalRun(db, { now, actorUserId }),
    }),
  },
  "prepare-work-package-prompt": {
    fields: ["workPackageKey"],
    run: async (db, body, now, actorUserId) => ({
      workPackage: await service.prepareWorkPackagePromptDraft(db, {
        packageKey: body.workPackageKey,
        now,
        actorUserId,
      }),
    }),
  },
  "record-approval": {
    fields: ["approvalKey", "decision", "note"],
    run: async (db, body, now, actorUserId) => ({
      approval: service.recordApproval(db, {
        approvalKey: body.approvalKey,
        decision: body.decision,
        note: body.note,
        now,
        actorUserId,
      }),
    }),
  },
  "transition-work-package": {
    fields: ["workPackageKey", "toStatus"],
    run: async (db, body, now, actorUserId) => ({
      workPackage: service.transitionWorkPackage(db, {
        packageKey: body.workPackageKey,
        toStatus: body.toStatus,
        now,
        actorUserId,
      }),
    }),
  },
  "submit-result-report": {
    fields: ["workPackageKey", "summary", "details"],
    run: async (db, body, now, actorUserId) => ({
      workPackage: service.submitResultReport(db, {
        packageKey: body.workPackageKey,
        summary: body.summary,
        details: body.details,
        now,
        actorUserId,
      }),
    }),
  },
  "submit-qa-finding": {
    fields: ["workPackageKey", "summary", "details", "passed"],
    run: async (db, body, now, actorUserId) => ({
      workPackage: service.submitQaFinding(db, {
        packageKey: body.workPackageKey,
        summary: body.summary,
        details: body.details,
        passed: body.passed,
        now,
        actorUserId,
      }),
    }),
  },
  "request-changes": {
    fields: ["workPackageKey", "note"],
    run: async (db, body, now, actorUserId) => ({
      workPackage: service.requestChanges(db, {
        packageKey: body.workPackageKey,
        note: body.note,
        now,
        actorUserId,
      }),
    }),
  },
  "record-final-acceptance": {
    fields: ["confirmed", "note"],
    run: async (db, body, now, actorUserId) => ({
      run: service.recordFinalAcceptance(db, {
        confirmed: body.confirmed,
        note: body.note,
        now,
        actorUserId,
      }),
    }),
  },
  "block-or-cancel-run": {
    fields: ["status"],
    run: async (db, body, now, actorUserId) => ({
      run: service.setRunBlockedOrCancelled(db, { status: body.status, now, actorUserId }),
    }),
  },
});

function isHealthReferenceAction(actionName) {
  return Object.prototype.hasOwnProperty.call(HEALTH_REFERENCE_ACTIONS, actionName);
}

async function dispatchHealthReferenceAction(res, context, deps, actionName) {
  const { getDb, sendJson } = deps;
  const action = HEALTH_REFERENCE_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, HEALTH_REFERENCE_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `health-reference-action-${actionName}`);
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const actorUserId = actorUserIdFromContext(context);
    const result = await action.run(db, body, new Date(), actorUserId);
    sendJson(res, 200, { ok: true, ...result, autonomyBoundaries: service.AUTONOMY_BOUNDARIES_NOTICE });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

module.exports = {
  HEALTH_REFERENCE_ACTIONS,
  isHealthReferenceAction,
  dispatchHealthReferenceAction,
  handleRunStatus,
};
