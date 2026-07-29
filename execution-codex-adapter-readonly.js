"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// EIGENES, bewusst kleines Modul für den ausschließlich lesenden
// Codex-Analysepfad – KEINE Änderung an execution-codex-adapter.js
// (siehe v71-integration.test.js#"Execution Bridge und zugehörige Module
// bleiben unverändert (kein Diff)": dieses Modul steht unter einem
// verbindlichen Freeze eines parallelen Arbeitspakets und darf in diesem
// Nachtlauf nicht angerührt werden). Dieses Modul verwendet ausschließlich
// bereits öffentlich exportierte, unveränderte Bausteine aus
// execution-codex-adapter.js (buildReducedEnv, redactSecrets,
// spawnFileWithCallback) und dupliziert bewusst ein paar kleine, reine
// Hilfsfunktionen (truncate, assertWorkspaceOutsideForbiddenRoots,
// cleanupLastMessageFile, terminateChildProcess) statt sie aus dem
// eingefrorenen Modul zu importieren oder zu exportieren.
//
// Verbindliche Grenzen (siehe execution-codex-adapter.js Kopfkommentar,
// hier zusätzlich für den Read-Only-Pfad verschärft):
// - Codex läuft als Child Process ohne aktiviertes Shell-Flag, feste
//   Argumentliste, keine Shell-String-Konstruktion.
// - Sandbox ist IMMER "read-only" – dieses Modul kennt keinen anderen Modus
//   und akzeptiert keinen Parameter, der das ändern könnte.
// - Es wird niemals ein Testkommando ausgeführt, niemals ein Diff berechnet,
//   niemals eine Änderung angewendet oder zurückkopiert.
// - Working Directory ist ausschließlich der isolierte, ausschließlich
//   lesende Workspace (pilot-agent-codex-workspace.js), niemals das echte
//   Repository.
// - Environment ist auf das technisch Nötige reduziert.
// - stdout/stderr/Ergebnis sind größenbegrenzt, redigiert.
// - Cancel/Timeout beenden ausschließlich den eigenen, attemptgebundenen
//   Kindprozess.
//
// VERBINDLICHE SICHERHEITSINFORMATION FÜR JAMAL (Korrekturlauf vor dem
// echten Referenzlauf, unabhängiges Review Kategorie B): der isolierte
// Workspace (pilot-agent-codex-workspace.js) und der erzwungene
// "--sandbox read-only"-Modus verhindern nachweislich jede Änderung am
// echten Repository (siehe pilot-agent-codex-workspace.js#
// verifyWorkspaceUnchanged als unabhängige zweite Prüfschicht). Das ist
// jedoch KEINE vollständige Betriebssystem-Leseisolation: die Codex-CLI
// bzw. der dahinterliegende Modellkanal könnte technisch möglicherweise
// weitere, für den aktuellen Betriebssystem-Nutzer lesbare Dateien
// außerhalb dieses Workspace erreichen (z. B. über eigene, hier nicht
// kontrollierte CLI-Funktionen). Die Dateiallowlist
// (pilot-agent-codex-workspace.js#createIsolatedReadOnlyWorkspace) UND der
// Prompt-Hinweis "Keine unaufgeforderten Dateien lesen"
// (pilot-agent-codex-runner.js#buildAgentSpecificCodexPrompt) sind deshalb
// zusätzlich eine VERBINDLICHE AUFTRAGSANWEISUNG an das Modell, kein
// technisch vollständig erzwungener Schutzwall gegen jeden denkbaren
// Lesezugriff außerhalb des Workspace. Aus genau diesem Grund bleibt jeder
// Codex-Lauf an eine bewusste Einzelfreigabe durch Jamal gebunden (siehe
// pilot-agent-execution-service.js#requestCodexRunApproval/
// consumeCodexRunApproval) und niemals `.env`, `.env.local` oder andere
// Secrets bewusst als erlaubte Dateien in ein Preset aufnehmen (siehe
// pilot-agent-execution-service.js#PILOT_AGENT_TASK_PRESETS).

const fs = require("fs");
const os = require("os");
const path = require("path");

