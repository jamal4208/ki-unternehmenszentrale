"use strict";

// V7.6.3 – Health Upgrade Kompass als ersten echten, kontrollierten
// Referenz-Arbeitslauf in der KI-Unternehmenszentrale verankern.
//
// Dieses Modul verankert GENAU EINEN kanonischen Referenzlauf (keine zweite,
// parallele Projektlaufarchitektur, kein generisches neues Arbeitslauf-
// Werkzeug). Es nutzt ausschließlich bereits bestehende Bausteine:
//   - agent-registry.js (kanonisches 25-Agenten-Register, ROLE_NAME_MAPPING)
//   - auth-db.js/auth-db-migrations.js (bestehendes SQLite-/Migrationsmuster)
//   - auth-audit.js (bestehender Auditkern)
//   - health-repo-status.js (bestehender, bereits read-only abgesicherter
//     Health-Live-Status – KEIN neuer Git-Zugriff, KEIN Schreibzugriff)
//   - project-registry.js (kanonischer Health-Projektpfad)
//
// Harte Grenzen (siehe HEALTH_REFERENCE_WORK_RUN.md):
//   - Dieses Modul führt NIEMALS eine echte Health-Aktion aus, ändert
//     NIEMALS eine Datei im Health-Repository, wechselt NIEMALS dessen
//     Branch, committet und pusht NIEMALS.
//   - Dieses Modul legt NIEMALS einen neuen Agenten an und erweitert
//     NIEMALS das kanonische 25-Agenten-Register.
//   - `REFERENCE_READY` wird NIEMALS automatisch erreicht – ausschließlich
//     über recordFinalAcceptance({ confirmed: true }), Jamals ausdrückliche
//     Abnahme.
//   - Es werden KEINE Health-Nutzerdaten und KEINE medizinischen Daten
//     gespeichert – ausschließlich Steuerungsmetadaten dieses Laufs selbst.

const crypto = require("crypto");
const agentRegistry = require("./agent-registry");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");
const healthRepoStatus = require("./health-repo-status");

const RUN_STATUS_VALUES = migrations.HEALTH_REFERENCE_RUN_STATUS_VALUES;
const WORK_PACKAGE_KEY_VALUES = migrations.HEALTH_REFERENCE_WORK_PACKAGE_KEY_VALUES;
const APPROVAL_KEY_VALUES = migrations.HEALTH_REFERENCE_APPROVAL_KEY_VALUES;
const APPROVAL_DECISION_VALUES = migrations.HEALTH_REFERENCE_APPROVAL_DECISION_VALUES;
const RESULT_KIND_VALUES = migrations.HEALTH_REFERENCE_RESULT_KIND_VALUES;

const WORK_PACKAGE_KEY_SET = new Set(WORK_PACKAGE_KEY_VALUES);
const APPROVAL_KEY_SET = new Set(APPROVAL_KEY_VALUES);

const CANONICAL_RUN_ID = "health-reference-work-run-v1";
const HEALTH_PROJECT_ID = "health-upgrade-kompass";
const HEALTH_PROJECT_PATH = "/Users/jamal/Documents/New project/health-upgrade-kompass";
const RUN_TITLE = "Health Upgrade Kompass bis zum abnehmbaren Referenz-Walkthrough führen";
const OUTCOME_TEXT =
  "Der Health Upgrade Kompass durchläuft stabil und nachvollziehbar den vollständigen Referenzweg von Start " +
  "und sechs Antworten über Ergebnis und Beraterinnenübergabe bis zum Kundenbereich und kann von Jamal anhand " +
  "eines dokumentierten Walkthroughs abgenommen werden.";

class HealthReferenceWorkRunError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "HealthReferenceWorkRunError";
    this.statusCode = statusCode;
  }
}
function badRequest(message) {
  return new HealthReferenceWorkRunError(message, 400);
}
function notFound(message) {
  return new HealthReferenceWorkRunError(message, 404);
}
function conflict(message) {
  return new HealthReferenceWorkRunError(message, 409);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}
function truncate(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// ---------------------------------------------------------------------------
// Agentenzuteilung (Auftrag Abschnitt 4) – ausschließlich bereits
// vorhandene, kanonische Agenten (AGENTS.md/agent-registry.js). Keine
// Namen/IDs werden erfunden; jeder Name wird gegen
// agent-registry.js#ROLE_NAME_MAPPING geprüft und wirft, falls unbekannt.
// ---------------------------------------------------------------------------
function resolveCanonicalAgent(canonicalName) {
  const agentKey = agentRegistry.ROLE_NAME_MAPPING[canonicalName];
  if (!agentKey || !agentRegistry.hasAgentId(agentKey)) {
    throw new Error(`health-reference-work-run-service: unbekannte kanonische Agentenrolle "${canonicalName}".`);
  }
  const agent = agentRegistry.getAgentById(agentKey);
  return Object.freeze({
    canonicalName,
    agentKey,
    technicalName: agent.name,
    technicalRole: agent.role,
  });
}

// Genau ein Hauptverantwortlicher (Auftrag Abschnitt 4): Projektmanager-Agent
// hält Ergebnisverantwortung, zerlegt den Finish in Arbeitspakete, verhindert
// Scope-Ausweitung, übergibt an die Ausführungsebene.
const MAIN_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Projektmanager-Agent"),
  runRole: "MAIN_RESPONSIBLE",
  focus:
    "Hält Ergebnisverantwortung, zerlegt den Finish in kontrollierte Arbeitspakete, verhindert Scope-Ausweitung, " +
    "übergibt an die Ausführungsebene, prüft Rückmeldungen, eskaliert Entscheidungen an Jamal.",
});

