"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 6 ("technische
// Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner").
//
// Ehrliche Einordnung: KEIN echter KI-Agentenlauf, kein Codex-Aufruf, kein
// Netzwerk. Verbindet den bestehenden Pilotauftrags-/Statusmaschinen-/PM-Filter-Kern
// (pilot-work-order-service.js) mit einem tatsächlich aufgerufenen,
// lokalen Runner (pilot-agent-runner.js) für genau eine der drei
// bestehenden Pilotrollen. Dieses Modul führt NIEMALS eine externe Aktion
// aus (kein Commit, kein Push, kein Deployment, keine Netzwerkanfrage) und
// erweitert NIEMALS das kanonische 25-Agenten-Register.
//
// Architekturentscheidung (siehe Abschlussbericht Phase 6, Abschnitt 3):
// execution-bridge.js wird bewusst NICHT wiederverwendet. Sie ist auf
// isolierte, dateiverändernde Code-Ausführung mit Workspace-Materialisierung,
// Diff und Apply-Gate gegen Health/Fixture-Projekte zugeschnitten. Ein
// Pilot-Agentenlauf in dieser Phase erzeugt dagegen ein rein lesendes,
// strukturiertes TEXT-Ergebnis – keine Datei wird verändert. Für diese aus
// dem Auftrag vorgegebene Aufgabenart ("ausschließlich lesender Zugriff …
// strukturiertes textliches Ergebnis") ist die Bridge nicht die passende
// Abstraktion; ihre wiederverwendbaren Prinzipien (serverseitig geprüfte
// Grenzen, ein aktiver Lauf gleichzeitig, Audit jeder Statusänderung) werden
// hier jedoch bewusst identisch nachgebildet.
//
// Ein Agentenlauf ist eine rein technische Ausführungseinheit, getrennt von
// der fachlichen Pilotauftrags-Statusmaschine (siehe Migration 20,
// PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES). Er verändert den fachlichen
// Auftragsstatus niemals selbst – ausschließlich das bereits bestehende,
// unveränderte submitHandoff() (inklusive Projektmanager-Filter) kann das
// tun, und auch das nur nach den bereits bestehenden Regeln (z. B. BLOCKED
// bei verbotener Aktion).

const crypto = require("crypto");

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const pilotWorkOrderService = require("./pilot-work-order-service");
const runner = require("./pilot-agent-runner");

