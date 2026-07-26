"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt H) – Owner-HTTP-Routen.
//
// Kleines, separates Modul (gleiches Muster wie auth-http-routes.js:
// server.js ist bereits > 23.000 Zeilen). Dieses Modul importiert NIEMALS
// better-sqlite3 direkt; die Datenbank wird ihm bei jedem Aufruf über
// `deps.getDb()` gereicht. Sämtliche fachliche Logik lebt in
// owner-admin-service.js – dieses Modul übersetzt ausschließlich HTTP
// (Body lesen, Felder prüfen, Fehler auf Statuscodes abbilden).
//
// CSRF, Origin-/Host-Prüfung und die Rollenprüfung (OWNER_ONLY) laufen
// bereits VOR jedem Aufruf dieser Handler im zentralen Auth-Route-Guard
// (auth-route-guard.js#decideForPolicy) – identisch zum bestehenden Muster
// aller anderen OWNER_ONLY-Routen (siehe z. B. handleV71DocumentRegister in
// server.js). Diese Handler müssen das nicht erneut prüfen.

const OWNER_API_MAX_BODY_BYTES = 4 * 1024;
const ACTIVATION_NOTICE = "Einmaliger Aktivierungslink – sicher an den Kunden übermitteln.";
const RESET_NOTICE = "Einmaliger Rücksetzlink – sicher an den Kunden übermitteln.";

const ownerAdminService = require("./owner-admin-service");

// ---------------------------------------------------------------------------
// Kleine, lokale JSON-Body-Hilfen (bewusst eine eigene, kleine Kopie statt
// eines Requires aus server.js/auth-http-routes.js – server.js requiert
// dieses Modul, ein Require in die Gegenrichtung wäre ein Zirkelbezug; siehe
// identischer Kommentar in auth-http-routes.js).
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

// Übersetzt einen OwnerAdminError (oder einen unerwarteten Fehler) in eine
// generische, geheimnisfreie HTTP-Antwort. Kein Fehler dieser Funktion
// spiegelt jemals eine SQL-Meldung, einen Stacktrace oder ein internes
// Detail an den Browser.
function sendServiceError(res, sendJson, error) {
  if (error && error.name === "OwnerAdminError") {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload());
}

// ---------------------------------------------------------------------------
// Mandanten.
// ---------------------------------------------------------------------------

