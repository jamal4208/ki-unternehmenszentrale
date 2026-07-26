"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt P, letzter Qualitätsabgleich
// Abschnitt B) – dedizierte, vollständige Sicherheits-/Funktionsabdeckung
// der Kundenfreigabe (work-order-approval-service.js/work-order-change-
// routes.js#handlePortalWorkOrderApprove). Ergänzt (nicht ersetzt)
// work-order-change.test.js: dort ist der End-zu-Ende-Fluss abgedeckt, hier
// jede einzelne, im Auftrag benannte Garantie explizit und isoliert.
//
// Gleiches Testmuster wie work-order-execution-security.test.js: echter
// server.js#requestHandler mit isoliertem HOME-/KUZ_DATA_DIR-Verzeichnis.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-approval-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-approval-test-data-"));
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

async function approve(session, workOrderId, bodyObj = {}) {
  return invoke({
    method: "POST",
    url: `/api/portal/work-orders/${workOrderId}/approve`,
    headers: authedJsonHeaders(session),
    bodyObj,
  });
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
  const cafeUser = makeUser({ role: "CUSTOMER_USER", tenantId: cafeTenant.id, email: nextEmail("a-cafe-user") });
  const cafeUserSession = await loginAndGetSession(cafeUser.emailNormalized);
  const fitnessAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("b-fitness-admin") });
  const fitnessAdminSession = await loginAndGetSession(fitnessAdmin.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);

  function makeOrderWithStatus(status, overrides = {}) {
    return authDb.createWorkOrder(seedDb, {
      tenantId: cafeTenant.id,
      createdByUserId: cafeAdmin.id,
      title: `Testauftrag Status ${status}`,
      desiredResult: "Ausreichend langer, gültiger Text für den Freigabetest.",
      status,
      ...overrides,
    });
  }

  function attachResult(order, overrides = {}) {
    const runRecord = authDb.createWorkOrderRun(seedDb, {
      workOrderId: order.id,
      tenantId: cafeTenant.id,
      status: "COMPLETED",
      orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    return authDb.createWorkOrderResult(seedDb, {
      workOrderId: order.id,
      runId: runRecord.id,
      tenantId: cafeTenant.id,
      resultTitle: "Testergebnis",
      resultSummary: "Testzusammenfassung",
      resultBody: "Testinhalt",
      qualityStatus: "PASSED",
      ...overrides,
    });
  }

  // -------------------------------------------------------------------
  // 1-4. Erfolgreiche Freigabe: Status, Datensatz, korrekt gebundene
  //      Ergebnisversion.
  // -------------------------------------------------------------------

  const readyOrder = makeOrderWithStatus("RESULT_READY");
  const readyResult = attachResult(readyOrder);
  const approveOk = record(await approve(cafeAdminSession, readyOrder.id, { approvalNote: "Passt genau so." }));
  await check("CUSTOMER_ADMIN kann ein RESULT_READY-Ergebnis freigeben (200)", () => {
    assert.strictEqual(approveOk.statusCode, 200);
    assert.strictEqual(approveOk.json.workOrder.status, "CUSTOMER_APPROVED");
  });
  await check("die Work Order wechselt tatsächlich in der Datenbank auf CUSTOMER_APPROVED", () => {
    const reloaded = authDb.getWorkOrderById(seedDb, readyOrder.id);
    assert.strictEqual(reloaded.status, "CUSTOMER_APPROVED");
  });
  await check("es entsteht genau ein Freigabe-Datensatz, korrekt an Ergebnis-ID und Version gebunden", () => {
    const approvalRow = authDb.getWorkOrderCustomerApprovalByResultId(seedDb, readyResult.id);
    assert.ok(approvalRow);
    assert.strictEqual(approvalRow.resultId, readyResult.id);
    assert.strictEqual(approvalRow.approvalVersion, readyResult.versionNumber);
    assert.strictEqual(approvalRow.workOrderId, readyOrder.id);
    assert.strictEqual(approvalRow.tenantId, cafeTenant.id);
    assert.strictEqual(approveOk.json.approval.resultId, readyResult.id);
    assert.strictEqual(approveOk.json.approval.approvalVersion, readyResult.versionNumber);
  });
  await check("die Freigabe ist an genau den Kunden gebunden, der sie ausgelöst hat", () => {
    const approvalRow = authDb.getWorkOrderCustomerApprovalByResultId(seedDb, readyResult.id);
    assert.strictEqual(approvalRow.approvedByUserId, cafeAdmin.id);
  });

  // -------------------------------------------------------------------
  // 5. Atomarität: Freigabe und Statuswechsel geschehen zusammen oder gar
  //    nicht – simuliert durch einen vorab (Race-Condition) angelegten
  //    Freigabedatensatz für exakt dieselbe Ergebnis-ID.
  // -------------------------------------------------------------------

  const atomicOrder = makeOrderWithStatus("RESULT_READY");
  const atomicResult = attachResult(atomicOrder);
  authDb.createWorkOrderCustomerApproval(seedDb, {
    workOrderId: atomicOrder.id,
    tenantId: cafeTenant.id,
    resultId: atomicResult.id,
    approvedByUserId: cafeAdmin.id,
    approvalVersion: atomicResult.versionNumber,
  });
  const atomicAttempt = await approve(cafeAdminSession, atomicOrder.id, {});
  await check("Atomarität: schlägt die Freigabeanlage fehl (Race Condition), bleibt der Auftrag unverändert RESULT_READY statt in einem inkonsistenten Zwischenzustand", () => {
    assert.strictEqual(atomicAttempt.statusCode, 409);
    const reloaded = authDb.getWorkOrderById(seedDb, atomicOrder.id);
    assert.strictEqual(reloaded.status, "RESULT_READY");
  });
  await check("Atomarität: es existiert weiterhin genau ein Freigabedatensatz für diese Ergebnisversion (kein Duplikat, kein Halbzustand)", () => {
    const approvals = authDb.listWorkOrderCustomerApprovalsForWorkOrder(seedDb, atomicOrder.id);
    assert.strictEqual(approvals.length, 1);
  });

  // -------------------------------------------------------------------
  // 6. Doppelte Freigabe wird über die echte HTTP-Route blockiert.
  // -------------------------------------------------------------------

  const doubleApproveAttempt = await approve(cafeAdminSession, readyOrder.id, {});
  await check("eine zweite Freigabe desselben, bereits freigegebenen Ergebnisses wird blockiert (409)", () => {
    assert.strictEqual(doubleApproveAttempt.statusCode, 409);
    const approvals = authDb.listWorkOrderCustomerApprovalsForWorkOrder(seedDb, readyOrder.id);
    assert.strictEqual(approvals.length, 1);
  });

  // -------------------------------------------------------------------
  // 7. Eine alte Version kann nicht freigegeben werden: strukturell
  //    ausgeschlossen, da approveResult() keinen resultId-Parameter kennt
  //    (immer die aktuell neueste Version) und der Endpunkt jedes fremde
  //    Feld im Körper abweist.
  // -------------------------------------------------------------------

  const versionOrder = makeOrderWithStatus("RESULT_READY");
  const oldResult = attachResult(versionOrder, { resultTitle: "Alte Version" });
  authDb.transitionWorkOrder(seedDb, versionOrder.id, { tenantId: cafeTenant.id, fromStatuses: ["RESULT_READY"], toStatus: "CHANGES_REQUESTED" });
  const newResult = attachResult(versionOrder, { resultTitle: "Neue Version" });
  authDb.transitionWorkOrder(seedDb, versionOrder.id, { tenantId: cafeTenant.id, fromStatuses: ["CHANGES_REQUESTED"], toStatus: "RESULT_READY" });
  await check("ein expliziter resultId-Verweis auf eine alte Version im Freigabekörper wird strukturell abgewiesen (400, unbekanntes Feld)", async () => {
    const attempt = await approve(cafeAdminSession, versionOrder.id, { resultId: oldResult.id });
    assert.strictEqual(attempt.statusCode, 400);
  });
  const versionApprove = record(await approve(cafeAdminSession, versionOrder.id, {}));
  await check("eine Freigabe ohne resultId bindet sich automatisch an die aktuell neueste Version, niemals an eine ältere", () => {
    assert.strictEqual(versionApprove.statusCode, 200);
    assert.strictEqual(versionApprove.json.approval.resultId, newResult.id);
    assert.notStrictEqual(versionApprove.json.approval.resultId, oldResult.id);
    assert.strictEqual(versionApprove.json.approval.approvalVersion, newResult.versionNumber);
  });
  await check("die alte Version besitzt weiterhin keinen Freigabedatensatz", () => {
    assert.strictEqual(authDb.getWorkOrderCustomerApprovalByResultId(seedDb, oldResult.id), null);
  });

  // -------------------------------------------------------------------
  // 8-16. Freigabe ist ausschließlich aus RESULT_READY erreichbar – jeder
  //       andere Status wird abgelehnt (409).
  // -------------------------------------------------------------------

  const blockedStatuses = [
    "DRAFT",
    "SUBMITTED",
    "NEEDS_CLARIFICATION",
    "READY_FOR_PROCESSING",
    "IN_PROGRESS",
    "CHANGES_REQUESTED",
    "ESCALATED",
    "CANCELLED",
    "CUSTOMER_APPROVED",
  ];
  for (const status of blockedStatuses) {
    const order = makeOrderWithStatus(status);
    // eslint-disable-next-line no-await-in-loop
    await check(`eine Freigabe aus Status ${status} wird abgelehnt (409)`, async () => {
      const attempt = await approve(cafeAdminSession, order.id, {});
      assert.strictEqual(attempt.statusCode, 409);
      const reloaded = authDb.getWorkOrderById(seedDb, order.id);
      assert.strictEqual(reloaded.status, status);
    });
  }

  // -------------------------------------------------------------------
  // 17+18. CUSTOMER_ADMIN und CUSTOMER_USER dürfen beide freigeben.
  // -------------------------------------------------------------------

  const userOrder = makeOrderWithStatus("RESULT_READY");
  attachResult(userOrder);
  const userApprove = await approve(cafeUserSession, userOrder.id, {});
  await check("CUSTOMER_USER kann ein Ergebnis genauso freigeben wie CUSTOMER_ADMIN", () => {
    assert.strictEqual(userApprove.statusCode, 200);
    assert.strictEqual(userApprove.json.workOrder.status, "CUSTOMER_APPROVED");
  });

  // -------------------------------------------------------------------
  // 19+20. OWNER darf nicht als Kunde freigeben, SUPPORT ohne Grant
  //        blockiert.
  // -------------------------------------------------------------------

  const ownerAttemptOrder = makeOrderWithStatus("RESULT_READY");
  attachResult(ownerAttemptOrder);
  await check("OWNER kann die Kundenfreigaberoute nicht als Kunde nutzen (404)", async () => {
    const attempt = await approve(ownerSession, ownerAttemptOrder.id, {});
    assert.strictEqual(attempt.statusCode, 404);
    const reloaded = authDb.getWorkOrderById(seedDb, ownerAttemptOrder.id);
    assert.strictEqual(reloaded.status, "RESULT_READY");
  });
  await check("es gibt keine Owner-Freigaberoute auf oberster Ebene (404 unabhängig vom Auftrag)", async () => {
    const attempt = await invoke({ method: "POST", url: `/api/owner/work-orders/${ownerAttemptOrder.id}/approve`, headers: authedJsonHeaders(ownerSession), bodyObj: {} });
    assert.strictEqual(attempt.statusCode, 404);
  });
  await check("SUPPORT ohne aktiven Grant wird blockiert (404)", async () => {
    const attempt = await approve(supportSession, ownerAttemptOrder.id, {});
    assert.strictEqual(attempt.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 21. Fremder Tenant erhält generisches 404.
  // -------------------------------------------------------------------

  await check("ein fremder Mandant kann ein Ergebnis eines anderen Mandanten nicht freigeben (404)", async () => {
    const attempt = await approve(fitnessAdminSession, ownerAttemptOrder.id, {});
    assert.strictEqual(attempt.statusCode, 404);
    const reloaded = authDb.getWorkOrderById(seedDb, ownerAttemptOrder.id);
    assert.strictEqual(reloaded.status, "RESULT_READY");
  });

  // -------------------------------------------------------------------
  // 22+23. Tenant/User-ID ausschließlich aus der Session, niemals aus dem
  //        Körper – jedes fremde Feld wird abgewiesen.
  // -------------------------------------------------------------------

  await check("ein tenantId-Feld im Freigabekörper wird abgewiesen (400, Tenant kommt ausschließlich aus der Session)", async () => {
    const attempt = await approve(cafeAdminSession, ownerAttemptOrder.id, { tenantId: fitnessTenant.id });
    assert.strictEqual(attempt.statusCode, 400);
  });
  await check("ein approvedByUserId-Feld im Freigabekörper wird abgewiesen (400)", async () => {
    const attempt = await approve(cafeAdminSession, ownerAttemptOrder.id, { approvedByUserId: fitnessAdmin.id });
    assert.strictEqual(attempt.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 24. Freigabenotiz ist längenbegrenzt.
  // -------------------------------------------------------------------

  await check("eine zu lange Freigabenotiz (>1000 Zeichen) wird abgewiesen (400)", async () => {
    const attempt = await approve(cafeAdminSession, ownerAttemptOrder.id, { approvalNote: "x".repeat(1001) });
    assert.strictEqual(attempt.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 25+26. Kein Publish, kein Billing.
  // -------------------------------------------------------------------

  await check("keine Publish-Route existiert im Freigabekontext (404)", async () => {
    const attempt = await invoke({ method: "POST", url: `/api/portal/work-orders/${ownerAttemptOrder.id}/publish`, headers: authedJsonHeaders(cafeAdminSession), bodyObj: {} });
    assert.strictEqual(attempt.statusCode, 404);
  });
  await check("keine Billing-Route existiert im Freigabekontext (404)", async () => {
    const attempt = await invoke({ method: "POST", url: `/api/portal/work-orders/${ownerAttemptOrder.id}/billing`, headers: authedJsonHeaders(cafeAdminSession), bodyObj: {} });
    assert.strictEqual(attempt.statusCode, 404);
  });
  await check("keine Provider-Route (Canva/HeyGen) existiert im Freigabekontext (404)", async () => {
    for (const action of ["canva", "heygen", "provider"]) {
      // eslint-disable-next-line no-await-in-loop
      const attempt = await invoke({ method: "POST", url: `/api/portal/work-orders/${ownerAttemptOrder.id}/${action}`, headers: authedJsonHeaders(cafeAdminSession), bodyObj: {} });
      assert.strictEqual(attempt.statusCode, 404);
    }
  });

  // -------------------------------------------------------------------
  // 27+28. Audit ohne Ergebnistext, Cache-Control: no-store.
  // -------------------------------------------------------------------

  await check("Cache-Control: no-store wird bei der Freigabeantwort gesetzt", () => {
    assert.strictEqual(approveOk.headers["Cache-Control"], "no-store");
  });
  await check("das Freigabe-Auditereignis enthält ausschließlich allowlisted Metadaten, niemals Ergebnistext/Freigabenotiz", () => {
    const allowedKeys = ["workOrderId", "resultId", "resultVersion", "statusTransition"];
    const events = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER");
    assert.ok(events.length > 0);
    events.forEach((event) => {
      if (!event.metadata) return;
      Object.keys(JSON.parse(event.metadata)).forEach((key) => assert.ok(allowedKeys.includes(key), `unerlaubtes Feld ${key}`));
      assert.doesNotMatch(event.metadata, /Testinhalt|Testzusammenfassung|Passt genau so/);
    });
  });

  // -------------------------------------------------------------------
  // 29-31. Manipuliertes Cookie/CSRF, fremde Origin.
  // -------------------------------------------------------------------

  await check("ein frei erfundener Session-Cookie-Wert wird auf der Freigaberoute abgelehnt (401)", async () => {
    const attempt = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${ownerAttemptOrder.id}/approve`,
      headers: { cookie: "kuz_dev_session=komplett-erfundener-wert", "content-type": "application/json" },
      bodyObj: {},
    });
    assert.strictEqual(attempt.statusCode, 401);
  });
  await check("ein falscher CSRF-Header bei der Freigabe wird abgelehnt (403)", async () => {
    const attempt = await approve(cafeAdminSession, ownerAttemptOrder.id, {});
    void attempt;
    const badCsrf = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${ownerAttemptOrder.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: {},
    });
    assert.strictEqual(badCsrf.statusCode, 403);
  });
  await check("eine fremde Origin bei der Freigabe wird abgelehnt (403)", async () => {
    const attempt = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${ownerAttemptOrder.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession, { origin: "https://angreifer.example.test" }),
      bodyObj: {},
    });
    assert.strictEqual(attempt.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 32+33. Suspendierter Benutzer/Mandant verlieren sofort den Zugriff.
  // -------------------------------------------------------------------

  const disposableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("c-wird-gesperrt") });
  const disposableSession = await loginAndGetSession(disposableUser.emailNormalized);
  const disposableOrder = makeOrderWithStatus("RESULT_READY");
  attachResult(disposableOrder);
  authDb.updateUserStatus(seedDb, disposableUser.id, "DISABLED");
  await check("ein gesperrter Benutzer verliert unmittelbar den Zugriff auf die Freigaberoute (401)", async () => {
    const attempt = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${disposableOrder.id}/approve`,
      headers: authedJsonHeaders(disposableSession),
      bodyObj: {},
    });
    assert.strictEqual(attempt.statusCode, 401);
  });

  const suspendableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("d-suspendierbar") });
  const suspendableSession = await loginAndGetSession(suspendableUser.emailNormalized);
  const suspendableOrder = authDb.createWorkOrder(seedDb, {
    tenantId: fitnessTenant.id,
    createdByUserId: suspendableUser.id,
    title: "Auftrag für Mandantensperrtest",
    desiredResult: "Ausreichend langer, gültiger Text.",
    status: "RESULT_READY",
  });
  const suspendableRun = authDb.createWorkOrderRun(seedDb, {
    workOrderId: suspendableOrder.id,
    tenantId: fitnessTenant.id,
    status: "COMPLETED",
    orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  authDb.createWorkOrderResult(seedDb, {
    workOrderId: suspendableOrder.id,
    runId: suspendableRun.id,
    tenantId: fitnessTenant.id,
    resultTitle: "T",
    resultSummary: "T",
    resultBody: "T",
    qualityStatus: "PASSED",
  });
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "SUSPENDED");
  await check("ein gesperrter Mandant verliert unmittelbar den Zugriff auf die Freigaberoute für seine Benutzer (401)", async () => {
    const attempt = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${suspendableOrder.id}/approve`,
      headers: authedJsonHeaders(suspendableSession),
      bodyObj: {},
    });
    assert.strictEqual(attempt.statusCode, 401);
  });
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");

  // -------------------------------------------------------------------
  // 34. Keine Stacktraces/Secrets in irgendeiner erfassten Antwort.
  // -------------------------------------------------------------------

  await check("keine erfasste Antwort enthält Stacktraces, Passwort-Hashes oder Session-Token im Klartext", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/at\s+[\w.]+\s+\(/.test(body));
      assert.ok(!/passwordHash/i.test(body));
      assert.ok(!/session[_-]?token/i.test(body));
    });
  });

  console.log(`work-order-approval.test.js: ${passed} Prüfpunkte erfolgreich`);
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
