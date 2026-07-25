"use strict";

// V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor.
//
// Dieses Modul ist die einzige Stelle, die einen isolierten, außerhalb aller
// Repositories liegenden Arbeitsbereich erzeugt, den deterministischen
// Mock-Executor darin ausführt, das Ergebnis strukturiert erfasst und –
// ausschließlich nach ausdrücklicher Freigabe – validierte Dateien in ein
// dafür vorgesehenes Fixture-Repository überträgt.
//
// Ausdrücklich NICHT Teil dieses Moduls: Codex-/Cursor-/KI-Aufruf, freie
// Shell-Befehle, Netzwerkzugriffe, npm install, Schreiben im echten
// Health-Repository, Commit, Push oder Deployment.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");

const serverStatusModule = require("./server-status");
const healthRepoStatusModule = require("./health-repo-status");
const healthHybridWorkModule = require("./health-hybrid-work");
const mockAdapter = require("./execution-mock-adapter");
const codexAdapter = require("./execution-codex-adapter");
const executorRegistry = require("./execution-executor-registry");

const HEALTH_PROJECT_ID = healthRepoStatusModule.HEALTH_PROJECT_ID;
const FIXTURE_PROJECT_ID = "execution-bridge-fixture";

const EXECUTION_ATTEMPT_STATUSES = Object.freeze([
  "PREPARED",
  "APPROVED",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
  "TIMED_OUT",
]);
const TERMINAL_ATTEMPT_STATUSES = Object.freeze([
  "SUCCEEDED",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
  "TIMED_OUT",
]);
const APPLY_STATUSES = Object.freeze([
  "NOT_REQUESTED",
  "APPLY_REVIEW",
  "APPLY_APPROVED",
  "APPLIED",
  "APPLY_DECLINED",
  "APPLY_FAILED",
  "STALE",
]);

const KNOWN_WORKING_TREE_BASELINE_FIELDS = Object.freeze([
  "schemaVersion",
  "branch",
  "headCommit",
  "capturedAt",
  "dirtyPaths",
  "untrackedPaths",
  "fileHashes",
  "baselineFingerprint",
  "sourceRunId",
  "jamalConfirmedAt",
  "jamalConfirmedClean",
  "preserveExistingChanges",
  "confirmationNote",
  "limitStatus",
  "confirmationRequired",
  "workingTreeClean",
]);

function assertRelativeRepoPath(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName}: leerer Pfad ist ungültig.`);
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (path.isAbsolute(normalized) || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${fieldName}: absolute Pfade sind nicht erlaubt.`);
  }
  if (normalized.split("/").includes("..")) {
    throw new Error(`${fieldName}: Pfad-Traversierung ist nicht erlaubt.`);
  }
  if (normalized.includes("\0")) {
    throw new Error(`${fieldName}: ungültiges Nullbyte im Pfad.`);
  }
  return normalized;
}

function assertUniqueRelativePaths(list, fieldName) {
  if (!Array.isArray(list)) {
    throw new Error(`${fieldName} muss eine Liste sein.`);
  }
  const normalized = list.map((entry) => assertRelativeRepoPath(entry, fieldName));
  const seen = new Set();
  normalized.forEach((entry) => {
    if (seen.has(entry)) {
      throw new Error(`${fieldName}: doppelte Pfade sind nicht erlaubt (${entry}).`);
    }
    seen.add(entry);
  });
  return normalized;
}

function validateFileHashesStructure(fileHashes) {
  if (!Array.isArray(fileHashes)) {
    throw new Error("fileHashes muss eine Liste sein.");
  }
  return fileHashes.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`fileHashes[${index}]: ungültige Hash-Struktur.`);
    }
    const unknown = Object.keys(entry).filter(
      (key) => !["path", "contentHash", "missing", "byteLength"].includes(key),
    );
    if (unknown.length > 0) {
      throw new Error(`fileHashes[${index}]: unbekannte Felder (${unknown.join(", ")}).`);
    }
    const relPath = assertRelativeRepoPath(entry.path, `fileHashes[${index}].path`);
    if (entry.contentHash != null && typeof entry.contentHash !== "string") {
      throw new Error(`fileHashes[${index}].contentHash muss Text oder null sein.`);
    }
    if (entry.contentHash && /[\r\n]/.test(entry.contentHash)) {
      throw new Error(`fileHashes[${index}].contentHash enthält ungültige Zeichen.`);
    }
    if (typeof entry.byteLength !== "number" || entry.byteLength < 0 || !Number.isFinite(entry.byteLength)) {
      throw new Error(`fileHashes[${index}].byteLength muss eine nicht-negative Zahl sein.`);
    }
    return {
      path: relPath,
      contentHash: entry.contentHash == null ? null : String(entry.contentHash),
      missing: Boolean(entry.missing),
      byteLength: entry.byteLength,
    };
  });
}

/**
 * Kanonische Validierung der known-dirty-/Clean-Baseline für Phase C.
 * Feldnamen sind an guided-work.js und health-hybrid-work.js angeglichen:
 * headCommit (nicht head), fileHashes, baselineFingerprint, jamalConfirmedAt.
 */
function validateKnownWorkingTreeBaseline(baseline, liveBaseline = null, options = {}) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new Error("knownWorkingTreeBaseline fehlt oder ist ungültig.");
  }
  const unknown = Object.keys(baseline).filter((key) => !KNOWN_WORKING_TREE_BASELINE_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new Error(`knownWorkingTreeBaseline: unbekannte Felder (${unknown.join(", ")}).`);
  }

  const requireConfirmation = options.requireConfirmation === true
    || (liveBaseline && liveBaseline.workingTreeClean !== true);

  const branch = String(baseline.branch || "").trim();
  const headCommit = String(baseline.headCommit || "").trim();
  const capturedAt = String(baseline.capturedAt || "").trim();
  const baselineFingerprint = String(baseline.baselineFingerprint || "").trim();
  const sourceRunId = baseline.sourceRunId == null ? null : String(baseline.sourceRunId).trim();

  if (!branch) throw new Error("knownWorkingTreeBaseline.branch fehlt.");
  if (!headCommit) throw new Error("knownWorkingTreeBaseline.headCommit fehlt.");
  if (!capturedAt) throw new Error("knownWorkingTreeBaseline.capturedAt fehlt.");
  if (!baselineFingerprint) throw new Error("knownWorkingTreeBaseline.baselineFingerprint fehlt.");
  if (baseline.schemaVersion != null && Number(baseline.schemaVersion) !== 1) {
    throw new Error("knownWorkingTreeBaseline.schemaVersion muss 1 sein.");
  }

  const dirtyPaths = assertUniqueRelativePaths(baseline.dirtyPaths || [], "dirtyPaths");
  const untrackedPaths = assertUniqueRelativePaths(baseline.untrackedPaths || [], "untrackedPaths");
  const fileHashes = validateFileHashesStructure(baseline.fileHashes || []);

  if (requireConfirmation) {
    if (!baseline.jamalConfirmedAt) {
      throw new Error("Known-dirty-Baseline erfordert jamalConfirmedAt.");
    }
    if (baseline.preserveExistingChanges !== true && baseline.jamalConfirmedClean !== true) {
      throw new Error("Known-dirty-Baseline muss preserveExistingChanges oder jamalConfirmedClean bestätigen.");
    }
  }

  if (liveBaseline) {
    if (liveBaseline.branch && branch !== liveBaseline.branch) {
      throw new Error("Bekannte Baseline-Branch weicht vom Live-Stand ab.");
    }
    if (liveBaseline.head && headCommit !== liveBaseline.head) {
      throw new Error("Bekannte Baseline-HEAD weicht vom Live-Stand ab.");
    }
    const liveFingerprint = liveBaseline.workingTreeDetail?.baselineFingerprint || null;
    if (liveFingerprint && baselineFingerprint !== liveFingerprint) {
      const err = new Error("Working-Tree-Baseline ist veraltet (Drift). Status: STALE.");
      err.code = "BASELINE_STALE";
      throw err;
    }
  }

  return {
    schemaVersion: 1,
    branch,
    headCommit,
    capturedAt,
    dirtyPaths,
    untrackedPaths,
    fileHashes,
    baselineFingerprint,
    sourceRunId,
    jamalConfirmedAt: baseline.jamalConfirmedAt || null,
    jamalConfirmedClean: baseline.jamalConfirmedClean === true,
    preserveExistingChanges: baseline.preserveExistingChanges === true,
    confirmationNote: baseline.confirmationNote || null,
    limitStatus: baseline.limitStatus || null,
    confirmationRequired: baseline.confirmationRequired === true,
    workingTreeClean: baseline.workingTreeClean === true,
  };
}
const GIT_TIMEOUT_MS = 5000;
const MAX_WORKSPACE_FILES = 200;
const MAX_WORKSPACE_FILE_BYTES = 512 * 1024;
const MAX_WORKSPACE_TOTAL_BYTES = 8 * 1024 * 1024;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 15_000;
// Codex braucht einen echten Netzwerk-/Modell-Roundtrip, der deutlich länger
// dauert als der deterministische Mock. Der Codex-Adapter selbst begrenzt den
// Kindprozess bereits auf codexAdapter.DEFAULT_CODEX_TIMEOUT_MS; dieser
// Bridge-seitige Wert liegt bewusst etwas darüber, damit der Adapter-Timeout
// im Normalfall zuerst zuschlägt und TIMED_OUT nicht allein durch die Bridge
// verursacht wird. Test-Aufrufe können weiterhin options.attemptTimeoutMs
// explizit setzen, um TIMED_OUT gezielt und schnell zu erzeugen.
const DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS = 150_000;
const TOKEN_TTL_MS = 60_000;
const MAX_AUDIT_FILE_BYTES = 512 * 1024;
const MAX_ATTEMPTS_ON_DISK = 200;
const STALE_LOCK_MS = 5 * 60_000;