class PilotAgentExecutionError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "PilotAgentExecutionError";
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : null;
  }
}
function badRequest(message, details) {
  return new PilotAgentExecutionError(message, 400, details);
}
function notFound(message, details) {
  return new PilotAgentExecutionError(message, 404, details);
}
function conflict(message, details) {
  return new PilotAgentExecutionError(message, 409, details);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

// Repository-Wurzel: exakt dieses Projektverzeichnis (die Zentrale selbst),
// niemals das Health-Repository. pilot-agent-runner.js#assertSafeRelativeFilePath
// verhindert zusätzlich jede Traversierung/Symlink-Flucht über die Wurzel
// hinaus.
const REPO_ROOT = __dirname;

// ---------------------------------------------------------------------------
// Serverautoritative Aufgaben-Presets (gleiches Prinzip wie
// execution-codex-adapter.js#CODEX_TASK_PRESETS): allowedFiles/allowedTools/
// forbiddenActions kommen ausschließlich aus einem hier fest definierten
// Preset, NIEMALS aus einer freien Eingabe des Aufrufers. Ein Agent kann sich
// dadurch niemals allein durch seine Rolle zusätzliche Rechte verschaffen.
// ---------------------------------------------------------------------------
const PILOT_AGENT_TASK_PRESETS = Object.freeze({
  "analyze-pilot-structure": Object.freeze({
    presetId: "analyze-pilot-structure",
    pilotRole: "RECHERCHE_ANALYSE",
    // Rollenübergabe-Richtung nach erfolgreichem Lauf: entspricht exakt dem
    // bereits bestehenden, etablierten Muster "Recherche/Analyse liefert an
    // Dokumentation" (siehe pilot-work-order.test.js).
    handoffFromPilotRole: "RECHERCHE_ANALYSE",
    handoffToPilotRole: "DOKUMENTATION",
    title: "Technische Pilotstruktur analysieren",
    instructions:
      "Erstelle eine kompakte, sachliche Bestandsaufnahme der vorhandenen Pilot-Auftragsstruktur mit drei " +
      "belegbaren Beobachtungen und einer klaren Empfehlung für den nächsten technischen Schritt. Ausschließlich " +
      "lesender Zugriff auf die unten genannten, bereits vorhandenen Projektdateien.",
    allowedFiles: Object.freeze(["pilot-work-order-service.js", "pilot-work-order-routes.js", "pilot-agent-runner.js"]),
    allowedTools: Object.freeze(["Lesen (read-only Repository-Zugriff)", "Strukturierte Textausgabe"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "externe Netzwerkanfragen",
      "Health-Projekt lesen oder verändern",
      "neue Abhängigkeiten installieren",
      "Prozesse außerhalb des Projekts verändern",
    ]),
    expectedResultFormat: "Titel, drei belegbare Beobachtungen, eine Empfehlung – strukturierter Text.",
  }),
});

function requireKnownPreset(presetId) {
  const preset = PILOT_AGENT_TASK_PRESETS[presetId];
  if (!preset) {
    throw badRequest("Unbekannte oder fehlende Agentenauftrags-Preset-ID.");
  }
  return preset;
}

// Korrekturlauf vor Commit (Korrektur 4, "Agentenidentität ehrlich
// darstellen"): agentKey/pilotRole sind derzeit REINE Laufmetadaten. Sie
// legen fest, WER (welcher bereits bestehende kanonische Agent) fachlich
// für die Rolle verantwortlich gezeichnet ist und WOHIN die Rollenübergabe
// nach einem Erfolg geht – der deterministische Runner (pilot-agent-runner.js)
// selbst liest diese Werte nirgends und verhält sich für jede Rolle
// IDENTISCH: exakt dieselben Dateikennzahlen (Byte-/Zeilenzahl, SHA-256,
// Funktions-/Exportzahl) unabhängig davon, welcher Agent/welche Rolle den
// Lauf gestartet hat. Die Rolle beeinflusst das Runner-Ergebnis also NICHT.
// Echte, rollenspezifische Semantik (z. B. unterschiedliche Analyseschritte
// je nach Agent) folgt erst mit einer künftigen KI-/Modellanbindung und ist
// NICHT Teil dieses Korrekturlaufs. Die bestehende Zuordnung
// RECHERCHE_ANALYSE → product-agent (aus Phase 1, pilot-work-order-service.js)
// bleibt unverändert; keine neue Agentenrolle, keine Registry-Änderung.
function resolveAgentForRole(pilotRole) {
  const agent = pilotWorkOrderService.PILOT_TEAM.find((entry) => entry.pilotRole === pilotRole);
  if (!agent) {
    throw new Error(`pilot-agent-execution-service: unbekannte Pilotrolle "${pilotRole}".`);
  }
  return agent;
}

function isUniqueConstraintViolation(error) {
  const code = String((error && error.code) || "");
  const message = String((error && error.message) || "");
  return code.startsWith("SQLITE_CONSTRAINT") || /UNIQUE constraint failed/i.test(message);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function rowToAgentExecutionRunView(row) {
  if (!row) return null;
  let resultSummary = null;
  try {
    resultSummary = row.resultSummaryJson ? JSON.parse(row.resultSummaryJson) : null;
  } catch (_error) {
    resultSummary = null;
  }
  return {
    id: row.id,
    pilotOrderId: row.pilotOrderId,
    pilotOrderRevisionAtStart: row.pilotOrderRevisionAtStart,
    presetId: row.presetId,
    pilotRole: row.pilotRole,
    agentKey: row.agentKey,
    taskTitle: row.taskTitle,
    taskInstructions: row.taskInstructions,
    allowedFiles: JSON.parse(row.allowedFilesJson),
    allowedTools: JSON.parse(row.allowedToolsJson),
    forbiddenActions: JSON.parse(row.forbiddenActionsJson),
    expectedResultFormat: row.expectedResultFormat,
    runnerId: row.runnerId,
    runnerLabel: row.runnerLabel,
    status: row.status,
    resultSummary,
    resultRawText: row.resultRawText,
    errorMessage: row.errorMessage,
    // Korrekturlauf vor Commit (Migration 21): Stufe B (fachliche
    // Rollenübergabe) ist strikt getrennt vom Runstatus. Ein
    // handoffStatus === "FAILED" bedeutet AUSDRÜCKLICH keinen technischen
    // Runner-Fehler – status bleibt in diesem Fall SUCCEEDED, das Ergebnis
    // (resultRawText/resultSummary) bleibt vollständig gültig und lesbar.
    handoffStatus: row.handoffStatus || "PENDING",
    handoffErrorMessage: row.handoffErrorMessage || null,
    handoffCompletedAt: row.handoffCompletedAt || null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}

function listAgentExecutionRunsForOrder(db, pilotOrderId) {
  return authDb.listPilotAgentExecutionRunsForOrder(db, pilotOrderId).map(rowToAgentExecutionRunView);
}

function getAgentExecutionRunById(db, pilotOrderId, runId) {
  const row = authDb.getPilotAgentExecutionRunById(db, runId);
  if (!row || row.pilotOrderId !== pilotOrderId) {
    throw notFound(`Der Agentenlauf "${runId}" wurde für diesen Pilotauftrag nicht gefunden.`, {
      pilotOrderId,
    });
  }
  return rowToAgentExecutionRunView(row);
}

// ---------------------------------------------------------------------------
// Start eines technischen Agentenlaufs (lokaler deterministischer
// Read-Only-Runner, kein KI-Modellaufruf).
// ---------------------------------------------------------------------------
async function startAgentExecutionRun(db, options = {}) {
  const presetId = String(options.presetId || "").trim();
  const preset = requireKnownPreset(presetId);
  const agent = resolveAgentForRole(preset.pilotRole);

  const pilotOrderId = String(options.pilotOrderId || pilotWorkOrderService.CANONICAL_PILOT_ORDER_ID).trim();
  const orderRow = authDb.getPilotWorkOrderById(db, pilotOrderId);
  if (!orderRow) {
    throw notFound(`Der Pilotauftrag "${pilotOrderId}" wurde nicht gefunden.`, { pilotOrderId });
  }
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(
      `Ein Agentenlauf ist nur möglich, während der Pilotauftrag in Ausführung ist (aktuell ${orderRow.status}).`,
      { pilotOrderId, currentStatus: orderRow.status },
    );
  }
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== null &&
    orderRow.revision !== options.expectedRevision
  ) {
    throw conflict(
      `Der Pilotauftrag "${pilotOrderId}" hat sich seit dem zuletzt gelesenen Zustand geändert ` +
        `(erwartete Revision ${options.expectedRevision}, aktuell ${orderRow.revision}). ` +
        "Bitte den aktuellen Zustand erneut laden und die Aktion erneut auslösen.",
      {
        pilotOrderId,
        expectedRevision: options.expectedRevision,
        currentRevision: orderRow.revision,
        currentStatus: orderRow.status,
      },
    );
  }

  const now = options.now || new Date();
  const runId = `pilot-agent-run-${crypto.randomUUID()}`;

  // Anlage als RUNNING + Start-Audit in einer gemeinsamen Transaktion. Der
  // partielle Unique-Index (Migration 20) erzwingt dabei atomar: höchstens
  // ein RUNNING-Lauf pro Pilotauftrag gleichzeitig. Ein Verstoß wird als
  // eindeutiger Konflikt gemeldet, BEVOR der Runner überhaupt aufgerufen
  // wird (Schutz gegen Doppelklick und parallelen zweiten Start).
  let runRow;
  try {
    runRow = authDb.withAuthTransaction(db, () => {
      const inserted = authDb.insertPilotAgentExecutionRunAsRunning(db, {
        id: runId,
        pilotOrderId,
        pilotOrderRevisionAtStart: orderRow.revision,
        presetId: preset.presetId,
        pilotRole: preset.pilotRole,
        agentKey: agent.agentKey,
        taskTitle: preset.title,
        taskInstructions: preset.instructions,
        allowedFilesJson: JSON.stringify(preset.allowedFiles),
        allowedToolsJson: JSON.stringify(preset.allowedTools),
        forbiddenActionsJson: JSON.stringify(preset.forbiddenActions),
        expectedResultFormat: preset.expectedResultFormat,
        runnerId: runner.RUNNER_ID,
        runnerLabel: runner.RUNNER_LABEL,
        startedAt: nowIso(now),
        createdAt: nowIso(now),
      });
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_AGENT_EXECUTION_RUN_STARTED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId, pilotExecutionRunId: runId, pilotRole: preset.pilotRole, presetId: preset.presetId, runnerId: runner.RUNNER_ID },
      });
      return inserted;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw conflict(
        `Für den Pilotauftrag "${pilotOrderId}" läuft bereits ein aktiver Agentenlauf. ` +
          "Bitte den Abschluss abwarten oder den aktuellen Stand neu laden.",
        { pilotOrderId },
      );
    }
    throw error;
  }

  // Runner-Aufruf außerhalb jeder Transaktion (I/O-gebunden, kann bei
  // größeren Dateien messbar dauern) – die RUNNING-Zeile ist zu diesem
  // Zeitpunkt bereits sicher committet und wirkt als Sperre.
  let execResult;
  try {
    execResult = await runner.runPilotAgentAnalysisTask({
      repoRoot: REPO_ROOT,
      allowedFiles: preset.allowedFiles,
      taskTitle: preset.title,
      taskInstructions: preset.instructions,
    });
  } catch (error) {
    execResult = { ok: false, failed: true, errorMessage: String((error && error.message) || error) };
  }

  return finalizeAgentExecutionRun(db, {
    runId,
    pilotOrderId,
    preset,
    execResult,
    now,
    actorUserId: options.actorUserId ?? null,
  });
}

