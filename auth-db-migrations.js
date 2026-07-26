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
  // V7.2 Phase A Schritt 3 (Auftrag Abschnitt N) – Owner-Kunden-/
  // Benutzerverwaltung. Ergänzt in Migration 7 (widen_audit_event_types),
  // NICHT rückwirkend in dieser ursprünglichen Migration-5-Liste, damit
  // Migration 5 unverändert bleibt (Auftrag Abschnitt J: "bestehende
  // Migrationen nicht nachträglich umschreiben"). Diese Konstante hier ist
  // die aktuell gültige Gesamtmenge (siehe MIGRATIONS[6].sql für die
  // tatsächliche CHECK-Erweiterung).
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "USER_INVITED",
  "INVITATION_REISSUED",
  "INVITATION_REVOKED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "PASSWORD_RESET_PREPARED",
  // V7.2 Phase B Schritt 1 (Auftrag Abschnitt I) – Arbeitsauftrag anlegen,
  // prüfen, Status verfolgen. Ergänzt in Migration 8 (widen_audit_event_types_v2),
  // NICHT rückwirkend in AUDIT_EVENT_TYPES_AT_MIGRATION_7 (siehe dort) –
  // gleiches Vorgehen wie bei Migration 7 gegenüber Migration 5.
  //
  // Produktkorrektur (Selbstbedienungs-Fluss, vor jeglichem Commit/Push):
  // WORK_ORDER_CLARIFICATION_REQUESTED/WORK_ORDER_APPROVED/WORK_ORDER_REJECTED
  // gab es nur, solange der OWNER fälschlich als fachlicher Pflichtprüfer
  // vorgesehen war. Ersetzt durch WORK_ORDER_AUTO_READY/
  // WORK_ORDER_AUTO_NEEDS_CLARIFICATION (automatische Systementscheidung,
  // kein Owner-Akteur) sowie WORK_ORDER_ESCALATED/WORK_ORDER_CANCELLED
  // (ausschließlich Ausnahmefälle, siehe work-order-service.js).
  "WORK_ORDER_CREATED",
  "WORK_ORDER_SUBMITTED",
  "WORK_ORDER_RESUBMITTED",
  "WORK_ORDER_AUTO_READY",
  "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
  "WORK_ORDER_ESCALATED",
  "WORK_ORDER_CANCELLED",
  "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
  // V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt D)
  // – Business-Use-/Safety-Gate (business-use-policy.js). Ergänzt in
  // Migration 9 (create_policy_violations_and_widen_audit_event_types_v3),
  // NICHT rückwirkend in AUDIT_EVENT_TYPES_AT_MIGRATION_8 (siehe dort) –
  // gleiches Vorgehen wie bei Migration 8 gegenüber Migration 7.
  "WORK_ORDER_BLOCKED_BY_POLICY",
  "WORK_ORDER_AUTO_ESCALATED_BY_POLICY",
  // V7.2 Phase C Schritt 1 (Auftrag Abschnitt N) – kontrollierte Übergabe
  // eines READY_FOR_PROCESSING-Auftrags an die interne Agentenzentrale
  // (work-order-execution-service.js). Ergänzt in Migration 10
  // (create_work_order_runs_and_widen_audit_event_types_v4), NICHT
  // rückwirkend in AUDIT_EVENT_TYPES_AT_MIGRATION_9 (siehe dort) – gleiches
  // Vorgehen wie bei Migration 9 gegenüber Migration 8.
  "WORK_ORDER_RUN_PREPARED",
  "WORK_ORDER_RUN_STARTED",
  "WORK_ORDER_RUN_COMPLETED",
  "WORK_ORDER_RUN_FAILED",
  "WORK_ORDER_RUN_CANCELLED",
  "WORK_ORDER_RESULT_CREATED",
  "WORK_ORDER_AGENT_SELECTED",
  "WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY",
  "WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY",
  // V7.2 Phase C Schritt 2 (Auftrag Abschnitt L) – Kundenänderungsrunde,
  // Versionierung und Kundenfreigabe (work-order-change-service.js/
  // work-order-approval-service.js). Ergänzt in Migration 11
  // (create_work_order_change_requests_and_approvals_and_widen_audit_event_types_v5),
  // NICHT rückwirkend in AUDIT_EVENT_TYPES_AT_MIGRATION_10 (siehe dort) –
  // gleiches Vorgehen wie bei Migration 10 gegenüber Migration 9.
  "WORK_ORDER_CHANGES_REQUESTED",
  "WORK_ORDER_CHANGE_REQUEST_STARTED",
  "WORK_ORDER_CHANGE_REQUEST_COMPLETED",
  "WORK_ORDER_CHANGE_REQUEST_FAILED",
  "WORK_ORDER_CHANGE_REQUEST_CANCELLED",
  "WORK_ORDER_RESULT_VERSION_CREATED",
  "WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER",
  "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY",
  "WORK_ORDER_CHANGE_ESCALATED_BY_POLICY",
]);

