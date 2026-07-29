"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 6 ("technische
// Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner").
//
// HTTP-/Sicherheitsschicht-Tests für die additive Route
// POST /api/pilot-work-order/orders/:pilotOrderId/start-agent-execution
// (siehe pilot-work-order-routes.js#PILOT_ACTIONS["start-agent-execution"]).
// Läuft – wie pilot-work-order-security.test.js/
// pilot-work-order-parallel-api.test.js – ausschließlich gegen den echten
// server.js#requestHandler: jede Prüfung durchläuft tatsächlich Routing,
// Auth-Gate, CSRF-/Origin-Prüfung, JSON-Body-Parsing und die HTTP-
// Fehlerabbildung, nicht nur die Serviceschicht (siehe dafür
// pilot-agent-execution.test.js).
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

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-agent-exec-api-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-agent-exec-api-test-data-"));
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
const codexAvailabilityAdapter = require("./execution-codex-adapter");
const codexReadOnlyAdapter = require("./execution-codex-adapter-readonly");

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
    title: "Testauftrag: Agentenlauf über HTTP",
    desiredOutcome: "Nachweis, dass ein technischer Agentenlauf (lokaler deterministischer Runner) über die HTTP-Schicht gestartet werden kann.",
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

function pilotAuditEventsFor(orderId) {
  return authDb
    .listAuditEvents(seedDb, { limit: 2000 })
    .filter((event) => event.eventType.startsWith("PILOT_AGENT_EXECUTION_RUN_"))
    .filter((event) => {
      if (!event.metadata) return false;
      try {
        return JSON.parse(event.metadata).pilotOrderId === orderId;
      } catch (_error) {
        return false;
      }
    });
}

