"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { getProjectById, API_SECURITY_FLAGS } = require("./project-registry");

const HEALTH_PROJECT_ID = "health-upgrade-kompass";
const GIT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_CHARS = 4000;
const ALLOWED_GIT_READ_COMMANDS = Object.freeze({
  branch: ["rev-parse", "--abbrev-ref", "HEAD"],
  head: ["rev-parse", "HEAD"],
  porcelain: ["status", "--porcelain"],
  shortStatus: ["status", "-sb"],
});

function truncateOutput(text) {
  const normalized = String(text || "").replace(/\u0000/g, "");
  if (normalized.length <= MAX_OUTPUT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_OUTPUT_CHARS)}…`;
}

function publicErrorMessage(code) {
  const messages = {
    PROJECT_NOT_HEALTH: "Live-Status ist nur für Health Upgrade Kompass verfügbar.",
    PATH_MISSING: "Kanonischer Health-Pfad ist nicht hinterlegt.",
    PATH_UNAVAILABLE: "Health-Repository ist lokal nicht verfügbar.",
    PATH_MISMATCH: "Health-Pfad konnte nicht sicher bestätigt werden.",
    GIT_FAILED: "Git-Lesestatus konnte nicht ermittelt werden.",
    BRANCH_UNCLEAR: "Aktueller Branch konnte nicht eindeutig bestimmt werden.",
    TIMEOUT: "Git-Lesevorgang überschritt das Zeitlimit.",
  };
  return messages[code] || "Health-Live-Status ist derzeit ungeklärt.";
}

function runGitRead(repoPath, args, options = {}) {
  const exec = options.execFileImpl || execFile;
  return new Promise((resolve) => {
    exec(
      "git",
      args,
      {
        cwd: repoPath,
        timeout: options.timeoutMs || GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        encoding: "utf8",
        shell: false,
        env: {
          PATH: process.env.PATH || "",
          LANG: "C",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = Boolean(error.killed) || /ETIMEDOUT|timed out/i.test(String(error.message || ""));
          resolve({
            ok: false,
            timedOut,
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            code: typeof error.code === "number" ? error.code : null,
          });
          return;
        }
        resolve({
          ok: true,
          timedOut: false,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
          code: 0,
        });
      },
    );
  });
}

function resolveCanonicalHealthPath(options = {}) {
  const project = options.project || getProjectById(HEALTH_PROJECT_ID);
  if (!project || project.id !== HEALTH_PROJECT_ID) {
    return { ok: false, code: "PROJECT_NOT_HEALTH", resolvedPath: null, project: null };
  }
  const configured = typeof project.localPath === "string" ? project.localPath.trim() : "";
  if (!configured) {
    return { ok: false, code: "PATH_MISSING", resolvedPath: null, project };
  }

  const existsSync = options.existsSyncImpl || fs.existsSync;
  const realpathSync = options.realpathSyncImpl || fs.realpathSync;
  if (!existsSync(configured)) {
    return { ok: false, code: "PATH_UNAVAILABLE", resolvedPath: null, project };
  }

  let resolvedConfigured;
  let resolvedGitDirParent;
  try {
    resolvedConfigured = realpathSync(configured);
    const gitPath = path.join(resolvedConfigured, ".git");
    if (!existsSync(gitPath)) {
      return { ok: false, code: "PATH_UNAVAILABLE", resolvedPath: null, project };
    }
    resolvedGitDirParent = realpathSync(resolvedConfigured);
  } catch (_error) {
    return { ok: false, code: "PATH_MISMATCH", resolvedPath: null, project };
  }

  if (resolvedConfigured !== resolvedGitDirParent) {
    return { ok: false, code: "PATH_MISMATCH", resolvedPath: null, project };
  }

  return { ok: true, code: null, resolvedPath: resolvedConfigured, project };
}

async function readHealthRepoStatus(options = {}) {
  const resolved = resolveCanonicalHealthPath(options);
  const readAt = new Date(options.now || Date.now()).toISOString();
  const canonicalSnapshot = resolved.project
    ? {
        localBranch: resolved.project.localBranch || null,
        localHead: resolved.project.localHead || null,
        workingTreeStatus: resolved.project.workingTreeStatus || null,
        lastVerifiedAt: resolved.project.lastVerifiedAt || null,
      }
    : null;

  if (!resolved.ok) {
    return {
      ok: false,
      available: false,
      status: "UNGEKLÄRT",
      projectId: HEALTH_PROJECT_ID,
      readAt,
      branch: null,
      head: null,
      workingTreeClean: null,
      shortStatus: null,
      errorCode: resolved.code,
      message: publicErrorMessage(resolved.code),
      canonicalSnapshot,
      writeOperationsBlocked: true,
      madeExternalRequest: false,
      testExecutionStarted: false,
      gitWriteStarted: false,
      ...API_SECURITY_FLAGS,
    };
  }

  const branchResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.branch, options);
  const headResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.head, options);
  const porcelainResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.porcelain, options);
  const shortResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.shortStatus, options);

  if ([branchResult, headResult, porcelainResult, shortResult].some((entry) => entry.timedOut)) {
    return {
      ok: false,
      available: false,
      status: "UNGEKLÄRT",
      projectId: HEALTH_PROJECT_ID,
      readAt,
      branch: null,
      head: null,
      workingTreeClean: null,
      shortStatus: null,
      errorCode: "TIMEOUT",
      message: publicErrorMessage("TIMEOUT"),
      canonicalSnapshot,
      writeOperationsBlocked: true,
      madeExternalRequest: false,
      testExecutionStarted: false,
      gitWriteStarted: false,
      ...API_SECURITY_FLAGS,
    };
  }

  if (![branchResult, headResult, porcelainResult].every((entry) => entry.ok)) {
    return {
      ok: false,
      available: false,
      status: "UNGEKLÄRT",
      projectId: HEALTH_PROJECT_ID,
      readAt,
      branch: null,
      head: null,
      workingTreeClean: null,
      shortStatus: null,
      errorCode: "GIT_FAILED",
      message: publicErrorMessage("GIT_FAILED"),
      canonicalSnapshot,
      writeOperationsBlocked: true,
      madeExternalRequest: false,
      testExecutionStarted: false,
      gitWriteStarted: false,
      ...API_SECURITY_FLAGS,
    };
  }

  const branch = String(branchResult.stdout || "").trim();
  const head = String(headResult.stdout || "").trim();
  if (!branch || branch === "HEAD" || !head) {
    return {
      ok: false,
      available: false,
      status: "UNGEKLÄRT",
      projectId: HEALTH_PROJECT_ID,
      readAt,
      branch: branch || null,
      head: head || null,
      workingTreeClean: null,
      shortStatus: truncateOutput(shortResult.stdout),
      errorCode: "BRANCH_UNCLEAR",
      message: publicErrorMessage("BRANCH_UNCLEAR"),
      canonicalSnapshot,
      writeOperationsBlocked: true,
      madeExternalRequest: false,
      testExecutionStarted: false,
      gitWriteStarted: false,
      ...API_SECURITY_FLAGS,
    };
  }

  const workingTreeClean = String(porcelainResult.stdout || "").trim() === "";

  return {
    ok: true,
    available: true,
    status: "AVAILABLE",
    projectId: HEALTH_PROJECT_ID,
    readAt,
    branch,
    head,
    workingTreeClean,
    shortStatus: truncateOutput(shortResult.stdout || ""),
    errorCode: null,
    message: workingTreeClean ? "Health-Repository ist lokal lesbar und sauber." : "Health-Repository ist lokal lesbar, Working Tree ist nicht sauber.",
    canonicalSnapshot,
    writeOperationsBlocked: true,
    madeExternalRequest: false,
    testExecutionStarted: false,
    gitWriteStarted: false,
    ...API_SECURITY_FLAGS,
  };
}

function buildHealthLiveStatusResponse(statusPayload) {
  return {
    ok: Boolean(statusPayload?.ok),
    available: Boolean(statusPayload?.available),
    status: statusPayload?.status || "UNGEKLÄRT",
    projectId: HEALTH_PROJECT_ID,
    live: {
      readAt: statusPayload?.readAt || null,
      branch: statusPayload?.branch || null,
      head: statusPayload?.head || null,
      workingTreeClean: statusPayload?.workingTreeClean,
      shortStatus: statusPayload?.shortStatus || null,
      message: statusPayload?.message || publicErrorMessage(statusPayload?.errorCode),
      errorCode: statusPayload?.errorCode || null,
    },
    canonicalSnapshot: statusPayload?.canonicalSnapshot || null,
    writeOperationsBlocked: true,
    madeExternalRequest: false,
    testExecutionStarted: false,
    gitWriteStarted: false,
    registrySource: "project-registry.js",
    ...API_SECURITY_FLAGS,
  };
}

module.exports = {
  HEALTH_PROJECT_ID,
  ALLOWED_GIT_READ_COMMANDS,
  GIT_TIMEOUT_MS,
  MAX_OUTPUT_CHARS,
  resolveCanonicalHealthPath,
  readHealthRepoStatus,
  buildHealthLiveStatusResponse,
  publicErrorMessage,
};
