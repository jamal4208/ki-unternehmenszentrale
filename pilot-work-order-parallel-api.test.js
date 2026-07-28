"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 4: erster kontrollierter
// Parallel-Pilot über die API-/Route-Schicht (Auftrag "Führe die bestehende
// Mehrfachlauf- und Konfliktlogik jetzt kontrolliert durch die reale
// API-/Route-Schicht").
//
// Läuft – anders als pilot-work-order-multi-order.test.js/
// pilot-work-order-concurrency.test.js (beide rufen die Serviceschicht
// direkt auf) – ausschließlich gegen den echten server.js#requestHandler
// (gleiches Muster wie pilot-work-order-security.test.js): jede Prüfung
// dieses Moduls durchläuft tatsächlich Routing, Auth-Gate, CSRF-/
// Origin-Prüfung, JSON-Body-Parsing und die HTTP-Fehlerabbildung – nicht
// nur die Serviceschicht.
//
// Ergänzt pilot-work-order.test.js, pilot-work-order-security.test.js,
// pilot-work-order-ui.test.js, pilot-work-order-multi-order.test.js und
// pilot-work-order-concurrency.test.js, ohne diese zu ersetzen.
//
// Ausschließlich isolierte os.tmpdir()-Testverzeichnisse (HOME/
// KUZ_DATA_DIR), niemals die echte Application-Support-Datenbank. Neutrale,
// rein technische Testinhalte – keine Health-/Medizin-Inhalte. Dieses
// Modul führt niemals eine externe Aktion aus, committet, pusht oder
// deployt nicht.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-parallel-api-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-parallel-api-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authTenantLink = require("./auth-tenant-link");
const healthService = require("./health-reference-work-run-service");
const pilotService = require("./pilot-work-order-service");
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

// Gleiche kleine, lokale invoke()-Testdouble-Fabrik wie
// pilot-work-order-security.test.js (bewusste, unabhängige Kopie statt
// eines gemeinsamen Test-Requires – identisches Projektmuster wie bei den
// Routenmodulen selbst, siehe work-order-routes.js#Kopfkommentar).
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

function testOrderInput(overrides = {}) {
  return {
    title: "Testauftrag: API-Parallel-Pilot",
    desiredOutcome: "Nachweis, dass zwei Pilotaufträge unabhängig über die HTTP-Schicht geführt werden können.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis beantwortet die Auftragsfrage", "Risiken sind benannt"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)", "Freigabe des finalen Ergebnisses (COMPLETED)"],
    timeframe: "Ohne festes Enddatum.",
    ...overrides,
  };
}

function handoffBody(overrides = {}) {
  return {
    fromPilotRole: "PROJEKTMANAGER",
    toPilotRole: "RECHERCHE_ANALYSE",
    shortFinding: "Auftrag geklärt, Recherche kann beginnen.",
    resultOrRecommendation: "Bitte belastbare Inhalte erarbeiten.",
    basisUsed: "Auftragstext und Qualitätskriterien.",
    riskOrLimit: "Zeitrahmen ist offen.",
    nextStep: "Recherche starten.",
    ...overrides,
  };
}

async function driveHandoffsAndComplete(orderId, ownerSession, textSeed) {
  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/submit-handoff`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: handoffBody({ shortFinding: `${textSeed}: geklärt.`, resultOrRecommendation: `${textSeed}: Rechercheergebnis liegt vor.` }),
  });
  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/submit-handoff`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: handoffBody({
      fromPilotRole: "RECHERCHE_ANALYSE",
      toPilotRole: "DOKUMENTATION",
      shortFinding: `${textSeed}: Recherche abgeschlossen.`,
      resultOrRecommendation: `${textSeed}: Dokumentiertes Endergebnis liegt vor.`,
    }),
  });
  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/submit-for-review`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {},
  });
  return invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/approve-completion`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { confirmed: true },
  });
}

