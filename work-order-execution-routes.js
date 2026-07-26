"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt H) – HTTP-Glue-Schicht für die
// kontrollierte Übergabe eines Arbeitsauftrags an die interne
// Agentenzentrale. Gleiches Muster wie work-order-routes.js: übersetzt
// ausschließlich HTTP, jede Fachregel lebt in
// work-order-execution-service.js/work-order-result-service.js. Importiert
// NIEMALS better-sqlite3 direkt.
//
// Diese Routen werden NICHT eigenständig in server.js registriert, sondern
// ausschließlich über die bereits bestehenden Prefix-Dispatcher in
// work-order-routes.js aufgerufen (dispatchPortalWorkOrdersGetPrefix/
// dispatchOwnerWorkOrdersGetPrefix/dispatchOwnerWorkOrdersPostPrefix) –
// dadurch bleiben GET-Prefix-/POST-Prefix-Routenzahlen unverändert
// (Auftrag Abschnitt H/O: "keine künstliche Modulvermehrung").
//
// CSRF, Origin-/Host-Prüfung und CUSTOMER_TENANT/OWNER_ONLY laufen bereits
// VOR jedem Aufruf im zentralen Auth-Route-Guard (identisch zu
// work-order-routes.js).

const workOrderExecutionService = require("./work-order-execution-service");
const workOrderResultService = require("./work-order-result-service");

// Owner-Startaktion erwartet keinerlei Felder (Auftrag Abschnitt H:
// "Startbutton bedeutet ausschließlich 'Technischen Agentenlauf
// starten'") – identisches Bodylimit wie work-order-routes.js, eigene
// lokale Kopie statt eines Requires aus jenem Modul (gleiche Begründung
// wie dort: jedes Routenmodul bleibt unabhängig lauffähig).
const RUN_START_API_MAX_BODY_BYTES = 4 * 1024;

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

// Übersetzt einen Service-Fehler (oder einen unerwarteten Fehler) in eine
// generische, geheimnisfreie HTTP-Antwort (Auftrag Abschnitt H: "sichere
// Fehler") – identisches Muster wie work-order-routes.js#sendServiceError.
function sendServiceError(res, sendJson, error) {
  if (error && (error.name === "WorkOrderExecutionError" || error.name === "WorkOrderResultError")) {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload());
}

// ---------------------------------------------------------------------------
// Kundenrouten (Auftrag Abschnitt H): Tenant ausschließlich aus
// context.identity.tenantId (Session), niemals aus Query/Body.
// ---------------------------------------------------------------------------

function handlePortalWorkOrderResult(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const result = workOrderResultService.getResultForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handlePortalWorkOrderRunStatus(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const runStatus = workOrderResultService.getRunStatusForCustomer(getDb(), context.identity, workOrderId);
    sendJson(res, 200, { ok: true, runStatus });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Owner-/Betriebsrouten (Auftrag Abschnitt H/M): rein technische
// Betriebsübersicht plus der einzigen vorgesehenen Startaktion. Kein
// reguläres fachliches Freigeben/Ablehnen, keine Ergebnisbearbeitung.
// ---------------------------------------------------------------------------

function handleOwnerWorkOrderRuns(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  try {
    const runs = workOrderExecutionService.listRunsForOwner(getDb(), workOrderId);
    sendJson(res, 200, { ok: true, runs });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerWorkOrderRunDetail(res, context, deps, workOrderId, runId) {
  const { getDb, sendJson } = deps;
  try {
    const run = workOrderExecutionService.getRunForOwner(getDb(), workOrderId, runId);
    sendJson(res, 200, { ok: true, run });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// Auftrag Abschnitt H: "Startbutton bedeutet ausschließlich 'Technischen
// Agentenlauf starten'" – keine Kundendaten, keine Freitextfelder, daher
// Known-fields-Allowlist = leere Menge (identisches Muster wie
// work-order-routes.js#handlePortalWorkOrderCancel).
async function handleOwnerWorkOrderRunStart(res, context, deps, workOrderId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, RUN_START_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, [], "owner-work-order-run-start");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const outcome = workOrderExecutionService.startRunForWorkOrder(getDb(), actorUserIdFromContext(context), workOrderId);
    sendJson(res, 200, { ok: true, ...outcome });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

module.exports = {
  handlePortalWorkOrderResult,
  handlePortalWorkOrderRunStatus,
  handleOwnerWorkOrderRuns,
  handleOwnerWorkOrderRunDetail,
  handleOwnerWorkOrderRunStart,
};