function jsonContainsSensitiveField(value) {
  const raw = JSON.stringify(value).toLowerCase();
  return /password|passwort|"token"|cookie|secret/.test(raw);
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
  // Auftrag anlegen und bis IN_EXECUTION führen (Voraussetzung für einen
  // Agentenlauf).
  // -------------------------------------------------------------------

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
    const finalResult = await driveOrderToInExecutionViaHttp(orderId, ownerSession);
    assert.strictEqual(finalResult.statusCode, 200);
    assert.strictEqual(finalResult.json.overview.status, "IN_EXECUTION");
  });

  // -------------------------------------------------------------------
  // Sicherheitsgrenzen: exakt dieselben bestehenden Regeln gelten
  // unverändert für die neue Aktion (OWNER_ONLY, CSRF, Origin).
  // -------------------------------------------------------------------

  await check("CUSTOMER_ADMIN kann keinen Agentenlauf starten (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(customerAdminSession),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT ohne aktiven Grant kann keinen Agentenlauf starten (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(supportSession),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("ein falscher CSRF-Header beim Start eines Agentenlaufs wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin beim Start eines Agentenlaufs wird abgelehnt (403)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 403);
  });

  await check("ein unbekanntes Feld im Start-Request wird abgewiesen (400, keine freie Rechteerweiterung über den Body)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "analyze-pilot-structure", allowedFiles: ["etwas-anderes.js"] },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("eine unbekannte presetId wird abgewiesen (400) statt eine freie Aufgabe zuzulassen", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "irgendetwas-frei-erfundenes" },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // Ein Agentenlauf ist nur während IN_EXECUTION möglich (nicht z. B.
  // DRAFT).
  // -------------------------------------------------------------------

  await check("ein Agentenlauf ist außerhalb von IN_EXECUTION nicht möglich (409)", async () => {
    const draftOrderResult = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput({ title: "Auftrag im Entwurf (kein Agentenlauf erlaubt)" }),
    });
    const draftOrderId = draftOrderResult.json.overview.order.id;
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${draftOrderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // Der eigentliche, echte Referenzlauf über HTTP: startet den
  // tatsächlichen Runner, persistiert das Ergebnis, erzeugt ein echtes
  // Handoff, lässt Status/Revision unverändert außer durch die reale
  // Aktion.
  // -------------------------------------------------------------------

  let agentExecutionRunId;

  await check("27. ein technischer Agentenlauf (lokaler deterministischer Runner) kann über die API gestartet werden; die Antwort liefert Ausführungsstatus, Ergebnis, Handoff und aktualisiertes Overview", async () => {
    const revision = (await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) })).json.overview.order
      .revision;
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "analyze-pilot-structure", expectedRevision: revision },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.agentExecutionRun.status, "SUCCEEDED");
    assert.strictEqual(result.json.agentExecutionRun.pilotOrderId, orderId);
    assert.ok(result.json.agentExecutionRun.startedAt);
    assert.ok(result.json.agentExecutionRun.finishedAt);
    assert.match(result.json.agentExecutionRun.resultRawText, /Bestandsaufnahme/);
    assert.ok(result.json.handoff, "ein erfolgreicher Lauf muss über die API eine echte Rollenübergabe liefern");
    assert.strictEqual(result.json.handoff.executionRunId, result.json.agentExecutionRun.id);
    assert.strictEqual(result.json.filterResult.passed, true);
    assert.strictEqual(result.json.overview.status, "IN_EXECUTION", "keine automatische Freigabe/keinen automatischen Abschluss über die API");
    agentExecutionRunId = result.json.agentExecutionRun.id;
  });

  await check("das aktualisierte Overview (GET) zeigt den Agentenlauf danach dauerhaft in agentExecutionRuns", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.overview.agentExecutionRuns.length, 1);
    assert.strictEqual(result.json.overview.agentExecutionRuns[0].id, agentExecutionRunId);
    assert.strictEqual(result.json.overview.agentExecutionRuns[0].status, "SUCCEEDED");
    assert.strictEqual(result.json.overview.handoffs.length, 1);
    assert.strictEqual(result.json.overview.handoffs[0].executionRunId, agentExecutionRunId);
  });

  await check("eine veraltete expectedRevision beim Start über HTTP liefert 409 mit erwarteter/aktueller Revision, kein stiller Erfolg", async () => {
    const current = (await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) })).json.overview.order
      .revision;
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "analyze-pilot-structure", expectedRevision: current + 5 },
    });
    assert.strictEqual(result.statusCode, 409);
    assert.strictEqual(result.json.ok, false);
    assert.strictEqual(result.json.expectedRevision, current + 5);
    assert.strictEqual(result.json.currentRevision, current);
  });

  await check("ein zweiter, gleichzeitig über HTTP ausgelöster Start (Doppelklick) erzeugt keinen zweiten aktiven Lauf (genau ein 200, ein 409)", async () => {
    const secondOrderResult = await invoke({
      method: "POST",
      url: "/api/pilot-work-order/orders",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: testOrderInput({ title: "Auftrag für Doppelklick-Test über HTTP" }),
    });
    const secondOrderId = secondOrderResult.json.overview.order.id;
    await driveOrderToInExecutionViaHttp(secondOrderId, ownerSession);

    const requestBody = { presetId: "analyze-pilot-structure" };
    const [first, second] = await Promise.all([
      invoke({ method: "POST", url: `/api/pilot-work-order/orders/${secondOrderId}/start-agent-execution`, headers: authedJsonHeaders(ownerSession), bodyObj: requestBody }),
      invoke({ method: "POST", url: `/api/pilot-work-order/orders/${secondOrderId}/start-agent-execution`, headers: authedJsonHeaders(ownerSession), bodyObj: requestBody }),
    ]);
    const statusCodes = [first.statusCode, second.statusCode].sort();
    assert.deepStrictEqual(statusCodes, [200, 409], "genau ein Start darf gelingen, der gleichzeitige zweite muss als Konflikt abgelehnt werden");

    const overviewResult = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${secondOrderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(overviewResult.json.overview.agentExecutionRuns.length, 1, "es darf nur genau ein Agentenlauf-Datensatz entstanden sein");
  });

  // -------------------------------------------------------------------
  // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
  // Codex-Anbindung") – 37./38. die API zeigt für JEDEN Lauf (auch den
  // bereits oben real gestarteten lokalen Lauf) wahrheitsgemäß
  // angeforderten/tatsächlichen Runner sowie KI-/Fallback-/Freigabestatus.
  // Ein echter Codex-Erfolg über HTTP wird hier bewusst NICHT erzwungen
  // (siehe Auftrag, "kein realer Lauf ohne echte, bereits vorhandene
  // Freigabe/Authentifizierung") – das ist Gegenstand des separat
  // dokumentierten Codex-Referenznachweises, nicht dieser deterministischen
  // HTTP-Sicherheitsschicht-Suite.
  // -------------------------------------------------------------------

  await check("37./38. die API zeigt für den bereits erfolgreichen lokalen Lauf wahrheitsgemäß Runner-Auswahl sowie KI-/Fallback-/Freigabestatus", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    const run = result.json.overview.agentExecutionRuns.find((entry) => entry.id === agentExecutionRunId);
    assert.ok(run);
    assert.strictEqual(run.requestedRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY");
    assert.strictEqual(run.actualRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY");
    assert.strictEqual(run.aiExecuted, false);
    assert.strictEqual(run.fallbackUsed, false);
    assert.strictEqual(run.networkRequired, false);
    assert.strictEqual(run.externalAiRequired, false);
    assert.strictEqual(run.approvalStatus, "NOT_REQUIRED");
  });

  await check("die API zeigt die Codex-Verfügbarkeit im Overview (ausschließlich lesend, keine Freigabe)", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.ok(result.json.overview.codexAvailability);
    assert.strictEqual(typeof result.json.overview.codexAvailability.available, "boolean");
    assert.strictEqual(typeof result.json.overview.codexAvailability.authenticated, "boolean");
  });

  await check("Phase 7 – ein Codex-Agentenlauf ohne vorherige Freigabeanforderung wird über die API immer abgelehnt (409), niemals ein stiller Erfolg", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/start-agent-execution`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "codex-analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 409);
    assert.strictEqual(result.json.ok, false);
  });

  await check("Phase 7 – 40. eine Codex-Freigabeanforderung kann über die API angefordert werden und liefert einen einmaligen Token, ohne selbst einen Lauf zu starten", async () => {
    const before = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    const runsBefore = before.json.overview.agentExecutionRuns.length;
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-codex-run-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "codex-analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.ok(typeof result.json.approvalToken === "string" && result.json.approvalToken.length > 0);
    assert.strictEqual(result.json.overview, undefined, "das reine Ausstellen eines Freigabe-Tokens darf keinen Auftragszustand zurückliefern/verändern");
    const after = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(after.json.overview.agentExecutionRuns.length, runsBefore, "das reine Ausstellen eines Tokens darf keinen Agentenlauf erzeugen");
  });

  await check("eine Codex-Freigabeanforderung für ein lokales (nicht-Codex) Preset wird abgewiesen (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-codex-run-approval`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { presetId: "analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("CUSTOMER_ADMIN kann keine Codex-Freigabe anfordern (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/pilot-work-order/orders/${orderId}/request-codex-run-approval`,
      headers: authedJsonHeaders(customerAdminSession),
      bodyObj: { presetId: "codex-analyze-pilot-structure" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern") – 8. die
  // Fehlerdiagnose eines fehlgeschlagenen Codex-Laufs muss über die echte
  // HTTP-API sichtbar sein, nicht nur auf Serviceebene (siehe
  // pilot-agent-execution-codex.test.js für die Serviceebene). Da diese
  // Suite ausschließlich gegen den echten server.js#requestHandler läuft
  // und die Route selbst keine Test-Adapter-Injektion erlaubt, werden hier
  // ausschließlich die exportierten Funktionen der zwei laut Auftrag
  // änderbaren Module (execution-codex-adapter.js#detectCodexAvailability,
  // execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis)
  // temporär überschrieben und danach zuverlässig (finally) wiederhergestellt.
  // Das eingefrorene execution-codex-adapter.js selbst bleibt dabei
  // unverändert auf der Festplatte – es wird nur seine bereits exportierte
  // Funktionsreferenz zur Laufzeit ersetzt.
  // -------------------------------------------------------------------

  await check("Korrekturlauf – 8. die Fehlerdiagnose eines fehlgeschlagenen Codex-Laufs (Exit-Code, redigierte stderr-Kurzfassung, Signal, Timeout/Cancel) ist über die HTTP-API sichtbar", async () => {
    const originalDetectAvailability = codexAvailabilityAdapter.detectCodexAvailability;
    const originalRunReadOnly = codexReadOnlyAdapter.runCodexReadOnlyAnalysis;
    codexAvailabilityAdapter.detectCodexAvailability = () => ({
      available: true,
      authenticated: true,
      version: "codex-cli 0.0.0-test",
      authLabel: "ChatGPT",
      reason: null,
    });
    codexReadOnlyAdapter.runCodexReadOnlyAnalysis = async () => ({
      ok: false,
      cancelled: false,
      timedOut: false,
      resultText: null,
      errors: ["Codex-Prozess endete mit Exit-Code 1. stderr: Fehler beim Zugriff. api_key: [REDACTED] war ungültig."],
      reasonCode: "CODEX_PROCESS_EXIT_NONZERO",
      codexRawOutput: {
        exitCode: 1,
        signal: null,
        stdoutSample: "",
        stderrSample: "Fehler beim Zugriff. api_key: [REDACTED] war ungültig.",
        timedOutAtProcessLevel: false,
      },
    });
    try {
      const orderDiag = await invoke({
        method: "POST",
        url: "/api/pilot-work-order/orders",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: testOrderInput({ title: "Auftrag für Codex-Fehlerdiagnose über HTTP" }),
      });
      const diagOrderId = orderDiag.json.overview.order.id;
      await driveOrderToInExecutionViaHttp(diagOrderId, ownerSession);

      const approvalResult = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${diagOrderId}/request-codex-run-approval`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { presetId: "codex-analyze-pilot-structure" },
      });
      assert.strictEqual(approvalResult.statusCode, 200);

      const startResult = await invoke({
        method: "POST",
        url: `/api/pilot-work-order/orders/${diagOrderId}/start-agent-execution`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { presetId: "codex-analyze-pilot-structure", approvalToken: approvalResult.json.approvalToken },
      });
      assert.strictEqual(startResult.statusCode, 200);
      assert.strictEqual(startResult.json.agentExecutionRun.status, "FAILED");
      assert.ok(startResult.json.agentExecutionRun.errorMessage.includes("Exit-Code 1"));
      assert.ok(!startResult.json.agentExecutionRun.errorMessage.includes("api_key: sk-"), "kein Rohsecret im Fehlertext");
      assert.ok(startResult.json.agentExecutionRun.resultSummary, "resultSummary mit Diagnose muss über die API sichtbar sein");
      const diagnostics = startResult.json.agentExecutionRun.resultSummary.diagnostics;
      assert.strictEqual(diagnostics.exitCode, 1);
      assert.strictEqual(diagnostics.reasonCode, "CODEX_PROCESS_EXIT_NONZERO");
      assert.ok(diagnostics.stderrSample.includes("[REDACTED]"));
      assert.strictEqual(diagnostics.timedOut, false);
      assert.strictEqual(diagnostics.cancelled, false);
      assert.strictEqual(
        startResult.json.agentExecutionRun.resultSummary.diagnosticNotice,
        "Sichere technische Diagnose – möglicherweise gekürzt und redigiert.",
      );
      assert.ok(!JSON.stringify(startResult.json).includes("api_key: sk-"), "kein Rohsecret irgendwo in der HTTP-Antwort");

      // Dieselbe Diagnose muss auch über den lesenden Overview-Endpunkt
      // (GET), nicht nur in der Startantwort selbst, sichtbar bleiben.
      const overviewResult = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${diagOrderId}`, headers: authedJsonHeaders(ownerSession) });
      const runFromOverview = overviewResult.json.overview.agentExecutionRuns.find(
        (entry) => entry.id === startResult.json.agentExecutionRun.id,
      );
      assert.ok(runFromOverview);
      assert.strictEqual(runFromOverview.resultSummary.diagnostics.exitCode, 1);
      assert.strictEqual(runFromOverview.resultSummary.diagnostics.reasonCode, "CODEX_PROCESS_EXIT_NONZERO");
    } finally {
      codexAvailabilityAdapter.detectCodexAvailability = originalDetectAvailability;
      codexReadOnlyAdapter.runCodexReadOnlyAnalysis = originalRunReadOnly;
    }
  });

  await check("Audit-Ereignisse für den Agentenlauf sind eindeutig dem richtigen Auftrag zugeordnet (PILOT_AGENT_EXECUTION_RUN_STARTED/SUCCEEDED)", () => {
    const events = pilotAuditEventsFor(orderId);
    assert.ok(events.some((event) => event.eventType === "PILOT_AGENT_EXECUTION_RUN_STARTED"));
    assert.ok(events.some((event) => event.eventType === "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED"));
    events.forEach((event) => {
      const metadata = JSON.parse(event.metadata);
      assert.strictEqual(metadata.pilotOrderId, orderId);
    });
  });

  await check("keine Antwort dieses Prefixes enthält Passwort, Token, Cookie oder sensible Freitextfelder", async () => {
    const result = await invoke({ method: "GET", url: `/api/pilot-work-order/orders/${orderId}`, headers: authedJsonHeaders(ownerSession) });
    assert.strictEqual(jsonContainsSensitiveField(result.json), false);
  });

  await check("Health-Referenzdaten bleiben durch den gesamten Agentenlauf-Pilot über die API-Schicht unverändert", () => {
    const healthAfter = JSON.stringify(healthService.getOrCreateCanonicalRun(seedDb));
    assert.strictEqual(healthAfter, healthBaseline);
  });

  console.log(`pilot-agent-execution-api.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution-api.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
