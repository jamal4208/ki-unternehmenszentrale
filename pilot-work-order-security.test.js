"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
// Sicherheits-/Rollentests gegen den echten server.js#requestHandler.
// Gleiches Muster wie health-reference-work-run-security.test.js. Läuft
// mit einem isolierten HOME-/KUZ_DATA_DIR-Verzeichnis; niemals die echte
// Application-Support-Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-security-test-data-"));
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
      headers: { host: "127.0.0.1", ...(bodyObj !== undefined ? { "content-type": "application/json" } : {}), ...headers },
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
  return { cookieHeader: `kuz_dev_session=${sessionToken}; kuz_dev_csrf=${csrfToken}`, csrfToken };
}

function authedJsonHeaders(session, extra = {}) {
  return { cookie: session.cookieHeader, "x-kuz-csrf": session.csrfToken, "content-type": "application/json", ...extra };
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);

  const customerAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("a-customer-admin") });
  const customerAdminSession = await loginAndGetSession(customerAdmin.emailNormalized);
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("b-support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("c-owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  // -------------------------------------------------------------------
  // OWNER_ONLY-Routen: Kunde/Support blockiert, OWNER erlaubt.
  // -------------------------------------------------------------------

  await check("CUSTOMER_ADMIN erreicht /api/pilot-work-order/status nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/status", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT ohne aktiven Grant erreicht /api/pilot-work-order/status nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/status", headers: { cookie: supportSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("CUSTOMER_ADMIN erreicht das statische pilot-work-order-ui.js nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/pilot-work-order-ui.js", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  // V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): identischer Schutz
  // wie das bestehende UI-Skript (staticOwnerOnly). Die 404-Antwort für
  // CUSTOMER_ADMIN darf keinerlei Information über den geschützten
  // Assetpfad preisgeben (identische, generische 404-Antwort wie bei jedem
  // anderen unbekannten/verbotenen Pfad).
  await check("CUSTOMER_ADMIN erreicht das statische pilot-work-order-draft-profiles.js nicht (404)", async () => {
    const result = await invoke({
      method: "GET",
      url: "/pilot-work-order-draft-profiles.js",
      headers: { cookie: customerAdminSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
    assert.doesNotMatch(result.body, /pilot-work-order-draft-profiles/);
  });

  await check("OWNER erreicht das statische pilot-work-order-draft-profiles.js (200, no-store)", async () => {
    const result = await invoke({ method: "GET", url: "/pilot-work-order-draft-profiles.js", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.headers["Cache-Control"], "no-store");
  });

  await check("Kundenrolle kann keine Pilotauftrags-Aktion über den POST-Prefix auslösen (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/mark-ready-for-approval",
      headers: authedJsonHeaders(customerAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("OWNER erreicht /api/pilot-work-order/status (200, no-store, startet als DRAFT)", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/status", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.headers["Cache-Control"], "no-store");
    assert.strictEqual(result.json.overview.status, "DRAFT");
  });

  await check("OWNER erreicht das statische pilot-work-order-ui.js (200)", async () => {
    const result = await invoke({ method: "GET", url: "/pilot-work-order-ui.js", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // CSRF/Origin-Schutz.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header bei einer Pilotauftrags-Aktion wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/mark-ready-for-approval",
      headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin bei einer Pilotauftrags-Aktion wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/mark-ready-for-approval",
      headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("ein unbekanntes Feld im Aktionskörper wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/mark-ready-for-approval",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { extraFeld: true },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // keine externe Aktion: es existiert keine Login-/Send-/Deploy-/
  // Commit-/Push-Route unter diesem Prefix.
  // -------------------------------------------------------------------

  for (const forbiddenAction of ["send-email", "deploy", "commit", "push", "publish", "google-login", "oauth-start"]) {
    await check(`es existiert keine Aktion "${forbiddenAction}" (404 – keine externe Aktion, kein Commit/Push/Deploy)`, async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/${forbiddenAction}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    });
  }

  // -------------------------------------------------------------------
  // Freigabegrenze vor Ausführung – auch über HTTP nicht umgehbar.
  // -------------------------------------------------------------------

  await check("Ausführungsfreigabe über HTTP ohne confirmed === true wird abgewiesen (400)", async () => {
    await invoke({ method: "POST", url: "/api/pilot-work-order/mark-ready-for-approval", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/approve-for-execution",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("Ausführungsfreigabe über HTTP mit confirmed === true gelingt (200, APPROVED_FOR_EXECUTION)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/approve-for-execution",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { confirmed: true },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "APPROVED_FOR_EXECUTION");
  });

  await check("eine ausführungsblockierte Rollenübergabe mit forbiddenActionOccurred blockiert den Auftrag über HTTP (BLOCKED)", async () => {
    await invoke({ method: "POST", url: "/api/pilot-work-order/start-execution", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/submit-handoff",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {
        fromPilotRole: "PROJEKTMANAGER",
        toPilotRole: "RECHERCHE_ANALYSE",
        shortFinding: "Testfixtur",
        resultOrRecommendation: "Testfixtur-Ergebnis",
        basisUsed: "Testfixtur-Quelle",
        riskOrLimit: "Testfixtur-Risiko",
        nextStep: "Testfixtur-Schritt",
        forbiddenActionOccurred: true,
      },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "BLOCKED");
  });

  await check("keine Antwort dieses Prefixes enthält Passwort, Token, Cookie oder sensible Freitextfelder", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/status", headers: { cookie: ownerSession.cookieHeader } });
    assert.doesNotMatch(result.body, /passwort|password|"token"|session-?id/i);
  });

  console.log(`pilot-work-order-security.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-security.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
