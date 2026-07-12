"use strict";

(function initDailyWorkRun(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DailyWorkRun = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDailyWorkRunApi() {
  const SCHEMA_VERSION = 1;
  const DAILY_STORAGE_KEY = "ki-unternehmenszentrale-daily-work-runs-v1";
  const LEGACY_MANAGEMENT_STORAGE_KEY = "ki-unternehmenszentrale-v1";
  const STATUS_VALUES = Object.freeze([
    "DRAFT",
    "READY_FOR_CODEX",
    "RESULT_RECORDED",
    "CLOSED",
    "OPEN",
  ]);
  const FINAL_STATUS_VALUES = Object.freeze(["CLOSED", "OPEN"]);
  const TASK_TYPES = Object.freeze([
    "Agenten- und Einsatzplanung",
    "Entwicklung/Codex",
    "Design",
    "Content",
    "Recherche",
    "Strategie/Entscheidung",
    "Qualität/Prüfung",
    "Plugin-/Werkzeugauswahl",
  ]);

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

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
  }

  function isoDate(value = new Date()) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function isoDateTime(value = new Date()) {
    return new Date(value).toISOString();
  }

  function sentence(value) {
    const text = String(value || "").trim();
    if (!text) return "UNGEKLÄRT.";
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  function createDraftRun(options = {}) {
    const now = options.now || new Date();
    return {
      schemaVersion: SCHEMA_VERSION,
      id: singleText(options.id || `daily-run-${Date.now()}`, "id", true),
      workDate: singleText(options.workDate || isoDate(now), "workDate", true),
      status: "DRAFT",
      focusProjectId: "",
      canonicalSnapshot: {
        capturedAt: null,
        displayName: null,
        portfolioMode: "UNGEKLÄRT",
        verificationStatus: "UNGEKLÄRT",
        lastVerifiedAt: null,
        localPath: null,
        repositoryUrl: null,
        localBranch: null,
        localHead: null,
        remoteRefs: {},
        testCommand: null,
        testStatus: "UNGEKLÄRT",
        currentStatus: "UNGEKLÄRT",
        blocker: "UNGEKLÄRT",
        openDecision: "UNGEKLÄRT",
        safetyProfile: [],
        consentFixStatus: null,
        relatedProjectIds: [],
        notes: [],
        snapshotNotice: "Keine kanonische Momentaufnahme erfasst.",
      },
      dailyOutcome: {
        desiredOutcome: "",
        reason: "",
        acceptanceCriterion: "",
      },
      workProposal: null,
      boundary: {
        prohibitedToday: [],
        projectSafetyRules: [],
        externalActionsBlocked: true,
        codexExecutionBlocked: true,
        agentExecutionBlocked: true,
        automaticGitBlocked: true,
        deploymentBlocked: true,
      },
      decision: {
        blocker: "",
        jamalDecisionQuestion: "",
        jamalDecisionAnswer: "",
      },
      codexPreparation: {
        projectPath: "",
        allowedFiles: [],
        forbiddenFiles: [],
        targetChange: "",
        tests: [],
        gitRules: [],
        fallback: "",
        preparedPrompt: "",
      },
      resultReturn: {
        summary: "",
        changedFiles: [],
        tests: [],
        gitBranch: "",
        commitStatus: "kein Commit",
        pushStatus: "kein Push",
        risks: [],
        openPoints: [],
      },
      closure: {
        status: "",
        jamalDecision: "",
        nextSafeStep: "",
        historyEntry: null,
        historyTransferredAt: null,
        closedAt: null,
      },
    };
  }

  function captureCanonicalSnapshot(project, snapshotNotice, capturedAt = new Date()) {
    if (!project || typeof project !== "object") {
      throw new Error("Ein kanonisches Projekt ist erforderlich.");
    }
    singleText(project.id, "focusProjectId", true);
    return {
      capturedAt: isoDateTime(capturedAt),
      displayName: project.displayName || project.id,
      portfolioMode: project.portfolioMode || "UNGEKLÄRT",
      verificationStatus: project.verificationStatus || "UNGEKLÄRT",
      lastVerifiedAt: project.lastVerifiedAt || null,
      localPath: project.localPath || null,
      repositoryUrl: project.repositoryUrl || null,
      localBranch: project.localBranch || null,
      localHead: project.localHead || null,
      remoteRefs: plainObject(project.remoteRefs),
      testCommand: project.testCommand || null,
      testStatus: project.testStatus || "UNGEKLÄRT",
      currentStatus: project.currentStatus || "UNGEKLÄRT",
      blocker: project.blocker || "UNGEKLÄRT",
      openDecision: project.openDecision || "UNGEKLÄRT",
      safetyProfile: textList(project.safetyProfile),
      consentFixStatus: project.consentFixStatus || null,
      relatedProjectIds: textList(project.relatedProjectIds),
      notes: textList(project.notes),
      snapshotNotice: singleText(
        snapshotNotice || "Historische Tagesstart-Momentaufnahme; keine automatische Live-Aktualisierung.",
        "snapshotNotice",
        true,
      ),
    };
  }

  function setFocusProject(run, project, snapshotNotice, capturedAt) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Das Fokusprojekt kann nur im Status DRAFT geändert werden.");
    }
    next.focusProjectId = singleText(project?.id, "focusProjectId", true);
    next.canonicalSnapshot = captureCanonicalSnapshot(project, snapshotNotice, capturedAt);
    next.boundary.projectSafetyRules = textList(project.safetyProfile);
    next.boundary.prohibitedToday = [
      "Keine automatische Codex- oder Agentenausführung",
      "Keine externe Aktion",
      "Kein automatischer Commit oder Push",
      "Kein Deployment",
    ];
    next.decision.blocker = project.blocker || "UNGEKLÄRT";
    next.decision.jamalDecisionQuestion = project.openDecision || "UNGEKLÄRT";
    next.codexPreparation.projectPath = project.localPath || "";
    return next;
  }

  function setDailyOutcome(run, values = {}) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Das Tagesergebnis kann nur im Status DRAFT geändert werden.");
    }
    next.dailyOutcome = {
      desiredOutcome: singleText(values.desiredOutcome, "desiredOutcome", true),
      reason: singleText(values.reason, "reason", true),
      acceptanceCriterion: singleText(values.acceptanceCriterion, "acceptanceCriterion", true),
    };
    next.decision.jamalDecisionQuestion = singleText(
      values.jamalDecisionQuestion || next.decision.jamalDecisionQuestion,
      "jamalDecisionQuestion",
      true,
    );
    return next;
  }

  function detectTaskType(value) {
    const text = singleText(value, "desiredOutcome", true).toLowerCase();
    if (/agent(en)?|einsatzplan|rollenverteilung|wer\s+(soll|kann)|welche\s+rollen/.test(text)) return TASK_TYPES[0];
    if (/plugin|werkzeug|tool|integration|airtable|github|vercel/.test(text)) return TASK_TYPES[7];
    if (/code|codex|entwick|programm|bug|fehler|repository|repo|api|frontend|backend|datei/.test(text)) return TASK_TYPES[1];
    if (/design|ui|ux|layout|bild|grafik|marke|visual/.test(text)) return TASK_TYPES[2];
    if (/content|text|copy|artikel|beitrag|skript|formul|präsentation/.test(text)) return TASK_TYPES[3];
    if (/recherch|quelle|marktanal|vergleich|untersuch|herausfind/.test(text)) return TASK_TYPES[4];
    if (/qualität|prüf|test|review|abnahme|kontroll|validier/.test(text)) return TASK_TYPES[6];
    return TASK_TYPES[5];
  }

  function proposalBlueprint(taskType) {
    const commonSafety = [
      "Keine automatische Codex- oder Agentenausführung",
      "Keine externe Aktion ohne Jamals Freigabe",
      "Kein automatischer Commit, Push oder Deployment",
      "Kanonische Projekt- und Sicherheitsgrenzen einhalten",
    ];
    const blueprints = {
      [TASK_TYPES[0]]: {
        repositoryWorkRequired: false,
        leadAgent: "Orchestrator-Agent",
        agents: [
          ["Orchestrator-Agent", "Einsatzleitung", "Ziel in Rollen, Teilaufgaben und Übergaben zerlegen"],
          ["Fach-Agent des Fokusprojekts", "Fachliche Verantwortung", "Projektkontext und fachliche Grenzen einbringen"],
          ["QS-/Test-Agent", "Qualitätssicherung", "Vollständigkeit, Überschneidungen und Abnahmekriterium prüfen"],
        ],
        tools: ["Agentenregister", "kanonische Projektakte", "Prüfcheckliste"],
        areas: ["Projektkontext und Agentenrollen", "keine Repository- oder Produktionsdatenänderung"],
        quality: ["Jede Teilaufgabe hat genau eine verantwortliche Rolle", "Übergaben und Abschlussprüfung sind benannt"],
      },
      [TASK_TYPES[1]]: {
        repositoryWorkRequired: true,
        leadAgent: "API-Agent",
        agents: [["API-Agent", "Technische Umsetzung", "Begrenzte technische Änderung vorbereiten"], ["QS-/Test-Agent", "Qualitätssicherung", "Tests und Diff gegen das Ziel prüfen"]],
        tools: ["Codex", "Repository-Werkzeuge", "Test- und Diff-Prüfung"],
        areas: ["Projektdateien innerhalb einer expliziten Allowlist", "lokale Tests und Git-Diff"],
        quality: ["Projektchecks erfolgreich", "Diff enthält nur die freigegebene Zieländerung"],
      },
      [TASK_TYPES[2]]: {
        repositoryWorkRequired: false,
        leadAgent: "UI-Agent",
        agents: [["UI-Agent", "Gestaltungsleitung", "Gestaltungsrichtung und Qualitätsmaßstab festlegen"], ["Review-Agent", "Qualitätsprüfung", "Lesbarkeit, Konsistenz und Zielbezug prüfen"]],
        tools: ["Designwerkzeug", "bestehendes Markensystem", "visuelle Qualitätsprüfung"],
        areas: ["Design-Briefing und freigegebene Assets"],
        quality: ["Gestaltung erfüllt Ziel, Format und Markenrahmen"],
      },
      [TASK_TYPES[3]]: {
        repositoryWorkRequired: false,
        leadAgent: "Kommunikations-Agent",
        agents: [["Kommunikations-Agent", "Redaktion", "Kernaussage und Inhalt ausarbeiten"], ["Risiko-Agent", "Grenzprüfung", "Aussagen und sensible Inhalte prüfen"]],
        tools: ["Redaktionsvorlage", "Projektwissen", "Qualitätscheck"],
        areas: ["freigegebene Inhalte und Projektwissen"],
        quality: ["Inhalt ist verständlich, zielgerichtet und sachlich geprüft"],
      },
      [TASK_TYPES[4]]: {
        repositoryWorkRequired: false,
        leadAgent: "Dokumentations-Agent",
        agents: [["Dokumentations-Agent", "Recherche", "Fragestellung, Quellen und Befunde strukturieren"], ["Review-Agent", "Quellenprüfung", "Nachvollziehbarkeit und Widersprüche prüfen"]],
        tools: ["Recherchewerkzeuge", "Quellenregister", "Vergleichsmatrix"],
        areas: ["öffentliche oder ausdrücklich freigegebene Quellen"],
        quality: ["Befunde sind belegt und Unsicherheiten sichtbar"],
      },
      [TASK_TYPES[5]]: {
        repositoryWorkRequired: false,
        leadAgent: "Strategie-Agent",
        agents: [["Strategie-Agent", "Entscheidungsvorbereitung", "Optionen, Wirkung und Entscheidungspunkt strukturieren"], ["Entscheidungs-Agent", "Entscheidungsprüfung", "Konsequenzen und nächste Schritte bewerten"]],
        tools: ["Entscheidungsvorlage", "Projektakte", "Risikoabwägung"],
        areas: ["Projektziele, Entscheidungen und bekannte Risiken"],
        quality: ["Optionen, Konsequenzen und eine klare Entscheidung sind sichtbar"],
      },
      [TASK_TYPES[6]]: {
        repositoryWorkRequired: false,
        leadAgent: "QS-/Test-Agent",
        agents: [["QS-/Test-Agent", "Prüfleitung", "Prüfumfang, Kriterien und Nachweise festlegen"], ["Review-Agent", "Fachprüfung", "Ergebnis gegen fachliche Grenzen prüfen"]],
        tools: ["Prüfcheckliste", "Testnachweise", "Abnahmeprotokoll"],
        areas: ["freigegebene Ergebnisse und Prüfnachweise"],
        quality: ["Jedes Kriterium hat einen nachvollziehbaren Nachweis"],
      },
      [TASK_TYPES[7]]: {
        repositoryWorkRequired: false,
        leadAgent: "Integrations-Agent",
        agents: [["Integrations-Agent", "Werkzeugauswahl", "Geeignete Kategorien und Kandidaten vergleichen"], ["Sicherheits-Agent", "Sicherheitsprüfung", "Datenzugriff, Freigaben und externe Wirkung prüfen"]],
        tools: ["Plugin-Register", "Anforderungskatalog", "Sicherheitsprüfung"],
        areas: ["Werkzeugmetadaten und freigegebene Integrationsanforderungen"],
        quality: ["Empfehlung nennt Nutzen, Grenzen, Datenzugriff und Alternative"],
      },
    };
    return { ...blueprints[taskType], safety: commonSafety };
  }

  function createWorkProposal(run, values = {}) {
    if (run.status !== "DRAFT") throw new Error("Ein Arbeitsvorschlag kann nur im Status DRAFT erstellt werden.");
    if (!singleText(run.focusProjectId, "focusProjectId")) throw new Error("Fokusprojekt muss bewusst ausgewählt werden.");
    const desiredOutcome = singleText(values.desiredOutcome, "desiredOutcome", true);
    const prohibitedToday = singleText(values.prohibitedToday, "prohibitedToday");
    const taskType = detectTaskType(desiredOutcome);
    const blueprint = proposalBlueprint(taskType);
    const focusAgent = run.focusProjectId === "health-upgrade-kompass" ? "Health-Kompass-Agent" : "Projektstatus-Agent";
    blueprint.agents = blueprint.agents.map((entry) => entry[0] === "Fach-Agent des Fokusprojekts" ? [focusAgent, entry[1], entry[2]] : entry);
    const projectName = run.canonicalSnapshot?.displayName || run.focusProjectId;
    const realisticScope = `Heute einen prüfbaren ${taskType === TASK_TYPES[0] ? "Einsatzplan" : "Arbeitsstand"} für „${desiredOutcome}“ vorbereiten; keine automatische Ausführung.`;
    const acceptanceCriterion = taskType === TASK_TYPES[0]
      ? "Ein klarer Einsatzplan benennt benötigte Agenten, eindeutige Teilaufgaben, Übergaben, Sicherheitsgrenzen und die abschließende Prüfung."
      : `Ein nachvollziehbarer Arbeitsstand für „${desiredOutcome}“ liegt mit Prüfnachweis und offenem Entscheidungspunkt vor.`;
    const jamalDecisionQuestion = taskType === TASK_TYPES[0]
      ? "Soll dieser Agenten-Einsatzplan in dieser Rollenverteilung später manuell freigegeben werden?"
      : "Soll dieser begrenzte Arbeitsvorschlag später manuell zur Ausführung freigegeben werden?";
    let next = clone(run);
    next.dailyOutcome = { desiredOutcome, reason: `Das gewünschte Ergebnis für ${projectName} soll heute in einen realistischen, sicheren Arbeitsumfang übersetzt werden.`, acceptanceCriterion };
    next.boundary.prohibitedToday = [...new Set([...next.boundary.prohibitedToday, ...textList(prohibitedToday)])];
    next.decision.jamalDecisionQuestion = jamalDecisionQuestion;
    next.workProposal = {
      taskType,
      understoodGoal: desiredOutcome,
      realisticDayScope: realisticScope,
      repositoryWorkRequired: blueprint.repositoryWorkRequired,
      leadAgent: blueprint.leadAgent,
      agentPlan: blueprint.agents.map(([agent, role, subtask], index) => ({
        agent,
        role,
        subtask,
        handoffTo: blueprint.agents[index + 1]?.[0] || "Jamal zur Entscheidung",
      })),
      sequence: blueprint.agents.map(([agent], index) => `${index + 1}. ${agent}`).concat("Abschluss: Jamal entscheidet manuell"),
      toolCategories: blueprint.tools,
      fileOrDataAreas: blueprint.areas,
      testsAndQuality: blueprint.quality,
      safetyAndApproval: blueprint.safety.concat(prohibitedToday ? [`Zusätzliche Grenze: ${prohibitedToday}`] : []),
      acceptanceCriterion,
      jamalDecisionQuestion,
    };
    next.codexPreparation = {
      projectPath: blueprint.repositoryWorkRequired ? (next.canonicalSnapshot.localPath || "UNGEKLÄRT") : "Nicht erforderlich – kein Repository-Auftrag",
      allowedFiles: blueprint.areas,
      forbiddenFiles: ["Alle nicht ausdrücklich freigegebenen Dateien oder Daten", "Produktions-, Kunden- und sensible Gesundheitsdaten"],
      targetChange: blueprint.repositoryWorkRequired ? realisticScope : `Kein Repository-Auftrag; ${taskType} als rein vorbereitenden Arbeitsplan erstellen.`,
      tests: blueprint.quality,
      gitRules: ["kein Branchwechsel", "kein Commit", "kein Push", "kein Deployment", "kein Reset"],
      fallback: "Vorschlag verwerfen oder manuell überarbeiten; keine externe oder technische Aktion wurde ausgelöst.",
      preparedPrompt: "",
    };
    next.codexPreparation.preparedPrompt = buildCodexPrompt(next);
    return next;
  }

  function setCodexPreparation(run, values = {}) {
    const next = clone(run);
    if (next.status !== "DRAFT") {
      throw new Error("Die Codex-Vorbereitung kann nur im Status DRAFT geändert werden.");
    }
    next.codexPreparation = {
      projectPath: singleText(values.projectPath || next.canonicalSnapshot.localPath, "projectPath", true),
      allowedFiles: textList(values.allowedFiles),
      forbiddenFiles: textList(values.forbiddenFiles),
      targetChange: singleText(values.targetChange, "targetChange", true),
      tests: textList(values.tests),
      gitRules: textList(values.gitRules),
      fallback: singleText(values.fallback, "fallback", true),
      preparedPrompt: "",
    };
    if (next.codexPreparation.allowedFiles.length === 0) throw new Error("allowedFiles ist erforderlich.");
    if (next.codexPreparation.forbiddenFiles.length === 0) throw new Error("forbiddenFiles ist erforderlich.");
    if (next.codexPreparation.tests.length === 0) throw new Error("tests ist erforderlich.");
    if (next.codexPreparation.gitRules.length === 0) throw new Error("gitRules ist erforderlich.");
    next.codexPreparation.preparedPrompt = buildCodexPrompt(next);
    return next;
  }

  function setResultReturn(run, values = {}) {
    const next = clone(run);
    if (next.status !== "READY_FOR_CODEX") {
      throw new Error("Ergebnisse können nur nach manueller Codex-Vorbereitung erfasst werden.");
    }
    next.resultReturn = {
      summary: singleText(values.summary, "summary", true),
      changedFiles: textList(values.changedFiles),
      tests: textList(values.tests),
      gitBranch: singleText(values.gitBranch, "gitBranch", true),
      commitStatus: singleText(values.commitStatus || "kein Commit", "commitStatus", true),
      pushStatus: singleText(values.pushStatus || "kein Push", "pushStatus", true),
      risks: textList(values.risks),
      openPoints: textList(values.openPoints),
    };
    if (next.resultReturn.tests.length === 0) throw new Error("Mindestens ein Testergebnis ist erforderlich.");
    return next;
  }

  function setClosure(run, values = {}) {
    const next = clone(run);
    if (next.status !== "RESULT_RECORDED") {
      throw new Error("Der Tagesabschluss ist erst nach der Ergebnisrückführung möglich.");
    }
    const closureStatus = singleText(values.status, "closure.status", true).toUpperCase();
    if (!FINAL_STATUS_VALUES.includes(closureStatus)) {
      throw new Error("Der Abschlussstatus muss CLOSED oder OPEN sein.");
    }
    next.closure = {
      ...next.closure,
      status: closureStatus,
      jamalDecision: singleText(values.jamalDecision, "jamalDecision", true),
      nextSafeStep: singleText(values.nextSafeStep, "nextSafeStep", true),
      closedAt: isoDateTime(values.closedAt || new Date()),
    };
    return next;
  }

  function validateReadyForCodex(run) {
    const errors = [];
    if (!singleText(run.focusProjectId, "focusProjectId")) errors.push("Fokusprojekt fehlt.");
    if (!singleText(run.dailyOutcome?.desiredOutcome, "desiredOutcome")) errors.push("Tagesergebnis fehlt.");
    if (!singleText(run.dailyOutcome?.reason, "reason")) errors.push("Begründung fehlt.");
    if (!singleText(run.dailyOutcome?.acceptanceCriterion, "acceptanceCriterion")) errors.push("Abnahmekriterium fehlt.");
    if (!singleText(run.decision?.jamalDecisionQuestion, "jamalDecisionQuestion")) errors.push("Jamal-Entscheidungsfrage fehlt.");
    if (!singleText(run.codexPreparation?.projectPath, "projectPath")) errors.push("Projektpfad fehlt.");
    if (!singleText(run.codexPreparation?.targetChange, "targetChange")) errors.push("Zieländerung fehlt.");
    if (!singleText(run.codexPreparation?.fallback, "fallback")) errors.push("Rückfallmöglichkeit fehlt.");
    if (!Array.isArray(run.codexPreparation?.allowedFiles) || run.codexPreparation.allowedFiles.length === 0) errors.push("Allowlist fehlt.");
    if (!Array.isArray(run.codexPreparation?.forbiddenFiles) || run.codexPreparation.forbiddenFiles.length === 0) errors.push("Verbotsliste fehlt.");
    if (!Array.isArray(run.codexPreparation?.tests) || run.codexPreparation.tests.length === 0) errors.push("Tests fehlen.");
    if (!Array.isArray(run.codexPreparation?.gitRules) || run.codexPreparation.gitRules.length === 0) errors.push("Git-Regeln fehlen.");
    if (run.boundary?.externalActionsBlocked !== true) errors.push("Externe Aktionen sind nicht blockiert.");
    if (run.boundary?.codexExecutionBlocked !== true) errors.push("Codex-Ausführung ist nicht blockiert.");
    if (run.boundary?.agentExecutionBlocked !== true) errors.push("Agentenausführung ist nicht blockiert.");
    if (run.boundary?.automaticGitBlocked !== true) errors.push("Automatische Git-Aktion ist nicht blockiert.");
    if (run.boundary?.deploymentBlocked !== true) errors.push("Deployment ist nicht blockiert.");
    return errors;
  }

  function transitionRun(run, nextStatus) {
    const target = singleText(nextStatus, "nextStatus", true).toUpperCase();
    if (!STATUS_VALUES.includes(target)) throw new Error("Unzulässiger Tageslaufstatus.");
    const next = clone(run);
    const allowed = {
      DRAFT: ["READY_FOR_CODEX"],
      READY_FOR_CODEX: ["RESULT_RECORDED"],
      RESULT_RECORDED: ["CLOSED", "OPEN"],
      CLOSED: [],
      OPEN: [],
    };
    if (!allowed[next.status]?.includes(target)) {
      throw new Error(`Statusübergang ${next.status} → ${target} ist nicht erlaubt.`);
    }
    if (target === "READY_FOR_CODEX") {
      const errors = validateReadyForCodex(next);
      if (errors.length > 0) throw new Error(errors.join(" "));
    }
    if (target === "RESULT_RECORDED") {
      if (!next.resultReturn.summary || !next.resultReturn.gitBranch || next.resultReturn.tests.length === 0) {
        throw new Error("Die Ergebnisrückführung ist unvollständig.");
      }
    }
    if (FINAL_STATUS_VALUES.includes(target)) {
      if (next.closure.status !== target || !next.closure.jamalDecision || !next.closure.nextSafeStep) {
        throw new Error("Jamals Abschlussentscheidung und genau ein nächster Schritt sind erforderlich.");
      }
    }
    next.status = target;
    return next;
  }

  function buildCodexPrompt(run) {
    const outcome = run.dailyOutcome || {};
    const prep = run.codexPreparation || {};
    const proposal = run.workProposal || {};
    if (proposal.taskType === TASK_TYPES[0]) {
      return [
        "Bereite ausschließlich einen Agenten- und Einsatzplan vor. Dies ist kein Codex- oder Repository-Auftrag.",
        "",
        `Fokusprojekt: ${run.canonicalSnapshot?.displayName || run.focusProjectId || "UNGEKLÄRT"}`,
        `Verstandenes Ziel: ${proposal.understoodGoal || outcome.desiredOutcome || "UNGEKLÄRT"}`,
        `Realistischer Tagesumfang: ${proposal.realisticDayScope || "UNGEKLÄRT"}`,
        "",
        "Agenten, Rollen, Teilaufgaben und Übergaben:",
        ...(proposal.agentPlan || []).map((item) => `- ${item.agent} | ${item.role} | ${item.subtask} | Übergabe an: ${item.handoffTo}`),
        "",
        "Sicherheits- und Freigabegrenzen:",
        ...textList(proposal.safetyAndApproval).map((item) => `- ${item}`),
        "",
        `Abnahmekriterium: ${proposal.acceptanceCriterion || outcome.acceptanceCriterion || "UNGEKLÄRT"}`,
        `Jamal-Entscheidungsfrage: ${proposal.jamalDecisionQuestion || run.decision?.jamalDecisionQuestion || "UNGEKLÄRT"}`,
        "Keine Agentenausführung und keine externe Aktion. Dieser Text ist nur eine manuell kopierbare Planungsvorlage.",
      ].join("\n");
    }
    return [
      `Arbeite ausschließlich im Projekt: ${prep.projectPath || run.canonicalSnapshot?.localPath || "UNGEKLÄRT"}`,
      "",
      `Fokusprojekt: ${run.canonicalSnapshot?.displayName || run.focusProjectId || "UNGEKLÄRT"}`,
      `Gewünschtes Tagesergebnis: ${outcome.desiredOutcome || "UNGEKLÄRT"}`,
      `Begründung: ${outcome.reason || "UNGEKLÄRT"}`,
      `Abnahmekriterium: ${outcome.acceptanceCriterion || "UNGEKLÄRT"}`,
      `Zieländerung: ${prep.targetChange || "UNGEKLÄRT"}`,
      "",
      "Erlaubte Dateien:",
      ...textList(prep.allowedFiles).map((item) => `- ${item}`),
      "",
      "Nicht erlaubte Dateien:",
      ...textList(prep.forbiddenFiles).map((item) => `- ${item}`),
      "",
      "Tests:",
      ...textList(prep.tests).map((item) => `- ${item}`),
      "",
      "Git-Regeln:",
      ...textList(prep.gitRules).map((item) => `- ${item}`),
      "",
      `Rückfallmöglichkeit: ${prep.fallback || "UNGEKLÄRT"}`,
      "",
      `Jamal-Entscheidungsfrage: ${run.decision?.jamalDecisionQuestion || "UNGEKLÄRT"}`,
      "Keine automatische Codex- oder Agentenausführung. Keine externe Aktion. Kein automatischer Commit, Push oder Deployment.",
      "Dieser Text ist ausschließlich eine manuell kopierbare Auftragsvorlage.",
    ].join("\n");
  }

  function createStore(value = {}) {
    const runs = Array.isArray(value.runs) ? value.runs.map((run) => ({ ...clone(run), workProposal: run.workProposal ? clone(run.workProposal) : null })) : [];
    const activeRunId = runs.some((run) => run.id === value.activeRunId) ? value.activeRunId : null;
    return {
      schemaVersion: SCHEMA_VERSION,
      activeRunId,
      runs,
    };
  }

  function loadDailyStore(storage) {
    if (!storage || typeof storage.getItem !== "function") return createStore();
    try {
      const raw = storage.getItem(DAILY_STORAGE_KEY);
      return raw ? createStore(JSON.parse(raw)) : createStore();
    } catch (_error) {
      return createStore();
    }
  }

  function saveDailyStore(storage, store) {
    if (!storage || typeof storage.setItem !== "function") {
      throw new Error("Browser-Speicher ist nicht verfügbar.");
    }
    const normalized = createStore(store);
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function upsertRun(store, run) {
    const nextStore = createStore(store);
    const safeRun = clone(run);
    const index = nextStore.runs.findIndex((entry) => entry.id === safeRun.id);
    if (index >= 0) nextStore.runs[index] = safeRun;
    else nextStore.runs.unshift(safeRun);
    nextStore.activeRunId = safeRun.id;
    return nextStore;
  }

  function getActiveRun(store) {
    const normalized = createStore(store);
    return clone(normalized.runs.find((run) => run.id === normalized.activeRunId) || null);
  }

  function currentCanonicalProject(apiPayload, projectId) {
    const safe =
      apiPayload &&
      apiPayload.writeOperationsBlocked === true &&
      apiPayload.madeExternalRequest === false &&
      apiPayload.registrySource === "project-registry.js" &&
      Array.isArray(apiPayload.projects);
    if (!safe) {
      return { available: false, status: "UNGEKLÄRT", project: null };
    }
    const project = apiPayload.projects.find((entry) => entry.id === projectId) || null;
    return project
      ? { available: true, status: project.verificationStatus || "UNGEKLÄRT", project: clone(project) }
      : { available: false, status: "UNGEKLÄRT", project: null };
  }

  function createHistoryEntry(run, manuallyConfirmed = false) {
    if (!manuallyConfirmed || !FINAL_STATUS_VALUES.includes(run.status)) return null;
    if (!run.closure?.jamalDecision || !run.closure?.nextSafeStep) return null;
    return {
      id: `daily-work-run-history-${run.id}`,
      type: "Statusänderung",
      at: run.closure.closedAt || isoDateTime(),
      description: [
        `Tagesarbeitslauf ${run.workDate}: ${run.canonicalSnapshot?.displayName || run.focusProjectId}.`,
        `Tagesergebnis: ${sentence(run.dailyOutcome?.desiredOutcome)}`,
        `Ergebnis: ${sentence(run.resultReturn?.summary)}`,
        `Jamals Entscheidung: ${sentence(run.closure.jamalDecision)}`,
        `Nächster sicherer Schritt: ${sentence(run.closure.nextSafeStep)}`,
        `Status: ${run.status}.`,
      ].join("\n"),
    };
  }

  function applyHistoryEntryOnce(history, entry) {
    const entries = Array.isArray(history) ? clone(history) : [];
    if (!entry || entries.some((existing) => existing.id === entry.id)) return entries;
    entries.unshift(clone(entry));
    return entries;
  }

  function markHistoryTransferred(run, entry, transferredAt = new Date()) {
    const next = clone(run);
    if (!entry || entry.id !== `daily-work-run-history-${next.id}`) {
      throw new Error("Ungültiger Verlaufseintrag.");
    }
    if (next.closure.historyTransferredAt) return next;
    next.closure.historyEntry = clone(entry);
    next.closure.historyTransferredAt = isoDateTime(transferredAt);
    return next;
  }

  return Object.freeze({
    DAILY_STORAGE_KEY,
    FINAL_STATUS_VALUES,
    LEGACY_MANAGEMENT_STORAGE_KEY,
    SCHEMA_VERSION,
    STATUS_VALUES,
    TASK_TYPES,
    applyHistoryEntryOnce,
    buildCodexPrompt,
    captureCanonicalSnapshot,
    createDraftRun,
    createHistoryEntry,
    createWorkProposal,
    createStore,
    currentCanonicalProject,
    getActiveRun,
    loadDailyStore,
    markHistoryTransferred,
    detectTaskType,
    saveDailyStore,
    setClosure,
    setCodexPreparation,
    setDailyOutcome,
    setFocusProject,
    setResultReturn,
    transitionRun,
    upsertRun,
    validateReadyForCodex,
  });
});
