"use strict";

// V7.1 Phase C.1 – kanonische, revisionssichere Pilot-Ergebnisakte für den
// bereits real durchgeführten Canva-Pilotlauf (Auftrag Abschnitt C) sowie
// die kontrollierte Kundenfeedback-Schleife (Auftrag Abschnitt D/E).
//
// Dieses Modul führt KEINEN Netzwerkaufruf aus, speichert KEINE Canva-
// Credentials/Tokens und startet KEINE externe Canva-Aktion. Es verwaltet
// ausschließlich bereits bekannte, vom Connector/Jamal manuell berichtete
// Metadaten strukturell und trennt dabei verbindlich:
//
//   Kandidat  ist keine Design-ID
//   Design-ID ist kein Kundenentwurf
//   Kundenentwurf ist keine Kundenfreigabe
//   Kundenfreigabe ist keine Veröffentlichung
//   Änderungsanforderung startet keine Veröffentlichung
//   Kundenfeedback ändert keine Kostenfreigabe
//   Kundenfeedback ändert keine Rechtefreigabe
//
// publicationApprovalStatus bleibt in diesem Modul strukturell unerreichbar
// jenseits von "NOT_APPROVED": es gibt bewusst keine exportierte Funktion,
// die einen anderen Wert setzen könnte.
//
// V7.1 Phase C.1.1 (Auftrag: "Reviewmodell skalierbar machen") – ergänzt
// additiv ein kanonisches, rollenbasiertes Reviewmodell (reviewMode,
// serviceTier, qualityReviewStatus, Agenten-QS), damit Jamal im späteren
// Kundenbetrieb NICHT zum verpflichtenden Prüf-/Freigabeengpass wird:
//
//   Eigenprojekt   -> Agenten-QS, Jamal prüft persönlich, Jamal entscheidet
//   Standardkunde  -> Agenten-QS, Kunde prüft/entscheidet fachlich selbst
//   Premiumkunde   -> Agenten-QS, optionales internes Review, Kunde entscheidet final
//   Risikofall     -> automatischer Stopp, Eskalation an Jamal/autorisierte Rolle
//
// internalReviewStatus (Jamals bisheriges Feld) bleibt unverändert bestehen,
// beschreibt aber ab jetzt ausdrücklich NUR NOCH den Owner-Review-Pfad
// (Eigenprojekt) bzw. das optionale interne Premium-Review – es impliziert
// NICHT, dass Jamal grundsätzlich jeden Kundenentwurf prüfen muss.

const crypto = require("crypto");

const canvaDesignJobPackage = require("./canva-design-job-package");
const canvaDesignResult = require("./canva-design-result");

const PILOT_RESULT_SCHEMA_VERSION = 1;

// Auftrag Abschnitt "Verbindlicher Ausgang" – der Pilot lief ausschließlich
// als kontrollierter Hand-off, niemals als direkte Verbindung.
const CANVA_PILOT_CONNECTOR_TYPES = Object.freeze(["CONTROLLED_HANDOFF"]);

// Wiederverwendet dieselbe Providerstatus-Wahrheit wie
// canva-design-result.js – keine zweite, abweichende Aufzählung.
const CANVA_PILOT_PROVIDER_EXECUTION_STATUSES = canvaDesignResult.CANVA_RESULT_PROVIDER_STATUSES;

// Wiederverwendet dieselbe Kostenklassifizierung wie
// canva-design-job-package.js – keine zweite Kosten-Wahrheit.
const CANVA_PILOT_COST_PACKAGE_STATUSES = canvaDesignJobPackage.CANVA_COST_PACKAGE_STATUSES;

const CANVA_PILOT_INTERNAL_REVIEW_STATUSES = Object.freeze([
  "NOT_REVIEWED",
  "REVIEWED_WITH_NOTES",
  "REVIEWED_APPROVED",
]);

// Auftrag Abschnitt D – kontrollierter Kundenfeedback-Lifecycle.
// CHANGES_POSSIBLE bildet zusätzlich den realen, bereits dokumentierten
// Zwischenstand ab ("solide, aber noch nicht 100% final, Kunde könnte
// andere Präferenzen haben") – ein Zustand nach internem Review, aber vor
// der ausdrücklichen, formellen Freigabestufe READY_FOR_CUSTOMER_REVIEW.
const CANVA_PILOT_CUSTOMER_REVIEW_STATUSES = Object.freeze([
  "NOT_READY",
  "CHANGES_POSSIBLE",
  "READY_FOR_CUSTOMER_REVIEW",
  "CUSTOMER_CHANGES_REQUESTED",
  "READY_FOR_REVIEW_AFTER_CHANGES",
  "CUSTOMER_APPROVED",
]);

// Veröffentlichung bleibt in dieser Phase strukturell unerreichbar: der
// einzige jemals gültige Wert ist NOT_APPROVED. Es gibt bewusst keine
// Funktion in diesem Modul, die einen anderen Wert setzen kann.
const CANVA_PILOT_PUBLICATION_APPROVAL_STATUSES = Object.freeze(["NOT_APPROVED"]);

const CANVA_PILOT_FEEDBACK_TYPES = Object.freeze([
  "TEXT_CHANGE",
  "IMAGE_CHANGE",
  "LAYOUT_CHANGE",
  "BRAND_ADJUSTMENT",
  "MESSAGE_ADJUSTMENT",
  "GENERAL_FEEDBACK",
]);

const CANVA_PILOT_FEEDBACK_CREATED_BY_ROLES = Object.freeze(["JAMAL_INTERNAL", "CUSTOMER"]);

const CANVA_PILOT_FEEDBACK_STATUSES = Object.freeze(["RECORDED", "CHANGES_REQUESTED", "APPLIED_AND_REVIEWED"]);

// ---------------------------------------------------------------------------
// V7.1 Phase C.1.1 – kanonisches, rollenbasiertes Reviewmodell.
// ---------------------------------------------------------------------------

// Mandanten-/Tarifmodell (Auftrag Abschnitt C). INTERNAL ist der sichere,
// abwärtskompatible Standard (Eigenprojekt/Owner-Review) – dieselbe
// Bedeutung, die alle bisherigen Pilot-Ergebnisakten aus Phase C.1 bereits
// implizit hatten.
const CANVA_PILOT_SERVICE_TIERS = Object.freeze(["INTERNAL", "STANDARD", "PREMIUM", "ESCALATED"]);

