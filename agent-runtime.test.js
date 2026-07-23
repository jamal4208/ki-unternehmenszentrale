"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AgentRegistry = require("./agent-registry");
const DailyWorkRun = require("./daily-work-run");
const AgentRuntime = require("./agent-runtime");
const LocalDataBackup = require("./local-data-backup");
const DailyWorkRunUi = require("./daily-work-run-ui");
const { API_SECURITY_FLAGS, PROJECT_REGISTRY, buildProjectsResponse, getProjectById } = require("./project-registry");
const { requestHandler } = require("./server");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function invoke(method, url) {
  let statusCode = null;
  let rawBody = "";
  requestHandler(
    { method, url, headers: { host: "127.0.0.1" } },
    {
      writeHead(code) {
        statusCode = code;
      },
      end(body = "") {
        rawBody += body;
      },
    },
  );
  let body = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (_error) {
      body = rawBody;
    }
  }
  return { statusCode, body };
}

function mockStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    snapshot() {
      return Object.fromEntries(data.entries());
    },
  };
}

function preparedHealthAgentPlanningRun() {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id: "runtime-run-1", workDate: "2026-07-13", now: "2026-07-13T08:00:00Z" });
  run = DailyWorkRun.setFocusProject(run, health, "Testmomentaufnahme", "2026-07-13T08:00:00Z");
  run = DailyWorkRun.createWorkProposal(run, {
    desiredOutcome: "Ich möchte wissen, welche Agenten jetzt beim Health Upgrade Kompass eingesetzt werden müssen und was jeder davon prüfen soll.",
  });
  run = DailyWorkRun.transitionRun(run, "READY_FOR_CODEX");
  run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true, now: "2026-07-13T09:00:00Z" });
  return run;
}

function withPreparedPilot(run) {
  const pilot = AgentRuntime.createRuntimePilot(run, { actor: "Jamal", now: "2026-07-13T09:05:00Z" });
  return AgentRuntime.attachRuntimePilot(run, pilot);
}

