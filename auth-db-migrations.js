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

// V7.3 Persistenznachtrag (Auftrag Abschnitt C) – Jamal-Arbeitsmodus
// (jamal-work-mode.js#STATUS). Bewusst hier als eigener, unabhängiger
// Wertebereich dupliziert statt aus jamal-work-mode.js importiert: dieses
// Migrationsmodul importiert grundsätzlich KEINE Fachlogikmodule (gleiches
// Prinzip wie die eingefrorenen AUDIT_EVENT_TYPES_AT_MIGRATION_N-Snapshots
// oben), und jamal-work-mode.js selbst darf laut Auftrag umgekehrt KEINEN
// Bezug zu auth-db.js/auth-db-migrations.js haben (kein Owner-/
// Auth-Rollenmix in der reinen Fachlogik). Ändert sich der Statuswertebereich
// in jamal-work-mode.js künftig inhaltlich, braucht das eine eigene,
// spätere additive Migration (gleiches Vorgehen wie bei den Audit-Event-
// Typen: bestehende Migrationen werden nicht nachträglich verändert).
const JAMAL_WORK_ITEM_STATUS_VALUES = Object.freeze([
  "NOT_STARTED",
  "READY",
  "IN_PROGRESS",
  "CLARIFICATION_NEEDED",
  "RESULT_READY",
  "CHANGE_IN_PROGRESS",
  "DONE",
  "STOPPED",
  "ESCALATION_NEEDED",
]);

// jamal-work-mode.js#resolvePrioritizedProject/#chooseProject.
const JAMAL_WORK_ITEM_PROJECT_SOURCE_VALUES = Object.freeze(["CONTINUITY", "DEFAULT", "NONE", "MANUAL"]);

// jamal-work-mode.js#markDone/#stopWorkItem.
const JAMAL_WORK_ITEM_DECISION_VALUES = Object.freeze(["PASST", "GESTOPPT"]);

// jamal-work-mode.js#pushImmutableVersion (trigger je Ergebnisversion:
// erste Fertigstellung oder Änderungsrunde).
const JAMAL_WORK_RESULT_TRIGGER_VALUES = Object.freeze(["INITIAL", "CHANGE_REQUEST"]);

// V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
// (Auftrag Abschnitt G) – eigener, unabhängiger Wertebereich für
// jamal-canva-production-service.js (gleiches Prinzip wie
// JAMAL_WORK_ITEM_STATUS_VALUES oben: dieses Migrationsmodul importiert
// keine Fachlogikmodule, jamal-canva-production-service.js kennt umgekehrt
// KEIN better-sqlite3).
const JAMAL_CANVA_PRODUCTION_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "READY_FOR_APPROVAL",
  "APPROVED_FOR_HANDOFF",
  "HANDOFF_STARTED",
  "WAITING_FOR_CANVA",
  "RESULT_RECEIVED",
  "NEEDS_REVISION",
  "ACCEPTED_INTERNAL",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
]);

// jamal-canva-briefing.js#evaluateCanvaSuitability.
const JAMAL_CANVA_SUITABILITY_DECISION_VALUES = Object.freeze([
  "CANVA_RECOMMENDED",
  "CANVA_OPTIONAL",
  "CANVA_NOT_SUITABLE",
  "CANVA_BLOCKED_BY_POLICY",
]);

// jamal-canva-briefing.js#evaluateRightsAndConsent.
const JAMAL_CANVA_RIGHTS_STATUS_VALUES = Object.freeze(["CLEAR", "UNCLEAR", "BLOCKED"]);

// jamal-canva-production-service.js interne Qualitätsprüfung (Auftrag
// Abschnitt J) – bewusst ein eigener, vom Kundenportal unabhängiger
// Wertebereich (dort gibt es zusätzlich REVISION_REQUIRED/BLOCKED nicht in
// WORK_ORDER_RESULT_QUALITY_STATUS_VALUES, da Kundenaufträge diese beiden
// Zustände bislang nicht kennen).
const JAMAL_CANVA_QUALITY_STATUS_VALUES = Object.freeze([
  "PASSED",
  "PASSED_WITH_NOTES",
  "REVISION_REQUIRED",
  "BLOCKED",
]);

// V7.4 (Auftrag Abschnitt N) – genau die zehn neuen Canva-Ereignistypen,
// zusätzlich zur vollständigen, bereits bestehenden AUDIT_EVENT_TYPES-Menge
// oben. WICHTIG: dies ist bewusst eine EIGENSTÄNDIGE, ADDITIVE Konstante
// und KEINE Änderung der bestehenden `AUDIT_EVENT_TYPES`-Konstante selbst
// (Migration 11 referenziert `AUDIT_EVENT_TYPES` weiterhin direkt und
// unverändert – "Migrationen 1–12 unverändert", siehe Auftrag Abschnitt G).
// Migration 13 unten verwendet ausschließlich diese neue Konstante für ihre
// eigene, weitere vollständige Neuerstellung von auth_audit_events (gleiches
// etablierte Muster wie Migration 7/8/9/10/11 gegenüber ihren jeweiligen
// Vorgängern). auth-audit.js#EVENT_TYPES muss exakt dieser Aufzählung
// entsprechen.
const AUDIT_EVENT_TYPES_AT_MIGRATION_13 = Object.freeze([
  ...AUDIT_EVENT_TYPES,
  "CANVA_BRIEFING_PREPARED",
  "CANVA_HANDOFF_APPROVED",
  "CANVA_HANDOFF_STARTED",
  "CANVA_HANDOFF_FAILED",
  "CANVA_RESULT_RECEIVED",
  "CANVA_RESULT_REVIEWED",
  "CANVA_REVISION_REQUESTED",
  "CANVA_RESULT_ACCEPTED_INTERNAL",
  "CANVA_HANDOFF_BLOCKED_BY_POLICY",
  "CANVA_HANDOFF_BLOCKED_BY_RIGHTS",
]);

// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt H) – eigene,
// unabhängige Wertebereiche für agent-hr-coaching-service.js/
// technology-radar-service.js (gleiches Prinzip wie
// JAMAL_WORK_ITEM_STATUS_VALUES/JAMAL_CANVA_PRODUCTION_STATUS_VALUES oben:
// dieses Migrationsmodul importiert keine Fachlogikmodule, die
// Fachlogikmodule kennen umgekehrt kein better-sqlite3).
//
// agent-hr-coaching-service.js#HR_RECOMMENDATION_VALUES.
const AGENT_HR_RECOMMENDATION_VALUES = Object.freeze([
  "KEEP_CURRENT",
  "TRAIN_FIRST",
  "RECOMMEND_SMALL_EXPANSION",
  "REDUCE_SCOPE",
  "ESCALATE",
]);

// agent-hr-coaching-service.js#PROPOSAL_STATUS_VALUES. "RECOMMEND_SMALL_
// EXPANSION" bleibt ausschließlich eine Empfehlung (siehe hrRecommendation
// oben) – auch der Status APPROVED ändert laut Auftrag Abschnitt D/M
// niemals automatisch den tatsächlichen Autonomierahmen in
// agent-registry.js (dort gibt es dafür ohnehin kein Feld, siehe
// agent-organization-service.js).
const AGENT_HR_PROPOSAL_STATUS_VALUES = Object.freeze([
  "PROPOSED",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
  "DEFERRED",
]);

// technology-radar-service.js#RADAR_TYPE_VALUES.
const TECHNOLOGY_RADAR_TYPE_VALUES = Object.freeze([
  "MODEL",
  "PLUGIN",
  "CONNECTOR",
  "AUTOMATION",
  "DESIGN_TOOL",
  "VIDEO_TOOL",
  "OFFICE_TOOL",
  "DATA_TOOL",
  "DEVELOPER_TOOL",
  "SECURITY_TOOL",
  "OTHER",
]);

// technology-radar-service.js#RADAR_RECOMMENDATION_VALUES – gemeinsam
// genutzt sowohl für einen Radar-Eintrag selbst als auch für eine
// Agent-Technology-Fit-Zuordnung (agent_technology_fit.recommendation
// unten): beide beantworten fachlich dieselbe Frage ("was sollte mit
// diesem Werkzeug/dieser Zuordnung als Nächstes geschehen?"), daher genau
// EIN Wertebereich statt zweier bedeutungsgleicher Aufzählungen.
const TECHNOLOGY_RADAR_RECOMMENDATION_VALUES = Object.freeze([
  "WATCH",
  "RESEARCH",
  "TEST_READ_ONLY",
  "PILOT_WITH_APPROVAL",
  "NOT_RECOMMENDED",
  "BLOCKED",
]);

// technology-radar-service.js#RADAR_STATUS_VALUES – unterscheidet
// ausschließlich den bereits bekannten Umgangsstatus eines Werkzeugs
// (Auftrag Abschnitt F), niemals eine tatsächliche technische Verbindung.
const TECHNOLOGY_RADAR_STATUS_VALUES = Object.freeze([
  "NOT_REVIEWED",
  "CANDIDATE",
  "REVIEWED",
  "READ_ONLY_TESTED",
  "PILOT",
  "CONNECTED",
]);

// agent-technology-fit – Zuordnungsstatus (technology-radar-service.js#
// FIT_STATUS_VALUES). Bewusst ein eigener, kleinerer Wertebereich als
// AGENT_HR_PROPOSAL_STATUS_VALUES, weil eine Fit-Zuordnung keine
// tägliche wiederkehrende Vorschlagszeile ist.
const AGENT_TECHNOLOGY_FIT_STATUS_VALUES = Object.freeze([
  "PROPOSED",
  "REVIEWED",
  "APPROVED_FOR_READ_ONLY_TEST",
  "REJECTED",
  "DEFERRED",
]);

// agent-technology-fit – Priorität (technology-radar-service.js#
// FIT_PRIORITY_VALUES).
const AGENT_TECHNOLOGY_FIT_PRIORITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

// ---------------------------------------------------------------------------
// V7.5 – Unternehmensleitlinien V1.0 als verbindliche Betriebslogik (Auftrag
// Abschnitt E/G/H/I/J/L). Migration 14 ist zum Zeitpunkt dieser Erweiterung
// noch nicht committet gewesen (siehe Auftrag Abschnitt O: "Migration 14 darf
// noch angepasst werden") – deshalb werden die neuen Spalten DIREKT in die
// unten stehenden CREATE-TABLE-Anweisungen aufgenommen statt eine Migration
// 15 anzulegen. Migrationen 1–13 bleiben davon unberührt.
// ---------------------------------------------------------------------------

// agent-hr-coaching-service.js#PDCA_STAGE_VALUES – Auftrag Abschnitt G:
// "kleinste sinnvolle PDCA-Struktur", kein automatischer Fortschritt, jeder
// Übergang ausschließlich über agent-hr-coaching-service.js#advanceHrPdcaStage.
const AGENT_HR_PDCA_STAGE_VALUES = Object.freeze(["PLAN", "DO", "CHECK", "ACT"]);

// agent-hr-coaching-service.js#PDCA_DECISION_VALUES – Abschlussentscheidung
// beim Übergang CHECK -> ACT (Auftrag Abschnitt G). NULL, solange ACT noch
// nicht erreicht ist.
const AGENT_HR_PDCA_DECISION_VALUES = Object.freeze(["KEEP", "ADJUST", "REPEAT", "DISCARD"]);

// agent-hr-coaching-service.js#RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES – Auftrag
// Abschnitt E Ziffer 10: ein leichtgewichtiger Tagesindikator direkt am
// Vorschlag (Standard "NONE" – die meisten Tage haben keinerlei Signal,
// "keine erfundenen Vorfälle"). Bewusst ein eigener, kleinerer Wertebereich
// als RELIABILITY_SIGNAL_TYPE_VALUES unten (dort ohne "NONE", weil ein
// tatsächlich angelegter Signal-Datensatz immer ein echtes Signal ist).
const AGENT_HR_RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES = Object.freeze([
  "NONE",
  "UNCERTAINTY",
  "EARLY_WARNING",
  "DEVIATION",
  "NEAR_MISS",
]);