// Reviewmodell (Auftrag Abschnitt B). RISK_ESCALATION wird niemals bei der
// Ersterstellung gewählt, sondern ausschließlich über die explizite,
// protokollierte escalate()-Aktion erreicht.
const CANVA_PILOT_REVIEW_MODES = Object.freeze([
  "OWNER_REVIEW",
  "CUSTOMER_SELF_REVIEW",
  "PREMIUM_INTERNAL_REVIEW",
  "RISK_ESCALATION",
]);

// Agenten-QS-/Menschenreview-Fortschritt (Auftrag Abschnitt B), unabhängig
// von internalReviewStatus/customerReviewStatus. Eine eigene, echte
// Prüfstufe – keine Umbenennung eines bestehenden Feldes.
const CANVA_PILOT_QUALITY_REVIEW_STATUSES = Object.freeze([
  "NOT_STARTED",
  "AGENT_QA_PENDING",
  "AGENT_QA_PASSED",
  "AGENT_QA_FAILED",
  "HUMAN_REVIEW_REQUIRED",
  "HUMAN_REVIEW_COMPLETED",
  "ESCALATED",
]);

// Wer hat zuletzt geprüft? Rein informativ/nachvollziehbar, löst selbst
// keine Aktion aus.
const CANVA_PILOT_REVIEWER_ROLES = Object.freeze(["AGENT_QA", "JAMAL_OWNER", "INTERNAL_HUMAN_REVIEWER", "CUSTOMER"]);

// Agenten-QS-Ergebnis (Auftrag Abschnitt E).
const CANVA_PILOT_AGENT_QA_RESULTS = Object.freeze(["PASS", "PASS_WITH_NOTES", "FAIL", "ESCALATE"]);

// Minimale, strukturierte Agenten-QS-Prüfpunkte (Auftrag Abschnitt E) – rein
// boolesche Checkliste, keine Freitextinhalte, kein Rechte-/Rendermaterial.
const CANVA_PILOT_AGENT_QA_CHECK_KEYS = Object.freeze([
  "briefingFulfilled",
  "mainMessageVisible",
  "mandatoryTextsPresent",
  "noPlaceholderText",
  "readabilitySufficient",
  "imageMessageConsistent",
  "noProhibitedContent",
  "rightsAndPrivacyStatusUnchanged",
  "noPublicationTriggered",
]);

// Ableitung der Standardwerte je serviceTier (Auftrag Abschnitt C). Explizit
// mitgegebene Werte im Input überschreiben diese Standards (siehe
// validatePilotResultRecordInput), sodass z. B. ein Premiumkunde ohne
// verpflichtendes menschliches Review konfiguriert werden kann.
function deriveReviewModelDefaults(serviceTier) {
  switch (serviceTier) {
    case "STANDARD":
      return {
        reviewMode: "CUSTOMER_SELF_REVIEW",
        ownerReviewRequired: false,
        customerSelfReviewAllowed: true,
        humanReviewRequired: false,
        riskEscalationRequired: false,
      };
    case "PREMIUM":
      return {
        reviewMode: "PREMIUM_INTERNAL_REVIEW",
        ownerReviewRequired: false,
        customerSelfReviewAllowed: true,
        humanReviewRequired: true,
        riskEscalationRequired: false,
      };
    case "ESCALATED":
      return {
        reviewMode: "RISK_ESCALATION",
        ownerReviewRequired: false,
        customerSelfReviewAllowed: false,
        humanReviewRequired: false,
        riskEscalationRequired: true,
      };
    case "INTERNAL":
    default:
      return {
        reviewMode: "OWNER_REVIEW",
        ownerReviewRequired: true,
        customerSelfReviewAllowed: false,
        humanReviewRequired: false,
        riskEscalationRequired: false,
      };
  }
}

function normalizeAgentQaChecklist(input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("checklist muss ein Objekt sein.");
  }
  const normalized = {};
  CANVA_PILOT_AGENT_QA_CHECK_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      normalized[key] = Boolean(input[key]);
    }
  });
  return normalized;
}

const MAX_TEXT_FIELD_LENGTH = 2000;
const MAX_REQUESTED_CHANGES = 20;
const MAX_REQUESTED_CHANGE_LENGTH = 400;
const MAX_HISTORY_ENTRIES = 200;

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimmedOrNull(value, maxLength) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeRequestedChanges(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new Error("requestedChanges muss eine Liste sein.");
  }
  return values
    .slice(0, MAX_REQUESTED_CHANGES)
    .map((entry) => trimmedOrNull(entry, MAX_REQUESTED_CHANGE_LENGTH))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Mandanten-Fingerprint – ausschließlich über die vier Bindungsfelder.
// Unveränderlich: einmal berechnet, darf er sich für dieselbe pilotId nie
// mehr ändern (siehe canva-pilot-store.js#assertNoTenantReassignment).
// ---------------------------------------------------------------------------

