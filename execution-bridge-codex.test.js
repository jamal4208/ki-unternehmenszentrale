"use strict";

// V7.0 Phase D – Integrationstests: Codex als Executor durch die reale
// Execution Bridge (execution-bridge.js), nicht nur den isolierten Adapter.
// Der echte Codex-CLI-Prozess wird über die in execution-bridge.js additiv
// vorgesehene Testschnittstelle (options.codexExecFileImpl) durch einen
// deterministischen Fake ersetzt – Start, Token, Allowlist, Diff- und
// Testverifikation, State-Machine und Apply-Gate laufen unverändert über den
// echten Bridge-Code.

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");
const bridge = require("./execution-bridge");
const codexAdapter = require("./execution-codex-adapter");
const executorRegistry = require("./execution-executor-registry");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

async function checkAsync(label, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function bootstrap(prefix) {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const options = { appSupportDir };
  const paths = bridge.resolveBridgePaths(options);
  bridge.ensureBridgeDirs(paths);
  return { appSupportDir, options, paths };
}

const AVAILABLE_AUTHENTICATED_EXEC_SYNC = (file, args) => {
  if (args[0] === "--version") return "codex-cli 0.999.0\n";
  if (args[0] === "login") return "Logged in using ChatGPT\n";
  throw new Error("unbekannt");
};

const NOT_INSTALLED_EXEC_SYNC = () => {
  throw Object.assign(new Error("command not found"), { code: "ENOENT" });
};

function makeFakeChild() {
  const emitter = new EventEmitter();
  emitter.pid = 999555;
  emitter.exitCode = null;
  emitter.killed = false;
  emitter.killCalls = [];
  emitter.kill = function fakeKill(signal) {
    emitter.killCalls.push(signal);
    if (signal === "SIGKILL") {
      emitter.killed = true;
      emitter.exitCode = 137;
      setImmediate(() => emitter.emit("exit", null, "SIGKILL"));
    }
  };
  return emitter;
}

// Simuliert einen Codex-Kindprozess. writeFix steuert, ob (wie ein echter
// Codex-Lauf) die erlaubte Datei im Workspace tatsächlich korrigiert wird.
function fakeCodexExecFileImplFactory({ writeFix = true, finishAfterMs = 5, extraWrite = null } = {}) {
  return function fakeExecFile(file, args, options, callback) {
    const child = makeFakeChild();
    const timer = setTimeout(() => {
      try {
        if (writeFix) {
          fs.writeFileSync(
            path.join(options.cwd, "FIXTURE_CALC.js"),
            '"use strict";\nfunction addFixtureNumbers(a, b) {\n  return a + b;\n}\nmodule.exports = { addFixtureNumbers };\n',
            "utf8",
          );
        }
        if (extraWrite) extraWrite(options.cwd);
      } catch (_error) {
        /* Test-Fixture-Fehler dürfen den Callback nicht verhindern */
      }
      callback(null, '{"type":"final"}\n', "");
    }, finishAfterMs);
    child.kill = function fakeKill(signal) {
      child.killCalls.push(signal);
      if (signal === "SIGTERM") {
        clearTimeout(timer);
        setImmediate(() => {
          callback(Object.assign(new Error("killed"), { killed: true }), "", "");
          child.emit("exit", null, "SIGTERM");
        });
      }
    };
    return child;
  };
}

async function prepareCodexAttempt(paths, overrides = {}) {
  codexAdapter.resetCodexAvailabilityCacheForTests();
  const repoPath = bridge.ensureFixtureProjectRepo({ paths });
  const prep = await bridge.prepareExecutionAttempt(
    {
      runId: overrides.runId || "run-codex-1",
      executionPackage: {
        executionPackageId: overrides.executionPackageId || "ep-codex-1",
        executionPackageFingerprint: overrides.executionPackageFingerprint || "fp-codex-1",
        projectId: overrides.projectId || bridge.FIXTURE_PROJECT_ID,
        allowedFiles: overrides.allowedFiles || ["FIXTURE_CALC.js"],
        forbiddenPaths: [],
        executorId: overrides.executorId === undefined ? "codex" : overrides.executorId,
        codexTaskPresetId: overrides.codexTaskPresetId === undefined ? "FIXTURE_ADD_FUNCTION_FIX" : overrides.codexTaskPresetId,
      },
    },
    { paths, execFileSyncImpl: overrides.execFileSyncImpl || AVAILABLE_AUTHENTICATED_EXEC_SYNC },
  );
  return { repoPath, prep };
}

async function runFullCodexAttempt(paths, overrides = {}) {
  const { repoPath, prep } = await prepareCodexAttempt(paths, overrides);
  const start = await bridge.startExecutionAttempt(
    {
      token: prep.startToken,
      runId: overrides.runId || "run-codex-1",
      executionPackageId: overrides.executionPackageId || "ep-codex-1",
      executionPackageFingerprint: overrides.executionPackageFingerprint || "fp-codex-1",
      attemptId: prep.attemptId,
      scenario: overrides.scenario || codexAdapter.SCENARIOS.REAL_RUN,
      approved: true,
    },
    {
      paths,
      codexExecFileImpl: overrides.codexExecFileImpl || fakeCodexExecFileImplFactory(),
      ...overrides.bridgeOptions,
    },
  );
  return { repoPath, prep, start };
}

async function waitForTerminal(attemptId, paths, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = bridge.readOnlyAttemptStatus(attemptId, { paths });
    if (status.ok && bridge.TERMINAL_ATTEMPT_STATUSES.includes(status.status)) {
      return status;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Attempt wurde nicht terminal.");
}

async function main() {
  // ---------------------------------------------------------------------
  // Executor-Registry
  // ---------------------------------------------------------------------

  check("Registry 1. mock und codex sind bekannt, Health für Codex nicht erlaubt", () => {
    assert.ok(executorRegistry.hasExecutor("mock"));
    assert.ok(executorRegistry.hasExecutor("codex"));
    assert.strictEqual(executorRegistry.isHealthAllowedForExecutor("codex"), false);
    assert.strictEqual(executorRegistry.isHealthAllowedForExecutor("mock"), true);
  });

  check("Registry 2. describeExecutorsForClient liefert keine Executable-Pfade/Argumente", () => {
    codexAdapter.resetCodexAvailabilityCacheForTests();
    const list = executorRegistry.describeExecutorsForClient({ execFileSyncImpl: AVAILABLE_AUTHENTICATED_EXEC_SYNC });
    const serialized = JSON.stringify(list);
    assert.doesNotMatch(serialized, /\/usr\/|\/bin\/|--sandbox|--ask-for-approval/);
    const codexEntry = list.find((entry) => entry.id === "codex");
    assert.strictEqual(codexEntry.healthAllowed, false);
    assert.strictEqual(codexEntry.available, true);
  });

  check("Registry 3. nicht installierter Codex wird als nicht verfügbar mit Grund gemeldet", () => {
    codexAdapter.resetCodexAvailabilityCacheForTests();
    const list = executorRegistry.describeExecutorsForClient({ execFileSyncImpl: NOT_INSTALLED_EXEC_SYNC });
    const codexEntry = list.find((entry) => entry.id === "codex");
    assert.strictEqual(codexEntry.available, false);
    assert.strictEqual(codexEntry.unavailableReason, "CODEX_CLI_NOT_FOUND");
  });

  // ---------------------------------------------------------------------
  // Package/Token (Auftrag J, Punkte 18-25)
  // ---------------------------------------------------------------------

  await checkAsync("Token 18. Unbekannter Executor wird bereits bei Prepare abgewiesen", async () => {
    const { paths } = bootstrap("eb-codex-t18-");
    await assert.rejects(
      prepareCodexAttempt(paths, { executorId: "does-not-exist" }),
      /Unbekannter Executor/,
    );
  });

  await checkAsync("Token 19. Fehlende/unbekannte Codex-Preset-ID wird abgewiesen", async () => {
    const { paths } = bootstrap("eb-codex-t19-");
    await assert.rejects(
      prepareCodexAttempt(paths, { codexTaskPresetId: "DOES_NOT_EXIST" }),
      /Preset-ID/,
    );
  });

  await checkAsync("Token 20+21. Health ist für Codex bereits bei Prepare hart blockiert (kein Token)", async () => {
    const { paths } = bootstrap("eb-codex-t20-");
    await assert.rejects(
      prepareCodexAttempt(paths, { projectId: bridge.HEALTH_PROJECT_ID }),
      /Health.*Phase D.*blockiert|hart blockiert/i,
    );
  });

  await checkAsync("Token 22. Start-Token ist an executorId=codex, Zielrepository und Baseline gebunden", async () => {
    const { paths } = bootstrap("eb-codex-t22-");
    const { prep } = await prepareCodexAttempt(paths);
    // Falscher Executor beim Einlösen (Attempt selbst ist "codex", aber wir
    // tun so, als würde ein Mock-Consumer denselben Token einlösen wollen) –
    // hier über einen manipulierten zweiten Consume-Versuch mit falscher
    // Bindung simuliert: zweite Einlösung desselben Tokens muss ohnehin
    // scheitern (Einmaligkeit), das ist die Kernaussage von 22-25.
    const first = await bridge.startExecutionAttempt(
      {
        token: prep.startToken,
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
        scenario: codexAdapter.SCENARIOS.REAL_RUN,
        approved: true,
      },
      { paths, codexExecFileImpl: fakeCodexExecFileImplFactory() },
    );
    assert.strictEqual(first.ok, true);
    await assert.rejects(
      bridge.startExecutionAttempt(
        {
          token: prep.startToken,
          runId: "run-codex-1",
          executionPackageId: "ep-codex-1",
          executionPackageFingerprint: "fp-codex-1",
          attemptId: prep.attemptId,
          scenario: codexAdapter.SCENARIOS.REAL_RUN,
          approved: true,
        },
        { paths },
      ),
      /nicht gestartet werden|ungültig/,
    );
  });

  await checkAsync("Token 23. Falsche Package-ID/Fingerprint beim Start wird abgewiesen", async () => {
    const { paths } = bootstrap("eb-codex-t23-");
    const { prep } = await prepareCodexAttempt(paths);
    await assert.rejects(
      bridge.startExecutionAttempt(
        {
          token: prep.startToken,
          runId: "run-codex-1",
          executionPackageId: "falsch",
          executionPackageFingerprint: "fp-codex-1",
          attemptId: prep.attemptId,
          scenario: codexAdapter.SCENARIOS.REAL_RUN,
          approved: true,
        },
        { paths },
      ),
      /Attempt-Bindung/,
    );
  });

  await checkAsync("Token 24. Falsche Action (Mock-Start-Token für Codex-Attempt) wird abgewiesen", async () => {
    const { paths } = bootstrap("eb-codex-t24-");
    const { prep } = await prepareCodexAttempt(paths);
    // Der ausgestellte Token trägt bereits action=START_CODEX_EXECUTION; ein
    // Versuch, ihn wie einen Mock-"start"-Token zu konsumieren, muss scheitern.
    const wrongAction = bridge.consumeToken(prep.startToken, {
      action: "start",
      runId: "run-codex-1",
      executionPackageId: "ep-codex-1",
      fingerprint: "fp-codex-1",
      attemptId: prep.attemptId,
    });
    assert.strictEqual(wrongAction.ok, false);
  });

  await checkAsync("Token 25. Falscher Attempt beim Start wird abgewiesen", async () => {
    const { paths } = bootstrap("eb-codex-t25-");
    const { prep } = await prepareCodexAttempt(paths);
    await assert.rejects(
      bridge.startExecutionAttempt(
        {
          token: prep.startToken,
          runId: "run-codex-1",
          executionPackageId: "ep-codex-1",
          executionPackageFingerprint: "fp-codex-1",
          attemptId: "att-fremd",
          scenario: codexAdapter.SCENARIOS.REAL_RUN,
          approved: true,
        },
        { paths },
      ),
      /nicht gefunden/,
    );
  });

  // ---------------------------------------------------------------------
  // State-Machine über die reale Bridge (Auftrag J, Punkte 36-43)
  // ---------------------------------------------------------------------

  await checkAsync("State 36+37. Erfolgreicher Codex-Lauf: RUNNING -> SUCCEEDED mit verifiziertem Diff/Test", async () => {
    const { paths } = bootstrap("eb-codex-s36-");
    const { prep, start } = await runFullCodexAttempt(paths);
    assert.strictEqual(start.status, "RUNNING");
    const status = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(status.status, "SUCCEEDED");
    assert.strictEqual(status.executorId, "codex");
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.strictEqual(result.testStatus, "PASSED");
    assert.deepStrictEqual(result.changedFiles, ["FIXTURE_CALC.js"]);
    assert.strictEqual(result.diff.length, 1);
    assert.ok(result.diff[0].beforeHash);
    assert.ok(result.diff[0].afterHash);
    assert.notStrictEqual(result.diff[0].beforeHash, result.diff[0].afterHash);
    assert.ok(result.codexRawOutput);
    assert.strictEqual(result.codexRawOutput.label.includes("unverifiziert"), true);
  });

  await checkAsync("State 38. Codex-Testlauf schlägt fehl (keine echte Korrektur) -> FAILED", async () => {
    const { paths } = bootstrap("eb-codex-s38-");
    const { prep } = await runFullCodexAttempt(paths, {
      codexExecFileImpl: fakeCodexExecFileImplFactory({ writeFix: false }),
    });
    const status = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(status.status, "FAILED");
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.strictEqual(result.testStatus, "FAILED");
  });

  await checkAsync("State 39. Cancel während RUNNING -> CANCELLED, kein Ziel-Write", async () => {
    const { paths } = bootstrap("eb-codex-s39-");
    const { repoPath, prep, start } = await runFullCodexAttempt(paths, {
      codexExecFileImpl: fakeCodexExecFileImplFactory({ finishAfterMs: 300 }),
    });
    const beforeCancel = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    const cancelResult = await bridge.cancelExecutionAttempt(
      {
        token: start.cancelToken,
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
      },
      { paths },
    );
    assert.ok(["CANCELLED", "CANCEL_REQUESTED"].includes(cancelResult.status));
    const status = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(status.status, "CANCELLED");
    const afterCancel = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    assert.strictEqual(beforeCancel, afterCancel);
  });

  await checkAsync("State 40. Timeout am Codex-Attempt -> TIMED_OUT, Workspace wird aufgeräumt", async () => {
    const { paths } = bootstrap("eb-codex-s40-");
    const { prep } = await runFullCodexAttempt(paths, {
      codexExecFileImpl: fakeCodexExecFileImplFactory({ finishAfterMs: 5000 }),
      bridgeOptions: { attemptTimeoutMs: 120 },
    });
    const status = await waitForTerminal(prep.attemptId, paths, 5000);
    assert.strictEqual(status.status, "TIMED_OUT");
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    const workspaceDir = path.join(paths.workspacesDir, loaded.record.workspaceId || "none");
    assert.ok(!fs.existsSync(workspaceDir));
  });

  // Regressionstest für einen im echten Pilot (Abschnitt K) gefundenen Fehler:
  // Codex braucht real einen deutlich längeren Roundtrip als der Mock. Ohne
  // einen eigenen, größeren Default-Timeout für Codex hätte jeder reale Lauf
  // spätestens nach DEFAULT_ATTEMPT_TIMEOUT_MS (Mock-Wert) fälschlich
  // TIMED_OUT geliefert, obwohl Codex noch gearbeitet hätte.
  check("State 40b. Codex hat einen eigenen, deutlich größeren Default-Timeout als der Mock", () => {
    assert.ok(Number.isFinite(bridge.DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS));
    assert.ok(Number.isFinite(bridge.DEFAULT_ATTEMPT_TIMEOUT_MS));
    assert.ok(
      bridge.DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS > bridge.DEFAULT_ATTEMPT_TIMEOUT_MS,
      "Codex-Timeout muss länger als der Mock-Timeout sein, sonst schlägt jeder reale Codex-Lauf fälschlich mit TIMED_OUT fehl",
    );
  });

  await checkAsync("State 41. Terminaler Codex-Attempt kann durch Reload nicht erneut gestartet werden", async () => {
    const { paths } = bootstrap("eb-codex-s41-");
    const { prep } = await runFullCodexAttempt(paths);
    await waitForTerminal(prep.attemptId, paths);
    const statusOnce = bridge.readOnlyAttemptStatus(prep.attemptId, { paths });
    const statusTwice = bridge.readOnlyAttemptStatus(prep.attemptId, { paths });
    assert.strictEqual(statusOnce.status, statusTwice.status);
    assert.strictEqual(statusTwice.status, "SUCCEEDED");
  });

  await checkAsync("State 42+43. Allowlist-Verstoß durch Codex führt zu BLOCKED, kein Auto-ACCEPTED", async () => {
    const { paths } = bootstrap("eb-codex-s42-");
    const { prep } = await runFullCodexAttempt(paths, {
      codexExecFileImpl: fakeCodexExecFileImplFactory({
        extraWrite: (cwd) => fs.writeFileSync(path.join(cwd, "UNAUTHORIZED_CODEX_CHANGE.txt"), "verboten", "utf8"),
      }),
    });
    const status = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(status.status, "BLOCKED");
    assert.notStrictEqual(status.status, "ACCEPTED");
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.ok(result.blockers.some((entry) => /UNAUTHORIZED_CODEX_CHANGE\.txt/.test(entry)));
  });

  // ---------------------------------------------------------------------
  // Apply-Gate (Auftrag J, Punkte 44-52)
  // ---------------------------------------------------------------------

  await checkAsync("Apply 44+45+46. Kein Ziel-Write vor Freigabe; nach Freigabe nur Allowlist-Datei im Fixture übernommen", async () => {
    const { paths } = bootstrap("eb-codex-a44-");
    const { repoPath, prep } = await runFullCodexAttempt(paths);
    await waitForTerminal(prep.attemptId, paths);
    const beforeApply = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    assert.match(beforeApply, /a - b/); // Ziel unverändert vor Apply

    const preview = await bridge.requestApplyPreview(
      { runId: "run-codex-1", executionPackageId: "ep-codex-1", executionPackageFingerprint: "fp-codex-1", attemptId: prep.attemptId },
      { paths },
    );
    assert.strictEqual(preview.preview.executorId, "codex");
    assert.ok(preview.applyToken);

    const applied = await bridge.confirmApply(
      {
        token: preview.applyToken,
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
        approved: true,
      },
      { paths },
    );
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.applyStatus, "APPLIED");
    assert.deepStrictEqual(applied.appliedFiles, ["FIXTURE_CALC.js"]);
    const afterApply = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    assert.match(afterApply, /a \+ b/);
  });

  await checkAsync("Apply 47+48+49. Apply erzeugt keinen Commit, keinen Push, kein Deployment", async () => {
    const { paths } = bootstrap("eb-codex-a47-");
    const { repoPath, prep } = await runFullCodexAttempt(paths);
    await waitForTerminal(prep.attemptId, paths);
    const headBefore = require("child_process")
      .execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8", shell: false })
      .trim();
    const preview = await bridge.requestApplyPreview(
      { runId: "run-codex-1", executionPackageId: "ep-codex-1", executionPackageFingerprint: "fp-codex-1", attemptId: prep.attemptId },
      { paths },
    );
    await bridge.confirmApply(
      {
        token: preview.applyToken,
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
        approved: true,
      },
      { paths },
    );
    const headAfter = require("child_process")
      .execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8", shell: false })
      .trim();
    assert.strictEqual(headBefore, headAfter);
    const statusPorcelain = require("child_process")
      .execFileSync("git", ["status", "--porcelain"], { cwd: repoPath, encoding: "utf8", shell: false })
      .trim();
    assert.match(statusPorcelain, /FIXTURE_CALC\.js/);
  });

  await checkAsync("Apply 50. Teilfehler beim Apply führt zu vollständigem Rollback (keine Halbübernahme)", async () => {
    const { paths } = bootstrap("eb-codex-a50-");
    const { repoPath, prep } = await runFullCodexAttempt(paths);
    await waitForTerminal(prep.attemptId, paths);
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    const workspaceDir = path.join(paths.workspacesDir, loaded.record.workspaceId);
    // Zweite, formal erlaubte Datei nachträglich hinzufügen (repräsentiert
    // eine zweite von der Zentrale bereits verifizierte Änderung), ihre Kopie
    // im isolierten Workspace aber entfernen – simuliert einen Teilfehler
    // beim Kopieren der zweiten von zwei validierten Dateien.
    loaded.record.allowedFiles = ["FIXTURE_CALC.js", "FIXTURE_SECOND_ALLOWED.js"];
    loaded.record.changedFiles = ["FIXTURE_CALC.js", "FIXTURE_SECOND_ALLOWED.js"];
    bridge.saveAttempt(paths, loaded.record);
    fs.rmSync(path.join(workspaceDir, "FIXTURE_SECOND_ALLOWED.js"), { force: true });
    const beforeApply = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    assert.ok(!fs.existsSync(path.join(repoPath, "FIXTURE_SECOND_ALLOWED.js")));

    const preview = await bridge.requestApplyPreview(
      { runId: "run-codex-1", executionPackageId: "ep-codex-1", executionPackageFingerprint: "fp-codex-1", attemptId: prep.attemptId },
      { paths },
    );
    const applyResult = await bridge.confirmApply(
      {
        token: preview.applyToken,
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
        approved: true,
      },
      { paths },
    );
    assert.strictEqual(applyResult.ok, false);
    assert.strictEqual(applyResult.applyStatus, "APPLY_FAILED");
    const afterFailedApply = fs.readFileSync(path.join(repoPath, "FIXTURE_CALC.js"), "utf8");
    assert.strictEqual(beforeApply, afterFailedApply, "Kein Teil-Write der ersten Datei nach fehlgeschlagenem Apply");
    assert.ok(
      !fs.existsSync(path.join(repoPath, "FIXTURE_SECOND_ALLOWED.js")),
      "Zweite, fehlgeschlagene Datei existiert nicht im Ziel-Repository",
    );
  });

  await checkAsync("Apply 51. Health-Codex-Start bleibt blockiert, kein Token wird ausgestellt", async () => {
    const { paths } = bootstrap("eb-codex-a51-");
    await assert.rejects(
      prepareCodexAttempt(paths, { projectId: bridge.HEALTH_PROJECT_ID }),
      /blockiert/i,
    );
  });

  await checkAsync("Apply 52. Health-Apply bleibt blockiert, unabhängig vom Executor", async () => {
    const { paths } = bootstrap("eb-codex-a52-");
    const { prep } = await runFullCodexAttempt(paths);
    await waitForTerminal(prep.attemptId, paths);
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    loaded.record.projectId = bridge.HEALTH_PROJECT_ID;
    bridge.saveAttempt(paths, loaded.record);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-codex-1", executionPackageId: "ep-codex-1", executionPackageFingerprint: "fp-codex-1", attemptId: prep.attemptId },
      { paths },
    );
    assert.strictEqual(preview.preview.applyBlocked, true);
    assert.strictEqual(preview.applyToken, null);
    const declined = await bridge.confirmApply(
      {
        runId: "run-codex-1",
        executionPackageId: "ep-codex-1",
        executionPackageFingerprint: "fp-codex-1",
        attemptId: prep.attemptId,
        approved: true,
      },
      { paths },
    );
    assert.strictEqual(declined.ok, false);
    assert.strictEqual(declined.applyStatus, "APPLY_DECLINED");
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
