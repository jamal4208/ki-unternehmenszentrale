"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { createHttpRouter, buildRouteMap, getMimeType, normalizeRequestPathname } = require("./server-http-router");
const { requestHandler } = require("./server");
const { API_SECURITY_FLAGS } = require("./project-registry");

// Alle HTTP-Aufrufe gegen den echten server.js in dieser Testdatei laufen mit
// einem isolierten HOME-Verzeichnis. Phase C (Execution Bridge) schreibt bei
// Erfolg unter ~/Library/Application Support/... – Tests dürfen dieses
// Verzeichnis auf der echten Maschine niemals berühren.
const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eb-router-test-home-"));
process.env.HOME = FAKE_HOME_DIR;

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

function invoke(handler, method, url) {
  return new Promise((resolve) => {
    let statusCode = null;
    let headers = null;
    let rawBody = "";
    handler(
      { method, url, headers: { host: "127.0.0.1" } },
      {
        writeHead(code, responseHeaders) {
          statusCode = code;
          headers = responseHeaders;
        },
        end(body = "") {
          rawBody += body;
          resolve({ statusCode, headers, body: rawBody });
        },
      },
    );
  });
}

function invokeJson(handler, method, url) {
  return invoke(handler, method, url).then((result) => ({
    ...result,
    json: result.body ? JSON.parse(result.body) : null,
  }));
}

function createTestRouter(overrides = {}) {
  const staticAssets = new Map([
    ["/", "index.html"],
    ["/app.js", "app.js"],
    ["/styles.css", "styles.css"],
  ]);
  const getRoutes = new Map([
    [
      "/api/test",
      (res) => {
        sendJson(res, 200, { ok: true, route: "test" });
      },
    ],
  ]);
  return createHttpRouter({
    getRoutes,
    staticAssets,
    rootDir: __dirname,
    sendJson,
    sendText,
    methodNotAllowedPayload: {
      ok: false,
      message: "Nur sichere GET-Endpunkte sind vorbereitet.",
      ...API_SECURITY_FLAGS,
    },
    ...overrides,
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function httpGet(port, targetPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: targetPath,
        method: "GET",
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body,
          });
        });
      },
    );
    request.on("error", reject);
  });
}

function httpRequest(port, method, targetPath, jsonBody) {
  return new Promise((resolve, reject) => {
    const data = jsonBody === undefined ? undefined : JSON.stringify(jsonBody);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: targetPath,
        method,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(data !== undefined
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) }
            : {}),
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body,
            json: body ? JSON.parse(body) : null,
          });
        });
      },
    );
    request.on("error", reject);
    if (data !== undefined) request.write(data);
    request.end();
  });
}

