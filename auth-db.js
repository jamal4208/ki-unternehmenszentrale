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

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt G/H) – Benutzerliste je Mandant
// für die Owner-Verwaltung ("Benutzerliste je Mandant"). Filtert
// ausschließlich auf die interne tenants.id (niemals auf die kanonische
// customerId direkt), identisch zur Mandantenbindung in users.tenantId.
function listUsersByTenantId(db, tenantId) {
  return db.prepare("SELECT * FROM users WHERE tenantId = ? ORDER BY createdAt ASC").all(tenantId);
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

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt G/H) – explizite Owner-Aktion
// ("Aktivierung eines Mandanten ist eine explizite Owner-Aktion"). Getrennt
// von updateTenantDisplayName, weil diese Funktion NUR den vom Owner
// gesteuerten Betriebsstatus setzt (ACTIVE/SUSPENDED/CLOSED), niemals den
// Anzeigenamen. Der Aufrufer (owner-admin-service.js) validiert vorher, dass
// customerId ein kanonischer Registry-Mandant ist (agency-tenant-registry.js
// bleibt die alleinige Wahrheitsquelle) und dass status ein gültiger
// TENANT_STATUS_VALUES-Wert ist – die SQLite-CHECK-Constraint der Tabelle
// bleibt zusätzlich als zweite Verteidigungslinie bestehen.
function updateTenantStatus(db, customerId, status, now) {
  const ts = now || nowIso();
  db.prepare("UPDATE tenants SET status = ?, updatedAt = ? WHERE customerId = ?").run(status, ts, customerId);
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

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt G/H) – Owner-Verwaltung von
// Einladungs-/Reset-Vorgängen OHNE jemals einen Rohtoken zu lesen oder
// zurückzugeben (die Datenbank speichert ausschließlich den Hash, siehe
// Moduldokumentation oben). findLatestPendingTokenForUser dient
// ausschließlich dazu, einen booleschen "Einladungsstatus" abzuleiten
// (Auftrag Abschnitt G: "Einladungsstatus" in der Benutzerliste).
function findLatestPendingTokenForUser(db, userId, purpose, now) {
  const ts = now || nowIso();
  return (
    db
      .prepare(
        "SELECT * FROM password_reset_tokens WHERE userId = ? AND purpose = ? AND usedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1",
      )
      .get(userId, purpose, ts) || null
  );
}

// Entwertet jeden noch offenen (nicht eingelösten) Token eines Nutzers für
// einen bestimmten Zweck, ohne den Rohwert je gesehen zu haben – fachlich
// identisch zu "Einladung widerrufen"/"alten Token beim Reissue entwerten".
// Markiert per usedAt (kein DELETE – password_reset_tokens bleibt vollständig
// nachvollziehbar, ohne dass ein entwerteter Token je wieder einlösbar wäre).
function revokePendingTokensForUser(db, userId, purpose, now) {
  const ts = now || nowIso();
  const info = db
    .prepare("UPDATE password_reset_tokens SET usedAt = ? WHERE userId = ? AND purpose = ? AND usedAt IS NULL")
    .run(ts, userId, purpose);
  return info.changes;
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

// ---------------------------------------------------------------------------
// Work-Order-Funktionen (V7.2 Phase B Schritt 1, Auftrag Abschnitt C/H).
// Jede statusverändernde Funktion prüft den aktuellen Ausgangsstatus als
// Teil der WHERE-Klausel (atomares "compare-and-set", gleiches Muster wie
// consumeResetToken oben) – eine zweite, datenbanknahe Verteidigungslinie
// zusätzlich zur fachlichen Prüfung in work-order-service.js. Für die
// Kundenfunktionen (resubmitWorkOrder/transitionWorkOrder mit tenantId)
// wird zusätzlich tenantId in der WHERE-Klausel erzwungen, damit selbst ein
// Fehler in der aufrufenden Serviceschicht keinen mandantenübergreifenden
// Schreibzugriff erlauben kann.
//
// Produktkorrektur (Selbstbedienungs-Fluss, siehe
// work-order-service.js#Kopfkommentar): ownerNote/reviewedAt/
// reviewedByUserId wurden zu statusNote/decidedAt/decidedByUserId, weil der
// OWNER keine reguläre fachliche Prüfinstanz mehr ist (siehe Migration 8 in
// auth-db-migrations.js für die Spaltenumbenennung). Die frühere Funktion
// reviewWorkOrder(expectedStatus) wich einer allgemeineren
// transitionWorkOrder(fromStatuses) – dieselbe compare-and-set-Technik,
// aber mit einer Liste erlaubter Ausgangsstatus (z. B. Owner-Eskalation aus
// SUBMITTED, NEEDS_CLARIFICATION ODER READY_FOR_PROCESSING).
// ---------------------------------------------------------------------------

function createWorkOrder(db, input = {}) {
  const now = input.now || nowIso();
  const record = {
    id: input.id || crypto.randomUUID(),
    tenantId: input.tenantId,
    createdByUserId: input.createdByUserId,
    title: input.title,
    desiredResult: input.desiredResult,
    context: input.context ?? null,
    deadlineText: input.deadlineText ?? null,
    status: input.status || "SUBMITTED",
    statusNote: input.statusNote ?? null,
    createdAt: now,
    updatedAt: now,
    submittedAt: input.submittedAt ?? now,
    // Die automatische Vollständigkeitsregel (work-order-service.js) trifft
    // ihre Entscheidung synchron innerhalb derselben Anfrage – decidedAt
    // markiert diesen Zeitpunkt, decidedByUserId bleibt NULL, weil es sich
    // um eine Systementscheidung und keine Owner-Handlung handelt.
    decidedAt: input.decidedAt ?? null,
    decidedByUserId: null,
  };
  db.prepare(
    `INSERT INTO work_orders
      (id, tenantId, createdByUserId, title, desiredResult, context, deadlineText, status, statusNote, createdAt, updatedAt, submittedAt, decidedAt, decidedByUserId)
     VALUES
      (@id, @tenantId, @createdByUserId, @title, @desiredResult, @context, @deadlineText, @status, @statusNote, @createdAt, @updatedAt, @submittedAt, @decidedAt, @decidedByUserId)`,
  ).run(record);
  return getWorkOrderById(db, record.id);
}

function getWorkOrderById(db, id) {
  return db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id) || null;
}

// Nur für die Kundenfunktion gedacht: Aufrufer MUSS zusätzlich prüfen, dass
// tenantId zur Session passt (siehe work-order-service.js) – diese Funktion
// selbst filtert bewusst nicht nach Tenant, damit sie auch für die
// Owner-Ansicht (mandantenübergreifend, aber pro Datensatz mit tenantId im
// Ergebnis) wiederverwendbar bleibt.
function listWorkOrdersByTenantId(db, tenantId) {
  return db.prepare("SELECT * FROM work_orders WHERE tenantId = ? ORDER BY createdAt DESC").all(tenantId);
}

function listAllWorkOrders(db) {
  return db.prepare("SELECT * FROM work_orders ORDER BY createdAt DESC").all();
}

// Kundenseitige erneute Einreichung (NEEDS_CLARIFICATION -> SUBMITTED,
// Auftrag Abschnitt C/E). tenantId UND der erwartete Ausgangsstatus sind
// Teil der WHERE-Klausel; info.changes !== 1 bedeutet fremder Tenant,
// unbekannte ID oder ein zwischenzeitlich bereits geänderter Status
// (Race Condition) und wird vom Aufrufer als Konflikt/404 behandelt. Der
// tatsächliche Zielstatus (READY_FOR_PROCESSING oder erneut
// NEEDS_CLARIFICATION) kommt von der automatischen Vollständigkeitsregel
// in work-order-service.js und wird hier als input.status durchgereicht –
// diese Funktion selbst trifft keine fachliche Entscheidung.
function resubmitWorkOrder(db, id, tenantId, expectedStatus, input = {}) {
  const ts = input.now || nowIso();
  const info = db
    .prepare(
      `UPDATE work_orders
       SET title = ?, desiredResult = ?, context = ?, deadlineText = ?, status = ?, statusNote = ?, submittedAt = ?, decidedAt = ?, decidedByUserId = NULL, updatedAt = ?
       WHERE id = ? AND tenantId = ? AND status = ?`,
    )
    .run(
      input.title,
      input.desiredResult,
      input.context ?? null,
      input.deadlineText ?? null,
      input.status,
      input.statusNote ?? null,
      ts,
      ts,
      ts,
      id,
      tenantId,
      expectedStatus,
    );
  if (info.changes !== 1) return null;
  return getWorkOrderById(db, id);
}

// Allgemeiner Statusübergang für automatische Systementscheidungen
// (SUBMITTED -> READY_FOR_PROCESSING|NEEDS_CLARIFICATION, kein Akteur) UND
// für die beiden verbliebenen Owner-Ausnahmeaktionen (-> ESCALATED,
// -> CANCELLED). fromStatuses ist eine Liste erlaubter Ausgangsstatus;
// info.changes !== 1 bedeutet unbekannte ID oder einen bereits
// abweichenden/terminalen Status (Race Condition), vom Aufrufer als
// Konflikt/404 behandelt. tenantId ist optional und wird nur von
// Kundenaktionen (Kunden-Cancel) zusätzlich erzwungen.
function transitionWorkOrder(db, id, options = {}) {
  const { tenantId = null, fromStatuses, toStatus, statusNote = null, decidedByUserId = null, now } = options;
  const ts = now || nowIso();
  const statuses = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => "?").join(", ");
  const params = [toStatus, statusNote, ts, decidedByUserId, ts, id];
  let sql = `UPDATE work_orders
       SET status = ?, statusNote = ?, decidedAt = ?, decidedByUserId = ?, updatedAt = ?
       WHERE id = ? AND status IN (${placeholders})`;
  params.push(...statuses);
  if (tenantId) {
    sql += " AND tenantId = ?";
    params.push(tenantId);
  }
  const info = db.prepare(sql).run(...params);
  if (info.changes !== 1) return null;
  return getWorkOrderById(db, id);
}

