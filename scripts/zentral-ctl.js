"use strict";

// Phase B "Betriebsstabilität" – separate local controller for the app server.
// This script is NOT loaded by the running app server and exposes no HTTP route.
// It only manages processes it itself started. It never kills a process solely
// because it occupies the desired port, never uses shell strings, and never uses
// kill -9 as a normal path. See AGENTS.md / MIGRATION_PLAN.md for the governing
// safety rules of V7.0 Phase B.

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const { execFile, spawn } = require("child_process");
const serverStatus = require("../server-status");

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = "127.0.0.1";
const STOP_TIMEOUT_MS = 5000;
const STOP_POLL_INTERVAL_MS = 200;
const START_CONFIRM_TIMEOUT_MS = 6000;
const START_CONFIRM_POLL_INTERVAL_MS = 250;
const SERVER_ENTRY_FILE = "server.js";

function defaultProjectRoot() {
  return path.resolve(__dirname, "..");
}

function resolvePaths(options = {}) {
  const base = serverStatus.resolveStatusPaths({
    appSupportDir: options.appSupportDir,
    projectRoot: options.projectRoot || defaultProjectRoot(),
  });
  return {
    ...base,
    tmpFilePath: path.join(base.serverDir, `.status.${process.pid}.${Date.now()}.tmp`),
    serverEntryFile: path.join(base.projectRoot, SERVER_ENTRY_FILE),
  };
}

function ensureServerDirSafe(paths) {
  try {
    fs.mkdirSync(paths.serverDir, { recursive: true, mode: 0o700 });
    return { ok: true };
  } catch (error) {
    return { ok: false, code: "APP_SUPPORT_UNAVAILABLE", message: error.message };
  }
}

const computeProjectFingerprint = serverStatus.computeProjectFingerprint;
const readStatusFileSafe = serverStatus.readStatusFileSafe;

function writeStatusFileAtomic(paths, record) {
  const ensured = ensureServerDirSafe(paths);
  if (!ensured.ok) return ensured;
  const payload = {
    controllerSchemaVersion: serverStatus.CONTROLLER_SCHEMA_VERSION,
    pid: record.pid,
    port: record.port,
    startedAt: record.startedAt,
    appVersion: record.appVersion,
    gitCommit: record.gitCommit,
    projectFingerprint: record.projectFingerprint,
  };
  const body = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(body, "utf8") > serverStatus.MAX_STATUS_FILE_BYTES) {
    return { ok: false, code: "STATUS_FILE_TOO_LARGE" };
  }
  try {
    fs.writeFileSync(paths.tmpFilePath, body, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(paths.tmpFilePath, paths.statusFilePath);
    return { ok: true };
  } catch (error) {
    try {
      fs.unlinkSync(paths.tmpFilePath);
    } catch (_cleanupError) {
      /* best effort */
    }
    return { ok: false, code: "WRITE_FAILED", message: error.message };
  }
}

function clearStatusFile(paths) {
  try {
    fs.unlinkSync(paths.statusFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { ok: false, message: error.message };
    }
  }
  return { ok: true };
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    return false;
  }
}

function readProcessCommandLine(pid) {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        "ps",
        ["-p", String(pid), "-o", "command="],
        { timeout: 3000, maxBuffer: 8 * 1024, encoding: "utf8", shell: false },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(String(stdout || "").trim() || null);
        },
      );
      child.once("error", () => resolve(null));
    } catch (_error) {
      // ps may be unavailable or unspawnable in restricted environments; fail closed
      // (treated as "cannot confirm ownership") without crashing the caller.
      resolve(null);
    }
  });
}

async function isExpectedServerProcess(pid, expectedServerFile) {
  const commandLine = await readProcessCommandLine(pid);
  if (!commandLine) return false;
  return commandLine.includes(expectedServerFile) && /\bnode\b/i.test(commandLine);
}