// Maximal drei Fachagenten (Auftrag Abschnitt 4).
const SPECIALIST_AGENTS = Object.freeze([
  Object.freeze({
    ...resolveCanonicalAgent("Produktmanager-Agent"),
    runRole: "PRODUCT_UX_SPECIALIST",
    focus: "Prüft Nutzerfluss, Start-Gate, Verständlichkeit, mobile Nutzung, klare nächste Schritte, keine unnötige Komplexität.",
  }),
  Object.freeze({
    ...resolveCanonicalAgent("Entwickler-Agent"),
    runRole: "DEVELOPMENT_SPECIALIST",
    focus: "Technische Umsetzungsvorbereitung: Persistenz, Flow-Stabilität, Fehlerfälle, Tests, keine Phase-2-Waagenintegration.",
  }),
  Object.freeze({
    ...resolveCanonicalAgent("Content-Agent"),
    runRole: "CONTENT_DOCUMENTATION_SPECIALIST",
    focus: "Texte, Beraterinnenübergabe, Kundenbereich, Walkthrough-Dokumentation, Ehrlichkeitsgrenzen, Referenznachweis.",
  }),
]);

// Genau ein QA-/Sicherheitsagent (Auftrag Abschnitt 4).
const QA_AGENT = Object.freeze({
  ...resolveCanonicalAgent("QA-Agent"),
  runRole: "QA_SECURITY",
  focus:
    "Prüft Abschlusskriterien, Datenschutz, fehlende Rechtstexte, technische Grenzen; keine falsche Produktionsreife, " +
    "keine echte Waagenbehauptung, keine automatische externe Aktion.",
});

// ---------------------------------------------------------------------------
// Nicht-Ziele (Auftrag Abschnitt 6) – in jeder Übergabe/jedem Prompt-Entwurf
// sichtbar, damit kein Scope-Creep unbemerkt entsteht.
// ---------------------------------------------------------------------------
const NON_GOALS = Object.freeze([
  "Echte Waagenhardware",
  "BLE",
  "Yolanda-SDK",
  "Neue Scale-UI",
  "Automatische Hardwareerkennung",
  "Google Workspace",
  "Finance",
  "Marketingagentur",
  "Expansion-App-Abtrennung",
  "Vollständiger Produktionsbetrieb",
  "Automatische Veröffentlichung",
  "Automatische Kundenkommunikation",
  "Automatische Freigaben",
  "Neue Agenten",
  "Agent 26",
]);

// ---------------------------------------------------------------------------
// Sieben Arbeitspakete (Auftrag Abschnitt 5) – feste Reihenfolge, keine
// automatische Ausführung, ausschließlich Vorbereitung.
// ---------------------------------------------------------------------------
const WORK_PACKAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "HEALTH_BASELINE_CONFIRMATION",
    sequence: 1,
    title: "Health-Ausgangsstand bestätigen",
    scope: ["Branch, HEAD, Tests, aktueller Flow", "vorhandene Funktionen", "offene Lücken", "keine Änderungen"],
  }),
  Object.freeze({
    key: "START_GATE_AND_ENTRY",
    sequence: 2,
    title: "Start-Gate und Einstieg",
    scope: ["Start", "erste klare Handlung", "Start-Gate", "keine tote oder verwirrende Einstiegssituation"],
  }),
  Object.freeze({
    key: "SIX_ANSWERS_AND_RESULT",
    sequence: 3,
    title: "Sechs Antworten und Ergebnis",
    scope: ["sechs Antworten", "Validierung", "Ergebnis", "verständliche Fehlerfälle", "mobile Nutzbarkeit"],
  }),
  Object.freeze({
    key: "ADVISOR_HANDOFF_AND_CUSTOMER_AREA",
    sequence: 4,
    title: "Beraterinnenübergabe und Kundenbereich",
    scope: ["Beraterinnenübergabe", "Kundenbereich", "klare nächste Schritte", "keine unbestätigten externen Aktionen"],
  }),
  Object.freeze({
    key: "PERSISTENCE_PRIVACY_AND_LEGAL_BOUNDARIES",
    sequence: 5,
    title: "Persistenz, Datenschutz und Rechtsgrenzen",
    scope: [
      "nur notwendige Persistenz",
      "Consent",
      "Datenschutzgrenzen",
      "Rechtstexte und offene Fachprüfung",
      "keine medizinische Überbehauptung",
    ],
  }),
  Object.freeze({
    key: "REFERENCE_WALKTHROUGH_AND_QA",
    sequence: 6,
    title: "Referenz-Walkthrough und QA",
    scope: ["vollständige Teststrecke", "mobile Prüfung", "sichtbare Ergebnisse", "dokumentierte Abweichungen", "Referenzartefakt"],
  }),
  Object.freeze({
    key: "JAMAL_FINAL_ACCEPTANCE",
    sequence: 7,
    title: "Jamals finale Abnahme",
    scope: ["Jamals Walkthrough", "offene Punkte", "Freigabe oder Rückgabe", "erst danach Status REFERENCE_READY"],
  }),
]);
const WORK_PACKAGE_DEFINITIONS_BY_KEY = new Map(WORK_PACKAGE_DEFINITIONS.map((entry) => [entry.key, entry]));

// ---------------------------------------------------------------------------
// Sieben Jamal-Freigabepunkte (Auftrag Abschnitt 7).
// ---------------------------------------------------------------------------
const APPROVAL_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "SCOPE", label: "Scope-Freigabe" }),
  Object.freeze({ key: "EXECUTABLE_WORK_ORDER", label: "Freigabe eines ausführbaren Cursor-Arbeitsauftrags" }),
  Object.freeze({ key: "SCOPE_EXTENSION", label: "Freigabe jeder relevanten Scope-Erweiterung" }),
  Object.freeze({ key: "LEGAL_PRIVACY_WORDING", label: "Freigabe rechtlicher oder datenschutzrelevanter Formulierungen" }),
  Object.freeze({ key: "PRE_COMMIT", label: "Freigabe vor Commit" }),
  Object.freeze({ key: "PRE_PUSH", label: "Freigabe vor Push" }),
  Object.freeze({ key: "FINAL_REFERENCE_ACCEPTANCE", label: "Finale Referenzabnahme" }),
]);

