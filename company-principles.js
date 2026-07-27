"use strict";

// V7.5 – Unternehmensleitlinien V1.0 als verbindliche Betriebslogik.
//
// Dieses Modul ist die MASCHINENLESBARE Seite der Unternehmensleitlinien
// (Auftrag Abschnitt D). Die menschenlesbare Seite ist ausschließlich
// COMPANY_PRINCIPLES.md – es gibt bewusst KEINE zweite Dokumentations-
// wahrheit: dieses Modul enthält keine langen Erklärtexte, sondern nur die
// strukturierten Felder, die andere Module (agent-hr-coaching-service.js,
// technology-radar-service.js, agent-organization-service.js,
// agent-leadership-routes.js) für Prüfungen und Verweise benötigen.
//
// Keine dynamische Ausführung externer Inhalte, keine freie Regel-Engine,
// keine Chain-of-Thought: jede Regel ist ein einfaches, statisches
// Objektliteral. COMPANY_PRINCIPLES_VERSION muss exakt der "Version: 1.0"
// aus COMPANY_PRINCIPLES.md entsprechen (siehe
// company-principles.test.js).
//
// Dieses Modul importiert KEIN better-sqlite3 und führt KEINEN
// Netzwerkaufruf aus.

const COMPANY_PRINCIPLES_VERSION = "1.0";

const PRINCIPLE_CONTEXTS = Object.freeze([
  "AGENT_WORK",
  "HR_COACHING",
  "QUALITY_REVIEW",
  "TECH_RADAR",
  "FUTURE_FORESIGHT",
  "CUSTOMER_COMMUNICATION",
  "PROJECT_LEADERSHIP",
]);

const PRINCIPLE_CATEGORY_VALUES = Object.freeze(["LEADERSHIP_FRAMEWORK", "VALUE", "SAFETY_BOUNDARY"]);

