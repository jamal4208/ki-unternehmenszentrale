"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const DailyWorkRun = require("./daily-work-run");
const LocalDataBackup = require("./local-data-backup");
const DailyWorkRunUi = require("./daily-work-run-ui");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
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

function createDeps(overrides = {}) {
  const appState = {
    projects: [],
    tickets: [],
    knowledge: [],
    selectedDraftId: null,
    selectedDetailId: null,
    dailyFocusProjectId: null,
    dailyFocusReasons: {},
    dailyFocusQuestions: {},
    dailyFocusDecisionTemplates: {},
    dailyFocusDecisionStatuses: {},
  };
  const registry = {
    status: "ready",
    payload: {
      writeOperationsBlocked: true,
      madeExternalRequest: false,
      projects: [],
      snapshotNotice: "Testmomentaufnahme",
    },
    error: null,
  };
  let renderAllCount = 0;
  const base = {
    byId: (id) => (id === "daily-work-run-output" ? { innerHTML: "" } : null),
    escapeHtml: (value) => String(value ?? ""),
    comparableText: (value) => String(value ?? "").trim().toLowerCase(),
    showToast: () => {},
    getCanonicalProjectRegistryState: () => registry,
    getAppState: () => appState,
    loadState: () => ({ ...appState }),
    saveState: () => {},
    getProjectHistory: (project) => project.history || [],
    renderAll: () => {
      renderAllCount += 1;
    },
    localStorage: mockStorage(),
    get renderAllCount() {
      return renderAllCount;
    },
  };
  return { ...base, ...overrides, registry, appState };
}