// ---------------------------------------------------------------------------
// Vierzehn Abschlusskriterien (Auftrag Abschnitt 10).
// ---------------------------------------------------------------------------
const ACCEPTANCE_CRITERIA = Object.freeze([
  "Startseite funktioniert",
  "Start-Gate ist verständlich und stabil",
  "Sechs Antworten sind vollständig möglich",
  "Ergebnis erscheint korrekt und verständlich",
  "Beraterinnenübergabe ist nachvollziehbar",
  "Kundenbereich ist erreichbar und verständlich",
  "keine tote Hauptnavigation existiert",
  "mobile Hauptstrecke ist geprüft",
  "relevante Tests sind grün",
  "Datenschutz- und Ehrlichkeitsgrenzen sind sichtbar",
  "Scale-Funktion bleibt klar als Demo/Phase 2 abgegrenzt",
  "Walkthrough-Protokoll ist vorhanden",
  "bekannte Restpunkte sind dokumentiert",
  "Jamal hat den Referenz-Walkthrough ausdrücklich freigegeben",
]);

// V7.6.4 (Auftrag Abschnitt 2): "COMPLETED" ist ausschließlich ein
// Arbeitspaket-Status (health_reference_work_packages.status, siehe
// auth-db-migrations.js#HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES) und
// bedeutet ausdrücklich NICHT "gesamter Lauf abgeschlossen"/
// `REFERENCE_READY`. Ein Lauf (health_reference_runs.status) wird niemals
// `COMPLETED` – siehe syncRunStatusToActivePackage/NEXT_PACKAGE_SKIP_
// STATUSES unten. Dieser Eintrag wird ausschließlich für die Anzeige des
// Arbeitspaket-Status (rowToWorkPackageView) benötigt.
const RUN_STATUS_LABELS_DE = Object.freeze({
  PREPARED_FOR_EXECUTION: "Vorbereitet",
  WAITING_FOR_JAMAL_APPROVAL: "Wartet auf Jamal-Freigabe",
  APPROVED_FOR_EXECUTION: "Für Ausführung freigegeben",
  IN_EXECUTION: "In Ausführung",
  RESULT_SUBMITTED: "Ergebnis eingereicht",
  QA_REVIEW: "In QA-Prüfung",
  CHANGES_REQUESTED: "Änderung angefordert",
  WAITING_FOR_FINAL_ACCEPTANCE: "Wartet auf finale Abnahme",
  COMPLETED: "Abgeschlossen",
  REFERENCE_READY: "Referenz abgenommen",
  BLOCKED: "Blockiert",
  CANCELLED: "Abgebrochen",
});

const NEXT_ACTION_BY_STATUS = Object.freeze({
  PREPARED_FOR_EXECUTION: { id: "PREPARE_FIRST_WORK_PACKAGE", label: "Ersten Arbeitspaket-Prompt vorbereiten" },
  WAITING_FOR_JAMAL_APPROVAL: { id: "REVIEW_PROMPT_DRAFT", label: "Prompt-Entwurf von Jamal prüfen lassen" },
  APPROVED_FOR_EXECUTION: { id: "HAND_OVER_TO_EXECUTION", label: "An Ausführungsebene übergeben" },
  IN_EXECUTION: { id: "WAIT_FOR_RESULT", label: "Auf Ergebnisbericht warten" },
  RESULT_SUBMITTED: { id: "RUN_QA_REVIEW", label: "QA-Prüfung durchführen" },
  QA_REVIEW: { id: "RECORD_QA_FINDING", label: "QA-Befund erfassen" },
  CHANGES_REQUESTED: { id: "PREPARE_CHANGE_PACKAGE", label: "Änderungswunsch in neuen Arbeitspaket-Prompt überführen" },
  WAITING_FOR_FINAL_ACCEPTANCE: { id: "PREPARE_FINAL_ACCEPTANCE", label: "Jamals finale Abnahme vorbereiten" },
  REFERENCE_READY: { id: "NONE", label: "Referenzlauf abgenommen – kein weiterer Schritt in diesem Lauf." },
  BLOCKED: { id: "RESOLVE_BLOCKER", label: "Blocker mit Jamal klären" },
  CANCELLED: { id: "NONE", label: "Lauf abgebrochen." },
});

// V7.6.4 (Auftrag Abschnitt 7): die statische NEXT_ACTION_BY_STATUS-Tabelle
// oben bleibt der Fallback, wird aber für die beiden häufigsten Zustände um
// den Titel des tatsächlich betroffenen Arbeitspakets ergänzt ("Prompt für
// Start-Gate und Einstieg prüfen und freigeben" statt generisch "Prompt-
// Entwurf von Jamal prüfen lassen"). Die id bleibt stabil, damit
// health-reference-work-run-ui.js unverändert auf `nextAction.id` schalten
// kann.
function computeNextAction(runStatus, nextWorkPackage) {
  if (runStatus === "PREPARED_FOR_EXECUTION" && nextWorkPackage) {
    return { id: "PREPARE_FIRST_WORK_PACKAGE", label: `Prompt für ${nextWorkPackage.title} vorbereiten` };
  }
  if (runStatus === "WAITING_FOR_JAMAL_APPROVAL" && nextWorkPackage && nextWorkPackage.hasPromptDraft) {
    return { id: "REVIEW_PROMPT_DRAFT", label: `Prompt für ${nextWorkPackage.title} prüfen und freigeben` };
  }
  return NEXT_ACTION_BY_STATUS[runStatus] || NEXT_ACTION_BY_STATUS.PREPARED_FOR_EXECUTION;
}

// V7.6.4 (Auftrag Abschnitt 2/6): getrennte Statusmengen für Fortschritt und
// "nächstes Arbeitspaket". `COMPLETED` zählt fachlich als abgeschlossen für
// den Fortschritt (X von 7); ein abgebrochenes Einzelpaket (`CANCELLED`)
// blockiert die Ermittlung des nächsten Pakets zusätzlich, zählt aber
// NICHT als Fortschritt (kein erfundener Erfolg). `WAITING_FOR_FINAL_
// ACCEPTANCE`, `QA_REVIEW`, `RESULT_SUBMITTED`, `CHANGES_REQUESTED` und
// `BLOCKED` zählen ausdrücklich NICHT als abgeschlossen.
const PROGRESS_COMPLETED_PACKAGE_STATUSES = Object.freeze(new Set(["COMPLETED", "REFERENCE_READY"]));
const NEXT_PACKAGE_SKIP_STATUSES = Object.freeze(new Set(["COMPLETED", "REFERENCE_READY", "CANCELLED"]));
const RUN_STATUS_VALUE_SET = new Set(RUN_STATUS_VALUES);

