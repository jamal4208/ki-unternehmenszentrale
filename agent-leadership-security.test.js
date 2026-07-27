"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und Technologie-/
// Plugin-Marktradar (Auftrag Abschnitt N) – Sicherheits-/Rollentests gegen
// den echten server.js#requestHandler. Gleiches Muster wie
// jamal-canva-security.test.js/work-order-execution-security.test.js. Läuft
// mit einem isolierten HOME-/KUZ_DATA_DIR-Verzeichnis; niemals die echte
// Application-Support-Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agent-leadership-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agent-leadership-security-test-data-"));
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

const AGENT_LEADERSHIP_GET_ROUTES = [
  "/api/agent-leadership/summary",
  "/api/agent-leadership/organization",
  "/api/agent-leadership/hr-daily-run",
  "/api/agent-leadership/technology-radar",
  "/api/agent-leadership/agent-technology-fit",
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt O) – zwei zusätzliche
  // lesende OWNER_ONLY-Endpunkte.
  "/api/agent-leadership/company-principles",
  "/api/agent-leadership/reliability-signals",
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
  // 12. Kunden und Support blockiert (auf allen fünf GET-Routen).
  // -------------------------------------------------------------------

  for (const url of AGENT_LEADERSHIP_GET_ROUTES) {
    await check(`CUSTOMER_ADMIN erreicht ${url} nicht (404)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: customerAdminSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 404);
    });
    await check(`SUPPORT ohne aktiven Grant erreicht ${url} nicht (404)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: supportSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 404);
    });
  }

  await check("Kundenrolle kann keinen HR-Lauf erzeugen (404)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/create-hr-daily-run",
        headers: authedJsonHeaders(customerAdminSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 13. OWNER erlaubt.
  // -------------------------------------------------------------------

  for (const url of AGENT_LEADERSHIP_GET_ROUTES) {
    await check(`OWNER erreicht ${url} (200)`, async () => {
      const result = await invoke({ method: "GET", url, headers: { cookie: ownerSession.cookieHeader } });
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.ok, true);
      assert.strictEqual(result.headers["Cache-Control"], "no-store");
    });
  }

  await check("Organisationsübersicht enthält exakt 25 Agenten über HTTP", async () => {
    const result = await invoke({ method: "GET", url: "/api/agent-leadership/organization", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.agentCount, 25);
    assert.strictEqual(result.json.profiles.length, 25);
  });

  await check("Führungsübersicht zeigt Sicherheits-/Autonomiegrenzen (Auftrag Abschnitt M)", async () => {
    const result = await invoke({ method: "GET", url: "/api/agent-leadership/summary", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.autonomyBoundaries.proposalIsNotAutonomyChange, true);
    assert.strictEqual(result.json.autonomyBoundaries.approvalDoesNotChangePermissions, true);
    assert.strictEqual(result.json.autonomyBoundaries.pluginRecommendationInstallsNothing, true);
    assert.strictEqual(result.json.autonomyBoundaries.jamalRemainsDecisionMaker, true);
  });

  // -------------------------------------------------------------------
  // Heutigen HR-Lauf erzeugen (Testvoraussetzung für die folgenden Tests).
  // -------------------------------------------------------------------

  const createRunResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/create-hr-daily-run",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("OWNER kann den heutigen HR-Lauf erzeugen (200, 25 Vorschläge)", () => {
    assert.strictEqual(createRunResult.statusCode, 200);
    assert.strictEqual(createRunResult.json.run.proposalCount, 25);
  });

  const secondCreateRunResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/create-hr-daily-run",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("ein zweiter Aufruf am selben Tag erzeugt keinen zweiten Lauf (Idempotenz über HTTP)", () => {
    assert.strictEqual(secondCreateRunResult.statusCode, 200);
    assert.strictEqual(secondCreateRunResult.json.created, false);
    assert.strictEqual(secondCreateRunResult.json.run.id, createRunResult.json.run.id);
  });

  const targetProposalId = createRunResult.json.run.proposals[0].id;

  // -------------------------------------------------------------------
  // 14. CSRF/Origin wirksam.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header bei einer Führungsaktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/review-hr-proposal",
        headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
        bodyObj: { proposalId: targetProposalId, status: "APPROVED" },
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin bei einer Führungsaktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/review-hr-proposal",
        headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
        bodyObj: { proposalId: targetProposalId, status: "APPROVED" },
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 15. Unbekannte Felder blockiert.
  // -------------------------------------------------------------------

  await check("ein unbekanntes Feld im Führungsaktionskörper wird abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/review-hr-proposal",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { proposalId: targetProposalId, status: "APPROVED", autonomyLevel: "AUSFÜHREND" },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  await check("eine unbekannte Führungsaktion liefert 404", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/install-plugin",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // Vorschlag tatsächlich genehmigen und prüfen, dass keine Berechtigung
  // sich ändert (Auftrag Abschnitt N Punkt 11).
  // -------------------------------------------------------------------

  const approveResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/review-hr-proposal",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { proposalId: targetProposalId, status: "APPROVED", jamalNote: "Passt." },
    }),
  );
  await check("OWNER kann einen HR-Vorschlag genehmigen (200)", () => {
    assert.strictEqual(approveResult.statusCode, 200);
    assert.strictEqual(approveResult.json.proposal.status, "APPROVED");
  });

  await check("Genehmigung eines HR-Vorschlags ändert keine Owner-/Kunden-Berechtigungsstufe (Route-Policy bleibt unverändert)", async () => {
    const afterApprovalCustomerCheck = await invoke({
      method: "GET",
      url: "/api/agent-leadership/organization",
      headers: { cookie: customerAdminSession.cookieHeader },
    });
    assert.strictEqual(afterApprovalCustomerCheck.statusCode, 404);
    const stillOwnerOnly = await invoke({ method: "GET", url: "/api/agent-leadership/organization", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(stillOwnerOnly.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // Radar-Eintrag lokal anlegen + Agent-Technology-Fit lesen/bewerten.
  // -------------------------------------------------------------------

  const upsertRadarResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/upsert-radar-item",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {
        name: "HTTP-Testkandidat",
        provider: "Test-Anbieter",
        category: "Testkategorie",
        type: "OTHER",
        shortDescription: "Ein über HTTP lokal erfasster Testkandidat.",
        possibleBusinessBenefit: "Möglicher Testnutzen.",
        maturityLevel: "Konzept",
        securityRisk: "NIEDRIG",
        privacyRisk: "NIEDRIG",
        costClass: "Kostenlos",
        integrationEffort: "Gering",
        vendorLockInRisk: "Gering",
        recommendation: "WATCH",
        reasoning: "Testbegründung.",
      },
    }),
  );
  await check("OWNER kann über HTTP lokal einen Radar-Eintrag anlegen (200, keine Verbindung)", () => {
    assert.strictEqual(upsertRadarResult.statusCode, 200);
    assert.strictEqual(upsertRadarResult.json.item.noExternalConnectionMade, true);
  });

  const fitListResult = await invoke({
    method: "GET",
    url: "/api/agent-leadership/agent-technology-fit",
    headers: { cookie: ownerSession.cookieHeader },
  });
  await check("Agent-Technology-Fit ist über HTTP lesbar und validiert", () => {
    assert.strictEqual(fitListResult.statusCode, 200);
    assert.ok(fitListResult.json.items.length > 0);
    fitListResult.json.items.forEach((item) => {
      assert.strictEqual(item.noConnectionMade, true);
      assert.strictEqual(item.noAutonomyChangeApplied, true);
    });
  });

  const targetFitId = fitListResult.json.items[0].id;
  const reviewFitResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/review-agent-technology-fit",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { fitId: targetFitId, status: "REVIEWED" },
    }),
  );
  await check("OWNER kann eine Agent-Technology-Fit-Empfehlung über HTTP bewerten (200)", () => {
    assert.strictEqual(reviewFitResult.statusCode, 200);
    assert.strictEqual(reviewFitResult.json.fit.status, "REVIEWED");
  });

  // -------------------------------------------------------------------
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt Q Punkte 22/27/28) –
  // Leitlinien-Endpoint, Reliability-Signale, PDCA-Aktion, Foresight-Review,
  // maximal drei priorisierte Hinweise über HTTP.
  // -------------------------------------------------------------------

  await check("Leitlinien-Endpoint liefert Version 1.0 und strukturierte Regeln (OWNER_ONLY, no-store)", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/agent-leadership/company-principles",
      headers: { cookie: ownerSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.version, "1.0");
    assert.ok(Array.isArray(result.json.principles));
    assert.ok(result.json.principles.length >= 27);
    assert.strictEqual(result.json.isOperationalLogicNotJustDocumentation, true);
    assert.strictEqual(result.headers["Cache-Control"], "no-store");
  });

  await check("Kundenrolle erreicht den Leitlinien-Endpoint nicht (404)", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/agent-leadership/company-principles",
      headers: { cookie: customerAdminSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("Führungsübersicht begrenzt priorisierte Hinweise über HTTP auf höchstens drei (Auftrag Abschnitt L)", async () => {
    const result = await invoke({ method: "GET", url: "/api/agent-leadership/summary", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.json.maxPrioritizedHints, 3);
    assert.ok(result.json.prioritizedAgentHints.length <= 3);
    assert.strictEqual(result.json.companyPrinciplesVersion, "1.0");
    assert.ok(result.json.leadershipFocusNote.length > 0);
  });

  const advancePdcaResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/advance-hr-pdca-stage",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { proposalId: targetProposalId, targetStage: "DO" },
    }),
  );
  await check("OWNER kann eine HR-PDCA-Stufe über HTTP vorwärts bewegen (200, PLAN->DO nach Genehmigung)", () => {
    assert.strictEqual(advancePdcaResult.statusCode, 200);
    assert.strictEqual(advancePdcaResult.json.proposal.pdcaStage, "DO");
  });

  await check("ein PDCA-Sprung (DO->ACT ohne CHECK) wird über HTTP abgelehnt (409)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/agent-leadership/advance-hr-pdca-stage",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { proposalId: targetProposalId, targetStage: "ACT", pdcaDecision: "KEEP" },
      }),
    );
    assert.strictEqual(result.statusCode, 409);
  });

  const recordSignalResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/record-reliability-signal",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {
        agentId: createRunResult.json.run.proposals[1].agentId,
        signalType: "UNCERTAINTY",
        observation: "HTTP-Testbeobachtung: Unsicherheit über eine neue Eingabe.",
        possibleImpact: "Mögliche Verzögerung bei der nächsten Prüfung.",
        recommendedReview: "Beim nächsten Lauf erneut prüfen.",
      },
    }),
  );
  await check("OWNER kann über HTTP ein Hochzuverlässigkeitssignal erfassen (200, keine automatische Sanktion)", () => {
    assert.strictEqual(recordSignalResult.statusCode, 200);
    assert.strictEqual(recordSignalResult.json.signal.status, "OPEN");
    assert.strictEqual(recordSignalResult.json.signal.noAutomaticSanction, true);
  });

  const listSignalsResult = await invoke({
    method: "GET",
    url: "/api/agent-leadership/reliability-signals",
    headers: { cookie: ownerSession.cookieHeader },
  });
  await check("Reliability-Signale sind über HTTP lesbar", () => {
    assert.strictEqual(listSignalsResult.statusCode, 200);
    assert.ok(listSignalsResult.json.items.some((item) => item.id === recordSignalResult.json.signal.id));
  });

  const reviewSignalResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/review-reliability-signal",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { signalId: recordSignalResult.json.signal.id, status: "MONITORING" },
    }),
  );
  await check("OWNER kann ein Hochzuverlässigkeitssignal über HTTP prüfen, ohne eine Autonomie zu ändern (200)", () => {
    assert.strictEqual(reviewSignalResult.statusCode, 200);
    assert.strictEqual(reviewSignalResult.json.signal.status, "MONITORING");
    assert.strictEqual(reviewSignalResult.json.signal.noAutonomyChangeApplied, true);
  });

  const foresightRadarItemId = upsertRadarResult.json.item.radarItemId;
  const reviewForesightResult = record(
    await invoke({
      method: "POST",
      url: "/api/agent-leadership/review-foresight-scenario",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { radarItemId: foresightRadarItemId },
    }),
  );
  await check("OWNER kann ein Zukunftsszenario über HTTP als geprüft markieren (200, keine Installation/Investition)", () => {
    assert.strictEqual(reviewForesightResult.statusCode, 200);
    assert.strictEqual(reviewForesightResult.json.item.noExternalConnectionMade, true);
    assert.strictEqual(reviewForesightResult.json.item.noInstallationPerformed, true);
  });

  // -------------------------------------------------------------------
  // 18/19. Keine externen Requests, keine Tokens/Secrets in Antworten.
  // -------------------------------------------------------------------

  await check("keine Antwort dieses gesamten Testlaufs enthält ein Zugangstoken/Provider-Secret", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /accessToken|apiKey|clientSecret|refreshToken|"bearer"/i);
    });
  });

  await check("keine der beteiligten V7.5-Dateien führt einen ausgehenden Netzwerkaufruf aus (statische Quelltextprüfung)", () => {
    const filesToScan = [
      "agent-leadership-routes.js",
      "agent-organization-service.js",
      "agent-hr-coaching-service.js",
      "technology-radar-service.js",
    ];
    filesToScan.forEach((fileName) => {
      const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
      assert.ok(!/require\(["']https?["']\)/.test(source), `${fileName} importiert http(s)`);
      assert.ok(!/\bfetch\s*\(/.test(source), `${fileName} ruft fetch() auf`);
      assert.ok(!/\bXMLHttpRequest\b/.test(source), `${fileName} verwendet XMLHttpRequest`);
    });
  });

  // -------------------------------------------------------------------
  // 20. Audit datensparsam (HTTP-Ebene).
  // -------------------------------------------------------------------

  await check("Audit-Ereignisse dieses Testlaufs enthalten keine vollständigen Vorschlagstexte", () => {
    const events = authDb.listAuditEvents(seedDb, {});
    const leadershipEvents = events.filter(
      (event) =>
        event.eventType.startsWith("HR_") ||
        event.eventType.startsWith("TECH_RADAR_") ||
        event.eventType === "AGENT_TECH_FIT_REVIEWED" ||
        event.eventType === "AGENT_ORGANIZATION_REVIEWED",
    );
    assert.ok(leadershipEvents.length > 0);
    leadershipEvents.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /Passt\.|Testbegründung|Heute 1 % besser/);
    });
  });

  await check("keine Antwort dieses gesamten Testlaufs enthält Stacktraces oder absolute Dateisystempfade", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /at\s+[A-Za-z0-9_.]+\s+\(.*:\d+:\d+\)/);
      assert.doesNotMatch(body, new RegExp(__dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  });

  console.log(`agent-leadership-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