const EXCLUDED_COPY_NAMES = new Set([".git", ".env", ".env.local", "node_modules", ".DS_Store"]);

// FIXTURE_CALC.js/.test.js sind additiv für Phase D (Codex-Pilot) ergänzt.
// Bestehende Mock-Attempts, die ausschließlich FIXTURE_NOTE.md/FIXTURE_DATA.json
// verwenden, sind davon unberührt.
const FIXTURE_ALLOWED_FILES = Object.freeze([
  "FIXTURE_NOTE.md",
  "FIXTURE_DATA.json",
  "FIXTURE_CALC.js",
  "FIXTURE_CALC.test.js",
]);
const FIXTURE_FORBIDDEN_PATHS = Object.freeze([".env", ".env.local", "secrets"]);

const FIXTURE_CALC_JS_CONTENT =
  "\"use strict\";\n\n// Absichtlich fehlerhaft für den Phase-D-Codex-Pilot: subtrahiert statt zu addieren.\nfunction addFixtureNumbers(a, b) {\n  return a - b;\n}\n\nmodule.exports = { addFixtureNumbers };\n";
const FIXTURE_CALC_TEST_JS_CONTENT =
  "\"use strict\";\n\nconst assert = require(\"assert\");\nconst { addFixtureNumbers } = require(\"./FIXTURE_CALC.js\");\n\nassert.strictEqual(addFixtureNumbers(2, 3), 5);\nconsole.log(\"ok 1 - addFixtureNumbers addiert korrekt\");\n";

// In-memory, RAM-only, one-time execution tokens. Never written to disk, never
// part of any run object, never returned via GET, never logged with full value.
const TOKENS = new Map();

// In-memory registry of running/cancellable attempts (cancel flags + timers).
// Cleared on process restart; on restart, any attempt still marked
// RUNNING/QUEUED on disk is treated as an orphaned recovery case (see
// describeAttemptForRecovery), never silently resumed or restarted.
const RUNTIME = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// App-Support-Pfade – ausschließlich außerhalb beider Repositories, geteilte
// Basis mit Phase B (server-status.js), getrennte Unterordner.
// ---------------------------------------------------------------------------

function resolveBridgePaths(options = {}) {
  const appSupportDir = options.appSupportDir || serverStatusModule.defaultAppSupportDir();
  return {
    appSupportDir,
    locksDir: path.join(appSupportDir, "locks"),
    attemptsDir: path.join(appSupportDir, "attempts"),
    auditDir: path.join(appSupportDir, "audit"),
    workspacesDir: path.join(appSupportDir, "workspaces"),
    fixturesDir: path.join(appSupportDir, "fixtures"),
  };
}

function ensureDirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch (_error) {
    /* best effort on platforms without POSIX permission bits */
  }
}

function ensureBridgeDirs(paths) {
  [paths.appSupportDir, paths.locksDir, paths.attemptsDir, paths.auditDir, paths.workspacesDir, paths.fixturesDir].forEach(
    ensureDirSecure,
  );
}

function writeJsonAtomic(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, serialized, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, maxBytes) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return { ok: false, reason: "MISSING" };
    return { ok: false, reason: "UNREADABLE" };
  }
  if (typeof maxBytes === "number" && stat.size > maxBytes) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return { ok: false, reason: "UNREADABLE" };
  }
  try {
    return { ok: true, record: JSON.parse(raw) };
  } catch (_error) {
    return { ok: false, reason: "CORRUPT" };
  }
}

// ---------------------------------------------------------------------------
// Audit (append-only, keine Secrets, keine Dateiinhalte, keine vollständigen
// Prompts – ausschließlich sichere Metadaten und Statuswechsel).
// ---------------------------------------------------------------------------

