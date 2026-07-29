"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 8 ("vollständige, kontrollierte
// Drei-Agenten-Kette als kontrollierter Nachtlauf").
//
// Orchestriert genau EINE, additiv auf pilot-agent-execution-service.js
// aufsetzende Kette aus drei getrennten, echten CODEX_READ_ONLY-Agentenläufen
// (Recherche/Analyse -> Dokumentation -> Projektmanager-Bewertung). Dieses
// Modul verändert pilot-agent-execution-service.js NICHT strukturell (nur
// additive Presets + ein additiver, optionaler chainManaged-/
// predecessorContext-Durchgriff, siehe dort) und execution-codex-adapter.js
// GAR NICHT. Es startet selbst niemals einen Kindprozess (das bleibt
// ausschließlich den bereits bestehenden Modulen vorbehalten) und erteilt
// niemals selbst eine Jamal-Freigabe.
//
// Architekturentscheidung (siehe Abschlussbericht Abschnitt 2): eine Kette
// ist ein EIGENES Konzept mit eigenem Lebenszyklus, getrennt von einem
// einzelnen Agentenlauf – zwei neue, kleine Tabellen
// (pilot_agent_execution_chains/…_chain_steps, Migration 23) statt weiterer
// Spalten auf der bereits bestehenden pilot_agent_execution_runs-Tabelle.
// Ein Kettenschritt REFERENZIERT sein Ergebnis ausschließlich über
// executionRunId; das Ergebnis selbst bleibt ausschließlich in
// pilot_agent_execution_runs gespeichert (keine Verdopplung).
//
// Freigabemodell: jeder Kettenschritt benötigt eine eigene, kurzlebige,
// einmalige, an chainId+chainStep+actorUserId+Revision+Agent/Preset/Runner
// gebundene Freigabe (RAM-only, gleiches Muster wie
// pilot-agent-execution-service.js#requestCodexRunApproval/consumeCodexRunApproval,
// hier bewusst als EIGENER, getrennter Tokenspeicher). Diese
// KETTEN-Freigabe ist die tatsächliche, Jamal-facing Freigabe. Direkt nach
// ihrem Verbrauch mintet dieses Modul zusätzlich AUTOMATISCH und
// AUSSCHLIESSLICH serverintern die von startAgentExecutionRun bereits
// vorausgesetzte, bereits bestehende Codex-Einzellauf-Freigabe
// (requestCodexRunApproval) – das ist KEINE zweite Jamal-Freigabe, sondern
// eine reine, für den Aufrufer unsichtbare Verdrahtungsdetail-Wiederverwendung
// der bereits bestehenden, unveränderten Serviceschicht. Ohne die vorherige,
// echte Ketten-Freigabe wird dieser interne Schritt niemals erreicht.
//
// Kein Fehler in diesem Modul lässt einen späteren Schritt automatisch
// starten, vernichtet ein bereits erfolgreiches Vorgängerergebnis, erzeugt
// eine Jamal-Freigabe, erzeugt einen falschen COMPLETED-Status oder
// verändert eine Repository-Datei.

const crypto = require("crypto");

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const pilotAgentExecutionService = require("./pilot-agent-execution-service");

class PilotAgentExecutionChainError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "PilotAgentExecutionChainError";
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : null;
  }
}
function badRequest(message, details) {
  return new PilotAgentExecutionChainError(message, 400, details);
}
function notFound(message, details) {
  return new PilotAgentExecutionChainError(message, 404, details);
}
function conflict(message, details) {
  return new PilotAgentExecutionChainError(message, 409, details);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function truncate(text, maxLen) {
  const value = String(text === null || text === undefined ? "" : text);
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text === null || text === undefined ? "" : text), "utf8").digest("hex");
}

// Verbindliche Reihenfolge/Rollenzuordnung der Kette (siehe Auftrag
// "Verbindliche Agentenkette"). Ausschließlich bereits bestehende, im
// kanonischen 25-Agenten-Register vorhandene Identitäten (agent-registry.js) –
// keine neue Agentenidentität. Die zugehörigen Presets leben additiv in
// pilot-agent-execution-service.js#PILOT_AGENT_TASK_PRESETS.
const CHAIN_STEP_DEFINITIONS = Object.freeze([
  Object.freeze({ stepNumber: 1, agentKey: "review-agent", presetId: "codex-chain-research-analysis" }),
  Object.freeze({ stepNumber: 2, agentKey: "documentation-agent", presetId: "codex-document-chain-result" }),
  Object.freeze({ stepNumber: 3, agentKey: "orchestrator-agent", presetId: "codex-pm-evaluate-chain" }),
]);

// Fail-fast bei Registrierungsdrift zwischen diesem Modul und den additiven
// Presets in pilot-agent-execution-service.js – ein Abweichen wäre ein
// Programmierfehler, kein zur Laufzeit behebbarer Aufruferfehler.
CHAIN_STEP_DEFINITIONS.forEach((definition) => {
  const preset = pilotAgentExecutionService.PILOT_AGENT_TASK_PRESETS[definition.presetId];
  if (!preset) {
    throw new Error(`pilot-agent-execution-chain-service: unbekanntes Preset "${definition.presetId}".`);
  }
  if (preset.runnerKind !== pilotAgentExecutionService.RUNNER_KINDS.CODEX) {
    throw new Error(`pilot-agent-execution-chain-service: Preset "${definition.presetId}" muss ein Codex-Preset sein.`);
  }
  if (!preset.chainManaged) {
    throw new Error(`pilot-agent-execution-chain-service: Preset "${definition.presetId}" muss chainManaged sein.`);
  }
  if (preset.agentKeyOverride !== definition.agentKey) {
    throw new Error(
      `pilot-agent-execution-chain-service: Agentenidentität von Preset "${definition.presetId}" weicht von der erwarteten Kettenzuordnung ab.`,
    );
  }
});

