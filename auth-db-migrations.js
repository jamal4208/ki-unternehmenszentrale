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
  MIGRATIONS,
  ensureMigrationsTable,
  getAppliedVersions,
  runMigrations,
};
