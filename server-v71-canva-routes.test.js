"use strict";

// V7.1 Phase C – End-to-End-Tests für die additiven Canva-Connector-Routen
// (Auftrag Abschnitt J/P, Pflichttests 37-100 über HTTP). Läuft mit
// isoliertem HOME-Verzeichnis (wie server-v71-heygen-routes.test.js) –
// niemals gegen das echte Application-Support-Verzeichnis.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "v71-canva-routes-test-home-"));
process.env.HOME = FAKE_HOME_DIR;

const { requestHandler } = require("./server");
// Ausschließlich für die gezielte Simulation eines später ehrlich
// erreichbaren Zustands (siehe Kundenentwurfs-Tests unten) – kein
// zusätzlicher Netzwerk- oder Ausführungspfad, derselbe isolierte,
// dateisystembasierte Store, den server.js ohnehin verwendet.
const canvaStoreModule = require("./canva-store");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
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

function validPreparePayload(overrides = {}) {
  return {
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "Sonntagsfrühstück im Test-Café",
    brief: "Ein freundlicher Instagram-Post für unser fiktives Test-Café am Sonntag.",
    primaryMessage: "Sonntagsfrühstück ab 9 Uhr – kommen Sie vorbei!",
    dataClassification: "NORMAL",
    assetRightsConfirmed: true,
    brandRightsConfirmed: true,
    costPackageStatus: "NOT_BILLABLE_TEST",
    ...overrides,
  };
}

