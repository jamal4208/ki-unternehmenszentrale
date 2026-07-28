"use strict";

// V7.2 Phase A Schritt 1 – Auditkern (Auftrag Abschnitt J).
//
// Append-only Protokollierung sicherheitsrelevanter Auth-Ereignisse.
// Persistenz über auth-db.js (append-only zusätzlich per SQLite-Trigger
// erzwungen, siehe auth-db-migrations.js). Dieses Modul importiert
// NIEMALS better-sqlite3 selbst und exportiert bewusst keine Update-
// oder Delete-Funktion.
//
// Metadaten sind strikt allowlisted (Routenname, Rollenbezeichnung,
// Grund-Code) – Passwörter, Tokens, Cookies, Session-Klartext, Dateipfade,
// Provider-Komplettantworten und Freitext aus Kundeneingaben sind
// verboten und werden zurückgewiesen statt gefiltert (fail-closed statt
// stillschweigend zu bereinigen).

const crypto = require("crypto");
const authDb = require("./auth-db");

const EVENT_TYPES = Object.freeze([
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
  // Benutzerverwaltung (owner-admin-service.js). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES (Migration 7) erweiterten
  // CHECK-Aufzählung entsprechen.
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
  // prüfen, Status verfolgen (work-order-service.js). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES (Migration 8) erweiterten
  // CHECK-Aufzählung entsprechen.
  //
  // Produktkorrektur (Selbstbedienungs-Fluss): AUTO_READY/
  // AUTO_NEEDS_CLARIFICATION markieren die automatische Systementscheidung
  // (kein Owner-Akteur); ESCALATED/CANCELLED markieren die einzigen noch
  // verbliebenen Owner-Aktionen, jeweils ausschließlich für Ausnahmefälle.
  "WORK_ORDER_CREATED",
  "WORK_ORDER_SUBMITTED",
  "WORK_ORDER_RESUBMITTED",
  "WORK_ORDER_AUTO_READY",
  "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
  "WORK_ORDER_ESCALATED",
  "WORK_ORDER_CANCELLED",
  "WORK_ORDER_TENANT_MISMATCH_BLOCKED",
  // V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt D)
  // – Business-Use-/Safety-Gate (business-use-policy.js). Muss exakt der
  // in auth-db-migrations.js#AUDIT_EVENT_TYPES (Migration 9) erweiterten
  // CHECK-Aufzählung entsprechen. BLOCKED_BY_POLICY markiert einen nicht
  // gespeicherten Auftrag (kein workOrderId in den Metadaten möglich, da
  // keine Zeile existiert); AUTO_ESCALATED_BY_POLICY markiert die
  // automatische Direkteinstufung als ESCALATED (kein Owner-Akteur).
  "WORK_ORDER_BLOCKED_BY_POLICY",
  "WORK_ORDER_AUTO_ESCALATED_BY_POLICY",
  // V7.2 Phase C Schritt 1 (Auftrag Abschnitt N) – kontrollierte Übergabe
  // eines READY_FOR_PROCESSING-Auftrags an die interne Agentenzentrale
  // (work-order-execution-service.js). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES (Migration 10) erweiterten
  // CHECK-Aufzählung entsprechen.
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
  // work-order-approval-service.js). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES (Migration 11) erweiterten
  // CHECK-Aufzählung entsprechen. Ausschließlich der KUNDE löst
  // CHANGES_REQUESTED/RESULT_APPROVED_BY_CUSTOMER aus; der OWNER erscheint
  // in keinem dieser neun Ereignisse als fachlich Entscheidender.
  "WORK_ORDER_CHANGES_REQUESTED",
  "WORK_ORDER_CHANGE_REQUEST_STARTED",
  "WORK_ORDER_CHANGE_REQUEST_COMPLETED",
  "WORK_ORDER_CHANGE_REQUEST_FAILED",
  "WORK_ORDER_CHANGE_REQUEST_CANCELLED",
  "WORK_ORDER_RESULT_VERSION_CREATED",
  "WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER",
  "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY",
  "WORK_ORDER_CHANGE_ESCALATED_BY_POLICY",
  // V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
  // (Auftrag Abschnitt N) – jamal-canva-production-service.js. Muss exakt
  // der in auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_13
  // erweiterten CHECK-Aufzählung (Migration 13) entsprechen. Ausschließlich
  // Jamal selbst (OWNER) löst diese zehn Ereignisse aus – kein
  // Kundenmandant, kein automatischer Owner-Ersatz.
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
  // V7.5 – Agentenorganisation, tägliches HR-Coaching und
  // Technologie-/Plugin-Marktradar (Auftrag Abschnitt K) –
  // agent-hr-coaching-service.js/technology-radar-service.js/
  // agent-leadership-routes.js. Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_14 erweiterten
  // CHECK-Aufzählung (Migration 14) entsprechen. Ausschließlich Jamal
  // selbst (OWNER) löst diese neun Ereignisse aus – kein Kundenmandant,
  // kein automatischer Owner-Ersatz, keines dieser Ereignisse verändert
  // selbst eine Autonomiestufe.
  "AGENT_ORGANIZATION_REVIEWED",
  "HR_DAILY_RUN_CREATED",
  "HR_PROPOSAL_REVIEWED",
  "HR_PROPOSAL_APPROVED",
  "HR_PROPOSAL_REJECTED",
  "HR_PROPOSAL_DEFERRED",
  "TECH_RADAR_ITEM_CREATED",
  "TECH_RADAR_ITEM_UPDATED",
  "AGENT_TECH_FIT_REVIEWED",
  // Unternehmensleitlinien V1.0 als verbindliche Betriebslogik (Auftrag
  // Abschnitt P) – fünf zusätzliche Ereignistypen, muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_14 erweiterten
  // CHECK-Aufzählung entsprechen. Ausschließlich Jamal selbst (OWNER) löst
  // diese aus; keines verändert selbst eine Autonomiestufe oder löst eine
  // Sanktion aus.
  "COMPANY_PRINCIPLES_REVIEWED",
  "HR_PDCA_STAGE_CHANGED",
  "RELIABILITY_SIGNAL_RECORDED",
  "RELIABILITY_SIGNAL_REVIEWED",
  "FORESIGHT_SCENARIO_REVIEWED",
  // V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
  // Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt T) –
  // external-identity-service.js/office-work-service.js/
  // finance-handoff-service.js/office-finance-routes.js. Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_15 erweiterten
  // CHECK-Aufzählung (Migration 15) entsprechen. Ausschließlich Jamal selbst
  // (OWNER) löst diese neun Ereignisse aus; keines führt eine echte externe
  // Provideraktion aus oder verbindet ein echtes Google-/Bankkonto.
  "EXTERNAL_IDENTITY_REVIEWED",
  "PROVIDER_CAPABILITY_REVIEWED",
  "OFFICE_WORK_ITEM_CREATED",
  "OFFICE_WORK_ITEM_REVIEWED",
  "OFFICE_EXTERNAL_ACTION_APPROVED",
  "OFFICE_AUTHENTICATION_REQUIRED",
  "FINANCE_HANDOFF_CREATED",
  "FINANCE_HANDOFF_REVIEWED",
  "FINANCE_SPECIALIST_REQUIRED",
  // V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf
  // verankern (Auftrag Abschnitt 12) – health-reference-work-run-service.js/
  // health-reference-work-run-routes.js. Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_16 erweiterten
  // CHECK-Aufzählung (Migration 16) entsprechen. Ausschließlich Jamal selbst
  // (OWNER) löst diese neun Ereignisse aus; keines davon ist eine echte
  // Health-Ausführung, keine externe Aktion, keine Datei-Änderung im
  // Health-Repository.
  "HEALTH_REFERENCE_RUN_CREATED",
  "HEALTH_REFERENCE_WORK_PACKAGE_PREPARED",
  "HEALTH_REFERENCE_PROMPT_DRAFT_CREATED",
  "HEALTH_REFERENCE_APPROVAL_RECORDED",
  "HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED",
  "HEALTH_REFERENCE_QA_FINDING_RECORDED",
  "HEALTH_REFERENCE_CHANGES_REQUESTED",
  "HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED",
  "HEALTH_REFERENCE_REFERENCE_READY_GRANTED",
  // V7.6.4 – einzelne Health-Arbeitspakete korrekt abschließen (Auftrag
  // Abschnitt 4). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_17 erweiterten
  // CHECK-Aufzählung (Migration 17) entsprechen. Deckt jeden
  // Arbeitspaket-Statusübergang zusätzlich ab (Freigabe, Ausführung
  // gestartet, Ergebnis eingereicht, QA-Ergebnis, Paket abgeschlossen,
  // Änderung angefordert, blockiert, abgebrochen) – zusätzlich zu den
  // bereits bestehenden, spezifischeren Ereignistypen.
  "HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED",
  // KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver
  // Drei-Agenten-Pilot (Auftrag "Pilotstruktur umsetzen"). Muss exakt der
  // in auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_18 erweiterten
  // CHECK-Aufzählung (Migration 18) entsprechen. Ausschließlich Jamal
  // selbst (OWNER) löst diese acht Ereignisse aus; keines davon ist eine
  // externe Aktion, kein Commit/Push/Deployment, keine automatische
  // Freigabe durch einen Agenten.
  "PILOT_WORK_ORDER_CREATED",
  "PILOT_WORK_ORDER_STATUS_CHANGED",
  "PILOT_HANDOFF_SUBMITTED",
  "PILOT_HANDOFF_ACCEPTED_BY_PM_FILTER",
  "PILOT_HANDOFF_REJECTED_BY_PM_FILTER",
  "PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION",
  "PILOT_EXECUTION_APPROVAL_RECORDED",
  "PILOT_COMPLETION_APPROVAL_RECORDED",
  // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_20 erweiterten
  // CHECK-Aufzählung (Migration 20) entsprechen. Deckt Start, erfolgreichen
  // Abschluss und Fehlschlag eines einzelnen technischen Agentenlaufs ab;
  // keines davon ist eine externe Aktion, kein Commit/Push/Deployment,
  // keine automatische Freigabe durch einen Agenten.
  "PILOT_AGENT_EXECUTION_RUN_STARTED",
  "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED",
  "PILOT_AGENT_EXECUTION_RUN_FAILED",
  // Korrekturlauf vor Commit (unabhängiges Opus-Review, "Ergebnis darf bei
  // Handoff-Konflikt nicht verloren gehen"). Muss exakt der in
  // auth-db-migrations.js#AUDIT_EVENT_TYPES_AT_MIGRATION_21 erweiterten
  // CHECK-Aufzählung (Migration 21) entsprechen. Markiert AUSSCHLIESSLICH
  // das Scheitern der fachlichen Rollenübergabe (Stufe B) nach einem bereits
  // technisch erfolgreichen Agentenlauf (Stufe A bleibt SUCCEEDED und
  // vollständig gespeichert) – niemals ein technischer Runner-Fehler
  // (dafür bleibt PILOT_AGENT_EXECUTION_RUN_FAILED zuständig).
  "PILOT_AGENT_EXECUTION_RUN_HANDOFF_FAILED",
]);

