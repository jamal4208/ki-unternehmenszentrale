"use strict";

// V7.2 Phase A Schritt 2 – Tests für die neuen Auth-HTTP-Routen (Auftrag
// Abschnitt N, "Neue Datei server-auth-routes.test.js").
//
// Alle Aufrufe laufen gegen den echten server.js#requestHandler mit einem
// isolierten HOME-/KUZ_DATA_DIR-Verzeichnis (gleiches Muster wie
// server-http-router.test.js/route-access-policy.test.js) – niemals die
// tatsächliche Application-Support-Datenbank des Entwicklungsrechners.
//
// Rate-Limiter sind Prozess-/Modul-Singletons (siehe server.js). Damit sich
// die hier bewusst herbeigeführten Ratenlimit-/Sperr-Testfälle nicht
// gegenseitig beeinflussen, verwendet jedes Testszenario eine eigene,
// eindeutige simulierte Client-IP und/oder eine eigene E-Mail-Adresse.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "auth-routes-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "auth-routes-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authSession = require("./auth-session");
const authPassword = require("./auth-password");
const authHttp = require("./auth-http");
const authHttpRoutes = require("./auth-http-routes");
const authAudit = require("./auth-audit");
const server = require("./server");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const seedDb = authDb.openAuthDatabase({ dataDir: KUZ_DATA_DIR }).db;

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 65536) % 256}.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

let emailCounter = 0;
function nextEmail(label) {
  emailCounter += 1;
  return `${label}-${emailCounter}@example.test`;
}

const KNOWN_PASSWORD = "EinSicheresTestpasswort123";

function makeTenant(customerId, overrides = {}) {
  const existing = authDb.getTenantProjectionByCustomerId(seedDb, customerId);
  if (existing) return existing;
  return authDb.createTenantProjection(seedDb, {
    customerId,
    displayName: overrides.displayName || `Testmandant ${customerId}`,
    status: overrides.status || "ACTIVE",
  });
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

// ---------------------------------------------------------------------------
// invoke(): ruft server.js#requestHandler mit einem minimalen Mock-req/-res
// auf. Set-Cookie wird als Array eingesammelt (auth-http-routes.js setzt es
// stets per res.setHeader("Set-Cookie", [...])).
// ---------------------------------------------------------------------------

function invoke({ method = "GET", url, headers = {}, bodyObj, remoteAddress = "127.0.0.1" }) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
    let statusCode = null;
    let responseHeaders = {};
    let rawBody = "";
    const req = {
      method,
      url,
      headers: { host: "127.0.0.1", ...headers },
      socket: { remoteAddress },
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

function cookieHeaderFromLogin(loginResult, mode = "dev") {
  const sessionToken = extractCookieValue(loginResult.headers["Set-Cookie"], authHttp.sessionCookieName(mode));
  const csrfToken = extractCookieValue(loginResult.headers["Set-Cookie"], authHttp.csrfCookieName(mode));
  return {
    sessionToken,
    csrfToken,
    cookieHeader: `${authHttp.sessionCookieName(mode)}=${sessionToken}; ${authHttp.csrfCookieName(mode)}=${csrfToken}`,
  };
}

async function loginAndGetSession({ email, password = KNOWN_PASSWORD, ip = nextIp(), headers = {} } = {}) {
  const result = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json", ...headers },
    bodyObj: { email, password },
    remoteAddress: ip,
  });
  return { result, ip, ...cookieHeaderFromLogin(result) };
}

const capturedBodies = [];
function record(result) {
  capturedBodies.push(result.body);
  return result;
}

