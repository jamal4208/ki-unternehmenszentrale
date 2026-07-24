"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { getProjectById, API_SECURITY_FLAGS } = require("./project-registry");

const HEALTH_PROJECT_ID = "health-upgrade-kompass";
const GIT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_CHARS = 4000;
const MAX_WORKING_TREE_FILES = 40;
const MAX_FILE_HASH_BYTES = 256 * 1024;
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
    WORKING_TREE_LIMIT: "Working-Tree-Erfassung überschritt sichere Grenzen.",
    SYMLINK_REJECTED: "Symlink außerhalb des Repositories wurde abgewiesen.",
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

function normalizeRelativeInsideRepo(repoPath, relativePath) {
  const raw = String(relativePath || "").trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || raw.includes("\0") || raw.includes("..") || /^[A-Za-z]:/.test(raw)) {
    return null;
  }
  const parts = raw.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) return null;
  const absolute = path.resolve(repoPath, parts.join("/"));
  const repoRoot = path.resolve(repoPath);
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) {
    return null;
  }
  return parts.join("/");
}

function parsePorcelainPaths(porcelainStdout) {
  const dirtyPaths = [];
  const untrackedPaths = [];
  const lines = String(porcelainStdout || "").split(/\r?\n/);
  lines.forEach((line) => {
    if (!line) return;
    if (line.length < 4) return;
    const code = line.slice(0, 2);
    let pathPart = line.slice(3).trim();
    if (pathPart.startsWith("\"") && pathPart.endsWith("\"")) {
      pathPart = pathPart.slice(1, -1);
    }
    if (pathPart.includes(" -> ")) {
      pathPart = pathPart.split(" -> ").pop().trim();
    }
    if (!pathPart) return;
    if (code === "??") untrackedPaths.push(pathPart);
    else dirtyPaths.push(pathPart);
  });
  return {
    dirtyPaths: [...new Set(dirtyPaths)],
    untrackedPaths: [...new Set(untrackedPaths)],
  };
}

function hashFileSafe(repoPath, relativePath, options = {}) {
  const normalized = normalizeRelativeInsideRepo(repoPath, relativePath);
  if (!normalized) {
    return { ok: false, code: "PATH_MISMATCH", relativePath };
  }
  const absolute = path.join(repoPath, normalized);
  const existsSync = options.existsSyncImpl || fs.existsSync;
  const lstatSync = options.lstatSyncImpl || fs.lstatSync;
  const realpathSync = options.realpathSyncImpl || fs.realpathSync;
  const readFileSync = options.readFileSyncImpl || fs.readFileSync;
  const maxBytes = options.maxFileBytes || MAX_FILE_HASH_BYTES;

  if (!existsSync(absolute)) {
    return {
      ok: true,
      relativePath: normalized,
      contentHash: null,
      missing: true,
      byteLength: 0,
    };
  }

  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (_error) {
    return { ok: false, code: "PATH_MISMATCH", relativePath: normalized };
  }

  if (stat.isSymbolicLink()) {
    let realTarget;
    try {
      realTarget = realpathSync(absolute);
    } catch (_error) {
      return { ok: false, code: "SYMLINK_REJECTED", relativePath: normalized };
    }
    const repoRoot = path.resolve(repoPath);
    if (realTarget !== repoRoot && !realTarget.startsWith(`${repoRoot}${path.sep}`)) {
      return { ok: false, code: "SYMLINK_REJECTED", relativePath: normalized };
    }
  }

  if (!stat.isFile() && !stat.isSymbolicLink()) {
    return {
      ok: true,
      relativePath: normalized,
      contentHash: null,
      skippedNonFile: true,
      byteLength: 0,
    };
  }

  if (stat.size > maxBytes) {
    return { ok: false, code: "WORKING_TREE_LIMIT", relativePath: normalized, tooLarge: true };
  }

  // Hash only – never return file contents.
  const buffer = readFileSync(absolute);
  if (buffer.length > maxBytes) {
    return { ok: false, code: "WORKING_TREE_LIMIT", relativePath: normalized, tooLarge: true };
  }
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    ok: true,
    relativePath: normalized,
    contentHash,
    missing: false,
    byteLength: buffer.length,
  };
}

