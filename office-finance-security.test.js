"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt X,
// Prüfpunkte 27-38) – Sicherheits-/Rollentests gegen den echten
// server.js#requestHandler. Gleiches Muster wie
// agent-leadership-security.test.js. Läuft mit einem isolierten HOME-/
// KUZ_DATA_DIR-Verzeichnis; niemals die echte Application-Support-
// Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "office-finance-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "office-finance-security-test-data-"));
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

const OFFICE_FINANCE_GET_ROUTES = [
  "/api/office-finance/summary",
  "/api/office-finance/system-map",
  "/api/office-finance/identities",
  "/api/office-finance/capabilities",
  "/api/office-finance/approval-matrix",
  "/api/office-finance/work-items",
  "/api/office-finance/finance-handoffs",
  "/api/office-finance/authentication-status",
  "/api/office-finance/activation-checklists",
];

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
  // 28. Kunden/Support blockiert (auf allen neun GET-Routen + statisches
  // UI-Asset + POST-Prefix).
  // -------------------------------------------------------------------

  for (const url of OFFICE_FINANCE_GET_ROUTES) {
    await check(`CUSTOMER_ADMIN erreicht ${url} nicht (404)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: customerAdminSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 404);
    });
    await check(`SUPPORT ohne aktiven Grant erreicht ${url} nicht (404)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: supportSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 404);
    });
  }

  await check("CUSTOMER_ADMIN erreicht das statische office-finance-ui.js nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/office-finance-ui.js", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("Kundenrolle kann keinen Office-Auftrag über den POST-Prefix erzeugen (404)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/create-office-work-item",
        headers: authedJsonHeaders(customerAdminSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 27. OWNER erlaubt (200, no-store) auf allen neun GET-Routen.
  // -------------------------------------------------------------------

  for (const url of OFFICE_FINANCE_GET_ROUTES) {
    await check(`OWNER erreicht ${url} (200, no-store)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: ownerSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.ok, true);
      assert.strictEqual(result.headers["Cache-Control"], "no-store");
    });
  }

  await check("OWNER erreicht das statische office-finance-ui.js (200)", async () => {
    const result = await invoke({ method: "GET", url: "/office-finance-ui.js", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
  });

  await check("Systemlandkarte zeigt Apple-first/Google-controlled ohne Vollmigration", async () => {
    const result = await invoke({ method: "GET", url: "/api/office-finance/system-map", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.systemMap.architecture, "APPLE_FIRST_GOOGLE_CONTROLLED");
    assert.strictEqual(result.json.systemMap.noFullMigration, true);
    assert.strictEqual(result.json.systemMap.appleWorkspace.dataRead, false);
    assert.strictEqual(result.json.systemMap.appleWorkspace.migrationPerformed, false);
    assert.strictEqual(result.json.systemMap.googleWorkspace.connectionStatus, "DISCONNECTED");
    assert.strictEqual(result.json.systemMap.googleWorkspace.oauthPerformed, false);
  });

  await check("Identitäten-Endpoint liefert genau drei Startidentitäten über HTTP", async () => {
    const result = await invoke({ method: "GET", url: "/api/office-finance/identities", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.identityCount, 3);
    result.json.identities.forEach((identity) => {
      assert.strictEqual(identity.agentDirectLoginAllowed, false);
      assert.strictEqual(identity.noRealConnection, true);
      assert.strictEqual(identity.noPasswordOrTokenStored, true);
    });
  });

  await check("Fähigkeiten-Endpoint liefert 33 Fähigkeiten, filterbar nach Kategorie", async () => {
    const all = await invoke({ method: "GET", url: "/api/office-finance/capabilities", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(all.json.capabilityCount, 33);
    const gmailOnly = await invoke({ method: "GET", url: "/api/office-finance/capabilities?category=GMAIL", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(gmailOnly.json.capabilityCount, 12);
  });

  await check("Freigabematrix-Endpoint liefert 33 Zeilen mit Risiko-/Freigabeinformationen", async () => {
    const result = await invoke({ method: "GET", url: "/api/office-finance/approval-matrix", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.rowCount, 33);
    assert.ok(Array.isArray(result.json.principles) && result.json.principles.length > 0);
  });

  await check("Führungsübersicht zeigt Sicherheits-/Autonomiegrenzen und höchstens drei Entscheidungen", async () => {
    const result = await invoke({ method: "GET", url: "/api/office-finance/summary", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.architecture, "APPLE_FIRST_GOOGLE_CONTROLLED");
    assert.ok(result.json.topDecisions.length <= 3);
    assert.strictEqual(result.json.maxTopDecisions, 3);
    assert.strictEqual(result.json.autonomyBoundaries.noRealGoogleConnection, true);
    assert.strictEqual(result.json.autonomyBoundaries.noOAuthPerformed, true);
    assert.strictEqual(result.json.autonomyBoundaries.noEmailSent, true);
    assert.strictEqual(result.json.autonomyBoundaries.noCalendarEventCreated, true);
    assert.strictEqual(result.json.autonomyBoundaries.noDriveFileCreated, true);
    assert.strictEqual(result.json.autonomyBoundaries.noContactsRead, true);
    assert.strictEqual(result.json.autonomyBoundaries.noBookingPerformed, true);
    assert.strictEqual(result.json.autonomyBoundaries.noPaymentTriggered, true);
    assert.strictEqual(result.json.autonomyBoundaries.noInvoiceSent, true);
    assert.strictEqual(result.json.autonomyBoundaries.financeIsPreparationOnly, true);
    assert.strictEqual(result.json.autonomyBoundaries.maxLocalPermissionLevel, "PREPARE_DRAFT");
  });

  await check("Aktivierungs-Checklisten-Endpoint listet Google- und Finance-Checkliste", async () => {
    const result = await invoke({ method: "GET", url: "/api/office-finance/activation-checklists", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.checklists.length, 2);
    assert.ok(result.json.checklists.some((item) => item.id === "GOOGLE_WORKSPACE_ACTIVATION"));
    assert.ok(result.json.checklists.some((item) => item.id === "FINANCE_ACTIVATION"));
  });

  // -------------------------------------------------------------------
  // Einen Office-Auftrag und einen Finance-Handoff über HTTP anlegen
  // (Testvoraussetzung für die folgenden Prüfungen).
  // -------------------------------------------------------------------

  const createWorkItemResult = record(
    await invoke({
      method: "POST",
      url: "/api/office-finance/create-office-work-item",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {
        title: "HTTP-Testauftrag",
        requestedOutcome: "Testergebnis über HTTP",
        category: "EMAIL",
        ownerAgentId: "communication-agent",
        draftInput: { action: "NEW_MESSAGE", recipient: "kunde@example.test", subject: "Testbetreff", bodyDraft: "Testtext." },
      },
    }),
  );
  await check("OWNER kann über HTTP einen Office-Auftrag anlegen (200, maximal WAITING_FOR_AUTHENTICATION erreichbar)", () => {
    assert.strictEqual(createWorkItemResult.statusCode, 200);
    assert.strictEqual(createWorkItemResult.json.workItem.executionStatus, "NOT_STARTED");
    assert.strictEqual(createWorkItemResult.json.workItem.maxReachableExecutionStatus, "WAITING_FOR_AUTHENTICATION");
    assert.strictEqual(createWorkItemResult.json.workItem.noRealProviderCall, true);
  });
  const targetWorkItemId = createWorkItemResult.json.workItem.id;

  const createHandoffResult = record(
    await invoke({
      method: "POST",
      url: "/api/office-finance/create-finance-handoff",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { title: "HTTP-Testbeleg", type: "RECEIPT_REVIEW", sourceDescription: "Testbeleg über HTTP." },
    }),
  );
  await check("OWNER kann über HTTP einen Finance-Handoff anlegen (200, executionBlocked)", () => {
    assert.strictEqual(createHandoffResult.statusCode, 200);
    assert.strictEqual(createHandoffResult.json.handoff.executionBlocked, true);
    assert.strictEqual(createHandoffResult.json.handoff.noRealBookingOrPayment, true);
  });
  const targetHandoffId = createHandoffResult.json.handoff.id;

  // -------------------------------------------------------------------
  // 29. CSRF/Origin wirksam.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header bei einer Office-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/review-office-work-item",
        headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
        bodyObj: { workItemId: targetWorkItemId, approvalStatus: "READY_FOR_REVIEW" },
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin bei einer Office-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/review-office-work-item",
        headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
        bodyObj: { workItemId: targetWorkItemId, approvalStatus: "READY_FOR_REVIEW" },
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 30. Unbekannte Felder blockiert.
  // -------------------------------------------------------------------

  await check("ein unbekanntes Feld im Office-Aktionskörper wird abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/review-office-work-item",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { workItemId: targetWorkItemId, approvalStatus: "READY_FOR_REVIEW", sendNow: true },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  await check("eine unbekannte Office-Aktion liefert 404 (keine Login-/OAuth-/Send-/Create-/Delete-Providerroute)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/send-email",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  for (const forbiddenAction of ["google-login", "oauth-callback", "oauth-start", "create-calendar-event", "delete-file", "book-invoice", "pay-invoice"]) {
    await check(`37/38. es existiert keine Aktion "${forbiddenAction}" (404 – keine Login-/OAuth-/Send-/Create-/Delete-Providerroute)`, async () => {
      const result = record(
        await invoke({
          method: "POST",
          url: `/api/office-finance/${forbiddenAction}`,
          headers: authedJsonHeaders(ownerSession),
          bodyObj: {},
        }),
      );
      assert.strictEqual(result.statusCode, 404);
    });
  }

  // -------------------------------------------------------------------
  // Office-Auftrag und Finance-Handoff tatsächlich prüfen/genehmigen.
  // -------------------------------------------------------------------

  const reviewWorkItemResult = record(
    await invoke({
      method: "POST",
      url: "/api/office-finance/review-office-work-item",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { workItemId: targetWorkItemId, approvalStatus: "APPROVED_FOR_EXTERNAL_ACTION" },
    }),
  );
  await check("OWNER kann einen Office-Auftrag freigeben, Ausführung bleibt WAITING_FOR_AUTHENTICATION (200)", () => {
    assert.strictEqual(reviewWorkItemResult.statusCode, 200);
    assert.strictEqual(reviewWorkItemResult.json.workItem.approvalStatus, "APPROVED_FOR_EXTERNAL_ACTION");
    assert.strictEqual(reviewWorkItemResult.json.workItem.executionStatus, "WAITING_FOR_AUTHENTICATION");
  });

  await check("ein Versuch, einen Office-Auftrag direkt auf EXECUTED zu setzen, wird technisch abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/office-finance/review-office-work-item",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { workItemId: targetWorkItemId, executionStatus: "EXECUTED" },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  const reviewHandoffResult = record(
    await invoke({
      method: "POST",
      url: "/api/office-finance/review-finance-handoff",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { handoffId: targetHandoffId, approvalStatus: "SPECIALIST_REVIEW_REQUIRED", jamalDecision: "Steuerberater einbeziehen." },
    }),
  );
  await check("OWNER kann einen Finance-Handoff prüfen, executionBlocked bleibt true (200)", () => {
    assert.strictEqual(reviewHandoffResult.statusCode, 200);
    assert.strictEqual(reviewHandoffResult.json.handoff.approvalStatus, "SPECIALIST_REVIEW_REQUIRED");
    assert.strictEqual(reviewHandoffResult.json.handoff.executionBlocked, true);
  });

  const reviewIdentityResult = record(
    await invoke({
      method: "POST",
      url: "/api/office-finance/review-external-identity",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { identityId: (await invoke({ method: "GET", url: "/api/office-finance/identities", headers: { cookie: ownerSession.cookieHeader } })).json.identities[0].id, status: "ACTIVE" },
    }),
  );
  await check("OWNER kann eine Identität über HTTP prüfen (200, kein Passwort-/Tokenfeld in der Antwort)", () => {
    assert.strictEqual(reviewIdentityResult.statusCode, 200);
    assert.ok(!("password" in reviewIdentityResult.json.identity));
    assert.ok(!("token" in reviewIdentityResult.json.identity));
  });

  // -------------------------------------------------------------------
  // 34/35/36. keine externen Requests, Connector eindeutig Stub, keine
  // echte Google-ID (bereits fachlogisch in office-finance.test.js
  // geprüft; hier zusätzlich sichergestellt, dass keine HTTP-Antwort
  // dieses gesamten Laufs eine echte Providerkennung vortäuscht).
  // -------------------------------------------------------------------

  await check("keine Antwort dieses gesamten Testlaufs enthält eine vorgetäuschte echte Google-ID (kein 'googleapis'/'accounts.google.com')", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /googleapis\.com/);
      assert.doesNotMatch(body, /accounts\.google\.com/);
    });
  });

  // -------------------------------------------------------------------
  // 31/32/33. Audit datensparsam – kein E-Mail-Inhalt, keine Bankdaten,
  // kein Token/Secret.
  // -------------------------------------------------------------------

  await check("Audit-Ereignisse dieses Laufs sind datensparsam (keine E-Mail-Inhalte, keine Bankdaten, kein Betreff/Empfänger)", () => {
    const events = authDb.listAuditEvents(seedDb, { limit: 500 });
    const officeFinanceEvents = events.filter(
      (event) =>
        event.eventType.startsWith("EXTERNAL_IDENTITY_") ||
        event.eventType.startsWith("OFFICE_") ||
        event.eventType.startsWith("FINANCE_") ||
        event.eventType.startsWith("PROVIDER_CAPABILITY_"),
    );
    assert.ok(officeFinanceEvents.length > 0);
    officeFinanceEvents.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /kunde@example\.test|Testbetreff|Testtext|Testbeleg über HTTP/);
    });
  });

  await check("keine Antwort dieses gesamten Testlaufs enthält ein Zugangstoken/Provider-Secret", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /"(accessToken|refreshToken|apiKey|clientSecret|password)"\s*:\s*"[^"]+"/i);
    });
  });

  await check("keine Antwort dieses gesamten Testlaufs enthält Stacktraces oder absolute Dateisystempfade", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /at\s+[A-Za-z0-9_.]+\s+\(.*:\d+:\d+\)/);
      assert.doesNotMatch(body, new RegExp(__dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  });

  console.log(`office-finance-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
