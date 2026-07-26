"use strict";

// V7.2 Phase A Schritt 2 – Auth-HTTP-Routen (Auftrag Abschnitt H).
//
// Kleines, separates Modul (Auftrag Abschnitt B: "Nur bei eindeutigem Bedarf
// darf ein kleines separates Modul entstehen, wenn dadurch server.js nicht
// weiter monolithisch anwächst") – server.js ist bereits > 23.000 Zeilen,
// daher leben die sechs neuen Auth-Handler bewusst hier statt dort. Dieses
// Modul importiert NIEMALS better-sqlite3 direkt; die Datenbank wird ihm bei
// jedem Aufruf über `deps.getDb()` gereicht (server.js entscheidet, wann/ob
// die Datenbank geöffnet wird).

const crypto = require("crypto");

const authDb = require("./auth-db");
const authSession = require("./auth-session");
const authPassword = require("./auth-password");
const authAudit = require("./auth-audit");
const authHttp = require("./auth-http");

const AUTH_API_MAX_BODY_BYTES = 8 * 1024;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const ROLE_LABELS = Object.freeze({
  OWNER: "Inhaber",
  CUSTOMER_ADMIN: "Kunde (Admin)",
  CUSTOMER_USER: "Kunde",
  SUPPORT: "Support",
});

function roleLabel(role) {
  return ROLE_LABELS[role] || "Unbekannt";
}

function nowIso() {
  return new Date().toISOString();
}

function isoPlusMs(baseIso, ms) {
  return new Date(new Date(baseIso).getTime() + ms).toISOString();
}

// ---------------------------------------------------------------------------
// Kleine, lokale JSON-Body-Hilfen (bewusst eine eigene, kleine Kopie statt
// eines Requires aus server.js – server.js requiert umgekehrt dieses Modul;
// ein Require in beide Richtungen wäre ein echter Zirkelbezug).
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

function genericAuthErrorPayload(message) {
  return { ok: false, message: message || "Anmeldung nicht möglich." };
}

// ---------------------------------------------------------------------------
// Reset-/Invite-Tokens: Rohtoken wird NIEMALS über eine öffentliche Antwort
// zurückgegeben (Auftrag Abschnitt H). generateAndStoreToken ist bewusst
// eine reine Modulfunktion ("testinterne Funktion") – keine HTTP-Route
// liefert den Rohwert zurück.
// ---------------------------------------------------------------------------

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

function generateAndStoreToken(db, userId, purpose, now) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const ttl = purpose === "INVITE" ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;
  authDb.createResetToken(db, {
    tokenHash,
    userId,
    purpose,
    now,
    expiresAt: isoPlusMs(now, ttl),
  });
  return rawToken;
}

