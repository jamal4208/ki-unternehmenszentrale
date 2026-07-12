"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const DailyWorkRun = require("./daily-work-run");
const LocalDataBackup = require("./local-data-backup");
const { getProjectById } = require("./project-registry");

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
    removeItem(key) {
      data.delete(key);
    },
    snapshot() {
      return Object.fromEntries(data.entries());
    },
  };
}

function sampleManagementState() {
  return {
    projects: [
      {
        id: "manual-health",
        title: "Health Notiz",
        notes: ["Historische Notiz"],
        history: [{ id: "hist-1", description: "Entscheidung offen" }],
      },
    ],
    tickets: [],
    knowledge: [],
  };
}

function sampleDailyStore() {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id: "run-v6402", workDate: "2026-07-11" });
  run = DailyWorkRun.setFocusProject(run, health, "Momentaufnahme", "2026-07-11T08:00:00Z");
  run = DailyWorkRun.createWorkProposal(run, {
    desiredOutcome: "Welche Agenten sind für Health nötig?",
  });
  return DailyWorkRun.upsertRun(DailyWorkRun.createStore(), run);
}

function buildFilledStorage() {
  return mockStorage({
    [LocalDataBackup.MANAGEMENT_STORAGE_KEY]: JSON.stringify(sampleManagementState()),
    [LocalDataBackup.DAILY_STORAGE_KEY]: JSON.stringify(sampleDailyStore()),
  });
}