// Fester, unveränderlicher Hinweistext (Auftrag Abschnitt 11 – "keine
// Schaltfläche, die echte Health-Arbeit ausführt" / "UI behauptet keine
// Produktionsreife"). Erscheint in jeder Antwort dieses Moduls.
const AUTONOMY_BOUNDARIES_NOTICE = Object.freeze({
  noRealHealthExecution: true,
  noHealthFileChanged: true,
  noHealthBranchSwitch: true,
  noHealthCommit: true,
  noHealthPush: true,
  noNewAgentCreated: true,
  noExternalAction: true,
  noRealScaleHardwareClaim: true,
  autoCommitAllowed: false,
  autoPushAllowed: false,
  referenceReadyRequiresExplicitJamalAcceptance: true,
  productionReadinessClaim: false,
  disclaimer:
    "Dieser Lauf bereitet den Health-Finish vor und führt ihn nach Freigabe. Er ist kein Nachweis, dass der " +
    "Health Upgrade Kompass produktionsreif ist, und keine echte Health-Ausführung.",
});

function assertRunIsMutable(run) {
  if (!run) throw notFound("Der Health-Referenzlauf wurde noch nicht angelegt.");
  if (run.status === "REFERENCE_READY") {
    throw conflict("Der Referenzlauf ist bereits abgenommen (REFERENCE_READY) und kann nicht mehr verändert werden.");
  }
  if (run.status === "CANCELLED") {
    throw conflict("Der Referenzlauf wurde abgebrochen (CANCELLED) und kann nicht mehr verändert werden.");
  }
}

// ---------------------------------------------------------------------------
// Anlage/Abruf des kanonischen Laufs – idempotent, genau eine feste ID.
// ---------------------------------------------------------------------------
function getOrCreateCanonicalRun(db, options = {}) {
  const now = options.now || new Date();
  let runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  const alreadyExisted = Boolean(runRow);

  if (!runRow) {
    const record = {
      id: CANONICAL_RUN_ID,
      title: RUN_TITLE,
      projectId: HEALTH_PROJECT_ID,
      projectPath: HEALTH_PROJECT_PATH,
      outcomeText: OUTCOME_TEXT,
      status: "PREPARED_FOR_EXECUTION",
      mainAgentCanonicalName: MAIN_AGENT.canonicalName,
      specialistAgentsJson: JSON.stringify(
        SPECIALIST_AGENTS.map((agent) => ({ canonicalName: agent.canonicalName, agentKey: agent.agentKey, focus: agent.focus })),
      ),
      qaAgentCanonicalName: QA_AGENT.canonicalName,
      createdAt: nowIso(now),
      updatedAt: nowIso(now),
    };
    runRow = authDb.insertHealthReferenceRunIfMissing(db, record);

    WORK_PACKAGE_DEFINITIONS.forEach((definition) => {
      authDb.insertHealthReferenceWorkPackageIfMissing(db, {
        id: crypto.randomUUID(),
        runId: CANONICAL_RUN_ID,
        packageKey: definition.key,
        sequence: definition.sequence,
        title: definition.title,
        status: "PREPARED_FOR_EXECUTION",
        promptDraftJson: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      });
    });

    APPROVAL_DEFINITIONS.forEach((definition) => {
      authDb.upsertHealthReferenceApproval(db, {
        id: crypto.randomUUID(),
        runId: CANONICAL_RUN_ID,
        approvalKey: definition.key,
        decision: "PENDING",
        note: null,
        decidedAt: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      });
    });
  }

  if (!alreadyExisted) {
    try {
      authAudit.recordAuditEvent(db, {
        eventType: "HEALTH_REFERENCE_RUN_CREATED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { healthReferenceRunId: CANONICAL_RUN_ID },
      });
    } catch (_error) {
      /* Audit-Fehler dürfen die bereits gültige Anlage nicht rückgängig machen. */
    }
  }

  return buildRunView(db, authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID));
}

