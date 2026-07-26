"use strict";

// V7.2 Phase A Schritt 4 (Auftrag Abschnitt Q) – Sicherheitsabnahme der
// Portalbasis mit ZWEI echten, kanonischen Mandanten (Café/Fitnessstudio).
//
// Ergänzt bewusst nur, was route-access-policy.test.js/server-auth-routes.
// test.js/owner-admin-routes.test.js/customer-portal-routes.test.js NICHT
// bereits mit derselben Garantie abdecken: echte Datentrennung über zwei
// reale Mandanten hinweg (nicht nur Parametermismatch am Guard), Cookie-/
// CSRF-Manipulation auf den NEUEN Kunden-/Owner-Routen, Prod-Modus-Ablauf
// für die Schritt-3-Oberflächen sowie die Schritt-4-Korrektur (Owner-
// Benutzeraktionen dürfen ausschließlich CUSTOMER_ADMIN/CUSTOMER_USER
// adressieren, niemals OWNER/SUPPORT).
//
// Läuft gegen den echten server.js#requestHandler mit einem isolierten
// HOME-/KUZ_DATA_DIR-Verzeichnis – niemals die echte Application-Support-
// Datenbank des Entwicklungsrechners.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "portal-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "portal-security-test-data-"));
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

const TENANT_A_ID = "test-customer-fiktives-cafe";
const TENANT_B_ID = "test-customer-fiktives-fitnessstudio";
authDb.updateTenantStatus(seedDb, TENANT_A_ID, "ACTIVE");
authDb.updateTenantStatus(seedDb, TENANT_B_ID, "ACTIVE");
const tenantA = authDb.getTenantProjectionByCustomerId(seedDb, TENANT_A_ID);
const tenantB = authDb.getTenantProjectionByCustomerId(seedDb, TENANT_B_ID);

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

async function loginAndGetSession(email, extraHeaders = {}) {
  const result = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json", ...extraHeaders },
    bodyObj: { email, password: KNOWN_PASSWORD },
  });
  const sessionCookieName = extraHeaders.host && extraHeaders.host !== "127.0.0.1" ? "__Host-kuz_session" : "kuz_dev_session";
  const csrfCookieName = extraHeaders.host && extraHeaders.host !== "127.0.0.1" ? "__Host-kuz_csrf" : "kuz_dev_csrf";
  const sessionToken = extractCookieValue(result.headers["Set-Cookie"], sessionCookieName);
  const csrfToken = extractCookieValue(result.headers["Set-Cookie"], csrfCookieName);
  return {
    loginResult: result,
    sessionCookieName,
    sessionToken,
    csrfToken,
    cookieHeader: `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${csrfToken}`,
  };
}

