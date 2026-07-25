"use strict";

// V7.0 Phase C – deterministischer Mock-Executor.
//
// Dieses Modul enthält AUSSCHLIESSLICH deterministische Testausführung:
// - keine KI, kein Modellaufruf, kein Netzwerkzugriff
// - keine freien Shell-Befehle, kein child_process, kein aktiviertes Shell-Flag
// - schreibt ausschließlich Dateien innerhalb des übergebenen isolierten
//   Workspace-Verzeichnisses (niemals außerhalb, niemals in ein Repository)
//
// Der Mock-Executor trifft keine Aussage über echte KI-Arbeit. Er beweist nur,
// dass die Isolations-, Allowlist- und Evidenzmechanik der Execution Bridge
// technisch korrekt funktioniert.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MOCK_EXECUTOR_LABEL =
  "Deterministischer Mock-Executor – technische Sicherheitsprüfung, keine KI-Ausführung.";

const SCENARIOS = Object.freeze({
  SUCCESS: "SUCCESS",
  ALLOWLIST_VIOLATION: "ALLOWLIST_VIOLATION",
  FAILURE: "FAILURE",
  TIMEOUT: "TIMEOUT",
});

const SUPPORTED_SCENARIOS = Object.freeze(Object.values(SCENARIOS));

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeJoinInsideWorkspace(workspaceDir, relativePath) {
  const resolvedWorkspace = path.resolve(workspaceDir);
  const target = path.resolve(resolvedWorkspace, relativePath);
  if (target !== resolvedWorkspace && !target.startsWith(`${resolvedWorkspace}${path.sep}`)) {
    throw new Error(`Mock-Executor: Zielpfad außerhalb des Workspace abgelehnt (${relativePath}).`);
  }
  return target;
}

function readIfExists(absolutePath) {
  try {
    return fs.readFileSync(absolutePath);
  } catch (_error) {
    return null;
  }
}

function deterministicContentFor(attemptId, marker) {
  // Deterministisch bezüglich der Eingaben (attemptId + marker), niemals zufällig
  // und niemals von externen Quellen (Netzwerk, KI) abhängig.
  const hash = crypto.createHash("sha256").update(`${attemptId}:${marker}`).digest("hex").slice(0, 16);
  return [
    "# Mock-Executor Fixture-Notiz",
    "",
    "Diese Datei wurde ausschließlich vom deterministischen Mock-Executor",
    "innerhalb eines isolierten Workspace verändert. Keine KI-Ausführung.",
    "",
    `attemptId: ${attemptId}`,
    `marker: ${marker}`,
    `deterministicHash: ${hash}`,
    "",
  ].join("\n");
}

function diffFileEntry(relativePath, beforeBuffer, afterBuffer) {
  const beforeLines = beforeBuffer ? beforeBuffer.toString("utf8").split(/\r?\n/) : [];
  const afterLines = afterBuffer ? afterBuffer.toString("utf8").split(/\r?\n/) : [];
  return {
    path: relativePath,
    existedBefore: Boolean(beforeBuffer),
    existedAfter: Boolean(afterBuffer),
    beforeHash: beforeBuffer ? sha256(beforeBuffer) : null,
    afterHash: afterBuffer ? sha256(afterBuffer) : null,
    beforeBytes: beforeBuffer ? beforeBuffer.length : 0,
    afterBytes: afterBuffer ? afterBuffer.length : 0,
    linesAdded: Math.max(0, afterLines.length - beforeLines.length),
    linesRemoved: Math.max(0, beforeLines.length - afterLines.length),
  };
}

function assertSupportedScenario(scenario) {
  if (!SUPPORTED_SCENARIOS.includes(scenario)) {
    throw new Error(`Mock-Executor: unbekanntes Szenario "${scenario}".`);
  }
}

/**
 * Führt genau einen deterministischen Mock-Lauf im übergebenen isolierten
 * Workspace aus. Gibt niemals Dateiinhalte zurück – nur strukturierte
 * Metadaten (Pfade, Hashes, Zeilenzahlen).
 *
 * Diese Funktion selbst startet keinen Kindprozess und öffnet keinen Socket.
 */
