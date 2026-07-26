"use strict";

// V7.3 – Jamal-Arbeitsmodus (Auftrag Abschnitt D/E/F/G/H/I): interne
// Produktivitäts- und Bedienbarkeitsphase. Jamal beschreibt ausschließlich
// das gewünschte Ergebnis; dieses Modul übernimmt die Strukturierung
// (Projektmanager-Rolle), die Agentenauswahl, den kontrollierten internen
// Lauf, die Rückfragenerkennung, die Ergebnisversionierung und die
// Statusführung.
//
// Wichtig (Leitprinzipien des Auftrags):
//   - Reine serverseitige Fachlogik ohne HTTP-, Browser- oder DOM-Bezug.
//   - KEIN externer Providerzugriff, KEIN Netzwerkzugriff, KEINE
//     Zufallszahlen, KEINE Uhrzeitabhängigkeit in der Fachlogik.
//   - Verwendet AUSSCHLIESSLICH bereits bestehende Phase-C-Bausteine
//     (agent-registry.js, work-order-agent-orchestrator.js,
//     business-use-policy.js) – keine zweite Agentenlauf-Architektur.
//   - KEIN Bezug zu Auth-Rollen, Mandanten, Kunden- oder Owner-Verwaltung
//     (auth-db.js, work-order-service.js, customer-portal-*, owner-admin-*
//     werden hier bewusst NICHT importiert – kein Owner-/Kundenrollenmix).
//   - Kein Billing, kein Provideraufruf, keine Veröffentlichung.
//   - Ergebnisversionen werden unveränderlich (eingefroren) gespeichert.

const agentRegistry = require("./agent-registry");
const orchestrator = require("./work-order-agent-orchestrator");
const businessUsePolicy = require("./business-use-policy");

const MAX_FIELD_LENGTH = 4000;

// Selbstreferenzieller Standard: ohne vorhandene Kontinuität priorisiert die
// Zentrale sich selbst (siehe Auftrag Abschnitt L, Selbstverbesserungsauftrag).
const DEFAULT_PROJECT_ID = "ki-unternehmenszentrale";

const STATUS = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  CLARIFICATION_NEEDED: "CLARIFICATION_NEEDED",
  RESULT_READY: "RESULT_READY",
  CHANGE_IN_PROGRESS: "CHANGE_IN_PROGRESS",
  DONE: "DONE",
  STOPPED: "STOPPED",
  ESCALATION_NEEDED: "ESCALATION_NEEDED",
});

const STATUS_VALUES = Object.freeze(Object.values(STATUS));

const TERMINAL_STATUSES = Object.freeze([STATUS.DONE, STATUS.STOPPED]);

// G. Statusmodell – ausschließlich deutsche, verständliche Bezeichnungen im
// Hauptfluss. Technische Statuscodes (STATUS.*) dürfen intern bestehen
// bleiben, aber nie unübersetzt im Hauptfluss erscheinen.
const STATUS_LABELS_DE = Object.freeze({
  [STATUS.NOT_STARTED]: "Noch nicht gestartet",
  [STATUS.READY]: "Bereit",
  [STATUS.IN_PROGRESS]: "In Bearbeitung",
  [STATUS.CLARIFICATION_NEEDED]: "Rückfrage offen",
  [STATUS.RESULT_READY]: "Ergebnis bereit",
  [STATUS.CHANGE_IN_PROGRESS]: "Änderung läuft",
  [STATUS.DONE]: "Erledigt",
  [STATUS.STOPPED]: "Gestoppt",
  [STATUS.ESCALATION_NEEDED]: "Eskalation nötig",
});

