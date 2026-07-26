"use strict";

// V7.1 Phase C – dedizierte Tests für die Mandantentrennung auf
// Persistenzebene (Auftrag Abschnitt D): Reassignment-Block, abgeleitete
// Ergebnis-Mandantenbindung, kundengebundene Listen, Editing-Transaktionen.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const canvaStore = require("./canva-store");
const canvaDesignJobPackage = require("./canva-design-job-package");
const canvaConnector = require("./canva-connector");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "canva-store-test-"));
  return canvaStore.resolveCanvaStorePaths({ appSupportDir });
}

function draftPackage(overrides = {}) {
  const prepared = canvaDesignJobPackage.prepareCanvaDesignJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "Café-Test",
    brief: "Willkommen in unserem neutralen Test-Café.",
    primaryMessage: "Genießen Sie unser Frühstück.",
    dataClassification: "NORMAL",
    brandRightsConfirmed: true,
    ...overrides,
  });
  return prepared.package;
}

const paths = makeIsolatedPaths();

check("Jobpaket wird gespeichert und unverändert geladen", () => {
  const pkg = draftPackage();
  canvaStore.savePackage(paths, pkg);
  const loaded = canvaStore.loadPackage(paths, pkg.jobPackageId);
  assert.strictEqual(loaded.customerId, pkg.customerId);
});

// Reassignment blockiert (Pflichttest 15).
check("Jobpaket-Reassignment auf einen anderen Kunden wird blockiert", () => {
  const pkg = draftPackage();
  canvaStore.savePackage(paths, pkg);
  const reassigned = { ...pkg, customerId: "test-customer-fiktives-fitnessstudio" };
  assert.throws(() => canvaStore.savePackage(paths, reassigned), /kann nicht auf Kunde/);
});

check("Jobpaket-Reassignment auf eine andere Marke wird blockiert", () => {
  const pkg = draftPackage({ title: "Zweites Testpaket" });
  canvaStore.savePackage(paths, pkg);
  const reassigned = { ...pkg, brandId: "test-brand-fiktives-fitnessstudio" };
  assert.throws(() => canvaStore.savePackage(paths, reassigned), /kann nicht auf Marke/);
});

check("erneutes Speichern desselben Mandanten (z. B. Statuswechsel) bleibt erlaubt", () => {
  const pkg = draftPackage({ title: "Drittes Testpaket" });
  canvaStore.savePackage(paths, pkg);
  const updated = { ...pkg, status: "READY_FOR_REVIEW" };
  const saved = canvaStore.savePackage(paths, updated);
  assert.strictEqual(saved.status, "READY_FOR_REVIEW");
  assert.strictEqual(saved.customerId, pkg.customerId);
});

// Ergebnisrückgaben bleiben mandantengebunden (Pflichttest 17).
check("Ergebnis wird automatisch an den Mandanten des zugehörigen Jobpakets gebunden", () => {
  const pkg = draftPackage({ title: "Viertes Testpaket" });
  canvaStore.savePackage(paths, pkg);
  const saved = canvaStore.saveResult(paths, pkg.jobPackageId, {
    jobPackageId: pkg.jobPackageId,
    providerJobId: "provider-1",
    providerOperation: "GENERATE_DESIGN_CANDIDATES",
    providerStatus: "CANDIDATES_READY",
    // Versuch, einen fremden Mandanten unterzuschieben – wird ignoriert.
    customerId: "test-customer-fiktives-fitnessstudio",
  });
  assert.strictEqual(saved.customerId, pkg.customerId);
  assert.strictEqual(saved.brandId, pkg.brandId);
  assert.strictEqual(saved.campaignId, pkg.campaignId);
});

check("Ergebnis für ein nicht existierendes Jobpaket wird abgewiesen", () => {
  assert.throws(() => canvaStore.saveResult(paths, "nicht-vorhanden-xyz", { providerStatus: "CANDIDATES_READY" }));
});

// 16. Kunde A sieht Kunde-B-Design nicht.
check("listPackages mit customerId-Filter liefert ausschließlich Datensätze dieses Kunden", () => {
  const pkgB = draftPackage({
    title: "Fitnessstudio-Testpaket",
    customerId: "test-customer-fiktives-fitnessstudio",
    brandId: "test-brand-fiktives-fitnessstudio",
    campaignId: "test-campaign-fiktives-fitnessstudio-demo",
    projectId: "marketing-agentur-os",
  });
  canvaStore.savePackage(paths, pkgB);
  const cafeOnly = canvaStore.listPackages(paths, { customerId: "test-customer-fiktives-cafe" });
  assert.ok(cafeOnly.every((entry) => entry.customerId === "test-customer-fiktives-cafe"));
  assert.ok(!cafeOnly.some((entry) => entry.jobPackageId === pkgB.jobPackageId));
});

check("listResults mit customerId-Filter liefert ausschließlich Ergebnisse dieses Kunden", () => {
  const pkgB = draftPackage({
    title: "Zweites Fitnessstudio-Testpaket",
    customerId: "test-customer-fiktives-fitnessstudio",
    brandId: "test-brand-fiktives-fitnessstudio",
    campaignId: "test-campaign-fiktives-fitnessstudio-demo",
    projectId: "marketing-agentur-os",
  });
  canvaStore.savePackage(paths, pkgB);
  canvaStore.saveResult(paths, pkgB.jobPackageId, {
    jobPackageId: pkgB.jobPackageId,
    providerJobId: "provider-studio-1",
    providerOperation: "GENERATE_DESIGN_CANDIDATES",
    providerStatus: "CANDIDATES_READY",
  });
  const cafeResults = canvaStore.listResults(paths, { customerId: "test-customer-fiktives-cafe" });
  assert.ok(cafeResults.every((entry) => entry.customerId === "test-customer-fiktives-cafe"));
  assert.ok(!cafeResults.some((entry) => entry.jobPackageId === pkgB.jobPackageId));
});

// Editing-Transaktionsablage.
check("Editing-Transaktion wird gespeichert und geladen", () => {
  const pkg = draftPackage({ title: "Editing-Testpaket" });
  canvaStore.savePackage(paths, pkg);
  const record = canvaConnector.startEditingTransaction({
    designId: "design-store-test",
    jobPackageId: pkg.jobPackageId,
    customerId: pkg.customerId,
    brandId: pkg.brandId,
    campaignId: pkg.campaignId,
  });
  canvaStore.saveEditingTransaction(paths, record);
  const loaded = canvaStore.loadEditingTransaction(paths, record.editingTransactionId);
  assert.strictEqual(loaded.status, "STARTED");
  const filtered = canvaStore.listEditingTransactions(paths, { jobPackageId: pkg.jobPackageId });
  assert.ok(filtered.some((entry) => entry.editingTransactionId === record.editingTransactionId));
});

check("keine Netzwerklogik im Store-Modul", () => {
  const source = fs.readFileSync(__filename.replace("canva-store.test.js", "canva-store.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

console.log(`canva-store.test.js: ${passed} Prüfpunkte erfolgreich`);
