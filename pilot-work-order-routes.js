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

// Phase 4 (Auftrag Abschnitt 4 "HTTP-Konfliktbehandlung"): eine feste,
// kleine Whitelist sicherer, nicht-sensibler Zusatzfelder, die – sofern der
// Service sie tatsächlich mitliefert (siehe
// pilot-work-order-service.js#PilotWorkOrderError.details) – zusätzlich zur
// bestehenden `message` in die Fehlerantwort übernommen werden. Niemals ein
// Stacktrace, niemals ein beliebiges/unbekanntes Feld.
const ERROR_DETAIL_FIELDS = Object.freeze([
  "pilotOrderId",
  "expectedRevision",
  "currentRevision",
  "expectedStatus",
  "currentStatus",
]);

function genericErrorPayloadWithDetails(message, details) {
  const payload = genericErrorPayload(message);
  if (!details || typeof details !== "object") return payload;
  ERROR_DETAIL_FIELDS.forEach((field) => {
    if (details[field] !== undefined && details[field] !== null) {
      payload[field] = details[field];
    }
  });
  return payload;
}

function sendServiceError(res, sendJson, error) {
  if (error && error.name === "PilotWorkOrderError") {
    sendJson(res, error.statusCode, genericErrorPayloadWithDetails(error.message, error.details));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload(error && error.message));
}

