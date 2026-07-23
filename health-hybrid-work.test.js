"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const DailyWorkRun = require("./daily-work-run");
const LocalDataBackup = require("./local-data-backup");
const { getProjectById } = require("./project-registry");
const {
  MAX_RESULT_JSON_CHARS,
  normalizeRelativeRepoPath,
  createHealthExecutionPackage,
  approveHealthExecutionPackageForCopy,
  previewExternalExecutionResult,
  confirmExternalExecutionEvidence,
  adoptExternalExecutionEvidenceIntoReview,
  setReleaseGateDecision,
  releaseGateDecisionLabel,
} = require("./health-hybrid-work");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function cleanLive(overrides = {}) {
  return {
    ok: true,
    available: true,
    branch: "main",
    head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    workingTreeClean: true,
    ...overrides,
  };
}

function buildReadyRun() {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id: "daily-run-hybrid-test", now: new Date("2026-07-23T10:00:00Z") });
  run = DailyWorkRun.setFocusProject(run, health, "Test-Snapshot", "2026-07-23T10:00:00Z");
  run = DailyWorkRun.createWorkProposal(run, {
    desiredOutcome: "Code und API für den Health Preview-Kernfluss technisch prüfen",
    prohibitedToday: "Kein Commit",
  });
  run = DailyWorkRun.transitionRun(run, "READY_FOR_CODEX");
  return run;
}

function resultJson(pkg, overrides = {}) {
  return JSON.stringify({
    executionPackageId: pkg.executionPackageId,
    executionPackageFingerprint: pkg.executionPackageFingerprint,
    summary: "Lokale Änderung vorbereitet",
    changedFiles: ["README.md"],
    diffSummary: "README angepasst",
    errors: [],
    risks: ["Noch keine Fachfreigabe"],
    openPoints: ["Jamal prüft"],
    testCommand: pkg.testCommand,
    testExitCode: 0,
    testOutputSummary: "tests passed",
    gitBranchObserved: pkg.allowedBranch,
    baseCommitObserved: pkg.baseCommit,
    headCommitObserved: pkg.baseCommit,
    ...overrides,
  });
}