function appendAuditEntry(paths, entry) {
  ensureDirSecure(paths.auditDir);
  const auditPath = path.join(paths.auditDir, "execution-bridge-audit.log");
  const safeEntry = {
    at: nowIso(entry.now),
    attemptId: entry.attemptId || null,
    runId: entry.runId || null,
    projectId: entry.projectId || null,
    action: entry.action || null,
    status: entry.status || null,
    message: typeof entry.message === "string" ? entry.message.slice(0, 240) : null,
  };
  let stat = null;
  try {
    stat = fs.statSync(auditPath);
  } catch (_error) {
    stat = null;
  }
  if (stat && stat.size > MAX_AUDIT_FILE_BYTES) {
    const rotatedPath = `${auditPath}.1`;
    try {
      fs.renameSync(auditPath, rotatedPath);
    } catch (_error) {
      /* best effort rotation */
    }
  }
  fs.appendFileSync(auditPath, `${JSON.stringify(safeEntry)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Locks – genau ein aktiver Attempt pro Projekt/Repository. Stale Locks nur
// nach PID-, Attempt- und Zeitprüfung entfernen. Kein zweiter paralleler
// Schreiblauf auf dasselbe Projekt.
// ---------------------------------------------------------------------------

function lockFilePathFor(paths, projectId) {
  const key = sha256Hex(projectId).slice(0, 24);
  return path.join(paths.locksDir, `${key}.lock.json`);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function readLock(paths, projectId) {
  ensureDirSecure(paths.locksDir);
  const lockPath = lockFilePathFor(paths, projectId);
  const result = readJsonSafe(lockPath, 8 * 1024);
  if (!result.ok) return { exists: false, lockPath, record: null };
  return { exists: true, lockPath, record: result.record };
}

function isLockStale(record) {
  if (!record) return true;
  const acquiredAt = Date.parse(record.acquiredAt || "");
  const tooOld = Number.isFinite(acquiredAt) ? Date.now() - acquiredAt > STALE_LOCK_MS : true;
  const processAlive = isPidAlive(record.pid);
  return !processAlive || tooOld;
}

function acquireProjectLock(paths, projectId, attemptId) {
  const existing = readLock(paths, projectId);
  if (existing.exists && existing.record) {
    if (existing.record.attemptId === attemptId) {
      return { ok: true, lockPath: existing.lockPath };
    }
    if (!isLockStale(existing.record)) {
      return {
        ok: false,
        reason: "PROJECT_LOCK_BUSY",
        message: "Für dieses Projekt läuft bereits ein aktiver Ausführungsversuch. Genau ein aktiver Attempt pro Repository ist erlaubt.",
        holder: { attemptId: existing.record.attemptId },
      };
    }
    // Stale lock: PID nicht mehr aktiv oder Zeitgrenze überschritten.
  }
  writeJsonAtomic(existing.lockPath, {
    attemptId,
    projectId,
    pid: process.pid,
    acquiredAt: nowIso(),
  });
  return { ok: true, lockPath: existing.lockPath };
}

function releaseProjectLock(paths, projectId, attemptId) {
  const existing = readLock(paths, projectId);
  if (!existing.exists || !existing.record) return;
  if (existing.record.attemptId !== attemptId) return;
  try {
    fs.unlinkSync(existing.lockPath);
  } catch (_error) {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Attempt-Persistenz – ausschließlich strukturierte Metadaten, keine
// Dateiinhalte, keine Secrets, keine vollständigen Prompts.
// ---------------------------------------------------------------------------

function attemptFilePath(paths, attemptId) {
  return path.join(paths.attemptsDir, `${attemptId}.json`);
}

function saveAttempt(paths, attempt) {
  ensureDirSecure(paths.attemptsDir);
  writeJsonAtomic(attemptFilePath(paths, attempt.attemptId), attempt);
  enforceAttemptRetention(paths);
  return attempt;
}

function loadAttempt(paths, attemptId) {
  const safeId = typeof attemptId === "string" ? attemptId.replace(/[^a-zA-Z0-9-]/g, "") : "";
  if (!safeId || safeId !== attemptId) return { ok: false, reason: "INVALID_ID" };
  const result = readJsonSafe(attemptFilePath(paths, attemptId), 256 * 1024);
  if (!result.ok) return result;
  return { ok: true, record: result.record };
}

function enforceAttemptRetention(paths) {
  let files;
  try {
    files = fs.readdirSync(paths.attemptsDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return;
  }
  if (files.length <= MAX_ATTEMPTS_ON_DISK) return;
  const withStats = files
    .map((name) => {
      const full = path.join(paths.attemptsDir, name);
      try {
        return { full, mtime: fs.statSync(full).mtimeMs };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);
  const excess = withStats.length - MAX_ATTEMPTS_ON_DISK;
  for (let index = 0; index < excess; index += 1) {
    try {
      fs.unlinkSync(withStats[index].full);
    } catch (_error) {
      /* best effort rotation */
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture-Projekt – ein eigenständiges, von der Execution Bridge selbst
// erzeugtes Test-Repository außerhalb beider echten Repositories. Wird
// niemals mit Health oder der Zentrale verwechselt und ist kein 18. Projekt
// im kanonischen Register – reine technische Testinfrastruktur.
// ---------------------------------------------------------------------------

function fixtureRepoPath(paths) {
  return path.join(paths.fixturesDir, "execution-bridge-demo");
}

function runGitSync(repoDir, args) {
  return execFileSync("git", args, {
    cwd: repoDir,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    encoding: "utf8",
    shell: false,
    env: { PATH: process.env.PATH || "", LANG: "C" },
  });
}

function ensureFixtureProjectRepo(options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  ensureDirSecure(paths.fixturesDir);
  const repoDir = fixtureRepoPath(paths);
  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) {
    fs.mkdirSync(repoDir, { recursive: true, mode: 0o700 });
    runGitSync(repoDir, ["init", "-q"]);
    runGitSync(repoDir, ["config", "user.email", "execution-bridge@local.invalid"]);
    runGitSync(repoDir, ["config", "user.name", "Execution Bridge Fixture"]);
    fs.writeFileSync(
      path.join(repoDir, "FIXTURE_NOTE.md"),
      "# Fixture-Notiz\n\nDiese Datei gehört zum Execution-Bridge-Fixture-Repository (Phase C).\n",
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(repoDir, "FIXTURE_DATA.json"),
      JSON.stringify({ fixture: true, purpose: "execution-bridge-demo" }, null, 2),
      { mode: 0o600 },
    );
    runGitSync(repoDir, ["add", "-A"]);
    runGitSync(repoDir, ["commit", "-q", "-m", "Fixture-Repository für Execution Bridge (Phase C)"]);
  }
  ensureFixtureCodexPilotFiles(repoDir);
  return repoDir;
}

// Additive Migration für Phase D: bestehende, bereits initialisierte
// Fixture-Repos (aus Phase C) erhalten die Codex-Pilotdateien nachträglich,
// ohne die vorhandene Historie/Commits zu verändern. Nur wenn tatsächlich
// etwas fehlt, wird ein einziger zusätzlicher Commit erzeugt; der Working
// Tree bleibt danach sauber (Voraussetzung für neue Fixture-Attempts).
function ensureFixtureCodexPilotFiles(repoDir) {
  const calcPath = path.join(repoDir, "FIXTURE_CALC.js");
  const calcTestPath = path.join(repoDir, "FIXTURE_CALC.test.js");
  const missingCalc = !fs.existsSync(calcPath);
  const missingCalcTest = !fs.existsSync(calcTestPath);
  if (!missingCalc && !missingCalcTest) return;
  if (missingCalc) fs.writeFileSync(calcPath, FIXTURE_CALC_JS_CONTENT, { mode: 0o600 });
  if (missingCalcTest) fs.writeFileSync(calcTestPath, FIXTURE_CALC_TEST_JS_CONTENT, { mode: 0o600 });
  runGitSync(repoDir, ["add", "-A"]);
  runGitSync(repoDir, ["commit", "-q", "-m", "Fixture-Pilotdateien für Codex-Adapter ergänzen (Phase D)"]);
}

// ---------------------------------------------------------------------------
// Baseline-Lesung – Health ausschließlich über die bestehende, kanonische
// read-only Health-Quelle. Fixture-Projekt über einen eigenen, ebenso
// read-only begrenzten Git-Reader (identisches Sicherheitsmuster: fixe
// Argumente, shell:false, Timeout, keine Schreibaktion).
// ---------------------------------------------------------------------------

function runGitReadAsync(repoDir, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: repoDir,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        encoding: "utf8",
        shell: false,
        env: { PATH: process.env.PATH || "", LANG: "C" },
      },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false, timedOut: Boolean(error.killed), stdout: "" });
          return;
        }
        resolve({ ok: true, timedOut: false, stdout: String(stdout || "") });
      },
    );
  });
}

async function readFixtureRepoBaseline(repoDir) {
  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync(repoDir);
  } catch (_error) {
    return { ok: false, available: false, errorCode: "PATH_UNAVAILABLE" };
  }
  if (!fs.existsSync(path.join(resolvedPath, ".git"))) {
    return { ok: false, available: false, errorCode: "PATH_UNAVAILABLE" };
  }
  const branchResult = await runGitReadAsync(resolvedPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headResult = await runGitReadAsync(resolvedPath, ["rev-parse", "HEAD"]);
  const porcelainResult = await runGitReadAsync(resolvedPath, ["status", "--porcelain"]);
  if (!branchResult.ok || !headResult.ok || !porcelainResult.ok) {
    return { ok: false, available: false, errorCode: "GIT_FAILED" };
  }
  const branch = branchResult.stdout.trim();
  const head = headResult.stdout.trim();
  const detail = healthRepoStatusModule.buildWorkingTreeDetail(resolvedPath, porcelainResult.stdout, {});
  const workingTreeClean = detail.dirtyPaths.length === 0 && detail.untrackedPaths.length === 0;
  return {
    ok: detail.limitStatus === "OK",
    available: true,
    branch,
    head,
    workingTreeClean,
    workingTreeDetail: detail,
    repoPath: resolvedPath,
    readAt: nowIso(),
  };
}

async function readHealthBaselineReadOnly() {
  const status = await healthRepoStatusModule.readHealthRepoStatus();
  const resolved = healthRepoStatusModule.resolveCanonicalHealthPath();
  return {
    ok: Boolean(status.ok),
    available: Boolean(status.available),
    branch: status.branch,
    head: status.head,
    workingTreeClean: status.workingTreeClean,
    workingTreeDetail: status.workingTreeDetail,
    repoPath: resolved.ok ? resolved.resolvedPath : null,
    readAt: status.readAt,
    message: status.message,
    errorCode: status.errorCode,
  };
}

function resolveProjectContext(projectId, options = {}) {
  if (projectId === HEALTH_PROJECT_ID) {
    return {
      projectId: HEALTH_PROJECT_ID,
      isHealth: true,
      isFixture: false,
      allowedFilesUniverse: null, // Health-Allowlist kommt aus dem bestehenden Hybrid-Paket.
      forbiddenPathsUniverse: null,
    };
  }
  if (projectId === FIXTURE_PROJECT_ID) {
    return {
      projectId: FIXTURE_PROJECT_ID,
      isHealth: false,
      isFixture: true,
      repoPath: ensureFixtureProjectRepo(options),
      allowedFilesUniverse: FIXTURE_ALLOWED_FILES,
      forbiddenPathsUniverse: FIXTURE_FORBIDDEN_PATHS,
    };
  }
  return null;
}

async function readProjectBaseline(projectContext, options = {}) {
  if (projectContext.isHealth) {
    return readHealthBaselineReadOnly();
  }
  if (projectContext.isFixture) {
    return readFixtureRepoBaseline(projectContext.repoPath);
  }
  throw new Error("Unbekannter Projektkontext für Baseline-Lesung.");
}

// ---------------------------------------------------------------------------
// Isolierter Workspace – niemals innerhalb der Zentrale oder des
// Health-Repositories. Kein .git, keine .env-Dateien, keine Symlink-Flucht,
// Größen- und Dateianzahlgrenzen.
// ---------------------------------------------------------------------------

function computeWorkspaceId({ runId, executionPackageId, fingerprint, attemptId }) {
  const raw = `${runId}:${executionPackageId}:${fingerprint}:${attemptId}`;
  return `ws-${sha256Hex(raw).slice(0, 24)}`;
}

function assertWorkspaceOutsideRepositories(workspaceDir, forbiddenRoots) {
  const resolvedWorkspace = path.resolve(workspaceDir);
  forbiddenRoots.forEach((root) => {
    if (!root) return;
    let resolvedRoot;
    try {
      resolvedRoot = fs.realpathSync(root);
    } catch (_error) {
      resolvedRoot = path.resolve(root);
    }
    if (resolvedWorkspace === resolvedRoot || resolvedWorkspace.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error("Isolierter Workspace darf niemals innerhalb eines Repositories liegen.");
    }
  });
}

function listSourceFilesForCopy(sourceRoot) {
  const results = [];
  const stack = [""];
  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = path.join(sourceRoot, relDir);
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      if (EXCLUDED_COPY_NAMES.has(entry.name)) continue;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const absPath = path.join(sourceRoot, relPath);
      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync(absPath);
        } catch (_error) {
          throw new Error(`Isolierter Workspace: Symlink konnte nicht aufgelöst werden (${relPath}).`);
        }
        const resolvedSourceRoot = fs.realpathSync(sourceRoot);
        if (real !== resolvedSourceRoot && !real.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
          throw new Error(`Isolierter Workspace: Symlink-Flucht außerhalb des Projekts abgewiesen (${relPath}).`);
        }
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(relPath);
        continue;
      }
      if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }
  return results;
}

function materializeIsolatedWorkspace({
  sourceRoot,
  workspaceDir,
  forbiddenRoots,
  maxFiles,
  maxFileBytes,
  maxTotalBytes,
  allowedFilesOnly = null,
}) {
  assertWorkspaceOutsideRepositories(workspaceDir, forbiddenRoots);
  const fileLimit = Number.isFinite(maxFiles) ? maxFiles : MAX_WORKSPACE_FILES;
  const fileByteLimit = Number.isFinite(maxFileBytes) ? maxFileBytes : MAX_WORKSPACE_FILE_BYTES;
  const totalByteLimit = Number.isFinite(maxTotalBytes) ? maxTotalBytes : MAX_WORKSPACE_TOTAL_BYTES;
  // Wenn eine Allowlist übergeben wird, materialisieren wir ausschließlich diese
  // Dateien. Das hält Health-Repos mit tausenden Dateien beherrschbar und
  // entspricht dem Phase-C-Prinzip „nur erlaubte Dateien dürfen als Ergebnis gelten“.
  const files = Array.isArray(allowedFilesOnly) && allowedFilesOnly.length > 0
    ? allowedFilesOnly.map((entry) => String(entry || "").trim()).filter(Boolean)
    : listSourceFilesForCopy(sourceRoot);
  if (files.length > fileLimit) {
    throw new Error(`Isolierter Workspace: Dateianzahlgrenze überschritten (${files.length} > ${fileLimit}).`);
  }
  ensureDirSecure(workspaceDir);
  let totalBytes = 0;
  const baselineHashes = {};
  files.forEach((relPath) => {
    if (relPath.includes("\0") || path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) {
      throw new Error(`Isolierter Workspace: unsicherer Allowlist-Pfad abgewiesen (${relPath}).`);
    }
    const srcAbs = path.join(sourceRoot, relPath);
    if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isFile()) {
      throw new Error(`Isolierter Workspace: Allowlist-Datei fehlt in der Quelle (${relPath}).`);
    }
    let realSrc;
    try {
      realSrc = fs.realpathSync(srcAbs);
    } catch (_error) {
      throw new Error(`Isolierter Workspace: Allowlist-Datei konnte nicht aufgelöst werden (${relPath}).`);
    }
    const resolvedSourceRoot = fs.realpathSync(sourceRoot);
    if (realSrc !== resolvedSourceRoot && !realSrc.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
      throw new Error(`Isolierter Workspace: Allowlist-Pfad außerhalb der Quelle abgewiesen (${relPath}).`);
    }
    const stat = fs.statSync(realSrc);
    if (stat.size > fileByteLimit) {
      throw new Error(`Isolierter Workspace: Datei überschreitet Größengrenze (${relPath}).`);
    }
    totalBytes += stat.size;
    if (totalBytes > totalByteLimit) {
      throw new Error("Isolierter Workspace: Gesamtgrößengrenze überschritten.");
    }
    const destAbs = path.join(workspaceDir, relPath);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true, mode: 0o700 });
    const buffer = fs.readFileSync(realSrc);
    fs.writeFileSync(destAbs, buffer, { mode: 0o600 });
    baselineHashes[relPath] = sha256Hex(buffer);
  });
  return { fileCount: files.length, totalBytes, baselineHashes };
}

function cleanupWorkspace(workspaceDir) {
  if (!workspaceDir) return;
  try {
    fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 2 });
  } catch (_error) {
    /* best effort cleanup */
  }
}

function diffWorkspaceAgainstBaseline(workspaceDir, baselineHashes) {
  const currentFiles = listSourceFilesForCopy(workspaceDir);
  const changed = [];
  currentFiles.forEach((relPath) => {
    const absPath = path.join(workspaceDir, relPath);
    const buffer = fs.readFileSync(absPath);
    const hash = sha256Hex(buffer);
    if (!baselineHashes[relPath] || baselineHashes[relPath] !== hash) {
      changed.push(relPath);
    }
  });
  Object.keys(baselineHashes).forEach((relPath) => {
    if (!currentFiles.includes(relPath)) {
      changed.push(relPath); // gelöschte Datei gilt ebenfalls als Änderung
    }
  });
  return [...new Set(changed)];
}

// V7.0 Phase D – unabhängig gemessener Diff. "Vorher" wird direkt aus dem
// echten Quellrepository gelesen (nicht aus einer vom Executor gespeicherten
// Kopie), "nachher" aus dem isolierten Workspace. Damit ist der Diff für
// JEDEN Executor identisch verifiziert – Codex' eigener Text/Diff-Anspruch
// wird hierfür nie herangezogen (Auftrag G: "Ein Codex-Text ist keine Evidenz").
function buildVerifiedDiffEntries(sourceRepoPath, workspaceDir, changedFiles) {
  return (changedFiles || []).map((relPath) => {
    let beforeBuffer = null;
    let afterBuffer = null;
    try {
      beforeBuffer = fs.readFileSync(path.join(sourceRepoPath, relPath));
    } catch (_error) {
      beforeBuffer = null;
    }
    try {
      afterBuffer = fs.readFileSync(path.join(workspaceDir, relPath));
    } catch (_error) {
      afterBuffer = null;
    }
    const beforeLines = beforeBuffer ? beforeBuffer.toString("utf8").split(/\r?\n/) : [];
    const afterLines = afterBuffer ? afterBuffer.toString("utf8").split(/\r?\n/) : [];
    return {
      path: relPath,
      existedBefore: Boolean(beforeBuffer),
      existedAfter: Boolean(afterBuffer),
      beforeHash: beforeBuffer ? sha256Hex(beforeBuffer) : null,
      afterHash: afterBuffer ? sha256Hex(afterBuffer) : null,
      beforeBytes: beforeBuffer ? beforeBuffer.length : 0,
      afterBytes: afterBuffer ? afterBuffer.length : 0,
      linesAdded: Math.max(0, afterLines.length - beforeLines.length),
      linesRemoved: Math.max(0, beforeLines.length - afterLines.length),
    };
  });
}

// ---------------------------------------------------------------------------
// Tokens – RAM-only, kurzlebig, einmalig, an Aktion + IDs + Fingerprint
// gebunden. Niemals in localStorage, Backup oder URL.
// ---------------------------------------------------------------------------

function mintToken(binding, options = {}) {
  const token = crypto.randomBytes(24).toString("hex");
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : TOKEN_TTL_MS;
  TOKENS.set(token, {
    ...binding,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    consumed: false,
  });
  return token;
}

function consumeToken(token, expectedBinding) {
  if (typeof token !== "string" || !token) {
    return { ok: false, reason: "TOKEN_MISSING" };
  }
  const record = TOKENS.get(token);
  if (!record) {
    return { ok: false, reason: "TOKEN_UNKNOWN" };
  }
  if (record.consumed) {
    TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_ALREADY_USED" };
  }
  if (Date.now() > record.expiresAt) {
    TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_EXPIRED" };
  }
  // executorId/targetRepositoryIdentity/baselineFingerprint sind additive,
  // ausschließlich für Codex-Token gesetzte Zusatzbindungen (Phase D). Für
  // Mock-Token bleiben sie unbenutzt (undefined auf beiden Seiten), sodass
  // sich das bisherige Verhalten nicht ändert.
  const fields = [
    "action",
    "runId",
    "executionPackageId",
    "fingerprint",
    "attemptId",
    "executorId",
    "targetRepositoryIdentity",
    "baselineFingerprint",
  ];
  for (const field of fields) {
    if (expectedBinding[field] !== undefined && record[field] !== expectedBinding[field]) {
      return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
    }
  }
  record.consumed = true;
  TOKENS.delete(token);
  return { ok: true };
}

function clearAllTokensForTests() {
  TOKENS.clear();
}

// Token-Aktionsnamen bleiben für Mock exakt wie in Phase C ("start"/"cancel"),
// damit sich am bestehenden, bereits getesteten Verhalten nichts ändert.
// Codex erhält eigene, in Auftrag F verlangte Aktionsnamen mit zusätzlicher
// Bindung an executorId/Zielrepository/Baseline-Fingerprint.
function tokenActionFor(kind, executorId) {
  if (executorId === "codex") {
    if (kind === "start") return "START_CODEX_EXECUTION";
    if (kind === "cancel") return "CANCEL_CODEX_EXECUTION";
  }
  return kind;
}

// ---------------------------------------------------------------------------
// State machine guards
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS = Object.freeze({
  PREPARED: ["APPROVED", "CANCELLED"],
  APPROVED: ["QUEUED", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"],
});

function assertTransitionAllowed(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Ungültiger Statusübergang: ${fromStatus} -> ${toStatus}.`);
  }
}

