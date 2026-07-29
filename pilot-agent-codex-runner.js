"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Orchestriert genau einen echten, ausschließlich lesenden Codex-Agentenlauf:
//   1. isolierten Read-Only-Workspace erzeugen (pilot-agent-codex-workspace.js),
//   2. einen agentenspezifischen Prompt bauen (agentKey/pilotRole beeinflussen
//      den Auftrag tatsächlich, siehe buildAgentSpecificCodexPrompt),
//   3. Codex im strengsten verfügbaren Read-Only-Sandboxmodus aufrufen
//      (execution-codex-adapter.js#runCodexReadOnlyAnalysis),
//   4. das Ergebnis inhaltlich auf offensichtliche Grenzverletzungen prüfen,
//   5. den Workspace unabhängig vom Ausgang IMMER bereinigen.
//
// Dieses Modul startet selbst keinen Kindprozess (das bleibt ausschließlich
// execution-codex-adapter.js bzw. execution-codex-adapter-readonly.js
// vorbehalten) und trifft keine Freigabeentscheidung (das bleibt
// ausschließlich pilot-agent-execution-service.js vorbehalten, VOR dem
// Aufruf dieses Moduls). Es verändert niemals eine Datei im echten
// Repository, löst niemals einen Commit/Push/Deployment aus und erteilt
// niemals automatisch eine Freigabe.
//
// Bewusste Modultrennung (siehe Abschlussbericht Phase 7, Abschnitt 3):
// execution-codex-adapter.js steht unter einem verbindlichen Freeze eines
// parallelen Arbeitspakets (v71-integration.test.js) und wird von diesem
// Nachtlauf NICHT verändert. detectCodexAvailability bleibt dort (rein
// lesend, unverändert), runCodexReadOnlyAnalysis lebt vollständig separat
// in execution-codex-adapter-readonly.js (neues, eigenständiges Modul).
const codexAvailabilityAdapter = require("./execution-codex-adapter");
const codexReadOnlyAdapter = require("./execution-codex-adapter-readonly");
const workspaceModule = require("./pilot-agent-codex-workspace");

const RUNNER_ID = "codex-read-only-analysis";
const RUNNER_LABEL =
  "Codex – echter, isolierter Read-Only-KI-Agentenlauf (Netzwerk-/Modellzugriff über die lokale Codex-CLI, kein Dateizugriff schreibend).";

// Phase 7, Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): bisher
// wurden bei einem fehlgeschlagenen CODEX_READ_ONLY-Lauf ausschließlich die
// zusammengefassten Fehlertexte (adapterResult.errors) durchgereicht – die
// bereits im Read-Only-Adapter vorhandenen sicheren Diagnosefelder
// (codexRawOutput: exitCode/signal/stdoutSample/stderrSample) wurden an
// dieser Stelle verworfen. `diagnostics` bündelt jetzt für JEDEN
// Fehler-/Abbruchpfad dieses Runners (Workspace-Erzeugung, Codex-Prozess,
// Workspace-Integritätsprüfung, Inhaltsprüfung) eine einheitliche, sichere,
// bereits redigierte/begrenzte Diagnosestruktur – niemals Prompttext, nie
// einen Freigabe-Token, nie vollständige Rohdaten.
const CODEX_RUNNER_REASON_CODES = Object.freeze({
  WORKSPACE_CREATE_FAILED: "WORKSPACE_CREATE_FAILED",
  WORKSPACE_CHANGED: "WORKSPACE_CHANGED",
  FORBIDDEN_ACTION_CLAIMED: "FORBIDDEN_ACTION_CLAIMED",
});

// Grobe, aber eindeutige technische Phase innerhalb dieses Runners – "soweit
// eindeutig" (siehe Auftrag Abschnitt 1): keine feingranulare Zeitachse,
// sondern die vier klar unterscheidbaren Runner-Schritte aus dem
// Kopfkommentar oben (Workspace erzeugen -> Codex aufrufen -> Ergebnis
// prüfen -> Cleanup).
function runnerPhaseForReasonCode(reasonCode) {
  switch (reasonCode) {
    case "WORKSPACE_CREATE_FAILED":
      return "WORKSPACE_SETUP";
    case "WORKSPACE_CHANGED":
      return "WORKSPACE_INTEGRITY_CHECK";
    case "FORBIDDEN_ACTION_CLAIMED":
      return "CONTENT_SAFETY_CHECK";
    case "EMPTY_RESULT":
    case "RESULT_TOO_LARGE":
      return "RESULT_VALIDATION";
    case "SPAWN_ERROR":
    case "TIMEOUT":
    case "CODEX_PROCESS_EXIT_NONZERO":
    case "CANCELLED":
      return "CODEX_PROCESS";
    default:
      return "UNKNOWN";
  }
}