function main() {
  check("absolute paths are rejected", () => {
    assert.throws(() => normalizeRelativeRepoPath("/tmp/x"), /absolute/);
    assert.throws(() => normalizeRelativeRepoPath("../secret"), /Traversierung/);
  });

  check("dirty working tree blocks READY_TO_COPY", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    assert.throws(
      () =>
        approveHealthExecutionPackageForCopy(
          run,
          cleanLive({ workingTreeClean: false }),
          { approved: true },
        ),
      /Working Tree/,
    );
  });

  check("changed branch blocks READY_TO_COPY", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    assert.throws(
      () =>
        approveHealthExecutionPackageForCopy(
          run,
          cleanLive({ branch: "feature/other" }),
          { approved: true },
        ),
      /Branch/,
    );
  });

  check("changed HEAD after package creation blocks copy and marks stale on return", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    assert.throws(
      () =>
        approveHealthExecutionPackageForCopy(
          run,
          cleanLive({ head: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
          { approved: true },
        ),
      /HEAD|baseCommit/,
    );
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    const preview = previewExternalExecutionResult(
      run,
      resultJson(run.executionPackage, {
        baseCommitObserved: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
      cleanLive({ head: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
    );
    assert.strictEqual(preview.packageStatusIfSaved, "STALE");
    assert.ok(preview.blocked);
  });

  check("wrong executionPackageId is rejected", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    assert.throws(
      () => previewExternalExecutionResult(run, resultJson(run.executionPackage, { executionPackageId: "ep-other" })),
      /executionPackageId/,
    );
  });

  check("wrong fingerprint is rejected", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    assert.throws(
      () =>
        previewExternalExecutionResult(
          run,
          resultJson(run.executionPackage, { executionPackageFingerprint: "ep-deadbeef" }),
        ),
      /Fingerprint/,
    );
  });

  check("foreign file outside allowlist hard-blocks", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    const preview = previewExternalExecutionResult(
      run,
      resultJson(run.executionPackage, { changedFiles: ["secret-config.json"] }),
    );
    assert.strictEqual(preview.blocked, true);
    assert.ok(preview.evidence.hardBlockers.some((entry) => /Allowlist|outside/i.test(entry) || /außerhalb/.test(entry)));
  });

  check("forbidden or absolute path is rejected", () => {
    let run = buildReadyRun();
    assert.throws(
      () =>
        createHealthExecutionPackage(run, cleanLive(), {
          allowedFiles: ["/etc/passwd"],
          forbiddenPaths: [".env"],
        }),
      /absolute/,
    );
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    const preview = previewExternalExecutionResult(
      run,
      resultJson(run.executionPackage, { changedFiles: [".env"] }),
    );
    assert.strictEqual(preview.blocked, true);
  });

  check("JSON above size limit is rejected", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    const huge = `${"{\"executionPackageId\":\"".padEnd(MAX_RESULT_JSON_CHARS + 10, "a")}`;
    assert.throws(() => previewExternalExecutionResult(run, huge), /Größenbegrenzung/);
  });

  check("legacy runs without new fields remain readable", () => {
    const legacy = {
      schemaVersion: 1,
      id: "legacy-run",
      workDate: "2026-07-01",
      status: "DRAFT",
      focusProjectId: "health-upgrade-kompass",
    };
    const store = DailyWorkRun.createStore({ runs: [legacy], activeRunId: "legacy-run" });
    const active = DailyWorkRun.getActiveRun(store);
    assert.strictEqual(active.id, "legacy-run");
    assert.strictEqual(active.executionPackage, null);
    assert.ok(active.releaseGates);
    assert.strictEqual(active.releaseGates.commitDecision.status, "PENDING");
  });

  check("backup and restore keep additive hybrid fields", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = setReleaseGateDecision(run, "commitDecision", {
      status: "APPROVED",
      reason: "Nur Entscheidung",
    });
    const memory = {
      data: new Map(),
      getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
      },
      setItem(key, value) {
        this.data.set(key, String(value));
      },
      removeItem(key) {
        this.data.delete(key);
      },
    };
    DailyWorkRun.saveDailyStore(memory, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), run));
    const exported = LocalDataBackup.exportLocalData(memory);
    const target = {
      data: new Map(),
      getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
      },
      setItem(key, value) {
        this.data.set(key, String(value));
      },
      removeItem(key) {
        this.data.delete(key);
      },
    };
    LocalDataBackup.importLocalData(target, exported, { confirmed: true, importToken: "hybrid-import-1" });
    const restored = DailyWorkRun.loadDailyStore(target);
    const restoredRun = DailyWorkRun.getActiveRun(restored);
    assert.ok(restoredRun.executionPackage?.executionPackageId);
    assert.strictEqual(restoredRun.releaseGates.commitDecision.status, "APPROVED");
    assert.match(releaseGateDecisionLabel("commitDecision", "APPROVED"), /noch nicht ausgeführt/);
  });

  check("external evidence does not auto-ACCEPT work item and stays separate from runtimePilotEvidence", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    const item = run.agentReviewPhase.workItems.find((entry) => entry.agentId === "api-agent");
    assert.ok(item.externalExecutionEvidence?.recordedAt);
    assert.notStrictEqual(item.status, "ACCEPTED");
    assert.strictEqual(item.resultConfirmed, false);
    assert.strictEqual(item.runtimePilotEvidence, undefined);
    run = DailyWorkRun.adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    const adopted = DailyWorkRun.getAgentReviewPhase(run).workItems.find((entry) => entry.agentId === "api-agent");
    assert.ok(adopted.externalExecutionEvidence.adoptedIntoReviewAt);
    assert.notStrictEqual(adopted.status, "ACCEPTED");
    assert.notStrictEqual(adopted.status, "RESULT_RECORDED");
    assert.strictEqual(adopted.resultConfirmed, false);
    assert.ok(!adopted.resultConfirmedAt);
    assert.ok(!DailyWorkRun.isOrchestrationConfirmed(run.agentReviewPhase));
  });

  check("adopted external evidence leaves card READY when dependencies are met", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
        resultText: `${agentId}: Grundlage bestätigt.`,
        confirmed: true,
      });
    }
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    run = DailyWorkRun.adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    const adopted = DailyWorkRun.getAgentReviewPhase(run).workItems.find((entry) => entry.agentId === "api-agent");
    assert.ok(adopted.externalExecutionEvidence.adoptedIntoReviewAt);
    assert.strictEqual(adopted.resultConfirmed, false);
    assert.notStrictEqual(adopted.status, "ACCEPTED");
    assert.strictEqual(adopted.status, "READY");
    assert.ok(adopted.externalExecutionEvidence.executionPackageId);
    assert.ok(adopted.externalExecutionEvidence.executionPackageFingerprint);
  });

  check("manual recordAgentWorkResult works after adopt and reaches ACCEPTED", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
        resultText: `${agentId}: Grundlage bestätigt.`,
        confirmed: true,
      });
    }
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    run = DailyWorkRun.adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    run = DailyWorkRun.recordAgentWorkResult(run, "api-agent", {
      resultText: "Technischer Befund nach übernommener Evidenz manuell bestätigt.",
      openPoints: "Jamal prüft Freigabe.",
      confirmed: true,
    });
    const confirmed = DailyWorkRun.getAgentReviewPhase(run).workItems.find((entry) => entry.agentId === "api-agent");
    assert.strictEqual(confirmed.status, "ACCEPTED");
    assert.strictEqual(confirmed.resultConfirmed, true);
    assert.ok(confirmed.resultConfirmedAt);
    assert.ok(confirmed.externalExecutionEvidence.adoptedIntoReviewAt);
  });

  check("refresh heals false RESULT_RECORDED deadlock after adopted evidence", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
        resultText: `${agentId}: Grundlage bestätigt.`,
        confirmed: true,
      });
    }
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    run = adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    const poisoned = JSON.parse(JSON.stringify(run));
    poisoned.agentReviewPhase.workItems = poisoned.agentReviewPhase.workItems.map((entry) => {
      if (entry.agentId !== "api-agent") return entry;
      return {
        ...entry,
        status: "RESULT_RECORDED",
        resultConfirmed: false,
        resultConfirmedAt: null,
        resultRecordedAt: entry.externalExecutionEvidence.adoptedIntoReviewAt,
      };
    });
    assert.strictEqual(
      poisoned.agentReviewPhase.workItems.find((e) => e.agentId === "api-agent").status,
      "RESULT_RECORDED",
    );
    const healedPhase = DailyWorkRun.getAgentReviewPhase(poisoned);
    const healed = healedPhase.workItems.find((entry) => entry.agentId === "api-agent");
    assert.strictEqual(healed.status, "READY");
    assert.strictEqual(healed.resultConfirmed, false);
    assert.ok(!healed.resultConfirmedAt);
    assert.ok(healed.externalExecutionEvidence.adoptedIntoReviewAt);
    poisoned.agentReviewPhase = healedPhase;
    const afterConfirm = DailyWorkRun.recordAgentWorkResult(poisoned, "api-agent", {
      resultText: "Nach Heilung manuell bestätigt.",
      confirmed: true,
    });
    assert.strictEqual(
      DailyWorkRun.getAgentReviewPhase(afterConfirm).workItems.find((e) => e.agentId === "api-agent").status,
      "ACCEPTED",
    );

    // Abhängigkeiten fehlen → Heilung auf WAITING
    let waitingRun = buildReadyRun();
    waitingRun = createHealthExecutionPackage(waitingRun, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    waitingRun = approveHealthExecutionPackageForCopy(waitingRun, cleanLive(), { approved: true });
    waitingRun = DailyWorkRun.prepareAgentReviewPhase(waitingRun, { approved: true });
    waitingRun = confirmExternalExecutionEvidence(
      waitingRun,
      resultJson(waitingRun.executionPackage),
      cleanLive(),
      { confirmed: true },
    );
    waitingRun = adoptExternalExecutionEvidenceIntoReview(waitingRun, { adopt: true });
    waitingRun.agentReviewPhase.workItems = waitingRun.agentReviewPhase.workItems.map((entry) => {
      if (entry.agentId !== "api-agent") return entry;
      return {
        ...entry,
        status: "RESULT_RECORDED",
        resultConfirmed: false,
        resultConfirmedAt: null,
      };
    });
    const waitingHealed = DailyWorkRun.getAgentReviewPhase(waitingRun).workItems.find(
      (entry) => entry.agentId === "api-agent",
    );
    assert.strictEqual(waitingHealed.status, "WAITING");
    assert.strictEqual(waitingHealed.resultConfirmed, false);
  });

  check("heal does not reset confirmed findings, QA, or orchestration", () => {
    let run = buildReadyRun();
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
        resultText: `${agentId}: bestätigt.`,
        confirmed: true,
      });
    }
    run = DailyWorkRun.recordAgentWorkResult(run, "api-agent", {
      resultText: "Echter Fachbefund.",
      confirmed: true,
    });
    run = DailyWorkRun.recordQaResult(run, {
      status: "BESTANDEN",
      resultText: "QA bestätigt.",
      criteriaAnswered: true,
    });
    run = DailyWorkRun.recordOrchestrationSummary(run, {
      confirmedFindings: "Gesamtbefund bestätigt.",
      recommendedNextStep: "Jamal entscheidet.",
      jamalDecisionQuestion: "Freigeben?",
    });
    const before = JSON.parse(JSON.stringify(DailyWorkRun.getAgentReviewPhase(run)));
    const after = DailyWorkRun.getAgentReviewPhase(run);
    assert.deepStrictEqual(
      after.workItems.find((e) => e.agentId === "api-agent").status,
      "ACCEPTED",
    );
    assert.ok(after.qa.confirmedAt);
    assert.strictEqual(after.orchestration.status, "CONFIRMED");
    assert.deepStrictEqual(after.qa, before.qa);
    assert.deepStrictEqual(after.orchestration, before.orchestration);
    assert.strictEqual(
      after.workItems.find((e) => e.agentId === "api-agent").resultText,
      "Echter Fachbefund.",
    );
  });

  check("QA and PM consolidation remain separate after evidence", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    run = DailyWorkRun.adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    const phase = DailyWorkRun.getAgentReviewPhase(run);
    assert.ok(["PREPARED", "RESULTS_PARTIAL", "READY_FOR_QA"].includes(phase.status));
    assert.notStrictEqual(phase.orchestration.status, "CONFIRMED");
    assert.ok(!phase.qa.confirmedAt);
    const api = phase.workItems.find((entry) => entry.agentId === "api-agent");
    assert.strictEqual(api.runtimePilotEvidence, undefined);
    assert.ok(api.externalExecutionEvidence?.adoptedIntoReviewAt);
  });

  check("hybrid evidence adoption end-to-end reaches Jamal final decision", () => {
    let run = buildReadyRun();
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      responsibleAgentId: "api-agent",
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
        resultText: `${agentId}: Grundlage bestätigt.`,
        confirmed: true,
      });
    }
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), {
      confirmed: true,
    });
    run = DailyWorkRun.adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    assert.strictEqual(
      DailyWorkRun.getAgentReviewPhase(run).workItems.find((e) => e.agentId === "api-agent").status,
      "READY",
    );
    run = DailyWorkRun.recordAgentWorkResult(run, "api-agent", {
      resultText: "API-Befund nach Evidenz manuell bestätigt.",
      confirmed: true,
    });
    assert.strictEqual(
      DailyWorkRun.getAgentReviewPhase(run).workItems.find((e) => e.agentId === "quality-test-agent").status,
      "READY",
    );
    run = DailyWorkRun.recordQaResult(run, {
      status: "BESTANDEN",
      resultText: "QA nach übernommenem Hybrid-Pfad.",
      criteriaAnswered: true,
    });
    run = DailyWorkRun.recordOrchestrationSummary(run, {
      confirmedFindings: "Hybrid-Evidenz und Fachbefunde manuell bestätigt.",
      recommendedNextStep: "Jamal trifft Abschlussentscheidung.",
      jamalDecisionQuestion: "Nächste Health-Phase vorbereiten?",
    });
    run = DailyWorkRun.setAgentReviewFinalDecision(run, {
      decision: "FREIGEBEN",
      nextSafeStep: "Release-Gates nur entscheidungsseitig prüfen.",
    });
    const phase = DailyWorkRun.getAgentReviewPhase(run);
    assert.strictEqual(phase.status, "JAMAL_COMPLETED");
    assert.ok(phase.finalDecision.decidedAt);
    assert.ok(
      phase.workItems.find((e) => e.agentId === "api-agent").externalExecutionEvidence?.adoptedIntoReviewAt,
    );
    assert.strictEqual(phase.orchestration.status, "CONFIRMED");
  });

  check("no git write or test process markers in hybrid module source", () => {
    const hybridSource = fs.readFileSync(path.join(__dirname, "health-hybrid-work.js"), "utf8");
    const statusSource = fs.readFileSync(path.join(__dirname, "health-repo-status.js"), "utf8");
    assert.doesNotMatch(statusSource, /npm test/);
    assert.doesNotMatch(statusSource, /shell:\s*true/);
    assert.doesNotMatch(statusSource, /\b(fetch|pull|checkout|reset|clean)\b/);
    assert.match(hybridSource, /noch nicht ausgeführt/);
    assert.match(statusSource, /testExecutionStarted:\s*false/);
  });

  console.log(`\n${passed} tests passed`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
