"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const net = require("net");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "v71-routes-test-home-"));
process.env.HOME = FAKE_HOME_DIR;

const { requestHandler } = require("./server");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
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

function httpRequest(port, method, targetPath, jsonBody, extraHeaders = {}) {
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
          ...extraHeaders,
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch (_error) {
            json = null;
          }
          resolve({ statusCode: response.statusCode, headers: response.headers, body, json });
        });
      },
    );
    request.on("error", reject);
    if (data !== undefined) request.write(data);
    request.end();
  });
}

async function runTests() {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // 70. GET-Routen
    await check("GET-Routen liefern die neuen V7.1-Register (Dokumente/Tools/Plugins)", async () => {
      const documents = await httpRequest(port, "GET", "/api/v71/documents");
      const tools = await httpRequest(port, "GET", "/api/v71/tools");
      const plugins = await httpRequest(port, "GET", "/api/v71/plugin-gateway");
      assert.strictEqual(documents.statusCode, 200);
      assert.strictEqual(documents.json.ok, true);
      assert.strictEqual(tools.statusCode, 200);
      assert.ok(tools.json.toolCount > 0);
      assert.strictEqual(plugins.statusCode, 200);
      assert.ok(plugins.json.pluginCount > 0);
    });

    // 71. POST-Schutz
    await check("POST-Schutz: unbekannte Felder werden abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/documents/register", {
        projectId: "ki-unternehmenszentrale",
        title: "x",
        sourceType: "MANUAL_NOTE",
        note: "x",
        unbekanntesFeld: "sollte abgelehnt werden",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    // 72. Host/Origin
    await check("Host/Origin-Prüfung blockiert fremde Origin", async () => {
      const response = await httpRequest(
        port,
        "GET",
        "/api/v71/tools",
        undefined,
        { origin: "https://evil.example.com" },
      );
      assert.strictEqual(response.statusCode, 403);
    });

    // 73. Content-Type
    await check("Content-Type-Prüfung: falscher Content-Type wird abgewiesen", async () => {
      const response = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ projectId: "ki-unternehmenszentrale", title: "x", sourceType: "MANUAL_NOTE", note: "x" });
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/v71/documents/register",
            method: "POST",
            headers: { host: `127.0.0.1:${port}`, "content-type": "text/plain", "content-length": Buffer.byteLength(body) },
          },
          (res) => {
            let raw = "";
            res.on("data", (chunk) => (raw += chunk));
            res.on("end", () => resolve({ statusCode: res.statusCode, body: raw }));
          },
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });
      assert.strictEqual(response.statusCode, 415);
    });

    // 74. Bodylimit
    // In-Prozess-Aufruf mit einem Fake-req-Objekt (statt echtem Socket): Der
    // reale Größenlimit-Pfad ruft req.destroy() auf, was bei einem echten
    // TCP-Socket die Verbindung vor Antwortversand kappen würde (siehe
    // server-http-router.test.js für dasselbe etablierte Testmuster).
    await check("Bodygrößenlimit wird durchgesetzt", async () => {
      const hugeNote = "a".repeat(80 * 1024);
      const payload = JSON.stringify({ projectId: "ki-unternehmenszentrale", title: "x", sourceType: "MANUAL_NOTE", note: hugeNote });
      const result = await new Promise((resolve) => {
        let statusCode = null;
        let rawBody = "";
        requestHandler(
          {
            method: "POST",
            url: "/api/v71/documents/register",
            headers: { host: "127.0.0.1", "content-type": "application/json" },
            on(event, cb) {
              if (event === "data") cb(Buffer.from(payload, "utf8"));
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
              resolve({ statusCode, body: rawBody });
            },
          },
        );
      });
      assert.strictEqual(result.statusCode, 413);
    });

    // 75. keine Stacktraces
    await check("keine Stacktraces in Fehlermeldungen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/documents/register", {
        projectId: "nicht-vorhanden",
        title: "x",
        sourceType: "MANUAL_NOTE",
        note: "x",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.ok(!/at Object\.|at Module\.|\.js:\d+:\d+/.test(response.body));
    });

    // Funktionale Zusatzprüfung: gültige Registrierung und Abruf per ID
    await check("Dokument registrieren und per GET abrufen funktioniert Ende-zu-Ende", async () => {
      const registerResponse = await httpRequest(port, "POST", "/api/v71/documents/register", {
        projectId: "ki-unternehmenszentrale",
        title: "API-Test-Dokument",
        sourceType: "MANUAL_NOTE",
        note: "Ende-zu-Ende-Testnotiz",
      });
      assert.strictEqual(registerResponse.statusCode, 200);
      assert.strictEqual(registerResponse.json.ok, true);
      const documentId = registerResponse.json.document.documentId;
      const getResponse = await httpRequest(port, "GET", `/api/v71/documents/${documentId}`);
      assert.strictEqual(getResponse.statusCode, 200);
      assert.strictEqual(getResponse.json.document.documentId, documentId);
    });

    await check("Tool-Routing-Route liefert deterministisches Ergebnis über HTTP", async () => {
      const response = await httpRequest(
        port,
        "GET",
        "/api/v71/tool-routing?projectId=ki-unternehmenszentrale&dataClassification=NORMAL",
      );
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(typeof response.json.ok, "boolean");
      assert.ok(Array.isArray(response.json.reasoning));
    });

    await check("Backup-Export-Route liefert V7.1-Metadaten ohne Originaldateien", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/backup/export");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.exportFormatVersion, "v71-phase-a-metadata-1");
      assert.ok(!/originalContent|fileBuffer/.test(response.body));
    });

    await check("Keine Route für produktive Canva/HeyGen/Shopify-Aktionen oder Löschung existiert", () => {
      const forbiddenPaths = [
        "/api/v71/canva/generate",
        "/api/v71/heygen/render",
        "/api/v71/shopify/create-product",
        "/api/v71/documents/delete",
      ];
      const fs2 = require("fs");
      const source = fs2.readFileSync(path.join(__dirname, "server.js"), "utf8");
      forbiddenPaths.forEach((forbidden) => assert.ok(!source.includes(`"${forbidden}"`)));
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`server-v71-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