async function run() {
  // -------------------------------------------------------------------
  // 1. Login erfolgreich.
  // -------------------------------------------------------------------

  const okUser = makeUser({ email: nextEmail("login-ok"), role: "OWNER" });
  const okIp = nextIp();
  const okLogin = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: okUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: okIp,
    }),
  );

  await check("Login erfolgreich liefert 200 mit minimierten Feldern", () => {
    assert.strictEqual(okLogin.statusCode, 200);
    assert.strictEqual(okLogin.json.ok, true);
    assert.strictEqual(okLogin.json.displayName, okUser.displayName);
    assert.strictEqual(okLogin.json.role, "OWNER");
    assert.strictEqual(typeof okLogin.json.csrfToken, "string");
    assert.ok(okLogin.json.csrfToken.length > 10);
    assert.strictEqual(okLogin.json.tenantDisplayName, null);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(okLogin.json, "userId"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(okLogin.json, "sessionId"), false);
  });

  // -------------------------------------------------------------------
  // 2/3. Login falsches Passwort / unbekannte E-Mail: identische Meldung.
  // -------------------------------------------------------------------

  const wrongPwUser = makeUser({ email: nextEmail("login-wrongpw") });
  const wrongPwResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: wrongPwUser.emailNormalized, password: "definitiv-falsches-passwort" },
      remoteAddress: nextIp(),
    }),
  );

  const unknownEmailResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: nextEmail("nie-existent"), password: "irgendein-passwort" },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login mit falschem Passwort liefert 401 mit generischer Meldung", () => {
    assert.strictEqual(wrongPwResult.statusCode, 401);
    assert.strictEqual(wrongPwResult.json.ok, false);
  });

  await check("Login mit unbekannter E-Mail liefert dieselbe Meldung/denselben Status wie falsches Passwort", () => {
    assert.strictEqual(unknownEmailResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(unknownEmailResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 4. INVITED liefert dieselbe generische Meldung.
  // -------------------------------------------------------------------

  const invitedUser = makeUser({ email: nextEmail("login-invited"), status: "INVITED" });
  const invitedResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: invitedUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login eines INVITED-Kontos liefert dieselbe generische Meldung", () => {
    assert.strictEqual(invitedResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(invitedResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 5. LOCKED liefert dieselbe generische Meldung.
  // -------------------------------------------------------------------

  const lockedUser = makeUser({ email: nextEmail("login-locked"), status: "LOCKED" });
  authDb.setUserLockedUntil(seedDb, lockedUser.id, new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const lockedResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: lockedUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login eines LOCKED-Kontos (nicht abgelaufen) liefert dieselbe generische Meldung", () => {
    assert.strictEqual(lockedResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(lockedResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 6. DISABLED liefert dieselbe generische Meldung.
  // -------------------------------------------------------------------

  const disabledUser = makeUser({ email: nextEmail("login-disabled"), status: "DISABLED" });
  const disabledResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: disabledUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login eines DISABLED-Kontos liefert dieselbe generische Meldung", () => {
    assert.strictEqual(disabledResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(disabledResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 7. SUSPENDED Tenant blockiert Login.
  // -------------------------------------------------------------------

  const suspendedTenant = makeTenant("auth-routes-suspended-tenant", { status: "SUSPENDED" });
  const suspendedTenantUser = makeUser({
    email: nextEmail("login-suspended-tenant"),
    role: "CUSTOMER_ADMIN",
    tenantId: suspendedTenant.id,
  });
  const suspendedTenantResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: suspendedTenantUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login eines Nutzers mit SUSPENDED-Mandant wird blockiert (dieselbe generische Meldung)", () => {
    assert.strictEqual(suspendedTenantResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(suspendedTenantResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 8. Fehlversuchszähler.
  // -------------------------------------------------------------------

  const counterUser = makeUser({ email: nextEmail("login-counter") });
  await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    bodyObj: { email: counterUser.emailNormalized, password: "falsch" },
    remoteAddress: nextIp(),
  });

  await check("ein Fehlversuch erhöht failedLoginCount um genau 1", () => {
    const reloaded = authDb.getUserById(seedDb, counterUser.id);
    assert.strictEqual(reloaded.failedLoginCount, 1);
  });

  // -------------------------------------------------------------------
  // 9. Kontosperre nach Schwellwert.
  // -------------------------------------------------------------------

  const lockoutUser = makeUser({ email: nextEmail("login-lockout") });
  const lockoutIp = nextIp();
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: lockoutUser.emailNormalized, password: "falsch" },
      remoteAddress: lockoutIp,
    });
  }

  await check("nach 5 Fehlversuchen wird das Konto gesperrt (LOCKED)", () => {
    const reloaded = authDb.getUserById(seedDb, lockoutUser.id);
    assert.strictEqual(reloaded.status, "LOCKED");
    assert.ok(reloaded.lockedUntil);
  });

  const lockoutCorrectPwResult = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    bodyObj: { email: lockoutUser.emailNormalized, password: KNOWN_PASSWORD },
    remoteAddress: lockoutIp,
  });

  await check("gesperrtes Konto bleibt auch mit korrektem Passwort blockiert", () => {
    assert.strictEqual(lockoutCorrectPwResult.statusCode, wrongPwResult.statusCode);
    assert.strictEqual(lockoutCorrectPwResult.json.message, wrongPwResult.json.message);
  });

  // -------------------------------------------------------------------
  // 10. Rate Limit Konto (10 Versuche/15 Minuten je normalisierter E-Mail).
  // -------------------------------------------------------------------

  const rateLimitAccountUser = makeUser({ email: nextEmail("login-ratelimit-account") });
  const rateLimitAccountIp = nextIp();
  let lastAccountRateResult = null;
  for (let i = 0; i < 11; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    lastAccountRateResult = await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: rateLimitAccountUser.emailNormalized, password: "falsch" },
      remoteAddress: rateLimitAccountIp,
    });
  }

  await check("die 11. Login-Anfrage derselben E-Mail innerhalb des Fensters wird ratenbegrenzt (429)", () => {
    assert.strictEqual(lastAccountRateResult.statusCode, 429);
    assert.strictEqual(lastAccountRateResult.json.ok, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(lastAccountRateResult.json, "email"), false);
  });

  // -------------------------------------------------------------------
  // 11. Rate Limit IP (20 Versuche/5 Minuten je IP-Hash).
  // -------------------------------------------------------------------

  const rateLimitIp = nextIp();
  let lastIpRateResult = null;
  for (let i = 0; i < 21; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    lastIpRateResult = await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: nextEmail("login-ratelimit-ip"), password: "falsch" },
      remoteAddress: rateLimitIp,
    });
  }

  await check("die 21. Login-Anfrage derselben IP innerhalb des Fensters wird ratenbegrenzt (429)", () => {
    assert.strictEqual(lastIpRateResult.statusCode, 429);
    assert.strictEqual(lastIpRateResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 12. Dummy-scrypt-Pfad für unbekannte Konten.
  // -------------------------------------------------------------------

  await check("DUMMY_HASH_FOR_UNKNOWN_ACCOUNT ist ein gültig formatierter, verwendbarer Hash", () => {
    const parsed = authPassword.parseStoredHash(authPassword.DUMMY_HASH_FOR_UNKNOWN_ACCOUNT);
    assert.ok(parsed);
    assert.strictEqual(authPassword.verifyPassword("irgendein-passwort", authPassword.DUMMY_HASH_FOR_UNKNOWN_ACCOUNT), false);
  });

  // -------------------------------------------------------------------
  // 13/14/15/16. Session-/CSRF-Cookies: Dev vs. Prod, Secure-Erzwingung.
  // -------------------------------------------------------------------

  const cookieDevUser = makeUser({ email: nextEmail("cookie-dev") });
  const cookieDevLogin = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    bodyObj: { email: cookieDevUser.emailNormalized, password: KNOWN_PASSWORD },
    remoteAddress: nextIp(),
  });

  await check("Dev-Login setzt kuz_dev_session ohne Secure-Attribut", () => {
    const setCookie = cookieDevLogin.headers["Set-Cookie"];
    assert.ok(Array.isArray(setCookie));
    const sessionCookie = setCookie.find((entry) => entry.startsWith("kuz_dev_session="));
    assert.ok(sessionCookie);
    assert.doesNotMatch(sessionCookie, /;\s*Secure/);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
  });

  const cookieProdUser = makeUser({ email: nextEmail("cookie-prod") });
  process.env.KUZ_MODE = "prod";
  process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
  let cookieProdLogin;
  try {
    cookieProdLogin = await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        host: "kuz.example.test",
        origin: "https://kuz.example.test",
        "content-type": "application/json",
      },
      bodyObj: { email: cookieProdUser.emailNormalized, password: KNOWN_PASSWORD },
      remoteAddress: nextIp(),
    });
  } finally {
    delete process.env.KUZ_MODE;
    delete process.env.KUZ_PUBLIC_ORIGIN;
  }

  await check("Prod-Login setzt __Host-kuz_session mit Secure-Attribut", () => {
    assert.strictEqual(cookieProdLogin.statusCode, 200);
    const setCookie = cookieProdLogin.headers["Set-Cookie"];
    const sessionCookie = setCookie.find((entry) => entry.startsWith("__Host-kuz_session="));
    assert.ok(sessionCookie);
    assert.match(sessionCookie, /;\s*Secure/);
    assert.match(sessionCookie, /HttpOnly/);
  });

  await check("kein Aufrufer kann den Prod-Cookie ohne Secure erzwingen (fest verdrahtet)", () => {
    const prodCookie = authHttp.buildSessionSetCookie("prod", "beispieltoken", 60);
    assert.match(prodCookie, /;\s*Secure/);
    const devCookie = authHttp.buildSessionSetCookie("dev", "beispieltoken", 60);
    assert.doesNotMatch(devCookie, /;\s*Secure/);
    // buildSessionSetCookie akzeptiert keinerlei "secure"-Parameter, der dies
    // überschreiben könnte (Funktionssignatur: mode, token, maxAgeSeconds).
    assert.strictEqual(authHttp.buildSessionSetCookie.length, 3);
  });

  // -------------------------------------------------------------------
  // 17. CSRF-Cookie.
  // -------------------------------------------------------------------

  await check("Login setzt ein CSRF-Cookie, dessen Wert dem zurückgegebenen csrfToken entspricht", () => {
    const setCookie = cookieDevLogin.headers["Set-Cookie"];
    const csrfCookie = extractCookieValue(setCookie, "kuz_dev_csrf");
    assert.ok(csrfCookie);
    assert.strictEqual(csrfCookie, cookieDevLogin.json.csrfToken);
    const csrfCookieRaw = setCookie.find((entry) => entry.startsWith("kuz_dev_csrf="));
    assert.doesNotMatch(csrfCookieRaw, /HttpOnly/);
  });

  // -------------------------------------------------------------------
  // 18. Sessionrotation.
  // -------------------------------------------------------------------

  const rotationUser = makeUser({ email: nextEmail("rotation") });
  const firstLogin = await loginAndGetSession({ email: rotationUser.emailNormalized });
  // Ein erneuter Login MIT einem bereits gültigen Sessioncookie ist eine
  // "unsichere Methode mit vorhandener Session" (Auftrag Abschnitt G/K) und
  // verlangt daher denselben CSRF-Nachweis wie z. B. Logout – ansonsten
  // könnte ein Angreifer per CSRF eine fremde, bereits angemeldete Session
  // rotieren/ersetzen.
  const secondLogin = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      "content-type": "application/json",
      cookie: firstLogin.cookieHeader,
      "x-kuz-csrf": firstLogin.csrfToken,
    },
    bodyObj: { email: rotationUser.emailNormalized, password: KNOWN_PASSWORD },
    remoteAddress: firstLogin.ip,
  });

  await check("ein erneuter Login mit vorhandenem Sessioncookie widerruft die alte Session (Rotation)", () => {
    assert.strictEqual(secondLogin.statusCode, 200);
    const newSessionToken = extractCookieValue(secondLogin.headers["Set-Cookie"], "kuz_dev_session");
    assert.notStrictEqual(newSessionToken, firstLogin.sessionToken);
    const oldValidation = authSession.validateAndTouchSession(seedDb, firstLogin.sessionToken, new Date().toISOString());
    assert.strictEqual(oldValidation.ok, false);
    const newValidation = authSession.validateAndTouchSession(seedDb, newSessionToken, new Date().toISOString());
    assert.strictEqual(newValidation.ok, true);
  });

  // -------------------------------------------------------------------
  // 19/20. Logout und Logout-Idempotenz.
  // -------------------------------------------------------------------

  const logoutUser = makeUser({ email: nextEmail("logout") });
  const logoutSession = await loginAndGetSession({ email: logoutUser.emailNormalized });
  const logoutResult = await invoke({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      "content-type": "application/json",
      cookie: logoutSession.cookieHeader,
      "x-kuz-csrf": logoutSession.csrfToken,
    },
    bodyObj: {},
    remoteAddress: logoutSession.ip,
  });

  await check("Logout mit gültiger Session/CSRF liefert 200 {ok:true} und löscht beide Cookies", () => {
    assert.strictEqual(logoutResult.statusCode, 200);
    assert.deepStrictEqual(logoutResult.json, { ok: true });
    const setCookie = logoutResult.headers["Set-Cookie"];
    const sessionCookie = setCookie.find((entry) => entry.startsWith("kuz_dev_session="));
    const csrfCookie = setCookie.find((entry) => entry.startsWith("kuz_dev_csrf="));
    assert.match(sessionCookie, /Max-Age=0/);
    assert.match(csrfCookie, /Max-Age=0/);
    const validation = authSession.validateAndTouchSession(seedDb, logoutSession.sessionToken, new Date().toISOString());
    assert.strictEqual(validation.ok, false);
  });

  const secondLogoutResult = await invoke({
    method: "POST",
    url: "/api/auth/logout",
    headers: { "content-type": "application/json" },
    bodyObj: {},
    remoteAddress: logoutSession.ip,
  });

  await check("ein zweiter Logout ohne Session bleibt idempotent (200 {ok:true})", () => {
    assert.strictEqual(secondLogoutResult.statusCode, 200);
    assert.deepStrictEqual(secondLogoutResult.json, { ok: true });
  });

  // -------------------------------------------------------------------
  // 21/22. Sessionstatus.
  // -------------------------------------------------------------------

  const statusLoggedOutResult = await invoke({ method: "GET", url: "/api/auth/session", remoteAddress: nextIp() });

  await check("GET /api/auth/session ohne Session meldet {authenticated:false}", () => {
    assert.strictEqual(statusLoggedOutResult.statusCode, 200);
    assert.deepStrictEqual(statusLoggedOutResult.json, { authenticated: false });
  });

  const statusTenant = makeTenant("auth-routes-status-tenant");
  const statusUser = makeUser({
    email: nextEmail("session-status"),
    role: "CUSTOMER_ADMIN",
    tenantId: statusTenant.id,
    displayName: "Status-Testnutzer",
  });
  const statusSession = await loginAndGetSession({ email: statusUser.emailNormalized });
  const statusLoggedInResult = await invoke({
    method: "GET",
    url: "/api/auth/session",
    headers: { cookie: `kuz_dev_session=${statusSession.sessionToken}` },
    remoteAddress: statusSession.ip,
  });

  await check("GET /api/auth/session mit gültiger Session liefert sichere, minimierte Felder", () => {
    assert.strictEqual(statusLoggedInResult.statusCode, 200);
    assert.strictEqual(statusLoggedInResult.json.authenticated, true);
    assert.strictEqual(statusLoggedInResult.json.displayName, "Status-Testnutzer");
    assert.strictEqual(statusLoggedInResult.json.roleLabel, "Kunde (Admin)");
    assert.strictEqual(statusLoggedInResult.json.tenantDisplayName, statusTenant.displayName);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(statusLoggedInResult.json, "userId"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(statusLoggedInResult.json, "role"), false);
  });

  // -------------------------------------------------------------------
  // 23/24. Reset-Request ohne Kontoerkennung, kein Token in der Antwort.
  // -------------------------------------------------------------------

  const resetKnownUser = makeUser({ email: nextEmail("reset-known") });
  const resetKnownResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/request",
      headers: { "content-type": "application/json" },
      bodyObj: { email: resetKnownUser.emailNormalized },
      remoteAddress: nextIp(),
    }),
  );
  const resetUnknownResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/request",
      headers: { "content-type": "application/json" },
      bodyObj: { email: nextEmail("reset-unbekannt") },
      remoteAddress: nextIp(),
    }),
  );

  await check("Reset-Anfrage für bekanntes und unbekanntes Konto liefert identische Antwort", () => {
    assert.strictEqual(resetKnownResult.statusCode, 200);
    assert.deepStrictEqual(resetKnownResult.json, { ok: true });
    assert.strictEqual(resetUnknownResult.statusCode, 200);
    assert.deepStrictEqual(resetUnknownResult.json, { ok: true });
  });

  await check("die Reset-Anfrage-Antwort enthält niemals ein Tokenfeld", () => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(resetKnownResult.json, "token"), false);
    assert.doesNotMatch(resetKnownResult.body, /token/i);
  });

  // -------------------------------------------------------------------
  // 25/26/27. Reset-Confirm: gültig, abgelaufen, verbraucht.
  // -------------------------------------------------------------------

  const resetConfirmUser = makeUser({ email: nextEmail("reset-confirm") });
  const resetConfirmToken = authHttpRoutes.generateAndStoreToken(
    seedDb,
    resetConfirmUser.id,
    "RESET",
    new Date().toISOString(),
  );
  const resetConfirmIp = nextIp();
  const resetConfirmResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      headers: { "content-type": "application/json" },
      bodyObj: { token: resetConfirmToken, newPassword: "EinNeuesSicheresPasswort987" },
      remoteAddress: resetConfirmIp,
    }),
  );

  await check("gültiger Reset-Token setzt das Passwort erfolgreich (200 {ok:true})", () => {
    assert.strictEqual(resetConfirmResult.statusCode, 200);
    assert.deepStrictEqual(resetConfirmResult.json, { ok: true });
  });

  await check("nach erfolgreichem Reset funktioniert der Login mit dem neuen Passwort", async () => {
    const relogin = await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: resetConfirmUser.emailNormalized, password: "EinNeuesSicheresPasswort987" },
      remoteAddress: nextIp(),
    });
    assert.strictEqual(relogin.statusCode, 200);
  });

  const reusedTokenResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      headers: { "content-type": "application/json" },
      bodyObj: { token: resetConfirmToken, newPassword: "NochEinSicheresPasswort555" },
      remoteAddress: resetConfirmIp,
    }),
  );

  await check("ein bereits verbrauchter Reset-Token wird beim zweiten Versuch generisch abgelehnt (400)", () => {
    assert.strictEqual(reusedTokenResult.statusCode, 400);
    assert.strictEqual(reusedTokenResult.json.ok, false);
  });

  const expiredTokenUser = makeUser({ email: nextEmail("reset-expired") });
  const expiredRawToken = "expired-raw-token-fuer-test-zwecke-0123456789";
  const expiredTokenHash = authHttpRoutes.hashResetToken(expiredRawToken);
  authDb.createResetToken(seedDb, {
    tokenHash: expiredTokenHash,
    userId: expiredTokenUser.id,
    purpose: "RESET",
    now: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const expiredResetResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      headers: { "content-type": "application/json" },
      bodyObj: { token: expiredRawToken, newPassword: "EinAnderesSicheresPasswort222" },
      remoteAddress: nextIp(),
    }),
  );

  await check("ein abgelaufener Reset-Token wird generisch abgelehnt (400)", () => {
    assert.strictEqual(expiredResetResult.statusCode, 400);
    assert.strictEqual(expiredResetResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 28/29. Invitation: gültig, falscher Zweck.
  // -------------------------------------------------------------------

  const inviteUser = makeUser({
    email: nextEmail("invite-user"),
    status: "INVITED",
    passwordHash: null,
  });
  const inviteToken = authHttpRoutes.generateAndStoreToken(seedDb, inviteUser.id, "INVITE", new Date().toISOString());
  const inviteAcceptResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/invitation/accept",
      headers: { "content-type": "application/json" },
      bodyObj: { token: inviteToken, newPassword: "EinEinladungsPasswort123" },
      remoteAddress: nextIp(),
    }),
  );

  await check("eine gültige Einladung setzt das Passwort und aktiviert den Nutzer (200 {ok:true})", () => {
    assert.strictEqual(inviteAcceptResult.statusCode, 200);
    assert.deepStrictEqual(inviteAcceptResult.json, { ok: true });
    const reloaded = authDb.getUserById(seedDb, inviteUser.id);
    assert.strictEqual(reloaded.status, "ACTIVE");
  });

  await check("nach Einladungsannahme funktioniert der Login mit dem neuen Passwort", async () => {
    const relogin = await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: { email: inviteUser.emailNormalized, password: "EinEinladungsPasswort123" },
      remoteAddress: nextIp(),
    });
    assert.strictEqual(relogin.statusCode, 200);
  });

  const wrongPurposeUser = makeUser({ email: nextEmail("invite-wrong-purpose") });
  const wrongPurposeResetToken = authHttpRoutes.generateAndStoreToken(
    seedDb,
    wrongPurposeUser.id,
    "RESET",
    new Date().toISOString(),
  );
  const wrongPurposeResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/invitation/accept",
      headers: { "content-type": "application/json" },
      bodyObj: { token: wrongPurposeResetToken, newPassword: "EinFalscherZweckPasswort123" },
      remoteAddress: nextIp(),
    }),
  );

  await check("ein RESET-Token wird auf der Invitation-Route abgelehnt (falscher Zweck, 400)", () => {
    assert.strictEqual(wrongPurposeResult.statusCode, 400);
    assert.strictEqual(wrongPurposeResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 30. Passwortregeln.
  // -------------------------------------------------------------------

  const weakPasswordUser = makeUser({ email: nextEmail("weak-password") });
  const weakPasswordToken = authHttpRoutes.generateAndStoreToken(
    seedDb,
    weakPasswordUser.id,
    "RESET",
    new Date().toISOString(),
  );
  const weakPasswordResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      headers: { "content-type": "application/json" },
      bodyObj: { token: weakPasswordToken, newPassword: "kurz" },
      remoteAddress: nextIp(),
    }),
  );

  await check("ein zu kurzes neues Passwort wird mit Regelverstoß-Gründen abgelehnt (400)", () => {
    assert.strictEqual(weakPasswordResult.statusCode, 400);
    assert.strictEqual(weakPasswordResult.json.ok, false);
    assert.ok(Array.isArray(weakPasswordResult.json.reasons));
    assert.ok(weakPasswordResult.json.reasons.length > 0);
  });

  // -------------------------------------------------------------------
  // 31. Sessions nach Passwortänderung widerrufen.
  // -------------------------------------------------------------------

  const multiSessionUser = makeUser({ email: nextEmail("multi-session") });
  const multiSessionA = authSession.createSession(seedDb, {
    userId: multiSessionUser.id,
    now: new Date().toISOString(),
  });
  const multiSessionB = authSession.createSession(seedDb, {
    userId: multiSessionUser.id,
    now: new Date().toISOString(),
  });
  const multiSessionResetToken = authHttpRoutes.generateAndStoreToken(
    seedDb,
    multiSessionUser.id,
    "RESET",
    new Date().toISOString(),
  );
  await invoke({
    method: "POST",
    url: "/api/auth/password-reset/confirm",
    headers: { "content-type": "application/json" },
    bodyObj: { token: multiSessionResetToken, newPassword: "EinDrittesSicheresPasswort333" },
    remoteAddress: nextIp(),
  });

  await check("nach einer Passwortänderung sind alle vorherigen Sessions des Nutzers widerrufen", () => {
    const now = new Date().toISOString();
    assert.strictEqual(authSession.validateAndTouchSession(seedDb, multiSessionA.token, now).ok, false);
    assert.strictEqual(authSession.validateAndTouchSession(seedDb, multiSessionB.token, now).ok, false);
  });

  // -------------------------------------------------------------------
  // 32. Audit ohne Geheimnisse.
  // -------------------------------------------------------------------

  await check("gespeicherte Audit-Ereignisse enthalten keine Geheimnisse (Passwörter/Tokens/Cookies)", () => {
    const events = seedDb.prepare("SELECT * FROM auth_audit_events").all();
    assert.ok(events.length > 0);
    events.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /password/i);
      assert.doesNotMatch(event.metadata, /passwort/i);
      assert.doesNotMatch(event.metadata, /\btoken\b/i);
      assert.doesNotMatch(event.metadata, /cookie/i);
      assert.doesNotMatch(event.metadata, /\/Users\//);
    });
  });

  await check("LOGIN_SUCCESS-Audit-Ereignisse existieren für erfolgreiche Logins", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "LOGIN_SUCCESS");
    assert.ok(events.length > 0);
  });

  // -------------------------------------------------------------------
  // 33/34. Content-Type und Bodylimit.
  // -------------------------------------------------------------------

  const badContentTypeResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/plain" },
      bodyObj: { email: "a@example.test", password: "x" },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login mit falschem Content-Type liefert 415 ohne interne Details", () => {
    assert.strictEqual(badContentTypeResult.statusCode, 415);
    assert.strictEqual(badContentTypeResult.json.ok, false);
  });

  const oversizedBody = { email: "a@example.test", password: "x".repeat(9000) };
  const oversizedResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      bodyObj: oversizedBody,
      remoteAddress: nextIp(),
    }),
  );

  await check("Login mit zu großem Anfragekörper liefert 413 ohne interne Details", () => {
    assert.strictEqual(oversizedResult.statusCode, 413);
    assert.strictEqual(oversizedResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 35. Origin.
  // -------------------------------------------------------------------

  const badOriginResult = record(
    await invoke({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json", origin: "http://evil.example.com" },
      bodyObj: { email: nextEmail("bad-origin"), password: "irgendwas" },
      remoteAddress: nextIp(),
    }),
  );

  await check("Login mit fremdem Origin-Header wird vom Gate abgewiesen (403)", () => {
    assert.strictEqual(badOriginResult.statusCode, 403);
    assert.strictEqual(badOriginResult.json.ok, false);
  });

  // -------------------------------------------------------------------
  // 36. CSRF.
  // -------------------------------------------------------------------

  const csrfUser = makeUser({ email: nextEmail("csrf-check") });
  const csrfSession = await loginAndGetSession({ email: csrfUser.emailNormalized });
  const missingCsrfLogout = record(
    await invoke({
      method: "POST",
      url: "/api/auth/logout",
      headers: { "content-type": "application/json", cookie: csrfSession.cookieHeader },
      bodyObj: {},
      remoteAddress: csrfSession.ip,
    }),
  );

  await check("Logout mit vorhandener Session, aber ohne/mit falschem CSRF-Header wird abgewiesen (403)", () => {
    assert.strictEqual(missingCsrfLogout.statusCode, 403);
    assert.strictEqual(missingCsrfLogout.json.ok, false);
  });

  await check("die Session bleibt nach abgewiesenem CSRF-Logout weiterhin gültig", () => {
    const validation = authSession.validateAndTouchSession(seedDb, csrfSession.sessionToken, new Date().toISOString());
    assert.strictEqual(validation.ok, true);
  });

  // -------------------------------------------------------------------
  // 37/38/39. Keine Stacktraces, Pfade oder Tokens in irgendeiner Antwort.
  // -------------------------------------------------------------------

  await check("keine erfasste Antwort enthält Stacktraces", () => {
    capturedBodies.forEach((body) => {
      assert.doesNotMatch(body, /at [A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]* \(/);
      assert.doesNotMatch(body, /\.js:\d+:\d+/);
    });
  });

  await check("keine erfasste Antwort enthält absolute Dateisystempfade", () => {
    capturedBodies.forEach((body) => {
      assert.doesNotMatch(body, /\/Users\//);
      assert.doesNotMatch(body, /Library\/Application Support/);
    });
  });

  await check("keine erfasste Antwort enthält den rohen Reset-/Invite-Token", () => {
    capturedBodies.forEach((body) => {
      assert.doesNotMatch(body, new RegExp(resetConfirmToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(body, new RegExp(inviteToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(body, /scrypt\$/);
    });
  });

  // -------------------------------------------------------------------
  // 40. Cache-Control: no-store für alle Auth-Antworten.
  // -------------------------------------------------------------------

  await check("alle Auth-JSON-Antworten setzen Cache-Control: no-store", () => {
    [okLogin, wrongPwResult, statusLoggedOutResult, statusLoggedInResult, logoutResult, resetKnownResult].forEach(
      (result) => {
        assert.strictEqual(result.headers["Cache-Control"], "no-store");
      },
    );
  });

  console.log(`server-auth-routes.test.js: ${passed} Prüfpunkte erfolgreich`);

  authDb.closeAuthDatabase(seedDb);
  fs.rmSync(FAKE_HOME_DIR, { recursive: true, force: true });
  fs.rmSync(KUZ_DATA_DIR, { recursive: true, force: true });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