// Historischer Stand exakt zum Zeitpunkt der Migration 5 (Auftrag Abschnitt
// J: "bestehende Migrationen nicht nachträglich umschreiben") – wird
// ausschließlich von MIGRATIONS[4] (create_auth_audit_events) referenziert,
// niemals von neuem Code. Migration 7 verwendet die aktuelle
// AUDIT_EVENT_TYPES-Konstante oben.
const AUDIT_EVENT_TYPES_AT_MIGRATION_5 = Object.freeze([
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

// Historischer Stand exakt zum Zeitpunkt der Migration 7 (Auftrag Abschnitt
// J, gleiches Prinzip wie AUDIT_EVENT_TYPES_AT_MIGRATION_5 oben) – wird
// ausschließlich von MIGRATIONS[6] (widen_audit_event_types) referenziert.
// V7.2 Phase B Schritt 1 fügt acht weitere Ereignistypen hinzu (siehe
// AUDIT_EVENT_TYPES oben); Migration 7 selbst bleibt dadurch unverändert –
// ihre CHECK-Erweiterung ist und bleibt exakt diese 25 Werte, unabhängig
// davon, wie AUDIT_EVENT_TYPES seither weiterwächst. Die weitere Erweiterung
// auf die aktuelle Gesamtmenge erfolgt in Migration 8 (widen_audit_event_types_v2).
const AUDIT_EVENT_TYPES_AT_MIGRATION_7 = Object.freeze([
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
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "USER_INVITED",
  "INVITATION_REISSUED",
  "INVITATION_REVOKED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "PASSWORD_RESET_PREPARED",
]);

// Historischer Stand exakt zum Zeitpunkt der Migration 8 (gleiches Prinzip
// wie AUDIT_EVENT_TYPES_AT_MIGRATION_7 oben) – wird ausschließlich von
// MIGRATIONS[7] (create_work_orders_and_widen_audit_event_types_v2)
// referenziert. V7.2 Phase B – Schutz- und Einwilligungsgrundlage fügt zwei
// weitere Ereignistypen hinzu (siehe AUDIT_EVENT_TYPES oben); Migration 8
// selbst bleibt dadurch unverändert – ihre CHECK-Erweiterung ist und bleibt
// exakt diese 33 Werte. Die weitere Erweiterung auf die aktuelle
// Gesamtmenge erfolgt in Migration 9
// (create_policy_violations_and_widen_audit_event_types_v3). Korrigiert vor
// jeglichem Commit/Push denselben historischen Fehler, der für Migration 7
// bereits behoben wurde: Migration 8 referenzierte zunächst fälschlich die
// live weiterwachsende AUDIT_EVENT_TYPES-Konstante statt eines
// eingefrorenen Snapshots.
const AUDIT_EVENT_TYPES_AT_MIGRATION_8 = Object.freeze([
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
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "USER_INVITED",
  "INVITATION_REISSUED",
  "INVITATION_REVOKED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "PASSWORD_RESET_PREPARED",
  "WORK_ORDER_CREATED",
  "WORK_ORDER_SUBMITTED",
  "WORK_ORDER_RESUBMITTED",
  "WORK_ORDER_AUTO_READY",
  "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
  "WORK_ORDER_ESCALATED",
  "WORK_ORDER_CANCELLED",
  "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
]);

// Historischer Stand exakt zum Zeitpunkt der Migration 9 (gleiches Prinzip
// wie AUDIT_EVENT_TYPES_AT_MIGRATION_8 oben) – wird ausschließlich von
// MIGRATIONS[8] (create_policy_violations_and_widen_audit_event_types_v3)
// referenziert. V7.2 Phase C Schritt 1 fügt neun weitere Ereignistypen hinzu
// (siehe AUDIT_EVENT_TYPES oben); Migration 9 selbst bleibt dadurch
// unverändert – ihre CHECK-Erweiterung ist und bleibt exakt diese 35 Werte.
// Die weitere Erweiterung auf die aktuelle Gesamtmenge erfolgt in
// Migration 10 (create_work_order_runs_and_widen_audit_event_types_v4).
const AUDIT_EVENT_TYPES_AT_MIGRATION_9 = Object.freeze([
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
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "USER_INVITED",
  "INVITATION_REISSUED",
  "INVITATION_REVOKED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "PASSWORD_RESET_PREPARED",
  "WORK_ORDER_CREATED",
  "WORK_ORDER_SUBMITTED",
  "WORK_ORDER_RESUBMITTED",
  "WORK_ORDER_AUTO_READY",
  "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
  "WORK_ORDER_ESCALATED",
  "WORK_ORDER_CANCELLED",
  "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
  "WORK_ORDER_BLOCKED_BY_POLICY",
  "WORK_ORDER_AUTO_ESCALATED_BY_POLICY",
]);

// Historischer Stand exakt zum Zeitpunkt der Migration 10 (gleiches Prinzip
// wie AUDIT_EVENT_TYPES_AT_MIGRATION_9 oben) – wird ausschließlich von
// MIGRATIONS[9] (create_work_order_runs_and_widen_audit_event_types_v4)
// referenziert. V7.2 Phase C Schritt 2 fügt neun weitere Ereignistypen hinzu
// (siehe AUDIT_EVENT_TYPES oben); Migration 10 selbst bleibt dadurch
// unverändert – ihre CHECK-Erweiterung ist und bleibt exakt diese 44 Werte.
// Die weitere Erweiterung auf die aktuelle Gesamtmenge erfolgt in Migration 11
// (create_work_order_change_requests_and_approvals_and_widen_audit_event_types_v5).
// Korrigiert vor jeglichem Commit/Push denselben historischen Fehler, der für
// Migration 7/8 bereits behoben wurde: Migration 10 referenzierte zunächst
// fälschlich die live weiterwachsende AUDIT_EVENT_TYPES-Konstante statt eines
// eingefrorenen Snapshots. Die tatsächliche, bereits angewendete SQL-Zeichen-
// kette bleibt dabei byteidentisch – dieser Snapshot enthält exakt dieselben
// 44 Werte, die AUDIT_EVENT_TYPES zum Zeitpunkt der ursprünglichen Migration
// 10 (V7.2 Phase C Schritt 1) enthielt.
const AUDIT_EVENT_TYPES_AT_MIGRATION_10 = Object.freeze([
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
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "USER_INVITED",
  "INVITATION_REISSUED",
  "INVITATION_REVOKED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "PASSWORD_RESET_PREPARED",
  "WORK_ORDER_CREATED",
  "WORK_ORDER_SUBMITTED",
  "WORK_ORDER_RESUBMITTED",
  "WORK_ORDER_AUTO_READY",
  "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
  "WORK_ORDER_ESCALATED",
  "WORK_ORDER_CANCELLED",
  "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
  "WORK_ORDER_BLOCKED_BY_POLICY",
  "WORK_ORDER_AUTO_ESCALATED_BY_POLICY",
  "WORK_ORDER_RUN_PREPARED",
  "WORK_ORDER_RUN_STARTED",
  "WORK_ORDER_RUN_COMPLETED",
  "WORK_ORDER_RUN_FAILED",
  "WORK_ORDER_RUN_CANCELLED",
  "WORK_ORDER_RESULT_CREATED",
  "WORK_ORDER_AGENT_SELECTED",
  "WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY",
  "WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY",
]);

const AUDIT_RESULT_VALUES = Object.freeze(["OK", "DENIED", "ERROR"]);

// V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt D) –
// Verstoß-/Eskalationsprotokoll (policy_violations, Migration 9). Siehe
// SAFETY_ENFORCEMENT_MODEL.md für die vollständige Beschreibung.
const POLICY_VIOLATION_SEVERITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const POLICY_VIOLATION_ACTION_VALUES = Object.freeze([
  "BLOCKED",
  "ESCALATED",
  "WARNED",
  "USER_SUSPENDED",
  "TENANT_SUSPENDED",
  "LICENSE_REVIEW_REQUIRED",
]);

// V7.2 Phase B Schritt 1 – Produktkorrektur (Selbstbedienungs-Fluss, siehe
// work-order-service.js#Kopfkommentar): der OWNER ist kein fachlicher
// Prüfer und kein Pflichtschritt. Die ersten sechs Werte sind die in
// diesem Schritt tatsächlich erreichbaren Status; die letzten vier
// (IN_PROGRESS/RESULT_READY/CHANGES_REQUESTED/CUSTOMER_APPROVED) sind
// strukturell bereits Teil der CHECK-Aufzählung ("sauber vorbereiten"),
// werden aber von keinem Code in diesem Schritt jemals geschrieben oder
// gelesen (siehe work-order-service.js#REACHABLE_STATUS_VALUES). Kein
// APPROVED/REJECTED durch den OWNER mehr – das frühere Zwei-Werte-Modell
// (APPROVED/REJECTED) wurde noch vor jeglichem Commit/Push in dieser
// selben, noch ungeteilten Migration 8 korrigiert.
const WORK_ORDER_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "NEEDS_CLARIFICATION",
  "READY_FOR_PROCESSING",
  "ESCALATED",
  "CANCELLED",
  // Für spätere Schritte vorbereitet, in Schritt 1 nicht erreichbar:
  "IN_PROGRESS",
  "RESULT_READY",
  "CHANGES_REQUESTED",
  "CUSTOMER_APPROVED",
]);

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt F) – Laufmodell für die
// kontrollierte Übergabe eines READY_FOR_PROCESSING-Auftrags an die interne
// Agentenzentrale (work-order-execution-service.js/
// work-order-agent-orchestrator.js). NEEDS_CLARIFICATION ist hier ein
// LAUF-Endzustand (der Lauf selbst konnte keine echte fachliche Lücke lösen
// und wurde technisch sauber beendet) – unabhängig vom gleichnamigen
// WORK-ORDER-Status, der von work-order-service.js separat verwaltet wird.
const WORK_ORDER_RUN_STATUS_VALUES = Object.freeze([
  "PREPARED",
  "IN_PROGRESS",
  "NEEDS_CLARIFICATION",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

// Rollen, die ein Agent innerhalb genau eines Laufs einnehmen kann (Auftrag
// Abschnitt D/E): genau ein Projektmanager, ein bis drei Fachagenten, genau
// ein Qualitätsagent (die Obergrenzen selbst erzwingt
// work-order-agent-orchestrator.js, nicht diese CHECK-Aufzählung).
const WORK_ORDER_RUN_AGENT_ROLE_VALUES = Object.freeze(["PROJECT_MANAGER", "SPECIALIST", "QUALITY"]);
const WORK_ORDER_RUN_AGENT_STATUS_VALUES = Object.freeze(["PLANNED", "COMPLETED"]);

// Qualitätsstatus eines gespeicherten Ergebnisses (Auftrag Abschnitt K).
// Eine Rückfrage statt Ergebnis wird NICHT als Ergebnis mit diesem Status
// gespeichert, sondern beendet den Lauf bereits vorher als
// NEEDS_CLARIFICATION (siehe work-order-execution-service.js) – es gibt
// bewusst kein "Ergebnis mit Status Rückfrage nötig".
const WORK_ORDER_RESULT_QUALITY_STATUS_VALUES = Object.freeze(["PASSED", "PASSED_WITH_NOTES"]);

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt C/D) – Kundenänderungswunsch zu
// einem vorliegenden Ergebnis (work-order-change-service.js). SUBMITTED:
// gerade angelegt, Auftrag steht auf CHANGES_REQUESTED. IN_PROGRESS: der
// kontrollierte Revisionslauf läuft (Auftrag steht auf IN_PROGRESS).
// COMPLETED: eine neue Ergebnisversion wurde erzeugt (Auftrag wieder
// RESULT_READY). CANCELLED: der Änderungswunsch konnte nicht zu einer neuen
// Ergebnisversion führen (Safety-Gate/technischer Fehler) – niemals eine
// stille Teilverarbeitung.
const WORK_ORDER_CHANGE_REQUEST_STATUS_VALUES = Object.freeze(["SUBMITTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

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
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_5)})),
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
  // V7.2 Phase A Schritt 3 (Auftrag Abschnitt J/N) – erweitert ausschließlich
  // die CHECK-Aufzählung von auth_audit_events.eventType um die neun neuen
  // Owner-Kunden-/Benutzerverwaltungs-Ereignisse. SQLite kennt kein
  // "ALTER TABLE ... ALTER COLUMN ... CHECK": die einzige verlustfreie,
  // dokumentierte Vorgehensweise ist Tabellen-Neuaufbau (neue Tabelle mit
  // erweitertem CHECK anlegen, Daten 1:1 kopieren, alte Tabelle löschen,
  // neue Tabelle umbenennen, Trigger und Indizes neu anlegen – sie werden
  // beim DROP der alten Tabelle automatisch mitgelöscht). Keine Zeile geht
  // dabei verloren (reines INSERT...SELECT ohne Filter); keine bestehende
  // Migration (1–6) wird verändert.
  //
  // V7.2 Phase B Schritt 1 (Auftrag Abschnitt J): referenziert bewusst die
  // eingefrorene AUDIT_EVENT_TYPES_AT_MIGRATION_7-Konstante statt der live
  // weiterwachsenden AUDIT_EVENT_TYPES-Konstante, damit diese Migration für
  // jede Datenbank (alt oder neu angelegt) exakt dieselbe, historisch
  // korrekte CHECK-Erweiterung erzeugt – unabhängig davon, welche
  // Ereignistypen ein späterer Schritt der AUDIT_EVENT_TYPES-Gesamtmenge
  // hinzufügt.
  Object.freeze({
    version: 7,
    name: "widen_audit_event_types",
    sql: `
      CREATE TABLE auth_audit_events_v2 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_7)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v2 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v2 RENAME TO auth_audit_events;

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

      CREATE INDEX idx_auth_audit_events_timestamp ON auth_audit_events(timestamp);
      CREATE INDEX idx_auth_audit_events_tenantId ON auth_audit_events(tenantId);
    `,
  }),
  // V7.2 Phase B Schritt 1 (Auftrag Abschnitt C) – erste echte
  // Kundenfachfunktion: Arbeitsauftrag anlegen, prüfen, Status verfolgen.
  // Zwei Teile in einer Migration (forward-only, transaktional, idempotent):
  // (a) die neue work_orders-Tabelle, (b) dieselbe Tabellen-Neuaufbau-Technik
  // wie Migration 7, um die eventType-CHECK-Aufzählung von
  // auth_audit_events erneut zu erweitern (SQLite kennt weiterhin kein
  // "ALTER TABLE ... ALTER COLUMN ... CHECK"). Migrationen 1–7 bleiben dabei
  // unverändert (siehe AUDIT_EVENT_TYPES_AT_MIGRATION_7 oben).
  //
  // Tenant-/User-Fremdschlüssel mit ON DELETE RESTRICT (wie bei sessions/
  // password_reset_tokens): ein Mandant oder Benutzer mit vorhandenen
  // Arbeitsaufträgen kann nicht durch ein Löschen aus der Datenbank
  // verschwinden und dadurch verwaiste Aufträge hinterlassen (in diesem
  // Schritt existiert ohnehin keine Löschfunktion für Tenants/User).
  // Spaltennamen folgen bewusst der camelCase-Konvention der bestehenden
  // Tabellen (tenants.customerId, sessions.userId, ...) statt der im
  // Auftragstext beispielhaft genannten snake_case-Schreibweise – reine
  // Namenskonvention, keine fachliche Abweichung von den geforderten
  // Feldern. Längenbegrenzungen laufen über CHECK(length(...)) (Auftrag
  // Abschnitt C: "Textlängen begrenzen"); es gibt bewusst keine
  // HTML-/Datei-/Anhangs-/URL-/Kosten-/Provider-/Agenten-Felder und keine
  // Soft-/Hard-Delete-Funktion.
  //
  // Produktkorrektur (Selbstbedienungs-Fluss, vor jeglichem Commit/Push an
  // dieser noch ungeteilten Migration 8 nachgezogen, daher hier direkt
  // korrigiert statt einer zusätzlichen Migration 9 – siehe
  // work-order-service.js#Kopfkommentar):
  //   ownerNote -> statusNote: der Inhalt stammt jetzt entweder von der
  //     automatischen Vollständigkeitsregel (NEEDS_CLARIFICATION) oder vom
  //     OWNER im Ausnahmefall (ESCALATED/CANCELLED) – niemals von einer
  //     regulären fachlichen Owner-Freigabe/-Ablehnung, die es nicht mehr
  //     gibt. Der alte Feldname hätte diese Unterscheidung verschleiert.
  //   reviewedAt/reviewedByUserId -> decidedAt/decidedByUserId: "reviewed"
  //     suggerierte eine reguläre Owner-Prüfung jedes Auftrags; "decided"
  //     ist neutral und trifft sowohl auf die automatische Systementscheidung
  //     (decidedByUserId bleibt NULL) als auch auf eine Owner-Eskalation/
  //     einen Owner-Stopp zu.
  Object.freeze({
    version: 8,
    name: "create_work_orders_and_widen_audit_event_types_v2",
    sql: `
      CREATE TABLE work_orders (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        createdByUserId TEXT NOT NULL,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        desiredResult TEXT NOT NULL CHECK (length(desiredResult) BETWEEN 1 AND 4000),
        context TEXT CHECK (context IS NULL OR length(context) <= 4000),
        deadlineText TEXT CHECK (deadlineText IS NULL OR length(deadlineText) <= 200),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(WORK_ORDER_STATUS_VALUES)})),
        statusNote TEXT CHECK (statusNote IS NULL OR length(statusNote) <= 4000),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        submittedAt TEXT,
        decidedAt TEXT,
        decidedByUserId TEXT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (decidedByUserId) REFERENCES users(id) ON DELETE RESTRICT
      );

      CREATE INDEX idx_work_orders_tenantId ON work_orders(tenantId);
      CREATE INDEX idx_work_orders_status ON work_orders(status);
      CREATE INDEX idx_work_orders_createdAt ON work_orders(createdAt);

      CREATE TABLE auth_audit_events_v3 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_8)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v3 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v3 RENAME TO auth_audit_events;

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

      CREATE INDEX idx_auth_audit_events_timestamp ON auth_audit_events(timestamp);
      CREATE INDEX idx_auth_audit_events_tenantId ON auth_audit_events(tenantId);
    `,
  }),
  // V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt D)
  // – additive Migration, KEINE Änderung an Migration 1–8. Zwei Teile,
  // gleiche Technik wie Migration 8: (a) neue policy_violations-Tabelle als
  // minimale Verstoß-/Eskalationsgrundlage für business-use-policy.js, (b)
  // erneute CHECK-Erweiterung von auth_audit_events um die beiden neuen
  // Ereignistypen WORK_ORDER_BLOCKED_BY_POLICY/
  // WORK_ORDER_AUTO_ESCALATED_BY_POLICY (SQLite kennt weiterhin kein
  // "ALTER TABLE ... ALTER COLUMN ... CHECK").
  //
  // policy_violations ist bewusst append-only (wie auth_audit_events) und
  // speichert NIEMALS den vollständigen Auftragstext – nur reasonCode
  // (Kategorie), severity und actionTaken (siehe
  // SAFETY_ENFORCEMENT_MODEL.md). workOrderId ist NULL bei BLOCK
  // (kein Auftrag wird in diesem Fall angelegt) und gesetzt bei ESCALATE.
  Object.freeze({
    version: 9,
    name: "create_policy_violations_and_widen_audit_event_types_v3",
    sql: `
      CREATE TABLE policy_violations (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        userId TEXT NOT NULL,
        workOrderId TEXT,
        reasonCode TEXT NOT NULL CHECK (length(reasonCode) BETWEEN 1 AND 100),
        severity TEXT NOT NULL CHECK (severity IN (${sqlEnum(POLICY_VIOLATION_SEVERITY_VALUES)})),
        actionTaken TEXT NOT NULL CHECK (actionTaken IN (${sqlEnum(POLICY_VIOLATION_ACTION_VALUES)})),
        createdAt TEXT NOT NULL,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_policy_violations_tenantId ON policy_violations(tenantId);
      CREATE INDEX idx_policy_violations_userId ON policy_violations(userId);
      CREATE INDEX idx_policy_violations_createdAt ON policy_violations(createdAt);

      CREATE TRIGGER trg_policy_violations_no_update
      BEFORE UPDATE ON policy_violations
      BEGIN
        SELECT RAISE(ABORT, 'policy_violations ist append-only: UPDATE ist nicht erlaubt.');
      END;

      CREATE TRIGGER trg_policy_violations_no_delete
      BEFORE DELETE ON policy_violations
      BEGIN
        SELECT RAISE(ABORT, 'policy_violations ist append-only: DELETE ist nicht erlaubt.');
      END;

      CREATE TABLE auth_audit_events_v4 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v4 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v4 RENAME TO auth_audit_events;

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

      CREATE INDEX idx_auth_audit_events_timestamp ON auth_audit_events(timestamp);
      CREATE INDEX idx_auth_audit_events_tenantId ON auth_audit_events(tenantId);
    `,
  }),
  // V7.2 Phase C Schritt 1 (Auftrag Abschnitt F) – kontrollierte Übergabe
  // eines READY_FOR_PROCESSING-Auftrags an die interne Agentenzentrale.
  // Additive Migration, KEINE Änderung an Migration 1–9. Drei neue Teile,
  // gleiche Technik wie Migration 8/9: (a) work_order_runs (genau ein
  // technischer Lauf pro Versuch, fortlaufende runNumber je Auftrag), (b)
  // work_order_run_agents (die für den jeweiligen Lauf ausgewählten
  // Agenten, siehe work-order-agent-orchestrator.js), (c) work_order_results
  // (unveränderliche, versionierte Ergebnisse – append-only wie
  // auth_audit_events/policy_violations), (d) erneute CHECK-Erweiterung von
  // auth_audit_events um die neun neuen Ereignistypen (SQLite kennt
  // weiterhin kein "ALTER TABLE ... ALTER COLUMN ... CHECK").
  //
  // Bewusst KEINE Änderung an work_orders.status: IN_PROGRESS/RESULT_READY
  // sind bereits seit Migration 8 Teil der CHECK-Aufzählung ("sauber
  // vorbereiten") und werden ab dieser Migration erstmals tatsächlich von
  // work-order-execution-service.js geschrieben.
  Object.freeze({
    version: 10,
    name: "create_work_order_runs_and_widen_audit_event_types_v4",
    sql: `
      CREATE TABLE work_order_runs (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL,
        tenantId TEXT NOT NULL,
        runNumber INTEGER NOT NULL CHECK (runNumber >= 1),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(WORK_ORDER_RUN_STATUS_VALUES)})),
        orchestratorVersion TEXT NOT NULL CHECK (length(orchestratorVersion) BETWEEN 1 AND 100),
        failureCode TEXT CHECK (failureCode IS NULL OR length(failureCode) <= 100),
        startedAt TEXT,
        completedAt TEXT,
        failedAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        UNIQUE (workOrderId, runNumber)
      );

      CREATE INDEX idx_work_order_runs_workOrderId ON work_order_runs(workOrderId);
      CREATE INDEX idx_work_order_runs_tenantId ON work_order_runs(tenantId);
      CREATE INDEX idx_work_order_runs_status ON work_order_runs(status);

      CREATE TABLE work_order_run_agents (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL,
        agentKey TEXT NOT NULL CHECK (length(agentKey) BETWEEN 1 AND 100),
        agentRole TEXT NOT NULL CHECK (agentRole IN (${sqlEnum(WORK_ORDER_RUN_AGENT_ROLE_VALUES)})),
        sequenceNumber INTEGER NOT NULL CHECK (sequenceNumber >= 1),
        selectionReason TEXT NOT NULL CHECK (length(selectionReason) BETWEEN 1 AND 500),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(WORK_ORDER_RUN_AGENT_STATUS_VALUES)})),
        startedAt TEXT,
        completedAt TEXT,
        FOREIGN KEY (runId) REFERENCES work_order_runs(id) ON DELETE RESTRICT,
        UNIQUE (runId, sequenceNumber)
      );

      CREATE INDEX idx_work_order_run_agents_runId ON work_order_run_agents(runId);

      CREATE TABLE work_order_results (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL,
        runId TEXT NOT NULL,
        tenantId TEXT NOT NULL,
        versionNumber INTEGER NOT NULL CHECK (versionNumber >= 1),
        resultTitle TEXT NOT NULL CHECK (length(resultTitle) BETWEEN 1 AND 200),
        resultSummary TEXT NOT NULL CHECK (length(resultSummary) BETWEEN 1 AND 1000),
        resultBody TEXT NOT NULL CHECK (length(resultBody) BETWEEN 1 AND 8000),
        qualityStatus TEXT NOT NULL CHECK (qualityStatus IN (${sqlEnum(WORK_ORDER_RESULT_QUALITY_STATUS_VALUES)})),
        qualityNote TEXT CHECK (qualityNote IS NULL OR length(qualityNote) <= 2000),
        openPoints TEXT CHECK (openPoints IS NULL OR length(openPoints) <= 2000),
        createdAt TEXT NOT NULL,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (runId) REFERENCES work_order_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        UNIQUE (workOrderId, versionNumber),
        UNIQUE (runId)
      );

      CREATE INDEX idx_work_order_results_workOrderId ON work_order_results(workOrderId);
      CREATE INDEX idx_work_order_results_tenantId ON work_order_results(tenantId);

      CREATE TRIGGER trg_work_order_results_no_update
      BEFORE UPDATE ON work_order_results
      BEGIN
        SELECT RAISE(ABORT, 'work_order_results ist append-only/unveränderlich: UPDATE ist nicht erlaubt.');
      END;

      CREATE TRIGGER trg_work_order_results_no_delete
      BEFORE DELETE ON work_order_results
      BEGIN
        SELECT RAISE(ABORT, 'work_order_results ist append-only/unveränderlich: DELETE ist nicht erlaubt.');
      END;

      CREATE TABLE auth_audit_events_v5 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_10)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v5 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v5 RENAME TO auth_audit_events;

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

      CREATE INDEX idx_auth_audit_events_timestamp ON auth_audit_events(timestamp);
      CREATE INDEX idx_auth_audit_events_tenantId ON auth_audit_events(tenantId);
    `,
  }),
  // V7.2 Phase C Schritt 2 (Auftrag Abschnitt C/D) – Kundenänderungsrunde,
  // Versionierung und Kundenfreigabe. Additive Migration, KEINE Änderung an
  // Migration 1–10. Drei neue Teile, gleiche Technik wie Migration 8/9/10:
  // (a) work_order_change_requests (genau ein Änderungswunsch pro
  // Kundenanfrage, atomarer Statusübergang wie work_orders/work_order_runs;
  // ZUSÄTZLICH ein partieller UNIQUE-Index, der auf Datenbankebene
  // erzwingt, dass pro Arbeitsauftrag höchstens ein aktiver – also nicht
  // COMPLETED/CANCELLED – Änderungswunsch existiert, Auftrag Abschnitt J:
  // "kein zweiter aktiver Revisionslauf"), (b) work_order_customer_approvals
  // (unveränderliche, append-only Kundenfreigabe je Ergebnisversion – ein
  // UNIQUE-Index auf resultId verhindert eine doppelte Freigabe derselben
  // Version auf Datenbankebene), (c) erneute CHECK-Erweiterung von
  // auth_audit_events um die neun neuen Ereignistypen (SQLite kennt
  // weiterhin kein "ALTER TABLE ... ALTER COLUMN ... CHECK").
  //
  // Bewusst KEINE Änderung an work_orders.status: CHANGES_REQUESTED/
  // CUSTOMER_APPROVED sind bereits seit Migration 8 Teil der CHECK-
  // Aufzählung ("sauber vorbereiten") und werden ab dieser Migration
  // erstmals tatsächlich von work-order-change-service.js/
  // work-order-approval-service.js geschrieben.
  //
  // basedOnResultId/resultingResultId/resultId referenzieren work_order_
  // results(id) – Ergebnisversionen bleiben unveränderlich (Migration 10);
  // ein Änderungswunsch/eine Freigabe referenziert immer eine konkrete,
  // bereits existierende, unveränderliche Version, niemals eine Versions-
  // NUMMER allein (Auftrag Abschnitt J: "Freigabe bezieht sich immer auf
  // eine konkrete Ergebnisversion").
  Object.freeze({
    version: 11,
    name: "create_work_order_change_requests_and_approvals_and_widen_audit_event_types_v5",
    sql: `
      CREATE TABLE work_order_change_requests (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL,
        tenantId TEXT NOT NULL,
        requestedByUserId TEXT NOT NULL,
        basedOnResultId TEXT NOT NULL,
        requestText TEXT NOT NULL CHECK (length(requestText) BETWEEN 1 AND 2000),
        preserveText TEXT CHECK (preserveText IS NULL OR length(preserveText) <= 1000),
        importantNote TEXT CHECK (importantNote IS NULL OR length(importantNote) <= 500),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(WORK_ORDER_CHANGE_REQUEST_STATUS_VALUES)})),
        runId TEXT,
        resultingResultId TEXT,
        createdAt TEXT NOT NULL,
        acceptedAt TEXT,
        completedAt TEXT,
        cancelledAt TEXT,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (requestedByUserId) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (basedOnResultId) REFERENCES work_order_results(id) ON DELETE RESTRICT,
        FOREIGN KEY (runId) REFERENCES work_order_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (resultingResultId) REFERENCES work_order_results(id) ON DELETE RESTRICT
      );

      CREATE INDEX idx_work_order_change_requests_workOrderId ON work_order_change_requests(workOrderId);
      CREATE INDEX idx_work_order_change_requests_tenantId ON work_order_change_requests(tenantId);

      -- Höchstens ein nicht-terminaler (aktiver) Änderungswunsch je Auftrag
      -- (Auftrag Abschnitt J: Idempotenz-/Parallelitätsschutz auf
      -- Datenbankebene, zweite Verteidigungslinie zusätzlich zur fachlichen
      -- Prüfung in work-order-change-service.js).
      CREATE UNIQUE INDEX idx_work_order_change_requests_active
        ON work_order_change_requests(workOrderId)
        WHERE status IN ('SUBMITTED', 'IN_PROGRESS');

      CREATE TABLE work_order_customer_approvals (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL,
        tenantId TEXT NOT NULL,
        resultId TEXT NOT NULL,
        approvedByUserId TEXT NOT NULL,
        approvalVersion INTEGER NOT NULL CHECK (approvalVersion >= 1),
        approvalNote TEXT CHECK (approvalNote IS NULL OR length(approvalNote) <= 1000),
        approvedAt TEXT NOT NULL,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (resultId) REFERENCES work_order_results(id) ON DELETE RESTRICT,
        FOREIGN KEY (approvedByUserId) REFERENCES users(id) ON DELETE RESTRICT,
        UNIQUE (resultId)
      );

      CREATE INDEX idx_work_order_customer_approvals_workOrderId ON work_order_customer_approvals(workOrderId);
      CREATE INDEX idx_work_order_customer_approvals_tenantId ON work_order_customer_approvals(tenantId);

      CREATE TRIGGER trg_work_order_customer_approvals_no_update
      BEFORE UPDATE ON work_order_customer_approvals
      BEGIN
        SELECT RAISE(ABORT, 'work_order_customer_approvals ist append-only/unveränderlich: UPDATE ist nicht erlaubt.');
      END;

      CREATE TRIGGER trg_work_order_customer_approvals_no_delete
      BEFORE DELETE ON work_order_customer_approvals
      BEGIN
        SELECT RAISE(ABORT, 'work_order_customer_approvals ist append-only/unveränderlich: DELETE ist nicht erlaubt.');
      END;

      CREATE TABLE auth_audit_events_v6 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v6 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v6 RENAME TO auth_audit_events;

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
  WORK_ORDER_STATUS_VALUES,
  POLICY_VIOLATION_SEVERITY_VALUES,
  POLICY_VIOLATION_ACTION_VALUES,
  WORK_ORDER_RUN_STATUS_VALUES,
  WORK_ORDER_RUN_AGENT_ROLE_VALUES,
  WORK_ORDER_RUN_AGENT_STATUS_VALUES,
  WORK_ORDER_RESULT_QUALITY_STATUS_VALUES,
  WORK_ORDER_CHANGE_REQUEST_STATUS_VALUES,
  MIGRATIONS,
  ensureMigrationsTable,
  getAppliedVersions,
  runMigrations,
};
