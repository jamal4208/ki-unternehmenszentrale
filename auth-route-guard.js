"use strict";

// V7.2 Phase A Schritt 2 – Auth-Route-Guard (Auftrag Abschnitt C/G/L/M).
//
// Zentrales Gate, das VOR jedem Handler ausgeführt wird. Trifft die
// Zugriffsentscheidung ausschließlich anhand von: Betriebsmodus, der
// kanonischen Policy (route-access-policy.js), der serverseitigen Session
// (auth-session.js/auth-db.js) und Host/Origin/CSRF (auth-http.js).
// Browserparameter (Body/Query/Header) können die Rolle oder den Mandanten
// NIEMALS erweitern – sie werden ausschließlich zur Erkennung eines
// Mandanten-Mismatches gelesen (Auftrag Abschnitt L).
//
// Reihenfolge (Auftrag Abschnitt G) wird bewusst 1:1 nachgebildet.

const authHttp = require("./auth-http");
const authSession = require("./auth-session");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const routeAccessPolicy = require("./route-access-policy");

const { ACCESS_CLASSES, ERROR_STRATEGIES } = routeAccessPolicy;

const DEV_MODE_WARNING =
  "Entwicklungsmodus: Chef-Routen lokal ohne Owner-Anmeldung erreichbar.";

const CHEF_BYPASS_ELIGIBLE_CLASSES = Object.freeze([
  ACCESS_CLASSES.OWNER_ONLY,
  ACCESS_CLASSES.STATIC_OWNER_ONLY,
  ACCESS_CLASSES.DISABLED_IN_PROD,
]);

// Felder, die eine Session-fremde Mandantenkennung tragen könnten (Auftrag
// Abschnitt L). customerId/tenantId werden generisch gegen die Session
// geprüft; brandId/campaignId/projectId werden erkannt und im Auditfall
// mitgeführt, ihre domänenspezifische Zugehörigkeitsprüfung (z. B. über
// agency-tenant-registry.js#validateTenantBinding) ist Aufgabe der
// jeweiligen Fachroute in einem späteren Schritt – in Schritt 2 existiert
// keine kundenerreichbare Fachroute, die solche Felder tatsächlich verwendet
// (Auftrag: "Kein Kundenportal-UI", "keine Phase-B-Arbeit").
const DIRECT_TENANT_FIELDS = Object.freeze(["customerId", "tenantId"]);
const OBSERVED_TENANT_FIELDS = Object.freeze(["customerId", "tenantId", "brandId", "campaignId", "projectId"]);

// ---------------------------------------------------------------------------
// Betriebsmodus.
// ---------------------------------------------------------------------------

function resolveOperatingMode(env = process.env) {
  const rawMode = typeof env.KUZ_MODE === "string" ? env.KUZ_MODE.trim().toLowerCase() : "";
  const mode = rawMode === "prod" ? "prod" : "dev";
  if (mode === "prod") {
    const publicOrigin = typeof env.KUZ_PUBLIC_ORIGIN === "string" ? env.KUZ_PUBLIC_ORIGIN.trim() : "";
    if (!publicOrigin) {
      return {
        mode,
        publicOrigin: null,
        ok: false,
        errorReason: "KUZ_PUBLIC_ORIGIN fehlt im Produktivmodus.",
      };
    }
    try {
      // eslint-disable-next-line no-new
      new URL(publicOrigin);
    } catch (_error) {
      return {
        mode,
        publicOrigin: null,
        ok: false,
        errorReason: "KUZ_PUBLIC_ORIGIN ist keine gültige URL.",
      };
    }
    return { mode, publicOrigin, ok: true, errorReason: null };
  }
  return { mode: "dev", publicOrigin: null, ok: true, errorReason: null };
}

// ---------------------------------------------------------------------------
// Session laden und frisch validieren (Schritte 5–10).
// ---------------------------------------------------------------------------

function identityFromRealSession(user, tenant, session) {
  return Object.freeze({
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId || null,
    tenantCustomerId: tenant ? tenant.customerId : null,
    tenantDisplayName: tenant ? tenant.displayName : null,
    displayName: user.displayName,
    sessionId: session.id,
    isBypass: false,
    supportGrant: null,
  });
}

