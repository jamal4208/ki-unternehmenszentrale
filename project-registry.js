"use strict";

const PORTFOLIO_MODES = Object.freeze([
  "DEMO",
  "PLANUNG",
  "REAL_VERIFIZIERT",
  "UNGEKLÄRT",
]);

const REQUIRED_PROJECT_FIELDS = Object.freeze([
  "id",
  "displayName",
  "aliases",
  "portfolioMode",
  "verificationStatus",
  "verificationSource",
  "lastVerifiedAt",
  "localPath",
  "repositoryUrl",
  "localBranch",
  "localHead",
  "remoteRefs",
  "workingTreeStatus",
  "testCommand",
  "testStatus",
  "currentStatus",
  "currentGoal",
  "nextSafeStep",
  "blocker",
  "openDecision",
  "ownerAgentIds",
  "safetyProfile",
  "workStatus",
  "codexStatus",
  "relatedProjectIds",
  "notes",
]);

const API_SECURITY_FLAGS = Object.freeze({
  writeOperationsBlocked: true,
  madeExternalRequest: false,
});

const CENTRAL_PROJECT_SNAPSHOT = Object.freeze({
  branch: "main",
  localHead: "a5367f1",
  originMain: "a5367f1",
  productCommit: "a59c7bd",
  verifiedAt: "2026-07-11",
});

const BASE_SAFETY_PROFILE = Object.freeze([
  "Keine automatische externe Aktion",
  "Keine automatische Git-Aktion",
  "Keine Agentenausführung",
  "Keine Deploymentfreigabe",
  "Jamal behält die manuelle Kontrolle",
]);

function createProject(overrides) {
  return {
    id: null,
    displayName: null,
    aliases: [],
    legacyIds: [],
    portfolioMode: "UNGEKLÄRT",
    verificationStatus: "UNGEKLÄRT",
    verificationSource: null,
    lastVerifiedAt: null,
    localPath: null,
    repositoryUrl: null,
    localBranch: null,
    localHead: null,
    remoteRefs: {},
    baselineCommit: null,
    workingTreeStatus: "UNGEKLÄRT",
    testCommand: null,
    testStatus: "UNGEKLÄRT",
    currentStatus: "UNGEKLÄRT",
    currentGoal: "UNGEKLÄRT",
    nextSafeStep: "Bestand und Projektidentität read-only prüfen.",
    blocker: "Technischer Projektstand ist nicht verifiziert.",
    openDecision: "Jamal bestätigt Projektidentität und nächsten Prüfschritt.",
    ownerAgentIds: [],
    safetyProfile: [...BASE_SAFETY_PROFILE],
    workStatus: "UNGEKLÄRT",
    codexStatus: "MANUELL_KONTROLLIERT",
    relatedProjectIds: [],
    deploymentStatus: "NICHT_FREIGEGEBEN",
    externalActionStatus: "BLOCKIERT",
    excludedSensitiveAssets: [],
    consentFixStatus: null,
    notes: [],
    ...overrides,
  };
}

