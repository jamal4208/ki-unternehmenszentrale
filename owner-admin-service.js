"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt G/H) – Owner-Kunden- und
// Benutzerverwaltung: reine Geschäftslogik. Kennt weder HTTP noch Request-/
// Response-Objekte (gleiches Trennungsmuster wie auth-session.js gegenüber
// auth-http-routes.js). Persistenz ausschließlich über auth-db.js – dieses
// Modul importiert NIEMALS better-sqlite3 selbst.
//
// Wiederverwendung statt Duplikation (Auftrag Abschnitt B.3):
// - agency-tenant-registry.js/auth-tenant-link.js bleiben die alleinige
//   Wahrheitsquelle für kanonische Mandanten.
// - auth-http-routes.js#generateAndStoreToken/roleLabel werden für die
//   Owner-Ausgabe von Einladungs-/Reset-Token wiederverwendet statt
//   dupliziert.
// - Sessionwiderruf läuft ausschließlich über auth-db.js/auth-session.js.

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const authHttpRoutes = require("./auth-http-routes");
const authTenantLink = require("./auth-tenant-link");

const INVITABLE_ROLES = Object.freeze(["CUSTOMER_ADMIN", "CUSTOMER_USER"]);

class OwnerAdminError extends Error {
  constructor(statusCode, reasonCode, message) {
    super(message || "Aktion nicht möglich.");
    this.name = "OwnerAdminError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function notFound(message) {
  return new OwnerAdminError(404, "NOT_FOUND", message || "Nicht gefunden.");
}

function badRequest(message) {
  return new OwnerAdminError(400, "BAD_REQUEST", message || "Anfrage ungültig.");
}

function conflict(message) {
  return new OwnerAdminError(409, "CONFLICT", message || "Aktion steht im Widerspruch zum aktuellen Zustand.");
}

function auditSafe(db, { eventType, result, actorUserId, tenantId, routeName, reasonCode, roleLabelValue }) {
  if (!db) return;
  try {
    const metadata = {};
    if (routeName) metadata.routeName = routeName;
    if (reasonCode) metadata.reasonCode = reasonCode;
    if (roleLabelValue) metadata.roleLabel = roleLabelValue;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: tenantId || null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf eine Owner-Aktion niemals zum Absturz bringen. */
  }
}

// ---------------------------------------------------------------------------
// Mandanten.
// ---------------------------------------------------------------------------

// Aggregiert Anzeigefelder ausschließlich aus bereits vorhandenen, sicheren
// Quellen (keine Passwort-/Session-/IP-/User-Agent-Hashes, keine Tokens,
// siehe Auftrag Abschnitt G: "Nicht anzeigen").
function tenantSummary(db, projection, now) {
  const users = authDb.listUsersByTenantId(db, projection.id);
  const activeSessionCount = users.reduce(
    (sum, user) => sum + authDb.listActiveSessionsForUser(db, user.id, now).length,
    0,
  );
  const events = authAudit.listAuditEventsForTenant(db, projection.id);
  const lastRelevantActivityAt = events.length > 0 ? events[events.length - 1].timestamp : null;
  return {
    customerId: projection.customerId,
    displayName: projection.displayName,
    status: projection.status,
    userCount: users.length,
    activeSessionCount,
    createdAt: projection.createdAt,
    lastRelevantActivityAt,
  };
}

function listTenants(db) {
  const now = nowIso();
  return authDb
    .listTenantProjections(db)
    .map((projection) => tenantSummary(db, projection, now))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
}

function requireCanonicalTenantProjection(db, customerId) {
  if (!authTenantLink.canonicalCustomerExists(customerId)) {
    throw notFound("Mandant unbekannt.");
  }
  const projection = authDb.getTenantProjectionByCustomerId(db, customerId);
  if (!projection) {
    // Kann nur eintreten, wenn der Serverstart-Abgleich (auth-tenant-link.js)
    // noch nicht gelaufen ist – fail-closed statt einer erfundenen Zeile.
    throw notFound("Mandant unbekannt.");
  }
  return projection;
}

function getTenantDetail(db, customerId) {
  const projection = requireCanonicalTenantProjection(db, customerId);
  return tenantSummary(db, projection, nowIso());
}

function activateTenant(db, customerId, actorUserId) {
  const projection = requireCanonicalTenantProjection(db, customerId);
  const now = nowIso();
  const updated = authDb.updateTenantStatus(db, projection.customerId, "ACTIVE", now);
  auditSafe(db, {
    eventType: "TENANT_ACTIVATED",
    result: "OK",
    actorUserId,
    tenantId: projection.id,
    routeName: "owner-tenant-activate",
  });
  return tenantSummary(db, updated, now);
}

function suspendTenant(db, customerId, actorUserId) {
  const projection = requireCanonicalTenantProjection(db, customerId);
  const now = nowIso();
  const updated = authDb.updateTenantStatus(db, projection.customerId, "SUSPENDED", now);
  auditSafe(db, {
    eventType: "TENANT_SUSPENDED",
    result: "OK",
    actorUserId,
    tenantId: projection.id,
    routeName: "owner-tenant-suspend",
  });
  return tenantSummary(db, updated, now);
}

// ---------------------------------------------------------------------------
// Benutzer je Mandant.
// ---------------------------------------------------------------------------

function invitationStatusLabel(db, user, now) {
  if (user.status !== "INVITED") return "Nicht zutreffend";
  const pending = authDb.findLatestPendingTokenForUser(db, user.id, "INVITE", now);
  return pending ? "Eingeladen – Link aktiv" : "Eingeladen – kein aktiver Link";
}

function userSummary(db, user, now) {
  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.emailNormalized,
    role: user.role,
    roleLabel: authHttpRoutes.roleLabel(user.role),
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    activeSessionCount: authDb.listActiveSessionsForUser(db, user.id, now).length,
    invitationStatus: invitationStatusLabel(db, user, now),
  };
}