const RESULTS = Object.freeze(["OK", "DENIED", "ERROR"]);

// Allowlist der einzig erlaubten Metadatenfelder.
//
// V7.2 Phase B Schritt 1 (Auftrag Abschnitt I): "workOrderId" (interne ID,
// kein Auftragstext) und "statusTransition" (z. B. "SUBMITTED->APPROVED",
// ein reiner Statuscode, kein Freitext) ergänzt. Der vollständige
// Auftragstext (Titel, gewünschtes Ergebnis, Hintergrund, Owner-Notiz)
// bleibt bewusst außerhalb der Allowlist.
//
// V7.2 Phase B – Schutz- und Einwilligungsgrundlage: "severity" ergänzt
// (einer von LOW/MEDIUM/HIGH/CRITICAL, reiner Schweregrad-Code aus
// business-use-policy.js, kein Freitext) – "reasonCode" existierte bereits
// und wird jetzt zusätzlich für Business-Use-Policy-Kategorien verwendet
// (z. B. "ILLEGAL_PURPOSE"), niemals für den erkannten Auftragstext selbst.
// V7.2 Phase C Schritt 1 (Auftrag Abschnitt N): "runId" (interne Lauf-ID),
// "agentKey" (technische ID aus dem kanonischen 25-Agenten-Register, siehe
// agent-registry.js – kein Freitext) und "failureCode" (reiner
// Fehlercode, kein Stacktrace/keine Fehlermeldung) ergänzt. Weiterhin kein
// vollständiger Auftragstext, kein Ergebnistext, kein Systemprompt.
//
// V7.2 Phase C Schritt 2 (Auftrag Abschnitt L): "resultId" (interne
// Ergebnisversions-ID), "resultVersion" (reine Versionsnummer, kein
// Ergebnistext) und "changeRequestId" (interne Änderungswunsch-ID)
// ergänzt. Weiterhin niemals der Änderungswunschtext selbst, niemals
// "was erhalten bleiben soll"/"was wichtig ist" im Klartext.
//
// V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
// (Auftrag Abschnitt N): "workItemId" (interne Jamal-Arbeitswunsch-ID),
// "canvaJobId"/"canvaDesignId" (interne bzw. Canva-Design-Referenz, keine
// Zugangsdaten), "format" (reiner Formattext wie "Instagram-Beitrag"),
// "revisionNumber" (reine Zahl) und "rightsCode" (reiner Rechte-/
// Consent-Status wie "BLOCKED"/"UNCLEAR") ergänzt. "reasonCode" und
// "failureCode" existierten bereits und werden zusätzlich für die
// Canva-Policy-/Providerfehlercodes verwendet. Weiterhin niemals der
// Briefingtext, das Canva-Ergebnis vollständig, ein Zugangstoken oder eine
// vollständige Provider-Rohantwort.
//
// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt K): "runDate" (reines
// Kalenderdatum des HR-Laufs), "hrRunId"/"hrProposalId" (interne IDs),
// "radarItemId"/"fitId" (interne Radar-/Zuordnungs-IDs),
// "recommendationCode" (einer der HR-/Radar-/Fit-Empfehlungswerte, z. B.
// "RECOMMEND_SMALL_EXPANSION" oder "WATCH" – niemals Freitext) und
// "decisionType" (z. B. "APPROVE"/"REJECT"/"DEFER"/"REVIEW"). "agentKey"
// existierte bereits (V7.2 Phase C Schritt 1) und wird hier zusätzlich für
// die 25 kanonischen agent-registry.js-IDs verwendet. Weiterhin niemals
// der vollständige Vorschlagstext, keine Gedankenkette, kein
// Providerpayload.
//
// Unternehmensleitlinien V1.0 (Auftrag Abschnitt P): "principleId" (reine
// company-principles.js-Regel-ID, z. B. "SAFETY_JAMAL_DECIDES" – niemals der
// Leitlinientext selbst) und "signalId" (interne Hochzuverlässigkeits-
// signal-ID). "pdcaStage"/"pdcaDecision" nutzen ausschließlich die bereits
// bestehenden Wertebereiche aus auth-db-migrations.js (reine Statuscodes).
// "hrProposalId"/"radarItemId" (bereits vorhanden) werden zusätzlich als
// optionaler Bezug eines Hochzuverlässigkeitssignals verwendet. Weiterhin
// niemals der vollständige Beobachtungstext, keine Gedankenkette.
//
// V7.6.1 – Apple-first/Google-controlled Office-/Finance-Korridor (Auftrag
// Abschnitt T): "identityId" (interne external_identities-ID, niemals das
// vollständige E-Mail-Konto samt Zusatzangaben), "capabilityId" (reiner
// google-workspace-capability-service.js-Fähigkeits-Code, z. B.
// "gmail-prepare-draft"), "officeWorkItemId"/"officeCategory" (interne ID
// bzw. einer der fünf Kategoriewerte), "financeHandoffId"/"financeType"
// (interne ID bzw. einer der sieben Handoff-Typwerte) und
// "approvalStatusCode" (reiner Statuscode, z. B. "READY_FOR_REVIEW").
// Weiterhin niemals ein E-Mail-Inhalt, Dokumentinhalt, Bankinformation,
// Betrag im Klartext ohne Rundung, Token, Secret oder vollständiger
// Providerpayload.
const METADATA_ALLOWLIST = Object.freeze([
  "routeName",
  "roleLabel",
  "reasonCode",
  "workOrderId",
  "statusTransition",
  "severity",
  "runId",
  "agentKey",
  "failureCode",
  "resultId",
  "resultVersion",
  "changeRequestId",
  "workItemId",
  "canvaJobId",
  "canvaDesignId",
  "format",
  "revisionNumber",
  "rightsCode",
  "runDate",
  "hrRunId",
  "hrProposalId",
  "radarItemId",
  "fitId",
  "recommendationCode",
  "decisionType",
  "principleId",
  "signalId",
  "pdcaStage",
  "pdcaDecision",
  "identityId",
  "capabilityId",
  "officeWorkItemId",
  "officeCategory",
  "financeHandoffId",
  "financeType",
  "approvalStatusCode",
  // V7.6.3 – Health Upgrade Kompass Referenz-Arbeitslauf: "healthReferenceRunId"
  // (feste kanonische Lauf-ID, keine Health-Nutzerdaten), "workPackageKey"
  // (einer der sieben festen Arbeitspaket-Codes), "approvalKey" (einer der
  // sieben festen Freigabe-Codes) und "resultKind" (einer der vier festen
  // Ergebnisnachweis-Codes) – ausschließlich Steuerungsmetadaten der
  // Zentrale selbst, niemals ein Health-Nutzer-/Gesundheitsdatum.
  "healthReferenceRunId",
  "workPackageKey",
  "approvalKey",
  "resultKind",
  // V7.6.4 – Health-Arbeitspaket-Statusübergänge: "previousStatus" und
  // "nextStatus" sind ausschließlich einer der festen
  // HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES-Codes (auth-db-
  // migrations.js), niemals Freitext, kein Ergebnisbericht, keine
  // Gesundheitsdaten.
  "previousStatus",
  "nextStatus",
  // KI-Unternehmenszentrale-Pilotbetrieb: "pilotOrderId" (ID des jeweiligen
  // Pilotauftrags – seit Phase 2/Mehrfachlauf-Grundlage nicht mehr nur die
  // eine kanonische ID, sondern jede angelegte Pilotauftrags-ID),
  // "pilotHandoffId" (interne Übergabe-ID), "pilotRole"
  // (einer der drei festen Pilotrollen-Codes) und "pmFilterStatus" (einer
  // der drei festen Filterergebnis-Codes) – ausschließlich
  // Steuerungsmetadaten des Pilotlaufs selbst, niemals Auftrags- oder
  // Ergebnistext, kein Kundendatum.
  "pilotOrderId",
  "pilotHandoffId",
  "pilotRole",
  "pmFilterStatus",
  // KI-Unternehmenszentrale-Pilotbetrieb Phase 3 ("kontrollierte
  // Nebenläufigkeit und Konfliktsicherheit"): "previousRevision" und
  // "nextRevision" sind ausschließlich die reinen, nicht-negativen
  // Revisionszähler eines Pilotauftrags vor/nach einem erfolgreichen
  // Statusübergang (siehe auth-db-migrations.js Migration 19) – keine
  // Freitext, kein Ergebnisinhalt. Sie machen jeden Statuswechsel-Audit
  // eindeutig einer bestimmten Revision zuordenbar, ohne sich allein auf
  // Zeitstempel verlassen zu müssen.
  "previousRevision",
  "nextRevision",
  // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): "pilotExecutionRunId"
  // (interne ID des jeweiligen Agentenlaufs), "runnerId" (fester Code des
  // verwendeten Runners, z. B. "local-read-only-repo-analysis" – niemals ein
  // Dateipfad oder Prozessdetail) und "presetId" (fester Code des
  // verwendeten, serverseitig definierten Aufgaben-Presets) – ausschließlich
  // Steuerungsmetadaten des Agentenlaufs selbst, niemals das tatsächliche
  // Ergebnis, keine Dateiinhalte, kein Freitext.
  "pilotExecutionRunId",
  "runnerId",
  "presetId",
]);