// ---------------------------------------------------------------------------
// Verstoß-/Eskalationsprotokoll (V7.2 Phase B – Schutz- und
// Einwilligungsgrundlage, Migration 9, siehe SAFETY_ENFORCEMENT_MODEL.md).
// policy_violations ist append-only (SQLite-Trigger, gleiches Muster wie
// auth_audit_events) – dieses Modul exportiert bewusst keine Update-/
// Delete-Funktion dafür. Speichert NIEMALS den vollständigen Auftragstext,
// nur reasonCode (Kategorie)/severity/actionTaken.
// ---------------------------------------------------------------------------

function recordPolicyViolation(db, input = {}) {
  const record = {
    id: input.id || crypto.randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    workOrderId: input.workOrderId ?? null,
    reasonCode: input.reasonCode,
    severity: input.severity,
    actionTaken: input.actionTaken,
    createdAt: input.now || nowIso(),
  };
  db.prepare(
    `INSERT INTO policy_violations
      (id, tenantId, userId, workOrderId, reasonCode, severity, actionTaken, createdAt)
     VALUES
      (@id, @tenantId, @userId, @workOrderId, @reasonCode, @severity, @actionTaken, @createdAt)`,
  ).run(record);
  return record;
}

function listPolicyViolationsForTenant(db, tenantId) {
  return db.prepare("SELECT * FROM policy_violations WHERE tenantId = ? ORDER BY createdAt DESC").all(tenantId);
}

function listPolicyViolationsForUser(db, userId) {
  return db.prepare("SELECT * FROM policy_violations WHERE userId = ? ORDER BY createdAt DESC").all(userId);
}

// Reine Zählung – die "technische Grundlage für eskalierende Maßnahmen"
// (Auftrag Abschnitt D). Löst in diesem Schritt selbst KEINE zusätzliche
// automatische Aktion aus (siehe SAFETY_ENFORCEMENT_MODEL.md, Abschnitt 5).
function countPolicyViolationsForUser(db, userId) {
  const row = db.prepare("SELECT COUNT(*) AS total FROM policy_violations WHERE userId = ?").get(userId);
  return row ? row.total : 0;
}

function countPolicyViolationsForTenant(db, tenantId) {
  const row = db.prepare("SELECT COUNT(*) AS total FROM policy_violations WHERE tenantId = ?").get(tenantId);
  return row ? row.total : 0;
}

// ---------------------------------------------------------------------------
// Work-Order-Läufe (V7.2 Phase C Schritt 1, Auftrag Abschnitt F/I). Jede
// statusverändernde Funktion prüft den aktuellen Ausgangsstatus als Teil der
// WHERE-Klausel (identisches atomares Compare-and-Set-Muster wie
// transitionWorkOrder oben) – eine zweite, datenbanknahe Verteidigungslinie
// zusätzlich zur fachlichen Prüfung in work-order-execution-service.js.
//
// Idempotenz-/Parallelitätsschutz (Auftrag Abschnitt I): getActive... und
// createWorkOrderRun werden vom Aufrufer IMMER gemeinsam innerhalb
// derselben withAuthTransaction()-Transaktion verwendet, damit "prüfen, ob
// bereits ein aktiver Lauf existiert" und "neuen Lauf anlegen" atomar
// bleiben (better-sqlite3-Transaktionen sind synchron, kein Interleaving
// möglich, solange kein await dazwischenliegt).
// ---------------------------------------------------------------------------

const ACTIVE_WORK_ORDER_RUN_STATUSES = Object.freeze(["PREPARED", "IN_PROGRESS"]);

function getActiveWorkOrderRunForWorkOrder(db, workOrderId) {
  const placeholders = ACTIVE_WORK_ORDER_RUN_STATUSES.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT * FROM work_order_runs WHERE workOrderId = ? AND status IN (${placeholders}) ORDER BY runNumber DESC LIMIT 1`,
      )
      .get(workOrderId, ...ACTIVE_WORK_ORDER_RUN_STATUSES) || null
  );
}

function nextWorkOrderRunNumber(db, workOrderId) {
  const row = db
    .prepare("SELECT COALESCE(MAX(runNumber), 0) AS maxRunNumber FROM work_order_runs WHERE workOrderId = ?")
    .get(workOrderId);
  return (row ? row.maxRunNumber : 0) + 1;
}

function createWorkOrderRun(db, input = {}) {
  const now = input.now || nowIso();
  const record = {
    id: input.id || crypto.randomUUID(),
    workOrderId: input.workOrderId,
    tenantId: input.tenantId,
    runNumber: nextWorkOrderRunNumber(db, input.workOrderId),
    status: input.status || "PREPARED",
    orchestratorVersion: input.orchestratorVersion,
    failureCode: input.failureCode ?? null,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    failedAt: input.failedAt ?? null,
    createdAt: now,
  };
  db.prepare(
    `INSERT INTO work_order_runs
      (id, workOrderId, tenantId, runNumber, status, orchestratorVersion, failureCode, startedAt, completedAt, failedAt, createdAt)
     VALUES
      (@id, @workOrderId, @tenantId, @runNumber, @status, @orchestratorVersion, @failureCode, @startedAt, @completedAt, @failedAt, @createdAt)`,
  ).run(record);
  return getWorkOrderRunById(db, record.id);
}

function getWorkOrderRunById(db, id) {
  return db.prepare("SELECT * FROM work_order_runs WHERE id = ?").get(id) || null;
}

function listWorkOrderRunsForWorkOrder(db, workOrderId) {
  return db.prepare("SELECT * FROM work_order_runs WHERE workOrderId = ? ORDER BY runNumber DESC").all(workOrderId);
}

// Allgemeiner Statusübergang für einen Lauf (PREPARED -> IN_PROGRESS,
// IN_PROGRESS -> NEEDS_CLARIFICATION|COMPLETED|FAILED|CANCELLED).
// fromStatuses ist eine Liste erlaubter Ausgangsstatus; info.changes !== 1
// bedeutet unbekannte ID oder einen bereits abweichenden Status (Race
// Condition), vom Aufrufer als kontrollierter Fehlerzustand behandelt.
function transitionWorkOrderRun(db, id, options = {}) {
  const { fromStatuses, toStatus, startedAt, completedAt, failedAt, failureCode, now } = options;
  const statuses = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => "?").join(", ");
  const existing = getWorkOrderRunById(db, id);
  const params = [
    toStatus,
    startedAt !== undefined ? startedAt : existing ? existing.startedAt : null,
    completedAt !== undefined ? completedAt : existing ? existing.completedAt : null,
    failedAt !== undefined ? failedAt : existing ? existing.failedAt : null,
    failureCode !== undefined ? failureCode : existing ? existing.failureCode : null,
    id,
  ];
  const sql = `UPDATE work_order_runs
       SET status = ?, startedAt = ?, completedAt = ?, failedAt = ?, failureCode = ?
       WHERE id = ? AND status IN (${placeholders})`;
  const info = db.prepare(sql).run(...params, ...statuses);
  if (info.changes !== 1) return null;
  return getWorkOrderRunById(db, id);
}

function createWorkOrderRunAgent(db, input = {}) {
  const record = {
    id: input.id || crypto.randomUUID(),
    runId: input.runId,
    agentKey: input.agentKey,
    agentRole: input.agentRole,
    sequenceNumber: input.sequenceNumber,
    selectionReason: input.selectionReason,
    status: input.status || "PLANNED",
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
  };
  db.prepare(
    `INSERT INTO work_order_run_agents
      (id, runId, agentKey, agentRole, sequenceNumber, selectionReason, status, startedAt, completedAt)
     VALUES
      (@id, @runId, @agentKey, @agentRole, @sequenceNumber, @selectionReason, @status, @startedAt, @completedAt)`,
  ).run(record);
  return record;
}

function listWorkOrderRunAgents(db, runId) {
  return db.prepare("SELECT * FROM work_order_run_agents WHERE runId = ? ORDER BY sequenceNumber ASC").all(runId);
}

// ---------------------------------------------------------------------------
// Work-Order-Ergebnisse (V7.2 Phase C Schritt 1, Auftrag Abschnitt F/K).
// Append-only/unveränderlich (SQLite-Trigger, siehe auth-db-migrations.js):
// dieses Modul exportiert bewusst keine Update-/Delete-Funktion dafür. Eine
// spätere Revision erzeugt IMMER eine neue Version, niemals ein Überschreiben.
// ---------------------------------------------------------------------------

function nextWorkOrderResultVersionNumber(db, workOrderId) {
  const row = db
    .prepare("SELECT COALESCE(MAX(versionNumber), 0) AS maxVersion FROM work_order_results WHERE workOrderId = ?")
    .get(workOrderId);
  return (row ? row.maxVersion : 0) + 1;
}

function createWorkOrderResult(db, input = {}) {
  const now = input.now || nowIso();
  const record = {
    id: input.id || crypto.randomUUID(),
    workOrderId: input.workOrderId,
    runId: input.runId,
    tenantId: input.tenantId,
    versionNumber: nextWorkOrderResultVersionNumber(db, input.workOrderId),
    resultTitle: input.resultTitle,
    resultSummary: input.resultSummary,
    resultBody: input.resultBody,
    qualityStatus: input.qualityStatus,
    qualityNote: input.qualityNote ?? null,
    openPoints: input.openPoints ?? null,
    createdAt: now,
  };
  db.prepare(
    `INSERT INTO work_order_results
      (id, workOrderId, runId, tenantId, versionNumber, resultTitle, resultSummary, resultBody, qualityStatus, qualityNote, openPoints, createdAt)
     VALUES
      (@id, @workOrderId, @runId, @tenantId, @versionNumber, @resultTitle, @resultSummary, @resultBody, @qualityStatus, @qualityNote, @openPoints, @createdAt)`,
  ).run(record);
  return getWorkOrderResultById(db, record.id);
}

function getWorkOrderResultById(db, id) {
  return db.prepare("SELECT * FROM work_order_results WHERE id = ?").get(id) || null;
}

function getWorkOrderResultByRunId(db, runId) {
  return db.prepare("SELECT * FROM work_order_results WHERE runId = ?").get(runId) || null;
}

function getLatestWorkOrderResultForWorkOrder(db, workOrderId) {
  return (
    db
      .prepare("SELECT * FROM work_order_results WHERE workOrderId = ? ORDER BY versionNumber DESC LIMIT 1")
      .get(workOrderId) || null
  );
}

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt H) – Versionsliste für die
// Kunden-/Owner-Versionsansicht, absteigend nach Version (neueste zuerst,
// gleiche Reihenfolge wie listWorkOrderRunsForWorkOrder).
function listWorkOrderResultsForWorkOrder(db, workOrderId) {
  return db
    .prepare("SELECT * FROM work_order_results WHERE workOrderId = ? ORDER BY versionNumber DESC")
    .all(workOrderId);
}

// ---------------------------------------------------------------------------
// Änderungswünsche (V7.2 Phase C Schritt 2, Auftrag Abschnitt C/D/J). Jede
// statusverändernde Funktion prüft den aktuellen Ausgangsstatus als Teil der
// WHERE-Klausel (identisches atomares Compare-and-Set-Muster wie
// transitionWorkOrder/transitionWorkOrderRun oben) – eine zweite,
// datenbanknahe Verteidigungslinie zusätzlich zur fachlichen Prüfung in
// work-order-change-service.js. Der partielle UNIQUE-Index aus Migration 11
// (höchstens ein aktiver Änderungswunsch je Auftrag) ist eine dritte,
// datenbankinterne Verteidigungslinie gegen einen zweiten parallelen
// Revisionslauf.
// ---------------------------------------------------------------------------

const ACTIVE_WORK_ORDER_CHANGE_REQUEST_STATUSES = Object.freeze(["SUBMITTED", "IN_PROGRESS"]);

function createWorkOrderChangeRequest(db, input = {}) {
  const now = input.now || nowIso();
  const record = {
    id: input.id || crypto.randomUUID(),
    workOrderId: input.workOrderId,
    tenantId: input.tenantId,
    requestedByUserId: input.requestedByUserId,
    basedOnResultId: input.basedOnResultId,
    requestText: input.requestText,
    preserveText: input.preserveText ?? null,
    importantNote: input.importantNote ?? null,
    status: input.status || "SUBMITTED",
    runId: input.runId ?? null,
    resultingResultId: input.resultingResultId ?? null,
    createdAt: now,
    acceptedAt: input.acceptedAt ?? null,
    completedAt: input.completedAt ?? null,
    cancelledAt: input.cancelledAt ?? null,
  };
  db.prepare(
    `INSERT INTO work_order_change_requests
      (id, workOrderId, tenantId, requestedByUserId, basedOnResultId, requestText, preserveText, importantNote, status, runId, resultingResultId, createdAt, acceptedAt, completedAt, cancelledAt)
     VALUES
      (@id, @workOrderId, @tenantId, @requestedByUserId, @basedOnResultId, @requestText, @preserveText, @importantNote, @status, @runId, @resultingResultId, @createdAt, @acceptedAt, @completedAt, @cancelledAt)`,
  ).run(record);
  return getWorkOrderChangeRequestById(db, record.id);
}

function getWorkOrderChangeRequestById(db, id) {
  return db.prepare("SELECT * FROM work_order_change_requests WHERE id = ?").get(id) || null;
}

function getActiveWorkOrderChangeRequestForWorkOrder(db, workOrderId) {
  const placeholders = ACTIVE_WORK_ORDER_CHANGE_REQUEST_STATUSES.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT * FROM work_order_change_requests WHERE workOrderId = ? AND status IN (${placeholders}) ORDER BY createdAt DESC LIMIT 1`,
      )
      .get(workOrderId, ...ACTIVE_WORK_ORDER_CHANGE_REQUEST_STATUSES) || null
  );
}