function auditSafe(db, { eventType, result, actorUserId, tenantId, routeName, reasonCode, roleLabelValue }) {
  if (!db) return;
  try {
    const metadata = {};
    if (routeName) metadata.routeName = routeName;
    if (reasonCode) metadata.reasonCode = reasonCode;
    if (roleLabelValue) metadata.roleLabel = roleLabelValue;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: tenantId || null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf einen Auth-Ablauf niemals zum Absturz bringen. */
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

async function handleAuthLogin(res, context, deps) {
  const { req } = context;
  const { getDb, mode, rateLimiters, sendJson } = deps;

  let body;
  try {
    body = await readJsonRequestBody(req, AUTH_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["email", "password"], "login");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericAuthErrorPayload());
    return;
  }

  const emailNormalized = String(body.email || "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const now = nowIso();
  const ipHash = authHttp.hashClientIp(req) || "unknown-ip";

  const emailLimit = rateLimiters.loginPerEmail.consume(emailNormalized || "unknown-email", Date.parse(now));
  const ipLimit = rateLimiters.loginPerIp.consume(ipHash, Date.parse(now));
  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfterSeconds = Math.ceil(Math.max(emailLimit.retryAfterMs, ipLimit.retryAfterMs) / 1000);
    res.setHeader && res.setHeader("Retry-After", String(retryAfterSeconds));
    sendJson(res, 429, { ok: false, message: authHttp.GENERIC_MESSAGES.RATE_LIMITED, retryAfterSeconds });
    return;
  }

  const db = getDb();
  const user = emailNormalized ? authDb.getUserByEmailNormalized(db, emailNormalized) : null;

  // Auto-Entsperrung, wenn die Sperrfrist bereits verstrichen ist.
  let effectiveUser = user;
  if (effectiveUser && effectiveUser.status === "LOCKED" && effectiveUser.lockedUntil) {
    if (new Date(now).getTime() >= new Date(effectiveUser.lockedUntil).getTime()) {
      authDb.resetFailedLoginCount(db, effectiveUser.id, now);
      effectiveUser = authDb.updateUserStatus(db, effectiveUser.id, "ACTIVE", now);
    }
  }

  const storedHash = effectiveUser ? effectiveUser.passwordHash : null;
  const passwordOk = authPassword.verifyPassword(password, storedHash || authPassword.DUMMY_HASH_FOR_UNKNOWN_ACCOUNT);

  const genericFailure = () => {
    if (effectiveUser) {
      auditSafe(db, {
        eventType: "LOGIN_FAILED",
        result: "DENIED",
        actorUserId: effectiveUser.id,
        tenantId: effectiveUser.tenantId,
        routeName: "login",
      });
    } else {
      auditSafe(db, { eventType: "LOGIN_FAILED", result: "DENIED", routeName: "login", reasonCode: "UNKNOWN_ACCOUNT" });
    }
    sendJson(res, 401, genericAuthErrorPayload("Anmeldung nicht möglich."));
  };

  if (!effectiveUser || !passwordOk) {
    if (effectiveUser && effectiveUser.status === "ACTIVE") {
      const updated = authDb.recordFailedLogin(db, effectiveUser.id, now);
      if (updated.failedLoginCount >= LOGIN_LOCKOUT_THRESHOLD) {
        authDb.setUserLockedUntil(db, effectiveUser.id, isoPlusMs(now, LOGIN_LOCKOUT_DURATION_MS), now);
      }
    }
    genericFailure();
    return;
  }

  if (!["ACTIVE"].includes(effectiveUser.status)) {
    genericFailure();
    return;
  }

  let tenant = null;
  if (effectiveUser.tenantId) {
    tenant = authDb.getTenantProjectionById(db, effectiveUser.tenantId);
    if (!tenant || tenant.status !== "ACTIVE") {
      genericFailure();
      return;
    }
  }

  // Erfolg: Zähler zurücksetzen, lastLoginAt setzen, bestehende vom Browser
  // gelieferte Session NICHT übernehmen (sie wird – falls vorhanden und
  // gültig – widerrufen), danach eine vollständig neue Session erzeugen.
  authDb.resetFailedLoginCount(db, effectiveUser.id, now);
  authDb.touchLastLogin(db, effectiveUser.id, now);

  const incomingToken = authHttp.readSessionTokenFromRequest(req, mode);
  if (incomingToken) {
    authSession.revokeSessionByToken(db, incomingToken, now);
  }

  const userAgent = authHttp.getUserAgent(req);
  const { token, session } = authSession.createSession(db, {
    userId: effectiveUser.id,
    now,
    userAgent,
    clientIp: authHttp.getRawClientIp(req),
  });

  const csrfToken = authHttp.generateCsrfToken();
  const maxAgeSeconds = Math.floor((new Date(session.expiresAt).getTime() - new Date(now).getTime()) / 1000);

  res.setHeader &&
    res.setHeader("Set-Cookie", [
      authHttp.buildSessionSetCookie(mode, token, maxAgeSeconds),
      authHttp.buildCsrfSetCookie(mode, csrfToken, maxAgeSeconds),
    ]);

  auditSafe(db, {
    eventType: "LOGIN_SUCCESS",
    result: "OK",
    actorUserId: effectiveUser.id,
    tenantId: effectiveUser.tenantId,
    routeName: "login",
    roleLabelValue: roleLabel(effectiveUser.role),
  });

  sendJson(res, 200, {
    ok: true,
    displayName: effectiveUser.displayName,
    role: effectiveUser.role,
    tenantDisplayName: tenant ? tenant.displayName : null,
    csrfToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

async function handleAuthLogout(res, context, deps) {
  const { req } = context;
  const { getDb, mode, sendJson } = deps;
  const now = nowIso();

  const token = authHttp.readSessionTokenFromRequest(req, mode);
  if (token) {
    const db = getDb();
    const identity = context.identity;
    if (identity && !identity.isBypass) {
      auditSafe(db, {
        eventType: "LOGOUT",
        result: "OK",
        actorUserId: identity.userId,
        tenantId: identity.tenantId,
        routeName: "logout",
      });
    }
    authSession.revokeSessionByToken(db, token, now);
  }

  res.setHeader &&
    res.setHeader("Set-Cookie", [
      authHttp.buildClearedSessionSetCookie(mode),
      authHttp.buildClearedCsrfSetCookie(mode),
    ]);
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/auth/session
// ---------------------------------------------------------------------------

function handleAuthSessionStatus(res, context, deps) {
  const { sendJson } = deps;
  const identity = context.identity;
  if (!identity || identity.isBypass) {
    sendJson(res, 200, { authenticated: false });
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    displayName: identity.displayName,
    roleLabel: roleLabel(identity.role),
    tenantDisplayName: identity.tenantDisplayName,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/password-reset/request
// ---------------------------------------------------------------------------

async function handleAuthPasswordResetRequest(res, context, deps) {
  const { req } = context;
  const { getDb, rateLimiters, sendJson } = deps;

  let body;
  try {
    body = await readJsonRequestBody(req, AUTH_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["email"], "password-reset-request");
  } catch (error) {
    // Auch bei Formfehlern bewusst identische, geheimnisfreie Antwort statt
    // eines abweichenden Statuscodes, der Rückschlüsse erlauben könnte.
    sendJson(res, 200, { ok: true });
    return;
  }

  const emailNormalized = String(body.email || "").trim().toLowerCase();
  const now = nowIso();
  const ipHash = authHttp.hashClientIp(req) || "unknown-ip";

  const ipLimit = rateLimiters.resetRequestPerIp.consume(ipHash, Date.parse(now));
  const accountLimit = rateLimiters.resetRequestPerAccount.consume(emailNormalized || "unknown-email", Date.parse(now));
  if (!ipLimit.allowed || !accountLimit.allowed) {
    const retryAfterSeconds = Math.ceil(Math.max(ipLimit.retryAfterMs, accountLimit.retryAfterMs) / 1000);
    res.setHeader && res.setHeader("Retry-After", String(retryAfterSeconds));
    sendJson(res, 429, { ok: false, message: authHttp.GENERIC_MESSAGES.RATE_LIMITED, retryAfterSeconds });
    return;
  }

  if (emailNormalized) {
    const db = getDb();
    const user = authDb.getUserByEmailNormalized(db, emailNormalized);
    if (user && ["ACTIVE", "LOCKED"].includes(user.status)) {
      // Rohtoken wird bewusst NICHT verwendet/zurückgegeben – in Phase A
      // existiert kein Mailversand. Der gehashte Token wird trotzdem
      // serverseitig angelegt (Auftrag: "Token serverseitig erzeugen und
      // nur gehasht speichern"); der Rohwert verlässt diese Funktion nicht.
      generateAndStoreToken(db, user.id, "RESET", now);
      auditSafe(db, {
        eventType: "RESET_REQUESTED",
        result: "OK",
        actorUserId: user.id,
        tenantId: user.tenantId,
        routeName: "password-reset-request",
      });
    }
  }

  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/auth/password-reset/confirm
// ---------------------------------------------------------------------------

async function handleAuthPasswordResetConfirm(res, context, deps) {
  const { req } = context;
  const { getDb, rateLimiters, sendJson } = deps;

  let body;
  try {
    body = await readJsonRequestBody(req, AUTH_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["token", "newPassword"], "password-reset-confirm");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericAuthErrorPayload("Zurücksetzen nicht möglich."));
    return;
  }

  const now = nowIso();
  const ipHash = authHttp.hashClientIp(req) || "unknown-ip";
  const ipLimit = rateLimiters.resetConfirmPerIp.consume(ipHash, Date.parse(now));
  if (!ipLimit.allowed) {
    res.setHeader && res.setHeader("Retry-After", String(Math.ceil(ipLimit.retryAfterMs / 1000)));
    sendJson(res, 429, { ok: false, message: authHttp.GENERIC_MESSAGES.RATE_LIMITED });
    return;
  }

  const rawToken = typeof body.token === "string" ? body.token : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const genericFail = () => sendJson(res, 400, genericAuthErrorPayload("Zurücksetzen nicht möglich."));

  if (!rawToken) {
    genericFail();
    return;
  }

  const db = getDb();
  const tokenHash = hashResetToken(rawToken);
  const record = authDb.getResetTokenByHash(db, tokenHash);
  if (
    !record ||
    record.purpose !== "RESET" ||
    record.usedAt ||
    new Date(record.expiresAt).getTime() <= new Date(now).getTime()
  ) {
    genericFail();
    return;
  }

  const user = authDb.getUserById(db, record.userId);
  if (!user) {
    genericFail();
    return;
  }

  let tenant = null;
  if (user.tenantId) tenant = authDb.getTenantProjectionById(db, user.tenantId);

  const policyResult = authPassword.validatePasswordPolicy(newPassword, {
    emailNormalized: user.emailNormalized,
    tenantDisplayName: tenant ? tenant.displayName : null,
  });
  if (!policyResult.ok) {
    sendJson(res, 400, { ok: false, message: "Passwort erfüllt die Anforderungen nicht.", reasons: policyResult.reasons });
    return;
  }

  const consumed = authDb.consumeResetToken(db, tokenHash, now);
  if (!consumed.ok) {
    genericFail();
    return;
  }

  authDb.setPasswordHash(db, user.id, authPassword.hashPassword(newPassword), now);
  authDb.revokeAllSessionsForUser(db, user.id, now);
  auditSafe(db, {
    eventType: "PASSWORD_CHANGED",
    result: "OK",
    actorUserId: user.id,
    tenantId: user.tenantId,
    routeName: "password-reset-confirm",
  });
  auditSafe(db, {
    eventType: "RESET_USED",
    result: "OK",
    actorUserId: user.id,
    tenantId: user.tenantId,
    routeName: "password-reset-confirm",
  });

  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/auth/invitation/accept
// ---------------------------------------------------------------------------

async function handleAuthInvitationAccept(res, context, deps) {
  const { req } = context;
  const { getDb, rateLimiters, sendJson } = deps;

  let body;
  try {
    body = await readJsonRequestBody(req, AUTH_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, ["token", "newPassword"], "invitation-accept");
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericAuthErrorPayload("Einladung konnte nicht angenommen werden."));
    return;
  }

  const now = nowIso();
  const ipHash = authHttp.hashClientIp(req) || "unknown-ip";
  const ipLimit = rateLimiters.resetConfirmPerIp.consume(ipHash, Date.parse(now));
  if (!ipLimit.allowed) {
    res.setHeader && res.setHeader("Retry-After", String(Math.ceil(ipLimit.retryAfterMs / 1000)));
    sendJson(res, 429, { ok: false, message: authHttp.GENERIC_MESSAGES.RATE_LIMITED });
    return;
  }

  const rawToken = typeof body.token === "string" ? body.token : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const genericFail = () => sendJson(res, 400, genericAuthErrorPayload("Einladung konnte nicht angenommen werden."));

  if (!rawToken) {
    genericFail();
    return;
  }

  const db = getDb();
  const tokenHash = hashResetToken(rawToken);
  const record = authDb.getResetTokenByHash(db, tokenHash);
  if (
    !record ||
    record.purpose !== "INVITE" ||
    record.usedAt ||
    new Date(record.expiresAt).getTime() <= new Date(now).getTime()
  ) {
    genericFail();
    return;
  }

  const user = authDb.getUserById(db, record.userId);
  if (!user || user.status !== "INVITED") {
    genericFail();
    return;
  }

  let tenant = null;
  if (user.tenantId) tenant = authDb.getTenantProjectionById(db, user.tenantId);

  const policyResult = authPassword.validatePasswordPolicy(newPassword, {
    emailNormalized: user.emailNormalized,
    tenantDisplayName: tenant ? tenant.displayName : null,
  });
  if (!policyResult.ok) {
    sendJson(res, 400, { ok: false, message: "Passwort erfüllt die Anforderungen nicht.", reasons: policyResult.reasons });
    return;
  }

  const consumed = authDb.consumeResetToken(db, tokenHash, now);
  if (!consumed.ok) {
    genericFail();
    return;
  }

  authDb.setPasswordHash(db, user.id, authPassword.hashPassword(newPassword), now);
  authDb.updateUserStatus(db, user.id, "ACTIVE", now);
  authDb.revokeAllSessionsForUser(db, user.id, now);
  auditSafe(db, {
    eventType: "USER_STATUS_CHANGED",
    result: "OK",
    actorUserId: user.id,
    tenantId: user.tenantId,
    routeName: "invitation-accept",
    reasonCode: "INVITED_TO_ACTIVE",
  });
  auditSafe(db, {
    eventType: "PASSWORD_CHANGED",
    result: "OK",
    actorUserId: user.id,
    tenantId: user.tenantId,
    routeName: "invitation-accept",
  });

  sendJson(res, 200, { ok: true });
}

module.exports = {
  AUTH_API_MAX_BODY_BYTES,
  RESET_TOKEN_TTL_MS,
  INVITE_TOKEN_TTL_MS,
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_DURATION_MS,
  roleLabel,
  generateAndStoreToken,
  hashResetToken,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthSessionStatus,
  handleAuthPasswordResetRequest,
  handleAuthPasswordResetConfirm,
  handleAuthInvitationAccept,
};
