"use strict";

// V7.1 Phase B – End-to-End-Tests für die additiven HeyGen-Connector-Routen
// (Auftrag Abschnitt J, Pflichttests 51-60 und funktionale Rundläufe für
// Abschnitt D/E/F/G/H/I/M über HTTP). Läuft mit isoliertem HOME-Verzeichnis
// (wie server-http-router.test.js/server-v71-routes.test.js) – niemals
// gegen das echte Application-Support-Verzeichnis.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "v71-heygen-routes-test-home-"));
process.env.HOME = FAKE_HOME_DIR;

const { requestHandler } = require("./server");

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
    videoType: "AVATAR_VIDEO",
    title: "Neutraler Café-Test",
    script: "Willkommen in unserem freundlichen Test-Café. Wir freuen uns auf Ihren Besuch.",
    aspectRatio: "9:16",
    durationTargetSeconds: 15,
    avatarReference: { avatarId: "public-avatar-1", visibility: "PUBLIC" },
    dataClassification: "NORMAL",
    ...overrides,
  };
}

async function runTests() {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // 51/52. klare Freigabestufen / keine Sammelfreigabe – geprüft über den
    // vollständigen, getrennten Rundlauf unten (prepare -> validate ->
    // approve-content -> approve-external-transfer -> approve-cost -> token
    // -> handoff).

    await check("GET /api/v71/heygen/status liefert kontrollierten Pilotstatus, niemals DIRECT/autonom", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/status");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.pilotStatus.directOrAutonomousConnection, false);
      assert.notStrictEqual(response.json.pilotStatus.pilotExecutionMode, "DIRECT");
      assert.strictEqual(response.json.noApiKeyStored, true);
      assert.strictEqual(response.json.noAutomaticExecution, true);
    });

    // 54. Host/Origin.
    await check("54. Host/Origin-Prüfung blockiert fremde Origin auf HeyGen-Status", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/status", undefined, {
        origin: "https://evil.example.com",
      });
      assert.strictEqual(response.statusCode, 403);
    });

    // 55. Content-Type.
    await check("55. Content-Type-Prüfung: falscher Content-Type wird abgewiesen", async () => {
      const response = await new Promise((resolve, reject) => {
        const body = JSON.stringify(validPreparePayload());
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/v71/heygen/job-package/prepare",
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

    // 56. Bodylimit (in-Prozess, siehe server-v71-routes.test.js für dasselbe Muster).
    await check("56. Bodygrößenlimit wird auf HeyGen-Prepare durchgesetzt", async () => {
      const hugeScript = "a".repeat(80 * 1024);
      const payload = JSON.stringify(validPreparePayload({ script: hugeScript }));
      const result = await new Promise((resolve) => {
        let statusCode = null;
        let rawBody = "";
        requestHandler(
          {
            method: "POST",
            url: "/api/v71/heygen/job-package/prepare",
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

    // 57. keine Stacktraces.
    await check("57. keine Stacktraces in HeyGen-Fehlermeldungen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/prepare", validPreparePayload({ projectId: "nicht-vorhanden" }));
      assert.strictEqual(response.statusCode, 400);
      assert.ok(!/at Object\.|at Module\.|\.js:\d+:\d+/.test(response.body));
    });

    // 58. keine Credential-Felder.
    await check("58. unbekannte/Credential-Felder werden auf HeyGen-Prepare abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/prepare", {
        ...validPreparePayload(),
        apiKey: "sk-should-be-rejected",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    // Vollständiger, getrennter Freigabe-Rundlauf (Abschnitt I): prepare ->
    // validate -> approve-content -> approve-external-transfer ->
    // approve-cost -> handoff/request-token -> handoff/prepare.
    let jobPackageId;
    await check("gültiges Jobpaket wird vorbereitet (DRAFT) und persistiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/prepare", validPreparePayload());
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.package.status, "DRAFT");
      assert.strictEqual(response.json.package.externalTransferApproved, false);
      assert.strictEqual(response.json.package.publicationApproved, false);
      jobPackageId = response.json.package.jobPackageId;
      assert.ok(jobPackageId);
    });

    await check("GET /api/v71/heygen/job-packages listet das vorbereitete Paket", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/job-packages");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.jobPackages.some((entry) => entry.jobPackageId === jobPackageId));
    });

    await check("GET /api/v71/heygen/job-packages/:id liefert Paket inklusive Handoff-Bereitschaft", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/heygen/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.jobPackageId, jobPackageId);
      assert.strictEqual(response.json.readiness.ready, false);
      assert.ok(response.json.readiness.missing.length > 0);
    });

    await check("GET /api/v71/heygen/job-packages/:id liefert 404 für unbekannte ID", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/job-packages/unbekannt-123");
      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.json.ok, false);
    });

    await check("Inhaltsprüfung setzt Status auf READY_FOR_REVIEW", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/validate", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.package.status, "READY_FOR_REVIEW");
    });

    await check("Handoff-Token wird ohne Freigaben verweigert (nur Inhalt geprüft)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/handoff/request-token", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, false);
      assert.ok(response.json.missing.includes("Externe Übertragung bestätigen"));
      assert.strictEqual(response.json.noAutomaticExecution, true);
    });

    // 52. keine Sammelfreigabe: drei getrennte HTTP-Aufrufe statt einem.
    await check("Inhalt wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-content", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.contentApproved, true);
      assert.strictEqual(response.json.package.externalTransferApproved, false);
    });

    await check("externe Übertragung wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-external-transfer", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.externalTransferApproved, true);
      assert.strictEqual(response.json.package.costApprovalStatus, "UNKNOWN");
    });

    await check("Kostenrahmen wird getrennt freigegeben (eigener Aufruf)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-cost", {
        jobPackageId,
        costApprovalStatus: "WITHIN_APPROVED_LIMIT",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.costApprovalStatus, "WITHIN_APPROVED_LIMIT");
      assert.strictEqual(response.json.package.publicationApproved, false);
    });

    let handoffToken;
    await check("Handoff-Token wird nach vollständigen Freigaben ausgestellt", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/handoff/request-token", { jobPackageId });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(response.json.token);
      assert.strictEqual(response.json.noAutomaticExecution, true);
      handoffToken = response.json.token;
    });

    let handoffPayload;
    await check("Handoff-Payload wird erzeugt, keine Ausführung/Netzwerk/Kosten/Veröffentlichung", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/handoff/prepare", { jobPackageId, token: handoffToken });
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

    // 36. Token-Reuse wird blockiert.
    await check("36. Token-Wiederverwendung wird blockiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/handoff/prepare", { jobPackageId, token: handoffToken });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    await check("Paket zeigt nach Handoff Status HANDED_OFF beim Abruf", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/heygen/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.status, "HANDED_OFF");
    });

    // Ergebnisrückführung (Abschnitt H) über HTTP.
    let resultToken;
    await check("Ergebnis-Token wird angefordert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/result/request-token", {
        jobPackageId,
        providerJobId: "provider-job-42",
        resultCandidate: { jobPackageId, providerJobId: "provider-job-42", status: "SUCCEEDED", videoReference: "https://videos.example.com/result.mp4" },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(response.json.token);
      resultToken = response.json.token;
    });

    await check("Ergebnis wird validiert, persistiert, Veröffentlichung bleibt false", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/result/validate", {
        token: resultToken,
        result: {
          jobPackageId,
          providerJobId: "provider-job-42",
          status: "SUCCEEDED",
          videoReference: "https://videos.example.com/result.mp4",
        },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.result.publicationApproved, false);
      assert.strictEqual(response.json.result.jamalAcceptanceStatus, "PENDING");
    });

    await check("Paket zeigt nach Ergebnisrückführung Status SUCCEEDED", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/heygen/job-packages/${jobPackageId}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.status, "SUCCEEDED");
      assert.ok(response.json.result);
      assert.strictEqual(response.json.result.videoReference, "https://videos.example.com/result.mp4");
    });

    // providerJobId allein ist kein Erfolg (Regel #42) – auch über HTTP.
    await check("providerJobId allein ist über HTTP kein Erfolg (fehlende videoReference blockiert SUCCEEDED)", async () => {
      const tokenResponse = await httpRequest(port, "POST", "/api/v71/heygen/result/request-token", {
        jobPackageId,
        providerJobId: "provider-job-99",
        resultCandidate: { jobPackageId, providerJobId: "provider-job-99", status: "SUCCEEDED" },
      });
      const response = await httpRequest(port, "POST", "/api/v71/heygen/result/validate", {
        token: tokenResponse.json.token,
        result: { jobPackageId, providerJobId: "provider-job-99", status: "SUCCEEDED" },
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, false);
      assert.ok(response.json.reasons.some((reason) => /providerJobId allein/.test(reason)));
    });

    // Backup-Export/Restore-Vorschau über HTTP (Abschnitt M).
    await check("Backup-Export-Route liefert HeyGen-Metadaten ohne Videos/Tokens/Credentials", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/backup/export");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.backupFormatVersion, "heygen-phase-b-backup-1");
      assert.ok(response.json.jobPackages.length >= 1);
      assert.ok(!/"apiKey"\s*:|"token"\s*:|videoBuffer|imageBuffer|audioBuffer/i.test(response.body));
    });

    await check("Restore-Vorschau-Route startet keinen Job und schreibt nichts", async () => {
      const exportResponse = await httpRequest(port, "GET", "/api/v71/heygen/backup/export");
      const { ok: _ok, writeOperationsBlocked: _w, madeExternalRequest: _m, ...exportBody } = exportResponse.json;
      const response = await httpRequest(port, "POST", "/api/v71/heygen/backup/restore-preview", exportBody);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.startedHeygenJob, false);
      assert.strictEqual(response.json.repeatedHandoff, false);
      assert.strictEqual(response.json.publishedAnything, false);
      assert.strictEqual(response.json.writesAppliedToLiveStore, false);
    });

    // Forbidden actions / no route for productive execution (Abschnitt J).
    await check("Keine Route für API-Key-Speicherung, Löschung, Kauf, Upgrade oder Veröffentlichung existiert", () => {
      const forbiddenPaths = [
        "/api/v71/heygen/api-key",
        "/api/v71/heygen/login",
        "/api/v71/heygen/avatar/delete",
        "/api/v71/heygen/video/delete",
        "/api/v71/heygen/credits/purchase",
        "/api/v71/heygen/plan/upgrade",
        "/api/v71/heygen/publish",
        "/api/v71/heygen/render",
        "/api/v71/heygen/fetch-url",
      ];
      const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      forbiddenPaths.forEach((forbidden) => assert.ok(!source.includes(`"${forbidden}"`)));
    });

    await check("server.js enthält keinen direkten HTTP/HTTPS-Aufruf innerhalb der HeyGen-Handler", () => {
      const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const heygenSectionMatch = source.match(/V7\.1 Phase B – HeyGen[\s\S]*?const getRoutes = buildRouteMap/);
      assert.ok(heygenSectionMatch);
      assert.ok(!/https\.request\(|http\.request\(/.test(heygenSectionMatch[0]));
    });

    // 59/60. Struktur für Mobile/Kein-Überlauf wird im UI-Testfile geprüft
    // (heygen-connector.js/heygen-ui liefert bewusst kurze, kompakte Felder,
    // keine Textwand) – hier nur die Datengrundlage: keine überlangen
    // Pflichtfelder ohne Kürzung.
    await check("59/60. API-Antworten liefern kompakte, begrenzte Textfelder (keine Textwand als Datengrundlage)", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/status");
      const text = JSON.stringify(response.json.capabilityProfile);
      assert.ok(text.length < 4000, "Capability-Profil bleibt kompakt genug für mobile Darstellung");
    });

    // -------------------------------------------------------------------
    // V7.1 Phase B.1 (Auftrag Abschnitt C/D/E/H/I/J) – Mandantenbasis,
    // Mandantentrennung, fünfte Freigabestufe, Ergebnisrückführung, Agentur-
    // Backup über HTTP.
    // -------------------------------------------------------------------

    // 6/7/8/14. gültiger Testkunde/Marke/Kampagne, keine echten Kundenseeds.
    await check("6/7/8/14. GET /api/v71/agency/customers|brands|campaigns liefert nur neutrale Testmandanten", async () => {
      const customers = await httpRequest(port, "GET", "/api/v71/agency/customers");
      assert.strictEqual(customers.statusCode, 200);
      assert.ok(customers.json.customers.length >= 2);
      assert.ok(customers.json.customers.every((c) => /Testmandant|kein echter Kunde/i.test(c.displayName)));

      const brands = await httpRequest(port, "GET", "/api/v71/agency/brands");
      assert.strictEqual(brands.statusCode, 200);
      assert.ok(brands.json.brands.length >= 2);

      const campaigns = await httpRequest(port, "GET", "/api/v71/agency/campaigns");
      assert.strictEqual(campaigns.statusCode, 200);
      assert.ok(campaigns.json.campaigns.length >= 2);
    });

    await check("GET /api/v71/agency/brands?customerId=... filtert nach Kunde (Mandantentrennung)", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/agency/brands?customerId=test-customer-fiktives-cafe");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.brands.length >= 1);
      assert.ok(response.json.brands.every((b) => b.customerId === "test-customer-fiktives-cafe"));
    });

    // 1/3/4/5. Pilot dokumentierbar, NOT_BILLABLE_TEST, Veröffentlichung false.
    await check("1/3/4/5. GET /api/v71/agency/pilot-review liefert dokumentierten Pilot (NOT_BILLABLE_TEST, nicht veröffentlicht)", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/agency/pilot-review");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotReview.costStatus, "NOT_BILLABLE_TEST");
      assert.strictEqual(response.json.pilotReview.publicationStatus, "NOT_PUBLISHED");
      assert.strictEqual(response.json.pilotReview.jamalDecision, "ACKNOWLEDGED_SUCCESSFUL_TEST_ONLY");
      // 2. Session-ID allein ist kein lokal verifizierter Erfolg.
      assert.strictEqual(response.json.locallyVerifiedSuccess, false);
    });

    await check("GET /api/v71/agency/backup/export liefert Mandanten-/Pilot-Metadaten ohne Credentials", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/agency/backup/export");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.customers.length >= 2);
      assert.ok(response.json.pilotReviews.length >= 1);
      assert.ok(!/"apiKey"\s*:|"token"\s*:/i.test(response.body));
    });

    await check("POST /api/v71/agency/backup/restore-preview startet nichts", async () => {
      const exportResponse = await httpRequest(port, "GET", "/api/v71/agency/backup/export");
      const { ok: _ok, writeOperationsBlocked: _w, madeExternalRequest: _m, ...exportBody } = exportResponse.json;
      const response = await httpRequest(port, "POST", "/api/v71/agency/backup/restore-preview", exportBody);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.startedHeygenJob, false);
      assert.strictEqual(response.json.writesAppliedToLiveStore, false);
    });

    // 15/16. Kunde A kann Kunde-B-Job nicht lesen (Mandantentrennung).
    let secondCustomerJobPackageId;
    await check("Jobpaket für zweiten Testmandanten wird vorbereitet", async () => {
      const response = await httpRequest(
        port,
        "POST",
        "/api/v71/heygen/job-package/prepare",
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

    await check("15/16/60. GET job-packages?customerId=... liefert nur Datensätze desselben Kunden", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/heygen/job-packages?customerId=test-customer-fiktives-cafe");
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.json.jobPackages.every((pkg) => pkg.customerId === "test-customer-fiktives-cafe"));
      assert.ok(!response.json.jobPackages.some((pkg) => pkg.jobPackageId === secondCustomerJobPackageId));
    });

    await check("60. Mandantenmismatch auf Job-by-id blockiert (404 statt 403, kein Preisgeben der Existenz)", async () => {
      const response = await httpRequest(
        port,
        "GET",
        `/api/v71/heygen/job-packages/${secondCustomerJobPackageId}?customerId=test-customer-fiktives-cafe`,
      );
      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.json.ok, false);
    });

    await check("passender customerId-Filter liefert das Jobpaket weiterhin (kein falsches Blockieren)", async () => {
      const response = await httpRequest(
        port,
        "GET",
        `/api/v71/heygen/job-packages/${secondCustomerJobPackageId}?customerId=test-customer-fiktives-fitnessstudio`,
      );
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.jobPackageId, secondCustomerJobPackageId);
    });

    // 32/34. Kundenentwurfsfreigabe ist eine eigene, fünfte Freigabestufe.
    await check("32. Kundenentwurfsfreigabe wird verweigert, solange keine interne Inhaltsfreigabe vorliegt", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-customer-draft", {
        jobPackageId: secondCustomerJobPackageId,
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    await check("32/34. Kundenentwurfsfreigabe erfolgt getrennt nach interner Inhaltsfreigabe (eigener Aufruf)", async () => {
      await httpRequest(port, "POST", "/api/v71/heygen/job-package/validate", { jobPackageId: secondCustomerJobPackageId });
      await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-content", { jobPackageId: secondCustomerJobPackageId });
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-customer-draft", {
        jobPackageId: secondCustomerJobPackageId,
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.customerDraftApprovalStatus, "APPROVED");
      // 33/35. Kundenfreigabe ist nicht Veröffentlichung.
      assert.strictEqual(response.json.package.publicationApproved, false);
    });

    await check("40. Änderungswunsch des Kunden am Entwurf wird als eigener Status erfasst", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/request-customer-draft-changes", {
        jobPackageId: secondCustomerJobPackageId,
        note: "Bitte den Claim im Skript anpassen.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.customerDraftApprovalStatus, "CHANGES_REQUESTED");
    });

    // 43-47. Kosten-/Paketzuordnung.
    await check("43-47. Kostenpaketstatus kann gezielt gesetzt werden (kein automatisches Abrechnen)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/set-cost-package-status", {
        jobPackageId: secondCustomerJobPackageId,
        costPackageStatus: "INCLUDED_IN_PACKAGE",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.package.costPackageStatus, "INCLUDED_IN_PACKAGE");
    });

    await check("46. unbekannter Kostenpaketstatus wird abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/job-package/set-cost-package-status", {
        jobPackageId: secondCustomerJobPackageId,
        costPackageStatus: "NICHT_EXISTENT",
      });
      assert.strictEqual(response.statusCode, 400);
    });

    // 36-42. Ergebnisrückführungs-Statuskette über HTTP.
    await check("Ergebnisrückführungs-Statuskette wird nach Ergebnisvalidierung automatisch mit PROVIDER_SUCCEEDED initialisiert", async () => {
      await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-external-transfer", { jobPackageId: secondCustomerJobPackageId });
      await httpRequest(port, "POST", "/api/v71/heygen/job-package/approve-cost", {
        jobPackageId: secondCustomerJobPackageId,
        costApprovalStatus: "WITHIN_APPROVED_LIMIT",
      });
      const tokenResponse = await httpRequest(port, "POST", "/api/v71/heygen/handoff/request-token", { jobPackageId: secondCustomerJobPackageId });
      await httpRequest(port, "POST", "/api/v71/heygen/handoff/prepare", { jobPackageId: secondCustomerJobPackageId, token: tokenResponse.json.token });
      const resultTokenResponse = await httpRequest(port, "POST", "/api/v71/heygen/result/request-token", {
        jobPackageId: secondCustomerJobPackageId,
        providerJobId: "provider-job-lifecycle-1",
        resultCandidate: {
          jobPackageId: secondCustomerJobPackageId,
          providerJobId: "provider-job-lifecycle-1",
          status: "SUCCEEDED",
          videoReference: "https://videos.example.com/lifecycle.mp4",
        },
      });
      await httpRequest(port, "POST", "/api/v71/heygen/result/validate", {
        token: resultTokenResponse.json.token,
        result: {
          jobPackageId: secondCustomerJobPackageId,
          providerJobId: "provider-job-lifecycle-1",
          status: "SUCCEEDED",
          videoReference: "https://videos.example.com/lifecycle.mp4",
        },
      });
      const byId = await httpRequest(port, "GET", `/api/v71/heygen/job-packages/${secondCustomerJobPackageId}`);
      assert.strictEqual(byId.json.lifecycle.customerReviewStatus, "PROVIDER_SUCCEEDED");
      assert.strictEqual(byId.json.lifecycle.publicationStatus, "PUBLICATION_NOT_APPROVED");
    });

    // 36. Providererfolg ≠ lokale Validierung.
    await check("36. LOCAL_VALIDATE-Übergang ist erst nach PROVIDER_SUCCEEDED zulässig und erfordert verifizierten Erfolg", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "LOCAL_VALIDATE",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.lifecycle.customerReviewStatus, "LOCAL_VALIDATED");
    });

    // 37/38. lokale Validierung ≠ internes Review ≠ Kundenfreigabe.
    await check("37/38/39. internes Review muss bestanden werden, bevor Kundenreview und Kundenfreigabe möglich sind", async () => {
      const blockedReadyResponse = await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "READY_FOR_CUSTOMER_REVIEW",
      });
      assert.strictEqual(blockedReadyResponse.statusCode, 400);

      await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "START_INTERNAL_REVIEW",
      });
      await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "COMPLETE_INTERNAL_REVIEW",
        passed: true,
        note: "Ton und Bild geprüft.",
      });
      const readyResponse = await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "READY_FOR_CUSTOMER_REVIEW",
      });
      assert.strictEqual(readyResponse.statusCode, 200);
      assert.strictEqual(readyResponse.json.lifecycle.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");

      // 39. Kundenfreigabe ≠ Veröffentlichung.
      const approvedResponse = await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "CUSTOMER_APPROVE",
      });
      assert.strictEqual(approvedResponse.statusCode, 200);
      assert.strictEqual(approvedResponse.json.lifecycle.customerReviewStatus, "CUSTOMER_APPROVED");
      assert.strictEqual(approvedResponse.json.lifecycle.publicationStatus, "PUBLICATION_NOT_APPROVED");
    });

    // 34. keine Sammelfreigabe: ein ungültiger action-Wert wird abgewiesen.
    await check("34. ungültige oder unbekannte Lifecycle-Aktion wird abgewiesen (keine Sammelfreigabe)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/heygen/result-lifecycle/advance", {
        jobPackageId: secondCustomerJobPackageId,
        action: "APPROVE_EVERYTHING",
      });
      assert.strictEqual(response.statusCode, 400);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`server-v71-heygen-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