function isTerminalStatus(status) {
  return TERMINAL_ATTEMPT_STATUSES.includes(status);
}

function evaluateAllowlist(changedFiles, allowedFiles, forbiddenPaths) {
  const allowedSet = new Set(allowedFiles || []);
  const forbiddenList = forbiddenPaths || [];
  const blockers = [];
  (changedFiles || []).forEach((relPath) => {
    if (forbiddenList.some((entry) => relPath === entry || relPath.startsWith(`${entry}/`))) {
      blockers.push(`Verbotener Pfad verändert: ${relPath}`);
    }
    if (!allowedSet.has(relPath)) {
      blockers.push(`Datei außerhalb der Allowlist verändert: ${relPath}`);
    }
  });
  return blockers;
}

function describeAttemptForRecovery(attempt) {
  if (!attempt) return { recovery: false };
  const inFlight = attempt.status === "RUNNING" || attempt.status === "QUEUED";
  if (!inFlight) return { recovery: false };
  const runtimeEntry = RUNTIME.get(attempt.attemptId);
  if (runtimeEntry) return { recovery: false };
  return {
    recovery: true,
    reason: "Attempt war beim letzten Neustart noch aktiv und ist als verwaister/abgestürzter Versuch erkannt.",
    recommendedAction: "Attempt als Recovery-Fall abschließen; Reload startet ihn nicht automatisch neu.",
  };
}

// ---------------------------------------------------------------------------
// Attempt-Lebenszyklus
// ---------------------------------------------------------------------------

function requireSupportedProject(projectId, options) {
  const context = resolveProjectContext(projectId, options);
  if (!context) {
    throw new Error("Execution Bridge unterstützt in Phase C ausschließlich Health (read-only Baseline) und das Fixture-Projekt.");
  }
  return context;
}

function normalizeRelativePathList(values, fieldName) {
  return healthHybridWorkModule.normalizeUniqueRelativePaths(values, fieldName);
}