function listUsersForTenant(db, customerId) {
  const projection = requireCanonicalTenantProjection(db, customerId);
  const now = nowIso();
  return authDb
    .listUsersByTenantId(db, projection.id)
    .map((user) => userSummary(db, user, now))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
}

function findUserOrThrow(db, userId) {
  const user = authDb.getUserById(db, userId);
  if (!user) throw notFound("Benutzer unbekannt.");
  return user;
}

// V7.2 Phase A Schritt 4 (Auftrag Abschnitt G/R, Befund der Architektur-
// prüfung) – die Benutzeraktionsrouten (.../suspend, .../reactivate,
// .../revoke-sessions, .../reissue-invitation, .../revoke-invitation,
// .../prepare-password-reset) sind laut Auftrag ausschließlich
// "Kundenverwaltung". Ohne diese Prüfung könnte eine gültige OWNER-Session
// über dieselbe Fläche auch eine fremde OWNER- oder SUPPORT-Benutzer-ID
// adressieren (z. B. eine andere Owner-Instanz sperren) – außerhalb der
// erklärten Grenze dieser Verwaltung. Generisches 404 (wie bei jedem
// unbekannten Benutzer), damit keine Rolleninformation über eine
// existierende, aber unzuständige Benutzer-ID preisgegeben wird.
function findCustomerUserOrThrow(db, userId) {
  const user = findUserOrThrow(db, userId);
  if (!INVITABLE_ROLES.includes(user.role)) {
    throw notFound("Benutzer unbekannt.");
  }
  return user;
}

// Owner kann ausschließlich Kunden innerhalb eines Mandanten einladen –
// weder eine zweite OWNER-Rolle noch SUPPORT (Auftrag Abschnitt G:
// "Verbindliche Grenzen").
function inviteUser(db, customerId, input, actorUserId) {
  const projection = requireCanonicalTenantProjection(db, customerId);
  const role = input && input.role;
  if (!INVITABLE_ROLES.includes(role)) {
    throw badRequest("Rolle muss CUSTOMER_ADMIN oder CUSTOMER_USER sein.");
  }
  const email = String((input && input.email) || "").trim().toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  if (!email || !email.includes("@")) {
    throw badRequest("E-Mail-Adresse fehlt oder ist ungültig.");
  }
  if (!displayName) {
    throw badRequest("Anzeigename fehlt.");
  }
  if (authDb.getUserByEmailNormalized(db, email)) {
    // Bewusst kein 404/differenzierter Hinweis, welchem Mandanten die
    // E-Mail bereits gehört – nur die Tatsache des Konflikts (Auftrag
    // Test #15: "doppelte E-Mail sicher behandelt").
    throw conflict("E-Mail-Adresse ist bereits vergeben.");
  }

  const now = nowIso();
  let user;
  try {
    user = authDb.createUser(db, {
      email,
      displayName,
      role,
      tenantId: projection.id,
      status: "INVITED",
      passwordHash: null,
      now,
    });
  } catch (_error) {
    // Verteidigung in der Tiefe gegen eine Wettlaufsituation zwischen der
    // Prüfung oben und dem tatsächlichen INSERT (UNIQUE-Constraint).
    throw conflict("E-Mail-Adresse ist bereits vergeben.");
  }

  const rawInviteToken = authHttpRoutes.generateAndStoreToken(db, user.id, "INVITE", now);
  auditSafe(db, {
    eventType: "USER_INVITED",
    result: "OK",
    actorUserId,
    tenantId: projection.id,
    routeName: "owner-user-invite",
    roleLabelValue: authHttpRoutes.roleLabel(role),
  });

  return {
    user: userSummary(db, user, now),
    // Auftrag Abschnitt H: "kontrollierter Owner-Ausgabeweg", "nur direkt
    // als Ergebnis der expliziten Erzeugungsaktion", "niemals in
    // Listenansichten" – rawInviteToken existiert ausschließlich in dieser
    // einen Rückgabe, nirgendwo sonst im Modul.
    rawInviteToken,
  };
}

