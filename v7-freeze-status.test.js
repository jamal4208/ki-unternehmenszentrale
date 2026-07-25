"use strict";

const assert = require("assert");
const freezeStatus = require("./v7-freeze-status");

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

function mockExecFactory(responses) {
  return (cmd, args, opts, cb) => {
    assert.strictEqual(cmd, "git");
    assert.strictEqual(opts.shell, false);
    const key = args.join(" ");
    const response = responses[key] || { error: new Error("unexpected git args") };
    process.nextTick(() => cb(response.error || null, response.stdout || "", ""));
  };
}

async function main() {
  check("FREEZE_STATUS_VALUES enthält genau IN_REVIEW, FREEZE_CANDIDATE, FROZEN", () => {
    assert.deepStrictEqual(freezeStatus.FREEZE_STATUS_VALUES, ["IN_REVIEW", "FREEZE_CANDIDATE", "FROZEN"]);
  });

  check("PHASE_HISTORY enthält Phase A bis D, alle DONE, mit Commit", () => {
    assert.strictEqual(freezeStatus.PHASE_HISTORY.length, 4);
    const phaseIds = freezeStatus.PHASE_HISTORY.map((entry) => entry.phase);
    assert.deepStrictEqual(phaseIds, ["A", "B", "C", "D"]);
    freezeStatus.PHASE_HISTORY.forEach((entry) => {
      assert.strictEqual(entry.status, "DONE");
      assert.ok(typeof entry.commit === "string" && entry.commit.length > 0);
      assert.ok(Object.isFrozen(entry));
    });
    assert.ok(Object.isFrozen(freezeStatus.PHASE_HISTORY));
  });

  check("LAST_SECURED_COMMIT ist der volle Phase-D-Commit-Hash", () => {
    assert.strictEqual(freezeStatus.LAST_SECURED_COMMIT, "655345246839d787ab9f293892b6f3ae479bbd67");
    assert.ok(/^[0-9a-f]{40}$/.test(freezeStatus.LAST_SECURED_COMMIT));
  });

  check("computeFreezeStatus: fehlender/unbekannter Git-Stand ist IN_REVIEW, niemals FREEZE_CANDIDATE", () => {
    const result = freezeStatus.computeFreezeStatus({ currentGitCommit: null, workingTreeClean: null });
    assert.strictEqual(result.status, "IN_REVIEW");
    assert.strictEqual(result.gitMatchesLastSecuredCommit, false);
    assert.strictEqual(result.workingTreeClean, null);
  });

  check("computeFreezeStatus: abweichender Commit ist IN_REVIEW", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: "f".repeat(40),
      workingTreeClean: true,
    });
    assert.strictEqual(result.status, "IN_REVIEW");
    assert.strictEqual(result.gitMatchesLastSecuredCommit, false);
  });

  check("computeFreezeStatus: passender Commit aber dirty Working Tree ist IN_REVIEW", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: false,
    });
    assert.strictEqual(result.status, "IN_REVIEW");
    assert.strictEqual(result.gitMatchesLastSecuredCommit, true);
    assert.strictEqual(result.workingTreeClean, false);
  });

  check("computeFreezeStatus: passender Commit und sauberer Working Tree ist FREEZE_CANDIDATE, niemals FROZEN", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: true,
    });
    assert.strictEqual(result.status, "FREEZE_CANDIDATE");
    assert.notStrictEqual(result.status, "FROZEN");
  });

  check("computeFreezeStatus liefert niemals FROZEN, unabhängig von den Eingaben", () => {
    const combos = [
      { currentGitCommit: freezeStatus.LAST_SECURED_COMMIT, workingTreeClean: true },
      { currentGitCommit: freezeStatus.LAST_SECURED_COMMIT, workingTreeClean: false },
      { currentGitCommit: "x", workingTreeClean: true },
      {},
    ];
    combos.forEach((input) => {
      const result = freezeStatus.computeFreezeStatus(input);
      assert.notStrictEqual(result.status, "FROZEN");
    });
  });

  check("computeFreezeStatus enthält version/phase/openJamalSteps/knownNonGoals/nextProductPathAfterV70", () => {
    const result = freezeStatus.computeFreezeStatus({});
    assert.strictEqual(result.version, "V7.0");
    assert.strictEqual(result.phase, "E");
    assert.ok(Array.isArray(result.openJamalSteps) && result.openJamalSteps.length > 0);
    assert.ok(Array.isArray(result.knownNonGoals) && result.knownNonGoals.length > 0);
    assert.ok(Array.isArray(result.nextProductPathAfterV70) && result.nextProductPathAfterV70.length > 0);
    assert.ok(result.knownNonGoals.some((entry) => /FROZEN/.test(entry)));
    assert.ok(result.knownNonGoals.some((entry) => /Phase V7\.1/.test(entry)));
    assert.ok(result.knownNonGoals.some((entry) => /Health/.test(entry)));
  });

  check("computeFreezeStatus enthält tests-Feld mit checkCount und allGreen, keine erfundene Zahl", () => {
    const result = freezeStatus.computeFreezeStatus({});
    assert.strictEqual(typeof result.tests.checkCount, "number");
    assert.ok(result.tests.checkCount > 0);
    assert.strictEqual(typeof result.tests.allGreen, "boolean");
  });

  await checkAsync("readGitCommitReadOnly: gültiger Commit wird erkannt", async () => {
    const commit = await freezeStatus.readGitCommitReadOnly("/tmp", {
      execFileImpl: mockExecFactory({ "rev-parse HEAD": { stdout: `${"a".repeat(40)}\n` } }),
    });
    assert.strictEqual(commit, "a".repeat(40));
  });

  await checkAsync("readGitCommitReadOnly: Fehler liefert null, keine Erfindung", async () => {
    const commit = await freezeStatus.readGitCommitReadOnly("/tmp", {
      execFileImpl: mockExecFactory({ "rev-parse HEAD": { error: new Error("boom") } }),
    });
    assert.strictEqual(commit, null);
  });

  await checkAsync("readWorkingTreeCleanReadOnly: leere Ausgabe ist sauber (true)", async () => {
    const clean = await freezeStatus.readWorkingTreeCleanReadOnly("/tmp", {
      execFileImpl: mockExecFactory({ "status --porcelain": { stdout: "" } }),
    });
    assert.strictEqual(clean, true);
  });

  await checkAsync("readWorkingTreeCleanReadOnly: Ausgabe mit Zeilen ist dirty (false)", async () => {
    const clean = await freezeStatus.readWorkingTreeCleanReadOnly("/tmp", {
      execFileImpl: mockExecFactory({ "status --porcelain": { stdout: " M package.json\n" } }),
    });
    assert.strictEqual(clean, false);
  });

  await checkAsync("readWorkingTreeCleanReadOnly: Fehler liefert null, keine Erfindung", async () => {
    const clean = await freezeStatus.readWorkingTreeCleanReadOnly("/tmp", {
      execFileImpl: mockExecFactory({ "status --porcelain": { error: new Error("boom") } }),
    });
    assert.strictEqual(clean, null);
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
