"use strict";

const assert = require("assert");

const lifecycle = require("./heygen-result-lifecycle");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function verifiedResult(overrides = {}) {
  return {
    jobPackageId: "heygen-job-test-1",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    providerClaimedStatus: "SUCCEEDED",
    locallyVerifiedSuccess: true,
    ...overrides,
  };
}

check("Initialisierung leitet PROVIDER_SUCCEEDED aus dem Providerergebnis ab", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult());
  assert.strictEqual(record.customerReviewStatus, "PROVIDER_SUCCEEDED");
  assert.strictEqual(record.publicationStatus, "PUBLICATION_NOT_APPROVED");
});

check("Initialisierung ohne jobPackageId wirft", () => {
  assert.throws(() => lifecycle.initLifecycleRecord({}));
});

check("PROCESSING-Providerstatus führt zu PROVIDER_PROCESSING", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult({ providerClaimedStatus: "PROCESSING", locallyVerifiedSuccess: false }));
  assert.strictEqual(record.customerReviewStatus, "PROVIDER_PROCESSING");
});

// 36. Providererfolg ≠ lokale Validierung.
check("36. PROVIDER_SUCCEEDED bewegt sich nicht automatisch zu LOCAL_VALIDATED", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult());
  assert.strictEqual(record.customerReviewStatus, "PROVIDER_SUCCEEDED");
  assert.notStrictEqual(record.customerReviewStatus, "LOCAL_VALIDATED");
});

check("advanceToLocalValidated erfordert locallyVerifiedSuccess === true", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult());
  assert.throws(() => lifecycle.advanceToLocalValidated(record, { locallyVerifiedSuccess: false }));
  const advanced = lifecycle.advanceToLocalValidated(record, verifiedResult());
  assert.strictEqual(advanced.customerReviewStatus, "LOCAL_VALIDATED");
});

check("advanceToLocalValidated ist nur aus PROVIDER_SUCCEEDED zulässig", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult({ providerClaimedStatus: "PROCESSING", locallyVerifiedSuccess: false }));
  assert.throws(() => lifecycle.advanceToLocalValidated(record, verifiedResult()));
});

// 37. lokale Validierung ≠ internes Review.
check("37. LOCAL_VALIDATED bewegt sich nicht automatisch zu INTERNAL_REVIEW", () => {
  const record0 = lifecycle.initLifecycleRecord(verifiedResult());
  const validated = lifecycle.advanceToLocalValidated(record0, verifiedResult());
  assert.strictEqual(validated.customerReviewStatus, "LOCAL_VALIDATED");
  const reviewing = lifecycle.startInternalReview(validated);
  assert.strictEqual(reviewing.customerReviewStatus, "INTERNAL_REVIEW");
});

check("startInternalReview ist nur aus LOCAL_VALIDATED zulässig", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult());
  assert.throws(() => lifecycle.startInternalReview(record));
});

// 38. internes Review ≠ Kundenfreigabe.
check("38. markReadyForCustomerReview erfordert ein bestandenes internes Review", () => {
  const record0 = lifecycle.initLifecycleRecord(verifiedResult());
  const validated = lifecycle.advanceToLocalValidated(record0, verifiedResult());
  const reviewing = lifecycle.startInternalReview(validated);
  assert.throws(() => lifecycle.markReadyForCustomerReview(reviewing));
  const failedReview = lifecycle.completeInternalReview(reviewing, false, "Ton zu förmlich.");
  assert.throws(() => lifecycle.markReadyForCustomerReview(failedReview));
  const passedReview = lifecycle.completeInternalReview(reviewing, true, "Passt.");
  const ready = lifecycle.markReadyForCustomerReview(passedReview);
  assert.strictEqual(ready.customerReviewStatus, "READY_FOR_CUSTOMER_REVIEW");
});

function buildReadyForCustomerReview() {
  const record0 = lifecycle.initLifecycleRecord(verifiedResult());
  const validated = lifecycle.advanceToLocalValidated(record0, verifiedResult());
  const reviewing = lifecycle.startInternalReview(validated);
  const passedReview = lifecycle.completeInternalReview(reviewing, true, "Passt.");
  return lifecycle.markReadyForCustomerReview(passedReview);
}

// 39. Kundenfreigabe ≠ Veröffentlichung.
check("39. Kundenfreigabe setzt niemals publicationStatus auf PUBLISHED", () => {
  const ready = buildReadyForCustomerReview();
  const approved = lifecycle.approveByCustomer(ready);
  assert.strictEqual(approved.customerReviewStatus, "CUSTOMER_APPROVED");
  assert.strictEqual(approved.publicationStatus, "PUBLICATION_NOT_APPROVED");
  assert.strictEqual(lifecycle.isPublished(approved), false);
});

// 40. Änderungswunsch.
check("40. Änderungswunsch führt zu CUSTOMER_CHANGES_REQUESTED mit Notiz", () => {
  const ready = buildReadyForCustomerReview();
  const changesRequested = lifecycle.requestCustomerChanges(ready, "Bitte Farben der Marke anpassen.");
  assert.strictEqual(changesRequested.customerReviewStatus, "CUSTOMER_CHANGES_REQUESTED");
  assert.strictEqual(changesRequested.customerChangeRequestNote, "Bitte Farben der Marke anpassen.");
});

check("nach Änderungswunsch beginnt das interne Review erneut (kein automatischer Sprung zurück)", () => {
  const ready = buildReadyForCustomerReview();
  const changesRequested = lifecycle.requestCustomerChanges(ready, "Bitte anpassen.");
  const backToReview = lifecycle.returnToInternalReviewAfterChanges(changesRequested);
  assert.strictEqual(backToReview.customerReviewStatus, "INTERNAL_REVIEW");
  assert.strictEqual(backToReview.internalReviewPassed, null);
  assert.throws(() => lifecycle.markReadyForCustomerReview(backToReview));
});

// 41. Ergebnisreferenz mandantengebunden.
check("41. Lifecycle-Datensatz trägt dieselbe Mandantenbindung wie das Ergebnis", () => {
  const record = lifecycle.initLifecycleRecord(verifiedResult());
  assert.strictEqual(record.customerId, "test-customer-fiktives-cafe");
  assert.strictEqual(record.brandId, "test-brand-fiktives-cafe");
  assert.strictEqual(record.campaignId, "test-campaign-fiktives-cafe-pilot");
});

// 42. keine automatische Medienablage: kein Feld/Funktion speichert Medien.
check("42. Modul enthält keine Medienablage-, Netzwerk- oder Dateisystemlogik", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("heygen-result-lifecycle.test.js", "heygen-result-lifecycle.js"), "utf8");
  assert.ok(!/require\(["']fs["']\)/.test(source));
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

check("keine Funktion des Moduls kann publicationStatus auf PUBLISHED setzen", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("heygen-result-lifecycle.test.js", "heygen-result-lifecycle.js"), "utf8");
  assert.ok(!/publicationStatus\s*=\s*["']PUBLISHED["']/.test(source));
});

check("keine Sammelfreigabe: jede Statusänderung ist ein eigener, expliziter Aufruf", () => {
  assert.strictEqual(typeof lifecycle.approveEverything, "undefined");
  assert.strictEqual(typeof lifecycle.publish, "undefined");
});

console.log(`heygen-result-lifecycle.test.js: ${passed} Prüfpunkte erfolgreich`);
