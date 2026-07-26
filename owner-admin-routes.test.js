"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt P) – Tests für die Owner-
// Kunden-/Benutzerverwaltung (owner-admin-service.js/owner-admin-routes.js).
//
// Alle Aufrufe laufen gegen den echten server.js#requestHandler mit einem
// isolierten HOME-/KUZ_DATA_DIR-Verzeichnis (gleiches Muster wie
// server-auth-routes.test.js/route-access-policy.test.js) – niemals die
// tatsächliche Application-Support-Datenbank des Entwicklungsrechners.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "owner-admin-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "owner-admin-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authAudit = require("./auth-audit");
const authTenantLink = require("./auth-tenant-link");
const server = require("./server");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const seedDb = authDb.openAuthDatabase({ dataDir: KUZ_DATA_DIR }).db;
authTenantLink.syncTenantProjections(seedDb);

const KNOWN_PASSWORD = "EinSicheresTestpasswort123";

let emailCounter = 0;
function nextEmail(label) {
  emailCounter += 1;
  return `${label}-${emailCounter}@example.test`;
}

function makeUser(overrides = {}) {
  return authDb.createUser(seedDb, {
    email: overrides.email || nextEmail("nutzer"),
    displayName: overrides.displayName || "Testnutzer",
    role: overrides.role || "OWNER",
    tenantId: overrides.tenantId ?? null,
    status: overrides.status || "ACTIVE",
    passwordHash: overrides.passwordHash !== undefined ? overrides.passwordHash : authPassword.hashPassword(KNOWN_PASSWORD),
  });
}

function invoke({ method = "GET", url, headers = {}, bodyObj }) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
    let statusCode = null;
    let responseHeaders = {};
    let rawBody = "";
    const req = {
      method,
      url,
      headers: { host: "127.0.0.1", ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      on(event, cb) {
        if (event === "data" && data !== undefined) cb(Buffer.from(data, "utf8"));
        if (event === "end") cb();
      },
      destroy() {},
    };
    const res = {
      setHeader(name, value) {
        responseHeaders[name] = value;
      },
      writeHead(code, hdrs) {
        statusCode = code;
        if (hdrs) Object.assign(responseHeaders, hdrs);
      },
      end(body = "") {
        rawBody += body;
        let json = null;
        try {
          json = rawBody ? JSON.parse(rawBody) : null;
        } catch (_error) {
          json = null;
        }
        resolve({ statusCode, headers: responseHeaders, body: rawBody, json });
      },
    };
    server.requestHandler(req, res);
  });
}

