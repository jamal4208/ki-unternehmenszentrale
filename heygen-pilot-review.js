"use strict";

// V7.1 Phase B.1 – kanonisches Pilot-Review-Modell für den bereits extern
// ausgeführten, erfolgreichen ersten echten HeyGen-Pilot (Auftrag
// Abschnitt B).
//
// Dieses Modul dokumentiert den Pilot AUSSCHLIESSLICH strukturell. Es macht
// KEINE Netzwerkanfrage, speichert KEINE Zugangsdaten und KEINE vollständige
// Provider-Antwort. Unbekannte Angaben bleiben ausdrücklich "UNKNOWN" statt
// erfunden zu werden. Der reale Providerstatus (was HeyGen laut Bericht
// behauptet) ist strikt getrennt von der lokalen Verifikation (was dieses
// System selbst nachweisen kann) – eine Session-ID allein ist NIEMALS ein
// lokal verifizierter Erfolg. jamalDecision wird NIE automatisch auf
// "APPROVED_FOR_CUSTOMER_USE" gesetzt.

const crypto = require("crypto");

const PILOT_REVIEW_SCHEMA_VERSION = 1;

const PILOT_RENDER_STATUSES = Object.freeze([
  "UNKNOWN",
  "PROVIDER_PROCESSING",
  "PROVIDER_SUCCEEDED",
  "PROVIDER_FAILED",
]);

const PILOT_PUBLICATION_STATUSES = Object.freeze(["NOT_PUBLISHED", "PUBLISHED"]);

// Wiederverwendet dieselbe Kostenklassifizierung wie heygen-job-package.js
// (Auftrag Abschnitt G) – keine zweite, abweichende Kosten-Wahrheit.
const PILOT_COST_STATUSES = Object.freeze([
  "INCLUDED_IN_PACKAGE",
  "ADDITIONAL_APPROVAL_REQUIRED",
  "UNKNOWN",
  "NOT_BILLABLE_TEST",
]);

const PILOT_USAGE_STATUSES = Object.freeze(["UNKNOWN", "MEASURED_FROM_SAFE_SOURCE"]);

const PILOT_QUALITY_REVIEW_STATUSES = Object.freeze([
  "NOT_STARTED",
  "INTERNAL_REVIEW",
  "PASSED",
  "FAILED",
]);

// jamalDecision darf durch keine Funktion dieses Moduls automatisch auf
// APPROVED_FOR_CUSTOMER_USE gesetzt werden (Auftrag Abschnitt B: "kein
// automatisches APPROVED_FOR_CUSTOMER").
const PILOT_JAMAL_DECISIONS = Object.freeze([
  "PENDING",
  "ACKNOWLEDGED_SUCCESSFUL_TEST_ONLY",
  "APPROVED_FOR_CUSTOMER_USE",
  "REJECTED",
]);

