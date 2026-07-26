"use strict";

// V7.1 Phase C.1 – Tests für die kanonische Pilot-Ergebnisakte und die
// kontrollierte Kundenfeedback-Schleife (Auftrag Abschnitt I, Pflichttests
// 1-11 sowie 15 strukturell über den Quelltext).

const assert = require("assert");

const m = require("./canva-pilot-result-record");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const TEST_CUSTOMER_ID = "test-customer-fiktives-cafe-amore";
const TEST_BRAND_ID = "test-brand-cafe-amore";
const TEST_CAMPAIGN_ID = "test-campaign-cafe-amore-sonntagsfruehstueck";
const TEST_PROJECT_ID = "ki-unternehmenszentrale";

function validPilotInput(overrides = {}) {
  return {
    pilotId: "pilot-test-001",
    toolId: "canva",
    connectorType: "CONTROLLED_HANDOFF",
    customerId: TEST_CUSTOMER_ID,
    brandId: TEST_BRAND_ID,
    campaignId: TEST_CAMPAIGN_ID,
    projectId: TEST_PROJECT_ID,
    jobPackageId: "UNKNOWN",
    providerJobId: "UNKNOWN",
    candidateId: "candidate-2",
    designId: "DESIGN-ABC123",
    designTitle: "Testdesign",
    designType: "INSTAGRAM_POST",
    pageCount: 1,
    costPackageStatus: "NOT_BILLABLE_TEST",
    providerExecutionStatus: "SAVED",
    internalReviewStatus: "NOT_REVIEWED",
    customerReviewStatus: "NOT_READY",
    ...overrides,
  };
}

function readyForCustomerReviewRecord() {
  let record = m.createPilotResultRecord(validPilotInput());
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  return record;
}

// ---------------------------------------------------------------------------
// 1. reale Pilotakte (kanonische, hartkodierte Seed-Daten).
// ---------------------------------------------------------------------------

check("1. reale Pilotakte enthält exakt die berichteten kanonischen Pilotdaten", () => {
  const seed = m.buildRealPilotResultRecordSeed();
  assert.strictEqual(seed.designId, "DAHQeIjc2ls");
  assert.strictEqual(seed.designTitle, "Instagram-Beitrag - Sonntagsfrühstück");
  assert.strictEqual(seed.designType, "INSTAGRAM_POST");
  assert.strictEqual(seed.pageCount, 1);
  assert.strictEqual(seed.costPackageStatus, "NOT_BILLABLE_TEST");
  assert.strictEqual(seed.providerExecutionStatus, "SAVED");
  assert.strictEqual(seed.internalReviewStatus, "REVIEWED_WITH_NOTES");
  assert.strictEqual(seed.customerReviewStatus, "CHANGES_POSSIBLE");
  assert.strictEqual(seed.publicationApprovalStatus, "NOT_APPROVED");
  assert.strictEqual(seed.connectorType, "CONTROLLED_HANDOFF");
  assert.ok(seed.evidence.length > 0, "Jamals reale Bewertung muss als Evidence vorliegen.");
});

