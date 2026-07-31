"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 8 ("vollständige, kontrollierte
// Drei-Agenten-Kette als kontrollierter Nachtlauf").
//
// HTTP-/Sicherheitsschicht-Tests für die drei additiven Aktionen
// POST /api/pilot-work-order/orders/:pilotOrderId/prepare-agent-chain
// POST /api/pilot-work-order/orders/:pilotOrderId/request-chain-step-approval
// POST /api/pilot-work-order/orders/:pilotOrderId/start-chain-step
// (siehe pilot-work-order-routes.js#PILOT_ACTIONS). Läuft – wie
// pilot-agent-execution-api.test.js – ausschließlich gegen den echten
// server.js#requestHandler: jede Prüfung durchläuft tatsächlich Routing,
// Auth-Gate, CSRF-/Origin-Prüfung, JSON-Body-Parsing und die HTTP-
// Fehlerabbildung. Für die Serviceebene selbst (Tokenbindung, Prompt-
// Injection, Digest-Prüfung, Audit) siehe pilot-agent-execution-chain.test.js.
//
// Der reale Codex-CLI-Kindprozess wird NIEMALS gestartet: wie
// pilot-agent-execution-api.test.js werden ausschließlich die exportierten
// Funktionen von execution-codex-adapter.js#detectCodexAvailability und
// execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis temporär
// überschrieben (finally: zuverlässig wiederhergestellt). Ausschließlich
// isolierte os.tmpdir()-Testverzeichnisse.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-chain-api-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-chain-api-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authTenantLink = require("./auth-tenant-link");
const server = require("./server");
const codexAvailabilityAdapter = require("./execution-codex-adapter");
const codexReadOnlyAdapter = require("./execution-codex-adapter-readonly");
const routes = require("./pilot-work-order-routes");

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

function testOrderInput(overrides = {}) {
  return {
    title: "Testauftrag: Drei-Agenten-Kette über HTTP",
    desiredOutcome: "Nachweis, dass die Drei-Agenten-Kette getrennt über die HTTP-Schicht vorbereitet, freigegeben und gestartet werden kann.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis beantwortet die Auftragsfrage"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart", "Freigabe des finalen Ergebnisses"],
    timeframe: "Ohne festes Enddatum.",
    ...overrides,
  };
}

async function driveOrderToInExecutionViaHttp(orderId, ownerSession) {
  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/mark-ready-for-approval`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {},
  });
  await invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/approve-for-execution`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { confirmed: true },
  });
  return invoke({
    method: "POST",
    url: `/api/pilot-work-order/orders/${orderId}/start-execution`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {},
  });
}

// Wie pilot-agent-execution-api.test.js#jsonContainsSensitiveField, mit
// einer gezielten Ausnahme für die beiden bereits durch Phase 7
// eingeführten, bewusst dokumentierten Statusfelder
// (resultSummary.secretRedactionApplied/-Notice – reine Boolesche/Text-
// Statusanzeige, niemals ein tatsächliches Secret). Ein echtes Secret im
// Wert selbst würde weiterhin über andere Muster (Passwort/Token/Cookie)
// erkannt.
function jsonContainsSensitiveField(value) {
  const raw = JSON.stringify(value)
    .toLowerCase()
    .replace(/"secretredactionapplied"/g, '"redactionapplied"')
    .replace(/"secretredactionnotice"/g, '"redactionnotice"');
  return /password|passwort|"token"|cookie|secret/.test(raw);
}

function pilotAuditEventsFor(orderId) {
  return authDb
    .listAuditEvents(seedDb, { limit: 4000 })
    .filter((event) => event.eventType.startsWith("CHAIN_"))
    .filter((event) => {
      if (!event.metadata) return false;
      try {
        const metadata = JSON.parse(event.metadata);
        return metadata.chainId !== undefined;
      } catch (_error) {
        return false;
      }
    });
}