// C. Nie mehrere gleichwertige Hauptaktionen gleichzeitig – genau eine
// primäre Hauptaktion je Status.
const PRIMARY_ACTION_BY_STATUS = Object.freeze({
  [STATUS.NOT_STARTED]: { id: "SET_OUTCOME", label: "Ergebniswunsch festlegen" },
  [STATUS.READY]: { id: "START_RUN", label: "Arbeitslauf starten" },
  [STATUS.IN_PROGRESS]: { id: "WAIT", label: "Arbeitslauf läuft" },
  [STATUS.CLARIFICATION_NEEDED]: { id: "ANSWER_CLARIFICATION", label: "Rückfrage beantworten" },
  [STATUS.RESULT_READY]: { id: "VIEW_RESULT", label: "Ergebnis ansehen" },
  [STATUS.CHANGE_IN_PROGRESS]: { id: "WAIT", label: "Änderung läuft" },
  [STATUS.DONE]: { id: "NEW_OUTCOME", label: "Neuen Ergebniswunsch festlegen" },
  [STATUS.STOPPED]: { id: "NEW_OUTCOME", label: "Neuen Ergebniswunsch festlegen" },
  [STATUS.ESCALATION_NEEDED]: { id: "ESCALATE", label: "An Jamal eskaliert" },
});

// F. "Jamal darf sehen ... warum sie ausgewählt wurden" – verständliche
// deutsche Rollenbezeichnung statt des technischen orchestrator-Rollencodes.
const AGENT_ROLE_LABELS_DE = Object.freeze({
  PROJECT_MANAGER: "Projektleitung",
  SPECIALIST: "Fachbeitrag",
  QUALITY: "Qualitätsprüfung",
});

