"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt P) – Tests für das Kundenportal-
// Backend (customer-portal-service.js/customer-portal-routes.js).
//
// Alle Aufrufe laufen gegen den echten server.js#requestHandler mit einem
// isolierten HOME-/KUZ_DATA_DIR-Verzeichnis (gleiches Muster wie
// owner-admin-routes.test.js/route-access-policy.test.js) – niemals die
// tatsächliche Application-Support-Datenbank des Entwicklungsrechners.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "customer-portal-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "customer-portal-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
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
    role: overrides.role || "CUSTOMER_ADMIN",
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
  // Testfixture-Mandanten starten als SUSPENDED (siehe auth-tenant-link.js);
  // ein Login ist erst nach Aktivierung möglich (gleiche Ursache wie in
  // owner-admin-routes.test.js).
  const cafeCustomerId = "test-customer-fiktives-cafe";
  const fitnessCustomerId = "test-customer-fiktives-fitnessstudio";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);
  const fitnessTenant = authDb.getTenantProjectionByCustomerId(seedDb, fitnessCustomerId);

  // -------------------------------------------------------------------
  // 1. Ohne Session: 401 (CUSTOMER_TENANT verwendet ERROR_STRATEGIES.
  //    AUTH_401, siehe route-access-policy.js#CLASS_DEFAULTS).
  // -------------------------------------------------------------------

  const meWithoutSession = record(await invoke({ method: "GET", url: "/api/portal/me" }));
  await check("GET /api/portal/me ohne Session liefert 401", () => {
    assert.strictEqual(meWithoutSession.statusCode, 401);
  });

  const statusWithoutSession = record(await invoke({ method: "GET", url: "/api/portal/status" }));
  await check("GET /api/portal/status ohne Session liefert 401", () => {
    assert.strictEqual(statusWithoutSession.statusCode, 401);
  });

  // -------------------------------------------------------------------
  // 2. CUSTOMER_ADMIN sieht die eigenen sechs dokumentierten Felder.
  // -------------------------------------------------------------------

  const cafeAdmin = makeUser({
    role: "CUSTOMER_ADMIN",
    tenantId: cafeTenant.id,
    displayName: "Anna Beispiel",
    email: nextEmail("cafe-admin"),
  });
  const cafeAdminSession = await loginAndGetSession(cafeAdmin.emailNormalized);

  const meResult = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: cafeAdminSession.cookieHeader } }),
  );
  await check("GET /api/portal/me liefert 200 für angemeldeten Kunden", () => {
    assert.strictEqual(meResult.statusCode, 200);
    assert.strictEqual(meResult.json.ok, true);
  });

  await check("GET /api/portal/me enthält genau die dokumentierten Felder (Auftrag Abschnitt I)", () => {
    const expectedKeys = ["ok", "displayName", "email", "roleLabel", "tenantDisplayName", "accountStatusLabel", "lastLoginAt"];
    assert.deepStrictEqual(Object.keys(meResult.json).sort(), [...expectedKeys].sort());
  });

  await check("GET /api/portal/me liefert die korrekten Werte (Name, E-Mail, Rolle, Mandant)", () => {
    assert.strictEqual(meResult.json.displayName, "Anna Beispiel");
    assert.strictEqual(meResult.json.email, cafeAdmin.emailNormalized);
    assert.strictEqual(meResult.json.roleLabel, "Kunde (Admin)");
    assert.strictEqual(meResult.json.tenantDisplayName, cafeTenant.displayName);
    assert.strictEqual(meResult.json.accountStatusLabel, "Aktiv");
  });

  await check("GET /api/portal/me enthält niemals interne IDs, Passwort-Hashes, Tokens oder Session-Kennungen", () => {
    const serialized = JSON.stringify(meResult.json);
    assert.ok(!/userId|tenantId|customerId|passwordHash|sessionId/i.test(serialized));
    assert.ok(!/[a-f0-9]{32,}/i.test(serialized));
  });

  // -------------------------------------------------------------------
  // 3. lastLoginAt: vor dem ersten Login null, danach gesetzt.
  // -------------------------------------------------------------------

  const freshUser = makeUser({ role: "CUSTOMER_USER", tenantId: cafeTenant.id, email: nextEmail("frisch") });
  await check("vor dem ersten Login ist lastLoginAt in der Datenbank null", () => {
    assert.strictEqual(freshUser.lastLoginAt, null);
  });
  const freshSession = await loginAndGetSession(freshUser.emailNormalized);
  const freshMe = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: freshSession.cookieHeader } }),
  );
  await check("nach dem ersten Login liefert /api/portal/me einen gesetzten lastLoginAt-Zeitstempel", () => {
    assert.strictEqual(typeof freshMe.json.lastLoginAt, "string");
    assert.ok(freshMe.json.lastLoginAt.length > 0);
  });

  // -------------------------------------------------------------------
  // 4. CUSTOMER_USER ist ebenfalls erlaubt (allowedRoles der Policy).
  // -------------------------------------------------------------------

  await check("CUSTOMER_USER erhält ebenfalls 200 auf /api/portal/me", () => {
    assert.strictEqual(freshMe.statusCode, 200);
    assert.strictEqual(freshMe.json.roleLabel, "Kunde");
  });

  // -------------------------------------------------------------------
  // 5. OWNER und SUPPORT sind für CUSTOMER_TENANT nicht in allowedRoles
  //    und werden generisch mit 404 abgelehnt (ROLE_DENIED, siehe
  //    auth-route-guard.js#decideForPolicy – bewusst kein 403, um keine
  //    Rolleninformation an den Client zu verraten).
  // -------------------------------------------------------------------

  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);
  const ownerMe = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: ownerSession.cookieHeader } }),
  );
  await check("OWNER erreicht /api/portal/me nicht (404, keine Kundenportal-Route für Owner)", () => {
    assert.strictEqual(ownerMe.statusCode, 404);
  });

  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);
  const supportMe = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: supportSession.cookieHeader } }),
  );
  await check("SUPPORT erreicht /api/portal/me nicht (404, keine pauschale Support-Bypass-Regel)", () => {
    assert.strictEqual(supportMe.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 6. Mandantentrennung: ein zweiter Kunde eines anderen Mandanten sieht
  //    nur seine eigenen Daten, niemals die des Café-Mandanten.
  // -------------------------------------------------------------------

  const fitnessAdmin = makeUser({
    role: "CUSTOMER_ADMIN",
    tenantId: fitnessTenant.id,
    displayName: "Bruno Muster",
    email: nextEmail("fitness-admin"),
  });
  const fitnessSession = await loginAndGetSession(fitnessAdmin.emailNormalized);
  const fitnessMe = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: fitnessSession.cookieHeader } }),
  );
  await check("ein Kunde des Fitnessstudio-Mandanten sieht ausschließlich dessen Mandantennamen", () => {
    assert.strictEqual(fitnessMe.json.tenantDisplayName, fitnessTenant.displayName);
    assert.notStrictEqual(fitnessMe.json.tenantDisplayName, cafeTenant.displayName);
    assert.strictEqual(fitnessMe.json.displayName, "Bruno Muster");
  });

  // -------------------------------------------------------------------
  // 7. Mandanten-Mismatch: ein expliziter, abweichender customerId-
  //    Parameter wird generisch mit 404 blockiert (Auftrag Abschnitt L).
  // -------------------------------------------------------------------

  const mismatchResult = record(
    await invoke({
      method: "GET",
      url: `/api/portal/me?customerId=${fitnessCustomerId}`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    }),
  );
  await check("ein abweichender customerId-Parameter wird generisch mit 404 blockiert (Tenant-Mismatch)", () => {
    assert.strictEqual(mismatchResult.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 8. /api/portal/status: statischer, ehrlicher Bereitschaftsstatus.
  //    V7.2 Phase B Schritt 1 (Auftrag Abschnitt D/O) schaltet erstmals
  //    Arbeitsaufträge frei (anlegen, prüfen, Status verfolgen);
  //    Veröffentlichung und Billing bleiben weiterhin bewusst deaktiviert
  //    (Auftrag Ziel 10).
  // -------------------------------------------------------------------

  const statusResult = record(
    await invoke({ method: "GET", url: "/api/portal/status", headers: { cookie: cafeAdminSession.cookieHeader } }),
  );
  await check("GET /api/portal/status liefert 200 mit dem erwarteten Bereitschaftsstatus", () => {
    assert.strictEqual(statusResult.statusCode, 200);
    assert.strictEqual(statusResult.json.ok, true);
    assert.strictEqual(statusResult.json.portalReady, true);
    assert.strictEqual(statusResult.json.workOrdersEnabled, true);
    assert.strictEqual(statusResult.json.publicationEnabled, false);
    assert.strictEqual(statusResult.json.billingEnabled, false);
    assert.strictEqual(typeof statusResult.json.statusMessage, "string");
  });

  await check("/api/portal/status enthält keine anderen Felder als dokumentiert", () => {
    const expectedKeys = ["ok", "portalReady", "workOrdersEnabled", "publicationEnabled", "billingEnabled", "statusMessage"];
    assert.deepStrictEqual(Object.keys(statusResult.json).sort(), [...expectedKeys].sort());
  });

  // -------------------------------------------------------------------
  // 9. Ein gesperrter Benutzer verliert seinen Zugriff sofort (Route-Guard
  //    prüft den Live-Status bei jedem Request, siehe
  //    auth-route-guard.js#loadSessionIdentity).
  // -------------------------------------------------------------------

  authDb.updateUserStatus(seedDb, freshUser.id, "DISABLED");
  const blockedAfterDisable = record(
    await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: freshSession.cookieHeader } }),
  );
  await check("ein gesperrter Benutzer verliert unmittelbar den Zugriff auf /api/portal/me (401)", () => {
    assert.strictEqual(blockedAfterDisable.statusCode, 401);
  });

  // -------------------------------------------------------------------
  // 10. POST auf beide reinen Lese-Routen ist nicht vorgesehen (405).
  // -------------------------------------------------------------------

  const postMe = record(
    await invoke({
      method: "POST",
      url: "/api/portal/me",
      headers: { cookie: cafeAdminSession.cookieHeader, "content-type": "application/json" },
      bodyObj: {},
    }),
  );
  await check("POST /api/portal/me ist nicht erlaubt (405)", () => {
    assert.strictEqual(postMe.statusCode, 405);
  });

  // -------------------------------------------------------------------
  // Abschließend: keine erfasste Antwort darf Stacktraces, Dateipfade
  // oder Passwort-Hashes enthalten (Verteidigung in der Tiefe, gleiche
  // Prüfung wie in owner-admin-routes.test.js).
  // -------------------------------------------------------------------

  await check("keine erfasste Antwort enthält Stacktraces, Pfade oder Passwort-Hashes", () => {
    capturedBodies.forEach((body) => {
      assert.ok(!/at\s+[\w.]+\s+\(/.test(body), "kein Stacktrace-Muster");
      assert.ok(!/\/Users\//.test(body), "kein absoluter Dateipfad");
      assert.ok(!/passwordHash/i.test(body), "kein Passwort-Hash-Feldname");
    });
  });

  console.log(`customer-portal-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run()
  .then(() => {
    authDb.closeAuthDatabase(seedDb);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    authDb.closeAuthDatabase(seedDb);
    process.exit(1);
  });
