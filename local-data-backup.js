"use strict";

(function initLocalDataBackup(root, factory) {
  const dailyWorkRunApi =
    typeof module === "object" && module.exports
      ? require("./daily-work-run")
      : root?.DailyWorkRun;
  const api = factory(dailyWorkRunApi);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LocalDataBackup = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLocalDataBackupApi(DailyWorkRun) {
  const EXPORT_FORMAT_VERSION = 1;
  const SUPPORTED_EXPORT_FORMAT_VERSIONS = Object.freeze([1]);
  const APPLICATION_NAME = "KI-Unternehmenszentrale";
  const MANAGEMENT_STORAGE_KEY = "ki-unternehmenszentrale-v1";
  const DAILY_STORAGE_KEY = "ki-unternehmenszentrale-daily-work-runs-v1";
  const ALLOWED_STORAGE_KEYS = Object.freeze([MANAGEMENT_STORAGE_KEY, DAILY_STORAGE_KEY]);
  const REQUIRED_EXPORT_FIELDS = Object.freeze([
    "exportFormatVersion",
    "exportedAt",
    "applicationName",
    "allowedStorageKeys",
    "storage",
  ]);
  const ALLOWED_EXPORT_ROOT_FIELDS = Object.freeze([
    "exportFormatVersion",
    "exportedAt",
    "applicationName",
    "allowedStorageKeys",
    "storage",
    "summary",
    "safetyNotice",
  ]);
  const CANONICAL_FORBIDDEN_ROOT_KEYS = Object.freeze([
    "PRODUCTIVE_AGENT_REGISTRY",
    "PROJECT_REGISTRY",
    "CANONICAL_AGENT_COUNT",
    "CANONICAL_AGENTS",
    "registrySource",
    "API_SECURITY_FLAGS",
    "agent-registry",
    "project-registry",
  ]);
  const SECRET_PATTERNS = Object.freeze([
    /AIRTABLE_API_KEY/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    /\.env\.local/i,
    /"apiKey"\s*:\s*"[^"]{8,}"/i,
    /"secret"\s*:\s*"[^"]{8,}"/i,
    /"token"\s*:\s*"[^"]{12,}"/i,
    /"password"\s*:\s*"[^"]+"/i,
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function assertAllowedStorageKey(key) {
    if (!ALLOWED_STORAGE_KEYS.includes(key)) {
      throw new Error(`Unbekannter Speicherschlüssel: ${key}`);
    }
  }

  function scanForSecrets(text) {
    if (typeof text !== "string" || !text) return null;
    const match = SECRET_PATTERNS.find((pattern) => pattern.test(text));
    return match ? "Der Export enthält mögliche Zugangsdaten oder Geheimnisse und wird aus Sicherheitsgründen abgewiesen." : null;
  }

  function validateManagementStore(parsed) {
    if (!isPlainObject(parsed)) {
      throw new Error("Management-Speicher muss ein JSON-Objekt sein.");
    }
    CANONICAL_FORBIDDEN_ROOT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        throw new Error("Import enthält unzulässige kanonische Registerdaten.");
      }
    });
    if (parsed.projects !== undefined && !Array.isArray(parsed.projects)) {
      throw new Error("Management-Speicher: projects muss ein Array sein.");
    }
    if (parsed.tickets !== undefined && !Array.isArray(parsed.tickets)) {
      throw new Error("Management-Speicher: tickets muss ein Array sein.");
    }
    if (parsed.knowledge !== undefined && !Array.isArray(parsed.knowledge)) {
      throw new Error("Management-Speicher: knowledge muss ein Array sein.");
    }
    return true;
  }

  function validateDailyWorkStore(parsed) {
    if (!isPlainObject(parsed)) {
      throw new Error("Tageslauf-Speicher muss ein JSON-Objekt sein.");
    }
    CANONICAL_FORBIDDEN_ROOT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        throw new Error("Import enthält unzulässige kanonische Registerdaten.");
      }
    });
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
      throw new Error("Nicht unterstützte Tageslauf-schemaVersion.");
    }
    if (!Array.isArray(parsed.runs)) {
      throw new Error("Beschädigte Tageslaufstruktur: runs fehlt.");
    }
    parsed.runs.forEach((run, index) => {
      if (!isPlainObject(run)) {
        throw new Error(`Beschädigte Tageslaufstruktur in Lauf ${index + 1}.`);
      }
      if (typeof run.id !== "string" || !run.id.trim()) {
        throw new Error(`Beschädigte Tageslaufstruktur in Lauf ${index + 1}: id fehlt.`);
      }
      if (run.schemaVersion !== undefined && run.schemaVersion !== 1) {
        throw new Error("Nicht unterstützte Tageslauf-schemaVersion.");
      }
    });
    if (
      parsed.activeRunId !== null &&
      parsed.activeRunId !== undefined &&
      typeof parsed.activeRunId !== "string"
    ) {
      throw new Error("Beschädigte Tageslaufstruktur: activeRunId ist ungültig.");
    }
    if (DailyWorkRun?.createStore) {
      DailyWorkRun.createStore(parsed);
    }
    return true;
  }

  function validateStoredRaw(key, raw) {
    assertAllowedStorageKey(key);
    if (raw === null || raw === undefined || raw === "") {
      return { parsed: null, empty: true };
    }
    if (typeof raw !== "string") {
      throw new Error(`Speicherbereich ${key} muss als Text gespeichert sein.`);
    }
    const secretError = scanForSecrets(raw);
    if (secretError) throw new Error(secretError);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      throw new Error(`Speicherbereich ${key} enthält kein gültiges JSON.`);
    }
    if (key === MANAGEMENT_STORAGE_KEY) {
      validateManagementStore(parsed);
    } else {
      validateDailyWorkStore(parsed);
    }
    return { parsed, empty: false };
  }

  function summarizeStorage(parsed, key) {
    if (!parsed) {
      return key === DAILY_STORAGE_KEY
        ? { dailyRunCount: 0, activeRunId: null }
        : { managementProjectCount: 0 };
    }
    if (key === DAILY_STORAGE_KEY) {
      return {
        dailyRunCount: Array.isArray(parsed.runs) ? parsed.runs.length : 0,
        activeRunId: parsed.activeRunId || null,
      };
    }
    return {
      managementProjectCount: Array.isArray(parsed.projects) ? parsed.projects.length : 0,
    };
  }

  function readStorageEntry(storage, key) {
    assertAllowedStorageKey(key);
    if (!storage || typeof storage.getItem !== "function") {
      throw new Error("Browser-Speicher ist nicht verfügbar.");
    }
    const raw = storage.getItem(key);
    const present = raw !== null && raw !== undefined;
    const empty = !present || raw === "";
    return {
      key,
      present,
      empty,
      raw: empty ? null : String(raw),
      byteLength: empty ? 0 : String(raw).length,
    };
  }

  function buildExportSummary(storageEntries) {
    let dailyRunCount = 0;
    let managementProjectCount = 0;
    storageEntries.forEach((entry) => {
      if (!entry.present || entry.empty) return;
      try {
        const parsed = JSON.parse(entry.raw);
        const summary = summarizeStorage(parsed, entry.key);
        dailyRunCount = Math.max(dailyRunCount, summary.dailyRunCount || 0);
        managementProjectCount = Math.max(managementProjectCount, summary.managementProjectCount || 0);
      } catch (_error) {
        /* unparseable entries remain visible via present/empty flags */
      }
    });
    return { dailyRunCount, managementProjectCount };
  }

  function exportLocalData(storage, options = {}) {
    if (!storage || typeof storage.getItem !== "function") {
      throw new Error("Browser-Speicher ist nicht verfügbar.");
    }
    const exportedAt = new Date(options.now || Date.now()).toISOString();
    const storageEntries = ALLOWED_STORAGE_KEYS.map((key) => readStorageEntry(storage, key));
    storageEntries.forEach((entry) => {
      if (entry.present && !entry.empty) {
        validateStoredRaw(entry.key, entry.raw);
      }
    });
    const storagePayload = {};
    storageEntries.forEach((entry) => {
      storagePayload[entry.key] = {
        present: entry.present,
        empty: entry.empty,
        raw: entry.raw,
        byteLength: entry.byteLength,
      };
    });
    return {
      exportFormatVersion: EXPORT_FORMAT_VERSION,
      exportedAt,
      applicationName: APPLICATION_NAME,
      allowedStorageKeys: [...ALLOWED_STORAGE_KEYS],
      storage: storagePayload,
      summary: buildExportSummary(storageEntries),
      safetyNotice:
        "Diese Sicherung enthält ausschließlich lokale Browser-Arbeitsdaten. Kanonische Projekt- und Agentenregister werden nicht exportiert.",
    };
  }

  function exportLocalDataJson(storage, options = {}) {
    return JSON.stringify(exportLocalData(storage, options), null, 2);
  }

  function parseExportJson(jsonText) {
    if (typeof jsonText !== "string" || !jsonText.trim()) {
      return { ok: false, error: "Die Sicherungsdatei ist leer oder ungültig." };
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_error) {
      return { ok: false, error: "Ungültiges JSON: Die Sicherungsdatei konnte nicht gelesen werden." };
    }
    return { ok: true, export: parsed };
  }

  function validateImportPayload(exportData, storage, options = {}) {
    if (!isPlainObject(exportData)) {
      return { ok: false, error: "Ungültiges Exportformat: Wurzel muss ein Objekt sein." };
    }
    const unexpectedRootFields = Object.keys(exportData).filter((key) => !ALLOWED_EXPORT_ROOT_FIELDS.includes(key));
    if (unexpectedRootFields.length > 0) {
      return {
        ok: false,
        error: `Unerwartete Exportfelder: ${unexpectedRootFields.join(", ")}`,
      };
    }
    for (const field of REQUIRED_EXPORT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(exportData, field)) {
        return { ok: false, error: `Pflichtfeld fehlt: ${field}` };
      }
    }
    if (typeof exportData.exportFormatVersion !== "number") {
      return { ok: false, error: "Exportformat-Version fehlt oder ist ungültig." };
    }
    if (!SUPPORTED_EXPORT_FORMAT_VERSIONS.includes(exportData.exportFormatVersion)) {
      return {
        ok: false,
        error: `Nicht unterstützte Exportformat-Version: ${exportData.exportFormatVersion}`,
      };
    }
    if (typeof exportData.exportedAt !== "string" || !exportData.exportedAt.trim()) {
      return { ok: false, error: "Exportzeitpunkt fehlt." };
    }
    if (exportData.applicationName !== APPLICATION_NAME) {
      return { ok: false, error: "Die Sicherung stammt nicht von der KI-Unternehmenszentrale." };
    }
    if (
      !Array.isArray(exportData.allowedStorageKeys) ||
      exportData.allowedStorageKeys.length !== ALLOWED_STORAGE_KEYS.length ||
      !exportData.allowedStorageKeys.every((key, index) => key === ALLOWED_STORAGE_KEYS[index])
    ) {
      return { ok: false, error: "Die erlaubten Speicherschlüssel stimmen nicht überein." };
    }
    if (!isPlainObject(exportData.storage)) {
      return { ok: false, error: "Speicherbereich storage fehlt oder ist ungültig." };
    }
    const storageKeys = Object.keys(exportData.storage);
    const unknownKeys = storageKeys.filter((key) => !ALLOWED_STORAGE_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      return {
        ok: false,
        error: `Unbekannter Speicherschlüssel in der Sicherung: ${unknownKeys[0]}`,
      };
    }
    if (storageKeys.length !== ALLOWED_STORAGE_KEYS.length) {
      return { ok: false, error: "Die Sicherung enthält eine unvollständige Speicherliste." };
    }
    for (const key of ALLOWED_STORAGE_KEYS) {
      const entry = exportData.storage[key];
      if (!isPlainObject(entry)) {
        return { ok: false, error: `Speicherbereich ${key} ist beschädigt.` };
      }
      if (typeof entry.present !== "boolean" || typeof entry.empty !== "boolean") {
        return { ok: false, error: `Prüfinformation für ${key} ist unvollständig.` };
      }
      if (typeof entry.byteLength !== "number") {
        return { ok: false, error: `Byte-Angabe für ${key} fehlt.` };
      }
      if (entry.empty && entry.raw !== null) {
        return { ok: false, error: `Speicherbereich ${key} ist als leer markiert, enthält aber Rohdaten.` };
      }
      if (!entry.empty && (entry.raw === null || typeof entry.raw !== "string")) {
        return { ok: false, error: `Speicherbereich ${key} enthält keine gültigen Rohdaten.` };
      }
      if (!entry.empty) {
        try {
          validateStoredRaw(key, entry.raw);
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }
    }

    const preview = buildImportPreview(exportData, storage);
    if (options.requireConfirmed === true && options.confirmed !== true) {
      return { ok: false, error: "Import erfordert Jamals ausdrückliche Bestätigung.", preview };
    }
    return { ok: true, preview };
  }

  function buildImportPreview(exportData, storage) {
    const current = {
      managementPresent: Boolean(storage?.getItem?.(MANAGEMENT_STORAGE_KEY)),
      dailyPresent: Boolean(storage?.getItem?.(DAILY_STORAGE_KEY)),
    };
    let dailyRunCount = 0;
    let managementProjectCount = 0;
    if (isPlainObject(exportData?.summary)) {
      dailyRunCount = Number(exportData.summary.dailyRunCount) || 0;
      managementProjectCount = Number(exportData.summary.managementProjectCount) || 0;
    }
    if (isPlainObject(exportData?.storage?.[DAILY_STORAGE_KEY]) && !exportData.storage[DAILY_STORAGE_KEY].empty) {
      try {
        dailyRunCount = summarizeStorage(
          JSON.parse(exportData.storage[DAILY_STORAGE_KEY].raw),
          DAILY_STORAGE_KEY,
        ).dailyRunCount;
      } catch (_error) {
        /* validation catches this before import */
      }
    }
    if (isPlainObject(exportData?.storage?.[MANAGEMENT_STORAGE_KEY]) && !exportData.storage[MANAGEMENT_STORAGE_KEY].empty) {
      try {
        managementProjectCount = summarizeStorage(
          JSON.parse(exportData.storage[MANAGEMENT_STORAGE_KEY].raw),
          MANAGEMENT_STORAGE_KEY,
        ).managementProjectCount;
      } catch (_error) {
        /* validation catches this before import */
      }
    }
    return {
      exportedAt: exportData?.exportedAt || "UNGEKLÄRT",
      storageAreas: ALLOWED_STORAGE_KEYS.map((key) => {
        const entry = exportData?.storage?.[key] || {};
        return {
          key,
          label: key === MANAGEMENT_STORAGE_KEY ? "Managementdaten" : "Tagesläufe",
          presentInBackup: entry.present === true,
          emptyInBackup: entry.empty === true,
          byteLength: entry.byteLength || 0,
        };
      }),
      dailyRunCount,
      managementProjectCount,
      overwrite: {
        management: current.managementPresent,
        daily: current.dailyPresent,
      },
      safetyNotice:
        "Der Import überschreibt ausschließlich lokale Browser-Arbeitsdaten. Kanonische Projekt- und Agentenregister bleiben unverändert. Es startet keine Agenten-, Plugin- oder externe Aktion.",
    };
  }

  function restoreRollbackSnapshot(storage, snapshot) {
    ALLOWED_STORAGE_KEYS.forEach((key) => {
      const previous = snapshot[key];
      if (previous === null || previous === undefined) {
        if (typeof storage.removeItem === "function") {
          storage.removeItem(key);
        }
        return;
      }
      storage.setItem(key, previous);
    });
  }

  function captureRollbackSnapshot(storage) {
    const snapshot = {};
    ALLOWED_STORAGE_KEYS.forEach((key) => {
      snapshot[key] = storage.getItem(key);
    });
    return snapshot;
  }

  function writeImportEntry(storage, key, entry, failOnKey = null) {
    assertAllowedStorageKey(key);
    if (entry.empty || !entry.present) {
      if (typeof storage.removeItem === "function") {
        storage.removeItem(key);
      } else {
        storage.setItem(key, "");
      }
      return;
    }
    if (failOnKey && failOnKey === key) {
      throw new Error(`Simulierter Schreibfehler für ${key}.`);
    }
    storage.setItem(key, entry.raw);
  }

  function importLocalData(storage, exportData, options = {}) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("Browser-Speicher ist nicht verfügbar.");
    }
    const validation = validateImportPayload(exportData, storage, {
      requireConfirmed: true,
      confirmed: options.confirmed,
    });
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    if (options.importToken && options.lastCompletedImportToken === options.importToken) {
      throw new Error("Dieser Import wurde bereits bestätigt und ausgeführt.");
    }

    const rollbackSnapshot = captureRollbackSnapshot(storage);
    const pendingWrites = ALLOWED_STORAGE_KEYS.map((key) => ({
      key,
      entry: exportData.storage[key],
    }));

    try {
      pendingWrites.forEach(({ key, entry }) => {
        writeImportEntry(storage, key, entry, options.failOnKey || null);
      });
    } catch (error) {
      restoreRollbackSnapshot(storage, rollbackSnapshot);
      throw new Error(`Import abgebrochen und zurückgerollt: ${error.message}`);
    }

    return {
      ok: true,
      importedAt: new Date(options.now || Date.now()).toISOString(),
      preview: validation.preview,
      importToken: options.importToken || null,
    };
  }

  return Object.freeze({
    ALLOWED_STORAGE_KEYS,
    APPLICATION_NAME,
    DAILY_STORAGE_KEY,
    EXPORT_FORMAT_VERSION,
    MANAGEMENT_STORAGE_KEY,
    SUPPORTED_EXPORT_FORMAT_VERSIONS,
    buildImportPreview,
    exportLocalData,
    exportLocalDataJson,
    importLocalData,
    parseExportJson,
    validateImportPayload,
    validateManagementStore,
    validateDailyWorkStore,
  });
});