// Bewusst kleiner als die bereits im Read-Only-Adapter angewendeten
// Größenlimits (siehe execution-codex-adapter-readonly.js#MAX_STDOUT_CHARS/
// MAX_STDERR_CHARS) – diese zweite, unabhängige Begrenzung stellt sicher,
// dass eine an dieser Stelle gespeicherte Diagnosekopie (resultSummaryJson)
// unabhängig von einer künftigen Änderung des Adapters knapp bleibt.
const MAX_DIAGNOSTIC_SAMPLE_CHARS = 1000;
function boundDiagnosticSample(text) {
  if (text === null || text === undefined) return null;
  const normalized = String(text);
  if (!normalized) return null;
  return normalized.length > MAX_DIAGNOSTIC_SAMPLE_CHARS
    ? `${normalized.slice(0, MAX_DIAGNOSTIC_SAMPLE_CHARS)}…`
    : normalized;
}

// Extrahiert die sicheren Diagnosefelder aus einem Read-Only-Adapter-Ergebnis
// (siehe execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis). Fällt
// defensiv auf null/false zurück, wenn codexRawOutput fehlt (z. B. ein in
// Tests injiziertes, absichtlich einfaches Fake-Double ohne dieses Feld) –
// niemals ein Absturz durch ein fehlendes optionales Diagnosefeld.
function buildDiagnosticsFromAdapterResult(adapterResult) {
  const raw = (adapterResult && adapterResult.codexRawOutput) || null;
  const reasonCode = (adapterResult && adapterResult.reasonCode) || null;
  return {
    reasonCode,
    runnerPhase: runnerPhaseForReasonCode(reasonCode),
    exitCode: raw && raw.exitCode !== undefined ? raw.exitCode : null,
    signal: raw ? raw.signal || null : null,
    stderrSample: raw ? boundDiagnosticSample(raw.stderrSample) : null,
    stdoutSample: raw ? boundDiagnosticSample(raw.stdoutSample) : null,
    timedOut: Boolean(adapterResult && adapterResult.timedOut),
    cancelled: Boolean(adapterResult && adapterResult.cancelled),
  };
}

// Für Fehlerpfade, die VOR bzw. UNABHÄNGIG vom eigentlichen Codex-Prozess
// auftreten (Workspace-Erzeugung, Workspace-Integritätsprüfung,
// Inhaltsprüfung) – hier existiert kein codexRawOutput, exitCode/signal
// bleiben deshalb bewusst null.
function buildDiagnosticsForReasonCode(reasonCode, extra = {}) {
  return {
    reasonCode,
    runnerPhase: runnerPhaseForReasonCode(reasonCode),
    exitCode: null,
    signal: null,
    stderrSample: null,
    stdoutSample: null,
    timedOut: false,
    cancelled: false,
    ...extra,
  };
}