function listWorkOrderChangeRequestsForWorkOrder(db, workOrderId) {
  return db
    .prepare("SELECT * FROM work_order_change_requests WHERE workOrderId = ? ORDER BY createdAt DESC")
    .all(workOrderId);
}

// Allgemeiner Statusübergang für einen Änderungswunsch (SUBMITTED ->
// IN_PROGRESS -> COMPLETED|CANCELLED). fromStatuses ist eine Liste erlaubter
// Ausgangsstatus; info.changes !== 1 bedeutet unbekannte ID oder einen
// bereits abweichenden Status (Race Condition), vom Aufrufer als
// kontrollierter Fehlerzustand behandelt.
function transitionWorkOrderChangeRequest(db, id, options = {}) {
  const { fromStatuses, toStatus, runId, resultingResultId, acceptedAt, completedAt, cancelledAt, now } = options;
  const statuses = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => "?").join(", ");
  const existing = getWorkOrderChangeRequestById(db, id);
  const params = [
    toStatus,
    runId !== undefined ? runId : existing ? existing.runId : null,
    resultingResultId !== undefined ? resultingResultId : existing ? existing.resultingResultId : null,
    acceptedAt !== undefined ? acceptedAt : existing ? existing.acceptedAt : null,
    completedAt !== undefined ? completedAt : existing ? existing.completedAt : null,
    cancelledAt !== undefined ? cancelledAt : existing ? existing.cancelledAt : null,
    id,
  ];
  void now;
  const sql = `UPDATE work_order_change_requests
       SET status = ?, runId = ?, resultingResultId = ?, acceptedAt = ?, completedAt = ?, cancelledAt = ?
       WHERE id = ? AND status IN (${placeholders})`;
  const info = db.prepare(sql).run(...params, ...statuses);
  if (info.changes !== 1) return null;
  return getWorkOrderChangeRequestById(db, id);
}

// ---------------------------------------------------------------------------
// Kundenfreigaben (V7.2 Phase C Schritt 2, Auftrag Abschnitt G/J).
// Append-only/unveränderlich (SQLite-Trigger, siehe auth-db-migrations.js):
// dieses Modul exportiert bewusst keine Update-/Delete-Funktion dafür. Der
// UNIQUE-Index auf resultId (Migration 11) verhindert eine doppelte
// Freigabe derselben Ergebnisversion bereits auf Datenbankebene.
// ---------------------------------------------------------------------------

function createWorkOrderCustomerApproval(db, input = {}) {
  const record = {
    id: input.id || crypto.randomUUID(),
    workOrderId: input.workOrderId,
    tenantId: input.tenantId,
    resultId: input.resultId,
    approvedByUserId: input.approvedByUserId,
    approvalVersion: input.approvalVersion,
    approvalNote: input.approvalNote ?? null,
    approvedAt: input.now || nowIso(),
  };
  db.prepare(
    `INSERT INTO work_order_customer_approvals
      (id, workOrderId, tenantId, resultId, approvedByUserId, approvalVersion, approvalNote, approvedAt)
     VALUES
      (@id, @workOrderId, @tenantId, @resultId, @approvedByUserId, @approvalVersion, @approvalNote, @approvedAt)`,
  ).run(record);
  return record;
}

function getWorkOrderCustomerApprovalByResultId(db, resultId) {
  return db.prepare("SELECT * FROM work_order_customer_approvals WHERE resultId = ?").get(resultId) || null;
}

function listWorkOrderCustomerApprovalsForWorkOrder(db, workOrderId) {
  return db
    .prepare("SELECT * FROM work_order_customer_approvals WHERE workOrderId = ? ORDER BY approvedAt DESC")
    .all(workOrderId);
}

// ---------------------------------------------------------------------------
// V7.3 Persistenznachtrag (Auftrag Abschnitt C) – Jamal-Arbeitsmodus
// (Migration 12, siehe auth-db-migrations.js). Ausschließlich
// jamal-work-mode-store.js ruft diese Funktionen auf; jamal-work-mode.js
// selbst bleibt weiterhin ohne jeden Datenbankbezug. "Upsert" bildet die
// fachliche Lebenszyklus-Aktualisierung eines EINZELNEN Arbeitswunsches ab
// (gleicher Datensatz von NOT_STARTED bis DONE/STOPPED); ein neuer
// Arbeitswunsch (startNewItem) erhält immer eine neue id und damit eine
// neue Zeile – bestehende Zeilen werden dabei nie verändert oder gelöscht.
// Ergebnisversionen (jamal_work_results) sind zusätzlich durch die
// Trigger aus Migration 12 auf Datenbankebene vor UPDATE/DELETE geschützt;
// dieses Modul exportiert dafür bewusst keine Update-/Delete-Funktion.
// ---------------------------------------------------------------------------

