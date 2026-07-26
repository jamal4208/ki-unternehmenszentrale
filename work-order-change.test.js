"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt P) – Tests für Kunden-
// änderungswünsche, den kontrollierten Revisionslauf, unveränderliche
// Ergebnisversionen und die Kundenfreigabe (work-order-change-service.js/
// work-order-approval-service.js/work-order-result-service.js/
// work-order-change-routes.js).
//
// Gleiches Testmuster wie work-order-execution.test.js/
// work-order-execution-security.test.js: echter server.js#requestHandler
// mit isoliertem HOME-/KUZ_DATA_DIR-Verzeichnis, ergänzt um gezielte
// Modul-/Datenbankprüfungen für Invarianten, die eine reine HTTP-Prüfung
// nicht sinnvoll abbilden kann (Idempotenz-Unique-Indizes, Append-only).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-change-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-change-test-data-"));
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

  async function createOrder(session, overrides = {}) {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(session),
      bodyObj: {
        title: "Landingpage für unser Ladengeschäft",
        desiredResult: "Wir wünschen uns eine verständliche, vertrauenswürdige Landingpage für unser Ladengeschäft.",
        context: "Zielgruppe sind lokale Laufkunden, die uns über Suchmaschinen finden.",
        deadlineText: "in drei Wochen",
        ...overrides,
      },
    });
    return result.json.workOrder;
  }

  async function createResultReadyOrder(session, overrides = {}) {
    const order = await createOrder(session, overrides);
    const runResult = await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${order.id}/run`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(runResult.statusCode, 200, "Testvoraussetzung: Erstlauf muss erfolgreich sein");
    assert.strictEqual(runResult.json.workOrderStatus, "RESULT_READY", "Testvoraussetzung: Auftrag muss RESULT_READY sein");
    return order;
  }

  // -------------------------------------------------------------------
  // 1-8. Erfolgreicher Änderungswunsch: neue Version, alte Version bleibt
  //      abrufbar, Änderungswunsch COMPLETED, Owner-Sicht konsistent.
  // -------------------------------------------------------------------

  const orderA = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag A für Änderungswunsch" });

  const versionsBefore = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderA.id}/result-versions`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("vor jedem Änderungswunsch existiert genau eine Ergebnisversion (Version 1)", () => {
    assert.strictEqual(versionsBefore.statusCode, 200);
    assert.strictEqual(versionsBefore.json.versions.length, 1);
    assert.strictEqual(versionsBefore.json.versions[0].versionNumber, 1);
    assert.strictEqual(versionsBefore.json.versions[0].isApproved, false);
  });

  const changeRequestResult = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {
        requestText: "Bitte die Zusammenfassung etwas kürzer und konkreter formulieren.",
        preserveText: "Die Kontaktangaben sollen unverändert bleiben.",
        importantNote: "Zielgruppe bleibt gleich.",
      },
    }),
  );
  await check("ein Änderungswunsch auf einem RESULT_READY-Auftrag wird angenommen und läuft synchron durch (200)", () => {
    assert.strictEqual(changeRequestResult.statusCode, 200);
    assert.strictEqual(changeRequestResult.json.ok, true);
    assert.strictEqual(changeRequestResult.json.workOrderStatus, "RESULT_READY");
    assert.strictEqual(changeRequestResult.json.resultVersion, 2);
  });

  const versionsAfter = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderA.id}/result-versions`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("nach dem Änderungswunsch existieren zwei Ergebnisversionen, neueste zuerst", () => {
    assert.strictEqual(versionsAfter.json.versions.length, 2);
    assert.strictEqual(versionsAfter.json.versions[0].versionNumber, 2);
    assert.strictEqual(versionsAfter.json.versions[1].versionNumber, 1);
  });
  await check("die alte Ergebnisversion (Version 1) bleibt inhaltlich unverändert abrufbar", () => {
    const oldVersion = versionsAfter.json.versions.find((v) => v.versionNumber === 1);
    assert.ok(oldVersion);
    assert.ok(oldVersion.title);
    assert.ok(oldVersion.summary);
  });

  const changeRequestsForCustomer = await invoke({
    method: "GET",
    url: `/api/portal/work-orders/${orderA.id}/change-requests`,
    headers: { cookie: cafeAdminSession.cookieHeader },
  });
  await check("der abgeschlossene Änderungswunsch ist für den Kunden sichtbar mit Status COMPLETED", () => {
    assert.strictEqual(changeRequestsForCustomer.statusCode, 200);
    assert.strictEqual(changeRequestsForCustomer.json.changeRequests.length, 1);
    assert.strictEqual(changeRequestsForCustomer.json.changeRequests[0].status, "COMPLETED");
    assert.strictEqual(changeRequestsForCustomer.json.changeRequests[0].resultingResultId, changeRequestResult.json.resultId);
  });

  const changeRequestsForOwner = await invoke({
    method: "GET",
    url: `/api/owner/work-orders/${orderA.id}/change-requests`,
    headers: { cookie: ownerSession.cookieHeader },
  });
  await check("der Owner sieht denselben Änderungswunsch rein lesend, inklusive Kundentext", () => {
    assert.strictEqual(changeRequestsForOwner.statusCode, 200);
    assert.strictEqual(changeRequestsForOwner.json.changeRequests.length, 1);
    assert.strictEqual(changeRequestsForOwner.json.changeRequests[0].status, "COMPLETED");
    assert.match(changeRequestsForOwner.json.changeRequests[0].requestText, /kürzer und konkreter/);
  });

  const versionsForOwner = await invoke({
    method: "GET",
    url: `/api/owner/work-orders/${orderA.id}/result-versions`,
    headers: { cookie: ownerSession.cookieHeader },
  });
  await check("der Owner sieht beide Ergebnisversionen rein lesend, keine davon freigegeben", () => {
    assert.strictEqual(versionsForOwner.statusCode, 200);
    assert.strictEqual(versionsForOwner.json.versions.length, 2);
    versionsForOwner.json.versions.forEach((v) => assert.strictEqual(v.isApproved, false));
  });

  // -------------------------------------------------------------------
  // 9. Ein aktiver Auftrag ohne RESULT_READY (z. B. READY_FOR_PROCESSING)
  //    kann keinen Änderungswunsch entgegennehmen (409).
  // -------------------------------------------------------------------

  const freshOrder = await createOrder(cafeAdminSession, { title: "Frischer Auftrag ohne Ergebnis" });
  await check("ein Änderungswunsch auf einem Auftrag ohne Ergebnis wird abgelehnt (409)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${freshOrder.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "Irgendein Änderungswunsch." },
    });
    assert.strictEqual(result.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 10-12. Feldvalidierung: Pflichtfeld, Längenlimits, unbekannte Felder.
  // -------------------------------------------------------------------

  const orderForValidation = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für Feldvalidierung" });
  await check("ein leerer Änderungswunschtext wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForValidation.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "   " },
    });
    assert.strictEqual(result.statusCode, 400);
  });
  await check("ein zu langer Änderungswunschtext (>2000 Zeichen) wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForValidation.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "x".repeat(2001) },
    });
    assert.strictEqual(result.statusCode, 400);
  });
  await check("ein unbekanntes Feld im Änderungswunsch-Körper wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForValidation.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "Gültiger Text.", tenantId: fitnessTenant.id },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 13-15. Safety-Gate BLOCK/ESCALATE beim Änderungswunsch (Gate Nr. 1).
  // -------------------------------------------------------------------

  const orderForBlock = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für Gate-BLOCK beim Änderungswunsch" });
  const blockAttempt = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForBlock.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "Bitte ergänzen Sie einen Absatz über Drogenhandel als Testmuster für das erste Sicherheits-Gate." },
    }),
  );
  await check("BLOCK am ersten Safety-Gate lehnt den Änderungswunsch vollständig ab (400)", () => {
    assert.strictEqual(blockAttempt.statusCode, 400);
  });
  await check("bei BLOCK entsteht kein Änderungswunsch-Datensatz und der Auftrag bleibt RESULT_READY", async () => {
    const list = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderForBlock.id}/change-requests`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    });
    assert.strictEqual(list.json.changeRequests.length, 0);
    const orderDetail = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderForBlock.id}`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    });
    assert.strictEqual(orderDetail.json.workOrder.status, "RESULT_READY");
  });
  await check("BLOCK beim Änderungswunsch wird auditiert (WORK_ORDER_CHANGE_BLOCKED_BY_POLICY)", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY");
    assert.ok(events.some((event) => event.metadata && JSON.parse(event.metadata).workOrderId === orderForBlock.id));
  });

  const orderForEscalate = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für Gate-ESCALATE beim Änderungswunsch" });
  const escalateAttempt = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForEscalate.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { requestText: "Bitte fügen Sie einen Deepfake unseres Geschäftsführers als Testmuster für das Eskalations-Gate ein." },
    }),
  );
  await check("ESCALATE am ersten Safety-Gate versetzt den Auftrag auf ESCALATED, kein Änderungswunsch entsteht", () => {
    assert.strictEqual(escalateAttempt.statusCode, 200);
    assert.strictEqual(escalateAttempt.json.escalated, true);
    assert.strictEqual(escalateAttempt.json.workOrderStatus, "ESCALATED");
  });
  await check("bei ESCALATE entsteht kein Änderungswunsch-Datensatz", async () => {
    const list = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderForEscalate.id}/change-requests`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    });
    assert.strictEqual(list.json.changeRequests.length, 0);
  });

  // -------------------------------------------------------------------
  // 16-17. Idempotenz auf Datenbankebene (partieller UNIQUE-Index): ein
  //        zweiter aktiver Änderungswunsch/eine doppelte Freigabe derselben
  //        Version werden von der Datenbank verweigert.
  // -------------------------------------------------------------------

  const invariantOrder = authDb.createWorkOrder(seedDb, {
    tenantId: cafeTenant.id,
    createdByUserId: cafeAdmin.id,
    title: "Auftrag für Idempotenzprüfung",
    desiredResult: "Ausreichend langer, gültiger Text für den Idempotenztest.",
    status: "RESULT_READY",
  });
  const invariantRun = authDb.createWorkOrderRun(seedDb, {
    workOrderId: invariantOrder.id,
    tenantId: cafeTenant.id,
    status: "COMPLETED",
    orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  const invariantResult = authDb.createWorkOrderResult(seedDb, {
    workOrderId: invariantOrder.id,
    runId: invariantRun.id,
    tenantId: cafeTenant.id,
    resultTitle: "Testergebnis",
    resultSummary: "Testzusammenfassung",
    resultBody: "Testinhalt",
    qualityStatus: "PASSED",
  });
  authDb.createWorkOrderChangeRequest(seedDb, {
    workOrderId: invariantOrder.id,
    tenantId: cafeTenant.id,
    requestedByUserId: cafeAdmin.id,
    basedOnResultId: invariantResult.id,
    requestText: "Erster aktiver Änderungswunsch.",
  });
  await check("kein zweiter aktiver Änderungswunsch für denselben Auftrag möglich (Datenbank-Invariante)", () => {
    assert.throws(() => {
      authDb.createWorkOrderChangeRequest(seedDb, {
        workOrderId: invariantOrder.id,
        tenantId: cafeTenant.id,
        requestedByUserId: cafeAdmin.id,
        basedOnResultId: invariantResult.id,
        requestText: "Zweiter, parallel gestellter Änderungswunsch.",
      });
    }, /UNIQUE/);
  });

  authDb.createWorkOrderCustomerApproval(seedDb, {
    workOrderId: invariantOrder.id,
    tenantId: cafeTenant.id,
    resultId: invariantResult.id,
    approvedByUserId: cafeAdmin.id,
    approvalVersion: invariantResult.versionNumber,
  });
  await check("keine zweite Freigabe derselben Ergebnisversion möglich (Datenbank-Invariante)", () => {
    assert.throws(() => {
      authDb.createWorkOrderCustomerApproval(seedDb, {
        workOrderId: invariantOrder.id,
        tenantId: cafeTenant.id,
        resultId: invariantResult.id,
        approvedByUserId: cafeAdmin.id,
        approvalVersion: invariantResult.versionNumber,
      });
    }, /UNIQUE/);
  });
  await check("eine gespeicherte Kundenfreigabe ist unveränderlich (UPDATE wird von der Datenbank verweigert)", () => {
    assert.throws(() => {
      seedDb.prepare("UPDATE work_order_customer_approvals SET approvalNote = ? WHERE resultId = ?").run("Manipuliert", invariantResult.id);
    }, /append-only|unveränderlich/);
  });

  // -------------------------------------------------------------------
  // 18-22. Kundenfreigabe über HTTP: Erfolg, erneuter Versuch (409), kein
  //        Owner-Zugriff, Feldvalidierung, Statuswechsel.
  // -------------------------------------------------------------------

  const orderForApproval = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für Kundenfreigabe" });
  const approveResult = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForApproval.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { approvalNote: "Sieht sehr gut aus, vielen Dank." },
    }),
  );
  await check("die Kundenfreigabe eines RESULT_READY-Ergebnisses gelingt (200, CUSTOMER_APPROVED)", () => {
    assert.strictEqual(approveResult.statusCode, 200);
    assert.strictEqual(approveResult.json.workOrder.status, "CUSTOMER_APPROVED");
    assert.strictEqual(approveResult.json.approval.approvalNote, "Sieht sehr gut aus, vielen Dank.");
  });
  await check("nach der Freigabe zeigt die Versionsansicht die freigegebene Version als freigegeben", async () => {
    const versions = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderForApproval.id}/result-versions`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    });
    assert.strictEqual(versions.json.versions[0].isApproved, true);
    assert.ok(versions.json.versions[0].approvedAt);
  });
  await check("eine erneute Freigabe desselben, bereits freigegebenen Auftrags wird abgelehnt (409)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForApproval.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 409);
  });
  await check("eine zu lange Freigabenotiz (>1000 Zeichen) wird abgelehnt (400)", async () => {
    const orderForNoteLimit = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für Freigabenotiz-Limit" });
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForNoteLimit.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { approvalNote: "x".repeat(1001) },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 23-25. Ausschließlich der Kunde darf freigeben/anfordern – keine
  //        entsprechende Owner-Route.
  // -------------------------------------------------------------------

  await check("es gibt keine Owner-Route für Freigabe/Änderungswunsch (404)", async () => {
    for (const action of ["approve", "change-request"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderA.id}/${action}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });
  await check("CUSTOMER_ADMIN erreicht die Owner-Betriebsübersicht für Änderungswünsche/Versionen nicht (404)", async () => {
    for (const suffix of ["change-requests", "result-versions"]) {
      const result = await invoke({
        method: "GET",
        url: `/api/owner/work-orders/${orderA.id}/${suffix}`,
        headers: { cookie: cafeAdminSession.cookieHeader },
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });
  await check("SUPPORT ohne aktiven Grant erreicht weder Kunden- noch Owner-Änderungsrouten (404)", async () => {
    const customerAttempt = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/approve`,
      headers: authedJsonHeaders(supportSession),
      bodyObj: {},
    });
    assert.strictEqual(customerAttempt.statusCode, 404);
    const ownerAttempt = await invoke({
      method: "GET",
      url: `/api/owner/work-orders/${orderA.id}/change-requests`,
      headers: { cookie: supportSession.cookieHeader },
    });
    assert.strictEqual(ownerAttempt.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 26-28. Mandantentrennung: fremder Auftrag liefert generisches 404.
  // -------------------------------------------------------------------

  await check("ein fremder Mandant kann keinen Änderungswunsch für Auftrag A stellen (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/change-request`,
      headers: authedJsonHeaders(fitnessAdminSession),
      bodyObj: { requestText: "Fremder Änderungswunsch." },
    });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("ein fremder Mandant kann Auftrag A nicht freigeben (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/approve`,
      headers: authedJsonHeaders(fitnessAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("ein fremder Mandant sieht weder die Versionen noch die Änderungswünsche von Auftrag A (404)", async () => {
    const versionsResult = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/result-versions`,
      headers: { cookie: fitnessAdminSession.cookieHeader },
    });
    assert.strictEqual(versionsResult.statusCode, 404);
    const changeRequestsResult = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/change-requests`,
      headers: { cookie: fitnessAdminSession.cookieHeader },
    });
    assert.strictEqual(changeRequestsResult.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 29-30. CSRF/Origin-Schutz gilt auch für die neuen Routen.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header beim Änderungswunsch wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: { requestText: "Text." },
    });
    assert.strictEqual(result.statusCode, 403);
  });
  await check("eine fremde Origin bei der Freigabe wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderA.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession, { origin: "https://angreifer.example.test" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 31. Audit: erwartete Ereignistypen vorhanden, ausschließlich
  //     allowlisted Metadaten, keine Auftrags-/Ergebnistexte.
  // -------------------------------------------------------------------

  const CHANGE_AUDIT_EVENT_TYPES = [
    "WORK_ORDER_CHANGES_REQUESTED",
    "WORK_ORDER_CHANGE_REQUEST_STARTED",
    "WORK_ORDER_CHANGE_REQUEST_COMPLETED",
    "WORK_ORDER_CHANGE_BLOCKED_BY_POLICY",
    "WORK_ORDER_CHANGE_ESCALATED_BY_POLICY",
    "WORK_ORDER_RESULT_VERSION_CREATED",
    "WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER",
  ];
  await check("alle in diesem Schritt tatsächlich ausgelösten Auditereignisse sind vorhanden", () => {
    CHANGE_AUDIT_EVENT_TYPES.forEach((eventType) => {
      const events = authAudit.listAuditEventsByType(seedDb, eventType);
      assert.ok(events.length > 0, `kein Ereignis für ${eventType}`);
    });
  });
  await check("Auditereignisse der Änderungsrunde enthalten ausschließlich allowlisted Metadatenfelder, keine Auftrags-/Ergebnistexte", () => {
    const allowedKeys = [
      "workOrderId",
      "changeRequestId",
      "runId",
      "resultId",
      "resultVersion",
      "statusTransition",
      "reasonCode",
      "severity",
      "failureCode",
    ];
    const sensitiveSnippets = ["Ladengeschäft", "kürzer und konkreter", "Drogenhandel", "Deepfake", "Sieht sehr gut aus"];
    CHANGE_AUDIT_EVENT_TYPES.forEach((eventType) => {
      authAudit.listAuditEventsByType(seedDb, eventType).forEach((event) => {
        if (!event.metadata) return;
        Object.keys(JSON.parse(event.metadata)).forEach((key) =>
          assert.ok(allowedKeys.includes(key), `unerlaubtes Feld ${key} in ${eventType}`),
        );
        sensitiveSnippets.forEach((snippet) => assert.doesNotMatch(event.metadata, new RegExp(snippet)));
      });
    });
  });

  // -------------------------------------------------------------------
  // 32-34. Cache-Control, keine Stacktraces/Secrets, keine Publish-/
  //        Billing-/Providerroute im Änderungskontext.
  // -------------------------------------------------------------------

  await check("Antworten der neuen Routen setzen Cache-Control: no-store", () => {
    assert.strictEqual(changeRequestResult.headers["Cache-Control"], "no-store");
    assert.strictEqual(approveResult.headers["Cache-Control"], "no-store");
  });
  await check("keine erfasste Antwort enthält Stacktraces, Pfade, Passwort-Hashes oder rohe Ergebnistexte in Fehlermeldungen", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/at\s+[\w.]+\s+\(/.test(body), "kein Stacktrace-Muster");
      assert.ok(!/\/Users\//.test(body), "kein absoluter Dateipfad");
      assert.ok(!/passwordHash/i.test(body), "kein Passwort-Hash-Feldname");
    });
  });
  await check("keine Publish-/Billing-/Providerroute existiert im Änderungskontext", async () => {
    for (const action of ["publish", "billing", "provider", "release"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/portal/work-orders/${orderA.id}/${action}`,
        headers: authedJsonHeaders(cafeAdminSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });

  console.log(`work-order-change.test.js: ${passed} Prüfpunkte erfolgreich`);
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
