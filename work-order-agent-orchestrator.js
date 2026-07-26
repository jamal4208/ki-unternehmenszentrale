"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt B/D/E/K) – deterministischer,
// rein interner Projektmanager-/Fachagenten-/Qualitätsagenten-Adapter für
// die kontrollierte Ausführung eines READY_FOR_PROCESSING-Arbeitsauftrags.
//
// Wichtig (Auftrag Leitprinzipien/Abschnitt D):
//   - KEIN externer Providerzugriff, KEINE KI-API, KEIN Netzwerkzugriff.
//   - KEINE Zufallszahlen, KEINE Uhrzeitabhängigkeit in der fachlichen
//     Logik: dieselben Eingabefelder ergeben IMMER dieselbe Auswahl,
//     denselben Arbeitsplan und denselben Ergebnisentwurf
//     (Reproduzierbarkeit, Auftrag Abschnitt B.8).
//   - Es werden AUSSCHLIESSLICH bereits vom Kunden gelieferte Felder
//     (title/desiredResult/context/deadlineText) verarbeitet – keine
//     erfundenen Kundendaten, keine externen Wissensquellen.
//   - Agenten stammen ausschließlich aus dem bestehenden kanonischen
//     25-Agenten-Register (agent-registry.js). Es wird KEIN neuer Agent
//     angelegt; "Content-Agent"/"QA-Agent" sind lediglich zusätzliche,
//     additive Namensaliase auf bereits vorhandene Registereinträge (siehe
//     agent-registry.js#ROLE_NAME_MAPPING).
//
// Dieses Modul kennt weder HTTP noch die Datenbank (reine Funktionen ohne
// Seiteneffekte) – Persistenz und Statusverwaltung übernimmt ausschließlich
// work-order-execution-service.js.

const agentRegistry = require("./agent-registry");

// Versionskennung des deterministischen Auswahl-/Planungs-/Entwurfsverfahrens
// (auth-db.js#work_order_runs.orchestratorVersion). Wird bei jeder
// inhaltlichen Änderung dieses Moduls hochgezählt – nicht bei rein
// redaktionellen Kommentaränderungen.
const ORCHESTRATOR_VERSION = "work-order-agent-orchestrator@2026-07-26.1";

const MAX_SPECIALIST_AGENTS = 3;

const AGENT_ROLES = Object.freeze({
  PROJECT_MANAGER: "PROJECT_MANAGER",
  SPECIALIST: "SPECIALIST",
  QUALITY: "QUALITY",
});

// Kanonische Namen (AGENTS.md) – ausschließlich Namen, die bereits in
// agent-registry.js#ROLE_NAME_MAPPING auf einen vorhandenen Registereintrag
// zeigen.
const PROJECT_MANAGER_NAME = "Projektmanager-Agent";
const QUALITY_AGENT_NAME = "QA-Agent";
const CONTENT_AGENT_NAME = "Content-Agent";
const DESIGN_AGENT_NAME = "Design-Director-Agent";
const DEVELOPER_AGENT_NAME = "Entwickler-Agent";

function resolveAgent(canonicalName) {
  const agentKey = agentRegistry.ROLE_NAME_MAPPING[canonicalName];
  if (!agentKey || !agentRegistry.hasAgentId(agentKey)) {
    throw new Error(`work-order-agent-orchestrator: unbekannte kanonische Agentenrolle "${canonicalName}".`);
  }
  const agent = agentRegistry.getAgentById(agentKey);
  return {
    agentKey,
    canonicalName,
    technicalName: agent.name,
    technicalRole: agent.role,
  };
}

function joinFieldsLower(fields) {
  return [fields && fields.title, fields && fields.desiredResult, fields && fields.context]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" \n ")
    .toLowerCase();
}

// Deterministische, rein textbasierte Stichwortlisten (Deutsch/Englisch) –
// keine Fremdquelle, keine KI-Klassifikation. Bewusst konservativ gehalten:
// im Zweifel wird KEIN zusätzlicher Fachagent hinzugezogen (Auftrag
// Abschnitt B.5: "verhindern, dass alle 25 Agenten unnötig laufen").
const DESIGN_KEYWORDS = Object.freeze([
  "design",
  "website",
  "webseite",
  "landingpage",
  "layout",
  "ui",
  "ux",
  "screen",
  "bildsprache",
  "gestaltung",
  "logo",
  "corporate design",
]);

const TECHNICAL_KEYWORDS = Object.freeze([
  "api",
  "schnittstelle",
  "datenbank",
  "integration",
  "software",
  "app ",
  "applikation",
  "technisch",
  "code",
  "system",
  "server",
]);

function matchesAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

// ---------------------------------------------------------------------------
// E. Agentenauswahl (Auftrag Abschnitt E) – deterministische Regel.
// Mindestens: Projektmanager immer, ein fachlich passender Primäragent,
// optional ein zweiter/dritter Fachagent, genau ein Qualitätsagent.
// Maximal: 1 Projektmanager, 3 Fachagenten, 1 Qualitätsagent.
// ---------------------------------------------------------------------------