// Gemeinsamer Nutzenbereich-Wertebereich (Auftrag Abschnitt J) – sowohl für
// agent_hr_daily_proposals.benefitArea als auch technology_radar_items.
// benefitArea verwendet, weil beide fachlich dieselbe Frage beantworten
// ("welchem Unternehmensnutzen dient das hier konkret?").
const LEADERSHIP_BENEFIT_AREA_VALUES = Object.freeze([
  "TIME_SAVING",
  "QUALITY_IMPROVEMENT",
  "RISK_REDUCTION",
  "COST_CONTROL",
  "REVENUE_OPPORTUNITY",
  "CUSTOMER_VALUE",
  "EMPLOYEE_RELIEF",
  "STRATEGIC_READINESS",
]);

// Gemeinsamer Prioritätswertebereich (Auftrag Abschnitt L) – "weniger
// beginnen, Wichtiges zuverlässig abschließen": jeder HR-Vorschlag und jeder
// Radar-/Backlog-Eintrag trägt genau eine dieser vier Stufen. Ein neuer
// Radar-Kandidat startet immer bei "WATCH" (siehe technology-radar-service.js)
// und wird niemals automatisch zum aktiven Schwerpunkt.
const LEADERSHIP_PRIORITY_BUCKET_VALUES = Object.freeze(["NOW", "NEXT", "LATER", "WATCH"]);

// agent-reliability-signal-service.js#RELIABILITY_SIGNAL_TYPE_VALUES (Auftrag
// Abschnitt H) – die vier vom Auftrag genannten Kategorien zuzüglich
// "SAFETY_ESCALATION" ("sicherheitsrelevante Eskalation").
const RELIABILITY_SIGNAL_TYPE_VALUES = Object.freeze([
  "UNCERTAINTY",
  "EARLY_WARNING",
  "DEVIATION",
  "NEAR_MISS",
  "SAFETY_ESCALATION",
]);

// agent-reliability-signal-service.js#RELIABILITY_SIGNAL_STATUS_VALUES –
// bewusst ohne jede Sanktions-/Autonomiereduktionsbedeutung (Auftrag
// Abschnitt H: "keine automatische Sanktion, keine automatische
// Autonomiereduktion").
const RELIABILITY_SIGNAL_STATUS_VALUES = Object.freeze(["OPEN", "REVIEWED", "MONITORING", "RESOLVED", "ESCALATED"]);

// technology-radar-service.js#RADAR_SIGNAL_TYPE_VALUES (Auftrag Abschnitt I)
// – kategorisiert NUR, woher eine Zukunftsbeobachtung stammt; behauptet
// keine konkrete Marktentwicklung.
const TECHNOLOGY_RADAR_SIGNAL_TYPE_VALUES = Object.freeze([
  "MARKET_TREND",
  "INTERNAL_NEED",
  "CUSTOMER_REQUEST",
  "COMPETITIVE_SIGNAL",
  "REGULATORY_SIGNAL",
  "OTHER",
]);

// technology-radar-service.js#RADAR_TIME_HORIZON_VALUES (Auftrag Abschnitt I).
const TECHNOLOGY_RADAR_TIME_HORIZON_VALUES = Object.freeze(["NOW", "1_2_YEARS", "3_5_YEARS", "5_PLUS_YEARS"]);

// technology-radar-service.js#RADAR_UNCERTAINTY_LEVEL_VALUES (Auftrag
// Abschnitt I).
const TECHNOLOGY_RADAR_UNCERTAINTY_LEVEL_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

// V7.5 (Auftrag Abschnitt K) – genau die neun neuen Agentenführungs-
// Ereignistypen, zusätzlich zur vollständigen, bereits bestehenden
// AUDIT_EVENT_TYPES_AT_MIGRATION_13-Menge oben. WICHTIG: eigenständige,
// additive Konstante – KEINE Änderung von AUDIT_EVENT_TYPES_AT_MIGRATION_13
// selbst (Migration 13 referenziert diese weiterhin unverändert – "Migrationen
// 1–13 unverändert", siehe Auftrag Abschnitt H). auth-audit.js#EVENT_TYPES
// muss exakt dieser Aufzählung entsprechen.
const AUDIT_EVENT_TYPES_AT_MIGRATION_14 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_13,
  "AGENT_ORGANIZATION_REVIEWED",
  "HR_DAILY_RUN_CREATED",
  "HR_PROPOSAL_REVIEWED",
  "HR_PROPOSAL_APPROVED",
  "HR_PROPOSAL_REJECTED",
  "HR_PROPOSAL_DEFERRED",
  "TECH_RADAR_ITEM_CREATED",
  "TECH_RADAR_ITEM_UPDATED",
  "AGENT_TECH_FIT_REVIEWED",
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt P) – ergänzt, solange
  // Migration 14 noch nicht committet ist (siehe Kommentar oben bei
  // AGENT_HR_PDCA_STAGE_VALUES). Fünf zusätzliche Ereignistypen, keine
  // Änderung/Löschung der bereits bestehenden neun Ereignistypen.
  "COMPANY_PRINCIPLES_REVIEWED",
  "HR_PDCA_STAGE_CHANGED",
  "RELIABILITY_SIGNAL_RECORDED",
  "RELIABILITY_SIGNAL_REVIEWED",
  "FORESIGHT_SCENARIO_REVIEWED",
]);

// ---------------------------------------------------------------------------
// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt D/F/
// I/N/R). Additive Migration 15, Migrationen 1–14 bleiben unverändert.
//
// Drei neue Tabellen, bewusst NICHT mehr (Auftrag Abschnitt R nennt
// "external_action_approvals" als MÖGLICHE, nicht als verpflichtende
// Tabelle): office_work_items besitzt bereits approvalStatus/
// executionStatus – eine vierte, separate Freigabetabelle würde denselben
// Entscheidungszustand ein zweites Mal speichern und könnte veralten
// (gleiches Leitprinzip wie bei agent-organization-service.js: "keine
// zweite Wahrheit"). Aus demselben Grund gibt es KEINE eigene
// "provider_capabilities"-Tabelle: die 33 Google-Workspace-Fähigkeiten
// (google-workspace-capability-service.js) sind statische, unveränderliche
// Referenzdaten ohne jeden mutierbaren Zustand – genau wie
// company-principles.js, das ebenfalls ohne eigene Tabelle bleibt.
//
//   1. external_identities – lokales Identitäts-/Kontenmodell (Auftrag
//      Abschnitt D), gesät mit genau drei Startidentitäten
//      (jamal@jacogbr.de/office@jacogbr.de/info@jacogbr.de, siehe
//      external-identity-service.js). KEIN Passwort-, Token-, Recovery-Code-
//      oder OAuth-Feld.
//   2. office_work_items – persistente lokale Office-Aufträge (Auftrag
//      Abschnitt I), maximal bis executionStatus='WAITING_FOR_AUTHENTICATION'
//      (per CHECK-Aufzählung UND zusätzlich per Anwendungslogik in
//      office-work-service.js gesperrt – kein "READY_FOR_PROVIDER" o. ä. in
//      V7.6.1 erreichbar).
//   3. finance_handoffs – Finance-/Controlling-Handoff-Korridor (Auftrag
//      Abschnitt N/O). executionBlocked ist per CHECK-Constraint hart auf 1
//      fixiert (CHECK (executionBlocked = 1)) – kann über KEINEN Codepfad
//      technisch auf 0 gesetzt werden, auch nicht versehentlich.
//
// Sowie eine erneute vollständige Neuerstellung von auth_audit_events mit
// der um genau neun Ereignistypen erweiterten CHECK-Aufzählung
// (AUDIT_EVENT_TYPES_AT_MIGRATION_15) – exakt dasselbe etablierte Muster
// wie Migration 7/8/9/10/11/13/14.
// ---------------------------------------------------------------------------

// external-identity-service.js#IDENTITY_TYPE_VALUES.
const EXTERNAL_IDENTITY_TYPE_VALUES = Object.freeze([
  "OWNER_PERSONAL",
  "COMPANY_OFFICE",
  "PUBLIC_INBOX",
  "DEPARTMENT_ALIAS",
  "SERVICE_IDENTITY",
]);

// external-identity-service.js#PROVIDER_VALUES – bewusst derselbe
// Wertebereichsname wie in google-workspace-capability-service.js
// verwendet (beide beantworten "welcher Anbieter"), aber getrennte
// Konstanten, weil eine Fähigkeit ausschließlich GOOGLE_WORKSPACE sein kann
// während eine Identität zusätzlich APPLE/OTHER sein darf.
const EXTERNAL_IDENTITY_PROVIDER_VALUES = Object.freeze(["GOOGLE_WORKSPACE", "APPLE", "OTHER"]);

// Gemeinsamer 8-Stufen-Berechtigungswertebereich (Auftrag Abschnitt F) –
// sowohl für external_identities.writePermissionState als auch für
// office_work_items.permissionLevelRequired verwendet, weil beide
// fachlich dieselbe Frage beantworten ("welche Berechtigungsstufe gilt
// hier?"). google-workspace-capability-service.js#recommendedInitialState
// verwendet denselben Wertebereich, bleibt dort aber rein statisch
// (keine eigene Tabelle, siehe Kopfkommentar oben).
const PROVIDER_PERMISSION_LEVEL_VALUES = Object.freeze([
  "DISCONNECTED",
  "AUTHENTICATED_NO_ACCESS",
  "READ_METADATA",
  "READ_CONTENT",
  "PREPARE_DRAFT",
  "JAMAL_APPROVED_WRITE",
  "LIMITED_AUTOMATED_WRITE",
  "BLOCKED",
]);

const EXTERNAL_IDENTITY_AUTHENTICATION_STATE_VALUES = Object.freeze([
  "NOT_AUTHENTICATED",
  "PENDING_SETUP",
  "AUTHENTICATED",
  "AUTHENTICATION_FAILED",
]);
const EXTERNAL_IDENTITY_RECOVERY_STATE_VALUES = Object.freeze(["UNKNOWN", "NOT_CONFIGURED", "CONFIGURED", "NEEDS_REVIEW"]);
const EXTERNAL_IDENTITY_TWO_FACTOR_STATE_VALUES = Object.freeze(["UNKNOWN", "DISABLED", "ENABLED", "NEEDS_REVIEW"]);

// "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION" (Auftrag: exakter
// Statuswortlaut, falls office@jacogbr.de lokal nicht nachweisbar
// eingerichtet ist – keine Annahme als Tatsache dokumentieren).
// V7.6.1 – Identitätsmodell abschließend geklärt (Nachtrag vor dem Commit):
// "USER_ACCOUNT_OR_ALIAS_UNCONFIRMED" deckt Adressen ab, bei denen lokal
// nicht feststellbar ist, ob ein vollwertiges Konto oder lediglich ein
// Alias/eine Weiterleitung vorliegt (z. B. "info@jacogbr.de") – bewusst
// keine Tatsachenbehauptung in beide Richtungen, keine externe
// Verifikation, keine zweite Identitätsarchitektur nötig.
const EXTERNAL_IDENTITY_STATUS_VALUES = Object.freeze([
  "ACTIVE",
  "PLANNED",
  "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION",
  "USER_ACCOUNT_OR_ALIAS_UNCONFIRMED",
  "INACTIVE",
]);

// office-work-service.js#OFFICE_CATEGORY_VALUES.
const OFFICE_WORK_ITEM_CATEGORY_VALUES = Object.freeze(["EMAIL", "CALENDAR", "DOCUMENT", "CONTACT", "GENERAL_OFFICE"]);

// office-work-service.js#EXTERNAL_EFFECT_VALUES – kategorisiert NUR die Art
// einer möglichen künftigen Außenwirkung, löst selbst keine Aktion aus.
const OFFICE_EXTERNAL_EFFECT_VALUES = Object.freeze([
  "NONE",
  "DIRECT_EXTERNAL_COMMUNICATION",
  "EXTERNAL_VISIBILITY_TO_INVITEES",
  "EXTERNAL_VISIBILITY_TO_RECIPIENTS",
  "DATA_LOSS_RISK",
]);