const PROJECT_REGISTRY = [
  createProject({
    id: "ki-unternehmenszentrale",
    displayName: "KI-Unternehmenszentrale",
    aliases: ["KI-Zentrum", "Unternehmenszentrale", "KI-Unternehmenszentrale V1"],
    legacyIds: ["proj-os"],
    portfolioMode: "DEMO",
    verificationStatus: "GIT_STAND_BESTÄTIGT",
    verificationSource: "Verbindliche Read-only-Vorprüfung für V6.39.0",
    lastVerifiedAt: "2026-07-11",
    localPath: "/Users/jamal/Documents/New project/ki-unternehmenszentrale",
    repositoryUrl: "https://github.com/jamal4208/ki-unternehmenszentrale.git",
    localBranch: CENTRAL_PROJECT_SNAPSHOT.branch,
    localHead: CENTRAL_PROJECT_SNAPSHOT.localHead,
    remoteRefs: { "origin/main": CENTRAL_PROJECT_SNAPSHOT.originMain },
    baselineCommit: CENTRAL_PROJECT_SNAPSHOT.productCommit,
    workingTreeStatus: "SAUBER_ZUM_VERIFIZIERUNGSZEITPUNKT",
    testCommand: "npm test && npm run check",
    testStatus: "AUSSTEHEND_FÜR_V6.39.0",
    currentStatus: "Lokaler, read-only ausgerichteter Arbeits- und Demo-Stand; keine autonome Produktivplattform.",
    currentGoal: "17 Projekte aus einer einzigen kanonischen technischen Quelle sichtbar führen.",
    nextSafeStep: "V6.39.0 lokal testen und Jamal zur manuellen Abnahme vorlegen.",
    blocker: "Produktive Nutzung, Git-Aktionen und Deployment sind nicht freigegeben.",
    openDecision: "Gibt Jamal V6.39.0 nach manueller Prüfung frei?",
    ownerAgentIds: ["agent-1", "agent-2", "agent-4", "agent-6", "agent-11"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Browser-Managementdaten bleiben lokal gespeichert"],
    notes: ["REAL_VERIFIZIERT bleibt in V6.39.0 dem Health-Pilot vorbehalten."],
  }),
  createProject({
    id: "health-upgrade-kompass",
    displayName: "Health Upgrade Kompass",
    aliases: ["Health-Kompass", "Health Upgrade", "Health Upgrade Projektsteuerung"],
    legacyIds: ["proj-health"],
    portfolioMode: "REAL_VERIFIZIERT",
    verificationStatus: "TECHNISCH_REAL_VERIFIZIERT",
    verificationSource: "Von Jamal bestätigte technische Health-Ausgangsdaten für V6.39.0",
    lastVerifiedAt: "2026-07-11",
    localPath: "/Users/jamal/Documents/New project/health-upgrade-kompass",
    repositoryUrl: "https://github.com/jamal4208/health-upgrade-kompass.git",
    localBranch: "main",
    localHead: "bc98b5c",
    remoteRefs: {
      "origin/main": "1f4f96d",
      "baseline/private-health-expansion-2026-07-11": "bc98b5c",
    },
    baselineCommit: "26f65fe",
    workingTreeStatus: "SAUBER_ZUM_LETZTEN_BESTÄTIGTEN_PRÜFZEITPUNKT",
    testCommand: "npm test",
    testStatus: "BESTÄTIGT_ERFOLGREICH: Check-Logik OK; exportReadiness tests passed; Consent-Persistenz OK",
    currentStatus: "Technischer Git-, Test- und Consent-Stand als bestätigte Momentaufnahme geführt.",
    currentGoal: "Technischen Pilotstand kontrolliert prüfen, ohne fachliche oder öffentliche Freigabe abzuleiten.",
    nextSafeStep: "Jamal prüft die Pilotakte und entscheidet separat über jeden weiteren manuellen Schritt.",
    blocker: "Produktinhalte sind teilweise ungeprüfte interne Prototypinhalte; keine medizinische, fachliche oder rechtliche Freigabe.",
    openDecision: "Welche fachlichen, rechtlichen und produktbezogenen Prüfungen sollen als Nächstes separat beauftragt werden?",
    ownerAgentIds: ["agent-2", "agent-3", "agent-4", "agent-6", "agent-10", "agent-16"],
    safetyProfile: [
      ...BASE_SAFETY_PROFILE,
      "Keine Diagnose, medizinische Empfehlung oder Heilversprechen",
      "Keine Gesundheits- oder Kundendaten in der Zentrale",
      "Keine öffentliche Freigabe",
    ],
    relatedProjectIds: ["expansion-app"],
    excludedSensitiveAssets: [
      "Archive",
      "Backups",
      "Outputs",
      "Partnerunterlagen",
      "ungeklärte Bildbestände",
    ],
    consentFixStatus: "BESTÄTIGT: Consent-/localStorage-Widerspruch im Health-Projekt behoben",
    notes: [
      "Git- und Testwerte sind bestätigte Momentaufnahmen und werden nicht automatisch live aktualisiert.",
      "Der Baseline-Branch ist eine Remote-Referenz; lokal ist weiterhin main ausgecheckt.",
      "Health und Expansion sind fachlich getrennt, nutzen technisch aber teilweise denselben Ordner und Code.",
      "REAL_VERIFIZIERT bezieht sich nur auf den technischen Projektstand, nicht auf medizinische, fachliche oder rechtliche Freigaben.",
      "Kein neues Produktionsdeployment und keine externe Aktion.",
    ],
  }),
  createProject({
    id: "health-upgrade-karriere",
    displayName: "Health Upgrade Karriere",
    aliases: ["Health Karriere"],
    legacyIds: ["proj-health-career"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md vor V6.39.0",
    currentStatus: "Registereintrag vorhanden; technischer Projektstand ungeklärt.",
    currentGoal: "Projektübergabe und Quellenbestand erfassen.",
    nextSafeStep: "Quellen und Projektidentität read-only erfassen.",
    blocker: "Lokaler Ordner, Repository, Git- und Teststand sind ungeklärt.",
    openDecision: "Welche Quelle gilt für Health Upgrade Karriere?",
    ownerAgentIds: ["agent-2", "agent-7", "agent-18"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Karriere-, Vertrags- oder Vergütungszusage"],
  }),
  createProject({
    id: "expansion-app",
    displayName: "Expansion App",
    aliases: ["Expansion"],
    legacyIds: ["expansion-app"],
    portfolioMode: "PLANUNG",
    verificationStatus: "GEMEINSAME_TECHNISCHE_BASIS_BESTÄTIGT_PROJEKTAKTE_OFFEN",
    verificationSource: "Von Jamal bestätigte technische Health-/Expansion-Ausgangsdaten für V6.39.0",
    lastVerifiedAt: "2026-07-11",
    localPath: "/Users/jamal/Documents/New project/health-upgrade-kompass",
    repositoryUrl: "https://github.com/jamal4208/health-upgrade-kompass.git",
    localBranch: "main",
    localHead: "bc98b5c",
    remoteRefs: {
      "origin/main": "1f4f96d",
      "baseline/private-health-expansion-2026-07-11": "bc98b5c",
    },
    baselineCommit: "26f65fe",
    workingTreeStatus: "SAUBER_ZUM_LETZTEN_BESTÄTIGTEN_PRÜFZEITPUNKT",
    testCommand: "npm test",
    testStatus: "GEMEINSAME_BASIS_GETESTET; EXPANSION-SPEZIFISCHE_ABNAHME_UNGEKLÄRT",
    currentStatus: "Fachlich eigenständiges Planungsprojekt; technische Basis derzeit teilweise gemeinsam mit Health.",
    currentGoal: "Expansion fachlich getrennt spezifizieren, ohne die gemeinsame technische Basis als Freigabe zu deuten.",
    nextSafeStep: "Expansion-spezifischen Scope und ersten Prüfpunkt manuell festlegen.",
    blocker: "Eigenständiger technischer Zuschnitt und Expansion-spezifische Abnahme sind ungeklärt.",
    openDecision: "Welcher Expansion-Ausschnitt wird als eigenständiger nächster Prüfpunkt geführt?",
    ownerAgentIds: ["agent-2", "agent-3", "agent-6", "agent-16", "agent-19"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine regulatorische oder Länderfreigabe", "Keine Dokumentenanforderung oder E-Mail"],
    relatedProjectIds: ["health-upgrade-kompass"],
    notes: [
      "Health und Expansion bleiben getrennte Projekt-IDs.",
      "Der gemeinsame Pfad und Code bedeuten keine fachliche Zusammenführung.",
      "Der Baseline-Branch ist remote; lokal bleibt main ausgecheckt.",
    ],
  }),
  createProject({
    id: "flowlingo-portugiesisch-sprachtrainer",
    displayName: "FlowLingo Portugiesisch Sprachtrainer",
    aliases: ["FlowLingo", "Flowlingo", "Flowlingo Lernprodukt"],
    legacyIds: ["proj-flow", "flowlingo"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und bestehende Portfolio-Logik",
    currentStatus: "Portfolio- und Arbeitsprojekt; Verhältnis zum Portugiesisch-Sprechtrainer offen.",
    currentGoal: "Produktidentität und Lern-/Demo-Grenze klären.",
    nextSafeStep: "Namen, Quellenprojekt und Verhältnis zum Portugiesisch-Sprechtrainer read-only prüfen.",
    blocker: "Lokaler Ordner, Repository und eindeutige Projektidentität sind ungeklärt.",
    openDecision: "Sind FlowLingo und Portugiesisch-Sprechtrainer getrennt, verwandt oder identisch?",
    ownerAgentIds: ["agent-2", "agent-3", "agent-6", "agent-7", "agent-22"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine ungeprüfte Veröffentlichung oder Nutzerkommunikation"],
    relatedProjectIds: ["portugiesisch-sprechtrainer"],
  }),
  createProject({
    id: "portugiesisch-sprechtrainer",
    displayName: "Portugiesisch-Sprechtrainer",
    aliases: ["Portugiesisch Sprechtrainer", "möglicherweise FlowLingo-verwandt"],
    legacyIds: ["proj-portugiesisch-sprechtrainer"],
    portfolioMode: "UNGEKLÄRT",
    verificationStatus: "UNGEKLÄRT",
    verificationSource: "Portfolio-Anbindungsregister; Identität ausdrücklich offen",
    currentStatus: "Nur Register- und Checklistenbezug; Identität offen.",
    currentGoal: "Eigenständigkeit oder Beziehung zu FlowLingo klären.",
    nextSafeStep: "Nicht zusammenführen; Quellenprojekt durch Jamal bestätigen lassen.",
    blocker: "Projektidentität und technische Quelle sind ungeklärt.",
    openDecision: "Eigenständige Projekt-ID beibehalten oder nach Nachweis zuordnen?",
    ownerAgentIds: ["agent-3", "agent-6", "agent-7"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine ungeprüfte Zusammenführung mit FlowLingo"],
    relatedProjectIds: ["flowlingo-portugiesisch-sprachtrainer"],
  }),
  createProject({
    id: "spanisch-sprechtrainer",
    displayName: "Spanisch-Sprechtrainer",
    aliases: ["Spanisch Sprechtrainer"],
    legacyIds: ["proj-spanisch-sprechtrainer"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und Portfolio-Anbindungsregister",
    currentStatus: "Lernpfad, Dialoglogik und MVP-Test sind beschrieben; Technik ungeklärt.",
    currentGoal: "Quellenprojekt und MVP-Stand prüfen.",
    nextSafeStep: "Projektquelle und MVP-Stand read-only erfassen.",
    blocker: "Ordner, Repository, Git- und Teststand sind ungeklärt.",
    openDecision: "Welche technische Quelle gehört zum Spanisch-Sprechtrainer?",
    ownerAgentIds: ["agent-3", "agent-6", "agent-7", "agent-22"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine ungeprüfte Veröffentlichung oder automatische FlowLingo-Übernahme"],
  }),
  createProject({
    id: "marketing-agentur-os",
    displayName: "Marketing Agentur OS",
    aliases: ["Marketing-Agentur", "Marketing Agentur", "Marketing Agency OS"],
    legacyIds: ["proj-marketing-agentur-os", "marketing-agentur-os"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und bestehende Demo-/Arbeitslogik",
    currentStatus: "Trainings- und Projektarbeitsfall; technischer Projektstand ungeklärt.",
    currentGoal: "Ordner, Repository und erstes reales Artefakt prüfen.",
    nextSafeStep: "Technische Quelle read-only verifizieren.",
    blocker: "Keine bestätigten Git- oder Testwerte.",
    openDecision: "Welcher Ordner und welches Repository sind verbindlich?",
    ownerAgentIds: ["agent-2", "agent-5", "agent-6", "agent-7", "agent-13"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Kampagne, Markenfreigabe oder Veröffentlichung"],
  }),
  createProject({
    id: "senior-designer-os",
    displayName: "Senior Designer OS",
    aliases: ["Senior Designer", "Senior Design Manager"],
    legacyIds: [],
    portfolioMode: "UNGEKLÄRT",
    verificationStatus: "UNGEKLÄRT",
    verificationSource: "Nur fachliche Designbezüge im Bestand",
    currentStatus: "Kein eindeutiger Projektregister- oder Techniknachweis.",
    currentGoal: "Existenz und verbindlichen Namen klären.",
    nextSafeStep: "Jamal bestätigt Projektidentität und Quelle.",
    blocker: "Existenz als eigenständiges Projekt ist ungeklärt.",
    openDecision: "Ist Senior Designer OS ein Projekt, eine Rolle oder ein Alias?",
    ownerAgentIds: ["agent-5", "agent-22", "agent-23", "agent-24"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine automatische Zusammenführung mit Marketing Agentur OS"],
    relatedProjectIds: ["marketing-agentur-os"],
  }),
  createProject({
    id: "autopilot-light-system",
    displayName: "Autopilot-Light-System",
    aliases: ["Autopilot", "Autopilot V2"],
    legacyIds: ["proj-autopilot-light-system"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und Arbeitsstandard",
    currentStatus: "Sicherer Arbeitsauftrags- und Steuerungskontext; Einordnung offen.",
    currentGoal: "Als Projekt, Modul oder Methode verbindlich abgrenzen.",
    nextSafeStep: "Einordnung manuell festlegen, ohne Autonomie zu aktivieren.",
    blocker: "Technische Identität und Systemgrenze sind ungeklärt.",
    openDecision: "Projekt, Modul oder Methode?",
    ownerAgentIds: ["agent-1", "agent-2", "agent-4", "agent-6", "agent-10"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine autonome Ausführung oder automatische Eskalation"],
  }),
  createProject({
    id: "prowin-karriere",
    displayName: "proWIN Karriere",
    aliases: ["ProWin Karriere"],
    legacyIds: ["proj-prowin-karriere"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und app.js",
    currentStatus: "Karriere- und Vertriebskontext; Technik ungeklärt.",
    currentGoal: "Projektübergabe und Quellenbestand erfassen.",
    nextSafeStep: "Quellenbestand ohne Kontakt- oder Kundendaten erfassen.",
    blocker: "Technische Quelle und Freigabeverantwortung sind ungeklärt.",
    openDecision: "Welche Quelle und welche Freigabeverantwortung gelten?",
    ownerAgentIds: ["agent-7", "agent-14", "agent-16", "agent-18"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Einkommens-, Karriere- oder Erfolgsaussage"],
  }),
  createProject({
    id: "your-day-portugal-2-0",
    displayName: "Your Day / Portugal 2.0",
    aliases: ["Your Day", "Portugal 2.0"],
    legacyIds: [],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und bestehender Arbeitskontext",
    currentStatus: "Portugal- und Kommunikationsprojekt; Verhältnis zur MLM-Präsentation offen.",
    currentGoal: "Varianten, Zweck und Verantwortungen klären.",
    nextSafeStep: "Beziehung zur Präsentation read-only dokumentieren.",
    blocker: "Technische Quelle und Projektabgrenzung sind ungeklärt.",
    openDecision: "Wie wird das Projekt von der MLM-Präsentation abgegrenzt?",
    ownerAgentIds: ["agent-2", "agent-7", "agent-16", "agent-21"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Finanz-, Gesellschaftsrechts- oder Vertragsentscheidung"],
    relatedProjectIds: ["your-day-mlm-praesentation"],
  }),
  createProject({
    id: "your-day-mlm-praesentation",
    displayName: "Your Day / MLM Präsentation",
    aliases: ["Your Day Präsentation"],
    legacyIds: ["your-day-mlm"],
    portfolioMode: "PLANUNG",
    verificationStatus: "DOKUMENTIERT_NICHT_TECHNISCH_VERIFIZIERT",
    verificationSource: "PROJECT_REGISTRY.md und bestehender Arbeitseintrag",
    currentStatus: "Eigenständiger Präsentations-Arbeitseintrag; Technik ungeklärt.",
    currentGoal: "Inhalte, Zielgruppe und Freigabeverantwortung prüfen.",
    nextSafeStep: "Präsentationskern und Freigabeverantwortung manuell klären.",
    blocker: "Inhalte und technische Quelle sind nicht verifiziert.",
    openDecision: "Wer prüft und genehmigt die Inhalte?",
    ownerAgentIds: ["agent-5", "agent-7", "agent-16", "agent-23"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Leistungs- oder Einkommensversprechen", "Keine Veröffentlichung"],
    relatedProjectIds: ["your-day-portugal-2-0"],
  }),
  createProject({
    id: "jaco-eventplanung",
    displayName: "JACO Eventplanung",
    aliases: ["Eventplanung JACO"],
    legacyIds: [],
    portfolioMode: "PLANUNG",
    verificationStatus: "READ_ONLY_PILOT_DOKUMENTIERT_TECHNIK_UNGEKLÄRT",
    verificationSource: "AIRTABLE_PILOT_SETUP.md und PROJECT_REGISTRY.md",
    currentStatus: "Read-only Airtable-Pilot dokumentiert; eigenständige Technik ungeklärt.",
    currentGoal: "Projektübergabe ohne Roh- oder Kontaktdaten erstellen.",
    nextSafeStep: "Übergabe ausschließlich mit strukturellen Metadaten vorbereiten.",
    blocker: "Projektordner, Repository, Git- und Teststand sind ungeklärt.",
    openDecision: "Welche technische Quelle wird für JACO Eventplanung geführt?",
    ownerAgentIds: ["agent-2", "agent-10", "agent-16", "agent-17"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Buchung, Zahlung, Kommunikation oder personenbezogenen Daten"],
    relatedProjectIds: ["jaco-gbr-webseite"],
  }),
  createProject({
    id: "jaco-gbr-webseite",
    displayName: "JACO GbR Webseite",
    aliases: ["JACO Webseite", "Jaco GbR Webseite"],
    legacyIds: ["proj-jaco-gbr-webseite"],
    portfolioMode: "UNGEKLÄRT",
    verificationStatus: "UNGEKLÄRT",
    verificationSource: "Kein eindeutiger Register- oder Techniknachweis",
    currentStatus: "Nicht mit JACO Eventplanung gleichgesetzt; Projektidentität offen.",
    currentGoal: "Existenz, Zweck, Ordner und Repository klären.",
    nextSafeStep: "Jamal bestätigt Projektidentität und technische Quelle.",
    blocker: "Kein belastbarer Techniknachweis.",
    openDecision: "Existiert die Webseite als eigenständiges Projekt?",
    ownerAgentIds: ["agent-4", "agent-6", "agent-7", "agent-22"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Veröffentlichung", "Pflichtangaben nur nach Prüfung"],
    relatedProjectIds: ["jaco-eventplanung"],
  }),
  createProject({
    id: "portugiesische-lda-gruendung",
    displayName: "portugiesische Lda-Gründung",
    aliases: ["Lda-Gründung"],
    legacyIds: [],
    portfolioMode: "UNGEKLÄRT",
    verificationStatus: "UNGEKLÄRT",
    verificationSource: "Kein belastbarer Nachweis im Bestand",
    currentStatus: "Gesellschafts- und Gründungsthema ohne eindeutigen Projektstand.",
    currentGoal: "Quellen und fachliche Zuständigkeit klären.",
    nextSafeStep: "Jamal benennt Quellen; anschließend nur read-only strukturieren.",
    blocker: "Kein belastbarer Projekt- oder Techniknachweis.",
    openDecision: "Welche Quelle und qualifizierte Fachprüfung gelten?",
    ownerAgentIds: ["agent-15", "agent-16", "agent-21"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Rechtsberatung, Behördenkommunikation, Zahlung oder Gründungshandlung"],
  }),
  createProject({
    id: "seminare-und-praesentationen",
    displayName: "Seminare und Präsentationen",
    aliases: ["Seminare", "Präsentationen"],
    legacyIds: ["proj-workbook-jahrseminar-pages"],
    portfolioMode: "PLANUNG",
    verificationStatus: "MATERIALIEN_DOKUMENTIERT_GESAMTPROJEKT_UNGEKLÄRT",
    verificationSource: "Video-Dokumentation, Präsentationsagent und PROJECT_REGISTRY.md",
    currentStatus: "Material- und Arbeitslogik vorhanden; kein konsolidierter Technikstand.",
    currentGoal: "Einzelprojekte und Materialien inventarisieren.",
    nextSafeStep: "Materialien ohne Teilnehmer- oder Kontaktdaten inventarisieren.",
    blocker: "Gesamtprojekt, Ordner, Repository und Teststand sind ungeklärt.",
    openDecision: "Welche Einzelprojekte gehören verbindlich in diesen Bereich?",
    ownerAgentIds: ["agent-5", "agent-7", "agent-13", "agent-23"],
    safetyProfile: [...BASE_SAFETY_PROFILE, "Keine Veröffentlichung oder Teilnehmerkommunikation"],
  }),
];

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

deepFreeze(PROJECT_REGISTRY);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function listProjects() {
  return clone(PROJECT_REGISTRY);
}

function getProjectById(projectId) {
  const project = PROJECT_REGISTRY.find((entry) => entry.id === projectId);
  return project ? clone(project) : null;
}

function buildProjectsResponse() {
  return {
    version: "V6.39.0",
    registrySource: "project-registry.js",
    projectCount: PROJECT_REGISTRY.length,
    projects: listProjects(),
    snapshotNotice: "Git- und Teststände sind bestätigte Momentaufnahmen und werden nicht automatisch live aktualisiert.",
    localPersistenceNotice: "Manuelle Managementdaten werden getrennt im localStorage des Browsers gespeichert.",
    ...API_SECURITY_FLAGS,
  };
}

function buildProjectResponse(projectId) {
  const project = getProjectById(projectId);
  if (!project) return null;
  return {
    version: "V6.39.0",
    registrySource: "project-registry.js",
    project,
    snapshotNotice: "Git- und Teststände sind bestätigte Momentaufnahmen und werden nicht automatisch live aktualisiert.",
    ...API_SECURITY_FLAGS,
  };
}

function linkManualManagementData(manualProjects) {
  const safeManualProjects = Array.isArray(manualProjects) ? clone(manualProjects) : [];
  const matchedManualIds = new Set();
  const projects = listProjects().map((canonical) => {
    const canonicalKeys = new Set(
      [canonical.id, canonical.displayName, ...canonical.aliases, ...canonical.legacyIds]
        .map(normalize)
        .filter(Boolean),
    );
    const localManagement = safeManualProjects.find((manual) => {
      const manualKeys = [manual.id, manual.title, manual.name].map(normalize).filter(Boolean);
      return manualKeys.some((key) => canonicalKeys.has(key));
    }) || null;
    if (localManagement?.id) matchedManualIds.add(localManagement.id);
    return {
      canonical,
      localManagement,
    };
  });

  return {
    projects,
    unmatchedManualProjects: safeManualProjects.filter((manual) => !matchedManualIds.has(manual.id)),
  };
}

module.exports = {
  API_SECURITY_FLAGS,
  CENTRAL_PROJECT_SNAPSHOT,
  PORTFOLIO_MODES,
  PROJECT_REGISTRY,
  REQUIRED_PROJECT_FIELDS,
  buildProjectResponse,
  buildProjectsResponse,
  getProjectById,
  linkManualManagementData,
  listProjects,
};