const DEV_BYPASS_IDENTITY = Object.freeze({
  userId: null,
  role: "OWNER",
  tenantId: null,
  tenantCustomerId: null,
  tenantDisplayName: null,
  displayName: "Jamal (lokaler Entwicklungsmodus)",
  sessionId: null,
  isBypass: true,
  supportGrant: null,
});

function loadSessionIdentity({ db, req, mode, now }) {
  const token = authHttp.readSessionTokenFromRequest(req, mode);
  if (!token) return { identity: null, invalidReason: "NO_COOKIE" };
  if (!db) return { identity: null, invalidReason: "NO_DB" };

  const validation = authSession.validateAndTouchSession(db, token, now);
  if (!validation.ok) return { identity: null, invalidReason: validation.reason };

  const session = validation.session;
  const user = authDb.getUserById(db, session.userId);
  if (!user || user.status !== "ACTIVE") {
    authSession.revokeSession(db, session.id, now);
    return { identity: null, invalidReason: "USER_INVALID" };
  }

  let tenant = null;
  if (user.tenantId) {
    tenant = authDb.getTenantProjectionById(db, user.tenantId);
    if (!tenant || tenant.status !== "ACTIVE") {
      authSession.revokeSession(db, session.id, now);
      return { identity: null, invalidReason: "TENANT_INVALID" };
    }
  }

  return { identity: identityFromRealSession(user, tenant, session), invalidReason: null };
}

// ---------------------------------------------------------------------------
// Mandanten-Mismatch (Schritt 13, Auftrag Abschnitt L).
// ---------------------------------------------------------------------------

function collectRequestTenantParams(requestUrl, body) {
  const found = {};
  OBSERVED_TENANT_FIELDS.forEach((field) => {
    const queryValue = requestUrl && requestUrl.searchParams ? requestUrl.searchParams.get(field) : null;
    if (typeof queryValue === "string" && queryValue) {
      found[field] = queryValue;
      return;
    }
    const bodyValue = body && typeof body === "object" ? body[field] : undefined;
    if (typeof bodyValue === "string" && bodyValue) {
      found[field] = bodyValue;
    }
  });
  return found;
}

// Gibt true zurück, wenn ein DIREKT vergleichbares Feld (customerId/
// tenantId) einen Wert trägt, der vom Mandanten der Session abweicht. Fehlt
// der Session ein Mandant (z. B. OWNER/SUPPORT ohne aktiven Grant) und ist
// dennoch ein Tenantparameter gesetzt, gilt das ebenfalls als Mismatch.
function detectTenantParamMismatch(requestParams, expectedTenantCustomerId) {
  return DIRECT_TENANT_FIELDS.some((field) => {
    const value = requestParams[field];
    if (value === undefined) return false;
    return value !== expectedTenantCustomerId;
  });
}

// ---------------------------------------------------------------------------
// Generische, geheimnisfreie Antwortkörper.
// ---------------------------------------------------------------------------

function denyResult(statusCode, reasonCode, extra = {}) {
  return {
    allow: false,
    statusCode,
    reasonCode,
    message:
      statusCode === 401
        ? authHttp.GENERIC_MESSAGES.UNAUTHENTICATED
        : statusCode === 403
          ? authHttp.GENERIC_MESSAGES.REJECTED
          : statusCode === 429
            ? authHttp.GENERIC_MESSAGES.RATE_LIMITED
            : statusCode === 500
              ? authHttp.GENERIC_MESSAGES.INTERNAL
              : authHttp.GENERIC_MESSAGES.NOT_FOUND,
    ...extra,
  };
}

function allowResult(identity, extra = {}) {
  return { allow: true, identity: identity || null, ...extra };
}

