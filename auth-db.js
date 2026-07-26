"use strict";

// V7.2 Phase A Schritt 1 – Auth-/Tenant-Kern, persistente Identitätsschicht
// (Auftrag Abschnitt E). Dieses Modul ist im GESAMTEN Projekt das EINZIGE
// Modul, das better-sqlite3 importiert. Der Import erfolgt bewusst ohne
// try/catch: schlägt der Import fehl, bricht der Prozess sofort und hart
// ab (kein stiller Ersatz, kein Wechsel zu node:sqlite, kein
// Dateistore-Fallback). Dieses Modul enthält keine Route und keine HTTP-
// Abhängigkeit.
//
// Datenbankpfad: ${KUZ_DATA_DIR}/auth/auth.sqlite, Standard
// ~/Library/Application Support/KI-Unternehmenszentrale/auth/auth.sqlite
// (siehe server-status.js#defaultAppSupportDir, bestehendes Muster aus
// heygen-store.js/canva-store.js/document-registry.js). Verzeichnisrechte
// 0o700, Dateirechte 0o600.

const Database = require("better-sqlite3");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const serverStatusModule = require("./server-status");
const migrations = require("./auth-db-migrations");

// ---------------------------------------------------------------------------
// Fail-closed-Fehlerklasse. userMessage ist eine klare deutsche Meldung
// ohne Stacktrace (gegenüber Nutzern); internalDetail ist ausschließlich
// für lokale stderr-Diagnose gedacht.
// ---------------------------------------------------------------------------

class AuthDatabaseStartupError extends Error {
  constructor(userMessage, reasonCode, internalDetail) {
    super(userMessage);
    this.name = "AuthDatabaseStartupError";
    this.userMessage = userMessage;
    this.reasonCode = reasonCode || "UNKNOWN";
    this.internalDetail = internalDetail || null;
  }
}

// ---------------------------------------------------------------------------
// Pfade und Dateirechte.
// ---------------------------------------------------------------------------

function resolveAuthDbPaths(options = {}) {
  const dataDir = options.dataDir || process.env.KUZ_DATA_DIR || serverStatusModule.defaultAppSupportDir();
  const authDir = path.join(dataDir, "auth");
  return {
    dataDir,
    authDir,
    dbPath: path.join(authDir, "auth.sqlite"),
  };
}

function ensureDirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch (_error) {
    /* best effort auf Plattformen ohne POSIX-Rechtebits */
  }
}

function ensureFileSecure(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (_error) {
    /* best effort auf Plattformen ohne POSIX-Rechtebits */
  }
}

function configurePragmas(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
}

// ---------------------------------------------------------------------------
// Lebenszyklus: öffnen, migrieren, schließen. Kein stiller Fallback bei
// Fehlern – jeder Fehlerpfad wirft eine AuthDatabaseStartupError mit klarer
// deutscher Nutzermeldung.
// ---------------------------------------------------------------------------

function openAuthDatabase(options = {}) {
  const paths = resolveAuthDbPaths(options);

  try {
    ensureDirSecure(paths.authDir);
  } catch (error) {
    throw new AuthDatabaseStartupError(
      "Das Verzeichnis der Authentifizierungsdatenbank konnte nicht sicher angelegt werden. Der Server wird aus Sicherheitsgründen beendet.",
      "AUTH_DIR_FAILED",
      error && error.message,
    );
  }

  let db;
  try {
    db = new Database(paths.dbPath);
  } catch (error) {
    throw new AuthDatabaseStartupError(
      "Die Authentifizierungsdatenbank konnte nicht geöffnet werden. Der Server wird aus Sicherheitsgründen beendet.",
      "OPEN_FAILED",
      error && error.message,
    );
  }

  ensureFileSecure(paths.dbPath);

  try {
    configurePragmas(db);
  } catch (error) {
    db.close();
    throw new AuthDatabaseStartupError(
      "Die Authentifizierungsdatenbank konnte nicht konfiguriert werden. Der Server wird aus Sicherheitsgründen beendet.",
      "PRAGMA_FAILED",
      error && error.message,
    );
  }

  try {
    migrations.runMigrations(db);
  } catch (error) {
    db.close();
    throw new AuthDatabaseStartupError(
      "Die Migrationen der Authentifizierungsdatenbank konnten nicht angewendet werden. Der Server wird aus Sicherheitsgründen beendet.",
      "MIGRATION_FAILED",
      error && error.message,
    );
  }

  return { db, paths };
}

