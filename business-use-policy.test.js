"use strict";

// V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt G) –
// Tests für das lokale Business-Use-/Safety-Gate.
//
// Zwei Testebenen in dieser Datei:
//   (a) reine, DB-freie Funktionstests von business-use-policy.js selbst
//       (ALLOW/BLOCK/ESCALATE, policyVersion, reasonCode/severity),
//   (b) End-to-End-Tests über den echten server.js#requestHandler (gleiches
//       Muster wie work-order-routes.test.js), die die Verdrahtung in
//       work-order-service.js prüfen: keine Speicherung bei BLOCK, Direkt-
//       ESCALATED bei ESCALATE, Verstoßprotokoll, Audit-Datenminimierung,
//       Sessionwiderruf bei CRITICAL, keine automatische Dauersperre.
//
// Hinweis zu Testtexten: die verwendeten Auslöser sind bewusst neutrale,
// fachliche/rechtliche Kategoriebezeichnungen (z. B. "Drogenhandel",
// "Kinderpornografie" als Rechtsbegriff) – keine beleidigenden oder
// grafischen Formulierungen. Das entspricht der Regelbeschreibung selbst
// in business-use-policy.js und BUSINESS_USE_POLICY.md.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "business-use-policy-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "business-use-policy-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const businessUsePolicy = require("./business-use-policy");
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

// ---------------------------------------------------------------------------
// (a) reine Funktionstests von business-use-policy.js
// ---------------------------------------------------------------------------

