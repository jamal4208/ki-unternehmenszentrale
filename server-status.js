"use strict";

// Phase B "Betriebsstabilität" – shared, mostly-pure domain module for server/version
// status. This module never starts, stops, or writes to any process. It only reads a
// fixed local git commit (read-only, shell:false) and computes status from values that
// are handed in. Process lifecycle (spawn/kill/PID files) lives exclusively in
// scripts/zentral-ctl.js, which is not part of the running app server.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");
const { API_SECURITY_FLAGS } = require("./project-registry");

const CONTROLLER_SCHEMA_VERSION = 1;
const CENTRAL_APP_VERSION = "V7.0 Phase B";
const GIT_TIMEOUT_MS = 4000;
const UNKNOWN = "UNKNOWN";
const APP_SUPPORT_DIR_NAME = "KI-Unternehmenszentrale";
const MAX_STATUS_FILE_BYTES = 8 * 1024;

const SERVER_STATUS_VALUES = Object.freeze([
  "RUNNING",
  "STOPPED",
  "STALE",
  "PORT_CONFLICT",
  "VERSION_MISMATCH",
  "UNKNOWN",
]);

function shortCommit(commit) {
  if (typeof commit !== "string" || !commit || commit === UNKNOWN) return UNKNOWN;
  return commit.slice(0, 12);
}

function readGitCommitReadOnly(repoDir, options = {}) {
  const exec = options.execFileImpl || execFile;
  return new Promise((resolve) => {
    exec(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: repoDir,
        timeout: options.timeoutMs || GIT_TIMEOUT_MS,
        maxBuffer: 4 * 1024,
        encoding: "utf8",
        shell: false,
        env: { PATH: process.env.PATH || "", LANG: "C" },
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const commit = String(stdout || "").trim();
        resolve(/^[0-9a-f]{40}$/i.test(commit) ? commit : null);
      },
    );
  });
}

/**
 * Synchronous, one-time read used only at process startup (mirrors the existing
 * synchronous startup work already done elsewhere in server.js). Never throws; returns
 * null when the commit cannot be safely determined.
 */
function readGitCommitReadOnlySync(repoDir, options = {}) {
  try {
    const stdout = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      timeout: options.timeoutMs || GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024,
      encoding: "utf8",
      shell: false,
      env: { PATH: process.env.PATH || "", LANG: "C" },
    });
    const commit = String(stdout || "").trim();
    return /^[0-9a-f]{40}$/i.test(commit) ? commit : null;
  } catch (_error) {
    return null;
  }
}

function defaultAppSupportDir() {
  return path.join(os.homedir(), "Library", "Application Support", APP_SUPPORT_DIR_NAME);
}

/**
 * Resolves the fixed, local-only App Support paths used for controller/server status
 * metadata. Accepts overrides only for tests; production always uses the real
 * per-user Application Support directory outside both git repositories.
 */
function resolveStatusPaths(options = {}) {
  const appSupportDir = options.appSupportDir || defaultAppSupportDir();
  const projectRoot = options.projectRoot || path.resolve(__dirname);
  const serverDir = path.join(appSupportDir, "server");
  return {
    appSupportDir,
    projectRoot,
    serverDir,
    statusFilePath: path.join(serverDir, "status.json"),
  };
}

function computeProjectFingerprint(projectRoot) {
  let resolved = projectRoot;
  try {
    resolved = fs.realpathSync(projectRoot);
  } catch (_error) {
    /* fall back to the given path if realpath fails */
  }
  return crypto.createHash("sha256").update(resolved).digest("hex").slice(0, 24);
}

/**
 * Read-only, defensive parse of the controller's status file. Never throws, never
 * returns file content beyond the small fixed set of expected fields, and treats any
 * ambiguity (corrupt JSON, oversized file, wrong schema version) as "not usable" rather
 * than guessing. Safe to call from the running app server (read-only) as well as from
 * the controller itself.
 */