function rowToWorkPackageView(row) {
  if (!row) return null;
  let promptDraft = null;
  try {
    promptDraft = row.promptDraftJson ? JSON.parse(row.promptDraftJson) : null;
  } catch (_error) {
    promptDraft = null;
  }
  const definition = WORK_PACKAGE_DEFINITIONS_BY_KEY.get(row.packageKey) || null;
  return {
    id: row.id,
    packageKey: row.packageKey,
    sequence: row.sequence,
    title: row.title,
    scope: definition ? definition.scope : [],
    status: row.status,
    statusLabel: RUN_STATUS_LABELS_DE[row.status] || row.status,
    promptDraft,
    hasPromptDraft: Boolean(promptDraft),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToApprovalView(row) {
  if (!row) return null;
  const definition = APPROVAL_DEFINITIONS.find((entry) => entry.key === row.approvalKey);
  return {
    id: row.id,
    approvalKey: row.approvalKey,
    label: definition ? definition.label : row.approvalKey,
    decision: row.decision,
    note: row.note,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToResultView(row) {
  if (!row) return null;
  let details = null;
  try {
    details = row.detailsJson ? JSON.parse(row.detailsJson) : null;
  } catch (_error) {
    details = null;
  }
  return {
    id: row.id,
    workPackageKey: row.workPackageKey,
    kind: row.kind,
    summary: row.summary,
    details,
    createdAt: row.createdAt,
  };
}

function buildRunView(db, runRow) {
  if (!runRow) return null;
  const workPackages = authDb.listHealthReferenceWorkPackages(db, runRow.id).map(rowToWorkPackageView);
  const approvals = authDb.listHealthReferenceApprovals(db, runRow.id).map(rowToApprovalView);
  const results = authDb.listHealthReferenceResults(db, runRow.id).map(rowToResultView);
  const nextWorkPackage = workPackages.find((pkg) => !NEXT_PACKAGE_SKIP_STATUSES.has(pkg.status)) || null;
  const completedCount = workPackages.filter((pkg) => PROGRESS_COMPLETED_PACKAGE_STATUSES.has(pkg.status)).length;

  let specialistAgents = SPECIALIST_AGENTS;
  try {
    const parsed = JSON.parse(runRow.specialistAgentsJson);
    if (Array.isArray(parsed) && parsed.length === SPECIALIST_AGENTS.length) {
      specialistAgents = SPECIALIST_AGENTS;
    }
  } catch (_error) {
    /* Fällt sicher auf die aktuelle, im Code definierte Teamzuordnung zurück. */
  }

  return {
    id: runRow.id,
    title: runRow.title,
    projectId: runRow.projectId,
    projectPath: runRow.projectPath,
    outcomeText: runRow.outcomeText,
    status: runRow.status,
    statusLabel: RUN_STATUS_LABELS_DE[runRow.status] || runRow.status,
    nextAction: computeNextAction(runRow.status, nextWorkPackage),
    team: {
      mainAgent: MAIN_AGENT,
      specialists: specialistAgents,
      qaAgent: QA_AGENT,
    },
    workPackages,
    approvals,
    results,
    nonGoals: NON_GOALS,
    acceptanceCriteria: ACCEPTANCE_CRITERIA,
    progress: { completed: completedCount, total: workPackages.length },
    nextWorkPackage,
    createdAt: runRow.createdAt,
    updatedAt: runRow.updatedAt,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  };
}

function getRunView(db) {
  return getOrCreateCanonicalRun(db);
}

// ---------------------------------------------------------------------------
// V7.6.4 (Auftrag Abschnitt 3) – zentrale, einzige Stelle, die den
// Laufstatus aus dem tatsächlichen Arbeitspaket-Zustand ableitet: der
// Laufstatus spiegelt immer den Status des "aktiven" Arbeitspakets (das
// erste noch nicht abgeschlossene/abgebrochene Paket in fester Reihenfolge).
// Das behebt gleichzeitig drei zuvor gemeldete Lücken, ohne Sonderfälle je
// Funktion zu benötigen:
//   - Ein auf APPROVED_FOR_EXECUTION gesetztes Paket macht diesen Zustand
//     jetzt auch im Lauf sichtbar (statt ihn zu überspringen).
//   - Ist ein Paket abgeschlossen (COMPLETED) und das nächste Paket bereits
//     WAITING_FOR_JAMAL_APPROVAL, zeigt der Lauf automatisch ebenfalls
//     WAITING_FOR_JAMAL_APPROVAL (statt im alten QA_REVIEW/RESULT_SUBMITTED
//     hängen zu bleiben).
//   - Sind alle Pakete abgeschlossen/abgebrochen, bleibt der Laufstatus
//     unverändert (kein automatischer Sprung zu REFERENCE_READY) –
//     REFERENCE_READY wird ausschließlich über recordFinalAcceptance
//     erreicht.
// BLOCKED, CANCELLED und REFERENCE_READY sind bewusste Übersteuerungen/
// Endzustände des GESAMTEN Laufs und werden von dieser Funktion niemals
// automatisch überschrieben.
function syncRunStatusToActivePackage(db, runRow, now) {
  if (runRow.status === "BLOCKED" || runRow.status === "CANCELLED" || runRow.status === "REFERENCE_READY") {
    return;
  }
  const packages = authDb.listHealthReferenceWorkPackages(db, runRow.id);
  const activePackage = packages.find((pkg) => !NEXT_PACKAGE_SKIP_STATUSES.has(pkg.status));
  if (!activePackage) return;
  const derivedStatus = RUN_STATUS_VALUE_SET.has(activePackage.status) ? activePackage.status : null;
  if (derivedStatus && derivedStatus !== runRow.status) {
    authDb.updateHealthReferenceRunStatus(db, { id: runRow.id, status: derivedStatus, updatedAt: nowIso(now) });
  }
}

// V7.6.4 (Auftrag Abschnitt 4) – ein einziger, additiver Audit-Ereignistyp
// für JEDEN Arbeitspaket-Statusübergang (Freigabe, Ausführung gestartet,
// Ergebnis eingereicht, QA-Ergebnis, Paket abgeschlossen, Änderung
// angefordert, blockiert, abgebrochen), ausschließlich mit den vier
// erlaubten Metadatenfeldern. Ergänzt die bereits bestehenden,
// spezifischeren Ereignistypen (HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED
// etc.) – ersetzt sie nicht.
function auditWorkPackageStatusChanged(db, options = {}) {
  const { packageKey, previousStatus, nextStatus, actorUserId, now } = options;
  if (previousStatus === nextStatus) return;
  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED",
      result: "OK",
      actorUserId: actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey, previousStatus, nextStatus },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Statusänderung nicht rückgängig machen. */
  }
}

// ---------------------------------------------------------------------------
// Übergabevertrag an die Ausführungsebene (Auftrag Abschnitt 8) – reiner
// Textentwurf, keine Ausführung. buildHandoverContract enthält bewusst
// Pfad/Branch/HEAD (Auftrag Abschnitt 13, Testpunkt 15) und macht "keine
// automatische Commit-/Push-Freigabe" (Testpunkt 16) explizit.
// ---------------------------------------------------------------------------
function buildHandoverContract(definition, liveHealthStatus) {
  const healthAvailable = Boolean(liveHealthStatus && liveHealthStatus.available);
  const branch = healthAvailable ? liveHealthStatus.branch : "UNGEKLÄRT (Health-Repository lokal nicht lesbar oder nicht geprüft)";
  const head = healthAvailable ? liveHealthStatus.head : "UNGEKLÄRT (Health-Repository lokal nicht lesbar oder nicht geprüft)";
  const workingTreeCleanAtDraftTime = healthAvailable ? liveHealthStatus.workingTreeClean : null;

  return Object.freeze({
    workPackageKey: definition.key,
    workPackageTitle: definition.title,
    projectPath: HEALTH_PROJECT_PATH,
    branch,
    head,
    workingTreeCleanAtDraftTime,
    outcomeGoal: `${definition.title}: ${definition.scope.join("; ")}.`,
    allowedFiles:
      "Wird erst bei Jamal-Freigabe je Arbeitspaket konkret benannt (ausschließlich Health-Repository-Dateien im " +
      "genannten fachlichen Umfang).",
    forbiddenFiles: [
      "Alles außerhalb des Health-Repository-Pfads",
      "Bestehende Testdateien dürfen nicht gelöscht oder abgeschwächt werden",
      "keine Secrets/Zugangsdaten",
    ],
    scope: definition.scope,
    nonGoals: NON_GOALS,
    testRequirements: [
      "Alle bestehenden Health-Tests bleiben grün.",
      "npm test lokal ausführen und Ergebnis im Abschlussbericht nennen.",
      "Kein bestehender Testfall wird entfernt oder abgeschwächt.",
    ],
    securityBoundaries: [
      "Keine echte Waagenhardware, kein BLE, kein Yolanda-SDK.",
      "Keine externen Requests, kein Login, kein OAuth, kein Mailversand.",
      "Keine Veröffentlichung, kein Deployment.",
      "Keine medizinische Überbehauptung, kein Diagnose-/Heilversprechen.",
    ],
    expectedGitStatus:
      "Health Working Tree bleibt entweder sauber oder enthält ausschließlich bewusst offen dokumentierte, noch " +
      "nicht committete Änderungen.",
    autoCommitAllowed: false,
    autoPushAllowed: false,
    commitRequiresJamalApproval: true,
    pushRequiresJamalApproval: true,
    reportRequirements: [
      "Kurze Zusammenfassung des tatsächlichen Ergebnisses",
      "Geänderte/neue Dateien",
      "Testergebnis (grün/rot, Anzahl)",
      "Tatsächliche Laufzeit (technisch gemessen, keine Schätzung)",
      "Offene Punkte",
    ],
    status: "WAITING_FOR_JAMAL_APPROVAL",
    note: "Entwurf – noch keine Ausführung. Jamal kopiert oder genehmigt diesen Auftrag manuell.",
  });
}

async function prepareWorkPackagePromptDraft(db, options = {}) {
  const packageKey = options.packageKey;
  if (!WORK_PACKAGE_KEY_SET.has(packageKey)) throw badRequest("workPackageKey ist unbekannt.");

  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);
  const pkgRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey);
  if (!pkgRow) throw notFound("Dieses Arbeitspaket wurde nicht gefunden.");

  const now = options.now || new Date();
  let liveHealthStatus = null;
  try {
    liveHealthStatus = await healthRepoStatus.readHealthRepoStatus(options.healthRepoStatusOptions || {});
  } catch (_error) {
    liveHealthStatus = null;
  }

  const definition = WORK_PACKAGE_DEFINITIONS_BY_KEY.get(packageKey);
  const contract = buildHandoverContract(definition, liveHealthStatus);
  const promptDraftJson = JSON.stringify(contract);
  if (promptDraftJson.length > 8000) {
    throw badRequest("Der Prompt-Entwurf ist zu umfangreich für die lokale Ablage (maximal 8000 Zeichen).");
  }

  const previousStatus = pkgRow.status;
  const updated = authDb.updateHealthReferenceWorkPackage(db, {
    id: pkgRow.id,
    status: "WAITING_FOR_JAMAL_APPROVAL",
    promptDraftJson,
    updatedAt: nowIso(now),
  });

  syncRunStatusToActivePackage(db, runRow, now);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_WORK_PACKAGE_PREPARED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey },
    });
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_PROMPT_DRAFT_CREATED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Vorbereitung nicht rückgängig machen. */
  }
  auditWorkPackageStatusChanged(db, {
    packageKey,
    previousStatus,
    nextStatus: "WAITING_FOR_JAMAL_APPROVAL",
    actorUserId: options.actorUserId,
    now,
  });

  return rowToWorkPackageView(updated);
}