async function prepareExecutionAttempt(input = {}, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  ensureBridgeDirs(paths);

  const runId = healthHybridWorkModule.normalizeRelativeRepoPath
    ? String(input.runId || "").trim()
    : String(input.runId || "").trim();
  if (!runId) throw new Error("runId ist erforderlich.");

  const pkg = input.executionPackage || {};
  const executionPackageId = String(pkg.executionPackageId || "").trim();
  const executionPackageFingerprint = String(pkg.executionPackageFingerprint || "").trim();
  const projectId = String(pkg.projectId || "").trim();
  if (!executionPackageId || !executionPackageFingerprint || !projectId) {
    throw new Error("executionPackageId, executionPackageFingerprint und projectId sind erforderlich.");
  }

  let allowedFiles = normalizeRelativePathList(pkg.allowedFiles, "allowedFiles");
  let forbiddenPaths = normalizeRelativePathList(pkg.forbiddenPaths || [], "forbiddenPaths");
  if (allowedFiles.length === 0) {
    throw new Error("allowedFiles darf nicht leer sein.");
  }

  const context = requireSupportedProject(projectId, options);

  // V7.0 Phase D – Executor-Auswahl. Fehlender/unbekannter Wert bedeutet Mock
  // (Rückwärtskompatibilität zu Phase C). Health ist für Codex in Phase D
  // hart blockiert – kein Token wird ausgestellt, bevor überhaupt etwas
  // anderes geprüft wird.
  const executorId = String(pkg.executorId || "mock").trim() || "mock";
  if (!executorRegistry.hasExecutor(executorId)) {
    throw new Error("Unbekannter Executor.");
  }
  if (context.isHealth && !executorRegistry.isHealthAllowedForExecutor(executorId)) {
    throw new Error(
      "Codex-Ausführung ist für Health in Phase D hart blockiert. Nur read-only Baseline und Paketvorbereitung sind erlaubt.",
    );
  }

  let codexTaskPresetId = null;
  let workspaceMaterializeFiles = null;
  if (executorId === "codex") {
    const availability = codexAdapter.detectCodexAvailability(options);
    if (!availability.available) {
      throw new Error("Codex ist lokal nicht verfügbar. Kein Start-Token wird ausgestellt.");
    }
    if (!availability.authenticated) {
      throw new Error("Codex ist nicht authentifiziert. Kein Start-Token wird ausgestellt.");
    }
    codexTaskPresetId = String(pkg.codexTaskPresetId || "").trim();
    const preset = codexAdapter.CODEX_TASK_PRESETS[codexTaskPresetId];
    if (!preset) {
      throw new Error("Unbekannte oder fehlende Codex-Preset-ID.");
    }
    if (preset.projectId !== projectId) {
      throw new Error("Codex-Preset passt nicht zum gewählten Zielprojekt.");
    }
    // Serverautoritativ: Allowlist/Forbidden-Paths kommen ausschließlich aus
    // dem geprüften Preset, nie aus einer freien Browser-Eingabe (Auftrag D/E).
    allowedFiles = preset.allowedFiles.slice();
    forbiddenPaths = preset.forbiddenPaths.slice();
    // Zusätzlich zur Schreib-/Diff-Allowlist (allowedFiles) müssen die für das
    // erlaubte Testkommando benötigten, read-only mitgelieferten Dateien im
    // Workspace vorhanden sein. Sie zählen NICHT als von Codex veränderbar.
    workspaceMaterializeFiles = [...new Set([...allowedFiles, ...(preset.testSupportFiles || [])])];
  }

  if (context.isFixture) {
    const disallowed = allowedFiles.filter((entry) => !FIXTURE_ALLOWED_FILES.includes(entry));
    if (disallowed.length > 0) {
      throw new Error(`Fixture-Projekt erlaubt ausschließlich: ${FIXTURE_ALLOWED_FILES.join(", ")}.`);
    }
  }

  const baseline = await readProjectBaseline(context, options);
  if (!baseline.available) {
    throw new Error("Baseline des Zielprojekts ist derzeit nicht verfügbar.");
  }

  const declaredBranch = String(pkg.allowedBranch || "").trim();
  const declaredCommit = String(pkg.baseCommit || "").trim();
  if (declaredBranch && baseline.branch !== declaredBranch) {
    throw new Error("Branch weicht vom Live-Stand ab. Paket ist STALE.");
  }
  if (declaredCommit && baseline.head !== declaredCommit) {
    throw new Error("HEAD weicht vom Live-Stand ab. Paket ist STALE.");
  }

  if (baseline.workingTreeClean !== true) {
    const knownBaseline = input.knownWorkingTreeBaseline || null;
    if (context.isHealth) {
      const validatedBaseline = validateKnownWorkingTreeBaseline(knownBaseline, baseline, {
        requireConfirmation: true,
      });
      // Wiederverwendung der bestehenden, geprüften Known-dirty-Bestätigungslogik.
      healthHybridWorkModule.assertLiveBaselineReady(
        { ok: baseline.ok, available: baseline.available, branch: baseline.branch, head: baseline.head, workingTreeClean: baseline.workingTreeClean, workingTreeDetail: baseline.workingTreeDetail },
        { allowedBranch: declaredBranch || baseline.branch, baseCommit: declaredCommit || baseline.head },
        { knownWorkingTreeBaseline: validatedBaseline },
      );
    } else {
      throw new Error("Fixture-Projekt erfordert eine saubere Baseline (kein known-dirty-Pfad im Testfixture).");
    }
  } else if (input.knownWorkingTreeBaseline) {
    // Auch eine übergebene Clean-Baseline muss kanonisch gültig sein.
    validateKnownWorkingTreeBaseline(input.knownWorkingTreeBaseline, baseline, {
      requireConfirmation: false,
    });
  }

  const activeLock = readLock(paths, projectId);
  if (activeLock.exists && activeLock.record && !isLockStale(activeLock.record)) {
    throw new Error("Für dieses Projekt läuft bereits ein aktiver Ausführungsversuch (genau ein aktiver Attempt pro Repository).");
  }

  const attemptId = randomId("att");
  const attempt = {
    schemaVersion: 1,
    attemptId,
    runId,
    executionPackageId,
    executionPackageFingerprint,
    projectId,
    allowedFiles,
    forbiddenPaths,
    status: "PREPARED",
    applyStatus: "NOT_REQUESTED",
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    workspaceId: null,
    baseline: {
      branch: baseline.branch,
      head: baseline.head,
      workingTreeClean: baseline.workingTreeClean,
      baselineFingerprint: baseline.workingTreeDetail?.baselineFingerprint || null,
      capturedAt: baseline.readAt || nowIso(),
    },
    scenario: null,
    changedFiles: [],
    diff: [],
    testStatus: null,
    testExitCode: null,
    testSummary: null,
    errors: [],
    blockers: [],
    cancelRequestedAt: null,
    appliedAt: null,
    appliedFiles: [],
    mockExecutorLabel: mockAdapter.MOCK_EXECUTOR_LABEL,
    executorId,
    executorLabel: executorRegistry.getExecutorDescriptor(executorId)?.displayName || null,
    codexTaskPresetId,
    workspaceMaterializeFiles,
    codexRawOutput: null,
  };

  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId, action: "PREPARE", status: "PREPARED" });

  const startAction = tokenActionFor("start", executorId);
  const startToken = mintToken({
    action: startAction,
    runId,
    executionPackageId,
    fingerprint: executionPackageFingerprint,
    attemptId,
    ...(executorId === "codex"
      ? {
          executorId,
          targetRepositoryIdentity: projectId,
          baselineFingerprint: attempt.baseline.baselineFingerprint,
        }
      : {}),
  });

  return {
    ok: true,
    attemptId,
    status: attempt.status,
    startToken,
    expiresInMs: TOKEN_TTL_MS,
    baseline: attempt.baseline,
    executorId,
    executorLabel: attempt.executorLabel,
  };
}

function assertSafeAttemptRequest(body) {
  const runId = String(body.runId || "").trim();
  const executionPackageId = String(body.executionPackageId || "").trim();
  const executionPackageFingerprint = String(body.executionPackageFingerprint || "").trim();
  const attemptId = String(body.attemptId || "").trim();
  if (!runId || !executionPackageId || !executionPackageFingerprint || !attemptId) {
    throw new Error("runId, executionPackageId, executionPackageFingerprint und attemptId sind erforderlich.");
  }
  return { runId, executionPackageId, executionPackageFingerprint, attemptId };
}

