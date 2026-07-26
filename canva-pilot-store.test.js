"use strict";

// V7.1 Phase C.1 – Tests für die isolierte Ablage der kanonischen
// Pilot-Ergebnisakte (Auftrag Abschnitt I, Pflichttest 12: Kunde A kann
// Kunde B nicht lesen).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const canvaPilotStore = require("./canva-pilot-store");
const canvaPilotResultRecord = require("./canva-pilot-result-record");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "canva-pilot-store-test-"));
  return canvaPilotStore.resolveCanvaPilotStorePaths({ appSupportDir });
}

function pilotRecordFor(overrides = {}) {
  return canvaPilotResultRecord.createPilotResultRecord({
    pilotId: overrides.pilotId || "pilot-a",
    customerId: overrides.customerId || "test-customer-a",
    brandId: overrides.brandId || "test-brand-a",
    campaignId: overrides.campaignId || "test-campaign-a",
    projectId: "ki-unternehmenszentrale",
    jobPackageId: "UNKNOWN",
    providerJobId: "UNKNOWN",
    candidateId: "candidate-1",
    designId: "DESIGN-1",
    designTitle: "Test",
    designType: "INSTAGRAM_POST",
    pageCount: 1,
    costPackageStatus: "NOT_BILLABLE_TEST",
    providerExecutionStatus: "SAVED",
    internalReviewStatus: "NOT_REVIEWED",
    customerReviewStatus: "NOT_READY",
    ...overrides,
  });
}

check("Pilot-Ergebnisakte wird gespeichert und unverändert geladen", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor();
  canvaPilotStore.savePilotResultRecord(paths, record);
  const loaded = canvaPilotStore.loadPilotResultRecord(paths, record.pilotId);
  assert.strictEqual(loaded.pilotId, record.pilotId);
  assert.strictEqual(loaded.designId, record.designId);
  assert.strictEqual(loaded.immutableTenantFingerprint, record.immutableTenantFingerprint);
});

check("gespeicherte Pilot-Ergebnisakte erscheint in listPilotResultRecords", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor();
  canvaPilotStore.savePilotResultRecord(paths, record);
  const list = canvaPilotStore.listPilotResultRecords(paths, {});
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].pilotId, record.pilotId);
});

check("12. Kunde A kann Kunde B nicht über eine kundengebundene Liste lesen", () => {
  const paths = makeIsolatedPaths();
  const recordA = pilotRecordFor({ pilotId: "pilot-kunde-a", customerId: "kunde-a", brandId: "marke-a", campaignId: "kampagne-a" });
  const recordB = pilotRecordFor({ pilotId: "pilot-kunde-b", customerId: "kunde-b", brandId: "marke-b", campaignId: "kampagne-b" });
  canvaPilotStore.savePilotResultRecord(paths, recordA);
  canvaPilotStore.savePilotResultRecord(paths, recordB);

  const listForA = canvaPilotStore.listPilotResultRecords(paths, { customerId: "kunde-a" });
  assert.strictEqual(listForA.length, 1);
  assert.strictEqual(listForA[0].pilotId, "pilot-kunde-a");
  assert.ok(!listForA.some((entry) => entry.customerId === "kunde-b"), "Kunde B darf in Kunde-A-Liste nicht auftauchen.");

  const listForB = canvaPilotStore.listPilotResultRecords(paths, { customerId: "kunde-b" });
  assert.strictEqual(listForB.length, 1);
  assert.strictEqual(listForB[0].pilotId, "pilot-kunde-b");
});

check("eine bereits gespeicherte Pilot-Ergebnisakte kann nicht auf einen anderen Kunden umgestellt werden", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor({ pilotId: "pilot-fest", customerId: "kunde-a" });
  canvaPilotStore.savePilotResultRecord(paths, record);
  const reassigned = { ...record, customerId: "kunde-b" };
  assert.throws(() => canvaPilotStore.savePilotResultRecord(paths, reassigned), /nicht umgestellt werden|Kunde/);
  const stillA = canvaPilotStore.loadPilotResultRecord(paths, "pilot-fest");
  assert.strictEqual(stillA.customerId, "kunde-a");
});