// Schwerpunkt 8 ("Ergebnisprüfung") – Korrekturlauf vor dem echten
// Referenzlauf (unabhängiges Review, Kategorie B, Korrektur 1): die vorige
// Version dieser Heuristik verwarf zulässige Aussagen fälschlich als
// Verstoß (u. a. "Ich habe nichts geändert.", jede bloße Erwähnung von
// "git commit"/"git push"/"npm install" in einer Empfehlung, Erklärungen
// über spätere manuelle Schritte) und ließ gleichzeitig eine tatsächliche
// englische Erfolgsbehauptung ("I modified the file and committed it.")
// unerkannt durch. Die neue Version bleibt bewusst eine kleine,
// nachvollziehbare Satzheuristik (keine NLP-Bibliothek, kein Modellaufruf):
//   1. Text in doppelten/typografischen/„…"-Anführungszeichen wird vor der
//      Prüfung entfernt (ein Zitat ist keine eigene Behauptung von Codex).
//   2. Der verbleibende Text wird in einzelne Sätze zerlegt.
//   3. Ein Satz mit einer Negation ("nicht", "nichts", "not", "did not", …)
//      ODER mit Empfehlungs-/Hypothese-Sprache ("sollte", "empfohlen",
//      "could", "recommend", "würde", "falls", …) gilt NIEMALS als Verstoß
//      – auch dann nicht, wenn er zusätzlich einen Aktionsbegriff enthält.
//   4. Nur ein Satz mit einer tatsächlichen Ich-/Wir-Erfolgsbehauptung (oder
//      einer unpersönlichen "Datei/Änderung wurde … durchgeführt"-Behauptung)
//      über Dateiänderung, Commit, Push, Installation oder Deployment gilt
//      als Verstoß – eine bloße Erwähnung des Begriffs allein genügt nicht
//      mehr.
// Bewusste, dokumentierte Grenze: die Negations-/Empfehlungsprüfung wirkt
// auf den GESAMTEN Satz, nicht nur auf die unmittelbare Umgebung des
// Aktionsbegriffs – ein künstlich konstruierter Satz wie "Ich habe die
// Datei geändert, aber das sollte ich nicht tun" würde dadurch fälschlich
// als unbedenklich gelten. Dieses Restrisiko ist bewusst in Kauf genommen
// (siehe Auftrag: "keine überkomplexe NLP-Schicht bauen") und wird durch
// die unabhängige, hiervon völlig getrennte Workspace-Integritätsprüfung
// (verifyWorkspaceUnchanged) abgesichert, die eine tatsächliche
// Dateiänderung ohnehin unabhängig von jeder Textbehauptung erkennt.
function stripQuotedSegments(text) {
  return String(text)
    .replace(/"[^"]*"/g, " ")
    .replace(/„[^"]*"/g, " ")
    .replace(/“[^”]*”/g, " ");
}

function splitIntoSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// Negation – deckt sowohl "Ich habe nichts geändert." als auch
// "I did not modify anything."/"I haven't pushed anything." ab.
const NEGATION_MARKER_PATTERN =
  /\b(nicht|nichts|kein|keine|keinerlei|niemals|not|never|nothing|didn't|did not|doesn't|does not|haven't|have not|hasn't|has not|won't|will not)\b/i;

// Empfehlung/Hypothese – deckt sowohl "Empfehlung: … git commit …" als auch
// "I would recommend running npm install …"/"This should be committed by a
// human reviewer." ab. "could"/"would"/"should"/"may"/"might" gelten
// bewusst IMMER als Empfehlungs-/Hypothesesprache, unabhängig vom Kontext.
const RECOMMENDATION_OR_HYPOTHETICAL_MARKER_PATTERN =
  /\b(empfehl\w*|vorschlag\w*|sollte\w*|könnte\w*|koennte\w*|müsste\w*|muesste\w*|würde\w*|wuerde\w*|falls|wenn\s+(ich|man|jemand)|angenommen|recommend\w*|suggest\w*|should|could|would|might|may|consider\w*|hypothetical\w*|if\s+i\s+(were|had|would))\b/i;

// Tatsächliche Erfolgsbehauptung über eine verbotene Aktion – nur diese
// Muster gelten als Verstoß, NIE eine bloße Erwähnung des Begriffs.
const ACTION_CLAIM_PATTERNS = Object.freeze([
  // Deutsch, Ich-/Wir-Form: "Ich habe … geändert/committed/gepusht/installiert/…"
  /\b(ich|wir)\s+habe(n)?\b[^.\n]{0,60}\b(geändert|geaendert|gespeichert|geschrieben|übernommen|uebernommen|angewendet|committ?ed|gepusht|installiert|gelöscht|geloescht|deployed|bereitgestellt|hochgeladen|veröffentlicht|veroeffentlicht)\b/i,
  // Deutsch, unpersönlich: "Datei(en) wurde(n) … geändert/überschrieben/gelöscht/angewendet"
  /\bdatei(en)?\s+(wurden?|habe ich|haben wir)\s+(erfolgreich\s+)?(geändert|geaendert|überschrieben|ueberschrieben|gelöscht|geloescht|angewendet)\b/i,
  // Deutsch, unpersönlich: "Änderung/Commit/Push/Installation/Deployment wurde … durchgeführt/abgeschlossen"
  /\b(änderung|aenderung|commit|push|installation|deployment)\s+(wurde|ist)\s+(erfolgreich\s+)?(durchgeführt|durchgefuehrt|angewendet|abgeschlossen|erfolgt)\b/i,
  // Englisch, I/we-Form: "I (have) (successfully) modified/committed/pushed/installed/deployed …"
  /\b(i|we)['’]?\s*(have\s+)?(successfully\s+)?(modified|changed|edited|updated|overwritten|deleted|removed|committed|pushed|installed|deployed|applied|wrote|saved)\b/i,
  // Englisch, unpersönlich: "file(s)/change(s) has/have been … modified/applied/deleted"
  /\b(file|files|change|changes)\s+(has|have)\s+been\s+(successfully\s+)?(modified|changed|updated|overwritten|deleted|removed|applied|committed|pushed|installed|deployed)\b/i,
]);

function detectClaimedForbiddenAction(resultText) {
  if (typeof resultText !== "string" || !resultText.trim()) return false;
  const withoutQuotes = stripQuotedSegments(resultText);
  const sentences = splitIntoSentences(withoutQuotes);
  return sentences.some((sentence) => {
    if (NEGATION_MARKER_PATTERN.test(sentence)) return false;
    if (RECOMMENDATION_OR_HYPOTHETICAL_MARKER_PATTERN.test(sentence)) return false;
    return ACTION_CLAIM_PATTERNS.some((pattern) => pattern.test(sentence));
  });
}

// Baut den Codex-Auftrag ausschließlich aus bereits serverseitig fest
// definierten, sicheren Werten (Preset aus pilot-agent-execution-service.js) –
// niemals aus einer freien Browsereingabe (siehe execution-codex-adapter.js
// Kopfkommentar, "kein freier Systemprompt aus dem Browser"). agentKey und
// pilotRole beeinflussen den Auftrag hier erstmals tatsächlich inhaltlich
// (Schwerpunkt 4), anders als der rein lokale, rollenunabhängige
// deterministische Runner (pilot-agent-runner.js).
function buildAgentSpecificCodexPrompt({
  agentKey,
  agentDisplayName,
  agentRole,
  pilotRole,
  pilotRoleLabel,
  taskTitle,
  taskInstructions,
  allowedFiles,
  allowedTools,
  forbiddenActions,
  expectedResultFormat,
}) {
  return [
    `Du bist der bestehende, bereits im kanonischen Agentenregister eingetragene "${agentDisplayName}" (technische ID: ${agentKey}).`,
    `Fachliche Rolle laut Register: ${agentRole}.`,
    `Im Pilotbetrieb der KI-Unternehmenszentrale trittst du in der Rolle "${pilotRoleLabel}" (${pilotRole}) auf.`,
    "",
    `Auftragstitel: ${taskTitle}`,
    `Konkrete Aufgabe: ${taskInstructions}`,
    "",
    "Workspace-Hinweis: Du arbeitest ausschließlich im aktuellen Arbeitsverzeichnis. Es ist NICHT das echte Repository, " +
      "sondern eine isolierte, ausschließlich lesende Kopie außerhalb jedes echten Repositories.",
    `Erlaubte Dateien (ausschließlich diese darfst du lesen, alle bereits in diesem Workspace vorhanden): ${allowedFiles.join(", ")}`,
    `Erlaubte Werkzeuge: ${allowedTools.join(", ")}`,
    `Verbotene Aktionen: ${forbiddenActions.join(", ")}.`,
    "",
    "Verbindliche Sicherheitsgrenzen:",
    "- Ausschließlich lesen und analysieren. Keine Dateiänderung, keine neue Datei, kein Löschen.",
    "- Kein Commit, kein Push, kein Deployment, keine Installation, keine Netzwerkaktion außer diesem einen Antwortkanal.",
    "- Keine unaufgeforderten Dateien lesen (auch keine .git-, .env- oder sonstigen Konfigurationsdateien).",
    "- Keine Secrets, Zugangsdaten oder Tokens ausgeben, auch nicht, wenn du glaubst, sie in einer Datei gesehen zu haben.",
    "- Liefere dein Ergebnis ausschließlich als Textantwort. Du hast keine Möglichkeit, etwas anzuwenden oder zu speichern " +
      "– jeder Versuch, eine Datei zu ändern, wird von der Zentrale unabhängig geprüft und verworfen.",
    "",
    `Gewünschtes Ergebnisformat: ${expectedResultFormat}`,
    "Qualitätskriterien: sachlich, konkret, ausschließlich auf Basis der tatsächlich gelesenen Dateien – keine Vermutung " +
      "über nicht gelesene Inhalte, keine erfundenen Dateinamen oder Funktionen.",
    "Ein Erfolgsanspruch von dir ist keine Abnahme – die Zentrale prüft dein Ergebnis eigenständig, bevor es übernommen wird.",
  ].join("\n");
}

// Führt genau einen echten, isolierten Read-Only-Codex-Agentenlauf aus.
// input:
//   repoRoot, allowedFiles, allowedTools, forbiddenActions, taskTitle,
//   taskInstructions, expectedResultFormat, agentKey, agentDisplayName,
//   agentRole, pilotRole, pilotRoleLabel, executionRunId, attemptTimeoutMs,
//   shouldAbort
// Testinjektion (niemals im Produktivpfad verwendet):
//   codexAdapterImpl, workspaceModuleImpl
async function runPilotAgentCodexAnalysisTask(input = {}) {
  const {
    repoRoot,
    allowedFiles,
    allowedTools,
    forbiddenActions,
    taskTitle,
    taskInstructions,
    expectedResultFormat,
    agentKey,
    agentDisplayName,
    agentRole,
    pilotRole,
    pilotRoleLabel,
    executionRunId,
    attemptTimeoutMs,
    shouldAbort,
  } = input;

  if (typeof repoRoot !== "string" || !repoRoot) {
    throw new Error("pilot-agent-codex-runner: repoRoot fehlt.");
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error("pilot-agent-codex-runner: allowedFiles ist erforderlich und darf nicht leer sein.");
  }
  if (typeof executionRunId !== "string" || !executionRunId.trim()) {
    throw new Error("pilot-agent-codex-runner: executionRunId fehlt.");
  }

  // Ein einziges injizierbares Test-Double deckt beide Methoden ab (siehe
  // pilot-agent-codex-runner.test.js#makeFakeCodexAdapter), obwohl die
  // beiden Methoden im Produktivbetrieb aus zwei getrennten, unveränderten
  // Modulen stammen (siehe Kommentar oben zur Modultrennung).
  const adapter = input.codexAdapterImpl || {
    detectCodexAvailability: codexAvailabilityAdapter.detectCodexAvailability,
    runCodexReadOnlyAnalysis: codexReadOnlyAdapter.runCodexReadOnlyAnalysis,
  };
  const workspaceApi = input.workspaceModuleImpl || workspaceModule;

  let workspace = null;
  try {
    workspace = workspaceApi.createIsolatedReadOnlyWorkspace({
      sourceRoot: repoRoot,
      allowedFiles,
      executionRunId,
      forbiddenRoots: [repoRoot],
      mkdtempSyncImpl: input.mkdtempSyncImpl,
      mkdirSyncImpl: input.mkdirSyncImpl,
      realpathSyncImpl: input.realpathSyncImpl,
      existsSyncImpl: input.existsSyncImpl,
      statSyncImpl: input.statSyncImpl,
      readFileSyncImpl: input.readFileSyncImpl,
      writeFileSyncImpl: input.writeFileSyncImpl,
      // Korrektur 7: dieselbe Injektion wie im finally-Cleanup unten, damit
      // ein Cleanup-Fehler BEIM Erzeugungsfehler ebenfalls getestet werden
      // kann (siehe pilot-agent-codex-workspace.test.js).
      rmSyncImpl: input.rmSyncImpl,
    });
  } catch (error) {
    // Korrektur 7: ein zusätzlicher Cleanup-Fehler beim Erzeugungsfehler
    // (siehe pilot-agent-codex-workspace.js#createIsolatedReadOnlyWorkspace)
    // verschleiert niemals den ursprünglichen Sicherheitsfehler, bleibt aber
    // als sichere Zusatzinformation nachvollziehbar (kein Fachinhalt/Secret,
    // ausschließlich Fehlertext + temporärer Pfad).
    const cleanupHint = error && error.workspaceCleanupError
      ? ` (zusätzlich: Bereinigung des teilweise angelegten Workspace ${error.workspaceDirLeftBehind || ""} schlug fehl: ${error.workspaceCleanupError})`
      : "";
    return {
      ok: false,
      failed: true,
      cancelled: false,
      timedOut: false,
      errorMessage: `Isolierter Read-Only-Workspace konnte nicht erstellt werden: ${String((error && error.message) || error)}${cleanupHint}`,
      diagnostics: buildDiagnosticsForReasonCode(CODEX_RUNNER_REASON_CODES.WORKSPACE_CREATE_FAILED),
      resultText: null,
      workspaceId: null,
      runnerVersion: null,
      modelLabel: null,
    };
  }

  try {
    const prompt = buildAgentSpecificCodexPrompt({
      agentKey,
      agentDisplayName,
      agentRole,
      pilotRole,
      pilotRoleLabel,
      taskTitle,
      taskInstructions,
      allowedFiles,
      allowedTools,
      forbiddenActions,
      expectedResultFormat,
    });

    const availability =
      input.codexAvailability ||
      adapter.detectCodexAvailability({
        execFileSyncImpl: input.execFileSyncImpl,
        forceRefresh: input.forceRefreshCodexAvailability,
      });

    const adapterResult = await adapter.runCodexReadOnlyAnalysis({
      workspaceDir: workspace.workspaceDir,
      attemptId: executionRunId,
      prompt,
      forbiddenRoots: [repoRoot],
      attemptTimeoutMs,
      shouldAbort,
      execFileImpl: input.execFileImpl,
      realpathSyncImpl: input.realpathSyncImpl,
      mkdtempSyncImpl: input.mkdtempSyncImpl,
      mkdirSyncImpl: input.mkdirSyncImpl,
      existsSyncImpl: input.existsSyncImpl,
      readFileSyncImpl: input.readFileSyncImpl,
      unlinkSyncImpl: input.unlinkSyncImpl,
    });

    // Unabhängige zweite Integritätsprüfung – siehe
    // pilot-agent-codex-workspace.js Kopfkommentar. Läuft auch nach einem
    // fehlgeschlagenen/abgebrochenen Codex-Aufruf, da selbst ein
    // fehlgeschlagener Prozess theoretisch etwas geschrieben haben könnte,
    // bevor er fehlschlug.
    const changedPaths = workspaceApi.verifyWorkspaceUnchanged(workspace.workspaceDir, workspace.baselineHashes, {
      readFileSyncImpl: input.readFileSyncImpl,
      existsSyncImpl: input.existsSyncImpl,
      readdirSyncImpl: input.readdirSyncImpl,
    });
    if (changedPaths.length > 0) {
      return {
        ok: false,
        failed: true,
        cancelled: false,
        timedOut: false,
        errorMessage:
          `Sicherheitsbefund: der Read-Only-Workspace wurde unerwartet verändert (${changedPaths.join("; ")}). ` +
          "Das Ergebnis wird verworfen, kein Repository wurde dadurch berührt (der Workspace lag vollständig außerhalb).",
        // Ein technischer Codex-Prozessbefund kann trotzdem vorliegen (der
        // Prozess kann vor der hier erkannten Manipulation reguär beendet
        // sein) – wird best-effort mit übernommen, ändert aber nichts am
        // WORKSPACE_CHANGED-Befund selbst.
        diagnostics: {
          ...buildDiagnosticsFromAdapterResult(adapterResult),
          reasonCode: CODEX_RUNNER_REASON_CODES.WORKSPACE_CHANGED,
          runnerPhase: runnerPhaseForReasonCode(CODEX_RUNNER_REASON_CODES.WORKSPACE_CHANGED),
        },
        resultText: null,
        workspaceId: workspace.workspaceId,
        runnerVersion: availability && availability.version ? availability.version : null,
        modelLabel: availability && availability.authLabel ? `Codex (${availability.authLabel})` : "Codex",
      };
    }

    if (adapterResult.cancelled) {
      return {
        ok: false,
        failed: false,
        cancelled: true,
        timedOut: false,
        errorMessage: "Lauf wurde durch ein Abbruchsignal beendet (CANCELLED).",
        diagnostics: buildDiagnosticsFromAdapterResult(adapterResult),
        resultText: null,
        workspaceId: workspace.workspaceId,
        runnerVersion: availability && availability.version ? availability.version : null,
        modelLabel: availability && availability.authLabel ? `Codex (${availability.authLabel})` : "Codex",
      };
    }
    if (!adapterResult.ok) {
      // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): errorMessage
      // stammt weiterhin aus adapterResult.errors – der Read-Only-Adapter baut
      // diesen Text bereits sicher aus exitCode/Signal/stderr-/stdout-Kurzfassung
      // auf (siehe execution-codex-adapter-readonly.js#buildProcessExitFailureText).
      // NEU ist ausschließlich `diagnostics`: die bisher an dieser Stelle
      // verworfenen strukturierten Felder (exitCode/signal/reasonCode/
      // stderrSample/stdoutSample/timedOut/cancelled) erreichen jetzt den
      // Service und damit Persistenz/Audit/API/Cockpit.
      return {
        ok: false,
        failed: true,
        cancelled: false,
        timedOut: Boolean(adapterResult.timedOut),
        errorMessage: (adapterResult.errors || []).join("; ") || "Codex-Lauf ist technisch fehlgeschlagen.",
        diagnostics: buildDiagnosticsFromAdapterResult(adapterResult),
        resultText: null,
        workspaceId: workspace.workspaceId,
        runnerVersion: availability && availability.version ? availability.version : null,
        modelLabel: availability && availability.authLabel ? `Codex (${availability.authLabel})` : "Codex",
      };
    }

    // Schwerpunkt 8: einfache, gezielte Inhaltsprüfung gegen die
    // offensichtlichsten Grenzverletzungen (behauptete Schreib-/Commit-/
    // Installationsaktionen). Keine umfassende Moderation.
    if (detectClaimedForbiddenAction(adapterResult.resultText)) {
      return {
        ok: false,
        failed: true,
        cancelled: false,
        timedOut: false,
        errorMessage:
          "Sicherheitsbefund: die Codex-Antwort behauptet eine verbotene Aktion (Dateiänderung/Commit/Push/Installation). " +
          "Dies ist bei einem echten Read-Only-Lauf immer ein Fehler – das Ergebnis wird abgelehnt.",
        diagnostics: {
          ...buildDiagnosticsFromAdapterResult(adapterResult),
          reasonCode: CODEX_RUNNER_REASON_CODES.FORBIDDEN_ACTION_CLAIMED,
          runnerPhase: runnerPhaseForReasonCode(CODEX_RUNNER_REASON_CODES.FORBIDDEN_ACTION_CLAIMED),
        },
        resultText: null,
        workspaceId: workspace.workspaceId,
        runnerVersion: availability && availability.version ? availability.version : null,
        modelLabel: availability && availability.authLabel ? `Codex (${availability.authLabel})` : "Codex",
      };
    }

    return {
      ok: true,
      failed: false,
      cancelled: false,
      timedOut: false,
      errorMessage: null,
      resultText: adapterResult.resultText,
      secretRedactionApplied: Boolean(adapterResult.secretRedactionApplied),
      // Korrektur 2: fester, für Run-Metadaten/Cockpit gedachter Hinweistext
      // – nur gesetzt, wenn tatsächlich redigiert wurde (siehe
      // execution-codex-adapter-readonly.js#SECRET_REDACTION_NOTICE_TEXT).
      secretRedactionNotice: adapterResult.secretRedactionNotice || null,
      analyzedFiles: workspace.copiedFiles,
      workspaceId: workspace.workspaceId,
      runnerVersion: availability && availability.version ? availability.version : null,
      modelLabel: availability && availability.authLabel ? `Codex (${availability.authLabel})` : "Codex",
    };
  } finally {
    // Bereinigung IMMER, unabhängig von Erfolg/Fehler/Timeout/Cancel/Exception
    // (Schwerpunkt 2/10: "Cleanup erfolgt bei Erfolg."/"Cleanup erfolgt bei Fehler.").
    workspaceApi.cleanupWorkspace(workspace.workspaceDir, { rmSyncImpl: input.rmSyncImpl });
  }
}

module.exports = {
  RUNNER_ID,
  RUNNER_LABEL,
  CODEX_RUNNER_REASON_CODES,
  buildAgentSpecificCodexPrompt,
  detectClaimedForbiddenAction,
  runPilotAgentCodexAnalysisTask,
};
