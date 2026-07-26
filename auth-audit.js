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
const METADATA_ALLOWLIST = Object.freeze([
  "routeName",
  "roleLabel",
  "reasonCode",
  "workOrderId",
  "statusTransition",
  "severity",
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
