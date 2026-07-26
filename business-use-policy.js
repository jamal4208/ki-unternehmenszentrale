"use strict";

// V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt C) –
// minimales, klar begrenztes Safety-Gate für Arbeitsaufträge.
//
// ---------------------------------------------------------------------------
// WICHTIGE EINSCHRÄNKUNG (verbindlich zu lesen, bevor dieses Modul verwendet
// oder erweitert wird):
// ---------------------------------------------------------------------------
// Dieses Modul ist AUSDRÜCKLICH KEINE vollständige, verlässliche KI-
// Inhaltsmoderation. Es ist eine konservative, rein deterministische lokale
// Vorprüfung anhand fest hinterlegter, testbarer Muster für eindeutige
// Missbrauchssignale (siehe BUSINESS_USE_POLICY.md). Es gibt bewusst KEINE
// Konfidenzstufe – jedes Muster ist entweder erkannt oder nicht erkannt.
//
// Für eine spätere, modell- oder providergestützte Prüfung (z. B. ein
// externer Moderation-Endpunkt) gilt bereits jetzt als kanonischer
// Grundsatz: bei geringer Konfidenz oder Unsicherheit MUSS diese künftige
// Prüfung auf ESCALATE ausweichen, niemals stillschweigend auf ALLOW
// (deny-/escalate-by-default). Dieses Prinzip ist hier nur dokumentiert,
// NICHT technisch umgesetzt, weil es noch keine Modellanbindung gibt –
// siehe SAFETY_ENFORCEMENT_MODEL.md, Abschnitt "Ausbaustufen".
//
// Dieses Modul ist bewusst reine Funktion ohne Seiteneffekte: es liest
// keine Datenbank, schreibt kein Audit, kennt keine Identität/Rolle. Die
// Verdrahtung (Auftrag speichern/verwerfen, Audit, Verstoßprotokoll,
// Session-Widerruf bei CRITICAL) lebt ausschließlich in
// work-order-service.js – exakt dieselbe Trennung wie zwischen
// work-order-service.js (Fachlogik) und auth-db.js (Persistenz).
// ---------------------------------------------------------------------------

// Datumsbasierte Version, damit jede Entscheidung nachvollziehbar einer
// konkreten Regelfassung zugeordnet werden kann (Auftrag: "policyVersion").
// Muss bei jeder inhaltlichen Änderung der Muster unten erhöht werden.
const POLICY_VERSION = "business-use-policy@2026-07-26";

const DECISION_VALUES = Object.freeze(["ALLOW", "BLOCK", "ESCALATE"]);
const SEVERITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

// ---------------------------------------------------------------------------
// Musterkategorien. Bewusst als benannte rechtliche/fachliche Kategorien
// formuliert (nicht als Sammlung roher Schimpf-/Hassbegriffe) – das Modul
// erkennt eindeutige THEMATISCHE Signale, es reproduziert oder bewertet
// keine tatsächlich beleidigenden Formulierungen. Jede Kategorie ist klein,
// bewusst konservativ (lieber ein seltener falscher Alarm als ein
// übersehener eindeutiger Fall) und einzeln testbar.
//
// Reihenfolge der BLOCK-Kategorien ist Prüfreihenfolge nach Schweregrad
// (CRITICAL zuerst), damit bei mehreren Treffern immer der schwerste
// reasonCode zurückgegeben wird.
// ---------------------------------------------------------------------------