// ---------------------------------------------------------------------------
// LEADERSHIP_FRAMEWORK – genau sechs Einträge (Auftrag Abschnitt B/Q Ziffer
// 2: "alle sechs Führungsprinzipien strukturiert vorhanden"). Jeder Eintrag
// überträgt EIN fremdes Konzept in eigenen Worten in eine interne
// Arbeitsregel – keine langen Fremdzitate, keine urheberrechtlich
// geschützten Buchpassagen.
// ---------------------------------------------------------------------------
const LEADERSHIP_FRAMEWORK_PRINCIPLES = Object.freeze([
  Object.freeze({
    principleId: "FRAMEWORK_COVEY",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Richtung, Ergebnis, Priorität, Verantwortung, Synergie",
    internalRule:
      "Jede Empfehlung benennt zuerst die Richtung und das gewünschte Ergebnis, ordnet danach eine Priorität zu, weist genau eine verantwortliche Rolle aus und nutzt Zusammenarbeit als Ergänzung, nicht als Ersatz dieser Verantwortung.",
    requiredEvidence: "HR-Vorschlag/Radar-Eintrag enthält desiredOutcome, priorityBucket und genau eine Owner-Rolle (agentId).",
    applicableContexts: ["AGENT_WORK", "HR_COACHING", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Priorisierung ersetzt keine Jamal-Entscheidung; sie bereitet sie nur vor.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "FRAMEWORK_ROSENBERG",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Beobachtung vor Bewertung, klare Empfehlung, konkrete Entscheidung",
    internalRule:
      "Jede Rückmeldung folgt der Reihenfolge Beobachtung ohne vorschnelle Bewertung, Bedeutung/Bedarf, klare Empfehlung und konkrete benötigte Entscheidung oder Bitte – niemals ein pauschales Urteil ohne diese Reihenfolge.",
    requiredEvidence: "HR-Vorschlag enthält observation, businessMeaning, hrRecommendation und requiredJamalDecision in dieser Reihenfolge (communicationPattern).",
    applicableContexts: ["HR_COACHING", "QUALITY_REVIEW", "CUSTOMER_COMMUNICATION"],
    safetyBoundary: "Beobachtung ohne persistente Evidenz wird als Entwicklungspotenzial/präventiver Trainingsfokus formuliert, niemals als behaupteter Vorfall.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "FRAMEWORK_ONE_PERCENT",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Tägliche kleine, rollenbezogene, messbare Entwicklung",
    internalRule:
      "Entwicklung geschieht in kleinen, an einem Tag trainierbaren Schritten, die zur jeweiligen Rolle passen und ein prüfbares Erfolgskriterium besitzen – keine große Umstrukturierung als 'Tagesschritt'.",
    requiredEvidence: "Jeder HR-Vorschlag enthält onePercentStep (improvementSuggestion) und successMetric (qualityCriterion), beide rollenbezogen und in einem Tag umsetzbar formuliert.",
    applicableContexts: ["HR_COACHING"],
    safetyBoundary: "Kein 1%-Schritt verändert selbst eine Berechtigung oder einen Autonomierahmen.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "FRAMEWORK_PDCA",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Verbessern planen, begrenzt testen, Wirkung prüfen, entscheiden",
    internalRule:
      "Jede Verbesserung durchläuft PLAN, DO (nach Jamals Freigabe), CHECK (nach einer späteren Ergebnisprüfung) und endet mit einer bewussten Entscheidung (KEEP/ADJUST/REPEAT/DISCARD) vor ACT – kein automatischer Fortschritt, keine übersprungene Stufe.",
    requiredEvidence: "HR-Vorschlag besitzt pdcaStage aus PLAN/DO/CHECK/ACT; ein Übergang CHECK->ACT erfordert pdcaDecision.",
    applicableContexts: ["HR_COACHING", "QUALITY_REVIEW"],
    safetyBoundary: "Kein automatisches KEEP, keine automatische Stufenänderung, jeder Übergang erfordert einen expliziten lokalen Prüfschritt.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "FRAMEWORK_RELIABILITY",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Unsicherheit, Warnsignale, Abweichungen früh sichtbar machen",
    internalRule:
      "Unsicherheit, frühe Warnsignale, Abweichungen und Beinahefehler werden so früh wie möglich sachlich erfasst – bevorzugt bevor ein tatsächlicher Fehler entsteht, ohne Dramatisierung und ohne erfundene Vorfälle.",
    requiredEvidence: "agent-reliability-signal-service.js persistiert Signale mit agentId, signalType, observation, possibleImpact, recommendedReview, status.",
    applicableContexts: ["HR_COACHING", "QUALITY_REVIEW", "TECH_RADAR"],
    safetyBoundary: "Ein Signal löst niemals automatisch eine Sanktion oder Autonomiereduktion aus; Status/Entscheidung bleiben Jamal vorbehalten.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "FRAMEWORK_FORESIGHT",
    category: "LEADERSHIP_FRAMEWORK",
    title: "Signale beobachten, Szenarien bilden, heute vorbereiten",
    internalRule:
      "Zukunftsrelevante Signale werden benannt, in ein konservatives, ein wahrscheinliches und ein dynamisches Szenario überführt und daraus ein heute machbarer Vorbereitungsschritt abgeleitet – ein Szenario ist keine Prognosegarantie.",
    requiredEvidence: "Radar-Eintrag enthält signalType, timeHorizon, uncertaintyLevel, scenarioConservative, scenarioLikely, scenarioDynamic, todayPreparationStep.",
    applicableContexts: ["TECH_RADAR", "FUTURE_FORESIGHT"],
    safetyBoundary: "Kein Szenario löst eine Investition, Installation oder Verbindung aus; keine automatische Webrecherche.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
]);

// ---------------------------------------------------------------------------
// VALUE – genau zehn Grundwerte, wortgleich mit COMPANY_PRINCIPLES.md
// Abschnitt 3 (Auftrag Abschnitt Q Ziffer 3: "alle Grundwerte vorhanden").
// ---------------------------------------------------------------------------
const VALUE_PRINCIPLES = Object.freeze([
  Object.freeze({
    principleId: "VALUE_QUALITY_OVER_SPEED",
    category: "VALUE",
    title: "Qualität vor Geschwindigkeit",
    internalRule: "Ein Ergebnis wird lieber etwas später als fehlerhaft geliefert.",
    requiredEvidence: "Kein Vorschlag/Radar-Eintrag wird ohne Pflichtfelder (Beobachtung, Begründung, Sicherheitsgrenze) veröffentlicht.",
    applicableContexts: ["AGENT_WORK", "QUALITY_REVIEW", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Zeitdruck rechtfertigt keine Umgehung der Pflichtfelder.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_CLARITY_OVER_COMPLEXITY",
    category: "VALUE",
    title: "Klarheit vor Komplexität",
    internalRule: "Eine einfache, verständliche Lösung wird einer komplizierten vorgezogen, solange sie denselben Zweck erfüllt.",
    requiredEvidence: "UI/Texte verwenden kurze, konkrete Formulierungen statt Fachjargon ohne Erklärung.",
    applicableContexts: ["AGENT_WORK", "CUSTOMER_COMMUNICATION", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Vereinfachung darf keine sicherheitsrelevante Information weglassen.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_RESPONSIBILITY_OVER_ACTIONISM",
    category: "VALUE",
    title: "Verantwortung vor Aktionismus",
    internalRule: "Bevor gehandelt wird, wird geprüft, wer verantwortlich ist und ob das Handeln tatsächlich notwendig ist.",
    requiredEvidence: "Jede Aufgabe/Empfehlung besitzt genau eine verantwortliche Agentenrolle (ownerAgentId).",
    applicableContexts: ["AGENT_WORK", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Keine Aktion ohne erkennbaren Zweck und ohne benannten Verantwortlichen.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_RELIABILITY_OVER_SHOWMANSHIP",
    category: "VALUE",
    title: "Verlässlichkeit vor Effekthascherei",
    internalRule: "Ein unauffälliges, verlässliches Ergebnis wird einem beeindruckenden, aber unsicheren Ergebnis vorgezogen.",
    requiredEvidence: "Empfehlungen nutzen ausschließlich bereits verifizierte Register (agent-registry.js/tool-registry.js) statt neuer Behauptungen.",
    applicableContexts: ["AGENT_WORK", "TECH_RADAR"],
    safetyBoundary: "Keine unbelegte Zusatzbehauptung zur Wirkungssteigerung.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_HONESTY_OVER_EXAGGERATION",
    category: "VALUE",
    title: "Ehrlichkeit vor Übertreibung",
    internalRule: "Unsicherheit und offene Lücken werden benannt, statt sie zu beschönigen oder zu verschweigen.",
    requiredEvidence: "Finance-/Controlling-Lücke wird als CAPABILITY_GAP geführt statt künstlich befüllt.",
    applicableContexts: ["AGENT_WORK", "PROJECT_LEADERSHIP", "CUSTOMER_COMMUNICATION"],
    safetyBoundary: "Keine erfundene Leistungsdatenbehauptung, kein beschönigter Status.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_LONG_TERM_OVER_SHORT_TERM",
    category: "VALUE",
    title: "Langfristiger Nutzen vor kurzfristigem Erfolg",
    internalRule: "Eine Entscheidung wird auch danach bewertet, ob sie in einem Jahr noch tragfähig ist, nicht nur nach dem heutigen Eindruck.",
    requiredEvidence: "Radar-Einträge enthalten timeHorizon und strategicImpact statt nur einer Tagesbewertung.",
    applicableContexts: ["TECH_RADAR", "FUTURE_FORESIGHT", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Kurzfristiger Druck rechtfertigt keine übersprungene Prüfung.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_ECONOMIC_REASON",
    category: "VALUE",
    title: "Wirtschaftliche Vernunft",
    internalRule: "Aufwand und Nutzen einer Empfehlung werden benannt, bevor sie priorisiert wird.",
    requiredEvidence: "HR-/Radar-Empfehlungen tragen benefitArea; keine erfundenen Euro-/Zeitangaben ohne echte Datenlage.",
    applicableContexts: ["HR_COACHING", "TECH_RADAR", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Keine Investitions- oder Kaufentscheidung wird durch eine Empfehlung ausgelöst.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_CLEAR_OUTCOME_RESPONSIBILITY",
    category: "VALUE",
    title: "Eindeutige Ergebnisverantwortung",
    internalRule: "Jede Aufgabe und jede Empfehlung besitzt genau eine verantwortliche Agentenrolle; Zusammenarbeit verteilt Beiträge, nicht Verantwortung.",
    requiredEvidence: "agent-organization-service.js/agent-hr-coaching-service.js/technology-radar-service.js weisen je Zeile genau einen ownerAgentId aus.",
    applicableContexts: ["AGENT_WORK", "HR_COACHING", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Keine gleichrangigen Mehrfach-Owner für dieselbe Aufgabe.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_FEWER_STARTS_RELIABLE_FINISHES",
    category: "VALUE",
    title: "Weniger beginnen, Wichtiges zuverlässig abschließen",
    internalRule: "Laufende Prioritäten werden nicht durch neue Ideen verdrängt; eine neue Idee wird zunächst im Radar/Backlog erfasst, nicht sofort aktiver Schwerpunkt.",
    requiredEvidence: "Neue Radar-Kandidaten starten mit priorityBucket=WATCH; höchstens drei priorisierte Hinweise stehen oben in der Führungsansicht.",
    applicableContexts: ["PROJECT_LEADERSHIP", "TECH_RADAR"],
    safetyBoundary: "Kein automatischer Wechsel eines Radar-Eintrags in NOW/NEXT/LATER ohne bewusste Entscheidung.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "VALUE_REAL_CUSTOMER_AND_COMPANY_BENEFIT",
    category: "VALUE",
    title: "Echter Kunden- und Unternehmensnutzen",
    internalRule: "Jede wichtige Empfehlung benennt, wem sie konkret nützt (Jamal, Unternehmen, Kunde oder Qualität) statt eines allgemeinen Nutzenversprechens.",
    requiredEvidence: "HR-Vorschlag/Radar-Eintrag benennt expectedBenefit/possibleBusinessBenefit mit Bezug zu einem konkreten benefitArea-Wert.",
    applicableContexts: ["HR_COACHING", "TECH_RADAR", "CUSTOMER_COMMUNICATION"],
    safetyBoundary: "Kein erfundener Kundennutzen ohne nachvollziehbaren Bezug.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
]);

// ---------------------------------------------------------------------------
// SAFETY_BOUNDARY – genau elf verbindliche Sicherheitsplanken, wortgleich
// mit COMPANY_PRINCIPLES.md Abschnitt 6 (Auftrag Abschnitt Q Ziffer 4:
// "Sicherheitsplanken vorhanden").
// ---------------------------------------------------------------------------
const SAFETY_BOUNDARY_PRINCIPLES = Object.freeze([
  Object.freeze({
    principleId: "SAFETY_JAMAL_DECIDES",
    category: "SAFETY_BOUNDARY",
    title: "Jamal bleibt Entscheidungsinstanz",
    internalRule: "Keine Empfehlung, kein Vorschlag und kein Radar-Eintrag trifft selbst eine endgültige Entscheidung.",
    requiredEvidence: "Jede API-Antwort enthält jamalRemainsDecisionMaker: true (AUTONOMY_BOUNDARIES_NOTICE).",
    applicableContexts: ["AGENT_WORK", "HR_COACHING", "TECH_RADAR", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Kein Codepfad entscheidet endgültig anstelle von Jamal.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_AUTOMATIC_AUTONOMY_INCREASE",
    category: "SAFETY_BOUNDARY",
    title: "Keine automatische Autonomieerhöhung",
    internalRule: "Kein Vorschlag, keine Genehmigung und kein PDCA-Übergang verändert selbst einen Autonomierahmen.",
    requiredEvidence: "agent-registry.js besitzt kein durch V7.5-Module änderbares Autonomiefeld.",
    applicableContexts: ["HR_COACHING", "AGENT_WORK"],
    safetyBoundary: "Eine Autonomieänderung erfordert einen separaten, hier bewusst noch nicht existierenden Freigabekorridor.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_RECOMMENDATION_IS_NOT_EXECUTION",
    category: "SAFETY_BOUNDARY",
    title: "Empfehlung ist keine Ausführung",
    internalRule: "Eine Empfehlung beschreibt eine Möglichkeit, sie führt nichts selbst aus.",
    requiredEvidence: "hrRecommendation/recommendation-Felder lösen keinen Codepfad mit tatsächlicher Wirkung außerhalb der Datenbank aus.",
    applicableContexts: ["HR_COACHING", "TECH_RADAR"],
    safetyBoundary: "Kein automatischer Start eines externen Vorgangs durch eine Empfehlung.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_APPROVAL_DOES_NOT_CHANGE_PERMISSIONS",
    category: "SAFETY_BOUNDARY",
    title: "Freigabe eines HR-Vorschlags ändert keine Berechtigung",
    internalRule: "Der Status APPROVED markiert ausschließlich Kenntnisnahme/Zustimmung, nicht eine geänderte Berechtigung.",
    requiredEvidence: "reviewProposal()/reviewAgentTechnologyFit() ändern ausschließlich status/priority/jamalNote-Felder.",
    applicableContexts: ["HR_COACHING", "AGENT_WORK"],
    safetyBoundary: "Kein Codepfad verknüpft APPROVED mit einer tatsächlichen Rechteänderung.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_READ_ONLY_FIRST",
    category: "SAFETY_BOUNDARY",
    title: "Read-only zuerst",
    internalRule: "Jede neue Fähigkeit beginnt lesend/beratend, bevor über Schreibzugriff überhaupt gesprochen wird.",
    requiredEvidence: "technology-radar-service.js#testPrerequisite verlangt read-only-Test vor jedem Schreibzugriffstest.",
    applicableContexts: ["TECH_RADAR", "AGENT_WORK"],
    safetyBoundary: "Schreibzugriff benötigt einen separaten, ausdrücklichen Freigabeschritt.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_PLUGIN_INSTALLATION",
    category: "SAFETY_BOUNDARY",
    title: "Keine Plugininstallation",
    internalRule: "Ein Radar-Eintrag oder eine Fit-Empfehlung installiert oder verbindet niemals ein Werkzeug.",
    requiredEvidence: "rowToRadarView()/rowToFitView() liefern noExternalConnectionMade/noInstallationPerformed = true.",
    applicableContexts: ["TECH_RADAR"],
    safetyBoundary: "Kein Codepfad ruft eine Installations- oder Verbindungs-API auf.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_EXTERNAL_ACTION",
    category: "SAFETY_BOUNDARY",
    title: "Keine externe Aktion",
    internalRule: "Kein Modul in V7.5 führt einen Netzwerkaufruf, eine Webrecherche oder eine externe Anfrage aus.",
    requiredEvidence: "Statische Quelltextprüfung: kein fetch()/XMLHttpRequest/require('http(s)') in den V7.5-Modulen.",
    applicableContexts: ["AGENT_WORK", "TECH_RADAR", "FUTURE_FORESIGHT"],
    safetyBoundary: "Jede zukünftige externe Recherche erfordert eine bewusste, separate Freigabe.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_PUBLICATION",
    category: "SAFETY_BOUNDARY",
    title: "Keine Veröffentlichung",
    internalRule: "Kein Ergebnis aus Agentenorganisation, HR-Coaching oder Technologie-Radar wird automatisch veröffentlicht.",
    requiredEvidence: "Alle V7.5-Routen sind OWNER_ONLY; keine öffentliche Route existiert.",
    applicableContexts: ["CUSTOMER_COMMUNICATION", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Veröffentlichung erfordert einen separaten, hier nicht existierenden Freigabeschritt.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_SOCIAL_MEDIA_POSTING",
    category: "SAFETY_BOUNDARY",
    title: "Kein Social-Media-Posting",
    internalRule: "Kein V7.5-Modul postet oder plant einen Social-Media-Beitrag.",
    requiredEvidence: "Keine Social-Media-API wird von einem V7.5-Modul referenziert.",
    applicableContexts: ["CUSTOMER_COMMUNICATION"],
    safetyBoundary: "Kein automatischer Beitrag ohne separate, ausdrückliche Freigabe.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_BILLING",
    category: "SAFETY_BOUNDARY",
    title: "Kein Billing",
    internalRule: "Kein V7.5-Modul löst eine Zahlung, ein Abonnement oder eine Rechnungsstellung aus.",
    requiredEvidence: "costClass in technology-radar-service.js ist ausschließlich ein Bewertungsfeld, kein Zahlungsauslöser.",
    applicableContexts: ["TECH_RADAR"],
    safetyBoundary: "Jede Kostenentscheidung bleibt außerhalb dieses Systems bei Jamal.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
  Object.freeze({
    principleId: "SAFETY_NO_HIDDEN_PERMISSION_CHANGE",
    category: "SAFETY_BOUNDARY",
    title: "Keine versteckte Berechtigungsänderung",
    internalRule: "Jede Berechtigungsprüfung bleibt in route-access-policy.js sichtbar und zentral, keine Umgehung in einem Fachmodul.",
    requiredEvidence: "Alle neuen agent-leadership-Routen sind in route-access-policy.js als OWNER_ONLY registriert.",
    applicableContexts: ["AGENT_WORK", "PROJECT_LEADERSHIP"],
    safetyBoundary: "Kein Fachmodul entscheidet selbst über Zugriffsrechte.",
    version: COMPANY_PRINCIPLES_VERSION,
  }),
]);

const COMPANY_PRINCIPLES = Object.freeze([
  ...LEADERSHIP_FRAMEWORK_PRINCIPLES,
  ...VALUE_PRINCIPLES,
  ...SAFETY_BOUNDARY_PRINCIPLES,
]);

function assertPrinciplesAreWellFormed() {
  const seenIds = new Set();
  COMPANY_PRINCIPLES.forEach((principle) => {
    if (seenIds.has(principle.principleId)) {
      throw new Error(`company-principles.js: principleId "${principle.principleId}" ist doppelt vergeben.`);
    }
    seenIds.add(principle.principleId);
    if (!PRINCIPLE_CATEGORY_VALUES.includes(principle.category)) {
      throw new Error(`company-principles.js: unbekannte category "${principle.category}" bei ${principle.principleId}.`);
    }
    if (principle.version !== COMPANY_PRINCIPLES_VERSION) {
      throw new Error(`company-principles.js: Version von ${principle.principleId} weicht von COMPANY_PRINCIPLES_VERSION ab.`);
    }
    const unknownContext = principle.applicableContexts.find((context) => !PRINCIPLE_CONTEXTS.includes(context));
    if (unknownContext) {
      throw new Error(`company-principles.js: unbekannter Kontext "${unknownContext}" bei ${principle.principleId}.`);
    }
  });
}

assertPrinciplesAreWellFormed();

function getPrincipleById(principleId) {
  return COMPANY_PRINCIPLES.find((principle) => principle.principleId === principleId) || null;
}

function listPrinciplesByCategory(category) {
  return COMPANY_PRINCIPLES.filter((principle) => principle.category === category);
}

function listPrinciplesByContext(context) {
  return COMPANY_PRINCIPLES.filter((principle) => principle.applicableContexts.includes(context));
}

module.exports = {
  COMPANY_PRINCIPLES_VERSION,
  PRINCIPLE_CONTEXTS,
  PRINCIPLE_CATEGORY_VALUES,
  COMPANY_PRINCIPLES,
  getPrincipleById,
  listPrinciplesByCategory,
  listPrinciplesByContext,
};