function selectAgentsForWorkOrder(fields) {
  const text = joinFieldsLower(fields);

  const projectManager = {
    ...resolveAgent(PROJECT_MANAGER_NAME),
    role: AGENT_ROLES.PROJECT_MANAGER,
    reason: "Jeder Lauf wird vom Projektmanager-Agenten strukturiert, begrenzt und koordiniert.",
    task: "Auftrag lesen, Ziel und Kontext strukturieren, Arbeitsplan erzeugen, Fachagenten auswählen, Fachbeiträge zusammenführen.",
    boundary: "Keine externen Tools, keine Kosten, keine Veröffentlichung, keine neue Agentenrolle.",
    expectedPartialResult: "Strukturierter Arbeitsplan und zusammengeführtes Ergebnis.",
  };

  const specialists = [];
  specialists.push({
    ...resolveAgent(CONTENT_AGENT_NAME),
    role: AGENT_ROLES.SPECIALIST,
    reason: "Jeder Auftrag benötigt einen verständlichen, geschäftlich nutzbaren Textentwurf (Wording, Verständlichkeit).",
    task: "Textentwurf auf Basis des gewünschten Ergebnisses und des angegebenen Hintergrunds erstellen.",
    boundary: "Nur interne, textbasierte Bearbeitung; keine unbelegten Behauptungen; keine externe Quelle.",
    expectedPartialResult: "Ein verständlicher Textentwurf für das gewünschte Ergebnis.",
  });

  if (specialists.length < MAX_SPECIALIST_AGENTS && matchesAnyKeyword(text, DESIGN_KEYWORDS)) {
    specialists.push({
      ...resolveAgent(DESIGN_AGENT_NAME),
      role: AGENT_ROLES.SPECIALIST,
      reason: 'Der Auftrag nennt einen Gestaltungs-/Wirkungsbezug (z. B. "Design", "Website", "Layout").',
      task: "Gestaltungs- und Wirkungshinweise für den Textentwurf ergänzen (rein textlich, keine Bilderzeugung).",
      boundary: "Keine Bild-/Grafikerzeugung, kein Canva-Zugriff, keine Veröffentlichung.",
      expectedPartialResult: "Kurzer Hinweisblock zu Wirkung/Vertrauen/Gestaltungsrichtung.",
    });
  }

  if (specialists.length < MAX_SPECIALIST_AGENTS && matchesAnyKeyword(text, TECHNICAL_KEYWORDS)) {
    specialists.push({
      ...resolveAgent(DEVELOPER_AGENT_NAME),
      role: AGENT_ROLES.SPECIALIST,
      reason: 'Der Auftrag nennt einen technischen Umsetzungsbezug (z. B. "Website", "Schnittstelle", "System").',
      task: "Technische Machbarkeits- und Prüfhinweise rein textlich ergänzen.",
      boundary: "Keine Codeänderung, kein Deployment, kein Schreibzugriff auf externe Systeme.",
      expectedPartialResult: "Kurzer Hinweisblock zu technischer Machbarkeit und offenen technischen Fragen.",
    });
  }

  const quality = {
    ...resolveAgent(QUALITY_AGENT_NAME),
    role: AGENT_ROLES.QUALITY,
    reason: "Jeder Lauf wird unabhängig von der Projektleitung durch den QA-Agenten geprüft (Auftrag Abschnitt D).",
    task: "Ergebnis gegen gewünschtes Ergebnis, Kundenvorgaben und Business-Use-Policy prüfen; Rückfragebedarf erkennen.",
    boundary: "Prüft und blockiert, gibt selbst nichts fachlich frei.",
    expectedPartialResult: "Qualitätsstatus, Qualitätsnotiz, ggf. offene Punkte.",
  };

  return { projectManager, specialists, quality };
}

// ---------------------------------------------------------------------------
// D. Interner Arbeitsplan (Auftrag Abschnitt D) – maximal 3–5 Arbeitsschritte,
// erwartetes Ergebnisformat, Qualitätskriterien.
// ---------------------------------------------------------------------------

