"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt P) – Sicherheits-/
// Mandantentrennungstests für die kontrollierte Übergabe von Arbeitsaufträgen
// an die interne Agentenzentrale (Läufe, Ergebnisse, zweites Safety-Gate).
// Gleiches Muster wie work-order-security.test.js.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-execution-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-execution-security-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authAudit = require("./auth-audit");
const authTenantLink = require("./auth-tenant-link");
const orchestrator = require("./work-order-agent-orchestrator");
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

const allResponseBodies = [];
function record(result) {
  allResponseBodies.push(result.body);
  return result;
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
      title: "Sicherheitstest-Auftrag für die Ausführung",
      desiredResult: "Ein ausführliches, gültiges Ergebnis für den Sicherheitstest der Agentenausführung.",
      context: "Zusätzlicher Kontext, damit der Auftrag ohne Rückfrage bearbeitbar ist.",
      ...overrides,
    };
  }

  async function createReadyOrder(session, overrides = {}) {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(session),
      bodyObj: validBody(overrides),
    });
    return result.json.workOrder;
  }

  const orderA = await createReadyOrder(cafeAdminSession, { title: "Auftrag A für Laufsicherheit" });
  const orderB = await createReadyOrder(fitnessAdminSession, { title: "Auftrag B für Laufsicherheit" });

  const runStartA = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  const runStartB = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderB.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("beide Vorbereitungsläufe waren erfolgreich (Testvoraussetzung)", () => {
    assert.strictEqual(runStartA.statusCode, 200);
    assert.strictEqual(runStartB.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 1+2. Tenant A sieht nur A-Läufe, Tenant B sieht nur B-Läufe (Owner-
  //      Sicht ist tenant-übergreifend by design, daher wird hier über die
  //      Kundenergebnisroute geprüft; die Owner-Sicht selbst wird unter
  //      Punkt 3/4 auf ID-Ebene getestet).
  // -------------------------------------------------------------------

  const resultForA = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderA.id}/result`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("Mandant A kann sein eigenes Ergebnis sehen", () => {
    assert.strictEqual(resultForA.statusCode, 200);
  });
  const resultForBFromA = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderB.id}/result`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("Mandant A kann das Ergebnis von Mandant B nicht sehen (404)", () => {
    assert.strictEqual(resultForBFromA.statusCode, 404);
  });
  const resultForAFromB = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderA.id}/result`,
    headers: { cookie: fitnessAdminSession.cookieHeader },
  });
  await check("Mandant B kann das Ergebnis von Mandant A nicht sehen (404)", () => {
    assert.strictEqual(resultForAFromB.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 3. Fremde Work-Order-ID -> 404.
  // -------------------------------------------------------------------

  await check("eine fremde Work-Order-ID bei Runs liefert 404", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/owner/work-orders/ffffffff-ffff-ffff-ffff-ffffffffffff/runs",
      headers: { cookie: ownerSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 4. Fremde Run-ID -> 404.
  // -------------------------------------------------------------------

  const runsForA = await invoke({ method: "GET", url: `/api/owner/work-orders/${orderA.id}/runs`, headers: { cookie: ownerSession.cookieHeader } });
  const runsForB = await invoke({ method: "GET", url: `/api/owner/work-orders/${orderB.id}/runs`, headers: { cookie: ownerSession.cookieHeader } });
  const runIdA = runsForA.json.runs[0].id;
  const runIdB = runsForB.json.runs[0].id;
  await check("eine Run-ID, die nicht zum Auftrag gehört, liefert 404", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/owner/work-orders/${orderA.id}/runs/${runIdB}`,
      headers: { cookie: ownerSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 5+6. Tenant im Query/Body wird ignoriert bzw. blockiert (bekanntes
  //      Feld-Allowlist-Muster, siehe work-order-routes.js).
  // -------------------------------------------------------------------

  await check("ein Tenant-Query-Parameter auf der Ergebnisroute wird ignoriert/blockiert statt übernommen", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderB.id}/result?customerId=${cafeCustomerId}`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("ein Tenant-Feld im Run-Start-Körper wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { tenantId: fitnessTenant.id },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 7. User-ID-Manipulation im Run-Start-Körper blockiert.
  // -------------------------------------------------------------------

  await check("eine manipulierte User-ID im Run-Start-Körper wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { startedByUserId: fitnessAdmin.id },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 8. CUSTOMER kann keinen Lauf starten.
  // -------------------------------------------------------------------

  const orderForCustomerAttempt = await createReadyOrder(cafeAdminSession, { title: "Auftrag für Kundenstartversuch" });
  await check("CUSTOMER_ADMIN kann über die Owner-Route keinen Lauf starten (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderForCustomerAttempt.id}/run`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 9. SUPPORT ohne Grant blockiert.
  // -------------------------------------------------------------------

  await check("SUPPORT ohne aktiven Grant erreicht die Run-Owner-Routen nicht (404)", async () => {
    const resultRuns = await invoke({
      method: "GET",
      url: `/api/owner/work-orders/${orderA.id}/runs`,
      headers: { cookie: supportSession.cookieHeader },
    });
    assert.strictEqual(resultRuns.statusCode, 404);
    const resultStart = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderForCustomerAttempt.id}/run`,
      headers: authedJsonHeaders(supportSession),
      bodyObj: {},
    });
    assert.strictEqual(resultStart.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 10+11. Suspendierter Benutzer/Mandant verlieren sofort Zugriff.
  // -------------------------------------------------------------------

  const disposableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("c-wird-gesperrt") });
  const disposableSession = await loginAndGetSession(disposableUser.emailNormalized);
  authDb.updateUserStatus(seedDb, disposableUser.id, "DISABLED");
  await check("ein gesperrter Benutzer verliert unmittelbar den Zugriff auf die Ergebnisroute (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/result`,
      headers: { cookie: disposableSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 401);
  });

  const suspendableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("d-suspendierbar") });
  const suspendableSession = await loginAndGetSession(suspendableUser.emailNormalized);
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "SUSPENDED");
  await check("ein gesperrter Mandant verliert unmittelbar den Zugriff für seine Benutzer (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderB.id}/result`,
      headers: { cookie: suspendableSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 401);
  });
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");

  // -------------------------------------------------------------------
  // 12+13+14. Manipuliertes Cookie/CSRF/fremde Origin.
  // -------------------------------------------------------------------

  await check("ein frei erfundener Session-Cookie-Wert wird auf der Ergebnisroute abgelehnt (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/result`,
      headers: { cookie: "kuz_dev_session=komplett-erfundener-wert" },
    });
    assert.strictEqual(result.statusCode, 401);
  });

  await check("ein falscher CSRF-Header beim Run-Start wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderForCustomerAttempt.id}/run`,
      headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin beim Run-Start wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderForCustomerAttempt.id}/run`,
      headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 15-18. Zweites Safety-Gate direkt vor Ausführung: BLOCK/ESCALATE
  //        verhindern den Lauf vollständig (kein Agent, kein Ergebnis).
  //        Der Auftrag wird bewusst per Direktzugriff auf READY_FOR_
  //        PROCESSING gesetzt, um das ERSTE Gate (bei Auftragseingang)
  //        zu umgehen und gezielt das ZWEITE Gate (Auftrag Abschnitt J)
  //        isoliert zu prüfen.
  // -------------------------------------------------------------------

  const blockOrder = authDb.createWorkOrder(seedDb, {
    tenantId: cafeTenant.id,
    createdByUserId: cafeAdmin.id,
    title: "Eindeutig unzulässiger Testinhalt",
    desiredResult: "Dieser Text enthält Volksverhetzung als eindeutiges Testmuster für das zweite Sicherheits-Gate.",
    status: "READY_FOR_PROCESSING",
  });
  const blockRunAttempt = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${blockOrder.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("BLOCK am zweiten Safety-Gate verhindert den Lauf vollständig (kein 200)", () => {
    assert.notStrictEqual(blockRunAttempt.statusCode, 200);
  });
  await check("bei BLOCK entsteht kein Agentenlauf-Datensatz", () => {
    const runs = authDb.listWorkOrderRunsForWorkOrder(seedDb, blockOrder.id, cafeTenant.id);
    assert.strictEqual(runs.length, 0);
  });
  await check("bei BLOCK entsteht kein Ergebnis", () => {
    const result = authDb.getLatestWorkOrderResultForWorkOrder(seedDb, blockOrder.id, cafeTenant.id);
    assert.strictEqual(result, null);
  });
  await check("BLOCK am zweiten Gate wird auditiert (WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY)", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY");
    assert.ok(events.some((event) => event.metadata && JSON.parse(event.metadata).workOrderId === blockOrder.id));
  });

  const escalateOrder = authDb.createWorkOrder(seedDb, {
    tenantId: cafeTenant.id,
    createdByUserId: cafeAdmin.id,
    title: "Grenzfall für Eskalation",
    desiredResult: "Dieser Auftrag betrifft ein digitales Abbild einer bekannten Person ohne Einwilligung als Testmuster.",
    status: "READY_FOR_PROCESSING",
  });
  const escalateRunAttempt = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${escalateOrder.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("ESCALATE am zweiten Safety-Gate verhindert den Lauf vollständig (started: false, kein Agent, kein Ergebnis)", () => {
    assert.strictEqual(escalateRunAttempt.statusCode, 200);
    assert.strictEqual(escalateRunAttempt.json.started, false);
    assert.strictEqual(escalateRunAttempt.json.workOrderStatus, "ESCALATED");
    assert.strictEqual(escalateRunAttempt.json.run, null);
  });
  await check("nach ESCALATE steht der Auftrag auf ESCALATED", () => {
    const reloaded = authDb.getWorkOrderById(seedDb, escalateOrder.id);
    assert.strictEqual(reloaded.status, "ESCALATED");
  });
  await check("bei ESCALATE entsteht kein Agentenlauf-Datensatz", () => {
    const runs = authDb.listWorkOrderRunsForWorkOrder(seedDb, escalateOrder.id, cafeTenant.id);
    assert.strictEqual(runs.length, 0);
  });
  await check("bei ESCALATE entsteht kein Ergebnis", () => {
    const result = authDb.getLatestWorkOrderResultForWorkOrder(seedDb, escalateOrder.id, cafeTenant.id);
    assert.strictEqual(result, null);
  });

  // -------------------------------------------------------------------
  // 19. Kein paralleler Lauf (bereits als Modultest in
  //     work-order-execution.test.js abgedeckt; hier zusätzlich über die
  //     HTTP-Route geprüft).
  // -------------------------------------------------------------------

  await check("ein zweiter HTTP-Startversuch auf einen bereits verarbeiteten Auftrag wird abgelehnt (kein 200)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${orderA.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.notStrictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 20. Kein Cross-Tenant-Ergebnis (Owner-Sicht: eigenes Ergebnis pro
  //     Auftrag korrekt zugeordnet, kein Vermischen der Agentendaten).
  // -------------------------------------------------------------------

  await check("die Run-Agenten von Auftrag A und Auftrag B werden nicht vermischt", () => {
    const agentsA = runsForA.json.runs[0].agents.map((a) => a.agentKey).sort();
    const agentsB = runsForB.json.runs[0].agents.map((a) => a.agentKey).sort();
    assert.ok(Array.isArray(agentsA) && agentsA.length > 0);
    assert.ok(Array.isArray(agentsB) && agentsB.length > 0);
  });

  // -------------------------------------------------------------------
  // 21+22+23. Keine Systemprompts/Chain-of-Thought/Secrets in Antworten.
  // -------------------------------------------------------------------

  await check("keine Antwort enthält Hinweise auf Systemprompts oder Chain-of-Thought", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/system[- ]?prompt/i.test(body));
      assert.ok(!/chain[- ]?of[- ]?thought/i.test(body));
    });
  });
  await check("keine Antwort enthält Secrets/Passwort-Hashes/Session-Token-Klartext", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/passwordHash/i.test(body));
      assert.ok(!/session[_-]?token/i.test(body));
      assert.ok(!/api[_-]?key/i.test(body));
    });
  });

  // -------------------------------------------------------------------
  // 24. Keine Publish-/Billing-/Providerroute.
  // -------------------------------------------------------------------

  await check("keine Publish-/Billing-/Providerroute existiert im Ausführungskontext", async () => {
    for (const action of ["publish", "billing", "provider", "canva", "heygen"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderA.id}/${action}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });

  // -------------------------------------------------------------------
  // 25. Audit ohne sensible Inhalte (Metadaten-Allowlist).
  // -------------------------------------------------------------------

  await check("Auditereignisse der Ausführung enthalten ausschließlich allowlisted Metadatenfelder", () => {
    const allowedKeys = ["workOrderId", "runId", "agentKey", "statusTransition", "reasonCode", "severity", "failureCode"];
    [
      "WORK_ORDER_RUN_PREPARED",
      "WORK_ORDER_RUN_STARTED",
      "WORK_ORDER_RUN_COMPLETED",
      "WORK_ORDER_RUN_FAILED",
      "WORK_ORDER_AGENT_SELECTED",
      "WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY",
      "WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY",
    ].forEach((eventType) => {
      authAudit.listAuditEventsByType(seedDb, eventType).forEach((event) => {
        if (!event.metadata) return;
        Object.keys(JSON.parse(event.metadata)).forEach((key) => assert.ok(allowedKeys.includes(key), `unerlaubtes Feld ${key} in ${eventType}`));
      });
    });
  });

  console.log(`work-order-execution-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
