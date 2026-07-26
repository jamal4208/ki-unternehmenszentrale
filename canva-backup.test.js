"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const canvaBackup = require("./canva-backup");
const canvaStore = require("./canva-store");
const canvaDesignJobPackage = require("./canva-design-job-package");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "canva-backup-test-"));
  return canvaStore.resolveCanvaStorePaths({ appSupportDir });
}

function draftValidPackage(overrides = {}) {
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

function runTests() {
  const paths = makeIsolatedPaths();

  const pkg = draftValidPackage();
  canvaStore.savePackage(paths, pkg);
  check("Store: Jobpaket wird gespeichert und unverändert geladen", () => {
    const loaded = canvaStore.loadPackage(paths, pkg.jobPackageId);
    assert.strictEqual(loaded.jobPackageId, pkg.jobPackageId);
    assert.strictEqual(loaded.title, pkg.title);
  });

  check("Store: gespeichertes Paket erscheint in listPackages", () => {
    const list = canvaStore.listPackages(paths);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].jobPackageId, pkg.jobPackageId);
  });

  // 95. Metadaten exportiert.
  const exported = canvaBackup.exportCanvaBackup({ appSupportDir: paths.appSupportDir });
  check("95. Jobpaket-Metadaten werden exportiert", () => {
    assert.strictEqual(exported.jobPackages.length, 1);
    assert.strictEqual(exported.jobPackages[0].jobPackageId, pkg.jobPackageId);
    assert.strictEqual(exported.jobPackages[0].brief, pkg.brief);
  });

  // 98. Medien ausgeschlossen.
  check("98. Export enthält keine Binär-/Medienfelder", () => {
    const keys = Object.keys(exported.jobPackages[0]);
    ["designBuffer", "imageBuffer", "videoBuffer", "fileBuffer", "base64Content"].forEach((forbidden) => {
      assert.ok(!keys.includes(forbidden), `Feld ${forbidden} darf nicht exportiert werden`);
    });
  });

  // 97. Tokens ausgeschlossen.
  check("97. Export enthält keine Tokens", () => {
    const text = JSON.stringify(exported);
    assert.ok(!/"token"\s*:/i.test(text));
  });

  // 96. Credentials ausgeschlossen.
  check("96. Export enthält keine Credentials/API-Keys", () => {
    const text = JSON.stringify(exported);
    assert.ok(!/"apiKey"\s*:/i.test(text));
    assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/i.test(text));
  });

  check("privates Brand-Kit/Template wird im Export redigiert", () => {
    const privatePkg = draftValidPackage({
      title: "Zweites Testpaket mit Brand-Kit",
      brandKitReference: { brandKitId: "geheimer-brand-kit-123", confirmedSelected: true },
    });
    canvaStore.savePackage(paths, privatePkg);
    const withBrandKit = canvaBackup.exportCanvaBackup({ appSupportDir: paths.appSupportDir });
    const found = withBrandKit.jobPackages.find((entry) => entry.jobPackageId === privatePkg.jobPackageId);
    assert.ok(found);
    assert.notStrictEqual(found.brandKitReference.brandKitId, "geheimer-brand-kit-123");
    const text = JSON.stringify(withBrandKit);
    assert.ok(!text.includes("geheimer-brand-kit-123"));
  });

  check("Validierung lehnt unerwartete Wurzelfelder ab", () => {
    const tampered = { ...exported, injectedField: "x" };
    const validation = canvaBackup.validateCanvaBackup(tampered);
    assert.strictEqual(validation.ok, false);
  });

  check("Validierung lehnt Sicherung mit Geheimnismuster ab", () => {
    const tampered = JSON.parse(JSON.stringify(exported));
    tampered.jobPackages[0].usageNoteInjection = "apiKey: sk-abcdefghijklmnop";
    const validation = canvaBackup.validateCanvaBackup(tampered);
    assert.strictEqual(validation.ok, false);
  });

  // 99. Restore startet nichts.
  const preview = canvaBackup.previewCanvaBackupRestore(exported);
  check("99a. Restore-Vorschau startet keine Generierung, kein Design, keine Editing-Transaktion, keine Veröffentlichung", () => {
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.startedGeneration, false);
    assert.strictEqual(preview.createdDesign, false);
    assert.strictEqual(preview.startedEditingTransaction, false);
    assert.strictEqual(preview.savedEdit, false);
    assert.strictEqual(preview.publishedAnything, false);
    assert.strictEqual(preview.downloadedAssets, false);
    assert.strictEqual(preview.resetApprovals, false);
    assert.strictEqual(preview.writesAppliedToLiveStore, false);
  });

  const applied = canvaBackup.applyCanvaBackupRestore(exported, { appSupportDir: paths.appSupportDir });
  check("99b. applyCanvaBackupRestore startet keine Generierung, kein Design, keine Veröffentlichung", () => {
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.startedGeneration, false);
    assert.strictEqual(applied.createdDesign, false);
    assert.strictEqual(applied.startedEditingTransaction, false);
    assert.strictEqual(applied.savedEdit, false);
    assert.strictEqual(applied.publishedAnything, false);
    assert.strictEqual(applied.downloadedAssets, false);
    assert.strictEqual(applied.resetApprovals, false);
  });

  check("Restore setzt keine bestehende Freigabe zurück (Felder bleiben identisch)", () => {
    const approvedPkg = {
      ...draftValidPackage({ title: "Freigegebenes Testpaket" }),
      briefingApproved: true,
      assetsAndRightsApproved: true,
      externalTransferApproved: true,
      internalCostApprovalStatus: "WITHIN_APPROVED_LIMIT",
    };
    canvaStore.savePackage(paths, approvedPkg);
    const exportWithApproval = canvaBackup.exportCanvaBackup({ appSupportDir: paths.appSupportDir });
    canvaBackup.applyCanvaBackupRestore(exportWithApproval, { appSupportDir: paths.appSupportDir });
    const reloaded = canvaStore.loadPackage(paths, approvedPkg.jobPackageId);
    assert.strictEqual(reloaded.briefingApproved, true);
    assert.strictEqual(reloaded.assetsAndRightsApproved, true);
    assert.strictEqual(reloaded.externalTransferApproved, true);
    assert.strictEqual(reloaded.internalCostApprovalStatus, "WITHIN_APPROVED_LIMIT");
  });

  // 100. abgelaufener Auftrag STALE.
  check("100. abgelaufener Auftrag wird beim Restore auf STALE markiert", () => {
    const isolatedPaths = makeIsolatedPaths();
    const expiredPkg = { ...draftValidPackage(), expiresAt: new Date(Date.now() - 60_000).toISOString() };
    canvaStore.savePackage(isolatedPaths, expiredPkg);
    const expiredExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(expiredExport.jobPackages[0].status, "DRAFT");
    const restoreResult = canvaBackup.applyCanvaBackupRestore(expiredExport, { appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(restoreResult.staleMarkedCount, 1);
    const reloaded = canvaStore.loadPackage(isolatedPaths, expiredPkg.jobPackageId);
    assert.strictEqual(reloaded.status, "STALE");
  });

  check("abgelaufenes, bereits terminales Paket (CANCELLED) wird nicht überschrieben", () => {
    const isolatedPaths = makeIsolatedPaths();
    const cancelledPkg = {
      ...draftValidPackage(),
      status: "CANCELLED",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    canvaStore.savePackage(isolatedPaths, cancelledPkg);
    const cancelledExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    canvaBackup.applyCanvaBackupRestore(cancelledExport, { appSupportDir: isolatedPaths.appSupportDir });
    const reloaded = canvaStore.loadPackage(isolatedPaths, cancelledPkg.jobPackageId);
    assert.strictEqual(reloaded.status, "CANCELLED");
  });

  check("Ergebnis-Metadaten werden exportiert und enthalten keine Provider-Rohantworten", () => {
    const isolatedPaths = makeIsolatedPaths();
    const resultPkg = draftValidPackage();
    canvaStore.savePackage(isolatedPaths, resultPkg);
    const resultRecord = {
      jobPackageId: resultPkg.jobPackageId,
      provider: "Canva",
      providerOperation: "GENERATE_DESIGN_CANDIDATES",
      providerJobId: "provider-job-1",
      candidateIds: ["cand-1"],
      selectedCandidateId: null,
      designId: null,
      editingTransactionId: null,
      providerStatus: "CANDIDATES_READY",
      localValidationStatus: "STRUCTURALLY_VALID",
      previewReference: null,
      editReference: null,
      viewReference: null,
      pageCount: 1,
      designType: "INSTAGRAM_POST",
      completedAt: new Date().toISOString(),
      failureCode: null,
      failureMessage: null,
      costStatus: "NOT_BILLABLE_TEST",
      usageNote: "Testlauf",
      source: "MANUAL_PASTE",
      providerClaimedStatus: "CANDIDATES_READY",
      locallyVerifiedSuccess: true,
      jamalAcceptanceStatus: "PENDING",
      publicationApproved: false,
      verifiedAt: new Date().toISOString(),
      resultFingerprint: "abc123",
      providerRawResponse: { shouldNeverAppear: true },
    };
    canvaStore.saveResult(isolatedPaths, resultPkg.jobPackageId, resultRecord);
    const resultExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(resultExport.jobResults.length, 1);
    assert.strictEqual(resultExport.jobResults[0].providerJobId, "provider-job-1");
    assert.ok(!Object.prototype.hasOwnProperty.call(resultExport.jobResults[0], "providerRawResponse"));
  });

  check("Export enthält Mandanten-, Kosten- und Kundenfreigabefelder des Jobpakets", () => {
    const entry = exported.jobPackages.find((p) => p.jobPackageId === pkg.jobPackageId);
    assert.strictEqual(entry.customerId, "test-customer-fiktives-cafe");
    assert.strictEqual(entry.brandId, "test-brand-fiktives-cafe");
    assert.strictEqual(entry.campaignId, "test-campaign-fiktives-cafe-pilot");
    assert.ok(entry.canvaFolderReference);
    assert.strictEqual(entry.canvaFolderReference.status, "PLANNED_NOT_CREATED");
    assert.ok(entry.billableUnit);
    assert.strictEqual(entry.costPackageStatus, "UNKNOWN");
    assert.strictEqual(entry.customerDraftApprovalStatus, "PENDING");
  });

  check("Ergebnis-Export enthält die vom Jobpaket abgeleitete Mandantenbindung", () => {
    const isolatedPaths = makeIsolatedPaths();
    const resultPkg = draftValidPackage();
    canvaStore.savePackage(isolatedPaths, resultPkg);
    canvaStore.saveResult(isolatedPaths, resultPkg.jobPackageId, {
      jobPackageId: resultPkg.jobPackageId,
      provider: "Canva",
      providerOperation: "GENERATE_DESIGN_CANDIDATES",
      providerJobId: "provider-job-tenant-1",
      providerStatus: "CANDIDATES_READY",
    });
    const resultExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    const resultEntry = resultExport.jobResults.find((r) => r.jobPackageId === resultPkg.jobPackageId);
    assert.strictEqual(resultEntry.customerId, "test-customer-fiktives-cafe");
    assert.strictEqual(resultEntry.brandId, "test-brand-fiktives-cafe");
    assert.strictEqual(resultEntry.campaignId, "test-campaign-fiktives-cafe-pilot");
  });

  check("Restore-Vorschau zeigt betroffene Kunden-IDs, ohne sie zu verändern", () => {
    const restorePreview = canvaBackup.previewCanvaBackupRestore(exported);
    assert.ok(restorePreview.preview.affectedCustomerIds.includes("test-customer-fiktives-cafe"));
  });

  check("Restore kann eine Mandanten-Neuzuordnung nicht durchsetzen (bestehendes Paket bleibt beim Ursprungskunden)", () => {
    const isolatedPaths = makeIsolatedPaths();
    const originalPkg = draftValidPackage();
    canvaStore.savePackage(isolatedPaths, originalPkg);
    const cleanExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    const tamperedExport = {
      ...cleanExport,
      jobPackages: cleanExport.jobPackages.map((entry) =>
        entry.jobPackageId === originalPkg.jobPackageId
          ? { ...entry, customerId: "test-customer-fiktives-fitnessstudio" }
          : entry,
      ),
    };
    const result = canvaBackup.applyCanvaBackupRestore(tamperedExport, { appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(result.ok, true);
    assert.ok(result.rejectedJobPackageIds.includes(originalPkg.jobPackageId));
    assert.strictEqual(result.tenantSeparationPreserved, true);
    const reloaded = canvaStore.loadPackage(isolatedPaths, originalPkg.jobPackageId);
    assert.strictEqual(reloaded.customerId, "test-customer-fiktives-cafe");
  });

  check("Editing-Transaktionen werden exportiert, aber ohne konkrete Operationen/Vorschau-URL", () => {
    const isolatedPaths = makeIsolatedPaths();
    const editPkg = draftValidPackage();
    canvaStore.savePackage(isolatedPaths, editPkg);
    canvaStore.saveEditingTransaction(isolatedPaths, {
      editingTransactionId: "canva-edit-export-test",
      jobPackageId: editPkg.jobPackageId,
      designId: "design-export-test",
      customerId: editPkg.customerId,
      brandId: editPkg.brandId,
      campaignId: editPkg.campaignId,
      status: "PREVIEW_READY",
      operations: [{ op: "REPLACE_TEXT", secretValue: "sollte-nicht-exportiert-werden" }],
      operationsFingerprint: "fp-edit-1",
      previewReference: "https://static.canva.example/preview.png",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const editExport = canvaBackup.exportCanvaBackup({ appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(editExport.editingTransactions.length, 1);
    const entry = editExport.editingTransactions[0];
    assert.strictEqual(entry.status, "PREVIEW_READY");
    assert.ok(!Object.prototype.hasOwnProperty.call(entry, "operations"));
    assert.ok(!Object.prototype.hasOwnProperty.call(entry, "previewReference"));
    const text = JSON.stringify(editExport);
    assert.ok(!text.includes("sollte-nicht-exportiert-werden"));
  });

  console.log(`canva-backup.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests();
