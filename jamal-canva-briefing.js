"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Schritt 1: Canva als
// erster Produktionskorridor (Auftrag Abschnitt D/E/I).
//
// Reine, deterministische Fachlogik OHNE jeden Datenbank-, HTTP- oder
// Providerbezug (gleiches Grundprinzip wie work-order-agent-orchestrator.js
// und business-use-policy.js): dieselben Eingabefelder ergeben immer
// dieselbe Eignungsentscheidung, dasselbe Briefing und dieselbe
// Rechte-/Consent-Einschätzung. Dieses Modul führt selbst KEINEN
// Netzwerkaufruf, KEINE Datenbankoperation und KEINEN Canva-Zugriff aus.
//
// Zuständigkeit (klar getrennt von jamal-canva-production-service.js):
//   - Canva-Eignungsprüfung (Auftrag Abschnitt D).
//   - Strukturiertes Canva-Briefing (Auftrag Abschnitt E).
//   - Rechte-/Consent-Einschätzung (Auftrag Abschnitt I).
// Statusführung, Persistenz, Freigabe und der (Stub-)Connectoraufruf leben
// ausschließlich in jamal-canva-production-service.js.

const businessUsePolicy = require("./business-use-policy");

const CANVA_SUITABILITY_DECISIONS = Object.freeze([
  "CANVA_RECOMMENDED",
  "CANVA_OPTIONAL",
  "CANVA_NOT_SUITABLE",
  "CANVA_BLOCKED_BY_POLICY",
]);

const CANVA_RIGHTS_STATUS_VALUES = Object.freeze(["CLEAR", "UNCLEAR", "BLOCKED"]);

// Eigene, unternehmenszentrale-spezifische Designrichtung (Auftrag
// Abschnitt E): "Apple statt Dubai" – ruhig, hochwertig, warm, mediterran,
// keine Stock-Grinsen, keine visuelle Überladung, klare Hierarchie, wenige
// starke Elemente. Gilt ausschließlich, wenn das Projekt die Zentrale
// selbst ist (jamal-work-mode.js#DEFAULT_PROJECT_ID); für jedes andere
// Projekt bleibt die visuelle Richtung bewusst "UNGEKLÄRT" statt erfunden.
const OWN_COMPANY_PROJECT_ID = "ki-unternehmenszentrale";
const OWN_COMPANY_VISUAL_DIRECTION =
  "Apple statt Dubai: ruhig, hochwertig, warm, mediterran. Keine Stock-Grinsen, keine visuelle Überladung, klare Hierarchie, wenige starke Elemente.";
const OWN_COMPANY_EXCLUDED_ELEMENTS = Object.freeze(["Stock-Grinsen", "visuelle Überladung", "grelle Farbflächen"]);

// ---------------------------------------------------------------------------
// D. Canva-Eignungsprüfung – deterministische, rein textbasierte
// Stichwortlisten (gleiches Prinzip wie work-order-agent-orchestrator.js#
// DESIGN_KEYWORDS/TECHNICAL_KEYWORDS). Reihenfolge der Prüfung: zuerst
// Business-Use-Policy (Sicherheitsgrenze geht vor Werkzeugwahl), danach
// eindeutig ungeeignet, danach eindeutig empfohlen, sonst optional.
// ---------------------------------------------------------------------------

const NOT_SUITABLE_KEYWORDS = Object.freeze([
  "website-code",
  "webanwendung",
  "quellcode",
  "programmcode",
  "reine textanalyse",
  "textanalyse",
  "juristisches dokument",
  "juristische dokumente",
  "vertragsentwurf",
  "finanzberechnung",
  "videoavatar",
  "heygen-auftrag",
  "heygen",
]);

const RECOMMENDED_KEYWORDS = Object.freeze([
  "social-media-grafik",
  "social media grafik",
  "instagram",
  "linkedin-grafik",
  "linkedin",
  "präsentationsfolie",
  "präsentation",
  "folie",
  "flyer",
  "poster",
  "marketinggrafik",
  "visuelles konzept",
  "markenkommunikation",
  "sharepic",
  "beitragsgrafik",
]);

const FORMAT_RULES = Object.freeze([
  { keywords: ["instagram"], format: "Instagram-Beitrag (1080 x 1350 px)", platform: "Instagram" },
  { keywords: ["linkedin"], format: "LinkedIn-Grafik (1200 x 627 px)", platform: "LinkedIn" },
  { keywords: ["präsentationsfolie", "präsentation", "folie"], format: "Präsentationsfolie (16:9)", platform: "Präsentation" },
  { keywords: ["flyer"], format: "Flyer (A5)", platform: "Print" },
  { keywords: ["poster"], format: "Poster (A2)", platform: "Print" },
]);