async function runPureGateTests() {
  const legitimateMarketing = businessUsePolicy.evaluateWorkOrderContent({
    title: "Neue Werbekampagne für Frühjahrskollektion",
    desiredResult: "Eine freundliche Anzeigenkampagne für die neue Kollektion.",
    context: "Soll in lokalen Zeitungen erscheinen.",
    deadlineText: "In vier Wochen",
  });
  await check("legitimer Marketingauftrag → ALLOW", () => {
    assert.strictEqual(legitimateMarketing.decision, "ALLOW");
    assert.strictEqual(legitimateMarketing.reasonCode, null);
  });

  const legitimateWebsite = businessUsePolicy.evaluateWorkOrderContent({
    title: "Neue Landingpage für Produktlaunch",
    desiredResult: "Eine einseitige Landingpage mit Anmeldeformular.",
    context: "",
    deadlineText: "",
  });
  await check("legitimer Websiteauftrag → ALLOW", () => {
    assert.strictEqual(legitimateWebsite.decision, "ALLOW");
  });

  const clearlyForbidden = businessUsePolicy.evaluateWorkOrderContent({
    title: "Unterstützung beim Aufbau eines Drogenhandel-Vertriebsnetzes",
    desiredResult: "Werbetexte für den Vertrieb.",
    context: "",
    deadlineText: "",
  });
  await check("klar verbotener Inhalt (illegaler Zweck) → BLOCK", () => {
    assert.strictEqual(clearlyForbidden.decision, "BLOCK");
    assert.strictEqual(clearlyForbidden.reasonCode, "ILLEGAL_PURPOSE");
    assert.strictEqual(clearlyForbidden.severity, "HIGH");
  });

  const childSafety = businessUsePolicy.evaluateWorkOrderContent({
    title: "Anfrage mit Bezug zu Kinderpornografie",
    desiredResult: "n/a",
    context: "",
    deadlineText: "",
  });
  await check("eindeutigster Missbrauchsfall (Kinderschutz) → BLOCK mit severity CRITICAL", () => {
    assert.strictEqual(childSafety.decision, "BLOCK");
    assert.strictEqual(childSafety.reasonCode, "CHILD_SAFETY_VIOLATION");
    assert.strictEqual(childSafety.severity, "CRITICAL");
  });

  const ambiguousLegalCase = businessUsePolicy.evaluateWorkOrderContent({
    title: "Video mit dem digitalen Abbild einer bekannten Person ohne deren Zustimmung",
    desiredResult: "Ein Werbevideo mit diesem Avatar.",
    context: "",
    deadlineText: "",
  });
  await check("unklarer rechtlich sensibler Grenzfall (Avatar ohne Zustimmung) → ESCALATE", () => {
    assert.strictEqual(ambiguousLegalCase.decision, "ESCALATE");
    assert.strictEqual(ambiguousLegalCase.reasonCode, "REAL_PERSON_LIKENESS_WITHOUT_STATED_CONSENT");
    assert.strictEqual(ambiguousLegalCase.severity, "MEDIUM");
  });

  await check("Policy-Version ist bei jeder Entscheidung gesetzt (nicht leer)", () => {
    for (const result of [legitimateMarketing, clearlyForbidden, childSafety, ambiguousLegalCase]) {
      assert.strictEqual(typeof result.policyVersion, "string");
      assert.ok(result.policyVersion.length > 0);
    }
  });

  await check("evaluateWorkOrderContent ist deterministisch (gleiche Eingabe → gleiches Ergebnis)", () => {
    const fields = { title: "Drogenhandel-Netzwerk aufbauen", desiredResult: "x", context: "", deadlineText: "" };
    const first = businessUsePolicy.evaluateWorkOrderContent(fields);
    const second = businessUsePolicy.evaluateWorkOrderContent(fields);
    assert.deepStrictEqual(first, second);
  });

  await check("DECISION_VALUES/SEVERITY_VALUES sind die erwarteten, eingefrorenen Aufzählungen", () => {
    assert.deepStrictEqual(businessUsePolicy.DECISION_VALUES, ["ALLOW", "BLOCK", "ESCALATE"]);
    assert.deepStrictEqual(businessUsePolicy.SEVERITY_VALUES, ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    assert.ok(Object.isFrozen(businessUsePolicy.DECISION_VALUES));
    assert.ok(Object.isFrozen(businessUsePolicy.SEVERITY_VALUES));
  });
}

// ---------------------------------------------------------------------------
// (b) End-to-End-Tests über server.js#requestHandler
// ---------------------------------------------------------------------------

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

async function runEndToEndTests() {
  const customerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, customerId, "ACTIVE");
  const tenant = authDb.getTenantProjectionByCustomerId(seedDb, customerId);
  const admin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenant.id, email: nextEmail("policy-admin") });
  const adminSession = await loginAndGetSession(admin.emailNormalized);

  function bodyWith(overrides = {}) {
    return {
      title: "Neue Broschüre für den Empfangsbereich",
      desiredResult: "Eine kurze, freundliche Broschüre mit den wichtigsten Leistungen.",
      context: "Wird an der Rezeption ausgelegt.",
      deadlineText: "Bis Ende des Monats",
      ...overrides,
    };
  }

  // -------------------------------------------------------------------
  // BLOCK: kein Auftrag wird gespeichert, generische Meldung, kein
  // READY_FOR_PROCESSING, keine Agenten-/Toolübergabe (es gibt schlicht
  // keine solche Route – siehe work-order-security.test.js).
  // -------------------------------------------------------------------
  const listBeforeBlock = await invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: adminSession.cookieHeader } });

  const blockedAttempt = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(adminSession),
    bodyObj: bodyWith({ title: "Unterstützung beim Aufbau eines Drogenhandel-Vertriebsnetzes" }),
  });
  await check("klar verbotener Inhalt wird beim Anlegen abgewiesen (400)", () => {
    assert.strictEqual(blockedAttempt.statusCode, 400);
    assert.strictEqual(blockedAttempt.json.ok, false);
  });
  await check("die Kundenmeldung bei BLOCK ist generisch (nennt weder Kategorie noch Regelwort)", () => {
    const message = String(blockedAttempt.json.message || "");
    assert.ok(message.length > 0);
    assert.ok(!/drogenhandel/i.test(message));
    assert.ok(!/illegal_purpose/i.test(message));
    assert.ok(!/reasonCode/i.test(message));
  });

  const listAfterBlock = await invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: adminSession.cookieHeader } });
  await check("BLOCK legt keinen Arbeitsauftrag an (Liste unverändert)", () => {
    assert.strictEqual(listAfterBlock.json.workOrders.length, listBeforeBlock.json.workOrders.length);
  });
  await check("kein READY_FOR_PROCESSING/ESCALATED-Auftrag aus dem BLOCK-Versuch taucht in der Liste auf", () => {
    const titles = listAfterBlock.json.workOrders.map((order) => order.title);
    assert.ok(!titles.includes("Unterstützung beim Aufbau eines Drogenhandel-Vertriebsnetzes"));
  });

  await check("Tenant-/Benutzerkontext des Verstoßes ist korrekt protokolliert", () => {
    const violations = authDb.listPolicyViolationsForUser(seedDb, admin.id);
    assert.ok(violations.length >= 1);
    const latest = violations[0];
    assert.strictEqual(latest.tenantId, tenant.id);
    assert.strictEqual(latest.userId, admin.id);
    assert.strictEqual(latest.workOrderId, null);
    assert.strictEqual(latest.reasonCode, "ILLEGAL_PURPOSE");
    assert.strictEqual(latest.severity, "HIGH");
    assert.strictEqual(latest.actionTaken, "BLOCKED");
  });

  await check("keine Auftragstexte landen im Audit (nur Kategorie-/Schweregrad-Codes)", () => {
    const events = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_BLOCKED_BY_POLICY");
    assert.ok(events.length >= 1);
    for (const event of events) {
      const metadata = event.metadata ? JSON.parse(event.metadata) : {};
      assert.ok(!("title" in metadata));
      assert.ok(!("desiredResult" in metadata));
      assert.ok(!/drogenhandel/i.test(JSON.stringify(metadata)));
    }
  });

  // -------------------------------------------------------------------
  // Wiederholungsverstoß wird gezählt.
  // -------------------------------------------------------------------
  await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(adminSession),
    bodyObj: bodyWith({ title: "Zweiter Versuch: Drogenhandel-Vertriebsnetz organisieren" }),
  });
  await check("ein wiederholter Verstoß desselben Benutzers wird gezählt", () => {
    const count = authDb.countPolicyViolationsForUser(seedDb, admin.id);
    assert.ok(count >= 2, `erwartet mindestens 2 protokollierte Verstöße, war ${count}`);
  });

  // -------------------------------------------------------------------
  // ESCALATE: Auftrag wird gespeichert, aber direkt mit Status ESCALATED,
  // keine automatische READY_FOR_PROCESSING-Einstufung.
  // -------------------------------------------------------------------
  const escalateAttempt = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(adminSession),
    bodyObj: bodyWith({ title: "Video mit dem digitalen Abbild einer bekannten Person ohne deren Zustimmung" }),
  });
  await check("ein rechtlich sensibler Grenzfall wird gespeichert, aber automatisch ESCALATED (200)", () => {
    assert.strictEqual(escalateAttempt.statusCode, 200);
    assert.strictEqual(escalateAttempt.json.workOrder.status, "ESCALATED");
  });
  await check("die ESCALATE-Kundenmeldung ist die bestehende neutrale Eskalationsmeldung (kein neuer Text)", () => {
    assert.ok(/gesondert von der Zentrale geprüft/i.test(escalateAttempt.json.workOrder.customerMessage));
  });
  await check("keine READY_FOR_PROCESSING-Einstufung bei ESCALATE", () => {
    assert.notStrictEqual(escalateAttempt.json.workOrder.status, "READY_FOR_PROCESSING");
  });

  await check("die ESCALATE-Verstoßzeile referenziert den tatsächlich entstandenen Auftrag", () => {
    const violations = authDb.listPolicyViolationsForUser(seedDb, admin.id);
    const escalationViolation = violations.find((row) => row.workOrderId === escalateAttempt.json.workOrder.id);
    assert.ok(escalationViolation, "keine Verstoßzeile mit passender workOrderId gefunden");
    assert.strictEqual(escalationViolation.severity, "MEDIUM");
    assert.strictEqual(escalationViolation.actionTaken, "ESCALATED");
  });

  await check("bestehende Owner-Ausnahmerolle bleibt bei ESCALATE unverändert (nur escalate/stop, kein approve/reject)", () => {
    const ownerActionRoutes = ["approve", "reject", "request-clarification"];
    return Promise.all(
      ownerActionRoutes.map(async (action) => {
        const attempt = await invoke({
          method: "POST",
          url: `/api/owner/work-orders/${escalateAttempt.json.workOrder.id}/${action}`,
          headers: {},
        });
        assert.strictEqual(attempt.statusCode, 404, `Route ${action} sollte weiterhin 404 liefern`);
      }),
    );
  });

  // -------------------------------------------------------------------
  // CRITICAL: Auftrag wird blockiert UND Sessions des handelnden
  // Benutzers werden sofort widerrufen. Kein automatischer, endgültiger
  // Lizenzentzug/keine automatische Mandantensperre.
  // -------------------------------------------------------------------
  const criticalUser = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: nextEmail("policy-critical") });
  const criticalSession = await loginAndGetSession(criticalUser.emailNormalized);

  const activeSessionsBefore = authDb.listActiveSessionsForUser(seedDb, criticalUser.id);
  await check("vor dem CRITICAL-Fall existiert mindestens eine aktive Session des Benutzers", () => {
    assert.ok(activeSessionsBefore.length >= 1);
  });

  const criticalAttempt = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(criticalSession),
    bodyObj: bodyWith({ title: "Anfrage mit Bezug zu Kinderpornografie" }),
  });
  await check("CRITICAL führt zur vorgesehenen Sperr-/Prüfaktion: Auftrag wird blockiert (400)", () => {
    assert.strictEqual(criticalAttempt.statusCode, 400);
  });
  await check("CRITICAL: alle Sessions des handelnden Benutzers werden sofort widerrufen", () => {
    const activeSessionsAfter = authDb.listActiveSessionsForUser(seedDb, criticalUser.id);
    assert.strictEqual(activeSessionsAfter.length, 0);
  });
  await check("CRITICAL: die Verstoßzeile markiert die sofortige Betreiberprüfung (LICENSE_REVIEW_REQUIRED), kein automatischer Lizenzentzug", () => {
    const violations = authDb.listPolicyViolationsForUser(seedDb, criticalUser.id);
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].severity, "CRITICAL");
    assert.strictEqual(violations[0].actionTaken, "LICENSE_REVIEW_REQUIRED");
  });
  await check("kein automatischer endgültiger Lizenzentzug: Mandant bleibt ACTIVE, Benutzerstatus bleibt ACTIVE", () => {
    const tenantAfter = authDb.getTenantProjectionByCustomerId(seedDb, customerId);
    const userAfter = authDb.getUserById(seedDb, criticalUser.id);
    assert.strictEqual(tenantAfter.status, "ACTIVE");
    assert.strictEqual(userAfter.status, "ACTIVE");
  });
  await check("nach dem Sessionwiderruf ist der bisherige Cookie des Benutzers nicht mehr gültig (401)", () => {
    return invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: criticalSession.cookieHeader } }).then((result) => {
      assert.strictEqual(result.statusCode, 401);
    });
  });

  // -------------------------------------------------------------------
  // Jamal wird durch dieses Safety-Gate nicht zum fachlichen Prüfer:
  // es gibt weiterhin keine reguläre Owner-Freigabe-/Ablehnungsroute,
  // und normale legitime Aufträge laufen weiterhin ohne Owner-Beteiligung.
  // -------------------------------------------------------------------
  const legitimateAttempt = await invoke({
    method: "POST",
    url: "/api/portal/work-orders",
    headers: authedJsonHeaders(adminSession),
    bodyObj: bodyWith({ title: "Normale Broschüre ohne jedes Signal" }),
  });
  await check("ein normaler legitimer Auftrag läuft weiterhin ohne Owner-Beteiligung (ALLOW, automatische Vollständigkeitsregel)", () => {
    assert.strictEqual(legitimateAttempt.statusCode, 200);
    assert.strictEqual(legitimateAttempt.json.workOrder.status, "READY_FOR_PROCESSING");
    assert.strictEqual(legitimateAttempt.json.workOrder.decidedByUserId, undefined);
  });
}

async function run() {
  await runPureGateTests();
  await runEndToEndTests();
  console.log(`business-use-policy.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("business-use-policy.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