// ---------------------------------------------------------------------------
// Jamal-Freigaben (Auftrag Abschnitt 7) – FINAL_REFERENCE_ACCEPTANCE ist
// bewusst von dieser generischen Funktion ausgeschlossen (siehe
// recordFinalAcceptance): kein Agent, keine generische Route darf
// REFERENCE_READY auslösen.
// ---------------------------------------------------------------------------
function recordApproval(db, options = {}) {
  const approvalKey = options.approvalKey;
  if (!APPROVAL_KEY_SET.has(approvalKey)) throw badRequest("approvalKey ist unbekannt.");
  if (approvalKey === "FINAL_REFERENCE_ACCEPTANCE") {
    throw badRequest("Die finale Referenzabnahme muss über die eigene Abnahmefunktion erfasst werden.");
  }
  const decision = options.decision;
  if (!APPROVAL_DECISION_VALUES.includes(decision)) {
    throw badRequest("decision muss PENDING, APPROVED oder REJECTED sein.");
  }
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);

  const now = options.now || new Date();
  const noteText = truncate(options.note, 1000) || null;
  const updated = authDb.upsertHealthReferenceApproval(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    approvalKey,
    decision,
    note: noteText,
    decidedAt: decision === "PENDING" ? null : nowIso(now),
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_APPROVAL_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, approvalKey },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Freigabeerfassung nicht rückgängig machen. */
  }

  return rowToApprovalView(updated);
}

// Generischer, aber eingeschränkter Statuswechsel für ein Arbeitspaket.
// REFERENCE_READY ist niemals ein zulässiges Ziel dieser Funktion (siehe
// recordFinalAcceptance).
// V7.6.4 (Auftrag Abschnitt 3): "COMPLETED" ergänzt – erreichbar sowohl
// generisch über diese Funktion als auch automatisch über submitQaFinding
// (Pakete 1–6 nach bestandenem QA). REFERENCE_READY bleibt weiterhin
// niemals ein zulässiges Ziel dieser Funktion (siehe recordFinalAcceptance).
const ALLOWED_GENERIC_PACKAGE_TARGET_STATUSES = Object.freeze([
  "APPROVED_FOR_EXECUTION",
  "IN_EXECUTION",
  "WAITING_FOR_FINAL_ACCEPTANCE",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
]);

