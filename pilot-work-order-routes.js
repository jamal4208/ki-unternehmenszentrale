"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
//
// Kleines, separates HTTP-Glue-Modul (gleiches Muster wie
// health-reference-work-run-routes.js): übersetzt ausschließlich HTTP (Body
// lesen, bekannte Felder prüfen, Fehler auf Statuscodes abbilden). Jede
// Fachregel selbst lebt in pilot-work-order-service.js. Dieses Modul
// importiert NIEMALS better-sqlite3 direkt; die Datenbank wird ihm bei
// jedem Aufruf über `deps.getDb()` gereicht.
//
// CSRF, Origin-/Host-Prüfung und OWNER_ONLY-Zugriff laufen bereits VOR
// jedem Aufruf dieser Handler (route-access-policy.js/auth-route-guard.js/
// server.js). Keine Route dieses Moduls führt eine externe Aktion aus.

const service = require("./pilot-work-order-service");

const PILOT_API_MAX_BODY_BYTES = 8 * 1024;

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
  if (error && error.name === "PilotWorkOrderError") {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload(error && error.message));
}

function handlePilotOverview(res, deps) {
  const { getDb, sendJson } = deps;
  try {
    const overview = service.getPilotOverview(getDb());
    sendJson(res, 200, { ok: true, overview });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Schreibende Aktionen – ein einziger Prefix (gleiches Muster wie
// /api/health-reference/).
// ---------------------------------------------------------------------------
const PILOT_ACTIONS = Object.freeze({
  "mark-ready-for-approval": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({ overview: service.markReadyForApproval(db, { now, actorUserId }) }),
  },
  "approve-for-execution": {
    fields: ["confirmed", "note"],
    run: async (db, body, now, actorUserId) => ({
      overview: service.approveForExecution(db, { confirmed: body.confirmed, note: body.note, now, actorUserId }),
    }),
  },
  "start-execution": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({ overview: service.startExecution(db, { now, actorUserId }) }),
  },
  "submit-handoff": {
    fields: [
      "fromPilotRole",
      "toPilotRole",
      "shortFinding",
      "resultOrRecommendation",
      "basisUsed",
      "riskOrLimit",
      "nextStep",
      "decisionNeeded",
      "forbiddenActionOccurred",
      "autonomyBoundaryRespected",
    ],
    run: async (db, body, now, actorUserId) => {
      const result = service.submitHandoff(db, { ...body, now, actorUserId });
      return { handoff: result.handoff, filterResult: result.filterResult, overview: service.getPilotOverview(db) };
    },
  },
  "submit-for-review": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({ overview: service.submitForReview(db, { now, actorUserId }) }),
  },
  "approve-completion": {
    fields: ["confirmed", "note"],
    run: async (db, body, now, actorUserId) => ({
      overview: service.approveCompletion(db, { confirmed: body.confirmed, note: body.note, now, actorUserId }),
    }),
  },
  "return-order": {
    fields: ["note"],
    run: async (db, body, now, actorUserId) => ({ overview: service.returnOrder(db, { note: body.note, now, actorUserId }) }),
  },
  "reopen-from-returned": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({ overview: service.reopenFromReturned(db, { now, actorUserId }) }),
  },
  "block-order": {
    fields: ["reason"],
    run: async (db, body, now, actorUserId) => ({ overview: service.blockOrder(db, { reason: body.reason, now, actorUserId }) }),
  },
  "unblock-order": {
    fields: [],
    run: async (db, _body, now, actorUserId) => ({ overview: service.unblockOrder(db, { now, actorUserId }) }),
  },
});

function isPilotAction(actionName) {
  return Object.prototype.hasOwnProperty.call(PILOT_ACTIONS, actionName);
}

async function dispatchPilotAction(res, context, deps, actionName) {
  const { getDb, sendJson } = deps;
  const action = PILOT_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, PILOT_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `pilot-action-${actionName}`);
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
  PILOT_ACTIONS,
  isPilotAction,
  dispatchPilotAction,
  handlePilotOverview,
};