function runTests() {
  check("Export beider vorhandener Speicherbereiche", () => {
    const storage = buildFilledStorage();
    const payload = LocalDataBackup.exportLocalData(storage, { now: "2026-07-12T10:00:00.000Z" });
    assert.strictEqual(payload.exportFormatVersion, 1);
    assert.strictEqual(payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].present, true);
    assert.strictEqual(payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].present, true);
    assert.ok(payload.summary.dailyRunCount >= 1);
    assert.ok(payload.summary.managementProjectCount >= 1);
  });

  check("Export bei leerem localStorage", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    ALLOWED_KEYS_ASSERT(payload);
    assert.strictEqual(payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].present, false);
    assert.strictEqual(payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].present, false);
    assert.strictEqual(payload.summary.dailyRunCount, 0);
  });

  check("stabiler Exportformat-Header", () => {
    const payload = LocalDataBackup.exportLocalData(mockStorage(), { now: "2026-07-12T10:00:00.000Z" });
    assert.deepStrictEqual(payload.allowedStorageKeys, [...LocalDataBackup.ALLOWED_STORAGE_KEYS]);
    assert.strictEqual(payload.applicationName, LocalDataBackup.APPLICATION_NAME);
    assert.strictEqual(payload.exportedAt, "2026-07-12T10:00:00.000Z");
    assert.match(payload.safetyNotice, /Kanonische Projekt- und Agentenregister/);
  });

  check("gültiger Round-trip Export → Import", () => {
    const storage = buildFilledStorage();
    const before = storage.snapshot();
    const exported = LocalDataBackup.exportLocalData(storage);
    storage.setItem(LocalDataBackup.MANAGEMENT_STORAGE_KEY, JSON.stringify({ projects: [] }));
    storage.setItem(LocalDataBackup.DAILY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, activeRunId: null, runs: [] }));
    LocalDataBackup.importLocalData(storage, exported, { confirmed: true, now: "2026-07-12T11:00:00.000Z" });
    assert.strictEqual(storage.snapshot()[LocalDataBackup.MANAGEMENT_STORAGE_KEY], before[LocalDataBackup.MANAGEMENT_STORAGE_KEY]);
    assert.strictEqual(storage.snapshot()[LocalDataBackup.DAILY_STORAGE_KEY], before[LocalDataBackup.DAILY_STORAGE_KEY]);
  });

  check("ungültiges JSON wird abgewiesen", () => {
    const parsed = LocalDataBackup.parseExportJson("{broken");
    assert.strictEqual(parsed.ok, false);
    assert.match(parsed.error, /Ungültiges JSON/);
  });

  check("falsche Formatversion wird abgewiesen", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    payload.exportFormatVersion = 99;
    const result = LocalDataBackup.validateImportPayload(payload, storage);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /Nicht unterstützte Exportformat-Version/);
  });

  check("unbekannter Speicherschlüssel wird abgewiesen", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    payload.storage["fremder-schluessel"] = payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY];
    const result = LocalDataBackup.validateImportPayload(payload, storage);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /Unbekannter Speicherschlüssel/);
  });

  check("fehlendes Pflichtfeld wird abgewiesen", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    delete payload.exportedAt;
    const result = LocalDataBackup.validateImportPayload(payload, storage);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /Pflichtfeld fehlt/);
  });

  check("bestehende Daten bleiben nach fehlgeschlagenem Import unverändert", () => {
    const storage = buildFilledStorage();
    const before = storage.snapshot();
    const payload = LocalDataBackup.exportLocalData(storage);
    payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].raw = "{ invalid json";
    assert.throws(() => LocalDataBackup.importLocalData(storage, payload, { confirmed: true }), /gültiges JSON|Import abgebrochen/);
    assert.deepStrictEqual(storage.snapshot(), before);
  });

  check("Teilimport wird verhindert", () => {
    const storage = buildFilledStorage();
    const before = storage.snapshot();
    const payload = LocalDataBackup.exportLocalData(storage);
    assert.throws(
      () =>
        LocalDataBackup.importLocalData(storage, payload, {
          confirmed: true,
          failOnKey: LocalDataBackup.DAILY_STORAGE_KEY,
        }),
      /zurückgerollt/,
    );
    assert.deepStrictEqual(storage.snapshot(), before);
  });

  check("Rollback bei simuliertem Schreibfehler", () => {
    const storage = buildFilledStorage();
    const before = storage.snapshot();
    const payload = LocalDataBackup.exportLocalData(storage);
    assert.throws(
      () =>
        LocalDataBackup.importLocalData(storage, payload, {
          confirmed: true,
          failOnKey: LocalDataBackup.MANAGEMENT_STORAGE_KEY,
        }),
      /Simulierter Schreibfehler/,
    );
    assert.deepStrictEqual(storage.snapshot(), before);
  });

  check("historische Tageslaufdaten bleiben erhalten", () => {
    const storage = buildFilledStorage();
    const exported = LocalDataBackup.exportLocalData(storage);
    const importedStore = JSON.parse(exported.storage[LocalDataBackup.DAILY_STORAGE_KEY].raw);
    assert.strictEqual(importedStore.schemaVersion, 1);
    assert.ok(importedStore.runs.some((run) => run.id === "run-v6402"));
    assert.ok(importedStore.runs[0].workProposal);
  });

  check("kanonische Projekte werden nicht überschrieben", () => {
    const registryBefore = getProjectById("health-upgrade-kompass").localHead;
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].empty = false;
    payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].present = true;
    payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].raw = JSON.stringify({
      PROJECT_REGISTRY: [{ id: "fake" }],
      projects: [],
    });
    payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].byteLength =
      payload.storage[LocalDataBackup.MANAGEMENT_STORAGE_KEY].raw.length;
    const result = LocalDataBackup.validateImportPayload(payload, storage);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /kanonische Registerdaten/);
    assert.strictEqual(getProjectById("health-upgrade-kompass").localHead, registryBefore);
  });

  check("kanonische Agenten werden nicht überschrieben", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].empty = false;
    payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].present = true;
    payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].raw = JSON.stringify({
      schemaVersion: 1,
      activeRunId: null,
      runs: [],
      PRODUCTIVE_AGENT_REGISTRY: [{ id: "fake-agent" }],
    });
    payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].byteLength =
      payload.storage[LocalDataBackup.DAILY_STORAGE_KEY].raw.length;
    const result = LocalDataBackup.validateImportPayload(payload, storage);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /kanonische Registerdaten/);
  });

  check("doppelte Bestätigung löst keinen zweiten Import aus", () => {
    const storage = buildFilledStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    const token = "import-token-1";
    LocalDataBackup.importLocalData(storage, payload, { confirmed: true, importToken: token });
    assert.throws(
      () =>
        LocalDataBackup.importLocalData(storage, payload, {
          confirmed: true,
          importToken: token,
          lastCompletedImportToken: token,
        }),
      /bereits bestätigt/,
    );
  });

  check("Import ohne Bestätigung wird abgewiesen", () => {
    const storage = mockStorage();
    const payload = LocalDataBackup.exportLocalData(storage);
    assert.throws(() => LocalDataBackup.importLocalData(storage, payload), /ausdrückliche Bestätigung/);
  });

  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  check("app.js bindet Datensicherung minimal an", () => {
    assert.match(appSource, /LocalDataBackup/);
    assert.match(appSource, /renderLocalDataBackupSection/);
    assert.doesNotMatch(appSource, /function exportLocalData\(/);
  });

  console.log(`local-data-backup.test.js: ${passed} Prüfpunkte erfolgreich`);
}

function ALLOWED_KEYS_ASSERT(payload) {
  assert.deepStrictEqual(Object.keys(payload.storage).sort(), [...LocalDataBackup.ALLOWED_STORAGE_KEYS].sort());
}

runTests();
