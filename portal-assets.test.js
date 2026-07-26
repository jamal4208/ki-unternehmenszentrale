"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt P) – Tests für die neuen
// statischen Portal-/Owner-Verwaltungs-Assets: tatsächliche Auslieferung
// durch den echten server.js#requestHandler (Content-Type, Zugriffsschutz
// je Rolle, keine externen Ressourcen/Tracker – Auftrag Abschnitt L:
// "kein externes CDN, kein Tracking, keine externen Schriften").
//
// Die Klassifikation der Policy selbst (STATIC_PUBLIC/
// STATIC_AUTHENTICATED_PORTAL/STATIC_OWNER_ONLY) ist bereits Gegenstand von
// route-access-policy.test.js; diese Datei prüft ergänzend die tatsächlich
// ausgelieferten Bytes und das Zusammenspiel mehrerer Rollen.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "portal-assets-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "portal-assets-test-data-"));
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
        resolve({ statusCode, headers: responseHeaders, body: rawBody });
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
  return { cookieHeader: `kuz_dev_session=${sessionToken}; kuz_dev_csrf=${csrfToken}`, csrfToken };
}

// Externe Ressourcen/Tracker, die im Portal (Auftrag Abschnitt L) verboten
// sind. Bewusst keine allgemeine "http"-Prüfung, weil einzelne Seiten legitim
// auf interne, relative Pfade verweisen dürfen.
const FORBIDDEN_EXTERNAL_PATTERNS = [
  /https?:\/\//i,
  /cdn\./i,
  /fonts\.googleapis/i,
  /google-analytics/i,
  /googletagmanager/i,
  /facebook\.net/i,
  /<script[^>]+src=["']\/\//i,
];

function assertNoExternalResources(html, label) {
  FORBIDDEN_EXTERNAL_PATTERNS.forEach((pattern) => {
    assert.ok(!pattern.test(html), `${label} darf kein externes Muster "${pattern}" enthalten`);
  });
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);

  const customer = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("kunde-asset") });
  const customerSession = await loginAndGetSession(customer.emailNormalized);

  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner-asset") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  // -------------------------------------------------------------------
  // 1. Öffentliche Einstiegsseiten (STATIC_PUBLIC): ohne Session
  //    erreichbar, korrekter Content-Type, kein Fachauftrags-/
  //    Registrierungslink, keine externen Ressourcen.
  // -------------------------------------------------------------------

  const publicPaths = ["/portal/login", "/portal/einladung", "/portal/passwort-vergessen", "/portal/passwort-neu"];
  for (const publicPath of publicPaths) {
    const result = await invoke({ method: "GET", url: publicPath });
    await check(`${publicPath} ist ohne Session erreichbar (200, text/html)`, () => {
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.headers["Content-Type"].startsWith("text/html"));
    });
  }

  const loginHtml = (await invoke({ method: "GET", url: "/portal/login" })).body;
  await check("portal-login.html enthält keine externen Ressourcen/Tracker", () => {
    assertNoExternalResources(loginHtml, "portal-login.html");
  });
  await check("portal-login.html bietet keine offene Selbstregistrierung an", () => {
    assert.ok(!/registrieren|jetzt anmelden|konto erstellen/i.test(loginHtml.replace(/anmelden\b/gi, "")));
  });

  const portalAuthJs = await invoke({ method: "GET", url: "/portal-auth.js" });
  await check("/portal-auth.js ist öffentlich erreichbar und wird als JavaScript ausgeliefert", () => {
    assert.strictEqual(portalAuthJs.statusCode, 200);
    assert.ok(portalAuthJs.headers["Content-Type"].startsWith("application/javascript"));
  });

  const portalCss = await invoke({ method: "GET", url: "/portal.css" });
  await check("/portal.css ist öffentlich erreichbar und wird als CSS ausgeliefert", () => {
    assert.strictEqual(portalCss.statusCode, 200);
    assert.ok(portalCss.headers["Content-Type"].startsWith("text/css"));
  });
  await check("/portal.css enthält keine externen @import/url()-Ressourcen", () => {
    assert.ok(!/@import\s+url\(\s*["']?https?:\/\//i.test(portalCss.body));
    assert.ok(!/url\(\s*["']?https?:\/\//i.test(portalCss.body));
  });

  // -------------------------------------------------------------------
  // 2. Kundenportal-Startseite (STATIC_AUTHENTICATED_PORTAL): ohne Session
  //    blockiert (auch auf Loopback, kein Dev-Bypass), mit Kundensession
  //    erreichbar, für Owner nicht vorgesehen (kein Kundenaccount).
  // -------------------------------------------------------------------

  const portalWithoutSession = await invoke({ method: "GET", url: "/portal" });
  await check("/portal ist ohne Session blockiert (404, kein Dev-Bypass für Kundenportal)", () => {
    assert.strictEqual(portalWithoutSession.statusCode, 404);
  });

  const portalWithCustomer = await invoke({ method: "GET", url: "/portal", headers: { cookie: customerSession.cookieHeader } });
  await check("/portal ist mit gültiger Kundensession erreichbar (200)", () => {
    assert.strictEqual(portalWithCustomer.statusCode, 200);
    assert.ok(portalWithCustomer.headers["Content-Type"].startsWith("text/html"));
  });
  await check("portal.html enthält keine externen Ressourcen/Tracker", () => {
    assertNoExternalResources(portalWithCustomer.body, "portal.html");
  });

  const portalUiJsWithoutSession = await invoke({ method: "GET", url: "/portal-ui.js" });
  await check("/portal-ui.js ist ohne Session blockiert (404)", () => {
    assert.strictEqual(portalUiJsWithoutSession.statusCode, 404);
  });
  const portalUiJsWithCustomer = await invoke({ method: "GET", url: "/portal-ui.js", headers: { cookie: customerSession.cookieHeader } });
  await check("/portal-ui.js ist mit gültiger Kundensession erreichbar (200, JavaScript)", () => {
    assert.strictEqual(portalUiJsWithCustomer.statusCode, 200);
    assert.ok(portalUiJsWithCustomer.headers["Content-Type"].startsWith("application/javascript"));
  });

  // -------------------------------------------------------------------
  // 3. Owner-Verwaltungsseite (STATIC_OWNER_ONLY): Kundenrolle blockiert,
  //    Owner-Session erreicht sie; auch der Kunde erhält keinen Zugriff auf
  //    das Owner-Skript.
  // -------------------------------------------------------------------

  const ownerPageWithCustomer = await invoke({ method: "GET", url: "/owner/kunden", headers: { cookie: customerSession.cookieHeader } });
  await check("Kundenrolle erreicht /owner/kunden nicht (404)", () => {
    assert.strictEqual(ownerPageWithCustomer.statusCode, 404);
  });

  const ownerPageWithOwner = await invoke({ method: "GET", url: "/owner/kunden", headers: { cookie: ownerSession.cookieHeader } });
  await check("OWNER erreicht /owner/kunden (200, text/html)", () => {
    assert.strictEqual(ownerPageWithOwner.statusCode, 200);
    assert.ok(ownerPageWithOwner.headers["Content-Type"].startsWith("text/html"));
  });
  await check("owner-admin.html enthält keine externen Ressourcen/Tracker", () => {
    assertNoExternalResources(ownerPageWithOwner.body, "owner-admin.html");
  });

  const ownerAdminJsWithCustomer = await invoke({ method: "GET", url: "/owner-admin.js", headers: { cookie: customerSession.cookieHeader } });
  await check("Kundenrolle erreicht /owner-admin.js nicht (404)", () => {
    assert.strictEqual(ownerAdminJsWithCustomer.statusCode, 404);
  });
  const ownerAdminJsWithOwner = await invoke({ method: "GET", url: "/owner-admin.js", headers: { cookie: ownerSession.cookieHeader } });
  await check("OWNER erreicht /owner-admin.js (200, JavaScript)", () => {
    assert.strictEqual(ownerAdminJsWithOwner.statusCode, 200);
    assert.ok(ownerAdminJsWithOwner.headers["Content-Type"].startsWith("application/javascript"));
  });

  // -------------------------------------------------------------------
  // 4. STATIC_AUTHENTICATED_PORTAL erlaubt laut Policy bewusst auch OWNER
  //    (siehe route-access-policy.js#CLASS_DEFAULTS) – die statische Seite
  //    selbst ist damit für Owner ebenfalls erreichbar. Die dahinterliegende
  //    Daten-API bleibt trotzdem strikt CUSTOMER_TENANT-only (siehe
  //    customer-portal-routes.test.js: OWNER erhält dort 404 auf
  //    /api/portal/me) – kein Kundendatenzugriff über die Seite selbst.
  // -------------------------------------------------------------------

  const portalWithOwner = await invoke({ method: "GET", url: "/portal", headers: { cookie: ownerSession.cookieHeader } });
  await check("OWNER erreicht die statische Kundenportalseite /portal ebenfalls (200, Policy erlaubt dies explizit)", () => {
    assert.strictEqual(portalWithOwner.statusCode, 200);
  });

  const portalMeApiWithOwner = await invoke({ method: "GET", url: "/api/portal/me", headers: { cookie: ownerSession.cookieHeader } });
  await check("die Kundendaten-API /api/portal/me bleibt für OWNER trotzdem gesperrt (404)", () => {
    assert.strictEqual(portalMeApiWithOwner.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 5. Ein gesperrter Kunde verliert den Zugriff auf /portal unmittelbar.
  // -------------------------------------------------------------------

  authDb.updateUserStatus(seedDb, customer.id, "DISABLED");
  const portalAfterDisable = await invoke({ method: "GET", url: "/portal", headers: { cookie: customerSession.cookieHeader } });
  await check("ein gesperrter Kunde verliert unmittelbar den Zugriff auf /portal (404)", () => {
    assert.strictEqual(portalAfterDisable.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 6. Unbekannte Pfade bleiben unverändert 404 (keine versehentliche
  //    Catch-all-Erweiterung durch die neuen Portal-Routen).
  // -------------------------------------------------------------------

  const unknownPath = await invoke({ method: "GET", url: "/portal/does-not-exist" });
  await check("ein unbekannter Portalpfad bleibt 404", () => {
    assert.strictEqual(unknownPath.statusCode, 404);
  });

  console.log(`portal-assets.test.js: ${passed} Prüfpunkte erfolgreich`);
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