function runTests() {
  check("Modul kann geladen werden", () => {
    assert.strictEqual(typeof DailyWorkRunUi.init, "function");
    assert.strictEqual(typeof DailyWorkRunUi.render, "function");
  });

  check("Pflichtabhängigkeiten werden geprüft", () => {
    const isolated = require("child_process").execFileSync(
      process.execPath,
      ["-e", `const ui = require(${JSON.stringify(path.join(__dirname, "daily-work-run-ui.js"))}); try { ui.init({}); process.exit(2); } catch (e) { if (!/fehlende Abhängigkeiten/.test(e.message)) throw e; }`],
      { encoding: "utf8" },
    );
    assert.strictEqual(isolated, "");
  });

  const uiSource = fs.readFileSync(path.join(__dirname, "daily-work-run-ui.js"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

  check("Initialisierung erfolgt höchstens einmal", () => {
    assert.match(uiSource, /if \(initialized\) return;/);
    assert.match(uiSource, /initialized = true/);
  });

  check("Tageslauf-Container wird korrekt erkannt", () => {
    const container = { innerHTML: "" };
    const deps = createDeps({ byId: (id) => (id === "daily-work-run-output" ? container : null) });
    DailyWorkRunUi.init(deps);
    DailyWorkRunUi.render();
    assert.ok(container.innerHTML.length > 0);
    assert.match(container.innerHTML, /Tageslauf manuell beginnen|Noch kein Tageslauf begonnen/);
  });

  check("fehlender Container führt nicht zu unkontrolliertem Fehler", () => {
    assert.doesNotThrow(() => DailyWorkRunUi.render());
  });

  check("Rendering nutzt das bestehende DailyWorkRun-Modul", () => {
    assert.match(uiSource, /require\("\.\/daily-work-run"\)/);
    assert.match(uiSource, /DailyWorkRun\.loadDailyStore/);
    assert.match(uiSource, /api\.createDraftRun\(/);
    assert.doesNotMatch(uiSource, /function createDraftRun\(/);
  });

  check("Backup-Anbindung nutzt LocalDataBackup und keine Kopie", () => {
    assert.match(uiSource, /require\("\.\/local-data-backup"\)/);
    assert.match(uiSource, /LocalDataBackup/);
    assert.match(uiSource, /exportLocalDataJson/);
    assert.doesNotMatch(uiSource, /function exportLocalData\(/);
  });

  check("Event-Bindings werden nicht doppelt registriert", () => {
    assert.match(uiSource, /let eventsBound = false/);
    assert.match(uiSource, /if \(!eventsBound && typeof document !== "undefined"\)/);
    assert.match(uiSource, /eventsBound = true/);
  });

  check("unbekannte Agenten-IDs erzeugen keine neue Registerquelle", () => {
    assert.doesNotMatch(uiSource, /PRODUCTIVE_AGENT_REGISTRY\s*=/);
    assert.doesNotMatch(uiSource, /CANONICAL_AGENT/);
    assert.doesNotMatch(uiSource, /agent-registry\.js/);
  });

  check("bestehende Speicherkeys bleiben unverändert", () => {
    assert.strictEqual(DailyWorkRunUi.DAILY_STORAGE_KEY, DailyWorkRun.DAILY_STORAGE_KEY);
    assert.strictEqual(DailyWorkRunUi.LEGACY_MANAGEMENT_STORAGE_KEY, DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY);
    assert.strictEqual(DailyWorkRunUi.DAILY_STORAGE_KEY, "ki-unternehmenszentrale-daily-work-runs-v1");
    assert.strictEqual(DailyWorkRunUi.LEGACY_MANAGEMENT_STORAGE_KEY, "ki-unternehmenszentrale-v1");
  });

  check("app.js enthält keine zweite aktive Tageslauf-Implementierung", () => {
    assert.doesNotMatch(appSource, /function renderDailyWorkRun\(/);
    assert.doesNotMatch(appSource, /function setupDailyWorkRun\(/);
    assert.doesNotMatch(appSource, /function setupLocalDataBackup\(/);
    assert.doesNotMatch(appSource, /function renderLocalDataBackupSection\(/);
    assert.match(appSource, /DailyWorkRunUi\.init\(/);
    assert.match(appSource, /DailyWorkRunUi\.render\(/);
  });

  check("script-Reihenfolge ist korrekt", () => {
    assert.match(
      htmlSource,
      /<script src="daily-work-run\.js"><\/script>\s*<script src="agent-runtime\.js"><\/script>\s*<script src="local-data-backup\.js"><\/script>\s*<script src="daily-work-run-ui\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    );
  });

  check("technische Details bleiben im UI-Modul geschlossen", () => {
    assert.match(uiSource, /<details class="daily-work-run-technical-details daily-work-run-field--wide">/);
    assert.doesNotMatch(uiSource, /<details class="daily-work-run-technical-details[^>]*\sopen/);
  });

  check("normaler Start zeigt genau ein erforderliches Ergebnisfeld", () => {
    const preparationSource = uiSource.slice(
      uiSource.indexOf("function renderDailyWorkRunPreparation"),
      uiSource.indexOf("function renderDailyWorkProposal"),
    );
    assert.strictEqual((preparationSource.match(/<textarea[^>]*required/g) || []).length, 1);
    assert.match(preparationSource, /Arbeitsvorschlag erstellen/);
  });

  check("gesperrter gespeicherter Lauf bietet einen verlustfreien Neustart", () => {
    assert.match(uiSource, /\["READY_FOR_CODEX", "RESULT_RECORDED"\]\.includes\(run\.status\)/);
    assert.match(uiSource, /Der vorhandene Lauf bleibt vollständig erhalten/);
  });

  check("Runtime-Pilot zeigt Rollenname und technische ID getrennt", () => {
    assert.match(uiSource, /Technische Agenten-ID:/);
    assert.match(uiSource, /PROJEKTMANAGER_ROLE_NAME/);
    assert.match(uiSource, /daily-work-runtime-agent-meta/);
  });

  check("Import bleibt an LocalDataBackup gebunden", () => {
    const storage = mockStorage();
    const exportJson = LocalDataBackup.exportLocalDataJson(storage);
    const parsed = LocalDataBackup.parseExportJson(exportJson);
    assert.strictEqual(parsed.ok, true);
    const validation = LocalDataBackup.validateImportPayload(parsed.export, storage);
    assert.strictEqual(validation.ok, true);
  });

  check("V6.45.0 ist in der Oberfläche sichtbar", () => {
    assert.match(htmlSource, /V6\.45\.0 · V1-Finish-Sprint/);
  });

  check("primäre Prüfphasen-Aktion steht direkt im Arbeitsvorschlag", () => {
    const proposalSource = uiSource.slice(uiSource.indexOf("function renderDailyWorkProposal"), uiSource.indexOf("function agentRuntimeApi"));
    assert.match(proposalSource, /Oben arbeiten\. Unten nachschauen\./);
    assert.match(proposalSource, /data-prepare-agent-review>Prüfphase vorbereiten/);
    assert.match(proposalSource, /Noch kein Agent gestartet\. Keine externe Aktion\. Es werden nur interne Prüfkarten vorbereitet\./);
    assert.match(proposalSource, /daily-work-run-primary-next-action/);
    assert.match(proposalSource, /Hauptverantwortlicher/);
    assert.match(proposalSource, /Kernagenten/);
    assert.match(proposalSource, /Sicherheitsgrenze/);
  });

  check("Rollen und Werkzeugstatus sind im Arbeitsvorschlag eindeutig", () => {
    assert.match(uiSource, /Abnahmeverantwortlicher Agent/);
    assert.match(uiSource, /toolReview\.statusLabel/);
    assert.match(uiSource, /nicht benötigt/);
    assert.match(uiSource, /keine Agentenzuweisung/);
    assert.match(uiSource, /Projektmanager-Zusammenführung/);
  });

  check("Blocker-Feld weist auf leere Angabe ohne Blocker hin", () => {
    assert.match(uiSource, /Leer lassen, wenn keine Blocker vorliegen\./);
    assert.match(uiSource, /daily-work-run-field-hint/);
  });

  check("Prüfphase zeigt Fortschritt und korrigiert QA-/Zusammenführungsführung", () => {
    const reviewSource = uiSource.slice(uiSource.indexOf("function renderDailyWorkAgentReviewPhase"), uiSource.indexOf("function renderDailyWorkRunPrompt"));
    assert.match(reviewSource, /Prüfschritten abgeschlossen/);
    assert.match(reviewSource, /Projektmanager-Zusammenführung ausfüllen/);
    assert.match(reviewSource, /#daily-work-review-orchestration/);
    assert.match(reviewSource, /QA abgeschlossen/);
    assert.match(reviewSource, /qaConfirmed/);
    assert.match(reviewSource, /orchestrationConfirmed/);
    assert.match(reviewSource, /Laufzeit-Pilot-Evidenz/);
    assert.match(reviewSource, /ersetzt nicht die manuelle Projektmanager-Zusammenführung/);
  });

  check("unten kein zweiter gleichwertiger Hauptbutton für die Prüfphase", () => {
    const reviewSource = uiSource.slice(uiSource.indexOf("function renderDailyWorkAgentReviewPhase"), uiSource.indexOf("function renderDailyWorkRunPrompt"));
    assert.match(reviewSource, /primaryPrepareShownAbove/);
    assert.match(reviewSource, /secondary-button" type="button" data-prepare-agent-review/);
  });

  check("READY_FOR_CODEX rendert obere Prüfphasen-Hauptaktion verhaltensnah", () => {
    const output = require("child_process").execFileSync(
      process.execPath,
      [
        "-e",
        `
          const assert = require("assert");
          const DailyWorkRun = require(${JSON.stringify(path.join(__dirname, "daily-work-run.js"))});
          const DailyWorkRunUi = require(${JSON.stringify(path.join(__dirname, "daily-work-run-ui.js"))});
          const { getProjectById } = require(${JSON.stringify(path.join(__dirname, "project-registry.js"))});
          const container = { innerHTML: "" };
          const data = new Map();
          const localStorage = {
            getItem(key) { return data.has(key) ? data.get(key) : null; },
            setItem(key, value) { data.set(key, String(value)); },
          };
          const deps = {
            byId: (id) => (id === "daily-work-run-output" ? container : null),
            escapeHtml: (value) => String(value ?? ""),
            comparableText: (value) => String(value ?? "").trim().toLowerCase(),
            showToast: () => {},
            getCanonicalProjectRegistryState: () => ({
              status: "ready",
              payload: { writeOperationsBlocked: true, madeExternalRequest: false, projects: [getProjectById("health-upgrade-kompass")], snapshotNotice: "Test" },
              error: null,
            }),
            getAppState: () => ({ projects: [] }),
            loadState: () => ({ projects: [] }),
            saveState: () => {},
            getProjectHistory: () => [],
            renderAll: () => {},
            localStorage,
          };
          DailyWorkRunUi.init(deps);
          DailyWorkRunUi.render();
          assert.doesNotMatch(container.innerHTML, /data-prepare-agent-review>Prüfphase vorbereiten/);

          let run = DailyWorkRun.createDraftRun({ id: "ui-ready-run", workDate: "2026-07-23" });
          run = DailyWorkRun.setFocusProject(run, getProjectById("health-upgrade-kompass"), "Snap", "2026-07-11T08:00:00Z");
          run = DailyWorkRun.createWorkProposal(run, {
            desiredOutcome: "Ich möchte wissen, welche Agenten jetzt beim Health Upgrade Kompass eingesetzt werden müssen und was jeder davon prüfen soll.",
          });
          run = DailyWorkRun.transitionRun(run, "READY_FOR_CODEX");
          DailyWorkRunUi.getInternalState().dailyWorkRunUiState.store = DailyWorkRun.upsertRun(DailyWorkRun.createStore(), run);
          DailyWorkRunUi.render();
          assert.match(container.innerHTML, /daily-work-run-primary-next-action/);
          assert.match(container.innerHTML, /Prüfphase vorbereiten/);
          assert.match(container.innerHTML, /Noch kein Agent gestartet\\. Keine externe Aktion\\. Es werden nur interne Prüfkarten vorbereitet\\./);
          assert.match(container.innerHTML, /Kernagenten/);
          assert.doesNotMatch(container.innerHTML, /10 Kernagenten/);
          const primaryPrepare = (container.innerHTML.match(/class="primary-button"[^>]*data-prepare-agent-review/g) || []).length;
          assert.strictEqual(primaryPrepare, 1);

          run = DailyWorkRun.prepareAgentReviewPhase(run, { approved: true, now: "2026-07-23T10:00:00Z" });
          DailyWorkRunUi.getInternalState().dailyWorkRunUiState.store = DailyWorkRun.upsertRun(DailyWorkRun.createStore(), run);
          DailyWorkRunUi.render();
          assert.match(container.innerHTML, /Manuelle Prüfkarten bearbeiten und Befunde zurückführen/);
          assert.doesNotMatch(container.innerHTML, /daily-work-run-primary-next-action[\\s\\S]*data-prepare-agent-review>Prüfphase vorbereiten/);
        `,
      ],
      { encoding: "utf8" },
    );
    assert.strictEqual(output, "");
  });

  check("Action-ID Prüfphase ist an prepareAgentReviewPhase gebunden", () => {
    assert.match(uiSource, /data-prepare-agent-review/);
    assert.match(uiSource, /prepareAgentReviewPhase\(/);
    assert.match(uiSource, /closest\("\[data-prepare-agent-review\]"\)/);
  });

  check("Kern- und Zusatzrollen werden in der UI getrennt dargestellt", () => {
    const proposalSource = uiSource.slice(uiSource.indexOf("function renderDailyWorkProposal"), uiSource.indexOf("function agentRuntimeApi"));
    assert.match(proposalSource, /normalizeRolePartitions/);
    assert.match(proposalSource, /getApprovalAgentDisplay/);
    assert.match(proposalSource, /Zusatzrollen/);
    assert.match(uiSource, /approvalAgentId/);
    assert.match(uiSource, /Abnahmeverantwortlicher Agent/);
    assert.doesNotMatch(proposalSource, /proposal\.approvalAgent \|\| "QS-\/Test-Agent"/);
  });

  check("V1-Betriebshinweis ist vorhanden", () => {
    assert.match(htmlSource, /v1-ops-status/);
    assert.match(htmlSource, /V1 lokal fertig und betriebsbereit/);
    assert.match(htmlSource, /Fokusprojekt wählen und Tagesergebnis formulieren/);
  });

  check("V1-Betriebshinweis behauptet keine Außenwirkung", () => {
    const statusBlock = htmlSource.slice(
      htmlSource.indexOf('class="v1-ops-status"'),
      htmlSource.indexOf("daily-work-run-output"),
    );
    assert.match(statusBlock, /Außenwirkung[\s\S]*blockiert/);
    assert.doesNotMatch(statusBlock, /extern(e|er)? KI|Plugin ausgeführt|veröffentlicht|Deployment freigegeben/i);
  });

  check("Plugin-Bereich zeigt bei nicht benötigter Prüfung kein UNGEKLÄRT", () => {
    const output = require("child_process").execFileSync(
      process.execPath,
      [
        "-e",
        `
          const assert = require("assert");
          const DailyWorkRun = require(${JSON.stringify(path.join(__dirname, "daily-work-run.js"))});
          const DailyWorkRunUi = require(${JSON.stringify(path.join(__dirname, "daily-work-run-ui.js"))});
          const { getProjectById } = require(${JSON.stringify(path.join(__dirname, "project-registry.js"))});

          function pluginSection(html) {
            const match = html.match(/Plugin- und Werkzeugprüfung<\\/h5>([\\s\\S]*?)<\\/div>\\s*<div><h5>Dateien und Datenbereiche/);
            return match ? match[1] : "";
          }

          function renderReadyProposal({ desiredOutcome, projectId, runId }, shared) {
            let run = DailyWorkRun.createDraftRun({ id: runId, workDate: "2026-07-23" });
            run = DailyWorkRun.setFocusProject(run, getProjectById(projectId), "Snap", "2026-07-11T08:00:00Z");
            run = DailyWorkRun.createWorkProposal(run, { desiredOutcome });
            run = DailyWorkRun.transitionRun(run, "READY_FOR_CODEX");
            shared.store = DailyWorkRun.upsertRun(DailyWorkRun.createStore(), run);
            DailyWorkRunUi.getInternalState().dailyWorkRunUiState.store = shared.store;
            DailyWorkRunUi.render();
            return { html: shared.container.innerHTML, proposal: run.workProposal };
          }

          const shared = {
            container: { innerHTML: "" },
            store: DailyWorkRun.createStore(),
          };
          const data = new Map();
          const localStorage = {
            getItem(key) { return data.has(key) ? data.get(key) : null; },
            setItem(key, value) { data.set(key, String(value)); },
          };
          DailyWorkRunUi.init({
            byId: (id) => (id === "daily-work-run-output" ? shared.container : null),
            escapeHtml: (value) => String(value ?? ""),
            comparableText: (value) => String(value ?? "").trim().toLowerCase(),
            showToast: () => {},
            getCanonicalProjectRegistryState: () => ({
              status: "ready",
              payload: {
                writeOperationsBlocked: true,
                madeExternalRequest: false,
                projects: [getProjectById("health-upgrade-kompass"), getProjectById("expansion-app")],
                snapshotNotice: "Test",
              },
              error: null,
            }),
            getAppState: () => ({ projects: [] }),
            loadState: () => ({ projects: [] }),
            saveState: () => {},
            getProjectHistory: () => [],
            renderAll: () => {},
            localStorage,
          });

          const healthFinish = renderReadyProposal({
            runId: "ui-plugin-health",
            projectId: "health-upgrade-kompass",
            desiredOutcome: "Den Health Upgrade Kompass als stabile und verständliche Demo vollständig prüfen und den nächsten sicheren Fertigstellungsschritt festlegen.",
          }, shared);
          const healthPlugin = pluginSection(healthFinish.html);
          assert.match(healthPlugin, /nicht benötigt/);
          assert.match(healthPlugin, /keine Agentenzuweisung/);
          assert.match(healthPlugin, /keine Plugins oder Werkzeuge benötigt/);
          assert.doesNotMatch(healthPlugin, /UNGEKLÄRT/);
          assert.doesNotMatch(healthPlugin, /<b>Auswahl:<\\/b>/);
          assert.strictEqual(healthFinish.proposal.toolReview.required, false);

          const privacyOnly = renderReadyProposal({
            runId: "ui-plugin-privacy",
            projectId: "health-upgrade-kompass",
            desiredOutcome: "Prüfe Datenschutz für den Tagesauftrag.",
          }, shared);
          const privacyPlugin = pluginSection(privacyOnly.html);
          assert.match(privacyPlugin, /nicht benötigt/);
          assert.match(privacyPlugin, /keine Agentenzuweisung/);
          assert.doesNotMatch(privacyPlugin, /UNGEKLÄRT/);
          assert.doesNotMatch(privacyPlugin, /<b>Auswahl:<\\/b>/);
          assert.strictEqual(privacyOnly.proposal.toolReview.required, false);

          const pluginOrder = renderReadyProposal({
            runId: "ui-plugin-explicit",
            projectId: "expansion-app",
            desiredOutcome: "Wähle ein passendes Plugin oder Werkzeug",
          }, shared);
          const explicitPlugin = pluginSection(pluginOrder.html);
          assert.match(explicitPlugin, /Plugin-\\/Tool-Radar-Agent zuständig/);
          assert.match(explicitPlugin, /Plugin-\\/Tool-Radar-Agent/);
          assert.match(explicitPlugin, /<b>Auswahl:<\\/b>/);
          assert.match(explicitPlugin, /Ergebnisqualität/);
          assert.match(explicitPlugin, /Keine Werkzeugausführung|Keine automatische Festlegung auf Canva/);
          assert.doesNotMatch(explicitPlugin, /UNGEKLÄRT/);
          assert.strictEqual(pluginOrder.proposal.toolReview.required, true);
          assert.strictEqual(pluginOrder.proposal.toolReview.responsibleAgentId, "integration-agent");
        `,
      ],
      { encoding: "utf8" },
    );
    assert.strictEqual(output, "");
  });

  check("README und Betriebshandbuch sind vorhanden", () => {
    assert.strictEqual(fs.existsSync(path.join(__dirname, "README.md")), true);
    assert.strictEqual(fs.existsSync(path.join(__dirname, "V1_BETRIEBSHANDBUCH.md")), true);
    const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
    const handbook = fs.readFileSync(path.join(__dirname, "V1_BETRIEBSHANDBUCH.md"), "utf8");
    assert.match(readme, /V1 lokal fertig und betriebsbereit/);
    assert.match(readme, /127\.0\.0\.1:4173/);
    assert.match(handbook, /Grenze zwischen V1 und späterer V2/);
    assert.match(handbook, /orchestrator-agent/);
  });

  console.log(`daily-work-run-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests();