function upsertJamalWorkItem(db, input = {}) {
  const record = {
    id: input.id,
    projectId: input.projectId ?? null,
    projectDisplayName: input.projectDisplayName ?? null,
    projectSource: input.projectSource ?? null,
    desiredOutcome: input.desiredOutcome ?? "",
    importantNotes: input.importantNotes ?? "",
    preferredTiming: input.preferredTiming ?? "",
    status: input.status,
    clarifyingQuestionJson: input.clarifyingQuestionJson ?? null,
    selectedAgentsJson: input.selectedAgentsJson ?? null,
    workPlanJson: input.workPlanJson ?? null,
    safetyDecisionJson: input.safetyDecisionJson ?? null,
    qualityStatus: input.qualityStatus ?? null,
    qualityNote: input.qualityNote ?? null,
    decision: input.decision ?? null,
    decidedAt: input.decidedAt ?? null,
    doneAt: input.doneAt ?? null,
    stoppedAt: input.stoppedAt ?? null,
    postponedAt: input.postponedAt ?? null,
    stopReason: input.stopReason ?? null,
    pendingChangeText: input.pendingChangeText ?? null,
    escalationJson: input.escalationJson ?? null,
    lastUsedProjectId: input.lastUsedProjectId ?? null,
    lastUsedProjectDisplayName: input.lastUsedProjectDisplayName ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    completedAt: input.completedAt ?? null,
  };
  db.prepare(
    `INSERT INTO jamal_work_items
      (id, projectId, projectDisplayName, projectSource, desiredOutcome, importantNotes, preferredTiming, status,
       clarifyingQuestionJson, selectedAgentsJson, workPlanJson, safetyDecisionJson, qualityStatus, qualityNote,
       decision, decidedAt, doneAt, stoppedAt, postponedAt, stopReason, pendingChangeText, escalationJson,
       lastUsedProjectId, lastUsedProjectDisplayName, createdAt, updatedAt, completedAt)
     VALUES
      (@id, @projectId, @projectDisplayName, @projectSource, @desiredOutcome, @importantNotes, @preferredTiming, @status,
       @clarifyingQuestionJson, @selectedAgentsJson, @workPlanJson, @safetyDecisionJson, @qualityStatus, @qualityNote,
       @decision, @decidedAt, @doneAt, @stoppedAt, @postponedAt, @stopReason, @pendingChangeText, @escalationJson,
       @lastUsedProjectId, @lastUsedProjectDisplayName, @createdAt, @updatedAt, @completedAt)
     ON CONFLICT(id) DO UPDATE SET
       projectId = excluded.projectId,
       projectDisplayName = excluded.projectDisplayName,
       projectSource = excluded.projectSource,
       desiredOutcome = excluded.desiredOutcome,
       importantNotes = excluded.importantNotes,
       preferredTiming = excluded.preferredTiming,
       status = excluded.status,
       clarifyingQuestionJson = excluded.clarifyingQuestionJson,
       selectedAgentsJson = excluded.selectedAgentsJson,
       workPlanJson = excluded.workPlanJson,
       safetyDecisionJson = excluded.safetyDecisionJson,
       qualityStatus = excluded.qualityStatus,
       qualityNote = excluded.qualityNote,
       decision = excluded.decision,
       decidedAt = excluded.decidedAt,
       doneAt = excluded.doneAt,
       stoppedAt = excluded.stoppedAt,
       postponedAt = excluded.postponedAt,
       stopReason = excluded.stopReason,
       pendingChangeText = excluded.pendingChangeText,
       escalationJson = excluded.escalationJson,
       lastUsedProjectId = excluded.lastUsedProjectId,
       lastUsedProjectDisplayName = excluded.lastUsedProjectDisplayName,
       updatedAt = excluded.updatedAt,
       completedAt = excluded.completedAt`,
  ).run(record);
  return getJamalWorkItemById(db, record.id);
}

function getJamalWorkItemById(db, id) {
  return db.prepare("SELECT * FROM jamal_work_items WHERE id = ?").get(id) || null;
}

// "Aktuell" = die zuletzt angelegte Zeile (siehe Migration-12-Kommentar in
// auth-db-migrations.js) – rowid als zweites Sortierkriterium schützt
// zusätzlich gegen den seltenen Fall zweier Zeilen mit identischem
// createdAt (gleiche Millisekunde).
function getLatestJamalWorkItem(db) {
  return db.prepare("SELECT * FROM jamal_work_items ORDER BY createdAt DESC, rowid DESC LIMIT 1").get() || null;
}

function appendJamalWorkResult(db, input = {}) {
  const record = {
    id: input.id || crypto.randomUUID(),
    workItemId: input.workItemId,
    versionNumber: input.versionNumber,
    resultTitle: input.resultTitle,
    resultSummary: input.resultSummary,
    resultBody: input.resultBody,
    qualityStatus: input.qualityStatus,
    qualityNote: input.qualityNote ?? null,
    openPointsJson: input.openPointsJson ?? null,
    agentsInvolvedJson: input.agentsInvolvedJson,
    triggerType: input.triggerType,
    changeRequestText: input.changeRequestText ?? null,
    createdAt: input.createdAt,
  };
  db.prepare(
    `INSERT INTO jamal_work_results
      (id, workItemId, versionNumber, resultTitle, resultSummary, resultBody, qualityStatus, qualityNote,
       openPointsJson, agentsInvolvedJson, triggerType, changeRequestText, createdAt)
     VALUES
      (@id, @workItemId, @versionNumber, @resultTitle, @resultSummary, @resultBody, @qualityStatus, @qualityNote,
       @openPointsJson, @agentsInvolvedJson, @triggerType, @changeRequestText, @createdAt)`,
  ).run(record);
  return getJamalWorkResultById(db, record.id);
}

function getJamalWorkResultById(db, id) {
  return db.prepare("SELECT * FROM jamal_work_results WHERE id = ?").get(id) || null;
}

function listJamalWorkResultsForWorkItem(db, workItemId) {
  return db.prepare("SELECT * FROM jamal_work_results WHERE workItemId = ? ORDER BY versionNumber ASC").all(workItemId);
}

// ---------------------------------------------------------------------------
// V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
// (Migration 13, siehe auth-db-migrations.js). Ausschließlich
// jamal-canva-production-service.js ruft diese Funktionen auf. "Upsert"
// aktualisiert genau EINE Briefingrevision (dieselbe id, z. B. während sie
// noch DRAFT/READY_FOR_APPROVAL/BLOCKED ist); eine neue Revision
// (requestRevision) erhält immer eine neue id und damit eine neue Zeile –
// bestehende Revisionszeilen werden dabei nie überschrieben (Auftrag
// Abschnitt K: "alter Designstand bleibt nachvollziehbar"). Keine
// Zugangstokens, keine Provider-Secrets: diese Tabelle speichert
// ausschließlich bereits von jamal-canva-production-service.js sicher
// geprüfte Felder.
// ---------------------------------------------------------------------------

function upsertJamalCanvaProduction(db, input = {}) {
  const record = {
    id: input.id,
    workItemId: input.workItemId,
    revisionNumber: input.revisionNumber,
    status: input.status,
    suitabilityDecision: input.suitabilityDecision ?? null,
    suitabilityJson: input.suitabilityJson ?? null,
    briefingJson: input.briefingJson ?? null,
    rightsStatus: input.rightsStatus ?? null,
    rightsJson: input.rightsJson ?? null,
    reviewMode: input.reviewMode || "OWNER_REVIEW",
    changeRequestText: input.changeRequestText ?? null,
    approvedAt: input.approvedAt ?? null,
    approvedByUserId: input.approvedByUserId ?? null,
    handoffStartedAt: input.handoffStartedAt ?? null,
    canvaJobId: input.canvaJobId ?? null,
    canvaDesignId: input.canvaDesignId ?? null,
    designTitle: input.designTitle ?? null,
    editLink: input.editLink ?? null,
    viewLink: input.viewLink ?? null,
    providerStatus: input.providerStatus ?? null,
    errorCode: input.errorCode ?? null,
    resultReceivedAt: input.resultReceivedAt ?? null,
    qualityStatus: input.qualityStatus ?? null,
    qualityNotesJson: input.qualityNotesJson ?? null,
    cancelledAt: input.cancelledAt ?? null,
    cancelReason: input.cancelReason ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `INSERT INTO jamal_canva_productions
      (id, workItemId, revisionNumber, status, suitabilityDecision, suitabilityJson, briefingJson, rightsStatus,
       rightsJson, reviewMode, changeRequestText, approvedAt, approvedByUserId, handoffStartedAt, canvaJobId,
       canvaDesignId, designTitle, editLink, viewLink, providerStatus, errorCode, resultReceivedAt, qualityStatus,
       qualityNotesJson, cancelledAt, cancelReason, createdAt, updatedAt)
     VALUES
      (@id, @workItemId, @revisionNumber, @status, @suitabilityDecision, @suitabilityJson, @briefingJson, @rightsStatus,
       @rightsJson, @reviewMode, @changeRequestText, @approvedAt, @approvedByUserId, @handoffStartedAt, @canvaJobId,
       @canvaDesignId, @designTitle, @editLink, @viewLink, @providerStatus, @errorCode, @resultReceivedAt, @qualityStatus,
       @qualityNotesJson, @cancelledAt, @cancelReason, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       suitabilityDecision = excluded.suitabilityDecision,
       suitabilityJson = excluded.suitabilityJson,
       briefingJson = excluded.briefingJson,
       rightsStatus = excluded.rightsStatus,
       rightsJson = excluded.rightsJson,
       reviewMode = excluded.reviewMode,
       changeRequestText = excluded.changeRequestText,
       approvedAt = excluded.approvedAt,
       approvedByUserId = excluded.approvedByUserId,
       handoffStartedAt = excluded.handoffStartedAt,
       canvaJobId = excluded.canvaJobId,
       canvaDesignId = excluded.canvaDesignId,
       designTitle = excluded.designTitle,
       editLink = excluded.editLink,
       viewLink = excluded.viewLink,
       providerStatus = excluded.providerStatus,
       errorCode = excluded.errorCode,
       resultReceivedAt = excluded.resultReceivedAt,
       qualityStatus = excluded.qualityStatus,
       qualityNotesJson = excluded.qualityNotesJson,
       cancelledAt = excluded.cancelledAt,
       cancelReason = excluded.cancelReason,
       updatedAt = excluded.updatedAt`,
  ).run(record);
  return getJamalCanvaProductionById(db, record.id);
}

function getJamalCanvaProductionById(db, id) {
  return db.prepare("SELECT * FROM jamal_canva_productions WHERE id = ?").get(id) || null;
}

// "Aktuell" = die zuletzt angelegte Revision für diesen Arbeitswunsch
// (höchste revisionNumber; rowid als zweites Sortierkriterium schützt
// gegen den seltenen Fall identischer createdAt-Werte).
function getLatestJamalCanvaProductionForWorkItem(db, workItemId) {
  return (
    db
      .prepare("SELECT * FROM jamal_canva_productions WHERE workItemId = ? ORDER BY revisionNumber DESC, rowid DESC LIMIT 1")
      .get(workItemId) || null
  );
}

function listJamalCanvaProductionsForWorkItem(db, workItemId) {
  return db
    .prepare("SELECT * FROM jamal_canva_productions WHERE workItemId = ? ORDER BY revisionNumber ASC")
    .all(workItemId);
}

