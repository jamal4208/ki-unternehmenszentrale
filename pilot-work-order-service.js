"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
//
// Beweist, dass drei bestehende Agenten (Projektmanager-, Recherche-/
// Analyse- und Dokumentations-Agent) gemeinsam einen realen Arbeitsauftrag
// von der Auftragsklärung bis zu einem prüfbaren Ergebnis bearbeiten
// können. Gleiches, bereits etabliertes Architekturmuster wie
// health-reference-work-run-service.js: GENAU EIN kanonischer Pilotauftrag,
// additive Governance-Tabellen, keine zweite generische Arbeitsauftrags-
// Architektur (die bestehende kundenseitige work-order-service.js bleibt
// unangetastet und unabhängig von diesem Modul).
//
// Harte Grenzen (Auftrag "Pilotbetrieb vorbereiten"):
//   - Dieses Modul führt NIEMALS eine echte externe Aktion aus (keine
//     E-Mail, keine Veröffentlichung, kein Commit, kein Push, kein
//     Deployment) und ändert NIEMALS eine Datei im Health Upgrade Kompass.
//   - Dieses Modul legt NIEMALS einen neuen Agenten an und erweitert
//     NIEMALS das kanonische 25-Agenten-Register (agent-registry.js).
//   - `APPROVED_FOR_EXECUTION` und `COMPLETED` werden NIEMALS automatisch
//     durch einen Agenten erreicht – ausschließlich über Jamals
//     ausdrückliche, mit `confirmed: true` gesicherte Entscheidung
//     (gleiches Muster wie health-reference-work-run-service.js#
//     recordFinalAcceptance).
//   - Der Projektmanager-Filter (runProjectManagerFilter) ist eine reine,
//     deterministische Funktion ohne I/O und entscheidet, ob eine
//     Rollenübergabe weitergegeben werden darf.
//
// Agentenzuordnung (Auftrag "welche bestehenden Agenten entsprechen den
// drei Pilotrollen?"): ausschließlich bereits bestehende, kanonische
// AGENTS.md-Agenten. "Projektmanager-Agent" und "Dokumentations-Agent"
// (= bestehender "Wissens-/Archiv-Agent", siehe AGENTS.md Nr. 11: "Status,
// Entscheidungen, Historie" / "dokumentieren") sind exakte Treffer. Für
// "Recherche-/Analyse-Agent" existiert KEIN separat benannter Agent im
// 25er-Register (siehe AGENTS.md "Noch zu normalisieren"); dieser Pilot
// verwendet dafür den bestehenden "Produktmanager-Agent" (AGENTS.md Nr. 3:
// "Idee/Nutzerbedarf → Produktstruktur", die inhaltlich nächstliegende
// bestehende Rolle) – eine bewusste, offen dokumentierte Pilotentscheidung,
// KEINE Änderung des 25er-Registers und KEIN Agent 26. Jamal sollte diese
// Zuordnung bestätigen oder korrigieren (siehe Abschlussbericht).
//
// Phase 2 – Mehrfachlauf-Grundlage (Auftrag "beliebig viele Pilotaufträge
// nacheinander verwalten und ausführen"): Dieses Modul war ursprünglich auf
// GENAU EINEN kanonischen Pilotauftrag (CANONICAL_PILOT_ORDER_ID) verdrahtet.
// Die Datenschicht (pilot_work_orders/pilot_handoffs, siehe auth-db.js) war
// bereits pro Auftrags-ID ausgelegt (id TEXT PRIMARY KEY bzw.
// pilotOrderId-Fremdschlüssel) – nur die Serviceschicht hat bislang immer
// dieselbe feste ID verwendet. Deshalb ist KEINE Schemamigration nötig.
// Jede statusverändernde Funktion (markReadyForApproval, approveForExecution,
// startExecution, submitHandoff, submitForReview, approveCompletion,
// returnOrder, reopenFromReturned, blockOrder, unblockOrder) akzeptiert jetzt
// ein optionales `options.pilotOrderId`; fehlt es, wird weiterhin exakt der
// bisherige kanonische Auftrag adressiert (resolveOrderId) – vollständig
// rückwärtskompatibel zu allen bestehenden Aufrufern (Routen, UI, Tests).
// Neue, zusätzliche Pilotaufträge werden ausschließlich über createPilotOrder
// angelegt (eigene, kollisionssichere ID; niemals ein Überschreiben einer
// bestehenden ID). Die Statusmaschine selbst (PILOT_WORK_ORDER_STATUS_VALUES,
// Übergangsregeln, Freigabegrenzen) bleibt unverändert und generisch; ihr
// wird lediglich der jeweils adressierte Auftrag als Kontext übergeben.
//
// Phase 3 – Kontrollierte Parallelfähigkeit (Auftrag "mehrere Pilotaufträge
// technisch sicher gleichzeitig bearbeiten, ohne Kollisionen"): Phase 2 hat
// mehrere Aufträge nacheinander geführt, aber Statusübergänge unbedingt
// zurückgeschrieben ("lesen, prüfen, schreiben" ohne Absicherung des
// Zwischenraums) und Audit-Ereignisse nach dem Motto "Audit-Fehler dürfen
// die bereits gültige Aktion nicht rückgängig machen" bewusst vom
// eigentlichen Schreibvorgang entkoppelt. Für kontrollierte Nebenläufigkeit
// reicht das nicht: (1) jeder Pilotauftrag trägt jetzt einen monoton
// steigenden `revision`-Zähler (Migration 19); jeder Statusübergang läuft
// über ein einziges atomares Compare-and-Set-UPDATE
// (auth-db.js#updatePilotWorkOrderStatusConditional), das nur greift, wenn
// der Auftrag zum Schreibzeitpunkt noch exakt den Status UND die Revision
// besitzt, auf deren Grundlage die Entscheidung getroffen wurde – sonst
// wird ein klar unterscheidbarer Konfliktfehler geworfen, niemals ein
// stiller Erfolg. (2) Statusänderung und ihr zugehöriges Audit-Ereignis
// (sowie, bei Rollenübergaben, die Übergabe selbst) laufen jetzt in EINER
// gemeinsamen Transaktion (authDb.withAuthTransaction) – ein fehlschlagendes
// Audit-Ereignis macht die gesamte Aktion rückgängig, statt eine
// Statusänderung ohne Beleg zu hinterlassen. Das ist eine bewusste
// Abweichung vom sonst im Projekt üblichen "auditSafe"-Muster (Audit
// außerhalb der Transaktion, Fehler werden verschluckt, siehe z. B.
// work-order-execution-service.js) – hier ausdrücklich gefordert, weil ein
// Pilotauftrags-Statuswechsel ohne Audit-Beleg fachlich nicht vertretbar
// wäre. (3) Die Auftragsanlage (createPilotOrder/
// getOrCreateCanonicalPilotOrder) prüft Existenz nicht mehr über ein
// vorgelagertes SELECT, sondern ausschließlich über das Ergebnis eines
// einzigen atomaren INSERT OR IGNORE (kein INSERT OR REPLACE, niemals ein
// stilles Überschreiben). Jede mutierende Funktion akzeptiert zusätzlich
// ein optionales `options.expectedRevision`: wird es übergeben, muss es mit
// der aktuell gespeicherten Revision übereinstimmen, sonst wird die Aktion
// als Konflikt abgelehnt, bevor irgendetwas geschrieben wird – so bleibt
// eine Entscheidung, die auf einem inzwischen veralteten Auftragszustand
// beruht, folgenlos. Ohne `expectedRevision` bleibt das bisherige Verhalten
// (Entscheidung ausschließlich auf Basis des frisch gelesenen Zustands)
// vollständig rückwärtskompatibel erhalten. Weiterhin KEINE Worker, KEINE
// Queue, KEIN zweiter Prozess – dieses Arbeitspaket schafft ausschließlich
// die datenbankseitige Konfliktsicherheit, auf der eine spätere Worker-/
// Queue-Architektur aufsetzen könnte, ohne hier noch einmal grundlegend
// umgebaut werden zu müssen.

const crypto = require("crypto");
const agentRegistry = require("./agent-registry");
const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");
// Phase 7 ("erste echte KI-Agentenausführung über die bestehende
// Codex-Anbindung"): ausschließlich für eine rein lesende
// Verfügbarkeits-/Auth-Anzeige im Overview (siehe buildOverview unten,
// Feld codexAvailability). Bewusst DIREKT dieser Adapter, NICHT
// pilot-agent-execution-service.js (das umgekehrt bereits dieses Modul
// hier importiert – ein Import in die andere Richtung wäre ein
// Zirkelbezug).
const codexAdapter = require("./execution-codex-adapter");
// V8.1 ("Ergebnis verstehen ohne Technik"): ausschließlich additive,
// rein lesende Wiederverwendung der bereits produktiv genutzten
// Abschnittslogik (Quelle der Wahrheit für die verbindliche
// Fünf-Abschnittsstruktur). Es wird hier NICHTS aus diesem Modul
// verändert und keine zweite Parserimplementierung angelegt – siehe
// buildResultPresentation() unten, die ausschließlich bereits exportierte
// Funktionen (getStageContract/parseStageSections/splitIntoItems) aufruft.
const documentationResult = require("./pilot-agent-documentation-result");

const PILOT_WORK_ORDER_STATUS_VALUES = migrations.PILOT_WORK_ORDER_STATUS_VALUES;
const PILOT_ROLE_VALUES = migrations.PILOT_ROLE_VALUES;
const PILOT_HANDOFF_FROM_VALUES = migrations.PILOT_HANDOFF_FROM_VALUES;

const CANONICAL_PILOT_ORDER_ID = "pilot-three-agent-work-order-v1";