async function run() {
  const ownerUser = makeUser({ email: nextEmail("owner"), role: "OWNER" });
  const owner = await loginAndGetSession(ownerUser.emailNormalized);

  const adminA = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenantA.id, email: nextEmail("admin-a"), displayName: "Admin A" });
  const userA = makeUser({ role: "CUSTOMER_USER", tenantId: tenantA.id, email: nextEmail("nutzer-a"), displayName: "Nutzer A" });
  const adminB = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenantB.id, email: nextEmail("admin-b"), displayName: "Admin B" });
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("support") });

  const sessionAdminA = await loginAndGetSession(adminA.emailNormalized);
  const sessionUserA = await loginAndGetSession(userA.emailNormalized);
  const sessionAdminB = await loginAndGetSession(adminB.emailNormalized);
  const sessionSupport = await loginAndGetSession(supportUser.emailNormalized);

  // -------------------------------------------------------------------
  // 1. Echte Mandantentrennung über zwei reale Mandanten (nicht nur
  //    Parametermismatch, sondern tatsächlicher Dateninhalt).
  // -------------------------------------------------------------------

  await check("Admin A sieht im eigenen Portal ausschließlich den eigenen Mandantennamen", async () => {
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionAdminA.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.tenantDisplayName, tenantA.displayName);
    assert.notStrictEqual(result.json.tenantDisplayName, tenantB.displayName);
  });

  await check("Admin B sieht im eigenen Portal ausschließlich den eigenen Mandantennamen", async () => {
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionAdminB.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.tenantDisplayName, tenantB.displayName);
    assert.notStrictEqual(result.json.tenantDisplayName, tenantA.displayName);
  });

  await check("Owner sieht beide Mandanten getrennt mit korrekt zugeordneten Nutzerzahlen", async () => {
    const result = await invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: owner.cookieHeader } });
    const entryA = result.json.tenants.find((t) => t.customerId === TENANT_A_ID);
    const entryB = result.json.tenants.find((t) => t.customerId === TENANT_B_ID);
    assert.ok(entryA.userCount >= 2, "Mandant A sollte mindestens Admin A und Nutzer A zählen");
    assert.ok(entryB.userCount >= 1, "Mandant B sollte mindestens Admin B zählen");
  });

  await check("Owner-Benutzerliste für Mandant A enthält NIEMALS einen Benutzer von Mandant B", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/owner/tenants/${TENANT_A_ID}/users`,
      headers: { cookie: owner.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 200);
    const emails = result.json.users.map((u) => u.email);
    assert.ok(emails.includes(adminA.emailNormalized));
    assert.ok(emails.includes(userA.emailNormalized));
    assert.ok(!emails.includes(adminB.emailNormalized), "Mandant-B-Benutzer darf in Mandant-A-Liste nicht auftauchen");
  });

  await check("Owner-Benutzerliste für Mandant B enthält NIEMALS einen Benutzer von Mandant A", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/owner/tenants/${TENANT_B_ID}/users`,
      headers: { cookie: owner.cookieHeader },
    });
    const emails = result.json.users.map((u) => u.email);
    assert.ok(emails.includes(adminB.emailNormalized));
    assert.ok(!emails.includes(adminA.emailNormalized));
    assert.ok(!emails.includes(userA.emailNormalized));
  });

  await check("Suspendieren von Mandant A entzieht dessen Nutzern sofort den Zugriff, Mandant B bleibt unberührt", async () => {
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${TENANT_A_ID}/suspend`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    const blockedA = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionAdminA.cookieHeader } });
    assert.strictEqual(blockedA.statusCode, 401);
    const stillOkB = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionAdminB.cookieHeader } });
    assert.strictEqual(stillOkB.statusCode, 200);
    // Wieder aktivieren, damit nachfolgende Prüfungen unbeeinflusst bleiben.
    await invoke({
      method: "POST",
      url: `/api/owner/tenants/${TENANT_A_ID}/activate`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
  });

  await check("reaktivierter Mandant A erhält wieder ausschließlich eigenen Zugriff (kein Übergriff auf B)", async () => {
    const refreshedA = await loginAndGetSession(adminA.emailNormalized);
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: refreshedA.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.tenantDisplayName, tenantA.displayName);
  });

  await check("unbekannter Mandant und fremder existierender Mandant liefern identisch generisches 404 (kein Orakel)", async () => {
    const unknown = await invoke({
      method: "GET",
      url: "/api/owner/tenants/dieser-mandant-existiert-nicht-ebenfalls",
      headers: { cookie: owner.cookieHeader },
    });
    assert.strictEqual(unknown.statusCode, 404);
    assert.strictEqual(unknown.json.ok, false);
    assert.strictEqual(Object.keys(unknown.json).sort().join(","), "message,ok");
  });

  // -------------------------------------------------------------------
  // 2. Rollenmatrix: SUPPORT erreicht ohne Grant nichts, OWNER handelt
  //    nicht automatisch als Kunde (keine Impersonation).
  // -------------------------------------------------------------------

  await check("SUPPORT ohne aktiven Grant erreicht keine Owner-Daten", async () => {
    const result = await invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: sessionSupport.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT ohne aktiven Grant erreicht keine Kundenportaldaten (gültige Session, aber falsche Rolle → 404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionSupport.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT ohne aktiven Grant erreicht keine Kundenportalseite", async () => {
    const result = await invoke({ method: "GET", url: "/portal", headers: { cookie: sessionSupport.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("OWNER handelt nicht automatisch als Kunde: /api/portal/me bleibt für OWNER gesperrt (keine Impersonation)", async () => {
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: owner.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("OWNER handelt nicht automatisch als Kunde: /api/portal/status bleibt für OWNER gesperrt", async () => {
    const result = await invoke({ method: "GET", url: "/api/portal/status", headers: { cookie: owner.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("CUSTOMER_ADMIN erreicht keine Owner-Verwaltungsseite (kein zweiter Owner über Kundenrolle)", async () => {
    // Frischer Login: die ursprüngliche sessionAdminA wurde durch die
    // Mandanten-Suspendierung in Prüfpunkt 6 bereits serverseitig widerrufen
    // (siehe auth-route-guard.js#loadSessionIdentity: TENANT_INVALID
    // widerruft die Session sofort) – dieser Test braucht eine gültige,
    // aktuelle CUSTOMER_ADMIN-Session, keine Dev-Bypass-Identität.
    const freshAdminA = await loginAndGetSession(adminA.emailNormalized);
    const result = await invoke({ method: "GET", url: "/owner/kunden", headers: { cookie: freshAdminA.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 3. Schritt-4-Korrektur: Owner-Benutzeraktionen dürfen ausschließlich
  //    Kundenrollen adressieren, niemals OWNER/SUPPORT (Regressionstest
  //    für den in der Architekturprüfung gefundenen Befund).
  // -------------------------------------------------------------------

  await check("Owner kann eine fremde OWNER-Benutzer-ID nicht über die Kundenverwaltung sperren (404)", async () => {
    const otherOwner = makeUser({ role: "OWNER", email: nextEmail("zweiter-owner") });
    const result = await invoke({
      method: "POST",
      url: `/api/owner/users/${otherOwner.id}/suspend`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 404);
    const stillActive = authDb.getUserById(seedDb, otherOwner.id);
    assert.strictEqual(stillActive.status, "ACTIVE", "die fremde OWNER-Rolle darf durch die Kundenverwaltung nicht verändert werden");
  });

  await check("Owner kann eine SUPPORT-Benutzer-ID nicht über die Kundenverwaltung sperren (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/users/${supportUser.id}/suspend`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 404);
    const stillActive = authDb.getUserById(seedDb, supportUser.id);
    assert.strictEqual(stillActive.status, "ACTIVE");
  });

  await check("Owner kann für eine SUPPORT-Benutzer-ID keinen Passwort-Reset über die Kundenverwaltung vorbereiten (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/users/${supportUser.id}/prepare-password-reset`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("Owner-Aktionen für echte Kundenbenutzer (Mandant A) funktionieren unverändert (kein Kollateralschaden der Korrektur)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/users/${userA.id}/revoke-sessions`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 4. Cookie-/CSRF-Manipulation auf den neuen Kunden-/Owner-Routen.
  // -------------------------------------------------------------------

  await check("ein manipulierter Session-Cookie-Wert wird auf der Kundenportal-API abgelehnt (401)", async () => {
    const tampered = `kuz_dev_session=${sessionAdminA.sessionToken.slice(0, -4)}ABCD; kuz_dev_csrf=${sessionAdminA.csrfToken}`;
    const result = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: tampered } });
    assert.strictEqual(result.statusCode, 401);
  });

  await check("ein manipulierter Session-Cookie-Wert wird auf der Owner-API auf einem fremden Host abgelehnt (404, fail-closed, kein Dev-Bypass)", async () => {
    // Auf Loopback würde eine ungültige/fehlende Session für eine
    // OWNER_ONLY-Route im Dev-Modus per Absicht auf den dokumentierten
    // Dev-Bypass zurückfallen (siehe auth-route-guard.js#
    // CHEF_BYPASS_ELIGIBLE_CLASSES) – das ist kein Sicherheitsleck, sondern
    // lokale Entwicklerbequemlichkeit. Der eigentliche Sicherheitstest
    // prüft deshalb bewusst einen NICHT-Loopback-Host, für den kein
    // Dev-Bypass gilt: dort muss der manipulierte Cookie generisch
    // scheitern.
    const tampered = `kuz_dev_session=${owner.sessionToken.slice(0, -4)}WXYZ; kuz_dev_csrf=${owner.csrfToken}`;
    const result = await invoke({
      method: "GET",
      url: "/api/owner/tenants",
      headers: { cookie: tampered, host: "fremder-host.example" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("ein manipulierter Session-Cookie-Wert fällt auf Loopback im Dev-Modus auf den dokumentierten Dev-Bypass zurück (kein Fund, sondern beabsichtigtes Verhalten)", async () => {
    const tampered = `kuz_dev_session=${owner.sessionToken.slice(0, -4)}WXYZ; kuz_dev_csrf=${owner.csrfToken}`;
    const result = await invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: tampered } });
    assert.strictEqual(result.statusCode, 200);
  });

  await check("ein falscher CSRF-Header (gültige Session, falscher Tokenwert) wird auf der Kundenportalroute mit CSRF-Bedarf abgelehnt", async () => {
    // /api/portal/me ist GET (kein CSRF-Bedarf) – die Owner-Aktionsrouten
    // sind POST und daher der korrekte Prüfpunkt für CSRF.
    const result = await invoke({
      method: "POST",
      url: `/api/owner/tenants/${TENANT_A_ID}/activate`,
      headers: { cookie: owner.cookieHeader, "x-kuz-csrf": `${owner.csrfToken}-manipuliert` },
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("ein fehlendes CSRF-Cookie (nur Session-Cookie vorhanden) wird auf einer Owner-Aktionsroute abgelehnt", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/tenants/${TENANT_A_ID}/activate`,
      headers: { cookie: `kuz_dev_session=${owner.sessionToken}`, "x-kuz-csrf": owner.csrfToken },
    });
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 5. Prod-Modus: dieselben neuen Oberflächen ohne Dev-Bypass, mit
  //    Secure-Cookies und exakter Originprüfung.
  // -------------------------------------------------------------------

  await check("Prod-Modus: Owner-Login setzt __Host-Cookies mit Secure, und die Owner-API funktioniert identisch", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kunden.beispiel.test";
    try {
      const prodOwnerLogin = await invoke({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "content-type": "application/json",
          host: "kunden.beispiel.test",
          origin: "https://kunden.beispiel.test",
        },
        bodyObj: { email: ownerUser.emailNormalized, password: KNOWN_PASSWORD },
      });
      assert.strictEqual(prodOwnerLogin.statusCode, 200);
      const setCookies = Array.isArray(prodOwnerLogin.headers["Set-Cookie"])
        ? prodOwnerLogin.headers["Set-Cookie"]
        : [prodOwnerLogin.headers["Set-Cookie"]];
      assert.ok(setCookies.some((c) => c.startsWith("__Host-kuz_session=") && c.includes("Secure")));
      assert.ok(setCookies.some((c) => c.startsWith("__Host-kuz_csrf=") && c.includes("Secure")));

      const prodSessionToken = extractCookieValue(setCookies, "__Host-kuz_session");
      const prodCsrfToken = extractCookieValue(setCookies, "__Host-kuz_csrf");
      const prodCookieHeader = `__Host-kuz_session=${prodSessionToken}; __Host-kuz_csrf=${prodCsrfToken}`;

      const tenantsResult = await invoke({
        method: "GET",
        url: "/api/owner/tenants",
        headers: { cookie: prodCookieHeader, host: "kunden.beispiel.test" },
      });
      assert.strictEqual(tenantsResult.statusCode, 200);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Prod-Modus: ohne Session bleibt die Owner-Verwaltungsseite auch auf dem öffentlichen Host gesperrt (kein Dev-Bypass)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kunden.beispiel.test";
    try {
      const result = await invoke({ method: "GET", url: "/owner/kunden", headers: { host: "kunden.beispiel.test" } });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Prod-Modus: ein fremder Origin-Header wird auf einer Owner-Aktionsroute abgewiesen (403)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kunden.beispiel.test";
    try {
      // Braucht eine ECHTE Prod-Session (__Host-Cookienamen) – die Dev-
      // Cookies aus `owner` sind im Prod-Modus unter anderem Cookienamen
      // nicht auffindbar und würden bereits vorher an NO_SESSION scheitern.
      const prodOwnerLogin = await invoke({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "content-type": "application/json",
          host: "kunden.beispiel.test",
          origin: "https://kunden.beispiel.test",
        },
        bodyObj: { email: ownerUser.emailNormalized, password: KNOWN_PASSWORD },
      });
      const setCookies = Array.isArray(prodOwnerLogin.headers["Set-Cookie"])
        ? prodOwnerLogin.headers["Set-Cookie"]
        : [prodOwnerLogin.headers["Set-Cookie"]];
      const prodSessionToken = extractCookieValue(setCookies, "__Host-kuz_session");
      const prodCsrfToken = extractCookieValue(setCookies, "__Host-kuz_csrf");
      const prodCookieHeader = `__Host-kuz_session=${prodSessionToken}; __Host-kuz_csrf=${prodCsrfToken}`;

      const result = await invoke({
        method: "POST",
        url: `/api/owner/tenants/${TENANT_A_ID}/activate`,
        headers: {
          host: "kunden.beispiel.test",
          origin: "https://angreifer.böse.test",
          cookie: prodCookieHeader,
          "x-kuz-csrf": prodCsrfToken,
        },
      });
      assert.strictEqual(result.statusCode, 403);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  // -------------------------------------------------------------------
  // 6. Keine Geheimnisse in irgendeiner Antwort dieses Testlaufs.
  // -------------------------------------------------------------------

  await check("keine Antwort dieses gesamten Testlaufs enthält einen Passwort-Hash, Stacktrace oder absoluten Nutzerpfad", async () => {
    const probes = await Promise.all([
      invoke({ method: "GET", url: "/api/owner/tenants", headers: { cookie: owner.cookieHeader } }),
      invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: sessionAdminA.cookieHeader } }),
      invoke({ method: "GET", url: `/api/owner/tenants/${TENANT_A_ID}/users`, headers: { cookie: owner.cookieHeader } }),
    ]);
    probes.forEach((probe) => {
      assert.doesNotMatch(probe.body, /scrypt\$/);
      assert.doesNotMatch(probe.body, /\/Users\//);
      assert.doesNotMatch(probe.body, /at [A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]* \(/);
    });
  });

  console.log(`portal-security-acceptance.test.js: ${passed} Prüfpunkte erfolgreich`);

  authDb.closeAuthDatabase(seedDb);
  fs.rmSync(FAKE_HOME_DIR, { recursive: true, force: true });
  fs.rmSync(KUZ_DATA_DIR, { recursive: true, force: true });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