const ESCALATION_REASON_LABELS_DE = Object.freeze({
  CHILD_SAFETY_VIOLATION: "Dieser Auftrag verletzt eine absolute Schutzgrenze und wird nicht bearbeitet.",
  HATE_OR_DISCRIMINATION: "Dieser Auftrag enthält ein eindeutiges Diskriminierungssignal und wird nicht automatisch bearbeitet.",
  FRAUD_OR_IMPERSONATION: "Dieser Auftrag enthält ein Betrugs- oder Identitätsrisiko und wird nicht automatisch bearbeitet.",
  ILLEGAL_PURPOSE: "Dieser Auftrag enthält ein Signal für einen unzulässigen Zweck und wird nicht automatisch bearbeitet.",
  UNLAWFUL_SURVEILLANCE: "Dieser Auftrag enthält ein Überwachungsrisiko ohne erkennbare Einwilligung und wird nicht automatisch bearbeitet.",
  REAL_PERSON_LIKENESS_WITHOUT_STATED_CONSENT: "Dieser Auftrag betrifft möglicherweise das Abbild einer realen Person ohne genannte Einwilligung.",
  POLITICAL_INFLUENCE_CONTENT: "Dieser Auftrag betrifft möglicherweise politische Einflussnahme und braucht eine bewusste Einzelfallprüfung.",
  MEDICAL_OR_LEGAL_CLAIM: "Dieser Auftrag enthält eine mögliche medizinische oder rechtliche Zusicherung und braucht eine bewusste Einzelfallprüfung.",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function singleText(value, fieldName, { required = false, maxLength = MAX_FIELD_LENGTH } = {}) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    throw new Error(`${fieldName} muss ein Textwert sein.`);
  }
  const normalized = String(value ?? "").trim();
  if (required && !normalized) {
    throw new Error(`${fieldName} ist erforderlich.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} überschreitet die zulässige Länge.`);
  }
  return normalized;
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Datenmodell
// ---------------------------------------------------------------------------

function createStore() {
  return {
    schemaVersion: 1,
    currentItem: null,
    lastUsedProjectId: null,
    lastUsedProjectDisplayName: null,
  };
}

function normalizeStore(store) {
  if (!store || typeof store !== "object") return createStore();
  return {
    schemaVersion: 1,
    currentItem: store.currentItem ? clone(store.currentItem) : null,
    lastUsedProjectId: store.lastUsedProjectId || null,
    lastUsedProjectDisplayName: store.lastUsedProjectDisplayName || null,
  };
}

// E. Automatische Projektlogik. Kontinuität aus dem zuletzt bewusst
// gewählten Projekt dieses Arbeitsmodus schlägt einen Standardfall
// (Selbstreferenz auf die Zentrale). Ist keines von beiden verfügbar, muss
// Jamal bewusst wählen (kompakte Auswahl, kein Pflichtschritt).
function resolvePrioritizedProject(store, projects) {
  const list = Array.isArray(projects) ? projects : [];
  const byId = new Map(list.map((project) => [project.id, project]));

  if (store.lastUsedProjectId && byId.has(store.lastUsedProjectId)) {
    const project = byId.get(store.lastUsedProjectId);
    return { project: clone(project), source: "CONTINUITY" };
  }
  if (byId.has(DEFAULT_PROJECT_ID)) {
    return { project: clone(byId.get(DEFAULT_PROJECT_ID)), source: "DEFAULT" };
  }
  return { project: null, source: "NONE" };
}

function compactProjectCandidates(projects, limit = 5) {
  const list = Array.isArray(projects) ? projects.slice() : [];
  return list
    .slice()
    .sort((a, b) => String(b.lastVerifiedAt || "").localeCompare(String(a.lastVerifiedAt || "")))
    .slice(0, limit)
    .map((project) => ({ id: project.id, displayName: project.displayName || project.id }));
}

function assertHasCurrentItem(store) {
  if (!store.currentItem) {
    throw new Error("Es ist noch kein Arbeitswunsch angelegt.");
  }
  return store.currentItem;
}

function assertStatus(item, allowed, actionLabel) {
  if (!allowed.includes(item.status)) {
    throw new Error(`${actionLabel} ist im Status "${STATUS_LABELS_DE[item.status] || item.status}" nicht möglich.`);
  }
}

// D. Jamal-Arbeitsauftrag – neuer Arbeitswunsch. Nur zulässig, wenn kein
// aktiver, unabgeschlossener Wunsch existiert (ein Projekt, ein
// Ergebniswunsch zur selben Zeit).
function startNewItem(store, projects, options = {}) {
  const next = normalizeStore(store);
  if (next.currentItem && !TERMINAL_STATUSES.includes(next.currentItem.status)) {
    throw new Error("Es läuft bereits ein Arbeitswunsch. Zuerst abschließen oder stoppen.");
  }
  const now = options.now || new Date();
  const prioritized = resolvePrioritizedProject(next, projects);
  next.currentItem = {
    schemaVersion: 1,
    id: options.id || randomId("jwm"),
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    projectId: prioritized.project ? prioritized.project.id : null,
    projectDisplayName: prioritized.project ? prioritized.project.displayName || prioritized.project.id : null,
    projectSource: prioritized.source,
    desiredOutcome: "",
    notes: "",
    preferredTiming: "",
    status: STATUS.NOT_STARTED,
    clarifyingQuestion: null,
    plan: null,
    safetyDecision: null,
    versions: [],
    decision: null,
    decidedAt: null,
    doneAt: null,
    stoppedAt: null,
    postponedAt: null,
    escalation: null,
  };
  return next;
}

function chooseProject(store, project, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.NOT_STARTED, STATUS.READY, STATUS.CLARIFICATION_NEEDED], "Projekt wechseln");
  const projectId = singleText(project && project.id, "projectId", { required: true });
  const displayName = singleText((project && project.displayName) || projectId, "displayName", { required: true });
  item.projectId = projectId;
  item.projectDisplayName = displayName;
  item.projectSource = "MANUAL";
  item.updatedAt = nowIso(options.now || new Date());
  next.lastUsedProjectId = projectId;
  next.lastUsedProjectDisplayName = displayName;
  return next;
}