function computeImmutableTenantFingerprint({ customerId, brandId, campaignId, projectId }) {
  const snapshot = {
    customerId: customerId || null,
    brandId: brandId || null,
    campaignId: campaignId || null,
    projectId: projectId || null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function computeFeedbackFingerprint(entry) {
  const snapshot = {
    feedbackId: entry.feedbackId,
    designId: entry.designId,
    customerId: entry.customerId,
    brandId: entry.brandId,
    campaignId: entry.campaignId,
    projectId: entry.projectId,
    feedbackText: entry.feedbackText,
    feedbackType: entry.feedbackType,
    requestedChanges: entry.requestedChanges,
    createdAt: entry.createdAt,
    createdByRole: entry.createdByRole,
  };
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function isTenantComplete(record) {
  return Boolean(record.customerId) && Boolean(record.brandId) && Boolean(record.campaignId);
}

// ---------------------------------------------------------------------------
// Gate für den Eintritt in die Kundenfeedback-Schleife (Auftrag Abschnitt D):
//   1. echte Design-ID vorhanden
//   2. ausgewählter Kandidat vorhanden
//   3. Mandantenbindung vollständig
//   4. internes Review abgeschlossen
//   5. Veröffentlichung weiterhin nicht freigegeben (strukturell immer wahr)
// ---------------------------------------------------------------------------

// Grundbedingungen, die für JEDEN Reviewmodus gelten (Auftrag Abschnitt
// B/D): echte Design-ID, ausgewählter Kandidat, vollständige
// Mandantenbindung, Veröffentlichung weiterhin im Ausgangszustand, keine
// aktive Eskalation (Risikofall = automatischer Stopp).
function baseCustomerReviewGateReasons(record) {
  const reasons = [];
  if (!record.designId) reasons.push("es liegt keine echte Design-ID vor");
  if (!record.candidateId) reasons.push("es liegt kein ausgewählter Designkandidat vor");
  if (!isTenantComplete(record)) reasons.push("die Mandantenbindung (Kunde/Marke/Kampagne) ist unvollständig");
  if (record.publicationApprovalStatus !== "NOT_APPROVED") {
    reasons.push("die Veröffentlichung ist nicht mehr im erwarteten Ausgangszustand");
  }
  if (record.reviewMode === "RISK_ESCALATION" || record.qualityReviewStatus === "ESCALATED") {
    reasons.push("die Akte ist eskaliert (Risikofall) und für eine Kundenreview-Freigabe gesperrt");
  }
  return reasons;
}

// Owner-Review-Gate (Eigenprojekt) – unverändertes Bestandsverhalten aus
// Phase C.1: Jamals internes Review bleibt hier der maßgebliche, zusätzlich
// zu den Grundbedingungen erforderliche Prüfschritt. Für
// CUSTOMER_SELF_REVIEW (Standardkunde) und PREMIUM_INTERNAL_REVIEW
// (Premiumkunde) gelten eigene Gates innerhalb von recordAgentQaResult()
// bzw. recordHumanReview() – dort ist Jamals internes Review ausdrücklich
// NICHT erforderlich.
function assertCustomerReviewGate(record, actionLabel) {
  const reasons = baseCustomerReviewGateReasons(record);
  if (!["REVIEWED_WITH_NOTES", "REVIEWED_APPROVED"].includes(record.internalReviewStatus)) {
    reasons.push("das interne Review ist noch nicht abgeschlossen");
  }
  if (reasons.length > 0) {
    throw new Error(`${actionLabel} ist nicht erreichbar: ${reasons.join("; ")}.`);
  }
}

function assertKnownEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} "${value}" ist ungültig (erlaubt: ${allowed.join(", ")}).`);
  }
}

// ---------------------------------------------------------------------------
// Validierung + Erzeugung der kanonischen Pilot-Ergebnisakte.
// ---------------------------------------------------------------------------

function validatePilotResultRecordInput(input = {}) {
  const reasons = [];

  const pilotId = trimmedOrNull(input.pilotId, 200);
  if (!pilotId) reasons.push("pilotId fehlt.");

  const toolId = trimmedOrNull(input.toolId, 60) || "canva";
  if (toolId !== "canva") reasons.push('toolId muss "canva" sein.');

  const connectorType = trimmedOrNull(input.connectorType, 60) || "CONTROLLED_HANDOFF";
  if (!CANVA_PILOT_CONNECTOR_TYPES.includes(connectorType)) {
    reasons.push(`connectorType "${connectorType}" ist ungültig; erlaubt ist ausschließlich CONTROLLED_HANDOFF (niemals DIRECT).`);
  }

  const customerId = trimmedOrNull(input.customerId, 200);
  const brandId = trimmedOrNull(input.brandId, 200);
  const campaignId = trimmedOrNull(input.campaignId, 200);
  const projectId = trimmedOrNull(input.projectId, 200);
  if (!customerId) reasons.push("customerId fehlt.");
  if (!brandId) reasons.push("brandId fehlt.");
  if (!campaignId) reasons.push("campaignId fehlt.");
  if (!projectId) reasons.push("projectId fehlt.");

  const jobPackageId = trimmedOrNull(input.jobPackageId, 200);
  const providerJobId = trimmedOrNull(input.providerJobId, 200);
  const candidateId = trimmedOrNull(input.candidateId, 200);
  const designId = trimmedOrNull(input.designId, 200);

  // Candidate-ID ist keine Design-ID (dieselbe Fachregel wie
  // canva-design-result.js).
  if (candidateId && designId && candidateId === designId) {
    reasons.push("designId darf nicht identisch mit candidateId sein (Candidate-ID ist keine Design-ID).");
  }

  const designTitle = trimmedOrNull(input.designTitle, 300);
  const designType = trimmedOrNull(input.designType, 60);
  if (designType && !canvaDesignJobPackage.CANVA_DESIGN_TYPES.includes(designType)) {
    reasons.push(`designType "${designType}" ist ungültig.`);
  }

  const pageCountRaw = input.pageCount;
  const pageCount = pageCountRaw === undefined || pageCountRaw === null ? null : Number(pageCountRaw);
  if (pageCount !== null && (!Number.isFinite(pageCount) || pageCount < 1)) {
    reasons.push("pageCount muss eine positive Zahl oder null sein.");
  }

  const costPackageStatus = trimmedOrNull(input.costPackageStatus, 60) || "NOT_BILLABLE_TEST";
  if (!CANVA_PILOT_COST_PACKAGE_STATUSES.includes(costPackageStatus)) {
    reasons.push(`costPackageStatus "${costPackageStatus}" ist ungültig.`);
  }

  const providerExecutionStatus = trimmedOrNull(input.providerExecutionStatus, 60);
  if (!CANVA_PILOT_PROVIDER_EXECUTION_STATUSES.includes(providerExecutionStatus)) {
    reasons.push(`providerExecutionStatus "${providerExecutionStatus}" ist ungültig.`);
  }
  // Ein gespeichertes/erzeugtes Design erfordert eine echte Design-ID;
  // providerJobId allein ist kein Erfolg (dieselbe Fachregel wie
  // canva-design-result.js).
  if (["DESIGN_CREATED", "SAVED"].includes(providerExecutionStatus) && !designId) {
    reasons.push(`providerExecutionStatus "${providerExecutionStatus}" erfordert eine gültige designId.`);
  }

  const internalReviewStatus = trimmedOrNull(input.internalReviewStatus, 60) || "NOT_REVIEWED";
  if (!CANVA_PILOT_INTERNAL_REVIEW_STATUSES.includes(internalReviewStatus)) {
    reasons.push(`internalReviewStatus "${internalReviewStatus}" ist ungültig.`);
  }

  const customerReviewStatus = trimmedOrNull(input.customerReviewStatus, 60) || "NOT_READY";
  if (!CANVA_PILOT_CUSTOMER_REVIEW_STATUSES.includes(customerReviewStatus)) {
    reasons.push(`customerReviewStatus "${customerReviewStatus}" ist ungültig.`);
  }

  // V7.1 Phase C.1.1 – Mandanten-/Tarifmodell und kanonisches Reviewmodell
  // (Auftrag Abschnitt B/C). serviceTier "INTERNAL" ist der sichere,
  // abwärtskompatible Standard (entspricht exakt dem bisherigen
  // Owner-Review-Verhalten aus Phase C.1).
  const serviceTier = trimmedOrNull(input.serviceTier, 40) || "INTERNAL";
  if (!CANVA_PILOT_SERVICE_TIERS.includes(serviceTier)) {
    reasons.push(`serviceTier "${serviceTier}" ist ungültig.`);
  }
  const reviewModelDefaults = deriveReviewModelDefaults(serviceTier);

  const reviewMode = trimmedOrNull(input.reviewMode, 60) || reviewModelDefaults.reviewMode;
  if (!CANVA_PILOT_REVIEW_MODES.includes(reviewMode)) {
    reasons.push(`reviewMode "${reviewMode}" ist ungültig.`);
  }

  const ownerReviewRequired =
    input.ownerReviewRequired === undefined ? reviewModelDefaults.ownerReviewRequired : Boolean(input.ownerReviewRequired);
  const customerSelfReviewAllowed =
    input.customerSelfReviewAllowed === undefined
      ? reviewModelDefaults.customerSelfReviewAllowed
      : Boolean(input.customerSelfReviewAllowed);
  const humanReviewRequired =
    input.humanReviewRequired === undefined ? reviewModelDefaults.humanReviewRequired : Boolean(input.humanReviewRequired);
  const riskEscalationRequired =
    input.riskEscalationRequired === undefined
      ? reviewModelDefaults.riskEscalationRequired
      : Boolean(input.riskEscalationRequired);

  const reviewerRole = trimmedOrNull(input.reviewerRole, 60);
  if (reviewerRole && !CANVA_PILOT_REVIEWER_ROLES.includes(reviewerRole)) {
    reasons.push(`reviewerRole "${reviewerRole}" ist ungültig.`);
  }
  // Ausschließlich interne, minimierte Referenz (z. B. internes Kürzel) –
  // kein Freitext, kein Klarname, keine Kontaktdaten.
  const reviewedByActorId = trimmedOrNull(input.reviewedByActorId, 80);

  const qualityReviewStatus = trimmedOrNull(input.qualityReviewStatus, 60) || "NOT_STARTED";
  if (!CANVA_PILOT_QUALITY_REVIEW_STATUSES.includes(qualityReviewStatus)) {
    reasons.push(`qualityReviewStatus "${qualityReviewStatus}" ist ungültig.`);
  }

  return {
    reasons,
    normalized: {
      pilotId,
      toolId,
      connectorType,
      customerId,
      brandId,
      campaignId,
      projectId,
      jobPackageId,
      providerJobId,
      candidateId,
      designId,
      designTitle,
      designType,
      pageCount,
      costPackageStatus,
      providerExecutionStatus,
      internalReviewStatus,
      customerReviewStatus,
      serviceTier,
      reviewMode,
      ownerReviewRequired,
      customerSelfReviewAllowed,
      humanReviewRequired,
      riskEscalationRequired,
      reviewerRole,
      reviewedByActorId,
      qualityReviewStatus,
    },
  };
}

function createPilotResultRecord(input = {}, options = {}) {
  const { reasons, normalized } = validatePilotResultRecordInput(input);
  if (reasons.length > 0) {
    throw new Error(`Pilot-Ergebnisakte ungültig: ${reasons.join(" ")}`);
  }
  const createdAt = nowIso(options.now);
  const record = {
    schemaVersion: PILOT_RESULT_SCHEMA_VERSION,
    ...normalized,
    // Veröffentlichung bleibt strukturell immer NOT_APPROVED – dieses Modul
    // enthält keine Funktion, die einen anderen Wert setzen kann.
    publicationApprovalStatus: "NOT_APPROVED",
    createdAt,
    updatedAt: createdAt,
    evidence: [],
    feedbackHistory: [],
    changeRequestHistory: [],
    // V7.1 Phase C.1.1 – Agenten-QS-Verlauf (Auftrag Abschnitt E), getrennt
    // von evidence (Jamals freien Bewertungsnotizen).
    agentQaHistory: [],
    decisionHistory: [
      {
        decisionId: randomId("decision"),
        action: "PILOT_RESULT_RECORD_CREATED",
        previousCustomerReviewStatus: null,
        newCustomerReviewStatus: normalized.customerReviewStatus,
        note: "Kanonische Pilot-Ergebnisakte angelegt.",
        decidedAt: createdAt,
      },
    ],
    immutableTenantFingerprint: computeImmutableTenantFingerprint(normalized),
  };
  return clone(record);
}

// ---------------------------------------------------------------------------
// Interne Bewertung / Review (Auftrag Abschnitt E).
// ---------------------------------------------------------------------------

function addEvidence(recordInput, entries) {
  const record = clone(recordInput);
  const createdAt = nowIso();
  const normalizedEntries = (Array.isArray(entries) ? entries : [entries])
    .filter(Boolean)
    .map((entry) => ({
      evidenceId: randomId("evidence"),
      category: trimmedOrNull(entry.category, 120) || "GENERAL",
      note: trimmedOrNull(entry.note, MAX_TEXT_FIELD_LENGTH),
      recordedAt: createdAt,
    }))
    .filter((entry) => Boolean(entry.note));
  record.evidence = [...record.evidence, ...normalizedEntries].slice(-MAX_HISTORY_ENTRIES);
  record.updatedAt = createdAt;
  return clone(record);
}

// Internes Review: kann jederzeit erneut aufgerufen werden (z. B. nach
// Änderungen). Der Kundenfeedback-Status wird NUR dann automatisch
// vorwärtsbewegt, wenn er noch am Anfang steht (NOT_READY/CHANGES_POSSIBLE)
// UND das Gate (designId/candidateId/Mandant) erfüllt ist. Ein bereits
// laufender oder abgeschlossener Kundenfeedback-Zyklus (CUSTOMER_CHANGES_
// REQUESTED, READY_FOR_REVIEW_AFTER_CHANGES, CUSTOMER_APPROVED) wird von
// dieser Funktion NIE überschrieben – dafür existieren eigene, explizite
// Aktionen (requestChanges/markReadyAfterChanges/approveByCustomer).
function recordInternalReview(recordInput, input = {}) {
  const record = clone(recordInput);
  const internalReviewStatus = trimmedOrNull(input.internalReviewStatus, 60) || "REVIEWED_WITH_NOTES";
  assertKnownEnum(internalReviewStatus, CANVA_PILOT_INTERNAL_REVIEW_STATUSES, "internalReviewStatus");

  const previousCustomerReviewStatus = record.customerReviewStatus;
  record.internalReviewStatus = internalReviewStatus;

  if (["NOT_READY", "CHANGES_POSSIBLE"].includes(record.customerReviewStatus)) {
    if (["REVIEWED_WITH_NOTES", "REVIEWED_APPROVED"].includes(internalReviewStatus)) {
      try {
        assertCustomerReviewGate(record, "Freigabe für die Kundenreview-Stufe");
        record.customerReviewStatus = "READY_FOR_CUSTOMER_REVIEW";
      } catch (_error) {
        // Gate nicht erfüllt: interner Review-Status wird trotzdem
        // dokumentiert, aber die Kundenfeedback-Schleife bleibt gesperrt.
      }
    }
  }

  // V7.1 Phase C.1.1 – dokumentiert additiv, WER geprüft hat (Owner-Review
  // im Eigenprojekt bzw. optionales internes Premium-Review). Ändert nie
  // reviewMode/serviceTier selbst.
  if (["REVIEWED_WITH_NOTES", "REVIEWED_APPROVED"].includes(internalReviewStatus)) {
    if (record.reviewMode === "OWNER_REVIEW") {
      record.reviewerRole = "JAMAL_OWNER";
    }
    const reviewedByActorId = trimmedOrNull(input.reviewedByActorId, 80);
    if (reviewedByActorId) record.reviewedByActorId = reviewedByActorId;
  }

  const now = nowIso();
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "INTERNAL_REVIEW_RECORDED",
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note: trimmedOrNull(input.note, MAX_TEXT_FIELD_LENGTH),
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  let updated = clone(record);
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    updated = addEvidence(updated, input.evidence);
  }
  return clone(updated);
}

// ---------------------------------------------------------------------------
// V7.1 Phase C.1.1 – Agenten-QS (Auftrag Abschnitt E): eine eigene, echte,
// minimale Prüfstufe VOR jedem menschlichen Review oder jeder
// Kundenreview-Freigabe. Löst niemals eine Veröffentlichung, Canva-Aktion,
// Kosten- oder Rechtefreigabe aus.
//
//   PASS / PASS_WITH_NOTES -> qualityReviewStatus = AGENT_QA_PASSED
//   FAIL                   -> qualityReviewStatus = AGENT_QA_FAILED (blockiert Kundenreview)
//   ESCALATE               -> qualityReviewStatus = ESCALATED, reviewMode = RISK_ESCALATION
//
// Standardkunde (CUSTOMER_SELF_REVIEW): bestandene Agenten-QS genügt, um
// direkt READY_FOR_CUSTOMER_REVIEW zu erreichen – AUSDRÜCKLICH ohne
// verpflichtende Jamal-Prüfung.
// Premiumkunde (PREMIUM_INTERNAL_REVIEW): bestandene Agenten-QS führt bei
// humanReviewRequired=true in HUMAN_REVIEW_REQUIRED, sonst ebenfalls direkt
// weiter.
// Eigenprojekt (OWNER_REVIEW): bestandene Agenten-QS wird dokumentiert,
// ersetzt aber NICHT Jamals eigenes internes Review (siehe
// recordInternalReview/assertCustomerReviewGate, unverändert).
// ---------------------------------------------------------------------------

function recordAgentQaResult(recordInput, input = {}) {
  const record = clone(recordInput);
  const result = trimmedOrNull(input.result, 40);
  assertKnownEnum(result, CANVA_PILOT_AGENT_QA_RESULTS, "Agenten-QS-Ergebnis");
  if (record.reviewMode === "RISK_ESCALATION" || record.qualityReviewStatus === "ESCALATED") {
    throw new Error("Agenten-QS ist für eine eskalierte (Risikofall-)Akte nicht mehr erreichbar.");
  }

  const checklist = normalizeAgentQaChecklist(input.checklist);
  const note = trimmedOrNull(input.note, MAX_TEXT_FIELD_LENGTH);
  const reviewedByActorId = trimmedOrNull(input.reviewedByActorId, 80);

  const previousQualityReviewStatus = record.qualityReviewStatus;
  const previousCustomerReviewStatus = record.customerReviewStatus;

  if (result === "FAIL") {
    record.qualityReviewStatus = "AGENT_QA_FAILED";
  } else if (result === "ESCALATE") {
    record.qualityReviewStatus = "ESCALATED";
    record.reviewMode = "RISK_ESCALATION";
    record.riskEscalationRequired = true;
  } else {
    // PASS oder PASS_WITH_NOTES.
    record.qualityReviewStatus = "AGENT_QA_PASSED";
  }
  record.reviewerRole = "AGENT_QA";
  record.reviewedByActorId = reviewedByActorId || record.reviewedByActorId || null;

  record.agentQaHistory = [
    ...(record.agentQaHistory || []),
    {
      agentQaId: randomId("agent-qa"),
      result,
      checklist,
      note,
      recordedAt: nowIso(),
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  if (record.qualityReviewStatus === "AGENT_QA_PASSED") {
    if (record.reviewMode === "CUSTOMER_SELF_REVIEW") {
      if (["NOT_READY", "CHANGES_POSSIBLE"].includes(record.customerReviewStatus)) {
        if (baseCustomerReviewGateReasons(record).length === 0) {
          record.customerReviewStatus = "READY_FOR_CUSTOMER_REVIEW";
        }
      }
    } else if (record.reviewMode === "PREMIUM_INTERNAL_REVIEW") {
      if (record.humanReviewRequired) {
        record.qualityReviewStatus = "HUMAN_REVIEW_REQUIRED";
      } else if (["NOT_READY", "CHANGES_POSSIBLE"].includes(record.customerReviewStatus)) {
        if (baseCustomerReviewGateReasons(record).length === 0) {
          record.customerReviewStatus = "READY_FOR_CUSTOMER_REVIEW";
        }
      }
    }
    // OWNER_REVIEW: qualityReviewStatus wird dokumentiert, die
    // Kundenreview-Stufe bleibt bewusst an Jamals internes Review gebunden
    // (siehe recordInternalReview).
  }

  const now = nowIso();
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "AGENT_QA_RECORDED",
      previousQualityReviewStatus,
      newQualityReviewStatus: record.qualityReviewStatus,
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note: note || `Agenten-QS-Ergebnis: ${result}.`,
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  return clone(record);
}

// V7.1 Phase C.1.1 – optionales internes menschliches Review (Auftrag
// Abschnitt B/D), ausschließlich für Premiumkunden mit humanReviewRequired.
// Kein Ersatz für Jamals Owner-Review (Eigenprojekt) und keine
// Voraussetzung für Standardkunden.
function recordHumanReview(recordInput, input = {}) {
  const record = clone(recordInput);
  if (record.reviewMode !== "PREMIUM_INTERNAL_REVIEW") {
    throw new Error('Menschliches Review ist ausschließlich im Reviewmodus "PREMIUM_INTERNAL_REVIEW" erreichbar.');
  }
  if (!record.humanReviewRequired) {
    throw new Error("Für diese Akte ist kein menschliches Review erforderlich.");
  }
  if (record.qualityReviewStatus !== "HUMAN_REVIEW_REQUIRED") {
    throw new Error(
      `Menschliches Review ist aus Status "${record.qualityReviewStatus}" nicht zulässig (erwartet: HUMAN_REVIEW_REQUIRED).`,
    );
  }

  const note = trimmedOrNull(input.note, MAX_TEXT_FIELD_LENGTH);
  const reviewedByActorId = trimmedOrNull(input.reviewedByActorId, 80);
  const previousCustomerReviewStatus = record.customerReviewStatus;

  record.qualityReviewStatus = "HUMAN_REVIEW_COMPLETED";
  record.reviewerRole = "INTERNAL_HUMAN_REVIEWER";
  record.reviewedByActorId = reviewedByActorId || record.reviewedByActorId || null;

  if (["NOT_READY", "CHANGES_POSSIBLE"].includes(record.customerReviewStatus)) {
    if (baseCustomerReviewGateReasons(record).length === 0) {
      record.customerReviewStatus = "READY_FOR_CUSTOMER_REVIEW";
    }
  }

  const now = nowIso();
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "HUMAN_REVIEW_COMPLETED",
      previousQualityReviewStatus: "HUMAN_REVIEW_REQUIRED",
      newQualityReviewStatus: record.qualityReviewStatus,
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note,
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  let updated = clone(record);
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    updated = addEvidence(updated, input.evidence);
  }
  return clone(updated);
}

// V7.1 Phase C.1.1 – Risikofall (Auftrag Abschnitt D/E): automatischer
// Stopp, unabhängig vom bisherigen Prüfstatus ("SAVED oder beliebiger
// Prüfstatus -> ESCALATED"). Bewegt die Kundenreview-Stufe NIE vorwärts;
// eine bereits erreichte Kundenfreigabe wird durch eine spätere Eskalation
// nicht rückgängig gemacht (Historie bleibt unveränderlich) – sie markiert
// ausschließlich den neu entdeckten Risikofall zur Prüfung durch Jamal oder
// eine spätere autorisierte Rolle. Es gibt in diesem Modul bewusst keine
// Funktion, die eine Eskalation wieder aufhebt.
function escalate(recordInput, input = {}) {
  const record = clone(recordInput);
  const reason = trimmedOrNull(input.reason, MAX_TEXT_FIELD_LENGTH);
  if (!reason) throw new Error("Eskalation benötigt eine reason.");

  const previousQualityReviewStatus = record.qualityReviewStatus;
  const previousReviewMode = record.reviewMode;
  const previousCustomerReviewStatus = record.customerReviewStatus;

  record.qualityReviewStatus = "ESCALATED";
  record.reviewMode = "RISK_ESCALATION";
  record.riskEscalationRequired = true;
  record.reviewerRole = "JAMAL_OWNER";

  const now = nowIso();
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "ESCALATED",
      previousQualityReviewStatus,
      newQualityReviewStatus: record.qualityReviewStatus,
      previousReviewMode,
      newReviewMode: record.reviewMode,
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note: reason,
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  return clone(record);
}

// ---------------------------------------------------------------------------
// Kundenfeedback (Auftrag Abschnitt D/E). Löst NIE eine Canva-Aktion, eine
// Veröffentlichung, eine Kosten- oder Rechtefreigabe aus.
// ---------------------------------------------------------------------------

function recordCustomerFeedback(recordInput, input = {}) {
  const record = clone(recordInput);
  if (!record.designId) {
    throw new Error("Kundenfeedback ist nicht möglich, solange keine echte Design-ID vorliegt.");
  }
  if (!isTenantComplete(record)) {
    throw new Error("Kundenfeedback ist nicht möglich, solange die Mandantenbindung unvollständig ist.");
  }

  const feedbackType = trimmedOrNull(input.feedbackType, 60) || "GENERAL_FEEDBACK";
  assertKnownEnum(feedbackType, CANVA_PILOT_FEEDBACK_TYPES, "feedbackType");
  const createdByRole = trimmedOrNull(input.createdByRole, 40) || "JAMAL_INTERNAL";
  assertKnownEnum(createdByRole, CANVA_PILOT_FEEDBACK_CREATED_BY_ROLES, "createdByRole");
  const feedbackText = trimmedOrNull(input.feedbackText, MAX_TEXT_FIELD_LENGTH);
  if (!feedbackText) throw new Error("feedbackText fehlt.");
  const requestedChanges = normalizeRequestedChanges(input.requestedChanges);

  const createdAt = nowIso();
  const entry = {
    feedbackId: randomId("feedback"),
    // Foreign-Key-artige Bindung: Mandant/Design werden aus der Akte
    // abgeleitet, niemals vom Aufrufer übernommen (gleiches Muster wie
    // canva-store.js#saveResult).
    designId: record.designId,
    customerId: record.customerId,
    brandId: record.brandId,
    campaignId: record.campaignId,
    projectId: record.projectId,
    feedbackText,
    feedbackType,
    requestedChanges,
    createdAt,
    createdByRole,
    status: "RECORDED",
    appliedAt: null,
    reviewedAt: null,
  };
  entry.immutableFingerprint = computeFeedbackFingerprint(entry);

  record.feedbackHistory = [...record.feedbackHistory, entry].slice(-MAX_HISTORY_ENTRIES);
  record.updatedAt = createdAt;
  return clone(record);
}

// Änderungsanforderung – nur erreichbar, wenn der Entwurf bereits einmal
// dem Kunden vorgelegt wurde (READY_FOR_CUSTOMER_REVIEW oder erneut nach
// vorherigen Änderungen). Setzt niemals Kosten-/Rechtefreigaben zurück und
// löst keine Canva-Aktion und keine Veröffentlichung aus.
function requestChanges(recordInput, input = {}) {
  const record = clone(recordInput);
  const allowedFrom = ["READY_FOR_CUSTOMER_REVIEW", "READY_FOR_REVIEW_AFTER_CHANGES"];
  if (!allowedFrom.includes(record.customerReviewStatus)) {
    throw new Error(
      `Änderungsanforderung ist aus Status "${record.customerReviewStatus}" nicht zulässig (erwartet: ${allowedFrom.join(", ")}).`,
    );
  }
  const feedbackId = trimmedOrNull(input.feedbackId, 200);
  if (feedbackId) {
    const referenced = record.feedbackHistory.find((entry) => entry.feedbackId === feedbackId);
    if (!referenced) {
      throw new Error(`Kein Feedback-Eintrag mit feedbackId "${feedbackId}" gefunden.`);
    }
  }
  const requestedChanges = normalizeRequestedChanges(input.requestedChanges);
  const note = trimmedOrNull(input.note, MAX_TEXT_FIELD_LENGTH);
  if (requestedChanges.length === 0 && !note) {
    throw new Error("Änderungsanforderung benötigt requestedChanges oder eine Notiz.");
  }

  const now = nowIso();
  const previousCustomerReviewStatus = record.customerReviewStatus;

  record.feedbackHistory = record.feedbackHistory.map((entry) =>
    feedbackId && entry.feedbackId === feedbackId ? { ...entry, status: "CHANGES_REQUESTED" } : entry,
  );
  record.changeRequestHistory = [
    ...record.changeRequestHistory,
    {
      changeRequestId: randomId("change-request"),
      feedbackId: feedbackId || null,
      requestedChanges,
      note,
      requestedAt: now,
      status: "OPEN",
    },
  ].slice(-MAX_HISTORY_ENTRIES);
  record.customerReviewStatus = "CUSTOMER_CHANGES_REQUESTED";
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "CUSTOMER_CHANGES_REQUESTED",
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note,
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);
  return clone(record);
}

// "Änderung als erledigt markieren" + "erneut intern prüfen" (Auftrag
// Abschnitt B/G) – eine einzige, explizite interne Re-Review-Bestätigung.
// Führt selbst keine Canva-Bearbeitung aus (die Bearbeitung geschieht
// weiterhin ausschließlich manuell, kontrolliert, außerhalb dieses
// Systems); sie dokumentiert nur, dass Jamal die bereits vorgenommene
// Änderung intern erneut geprüft hat.
function markReadyAfterChanges(recordInput, input = {}) {
  const record = clone(recordInput);
  if (record.customerReviewStatus !== "CUSTOMER_CHANGES_REQUESTED") {
    throw new Error(
      `"Änderung erledigt & erneut geprüft" ist aus Status "${record.customerReviewStatus}" nicht zulässig (erwartet: CUSTOMER_CHANGES_REQUESTED).`,
    );
  }
  const now = nowIso();
  const previousCustomerReviewStatus = record.customerReviewStatus;

  record.feedbackHistory = record.feedbackHistory.map((entry) =>
    entry.status === "CHANGES_REQUESTED" ? { ...entry, status: "APPLIED_AND_REVIEWED", appliedAt: now, reviewedAt: now } : entry,
  );
  record.changeRequestHistory = record.changeRequestHistory.map((entry) =>
    entry.status === "OPEN" ? { ...entry, status: "APPLIED_AND_REVIEWED" } : entry,
  );
  record.customerReviewStatus = "READY_FOR_REVIEW_AFTER_CHANGES";
  record.internalReviewStatus = "REVIEWED_WITH_NOTES";
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "MARKED_READY_AFTER_CHANGES",
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note: trimmedOrNull(input.note, MAX_TEXT_FIELD_LENGTH),
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);
  return clone(record);
}

// Kundenfreigabe ist ausdrücklich getrennt von Veröffentlichung (Auftrag
// Abschnitt B, Regel: "Kundenfreigabe ist keine Veröffentlichung").
// publicationApprovalStatus bleibt strukturell unverändert NOT_APPROVED.
function approveByCustomer(recordInput) {
  const record = clone(recordInput);
  const allowedFrom = ["READY_FOR_CUSTOMER_REVIEW", "READY_FOR_REVIEW_AFTER_CHANGES"];
  if (!allowedFrom.includes(record.customerReviewStatus)) {
    throw new Error(
      `Kundenfreigabe ist aus Status "${record.customerReviewStatus}" nicht zulässig (erwartet: ${allowedFrom.join(", ")}).`,
    );
  }
  const now = nowIso();
  const previousCustomerReviewStatus = record.customerReviewStatus;
  record.customerReviewStatus = "CUSTOMER_APPROVED";
  // Strukturell erzwungen, unabhängig vom Eingabestatus: eine Kundenfreigabe
  // des Entwurfs setzt niemals die Veröffentlichung frei.
  record.publicationApprovalStatus = "NOT_APPROVED";
  record.updatedAt = now;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "CUSTOMER_APPROVED_DRAFT",
      previousCustomerReviewStatus,
      newCustomerReviewStatus: record.customerReviewStatus,
      note: "Kundenfreigabe des Entwurfs – keine Veröffentlichungsfreigabe.",
      decidedAt: now,
    },
  ].slice(-MAX_HISTORY_ENTRIES);
  return clone(record);
}

// ---------------------------------------------------------------------------
// Der eine, real durchgeführte Pilot (Auftrag Abschnitt C/E). Alle Werte
// entsprechen exakt den von Jamal berichteten, kanonischen Pilotdaten.
// ---------------------------------------------------------------------------

const REAL_PILOT_TENANT = Object.freeze({
  customerId: "test-customer-fiktives-cafe-amore",
  brandId: "test-brand-cafe-amore",
  campaignId: "test-campaign-cafe-amore-sonntagsfruehstueck",
  projectId: "ki-unternehmenszentrale",
});

function buildRealPilotResultRecordSeed(options = {}) {
  const createdAtBase = options.now || "2026-07-25T00:00:00.000Z";
  let record = createPilotResultRecord(
    {
      pilotId: "pilot-canva-2026-07-cafe-amore-sonntagsfruehstueck",
      toolId: "canva",
      connectorType: "CONTROLLED_HANDOFF",
      ...REAL_PILOT_TENANT,
      jobPackageId: "UNKNOWN",
      providerJobId: "UNKNOWN",
      candidateId: "pilot-candidate-2-unbekannte-provider-id",
      designId: "DAHQeIjc2ls",
      designTitle: "Instagram-Beitrag - Sonntagsfrühstück",
      designType: "INSTAGRAM_POST",
      pageCount: 1,
      costPackageStatus: "NOT_BILLABLE_TEST",
      providerExecutionStatus: "SAVED",
      internalReviewStatus: "NOT_REVIEWED",
      customerReviewStatus: "NOT_READY",
      // V7.1 Phase C.1.1 (Auftrag Abschnitt C) – der reale Café-Amore-Pilot
      // ist ein Eigenprojekt: Jamals bisheriges Review bleibt vollständig
      // erhalten und maßgeblich, keine automatische Kunden-Selbstprüfung.
      serviceTier: "INTERNAL",
      reviewMode: "OWNER_REVIEW",
      ownerReviewRequired: true,
    },
    { now: createdAtBase },
  );

  // Auftrag Abschnitt E – Jamals reale, strukturierte interne Bewertung.
  record = addEvidence(record, [
    { category: "BILDWIRKUNG", note: "Warm und grundsätzlich passend." },
    { category: "FORMAT", note: "Hochformat positiv." },
    { category: "TIEFENSCHAERFE", note: "Positiv." },
    { category: "HAUPTUEBERSCHRIFT", note: "Hauptüberschrift „Sonntagsfrühstück“ gut lesbar." },
    { category: "FRUEHSTUECKSDARSTELLUNG", note: "Zu einfach, inhaltlich zu klein." },
    { category: "KAFFEE", note: "Nicht deutlich genug sichtbar." },
    { category: "ZEITANGABE", note: "Ursprünglich zu klein; bereits vergrößert und fett gesetzt." },
    { category: "UNTERE_BOTSCHAFT", note: "Geändert zu „Kaffee. Frühstück. Zeit zum Genießen.“, auch danach eher klein." },
    { category: "PLATZHALTER_WEBADRESSE", note: "Entfernt." },
    { category: "GESAMTURTEIL", note: "Solide, aber nicht 100 Prozent final." },
    { category: "KUNDENSICHT", note: "Kunde könnte andere Präferenzen haben; Kundenänderungen müssen möglich sein." },
    { category: "OFFEN", note: "Noch offen: umfangreicheres Frühstücksbild, Kaffee deutlicher sichtbar, untere Botschaft möglicherweise größer, endgültige Kundenbewertung." },
  ]);

  // Internes Review ist abgeschlossen (mit Notizen). Dies dokumentiert
  // ausschließlich den bereits real eingetretenen, bekannten Ist-Zustand:
  // das Gate für die Kundenfeedback-Schleife ist zwar strukturell erfüllt
  // (Design-ID, Kandidat, Mandant, internes Review), der Entwurf wurde
  // jedoch noch NICHT formell an den Kunden zur Prüfung übergeben – daher
  // wird hier bewusst NICHT die auto-advance-Logik von recordInternalReview
  // verwendet (die für künftige, frische Übergänge READY_FOR_CUSTOMER_REVIEW
  // ansteuern würde), sondern der reale Zwischenstand CHANGES_POSSIBLE direkt
  // und ehrlich in Status und Entscheidungsverlauf abgebildet. Ein späterer,
  // erneuter Aufruf von recordInternalReview auf diesem Datensatz hebt ihn
  // regulär nach READY_FOR_CUSTOMER_REVIEW an (siehe dortige Gate-Prüfung).
  const reviewNote =
    "Design intern geprüft: warme Bildwirkung, Hochformat und Tiefenschärfe positiv, Hauptüberschrift gut lesbar. " +
    "Frühstücksdarstellung zu einfach, Kaffee nicht deutlich genug, Zeitangabe und untere Botschaft ursprünglich zu " +
    "klein. Textänderungen (Zeitangabe größer/fett, neue untere Botschaft, Platzhalter-Webadresse entfernt) wurden " +
    "bereits kontrolliert vorgenommen und gespeichert; Bild blieb unverändert. Gesamturteil: solide, aber noch " +
    "nicht 100 Prozent final – Kunde könnte andere Präferenzen haben, Kundenänderungen müssen möglich sein.";
  const reviewedAt = nowIso(options.now);
  record.internalReviewStatus = "REVIEWED_WITH_NOTES";
  record.customerReviewStatus = "CHANGES_POSSIBLE";
  // V7.1 Phase C.1.1 – rein additive Metadaten, ändert das reale, bereits
  // dokumentierte Pilotprotokoll (Entscheidungsverlauf/Notizen) nicht.
  record.reviewerRole = "JAMAL_OWNER";
  record.updatedAt = reviewedAt;
  record.decisionHistory = [
    ...record.decisionHistory,
    {
      decisionId: randomId("decision"),
      action: "INTERNAL_REVIEW_RECORDED",
      previousCustomerReviewStatus: "NOT_READY",
      newCustomerReviewStatus: "CHANGES_POSSIBLE",
      note: reviewNote,
      decidedAt: reviewedAt,
    },
  ];

  return clone(record);
}

module.exports = {
  PILOT_RESULT_SCHEMA_VERSION,
  CANVA_PILOT_CONNECTOR_TYPES,
  CANVA_PILOT_PROVIDER_EXECUTION_STATUSES,
  CANVA_PILOT_COST_PACKAGE_STATUSES,
  CANVA_PILOT_INTERNAL_REVIEW_STATUSES,
  CANVA_PILOT_CUSTOMER_REVIEW_STATUSES,
  CANVA_PILOT_PUBLICATION_APPROVAL_STATUSES,
  CANVA_PILOT_FEEDBACK_TYPES,
  CANVA_PILOT_FEEDBACK_CREATED_BY_ROLES,
  CANVA_PILOT_FEEDBACK_STATUSES,
  // V7.1 Phase C.1.1 – kanonisches, rollenbasiertes Reviewmodell.
  CANVA_PILOT_SERVICE_TIERS,
  CANVA_PILOT_REVIEW_MODES,
  CANVA_PILOT_QUALITY_REVIEW_STATUSES,
  CANVA_PILOT_REVIEWER_ROLES,
  CANVA_PILOT_AGENT_QA_RESULTS,
  CANVA_PILOT_AGENT_QA_CHECK_KEYS,
  REAL_PILOT_TENANT,
  computeImmutableTenantFingerprint,
  computeFeedbackFingerprint,
  isTenantComplete,
  deriveReviewModelDefaults,
  validatePilotResultRecordInput,
  createPilotResultRecord,
  addEvidence,
  recordInternalReview,
  recordCustomerFeedback,
  requestChanges,
  markReadyAfterChanges,
  approveByCustomer,
  recordAgentQaResult,
  recordHumanReview,
  escalate,
  buildRealPilotResultRecordSeed,
};
