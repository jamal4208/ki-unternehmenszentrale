"use strict";

(function initDailyWorkRun(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DailyWorkRun = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDailyWorkRunApi() {
  const SCHEMA_VERSION = 1;
  const DAILY_STORAGE_KEY = "ki-unternehmenszentrale-daily-work-runs-v1";
  const LEGACY_MANAGEMENT_STORAGE_KEY = "ki-unternehmenszentrale-v1";
  const STATUS_VALUES = Object.freeze([
    "DRAFT",
    "READY_FOR_CODEX",
    "RESULT_RECORDED",
    "CLOSED",
    "OPEN",
  ]);
  const FINAL_STATUS_VALUES = Object.freeze(["CLOSED", "OPEN"]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function singleText(value, fieldName, required = false) {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      throw new TypeError(`${fieldName} muss genau ein Textwert sein.`);
    }
    const normalized = String(value ?? "").trim();
    if (required && !normalized) {
      throw new Error(`${fieldName} ist erforderlich.`);
    }
    return normalized;
  }

  function textList(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    const text = String(value ?? "").trim();
    if (!text) return [];
    return text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
  }

  function isoDate(value = new Date()) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function isoDateTime(value = new Date()) {
    return new Date(value).toISOString();
  }

  function sentence(value) {
    const text = String(value || "").trim();
    if (!text) return "UNGEKLÄRT.";
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  function createDraftRun(options = {}) {
    const now = options.now || new Date();
    return {
      schemaVersion: SCHEMA_VERSION,
      id: singleText(options.id || `daily-run-${Date.now()}`, "id", true),
      workDate: singleText(options.workDate || isoDate(now), "workDate", true),
      status: "DRAFT",
      focusProjectId: "",
      canonicalSnapshot: {
        capturedAt: null,
        displayName: null,
        portfolioMode: "UNGEKLÄRT",
        verificationStatus: "UNGEKLÄRT",
        lastVerifiedAt: null,
        localPath: null,
        repositoryUrl: null,
        localBranch: null,
        localHead: null,
        remoteRefs: {},
        testCommand: null,
        testStatus: "UNGEKLÄRT",
        currentStatus: "UNGEKLÄRT",
        blocker: "UNGEKLÄRT",
        openDecision: "UNGEKLÄRT",
        safetyProfile: [],
        consentFixStatus: null,
        relatedProjectIds: [],
        notes: [],
        snapshotNotice: "Keine kanonische Momentaufnahme erfasst.",
      },
      dailyOutcome: {
        desiredOutcome: "",
        reason: "",
        acceptanceCriterion: "",
      },
      boundary: {
        prohibitedToday: [],
        projectSafetyRules: [],
        externalActionsBlocked: true,
        codexExecutionBlocked: true,
        agentExecutionBlocked: true,
        automaticGitBlocked: true,
        deploymentBlocked: true,
      },
      decision: {
        blocker: "",
        jamalDecisionQuestion: "",
        jamalDecisionAnswer: "",
      },
      codexPreparation: {
        projectPath: "",
        allowedFiles: [],
        forbiddenFiles: [],
        targetChange: "",
        tests: [],
        gitRules: [],
        fallback: "",
        preparedPrompt: "",
      },
      resultReturn: {
        summary: "",
        changedFiles: [],
        tests: [],
        gitBranch: "",
        commitStatus: "kein Commit",
        pushStatus: "kein Push",
        risks: [],
        openPoints: [],
      },
      closure: {
        status: "",
        jamalDecision: "",
        nextSafeStep: "",
        historyEntry: null,
        historyTransferredAt: null,
        closedAt: null,
      },
    };
  }

  function captureCanonicalSnapshot(project, snapshotNotice, capturedAt = new Date()) {
    if (!project || typeof project !== "object") {
      throw new Error("Ein kanonisches Projekt ist erforderlich.");
    }
    singleText(project.id, "focusProjectId", true);
    return {
      capturedAt: isoDateTime(capturedAt),
      displayName: project.displayName || project.id,
      portfolioMode: project.portfolioMode || "UNGEKLÄRT",
      verificationStatus: project.verificationStatus || "UNGEKLÄRT",
      lastVerifiedAt: project.lastVerifiedAt || null,
      localPath: project.localPath || null,
      repositoryUrl: project.repositoryUrl || null,
      localBranch: project.localBranch || null,
      localHead: project.localHead || null,
      remoteRefs: plainObject(project.remoteRefs),
      testCommand: project.testCommand || null,
      testStatus: project.testStatus || "UNGEKLÄRT",
      currentStatus: project.currentStatus || "UNGEKLÄRT",
      blocker: project.blocker || "UNGEKLÄRT",
      openDecision: project.openDecision || "UNGEKLÄRT",
      safetyProfile: textList(project.safetyProfile),
      consentFixStatus: project.consentFixStatus || null,
      relatedProjectIds: textList(project.relatedProjectIds),
      notes: textList(project.notes),
      snapshotNotice: singleText(
        snapshotNotice || "Historische Tagesstart-Momentaufnahme; keine automatische Live-Aktualisierung.",
        "snapshotNotice",
        true,
      ),
    };
  }

  function setFocusProject(run, project, snapshotNotice, capturedAt) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Das Fokusprojekt kann nur im Status DRAFT geändert werden.");
    }
    next.focusProjectId = singleText(project?.id, "focusProjectId", true);
    next.canonicalSnapshot = captureCanonicalSnapshot(project, snapshotNotice, capturedAt);
    next.boundary.projectSafetyRules = textList(project.safetyProfile);
    next.boundary.prohibitedToday = [
      "Keine automatische Codex- oder Agentenausführung",
      "Keine externe Aktion",
      "Kein automatischer Commit oder Push",
      "Kein Deployment",
    ];
    next.decision.blocker = project.blocker || "UNGEKLÄRT";
    next.decision.jamalDecisionQuestion = project.openDecision || "UNGEKLÄRT";
    next.codexPreparation.projectPath = project.localPath || "";
    return next;
  }

  function setDailyOutcome(run, values = {}) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Das Tagesergebnis kann nur im Status DRAFT geändert werden.");
    }
    next.dailyOutcome = {
      desiredOutcome: singleText(values.desiredOutcome, "desiredOutcome", true),
      reason: singleText(values.reason, "reason", true),
      acceptanceCriterion: singleText(values.acceptanceCriterion, "acceptanceCriterion", true),
    };
    next.decision.jamalDecisionQuestion = singleText(
      values.jamalDecisionQuestion || next.decision.jamalDecisionQuestion,
      "jamalDecisionQuestion",
      true,
    );
    return next;
  }

  function setCodexPreparation(run, values = {}) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Die Codex-Vorbereitung kann nur im Status DRAFT geändert werden.");
    }
    next.codexPreparation = {
      projectPath: singleText(values.projectPath || next.canonicalSnapshot.localPath, "projectPath", true),
      allowedFiles: textList(values.allowedFiles),
      forbiddenFiles: textList(values.forbiddenFiles),
      targetChange: singleText(values.targetChange, "targetChange", true),
      tests: textList(values.tests),
      gitRules: textList(values.gitRules),
      fallback: singleText(values.fallback, "fallback", true),
      preparedPrompt: "",
    };
    if (next.codexPreparation.allowedFiles.length === 0) throw new Error("allowedFiles ist erforderlich.");
    if (next.codexPreparation.forbiddenFiles.length === 0) throw new Error("forbiddenFiles ist erforderlich.");
    if (next.codexPreparation.tests.length === 0) throw new Error("tests ist erforderlich.");
    if (next.codexPreparation.gitRules.length === 0) throw new Error("gitRules ist erforderlich.");
    next.codexPreparation.preparedPrompt = buildCodexPrompt(next);
    return next;
  }

  function setResultReturn(run, values = {}) {
    const next = clone(run);
    if (next.status !== "READY_FOR_CODEX") {
      throw new Error("Ergebnisse können nur nach manueller Codex-Vorbereitung erfasst werden.");
    }
    next.resultReturn = {
      summary: singleText(values.summary, "summary", true),
      changedFiles: textList(values.changedFiles),
      tests: textList(values.tests),
      gitBranch: singleText(values.gitBranch, "gitBranch", true),
      commitStatus: singleText(values.commitStatus || "kein Commit", "commitStatus", true),
      pushStatus: singleText(values.pushStatus || "kein Push", "pushStatus", true),
      risks: textList(values.risks),
      openPoints: textList(values.openPoints),
    };
    if (next.resultReturn.tests.length === 0) throw new Error("Mindestens ein Testergebnis ist erforderlich.");
    return next;
  }

  function setClosure(run, values = {}) {
    const next = clone(run);
    if (next.status !== "RESULT_RECORDED") {
      throw new Error("Der Tagesabschluss ist erst nach der Ergebnisrückführung möglich.");
    }
    const closureStatus = singleText(values.status, "closure.status", true).toUpperCase();
    if (!FINAL_STATUS_VALUES.includes(closureStatus)) {
      throw new Error("Der Abschlussstatus muss CLOSED oder OPEN sein.");
    }
    next.closure = {
      ...next.closure,
      status: closureStatus,
      jamalDecision: singleText(values.jamalDecision, "jamalDecision", true),
      nextSafeStep: singleText(values.nextSafeStep, "nextSafeStep", true),
      closedAt: isoDateTime(values.closedAt || new Date()),
    };
    return next;
  }

  function validateReadyForCodex(run) {
    const errors = [];
    if (!singleText(run.focusProjectId, "focusProjectId")) errors.push("Fokusprojekt fehlt.");
    if (!singleText(run.dailyOutcome?.desiredOutcome, "desiredOutcome")) errors.push("Tagesergebnis fehlt.");
    if (!singleText(run.dailyOutcome?.reason, "reason")) errors.push("Begründung fehlt.");
    if (!singleText(run.dailyOutcome?.acceptanceCriterion, "acceptanceCriterion")) errors.push("Abnahmekriterium fehlt.");
    if (!singleText(run.decision?.jamalDecisionQuestion, "jamalDecisionQuestion")) errors.push("Jamal-Entscheidungsfrage fehlt.");
    if (!singleText(run.codexPreparation?.projectPath, "projectPath")) errors.push("Projektpfad fehlt.");
    if (!singleText(run.codexPreparation?.targetChange, "targetChange")) errors.push("Zieländerung fehlt.");
    if (!singleText(run.codexPreparation?.fallback, "fallback")) errors.push("Rückfallmöglichkeit fehlt.");
    if (!Array.isArray(run.codexPreparation?.allowedFiles) || run.codexPreparation.allowedFiles.length === 0) errors.push("Allowlist fehlt.");
    if (!Array.isArray(run.codexPreparation?.forbiddenFiles) || run.codexPreparation.forbiddenFiles.length === 0) errors.push("Verbotsliste fehlt.");
    if (!Array.isArray(run.codexPreparation?.tests) || run.codexPreparation.tests.length === 0) errors.push("Tests fehlen.");
    if (!Array.isArray(run.codexPreparation?.gitRules) || run.codexPreparation.gitRules.length === 0) errors.push("Git-Regeln fehlen.");
    if (run.boundary?.externalActionsBlocked !== true) errors.push("Externe Aktionen sind nicht blockiert.");
    if (run.boundary?.codexExecutionBlocked !== true) errors.push("Codex-Ausführung ist nicht blockiert.");
    if (run.boundary?.agentExecutionBlocked !== true) errors.push("Agentenausführung ist nicht blockiert.");
    if (run.boundary?.automaticGitBlocked !== true) errors.push("Automatische Git-Aktion ist nicht blockiert.");
    if (run.boundary?.deploymentBlocked !== true) errors.push("Deployment ist nicht blockiert.");
    return errors;
  }

  function transitionRun(run, nextStatus) {
    const target = singleText(nextStatus, "nextStatus", true).toUpperCase();
    if (!STATUS_VALUES.includes(target)) throw new Error("Unzulässiger Tageslaufstatus.");
    const next = clone(run);
    const allowed = {
      DRAFT: ["READY_FOR_CODEX"],
      READY_FOR_CODEX: ["RESULT_RECORDED"],
      RESULT_RECORDED: ["CLOSED", "OPEN"],
      CLOSED: [],
      OPEN: [],
    };
    if (!allowed[next.status]?.includes(target)) {
      throw new Error(`Statusübergang ${next.status} → ${target} ist nicht erlaubt.`);
    }
    if (target === "READY_FOR_CODEX") {
      const errors = validateReadyForCodex(next);
      if (errors.length > 0) throw new Error(errors.join(" "));
    }
    if (target === "RESULT_RECORDED") {
      if (!next.resultReturn.summary || !next.resultReturn.gitBranch || next.resultReturn.tests.length === 0) {
        throw new Error("Die Ergebnisrückführung ist unvollständig.");
      }
    }
    if (FINAL_STATUS_VALUES.includes(target)) {
      if (next.closure.status !== target || !next.closure.jamalDecision || !next.closure.nextSafeStep) {
        throw new Error("Jamals Abschlussentscheidung und genau ein nächster Schritt sind erforderlich.");
      }
    }
    next.status = target;
    return next;
  }

  function buildCodexPrompt(run) {
    const outcome = run.dailyOutcome || {};
    const prep = run.codexPreparation || {};
    return [
      `Arbeite ausschließlich im Projekt: ${prep.projectPath || run.canonicalSnapshot?.localPath || "UNGEKLÄRT"}`,
      "",
      `Fokusprojekt: ${run.canonicalSnapshot?.displayName || run.focusProjectId || "UNGEKLÄRT"}`,
      `Gewünschtes Tagesergebnis: ${outcome.desiredOutcome || "UNGEKLÄRT"}`,
      `Begründung: ${outcome.reason || "UNGEKLÄRT"}`,
      `Abnahmekriterium: ${outcome.acceptanceCriterion || "UNGEKLÄRT"}`,
      `Zieländerung: ${prep.targetChange || "UNGEKLÄRT"}`,
      "",
      "Erlaubte Dateien:",
      ...textList(prep.allowedFiles).map((item) => `- ${item}`),
      "",
      "Nicht erlaubte Dateien:",
      ...textList(prep.forbiddenFiles).map((item) => `- ${item}`),
      "",
      "Tests:",
      ...textList(prep.tests).map((item) => `- ${item}`),
      "",
      "Git-Regeln:",
      ...textList(prep.gitRules).map((item) => `- ${item}`),
      "",
      `Rückfallmöglichkeit: ${prep.fallback || "UNGEKLÄRT"}`,
      "",
      `Jamal-Entscheidungsfrage: ${run.decision?.jamalDecisionQuestion || "UNGEKLÄRT"}`,
      "Keine automatische Codex- oder Agentenausführung. Keine externe Aktion. Kein automatischer Commit, Push oder Deployment.",
      "Dieser Text ist ausschließlich eine manuell kopierbare Auftragsvorlage.",
    ].join("\n");
  }

  function createStore(value = {}) {
    const runs = Array.isArray(value.runs) ? value.runs.map(clone) : [];
    const activeRunId = runs.some((run) => run.id === value.activeRunId) ? value.activeRunId : null;
    return {
      schemaVersion: SCHEMA_VERSION,
      activeRunId,
      runs,
    };
  }

  function loadDailyStore(storage) {
    if (!storage || typeof storage.getItem !== "function") return createStore();
    try {
      const raw = storage.getItem(DAILY_STORAGE_KEY);
      return raw ? createStore(JSON.parse(raw)) : createStore();
    } catch (_error) {
      return createStore();
    }
  }

  function saveDailyStore(storage, store) {
    if (!storage || typeof storage.setItem !== "function") {
      throw new Error("Browser-Speicher ist nicht verfügbar.");
    }
    const normalized = createStore(store);
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function upsertRun(store, run) {
    const nextStore = createStore(store);
    const safeRun = clone(run);
    const index = nextStore.runs.findIndex((entry) => entry.id === safeRun.id);
    if (index >= 0) nextStore.runs[index] = safeRun;
    else nextStore.runs.unshift(safeRun);
    nextStore.activeRunId = safeRun.id;
    return nextStore;
  }

  function getActiveRun(store) {
    const normalized = createStore(store);
    return clone(normalized.runs.find((run) => run.id === normalized.activeRunId) || null);
  }

  function currentCanonicalProject(apiPayload, projectId) {
    const safe =
      apiPayload &&
      apiPayload.writeOperationsBlocked === true &&
      apiPayload.madeExternalRequest === false &&
      apiPayload.registrySource === "project-registry.js" &&
      Array.isArray(apiPayload.projects);
    if (!safe) {
      return { available: false, status: "UNGEKLÄRT", project: null };
    }
    const project = apiPayload.projects.find((entry) => entry.id === projectId) || null;
    return project
      ? { available: true, status: project.verificationStatus || "UNGEKLÄRT", project: clone(project) }
      : { available: false, status: "UNGEKLÄRT", project: null };
  }

  function createHistoryEntry(run, manuallyConfirmed = false) {
    if (!manuallyConfirmed || !FINAL_STATUS_VALUES.includes(run.status)) return null;
    if (!run.closure?.jamalDecision || !run.closure?.nextSafeStep) return null;
    return {
      id: `daily-work-run-history-${run.id}`,
      type: "Statusänderung",
      at: run.closure.closedAt || isoDateTime(),
      description: [
        `Tagesarbeitslauf ${run.workDate}: ${run.canonicalSnapshot?.displayName || run.focusProjectId}.`,
        `Tagesergebnis: ${sentence(run.dailyOutcome?.desiredOutcome)}`,
        `Ergebnis: ${sentence(run.resultReturn?.summary)}`,
        `Jamals Entscheidung: ${sentence(run.closure.jamalDecision)}`,
        `Nächster sicherer Schritt: ${sentence(run.closure.nextSafeStep)}`,
        `Status: ${run.status}.`,
      ].join("\n"),
    };
  }

  function applyHistoryEntryOnce(history, entry) {
    const entries = Array.isArray(history) ? clone(history) : [];
    if (!entry || entries.some((existing) => existing.id === entry.id)) return entries;
    entries.unshift(clone(entry));
    return entries;
  }

  function markHistoryTransferred(run, entry, transferredAt = new Date()) {
    const next = clone(run);
    if (!entry || entry.id !== `daily-work-run-history-${next.id}`) {
      throw new Error("Ungültiger Verlaufseintrag.");
    }
    if (next.closure.historyTransferredAt) return next;
    next.closure.historyEntry = clone(entry);
    next.closure.historyTransferredAt = isoDateTime(transferredAt);
    return next;
  }

  return Object.freeze({
    DAILY_STORAGE_KEY,
    FINAL_STATUS_VALUES,
    LEGACY_MANAGEMENT_STORAGE_KEY,
    SCHEMA_VERSION,
    STATUS_VALUES,
    applyHistoryEntryOnce,
    buildCodexPrompt,
    captureCanonicalSnapshot,
    createDraftRun,
    createHistoryEntry,
    createStore,
    currentCanonicalProject,
    getActiveRun,
    loadDailyStore,
    markHistoryTransferred,
    saveDailyStore,
    setClosure,
    setCodexPreparation,
    setDailyOutcome,
    setFocusProject,
    setResultReturn,
    transitionRun,
    upsertRun,
    validateReadyForCodex,
  });
});