async function startExecutionAttempt(body = {}, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const { runId, executionPackageId, executionPackageFingerprint, attemptId } = assertSafeAttemptRequest(body);
  if (body.approved !== true) {
    throw new Error("Start erfordert Jamals ausdrückliche Freigabe (approved: true).");
  }

  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) throw new Error("Attempt nicht gefunden.");
  const attempt = loaded.record;
  if (attempt.runId !== runId || attempt.executionPackageId !== executionPackageId || attempt.executionPackageFingerprint !== executionPackageFingerprint) {
    throw new Error("Attempt-Bindung stimmt nicht überein.");
  }
  if (attempt.status !== "PREPARED") {
    throw new Error(`Attempt kann aus Status ${attempt.status} nicht gestartet werden.`);
  }

  const executorId = attempt.executorId || "mock";
  const adapter = executorRegistry.resolveExecutorAdapter(executorId);
  const scenario = String(body.scenario || "").trim();
  if (!adapter.SUPPORTED_SCENARIOS.includes(scenario)) {
    throw new Error("Unbekanntes oder fehlendes Szenario.");
  }
  // Health-Hardblock erneut prüfen – unabhängig vom Zeitpunkt der Vorbereitung.
  if (attempt.projectId === HEALTH_PROJECT_ID && !executorRegistry.isHealthAllowedForExecutor(executorId)) {
    throw new Error("Codex-Ausführung ist für Health in Phase D hart blockiert.");
  }

  const startAction = tokenActionFor("start", executorId);
  const tokenResult = consumeToken(body.token, {
    action: startAction,
    runId,
    executionPackageId,
    fingerprint: executionPackageFingerprint,
    attemptId,
    ...(executorId === "codex"
      ? {
          executorId,
          targetRepositoryIdentity: attempt.projectId,
          baselineFingerprint: attempt.baseline?.baselineFingerprint || null,
        }
      : {}),
  });
  if (!tokenResult.ok) {
    throw new Error("Start-Token ist ungültig, abgelaufen oder bereits verwendet.");
  }

  const lockResult = acquireProjectLock(paths, attempt.projectId, attemptId);
  if (!lockResult.ok) {
    throw new Error(lockResult.message || "Projekt-Lock konnte nicht erworben werden.");
  }

  assertTransitionAllowed(attempt.status, "APPROVED");
  attempt.status = "APPROVED";
  attempt.scenario = scenario;
  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPROVED", status: "APPROVED" });

  assertTransitionAllowed("APPROVED", "QUEUED");
  attempt.status = "QUEUED";
  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "QUEUED", status: "QUEUED" });

  assertTransitionAllowed("QUEUED", "RUNNING");
  attempt.status = "RUNNING";
  attempt.startedAt = nowIso();
  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "START", status: "RUNNING" });

  const cancelAction = tokenActionFor("cancel", executorId);
  const cancelToken = mintToken({
    action: cancelAction,
    runId,
    executionPackageId,
    fingerprint: executionPackageFingerprint,
    attemptId,
    ...(executorId === "codex"
      ? {
          executorId,
          targetRepositoryIdentity: attempt.projectId,
          baselineFingerprint: attempt.baseline?.baselineFingerprint || null,
        }
      : {}),
  });

  RUNTIME.set(attemptId, { cancelRequested: false });

  // Hintergrundlauf – bewusst nicht awaited, damit der HTTP-Aufruf sofort mit
  // RUNNING antwortet und ein paralleler Cancel-Aufruf möglich ist.
  runAttemptWorkflowInBackground(attempt, paths, options).catch(() => {
    /* Fehler werden bereits innerhalb des Workflows terminal erfasst. */
  });

  return { ok: true, status: "RUNNING", cancelToken, expiresInMs: TOKEN_TTL_MS };
}

async function runAttemptWorkflowInBackground(attemptSnapshot, paths, options) {
  const attemptId = attemptSnapshot.attemptId;
  const context = requireSupportedProject(attemptSnapshot.projectId, options);
  const executorId = attemptSnapshot.executorId || "mock";
  const adapter = executorRegistry.resolveExecutorAdapter(executorId);
  const workspaceId = computeWorkspaceId({
    runId: attemptSnapshot.runId,
    executionPackageId: attemptSnapshot.executionPackageId,
    fingerprint: attemptSnapshot.executionPackageFingerprint,
    attemptId,
  });
  const workspaceDir = path.join(paths.workspacesDir, workspaceId);
  const forbiddenRoots = [path.resolve(__dirname)];
  try {
    forbiddenRoots.push(fs.realpathSync(healthRepoStatusModule.resolveCanonicalHealthPath().resolvedPath || ""));
  } catch (_error) {
    /* Health-Pfad evtl. nicht verfügbar; Ausschluss bleibt best-effort. */
  }

  const sourceRootForDiff = context.isHealth
    ? healthRepoStatusModule.resolveCanonicalHealthPath().resolvedPath
    : context.repoPath;

  const defaultTimeoutForExecutor = executorId === "codex" ? DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS : DEFAULT_ATTEMPT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(options.attemptTimeoutMs) ? options.attemptTimeoutMs : defaultTimeoutForExecutor;
  const startedAtMs = Date.now();

  function runtimeState() {
    return RUNTIME.get(attemptId) || { cancelRequested: false };
  }

  // Beendet – falls es sich um einen realen Executor-Prozess handelt (Codex)
  // – ausschließlich den eigenen, attemptgebundenen Kindprozess, bevor der
  // Workspace aufgeräumt wird. Für Mock ist cancelRun nicht vorhanden (No-Op).
  async function abortExecutorProcessIfAny() {
    if (typeof adapter.cancelRun === "function") {
      try {
        await adapter.cancelRun(attemptId);
      } catch (_error) {
        /* best effort – Terminalstatus wird trotzdem gesetzt */
      }
    }
  }

  function persistAndAudit(patch, action) {
    const loaded = loadAttempt(paths, attemptId);
    const record = loaded.ok ? loaded.record : attemptSnapshot;
    // Terminaler Cancel/Timeout/Fehler darf nicht nachträglich durch
    // SUCCEEDED/FAILED/BLOCKED überschrieben werden (Race mit Cancel-Signal).
    if (isTerminalStatus(record.status) && patch.status && patch.status !== record.status) {
      return record;
    }
    if (runtimeState().cancelRequested && patch.status && patch.status !== "CANCELLED") {
      const cancelled = {
        ...record,
        status: "CANCELLED",
        finishedAt: nowIso(),
        cancelRequestedAt: record.cancelRequestedAt || nowIso(),
        changedFiles: [],
        diff: [],
        testStatus: null,
        testExitCode: null,
        testSummary: null,
        blockers: [],
        errors: [],
      };
      saveAttempt(paths, cancelled);
      appendAuditEntry(paths, {
        attemptId,
        runId: cancelled.runId,
        projectId: cancelled.projectId,
        action: "CANCELLED",
        status: "CANCELLED",
      });
      return cancelled;
    }
    const next = { ...record, ...patch };
    if (next.status === "CANCELLED") {
      next.changedFiles = [];
      next.diff = [];
      next.testStatus = null;
      next.testExitCode = null;
      next.testSummary = null;
      next.blockers = [];
    }
    saveAttempt(paths, next);
    appendAuditEntry(paths, {
      attemptId,
      runId: next.runId,
      projectId: next.projectId,
      action: action || patch.status,
      status: next.status,
    });
    return next;
  }

  try {
    let baselineHashes = {};
    try {
      const materialized = materializeIsolatedWorkspace({
        sourceRoot: context.isHealth
          ? healthRepoStatusModule.resolveCanonicalHealthPath().resolvedPath
          : context.repoPath,
        workspaceDir,
        forbiddenRoots,
        // Codex erhält zusätzlich die read-only Testunterstützungsdateien des
        // Presets (z.B. den Fixture-Test selbst); die Schreib-/Diff-Allowlist
        // (attemptSnapshot.allowedFiles) bleibt davon unabhängig und wird erst
        // nach dem Lauf für die Auswertung verwendet (evaluateAllowlist).
        allowedFilesOnly: attemptSnapshot.workspaceMaterializeFiles || attemptSnapshot.allowedFiles,
      });
      baselineHashes = materialized.baselineHashes;
    } catch (workspaceError) {
      persistAndAudit(
        {
          status: "FAILED",
          finishedAt: nowIso(),
          errors: [workspaceError.message],
        },
        "WORKSPACE_ERROR",
      );
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }
    persistAndAudit({ workspaceId }, "WORKSPACE_READY");

    if (Number.isFinite(options.testDelayMs) && options.testDelayMs > 0) {
      const sliceMs = 25;
      let waited = 0;
      while (waited < options.testDelayMs) {
        if (runtimeState().cancelRequested) {
          // eslint-disable-next-line no-await-in-loop
          await abortExecutorProcessIfAny();
          persistAndAudit(
            { status: "CANCELLED", finishedAt: nowIso(), cancelRequestedAt: nowIso() },
            "CANCELLED",
          );
          releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
          RUNTIME.delete(attemptId);
          cleanupWorkspace(workspaceDir);
          return;
        }
        if (Date.now() - startedAtMs > timeoutMs) {
          // eslint-disable-next-line no-await-in-loop
          await abortExecutorProcessIfAny();
          persistAndAudit({ status: "TIMED_OUT", finishedAt: nowIso() }, "TIMED_OUT");
          releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
          RUNTIME.delete(attemptId);
          cleanupWorkspace(workspaceDir);
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, Math.min(sliceMs, options.testDelayMs - waited)));
        waited += sliceMs;
      }
    }

    // Executor-Dispatch: die Bridge selbst kennt keine Codex-spezifische
    // Sonderlogik in der State-Machine. Sie unterscheidet ausschließlich,
    // welche der beiden Adapter-Funktionen (vom Registry aufgelöst) aufgerufen
    // wird; beide liefern dieselbe Ergebnisform zurück.
    const executionPromise =
      executorId === "codex"
        ? adapter.runCodexExecutionScenario({
            workspaceDir,
            allowedFiles: attemptSnapshot.allowedFiles,
            forbiddenPaths: attemptSnapshot.forbiddenPaths,
            scenario: attemptSnapshot.scenario,
            attemptId,
            codexTaskPresetId: attemptSnapshot.codexTaskPresetId,
            forbiddenRoots,
            attemptTimeoutMs: timeoutMs,
            shouldAbort: () => Boolean(runtimeState().cancelRequested),
            // Ausschließlich für Tests: erlaubt einen Fake-Kindprozess statt des
            // echten Codex-CLI-Aufrufs. In Produktion nie gesetzt.
            execFileImpl: options.codexExecFileImpl,
          })
        : adapter.runMockExecutionScenario({
            workspaceDir,
            allowedFiles: attemptSnapshot.allowedFiles,
            scenario: attemptSnapshot.scenario,
            attemptId,
            timeoutDelayMs: attemptSnapshot.scenario === "TIMEOUT" ? timeoutMs + 5000 : undefined,
            shouldAbort: () => Boolean(runtimeState().cancelRequested),
          });

    // Cancel und Timeout werden parallel zur Ausführung aktiv gepollt. Ohne
    // diesen Poll würde ein Cancel während eines langen TIMEOUT-Szenarios erst
    // nach dem Race-Ende wirken und den Attempt fälschlich als RUNNING oder
    // TIMED_OUT belassen. `workflowSettled` stoppt den Poll spätestens einen
    // Tick nach Entscheidung des Race – sonst würde diese Schleife bei einem
    // gewonnenen executionPromise (Normalfall) bis zum vollen, bei Codex
    // deutlich längeren timeoutMs weiterlaufen und u. a. Testprozesse ohne
    // expliziten process.exit unnötig lange am Beenden hindern.
    let workflowSettled = false;
    const controlPromise = (async () => {
      const sliceMs = 25;
      while (!workflowSettled) {
        if (runtimeState().cancelRequested) {
          return { cancelled: true };
        }
        if (Date.now() - startedAtMs > timeoutMs) {
          return { timedOut: true };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, sliceMs));
      }
      return { settledElsewhere: true };
    })();

    const raceResult = await Promise.race([
      executionPromise.then((result) => ({ result })),
      controlPromise,
    ]);
    workflowSettled = true;

    if (raceResult.cancelled || runtimeState().cancelRequested) {
      await abortExecutorProcessIfAny();
      persistAndAudit({ status: "CANCELLED", finishedAt: nowIso(), cancelRequestedAt: nowIso() }, "CANCELLED");
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }

    if (raceResult.timedOut) {
      await abortExecutorProcessIfAny();
      persistAndAudit({ status: "TIMED_OUT", finishedAt: nowIso() }, "TIMED_OUT");
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }

    const execResult = raceResult.result;

    if (execResult.cancelled || runtimeState().cancelRequested) {
      await abortExecutorProcessIfAny();
      persistAndAudit({ status: "CANCELLED", finishedAt: nowIso(), cancelRequestedAt: nowIso() }, "CANCELLED");
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }

    if (execResult.failed) {
      persistAndAudit(
        {
          status: "FAILED",
          finishedAt: nowIso(),
          testStatus: execResult.testStatus,
          testExitCode: execResult.testExitCode,
          testSummary: execResult.testSummary,
          errors: execResult.errors,
          codexRawOutput: execResult.codexRawOutput || null,
        },
        "FAILED",
      );
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }

    // Unabhängig gemessen – niemals aus execResult.changedFiles/diff
    // übernommen. Gilt identisch für Mock und Codex (Auftrag G).
    const changedInWorkspace = diffWorkspaceAgainstBaseline(workspaceDir, baselineHashes);
    const blockers = evaluateAllowlist(changedInWorkspace, attemptSnapshot.allowedFiles, attemptSnapshot.forbiddenPaths);
    const verifiedDiff = buildVerifiedDiffEntries(sourceRootForDiff, workspaceDir, changedInWorkspace);

    if (blockers.length > 0) {
      persistAndAudit(
        {
          status: "BLOCKED",
          finishedAt: nowIso(),
          changedFiles: changedInWorkspace,
          diff: verifiedDiff,
          testStatus: execResult.testStatus,
          testExitCode: execResult.testExitCode,
          testSummary: execResult.testSummary,
          blockers,
          codexRawOutput: execResult.codexRawOutput || null,
        },
        "BLOCKED",
      );
      releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
      RUNTIME.delete(attemptId);
      cleanupWorkspace(workspaceDir);
      return;
    }

    persistAndAudit(
      {
        status: "SUCCEEDED",
        finishedAt: nowIso(),
        changedFiles: changedInWorkspace,
        diff: verifiedDiff,
        testStatus: execResult.testStatus,
        testExitCode: execResult.testExitCode,
        testSummary: execResult.testSummary,
        blockers: [],
        codexRawOutput: execResult.codexRawOutput || null,
      },
      "SUCCEEDED",
    );
    releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
    RUNTIME.delete(attemptId);
    // Workspace bleibt erhalten (nur bei SUCCEEDED), damit Apply die validierten
    // Dateien lesen kann. Wird nach Apply oder bei Ablauf aufgeräumt.
  } catch (error) {
    persistAndAudit({ status: "FAILED", finishedAt: nowIso(), errors: [String(error.message || error)] }, "FAILED");
    releaseProjectLock(paths, attemptSnapshot.projectId, attemptId);
    RUNTIME.delete(attemptId);
    cleanupWorkspace(workspaceDir);
  }
}

