"use strict";

// V7.2 Phase B Schritt 1 (Auftrag Abschnitt G/H) – Arbeitsauftrag anlegen,
// prüfen, Status verfolgen: HTTP-Glue-Schicht.
//
// Kleines, separates Modul (gleiches Muster wie owner-admin-routes.js/
// customer-portal-routes.js). Übersetzt ausschließlich HTTP (Body lesen,
// Felder prüfen, Fehler auf Statuscodes abbilden) – jede Fachregel lebt in
// work-order-service.js. Dieses Modul importiert NIEMALS better-sqlite3
// direkt; die Datenbank wird ihm bei jedem Aufruf über `deps.getDb()`
// gereicht.
//
// CSRF, Origin-/Host-Prüfung und die Rollen-/Tenantprüfung
// (CUSTOMER_TENANT/OWNER_ONLY) laufen bereits VOR jedem Aufruf dieser
// Handler im zentralen Auth-Route-Guard (auth-route-guard.js#decideForPolicy)
// – identisch zum bestehenden Muster aller anderen geschützten Routen.
// Tenant kommt ausschließlich aus `context.identity.tenantId` (bereits
// gegen die Session validiert), niemals aus Query oder Body.

// Großzügiger als OWNER_API_MAX_BODY_BYTES (owner-admin-routes.js), weil ein
// Arbeitsauftrag bis zu vier Freitextfelder mit je bis zu 4000 Zeichen
// (Mehrbyte-UTF-8 möglich) enthalten kann – weiterhin ein festes,
// endliches Bodylimit (Auftrag Abschnitt G: "Bodylimit").
const WORK_ORDER_API_MAX_BODY_BYTES = 40 * 1024;

const workOrderService = require("./work-order-service");

// ---------------------------------------------------------------------------
// Kleine, lokale JSON-Body-Hilfen (bewusst eine eigene, kleine Kopie statt
// eines Requires aus owner-admin-routes.js/auth-http-routes.js – dieselbe
// Begründung wie in owner-admin-routes.js: jedes Routenmodul bleibt
// unabhängig lauffähig, kein Modul requiert ein anderes Routenmodul).
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
  return { ok: false, message: message || "Aktion nicht möglich." };
}

function actorUserIdFromContext(context) {
  const identity = context && context.identity;
  return identity && !identity.isBypass ? identity.userId : null;
}

// Übersetzt einen WorkOrderError (oder einen unerwarteten Fehler) in eine
// generische, geheimnisfreie HTTP-Antwort. Kein Fehler dieser Funktion
// spiegelt jemals eine SQL-Meldung, einen Stacktrace oder ein internes
// Detail an den Browser (Auftrag Abschnitt G: "sichere Fehler").
function sendServiceError(res, sendJson, error) {
  if (error && error.name === "WorkOrderError") {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload());
}

const WORK_ORDER_FIELDS = ["title", "desiredResult", "context", "deadlineText"];

// ---------------------------------------------------------------------------
// Kundenrouten (Auftrag Abschnitt G): Tenant ausschließlich aus
// context.identity.tenantId (Session), niemals aus Query/Body.
// ---------------------------------------------------------------------------