function pilotAuditEventsFor(orderId) {
  return authDb
    .listAuditEvents(seedDb, { limit: 2000 })
    .filter((event) => event.eventType.startsWith("PILOT_"))
    .filter((event) => {
      if (!event.metadata) return false;
      try {
        return JSON.parse(event.metadata).pilotOrderId === orderId;
      } catch (_error) {
        return false;
      }
    });
}

async function run() {
  const healthBaseline = JSON.stringify(healthService.getOrCreateCanonicalRun(seedDb));

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
  // Test 19: bestehende Security-Regeln bleiben für die neue
  // Auftragsverwaltungsressource aktiv (OWNER_ONLY, CSRF, Origin).
  // -------------------------------------------------------------------

  await check("19a. CUSTOMER_ADMIN erreicht die Pilotauftragsliste nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/orders", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("19b. SUPPORT ohne aktiven Grant erreicht die Pilotauftragsliste nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/orders", headers: { cookie: supportSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("19c. CUSTOMER_ADMIN kann über POST keinen Pilotauftrag anlegen (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(customerAdminSession),
      bodyObj: testOrderInput(),
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("19d. ein falscher CSRF-Header beim Anlegen eines Pilotauftrags wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: testOrderInput(),
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("19e. eine fremde Origin beim Anlegen eines Pilotauftrags wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
      bodyObj: testOrderInput(),
    });
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // Tests 1–3: zwei neue Pilotaufträge über die API anlegen, mit
  // unterschiedlichen pilotOrderId.
  // -------------------------------------------------------------------

  let orderAId;
  let orderBId;

  await check("1. ein neuer Pilotauftrag (Auftrag A) kann über POST /api/pilot-work-order/orders angelegt werden", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput({ title: "Auftrag A: technischer API-Testauftrag" }),
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.overview.status, "DRAFT");
    assert.strictEqual(result.json.overview.order.revision, 0);
    orderAId = result.json.overview.order.id;
    assert.match(orderAId, /^pilot-order-[0-9a-f-]{36}$/);
  });

  await check("2. ein zweiter, unabhängiger Pilotauftrag (Auftrag B) kann ebenfalls über die API angelegt werden", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput({ title: "Auftrag B: technischer API-Testauftrag" }),
    });
    assert.strictEqual(result.statusCode, 200);
    orderBId = result.json.overview.order.id;
  });

  await check("3. Auftrag A und Auftrag B erhalten unterschiedliche, nicht-kanonische pilotOrderId", () => {
    assert.notStrictEqual(orderAId, orderBId);
    assert.notStrictEqual(orderAId, pilotService.CANONICAL_PILOT_ORDER_ID);
    assert.notStrictEqual(orderBId, pilotService.CANONICAL_PILOT_ORDER_ID);
  });

  await check("21a. ein unvollständiger Anlage-Request wird kontrolliert abgewiesen (400)", async () => {
    const incomplete = testOrderInput();
    delete incomplete.title;
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: incomplete,
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("21b. ein unbekanntes Feld im Anlage-Request wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { ...testOrderInput(), id: "pilot-order-versuchte-fremdvergabe" },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // Tests 4–6: Auftrag anhand pilotOrderId lesen, Liste enthält beide
  // Aufträge, Antwort enthält revision.
  // -------------------------------------------------------------------

  await check("4a. Auftrag A kann über GET /api/pilot-work-order/orders/:pilotOrderId gelesen werden", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderAId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.order.id, orderAId);
  });

  await check("4b. Auftrag B kann unabhängig über dieselbe Route gelesen werden", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderBId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.order.id, orderBId);
  });

  await check("5. die Auftragsliste (GET /api/pilot-work-order/orders) enthält beide angelegten Aufträge", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/orders", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    const ids = result.json.orders.map((order) => order.id);
    assert.ok(ids.includes(orderAId));
    assert.ok(ids.includes(orderBId));
  });

  await check("6. jede Auftragsantwort enthält eine numerische revision", async () => {
    const resultA = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderAId}`, headers: { cookie: ownerSession.cookieHeader } });
    const resultB = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderBId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(typeof resultA.json.overview.order.revision, "number");
    assert.strictEqual(typeof resultB.json.overview.order.revision, "number");
    assert.strictEqual(resultA.json.overview.order.revision, 0);
    assert.strictEqual(resultB.json.overview.order.revision, 0);
  });

  // -------------------------------------------------------------------
  // Test 20: eine unbekannte pilotOrderId liefert ein kontrolliertes
  // 404-Verhalten (kein 500, keine Bestätigung interner Details).
  // -------------------------------------------------------------------

  await check("20. eine unbekannte pilotOrderId liefert 404, kein interner Fehler", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/pilot-work-order/orders/pilot-order-does-not-exist",
      headers: { cookie: ownerSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
    assert.strictEqual(result.json.ok, false);
  });

  await check("21c. ein zusätzliches Pfadsegment hinter der pilotOrderId (GET) wird kontrolliert abgewiesen (404)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/pilot-work-order/orders/${orderAId}/extra-segment`,
      headers: { cookie: ownerSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("21d. eine unbekannte Aktion für einen bekannten Auftrag (POST) wird abgewiesen (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/deploy`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // Tests 7/8/9: gültige expectedRevision wird akzeptiert, eine veraltete
  // liefert HTTP 409 mit eindeutiger, technischer Fehlerantwort.
  // -------------------------------------------------------------------

  let orderARevision;

  await check("7a. Auftrag A kann über die adressierte Route (mark-ready-for-approval) weitergeführt werden", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/mark-ready-for-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "READY_FOR_JAMAL_APPROVAL");
    assert.strictEqual(result.json.overview.order.revision, 1);
    orderARevision = result.json.overview.order.revision;
  });

  await check("7b. eine gültige (aktuelle) expectedRevision wird akzeptiert (200)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/approve-for-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { confirmed: true, expectedRevision: orderARevision },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "APPROVED_FOR_EXECUTION");
    assert.strictEqual(result.json.overview.order.revision, 2);
    orderARevision = result.json.overview.order.revision;
  });

  let conflictResponse;

  await check("8. eine veraltete expectedRevision liefert HTTP 409 (kein Erfolg, kein last-write-wins)", async () => {
    conflictResponse = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/start-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { expectedRevision: orderARevision - 1 },
    });
    assert.strictEqual(conflictResponse.statusCode, 409);
    assert.strictEqual(conflictResponse.json.ok, false);
  });

  await check("9. die Konfliktantwort ist technisch eindeutig (pilotOrderId, erwartete/aktuelle Revision, kein Stacktrace)", () => {
    assert.strictEqual(conflictResponse.json.pilotOrderId, orderAId);
    assert.strictEqual(conflictResponse.json.expectedRevision, orderARevision - 1);
    assert.strictEqual(conflictResponse.json.currentRevision, orderARevision);
    assert.match(conflictResponse.json.message, /geändert|Revision/);
    assert.doesNotMatch(conflictResponse.body, /at\s+\S+\s+\(.*:\d+:\d+\)/); // kein Node-Stacktrace-Muster
    assert.doesNotMatch(conflictResponse.body, /passwort|password|"token"|session-?id/i);
  });

  await check("10./11. der Konflikt verändert weder Status noch Revision von Auftrag A", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderAId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.overview.status, "APPROVED_FOR_EXECUTION");
    assert.strictEqual(result.json.overview.order.revision, orderARevision);
  });

  await check("12. der abgelehnte Konflikt erzeugt keinen falschen Erfolgseintrag im Audit-Trail von Auftrag A", () => {
    const events = pilotAuditEventsFor(orderAId);
    events.forEach((event) => assert.strictEqual(event.result, "OK"));
    const statusEvents = events.filter((event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED");
    assert.ok(!statusEvents.some((event) => JSON.parse(event.metadata).nextStatus === "IN_EXECUTION"));
  });

  await check("21e. eine ungültige expectedRevision (falscher Typ) wird bereits auf HTTP-Ebene abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/start-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { expectedRevision: "zwei" },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // Tests 13/14: Statusänderung/Konflikt auf A beeinflusst Auftrag B nicht;
  // Auftrag B bleibt normal weiterführbar.
  // -------------------------------------------------------------------

  await check("13. Auftrag B bleibt von jeder bisherigen Operation auf Auftrag A unberührt (weiterhin DRAFT, revision 0)", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderBId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.overview.status, "DRAFT");
    assert.strictEqual(result.json.overview.order.revision, 0);
  });

  await check("14. Auftrag B kann trotz des Revisionskonflikts auf Auftrag A normal weitergeführt werden", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderBId}/mark-ready-for-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "READY_FOR_JAMAL_APPROVAL");
    const approveResult = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderBId}/approve-for-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { confirmed: true },
    });
    assert.strictEqual(approveResult.statusCode, 200);
    assert.strictEqual(approveResult.json.overview.status, "APPROVED_FOR_EXECUTION");
  });

  // -------------------------------------------------------------------
  // Auftrag A wird nach dem Konflikt normal (mit korrekter Revision)
  // fortgesetzt – der Konflikt war kein Dauerblocker.
  // -------------------------------------------------------------------

  await check("Auftrag A kann nach dem abgelehnten Konflikt mit der jetzt korrekten Revision normal fortgesetzt werden", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/start-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { expectedRevision: orderARevision },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.status, "IN_EXECUTION");
  });

  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderBId}/start-execution`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {},
  });

  // -------------------------------------------------------------------
  // Tests 15/16/17: Handoffs, PM-Ergebnisse und Freigaben bleiben
  // auftragsbezogen; beide Aufträge werden unabhängig bis COMPLETED
  // geführt (Test 23).
  // -------------------------------------------------------------------

  let handoffAResponse;
  await check("15a. eine über die adressierte Route eingereichte Rollenübergabe trägt die pilotOrderId von Auftrag A", async () => {
    handoffAResponse = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/submit-handoff`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: handoffBody({ shortFinding: "AUFTRAG-A: geklärt.", resultOrRecommendation: "AUFTRAG-A: Ergebnis liegt vor." }),
    });
    assert.strictEqual(handoffAResponse.statusCode, 200);
    assert.strictEqual(handoffAResponse.json.handoff.pilotOrderId, orderAId);
  });

  await check("15b./16. der Projektmanager-Filterbefund der Übergabe bleibt Auftrag A zugeordnet und beeinflusst Auftrag B nicht", async () => {
    assert.strictEqual(handoffAResponse.json.filterResult.passed, true);
    const overviewB = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderBId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(overviewB.json.overview.handoffs.length, 0);
  });

  const completedA = await driveHandoffsAndComplete(orderAId, ownerSession, "AUFTRAG-A");
  const completedB = await driveHandoffsAndComplete(orderBId, ownerSession, "AUFTRAG-B");

  await check("17a. die Abschlussfreigabe (approve-completion) von Auftrag A ist eindeutig Auftrag A zugeordnet", () => {
    assert.strictEqual(completedA.statusCode, 200);
    assert.strictEqual(completedA.json.overview.status, "COMPLETED");
    assert.strictEqual(completedA.json.overview.order.id, orderAId);
    completedA.json.overview.handoffs.forEach((handoff) => assert.strictEqual(handoff.pilotOrderId, orderAId));
  });

  await check("17b./23. Auftrag B kann unabhängig von Auftrag A ebenfalls vollständig bis COMPLETED geführt werden", () => {
    assert.strictEqual(completedB.statusCode, 200);
    assert.strictEqual(completedB.json.overview.status, "COMPLETED");
    assert.strictEqual(completedB.json.overview.order.id, orderBId);
    completedB.json.overview.handoffs.forEach((handoff) => assert.strictEqual(handoff.pilotOrderId, orderBId));
  });

  // -------------------------------------------------------------------
  // Test 22: ein abgeschlossener Auftrag bleibt über HTTP unveränderbar.
  // -------------------------------------------------------------------

  await check("22. ein abgeschlossener Auftrag (A) bleibt über die API unveränderbar (409, kein stiller Erfolg)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderAId}/block-order`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Testfixtur" },
    });
    assert.strictEqual(result.statusCode, 409);
    assert.strictEqual(result.json.pilotOrderId, orderAId);
    const overview = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderAId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(overview.json.overview.status, "COMPLETED");
  });

  // -------------------------------------------------------------------
  // Test 18: der bestehende kanonische Einzelauftrag bleibt über die
  // unveränderte Route vollständig kompatibel (kein pilotOrderId im Pfad,
  // kein verpflichtendes expectedRevision).
  // -------------------------------------------------------------------

  await check("18a. GET /api/pilot-work-order/status bleibt unverändert erreichbar und liefert den kanonischen Auftrag", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/status", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.order.id, pilotService.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(typeof result.json.overview.order.revision, "number");
  });

  await check("18b. die bestehende kanonische Aktionsroute (ohne pilotOrderId im Pfad) funktioniert weiterhin ohne expectedRevision", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/mark-ready-for-approval",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.order.id, pilotService.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(result.json.overview.status, "READY_FOR_JAMAL_APPROVAL");
  });

  await check("18c. die Auftragsliste enthält nach Aufruf der kanonischen Route auch den kanonischen Auftrag, ohne A/B zu verändern", async () => {
    const result = await invoke({ method: "GET", url: "/api/pilot-work-order/orders", headers: { cookie: ownerSession.cookieHeader } });
    const ids = result.json.orders.map((order) => order.id);
    assert.ok(ids.includes(pilotService.CANONICAL_PILOT_ORDER_ID));
    assert.ok(ids.includes(orderAId));
    assert.ok(ids.includes(orderBId));
    const overviewA = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderAId}`, headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(overviewA.json.overview.status, "COMPLETED");
  });

  // -------------------------------------------------------------------
  // Test 24: Audit-Historien bleiben über die gesamte HTTP-Sitzung
  // vollständig getrennt.
  // -------------------------------------------------------------------

  await check("24. Audit-Ereignisse von Auftrag A und Auftrag B bleiben vollständig disjunkt", () => {
    const eventsA = pilotAuditEventsFor(orderAId);
    const eventsB = pilotAuditEventsFor(orderBId);
    assert.ok(eventsA.length > 0);
    assert.ok(eventsB.length > 0);
    const idsA = new Set(eventsA.map((event) => event.eventId));
    const idsB = new Set(eventsB.map((event) => event.eventId));
    idsA.forEach((id) => assert.ok(!idsB.has(id)));
    eventsA.forEach((event) => assert.strictEqual(JSON.parse(event.metadata).pilotOrderId, orderAId));
    eventsB.forEach((event) => assert.strictEqual(JSON.parse(event.metadata).pilotOrderId, orderBId));
  });

  // -------------------------------------------------------------------
  // Test 25: Health-Referenzdaten bleiben durch den gesamten
  // Zwei-Auftrags-Pilot über die API-Schicht unverändert.
  // -------------------------------------------------------------------

  await check("25. Health-Referenzdaten bleiben durch den gesamten Zwei-Auftrags-Pilot über die API-Schicht unverändert", () => {
    const healthAfter = JSON.stringify(healthService.getOrCreateCanonicalRun(seedDb));
    assert.strictEqual(healthAfter, healthBaseline);
  });

  console.log(`pilot-work-order-parallel-api.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-parallel-api.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