// Phase 4 (Auftrag Abschnitt 4 "HTTP-Konfliktbehandlung"): `details` ist ein
// rein additives, optionales Feld mit einer kleinen, festen Menge sicherer,
// nicht-sensibler Zusatzangaben (pilotOrderId/Status/Revision) – NIEMALS ein
// Stacktrace oder ein internes Objekt. Die HTTP-Schicht
// (pilot-work-order-routes.js#sendServiceError) entscheidet whitelist-basiert,
// welche dieser Felder tatsächlich in eine Antwort übernommen werden. Die
// Fehlermeldung selbst (`message`) bleibt in jedem bestehenden Fall exakt
// unverändert (bestehende Tests prüfen den Wortlaut per Regex).
class PilotWorkOrderError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "PilotWorkOrderError";
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : null;
  }
}
function badRequest(message, details) {
  return new PilotWorkOrderError(message, 400, details);
}
function notFound(message, details) {
  return new PilotWorkOrderError(message, 404, details);
}
function conflict(message, details) {
  return new PilotWorkOrderError(message, 409, details);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}
function truncate(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isNonEmptyString(entry));
}

// ---------------------------------------------------------------------------
// V8.7 Stufe A ("Blockierungs- und Rückgabegründe dauerhaft sichern") –
// EINE gemeinsame, reine Validierungsfunktion für beide manuellen
// Entscheidungsgründe: blockOrder(reason) und returnOrder(note). Beide Texte
// werden ab jetzt dauerhaft gespeichert (pilot_work_order_decision_reasons,
// Migration 25) und müssen deshalb dieselbe Prüfung durchlaufen – zwei
// getrennte Prüfungen wären zwei Sicherheitsniveaus.
//
// Bewusste Grundsätze:
// - KEINE stille Bereinigung außer trim und CRLF→LF. Alles andere wird
//   abgewiesen, nicht heimlich repariert: der gespeicherte Grund muss exakt
//   das sein, was Jamal eingegeben hat.
// - KEIN stilles Kürzen. Ein zu langer Text ist ein Eingabefehler (400) und
//   wird nicht auf 500 Zeichen abgeschnitten – sonst stünde später ein
//   halber Satz als verbindliche Begründung in der Historie.
// - Die Fehlermeldungen geben den eingegebenen Text NIEMALS wieder. Gerade
//   bei einem abgewiesenen, möglicherweise sensiblen Inhalt darf dieser
//   nicht über die Fehlerantwort wieder nach außen gelangen.
// - Technische Statuscodes (BLOCKED, RETURNED, HTTP 409 …) sind ausdrücklich
//   erlaubter Fließtext: sie sind für eine Begründung fachlich sinnvoll.
// ---------------------------------------------------------------------------
const DECISION_REASON_MIN_LENGTH = 5;
const DECISION_REASON_MAX_LENGTH = 500;

// C0-Steuerzeichen (U+0000–U+001F) und DEL (U+007F). Einzige bewusste
// Ausnahme ist der Zeilenumbruch U+000A: eine mehrzeilige Begründung ist
// fachlich sinnvoll. U+000D ist NICHT ausgenommen – ein echtes CRLF wurde
// zuvor bereits zu LF normalisiert, ein danach noch verbliebenes
// alleinstehendes CR ist ein Steuerzeichen und wird abgewiesen.
const DECISION_REASON_CONTROL_CHARACTER_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F]/;

// Bewusst eng: nur "<" unmittelbar gefolgt von einem Buchstaben oder "/" gilt
// als HTML-artig. Ein fachlich völlig legitimer Vergleich ("Aufwand < 5 Tage")
// bleibt dadurch erlaubt.
const DECISION_REASON_HTML_LIKE_PATTERN = /<[A-Za-z/]/;

// Gleiches Sicherheitsmuster wie an den bestehenden Grenzen des Projekts
// (local-data-backup.js#SECRET_PATTERNS, execution-codex-adapter.js#
// SECRET_PATTERNS): mögliche Zugangsdaten und maschinenspezifische Pfade
// werden abgewiesen statt gespeichert. Anders als dort wird hier NICHT
// redigiert – ein dauerhaft gespeicherter Entscheidungsgrund soll gar nicht
// erst ein Geheimnis enthalten.
const DECISION_REASON_FORBIDDEN_CONTENT_PATTERNS = Object.freeze([
  /\/Users\//i,
  /[A-Za-z]:\\/,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\bpasswort\b/i,
  /\bcookie\b/i,
  /\bsession[-_\s]?id\b/i,
]);

function validateDecisionReasonText(value, options = {}) {
  const fieldName = options.fieldName || "reason";
  // Die Meldung für den vollständig fehlenden Wert bleibt exakt der
  // bisherige, von bestehenden Tests geprüfte Wortlaut.
  const missingMessage = options.missingMessage || `${fieldName} ist erforderlich.`;
  if (!isNonEmptyString(value)) throw badRequest(missingMessage);

  const normalized = value.replace(/\r\n/g, "\n").trim();

  if (normalized.length < DECISION_REASON_MIN_LENGTH) {
    throw badRequest(
      `${fieldName} ist zu kurz: mindestens ${DECISION_REASON_MIN_LENGTH} Zeichen sind erforderlich, ` +
        "damit die Begründung später nachvollziehbar bleibt.",
    );
  }
  if (normalized.length > DECISION_REASON_MAX_LENGTH) {
    throw badRequest(
      `${fieldName} ist zu lang: höchstens ${DECISION_REASON_MAX_LENGTH} Zeichen sind erlaubt ` +
        `(eingegeben: ${normalized.length}). Der Text wird bewusst nicht automatisch gekürzt – ` +
        "bitte die Begründung selbst kürzen.",
    );
  }
  if (DECISION_REASON_CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw badRequest(
      `${fieldName} enthält unzulässige Steuerzeichen. Erlaubt ist normaler Text, ` +
        "ein Zeilenumbruch ist zulässig.",
    );
  }
  if (DECISION_REASON_HTML_LIKE_PATTERN.test(normalized)) {
    throw badRequest(`${fieldName} darf keine HTML-artigen Eingaben enthalten. Bitte reinen Text eingeben.`);
  }
  if (DECISION_REASON_FORBIDDEN_CONTENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw badRequest(
      `${fieldName} enthält möglicherweise vertrauliche oder maschinenspezifische Angaben ` +
        "(zum Beispiel Zugangsdaten oder lokale Dateipfade) und wird aus Sicherheitsgründen nicht gespeichert. " +
        "Bitte die Begründung ohne solche Angaben formulieren.",
    );
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Agentenzuteilung – ausschließlich bereits vorhandene, kanonische Agenten.
// ---------------------------------------------------------------------------
function resolveCanonicalAgent(canonicalName) {
  const agentKey = agentRegistry.ROLE_NAME_MAPPING[canonicalName];
  if (!agentKey || !agentRegistry.hasAgentId(agentKey)) {
    throw new Error(`pilot-work-order-service: unbekannte kanonische Agentenrolle "${canonicalName}".`);
  }
  const agent = agentRegistry.getAgentById(agentKey);
  return Object.freeze({ canonicalName, agentKey, technicalName: agent.name, technicalRole: agent.role });
}

const PROJECT_MANAGER_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Projektmanager-Agent"),
  pilotRole: "PROJEKTMANAGER",
  pilotRoleLabel: "Projektmanager-Agent",
  focus: "Koordiniert den Pilotauftrag, filtert jede Rollenübergabe (Projektmanager-Filter) und eskaliert Entscheidungen an Jamal.",
  isExactRoleMatch: true,
});

const RESEARCH_ANALYSIS_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Produktmanager-Agent"),
  pilotRole: "RECHERCHE_ANALYSE",
  pilotRoleLabel: "Recherche-/Analyse-Agent",
  focus: "Erarbeitet belastbare, nachvollziehbar begründete Inhalte für den Pilotauftrag.",
  isExactRoleMatch: false,
  mappingNote:
    "Kein separat benannter Recherche-/Analyse-Agent im 25er-Register vorhanden; nächstliegende bestehende Rolle " +
    "ist der Produktmanager-Agent (AGENTS.md Nr. 3). Offener Normalisierungspunkt für Jamal.",
});

const DOCUMENTATION_AGENT = Object.freeze({
  ...resolveCanonicalAgent("Wissens-/Archiv-Agent"),
  pilotRole: "DOKUMENTATION",
  pilotRoleLabel: "Dokumentations-Agent",
  focus: "Erstellt aus den geprüften Ergebnissen ein klar strukturiertes, prüfbares Ergebnis.",
  isExactRoleMatch: true,
  mappingNote: "Entspricht dem bestehenden Wissens-/Archiv-Agent (AGENTS.md Nr. 11: „Status, Entscheidungen, Historie“ / „dokumentieren“).",
});

const PILOT_TEAM = Object.freeze([PROJECT_MANAGER_AGENT, RESEARCH_ANALYSIS_AGENT, DOCUMENTATION_AGENT]);
const PILOT_TEAM_BY_ROLE = new Map(PILOT_TEAM.map((agent) => [agent.pilotRole, agent]));

const PILOT_STATUS_LABELS_DE = Object.freeze({
  DRAFT: "Entwurf",
  READY_FOR_JAMAL_APPROVAL: "Wartet auf deine Freigabe",
  APPROVED_FOR_EXECUTION: "Für Ausführung freigegeben",
  IN_EXECUTION: "In Ausführung",
  READY_FOR_REVIEW: "Wartet auf Abschlussprüfung",
  COMPLETED: "Abgeschlossen",
  RETURNED: "Zurückgegeben",
  BLOCKED: "Blockiert",
});

const PILOT_ORDER_TEXT_MAX_LENGTHS = Object.freeze({
  title: 200,
  desiredOutcome: 2000,
  requestedBy: 200,
  timeframe: 500,
});

const NEXT_STEP_BY_STATUS = Object.freeze({
  DRAFT: "Pilotauftrag prüfen und für deine Freigabe vorbereiten.",
  READY_FOR_JAMAL_APPROVAL: "Du entscheidest über die Freigabe zur Ausführung mit ausdrücklicher Bestätigung.",
  APPROVED_FOR_EXECUTION: "Ausführung starten – Rollenübergaben können danach beginnen.",
  // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette bedienbar
  // machen"): dieser Text bleibt bewusst STATISCH je Status (keine zweite
  // Statusmaschine) und beschreibt deshalb neutral BEIDE möglichen nächsten
  // Schritte während IN_EXECUTION. Welcher davon tatsächlich bedienbar ist
  // (Rollenübergabe vorbereiten vs. zur Abschlussprüfung vorlegen), leitet
  // ausschließlich die Oberfläche (pilot-work-order-ui.js#renderPrimaryAction)
  // aus den bereits vorhandenen Overview-Feldern (handoffs) ab – kein
  // zusätzliches Serverfeld, keine neue Statusmaschine.
  IN_EXECUTION: "Rollenübergabe einreichen oder zur Abschlussprüfung vorlegen.",
  READY_FOR_REVIEW: "Du entscheidest über den Abschluss mit ausdrücklicher Bestätigung oder gibst den Auftrag zur Überarbeitung zurück.",
  COMPLETED: "Pilotlauf abgeschlossen – kein weiterer Schritt in diesem Lauf.",
  RETURNED: "Ursache klären, danach erneut als Entwurf starten.",
  BLOCKED: "Blockade klären und danach kontrolliert aufheben.",
});