const PILOT_REVIEW_SOURCES = Object.freeze(["MANUAL_REPORT_BY_JAMAL", "PROVIDER_STATUS_QUERY"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

// ---------------------------------------------------------------------------
// Fingerprint – bindet die inhaltsbestimmenden Felder des Reviews. Eine
// nachträgliche, unbemerkte Veränderung der dokumentierten Kernfakten würde
// den Fingerprint ändern.
// ---------------------------------------------------------------------------

function computeReviewFingerprint(review) {
  const snapshot = {
    provider: review.provider,
    providerSessionId: review.providerSessionId,
    providerJobId: review.providerJobId,
    customerId: review.customerId,
    brandId: review.brandId,
    projectId: review.projectId,
    campaignId: review.campaignId,
    renderStatus: review.renderStatus,
    publicationStatus: review.publicationStatus,
    externalTransferOccurred: review.externalTransferOccurred,
    costStatus: review.costStatus,
    usageStatus: review.usageStatus,
    resultReference: review.resultReference,
  };
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// ---------------------------------------------------------------------------
// Lokale Verifikation vs. Providerstatus (Pflichttest: "Session-ID allein
// kein lokal verifizierter Erfolg"). Ein Pilot gilt erst dann als lokal
// verifiziert erfolgreich, wenn eine gültige, geprüfte Ergebnisreferenz
// vorliegt – niemals allein aufgrund einer Session- oder Job-ID.
// ---------------------------------------------------------------------------

function isLocallyVerifiedSuccess(review) {
  if (!review) return false;
  const hasUsableReference =
    typeof review.resultReference === "string" &&
    review.resultReference !== "UNKNOWN" &&
    /^https:\/\//i.test(review.resultReference);
  return hasUsableReference === true;
}

// ---------------------------------------------------------------------------
// Strukturelle Validierung des Review-Datensatzes.
// ---------------------------------------------------------------------------

function validatePilotReview(input = {}) {
  const reasons = [];

  if (!input.pilotReviewId) reasons.push("pilotReviewId fehlt.");
  if (!input.provider) reasons.push("provider fehlt.");
  if (!input.customerId) reasons.push("customerId fehlt.");
  if (!input.brandId) reasons.push("brandId fehlt.");
  if (!input.projectId) reasons.push("projectId fehlt.");

  if (!PILOT_RENDER_STATUSES.includes(input.renderStatus)) {
    reasons.push(`renderStatus "${input.renderStatus}" ist ungültig.`);
  }
  if (!PILOT_PUBLICATION_STATUSES.includes(input.publicationStatus)) {
    reasons.push(`publicationStatus "${input.publicationStatus}" ist ungültig.`);
  }
  if (input.publicationStatus === "PUBLISHED") {
    reasons.push("Veröffentlichung ist in dieser Phase ausdrücklich nicht erlaubt.");
  }
  if (!PILOT_COST_STATUSES.includes(input.costStatus)) {
    reasons.push(`costStatus "${input.costStatus}" ist ungültig.`);
  }
  if (!PILOT_USAGE_STATUSES.includes(input.usageStatus)) {
    reasons.push(`usageStatus "${input.usageStatus}" ist ungültig.`);
  }
  if (!PILOT_QUALITY_REVIEW_STATUSES.includes(input.qualityReviewStatus)) {
    reasons.push(`qualityReviewStatus "${input.qualityReviewStatus}" ist ungültig.`);
  }
  if (!PILOT_JAMAL_DECISIONS.includes(input.jamalDecision)) {
    reasons.push(`jamalDecision "${input.jamalDecision}" ist ungültig.`);
  }
  if (input.jamalDecision === "APPROVED_FOR_CUSTOMER_USE") {
    reasons.push("jamalDecision darf für diesen Piloten nicht automatisch auf APPROVED_FOR_CUSTOMER_USE stehen.");
  }
  if (!PILOT_REVIEW_SOURCES.includes(input.source)) {
    reasons.push(`source "${input.source}" ist ungültig.`);
  }
  if (!Array.isArray(input.findings)) {
    reasons.push("findings muss eine Liste sein.");
  }

  const recomputedFingerprint = computeReviewFingerprint(input);
  if (input.reviewFingerprint && input.reviewFingerprint !== recomputedFingerprint) {
    reasons.push("reviewFingerprint stimmt nicht mit dem aktuellen Inhalt überein.");
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Der eine, bereits real ausgeführte Pilot (Auftrag Abschnitt B). Alle nicht
// sicher bekannten Werte bleiben ausdrücklich "UNKNOWN" – keine erfundenen
// Werte. providerJobId ist von providerSessionId bewusst getrennt: die
// Session-ID ist bekannt, eine endgültige, separat bestätigte Video-ID liegt
// nicht sicher vor und bleibt daher UNKNOWN.
// ---------------------------------------------------------------------------

const DOCUMENTED_FIRST_PILOT_REVIEW_BASE = Object.freeze({
  schemaVersion: PILOT_REVIEW_SCHEMA_VERSION,
  pilotReviewId: "pilot-review-heygen-2026-07-cafe-001",
  jobPackageId: "UNKNOWN",
  provider: "HeyGen",
  providerSessionId: "af66e85f550542b0a5bfcef0fc2939e8",
  providerJobId: "UNKNOWN",
  customerId: "test-customer-fiktives-cafe",
  brandId: "test-brand-fiktives-cafe",
  projectId: "ki-unternehmenszentrale",
  campaignId: "test-campaign-fiktives-cafe-pilot",
  // Providerstatus laut externem Bericht: das Video wurde bei HeyGen
  // erfolgreich erstellt. Das ist ein Providerstatus, KEINE lokale
  // Verifikation (siehe isLocallyVerifiedSuccess).
  renderStatus: "PROVIDER_SUCCEEDED",
  publicationStatus: "NOT_PUBLISHED",
  // Ein realer, externer Transfer zu HeyGen hat stattgefunden (das Video
  // wurde dort erstellt) – dieser Transfer lief jedoch außerhalb des
  // kontrollierten Connector-Pfads dieser Zentrale (externe Ausführung vor
  // bzw. neben dem hier implementierten Hand-off-Modell).
  externalTransferOccurred: true,
  costStatus: "NOT_BILLABLE_TEST",
  usageStatus: "UNKNOWN",
  // Keine dauerhafte, sicher geprüfte Ergebnis-URL bekannt – bleibt UNKNOWN,
  // wird nicht erfunden.
  resultReference: "UNKNOWN",
  qualityReviewStatus: "NOT_STARTED",
  // Ausdrücklich NICHT APPROVED_FOR_CUSTOMER_USE. Der Pilot ist als
  // erfolgreicher, interner Test anerkannt, aber ohne Kundenfreigabe.
  jamalDecision: "ACKNOWLEDGED_SUCCESSFUL_TEST_ONLY",
  findings: Object.freeze([
    "Laut externem HeyGen-Bericht wurde ein Video in der Session erfolgreich erstellt (Providerangabe).",
    "Eine Session-ID allein gilt nicht als lokal verifizierter Erfolg; es liegt keine geprüfte Ergebnisreferenz vor.",
    "Kein neues, echtes Video wurde im Rahmen dieses Auftrags erzeugt.",
    "Keine Veröffentlichung erfolgt oder freigegeben.",
    "Kein Voice Clone verwendet; öffentlicher Avatar, Hochformat 9:16, neutrales deutsches Skript.",
    "Keine Kunden-, Gesundheits- oder Kinderdaten beteiligt.",
    "Exakte Kosten, verbrauchte Credits und Renderdauer sind nicht sicher bekannt (UNKNOWN).",
  ]),
  createdAt: "2026-07-25T00:00:00.000Z",
  verifiedAt: null,
  source: "MANUAL_REPORT_BY_JAMAL",
});

function buildDocumentedFirstPilotReview() {
  const draft = clone(DOCUMENTED_FIRST_PILOT_REVIEW_BASE);
  draft.reviewFingerprint = computeReviewFingerprint(draft);
  return draft;
}

function getCanonicalFirstPilotReview() {
  return buildDocumentedFirstPilotReview();
}

module.exports = {
  PILOT_REVIEW_SCHEMA_VERSION,
  PILOT_RENDER_STATUSES,
  PILOT_PUBLICATION_STATUSES,
  PILOT_COST_STATUSES,
  PILOT_USAGE_STATUSES,
  PILOT_QUALITY_REVIEW_STATUSES,
  PILOT_JAMAL_DECISIONS,
  PILOT_REVIEW_SOURCES,
  computeReviewFingerprint,
  isLocallyVerifiedSuccess,
  validatePilotReview,
  buildDocumentedFirstPilotReview,
  getCanonicalFirstPilotReview,
};