function readStatusFileSafe(paths) {
  let stat;
  try {
    stat = fs.statSync(paths.statusFilePath);
  } catch (error) {
    if (error.code === "ENOENT") return { ok: false, reason: "MISSING" };
    return { ok: false, reason: "UNREADABLE", detail: error.code || "UNKNOWN" };
  }
  if (stat.size > MAX_STATUS_FILE_BYTES) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  let raw;
  try {
    raw = fs.readFileSync(paths.statusFilePath, "utf8");
  } catch (error) {
    return { ok: false, reason: "UNREADABLE", detail: error.code || "UNKNOWN" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return { ok: false, reason: "CORRUPT" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "CORRUPT" };
  }
  const requiredNumberFields = ["pid", "port", "controllerSchemaVersion"];
  const requiredStringFields = ["startedAt", "appVersion", "gitCommit", "projectFingerprint"];
  for (const field of requiredNumberFields) {
    if (typeof parsed[field] !== "number" || !Number.isFinite(parsed[field])) {
      return { ok: false, reason: "CORRUPT" };
    }
  }
  for (const field of requiredStringFields) {
    if (typeof parsed[field] !== "string" || !parsed[field]) {
      return { ok: false, reason: "CORRUPT" };
    }
  }
  if (parsed.controllerSchemaVersion !== CONTROLLER_SCHEMA_VERSION) {
    return { ok: false, reason: "SCHEMA_MISMATCH", record: parsed };
  }
  return { ok: true, record: parsed };
}

/**
 * Frozen, immutable snapshot captured exactly once when the app server process starts.
 * Never re-computed for the lifetime of the process.
 */
function captureStartupSnapshot({ port, gitCommit, now } = {}) {
  return Object.freeze({
    appVersion: CENTRAL_APP_VERSION,
    gitCommit: typeof gitCommit === "string" && gitCommit ? gitCommit : UNKNOWN,
    startedAt: now || new Date().toISOString(),
    port: Number(port) || null,
    controllerSchemaVersion: CONTROLLER_SCHEMA_VERSION,
  });
}

/**
 * Pure comparison of the frozen startup commit against a freshly read current commit.
 * Never invents a version claim when either side is not safely known.
 */
function describeVersionState(snapshotGitCommit, currentGitCommit) {
  const gitKnown =
    typeof snapshotGitCommit === "string" &&
    snapshotGitCommit !== UNKNOWN &&
    typeof currentGitCommit === "string" &&
    currentGitCommit !== UNKNOWN &&
    currentGitCommit;
  if (!gitKnown) {
    return { isCurrentVersion: null, status: "UNKNOWN" };
  }
  const isCurrentVersion = snapshotGitCommit === currentGitCommit;
  return { isCurrentVersion, status: isCurrentVersion ? "RUNNING" : "VERSION_MISMATCH" };
}

function statusMessageFor(status) {
  const messages = {
    RUNNING: "Server läuft und entspricht dem aktuellen Projektstand.",
    VERSION_MISMATCH:
      "Server läuft, liefert aber wahrscheinlich veralteten Code. Der Projektstand wurde nach dem Serverstart verändert.",
    UNKNOWN: "Git-Stand konnte nicht sicher gelesen werden. Es wird keine Versionsaussage erfunden.",
  };
  return messages[status] || "Serverstatus ist ungeklärt.";
}

function nextActionFor(status) {
  const actions = {
    RUNNING: "Kein Schritt notwendig.",
    VERSION_MISMATCH: "npm run central:restart",
    UNKNOWN: "npm run central:status",
  };
  return actions[status] || "npm run central:status";
}

/**
 * Builds the read-only /api/server-status payload from values already gathered by the
 * caller. No I/O here. Never claims a process is controller-managed without an exact
 * pid+port match against a safely-read controller record.
 */
function buildServerStatusApiResponse({ snapshot, currentGitCommit, controllerRecord, currentPid, currentPort }) {
  const { isCurrentVersion, status } = describeVersionState(snapshot.gitCommit, currentGitCommit);
  const managedByController = Boolean(
    controllerRecord &&
      Number(controllerRecord.pid) === Number(currentPid) &&
      Number(controllerRecord.port) === Number(currentPort),
  );
  return {
    status,
    port: currentPort,
    pid: currentPid,
    startedAt: snapshot.startedAt,
    appVersion: snapshot.appVersion,
    gitCommit: snapshot.gitCommit,
    currentProjectCommit: typeof currentGitCommit === "string" && currentGitCommit ? currentGitCommit : UNKNOWN,
    isCurrentVersion,
    managedByController,
    controllerSchemaVersion: managedByController ? controllerRecord.controllerSchemaVersion : null,
    message: statusMessageFor(status),
    nextAction: nextActionFor(status),
    ...API_SECURITY_FLAGS,
  };
}

module.exports = {
  CONTROLLER_SCHEMA_VERSION,
  CENTRAL_APP_VERSION,
  SERVER_STATUS_VALUES,
  UNKNOWN,
  MAX_STATUS_FILE_BYTES,
  shortCommit,
  readGitCommitReadOnly,
  readGitCommitReadOnlySync,
  defaultAppSupportDir,
  resolveStatusPaths,
  computeProjectFingerprint,
  readStatusFileSafe,
  captureStartupSnapshot,
  describeVersionState,
  statusMessageFor,
  nextActionFor,
  buildServerStatusApiResponse,
};