// office-work-service.js#APPROVAL_STATUS_VALUES – Jamals Entscheidungspfad
// (getrennt von executionStatus unten, das den technischen Fortschritt
// abbildet).
const OFFICE_WORK_ITEM_APPROVAL_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED_FOR_EXTERNAL_ACTION",
  "REJECTED",
  "CANCELLED",
]);

// office-work-service.js#EXECUTION_STATUS_VALUES – Auftrag Abschnitt I:
// "maximal bis WAITING_FOR_AUTHENTICATION" für V7.6.1. Die vollständige,
// bereits für später vorgesehene Aufzählung steht dennoch hier (Auftrag:
// "Statusmodell"), die Anwendungslogik in office-work-service.js verhindert
// zusätzlich jeden Übergang über WAITING_FOR_AUTHENTICATION hinaus.
const OFFICE_WORK_ITEM_EXECUTION_STATUS_VALUES = Object.freeze([
  "NOT_STARTED",
  "WAITING_FOR_AUTHENTICATION",
  "READY_FOR_PROVIDER",
  "EXECUTION_BLOCKED",
  "EXECUTED",
  "FAILED",
  "CANCELLED",
]);

const DATA_SENSITIVITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

// finance-handoff-service.js#FINANCE_HANDOFF_TYPE_VALUES (Auftrag Abschnitt O).
const FINANCE_HANDOFF_TYPE_VALUES = Object.freeze([
  "RECEIPT_REVIEW",
  "INVOICE_DRAFT",
  "PAYMENT_PROPOSAL",
  "COST_CLASSIFICATION",
  "ADVISOR_HANDOFF",
  "MONTHLY_OVERVIEW",
  "LIQUIDITY_NOTE",
]);

const FINANCE_TAX_RELEVANCE_VALUES = Object.freeze(["UNKNOWN", "RELEVANT", "NOT_RELEVANT"]);
const FINANCE_CONFIDENCE_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

// finance-handoff-service.js#APPROVAL_STATUS_VALUES – bildet Auftrag
// Abschnitt N "Finance-Status" (CAPABILITY_GAP/PREPARATION_ONLY/
// SPECIALIST_REVIEW_REQUIRED/JAMAL_APPROVAL_REQUIRED) UND den zusätzlichen
// Prüf-/Entscheidungsablauf je Handoff in einem einzigen Wertebereich ab.
// "CAPABILITY_GAP" selbst ist bewusst KEIN Zeilenstatus (das bleibt eine
// Eigenschaft der gesamten Finance-/Controlling-Gruppe, siehe
// agent-organization-service.js#CAPABILITY_GAP – keine zweite Wahrheit).
const FINANCE_HANDOFF_APPROVAL_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "REVIEWED",
  "SPECIALIST_REVIEW_REQUIRED",
  "JAMAL_APPROVAL_REQUIRED",
  "JAMAL_DECIDED",
  "CANCELLED",
]);

// V7.6.1 (Auftrag Abschnitt T): genau neun zusätzliche Ereignistypen,
// zusätzlich zur vollständigen, bereits bestehenden
// AUDIT_EVENT_TYPES_AT_MIGRATION_14-Menge oben. auth-audit.js#EVENT_TYPES
// muss exakt dieser Aufzählung entsprechen.
const AUDIT_EVENT_TYPES_AT_MIGRATION_15 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_14,
  "EXTERNAL_IDENTITY_REVIEWED",
  "PROVIDER_CAPABILITY_REVIEWED",
  "OFFICE_WORK_ITEM_CREATED",
  "OFFICE_WORK_ITEM_REVIEWED",
  "OFFICE_EXTERNAL_ACTION_APPROVED",
  "OFFICE_AUTHENTICATION_REQUIRED",
  "FINANCE_HANDOFF_CREATED",
  "FINANCE_HANDOFF_REVIEWED",
  "FINANCE_SPECIALIST_REQUIRED",
]);

// V7.6.3 (Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf
// verankern) – additive Governance-/Nachweistabellen für GENAU EINEN
// kanonischen Referenzlauf. Keine zweite Projektlaufarchitektur: dieses
// Modul kennt weder Guided Work noch Jamal-Arbeitsmodus, sondern ergänzt
// ausschließlich das bereits bestehende Migrations-/Audit-/Agentenmuster um
// einen einzigen, eng begrenzten Anwendungsfall (siehe
// health-reference-work-run-service.js#Kopfkommentar).
const HEALTH_REFERENCE_RUN_STATUS_VALUES = Object.freeze([
  "PREPARED_FOR_EXECUTION",
  "WAITING_FOR_JAMAL_APPROVAL",
  "APPROVED_FOR_EXECUTION",
  "IN_EXECUTION",
  "RESULT_SUBMITTED",
  "QA_REVIEW",
  "CHANGES_REQUESTED",
  "WAITING_FOR_FINAL_ACCEPTANCE",
  "REFERENCE_READY",
  "BLOCKED",
  "CANCELLED",
]);

const HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES = Object.freeze([
  "HEALTH_BASELINE_CONFIRMATION",
  "START_GATE_AND_ENTRY",
  "SIX_ANSWERS_AND_RESULT",
  "ADVISOR_HANDOFF_AND_CUSTOMER_AREA",
  "PERSISTENCE_PRIVACY_AND_LEGAL_BOUNDARIES",
  "REFERENCE_WALKTHROUGH_AND_QA",
  "JAMAL_FINAL_ACCEPTANCE",
]);

// V7.6.4 – einzelne Arbeitspakete korrekt abschließen (Auftrag Abschnitt 2):
// eigenständiger, rein additiver Statuswertebereich AUSSCHLIESSLICH für
// health_reference_work_packages.status. `COMPLETED` bedeutet ausdrücklich
// "dieses eine Arbeitspaket ist fachlich abgeschlossen" – NICHT
// "gesamter Lauf abgeschlossen" und NICHT `REFERENCE_READY`. Bewusst KEIN
// paralleles Statusmodell: identisch mit HEALTH_REFERENCE_RUN_STATUS_VALUES
// plus genau einem zusätzlichen Wert. health_reference_runs.status bleibt
// unverändert bei HEALTH_REFERENCE_RUN_STATUS_VALUES (ein Lauf wird niemals
// `COMPLETED`, sondern ausschließlich über recordFinalAcceptance
// `REFERENCE_READY`).
const HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES = Object.freeze([
  ...HEALTH_REFERENCE_RUN_STATUS_VALUES,
  "COMPLETED",
]);

const HEALTH_REFERENCE_APPROVAL_KEY_VALUES = Object.freeze([
  "SCOPE",
  "EXECUTABLE_WORK_ORDER",
  "SCOPE_EXTENSION",
  "LEGAL_PRIVACY_WORDING",
  "PRE_COMMIT",
  "PRE_PUSH",
  "FINAL_REFERENCE_ACCEPTANCE",
]);

const HEALTH_REFERENCE_APPROVAL_DECISION_VALUES = Object.freeze(["PENDING", "APPROVED", "REJECTED"]);

const HEALTH_REFERENCE_RESULT_KIND_VALUES = Object.freeze([
  "RESULT_REPORT",
  "QA_FINDING",
  "CHANGE_REQUEST_NOTE",
  "FINAL_ACCEPTANCE_NOTE",
]);

// Genau neun zusätzliche Ereignistypen (Auftrag Abschnitt 12), zusätzlich zur
// vollständigen, bereits bestehenden AUDIT_EVENT_TYPES_AT_MIGRATION_15-Menge
// oben. auth-audit.js#EVENT_TYPES muss exakt dieser Aufzählung entsprechen.
const AUDIT_EVENT_TYPES_AT_MIGRATION_16 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_15,
  "HEALTH_REFERENCE_RUN_CREATED",
  "HEALTH_REFERENCE_WORK_PACKAGE_PREPARED",
  "HEALTH_REFERENCE_PROMPT_DRAFT_CREATED",
  "HEALTH_REFERENCE_APPROVAL_RECORDED",
  "HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED",
  "HEALTH_REFERENCE_QA_FINDING_RECORDED",
  "HEALTH_REFERENCE_CHANGES_REQUESTED",
  "HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED",
  "HEALTH_REFERENCE_REFERENCE_READY_GRANTED",
]);

// V7.6.4 – genau ein zusätzlicher Ereignistyp (Auftrag Abschnitt 4),
// zusätzlich zur vollständigen, bereits bestehenden
// AUDIT_EVENT_TYPES_AT_MIGRATION_16-Menge oben. auth-audit.js#EVENT_TYPES
// muss exakt dieser Aufzählung entsprechen. Deckt jeden Statusübergang
// eines Arbeitspakets ab (Freigabe, Ausführung gestartet, Ergebnis
// eingereicht, QA-Ergebnis, Paket abgeschlossen, Änderung angefordert,
// blockiert, abgebrochen) – zusätzlich zu den bereits bestehenden,
// spezifischeren Ereignistypen, niemals als Ersatz dafür.
const AUDIT_EVENT_TYPES_AT_MIGRATION_17 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_16,
  "HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED",
]);

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Drei-Agenten-
// Pilot (Projektmanager-/Recherche-Analyse-/Dokumentations-Agent). Genau
// EIN kanonischer Pilotauftrag (gleiches Architekturmuster wie
// health-reference-work-run-service.js: additive, eng begrenzte
// Governance-Tabellen statt einer zweiten generischen Arbeitsauftrags-
// Architektur). Siehe pilot-work-order-service.js#Kopfkommentar.
const PILOT_WORK_ORDER_STATUS_VALUES = Object.freeze([
  "DRAFT",
  "READY_FOR_JAMAL_APPROVAL",
  "APPROVED_FOR_EXECUTION",
  "IN_EXECUTION",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "RETURNED",
  "BLOCKED",
]);

const PILOT_ROLE_VALUES = Object.freeze(["PROJEKTMANAGER", "RECHERCHE_ANALYSE", "DOKUMENTATION"]);
const PILOT_HANDOFF_FROM_VALUES = Object.freeze(["JAMAL", ...PILOT_ROLE_VALUES]);
const PILOT_PM_FILTER_STATUS_VALUES = Object.freeze(["PENDING", "PASSED", "REJECTED"]);
// Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): Status eines einzelnen,
// technisch tatsächlich ausgeführten Agentenlaufs (pilot_agent_execution_runs).
// Bewusst getrennt von PILOT_WORK_ORDER_STATUS_VALUES – ein Agentenlauf ist
// eine technische Ausführungseinheit, kein fachlicher Auftragsstatus. Genau
// drei Werte: RUNNING (unmittelbar nach Anlage, dient zugleich als
// Nebenläufigkeitssperre über den partiellen Unique-Index unten),
// SUCCEEDED und FAILED (beide terminal, siehe updatePilotAgentExecutionRunTerminal).
const PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES = Object.freeze(["RUNNING", "SUCCEEDED", "FAILED"]);

// Korrekturlauf vor Commit (Trennung von technischem Runner-Abschluss und
// fachlicher Rollenübergabe, Migration 21): Status der Stufe B
// (Handoff-Versuch) eines bereits SUCCEEDED Agentenlaufs – bewusst getrennt
// vom Runstatus selbst. PENDING (Ausgangswert, Stufe B noch nicht versucht
// oder Lauf nicht SUCCEEDED), SUCCEEDED (Handoff tatsächlich angelegt und
// vom Projektmanager-Filter geprüft) und FAILED (Stufe B ist gescheitert,
// z. B. weil sich der Pilotauftragsstatus während des Runs geändert hat –
// das bereits gespeicherte SUCCEEDED-Ergebnis bleibt davon unberührt).
const PILOT_AGENT_EXECUTION_HANDOFF_STATUS_VALUES = Object.freeze(["PENDING", "SUCCEEDED", "FAILED"]);