// D. Pflichtfeld: Ergebniswunsch. Optional: Hinweise, Zeitpunkt. Keine
// Agenten-, Tool-, Status- oder Mandantenauswahl erforderlich.
function setDesiredOutcome(store, values = {}, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.NOT_STARTED, STATUS.READY], "Ergebniswunsch festlegen");
  const desiredOutcome = singleText(values.desiredOutcome, "Ergebniswunsch", { required: true });
  item.desiredOutcome = desiredOutcome;
  item.notes = singleText(values.notes, "Hinweise");
  item.preferredTiming = singleText(values.preferredTiming, "gewünschter Zeitpunkt");
  item.status = STATUS.READY;
  item.updatedAt = nowIso(options.now || new Date());
  return next;
}

function fieldsForOrchestrator(item) {
  return {
    title: `Jamal-Arbeitsauftrag: ${item.desiredOutcome.slice(0, 80)}`,
    desiredResult: item.desiredOutcome,
    context: item.notes || "",
    deadlineText: item.preferredTiming || "",
  };
}

function escalationFromSafetyDecision(decision) {
  return {
    at: nowIso(),
    decision: decision.decision,
    reasonMessage:
      ESCALATION_REASON_LABELS_DE[decision.reasonCode] ||
      "Dieser Auftrag braucht vor der Bearbeitung eine bewusste Einzelfallprüfung durch Jamal.",
  };
}

// F. Interner Agentenlauf, Schritt 1: Safety-Gate, dann Rückfrageerkennung,
// dann Strukturierung (Projektmanager wählt Fachagenten + Qualitätsagent).
function startRun(store, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.READY], "Arbeitslauf starten");

  const fields = fieldsForOrchestrator(item);
  const safetyDecision = businessUsePolicy.evaluateWorkOrderContent(fields);
  item.safetyDecision = safetyDecision;
  item.updatedAt = nowIso(options.now || new Date());

  if (safetyDecision.decision !== "ALLOW") {
    item.status = STATUS.ESCALATION_NEEDED;
    item.escalation = escalationFromSafetyDecision(safetyDecision);
    return next;
  }

  // H. Rückfragen nur bei echtem Bedarf – maximal eine Hauptfrage.
  const missingInformationQuestion = orchestrator.detectMissingInformation(fields);
  if (missingInformationQuestion) {
    item.status = STATUS.CLARIFICATION_NEEDED;
    item.clarifyingQuestion = {
      question: missingInformationQuestion,
      reason: "Ohne diese Angabe kann kein sinnvolles Ergebnis erarbeitet werden.",
      createdAt: nowIso(options.now || new Date()),
      answer: null,
      answeredAt: null,
    };
    return next;
  }

  const selection = orchestrator.selectAgentsForWorkOrder(fields);
  const workPlan = orchestrator.buildWorkPlan(fields, selection);
  item.plan = clone({
    steps: workPlan.steps,
    expectedResultFormat: workPlan.expectedResultFormat,
    qualityCriteria: workPlan.qualityCriteria,
    agents: {
      projectManager: selection.projectManager,
      specialists: selection.specialists,
      quality: selection.quality,
    },
  });
  item.status = STATUS.IN_PROGRESS;
  return next;
}

function agentsInvolvedFromPlan(plan) {
  if (!plan) return [];
  return [plan.agents.projectManager, ...plan.agents.specialists, plan.agents.quality].map((agent) => ({
    canonicalName: agent.canonicalName,
    role: agent.role,
    roleLabel: AGENT_ROLE_LABELS_DE[agent.role] || "Beteiligt",
    reason: agent.reason,
  }));
}

function pushImmutableVersion(item, versionPayload, options = {}) {
  const versionNumber = item.versions.length + 1;
  const version = Object.freeze(
    clone({
      versionNumber,
      ...versionPayload,
      createdAt: nowIso(options.now || new Date()),
    }),
  );
  item.versions = Object.freeze([...item.versions, version]);
}