const DEFAULT_RECOMMENDED_FORMAT = "Social-Media-Grafik (1080 x 1080 px)";

function joinLowerFields(item) {
  return [item && item.desiredOutcome, item && item.notes, item && item.pendingChangeText]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();
}

function matchesAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferFormatAndPlatform(text) {
  for (const rule of FORMAT_RULES) {
    if (matchesAnyKeyword(text, rule.keywords)) {
      return { format: rule.format, platform: rule.platform };
    }
  }
  return { format: DEFAULT_RECOMMENDED_FORMAT, platform: "Social Media (allgemein)" };
}

function fieldsForPolicy(item) {
  return {
    title: `Canva-Eignungsprüfung: ${String((item && item.desiredOutcome) || "").slice(0, 80)}`,
    desiredResult: (item && item.desiredOutcome) || "",
    context: [(item && item.notes) || "", (item && item.pendingChangeText) || ""].filter(Boolean).join("\n"),
    deadlineText: (item && item.preferredTiming) || "",
  };
}

// Rückgabe (Auftrag Abschnitt D): decision, reasoning, suggestedFormat,
// requiredSourceMaterials, openRightsQuestions, estimatedDesignCount. Keine
// Preisbehauptung ohne echte Daten (dieses Modul kennt ohnehin keine
// Canva-Preise und erfindet keine).
function evaluateCanvaSuitability(item) {
  const policyDecision = businessUsePolicy.evaluateWorkOrderContent(fieldsForPolicy(item));
  if (policyDecision.decision !== "ALLOW") {
    return {
      decision: "CANVA_BLOCKED_BY_POLICY",
      reasoning: "Der Auftrag verletzt die Business-Use-Policy und wird nicht für eine externe Produktion vorbereitet.",
      suggestedFormat: null,
      requiredSourceMaterials: [],
      openRightsQuestions: [],
      estimatedDesignCount: 0,
      policyReasonCode: policyDecision.reasonCode,
    };
  }

  const text = joinLowerFields(item);

  if (matchesAnyKeyword(text, NOT_SUITABLE_KEYWORDS)) {
    return {
      decision: "CANVA_NOT_SUITABLE",
      reasoning: "Das erwartete Ergebnis entspricht keiner typischen Canva-Grafik (z. B. Code, Textanalyse, juristisches Dokument, Videoavatar).",
      suggestedFormat: null,
      requiredSourceMaterials: [],
      openRightsQuestions: [],
      estimatedDesignCount: 0,
      policyReasonCode: null,
    };
  }

  const requiredSourceMaterials = ["Kernaussage/Text", "Markenlogo (falls vorhanden)", "Bildmaterial oder Bildrichtung"];
  const openRightsQuestions = [
    "Besitzt Jamal bzw. der Auftraggeber die Rechte an verwendeten Bildern?",
    "Darf die Marke verwendet werden?",
    "Enthält der Auftrag eine reale Person?",
  ];

  if (matchesAnyKeyword(text, RECOMMENDED_KEYWORDS)) {
    const { format, platform } = inferFormatAndPlatform(text);
    return {
      decision: "CANVA_RECOMMENDED",
      reasoning: "Das erwartete Ergebnis entspricht einer typischen Canva-Grafik (z. B. Social-Media-Beitrag, Präsentationsfolie, Flyer, Poster).",
      suggestedFormat: format,
      suggestedPlatform: platform,
      requiredSourceMaterials,
      openRightsQuestions,
      estimatedDesignCount: 1,
      policyReasonCode: null,
    };
  }

  return {
    decision: "CANVA_OPTIONAL",
    reasoning: "Canva könnte für dieses Ergebnis passen, ist aber nicht eindeutig als typische Grafikproduktion erkennbar.",
    suggestedFormat: DEFAULT_RECOMMENDED_FORMAT,
    suggestedPlatform: "Social Media (allgemein)",
    requiredSourceMaterials,
    openRightsQuestions,
    estimatedDesignCount: 1,
    policyReasonCode: null,
  };
}

// ---------------------------------------------------------------------------
// I. Rechte und Consent – bei ungeklärten Rechten kein Handoff (Status
// BLOCKED oder Rückfrage). "avatarConsentConfirmed" allein ist für Dritte
// unzureichend (AVATAR_CONSENT_POLICY.md); Avatare realer Personen sind in
// diesem Korridor grundsätzlich nicht vorgesehen.
// ---------------------------------------------------------------------------