async function runMockExecutionScenario(options = {}) {
  const {
    workspaceDir,
    allowedFiles = [],
    scenario,
    attemptId = "unknown-attempt",
  } = options;

  assertSupportedScenario(scenario);
  if (typeof workspaceDir !== "string" || !workspaceDir) {
    throw new Error("Mock-Executor: workspaceDir fehlt.");
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error("Mock-Executor: allowedFiles ist erforderlich.");
  }

  if (scenario === SCENARIOS.FAILURE) {
    return {
      ok: false,
      failed: true,
      changedFiles: [],
      diff: [],
      testStatus: "FAILED",
      testExitCode: 1,
      testSummary: "Mock-Executor: simulierter Fehlerfall (kontrollierter Testpfad, keine echte Ausführung).",
      errors: ["Simulierter deterministischer Fehler (Testszenario FAILURE)."],
      label: MOCK_EXECUTOR_LABEL,
    };
  }

  if (scenario === SCENARIOS.TIMEOUT) {
    const timeoutDelayMs = Number.isFinite(options.timeoutDelayMs) ? options.timeoutDelayMs : 3_600_000;
    const shouldAbort =
      typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
    const sliceMs = 25;
    let waited = 0;
    while (waited < timeoutDelayMs) {
      if (shouldAbort()) {
        return {
          ok: false,
          failed: false,
          cancelled: true,
          changedFiles: [],
          diff: [],
          testStatus: null,
          testExitCode: null,
          testSummary: "Mock-Executor: Lauf durch Abbruchsignal beendet.",
          errors: ["CANCELLED"],
          label: MOCK_EXECUTOR_LABEL,
        };
      }
      // Kein unref: Abbruchsignal und Tests müssen den Poll zuverlässig wachhalten.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(sliceMs, timeoutDelayMs - waited));
      });
      waited += sliceMs;
    }
    // Wird in der Praxis selten erreicht, da die Execution Bridge den Lauf per
    // Timeout-Wrapper vorher terminiert. Nur als sicherer Fallback vorhanden.
    return {
      ok: false,
      failed: true,
      changedFiles: [],
      diff: [],
      testStatus: "FAILED",
      testExitCode: 1,
      testSummary: "Mock-Executor: Simulation überschritt das Zeitlimit.",
      errors: ["TIMEOUT"],
      label: MOCK_EXECUTOR_LABEL,
    };
  }

  const targetRelativePath = allowedFiles[0];
  const targetAbsolutePath = safeJoinInsideWorkspace(workspaceDir, targetRelativePath);
  const beforeBuffer = readIfExists(targetAbsolutePath);

  fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(targetAbsolutePath, deterministicContentFor(attemptId, "success"), { mode: 0o600 });
  const afterBuffer = fs.readFileSync(targetAbsolutePath);

  const diff = [diffFileEntry(targetRelativePath, beforeBuffer, afterBuffer)];
  const changedFiles = [targetRelativePath];

  if (scenario === SCENARIOS.ALLOWLIST_VIOLATION) {
    const violationRelativePath = "UNAUTHORIZED_MOCK_CHANGE.txt";
    const violationAbsolutePath = safeJoinInsideWorkspace(workspaceDir, violationRelativePath);
    const violationBefore = readIfExists(violationAbsolutePath);
    fs.writeFileSync(
      violationAbsolutePath,
      deterministicContentFor(attemptId, "allowlist-violation-attempt"),
      { mode: 0o600 },
    );
    const violationAfter = fs.readFileSync(violationAbsolutePath);
    diff.push(diffFileEntry(violationRelativePath, violationBefore, violationAfter));
    changedFiles.push(violationRelativePath);
  }

  return {
    ok: true,
    failed: false,
    changedFiles,
    diff,
    testStatus: "PASSED",
    testExitCode: 0,
    testSummary:
      "Mock-Executor: deterministische Testsimulation grün (kein echter Testlauf, keine echte KI-Ausführung).",
    errors: [],
    label: MOCK_EXECUTOR_LABEL,
  };
}

module.exports = {
  MOCK_EXECUTOR_LABEL,
  SCENARIOS,
  SUPPORTED_SCENARIOS,
  runMockExecutionScenario,
};
