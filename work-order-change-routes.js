"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt E/G/H/I) – HTTP-Glue-Schicht für
// Änderungswünsche, Kundenfreigabe und die Versionsansicht. Gleiches Muster
// wie work-order-execution-routes.js: übersetzt ausschließlich HTTP, jede
// Fachregel lebt in work-order-change-service.js/work-order-approval-
// service.js/work-order-result-service.js. Importiert NIEMALS
// better-sqlite3 direkt.
//
// Diese Routen werden NICHT eigenständig in server.js registriert, sondern
// ausschließlich über die bereits bestehenden Prefix-Dispatcher in
// work-order-routes.js aufgerufen (dispatchPortalWorkOrdersGetPrefix/
// dispatchPortalWorkOrdersPostPrefix/dispatchOwnerWorkOrdersGetPrefix) –
// dadurch bleiben GET-Prefix-/POST-Prefix-Routenzahlen unverändert (Auftrag
// Abschnitt I: "keine künstliche Modulvermehrung").
//
// CSRF, Origin-/Host-Prüfung und CUSTOMER_TENANT/OWNER_ONLY laufen bereits
// VOR jedem Aufruf im zentralen Auth-Route-Guard (identisch zu
// work-order-routes.js/work-order-execution-routes.js).

const workOrderChangeService = require("./work-order-change-service");
const workOrderApprovalService = require("./work-order-approval-service");
const workOrderResultService = require("./work-order-result-service");

// Großzügig genug für die drei Änderungswunschfelder (2000+1000+500 Zeichen,
// Mehrbyte-UTF-8 möglich) inkl. JSON-Overhead, weiterhin ein festes,
// endliches Bodylimit (Auftrag Abschnitt I: "Bodylimit") – eigene lokale
// Konstante statt eines Requires aus work-order-routes.js (gleiches Prinzip
// wie dort: jedes Routenmodul bleibt unabhängig lauffähig).
const CHANGE_REQUEST_API_MAX_BODY_BYTES = 20 * 1024;
// Freigabe kennt nur ein optionales, kurzes Notizfeld (max. 1000 Zeichen).
const APPROVAL_API_MAX_BODY_BYTES = 4 * 1024;

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

// Übersetzt einen Service-Fehler (oder einen unerwarteten Fehler) in eine
// generische, geheimnisfreie HTTP-Antwort (Auftrag Abschnitt I: "sichere
// Fehler") – identisches Muster wie work-order-execution-routes.js#sendServiceError.
function sendServiceError(res, sendJson, error) {
  if (
    error &&
    (error.name === "WorkOrderChangeError" ||
      error.name === "WorkOrderApprovalError" ||
      error.name === "WorkOrderResultError")
  ) {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload());
}

// ---------------------------------------------------------------------------
// Kundenrouten (Auftrag Abschnitt E/G/H): Tenant ausschließlich aus
// context.identity.tenantId (Session), niemals aus Query/Body.
// ---------------------------------------------------------------------------

const CHANGE_REQUEST_FIELDS = ["requestText", "preserveText", "importantNote"];

async function handlePortalWorkOrderChangeRequest(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, CHANGE_REQUEST_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, CHANGE_REQUEST_FIELDS, "portal-work-order-change-request");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const outcome = workOrderChangeService.requestChanges(getDb(), context.identity, workOrderId, body);
    sendJson(res, 200, { ok: true, ...outcome });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handlePortalWorkOrderChangeRequestList(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const changeRequests = workOrderChangeService.listChangeRequestsForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, changeRequests });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

const APPROVAL_FIELDS = ["approvalNote"];

async function handlePortalWorkOrderApprove(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, APPROVAL_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, APPROVAL_FIELDS, "portal-work-order-approve");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const outcome = workOrderApprovalService.approveResult(getDb(), context.identity, workOrderId, body);
    sendJson(res, 200, { ok: true, ...outcome });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handlePortalWorkOrderResultVersions(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const versions = workOrderResultService.listResultVersionsForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, ...versions });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Owner-/Betriebsrouten (Auftrag Abschnitt N): ausschließlich Lesen, keine
// Aktion. Der OWNER kann hier weder freigeben noch ablehnen noch im Namen
// des Kunden eine Änderung anfordern (kein entsprechender Handler
// vorhanden).
// ---------------------------------------------------------------------------

function handleOwnerWorkOrderChangeRequests(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const changeRequests = workOrderChangeService.listChangeRequestsForOwner(getDb(), workOrderId);
    sendJson(res, 200, { ok: true, changeRequests });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerWorkOrderResultVersions(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const versions = workOrderResultService.listResultVersionsForOwner(getDb(), workOrderId);
    sendJson(res, 200, { ok: true, versions });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

module.exports = {
  handlePortalWorkOrderChangeRequest,
  handlePortalWorkOrderChangeRequestList,
  handlePortalWorkOrderApprove,
  handlePortalWorkOrderResultVersions,
  handleOwnerWorkOrderChangeRequests,
  handleOwnerWorkOrderResultVersions,
};