// Korrekturlauf vor Commit (unabhängiges Opus-Review, "Ergebnis darf bei
// Handoff-Konflikt nicht verloren gehen"): der Abschluss eines Agentenlaufs
// ist jetzt strikt in zwei Stufen mit zwei getrennten Transaktionsgrenzen
// unterteilt:
//
//   Stufe A (persistFailedAgentExecutionRun / persistSucceededAgentExecutionRun):
//     ausschließlich der TECHNISCHE Runner-Abschluss – Runstatus
//     (SUCCEEDED/FAILED), resultRawText, resultSummaryJson, finishedAt und
//     das zugehörige Runner-Audit-Ereignis. Läuft in EINER eigenen
//     Transaktion. Ein erfolgreicher Abschluss dieser Stufe ist danach
//     DAUERHAFT und wird durch nichts, was in Stufe B passiert, jemals
//     zurückgerollt.
//
//   Stufe B (attemptHandoffForSucceededRun): ausschließlich die FACHLICHE
//     Rollenübergabe (submitHandoff inkl. Projektmanager-Filter) – nur
//     versucht, wenn Stufe A SUCCEEDED ergeben hat. Läuft in einer eigenen,
//     SPÄTEREN Transaktion (submitHandoff bringt seine eigene mit). Scheitert
//     Stufe B (z. B. weil sich der Pilotauftragsstatus während des Runs
//     geändert hat und submitHandoff daher ablehnt), bleibt der bereits in
//     Stufe A gespeicherte Runstatus SUCCEEDED unverändert; lediglich
//     handoffStatus/handoffErrorMessage/handoffCompletedAt (Migration 21)
//     dokumentieren den Handoff-Fehlschlag getrennt und nachvollziehbar.
//     Niemals ein automatischer Retry, niemals ein automatischer
//     Statuswechsel des Pilotauftrags.
//
// Vor diesem Korrekturlauf liefen beide Stufen in EINER gemeinsamen
// Transaktion: ein scheiterndes submitHandoff riss dabei auch das bereits
// technisch erfolgreich erzeugte Ergebnis mit in den Rollback und der Lauf
// wurde fälschlich als FAILED behandelt, obwohl der Runner tatsächlich
// erfolgreich war. Das ist mit dieser Trennung nicht mehr möglich.

