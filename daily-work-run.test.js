"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const DailyWorkRun = require("./daily-work-run");
const { API_SECURITY_FLAGS, PROJECT_REGISTRY, buildProjectsResponse, getProjectById } = require("./project-registry");
const { requestHandler } = require("./server");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function invoke(method, url) {
  let statusCode = null;
  let rawBody = "";
  requestHandler(
    { method, url, headers: { host: "127.0.0.1" } },
    {
      writeHead(code) {
        statusCode = code;
      },
      end(body = "") {
        rawBody += body;
      },
    },
  );
  return { statusCode, body: rawBody ? JSON.parse(rawBody) : null };
}

function mockStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(data.entries());
    },
  };
}

function validDraft() {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id: "run-test-1", workDate: "2026-07-11", now: "2026-07-11T08:00:00Z" });
  run = DailyWorkRun.setFocusProject(
    run,
    health,
    "Bestätigte technische Momentaufnahme; keine automatische Live-Aktualisierung.",
    "2026-07-11T08:00:00Z",
  );
  run = DailyWorkRun.createWorkProposal(run, {
    desiredOutcome: "Einen technisch begrenzten Codex-Prüfauftrag für die Health-Dokumentation vorbereiten.",
    prohibitedToday: "Keine fachliche Health-Freigabe",
  });
  return run;
}