// F. Interner Agentenlauf, Schritt 2: deterministischer Ergebnisentwurf und
// unabhängige Qualitätsprüfung – ohne externen Provider, ohne Zufall.
function completeRun(store, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.IN_PROGRESS], "Arbeitslauf abschließen");
  if (!item.plan) {
    throw new Error("Der Arbeitsplan fehlt – Arbeitslauf kann nicht abgeschlossen werden.");
  }
  const fields = fieldsForOrchestrator(item);
  const selection = {
    projectManager: item.plan.agents.projectManager,
    specialists: item.plan.agents.specialists,
    quality: item.plan.agents.quality,
  };
  const result = orchestrator.generateResult(fields, selection);
  const qualityCheck = orchestrator.runQualityCheck(fields);
  pushImmutableVersion(
    item,
    {
      title: result.title,
      summary: result.summary,
      body: result.body,
      qualityStatus: qualityCheck.qualityStatus,
      qualityNote: qualityCheck.qualityNote,
      openPoints: qualityCheck.openPoints,
      agentsInvolved: agentsInvolvedFromPlan(item.plan),
      trigger: "INITIAL",
      changeRequestText: null,
    },
    options,
  );
  item.status = STATUS.RESULT_READY;
  item.updatedAt = nowIso(options.now || new Date());
  return next;
}

// H. Genau eine offene Hauptfrage; Beantwortung fließt in den Kontext ein
// und der Status kehrt zu "Bereit" zurück (nächster expliziter Schritt:
// erneut "Arbeitslauf starten").
function answerClarifyingQuestion(store, answerText, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.CLARIFICATION_NEEDED], "Rückfrage beantworten");
  const answer = singleText(answerText, "Antwort", { required: true });
  item.notes = [item.notes, answer].filter(Boolean).join("\n");
  item.clarifyingQuestion = {
    ...item.clarifyingQuestion,
    answer,
    answeredAt: nowIso(options.now || new Date()),
  };
  item.status = STATUS.READY;
  item.updatedAt = nowIso(options.now || new Date());
  return next;
}

// I. Änderung anfordern – bestehende Revisionslogik (Safety-Gate erneut,
// neue unveränderliche Ergebnisversion, alte Version bleibt unverändert).
function requestChange(store, changeText, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.RESULT_READY], "Änderung anfordern");
  const change = singleText(changeText, "Änderungswunsch", { required: true });

  const safetyDecision = businessUsePolicy.evaluateWorkOrderContent({
    title: fieldsForOrchestrator(item).title,
    desiredResult: item.desiredOutcome,
    context: change,
    deadlineText: item.preferredTiming || "",
  });
  if (safetyDecision.decision !== "ALLOW") {
    item.safetyDecision = safetyDecision;
    item.status = STATUS.ESCALATION_NEEDED;
    item.escalation = escalationFromSafetyDecision(safetyDecision);
    item.updatedAt = nowIso(options.now || new Date());
    return next;
  }

  item.pendingChangeText = change;
  item.status = STATUS.CHANGE_IN_PROGRESS;
  item.decision = null;
  item.updatedAt = nowIso(options.now || new Date());
  return next;
}

function completeChange(store, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.CHANGE_IN_PROGRESS], "Änderung abschließen");
  const changeText = singleText(item.pendingChangeText, "Änderungswunsch", { required: true });
  const fields = {
    title: fieldsForOrchestrator(item).title,
    desiredResult: `${item.desiredOutcome}\n\nÄnderungswunsch: ${changeText}`,
    context: item.notes || "",
    deadlineText: item.preferredTiming || "",
  };
  const selection = {
    projectManager: item.plan.agents.projectManager,
    specialists: item.plan.agents.specialists,
    quality: item.plan.agents.quality,
  };
  const result = orchestrator.generateResult(fields, selection);
  const qualityCheck = orchestrator.runQualityCheck(fields);
  pushImmutableVersion(
    item,
    {
      title: result.title,
      summary: result.summary,
      body: result.body,
      qualityStatus: qualityCheck.qualityStatus,
      qualityNote: qualityCheck.qualityNote,
      openPoints: qualityCheck.openPoints,
      agentsInvolved: agentsInvolvedFromPlan(item.plan),
      trigger: "CHANGE_REQUEST",
      changeRequestText: changeText,
    },
    options,
  );
  item.pendingChangeText = null;
  item.status = STATUS.RESULT_READY;
  item.updatedAt = nowIso(options.now || new Date());
  return next;
}