// ---------------------------------------------------------------------------
// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Migration 14, siehe
// auth-db-migrations.js). Ausschließlich agent-hr-coaching-service.js/
// technology-radar-service.js rufen diese Funktionen auf. Kein Aufruf
// verändert eine tatsächliche Autonomiestufe – dafür gibt es in diesen
// Tabellen ohnehin kein Feld (siehe Migrationskommentar).
// ---------------------------------------------------------------------------

// Erzeugt höchstens einen Lauf je Kalendertag (runDate UNIQUE, siehe
// Migration 14). Ein zweiter Aufruf für denselben Tag löst den
// SQLITE_CONSTRAINT-Fehler von better-sqlite3 aus; der Aufrufer
// (agent-hr-coaching-service.js#getOrCreateTodaysRun) fängt dies ab und
// lädt stattdessen den bereits bestehenden Lauf – kein stilles
// Überschreiben, kein zweiter aktiver Vorschlagssatz pro Tag.
function insertAgentHrDailyRun(db, input = {}) {
  const record = { id: input.id, runDate: input.runDate, createdAt: input.createdAt };
  db.prepare(`INSERT INTO agent_hr_daily_runs (id, runDate, createdAt) VALUES (@id, @runDate, @createdAt)`).run(record);
  return getAgentHrDailyRunById(db, record.id);
}

function getAgentHrDailyRunById(db, id) {
  return db.prepare("SELECT * FROM agent_hr_daily_runs WHERE id = ?").get(id) || null;
}

function getAgentHrDailyRunByDate(db, runDate) {
  return db.prepare("SELECT * FROM agent_hr_daily_runs WHERE runDate = ?").get(runDate) || null;
}

// Legt in EINER Transaktion genau 25 Vorschlagszeilen für einen Lauf an
// (UNIQUE(runId, agentId), siehe Migration 14, verhindert strukturell
// mehr als einen Vorschlag je Agent und Lauf). Wird ausschließlich beim
// erstmaligen Anlegen eines Laufs aufgerufen – niemals zum Aktualisieren
// bestehender Vorschläge (dafür siehe updateAgentHrDailyProposalReview).
function insertAgentHrDailyProposalsBatch(db, proposals) {
  const insert = db.prepare(`
    INSERT INTO agent_hr_daily_proposals
      (id, runId, agentId, runDate, improvementSuggestion, trainingGoal, concreteExercise, qualityCriterion,
       possibleAutonomyExpansion, riskBoundary, requiredJamalDecision, hrRecommendation, reasoning, status,
       jamalNote, createdAt, reviewedAt, observation, businessMeaning, desiredOutcome, priorityReason,
       benefitArea, priorityBucket, nextReviewDate, pdcaStage, pdcaDecision, pdcaStageChangedAt, reliabilitySignal)
     VALUES
      (@id, @runId, @agentId, @runDate, @improvementSuggestion, @trainingGoal, @concreteExercise, @qualityCriterion,
       @possibleAutonomyExpansion, @riskBoundary, @requiredJamalDecision, @hrRecommendation, @reasoning, @status,
       @jamalNote, @createdAt, @reviewedAt, @observation, @businessMeaning, @desiredOutcome, @priorityReason,
       @benefitArea, @priorityBucket, @nextReviewDate, @pdcaStage, @pdcaDecision, @pdcaStageChangedAt, @reliabilitySignal)
  `);
  const insertAll = db.transaction((rows) => {
    rows.forEach((row) =>
      insert.run({
        jamalNote: null,
        reviewedAt: null,
        pdcaStage: "PLAN",
        pdcaDecision: null,
        pdcaStageChangedAt: null,
        reliabilitySignal: "NONE",
        ...row,
      }),
    );
  });
  insertAll(proposals);
  return listAgentHrDailyProposalsForRun(db, proposals[0].runId);
}

function listAgentHrDailyProposalsForRun(db, runId) {
  return db.prepare("SELECT * FROM agent_hr_daily_proposals WHERE runId = ? ORDER BY agentId ASC").all(runId);
}

function getAgentHrDailyProposalById(db, id) {
  return db.prepare("SELECT * FROM agent_hr_daily_proposals WHERE id = ?").get(id) || null;
}

// Aktualisiert ausschließlich die Prüffelder einer bestehenden Vorschlags-
// zeile (status/jamalNote/reviewedAt) – die vom deterministischen Lauf
// erzeugten Inhaltsfelder (improvementSuggestion, trainingGoal, ...)
// bleiben unverändert (Auftrag Abschnitt D: "bestehende Vorschläge nicht
// überschreiben").
function updateAgentHrDailyProposalReview(db, input = {}) {
  db.prepare(
    `UPDATE agent_hr_daily_proposals SET status = @status, jamalNote = @jamalNote, reviewedAt = @reviewedAt WHERE id = @id`,
  ).run({
    id: input.id,
    status: input.status,
    jamalNote: input.jamalNote ?? null,
    reviewedAt: input.reviewedAt,
  });
  return getAgentHrDailyProposalById(db, input.id);
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt G) – aktualisiert
// ausschließlich pdcaStage/pdcaDecision/pdcaStageChangedAt einer bestehenden
// Vorschlagszeile. Kein Aufruf verändert status/hrRecommendation oder einen
// tatsächlichen Autonomierahmen (siehe agent-hr-coaching-service.js#
// advanceHrPdcaStage, das jeden Übergang vor diesem Aufruf validiert).
function updateAgentHrDailyProposalPdcaStage(db, input = {}) {
  db.prepare(
    `UPDATE agent_hr_daily_proposals SET pdcaStage = @pdcaStage, pdcaDecision = @pdcaDecision, pdcaStageChangedAt = @pdcaStageChangedAt WHERE id = @id`,
  ).run({
    id: input.id,
    pdcaStage: input.pdcaStage,
    pdcaDecision: input.pdcaDecision ?? null,
    pdcaStageChangedAt: input.pdcaStageChangedAt,
  });
  return getAgentHrDailyProposalById(db, input.id);
}

// Radar-Einträge: "Anlegen" und "Aktualisieren" teilen sich bewusst
// dieselbe Upsert-Funktion (Auftrag Abschnitt J: "Radar-Eintrag lokal
// anlegen/aktualisieren" ist EINE Fähigkeit) – der Aufrufer entscheidet
// anhand einer übergebenen id, ob eine bestehende Zeile aktualisiert oder
// eine neue angelegt wird (siehe technology-radar-service.js#upsertRadarItem).
function upsertTechnologyRadarItem(db, input = {}) {
  const record = {
    id: input.id,
    name: input.name,
    provider: input.provider,
    category: input.category,
    type: input.type,
    shortDescription: input.shortDescription,
    possibleAgentsJson: input.possibleAgentsJson,
    possibleBusinessBenefit: input.possibleBusinessBenefit,
    maturityLevel: input.maturityLevel,
    securityRisk: input.securityRisk,
    privacyRisk: input.privacyRisk,
    costClass: input.costClass,
    integrationEffort: input.integrationEffort,
    vendorLockInRisk: input.vendorLockInRisk,
    writeAccessRequired: input.writeAccessRequired ? 1 : 0,
    humanApprovalRequired: input.humanApprovalRequired ? 1 : 0,
    recommendation: input.recommendation,
    reasoning: input.reasoning,
    lastReviewedAt: input.lastReviewedAt ?? null,
    nextReviewAt: input.nextReviewAt ?? null,
    sourceNote: input.sourceNote ?? null,
    status: input.status,
    seedToolId: input.seedToolId ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    signalType: input.signalType || "OTHER",
    signalDescription: input.signalDescription,
    timeHorizon: input.timeHorizon || "NOW",
    uncertaintyLevel: input.uncertaintyLevel || "MEDIUM",
    scenarioConservative: input.scenarioConservative,
    scenarioLikely: input.scenarioLikely,
    scenarioDynamic: input.scenarioDynamic,
    strategicImpact: input.strategicImpact,
    todayPreparationStep: input.todayPreparationStep,
    benefitArea: input.benefitArea,
    priorityBucket: input.priorityBucket || "WATCH",
  };
  db.prepare(
    `INSERT INTO technology_radar_items
      (id, name, provider, category, type, shortDescription, possibleAgentsJson, possibleBusinessBenefit,
       maturityLevel, securityRisk, privacyRisk, costClass, integrationEffort, vendorLockInRisk,
       writeAccessRequired, humanApprovalRequired, recommendation, reasoning, lastReviewedAt, nextReviewAt,
       sourceNote, status, seedToolId, createdAt, updatedAt, signalType, signalDescription, timeHorizon,
       uncertaintyLevel, scenarioConservative, scenarioLikely, scenarioDynamic, strategicImpact,
       todayPreparationStep, benefitArea, priorityBucket)
     VALUES
      (@id, @name, @provider, @category, @type, @shortDescription, @possibleAgentsJson, @possibleBusinessBenefit,
       @maturityLevel, @securityRisk, @privacyRisk, @costClass, @integrationEffort, @vendorLockInRisk,
       @writeAccessRequired, @humanApprovalRequired, @recommendation, @reasoning, @lastReviewedAt, @nextReviewAt,
       @sourceNote, @status, @seedToolId, @createdAt, @updatedAt, @signalType, @signalDescription, @timeHorizon,
       @uncertaintyLevel, @scenarioConservative, @scenarioLikely, @scenarioDynamic, @strategicImpact,
       @todayPreparationStep, @benefitArea, @priorityBucket)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       provider = excluded.provider,
       category = excluded.category,
       type = excluded.type,
       shortDescription = excluded.shortDescription,
       possibleAgentsJson = excluded.possibleAgentsJson,
       possibleBusinessBenefit = excluded.possibleBusinessBenefit,
       maturityLevel = excluded.maturityLevel,
       securityRisk = excluded.securityRisk,
       privacyRisk = excluded.privacyRisk,
       costClass = excluded.costClass,
       integrationEffort = excluded.integrationEffort,
       vendorLockInRisk = excluded.vendorLockInRisk,
       writeAccessRequired = excluded.writeAccessRequired,
       humanApprovalRequired = excluded.humanApprovalRequired,
       recommendation = excluded.recommendation,
       reasoning = excluded.reasoning,
       lastReviewedAt = excluded.lastReviewedAt,
       nextReviewAt = excluded.nextReviewAt,
       sourceNote = excluded.sourceNote,
       status = excluded.status,
       updatedAt = excluded.updatedAt,
       signalType = excluded.signalType,
       signalDescription = excluded.signalDescription,
       timeHorizon = excluded.timeHorizon,
       uncertaintyLevel = excluded.uncertaintyLevel,
       scenarioConservative = excluded.scenarioConservative,
       scenarioLikely = excluded.scenarioLikely,
       scenarioDynamic = excluded.scenarioDynamic,
       strategicImpact = excluded.strategicImpact,
       todayPreparationStep = excluded.todayPreparationStep,
       benefitArea = excluded.benefitArea,
       priorityBucket = excluded.priorityBucket`,
  ).run(record);
  return getTechnologyRadarItemById(db, record.id);
}

