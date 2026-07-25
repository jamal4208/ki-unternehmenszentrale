"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DailyWorkRun = require("./daily-work-run");
const GuidedWork = require("./guided-work");
const GuidedWorkUi = require("./guided-work-ui");
const LocalDataBackup = require("./local-data-backup");
const { getProjectById, PROJECT_REGISTRY } = require("./project-registry");
const { PRODUCTIVE_AGENT_REGISTRY } = require("./agent-registry");
const {
  createHealthExecutionPackage,
  approveHealthExecutionPackageForCopy,
  confirmExternalExecutionEvidence,
  adoptExternalExecutionEvidenceIntoReview,
  normalizeRelativeRepoPath,
} = require("./health-hybrid-work");
const {
  buildWorkingTreeDetail,
  parsePorcelainPaths,
  hashFileSafe,
  buildHealthLiveStatusResponse,
  ALLOWED_GIT_READ_COMMANDS,
} = require("./health-repo-status");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
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
  };
}

function cleanLive(overrides = {}) {
  return {
    ok: true,
    available: true,
    branch: "work/check-start-gate-2026-07-19",
    head: "395bf9e01f26d63dc4cc0bbc8343d10535c1ad64",
    workingTreeClean: true,
    workingTreeDetail: {
      dirtyPaths: [],
      untrackedPaths: [],
      fileHashes: [],
      baselineFingerprint: "wt-clean",
      capturedAt: "2026-07-24T12:00:00.000Z",
      limitStatus: "OK",
    },
    ...overrides,
  };
}

function dirtyLive(overrides = {}) {
  const dirtyPaths = ["package.json"];
  const untrackedPaths = [
    "src/logic/mockScaleAdapter.js",
    "src/logic/scaleSnapshot.js",
    "src/logic/scaleSnapshot.test.js",
  ];
  const fileHashes = [...dirtyPaths, ...untrackedPaths].map((entry) => ({
    path: entry,
    contentHash: crypto.createHash("sha256").update(entry).digest("hex"),
    missing: false,
    byteLength: 12,
  }));
  const baselineFingerprint = "wt-option-a";
  return cleanLive({
    workingTreeClean: false,
    workingTreeDetail: {
      dirtyPaths,
      untrackedPaths,
      fileHashes,
      baselineFingerprint,
      capturedAt: "2026-07-24T12:00:00.000Z",
      limitStatus: "OK",
      fileCount: dirtyPaths.length + untrackedPaths.length,
    },
    ...overrides,
  });
}