async function cancelExecutionAttempt(body = {}, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const { runId, executionPackageId, executionPackageFingerprint, attemptId } = assertSafeAttemptRequest(body);

  // Status prüfen BEVOR der One-Time-Token verbraucht wird – sonst würde ein
  // wiederholtes/terminales Cancel den Token sinnlos verbrennen.
  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) throw new Error("Attempt nicht gefunden.");
  const attempt = loaded.record;
  if (
    attempt.runId !== runId ||
    attempt.executionPackageId !== executionPackageId ||
    attempt.executionPackageFingerprint !== executionPackageFingerprint
  ) {
    throw new Error("Attempt-Bindung stimmt nicht überein.");
  }
  if (isTerminalStatus(attempt.status)) {
    throw new Error(`Attempt ist bereits abgeschlossen (${attempt.status}). Cancel nicht möglich.`);
  }
  if (!["APPROVED", "QUEUED", "RUNNING"].includes(attempt.status)) {
    throw new Error(`Cancel ist nur bei aktivem Attempt zulässig (aktuell: ${attempt.status}).`);
  }

  const cancelExecutorId = attempt.executorId || "mock";
  const cancelAction = tokenActionFor("cancel", cancelExecutorId);
  const tokenResult = consumeToken(body.token, {
    action: cancelAction,
    runId,
    executionPackageId,
    fingerprint: executionPackageFingerprint,
    attemptId,
    ...(cancelExecutorId === "codex"
      ? {
          executorId: cancelExecutorId,
          targetRepositoryIdentity: attempt.projectId,
          baselineFingerprint: attempt.baseline?.baselineFingerprint || null,
        }
      : {}),
  });
  if (!tokenResult.ok) {
    throw new Error("Cancel-Token ist ungültig, abgelaufen oder bereits verwendet.");
  }

  const runtimeEntry = RUNTIME.get(attemptId);
  if (!runtimeEntry) {
    // Orphaned/ohne aktiven Background-Lauf: Attempt terminal als CANCELLED setzen.
    attempt.status = "CANCELLED";
    attempt.finishedAt = nowIso();
    attempt.cancelRequestedAt = nowIso();
    attempt.changedFiles = [];
    attempt.diff = [];
    attempt.testStatus = null;
    attempt.testExitCode = null;
    attempt.testSummary = null;
    attempt.blockers = [];
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, {
      attemptId,
      runId,
      projectId: attempt.projectId,
      action: "CANCELLED",
      status: "CANCELLED",
    });
    releaseProjectLock(paths, attempt.projectId, attemptId);
    return { ok: true, status: "CANCELLED" };
  }

  runtimeEntry.cancelRequested = true;
  return { ok: true, status: "CANCEL_REQUESTED" };
}

function readOnlyAttemptStatus(attemptId, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const attempt = loaded.record;
  const recovery = describeAttemptForRecovery(attempt);
  return {
    ok: true,
    attemptId: attempt.attemptId,
    runId: attempt.runId,
    projectId: attempt.projectId,
    status: attempt.status,
    applyStatus: attempt.applyStatus,
    scenario: attempt.scenario,
    createdAt: attempt.createdAt,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    mockExecutorLabel: attempt.mockExecutorLabel,
    executorId: attempt.executorId || "mock",
    executorLabel: attempt.executorLabel || attempt.mockExecutorLabel || null,
    recovery,
  };
}

function readOnlyAttemptResult(attemptId, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const attempt = loaded.record;
  if (!isTerminalStatus(attempt.status)) {
    return { ok: false, reason: "NOT_TERMINAL", status: attempt.status };
  }
  return {
    ok: true,
    attemptId: attempt.attemptId,
    runId: attempt.runId,
    executionPackageId: attempt.executionPackageId,
    executionPackageFingerprint: attempt.executionPackageFingerprint,
    projectId: attempt.projectId,
    status: attempt.status,
    applyStatus: attempt.applyStatus,
    changedFiles: attempt.changedFiles,
    diff: attempt.diff,
    testStatus: attempt.testStatus,
    testExitCode: attempt.testExitCode,
    testSummary: attempt.testSummary,
    errors: attempt.errors,
    blockers: attempt.blockers,
    mockExecutorLabel: attempt.mockExecutorLabel,
    executorId: attempt.executorId || "mock",
    executorLabel: attempt.executorLabel || attempt.mockExecutorLabel || null,
    codexRawOutput: attempt.codexRawOutput || null,
    resultSource:
      attempt.executorId === "codex"
        ? "Isolierter Codex-Lauf · von der Zentrale selbst verifizierter Diff und Testlauf · noch kein bestätigter Fachbefund"
        : "Isolierter Mock-Executor-Lauf · noch kein bestätigter Fachbefund",
  };
}

// ---------------------------------------------------------------------------
// Apply-Gate
// ---------------------------------------------------------------------------

function healthApplyBlockedMessage() {
  return "Health-Apply erst nach Phase-C-Abnahme und späterer ausdrücklicher Pilotfreigabe.";
}

