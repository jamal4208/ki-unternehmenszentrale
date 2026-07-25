"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const heygenBackup = require("./heygen-backup");
const heygenStore = require("./heygen-store");
const heygenJobPackage = require("./heygen-job-package");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "heygen-backup-test-"));
  return heygenStore.resolveHeygenStorePaths({ appSupportDir });
}

function draftValidPackage(overrides = {}) {
  const prepared = heygenJobPackage.prepareHeygenJobPackage({
    projectId: "ki-unternehmenszentrale",
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

function runTests() {
  const paths = makeIsolatedPaths();

  // 1. Store-Grundfunktion: Speichern und Laden eines Pakets (Rundlauf).
  const pkg = draftValidPackage();
  heygenStore.savePackage(paths, pkg);
  check("Store: Jobpaket wird gespeichert und unverändert geladen", () => {
    const loaded = heygenStore.loadPackage(paths, pkg.jobPackageId);
    assert.strictEqual(loaded.jobPackageId, pkg.jobPackageId);
    assert.strictEqual(loaded.title, pkg.title);
  });

  check("Store: gespeichertes Paket erscheint in listPackages", () => {
    const list = heygenStore.listPackages(paths);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].jobPackageId, pkg.jobPackageId);
  });

  // 61. Metadaten exportiert.
  const exported = heygenBackup.exportHeygenBackup({ appSupportDir: paths.appSupportDir });
  check("61. Jobpaket-Metadaten werden exportiert", () => {
    assert.strictEqual(exported.jobPackages.length, 1);
    assert.strictEqual(exported.jobPackages[0].jobPackageId, pkg.jobPackageId);
    assert.strictEqual(exported.jobPackages[0].script, pkg.script);
  });

  // 62. Videos ausgeschlossen (es gibt keine Binärfelder im Modell; Export
  // enthält daher niemals Video-/Bild-/Audioinhalte, nur die Allowlist).
  check("62. Export enthält keine Binär-/Videofelder", () => {
    const keys = Object.keys(exported.jobPackages[0]);
    ["videoBuffer", "imageBuffer", "audioBuffer", "fileBuffer", "base64Content"].forEach((forbidden) => {
      assert.ok(!keys.includes(forbidden), `Feld ${forbidden} darf nicht exportiert werden`);
    });
  });

  // 63. Tokens ausgeschlossen.
  check("63. Export enthält keine Tokens", () => {
    const text = JSON.stringify(exported);
    assert.ok(!/"token"\s*:/i.test(text));
  });

  // 64. Credentials ausgeschlossen.
  check("64. Export enthält keine Credentials/API-Keys", () => {
    const text = JSON.stringify(exported);
    assert.ok(!/"apiKey"\s*:/i.test(text));
    assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/i.test(text));
  });

  check("private Avatar-Asset wird im Export redigiert", () => {
    const privatePkg = draftValidPackage({
      avatarReference: { avatarId: "geheimer-avatar-id-123", visibility: "PRIVATE", consentReference: "Zustimmung Doku #7" },
      avatarConsentConfirmed: true,
    });
    heygenStore.savePackage(paths, privatePkg);
    const withPrivate = heygenBackup.exportHeygenBackup({ appSupportDir: paths.appSupportDir });
    const found = withPrivate.jobPackages.find((entry) => entry.jobPackageId === privatePkg.jobPackageId);
    assert.ok(found);
    assert.notStrictEqual(found.avatarReference.avatarId, "geheimer-avatar-id-123");
    assert.strictEqual(found.avatarReference.visibility, "PRIVATE");
    const text = JSON.stringify(withPrivate);
    assert.ok(!text.includes("geheimer-avatar-id-123"));
    assert.ok(!text.includes("Zustimmung Doku #7"), "consentReference (Governance-Notiz) darf nicht exportiert werden");
  });

  check("Validierung lehnt unerwartete Wurzelfelder ab", () => {
    const tampered = { ...exported, injectedField: "x" };
    const validation = heygenBackup.validateHeygenBackup(tampered);
    assert.strictEqual(validation.ok, false);
  });

  check("Validierung lehnt Sicherung mit Geheimnismuster ab", () => {
    const tampered = JSON.parse(JSON.stringify(exported));
    tampered.jobPackages[0].usageNoteInjection = "apiKey: sk-abcdefghijklmnop";
    const validation = heygenBackup.validateHeygenBackup(tampered);
    assert.strictEqual(validation.ok, false);
  });

  // 65. Restore startet nichts.
  const preview = heygenBackup.previewHeygenBackupRestore(exported);
  check("65a. Restore-Vorschau startet keinen Job, kein Hand-off, keine Veröffentlichung, keinen Kauf", () => {
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.startedHeygenJob, false);
    assert.strictEqual(preview.repeatedHandoff, false);
    assert.strictEqual(preview.publishedAnything, false);
    assert.strictEqual(preview.purchasedAnything, false);
    assert.strictEqual(preview.resetApprovals, false);
    assert.strictEqual(preview.writesAppliedToLiveStore, false);
  });

  const applied = heygenBackup.applyHeygenBackupRestore(exported, { appSupportDir: paths.appSupportDir });
  check("65b. applyHeygenBackupRestore startet keinen Job, kein Hand-off, keine Veröffentlichung, keinen Kauf", () => {
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.startedHeygenJob, false);
    assert.strictEqual(applied.repeatedHandoff, false);
    assert.strictEqual(applied.publishedAnything, false);
    assert.strictEqual(applied.purchasedAnything, false);
    assert.strictEqual(applied.resetApprovals, false);
  });

  check("Restore setzt keine bestehende Freigabe zurück (Felder bleiben identisch)", () => {
    const approvedPkg = { ...draftValidPackage(), contentApproved: true, externalTransferApproved: true, costApprovalStatus: "WITHIN_APPROVED_LIMIT" };
    heygenStore.savePackage(paths, approvedPkg);
    const exportWithApproval = heygenBackup.exportHeygenBackup({ appSupportDir: paths.appSupportDir });
    heygenBackup.applyHeygenBackupRestore(exportWithApproval, { appSupportDir: paths.appSupportDir });
    const reloaded = heygenStore.loadPackage(paths, approvedPkg.jobPackageId);
    assert.strictEqual(reloaded.contentApproved, true);
    assert.strictEqual(reloaded.externalTransferApproved, true);
    assert.strictEqual(reloaded.costApprovalStatus, "WITHIN_APPROVED_LIMIT");
  });

  // 66. abgelaufenes Paket STALE.
  check("66. abgelaufenes Paket wird beim Restore auf STALE markiert", () => {
    const isolatedPaths = makeIsolatedPaths();
    const expiredPkg = { ...draftValidPackage(), expiresAt: new Date(Date.now() - 60_000).toISOString() };
    heygenStore.savePackage(isolatedPaths, expiredPkg);
    const expiredExport = heygenBackup.exportHeygenBackup({ appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(expiredExport.jobPackages[0].status, "DRAFT");
    const restoreResult = heygenBackup.applyHeygenBackupRestore(expiredExport, { appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(restoreResult.staleMarkedCount, 1);
    const reloaded = heygenStore.loadPackage(isolatedPaths, expiredPkg.jobPackageId);
    assert.strictEqual(reloaded.status, "STALE");
  });

  check("abgelaufenes, bereits terminales Paket (SUCCEEDED) wird nicht überschrieben", () => {
    const isolatedPaths = makeIsolatedPaths();
    const succeededPkg = {
      ...draftValidPackage(),
      status: "SUCCEEDED",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    heygenStore.savePackage(isolatedPaths, succeededPkg);
    const succeededExport = heygenBackup.exportHeygenBackup({ appSupportDir: isolatedPaths.appSupportDir });
    heygenBackup.applyHeygenBackupRestore(succeededExport, { appSupportDir: isolatedPaths.appSupportDir });
    const reloaded = heygenStore.loadPackage(isolatedPaths, succeededPkg.jobPackageId);
    assert.strictEqual(reloaded.status, "SUCCEEDED");
  });

  check("Ergebnis-Metadaten werden exportiert und enthalten keine Provider-Rohantworten", () => {
    const isolatedPaths = makeIsolatedPaths();
    const resultPkg = draftValidPackage();
    heygenStore.savePackage(isolatedPaths, resultPkg);
    const resultRecord = {
      jobPackageId: resultPkg.jobPackageId,
      provider: "HeyGen",
      providerJobId: "provider-job-1",
      status: "SUCCEEDED",
      videoReference: "https://videos.example.com/result.mp4",
      thumbnailReference: null,
      subtitleReference: null,
      durationSeconds: 14,
      failureCode: null,
      failureMessage: null,
      costStatus: "WITHIN_APPROVED_LIMIT",
      usageNote: "Testlauf",
      source: "MANUAL_PASTE",
      providerClaimedStatus: "SUCCEEDED",
      locallyVerifiedSuccess: true,
      jamalAcceptanceStatus: "PENDING",
      publicationApproved: false,
      verifiedAt: new Date().toISOString(),
      resultFingerprint: "abc123",
      providerRawResponse: { shouldNeverAppear: true },
    };
    heygenStore.saveResult(isolatedPaths, resultPkg.jobPackageId, resultRecord);
    const resultExport = heygenBackup.exportHeygenBackup({ appSupportDir: isolatedPaths.appSupportDir });
    assert.strictEqual(resultExport.jobResults.length, 1);
    assert.strictEqual(resultExport.jobResults[0].providerJobId, "provider-job-1");
    assert.ok(!Object.prototype.hasOwnProperty.call(resultExport.jobResults[0], "providerRawResponse"));
  });

  console.log(`heygen-backup.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests();