async function runTests() {
  check("Routermodul kann geladen werden", () => {
    assert.strictEqual(typeof createHttpRouter, "function");
    assert.strictEqual(typeof getMimeType, "function");
  });

  check("Pflichtabhängigkeiten werden validiert", () => {
    assert.throws(() => createHttpRouter({}), /Pflichtoption/);
    assert.throws(
      () =>
        createHttpRouter({
          getRoutes: new Map(),
          staticAssets: new Map(),
          rootDir: __dirname,
          sendJson,
          sendText,
        }),
      /methodNotAllowedPayload/,
    );
  });

  const router = createTestRouter();
  const registered = await invokeJson(router.requestHandler, "GET", "/api/test");
  check("genau registrierte GET-Route wird ausgeführt", () => {
    assert.strictEqual(registered.statusCode, 200);
    assert.strictEqual(registered.json.route, "test");
  });

  const unknownApi = await invoke(router.requestHandler, "GET", "/api/unknown");
  check("unbekannte GET-Route liefert 404", () => assert.strictEqual(unknownApi.statusCode, 404));

  const post = await invokeJson(router.requestHandler, "POST", "/api/test");
  check("POST liefert 405", () => assert.strictEqual(post.statusCode, 405));
  const put = await invokeJson(router.requestHandler, "PUT", "/api/test");
  check("PUT liefert 405", () => assert.strictEqual(put.statusCode, 405));
  const del = await invokeJson(router.requestHandler, "DELETE", "/api/test");
  check("DELETE liefert 405", () => assert.strictEqual(del.statusCode, 405));

  // -------------------------------------------------------------------
  // V7.2 Phase A Schritt 3 (Auftrag Abschnitt H) – POST-Prefix-Handler
  // (server-http-router.js#postRoutePrefixHandlers). Rein additiv: ein
  // Router ohne diese Option verhält sich unverändert (siehe obige
  // POST-405-Prüfungen mit dem Standard-Testrouter ohne diese Option).
  // -------------------------------------------------------------------

  const prefixPostRouter = createTestRouter({
    postRoutePrefixHandlers: [
      {
        prefix: "/api/owner-test/",
        handler: (res, context) => {
          sendJson(res, 200, { ok: true, remainder: context.pathname.slice("/api/owner-test/".length) });
        },
      },
    ],
  });

  check("createHttpRouter ohne postRoutePrefixHandlers registriert einen leeren Standardwert", () => {
    assert.strictEqual(router.getRegisteredPostRoutePrefixHandlerCount(), 0);
  });

  check("createHttpRouter zählt übergebene postRoutePrefixHandlers korrekt", () => {
    assert.strictEqual(prefixPostRouter.getRegisteredPostRoutePrefixHandlerCount(), 1);
  });

  const matchedPrefixPost = await invokeJson(
    prefixPostRouter.requestHandler,
    "POST",
    "/api/owner-test/kunde-x/aktivieren",
  );
  check("ein passender POST-Prefix-Handler wird ausgeführt", () => {
    assert.strictEqual(matchedPrefixPost.statusCode, 200);
    assert.strictEqual(matchedPrefixPost.json.remainder, "kunde-x/aktivieren");
  });

  const unmatchedPrefixPost = await invokeJson(prefixPostRouter.requestHandler, "POST", "/api/anderer-pfad");
  check("ein nicht passender POST-Pfad bleibt trotz konfigurierter Prefixe 405", () => {
    assert.strictEqual(unmatchedPrefixPost.statusCode, 405);
  });

  const html = await invoke(router.requestHandler, "GET", "/");
  check("bekannte statische Datei wird ausgeliefert", () => {
    assert.strictEqual(html.statusCode, 200);
    assert.ok(html.body.includes("<!DOCTYPE html>") || html.body.includes("<html"));
  });
  check("korrekter MIME-Type für HTML", () =>
    assert.strictEqual(html.headers["Content-Type"], "text/html; charset=utf-8"),
  );

  const js = await invoke(router.requestHandler, "GET", "/app.js");
  check("korrekter MIME-Type für JavaScript", () =>
    assert.strictEqual(js.headers["Content-Type"], "application/javascript; charset=utf-8"),
  );

  const css = await invoke(router.requestHandler, "GET", "/styles.css");
  check("korrekter MIME-Type für CSS", () =>
    assert.strictEqual(css.headers["Content-Type"], "text/css; charset=utf-8"),
  );

  const unknownStatic = await invoke(router.requestHandler, "GET", "/secret.js");
  check("unbekannte statische Datei wird nicht ausgeliefert", () =>
    assert.strictEqual(unknownStatic.statusCode, 404),
  );

  const envBlocked = await invoke(router.requestHandler, "GET", "/.env");
  check(".env wird blockiert", () => assert.strictEqual(envBlocked.statusCode, 404));

  const gitBlocked = await invoke(router.requestHandler, "GET", "/.git/config");
  check(".git-Pfad wird blockiert", () => assert.strictEqual(gitBlocked.statusCode, 404));

  const testFileBlocked = await invoke(router.requestHandler, "GET", "/daily-work-run.test.js");
  check("Testdateien werden nicht ausgeliefert", () => assert.strictEqual(testFileBlocked.statusCode, 404));

  const traversalBlocked = await invoke(router.requestHandler, "GET", "/../package.json");
  check("Pfad-Traversierung wird blockiert", () => assert.strictEqual(traversalBlocked.statusCode, 404));

  check("doppelte Route wird erkannt oder ausgeschlossen", () => {
    assert.throws(
      () =>
        buildRouteMap([
          ["/api/a", () => {}],
          ["/api/a", () => {}],
        ]),
      /doppelte Route/,
    );
  });

  const failingRouter = createTestRouter({
    getRoutes: new Map([
      [
        "/api/boom",
        () => {
          throw new Error("stack-secret-marker");
        },
      ],
    ]),
  });
  const internalError = await invokeJson(failingRouter.requestHandler, "GET", "/api/boom");
  check("Handlerfehler liefert kontrollierte 500-Antwort", () => {
    assert.strictEqual(internalError.statusCode, 500);
    assert.strictEqual(internalError.json.ok, false);
  });
  check("interne Stacktraces gelangen nicht in die Browserantwort", () => {
    assert.doesNotMatch(internalError.body, /stack-secret-marker/);
    assert.doesNotMatch(internalError.body, /at /);
  });

  const queryRouter = createTestRouter({
    getRoutes: new Map([
      [
        "/api/query",
        (res, context) => {
          sendJson(res, 200, { pathname: context.requestUrl.pathname, search: context.requestUrl.search });
        },
      ],
    ]),
  });
  const withQuery = await invokeJson(queryRouter.requestHandler, "GET", "/api/query?workRequest=test&projectId=abc");
  check("Queryparameter verändern das Routing nicht unkontrolliert", () => {
    assert.strictEqual(withQuery.statusCode, 200);
    assert.strictEqual(withQuery.json.pathname, "/api/query");
    assert.strictEqual(withQuery.json.search, "?workRequest=test&projectId=abc");
  });

  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const getRouteBlockMatch = serverSource.match(/const getRoutes = buildRouteMap\(\[([\s\S]*?)\n\]\);/);
  const routeCount = getRouteBlockMatch ? (getRouteBlockMatch[1].match(/^\s+\["\/api\//gm) || []).length : 0;
  check("bestehende 89 GET-Routen bleiben registriert (Phase C: +2 GET Execution-Status/-Ergebnis, Phase D: +1 GET Executor-Registry, Phase E: +1 GET Freeze-Status, V7.1 Phase A: +5 GET Dokumente/Tools/Plugin-Gateway/Tool-Routing/Backup-Export, V7.1 Phase B: +3 GET HeyGen-Status/Jobpakete/Backup-Export, V7.1 Phase B.1: +5 GET Agentur-Mandantenbasis/Pilot-Review/Backup-Export, V7.1 Phase C: +3 GET Canva-Status/Jobpakete/Backup-Export, V7.1 Phase C.1: +1 GET Pilot-Ergebnisakten-Liste, V7.2 Phase A Schritt 2: +1 GET Auth-Sessionstatus, V7.2 Phase A Schritt 3: +3 GET Owner-Mandantenliste/Kundenportal-Konto/-Status, V7.2 Phase B Schritt 1: +2 GET Kundenportal-/Owner-Arbeitsauftragsliste, V7.3 Jamal-Arbeitsmodus: +1 GET Jamal-Arbeitsmodus-Zustand, V7.4 Canva-Produktionskorridor: +1 GET Jamal-Canva-Produktionsstatus, V7.5 Agentenführung: +5 GET Führungsübersicht/Organisation/HR-Lauf/Technologie-Radar/Agent-Technology-Fit, Unternehmensleitlinien V1.0: +2 GET Leitlinien/Reliability-Signale, V7.6.1 Office & Finanzen: +9 GET, V7.6.3 Health-Referenzlauf: +1 GET)", () =>
    assert.strictEqual(routeCount, 89),
  );

  const postRouteBlockMatch = serverSource.match(/const postRoutes = buildRouteMap\(\[([\s\S]*?)\]\);/);
  const postRouteCount = postRouteBlockMatch
    ? (postRouteBlockMatch[1].match(/^\s+\["\/api\//gm) || []).length
    : 0;
  check("genau 52 additive POST-Routen sind registriert (Execution Bridge + V7.1 Phase A Dokumente/Backup + V7.1 Phase B HeyGen-Connector-Pilot + V7.1 Phase B.1 Kundenentwurf/Kostenpaket/Ergebnisrückführung/Agentur-Backup + V7.1 Phase C Canva-Connector-Pilot + V7.1 Phase C.1: +5 POST interne Prüfung/Kundenfeedback/Änderungsanforderung/Änderung erledigt/Kundenfreigabe der Pilot-Ergebnisakte + V7.1 Phase C.1.1: +3 POST Agenten-QS/menschliches Review/Eskalation + V7.2 Phase A Schritt 2: +5 POST Auth-Login/Logout/Reset-Anfrage/Reset-Bestätigung/Einladung + V7.2 Phase B Schritt 1: +1 POST Arbeitsauftrag anlegen; V7.5 Agentenführung: keine neue exakte POST-Route, alle Aktionen über den neuen POST-Prefix /api/agent-leadership/)", () =>
    assert.strictEqual(postRouteCount, 52),
  );

  const serverStatusGet = await invokeJson(requestHandler, "GET", "/api/server-status");
  check("GET /api/server-status liefert 200", () => assert.strictEqual(serverStatusGet.statusCode, 200));
  check("GET /api/server-status liefert sichere Grundfelder ohne Schreibaktionen", () => {
    assert.strictEqual(serverStatusGet.json.writeOperationsBlocked, true);
    assert.strictEqual(serverStatusGet.json.madeExternalRequest, false);
    assert.ok(["RUNNING", "VERSION_MISMATCH", "UNKNOWN"].includes(serverStatusGet.json.status));
    assert.ok(Number.isInteger(serverStatusGet.json.pid));
    assert.ok(typeof serverStatusGet.json.appVersion === "string" && serverStatusGet.json.appVersion.length > 0);
    assert.ok(!("projectRoot" in serverStatusGet.json));
    assert.ok(!JSON.stringify(serverStatusGet.json).includes(__dirname));
  });

  const serverStatusPost = await invokeJson(requestHandler, "POST", "/api/server-status");
  check("POST /api/server-status bleibt 405", () => assert.strictEqual(serverStatusPost.statusCode, 405));

  const freezeStatusGet = await invokeJson(requestHandler, "GET", "/api/v7-freeze-status");
  check("GET /api/v7-freeze-status liefert 200 mit sicheren Grundfeldern; FROZEN nur mit Jamals kanonischer Entscheidung", () => {
    assert.strictEqual(freezeStatusGet.statusCode, 200);
    assert.strictEqual(freezeStatusGet.json.writeOperationsBlocked, true);
    assert.strictEqual(freezeStatusGet.json.madeExternalRequest, false);
    assert.ok(["IN_REVIEW", "FREEZE_CANDIDATE", "FROZEN"].includes(freezeStatusGet.json.status));
    // V7.0 wurde durch Jamals ausdrückliche, im Quellcode hinterlegte
    // Entscheidung (v7-freeze-status.js#MANUAL_FREEZE_DECISION) offiziell auf
    // FROZEN gesetzt – nicht automatisch aus Git-Stand oder Testzahl.
    assert.strictEqual(freezeStatusGet.json.status, "FROZEN");
    assert.strictEqual(freezeStatusGet.json.version, "V7.0");
    assert.ok(Array.isArray(freezeStatusGet.json.phases) && freezeStatusGet.json.phases.length >= 4);
    assert.ok(Array.isArray(freezeStatusGet.json.openJamalSteps) && freezeStatusGet.json.openJamalSteps.length > 0);
    assert.ok(freezeStatusGet.json.manualFreezeDecision, "manuelle Freeze-Entscheidung ist im Payload sichtbar");
    assert.strictEqual(freezeStatusGet.json.manualFreezeDecision.decidedBy, "Jamal");
    assert.strictEqual(freezeStatusGet.json.manualFreezeDecision.decisionDate, "2026-07-25");
    assert.ok(/^[0-9a-f]{40}$/i.test(freezeStatusGet.json.manualFreezeDecision.baseCommit));
  });

  const freezeStatusPost = await invokeJson(requestHandler, "POST", "/api/v7-freeze-status");
  check("POST /api/v7-freeze-status bleibt 405 (read-only)", () => assert.strictEqual(freezeStatusPost.statusCode, 405));

  const controllerScriptAsset = await invoke(requestHandler, "GET", "/scripts/zentral-ctl.js");
  check("scripts/zentral-ctl.js wird nicht statisch ausgeliefert", () =>
    assert.strictEqual(controllerScriptAsset.statusCode, 404),
  );

  const serverStatusModuleAsset = await invoke(requestHandler, "GET", "/server-status.js");
  check("server-status.js wird nicht statisch ausgeliefert", () =>
    assert.strictEqual(serverStatusModuleAsset.statusCode, 404),
  );

  const serverStatusTestAsset = await invoke(requestHandler, "GET", "/server-status.test.js");
  check("server-status.test.js wird nicht statisch ausgeliefert", () =>
    assert.strictEqual(serverStatusTestAsset.statusCode, 404),
  );

  const zentralCtlTestAsset = await invoke(requestHandler, "GET", "/zentral-ctl.test.js");
  check("zentral-ctl.test.js wird nicht statisch ausgeliefert", () =>
    assert.strictEqual(zentralCtlTestAsset.statusCode, 404),
  );

  check("server.js kann selbst keine Prozesse starten (kein child_process)", () => {
    assert.doesNotMatch(serverSource, /require\(["']child_process["']\)/);
  });

  const postOnKnown = await invokeJson(requestHandler, "POST", "/api/projects");
  check("POST auf bestehende Route bleibt 405", () => assert.strictEqual(postOnKnown.statusCode, 405));

  const liveStatusGet = await invokeJson(requestHandler, "GET", "/api/projects/health-upgrade-kompass/live-status");
  check("Health live-status GET antwortet kontrolliert", () => {
    assert.strictEqual(liveStatusGet.statusCode, 200);
    assert.strictEqual(liveStatusGet.json.writeOperationsBlocked, true);
    assert.strictEqual(liveStatusGet.json.madeExternalRequest, false);
    assert.strictEqual(liveStatusGet.json.testExecutionStarted, false);
    assert.strictEqual(liveStatusGet.json.gitWriteStarted, false);
    assert.strictEqual(liveStatusGet.json.projectId, "health-upgrade-kompass");
  });

  const liveStatusPost = await invokeJson(requestHandler, "POST", "/api/projects/health-upgrade-kompass/live-status");
  check("POST auf Health live-status bleibt 405", () => assert.strictEqual(liveStatusPost.statusCode, 405));

  const hybridAsset = await invoke(requestHandler, "GET", "/health-hybrid-work.js");
  check("health-hybrid-work.js wird ausgeliefert", () => {
    assert.strictEqual(hybridAsset.statusCode, 200);
    assert.match(hybridAsset.body, /HealthHybridWork|createHealthExecutionPackage/);
  });

  const hybridTestAsset = await invoke(requestHandler, "GET", "/health-hybrid-work.test.js");
  check("Testdatei health-hybrid-work.test.js bleibt gesperrt", () => assert.strictEqual(hybridTestAsset.statusCode, 404));

  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  check("app.js enthält keine zweite Server-Routinglogik", () => {
    assert.doesNotMatch(appSource, /function requestHandler\(/);
    assert.doesNotMatch(appSource, /http\.createServer/);
    assert.doesNotMatch(appSource, /createHttpRouter/);
  });

  check("server.js enthält keine zweite aktive allgemeine Routerimplementierung", () => {
    assert.doesNotMatch(serverSource, /function serveStatic\(/);
    assert.doesNotMatch(serverSource, /function requestHandler\(/);
    assert.match(serverSource, /createHttpRouter\(/);
    assert.doesNotMatch(serverSource, /requestUrl\.pathname === "\/api\//);
  });

  // ---------------------------------------------------------------------
  // V7.0 Phase C – Execution Bridge API (localhost-only, Origin/Host-Prüfung,
  // application/json, kleine Größenbegrenzung, servergenerierte Tokens).
  // ---------------------------------------------------------------------

  function invokeJsonBody(handler, method, url, body, extraHeaders = {}) {
    return new Promise((resolve) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      let statusCode = null;
      let rawBody = "";
      handler(
        {
          method,
          url,
          headers: {
            host: "127.0.0.1",
            "content-type": "application/json",
            ...extraHeaders,
          },
          on(event, cb) {
            if (event === "data" && data !== undefined) cb(Buffer.from(data, "utf8"));
            if (event === "end") cb();
          },
        },
        {
          writeHead(code) {
            statusCode = code;
          },
          end(responseBody = "") {
            rawBody += responseBody;
            resolve({ statusCode, json: rawBody ? JSON.parse(rawBody) : null });
          },
        },
      );
    });
  }

  const prepareBadOrigin = await invokeJsonBody(
    requestHandler,
    "POST",
    "/api/execution/prepare",
    {},
    { origin: "http://evil.example.com" },
  );
  check("POST /api/execution/prepare mit fremdem Origin liefert 403", () =>
    assert.strictEqual(prepareBadOrigin.statusCode, 403),
  );

  const prepareBadContentType = await invokeJsonBody(requestHandler, "POST", "/api/execution/prepare", {}, {
    "content-type": "text/plain",
  });
  check("POST /api/execution/prepare mit falschem Content-Type liefert 415", () =>
    assert.strictEqual(prepareBadContentType.statusCode, 415),
  );

  const prepareUnknownField = await invokeJsonBody(requestHandler, "POST", "/api/execution/prepare", {
    runId: "r1",
    freeShellCommand: "rm -rf /",
  });
  check("POST /api/execution/prepare weist unbekannte Felder defensiv ab (400)", () => {
    assert.strictEqual(prepareUnknownField.statusCode, 400);
    assert.strictEqual(prepareUnknownField.json.ok, false);
    assert.strictEqual(prepareUnknownField.json.writeOperationsBlocked, false);
  });

  const prepareBadHost = await invokeJsonBody(
    requestHandler,
    "POST",
    "/api/execution/prepare",
    { runId: "r-host" },
    { host: "evil.example.com" },
  );
  // V7.2 Phase A Schritt 2: Das neue, vor jedem Handler laufende Auth-Gate
  // (Auftrag Abschnitt J) lehnt einen nicht-Loopback-Host für diese
  // OWNER_ONLY/DISABLED_IN_PROD-Route bereits VOR dem bisherigen
  // handler-internen isExecutionRequestOriginAllowed-Check ab – mit einer
  // generischen 404-Antwort statt 403, damit die Existenz der Chef-/
  // Execution-Route gegenüber einem fremden Host nicht bestätigt wird
  // (Auftrag Abschnitt E/K: "unklassifizierte/']fremde Route bleibt
  // geschlossen", HIDDEN_404). Der handler-interne 403-Pfad bleibt für
  // Anfragen von Loopback mit fremdem Origin weiterhin aktiv (siehe Test
  // "mit fremdem Origin liefert 403" oben).
  check("POST /api/execution/prepare mit fremdem Host liefert 404 (Auth-Gate greift vor dem Handler)", () =>
    assert.strictEqual(prepareBadHost.statusCode, 404),
  );

  const oversizedBody = "x".repeat(33 * 1024);
  const prepareTooLarge = await new Promise((resolve) => {
    let statusCode = null;
    let rawBody = "";
    requestHandler(
      {
        method: "POST",
        url: "/api/execution/prepare",
        headers: {
          host: "127.0.0.1",
          "content-type": "application/json",
        },
        on(event, cb) {
          if (event === "data") cb(Buffer.from(`{"pad":"${oversizedBody}"}`, "utf8"));
          if (event === "end") cb();
        },
        destroy() {},
      },
      {
        writeHead(code) {
          statusCode = code;
        },
        end(responseBody = "") {
          rawBody += responseBody;
          let json = null;
          try {
            json = rawBody ? JSON.parse(rawBody) : null;
          } catch (_error) {
            json = null;
          }
          resolve({ statusCode, json });
        },
      },
    );
  });
  check("POST /api/execution/prepare mit zu großem Body liefert 413", () =>
    assert.strictEqual(prepareTooLarge.statusCode, 413),
  );

  const prepareGetInstead = await invokeJson(requestHandler, "GET", "/api/execution/prepare");
  check("GET auf reine POST-Route /api/execution/prepare liefert 405 statt 404", () =>
    assert.strictEqual(prepareGetInstead.statusCode, 405),
  );

  const missingAttemptStatus = await invokeJson(
    requestHandler,
    "GET",
    "/api/execution/attempts/status?attemptId=att-unknown-000000000000",
  );
  check("GET /api/execution/attempts/status für unbekannten Attempt liefert 404", () =>
    assert.strictEqual(missingAttemptStatus.statusCode, 404),
  );

  const missingAttemptResult = await invokeJson(
    requestHandler,
    "GET",
    "/api/execution/attempts/result?attemptId=att-unknown-000000000000",
  );
  check("GET /api/execution/attempts/result für unbekannten Attempt liefert 404", () =>
    assert.strictEqual(missingAttemptResult.statusCode, 404),
  );

  const executionPostOnKnownGet = await invokeJson(requestHandler, "POST", "/api/execution/attempts/status");
  check("POST auf reine GET-Execution-Route bleibt 405", () =>
    assert.strictEqual(executionPostOnKnownGet.statusCode, 405),
  );

  check("server.js bindet den Execution-Server-Support nur über 127.0.0.1/localhost (keine CORS-Freigabe)", () => {
    assert.doesNotMatch(serverSource, /Access-Control-Allow-Origin/);
  });

  const integrationPort = await getFreePort();
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(integrationPort), HOME: FAKE_HOME_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Serverstart-Timeout")), 8000);
    serverProcess.stdout.on("data", (chunk) => {
      if (String(chunk).includes("local pilot server running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Serverprozess beendet mit Code ${code}`));
      }
    });
  });

  try {
    const home = await httpGet(integrationPort, "/");
    check("Integration: GET / liefert 200", () => assert.strictEqual(home.statusCode, 200));

    const appJs = await httpGet(integrationPort, "/app.js");
    check("Integration: GET /app.js liefert 200", () => assert.strictEqual(appJs.statusCode, 200));

    const dailyUi = await httpGet(integrationPort, "/daily-work-run-ui.js");
    check("Integration: GET /daily-work-run-ui.js liefert 200", () =>
      assert.strictEqual(dailyUi.statusCode, 200),
    );

    const agentRuntime = await httpGet(integrationPort, "/agent-runtime.js");
    check("Integration: GET /agent-runtime.js liefert 200", () =>
      assert.strictEqual(agentRuntime.statusCode, 200),
    );

    const runtimeTest = await httpGet(integrationPort, "/agent-runtime.test.js");
    check("Integration: Testdatei wird nicht ausgeliefert", () =>
      assert.strictEqual(runtimeTest.statusCode, 404),
    );

    const readmeBlocked = await httpGet(integrationPort, "/README.md");
    check("Integration: README.md wird nicht ausgeliefert", () =>
      assert.strictEqual(readmeBlocked.statusCode, 404),
    );

    const handbookBlocked = await httpGet(integrationPort, "/V1_BETRIEBSHANDBUCH.md");
    check("Integration: V1_BETRIEBSHANDBUCH.md wird nicht ausgeliefert", () =>
      assert.strictEqual(handbookBlocked.statusCode, 404),
    );

    const backupJs = await httpGet(integrationPort, "/local-data-backup.js");
    check("Integration: GET /local-data-backup.js liefert 200", () =>
      assert.strictEqual(backupJs.statusCode, 200),
    );

    const api = await httpGet(integrationPort, "/api/projects");
    check("Integration: bestehende API-Route liefert 200", () => assert.strictEqual(api.statusCode, 200));

    const missing = await httpGet(integrationPort, "/unbekannt-pfad");
    check("Integration: unbekannter Pfad liefert 404", () => assert.strictEqual(missing.statusCode, 404));

    const postIntegration = await httpRequest(integrationPort, "POST", "/api/projects");
    check("Integration: POST liefert 405", () => assert.strictEqual(postIntegration.statusCode, 405));

    const statusIntegration = await httpGet(integrationPort, "/api/server-status");
    check("Integration: GET /api/server-status liefert 200 mit passendem Port", () => {
      assert.strictEqual(statusIntegration.statusCode, 200);
      const payload = JSON.parse(statusIntegration.body);
      assert.strictEqual(payload.port, integrationPort);
      assert.strictEqual(payload.managedByController, false);
    });

    // Vollständiger Execution-Bridge-Rundlauf gegen den echten, laufenden
    // Serverprozess – ausschließlich gegen das Fixture-Projekt, isoliertes
    // HOME (FAKE_HOME_DIR), niemals gegen Health.
    const runId = "run-router-integration";
    const prepared = await httpRequest(integrationPort, "POST", "/api/execution/prepare", {
      runId,
      executionPackage: {
        executionPackageId: "ep-router-integration",
        executionPackageFingerprint: "fp-router-integration",
        projectId: "execution-bridge-fixture",
        allowedFiles: ["FIXTURE_NOTE.md"],
        forbiddenPaths: [],
      },
    });
    check("Integration: POST /api/execution/prepare liefert PREPARED", () => {
      assert.strictEqual(prepared.statusCode, 200);
      assert.strictEqual(prepared.json.status, "PREPARED");
      assert.ok(typeof prepared.json.startToken === "string" && prepared.json.startToken.length > 0);
    });

    const started = await httpRequest(integrationPort, "POST", "/api/execution/attempts/start", {
      token: prepared.json.startToken,
      runId,
      executionPackageId: "ep-router-integration",
      executionPackageFingerprint: "fp-router-integration",
      attemptId: prepared.json.attemptId,
      scenario: "SUCCESS",
      approved: true,
    });
    check("Integration: POST /api/execution/attempts/start liefert RUNNING", () => {
      assert.strictEqual(started.statusCode, 200);
      assert.strictEqual(started.json.status, "RUNNING");
    });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const attemptStatus = await httpGet(integrationPort, `/api/execution/attempts/status?attemptId=${prepared.json.attemptId}`);
    check("Integration: GET /api/execution/attempts/status zeigt SUCCEEDED", () => {
      const payload = JSON.parse(attemptStatus.body);
      assert.strictEqual(attemptStatus.statusCode, 200);
      assert.strictEqual(payload.status, "SUCCEEDED");
    });

    const attemptResult = await httpGet(integrationPort, `/api/execution/attempts/result?attemptId=${prepared.json.attemptId}`);
    check("Integration: GET /api/execution/attempts/result liefert strukturierte Evidenz ohne Fachbestätigung", () => {
      const payload = JSON.parse(attemptResult.body);
      assert.strictEqual(attemptResult.statusCode, 200);
      assert.deepStrictEqual(payload.changedFiles, ["FIXTURE_NOTE.md"]);
      assert.strictEqual(payload.testStatus, "PASSED");
      assert.ok(!("ACCEPTED" in payload));
    });

    const applyPreview = await httpRequest(integrationPort, "POST", "/api/execution/apply", {
      runId,
      executionPackageId: "ep-router-integration",
      executionPackageFingerprint: "fp-router-integration",
      attemptId: prepared.json.attemptId,
    });
    check("Integration: POST /api/execution/apply ohne Token liefert Review-Vorschau", () => {
      assert.strictEqual(applyPreview.statusCode, 200);
      assert.deepStrictEqual(applyPreview.json.preview.changedFiles, ["FIXTURE_NOTE.md"]);
      assert.ok(typeof applyPreview.json.applyToken === "string" && applyPreview.json.applyToken.length > 0);
    });

    const applyConfirmed = await httpRequest(integrationPort, "POST", "/api/execution/apply", {
      token: applyPreview.json.applyToken,
      runId,
      executionPackageId: "ep-router-integration",
      executionPackageFingerprint: "fp-router-integration",
      attemptId: prepared.json.attemptId,
      approved: true,
    });
    check("Integration: POST /api/execution/apply mit Token übernimmt in Fixture-Repo (APPLIED)", () => {
      assert.strictEqual(applyConfirmed.statusCode, 200);
      assert.strictEqual(applyConfirmed.json.applyStatus, "APPLIED");
    });

    const applyTokenReuse = await httpRequest(integrationPort, "POST", "/api/execution/apply", {
      token: applyPreview.json.applyToken,
      runId,
      executionPackageId: "ep-router-integration",
      executionPackageFingerprint: "fp-router-integration",
      attemptId: prepared.json.attemptId,
      approved: true,
    });
    check("Integration: Apply-Token ist einmalig (Zweitnutzung liefert 400)", () =>
      assert.strictEqual(applyTokenReuse.statusCode, 400),
    );
  } finally {
    serverProcess.kill("SIGTERM");
  }

  check("normalizeRequestPathname blockiert Traversal", () => {
    assert.strictEqual(normalizeRequestPathname("/../secret"), null);
    assert.strictEqual(normalizeRequestPathname("/safe/path"), "/safe/path");
  });

  try {
    fs.rmSync(FAKE_HOME_DIR, { recursive: true, force: true });
  } catch (_error) {
    /* best effort cleanup */
  }

  assert.strictEqual(passed, 73);
  console.log("server-http-router.test.js: 73 Prüfpunkte erfolgreich");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
