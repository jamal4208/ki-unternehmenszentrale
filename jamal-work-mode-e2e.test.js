"use strict";

// V7.3 – Jamal-Arbeitsmodus (Auftrag Abschnitt N): Ende-zu-Ende-Test gegen
// den echten server.js#requestHandler (gleiches Muster wie
// route-access-policy.test.js/daily-work-run.test.js) – vom Öffnen der
// Zentrale über den Ergebniswunsch, den internen Agentenlauf, die Änderung
// bis zur Erledigt-Markierung. Läuft mit einem isolierten HOME-/
// KUZ_DATA_DIR-Verzeichnis; niemals die echte Application-Support-Datenbank.
//
// Alle Aufrufe laufen über den lokalen Entwicklungs-Dev-Bypass (Loopback-
// Host, keine Session nötig für OWNER_ONLY – siehe
// auth-route-guard.js#DEV_BYPASS_IDENTITY, bereits von route-access-
// policy.test.js in gleicher Weise verwendet).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jamal-work-mode-e2e-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jamal-work-mode-e2e-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const server = require("./server");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function invoke({ method = "GET", url, headers = {}, bodyObj }) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
    let statusCode = null;
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
      setHeader() {},
      writeHead(code) {
        statusCode = code;
      },
      end(body = "") {
        rawBody += body;
        let json = null;
        try {
          json = rawBody ? JSON.parse(rawBody) : null;
        } catch (_error) {
          json = null;
        }
        resolve({ statusCode, json });
      },
    };
    server.requestHandler(req, res);
  });
}

function getState() {
  return invoke({ method: "GET", url: "/api/jamal-work-mode/state" });
}

function runAction(action, bodyObj) {
  return invoke({ method: "POST", url: `/api/jamal-work-mode/${action}`, bodyObj: bodyObj || {} });
}

