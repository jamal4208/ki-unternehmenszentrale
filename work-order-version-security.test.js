"use strict";

// V7.2 Phase C Schritt 2 (Auftrag Abschnitt P, letzter Qualitätsabgleich
// Abschnitt B) – dedizierte, vollständige Sicherheitsabdeckung der
// Ergebnisversionierung (work-order-result-service.js#listResultVersions*)
// sowie der Mandantenbindung von Änderungswunsch/Freigabe. Ergänzt (nicht
// ersetzt) work-order-change.test.js: dort ist der fachliche Ablauf
// abgedeckt, hier jede einzelne, im Auftrag benannte Versions-Sicherheits-
// garantie explizit und isoliert.
//
// Gleiches Testmuster wie work-order-execution-security.test.js: echter
// server.js#requestHandler mit isoliertem HOME-/KUZ_DATA_DIR-Verzeichnis.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-version-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-version-security-test-data-"));
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

  async function requestChange(session, workOrderId, requestText) {
    return invoke({
      method: "POST",
      url: `/api/portal/work-orders/${workOrderId}/change-request`,
      headers: authedJsonHeaders(session),
      bodyObj: { requestText },
    });
  }

  function getVersions(session, workOrderId) {
    return invoke({ method: "GET", url: `/api/portal/work-orders/${workOrderId}/result-versions`, headers: { cookie: session.cookieHeader } });
  }

  // -------------------------------------------------------------------
  // 1+2. Tenant A sieht ausschließlich A-Versionen, Tenant B ausschließlich
  //      B-Versionen (beide Richtungen).
  // -------------------------------------------------------------------

  const orderA = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag A – Versionssicherheit" });
  const orderB = await createResultReadyOrder(fitnessAdminSession, { title: "Auftrag B – Versionssicherheit" });

  const ownVersionsA = await getVersions(cafeAdminSession, orderA.id);
  await check("Tenant A sieht seine eigenen Versionen von Auftrag A", () => {
    assert.strictEqual(ownVersionsA.statusCode, 200);
    assert.strictEqual(ownVersionsA.json.versions.length, 1);
  });
  const ownVersionsB = await getVersions(fitnessAdminSession, orderB.id);
  await check("Tenant B sieht seine eigenen Versionen von Auftrag B", () => {
    assert.strictEqual(ownVersionsB.statusCode, 200);
    assert.strictEqual(ownVersionsB.json.versions.length, 1);
  });
  await check("Tenant A sieht keine Version von Auftrag B (404)", async () => {
    const result = record(await getVersions(cafeAdminSession, orderB.id));
    assert.strictEqual(result.statusCode, 404);
  });
  await check("Tenant B sieht keine Version von Auftrag A (404)", async () => {
    const result = record(await getVersions(fitnessAdminSession, orderA.id));
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 3. Fremde workOrderId liefert 404. Eine fremde resultId ist über die
  //    API strukturell nicht adressierbar: keine Route nimmt eine resultId
  //    entgegen (weder result-versions noch approve kennen einen
  //    resultId-Parameter, siehe work-order-change-routes.js), somit
  //    entfällt dieser Angriffsvektor bereits auf Routenebene.
  // -------------------------------------------------------------------

  await check("eine frei erfundene workOrderId liefert 404 auf der Versionsroute", async () => {
    const result = await getVersions(cafeAdminSession, "00000000-0000-0000-0000-000000000000");
    assert.strictEqual(result.statusCode, 404);
  });
  await check("kein Routenparameter der Kunden-/Owner-API nimmt eine resultId direkt entgegen (strukturell keine fremde resultId adressierbar)", () => {
    const workOrderRoutesSource = fs.readFileSync(path.join(__dirname, "work-order-change-routes.js"), "utf8");
    assert.ok(!/req\.(query|params)\.resultId/.test(workOrderRoutesSource));
    assert.strictEqual(workOrderRoutesSource.includes("APPROVAL_FIELDS = [\"approvalNote\"]"), true);
  });

  // -------------------------------------------------------------------
  // 4. Alte Versionen bleiben unveränderlich (Datenbank-Ebene, append-only
  //    Trigger auf work_order_results, bereits seit Schritt 1 aktiv).
  // -------------------------------------------------------------------

  const firstVersionRow = authDb.listWorkOrderResultsForWorkOrder(seedDb, orderA.id)[0];
  await check("eine gespeicherte Ergebnisversion ist unveränderlich (UPDATE wird von der Datenbank verweigert)", () => {
    assert.throws(() => {
      seedDb.prepare("UPDATE work_order_results SET resultBody = ? WHERE id = ?").run("Manipuliert", firstVersionRow.id);
    }, /append-only|unveränderlich/);
  });

  // -------------------------------------------------------------------
  // 5+6. Versionsnummern sind fortlaufend, keine Version wird
  //      übersprungen – über drei aufeinanderfolgende Änderungswünsche.
  // -------------------------------------------------------------------

  const cr1 = await requestChange(cafeAdminSession, orderA.id, "Erste Überarbeitung: bitte Ton freundlicher gestalten.");
  assert.strictEqual(cr1.statusCode, 200, "Testvoraussetzung: erster Änderungswunsch muss gelingen");
  const cr2 = await requestChange(cafeAdminSession, orderA.id, "Zweite Überarbeitung: bitte Struktur klarer gliedern.");
  assert.strictEqual(cr2.statusCode, 200, "Testvoraussetzung: zweiter Änderungswunsch muss gelingen");
  const versionsAfterThree = await getVersions(cafeAdminSession, orderA.id);
  await check("nach zwei Änderungswünschen existieren genau drei Versionen mit fortlaufenden, lückenlosen Versionsnummern", () => {
    const numbers = versionsAfterThree.json.versions.map((v) => v.versionNumber).sort((a, b) => a - b);
    assert.deepStrictEqual(numbers, [1, 2, 3]);
  });

  // -------------------------------------------------------------------
  // 7. Eine alte Version kann nicht freigegeben werden – die Freigabe
  //    bindet sich strukturell immer an die neueste Version (kein
  //    resultId-Eingabeparameter, siehe work-order-approval.test.js für
  //    die vollständige Prüfung); hier zusätzlich aus Versionssicht
  //    bestätigt: nach Freigabe ist ausschließlich die neueste Version als
  //    freigegeben markiert.
  // -------------------------------------------------------------------

  const approveA = await invoke({
    method: "POST",
    url: `/api/portal/work-orders/${orderA.id}/approve`,
    headers: authedJsonHeaders(cafeAdminSession),
    bodyObj: {},
  });
  assert.strictEqual(approveA.statusCode, 200, "Testvoraussetzung: Freigabe muss gelingen");
  const versionsAfterApproval = await getVersions(cafeAdminSession, orderA.id);
  await check("nach der Freigabe ist ausschließlich die neueste Version (3) als freigegeben markiert, alle älteren nicht", () => {
    versionsAfterApproval.json.versions.forEach((v) => {
      if (v.versionNumber === 3) {
        assert.strictEqual(v.isApproved, true);
      } else {
        assert.strictEqual(v.isApproved, false);
      }
    });
  });

  // -------------------------------------------------------------------
  // 8+9. Approval/Change Request gehören zum richtigen Tenant (direkte
  //      Datenbankprüfung der tenantId-Spalte).
  // -------------------------------------------------------------------

  await check("der Freigabedatensatz ist in der Datenbank an den korrekten Mandanten (Tenant A) gebunden", () => {
    const latestResult = authDb.getLatestWorkOrderResultForWorkOrder(seedDb, orderA.id);
    const approvalRow = authDb.getWorkOrderCustomerApprovalByResultId(seedDb, latestResult.id);
    assert.ok(approvalRow);
    assert.strictEqual(approvalRow.tenantId, cafeTenant.id);
    assert.notStrictEqual(approvalRow.tenantId, fitnessTenant.id);
  });
  await check("die Änderungswunsch-Datensätze sind in der Datenbank an den korrekten Mandanten (Tenant A) gebunden", () => {
    const changeRequests = authDb.listWorkOrderChangeRequestsForWorkOrder(seedDb, orderA.id);
    assert.ok(changeRequests.length >= 2);
    changeRequests.forEach((cr) => assert.strictEqual(cr.tenantId, cafeTenant.id));
  });

  // -------------------------------------------------------------------
  // 10-13. Keine Systemprompts, keine Chain-of-Thought, keine
  //        Agentenlogs, keine Secrets in der Kunden-Versionsantwort.
  // -------------------------------------------------------------------

  await check("die Kunden-Versionsantwort enthält keine Agenteninterna (kein agentKey/selectionReason/orchestratorVersion/systemPrompt)", () => {
    const forbiddenKeys = ["agentKey", "selectionReason", "orchestratorVersion", "systemPrompt", "reasoning", "chainOfThought"];
    versionsAfterApproval.json.versions.forEach((version) => {
      forbiddenKeys.forEach((key) => assert.strictEqual(Object.prototype.hasOwnProperty.call(version, key), false, `unerlaubtes Feld ${key}`));
    });
  });
  await check("keine erfasste Antwort dieses Testlaufs enthält System-Prompt-, Chain-of-Thought- oder Agentenlog-Hinweise", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/systemPrompt|chain-of-thought|Gedankengang|internal reasoning/i.test(body));
    });
  });
  await check("keine erfasste Antwort dieses Testlaufs enthält Passwort-Hashes, Session-Token oder API-Schlüssel", () => {
    allResponseBodies.forEach((body) => {
      assert.ok(!/passwordHash/i.test(body));
      assert.ok(!/session[_-]?token/i.test(body));
      assert.ok(!/api[_-]?key/i.test(body));
    });
  });

  // -------------------------------------------------------------------
  // 14. Manipuliertes Cookie auf der Versionsroute.
  // -------------------------------------------------------------------

  await check("ein frei erfundener Session-Cookie-Wert wird auf der Versionsroute abgelehnt (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/result-versions`,
      headers: { cookie: "kuz_dev_session=komplett-erfundener-wert" },
    });
    assert.strictEqual(result.statusCode, 401);
  });

  // -------------------------------------------------------------------
  // 15+16. Manipuliertes CSRF und fremde Origin blockieren das Erzeugen
  //        einer neuen Version über den Änderungswunsch.
  // -------------------------------------------------------------------

  const orderForCsrf = await createResultReadyOrder(cafeAdminSession, { title: "Auftrag für CSRF-Schutz bei Versionserzeugung" });
  await check("ein falscher CSRF-Header verhindert die Erzeugung einer neuen Version (403, keine neue Version entsteht)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForCsrf.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession, { "x-kuz-csrf": "falscher-wert" }),
      bodyObj: { requestText: "Änderungswunsch mit falschem CSRF-Token." },
    });
    assert.strictEqual(result.statusCode, 403);
    const versions = await getVersions(cafeAdminSession, orderForCsrf.id);
    assert.strictEqual(versions.json.versions.length, 1);
  });
  await check("eine fremde Origin verhindert die Erzeugung einer neuen Version (403, keine neue Version entsteht)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForCsrf.id}/change-request`,
      headers: authedJsonHeaders(cafeAdminSession, { origin: "https://angreifer.example.test" }),
      bodyObj: { requestText: "Änderungswunsch von fremder Origin." },
    });
    assert.strictEqual(result.statusCode, 403);
    const versions = await getVersions(cafeAdminSession, orderForCsrf.id);
    assert.strictEqual(versions.json.versions.length, 1);
  });

  // -------------------------------------------------------------------
  // 17+18. Suspendierter Benutzer/Mandant verlieren sofort den
  //        Versionszugriff.
  // -------------------------------------------------------------------

  const disposableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("c-wird-gesperrt") });
  const disposableSession = await loginAndGetSession(disposableUser.emailNormalized);
  authDb.updateUserStatus(seedDb, disposableUser.id, "DISABLED");
  await check("ein gesperrter Benutzer verliert unmittelbar den Zugriff auf die Versionsroute (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderA.id}/result-versions`,
      headers: { cookie: disposableSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 401);
  });

  // Eigener, danach nicht wiederverwendeter Mandant/Benutzer für die
  // Mandantensperre (gleiches Muster wie work-order-execution-security.
  // test.js): Sperren invalidiert bestehende Sitzungen dauerhaft, daher
  // wird hierfür bewusst nicht die weiterhin benötigte cafeAdminSession
  // verwendet.
  const suspendableUser = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("d-suspendierbar") });
  const suspendableSession = await loginAndGetSession(suspendableUser.emailNormalized);
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "SUSPENDED");
  await check("ein gesperrter Mandant verliert unmittelbar den Zugriff auf die Versionsroute für alle seine Benutzer (401)", async () => {
    const result = await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${orderB.id}/result-versions`,
      headers: { cookie: suspendableSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 401);
  });
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");

  // -------------------------------------------------------------------
  // 19. Keine Publish-/Billing-/Providerroute im Versionskontext.
  // -------------------------------------------------------------------

  await check("keine Publish-, Billing- oder Providerroute existiert im Versionskontext (404)", async () => {
    for (const suffix of ["publish", "billing", "canva", "heygen", "provider"]) {
      // eslint-disable-next-line no-await-in-loop
      const result = await invoke({
        method: "POST",
        url: `/api/portal/work-orders/${orderA.id}/${suffix}`,
        headers: authedJsonHeaders(cafeAdminSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });

  console.log(`work-order-version-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