check("eine bereits gespeicherte Pilot-Ergebnisakte kann ihren unveränderlichen Mandanten-Fingerprint nicht überschreiben", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor({ pilotId: "pilot-fp" });
  canvaPilotStore.savePilotResultRecord(paths, record);
  const tampered = { ...record, immutableTenantFingerprint: "manipulated-fingerprint" };
  assert.throws(() => canvaPilotStore.savePilotResultRecord(paths, tampered));
});

check("loadPilotResultRecord liefert null für unbekannte pilotId", () => {
  const paths = makeIsolatedPaths();
  assert.strictEqual(canvaPilotStore.loadPilotResultRecord(paths, "unbekannt"), null);
});

check("safeId lehnt Pfad-artige pilotId ab (keine Directory-Traversal)", () => {
  const paths = makeIsolatedPaths();
  assert.throws(() => canvaPilotStore.savePilotResultRecord(paths, pilotRecordFor({ pilotId: "../../etc/passwd" })));
});

// ---------------------------------------------------------------------------
// V7.1 Phase C.1.1 – Reviewmodell-/Tarifschutz an der Persistenzgrenze.
// ---------------------------------------------------------------------------

check("C.1.1-10. Mandantenwechsel bleibt blockiert (auch nach Reviewmodell-Erweiterung)", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor({
    pilotId: "pilot-tier-fest",
    customerId: "kunde-a",
    serviceTier: "STANDARD",
    reviewMode: "CUSTOMER_SELF_REVIEW",
  });
  canvaPilotStore.savePilotResultRecord(paths, record);
  assert.throws(
    () => canvaPilotStore.savePilotResultRecord(paths, { ...record, customerId: "kunde-b" }),
    /nicht umgestellt werden|Kunde/,
  );
});

check("C.1.1-9b. stillschweigender Reviewmoduswechsel (ohne Eskalation) wird abgewiesen", () => {
  const paths = makeIsolatedPaths();
  const record = pilotRecordFor({
    pilotId: "pilot-mode-fest",
    serviceTier: "STANDARD",
    reviewMode: "CUSTOMER_SELF_REVIEW",
  });
  canvaPilotStore.savePilotResultRecord(paths, record);
  assert.throws(
    () => canvaPilotStore.savePilotResultRecord(paths, { ...record, reviewMode: "OWNER_REVIEW" }),
    /nicht stillschweigend|Reviewmodus/,
  );
});

check("C.1.1-9c. ausdrückliche Eskalation (reviewMode -> RISK_ESCALATION) bleibt speicherbar", () => {
  const paths = makeIsolatedPaths();
  let record = pilotRecordFor({
    pilotId: "pilot-escalate-ok",
    serviceTier: "STANDARD",
    reviewMode: "CUSTOMER_SELF_REVIEW",
  });
  canvaPilotStore.savePilotResultRecord(paths, record);
  record = canvaPilotResultRecord.escalate(record, { reason: "Risikofund" });
  const saved = canvaPilotStore.savePilotResultRecord(paths, record);
  assert.strictEqual(saved.reviewMode, "RISK_ESCALATION");
  assert.strictEqual(saved.qualityReviewStatus, "ESCALATED");
});

check("C.1.1. Tarifwechsel nach Kundenfreigabe wird blockiert", () => {
  const paths = makeIsolatedPaths();
  let record = pilotRecordFor({
    pilotId: "pilot-approved-tier",
    serviceTier: "STANDARD",
    reviewMode: "CUSTOMER_SELF_REVIEW",
  });
  record = canvaPilotResultRecord.recordAgentQaResult(record, {
    result: "PASS",
    checklist: {
      briefingFulfilled: true,
      mainMessageVisible: true,
      mandatoryTextsPresent: true,
      noPlaceholderText: true,
      readabilitySufficient: true,
      imageMessageConsistent: true,
      noProhibitedContent: true,
      rightsAndPrivacyStatusUnchanged: true,
      noPublicationTriggered: true,
    },
  });
  record = canvaPilotResultRecord.approveByCustomer(record);
  canvaPilotStore.savePilotResultRecord(paths, record);
  assert.throws(
    () => canvaPilotStore.savePilotResultRecord(paths, { ...record, serviceTier: "PREMIUM" }),
    /Tarifwechsel|freigegeben/,
  );
});

console.log(`canva-pilot-store.test.js: ${passed} Prüfpunkte erfolgreich`);