function getTechnologyRadarItemById(db, id) {
  return db.prepare("SELECT * FROM technology_radar_items WHERE id = ?").get(id) || null;
}

function getTechnologyRadarItemBySeedToolId(db, seedToolId) {
  return db.prepare("SELECT * FROM technology_radar_items WHERE seedToolId = ?").get(seedToolId) || null;
}

function listTechnologyRadarItems(db) {
  return db.prepare("SELECT * FROM technology_radar_items ORDER BY name ASC").all();
}

function upsertAgentTechnologyFit(db, input = {}) {
  const record = {
    id: input.id,
    agentId: input.agentId,
    radarItemId: input.radarItemId,
    benefit: input.benefit,
    concreteUseCase: input.concreteUseCase,
    requiredPermissions: input.requiredPermissions,
    securityBoundary: input.securityBoundary,
    testPrerequisite: input.testPrerequisite,
    recommendation: input.recommendation,
    priority: input.priority,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `INSERT INTO agent_technology_fit
      (id, agentId, radarItemId, benefit, concreteUseCase, requiredPermissions, securityBoundary, testPrerequisite,
       recommendation, priority, status, createdAt, updatedAt)
     VALUES
      (@id, @agentId, @radarItemId, @benefit, @concreteUseCase, @requiredPermissions, @securityBoundary, @testPrerequisite,
       @recommendation, @priority, @status, @createdAt, @updatedAt)
     ON CONFLICT(agentId, radarItemId) DO UPDATE SET
       benefit = excluded.benefit,
       concreteUseCase = excluded.concreteUseCase,
       requiredPermissions = excluded.requiredPermissions,
       securityBoundary = excluded.securityBoundary,
       testPrerequisite = excluded.testPrerequisite,
       recommendation = excluded.recommendation,
       priority = excluded.priority,
       status = excluded.status,
       updatedAt = excluded.updatedAt`,
  ).run(record);
  return getAgentTechnologyFitById(db, record.id) || getAgentTechnologyFitByPair(db, record.agentId, record.radarItemId);
}

function getAgentTechnologyFitById(db, id) {
  return db.prepare("SELECT * FROM agent_technology_fit WHERE id = ?").get(id) || null;
}

function getAgentTechnologyFitByPair(db, agentId, radarItemId) {
  return db.prepare("SELECT * FROM agent_technology_fit WHERE agentId = ? AND radarItemId = ?").get(agentId, radarItemId) || null;
}

function listAgentTechnologyFit(db, filter = {}) {
  if (filter.agentId) {
    return db.prepare("SELECT * FROM agent_technology_fit WHERE agentId = ? ORDER BY priority DESC, createdAt ASC").all(filter.agentId);
  }
  if (filter.radarItemId) {
    return db
      .prepare("SELECT * FROM agent_technology_fit WHERE radarItemId = ? ORDER BY priority DESC, createdAt ASC")
      .all(filter.radarItemId);
  }
  return db.prepare("SELECT * FROM agent_technology_fit ORDER BY priority DESC, createdAt ASC").all();
}

// ---------------------------------------------------------------------------
// Unternehmensleitlinien V1.0 (Auftrag Abschnitt H) – Hochzuverlässigkeits-
// signale. Ausschließlich agent-reliability-signal-service.js ruft diese
// Funktionen auf. Kein Aufruf verändert eine Autonomiestufe oder löst eine
// Sanktion aus (dafür gibt es in dieser Tabelle ohnehin kein Feld).
// ---------------------------------------------------------------------------

function insertAgentReliabilitySignal(db, input = {}) {
  const record = {
    id: input.id,
    agentId: input.agentId,
    relatedHrProposalId: input.relatedHrProposalId ?? null,
    relatedRadarItemId: input.relatedRadarItemId ?? null,
    signalType: input.signalType,
    observation: input.observation,
    possibleImpact: input.possibleImpact,
    recommendedReview: input.recommendedReview,
    status: input.status,
    jamalDecisionNote: input.jamalDecisionNote ?? null,
    createdAt: input.createdAt,
    reviewedAt: input.reviewedAt ?? null,
  };
  db.prepare(
    `INSERT INTO agent_reliability_signals
      (id, agentId, relatedHrProposalId, relatedRadarItemId, signalType, observation, possibleImpact,
       recommendedReview, status, jamalDecisionNote, createdAt, reviewedAt)
     VALUES
      (@id, @agentId, @relatedHrProposalId, @relatedRadarItemId, @signalType, @observation, @possibleImpact,
       @recommendedReview, @status, @jamalDecisionNote, @createdAt, @reviewedAt)`,
  ).run(record);
  return getAgentReliabilitySignalById(db, record.id);
}

function getAgentReliabilitySignalById(db, id) {
  return db.prepare("SELECT * FROM agent_reliability_signals WHERE id = ?").get(id) || null;
}

function listAgentReliabilitySignals(db, filter = {}) {
  if (filter.agentId) {
    return db
      .prepare("SELECT * FROM agent_reliability_signals WHERE agentId = ? ORDER BY createdAt DESC")
      .all(filter.agentId);
  }
  if (filter.status) {
    return db
      .prepare("SELECT * FROM agent_reliability_signals WHERE status = ? ORDER BY createdAt DESC")
      .all(filter.status);
  }
  return db.prepare("SELECT * FROM agent_reliability_signals ORDER BY createdAt DESC").all();
}

function updateAgentReliabilitySignalReview(db, input = {}) {
  db.prepare(
    `UPDATE agent_reliability_signals SET status = @status, jamalDecisionNote = @jamalDecisionNote, reviewedAt = @reviewedAt WHERE id = @id`,
  ).run({
    id: input.id,
    status: input.status,
    jamalDecisionNote: input.jamalDecisionNote ?? null,
    reviewedAt: input.reviewedAt,
  });
  return getAgentReliabilitySignalById(db, input.id);
}

// ---------------------------------------------------------------------------
// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor (Migration 15). Reine Persistenzfunktionen, keine
// Fachlogik (lebt in external-identity-service.js/office-work-service.js/
// finance-handoff-service.js). Kein Passwort-, Token-, Recovery-Code- oder
// OAuth-Feld; kein Aufruf hier führt jemals eine echte Provideraktion aus.
// ---------------------------------------------------------------------------

function insertExternalIdentity(db, input = {}) {
  const record = {
    id: input.id,
    emailAddress: input.emailAddress,
    displayName: input.displayName,
    identityType: input.identityType,
    provider: input.provider,
    intendedPurpose: input.intendedPurpose,
    owner: input.owner,
    loginAllowed: input.loginAllowed ? 1 : 0,
    agentDirectLoginAllowed: 0,
    inboxAvailable: input.inboxAvailable ? 1 : 0,
    calendarAvailable: input.calendarAvailable ? 1 : 0,
    driveAvailable: input.driveAvailable ? 1 : 0,
    contactsAvailable: input.contactsAvailable ? 1 : 0,
    writePermissionState: input.writePermissionState,
    authenticationState: input.authenticationState,
    recoveryState: input.recoveryState,
    twoFactorState: input.twoFactorState,
    status: input.status,
    notes: input.notes ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `INSERT INTO external_identities
      (id, emailAddress, displayName, identityType, provider, intendedPurpose, owner, loginAllowed,
       agentDirectLoginAllowed, inboxAvailable, calendarAvailable, driveAvailable, contactsAvailable,
       writePermissionState, authenticationState, recoveryState, twoFactorState, status, notes, createdAt, updatedAt)
     VALUES
      (@id, @emailAddress, @displayName, @identityType, @provider, @intendedPurpose, @owner, @loginAllowed,
       @agentDirectLoginAllowed, @inboxAvailable, @calendarAvailable, @driveAvailable, @contactsAvailable,
       @writePermissionState, @authenticationState, @recoveryState, @twoFactorState, @status, @notes, @createdAt, @updatedAt)`,
  ).run(record);
  return getExternalIdentityById(db, record.id);
}

function getExternalIdentityById(db, id) {
  return db.prepare("SELECT * FROM external_identities WHERE id = ?").get(id) || null;
}

function getExternalIdentityByEmail(db, emailAddress) {
  return db.prepare("SELECT * FROM external_identities WHERE emailAddress = ?").get(emailAddress) || null;
}

function listExternalIdentities(db) {
  return db.prepare("SELECT * FROM external_identities ORDER BY identityType ASC, emailAddress ASC").all();
}

function updateExternalIdentityReview(db, input = {}) {
  db.prepare(
    `UPDATE external_identities SET status = @status, notes = @notes, updatedAt = @updatedAt WHERE id = @id`,
  ).run({
    id: input.id,
    status: input.status,
    notes: input.notes ?? null,
    updatedAt: input.updatedAt,
  });
  return getExternalIdentityById(db, input.id);
}