function probePort(port, host = DEFAULT_HOST) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        resolve({ state: "OCCUPIED" });
      } else {
        resolve({ state: "UNKNOWN", detail: error ? error.code : "UNKNOWN" });
      }
    });
    tester.once("listening", () => {
      tester.close(() => resolve({ state: "FREE" }));
    });
    try {
      tester.listen(port, host);
    } catch (_error) {
      resolve({ state: "UNKNOWN" });
    }
  });
}

function lookupPortOccupantPidBestEffort(port) {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        "lsof",
        ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
        { timeout: 3000, maxBuffer: 16 * 1024, encoding: "utf8", shell: false },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const lines = String(stdout || "")
            .split("\n")
            .filter((line) => line && !line.startsWith("COMMAND"));
          if (lines.length === 0) {
            resolve(null);
            return;
          }
          const columns = lines[0].trim().split(/\s+/);
          const pid = Number(columns[1]);
          resolve(Number.isInteger(pid) && pid > 0 ? pid : null);
        },
      );
      child.once("error", () => resolve(null));
    } catch (_error) {
      // lsof may be unavailable in restricted environments; purely informational,
      // so failing closed to "unknown occupant" is safe here.
      resolve(null);
    }
  });
}

function httpGetOk(port, host = DEFAULT_HOST, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: "/", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(typeof res.statusCode === "number" && res.statusCode < 500);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether the pid+record stored in the status file safely and currently
 * refers to a live process belonging to this exact project's server.js. Fails closed:
 * any uncertainty results in "not confirmed", never a destructive action.
 */
async function verifyOwnedProcess(record, paths) {
  if (!isPidAlive(record.pid)) {
    return { ok: false, reason: "STALE_PID" };
  }
  const expectedFingerprint = computeProjectFingerprint(paths.projectRoot);
  if (record.projectFingerprint !== expectedFingerprint) {
    return { ok: false, reason: "PROJECT_PATH_MISMATCH" };
  }
  const isExpected = await isExpectedServerProcess(record.pid, paths.serverEntryFile);
  if (!isExpected) {
    return { ok: false, reason: "PID_REUSED_BY_OTHER_PROCESS" };
  }
  return { ok: true };
}

/**
 * Reads the controller's status file and verifies process ownership only. Never
 * probes any port, so it is safe and cheap to call whenever the question is only
 * "is there already a controller-managed instance of this project alive?" —
 * independent of which port a caller happens to be asking about.
 */
async function readManagedInstance(paths) {
  const fileResult = readStatusFileSafe(paths);
  if (!fileResult.ok) {
    return { ok: false, reason: fileResult.reason };
  }
  const record = fileResult.record;
  const verification = await verifyOwnedProcess(record, paths);
  if (!verification.ok) {
    return { ok: false, reason: verification.reason, staleRecord: record };
  }
  const currentGitCommit = await serverStatus.readGitCommitReadOnly(paths.projectRoot);
  const { status: versionStatus } = serverStatus.describeVersionState(record.gitCommit, currentGitCommit);
  return {
    ok: true,
    record,
    versionStatus,
    currentGitCommit: currentGitCommit || serverStatus.UNKNOWN,
  };
}

async function computeControllerStatus(options = {}) {
  const paths = resolvePaths(options);
  const port = Number(options.port) || DEFAULT_PORT;
  const managed = await readManagedInstance(paths);

  if (managed.ok) {
    const { record, versionStatus, currentGitCommit } = managed;
    return {
      status: versionStatus,
      port: record.port,
      pid: record.pid,
      startedAt: record.startedAt,
      appVersion: record.appVersion,
      gitCommit: record.gitCommit,
      currentProjectCommit: currentGitCommit,
      managedByController: true,
      controllerSchemaVersion: record.controllerSchemaVersion,
      message: serverStatus.statusMessageFor(versionStatus),
      nextAction: serverStatus.nextActionFor(versionStatus),
    };
  }

  if (managed.reason === "MISSING") {
    const portProbe = await probePort(port);
    if (portProbe.state === "OCCUPIED") {
      const occupantPid = await lookupPortOccupantPidBestEffort(port);
      const manuallyStarted =
        occupantPid && (await isExpectedServerProcess(occupantPid, paths.serverEntryFile));
      return {
        status: "PORT_CONFLICT",
        port,
        pid: null,
        managedByController: false,
        message: manuallyStarted
          ? "Port ist belegt, wahrscheinlich durch einen manuell gestarteten Server dieses Projekts (nicht über den Controller). Der Controller verwaltet ihn nicht und beendet ihn nicht automatisch."
          : "Port ist durch einen anderen, dem Controller nicht zugeordneten Prozess belegt. Der Controller beendet ihn nicht automatisch.",
        nextAction: manuallyStarted
          ? "Server bei Bedarf manuell beenden und danach npm run central:start verwenden."
          : "Anderen Prozess prüfen oder npm run central:start -- --port <anderer Port> verwenden.",
      };
    }
    return {
      status: "STOPPED",
      port,
      pid: null,
      managedByController: false,
      message: "Kein vom Controller verwalteter Server gefunden. Port ist frei.",
      nextAction: "npm run central:start",
    };
  }

  const reasonMessages = {
    CORRUPT: "Statusdatei des Controllers ist beschädigt und wird ignoriert.",
    TOO_LARGE: "Statusdatei des Controllers überschreitet die sichere Größengrenze und wird ignoriert.",
    UNREADABLE: "Statusdatei des Controllers konnte nicht sicher gelesen werden.",
    SCHEMA_MISMATCH: "Statusdatei stammt von einer anderen Controller-Schema-Version und wird ignoriert.",
    STALE_PID: "Gespeicherter Prozess läuft nicht mehr. Statusdatei ist veraltet.",
    PROJECT_PATH_MISMATCH: "Gespeicherter Prozess gehört zu einem anderen Projektpfad. Statusdatei ist ungültig.",
    PID_REUSED_BY_OTHER_PROCESS: "Gespeicherte Prozess-ID gehört inzwischen zu einem anderen Prozess. Statusdatei ist ungültig.",
  };
  return {
    status: "STALE",
    port: managed.staleRecord?.port ?? port,
    pid: null,
    managedByController: false,
    message: reasonMessages[managed.reason] || "Statusdatei ist ungeklärt.",
    nextAction: "npm run central:start",
    staleRecord: managed.staleRecord,
  };
}

async function startServer(options = {}) {
  const paths = resolvePaths(options);
  const port = Number(options.port) || DEFAULT_PORT;

  const existing = await readManagedInstance(paths);
  if (existing.ok) {
    return {
      ok: false,
      code: "ALREADY_RUNNING",
      message: `Es läuft bereits ein vom Controller verwalteter Server (PID ${existing.record.pid}, Port ${existing.record.port}). Keine zweite parallele Instanz.`,
      nextAction: "npm run central:status",
    };
  }

  const portProbe = await probePort(port);
  if (portProbe.state !== "FREE") {
    const occupantPid = await lookupPortOccupantPidBestEffort(port);
    const manuallyStarted =
      occupantPid && (await isExpectedServerProcess(occupantPid, paths.serverEntryFile));
    return {
      ok: false,
      code: "PORT_CONFLICT",
      message: manuallyStarted
        ? `Port ${port} ist bereits durch einen manuell gestarteten Server dieses Projekts belegt. Kein automatischer Kill.`
        : `Port ${port} ist bereits belegt. Kein automatischer Kill eines fremden Prozesses.`,
      nextAction: `Anderen Prozess manuell prüfen oder npm run central:start -- --port <anderer Port> verwenden.`,
    };
  }

  const currentGitCommit = await serverStatus.readGitCommitReadOnly(paths.projectRoot);
  let child;
  try {
    child = spawn(
      process.execPath,
      [paths.serverEntryFile],
      {
        cwd: paths.projectRoot,
        env: { ...process.env, PORT: String(port) },
        detached: true,
        stdio: "ignore",
        shell: false,
      },
    );
  } catch (error) {
    return {
      ok: false,
      code: "SPAWN_FAILED",
      message: `Server konnte nicht gestartet werden: ${error.message}`,
      nextAction: "npm run central:status prüfen; Berechtigungen des Systems prüfen.",
    };
  }

  let exitedEarly = null;
  child.once("exit", (code, signal) => {
    exitedEarly = { code, signal };
  });
  child.once("error", (error) => {
    exitedEarly = { code: null, signal: null, error: error.message };
  });

  const deadline = Date.now() + START_CONFIRM_TIMEOUT_MS;
  let confirmed = false;
  while (Date.now() < deadline) {
    if (exitedEarly) break;
    // eslint-disable-next-line no-await-in-loop
    if (await httpGetOk(port)) {
      confirmed = true;
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(START_CONFIRM_POLL_INTERVAL_MS);
  }

  if (exitedEarly) {
    return {
      ok: false,
      code: "SERVER_EXITED_IMMEDIATELY",
      message: "Server hat sich unmittelbar nach dem Start beendet.",
      detail: exitedEarly,
      nextAction: "npm run central:status danach manuell prüfen.",
    };
  }

  if (!confirmed) {
    return {
      ok: false,
      code: "SERVER_DID_NOT_START",
      message: `Server hat innerhalb von ${START_CONFIRM_TIMEOUT_MS}ms nicht auf Port ${port} reagiert.`,
      nextAction: "npm run central:status prüfen; Server ggf. manuell prüfen.",
    };
  }

  child.unref();
  const projectFingerprint = computeProjectFingerprint(paths.projectRoot);
  const startedAt = new Date().toISOString();
  const writeResult = writeStatusFileAtomic(paths, {
    pid: child.pid,
    port,
    startedAt,
    appVersion: serverStatus.CENTRAL_APP_VERSION,
    gitCommit: currentGitCommit || serverStatus.UNKNOWN,
    projectFingerprint,
  });
  if (!writeResult.ok) {
    return {
      ok: false,
      code: "STATUS_FILE_WRITE_FAILED",
      message: "Server läuft, aber die Controller-Statusdatei konnte nicht geschrieben werden.",
      detail: writeResult,
      nextAction: "App-Support-Verzeichnis-Berechtigung prüfen.",
    };
  }

  return {
    ok: true,
    pid: child.pid,
    port,
    startedAt,
    appVersion: serverStatus.CENTRAL_APP_VERSION,
    gitCommit: currentGitCommit || serverStatus.UNKNOWN,
    message: `Server erfolgreich gestartet (PID ${child.pid}, Port ${port}).`,
  };
}

async function stopServer(options = {}) {
  const paths = resolvePaths(options);
  const fileResult = readStatusFileSafe(paths);

  if (!fileResult.ok) {
    if (fileResult.reason === "MISSING") {
      return {
        ok: false,
        code: "NOTHING_TO_STOP",
        message: "Kein vom Controller verwalteter Server gefunden.",
        nextAction: "npm run central:status",
      };
    }
    clearStatusFile(paths);
    return {
      ok: false,
      code: "STALE_STATUS_FILE_REMOVED",
      message: "Statusdatei war ungültig und wurde sicher entfernt. Kein Prozess wurde beendet.",
      nextAction: "npm run central:status",
    };
  }

  const record = fileResult.record;
  const verification = await verifyOwnedProcess(record, paths);
  if (!verification.ok) {
    clearStatusFile(paths);
    return {
      ok: false,
      code: "REFUSED_UNSAFE_TARGET",
      message: "Gespeicherter Prozess konnte nicht sicher als eigener Server bestätigt werden. Es wurde kein Prozess beendet. Veraltete Statusdatei wurde entfernt.",
      reason: verification.reason,
      nextAction: "npm run central:start",
    };
  }

  try {
    process.kill(record.pid, "SIGTERM");
  } catch (error) {
    if (error.code === "ESRCH") {
      clearStatusFile(paths);
      return {
        ok: true,
        code: "ALREADY_STOPPED",
        message: "Prozess war bereits beendet. Statusdatei wurde bereinigt.",
      };
    }
    return {
      ok: false,
      code: "SIGTERM_FAILED",
      message: `SIGTERM konnte nicht gesendet werden: ${error.message}`,
      nextAction: "npm run central:status",
    };
  }

  const deadline = Date.now() + STOP_TIMEOUT_MS;
  let stopped = false;
  while (Date.now() < deadline) {
    if (!isPidAlive(record.pid)) {
      stopped = true;
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(STOP_POLL_INTERVAL_MS);
  }

  if (!stopped) {
    return {
      ok: false,
      code: "STOP_TIMEOUT",
      message: `Prozess (PID ${record.pid}) hat auf SIGTERM nicht innerhalb von ${STOP_TIMEOUT_MS}ms reagiert. Kein automatisches kill -9.`,
      nextAction: "Prozess manuell prüfen. Harte Beendigung ist ein bewusster manueller Schritt außerhalb von Phase B.",
      pid: record.pid,
    };
  }

  clearStatusFile(paths);
  return {
    ok: true,
    code: "STOPPED",
    message: `Server (PID ${record.pid}, Port ${record.port}) wurde kontrolliert beendet.`,
  };
}

async function restartServer(options = {}) {
  const stopResult = await stopServer(options);
  if (!stopResult.ok && stopResult.code !== "NOTHING_TO_STOP" && stopResult.code !== "STALE_STATUS_FILE_REMOVED") {
    return {
      ok: false,
      code: "RESTART_ABORTED_AT_STOP",
      message: `Neustart abgebrochen: ${stopResult.message}`,
      detail: stopResult,
      nextAction: stopResult.nextAction || "npm run central:status",
    };
  }
  return startServer(options);
}

function formatCliStatus(status) {
  const lines = [
    `Status:        ${status.status}`,
    `Port:           ${status.port ?? "UNGEKLÄRT"}`,
    `Verwaltet:      ${status.managedByController ? "ja (Controller)" : "nein"}`,
    `Nachricht:      ${status.message}`,
    `Nächster Schritt: ${status.nextAction}`,
  ];
  if (status.pid) lines.splice(2, 0, `PID:            ${status.pid}`);
  if (status.appVersion) lines.push(`App-Version:    ${status.appVersion}`);
  if (status.gitCommit) lines.push(`Commit (Start): ${serverStatus.shortCommit(status.gitCommit)}`);
  if (status.currentProjectCommit) lines.push(`Commit (aktuell): ${serverStatus.shortCommit(status.currentProjectCommit)}`);
  return lines.join("\n");
}

function parseArgv(argv) {
  const command = argv[0] || "status";
  let port = null;
  const portIndex = argv.indexOf("--port");
  if (portIndex !== -1 && argv[portIndex + 1]) {
    const parsed = Number(argv[portIndex + 1]);
    if (Number.isInteger(parsed) && parsed > 0) port = parsed;
  }
  return { command, port };
}

async function main(argv) {
  const { command, port } = parseArgv(argv);
  const options = port ? { port } : {};

  if (command === "status") {
    const status = await computeControllerStatus(options);
    console.log(formatCliStatus(status));
    return;
  }
  if (command === "start") {
    const result = await startServer(options);
    console.log(result.ok ? result.message : `Start fehlgeschlagen: ${result.message}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "stop") {
    const result = await stopServer(options);
    console.log(result.ok ? result.message : `Stop fehlgeschlagen: ${result.message}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "restart") {
    const result = await restartServer(options);
    console.log(result.ok ? result.message : `Neustart fehlgeschlagen: ${result.message}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log(`Unbekanntes Kommando "${command}". Erlaubt: status, start, stop, restart.`);
  process.exitCode = 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.log(`Controllerfehler: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_PORT,
  resolvePaths,
  ensureServerDirSafe,
  computeProjectFingerprint,
  readStatusFileSafe,
  writeStatusFileAtomic,
  clearStatusFile,
  isPidAlive,
  readProcessCommandLine,
  isExpectedServerProcess,
  probePort,
  lookupPortOccupantPidBestEffort,
  httpGetOk,
  verifyOwnedProcess,
  computeControllerStatus,
  startServer,
  stopServer,
  restartServer,
  formatCliStatus,
  parseArgv,
  main,
};
