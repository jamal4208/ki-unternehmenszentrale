"use strict";

(function initGuidedWork(root, factory) {
  const agentRegistry = typeof module === "object" && module.exports
    ? require("./agent-registry")
    : root?.AgentRegistry;
  const healthHybridWork = typeof module === "object" && module.exports
    ? require("./health-hybrid-work")
    : root?.HealthHybridWork || null;
  const api = factory(agentRegistry, healthHybridWork);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GuidedWork = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createGuidedWorkApi(agentRegistryApi, healthHybridWorkApi) {
  const GUIDED_RUN_SCHEMA_VERSION = 2;
  const LEGACY_RUN_SCHEMA_VERSION = 1;
  const SUPPORTED_RUN_SCHEMA_VERSIONS = Object.freeze([1, 2]);
  const PROJECT_MANAGER_AGENT_ID = "orchestrator-agent";
  const QA_AGENT_ID = "quality-test-agent";
  const HEALTH_PROJECT_ID = "health-upgrade-kompass";

  const GUIDED_WORK_PHASES = Object.freeze([
    "NO_RUN",
    "FOCUS",
    "OUTCOME",
    "TEAM",
    "BASELINE",
    "PACKAGE",
    "EXTERNAL",
    "EVIDENCE",
    "REVIEW",
    "CLOSED",
  ]);

  const CANONICAL_AGENTS = agentRegistryApi?.PRODUCTIVE_AGENT_REGISTRY || [];
  if (CANONICAL_AGENTS.length !== 25) {
    throw new Error("Guided Work erfordert das kanonische Register mit 25 Hauptagenten.");
  }
  const AGENTS_BY_ID = new Map(CANONICAL_AGENTS.map((agent) => [agent.id, agent]));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function singleText(value, fieldName, required = false) {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      throw new TypeError(`${fieldName} muss genau ein Textwert sein.`);
    }
    const normalized = String(value ?? "").trim();
    if (required && !normalized) {
      throw new Error(`${fieldName} ist erforderlich.`);
    }
    return normalized;
  }

  function textList(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    const text = String(value ?? "").trim();
    if (!text) return [];
    return text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  }

  function isoDateTime(value = new Date()) {
    return new Date(value).toISOString();
  }

  function isSupportedRunSchemaVersion(version) {
    return SUPPORTED_RUN_SCHEMA_VERSIONS.includes(Number(version));
  }

  function createEmptyGuidedFields() {
    return {
      guidedWorkPhase: "FOCUS",
      outcomeSuggestions: [],
      selectedOutcomeSuggestionId: null,
      knownWorkingTreeBaseline: null,
      draftFindings: null,
      teamRevision: 0,
      responsibleAgentRevision: 0,
      guidedInvalidation: {
        packageInvalidatedAt: null,
        packageInvalidationReason: null,
        previousPackageId: null,
        previousFingerprint: null,
      },
    };
  }

  function ensureGuidedDefaults(run) {
    if (!run || typeof run !== "object") return run;
    const next = clone(run);
    const defaults = createEmptyGuidedFields();
    Object.keys(defaults).forEach((key) => {
      if (next[key] === undefined) next[key] = defaults[key];
    });
    if (!next.guidedInvalidation || typeof next.guidedInvalidation !== "object") {
      next.guidedInvalidation = defaults.guidedInvalidation;
    }
    if (!Array.isArray(next.outcomeSuggestions)) next.outcomeSuggestions = [];
    if (typeof next.teamRevision !== "number") next.teamRevision = 0;
    if (typeof next.responsibleAgentRevision !== "number") next.responsibleAgentRevision = 0;
    return next;
  }

  function packageIsApprovedOrBeyond(pkg) {
    if (!pkg) return false;
    return ["READY_TO_COPY", "IN_EXTERNAL_WORK", "RESULT_READY"].includes(pkg.status);
  }

  function packageIsMutableDraft(pkg) {
    if (!pkg) return true;
    return ["DRAFT", "STALE", "BLOCKED", "ABORTED"].includes(pkg.status);
  }

  function deriveGuidedWorkPhase(run) {
    if (!run) return "NO_RUN";
    const guided = ensureGuidedDefaults(run);
    if (["CLOSED", "OPEN"].includes(guided.status)) return "CLOSED";
    if (guided.agentReviewPhase?.finalDecision?.decidedAt) return "REVIEW";
    if (guided.agentReviewPhase?.preparedAt) {
      const evidence =
        guided.pendingExternalExecutionEvidence ||
        guided.agentReviewPhase?.workItems?.find((item) => item.externalExecutionEvidence)?.externalExecutionEvidence;
      if (evidence?.recordedAt) return "REVIEW";
      if (guided.executionPackage?.status === "IN_EXTERNAL_WORK" || guided.executionPackage?.status === "READY_TO_COPY") {
        return "EXTERNAL";
      }
      return "EVIDENCE";
    }
    if (guided.executionPackage) {
      if (guided.executionPackage.status === "IN_EXTERNAL_WORK") return "EXTERNAL";
      if (guided.executionPackage.status === "READY_TO_COPY") return "PACKAGE";
      return "PACKAGE";
    }
    if (guided.status === "READY_FOR_CODEX" || guided.status === "RESULT_RECORDED") {
      if (
        guided.focusProjectId === HEALTH_PROJECT_ID &&
        guided.knownWorkingTreeBaseline === null &&
        guided._liveWorkingTreeClean === false
      ) {
        return "BASELINE";
      }
      return "TEAM";
    }
    if (guided.focusProjectId && !guided.workProposal) return "OUTCOME";
    if (!guided.focusProjectId) return "FOCUS";
    return "OUTCOME";
  }

  function buildOutcomeSuggestions(run, sources = {}) {
    const suggestions = [];
    const project = sources.canonicalProject || null;
    const history = Array.isArray(sources.projectHistory) ? sources.projectHistory : [];
    const live = sources.liveStatus || null;
    const lastClosure = sources.lastClosureDecision || run?.closure || null;

    function pushSuggestion(partial) {
      if (suggestions.length >= 3) return;
      if (!partial?.title || !partial?.expectedOutcome) return;
      suggestions.push({
        id: `suggestion-${suggestions.length + 1}`,
        title: partial.title,
        expectedOutcome: partial.expectedOutcome,
        selectionReason: partial.selectionReason,
        sourceLabel: partial.sourceLabel,
        sourceKind: partial.sourceKind,
        risk: partial.risk || "Nur Vorbereitung · keine automatische Ausführung",
        smallestSafeStep: partial.smallestSafeStep,
        deterministic: true,
        label: "deterministischer Vorschlag",
      });
    }

    if (project?.nextSafeStep && String(project.nextSafeStep).trim() && project.nextSafeStep !== "UNGEKLÄRT") {
      pushSuggestion({
        title: "Nächsten bestätigten Schritt vorbereiten",
        expectedOutcome: String(project.nextSafeStep).trim(),
        selectionReason: "Der kanonische Projektstand nennt bereits einen nächsten sicheren Schritt.",
        sourceLabel: "Vorgeschlagen aus: letzter bestätigter nächster Schritt",
        sourceKind: "canonical_next_safe_step",
        risk: "Schrittwunsch bleibt manuell wählbar; kein automatischer Start.",
        smallestSafeStep: "Ergebniswunsch aus dem bestätigten nächsten Schritt übernehmen und Arbeitsvorschlag prüfen.",
      });
    }

    if (project?.openDecision && String(project.openDecision).trim() && project.openDecision !== "UNGEKLÄRT") {
      pushSuggestion({
        title: "Offene Entscheidung vorbereiten",
        expectedOutcome: `Entscheidungsgrundlage für: ${String(project.openDecision).trim()}`,
        selectionReason: "In der Projektakte steht eine offene Entscheidung.",
        sourceLabel: "Vorgeschlagen aus: offene Entscheidung",
        sourceKind: "canonical_open_decision",
        risk: "Keine Entscheidung wird vorweggenommen.",
        smallestSafeStep: "Entscheidung als gewünschtes Ergebnis formulieren und Prüffragen vorbereiten.",
      });
    }

    if (project?.blocker && String(project.blocker).trim() && project.blocker !== "UNGEKLÄRT" && !/^kein/i.test(String(project.blocker).trim())) {
      pushSuggestion({
        title: "Bekannten Blocker eingrenzen",
        expectedOutcome: `Blocker klären: ${String(project.blocker).trim()}`,
        selectionReason: "Der aktuelle Projektblocker ist in der Akte dokumentiert.",
        sourceLabel: "Vorgeschlagen aus: bekannter Blocker",
        sourceKind: "canonical_blocker",
        risk: "Keine automatische Bereinigung oder externe Aktion.",
        smallestSafeStep: "Blocker als Ergebniswunsch setzen und sicheren Klärungsschritt beschreiben.",
      });
    }

    const latestHistory = history.find((entry) => entry && (entry.description || entry.nextSafeStep || entry.decision));
    if (suggestions.length < 3 && latestHistory) {
      const nextFromHistory = latestHistory.nextSafeStep || latestHistory.description;
      if (nextFromHistory && String(nextFromHistory).trim()) {
        pushSuggestion({
          title: "Aus letztem bestätigtem Verlauf fortsetzen",
          expectedOutcome: String(nextFromHistory).trim().slice(0, 280),
          selectionReason: "Der letzte bestätigte Projektverlauf liefert einen nachvollziehbaren Anschluss.",
          sourceLabel: "Vorgeschlagen aus: letzter bestätigter Projektverlauf",
          sourceKind: "confirmed_project_history",
          risk: "Historischer Eintrag wird nicht verändert.",
          smallestSafeStep: "Verlaufstext als Entwurf übernehmen und auf den heutigen Umfang begrenzen.",
        });
      }
    }

    if (suggestions.length < 3 && lastClosure?.nextSafeStep && String(lastClosure.nextSafeStep).trim()) {
      pushSuggestion({
        title: "Jamal-Abschlussentscheidung fortführen",
        expectedOutcome: String(lastClosure.nextSafeStep).trim(),
        selectionReason: "Die letzte Jamal-Abschlussentscheidung nennt den nächsten sicheren Schritt.",
        sourceLabel: "Vorgeschlagen aus: letzte Jamal-Abschlussentscheidung",
        sourceKind: "jamal_closure_decision",
        risk: "Kein automatisches Fortschreiben in ein neues Paket.",
        smallestSafeStep: "Abschluss-Schrittwunsch bewusst übernehmen oder anpassen.",
      });
    }

    if (suggestions.length < 2 && live?.live?.workingTreeClean === false) {
      pushSuggestion({
        title: "Unsauberen Live-Stand sichtbar machen",
        expectedOutcome: "Known-dirty-Baseline des Health-Repositories bewusst bestätigen und für Hybrid vorbereiten",
        selectionReason: "Der Live-Status zeigt einen nicht sauberen Working Tree.",
        sourceLabel: "Vorgeschlagen aus: aktueller Live-Status",
        sourceKind: "live_status_dirty",
        risk: "Keine Bereinigung, kein Reset, kein Überschreiben vorhandener Änderungen.",
        smallestSafeStep: "Live-Baseline lesen, relative Pfade prüfen und erst nach Jamal-Bestätigung speichern.",
      });
    }

    if (suggestions.length < 1 && project?.currentGoal && String(project.currentGoal).trim() && project.currentGoal !== "UNGEKLÄRT") {
      pushSuggestion({
        title: "Aktuelles Projektziel vorbereiten",
        expectedOutcome: String(project.currentGoal).trim(),
        selectionReason: "Die kanonische Projektakte nennt ein aktuelles Ziel.",
        sourceLabel: "Vorgeschlagen aus: kanonische Projektakte",
        sourceKind: "canonical_current_goal",
        risk: "Nur vorbereitend; keine Markt- oder Produktgewissheit.",
        smallestSafeStep: "Ziel als gewünschtes Tagesergebnis formulieren.",
      });
    }

    return suggestions.slice(0, 3);
  }

  function attachOutcomeSuggestions(run, sources = {}) {
    const next = ensureGuidedDefaults(run);
    if (next.status !== "DRAFT") {
      return next;
    }
    next.outcomeSuggestions = buildOutcomeSuggestions(next, sources);
    next.selectedOutcomeSuggestionId = null;
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);
    return next;
  }

  function selectOutcomeSuggestion(run, suggestionId) {
    const next = ensureGuidedDefaults(run);
    if (next.status !== "DRAFT") {
      throw new Error("Ergebnisvorschläge können nur im Entwurf gewählt werden.");
    }
    const suggestion = (next.outcomeSuggestions || []).find((entry) => entry.id === suggestionId);
    if (!suggestion) {
      throw new Error("Unbekannter Arbeitsvorschlag.");
    }
    next.selectedOutcomeSuggestionId = suggestion.id;
    next.dailyOutcome = {
      ...next.dailyOutcome,
      desiredOutcome: suggestion.expectedOutcome,
      reason: `${suggestion.sourceLabel}. ${suggestion.selectionReason}`,
      acceptanceCriterion: next.dailyOutcome?.acceptanceCriterion || "",
    };
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);
    return next;
  }

  function clearSelectedOutcomeSuggestion(run) {
    const next = ensureGuidedDefaults(run);
    next.selectedOutcomeSuggestionId = null;
    return next;
  }

  function listEligibleResponsibleAgents(run) {
    const selected = Array.isArray(run?.workProposal?.selectedAgentIds)
      ? run.workProposal.selectedAgentIds
      : [];
    const leadId = run?.workProposal?.leadAgentId || PROJECT_MANAGER_AGENT_ID;
    const approvalId = run?.workProposal?.approvalAgentId || QA_AGENT_ID;
    return selected
      .filter((id) => id && id !== leadId && id !== approvalId)
      .map((id) => AGENTS_BY_ID.get(id))
      .filter(Boolean)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        eligible: true,
      }));
  }

  function assertResponsibleAgentAllowed(run, responsibleAgentId) {
    const id = singleText(responsibleAgentId, "responsibleAgentId", true);
    if (!AGENTS_BY_ID.has(id)) {
      throw new Error("responsibleAgentId muss eine kanonische Agenten-ID sein.");
    }
    if (id === PROJECT_MANAGER_AGENT_ID || id === run?.workProposal?.leadAgentId) {
      throw new Error("Projektmanager-Lead darf nicht responsibleAgentId sein.");
    }
    if (id === QA_AGENT_ID || id === run?.workProposal?.approvalAgentId) {
      throw new Error("QA-Agent darf nicht responsibleAgentId sein.");
    }
    const selected = Array.isArray(run?.workProposal?.selectedAgentIds)
      ? run.workProposal.selectedAgentIds
      : [];
    if (!selected.includes(id)) {
      throw new Error("responsibleAgentId muss im aktuellen Team ausgewählt sein.");
    }
    return id;
  }

  function invalidateMutablePackage(run, reason) {
    const next = ensureGuidedDefaults(run);
    const pkg = next.executionPackage;
    if (!pkg) return next;
    if (packageIsApprovedOrBeyond(pkg)) {
      throw new Error("Nach Paketfreigabe ist keine stille Teamänderung erlaubt. Zuerst sichtbar auf Paketentwurf zurücksetzen.");
    }
    next.guidedInvalidation = {
      packageInvalidatedAt: isoDateTime(),
      packageInvalidationReason: singleText(reason || "Team- oder Verantwortungsänderung", "reason", true),
      previousPackageId: pkg.executionPackageId || null,
      previousFingerprint: pkg.executionPackageFingerprint || null,
    };
    next.executionPackage = null;
    return next;
  }

  function previewTeamChangeImpact(run, nextSelectedAgentIds, nextResponsibleAgentId) {
    const current = ensureGuidedDefaults(run);
    const selected = [...new Set(textList(nextSelectedAgentIds))];
    const leadId = current.workProposal?.leadAgentId || PROJECT_MANAGER_AGENT_ID;
    const approvalId = current.workProposal?.approvalAgentId || QA_AGENT_ID;
    const missingRequired = [leadId, approvalId].filter((id) => !selected.includes(id));
    const responsible = nextResponsibleAgentId
      ? String(nextResponsibleAgentId)
      : current.executionPackage?.responsibleAgentId || null;
    const impact = {
      teamRevisionNext: (current.teamRevision || 0) + 1,
      packageWillBeInvalidated: Boolean(current.executionPackage) && packageIsMutableDraft(current.executionPackage),
      requiresVisiblePackageReset: Boolean(current.executionPackage) && packageIsApprovedOrBeyond(current.executionPackage),
      evidenceWillNotBeReused: true,
      autonomyUnchanged: true,
      missingRequiredAgents: missingRequired,
      responsibleAgentAllowed: false,
      message: "",
    };
    if (missingRequired.length) {
      impact.message = "Lead und QA müssen im Team bleiben.";
      return impact;
    }
    try {
      if (responsible) assertResponsibleAgentAllowed({ ...current, workProposal: { ...current.workProposal, selectedAgentIds: selected } }, responsible);
      impact.responsibleAgentAllowed = true;
    } catch (error) {
      impact.message = error.message;
      return impact;
    }
    if (impact.requiresVisiblePackageReset) {
      impact.message = "Paket ist freigegeben. Zuerst sichtbar auf Entwurf zurücksetzen. Evidenz bleibt historisch erhalten.";
    } else if (impact.packageWillBeInvalidated) {
      impact.message = "Vorhandenes noch nicht ausgeführtes Paket wird invalidiert. Neue Paketerstellung erzeugt neue ID und neuen Fingerprint.";
    } else {
      impact.message = "Teamänderung wird lokal dokumentiert. Keine Autonomieerhöhung.";
    }
    return impact;
  }

  function updateGuidedTeam(run, values = {}) {
    const current = ensureGuidedDefaults(run);
    if (!current.workProposal) {
      throw new Error("Teamänderung erfordert einen vorhandenen Arbeitsvorschlag.");
    }
    if (packageIsApprovedOrBeyond(current.executionPackage) && values.allowAfterVisibleReset !== true) {
      throw new Error("Nach Paketfreigabe keine stille Teamänderung. Zuerst sichtbar auf Paketentwurf zurücksetzen.");
    }

    const leadId = current.workProposal.leadAgentId || PROJECT_MANAGER_AGENT_ID;
    const approvalId = current.workProposal.approvalAgentId || QA_AGENT_ID;
    let selected = [...new Set(textList(values.selectedAgentIds))];
    if (!selected.includes(leadId)) selected.unshift(leadId);
    if (!selected.includes(approvalId)) selected.push(approvalId);
    selected = [...new Set(selected)];

    selected.forEach((id) => {
      if (!AGENTS_BY_ID.has(id)) {
        throw new Error(`Unbekannte Agenten-ID: ${id}`);
      }
    });

    const impact = previewTeamChangeImpact(current, selected, values.responsibleAgentId || current.executionPackage?.responsibleAgentId);
    if (impact.missingRequiredAgents.length) {
      throw new Error(impact.message);
    }
    if (values.confirmImpact !== true) {
      throw new Error(`Teamänderung erfordert sichtbare Bestätigung der Auswirkung: ${impact.message}`);
    }

    let next = clone(current);
    if (next.executionPackage && packageIsMutableDraft(next.executionPackage)) {
      next = invalidateMutablePackage(next, values.reason || "Teamänderung vor Paketausführung");
    }

    const previousPlan = Array.isArray(next.workProposal.agentPlan) ? next.workProposal.agentPlan : [];
    const planById = new Map(previousPlan.map((item) => [item.agentId, item]));
    const nextPlan = selected.map((agentId) => {
      if (planById.has(agentId)) return clone(planById.get(agentId));
      const agent = AGENTS_BY_ID.get(agentId);
      return {
        agentId,
        agentName: agent.name,
        agent: agent.name,
        roleInRun: agent.role,
        role: agent.role,
        canonicalRole: agent.role,
        selectionReason: values.reason || "Manuell durch Jamal zum aktuellen Auftrag ergänzt.",
        subtask: "Fachbeitrag für den aktuellen Tagesauftrag vorbereiten.",
        expectedResult: "Prüfbarer Fachbeitrag ohne automatische Ausführung.",
        acceptanceCheck: "Beitrag ist nachvollziehbar, begrenzt und übergabefähig.",
        safetyBoundary: "Keine automatische Ausführung, kein Commit, kein Push, kein Deployment.",
        dependsOn: agentId === leadId ? [] : [leadId],
        handoffTo: agentId === approvalId ? "jamal" : approvalId,
        executionMode: agentId === leadId ? "final-consolidation" : agentId === approvalId ? "dependent-review" : "parallel",
        isLead: agentId === leadId,
        isApproval: agentId === approvalId,
      };
    });

    const coreAgentIds = selected.filter((id) => id === leadId || id === approvalId || next.workProposal.coreAgentIds?.includes(id)).slice(0, 5);
    const ensuredCore = [...new Set([leadId, approvalId, ...coreAgentIds])].slice(0, Math.max(5, [leadId, approvalId].length));
    const additionalAgentIds = selected.filter((id) => !ensuredCore.includes(id));

    next.workProposal = {
      ...next.workProposal,
      selectedAgentIds: selected,
      coreAgentIds: ensuredCore,
      additionalAgentIds,
      coreAgentCount: ensuredCore.length,
      additionalAgentCount: additionalAgentIds.length,
      excludedAgentCount: CANONICAL_AGENTS.length - selected.length,
      agentPlan: nextPlan,
      teamEditReason: singleText(values.reason || "Manuelle Teamanpassung durch Jamal", "reason", true),
      teamEditedAt: isoDateTime(values.now || new Date()),
    };
    next.teamRevision = (current.teamRevision || 0) + 1;
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);

    if (values.responsibleAgentId) {
      next = setGuidedResponsibleAgentId(next, {
        responsibleAgentId: values.responsibleAgentId,
        reason: values.responsibleReason || values.reason || "Verantwortlichen nach Teamänderung gesetzt",
        confirmImpact: true,
        skipPackageGuard: true,
        now: values.now,
      });
    }
    return next;
  }

  function setGuidedResponsibleAgentId(run, values = {}) {
    const current = ensureGuidedDefaults(run);
    if (!current.workProposal) {
      throw new Error("responsibleAgentId erfordert einen Arbeitsvorschlag.");
    }
    if (packageIsApprovedOrBeyond(current.executionPackage) && values.allowAfterVisibleReset !== true && values.skipPackageGuard !== true) {
      throw new Error("Nach Paketfreigabe keine stille Änderung von responsibleAgentId.");
    }
    const responsibleAgentId = assertResponsibleAgentAllowed(current, values.responsibleAgentId);
    if (values.confirmImpact !== true) {
      throw new Error("Änderung von responsibleAgentId erfordert sichtbare Bestätigung der Auswirkung.");
    }

    let next = clone(current);
    if (next.executionPackage && packageIsMutableDraft(next.executionPackage) && !values.skipPackageGuard) {
      next = invalidateMutablePackage(next, values.reason || "Änderung der technischen Hauptverantwortung");
    } else if (next.executionPackage && packageIsMutableDraft(next.executionPackage) && values.skipPackageGuard) {
      // Package already cleared by team update, or will be recreated.
    }

    next.workProposal = {
      ...next.workProposal,
      preferredResponsibleAgentId: responsibleAgentId,
      responsibleSelectionReason: singleText(values.reason || "Manuell durch Jamal gewählt", "reason", true),
      responsibleSelectedAt: isoDateTime(values.now || new Date()),
    };
    next.responsibleAgentRevision = (current.responsibleAgentRevision || 0) + 1;
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);
    return next;
  }

  function resetExecutionPackageToDraft(run, values = {}) {
    const current = ensureGuidedDefaults(run);
    if (!current.executionPackage) {
      return current;
    }
    if (values.confirmVisibleReset !== true) {
      throw new Error("Zurücksetzen auf Paketentwurf erfordert sichtbare Bestätigung.");
    }
    const next = clone(current);
    next.guidedInvalidation = {
      packageInvalidatedAt: isoDateTime(values.now || new Date()),
      packageInvalidationReason: singleText(
        values.reason || "Sichtbares Zurücksetzen auf Paketentwurf nach Freigabe",
        "reason",
        true,
      ),
      previousPackageId: next.executionPackage.executionPackageId || null,
      previousFingerprint: next.executionPackage.executionPackageFingerprint || null,
    };
    // Historische Evidenz auf Karten bleibt; neues Paket darf sie nicht wiederverwenden.
    next.executionPackage = null;
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);
    return next;
  }

  function computeBaselineFingerprint(payload) {
    const hybrid = healthHybridWorkApi;
    if (hybrid?.computeFingerprint) {
      return hybrid.computeFingerprint(payload);
    }
    const canonical = JSON.stringify(payload);
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
      hash ^= canonical.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `bl-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function buildBaselineDraftFromLiveDetail(liveStatus, run) {
    const live = liveStatus?.live || liveStatus || {};
    const detail = live.workingTreeDetail || liveStatus?.workingTreeDetail || null;
    if (!live.branch || !live.head) {
      throw new Error("Live-Stand für Baseline unvollständig.");
    }
    const dirtyPaths = Array.isArray(detail?.dirtyPaths) ? detail.dirtyPaths : [];
    const untrackedPaths = Array.isArray(detail?.untrackedPaths) ? detail.untrackedPaths : [];
    const fileHashes = Array.isArray(detail?.fileHashes) ? detail.fileHashes : [];
    const workingTreeClean = live.workingTreeClean === true;
    const fingerprint = detail?.baselineFingerprint || computeBaselineFingerprint({
      branch: live.branch,
      headCommit: live.head,
      dirtyPaths,
      untrackedPaths,
      fileHashes,
    });
    return {
      schemaVersion: 1,
      branch: live.branch,
      headCommit: live.head,
      capturedAt: live.readAt || detail?.capturedAt || isoDateTime(),
      dirtyPaths,
      untrackedPaths,
      fileHashes,
      baselineFingerprint: fingerprint,
      workingTreeClean,
      sourceRunId: run?.id || null,
      jamalConfirmedAt: null,
      limitStatus: detail?.limitStatus || "OK",
      confirmationRequired: workingTreeClean !== true,
    };
  }

  function confirmKnownWorkingTreeBaseline(run, liveStatus, values = {}) {
    const current = ensureGuidedDefaults(run);
    if (current.focusProjectId !== HEALTH_PROJECT_ID) {
      throw new Error("Known-dirty-Baseline ist nur für Health Upgrade Kompass vorgesehen.");
    }
    const draft = buildBaselineDraftFromLiveDetail(liveStatus, current);
    if (draft.limitStatus && draft.limitStatus !== "OK") {
      throw new Error("Baseline-Grenzen überschritten. Keine Teilbehauptung möglich.");
    }
    if (draft.workingTreeClean === true) {
      const nextClean = clone(current);
      nextClean.knownWorkingTreeBaseline = {
        ...draft,
        jamalConfirmedAt: isoDateTime(values.now || new Date()),
        jamalConfirmedClean: true,
      };
      nextClean.guidedWorkPhase = deriveGuidedWorkPhase(nextClean);
      return nextClean;
    }
    if (values.confirmed !== true) {
      throw new Error("Jamal muss die known-dirty-Baseline ausdrücklich bestätigen.");
    }
    const required = {
      branch: singleText(values.branch, "branch", true),
      headCommit: singleText(values.headCommit, "headCommit", true),
      baselineFingerprint: singleText(values.baselineFingerprint, "baselineFingerprint", true),
      preserveExistingChanges: values.preserveExistingChanges === true,
    };
    if (required.branch !== draft.branch) {
      throw new Error("Bestätigter Branch weicht vom Live-Stand ab.");
    }
    if (required.headCommit !== draft.headCommit) {
      throw new Error("Bestätigter HEAD weicht vom Live-Stand ab.");
    }
    if (required.baselineFingerprint !== draft.baselineFingerprint) {
      throw new Error("Bestätigter Baseline-Fingerprint weicht vom Live-Stand ab.");
    }
    if (!required.preserveExistingChanges) {
      throw new Error("Bestätigung muss festhalten, dass vorhandene Änderungen weder verworfen noch überschrieben werden dürfen.");
    }
    const confirmedDirtyPaths = textList(values.dirtyPaths);
    const confirmedUntrackedPaths = textList(values.untrackedPaths);
    if (JSON.stringify(confirmedDirtyPaths) !== JSON.stringify(draft.dirtyPaths)) {
      throw new Error("Bestätigte dirty paths weichen vom Live-Stand ab.");
    }
    if (JSON.stringify(confirmedUntrackedPaths) !== JSON.stringify(draft.untrackedPaths)) {
      throw new Error("Bestätigte untracked paths weichen vom Live-Stand ab.");
    }

    const next = clone(current);
    next.knownWorkingTreeBaseline = {
      ...draft,
      dirtyPaths: confirmedDirtyPaths,
      untrackedPaths: confirmedUntrackedPaths,
      jamalConfirmedAt: isoDateTime(values.now || new Date()),
      preserveExistingChanges: true,
      confirmationNote: singleText(
        values.confirmationNote ||
          "Vorhandene Änderungen dürfen weder verworfen noch überschrieben werden.",
        "confirmationNote",
        true,
      ),
    };
    next.guidedWorkPhase = deriveGuidedWorkPhase(next);
    return next;
  }

  function detectBaselineDrift(run, liveStatus) {
    const baseline = run?.knownWorkingTreeBaseline;
    if (!baseline?.jamalConfirmedAt) {
      return { drifted: false, reason: null, packageStatusIfSaved: null };
    }
    const live = liveStatus?.live || liveStatus || {};
    const detail = live.workingTreeDetail || liveStatus?.workingTreeDetail || null;
    if (!live.branch || !live.head) {
      return { drifted: true, reason: "Live-Stand unvollständig", packageStatusIfSaved: "STALE" };
    }
    if (baseline.branch !== live.branch) {
      return { drifted: true, reason: "Branch drift", packageStatusIfSaved: "STALE" };
    }
    if (baseline.headCommit !== live.head) {
      return { drifted: true, reason: "HEAD drift", packageStatusIfSaved: "STALE" };
    }
    const liveFingerprint = detail?.baselineFingerprint || null;
    if (liveFingerprint && baseline.baselineFingerprint !== liveFingerprint) {
      return { drifted: true, reason: "Working-Tree-Fingerprint drift", packageStatusIfSaved: "STALE" };
    }
    return { drifted: false, reason: null, packageStatusIfSaved: null };
  }

  function markPackageStaleOnBaselineDrift(run, liveStatus) {
    const current = ensureGuidedDefaults(run);
    const drift = detectBaselineDrift(current, liveStatus);
    if (!drift.drifted || !current.executionPackage) return current;
    const next = clone(current);
    if (!["ABORTED", "RESULT_READY"].includes(next.executionPackage.status)) {
      next.executionPackage.status = "STALE";
    }
    next.guidedInvalidation = {
      ...next.guidedInvalidation,
      packageInvalidatedAt: isoDateTime(),
      packageInvalidationReason: `Baseline-Drift: ${drift.reason}`,
      previousPackageId: next.executionPackage.executionPackageId,
      previousFingerprint: next.executionPackage.executionPackageFingerprint,
    };
    return next;
  }

  function findExternalEvidence(run) {
    const pending = run?.pendingExternalExecutionEvidence || null;
    if (pending) return { evidence: pending, location: "pending" };
    const items = run?.agentReviewPhase?.workItems || [];
    const withEvidence = items.find((item) => item.externalExecutionEvidence);
    if (withEvidence) {
      return { evidence: withEvidence.externalExecutionEvidence, location: "workItem", agentId: withEvidence.agentId };
    }
    return { evidence: null, location: null };
  }

  function buildDraftFindingsFromEvidence(run) {
    const found = findExternalEvidence(run);
    if (!found.evidence) return null;
    const evidence = found.evidence;
    const runtimePilot = run?.agentReviewPhase?.workItems?.find((item) => item.runtimePilotEvidence)?.runtimePilotEvidence || null;
    return {
      schemaVersion: 1,
      prefilled: true,
      confirmed: false,
      label: "aus Evidenz vorausgefüllt",
      source: "externalExecutionEvidence",
      runtimePilotEvidenceSeparated: true,
      hasRuntimePilotEvidence: Boolean(runtimePilot),
      executionPackageId: evidence.executionPackageId || run?.executionPackage?.executionPackageId || null,
      executionPackageFingerprint: evidence.executionPackageFingerprint || run?.executionPackage?.executionPackageFingerprint || null,
      technicalFindingDraft: {
        resultText: evidence.summary || "",
        openPoints: textList(evidence.openPoints),
        risks: textList(evidence.risks),
        blockers: textList(evidence.hardBlockers),
        confirmed: false,
      },
      qaDraft: {
        resultText: [
          evidence.testOutputSummary ? `Testausgabe: ${evidence.testOutputSummary}` : "",
          typeof evidence.testExitCode === "number" ? `Exit-Code: ${evidence.testExitCode}` : "",
          evidence.summary ? `Bezug: ${evidence.summary}` : "",
        ].filter(Boolean).join("\n"),
        availableAgentIds: (run?.workProposal?.selectedAgentIds || []).slice(),
        missingAgentIds: [],
        blockedAgentIds: textList(evidence.hardBlockers).length ? [run?.executionPackage?.responsibleAgentId].filter(Boolean) : [],
        criteriaAnswered: [],
        safetyBoundariesViolated: [],
        confirmed: false,
      },
      pmDraft: {
        confirmedFindings: evidence.summary ? [evidence.summary] : [],
        openPoints: textList(evidence.openPoints),
        conflicts: [],
        risks: textList(evidence.risks),
        recommendedNextStep: textList(evidence.openPoints)[0] || "Fachbefund, QA und Freigabe manuell prüfen.",
        notApproved: textList(evidence.hardBlockers),
        confirmed: false,
      },
      createdAt: isoDateTime(),
    };
  }

  function attachDraftFindingsFromEvidence(run) {
    const next = ensureGuidedDefaults(run);
    const existingConfirmedTechnical = (next.agentReviewPhase?.workItems || []).some(
      (item) => item.resultConfirmed === true || item.status === "ACCEPTED",
    );
    const qaConfirmed = Boolean(next.agentReviewPhase?.qa?.confirmedAt);
    const pmConfirmed = Boolean(next.agentReviewPhase?.orchestration?.confirmedAt);
    const draft = buildDraftFindingsFromEvidence(next);
    if (!draft) {
      next.draftFindings = null;
      return next;
    }
    // Niemals bestätigte historische Befunde überschreiben.
    if (existingConfirmedTechnical) {
      draft.technicalFindingDraft = {
        ...(next.draftFindings?.technicalFindingDraft || draft.technicalFindingDraft),
        confirmed: true,
        lockedHistorical: true,
      };
    }
    if (qaConfirmed) {
      draft.qaDraft = {
        ...(next.draftFindings?.qaDraft || draft.qaDraft),
        confirmed: true,
        lockedHistorical: true,
      };
    }
    if (pmConfirmed) {
      draft.pmDraft = {
        ...(next.draftFindings?.pmDraft || draft.pmDraft),
        confirmed: true,
        lockedHistorical: true,
      };
    }
    draft.confirmed = false;
    next.draftFindings = draft;
    return next;
  }

  function getPrimaryGuidedAction(run, context = {}) {
    const phase = deriveGuidedWorkPhase(run);
    const guided = run ? ensureGuidedDefaults(run) : null;
    const actions = {
      NO_RUN: {
        id: "start-run",
        label: "Tageslauf manuell beginnen",
        kind: "primary",
        phase,
      },
      FOCUS: {
        id: "select-focus",
        label: "Fokusprojekt wählen",
        kind: "primary",
        phase,
      },
      OUTCOME: {
        id: "create-proposal",
        label: guided?.selectedOutcomeSuggestionId ? "Arbeitsvorschlag aus Auswahl erstellen" : "Arbeitsvorschlag erstellen",
        kind: "primary",
        phase,
      },
      TEAM: {
        id: "confirm-team-or-prepare",
        label: "Team prüfen und weiter",
        kind: "primary",
        phase,
      },
      BASELINE: {
        id: "confirm-baseline",
        label: "Known-dirty-Baseline bestätigen",
        kind: "primary",
        phase,
      },
      PACKAGE: {
        id: guided?.executionPackage?.status === "READY_TO_COPY" ? "copy-package" : "create-or-approve-package",
        label: guided?.executionPackage?.status === "READY_TO_COPY"
          ? "Paketprompt kopieren"
          : guided?.executionPackage
            ? "Paket freigeben und kopierfertig machen"
            : "Hybrid-Paket erzeugen",
        kind: "primary",
        phase,
      },
      EXTERNAL: {
        id: "paste-result",
        label: "Ergebnis-JSON prüfen",
        kind: "primary",
        phase,
      },
      EVIDENCE: {
        id: "prepare-or-adopt-evidence",
        label: guided?.agentReviewPhase?.preparedAt ? "Evidenz in Prüfung übernehmen" : "Prüfphase vorbereiten",
        kind: "primary",
        phase,
      },
      REVIEW: {
        id: "continue-review",
        label: "Prüfung fortsetzen",
        kind: "primary",
        phase,
      },
      CLOSED: {
        id: "start-new-run",
        label: "Neuen Tageslauf beginnen",
        kind: "primary",
        phase,
      },
    };
    const action = actions[phase] || actions.FOCUS;
    if (context.liveDrift === true && guided?.executionPackage) {
      return {
        id: "resolve-stale",
        label: "Baseline-Drift prüfen",
        kind: "primary",
        phase: "PACKAGE",
      };
    }
    return action;
  }

  function summarizeGuidedProgress(run) {
    const phase = deriveGuidedWorkPhase(run);
    const order = GUIDED_WORK_PHASES.filter((entry) => entry !== "NO_RUN");
    const index = Math.max(0, order.indexOf(phase));
    return {
      phase,
      step: index + 1,
      total: order.length,
      label: `${index + 1}/${order.length}`,
    };
  }

  return Object.freeze({
    GUIDED_RUN_SCHEMA_VERSION,
    LEGACY_RUN_SCHEMA_VERSION,
    SUPPORTED_RUN_SCHEMA_VERSIONS,
    GUIDED_WORK_PHASES,
    PROJECT_MANAGER_AGENT_ID,
    QA_AGENT_ID,
    isSupportedRunSchemaVersion,
    createEmptyGuidedFields,
    ensureGuidedDefaults,
    deriveGuidedWorkPhase,
    buildOutcomeSuggestions,
    attachOutcomeSuggestions,
    selectOutcomeSuggestion,
    clearSelectedOutcomeSuggestion,
    listEligibleResponsibleAgents,
    assertResponsibleAgentAllowed,
    previewTeamChangeImpact,
    updateGuidedTeam,
    setGuidedResponsibleAgentId,
    resetExecutionPackageToDraft,
    invalidateMutablePackage,
    buildBaselineDraftFromLiveDetail,
    confirmKnownWorkingTreeBaseline,
    detectBaselineDrift,
    markPackageStaleOnBaselineDrift,
    buildDraftFindingsFromEvidence,
    attachDraftFindingsFromEvidence,
    getPrimaryGuidedAction,
    summarizeGuidedProgress,
    computeBaselineFingerprint,
  });
});
