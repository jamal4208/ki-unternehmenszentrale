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

  check("PHASE_HISTORY enthält Phase A bis E, alle DONE, mit Commit", () => {
    assert.strictEqual(freezeStatus.PHASE_HISTORY.length, 5);
    const phaseIds = freezeStatus.PHASE_HISTORY.map((entry) => entry.phase);
    assert.deepStrictEqual(phaseIds, ["A", "B", "C", "D", "E"]);
    freezeStatus.PHASE_HISTORY.forEach((entry) => {
      assert.strictEqual(entry.status, "DONE");
      assert.ok(typeof entry.commit === "string" && entry.commit.length > 0);
      assert.ok(Object.isFrozen(entry));
    });
    assert.ok(Object.isFrozen(freezeStatus.PHASE_HISTORY));
  });

  check("LAST_SECURED_COMMIT ist der volle Freeze-Basis-Commit-Hash (Phase E / 52ce012) und bleibt unverändert", () => {
    assert.strictEqual(freezeStatus.LAST_SECURED_COMMIT, "52ce0125f0d641295bcc1b83ee9442e95abb199d");
    assert.ok(/^[0-9a-f]{40}$/.test(freezeStatus.LAST_SECURED_COMMIT));
  });

  check("OFFICIAL_FROZEN_COMMIT ist der volle offizielle Freeze-Commit-Hash (80b827b) und unterscheidet sich bewusst von der Entscheidungsbasis", () => {
    assert.strictEqual(freezeStatus.OFFICIAL_FROZEN_COMMIT, "80b827b8f7edbbefbb20bda4e94a0d22fb6b07b8");
    assert.ok(/^[0-9a-f]{40}$/.test(freezeStatus.OFFICIAL_FROZEN_COMMIT));
    assert.notStrictEqual(freezeStatus.OFFICIAL_FROZEN_COMMIT, freezeStatus.LAST_SECURED_COMMIT);
  });

  check("computeFreezeStatus: aktueller Git-Stand am offiziellen Freeze-Commit ergibt gitMatchesOfficialFrozenCommit=true", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.OFFICIAL_FROZEN_COMMIT,
      workingTreeClean: true,
      manualFreezeDecision: freezeStatus.MANUAL_FREEZE_DECISION,
    });
    assert.strictEqual(result.officialFrozenCommit, freezeStatus.OFFICIAL_FROZEN_COMMIT);
    assert.strictEqual(result.gitMatchesOfficialFrozenCommit, true);
    // Die Entscheidungsbasis bleibt getrennt sichtbar und wird nicht überschrieben:
    assert.strictEqual(result.lastSecuredCommit, freezeStatus.LAST_SECURED_COMMIT);
    assert.strictEqual(result.gitMatchesLastSecuredCommit, false, "Basis-Commit und offizieller Freeze-Commit sind bewusst unterschiedliche Commits");
  });

  check("computeFreezeStatus: abweichender Git-Stand ergibt gitMatchesOfficialFrozenCommit=false, keine Erfindung", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: "f".repeat(40),
      workingTreeClean: true,
      manualFreezeDecision: freezeStatus.MANUAL_FREEZE_DECISION,
    });
    assert.strictEqual(result.gitMatchesOfficialFrozenCommit, false);
  });

  check("computeFreezeStatus: fehlender Git-Stand ergibt gitMatchesOfficialFrozenCommit=false statt Erfindung", () => {
    const result = freezeStatus.computeFreezeStatus({ currentGitCommit: null, workingTreeClean: null });
    assert.strictEqual(result.gitMatchesOfficialFrozenCommit, false);
    assert.strictEqual(result.officialFrozenCommit, freezeStatus.OFFICIAL_FROZEN_COMMIT);
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

  check("computeFreezeStatus liefert ohne manuelle Freeze-Entscheidung niemals FROZEN, unabhängig von den Git-Eingaben", () => {
    const combos = [
      { currentGitCommit: freezeStatus.LAST_SECURED_COMMIT, workingTreeClean: true },
      { currentGitCommit: freezeStatus.LAST_SECURED_COMMIT, workingTreeClean: false },
      { currentGitCommit: "x", workingTreeClean: true },
      {},
    ];
    combos.forEach((input) => {
      const result = freezeStatus.computeFreezeStatus(input);
      assert.notStrictEqual(result.status, "FROZEN");
      assert.strictEqual(result.manualFreezeDecision, null);
    });
  });

  check("MANUAL_FREEZE_DECISION enthält exakt Version, FROZEN, Jamal, Entscheidungsdatum und Basis-Commit", () => {
    const decision = freezeStatus.MANUAL_FREEZE_DECISION;
    assert.ok(Object.isFrozen(decision));
    assert.strictEqual(decision.version, "V7.0");
    assert.strictEqual(decision.status, "FROZEN");
    assert.strictEqual(decision.decidedBy, "Jamal");
    assert.strictEqual(decision.decisionDate, "2026-07-25");
    assert.strictEqual(decision.baseCommit, "52ce0125f0d641295bcc1b83ee9442e95abb199d");
    assert.strictEqual(decision.baseCommit, freezeStatus.LAST_SECURED_COMMIT);
    assert.ok(/^[0-9a-f]{40}$/.test(decision.baseCommit));
    assert.ok(/V7\.1/.test(decision.note));
    assert.ok(!("email" in decision) && !("kontakt" in decision), "keine personenbezogenen Daten über 'Jamal' hinaus");
  });

  check("isValidManualFreezeDecision erkennt genau die kanonische Entscheidung, keine Fälschung", () => {
    assert.strictEqual(freezeStatus.isValidManualFreezeDecision(freezeStatus.MANUAL_FREEZE_DECISION), true);
    assert.strictEqual(freezeStatus.isValidManualFreezeDecision(null), false);
    assert.strictEqual(freezeStatus.isValidManualFreezeDecision(undefined), false);
    assert.strictEqual(freezeStatus.isValidManualFreezeDecision({}), false);
    assert.strictEqual(
      freezeStatus.isValidManualFreezeDecision({ ...freezeStatus.MANUAL_FREEZE_DECISION, decidedBy: "Cursor" }),
      false,
    );
    assert.strictEqual(
      freezeStatus.isValidManualFreezeDecision({ ...freezeStatus.MANUAL_FREEZE_DECISION, status: "FREEZE_CANDIDATE" }),
      false,
    );
    assert.strictEqual(
      freezeStatus.isValidManualFreezeDecision({ ...freezeStatus.MANUAL_FREEZE_DECISION, version: "V7.1" }),
      false,
    );
    assert.strictEqual(
      freezeStatus.isValidManualFreezeDecision({ ...freezeStatus.MANUAL_FREEZE_DECISION, baseCommit: "zu-kurz" }),
      false,
    );
    assert.strictEqual(
      freezeStatus.isValidManualFreezeDecision({ ...freezeStatus.MANUAL_FREEZE_DECISION, decisionDate: "" }),
      false,
    );
  });

  check("computeFreezeStatus: mit der kanonischen Jamal-Entscheidung wird V7.0 als FROZEN angezeigt", () => {
    const result = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: true,
      manualFreezeDecision: freezeStatus.MANUAL_FREEZE_DECISION,
    });
    assert.strictEqual(result.status, "FROZEN");
    assert.strictEqual(result.version, "V7.0");
    assert.deepStrictEqual(result.manualFreezeDecision, freezeStatus.MANUAL_FREEZE_DECISION);
    assert.ok(/FROZEN/.test(result.note));
    assert.ok(/V7\.1/.test(result.note));
  });

  check("computeFreezeStatus: FROZEN wird nicht aus Testzahl oder sauberem Working Tree abgeleitet", () => {
    // Dieselbe kanonische Entscheidung führt unabhängig vom aktuellen
    // Git-Stand/Working-Tree zu FROZEN – der Freeze wird ausschließlich durch
    // die manuelle Entscheidung getragen, niemals durch Git-Zustand allein.
    const dirtyButDecided = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: false,
      manualFreezeDecision: freezeStatus.MANUAL_FREEZE_DECISION,
    });
    assert.strictEqual(dirtyButDecided.status, "FROZEN");

    const unknownGitButDecided = freezeStatus.computeFreezeStatus({
      currentGitCommit: null,
      workingTreeClean: null,
      manualFreezeDecision: freezeStatus.MANUAL_FREEZE_DECISION,
    });
    assert.strictEqual(unknownGitButDecided.status, "FROZEN");

    // Umgekehrt: ein sauberer, passender Git-Stand allein (ohne die
    // kanonische Entscheidung) darf niemals FROZEN erzeugen.
    const cleanButNotDecided = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: true,
    });
    assert.notStrictEqual(cleanButNotDecided.status, "FROZEN");

    // Eine gefälschte/unvollständige "Entscheidung" darf trotz sauberem,
    // passendem Git-Stand ebenfalls niemals FROZEN erzeugen.
    const fakeDecision = freezeStatus.computeFreezeStatus({
      currentGitCommit: freezeStatus.LAST_SECURED_COMMIT,
      workingTreeClean: true,
      manualFreezeDecision: { version: "V7.0", status: "FROZEN", decidedBy: "Cursor", decisionDate: "2026-07-25", baseCommit: freezeStatus.LAST_SECURED_COMMIT },
    });
    assert.notStrictEqual(fakeDecision.status, "FROZEN");
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