// J. "Passt" – intern als erledigt markieren. Keine externe Aktion, keine
// Veröffentlichung, kein Billing (dieses Modul kennt beides ohnehin nicht).
function markDone(store, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  assertStatus(item, [STATUS.RESULT_READY], "Als erledigt markieren");
  item.status = STATUS.DONE;
  item.decision = "PASST";
  const now = nowIso(options.now || new Date());
  item.decidedAt = now;
  item.doneAt = now;
  item.updatedAt = now;
  return next;
}

// Sekundär: "Später" verändert bewusst nicht den Status, nur einen Merker.
function markLater(store, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  if (TERMINAL_STATUSES.includes(item.status)) {
    throw new Error("Ein abgeschlossener Arbeitswunsch kann nicht auf später verschoben werden.");
  }
  item.postponedAt = nowIso(options.now || new Date());
  item.updatedAt = item.postponedAt;
  return next;
}

function stopWorkItem(store, reason, options = {}) {
  const next = normalizeStore(store);
  const item = assertHasCurrentItem(next);
  if (TERMINAL_STATUSES.includes(item.status)) {
    throw new Error("Dieser Arbeitswunsch ist bereits abgeschlossen.");
  }
  item.status = STATUS.STOPPED;
  item.decision = "GESTOPPT";
  item.stoppedAt = nowIso(options.now || new Date());
  item.updatedAt = item.stoppedAt;
  item.stopReason = singleText(reason, "Stoppgrund");
  return next;
}

function getStatusLabel(status) {
  return STATUS_LABELS_DE[status] || "UNGEKLÄRT";
}

function getPrimaryAction(item) {
  if (!item) return { id: "SET_OUTCOME", label: "Ergebniswunsch festlegen" };
  return PRIMARY_ACTION_BY_STATUS[item.status] || { id: "UNKNOWN", label: "UNGEKLÄRT" };
}

// Sicherer, vollständig JSON-serialisierbarer Blick auf den Speicher – keine
// internen Laufzeitobjekte, keine Funktionen, keine Systemprompts (dieses
// Modul erzeugt ohnehin keine).
function getSafeView(store, projects) {
  const next = normalizeStore(store);
  const prioritized = resolvePrioritizedProject(next, projects);
  return {
    currentItem: next.currentItem,
    statusLabel: next.currentItem ? getStatusLabel(next.currentItem.status) : null,
    primaryAction: getPrimaryAction(next.currentItem),
    prioritizedProject: prioritized.project,
    prioritizedProjectSource: prioritized.source,
    compactProjectCandidates: compactProjectCandidates(projects),
  };
}

module.exports = {
  STATUS,
  STATUS_VALUES,
  STATUS_LABELS_DE,
  PRIMARY_ACTION_BY_STATUS,
  AGENT_ROLE_LABELS_DE,
  ESCALATION_REASON_LABELS_DE,
  TERMINAL_STATUSES,
  DEFAULT_PROJECT_ID,
  MAX_FIELD_LENGTH,
  createStore,
  resolvePrioritizedProject,
  compactProjectCandidates,
  startNewItem,
  chooseProject,
  setDesiredOutcome,
  startRun,
  completeRun,
  answerClarifyingQuestion,
  requestChange,
  completeChange,
  markDone,
  markLater,
  stopWorkItem,
  getStatusLabel,
  getPrimaryAction,
  getSafeView,
  // Read-only für Tests/Diagnose, keine unabhängige zweite Fachlogik.
  agentRegistryRef: agentRegistry,
};