function stepNumberToWaitingStatus(stepNumber) {
  return { 1: "WAITING_FOR_RESEARCH_APPROVAL", 2: "WAITING_FOR_DOCUMENTATION_APPROVAL", 3: "WAITING_FOR_PM_APPROVAL" }[stepNumber];
}
function stepNumberToRunningStatus(stepNumber) {
  return { 1: "RESEARCH_RUNNING", 2: "DOCUMENTATION_RUNNING", 3: "PM_RUNNING" }[stepNumber];
}

function requireStepNumber(value) {
  const parsed = Number(value);
  if (![1, 2, 3].includes(parsed)) {
    throw badRequest("chainStep muss 1, 2 oder 3 sein.");
  }
  return parsed;
}
function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${fieldName} fehlt oder ist ungültig.`);
  }
  return value.trim();
}
// `expectedPilotOrderId` ist ausschließlich von der HTTP-Schicht gesetzt
// (siehe pilot-work-order-routes.js): das URL-Pfadsegment `pilotOrderId`
// muss zur tatsächlichen Kette passen – verhindert, dass über die Route
// eines Auftrags A eine Kette von Auftrag B angesprochen werden kann.
function requireChain(db, chainId, expectedPilotOrderId) {
  const chain = authDb.getPilotAgentExecutionChainById(db, chainId);
  if (!chain) throw notFound(`Die Kette "${chainId}" wurde nicht gefunden.`, { chainId });
  if (expectedPilotOrderId !== undefined && chain.pilotOrderId !== expectedPilotOrderId) {
    throw badRequest("Die Kette gehört nicht zu diesem Pilotauftrag.", { chainId, pilotOrderId: expectedPilotOrderId });
  }
  return chain;
}
function requireStep(db, chainId, stepNumber) {
  const step = authDb.getPilotAgentExecutionChainStepByNumber(db, chainId, stepNumber);
  if (!step) throw notFound(`Kettenschritt ${stepNumber} wurde für diese Kette nicht gefunden.`, { chainId, stepNumber });
  return step;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function stepRowToView(row) {
  return {
    id: row.id,
    chainId: row.chainId,
    stepNumber: row.stepNumber,
    agentKey: row.agentKey,
    presetId: row.presetId,
    stepStatus: row.stepStatus,
    approvalStatus: row.approvalStatus,
    executionRunId: row.executionRunId || null,
    chainedFromExecutionRunId: row.chainedFromExecutionRunId || null,
    predecessorResultDigest: row.predecessorResultDigest || null,
    resultDigest: row.resultDigest || null,
    failureReasonCode: row.failureReasonCode || null,
    approvalRequestedAt: row.approvalRequestedAt || null,
    startedAt: row.startedAt || null,
    completedAt: row.completedAt || null,
    createdAt: row.createdAt,
  };
}

function getChainView(db, chainId) {
  const chain = authDb.getPilotAgentExecutionChainById(db, chainId);
  if (!chain) return null;
  const steps = authDb.listPilotAgentExecutionChainStepsForChain(db, chainId).map(stepRowToView);
  return {
    id: chain.id,
    pilotOrderId: chain.pilotOrderId,
    chainStatus: chain.chainStatus,
    currentStep: chain.currentStep,
    revision: chain.revision,
    waitingForJamal: Boolean(chain.waitingForJamal),
    blockReason: chain.blockReason || null,
    createdByUserId: chain.createdByUserId || null,
    createdAt: chain.createdAt,
    updatedAt: chain.updatedAt,
    completedAt: chain.completedAt || null,
    steps,
  };
}

function listChainsForOrder(db, pilotOrderId) {
  return authDb.listPilotAgentExecutionChainsForOrder(db, pilotOrderId).map((row) => getChainView(db, row.id));
}

// ---------------------------------------------------------------------------
// Ketten-Freigabe-Tokens: RAM-only, kurzlebig, einmalig, gebunden an
// chainId + chainStep + actorUserId + zum Ausstellungszeitpunkt gelesene
// Kettenrevision + Agent/Preset/Runner. Bewusst ein EIGENER, von
// pilot-agent-execution-service.js#CODEX_APPROVAL_TOKENS getrennter
// Tokenspeicher (unterschiedliche Bindungsdimension: Kettenschritt statt
// Pilotauftrag).
// ---------------------------------------------------------------------------
const CHAIN_APPROVAL_TOKEN_TTL_MS = 5 * 60 * 1000;
const CHAIN_APPROVAL_TOKENS = new Map();
const DEFAULT_CHAIN_APPROVAL_NOW_PROVIDER = () => Date.now();

function mintChainApprovalToken(binding, options = {}) {
  const nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : DEFAULT_CHAIN_APPROVAL_NOW_PROVIDER;
  const issuedAtMs = nowProvider();
  const token = crypto.randomBytes(24).toString("hex");
  CHAIN_APPROVAL_TOKENS.set(token, {
    chainId: binding.chainId,
    chainStep: binding.chainStep,
    agentKey: binding.agentKey,
    presetId: binding.presetId,
    runnerKind: binding.runnerKind,
    actorUserId: binding.actorUserId,
    boundRevision: binding.boundRevision,
    createdAt: issuedAtMs,
    expiresAt: issuedAtMs + CHAIN_APPROVAL_TOKEN_TTL_MS,
    consumed: false,
  });
  return { token, expiresInMs: CHAIN_APPROVAL_TOKEN_TTL_MS };
}

// Exakt dasselbe, bereits geprüfte Bindungs-/TTL-/Einmaligkeitsmuster wie
// pilot-agent-execution-service.js#consumeCodexRunApproval.
function consumeChainApprovalToken(token, expectedBinding = {}, options = {}) {
  const nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : DEFAULT_CHAIN_APPROVAL_NOW_PROVIDER;
  if (typeof token !== "string" || !token) {
    return { ok: false, reason: "TOKEN_MISSING" };
  }
  const record = CHAIN_APPROVAL_TOKENS.get(token);
  if (!record) {
    return { ok: false, reason: "TOKEN_UNKNOWN" };
  }
  if (record.consumed) {
    CHAIN_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_ALREADY_USED" };
  }
  if (nowProvider() > record.expiresAt) {
    CHAIN_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_EXPIRED" };
  }
  if (expectedBinding.chainId !== undefined && record.chainId !== expectedBinding.chainId) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.chainStep !== undefined && record.chainStep !== expectedBinding.chainStep) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.agentKey !== undefined && record.agentKey !== expectedBinding.agentKey) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.presetId !== undefined && record.presetId !== expectedBinding.presetId) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.runnerKind !== undefined && record.runnerKind !== expectedBinding.runnerKind) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if ((expectedBinding.actorUserId ?? null) !== record.actorUserId) {
    return { ok: false, reason: "TOKEN_USER_MISMATCH" };
  }
  if (expectedBinding.currentRevision !== undefined && record.boundRevision !== expectedBinding.currentRevision) {
    CHAIN_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_REVISION_MISMATCH" };
  }
  record.consumed = true;
  CHAIN_APPROVAL_TOKENS.delete(token);
  return { ok: true };
}

function clearChainApprovalTokensForTests() {
  CHAIN_APPROVAL_TOKENS.clear();
}

// ---------------------------------------------------------------------------
// Kette vorbereiten (API: "Kette vorbereiten"). Legt die Kette UND alle drei
// Schrittzeilen (PENDING, NOT_REQUESTED) atomar an. Löst noch KEINE
// Ausführung und KEINE Freigabeanforderung aus.
// ---------------------------------------------------------------------------
function prepareChain(db, options = {}) {
  const pilotOrderId = requireNonEmptyString(options.pilotOrderId, "pilotOrderId");
  const orderRow = authDb.getPilotWorkOrderById(db, pilotOrderId);
  if (!orderRow) {
    throw notFound(`Der Pilotauftrag "${pilotOrderId}" wurde nicht gefunden.`, { pilotOrderId });
  }
  const now = options.now || new Date();
  const createdAt = nowIso(now);
  const actorUserId = options.actorUserId ?? null;
  const chainId = `pilot-agent-chain-${crypto.randomUUID()}`;

  authDb.withAuthTransaction(db, () => {
    authDb.insertPilotAgentExecutionChain(db, {
      id: chainId,
      pilotOrderId,
      chainStatus: "PREPARED",
      currentStep: 1,
      revision: 1,
      waitingForJamal: false,
      createdByUserId: actorUserId,
      createdAt,
      updatedAt: createdAt,
    });
    CHAIN_STEP_DEFINITIONS.forEach((definition) => {
      authDb.insertPilotAgentExecutionChainStep(db, {
        id: `${chainId}-step-${definition.stepNumber}`,
        chainId,
        stepNumber: definition.stepNumber,
        agentKey: definition.agentKey,
        presetId: definition.presetId,
        stepStatus: "PENDING",
        approvalStatus: "NOT_REQUESTED",
        createdAt,
      });
    });
    authAudit.recordAuditEvent(db, {
      eventType: "CHAIN_PREPARED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: createdAt,
      metadata: { chainId, status: "PREPARED" },
    });
  });

  return getChainView(db, chainId);
}

// ---------------------------------------------------------------------------
// Freigabe für exakt eine Stufe anfordern (API: "Freigabe für exakt eine
// Stufe anfordern"). Erlaubt ausschließlich für den aktuellen Kettenschritt
// (chain.currentStep), niemals für einen bereits abgeschlossenen oder noch
// nicht erreichten Schritt. Idempotent erneut aufrufbar, solange der Schritt
// noch PENDING ist (z. B. nach Tokenablauf) – mintet dabei jedes Mal einen
// frischen Token; ein älterer Token wird durch die anschließende
// Revisionsbindung spätestens beim nächsten Start ungültig.
// ---------------------------------------------------------------------------
function requestStepApproval(db, options = {}) {
  const chainId = requireNonEmptyString(options.chainId, "chainId");
  const stepNumber = requireStepNumber(options.chainStep);
  const now = options.now || new Date();
  const actorUserId = options.actorUserId ?? null;

  const chain = requireChain(db, chainId, options.expectedPilotOrderId);
  const step = requireStep(db, chainId, stepNumber);

  if (chain.currentStep !== stepNumber) {
    throw conflict(
      `Für Kettenschritt ${stepNumber} kann keine Freigabe angefordert werden, solange die Kette bei Schritt ${chain.currentStep} steht.`,
      { chainId, chainStep: stepNumber, currentStep: chain.currentStep },
    );
  }
  const allowedStatusesForStep = {
    1: ["PREPARED", "WAITING_FOR_RESEARCH_APPROVAL"],
    2: ["WAITING_FOR_DOCUMENTATION_APPROVAL"],
    3: ["WAITING_FOR_PM_APPROVAL"],
  }[stepNumber];
  if (!allowedStatusesForStep.includes(chain.chainStatus)) {
    throw conflict(
      `Für Kettenschritt ${stepNumber} kann im aktuellen Kettenstatus "${chain.chainStatus}" keine Freigabe angefordert werden.`,
      { chainId, chainStep: stepNumber, chainStatus: chain.chainStatus },
    );
  }
  if (step.stepStatus !== "PENDING") {
    throw conflict(`Kettenschritt ${stepNumber} ist nicht mehr offen (Status ${step.stepStatus}).`, {
      chainId,
      chainStep: stepNumber,
      stepStatus: step.stepStatus,
    });
  }

  const nextChainStatus = stepNumber === 1 ? "WAITING_FOR_RESEARCH_APPROVAL" : chain.chainStatus;
  const requestedAt = nowIso(now);

  authDb.withAuthTransaction(db, () => {
    const stepApplied = authDb.updatePilotAgentExecutionChainStepApprovalRequested(db, {
      id: step.id,
      approvalRequestedAt: requestedAt,
    });
    if (!stepApplied) {
      throw conflict("Freigabeanforderung konnte nicht angewendet werden (unerwarteter Zustand).", { chainId, chainStep: stepNumber });
    }
    const chainApplied = authDb.updatePilotAgentExecutionChainStatusConditional(db, {
      id: chain.id,
      expectedStatus: chain.chainStatus,
      expectedRevision: chain.revision,
      nextStatus: nextChainStatus,
      waitingForJamal: true,
      updatedAt: requestedAt,
    });
    if (!chainApplied) {
      throw conflict("Die Kette hat sich seit dem zuletzt gelesenen Zustand geändert. Bitte erneut laden.", {
        chainId,
        expectedRevision: chain.revision,
      });
    }
    authAudit.recordAuditEvent(db, {
      eventType: "CHAIN_STEP_APPROVAL_REQUESTED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: requestedAt,
      metadata: { chainId, chainStep: stepNumber, agentKey: step.agentKey, status: nextChainStatus },
    });
  });

  const freshChain = authDb.getPilotAgentExecutionChainById(db, chainId);
  const minted = mintChainApprovalToken(
    {
      chainId,
      chainStep: stepNumber,
      agentKey: step.agentKey,
      presetId: step.presetId,
      runnerKind: pilotAgentExecutionService.RUNNER_KINDS.CODEX,
      actorUserId,
      boundRevision: freshChain.revision,
    },
    { nowProvider: options.chainApprovalNowProvider },
  );

  return { approvalToken: minted.token, expiresInMs: minted.expiresInMs, chain: getChainView(db, chainId) };
}

// Chain-level Blockierung bei einem Sicherheits-/Integritätsbefund VOR dem
// eigentlichen Lauf (z. B. Vorgängerergebnis fehlt/manipuliert). Best
// effort: greift die Bedingung nicht mehr (z. B. weil die Kette
// zwischenzeitlich unabhängig weiterlief), wird dies bewusst NICHT
// erzwungen – niemals ein bereits abweichender, ggf. sogar erfolgreicherer
// Zustand überschrieben.
function blockChain(db, chain, reasonCode, now, actorUserId) {
  const timestamp = nowIso(now);
  try {
    authDb.withAuthTransaction(db, () => {
      const applied = authDb.updatePilotAgentExecutionChainStatusConditional(db, {
        id: chain.id,
        expectedStatus: chain.chainStatus,
        expectedRevision: chain.revision,
        nextStatus: "BLOCKED",
        waitingForJamal: false,
        blockReason: reasonCode,
        updatedAt: timestamp,
      });
      if (!applied) return;
      authAudit.recordAuditEvent(db, {
        eventType: "CHAIN_BLOCKED",
        result: "ERROR",
        actorUserId,
        tenantId: null,
        timestamp,
        metadata: { chainId: chain.id, reasonCode, status: "BLOCKED" },
      });
    });
  } catch (_error) {
    // Best effort: eine zusätzliche Störung beim Festhalten der Blockierung
    // darf niemals den ursprünglichen, dem Aufrufer bereits mitgeteilten
    // Sicherheitsbefund verschleiern.
  }
}

// V7.7.0 ("Reservierte Zustände dokumentieren"): auth-db-migrations.js#
// PILOT_AGENT_EXECUTION_CHAIN_STATUS_VALUES enthält zusätzlich
// RESEARCH_SUCCEEDED/DOCUMENTATION_SUCCEEDED/CANCELLED. Dieser Korrekturlauf
// baut KEINE produktive Cancel-Funktion und ändert an dieser Auswahl
// NICHTS – hier nur die verbindliche Klarstellung, wie chainStatus diese
// drei Werte TATSÄCHLICH behandelt:
//   - RESEARCH_SUCCEEDED/DOCUMENTATION_SUCCEEDED sind reservierte, in der
//     CHECK-Aufzählung zulässige Vokabeln (Nachvollziehbarkeit/künftige
//     Erweiterung), werden aber von diesem Modul NIEMALS als tatsächlich
//     gespeicherter chainStatus geschrieben – ein erfolgreicher Schritt
//     springt unten (siehe nextStatus) IMMER direkt auf den nächsten
//     WAITING_FOR_*_APPROVAL-Wert bzw. auf COMPLETED (Schritt 3),
//     niemals auf einen *_SUCCEEDED-Zwischenwert.
//   - CANCELLED ist ebenfalls eine reservierte, in der CHECK-Aufzählung
//     zulässige Vokabel, aber in diesem Korrekturlauf an KEINER Stelle
//     dieses Moduls (prepareChain/requestStepApproval/startStep/blockChain/
//     finalizeChainStepSuccess/finalizeChainStepFailure/
//     emergencyFinalizeChainStepAfterError) tatsächlich erreichbar – es
//     existiert bewusst kein Cancel-Endpunkt/keine Cancel-Funktion (siehe
//     Auftrag "Bewusst nicht umsetzen"). Ein UI-Text wie CHAIN_STATUS_LABELS
//     in pilot-work-order-ui.js darf diesen Wert weiterhin BENENNEN (rein
//     defensive Anzeige, falls der Wert in einer künftigen Erweiterung doch
//     einmal auftritt), impliziert dadurch aber NICHT, dass ein Abbrechen
//     bereits über das UI ausgelöst werden kann (es gibt keine
//     entsprechende Schaltfläche).
function finalizeChainStepSuccess(db, { chain, step, stepNumber, now, actorUserId, run }) {
  const resultDigest = sha256Hex(run.resultRawText || "");
  const completedAt = nowIso(now);
  const runningStatus = stepNumberToRunningStatus(stepNumber);
  const nextStatus = stepNumber < 3 ? stepNumberToWaitingStatus(stepNumber + 1) : "COMPLETED";
  const nextCurrentStep = stepNumber < 3 ? stepNumber + 1 : stepNumber;
  const freshChain = authDb.getPilotAgentExecutionChainById(db, chain.id);

  authDb.withAuthTransaction(db, () => {
    const stepApplied = authDb.updatePilotAgentExecutionChainStepTerminal(db, {
      id: step.id,
      stepStatus: "SUCCEEDED",
      executionRunId: run.id,
      resultDigest,
      failureReasonCode: null,
      completedAt,
    });
    if (!stepApplied) {
      throw new Error("Interner Fehler: Kettenschritt konnte nicht als erfolgreich markiert werden (unerwarteter Zustand).");
    }
    const chainApplied = authDb.updatePilotAgentExecutionChainStatusConditional(db, {
      id: freshChain.id,
      expectedStatus: runningStatus,
      expectedRevision: freshChain.revision,
      nextStatus,
      nextCurrentStep,
      waitingForJamal: stepNumber < 3,
      updatedAt: completedAt,
      ...(stepNumber === 3 ? { completedAt } : {}),
    });
    if (!chainApplied) {
      throw new Error("Interner Fehler: Kettenstatus konnte nach erfolgreichem Schritt nicht aktualisiert werden (unerwarteter Zustand).");
    }
    authAudit.recordAuditEvent(db, {
      eventType: "CHAIN_STEP_SUCCEEDED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: completedAt,
      metadata: { chainId: chain.id, chainStep: stepNumber, executionRunId: run.id, agentKey: step.agentKey, resultDigest, status: nextStatus },
    });
    if (stepNumber === 3) {
      authAudit.recordAuditEvent(db, {
        eventType: "CHAIN_COMPLETED",
        result: "OK",
        actorUserId,
        tenantId: null,
        timestamp: completedAt,
        metadata: { chainId: chain.id, status: "COMPLETED" },
      });
    } else {
      authAudit.recordAuditEvent(db, {
        eventType: "CHAIN_WAITING_FOR_NEXT_APPROVAL",
        result: "OK",
        actorUserId,
        tenantId: null,
        timestamp: completedAt,
        metadata: { chainId: chain.id, chainStep: nextCurrentStep, status: nextStatus },
      });
    }
  });

  return getChainView(db, chain.id);
}

function finalizeChainStepFailure(db, { chain, step, stepNumber, now, actorUserId, errorMessage, executionRunId, failureReasonCode }) {
  const completedAt = nowIso(now);
  const runningStatus = stepNumberToRunningStatus(stepNumber);
  const freshChain = authDb.getPilotAgentExecutionChainById(db, chain.id);
  const resolvedFailureReasonCode = failureReasonCode || "STEP_EXECUTION_FAILED";

  authDb.withAuthTransaction(db, () => {
    const stepApplied = authDb.updatePilotAgentExecutionChainStepTerminal(db, {
      id: step.id,
      stepStatus: "FAILED",
      executionRunId: executionRunId || null,
      resultDigest: null,
      failureReasonCode: resolvedFailureReasonCode,
      completedAt,
    });
    if (!stepApplied) {
      throw new Error("Interner Fehler: Kettenschritt konnte nicht als fehlgeschlagen markiert werden (unerwarteter Zustand).");
    }
    const chainApplied = authDb.updatePilotAgentExecutionChainStatusConditional(db, {
      id: freshChain.id,
      expectedStatus: runningStatus,
      expectedRevision: freshChain.revision,
      nextStatus: "FAILED",
      waitingForJamal: false,
      blockReason: truncate(errorMessage, 500),
      updatedAt: completedAt,
      completedAt,
    });
    if (!chainApplied) {
      throw new Error("Interner Fehler: Kettenstatus konnte nach fehlgeschlagenem Schritt nicht aktualisiert werden (unerwarteter Zustand).");
    }
    authAudit.recordAuditEvent(db, {
      eventType: "CHAIN_STEP_FAILED",
      result: "ERROR",
      actorUserId,
      tenantId: null,
      timestamp: completedAt,
      metadata: {
        chainId: chain.id,
        chainStep: stepNumber,
        agentKey: step.agentKey,
        reasonCode: resolvedFailureReasonCode,
        status: "FAILED",
        ...(executionRunId ? { executionRunId } : {}),
      },
    });
  });

  return getChainView(db, chain.id);
}

// ---------------------------------------------------------------------------
// V7.7.0 Korrektur 3 ("Fail-Stuck zwischen Tokenverbrauch und Runnerstart
// verhindern", unabhängiges Opus-Review, Blocker 3): letzter Rettungsanker,
// AUSSCHLIESSLICH erreichbar, wenn bereits die reguläre Terminalisierung
// (finalizeChainStepSuccess/finalizeChainStepFailure) selbst wirft – z. B.
// ein SQLite-Konflikt oder ein Audit-Fehler WÄHREND des Terminalisierungs-
// versuchs. Da finalizeChainStepSuccess/finalizeChainStepFailure jeweils in
// einer eigenen Transaktion laufen (authDb.withAuthTransaction), wird bei
// einem Fehler darin die GESAMTE Transaktion automatisch zurückgerollt –
// Schritt und Kette stehen zu diesem Zeitpunkt also nachweisbar noch exakt
// im RUNNING-Zwischenzustand, den startStep() vor dem inneren
// Freigabe-/Laufstart gesetzt hat. Dieser Rettungsanker versucht GENAU
// EINMAL, best effort, denselben RUNNING-Zwischenzustand kontrolliert auf
// FAILED zu setzen (niemals COMPLETED, niemals eine neue Freigabe, niemals
// einen automatischen nächsten Schritt) und dabei – falls bereits ein
// technisch erfolgreicher Lauf vorlag – dessen executionRunId zu erhalten
// (kein Ergebnis wird überschrieben oder vernichtet). Scheitert auch dieser
// letzte Versuch, wird das best effort hingenommen (siehe blockChain oben,
// gleiches Muster) – der URSPRÜNGLICHE Fehler wird in JEDEM Fall am Ende
// erneut geworfen, niemals verschleiert, niemals als Erfolg ausgegeben.
function emergencyFinalizeChainStepAfterError(db, { chain, step, stepNumber, now, actorUserId, executionRunId, originalError }) {
  const completedAt = nowIso(now);
  const failureReasonCode = "CHAIN_STEP_FINALIZATION_FAILED";
  try {
    const runningStatus = stepNumberToRunningStatus(stepNumber);
    const freshChain = authDb.getPilotAgentExecutionChainById(db, chain.id);
    authDb.withAuthTransaction(db, () => {
      const stepApplied = authDb.updatePilotAgentExecutionChainStepTerminal(db, {
        id: step.id,
        stepStatus: "FAILED",
        executionRunId: executionRunId || null,
        resultDigest: null,
        failureReasonCode,
        completedAt,
      });
      // Best effort, siehe Kopfkommentar: greift der Schritt nicht mehr
      // (z. B. weil er entgegen der Analyse oben doch nicht mehr RUNNING
      // war), wird NICHTS erzwungen – niemals ein bereits abweichender,
      // ggf. sogar erfolgreicherer Zustand überschrieben.
      if (!stepApplied) return;
      if (!freshChain || freshChain.chainStatus !== runningStatus) return;
      authDb.updatePilotAgentExecutionChainStatusConditional(db, {
        id: chain.id,
        expectedStatus: runningStatus,
        expectedRevision: freshChain.revision,
        nextStatus: "FAILED",
        waitingForJamal: false,
        blockReason: truncate(
          `Interner Fehler bei der Kettenterminalisierung: ${String((originalError && originalError.message) || originalError)}`,
          500,
        ),
        updatedAt: completedAt,
        completedAt,
      });
      authAudit.recordAuditEvent(db, {
        eventType: "CHAIN_STEP_FAILED",
        result: "ERROR",
        actorUserId,
        tenantId: null,
        timestamp: completedAt,
        metadata: {
          chainId: chain.id,
          chainStep: stepNumber,
          agentKey: step.agentKey,
          reasonCode: failureReasonCode,
          status: "FAILED",
          ...(executionRunId ? { executionRunId } : {}),
        },
      });
    });
  } catch (_persistError) {
    // Best effort (siehe Kopfkommentar oben): der ursprüngliche Fehler wird
    // unabhängig vom Ausgang dieses Rettungsversuchs unten erneut geworfen.
  }
  throw originalError;
}

// ---------------------------------------------------------------------------
// Exakt eine freigegebene Stufe starten (API: "exakt eine freigegebene
// Stufe starten"). Führt EINEN echten, isolierten CODEX_READ_ONLY-Lauf über
// die bereits bestehende, unveränderte pilot-agent-execution-service.js
// aus. Läuft niemals automatisch weiter – ein Erfolg bereitet ausschließlich
// den nächsten Schritt vor (siehe finalizeChainStepSuccess).
// ---------------------------------------------------------------------------
async function startStep(db, options = {}) {
  const chainId = requireNonEmptyString(options.chainId, "chainId");
  const stepNumber = requireStepNumber(options.chainStep);
  const now = options.now || new Date();
  const actorUserId = options.actorUserId ?? null;

  const chain = requireChain(db, chainId, options.expectedPilotOrderId);
  const step = requireStep(db, chainId, stepNumber);

  if (chain.currentStep !== stepNumber) {
    throw conflict(
      `Kettenschritt ${stepNumber} kann nicht gestartet werden, solange die Kette bei Schritt ${chain.currentStep} steht.`,
      { chainId, chainStep: stepNumber, currentStep: chain.currentStep },
    );
  }
  const expectedWaitingStatus = stepNumberToWaitingStatus(stepNumber);
  if (chain.chainStatus !== expectedWaitingStatus) {
    throw conflict(`Kettenschritt ${stepNumber} kann im aktuellen Kettenstatus "${chain.chainStatus}" nicht gestartet werden.`, {
      chainId,
      chainStep: stepNumber,
      chainStatus: chain.chainStatus,
    });
  }
  if (step.stepStatus !== "PENDING" || step.approvalStatus !== "REQUESTED") {
    throw conflict("Für diesen Kettenschritt liegt keine offene, angeforderte Freigabe vor.", {
      chainId,
      chainStep: stepNumber,
      stepStatus: step.stepStatus,
      approvalStatus: step.approvalStatus,
    });
  }

  // Vorgängerergebnis laden und prüfen (Übergabe echter Ergebnisse, siehe
  // Auftrag Abschnitt "Übergabe echter Ergebnisse"). Läuft VOR jedem
  // Tokenverbrauch, damit ein Integritätsbefund die Freigabe nicht verbraucht
  // und die Kette bei einem Befund eindeutig blockiert wird.
  let predecessorStep = null;
  let predecessorRun = null;
  let freshPredecessorDigest = null;
  if (stepNumber > 1) {
    predecessorStep = authDb.getPilotAgentExecutionChainStepByNumber(db, chainId, stepNumber - 1);
    if (!predecessorStep || predecessorStep.stepStatus !== "SUCCEEDED" || !predecessorStep.executionRunId) {
      blockChain(db, chain, "PREDECESSOR_RESULT_MISSING", now, actorUserId);
      throw conflict("Das Vorgängerergebnis fehlt oder ist nicht erfolgreich abgeschlossen. Die Kette wurde blockiert.", {
        chainId,
        chainStep: stepNumber,
      });
    }
    predecessorRun = authDb.getPilotAgentExecutionRunById(db, predecessorStep.executionRunId);
    if (
      !predecessorRun ||
      predecessorRun.status !== "SUCCEEDED" ||
      !predecessorRun.resultRawText ||
      predecessorRun.actualRunnerKind !== pilotAgentExecutionService.RUNNER_KINDS.CODEX
    ) {
      blockChain(db, chain, "PREDECESSOR_RESULT_UNAVAILABLE", now, actorUserId);
      throw conflict("Das persistierte Vorgängerergebnis ist nicht verfügbar oder nicht gültig. Die Kette wurde blockiert.", {
        chainId,
        chainStep: stepNumber,
      });
    }
    freshPredecessorDigest = sha256Hex(predecessorRun.resultRawText);
    if (predecessorStep.resultDigest && predecessorStep.resultDigest !== freshPredecessorDigest) {
      blockChain(db, chain, "PREDECESSOR_RESULT_DIGEST_MISMATCH", now, actorUserId);
      throw conflict(
        "Das Vorgängerergebnis wurde nach dessen Abschluss verändert (Digest-Abweichung). Die Kette wurde blockiert.",
        { chainId, chainStep: stepNumber },
      );
    }
  }

  const consumeOutcome = consumeChainApprovalToken(
    options.approvalToken,
    {
      chainId,
      chainStep: stepNumber,
      agentKey: step.agentKey,
      presetId: step.presetId,
      runnerKind: pilotAgentExecutionService.RUNNER_KINDS.CODEX,
      actorUserId,
      currentRevision: chain.revision,
    },
    { nowProvider: options.chainApprovalNowProvider },
  );
  if (!consumeOutcome.ok) {
    throw conflict(`Für diesen Kettenschritt liegt keine gültige, frische Freigabe vor (${consumeOutcome.reason}).`, {
      chainId,
      chainStep: stepNumber,
      reasonCode: consumeOutcome.reason,
    });
  }

  const runningChainStatus = stepNumberToRunningStatus(stepNumber);
  const startedAt = nowIso(now);
  authDb.withAuthTransaction(db, () => {
    const stepApplied = authDb.updatePilotAgentExecutionChainStepStarted(db, {
      id: step.id,
      startedAt,
      chainedFromExecutionRunId: predecessorStep ? predecessorStep.executionRunId : null,
      predecessorResultDigest: freshPredecessorDigest,
    });
    if (!stepApplied) {
      throw conflict("Kettenschritt konnte nicht gestartet werden (evtl. bereits parallel gestartet).", { chainId, chainStep: stepNumber });
    }
    const chainApplied = authDb.updatePilotAgentExecutionChainStatusConditional(db, {
      id: chain.id,
      expectedStatus: expectedWaitingStatus,
      expectedRevision: chain.revision,
      nextStatus: runningChainStatus,
      waitingForJamal: false,
      updatedAt: startedAt,
    });
    if (!chainApplied) {
      throw conflict("Die Kette hat sich seit dem zuletzt gelesenen Zustand geändert (evtl. paralleler Start).", {
        chainId,
        expectedRevision: chain.revision,
      });
    }
    authAudit.recordAuditEvent(db, {
      eventType: "CHAIN_STEP_STARTED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: startedAt,
      metadata: {
        chainId,
        chainStep: stepNumber,
        agentKey: step.agentKey,
        runnerKind: pilotAgentExecutionService.RUNNER_KINDS.CODEX,
        ...(predecessorStep ? { predecessorExecutionRunId: predecessorStep.executionRunId } : {}),
        status: runningChainStatus,
      },
    });
  });

  // -------------------------------------------------------------------
  // V7.7.0 Korrektur 3 ("Fail-Stuck zwischen Tokenverbrauch und
  // Runnerstart verhindern", Blocker 3): AB HIER (nach dem atomaren
  // RUNNING-Übergang oben) läuft JEDE potenziell werfende Operation –
  // interne Codex-Freigabe erzeugen, Agentenlauf starten UND die
  // anschließende Terminalisierung selbst – in einem einheitlichen,
  // geschützten Fehlerpfad. Vorher konnte ein Fehler zwischen dem
  // Tokenverbrauch/RUNNING-Übergang und dem inneren Codex-Freigabeaufruf
  // (der bisher UNGESCHÜTZT, ohne try/catch, direkt danach stand) die
  // Kette dauerhaft in RUNNING mit executionRunId = null zurücklassen –
  // ohne jeden Fortsetzungs- oder Korrekturpfad. Beide inneren Aufrufe
  // laufen jetzt außerdem über die V7.7.0-Korrektur-2-Einstiegspunkte
  // (…ForChainInternal) statt der normalen, von außen erreichbaren
  // Funktionen.
  let execOutcome;
  try {
    // Interne, ausschließlich serverseitige Weiterverdrahtung an die
    // bereits bestehende Einzellauf-Freigabe (siehe Kopfkommentar oben im
    // Modul) – KEINE zweite Jamal-Freigabe, ausschließlich eine
    // automatische Konsequenz der bereits oben verbrauchten, echten
    // Ketten-Freigabe.
    const innerApproval = pilotAgentExecutionService.requestCodexRunApprovalForChainInternal(db, {
      pilotOrderId: chain.pilotOrderId,
      presetId: step.presetId,
      actorUserId,
      now,
    });

    execOutcome = await pilotAgentExecutionService.startAgentExecutionRunForChainInternal(db, {
      presetId: step.presetId,
      pilotOrderId: chain.pilotOrderId,
      actorUserId,
      now,
      approvalToken: innerApproval.approvalToken,
      predecessorContext: predecessorStep
        ? {
            fromAgentKey: predecessorStep.agentKey,
            fromExecutionRunId: predecessorStep.executionRunId,
            resultText: predecessorRun.resultRawText,
          }
        : undefined,
      attemptTimeoutMs: options.attemptTimeoutMs,
      shouldAbort: options.shouldAbort,
      codexAvailabilityOptions: options.codexAvailabilityOptions,
      codexApprovalNowProvider: options.codexApprovalNowProvider,
      codexExecFileImpl: options.codexExecFileImpl,
      codexAdapterImpl: options.codexAdapterImpl,
      codexWorkspaceModuleImpl: options.codexWorkspaceModuleImpl,
    });
  } catch (preRunError) {
    // Weder die interne Freigabeerzeugung noch der Laufstart selbst haben
    // hier bereits eine executionRunId hervorgebracht (siehe
    // startAgentExecutionRun: die RUNNING-Zeile wird dort in einer eigenen
    // Transaktion angelegt – wirft etwas VOR dieser Anlage, existiert kein
    // Lauf; wirft etwas DANACH, siehe finalizeAgentExecutionRun dort, das
    // bereits selbst einen sicheren FAILED-Zustand herstellt und den
    // Fehler erneut wirft). Kette/Schritt werden hier kontrolliert
    // terminalisiert statt dauerhaft RUNNING zu bleiben.
    try {
      return finalizeChainStepFailure(db, {
        chain,
        step,
        stepNumber,
        now,
        actorUserId,
        errorMessage: String((preRunError && preRunError.message) || preRunError),
        executionRunId: null,
        failureReasonCode: "STEP_START_FAILED",
      });
    } catch (finalizationError) {
      return emergencyFinalizeChainStepAfterError(db, {
        chain,
        step,
        stepNumber,
        now,
        actorUserId,
        executionRunId: null,
        originalError: finalizationError,
      });
    }
  }

  try {
    const run = execOutcome.run;
    if (run.status === "SUCCEEDED") {
      return finalizeChainStepSuccess(db, { chain, step, stepNumber, now, actorUserId, run });
    }
    return finalizeChainStepFailure(db, {
      chain,
      step,
      stepNumber,
      now,
      actorUserId,
      errorMessage: run.errorMessage,
      executionRunId: run.id,
    });
  } catch (finalizationError) {
    // Der zugrunde liegende Agentenlauf (pilot_agent_execution_runs) ist zu
    // diesem Zeitpunkt bereits UNABHÄNGIG von dieser Terminalisierung
    // dauerhaft persistiert (eigene, bereits abgeschlossene Transaktion in
    // pilot-agent-execution-service.js) – ein hier scheiterndes
    // Kettenbuchhaltungs-Update vernichtet dieses Ergebnis NICHT. Die
    // Kette/der Schritt werden best effort auf FAILED gesetzt, unter
    // Beibehaltung der bereits bekannten executionRunId (kein Ergebnis wird
    // überschrieben, kein Vorgängerergebnis vernichtet).
    return emergencyFinalizeChainStepAfterError(db, {
      chain,
      step,
      stepNumber,
      now,
      actorUserId,
      executionRunId: execOutcome && execOutcome.run ? execOutcome.run.id : null,
      originalError: finalizationError,
    });
  }
}

module.exports = {
  PilotAgentExecutionChainError,
  CHAIN_STEP_DEFINITIONS,
  CHAIN_APPROVAL_TOKEN_TTL_MS,
  prepareChain,
  getChainView,
  listChainsForOrder,
  requestStepApproval,
  startStep,
  clearChainApprovalTokensForTests,
  // Ausschließlich für gezielte Bindungs-/TTL-Unit-Tests exportiert (siehe
  // pilot-agent-execution-service.js#consumeCodexRunApproval, gleiches
  // Muster) – der produktive Aufrufpfad läuft ausschließlich über
  // requestStepApproval/startStep oben.
  consumeChainApprovalToken,
};