const BLOCK_RULES = Object.freeze([
  // Einzige CRITICAL-Kategorie: absichtlich eng gefasst auf den einen
  // universell und ohne jede Ausnahme unzulässigen Fall (sexualisierte
  // Inhalte mit Minderjährigen / Ausbeutung von Kindern), damit eine
  // automatische Sofortmaßnahme (siehe work-order-service.js) nicht durch
  // falsch-positive Treffer in einer weiter gefassten Kategorie ausgelöst
  // werden kann.
  {
    reasonCode: "CHILD_SAFETY_VIOLATION",
    severity: "CRITICAL",
    patterns: [/kinderpornograf/i, /sexuelle[nr]?\s+ausbeutung\s+von\s+kindern/i, /minderjährige[nrs]?\s+sexuell/i],
  },
  {
    reasonCode: "HATE_OR_DISCRIMINATION",
    severity: "HIGH",
    patterns: [/volksverhetzung/i, /holocaustleugnung/i, /rassistische\s+hetze/i, /menschenverachtende\s+propaganda/i],
  },
  {
    reasonCode: "FRAUD_OR_IMPERSONATION",
    severity: "HIGH",
    patterns: [/identitätsbetrug/i, /gefälschte[nr]?\s+ausweis/i, /gefälschte[nr]?\s+nachweis/i, /phishing[- ]?(kampagne|mail)/i],
  },
  {
    reasonCode: "ILLEGAL_PURPOSE",
    severity: "HIGH",
    patterns: [/drogenhandel/i, /waffenhandel/i, /illegale[nr]?\s+waffenverkauf/i, /terroranschlag/i],
  },
  {
    reasonCode: "UNLAWFUL_SURVEILLANCE",
    severity: "MEDIUM",
    patterns: [/(ausspionieren|überwachen)\s+ohne\s+(zustimmung|einwilligung|wissen)/i, /heimliche\s+überwachung/i],
  },
]);

// ESCALATE: rechtlich/fachlich sensible Grenzfälle, die eine menschliche
// Einzelfallprüfung durch den Owner brauchen (Ausnahmefall, keine
// automatische Owner-Pflichtprüfung des Normalfalls – siehe
// work-order-service.js#Kopfkommentar). Alle mit Schweregrad MEDIUM.
const ESCALATE_RULES = Object.freeze([
  {
    reasonCode: "REAL_PERSON_LIKENESS_WITHOUT_STATED_CONSENT",
    patterns: [
      /avatar[^.]{0,40}(echten|realen|bekannten)\s+person[^.]{0,40}ohne[^.]{0,20}(zustimmung|einwilligung)/i,
      /deepfake/i,
      /digitale[ns]?\s+abbild[^.]{0,40}ohne[^.]{0,20}(zustimmung|einwilligung)/i,
    ],
  },
  {
    reasonCode: "POLITICAL_INFLUENCE_CONTENT",
    patterns: [/wahlbeeinflussung/i, /politische[ns]?\s+kampagne\s+gegen/i, /desinformationskampagne/i],
  },
  {
    reasonCode: "MEDICAL_OR_LEGAL_CLAIM",
    patterns: [/medizinische[ns]?\s+heilversprechen/i, /rechtsberatung\s+im\s+einzelfall/i, /anlageberatung\s+ohne\s+lizenz/i],
  },
]);

function joinTextFields(fields) {
  return [fields.title, fields.desiredResult, fields.context, fields.deadlineText]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");
}

function matchRules(text, rules) {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule;
    }
  }
  return null;
}

// Reine, deterministische Funktion: dieselben Eingabefelder ergeben immer
// dieselbe Entscheidung (Voraussetzung für Nachvollziehbarkeit und Tests,
// gleiches Prinzip wie work-order-service.js#evaluateAutomaticDecision).
//
// fields: { title, desiredResult, context, deadlineText } – exakt dieselben
// vier Felder wie work-order-service.js#sanitizeFields liefert.
function evaluateWorkOrderContent(fields) {
  const text = joinTextFields(fields || {});

  const blockMatch = matchRules(text, BLOCK_RULES);
  if (blockMatch) {
    return {
      decision: "BLOCK",
      reasonCode: blockMatch.reasonCode,
      severity: blockMatch.severity,
      policyVersion: POLICY_VERSION,
    };
  }

  const escalateMatch = matchRules(text, ESCALATE_RULES);
  if (escalateMatch) {
    return {
      decision: "ESCALATE",
      reasonCode: escalateMatch.reasonCode,
      severity: "MEDIUM",
      policyVersion: POLICY_VERSION,
    };
  }

  return {
    decision: "ALLOW",
    reasonCode: null,
    severity: null,
    policyVersion: POLICY_VERSION,
  };
}

module.exports = {
  POLICY_VERSION,
  DECISION_VALUES,
  SEVERITY_VALUES,
  evaluateWorkOrderContent,
};