// Persistiert eine Verweigerung als Audit-Ereignis, sofern die jeweilige
// Policy dies verlangt (auditOnDeny) oder die Entscheidung selbst eine
// erzwungene Auditierung markiert (forceAudit – z. B. Tenant-Mismatch,
// Auftrag Abschnitt L: "Ein abweichender expliziter Tenantparameter: 404,
// Audit TENANT_MISMATCH_BLOCKED"). Ein fehlendes db-Handle (z. B. reine
// decideForPolicy-Unit-Tests ohne echte Datenbank) wird übersprungen statt
// zu werfen. Ein Auditfehler selbst darf das Gate niemals zum Absturz
// bringen – die Ablehnung des Requests bleibt in jedem Fall fail-closed
// bestehen, unabhängig davon, ob das Audit-Schreiben gelingt.
function auditDenialIfNeeded(db, decision, now) {
  if (!db || !decision || decision.allow) return;
  if (!(decision.auditOnDeny || decision.forceAudit)) return;
  const eventType = decision.reasonCode === "TENANT_MISMATCH_BLOCKED" ? "TENANT_MISMATCH_BLOCKED" : "ROUTE_DENIED";
  const identity = decision.identity || null;
  try {
    authAudit.recordAuditEvent(db, {
      eventType,
      result: "DENIED",
      actorUserId: identity && !identity.isBypass ? identity.userId : null,
      tenantId: identity && !identity.isBypass ? identity.tenantId : null,
      timestamp: now || new Date().toISOString(),
      metadata: { reasonCode: decision.reasonCode },
    });
  } catch (_error) {
    /* siehe Kommentar oben: Audit-Fehler dürfen das Gate nicht beeinflussen. */
  }
}

// ---------------------------------------------------------------------------
// Kernentscheidung für eine bereits aufgelöste Policy (auch für Unit-Tests
// von Zugriffsklassen nutzbar, die noch keiner realen Route zugeordnet
// sind – z. B. CUSTOMER_TENANT/SUPPORT_GRANT_ONLY, siehe Auftrag Abschnitt
// M: "Guard-Infrastruktur vorbereitet und getestet").
// ---------------------------------------------------------------------------

function decideForPolicy({
  policy,
  method,
  mode,
  isLoopbackHost,
  sessionLoadResult,
  requestParams = {},
  csrfOk = null,
  originOk = null,
}) {
  if (!policy) return denyResult(404, "NO_POLICY");

  if (policy.enabledInProd === false && mode === "prod") {
    return denyResult(404, "DISABLED_IN_PROD");
  }

  if (policy.errorStrategy === ERROR_STRATEGIES.PUBLIC) {
    const softIdentity = sessionLoadResult && sessionLoadResult.identity ? sessionLoadResult.identity : null;
    const isUnsafeMethodPublic = method !== "GET";
    if (isUnsafeMethodPublic && originOk === false) {
      return denyResult(403, "ORIGIN_REJECTED");
    }
    // CSRF gilt für PUBLIC_AUTH-Routen nur, wenn tatsächlich bereits eine
    // Session existiert (z. B. Logout mit vorhandenem Cookie) – ohne
    // Session (z. B. Login) ist kein CSRF-Schutz anwendbar oder nötig.
    if (isUnsafeMethodPublic && softIdentity && !softIdentity.isBypass && csrfOk === false) {
      return denyResult(403, "CSRF_REJECTED");
    }
    return allowResult(softIdentity, {
      isPublicAuthRoute: true,
      csrfValidated: isUnsafeMethodPublic && softIdentity ? Boolean(csrfOk) : null,
    });
  }

  const isChefBypassEligible = CHEF_BYPASS_ELIGIBLE_CLASSES.includes(policy.accessClass);
  let identity = sessionLoadResult && sessionLoadResult.identity ? sessionLoadResult.identity : null;

  if (!identity) {
    if (mode === "dev" && isLoopbackHost && isChefBypassEligible) {
      identity = DEV_BYPASS_IDENTITY;
    } else {
      return denyResult(policy.errorStrategy === ERROR_STRATEGIES.AUTH_401 ? 401 : 404, "NO_SESSION", {
        auditOnDeny: policy.auditOnDeny,
      });
    }
  }

  if (Array.isArray(policy.allowedRoles) && !policy.allowedRoles.includes(identity.role)) {
    return denyResult(404, "ROLE_DENIED", { auditOnDeny: policy.auditOnDeny, identity });
  }

  // Auftrag Abschnitt M: "SUPPORT erreicht ohne aktiven Grant keine Kunden-
  // oder Ownerdaten" / "Guard lehnt ohne Grant 404 ab" / "keine pauschale
  // Support-Bypass-Regel". Eine vollständige Grant-Vergabe-/Ablauffunktion
  // existiert in diesem Schritt bewusst noch nicht (identity.supportGrant
  // ist daher für JEDE reale Session immer null) – die Klasse
  // SUPPORT_GRANT_ONLY ist damit in Schritt 2 absichtlich für jede Identität
  // gesperrt, bis ein späterer Schritt eine echte Grant-Prüfung nachrüstet.
  if (policy.accessClass === ACCESS_CLASSES.SUPPORT_GRANT_ONLY && !identity.supportGrant) {
    return denyResult(404, "NO_SUPPORT_GRANT", { auditOnDeny: true, identity });
  }

  if (policy.tenantRequired) {
    const mismatch = detectTenantParamMismatch(requestParams, identity.tenantCustomerId);
    if (mismatch) {
      return denyResult(404, "TENANT_MISMATCH_BLOCKED", { auditOnDeny: true, identity, forceAudit: true });
    }
  }

  const isUnsafeMethod = method !== "GET";
  if (isUnsafeMethod) {
    if (originOk === false) {
      return denyResult(403, "ORIGIN_REJECTED", { identity });
    }
    if (!identity.isBypass && csrfOk === false) {
      return denyResult(403, "CSRF_REJECTED", { identity });
    }
  }

  return allowResult(identity, {
    csrfValidated: isUnsafeMethod && !identity.isBypass ? Boolean(csrfOk) : null,
  });
}

