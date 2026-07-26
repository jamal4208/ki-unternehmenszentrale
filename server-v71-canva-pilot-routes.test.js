"use strict";

// V7.1 Phase C.1 – End-to-End-Tests für die additiven Canva-Pilot-
// Ergebnisakte-Routen (Auftrag Abschnitt F/I). Läuft mit isoliertem
// HOME-Verzeichnis (wie server-v71-canva-routes.test.js) – niemals gegen
// das echte Application-Support-Verzeichnis.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "v71-canva-pilot-routes-test-home-"));
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

const REAL_PILOT_ID = "pilot-canva-2026-07-cafe-amore-sonntagsfruehstueck";
const REAL_PILOT_CUSTOMER_ID = "test-customer-fiktives-cafe-amore";

async function runTests() {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // ---------------------------------------------------------------------
    // Grundlegende GET-Routen und Seed.
    // ---------------------------------------------------------------------

    await check("GET /api/v71/canva/pilot-results liefert die reale, kanonische Pilotakte", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/pilot-results");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.pilotResultCount, 1);
      const record = response.json.pilotResults[0];
      assert.strictEqual(record.pilotId, REAL_PILOT_ID);
      assert.strictEqual(record.designId, "DAHQeIjc2ls");
      assert.strictEqual(record.designTitle, "Instagram-Beitrag - Sonntagsfrühstück");
      assert.strictEqual(record.pageCount, 1);
      assert.strictEqual(record.costPackageStatus, "NOT_BILLABLE_TEST");
      assert.strictEqual(record.providerExecutionStatus, "SAVED");
      assert.strictEqual(record.internalReviewStatus, "REVIEWED_WITH_NOTES");
      assert.strictEqual(record.customerReviewStatus, "CHANGES_POSSIBLE");
      assert.strictEqual(record.publicationApprovalStatus, "NOT_APPROVED");
      assert.strictEqual(record.connectorType, "CONTROLLED_HANDOFF");
    });

    await check("GET /api/v71/canva/pilot-results/:pilotId liefert die Einzelakte", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.pilotId, REAL_PILOT_ID);
    });

    await check("GET /api/v71/canva/pilot-results/:pilotId für unbekannte ID liefert 404 ohne Stacktrace", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/pilot-results/unbekannte-id");
      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.json.ok, false);
      assert.ok(!/at Object\.|at Module\.|\.js:\d+:\d+/.test(response.body));
    });

    // 4/12. Mandantenmismatch liefert 404 (Kunde A kann Kunde B nicht lesen).
    await check("Mandantenmismatch auf Einzelabruf liefert 404, nicht 403 (verrät keine Fremddaten)", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}?customerId=ein-anderer-kunde`);
      assert.strictEqual(response.statusCode, 404);
    });

    await check("kundengebundene Liste (?customerId=) liefert für falschen Kunden keine fremden Datensätze", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/pilot-results?customerId=ein-anderer-kunde");
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResultCount, 0);
    });

    await check("GET .../feedback liefert leere Historie vor jeglichem Feedback", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}/feedback`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.feedbackCount, 0);
      assert.deepStrictEqual(response.json.feedbackHistory, []);
    });

    // ---------------------------------------------------------------------
    // Sicherheitsrandmuster (identisch zu den übrigen V7.1-Canva-Routen).
    // ---------------------------------------------------------------------

    await check("Host/Origin-Prüfung blockiert fremde Origin", async () => {
      const response = await httpRequest(port, "GET", "/api/v71/canva/pilot-results", undefined, {
        origin: "https://evil.example.com",
      });
      assert.strictEqual(response.statusCode, 403);
    });

    await check("unbekannte Felder im POST-Body werden abgewiesen", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/customer-approve", {
        pilotId: REAL_PILOT_ID,
        publish: true,
      });
      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.json.ok, false);
    });

    await check("falscher Content-Type wird mit 415 abgewiesen", async () => {
      const body = JSON.stringify({ pilotId: REAL_PILOT_ID });
      const response = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/v71/canva/pilot-result/customer-approve",
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

    // ---------------------------------------------------------------------
    // Verbotene Routen existieren nicht (Auftrag Abschnitt F).
    // ---------------------------------------------------------------------

    const forbiddenRoutes = [
      ["POST", "/api/v71/canva/pilot-result/publish"],
      ["POST", "/api/v71/canva/pilot-result/share"],
      ["POST", "/api/v71/canva/pilot-result/invite-customer"],
      ["POST", "/api/v71/canva/pilot-result/login"],
      ["POST", "/api/v71/canva/pilot-result/api-key"],
      ["POST", "/api/v71/canva/pilot-result/delete"],
      ["POST", "/api/v71/canva/pilot-result/purchase-credits"],
      ["POST", "/api/v71/canva/pilot-result/brand-kit-access"],
    ];
    for (const [method, targetPath] of forbiddenRoutes) {
      await check(`verbotene Route existiert nicht: ${method} ${targetPath}`, async () => {
        const response = await httpRequest(port, method, targetPath, { pilotId: REAL_PILOT_ID });
        assert.strictEqual(response.statusCode, 405, `${targetPath} sollte nicht als POST-Route registriert sein.`);
      });
    }

    // ---------------------------------------------------------------------
    // Kompletter, kontrollierter Lifecycle über HTTP.
    // ---------------------------------------------------------------------

    let feedbackId;

    await check("11. Kundenfreigabe ist vor abgeschlossenem internem Review/Kundenreview-Stufe blockiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/customer-approve", { pilotId: REAL_PILOT_ID });
      assert.strictEqual(response.statusCode, 400);
    });

    await check("POST .../internal-review hebt die Akte regulär auf READY_FOR_CUSTOMER_REVIEW", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/internal-review", {
        pilotId: REAL_PILOT_ID,
        internalReviewStatus: "REVIEWED_WITH_NOTES",
        note: "Erneut geprüft für Kundenfeedback-Freigabe.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
    });

    // 6. Kundenfeedback löst keine Veröffentlichung aus.
    await check("POST .../customer-feedback erfasst Feedback, löst aber keine Veröffentlichung aus", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/customer-feedback", {
        pilotId: REAL_PILOT_ID,
        feedbackText: "Bitte Kaffee deutlicher sichtbar machen.",
        feedbackType: "IMAGE_CHANGE",
        createdByRole: "CUSTOMER",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.feedbackHistory.length, 1);
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
      feedbackId = response.json.pilotResult.feedbackHistory[0].feedbackId;
    });

    // 9/10. Kosten-/Rechtefreigaben unverändert.
    await check("9. Kostenstatus bleibt nach Kundenfeedback unverändert", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}`);
      assert.strictEqual(response.json.pilotResult.costPackageStatus, "NOT_BILLABLE_TEST");
    });

    // 8. Änderungsanforderung löst keine Canva-Aktion aus (madeExternalRequest bleibt false).
    await check("8. POST .../request-changes löst keine Canva-Aktion aus (madeExternalRequest bleibt false)", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/request-changes", {
        pilotId: REAL_PILOT_ID,
        feedbackId,
        requestedChanges: ["Kaffee deutlicher sichtbar machen"],
        note: "Kunde möchte den Kaffee prominenter sehen.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.madeExternalRequest, false);
      assert.strictEqual(response.json.pilotResult.customerReviewStatus, "CUSTOMER_CHANGES_REQUESTED");
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
    });

    await check("POST .../mark-ready-after-changes hebt die Akte auf READY_FOR_REVIEW_AFTER_CHANGES", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/mark-ready-after-changes", {
        pilotId: REAL_PILOT_ID,
        note: "Kaffee im Bild deutlicher hervorgehoben und erneut geprüft.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.customerReviewStatus, "READY_FOR_REVIEW_AFTER_CHANGES");
    });

    // 7. Kundenfreigabe löst keine Veröffentlichung aus.
    await check("7. POST .../customer-approve gewährt Kundenfreigabe, aber niemals Veröffentlichung", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/customer-approve", { pilotId: REAL_PILOT_ID });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.customerReviewStatus, "CUSTOMER_APPROVED");
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
      assert.strictEqual(response.json.madeExternalRequest, false);
    });

    await check("5. Kundenfeedback ohne pilotId/Design-ID wird sauber (400) abgewiesen, keine Stacktrace", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/customer-feedback", {
        pilotId: "",
        feedbackText: "x",
      });
      assert.strictEqual(response.statusCode, 400);
      assert.ok(!/at Object\.|at Module\.|\.js:\d+:\d+/.test(response.body));
    });

    // ---------------------------------------------------------------------
    // V7.1 Phase C.1.1 – Reviewmodell-Routen (Agenten-QS / Human / Escalate).
    // ---------------------------------------------------------------------

    await check("C.1.1-11. GET der Pilotakte liefert serviceTier=INTERNAL und reviewMode=OWNER_REVIEW", async () => {
      const response = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}`);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.serviceTier, "INTERNAL");
      assert.strictEqual(response.json.pilotResult.reviewMode, "OWNER_REVIEW");
      assert.strictEqual(response.json.pilotResult.ownerReviewRequired, true);
      assert.strictEqual(response.json.pilotResult.internalReviewStatus, "REVIEWED_WITH_NOTES");
    });

    await check("C.1.1-13. verbotene Veröffentlichungsroute bleibt nicht registriert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/publish", { pilotId: REAL_PILOT_ID });
      assert.strictEqual(response.statusCode, 405);
    });

    await check("C.1.1. POST .../agent-qa auf dem Café-Amore-Piloten dokumentiert Agenten-QS ohne Kundenfreigabe", async () => {
      // Der Pilot ist bereits CUSTOMER_APPROVED aus dem Lifecycle oben; Agenten-QS
      // darf auf einer nicht-eskalierten Akte dokumentiert werden, solange der
      // qualityReviewStatus noch NOT_STARTED/PENDING/FAILED ist. Nach erster
      // Freigabe bleibt die Kundenreview-Historie unverändert.
      const before = await httpRequest(port, "GET", `/api/v71/canva/pilot-results/${REAL_PILOT_ID}`);
      const previousCustomerStatus = before.json.pilotResult.customerReviewStatus;
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/agent-qa", {
        pilotId: REAL_PILOT_ID,
        result: "PASS",
        checklist: {
          briefingFulfilled: true,
          mainMessageVisible: true,
          mandatoryTextsPresent: true,
          noPlaceholderText: true,
          readabilitySufficient: true,
          imageMessageConsistent: true,
          noProhibitedContent: true,
          rightsAndPrivacyStatusUnchanged: true,
          noPublicationTriggered: true,
        },
        note: "Nachträglich dokumentierte Agenten-QS.",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.qualityReviewStatus, "AGENT_QA_PASSED");
      assert.strictEqual(response.json.pilotResult.customerReviewStatus, previousCustomerStatus);
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
      assert.strictEqual(response.json.madeExternalRequest, false);
    });

    await check("C.1.1. POST .../human-review ist auf OWNER_REVIEW-Akte blockiert", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/human-review", {
        pilotId: REAL_PILOT_ID,
        note: "unzulässig",
      });
      assert.strictEqual(response.statusCode, 400);
    });

    await check("C.1.1-5. POST .../escalate setzt RISK_ESCALATION ohne Veröffentlichung/Canva-Aktion", async () => {
      const response = await httpRequest(port, "POST", "/api/v71/canva/pilot-result/escalate", {
        pilotId: REAL_PILOT_ID,
        reason: "Testdokumentation Risikofall",
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.pilotResult.reviewMode, "RISK_ESCALATION");
      assert.strictEqual(response.json.pilotResult.qualityReviewStatus, "ESCALATED");
      assert.strictEqual(response.json.pilotResult.publicationApprovalStatus, "NOT_APPROVED");
      assert.strictEqual(response.json.madeExternalRequest, false);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`server-v71-canva-pilot-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