function insertOfficeWorkItem(db, input = {}) {
  const record = {
    id: input.id,
    title: input.title,
    requestedOutcome: input.requestedOutcome,
    category: input.category,
    targetIdentityId: input.targetIdentityId ?? null,
    ownerAgentId: input.ownerAgentId,
    contributorAgentIdsJson: input.contributorAgentIdsJson,
    requestedCapabilityId: input.requestedCapabilityId ?? null,
    permissionLevelRequired: input.permissionLevelRequired,
    dataSensitivity: input.dataSensitivity,
    externalEffect: input.externalEffect,
    draftPayloadJson: input.draftPayloadJson ?? null,
    safeSummary: input.safeSummary,
    approvalStatus: input.approvalStatus || "DRAFT",
    executionStatus: input.executionStatus || "NOT_STARTED",
    providerReference: null,
    resultSummary: null,
    errorCode: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `INSERT INTO office_work_items
      (id, title, requestedOutcome, category, targetIdentityId, ownerAgentId, contributorAgentIdsJson,
       requestedCapabilityId, permissionLevelRequired, dataSensitivity, externalEffect, draftPayloadJson,
       safeSummary, approvalStatus, executionStatus, providerReference, resultSummary, errorCode, createdAt, updatedAt)
     VALUES
      (@id, @title, @requestedOutcome, @category, @targetIdentityId, @ownerAgentId, @contributorAgentIdsJson,
       @requestedCapabilityId, @permissionLevelRequired, @dataSensitivity, @externalEffect, @draftPayloadJson,
       @safeSummary, @approvalStatus, @executionStatus, @providerReference, @resultSummary, @errorCode, @createdAt, @updatedAt)`,
  ).run(record);
  return getOfficeWorkItemById(db, record.id);
}

function getOfficeWorkItemById(db, id) {
  return db.prepare("SELECT * FROM office_work_items WHERE id = ?").get(id) || null;
}

function listOfficeWorkItems(db, filter = {}) {
  if (filter.category) {
    return db.prepare("SELECT * FROM office_work_items WHERE category = ? ORDER BY createdAt DESC").all(filter.category);
  }
  return db.prepare("SELECT * FROM office_work_items ORDER BY createdAt DESC").all();
}

// Aktualisiert ausschließlich die Prüf-/Fortschrittsfelder eines bestehenden
// Office-Auftrags (approvalStatus/executionStatus/resultSummary/errorCode) –
// die bei Anlage erzeugten Inhaltsfelder (title, draftPayloadJson, ...)
// bleiben unverändert (gleiches Prinzip wie updateAgentHrDailyProposalReview).
function updateOfficeWorkItemStatus(db, input = {}) {
  db.prepare(
    `UPDATE office_work_items
       SET approvalStatus = @approvalStatus, executionStatus = @executionStatus,
           resultSummary = @resultSummary, errorCode = @errorCode, updatedAt = @updatedAt
     WHERE id = @id`,
  ).run({
    id: input.id,
    approvalStatus: input.approvalStatus,
    executionStatus: input.executionStatus,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    updatedAt: input.updatedAt,
  });
  return getOfficeWorkItemById(db, input.id);
}