function suspendUser(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  const now = nowIso();
  const updated = authDb.updateUserStatus(db, userId, "DISABLED", now);
  auditSafe(db, {
    eventType: "USER_SUSPENDED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    routeName: "owner-user-suspend",
  });
  return userSummary(db, updated, now);
}

function reactivateUser(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  if (user.status !== "DISABLED") {
    throw conflict("Nur gesperrte Benutzer können reaktiviert werden.");
  }
  const now = nowIso();
  const updated = authDb.updateUserStatus(db, userId, "ACTIVE", now);
  authDb.resetFailedLoginCount(db, userId, now);
  auditSafe(db, {
    eventType: "USER_REACTIVATED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    routeName: "owner-user-reactivate",
  });
  return userSummary(db, updated, now);
}

function revokeSessionsForUser(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  const now = nowIso();
  authDb.revokeAllSessionsForUser(db, userId, now);
  auditSafe(db, {
    eventType: "USER_SESSIONS_REVOKED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    routeName: "owner-user-revoke-sessions",
  });
  return userSummary(db, authDb.getUserById(db, userId), now);
}

function reissueInvitation(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  if (user.status !== "INVITED") {
    throw conflict("Nur eingeladene, noch nicht aktivierte Benutzer können eine neue Einladung erhalten.");
  }
  const now = nowIso();
  authDb.revokePendingTokensForUser(db, userId, "INVITE", now);
  const rawInviteToken = authHttpRoutes.generateAndStoreToken(db, userId, "INVITE", now);
  auditSafe(db, {
    eventType: "INVITATION_REISSUED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    routeName: "owner-user-reissue-invitation",
  });
  return { user: userSummary(db, user, now), rawInviteToken };
}

function revokeInvitation(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  if (user.status !== "INVITED") {
    throw conflict("Nur eine offene Einladung kann widerrufen werden.");
  }
  const now = nowIso();
  authDb.revokePendingTokensForUser(db, userId, "INVITE", now);
  auditSafe(db, {
    eventType: "INVITATION_REVOKED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    routeName: "owner-user-revoke-invitation",
  });
  return userSummary(db, user, now);
}

function preparePasswordReset(db, userId, actorUserId) {
  const user = findCustomerUserOrThrow(db, userId);
  if (!["ACTIVE", "LOCKED"].includes(user.status)) {
    throw conflict("Für diesen Benutzer kann kein Passwort-Reset vorbereitet werden.");
  }
  const now = nowIso();
  const rawResetToken = authHttpRoutes.generateAndStoreToken(db, userId, "RESET", now);
  auditSafe(db, {
    eventType: "PASSWORD_RESET_PREPARED",
    result: "OK",
    actorUserId,
    tenantId: user.tenantId,
    // Kein "password" im routeName: auth-audit.js weist Metadaten mit
    // sensibel wirkenden Inhalten unabhängig vom Feldnamen fail-closed ab.
    routeName: "owner-user-prepare-reset",
  });
  return { user: userSummary(db, user, now), rawResetToken };
}

module.exports = {
  OwnerAdminError,
  INVITABLE_ROLES,
  listTenants,
  getTenantDetail,
  activateTenant,
  suspendTenant,
  listUsersForTenant,
  inviteUser,
  suspendUser,
  reactivateUser,
  revokeSessionsForUser,
  reissueInvitation,
  revokeInvitation,
  preparePasswordReset,
};
