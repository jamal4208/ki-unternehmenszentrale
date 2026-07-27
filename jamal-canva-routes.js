"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Schritt 1: Canva als
// erster Produktionskorridor (Auftrag Abschnitt F/H/M).
//
// Kleines, separates HTTP-Glue-Modul (gleiches Muster wie
// work-order-routes.js/owner-admin-routes.js): übersetzt ausschließlich
// HTTP (Body lesen, bekannte Felder prüfen, Fehler auf Statuscodes
// abbilden) – jede Fachregel lebt in jamal-canva-production-service.js.
// Dieses Modul importiert NIEMALS better-sqlite3 direkt; die Datenbank wird
// ihm bei jedem Aufruf über `deps.getDb()` gereicht.
//
// CSRF, Origin-/Host-Prüfung und OWNER_ONLY-Zugriff laufen bereits VOR
// jedem Aufruf dieser Handler (route-access-policy.js/
// auth-route-guard.js) bzw. bereits im bestehenden
// dispatchJamalWorkModeActionPostPrefix (server.js) für alle
// /api/jamal-work-mode/*-Aktionen gemeinsam – dieses Modul führt dieselbe
// Origin-Prüfung nicht doppelt aus.
//
// WICHTIG (Auftrag Abschnitt L, jamal-work-mode-ui.test.js#"kein
// Provider"): dieses Modul wird bewusst NIEMALS von jamal-work-mode.js
// oder jamal-work-mode-ui.js importiert – der bestehende Jamal-
// Arbeitsmodus-Hauptfluss bleibt vollständig ohne jeden Canva-Bezug. Die
// Verdrahtung erfolgt ausschließlich zusätzlich in server.js.

const jamalWorkModeStoreModule = require("./jamal-work-mode-store");
const jamalCanvaProductionService = require("./jamal-canva-production-service");

const CANVA_API_MAX_BODY_BYTES = 8 * 1024;

// ---------------------------------------------------------------------------
// Kleine, lokale JSON-Body-Hilfen (bewusst eine eigene, kleine Kopie statt
// eines Requires aus server.js/work-order-routes.js – jedes Routenmodul
// bleibt unabhängig lauffähig, gleiche Begründung wie in
// work-order-routes.js).
// ---------------------------------------------------------------------------

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

// Identisches Muster wie work-order-routes.js#actorUserIdFromContext: im
// lokalen Dev-Bypass gibt es keinen echten Datenbank-Akteur.
function actorUserIdFromContext(context) {
  const identity = context && context.identity;
  return identity && !identity.isBypass ? identity.userId : null;
}

// Kein Stacktrace, keine SQL-Meldung, kein internes Detail am Browser
// (gleiches Prinzip wie work-order-routes.js#sendServiceError).
function sendServiceError(res, sendJson, error) {
  if (error && error.name === "JamalCanvaProductionError") {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload());
}

const RIGHTS_INPUT_FIELDS = ["ownsImageRights", "brandUsageAllowed", "containsRealPerson", "consentConfirmed", "isAvatar"];

function rightsInputFromBody(body) {
  const rightsInput = {};
  for (const field of RIGHTS_INPUT_FIELDS) {
    if (body[field] !== undefined) rightsInput[field] = body[field] === true;
  }
  return rightsInput;
}

// Auftrag Abschnitt P: jede Aktion mit einer eigenen, engen
// Known-Fields-Allowlist (kein "alles erlaubt").
const CANVA_ACTIONS = Object.freeze({
  "canva-prepare-briefing": {
    fields: RIGHTS_INPUT_FIELDS,
    run: (db, workItem, body, now, actorUserId) =>
      jamalCanvaProductionService.prepareBriefing(db, { workItem, rightsInput: rightsInputFromBody(body), actorUserId, now }),
  },
  "canva-approve-handoff": {
    fields: [],
    run: (db, workItem, _body, now, actorUserId) =>
      jamalCanvaProductionService.approveHandoff(db, { workItem, actorUserId, now }),
  },
  "canva-start-handoff": {
    fields: [],
    run: (db, workItem, _body, now, actorUserId) =>
      jamalCanvaProductionService.startHandoff(db, { workItem, actorUserId, now }),
  },
  "canva-request-revision": {
    fields: ["changeText", ...RIGHTS_INPUT_FIELDS],
    run: (db, workItem, body, now, actorUserId) =>
      jamalCanvaProductionService.requestRevision(db, {
        workItem,
        changeText: body.changeText,
        rightsInput: rightsInputFromBody(body),
        actorUserId,
        now,
      }),
  },
  "canva-accept-result": {
    fields: [],
    run: (db, workItem, _body, now, actorUserId) =>
      jamalCanvaProductionService.acceptResult(db, { workItem, actorUserId, now }),
  },
  "canva-cancel": {
    fields: ["reason"],
    run: (db, workItem, body, now, actorUserId) =>
      jamalCanvaProductionService.cancelProduction(db, { workItem, reason: body.reason, actorUserId, now }),
  },
});

function isCanvaAction(actionName) {
  return Object.prototype.hasOwnProperty.call(CANVA_ACTIONS, actionName);
}

// Aufgerufen von server.js#dispatchJamalWorkModeActionPostPrefix, wenn
// actionName eine der oben registrierten Canva-Aktionen ist (die
// Origin-/Host-Prüfung ist zu diesem Zeitpunkt bereits erfolgt). Lädt den
// aktuellen Jamal-Arbeitswunsch read-only (kein erneutes Schreiben von
// jamal_work_items – dieses Modul verändert ausschließlich
// jamal_canva_productions).
async function dispatchCanvaAction(res, context, deps, actionName) {
  const { getDb, sendJson } = deps;
  const action = CANVA_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, CANVA_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `jamal-canva-action-${actionName}`);
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const store = jamalWorkModeStoreModule.loadStore(db);
    const actorUserId = actorUserIdFromContext(context);
    const view = await action.run(db, store.currentItem, body, new Date(), actorUserId);
    sendJson(res, 200, { ok: true, canva: view });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// GET /api/jamal-work-mode/canva-state (server.js) – niemals Teil von
// jamal-work-mode.js#getSafeView (siehe Kopfkommentar).
function handleCanvaState(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const store = jamalWorkModeStoreModule.loadStore(db);
  const view = jamalCanvaProductionService.getCanvaSafeView(db, store.currentItem);
  sendJson(res, 200, { ok: true, ...view });
}

module.exports = {
  CANVA_ACTIONS,
  isCanvaAction,
  dispatchCanvaAction,
  handleCanvaState,
};