check("1b. reale Pilotakte enthält keine edit-/view-URL als öffentliche Wahrheit", () => {
  const seed = m.buildRealPilotResultRecordSeed();
  const serialized = JSON.stringify(seed);
  assert.ok(!/https?:\/\//i.test(serialized), "Es darf keine gespeicherte http(s)-URL im Datensatz vorkommen.");
});

// ---------------------------------------------------------------------------
// 2. Design-ID ≠ Candidate-ID.
// ---------------------------------------------------------------------------

check("2. designId identisch mit candidateId wird abgelehnt (Candidate-ID ist keine Design-ID)", () => {
  const { reasons } = m.validatePilotResultRecordInput(validPilotInput({ candidateId: "same-id", designId: "same-id" }));
  assert.ok(reasons.some((r) => /candidateId/.test(r)));
});

check("2b. createPilotResultRecord wirft bei designId === candidateId", () => {
  assert.throws(() => m.createPilotResultRecord(validPilotInput({ candidateId: "same-id", designId: "same-id" })));
});

// ---------------------------------------------------------------------------
// 3. Mandantenbindung.
// ---------------------------------------------------------------------------

check("3. fehlende Mandantenbindung (customerId) wird bei der Erstellung abgelehnt", () => {
  assert.throws(() => m.createPilotResultRecord(validPilotInput({ customerId: null })));
});

check("3b. unvollständige Mandantenbindung blockiert den Eintritt in die Kundenfeedback-Schleife", () => {
  // Eine unvollständige Mandantenbindung wird bereits bei der Erstellung
  // hart abgelehnt (siehe Test 3). Um das Gate selbst (nicht nur die
  // Ersterstellung) zu prüfen, wird ein bereits gültiger Datensatz
  // nachträglich manipuliert (z. B. durch eine beschädigte Ablage) – das
  // Gate muss auch dann zuverlässig blockieren.
  let record = m.createPilotResultRecord(validPilotInput());
  record = { ...record, campaignId: null };
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  // Gate nicht erfüllt (Mandant unvollständig) -> Status bleibt NOT_READY.
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
});

// ---------------------------------------------------------------------------
// 4. Feedback nur für richtigen Mandanten (Foreign-Key-artige Bindung statt
// vom Aufrufer übernommener Werte).
// ---------------------------------------------------------------------------

check("4. Kundenfeedback wird zwingend an den Mandanten der Akte gebunden, nicht an Aufrufer-Angaben", () => {
  const record = readyForCustomerReviewRecord();
  const updated = m.recordCustomerFeedback(record, {
    feedbackText: "Testfeedback",
    feedbackType: "GENERAL_FEEDBACK",
    createdByRole: "CUSTOMER",
    // Versuchte Fremdangaben werden ignoriert, da recordCustomerFeedback
    // customerId/brandId/campaignId/projectId strukturell nur aus record
    // ableitet (kein solches Feld wird überhaupt aus input übernommen).
  });
  const entry = updated.feedbackHistory[0];
  assert.strictEqual(entry.customerId, record.customerId);
  assert.strictEqual(entry.brandId, record.brandId);
  assert.strictEqual(entry.campaignId, record.campaignId);
  assert.strictEqual(entry.projectId, record.projectId);
});

// ---------------------------------------------------------------------------
// 5. Feedback ohne Design-ID blockiert.
// ---------------------------------------------------------------------------

check("5. Kundenfeedback ohne echte Design-ID wird blockiert", () => {
  const record = m.createPilotResultRecord(
    validPilotInput({ designId: null, providerExecutionStatus: "CANDIDATES_READY" }),
  );
  assert.throws(() => m.recordCustomerFeedback(record, { feedbackText: "x" }), /Design-ID/);
});

// ---------------------------------------------------------------------------
// 6. Kundenfeedback löst keine Veröffentlichung aus.
// ---------------------------------------------------------------------------

check("6. Kundenfeedback ändert publicationApprovalStatus nicht", () => {
  const record = readyForCustomerReviewRecord();
  const updated = m.recordCustomerFeedback(record, { feedbackText: "Bitte Kaffee größer", feedbackType: "IMAGE_CHANGE" });
  assert.strictEqual(updated.publicationApprovalStatus, "NOT_APPROVED");
});

// ---------------------------------------------------------------------------
// 7. Kundenfreigabe löst keine Veröffentlichung aus.
// ---------------------------------------------------------------------------

check("7. approveByCustomer setzt customerReviewStatus, aber niemals publicationApprovalStatus", () => {
  const record = readyForCustomerReviewRecord();
  const approved = m.approveByCustomer(record);
  assert.strictEqual(approved.customerReviewStatus, "CUSTOMER_APPROVED");
  assert.strictEqual(approved.publicationApprovalStatus, "NOT_APPROVED");
});

check("7b. es existiert keine exportierte Funktion, die publicationApprovalStatus verändern kann", () => {
  const source = require("fs").readFileSync(require.resolve("./canva-pilot-result-record.js"), "utf8");
  // Der einzige Ort, an dem publicationApprovalStatus zugewiesen wird, muss
  // stets auf den festen String "NOT_APPROVED" lauten.
  const assignments = [...source.matchAll(/publicationApprovalStatus\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(assignments.length > 0);
  assert.ok(assignments.every((value) => value === "NOT_APPROVED"));
});

// ---------------------------------------------------------------------------
// 8. Änderungsanforderung löst keine Canva-Aktion aus.
// ---------------------------------------------------------------------------

check("8. canva-pilot-result-record.js referenziert canva-connector.js nicht (keine Canva-Aktion möglich)", () => {
  const source = require("fs").readFileSync(require.resolve("./canva-pilot-result-record.js"), "utf8");
  assert.ok(!source.includes("canva-connector"));
  assert.ok(!/require\(["']http["']\)/.test(source));
});

check("8b. requestChanges liefert keine Token-/Handoff-/Provider-Felder zurück", () => {
  const record = readyForCustomerReviewRecord();
  const updated = m.requestChanges(record, { note: "Kaffee größer" });
  const serialized = Object.keys(updated).join(",");
  assert.ok(!/token|handoff|providerOperation/i.test(serialized));
});

// ---------------------------------------------------------------------------
// 9. Kostenstatus bleibt unverändert über den gesamten Lifecycle.
// ---------------------------------------------------------------------------

check("9. costPackageStatus bleibt über internal-review/feedback/request-changes/approve unverändert", () => {
  let record = m.createPilotResultRecord(validPilotInput({ costPackageStatus: "NOT_BILLABLE_TEST" }));
  const initialCost = record.costPackageStatus;
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  assert.strictEqual(record.costPackageStatus, initialCost);
  record = m.recordCustomerFeedback(record, { feedbackText: "x" });
  assert.strictEqual(record.costPackageStatus, initialCost);
  const feedbackId = record.feedbackHistory[0].feedbackId;
  record = m.requestChanges(record, { feedbackId, note: "y" });
  assert.strictEqual(record.costPackageStatus, initialCost);
  record = m.markReadyAfterChanges(record, {});
  assert.strictEqual(record.costPackageStatus, initialCost);
  record = m.approveByCustomer(record);
  assert.strictEqual(record.costPackageStatus, initialCost);
});

// ---------------------------------------------------------------------------
// 10. Rechtefreigaben bleiben unverändert (dieses Modul kennt gar kein
// Rechtefreigabefeld und referenziert canva-design-job-package.js
// ausschließlich lesend für Enum-Wiederverwendung, niemals für
// Freigabefunktionen).
// ---------------------------------------------------------------------------

check("10. canva-pilot-result-record.js ruft keine Rechtefreigabefunktion von canva-design-job-package.js auf", () => {
  const source = require("fs").readFileSync(require.resolve("./canva-pilot-result-record.js"), "utf8");
  assert.ok(!/approveAssetsAndRights|assetRightsConfirmed|brandRightsConfirmed/.test(source));
});

check("10b. kein Feld dieses Datensatzes trägt einen Rechte-/Rights-Bezug", () => {
  const record = m.createPilotResultRecord(validPilotInput());
  assert.ok(!Object.keys(record).some((key) => /right/i.test(key)));
});

// ---------------------------------------------------------------------------
// 11. Kundenfreigabe erst nach internem Review.
// ---------------------------------------------------------------------------

check("11. approveByCustomer ist ohne abgeschlossenes internes Review nicht erreichbar", () => {
  const record = m.createPilotResultRecord(validPilotInput()); // internalReviewStatus: NOT_REVIEWED, customerReviewStatus: NOT_READY
  assert.throws(() => m.approveByCustomer(record));
});

check("11b. approveByCustomer gelingt erst nach abgeschlossenem internem Review und erreichter Kundenreview-Stufe", () => {
  const record = readyForCustomerReviewRecord();
  assert.strictEqual(record.internalReviewStatus, "REVIEWED_WITH_NOTES");
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
  const approved = m.approveByCustomer(record);
  assert.strictEqual(approved.customerReviewStatus, "CUSTOMER_APPROVED");
});

// ---------------------------------------------------------------------------
// Zusätzliche Trennungsregeln (Auftrag Abschnitt B).
// ---------------------------------------------------------------------------

check("Änderungsanforderung ist ohne bereits erreichte Kundenreview-Stufe nicht zulässig", () => {
  const record = m.createPilotResultRecord(validPilotInput());
  assert.throws(() => m.requestChanges(record, { note: "x" }));
});

check("requestChanges setzt niemals publicationApprovalStatus", () => {
  const record = readyForCustomerReviewRecord();
  const updated = m.requestChanges(record, { note: "Kaffee größer" });
  assert.strictEqual(updated.publicationApprovalStatus, "NOT_APPROVED");
});

check("markReadyAfterChanges ist nur aus CUSTOMER_CHANGES_REQUESTED zulässig", () => {
  const record = readyForCustomerReviewRecord();
  assert.throws(() => m.markReadyAfterChanges(record, {}));
});

check("vollständiger Lifecycle: CHANGES_POSSIBLE -> READY_FOR_CUSTOMER_REVIEW -> CUSTOMER_CHANGES_REQUESTED -> READY_FOR_REVIEW_AFTER_CHANGES -> CUSTOMER_APPROVED", () => {
  let record = m.createPilotResultRecord(validPilotInput());
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
  record = m.recordCustomerFeedback(record, { feedbackText: "Kaffee größer", feedbackType: "IMAGE_CHANGE", createdByRole: "CUSTOMER" });
  const feedbackId = record.feedbackHistory[0].feedbackId;
  record = m.requestChanges(record, { feedbackId, requestedChanges: ["Kaffee größer"] });
  assert.strictEqual(record.customerReviewStatus, "CUSTOMER_CHANGES_REQUESTED");
  assert.strictEqual(record.feedbackHistory[0].status, "CHANGES_REQUESTED");
  record = m.markReadyAfterChanges(record, { note: "umgesetzt" });
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_REVIEW_AFTER_CHANGES");
  assert.strictEqual(record.feedbackHistory[0].status, "APPLIED_AND_REVIEWED");
  record = m.approveByCustomer(record);
  assert.strictEqual(record.customerReviewStatus, "CUSTOMER_APPROVED");
  assert.strictEqual(record.publicationApprovalStatus, "NOT_APPROVED");
});

check("immutableTenantFingerprint bleibt über den gesamten Lifecycle unverändert", () => {
  let record = m.createPilotResultRecord(validPilotInput());
  const fp = record.immutableTenantFingerprint;
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  record = m.recordCustomerFeedback(record, { feedbackText: "x" });
  record = m.approveByCustomer(record);
  assert.strictEqual(record.immutableTenantFingerprint, fp);
});

check("feedbackType außerhalb der erlaubten Liste wird abgelehnt", () => {
  const record = readyForCustomerReviewRecord();
  assert.throws(() => m.recordCustomerFeedback(record, { feedbackText: "x", feedbackType: "PUBLISH_NOW" }));
});

check("createdByRole außerhalb der erlaubten Liste wird abgelehnt", () => {
  const record = readyForCustomerReviewRecord();
  assert.throws(() => m.recordCustomerFeedback(record, { feedbackText: "x", createdByRole: "ADMIN" }));
});

// ---------------------------------------------------------------------------
// V7.1 Phase C.1.1 – skalierbares, rollenbasiertes Reviewmodell
// (Auftrag Abschnitt I, Pflichttests 1–14).
// ---------------------------------------------------------------------------

function standardCustomerRecord() {
  return m.createPilotResultRecord(
    validPilotInput({
      pilotId: "pilot-standard-001",
      serviceTier: "STANDARD",
      reviewMode: "CUSTOMER_SELF_REVIEW",
    }),
  );
}

function premiumCustomerRecord() {
  return m.createPilotResultRecord(
    validPilotInput({
      pilotId: "pilot-premium-001",
      serviceTier: "PREMIUM",
      reviewMode: "PREMIUM_INTERNAL_REVIEW",
    }),
  );
}

function ownerProjectRecord() {
  return m.createPilotResultRecord(
    validPilotInput({
      pilotId: "pilot-owner-001",
      serviceTier: "INTERNAL",
      reviewMode: "OWNER_REVIEW",
    }),
  );
}

const PASSING_CHECKLIST = Object.freeze({
  briefingFulfilled: true,
  mainMessageVisible: true,
  mandatoryTextsPresent: true,
  noPlaceholderText: true,
  readabilitySufficient: true,
  imageMessageConsistent: true,
  noProhibitedContent: true,
  rightsAndPrivacyStatusUnchanged: true,
  noPublicationTriggered: true,
});

check("C.1.1-1. Standardkunde benötigt keine Jamal-Prüfung (ownerReviewRequired=false, reviewMode=CUSTOMER_SELF_REVIEW)", () => {
  const record = standardCustomerRecord();
  assert.strictEqual(record.serviceTier, "STANDARD");
  assert.strictEqual(record.reviewMode, "CUSTOMER_SELF_REVIEW");
  assert.strictEqual(record.ownerReviewRequired, false);
  assert.strictEqual(record.customerSelfReviewAllowed, true);
  assert.strictEqual(record.humanReviewRequired, false);
});

check("C.1.1-2. Standardkunde benötigt bestandene Agenten-QS für READY_FOR_CUSTOMER_REVIEW", () => {
  let record = standardCustomerRecord();
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  record = m.recordAgentQaResult(record, { result: "PASS", checklist: PASSING_CHECKLIST });
  assert.strictEqual(record.qualityReviewStatus, "AGENT_QA_PASSED");
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
  // Kein internes Jamal-Review erforderlich / durchgeführt.
  assert.strictEqual(record.internalReviewStatus, "NOT_REVIEWED");
});

check("C.1.1-3. Eigenprojekt benötigt Owner-Review (Agenten-QS ersetzt Jamal-Prüfung nicht)", () => {
  let record = ownerProjectRecord();
  assert.strictEqual(record.ownerReviewRequired, true);
  assert.strictEqual(record.reviewMode, "OWNER_REVIEW");
  record = m.recordAgentQaResult(record, { result: "PASS", checklist: PASSING_CHECKLIST });
  assert.strictEqual(record.qualityReviewStatus, "AGENT_QA_PASSED");
  // Agenten-QS allein bewegt Eigenprojekt NICHT in die Kundenreview-Stufe.
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  record = m.recordInternalReview(record, { internalReviewStatus: "REVIEWED_WITH_NOTES" });
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
  assert.strictEqual(record.reviewerRole, "JAMAL_OWNER");
});

check("C.1.1-4. Premiumkunde benötigt menschliches Review vor READY_FOR_CUSTOMER_REVIEW", () => {
  let record = premiumCustomerRecord();
  assert.strictEqual(record.humanReviewRequired, true);
  assert.strictEqual(record.reviewMode, "PREMIUM_INTERNAL_REVIEW");
  record = m.recordAgentQaResult(record, { result: "PASS", checklist: PASSING_CHECKLIST });
  assert.strictEqual(record.qualityReviewStatus, "HUMAN_REVIEW_REQUIRED");
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  record = m.recordHumanReview(record, { note: "Premium-Review ok", reviewedByActorId: "reviewer-1" });
  assert.strictEqual(record.qualityReviewStatus, "HUMAN_REVIEW_COMPLETED");
  assert.strictEqual(record.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
  assert.strictEqual(record.reviewerRole, "INTERNAL_HUMAN_REVIEWER");
});

check("C.1.1-5. Risikofall eskaliert (SAVED oder beliebiger Prüfstatus -> ESCALATED)", () => {
  let record = standardCustomerRecord();
  record = m.escalate(record, { reason: "Verdacht auf Markenrechtsverletzung" });
  assert.strictEqual(record.qualityReviewStatus, "ESCALATED");
  assert.strictEqual(record.reviewMode, "RISK_ESCALATION");
  assert.strictEqual(record.riskEscalationRequired, true);
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  assert.strictEqual(record.publicationApprovalStatus, "NOT_APPROVED");
});

check("C.1.1-6. Agenten-QS FAIL blockiert Kundenreview", () => {
  let record = standardCustomerRecord();
  record = m.recordAgentQaResult(record, { result: "FAIL", note: "Platzhaltertext vorhanden" });
  assert.strictEqual(record.qualityReviewStatus, "AGENT_QA_FAILED");
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  assert.throws(() => m.approveByCustomer(record));
  assert.throws(() => m.requestChanges(record, { note: "x" }));
});

check("C.1.1-7. Agenten-QS ESCALATE blockiert Kundenreview", () => {
  let record = standardCustomerRecord();
  record = m.recordAgentQaResult(record, { result: "ESCALATE", note: "Verbotene Inhalte vermutet" });
  assert.strictEqual(record.qualityReviewStatus, "ESCALATED");
  assert.strictEqual(record.reviewMode, "RISK_ESCALATION");
  assert.strictEqual(record.customerReviewStatus, "NOT_READY");
  assert.throws(() => m.approveByCustomer(record));
});

check("C.1.1-8. Kundenfreigabe nach Agenten-QS (Standardkunde) veröffentlicht nicht", () => {
  let record = standardCustomerRecord();
  record = m.recordAgentQaResult(record, { result: "PASS", checklist: PASSING_CHECKLIST });
  const approved = m.approveByCustomer(record);
  assert.strictEqual(approved.customerReviewStatus, "CUSTOMER_APPROVED");
  assert.strictEqual(approved.publicationApprovalStatus, "NOT_APPROVED");
});

check("C.1.1-9. Reviewmoduswechsel verfälscht keine Historie (Eskalation protokolliert vorherigen Modus)", () => {
  let record = standardCustomerRecord();
  record = m.recordAgentQaResult(record, { result: "PASS", checklist: PASSING_CHECKLIST });
  const historyBefore = record.decisionHistory.length;
  const previousMode = record.reviewMode;
  record = m.escalate(record, { reason: "Nachträglicher Risikofund" });
  assert.strictEqual(record.decisionHistory.length, historyBefore + 1);
  const last = record.decisionHistory[record.decisionHistory.length - 1];
  assert.strictEqual(last.action, "ESCALATED");
  assert.strictEqual(last.previousReviewMode, previousMode);
  assert.strictEqual(last.newReviewMode, "RISK_ESCALATION");
  // Vorherige Entscheidungen bleiben unverändert erhalten.
  assert.ok(record.decisionHistory.some((entry) => entry.action === "AGENT_QA_RECORDED"));
});

check("C.1.1-11. Café-Amore-Pilot bleibt OWNER_REVIEW / INTERNAL", () => {
  const seed = m.buildRealPilotResultRecordSeed();
  assert.strictEqual(seed.serviceTier, "INTERNAL");
  assert.strictEqual(seed.reviewMode, "OWNER_REVIEW");
  assert.strictEqual(seed.ownerReviewRequired, true);
  assert.strictEqual(seed.customerSelfReviewAllowed, false);
});

check("C.1.1-12. Jamals bestehendes Review bleibt im Café-Amore-Pilot vollständig erhalten", () => {
  const seed = m.buildRealPilotResultRecordSeed();
  assert.strictEqual(seed.internalReviewStatus, "REVIEWED_WITH_NOTES");
  assert.strictEqual(seed.customerReviewStatus, "CHANGES_POSSIBLE");
  assert.strictEqual(seed.designId, "DAHQeIjc2ls");
  assert.ok(seed.evidence.length >= 12);
  assert.ok(seed.decisionHistory.some((entry) => entry.action === "INTERNAL_REVIEW_RECORDED"));
  assert.strictEqual(seed.reviewerRole, "JAMAL_OWNER");
});

check("C.1.1-13. keine Veröffentlichungsfunktion im Reviewmodell-Modul", () => {
  const source = require("fs").readFileSync(require.resolve("./canva-pilot-result-record.js"), "utf8");
  assert.ok(!/function\s+publish|approvePublication|setPublicationApproved/.test(source));
  assert.ok(!m.publish);
});

check("C.1.1-14. Agenten-QS/Human-Review/Eskalation referenzieren canva-connector.js nicht", () => {
  const source = require("fs").readFileSync(require.resolve("./canva-pilot-result-record.js"), "utf8");
  assert.ok(!source.includes("canva-connector"));
  assert.ok(typeof m.recordAgentQaResult === "function");
  assert.ok(typeof m.recordHumanReview === "function");
  assert.ok(typeof m.escalate === "function");
});

check("C.1.1. Agenten-QS-Checkliste kennt die neun verbindlichen Prüfpunkte", () => {
  assert.deepStrictEqual(
    [...m.CANVA_PILOT_AGENT_QA_CHECK_KEYS].sort(),
    [
      "briefingFulfilled",
      "imageMessageConsistent",
      "mainMessageVisible",
      "mandatoryTextsPresent",
      "noPlaceholderText",
      "noProhibitedContent",
      "noPublicationTriggered",
      "readabilitySufficient",
      "rightsAndPrivacyStatusUnchanged",
    ].sort(),
  );
});

check("C.1.1. menschliches Review ist außerhalb von PREMIUM_INTERNAL_REVIEW blockiert", () => {
  const record = standardCustomerRecord();
  assert.throws(() => m.recordHumanReview(record, { note: "x" }), /PREMIUM_INTERNAL_REVIEW/);
});

check("C.1.1. deriveReviewModelDefaults liefert die kanonischen Tarif-Defaults", () => {
  assert.deepStrictEqual(m.deriveReviewModelDefaults("STANDARD").reviewMode, "CUSTOMER_SELF_REVIEW");
  assert.deepStrictEqual(m.deriveReviewModelDefaults("PREMIUM").humanReviewRequired, true);
  assert.deepStrictEqual(m.deriveReviewModelDefaults("INTERNAL").ownerReviewRequired, true);
  assert.deepStrictEqual(m.deriveReviewModelDefaults("ESCALATED").riskEscalationRequired, true);
});

console.log(`canva-pilot-result-record.test.js: ${passed} Prüfpunkte erfolgreich`);