function closeAuthDatabase(db) {
  if (db && typeof db.close === "function") {
    db.close();
  }
}

function runAuthMigrations(db) {
  return migrations.runMigrations(db);
}

function withAuthTransaction(db, fn) {
  const wrapped = db.transaction(fn);
  return wrapped();
}

// Zentrale Fail-closed-Meldung: klare deutsche Nutzermeldung auf stderr,
// technisches Detail ausschließlich als separate, lokal gekennzeichnete
// Zeile. Kein Stacktrace gegenüber Nutzern.
function reportStartupFailureAndExit(error, options = {}) {
  const exit = options.exit || process.exit;
  const userMessage =
    (error && error.userMessage) ||
    "Die Authentifizierungsdatenbank konnte nicht gestartet werden. Der Server wird aus Sicherheitsgründen beendet.";
  console.error(userMessage);
  const detail = (error && (error.internalDetail || error.message)) || "Unbekannter Fehler.";
  console.error(`[intern][auth-db] ${detail}`);
  exit(1);
}

// Vollständiger Fail-closed-Startpfad: öffnen, migrieren UND (sofern nicht
// deaktiviert) Mandantenabgleich gegen agency-tenant-registry.js. Der
// require von auth-tenant-link.js erfolgt bewusst spät innerhalb der
// Funktion (nicht auf Modulebene), weil auth-tenant-link.js selbst
// auth-db.js require't – ein Modulebenen-Require in beide Richtungen wäre
// ein echter Zirkelbezug. Diese Funktion wird in diesem Schritt von
// KEINEM bestehenden Serverstart aufgerufen (server.js bleibt
// unverändert) – sie ist ausschließlich als getestete, verwendungsfertige
// Fähigkeit für einen späteren Schritt vorbereitet.
function runStartupSelfCheckOrExit(options = {}) {
  let opened;
  try {
    opened = openAuthDatabase(options);
  } catch (error) {
    reportStartupFailureAndExit(error, options);
    return null;
  }
  if (options.syncTenants === false) {
    return opened;
  }
  try {
    // eslint-disable-next-line global-require
    const tenantLink = require("./auth-tenant-link");
    tenantLink.syncTenantProjections(opened.db);
  } catch (error) {
    closeAuthDatabase(opened.db);
    const wrapped =
      error instanceof AuthDatabaseStartupError
        ? error
        : new AuthDatabaseStartupError(
            "Der Mandantenabgleich der Authentifizierungsdatenbank ist fehlgeschlagen. Der Server wird aus Sicherheitsgründen beendet.",
            "TENANT_SYNC_FAILED",
            error && error.message,
          );
    reportStartupFailureAndExit(wrapped, options);
    return null;
  }
  return opened;
}

// ---------------------------------------------------------------------------
// Kleine Hilfsfunktionen.
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// User-Funktionen.
// ---------------------------------------------------------------------------

function createUser(db, input = {}) {
  const now = input.now || nowIso();
  const emailNormalized = normalizeEmail(input.emailNormalized ?? input.email);
  if (!emailNormalized) {
    throw new Error("E-Mail-Adresse fehlt oder ist ungültig.");
  }
  const record = {
    id: input.id || crypto.randomUUID(),
    emailNormalized,
    displayName: String(input.displayName || "").trim(),
    passwordHash: input.passwordHash ?? null,
    role: input.role,
    tenantId: input.tenantId ?? null,
    status: input.status || "INVITED",
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    passwordChangedAt: input.passwordHash ? now : null,
  };
  db.prepare(
    `INSERT INTO users
      (id, emailNormalized, displayName, passwordHash, role, tenantId, status, failedLoginCount, lockedUntil, createdAt, updatedAt, lastLoginAt, passwordChangedAt)
     VALUES
      (@id, @emailNormalized, @displayName, @passwordHash, @role, @tenantId, @status, @failedLoginCount, @lockedUntil, @createdAt, @updatedAt, @lastLoginAt, @passwordChangedAt)`,
  ).run(record);
  return getUserById(db, record.id);
}

function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

function getUserByEmailNormalized(db, email) {
  return db.prepare("SELECT * FROM users WHERE emailNormalized = ?").get(normalizeEmail(email)) || null;
}

