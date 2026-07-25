"use strict";

const assert = require("assert");

const agencyBackup = require("./agency-backup");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// 61. Metadaten exportiert
check("61. Testmandanten-/Marken-/Kampagnen-/Pilotreview-Metadaten werden exportiert", () => {
  const backup = agencyBackup.exportAgencyBackup();
  assert.ok(backup.customers.length >= 2);
  assert.ok(backup.brands.length >= 2);
  assert.ok(backup.campaigns.length >= 2);
  assert.ok(backup.pilotReviews.length >= 1);
  assert.strictEqual(backup.applicationName, "KI-Unternehmenszentrale");
});

// 62/63/64. keine Medien/Credentials/Tokens im Export.
check("62-64. Export enthält keine Medien, Credentials oder Tokens", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const text = JSON.stringify(backup);
  assert.ok(!/"apiKey"\s*:|"token"\s*:|videoBuffer|imageBuffer|audioBuffer/i.test(text));
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/.test(text));
});

check("Validierung lehnt unerwartete Wurzelfelder ab", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const tampered = { ...backup, extraField: "sollte nicht erlaubt sein" };
  const validation = agencyBackup.validateAgencyBackup(tampered);
  assert.strictEqual(validation.ok, false);
});

check("Validierung lehnt Sicherung mit Geheimnismuster ab", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const tampered = { ...backup, customers: [...backup.customers, { customerId: "x", apiKey: "sk-1234567890abcdef" }] };
  const validation = agencyBackup.validateAgencyBackup(tampered);
  assert.strictEqual(validation.ok, false);
});

// 65. Restore startet nichts.
check("65. Restore-Vorschau startet keinen Job, kein Hand-off, keine Veröffentlichung, keinen Kauf", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const preview = agencyBackup.previewAgencyBackupRestore(backup);
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.startedHeygenJob, false);
  assert.strictEqual(preview.repeatedHandoff, false);
  assert.strictEqual(preview.publishedAnything, false);
  assert.strictEqual(preview.purchasedAnything, false);
  assert.strictEqual(preview.resetApprovals, false);
  assert.strictEqual(preview.writesAppliedToLiveStore, false);
});

check("Restore-Vorschau erkennt eine mit der aktuellen Registry konsistente Sicherung", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const preview = agencyBackup.previewAgencyBackupRestore(backup);
  assert.strictEqual(preview.preview.matchesCurrentRegistry, true);
  assert.deepStrictEqual(preview.preview.unknownCustomerIds, []);
});

// 20/21. Backup wahrt Zuordnung / Restore wahrt Zuordnung.
check("20/21. Restore-Vorschau erkennt unbekannte/fremde Kunden-IDs (Mandantentrennung bleibt gewahrt)", () => {
  const backup = agencyBackup.exportAgencyBackup();
  const tampered = { ...backup, customers: [...backup.customers, { customerId: "fremder-kunde-von-aussen", displayName: "x" }] };
  const preview = agencyBackup.previewAgencyBackupRestore(tampered);
  assert.strictEqual(preview.ok, true);
  assert.ok(preview.preview.unknownCustomerIds.includes("fremder-kunde-von-aussen"));
  assert.strictEqual(preview.preview.matchesCurrentRegistry, false);
  assert.strictEqual(preview.tenantSeparationPreserved, true);
});

check("Restore-Vorschau weist strukturell ungültige Sicherungen ab", () => {
  const preview = agencyBackup.previewAgencyBackupRestore({ backupFormatVersion: "unbekannt" });
  assert.strictEqual(preview.ok, false);
});

console.log(`agency-backup.test.js: ${passed} Prüfpunkte erfolgreich`);