function insertFinanceHandoff(db, input = {}) {
  const record = {
    id: input.id,
    title: input.title,
    type: input.type,
    period: input.period ?? null,
    companyIdentity: input.companyIdentity ?? null,
    sourceDescription: input.sourceDescription,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    taxRelevance: input.taxRelevance || "UNKNOWN",
    sensitivity: input.sensitivity,
    proposedCategory: input.proposedCategory ?? null,
    confidence: input.confidence,
    missingInformation: input.missingInformation ?? null,
    requiredSpecialist: input.requiredSpecialist ?? null,
    jamalDecision: null,
    approvalStatus: input.approvalStatus || "DRAFT",
    executionBlocked: 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  db.prepare(
    `INSERT INTO finance_handoffs
      (id, title, type, period, companyIdentity, sourceDescription, amount, currency, taxRelevance, sensitivity,
       proposedCategory, confidence, missingInformation, requiredSpecialist, jamalDecision, approvalStatus,
       executionBlocked, createdAt, updatedAt)
     VALUES
      (@id, @title, @type, @period, @companyIdentity, @sourceDescription, @amount, @currency, @taxRelevance, @sensitivity,
       @proposedCategory, @confidence, @missingInformation, @requiredSpecialist, @jamalDecision, @approvalStatus,
       @executionBlocked, @createdAt, @updatedAt)`,
  ).run(record);
  return getFinanceHandoffById(db, record.id);
}

function getFinanceHandoffById(db, id) {
  return db.prepare("SELECT * FROM finance_handoffs WHERE id = ?").get(id) || null;
}

function listFinanceHandoffs(db, filter = {}) {
  if (filter.type) {
    return db.prepare("SELECT * FROM finance_handoffs WHERE type = ? ORDER BY createdAt DESC").all(filter.type);
  }
  return db.prepare("SELECT * FROM finance_handoffs ORDER BY createdAt DESC").all();
}

function updateFinanceHandoffReview(db, input = {}) {
  db.prepare(
    `UPDATE finance_handoffs SET approvalStatus = @approvalStatus, jamalDecision = @jamalDecision, updatedAt = @updatedAt WHERE id = @id`,
  ).run({
    id: input.id,
    approvalStatus: input.approvalStatus,
    jamalDecision: input.jamalDecision ?? null,
    updatedAt: input.updatedAt,
  });
  return getFinanceHandoffById(db, input.id);
}

// ---------------------------------------------------------------------------
// V7.6.3 – Health Upgrade Kompass Referenz-Arbeitslauf (siehe
// health-reference-work-run-service.js#Kopfkommentar). Genau ein
// kanonischer Lauf; die Eindeutigkeit einer festen id wird fachlich vom
// Service sichergestellt (INSERT OR IGNORE hier zusätzlich defensiv).
// ---------------------------------------------------------------------------
function insertHealthReferenceRunIfMissing(db, input = {}) {
  db.prepare(
    `INSERT OR IGNORE INTO health_reference_runs
      (id, title, projectId, projectPath, outcomeText, status, mainAgentCanonicalName,
       specialistAgentsJson, qaAgentCanonicalName, createdAt, updatedAt)
     VALUES
      (@id, @title, @projectId, @projectPath, @outcomeText, @status, @mainAgentCanonicalName,
       @specialistAgentsJson, @qaAgentCanonicalName, @createdAt, @updatedAt)`,
  ).run({
    id: input.id,
    title: input.title,
    projectId: input.projectId,
    projectPath: input.projectPath,
    outcomeText: input.outcomeText,
    status: input.status,
    mainAgentCanonicalName: input.mainAgentCanonicalName,
    specialistAgentsJson: input.specialistAgentsJson,
    qaAgentCanonicalName: input.qaAgentCanonicalName,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return getHealthReferenceRunById(db, input.id);
}

function getHealthReferenceRunById(db, id) {
  return db.prepare("SELECT * FROM health_reference_runs WHERE id = ?").get(id) || null;
}

function updateHealthReferenceRunStatus(db, input = {}) {
  db.prepare(
    `UPDATE health_reference_runs SET status = @status, updatedAt = @updatedAt WHERE id = @id`,
  ).run({ id: input.id, status: input.status, updatedAt: input.updatedAt });
  return getHealthReferenceRunById(db, input.id);
}

function insertHealthReferenceWorkPackageIfMissing(db, input = {}) {
  db.prepare(
    `INSERT OR IGNORE INTO health_reference_work_packages
      (id, runId, packageKey, sequence, title, status, promptDraftJson, createdAt, updatedAt)
     VALUES
      (@id, @runId, @packageKey, @sequence, @title, @status, @promptDraftJson, @createdAt, @updatedAt)`,
  ).run({
    id: input.id,
    runId: input.runId,
    packageKey: input.packageKey,
    sequence: input.sequence,
    title: input.title,
    status: input.status,
    promptDraftJson: input.promptDraftJson ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return getHealthReferenceWorkPackage(db, input.runId, input.packageKey);
}

function getHealthReferenceWorkPackage(db, runId, packageKey) {
  return (
    db
      .prepare("SELECT * FROM health_reference_work_packages WHERE runId = ? AND packageKey = ?")
      .get(runId, packageKey) || null
  );
}

function listHealthReferenceWorkPackages(db, runId) {
  return db
    .prepare("SELECT * FROM health_reference_work_packages WHERE runId = ? ORDER BY sequence ASC")
    .all(runId);
}

function updateHealthReferenceWorkPackage(db, input = {}) {
  db.prepare(
    `UPDATE health_reference_work_packages
       SET status = @status, promptDraftJson = @promptDraftJson, updatedAt = @updatedAt
     WHERE id = @id`,
  ).run({
    id: input.id,
    status: input.status,
    promptDraftJson: input.promptDraftJson ?? null,
    updatedAt: input.updatedAt,
  });
  return db.prepare("SELECT * FROM health_reference_work_packages WHERE id = ?").get(input.id) || null;
}

function upsertHealthReferenceApproval(db, input = {}) {
  const existing = db
    .prepare("SELECT * FROM health_reference_approvals WHERE runId = ? AND approvalKey = ?")
    .get(input.runId, input.approvalKey);
  if (existing) {
    db.prepare(
      `UPDATE health_reference_approvals
         SET decision = @decision, note = @note, decidedAt = @decidedAt, updatedAt = @updatedAt
       WHERE id = @id`,
    ).run({
      id: existing.id,
      decision: input.decision,
      note: input.note ?? null,
      decidedAt: input.decidedAt ?? null,
      updatedAt: input.updatedAt,
    });
    return db.prepare("SELECT * FROM health_reference_approvals WHERE id = ?").get(existing.id) || null;
  }
  db.prepare(
    `INSERT INTO health_reference_approvals
      (id, runId, approvalKey, decision, note, decidedAt, createdAt, updatedAt)
     VALUES
      (@id, @runId, @approvalKey, @decision, @note, @decidedAt, @createdAt, @updatedAt)`,
  ).run({
    id: input.id,
    runId: input.runId,
    approvalKey: input.approvalKey,
    decision: input.decision,
    note: input.note ?? null,
    decidedAt: input.decidedAt ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return db.prepare("SELECT * FROM health_reference_approvals WHERE id = ?").get(input.id) || null;
}

function listHealthReferenceApprovals(db, runId) {
  return db.prepare("SELECT * FROM health_reference_approvals WHERE runId = ?").all(runId);
}

function insertHealthReferenceResult(db, input = {}) {
  db.prepare(
    `INSERT INTO health_reference_results
      (id, runId, workPackageKey, kind, summary, detailsJson, createdAt)
     VALUES
      (@id, @runId, @workPackageKey, @kind, @summary, @detailsJson, @createdAt)`,
  ).run({
    id: input.id,
    runId: input.runId,
    workPackageKey: input.workPackageKey ?? null,
    kind: input.kind,
    summary: input.summary,
    detailsJson: input.detailsJson ?? null,
    createdAt: input.createdAt,
  });
  return db.prepare("SELECT * FROM health_reference_results WHERE id = ?").get(input.id) || null;
}

function listHealthReferenceResults(db, runId) {
  return db.prepare("SELECT * FROM health_reference_results WHERE runId = ? ORDER BY createdAt ASC").all(runId);
}

// ---------------------------------------------------------------------------
// KI-Unternehmenszentrale-Pilotbetrieb – Drei-Agenten-Pilotauftrag (siehe
// pilot-work-order-service.js#Kopfkommentar). Genau ein kanonischer
// Pilotauftrag; Eindeutigkeit der festen id wird fachlich vom Service
// sichergestellt (INSERT OR IGNORE hier zusätzlich defensiv).
// ---------------------------------------------------------------------------
function insertPilotWorkOrderIfMissing(db, input = {}) {
  db.prepare(
    `INSERT OR IGNORE INTO pilot_work_orders
      (id, title, desiredOutcome, requestedBy, involvedAgentsJson, status, qualityCriteriaJson,
       allowedToolsJson, forbiddenActionsJson, requiredApprovalsJson, timeframe, createdAt, updatedAt)
     VALUES
      (@id, @title, @desiredOutcome, @requestedBy, @involvedAgentsJson, @status, @qualityCriteriaJson,
       @allowedToolsJson, @forbiddenActionsJson, @requiredApprovalsJson, @timeframe, @createdAt, @updatedAt)`,
  ).run({
    id: input.id,
    title: input.title,
    desiredOutcome: input.desiredOutcome,
    requestedBy: input.requestedBy,
    involvedAgentsJson: input.involvedAgentsJson,
    status: input.status,
    qualityCriteriaJson: input.qualityCriteriaJson,
    allowedToolsJson: input.allowedToolsJson,
    forbiddenActionsJson: input.forbiddenActionsJson,
    requiredApprovalsJson: input.requiredApprovalsJson,
    timeframe: input.timeframe,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return getPilotWorkOrderById(db, input.id);
}

function getPilotWorkOrderById(db, id) {
  return db.prepare("SELECT * FROM pilot_work_orders WHERE id = ?").get(id) || null;
}

// Phase 2 (Mehrfachlauf-Grundlage): Auflistung aller Pilotaufträge, damit die
// Auftragsverwaltung mehrere, voneinander getrennte Aufträge technisch
// unterscheiden kann. Reine Leseoperation, keine Statusänderung.
function listPilotWorkOrders(db) {
  return db.prepare("SELECT * FROM pilot_work_orders ORDER BY createdAt ASC, id ASC").all();
}

function updatePilotWorkOrderStatus(db, input = {}) {
  db.prepare(`UPDATE pilot_work_orders SET status = @status, updatedAt = @updatedAt WHERE id = @id`).run({
    id: input.id,
    status: input.status,
    updatedAt: input.updatedAt,
  });
  return getPilotWorkOrderById(db, input.id);
}

function insertPilotHandoff(db, input = {}) {
  db.prepare(
    `INSERT INTO pilot_handoffs
      (id, pilotOrderId, sequence, fromPilotRole, toPilotRole, shortFinding, resultOrRecommendation,
       basisUsed, riskOrLimit, nextStep, decisionNeeded, forbiddenActionOccurred, autonomyBoundaryRespected,
       pmFilterStatus, pmFilterReasonsJson, createdAt)
     VALUES
      (@id, @pilotOrderId, @sequence, @fromPilotRole, @toPilotRole, @shortFinding, @resultOrRecommendation,
       @basisUsed, @riskOrLimit, @nextStep, @decisionNeeded, @forbiddenActionOccurred, @autonomyBoundaryRespected,
       @pmFilterStatus, @pmFilterReasonsJson, @createdAt)`,
  ).run({
    id: input.id,
    pilotOrderId: input.pilotOrderId,
    sequence: input.sequence,
    fromPilotRole: input.fromPilotRole,
    toPilotRole: input.toPilotRole,
    shortFinding: input.shortFinding,
    resultOrRecommendation: input.resultOrRecommendation,
    basisUsed: input.basisUsed,
    riskOrLimit: input.riskOrLimit,
    nextStep: input.nextStep,
    decisionNeeded: input.decisionNeeded ?? null,
    forbiddenActionOccurred: input.forbiddenActionOccurred ? 1 : 0,
    autonomyBoundaryRespected: input.autonomyBoundaryRespected === false ? 0 : 1,
    pmFilterStatus: input.pmFilterStatus,
    pmFilterReasonsJson: input.pmFilterReasonsJson ?? null,
    createdAt: input.createdAt,
  });
  return db.prepare("SELECT * FROM pilot_handoffs WHERE id = ?").get(input.id) || null;
}

function listPilotHandoffs(db, pilotOrderId) {
  return db
    .prepare("SELECT * FROM pilot_handoffs WHERE pilotOrderId = ? ORDER BY sequence ASC, createdAt ASC")
    .all(pilotOrderId);
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
  updateTenantStatus,
  listUsersByTenantId,
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
  findLatestPendingTokenForUser,
  revokePendingTokensForUser,
  // Audit
  insertAuditEvent,
  getAuditEventById,
  listAuditEvents,
  // Work-Orders
  createWorkOrder,
  getWorkOrderById,
  listWorkOrdersByTenantId,
  listAllWorkOrders,
  resubmitWorkOrder,
  transitionWorkOrder,
  // Policy-Verstöße
  recordPolicyViolation,
  listPolicyViolationsForTenant,
  listPolicyViolationsForUser,
  countPolicyViolationsForUser,
  countPolicyViolationsForTenant,
  // Work-Order-Läufe
  getActiveWorkOrderRunForWorkOrder,
  createWorkOrderRun,
  getWorkOrderRunById,
  listWorkOrderRunsForWorkOrder,
  transitionWorkOrderRun,
  createWorkOrderRunAgent,
  listWorkOrderRunAgents,
  // Work-Order-Ergebnisse
  createWorkOrderResult,
  getWorkOrderResultById,
  getWorkOrderResultByRunId,
  getLatestWorkOrderResultForWorkOrder,
  listWorkOrderResultsForWorkOrder,
  // Änderungswünsche
  createWorkOrderChangeRequest,
  getWorkOrderChangeRequestById,
  getActiveWorkOrderChangeRequestForWorkOrder,
  listWorkOrderChangeRequestsForWorkOrder,
  transitionWorkOrderChangeRequest,
  // Kundenfreigaben
  createWorkOrderCustomerApproval,
  getWorkOrderCustomerApprovalByResultId,
  listWorkOrderCustomerApprovalsForWorkOrder,
  // Jamal-Arbeitsmodus (V7.3 Persistenznachtrag)
  upsertJamalWorkItem,
  getJamalWorkItemById,
  getLatestJamalWorkItem,
  appendJamalWorkResult,
  getJamalWorkResultById,
  listJamalWorkResultsForWorkItem,
  // Jamal-Arbeitsmodus – Canva-Produktionskorridor (V7.4)
  upsertJamalCanvaProduction,
  getJamalCanvaProductionById,
  getLatestJamalCanvaProductionForWorkItem,
  listJamalCanvaProductionsForWorkItem,
  // V7.5 Agentenorganisation/HR-Coaching/Technologie-Radar
  insertAgentHrDailyRun,
  getAgentHrDailyRunById,
  getAgentHrDailyRunByDate,
  insertAgentHrDailyProposalsBatch,
  listAgentHrDailyProposalsForRun,
  getAgentHrDailyProposalById,
  updateAgentHrDailyProposalReview,
  updateAgentHrDailyProposalPdcaStage,
  upsertTechnologyRadarItem,
  getTechnologyRadarItemById,
  getTechnologyRadarItemBySeedToolId,
  listTechnologyRadarItems,
  upsertAgentTechnologyFit,
  getAgentTechnologyFitById,
  getAgentTechnologyFitByPair,
  listAgentTechnologyFit,
  // Unternehmensleitlinien V1.0 – Hochzuverlässigkeitssignale
  insertAgentReliabilitySignal,
  getAgentReliabilitySignalById,
  listAgentReliabilitySignals,
  updateAgentReliabilitySignalReview,
  // V7.6.1 – Apple-first/Google-controlled Office-/Finance-Korridor
  insertExternalIdentity,
  getExternalIdentityById,
  getExternalIdentityByEmail,
  listExternalIdentities,
  updateExternalIdentityReview,
  insertOfficeWorkItem,
  getOfficeWorkItemById,
  listOfficeWorkItems,
  updateOfficeWorkItemStatus,
  insertFinanceHandoff,
  getFinanceHandoffById,
  listFinanceHandoffs,
  updateFinanceHandoffReview,
  // V7.6.3 – Health Upgrade Kompass Referenz-Arbeitslauf
  insertHealthReferenceRunIfMissing,
  getHealthReferenceRunById,
  updateHealthReferenceRunStatus,
  insertHealthReferenceWorkPackageIfMissing,
  getHealthReferenceWorkPackage,
  listHealthReferenceWorkPackages,
  updateHealthReferenceWorkPackage,
  upsertHealthReferenceApproval,
  listHealthReferenceApprovals,
  insertHealthReferenceResult,
  listHealthReferenceResults,
  insertPilotWorkOrderIfMissing,
  getPilotWorkOrderById,
  listPilotWorkOrders,
  updatePilotWorkOrderStatus,
  insertPilotHandoff,
  listPilotHandoffs,
};