// Für jeden der drei Schritte ein eigenes, klar unterscheidbares Ergebnis –
// niemals dieselbe Attrappe für alle drei Stufen (Auftrag: "niemals durch
// eine Attrappe... ersetzt"). Der echte Codex-Adapter (siehe
// pilot-agent-codex-runner.js#runPilotAgentCodexAnalysisTask) übergibt
// keine presetId an runCodexReadOnlyAnalysis, sondern ausschließlich den
// fertigen Prompt – die technische Agenten-ID (agentKey) steht darin
// eindeutig ("technische ID: <agentKey>"), daher wird darüber
// unterschieden.
const FAKE_STEP_RESULTS_BY_AGENT_KEY = {
  "review-agent":
    "Kurzbefund: Testbefund Schritt 1.\nBeobachtung 1: A.\nBeobachtung 2: B.\nBeobachtung 3: C.\n" +
    "Risiko 1: X.\nRisiko 2: Y.\nEmpfehlung: Weiter mit Dokumentation.\nVerwendete Grundlagen: Testquelle.\nOffene Punkte: keine.",
  "documentation-agent":
    "Titel: Testdokumentation Schritt 2.\nAusgangslage: siehe Schritt 1.\nBestätigte Erkenntnisse: A, B.\n" +
    "Übernommene Aussagen des Vorgängers: C.\nOffene Punkte: keine.\nRisiken: X, Y.\nEmpfohlener nächster Schritt: PM-Bewertung.\nQuelle: Schritt 1.",
  "orchestrator-agent":
    "Gesamturteil: konsistent.\nGeprüfte Vorgängerläufe: Schritt 1, Schritt 2.\nKonsistenzprüfung: ok.\n" +
    "Qualitätsmängel: keine.\nRisiken und Grenzen: X, Y.\nEmpfehlung: Jamal kann entscheiden.\nBenötigte Entscheidung durch Jamal: Freigabe des Gesamtergebnisses.",
};
const SINGLE_CHAIN_FILE_SELECTION = ["pilot-work-order-service.js"];