function handlePortalWorkOrdersList(res, context, deps) {
  const { getDb, sendJson } = deps;
  try {
    const workOrders = workOrderService.listForCustomer(getDb(), context.identity);
    sendJson(res, 200, { ok: true, workOrders });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

async function handlePortalWorkOrderCreate(res, context, deps) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, WORK_ORDER_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, WORK_ORDER_FIELDS, "portal-work-order-create");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const workOrder = workOrderService.createForCustomer(getDb(), context.identity, body);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handlePortalWorkOrderDetail(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const workOrder = workOrderService.getForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

async function handlePortalWorkOrderResubmit(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, WORK_ORDER_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, WORK_ORDER_FIELDS, "portal-work-order-resubmit");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const workOrder = workOrderService.resubmitForCustomer(getDb(), context.identity, workOrderId, body);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// Auftrag: "Kunden-Cancel, sofern sicher und im Scope". Kein Body
// erforderlich – wer stornieren darf, wird ausschließlich in
// work-order-service.js#cancelForCustomer entschieden.
async function handlePortalWorkOrderCancel(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, WORK_ORDER_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, [], "portal-work-order-cancel");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const workOrder = workOrderService.cancelForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Ownerrouten (Auftrag Abschnitt G, PRODUKTKORRIGIERT): mandantenüber-
// greifende Liste/Einzelabruf als reine Betriebsübersicht sowie
// AUSSCHLIESSLICH die beiden verbliebenen Ausnahmeaktionen (Eskalation,
// Stopp) – kein reguläres Freigeben/Ablehnen mehr. Jede Ausnahmeaktion
// verlangt einen Grund (work-order-service.js#sanitizeOwnerActionReason).
// ---------------------------------------------------------------------------

function handleOwnerWorkOrdersList(res, context, deps) {
  const { getDb, sendJson } = deps;
  try {
    const workOrders = workOrderService.listForOwner(getDb());
    sendJson(res, 200, { ok: true, workOrders });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerWorkOrderDetail(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const workOrder = workOrderService.getForOwner(getDb(), workOrderId);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

async function handleOwnerWorkOrderAction(res, context, deps, workOrderId, action) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, WORK_ORDER_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["reason"], "owner-work-order-action");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const workOrder = workOrderService.actionForOwner(getDb(), workOrderId, action, actorUserIdFromContext(context), body);
    sendJson(res, 200, { ok: true, workOrder });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Prefix-Dispatcher (dynamisches Pfadsegment). server.js reicht hier bereits
// den vollständigen, dekodierten Rest hinter dem registrierten Prefix
// durch (identisches Muster wie owner-admin-routes.js). Jeder unbekannte/
// unpassende Rest bleibt generisch 404 (fail-closed).
// ---------------------------------------------------------------------------

function dispatchPortalWorkOrdersGetPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  if (!remainder || remainder.includes("/")) {
    sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
    return;
  }
  handlePortalWorkOrderDetail(res, context, deps, remainder);
}

function dispatchPortalWorkOrdersPostPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  const parts = typeof remainder === "string" ? remainder.split("/") : [];
  if (parts.length === 2 && parts[0] && parts[1] === "resubmit") {
    handlePortalWorkOrderResubmit(res, context, deps, parts[0]);
    return;
  }
  if (parts.length === 2 && parts[0] && parts[1] === "cancel") {
    handlePortalWorkOrderCancel(res, context, deps, parts[0]);
    return;
  }
  sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
}

function dispatchOwnerWorkOrdersGetPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  if (!remainder || remainder.includes("/")) {
    sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
    return;
  }
  handleOwnerWorkOrderDetail(res, context, deps, remainder);
}

// Produktkorrektur: nur noch die beiden Ausnahmeaktionen (keine reguläre
// Freigabe/Ablehnung, keine reguläre Owner-Rückfrage mehr).
const OWNER_EXCEPTION_ACTIONS = Object.freeze(["escalate", "stop"]);

function dispatchOwnerWorkOrdersPostPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  const parts = typeof remainder === "string" ? remainder.split("/") : [];
  if (parts.length === 2 && parts[0] && OWNER_EXCEPTION_ACTIONS.includes(parts[1])) {
    handleOwnerWorkOrderAction(res, context, deps, parts[0], parts[1]);
    return;
  }
  sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
}

module.exports = {
  WORK_ORDER_API_MAX_BODY_BYTES,
  handlePortalWorkOrdersList,
  handlePortalWorkOrderCreate,
  handlePortalWorkOrderDetail,
  handlePortalWorkOrderResubmit,
  handlePortalWorkOrderCancel,
  handleOwnerWorkOrdersList,
  handleOwnerWorkOrderDetail,
  handleOwnerWorkOrderAction,
  dispatchPortalWorkOrdersGetPrefix,
  dispatchPortalWorkOrdersPostPrefix,
  dispatchOwnerWorkOrdersGetPrefix,
  dispatchOwnerWorkOrdersPostPrefix,
};