// ---------------------------------------------------------------------------
// Vollständige Auswertung eines echten Requests (Schritte 1–15).
// ---------------------------------------------------------------------------

function evaluateRouteAccess({ method, pathname, req, requestUrl, db, now, env, body }) {
  const modeInfo = resolveOperatingMode(env || process.env);
  if (!modeInfo.ok) {
    // Fehlkonfigurierter Produktivmodus darf niemals stillschweigend in den
    // Entwicklungsmodus zurückfallen (Auftrag Abschnitt C: "kein Fallback
    // auf Dev-Modus"). Ein laufender Prozess sollte diesen Zustand nie
    // erreichen (server.js bricht den Start vorher ab); als zusätzliche
    // Verteidigungslinie wird hier trotzdem fail-closed abgelehnt.
    return denyResult(500, "INVALID_MODE_CONFIG");
  }
  const { mode, publicOrigin } = modeInfo;

  const policy = routeAccessPolicy.resolvePolicyForRequest(method, pathname);
  if (!policy) return denyResult(404, "NO_POLICY");

  const isLoopbackHost = authHttp.isLoopbackHostHeader(req && req.headers ? req.headers.host : null);

  // Auch für PUBLIC_AUTH-Routen wird eine ggf. vorhandene Session weich
  // aufgelöst (z. B. GET /api/auth/session oder Logout mit Cookie), ohne
  // dass ihr Fehlen jemals zu einer Ablehnung führt.
  const sessionLoadResult = loadSessionIdentity({ db, req, mode, now });

  const isUnsafeMethod = method !== "GET";
  let originOk = null;
  let csrfOk = null;
  if (isUnsafeMethod) {
    originOk = authHttp.validateOriginForMode(req, mode, publicOrigin);
    if (sessionLoadResult.identity && !sessionLoadResult.identity.isBypass) {
      csrfOk = authHttp.validateCsrfDoubleSubmit(req, mode);
    }
  }

  const requestParams = collectRequestTenantParams(requestUrl, body);

  const decision = decideForPolicy({
    policy,
    method,
    mode,
    isLoopbackHost,
    sessionLoadResult,
    requestParams,
    csrfOk,
    originOk,
  });
  auditDenialIfNeeded(db, decision, now);
  return decision;
}

module.exports = {
  DEV_MODE_WARNING,
  DEV_BYPASS_IDENTITY,
  CHEF_BYPASS_ELIGIBLE_CLASSES,
  DIRECT_TENANT_FIELDS,
  OBSERVED_TENANT_FIELDS,
  resolveOperatingMode,
  loadSessionIdentity,
  identityFromRealSession,
  collectRequestTenantParams,
  detectTenantParamMismatch,
  decideForPolicy,
  evaluateRouteAccess,
  denyResult,
  allowResult,
  auditDenialIfNeeded,
};
