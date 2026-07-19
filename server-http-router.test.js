"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { createHttpRouter, buildRouteMap, getMimeType, normalizeRequestPathname } = require("./server-http-router");
const { requestHandler } = require("./server");
const { API_SECURITY_FLAGS } = require("./project-registry");

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

function httpRequest(port, method, targetPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: targetPath,
        method,
        headers: { host: `127.0.0.1:${port}` },
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
  const routeCount = (serverSource.match(/^\s+\["\/api\//gm) || []).length;
  check("bestehende 41 GET-Routen bleiben registriert", () => assert.strictEqual(routeCount, 41));

  const postOnKnown = await invokeJson(requestHandler, "POST", "/api/projects");
  check("POST auf bestehende Route bleibt 405", () => assert.strictEqual(postOnKnown.statusCode, 405));

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

  const integrationPort = await getFreePort();
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(integrationPort) },
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
  } finally {
    serverProcess.kill("SIGTERM");
  }

  check("normalizeRequestPathname blockiert Traversal", () => {
    assert.strictEqual(normalizeRequestPathname("/../secret"), null);
    assert.strictEqual(normalizeRequestPathname("/safe/path"), "/safe/path");
  });

  assert.strictEqual(passed, 36);
  console.log("server-http-router.test.js: 36 Prüfpunkte erfolgreich");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
