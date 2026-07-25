"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const v71Backup = require("./v71-registry-backup");
const documentRegistry = require("./document-registry");
const localDataBackup = require("./local-data-backup");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "v71-backup-test-"));
  return documentRegistry.resolveDocumentPaths({ appSupportDir });
}

const paths = makeIsolatedPaths();
documentRegistry.ensureDocumentDirs(paths);
documentRegistry.registerDocument(
  { projectId: "ki-unternehmenszentrale", title: "Backup-Testnotiz", sourceType: "MANUAL_NOTE", note: "x" },
  { paths },
);

// 61. neue Metadaten exportiert
check("neue Metadaten (Dokumente/Tools/Plugins) werden exportiert", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  assert.ok(exportData.documents.length >= 1);
  assert.ok(exportData.toolRegistrySnapshot.length > 0);
  assert.ok(exportData.pluginStatusSnapshot.length > 0);
});

// 62. Originaldateien nicht exportiert
check("Originaldateien werden nicht exportiert (keine Dateiinhalts-Felder)", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const serialized = JSON.stringify(exportData);
  assert.ok(!/originalContent|fileBuffer|base64Content/.test(serialized));
  exportData.documents.forEach((doc) => {
    assert.strictEqual(typeof doc.storedFileName, doc.storedFileName === null ? "object" : "string");
  });
});

// 63. Credentials nicht exportiert
check("Credentials werden nicht exportiert", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const serialized = JSON.stringify(exportData);
  assert.ok(!/AIRTABLE_API_KEY|apiKey"\s*:/i.test(serialized));
});

// 64. Tokens nicht exportiert
check("Tokens werden nicht exportiert", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const serialized = JSON.stringify(exportData);
  assert.ok(!/"token"\s*:\s*"[^"]{6,}"/i.test(serialized));
});

// 65. Restore startet nichts
check("Restore/Import-Vorschau startet kein Plugin, überträgt nichts, kauft/veröffentlicht nichts", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const result = v71Backup.importV71MetadataPreview(exportData);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.startedPlugin, false);
  assert.strictEqual(result.startedExternalTransfer, false);
  assert.strictEqual(result.purchasedAnything, false);
  assert.strictEqual(result.publishedAnything, false);
  assert.strictEqual(result.overwroteOriginalFiles, false);
  assert.strictEqual(result.writesAppliedToLiveRegistry, false);
});

// 66. Schema v1
check("bestehendes Backup-Schema v1 (localStorage) bleibt lesbar/unverändert", () => {
  assert.strictEqual(localDataBackup.EXPORT_FORMAT_VERSION, 1);
  assert.ok(localDataBackup.SUPPORTED_EXPORT_FORMAT_VERSIONS.includes(1));
});

// 67. Schema v2
check("bestehendes Tageslauf-Schema v2 bleibt über local-data-backup lesbar", () => {
  assert.strictEqual(
    localDataBackup.validateDailyWorkStore({ schemaVersion: 2, runs: [{ id: "run-1", schemaVersion: 2 }], activeRunId: null }),
    true,
  );
});

// 68. neues V7.1-Schema
check("neues V7.1-Schema ist eigenständig versioniert und getrennt von v1/v2", () => {
  assert.strictEqual(v71Backup.V71_EXPORT_FORMAT_VERSION, "v71-phase-a-metadata-1");
  assert.notStrictEqual(v71Backup.V71_EXPORT_FORMAT_VERSION, localDataBackup.EXPORT_FORMAT_VERSION);
});

// 69. ungültiges Backup blockiert
check("ungültiges V7.1-Backup wird blockiert (falsche Version)", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const tampered = { ...exportData, exportFormatVersion: "v0-fake" };
  const result = v71Backup.importV71MetadataPreview(tampered);
  assert.strictEqual(result.ok, false);
});

check("ungültiges V7.1-Backup wird blockiert (fremde Anwendung)", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const tampered = { ...exportData, applicationName: "Fremd-App" };
  const result = v71Backup.importV71MetadataPreview(tampered);
  assert.strictEqual(result.ok, false);
});

check("ungültiges V7.1-Backup wird blockiert (unerwartetes Feld / Secret-Verdacht)", () => {
  const exportData = v71Backup.exportV71Metadata({ paths });
  const tampered = { ...exportData, injectedApiKey: "sk-1234567890abcdef" };
  const result = v71Backup.importV71MetadataPreview(tampered);
  assert.strictEqual(result.ok, false);
});

console.log(`v71-registry-backup.test.js: ${passed} Prüfpunkte erfolgreich`);