function transitionWorkPackage(db, options = {}) {
  const packageKey = options.packageKey;
  if (!WORK_PACKAGE_KEY_SET.has(packageKey)) throw badRequest("workPackageKey ist unbekannt.");
  const toStatus = options.toStatus;
  if (!ALLOWED_GENERIC_PACKAGE_TARGET_STATUSES.includes(toStatus)) {
    throw badRequest(
      `toStatus muss einer von ${ALLOWED_GENERIC_PACKAGE_TARGET_STATUSES.join(", ")} sein (REFERENCE_READY ist ` +
        "ausschließlich über die finale Abnahme erreichbar).",
    );
  }
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);
  const pkgRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey);
  if (!pkgRow) throw notFound("Dieses Arbeitspaket wurde nicht gefunden.");

  const now = options.now || new Date();
  const previousStatus = pkgRow.status;
  const updated = authDb.updateHealthReferenceWorkPackage(db, {
    id: pkgRow.id,
    status: toStatus,
    promptDraftJson: pkgRow.promptDraftJson,
    updatedAt: nowIso(now),
  });

  // BLOCKED/CANCELLED sind bewusste Übersteuerungen des gesamten Laufs;
  // jeder andere Zielstatus wird über die einheitliche Ableitungsfunktion
  // (Auftrag Abschnitt 3: "Laufstatus folgt dem aktiven Arbeitspaket")
  // in den Lauf gespiegelt.
  if (toStatus === "BLOCKED" || toStatus === "CANCELLED") {
    authDb.updateHealthReferenceRunStatus(db, { id: CANONICAL_RUN_ID, status: toStatus, updatedAt: nowIso(now) });
  } else {
    syncRunStatusToActivePackage(db, runRow, now);
  }

  auditWorkPackageStatusChanged(db, {
    packageKey,
    previousStatus,
    nextStatus: toStatus,
    actorUserId: options.actorUserId,
    now,
  });

  return rowToWorkPackageView(updated);
}

function submitResultReport(db, options = {}) {
  const packageKey = options.packageKey;
  if (!WORK_PACKAGE_KEY_SET.has(packageKey)) throw badRequest("workPackageKey ist unbekannt.");
  const summary = truncate(options.summary, 500);
  if (!summary) throw badRequest("summary ist erforderlich.");
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);
  const pkgRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey);
  if (!pkgRow) throw notFound("Dieses Arbeitspaket wurde nicht gefunden.");

  const now = options.now || new Date();
  const previousStatus = pkgRow.status;
  const detailsJson = options.details ? JSON.stringify(options.details).slice(0, 4000) : null;

  authDb.insertHealthReferenceResult(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    workPackageKey: packageKey,
    kind: "RESULT_REPORT",
    summary,
    detailsJson,
    createdAt: nowIso(now),
  });

  authDb.updateHealthReferenceWorkPackage(db, {
    id: pkgRow.id,
    status: "RESULT_SUBMITTED",
    promptDraftJson: pkgRow.promptDraftJson,
    updatedAt: nowIso(now),
  });
  syncRunStatusToActivePackage(db, runRow, now);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey, resultKind: "RESULT_REPORT" },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Einreichung nicht rückgängig machen. */
  }
  auditWorkPackageStatusChanged(db, {
    packageKey,
    previousStatus,
    nextStatus: "RESULT_SUBMITTED",
    actorUserId: options.actorUserId,
    now,
  });

  return rowToWorkPackageView(authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey));
}

function submitQaFinding(db, options = {}) {
  const packageKey = options.packageKey;
  if (!WORK_PACKAGE_KEY_SET.has(packageKey)) throw badRequest("workPackageKey ist unbekannt.");
  const summary = truncate(options.summary, 500);
  if (!summary) throw badRequest("summary ist erforderlich.");
  const passed = Boolean(options.passed);
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);
  const pkgRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey);
  if (!pkgRow) throw notFound("Dieses Arbeitspaket wurde nicht gefunden.");

  const now = options.now || new Date();
  const previousStatus = pkgRow.status;
  const detailsJson = options.details ? JSON.stringify(options.details).slice(0, 4000) : null;

  authDb.insertHealthReferenceResult(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    workPackageKey: packageKey,
    kind: "QA_FINDING",
    summary,
    detailsJson,
    createdAt: nowIso(now),
  });

  // V7.6.4 (Auftrag Abschnitt 2/3): bevorzugte Regel – Pakete 1–6 werden
  // nach bestandenem QA fachlich `COMPLETED` (nicht `REFERENCE_READY`, nicht
  // Gesamtabschluss); ausschließlich das letzte Paket (`JAMAL_FINAL_
  // ACCEPTANCE`) wartet stattdessen weiterhin auf die finale Abnahme
  // (`WAITING_FOR_FINAL_ACCEPTANCE`), die ausschließlich über
  // recordFinalAcceptance zu `REFERENCE_READY` führen kann.
  const definition = WORK_PACKAGE_DEFINITIONS_BY_KEY.get(packageKey);
  const isFinalPackage = Boolean(definition && definition.key === "JAMAL_FINAL_ACCEPTANCE");
  const nextPackageStatus = passed ? (isFinalPackage ? "WAITING_FOR_FINAL_ACCEPTANCE" : "COMPLETED") : "CHANGES_REQUESTED";
  authDb.updateHealthReferenceWorkPackage(db, {
    id: pkgRow.id,
    status: nextPackageStatus,
    promptDraftJson: pkgRow.promptDraftJson,
    updatedAt: nowIso(now),
  });
  syncRunStatusToActivePackage(db, runRow, now);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_QA_FINDING_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey, resultKind: "QA_FINDING" },
    });
    if (!passed) {
      authAudit.recordAuditEvent(db, {
        eventType: "HEALTH_REFERENCE_CHANGES_REQUESTED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey },
      });
    }
  } catch (_error) {
    /* Audit-Fehler dürfen den bereits gültigen QA-Befund nicht rückgängig machen. */
  }
  auditWorkPackageStatusChanged(db, {
    packageKey,
    previousStatus,
    nextStatus: nextPackageStatus,
    actorUserId: options.actorUserId,
    now,
  });

  return rowToWorkPackageView(authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey));
}