async function run() {
  // -------------------------------------------------------------------
  // 1. Zentrale öffnet.
  // -------------------------------------------------------------------

  await check("Zentrale öffnet (GET / liefert 200 mit der zentralen Arbeitskarte)", async () => {
    const result = await invoke({ method: "GET", url: "/" });
    assert.strictEqual(result.statusCode, 200);
  });

  await check("das neue UI-Skript wird ausgeliefert", async () => {
    const result = await invoke({ method: "GET", url: "/jamal-work-mode-ui.js" });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 2. priorisiertes Projekt sichtbar.
  // -------------------------------------------------------------------

  let state = await getState();
  await check("priorisiertes Projekt ist ohne jede Eingabe bereits sichtbar", () => {
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.json.ok, true);
    assert.strictEqual(state.json.currentItem, null);
    assert.ok(state.json.prioritizedProject && state.json.prioritizedProject.id);
    assert.strictEqual(state.json.writeOperationsBlocked, true);
    assert.strictEqual(state.json.madeExternalRequest, false);
  });

  // -------------------------------------------------------------------
  // 3. Ergebniswunsch eingeben.
  // -------------------------------------------------------------------

  const startResult = await runAction("start-new-item");
  await check("ein neuer Arbeitswunsch übernimmt automatisch das priorisierte Projekt", () => {
    assert.strictEqual(startResult.statusCode, 200);
    assert.strictEqual(startResult.json.currentItem.status, "NOT_STARTED");
    assert.ok(startResult.json.currentItem.projectId);
  });

  const outcomeResult = await runAction("set-desired-outcome", {
    desiredOutcome:
      "Vereinfache den täglichen Arbeitsmodus der KI-Unternehmenszentrale so, dass Jamal innerhalb von fünf Sekunden erkennt, was wichtig ist und was als Nächstes zu tun ist.",
    notes: "Bestehende Phase-C-Architektur wiederverwenden, keine neue Architektur, kein externer Provider.",
    preferredTiming: "heute",
  });
  await check("Ergebniswunsch eingeben setzt den Status auf Bereit", () => {
    assert.strictEqual(outcomeResult.statusCode, 200);
    assert.strictEqual(outcomeResult.json.currentItem.status, "READY");
    assert.strictEqual(outcomeResult.json.statusLabel, "Bereit");
  });

  // -------------------------------------------------------------------
  // 4+5+6. Lauf starten, Projektmanager übernimmt, Agenten werden gewählt.
  // -------------------------------------------------------------------

  const runResult = await runAction("start-run");
  await check("Lauf starten: der Projektmanager-Agent übernimmt und Fachagenten werden ausgewählt", () => {
    assert.strictEqual(runResult.statusCode, 200);
    const item = runResult.json.currentItem;
    assert.strictEqual(item.plan.agents.projectManager.canonicalName, "Projektmanager-Agent");
    assert.ok(item.plan.agents.specialists.length >= 1 && item.plan.agents.specialists.length <= 3);
    assert.strictEqual(item.plan.agents.quality.canonicalName, "QA-Agent");
  });

  // -------------------------------------------------------------------
  // 7+8. Ergebnis entsteht und ist oben (im Statuszustand) sichtbar.
  // -------------------------------------------------------------------

  await check("Ergebnis entsteht und ist über den Zustand sofort sichtbar", () => {
    assert.strictEqual(runResult.json.currentItem.status, "RESULT_READY");
    assert.strictEqual(runResult.json.statusLabel, "Ergebnis bereit");
    assert.strictEqual(runResult.json.currentItem.versions.length, 1);
    assert.ok(runResult.json.currentItem.versions[0].title);
    assert.ok(runResult.json.currentItem.versions[0].summary);
    assert.ok(["PASSED", "PASSED_WITH_NOTES"].includes(runResult.json.currentItem.versions[0].qualityStatus));
  });

  const firstVersionSnapshot = JSON.stringify(runResult.json.currentItem.versions[0]);

  // -------------------------------------------------------------------
  // 9+10+11. Änderung anfordern, neue Version entsteht, alte bleibt.
  // -------------------------------------------------------------------

  const changeResult = await runAction("request-change", { changeText: "Bitte die Zusammenfassung kürzer formulieren." });
  await check("Änderung anfordern erzeugt eine neue Version, die alte bleibt unverändert", () => {
    assert.strictEqual(changeResult.statusCode, 200);
    const item = changeResult.json.currentItem;
    assert.strictEqual(item.status, "RESULT_READY");
    assert.strictEqual(item.versions.length, 2);
    assert.strictEqual(JSON.stringify(item.versions[0]), firstVersionSnapshot);
    assert.strictEqual(item.versions[1].changeRequestText, "Bitte die Zusammenfassung kürzer formulieren.");
  });

  // -------------------------------------------------------------------
  // 12+13. Passt markieren, Status Erledigt.
  // -------------------------------------------------------------------

  const doneResult = await runAction("mark-done");
  await check("„Passt“ markiert den Arbeitswunsch als Erledigt", () => {
    assert.strictEqual(doneResult.statusCode, 200);
    assert.strictEqual(doneResult.json.currentItem.status, "DONE");
    assert.strictEqual(doneResult.json.statusLabel, "Erledigt");
  });

  // -------------------------------------------------------------------
  // 14. keine externe Aktion.
  // -------------------------------------------------------------------

  await check("keine externe Aktion in irgendeiner Antwort dieses Ablaufs", () => {
    [startResult, outcomeResult, runResult, changeResult, doneResult].forEach((result) => {
      assert.strictEqual(result.json.writeOperationsBlocked, true);
      assert.strictEqual(result.json.madeExternalRequest, false);
    });
  });

  // -------------------------------------------------------------------
  // 15. Fehlerfall verständlich.
  // -------------------------------------------------------------------

  await check("ein unpassender Zustand liefert eine verständliche, sichere Fehlermeldung (400)", async () => {
    // DONE ist ein Abschlusszustand: eine erneute Rückfrageantwort ist nicht möglich.
    const result = await runAction("answer-clarification", { answer: "x" });
    assert.strictEqual(result.statusCode, 400);
    assert.strictEqual(result.json.ok, false);
    assert.ok(typeof result.json.message === "string" && result.json.message.length > 0);
    assert.doesNotMatch(result.json.message, /at Object\.|at Function\.|node_modules/);
  });

  await check("eine unbekannte Aktion liefert 404, keine Bestätigung ihrer Nichtexistenz-Details", async () => {
    const result = await runAction("does-not-exist");
    assert.strictEqual(result.statusCode, 404);
  });

  await check("unbekannte Felder im Aktionskörper werden abgewiesen (400)", async () => {
    const result = await runAction("mark-later", { unknownField: "x" });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("ein fremder Host erreicht die Jamal-Arbeitsmodus-Route nicht (404, kein Dev-Bypass)", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/state", headers: { host: "evil.example.com" } });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // Zusätzliche Härtung: nach Erledigt kann ein neuer Arbeitswunsch
  // begonnen werden (Auftrag Abschnitt C: "Neuen Ergebniswunsch
  // festlegen"), und kein Schritt dieses Ablaufs verwendet einen
  // Provider, eine Veröffentlichung oder ein Billing.
  // -------------------------------------------------------------------

  await check("nach Erledigt kann ein neuer Arbeitswunsch begonnen werden", async () => {
    const result = await runAction("start-new-item");
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.currentItem.status, "NOT_STARTED");
    // Kontinuität: das zuvor gewählte/bestätigte Projekt bleibt priorisiert.
    assert.strictEqual(result.json.currentItem.projectId, startResult.json.currentItem.projectId);
  });

  await check("kein Schritt dieses Ablaufs führt eine Provideraktion, Veröffentlichung oder Billing-Aktion aus", () => {
    const allResponses = [startResult, outcomeResult, runResult, changeResult, doneResult];
    allResponses.forEach((result) => {
      assert.strictEqual(result.json.madeExternalRequest, false);
      const text = JSON.stringify(result.json);
      assert.doesNotMatch(text, /canva|heygen/i);
      // Bewusst nur tatsächliche Veröffentlichungs-/Billing-AKTIONEN prüfen,
      // nicht die (erwünschten) Verneinungen in den Agenten-Grenzbeschrei-
      // bungen ("keine Veröffentlichung", "keine Kosten").
      assert.doesNotMatch(text, /"publishedUrl"|"publishStatus"|publish(ed)?[":]\s*true/i);
      assert.doesNotMatch(text, /"billingStatus"|"invoiceId"|"priceCents"/i);
    });
  });

  console.log(`jamal-work-mode-e2e.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
