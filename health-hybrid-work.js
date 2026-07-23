"use strict";

(function initHealthHybridWork(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.HealthHybridWork = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createHealthHybridWorkApi() {
const HEALTH_PROJECT_ID = "health-upgrade-kompass";
const EXECUTION_PACKAGE_SCHEMA_VERSION = 1;
const RESULT_RETURN_SCHEMA_VERSION = 1;
const MAX_RESULT_JSON_CHARS = 48_000;
const EXECUTION_PACKAGE_STATUSES = Object.freeze([
  "DRAFT",
  "READY_TO_COPY",
  "IN_EXTERNAL_WORK",
  "RESULT_READY",
  "STALE",
  "BLOCKED",
  "ABORTED",
]);
const RELEASE_GATE_DECISIONS = Object.freeze(["PENDING", "APPROVED", "DECLINED"]);
const RELEASE_GATE_KEYS = Object.freeze([
  "commitDecision",
  "pushDecision",
  "deployDecision",
  "externalWriteDecision",
]);
const FORBIDDEN_RESULT_KEYS = Object.freeze([
  "command",
  "commands",
  "shell",
  "exec",
  "execute",
  "script",
  "scripts",
  "eval",
  "spawn",
  "child_process",
  "npm",
  "bash",
]);
const TECHNICAL_AGENT_PREFERENCE = Object.freeze([
  "api-agent",
  "error-analysis-agent",
  "data-structure-agent",
  "ui-agent",
  "operations-agent",
  "product-agent",
  "health-compass-agent",
]);

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

function isoDateTime(value = new Date()) {
  return new Date(value).toISOString();
}

function computeFingerprint(payload) {
  const canonical = JSON.stringify(payload);
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ep-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeRelativeRepoPath(value, fieldName = "path") {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  if (!raw) {
    throw new Error(`${fieldName}: leerer Pfad ist nicht erlaubt.`);
  }
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.startsWith("~")) {
    throw new Error(`${fieldName}: absolute Pfade sind nicht erlaubt.`);
  }
  if (raw.includes("\0") || raw.includes("..")) {
    throw new Error(`${fieldName}: Pfad-Traversierung ist nicht erlaubt.`);
  }
  const parts = raw.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0) {
    throw new Error(`${fieldName}: leerer Pfad ist nicht erlaubt.`);
  }
  if (parts.some((part) => part === ".." || part.includes(".."))) {
    throw new Error(`${fieldName}: Pfad-Traversierung ist nicht erlaubt.`);
  }
  return parts.join("/");
}

function normalizeUniqueRelativePaths(values, fieldName) {
  const normalized = textList(values).map((entry) => normalizeRelativeRepoPath(entry, fieldName));
  const unique = [];
  const seen = new Set();
  normalized.forEach((entry) => {
    if (seen.has(entry)) {
      throw new Error(`${fieldName}: doppelte Pfade sind nicht erlaubt.`);
    }
    seen.add(entry);
    unique.push(entry);
  });
  return unique;
}

function createEmptyReleaseGate() {
  return {
    status: "PENDING",
    decidedAt: null,
    reason: "",
  };
}

function createEmptyReleaseGates() {
  return {
    commitDecision: createEmptyReleaseGate(),
    pushDecision: createEmptyReleaseGate(),
    deployDecision: createEmptyReleaseGate(),
    externalWriteDecision: createEmptyReleaseGate(),
    observedEvidence: {
      commitHash: null,
      notedAt: null,
      note: "",
    },
  };
}

function ensureReleaseGates(run) {
  if (run.releaseGates && typeof run.releaseGates === "object") {
    const next = clone(run.releaseGates);
    RELEASE_GATE_KEYS.forEach((key) => {
      if (!next[key] || typeof next[key] !== "object") {
        next[key] = createEmptyReleaseGate();
      } else {
        next[key] = {
          status: RELEASE_GATE_DECISIONS.includes(next[key].status) ? next[key].status : "PENDING",
          decidedAt: next[key].decidedAt || null,
          reason: singleText(next[key].reason, `${key}.reason`),
        };
      }
    });
    next.observedEvidence = {
      commitHash: singleText(next.observedEvidence?.commitHash, "observedEvidence.commitHash"),
      notedAt: next.observedEvidence?.notedAt || null,
      note: singleText(next.observedEvidence?.note, "observedEvidence.note"),
    };
    return next;
  }
  return createEmptyReleaseGates();
}

function resolveResponsibleAgentId(run, preferredId) {
  const selected = Array.isArray(run.workProposal?.selectedAgentIds)
    ? run.workProposal.selectedAgentIds
    : [];
  const leadId = run.workProposal?.leadAgentId;
  const approvalId = run.workProposal?.approvalAgentId;
  const candidates = selected.filter((id) => id && id !== leadId && id !== approvalId);
  if (preferredId) {
    if (!candidates.includes(preferredId)) {
      throw new Error("responsibleAgentId muss ein ausgewählter technischer Agent sein (nicht Lead, nicht QA).");
    }
    return preferredId;
  }
  for (const id of TECHNICAL_AGENT_PREFERENCE) {
    if (candidates.includes(id)) return id;
  }
  if (candidates.length === 0) {
    throw new Error("Kein technischer Agent für das Auftragspaket verfügbar.");
  }
  return candidates[0];
}

function defaultAllowedFiles(values, run) {
  if (values.allowedFiles) return normalizeUniqueRelativePaths(values.allowedFiles, "allowedFiles");
  const fromCodex = textList(run.codexPreparation?.allowedFiles).filter((entry) => !/\s/.test(entry) && !entry.includes(" "));
  if (fromCodex.length > 0) {
    try {
      return normalizeUniqueRelativePaths(fromCodex, "allowedFiles");
    } catch (_error) {
      // Fall through to defaults when legacy free-text allowlist is present.
    }
  }
  return normalizeUniqueRelativePaths(
    ["README.md", "package.json", "app.js", "styles.css"],
    "allowedFiles",
  );
}

function defaultForbiddenPaths(values) {
  if (values.forbiddenPaths) return normalizeUniqueRelativePaths(values.forbiddenPaths, "forbiddenPaths");
  return normalizeUniqueRelativePaths(
    [".env", ".env.local", "Archive", "Backups", "Outputs"],
    "forbiddenPaths",
  );
}

function buildPreparedPrompt(pkg) {
  return [
    "HEALTH HYBRID AUFTRAGSPAKET – nur manuell außerhalb der Zentrale ausführen.",
    `executionPackageId: ${pkg.executionPackageId}`,
    `executionPackageFingerprint: ${pkg.executionPackageFingerprint}`,
    `schemaVersion: ${pkg.schemaVersion}`,
    `sourceRunId: ${pkg.sourceRunId}`,
    `sourceWorkProposalId: ${pkg.sourceWorkProposalId}`,
    `responsibleAgentId: ${pkg.responsibleAgentId}`,
    `projectId: ${pkg.projectId}`,
    `allowedBranch: ${pkg.allowedBranch}`,
    `baseCommit: ${pkg.baseCommit}`,
    `testCommand (außerhalb ausführen, nicht von der Zentrale starten): ${pkg.testCommand}`,
    "",
    "Erlaubte Dateien:",
    ...pkg.allowedFiles.map((entry) => `- ${entry}`),
    "",
    "Verbotene Pfade:",
    ...pkg.forbiddenPaths.map((entry) => `- ${entry}`),
    "",
    "Nicht-Ziele:",
    ...pkg.nonGoals.map((entry) => `- ${entry}`),
    "",
    "Sicherheitsgrenzen:",
    ...pkg.safetyBoundaries.map((entry) => `- ${entry}`),
    "",
    "Abnahmekriterien:",
    ...pkg.acceptanceCriteria.map((entry) => `- ${entry}`),
    "",
    "Git-Regeln:",
    ...pkg.gitRules.map((entry) => `- ${entry}`),
    "",
    "Rückgabe: strukturiertes JSON mit derselben executionPackageId und demselben Fingerprint.",
    "Kein Commit, kein Push, kein Deployment, kein Reset durch diesen Auftrag.",
  ].join("\n");
}

function fingerprintPayloadFromPackage(pkg) {
  return {
    schemaVersion: pkg.schemaVersion,
    sourceRunId: pkg.sourceRunId,
    sourceWorkProposalId: pkg.sourceWorkProposalId,
    responsibleAgentId: pkg.responsibleAgentId,
    projectId: pkg.projectId,
    baseCommit: pkg.baseCommit,
    allowedBranch: pkg.allowedBranch,
    allowedFiles: pkg.allowedFiles,
    forbiddenPaths: pkg.forbiddenPaths,
    nonGoals: pkg.nonGoals,
    safetyBoundaries: pkg.safetyBoundaries,
    acceptanceCriteria: pkg.acceptanceCriteria,
    testCommand: pkg.testCommand,
    gitRules: pkg.gitRules,
  };
}

function assertLiveBaselineReady(liveStatus, expected = {}) {
  if (!liveStatus || liveStatus.available !== true || liveStatus.ok !== true) {
    throw new Error("Health-Repository ist nicht verfügbar.");
  }
  if (!liveStatus.branch || liveStatus.branch === "HEAD") {
    throw new Error("Aktueller Branch ist nicht eindeutig bestimmt.");
  }
  if (liveStatus.workingTreeClean !== true) {
    throw new Error("Working Tree ist nicht sauber. Keine automatische Bereinigung.");
  }
  if (!liveStatus.head) {
    throw new Error("HEAD konnte nicht gelesen werden.");
  }
  if (expected.allowedBranch && liveStatus.branch !== expected.allowedBranch) {
    throw new Error("Branch weicht von allowedBranch ab.");
  }
  if (expected.baseCommit && liveStatus.head !== expected.baseCommit) {
    throw new Error("HEAD weicht vom gespeicherten baseCommit ab.");
  }
}

function createHealthExecutionPackage(run, liveStatus, values = {}) {
  if (!run || run.focusProjectId !== HEALTH_PROJECT_ID) {
    throw new Error("Auftragspaket ist nur für Health Upgrade Kompass verfügbar.");
  }
  if (!["READY_FOR_CODEX", "RESULT_RECORDED"].includes(run.status)) {
    throw new Error("Auftragspaket erfordert einen erstellten Arbeitsvorschlag.");
  }
  if (!run.workProposal) {
    throw new Error("Arbeitsvorschlag fehlt.");
  }

  assertLiveBaselineReady(liveStatus);

  const now = values.now || new Date();
  const createdAt = isoDateTime(now);
  const responsibleAgentId = resolveResponsibleAgentId(run, values.responsibleAgentId || null);
  const allowedFiles = defaultAllowedFiles(values, run);
  const forbiddenPaths = defaultForbiddenPaths(values);
  const overlap = allowedFiles.filter((entry) => forbiddenPaths.includes(entry));
  if (overlap.length > 0) {
    throw new Error("allowedFiles und forbiddenPaths dürfen sich nicht überschneiden.");
  }

  const draft = {
    schemaVersion: EXECUTION_PACKAGE_SCHEMA_VERSION,
    executionPackageId: singleText(values.executionPackageId || `ep-${run.id}-${Date.now()}`, "executionPackageId", true),
    sourceRunId: run.id,
    sourceWorkProposalId: singleText(
      values.sourceWorkProposalId || `wp-${run.id}`,
      "sourceWorkProposalId",
      true,
    ),
    responsibleAgentId,
    projectId: HEALTH_PROJECT_ID,
    baseCommit: liveStatus.head,
    allowedBranch: liveStatus.branch,
    allowedFiles,
    forbiddenPaths,
    nonGoals: textList(values.nonGoals).length
      ? textList(values.nonGoals)
      : [
          "Kein Commit",
          "Kein Push",
          "Kein Deployment",
          "Keine Allowlist-Erweiterung ohne neues Paket",
          "Keine medizinische oder rechtliche Freigabe",
        ],
    safetyBoundaries: textList(values.safetyBoundaries).length
      ? textList(values.safetyBoundaries)
      : textList(run.boundary?.prohibitedToday).concat([
          "Keine Agentenausführung aus der Zentrale",
          "Kein Testprozess aus der Zentrale",
        ]),
    acceptanceCriteria: textList(values.acceptanceCriteria).length
      ? textList(values.acceptanceCriteria)
      : textList(run.workProposal?.testsAndQuality || run.codexPreparation?.tests),
    testCommand: singleText(
      values.testCommand || run.canonicalSnapshot?.testCommand || "npm test",
      "testCommand",
      true,
    ),
    gitRules: textList(values.gitRules).length
      ? textList(values.gitRules)
      : [
          "kein Branchwechsel außer freigegebenem allowedBranch",
          "kein Commit",
          "kein Push",
          "kein Deployment",
          "kein Reset",
          "kein clean",
        ],
    createdAt,
    jamalApprovedAt: null,
    status: "DRAFT",
    executionPackageFingerprint: "",
    preparedPrompt: "",
    packageJson: "",
  };

  draft.executionPackageFingerprint = computeFingerprint(fingerprintPayloadFromPackage(draft));
  draft.preparedPrompt = buildPreparedPrompt(draft);
  draft.packageJson = JSON.stringify(
    {
      schemaVersion: draft.schemaVersion,
      executionPackageId: draft.executionPackageId,
      executionPackageFingerprint: draft.executionPackageFingerprint,
      sourceRunId: draft.sourceRunId,
      sourceWorkProposalId: draft.sourceWorkProposalId,
      responsibleAgentId: draft.responsibleAgentId,
      projectId: draft.projectId,
      baseCommit: draft.baseCommit,
      allowedBranch: draft.allowedBranch,
      allowedFiles: draft.allowedFiles,
      forbiddenPaths: draft.forbiddenPaths,
      nonGoals: draft.nonGoals,
      safetyBoundaries: draft.safetyBoundaries,
      acceptanceCriteria: draft.acceptanceCriteria,
      testCommand: draft.testCommand,
      gitRules: draft.gitRules,
      createdAt: draft.createdAt,
      returnSchemaVersion: RESULT_RETURN_SCHEMA_VERSION,
    },
    null,
    2,
  );

  const next = clone(run);
  next.executionPackage = draft;
  next.releaseGates = ensureReleaseGates(next);
  return next;
}

function approveHealthExecutionPackageForCopy(run, liveStatus, values = {}) {
  const next = clone(run);
  const pkg = next.executionPackage;
  if (!pkg) throw new Error("Kein Auftragspaket vorhanden.");
  if (!["DRAFT", "BLOCKED", "STALE"].includes(pkg.status)) {
    throw new Error("Paket ist für die Kopierfreigabe nicht im zulässigen Status.");
  }
  assertLiveBaselineReady(liveStatus, {
    allowedBranch: pkg.allowedBranch,
    baseCommit: pkg.baseCommit,
  });
  if (values.approved !== true) {
    throw new Error("Jamals ausdrückliche Freigabe ist erforderlich.");
  }
  pkg.status = "READY_TO_COPY";
  pkg.jamalApprovedAt = isoDateTime(values.now || new Date());
  next.executionPackage = pkg;
  return next;
}

function markHealthExecutionPackageInExternalWork(run) {
  const next = clone(run);
  const pkg = next.executionPackage;
  if (!pkg || pkg.status !== "READY_TO_COPY") {
    throw new Error("Paket muss READY_TO_COPY sein.");
  }
  pkg.status = "IN_EXTERNAL_WORK";
  next.executionPackage = pkg;
  return next;
}

function abortHealthExecutionPackage(run, values = {}) {
  const next = clone(run);
  if (!next.executionPackage) throw new Error("Kein Auftragspaket vorhanden.");
  next.executionPackage = {
    ...next.executionPackage,
    status: "ABORTED",
    abortReason: singleText(values.reason || "Manuell abgebrochen", "abortReason", true),
    abortedAt: isoDateTime(values.now || new Date()),
  };
  return next;
}

function assertNoUnknownExecutableFields(payload) {
  const stack = [{ value: payload, path: "$" }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      current.value.forEach((entry, index) => stack.push({ value: entry, path: `${current.path}[${index}]` }));
      continue;
    }
    Object.keys(current.value).forEach((key) => {
      if (FORBIDDEN_RESULT_KEYS.includes(key)) {
        throw new Error(`Unzulässiges ausführbares Feld in Rückgabe: ${key}`);
      }
      stack.push({ value: current.value[key], path: `${current.path}.${key}` });
    });
  }
}

function parseExternalResultJson(rawText) {
  const text = String(rawText ?? "");
  if (!text.trim()) throw new Error("Ergebnis-JSON fehlt.");
  if (text.length > MAX_RESULT_JSON_CHARS) {
    throw new Error("Ergebnis-JSON überschreitet die Größenbegrenzung.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error("Ergebnis-JSON ist ungültig.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Ergebnis-JSON muss ein Objekt sein.");
  }
  assertNoUnknownExecutableFields(parsed);
  return parsed;
}

function validateChangedFilesAgainstPackage(changedFiles, pkg) {
  const normalized = normalizeUniqueRelativePaths(changedFiles, "changedFiles");
  const allowed = new Set(pkg.allowedFiles);
  const forbidden = new Set(pkg.forbiddenPaths);
  const blockers = [];
  normalized.forEach((filePath) => {
    if (forbidden.has(filePath) || [...forbidden].some((entry) => filePath === entry || filePath.startsWith(`${entry}/`))) {
      blockers.push(`Verbotener Pfad: ${filePath}`);
    }
    if (!allowed.has(filePath)) {
      blockers.push(`Datei außerhalb der Allowlist: ${filePath}`);
    }
  });
  return { changedFiles: normalized, blockers };
}

function previewExternalExecutionResult(run, rawText, liveStatus = null) {
  const pkg = run?.executionPackage;
  if (!pkg) throw new Error("Kein Auftragspaket vorhanden.");
  if (["ABORTED"].includes(pkg.status)) {
    throw new Error("Abgebrochenes Paket nimmt keine Ergebnisse an.");
  }

  const parsed = parseExternalResultJson(rawText);
  const executionPackageId = singleText(parsed.executionPackageId, "executionPackageId", true);
  const executionPackageFingerprint = singleText(
    parsed.executionPackageFingerprint,
    "executionPackageFingerprint",
    true,
  );
  if (executionPackageId !== pkg.executionPackageId) {
    throw new Error("executionPackageId stimmt nicht mit dem aktiven Paket überein.");
  }
  if (executionPackageFingerprint !== pkg.executionPackageFingerprint) {
    throw new Error("executionPackageFingerprint stimmt nicht mit dem aktiven Paket überein.");
  }

  const expectedFingerprint = computeFingerprint(fingerprintPayloadFromPackage(pkg));
  if (expectedFingerprint !== pkg.executionPackageFingerprint) {
    throw new Error("Auftragspaket wurde nachträglich verändert und ist ungültig.");
  }

  let packageStatus = pkg.status;
  let baselineBlockers = [];
  if (liveStatus) {
    if (liveStatus.available !== true || liveStatus.branch !== pkg.allowedBranch || liveStatus.head !== pkg.baseCommit) {
      packageStatus = liveStatus.workingTreeClean === false && liveStatus.branch === pkg.allowedBranch && liveStatus.head === pkg.baseCommit
        ? "BLOCKED"
        : "STALE";
      baselineBlockers.push("Branch oder baseCommit weicht bei der Rückführung ab.");
    }
  }

  const summary = singleText(parsed.summary, "summary", true);
  const { changedFiles, blockers: allowlistBlockers } = validateChangedFilesAgainstPackage(
    parsed.changedFiles || [],
    pkg,
  );
  const errors = textList(parsed.errors);
  const risks = textList(parsed.risks);
  const openPoints = textList(parsed.openPoints);
  const testCommand = singleText(parsed.testCommand || pkg.testCommand, "testCommand", true);
  const testExitCode = Number.isInteger(parsed.testExitCode) ? parsed.testExitCode : null;
  if (testExitCode === null) throw new Error("testExitCode muss eine ganze Zahl sein.");
  const testOutputSummary = singleText(parsed.testOutputSummary, "testOutputSummary", true);
  const diffSummary = singleText(parsed.diffSummary || "", "diffSummary");
  const gitBranchObserved = singleText(parsed.gitBranchObserved || parsed.gitBranch || "", "gitBranchObserved");
  const baseCommitObserved = singleText(parsed.baseCommitObserved || "", "baseCommitObserved");
  const headCommitObserved = singleText(parsed.headCommitObserved || "", "headCommitObserved");

  if (baseCommitObserved && baseCommitObserved !== pkg.baseCommit) {
    packageStatus = "STALE";
    baselineBlockers.push("baseCommitObserved weicht vom Paket ab.");
  }
  if (gitBranchObserved && gitBranchObserved !== pkg.allowedBranch) {
    packageStatus = "STALE";
    baselineBlockers.push("gitBranchObserved weicht von allowedBranch ab.");
  }

  const hardBlockers = [...allowlistBlockers, ...baselineBlockers];
  if (allowlistBlockers.length > 0) {
    packageStatus = "BLOCKED";
  }

  const evidence = {
    schemaVersion: RESULT_RETURN_SCHEMA_VERSION,
    executionPackageId,
    executionPackageFingerprint,
    responsibleAgentId: pkg.responsibleAgentId,
    summary,
    changedFiles,
    diffSummary,
    errors,
    risks,
    openPoints,
    testCommand,
    testExitCode,
    testOutputSummary,
    gitBranchObserved: gitBranchObserved || null,
    baseCommitObserved: baseCommitObserved || null,
    headCommitObserved: headCommitObserved || null,
    hardBlockers,
    recordedAt: null,
    adoptedIntoReviewAt: null,
    resultSource: "Externe Cursor-/Codex-Arbeit · noch nicht in Prüfphase übernommen",
  };

  return {
    ok: hardBlockers.length === 0,
    blocked: hardBlockers.length > 0,
    packageStatusIfSaved: packageStatus,
    evidence,
    previewOnly: true,
    message:
      hardBlockers.length > 0
        ? "Rückführung ist blockiert. Speichern nur zur Dokumentation nach Bestätigung, ohne Freigabe."
        : "Vorschau gültig. Erst Jamals Bestätigung speichert die Evidenz.",
  };
}

function confirmExternalExecutionEvidence(run, rawText, liveStatus, values = {}) {
  if (values.confirmed !== true) {
    throw new Error("Jamal-Bestätigung ist erforderlich, bevor die Rückführung gespeichert wird.");
  }
  const preview = previewExternalExecutionResult(run, rawText, liveStatus);
  const next = clone(run);
  const pkg = next.executionPackage;
  pkg.status = preview.packageStatusIfSaved === "READY_TO_COPY" || preview.packageStatusIfSaved === "IN_EXTERNAL_WORK" || preview.packageStatusIfSaved === "DRAFT"
    ? preview.blocked
      ? "BLOCKED"
      : "RESULT_READY"
    : preview.packageStatusIfSaved;
  if (preview.blocked && pkg.status !== "STALE") {
    pkg.status = "BLOCKED";
  }
  next.executionPackage = pkg;

  const evidence = {
    ...preview.evidence,
    recordedAt: isoDateTime(values.now || new Date()),
    previewConfirmedByJamal: true,
  };

  const phase = next.agentReviewPhase;
  if (phase?.preparedAt && Array.isArray(phase.workItems)) {
    phase.workItems = phase.workItems.map((item) => {
      if (item.agentId !== pkg.responsibleAgentId) return item;
      return {
        ...item,
        externalExecutionEvidence: evidence,
        // Never auto-accept.
        resultConfirmed: item.resultConfirmed === true,
        status: item.status === "ACCEPTED" ? item.status : item.status,
      };
    });
    next.agentReviewPhase = phase;
  } else {
    next.pendingExternalExecutionEvidence = evidence;
  }

  next.resultReturn = {
    ...next.resultReturn,
    summary: evidence.summary,
    changedFiles: evidence.changedFiles,
    tests: [`${evidence.testCommand} → exit ${evidence.testExitCode}`, evidence.testOutputSummary],
    gitBranch: evidence.gitBranchObserved || pkg.allowedBranch,
    commitStatus: "kein Commit",
    pushStatus: "kein Push",
    risks: evidence.risks,
    openPoints: evidence.openPoints,
    diffSummary: evidence.diffSummary,
    errors: evidence.errors,
    testCommand: evidence.testCommand,
    testExitCode: evidence.testExitCode,
    testOutputSummary: evidence.testOutputSummary,
    executionPackageId: evidence.executionPackageId,
    executionPackageFingerprint: evidence.executionPackageFingerprint,
    ingestSource: "pasted-package",
    hardBlockers: evidence.hardBlockers,
  };
  next.releaseGates = ensureReleaseGates(next);
  return next;
}

function adoptExternalExecutionEvidenceIntoReview(run, values = {}) {
  const next = clone(run);
  const pkg = next.executionPackage;
  if (!pkg) throw new Error("Kein Auftragspaket vorhanden.");
  const phase = next.agentReviewPhase;
  if (!phase?.preparedAt) throw new Error("Prüfphase muss vorbereitet sein.");
  const item = phase.workItems.find((entry) => entry.agentId === pkg.responsibleAgentId);
  if (!item?.externalExecutionEvidence?.recordedAt) {
    throw new Error("Keine gespeicherte externe Evidenz auf der Agentenkarte.");
  }
  if (values.adopt !== true) {
    throw new Error("Jamals ausdrückliche Übernahme in die Prüfphase ist erforderlich.");
  }
  if (item.externalExecutionEvidence.hardBlockers?.length) {
    throw new Error("Blockierte Evidenz darf nicht in die Prüfphase übernommen werden.");
  }

  phase.workItems = phase.workItems.map((entry) => {
    if (entry.agentId !== pkg.responsibleAgentId) return entry;
    if (entry.status === "ACCEPTED" || entry.resultConfirmedAt || entry.resultConfirmed === true) {
      throw new Error("Ein bereits bestätigter Fachbefund wird durch Evidenzübernahme nicht verändert.");
    }
    const evidence = {
      ...entry.externalExecutionEvidence,
      adoptedIntoReviewAt: isoDateTime(values.now || new Date()),
      resultSource: "Externe Cursor-/Codex-Evidenz · in Prüfphase übernommen, noch kein bestätigter Fachbefund",
    };
    // Übernahme ist noch kein aufgezeichneter/bestätigter Befund.
    // Status wird anschließend über refreshAgentReviewPhase als READY/WAITING berechnet.
    return {
      ...entry,
      externalExecutionEvidence: evidence,
      resultText: entry.resultText || evidence.summary || "",
      openPoints: Array.isArray(entry.openPoints) && entry.openPoints.length
        ? entry.openPoints
        : textList(evidence.openPoints),
      blockers: Array.isArray(entry.blockers) && entry.blockers.length
        ? entry.blockers
        : textList(evidence.hardBlockers),
      status: ["READY", "WAITING"].includes(entry.status) ? entry.status : "WAITING",
      resultConfirmed: false,
      resultConfirmedAt: null,
      resultRecordedAt: null,
      resultSource: evidence.resultSource,
      runtimePilotEvidence: entry.runtimePilotEvidence || undefined,
    };
  });
  next.agentReviewPhase = phase;
  return next;
}

function setReleaseGateDecision(run, gateKey, values = {}) {
  if (!RELEASE_GATE_KEYS.includes(gateKey)) {
    throw new Error("Unbekannte Freigabestufe.");
  }
  const next = clone(run);
  next.releaseGates = ensureReleaseGates(next);
  const status = singleText(values.status, "status", true).toUpperCase();
  if (!RELEASE_GATE_DECISIONS.includes(status)) {
    throw new Error("Freigabestatus muss PENDING, APPROVED oder DECLINED sein.");
  }
  next.releaseGates[gateKey] = {
    status,
    decidedAt: status === "PENDING" ? null : isoDateTime(values.now || new Date()),
    reason: singleText(values.reason || "", "reason"),
  };
  return next;
}

function setReleaseGateObservedEvidence(run, values = {}) {
  const next = clone(run);
  next.releaseGates = ensureReleaseGates(next);
  next.releaseGates.observedEvidence = {
    commitHash: singleText(values.commitHash || "", "commitHash"),
    notedAt: isoDateTime(values.now || new Date()),
    note: singleText(values.note || "", "note"),
  };
  return next;
}

function releaseGateDecisionLabel(gateKey, decision) {
  const labels = {
    commitDecision: {
      PENDING: "Commit-Entscheidung ausstehend",
      APPROVED: "Commit freigegeben – noch nicht ausgeführt",
      DECLINED: "Commit nicht freigegeben",
    },
    pushDecision: {
      PENDING: "Push-Entscheidung ausstehend",
      APPROVED: "Push freigegeben – noch nicht ausgeführt",
      DECLINED: "Push nicht freigegeben",
    },
    deployDecision: {
      PENDING: "Deployment-Entscheidung ausstehend",
      APPROVED: "Deployment freigegeben – noch nicht ausgeführt",
      DECLINED: "Deployment nicht freigegeben",
    },
    externalWriteDecision: {
      PENDING: "Externe Schreibwirkung ausstehend",
      APPROVED: "Externe Schreibwirkung freigegeben – noch nicht ausgeführt",
      DECLINED: "Externe Schreibwirkung nicht freigegeben",
    },
  };
  return labels[gateKey]?.[decision] || decision;
}



  return Object.freeze({
    HEALTH_PROJECT_ID,
    EXECUTION_PACKAGE_SCHEMA_VERSION,
    RESULT_RETURN_SCHEMA_VERSION,
    MAX_RESULT_JSON_CHARS,
    EXECUTION_PACKAGE_STATUSES,
    RELEASE_GATE_DECISIONS,
    RELEASE_GATE_KEYS,
    FORBIDDEN_RESULT_KEYS,
    createEmptyReleaseGates,
    ensureReleaseGates,
    normalizeRelativeRepoPath,
    normalizeUniqueRelativePaths,
    computeFingerprint,
    resolveResponsibleAgentId,
    createHealthExecutionPackage,
    approveHealthExecutionPackageForCopy,
    markHealthExecutionPackageInExternalWork,
    abortHealthExecutionPackage,
    previewExternalExecutionResult,
    confirmExternalExecutionEvidence,
    adoptExternalExecutionEvidenceIntoReview,
    setReleaseGateDecision,
    setReleaseGateObservedEvidence,
    releaseGateDecisionLabel,
    assertLiveBaselineReady,
  });

});