function handleOwnerTenantsList(res, context, deps) {
  const { getDb, sendJson } = deps;
  try {
    const tenants = ownerAdminService.listTenants(getDb());
    sendJson(res, 200, { ok: true, tenants });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerTenantDetail(res, context, deps, customerId) {
  const { getDb, sendJson } = deps;
  try {
    const tenant = ownerAdminService.getTenantDetail(getDb(), customerId);
    sendJson(res, 200, { ok: true, tenant });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerTenantActivate(res, context, deps, customerId) {
  const { getDb, sendJson } = deps;
  try {
    const tenant = ownerAdminService.activateTenant(getDb(), customerId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, tenant });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerTenantSuspend(res, context, deps, customerId) {
  const { getDb, sendJson } = deps;
  try {
    const tenant = ownerAdminService.suspendTenant(getDb(), customerId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, tenant });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Benutzer je Mandant.
// ---------------------------------------------------------------------------

function handleOwnerTenantUsersList(res, context, deps, customerId) {
  const { getDb, sendJson } = deps;
  try {
    const users = ownerAdminService.listUsersForTenant(getDb(), customerId);
    sendJson(res, 200, { ok: true, users });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

async function handleOwnerUserInvite(res, context, deps, customerId) {
  const { getDb, sendJson } = deps;
  let body;
  try {
    body = await readJsonRequestBody(context.req, OWNER_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["email", "displayName", "role"], "owner-user-invite");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload());
    return;
  }
  try {
    const result = ownerAdminService.inviteUser(getDb(), customerId, body, actorUserIdFromContext(context));
    sendJson(res, 200, {
      ok: true,
      user: result.user,
      invitation: { token: result.rawInviteToken, notice: ACTIVATION_NOTICE },
    });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserSuspend(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const user = ownerAdminService.suspendUser(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserReactivate(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const user = ownerAdminService.reactivateUser(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserRevokeSessions(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const user = ownerAdminService.revokeSessionsForUser(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserReissueInvitation(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const result = ownerAdminService.reissueInvitation(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, {
      ok: true,
      user: result.user,
      invitation: { token: result.rawInviteToken, notice: ACTIVATION_NOTICE },
    });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserRevokeInvitation(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const user = ownerAdminService.revokeInvitation(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

function handleOwnerUserPreparePasswordReset(res, context, deps, userId) {
  const { getDb, sendJson } = deps;
  try {
    const result = ownerAdminService.preparePasswordReset(getDb(), userId, actorUserIdFromContext(context));
    sendJson(res, 200, {
      ok: true,
      user: result.user,
      passwordReset: { token: result.rawResetToken, notice: RESET_NOTICE },
    });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

// ---------------------------------------------------------------------------
// Prefix-Dispatcher (dynamisches Pfadsegment). server.js reicht hier bereits
// den vollständigen, dekodierten Rest hinter dem registrierten Prefix
// durch (identisches Muster wie die bestehenden V71-Prefix-Handler).
// Jeder unbekannte/unpassende Rest bleibt generisch 404 (fail-closed).
// ---------------------------------------------------------------------------

function dispatchOwnerTenantsGetPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  if (!remainder) {
    sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
    return;
  }
  if (remainder.endsWith("/users")) {
    const customerId = remainder.slice(0, -"/users".length);
    if (!customerId || customerId.includes("/")) {
      sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
      return;
    }
    handleOwnerTenantUsersList(res, context, deps, customerId);
    return;
  }
  if (remainder.includes("/")) {
    sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
    return;
  }
  handleOwnerTenantDetail(res, context, deps, remainder);
}

function dispatchOwnerTenantsPostPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  const parts = typeof remainder === "string" ? remainder.split("/") : [];
  if (parts.length === 2 && parts[1] === "activate" && parts[0]) {
    handleOwnerTenantActivate(res, context, deps, parts[0]);
    return;
  }
  if (parts.length === 2 && parts[1] === "suspend" && parts[0]) {
    handleOwnerTenantSuspend(res, context, deps, parts[0]);
    return;
  }
  if (parts.length === 3 && parts[1] === "users" && parts[2] === "invite" && parts[0]) {
    handleOwnerUserInvite(res, context, deps, parts[0]);
    return;
  }
  sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
}

const USER_ACTION_HANDLERS = Object.freeze({
  suspend: handleOwnerUserSuspend,
  reactivate: handleOwnerUserReactivate,
  "revoke-sessions": handleOwnerUserRevokeSessions,
  "reissue-invitation": handleOwnerUserReissueInvitation,
  "revoke-invitation": handleOwnerUserRevokeInvitation,
  "prepare-password-reset": handleOwnerUserPreparePasswordReset,
});

function dispatchOwnerUsersPostPrefix(res, context, deps, remainder) {
  const { sendJson } = deps;
  const parts = typeof remainder === "string" ? remainder.split("/") : [];
  if (parts.length === 2 && parts[0] && USER_ACTION_HANDLERS[parts[1]]) {
    USER_ACTION_HANDLERS[parts[1]](res, context, deps, parts[0]);
    return;
  }
  sendJson(res, 404, genericErrorPayload("Nicht gefunden."));
}

module.exports = {
  OWNER_API_MAX_BODY_BYTES,
  ACTIVATION_NOTICE,
  RESET_NOTICE,
  handleOwnerTenantsList,
  handleOwnerTenantDetail,
  handleOwnerTenantActivate,
  handleOwnerTenantSuspend,
  handleOwnerTenantUsersList,
  handleOwnerUserInvite,
  handleOwnerUserSuspend,
  handleOwnerUserReactivate,
  handleOwnerUserRevokeSessions,
  handleOwnerUserReissueInvitation,
  handleOwnerUserRevokeInvitation,
  handleOwnerUserPreparePasswordReset,
  dispatchOwnerTenantsGetPrefix,
  dispatchOwnerTenantsPostPrefix,
  dispatchOwnerUsersPostPrefix,
};