function requestChanges(db, options = {}) {
  const packageKey = options.packageKey;
  if (!WORK_PACKAGE_KEY_SET.has(packageKey)) throw badRequest("workPackageKey ist unbekannt.");
  const note = truncate(options.note, 1000);
  if (!note) throw badRequest("note ist erforderlich (was soll geändert werden).");
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  assertRunIsMutable(runRow);
  const pkgRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey);
  if (!pkgRow) throw notFound("Dieses Arbeitspaket wurde nicht gefunden.");

  const now = options.now || new Date();
  const previousStatus = pkgRow.status;
  authDb.insertHealthReferenceResult(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    workPackageKey: packageKey,
    kind: "CHANGE_REQUEST_NOTE",
    summary: note,
    detailsJson: null,
    createdAt: nowIso(now),
  });

  authDb.updateHealthReferenceWorkPackage(db, {
    id: pkgRow.id,
    status: "CHANGES_REQUESTED",
    promptDraftJson: pkgRow.promptDraftJson,
    updatedAt: nowIso(now),
  });
  syncRunStatusToActivePackage(db, runRow, now);

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_CHANGES_REQUESTED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID, workPackageKey: packageKey },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Änderungsanforderung nicht rückgängig machen. */
  }
  auditWorkPackageStatusChanged(db, {
    packageKey,
    previousStatus,
    nextStatus: "CHANGES_REQUESTED",
    actorUserId: options.actorUserId,
    now,
  });

  return rowToWorkPackageView(authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, packageKey));
}

// ---------------------------------------------------------------------------
// Finale Referenzabnahme (Auftrag Abschnitt 7/9/10) – DER EINZIGE Codepfad,
// der `REFERENCE_READY` erreichen kann, und ausschließlich bei
// `confirmed === true` (Jamals ausdrückliche Bestätigung). Kein grüner
// Test, kein QA-Befund und keine Statuskombination reicht allein aus.
// ---------------------------------------------------------------------------
function recordFinalAcceptance(db, options = {}) {
  if (options.confirmed !== true) {
    throw badRequest("Die finale Referenzabnahme erfordert confirmed === true (Jamals ausdrückliche Bestätigung).");
  }
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  if (!runRow) throw notFound("Der Health-Referenzlauf wurde noch nicht angelegt.");
  if (runRow.status === "REFERENCE_READY") {
    throw conflict("Der Referenzlauf ist bereits abgenommen.");
  }
  if (runRow.status === "CANCELLED") {
    throw conflict("Ein abgebrochener Referenzlauf kann nicht mehr abgenommen werden.");
  }

  const now = options.now || new Date();
  const note = truncate(options.note, 1000) || "Jamal hat den Referenz-Walkthrough ausdrücklich freigegeben.";

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die Vorbereitung nicht rückgängig machen. */
  }

  authDb.insertHealthReferenceResult(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    workPackageKey: "JAMAL_FINAL_ACCEPTANCE",
    kind: "FINAL_ACCEPTANCE_NOTE",
    summary: note,
    detailsJson: null,
    createdAt: nowIso(now),
  });

  authDb.upsertHealthReferenceApproval(db, {
    id: crypto.randomUUID(),
    runId: CANONICAL_RUN_ID,
    approvalKey: "FINAL_REFERENCE_ACCEPTANCE",
    decision: "APPROVED",
    note,
    decidedAt: nowIso(now),
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  });

  const finalPackageRow = authDb.getHealthReferenceWorkPackage(db, CANONICAL_RUN_ID, "JAMAL_FINAL_ACCEPTANCE");
  if (finalPackageRow) {
    authDb.updateHealthReferenceWorkPackage(db, {
      id: finalPackageRow.id,
      status: "REFERENCE_READY",
      promptDraftJson: finalPackageRow.promptDraftJson,
      updatedAt: nowIso(now),
    });
  }

  authDb.updateHealthReferenceRunStatus(db, { id: CANONICAL_RUN_ID, status: "REFERENCE_READY", updatedAt: nowIso(now) });

  try {
    authAudit.recordAuditEvent(db, {
      eventType: "HEALTH_REFERENCE_REFERENCE_READY_GRANTED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { healthReferenceRunId: CANONICAL_RUN_ID },
    });
  } catch (_error) {
    /* Audit-Fehler dürfen die bereits gültige Abnahme nicht rückgängig machen. */
  }

  return buildRunView(db, authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID));
}

// Blockieren/Abbrechen des Gesamtlaufs – niemals REFERENCE_READY.
function setRunBlockedOrCancelled(db, options = {}) {
  const status = options.status;
  if (status !== "BLOCKED" && status !== "CANCELLED") {
    throw badRequest("status muss BLOCKED oder CANCELLED sein.");
  }
  const runRow = authDb.getHealthReferenceRunById(db, CANONICAL_RUN_ID);
  if (!runRow) throw notFound("Der Health-Referenzlauf wurde noch nicht angelegt.");
  if (runRow.status === "REFERENCE_READY") {
    throw conflict("Ein bereits abgenommener Referenzlauf kann nicht mehr blockiert oder abgebrochen werden.");
  }
  const now = options.now || new Date();
  const updated = authDb.updateHealthReferenceRunStatus(db, { id: CANONICAL_RUN_ID, status, updatedAt: nowIso(now) });
  return buildRunView(db, updated);
}

module.exports = {
  CANONICAL_RUN_ID,
  HEALTH_PROJECT_ID,
  HEALTH_PROJECT_PATH,
  RUN_TITLE,
  OUTCOME_TEXT,
  RUN_STATUS_VALUES,
  WORK_PACKAGE_KEY_VALUES,
  APPROVAL_KEY_VALUES,
  APPROVAL_DECISION_VALUES,
  RESULT_KIND_VALUES,
  MAIN_AGENT,
  SPECIALIST_AGENTS,
  QA_AGENT,
  NON_GOALS,
  WORK_PACKAGE_DEFINITIONS,
  APPROVAL_DEFINITIONS,
  ACCEPTANCE_CRITERIA,
  RUN_STATUS_LABELS_DE,
  NEXT_ACTION_BY_STATUS,
  AUTONOMY_BOUNDARIES_NOTICE,
  ALLOWED_GENERIC_PACKAGE_TARGET_STATUSES,
  HealthReferenceWorkRunError,
  resolveCanonicalAgent,
  getOrCreateCanonicalRun,
  getRunView,
  buildHandoverContract,
  prepareWorkPackagePromptDraft,
  recordApproval,
  transitionWorkPackage,
  submitResultReport,
  submitQaFinding,
  requestChanges,
  recordFinalAcceptance,
  setRunBlockedOrCancelled,
};
