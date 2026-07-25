"use strict";

// V7.0 Phase D – Codex-Adapter.
//
// Dieses Modul ist die EINZIGE Stelle, die einen echten Codex-CLI-Prozess
// startet. Es wird ausschließlich von execution-bridge.js aufgerufen, nie
// direkt von server.js oder aus der UI.
//
// Verbindliche Grenzen (siehe AGENTS.md / V7.0 Phase D Auftrag):
// - Codex läuft als Child Process ohne aktiviertes Shell-Flag.
// - Executable und Argumente sind eine feste, hier hart kodierte Argumentliste.
//   Keine vom Browser frei eingegebene Shell-Zeile, kein `eval`, kein
//   zusammengesetzter exec-String.
// - Working Directory ist ausschließlich der isolierte Attempt-Workspace
//   (niemals der Pfad eines echten Repositories).
// - Environment ist auf das technisch Nötige reduziert (kein Secrets-Leak,
//   keine volle Weitergabe von process.env).
// - stdout/stderr sind größenbegrenzt, strukturiert erfasst und redigiert.
// - Cancel/Timeout beenden ausschließlich den eigenen, attemptgebundenen
//   Codex-Kindprozess – nie einen fremden Prozess.
// - Der Auftrag an Codex kommt ausschließlich aus einem festen, hier
//   definierten Preset – kein freier Systemprompt aus dem Browser.
// - Codex' eigene Behauptung über Erfolg ist KEINE Evidenz. Die Zentrale
//   führt das erlaubte Testkommando nach dem Lauf selbst aus.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync, spawn } = require("child_process");

const CODEX_EXECUTOR_LABEL =
  "Codex – isolierter echter Code-Executor. Codex-Ausgabe ist kein Fachbefund; die Zentrale prüft Diff und Tests selbst.";

const SCENARIOS = Object.freeze({ REAL_RUN: "REAL_RUN" });
const SUPPORTED_SCENARIOS = Object.freeze(Object.values(SCENARIOS));

const CODEX_EXECUTABLE = "codex";
const DEFAULT_AVAILABILITY_TTL_MS = 15_000;
const DEFAULT_CODEX_TIMEOUT_MS = 120_000;
const GRACEFUL_CANCEL_GRACE_MS = 2_000;
const MAX_PROCESS_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_STDOUT_CHARS = 4_000;
const MAX_STDERR_CHARS = 2_000;
const MAX_LAST_MESSAGE_CHARS = 2_000;
const MAX_TEST_SUMMARY_CHARS = 2_000;
const ALLOWED_TEST_RUNNERS = Object.freeze(["node"]);

// Ausschließlich EIN eng geprüfter Pilotauftrag für Phase D. Neue Presets
// dürfen künftig nur additiv ergänzt werden, nie durch Browser-Eingabe.
const CODEX_TASK_PRESETS = Object.freeze({
  FIXTURE_ADD_FUNCTION_FIX: Object.freeze({
    id: "FIXTURE_ADD_FUNCTION_FIX",
    projectId: "execution-bridge-fixture",
    goal:
      "Korrigiere die Funktion addFixtureNumbers in FIXTURE_CALC.js. Sie soll zwei Zahlen tatsächlich addieren " +
      "(aktuell subtrahiert sie fälschlich). Ändere ausschließlich die Berechnung, keine Signatur, keine neue Datei.",
          allowedFiles: Object.freeze(["FIXTURE_CALC.js"]),
          forbiddenPaths: Object.freeze([]),
          testCommand: Object.freeze({ command: "node", args: Object.freeze(["FIXTURE_CALC.test.js"]) }),
          // Wird zusätzlich zu allowedFiles in den isolierten Workspace kopiert
          // (read-only für Codex, zählt NICHT zur Schreib-/Diff-Allowlist),
          // damit das erlaubte Testkommando dort überhaupt lauffähig ist.
          testSupportFiles: Object.freeze(["FIXTURE_CALC.test.js"]),
        }),
});

// In-memory, ausschließlich attemptgebunden. Niemals auf Platte, niemals Teil
// eines Audit-/Attempt-Datensatzes.
const ACTIVE_PROCESSES = new Map();

