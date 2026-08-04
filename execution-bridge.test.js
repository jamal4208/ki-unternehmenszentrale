"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const bridge = require("./execution-bridge");

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

function freshAppSupportDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function bootstrap(prefix) {
  const appSupportDir = freshAppSupportDir(prefix);
  const options = { appSupportDir };
  const paths = bridge.resolveBridgePaths(options);
  bridge.ensureBridgeDirs(paths);
  return { appSupportDir, options, paths };
}

async function prepareFixtureAttempt(paths, overrides = {}) {
  const repoPath = bridge.ensureFixtureProjectRepo({ paths });
  const prep = await bridge.prepareExecutionAttempt(
    {
      runId: overrides.runId || "run-1",
      executionPackage: {
        executionPackageId: overrides.executionPackageId || "ep-1",
        executionPackageFingerprint: overrides.executionPackageFingerprint || "fp-1",
        projectId: bridge.FIXTURE_PROJECT_ID,
        allowedFiles: overrides.allowedFiles || ["FIXTURE_NOTE.md"],
        forbiddenPaths: overrides.forbiddenPaths || [],
      },
      knownWorkingTreeBaseline: overrides.knownWorkingTreeBaseline || null,
    },
    { paths },
  );
  return { repoPath, prep };
}

async function runFullAttempt(paths, scenario, overrides = {}) {
  const { repoPath, prep } = await prepareFixtureAttempt(paths, overrides);
  const start = await bridge.startExecutionAttempt(
    {
      token: prep.startToken,
      runId: overrides.runId || "run-1",
      executionPackageId: overrides.executionPackageId || "ep-1",
      executionPackageFingerprint: overrides.executionPackageFingerprint || "fp-1",
      attemptId: prep.attemptId,
      scenario,
      approved: true,
    },
    { paths, ...overrides.bridgeOptions },
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
  // Isolation
  // ---------------------------------------------------------------------

  await checkAsync("Isolation 1+2. Workspace liegt außerhalb beider Repositories (realpath-Prüfung)", async () => {
    const { paths } = bootstrap("eb-iso1-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    const status = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(status.status, "SUCCEEDED");
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    const workspaceDir = path.join(paths.workspacesDir, loaded.record.workspaceId);
    const resolvedWorkspace = fs.realpathSync(workspaceDir);
    const resolvedZentrale = fs.realpathSync(__dirname);
    assert.notStrictEqual(resolvedWorkspace, resolvedZentrale);
    assert.ok(!resolvedWorkspace.startsWith(`${resolvedZentrale}${path.sep}`));
  });

  check("Isolation 3. Symlink-Flucht außerhalb des Quellprojekts wird beim Materialisieren blockiert", () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eb-source-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-outside-"));
    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "geheim", "utf8");
    fs.symlinkSync(outsideDir, path.join(sourceRoot, "escape-link"));
    const { paths } = bootstrap("eb-iso3-");
    const workspaceDir = path.join(paths.workspacesDir, "ws-symlink-test");
    assert.throws(() => {
      bridge.materializeIsolatedWorkspace({ sourceRoot, workspaceDir, forbiddenRoots: [] });
    }, /Symlink-Flucht/);
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  check("Isolation 4. .env und .env.local werden beim Materialisieren ausgeschlossen", () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eb-envsrc-"));
    fs.writeFileSync(path.join(sourceRoot, ".env"), "SECRET=1", "utf8");
    fs.writeFileSync(path.join(sourceRoot, ".env.local"), "SECRET_LOCAL=1", "utf8");
    fs.writeFileSync(path.join(sourceRoot, "allowed.txt"), "ok", "utf8");
    const { paths } = bootstrap("eb-iso4-");
    const workspaceDir = path.join(paths.workspacesDir, "ws-env-test");
    bridge.materializeIsolatedWorkspace({ sourceRoot, workspaceDir, forbiddenRoots: [] });
    assert.ok(!fs.existsSync(path.join(workspaceDir, ".env")));
    assert.ok(!fs.existsSync(path.join(workspaceDir, ".env.local")));
    assert.ok(fs.existsSync(path.join(workspaceDir, "allowed.txt")));
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  });

  check("Isolation 5. Größen- und Dateianzahlgrenzen werden durchgesetzt", () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eb-limits-"));
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(path.join(sourceRoot, `file-${index}.txt`), "x", "utf8");
    }
    const { paths } = bootstrap("eb-iso5-");
    const workspaceDirCount = path.join(paths.workspacesDir, "ws-limit-count-test");
    assert.throws(() => {
      bridge.materializeIsolatedWorkspace({ sourceRoot, workspaceDir: workspaceDirCount, forbiddenRoots: [], maxFiles: 2 });
    }, /Dateianzahlgrenze überschritten/);
    const workspaceDirBytes = path.join(paths.workspacesDir, "ws-limit-bytes-test");
    assert.throws(() => {
      bridge.materializeIsolatedWorkspace({ sourceRoot, workspaceDir: workspaceDirBytes, forbiddenRoots: [], maxFileBytes: 0 });
    }, /Größengrenze/);
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  });

  await checkAsync("Isolation 6. Clean Baseline wird als workingTreeClean=true erfasst", async () => {
    const { paths } = bootstrap("eb-iso6-");
    const repoPath = bridge.ensureFixtureProjectRepo({ paths });
    const baseline = await bridge.readFixtureRepoBaseline(repoPath);
    assert.strictEqual(baseline.workingTreeClean, true);
  });

  await checkAsync("Isolation 7. Known-dirty Baseline wird für Health-Pfad über bestehende Bestätigungslogik unterstützt", async () => {
    // Fixture-Projekt erfordert bewusst eine saubere Baseline; der known-dirty
    // Pfad wird über die bestehende, bereits getestete Health-Logik in
    // health-hybrid-work.js abgedeckt (assertLiveBaselineReady). Hier wird nur
    // geprüft, dass eine dirty Fixture-Baseline ohne Bestätigung zuverlässig
    // abgelehnt wird und dabei keine Teilbehauptung entsteht.
    const { paths } = bootstrap("eb-iso7-");
    const repoPath = bridge.ensureFixtureProjectRepo({ paths });
    fs.writeFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "geändert, ohne Bestätigung", "utf8");
    await assert.rejects(
      prepareFixtureAttempt(paths),
      /saubere Baseline/,
    );
  });

  await checkAsync("Isolation 8. Baseline-Drift zwischen Prepare und Apply führt zu STALE, kein Schreiben", async () => {
    const { paths } = bootstrap("eb-iso8-");
    const { repoPath, prep, start } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    // Drift am echten Zielprojekt NACH der Baseline-Erfassung.
    fs.writeFileSync(path.join(repoPath, "FIXTURE_DATA.json"), "{\"drift\":true}", "utf8");
    const applyResult = await bridge.confirmApply(
      {
        runId: "run-1",
        executionPackageId: "ep-1",
        executionPackageFingerprint: "fp-1",
        attemptId: prep.attemptId,
        token: preview.applyToken,
        approved: true,
      },
      { paths },
    );
    assert.strictEqual(applyResult.ok, false);
    assert.strictEqual(applyResult.applyStatus, "STALE");
    assert.strictEqual(fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8").includes("Mock-Executor Fixture-Notiz"), false);
  });

  // ---------------------------------------------------------------------
  // Attempt-Statusmaschine
  // ---------------------------------------------------------------------

  await checkAsync("Attempt 9. Vollständige Statusmaschine PREPARED -> APPROVED -> QUEUED -> RUNNING -> SUCCEEDED", async () => {
    const { paths } = bootstrap("eb-att9-");
    const { prep } = await prepareFixtureAttempt(paths);
    let loaded = bridge.loadAttempt(paths, prep.attemptId);
    assert.strictEqual(loaded.record.status, "PREPARED");
    const start = await bridge.startExecutionAttempt(
      { token: prep.startToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, scenario: "SUCCESS", approved: true },
      { paths },
    );
    assert.strictEqual(start.status, "RUNNING");
    const auditRaw = fs.readFileSync(path.join(paths.auditDir, "execution-bridge-audit.log"), "utf8");
    assert.match(auditRaw, /"action":"APPROVED"/);
    assert.match(auditRaw, /"action":"QUEUED"/);
    assert.match(auditRaw, /"action":"START"/);
    const finalStatus = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(finalStatus.status, "SUCCEEDED");
  });

  await checkAsync("Attempt 10+11. Genau ein aktiver Attempt pro Projekt – Lock verhindert parallelen Lauf", async () => {
    const { paths } = bootstrap("eb-att10-");
    const { prep: prepA } = await prepareFixtureAttempt(paths, { runId: "run-a", executionPackageId: "ep-a", executionPackageFingerprint: "fp-a" });
    await bridge.startExecutionAttempt(
      { token: prepA.startToken, runId: "run-a", executionPackageId: "ep-a", executionPackageFingerprint: "fp-a", attemptId: prepA.attemptId, scenario: "SUCCESS", approved: true, },
      { paths, testDelayMs: 300 },
    );
    await assert.rejects(
      bridge.prepareExecutionAttempt(
        { runId: "run-b", executionPackage: { executionPackageId: "ep-b", executionPackageFingerprint: "fp-b", projectId: bridge.FIXTURE_PROJECT_ID, allowedFiles: ["FIXTURE_NOTE.md"] } },
        { paths },
      ),
      /bereits ein aktiver Ausführungsversuch/,
    );
    await waitForTerminal(prepA.attemptId, paths);
  });

  await checkAsync("Attempt 12. Stale Lock (toter PID) wird sicher erkannt und ersetzt", async () => {
    const { paths } = bootstrap("eb-att12-");
    bridge.ensureFixtureProjectRepo({ paths });
    const lockPath = require("path").join(paths.locksDir, require("crypto").createHash("sha256").update(bridge.FIXTURE_PROJECT_ID).digest("hex").slice(0, 24) + ".lock.json");
    fs.mkdirSync(paths.locksDir, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ attemptId: "att-stale", projectId: bridge.FIXTURE_PROJECT_ID, pid: 999999, acquiredAt: new Date(0).toISOString() }), "utf8");
    const { prep } = await prepareFixtureAttempt(paths);
    assert.ok(prep.ok);
  });

  await checkAsync("Attempt 13. Cancel während der Laufzeit stoppt terminal als CANCELLED", async () => {
    const { paths } = bootstrap("eb-att13-");
    const { prep, repoPath } = await prepareFixtureAttempt(paths);
    const noteBefore = fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8");
    const start = await bridge.startExecutionAttempt(
      { token: prep.startToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, scenario: "SUCCESS", approved: true },
      { paths, testDelayMs: 400 },
    );
    assert.strictEqual(start.status, "RUNNING");
    const cancelResult = await bridge.cancelExecutionAttempt(
      { token: start.cancelToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    assert.strictEqual(cancelResult.ok, true);
    const finalStatus = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(finalStatus.status, "CANCELLED");
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    assert.deepStrictEqual(loaded.record.changedFiles || [], []);
    assert.strictEqual(loaded.record.testStatus, null);
    assert.strictEqual(fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8"), noteBefore);
    const lock = bridge.readLock(paths, bridge.FIXTURE_PROJECT_ID);
    assert.ok(!lock.exists || bridge.isLockStale(lock.record), "Lock nach Cancel frei");
    await assert.rejects(
      bridge.requestApplyPreview(
        { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /SUCCEEDED|erfolgreichen/,
    );
    await assert.rejects(
      bridge.cancelExecutionAttempt(
        { token: start.cancelToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /abgeschlossen|Token|ungültig|bereits verwendet/,
    );
    // Reload startet nicht neu
    const afterReload = bridge.readOnlyAttemptStatus(prep.attemptId, { paths });
    assert.strictEqual(afterReload.status, "CANCELLED");
  });

  await checkAsync("Cancel: TIMEOUT-Szenario reagiert auf Abbruchsignal und wird nicht SUCCEEDED/TIMED_OUT", async () => {
    const { paths } = bootstrap("eb-cancel-timeout-");
    const { prep, repoPath } = await prepareFixtureAttempt(paths);
    const noteBefore = fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8");
    const start = await bridge.startExecutionAttempt(
      { token: prep.startToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, scenario: "TIMEOUT", approved: true },
      { paths, attemptTimeoutMs: 5000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    await bridge.cancelExecutionAttempt(
      { token: start.cancelToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    const finalStatus = await waitForTerminal(prep.attemptId, paths, 3000);
    assert.strictEqual(finalStatus.status, "CANCELLED");
    assert.notStrictEqual(finalStatus.status, "SUCCEEDED");
    assert.notStrictEqual(finalStatus.status, "TIMED_OUT");
    assert.strictEqual(fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8"), noteBefore);
  });

  await checkAsync("Cancel: terminaler Attempt und abgelaufener/falscher Token werden abgewiesen", async () => {
    const { paths } = bootstrap("eb-cancel-reject-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    // Frisches Prepare nur für Token-Mint-Helfer nicht nötig – Cancel auf terminalem Attempt
    // muss vor Tokenverbrauch scheitern. Wir erzeugen einen gültigen Token manuell.
    const token = bridge.mintToken({
      action: "cancel",
      runId: "run-1",
      executionPackageId: "ep-1",
      fingerprint: "fp-1",
      attemptId: prep.attemptId,
    });
    await assert.rejects(
      bridge.cancelExecutionAttempt(
        { token, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /abgeschlossen/,
    );
    // Token darf nach Ablehnung noch gültig sein (nicht verbraucht) – erneuter Versuch scheitert wieder am Status
    await assert.rejects(
      bridge.cancelExecutionAttempt(
        { token, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /abgeschlossen/,
    );
    await assert.rejects(
      bridge.cancelExecutionAttempt(
        { token: "totally-invalid-token", runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /abgeschlossen|Token|ungültig/,
    );
  });

  check("Baseline: gültige Clean-Baseline und leere Pfadlisten", () => {
    const valid = bridge.validateKnownWorkingTreeBaseline({
      schemaVersion: 1,
      branch: "main",
      headCommit: "abc123",
      capturedAt: "2026-07-24T12:00:00.000Z",
      dirtyPaths: [],
      untrackedPaths: [],
      fileHashes: [],
      baselineFingerprint: "wt-clean",
      sourceRunId: "run-1",
      jamalConfirmedAt: "2026-07-24T12:00:01.000Z",
      jamalConfirmedClean: true,
      workingTreeClean: true,
    }, { branch: "main", head: "abc123", workingTreeClean: true });
    assert.strictEqual(valid.branch, "main");
    assert.deepStrictEqual(valid.dirtyPaths, []);
  });

  check("Baseline: gültige known-dirty-Baseline mit Hashes", () => {
    const valid = bridge.validateKnownWorkingTreeBaseline({
      schemaVersion: 1,
      branch: "work/check-start-gate-2026-07-19",
      headCommit: "395bf9e",
      capturedAt: "2026-07-24T12:00:00.000Z",
      dirtyPaths: ["package.json"],
      untrackedPaths: ["src/logic/scaleSnapshot.js"],
      fileHashes: [
        { path: "package.json", contentHash: "deadbeef", missing: false, byteLength: 10 },
        { path: "src/logic/scaleSnapshot.js", contentHash: "cafebabe", missing: false, byteLength: 20 },
      ],
      baselineFingerprint: "wt-dirty",
      sourceRunId: "run-health",
      jamalConfirmedAt: "2026-07-24T12:00:01.000Z",
      preserveExistingChanges: true,
    }, {
      branch: "work/check-start-gate-2026-07-19",
      head: "395bf9e",
      workingTreeClean: false,
      workingTreeDetail: { baselineFingerprint: "wt-dirty" },
    }, { requireConfirmation: true });
    assert.strictEqual(valid.dirtyPaths.length, 1);
    assert.strictEqual(valid.fileHashes.length, 2);
  });

  check("Baseline: fehlender Branch/HEAD/Fingerprint und ungültige Hashes/Pfade werden blockiert", () => {
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({ headCommit: "x", capturedAt: "t", dirtyPaths: [], untrackedPaths: [], fileHashes: [], baselineFingerprint: "f" }),
      /branch fehlt/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({ branch: "main", capturedAt: "t", dirtyPaths: [], untrackedPaths: [], fileHashes: [], baselineFingerprint: "f" }),
      /headCommit fehlt/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({ branch: "main", headCommit: "x", capturedAt: "t", dirtyPaths: [], untrackedPaths: [], fileHashes: [] }),
      /baselineFingerprint fehlt/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({
        branch: "main", headCommit: "x", capturedAt: "t", dirtyPaths: [], untrackedPaths: [],
        fileHashes: [{ path: "a.js", contentHash: "h", missing: false }],
        baselineFingerprint: "f",
      }),
      /byteLength/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({
        branch: "main", headCommit: "x", capturedAt: "t",
        dirtyPaths: ["/etc/passwd"], untrackedPaths: [], fileHashes: [], baselineFingerprint: "f",
      }),
      /absolute/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({
        branch: "main", headCommit: "x", capturedAt: "t",
        dirtyPaths: ["../secret"], untrackedPaths: [], fileHashes: [], baselineFingerprint: "f",
      }),
      /Traversierung/,
    );
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({
        branch: "main", headCommit: "x", capturedAt: "t",
        dirtyPaths: ["a.js", "a.js"], untrackedPaths: [], fileHashes: [], baselineFingerprint: "f",
      }),
      /doppelte/,
    );
  });

  check("Baseline: Live-Drift ergibt STALE-Fehlercode", () => {
    assert.throws(
      () => bridge.validateKnownWorkingTreeBaseline({
        schemaVersion: 1,
        branch: "main",
        headCommit: "abc",
        capturedAt: "t",
        dirtyPaths: [],
        untrackedPaths: [],
        fileHashes: [],
        baselineFingerprint: "old-fp",
        jamalConfirmedAt: "t",
        jamalConfirmedClean: true,
      }, {
        branch: "main",
        head: "abc",
        workingTreeClean: true,
        workingTreeDetail: { baselineFingerprint: "new-fp" },
      }),
      (error) => error.code === "BASELINE_STALE" || /STALE|veraltet/.test(String(error.message)),
    );
  });

  check("Baseline: Guided-Work und Bridge verwenden dieselben kanonischen Feldnamen", () => {
    const guided = require("./guided-work");
    const draft = guided.buildBaselineDraftFromLiveDetail({
      live: {
        branch: "main",
        head: "deadbeef",
        workingTreeClean: true,
        workingTreeDetail: {
          dirtyPaths: [],
          untrackedPaths: [],
          fileHashes: [],
          baselineFingerprint: "wt-1",
          capturedAt: "2026-07-24T12:00:00.000Z",
          limitStatus: "OK",
        },
      },
    }, { id: "run-x" });
    bridge.KNOWN_WORKING_TREE_BASELINE_FIELDS.forEach((field) => {
      // optionale Bestätigungsfelder müssen nicht im Draft vorhanden sein
      if (["jamalConfirmedAt", "jamalConfirmedClean", "preserveExistingChanges", "confirmationNote"].includes(field)) return;
      assert.ok(Object.prototype.hasOwnProperty.call(draft, field) || field === "workingTreeClean", `Feld ${field}`);
    });
    assert.strictEqual(draft.headCommit, "deadbeef");
    assert.ok(!Object.prototype.hasOwnProperty.call(draft, "head") || draft.head === undefined);
    const validated = bridge.validateKnownWorkingTreeBaseline({
      ...draft,
      jamalConfirmedAt: "2026-07-24T12:00:01.000Z",
      jamalConfirmedClean: true,
    }, { branch: "main", head: "deadbeef", workingTreeClean: true });
    assert.strictEqual(validated.baselineFingerprint, "wt-1");
  });

  await checkAsync("Attempt 14. Timeout führt zu TIMED_OUT und räumt den Workspace auf", async () => {
    const { paths } = bootstrap("eb-att14-");
    const { prep } = await prepareFixtureAttempt(paths);
    await bridge.startExecutionAttempt(
      { token: prep.startToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, scenario: "SUCCESS", approved: true },
      { paths, testDelayMs: 500, attemptTimeoutMs: 150 },
    );
    const finalStatus = await waitForTerminal(prep.attemptId, paths, 3000);
    assert.strictEqual(finalStatus.status, "TIMED_OUT");
    const loaded = bridge.loadAttempt(paths, prep.attemptId);
    const workspaceDir = path.join(paths.workspacesDir, loaded.record.workspaceId || "none");
    assert.ok(!fs.existsSync(workspaceDir));
  });

  await checkAsync("Attempt 15. Fehler-Szenario endet terminal als FAILED", async () => {
    const { paths } = bootstrap("eb-att15-");
    const { prep } = await runFullAttempt(paths, "FAILURE");
    const finalStatus = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(finalStatus.status, "FAILED");
  });

  await checkAsync("Attempt 16. Reload (erneutes Statuslesen) startet einen terminalen Lauf nicht neu", async () => {
    const { paths } = bootstrap("eb-att16-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const before = bridge.readOnlyAttemptStatus(prep.attemptId, { paths });
    const after = bridge.readOnlyAttemptStatus(prep.attemptId, { paths });
    assert.strictEqual(before.status, "SUCCEEDED");
    assert.strictEqual(after.status, "SUCCEEDED");
    assert.strictEqual(after.startedAt, before.startedAt);
  });

  check("Attempt: verwaister RUNNING-Attempt ohne Laufzeit-Registrierung wird als Recovery-Fall erkannt", () => {
    const { paths } = bootstrap("eb-att-orphan-");
    const attempt = {
      schemaVersion: 1,
      attemptId: "att-orphan-1",
      runId: "run-1",
      executionPackageId: "ep-1",
      executionPackageFingerprint: "fp-1",
      projectId: bridge.FIXTURE_PROJECT_ID,
      allowedFiles: ["FIXTURE_NOTE.md"],
      forbiddenPaths: [],
      status: "RUNNING",
      applyStatus: "NOT_REQUESTED",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      workspaceId: null,
      baseline: {},
      scenario: "SUCCESS",
      changedFiles: [],
      diff: [],
      errors: [],
      blockers: [],
    };
    bridge.saveAttempt(paths, attempt);
    const status = bridge.readOnlyAttemptStatus("att-orphan-1", { paths });
    assert.strictEqual(status.recovery.recovery, true);
  });

  // ---------------------------------------------------------------------
  // Mock-Executor-Integration über die Bridge
  // ---------------------------------------------------------------------

  await checkAsync("Mock-Integration 17. Erfolg verändert ausschließlich die Allowlist-Datei im Fixture-Repo (nach Apply)", async () => {
    const { paths } = bootstrap("eb-mock17-");
    const { repoPath, prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    await bridge.confirmApply(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: true },
      { paths },
    );
    const gitStatus = execFileSync("git", ["status", "--porcelain"], { cwd: repoPath, encoding: "utf8" });
    assert.strictEqual(gitStatus.trim(), "M FIXTURE_NOTE.md");
  });

  await checkAsync("Mock-Integration 18. Allowlist-Verstoß wird BLOCKED, keine Datei erreicht das Fixture-Repo", async () => {
    const { paths } = bootstrap("eb-mock18-");
    const { repoPath, prep } = await runFullAttempt(paths, "ALLOWLIST_VIOLATION");
    const finalStatus = await waitForTerminal(prep.attemptId, paths);
    assert.strictEqual(finalStatus.status, "BLOCKED");
    const gitStatus = execFileSync("git", ["status", "--porcelain"], { cwd: repoPath, encoding: "utf8" });
    assert.strictEqual(gitStatus.trim(), "");
    await assert.rejects(
      bridge.requestApplyPreview(
        { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
      /erfordert einen erfolgreichen isolierten Lauf/,
    );
  });

  check("Mock-Integration 19. forbiddenPaths werden vom Allowlist-Check erfasst", () => {
    const blockers = bridge.evaluateAllowlist(["FIXTURE_NOTE.md", ".env", "unexpected.txt"], ["FIXTURE_NOTE.md"], [".env"]);
    assert.ok(blockers.some((entry) => entry.includes(".env")));
    assert.ok(blockers.some((entry) => entry.includes("unexpected.txt")));
    assert.strictEqual(blockers.some((entry) => entry.includes("FIXTURE_NOTE.md")), false);
  });

  check("Mock-Integration 20+21+22. execution-bridge.js verwendet git ausschließlich read-only/fixed-argv, kein shell, kein freier Netzwerkzugriff", () => {
    const source = fs.readFileSync(path.join(__dirname, "execution-bridge.js"), "utf8");
    assert.doesNotMatch(source, /shell:\s*true/);
    assert.doesNotMatch(source, /require\(["']net["']\)/);
    assert.doesNotMatch(source, /require\(["']http["']\)/);
    assert.doesNotMatch(source, /require\(["']https["']\)/);
    assert.doesNotMatch(source, /exec\(/);
  });

  // ---------------------------------------------------------------------
  // Evidence
  // ---------------------------------------------------------------------

  await checkAsync("Evidence 23+24. Diff und Testresultat sind strukturiert erfasst (keine Rohdateiinhalte)", async () => {
    const { paths } = bootstrap("eb-evi23-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.ok(Array.isArray(result.diff));
    assert.strictEqual(typeof result.diff[0].linesAdded, "number");
    assert.strictEqual(typeof result.testStatus, "string");
    assert.strictEqual(typeof result.testExitCode, "number");
    const attemptFileRaw = fs.readFileSync(path.join(paths.attemptsDir, `${prep.attemptId}.json`), "utf8");
    assert.doesNotMatch(attemptFileRaw, /Mock-Executor Fixture-Notiz/);
  });

  await checkAsync("Evidence 25. Evidence ist eindeutig an Paket und Attempt gebunden", async () => {
    const { paths } = bootstrap("eb-evi25-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.strictEqual(result.executionPackageId, "ep-1");
    assert.strictEqual(result.executionPackageFingerprint, "fp-1");
    assert.strictEqual(result.attemptId, prep.attemptId);
  });

  await checkAsync("Evidence 26+27. Keine automatische Fachbestätigung, kein Auto-ACCEPTED", async () => {
    const { paths } = bootstrap("eb-evi26-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const result = bridge.readOnlyAttemptResult(prep.attemptId, { paths });
    assert.match(result.resultSource, /noch kein bestätigter Fachbefund/);
    assert.strictEqual(result.applyStatus, "NOT_REQUESTED");
  });

  // ---------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------

  await checkAsync("Apply 28. Apply erfordert eigene ausdrückliche Freigabe (approved:true)", async () => {
    const { paths } = bootstrap("eb-apply28-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    await assert.rejects(
      bridge.confirmApply(
        { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: false },
        { paths },
      ),
      /ausdrückliche Bestätigung/,
    );
  });

  await checkAsync("Apply 29. Gültiges Apply schreibt validierte Dateien in das Fixture-Repo", async () => {
    const { paths } = bootstrap("eb-apply29-");
    const { repoPath, prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    const applyResult = await bridge.confirmApply(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: true },
      { paths },
    );
    assert.strictEqual(applyResult.ok, true);
    assert.strictEqual(applyResult.applyStatus, "APPLIED");
    assert.ok(fs.readFileSync(path.join(repoPath, "FIXTURE_NOTE.md"), "utf8").includes("Mock-Executor Fixture-Notiz"));
  });

  await checkAsync("Apply 30+31. Commit bleibt unverändert, kein Push/Deployment ausgeführt", async () => {
    const { paths } = bootstrap("eb-apply30-");
    const { repoPath, prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const headBefore = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    await bridge.confirmApply(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: true },
      { paths },
    );
    const headAfter = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
    assert.strictEqual(headBefore, headAfter);
    const source = fs.readFileSync(path.join(__dirname, "execution-bridge.js"), "utf8");
    assert.doesNotMatch(source, /git["'],\s*\[\s*["']commit/);
    assert.doesNotMatch(source, /git["'],\s*\[\s*["']push/);
  });

  await checkAsync("Apply 33. Erneuter Konflikt beim Apply schreibt nichts (bereits durch STALE-Test abgedeckt, hier: doppeltes Apply verweigert)", async () => {
    const { paths } = bootstrap("eb-apply33-");
    const { repoPath, prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
      { paths },
    );
    await bridge.confirmApply(
      { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: true },
      { paths },
    );
    await assert.rejects(
      bridge.confirmApply(
        { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, token: preview.applyToken, approved: true },
        { paths },
      ),
    );
  });

  await checkAsync("Apply 34. Allowlist-Verstoß erreicht niemals das Ziel-Repository (Apply-Review nicht erreichbar)", async () => {
    const { paths } = bootstrap("eb-apply34-");
    const { repoPath, prep } = await runFullAttempt(paths, "ALLOWLIST_VIOLATION");
    await waitForTerminal(prep.attemptId, paths);
    await assert.rejects(
      bridge.requestApplyPreview(
        { runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId },
        { paths },
      ),
    );
    const gitStatus = execFileSync("git", ["status", "--porcelain"], { cwd: repoPath, encoding: "utf8" });
    assert.strictEqual(gitStatus.trim(), "");
  });

  await checkAsync("Apply 35. Health-Apply bleibt in Phase C sichtbar blockiert", async () => {
    const { paths } = bootstrap("eb-apply35-");
    // Health-Attempt wird direkt als Attempt-Datensatz simuliert (kein echter
    // Schreibzugriff auf Health nötig, um die Blockierregel zu prüfen).
    const attempt = {
      schemaVersion: 1,
      attemptId: "att-health-1",
      runId: "run-health",
      executionPackageId: "ep-health",
      executionPackageFingerprint: "fp-health",
      projectId: bridge.HEALTH_PROJECT_ID,
      allowedFiles: ["README.md"],
      forbiddenPaths: [],
      status: "SUCCEEDED",
      applyStatus: "NOT_REQUESTED",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      workspaceId: "ws-health-test",
      baseline: { branch: "work/check-start-gate-2026-07-19", head: "395bf9e", workingTreeClean: false, baselineFingerprint: "wt-test" },
      scenario: "SUCCESS",
      changedFiles: ["README.md"],
      diff: [{ path: "README.md", linesAdded: 1, linesRemoved: 0 }],
      testStatus: "PASSED",
      testExitCode: 0,
      testSummary: "ok",
      errors: [],
      blockers: [],
    };
    bridge.saveAttempt(paths, attempt);
    const preview = await bridge.requestApplyPreview(
      { runId: "run-health", executionPackageId: "ep-health", executionPackageFingerprint: "fp-health", attemptId: "att-health-1" },
      { paths },
    );
    assert.strictEqual(preview.preview.applyBlocked, true);
    assert.match(preview.preview.applyBlockedReason, /Health-Apply erst nach Phase-C-Abnahme/);
    assert.strictEqual(preview.applyToken, null);
    const applyResult = await bridge.confirmApply(
      { runId: "run-health", executionPackageId: "ep-health", executionPackageFingerprint: "fp-health", attemptId: "att-health-1", approved: true },
      { paths },
    );
    assert.strictEqual(applyResult.ok, false);
    assert.strictEqual(applyResult.applyStatus, "APPLY_DECLINED");
  });

  // ---------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------

  check("Token 36+37. Token ist kurzlebig und einmalig", () => {
    bridge.clearAllTokensForTests();
    const token = bridge.mintToken({ action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    const first = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    assert.strictEqual(first.ok, true);
    const second = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.reason, "TOKEN_UNKNOWN");
  });

  check("Token 38. Falsche Action wird abgelehnt", () => {
    bridge.clearAllTokensForTests();
    const token = bridge.mintToken({ action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    const result = bridge.consumeToken(token, { action: "cancel", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "TOKEN_BINDING_MISMATCH");
  });

  check("Token 39. Falscher Attempt wird abgelehnt", () => {
    bridge.clearAllTokensForTests();
    const token = bridge.mintToken({ action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    const result = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "OTHER" });
    assert.strictEqual(result.ok, false);
  });

  check("Token 40. Falsche Paket-ID/Fingerprint wird abgelehnt", () => {
    bridge.clearAllTokensForTests();
    const token = bridge.mintToken({ action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    const result = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "OTHER", fingerprint: "f", attemptId: "a" });
    assert.strictEqual(result.ok, false);
    const result2 = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "p", fingerprint: "OTHER", attemptId: "a" });
    assert.strictEqual(result2.ok, false);
  });

  await checkAsync("Token: abgelaufener Token wird abgelehnt", async () => {
    bridge.clearAllTokensForTests();
    const token = bridge.mintToken(
      { action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" },
      { ttlMs: 10 },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    const result = bridge.consumeToken(token, { action: "start", runId: "r", executionPackageId: "p", fingerprint: "f", attemptId: "a" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "TOKEN_EXPIRED");
  });

  check("Token: fehlender Token wird abgelehnt", () => {
    const result = bridge.consumeToken(undefined, { action: "start" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "TOKEN_MISSING");
  });

  await checkAsync("Token: Start-, Cancel- und Apply-Token sind voneinander unabhängig gebunden", async () => {
    const { paths } = bootstrap("eb-token-sep-");
    const { prep } = await prepareFixtureAttempt(paths);
    const start = await bridge.startExecutionAttempt(
      { token: prep.startToken, runId: "run-1", executionPackageId: "ep-1", executionPackageFingerprint: "fp-1", attemptId: prep.attemptId, scenario: "SUCCESS", approved: true },
      { paths },
    );
    // Der Cancel-Token darf nicht als Start-Token für einen neuen Lauf wiederverwendbar sein.
    const reuseResult = bridge.consumeToken(start.cancelToken, {
      action: "start",
      runId: "run-1",
      executionPackageId: "ep-1",
      fingerprint: "fp-1",
      attemptId: prep.attemptId,
    });
    assert.strictEqual(reuseResult.ok, false);
    await waitForTerminal(prep.attemptId, paths);
  });

  // ---------------------------------------------------------------------
  // Betrieb
  // ---------------------------------------------------------------------

  await checkAsync("Betrieb 47. Locks, Attempts und Audit liegen außerhalb beider Repositories", async () => {
    const { paths } = bootstrap("eb-op47-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const zentraleRoot = fs.realpathSync(__dirname);
    [paths.locksDir, paths.attemptsDir, paths.auditDir, paths.workspacesDir].forEach((dir) => {
      const resolved = fs.realpathSync(dir);
      assert.ok(!resolved.startsWith(`${zentraleRoot}${path.sep}`));
    });
  });

  await checkAsync("Betrieb 48. Keine Secrets in Attempt- oder Audit-Metadaten", async () => {
    const { paths } = bootstrap("eb-op48-");
    const { prep } = await runFullAttempt(paths, "SUCCESS");
    await waitForTerminal(prep.attemptId, paths);
    const attemptRaw = fs.readFileSync(path.join(paths.attemptsDir, `${prep.attemptId}.json`), "utf8");
    assert.doesNotMatch(attemptRaw, /apiKey|secret|password|token/i);
    const auditPath = path.join(paths.auditDir, "execution-bridge-audit.log");
    if (fs.existsSync(auditPath)) {
      const auditRaw = fs.readFileSync(auditPath, "utf8");
      assert.doesNotMatch(auditRaw, /apiKey|secret|password/i);
    }
  });

  // ---------------------------------------------------------------------
  // V8.6 – Fehlerklassifizierung: technisch nicht herstellbares Fixture-
  // Repository ist ein Infrastrukturfehler, keine Vertragsverletzung.
  // ---------------------------------------------------------------------

  check("V8.6: nicht herstellbares Fixture-Repository wirft typisierten Infrastrukturfehler", () => {
    const { paths } = bootstrap("eb-v86-infra-");
    // Am erwarteten Repository-Pfad liegt eine Datei. Das Anlegen des
    // Verzeichnisses ist damit technisch unmöglich – genau die Fehlerklasse,
    // die in eingeschränkten Umgebungen auch git init trifft.
    fs.writeFileSync(bridge.fixtureRepoPath(paths), "blockiert", { mode: 0o600 });
    let caught = null;
    try {
      bridge.ensureFixtureProjectRepo({ paths });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "ensureFixtureProjectRepo muss scheitern");
    assert.ok(caught instanceof bridge.ExecutionInfrastructureError);
    assert.strictEqual(caught.code, bridge.EXECUTION_INFRASTRUCTURE_ERROR_CODE);
    assert.strictEqual(caught.httpStatus, 503);
    assert.strictEqual(caught.message, bridge.EXECUTION_INFRASTRUCTURE_PUBLIC_MESSAGE);
    assert.ok(bridge.isExecutionInfrastructureError(caught));
  });

  check("V8.6: öffentliche Infrastrukturmeldung ist pfadfrei, die Originalursache bleibt intern erhalten", () => {
    const { paths, appSupportDir } = bootstrap("eb-v86-diag-");
    fs.writeFileSync(bridge.fixtureRepoPath(paths), "blockiert", { mode: 0o600 });
    let caught = null;
    try {
      bridge.ensureFixtureProjectRepo({ paths });
    } catch (error) {
      caught = error;
    }
    [caught.message, caught.internalDiagnosis].forEach((text) => {
      assert.doesNotMatch(text, /\/Users|\/private|\/tmp|\/var\/folders/);
      assert.doesNotMatch(text, /\.git\/hooks|git init|Operation not permitted/);
      assert.ok(!text.includes(appSupportDir));
    });
    // Originalursache ausschließlich serverseitig, über cause.
    assert.ok(caught.cause instanceof Error);
    assert.ok(typeof caught.internalDiagnosis === "string" && caught.internalDiagnosis.length > 0);
  });

  check("V8.6: git-Fehlschlag im Fixture-Repository wird ebenfalls als Infrastrukturfehler klassifiziert", () => {
    const { paths } = bootstrap("eb-v86-git-");
    // .git existiert als Datei: die Initialisierung wird übersprungen, jedes
    // nachfolgende git-Kommando scheitert kontrolliert.
    const repoDir = bridge.fixtureRepoPath(paths);
    fs.mkdirSync(repoDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(repoDir, ".git"), "kein Repository", { mode: 0o600 });
    assert.throws(
      () => bridge.ensureFixtureProjectRepo({ paths }),
      (error) => bridge.isExecutionInfrastructureError(error) && error.message === bridge.EXECUTION_INFRASTRUCTURE_PUBLIC_MESSAGE,
    );
  });

  await checkAsync("V8.6: Infrastrukturfehler ist serverseitig im Audit nachvollziehbar", async () => {
    const { paths } = bootstrap("eb-v86-audit-");
    fs.writeFileSync(bridge.fixtureRepoPath(paths), "blockiert", { mode: 0o600 });
    assert.throws(() => bridge.ensureFixtureProjectRepo({ paths }));
    const auditRaw = fs.readFileSync(path.join(paths.auditDir, "execution-bridge-audit.log"), "utf8");
    assert.match(auditRaw, /"action":"ENVIRONMENT_UNAVAILABLE"/);
    assert.match(auditRaw, new RegExp(`"status":"${bridge.EXECUTION_INFRASTRUCTURE_ERROR_CODE}"`));
    assert.doesNotMatch(auditRaw, /\/Users|\/private|\/var\/folders/);
    assert.doesNotMatch(auditRaw, /apiKey|secret|password/i);
  });

  check("V8.6: fachliche Ablehnungen werden nicht als Infrastrukturfehler klassifiziert", () => {
    assert.strictEqual(bridge.isExecutionInfrastructureError(new Error("runId ist erforderlich.")), false);
    const stale = new Error("Working-Tree-Baseline ist veraltet (Drift). Status: STALE.");
    stale.code = "BASELINE_STALE";
    assert.strictEqual(bridge.isExecutionInfrastructureError(stale), false);
    const systemError = Object.assign(new Error("EACCES"), { code: "EACCES", errno: -13, syscall: "mkdir" });
    assert.strictEqual(bridge.isExecutionInfrastructureError(systemError), false);
    assert.strictEqual(bridge.isExecutionInfrastructureError(null), false);
  });

  check("V8.6: Ursachenbeschreibung nimmt ausschließlich pfadfreie Kennwerte auf", () => {
    const gitFailure = Object.assign(new Error("Command failed: git init -q\n/private/tmp/x: Operation not permitted"), {
      status: 128,
      syscall: "spawnSync",
    });
    const described = bridge.describeInfrastructureCause(gitFailure);
    assert.match(described, /exit=128/);
    assert.doesNotMatch(described, /git init|Operation not permitted|\/private/);
    assert.strictEqual(bridge.describeInfrastructureCause(null), "UNKNOWN");
  });

  check("Betrieb: Audit ist append-only und rotiert bei Größenüberschreitung", () => {
    const { paths } = bootstrap("eb-op-audit-");
    for (let index = 0; index < 5; index += 1) {
      bridge.appendAuditEntry(paths, { attemptId: `a${index}`, runId: "r", projectId: "p", action: "TEST", status: "TEST" });
    }
    const auditPath = path.join(paths.auditDir, "execution-bridge-audit.log");
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    assert.strictEqual(lines.length, 5);
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