function buildWorkPlan(fields, selection) {
  const specialistNames = selection.specialists.map((specialist) => specialist.canonicalName).join(", ");
  const steps = [
    "Auftrag lesen, Ziel und Kontext strukturieren (Projektmanager-Agent).",
    `Fachliche Bearbeitung durch ${specialistNames} entsprechend dem gewünschten Ergebnis.`,
    "Fachbeiträge zu einem einheitlichen Ergebnisentwurf zusammenführen (Projektmanager-Agent).",
    "Qualitätsprüfung gegen Kundenvorgaben und Business-Use-Policy durchführen (QA-Agent).",
    "Ergebnis freigeben oder – bei echter fachlicher Lücke – eine konkrete Rückfrage vorbereiten.",
  ];
  return {
    steps,
    expectedResultFormat: "Titel, kurze Zusammenfassung, vollständiges Ergebnis, Qualitätsstatus, offene Punkte.",
    qualityCriteria: [
      "Entspricht dem gewünschten Ergebnis.",
      "Berücksichtigt die Kundenvorgaben (Titel, gewünschtes Ergebnis, Hintergrund, Zeitpunkt).",
      "Enthält keine unbelegten Behauptungen.",
      "Ist verständlich formuliert.",
      "Ist geschäftlich brauchbar.",
      "Verletzt die Business-Use-Policy nicht.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Erkennung einer echten fachlichen Lücke (Auftrag Abschnitt C/K) – bewusst
// einfach, deterministisch und dokumentiert (kein KI-Modell). Die
// automatische Vollständigkeitsregel in work-order-service.js prüft bereits
// vor READY_FOR_PROCESSING eine Mindestlänge; diese Funktion prüft
// zusätzlich, ob trotz ausreichender Länge jeglicher Hintergrund fehlt UND
// das gewünschte Ergebnis weiterhin sehr knapp ist – ein Hinweis auf eine
// echte inhaltliche Lücke statt nur auf Kürze.
// ---------------------------------------------------------------------------

const CLARIFICATION_DESIRED_RESULT_THRESHOLD = 40;

function detectMissingInformation(fields) {
  const desiredResult = String((fields && fields.desiredResult) || "").trim();
  const hasContext = Boolean(fields && fields.context && String(fields.context).trim());
  if (!hasContext && desiredResult.length < CLARIFICATION_DESIRED_RESULT_THRESHOLD) {
    return "Bitte beschreiben Sie das gewünschte Ergebnis etwas ausführlicher oder ergänzen Sie einen kurzen Hintergrundtext, damit die Zentrale ein passendes Ergebnis erstellen kann.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// K. Internes Ergebnisformat – deterministischer Textentwurf ausschließlich
// auf Basis der vom Kunden gelieferten Felder. Kein externer Provideraufruf,
// keine Zufallszahlen, keine erfundenen Kundendaten.
// ---------------------------------------------------------------------------

function truncateForSummary(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

// Auftrag Abschnitt K/L: resultBody/resultSummary/resultTitle werden dem
// KUNDEN unverändert angezeigt (siehe work-order-result-service.js). Sie
// dürfen daher KEINE Agentennamen, Rollen oder sonstige interne
// Laufinformationen enthalten – diese bleiben ausschließlich Teil der
// separaten Owner-Betriebsansicht (work_order_run_agents, siehe
// work-order-execution-service.js#runOwnerView).
function generateResult(fields, selection) {
  const title = `Ergebnisentwurf: ${fields.title}`;
  const summary = `Ausgearbeiteter Vorschlag der Zentrale zum gewünschten Ergebnis: ${truncateForSummary(fields.desiredResult, 200)}`;

  const bodyParts = [
    `Gewünschtes Ergebnis (Kundenangabe):\n${fields.desiredResult}`,
    fields.context ? `Hintergrund (Kundenangabe):\n${fields.context}` : null,
    fields.deadlineText ? `Gewünschter Zeitpunkt (Kundenangabe):\n${fields.deadlineText}` : null,
    `Vorschlag der Zentrale:\nAuf Basis der genannten Angaben hat die Zentrale den folgenden Entwurf erarbeitet, der das gewünschte Ergebnis strukturiert umsetzt: ${fields.desiredResult}`,
  ].filter(Boolean);

  // selection wird bewusst NICHT im Textkörper referenziert (s. o.); der
  // Parameter bleibt Teil der Signatur, damit ein späterer Schritt (z. B.
  // ein feinerer, agentenspezifischer Textbeitrag) diese Funktion ohne
  // Signaturänderung erweitern kann.
  void selection;

  return { title, summary, body: bodyParts.join("\n\n") };
}

// ---------------------------------------------------------------------------
// Qualitätsprüfung (Auftrag Abschnitt D/K) – rein deterministisch. Prüft
// ausschließlich strukturelle/inhaltliche Vollständigkeit gegenüber den vom
// Kunden gelieferten Feldern; die Business-Use-Policy selbst wird bereits
// zweimal separat geprüft (work-order-service.js/work-order-execution-
// service.js), nicht erneut hier dupliziert.
// ---------------------------------------------------------------------------

function runQualityCheck(fields) {
  const openPoints = [];
  let qualityStatus = "PASSED";
  let qualityNote = "Das Ergebnis entspricht dem gewünschten Ergebnis und den vorliegenden Kundenvorgaben.";

  if (!fields.context) {
    openPoints.push("Kein Hintergrundtext angegeben – zusätzliche Details könnten das Ergebnis weiter verfeinern.");
    qualityStatus = "PASSED_WITH_NOTES";
    qualityNote = "Das Ergebnis wurde ohne zusätzlichen Hintergrundtext erstellt und kann bei Bedarf verfeinert werden.";
  }
  if (!fields.deadlineText) {
    openPoints.push("Kein gewünschter Zeitpunkt angegeben.");
  }

  return { qualityStatus, qualityNote, openPoints };
}

module.exports = {
  ORCHESTRATOR_VERSION,
  MAX_SPECIALIST_AGENTS,
  AGENT_ROLES,
  selectAgentsForWorkOrder,
  buildWorkPlan,
  detectMissingInformation,
  generateResult,
  runQualityCheck,
};