// Verbotene Inhalte, unabhängig vom Feldnamen (Verteidigung in der Tiefe:
// selbst innerhalb eines erlaubten Feldes darf kein sensibler Inhalt
// landen).
const FORBIDDEN_METADATA_PATTERNS = Object.freeze([
  /password/i,
  /passwort/i,
  /\btoken\b/i,
  /cookie/i,
  /session[-_]?id/i,
  /providerRawResponse/i,
  /\/Users\//,
  /[A-Za-z]:\\\\/,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Wirft bei jedem nicht erlaubten Feld oder verbotenen Inhalt, statt
// stillschweigend zu filtern – Auditmetadaten sind sicherheitsrelevant und
// dürfen keine erfundene, teilweise bereinigte Version enthalten.
function sanitizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;
  if (!isPlainObject(metadata)) {
    throw new Error("Audit-Metadaten müssen ein einfaches Objekt sein.");
  }
  const unexpectedKeys = Object.keys(metadata).filter((key) => !METADATA_ALLOWLIST.includes(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`Audit-Metadaten enthalten nicht erlaubte Felder: ${unexpectedKeys.join(", ")}`);
  }
  const serialized = JSON.stringify(metadata);
  if (FORBIDDEN_METADATA_PATTERNS.some((pattern) => pattern.test(serialized))) {
    throw new Error("Audit-Metadaten enthalten möglicherweise unzulässige sensible Inhalte und werden abgewiesen.");
  }
  return serialized;
}

function recordAuditEvent(db, input = {}) {
  if (!EVENT_TYPES.includes(input.eventType)) {
    throw new Error(`Unbekannter Audit-Ereignistyp: ${input.eventType}`);
  }
  if (!RESULTS.includes(input.result)) {
    throw new Error(`Unbekanntes Audit-Ergebnis: ${input.result}`);
  }
  const record = {
    eventId: input.eventId || crypto.randomUUID(),
    actorUserId: input.actorUserId ?? null,
    tenantId: input.tenantId ?? null,
    eventType: input.eventType,
    result: input.result,
    timestamp: input.timestamp || new Date().toISOString(),
    metadata: sanitizeMetadata(input.metadata),
  };
  return authDb.insertAuditEvent(db, record);
}

function listAuditEventsForTenant(db, tenantId) {
  return authDb.listAuditEvents(db, { tenantId });
}

function listAuditEventsByType(db, eventType) {
  return authDb.listAuditEvents(db, { eventType });
}

module.exports = {
  EVENT_TYPES,
  RESULTS,
  METADATA_ALLOWLIST,
  sanitizeMetadata,
  recordAuditEvent,
  listAuditEventsForTenant,
  listAuditEventsByType,
};
