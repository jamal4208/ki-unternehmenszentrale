"use strict";

// V7.1 Phase B.1 – dedizierte Tests für die Mandantentrennung auf
// Persistenzebene (Auftrag Abschnitt D): Reassignment-Block, abgeleitete
// Ergebnis-Mandantenbindung, kundengebundene Listen.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const heygenStore = require("./heygen-store");
const heygenJobPackage = require("./heygen-job-package");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "heygen-store-test-"));
  return heygenStore.resolveHeygenStorePaths({ appSupportDir });
}

function draftPackage(overrides = {}) {
  const prepared = heygenJobPackage.prepareHeygenJobPackage({
    projectId: "ki-unternehmenszentrale",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    videoType: "AVATAR_VIDEO",
    title: "Café-Test",
    script: "Willkommen in unserem neutralen Test-Café.",
    aspectRatio: "9:16",
    durationTargetSeconds: 15,
    avatarReference: { avatarId: "public-avatar-1", visibility: "PUBLIC" },
    dataClassification: "NORMAL",
    ...overrides,
  });
  return prepared.package;
}

const paths = makeIsolatedPaths();

check("Jobpaket wird gespeichert und unverändert geladen", () => {
  const pkg = draftPackage();
  heygenStore.savePackage(paths, pkg);
  const loaded = heygenStore.loadPackage(paths, pkg.jobPackageId);
  assert.strictEqual(loaded.customerId, pkg.customerId);
});

// 3. Ein Jobpaket kann nicht nachträglich einem anderen Kunden zugeordnet werden.
check("Jobpaket-Reassignment auf einen anderen Kunden wird blockiert", () => {
  const pkg = draftPackage();
  heygenStore.savePackage(paths, pkg);
  const reassigned = { ...pkg, customerId: "test-customer-fiktives-fitnessstudio" };
  assert.throws(() => heygenStore.savePackage(paths, reassigned), /kann nicht auf Kunde/);
});

check("Jobpaket-Reassignment auf eine andere Marke wird blockiert", () => {
  const pkg = draftPackage({ title: "Zweites Testpaket" });
  heygenStore.savePackage(paths, pkg);
  const reassigned = { ...pkg, brandId: "test-brand-fiktives-fitnessstudio" };
  assert.throws(() => heygenStore.savePackage(paths, reassigned), /kann nicht auf Marke/);
});

check("erneutes Speichern desselben Mandanten (z. B. Statuswechsel) bleibt erlaubt", () => {
  const pkg = draftPackage({ title: "Drittes Testpaket" });
  heygenStore.savePackage(paths, pkg);
  const updated = { ...pkg, status: "READY_FOR_REVIEW" };
  const saved = heygenStore.savePackage(paths, updated);
  assert.strictEqual(saved.status, "READY_FOR_REVIEW");
  assert.strictEqual(saved.customerId, pkg.customerId);
});

// 4. Ergebnisrückgaben müssen zum gleichen Mandanten wie das Jobpaket gehören.
check("Ergebnis wird automatisch an den Mandanten des zugehörigen Jobpakets gebunden", () => {
  const pkg = draftPackage({ title: "Viertes Testpaket" });
  heygenStore.savePackage(paths, pkg);
  const saved = heygenStore.saveResult(paths, pkg.jobPackageId, {
    jobPackageId: pkg.jobPackageId,
    providerJobId: "provider-1",
    status: "SUCCEEDED",
    // Versuch, einen fremden Mandanten unterzuschieben – wird ignoriert.
    customerId: "test-customer-fiktives-fitnessstudio",
  });
  assert.strictEqual(saved.customerId, pkg.customerId);
  assert.strictEqual(saved.brandId, pkg.brandId);
  assert.strictEqual(saved.campaignId, pkg.campaignId);
});

check("Ergebnis für ein nicht existierendes Jobpaket wird abgewiesen", () => {
  assert.throws(() => heygenStore.saveResult(paths, "nicht-vorhanden-xyz", { status: "SUCCEEDED" }));
});

// 15/17. Kundengebundene Listen liefern keine fremden Datensätze.
check("listPackages mit customerId-Filter liefert ausschließlich Datensätze dieses Kunden", () => {
  const pkgB = draftPackage({
    title: "Fitnessstudio-Testpaket",
    customerId: "test-customer-fiktives-fitnessstudio",
    brandId: "test-brand-fiktives-fitnessstudio",
    campaignId: "test-campaign-fiktives-fitnessstudio-demo",
    projectId: "marketing-agentur-os",
  });
  heygenStore.savePackage(paths, pkgB);
  const cafeOnly = heygenStore.listPackages(paths, { customerId: "test-customer-fiktives-cafe" });
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
  heygenStore.savePackage(paths, pkgB);
  heygenStore.saveResult(paths, pkgB.jobPackageId, {
    jobPackageId: pkgB.jobPackageId,
    providerJobId: "provider-studio-1",
    status: "SUCCEEDED",
  });
  const cafeResults = heygenStore.listResults(paths, { customerId: "test-customer-fiktives-cafe" });
  assert.ok(cafeResults.every((entry) => entry.customerId === "test-customer-fiktives-cafe"));
  assert.ok(!cafeResults.some((entry) => entry.jobPackageId === pkgB.jobPackageId));
});

// Lifecycle-Ablage (Grundfunktion, siehe heygen-result-lifecycle.js).
check("Lifecycle-Datensatz wird gespeichert und geladen", () => {
  const pkg = draftPackage({ title: "Lifecycle-Testpaket" });
  heygenStore.savePackage(paths, pkg);
  heygenStore.saveLifecycle(paths, pkg.jobPackageId, { jobPackageId: pkg.jobPackageId, customerReviewStatus: "PROVIDER_PROCESSING" });
  const loaded = heygenStore.loadLifecycle(paths, pkg.jobPackageId);
  assert.strictEqual(loaded.customerReviewStatus, "PROVIDER_PROCESSING");
  const all = heygenStore.listLifecycles(paths);
  assert.ok(all.some((entry) => entry.jobPackageId === pkg.jobPackageId));
});

check("keine Netzwerklogik im Store-Modul", () => {
  const source = fs.readFileSync(__filename.replace("heygen-store.test.js", "heygen-store.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

console.log(`heygen-store.test.js: ${passed} Prüfpunkte erfolgreich`);