// Phase 4: `expectedRevision` ist in jeder mutierenden Aktion ein optionales
// Feld (siehe PILOT_ACTIONS unten). Wird es übergeben, muss es bereits auf
// HTTP-Ebene eine nicht-negative ganze Zahl sein – ein ungültiger Typ/Wert
// wird kontrolliert als 400 abgewiesen, bevor die Serviceschicht überhaupt
// erreicht wird (kein stiller Typumbau, kein Vergleich mit NaN).
function assertValidExpectedRevision(body) {
  if (body.expectedRevision === undefined) return;
  if (typeof body.expectedRevision !== "number" || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
    throw Object.assign(new Error("expectedRevision muss, sofern angegeben, eine nicht-negative ganze Zahl sein."), {
      statusCode: 400,
    });
  }
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
// Phase 4 (Auftrag Abschnitt 2 "Mehrere Pilotaufträge über API adressierbar
// machen") – Auftragsverwaltung: Liste, Anlage, Einzelabruf über eine
// eigene, additive Ressource (/api/pilot-work-order/orders...), ohne die
// bestehende kanonische Route (/api/pilot-work-order/status) zu verändern.
// ---------------------------------------------------------------------------

function handlePilotOrdersList(res, deps) {
  const { getDb, sendJson } = deps;
  try {
    const orders = service.listPilotOrders(getDb());
    sendJson(res, 200, { ok: true, orders });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// Bewusst keine `id` im Request-Body (anders als der interne
// Testparameter `options.id` der Serviceschicht): über HTTP wird eine ID
// ausschließlich serverseitig erzeugt (generatePilotOrderId), niemals vom
// Aufrufer vorgegeben – verhindert, dass ein Aufrufer gezielt eine fremde
// oder die kanonische ID über die API zu reservieren versucht.
const PILOT_ORDER_CREATE_FIELDS = Object.freeze([
  "title",
  "desiredOutcome",
  "requestedBy",
  "qualityCriteria",
  "allowedTools",
  "forbiddenActions",
  "requiredApprovals",
  "timeframe",
]);

async function handlePilotOrderCreate(res, context, deps) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, PILOT_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, PILOT_ORDER_CREATE_FIELDS, "pilot-order-create");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const actorUserId = actorUserIdFromContext(context);
    const overview = service.createPilotOrder(db, body, { now: new Date(), actorUserId });
    sendJson(res, 200, { ok: true, overview });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handlePilotOrderDetail(res, deps, orderId) {
  const { getDb, sendJson } = deps;
  try {
    const overview = service.getPilotOrderOverview(getDb(), orderId);
    sendJson(res, 200, { ok: true, overview });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// GET .../orders/:pilotOrderId – genau ein Pfadsegment, kein automatisches
// Anlegen (siehe service.js#getPilotOrderOverview). Jeder abweichende Rest
// (leer, zusätzliches Segment) bleibt generisch 404 (fail-closed, gleiches
// Muster wie work-order-routes.js#dispatchOwnerWorkOrdersGetPrefix).
function dispatchPilotOrdersGetPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  if (!remainder || remainder.includes("/")) {
    sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
    return;
  }
  handlePilotOrderDetail(res, deps, remainder);
}

// ---------------------------------------------------------------------------
// Schreibende Aktionen – ein einziger Prefix (gleiches Muster wie
// /api/health-reference/).
//
// Phase 4 (Auftrag Abschnitt 2/3 "mehrere Pilotaufträge über API
// adressierbar machen"/"Revisionsmodell über HTTP nutzbar machen"): jede
// Aktion akzeptiert jetzt zusätzlich das optionale Body-Feld
// `expectedRevision` (siehe assertValidExpectedRevision oben) und wird über
// `meta.pilotOrderId` an den tatsächlich adressierten Auftrag gebunden.
// `meta.pilotOrderId` kommt AUSSCHLIESSLICH aus dem URL-Pfadsegment
// (dispatchPilotOrdersPostPrefix) – niemals aus dem Body – und bleibt bei
// der bestehenden kanonischen Route (dispatchPilotWorkOrderActionPostPrefix
// in server.js) unverändert `undefined`, wodurch service.js#resolveOrderId
// exakt wie bisher auf den kanonischen Auftrag zurückfällt (vollständige
// Rückwärtskompatibilität, kein Verhaltensunterschied für bestehende
// Aufrufer, die kein expectedRevision und keine pilotOrderId im Pfad
// mitgeben).
// ---------------------------------------------------------------------------
const PILOT_ACTIONS = Object.freeze({
  "mark-ready-for-approval": {
    fields: ["expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.markReadyForApproval(db, {
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "approve-for-execution": {
    fields: ["confirmed", "note", "expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.approveForExecution(db, {
        confirmed: body.confirmed,
        note: body.note,
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "start-execution": {
    fields: ["expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.startExecution(db, {
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
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
      "expectedRevision",
    ],
    run: async (db, body, meta) => {
      const result = service.submitHandoff(db, {
        ...body,
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
      });
      return {
        handoff: result.handoff,
        filterResult: result.filterResult,
        overview: service.getPilotOverview(db, { pilotOrderId: meta.pilotOrderId }),
      };
    },
  },
  "submit-for-review": {
    fields: ["expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.submitForReview(db, {
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "approve-completion": {
    fields: ["confirmed", "note", "expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.approveCompletion(db, {
        confirmed: body.confirmed,
        note: body.note,
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "return-order": {
    fields: ["note", "expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.returnOrder(db, {
        note: body.note,
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "reopen-from-returned": {
    fields: ["expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.reopenFromReturned(db, {
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "block-order": {
    fields: ["reason", "expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.blockOrder(db, {
        reason: body.reason,
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
  "unblock-order": {
    fields: ["expectedRevision"],
    run: async (db, body, meta) => ({
      overview: service.unblockOrder(db, {
        now: meta.now,
        actorUserId: meta.actorUserId,
        pilotOrderId: meta.pilotOrderId,
        expectedRevision: body.expectedRevision,
      }),
    }),
  },
});

function isPilotAction(actionName) {
  return Object.prototype.hasOwnProperty.call(PILOT_ACTIONS, actionName);
}

// `pilotOrderId` bleibt `undefined`, wenn dieser Aufruf über die bestehende
// kanonische Route erfolgt (server.js#dispatchPilotWorkOrderActionPostPrefix)
// – nur der neue, additive Prefix .../orders/:pilotOrderId/:action
// (dispatchPilotOrdersPostPrefix unten) gibt ihn ausdrücklich mit.
async function dispatchPilotAction(res, context, deps, actionName, pilotOrderId) {
  const { getDb, sendJson } = deps;
  const action = PILOT_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, PILOT_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `pilot-action-${actionName}`);
    assertValidExpectedRevision(body);
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const actorUserId = actorUserIdFromContext(context);
    const meta = { now: new Date(), actorUserId, pilotOrderId };
    const result = await action.run(db, body, meta);
    sendJson(res, 200, { ok: true, ...result, autonomyBoundaries: service.AUTONOMY_BOUNDARIES_NOTICE });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// POST .../orders/:pilotOrderId/:action – exakt zwei Pfadsegmente, die
// zweite muss eine bekannte Aktion sein (dieselbe PILOT_ACTIONS-Tabelle wie
// die kanonische Route, keine zweite Aktionsliste). Jeder abweichende Rest
// bleibt generisch 404 (fail-closed).
async function dispatchPilotOrdersPostPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  const parts = typeof remainder === "string" ? remainder.split("/") : [];
  if (parts.length === 2 && parts[0] && parts[1] && isPilotAction(parts[1])) {
    await dispatchPilotAction(res, context, deps, parts[1], parts[0]);
    return;
  }
  sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
}

module.exports = {
  PILOT_ACTIONS,
  isPilotAction,
  dispatchPilotAction,
  handlePilotOverview,
  handlePilotOrdersList,
  handlePilotOrderCreate,
  handlePilotOrderDetail,
  dispatchPilotOrdersGetPrefix,
  dispatchPilotOrdersPostPrefix,
};