// Genau acht zusätzliche Ereignistypen, zusätzlich zur vollständigen,
// bereits bestehenden AUDIT_EVENT_TYPES_AT_MIGRATION_17-Menge oben.
// auth-audit.js#EVENT_TYPES muss exakt dieser Aufzählung entsprechen.
const AUDIT_EVENT_TYPES_AT_MIGRATION_18 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_17,
  "PILOT_WORK_ORDER_CREATED",
  "PILOT_WORK_ORDER_STATUS_CHANGED",
  "PILOT_HANDOFF_SUBMITTED",
  "PILOT_HANDOFF_ACCEPTED_BY_PM_FILTER",
  "PILOT_HANDOFF_REJECTED_BY_PM_FILTER",
  "PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION",
  "PILOT_EXECUTION_APPROVAL_RECORDED",
  "PILOT_COMPLETION_APPROVAL_RECORDED",
]);

// Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): genau drei zusätzliche
// Ereignistypen, zusätzlich zur vollständigen, bereits bestehenden
// AUDIT_EVENT_TYPES_AT_MIGRATION_18-Menge oben. auth-audit.js#EVENT_TYPES
// muss exakt dieser Aufzählung entsprechen. Deckt Start, erfolgreichen
// Abschluss und Fehlschlag eines einzelnen technischen Agentenlaufs ab –
// unabhängig von den bereits bestehenden PILOT_HANDOFF_*-Ereignissen, die
// weiterhin ausschließlich die fachliche Rollenübergabe selbst auditieren.
const AUDIT_EVENT_TYPES_AT_MIGRATION_20 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_18,
  "PILOT_AGENT_EXECUTION_RUN_STARTED",
  "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED",
  "PILOT_AGENT_EXECUTION_RUN_FAILED",
]);