const AUTONOMY_BOUNDARIES_NOTICE = Object.freeze({
  noExternalAction: true,
  noEmailOrMessageSent: true,
  noPublication: true,
  noPaymentOrContract: true,
  noDeployment: true,
  noHealthUpgradeKompassChange: true,
  noNewAgentCreated: true,
  noAutonomyIncrease: true,
  autoApprovalByAgentAllowed: false,
  executionApprovalRequiresExplicitJamalConfirmation: true,
  completionApprovalRequiresExplicitJamalConfirmation: true,
  disclaimer:
    "Dieser Pilotlauf bereitet die Drei-Agenten-Zusammenarbeit vor und begleitet sie. Er ist keine externe Aktion, " +
    "kein Commit, kein Push und kein Deployment.",
});

// Auftragsisolation (Phase 2): jede schreibende Aktion adressiert genau
// einen Auftrag über seine ID. Fehlt options.pilotOrderId, bleibt exakt das
// bisherige Verhalten erhalten (kanonischer Pilotauftrag) – kein impliziter
// Zugriff auf einen anderen als den ausdrücklich adressierten Auftrag.
function resolveOrderId(options = {}) {
  return isNonEmptyString(options.pilotOrderId) ? options.pilotOrderId.trim() : CANONICAL_PILOT_ORDER_ID;
}

function assertOrderIsMutable(order, orderId) {
  if (!order) throw notFound(`Der Pilotauftrag "${orderId || ""}" wurde nicht gefunden.`, { pilotOrderId: orderId || null });
  if (order.status === "COMPLETED") {
    throw conflict("Der Pilotauftrag ist bereits abgeschlossen (COMPLETED) und kann nicht mehr verändert werden.", {
      pilotOrderId: order.id,
      currentStatus: order.status,
    });
  }
}

// Phase 3 (kontrollierte Nebenläufigkeit): optionale, vom Aufrufer
// mitgegebene Erwartung der zuletzt gelesenen Revision. Nur wenn
// `options.expectedRevision` tatsächlich übergeben wird, wird geprüft; ohne
// diesen Wert bleibt das Verhalten vollständig rückwärtskompatibel (reine
// Entscheidung auf Basis des gerade frisch gelesenen Zustands, wie vor
// Phase 3). Ein Abweichen wird IMMER als Konflikt behandelt – nie als
// stiller Fallback auf den aktuellen Zustand -, weil genau das die
// Situation ist, die diese Prüfung erkennen soll: eine Entscheidung, die
// auf einem inzwischen überholten Auftragszustand beruht.
function assertExpectedRevision(order, options = {}) {
  if (options.expectedRevision === undefined || options.expectedRevision === null) return;
  if (order.revision !== options.expectedRevision) {
    throw conflict(
      `Der Pilotauftrag "${order.id}" hat sich seit dem zuletzt gelesenen Zustand geändert ` +
        `(erwartete Revision ${options.expectedRevision}, aktuell ${order.revision}). ` +
        "Bitte den aktuellen Zustand erneut laden und die Entscheidung erneut treffen.",
      {
        pilotOrderId: order.id,
        expectedRevision: options.expectedRevision,
        currentRevision: order.revision,
        currentStatus: order.status,
      },
    );
  }
}

// Bündelt den bisher an jeder mutierenden Funktion wiederholten Ablauf
// "frisch laden, Unveränderlichkeit prüfen, optionale Revisionserwartung
// prüfen" – fachlich unverändert gegenüber Phase 2, nur nicht mehr
// dupliziert.
function loadMutableOrder(db, orderId, options) {
  const orderRow = authDb.getPilotWorkOrderById(db, orderId);
  assertOrderIsMutable(orderRow, orderId);
  assertExpectedRevision(orderRow, options);
  return orderRow;
}

// ---------------------------------------------------------------------------
// Validierung des Pilotauftragsobjekts (Auftrag Abschnitt 1). Wird
// unabhängig getestet ("gültige Pilotauftragserstellung" /
// "Ablehnung unvollständiger Aufträge").
// ---------------------------------------------------------------------------
function validatePilotOrderInput(input = {}) {
  const errors = [];
  if (!isNonEmptyString(input.title)) errors.push("title");
  if (!isNonEmptyString(input.desiredOutcome)) errors.push("desiredOutcome");
  if (!isNonEmptyString(input.requestedBy)) errors.push("requestedBy");
  if (!isNonEmptyStringArray(input.qualityCriteria)) errors.push("qualityCriteria");
  if (!isNonEmptyStringArray(input.allowedTools)) errors.push("allowedTools");
  if (!isNonEmptyStringArray(input.forbiddenActions)) errors.push("forbiddenActions");
  if (!isNonEmptyStringArray(input.requiredApprovals)) errors.push("requiredApprovals");
  if (!isNonEmptyString(input.timeframe)) errors.push("timeframe");
  if (errors.length > 0) {
    throw badRequest(`Pilotauftrag ist unvollständig, es fehlen: ${errors.join(", ")}.`);
  }
  const lengthChecks = [
    { value: input.title, maxLength: PILOT_ORDER_TEXT_MAX_LENGTHS.title, fieldLabel: "Der Titel" },
    { value: input.desiredOutcome, maxLength: PILOT_ORDER_TEXT_MAX_LENGTHS.desiredOutcome, fieldLabel: "Das gewünschte Ergebnis" },
    { value: input.requestedBy, maxLength: PILOT_ORDER_TEXT_MAX_LENGTHS.requestedBy, fieldLabel: "Das Feld „Angefordert von“" },
    { value: input.timeframe, maxLength: PILOT_ORDER_TEXT_MAX_LENGTHS.timeframe, fieldLabel: "Der Zeitrahmen" },
  ];
  for (const check of lengthChecks) {
    const currentLength = String(check.value).length;
    if (currentLength > check.maxLength) {
      throw badRequest(`${check.fieldLabel} darf höchstens ${check.maxLength} Zeichen haben (aktuell ${currentLength}).`);
    }
  }
}

// Kanonischer Pilotauftragsinhalt (Auftrag Abschnitt 1) – der einzige Inhalt,
// mit dem getOrCreateCanonicalPilotOrder den kanonischen Lauf anlegt.
const CANONICAL_PILOT_ORDER_INPUT = Object.freeze({
  title: "Pilotauftrag: Drei-Agenten-Zusammenarbeit von Auftragsklärung bis prüfbarem Ergebnis",
  desiredOutcome:
    "Nachweis, dass Projektmanager-, Recherche-/Analyse- und Dokumentations-Agent gemeinsam einen realen " +
    "Arbeitsauftrag von der Auftragsklärung bis zu einem geprüften, klar dokumentierten Ergebnis führen können " +
    "– vollständig vorbereitend, read-only und ohne externe Aktion.",
  requestedBy: "Jamal",
  qualityCriteria: Object.freeze([
    "Ergebnis beantwortet die Auftragsfrage vollständig",
    "Quellen oder Grundlagen sind nachvollziehbar benannt",
    "Risiken und Grenzen sind offen benannt",
    "keine verbotene Aktion wurde ausgeführt",
    "Ergebnis ist klar strukturiert (Titel, Kernaussage, Belege, offene Punkte)",
  ]),
  allowedTools: Object.freeze([
    "interne Dokumentenablage (read-only)",
    "bestehende kanonische Register (project-registry.js, agent-registry.js, read-only)",
    "bestehende Plugin-/Tool-Radar-Übersicht (read-only)",
  ]),
  forbiddenActions: Object.freeze([
    "externe Schreibzugriffe",
    "E-Mails oder Nachrichten versenden",
    "Veröffentlichung",
    "Zahlungen oder Verträge",
    "Deployment",
    "automatische Freigabe durch einen Agenten",
    "Änderung am Health Upgrade Kompass",
  ]),
  requiredApprovals: Object.freeze([
    "Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)",
    "Freigabe des finalen Ergebnisses (COMPLETED)",
    "jede externe Aktion oder Autonomieerhöhung",
  ]),
  timeframe: "Pilotlauf ohne festes Enddatum; Start ausschließlich nach Jamals ausdrücklicher Freigabe eines realen Arbeitsauftrags.",
});