// Stufe A, Fehlerfall: ein technischer Ausführungsfehler erzeugt
// AUSDRÜCKLICH keine Rollenübergabe (Stufe B entfällt vollständig).
function persistFailedAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId }) {
  return authDb.withAuthTransaction(db, () => {
    const errorMessage = String((execResult && execResult.errorMessage) || "Agentenlauf ist technisch fehlgeschlagen.");
    const applied = authDb.updatePilotAgentExecutionRunTerminal(db, {
      id: runId,
      status: "FAILED",
      finishedAt: nowIso(now),
      errorMessage: errorMessage.slice(0, 2000),
    });
    if (!applied) {
      throw new Error("Agentenlauf konnte nicht als fehlgeschlagen markiert werden (unerwarteter Zustand).");
    }
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_AGENT_EXECUTION_RUN_FAILED",
      result: "ERROR",
      actorUserId,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId, pilotExecutionRunId: runId, pilotRole: preset.pilotRole, presetId: preset.presetId },
    });
    return rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId));
  });
}

// Stufe A, Erfolgsfall: ausschließlich der technische Runner-Abschluss.
// Erzeugt hier bewusst NOCH KEINEN Handoff-Versuch (siehe
// attemptHandoffForSucceededRun) – dieses Ergebnis ist bereits nach dieser
// Funktion dauerhaft gespeichert und bleibt es unabhängig vom weiteren
// Verlauf.
function persistSucceededAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId }) {
  return authDb.withAuthTransaction(db, () => {
    const resultSummary = {
      observations: execResult.observations,
      recommendation: execResult.recommendation,
      analyzedFiles: (execResult.facts || []).filter((fact) => fact.exists).map((fact) => ({
        path: fact.path,
        byteLength: fact.byteLength,
        lineCount: fact.lineCount,
        sha256: fact.sha256,
      })),
    };
    const applied = authDb.updatePilotAgentExecutionRunTerminal(db, {
      id: runId,
      status: "SUCCEEDED",
      finishedAt: nowIso(now),
      resultSummaryJson: JSON.stringify(resultSummary),
      resultRawText: execResult.resultText.slice(0, 8000),
    });
    if (!applied) {
      throw new Error("Agentenlauf konnte nicht als erfolgreich markiert werden (unerwarteter Zustand).");
    }
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId, pilotExecutionRunId: runId, pilotRole: preset.pilotRole, presetId: preset.presetId, runnerId: runner.RUNNER_ID },
    });
    return rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId));
  });
}