async function runTests() {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    await check("GET /api/v71/canva/status liefert kontrollierten Pilotstatus, niemals DIRECT/autonom", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/status");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.pilotStatus.directOrAutonomousConnection, false);
      assert.notStrictEqual(response.json.pilotStatus.pilotExecutionMode, "DIRECT");
      assert.strictEqual(response.json.noApiKeyStored, true);
      assert.strictEqual(response.json.noAutomaticExecution, true);
      assert.strictEqual(response.json.pilotStatus.baseConnectionStatus, "NOT_CONNECTED");
      assert.strictEqual(response.json.pilotStatus.baseExecutionMode, "RECOMMENDATION_ONLY");
    });

    // 89. Host/Origin.
    await check("89. Host/Origin-Prüfung blockiert fremde Origin auf Canva-Status", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/status", undefined, {
        origin: "https://evil.example.com",
      });
      assert.strictEqual(response.statusCode, 403);
    });

    // 90. Content-Type.
    await check("90. Content-Type-Prüfung: falscher Content-Type wird abgewiesen", async () => {
      const response = await new Promise((resolve, reject) => {
        const body = JSON.stringify(validPreparePayload());
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/v71/canva/job-package/prepare",
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

    // 91. Bodylimit.
    await check("91. Bodygrößenlimit wird auf Canva-Prepare durchgesetzt", async () => {
      const hugeBrief = "a".repeat(80 * 1024);
      const payload = JSON.stringify(validPreparePayload({ brief: hugeBrief }));
      const result = await new Promise((resolve) => {
        let statusCode = null;
        let rawBody = "";
        requestHandler(
          {
            method: "POST",
            url: "/api/v71/canva/job-package/prepare",
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

    // 92. keine Stacktraces.
    await check("92. keine Stacktraces in Canva-Fehlermeldungen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/prepare", validPreparePayload({ projectId: "nicht-vorhanden" }));
      assert.strictEqual(response.statusCode, 400);
      assert.ok(!/at Object\.|at Module\.|\.js:\d+:\d+/.test(response.body));
    });

    // unbekannte/Credential-Felder.
    await check("unbekannte/Credential-Felder werden auf Canva-Prepare abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/prepare", {
        ...validPreparePayload(),
        apiKey: "sk-should-be-rejected",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    // 22/23. SENSITIVE/SECRET blockiert bereits bei validate (Inhalt).
    await check("22. SENSITIVE-Datenklassifizierung wird bei der Inhaltsprüfung blockiert", async () => {
      const prepareResponse = await httpRequest(port, "POST", "/api/v71/canva/job-package/prepare", validPreparePayload({ dataClassification: "SENSITIVE" }));
      assert.strictEqual(prepareResponse.statusCode, 200);
      const validateResponse = await httpRequest(port, "POST", "/api/v71/canva/job-package/validate", {
        jobPackageId: prepareResponse.json.package.jobPackageId,
      });
      assert.strictEqual(validateResponse.statusCode, 200);
      assert.strictEqual(validateResponse.json.ok, false);
      assert.strictEqual(validateResponse.json.package.status, "BLOCKED");
    });

    // Vollständiger, getrennter Freigabe-Rundlauf (Abschnitt F): prepare ->
    // validate -> approve-briefing -> approve-assets-and-rights ->
    // approve-external-transfer -> approve-cost -> handoff/request-token ->
    // handoff/prepare (GENERATE_DESIGN_CANDIDATES).
    let jobPackageId;
    await check("gültiges Jobpaket wird vorbereitet (DRAFT) und persistiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/prepare", validPreparePayload());
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.package.status, "DRAFT");
      assert.strictEqual(response.json.package.externalTransferApproved, false);
      assert.strictEqual(response.json.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
      jobPackageId = response.json.package.jobPackageId;
      assert.ok(jobPackageId);
    });

    await check("GET /api/v71/canva/job-packages listet das vorbereitete Paket", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/job-packages");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.jobPackages.some((entry) => entry.jobPackageId === jobPackageId));
    });

    await check("GET /api/v71/canva/job-packages/:id liefert Paket inklusive Handoff-Bereitschaft", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.jobPackageId, jobPackageId);
      assert.strictEqual(response.json.readiness.ready, false);
      assert.ok(response.json.readiness.missing.length > 0);
    });

    await check("GET /api/v71/canva/job-packages/:id liefert 404 für unbekannte ID", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/job-packages/unbekannt-123");
      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.json.ok, false);
    });

    await check("Inhaltsprüfung setzt Status auf READY_FOR_REVIEW", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/validate", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.package.status, "READY_FOR_REVIEW");
    });

    await check("Handoff-Token wird ohne Freigaben verweigert (nur Inhalt geprüft)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/request-token", {
        jobPackageId,
        providerOperation: "GENERATE_DESIGN_CANDIDATES",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, false);
      assert.ok(response.json.missing.includes("Briefing freigeben"));
      assert.strictEqual(response.json.noAutomaticExecution, true);
    });

    // getrennte Freigabestufen (Abschnitt F): vier getrennte HTTP-Aufrufe.
    await check("Briefing wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-briefing", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.briefingApproved, true);
      assert.strictEqual(response.json.package.assetsAndRightsApproved, false);
    });

    await check("Assets und Rechte werden getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-assets-and-rights", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.assetsAndRightsApproved, true);
      assert.strictEqual(response.json.package.externalTransferApproved, false);
    });

    await check("externe Übertragung wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-external-transfer", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.externalTransferApproved, true);
      assert.strictEqual(response.json.package.internalCostApprovalStatus, "UNKNOWN");
    });

    // 30. Kostenfreigabe fehlt blockiert.
    await check("30. Handoff-Token bleibt ohne Kostenfreigabe verweigert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/request-token", {
        jobPackageId,
        providerOperation: "GENERATE_DESIGN_CANDIDATES",
      });
      assert.strictEqual(response.json.ok, false);
      assert.ok(response.json.missing.includes("Kostenrahmen bestätigen"));
    });

    await check("Kostenrahmen wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-cost", {
        jobPackageId,
        internalCostApprovalStatus: "WITHIN_APPROVED_LIMIT",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.internalCostApprovalStatus, "WITHIN_APPROVED_LIMIT");
      assert.strictEqual(response.json.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
    });

    let handoffToken;
    await check("Handoff-Token wird nach vollständigen Freigaben ausgestellt (GENERATE_DESIGN_CANDIDATES)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/request-token", {
        jobPackageId,
        providerOperation: "GENERATE_DESIGN_CANDIDATES",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(response.json.token);
      assert.strictEqual(response.json.noAutomaticExecution, true);
      handoffToken = response.json.token;
    });

    let handoffPayload;
    await check("Handoff-Payload wird erzeugt, keine Ausführung/Netzwerk/Kosten/Veröffentlichung", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/prepare", {
        jobPackageId,
        providerOperation: "GENERATE_DESIGN_CANDIDATES",
        token: handoffToken,
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.executionStarted, false);
      assert.strictEqual(response.json.externalNetworkCallMade, false);
      assert.strictEqual(response.json.costIncurred, false);
      assert.strictEqual(response.json.publicationTriggered, false);
      assert.strictEqual(response.json.package.status, "HANDED_OFF");
      handoffPayload = response.json.payload;
      assert.strictEqual(handoffPayload.jobPackageId, jobPackageId);
      assert.ok(!("dataClassification" in handoffPayload), "Governance-Feld darf nicht im Handoff-Payload sein");
      assert.ok(!JSON.stringify(handoffPayload).includes(os.homedir()), "kein absoluter lokaler Pfad im Payload");
    });

    // 48. Token-Reuse wird blockiert.
    await check("48. Token-Wiederverwendung wird blockiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/prepare", {
        jobPackageId,
        providerOperation: "GENERATE_DESIGN_CANDIDATES",
        token: handoffToken,
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    await check("Paket zeigt nach Handoff Status HANDED_OFF beim Abruf", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.status, "HANDED_OFF");
    });

    // Kandidatenlogik (Abschnitt H) über HTTP: Ergebnis mit Kandidaten ->
    // Kandidatenauswahl-Token -> Auswahl freigeben -> CREATE_SELECTED_CANDIDATE.
    let candidatesResultToken;
    await check("51. Provider-Job-ID allein ist kein Erfolg: Ergebnis-Token erfordert vollständige Kandidatenstruktur", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/result/request-token", {
        jobPackageId,
        providerJobId: "provider-job-candidates-1",
        resultCandidate: {
          jobPackageId,
          providerJobId: "provider-job-candidates-1",
          providerOperation: "GENERATE_DESIGN_CANDIDATES",
          providerStatus: "CANDIDATES_READY",
          candidateIds: ["cand-1", "cand-2", "cand-3"],
        },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      candidatesResultToken = response.json.token;
    });

    await check("52. Kandidatenergebnis wird validiert und persistiert (Kandidatenliste erforderlich)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/result/validate", {
        token: candidatesResultToken,
        result: {
          jobPackageId,
          providerJobId: "provider-job-candidates-1",
          providerOperation: "GENERATE_DESIGN_CANDIDATES",
          providerStatus: "CANDIDATES_READY",
          candidateIds: ["cand-1", "cand-2", "cand-3"],
        },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.result.locallyVerifiedSuccess, true);
      assert.strictEqual(response.json.result.publicationApproved, false);
    });

    await check("Paket zeigt nach Kandidatenergebnis Status CANDIDATES_READY beim Abruf", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.status, "CANDIDATES_READY");
      assert.ok(response.json.result);
      assert.deepStrictEqual(response.json.result.candidateIds, ["cand-1", "cand-2", "cand-3"]);
    });

    // 55. unbekannter Kandidat blockiert.
    await check("55. unbekannter Kandidat blockiert die Kandidatenauswahl-Tokenanfrage", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/candidate/request-token", {
        jobPackageId,
        candidateId: "cand-unbekannt",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    let candidateApprovalToken;
    await check("54. Designkandidat-Auswahl-Token wird angefordert (getrennt von der Generierung)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/candidate/request-token", {
        jobPackageId,
        candidateId: "cand-2",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(response.json.token);
      candidateApprovalToken = response.json.token;
    });

    await check("53/56. Kandidatenauswahl wird freigegeben, Mandantenbindung bleibt erhalten", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/candidate/approve", {
        jobPackageId,
        candidateId: "cand-2",
        token: candidateApprovalToken,
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.selectedCandidateId, "cand-2");
      assert.strictEqual(response.json.package.customerId, "test-customer-fiktives-cafe");
    });

    // 57. CREATE_SELECTED_CANDIDATE erst nach Auswahlfreigabe (jetzt erfüllt).
    let createCandidateToken;
    await check("57. Handoff-Token für CREATE_SELECTED_CANDIDATE wird erst nach Kandidatenauswahl ausgestellt", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/request-token", {
        jobPackageId,
        providerOperation: "CREATE_SELECTED_CANDIDATE",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      createCandidateToken = response.json.token;
    });

    await check("Handoff-Payload für CREATE_SELECTED_CANDIDATE enthält die Kandidatenauswahl", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/handoff/prepare", {
        jobPackageId,
        providerOperation: "CREATE_SELECTED_CANDIDATE",
        token: createCandidateToken,
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.payload.selectedCandidateId, "cand-2");
      assert.strictEqual(response.json.package.status, "HANDED_OFF");
    });

    // Design-Ergebnis (SAVED) über HTTP; Candidate-ID ist keine Design-ID.
    // Der Ergebnis-Token ist an den exakten Ergebnisinhalt (Fingerprint)
    // gebunden; für die designId===candidateId-Ablehnung wird daher ein
    // eigener, dazu passender Token angefordert (kein Wiederverwenden eines
    // Tokens für einen anderen Ergebnisinhalt).
    await check("53. Candidate-ID ist keine Design-ID: designId identisch zu candidateId wird abgewiesen", async () => {
      const badResultCandidate = {
        jobPackageId,
        providerJobId: "provider-job-design-1",
        providerOperation: "CREATE_SELECTED_CANDIDATE",
        providerStatus: "SAVED",
        designId: "cand-2",
        candidateIds: ["cand-1", "cand-2", "cand-3"],
      };
      const tokenResponse = await httpRequest(port, "POST", "/api/v71/canva/result/request-token", {
        jobPackageId,
        providerJobId: "provider-job-design-1",
        resultCandidate: badResultCandidate,
      });
      assert.strictEqual(tokenResponse.statusCode, 200);
      const badResponse = await httpRequest(port, "POST", "/api/v71/canva/result/validate", {
        token: tokenResponse.json.token,
        result: badResultCandidate,
      });
      assert.strictEqual(badResponse.statusCode, 200);
      assert.strictEqual(badResponse.json.ok, false);
      assert.ok(badResponse.json.reasons.some((reason) => /Candidate-ID ist keine Design-ID/.test(reason)));
    });

    let secondDesignResultToken;
    await check("gültiges Design-Ergebnis (SAVED) wird validiert und persistiert", async () => {
      const tokenResponse = await httpRequest(port, "POST", "/api/v71/canva/result/request-token", {
        jobPackageId,
        providerJobId: "provider-job-design-2",
        resultCandidate: {
          jobPackageId,
          providerJobId: "provider-job-design-2",
          providerOperation: "CREATE_SELECTED_CANDIDATE",
          providerStatus: "SAVED",
          designId: "design-final-1",
          candidateIds: ["cand-1", "cand-2", "cand-3"],
        },
      });
      secondDesignResultToken = tokenResponse.json.token;
      const response = await httpRequest(port, "POST", "/api/v71/canva/result/validate", {
        token: secondDesignResultToken,
        result: {
          jobPackageId,
          providerJobId: "provider-job-design-2",
          providerOperation: "CREATE_SELECTED_CANDIDATE",
          providerStatus: "SAVED",
          designId: "design-final-1",
          candidateIds: ["cand-1", "cand-2", "cand-3"],
        },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.result.designId, "design-final-1");
      assert.strictEqual(response.json.result.publicationApproved, false);
      assert.strictEqual(response.json.result.jamalAcceptanceStatus, "PENDING");
    });

    await check("Paket zeigt nach gespeichertem Design-Ergebnis Status SAVED (nicht veröffentlicht)", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.status, "SAVED");
      assert.strictEqual(response.json.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
    });

    // Backup-Export/Restore-Vorschau über HTTP (Abschnitt O).
    await check("Backup-Export-Route liefert Canva-Metadaten ohne Bilder/Tokens/Credentials", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/backup/export");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.backupFormatVersion, "canva-phase-c-backup-1");
      assert.ok(response.json.jobPackages.length >= 1);
      assert.ok(!/"apiKey"\s*:|"token"\s*:|imageBuffer|videoBuffer/i.test(response.body));
    });

    await check("Restore-Vorschau-Route startet keine Generierung und schreibt nichts", async () => {
      const exportResponse = await httpRequest(port, "GET", "/api/v71/canva/backup/export");
      const { ok: _ok, writeOperationsBlocked: _w, madeExternalRequest: _m, ...exportBody } = exportResponse.json;
      const response = await httpRequest(port, "POST", "/api/v71/canva/backup/restore-preview", exportBody);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.startedGeneration, false);
      assert.strictEqual(response.json.createdDesign, false);
      assert.strictEqual(response.json.publishedAnything, false);
      assert.strictEqual(response.json.writesAppliedToLiveStore, false);
    });

    // Forbidden actions / no route for productive execution (Abschnitt L).
    await check("Keine Route für API-Key-Speicherung, Login, Löschung, Kauf, Einladung oder Veröffentlichung existiert", () => {
      const forbiddenPaths = [
        "/api/v71/canva/api-key",
        "/api/v71/canva/login",
        "/api/v71/canva/design/delete",
        "/api/v71/canva/credits/purchase",
        "/api/v71/canva/plan/upgrade",
        "/api/v71/canva/publish",
        "/api/v71/canva/share",
        "/api/v71/canva/invite",
        "/api/v71/canva/fetch-url",
      ];
      const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      forbiddenPaths.forEach((forbidden) => assert.ok(!source.includes(`"${forbidden}"`)));
    });

    await check("server.js enthält keinen direkten HTTP/HTTPS-Aufruf innerhalb der Canva-Handler", () => {
      const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const canvaSectionMatch = source.match(/V7\.1 Phase C – Canva als zweiter[\s\S]*?const getRoutes = buildRouteMap/);
      assert.ok(canvaSectionMatch);
      assert.ok(!/https\.request\(|http\.request\(/.test(canvaSectionMatch[0]));
    });

    // 94. kompakte, begrenzte Textfelder (Datengrundlage für Mobile).
    await check("94. API-Antworten liefern kompakte, begrenzte Textfelder (keine Textwand als Datengrundlage)", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/status");
      const text = JSON.stringify(response.json.capabilityProfile);
      assert.ok(text.length < 6000, "Capability-Profil bleibt kompakt genug für mobile Darstellung");
    });

    // -------------------------------------------------------------------
    // Mandantentrennung (Abschnitt D/P 8-17) über HTTP mit zweitem Testkunden.
    // -------------------------------------------------------------------

    let secondCustomerJobPackageId;
    await check("Jobpaket für zweiten Testmandanten wird vorbereitet", async () => {
      const response = await httpRequest(
        port,
        "POST",
        "/api/v71/canva/job-package/prepare",
        validPreparePayload({
          projectId: "marketing-agentur-os",
          customerId: "test-customer-fiktives-fitnessstudio",
          brandId: "test-brand-fiktives-fitnessstudio",
          campaignId: "test-campaign-fiktives-fitnessstudio-demo",
        }),
      );
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      secondCustomerJobPackageId = response.json.package.jobPackageId;
    });

    await check("16/60. GET job-packages?customerId=... liefert nur Datensätze desselben Kunden", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/job-packages?customerId=test-customer-fiktives-cafe");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.jobPackages.every((pkg) => pkg.customerId === "test-customer-fiktives-cafe"));
      assert.ok(!response.json.jobPackages.some((pkg) => pkg.jobPackageId === secondCustomerJobPackageId));
    });

    await check("93. Mandantenmismatch auf Job-by-id blockiert (404 statt 403, kein Preisgeben der Existenz)", async () => {
      const response = await httpRequest(
        port,
        "GET",
        `/api/v71/canva/job-packages/${secondCustomerJobPackageId}?customerId=test-customer-fiktives-cafe`,
      );
      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.json.ok, false);
    });

    await check("passender customerId-Filter liefert das Jobpaket weiterhin (kein falsches Blockieren)", async () => {
      const response = await httpRequest(
        port,
        "GET",
        `/api/v71/canva/job-packages/${secondCustomerJobPackageId}?customerId=test-customer-fiktives-fitnessstudio`,
      );
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.jobPackageId, secondCustomerJobPackageId);
    });

    // Kundenentwurfsfreigabe (achte Freigabestufe) über HTTP.
    //
    // Sicherheits-/Fachkorrektur (Fund bei manueller Safari-Abnahme,
    // 25.07.2026): "Kundenentwurf freigeben"/"Änderungen anfordern" dürfen
    // ausschließlich möglich sein, wenn tatsächlich ein mandantengebundener
    // Kundenentwurf existiert (ausgewählter Designkandidat UND Status
    // mindestens READY_FOR_CUSTOMER_REVIEW). Eine bloße Briefingfreigabe
    // genügt ausdrücklich NICHT mehr (das war genau der gemeldete Fehler).
    await check("Kundenentwurfsfreigabe wird verweigert, solange weder Kandidat noch Kundenentwurf existieren (DRAFT)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-customer-draft", {
        jobPackageId: secondCustomerJobPackageId,
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    await check("Kundenentwurfsfreigabe bleibt auch nach alleiniger Briefingfreigabe verweigert (ursprünglicher Fehlerfund)", async () => {
      await httpRequest(port, "POST", "/api/v71/canva/job-package/validate", { jobPackageId: secondCustomerJobPackageId });
      await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-briefing", { jobPackageId: secondCustomerJobPackageId });
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-customer-draft", {
        jobPackageId: secondCustomerJobPackageId,
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
      assert.ok(/selectedCandidateId fehlt/.test(response.json.message || ""), "erwartete Begründung fehlt");
    });

    await check("Änderungswunsch des Kunden ist ebenfalls verweigert, solange kein Kundenentwurf existiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/request-customer-draft-changes", {
        jobPackageId: secondCustomerJobPackageId,
        note: "Bitte die Botschaft etwas kürzen.",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    // Der reale Providerablauf (Kandidat auswählen -> Design/Entwurf ->
    // interner Review -> READY_FOR_CUSTOMER_REVIEW) besitzt in Phase C noch
    // keine eigene Route (bewusst kein Phase-D-Vorgriff). Um die Freigabe-
    // route dennoch end-to-end gegen einen tatsächlich existierenden
    // Kundenentwurf zu prüfen, wird hier ausschließlich der bereits
    // vorhandene, isolierte Store (kein Canva-Netzwerk, keine echte
    // Ausführung) direkt auf genau diesen späteren, ehrlich erreichbaren
    // Zustand gesetzt.
    await check("Kundenentwurfsfreigabe gelingt, sobald ein Kandidat ausgewählt und der Status READY_FOR_CUSTOMER_REVIEW erreicht ist", async () => {
      const paths = canvaStoreModule.resolveCanvaStorePaths();
      const pkg = canvaStoreModule.loadPackage(paths, secondCustomerJobPackageId);
      canvaStoreModule.savePackage(paths, { ...pkg, selectedCandidateId: "cand-simulated-1", status: "READY_FOR_CUSTOMER_REVIEW" });

      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/approve-customer-draft", {
        jobPackageId: secondCustomerJobPackageId,
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.customerDraftApprovalStatus, "APPROVED");
      assert.strictEqual(response.json.package.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
    });

    await check("Änderungswunsch des Kunden gelingt und wird als eigener Status erfasst, sobald derselbe Kundenentwurf existiert", async () => {
      const paths = canvaStoreModule.resolveCanvaStorePaths();
      const pkg = canvaStoreModule.loadPackage(paths, secondCustomerJobPackageId);
      canvaStoreModule.savePackage(paths, { ...pkg, customerDraftApprovalStatus: "PENDING" });

      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/request-customer-draft-changes", {
        jobPackageId: secondCustomerJobPackageId,
        note: "Bitte die Botschaft etwas kürzen.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.customerDraftApprovalStatus, "CHANGES_REQUESTED");
    });

    // 75-78. Kosten-/Paketzuordnung.
    await check("75-78. Kostenpaketstatus kann gezielt gesetzt werden (kein automatisches Abrechnen)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/set-cost-package-status", {
        jobPackageId: secondCustomerJobPackageId,
        costPackageStatus: "INCLUDED_IN_PACKAGE",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.costPackageStatus, "INCLUDED_IN_PACKAGE");
    });

    await check("unbekannter Kostenpaketstatus wird abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/job-package/set-cost-package-status", {
        jobPackageId: secondCustomerJobPackageId,
        costPackageStatus: "NICHT_EXISTENT",
      });
      assert.strictEqual(response.statusCode, 400);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`server-v71-canva-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
