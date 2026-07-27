"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt D).
//
// Lokales Identitäts-/Kontenmodell für die drei bekannten
// Unternehmensidentitäten. Dieses Modul importiert KEIN better-sqlite3
// selbst (erhält stets ein bereits geöffnetes Datenbankobjekt, gleiches
// Prinzip wie agent-hr-coaching-service.js) und führt NIEMALS eine
// Google-Anmeldung, kein OAuth, keinen Netzwerkaufruf aus.
//
// Sicherheitsregeln (Auftrag Abschnitt D, nicht verhandelbar):
// - kein Passwort-, Token- oder Recovery-Code-Feld existiert überhaupt
// - agentDirectLoginAllowed ist per Migration-15-CHECK-Constraint hart auf 0
//   fixiert (siehe auth-db-migrations.js) – kein Agent erhält je eigene
//   Zugangsdaten
// - Identitätsstatus darf ausdrücklich UNCONFIRMED-artig bleiben
//   ("ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION" für
//   office@jacogbr.de, falls lokal nicht nachweisbar eingerichtet) – keine
//   Annahme wird als Tatsache dokumentiert
// - keine externe Verifikation, kein Zugriff auf ein echtes Postfach/
//   Kalender/Drive/Kontaktbuch

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");

const IDENTITY_TYPE_VALUES = migrations.EXTERNAL_IDENTITY_TYPE_VALUES;
const PROVIDER_VALUES = migrations.EXTERNAL_IDENTITY_PROVIDER_VALUES;
const PERMISSION_LEVEL_VALUES = migrations.PROVIDER_PERMISSION_LEVEL_VALUES;
const AUTHENTICATION_STATE_VALUES = migrations.EXTERNAL_IDENTITY_AUTHENTICATION_STATE_VALUES;
const RECOVERY_STATE_VALUES = migrations.EXTERNAL_IDENTITY_RECOVERY_STATE_VALUES;
const TWO_FACTOR_STATE_VALUES = migrations.EXTERNAL_IDENTITY_TWO_FACTOR_STATE_VALUES;
const IDENTITY_STATUS_VALUES = migrations.EXTERNAL_IDENTITY_STATUS_VALUES;

class ExternalIdentityError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ExternalIdentityError";
    this.statusCode = statusCode;
  }
}

