"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt D/E).
//
// Persistenz über auth-db.js (Migration 14). Dieses Modul importiert KEIN
// better-sqlite3 selbst (erhält stets ein bereits geöffnetes
// Datenbankobjekt, gleiches Prinzip wie jamal-canva-production-service.js)
// und ruft NIEMALS ein externes KI-Modell oder einen Provider auf – die
// gesamte Vorschlagserzeugung ist eine reine, deterministische Funktion aus
// agentId + Kalendertag + den bereits bestehenden agent-registry.js-Daten
// (Auftrag Abschnitt E: "lokal deterministisch bzw. regelbasiert").
//
// Autonomieregel (Auftrag Abschnitt D, nicht verhandelbar): keine Funktion
// in diesem Modul verändert jemals einen tatsächlichen Autonomierahmen.
// "RECOMMEND_SMALL_EXPANSION" und jede spätere APPROVED-Statusänderung
// bleiben ausschließlich Empfehlung/Prüfvermerk – dafür existiert in
// agent-registry.js ohnehin kein änderbares Feld.

const crypto = require("crypto");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const agentRegistry = require("./agent-registry");
const agentOrganization = require("./agent-organization-service");

const HR_RECOMMENDATION_VALUES = Object.freeze([
  "KEEP_CURRENT",
  "TRAIN_FIRST",
  "RECOMMEND_SMALL_EXPANSION",
  "REDUCE_SCOPE",
  "ESCALATE",
]);

const PROPOSAL_STATUS_VALUES = Object.freeze(["PROPOSED", "REVIEWED", "APPROVED", "REJECTED", "DEFERRED"]);

const HR_RECOMMENDATION_LABELS_DE = Object.freeze({
  KEEP_CURRENT: "Aktuellen Stand halten",
  TRAIN_FIRST: "Zuerst trainieren",
  RECOMMEND_SMALL_EXPANSION: "Kleine Erweiterung empfehlen",
  REDUCE_SCOPE: "Spielraum verringern",
  ESCALATE: "An Jamal eskalieren",
});

const PROPOSAL_STATUS_LABELS_DE = Object.freeze({
  PROPOSED: "Vorgeschlagen",
  REVIEWED: "Geprüft",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
  DEFERRED: "Zurückgestellt",
});

// ---------------------------------------------------------------------------
// Unternehmensleitlinien V1.0 (Auftrag Abschnitt E/G/J/L) – zusätzliche,
// eigenständige Wertebereiche. Müssen exakt den entsprechenden
// auth-db-migrations.js-CHECK-Aufzählungen entsprechen (siehe
// agent-leadership.test.js).
// ---------------------------------------------------------------------------
const PDCA_STAGE_VALUES = Object.freeze(["PLAN", "DO", "CHECK", "ACT"]);
const PDCA_STAGE_ORDER = PDCA_STAGE_VALUES;
const PDCA_DECISION_VALUES = Object.freeze(["KEEP", "ADJUST", "REPEAT", "DISCARD"]);
const RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES = Object.freeze(["NONE", "UNCERTAINTY", "EARLY_WARNING", "DEVIATION", "NEAR_MISS"]);
const BENEFIT_AREA_VALUES = Object.freeze([
  "TIME_SAVING",
  "QUALITY_IMPROVEMENT",
  "RISK_REDUCTION",
  "COST_CONTROL",
  "REVENUE_OPPORTUNITY",
  "CUSTOMER_VALUE",
  "EMPLOYEE_RELIEF",
  "STRATEGIC_READINESS",
]);
const PRIORITY_BUCKET_VALUES = Object.freeze(["NOW", "NEXT", "LATER", "WATCH"]);

const PDCA_STAGE_LABELS_DE = Object.freeze({
  PLAN: "Geplant",
  DO: "In Umsetzung",
  CHECK: "Wird geprüft",
  ACT: "Entschieden",
});

const PDCA_DECISION_LABELS_DE = Object.freeze({
  KEEP: "Beibehalten",
  ADJUST: "Anpassen",
  REPEAT: "Wiederholen",
  DISCARD: "Verwerfen",
});

const RELIABILITY_SIGNAL_ON_PROPOSAL_LABELS_DE = Object.freeze({
  NONE: "Kein Signal",
  UNCERTAINTY: "Unsicherheit",
  EARLY_WARNING: "Frühes Warnsignal",
  DEVIATION: "Abweichung",
  NEAR_MISS: "Beinahefehler",
});