function updateUserStatus(db, id, status, now) {
  const info = db.prepare("UPDATE users SET status = ?, updatedAt = ? WHERE id = ?").run(status, now || nowIso(), id);
  return info.changes === 1 ? getUserById(db, id) : null;
}

function recordFailedLogin(db, id, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE users SET failedLoginCount = failedLoginCount + 1, updatedAt = ? WHERE id = ?").run(ts, id);
  return getUserById(db, id);
}

function resetFailedLoginCount(db, id, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE users SET failedLoginCount = 0, lockedUntil = NULL, updatedAt = ? WHERE id = ?").run(ts, id);
  return getUserById(db, id);
}

function setUserLockedUntil(db, id, lockedUntilIso, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE users SET lockedUntil = ?, status = 'LOCKED', updatedAt = ? WHERE id = ?").run(lockedUntilIso, ts, id);
  return getUserById(db, id);
}

function setPasswordHash(db, id, passwordHash, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE users SET passwordHash = ?, passwordChangedAt = ?, updatedAt = ? WHERE id = ?").run(
    passwordHash,
    ts,
    ts,
    id,
  );
  return getUserById(db, id);
}

function touchLastLogin(db, id, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?").run(ts, ts, id);
  return getUserById(db, id);
}

// ---------------------------------------------------------------------------
// Tenant-Projektionsfunktionen. agency-tenant-registry.js bleibt die
// kanonische Mandantenwahrheit (siehe auth-tenant-link.js); diese Tabelle
// ist nur eine betriebliche Projektion. customerId ist unveränderlich –
// es gibt bewusst keine Funktion, die customerId nachträglich ändert.
// ---------------------------------------------------------------------------