async function withFakeCodexHttp(fn) {
  const originalDetectAvailability = codexAvailabilityAdapter.detectCodexAvailability;
  const originalRunReadOnly = codexReadOnlyAdapter.runCodexReadOnlyAnalysis;
  codexAvailabilityAdapter.detectCodexAvailability = () => ({
    available: true,
    authenticated: true,
    version: "codex-cli 0.0.0-test",
    authLabel: "ChatGPT",
    reason: null,
  });
  codexReadOnlyAdapter.runCodexReadOnlyAnalysis = async (options) => {
    const prompt = (options && options.prompt) || "";
    const matchedAgentKey = Object.keys(FAKE_STEP_RESULTS_BY_AGENT_KEY).find((agentKey) => prompt.includes(`technische ID: ${agentKey}`));
    const resultText = matchedAgentKey ? FAKE_STEP_RESULTS_BY_AGENT_KEY[matchedAgentKey] : "Testergebnis (unbekannter Agent).";
    return {
      ok: true,
      cancelled: false,
      timedOut: false,
      resultText,
      secretRedactionApplied: false,
      secretRedactionNotice: null,
      errors: [],
    };
  };
  try {
    return await fn();
  } finally {
    codexAvailabilityAdapter.detectCodexAvailability = originalDetectAvailability;
    codexReadOnlyAdapter.runCodexReadOnlyAnalysis = originalRunReadOnly;
  }
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);

  const customerAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("a-customer-admin") });
  const customerAdminSession = await loginAndGetSession(customerAdmin.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("c-owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  let orderId;
  await check("Vorbereitung: ein Pilotauftrag kann über die API angelegt und bis IN_EXECUTION geführt werden", async () => {
    const createResult = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput(),
    });
    assert.strictEqual(createResult.statusCode, 200);
    orderId = createResult.json.overview.order.id;
    assert.ok(Array.isArray(createResult.json.overview.agentChains), "die Overview-Antwort enthält von Anfang an ein (leeres) agentChains-Feld");
    assert.strictEqual(createResult.json.overview.agentChains.length, 0);
    const finalResult = await driveOrderToInExecutionViaHttp(orderId, ownerSession);
    assert.strictEqual(finalResult.statusCode, 200);
    assert.strictEqual(finalResult.json.overview.status, "IN_EXECUTION");
  });

  // -------------------------------------------------------------------
  // 43./41. kein generischer "gesamte Kette starten"-Endpunkt; nur die
  // drei vorgesehenen Aktionen existieren.
  // -------------------------------------------------------------------
  await check("43. es existiert kein generischer 'gesamte Kette starten'-Endpunkt", () => {
    assert.strictEqual(routes.isPilotAction("start-agent-chain"), false);
    assert.strictEqual(routes.isPilotAction("run-agent-chain"), false);
    assert.strictEqual(routes.isPilotAction("start-chain"), false);
    assert.ok(routes.isPilotAction("prepare-agent-chain"));
    assert.ok(routes.isPilotAction("request-chain-step-approval"));
    assert.ok(routes.isPilotAction("start-chain-step"));
  });

  await check("CUSTOMER_ADMIN kann keine Kette vorbereiten (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/prepare-agent-chain`,
      headers: authedJsonHeaders(customerAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("ein falscher CSRF-Header beim Vorbereiten einer Kette wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/prepare-agent-chain`,
      headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin beim Vorbereiten einer Kette wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/prepare-agent-chain`,
      headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("ein unbekanntes Feld beim Vorbereiten einer Kette wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/prepare-agent-chain`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { irgendetwas: true },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  let chainId;
  await check("1./2. Kette vorbereiten mit selectedFiles fixiert genau diese Auswahl und ist danach über GET sichtbar", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/prepare-agent-chain`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { selectedFiles: SINGLE_CHAIN_FILE_SELECTION.slice() },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    chainId = result.json.chain.id;
    assert.strictEqual(result.json.chain.chainStatus, "PREPARED");
    assert.strictEqual(result.json.chain.steps.length, 3);
    assert.deepStrictEqual(result.json.chain.selectedFiles, SINGLE_CHAIN_FILE_SELECTION);
    assert.ok(result.json.chain.coreMandate && result.json.chain.coreMandate.title === "Testauftrag: Drei-Agenten-Kette über HTTP");
    assert.strictEqual(result.json.overview.agentChains.length, 1);
    assert.ok(
      Array.isArray(result.json.overview.chainSelectableFiles) && result.json.overview.chainSelectableFiles.includes(SINGLE_CHAIN_FILE_SELECTION[0]),
      "Overview muss die serverseitig auswählbaren Ketten-Dateien liefern",
    );

    const overviewResult = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(overviewResult.json.overview.agentChains.length, 1);
    assert.strictEqual(overviewResult.json.overview.agentChains[0].id, chainId);
    assert.deepStrictEqual(overviewResult.json.overview.agentChains[0].selectedFiles, SINGLE_CHAIN_FILE_SELECTION);
  });

  await check("13./35. Freigabe für Schritt 2 kann nicht angefordert werden, bevor Schritt 1 abgeschlossen ist (409)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-chain-step-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 2 },
    });
    assert.strictEqual(result.statusCode, 409);
  });

  await check("34. eine chainId aus einem fremden Pilotauftrag wird abgewiesen (400)", async () => {
    const otherOrderResult = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput({ title: "Fremder Auftrag für Bindungstest" }),
    });
    const otherOrderId = otherOrderResult.json.overview.order.id;
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${otherOrderId}/request-chain-step-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 1 },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  let step1ApprovalToken;
  await check("15./21. eine Freigabe für Schritt 1 kann angefordert werden und liefert einen kurzlebigen Token", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-chain-step-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 1 },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.ok(typeof result.json.approvalToken === "string" && result.json.approvalToken.length > 0);
    assert.strictEqual(result.json.chain.chainStatus, "WAITING_FOR_RESEARCH_APPROVAL");
    step1ApprovalToken = result.json.approvalToken;
  });

  await check("ein unbekanntes Feld beim Anfordern einer Stufenfreigabe wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-chain-step-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 1, approvalToken: "nicht-erlaubt-in-diesem-schritt" },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("14. Schritt 3 (PM) kann nicht vor Schritt 2 gestartet werden (409), auch mit einem gültigen fremden Token", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 3, approvalToken: step1ApprovalToken },
    });
    assert.strictEqual(result.statusCode, 409);
  });

  await check("ein Start ohne (leeren) Freigabetoken wird abgewiesen (409, kein stiller Erfolg)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { chainId, chainStep: 1, approvalToken: "" },
    });
    assert.strictEqual(result.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // Vollständiger, aber ausschließlich simulierter (kein echter
  // Codex-Kindprozess) Drei-Stufen-Lauf über die reale HTTP-Schicht.
  // -------------------------------------------------------------------
  const runIds = {};
  await withFakeCodexHttp(async () => {
    await check("4./5./25. Schritt 1 kann mit dem angeforderten Token gestartet werden; Kette wechselt auf WAITING_FOR_DOCUMENTATION_APPROVAL", async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 1, approvalToken: step1ApprovalToken },
      });
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.chain.chainStatus, "WAITING_FOR_DOCUMENTATION_APPROVAL");
      assert.strictEqual(result.json.chain.currentStep, 2);
      const step1 = result.json.chain.steps.find((entry) => entry.stepNumber === 1);
      assert.strictEqual(step1.stepStatus, "SUCCEEDED");
      assert.ok(typeof step1.executionRunId === "string" && step1.executionRunId.length > 0);
      runIds[1] = step1.executionRunId;
      const run1 = result.json.overview.agentExecutionRuns.find((entry) => entry.id === runIds[1]);
      assert.ok(run1 && typeof run1.mandateDigest === "string" && run1.mandateDigest.length > 0);

      // 22./23. ein zuvor gültiger Token einer früheren Stufe ist danach
      // ungültig – erneute Verwendung darf nicht nochmal erfolgreich sein.
      const reuseResult = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 1, approvalToken: step1ApprovalToken },
      });
      assert.strictEqual(reuseResult.statusCode, 409);
    });

    let step2ApprovalToken;
    await check("6./7. Freigabe für Schritt 2 (Dokumentation) kann angefordert werden", async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/request-chain-step-approval`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 2 },
      });
      assert.strictEqual(result.statusCode, 200);
      step2ApprovalToken = result.json.approvalToken;
    });

    await check("8./26. Schritt 2 kann gestartet werden und verwendet das tatsächliche Ergebnis von Schritt 1; Kette wechselt auf WAITING_FOR_PM_APPROVAL", async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 2, approvalToken: step2ApprovalToken },
      });
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.chain.chainStatus, "WAITING_FOR_PM_APPROVAL");
      const step2 = result.json.chain.steps.find((entry) => entry.stepNumber === 2);
      assert.strictEqual(step2.stepStatus, "SUCCEEDED");
      assert.strictEqual(step2.chainedFromExecutionRunId, runIds[1]);
      assert.strictEqual(step2.predecessorFullyIncluded, true);
      runIds[2] = step2.executionRunId;
      assert.notStrictEqual(runIds[2], runIds[1], "jede Stufe erhält eine eigene, unterschiedliche executionRunId");

      // Ergebnisse der einzelnen Stufen sind über das bestehende,
      // unveränderte agentExecutionRuns-Feld lesbar (keine zweite,
      // separat abzufragende Ergebnis-Ressource nötig).
      const runFromOverview = result.json.overview.agentExecutionRuns.find((entry) => entry.id === runIds[1]);
      assert.ok(runFromOverview);
      assert.ok(runFromOverview.resultRawText.includes("Testbefund Schritt 1"));
      const run2FromOverview = result.json.overview.agentExecutionRuns.find((entry) => entry.id === runIds[2]);
      assert.ok(run2FromOverview && run2FromOverview.mandateDigest === runFromOverview.mandateDigest);
    });

    let step3ApprovalToken;
    await check("9. Freigabe für Schritt 3 (PM) kann angefordert werden", async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/request-chain-step-approval`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 3 },
      });
      assert.strictEqual(result.statusCode, 200);
      step3ApprovalToken = result.json.approvalToken;
    });

    await check("9./27. Schritt 3 (PM) kann gestartet werden; Kette wird erst danach COMPLETED (keine automatische Freigabe)", async () => {
      const result = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${orderId}/start-chain-step`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { chainId, chainStep: 3, approvalToken: step3ApprovalToken },
      });
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.chain.chainStatus, "COMPLETED");
      const step3 = result.json.chain.steps.find((entry) => entry.stepNumber === 3);
      assert.strictEqual(step3.stepStatus, "SUCCEEDED");
      runIds[3] = step3.executionRunId;
      assert.notStrictEqual(runIds[3], runIds[2]);
      const pmRun = result.json.overview.agentExecutionRuns.find((entry) => entry.id === runIds[3]);
      assert.ok(pmRun.resultRawText.includes("Gesamturteil"));
      assert.strictEqual(result.json.chain.completedAt !== null, true);
    });

    await check("V7.8.0: alle drei Stufen laufen mit der zuvor fixierten Einzeldatei (allowedFilesJson je executionRun)", async () => {
      [1, 2, 3].forEach((stepNumber) => {
        const runId = runIds[stepNumber];
        const runRow = authDb.getPilotAgentExecutionRunById(seedDb, runId);
        assert.ok(runRow, `executionRun ${runId} muss vorhanden sein`);
        assert.deepStrictEqual(JSON.parse(runRow.allowedFilesJson), SINGLE_CHAIN_FILE_SELECTION);
      });
    });

    await check("41./42. GET liefert Kettenstatus, alle drei executionRunIds und bleibt danach unverändert (keine automatische Folgeausführung)", async () => {
      const overviewResult = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
      const chain = overviewResult.json.overview.agentChains.find((entry) => entry.id === chainId);
      assert.strictEqual(chain.chainStatus, "COMPLETED");
      const ids = chain.steps.map((step) => step.executionRunId);
      assert.strictEqual(new Set(ids).size, 3, "alle drei Stufen haben unterschiedliche executionRunIds");
      assert.deepStrictEqual(ids, [runIds[1], runIds[2], runIds[3]]);
    });
  });

  await check("39./40. Audit enthält alle Kettenstufen für diesen Auftrag, niemals Prompttexte, Ergebnisse oder Tokens", async () => {
    const events = pilotAuditEventsFor(orderId);
    const eventTypes = new Set(events.map((event) => event.eventType));
    ["CHAIN_PREPARED", "CHAIN_STEP_APPROVAL_REQUESTED", "CHAIN_STEP_STARTED", "CHAIN_STEP_SUCCEEDED", "CHAIN_WAITING_FOR_NEXT_APPROVAL", "CHAIN_COMPLETED"].forEach(
      (eventType) => assert.ok(eventTypes.has(eventType), `Audit fehlt ${eventType}`),
    );
    const rawEvents = JSON.stringify(events);
    assert.ok(!rawEvents.includes("Testbefund Schritt 1"));
    assert.ok(!rawEvents.includes("Gesamturteil"));
    assert.ok(!rawEvents.includes(step1ApprovalToken));
  });

  await check("keine Antwort dieses Prefixes enthält Passwort, Token, Cookie oder sensible Freitextfelder", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(jsonContainsSensitiveField(result.json), false);
  });

  console.log(`pilot-agent-execution-chain-api.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution-chain-api.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