const BENEFIT_AREA_LABELS_DE = Object.freeze({
  TIME_SAVING: "Zeitersparnis",
  QUALITY_IMPROVEMENT: "Qualitätsverbesserung",
  RISK_REDUCTION: "Risikoreduktion",
  COST_CONTROL: "Kostenkontrolle",
  REVENUE_OPPORTUNITY: "Umsatzchance",
  CUSTOMER_VALUE: "Kundennutzen",
  EMPLOYEE_RELIEF: "Entlastung im Team",
  STRATEGIC_READINESS: "Strategische Zukunftsfähigkeit",
});

const PRIORITY_BUCKET_LABELS_DE = Object.freeze({
  NOW: "Jetzt",
  NEXT: "Als Nächstes",
  LATER: "Später",
  WATCH: "Beobachten",
});

// Auftrag Abschnitt J – deterministische, mechanische Ableitung aus der
// bereits bestehenden hrRecommendation (keine erfundene Zusatzbewertung).
const BENEFIT_AREA_BY_RECOMMENDATION = Object.freeze({
  ESCALATE: "RISK_REDUCTION",
  REDUCE_SCOPE: "RISK_REDUCTION",
  RECOMMEND_SMALL_EXPANSION: "STRATEGIC_READINESS",
  TRAIN_FIRST: "QUALITY_IMPROVEMENT",
  KEEP_CURRENT: "QUALITY_IMPROVEMENT",
});

// Auftrag Abschnitt L – "weniger beginnen, Wichtiges zuverlässig
// abschließen": nur Empfehlungen mit erkennbarem Risiko-/Sicherheitsbezug
// gelten heute als vorrangig (NOW); alles andere reiht sich nach NEXT/LATER
// ein, statt automatisch oben zu stehen.
const PRIORITY_BUCKET_BY_RECOMMENDATION = Object.freeze({
  ESCALATE: "NOW",
  REDUCE_SCOPE: "NOW",
  RECOMMEND_SMALL_EXPANSION: "NEXT",
  TRAIN_FIRST: "NEXT",
  KEEP_CURRENT: "LATER",
});

function deriveBenefitArea(hrRecommendation) {
  return BENEFIT_AREA_BY_RECOMMENDATION[hrRecommendation] || "QUALITY_IMPROVEMENT";
}

function derivePriorityBucket(hrRecommendation) {
  return PRIORITY_BUCKET_BY_RECOMMENDATION[hrRecommendation] || "LATER";
}

