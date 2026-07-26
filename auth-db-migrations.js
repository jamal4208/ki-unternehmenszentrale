"use strict";

// V7.2 Phase A Schritt 1 – nummerierte, vorwärtsgerichtete Migrationen für
// die Auth-Datenbank (Auftrag Abschnitt F). Reine SQL-Definitionen; dieses
// Modul importiert selbst KEIN better-sqlite3 und öffnet KEINE Datenbank –
// es operiert ausschließlich auf einem bereits geöffneten better-sqlite3-
// Datenbankobjekt, das von auth-db.js übergeben wird.
//
// Jede Migration ist transaktional (DDL + Eintrag in schema_migrations in
// derselben Transaktion) und idempotent (bereits angewendete Versionen
// werden übersprungen). Es gibt bewusst keine automatische
// Rückwärtsmigration.

const ROLE_VALUES = Object.freeze(["OWNER", "CUSTOMER_ADMIN", "CUSTOMER_USER", "SUPPORT"]);
const USER_STATUS_VALUES = Object.freeze(["INVITED", "ACTIVE", "LOCKED", "DISABLED"]);
const TENANT_STATUS_VALUES = Object.freeze(["ACTIVE", "SUSPENDED", "CLOSED"]);
const RESET_TOKEN_PURPOSE_VALUES = Object.freeze(["INVITE", "RESET"]);
const AUDIT_EVENT_TYPES = Object.freeze([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "RESET_REQUESTED",
  "RESET_USED",
  "USER_CREATED",
  "USER_STATUS_CHANGED",
  "ROLE_CHANGED",
  "SUPPORT_GRANTED",
  "SUPPORT_REVOKED",
  "SUPPORT_ACCESS",
  "TENANT_MISMATCH_BLOCKED",
  "ROUTE_DENIED",
]);
const AUDIT_RESULT_VALUES = Object.freeze(["OK", "DENIED", "ERROR"]);

function sqlEnum(values) {
  return values.map((value) => `'${value}'`).join(",");
}

const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: "create_tenants",
    sql: `
      CREATE TABLE tenants (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(TENANT_STATUS_VALUES)})),
        serviceTier TEXT,
        reviewMode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `,
  }),
  Object.freeze({
    version: 2,
    name: "create_users",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        emailNormalized TEXT NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        passwordHash TEXT,
        role TEXT NOT NULL CHECK (role IN (${sqlEnum(ROLE_VALUES)})),
        tenantId TEXT,
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(USER_STATUS_VALUES)})),
        failedLoginCount INTEGER NOT NULL DEFAULT 0,
        lockedUntil TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastLoginAt TEXT,
        passwordChangedAt TEXT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        CHECK (
          (role IN ('OWNER','SUPPORT') AND tenantId IS NULL)
          OR
          (role IN ('CUSTOMER_ADMIN','CUSTOMER_USER') AND tenantId IS NOT NULL)
        )
      );
    `,
  }),
  Object.freeze({
    version: 3,
    name: "create_sessions",
    sql: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        tokenHash TEXT NOT NULL UNIQUE,
        userId TEXT NOT NULL,
        tenantId TEXT,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        lastSeenAt TEXT NOT NULL,
        revokedAt TEXT,
        userAgentHash TEXT,
        clientIpHash TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT
      );
    `,
  }),
  Object.freeze({
    version: 4,
    name: "create_password_reset_tokens",
    sql: `
      CREATE TABLE password_reset_tokens (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN (${sqlEnum(RESET_TOKEN_PURPOSE_VALUES)})),
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        usedAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `,
  }),
  Object.freeze({
    version: 5,
    name: "create_auth_audit_events",
    sql: `
      CREATE TABLE auth_audit_events (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TRIGGER trg_auth_audit_events_no_update
      BEFORE UPDATE ON auth_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'auth_audit_events ist append-only: UPDATE ist nicht erlaubt.');
      END;

      CREATE TRIGGER trg_auth_audit_events_no_delete
      BEFORE DELETE ON auth_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'auth_audit_events ist append-only: DELETE ist nicht erlaubt.');
      END;
    `,
  }),
  Object.freeze({
    version: 6,
    name: "create_indexes",
    sql: `
      CREATE INDEX idx_users_tenantId ON users(tenantId);
      CREATE INDEX idx_sessions_userId ON sessions(userId);
      CREATE INDEX idx_sessions_expiresAt ON sessions(expiresAt);
      CREATE INDEX idx_password_reset_tokens_userId ON password_reset_tokens(userId);
      CREATE INDEX idx_auth_audit_events_timestamp ON auth_audit_events(timestamp);
      CREATE INDEX idx_auth_audit_events_tenantId ON auth_audit_events(tenantId);
    `,
  }),
]);

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `);
}

function getAppliedVersions(db) {
  ensureMigrationsTable(db);
  const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all();
  return rows.map((row) => row.version);
}

// Idempotent und transaktional: jede noch nicht angewendete Migration wird
// einzeln in einer eigenen Transaktion ausgeführt (DDL + Markierung). Ein
// erneuter Aufruf mit bereits vollständig angewendetem Stand ist ein No-op.
function runMigrations(db, options = {}) {
  ensureMigrationsTable(db);
  const applied = new Set(getAppliedVersions(db));
  const now = options.now || new Date().toISOString();
  const appliedNow = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const applyOne = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(migration.version, now);
    });
    applyOne();
    appliedNow.push(migration.version);
  }
  return {
    appliedNow,
    allVersions: MIGRATIONS.map((migration) => migration.version),
  };
}

module.exports = {
  ROLE_VALUES,
  USER_STATUS_VALUES,
  TENANT_STATUS_VALUES,
  RESET_TOKEN_PURPOSE_VALUES,
  AUDIT_EVENT_TYPES,
  AUDIT_RESULT_VALUES,
  MIGRATIONS,
  ensureMigrationsTable,
  getAppliedVersions,
  runMigrations,
};
