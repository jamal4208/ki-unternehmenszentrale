"use strict";

// V7.1 Phase B.1 – Ergebnisrückführung in das Kundenprojekt (Auftrag
// Abschnitt H).
//
// Dieses Modul modelliert AUSSCHLIESSLICH die Statuskette zwischen einem
// bereits strukturell validierten HeyGen-Ergebnis (heygen-job-result.js) und
// einer möglichen späteren Veröffentlichung. Es enthält keine Netzwerklogik,
// speichert keine Medien und setzt niemals automatisch eine höhere
// Freigabestufe. Jeder Übergang ist ein eigener, expliziter Aufruf – keine
// Sammelfreigabe, kein automatischer Sprung. providerClaimedStatus
// (heygen-job-result.js) bleibt strikt getrennt von diesem
// Kunden-Review-Status: ein Providererfolg allein bewegt diesen Status
// NICHT automatisch weiter.

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const RESULT_LIFECYCLE_STATUSES = Object.freeze([
  "PROVIDER_PROCESSING",
  "PROVIDER_SUCCEEDED",
  "LOCAL_VALIDATED",
  "INTERNAL_REVIEW",
  "READY_FOR_CUSTOMER_REVIEW",
  "CUSTOMER_CHANGES_REQUESTED",
  "CUSTOMER_APPROVED",
  "PUBLICATION_NOT_APPROVED",
  "PUBLISHED",
]);

// Veröffentlichung bleibt in dieser Phase strukturell unerreichbar: es gibt
// bewusst keine exportierte Funktion, die publicationStatus auf "PUBLISHED"
// setzen kann.
const PUBLICATION_STATUSES = Object.freeze(["PUBLICATION_NOT_APPROVED", "PUBLISHED"]);

// ---------------------------------------------------------------------------
// Initialisierung – ausgehend vom bereits strukturell geprüften Provider-
// Ergebnis (heygen-job-result.js). PROVIDER_SUCCEEDED bedeutet ausdrücklich
// NICHT "lokal validiert" (Regel 36).
// ---------------------------------------------------------------------------

function initLifecycleRecord(resultRecord) {
  if (!resultRecord || !resultRecord.jobPackageId) {
    throw new Error("Ein Lifecycle-Datensatz benötigt ein bereits validiertes Ergebnis mit jobPackageId.");
  }
  let customerReviewStatus;
  if (resultRecord.providerClaimedStatus === "PROCESSING") {
    customerReviewStatus = "PROVIDER_PROCESSING";
  } else if (resultRecord.providerClaimedStatus === "SUCCEEDED") {
    customerReviewStatus = "PROVIDER_SUCCEEDED";
  } else {
    // FAILED/CANCELLED sind terminale Providerzustände außerhalb dieser
    // Kunden-Review-Kette; es findet keine Kunden-Rückführung statt.
    customerReviewStatus = null;
  }
  return {
    jobPackageId: resultRecord.jobPackageId,
    customerId: resultRecord.customerId || null,
    brandId: resultRecord.brandId || null,
    campaignId: resultRecord.campaignId || null,
    customerReviewStatus,
    publicationStatus: "PUBLICATION_NOT_APPROVED",
    internalReviewPassed: null,
    internalReviewNote: null,
    customerChangeRequestNote: null,
    history: customerReviewStatus ? [customerReviewStatus] : [],
  };
}

function assertStatus(record, expected, actionLabel) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(record.customerReviewStatus)) {
    throw new Error(
      `${actionLabel} ist aus Status "${record.customerReviewStatus}" nicht zulässig (erwartet: ${allowed.join(", ")}).`,
    );
  }
}

function advance(record, nextStatus) {
  const updated = clone(record);
  updated.customerReviewStatus = nextStatus;
  updated.history = [...(record.history || []), nextStatus];
  return updated;
}

// 36. Providererfolg ≠ lokale Validierung. Erfordert die bereits von
// heygen-job-result.js berechnete, strukturelle Tatsache
// locallyVerifiedSuccess === true; ohne diese Tatsache bleibt der Übergang
// blockiert.
function advanceToLocalValidated(record, resultRecord) {
  assertStatus(record, "PROVIDER_SUCCEEDED", "Lokale Validierung");
  if (!resultRecord || resultRecord.locallyVerifiedSuccess !== true) {
    throw new Error("Lokale Validierung erfordert eine strukturell nachgewiesene, gültige Ergebnisreferenz.");
  }
  return advance(record, "LOCAL_VALIDATED");
}

// 37. lokale Validierung ≠ internes Review.
function startInternalReview(record) {
  assertStatus(record, "LOCAL_VALIDATED", "Start des internen Reviews");
  return advance(record, "INTERNAL_REVIEW");
}

function completeInternalReview(record, passed, note) {
  assertStatus(record, "INTERNAL_REVIEW", "Abschluss des internen Reviews");
  const updated = clone(record);
  updated.internalReviewPassed = passed === true;
  updated.internalReviewNote = typeof note === "string" ? note.slice(0, 2000) : null;
  return updated;
}

// 38. internes Review ≠ Kundenfreigabe.
function markReadyForCustomerReview(record) {
  assertStatus(record, "INTERNAL_REVIEW", "Freigabe für Kundenreview");
  if (record.internalReviewPassed !== true) {
    throw new Error("Freigabe für Kundenreview erfordert ein bestandenes internes Review (completeInternalReview).");
  }
  return advance(record, "READY_FOR_CUSTOMER_REVIEW");
}

// 40. Änderungswunsch.
function requestCustomerChanges(record, note) {
  assertStatus(record, ["READY_FOR_CUSTOMER_REVIEW", "CUSTOMER_CHANGES_REQUESTED"], "Änderungswunsch");
  const updated = advance(record, "CUSTOMER_CHANGES_REQUESTED");
  updated.customerChangeRequestNote = typeof note === "string" ? note.slice(0, 2000) : null;
  return updated;
}

// Nach einem Änderungswunsch beginnt das interne Review erneut – kein
// automatischer Sprung zurück zu READY_FOR_CUSTOMER_REVIEW.
function returnToInternalReviewAfterChanges(record) {
  assertStatus(record, "CUSTOMER_CHANGES_REQUESTED", "Rückkehr ins interne Review");
  const updated = advance(record, "INTERNAL_REVIEW");
  updated.internalReviewPassed = null;
  return updated;
}

// 39. Kundenfreigabe ≠ Veröffentlichung. approveByCustomer setzt NIEMALS
// publicationStatus auf PUBLISHED.
function approveByCustomer(record) {
  assertStatus(record, "READY_FOR_CUSTOMER_REVIEW", "Kundenfreigabe");
  const updated = advance(record, "CUSTOMER_APPROVED");
  updated.publicationStatus = "PUBLICATION_NOT_APPROVED";
  return updated;
}

function isPublished(record) {
  return record && record.publicationStatus === "PUBLISHED";
}

module.exports = {
  RESULT_LIFECYCLE_STATUSES,
  PUBLICATION_STATUSES,
  initLifecycleRecord,
  advanceToLocalValidated,
  startInternalReview,
  completeInternalReview,
  markReadyForCustomerReview,
  requestCustomerChanges,
  returnToInternalReviewAfterChanges,
  approveByCustomer,
  isPublished,
};