function extractCookieValue(setCookieHeader, cookieName) {
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const entry of list) {
    const match = entry.match(new RegExp(`^${cookieName}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

async function loginAndGetSession(email) {
  const result = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    bodyObj: { email, password: KNOWN_PASSWORD },
  });
  const sessionToken = extractCookieValue(result.headers["Set-Cookie"], "kuz_dev_session");
  const csrfToken = extractCookieValue(result.headers["Set-Cookie"], "kuz_dev_csrf");
  return {
    loginResult: result,
    cookieHeader: `kuz_dev_session=${sessionToken}; kuz_dev_csrf=${csrfToken}`,
    csrfToken,
  };
}

const capturedBodies = [];
function record(result) {
  capturedBodies.push(result.body);
  return result;
}

async function run() {
  const ownerUser = makeUser({ email: nextEmail("owner"), role: "OWNER" });
  const owner = await loginAndGetSession(ownerUser.emailNormalized);

  const cafeCustomerId = "test-customer-fiktives-cafe";
  const fitnessCustomerId = "test-customer-fiktives-fitnessstudio";

  // -------------------------------------------------------------------
  // 1. Zugriffsschutz: ohne OWNER-Session bleibt jede Owner-Route 404.
  // -------------------------------------------------------------------

  // Testfixture-Mandanten starten als SUSPENDED (siehe auth-tenant-link.js);
  // ein Login ist erst nach Aktivierung möglich. Für die folgenden Tests
  // wird der Café-Mandant deshalb sofort aktiviert, bevor überhaupt ein
  // Kundenkonto darauf angelegt wird.
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const customerTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);
  const customerUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: customerTenant.id, email: nextEmail("kunde-blockiert") });
  const customerSession = await loginAndGetSession(customerUser.emailNormalized);

  const blockedList = record(
    await invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: customerSession.cookieHeader } }),
  );
  await check("Kundenrolle erreicht GET /api/owner/tenants nicht (404)", () => {
    assert.strictEqual(blockedList.statusCode, 404);
  });

  const blockedActivate = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/activate`,
      headers: { cookie: customerSession.cookieHeader, "x-kuz-csrf": customerSession.csrfToken },
    }),
  );
  await check("Kundenrolle erreicht POST .../activate nicht (404)", () => {
    assert.strictEqual(blockedActivate.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 2. GET /api/owner/tenants: Liste mit sicheren Aggregatfeldern.
  // -------------------------------------------------------------------

  const listResult = record(
    await invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: owner.cookieHeader } }),
  );
  await check("OWNER erhält GET /api/owner/tenants mit 200 und einer Mandantenliste", () => {
    assert.strictEqual(listResult.statusCode, 200);
    assert.strictEqual(listResult.json.ok, true);
    assert.ok(Array.isArray(listResult.json.tenants));
    assert.ok(listResult.json.tenants.some((t) => t.customerId === cafeCustomerId));
    assert.ok(listResult.json.tenants.some((t) => t.customerId === fitnessCustomerId));
  });

  await check("Mandantenliste enthält ausschließlich die dokumentierten sicheren Felder", () => {
    const entry = listResult.json.tenants.find((t) => t.customerId === cafeCustomerId);
    assert.deepStrictEqual(
      Object.keys(entry).sort(),
      ["activeSessionCount", "createdAt", "customerId", "displayName", "lastRelevantActivityAt", "status", "userCount"].sort(),
    );
  });

  // -------------------------------------------------------------------
  // 3. Mandant aktivieren/suspendieren.
  // -------------------------------------------------------------------

  const activateResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/activate`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann einen Mandanten aktivieren (200, status ACTIVE)", () => {
    assert.strictEqual(activateResult.statusCode, 200);
    assert.strictEqual(activateResult.json.tenant.status, "ACTIVE");
  });

  const detailResult = record(
    await invoke({ method: "GET", url: `/api/owner/tenants/${cafeCustomerId}`, headers: { cookie: owner.cookieHeader } }),
  );
  await check("GET /api/owner/tenants/:customerId liefert den aktualisierten Status", () => {
    assert.strictEqual(detailResult.statusCode, 200);
    assert.strictEqual(detailResult.json.tenant.status, "ACTIVE");
  });

  const suspendResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/suspend`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann einen Mandanten suspendieren (200, status SUSPENDED)", () => {
    assert.strictEqual(suspendResult.statusCode, 200);
    assert.strictEqual(suspendResult.json.tenant.status, "SUSPENDED");
  });

  // Für den restlichen Testlauf wieder aktivieren.
  await invoke({
    method: "POST",
    url: `/api/owner/tenants/${cafeCustomerId}/activate`,
    headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
  });

  const unknownTenantResult = record(
    await invoke({
      method: "GET",
      url: "/api/owner/tenants/dieser-mandant-existiert-nicht",
      headers: { cookie: owner.cookieHeader },
    }),
  );
  await check("unbekannter Mandant liefert 404 mit generischer Meldung", () => {
    assert.strictEqual(unknownTenantResult.statusCode, 404);
    assert.strictEqual(unknownTenantResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 4. Benutzer einladen.
  // -------------------------------------------------------------------

  const inviteEmail = nextEmail("eingeladen");
  const inviteResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/users/invite`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken, "content-type": "application/json" },
      bodyObj: { email: inviteEmail, displayName: "Neuer Kunde", role: "CUSTOMER_ADMIN" },
    }),
  );
  await check("OWNER kann einen Kunden einladen (200, Status INVITED, Token nur einmalig sichtbar)", () => {
    assert.strictEqual(inviteResult.statusCode, 200);
    assert.strictEqual(inviteResult.json.user.status, "INVITED");
    assert.strictEqual(inviteResult.json.user.email, inviteEmail.toLowerCase());
    assert.strictEqual(typeof inviteResult.json.invitation.token, "string");
    assert.ok(inviteResult.json.invitation.token.length > 10);
  });

  await check("das Einladungsschema enthält keine unerwarteten Felder (kein Passwort-/Session-Leak)", () => {
    assert.deepStrictEqual(
      Object.keys(inviteResult.json.user).sort(),
      [
        "activeSessionCount",
        "displayName",
        "email",
        "invitationStatus",
        "lastLoginAt",
        "role",
        "roleLabel",
        "status",
        "userId",
      ].sort(),
    );
  });

  const invitedUserId = inviteResult.json.user.userId;

  const duplicateInviteResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/users/invite`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken, "content-type": "application/json" },
      bodyObj: { email: inviteEmail, displayName: "Zweiter Versuch", role: "CUSTOMER_ADMIN" },
    }),
  );
  await check("eine doppelte Einladung mit derselben E-Mail-Adresse wird sicher abgelehnt (409)", () => {
    assert.strictEqual(duplicateInviteResult.statusCode, 409);
    assert.strictEqual(duplicateInviteResult.json.ok, false);
  });

  const invalidRoleResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/users/invite`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken, "content-type": "application/json" },
      bodyObj: { email: nextEmail("falsche-rolle"), displayName: "Falsche Rolle", role: "OWNER" },
    }),
  );
  await check("eine Einladung mit Rolle OWNER wird abgelehnt (400) – kein zweiter Owner über die Kundenverwaltung", () => {
    assert.strictEqual(invalidRoleResult.statusCode, 400);
    assert.strictEqual(invalidRoleResult.json.ok, false);
  });

  const invalidSupportRoleResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/users/invite`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken, "content-type": "application/json" },
      bodyObj: { email: nextEmail("support-rolle"), displayName: "Support Rolle", role: "SUPPORT" },
    }),
  );
  await check("eine Einladung mit Rolle SUPPORT wird abgelehnt (400)", () => {
    assert.strictEqual(invalidSupportRoleResult.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 5. Benutzerliste je Mandant.
  // -------------------------------------------------------------------

  const usersListResult = record(
    await invoke({ method: "GET", url: `/api/owner/tenants/${cafeCustomerId}/users`, headers: { cookie: owner.cookieHeader } }),
  );
  await check("GET .../users liefert die eingeladenen Benutzer des Mandanten", () => {
    assert.strictEqual(usersListResult.statusCode, 200);
    assert.ok(usersListResult.json.users.some((u) => u.userId === invitedUserId));
  });

  await check("Benutzerliste zeigt niemals einen Einladungs-Token", () => {
    assert.doesNotMatch(usersListResult.body, /"token"/);
  });

  // -------------------------------------------------------------------
  // 6. Einladung erneuern/widerrufen.
  // -------------------------------------------------------------------

  const reissueResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${invitedUserId}/reissue-invitation`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann eine offene Einladung erneuern (200, neuer Token)", () => {
    assert.strictEqual(reissueResult.statusCode, 200);
    assert.strictEqual(typeof reissueResult.json.invitation.token, "string");
    assert.notStrictEqual(reissueResult.json.invitation.token, inviteResult.json.invitation.token);
  });

  await check("der alte Einladungs-Token ist nach der Erneuerung nicht mehr gültig", async () => {
    const acceptOld = await invoke({
      method: "POST",
      url: "/api/auth/invitation/accept",
      headers: { "content-type": "application/json" },
      bodyObj: { token: inviteResult.json.invitation.token, newPassword: "EinAnderesPasswort456" },
    });
    assert.strictEqual(acceptOld.statusCode, 400);
  });

  const revokeInvitationResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${invitedUserId}/revoke-invitation`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann eine Einladung widerrufen (200)", () => {
    assert.strictEqual(revokeInvitationResult.statusCode, 200);
  });

  await check("der widerrufene Einladungs-Token ist nicht mehr gültig", async () => {
    const acceptRevoked = await invoke({
      method: "POST",
      url: "/api/auth/invitation/accept",
      headers: { "content-type": "application/json" },
      bodyObj: { token: reissueResult.json.invitation.token, newPassword: "EinAnderesPasswort456" },
    });
    assert.strictEqual(acceptRevoked.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 7. Sperren/Reaktivieren/Sitzungen widerrufen für aktive Benutzer.
  // -------------------------------------------------------------------

  const activeUser = makeUser({
    email: nextEmail("aktiver-kunde"),
    role: "CUSTOMER_USER",
    tenantId: customerTenant.id,
    status: "ACTIVE",
  });
  const activeUserSession = await loginAndGetSession(activeUser.emailNormalized);

  const suspendUserResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${activeUser.id}/suspend`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann einen aktiven Benutzer sperren (200, status DISABLED)", () => {
    assert.strictEqual(suspendUserResult.statusCode, 200);
    assert.strictEqual(suspendUserResult.json.user.status, "DISABLED");
  });

  const blockedAfterSuspend = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: activeUserSession.cookieHeader } }),
  );
  await check("die vorhandene Session eines gesperrten Benutzers wird sofort ungültig (Route-Guard prüft Live-Status)", () => {
    // CUSTOMER_TENANT verwendet ERROR_STRATEGIES.AUTH_401 (siehe
    // route-access-policy.js#CLASS_DEFAULTS) – anders als OWNER_ONLY/
    // STATIC_AUTHENTICATED_PORTAL, die HIDDEN_404 verwenden.
    assert.strictEqual(blockedAfterSuspend.statusCode, 401);
  });

  const reactivateResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${activeUser.id}/reactivate`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann einen gesperrten Benutzer reaktivieren (200, status ACTIVE)", () => {
    assert.strictEqual(reactivateResult.statusCode, 200);
    assert.strictEqual(reactivateResult.json.user.status, "ACTIVE");
  });

  const reactivateNonDisabledResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${activeUser.id}/reactivate`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("Reaktivierung eines bereits aktiven Benutzers wird abgelehnt (409)", () => {
    assert.strictEqual(reactivateNonDisabledResult.statusCode, 409);
  });

  const revokeSessionsUser = makeUser({
    email: nextEmail("sitzungen-widerrufen"),
    role: "CUSTOMER_USER",
    tenantId: customerTenant.id,
  });
  const revokeSessionsSession = await loginAndGetSession(revokeSessionsUser.emailNormalized);
  const revokeSessionsResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${revokeSessionsUser.id}/revoke-sessions`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann alle Sitzungen eines Benutzers widerrufen (200)", () => {
    assert.strictEqual(revokeSessionsResult.statusCode, 200);
  });

  const blockedAfterRevoke = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: revokeSessionsSession.cookieHeader } }),
  );
  await check("die widerrufene Sitzung ist danach ungültig (401)", () => {
    assert.strictEqual(blockedAfterRevoke.statusCode, 401);
  });

  // -------------------------------------------------------------------
  // 8. Passwort-Reset für einen Benutzer vorbereiten.
  // -------------------------------------------------------------------

  const resetPrepUser = makeUser({
    email: nextEmail("reset-vorbereiten"),
    role: "CUSTOMER_ADMIN",
    tenantId: customerTenant.id,
  });
  const preparedResetResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${resetPrepUser.id}/prepare-password-reset`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("OWNER kann einen Passwort-Reset vorbereiten (200, verwendbarer Token)", () => {
    assert.strictEqual(preparedResetResult.statusCode, 200);
    assert.strictEqual(typeof preparedResetResult.json.passwordReset.token, "string");
  });

  await check("der vorbereitete Reset-Token funktioniert auf der öffentlichen Reset-Route", async () => {
    const confirmResult = await invoke({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      headers: { "content-type": "application/json" },
      bodyObj: { token: preparedResetResult.json.passwordReset.token, newPassword: "EinGanzNeuesPasswort789" },
    });
    assert.strictEqual(confirmResult.statusCode, 200);
  });

  const resetForInvitedUserResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${activeUser.id}/prepare-password-reset`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("ein Passwort-Reset für einen aktiven Benutzer funktioniert weiterhin (200)", () => {
    assert.strictEqual(resetForInvitedUserResult.statusCode, 200);
  });

  const invitedOnlyUser = makeUser({
    email: nextEmail("nur-eingeladen"),
    role: "CUSTOMER_USER",
    tenantId: customerTenant.id,
    status: "INVITED",
    passwordHash: null,
  });
  const resetForPendingInviteResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/users/${invitedOnlyUser.id}/prepare-password-reset`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    }),
  );
  await check("ein Passwort-Reset für ein rein eingeladenes (noch nicht aktives) Konto wird abgelehnt (409)", () => {
    assert.strictEqual(resetForPendingInviteResult.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 9. Unbekannter Benutzer bei allen Aktionsrouten → 404.
  // -------------------------------------------------------------------

  await check("eine Aktion für einen unbekannten Benutzer liefert generisch 404", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/owner/users/dieser-benutzer-existiert-nicht/suspend",
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 10. CSRF-Schutz gilt auch für Owner-Aktionsrouten.
  // -------------------------------------------------------------------

  const csrfMissingResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/activate`,
      headers: { cookie: owner.cookieHeader },
    }),
  );
  await check("eine Owner-Aktion ohne CSRF-Header wird abgelehnt (403)", () => {
    assert.strictEqual(csrfMissingResult.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 11. Unbekannte Felder im Einladungskörper werden abgewiesen.
  // -------------------------------------------------------------------

  const unknownFieldResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${cafeCustomerId}/users/invite`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken, "content-type": "application/json" },
      bodyObj: { email: nextEmail("unbekanntes-feld"), displayName: "Test", role: "CUSTOMER_USER", isAdmin: true },
    }),
  );
  await check("unbekannte Felder im Einladungskörper werden defensiv abgewiesen (400)", () => {
    assert.strictEqual(unknownFieldResult.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 12. Audit-Ereignisse ohne Geheimnisse.
  // -------------------------------------------------------------------

  await check("Owner-Aktionen erzeugen die erwarteten Audit-Ereignistypen", () => {
    const expectedTypes = [
      "TENANT_ACTIVATED",
      "TENANT_SUSPENDED",
      "USER_INVITED",
      "INVITATION_REISSUED",
      "INVITATION_REVOKED",
      "USER_SUSPENDED",
      "USER_REACTIVATED",
      "USER_SESSIONS_REVOKED",
      "PASSWORD_RESET_PREPARED",
    ];
    const missing = expectedTypes.filter((eventType) => authAudit.listAuditEventsByType(seedDb, eventType).length === 0);
    assert.deepStrictEqual(missing, []);
  });

  await check("keine erfasste Antwort enthält Stacktraces, Pfade oder Passwort-Hashes", () => {
    capturedBodies.forEach((body) => {
      assert.doesNotMatch(body, /\/Users\//);
      assert.doesNotMatch(body, /at [A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]* \(/);
      assert.doesNotMatch(body, /scrypt\$/);
    });
  });

  console.log(`owner-admin-routes.test.js: ${passed} Prüfpunkte erfolgreich`);

  authDb.closeAuthDatabase(seedDb);
  fs.rmSync(FAKE_HOME_DIR, { recursive: true, force: true });
  fs.rmSync(KUZ_DATA_DIR, { recursive: true, force: true });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