function createTenantProjection(db, input = {}) {
  const now = input.now || nowIso();
  const record = {
    id: input.id || crypto.randomUUID(),
    customerId: input.customerId,
    displayName: input.displayName,
    status: input.status,
    serviceTier: input.serviceTier ?? null,
    reviewMode: input.reviewMode ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO tenants (id, customerId, displayName, status, serviceTier, reviewMode, createdAt, updatedAt)
     VALUES (@id, @customerId, @displayName, @status, @serviceTier, @reviewMode, @createdAt, @updatedAt)`,
  ).run(record);
  return getTenantProjectionByCustomerId(db, record.customerId);
}

function getTenantProjectionByCustomerId(db, customerId) {
  return db.prepare("SELECT * FROM tenants WHERE customerId = ?").get(customerId) || null;
}

function getTenantProjectionById(db, id) {
  return db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) || null;
}

function listTenantProjections(db) {
  return db.prepare("SELECT * FROM tenants ORDER BY customerId ASC").all();
}

// Spiegelt ausschließlich displayName (siehe Auftrag Abschnitt G:
// "displayName aus Registry spiegeln"). status/serviceTier/reviewMode sind
// betriebliche Vorgabewerte und werden hier bewusst NICHT überschrieben.
function updateTenantDisplayName(db, customerId, displayName, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE tenants SET displayName = ?, updatedAt = ? WHERE customerId = ?").run(displayName, ts, customerId);
  return getTenantProjectionByCustomerId(db, customerId);
}

// ---------------------------------------------------------------------------
// Session-Funktionen. Es wird ausschließlich der Token-Hash gespeichert,
// niemals eine Klartext-Session-ID (siehe auth-session.js für die
// Sessionlogik oberhalb dieser Persistenzschicht).
// ---------------------------------------------------------------------------

function insertSession(db, record) {
  const full = {
    revokedAt: null,
    tenantId: null,
    userAgentHash: null,
    clientIpHash: null,
    ...record,
  };
  db.prepare(
    `INSERT INTO sessions (id, tokenHash, userId, tenantId, createdAt, expiresAt, lastSeenAt, revokedAt, userAgentHash, clientIpHash)
     VALUES (@id, @tokenHash, @userId, @tenantId, @createdAt, @expiresAt, @lastSeenAt, @revokedAt, @userAgentHash, @clientIpHash)`,
  ).run(full);
  return getSessionById(db, full.id);
}

function getSessionById(db, id) {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) || null;
}

function findSessionByTokenHash(db, tokenHash) {
  return db.prepare("SELECT * FROM sessions WHERE tokenHash = ?").get(tokenHash) || null;
}

function listActiveSessionsForUser(db, userId, now) {
  return db
    .prepare("SELECT * FROM sessions WHERE userId = ? AND revokedAt IS NULL AND expiresAt > ? ORDER BY createdAt ASC")
    .all(userId, now || nowIso());
}

function markSessionRevoked(db, id, now) {
  const info = db.prepare("UPDATE sessions SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL").run(now || nowIso(), id);
  return info.changes === 1;
}

function revokeAllSessionsForUser(db, userId, now) {
  const info = db
    .prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL")
    .run(now || nowIso(), userId);
  return info.changes;
}

function touchSessionLastSeen(db, id, now) {
  db.prepare("UPDATE sessions SET lastSeenAt = ? WHERE id = ?").run(now || nowIso(), id);
  return getSessionById(db, id);
}

function deleteExpiredSessions(db, now) {
  const info = db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(now || nowIso());
  return info.changes;
}

// ---------------------------------------------------------------------------
// Reset-/Invite-Token-Funktionen. Einlösung ist atomar
// (UPDATE ... WHERE usedAt IS NULL) und verlangt exakt eine geänderte Zeile.
// ---------------------------------------------------------------------------

function createResetToken(db, input = {}) {
  const now = input.now || nowIso();
  db.prepare(
    `INSERT INTO password_reset_tokens (tokenHash, userId, purpose, createdAt, expiresAt, usedAt)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(input.tokenHash, input.userId, input.purpose, now, input.expiresAt);
  return getResetTokenByHash(db, input.tokenHash);
}

function getResetTokenByHash(db, tokenHash) {
  return db.prepare("SELECT * FROM password_reset_tokens WHERE tokenHash = ?").get(tokenHash) || null;
}

function consumeResetToken(db, tokenHash, now) {
  const ts = now || nowIso();
  const info = db
    .prepare("UPDATE password_reset_tokens SET usedAt = ? WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > ?")
    .run(ts, tokenHash, ts);
  if (info.changes !== 1) {
    return { ok: false, changes: info.changes };
  }
  return { ok: true, changes: info.changes, token: getResetTokenByHash(db, tokenHash) };
}

// ---------------------------------------------------------------------------
// Auditfunktionen. Append-only: kein UPDATE, kein DELETE über diese
// öffentliche Schnittstelle (zusätzlich auf Datenbankebene per Trigger
// erzwungen, siehe auth-db-migrations.js).
// ---------------------------------------------------------------------------

function insertAuditEvent(db, record) {
  const full = { actorUserId: null, tenantId: null, metadata: null, ...record };
  db.prepare(
    `INSERT INTO auth_audit_events (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
     VALUES (@eventId, @actorUserId, @tenantId, @eventType, @result, @timestamp, @metadata)`,
  ).run(full);
  return getAuditEventById(db, full.eventId);
}

function getAuditEventById(db, eventId) {
  return db.prepare("SELECT * FROM auth_audit_events WHERE eventId = ?").get(eventId) || null;
}

function listAuditEvents(db, filter = {}) {
  const clauses = [];
  const params = [];
  if (filter.tenantId) {
    clauses.push("tenantId = ?");
    params.push(filter.tenantId);
  }
  if (filter.eventType) {
    clauses.push("eventType = ?");
    params.push(filter.eventType);
  }
  let sql = "SELECT * FROM auth_audit_events";
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY timestamp ASC";
  return db.prepare(sql).all(...params);
}

module.exports = {
  AuthDatabaseStartupError,
  resolveAuthDbPaths,
  openAuthDatabase,
  closeAuthDatabase,
  runAuthMigrations,
  withAuthTransaction,
  reportStartupFailureAndExit,
  runStartupSelfCheckOrExit,
  // User
  createUser,
  getUserById,
  getUserByEmailNormalized,
  updateUserStatus,
  recordFailedLogin,
  resetFailedLoginCount,
  setUserLockedUntil,
  setPasswordHash,
  touchLastLogin,
  // Tenant-Projektion
  createTenantProjection,
  getTenantProjectionByCustomerId,
  getTenantProjectionById,
  listTenantProjections,
  updateTenantDisplayName,
  // Sessions
  insertSession,
  getSessionById,
  findSessionByTokenHash,
  listActiveSessionsForUser,
  markSessionRevoked,
  revokeAllSessionsForUser,
  touchSessionLastSeen,
  deleteExpiredSessions,
  // Reset-Tokens
  createResetToken,
  getResetTokenByHash,
  consumeResetToken,
  // Audit
  insertAuditEvent,
  getAuditEventById,
  listAuditEvents,
};