function rowToOrderView(row) {
  if (!row) return null;
  let involvedAgents = PILOT_TEAM;
  try {
    const parsed = JSON.parse(row.involvedAgentsJson);
    if (Array.isArray(parsed) && parsed.length === PILOT_TEAM.length) involvedAgents = PILOT_TEAM;
  } catch (_error) {
    /* Fällt sicher auf die aktuelle, im Code definierte Teamzuordnung zurück. */
  }
  return {
    id: row.id,
    title: row.title,
    desiredOutcome: row.desiredOutcome,
    requestedBy: row.requestedBy,
    status: row.status,
    statusLabel: PILOT_STATUS_LABELS_DE[row.status] || row.status,
    // Phase 3 (kontrollierte Nebenläufigkeit): sichtbarer Revisionszähler,
    // damit ein Aufrufer die zuletzt gelesene Revision als
    // `options.expectedRevision` bei der nächsten Aktion mitgeben kann.
    revision: row.revision,
    involvedAgents,
    qualityCriteria: JSON.parse(row.qualityCriteriaJson),
    allowedTools: JSON.parse(row.allowedToolsJson),
    forbiddenActions: JSON.parse(row.forbiddenActionsJson),
    requiredApprovals: JSON.parse(row.requiredApprovalsJson),
    timeframe: row.timeframe,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToHandoffView(row) {
  if (!row) return null;
  let pmFilterReasons = [];
  try {
    pmFilterReasons = row.pmFilterReasonsJson ? JSON.parse(row.pmFilterReasonsJson) : [];
  } catch (_error) {
    pmFilterReasons = [];
  }
  return {
    id: row.id,
    pilotOrderId: row.pilotOrderId,
    sequence: row.sequence,
    fromPilotRole: row.fromPilotRole,
    toPilotRole: row.toPilotRole,
    toPilotRoleLabel: (PILOT_TEAM_BY_ROLE.get(row.toPilotRole) || {}).pilotRoleLabel || row.toPilotRole,
    shortFinding: row.shortFinding,
    resultOrRecommendation: row.resultOrRecommendation,
    basisUsed: row.basisUsed,
    riskOrLimit: row.riskOrLimit,
    nextStep: row.nextStep,
    decisionNeeded: row.decisionNeeded,
    forbiddenActionOccurred: Boolean(row.forbiddenActionOccurred),
    autonomyBoundaryRespected: Boolean(row.autonomyBoundaryRespected),
    pmFilterStatus: row.pmFilterStatus,
    pmFilterReasons,
    // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): verweist – sofern
    // gesetzt – auf den technischen Agentenlauf (pilot_agent_execution_runs),
    // aus dessen tatsächlichem Ergebnis diese Rollenübergabe hervorgegangen
    // ist. Bleibt bei allen bisherigen, manuell eingereichten Übergaben
    // unverändert null.
    executionRunId: row.executionRunId || null,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Anlage/Abruf des kanonischen Pilotauftrags – idempotent, genau eine feste
// ID (Auftrag Abschnitt 1).
// ---------------------------------------------------------------------------
// Phase 3: Anlage und Audit-Nachweis laufen jetzt in einer einzigen
// atomaren Transaktion – entweder existiert nach diesem Aufruf ein
// vollständiger Datensatz MIT passendem PILOT_WORK_ORDER_CREATED-Audit,
// oder (bei einem Audit-Fehler) gar nichts davon. Die Existenzprüfung
// selbst beruht ausschließlich auf dem `created`-Rückgabewert des
// atomaren INSERT OR IGNORE, nicht mehr auf einem vorgelagerten SELECT.
function getOrCreateCanonicalPilotOrder(db, options = {}) {
  const now = options.now || new Date();
  validatePilotOrderInput(CANONICAL_PILOT_ORDER_INPUT);
  const orderRow = authDb.withAuthTransaction(db, () => {
    const { row, created } = authDb.insertPilotWorkOrderIfMissing(db, {
      id: CANONICAL_PILOT_ORDER_ID,
      title: CANONICAL_PILOT_ORDER_INPUT.title,
      desiredOutcome: CANONICAL_PILOT_ORDER_INPUT.desiredOutcome,
      requestedBy: CANONICAL_PILOT_ORDER_INPUT.requestedBy,
      involvedAgentsJson: JSON.stringify(PILOT_TEAM.map((agent) => ({ pilotRole: agent.pilotRole, canonicalName: agent.canonicalName }))),
      status: "DRAFT",
      qualityCriteriaJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.qualityCriteria),
      allowedToolsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.allowedTools),
      forbiddenActionsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.forbiddenActions),
      requiredApprovalsJson: JSON.stringify(CANONICAL_PILOT_ORDER_INPUT.requiredApprovals),
      timeframe: CANONICAL_PILOT_ORDER_INPUT.timeframe,
      createdAt: nowIso(now),
      updatedAt: nowIso(now),
    });
    if (created) {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_WORK_ORDER_CREATED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: CANONICAL_PILOT_ORDER_ID },
      });
    }
    return row;
  });
  return orderRow ? buildOverview(db, orderRow) : null;
}

const PILOT_ORDER_ID_PREFIX = "pilot-order-";