function badRequest(message) {
  return new ExternalIdentityError(message, 400);
}
function notFound(message) {
  return new ExternalIdentityError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

const IDENTITY_TYPE_LABELS_DE = Object.freeze({
  OWNER_PERSONAL: "Persönliches Eigentümerkonto",
  COMPANY_OFFICE: "Zentraler Unternehmens-/Agentenarbeitsraum",
  PUBLIC_INBOX: "Öffentliche Außen-/Erstkontaktadresse",
  DEPARTMENT_ALIAS: "Abteilungs-Alias",
  SERVICE_IDENTITY: "Technische Dienstidentität",
});

const IDENTITY_STATUS_LABELS_DE = Object.freeze({
  ACTIVE: "Aktiv (real bestehend)",
  PLANNED: "Geplant, noch nicht eingerichtet",
  ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION: "Extern vorbereitet oder noch unbestätigt",
  USER_ACCOUNT_OR_ALIAS_UNCONFIRMED: "Vollkonto oder Alias lokal nicht unterscheidbar",
  INACTIVE: "Inaktiv",
});

// ---------------------------------------------------------------------------
// D. Drei Startidentitäten (Auftrag: "Bekannte Unternehmensidentitäten").
// Bewusst hier als Konstante statt aus einer weiteren, externen Quelle
// gelesen – dies IST die einzige Quelle für die drei Startidentitäten
// (keine zweite, parallele Kontenliste).
//
// Nachtrag "Identitätsmodell und reproduzierbaren Gesamttest vor dem Commit
// abschließend klären": fachliche Trennung zwischen "provider" (technischer
// Konto-/Mailanbieter) und "identityType" (geschäftliche Rolle). Apple-first
// beschreibt Jamals persönlichen Arbeitsraum für Kalender, Kontakte,
// Notizen, Erinnerungen, Fotos und private Dokumente (siehe
// APPLE_GOOGLE_OPERATING_MODEL.md) – das ist eine Systemzuständigkeit und
// KEINE Aussage über den technischen Mailanbieter einer @jacogbr.de-Adresse.
// Alle drei bekannten @jacogbr.de-Adressen sind geschäftliche Adressen der
// Unternehmensdomäne und werden deshalb grundsätzlich als
// GOOGLE_WORKSPACE-Identitäten modelliert, sofern keine technische
// Bestätigung dagegen vorliegt. Es existiert bewusst KEINE erfundene
// Apple-E-Mail-Identität für Jamal – Apple bleibt ausschließlich als
// Systemzuständigkeit in APPLE_GOOGLE_OPERATING_MODEL.md verankert.
const STARTER_IDENTITIES = Object.freeze([
  {
    emailAddress: "jamal@jacogbr.de",
    displayName: "Jamal (persönlich)",
    identityType: "OWNER_PERSONAL",
    provider: "GOOGLE_WORKSPACE",
    intendedPurpose: "Persönliches Geschäftsführer-, Eigentümer- und Freigabekonto der Unternehmensdomäne jacogbr.de.",
    owner: "Jamal",
    loginAllowed: true,
    inboxAvailable: true,
    calendarAvailable: true,
    driveAvailable: true,
    contactsAvailable: true,
    writePermissionState: "DISCONNECTED",
    authenticationState: "NOT_AUTHENTICATED",
    recoveryState: "UNKNOWN",
    twoFactorState: "UNKNOWN",
    // Lokal nicht nachweisbar eingerichtet/bestätigt – keine Annahme als
    // Tatsache dokumentiert (gleicher ehrlicher Statuswortlaut wie
    // office@jacogbr.de, da für beide Adressen dieselbe technische
    // Unbestätigtheit gilt).
    status: "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION",
    notes: "jacogbr.de-Geschäftsadresse, technisch als Google Workspace modelliert; lokal nicht nachweisbar bestätigt. Apple bleibt unabhängig davon Jamals persönlicher Arbeitsraum (Kalender/Kontakte/Notizen/Erinnerungen/Fotos/private Dokumente) – das ist eine Systemzuständigkeit, keine Aussage über den Mailanbieter dieser Adresse. Kein Korridor liest oder migriert Apple-Daten in V7.6.1.",
  },
  {
    emailAddress: "office@jacogbr.de",
    displayName: "Unternehmens-Office",
    identityType: "COMPANY_OFFICE",
    provider: "GOOGLE_WORKSPACE",
    intendedPurpose: "Geplanter bzw. neu angelegter zentraler Unternehmens- und Agentenarbeitsraum (Google-controlled).",
    owner: "Unternehmen (Jamal verantwortlich)",
    loginAllowed: true,
    inboxAvailable: true,
    calendarAvailable: true,
    driveAvailable: true,
    contactsAvailable: true,
    writePermissionState: "DISCONNECTED",
    authenticationState: "NOT_AUTHENTICATED",
    recoveryState: "UNKNOWN",
    twoFactorState: "UNKNOWN",
    // Lokal nicht nachweisbar eingerichtet – keine Annahme als Tatsache
    // dokumentiert (Auftrag: exakter Statuswortlaut).
    status: "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION",
    notes: "Lokal nicht nachweisbar eingerichtet. Keine Annahme als Tatsache – Bestätigung folgt in einem separaten, späteren Schritt außerhalb von Cursor.",
  },
  {
    emailAddress: "info@jacogbr.de",
    displayName: "Allgemeiner Erstkontakt",
    identityType: "PUBLIC_INBOX",
    provider: "GOOGLE_WORKSPACE",
    intendedPurpose: "Allgemeine Außen- und Erstkontaktadresse der Unternehmensdomäne jacogbr.de.",
    owner: "Unternehmen",
    loginAllowed: false,
    inboxAvailable: true,
    calendarAvailable: false,
    driveAvailable: false,
    contactsAvailable: false,
    writePermissionState: "DISCONNECTED",
    authenticationState: "NOT_AUTHENTICATED",
    recoveryState: "UNKNOWN",
    twoFactorState: "UNKNOWN",
    // Lokal nicht unterscheidbar, ob vollwertiges Konto oder lediglich ein
    // Alias/eine Weiterleitung auf ein anderes Postfach vorliegt – bewusst
    // keine Tatsachenbehauptung in beide Richtungen, keine externe
    // Verifikation.
    status: "USER_ACCOUNT_OR_ALIAS_UNCONFIRMED",
    notes: "Ob diese Adresse ein eigenständiges Konto oder nur ein Alias/eine Weiterleitung ist, ist lokal nicht feststellbar und wird nicht behauptet. Keine Verbindung, kein Lesezugriff in V7.6.1.",
  },
]);

// Idempotente Seed-Funktion (gleiches Muster wie technology-radar-service.js#
// ensureSeedFromToolRegistry): legt fehlende Startidentitäten an, verändert
// niemals eine bereits bestehende Zeile (Jamal kann status/notes über
// reviewExternalIdentity abweichend pflegen, ohne dass ein erneuter
// Serverstart dies überschreibt).
function ensureSeedIdentities(db, options = {}) {
  const now = options.now || new Date();
  const createdAt = nowIso(now);
  let createdCount = 0;
  STARTER_IDENTITIES.forEach((starter) => {
    const existing = authDb.getExternalIdentityByEmail(db, starter.emailAddress);
    if (existing) return;
    authDb.insertExternalIdentity(db, {
      id: crypto.randomUUID(),
      ...starter,
      createdAt,
      updatedAt: createdAt,
    });
    createdCount += 1;
  });
  return { createdCount };
}

function rowToIdentityView(row) {
  if (!row) return null;
  return {
    id: row.id,
    emailAddress: row.emailAddress,
    displayName: row.displayName,
    identityType: row.identityType,
    identityTypeLabel: IDENTITY_TYPE_LABELS_DE[row.identityType] || row.identityType,
    provider: row.provider,
    intendedPurpose: row.intendedPurpose,
    owner: row.owner,
    loginAllowed: Boolean(row.loginAllowed),
    agentDirectLoginAllowed: false,
    inboxAvailable: Boolean(row.inboxAvailable),
    calendarAvailable: Boolean(row.calendarAvailable),
    driveAvailable: Boolean(row.driveAvailable),
    contactsAvailable: Boolean(row.contactsAvailable),
    writePermissionState: row.writePermissionState,
    authenticationState: row.authenticationState,
    recoveryState: row.recoveryState,
    twoFactorState: row.twoFactorState,
    status: row.status,
    statusLabel: IDENTITY_STATUS_LABELS_DE[row.status] || row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    noRealConnection: true,
    noPasswordOrTokenStored: true,
  };
}

function listIdentities(db) {
  ensureSeedIdentities(db);
  return authDb.listExternalIdentities(db).map(rowToIdentityView);
}

function getIdentityById(db, identityId) {
  const row = authDb.getExternalIdentityById(db, identityId);
  return row ? rowToIdentityView(row) : null;
}

// D. Prüfung/Pflege einer Identität durch Jamal – ändert ausschließlich
// status/notes, niemals inboxAvailable/writePermissionState/provider o. ä.
// (das bleibt die strukturelle Definition der Identität selbst).
function reviewIdentity(db, options = {}) {
  const identityId = options.identityId;
  if (!identityId) throw badRequest("identityId ist erforderlich.");
  const row = authDb.getExternalIdentityById(db, identityId);
  if (!row) throw notFound("Diese Identität wurde nicht gefunden.");
  const status = options.status || row.status;
  if (!IDENTITY_STATUS_VALUES.includes(status)) {
    throw badRequest("Ein gültiger Identitätsstatus ist erforderlich.");
  }
  const now = options.now || new Date();
  const updated = authDb.updateExternalIdentityReview(db, {
    id: identityId,
    status,
    notes: options.notes !== undefined ? truncate(options.notes, 500) : row.notes,
    updatedAt: nowIso(now),
  });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "EXTERNAL_IDENTITY_REVIEWED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { identityId },
    });
  } catch (_error) {
    /* Audit darf eine bereits erfolgreiche Prüfung nicht rückgängig machen. */
  }

  return rowToIdentityView(updated);
}

module.exports = {
  IDENTITY_TYPE_VALUES,
  PROVIDER_VALUES,
  PERMISSION_LEVEL_VALUES,
  AUTHENTICATION_STATE_VALUES,
  RECOVERY_STATE_VALUES,
  TWO_FACTOR_STATE_VALUES,
  IDENTITY_STATUS_VALUES,
  STARTER_IDENTITIES,
  ExternalIdentityError,
  ensureSeedIdentities,
  listIdentities,
  getIdentityById,
  reviewIdentity,
};
