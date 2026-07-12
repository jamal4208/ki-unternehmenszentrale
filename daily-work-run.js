"use strict";

(function initDailyWorkRun(root, factory) {
  const agentRegistry = typeof module === "object" && module.exports
    ? require("./agent-registry")
    : root?.AgentRegistry;
  const api = factory(agentRegistry);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DailyWorkRun = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDailyWorkRunApi(agentRegistryApi) {
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
  const AGENT_REVIEW_PHASE_STATUSES = Object.freeze([
    "NOT_APPROVED",
    "PREPARED",
    "RESULTS_PARTIAL",
    "READY_FOR_QA",
    "QA_COMPLETED",
    "OVERALL_FINDING_PREPARED",
    "JAMAL_COMPLETED",
  ]);
  const AGENT_WORK_ITEM_STATUSES = Object.freeze([
    "NOT_PREPARED",
    "READY",
    "WAITING",
    "RESULT_PENDING",
    "RESULT_RECORDED",
    "REVIEW_REQUIRED",
    "ACCEPTED",
    "BLOCKED",
    "NOT_NEEDED",
  ]);
  const CANONICAL_AGENTS = agentRegistryApi?.PRODUCTIVE_AGENT_REGISTRY || [];
  if (CANONICAL_AGENTS.length !== 25) {
    throw new Error("Das kanonische Register mit 25 Hauptagenten ist nicht verfügbar.");
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
      agentReviewPhase: createAgentReviewPhase(),
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

  function createAgentReviewPhase(value = {}) {
    return {
      status: AGENT_REVIEW_PHASE_STATUSES.includes(value.status) ? value.status : "NOT_APPROVED",
      approvalQuestion: "Soll die Zentrale die internen Prüfaufträge für dieses Agententeam jetzt vorbereiten?",
      approvalDecision: singleText(value.approvalDecision, "approvalDecision"),
      approvedAt: value.approvedAt || null,
      preparedAt: value.preparedAt || null,
      noAgentExecution: true,
      workItems: Array.isArray(value.workItems) ? clone(value.workItems) : [],
      qa: {
        status: singleText(value.qa?.status || "NOT_READY", "qa.status", true),
        resultText: singleText(value.qa?.resultText, "qa.resultText"),
        availableAgentIds: textList(value.qa?.availableAgentIds),
        missingAgentIds: textList(value.qa?.missingAgentIds),
        blockedAgentIds: textList(value.qa?.blockedAgentIds),
        criteriaAnswered: value.qa?.criteriaAnswered === true,
        safetyBoundariesViolated: textList(value.qa?.safetyBoundariesViolated),
        confirmedAt: value.qa?.confirmedAt || null,
      },
      orchestration: {
        status: singleText(value.orchestration?.status || "NOT_READY", "orchestration.status", true),
        confirmedFindings: textList(value.orchestration?.confirmedFindings),
        openPoints: textList(value.orchestration?.openPoints),
        conflicts: textList(value.orchestration?.conflicts),
        risks: textList(value.orchestration?.risks),
        recommendedNextStep: singleText(value.orchestration?.recommendedNextStep, "recommendedNextStep"),
        notApproved: textList(value.orchestration?.notApproved),
        jamalDecisionQuestion: singleText(value.orchestration?.jamalDecisionQuestion, "orchestration.jamalDecisionQuestion"),
        confirmedAt: value.orchestration?.confirmedAt || null,
      },
      finalDecision: {
        decision: singleText(value.finalDecision?.decision, "finalDecision.decision"),
        nextSafeStep: singleText(value.finalDecision?.nextSafeStep, "finalDecision.nextSafeStep"),
        decidedAt: value.finalDecision?.decidedAt || null,
      },
      historyEntry: value.historyEntry ? clone(value.historyEntry) : null,
      historyTransferredAt: value.historyTransferredAt || null,
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

  function proposalBlueprint(taskType, run, desiredOutcome) {
    const commonSafety = [
      "Keine automatische Codex- oder Agentenausführung",
      "Keine Plugin- oder Werkzeugausführung",
      "Keine externe Aktion ohne Jamals Freigabe",
      "Kein automatischer Commit, Push oder Deployment",
      "Kanonische Projekt- und Sicherheitsgrenzen einhalten",
    ];
    const routes = {
      [TASK_TYPES[0]]: {
        repositoryWorkRequired: false,
        leadAgentId: "orchestrator-agent",
        baseAgentIds: ["project-status-agent", "workflow-agent", "quality-test-agent"],
      },
      [TASK_TYPES[1]]: {
        repositoryWorkRequired: true,
        leadAgentId: "orchestrator-agent",
        baseAgentIds: ["product-agent", "api-agent", "documentation-agent", "quality-test-agent", "integration-agent"],
      },
      [TASK_TYPES[2]]: {
        repositoryWorkRequired: false,
        leadAgentId: "ui-agent",
        baseAgentIds: ["product-agent", "communication-agent", "integration-agent", "quality-test-agent", "review-agent"],
      },
      [TASK_TYPES[3]]: {
        repositoryWorkRequired: false,
        leadAgentId: "communication-agent",
        baseAgentIds: ["product-agent", "documentation-agent", "risk-agent", "review-agent", "quality-test-agent"],
      },
      [TASK_TYPES[4]]: {
        repositoryWorkRequired: false,
        leadAgentId: "documentation-agent",
        baseAgentIds: ["project-status-agent", "open-points-agent", "risk-agent", "review-agent", "quality-test-agent"],
      },
      [TASK_TYPES[5]]: {
        repositoryWorkRequired: false,
        leadAgentId: "strategy-agent",
        baseAgentIds: ["decision-agent", "product-agent", "prioritization-agent", "risk-agent", "documentation-agent"],
      },
      [TASK_TYPES[6]]: {
        repositoryWorkRequired: false,
        leadAgentId: "quality-test-agent",
        baseAgentIds: ["review-agent", "project-status-agent", "security-agent", "documentation-agent"],
      },
      [TASK_TYPES[7]]: {
        repositoryWorkRequired: false,
        leadAgentId: "integration-agent",
        baseAgentIds: ["security-agent", "operations-agent", "quality-test-agent", "risk-agent"],
      },
    };
    const route = routes[taskType] || routes[TASK_TYPES[5]];
    const text = desiredOutcome.toLowerCase();
    const selected = new Set([route.leadAgentId, ...route.baseAgentIds]);
    const health = run.focusProjectId === "health-upgrade-kompass";
    const toolRelevant = /plugin|werkzeug|tool|canva|heygen|github|airtable|video|präsent|design|bild|codex|browser/.test(text);
    const designRelevant = /design|ui|ux|layout|bild|premium|verständ|nutzer|text/.test(text);
    const technicalRelevant = /code|codex|entwick|api|frontend|backend|techn|repository|git|browser/.test(text);
    const sensitive = health || /gesund|medizin|daten|einwillig|datenschutz|recht|claim|risiko/.test(text);
    const costRelevant = /kosten|budget|preis|geschäftsmodell|betrieb|skalier/.test(text);

    if (health) {
      ["health-compass-agent", "product-agent", "risk-agent", "security-agent"].forEach((id) => selected.add(id));
      if (taskType === TASK_TYPES[0]) {
        ["ui-agent", "communication-agent", "api-agent", "integration-agent", "documentation-agent"].forEach((id) => selected.add(id));
      }
    }
    if (toolRelevant) selected.add("integration-agent");
    if (designRelevant) ["ui-agent", "communication-agent"].forEach((id) => selected.add(id));
    if (technicalRelevant) ["api-agent", "integration-agent"].forEach((id) => selected.add(id));
    if (sensitive) ["risk-agent", "security-agent"].forEach((id) => selected.add(id));
    if (costRelevant) ["operations-agent", "strategy-agent"].forEach((id) => selected.add(id));

    const selectedAgentIds = [...selected].filter((id) => AGENTS_BY_ID.has(id));
    return {
      ...route,
      selectedAgentIds,
      safety: commonSafety,
      signals: { health, toolRelevant, designRelevant, technicalRelevant, sensitive, costRelevant },
    };
  }

  const AGENT_ASSIGNMENT_TEMPLATES = Object.freeze({
    "orchestrator-agent": ["Einsatzleitung und Zusammenführung", "Der Auftrag benötigt eine eindeutige Leitung ohne unnötige Agentenbreite.", "Arbeitsphasen, Abhängigkeiten und Übergaben koordinieren und die Fachbefunde verdichten.", "Ein kompakter Gesamtplan mit Konflikten, Reihenfolge und Entscheidungspunkt.", "Alle ausgewählten Beiträge sind vollständig, widerspruchsfrei und einem nächsten Schritt zugeordnet."],
    "project-status-agent": ["Projekt- und Demostand", "Die Auswahl muss vom bestätigten Ist-Stand statt von Annahmen ausgehen.", "Aktuellen Produkt-, Demo- und Projektstand sowie offene Punkte aus der kanonischen Akte verdichten.", "Bestätigtes Standbild mit offenen und ungeklärten Punkten.", "Technische Momentaufnahme und fachliche Freigabe werden klar getrennt."],
    "workflow-agent": ["Ablauf und Abhängigkeiten", "Mehrere Fachprüfungen benötigen eine belastbare Reihenfolge.", "Voraussetzungen, parallele Prüfungen, Wartepunkte und Zusammenführung strukturieren.", "Ausführbarer Ablaufplan ohne Agentenstart.", "Jeder Schritt besitzt Abhängigkeit und Übergabe."],
    "health-compass-agent": ["Health-Fachverantwortung", "Das Fokusprojekt braucht seine vorhandenen fachlichen Grenzen und den Health-Kontext.", "Kernnutzerfluss, offene Fachfragen, Waage/Labor gemäß Projektstand sowie Diagnose- und Heilversprechengrenzen prüfen.", "Health-Fachbefund mit klaren Freigabegrenzen.", "Keine Diagnose, Heilversprechen oder medizinische Freigabe; Ungeklärtes bleibt sichtbar."],
    "product-agent": ["Produktmanagement", "Nutzen, Kernfluss und nächster Produktumfang müssen vor Detailarbeit geklärt sein.", "Kernnutzerfluss, Demo-Ziel, Nutzen und offene Produktentscheidungen gegeneinander prüfen.", "Priorisierte Produktfragen und ein realistischer nächster Umfang.", "Der Umfang ist klein, nutzerbezogen und eindeutig abnehmbar."],
    "risk-agent": ["Compliance und Risiko", "Sensible Aussagen und Projektgrenzen benötigen eine eigene Risikoprüfung.", "Medizinische Aussagen, Claims, rechtliche Unsicherheiten und Freigaberisiken kennzeichnen.", "Risikomatrix mit Stoppsignalen und benötigten Fachfreigaben.", "Keine ungeprüfte Aussage wird als freigegeben dargestellt."],
    "security-agent": ["Datenschutz und Einwilligung", "Datenfluss und Einwilligungsgrenzen sind bei sensiblen Projekten eigenständig zu prüfen.", "Datenschutz, Consent, Datenabfluss sowie Ausschluss echter Gesundheits- und Kundendaten prüfen.", "Sicherheitsbefund mit erlaubten und verbotenen Datenwegen.", "Keine echten sensiblen Daten, keine externe Übertragung und keine automatische Aktion."],
    "ui-agent": ["Design- und Nutzerflussqualität", "Premiumwirkung und Verständlichkeit sind Teil der Ergebnisqualität.", "Kernfluss, visuelle Hierarchie, Vertrauen, mediterrane Ruhe und mobile Verständlichkeit bewerten.", "Designbefund mit konkreten Qualitätslücken und Prioritäten.", "Verständnis und Vertrauen erreichen jeweils mindestens 8 von 10."],
    "communication-agent": ["Content und Nutzertexte", "Nutzertexte beeinflussen Verständnis, Vertrauen und mögliche Claims.", "Kerntexte auf Klarheit, Ton, Handlungsführung und sensible Aussagen prüfen.", "Kurze Textempfehlungen mit markierten Freigabepunkten.", "Keine Heilversprechen; verständliche, ruhige und präzise Sprache."],
    "api-agent": ["Technische Machbarkeit", "Technische offene Punkte müssen von fachlichen Entscheidungen getrennt sichtbar sein.", "Datenfluss, UI-/API-Bezug, technische Risiken und spätere Umsetzbarkeit read-only einordnen.", "Technischer Machbarkeitsbefund ohne Codeänderung.", "Keine Repository-Änderung und Codex nur als späteres Werkzeug nach Freigabe."],
    "integration-agent": ["Plugin- und Werkzeugprüfung", "Werkzeuge sollen durch Anforderungen und Qualität statt Bequemlichkeit gewählt werden.", "Fähigkeit, Werkzeugkategorien, Kombinationen, Bearbeitbarkeit, Datenschutz, Kostenart, Skalierung und Ersatzlösung vergleichen.", "Werkzeug-Entscheidungsmatrix mit Kombination und Alternative.", "Kein Tool wird ausgeführt; Canva ist nie automatisch die einzige Wahl."],
    "documentation-agent": ["Wissens- und Projektkontext", "Befunde müssen nachvollziehbar auf bestätigtem Projektwissen beruhen.", "Kanonische Akte, bekannte Entscheidungen und offene Annahmen zu einer Übergabegrundlage strukturieren.", "Quellen- und Kontextübersicht für alle Fachprüfungen.", "Keine lokale Momentaufnahme wird zur zweiten technischen Wahrheit."],
    "quality-test-agent": ["Qualitätssicherung und Abnahme", "Der Einsatzplan braucht eine unabhängige, messbare Abschlussprüfung.", "Alle Fachbefunde, Grenzen, Übergaben und Akzeptanzkriterien gegen den Ergebniswunsch prüfen.", "QA-Abnahmebericht mit bestanden/offen/blockiert.", "Vollständigkeit 100 Prozent; Design bei Relevanz mindestens 8/10 für Verständnis und Vertrauen."],
    "review-agent": ["Unabhängiges Review", "Ein zweiter Blick reduziert Scheinsicherheit und Lücken.", "Ergebnis gegen Ziel, Quellen und Sicherheitsgrenzen spiegeln.", "Reviewbefund mit Widersprüchen und Restlücken.", "Jede Abweichung ist belegt und einer Entscheidung zugeordnet."],
    "strategy-agent": ["Strategische Verantwortung", "Zielrichtung und Wirkung müssen vor einer Entscheidung geklärt sein.", "Optionen, Wirkung, Aufwand und langfristige Folgen strukturieren.", "Strategische Empfehlung mit Alternativen.", "Empfehlung trennt Fakten, Annahmen und Jamals Entscheidung."],
    "decision-agent": ["Entscheidungsvorbereitung", "Jamal benötigt eine klare, nicht technische Entscheidung.", "Maximal drei verständliche Optionen samt Konsequenzen formulieren.", "Entscheidungsvorlage mit Empfehlung.", "Genau eine verständliche Entscheidungsfrage bleibt offen."],
    "prioritization-agent": ["Priorisierung", "Nicht alle möglichen Arbeiten sind jetzt nötig.", "Nutzen, Risiko und Dringlichkeit ordnen und bewusst Zurückgestelltes benennen.", "Kleine priorisierte Arbeitsfolge.", "Nur notwendige Schritte bleiben im aktuellen Umfang."],
    "open-points-agent": ["Offene Fragen", "Recherche darf fehlende Informationen nicht mit Annahmen ersetzen.", "Ungeklärte Begriffe, Quellen und Entscheidungen sammeln.", "Priorisierte Fragenliste.", "Jede offene Frage hat einen Verantwortlichen oder Jamal-Entscheid."],
    "operations-agent": ["Betrieb, Kostenart und Skalierung", "Betriebsfähigkeit und Kosten können die Werkzeug- oder Strategieauswahl verändern.", "Kostenart, Wartbarkeit, Skalierbarkeit und Betriebsgrenzen einordnen.", "Betriebsvergleich ohne Beschaffungsaktion.", "Keine Kostenannahme wird als bestätigter Preis ausgegeben."],
    "data-structure-agent": ["Daten- und Ergebnisstruktur", "Strukturierte Ergebnisse müssen dauerhaft verständlich bleiben.", "Felder, Datenbeziehungen und Ergebnisformat prüfen.", "Strukturvorschlag mit Pflicht- und optionalen Feldern.", "Bestehende Daten bleiben kompatibel und erhalten."],
    "customer-value-agent": ["Kundenwert", "Die Arbeit muss sichtbaren Nutzen für die Zielgruppe erzeugen.", "Nutzen, Reibung und Vertrauen aus Nutzersicht prüfen.", "Kundenwertbefund.", "Nutzen ist in einem verständlichen Satz belegbar."],
    "next-actions-agent": ["Nächste Schritte", "Aus Befunden muss eine kleine nächste Handlung entstehen.", "Befunde in sichere nächste Schritte übersetzen.", "Priorisierte nächste Aktion.", "Schritt ist manuell, reversibel und freigabefähig."],
    "closure-agent": ["Abschlussfähigkeit", "Der Umfang braucht ein klares Ende.", "Offene Blocker und Abschlusskriterien prüfen.", "Abschlussstatus mit Restpunkten.", "Kein voreiliger Abschluss ohne Nachweis."],
    "release-agent": ["Release-Reife", "Veröffentlichungsnähe erfordert gesonderte Reifeprüfung.", "Qualitäts-, Sicherheits- und Freigabestatus bewerten.", "Release-Befund ohne Veröffentlichung.", "Kein Release oder Deployment wird gestartet."],
    "error-analysis-agent": ["Fehleranalyse", "Fehler müssen vor Änderungen reproduziert und eingegrenzt werden.", "Symptom, Ursache und betroffene Schicht analysieren.", "Reproduzierbarer Fehlerbefund.", "Keine Änderung ohne bestätigte Ursache."],
  });

  function buildAgentPlan(blueprint) {
    const leadId = blueprint.leadAgentId;
    const qaId = blueprint.selectedAgentIds.includes("quality-test-agent") ? "quality-test-agent" : null;
    const prerequisiteIds = blueprint.selectedAgentIds.filter((id) => ["project-status-agent", "health-compass-agent", "product-agent", "documentation-agent"].includes(id));
    const domainIds = blueprint.selectedAgentIds.filter((id) => id !== leadId && id !== qaId && !prerequisiteIds.includes(id));
    return blueprint.selectedAgentIds.map((agentId) => {
      const agent = AGENTS_BY_ID.get(agentId);
      const template = AGENT_ASSIGNMENT_TEMPLATES[agentId] || [agent.role, "Diese Fachperspektive ist für den erkannten Auftrag erforderlich.", `„${agent.role}“ auf den Ergebniswunsch anwenden.`, "Nachvollziehbarer Fachbefund.", "Ergebnis ist prüfbar und hält alle Sicherheitsgrenzen ein."];
      const isLead = agentId === leadId;
      const isQa = agentId === qaId;
      const isPrerequisite = prerequisiteIds.includes(agentId);
      const executionMode = isLead ? "final-consolidation" : isQa ? "dependent-review" : isPrerequisite ? "prerequisite" : "parallel";
      const dependsOn = isLead
        ? (qaId ? [qaId] : domainIds)
        : isQa
          ? [...prerequisiteIds, ...domainIds]
          : isPrerequisite ? [] : prerequisiteIds;
      return {
        agentId,
        agentName: agent.name,
        canonicalRole: agent.role,
        selectionReason: template[1],
        roleInRun: template[0],
        subtask: template[2],
        expectedResult: template[3],
        acceptanceCheck: template[4],
        safetyBoundary: agentId === "integration-agent" ? "Nur interne Auswahl- und Bewertungslogik; keine Plugin-Ausführung oder externe Recherche." : "Nur Planung und Prüfung; keine automatische oder externe Ausführung.",
        dependsOn,
        handoffTo: isLead ? "jamal" : isQa ? leadId : (qaId || leadId),
        executionMode,
        toolReviewRequired: agentId === "integration-agent",
      };
    });
  }

  function buildToolReview(blueprint) {
    const required = blueprint.selectedAgentIds.includes("integration-agent");
    const categories = blueprint.signals.designRelevant
      ? ["Spezialisiertes UI-/UX-Werkzeug", "Bildgenerierung und Retusche", "Präsentationswerkzeug", "Browserprüfung"]
      : blueprint.signals.technicalRelevant
        ? ["Codex als späteres Entwicklerwerkzeug", "Browserprüfung", "GitHub read-only", "Testwerkzeuge"]
        : ["Projekt-/Wissensquelle read-only", "Qualitäts- und Browserprüfung", "bearbeitbare Fachvorlagen"];
    return {
      required,
      responsibleAgentId: required ? "integration-agent" : null,
      neededCapability: "Ein bearbeitbares, integrierbares Ergebnis mit hoher Qualität und kontrolliertem Datenfluss vorbereiten.",
      toolCategories: categories,
      possibleCombination: required ? categories.slice(0, 3) : [],
      qualityAdvantage: "Spezialisierte Werkzeuge werden kombiniert, wenn dadurch Qualität, Bearbeitbarkeit oder Prüfbarkeit steigt.",
      selectionCriteria: ["Ergebnisqualität", "Integrationsfähigkeit", "Bearbeitbarkeit", "Datenschutz und Datenabfluss", "Kostenart", "Skalierbarkeit"],
      approvalBoundary: "Keine automatische Festlegung auf Canva und keine Werkzeugausführung ohne Jamals Freigabe.",
      fallback: "Manuelle, lokal bearbeitbare Vorlage ohne externe Plugin-Nutzung.",
    };
  }

  function createWorkProposal(run, values = {}) {
    if (run.status !== "DRAFT") throw new Error("Ein Arbeitsvorschlag kann nur im Status DRAFT erstellt werden.");
    if (!singleText(run.focusProjectId, "focusProjectId")) throw new Error("Fokusprojekt muss bewusst ausgewählt werden.");
    const desiredOutcome = singleText(values.desiredOutcome, "desiredOutcome", true);
    const prohibitedToday = singleText(values.prohibitedToday, "prohibitedToday");
    const taskType = detectTaskType(desiredOutcome);
    const blueprint = proposalBlueprint(taskType, run, desiredOutcome);
    const agentPlan = buildAgentPlan(blueprint);
    const leadAgent = AGENTS_BY_ID.get(blueprint.leadAgentId);
    const projectName = run.canonicalSnapshot?.displayName || run.focusProjectId;
    const realisticScope = `Heute einen prüfbaren ${taskType === TASK_TYPES[0] ? "Einsatzplan" : "Arbeitsstand"} für „${desiredOutcome}“ vorbereiten; keine automatische Ausführung.`;
    const acceptanceCriterion = taskType === TASK_TYPES[0]
      ? "Der Einsatzplan deckt Projektstand, Fachgrenzen, Produkt, Risiko, Datenschutz, Qualität, Technik und Werkzeuge mit begründeten Rollen, prüfbaren Ergebnissen und eindeutigen Übergaben ab."
      : `Ein nachvollziehbarer Arbeitsstand für „${desiredOutcome}“ liegt mit Prüfnachweis und offenem Entscheidungspunkt vor.`;
    const jamalDecisionQuestion = taskType === TASK_TYPES[0]
      ? (blueprint.signals.health
        ? "Soll die Zentrale mit diesem Agententeam die nächste Health-Prüfphase vorbereiten?"
        : "Soll die Zentrale mit diesem Agententeam den nächsten Arbeitsschritt vorbereiten?")
      : "Soll die Zentrale diesen fachlich begrenzten Arbeitsplan als nächsten Schritt vorbereiten?";
    let next = clone(run);
    next.dailyOutcome = { desiredOutcome, reason: `Das gewünschte Ergebnis für ${projectName} soll heute in einen realistischen, sicheren Arbeitsumfang übersetzt werden.`, acceptanceCriterion };
    next.boundary.prohibitedToday = [...new Set([...next.boundary.prohibitedToday, ...textList(prohibitedToday)])];
    next.decision.jamalDecisionQuestion = jamalDecisionQuestion;
    next.workProposal = {
      taskType,
      understoodGoal: desiredOutcome,
      realisticDayScope: realisticScope,
      repositoryWorkRequired: blueprint.repositoryWorkRequired,
      canonicalAgentRegistryCount: CANONICAL_AGENTS.length,
      selectedAgentIds: blueprint.selectedAgentIds,
      leadAgentId: blueprint.leadAgentId,
      leadAgent: leadAgent.name,
      leadAgentRole: leadAgent.role,
      leadSelectionReason: agentPlan.find((item) => item.agentId === blueprint.leadAgentId)?.selectionReason,
      agentPlan,
      excludedAgentCount: CANONICAL_AGENTS.length - blueprint.selectedAgentIds.length,
      exclusionReason: "Nicht ausgewählt, wenn die Rolle für Projekt, Ergebniswunsch, Risiko oder aktuellen Umfang keinen konkreten Mehrwert liefert.",
      workStructure: {
        prerequisites: agentPlan.filter((item) => item.executionMode === "prerequisite").map((item) => item.agentId),
        parallelTasks: agentPlan.filter((item) => item.executionMode === "parallel").map((item) => item.agentId),
        dependentReviews: agentPlan.filter((item) => item.executionMode === "dependent-review").map((item) => item.agentId),
        finalConsolidation: blueprint.leadAgentId,
      },
      toolReview: buildToolReview(blueprint),
      toolCategories: buildToolReview(blueprint).toolCategories,
      fileOrDataAreas: blueprint.repositoryWorkRequired ? ["Freigegebene Projektdateien und lokale Prüfnachweise"] : ["Kanonische Projektakte", "strukturierter Agenten-Einsatzplan", "keine Produktions- oder Kundendaten"],
      testsAndQuality: [acceptanceCriterion, "Jeder ausgewählte Agent liefert Begründung, Teilauftrag, Ergebnis, Prüfkriterium und Übergabe.", ...(blueprint.signals.designRelevant || blueprint.signals.health ? ["Verständnis und Vertrauen jeweils mindestens 8 von 10."] : [])],
      designQualityFramework: (blueprint.signals.designRelevant || blueprint.signals.health) ? ["Apple statt Dubai", "hochwertig, ruhig, warm und mediterran", "natürliche Menschen statt Stock-Gesichter", "klare Verständlichkeit und Premiumwirkung", "Verständnis und Vertrauen jeweils mindestens 8/10"] : [],
      safetyAndApproval: blueprint.safety.concat(prohibitedToday ? [`Zusätzliche Grenze: ${prohibitedToday}`] : []),
      acceptanceCriterion,
      jamalDecisionQuestion,
    };
    next.codexPreparation = {
      projectPath: blueprint.repositoryWorkRequired ? (next.canonicalSnapshot.localPath || "UNGEKLÄRT") : "Nicht erforderlich – kein Repository-Auftrag",
      allowedFiles: blueprint.repositoryWorkRequired ? ["Nur später ausdrücklich freigegebene Projektdateien"] : ["Kanonische Projektakte und strukturierter Einsatzplan"],
      forbiddenFiles: ["Alle nicht ausdrücklich freigegebenen Dateien oder Daten", "Produktions-, Kunden- und sensible Gesundheitsdaten"],
      targetChange: blueprint.repositoryWorkRequired ? realisticScope : `Kein Repository-Auftrag; ${taskType} als rein vorbereitenden Arbeitsplan erstellen.`,
      tests: [acceptanceCriterion, "Agenten-IDs gegen das kanonische 25-Agenten-Register prüfen", "Übergaben und Abhängigkeiten vollständig prüfen"],
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
    errors.push(...validateAgentPlan(run.workProposal));
    return errors;
  }

  function validateAgentPlan(proposal) {
    if (!proposal?.selectedAgentIds) return [];
    const errors = [];
    const selectedIds = proposal.selectedAgentIds;
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return ["Agentenauswahl fehlt."];
    if (new Set(selectedIds).size !== selectedIds.length) errors.push("Agentenauswahl enthält Duplikate.");
    if (selectedIds.some((id) => !AGENTS_BY_ID.has(id))) errors.push("Agentenauswahl enthält einen nicht-kanonischen Agenten.");
    if (!selectedIds.includes(proposal.leadAgentId)) errors.push("Hauptverantwortlicher fehlt in der Agentenauswahl.");
    if (!Array.isArray(proposal.agentPlan) || proposal.agentPlan.length !== selectedIds.length) errors.push("Strukturierter Agentenplan ist unvollständig.");
    (proposal.agentPlan || []).forEach((item) => {
      ["agentId", "selectionReason", "roleInRun", "subtask", "expectedResult", "acceptanceCheck", "safetyBoundary", "executionMode"].forEach((field) => {
        if (!item?.[field]) errors.push(`${item?.agentId || "Agent"}: ${field} fehlt.`);
      });
      if (!Array.isArray(item?.dependsOn)) errors.push(`${item?.agentId || "Agent"}: dependsOn fehlt.`);
      if (!item?.handoffTo) errors.push(`${item?.agentId || "Agent"}: handoffTo fehlt.`);
    });
    return errors;
  }

  function getAgentReviewPhase(run) {
    return createAgentReviewPhase(run?.agentReviewPhase || {});
  }

  function refreshAgentReviewPhase(phaseValue, proposal) {
    const phase = createAgentReviewPhase(phaseValue);
    const leadId = proposal?.leadAgentId;
    const qaId = proposal?.selectedAgentIds?.includes("quality-test-agent") ? "quality-test-agent" : null;
    const acceptedIds = new Set(phase.workItems.filter((item) => item.status === "ACCEPTED").map((item) => item.agentId));

    phase.workItems = phase.workItems.map((item) => {
      if (["ACCEPTED", "BLOCKED", "RESULT_RECORDED", "REVIEW_REQUIRED"].includes(item.status)) return item;
      if (item.agentId === leadId) {
        return { ...item, status: qaId && acceptedIds.has(qaId) ? "READY" : "WAITING" };
      }
      if (item.agentId === qaId) {
        const required = phase.workItems.filter((entry) => entry.agentId !== leadId && entry.agentId !== qaId);
        const blockers = required.filter((entry) => entry.status === "BLOCKED");
        return { ...item, status: blockers.length === 0 && required.every((entry) => acceptedIds.has(entry.agentId)) ? "READY" : "WAITING" };
      }
      const dependenciesMet = (item.dependsOn || []).every((id) => acceptedIds.has(id));
      return { ...item, status: dependenciesMet ? "READY" : "WAITING" };
    });

    const domainItems = phase.workItems.filter((item) => item.agentId !== leadId && item.agentId !== qaId);
    const qaItem = phase.workItems.find((item) => item.agentId === qaId);
    const leadItem = phase.workItems.find((item) => item.agentId === leadId);
    phase.qa.availableAgentIds = domainItems.filter((item) => item.status === "ACCEPTED").map((item) => item.agentId);
    phase.qa.missingAgentIds = domainItems.filter((item) => item.status !== "ACCEPTED" && item.status !== "BLOCKED").map((item) => item.agentId);
    phase.qa.blockedAgentIds = domainItems.filter((item) => item.status === "BLOCKED").map((item) => item.agentId);

    if (phase.finalDecision.decidedAt) phase.status = "JAMAL_COMPLETED";
    else if (leadItem?.status === "ACCEPTED") phase.status = "OVERALL_FINDING_PREPARED";
    else if (qaItem?.status === "ACCEPTED") phase.status = "QA_COMPLETED";
    else if (qaItem?.status === "READY") phase.status = "READY_FOR_QA";
    else if (phase.workItems.some((item) => item.resultConfirmed)) phase.status = "RESULTS_PARTIAL";
    else phase.status = phase.preparedAt ? "PREPARED" : "NOT_APPROVED";
    return phase;
  }

  function prepareAgentReviewPhase(run, values = {}) {
    const next = clone(run);
    if (next.status !== "READY_FOR_CODEX") throw new Error("Ein erstellter Agenten-Einsatzplan ist erforderlich.");
    const errors = validateAgentPlan(next.workProposal);
    if (errors.length > 0) throw new Error(errors.join(" "));
    if (values.approved !== true) throw new Error("Jamals ausdrückliche Freigabe ist erforderlich.");
    if (next.agentReviewPhase?.preparedAt) throw new Error("Die Agenten-Prüfphase ist bereits vorbereitet.");
    const now = isoDateTime(values.now || new Date());
    const phase = createAgentReviewPhase({
      status: "PREPARED",
      approvalDecision: "APPROVED",
      approvedAt: now,
      preparedAt: now,
      workItems: next.workProposal.agentPlan.map((item) => ({
        agentId: item.agentId,
        agentName: item.agentName,
        roleInRun: item.roleInRun,
        subtask: item.subtask,
        expectedResult: item.expectedResult,
        acceptanceCheck: item.acceptanceCheck,
        safetyBoundary: item.safetyBoundary,
        dependsOn: clone(item.dependsOn || []),
        handoffTo: item.handoffTo,
        executionMode: item.executionMode,
        isLead: item.agentId === next.workProposal.leadAgentId,
        status: item.executionMode === "prerequisite" ? "READY" : "WAITING",
        resultSource: "Manuelle Rückführung in der KI-Unternehmenszentrale",
        resultText: "",
        openPoints: [],
        blockers: [],
        resultConfirmed: false,
        resultRecordedAt: null,
        resultConfirmedAt: null,
      })),
    });
    next.agentReviewPhase = refreshAgentReviewPhase(phase, next.workProposal);
    return next;
  }

  function setAgentReviewApproval(run, decision) {
    const next = clone(run);
    const normalized = singleText(decision, "approvalDecision", true).toUpperCase();
    if (!["ADJUST", "DECLINED"].includes(normalized)) throw new Error("Unzulässige Freigabeentscheidung.");
    const phase = getAgentReviewPhase(next);
    if (phase.preparedAt) throw new Error("Die Prüfphase wurde bereits vorbereitet.");
    phase.approvalDecision = normalized;
    next.agentReviewPhase = phase;
    return next;
  }

  function recordAgentWorkResult(run, agentId, values = {}) {
    const next = clone(run);
    const phase = getAgentReviewPhase(next);
    if (!phase.preparedAt) throw new Error("Die Agentenaufträge sind noch nicht vorbereitet.");
    const item = phase.workItems.find((entry) => entry.agentId === agentId);
    if (!item) throw new Error("Arbeitskarte gehört nicht zu diesem Agentenplan.");
    if (item.isLead || item.agentId === "quality-test-agent") throw new Error("QA und Zusammenführung besitzen eigene kontrollierte Rückführungen.");
    if (item.resultConfirmedAt) throw new Error("Dieses Ergebnis wurde bereits bestätigt und wird nicht überschrieben.");
    if (item.status !== "READY") throw new Error("Die Voraussetzungen für diesen Agentenbefund fehlen noch.");
    if (values.confirmed !== true) throw new Error("Das Ergebnis muss bewusst bestätigt werden.");
    item.resultText = singleText(values.resultText, "resultText", true);
    item.openPoints = textList(values.openPoints);
    item.blockers = textList(values.blockers);
    item.resultRecordedAt = isoDateTime(values.now || new Date());
    item.resultConfirmedAt = item.resultRecordedAt;
    item.resultConfirmed = true;
    item.status = item.blockers.length > 0 ? "BLOCKED" : "ACCEPTED";
    next.agentReviewPhase = refreshAgentReviewPhase(phase, next.workProposal);
    return next;
  }

  function recordQaResult(run, values = {}) {
    const next = clone(run);
    const phase = getAgentReviewPhase(next);
    const item = phase.workItems.find((entry) => entry.agentId === "quality-test-agent");
    if (!item || item.status !== "READY") throw new Error("QA ist erst nach allen notwendigen Agentenbefunden bereit.");
    if (item.resultConfirmedAt) throw new Error("Der QA-Befund wurde bereits bestätigt.");
    const qaStatus = singleText(values.status, "qaStatus", true).toUpperCase();
    if (!["BESTANDEN", "TEILWEISE_BESTANDEN", "OFFEN", "BLOCKIERT"].includes(qaStatus)) throw new Error("Unzulässiger QA-Status.");
    const resultText = singleText(values.resultText, "qaResult", true);
    const now = isoDateTime(values.now || new Date());
    phase.qa = {
      ...phase.qa,
      status: qaStatus,
      resultText,
      criteriaAnswered: values.criteriaAnswered === true,
      safetyBoundariesViolated: textList(values.safetyBoundariesViolated),
      confirmedAt: now,
    };
    item.resultText = resultText;
    item.openPoints = textList(values.openPoints);
    item.blockers = qaStatus === "BLOCKIERT" ? textList(values.blockers || ["QA blockiert"]) : textList(values.blockers);
    item.resultRecordedAt = now;
    item.resultConfirmedAt = now;
    item.resultConfirmed = true;
    item.status = qaStatus === "BLOCKIERT" ? "BLOCKED" : "ACCEPTED";
    next.agentReviewPhase = refreshAgentReviewPhase(phase, next.workProposal);
    return next;
  }

  function recordOrchestrationSummary(run, values = {}) {
    const next = clone(run);
    const phase = getAgentReviewPhase(next);
    const item = phase.workItems.find((entry) => entry.agentId === next.workProposal?.leadAgentId);
    if (!item || item.status !== "READY") throw new Error("Die Zusammenführung ist erst nach bestätigtem QA-Befund bereit.");
    if (item.resultConfirmedAt) throw new Error("Der Gesamtbefund wurde bereits bestätigt.");
    const confirmedFindings = textList(values.confirmedFindings);
    if (confirmedFindings.length === 0) throw new Error("Mindestens ein bestätigter Befund ist erforderlich.");
    const now = isoDateTime(values.now || new Date());
    phase.orchestration = {
      status: "CONFIRMED",
      confirmedFindings,
      openPoints: textList(values.openPoints),
      conflicts: textList(values.conflicts),
      risks: textList(values.risks),
      recommendedNextStep: singleText(values.recommendedNextStep, "recommendedNextStep", true),
      notApproved: textList(values.notApproved),
      jamalDecisionQuestion: singleText(values.jamalDecisionQuestion, "jamalDecisionQuestion", true),
      confirmedAt: now,
    };
    item.resultText = confirmedFindings.join("\n");
    item.openPoints = phase.orchestration.openPoints;
    item.blockers = [];
    item.resultRecordedAt = now;
    item.resultConfirmedAt = now;
    item.resultConfirmed = true;
    item.status = "ACCEPTED";
    next.agentReviewPhase = refreshAgentReviewPhase(phase, next.workProposal);
    return next;
  }

  function setAgentReviewFinalDecision(run, values = {}) {
    const next = clone(run);
    const phase = getAgentReviewPhase(next);
    if (phase.orchestration.status !== "CONFIRMED") throw new Error("Ein bestätigter Gesamtbefund ist erforderlich.");
    if (phase.finalDecision.decidedAt) throw new Error("Jamals Abschlussentscheidung wurde bereits gespeichert.");
    const decision = singleText(values.decision, "finalDecision", true).toUpperCase();
    if (!["FREIGEBEN", "MIT_AENDERUNGEN_FREIGEBEN", "WEITERE_PRUEFUNG_NOETIG", "VORERST_STOPPEN"].includes(decision)) throw new Error("Unzulässige Abschlussentscheidung.");
    phase.finalDecision = {
      decision,
      nextSafeStep: singleText(values.nextSafeStep, "nextSafeStep", true),
      decidedAt: isoDateTime(values.now || new Date()),
    };
    next.agentReviewPhase = refreshAgentReviewPhase(phase, next.workProposal);
    return next;
  }

  function createAgentReviewHistoryEntry(run, manuallyConfirmed = false) {
    const phase = getAgentReviewPhase(run);
    if (!manuallyConfirmed || phase.status !== "JAMAL_COMPLETED") return null;
    return {
      id: `daily-work-run-agent-review-history-${run.id}`,
      type: "Statusänderung",
      at: phase.finalDecision.decidedAt,
      description: [
        `Kontrollierte Agenten-Prüfphase ${run.workDate}: ${run.canonicalSnapshot?.displayName || run.focusProjectId}.`,
        `Ergebniswunsch: ${sentence(run.dailyOutcome?.desiredOutcome)}`,
        `Jamals Entscheidung: ${sentence(phase.finalDecision.decision)}`,
        `Nächster sicherer Schritt: ${sentence(phase.finalDecision.nextSafeStep)}`,
        "Keine Agenten-, Codex-, Plugin- oder externe Ausführung wurde ausgelöst.",
      ].join("\n"),
    };
  }

  function markAgentReviewHistoryTransferred(run, entry, transferredAt = new Date()) {
    const next = clone(run);
    const phase = getAgentReviewPhase(next);
    if (!entry || entry.id !== `daily-work-run-agent-review-history-${next.id}`) throw new Error("Ungültiger Prüfphasen-Verlaufseintrag.");
    if (phase.historyTransferredAt) return next;
    phase.historyEntry = clone(entry);
    phase.historyTransferredAt = isoDateTime(transferredAt);
    next.agentReviewPhase = phase;
    return next;
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
    if (Array.isArray(proposal.agentPlan) && proposal.agentPlan.length > 0) {
      const planningOnly = proposal.repositoryWorkRequired === false;
      return [
        planningOnly
          ? "Bereite ausschließlich einen Agenten- und Einsatzplan vor. Dies ist kein Codex- oder Repository-Auftrag."
          : "Bereite ausschließlich einen fachlichen Arbeits- und Einsatzplan vor. Codex ist nur ein späteres Werkzeug des zuständigen Agenten und wird nicht gestartet.",
        "",
        `Fokusprojekt: ${run.canonicalSnapshot?.displayName || run.focusProjectId || "UNGEKLÄRT"}`,
        `Auftragstyp: ${proposal.taskType || "UNGEKLÄRT"}`,
        `Verstandenes Ziel: ${proposal.understoodGoal || outcome.desiredOutcome || "UNGEKLÄRT"}`,
        `Realistischer Tagesumfang: ${proposal.realisticDayScope || "UNGEKLÄRT"}`,
        `Hauptverantwortung: ${proposal.leadAgent || "UNGEKLÄRT"} (${proposal.leadAgentId || "UNGEKLÄRT"})`,
        "",
        "Ausgewählte Agenten, Begründungen, Teilaufträge und Übergaben:",
        ...(proposal.agentPlan || []).map((item) => [
          `- ${item.agentName || item.agent || item.agentId} | ${item.roleInRun || item.role || "Rolle ungeklärt"}`,
          `  Warum: ${item.selectionReason || "UNGEKLÄRT"}`,
          `  Teilauftrag: ${item.subtask || "UNGEKLÄRT"}`,
          `  Erwartetes Ergebnis: ${item.expectedResult || "UNGEKLÄRT"}`,
          `  Prüfkriterium: ${item.acceptanceCheck || "UNGEKLÄRT"}`,
          `  Modus: ${item.executionMode || "UNGEKLÄRT"}; wartet auf: ${(item.dependsOn || []).join(", ") || "nichts"}; Übergabe an: ${item.handoffTo || "UNGEKLÄRT"}`,
        ].join("\n")),
        "",
        "Plugin- und Werkzeugprüfung:",
        `- Erforderlich: ${proposal.toolReview?.required ? "ja" : "nein"}`,
        ...textList(proposal.toolReview?.toolCategories).map((item) => `- Kategorie: ${item}`),
        `- Auswahlgrenze: ${proposal.toolReview?.approvalBoundary || "Keine Werkzeugausführung."}`,
        "",
        "Sicherheits- und Freigabegrenzen:",
        ...textList(proposal.safetyAndApproval).map((item) => `- ${item}`),
        "",
        `Abnahmekriterium: ${proposal.acceptanceCriterion || outcome.acceptanceCriterion || "UNGEKLÄRT"}`,
        `Jamal-Entscheidungsfrage: ${proposal.jamalDecisionQuestion || run.decision?.jamalDecisionQuestion || "UNGEKLÄRT"}`,
        "Keine Agenten-, Codex- oder Plugin-Ausführung und keine externe Aktion. Dieser Text ist nur eine manuell kopierbare Planungsvorlage.",
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
    AGENT_REVIEW_PHASE_STATUSES,
    AGENT_WORK_ITEM_STATUSES,
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
    createAgentReviewHistoryEntry,
    createHistoryEntry,
    createWorkProposal,
    createStore,
    currentCanonicalProject,
    getActiveRun,
    getAgentReviewPhase,
    loadDailyStore,
    markHistoryTransferred,
    markAgentReviewHistoryTransferred,
    detectTaskType,
    saveDailyStore,
    prepareAgentReviewPhase,
    recordAgentWorkResult,
    recordOrchestrationSummary,
    recordQaResult,
    setAgentReviewApproval,
    setAgentReviewFinalDecision,
    setClosure,
    setCodexPreparation,
    setDailyOutcome,
    setFocusProject,
    setResultReturn,
    transitionRun,
    upsertRun,
    validateAgentPlan,
    validateReadyForCodex,
  });
});