function generatePilotOrderId() {
  return `${PILOT_ORDER_ID_PREFIX}${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Mehrfachlauf-Grundlage (Phase 2, Auftrag Abschnitt 1/"Auftragsverwaltung"):
// Anlage eines weiteren, eigenständigen Pilotauftrags zusätzlich zum
// unveränderten kanonischen Pilotauftrag. Anders als
// getOrCreateCanonicalPilotOrder (idempotent, fester Inhalt, feste ID) ist
// createPilotOrder ein striktes "Anlegen" mit frei wählbarem Inhalt: eine
// bereits vergebene ID (inklusive der kanonischen) wird abgewiesen statt
// stillschweigend übernommen oder überschrieben – kein "Überschreiben des
// aktiven Auftrags" möglich. Ohne options.id wird eine kollisionsarme,
// zufällige ID erzeugt (crypto.randomUUID(), gleiches Verfahren wie bei
// Rollenübergabe- und Audit-Event-IDs); mit options.id bleibt die ID in
// Tests deterministisch kontrollierbar.
// ---------------------------------------------------------------------------
// Phase 3: die Existenzprüfung erfolgt ausschließlich atomar (siehe
// auth-db.js#insertPilotWorkOrderIfMissing) – kein vorgelagertes SELECT
// mehr, das eine Lücke zwischen Prüfen und Schreiben öffnen könnte. Ein
// gleichzeitiger zweiter Anlageversuch derselben ID sieht garantiert
// `created === false` und verändert nichts am bereits bestehenden
// Datensatz. Anlage und Audit-Nachweis laufen zusätzlich in einer
// gemeinsamen Transaktion (kein Auftrag ohne Audit-Beleg, kein Audit-Beleg
// ohne Auftrag).
function createPilotOrder(db, input = {}, options = {}) {
  validatePilotOrderInput(input);
  const now = options.now || new Date();
  const requestedId = isNonEmptyString(options.id) ? options.id.trim() : null;
  const orderId = requestedId || generatePilotOrderId();
  // Die kanonische ID ist immer reserviert, unabhängig davon, ob der
  // kanonische Auftrag in dieser Datenbank bereits materialisiert wurde
  // (getOrCreateCanonicalPilotOrder legt ihn erst bei Bedarf an). Reiner
  // Wertevergleich, kein DB-Zugriff nötig, also keine Race-Betrachtung
  // erforderlich.
  if (orderId === CANONICAL_PILOT_ORDER_ID) {
    throw conflict(`Ein Pilotauftrag mit der ID "${orderId}" existiert bereits und wird nicht überschrieben.`, {
      pilotOrderId: orderId,
    });
  }
  const orderRow = authDb.withAuthTransaction(db, () => {
    const { row, created } = authDb.insertPilotWorkOrderIfMissing(db, {
      id: orderId,
      title: input.title,
      desiredOutcome: input.desiredOutcome,
      requestedBy: input.requestedBy,
      involvedAgentsJson: JSON.stringify(PILOT_TEAM.map((agent) => ({ pilotRole: agent.pilotRole, canonicalName: agent.canonicalName }))),
      status: "DRAFT",
      qualityCriteriaJson: JSON.stringify(input.qualityCriteria),
      allowedToolsJson: JSON.stringify(input.allowedTools),
      forbiddenActionsJson: JSON.stringify(input.forbiddenActions),
      requiredApprovalsJson: JSON.stringify(input.requiredApprovals),
      timeframe: input.timeframe,
      createdAt: nowIso(now),
      updatedAt: nowIso(now),
    });
    if (!created) {
      // INSERT OR IGNORE kann außer UNIQUE-Kollisionen auch andere
      // Constraint-Verletzungen stillschweigend überspringen;
      // changes === 0 allein beweist daher keine ID-Kollision.
      if (row) {
        throw conflict(`Ein Pilotauftrag mit der ID "${orderId}" existiert bereits und wird nicht überschrieben.`, {
          pilotOrderId: orderId,
        });
      }
      throw new PilotWorkOrderError(
        `Der Pilotauftrag "${orderId}" konnte nicht angelegt werden, ohne dass eine bestehende ID-Kollision nachgewiesen werden konnte.`,
        500,
        {
          pilotOrderId: orderId,
          reasonCode: "PILOT_ORDER_INSERT_SKIPPED_WITHOUT_ROW",
        },
      );
    }
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_WORK_ORDER_CREATED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId: orderId },
    });
    return row;
  });
  return buildOverview(db, orderRow);
}

// Liest genau einen, ausdrücklich benannten Pilotauftrag – im Unterschied zu
// getPilotOverview()/getOrCreateCanonicalPilotOrder() KEIN automatisches
// Anlegen. Ein unbekannter/ungültiger orderId führt zu einem Fehler statt zu
// einem stillschweigenden Fallback auf den kanonischen Auftrag.
function getPilotOrderOverview(db, orderId) {
  if (!isNonEmptyString(orderId)) throw badRequest("pilotOrderId ist erforderlich.");
  const orderRow = authDb.getPilotWorkOrderById(db, orderId.trim());
  if (!orderRow) throw notFound(`Der Pilotauftrag "${orderId}" wurde nicht gefunden.`, { pilotOrderId: orderId });
  return buildOverview(db, orderRow);
}

// Auflistung aller bisher angelegten Pilotaufträge (kanonischer Auftrag plus
// alle über createPilotOrder angelegten). Reine Leseoperation für
// Auftragsverwaltung/Tests, keine Statusänderung.
function listPilotOrders(db) {
  return authDb.listPilotWorkOrders(db).map(rowToOrderView);
}

// ---------------------------------------------------------------------------
// V8.1 ("Ergebnis verstehen ohne Technik") – additive, rein lesende
// Aufbereitung eines bereits gespeicherten Kettenergebnisses für die
// fachliche Darstellung im Cockpit. Verändert weder den Schreibpfad noch die
// Validierung; nutzt ausschließlich die bereits produktiv genutzte
// Abschnittslogik aus pilot-agent-documentation-result.js
// (getStageContract/parseStageSections/splitIntoItems). Der gespeicherte
// resultRawText wird dabei an keiner Stelle verändert – es wird lediglich ein
// zusätzliches, rein lesendes Feld (resultPresentation) berechnet.
//
// Die Zuordnung Pilotrolle -> Stufenvertrag ist dieselbe, die bereits an
// anderer Stelle produktiv verwendet wird (siehe CHAIN_STEP_TO_PILOT_ROLE
// unten bzw. pilot-agent-execution-chain-service.js#STEP_NUMBER_TO_PILOT_ROLE
// und pilot-agent-execution-service.js#resultContractStageForPreset): Schritt
// 1 (RECHERCHE_ANALYSE) nutzt den Rechercheervertrag, Schritt 2
// (DOKUMENTATION) den Dokumentationsvertrag, Schritt 3 (PROJEKTMANAGER) den
// Projektmanagervertrag. Für jede andere/unbekannte Pilotrolle ist keine
// Stufe bekannt – es wird dann ehrlich "keine bekannte Struktur" gemeldet,
// niemals eine Struktur erfunden.
const PILOT_ROLE_TO_RESULT_CONTRACT_STAGE = Object.freeze({
  RECHERCHE_ANALYSE: documentationResult.RESULT_CONTRACT_STAGES.RESEARCH,
  DOKUMENTATION: documentationResult.RESULT_CONTRACT_STAGES.DOCUMENTATION,
  PROJEKTMANAGER: documentationResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER,
});

// Formt die bereits vom Produktivparser (parseStageSections) gelieferten
// Rohabschnitte in eine für die Darstellung bequeme Form. `splitIntoItems`
// ist exakt dieselbe, bereits produktiv genutzte Funktion, die auch beim
// Speichern eines Ergebnisses die Punkte eines Item-Abschnitts trennt – hier
// ausschließlich lesend auf den bereits gespeicherten resultRawText
// angewendet, niemals umgekehrt.
function buildResultPresentationSections(contract, parsedSections) {
  return parsedSections.map((section) => {
    const rule = contract.sectionRules[section.sectionNumber];
    if (rule.kind === "ITEMS") {
      const split = documentationResult.splitIntoItems(section.bodyLines);
      return {
        number: section.sectionNumber,
        title: rule.title,
        kind: "ITEMS",
        prose: null,
        items: split.items,
      };
    }
    return {
      number: section.sectionNumber,
      title: rule.title,
      kind: "PROSE",
      prose: section.bodyText,
      items: [],
    };
  });
}

const UNSTRUCTURED_RESULT_HONEST_NOTICE =
  "Das Ergebnis hält die vereinbarte Gliederung nicht ein. Es wird unverändert angezeigt; " +
  "eine verlässliche Kurzfassung steht nicht zur Verfügung.";

const NO_KNOWN_CONTRACT_HONEST_NOTICE =
  "Für dieses Ergebnis ist keine vereinbarte Fünf-Abschnittsstruktur bekannt. Es wird unverändert " +
  "angezeigt; eine verlässliche Kurzfassung steht nicht zur Verfügung.";

// Rückgabe: { structureStatus, sections, rawTextAvailable, contractStage,
// resultLabel, honestNotice }. structureStatus ist genau einer von
// "STRUCTURED" | "UNSTRUCTURED_ACCEPTED" | "UNAVAILABLE" (siehe Auftrag
// Abschnitt 6). Erfindet niemals eine Struktur: ist die tatsächliche,
// bereits gespeicherte Stufenzuordnung unbekannt oder erfüllt der Rohtext den
// Abschnittsvertrag nicht, wird ausschließlich der ehrliche Hinweistext
// zurückgegeben, niemals eine Kurzfassung.
function buildResultPresentation(run) {
  const rawTextAvailable = isNonEmptyString(run.resultRawText);
  if (!rawTextAvailable) {
    return {
      structureStatus: "UNAVAILABLE",
      sections: [],
      rawTextAvailable: false,
      contractStage: null,
      resultLabel: null,
      honestNotice: null,
    };
  }
  const stage = PILOT_ROLE_TO_RESULT_CONTRACT_STAGE[run.pilotRole] || null;
  if (!stage) {
    return {
      structureStatus: "UNSTRUCTURED_ACCEPTED",
      sections: [],
      rawTextAvailable: true,
      contractStage: null,
      resultLabel: null,
      honestNotice: NO_KNOWN_CONTRACT_HONEST_NOTICE,
    };
  }
  const contract = documentationResult.getStageContract(stage);
  const parsed = documentationResult.parseStageSections(contract, run.resultRawText);
  if (!parsed.structureValid) {
    return {
      structureStatus: "UNSTRUCTURED_ACCEPTED",
      sections: [],
      rawTextAvailable: true,
      contractStage: stage,
      resultLabel: contract.resultLabel,
      honestNotice: UNSTRUCTURED_RESULT_HONEST_NOTICE,
    };
  }
  return {
    structureStatus: "STRUCTURED",
    sections: buildResultPresentationSections(contract, parsed.sections),
    rawTextAvailable: true,
    contractStage: stage,
    resultLabel: contract.resultLabel,
    honestNotice: null,
  };
}

// Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): kompakte,
// auftragsbezogene Sicht auf jeden bisherigen technischen Agentenlauf.
// Bewusst hier (nicht in pilot-agent-execution-service.js) implementiert,
// damit die bestehende, bereits überall verwendete Overview-Struktur
// (buildOverview) die einzige Quelle für den Ausführungsstatus bleibt –
// keine zweite, separat abzufragende Ressource nötig. Reine Lesefunktion,
// keine Abhängigkeit von pilot-agent-execution-service.js (verhindert einen
// Zirkelbezug, da dieses Modul umgekehrt pilot-work-order-service.js
// verwendet).
function rowToAgentExecutionRunSummary(row) {
  let resultSummary = null;
  try {
    resultSummary = row.resultSummaryJson ? JSON.parse(row.resultSummaryJson) : null;
  } catch (_error) {
    resultSummary = null;
  }
  return {
    id: row.id,
    presetId: row.presetId,
    pilotRole: row.pilotRole,
    pilotRoleLabel: (PILOT_TEAM_BY_ROLE.get(row.pilotRole) || {}).pilotRoleLabel || row.pilotRole,
    taskTitle: row.taskTitle,
    runnerId: row.runnerId,
    runnerLabel: row.runnerLabel,
    status: row.status,
    resultSummary,
    resultRawText: row.resultRawText,
    // V8.1 ("Ergebnis verstehen ohne Technik"): additives, rein lesendes
    // Feld – siehe buildResultPresentation() oben. Nutzt ausschließlich
    // row.status/row.resultRawText/row.pilotRole, die bereits alle Teil
    // dieses unveränderten Datensatzes sind.
    resultPresentation: buildResultPresentation({
      status: row.status,
      resultRawText: row.resultRawText,
      pilotRole: row.pilotRole,
    }),
    errorMessage: row.errorMessage,
    promptDigest: row.promptDigest || null,
    promptCharCount: row.promptCharCount === null || row.promptCharCount === undefined ? null : row.promptCharCount,
    mandateDigest: row.mandateDigest || null,
    mandateOrderRevision: row.mandateOrderRevision === null || row.mandateOrderRevision === undefined ? null : row.mandateOrderRevision,
    predecessorCharCount: row.predecessorCharCount === null || row.predecessorCharCount === undefined ? null : row.predecessorCharCount,
    predecessorIncludedCharCount:
      row.predecessorIncludedCharCount === null || row.predecessorIncludedCharCount === undefined
        ? null
        : row.predecessorIncludedCharCount,
    predecessorTruncated: Boolean(row.predecessorTruncated),
    resultTruncated: Boolean(row.resultTruncated),
    // Korrekturlauf vor Commit (Migration 21): Stufe B (fachliche
    // Rollenübergabe) getrennt vom Runstatus sichtbar machen, damit die UI
    // einen technischen Runner-Erfolg und einen davon unabhängigen
    // Handoff-Fehlschlag unterscheidbar darstellen kann (niemals als
    // Runner-Fehler).
    handoffStatus: row.handoffStatus || "PENDING",
    handoffErrorMessage: row.handoffErrorMessage || null,
    // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
    // Codex-Anbindung") – Runner-/KI-Metadaten (Migration 22, additiv). Für
    // jeden Vor-Phase-7-Lauf bzw. jeden Lauf über den unveränderten lokalen
    // Pfad liefern die Spalten-Defaults bereits die ehrlichen
    // Phase-6-Werte.
    requestedRunnerKind: row.requestedRunnerKind || "LOCAL_DETERMINISTIC_READ_ONLY",
    actualRunnerKind: row.actualRunnerKind || "LOCAL_DETERMINISTIC_READ_ONLY",
    runnerVersion: row.runnerVersion || null,
    modelLabel: row.modelLabel || null,
    aiExecuted: Boolean(row.aiExecuted),
    fallbackUsed: Boolean(row.fallbackUsed),
    fallbackReason: row.fallbackReason || null,
    networkRequired: Boolean(row.networkRequired),
    externalAiRequired: Boolean(row.externalAiRequired),
    approvalStatus: row.approvalStatus || "NOT_REQUIRED",
    timedOut: Boolean(row.timedOut),
    cancelledRun: Boolean(row.cancelledRun),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

const CHAIN_STEP_TO_PILOT_ROLE = Object.freeze({
  1: "RECHERCHE_ANALYSE",
  2: "DOKUMENTATION",
  3: "PROJEKTMANAGER",
});

// V7.8.0 Korrektur: die im Cockpit auswählbaren Ketten-Dateien stammen
// ausschließlich aus der serverseitigen Allowlist von
// pilot-agent-execution-service.js. Der require ist bewusst lazy, um beim
// Modulstart keinen Zirkelbezug zu erzwingen (dieses Modul wird dort bereits
// importiert).
function getChainSelectableFilesSnapshot() {
  try {
    const executionService = require("./pilot-agent-execution-service");
    if (Array.isArray(executionService.CHAIN_SELECTABLE_FILES)) {
      return executionService.CHAIN_SELECTABLE_FILES.slice();
    }
  } catch (_error) {
    // Bei sehr frühem Bootstrap (bevor das Gegenmodul vollständig geladen ist)
    // bleibt die Liste defensiv leer; in der normalen Cockpitlaufzeit ist sie
    // vollständig vorhanden.
  }
  return [];
}

// V7.9.9: rein lesende Empfehlung, welche Teilmenge der Allowlist das
// Cockpit für einen auf die Nutzerperspektive gerichteten Praxislauf
// vorauswählt. Kommt bewusst ebenfalls ausschließlich aus der
// serverseitigen Quelle der Wahrheit
// (pilot-agent-execution-service.js#CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES),
// damit das Cockpit keine eigene, potenziell abweichende Dateiliste führt.
// Erweitert keine Rechte: die tatsächlich übermittelte Auswahl wird beim
// Vorbereiten unverändert erneut gegen die Allowlist geprüft.
function getChainRecommendedFilesSnapshot() {
  try {
    const executionService = require("./pilot-agent-execution-service");
    if (Array.isArray(executionService.CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES)) {
      return executionService.CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.slice();
    }
  } catch (_error) {
    // Siehe getChainSelectableFilesSnapshot: defensiv leer beim Bootstrap.
  }
  return [];
}

function loadChainRoleProgress(db, pilotOrderId) {
  const bookedRoles = new Set();
  try {
    const chains = authDb.listPilotAgentExecutionChainsForOrder(db, pilotOrderId);
    chains.forEach((chainRow) => {
      const steps = authDb.listPilotAgentExecutionChainStepsForChain(db, chainRow.id);
      steps.forEach((stepRow) => {
        const mappedRole = CHAIN_STEP_TO_PILOT_ROLE[stepRow.stepNumber];
        if (!mappedRole) return;
        const roleBookedByColumn = stepRow.roleHandoffBooked === undefined ? true : Boolean(stepRow.roleHandoffBooked);
        if (stepRow.stepStatus === "SUCCEEDED" && roleBookedByColumn) {
          bookedRoles.add(mappedRole);
        }
      });
    });
  } catch (error) {
    // Alte Datenbankstände (z. B. gezielte Migrationstests auf Version 22)
    // enthalten die Kettentabellen noch nicht. In diesem Fall ist der
    // Kettenfortschritt definitionsgemäß leer.
    if (!String((error && error.message) || "").includes("no such table")) {
      throw error;
    }
  }
  return Array.from(bookedRoles);
}

// V8.7 Stufe A – Aufbereitung einer gespeicherten Gründe-Zeile für das
// Overview. Rein lesend, keine UI-Texte (die Oberfläche entscheidet selbst
// über Darstellung und Beschriftung), keine serverseitige Kürzung: der Text
// wird exakt so ausgeliefert, wie er eingegeben und gespeichert wurde.
// Gleiches, bereits etabliertes Muster wie loadChainRoleProgress oben: alte
// Datenbankstände (gezielte Migrationstests auf Version 22, siehe
// pilot-agent-execution-chain.test.js) kennen die Gründe-Tabelle noch nicht.
// Dort gibt es definitionsgemäß keine gespeicherten Gründe. Ausschließlich
// dieser eine, klar benannte Fall wird abgefangen – jeder andere
// Datenbankfehler wird unverändert weitergereicht und niemals verschluckt.
function loadDecisionReasonRows(db, pilotOrderId) {
  try {
    return authDb.listPilotWorkOrderDecisionReasons(db, pilotOrderId);
  } catch (error) {
    if (!String((error && error.message) || "").includes("no such table")) {
      throw error;
    }
    return [];
  }
}

function rowToDecisionReasonView(row) {
  return {
    kind: row.reasonKind,
    text: row.reasonText,
    setAt: row.createdAt,
    setByUserId: row.actorUserId ?? null,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    orderRevision: row.orderRevisionAfter,
  };
}

function buildOverview(db, orderRow) {
  if (!orderRow) return null;
  const order = rowToOrderView(orderRow);
  const handoffs = authDb.listPilotHandoffs(db, orderRow.id).map(rowToHandoffView);

  // V8.7 Stufe A – Blockierungs-/Rückgabegründe. Einzige Quelle ist die
  // append-only Fachtabelle (Migration 25); es wird NICHTS aus Status,
  // Rollenübergaben, Audittexten oder pmFilterReasonsJson abgeleitet.
  //
  // Aktualität ist rein rechnerisch: aktuell gültig ist genau die Zeile mit
  // orderRevisionAfter === order.revision. Jede spätere Statusänderung
  // erhöht die Auftragsrevision, wodurch ein früherer Grund automatisch nur
  // noch historisch ist – ohne Aufräumlogik und ohne dass eine gespeicherte
  // Zeile jemals verändert wird. Ein Bestandsauftrag ohne gespeicherte
  // Gründe liefert deshalb null und eine leere Historie (kein Backfill).
  const decisionReasonRows = loadDecisionReasonRows(db, orderRow.id);
  const decisionReasonHistory = decisionReasonRows.map(rowToDecisionReasonView);
  const currentDecisionReason =
    decisionReasonHistory.find((entry) => entry.orderRevision === order.revision) || null;
  const agentExecutionRuns = authDb
    .listPilotAgentExecutionRunsForOrder(db, orderRow.id)
    .map(rowToAgentExecutionRunSummary);

  // Teilpaket 1 ("Historischen decisionNeeded-Text nicht mehr als aktuelle
  // Entscheidung anzeigen"): `openDecision` beschreibt ausschließlich die
  // JETZT offene Entscheidung. Die ersten drei Zweige leiten sie explizit aus
  // dem aktuellen Status ab; nur der letzte greift auf einen gespeicherten
  // Freitext zurück.
  //
  // `lastHandoff.decisionNeeded` ist reiner historischer Freitext einer
  // einzelnen Rollenübergabe: er wird beim Anlegen der Übergabe genau einmal
  // gespeichert (submitHandoff unten), danach nie verändert und nach einem
  // Statuswechsel nirgends fachlich entwertet. Ohne die Statusbedingung
  // konnte er deshalb bei DRAFT, APPROVED_FOR_EXECUTION, RETURNED und
  // COMPLETED beliebig lange als AKTUELLE Handlungsaufforderung erscheinen –
  // bei COMPLETED sogar dauerhaft, obwohl dieser Status terminal ist
  // (assertOrderIsMutable oben) und dort keine Aktion mehr zulässig ist.
  //
  // IN_EXECUTION ist der einzige Status, in dem dieser Text aktuell sein
  // KANN, und das ist keine Konvention, sondern strukturell erzwungen:
  // submitHandoff() legt eine Übergabe ausschließlich aus IN_EXECUTION heraus
  // an. Ist der Auftrag also nicht (mehr) IN_EXECUTION, liegt zwischen der
  // letzten Übergabe und dem jetzigen Zustand zwingend mindestens ein
  // Statuswechsel – der Text ist dann nachweislich Historie.
  //
  // Es wird dabei NICHTS gelöscht, gekürzt oder migriert: die Übergabe samt
  // decisionNeeded bleibt unverändert in `handoffs` enthalten und dadurch in
  // der bestehenden Detailfläche „Übergabedetails“ vollständig sichtbar.
  // Ebenso unberührt bleibt der aktuelle Rückgabe-/Blockiergrund, der aus der
  // eigenen, revisionsgebundenen Quelle `currentDecisionReason` oben stammt.
  const lastHandoff = handoffs.length > 0 ? handoffs[handoffs.length - 1] : null;
  let openDecision = null;
  if (order.status === "READY_FOR_JAMAL_APPROVAL") {
    openDecision = "Du musst die Ausführung freigeben oder den Auftrag zur Überarbeitung zurückgeben.";
  } else if (order.status === "READY_FOR_REVIEW") {
    openDecision = "Du musst das Ergebnis abnehmen oder den Auftrag zur Überarbeitung zurückgeben.";
  } else if (order.status === "BLOCKED") {
    openDecision = "Du musst die Blockade klären, bevor der Pilotlauf fortgesetzt werden kann.";
  } else if (order.status === "IN_EXECUTION" && lastHandoff && lastHandoff.decisionNeeded) {
    openDecision = lastHandoff.decisionNeeded;
  }

  const risksAndLimits = Array.from(new Set(handoffs.map((handoff) => handoff.riskOrLimit).filter(Boolean)));

  const handoffPassedRoles = new Set(handoffs.filter((handoff) => handoff.pmFilterStatus === "PASSED").map((handoff) => handoff.toPilotRole));
  const chainBookedRoles = loadChainRoleProgress(db, orderRow.id);

  // Phase 7 – ausschließlich lesende, gecachte (execution-codex-adapter.js#
  // DEFAULT_AVAILABILITY_TTL_MS) CLI-Prüfung, niemals ein Login-Vorgang,
  // niemals eine Freigabe. Ermöglicht dem Cockpit, Codex-Verfügbarkeit
  // anzuzeigen, ohne dafür einen Agentenlauf zu starten.
  let codexAvailability;
  try {
    const raw = codexAdapter.detectCodexAvailability();
    codexAvailability = {
      available: Boolean(raw.available),
      authenticated: Boolean(raw.authenticated),
      version: raw.version || null,
      authLabel: raw.authLabel || null,
    };
  } catch (_error) {
    codexAvailability = { available: false, authenticated: false, version: null, authLabel: null };
  }

  return {
    order,
    involvedAgents: order.involvedAgents,
    status: order.status,
    statusLabel: order.statusLabel,
    handoffs,
    agentExecutionRuns,
    codexAvailability,
    chainSelectableFiles: getChainSelectableFilesSnapshot(),
    chainRecommendedFiles: getChainRecommendedFilesSnapshot(),
    openDecision,
    risksAndLimits,
    currentDecisionReason,
    decisionReasonHistory,
    nextStep: NEXT_STEP_BY_STATUS[order.status] || NEXT_STEP_BY_STATUS.DRAFT,
    progress: {
      rolesPassed: handoffPassedRoles.size,
      rolesTotal: PILOT_ROLE_VALUES.length,
      handoffsSubmitted: handoffs.length,
      chainRolesBooked: chainBookedRoles.length,
    },
    chainRoleProgress: {
      bookedRoles: chainBookedRoles,
      bookedCount: chainBookedRoles.length,
      totalCount: PILOT_ROLE_VALUES.length,
    },
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

// Rückwärtskompatibler Standardeinstieg: ohne pilotOrderId exakt das
// bisherige Verhalten (kanonischer Auftrag, automatisch angelegt, falls
// noch nicht vorhanden). Mit ausdrücklich übergebener pilotOrderId wird
// stattdessen genau dieser Auftrag gelesen (kein automatisches Anlegen für
// nicht-kanonische Aufträge).
function getPilotOverview(db, options = {}) {
  const orderId = resolveOrderId(options);
  if (orderId === CANONICAL_PILOT_ORDER_ID) return getOrCreateCanonicalPilotOrder(db, options);
  return getPilotOrderOverview(db, orderId);
}

// Phase 3 (kontrollierte Nebenläufigkeit) – generische, atomare
// Statusmaschinen-Anwendung: `order` (der bereits geladene, dem Aufruf
// zugrunde liegende Auftragszustand samt Revision) wird als Kontext
// übergeben; der Übergang verändert ausschließlich diesen einen,
// ausdrücklich adressierten Auftrag (order.id) – niemals einen anderen.
//
// Statusänderung und ihr PILOT_WORK_ORDER_STATUS_CHANGED-Audit-Ereignis
// laufen in einer gemeinsamen Transaktion (authDb.withAuthTransaction):
// entweder werden beide dauerhaft, oder keins von beiden. better-sqlite3
// unterstützt verschachtelte Transaktionen über SAVEPOINTs – ruft eine
// aufrufende Funktion (z. B. approveForExecution, submitHandoff) diese
// Funktion bereits innerhalb einer eigenen äußeren Transaktion auf, bleibt
// die Gesamtheit trotzdem atomar, ein Fehlschlag an beliebiger Stelle
// macht alles rückgängig.
//
// Die eigentliche Zustandsänderung läuft über ein einziges atomares
// Compare-and-Set-UPDATE (WHERE status = <erwarteter Ausgangsstatus> AND
// revision = <erwartete Revision>). Trifft die Bedingung nicht mehr zu
// (weil der Auftrag zwischenzeitlich verändert wurde), wird ein klar
// unterscheidbarer Konfliktfehler geworfen statt eines stillen Erfolgs
// oder eines stillen Fallbacks auf den aktuellen Zustand.
//
// Bleibt previousStatus === nextStatus (z. B. blockOrder auf einem
// bereits blockierten Auftrag), ist das fachlich ein wirkungsloses No-op:
// keine Revisionserhöhung, kein Audit-Ereignis – identisches Verhalten zu
// vor Phase 3, nur jetzt ausdrücklich benannt statt implizit über eine
// Bedingung in einer separaten Auditfunktion.
function applyStatusTransition(db, order, nextStatus, options) {
  const previousStatus = order.status;
  if (previousStatus === nextStatus) return order.revision;
  return authDb.withAuthTransaction(db, () => {
    const previousRevision = order.revision;
    const applied = authDb.updatePilotWorkOrderStatusConditional(db, {
      id: order.id,
      expectedStatus: previousStatus,
      expectedRevision: previousRevision,
      nextStatus,
      updatedAt: nowIso(options.now),
    });
    if (!applied) {
      // Zusatzangabe für die HTTP-Antwort (Auftrag Abschnitt 4): ein
      // zusätzlicher Lesevorgang innerhalb derselben, bereits offenen
      // Transaktion, ausschließlich um den tatsächlich aktuellen Stand in
      // die Fehlerantwort aufzunehmen – ändert nichts, prüft nichts erneut.
      const currentRow = authDb.getPilotWorkOrderById(db, order.id);
      throw conflict(
        `Der Pilotauftrag "${order.id}" wurde zwischenzeitlich verändert (erwarteter Status "${previousStatus}" ` +
          `mit Revision ${previousRevision} stimmt nicht mehr mit dem gespeicherten Zustand überein). ` +
          "Bitte den aktuellen Zustand erneut laden und die Aktion wiederholen.",
        {
          pilotOrderId: order.id,
          expectedStatus: previousStatus,
          expectedRevision: previousRevision,
          currentStatus: currentRow ? currentRow.status : null,
          currentRevision: currentRow ? currentRow.revision : null,
        },
      );
    }
    const nextRevision = previousRevision + 1;
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_WORK_ORDER_STATUS_CHANGED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(options.now),
      metadata: { pilotOrderId: order.id, previousStatus, nextStatus, previousRevision, nextRevision },
    });
    return nextRevision;
  });
}

// ---------------------------------------------------------------------------
// Statusübergänge (Auftrag Abschnitt 4). Keine automatische Freigabe durch
// Agenten: APPROVED_FOR_EXECUTION und COMPLETED erfordern `confirmed: true`.
// ---------------------------------------------------------------------------
function markReadyForApproval(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "DRAFT") {
    throw conflict(`Der Pilotauftrag kann nur aus DRAFT heraus zur Freigabe vorgelegt werden (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  applyStatusTransition(db, orderRow, "READY_FOR_JAMAL_APPROVAL", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

// Statusübergang UND die zugehörige Ausführungsfreigabe-Auditierung
// laufen in einer gemeinsamen Transaktion (Phase 3, Auftrag Abschnitt 3):
// niemals eine Freigabe ohne erreichten Status, niemals ein erreichter
// Status ohne dokumentierte Freigabe.
function approveForExecution(db, options = {}) {
  if (options.confirmed !== true) {
    throw badRequest("Die Freigabe zur Ausführung erfordert confirmed === true (Jamals ausdrückliche Bestätigung).");
  }
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "READY_FOR_JAMAL_APPROVAL") {
    throw conflict(`Eine Ausführungsfreigabe ist nur aus READY_FOR_JAMAL_APPROVAL möglich (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  authDb.withAuthTransaction(db, () => {
    applyStatusTransition(db, orderRow, "APPROVED_FOR_EXECUTION", options);
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_EXECUTION_APPROVAL_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(options.now),
      metadata: { pilotOrderId: orderId },
    });
  });
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

function startExecution(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "APPROVED_FOR_EXECUTION") {
    throw conflict(`Die Ausführung kann nur nach Freigabe (APPROVED_FOR_EXECUTION) gestartet werden (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  applyStatusTransition(db, orderRow, "IN_EXECUTION", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

// ---------------------------------------------------------------------------
// Werkzeugprüfung (Auftrag Abschnitt "erlaubte Werkzeuge"/"verbotene
// Aktionen") – reine Funktion, wirft bei nicht erlaubtem/verbotenem
// Werkzeug oder Aktion.
// ---------------------------------------------------------------------------
function assertToolOrActionAllowed(order, toolOrActionName) {
  const name = String(toolOrActionName || "").trim();
  const forbidden = (order.forbiddenActions || []).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (forbidden) {
    throw new PilotWorkOrderError(`"${forbidden}" ist eine verbotene Aktion in diesem Pilotauftrag und wird blockiert.`, 403);
  }
  const allowed = (order.allowedTools || []).some((entry) => entry.toLowerCase() === name.toLowerCase());
  if (!allowed) {
    throw new PilotWorkOrderError(`"${name}" ist kein erlaubtes Werkzeug in diesem Pilotauftrag und wird blockiert.`, 403);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Projektmanager-Filter (Auftrag Abschnitt 3) – reine, deterministische
// Funktion ohne I/O. Der Projektmanager darf ein Ergebnis nur weitergeben,
// wenn alle fünf Kriterien erfüllt sind.
// ---------------------------------------------------------------------------
function runProjectManagerFilter(order, handoffInput = {}) {
  const checks = [
    {
      key: "MATCHES_ORDER",
      label: "Ergebnis passt zum Auftrag",
      passed: isNonEmptyString(handoffInput.resultOrRecommendation) && handoffInput.pilotOrderId === order.id,
    },
    {
      key: "BASIS_TRACEABLE",
      label: "Quellen oder Grundlagen sind nachvollziehbar",
      passed: isNonEmptyString(handoffInput.basisUsed),
    },
    {
      key: "RISKS_NAMED",
      label: "Risiken sind genannt",
      passed: isNonEmptyString(handoffInput.riskOrLimit),
    },
    {
      key: "NO_FORBIDDEN_ACTION",
      label: "keine verbotene Aktion ist erfolgt",
      passed: handoffInput.forbiddenActionOccurred !== true,
    },
    {
      key: "WITHIN_JAMAL_APPROVAL_BOUNDARY",
      label: "Jamals Freigabegrenze ist eingehalten",
      passed: handoffInput.autonomyBoundaryRespected !== false,
    },
  ];
  const passed = checks.every((check) => check.passed);
  return { passed, checks, reasons: checks.filter((check) => !check.passed).map((check) => check.label) };
}

// ---------------------------------------------------------------------------
// Rollenübergabe (Auftrag Abschnitt 2) – nur während IN_EXECUTION möglich.
// Läuft automatisch durch den Projektmanager-Filter, bevor sie als
// angenommen gilt.
// ---------------------------------------------------------------------------
// Phase 3 (Auftrag Abschnitt 3/11): Rollenübergabe-Anlage, ihr
// PILOT_HANDOFF_SUBMITTED-Audit und der ggf. daraus folgende
// Statusübergang (samt dessen Audit-Ereignissen) laufen als EINE
// gemeinsame Transaktion. Weder darf eine Übergabe gespeichert bleiben,
// obwohl der zugehörige Statusübergang scheiterte, noch darf ein
// Statusübergang stehen bleiben, obwohl die zugrunde liegende Übergabe
// selbst nicht dauerhaft gespeichert wurde. Die Sequenznummer wird nicht
// mehr aus einer separat gelesenen Liste berechnet, sondern atomar in
// auth-db.js#insertPilotHandoff per SQL-Unterabfrage vergeben.
function submitHandoff(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(`Rollenübergaben sind nur während IN_EXECUTION möglich (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  const fromPilotRole = options.fromPilotRole || "JAMAL";
  const toPilotRole = options.toPilotRole;
  if (!PILOT_HANDOFF_FROM_VALUES.includes(fromPilotRole)) throw badRequest("fromPilotRole ist unbekannt.");
  if (!PILOT_ROLE_VALUES.includes(toPilotRole)) throw badRequest("toPilotRole ist unbekannt.");

  const requiredTextFields = ["shortFinding", "resultOrRecommendation", "basisUsed", "riskOrLimit", "nextStep"];
  const missing = requiredTextFields.filter((field) => !isNonEmptyString(options[field]));
  if (missing.length > 0) {
    throw badRequest(`Rollenübergabe ist unvollständig, es fehlen: ${missing.join(", ")}.`);
  }

  const now = options.now || new Date();
  const order = rowToOrderView(orderRow);
  const filterInput = {
    pilotOrderId: orderId,
    resultOrRecommendation: options.resultOrRecommendation,
    basisUsed: options.basisUsed,
    riskOrLimit: options.riskOrLimit,
    forbiddenActionOccurred: Boolean(options.forbiddenActionOccurred),
    autonomyBoundaryRespected: options.autonomyBoundaryRespected !== false,
  };
  const filterResult = runProjectManagerFilter(order, filterInput);
  const pmFilterStatus = filterResult.passed ? "PASSED" : "REJECTED";
  const handoffId = crypto.randomUUID();

  return authDb.withAuthTransaction(db, () => {
    const handoffRow = authDb.insertPilotHandoff(db, {
      id: handoffId,
      pilotOrderId: orderId,
      fromPilotRole,
      toPilotRole,
      shortFinding: truncate(options.shortFinding, 1000),
      resultOrRecommendation: truncate(options.resultOrRecommendation, 4000),
      basisUsed: truncate(options.basisUsed, 2000),
      riskOrLimit: truncate(options.riskOrLimit, 2000),
      nextStep: truncate(options.nextStep, 1000),
      decisionNeeded: options.decisionNeeded ? truncate(options.decisionNeeded, 1000) : null,
      forbiddenActionOccurred: Boolean(options.forbiddenActionOccurred),
      autonomyBoundaryRespected: options.autonomyBoundaryRespected !== false,
      pmFilterStatus,
      pmFilterReasonsJson: JSON.stringify(filterResult.reasons),
      // Phase 6: optional, nur gesetzt, wenn diese Übergabe tatsächlich aus
      // einem technischen Agentenlauf (lokaler deterministischer
      // Read-Only-Runner, kein KI-Modellaufruf) hervorgegangen ist (siehe
      // pilot-agent-execution-service.js). Fehlt es, bleibt das Verhalten
      // exakt wie vor Phase 6 (null, manuell eingereichte Übergabe).
      executionRunId: isNonEmptyString(options.executionRunId) ? options.executionRunId.trim() : null,
      createdAt: nowIso(now),
    });

    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_HANDOFF_SUBMITTED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: { pilotOrderId: orderId, pilotHandoffId: handoffRow.id, pilotRole: toPilotRole },
    });

    if (options.forbiddenActionOccurred === true) {
      applyStatusTransition(db, orderRow, "BLOCKED", options);
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION",
        result: "DENIED",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: orderId, pilotHandoffId: handoffRow.id },
      });
    } else if (!filterResult.passed) {
      applyStatusTransition(db, orderRow, "RETURNED", options);
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_REJECTED_BY_PM_FILTER",
        result: "DENIED",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: orderId, pilotHandoffId: handoffRow.id, pmFilterStatus },
      });
    } else {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_HANDOFF_ACCEPTED_BY_PM_FILTER",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId: orderId, pilotHandoffId: handoffRow.id, pmFilterStatus },
      });
    }

    return { handoff: rowToHandoffView(handoffRow), filterResult };
  });
}

function submitForReview(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(`Nur ein Auftrag in IN_EXECUTION kann zur Abschlussprüfung vorgelegt werden (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  const handoffs = authDb.listPilotHandoffs(db, orderId).map(rowToHandoffView);
  const hasPassedDocumentationHandoff = handoffs.some(
    (handoff) => handoff.toPilotRole === "DOKUMENTATION" && handoff.pmFilterStatus === "PASSED",
  );
  if (!hasPassedDocumentationHandoff) {
    throw badRequest("Es liegt noch kein vom Projektmanager-Filter angenommenes Dokumentations-Ergebnis vor.");
  }
  applyStatusTransition(db, orderRow, "READY_FOR_REVIEW", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

// Statusübergang UND die zugehörige Abschluss-Auditierung laufen in einer
// gemeinsamen Transaktion (Phase 3, Auftrag Abschnitt 3): niemals eine
// dokumentierte Abnahme ohne erreichten COMPLETED-Status, niemals ein
// COMPLETED-Status ohne dokumentierte Abnahme.
function approveCompletion(db, options = {}) {
  if (options.confirmed !== true) {
    throw badRequest("Der Abschluss erfordert confirmed === true (Jamals ausdrückliche Bestätigung).");
  }
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "READY_FOR_REVIEW") {
    throw conflict(`Ein Abschluss ist nur aus READY_FOR_REVIEW möglich (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  authDb.withAuthTransaction(db, () => {
    applyStatusTransition(db, orderRow, "COMPLETED", options);
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_COMPLETION_APPROVAL_RECORDED",
      result: "OK",
      actorUserId: options.actorUserId ?? null,
      tenantId: null,
      timestamp: nowIso(options.now),
      metadata: { pilotOrderId: orderId },
    });
  });
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

// V8.7 Stufe A – gemeinsamer Schreibpfad für Statuswechsel UND Grundeintrag.
// Beides läuft in EINER withAuthTransaction-Klammer: entweder werden
// Statuswechsel und Gründe-Zeile beide dauerhaft, oder keiner von beiden.
// Ein CAS-/Revisionskonflikt in applyStatusTransition wirft, bevor die
// Gründe-Zeile überhaupt geschrieben wird, und rollt zusätzlich die gesamte
// Klammer zurück – es kann daher weder ein blockierter Auftrag ohne den
// gerade eingegebenen Grund noch ein Grund ohne erfolgten Statuswechsel
// entstehen.
//
// Die Gründe-Zeile wird ausschließlich bei einem TATSÄCHLICHEN Statuswechsel
// geschrieben: bleibt applyStatusTransition ein wirkungsloses No-op (der
// Auftrag hat den Zielstatus bereits, die Revision bleibt unverändert),
// entsteht bewusst kein Eintrag – sonst gäbe es zwei Gründe-Zeilen zur
// selben Auftragsrevision und die Aktualitätsregel wäre nicht mehr eindeutig.
//
// buildOverview() läuft bewusst NACH der Transaktion (unverändert zum
// bisherigen Aufbau): es ist rein lesend und führt unter anderem eine
// gecachte Codex-Verfügbarkeitsprüfung aus, die nichts in einer offenen
// Schreibtransaktion zu suchen hat.
function applyManualDecisionWithReason(db, options, { orderRow, nextStatus, reasonKind, reasonText }) {
  authDb.withAuthTransaction(db, () => {
    const fromStatus = orderRow.status;
    const orderRevisionBefore = orderRow.revision;
    const orderRevisionAfter = applyStatusTransition(db, orderRow, nextStatus, options);
    if (orderRevisionAfter <= orderRevisionBefore) return;
    authDb.insertPilotWorkOrderDecisionReason(db, {
      id: crypto.randomUUID(),
      pilotOrderId: orderRow.id,
      reasonKind,
      reasonText,
      fromStatus,
      toStatus: nextStatus,
      orderRevisionBefore,
      orderRevisionAfter,
      actorUserId: options.actorUserId ?? null,
      createdAt: nowIso(options.now),
    });
  });
}

function returnOrder(db, options = {}) {
  const reasonText = validateDecisionReasonText(options.note, {
    fieldName: "note",
    missingMessage: "note ist erforderlich (Grund der Rückgabe).",
  });
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (!["READY_FOR_JAMAL_APPROVAL", "READY_FOR_REVIEW", "IN_EXECUTION"].includes(orderRow.status)) {
    throw conflict(`Eine Rückgabe ist aus ${orderRow.status} nicht möglich.`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  applyManualDecisionWithReason(db, options, {
    orderRow,
    nextStatus: "RETURNED",
    reasonKind: "RETURN",
    reasonText,
  });
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

function reopenFromReturned(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "RETURNED") {
    throw conflict(`Nur ein zurückgegebener Auftrag (RETURNED) kann neu gestartet werden (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  applyStatusTransition(db, orderRow, "DRAFT", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

function blockOrder(db, options = {}) {
  const reasonText = validateDecisionReasonText(options.reason, {
    fieldName: "reason",
    missingMessage: "reason ist erforderlich.",
  });
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  applyManualDecisionWithReason(db, options, {
    orderRow,
    nextStatus: "BLOCKED",
    reasonKind: "BLOCK",
    reasonText,
  });
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

function unblockOrder(db, options = {}) {
  const orderId = resolveOrderId(options);
  const orderRow = loadMutableOrder(db, orderId, options);
  if (orderRow.status !== "BLOCKED") {
    throw conflict(`Nur ein blockierter Auftrag (BLOCKED) kann entsperrt werden (aktuell ${orderRow.status}).`, {
      pilotOrderId: orderId,
      currentStatus: orderRow.status,
    });
  }
  applyStatusTransition(db, orderRow, "RETURNED", options);
  return buildOverview(db, authDb.getPilotWorkOrderById(db, orderId));
}

module.exports = {
  CANONICAL_PILOT_ORDER_ID,
  CANONICAL_PILOT_ORDER_INPUT,
  PILOT_WORK_ORDER_STATUS_VALUES,
  PILOT_ROLE_VALUES,
  PILOT_HANDOFF_FROM_VALUES,
  PROJECT_MANAGER_AGENT,
  RESEARCH_ANALYSIS_AGENT,
  DOCUMENTATION_AGENT,
  PILOT_TEAM,
  PILOT_STATUS_LABELS_DE,
  NEXT_STEP_BY_STATUS,
  AUTONOMY_BOUNDARIES_NOTICE,
  PilotWorkOrderError,
  resolveCanonicalAgent,
  validatePilotOrderInput,
  assertToolOrActionAllowed,
  runProjectManagerFilter,
  getOrCreateCanonicalPilotOrder,
  createPilotOrder,
  getPilotOrderOverview,
  listPilotOrders,
  getPilotOverview,
  markReadyForApproval,
  approveForExecution,
  startExecution,
  submitHandoff,
  submitForReview,
  approveCompletion,
  returnOrder,
  reopenFromReturned,
  blockOrder,
  unblockOrder,
};