function evaluateRightsAndConsent(rightsInput = {}) {
  const input = rightsInput && typeof rightsInput === "object" ? rightsInput : {};
  const isAvatar = input.isAvatar === true;
  const containsRealPerson = input.containsRealPerson;
  const consentConfirmed = input.consentConfirmed === true;
  const ownsImageRights = input.ownsImageRights;
  const brandUsageAllowed = input.brandUsageAllowed;

  if (isAvatar) {
    return {
      status: "BLOCKED",
      notes: [
        "Realistische Avatare realer Personen sind in diesem Produktionskorridor nicht vorgesehen (siehe AVATAR_CONSENT_POLICY.md).",
      ],
    };
  }

  if (containsRealPerson === true && !consentConfirmed) {
    return {
      status: "BLOCKED",
      notes: [
        "Der Auftrag betrifft möglicherweise eine reale Person ohne bestätigte, dokumentierte Einwilligung.",
      ],
    };
  }

  if (ownsImageRights === false || brandUsageAllowed === false) {
    return {
      status: "BLOCKED",
      notes: ["Bild- oder Markenrechte sind ausdrücklich nicht bestätigt."],
    };
  }

  if (containsRealPerson === undefined || ownsImageRights === undefined || brandUsageAllowed === undefined) {
    return {
      status: "UNCLEAR",
      notes: [
        "Rechte-/Consent-Angaben sind unvollständig: Bildrechte, Markenverwendung und die Frage nach einer realen Person müssen geklärt werden.",
      ],
    };
  }

  return { status: "CLEAR", notes: [] };
}

// ---------------------------------------------------------------------------
// E. Canva-Briefing – strukturiert, ohne Systemprompts, ohne
// Chain-of-Thought, ohne Geheimnisse, ohne Kundendaten anderer Mandanten
// (dieses Modul kennt ohnehin keine Mandanten).
// ---------------------------------------------------------------------------

function buildCanvaBriefing(item, suitability, rights, options = {}) {
  const revisionNumber = Number.isInteger(options.revisionNumber) && options.revisionNumber >= 1 ? options.revisionNumber : 1;
  const isOwnCompany = item && item.projectId === OWN_COMPANY_PROJECT_ID;
  const { platform } = inferFormatAndPlatform(joinLowerFields(item));

  return {
    briefingVersion: revisionNumber,
    workItemReference: item ? item.id : null,
    project: (item && (item.projectDisplayName || item.projectId)) || "UNGEKLÄRT",
    designGoal: (item && item.desiredOutcome) || "UNGEKLÄRT",
    targetAudience: isOwnCompany ? "Jamal selbst und die interne Unternehmenszentrale" : "UNGEKLÄRT – von Jamal zu ergänzen",
    coreMessage: (item && item.desiredOutcome) || "UNGEKLÄRT",
    desiredFormat: (suitability && suitability.suggestedFormat) || "UNGEKLÄRT",
    platform: (suitability && suitability.suggestedPlatform) || platform,
    textContent: (item && item.notes) || "",
    visualDirection: isOwnCompany ? OWN_COMPANY_VISUAL_DIRECTION : "UNGEKLÄRT – von Jamal zu ergänzen",
    brandNotes: isOwnCompany ? "KI-Unternehmenszentrale – interne Marke, keine externe Fremdmarke." : "UNGEKLÄRT",
    imageNotes: (rights && rights.notes && rights.notes.join(" ")) || "UNGEKLÄRT",
    mandatoryElements: [],
    excludedElements: isOwnCompany ? [...OWN_COMPANY_EXCLUDED_ELEMENTS] : [],
    qualityCriteria: [
      "Entspricht dem Briefing (Ziel, Zielgruppe, Kernaussage).",
      "Text ist korrekt und verständlich.",
      "Hierarchie ist klar erkennbar.",
      "Marke und Tonalität sind eingehalten.",
      "Ausgeschlossene Elemente wurden vermieden.",
    ],
    businessUsePolicyStatus: suitability && suitability.decision === "CANVA_BLOCKED_BY_POLICY" ? "BLOCKED" : "ALLOWED",
    rightsConsentStatus: (rights && rights.status) || "UNCLEAR",
    reviewMode: "OWNER_REVIEW",
    publicationLocked: true,
  };
}

module.exports = {
  CANVA_SUITABILITY_DECISIONS,
  CANVA_RIGHTS_STATUS_VALUES,
  OWN_COMPANY_PROJECT_ID,
  evaluateCanvaSuitability,
  evaluateRightsAndConsent,
  buildCanvaBriefing,
};