function runTests() {
  const draft = DailyWorkRun.createDraftRun({ id: "schema", workDate: "2026-07-11" });
  check("gültiges Grundschema", () => assert.strictEqual(draft.schemaVersion, 1));
  check("genau ein Fokusprojekt", () => assert.throws(() => DailyWorkRun.setFocusProject(draft, { id: ["a", "b"] }), /Textwert/));
  check("genau ein Tagesergebnis", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: ["a", "b"] }), /Textwert/));
  check("genau ein Abnahmekriterium", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: "a", reason: "b", acceptanceCriterion: [] }), /Textwert/));
  check("genau eine Jamal-Entscheidungsfrage", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: "a", reason: "b", acceptanceCriterion: "c", jamalDecisionQuestion: ["x"] }), /Textwert/));

  const health = getProjectById("health-upgrade-kompass");
  const focused = DailyWorkRun.setFocusProject(draft, health, "Testmomentaufnahme", "2026-07-11T08:00:00Z");
  check("im normalen Start ist nur der Ergebniswunsch erforderlich", () => {
    const proposed = DailyWorkRun.createWorkProposal(focused, { desiredOutcome: "Bereite eine Strategieentscheidung vor" });
    assert.strictEqual(proposed.dailyOutcome.desiredOutcome, "Bereite eine Strategieentscheidung vor");
    assert.ok(proposed.dailyOutcome.acceptanceCriterion);
    assert.ok(proposed.decision.jamalDecisionQuestion);
  });
  check("fehlender Ergebniswunsch wird abgelehnt", () => assert.throws(() => DailyWorkRun.createWorkProposal(focused, {}), /desiredOutcome/));
  check("optionale Verbotsgrenze ist nicht erforderlich", () => assert.doesNotThrow(() => DailyWorkRun.createWorkProposal(focused, { desiredOutcome: "Bereite eine Entscheidung vor" })));
  check("alle acht Aufgabentypen werden erkannt", () => {
    const cases = [
      ["Welche Agenten werden benötigt und wer prüft?", "Agenten- und Einsatzplanung"],
      ["Entwickle mit Codex eine API", "Entwicklung/Codex"],
      ["Erstelle ein UX Design", "Design"],
      ["Formuliere einen Content Text", "Content"],
      ["Recherchiere belastbare Quellen", "Recherche"],
      ["Bereite eine Strategieentscheidung vor", "Strategie/Entscheidung"],
      ["Prüfe Qualität und Tests", "Qualität/Prüfung"],
      ["Wähle ein passendes Plugin oder Werkzeug", "Plugin-/Werkzeugauswahl"],
    ];
    assert.deepStrictEqual(cases.map(([text]) => DailyWorkRun.detectTaskType(text)), cases.map(([, type]) => type));
  });
  const agentPlanning = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Erstelle einen Einsatzplan, welche Agenten für Health benötigt werden und wer was prüft.",
  });
  check("Agentenplanung wird nicht zum Codex- oder Repository-Auftrag", () => {
    assert.strictEqual(agentPlanning.workProposal.taskType, "Agenten- und Einsatzplanung");
    assert.strictEqual(agentPlanning.workProposal.repositoryWorkRequired, false);
    assert.match(agentPlanning.codexPreparation.preparedPrompt, /kein Codex- oder Repository-Auftrag/i);
    assert.doesNotMatch(agentPlanning.codexPreparation.preparedPrompt, /Arbeite ausschließlich im Projekt/);
  });
  check("Agentenplanung enthält Rollen, Teilaufgaben und Übergaben", () => {
    assert.ok(agentPlanning.workProposal.agentPlan.length >= 3);
    assert.ok(agentPlanning.workProposal.agentPlan.every((item) => item.agent && item.role && item.subtask && item.handoffTo));
    assert.ok(agentPlanning.workProposal.agentPlan.some((item) => item.agent === "Health-Kompass-Agent"));
  });

  const preparedDraft = validDraft();
  check("vollständige Pflichtfelder", () => assert.deepStrictEqual(DailyWorkRun.validateReadyForCodex(preparedDraft), []));
  check("nur zulässige Statuswerte", () => assert.deepStrictEqual(DailyWorkRun.STATUS_VALUES, ["DRAFT", "READY_FOR_CODEX", "RESULT_RECORDED", "CLOSED", "OPEN"]));
  check("kein automatischer Statusübergang", () => assert.strictEqual(preparedDraft.status, "DRAFT"));
  check("externe Aktionen blockiert", () => assert.strictEqual(preparedDraft.boundary.externalActionsBlocked, true));
  check("Codex-Ausführung blockiert", () => assert.strictEqual(preparedDraft.boundary.codexExecutionBlocked, true));
  check("Agentenausführung blockiert", () => assert.strictEqual(preparedDraft.boundary.agentExecutionBlocked, true));
  check("automatische Git-Aktion blockiert", () => assert.strictEqual(preparedDraft.boundary.automaticGitBlocked, true));
  check("Deployment blockiert", () => assert.strictEqual(preparedDraft.boundary.deploymentBlocked, true));

  const legacyState = {
    projects: [{ id: "manual-1", notes: ["Notiz"], history: [{ id: "h1" }], decisionNote: { decision: "Offen" } }],
  };
  const legacyJson = JSON.stringify(legacyState);
  const storage = mockStorage({ [DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY]: legacyJson });
  const stored = DailyWorkRun.saveDailyStore(storage, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), preparedDraft));
  check("getrennte localStorage-Struktur", () => assert.notStrictEqual(DailyWorkRun.DAILY_STORAGE_KEY, DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY));
  check("bestehende manuelle Projekte bleiben erhalten", () => assert.strictEqual(storage.snapshot()[DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY], legacyJson));
  check("Notizen, Entscheidungen und Verläufe bleiben erhalten", () => assert.deepStrictEqual(JSON.parse(storage.snapshot()[DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY]), legacyState));
  check("Kanondaten können nicht überschrieben werden", () => assert.strictEqual(getProjectById("health-upgrade-kompass").localHead, "bc98b5c"));
  check("API-Ausfall nutzt keinen localStorage-Technikstand", () => assert.deepStrictEqual(DailyWorkRun.currentCanonicalProject(null, "health-upgrade-kompass"), { available: false, status: "UNGEKLÄRT", project: null }));

  const apiPayload = buildProjectsResponse();
  const currentHealth = DailyWorkRun.currentCanonicalProject(apiPayload, "health-upgrade-kompass");
  check("Health über stabile kanonische ID", () => assert.strictEqual(currentHealth.project.id, "health-upgrade-kompass"));
  check("Health bleibt REAL_VERIFIZIERT", () => assert.strictEqual(currentHealth.project.portfolioMode, "REAL_VERIFIZIERT"));
  check("Health-HEAD bleibt bc98b5c", () => assert.strictEqual(currentHealth.project.localHead, "bc98b5c"));
  check("Health und Expansion bleiben getrennt", () => assert.notStrictEqual(currentHealth.project.id, getProjectById("expansion-app").id));
  check("Codex-Auftrag ist nur Textvorlage", () => {
    assert.strictEqual(typeof preparedDraft.codexPreparation.preparedPrompt, "string");
    assert.match(preparedDraft.codexPreparation.preparedPrompt, /ausschließlich eine manuell kopierbare Auftragsvorlage/);
  });

  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  check("technische Details sind standardmäßig geschlossen", () => {
    assert.match(appSource, /<details class="daily-work-run-technical-details daily-work-run-field--wide">/);
    assert.doesNotMatch(appSource, /<details class="daily-work-run-technical-details[^>]*\sopen/);
  });
  check("normaler Start zeigt genau ein erforderliches Ergebnisfeld", () => {
    const preparationSource = appSource.slice(appSource.indexOf("function renderDailyWorkRunPreparation"), appSource.indexOf("function renderDailyWorkProposal"));
    assert.strictEqual((preparationSource.match(/<textarea[^>]*required/g) || []).length, 1);
    assert.match(preparationSource, /Arbeitsvorschlag erstellen/);
  });
  check("Ergebnis- und Verbotsfeld sind im neuen Tageslauf editierbar", () => {
    const preparationSource = appSource.slice(appSource.indexOf("function renderDailyWorkRunPreparation"), appSource.indexOf("function renderDailyWorkProposal"));
    const renderPreparation = new Function(
      "escapeHtml",
      "dailyWorkRunList",
      "renderDailyWorkProposal",
      `${preparationSource}; return renderDailyWorkRunPreparation;`,
    )(
      (value) => String(value ?? ""),
      () => "",
      () => "",
    );
    const html = renderPreparation(focused);
    const desiredOutcomeField = html.match(/<textarea name="desiredOutcome"[^>]*>/)?.[0] || "";
    const prohibitedTodayField = html.match(/<textarea name="prohibitedToday"[^>]*>/)?.[0] || "";
    assert.ok(desiredOutcomeField);
    assert.ok(prohibitedTodayField);
    assert.doesNotMatch(desiredOutcomeField, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(desiredOutcomeField, /\sreadonly(?:\s|>)/);
    assert.doesNotMatch(prohibitedTodayField, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(prohibitedTodayField, /\sreadonly(?:\s|>)/);
  });
  check("eingegebener Health-Ergebnistext wird unverändert übernommen", () => {
    const desiredOutcome = "Ich möchte wissen, welche Agenten jetzt beim Health Upgrade Kompass eingesetzt werden müssen und was jeder davon prüfen soll.";
    const proposed = DailyWorkRun.createWorkProposal(focused, { desiredOutcome });
    assert.strictEqual(proposed.dailyOutcome.desiredOutcome, desiredOutcome);
    assert.strictEqual(proposed.workProposal.understoodGoal, desiredOutcome);
    assert.strictEqual(proposed.workProposal.taskType, "Agenten- und Einsatzplanung");
    assert.strictEqual(proposed.workProposal.repositoryWorkRequired, false);
    assert.strictEqual(proposed.boundary.codexExecutionBlocked, true);
  });
  check("gesperrter gespeicherter Lauf bietet einen verlustfreien Neustart", () => {
    assert.match(appSource, /\["READY_FOR_CODEX", "RESULT_RECORDED"\]\.includes\(run\.status\)/);
    assert.match(appSource, /Der vorhandene Lauf bleibt vollständig erhalten/);
    const readyRun = DailyWorkRun.transitionRun(preparedDraft, "READY_FOR_CODEX");
    let restartStore = DailyWorkRun.upsertRun(DailyWorkRun.createStore(), readyRun);
    restartStore = DailyWorkRun.upsertRun(restartStore, DailyWorkRun.createDraftRun({ id: "run-neustart", workDate: "2026-07-12" }));
    assert.strictEqual(restartStore.runs.length, 2);
    assert.strictEqual(DailyWorkRun.getActiveRun(restartStore).status, "DRAFT");
    assert.ok(restartStore.runs.some((run) => run.id === readyRun.id && run.status === "READY_FOR_CODEX"));
  });

  let ready = DailyWorkRun.transitionRun(preparedDraft, "READY_FOR_CODEX");
  ready = DailyWorkRun.setResultReturn(ready, {
    summary: "Prüfauftrag wurde manuell bearbeitet.",
    changedFiles: ["README.md"],
    tests: ["npm test: erfolgreich"],
    gitBranch: "main",
    commitStatus: "kein Commit",
    pushStatus: "kein Push",
    risks: ["Fachliche Prüfung offen"],
    openPoints: ["Jamal entscheidet über nächsten Schritt"],
  });
  const resultRecorded = DailyWorkRun.transitionRun(ready, "RESULT_RECORDED");
  check("Abschluss benötigt Jamals Entscheidung", () => assert.throws(() => DailyWorkRun.setClosure(resultRecorded, { status: "CLOSED", nextSafeStep: "Prüfen" }), /jamalDecision/));
  check("Abschluss benötigt genau einen nächsten Schritt", () => assert.throws(() => DailyWorkRun.setClosure(resultRecorded, { status: "CLOSED", jamalDecision: "Abnehmen", nextSafeStep: ["a", "b"] }), /Textwert/));
  check("Verlauf erst nach manueller Bestätigung", () => assert.strictEqual(DailyWorkRun.createHistoryEntry(resultRecorded, false), null));

  const closureDraft = DailyWorkRun.setClosure(resultRecorded, {
    status: "CLOSED",
    jamalDecision: "Technischen Tageslauf abschließen.",
    nextSafeStep: "Ergebnis morgen manuell prüfen.",
    closedAt: "2026-07-11T18:00:00Z",
  });
  const closed = DailyWorkRun.transitionRun(closureDraft, "CLOSED");
  const historyEntry = DailyWorkRun.createHistoryEntry(closed, true);
  const once = DailyWorkRun.applyHistoryEntryOnce([], historyEntry);
  const twice = DailyWorkRun.applyHistoryEntryOnce(once, historyEntry);
  check("doppelter Verlaufseintrag wird verhindert", () => {
    assert.strictEqual(twice.length, 1);
    assert.doesNotMatch(twice[0].description, /\.\./);
  });
  check("bestehende Registertests bleiben eingebunden", () => assert.ok(fs.readFileSync(path.join(__dirname, "package.json"), "utf8").includes("project-registry.test.js")));

  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const routeCount = (serverSource.match(/requestUrl\.pathname === "\/api\//g) || []).length;
  check("41 GET-Routen bleiben erhalten", () => assert.strictEqual(routeCount, 41));
  check("unbekannte Projekt-ID bleibt 404", () => assert.strictEqual(invoke("GET", "/api/projects/unbekannt").statusCode, 404));
  check("POST bleibt 405", () => assert.strictEqual(invoke("POST", "/api/projects").statusCode, 405));
  check("writeOperationsBlocked bleibt true", () => assert.strictEqual(API_SECURITY_FLAGS.writeOperationsBlocked, true));
  check("madeExternalRequest bleibt false", () => assert.strictEqual(API_SECURITY_FLAGS.madeExternalRequest, false));

  assert.strictEqual(passed, 44);
  assert.strictEqual(DailyWorkRun.getActiveRun(stored).id, preparedDraft.id);
  assert.strictEqual(PROJECT_REGISTRY.length, 17);
  console.log("daily-work-run.test.js: 44 Prüfpunkte erfolgreich");
}

runTests();