function buildWorkingTreeDetail(repoPath, porcelainStdout, options = {}) {
  const parsed = parsePorcelainPaths(porcelainStdout);
  const allPaths = [...parsed.dirtyPaths, ...parsed.untrackedPaths];
  const capturedAt = new Date(options.now || Date.now()).toISOString();

  if (allPaths.length === 0) {
    const baselineFingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify({ dirtyPaths: [], untrackedPaths: [], fileHashes: [] }))
      .digest("hex")
      .slice(0, 16);
    return {
      dirtyPaths: [],
      untrackedPaths: [],
      fileHashes: [],
      baselineFingerprint: `wt-${baselineFingerprint}`,
      capturedAt,
      limitStatus: "OK",
      limitMessage: null,
      fileCount: 0,
    };
  }

  if (allPaths.length > MAX_WORKING_TREE_FILES) {
    return {
      dirtyPaths: [],
      untrackedPaths: [],
      fileHashes: [],
      baselineFingerprint: null,
      capturedAt,
      limitStatus: "BLOCKED",
      limitMessage: publicErrorMessage("WORKING_TREE_LIMIT"),
      fileCount: allPaths.length,
      errorCode: "WORKING_TREE_LIMIT",
    };
  }

  const fileHashes = [];
  for (const relativePath of allPaths) {
    const hashed = hashFileSafe(repoPath, relativePath, options);
    if (!hashed.ok) {
      if (hashed.code === "SYMLINK_REJECTED" || hashed.code === "WORKING_TREE_LIMIT") {
        return {
          dirtyPaths: [],
          untrackedPaths: [],
          fileHashes: [],
          baselineFingerprint: null,
          capturedAt,
          limitStatus: hashed.code === "SYMLINK_REJECTED" ? "BLOCKED" : "UNGEKLÄRT",
          limitMessage: publicErrorMessage(hashed.code),
          fileCount: allPaths.length,
          errorCode: hashed.code,
        };
      }
      const normalized = normalizeRelativeInsideRepo(repoPath, relativePath) || relativePath;
      fileHashes.push({
        path: normalized,
        contentHash: null,
        missing: true,
        byteLength: 0,
      });
      continue;
    }
    fileHashes.push({
      path: hashed.relativePath,
      contentHash: hashed.contentHash,
      missing: Boolean(hashed.missing),
      byteLength: hashed.byteLength || 0,
    });
  }

  const dirtyPaths = parsed.dirtyPaths
    .map((entry) => normalizeRelativeInsideRepo(repoPath, entry))
    .filter(Boolean);
  const untrackedPaths = parsed.untrackedPaths
    .map((entry) => normalizeRelativeInsideRepo(repoPath, entry))
    .filter(Boolean);

  if (dirtyPaths.length !== parsed.dirtyPaths.length || untrackedPaths.length !== parsed.untrackedPaths.length) {
    return {
      dirtyPaths: [],
      untrackedPaths: [],
      fileHashes: [],
      baselineFingerprint: null,
      capturedAt,
      limitStatus: "BLOCKED",
      limitMessage: publicErrorMessage("PATH_MISMATCH"),
      fileCount: allPaths.length,
      errorCode: "PATH_MISMATCH",
    };
  }

  const baselineFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({ dirtyPaths, untrackedPaths, fileHashes }))
    .digest("hex")
    .slice(0, 16);

  return {
    dirtyPaths,
    untrackedPaths,
    fileHashes,
    baselineFingerprint: `wt-${baselineFingerprint}`,
    capturedAt,
    limitStatus: "OK",
    limitMessage: null,
    fileCount: allPaths.length,
  };
}