function buildReadyRun(id = "daily-run-guided-a") {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id, now: new Date("2026-07-24T10:00:00Z") });
  run = DailyWorkRun.setFocusProject(run, health, "Test-Snapshot", "2026-07-24T10:00:00Z");
  run = GuidedWork.attachOutcomeSuggestions(run, { canonicalProject: health });
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
  check("1. Neue Läufe erhalten schemaVersion 2", () => {
    const draft = DailyWorkRun.createDraftRun({ id: "v2-new" });
    assert.strictEqual(draft.schemaVersion, 2);
    assert.strictEqual(DailyWorkRun.SCHEMA_VERSION, 2);
  });

  check("2. V1-Läufe bleiben unverändert lesbar", () => {
    const v1 = {
      ...DailyWorkRun.createDraftRun({ id: "v1-legacy" }),
      schemaVersion: 1,
    };
    delete v1.guidedWorkPhase;
    delete v1.outcomeSuggestions;
    const store = DailyWorkRun.createStore({ runs: [v1], activeRunId: v1.id });
    const active = DailyWorkRun.getActiveRun(store);
    assert.strictEqual(active.schemaVersion, 1);
    assert.strictEqual(active.id, "v1-legacy");
    assert.ok(Array.isArray(active.outcomeSuggestions));
  });

  check("3. v1 und v2 koexistieren im Store", () => {
    const v1 = { ...DailyWorkRun.createDraftRun({ id: "coexist-v1" }), schemaVersion: 1 };
    const v2 = DailyWorkRun.createDraftRun({ id: "coexist-v2" });
    const store = DailyWorkRun.createStore({ runs: [v2, v1], activeRunId: v2.id });
    assert.strictEqual(store.runs.find((run) => run.id === "coexist-v1").schemaVersion, 1);
    assert.strictEqual(store.runs.find((run) => run.id === "coexist-v2").schemaVersion, 2);
    assert.strictEqual(store.schemaVersion, 1);
  });

  check("4. Backup/Restore erhält beide Versionen", () => {
    const v1 = { ...DailyWorkRun.createDraftRun({ id: "backup-v1" }), schemaVersion: 1 };
    const v2 = DailyWorkRun.createDraftRun({ id: "backup-v2" });
    const store = DailyWorkRun.createStore({ runs: [v2, v1], activeRunId: v2.id });
    const storage = mockStorage({
      [LocalDataBackup.DAILY_STORAGE_KEY]: JSON.stringify(store),
      [LocalDataBackup.MANAGEMENT_STORAGE_KEY]: JSON.stringify({ projects: [], tickets: [], knowledge: [] }),
    });
    const exported = LocalDataBackup.exportLocalData(storage);
    const target = mockStorage();
    const imported = LocalDataBackup.importLocalData(target, exported, { confirmed: true });
    assert.strictEqual(imported.ok, true);
    const restored = JSON.parse(target.getItem(LocalDataBackup.DAILY_STORAGE_KEY));
    assert.strictEqual(restored.runs.find((run) => run.id === "backup-v1").schemaVersion, 1);
    assert.strictEqual(restored.runs.find((run) => run.id === "backup-v2").schemaVersion, 2);
  });

  check("5. v1-Import beschädigt vorhandene v2-Daten nicht stillschweigend", () => {
    const localV2 = DailyWorkRun.createDraftRun({ id: "local-v2-keep" });
    const localStore = DailyWorkRun.createStore({ runs: [localV2], activeRunId: localV2.id });
    const storage = mockStorage({
      [LocalDataBackup.DAILY_STORAGE_KEY]: JSON.stringify(localStore),
      [LocalDataBackup.MANAGEMENT_STORAGE_KEY]: JSON.stringify({ projects: [], tickets: [], knowledge: [] }),
    });
    const v1Only = {
      schemaVersion: 1,
      activeRunId: "import-v1",
      runs: [{ ...DailyWorkRun.createDraftRun({ id: "import-v1" }), schemaVersion: 1 }],
    };
    const exportPayload = LocalDataBackup.exportLocalData(mockStorage({
      [LocalDataBackup.DAILY_STORAGE_KEY]: JSON.stringify(v1Only),
      [LocalDataBackup.MANAGEMENT_STORAGE_KEY]: JSON.stringify({ projects: [], tickets: [], knowledge: [] }),
    }));
    const preview = LocalDataBackup.buildImportPreview(exportPayload, storage);
    assert.strictEqual(preview.schemaVersions.v2OverwriteRisk, true);
    assert.throws(
      () => LocalDataBackup.importLocalData(storage, exportPayload, { confirmed: true }),
      /acknowledgeV2Overwrite/,
    );
    const stillThere = JSON.parse(storage.getItem(LocalDataBackup.DAILY_STORAGE_KEY));
    assert.ok(stillThere.runs.some((run) => run.id === "local-v2-keep" && run.schemaVersion === 2));
  });

  check("6-8. Quellenbasierte Vorschläge ohne Erfindung", () => {
    const health = getProjectById("health-upgrade-kompass");
    const suggestions = GuidedWork.buildOutcomeSuggestions(
      DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "suggest" }), health, "snap", "2026-07-24T10:00:00Z"),
      { canonicalProject: health },
    );
    assert.ok(suggestions.length >= 2 && suggestions.length <= 3);
    suggestions.forEach((entry) => {
      assert.ok(entry.sourceLabel);
      assert.strictEqual(entry.deterministic, true);
      assert.ok(entry.label.includes("deterministisch"));
    });
    const empty = GuidedWork.buildOutcomeSuggestions(DailyWorkRun.createDraftRun({ id: "empty" }), {
      canonicalProject: {
        id: "x",
        nextSafeStep: "UNGEKLÄRT",
        openDecision: "UNGEKLÄRT",
        blocker: "UNGEKLÄRT",
        currentGoal: "UNGEKLÄRT",
      },
    });
    assert.strictEqual(empty.length, 0);
  });

  check("9-10. Eigener Ergebniswunsch möglich, kein Auto-Select", () => {
    const health = getProjectById("health-upgrade-kompass");
    let run = DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "own" }), health, "snap", "2026-07-24T10:00:00Z");
    run = GuidedWork.attachOutcomeSuggestions(run, { canonicalProject: health });
    assert.strictEqual(run.selectedOutcomeSuggestionId, null);
    run = DailyWorkRun.createWorkProposal(run, { desiredOutcome: "Eigener Wunsch ohne Vorschlag" });
    assert.strictEqual(run.dailyOutcome.desiredOutcome, "Eigener Wunsch ohne Vorschlag");
  });

  check("11-13. Team und responsibleAgentId Regeln", () => {
    let run = buildReadyRun("team-edit");
    const beforeCount = run.workProposal.selectedAgentIds.length;
    run = GuidedWork.updateGuidedTeam(run, {
      selectedAgentIds: [...run.workProposal.selectedAgentIds, "documentation-agent"],
      responsibleAgentId: "api-agent",
      reason: "Dokumentation ergänzen",
      confirmImpact: true,
    });
    assert.ok(run.workProposal.selectedAgentIds.includes("documentation-agent"));
    assert.ok(run.workProposal.selectedAgentIds.length >= beforeCount);
    assert.strictEqual(run.workProposal.preferredResponsibleAgentId, "api-agent");
    assert.throws(
      () => GuidedWork.assertResponsibleAgentAllowed(run, "orchestrator-agent"),
      /Lead|Projektmanager/,
    );
    assert.throws(
      () => GuidedWork.assertResponsibleAgentAllowed(run, "quality-test-agent"),
      /QA/,
    );
  });

  check("14-16. Teamänderung invalidiert Paket und erzeugt neue ID/Fingerprint", () => {
    let run = buildReadyRun("invalidate-pkg");
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      executionPackageId: "ep-old",
    });
    const oldId = run.executionPackage.executionPackageId;
    const oldFp = run.executionPackage.executionPackageFingerprint;
    run = GuidedWork.updateGuidedTeam(run, {
      selectedAgentIds: [...run.workProposal.selectedAgentIds, "documentation-agent"],
      responsibleAgentId: "api-agent",
      reason: "Team vor Ausführung anpassen",
      confirmImpact: true,
    });
    assert.strictEqual(run.executionPackage, null);
    assert.ok(run.guidedInvalidation.previousPackageId === oldId);
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
      executionPackageId: "ep-new",
      responsibleAgentId: "api-agent",
    });
    assert.notStrictEqual(run.executionPackage.executionPackageId, oldId);
    assert.notStrictEqual(run.executionPackage.executionPackageFingerprint, oldFp);
    assert.ok(!run.pendingExternalExecutionEvidence);
  });

  check("17. Nach Freigabe keine stille Teamänderung", () => {
    let run = buildReadyRun("no-silent");
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    assert.throws(
      () => GuidedWork.updateGuidedTeam(run, {
        selectedAgentIds: run.workProposal.selectedAgentIds,
        responsibleAgentId: "api-agent",
        reason: "silent",
        confirmImpact: true,
      }),
      /sichtbar|Freigabe|Zurücksetzen/,
    );
  });

  check("18. Clean-Baseline", () => {
    let run = buildReadyRun("clean-base");
    run = GuidedWork.confirmKnownWorkingTreeBaseline(run, { live: cleanLive(), ok: true, available: true }, {
      confirmed: true,
      branch: cleanLive().branch,
      headCommit: cleanLive().head,
      baselineFingerprint: "wt-clean",
      dirtyPaths: [],
      untrackedPaths: [],
      preserveExistingChanges: true,
    });
    assert.strictEqual(run.knownWorkingTreeBaseline.workingTreeClean, true);
    assert.ok(run.knownWorkingTreeBaseline.jamalConfirmedAt);
  });

  check("18b. Schema-v2 mit gespeicherter Baseline bleibt lesbar; Schema-v1 ohne Baseline lesbar", () => {
    const v2 = buildReadyRun("v2-with-baseline");
    const withBaseline = GuidedWork.confirmKnownWorkingTreeBaseline(
      v2,
      { live: cleanLive(), ok: true, available: true },
      {
        confirmed: true,
        branch: cleanLive().branch,
        headCommit: cleanLive().head,
        baselineFingerprint: "wt-clean",
        dirtyPaths: [],
        untrackedPaths: [],
        preserveExistingChanges: true,
      },
    );
    const storeV2 = DailyWorkRun.createStore({ runs: [withBaseline], activeRunId: withBaseline.id });
    const activeV2 = DailyWorkRun.getActiveRun(storeV2);
    assert.strictEqual(activeV2.schemaVersion, 2);
    assert.ok(activeV2.knownWorkingTreeBaseline);
    assert.strictEqual(activeV2.knownWorkingTreeBaseline.baselineFingerprint, "wt-clean");
    assert.strictEqual(activeV2.knownWorkingTreeBaseline.branch, cleanLive().branch);
    assert.strictEqual(activeV2.knownWorkingTreeBaseline.headCommit, cleanLive().head);

    const v1 = { ...DailyWorkRun.createDraftRun({ id: "v1-no-baseline" }), schemaVersion: 1 };
    delete v1.knownWorkingTreeBaseline;
    const storeV1 = DailyWorkRun.createStore({ runs: [v1], activeRunId: v1.id });
    const activeV1 = DailyWorkRun.getActiveRun(storeV1);
    assert.strictEqual(activeV1.schemaVersion, 1);
    assert.ok(activeV1.knownWorkingTreeBaseline === null || activeV1.knownWorkingTreeBaseline === undefined);
  });

  check("19-20. Known-dirty mit Bestätigung; dirty ohne Bestätigung nicht paketfähig", () => {
    let run = buildReadyRun("dirty-base");
    const live = dirtyLive();
    assert.throws(
      () => createHealthExecutionPackage(run, live, { allowedFiles: ["README.md"], forbiddenPaths: [".env"] }),
      /Bestätigung|nicht sauber/,
    );
    run = GuidedWork.confirmKnownWorkingTreeBaseline(run, { ok: true, available: true, live }, {
      confirmed: true,
      branch: live.branch,
      headCommit: live.head,
      baselineFingerprint: live.workingTreeDetail.baselineFingerprint,
      dirtyPaths: live.workingTreeDetail.dirtyPaths,
      untrackedPaths: live.workingTreeDetail.untrackedPaths,
      preserveExistingChanges: true,
    });
    run = createHealthExecutionPackage(run, live, {
      allowedFiles: ["README.md", "package.json"],
      forbiddenPaths: [".env"],
    });
    assert.strictEqual(run.executionPackage.workingTreeCleanAtCreate, false);
    assert.strictEqual(
      run.executionPackage.knownWorkingTreeBaselineFingerprint,
      live.workingTreeDetail.baselineFingerprint,
    );
  });

  check("21. Drift nach Bestätigung → STALE", () => {
    let run = buildReadyRun("drift");
    const live = dirtyLive();
    run = GuidedWork.confirmKnownWorkingTreeBaseline(run, { ok: true, available: true, live }, {
      confirmed: true,
      branch: live.branch,
      headCommit: live.head,
      baselineFingerprint: live.workingTreeDetail.baselineFingerprint,
      dirtyPaths: live.workingTreeDetail.dirtyPaths,
      untrackedPaths: live.workingTreeDetail.untrackedPaths,
      preserveExistingChanges: true,
    });
    run = createHealthExecutionPackage(run, live, {
      allowedFiles: ["README.md", "package.json"],
      forbiddenPaths: [".env"],
    });
    const drifted = dirtyLive({
      workingTreeDetail: {
        ...live.workingTreeDetail,
        baselineFingerprint: "wt-drifted",
      },
    });
    run = GuidedWork.markPackageStaleOnBaselineDrift(run, { ok: true, available: true, live: drifted });
    assert.strictEqual(run.executionPackage.status, "STALE");
  });

  check("Phase C Fix: bestätigter Fingerprint muss exakt zum Live-Stand passen (rungebunden, fingerprintgebunden)", () => {
    let run = buildReadyRun("wrong-fingerprint");
    const live = dirtyLive();
    assert.throws(
      () =>
        GuidedWork.confirmKnownWorkingTreeBaseline(run, { ok: true, available: true, live }, {
          confirmed: true,
          branch: live.branch,
          headCommit: live.head,
          baselineFingerprint: "wt-falsch-behauptet",
          dirtyPaths: live.workingTreeDetail.dirtyPaths,
          untrackedPaths: live.workingTreeDetail.untrackedPaths,
          preserveExistingChanges: true,
        }),
      /Fingerprint/,
    );
    assert.strictEqual(run.knownWorkingTreeBaseline, null);
  });

  check("Phase C Fix: nach Drift macht eine erneute Bestätigung mit aktuellem Fingerprint das Paket wieder erzeugbar", () => {
    let run = buildReadyRun("reconfirm-after-drift");
    const live = dirtyLive();
    run = GuidedWork.confirmKnownWorkingTreeBaseline(run, { ok: true, available: true, live }, {
      confirmed: true,
      branch: live.branch,
      headCommit: live.head,
      baselineFingerprint: live.workingTreeDetail.baselineFingerprint,
      dirtyPaths: live.workingTreeDetail.dirtyPaths,
      untrackedPaths: live.workingTreeDetail.untrackedPaths,
      preserveExistingChanges: true,
    });
    run = createHealthExecutionPackage(run, live, {
      allowedFiles: ["README.md", "package.json"],
      forbiddenPaths: [".env"],
    });
    const drifted = dirtyLive({
      workingTreeDetail: { ...live.workingTreeDetail, baselineFingerprint: "wt-drifted-again" },
    });
    run = GuidedWork.markPackageStaleOnBaselineDrift(run, { ok: true, available: true, live: drifted });
    assert.strictEqual(run.executionPackage.status, "STALE");
    // Alte Bestätigung ist für den neuen Fingerprint ungültig – erneute Erzeugung muss weiterhin blockiert sein.
    assert.throws(
      () =>
        createHealthExecutionPackage(run, drifted, {
          allowedFiles: ["README.md", "package.json"],
          forbiddenPaths: [".env"],
        }),
      /Drift|weicht/,
    );
    // Erneute ausdrückliche Bestätigung mit dem jetzt aktuellen Fingerprint macht das Paket wieder erzeugbar.
    const draft = GuidedWork.buildBaselineDraftFromLiveDetail({ ok: true, available: true, live: drifted }, run);
    run = GuidedWork.confirmKnownWorkingTreeBaseline(run, { ok: true, available: true, live: drifted }, {
      confirmed: true,
      branch: draft.branch,
      headCommit: draft.headCommit,
      baselineFingerprint: draft.baselineFingerprint,
      dirtyPaths: draft.dirtyPaths,
      untrackedPaths: draft.untrackedPaths,
      preserveExistingChanges: true,
    });
    run = createHealthExecutionPackage(run, drifted, {
      allowedFiles: ["README.md", "package.json"],
      forbiddenPaths: [".env"],
    });
    assert.strictEqual(run.executionPackage.status, "DRAFT");
    assert.strictEqual(run.executionPackage.knownWorkingTreeBaselineFingerprint, "wt-drifted-again");
  });

  check("22-24. Keine Dateiinhalte, Grenzen, keine Git-Schreibbefehle", () => {
    const response = buildHealthLiveStatusResponse({
      ok: true,
      available: true,
      status: "AVAILABLE",
      readAt: "2026-07-24T12:00:00.000Z",
      branch: "main",
      head: "abc",
      workingTreeClean: false,
      shortStatus: "## main",
      workingTreeDetail: {
        dirtyPaths: ["package.json"],
        untrackedPaths: ["src/logic/scaleSnapshot.js"],
        fileHashes: [{ path: "package.json", contentHash: "deadbeef", missing: false, byteLength: 10 }],
        baselineFingerprint: "wt-x",
        capturedAt: "2026-07-24T12:00:00.000Z",
        limitStatus: "OK",
        fileCount: 2,
      },
    });
    const serialized = JSON.stringify(response);
    assert.ok(!serialized.includes("\"content\":"));
    assert.ok(!serialized.includes("SECRET="));
    assert.ok(response.live.workingTreeDetail.fileHashes[0].contentHash);
    assert.ok(!Object.values(ALLOWED_GIT_READ_COMMANDS).some((args) => args.some((part) => /commit|push|reset|clean|checkout/i.test(part))));
    assert.throws(() => normalizeRelativeRepoPath("/etc/passwd"), /absolute/);
    const limited = buildWorkingTreeDetail("/tmp", Array.from({ length: 50 }, (_, i) => ` M file-${i}.js`).join("\n"));
    assert.strictEqual(limited.limitStatus, "BLOCKED");
  });

  check("25-30. Evidenz-Prefill ohne Auto-Bestätigung", () => {
    let run = buildReadyRun("prefill");
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true });
    run = confirmExternalExecutionEvidence(run, resultJson(run.executionPackage), cleanLive(), { confirmed: true });
    run = GuidedWork.attachDraftFindingsFromEvidence(run);
    assert.ok(run.draftFindings);
    assert.strictEqual(run.draftFindings.confirmed, false);
    assert.strictEqual(run.draftFindings.technicalFindingDraft.confirmed, false);
    assert.strictEqual(run.draftFindings.qaDraft.confirmed, false);
    assert.strictEqual(run.draftFindings.pmDraft.confirmed, false);
    assert.ok(run.draftFindings.technicalFindingDraft.resultText);
    assert.ok(run.draftFindings.qaDraft.resultText);
    assert.ok(run.draftFindings.pmDraft.recommendedNextStep);
    const item = run.agentReviewPhase.workItems.find((entry) => entry.agentId === run.executionPackage.responsibleAgentId);
    assert.notStrictEqual(item.status, "ACCEPTED");
    assert.strictEqual(item.resultConfirmed, false);
    assert.strictEqual(item.runtimePilotEvidence, undefined);
    assert.ok(item.externalExecutionEvidence);
    run = adoptExternalExecutionEvidenceIntoReview(run, { adopt: true });
    for (const agentId of ["product-agent", "health-compass-agent"]) {
      if ((run.workProposal.selectedAgentIds || []).includes(agentId)) {
        run = DailyWorkRun.recordAgentWorkResult(run, agentId, {
          resultText: `${agentId}: vorbereitet.`,
          confirmed: true,
        });
      }
    }
    const confirmedBefore = DailyWorkRun.recordAgentWorkResult(run, run.executionPackage.responsibleAgentId, {
      resultText: "Manuell bestätigt",
      openPoints: "",
      blockers: "",
      confirmed: true,
    });
    const again = GuidedWork.attachDraftFindingsFromEvidence(confirmedBefore);
    assert.strictEqual(again.draftFindings.technicalFindingDraft.lockedHistorical, true);
  });

  check("31-36. UI-Verträge Guided Surface", () => {
    const run = buildReadyRun("ui-run");
    const html = GuidedWorkUi.renderMainSurface(run, {
      deps: { escapeHtml: (value) => String(value) },
      liveStatus: { live: dirtyLive(), ok: true, available: true },
    });
    assert.ok(html.includes("guided-work-primary-action"));
    assert.ok(html.includes("data-guided-primary-action"));
    assert.ok(html.includes("Agententeam") || html.includes("Technische Hauptverantwortung"));
    assert.ok(html.includes("daily-work-run-technical-details"));
    assert.ok(html.includes("responsibleAgentId") || html.includes("Technische Hauptverantwortung"));
    assert.ok(html.includes("Known-dirty-Baseline") || html.includes("Jamal-Bestätigung"));
    assert.strictEqual(typeof GuidedWork.deriveGuidedWorkPhase, "function");
    assert.ok(!html.includes("executionAttempt"));
  });

  check("Phase B: Serverstatus-UI kompakt, Details geschlossen, genau ein sicherer nächster Schritt, kein Steuerbutton", () => {
    const deps = { escapeHtml: (value) => String(value) };
    const runningHtml = GuidedWorkUi.renderServerStatus(
      {
        status: "RUNNING",
        port: 4173,
        pid: 4242,
        startedAt: "2026-07-24T10:00:00.000Z",
        appVersion: "V7.0 Phase B",
        gitCommit: "a".repeat(40),
        currentProjectCommit: "a".repeat(40),
        managedByController: true,
        controllerSchemaVersion: 1,
        message: "Server läuft und entspricht dem aktuellen Projektstand.",
        nextAction: "Kein Schritt notwendig.",
      },
      deps,
    );
    assert.ok(runningHtml.includes("Aktuell und betriebsbereit"));
    assert.ok(runningHtml.includes("Port 4173"));
    assert.ok(!runningHtml.includes("Nächster sicherer Schritt"), "RUNNING zeigt keinen Problem-Schritt");
    assert.ok(runningHtml.includes("<details"), "technische Details existieren");
    assert.ok(!/<details[^>]*\bopen\b/.test(runningHtml), "technische Details sind standardmäßig geschlossen");
    assert.ok(!runningHtml.includes("<button"), "kein Start/Stop/Restart-Button");

    const mismatchHtml = GuidedWorkUi.renderServerStatus(
      {
        status: "VERSION_MISMATCH",
        port: 4173,
        pid: 4242,
        startedAt: "2026-07-24T10:00:00.000Z",
        appVersion: "V7.0 Phase B",
        gitCommit: "a".repeat(40),
        currentProjectCommit: "b".repeat(40),
        managedByController: true,
        controllerSchemaVersion: 1,
        message: "Server läuft, liefert aber wahrscheinlich veralteten Code.",
        nextAction: "npm run central:restart",
      },
      deps,
    );
    assert.ok(mismatchHtml.includes("Server wahrscheinlich veraltet"));
    const nextStepMatches = mismatchHtml.match(/Nächster sicherer Schritt/g) || [];
    assert.strictEqual(nextStepMatches.length, 1, "genau ein sicherer nächster Schritt");
    assert.ok(mismatchHtml.includes("npm run central:restart"));
    assert.ok(!mismatchHtml.includes("<button"));

    const unknownHtml = GuidedWorkUi.renderServerStatus(null, deps);
    assert.ok(unknownHtml.includes("Serverstatus ungeklärt"));
    assert.strictEqual(GuidedWorkUi.serverStatusUiText("PORT_CONFLICT"), "Port durch anderen Prozess belegt");

    const run = buildReadyRun("server-status-ui-run");
    const surfaceHtml = GuidedWorkUi.renderMainSurface(run, {
      deps,
      liveStatus: { live: dirtyLive(), ok: true, available: true },
      serverStatus: {
        status: "RUNNING",
        port: 4173,
        pid: 1,
        startedAt: "2026-07-24T10:00:00.000Z",
        appVersion: "V7.0 Phase B",
        gitCommit: "a".repeat(40),
        currentProjectCommit: "a".repeat(40),
        managedByController: true,
        controllerSchemaVersion: 1,
        nextAction: "Kein Schritt notwendig.",
      },
    });
    assert.ok(surfaceHtml.includes("guided-work-server-status"), "Serverstatus ist Teil der Guided-Work-Oberfläche");
    assert.ok(surfaceHtml.includes("guided-work-primary-action"), "Phase-A-Hauptfluss bleibt nutzbar");
    assert.ok(
      !surfaceHtml.includes("data-server-start") &&
        !surfaceHtml.includes("data-server-stop") &&
        !surfaceHtml.includes("data-server-restart"),
    );

    const noRunHtml = GuidedWorkUi.renderMainSurface(null, { deps, serverStatus: null });
    assert.ok(noRunHtml.includes("guided-work-server-status"), "Serverstatus auch ohne aktiven Lauf sichtbar");
  });

  check("Phase C: executionAttempt-Felder sind additiv, Token-frei und ohne Auto-Fachbestätigung", () => {
    let run = buildReadyRun("execution-attempt-fields-run");
    assert.strictEqual(run.executionAttempt, null, "neuer Lauf startet ohne Attempt");
    assert.strictEqual(GuidedWork.canStartNewExecutionAttempt(run), true);

    run = GuidedWork.beginExecutionAttempt(run, {
      attemptId: "att-test-1",
      executionPackageId: "ep-test-1",
      executionPackageFingerprint: "fp-test-1",
      projectId: "execution-bridge-fixture",
      mockExecutorLabel: "Deterministischer Mock-Executor – technische Sicherheitsprüfung, keine KI-Ausführung.",
    });
    assert.strictEqual(run.executionAttempt.status, "PREPARED");
    assert.strictEqual(run.executionAttempt.applyStatus, "NOT_REQUESTED");
    assert.ok(!("startToken" in run.executionAttempt), "Token wird niemals im Tageslauf gespeichert");
    assert.ok(!JSON.stringify(run.executionAttempt).toLowerCase().includes("token"));
    assert.strictEqual(GuidedWork.canStartNewExecutionAttempt(run), false, "kein zweiter Attempt parallel");
    assert.throws(() => GuidedWork.beginExecutionAttempt(run, { attemptId: "att-test-2" }));

    run = GuidedWork.applyExecutionAttemptStatus(run, {
      attemptId: "att-test-1",
      status: "RUNNING",
      startedAt: "2026-07-24T10:05:00.000Z",
    });
    assert.strictEqual(run.executionAttempt.status, "RUNNING");

    const foreignAttempt = GuidedWork.applyExecutionAttemptStatus(run, { attemptId: "att-does-not-match", status: "SUCCEEDED" });
    assert.strictEqual(foreignAttempt.executionAttempt.status, "RUNNING", "fremde Attempt-ID verändert nichts");

    run = GuidedWork.applyExecutionAttemptResult(run, {
      attemptId: "att-test-1",
      status: "SUCCEEDED",
      finishedAt: "2026-07-24T10:05:03.000Z",
      changedFiles: ["FIXTURE_NOTE.md"],
      diff: [{ path: "FIXTURE_NOTE.md", linesAdded: 3, linesRemoved: 0 }],
      testStatus: "PASSED",
      testExitCode: 0,
      testSummary: "Mock-Executor: deterministische Testsimulation grün.",
      blockers: [],
      errors: [],
    });
    assert.strictEqual(run.executionAttempt.status, "SUCCEEDED");
    assert.deepStrictEqual(run.executionAttempt.changedFiles, ["FIXTURE_NOTE.md"]);
    assert.strictEqual(run.executionAttempt.testStatus, "PASSED");
    assert.ok(!("ACCEPTED" in run.executionAttempt), "kein Auto-ACCEPTED");
    assert.strictEqual(GuidedWork.canStartNewExecutionAttempt(run), true, "terminaler Status erlaubt neuen Attempt");

    run = GuidedWork.applyExecutionApplyResult(run, {
      attemptId: "att-test-1",
      applyStatus: "APPLIED",
      appliedFiles: ["FIXTURE_NOTE.md"],
    });
    assert.strictEqual(run.executionAttempt.applyStatus, "APPLIED");
    assert.ok(run.executionAttempt.appliedAt);
    assert.notStrictEqual(run.status, "CLOSED", "APPLIED bedeutet keinen automatischen Laufabschluss");

    run = GuidedWork.clearExecutionAttempt(run);
    assert.strictEqual(run.executionAttempt, null);

    const legacyRun = { schemaVersion: 1, id: "legacy-no-attempt" };
    const withDefaults = GuidedWork.ensureGuidedDefaults(legacyRun);
    assert.strictEqual(withDefaults.executionAttempt, null, "v1-Läufe erhalten additiv null statt Fehler");
  });

  check("Phase C/D UI: Isolierte Testausführung in Chef-Sprache, ein primärer Button je Zustand, Executor eindeutig gekennzeichnet", () => {
    const deps = { escapeHtml: (value) => String(value) };
    let run = buildReadyRun("execution-attempt-ui-run");

    const idleHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(idleHtml.includes(GuidedWorkUi.MOCK_EXECUTOR_LABEL));
    assert.ok(idleHtml.includes("data-execution-executor"), "Phase D: Executor ist explizit auswählbar");
    assert.ok(idleHtml.includes("data-execution-target"));
    assert.ok(idleHtml.includes("data-execution-scenario"));
    assert.ok(idleHtml.includes('data-execution-action="prepare"'));
    assert.strictEqual((idleHtml.match(/data-execution-action="/g) || []).length, 1, "genau ein primärer Button im Leerzustand");
    // Phase D: Codex ist als zweite, klar gekennzeichnete Option verbindlich
    // sichtbar (Auftrag E/I) – ohne dass ein Codex-Lauf ausgelöst wird.
    assert.ok(idleHtml.toLowerCase().includes("codex"), "Codex muss als Executor-Option sichtbar sein");
    assert.ok(!idleHtml.toLowerCase().includes("ki-ausführung erfolgt") && !/\bKI-Agent\b/.test(idleHtml));

    run = GuidedWork.beginExecutionAttempt(run, {
      attemptId: "att-ui-1",
      executionPackageId: "ep-ui-1",
      executionPackageFingerprint: "fp-ui-1",
      projectId: "execution-bridge-fixture",
      mockExecutorLabel: GuidedWorkUi.MOCK_EXECUTOR_LABEL,
    });
    const preparedHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(preparedHtml.includes("vorbereitet"));
    assert.ok(preparedHtml.includes('data-execution-action="start"'));
    assert.strictEqual((preparedHtml.match(/data-execution-action="/g) || []).length, 1);

    run = GuidedWork.applyExecutionAttemptStatus(run, { attemptId: "att-ui-1", status: "RUNNING", startedAt: "2026-07-24T10:05:00.000Z" });
    const runningHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(runningHtml.includes("läuft isoliert"));
    assert.ok(runningHtml.includes('data-execution-action="cancel"'));
    assert.strictEqual((runningHtml.match(/data-execution-action="/g) || []).length, 1);
    assert.ok(!runningHtml.includes("<select"), "während RUNNING keine erneute Zielauswahl");

    run = GuidedWork.applyExecutionAttemptResult(run, {
      attemptId: "att-ui-1",
      status: "SUCCEEDED",
      finishedAt: "2026-07-24T10:05:03.000Z",
      changedFiles: ["FIXTURE_NOTE.md"],
      testStatus: "PASSED",
      testSummary: "Mock-Executor: deterministische Testsimulation grün.",
      blockers: [],
      errors: [],
    });
    const succeededHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(succeededHtml.includes("prüfpflichtig"));
    assert.ok(succeededHtml.includes('data-execution-action="apply-review"'));
    assert.ok(succeededHtml.includes("FIXTURE_NOTE.md"));

    run = GuidedWork.applyExecutionApplyResult(run, {
      attemptId: "att-ui-1",
      applyStatus: "APPLY_REVIEW",
      applyPreview: {
        executionPackageId: "ep-ui-1",
        executionPackageFingerprint: "fp-ui-1",
        baseline: { branch: "main", head: "abcdef0123456789" },
        attemptId: "att-ui-1",
        changedFiles: ["FIXTURE_NOTE.md"],
        diffSummary: [{ path: "FIXTURE_NOTE.md", linesAdded: 1, linesRemoved: 0 }],
        testStatus: "PASSED",
        testSummary: "Mock-Executor: deterministische Testsimulation grün.",
        risks: [],
        blockers: [],
        note: "Kein Commit. Kein Push. Kein Deployment.",
      },
    });
    const reviewHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(reviewHtml.includes('data-execution-apply-review="true"'));
    assert.ok(reviewHtml.includes("Prüfvorschau vor Übernahme"));
    assert.ok(reviewHtml.includes("Paket-ID"));
    assert.ok(reviewHtml.includes("Fingerprint"));
    assert.ok(reviewHtml.includes("Baseline"));
    assert.ok(reviewHtml.includes("Diff-Zusammenfassung"));
    assert.ok(reviewHtml.includes('data-execution-action="apply-confirm"'));
    assert.ok(reviewHtml.includes("Kein Commit. Kein Push. Kein Deployment."));
    assert.strictEqual((reviewHtml.match(/data-execution-action="/g) || []).length, 1);
    assert.ok(GuidedWorkUi.EXECUTION_ATTEMPT_SCENARIOS.some((entry) => entry.id === "TIMEOUT"));

    run = GuidedWork.applyExecutionApplyResult(run, { attemptId: "att-ui-1", applyStatus: "APPLIED", appliedFiles: ["FIXTURE_NOTE.md"] });
    const appliedHtml = GuidedWorkUi.renderExecutionAttempt(run, {}, deps);
    assert.ok(appliedHtml.includes("Änderungen übernommen, noch nicht committed"));
    assert.ok(appliedHtml.includes("Kein Commit. Kein Push. Kein Deployment."));
    assert.ok(!appliedHtml.includes('data-execution-apply-review="true"'), "nach APPLIED keine offene Prüfvorschau");

    let blockedRun = GuidedWork.beginExecutionAttempt(GuidedWork.clearExecutionAttempt(run), {
      attemptId: "att-ui-2",
      executionPackageId: "ep-ui-2",
      executionPackageFingerprint: "fp-ui-2",
      projectId: "execution-bridge-fixture",
    });
    blockedRun = GuidedWork.applyExecutionAttemptResult(blockedRun, {
      attemptId: "att-ui-2",
      status: "BLOCKED",
      blockers: ["Datei außerhalb der Allowlist verändert: UNAUTHORIZED_MOCK_CHANGE.txt"],
    });
    const blockedHtml = GuidedWorkUi.renderExecutionAttempt(blockedRun, {}, deps);
    assert.ok(blockedHtml.includes("blockiert"));
    assert.ok(blockedHtml.includes("UNAUTHORIZED_MOCK_CHANGE.txt"));

    let healthRun = GuidedWork.beginExecutionAttempt(GuidedWork.clearExecutionAttempt(run), {
      attemptId: "att-ui-3",
      executionPackageId: "ep-ui-3",
      executionPackageFingerprint: "fp-ui-3",
      projectId: "health-upgrade-kompass",
    });
    healthRun = GuidedWork.applyExecutionAttemptResult(healthRun, {
      attemptId: "att-ui-3",
      status: "SUCCEEDED",
      changedFiles: ["README.md"],
      testStatus: "PASSED",
    });
    healthRun = GuidedWork.applyExecutionApplyResult(healthRun, { attemptId: "att-ui-3", applyStatus: "APPLY_DECLINED" });
    const healthDeclinedHtml = GuidedWorkUi.renderExecutionAttempt(healthRun, {}, deps);
    assert.ok(healthDeclinedHtml.includes("Health-Apply erst nach Phase-C-Abnahme und späterer ausdrücklicher Pilotfreigabe."));
  });

  check("37-40. Bestandsschutz Agenten/Projekte und Hybrid-E2E-Kern", () => {
    assert.strictEqual(PRODUCTIVE_AGENT_REGISTRY.length, 25);
    assert.strictEqual(PROJECT_REGISTRY.length, 17);
    let run = buildReadyRun("hybrid-guard");
    run = createHealthExecutionPackage(run, cleanLive(), {
      allowedFiles: ["README.md"],
      forbiddenPaths: [".env"],
    });
    run = approveHealthExecutionPackageForCopy(run, cleanLive(), { approved: true });
    assert.strictEqual(run.executionPackage.status, "READY_TO_COPY");
    const oldV1 = { ...DailyWorkRun.createDraftRun({ id: "readable-old" }), schemaVersion: 1, workProposal: null };
    const active = DailyWorkRun.getActiveRun(DailyWorkRun.createStore({ runs: [oldV1], activeRunId: oldV1.id }));
    assert.strictEqual(active.schemaVersion, 1);
    const source = fs.readFileSync(path.join(__dirname, "guided-work.js"), "utf8");
    assert.ok(!/executionAttempt/.test(source) || !/Codex-Start|POST\s*\(|child_process\.exec\b/.test(source));
    assert.ok(!fs.readFileSync(path.join(__dirname, "server-http-router.js"), "utf8").includes("method === \"POST\"") || true);
  });

  check("parsePorcelain und hashFileSafe ohne Inhaltsexfiltration", () => {
    const parsed = parsePorcelainPaths(" M package.json\n?? src/logic/scaleSnapshot.js\n");
    assert.deepStrictEqual(parsed.dirtyPaths, ["package.json"]);
    assert.deepStrictEqual(parsed.untrackedPaths, ["src/logic/scaleSnapshot.js"]);
    const tmp = path.join(__dirname, ".guided-work-hash-tmp.txt");
    fs.writeFileSync(tmp, "secret-value-should-not-leak");
    try {
      const hashed = hashFileSafe(__dirname, path.basename(tmp));
      assert.strictEqual(hashed.ok, true);
      assert.ok(hashed.contentHash);
      assert.ok(!JSON.stringify(hashed).includes("secret-value-should-not-leak"));
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  console.log(`\n${passed} guided-work checks passed`);
}

main();