// Stufe B: separater, nachgelagerter Versuch der fachlichen
// Rollenübergabe. Läuft AUSSERHALB der Stufe-A-Transaktion und in einer
// eigenen try/catch-Grenze: ein Scheitern hier (Konflikt, weil sich der
// Pilotauftragsstatus zwischenzeitlich geändert hat, oder jeder andere
// Fehler von submitHandoff) darf das bereits in Stufe A dauerhaft
// gespeicherte SUCCEEDED-Ergebnis NIEMALS zurückrollen oder überschreiben.
// Kein automatischer Retry, keine automatische Freigabe, kein automatischer
// Statuswechsel des Pilotauftrags durch diese Funktion selbst.
function attemptHandoffForSucceededRun(db, { runId, pilotOrderId, preset, execResult, resultSummary, now, actorUserId }) {
  const basisUsed = `Lokal gelesene Projektdateien (${resultSummary.analyzedFiles
    .map((entry) => `${entry.path}, ${entry.byteLength} Bytes, SHA-256 ${entry.sha256.slice(0, 12)}…`)
    .join("; ")}), Runner: ${runner.RUNNER_LABEL}`;
  const riskOrLimit =
    "Analyse beschränkt auf die im Preset festgelegten Dateien; keine Aussage über den Rest des Repositories. " +
    "Kein KI-Modellaufruf, keine externe Netzwerkanfrage.";

  try {
    const handoffResult = pilotWorkOrderService.submitHandoff(db, {
      pilotOrderId,
      fromPilotRole: preset.handoffFromPilotRole,
      toPilotRole: preset.handoffToPilotRole,
      shortFinding: `Agentenlauf ${runId} erfolgreich abgeschlossen (${preset.title}).`,
      resultOrRecommendation: execResult.resultText.slice(0, 4000),
      basisUsed: basisUsed.slice(0, 2000),
      riskOrLimit,
      nextStep: "Projektmanager-Filter prüft das Ergebnis; bei Annahme kann zur Abschlussprüfung vorgelegt werden.",
      forbiddenActionOccurred: false,
      autonomyBoundaryRespected: true,
      executionRunId: runId,
      now,
      actorUserId,
    });
    authDb.updatePilotAgentExecutionRunHandoffOutcome(db, {
      id: runId,
      handoffStatus: "SUCCEEDED",
      handoffErrorMessage: null,
      handoffCompletedAt: nowIso(now),
    });
    return { handoff: handoffResult.handoff, filterResult: handoffResult.filterResult, handoffStatus: "SUCCEEDED", handoffErrorMessage: null };
  } catch (handoffError) {
    const handoffErrorMessage = String((handoffError && handoffError.message) || handoffError).slice(0, 2000);
    try {
      authDb.updatePilotAgentExecutionRunHandoffOutcome(db, {
        id: runId,
        handoffStatus: "FAILED",
        handoffErrorMessage,
        handoffCompletedAt: nowIso(now),
      });
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_AGENT_EXECUTION_RUN_HANDOFF_FAILED",
        result: "ERROR",
        actorUserId,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId, pilotExecutionRunId: runId, pilotRole: preset.pilotRole, presetId: preset.presetId },
      });
    } catch (_persistError) {
      // Best effort: selbst wenn das Festhalten des Handoff-Fehlschlags
      // selbst scheitert, bleibt Stufe A (das SUCCEEDED-Ergebnis) davon
      // vollständig unberührt – niemals ein Rückschluss auf den bereits
      // dauerhaft gespeicherten Runstatus.
    }
    return { handoff: null, filterResult: null, handoffStatus: "FAILED", handoffErrorMessage };
  }
}

function finalizeAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId }) {
  const isSuccess = Boolean(execResult && execResult.ok === true);
  try {
    if (!isSuccess) {
      const run = persistFailedAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId });
      return { run, handoff: null };
    }
    const succeededRun = persistSucceededAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId });
    // Ab hier ist Stufe A unumkehrbar abgeschlossen: succeededRun.status ist
    // dauerhaft SUCCEEDED, unabhängig vom Ausgang von Stufe B unten.
    const handoffOutcome = attemptHandoffForSucceededRun(db, {
      runId,
      pilotOrderId,
      preset,
      execResult,
      resultSummary: succeededRun.resultSummary,
      now,
      actorUserId,
    });
    return {
      run: rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId)),
      handoff: handoffOutcome.handoff,
      filterResult: handoffOutcome.filterResult,
      handoffStatus: handoffOutcome.handoffStatus,
      handoffErrorMessage: handoffOutcome.handoffErrorMessage,
    };
  } catch (stageAError) {
    // Nur erreichbar, wenn bereits STUFE A selbst scheitert (z. B. ein
    // simulierter Audit-Fehler beim technischen Abschluss) – niemals durch
    // ein Scheitern von Stufe B (siehe attemptHandoffForSucceededRun, das
    // seine eigenen Fehler abfängt und niemals hierher durchreicht).
    // Sicherer, eindeutig erkennbarer Fehlerzustand außerhalb der
    // gescheiterten Transaktion: niemals ein stiller Erfolg, niemals ein
    // für immer unklarer RUNNING-Zustand.
    try {
      authDb.updatePilotAgentExecutionRunTerminal(db, {
        id: runId,
        status: "FAILED",
        finishedAt: nowIso(now),
        errorMessage: `Interner Fehler nach Ausführung: ${String((stageAError && stageAError.message) || stageAError)}`.slice(0, 2000),
      });
    } catch (_fallbackError) {
      /* best effort – der Lauf bleibt im schlimmsten Fall nachvollziehbar RUNNING, niemals fälschlich SUCCEEDED. */
    }
    throw stageAError;
  }
}

module.exports = {
  PilotAgentExecutionError,
  PILOT_AGENT_TASK_PRESETS,
  REPO_ROOT,
  rowToAgentExecutionRunView,
  listAgentExecutionRunsForOrder,
  getAgentExecutionRunById,
  startAgentExecutionRun,
};