function unavailablePayload({ readAt, code, canonicalSnapshot }) {
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
    workingTreeDetail: null,
    errorCode: code,
    message: publicErrorMessage(code),
    canonicalSnapshot,
    writeOperationsBlocked: true,
    madeExternalRequest: false,
    testExecutionStarted: false,
    gitWriteStarted: false,
    ...API_SECURITY_FLAGS,
  };
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
    return unavailablePayload({ readAt, code: resolved.code, canonicalSnapshot });
  }

  const branchResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.branch, options);
  const headResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.head, options);
  const porcelainResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.porcelain, options);
  const shortResult = await runGitRead(resolved.resolvedPath, ALLOWED_GIT_READ_COMMANDS.shortStatus, options);

  if ([branchResult, headResult, porcelainResult, shortResult].some((entry) => entry.timedOut)) {
    return unavailablePayload({ readAt, code: "TIMEOUT", canonicalSnapshot });
  }

  if (![branchResult, headResult, porcelainResult].every((entry) => entry.ok)) {
    return unavailablePayload({ readAt, code: "GIT_FAILED", canonicalSnapshot });
  }

  const branch = String(branchResult.stdout || "").trim();
  const head = String(headResult.stdout || "").trim();
  if (!branch || branch === "HEAD" || !head) {
    return {
      ...unavailablePayload({ readAt, code: "BRANCH_UNCLEAR", canonicalSnapshot }),
      branch: branch || null,
      head: head || null,
      shortStatus: truncateOutput(shortResult.stdout),
    };
  }

  const workingTreeClean = String(porcelainResult.stdout || "").trim() === "";
  const workingTreeDetail = buildWorkingTreeDetail(resolved.resolvedPath, porcelainResult.stdout, {
    ...options,
    now: readAt,
  });

  const detailBlocked = workingTreeDetail.limitStatus && workingTreeDetail.limitStatus !== "OK";
  const status = detailBlocked ? workingTreeDetail.limitStatus : "AVAILABLE";

  return {
    ok: !detailBlocked,
    available: true,
    status,
    projectId: HEALTH_PROJECT_ID,
    readAt,
    branch,
    head,
    workingTreeClean,
    shortStatus: truncateOutput(shortResult.stdout || ""),
    workingTreeDetail,
    errorCode: detailBlocked ? workingTreeDetail.errorCode || "WORKING_TREE_LIMIT" : null,
    message: detailBlocked
      ? workingTreeDetail.limitMessage || publicErrorMessage("WORKING_TREE_LIMIT")
      : workingTreeClean
        ? "Health-Repository ist lokal lesbar und sauber."
        : "Health-Repository ist lokal lesbar, Working Tree ist nicht sauber.",
    canonicalSnapshot,
    writeOperationsBlocked: true,
    madeExternalRequest: false,
    testExecutionStarted: false,
    gitWriteStarted: false,
    ...API_SECURITY_FLAGS,
  };
}

function buildHealthLiveStatusResponse(statusPayload) {
  const detail = statusPayload?.workingTreeDetail || null;
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
      workingTreeDetail: detail
        ? {
            dirtyPaths: Array.isArray(detail.dirtyPaths) ? detail.dirtyPaths : [],
            untrackedPaths: Array.isArray(detail.untrackedPaths) ? detail.untrackedPaths : [],
            fileHashes: Array.isArray(detail.fileHashes)
              ? detail.fileHashes.map((entry) => ({
                  path: entry.path,
                  contentHash: entry.contentHash,
                  missing: Boolean(entry.missing),
                  byteLength: entry.byteLength || 0,
                }))
              : [],
            baselineFingerprint: detail.baselineFingerprint || null,
            capturedAt: detail.capturedAt || null,
            limitStatus: detail.limitStatus || null,
            limitMessage: detail.limitMessage || null,
            fileCount: detail.fileCount || 0,
          }
        : null,
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
  MAX_WORKING_TREE_FILES,
  MAX_FILE_HASH_BYTES,
  resolveCanonicalHealthPath,
  readHealthRepoStatus,
  buildHealthLiveStatusResponse,
  buildWorkingTreeDetail,
  parsePorcelainPaths,
  hashFileSafe,
  publicErrorMessage,
};