async function runTests() {
  check("Modul kann geladen werden", () => {
    assert.strictEqual(typeof AgentRuntime.createRuntimePilot, "function");
    assert.strictEqual(typeof AgentRuntime.runWithExecutor, "function");
  });

  check("Pflichtabhängigkeiten werden geprüft", () => {
    assert.throws(() => AgentRuntime.createRuntimePilot(null), /Tageslauf/);
  });

  const pilotAgentId = AgentRuntime.resolveProjektmanagerAgentId();
  check("Projektmanager-Agent wird aus kanonischem Register aufgelöst", () => {
    assert.strictEqual(pilotAgentId, "orchestrator-agent");
    assert.strictEqual(AgentRegistry.ROLE_NAME_MAPPING["Projektmanager-Agent"], pilotAgentId);
    assert.strictEqual(
      Object.entries(AgentRegistry.ROLE_NAME_MAPPING).filter(([name]) => name === "Projektmanager-Agent").length,
      1,
    );
  });

  check("unbekannte Agenten-ID wird abgewiesen", () => {
    const run = preparedHealthAgentPlanningRun();
    assert.throws(
      () => DailyWorkRun.recordAgentWorkResult(run, "strategy-agent", { resultText: "x", confirmed: true }),
      /gehört nicht/,
    );
  });

  const healthRun = preparedHealthAgentPlanningRun();
  check("Agent muss Teil des aktuellen Einsatzplans sein", () => {
    assert.ok(healthRun.workProposal.selectedAgentIds.includes(pilotAgentId));
  });

  check("Runtime nur beim Health-Pilot verfügbar", () => {
    const other = { ...healthRun, focusProjectId: "expansion-app" };
    assert.strictEqual(AgentRuntime.evaluateAvailability(other).available, false);
  });

  check("Runtime nicht ohne Prüfphase", () => {
    const withoutPhase = { ...healthRun, agentReviewPhase: DailyWorkRun.getAgentReviewPhase({}) };
    assert.strictEqual(AgentRuntime.evaluateAvailability(withoutPhase).available, false);
  });

  check("Runtime nicht ohne vorbereitete Arbeitskarte", () => {
    const broken = JSON.parse(JSON.stringify(healthRun));
    broken.agentReviewPhase.workItems = broken.agentReviewPhase.workItems.filter((item) => item.agentId !== pilotAgentId);
    assert.strictEqual(AgentRuntime.evaluateAvailability(broken).available, false);
  });

  check("bestätigter bestehender Befund blockiert Vorbereitung", () => {
  let blockedRun = DailyWorkRun.recordAgentWorkResult(healthRun, "product-agent", {
      resultText: "Grundlage",
      confirmed: true,
      now: "2026-07-13T09:01:00Z",
    });
    blockedRun = DailyWorkRun.recordAgentWorkResult(blockedRun, pilotAgentId, {
      resultText: "Bereits bestätigt",
      confirmed: true,
      runtimePilotAcceptance: true,
      pilotAgentId,
      now: "2026-07-13T09:02:00Z",
    });
    assert.throws(() => AgentRuntime.createRuntimePilot(blockedRun), /bestätigter Befund/);
  });

  const preparedRun = withPreparedPilot(healthRun);
  const snapshot = preparedRun.agentRuntimePilot.inputSnapshot;
  check("Snapshot enthält alle Pflichtfelder", () => {
    AgentRuntime.REQUIRED_SNAPSHOT_FIELDS.forEach((field) => {
      if (field === "workProposalId") return;
      assert.ok(snapshot[field] !== undefined && snapshot[field] !== null && String(snapshot[field]).trim() !== "" || field === "dependencies");
    });
  });

  check("Fingerprint ist stabil", () => {
    const first = AgentRuntime.computeInputFingerprint(snapshot);
    const second = AgentRuntime.computeInputFingerprint(snapshot);
    assert.strictEqual(first, second);
    assert.strictEqual(first, snapshot.inputFingerprint);
  });

  check("geänderte Eingabe invalidiert Freigabe", () => {
    let pilot = AgentRuntime.grantJamalApproval(preparedRun.agentRuntimePilot, { now: "2026-07-13T09:06:00Z" });
    const changedRun = JSON.parse(JSON.stringify(preparedRun));
    changedRun.agentReviewPhase.workItems.find((item) => item.agentId === pilotAgentId).subtask = "Geänderter Auftrag";
    const refreshed = AgentRuntime.refreshRuntimePilot(AgentRuntime.attachRuntimePilot(changedRun, pilot));
    assert.strictEqual(refreshed.approval, null);
    assert.strictEqual(refreshed.status, "AWAITING_JAMAL_APPROVAL");
  });

  check("Freigabe ist vor Start verpflichtend", () => {
    assert.throws(() => AgentRuntime.requestStart(preparedRun.agentRuntimePilot), /APPROVED|Freigabe/);
  });

  check("Vorbereitung startet keinen Lauf", () => {
    assert.notStrictEqual(preparedRun.agentRuntimePilot.status, "RUNNING");
    assert.strictEqual(preparedRun.agentRuntimePilot.startedAt, null);
  });

  let approvedPilot = AgentRuntime.grantJamalApproval(preparedRun.agentRuntimePilot, { now: "2026-07-13T09:06:00Z" });
  check("Freigabe startet keinen Lauf", () => {
    assert.strictEqual(approvedPilot.status, "APPROVED");
    assert.strictEqual(approvedPilot.startedAt, null);
  });

  const finishedPilot = await AgentRuntime.runWithExecutor(approvedPilot, AgentRuntime.createLocalDeterministicPilotExecutor(), {
    now: "2026-07-13T09:07:00Z",
    disableTimeout: true,
  });
  check("Start erzeugt korrekte Statusfolge", () => {
    const types = finishedPilot.auditLog.map((entry) => entry.eventType);
    assert.deepStrictEqual(types.slice(0, 5), ["PREPARED", "APPROVAL_GRANTED", "START_REQUESTED", "QUEUED", "RUNNING"]);
    assert.ok(types.includes("RESULT_CREATED"));
    assert.strictEqual(finishedPilot.status, "RESULT_REVIEW_REQUIRED");
  });

  check("Doppelklick erzeugt keinen zweiten Lauf", () => {
    assert.throws(() => AgentRuntime.requestStart(finishedPilot), /bereits gestartet|nicht erlaubt/);
  });

  check("nur ein aktiver Lauf pro Tageslauf", () => {
    const activeRun = AgentRuntime.attachRuntimePilot(healthRun, { ...finishedPilot, status: "RUNNING", startedAt: "now" });
    assert.throws(() => AgentRuntime.createRuntimePilot(activeRun), /aktiv/);
  });

  const executorSource = fs.readFileSync(path.join(__dirname, "agent-runtime.js"), "utf8");
  check("lokaler Executor verwendet kein fetch", () => {
    const executorPart = executorSource.slice(executorSource.indexOf("createLocalDeterministicPilotExecutor"));
    assert.doesNotMatch(executorPart, /\bfetch\s*\(/);
  });
  check("lokaler Executor verwendet kein fs", () => {
    const executorPart = executorSource.slice(executorSource.indexOf("createLocalDeterministicPilotExecutor"));
    assert.doesNotMatch(executorPart, /\brequire\s*\(\s*["']fs["']\s*\)/);
    assert.doesNotMatch(executorPart, /\bfs\./);
  });
  check("lokaler Executor verwendet kein child_process", () => {
    const executorPart = executorSource.slice(executorSource.indexOf("createLocalDeterministicPilotExecutor"));
    assert.doesNotMatch(executorPart, /child_process/);
  });

  check("Ergebnisformat wird validiert", () => {
    assert.doesNotThrow(() => AgentRuntime.validateExecutorResult(finishedPilot.result, finishedPilot.inputSnapshot));
  });

  function freshApprovedPilot() {
    const run = preparedHealthAgentPlanningRun();
    const prepared = AgentRuntime.createRuntimePilot(run, { actor: "Jamal", now: "2026-07-13T09:05:00Z" });
    return AgentRuntime.grantJamalApproval(prepared, { now: "2026-07-13T09:06:00Z" });
  }

  check("ungültiges Ergebnis führt zu FAILED", async () => {
    const badExecutor = {
      async execute() {
        return { executorType: "LOCAL_DETERMINISTIC_PILOT", summary: "kurz" };
      },
    };
    const failed = await AgentRuntime.runWithExecutor(freshApprovedPilot(), badExecutor, { disableTimeout: true });
    assert.strictEqual(failed.status, "FAILED");
  });

  check("Handlerfehler führt zu FAILED", async () => {
    const badExecutor = {
      async execute() {
        throw new Error("Executor kaputt");
      },
    };
    const failed = await AgentRuntime.runWithExecutor(freshApprovedPilot(), badExecutor, { disableTimeout: true });
    assert.strictEqual(failed.status, "FAILED");
  });

  check("Timeout führt zu TIMED_OUT", async () => {
    const slowExecutor = {
      async execute({ signal }) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ broken: true }), 50);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const error = new Error("Abgebrochen");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    };
    const timedOut = await AgentRuntime.runWithExecutor(freshApprovedPilot(), slowExecutor, {
      timeoutMs: 5,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout,
    });
    assert.strictEqual(timedOut.status, "TIMED_OUT");
  });

  check("Abbruch führt zu CANCELLED", async () => {
    const abortController = new AbortController();
    const blockingExecutor = {
      async execute({ signal }) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Abgebrochen");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    };
    const promise = AgentRuntime.runWithExecutor(freshApprovedPilot(), blockingExecutor, {
      abortController,
      disableTimeout: true,
    });
    abortController.abort();
    const cancelled = await promise;
    assert.strictEqual(cancelled.status, "CANCELLED");
  });

  check("nach Timeout keine Ergebnisübernahme", () => {
    assert.throws(
      () => AgentRuntime.acceptResult(healthRun, { status: "TIMED_OUT", result: { summary: "x" } }, { confirmed: true }),
      /prüfpflichtiges Ergebnis/,
    );
  });

  check("nach Abbruch keine Ergebnisübernahme", () => {
    assert.throws(
      () => AgentRuntime.acceptResult(healthRun, { status: "CANCELLED", result: null }, { confirmed: true }),
      /prüfpflichtiges Ergebnis/,
    );
  });

  check("Ergebnis bleibt zunächst REVIEW_REQUIRED", () => {
    assert.strictEqual(finishedPilot.status, "RESULT_REVIEW_REQUIRED");
  });

  const beforeAccept = AgentRuntime.attachRuntimePilot(healthRun, finishedPilot);
  const workItemBefore = DailyWorkRun.getAgentReviewPhase(beforeAccept).workItems.find((item) => item.agentId === pilotAgentId);
  check("keine automatische Veränderung der Agenten-Arbeitskarte", () => {
    assert.strictEqual(workItemBefore.resultConfirmed, false);
    assert.strictEqual(workItemBefore.resultText, "");
  });

  const accepted = AgentRuntime.acceptResult(beforeAccept, finishedPilot, { confirmed: true, now: "2026-07-13T09:10:00Z" });
  check("Akzeptanz verwendet bestehende Ergebnisrückführung", () => {
    const item = DailyWorkRun.getAgentReviewPhase(accepted.run).workItems.find((entry) => entry.agentId === pilotAgentId);
    assert.strictEqual(item.resultConfirmed, false);
    assert.ok(item.runtimePilotEvidence?.acceptedAt);
    assert.match(item.runtimePilotEvidence.resultText, /Lokaler deterministischer Pilot/);
    assert.ok(["WAITING", "READY"].includes(item.status));
  });

  check("bestehender bestätigter Befund wird nicht überschrieben", () => {
    assert.throws(
      () => AgentRuntime.acceptResult(accepted.run, finishedPilot, { confirmed: true }),
      /nicht überschrieben|bereits bestätigt/,
    );
  });

  check("Akzeptanz ist nur einmal möglich", () => {
    assert.strictEqual(accepted.pilot.status, "ACCEPTED");
    assert.throws(() => AgentRuntime.rejectResult(accepted.pilot), /prüfpflichtig/);
  });

  const rejectPilot = AgentRuntime.attachRuntimePilot(
    healthRun,
    AgentRuntime.rejectResult(finishedPilot, { reason: "Nicht passend" }),
  );
  check("Ablehnung verändert Arbeitskarte nicht", () => {
    const item = DailyWorkRun.getAgentReviewPhase(rejectPilot).workItems.find((entry) => entry.agentId === pilotAgentId);
    assert.strictEqual(item.resultConfirmed, false);
    assert.strictEqual(rejectPilot.agentRuntimePilot.status, "REJECTED");
  });

  check("Audit-Ereignisse sind append-only", () => {
    const originalLength = finishedPilot.auditLog.length;
    const withAccept = AgentRuntime.appendAudit(finishedPilot, {
      eventType: "RESULT_ACCEPTED",
      actor: "Jamal",
      fromStatus: "RESULT_REVIEW_REQUIRED",
      toStatus: "ACCEPTED",
      message: "Test",
    });
    assert.strictEqual(withAccept.auditLog.length, originalLength + 1);
    assert.strictEqual(withAccept.auditLog[0].eventType, finishedPilot.auditLog[0].eventType);
  });

  check("keine doppelten terminalen Audit-Ereignisse", () => {
    const acceptedPilot = AgentRuntime.appendAudit(finishedPilot, {
      eventType: "RESULT_ACCEPTED",
      actor: "Jamal",
      fromStatus: "RESULT_REVIEW_REQUIRED",
      toStatus: "ACCEPTED",
      message: "einmal",
    });
    assert.throws(
      () =>
        AgentRuntime.appendAudit(acceptedPilot, {
          eventType: "RESULT_REJECTED",
          actor: "Jamal",
          fromStatus: "ACCEPTED",
          toStatus: "REJECTED",
          message: "zweites terminal",
        }),
      /Terminaler/,
    );
  });

  const storage = mockStorage();
  const persisted = AgentRuntime.attachRuntimePilot(healthRun, finishedPilot);
  DailyWorkRun.saveDailyStore(storage, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), persisted));
  check("Runtime-Zustand bleibt nach Reload erhalten", () => {
    const reloaded = DailyWorkRun.getActiveRun(DailyWorkRun.loadDailyStore(storage));
    assert.deepStrictEqual(reloaded.agentRuntimePilot.status, "RESULT_REVIEW_REQUIRED");
    assert.deepStrictEqual(reloaded.agentRuntimePilot.result.summary, finishedPilot.result.summary);
  });

  const exportJson = LocalDataBackup.exportLocalDataJson(storage);
  const parsed = LocalDataBackup.parseExportJson(exportJson);
  const importStorage = mockStorage();
  LocalDataBackup.importLocalData(importStorage, parsed.export, { confirmed: true, importToken: "t1" });
  check("Backup-Round-trip erhält Runtime-Zustand", () => {
    const restored = DailyWorkRun.getActiveRun(DailyWorkRun.loadDailyStore(importStorage));
    assert.strictEqual(restored.agentRuntimePilot.runtimeAttemptId, finishedPilot.runtimeAttemptId);
    assert.strictEqual(restored.agentRuntimePilot.inputSnapshot.inputFingerprint, finishedPilot.inputSnapshot.inputFingerprint);
  });

  check("keine neue localStorage-Quelle", () => {
    assert.deepStrictEqual(LocalDataBackup.ALLOWED_STORAGE_KEYS, [
      "ki-unternehmenszentrale-v1",
      "ki-unternehmenszentrale-daily-work-runs-v1",
    ]);
  });

  check("schemaVersion bleibt kompatibel", () => {
    assert.strictEqual(persisted.schemaVersion, 1);
    const oldRun = DailyWorkRun.createDraftRun({ id: "old-no-runtime" });
    assert.strictEqual(oldRun.agentRuntimePilot, null);
    const store = DailyWorkRun.createStore({ activeRunId: oldRun.id, runs: [oldRun] });
    assert.strictEqual(DailyWorkRun.getActiveRun(store).agentRuntimePilot, null);
  });

  check("17 Projekte bleiben erhalten", () => assert.strictEqual(PROJECT_REGISTRY.length, 17));
  check("25 Agenten bleiben erhalten", () => assert.strictEqual(AgentRegistry.CANONICAL_AGENT_COUNT, 25));
  check("42 GET-Routen bleiben erhalten", () => {
    const routeCount = (fs.readFileSync(path.join(__dirname, "server.js"), "utf8").match(/^\s+\["\/api\//gm) || []).length;
    assert.strictEqual(routeCount, 42);
  });
  check("POST bleibt 405", () => assert.strictEqual(invoke("POST", "/api/projects").statusCode, 405));

  check("agent-runtime.js wird statisch ausgeliefert", () => {
    const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    assert.match(serverSource, /\["\/agent-runtime\.js", "agent-runtime\.js"\]/);
  });

  check("agent-runtime.test.js wird nicht ausgeliefert", () => {
    const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    assert.doesNotMatch(serverSource, /agent-runtime\.test\.js/);
  });

  const uiSource = fs.readFileSync(path.join(__dirname, "daily-work-run-ui.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  check("Event-Bindings werden nicht doppelt registriert", () => {
    assert.match(uiSource, /let eventsBound = false/);
    assert.strictEqual((uiSource.match(/setupDailyWorkRun\(/g) || []).length, 2);
  });

  check("UI nennt ausdrücklich lokalen deterministischen Pilot", () => {
    assert.match(uiSource, /Lokaler deterministischer Pilot/);
    assert.match(uiSource, /Agenten-Laufzeit-Pilot/);
  });

  check("sichtbarer Rollenname bleibt Projektmanager-Agent", () => {
    assert.match(uiSource, /PROJEKTMANAGER_ROLE_NAME/);
    assert.match(uiSource, /<strong>\$\{deps\.escapeHtml\(runtime\.PROJEKTMANAGER_ROLE_NAME\)\}<\/strong>/);
    assert.doesNotMatch(uiSource, /<strong>\$\{deps\.escapeHtml\(pilotAgent\.agent\?\.name/);
  });

  check("technische Agenten-ID wird zurückhaltend ergänzt", () => {
    assert.match(uiSource, /Technische Agenten-ID:/);
    assert.match(uiSource, /pilotAgent\.agentId/);
    assert.match(uiSource, /daily-work-runtime-agent-meta/);
  });

  check("keine zweite Agentenquelle im UI-Modul", () => {
    assert.doesNotMatch(uiSource, /ROLE_NAME_MAPPING/);
    assert.doesNotMatch(uiSource, /CANONICAL_AGENT/);
    assert.doesNotMatch(uiSource, /PRODUCTIVE_AGENT_REGISTRY/);
  });

  check("UI behauptet keine externe KI-Ausführung", () => {
    assert.match(uiSource, /keine externe KI/);
    assert.doesNotMatch(uiSource, /KI-Agent arbeitet|selbstständig gearbeitet|externe KI-Ausführung/i);
  });

  check("Pilot bleibt auf kanonischen Projektmanager-Agenten beschränkt", () => {
    assert.strictEqual(AgentRuntime.resolveProjektmanagerAgentId(), "orchestrator-agent");
    assert.strictEqual(AgentRuntime.HEALTH_PILOT_PROJECT_ID, "health-upgrade-kompass");
    const availability = AgentRuntime.evaluateAvailability(preparedRun);
    assert.strictEqual(availability.pilotAgentId, "orchestrator-agent");
  });

  check("writeOperationsBlocked und madeExternalRequest bleiben unverändert", () => {
    assert.strictEqual(API_SECURITY_FLAGS.writeOperationsBlocked, true);
    assert.strictEqual(API_SECURITY_FLAGS.madeExternalRequest, false);
    assert.strictEqual(finishedPilot.result.externalRequestMade, false);
    assert.strictEqual(preparedRun.agentRuntimePilot.localDeterministicPilotOnly, true);
  });

  check("script-Reihenfolge enthält agent-runtime.js", () => {
    assert.match(
      htmlSource,
      /<script src="health-hybrid-work\.js"><\/script>\s*<script src="daily-work-run\.js"><\/script>\s*<script src="agent-runtime\.js"><\/script>\s*<script src="local-data-backup\.js"><\/script>/,
    );
  });

  check("DailyWorkRunUi bindet AgentRuntime ohne Kopie der Geschäftslogik", () => {
    assert.match(uiSource, /require\("\.\/agent-runtime"\)/);
    assert.match(uiSource, /createRuntimePilot/);
    assert.doesNotMatch(uiSource, /function createLocalDeterministicPilotExecutor/);
  });

  assert.strictEqual(passed, 56);
  console.log("agent-runtime.test.js: 56 Prüfpunkte erfolgreich");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
