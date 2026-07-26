"use strict";

// V7.2 Phase B Schritt 1 (Auftrag Abschnitt M), PRODUKTKORRIGIERT –
// Sicherheits-/Mandantentrennungstests für die Arbeitsauftragsfunktion.
// Ergänzt work-order-routes.test.js (fachliche Abläufe des Selbstbedienungs-
// Flusses) um gezielte Angriffs-/Grenzfälle (gleiches Muster wie
// route-access-policy.test.js/owner-admin-routes.test.js).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-security-test-data-"));
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
    cookieHeader: `kuz_dev_session=${sessionToken}; kuz_dev_csrf=${csrfToken}`,
    csrfToken,
  };
}

function authedJsonHeaders(session, extra = {}) {
  return { cookie: session.cookieHeader, "x-kuz-csrf": session.csrfToken, "content-type": "application/json", ...extra };
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  const fitnessCustomerId = "test-customer-fiktives-fitnessstudio";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);
  const fitnessTenant = authDb.getTenantProjectionByCustomerId(seedDb, fitnessCustomerId);

  const cafeAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("a-cafe-admin") });
  const cafeAdminSession = await loginAndGetSession(cafeAdmin.emailNormalized);
  const fitnessAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("b-fitness-admin") });
  const fitnessAdminSession = await loginAndGetSession(fitnessAdmin.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);

  function validBody(overrides = {}) {
    return {
      title: "Sicherheitstest-Auftrag",
      desiredResult: "Ein Ergebnis für den Sicherheitstest.",
      ...overrides,
    };
  }

  const orderA = (
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validBody({ title: "Auftrag von Mandant A" }),
    })
  ).json.workOrder;

  const orderB = (
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(fitnessAdminSession),
      bodyObj: validBody({ title: "Auftrag von Mandant B" }),
    })
  ).json.workOrder;

  // -------------------------------------------------------------------
  // 1+2. Tenant A sieht nur A, Tenant B sieht nur B.
  // -------------------------------------------------------------------

  const listA = await invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: cafeAdminSession.cookieHeader } });
  await check("Mandant A sieht in der eigenen Liste ausschließlich eigene Aufträge", () => {
    assert.ok(listA.json.workOrders.some((wo) => wo.id === orderA.id));
    assert.ok(!listA.json.workOrders.some((wo) => wo.id === orderB.id));
  });

  const listB = await invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: fitnessAdminSession.cookieHeader } });
  await check("Mandant B sieht in der eigenen Liste ausschließlich eigene Aufträge", () => {
    assert.ok(listB.json.workOrders.some((wo) => wo.id === orderB.id));
    assert.ok(!listB.json.workOrders.some((wo) => wo.id === orderA.id));
  });

  // -------------------------------------------------------------------
  // 3. Fremde ID im Pfad -> 404.
  // -------------------------------------------------------------------

  const foreignIdInPath = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderB.id}`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("eine fremde Auftrag-ID im Pfad liefert 404", () => {
    assert.strictEqual(foreignIdInPath.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 4. Fremder Tenant im Query -> 404 (genereller Guard-Mismatch).
  // -------------------------------------------------------------------

  const foreignTenantInQuery = await invoke({
    method: "GET",
    url: `/api/portal/work-orders?customerId=${fitnessCustomerId}`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("ein abweichender Tenant-Query-Parameter wird generisch mit 404 blockiert", () => {
    assert.strictEqual(foreignTenantInQuery.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 5+6. Fremder Tenant/manipulierte User-ID im Body -> 400 (unbekanntes
  //      Feld, work-order-routes.js#assertKnownFieldsOnly).
  // -------------------------------------------------------------------

  const foreignTenantInBody = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(cafeAdminSession),
    bodyObj: { ...validBody(), tenantId: fitnessTenant.id },
  });
  await check("ein Tenant-Feld im Anlegen-Körper wird abgewiesen (400)", () => {
    assert.strictEqual(foreignTenantInBody.statusCode, 400);
  });

  const manipulatedUserIdInBody = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(cafeAdminSession),
    bodyObj: { ...validBody(), createdByUserId: fitnessAdmin.id },
  });
  await check("eine manipulierte User-ID im Anlegen-Körper wird abgewiesen (400) statt übernommen", () => {
    assert.strictEqual(manipulatedUserIdInBody.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 7. OWNER wird auf den Kundenrouten nicht als Kunde behandelt.
  // -------------------------------------------------------------------

  const ownerOnCustomerRoute = await invoke({
    method: "GET",
    url: "/api/portal/work-orders",
    headers: { cookie: ownerSession.cookieHeader },
  });
  await check("OWNER erreicht die Kunden-Arbeitsauftragsroute nicht (404)", () => {
    assert.strictEqual(ownerOnCustomerRoute.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 8. SUPPORT ohne Grant bleibt auf beiden Routen blockiert.
  // -------------------------------------------------------------------

  const supportOnCustomerRoute = await invoke({
    method: "GET",
    url: "/api/portal/work-orders",
    headers: { cookie: supportSession.cookieHeader },
  });
  await check("SUPPORT ohne aktiven Grant erreicht die Kundenroute nicht (404)", () => {
    assert.strictEqual(supportOnCustomerRoute.statusCode, 404);
  });

  const supportOnOwnerRoute = await invoke({
    method: "GET",
    url: "/api/owner/work-orders",
    headers: { cookie: supportSession.cookieHeader },
  });
  await check("SUPPORT ohne aktiven Grant erreicht die Owner-Route nicht (404)", () => {
    assert.strictEqual(supportOnOwnerRoute.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 9+10. Gesperrter Benutzer/gesperrter Mandant verlieren sofort Zugriff.
  // -------------------------------------------------------------------

  const disposableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("c-wird-gesperrt") });
  const disposableSession = await loginAndGetSession(disposableUser.emailNormalized);
  authDb.updateUserStatus(seedDb, disposableUser.id, "DISABLED");
  const blockedAfterUserDisable = await invoke({
    method: "GET",
    url: "/api/portal/work-orders",
    headers: { cookie: disposableSession.cookieHeader },
  });
  await check("ein gesperrter Benutzer verliert unmittelbar den Zugriff (401)", () => {
    assert.strictEqual(blockedAfterUserDisable.statusCode, 401);
  });

  const suspendableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("d-suspendierbar") });
  const suspendableSession = await loginAndGetSession(suspendableUser.emailNormalized);
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "SUSPENDED");
  const blockedAfterTenantSuspend = await invoke({
    method: "GET",
    url: "/api/portal/work-orders",
    headers: { cookie: suspendableSession.cookieHeader },
  });
  await check("ein gesperrter Mandant verliert unmittelbar den Zugriff für seine Benutzer (401)", () => {
    assert.strictEqual(blockedAfterTenantSuspend.statusCode, 401);
  });
  // Mandant wieder aktivieren, damit spätere Prüfungen (Mandant B) in
  // diesem Testlauf unberührt bleiben.
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");

  // -------------------------------------------------------------------
  // 11+12+13. Manipuliertes Cookie/CSRF/fremde Origin.
  // -------------------------------------------------------------------

  const manipulatedCookie = await invoke({
    method: "GET",
    url: "/api/portal/work-orders",
    headers: { cookie: "kuz_dev_session=komplett-erfundener-wert" },
  });
  await check("ein frei erfundener Session-Cookie-Wert wird abgelehnt (401)", () => {
    assert.strictEqual(manipulatedCookie.statusCode, 401);
  });

  const manipulatedCsrf = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(cafeAdminSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
    bodyObj: validBody(),
  });
  await check("ein falscher CSRF-Header wird abgelehnt (403)", () => {
    assert.strictEqual(manipulatedCsrf.statusCode, 403);
  });

  const foreignOrigin = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(cafeAdminSession, { origin: "https://angreifer.example.test" }),
    bodyObj: validBody(),
  });
  await check("eine fremde Origin wird abgelehnt (403)", () => {
    assert.strictEqual(foreignOrigin.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 14+15. Kein ID-/Statuscode-Leak: unbekannte ID und Fremdmandant-ID
  //        liefern identische, generische Antworten.
  // -------------------------------------------------------------------

  const unknownId = await invoke({
    method: "GET",
    url: "/api/portal/work-orders/ffffffff-ffff-ffff-ffff-ffffffffffff",
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("unbekannte ID und fremde Mandanten-ID liefern denselben Statuscode und dieselbe Antwortform (kein Leak)", () => {
    assert.strictEqual(unknownId.statusCode, foreignIdInPath.statusCode);
    assert.deepStrictEqual(Object.keys(unknownId.json).sort(), Object.keys(foreignIdInPath.json).sort());
    assert.strictEqual(unknownId.json.ok, foreignIdInPath.json.ok);
  });

  // -------------------------------------------------------------------
  // 16+17+18+19. Keine Ausführungs-/Publish-/Billing-/Providerrouten.
  // -------------------------------------------------------------------

  await check("kein Agentenstart über die Arbeitsauftragsfunktion (keine execute-Route)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/execute`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("keine Publish-Route für Arbeitsaufträge", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/publish`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("keine Billingroute für Arbeitsaufträge", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/billing`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("keine Providerroute für Arbeitsaufträge", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/provider`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 16b+16c+16d. Produktkorrektur: es gibt keine reguläre Owner-Freigabe/
  //              -Ablehnung/-Rückfrage mehr, und die beiden verbliebenen
  //              Ausnahmeaktionen sind ausschließlich dem OWNER vorbehalten.
  // -------------------------------------------------------------------

  await check("keine reguläre Owner-Freigabe-/Ablehnungs-/Rückfrageroute existiert mehr", async () => {
    for (const legacyAction of ["approve", "reject", "request-clarification"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderA.id}/${legacyAction}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { reason: "Testversuch." },
      });
      assert.strictEqual(result.statusCode, 404, `Route .../${legacyAction} sollte nicht mehr existieren`);
    }
  });

  await check("CUSTOMER_ADMIN erreicht die Owner-Ausnahmeaktionen (escalate/stop) nicht (404)", async () => {
    for (const exceptionAction of ["escalate", "stop"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderA.id}/${exceptionAction}`,
        headers: authedJsonHeaders(cafeAdminSession),
        bodyObj: { reason: "Unberechtigter Versuch." },
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });

  // -------------------------------------------------------------------
  // 20. Audit bei Tenant-Mismatch (fachlicher UND genereller Guard-Fall).
  // -------------------------------------------------------------------

  await check("ein fachlicher Tenant-Mismatch (fremder Auftrag im Pfad) wird als WORK_ORDER_TENANT_MISMATCH_BLOCKED auditiert", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_TENANT_MISMATCH_BLOCKED");
    assert.ok(events.some((event) => event.metadata && JSON.parse(event.metadata).workOrderId === orderB.id));
  });

  await check("ein genereller Guard-Tenant-Mismatch (Query-Parameter) wird als TENANT_MISMATCH_BLOCKED auditiert", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "TENANT_MISMATCH_BLOCKED");
    assert.ok(events.length > 0);
  });

  console.log(`work-order-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