let cachedAvailability = null;
let cachedAvailabilityAt = 0;

function resetCodexAvailabilityCacheForTests() {
  cachedAvailability = null;
  cachedAvailabilityAt = 0;
}

function truncate(text, maxChars) {
  const normalized = String(text == null ? "" : text).replace(/\u0000/g, "");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…`;
}

// Defensive Redaktion, bevor irgendetwas aus Codex-Ausgabe/Tests persistiert
// oder auditiert wird. Kein Anspruch auf Vollständigkeit gegen jede erdenkliche
// Geheimnisform – zusätzliche, nicht die einzige Schutzschicht (Environment
// bleibt ohnehin reduziert, siehe buildReducedEnv).
const SECRET_PATTERNS = Object.freeze([
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /sk-[A-Za-z0-9]{10,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(api[_-]?key|secret|password|token)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi,
]);

function redactSecrets(text) {
  let result = String(text == null ? "" : text);
  SECRET_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, "[REDACTED]");
  });
  return result;
}

function buildReducedEnv() {
  const env = { PATH: process.env.PATH || "", LANG: "C" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}

function buildCodexPrompt(preset) {
  const allowed = preset.allowedFiles.join(", ");
  const forbidden = preset.forbiddenPaths.length > 0 ? preset.forbiddenPaths.join(", ") : "keine zusätzlichen";
  const testCmd = `${preset.testCommand.command} ${preset.testCommand.args.join(" ")}`;
  return [
    "Auftrag (ausschließlich technische Korrektur, kein Commit, kein Push, kein Deployment):",
    `Ziel: ${preset.goal}`,
    "Workspace-Hinweis: Du arbeitest ausschließlich im aktuellen Arbeitsverzeichnis. Es ist NICHT das echte Repository, sondern eine isolierte Kopie außerhalb jedes echten Repositories.",
    `Erlaubte Dateien (ausschließlich diese dürfen verändert werden): ${allowed}`,
    `Verbotene Pfade (niemals berühren): ${forbidden} sowie .git, .env, .env.local, node_modules und jedes Verzeichnis außerhalb dieses Arbeitsverzeichnisses.`,
    `Erlaubtes Testkommando (nur zur Information – die Zentrale führt es nach deinem Lauf selbst aus): ${testCmd}`,
    "Qualitäts- und Abnahmekriterien: Die Korrektur muss minimal sein, darf keine neue Datei außerhalb der Allowlist erzeugen, keine neue Abhängigkeit hinzufügen und keinen Git-, Installations- oder Netzwerkbefehl ausführen.",
    "Ausdrückliche Grenzen: kein Commit. kein Push. kein Deployment. keine Bearbeitung außerhalb der Allowlist. kein Zugriff auf .git. keine Installation zusätzlicher Pakete. keine externen Schreibaktionen.",
    "Gewünschtes Ergebnisformat: Beschreibe kurz in Textform, was geändert wurde und warum. Ein Erfolgsanspruch von dir ist keine Abnahme – die Zentrale prüft Diff und Tests eigenständig.",
  ].join("\n");
}

// Reihenfolge verbindlich gegen lokal installiertes `codex --help` /
// `codex exec --help` (codex-cli 0.142.2) geprüft: `--ask-for-approval` ist
// ein globaler Parameter des `codex`-Wurzelkommandos und wird von der
// `exec`-Subcommand-Argumentliste NICHT akzeptiert ("unexpected argument"),
// muss also VOR `exec` stehen. Alle übrigen Flags sind `exec`-Subcommand-Flags
// und stehen danach. Keine Flags aus Erinnerung oder älterer Dokumentation.
function buildCodexArgs({ workspaceDir, outputLastMessagePath, prompt }) {
  return [
    "--ask-for-approval",
    "never",
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--cd",
    workspaceDir,
    "--output-last-message",
    outputLastMessagePath,
    prompt,
  ];
}

// Manche Codex-CLI-Versionen schreiben den Login-Status auf stderr statt
// stdout. execFileSync liefert im Erfolgsfall nur stdout und leitet stderr per
// Default an den stderr des Elternprozesses weiter – das wäre sowohl ein
// unkontrollierter Ausgabe-Leak als auch der Grund, warum der Status sonst
// fälschlich als "nicht angemeldet" gelesen würde. Diese Funktion fasst
// stdout+stderr sicher zusammen, ohne irgendetwas an die Konsole des
// Elternprozesses durchzureichen.
function execFileSyncCapturedBoth(file, args, options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const result = spawnSyncImpl(file, args, {
    timeout: options.timeout,
    env: options.env,
    encoding: options.encoding || "utf8",
    maxBuffer: options.maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`${file} beendete mit Status ${result.status}.`);
    error.status = result.status;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function parseLoginStatus(stdout) {
  const text = String(stdout || "").trim();
  if (/logged in using chatgpt/i.test(text)) return { authenticated: true, authLabel: "ChatGPT" };
  if (/api key/i.test(text) && /logged in/i.test(text)) return { authenticated: true, authLabel: "API-Key" };
  return { authenticated: false, authLabel: null };
}

// Ausschließlich lesende CLI-Aufrufe (--version, login status). Kein Install,
// kein Login-Start, keine Ausgabe von Zugangsdaten – nur ein sicherer,
// bereits normalisierter Verfügbarkeits-/Auth-Status.
function detectCodexAvailability(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_AVAILABILITY_TTL_MS;
  if (!options.forceRefresh && cachedAvailability && now - cachedAvailabilityAt < ttlMs) {
    return cachedAvailability;
  }
  // Nur die reale (nicht in Tests gemockte) Implementierung muss stdout+stderr
  // zusammenführen; injizierte Test-Mocks liefern bereits den gewünschten Text
  // direkt als Rückgabewert.
  const exec = options.execFileSyncImpl || execFileSyncCapturedBoth;
  let result;
  try {
    const versionOut = exec(CODEX_EXECUTABLE, ["--version"], {
      timeout: 4000,
      shell: false,
      encoding: "utf8",
      env: buildReducedEnv(),
      maxBuffer: 64 * 1024,
    });
    const version = String(versionOut || "").trim() || null;
    let loginInfo = { authenticated: false, authLabel: null };
    try {
      const loginOut = exec(CODEX_EXECUTABLE, ["login", "status"], {
        timeout: 4000,
        shell: false,
        encoding: "utf8",
        env: buildReducedEnv(),
        maxBuffer: 64 * 1024,
      });
      loginInfo = parseLoginStatus(loginOut);
    } catch (_loginError) {
      loginInfo = { authenticated: false, authLabel: null };
    }
    result = {
      available: true,
      version,
      authenticated: loginInfo.authenticated,
      authLabel: loginInfo.authLabel,
      reason: null,
    };
  } catch (_error) {
    result = {
      available: false,
      version: null,
      authenticated: false,
      authLabel: null,
      reason: "CODEX_CLI_NOT_FOUND",
    };
  }
  cachedAvailability = result;
  cachedAvailabilityAt = now;
  return result;
}

function assertWorkspaceOutsideForbiddenRoots(resolvedWorkspace, forbiddenRoots, realpathSyncImpl) {
  (forbiddenRoots || []).forEach((root) => {
    if (!root) return;
    let resolvedRoot;
    try {
      resolvedRoot = realpathSyncImpl(root);
    } catch (_error) {
      resolvedRoot = path.resolve(root);
    }
    if (resolvedWorkspace === resolvedRoot || resolvedWorkspace.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error("Codex-Adapter: Workspace liegt innerhalb eines verbotenen Repositorypfads.");
    }
  });
}

function runVerifiedTestCommand(workspaceDir, testCommand, options) {
  if (!testCommand || !ALLOWED_TEST_RUNNERS.includes(testCommand.command) || !Array.isArray(testCommand.args)) {
    return { testStatus: "FAILED", testExitCode: null, testSummary: "Kein zulässiges Testkommando konfiguriert." };
  }
  const exec = options.execFileSyncImpl || execFileSync;
  try {
    const stdout = exec(testCommand.command, testCommand.args, {
      cwd: workspaceDir,
      timeout: 10_000,
      shell: false,
      encoding: "utf8",
      env: buildReducedEnv(),
      maxBuffer: 512 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      testStatus: "PASSED",
      testExitCode: 0,
      testSummary: redactSecrets(truncate(stdout, MAX_TEST_SUMMARY_CHARS)),
    };
  } catch (error) {
    const exitCode = typeof error.status === "number" ? error.status : typeof error.code === "number" ? error.code : 1;
    const combined = `${error.stdout || ""}\n${error.stderr || error.message || ""}`;
    return {
      testStatus: "FAILED",
      testExitCode: exitCode,
      testSummary: redactSecrets(truncate(combined, MAX_TEST_SUMMARY_CHARS)),
    };
  }
}

function cleanupLastMessageFile(lastMessagePath, options) {
  const unlink = options.unlinkSyncImpl || fs.unlinkSync;
  try {
    unlink(lastMessagePath);
  } catch (_error) {
    /* best effort */
  }
}

// Realer Prozessaufruf für Codex – bewusst über `spawn` statt `execFile`.
// Empirisch (manueller Vergleichslauf gegen die lokal installierte Codex-CLI
// 0.142.2) hängt `execFile` mit einem `stdio`-Array-Override und aktivem
// `maxBuffer`/`timeout` unbegrenzt, obwohl derselbe Aufruf über `spawn` mit
// identischen Argumenten/Environment/cwd zuverlässig in Sekunden durchläuft.
// Diese Funktion bildet exakt die von `execFile` erwartete Aufrufkonvention
// nach ((file, args, options, callback) => child), damit der Rest des
// Moduls – inklusive ACTIVE_PROCESSES-Bindung und Cancel/Timeout – unverändert
// bleibt. Nur der reale Default-Pfad nutzt sie; injizierte Test-Mocks
// (options.execFileImpl) sind davon unberührt.
function spawnFileWithCallback(file, args, options, callback) {
  const child = spawn(file, args, {
    cwd: options.cwd,
    shell: false,
    env: options.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });

  const maxBuffer = Number.isFinite(options.maxBuffer) ? options.maxBuffer : MAX_PROCESS_BUFFER_BYTES;
  const encoding = options.encoding || "utf8";
  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let settled = false;
  let killedByTimeout = false;
  let timeoutHandle = null;

  function settle(error, stdout, stderr) {
    if (settled) return;
    settled = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    callback(error, stdout, stderr);
  }

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBuffer) stdoutChunks.push(chunk);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBuffer) stderrChunks.push(chunk);
    });
  }

  if (Number.isFinite(options.timeout) && options.timeout > 0) {
    timeoutHandle = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill(options.killSignal || "SIGTERM");
      } catch (_error) {
        /* best effort */
      }
    }, options.timeout);
  }

  child.on("error", (spawnError) => {
    settle(spawnError, Buffer.concat(stdoutChunks).toString(encoding), Buffer.concat(stderrChunks).toString(encoding));
  });

  child.on("close", (code, signal) => {
    const stdout = Buffer.concat(stdoutChunks).toString(encoding);
    const stderr = Buffer.concat(stderrChunks).toString(encoding);
    let error = null;
    if (killedByTimeout) {
      error = new Error(`${file} wurde nach ${options.timeout}ms Timeout beendet.`);
      error.killed = true;
      error.signal = signal;
    } else if (code !== 0 && code !== null) {
      error = new Error(`${file} beendete mit Status ${code}.`);
      error.code = code;
    }
    settle(error, stdout, stderr);
  });

  return child;
}

/**
 * Führt genau einen Codex-Lauf im übergebenen isolierten Workspace aus.
 * Gibt niemals volle Dateiinhalte zurück. testStatus/testExitCode/testSummary
 * stammen ausschließlich aus einem selbst ausgeführten, erlaubten
 * Testkommando – niemals aus Codex' eigener Behauptung.
 */
async function runCodexExecutionScenario(options = {}) {
  const {
    workspaceDir,
    allowedFiles = [],
    scenario,
    attemptId = "unknown-attempt",
    codexTaskPresetId,
    forbiddenRoots = [],
    attemptTimeoutMs,
    shouldAbort,
  } = options;

  if (scenario !== SCENARIOS.REAL_RUN) {
    throw new Error(`Codex-Adapter: unbekanntes Szenario "${scenario}". Nur REAL_RUN ist unterstützt.`);
  }
  if (typeof workspaceDir !== "string" || !workspaceDir) {
    throw new Error("Codex-Adapter: workspaceDir fehlt.");
  }
  const preset = CODEX_TASK_PRESETS[codexTaskPresetId];
  if (!preset) {
    throw new Error("Codex-Adapter: unbekannte oder fehlende Preset-ID.");
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error("Codex-Adapter: allowedFiles ist erforderlich.");
  }

  const realpathSyncImpl = options.realpathSyncImpl || fs.realpathSync;
  let resolvedWorkspace;
  try {
    resolvedWorkspace = realpathSyncImpl(workspaceDir);
  } catch (_error) {
    throw new Error("Codex-Adapter: Workspace konnte nicht sicher aufgelöst werden.");
  }
  assertWorkspaceOutsideForbiddenRoots(resolvedWorkspace, forbiddenRoots, realpathSyncImpl);

  const mkdtemp = options.mkdtempSyncImpl || fs.mkdtempSync;
  const mkdir = options.mkdirSyncImpl || fs.mkdirSync;
  const outputBaseDir = options.outputDir || mkdtemp(path.join(os.tmpdir(), "codex-out-"));
  mkdir(outputBaseDir, { recursive: true, mode: 0o700 });
  const lastMessagePath = path.join(outputBaseDir, `${attemptId}.last-message.txt`);

  const prompt = buildCodexPrompt(preset);
  const args = buildCodexArgs({ workspaceDir: resolvedWorkspace, outputLastMessagePath: lastMessagePath, prompt });
  const timeoutMs = Number.isFinite(attemptTimeoutMs) ? attemptTimeoutMs : DEFAULT_CODEX_TIMEOUT_MS;
  const execImpl = options.execFileImpl || spawnFileWithCallback;
  const env = buildReducedEnv();

  const processResult = await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      ACTIVE_PROCESSES.delete(attemptId);
      resolve(payload);
    };
    const child = execImpl(
      CODEX_EXECUTABLE,
      args,
      {
        cwd: resolvedWorkspace,
        shell: false,
        env,
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        maxBuffer: MAX_PROCESS_BUFFER_BYTES,
        encoding: "utf8",
        // Der Prompt wird bereits als Argument übergeben (siehe buildCodexArgs).
        // `codex exec` liest bei angeschlossenem stdin trotzdem zusätzlich davon
        // und wartet sonst unbegrenzt auf EOF, da Node ohne explizites stdio
        // eine offene, nie geschlossene Pipe an das Kind übergibt. `stdio:
        // ["ignore", ...]` schließt stdin sofort (liefert direktes EOF) – ohne
        // dieses Verhalten hängt jeder reale Codex-Lauf bis zum Timeout.
        stdio: ["ignore", "pipe", "pipe"],
      },
      (error, stdout, stderr) => {
        finish({
          error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          killedByTimeout: Boolean(error && error.killed),
          exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
        });
      },
    );
    ACTIVE_PROCESSES.set(attemptId, child);
    if (typeof child.on === "function") {
      child.on("error", (spawnError) => {
        finish({ error: spawnError, stdout: "", stderr: "", killedByTimeout: false, exitCode: null, spawnError: true });
      });
    }
  });

  const aborted = typeof shouldAbort === "function" && shouldAbort();

  let lastMessageText = "";
  const existsSyncImpl = options.existsSyncImpl || fs.existsSync;
  const readFileSyncImpl = options.readFileSyncImpl || fs.readFileSync;
  try {
    if (existsSyncImpl(lastMessagePath)) {
      lastMessageText = readFileSyncImpl(lastMessagePath, "utf8");
    }
  } catch (_error) {
    lastMessageText = "";
  } finally {
    cleanupLastMessageFile(lastMessagePath, options);
  }

  const codexRawOutput = {
    label: "Codex-Ausgabe (unverifiziert, kein Fachbefund)",
    exitCode: processResult.exitCode,
    stdoutSample: redactSecrets(truncate(processResult.stdout, MAX_STDOUT_CHARS)),
    stderrSample: redactSecrets(truncate(processResult.stderr, MAX_STDERR_CHARS)),
    lastMessageSample: redactSecrets(truncate(lastMessageText, MAX_LAST_MESSAGE_CHARS)),
    timedOutAtProcessLevel: processResult.killedByTimeout === true,
  };

  if (aborted) {
    return {
      ok: false,
      failed: false,
      cancelled: true,
      changedFiles: [],
      diff: [],
      testStatus: null,
      testExitCode: null,
      testSummary: null,
      errors: ["CANCELLED"],
      label: CODEX_EXECUTOR_LABEL,
      codexRawOutput,
    };
  }

  if (processResult.spawnError) {
    return {
      ok: false,
      failed: true,
      cancelled: false,
      changedFiles: [],
      diff: [],
      testStatus: null,
      testExitCode: null,
      testSummary: null,
      errors: ["Codex-Prozess konnte nicht gestartet werden."],
      label: CODEX_EXECUTOR_LABEL,
      codexRawOutput,
    };
  }

  const testOutcome = runVerifiedTestCommand(resolvedWorkspace, preset.testCommand, options);

  return {
    ok: testOutcome.testStatus === "PASSED",
    failed: testOutcome.testStatus !== "PASSED",
    cancelled: false,
    // changedFiles/diff werden von execution-bridge.js unabhängig gemessen
    // (niemals aus Executor-Selbstauskunft übernommen) – siehe
    // buildVerifiedDiffEntries in execution-bridge.js.
    changedFiles: [],
    diff: [],
    testStatus: testOutcome.testStatus,
    testExitCode: testOutcome.testExitCode,
    testSummary: testOutcome.testSummary,
    errors: testOutcome.testStatus === "PASSED" ? [] : ["Verifizierter Testlauf war nicht erfolgreich."],
    label: CODEX_EXECUTOR_LABEL,
    codexRawOutput,
  };
}

function terminateChildProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    let resolved = false;
    let hardKillTimer = null;
    const done = () => {
      if (resolved) return;
      resolved = true;
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve();
    };
    child.once("exit", done);
    child.once("close", done);
    try {
      child.kill("SIGTERM");
    } catch (_error) {
      done();
      return;
    }
    hardKillTimer = setTimeout(() => {
      if (resolved) return;
      try {
        child.kill("SIGKILL");
      } catch (_error) {
        /* ignore */
      }
      setTimeout(done, 300);
    }, GRACEFUL_CANCEL_GRACE_MS);
  });
}

// Beendet ausschließlich den eigenen, attemptgebundenen Codex-Kindprozess.
// Niemals einen fremden Prozess – die Zuordnung erfolgt über das konkrete
// ChildProcess-Objekt, nicht über eine frei übergebene PID.
async function cancelRun(attemptId) {
  const child = ACTIVE_PROCESSES.get(attemptId);
  if (!child) return;
  await terminateChildProcess(child);
  if (ACTIVE_PROCESSES.get(attemptId) === child) {
    ACTIVE_PROCESSES.delete(attemptId);
  }
}

function hasActiveProcessForTests(attemptId) {
  return ACTIVE_PROCESSES.has(attemptId);
}

module.exports = {
  CODEX_EXECUTOR_LABEL,
  SCENARIOS,
  SUPPORTED_SCENARIOS,
  CODEX_TASK_PRESETS,
  ALLOWED_TEST_RUNNERS,
  detectCodexAvailability,
  resetCodexAvailabilityCacheForTests,
  buildCodexPrompt,
  buildCodexArgs,
  buildReducedEnv,
  redactSecrets,
  runCodexExecutionScenario,
  cancelRun,
  hasActiveProcessForTests,
  // Nur für Tests exponiert: der reale Prozessaufruf-Wrapper selbst (siehe
  // Kommentar an der Definition), damit sein execFile-kompatibles Verhalten
  // (Timeout, Buffering, Exitcode, stdin-Handling) ohne echten Codex-CLI-
  // Aufruf gegen einen einfachen Befehl geprüft werden kann.
  spawnFileWithCallback,
};
