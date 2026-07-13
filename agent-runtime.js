"use strict";

(function initAgentRuntime(root, factory) {
  const agentRegistryApi =
    typeof module === "object" && module.exports
      ? require("./agent-registry")
      : root?.AgentRegistry;
  const dailyWorkRunApi =
    typeof module === "object" && module.exports
      ? require("./daily-work-run")
      : root?.DailyWorkRun;
  const api = factory(agentRegistryApi, dailyWorkRunApi);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AgentRuntime = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAgentRuntimeApi(AgentRegistry, DailyWorkRun) {
  const RUNTIME_VERSION = "1.0.0";
  const HEALTH_PILOT_PROJECT_ID = "health-upgrade-kompass";
  const PROJEKTMANAGER_ROLE_NAME = "Projektmanager-Agent";
  const APPROVAL_EXPLANATION =
    "Freigabe gilt nur für den lokalen deterministischen Pilot-Executor.";
  const DEFAULT_TIMEOUT_MS = 30000;

  const RUNTIME_STATUSES = Object.freeze([
    "PREPARED",
    "AWAITING_JAMAL_APPROVAL",
    "APPROVED",
    "QUEUED",
    "RUNNING",
    "RESULT_REVIEW_REQUIRED",
    "ACCEPTED",
    "REJECTED",
    "FAILED",
    "CANCELLED",
    "TIMED_OUT",
  ]);

  const TERMINAL_STATUSES = Object.freeze(["ACCEPTED", "REJECTED", "CANCELLED"]);
  const ACTIVE_STATUSES = Object.freeze(["QUEUED", "RUNNING"]);
  const AUDIT_EVENT_TYPES = Object.freeze([
    "PREPARED",
    "APPROVAL_GRANTED",
    "APPROVAL_INVALIDATED",
    "START_REQUESTED",
    "QUEUED",
    "RUNNING",
    "RESULT_CREATED",
    "RESULT_ACCEPTED",
    "RESULT_REJECTED",
    "CANCEL_REQUESTED",
    "CANCELLED",
    "FAILED",
    "TIMED_OUT",
  ]);

  const REQUIRED_SNAPSHOT_FIELDS = Object.freeze([
    "runtimeVersion",
    "runtimeAttemptId",
    "dailyRunId",
    "projectId",
    "projectName",
    "workItemId",
    "agentId",
    "agentName",
    "assignment",
    "expectedResult",
    "reviewCriteria",
    "safetyBoundary",
    "dependencies",
    "workItemStatus",
    "desiredDailyOutcome",
    "preparedAt",
    "inputFingerprint",
  ]);

  const REQUIRED_RESULT_FIELDS = Object.freeze([
    "resultVersion",
    "executorType",
    "agentId",
    "workItemId",
    "summary",
    "completenessFindings",
    "missingFields",
    "dependencyFindings",
    "reviewCriteriaFindings",
    "safetyBoundaryFindings",
    "openPoints",
    "blockers",
    "recommendedNextStep",
    "externalRequestMade",
    "filesChanged",
    "pluginExecuted",
    "agentAiExecuted",
    "completedAt",
  ]);

  let sequence = 0;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isoDateTime(value = new Date()) {
    return new Date(value).toISOString();
  }

  function nextId(prefix) {
    sequence += 1;
    return `${prefix}-${Date.now()}-${sequence}`;
  }

  function assertDependencies() {
    if (!AgentRegistry?.ROLE_NAME_MAPPING || !AgentRegistry?.hasAgentId) {
      throw new Error("AgentRegistry ist nicht verfügbar.");
    }
    if (!DailyWorkRun?.getAgentReviewPhase) {
      throw new Error("DailyWorkRun ist nicht verfügbar.");
    }
  }

  function resolveProjektmanagerAgentId() {
    assertDependencies();
    const matches = Object.entries(AgentRegistry.ROLE_NAME_MAPPING).filter(
      ([roleName]) => roleName === PROJEKTMANAGER_ROLE_NAME,
    );
    if (matches.length !== 1) {
      throw new Error("Projektmanager-Agent ist im kanonischen Register nicht eindeutig.");
    }
    const agentId = matches[0][1];
    if (!AgentRegistry.hasAgentId(agentId)) {
      throw new Error("Projektmanager-Agent verweist auf eine unbekannte Agenten-ID.");
    }
    return agentId;
  }

  function getProjektmanagerAgent() {
    const agentId = resolveProjektmanagerAgentId();
    return { agentId, agent: AgentRegistry.getAgentById(agentId) };
  }

  function isRuntimeActive(pilot) {
    return Boolean(pilot && ACTIVE_STATUSES.includes(pilot.status));
  }

  function isRuntimeTerminal(pilot) {
    return Boolean(pilot && (TERMINAL_STATUSES.includes(pilot.status) || pilot.status === "FAILED" || pilot.status === "TIMED_OUT"));
  }

  function createAuditEvent(values = {}) {
    return Object.freeze({
      eventId: values.eventId || nextId("audit"),
      runtimeAttemptId: values.runtimeAttemptId,
      eventType: values.eventType,
      timestamp: isoDateTime(values.timestamp || values.now || new Date()),
      actor: values.actor || "system",
      fromStatus: values.fromStatus || null,
      toStatus: values.toStatus || null,
      message: String(values.message || "").trim(),
    });
  }

  function appendAudit(pilot, eventInput) {
    const next = clone(pilot);
    const event = createAuditEvent({
      ...eventInput,
      runtimeAttemptId: next.runtimeAttemptId,
    });
    if (!AUDIT_EVENT_TYPES.includes(event.eventType)) {
      throw new Error("Unzulässiger Audit-Ereignistyp.");
    }
    next.auditLog = Array.isArray(next.auditLog) ? next.auditLog.slice() : [];
    const duplicateTerminal = next.auditLog.some(
      (entry) =>
        entry.runtimeAttemptId === event.runtimeAttemptId &&
        ["RESULT_ACCEPTED", "RESULT_REJECTED", "CANCELLED", "FAILED", "TIMED_OUT"].includes(entry.eventType) &&
        ["RESULT_ACCEPTED", "RESULT_REJECTED", "CANCELLED", "FAILED", "TIMED_OUT"].includes(event.eventType),
    );
    if (duplicateTerminal) {
      throw new Error("Terminaler Laufabschluss wurde bereits protokolliert.");
    }
    next.auditLog.push(event);
    return next;
  }

  function buildFingerprintPayload(snapshotInput) {
    return {
      runtimeVersion: snapshotInput.runtimeVersion,
      dailyRunId: snapshotInput.dailyRunId,
      projectId: snapshotInput.projectId,
      workItemId: snapshotInput.workItemId,
      agentId: snapshotInput.agentId,
      assignment: snapshotInput.assignment,
      expectedResult: snapshotInput.expectedResult,
      reviewCriteria: snapshotInput.reviewCriteria,
      safetyBoundary: snapshotInput.safetyBoundary,
      dependencies: snapshotInput.dependencies,
      workItemStatus: snapshotInput.workItemStatus,
      desiredDailyOutcome: snapshotInput.desiredDailyOutcome,
    };
  }

  function computeInputFingerprint(snapshotInput) {
    const canonical = JSON.stringify(buildFingerprintPayload(snapshotInput));
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
      hash ^= canonical.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function getWorkItem(run, agentId) {
    const phase = DailyWorkRun.getAgentReviewPhase(run);
    return phase.workItems.find((item) => item.agentId === agentId) || null;
  }

  function evaluateAvailability(run) {
    assertDependencies();
    const reasons = [];
    const pilotAgentId = resolveProjektmanagerAgentId();

    if (!run || typeof run !== "object") {
      return { available: false, reasons: ["Kein Tageslauf vorhanden."], pilotAgentId, workItem: null };
    }
    if (run.focusProjectId !== HEALTH_PILOT_PROJECT_ID) {
      reasons.push("Der Agenten-Laufzeit-Pilot ist in V6.43.0 nur für Health Upgrade Kompass verfügbar.");
    }
    if (!run.workProposal?.selectedAgentIds?.length) {
      reasons.push("Ein gültiger Arbeitsvorschlag fehlt.");
    }
    if (run.status !== "READY_FOR_CODEX") {
      reasons.push("Der Tageslauf ist nicht in der Arbeitsvorschlagsphase.");
    }

    const phase = DailyWorkRun.getAgentReviewPhase(run);
    if (!phase.preparedAt) {
      reasons.push("Die Agenten-Prüfphase ist noch nicht vorbereitet.");
    }
    if (phase.approvalDecision !== "APPROVED" || !phase.approvedAt) {
      reasons.push("Jamals Freigabe der Prüfphase fehlt.");
    }
    if (!run.workProposal?.selectedAgentIds?.includes(pilotAgentId)) {
      reasons.push("Der Projektmanager-Agent ist im aktuellen Einsatzplan nicht ausgewählt.");
    }

    const workItem = getWorkItem(run, pilotAgentId);
    if (!workItem) {
      reasons.push("Die Projektmanager-Arbeitskarte fehlt.");
    } else {
      if (!workItem.subtask || !workItem.expectedResult || !workItem.acceptanceCheck) {
        reasons.push("Der Projektmanager-Auftrag ist noch nicht vollständig vorbereitet.");
      }
      if (workItem.resultConfirmedAt) {
        reasons.push("Für diese Arbeitskarte liegt bereits ein bestätigter Befund vor.");
      }
    }

    if (isRuntimeActive(run.agentRuntimePilot)) {
      reasons.push("Ein Runtime-Versuch ist bereits aktiv.");
    }

    return {
      available: reasons.length === 0,
      reasons,
      pilotAgentId,
      workItem,
      phase,
    };
  }

  function buildInputSnapshot(run, workItem, options = {}) {
    const pilotAgentId = resolveProjektmanagerAgentId();
    const agent = AgentRegistry.getAgentById(pilotAgentId);
    const snapshot = {
      runtimeVersion: RUNTIME_VERSION,
      runtimeAttemptId: options.runtimeAttemptId || nextId("runtime"),
      dailyRunId: run.id,
      projectId: run.focusProjectId,
      projectName: run.canonicalSnapshot?.displayName || run.focusProjectId,
      workProposalId: run.workProposal?.understoodGoal || null,
      workItemId: `${run.id}:${pilotAgentId}`,
      agentId: pilotAgentId,
      agentName: workItem.agentName || agent?.name || pilotAgentId,
      assignment: workItem.subtask,
      expectedResult: workItem.expectedResult,
      reviewCriteria: workItem.acceptanceCheck,
      safetyBoundary: workItem.safetyBoundary,
      dependencies: clone(workItem.dependsOn || []),
      workItemStatus: workItem.status,
      desiredDailyOutcome: run.dailyOutcome?.desiredOutcome || "",
      preparedAt: isoDateTime(options.now || new Date()),
      inputFingerprint: "",
    };
    snapshot.inputFingerprint = computeInputFingerprint(snapshot);
    return snapshot;
  }

  function validateSnapshot(snapshot) {
    const missing = REQUIRED_SNAPSHOT_FIELDS.filter((field) => {
      const value = snapshot?.[field];
      if (field === "dependencies") return !Array.isArray(value);
      if (field === "workProposalId") return false;
      return value === undefined || value === null || String(value).trim() === "";
    });
    if (missing.length > 0) {
      throw new Error(`Eingabe-Snapshot unvollständig: ${missing.join(", ")}`);
    }
    return true;
  }

  function createRuntimePilot(run, options = {}) {
    const availability = evaluateAvailability(run);
    if (!availability.available) {
      throw new Error(availability.reasons.join(" "));
    }
    if (run.agentRuntimePilot && !isRuntimeTerminal(run.agentRuntimePilot)) {
      throw new Error("Ein bestehender Runtime-Versuch blockiert eine neue Vorbereitung.");
    }

    const runtimeAttemptId = nextId("runtime");
    const inputSnapshot = buildInputSnapshot(run, availability.workItem, {
      runtimeAttemptId,
      now: options.now,
    });
    validateSnapshot(inputSnapshot);

    let pilot = {
      runtimeVersion: RUNTIME_VERSION,
      runtimeAttemptId,
      status: "PREPARED",
      localDeterministicPilotOnly: true,
      pilotAgentId: availability.pilotAgentId,
      pilotAgentRoleName: PROJEKTMANAGER_ROLE_NAME,
      inputSnapshot,
      approval: null,
      result: null,
      rejection: null,
      startedAt: null,
      completedAt: null,
      auditLog: [],
    };
    pilot = appendAudit(pilot, {
      eventType: "PREPARED",
      actor: options.actor || "Jamal",
      fromStatus: null,
      toStatus: "PREPARED",
      message: "Lokaler deterministischer Pilot vorbereitet. Kein Lauf gestartet.",
      now: options.now,
    });
    pilot.status = "AWAITING_JAMAL_APPROVAL";
    return pilot;
  }

  function syncApprovalFingerprint(pilot, currentFingerprint) {
    if (!pilot?.approval) return clone(pilot);
    if (pilot.approval.inputFingerprint === currentFingerprint) return clone(pilot);
    const next = clone(pilot);
    next.approval = null;
    if (next.status === "APPROVED") {
      next.status = "AWAITING_JAMAL_APPROVAL";
    }
    return appendAudit(next, {
      eventType: "APPROVAL_INVALIDATED",
      actor: "system",
      fromStatus: "APPROVED",
      toStatus: "AWAITING_JAMAL_APPROVAL",
      message: "Freigabe ungültig, weil sich relevante Eingaben geändert haben.",
    });
  }

  function grantJamalApproval(pilot, options = {}) {
    if (!pilot) throw new Error("Runtime-Pilot fehlt.");
    if (!["PREPARED", "AWAITING_JAMAL_APPROVAL"].includes(pilot.status)) {
      throw new Error("Freigabe ist im aktuellen Status nicht möglich.");
    }
    const fingerprint = pilot.inputSnapshot?.inputFingerprint;
    if (!fingerprint) throw new Error("Eingabe-Fingerprint fehlt.");

    let next = syncApprovalFingerprint(pilot, fingerprint);
    next.approval = {
      approvedBy: "Jamal",
      approvedAt: isoDateTime(options.now || new Date()),
      scope: String(options.scope || next.inputSnapshot.assignment || "").trim(),
      inputFingerprint: fingerprint,
      explanation: APPROVAL_EXPLANATION,
      localDeterministicPilotOnly: true,
      noExternalAi: true,
      noPlugins: true,
      noFileWrites: true,
      noNetworkAccess: true,
    };
    const fromStatus = next.status;
    next.status = "APPROVED";
    next = appendAudit(next, {
      eventType: "APPROVAL_GRANTED",
      actor: "Jamal",
      fromStatus,
      toStatus: "APPROVED",
      message: APPROVAL_EXPLANATION,
      now: options.now,
    });
    return next;
  }

  function assertStartAllowed(pilot) {
    if (!pilot) throw new Error("Runtime-Pilot fehlt.");
    if (pilot.status !== "APPROVED") {
      throw new Error("Start ist ohne APPROVED nicht erlaubt.");
    }
    if (!pilot.approval || pilot.approval.approvedBy !== "Jamal") {
      throw new Error("Jamals Freigabe fehlt.");
    }
    const currentFingerprint = pilot.inputSnapshot?.inputFingerprint;
    if (pilot.approval.inputFingerprint !== currentFingerprint) {
      throw new Error("Freigabe ist wegen geänderter Eingaben ungültig.");
    }
    if (pilot.startedAt) {
      throw new Error("Dieser Runtime-Versuch wurde bereits gestartet.");
    }
    if (isRuntimeActive(pilot)) {
      throw new Error("Ein aktiver Lauf ist bereits vorhanden.");
    }
  }

  function requestStart(pilot, options = {}) {
    assertStartAllowed(pilot);
    let next = clone(pilot);
    next = appendAudit(next, {
      eventType: "START_REQUESTED",
      actor: options.actor || "Jamal",
      fromStatus: next.status,
      toStatus: next.status,
      message: "Bewusster Start angefordert.",
      now: options.now,
    });
    next.status = "QUEUED";
    next = appendAudit(next, {
      eventType: "QUEUED",
      actor: "system",
      fromStatus: "APPROVED",
      toStatus: "QUEUED",
      message: "Lokaler Pilot in Warteschlange.",
      now: options.now,
    });
    return next;
  }

  function validateExecutorResult(result, snapshot) {
    const missing = REQUIRED_RESULT_FIELDS.filter((field) => result?.[field] === undefined || result?.[field] === null);
    if (missing.length > 0) {
      throw new Error(`Ergebnisformat unvollständig: ${missing.join(", ")}`);
    }
    if (result.executorType !== "LOCAL_DETERMINISTIC_PILOT") {
      throw new Error("Unzulässiger Executor-Typ.");
    }
    if (result.agentId !== snapshot.agentId) {
      throw new Error("Ergebnis gehört nicht zum Pilot-Agenten.");
    }
    if (result.workItemId !== snapshot.workItemId) {
      throw new Error("Ergebnis gehört nicht zur Arbeitskarte.");
    }
    if (result.externalRequestMade !== false || result.filesChanged !== false || result.pluginExecuted !== false || result.agentAiExecuted !== false) {
      throw new Error("Lokaler Pilot darf keine externe oder Schreibwirkung behaupten.");
    }
    return true;
  }

  function markRunning(pilot, options = {}) {
    let next = clone(pilot);
    const fromStatus = next.status;
    next.status = "RUNNING";
    next.startedAt = isoDateTime(options.now || new Date());
    return appendAudit(next, {
      eventType: "RUNNING",
      actor: "system",
      fromStatus,
      toStatus: "RUNNING",
      message: "Lokaler deterministischer Pilot läuft.",
      now: options.now,
    });
  }

  function markFailed(pilot, message, options = {}) {
    let next = clone(pilot);
    const fromStatus = next.status;
    next.status = "FAILED";
    next.completedAt = isoDateTime(options.now || new Date());
    next.result = null;
    return appendAudit(next, {
      eventType: "FAILED",
      actor: "system",
      fromStatus,
      toStatus: "FAILED",
      message: String(message || "Lauf fehlgeschlagen.").slice(0, 500),
      now: options.now,
    });
  }

  function markTimedOut(pilot, options = {}) {
    let next = clone(pilot);
    const fromStatus = next.status;
    next.status = "TIMED_OUT";
    next.completedAt = isoDateTime(options.now || new Date());
    next.result = null;
    return appendAudit(next, {
      eventType: "TIMED_OUT",
      actor: "system",
      fromStatus,
      toStatus: "TIMED_OUT",
      message: "Laufzeitgrenze erreicht. Keine Ergebnisübernahme.",
      now: options.now,
    });
  }

  function markCancelled(pilot, options = {}) {
    let next = clone(pilot);
    const fromStatus = next.status;
    next.status = "CANCELLED";
    next.completedAt = isoDateTime(options.now || new Date());
    next.result = null;
    return appendAudit(next, {
      eventType: options.cancelRequested ? "CANCELLED" : "CANCELLED",
      actor: options.actor || "Jamal",
      fromStatus,
      toStatus: "CANCELLED",
      message: String(options.message || "Lauf bewusst abgebrochen.").slice(0, 500),
      now: options.now,
    });
  }

  function markResultCreated(pilot, result, options = {}) {
    let next = clone(pilot);
    validateExecutorResult(result, next.inputSnapshot);
    next.result = clone(result);
    next.status = "RESULT_REVIEW_REQUIRED";
    next.completedAt = isoDateTime(options.now || new Date());
    return appendAudit(next, {
      eventType: "RESULT_CREATED",
      actor: "system",
      fromStatus: "RUNNING",
      toStatus: "RESULT_REVIEW_REQUIRED",
      message: "Strukturiertes Ergebnis zur manuellen Prüfung erstellt.",
      now: options.now,
    });
  }

  function createLocalDeterministicPilotExecutor() {
    return {
      async execute({ runtimeAttempt, signal, now }) {
        if (signal?.aborted) {
          const error = new Error("Abgebrochen");
          error.name = "AbortError";
          throw error;
        }
        const snapshot = runtimeAttempt.inputSnapshot;
        const missingFields = [];
        const completenessFindings = [];
        const dependencyFindings = [];
        const reviewCriteriaFindings = [];
        const safetyBoundaryFindings = [];
        const openPoints = [];
        const blockers = [];

        REQUIRED_SNAPSHOT_FIELDS.filter((field) => !["workProposalId", "inputFingerprint", "preparedAt", "runtimeVersion", "runtimeAttemptId"].includes(field))
          .forEach((field) => {
            const value = snapshot[field];
            const empty = value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0 && field === "dependencies");
            if (empty && field !== "dependencies") {
              missingFields.push(field);
            }
          });

        if (!missingFields.length) {
          completenessFindings.push("Alle Pflichtfelder des vorbereiteten Arbeitsauftrags sind strukturell vorhanden.");
        } else {
          completenessFindings.push(`Fehlende oder leere Pflichtfelder im Auftrag: ${missingFields.join(", ")}`);
          blockers.push("Arbeitsauftrag ist strukturell unvollständig.");
        }

        if (Array.isArray(snapshot.dependencies) && snapshot.dependencies.length > 0) {
          dependencyFindings.push(`Abhängigkeiten sind dokumentiert: ${snapshot.dependencies.join(", ")}`);
          openPoints.push("Abhängigkeiten wurden nur im Auftrag geprüft, nicht inhaltlich verifiziert.");
        } else {
          dependencyFindings.push("Keine dokumentierten Abhängigkeiten im Auftrag.");
        }

        if (snapshot.reviewCriteria) {
          reviewCriteriaFindings.push(`Prüfkriterium ist formuliert: ${snapshot.reviewCriteria}`);
        } else {
          reviewCriteriaFindings.push("Prüfkriterium fehlt.");
          blockers.push("Prüfkriterium fehlt.");
        }

        if (snapshot.safetyBoundary) {
          safetyBoundaryFindings.push(`Sicherheitsgrenze ist dokumentiert: ${snapshot.safetyBoundary}`);
        } else {
          safetyBoundaryFindings.push("Sicherheitsgrenze fehlt.");
          blockers.push("Sicherheitsgrenze fehlt.");
        }

        if (signal?.aborted) {
          const error = new Error("Abgebrochen");
          error.name = "AbortError";
          throw error;
        }

        return {
          resultVersion: "1.0.0",
          executorType: "LOCAL_DETERMINISTIC_PILOT",
          agentId: snapshot.agentId,
          workItemId: snapshot.workItemId,
          summary:
            "Lokaler deterministischer Pilot: Nur die Qualität und Vollständigkeit des vorbereiteten Projektmanager-Arbeitsauftrags wurde geprüft. Keine Projektdateien, keine externen Quellen, keine KI-Analyse.",
          completenessFindings,
          missingFields,
          dependencyFindings,
          reviewCriteriaFindings,
          safetyBoundaryFindings,
          openPoints,
          blockers,
          recommendedNextStep: blockers.length
            ? "Arbeitsauftrag manuell ergänzen und Pilot erneut vorbereiten."
            : "Ergebnis manuell prüfen und bei Bedarf in die Agenten-Prüfphase übernehmen.",
          externalRequestMade: false,
          filesChanged: false,
          pluginExecuted: false,
          agentAiExecuted: false,
          completedAt: isoDateTime(now || new Date()),
        };
      },
    };
  }

  function runWithExecutor(pilot, executor, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const now = options.now || (() => new Date());
    const nowValue = typeof now === "function" ? now() : now;
    let current = clone(pilot);
    if (current.status === "APPROVED") {
      current = requestStart(current, { actor: options.actor || "Jamal", now: nowValue });
    } else if (!["QUEUED", "RUNNING"].includes(current.status)) {
      throw new Error("Start ist im aktuellen Status nicht erlaubt.");
    }
    if (current.status === "QUEUED") {
      current = markRunning(current, { now: nowValue });
    }

    const abortController = options.abortController || (typeof AbortController !== "undefined" ? new AbortController() : null);
    const signal = options.signal || abortController?.signal;
    let settled = false;
    let timedOut = false;

    const settleGuard = (finalize) => {
      if (settled) return null;
      const value = finalize();
      settled = true;
      return value;
    };

    const runPromise = Promise.resolve()
      .then(() =>
        executor.execute({
          runtimeAttempt: current,
          signal,
          now: nowValue,
        }),
      )
      .then((result) =>
        settleGuard(() => markResultCreated(current, result, { now: nowValue })),
      )
      .catch((error) => {
        if (settled) {
          return markFailed(current, error?.message || "Unbekannter Executor-Fehler", { now: nowValue });
        }
        settled = true;
        if (error?.name === "AbortError") {
          if (timedOut) {
            return markTimedOut(current, { now: nowValue });
          }
          return markCancelled(current, {
            actor: options.actor || "Jamal",
            message: "Lauf bewusst abgebrochen.",
            now: nowValue,
            cancelRequested: true,
          });
        }
        return markFailed(current, error?.message || "Unbekannter Executor-Fehler", { now: nowValue });
      });

    if (!options.disableTimeout) {
      const timer = (options.setTimeout || setTimeout)(() => {
        timedOut = true;
        if (!settled && abortController) abortController.abort();
      }, timeoutMs);
      const clear = options.clearTimeout || clearTimeout;
      return runPromise.finally(() => clear(timer));
    }

    return runPromise;
  }

  function requestCancel(pilot, options = {}) {
    if (!pilot || !ACTIVE_STATUSES.includes(pilot.status)) {
      throw new Error("Abbruch ist nur bei aktivem Lauf möglich.");
    }
    let next = clone(pilot);
    next = appendAudit(next, {
      eventType: "CANCEL_REQUESTED",
      actor: options.actor || "Jamal",
      fromStatus: next.status,
      toStatus: next.status,
      message: "Abbruch angefordert.",
      now: options.now,
    });
    return next;
  }

  function acceptResult(run, pilot, options = {}) {
    if (!pilot || pilot.status !== "RESULT_REVIEW_REQUIRED" || !pilot.result) {
      throw new Error("Es liegt kein prüfpflichtiges Ergebnis vor.");
    }
    if (options.confirmed !== true) {
      throw new Error("Die Ergebnisübernahme muss bewusst bestätigt werden.");
    }

    const pilotAgentId = resolveProjektmanagerAgentId();
    const workItem = getWorkItem(run, pilotAgentId);
    if (!workItem) throw new Error("Arbeitskarte fehlt.");
    if (workItem.resultConfirmedAt) {
      throw new Error("Bestehender bestätigter Befund darf nicht überschrieben werden.");
    }

    const result = pilot.result;
    const resultText = [
      result.summary,
      ...(result.completenessFindings || []).map((entry) => `Vollständigkeit: ${entry}`),
      ...(result.reviewCriteriaFindings || []).map((entry) => `Prüfkriterium: ${entry}`),
      ...(result.safetyBoundaryFindings || []).map((entry) => `Sicherheitsgrenze: ${entry}`),
    ].join("\n");

    const nextRun = DailyWorkRun.recordAgentWorkResult(run, pilotAgentId, {
      resultText,
      openPoints: (result.openPoints || []).join("\n"),
      blockers: (result.blockers || []).join("\n"),
      confirmed: true,
      now: options.now,
      runtimePilotAcceptance: true,
      pilotAgentId,
    });

    let nextPilot = clone(pilot);
    nextPilot.status = "ACCEPTED";
    nextPilot = appendAudit(nextPilot, {
      eventType: "RESULT_ACCEPTED",
      actor: "Jamal",
      fromStatus: "RESULT_REVIEW_REQUIRED",
      toStatus: "ACCEPTED",
      message: "Ergebnis bewusst in die Agenten-Prüfphase übernommen.",
      now: options.now,
    });

    return { run: nextRun, pilot: nextPilot };
  }

  function rejectResult(pilot, options = {}) {
    if (!pilot || pilot.status !== "RESULT_REVIEW_REQUIRED") {
      throw new Error("Ablehnung ist nur bei prüfpflichtigem Ergebnis möglich.");
    }
    let next = clone(pilot);
    next.status = "REJECTED";
    next.rejection = {
      reason: String(options.reason || "Ergebnis manuell abgelehnt.").trim(),
      rejectedAt: isoDateTime(options.now || new Date()),
      rejectedBy: "Jamal",
    };
    next = appendAudit(next, {
      eventType: "RESULT_REJECTED",
      actor: "Jamal",
      fromStatus: "RESULT_REVIEW_REQUIRED",
      toStatus: "REJECTED",
      message: next.rejection.reason,
      now: options.now,
    });
    return next;
  }

  function attachRuntimePilot(run, pilot) {
    const next = clone(run);
    next.agentRuntimePilot = clone(pilot);
    return next;
  }

  function refreshRuntimePilot(run) {
    if (!run?.agentRuntimePilot?.inputSnapshot) return run.agentRuntimePilot || null;
    const availability = evaluateAvailability(run);
    if (!availability.workItem) return run.agentRuntimePilot;
    const freshSnapshot = buildInputSnapshot(run, availability.workItem, {
      runtimeAttemptId: run.agentRuntimePilot.runtimeAttemptId,
      now: run.agentRuntimePilot.inputSnapshot.preparedAt,
    });
    return syncApprovalFingerprint(run.agentRuntimePilot, freshSnapshot.inputFingerprint);
  }

  return Object.freeze({
    RUNTIME_VERSION,
    RUNTIME_STATUSES,
    TERMINAL_STATUSES,
    ACTIVE_STATUSES,
    AUDIT_EVENT_TYPES,
    HEALTH_PILOT_PROJECT_ID,
    PROJEKTMANAGER_ROLE_NAME,
    APPROVAL_EXPLANATION,
    DEFAULT_TIMEOUT_MS,
    REQUIRED_SNAPSHOT_FIELDS,
    REQUIRED_RESULT_FIELDS,
    resolveProjektmanagerAgentId,
    getProjektmanagerAgent,
    evaluateAvailability,
    computeInputFingerprint,
    buildInputSnapshot,
    validateSnapshot,
    createRuntimePilot,
    grantJamalApproval,
    requestStart,
    runWithExecutor,
    requestCancel,
    markCancelled,
    markTimedOut,
    markFailed,
    validateExecutorResult,
    acceptResult,
    rejectResult,
    attachRuntimePilot,
    refreshRuntimePilot,
    createLocalDeterministicPilotExecutor,
    isRuntimeActive,
    isRuntimeTerminal,
    appendAudit,
  });
});