// Deterministischer Folgeprüftermin: exakt sieben Kalendertage nach dem
// Lauf-Tag (kein Zufall, keine Systemzeit außer dem übergebenen runDate).
function computeNextReviewDate(runDate) {
  const base = new Date(`${runDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().slice(0, 10);
}

class AgentHrCoachingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AgentHrCoachingError";
    this.statusCode = statusCode;
  }
}

function badRequest(message) {
  return new AgentHrCoachingError(message, 400);
}

function conflict(message) {
  return new AgentHrCoachingError(message, 409);
}

function notFound(message) {
  return new AgentHrCoachingError(message, 404);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function isoDate(value) {
  return nowIso(value).slice(0, 10);
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// Deterministischer, tageweise wechselnder, aber niemals zufälliger Index
// (kein Math.random, keine Systemzeit außer dem übergebenen Kalendertag
// selbst) – gleiches FNV-1a-Muster wie agent-runtime.js#computeInputFingerprint.
function deterministicIndex(seedText, modulo) {
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}

// ---------------------------------------------------------------------------
// E. HR-Qualitätslogik – rollenbezogene Eingaben für jeden der 25 Agenten.
// Jede Zeile leitet ihren Fokus unmittelbar aus der bereits bestehenden
// agent.role-Beschreibung (agent-registry.js) und der zugewiesenen
// Zielstruktur (agent-organization-service.js) ab. Zwei Tagesvarianten je
// Agent sorgen für einen wechselnden, aber weiterhin deterministischen
// Tagesfokus (kein Zufall, keine erfundenen Leistungsdaten).
// ---------------------------------------------------------------------------
const AGENT_HR_FOCUS = Object.freeze({
  "strategy-agent": {
    variants: [
      "die Priorität in einem einzigen, chef-tauglichen Satz zuspitzen",
      "Zielkonflikte klarer von reinen Meinungsunterschieden trennen",
    ],
    exerciseVerb: "eine Priorisierungsempfehlung",
  },
  "product-agent": {
    variants: ["den Produktnutzen für Jamal in einem Satz greifbar machen", "Abgrenzung zwischen MVP und Erweiterung schärfer benennen"],
    exerciseVerb: "eine Produkteinordnung",
  },
  "project-status-agent": {
    variants: ["den Ist-Stand noch knapper auf das Wesentliche verdichten", "Fortschritt und Blocker klarer optisch trennen"],
    exerciseVerb: "eine Statuszusammenfassung",
  },
  "prioritization-agent": {
    variants: ["Dringlichkeit und Nutzen sauberer auseinanderhalten", "die Top-3-Aufgaben klarer von Nice-to-have trennen"],
    exerciseVerb: "eine Priorisierungsliste",
  },
  "ui-agent": {
    variants: ["UI-Folgeschritte konkreter benennen statt allgemein zu bleiben", "Darstellungsrisiken früher im Ablauf benennen"],
    exerciseVerb: "eine UI-Kurzbewertung",
  },
  "api-agent": {
    variants: ["Antwortstruktur-Abweichungen präziser benennen", "API-Randfälle systematischer mitdenken"],
    exerciseVerb: "eine API-Strukturprüfung",
  },
  "security-agent": {
    variants: ["Sicherheitsgrenzen noch konkreter in einem Satz benennen", "zwischen echtem Risiko und theoretischem Restrisiko klarer trennen"],
    exerciseVerb: "eine Sicherheitsgrenzenprüfung",
  },
  "quality-test-agent": {
    variants: ["Testschritte noch konkreter und nachprüfbarer formulieren", "fehlende Testabdeckung präziser benennen"],
    exerciseVerb: "eine Testschrittempfehlung",
  },
  "documentation-agent": {
    variants: ["Übergaben noch knapper und eindeutiger strukturieren", "veraltete von aktuellen Dokumentationsständen klarer trennen"],
    exerciseVerb: "eine Übergabestruktur",
  },
  "release-agent": {
    variants: ["Freigabereife noch klarer an konkreten Kriterien festmachen", "offene Restpunkte vor einer Freigabeempfehlung schärfer benennen"],
    exerciseVerb: "eine Freigabereifebewertung",
  },
  "health-compass-agent": {
    variants: ["Health-Upgrade-Kompass-Bezug noch eindeutiger einordnen", "Pilotgrenzen des Health-Projekts klarer benennen"],
    exerciseVerb: "eine Projektbezugseinordnung",
  },
  "customer-value-agent": {
    variants: ["Kundennutzen noch konkreter in einem Satz benennen", "Kundensicht klarer von interner Sicht trennen"],
    exerciseVerb: "eine Kundennutzenbewertung",
  },
  "risk-agent": {
    variants: ["Risiken noch konkreter mit Eintrittswahrscheinlichkeit benennen", "auftragsbezogene von allgemeinen Risiken klarer trennen"],
    exerciseVerb: "eine Risikoeinschätzung",
  },
  "decision-agent": {
    variants: ["Entscheidungsoptionen noch klarer gegeneinander abwägen", "Vor-/Nachteile knapper und vergleichbarer darstellen"],
    exerciseVerb: "eine Entscheidungsoption",
  },
  "next-actions-agent": {
    variants: ["den nächsten Schritt noch konkreter und ausführbarer benennen", "Abhängigkeiten vor dem nächsten Schritt klarer benennen"],
    exerciseVerb: "eine Schrittempfehlung",
  },
  "open-points-agent": {
    variants: ["offene Klärungspunkte noch präziser formulieren", "Klärungspunkte nach Dringlichkeit klarer sortieren"],
    exerciseVerb: "eine Klärungspunktliste",
  },
  "workflow-agent": {
    variants: ["Ablaufreihenfolge noch klarer auf Engpässe hin prüfen", "Doppelarbeit im Ablauf präziser benennen"],
    exerciseVerb: "eine Ablaufbewertung",
  },
  "data-structure-agent": {
    variants: ["Datenstrukturabweichungen noch konkreter benennen", "Pflichtfelder klarer von optionalen Feldern trennen"],
    exerciseVerb: "eine Datenstrukturprüfung",
  },
  "integration-agent": {
    variants: ["Integrationsbezug noch klarer ohne Ausführungsanspruch benennen", "Werkzeug-Passung präziser gegen bestehende Register prüfen"],
    exerciseVerb: "eine Integrationsbewertung",
  },
  "communication-agent": {
    variants: ["Übergabetexte noch verständlicher für Jamal formulieren", "Kommunikationsinhalt knapper auf das Wesentliche verdichten"],
    exerciseVerb: "einen Übergabetext",
  },
  "operations-agent": {
    variants: ["Betriebsfähigkeit noch konkreter an Kriterien festmachen", "Nutzbarkeit aus Betriebssicht klarer benennen"],
    exerciseVerb: "eine Betriebsbewertung",
  },
  "error-analysis-agent": {
    variants: ["Fehlerursache noch klarer von Symptom trennen", "wiederkehrende Fehlerursachen präziser benennen"],
    exerciseVerb: "eine Fehlerursachenanalyse",
  },
  "review-agent": {
    variants: ["Qualitätsreview noch konkreter an Kriterien festmachen", "Reviewbefunde klarer priorisieren"],
    exerciseVerb: "ein Qualitätsreview",
  },
  "closure-agent": {
    variants: ["Abschlussfähigkeit noch klarer an offenen Punkten festmachen", "Restarbeit vor einem Abschlussvorschlag präziser benennen"],
    exerciseVerb: "eine Abschlussbewertung",
  },
  "orchestrator-agent": {
    variants: ["Agentenperspektiven noch klarer zu einem Vorschlag bündeln", "Reihenfolge der Agentenbeiträge klarer priorisieren"],
    exerciseVerb: "eine Koordinationsempfehlung",
  },
});

// Empfehlung: deterministisch aus der bereits bestehenden Organisations-
// einordnung (agent-organization-service.js) abgeleitet – keine erfundene
// Bewertung, keine Zufallszahl. Sicherheits-/Qualitätsagenten bleiben
// bewusst auf KEEP_CURRENT (kein Autonomiedruck bei sicherheitskritischer
// Funktion); der zentrale Orchestrator und die Koordinationsebene erhalten
// RECOMMEND_SMALL_EXPANSION (reine Empfehlung, siehe oben); alle übrigen
// erhalten TRAIN_FIRST.
function computeHrRecommendation(profile) {
  if (profile.qualityResponsibility.startsWith("Übergreifend:")) return "KEEP_CURRENT";
  if (profile.leadershipLevel === "KOORDINATION" || profile.isCentralOrchestrator) return "RECOMMEND_SMALL_EXPANSION";
  return "TRAIN_FIRST";
}

function buildProposalContent(agentId, runDate) {
  const profile = agentOrganization.buildOrganizationProfile(agentId);
  const focus = AGENT_HR_FOCUS[agentId];
  if (!profile || !focus) {
    throw new Error(`agent-hr-coaching-service: kein HR-Fokus für Agent "${agentId}" hinterlegt.`);
  }
  const variantIndex = deterministicIndex(`${agentId}:${runDate}`, focus.variants.length);
  const focusPhrase = focus.variants[variantIndex];
  const hrRecommendation = computeHrRecommendation(profile);

  const improvementSuggestion = truncate(`Heute 1 % besser: ${focusPhrase}.`, 500);
  const trainingGoal = truncate(`Trainingsziel: ${focus.exerciseVerb} liefern, die diesen Fokus sichtbar umsetzt.`, 500);
  const concreteExercise = truncate(
    `Konkrete Übung: beim nächsten Arbeitsauftrag ${focus.exerciseVerb} erstellen und explizit gegen "${focusPhrase}" prüfen.`,
    500,
  );
  const qualityCriterion = truncate(
    `Qualitätskriterium: Jamal kann ohne Rückfrage erkennen, dass "${focusPhrase}" umgesetzt wurde.`,
    500,
  );
  const possibleAutonomyExpansion = truncate(
    hrRecommendation === "RECOMMEND_SMALL_EXPANSION"
      ? `Könnte künftig zusätzlich einen kurzen Folgehinweis vorschlagen (weiterhin nur Vorschlag, keine Ausführung).`
      : `Noch keine Erweiterung empfohlen – zuerst den heutigen Trainingsfokus zeigen.`,
    500,
  );
  const riskBoundary = truncate(
    `Keine externe Aktion, kein Pluginschreiben, kein automatischer Start ohne Jamal – Autonomierahmen bleibt ${profile.autonomyScope}.`,
    500,
  );
  const requiredJamalDecision = truncate(
    hrRecommendation === "RECOMMEND_SMALL_EXPANSION"
      ? `Soll ${profile.name} den vorgeschlagenen kleinen Zusatzhinweis testweise erhalten?`
      : `Reicht der heutige Trainingsfokus, oder soll ${profile.name} zusätzlich unterstützt werden?`,
    500,
  );
  const reasoning = truncate(
    `Begründung: ${profile.name} ist ${profile.department} zugeordnet (${profile.responsibilityPurpose}); ` +
      `Qualitätsverantwortung: ${profile.qualityResponsibility}.`,
    500,
  );

  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt E/F/J/L) – Rosenberg-
  // Reihenfolge (Beobachtung -> Bedeutung -> Empfehlung -> Entscheidung),
  // 1%-Methode und Nutzenbereich. Bewusst IMMER "Entwicklungspotenzial"/
  // "präventiver Trainingsfokus" statt einer behaupteten Vorfallshistorie
  // (Auftrag Abschnitt F: hierfür liegt in V7.5 keine persistente Evidenz
  // vor – ein tatsächlicher Vorfall würde ausschließlich über
  // agent-reliability-signal-service.js erfasst, niemals hier erfunden).
  const benefitArea = deriveBenefitArea(hrRecommendation);
  const priorityBucket = derivePriorityBucket(hrRecommendation);
  const benefitAreaLabel = BENEFIT_AREA_LABELS_DE[benefitArea];

  const observation = truncate(
    `Entwicklungspotenzial (präventiver Trainingsfokus, keine dokumentierte Leistungshistorie vorhanden): ${focusPhrase}.`,
    500,
  );
  const businessMeaning = truncate(
    `Bedeutung für ${benefitAreaLabel}: stärkt die Qualitätsverantwortung "${profile.qualityResponsibility}".`,
    500,
  );
  const desiredOutcome = truncate(
    `Gewünschtes Ergebnis: ${profile.name} liefert künftig zuverlässig ${focus.exerciseVerb}, die "${focusPhrase}" sichtbar umsetzt.`,
    500,
  );
  const priorityReason = truncate(
    priorityBucket === "NOW"
      ? `Heute vorrangig, weil ein erkennbarer Risiko-/Sicherheitsbezug besteht (${profile.qualityResponsibility}).`
      : `Kleiner, risikoarmer Schritt, der sich gut in den heutigen Tagesablauf einfügt – kein Verdrängen laufender Prioritäten.`,
    500,
  );

  return {
    agentId,
    improvementSuggestion,
    trainingGoal,
    concreteExercise,
    qualityCriterion,
    possibleAutonomyExpansion,
    riskBoundary,
    requiredJamalDecision,
    hrRecommendation,
    reasoning,
    observation,
    businessMeaning,
    desiredOutcome,
    priorityReason,
    benefitArea,
    priorityBucket,
  };
}

// ---------------------------------------------------------------------------
// D. Persistenter täglicher Lauf.
// ---------------------------------------------------------------------------

function auditSafe(db, { eventType, result, actorUserId, runDate, hrRunId, hrProposalId, agentId, recommendationCode, decisionType, pdcaStage }) {
  if (!db) return;
  try {
    const metadata = {};
    if (runDate) metadata.runDate = runDate;
    if (hrRunId) metadata.hrRunId = hrRunId;
    if (hrProposalId) metadata.hrProposalId = hrProposalId;
    if (agentId) metadata.agentKey = agentId;
    if (recommendationCode) metadata.recommendationCode = recommendationCode;
    if (decisionType) metadata.decisionType = decisionType;
    if (pdcaStage) metadata.pdcaStage = pdcaStage;
    authAudit.recordAuditEvent(db, {
      eventType,
      result,
      actorUserId: actorUserId || null,
      tenantId: null,
      timestamp: nowIso(),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (_error) {
    /* Audit darf einen HR-Coaching-Aufruf niemals zum Absturz bringen. */
  }
}

// Rosenberg-Kommunikationsmuster (Auftrag Abschnitt E Ziffer 11) –
// ausschließlich zur Lesezeit aus bereits bestehenden Feldern zusammengesetzt
// (keine eigene Spalte, keine doppelte Speicherung).
function buildCommunicationPattern(row) {
  return `${row.observation} → ${row.businessMeaning} → ${HR_RECOMMENDATION_LABELS_DE[row.hrRecommendation] || row.hrRecommendation} → ${row.requiredJamalDecision}`;
}

function rowToProposalView(row) {
  const benefitAreaLabel = BENEFIT_AREA_LABELS_DE[row.benefitArea] || "UNGEKLÄRT";
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    ownerAgentId: row.agentId,
    runDate: row.runDate,
    improvementSuggestion: row.improvementSuggestion,
    onePercentStep: row.improvementSuggestion,
    trainingGoal: row.trainingGoal,
    concreteExercise: row.concreteExercise,
    trainingExercise: row.concreteExercise,
    qualityCriterion: row.qualityCriterion,
    successMetric: row.qualityCriterion,
    possibleAutonomyExpansion: row.possibleAutonomyExpansion,
    riskBoundary: row.riskBoundary,
    safetyBoundary: row.riskBoundary,
    requiredJamalDecision: row.requiredJamalDecision,
    hrRecommendation: row.hrRecommendation,
    hrRecommendationLabel: HR_RECOMMENDATION_LABELS_DE[row.hrRecommendation] || "UNGEKLÄRT",
    reasoning: row.reasoning,
    status: row.status,
    statusLabel: PROPOSAL_STATUS_LABELS_DE[row.status] || "UNGEKLÄRT",
    jamalNote: row.jamalNote || null,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt || null,
    autonomyChangeApplied: false,
    // Unternehmensleitlinien V1.0 (Auftrag Abschnitt E).
    observation: row.observation,
    businessMeaning: row.businessMeaning,
    desiredOutcome: row.desiredOutcome,
    priorityReason: row.priorityReason,
    communicationPattern: buildCommunicationPattern(row),
    benefitArea: row.benefitArea,
    benefitAreaLabel,
    expectedBenefit: `${benefitAreaLabel} für ${row.agentId} und die Zentrale insgesamt.`,
    priorityBucket: row.priorityBucket,
    priorityBucketLabel: PRIORITY_BUCKET_LABELS_DE[row.priorityBucket] || "UNGEKLÄRT",
    nextReviewDate: row.nextReviewDate,
    pdcaStage: row.pdcaStage,
    pdcaStageLabel: PDCA_STAGE_LABELS_DE[row.pdcaStage] || "UNGEKLÄRT",
    pdcaDecision: row.pdcaDecision || null,
    pdcaDecisionLabel: row.pdcaDecision ? PDCA_DECISION_LABELS_DE[row.pdcaDecision] || "UNGEKLÄRT" : null,
    pdcaStageChangedAt: row.pdcaStageChangedAt || null,
    reliabilitySignal: row.reliabilitySignal,
    reliabilitySignalLabel: RELIABILITY_SIGNAL_ON_PROPOSAL_LABELS_DE[row.reliabilitySignal] || "UNGEKLÄRT",
  };
}

function summarizeRunStatus(proposals) {
  if (proposals.length === 0) return "READY_FOR_REVIEW";
  const reviewedCount = proposals.filter((proposal) => proposal.status !== "PROPOSED").length;
  if (reviewedCount === 0) return "READY_FOR_REVIEW";
  if (reviewedCount < proposals.length) return "PARTIALLY_REVIEWED";
  return "FULLY_REVIEWED";
}

const RUN_STATUS_LABELS_DE = Object.freeze({
  READY_FOR_REVIEW: "Bereit zur Prüfung",
  PARTIALLY_REVIEWED: "Teilweise geprüft",
  FULLY_REVIEWED: "Vollständig geprüft",
});

function rowToRunView(runRow, proposalRows) {
  const proposals = proposalRows.map(rowToProposalView);
  const runStatus = summarizeRunStatus(proposals);
  return {
    id: runRow.id,
    runDate: runRow.runDate,
    createdAt: runRow.createdAt,
    proposalCount: proposals.length,
    status: runStatus,
    statusLabel: RUN_STATUS_LABELS_DE[runStatus],
    proposals,
  };
}

// Idempotent (Auftrag Abschnitt D): ein zweiter Aufruf für denselben
// Kalendertag erzeugt keinen zweiten aktiven Lauf, sondern liefert den
// bereits bestehenden Lauf unverändert zurück (runDate UNIQUE erzwingt
// dies zusätzlich auf Datenbankebene).
function getOrCreateTodaysRun(db, options = {}) {
  const now = options.now || new Date();
  const runDate = isoDate(now);
  const existing = authDb.getAgentHrDailyRunByDate(db, runDate);
  if (existing) {
    const proposals = authDb.listAgentHrDailyProposalsForRun(db, existing.id);
    return { view: rowToRunView(existing, proposals), created: false };
  }

  const runId = crypto.randomUUID();
  const createdAt = nowIso(now);
  let runRow;
  try {
    runRow = authDb.insertAgentHrDailyRun(db, { id: runId, runDate, createdAt });
  } catch (_error) {
    // Wettlaufsicherheit: falls zwischen dem obigen Lesen und dem Insert ein
    // anderer Aufruf denselben Tag bereits angelegt hat (runDate UNIQUE
    // schlägt fehl), wird der inzwischen bestehende Lauf geladen statt ein
    // Fehler nach außen gegeben – kein zweiter aktiver Vorschlagssatz.
    const raceExisting = authDb.getAgentHrDailyRunByDate(db, runDate);
    if (!raceExisting) throw _error;
    const proposals = authDb.listAgentHrDailyProposalsForRun(db, raceExisting.id);
    return { view: rowToRunView(raceExisting, proposals), created: false };
  }

  const proposalInputs = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => {
    const content = buildProposalContent(agent.id, runDate);
    return {
      id: crypto.randomUUID(),
      runId,
      runDate,
      status: "PROPOSED",
      createdAt,
      nextReviewDate: computeNextReviewDate(runDate),
      pdcaStage: "PLAN",
      pdcaDecision: null,
      pdcaStageChangedAt: null,
      reliabilitySignal: "NONE",
      ...content,
    };
  });
  const proposalRows = authDb.insertAgentHrDailyProposalsBatch(db, proposalInputs);

  auditSafe(db, {
    eventType: "HR_DAILY_RUN_CREATED",
    result: "OK",
    actorUserId: options.actorUserId,
    runDate,
    hrRunId: runId,
  });

  return { view: rowToRunView(runRow, proposalRows), created: true };
}

function getTodaysRun(db, options = {}) {
  const now = options.now || new Date();
  const runDate = isoDate(now);
  const runRow = authDb.getAgentHrDailyRunByDate(db, runDate);
  if (!runRow) return { hasRun: false, view: null };
  const proposals = authDb.listAgentHrDailyProposalsForRun(db, runRow.id);
  return { hasRun: true, view: rowToRunView(runRow, proposals) };
}

const REVIEW_AUDIT_EVENT_BY_STATUS = Object.freeze({
  REVIEWED: "HR_PROPOSAL_REVIEWED",
  APPROVED: "HR_PROPOSAL_APPROVED",
  REJECTED: "HR_PROPOSAL_REJECTED",
  DEFERRED: "HR_PROPOSAL_DEFERRED",
});

// F/M. Prüft/entscheidet über EINEN Vorschlag. WICHTIG (Auftrag Abschnitt
// D/M): "APPROVED" markiert ausschließlich, dass Jamal die HR-Empfehlung
// zur Kenntnis genommen und den Vorschlag angenommen hat – es gibt in
// diesem Modul keinerlei Codepfad, der dadurch eine tatsächliche
// Berechtigung/Autonomiestufe in agent-registry.js verändert (dort existiert
// ohnehin kein änderbares Feld dafür).
function reviewProposal(db, options = {}) {
  const proposalId = options.proposalId;
  const status = options.status;
  if (!proposalId) throw badRequest("proposalId ist erforderlich.");
  if (!PROPOSAL_STATUS_VALUES.includes(status) || status === "PROPOSED") {
    throw badRequest("Ein gültiger Prüfstatus ist erforderlich (REVIEWED, APPROVED, REJECTED oder DEFERRED).");
  }
  const row = authDb.getAgentHrDailyProposalById(db, proposalId);
  if (!row) throw notFound("Dieser HR-Vorschlag wurde nicht gefunden.");

  const now = options.now || new Date();
  const updated = authDb.updateAgentHrDailyProposalReview(db, {
    id: proposalId,
    status,
    jamalNote: options.jamalNote ? truncate(options.jamalNote, 500) : row.jamalNote,
    reviewedAt: nowIso(now),
  });

  auditSafe(db, {
    eventType: REVIEW_AUDIT_EVENT_BY_STATUS[status] || "HR_PROPOSAL_REVIEWED",
    result: "OK",
    actorUserId: options.actorUserId,
    runDate: row.runDate,
    hrRunId: row.runId,
    hrProposalId: row.id,
    agentId: row.agentId,
    recommendationCode: row.hrRecommendation,
    decisionType: status,
  });

  return rowToProposalView(updated);
}

// G. PDCA als echter Entwicklungszyklus (Auftrag Abschnitt G) – kleinste
// sinnvolle Struktur statt einer umfassenden Workflow-Engine: genau EIN
// Vorwärtsschritt je Aufruf (PLAN->DO->CHECK->ACT), niemals ein Sprung,
// niemals rückwärts, niemals automatisch. PLAN->DO benötigt zusätzlich, dass
// der Vorschlag bereits status=APPROVED trägt (Jamals Freigabe ist
// Voraussetzung, aber kein automatischer Auslöser dieses Übergangs).
// CHECK->ACT benötigt eine explizite Abschlussentscheidung
// (KEEP/ADJUST/REPEAT/DISCARD). Kein Übergang verändert status/
// hrRecommendation oder einen tatsächlichen Autonomierahmen.
function advanceHrPdcaStage(db, options = {}) {
  const proposalId = options.proposalId;
  const targetStage = options.targetStage;
  if (!proposalId) throw badRequest("proposalId ist erforderlich.");
  if (!PDCA_STAGE_VALUES.includes(targetStage) || targetStage === "PLAN") {
    throw badRequest("Eine gültige Ziel-PDCA-Stufe ist erforderlich (DO, CHECK oder ACT).");
  }
  const row = authDb.getAgentHrDailyProposalById(db, proposalId);
  if (!row) throw notFound("Dieser HR-Vorschlag wurde nicht gefunden.");

  const currentIndex = PDCA_STAGE_ORDER.indexOf(row.pdcaStage);
  const targetIndex = PDCA_STAGE_ORDER.indexOf(targetStage);
  if (targetIndex !== currentIndex + 1) {
    throw conflict(
      `Ungültiger PDCA-Übergang von ${row.pdcaStage} zu ${targetStage} – erlaubt ist ausschließlich der jeweils nächste Schritt, kein Sprung und kein Rückschritt.`,
    );
  }
  if (targetStage === "DO" && row.status !== "APPROVED") {
    throw conflict("Der Übergang von PLAN zu DO erfordert zuerst eine Genehmigung (status APPROVED) dieses Vorschlags.");
  }
  let pdcaDecision = row.pdcaDecision || null;
  if (targetStage === "ACT") {
    if (!PDCA_DECISION_VALUES.includes(options.pdcaDecision)) {
      throw badRequest("Der Übergang zu ACT erfordert eine Abschlussentscheidung (KEEP, ADJUST, REPEAT oder DISCARD).");
    }
    pdcaDecision = options.pdcaDecision;
  }

  const now = options.now || new Date();
  const updated = authDb.updateAgentHrDailyProposalPdcaStage(db, {
    id: proposalId,
    pdcaStage: targetStage,
    pdcaDecision,
    pdcaStageChangedAt: nowIso(now),
  });

  auditSafe(db, {
    eventType: "HR_PDCA_STAGE_CHANGED",
    result: "OK",
    actorUserId: options.actorUserId,
    runDate: row.runDate,
    hrRunId: row.runId,
    hrProposalId: row.id,
    agentId: row.agentId,
    pdcaStage: targetStage,
    decisionType: targetStage === "ACT" ? pdcaDecision : null,
  });

  return rowToProposalView(updated);
}

function auditOrganizationReviewed(db, options = {}) {
  auditSafe(db, {
    eventType: "AGENT_ORGANIZATION_REVIEWED",
    result: "OK",
    actorUserId: options.actorUserId,
  });
}

module.exports = {
  AgentHrCoachingError,
  HR_RECOMMENDATION_VALUES,
  PROPOSAL_STATUS_VALUES,
  HR_RECOMMENDATION_LABELS_DE,
  PROPOSAL_STATUS_LABELS_DE,
  RUN_STATUS_LABELS_DE,
  // Unternehmensleitlinien V1.0
  PDCA_STAGE_VALUES,
  PDCA_DECISION_VALUES,
  RELIABILITY_SIGNAL_ON_PROPOSAL_VALUES,
  BENEFIT_AREA_VALUES,
  PRIORITY_BUCKET_VALUES,
  PDCA_STAGE_LABELS_DE,
  PDCA_DECISION_LABELS_DE,
  RELIABILITY_SIGNAL_ON_PROPOSAL_LABELS_DE,
  BENEFIT_AREA_LABELS_DE,
  PRIORITY_BUCKET_LABELS_DE,
  deriveBenefitArea,
  derivePriorityBucket,
  computeNextReviewDate,
  advanceHrPdcaStage,
  buildProposalContent,
  computeHrRecommendation,
  getOrCreateTodaysRun,
  getTodaysRun,
  reviewProposal,
  auditOrganizationReviewed,
  rowToProposalView,
  rowToRunView,
  summarizeRunStatus,
};
