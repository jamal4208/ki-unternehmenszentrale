"use strict";

// V7.2 Phase A Schritt 1 – Sessionkern (Auftrag Abschnitt I).
//
// Reine Session-Logik: Token-Erzeugung, Hashing, Ablaufregeln, Rotation,
// Widerruf, Höchstgrenze aktiver Sessions. Persistenz ausschließlich über
// auth-db.js – dieses Modul importiert NIEMALS better-sqlite3 selbst.
//
// In diesem Schritt bewusst NICHT enthalten: Cookies, HTTP-Route,
// Browserablage. Dieses Modul kennt weder Request- noch Response-Objekte.

const crypto = require("crypto");
const authDb = require("./auth-db");

const SESSION_TOKEN_BYTES = 32; // 256 Bit Zufall
const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000; // absolute Lebensdauer: 12 Stunden
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // Leerlaufgrenze: 60 Minuten
const MAX_ACTIVE_SESSIONS_PER_USER = 5;

// ---------------------------------------------------------------------------
// Token-/Hashfunktionen. Klartext-Token wird niemals gespeichert – nur der
// SHA-256-Hash landet in der Datenbank (siehe auth-db.js#sessions).
// ---------------------------------------------------------------------------

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function generateSessionToken() {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

// Optionaler Sicherheitskontext: User-Agent/IP werden ausschließlich
// gehasht abgelegt, niemals im Klartext. Kein Pepper in Datenbank oder
// Export – dieses Modul verwendet bewusst keinen Pepper, um genau das
// auszuschließen.
function hashOptionalContext(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Ablaufregeln.
// ---------------------------------------------------------------------------

function computeAbsoluteExpiry(createdAtIso) {
  return new Date(new Date(createdAtIso).getTime() + ABSOLUTE_LIFETIME_MS).toISOString();
}

function isAbsoluteExpired(expiresAtIso, nowIso) {
  return new Date(nowIso).getTime() >= new Date(expiresAtIso).getTime();
}

function isIdleExpired(lastSeenAtIso, nowIso) {
  return new Date(nowIso).getTime() - new Date(lastSeenAtIso).getTime() >= IDLE_TIMEOUT_MS;
}

function isSessionExpired(session, nowIso) {
  return isAbsoluteExpired(session.expiresAt, nowIso) || isIdleExpired(session.lastSeenAt, nowIso);
}

// ---------------------------------------------------------------------------
// Höchstgrenze aktiver Sessions: maximal 5 je Nutzer, älteste wird
// widerrufen. Wird vor dem Anlegen einer neuen Session aufgerufen, damit
// nach dem Anlegen höchstens 5 aktive Sessions existieren.
// ---------------------------------------------------------------------------

function enforceMaxActiveSessions(db, userId, now) {
  const active = authDb.listActiveSessionsForUser(db, userId, now); // bereits nach createdAt ASC sortiert
  if (active.length < MAX_ACTIVE_SESSIONS_PER_USER) {
    return { revokedSessionIds: [] };
  }
  const overLimit = active.length - MAX_ACTIVE_SESSIONS_PER_USER + 1;
  const oldest = active.slice(0, overLimit);
  oldest.forEach((session) => authDb.markSessionRevoked(db, session.id, now));
  return { revokedSessionIds: oldest.map((session) => session.id) };
}

// ---------------------------------------------------------------------------
// Sessionerzeugung. tenantId wird bewusst NICHT vom Aufrufer übernommen,
// sondern ausschließlich aus dem bestehenden Nutzerdatensatz abgeleitet
// (gleiches Muster wie die Mandantenbindung in heygen-store.js) – so kann
// eine Session nicht versehentlich oder absichtlich einem falschen
// Mandanten zugeordnet werden.
// ---------------------------------------------------------------------------

function createSession(db, input = {}) {
  const now = input.now || new Date().toISOString();
  const user = authDb.getUserById(db, input.userId);
  if (!user) {
    throw new Error(`Session kann nicht erstellt werden: Nutzer "${input.userId}" existiert nicht.`);
  }
  enforceMaxActiveSessions(db, user.id, now);
  const { token, tokenHash } = generateSessionToken();
  const record = {
    id: crypto.randomUUID(),
    tokenHash,
    userId: user.id,
    tenantId: user.tenantId,
    createdAt: now,
    expiresAt: computeAbsoluteExpiry(now),
    lastSeenAt: now,
    revokedAt: null,
    userAgentHash: hashOptionalContext(input.userAgent),
    clientIpHash: hashOptionalContext(input.clientIp),
  };
  const saved = authDb.insertSession(db, record);
  return { token, session: saved };
}

// Prüft ein Token gegen die Datenbank, verlängert bei Gültigkeit die
// Leerlaufgrenze (lastSeenAt) und gibt andernfalls einen präzisen
// Ablehnungsgrund zurück.
function validateAndTouchSession(db, token, now) {
  const nowIso = now || new Date().toISOString();
  const session = authDb.findSessionByTokenHash(db, hashSessionToken(token));
  if (!session) return { ok: false, reason: "NOT_FOUND" };
  if (session.revokedAt) return { ok: false, reason: "REVOKED", session };
  if (isSessionExpired(session, nowIso)) return { ok: false, reason: "EXPIRED", session };
  authDb.touchSessionLastSeen(db, session.id, nowIso);
  return { ok: true, session: { ...session, lastSeenAt: nowIso } };
}

function revokeSession(db, sessionId, now) {
  return authDb.markSessionRevoked(db, sessionId, now || new Date().toISOString());
}

function revokeSessionByToken(db, token, now) {
  const session = authDb.findSessionByTokenHash(db, hashSessionToken(token));
  if (!session) return false;
  return revokeSession(db, session.id, now);
}

function revokeAllSessionsForUser(db, userId, now) {
  return authDb.revokeAllSessionsForUser(db, userId, now || new Date().toISOString());
}

// Sessionrotation: widerruft die vorhandene, gültige Session und legt eine
// neue Session für denselben Nutzer an. Gibt bei ungültiger Ausgangssession
// den Ablehnungsgrund zurück, ohne etwas zu verändern.
function rotateSession(db, currentToken, now) {
  const nowIso = now || new Date().toISOString();
  const validation = validateAndTouchSession(db, currentToken, nowIso);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  authDb.markSessionRevoked(db, validation.session.id, nowIso);
  const rotated = createSession(db, { userId: validation.session.userId, now: nowIso });
  return { ok: true, token: rotated.token, session: rotated.session };
}

function cleanupExpiredSessions(db, now) {
  return authDb.deleteExpiredSessions(db, now || new Date().toISOString());
}

module.exports = {
  SESSION_TOKEN_BYTES,
  ABSOLUTE_LIFETIME_MS,
  IDLE_TIMEOUT_MS,
  MAX_ACTIVE_SESSIONS_PER_USER,
  hashSessionToken,
  generateSessionToken,
  hashOptionalContext,
  computeAbsoluteExpiry,
  isAbsoluteExpired,
  isIdleExpired,
  isSessionExpired,
  enforceMaxActiveSessions,
  createSession,
  validateAndTouchSession,
  revokeSession,
  revokeSessionByToken,
  revokeAllSessionsForUser,
  rotateSession,
  cleanupExpiredSessions,
};