// Korrekturlauf vor Commit (Migration 21): genau EIN zusätzlicher
// Ereignistyp, zusätzlich zur vollständigen, bereits bestehenden
// AUDIT_EVENT_TYPES_AT_MIGRATION_20-Menge oben. auth-audit.js#EVENT_TYPES
// muss exakt dieser Aufzählung entsprechen. Deckt ausschließlich das
// Scheitern der fachlichen Rollenübergabe (Stufe B) nach einem bereits
// technisch erfolgreichen Agentenlauf ab – niemals einen Runner-Fehler
// (dafür bleibt PILOT_AGENT_EXECUTION_RUN_FAILED zuständig).
const AUDIT_EVENT_TYPES_AT_MIGRATION_21 = Object.freeze([
  ...AUDIT_EVENT_TYPES_AT_MIGRATION_20,
  "PILOT_AGENT_EXECUTION_RUN_HANDOFF_FAILED",
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
  // V7.3 Persistenznachtrag (Auftrag Abschnitt C) – der Jamal-Arbeitsmodus
  // (jamal-work-mode.js/jamal-work-mode-store.js) lebte bisher ausschließlich
  // in einer Prozessspeichervariable von server.js und ging bei jedem
  // Serverneustart verloren (echter Betriebsblocker für den täglichen
  // Arbeitsmodus). Additive Migration, KEINE Änderung an Migration 1–11.
  //
  // Zwei neue Tabellen, gleiche Technik wie Migration 8/9/10/11:
  // (a) jamal_work_items – genau EIN fachlicher Arbeitswunsch-Datensatz pro
  // Zeile, fortlaufend per UPDATE aktualisiert während sein Status noch
  // nicht abgeschlossen ist (kein Owner-/Mandantenbezug, ausschließlich
  // Jamal selbst – siehe route-access-policy.js#OWNER_ONLY). Ein neuer
  // Arbeitswunsch (jamal-work-mode.js#startNewItem) legt IMMER eine neue
  // Zeile mit neuer id an; ältere, bereits abgeschlossene Zeilen werden
  // NIE gelöscht, sondern bleiben unverändert als Historie stehen – "der
  // aktuelle Arbeitswunsch" ist für jamal-work-mode-store.js schlicht die
  // zuletzt angelegte Zeile (ORDER BY createdAt DESC). (b) jamal_work_results
  // – unveränderliche, append-only Ergebnisversion je Arbeitswunsch,
  // exakt gleiches Trigger-Muster wie work_order_results (Migration 10):
  // kein UPDATE, kein DELETE, fortlaufende versionNumber pro workItemId.
  //
  // Bewusst KEINE Erweiterung von auth_audit_events: der Jamal-Arbeitsmodus
  // schreibt bislang (V7.3, siehe server.js) keine Auditereignisse – diese
  // Migration führt dafür keine neue Protokollierung ein, sondern
  // ausschließlich die beiden fachlichen Tabellen selbst.
  //
  // Spaltenbenennung bewusst weiterhin camelCase (identisches Muster wie
  // ALLE bisherigen Tabellen dieser Datenbank, z. B. workOrderId/
  // versionNumber/resultTitle) – nicht die im Auftrag beispielhaft in
  // snake_case genannten Feldnamen (project_id, desired_result, ...),
  // damit die Datenbank durchgehend eine einzige Namenskonvention behält.
  // Fachlich entsprechen sich: projectId=project_id,
  // desiredOutcome=desired_result, importantNotes=important_notes,
  // preferredTiming=desired_timing, clarifyingQuestionJson=
  // clarification_question, selectedAgentsJson=selected_agents_json,
  // workPlanJson=work_plan_json, completedAt=completed_at (siehe
  // jamal-work-mode-store.js für die vollständige Feldabbildung).
  Object.freeze({
    version: 12,
    name: "create_jamal_work_items_and_results",
    sql: `
      CREATE TABLE jamal_work_items (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        projectDisplayName TEXT,
        projectSource TEXT CHECK (projectSource IS NULL OR projectSource IN (${sqlEnum(JAMAL_WORK_ITEM_PROJECT_SOURCE_VALUES)})),
        desiredOutcome TEXT NOT NULL,
        importantNotes TEXT NOT NULL DEFAULT '',
        preferredTiming TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(JAMAL_WORK_ITEM_STATUS_VALUES)})),
        clarifyingQuestionJson TEXT,
        selectedAgentsJson TEXT,
        workPlanJson TEXT,
        safetyDecisionJson TEXT,
        qualityStatus TEXT CHECK (qualityStatus IS NULL OR qualityStatus IN (${sqlEnum(WORK_ORDER_RESULT_QUALITY_STATUS_VALUES)})),
        qualityNote TEXT,
        decision TEXT CHECK (decision IS NULL OR decision IN (${sqlEnum(JAMAL_WORK_ITEM_DECISION_VALUES)})),
        decidedAt TEXT,
        doneAt TEXT,
        stoppedAt TEXT,
        postponedAt TEXT,
        stopReason TEXT,
        pendingChangeText TEXT,
        escalationJson TEXT,
        lastUsedProjectId TEXT,
        lastUsedProjectDisplayName TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        completedAt TEXT
      );

      CREATE INDEX idx_jamal_work_items_createdAt ON jamal_work_items(createdAt);
      CREATE INDEX idx_jamal_work_items_status ON jamal_work_items(status);

      CREATE TABLE jamal_work_results (
        id TEXT PRIMARY KEY,
        workItemId TEXT NOT NULL,
        versionNumber INTEGER NOT NULL CHECK (versionNumber >= 1),
        resultTitle TEXT NOT NULL CHECK (length(resultTitle) BETWEEN 1 AND 200),
        resultSummary TEXT NOT NULL CHECK (length(resultSummary) BETWEEN 1 AND 1000),
        resultBody TEXT NOT NULL CHECK (length(resultBody) BETWEEN 1 AND 40000),
        qualityStatus TEXT NOT NULL CHECK (qualityStatus IN (${sqlEnum(WORK_ORDER_RESULT_QUALITY_STATUS_VALUES)})),
        qualityNote TEXT,
        openPointsJson TEXT,
        agentsInvolvedJson TEXT NOT NULL,
        triggerType TEXT NOT NULL CHECK (triggerType IN (${sqlEnum(JAMAL_WORK_RESULT_TRIGGER_VALUES)})),
        changeRequestText TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (workItemId) REFERENCES jamal_work_items(id) ON DELETE RESTRICT,
        UNIQUE (workItemId, versionNumber)
      );

      CREATE INDEX idx_jamal_work_results_workItemId ON jamal_work_results(workItemId);

      CREATE TRIGGER trg_jamal_work_results_no_update
      BEFORE UPDATE ON jamal_work_results
      BEGIN
        SELECT RAISE(ABORT, 'jamal_work_results ist append-only/unveränderlich: UPDATE ist nicht erlaubt.');
      END;

      CREATE TRIGGER trg_jamal_work_results_no_delete
      BEFORE DELETE ON jamal_work_results
      BEGIN
        SELECT RAISE(ABORT, 'jamal_work_results ist append-only/unveränderlich: DELETE ist nicht erlaubt.');
      END;
    `,
  }),
  // V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
  // (Auftrag Abschnitt G/N). Rein additiv gegenüber Migration 12:
  //   1. eine neue Tabelle jamal_canva_productions (eine Zeile je
  //      Briefingrevision; alte Revisionen bleiben unverändert erhalten,
  //      siehe UNIQUE(workItemId, revisionNumber) – kein stilles
  //      Überschreiben einer bereits bestehenden Revision).
  //   2. eine erneute vollständige Neuerstellung von auth_audit_events mit
  //      der um genau zehn Canva-Ereignistypen erweiterten CHECK-Aufzählung
  //      (AUDIT_EVENT_TYPES_AT_MIGRATION_13, siehe Kommentar oben) – exakt
  //      dasselbe etablierte Muster wie Migration 7/8/9/10/11.
  // Migrationen 1–12 bleiben dabei byteidentisch unverändert.
  //
  // Bewusst KEIN Feld für Zugangsschlüssel oder Providergeheimhaltungsdaten,
  // KEINE Veröffentlichungstabelle (Auftrag Abschnitt G):
  // jamal_canva_productions speichert ausschließlich interne Referenzen,
  // Status, Briefinginhalt (kein interner KI-Anweisungstext, keine
  // Gedankenkette – dasselbe Prinzip wie jamal_work_items), Rechte-/
  // Consent-Status und sicher validierte Design-Links (siehe
  // canva-design-result.js#validateResultReferenceUrl, wiederverwendet von
  // jamal-canva-production-service.js).
  Object.freeze({
    version: 13,
    name: "create_jamal_canva_productions_and_widen_audit_event_types_v6",
    sql: `
      CREATE TABLE jamal_canva_productions (
        id TEXT PRIMARY KEY,
        workItemId TEXT NOT NULL,
        revisionNumber INTEGER NOT NULL CHECK (revisionNumber >= 1),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(JAMAL_CANVA_PRODUCTION_STATUS_VALUES)})),
        suitabilityDecision TEXT CHECK (suitabilityDecision IS NULL OR suitabilityDecision IN (${sqlEnum(JAMAL_CANVA_SUITABILITY_DECISION_VALUES)})),
        suitabilityJson TEXT,
        briefingJson TEXT,
        rightsStatus TEXT CHECK (rightsStatus IS NULL OR rightsStatus IN (${sqlEnum(JAMAL_CANVA_RIGHTS_STATUS_VALUES)})),
        rightsJson TEXT,
        reviewMode TEXT NOT NULL DEFAULT 'OWNER_REVIEW',
        changeRequestText TEXT,
        approvedAt TEXT,
        approvedByUserId TEXT,
        handoffStartedAt TEXT,
        canvaJobId TEXT,
        canvaDesignId TEXT,
        designTitle TEXT,
        editLink TEXT,
        viewLink TEXT,
        providerStatus TEXT,
        errorCode TEXT,
        resultReceivedAt TEXT,
        qualityStatus TEXT CHECK (qualityStatus IS NULL OR qualityStatus IN (${sqlEnum(JAMAL_CANVA_QUALITY_STATUS_VALUES)})),
        qualityNotesJson TEXT,
        cancelledAt TEXT,
        cancelReason TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (workItemId) REFERENCES jamal_work_items(id) ON DELETE RESTRICT,
        UNIQUE (workItemId, revisionNumber)
      );

      CREATE INDEX idx_jamal_canva_productions_workItemId ON jamal_canva_productions(workItemId);
      CREATE INDEX idx_jamal_canva_productions_status ON jamal_canva_productions(status);

      CREATE TABLE auth_audit_events_v7 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_13)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v7 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v7 RENAME TO auth_audit_events;

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
    `,
  }),
  // V7.5 – Agentenorganisation, tägliches HR-Coaching und
  // Technologie-/Plugin-Marktradar (Auftrag Abschnitt H/N). Rein additiv
  // gegenüber Migration 13:
  //   1. agent_hr_daily_runs (eine Zeile je Kalendertag, runDate UNIQUE
  //      erzwingt "höchstens ein aktiver Vorschlagssatz pro Kalendertag"
  //      bereits auf Datenbankebene).
  //   2. agent_hr_daily_proposals (eine Zeile je Agent und Lauf,
  //      UNIQUE(runId, agentId) erzwingt "genau ein Vorschlag je Agent und
  //      Lauf"; die inhaltlichen Vorschlagsfelder werden nach dem Anlegen
  //      nie mehr verändert – ausschließlich status/jamalNote/reviewedAt
  //      werden bei einer Prüfung aktualisiert, siehe
  //      agent-hr-coaching-service.js).
  //   3. technology_radar_items (ein Eintrag je Technologie/Werkzeug;
  //      seedToolId verweist optional auf tool-registry.js#TOOL_REGISTRY,
  //      ohne dessen statischen Katalog zu duplizieren oder zu verändern –
  //      reine zusätzliche Bewertungsschicht).
  //   4. agent_technology_fit (kontrollierte Zuordnung Radar-Eintrag <->
  //      Agent, UNIQUE(agentId, radarItemId) verhindert doppelte
  //      Zuordnungen für dasselbe Paar).
  //   5. agent_reliability_signals (Auftrag Abschnitt H, nachträglich vor dem
  //      ersten Commit ergänzt – "Unternehmensleitlinien V1.0"): lokal
  //      erfassbare Hochzuverlässigkeitssignale mit optionalem Bezug zu genau
  //      einem HR-Vorschlag ODER einem Radar-Eintrag. Eigene Tabelle statt
  //      Wiederverwendung von agent_hr_daily_proposals, weil ein Signal auch
  //      ohne jeden HR-Vorschlagsbezug entstehen kann (z. B. reiner
  //      Radar-Bezug) und einen eigenen, von PROPOSED/REVIEWED/... völlig
  //      unabhängigen Status-/Entscheidungsverlauf besitzt.
  //   6. agent_hr_daily_proposals/technology_radar_items erhalten zusätzliche,
  //      rein additive Spalten für die Unternehmensleitlinien V1.0 (Auftrag
  //      Abschnitt E/I/J/L: observation/businessMeaning/desiredOutcome/
  //      priorityReason/pdcaStage/pdcaDecision/pdcaStageChangedAt/
  //      reliabilitySignal/benefitArea/priorityBucket/nextReviewDate bzw.
  //      signalType/signalDescription/timeHorizon/uncertaintyLevel/
  //      scenarioConservative/scenarioLikely/scenarioDynamic/
  //      strategicImpact/todayPreparationStep/benefitArea/priorityBucket).
  //      Bewusst DIREKT in den untenstehenden CREATE-TABLE-Anweisungen
  //      ergänzt statt einer Migration 15, weil Migration 14 zu diesem
  //      Zeitpunkt noch nicht committet war (Auftrag Abschnitt O).
  //   7. eine erneute vollständige Neuerstellung von auth_audit_events mit
  //      der um genau neun Ereignistypen erweiterten CHECK-Aufzählung
  //      (AUDIT_EVENT_TYPES_AT_MIGRATION_14, siehe Kommentar oben) – exakt
  //      dasselbe etablierte Muster wie Migration 7/8/9/10/11/13.
  // Migrationen 1–13 bleiben dabei byteidentisch unverändert.
  //
  // Bewusst KEINE eigene Tabelle für die Agentenorganisation selbst
  // (kein "agent_organization_profiles"): die Organisationssicht ist eine
  // vollständig deterministische Ableitung aus dem bereits bestehenden,
  // eingefrorenen agent-registry.js (siehe
  // agent-organization-service.js#buildOrganizationOverview) – eine
  // zusätzliche Tabelle würde denselben Agentenbestand ein zweites Mal
  // speichern und könnte veralten ("keine zweite Agentenliste", Auftrag
  // Leitprinzipien). AGENT_ORGANIZATION_REVIEWED protokolliert lediglich,
  // DASS Jamal die Organisationsübersicht abgerufen hat, nicht ihren
  // Inhalt erneut.
  //
  // Bewusst KEINE Felder für Zugangsschlüssel, Providergeheimhaltungsdaten
  // oder eine tatsächliche Autonomieänderung (Auftrag Abschnitt H): weder
  // agent_hr_daily_proposals noch agent_technology_fit besitzen ein Feld,
  // das den tatsächlichen Autonomierahmen eines Agenten verändern könnte –
  // "hrRecommendation"/"recommendation" bleiben ausschließlich Vorschläge
  // (siehe agent-hr-coaching-service.js/technology-radar-service.js).
  Object.freeze({
    version: 14,
    name: "create_agent_leadership_tables_and_widen_audit_event_types_v8",
    sql: `
      CREATE TABLE agent_hr_daily_runs (
        id TEXT PRIMARY KEY,
        runDate TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX idx_agent_hr_daily_runs_runDate ON agent_hr_daily_runs(runDate);

      CREATE TABLE agent_hr_daily_proposals (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL,
        agentId TEXT NOT NULL,
        runDate TEXT NOT NULL,
        improvementSuggestion TEXT NOT NULL CHECK (length(improvementSuggestion) BETWEEN 1 AND 500),
        trainingGoal TEXT NOT NULL CHECK (length(trainingGoal) BETWEEN 1 AND 500),
        concreteExercise TEXT NOT NULL CHECK (length(concreteExercise) BETWEEN 1 AND 500),
        qualityCriterion TEXT NOT NULL CHECK (length(qualityCriterion) BETWEEN 1 AND 500),
        possibleAutonomyExpansion TEXT NOT NULL CHECK (length(possibleAutonomyExpansion) BETWEEN 1 AND 500),
        riskBoundary TEXT NOT NULL CHECK (length(riskBoundary) BETWEEN 1 AND 500),
        requiredJamalDecision TEXT NOT NULL CHECK (length(requiredJamalDecision) BETWEEN 1 AND 500),
        hrRecommendation TEXT NOT NULL CHECK (hrRecommendation IN (${sqlEnum(AGENT_HR_RECOMMENDATION_VALUES)})),
        reasoning TEXT NOT NULL CHECK (length(reasoning) BETWEEN 1 AND 500),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(AGENT_HR_PROPOSAL_STATUS_VALUES)})),
        jamalNote TEXT,
        createdAt TEXT NOT NULL,
        reviewedAt TEXT,
        -- Unternehmensleitlinien V1.0 (Auftrag Abschnitt E) – additive
        -- Spalten. "onePercentStep"/"trainingExercise"/"successMetric"/
        -- "safetyBoundary"/"ownership" aus Abschnitt E werden bewusst NICHT
        -- doppelt gespeichert: sie sind identisch mit improvementSuggestion/
        -- concreteExercise/qualityCriterion/riskBoundary/agentId (siehe
        -- agent-hr-coaching-service.js#rowToProposalView). "communicationPattern"
        -- wird ausschließlich zur Lesezeit aus observation/businessMeaning/
        -- hrRecommendation/requiredJamalDecision zusammengesetzt (Auftrag
        -- Abschnitt E Ziffer 11) – ebenfalls keine eigene Spalte.
        observation TEXT NOT NULL CHECK (length(observation) BETWEEN 1 AND 500),
        businessMeaning TEXT NOT NULL CHECK (length(businessMeaning) BETWEEN 1 AND 500),
        desiredOutcome TEXT NOT NULL CHECK (length(desiredOutcome) BETWEEN 1 AND 500),
        priorityReason TEXT NOT NULL CHECK (length(priorityReason) BETWEEN 1 AND 500),
        benefitArea TEXT NOT NULL CHECK (benefitArea IN (${sqlEnum(LEADERSHIP_BENEFIT_AREA_VALUES)})),
        priorityBucket TEXT NOT NULL CHECK (priorityBucket IN (${sqlEnum(LEADERSHIP_PRIORITY_BUCKET_VALUES)})),
        nextReviewDate TEXT NOT NULL,
        pdcaStage TEXT NOT NULL DEFAULT 'PLAN' CHECK (pdcaStage IN (${sqlEnum(AGENT_HR_PDCA_STAGE_VALUES)})),
        pdcaDecision TEXT CHECK (pdcaDecision IS NULL OR pdcaDecision IN (${sqlEnum(AGENT_HR_PDCA_DECISION_VALUES)})),
        pdcaStageChangedAt TEXT,
        reliabilitySignal TEXT NOT NULL DEFAULT 'NONE' CHECK (reliabilitySignal IN (${sqlEnum(AGENT_HR_RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES)})),
        FOREIGN KEY (runId) REFERENCES agent_hr_daily_runs(id) ON DELETE RESTRICT,
        UNIQUE (runId, agentId)
      );

      CREATE INDEX idx_agent_hr_daily_proposals_runId ON agent_hr_daily_proposals(runId);
      CREATE INDEX idx_agent_hr_daily_proposals_agentId ON agent_hr_daily_proposals(agentId);
      CREATE INDEX idx_agent_hr_daily_proposals_status ON agent_hr_daily_proposals(status);

      CREATE TABLE technology_radar_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
        provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 200),
        category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 200),
        type TEXT NOT NULL CHECK (type IN (${sqlEnum(TECHNOLOGY_RADAR_TYPE_VALUES)})),
        shortDescription TEXT NOT NULL CHECK (length(shortDescription) BETWEEN 1 AND 500),
        possibleAgentsJson TEXT NOT NULL,
        possibleBusinessBenefit TEXT NOT NULL CHECK (length(possibleBusinessBenefit) BETWEEN 1 AND 500),
        maturityLevel TEXT NOT NULL,
        securityRisk TEXT NOT NULL,
        privacyRisk TEXT NOT NULL,
        costClass TEXT NOT NULL,
        integrationEffort TEXT NOT NULL,
        vendorLockInRisk TEXT NOT NULL,
        writeAccessRequired INTEGER NOT NULL CHECK (writeAccessRequired IN (0,1)),
        humanApprovalRequired INTEGER NOT NULL CHECK (humanApprovalRequired IN (0,1)),
        recommendation TEXT NOT NULL CHECK (recommendation IN (${sqlEnum(TECHNOLOGY_RADAR_RECOMMENDATION_VALUES)})),
        reasoning TEXT NOT NULL CHECK (length(reasoning) BETWEEN 1 AND 500),
        lastReviewedAt TEXT,
        nextReviewAt TEXT,
        sourceNote TEXT,
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(TECHNOLOGY_RADAR_STATUS_VALUES)})),
        seedToolId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        -- Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L) – additive
        -- Zukunfts-/Szenario- und Nutzenspalten. "nextReviewDate" aus
        -- Abschnitt I ist bewusst identisch mit dem bereits bestehenden
        -- nextReviewAt (keine doppelte Speicherung derselben Angabe).
        signalType TEXT NOT NULL DEFAULT 'OTHER' CHECK (signalType IN (${sqlEnum(TECHNOLOGY_RADAR_SIGNAL_TYPE_VALUES)})),
        signalDescription TEXT NOT NULL CHECK (length(signalDescription) BETWEEN 1 AND 500),
        timeHorizon TEXT NOT NULL DEFAULT 'NOW' CHECK (timeHorizon IN (${sqlEnum(TECHNOLOGY_RADAR_TIME_HORIZON_VALUES)})),
        uncertaintyLevel TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (uncertaintyLevel IN (${sqlEnum(TECHNOLOGY_RADAR_UNCERTAINTY_LEVEL_VALUES)})),
        scenarioConservative TEXT NOT NULL CHECK (length(scenarioConservative) BETWEEN 1 AND 500),
        scenarioLikely TEXT NOT NULL CHECK (length(scenarioLikely) BETWEEN 1 AND 500),
        scenarioDynamic TEXT NOT NULL CHECK (length(scenarioDynamic) BETWEEN 1 AND 500),
        strategicImpact TEXT NOT NULL CHECK (length(strategicImpact) BETWEEN 1 AND 500),
        todayPreparationStep TEXT NOT NULL CHECK (length(todayPreparationStep) BETWEEN 1 AND 500),
        benefitArea TEXT NOT NULL CHECK (benefitArea IN (${sqlEnum(LEADERSHIP_BENEFIT_AREA_VALUES)})),
        priorityBucket TEXT NOT NULL DEFAULT 'WATCH' CHECK (priorityBucket IN (${sqlEnum(LEADERSHIP_PRIORITY_BUCKET_VALUES)})),
        UNIQUE (seedToolId)
      );

      CREATE INDEX idx_technology_radar_items_status ON technology_radar_items(status);
      CREATE INDEX idx_technology_radar_items_type ON technology_radar_items(type);

      CREATE TABLE agent_technology_fit (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        radarItemId TEXT NOT NULL,
        benefit TEXT NOT NULL CHECK (length(benefit) BETWEEN 1 AND 500),
        concreteUseCase TEXT NOT NULL CHECK (length(concreteUseCase) BETWEEN 1 AND 500),
        requiredPermissions TEXT NOT NULL CHECK (length(requiredPermissions) BETWEEN 1 AND 500),
        securityBoundary TEXT NOT NULL CHECK (length(securityBoundary) BETWEEN 1 AND 500),
        testPrerequisite TEXT NOT NULL CHECK (length(testPrerequisite) BETWEEN 1 AND 500),
        recommendation TEXT NOT NULL CHECK (recommendation IN (${sqlEnum(TECHNOLOGY_RADAR_RECOMMENDATION_VALUES)})),
        priority TEXT NOT NULL CHECK (priority IN (${sqlEnum(AGENT_TECHNOLOGY_FIT_PRIORITY_VALUES)})),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(AGENT_TECHNOLOGY_FIT_STATUS_VALUES)})),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (radarItemId) REFERENCES technology_radar_items(id) ON DELETE RESTRICT,
        UNIQUE (agentId, radarItemId)
      );

      CREATE TABLE agent_reliability_signals (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        relatedHrProposalId TEXT,
        relatedRadarItemId TEXT,
        signalType TEXT NOT NULL CHECK (signalType IN (${sqlEnum(RELIABILITY_SIGNAL_TYPE_VALUES)})),
        observation TEXT NOT NULL CHECK (length(observation) BETWEEN 1 AND 500),
        possibleImpact TEXT NOT NULL CHECK (length(possibleImpact) BETWEEN 1 AND 500),
        recommendedReview TEXT NOT NULL CHECK (length(recommendedReview) BETWEEN 1 AND 500),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(RELIABILITY_SIGNAL_STATUS_VALUES)})),
        jamalDecisionNote TEXT,
        createdAt TEXT NOT NULL,
        reviewedAt TEXT,
        FOREIGN KEY (relatedHrProposalId) REFERENCES agent_hr_daily_proposals(id) ON DELETE SET NULL,
        FOREIGN KEY (relatedRadarItemId) REFERENCES technology_radar_items(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_agent_reliability_signals_agentId ON agent_reliability_signals(agentId);
      CREATE INDEX idx_agent_reliability_signals_status ON agent_reliability_signals(status);

      CREATE INDEX idx_agent_technology_fit_agentId ON agent_technology_fit(agentId);
      CREATE INDEX idx_agent_technology_fit_radarItemId ON agent_technology_fit(radarItemId);

      CREATE TABLE auth_audit_events_v8 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_14)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v8 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v8 RENAME TO auth_audit_events;

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
    `,
  }),
  // V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
  // Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt D/I/
  // N/R). Rein additiv gegenüber Migration 14: drei neue Tabellen (siehe
  // ausführlichen Kopfkommentar oben bei EXTERNAL_IDENTITY_TYPE_VALUES) plus
  // die erneute Audit-Ereignistyp-Erweiterung. Migrationen 1–14 bleiben
  // dabei byteidentisch unverändert.
  Object.freeze({
    version: 15,
    name: "create_office_finance_tables_and_widen_audit_event_types_v9",
    sql: `
      CREATE TABLE external_identities (
        id TEXT PRIMARY KEY,
        emailAddress TEXT NOT NULL UNIQUE CHECK (length(emailAddress) BETWEEN 3 AND 200),
        displayName TEXT NOT NULL CHECK (length(displayName) BETWEEN 1 AND 200),
        identityType TEXT NOT NULL CHECK (identityType IN (${sqlEnum(EXTERNAL_IDENTITY_TYPE_VALUES)})),
        provider TEXT NOT NULL CHECK (provider IN (${sqlEnum(EXTERNAL_IDENTITY_PROVIDER_VALUES)})),
        intendedPurpose TEXT NOT NULL CHECK (length(intendedPurpose) BETWEEN 1 AND 300),
        owner TEXT NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
        loginAllowed INTEGER NOT NULL CHECK (loginAllowed IN (0,1)),
        -- Auftrag Abschnitt D ("kein Agent erhält eigene Zugangsdaten") – per
        -- CHECK-Constraint hart auf 0 fixiert, kann über keinen Codepfad auf 1
        -- gesetzt werden.
        agentDirectLoginAllowed INTEGER NOT NULL DEFAULT 0 CHECK (agentDirectLoginAllowed = 0),
        inboxAvailable INTEGER NOT NULL CHECK (inboxAvailable IN (0,1)),
        calendarAvailable INTEGER NOT NULL CHECK (calendarAvailable IN (0,1)),
        driveAvailable INTEGER NOT NULL CHECK (driveAvailable IN (0,1)),
        contactsAvailable INTEGER NOT NULL CHECK (contactsAvailable IN (0,1)),
        writePermissionState TEXT NOT NULL CHECK (writePermissionState IN (${sqlEnum(PROVIDER_PERMISSION_LEVEL_VALUES)})),
        authenticationState TEXT NOT NULL CHECK (authenticationState IN (${sqlEnum(EXTERNAL_IDENTITY_AUTHENTICATION_STATE_VALUES)})),
        recoveryState TEXT NOT NULL CHECK (recoveryState IN (${sqlEnum(EXTERNAL_IDENTITY_RECOVERY_STATE_VALUES)})),
        twoFactorState TEXT NOT NULL CHECK (twoFactorState IN (${sqlEnum(EXTERNAL_IDENTITY_TWO_FACTOR_STATE_VALUES)})),
        status TEXT NOT NULL CHECK (status IN (${sqlEnum(EXTERNAL_IDENTITY_STATUS_VALUES)})),
        notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX idx_external_identities_identityType ON external_identities(identityType);

      CREATE TABLE office_work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        requestedOutcome TEXT NOT NULL CHECK (length(requestedOutcome) BETWEEN 1 AND 500),
        category TEXT NOT NULL CHECK (category IN (${sqlEnum(OFFICE_WORK_ITEM_CATEGORY_VALUES)})),
        targetIdentityId TEXT,
        ownerAgentId TEXT NOT NULL,
        contributorAgentIdsJson TEXT NOT NULL,
        requestedCapabilityId TEXT,
        permissionLevelRequired TEXT NOT NULL CHECK (permissionLevelRequired IN (${sqlEnum(PROVIDER_PERMISSION_LEVEL_VALUES)})),
        dataSensitivity TEXT NOT NULL CHECK (dataSensitivity IN (${sqlEnum(DATA_SENSITIVITY_VALUES)})),
        externalEffect TEXT NOT NULL CHECK (externalEffect IN (${sqlEnum(OFFICE_EXTERNAL_EFFECT_VALUES)})),
        draftPayloadJson TEXT CHECK (draftPayloadJson IS NULL OR length(draftPayloadJson) <= 4000),
        safeSummary TEXT NOT NULL CHECK (length(safeSummary) BETWEEN 1 AND 500),
        approvalStatus TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approvalStatus IN (${sqlEnum(OFFICE_WORK_ITEM_APPROVAL_STATUS_VALUES)})),
        -- Auftrag Abschnitt I ("maximal bis WAITING_FOR_AUTHENTICATION für
        -- V7.6.1") – die CHECK-Aufzählung selbst lässt zwar die vollständige,
        -- für später vorgesehene Statuskette zu (Auftrag: "Statusmodell"
        -- vollständig verankern), office-work-service.js verhindert
        -- zusätzlich programmatisch jeden Übergang über
        -- WAITING_FOR_AUTHENTICATION hinaus (kein READY_FOR_PROVIDER o. ä.
        -- über die aktuelle API erreichbar).
        executionStatus TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (executionStatus IN (${sqlEnum(OFFICE_WORK_ITEM_EXECUTION_STATUS_VALUES)})),
        providerReference TEXT,
        resultSummary TEXT CHECK (resultSummary IS NULL OR length(resultSummary) <= 500),
        errorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (targetIdentityId) REFERENCES external_identities(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_office_work_items_category ON office_work_items(category);
      CREATE INDEX idx_office_work_items_approvalStatus ON office_work_items(approvalStatus);
      CREATE INDEX idx_office_work_items_targetIdentityId ON office_work_items(targetIdentityId);

      CREATE TABLE finance_handoffs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        type TEXT NOT NULL CHECK (type IN (${sqlEnum(FINANCE_HANDOFF_TYPE_VALUES)})),
        period TEXT CHECK (period IS NULL OR length(period) <= 50),
        companyIdentity TEXT CHECK (companyIdentity IS NULL OR length(companyIdentity) <= 200),
        sourceDescription TEXT NOT NULL CHECK (length(sourceDescription) BETWEEN 1 AND 500),
        amount REAL,
        currency TEXT CHECK (currency IS NULL OR length(currency) <= 10),
        taxRelevance TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (taxRelevance IN (${sqlEnum(FINANCE_TAX_RELEVANCE_VALUES)})),
        sensitivity TEXT NOT NULL CHECK (sensitivity IN (${sqlEnum(DATA_SENSITIVITY_VALUES)})),
        proposedCategory TEXT CHECK (proposedCategory IS NULL OR length(proposedCategory) <= 200),
        confidence TEXT NOT NULL CHECK (confidence IN (${sqlEnum(FINANCE_CONFIDENCE_VALUES)})),
        missingInformation TEXT CHECK (missingInformation IS NULL OR length(missingInformation) <= 500),
        requiredSpecialist TEXT CHECK (requiredSpecialist IS NULL OR length(requiredSpecialist) <= 200),
        jamalDecision TEXT CHECK (jamalDecision IS NULL OR length(jamalDecision) <= 500),
        approvalStatus TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approvalStatus IN (${sqlEnum(FINANCE_HANDOFF_APPROVAL_STATUS_VALUES)})),
        -- Auftrag Abschnitt N/O ("keine echte Buchung/Zahlung/Rechnungsversand")
        -- – per CHECK-Constraint hart auf 1 fixiert, kann über keinen
        -- Codepfad technisch auf 0 gesetzt werden.
        executionBlocked INTEGER NOT NULL DEFAULT 1 CHECK (executionBlocked = 1),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX idx_finance_handoffs_type ON finance_handoffs(type);
      CREATE INDEX idx_finance_handoffs_approvalStatus ON finance_handoffs(approvalStatus);

      CREATE TABLE auth_audit_events_v9 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_15)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v9 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v9 RENAME TO auth_audit_events;

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
    `,
  }),
  // V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
  // der KI-Unternehmenszentrale verankern. Rein additiv gegenüber Migration
  // 15: vier neue Tabellen für GENAU EINEN kanonischen Referenzlauf
  // (Lauf/Arbeitspakete/Freigaben/Ergebnisnachweise) plus die erneute
  // Audit-Ereignistyp-Erweiterung. Migrationen 1–15 bleiben dabei
  // byteidentisch unverändert. Keine Health-Nutzerdaten, keine
  // medizinischen Daten – ausschließlich Governance-/Steuerungsmetadaten
  // der Zentrale selbst (siehe health-reference-work-run-service.js).
  Object.freeze({
    version: 16,
    name: "create_health_reference_work_run_tables_and_widen_audit_event_types_v10",
    sql: `
      CREATE TABLE health_reference_runs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        projectId TEXT NOT NULL CHECK (length(projectId) BETWEEN 1 AND 100),
        projectPath TEXT NOT NULL CHECK (length(projectPath) BETWEEN 1 AND 500),
        outcomeText TEXT NOT NULL CHECK (length(outcomeText) BETWEEN 1 AND 2000),
        status TEXT NOT NULL DEFAULT 'PREPARED_FOR_EXECUTION' CHECK (status IN (${sqlEnum(HEALTH_REFERENCE_RUN_STATUS_VALUES)})),
        mainAgentCanonicalName TEXT NOT NULL CHECK (length(mainAgentCanonicalName) BETWEEN 1 AND 100),
        specialistAgentsJson TEXT NOT NULL CHECK (length(specialistAgentsJson) BETWEEN 1 AND 2000),
        qaAgentCanonicalName TEXT NOT NULL CHECK (length(qaAgentCanonicalName) BETWEEN 1 AND 100),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE health_reference_work_packages (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL REFERENCES health_reference_runs(id) ON DELETE CASCADE,
        packageKey TEXT NOT NULL CHECK (packageKey IN (${sqlEnum(HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES)})),
        sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 7),
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        status TEXT NOT NULL DEFAULT 'PREPARED_FOR_EXECUTION' CHECK (status IN (${sqlEnum(HEALTH_REFERENCE_RUN_STATUS_VALUES)})),
        promptDraftJson TEXT CHECK (promptDraftJson IS NULL OR length(promptDraftJson) <= 8000),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE (runId, packageKey)
      );

      CREATE INDEX idx_health_reference_work_packages_runId ON health_reference_work_packages(runId);

      CREATE TABLE health_reference_approvals (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL REFERENCES health_reference_runs(id) ON DELETE CASCADE,
        approvalKey TEXT NOT NULL CHECK (approvalKey IN (${sqlEnum(HEALTH_REFERENCE_APPROVAL_KEY_VALUES)})),
        decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN (${sqlEnum(HEALTH_REFERENCE_APPROVAL_DECISION_VALUES)})),
        note TEXT CHECK (note IS NULL OR length(note) <= 1000),
        decidedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE (runId, approvalKey)
      );

      CREATE INDEX idx_health_reference_approvals_runId ON health_reference_approvals(runId);

      CREATE TABLE health_reference_results (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL REFERENCES health_reference_runs(id) ON DELETE CASCADE,
        workPackageKey TEXT CHECK (workPackageKey IS NULL OR workPackageKey IN (${sqlEnum(HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES)})),
        kind TEXT NOT NULL CHECK (kind IN (${sqlEnum(HEALTH_REFERENCE_RESULT_KIND_VALUES)})),
        summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
        detailsJson TEXT CHECK (detailsJson IS NULL OR length(detailsJson) <= 4000),
        createdAt TEXT NOT NULL
      );

      CREATE INDEX idx_health_reference_results_runId ON health_reference_results(runId);

      CREATE TABLE auth_audit_events_v10 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_16)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v10 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v10 RENAME TO auth_audit_events;

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
    `,
  }),
  // V7.6.4 – einzelne Health-Arbeitspakete korrekt abschließen (Auftrag
  // Abschnitt 2/4). Rein additiv gegenüber Migration 16: health_reference_
  // work_packages.status erhält einen eigenständigen, um "COMPLETED"
  // erweiterten Wertebereich (health_reference_runs.status bleibt
  // unverändert, siehe HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES oben);
  // dazu die erneute Audit-Ereignistyp-Erweiterung um genau einen
  // zusätzlichen Ereignistyp für Arbeitspaket-Statusübergänge. Migrationen
  // 1–16 bleiben dabei byteidentisch unverändert. Gleiches, bereits
  // etabliertes Muster wie bei jeder vorherigen CHECK-Erweiterung: Tabelle
  // unter Versionsnamen neu anlegen, Daten verlustfrei kopieren, alte
  // Tabelle löschen, umbenennen (SQLite kennt kein
  // "ALTER TABLE ... ALTER COLUMN ... CHECK").
  Object.freeze({
    version: 17,
    name: "add_health_reference_work_package_completed_status_and_status_changed_audit_event_v11",
    sql: `
      CREATE TABLE health_reference_work_packages_v2 (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL REFERENCES health_reference_runs(id) ON DELETE CASCADE,
        packageKey TEXT NOT NULL CHECK (packageKey IN (${sqlEnum(HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES)})),
        sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 7),
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        status TEXT NOT NULL DEFAULT 'PREPARED_FOR_EXECUTION' CHECK (status IN (${sqlEnum(HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES)})),
        promptDraftJson TEXT CHECK (promptDraftJson IS NULL OR length(promptDraftJson) <= 8000),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE (runId, packageKey)
      );

      INSERT INTO health_reference_work_packages_v2
        (id, runId, packageKey, sequence, title, status, promptDraftJson, createdAt, updatedAt)
      SELECT id, runId, packageKey, sequence, title, status, promptDraftJson, createdAt, updatedAt
      FROM health_reference_work_packages;

      DROP TABLE health_reference_work_packages;
      ALTER TABLE health_reference_work_packages_v2 RENAME TO health_reference_work_packages;

      CREATE INDEX idx_health_reference_work_packages_runId ON health_reference_work_packages(runId);

      CREATE TABLE auth_audit_events_v11 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_17)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v11 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v11 RENAME TO auth_audit_events;

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
    `,
  }),
  // KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Drei-Agenten-
  // Pilot. Rein additiv gegenüber Migration 17: zwei neue Tabellen
  // (pilot_work_orders, pilot_handoffs) plus die erneute
  // Audit-Ereignistyp-Erweiterung (gleiches, bereits etabliertes
  // Rename-Muster für die CHECK-Erweiterung von auth_audit_events).
  // Migrationen 1–17 bleiben dabei byteidentisch unverändert. Dieses
  // Modul ändert weder das kanonische 25-Agenten-Register noch den
  // Health Upgrade Kompass.
  Object.freeze({
    version: 18,
    name: "create_pilot_work_order_tables_and_widen_audit_event_types_v12",
    sql: `
      CREATE TABLE pilot_work_orders (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        desiredOutcome TEXT NOT NULL CHECK (length(desiredOutcome) BETWEEN 1 AND 2000),
        requestedBy TEXT NOT NULL CHECK (length(requestedBy) BETWEEN 1 AND 200),
        involvedAgentsJson TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (${sqlEnum(PILOT_WORK_ORDER_STATUS_VALUES)})),
        qualityCriteriaJson TEXT NOT NULL,
        allowedToolsJson TEXT NOT NULL,
        forbiddenActionsJson TEXT NOT NULL,
        requiredApprovalsJson TEXT NOT NULL,
        timeframe TEXT NOT NULL CHECK (length(timeframe) BETWEEN 1 AND 500),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE pilot_handoffs (
        id TEXT PRIMARY KEY,
        pilotOrderId TEXT NOT NULL REFERENCES pilot_work_orders(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence >= 1),
        fromPilotRole TEXT NOT NULL CHECK (fromPilotRole IN (${sqlEnum(PILOT_HANDOFF_FROM_VALUES)})),
        toPilotRole TEXT NOT NULL CHECK (toPilotRole IN (${sqlEnum(PILOT_ROLE_VALUES)})),
        shortFinding TEXT NOT NULL CHECK (length(shortFinding) BETWEEN 1 AND 1000),
        resultOrRecommendation TEXT NOT NULL CHECK (length(resultOrRecommendation) BETWEEN 1 AND 4000),
        basisUsed TEXT NOT NULL CHECK (length(basisUsed) BETWEEN 1 AND 2000),
        riskOrLimit TEXT NOT NULL CHECK (length(riskOrLimit) BETWEEN 1 AND 2000),
        nextStep TEXT NOT NULL CHECK (length(nextStep) BETWEEN 1 AND 1000),
        decisionNeeded TEXT CHECK (decisionNeeded IS NULL OR length(decisionNeeded) <= 1000),
        forbiddenActionOccurred INTEGER NOT NULL DEFAULT 0 CHECK (forbiddenActionOccurred IN (0,1)),
        autonomyBoundaryRespected INTEGER NOT NULL DEFAULT 1 CHECK (autonomyBoundaryRespected IN (0,1)),
        pmFilterStatus TEXT NOT NULL DEFAULT 'PENDING' CHECK (pmFilterStatus IN (${sqlEnum(PILOT_PM_FILTER_STATUS_VALUES)})),
        pmFilterReasonsJson TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX idx_pilot_handoffs_pilotOrderId ON pilot_handoffs(pilotOrderId);

      CREATE TABLE auth_audit_events_v12 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_18)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v12 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v12 RENAME TO auth_audit_events;

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
    `,
  }),
  // KI-Unternehmenszentrale-Pilotbetrieb – Phase 3 ("kontrollierte
  // Nebenläufigkeit und Konfliktsicherheit"). Rein additiv: eine einzelne
  // neue Spalte auf der bereits bestehenden pilot_work_orders-Tabelle
  // (Migration 18), keine neue Tabelle, kein Löschen/Neuaufbau einer
  // bestehenden Tabelle, keine Änderung der bestehenden CHECK-Aufzählung
  // für `status`. `revision` ist ein pro Auftrag streng monoton
  // steigender Zähler für optimistische Nebenläufigkeitskontrolle
  // (Compare-and-Set zusammen mit `status` in
  // auth-db.js#updatePilotWorkOrderStatusConditional): ein Statusübergang
  // wird nur angewendet, wenn der Auftrag zum Schreibzeitpunkt noch exakt
  // den Status UND die Revision besitzt, auf deren Grundlage die
  // Entscheidung getroffen wurde. Eine reine Statusprüfung (wie beim
  // bereits bestehenden Compare-and-Set-Muster für work_orders, siehe
  // auth-db.js#transitionWorkOrder) reicht hier nicht aus, weil die
  // Pilot-Statusmaschine in einen bereits durchlaufenen Status
  // zurückkehren kann (z. B. BLOCKED → RETURNED → DRAFT → … → erneut
  // BLOCKED) – ein reiner Statusvergleich könnte eine "ABA"-Situation
  // (derselbe Status, aber zwischenzeitlich mehrfach verändert) nicht
  // erkennen, ein monoton steigender Revisionszähler hingegen schon.
  // ADD COLUMN mit einem konstanten DEFAULT ist in SQLite eine
  // gewöhnliche, sofortige Schemaänderung (kein Tabellen-Neuaufbau
  // nötig); jeder bestehende Auftrag (inklusive des kanonischen
  // Pilotauftrags) erhält automatisch und rückwirkend den sicheren
  // Ausgangswert 0, ohne dass ein bestehender Datensatz sonst verändert
  // wird. Bestehende Audit-Daten bleiben vollständig unverändert.
  Object.freeze({
    version: 19,
    name: "add_pilot_work_order_revision_column",
    sql: `
      ALTER TABLE pilot_work_orders ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
    `,
  }),
  // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner") – rein additiv gegenüber
  // Migration 19: eine neue Tabelle (pilot_agent_execution_runs) für die
  // technische Ausführungseinheit eines einzelnen Agentenlaufs, eine
  // zusätzliche, nullable Spalte auf der bereits bestehenden
  // pilot_handoffs-Tabelle (executionRunId – verknüpft eine Rollenübergabe
  // optional mit dem Agentenlauf, aus dem sie tatsächlich hervorgegangen
  // ist; bestehende Rollenübergaben ohne Agentenlauf bleiben NULL und damit
  // unverändert gültig) sowie die erneute, etablierte
  // Audit-Ereignistyp-Erweiterung. Migrationen 1–19 bleiben dabei
  // byteidentisch unverändert. Kein Löschen oder Neuaufbau einer
  // bestehenden Tabelle außer dem bereits etablierten Rename-Muster für die
  // CHECK-Erweiterung von auth_audit_events selbst.
  //
  // Der Agentenlauf ist bewusst NICHT Teil der pilot_work_orders-Statusmaschine:
  // ein Agentenlauf ist eine rein technische Ausführungseinheit (siehe
  // PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES), der fachliche Auftragsstatus
  // (pilot_work_orders.status) bleibt davon unberührt und wird ausschließlich
  // über die bereits bestehenden, unveränderten Übergänge
  // (markReadyForApproval/approveForExecution/startExecution/submitHandoff/
  // submitForReview/approveCompletion/...) gesteuert.
  //
  // Der partielle Unique-Index idx_pilot_agent_execution_runs_running_per_order
  // erzwingt direkt in der Datenbank, dass pro Pilotauftrag höchstens EIN
  // Agentenlauf gleichzeitig den Status RUNNING tragen kann – ein zweiter
  // Startversuch (Doppelklick, paralleler zweiter Start) schlägt dadurch
  // atomar mit einem UNIQUE-Constraint-Fehler fehl, bevor irgendein Runner
  // aufgerufen wird; kein zweiter aktiver Lauf kann jemals entstehen.
  Object.freeze({
    version: 20,
    name: "create_pilot_agent_execution_run_table_and_widen_audit_event_types_v13",
    sql: `
      CREATE TABLE pilot_agent_execution_runs (
        id TEXT PRIMARY KEY,
        pilotOrderId TEXT NOT NULL REFERENCES pilot_work_orders(id) ON DELETE CASCADE,
        pilotOrderRevisionAtStart INTEGER NOT NULL CHECK (pilotOrderRevisionAtStart >= 0),
        presetId TEXT NOT NULL CHECK (length(presetId) BETWEEN 1 AND 100),
        pilotRole TEXT NOT NULL CHECK (pilotRole IN (${sqlEnum(PILOT_ROLE_VALUES)})),
        agentKey TEXT NOT NULL CHECK (length(agentKey) BETWEEN 1 AND 100),
        taskTitle TEXT NOT NULL CHECK (length(taskTitle) BETWEEN 1 AND 200),
        taskInstructions TEXT NOT NULL CHECK (length(taskInstructions) BETWEEN 1 AND 2000),
        allowedFilesJson TEXT NOT NULL,
        allowedToolsJson TEXT NOT NULL,
        forbiddenActionsJson TEXT NOT NULL,
        expectedResultFormat TEXT NOT NULL CHECK (length(expectedResultFormat) BETWEEN 1 AND 500),
        runnerId TEXT NOT NULL CHECK (length(runnerId) BETWEEN 1 AND 100),
        runnerLabel TEXT NOT NULL CHECK (length(runnerLabel) BETWEEN 1 AND 300),
        status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN (${sqlEnum(PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES)})),
        resultSummaryJson TEXT,
        resultRawText TEXT CHECK (resultRawText IS NULL OR length(resultRawText) <= 8000),
        errorMessage TEXT CHECK (errorMessage IS NULL OR length(errorMessage) <= 2000),
        startedAt TEXT NOT NULL,
        finishedAt TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX idx_pilot_agent_execution_runs_pilotOrderId ON pilot_agent_execution_runs(pilotOrderId);

      CREATE UNIQUE INDEX idx_pilot_agent_execution_runs_running_per_order
        ON pilot_agent_execution_runs(pilotOrderId)
        WHERE status = 'RUNNING';

      ALTER TABLE pilot_handoffs ADD COLUMN executionRunId TEXT;

      CREATE TABLE auth_audit_events_v13 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_20)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v13 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v13 RENAME TO auth_audit_events;

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
    `,
  }),
  // Korrekturlauf vor Commit (unabhängiges Opus-Review, "Ergebnis darf bei
  // Handoff-Konflikt nicht verloren gehen") – rein additiv gegenüber
  // Migration 20: drei zusätzliche, nullable Spalten auf der bereits
  // bestehenden pilot_agent_execution_runs-Tabelle sowie die erneute,
  // etablierte Audit-Ereignistyp-Erweiterung. Migrationen 1–20 bleiben dabei
  // byteidentisch unverändert. Kein Löschen oder Neuaufbau von
  // pilot_agent_execution_runs selbst.
  //
  // Hintergrund: Vor dieser Migration liefen der technische Runner-Abschluss
  // (Runstatus SUCCEEDED, Ergebnisdaten, Erfolgs-Audit) und die fachliche
  // Rollenübergabe (submitHandoff inkl. Projektmanager-Filter) in EINER
  // gemeinsamen Transaktion (siehe pilot-agent-execution-service.js vor
  // diesem Korrekturlauf). Änderte sich der Pilotauftragsstatus während des
  // Runs (z. B. durch einen unabhängigen blockOrder-Aufruf), scheiterte
  // submitHandoff – und die Transaktion rollte dabei auch das bereits
  // tatsächlich erzeugte, technisch erfolgreiche Ergebnis zurück. Ab dieser
  // Migration ist Stufe A (Runstatus SUCCEEDED + Ergebnis + Erfolgs-Audit)
  // strikt von Stufe B (Handoff-Versuch) getrennt: Stufe B läuft in einer
  // eigenen, späteren Transaktion, deren Scheitern Stufe A niemals mehr
  // rückgängig macht (siehe pilot-agent-execution-service.js#
  // attemptHandoffForSucceededRun).
  //
  // ADD COLUMN mit konstantem DEFAULT ist in SQLite eine gewöhnliche,
  // sofortige Schemaänderung (kein Tabellen-Neuaufbau nötig); jeder bereits
  // bestehende Agentenlauf (RUNNING, SUCCEEDED oder FAILED) erhält
  // automatisch und rückwirkend handoffStatus = 'PENDING' (bedeutet für
  // bereits bestehende, vor diesem Korrekturlauf erfolgreich abgeschlossene
  // Läufe lediglich: "Stufe B wurde vor dieser Migration nicht getrennt
  // nachverfolgt" – ihr fachliches Ergebnis, z. B. ein bereits bestehendes
  // Handoff, bleibt davon vollständig unberührt, siehe pilot_handoffs).
  Object.freeze({
    version: 21,
    name: "add_pilot_agent_execution_run_handoff_status_and_widen_audit_event_types_v14",
    sql: `
      ALTER TABLE pilot_agent_execution_runs
        ADD COLUMN handoffStatus TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (handoffStatus IN (${sqlEnum(PILOT_AGENT_EXECUTION_HANDOFF_STATUS_VALUES)}));

      ALTER TABLE pilot_agent_execution_runs
        ADD COLUMN handoffErrorMessage TEXT
        CHECK (handoffErrorMessage IS NULL OR length(handoffErrorMessage) <= 2000);

      ALTER TABLE pilot_agent_execution_runs ADD COLUMN handoffCompletedAt TEXT;

      CREATE TABLE auth_audit_events_v14 (
        eventId TEXT PRIMARY KEY,
        actorUserId TEXT,
        tenantId TEXT,
        eventType TEXT NOT NULL CHECK (eventType IN (${sqlEnum(AUDIT_EVENT_TYPES_AT_MIGRATION_21)})),
        result TEXT NOT NULL CHECK (result IN (${sqlEnum(AUDIT_RESULT_VALUES)})),
        timestamp TEXT NOT NULL,
        metadata TEXT
      );

      INSERT INTO auth_audit_events_v14 (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata)
      SELECT eventId, actorUserId, tenantId, eventType, result, timestamp, metadata FROM auth_audit_events;

      DROP TABLE auth_audit_events;
      ALTER TABLE auth_audit_events_v14 RENAME TO auth_audit_events;

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
  JAMAL_WORK_ITEM_STATUS_VALUES,
  JAMAL_WORK_ITEM_PROJECT_SOURCE_VALUES,
  JAMAL_WORK_ITEM_DECISION_VALUES,
  JAMAL_WORK_RESULT_TRIGGER_VALUES,
  JAMAL_CANVA_PRODUCTION_STATUS_VALUES,
  JAMAL_CANVA_SUITABILITY_DECISION_VALUES,
  JAMAL_CANVA_RIGHTS_STATUS_VALUES,
  JAMAL_CANVA_QUALITY_STATUS_VALUES,
  AGENT_HR_RECOMMENDATION_VALUES,
  AGENT_HR_PROPOSAL_STATUS_VALUES,
  TECHNOLOGY_RADAR_TYPE_VALUES,
  TECHNOLOGY_RADAR_RECOMMENDATION_VALUES,
  TECHNOLOGY_RADAR_STATUS_VALUES,
  AGENT_TECHNOLOGY_FIT_STATUS_VALUES,
  AGENT_TECHNOLOGY_FIT_PRIORITY_VALUES,
  AGENT_HR_PDCA_STAGE_VALUES,
  AGENT_HR_PDCA_DECISION_VALUES,
  AGENT_HR_RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES,
  LEADERSHIP_BENEFIT_AREA_VALUES,
  LEADERSHIP_PRIORITY_BUCKET_VALUES,
  RELIABILITY_SIGNAL_TYPE_VALUES,
  RELIABILITY_SIGNAL_STATUS_VALUES,
  TECHNOLOGY_RADAR_SIGNAL_TYPE_VALUES,
  TECHNOLOGY_RADAR_TIME_HORIZON_VALUES,
  TECHNOLOGY_RADAR_UNCERTAINTY_LEVEL_VALUES,
  // V7.6.1 – Apple-first/Google-controlled Office-/Finance-Korridor
  EXTERNAL_IDENTITY_TYPE_VALUES,
  EXTERNAL_IDENTITY_PROVIDER_VALUES,
  PROVIDER_PERMISSION_LEVEL_VALUES,
  EXTERNAL_IDENTITY_AUTHENTICATION_STATE_VALUES,
  EXTERNAL_IDENTITY_RECOVERY_STATE_VALUES,
  EXTERNAL_IDENTITY_TWO_FACTOR_STATE_VALUES,
  EXTERNAL_IDENTITY_STATUS_VALUES,
  OFFICE_WORK_ITEM_CATEGORY_VALUES,
  OFFICE_EXTERNAL_EFFECT_VALUES,
  OFFICE_WORK_ITEM_APPROVAL_STATUS_VALUES,
  OFFICE_WORK_ITEM_EXECUTION_STATUS_VALUES,
  DATA_SENSITIVITY_VALUES,
  FINANCE_HANDOFF_TYPE_VALUES,
  FINANCE_TAX_RELEVANCE_VALUES,
  FINANCE_CONFIDENCE_VALUES,
  FINANCE_HANDOFF_APPROVAL_STATUS_VALUES,
  AUDIT_EVENT_TYPES_AT_MIGRATION_15,
  // V7.6.3 – Health Upgrade Kompass Referenz-Arbeitslauf
  HEALTH_REFERENCE_RUN_STATUS_VALUES,
  HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES,
  HEALTH_REFERENCE_APPROVAL_KEY_VALUES,
  HEALTH_REFERENCE_APPROVAL_DECISION_VALUES,
  HEALTH_REFERENCE_RESULT_KIND_VALUES,
  AUDIT_EVENT_TYPES_AT_MIGRATION_16,
  // V7.6.4 – Health-Arbeitspaket-COMPLETED-Status
  HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES,
  AUDIT_EVENT_TYPES_AT_MIGRATION_17,
  // KI-Unternehmenszentrale-Pilotbetrieb – Drei-Agenten-Pilotauftrag
  PILOT_WORK_ORDER_STATUS_VALUES,
  PILOT_ROLE_VALUES,
  PILOT_HANDOFF_FROM_VALUES,
  PILOT_PM_FILTER_STATUS_VALUES,
  AUDIT_EVENT_TYPES_AT_MIGRATION_18,
  // Phase 6 – technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner
  PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES,
  PILOT_AGENT_EXECUTION_HANDOFF_STATUS_VALUES,
  AUDIT_EVENT_TYPES_AT_MIGRATION_20,
  AUDIT_EVENT_TYPES_AT_MIGRATION_21,
  MIGRATIONS,
  ensureMigrationsTable,
  getAppliedVersions,
  runMigrations,
};