const baseCodexAdapter = require("./execution-codex-adapter");

// Eigenes, bewusst kleines Label für den ausschließlich lesenden
// Analysepfad – nie mit dem dateiverändernden CODEX_EXECUTOR_LABEL aus
// execution-codex-adapter.js zu verwechseln. Dieser Pfad liest niemals eine
// Datei zurück, wendet nie einen Diff an und führt kein Testkommando aus.
const CODEX_READ_ONLY_EXECUTOR_LABEL =
  "Codex – isolierter, ausschließlich lesender Read-Only-Analyse-Executor. Kein Dateizugriff schreibend, kein Diff, kein Apply.";

// Korrektur 2 (unabhängiges Review, Kategorie B): fester, überall identisch
// verwendeter Hinweistext, der bei jeder tatsächlich erfolgten
// Secret-Redaktion sichtbar sein muss (Run-Metadaten, Cockpit, API) – siehe
// pilot-agent-codex-runner.js/pilot-agent-execution-service.js/
// pilot-work-order-ui.js. Ein einziges exportiertes Literal statt mehrerer,
// potenziell auseinanderdriftender Kopien.
const SECRET_REDACTION_NOTICE_TEXT = "Ergebnis wurde aus Sicherheitsgründen redigiert und kann fachlich verkürzt sein.";

const CODEX_EXECUTABLE = "codex";
const DEFAULT_CODEX_TIMEOUT_MS = 120_000;
const GRACEFUL_CANCEL_GRACE_MS = 2_000;
const MAX_PROCESS_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_STDOUT_CHARS = 4_000;
const MAX_STDERR_CHARS = 2_000;
// Phase 7, Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): kurze,
// für einen direkt lesbaren Fehlertext gedachte Ausschnittsgröße – deutlich
// kleiner als MAX_STDOUT_CHARS/MAX_STDERR_CHARS oben (die weiterhin die
// vollständige, redigierte Diagnosekopie in codexRawOutput begrenzen). Der
// Fehlertext selbst muss zusätzlich knapp und überschaubar bleiben (siehe
// Auftrag Abschnitt 3, "Die maximale Länge muss begrenzt sein.").
const MAX_ERROR_TEXT_EXCERPT_CHARS = 300;
// Feste, geschlossene Aufzählung sicherer, technischer Fehlerursachen für
// einen fehlgeschlagenen/abgebrochenen Read-Only-Lauf. Niemals Freitext,
// niemals ein Secret- oder Prompt-Fragment – ausschließlich diese festen
// Kategorien, geeignet für Persistenz/Audit/API/Cockpit.
const CODEX_READ_ONLY_REASON_CODES = Object.freeze({
  CANCELLED: "CANCELLED",
  SPAWN_ERROR: "SPAWN_ERROR",
  TIMEOUT: "TIMEOUT",
  PROCESS_EXIT_NONZERO: "CODEX_PROCESS_EXIT_NONZERO",
  EMPTY_RESULT: "EMPTY_RESULT",
  RESULT_TOO_LARGE: "RESULT_TOO_LARGE",
});
// Maximale sichere Größe einer Read-Only-Analyseantwort. Eine Überschreitung
// wird ABGEWIESEN (sicherer Fehler), niemals still gekürzt (Schwerpunkt 8:
// "Antwort liegt unter der maximalen Größe"). Bewusst unter dem
// resultRawText-Datenbanklimit (8000 Zeichen, Migration 20) gehalten.
const MAX_READ_ONLY_RESULT_CHARS = 6_000;

// In-memory, ausschließlich attemptgebunden. Eigenständig für diesen
// Read-Only-Pfad – vollständig unabhängig vom internen Prozessregister aus
// execution-codex-adapter.js.
const ACTIVE_PROCESSES = new Map();

