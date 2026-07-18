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

  console.log(`daily-work-run-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests();
