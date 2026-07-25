"use strict";

const assert = require("assert");

const pilotReview = require("./heygen-pilot-review");
const tenantRegistry = require("./agency-tenant-registry");
const projectRegistry = require("./project-registry");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// 1. realer Pilot als erfolgreich dokumentierbar
check("1. realer Pilot ist strukturiert dokumentierbar und strukturell gültig", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  const validation = pilotReview.validatePilotReview(review);
  assert.strictEqual(validation.ok, true, validation.reasons.join("; "));
  assert.strictEqual(review.providerSessionId, "af66e85f550542b0a5bfcef0fc2939e8");
  assert.strictEqual(review.renderStatus, "PROVIDER_SUCCEEDED");
});

// 2. Session-ID allein kein lokal verifizierter Erfolg
check("2. Session-ID allein ist kein lokal verifizierter Erfolg", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.resultReference, "UNKNOWN");
  assert.strictEqual(pilotReview.isLocallyVerifiedSuccess(review), false);
});

check("isLocallyVerifiedSuccess erkennt eine gültige https-Ergebnisreferenz als lokal verifizierbar", () => {
  const review = { ...pilotReview.getCanonicalFirstPilotReview(), resultReference: "https://example-provider.test/video/123" };
  assert.strictEqual(pilotReview.isLocallyVerifiedSuccess(review), true);
});

// 3. unbekannte Kosten bleiben UNKNOWN
check("3. unbekannte Werte bleiben UNKNOWN statt erfunden", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.providerJobId, "UNKNOWN");
  assert.strictEqual(review.usageStatus, "UNKNOWN");
  assert.strictEqual(review.resultReference, "UNKNOWN");
});

// 4. Veröffentlichung bleibt false
check("4. Veröffentlichung bleibt NOT_PUBLISHED", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.publicationStatus, "NOT_PUBLISHED");
});

check("publicationStatus PUBLISHED wird von der Validierung abgewiesen", () => {
  const review = { ...pilotReview.getCanonicalFirstPilotReview(), publicationStatus: "PUBLISHED" };
  const validation = pilotReview.validatePilotReview(review);
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.reasons.some((r) => /nicht erlaubt/.test(r)));
});

// 5. Pilot ist NOT_BILLABLE_TEST
check("5. Pilot ist als NOT_BILLABLE_TEST dokumentiert", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.costStatus, "NOT_BILLABLE_TEST");
});

check("jamalDecision ist nie automatisch APPROVED_FOR_CUSTOMER_USE", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.notStrictEqual(review.jamalDecision, "APPROVED_FOR_CUSTOMER_USE");
  const forced = { ...review, jamalDecision: "APPROVED_FOR_CUSTOMER_USE" };
  const validation = pilotReview.validatePilotReview(forced);
  assert.strictEqual(validation.ok, false);
});

check("kein automatischer APPROVED_FOR_CUSTOMER-Wert existiert in der Enum-Liste als Default", () => {
  assert.ok(pilotReview.PILOT_JAMAL_DECISIONS.includes("APPROVED_FOR_CUSTOMER_USE"));
  assert.notStrictEqual(pilotReview.getCanonicalFirstPilotReview().jamalDecision, "APPROVED_FOR_CUSTOMER_USE");
});

check("Pilotreview ist an einen bekannten, gültigen Testmandanten gebunden", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  const binding = tenantRegistry.validateTenantBinding({
    customerId: review.customerId,
    brandId: review.brandId,
    campaignId: review.campaignId,
    projectId: review.projectId,
  });
  assert.strictEqual(binding.ok, true, binding.reasons.join("; "));
});

check("Pilotreview referenziert ein tatsächlich existierendes Projekt", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.ok(projectRegistry.getProjectById(review.projectId));
});

check("reviewFingerprint ist stabil für identischen Inhalt und ändert sich bei Inhaltsänderung", () => {
  const reviewA = pilotReview.getCanonicalFirstPilotReview();
  const reviewB = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(reviewA.reviewFingerprint, reviewB.reviewFingerprint);
  const changed = { ...reviewA, renderStatus: "PROVIDER_FAILED" };
  const newFingerprint = pilotReview.computeReviewFingerprint(changed);
  assert.notStrictEqual(newFingerprint, reviewA.reviewFingerprint);
});

check("findings enthalten keine erfundenen, konkreten Kosten- oder Credit-Zahlen", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  const combined = review.findings.join(" ");
  assert.ok(!/\d+[.,]\d{2}\s?(€|EUR)/.test(combined));
  assert.ok(!/\d+\s?Credits/i.test(combined));
});

check("Providerstatus (renderStatus) und lokale Verifikation sind strukturell getrennte Felder", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.renderStatus, "PROVIDER_SUCCEEDED");
  assert.strictEqual(pilotReview.isLocallyVerifiedSuccess(review), false);
});

check("Videoerstellung ist getrennt von Veröffentlichung dokumentiert", () => {
  const review = pilotReview.getCanonicalFirstPilotReview();
  assert.strictEqual(review.renderStatus, "PROVIDER_SUCCEEDED");
  assert.strictEqual(review.publicationStatus, "NOT_PUBLISHED");
});

check("keine vollständige Provider-Komplettantwort und keine Zugangsdaten im Modul", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("heygen-pilot-review.test.js", "heygen-pilot-review.js"), "utf8");
  assert.ok(!/apiKey/i.test(source));
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{10,}/.test(source));
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

check("validatePilotReview weist strukturell ungültige Datensätze ab", () => {
  const validation = pilotReview.validatePilotReview({});
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.reasons.length > 0);
});

console.log(`heygen-pilot-review.test.js: ${passed} Prüfpunkte erfolgreich`);