async function requestApplyPreview(body = {}, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const { runId, executionPackageId, executionPackageFingerprint, attemptId } = assertSafeAttemptRequest(body);
  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) throw new Error("Attempt nicht gefunden.");
  const attempt = loaded.record;
  if (attempt.runId !== runId || attempt.executionPackageId !== executionPackageId || attempt.executionPackageFingerprint !== executionPackageFingerprint) {
    throw new Error("Attempt-Bindung stimmt nicht überein.");
  }
  if (attempt.status !== "SUCCEEDED") {
    throw new Error("Apply-Review erfordert einen erfolgreichen isolierten Lauf (SUCCEEDED).");
  }

  const isHealth = attempt.projectId === HEALTH_PROJECT_ID;
  attempt.applyStatus = "APPLY_REVIEW";
  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_REVIEW", status: attempt.status });

  const preview = {
    executionPackageId: attempt.executionPackageId,
    executionPackageFingerprint: attempt.executionPackageFingerprint,
    baseline: attempt.baseline,
    attemptId: attempt.attemptId,
    executorId: attempt.executorId || "mock",
    executorLabel: attempt.executorLabel || attempt.mockExecutorLabel || null,
    changedFiles: attempt.changedFiles,
    diffSummary: attempt.diff.map((entry) => ({
      path: entry.path,
      linesAdded: entry.linesAdded,
      linesRemoved: entry.linesRemoved,
    })),
    testStatus: attempt.testStatus,
    testSummary: attempt.testSummary,
    risks: isHealth ? ["Zielprojekt ist Health Upgrade Kompass."] : [],
    blockers: attempt.blockers,
    applyBlocked: isHealth,
    applyBlockedReason: isHealth ? healthApplyBlockedMessage() : null,
    note: "Kein Commit. Kein Push. Kein Deployment.",
  };

  let applyToken = null;
  if (!isHealth) {
    applyToken = mintToken({
      action: "APPLY_VALIDATED_CHANGES",
      runId,
      executionPackageId,
      fingerprint: executionPackageFingerprint,
      attemptId,
    });
  }

  return { ok: true, preview, applyToken, expiresInMs: applyToken ? TOKEN_TTL_MS : null };
}

async function confirmApply(body = {}, options = {}) {
  const paths = options.paths || resolveBridgePaths(options);
  const { runId, executionPackageId, executionPackageFingerprint, attemptId } = assertSafeAttemptRequest(body);
  if (body.approved !== true) {
    throw new Error("Übernahme erfordert Jamals ausdrückliche Bestätigung (approved: true).");
  }
  const loaded = loadAttempt(paths, attemptId);
  if (!loaded.ok) throw new Error("Attempt nicht gefunden.");
  const attempt = loaded.record;

  if (attempt.projectId === HEALTH_PROJECT_ID) {
    attempt.applyStatus = "APPLY_DECLINED";
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_DECLINED", status: attempt.status });
    return { ok: false, applyStatus: "APPLY_DECLINED", message: healthApplyBlockedMessage() };
  }

  const tokenResult = consumeToken(body.token, {
    action: "APPLY_VALIDATED_CHANGES",
    runId,
    executionPackageId,
    fingerprint: executionPackageFingerprint,
    attemptId,
  });
  if (!tokenResult.ok) {
    throw new Error("Apply-Token ist ungültig, abgelaufen oder bereits verwendet.");
  }
  if (attempt.status !== "SUCCEEDED" || attempt.applyStatus !== "APPLY_REVIEW") {
    throw new Error("Apply erfordert einen erfolgreichen Lauf im Review-Status.");
  }

  attempt.applyStatus = "APPLY_APPROVED";
  saveAttempt(paths, attempt);

  const context = requireSupportedProject(attempt.projectId, options);
  const currentBaseline = await readProjectBaseline(context, options);
  const driftDetected =
    !currentBaseline.available ||
    currentBaseline.branch !== attempt.baseline.branch ||
    currentBaseline.head !== attempt.baseline.head ||
    (currentBaseline.workingTreeDetail?.baselineFingerprint || null) !== attempt.baseline.baselineFingerprint;

  if (driftDetected) {
    attempt.applyStatus = "STALE";
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_STALE", status: attempt.status });
    return { ok: false, applyStatus: "STALE", message: "Zielprojekt hat sich seit der Baseline verändert. Kein Schreiben. Neuer Entscheidungspunkt für Jamal." };
  }

  const workspaceId = computeWorkspaceId({
    runId: attempt.runId,
    executionPackageId: attempt.executionPackageId,
    fingerprint: attempt.executionPackageFingerprint,
    attemptId: attempt.attemptId,
  });
  const workspaceDir = path.join(paths.workspacesDir, workspaceId);
  const allowedSet = new Set(attempt.allowedFiles);
  const forbiddenSet = new Set(attempt.forbiddenPaths || []);
  const invalid = attempt.changedFiles.filter(
    (relPath) => !allowedSet.has(relPath) || forbiddenSet.has(relPath),
  );
  if (invalid.length > 0 || attempt.blockers.length > 0) {
    attempt.applyStatus = "APPLY_FAILED";
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_FAILED", status: attempt.status });
    return { ok: false, applyStatus: "APPLY_FAILED", message: "Allowlist-Verstoß erreicht niemals das Ziel-Repository." };
  }

  // Atomar im Sinne von "alles oder nichts": zuerst werden ALLE validierten
  // Dateien vollständig aus dem isolierten Workspace gelesen (und ggf. die
  // bisherigen Zielinhalte für einen Rollback gesichert), bevor überhaupt ein
  // einziges Byte im Zielrepository geschrieben wird. Schlägt auch nur eine
  // einzelne Datei fehl, wird nichts geschrieben – kein stiller Partial-Apply.
  let preparedWrites;
  try {
    preparedWrites = attempt.changedFiles.map((relPath) => {
      const src = path.join(workspaceDir, relPath);
      const dest = path.join(context.repoPath, relPath);
      const content = fs.readFileSync(src);
      const existedBefore = fs.existsSync(dest);
      const previousContent = existedBefore ? fs.readFileSync(dest) : null;
      return { relPath, dest, content, existedBefore, previousContent };
    });
  } catch (readError) {
    attempt.applyStatus = "APPLY_FAILED";
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_FAILED", status: attempt.status });
    return { ok: false, applyStatus: "APPLY_FAILED", message: "Übernahme konnte nicht sicher abgeschlossen werden. Keine Datei wurde geschrieben." };
  }

  const writtenSoFar = [];
  try {
    preparedWrites.forEach((entry) => {
      fs.mkdirSync(path.dirname(entry.dest), { recursive: true, mode: 0o700 });
      fs.writeFileSync(entry.dest, entry.content);
      writtenSoFar.push(entry);
    });
  } catch (writeError) {
    // Vollständiger Rollback: bereits geschriebene Dateien dieses Apply-Versuchs
    // werden auf ihren Vor-Apply-Zustand zurückgesetzt (gelöscht, falls sie vor
    // dem Apply nicht existierten).
    writtenSoFar.forEach((entry) => {
      try {
        if (entry.existedBefore) {
          fs.writeFileSync(entry.dest, entry.previousContent);
        } else {
          fs.rmSync(entry.dest, { force: true });
        }
      } catch (_rollbackError) {
        /* best effort */
      }
    });
    attempt.applyStatus = "APPLY_FAILED";
    saveAttempt(paths, attempt);
    appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLY_FAILED", status: attempt.status });
    return { ok: false, applyStatus: "APPLY_FAILED", message: "Übernahme wurde vollständig zurückgerollt (Teilfehler)." };
  }

  attempt.applyStatus = "APPLIED";
  attempt.appliedAt = nowIso();
  attempt.appliedFiles = attempt.changedFiles;
  saveAttempt(paths, attempt);
  appendAuditEntry(paths, { attemptId, runId, projectId: attempt.projectId, action: "APPLIED", status: attempt.status });
  cleanupWorkspace(workspaceDir);

  return {
    ok: true,
    applyStatus: "APPLIED",
    appliedFiles: attempt.appliedFiles,
    message: "Änderungen wurden in das Fixture-Repository übernommen. Kein Commit. Kein Push. Kein Deployment.",
  };
}

module.exports = {
  HEALTH_PROJECT_ID,
  FIXTURE_PROJECT_ID,
  FIXTURE_ALLOWED_FILES,
  FIXTURE_FORBIDDEN_PATHS,
  EXECUTION_ATTEMPT_STATUSES,
  TERMINAL_ATTEMPT_STATUSES,
  APPLY_STATUSES,
  KNOWN_WORKING_TREE_BASELINE_FIELDS,
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS,
  TOKEN_TTL_MS,
  MAX_WORKSPACE_FILES,
  MAX_WORKSPACE_FILE_BYTES,
  MAX_WORKSPACE_TOTAL_BYTES,
  validateKnownWorkingTreeBaseline,
  resolveBridgePaths,
  ensureBridgeDirs,
  ensureDirSecure,
  ensureFixtureProjectRepo,
  fixtureRepoPath,
  resolveProjectContext,
  readProjectBaseline,
  readFixtureRepoBaseline,
  readHealthBaselineReadOnly,
  materializeIsolatedWorkspace,
  assertWorkspaceOutsideRepositories,
  listSourceFilesForCopy,
  diffWorkspaceAgainstBaseline,
  computeWorkspaceId,
  cleanupWorkspace,
  acquireProjectLock,
  releaseProjectLock,
  readLock,
  isLockStale,
  isPidAlive,
  saveAttempt,
  loadAttempt,
  appendAuditEntry,
  mintToken,
  consumeToken,
  clearAllTokensForTests,
  assertTransitionAllowed,
  isTerminalStatus,
  evaluateAllowlist,
  describeAttemptForRecovery,
  prepareExecutionAttempt,
  startExecutionAttempt,
  runAttemptWorkflowInBackground,
  cancelExecutionAttempt,
  readOnlyAttemptStatus,
  readOnlyAttemptResult,
  requestApplyPreview,
  confirmApply,
  healthApplyBlockedMessage,
  buildVerifiedDiffEntries,
  executorRegistry,
  codexAdapter,
};