function truncate(text, maxChars) {
  const normalized = String(text == null ? "" : text).replace(/\u0000/g, "");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…`;
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
      throw new Error("Codex-Adapter (Read-Only): Workspace liegt innerhalb eines verbotenen Repositorypfads.");
    }
  });
}

function cleanupLastMessageFile(lastMessagePath, options) {
  const unlink = options.unlinkSyncImpl || fs.unlinkSync;
  try {
    unlink(lastMessagePath);
  } catch (_error) {
    /* best effort */
  }
}

// Phase 7, Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): entfernt
// AUSSCHLIESSLICH ein von diesem Modul selbst per mkdtempSync erzeugtes,
// bereits leeres `codex-ro-out-*`-Verzeichnis. rmdirSync (ohne recursive)
// schlägt bei einem nicht-leeren Verzeichnis kontrolliert fehl (ENOTEMPTY) –
// genau dieses Verhalten wird hier bewusst genutzt, damit niemals versehentlich
// ein Verzeichnis mit noch vorhandenem Inhalt gelöscht wird. Läuft NIEMALS für
// ein vom Aufrufer explizit übergebenes outputDir (siehe Aufrufstelle unten) –
// alte, bereits bestehende Temp-Verzeichnisse werden dadurch nie angefasst.
function cleanupEmptyOutputDirIfCreatedByUs(outputBaseDir, options) {
  const rmdir = options.rmdirSyncImpl || fs.rmdirSync;
  try {
    rmdir(outputBaseDir);
  } catch (_error) {
    /* best effort: Verzeichnis nicht leer (z. B. unerwartete Zusatzdatei von
       Codex) oder bereits entfernt – bewusst KEIN rekursives Löschen. */
  }
}

// Kurzer, für Menschen lesbarer Fehlertext aus den sicheren, bereits
// redigierten Diagnosefeldern – niemals aus dem vollen, unbegrenzten
// Rohtext. Wird bewusst knapp gehalten (siehe MAX_ERROR_TEXT_EXCERPT_CHARS);
// die vollständigere (aber ebenfalls begrenzte, redigierte) Fassung bleibt
// zusätzlich in codexRawOutput für Persistenz/API/Cockpit erhalten.
function excerptForErrorText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  return normalized.length > MAX_ERROR_TEXT_EXCERPT_CHARS
    ? `${normalized.slice(0, MAX_ERROR_TEXT_EXCERPT_CHARS)}…`
    : normalized;
}

function buildProcessExitFailureText(codexRawOutput) {
  const exitCodeText =
    codexRawOutput.exitCode === null || codexRawOutput.exitCode === undefined ? "unbekannt" : String(codexRawOutput.exitCode);
  const parts = [`Codex-Prozess endete mit Exit-Code ${exitCodeText}.`];
  if (codexRawOutput.signal) {
    parts.push(`Signal: ${codexRawOutput.signal}.`);
  }
  const stderrExcerpt = excerptForErrorText(codexRawOutput.stderrSample);
  const stdoutExcerpt = excerptForErrorText(codexRawOutput.stdoutSample);
  // stdout wird nur als Rückfallebene gezeigt, wenn stderr keine
  // diagnostisch verwertbare Information liefert (Auftrag Abschnitt 3:
  // "sichere stdout-Kurzfassung nur wenn diagnostisch sinnvoll").
  if (stderrExcerpt) {
    parts.push(`stderr: ${stderrExcerpt}`);
  } else if (stdoutExcerpt) {
    parts.push(`stdout: ${stdoutExcerpt}`);
  }
  return parts.join(" ");
}

// Korrektur 2 (unabhängiges Review, Kategorie B, "Secret-Redaktion
// fachlich nachvollziehbar machen"): execution-codex-adapter.js#redactSecrets
// ist EINGEFROREN und bleibt unverändert (siehe Kopfkommentar). Für eine
// "Schlüssel: Wert"-Fundstelle ersetzt sie dabei den GESAMTEN Treffer
// inklusive Feldnamen – für den rein lesenden Analysepfad unnötig scharf:
// der Feldname selbst ("token", "password", "api_key", "secret") ist keine
// sensible Information und für eine nachvollziehbare Codeanalyse fachlich
// wertvoll (z. B. "in auth-db.js wird ein Feld namens token gelesen"
// bleibt so erkennbar), während der eigentliche Wert weiterhin niemals im
// Klartext erscheint.
//
// Diese Funktion lebt bewusst NUR hier (neues, nicht eingefrorenes Modul)
// und ersetzt execution-codex-adapter.js#redactSecrets an keiner Stelle im
// eingefrorenen Modul selbst – sie wird ausschließlich auf die fachliche
// Codex-Analyseantwort (resultText) dieses Read-Only-Pfads angewendet.
//
// Verhalten:
//   - "schlüssel: wert" / "schlüssel = wert" (mit oder ohne Anführungszeichen):
//     der Schlüsselname bleibt sichtbar, NUR der Wert wird durch
//     "[REDACTED]" ersetzt.
//   - "Bearer <token>": das Wort "Bearer" bleibt sichtbar, nur der
//     Tokenwert wird ersetzt.
//   - freistehende, typische Secret-Formate ohne einen zugehörigen
//     Feldnamen (sk-…, gh[pousr]_…, AKIA…) werden vollständig ersetzt – es
//     gibt hier keinen Feldnamen, der erhalten werden könnte.
// Bewusste, dokumentierte Grenze (siehe Auftrag: "keine überkomplexe
// NLP-Schicht"): ein Satz wie "Die Funktion berechnet ein Token: die
// Rückgabe" kann in seltenen Fällen ebenfalls als Schlüssel-Wert-Fundstelle
// erkannt werden, obwohl kein echtes Secret vorliegt – dasselbe Risiko galt
// bereits für die eingefrorene, hier unveränderte execution-codex-
// adapter.js#redactSecrets (identische Schlüsselwortliste). Ein
// falsch-positiver Treffer ersetzt hier nur den nächsten Wert, nicht mehr
// den ganzen Satz.
const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|secret|password|passwort|token)\b(\s*)([=:])(\s*)("[^"]*"|'[^']*'|\S+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.]+/gi;
const STANDALONE_SECRET_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9]{10,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
]);

function redactSecretValuesPreservingFieldNames(text) {
  let result = String(text == null ? "" : text);
  result = result.replace(
    KEY_VALUE_SECRET_PATTERN,
    (_match, key, gapBeforeSeparator, separator, gapAfterSeparator) =>
      `${key}${gapBeforeSeparator}${separator}${gapAfterSeparator || " "}[REDACTED]`,
  );
  result = result.replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]");
  STANDALONE_SECRET_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, "[REDACTED]");
  });
  return result;
}

// Eigene, feste Argumentliste – IMMER "read-only". Reihenfolge identisch zur
// verbindlich geprüften Reihenfolge in execution-codex-adapter.js#buildCodexArgs
// (`--ask-for-approval` ist ein globaler Parameter des `codex`-Wurzelkommandos
// und muss VOR `exec` stehen).
function buildReadOnlyCodexArgs({ workspaceDir, outputLastMessagePath, prompt }) {
  return [
    "--ask-for-approval",
    "never",
    "exec",
    "--json",
    "--sandbox",
    "read-only",
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

// Beendet ausschließlich den eigenen, attemptgebundenen Codex-Kindprozess
// dieses Read-Only-Pfads. Niemals einen fremden Prozess.
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

// ---------------------------------------------------------------------------
// Ausschließlich lesender Analysepfad.
//
// - startet Codex ausschließlich mit Sandbox "read-only",
// - führt NIEMALS ein Testkommando aus,
// - berechnet NIEMALS einen Diff und wendet NIEMALS eine Änderung an,
// - liest das Ergebnis ausschließlich über --output-last-message,
// - lehnt eine leere oder zu große Antwort als sicheren Fehler ab (statt
//   stiller Kürzung),
// - redigiert die Antwort defensiv über redactSecrets, BEVOR sie an den
//   Aufrufer zurückgegeben wird.
// Der Aufrufer (pilot-agent-codex-runner.js) bleibt verantwortlich für
// Workspace-Erzeugung/-Bereinigung, Agentenprompt-Aufbau und die
// Vorher/Nachher-Integritätsprüfung des Workspace.
async function runCodexReadOnlyAnalysis(options = {}) {
  const {
    workspaceDir,
    attemptId = "unknown-attempt",
    prompt,
    forbiddenRoots = [],
    attemptTimeoutMs,
    shouldAbort,
    maxResultChars,
  } = options;

  if (typeof workspaceDir !== "string" || !workspaceDir) {
    throw new Error("Codex-Adapter (Read-Only): workspaceDir fehlt.");
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Codex-Adapter (Read-Only): prompt fehlt.");
  }

  const realpathSyncImpl = options.realpathSyncImpl || fs.realpathSync;
  let resolvedWorkspace;
  try {
    resolvedWorkspace = realpathSyncImpl(workspaceDir);
  } catch (_error) {
    throw new Error("Codex-Adapter (Read-Only): Workspace konnte nicht sicher aufgelöst werden.");
  }
  assertWorkspaceOutsideForbiddenRoots(resolvedWorkspace, forbiddenRoots, realpathSyncImpl);

  const mkdtemp = options.mkdtempSyncImpl || fs.mkdtempSync;
  const mkdir = options.mkdirSyncImpl || fs.mkdirSync;
  // Nur ein hier selbst per mkdtempSync frisch erzeugtes Verzeichnis wird am
  // Ende dieser Funktion automatisch bereinigt (siehe
  // cleanupEmptyOutputDirIfCreatedByUs unten) – ein vom Aufrufer explizit
  // übergebenes outputDir (z. B. in Tests) bleibt davon unberührt.
  const outputDirCreatedByUs = !options.outputDir;
  const outputBaseDir = options.outputDir || mkdtemp(path.join(os.tmpdir(), "codex-ro-out-"));
  mkdir(outputBaseDir, { recursive: true, mode: 0o700 });
  const lastMessagePath = path.join(outputBaseDir, `${attemptId}.last-message.txt`);

  const args = buildReadOnlyCodexArgs({
    workspaceDir: resolvedWorkspace,
    outputLastMessagePath: lastMessagePath,
    prompt,
  });
  const timeoutMs = Number.isFinite(attemptTimeoutMs) ? attemptTimeoutMs : DEFAULT_CODEX_TIMEOUT_MS;
  const execImpl = options.execFileImpl || baseCodexAdapter.spawnFileWithCallback;
  const env = baseCodexAdapter.buildReducedEnv();
  const resultCharLimit = Number.isFinite(maxResultChars) ? maxResultChars : MAX_READ_ONLY_RESULT_CHARS;

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
        // Siehe ausführlicher Kommentar an spawnFileWithCallback in
        // execution-codex-adapter.js: stdin muss sofort geschlossen werden,
        // sonst hängt ein echter Codex-Lauf bis zum Timeout.
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
    // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"), Abschnitt 6:
    // ausschließlich ein hier selbst neu erzeugtes, danach leeres
    // Temp-Verzeichnis wird entfernt – läuft für JEDEN Ausgang (Erfolg,
    // Fehler, Timeout, Cancel) gleichermaßen, siehe
    // cleanupEmptyOutputDirIfCreatedByUs oben.
    if (outputDirCreatedByUs) {
      cleanupEmptyOutputDirIfCreatedByUs(outputBaseDir, options);
    }
  }

  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): `signal` ist
  // ausschließlich dann gesetzt, wenn die (eingefrorene, hier unveränderte)
  // spawnFileWithCallback-Implementierung sie tatsächlich am Fehlerobjekt
  // mitliefert (aktuell nur im Timeout-Fall – siehe execution-codex-adapter.js
  // #spawnFileWithCallback). Für einen regulären Nicht-Null-Exitcode ohne
  // Signal bleibt dieses Feld bewusst `null` ("soweit vorhanden").
  const codexRawOutput = {
    label: "Codex-Ausgabe (Read-Only-Analyse, unverifiziert – kein Fachbefund)",
    exitCode: processResult.exitCode,
    signal: (processResult.error && processResult.error.signal) || null,
    stdoutSample: baseCodexAdapter.redactSecrets(truncate(processResult.stdout, MAX_STDOUT_CHARS)),
    stderrSample: baseCodexAdapter.redactSecrets(truncate(processResult.stderr, MAX_STDERR_CHARS)),
    timedOutAtProcessLevel: processResult.killedByTimeout === true,
  };

  const baseFailure = (errors, extra = {}) => ({
    ok: false,
    failed: true,
    cancelled: false,
    timedOut: false,
    resultText: null,
    secretRedactionApplied: false,
    secretRedactionNotice: null,
    errors,
    reasonCode: null,
    label: CODEX_READ_ONLY_EXECUTOR_LABEL,
    codexRawOutput,
    ...extra,
  });

  if (aborted) {
    return {
      ...baseFailure(["CANCELLED"], { reasonCode: CODEX_READ_ONLY_REASON_CODES.CANCELLED }),
      failed: false,
      cancelled: true,
    };
  }
  if (processResult.spawnError) {
    return baseFailure(["Codex-Prozess konnte nicht gestartet werden."], {
      reasonCode: CODEX_READ_ONLY_REASON_CODES.SPAWN_ERROR,
    });
  }
  if (processResult.killedByTimeout) {
    return baseFailure(["TIMEOUT"], { timedOut: true, reasonCode: CODEX_READ_ONLY_REASON_CODES.TIMEOUT });
  }
  if (processResult.error) {
    // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): statt
    // ausschließlich der knappen, generischen Fehlermeldung des
    // (eingefrorenen) spawnFileWithCallback-Fehlerobjekts ("codex beendete
    // mit Status 1.") wird jetzt ein Fehlertext aus den bereits sicher
    // redigierten/begrenzten Diagnosefeldern (Exit-Code, Signal, stderr-/
    // stdout-Kurzfassung) aufgebaut – siehe buildProcessExitFailureText.
    return baseFailure([buildProcessExitFailureText(codexRawOutput)], {
      reasonCode: CODEX_READ_ONLY_REASON_CODES.PROCESS_EXIT_NONZERO,
    });
  }

  const rawText = String(lastMessageText || "").trim();
  if (!rawText) {
    return baseFailure(["Codex hat keine verwertbare Antwort geliefert (leere Ausgabe)."], {
      reasonCode: CODEX_READ_ONLY_REASON_CODES.EMPTY_RESULT,
    });
  }
  if (rawText.length > resultCharLimit) {
    return baseFailure(
      [`Codex-Antwort überschreitet die maximale sichere Größe (${rawText.length} von maximal ${resultCharLimit} Zeichen).`],
      { reasonCode: CODEX_READ_ONLY_REASON_CODES.RESULT_TOO_LARGE },
    );
  }

  // Korrektur 2: die fachliche Analyseantwort wird über die
  // feldnamen-erhaltende Redaktion dieses Moduls redigiert, NICHT über die
  // eingefrorene, vollständig ersetzende execution-codex-adapter.js#
  // redactSecrets (die bleibt unverändert und wird weiterhin für die rein
  // diagnostischen stdoutSample/stderrSample oben verwendet). Die
  // unredigierte Fassung (rawText) verlässt diese Funktion an keiner Stelle
  // – es gibt keine unredigierte Schattenkopie, weder hier noch in einem
  // Rückgabefeld.
  const redacted = redactSecretValuesPreservingFieldNames(rawText);
  const secretRedactionApplied = redacted !== rawText;
  return {
    ok: true,
    failed: false,
    cancelled: false,
    timedOut: false,
    resultText: redacted,
    secretRedactionApplied,
    secretRedactionNotice: secretRedactionApplied ? SECRET_REDACTION_NOTICE_TEXT : null,
    errors: [],
    label: CODEX_READ_ONLY_EXECUTOR_LABEL,
    codexRawOutput,
  };
}

module.exports = {
  CODEX_READ_ONLY_EXECUTOR_LABEL,
  MAX_READ_ONLY_RESULT_CHARS,
  SECRET_REDACTION_NOTICE_TEXT,
  CODEX_READ_ONLY_REASON_CODES,
  buildReadOnlyCodexArgs,
  redactSecretValuesPreservingFieldNames,
  runCodexReadOnlyAnalysis,
  cancelRun,
  hasActiveProcessForTests,
};
