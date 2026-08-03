"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 6 ("technische
// Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner").
//
// Ehrliche Einordnung: KEIN echter KI-Agentenlauf, kein Codex-Aufruf, kein
// Netzwerk. Verbindet den bestehenden Pilotauftrags-/Statusmaschinen-/PM-Filter-Kern
// (pilot-work-order-service.js) mit einem tatsächlich aufgerufenen,
// lokalen Runner (pilot-agent-runner.js) für genau eine der drei
// bestehenden Pilotrollen. Dieses Modul führt NIEMALS eine externe Aktion
// aus (kein Commit, kein Push, kein Deployment, keine Netzwerkanfrage) und
// erweitert NIEMALS das kanonische 25-Agenten-Register.
//
// Architekturentscheidung (siehe Abschlussbericht Phase 6, Abschnitt 3):
// execution-bridge.js wird bewusst NICHT wiederverwendet. Sie ist auf
// isolierte, dateiverändernde Code-Ausführung mit Workspace-Materialisierung,
// Diff und Apply-Gate gegen Health/Fixture-Projekte zugeschnitten. Ein
// Pilot-Agentenlauf in dieser Phase erzeugt dagegen ein rein lesendes,
// strukturiertes TEXT-Ergebnis – keine Datei wird verändert. Für diese aus
// dem Auftrag vorgegebene Aufgabenart ("ausschließlich lesender Zugriff …
// strukturiertes textliches Ergebnis") ist die Bridge nicht die passende
// Abstraktion; ihre wiederverwendbaren Prinzipien (serverseitig geprüfte
// Grenzen, ein aktiver Lauf gleichzeitig, Audit jeder Statusänderung) werden
// hier jedoch bewusst identisch nachgebildet.
//
// Ein Agentenlauf ist eine rein technische Ausführungseinheit, getrennt von
// der fachlichen Pilotauftrags-Statusmaschine (siehe Migration 20,
// PILOT_AGENT_EXECUTION_RUN_STATUS_VALUES). Er verändert den fachlichen
// Auftragsstatus niemals selbst – ausschließlich das bereits bestehende,
// unveränderte submitHandoff() (inklusive Projektmanager-Filter) kann das
// tun, und auch das nur nach den bereits bestehenden Regeln (z. B. BLOCKED
// bei verbotener Aktion).

const crypto = require("crypto");

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const authDbMigrations = require("./auth-db-migrations");
const pilotWorkOrderService = require("./pilot-work-order-service");
const agentRegistry = require("./agent-registry");
const runner = require("./pilot-agent-runner");
const codexRunner = require("./pilot-agent-codex-runner");
const codexAdapter = require("./execution-codex-adapter");

// Phase 7 ("erste echte KI-Agentenausführung über die bestehende
// Codex-Anbindung"): die beiden einzigen erlaubten Runner-Arten. Bewusst
// direkt aus der Migration abgeleitet (auth-db-migrations.js#
// PILOT_AGENT_RUNNER_KIND_VALUES) statt als eigene, potenziell driftende
// Literale – ein Abweichen der beiden Listen wäre sofort ein Laufzeitfehler
// (Zugriff auf ein undefined-Element unten), nicht erst ein stiller Bug.
const RUNNER_KINDS = Object.freeze({
  LOCAL: authDbMigrations.PILOT_AGENT_RUNNER_KIND_VALUES[0],
  CODEX: authDbMigrations.PILOT_AGENT_RUNNER_KIND_VALUES[1],
});
if (RUNNER_KINDS.LOCAL !== "LOCAL_DETERMINISTIC_READ_ONLY" || RUNNER_KINDS.CODEX !== "CODEX_READ_ONLY") {
  throw new Error("pilot-agent-execution-service: PILOT_AGENT_RUNNER_KIND_VALUES weicht von der erwarteten Reihenfolge ab.");
}

class PilotAgentExecutionError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "PilotAgentExecutionError";
    this.statusCode = statusCode;
    this.details = details && typeof details === "object" ? details : null;
  }
}
function badRequest(message, details) {
  return new PilotAgentExecutionError(message, 400, details);
}
function notFound(message, details) {
  return new PilotAgentExecutionError(message, 404, details);
}
function conflict(message, details) {
  return new PilotAgentExecutionError(message, 409, details);
}

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

// Repository-Wurzel: exakt dieses Projektverzeichnis (die Zentrale selbst),
// niemals das Health-Repository. pilot-agent-runner.js#assertSafeRelativeFilePath
// verhindert zusätzlich jede Traversierung/Symlink-Flucht über die Wurzel
// hinaus.
const REPO_ROOT = __dirname;

// ---------------------------------------------------------------------------
// Serverautoritative Aufgaben-Presets (gleiches Prinzip wie
// execution-codex-adapter.js#CODEX_TASK_PRESETS): allowedFiles/allowedTools/
// forbiddenActions kommen ausschließlich aus einem hier fest definierten
// Preset, NIEMALS aus einer freien Eingabe des Aufrufers. Ein Agent kann sich
// dadurch niemals allein durch seine Rolle zusätzliche Rechte verschaffen.
// ---------------------------------------------------------------------------
const PILOT_AGENT_TASK_PRESETS = Object.freeze({
  "analyze-pilot-structure": Object.freeze({
    presetId: "analyze-pilot-structure",
    runnerKind: RUNNER_KINDS.LOCAL,
    pilotRole: "RECHERCHE_ANALYSE",
    // Rollenübergabe-Richtung nach erfolgreichem Lauf: entspricht exakt dem
    // bereits bestehenden, etablierten Muster "Recherche/Analyse liefert an
    // Dokumentation" (siehe pilot-work-order.test.js).
    handoffFromPilotRole: "RECHERCHE_ANALYSE",
    handoffToPilotRole: "DOKUMENTATION",
    title: "Technische Pilotstruktur analysieren",
    instructions:
      "Erstelle eine kompakte, sachliche Bestandsaufnahme der vorhandenen Pilot-Auftragsstruktur mit drei " +
      "belegbaren Beobachtungen und einer klaren Empfehlung für den nächsten technischen Schritt. Ausschließlich " +
      "lesender Zugriff auf die unten genannten, bereits vorhandenen Projektdateien.",
    allowedFiles: Object.freeze(["pilot-work-order-service.js", "pilot-work-order-routes.js", "pilot-agent-runner.js"]),
    allowedTools: Object.freeze(["Lesen (read-only Repository-Zugriff)", "Strukturierte Textausgabe"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "externe Netzwerkanfragen",
      "Health-Projekt lesen oder verändern",
      "neue Abhängigkeiten installieren",
      "Prozesse außerhalb des Projekts verändern",
    ]),
    expectedResultFormat: "Titel, drei belegbare Beobachtungen, eine Empfehlung – strukturierter Text.",
  }),
  // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
  // Codex-Anbindung") – ausschließlich lesender Codex-Analyseauftrag,
  // identisch zum "Kontrollierten Referenzlauf" des Phase-7-Auftrags.
  // Bewusst ein EIGENES, striktes Preset statt einer bloßen Runner-Variante
  // des obigen lokalen Presets:
  //   - engere allowedFiles (genau die vier im Auftrag genannten Dateien),
  //   - agentKeyOverride "review-agent" statt der Standardzuordnung
  //     RECHERCHE_ANALYSE -> product-agent (siehe resolveAgentForPreset
  //     unten). "review-agent" ("Führt read-only Qualitätsreview durch",
  //     agent-registry.js) ist die fachlich am besten passende bereits
  //     bestehende Identität für einen neutralen, ausschließlich lesenden
  //     Analyseauftrag über eine reale KI – deutlich passender als
  //     project-status-agent (verdichtet Fortschritt, kein Review) oder der
  //     bereits für den lokalen Runner verwendete product-agent (sonst
  //     bekäme dieselbe Rolle zwei technisch unterschiedliche Runner ohne
  //     erkennbaren Unterschied in der Kennzeichnung). pilotRole bleibt
  //     bewusst RECHERCHE_ANALYSE (siehe handoffFromPilotRole/
  //     handoffToPilotRole unten) – ausschließlich für die
  //     Handoff-Semantik/-Richtung, NICHT für die Agentenidentität im
  //     Codex-Prompt. Keine neue Pilotrolle, keine Registry-Änderung.
  "codex-analyze-pilot-structure": Object.freeze({
    presetId: "codex-analyze-pilot-structure",
    runnerKind: RUNNER_KINDS.CODEX,
    pilotRole: "RECHERCHE_ANALYSE",
    agentKeyOverride: "review-agent",
    handoffFromPilotRole: "RECHERCHE_ANALYSE",
    handoffToPilotRole: "DOKUMENTATION",
    title: "Phase-7-Pilotstruktur semantisch prüfen",
    instructions:
      "Erstelle eine kurze, inhaltliche Analyse der technischen Agentenlauf-Infrastruktur mit drei konkreten " +
      "Beobachtungen, zwei Risiken und einer priorisierten Empfehlung. Ausschließlich lesender Zugriff auf die " +
      "unten genannten, bereits vorhandenen Projektdateien.",
    allowedFiles: Object.freeze([
      "pilot-agent-execution-service.js",
      "pilot-agent-runner.js",
      "execution-codex-adapter.js",
      "auth-db-migrations.js",
    ]),
    allowedTools: Object.freeze(["Lesen (read-only Workspace-Zugriff)", "Strukturierte Textantwort über Codex"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "Diff erzeugen oder anwenden",
      "externe Netzwerkanfragen außer dem einen freigegebenen Codex-Roundtrip",
      "Health-Projekt lesen oder verändern",
      "Secrets oder Zugangsdaten ausgeben",
      "neue Abhängigkeiten installieren",
      "weitere, nicht genannte Dateien lesen",
    ]),
    expectedResultFormat: "Titel, drei konkrete Beobachtungen, zwei Risiken, eine priorisierte Empfehlung – strukturierter Text.",
  }),
  // Phase 8 ("vollständige, kontrollierte Drei-Agenten-Kette") – Schritt 1
  // (Recherche-/Analyse-Agent) EIGENES, dediziertes Kettenpreset – bewusst
  // NICHT eine Wiederverwendung des obigen "codex-analyze-pilot-structure"
  // (dieses bleibt für den bestehenden Phase-7-Einzellauf byteidentisch
  // unangetastet, siehe Abschlussbericht Abschnitt 2). agentKeyOverride
  // "review-agent" entspricht exakt der im Auftrag bevorzugten Identität.
  // chainManaged: true (siehe finalizeAgentExecutionRun unten) – ein
  // Kettenschritt löst NIEMALS automatisch die klassische, bestehende
  // Rollenübergabe (submitHandoff/PM-Filter) auf dem zugrunde liegenden
  // Pilotauftrag aus; das bleibt ausschließlich der eigenständigen
  // Kettenlogik (pilot-agent-execution-chain-service.js) vorbehalten, die
  // Ergebnisse ausschließlich über die Kettentabellen selbst weiterreicht.
  "codex-chain-research-analysis": Object.freeze({
    presetId: "codex-chain-research-analysis",
    runnerKind: RUNNER_KINDS.CODEX,
    pilotRole: "RECHERCHE_ANALYSE",
    agentKeyOverride: "review-agent",
    chainManaged: true,
    title: "Kettenschritt 1 – Quellmaterial strukturiert analysieren",
    instructions:
      "Lies das dir zugewiesene Quellmaterial, strukturiere deine Beobachtungen, benenne Risiken und formuliere " +
      "eine priorisierte Empfehlung. Täusche keine abschließende Dokumentation vor. Erteile keine " +
      "Projektmanager-Freigabe.",
    allowedFiles: Object.freeze([
      "pilot-agent-execution-chain-service.js",
      "pilot-work-order-service.js",
      "pilot-agent-runner.js",
    ]),
    allowedTools: Object.freeze(["Lesen (read-only Workspace-Zugriff)", "Strukturierte Textantwort über Codex"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "Diff erzeugen oder anwenden",
      "externe Netzwerkanfragen außer dem einen freigegebenen Codex-Roundtrip",
      "Health-Projekt lesen oder verändern",
      "Secrets oder Zugangsdaten ausgeben",
      "neue Abhängigkeiten installieren",
      "weitere, nicht genannte Dateien lesen",
      "Projektmanager-Freigabe erteilen",
    ]),
    expectedResultFormat:
      "Kurzbefund, drei konkrete Beobachtungen, zwei konkrete Risiken oder Grenzen, eine priorisierte " +
      "Empfehlung, verwendete Grundlagen, offene Punkte – strukturierter Text.",
  }),
  // Phase 8 – Schritt 2 (Dokumentations-Agent). Eigenständiges Preset, KEINE
  // Variante des obigen Recherche-Presets: andere Aufgabe, anderer
  // erwarteter Ergebnisrahmen, andere Agentenidentität. agentKeyOverride
  // "documentation-agent" ist die im kanonischen 25-Agenten-Register
  // bereits bestehende, fachlich passendste Identität ("Wissens-/
  // Archiv-Agent", AGENTS.md Nr. 11, ROLE_NAME_MAPPING["Wissens-/Archiv-Agent"]
  // -> "documentation-agent") – keine neue Agentenidentität. chainManaged:
  // true, siehe Kommentar oben. Wird ausschließlich über
  // pilot-agent-execution-chain-service.js gestartet (niemals direkt über die
  // bereits bestehende start-agent-execution-Einzelauftragsroute), weil nur
  // die Chain-Service-Schicht das tatsächliche, geprüfte Vorgängerergebnis
  // (predecessorContext) beschafft und übergibt.
  "codex-document-chain-result": Object.freeze({
    presetId: "codex-document-chain-result",
    runnerKind: RUNNER_KINDS.CODEX,
    pilotRole: "DOKUMENTATION",
    agentKeyOverride: "documentation-agent",
    chainManaged: true,
    title: "Kettenschritt 2 – Rechercheergebnis in ein prüfbares Dokumentationsresultat überführen",
    instructions:
      "Überführe das dir als Vorgängerergebnis vorgelegte Rechercheergebnis in ein fachlich brauchbares, eng " +
      "strukturiertes Dokumentationsresultat. Verwende ausschließlich die im Prompt vorgegebene " +
      "Fünf-Abschnittsstruktur, priorisiere entscheidungsrelevante Befunde und lasse nachrangige Details weg. " +
      "Erteile keine Projektmanager-Freigabe.",
    allowedFiles: Object.freeze([
      "pilot-agent-execution-chain-service.js",
      "pilot-work-order-service.js",
      "auth-db-migrations.js",
    ]),
    allowedTools: Object.freeze(["Lesen (read-only Workspace-Zugriff)", "Strukturierte Textantwort über Codex"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "Diff erzeugen oder anwenden",
      "externe Netzwerkanfragen außer dem einen freigegebenen Codex-Roundtrip",
      "Health-Projekt lesen oder verändern",
      "Secrets oder Zugangsdaten ausgeben",
      "neue Abhängigkeiten installieren",
      "weitere, nicht genannte Dateien lesen",
      "Projektmanager-Freigabe erteilen",
    ]),
    expectedResultFormat:
      "Genau fünf Abschnitte in fixer Reihenfolge: (1) Kurzergebnis, (2) Bestätigte Kernbefunde, " +
      "(3) Offene Punkte und Grenzen, (4) Priorisierte Empfehlungen mit Maßnahme/Nutzen/Priorität, " +
      "(5) Herkunftshinweis.",
  }),
  // Phase 8 – Schritt 3 (Projektmanager-/PM-Bewertung). agentKeyOverride
  // "orchestrator-agent" ist die im kanonischen Register bereits bestehende
  // Identität für den Projektmanager-Agenten (ROLE_NAME_MAPPING[
  // "Projektmanager-Agent"] -> "orchestrator-agent") – keine neue
  // Agentenidentität, keine Registry-Änderung. Bewusst ein ECHTER,
  // getrennter CODEX_READ_ONLY-Lauf (siehe Abschlussbericht Abschnitt 2 zur
  // Architekturentscheidung) statt einer bloßen Erweiterung des bereits
  // bestehenden, rein regelbasierten PM-Filters
  // (pilot-work-order-service.js#runProjectManagerFilter) – dieser bleibt
  // unverändert und läuft für die reguläre Rollenübergabe weiterhin
  // ausschließlich regelbasiert. chainManaged: true, siehe Kommentar oben –
  // die PM-Bewertung erteilt dadurch strukturell keine automatische
  // Freigabe und löst keinen automatischen Statuswechsel des zugrunde
  // liegenden Pilotauftrags aus.
  "codex-pm-evaluate-chain": Object.freeze({
    presetId: "codex-pm-evaluate-chain",
    runnerKind: RUNNER_KINDS.CODEX,
    pilotRole: "PROJEKTMANAGER",
    agentKeyOverride: "orchestrator-agent",
    chainManaged: true,
    title: "Kettenschritt 3 – Recherche- und Dokumentationsergebnis bewerten",
    instructions:
      "Bewerte die Ergebnisse der vorangegangenen zwei Kettenschritte (Recherche und Dokumentation) auf " +
      "inhaltliche Konsistenz, belegte versus abgeleitete Aussagen, offene Risiken und Entscheidungsreife für " +
      "Jamal. Erteile selbst keine automatische Freigabe.",
    allowedFiles: Object.freeze([
      "pilot-agent-execution-chain-service.js",
      "pilot-work-order-service.js",
      "auth-db-migrations.js",
    ]),
    allowedTools: Object.freeze(["Lesen (read-only Workspace-Zugriff)", "Strukturierte Textantwort über Codex"]),
    forbiddenActions: Object.freeze([
      "Dateien ändern",
      "Git-Befehle mit Schreibwirkung",
      "Commit",
      "Push",
      "Deployment",
      "Diff erzeugen oder anwenden",
      "externe Netzwerkanfragen außer dem einen freigegebenen Codex-Roundtrip",
      "Health-Projekt lesen oder verändern",
      "Secrets oder Zugangsdaten ausgeben",
      "neue Abhängigkeiten installieren",
      "weitere, nicht genannte Dateien lesen",
      "automatische Freigabe erteilen",
    ]),
    expectedResultFormat:
      "Gesamturteil, geprüfte Vorgängerläufe, Konsistenzprüfung, Qualitätsmängel, Risiken und Grenzen, " +
      "Empfehlung, benötigte Entscheidung durch Jamal – strukturierter Text.",
  }),
});

// V7.9.8 ("Ergebnisbudget für Recherche- und Projektmanager-Stufe technisch
// erzwingen"): welcher Ergebnis-Stufenvertrag gilt für welches Preset?
//
// Bewusst eine Zuordnung über die PRESET-ID und nicht über pilotRole/agentKey:
// die Pilotrolle RECHERCHE_ANALYSE mit agentKey "review-agent" wird
// zusätzlich vom bestehenden Phase-7-Einzellauf-Preset
// "codex-analyze-pilot-structure" verwendet (siehe oben). Eine Ableitung aus
// der Rolle hätte diesen bestehenden Einzellauf ungefragt mitverändert –
// er bleibt so byteidentisch. Der Dokumentationsvertrag steht bewusst NICHT
// in dieser Tabelle: er wird im Runner unverändert über agentKey/pilotRole
// erkannt (V7.8.1) und darf durch diese Erweiterung nicht abgeschwächt
// werden.
const RESULT_CONTRACT_STAGE_BY_PRESET_ID = Object.freeze({
  "codex-chain-research-analysis": codexRunner.RESULT_CONTRACT_STAGES.RESEARCH,
  "codex-pm-evaluate-chain": codexRunner.RESULT_CONTRACT_STAGES.PROJECT_MANAGER,
});

function resultContractStageForPreset(preset) {
  return RESULT_CONTRACT_STAGE_BY_PRESET_ID[preset && preset.presetId] || undefined;
}

// V7.8.0: die Dateiauswahl für die Drei-Agenten-Kette wird EINMAL zentral
// definiert und anschließend für alle drei Stufen wiederverwendet. Keine
// automatische Dateierweiterung durch ein Modell.
//
// V7.9.9 ("auftragsbezogene Dateiauswahl auf die Nutzerperspektive
// erweitern"): die Liste wurde AUSSCHLIESSLICH ADDITIV um drei Einträge
// erweitert (pilot-work-order-ui.js, V1_BETRIEBSHANDBUCH.md,
// pilot-work-order-routes.js; pilot-work-order-service.js war bereits
// enthalten). Bewusst additiv und bewusst KEINE zweite, auftragsbezogene
// Auswahlgruppe im Datenmodell:
//   - Entfernen eines bestehenden Eintrags würde jede Altkette unlesbar
//     machen, die diesen Eintrag gespeichert hat – getChainView/startStep
//     validieren die GESPEICHERTE Auswahl erneut gegen genau diese Liste
//     (pilot-agent-execution-chain-service.js). Additiv bleibt daher jede
//     bestehende Kette unverändert gültig.
//   - Eine echte Auswahlgruppe je Auftrag bräuchte ein zusätzliches,
//     persistiertes Gruppenfeld an Kette und Route sowie eine Migration –
//     das ist für V7.9.9 nicht der kleinste sichere Weg (siehe
//     MIGRATION_PLAN.md, offener Folgepunkt).
//
// Die Liste bleibt eine geschlossene, serverseitige Allowlist: relative
// Repositorypfade, keine Wildcards, kein Verzeichnis, keine freie
// Pfadeingabe, kein clientseitig bestimmter Pfad.
const CHAIN_SELECTABLE_FILES = Object.freeze([
  "pilot-agent-execution-chain-service.js",
  "pilot-work-order-service.js",
  "pilot-agent-runner.js",
  "auth-db-migrations.js",
  "pilot-work-order-ui.js",
  "V1_BETRIEBSHANDBUCH.md",
  "pilot-work-order-routes.js",
]);

// V7.9.9: deterministische, NICHT durch ein Sprachmodell bestimmte
// Standardauswahl für einen auf die Nutzerperspektive gerichteten
// Praxisauftrag ("Bewerte die Zentrale aus Sicht eines täglichen
// Nutzers"): sichtbare Bedienung (Cockpit-UI), versprochener
// Betriebsablauf (Betriebshandbuch), Auftrags-/Statuslogik dahinter
// (Service) und die bedienbare Schnittstelle (Routen).
//
// Diese Konstante ist AUSSCHLIESSLICH eine Anzeige-/Vorauswahlempfehlung
// für das Cockpit. Sie erweitert KEINE Rechte: jede tatsächlich
// übermittelte Auswahl läuft unverändert durch
// resolveChainSelectedFiles gegen CHAIN_SELECTABLE_FILES. Sie löst
// weder eine Kettenvorbereitung noch eine Freigabe oder Ausführung aus.
const CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES = Object.freeze([
  "pilot-work-order-ui.js",
  "V1_BETRIEBSHANDBUCH.md",
  "pilot-work-order-service.js",
  "pilot-work-order-routes.js",
]);

// Strukturelle Zusicherung beim Laden des Moduls: die empfohlene
// Standardauswahl darf niemals einen Pfad enthalten, der nicht in der
// geschlossenen Allowlist steht. Ein Tippfehler oder eine spätere
// Änderung fällt dadurch sofort beim Serverstart auf und nicht erst im
// Praxislauf.
CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.forEach((relativePath) => {
  if (!CHAIN_SELECTABLE_FILES.includes(relativePath)) {
    throw new Error(
      `CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES enthält den nicht in CHAIN_SELECTABLE_FILES freigegebenen Pfad "${relativePath}".`,
    );
  }
});

function resolveChainSelectedFiles(input) {
  if (input === undefined || input === null) {
    return CHAIN_SELECTABLE_FILES.slice();
  }
  if (!Array.isArray(input)) {
    throw badRequest("selectedFiles muss ein Array mit relativen Dateipfaden sein.");
  }
  const normalized = Array.from(
    new Set(
      input
        .map((entry) => String(entry === null || entry === undefined ? "" : entry).trim())
        .filter(Boolean),
    ),
  );
  if (normalized.length === 0) {
    throw badRequest("selectedFiles darf nicht leer sein.");
  }
  const invalid = normalized.filter((entry) => !CHAIN_SELECTABLE_FILES.includes(entry));
  if (invalid.length > 0) {
    throw badRequest("selectedFiles enthält nicht erlaubte Dateien.", {
      invalidFiles: invalid,
      allowedFiles: CHAIN_SELECTABLE_FILES,
    });
  }
  return normalized;
}

function requireKnownPreset(presetId) {
  const preset = PILOT_AGENT_TASK_PRESETS[presetId];
  if (!preset) {
    throw badRequest("Unbekannte oder fehlende Agentenauftrags-Preset-ID.");
  }
  return preset;
}

// ---------------------------------------------------------------------------
// V7.7.0 Korrektur 2 ("chainManaged-Presets nur über Chain-Service
// erlauben", unabhängiges Opus-Review, Blocker 2): ein chainManaged-Preset
// (siehe PILOT_AGENT_TASK_PRESETS oben) darf NIEMALS über die normale
// Phase-7-Einzellauf-API/-Route oder einen normalen direkten Serviceaufruf
// gestartet oder freigegeben werden – ausschließlich
// pilot-agent-execution-chain-service.js darf das (mit bereits geprüftem
// chainId/Vorgänger-/Digest-/Ketten-Kontext).
//
// CHAIN_INTERNAL_BRIDGE_CAPABILITY ist ein modulprivates, NICHT
// exportiertes Symbol. Ein Symbol lässt sich (anders als ein Boolean/String)
// nicht aus JSON rekonstruieren und nicht über ein API-Feld setzen – ein
// Aufrufer außerhalb dieser Datei kann diesen exakten Wert weder erraten
// noch nachbauen (`Symbol("gleicher Text")` erzeugt ein ANDERES, per `===`
// niemals gleiches Symbol). Die einzigen beiden Stellen, die dieses Symbol
// tatsächlich mitgeben, sind requestCodexRunApprovalForChainInternal/
// startAgentExecutionRunForChainInternal unten – beide ausschließlich für
// pilot-agent-execution-chain-service.js bestimmt (siehe dortige
// Verwendung). Das Symbol wird niemals in Audit-Metadaten oder einer
// HTTP-Antwort ausgegeben.
const CHAIN_INTERNAL_BRIDGE_CAPABILITY = Symbol("pilot-agent-execution-chain-internal-bridge");

function isChainInternalBridgeCall(options) {
  return Boolean(options) && options.__chainInternalBridge === CHAIN_INTERNAL_BRIDGE_CAPABILITY;
}

function resolveAllowedFilesForRun(preset, options = {}) {
  if (options.allowedFilesOverride === undefined) {
    return preset.allowedFiles.slice();
  }
  if (!isChainInternalBridgeCall(options)) {
    throw badRequest("allowedFilesOverride ist ausschließlich für den internen Kettenpfad zulässig.");
  }
  return resolveChainSelectedFiles(options.allowedFilesOverride);
}

function assertChainManagedPresetHasInternalBridge(preset, options) {
  if (preset.chainManaged && !isChainInternalBridgeCall(options)) {
    throw badRequest(
      "Dieses Preset wird ausschließlich durch die Ketten-Serviceschicht verwaltet (chainManaged) und kann nicht " +
        "über die normale Phase-7-Einzellauf-API oder einen direkten Serviceaufruf gestartet oder freigegeben werden.",
    );
  }
}

// Korrekturlauf vor Commit (Korrektur 4, "Agentenidentität ehrlich
// darstellen"): agentKey/pilotRole sind derzeit REINE Laufmetadaten. Sie
// legen fest, WER (welcher bereits bestehende kanonische Agent) fachlich
// für die Rolle verantwortlich gezeichnet ist und WOHIN die Rollenübergabe
// nach einem Erfolg geht – der deterministische Runner (pilot-agent-runner.js)
// selbst liest diese Werte nirgends und verhält sich für jede Rolle
// IDENTISCH: exakt dieselben Dateikennzahlen (Byte-/Zeilenzahl, SHA-256,
// Funktions-/Exportzahl) unabhängig davon, welcher Agent/welche Rolle den
// Lauf gestartet hat. Die Rolle beeinflusst das Runner-Ergebnis also NICHT.
// Echte, rollenspezifische Semantik (z. B. unterschiedliche Analyseschritte
// je nach Agent) folgt erst mit einer künftigen KI-/Modellanbindung und ist
// NICHT Teil dieses Korrekturlaufs. Die bestehende Zuordnung
// RECHERCHE_ANALYSE → product-agent (aus Phase 1, pilot-work-order-service.js)
// bleibt unverändert; keine neue Agentenrolle, keine Registry-Änderung.
function resolveAgentForRole(pilotRole) {
  const agent = pilotWorkOrderService.PILOT_TEAM.find((entry) => entry.pilotRole === pilotRole);
  if (!agent) {
    throw new Error(`pilot-agent-execution-service: unbekannte Pilotrolle "${pilotRole}".`);
  }
  return agent;
}

// Phase 7 (Schwerpunkt 4, "Agentenidentität gegen das bestehende
// 25-Agenten-Register prüfen"): löst die für einen Lauf tatsächlich
// verantwortlich gezeichnete Agentenidentität auf. Für den lokalen
// deterministischen Runner unverändert die bestehende
// RECHERCHE_ANALYSE -> product-agent-Zuordnung (resolveAgentForRole). Für
// ein Preset mit explizitem agentKeyOverride (ausschließlich das
// Codex-Preset) wird STATTDESSEN diese Identität verwendet – ausschließlich
// wenn sie tatsächlich im kanonischen 25-Agenten-Register existiert. Eine
// unbekannte agentKeyOverride-ID wäre ein Programmierfehler im Preset
// selbst (nicht behebbar durch einen Aufrufer) und wirft deshalb hart.
function resolveAgentForPreset(preset) {
  if (preset.agentKeyOverride) {
    if (!agentRegistry.hasAgentId(preset.agentKeyOverride)) {
      throw new Error(
        `pilot-agent-execution-service: agentKeyOverride "${preset.agentKeyOverride}" ist keine bekannte Agenten-ID im kanonischen Register.`,
      );
    }
    const entry = agentRegistry.getAgentById(preset.agentKeyOverride);
    return { agentKey: entry.id, technicalName: entry.name, technicalRole: entry.role };
  }
  return resolveAgentForRole(preset.pilotRole);
}

function pilotRoleLabelFor(pilotRole) {
  const agent = pilotWorkOrderService.PILOT_TEAM.find((entry) => entry.pilotRole === pilotRole);
  return (agent && agent.pilotRoleLabel) || pilotRole;
}

// ---------------------------------------------------------------------------
// Phase 7 (Schwerpunkt 6, "Netzwerk- und Freigabeentscheidung") –
// One-Time-Freigabe für genau einen Codex-Lauf.
//
// Bewusst dasselbe, bereits bestehende und geprüfte Muster wie
// execution-bridge.js#mintToken/consumeToken (RAM-only, kurzlebig, einmalig,
// an konkrete IDs gebunden) – kein neues Konzept, keine dauerhafte globale
// Freigabe, kein Speichern auf Platte, kein Protokollieren des Tokenwerts
// selbst (nur das AUSSTELLEN wird auditiert, siehe
// PILOT_AGENT_EXECUTION_CODEX_APPROVAL_REQUESTED).
//
// Korrekturlauf vor dem echten Referenzlauf (unabhängiges Review,
// Kategorie B, Korrekturen 4/5/6): der Token ist an pilotOrderId, presetId,
// runnerKind, den AUSSTELLENDEN Nutzer (actorUserId) UND die zum
// Ausstellungszeitpunkt tatsächlich gelesene Auftragsrevision gebunden.
//   - Nutzerbindung (Korrektur 4): ein Token von Nutzer A kann durch
//     Nutzer B niemals verbraucht werden, selbst mit identischen OWNER-
//     Rechten. Ein Fehlversuch mit falschem Nutzer LÖSCHT den Token NICHT
//     (siehe pilotOrderId/presetId-Bindung unten – ein fremder Fehlversuch
//     darf den echten, noch gültigen Token des Ausstellers nicht
//     vernichten können).
//   - Revisionsbindung (Korrektur 5): beim Verbrauch wird die tatsächliche,
//     serverseitig frisch gelesene AKTUELLE Auftragsrevision verglichen,
//     NIEMALS ein vom Client zusätzlich gesendetes `expectedRevision` (das
//     bleibt ausschließlich für die bereits bestehende, allgemeine
//     Optimistic-Concurrency-Prüfung in startAgentExecutionRun zuständig).
//     Bei jeder Abweichung wird der Token kontrolliert VERBRAUCHT/entfernt,
//     damit er nicht später erneut eingesetzt werden kann (bewusst anders
//     als die übrigen Bindungsfehler – eine veraltete Revision ist ein
//     Frische-Problem, kein reiner Fremdzugriffsversuch: auch der
//     rechtmäßige Aussteller muss danach eine neue, bewusste Freigabe für
//     den aktuellen Auftragsstand anfordern).
//   - Zeitquelle (Korrektur 6): `nowProvider` ist ausschließlich für Tests
//     injizierbar (liefert Millisekunden wie Date.now()); produktiv bleibt
//     stets Date.now(). Kein globaler Testzustand, keine produktive
//     Request-Feld-Uhr.
// ---------------------------------------------------------------------------
const CODEX_APPROVAL_TOKEN_TTL_MS = 5 * 60 * 1000;
const CODEX_APPROVAL_TOKENS = new Map();
const DEFAULT_CODEX_APPROVAL_NOW_PROVIDER = () => Date.now();

function requestCodexRunApproval(db, options = {}) {
  const presetId = String(options.presetId || "").trim();
  const preset = requireKnownPreset(presetId);
  assertChainManagedPresetHasInternalBridge(preset, options);
  if (preset.runnerKind !== RUNNER_KINDS.CODEX) {
    throw badRequest("Eine Freigabeanforderung ist ausschließlich für ein Codex-Preset möglich.");
  }
  const pilotOrderId = String(options.pilotOrderId || pilotWorkOrderService.CANONICAL_PILOT_ORDER_ID).trim();
  const orderRow = authDb.getPilotWorkOrderById(db, pilotOrderId);
  if (!orderRow) {
    throw notFound(`Der Pilotauftrag "${pilotOrderId}" wurde nicht gefunden.`, { pilotOrderId });
  }
  const now = options.now || new Date();
  const nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : DEFAULT_CODEX_APPROVAL_NOW_PROVIDER;
  const issuedAtMs = nowProvider();
  const actorUserId = options.actorUserId ?? null;
  const token = crypto.randomBytes(24).toString("hex");
  CODEX_APPROVAL_TOKENS.set(token, {
    pilotOrderId,
    presetId,
    runnerKind: preset.runnerKind,
    actorUserId,
    // Korrektur 5: die tatsächliche, serverseitig zum Ausstellungszeitpunkt
    // gelesene Revision – niemals ein vom Client behaupteter Wert.
    boundRevision: orderRow.revision,
    createdAt: issuedAtMs,
    expiresAt: issuedAtMs + CODEX_APPROVAL_TOKEN_TTL_MS,
    consumed: false,
  });
  // V7.7.0 Korrektur 2 ("Audit-Wahrheit"): ist dieser Aufruf die interne,
  // automatische Weitergabe einer bereits durch Jamal bewusst erteilten
  // KETTEN-Freigabe (siehe pilot-agent-execution-chain-service.js#startStep),
  // wird das Audit-Ereignis zusätzlich mit `approvalSource:
  // CHAIN_INTERNAL_BRIDGE` markiert – NIEMALS als zweite, eigenständige
  // Jamal-Freigabe. Für jeden normalen (nicht chainManaged) Einzellauf
  // bleibt das Metadatenobjekt exakt wie vor diesem Korrekturlauf.
  authAudit.recordAuditEvent(db, {
    eventType: "PILOT_AGENT_EXECUTION_CODEX_APPROVAL_REQUESTED",
    result: "OK",
    actorUserId,
    tenantId: null,
    timestamp: nowIso(now),
    // Niemals der Tokenwert selbst (siehe Kopfkommentar) – ausschließlich
    // bereits unkritische Bindungsmetadaten.
    metadata: {
      pilotOrderId,
      presetId,
      ...(isChainInternalBridgeCall(options) ? { approvalSource: "CHAIN_INTERNAL_BRIDGE" } : {}),
    },
  });
  return { approvalToken: token, expiresInMs: CODEX_APPROVAL_TOKEN_TTL_MS };
}

function consumeCodexRunApproval(token, expectedBinding = {}, options = {}) {
  const nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : DEFAULT_CODEX_APPROVAL_NOW_PROVIDER;
  if (typeof token !== "string" || !token) {
    return { ok: false, reason: "TOKEN_MISSING" };
  }
  const record = CODEX_APPROVAL_TOKENS.get(token);
  if (!record) {
    return { ok: false, reason: "TOKEN_UNKNOWN" };
  }
  if (record.consumed) {
    CODEX_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_ALREADY_USED" };
  }
  if (nowProvider() > record.expiresAt) {
    CODEX_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_EXPIRED" };
  }
  if (expectedBinding.pilotOrderId !== undefined && record.pilotOrderId !== expectedBinding.pilotOrderId) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.presetId !== undefined && record.presetId !== expectedBinding.presetId) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  if (expectedBinding.runnerKind !== undefined && record.runnerKind !== expectedBinding.runnerKind) {
    return { ok: false, reason: "TOKEN_BINDING_MISMATCH" };
  }
  // Korrektur 4: Nutzerbindung. Bewusst KEIN Löschen bei Fehlschlag (siehe
  // Kopfkommentar) – ein Fehlversuch mit falschem Nutzer darf den echten,
  // noch gültigen Token des Ausstellers nicht vernichten.
  if ((expectedBinding.actorUserId ?? null) !== record.actorUserId) {
    return { ok: false, reason: "TOKEN_USER_MISMATCH" };
  }
  // Korrektur 5: Revisionsbindung. Bei Abweichung wird der Token bewusst
  // sofort verbraucht/entfernt (siehe Kopfkommentar) – anders als bei den
  // übrigen Bindungsfehlern oben.
  if (expectedBinding.currentRevision !== undefined && record.boundRevision !== expectedBinding.currentRevision) {
    CODEX_APPROVAL_TOKENS.delete(token);
    return { ok: false, reason: "TOKEN_REVISION_MISMATCH" };
  }
  record.consumed = true;
  CODEX_APPROVAL_TOKENS.delete(token);
  return { ok: true };
}

function clearCodexApprovalTokensForTests() {
  CODEX_APPROVAL_TOKENS.clear();
}

// Nur für Tests/UI-Anzeige: liest ausschließlich lesende CLI-Aufrufe
// (--version, login status) – niemals einen Login-Vorgang startend, niemals
// eine Freigabe. Siehe execution-codex-adapter.js#detectCodexAvailability.
function getCodexAvailabilitySummary(options = {}) {
  const availability = codexAdapter.detectCodexAvailability(options);
  return {
    available: Boolean(availability.available),
    authenticated: Boolean(availability.authenticated),
    version: availability.version || null,
    authLabel: availability.authLabel || null,
    reason: availability.reason || null,
  };
}

function isUniqueConstraintViolation(error) {
  const code = String((error && error.code) || "");
  const message = String((error && error.message) || "");
  return code.startsWith("SQLITE_CONSTRAINT") || /UNIQUE constraint failed/i.test(message);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function rowToAgentExecutionRunView(row) {
  if (!row) return null;
  let resultSummary = null;
  try {
    resultSummary = row.resultSummaryJson ? JSON.parse(row.resultSummaryJson) : null;
  } catch (_error) {
    resultSummary = null;
  }
  return {
    id: row.id,
    pilotOrderId: row.pilotOrderId,
    pilotOrderRevisionAtStart: row.pilotOrderRevisionAtStart,
    presetId: row.presetId,
    pilotRole: row.pilotRole,
    agentKey: row.agentKey,
    taskTitle: row.taskTitle,
    taskInstructions: row.taskInstructions,
    allowedFiles: JSON.parse(row.allowedFilesJson),
    allowedTools: JSON.parse(row.allowedToolsJson),
    forbiddenActions: JSON.parse(row.forbiddenActionsJson),
    expectedResultFormat: row.expectedResultFormat,
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
    runnerId: row.runnerId,
    runnerLabel: row.runnerLabel,
    status: row.status,
    resultSummary,
    resultRawText: row.resultRawText,
    errorMessage: row.errorMessage,
    // Korrekturlauf vor Commit (Migration 21): Stufe B (fachliche
    // Rollenübergabe) ist strikt getrennt vom Runstatus. Ein
    // handoffStatus === "FAILED" bedeutet AUSDRÜCKLICH keinen technischen
    // Runner-Fehler – status bleibt in diesem Fall SUCCEEDED, das Ergebnis
    // (resultRawText/resultSummary) bleibt vollständig gültig und lesbar.
    handoffStatus: row.handoffStatus || "PENDING",
    handoffErrorMessage: row.handoffErrorMessage || null,
    handoffCompletedAt: row.handoffCompletedAt || null,
    // Phase 7 – Runner-/KI-Metadaten (Migration 22). Für jeden Lauf, der VOR
    // Phase 7 angelegt wurde bzw. über den unveränderten lokalen
    // deterministischen Pfad läuft, liefern die Spalten-Defaults bereits die
    // ehrlichen Phase-6-Werte (requestedRunnerKind/actualRunnerKind =
    // LOCAL_DETERMINISTIC_READ_ONLY, aiExecuted = false, approvalStatus =
    // NOT_REQUIRED, networkRequired/externalAiRequired = false) – siehe
    // auth-db-migrations.js Migration 22 ADD COLUMN ... DEFAULT.
    requestedRunnerKind: row.requestedRunnerKind || RUNNER_KINDS.LOCAL,
    actualRunnerKind: row.actualRunnerKind || RUNNER_KINDS.LOCAL,
    runnerVersion: row.runnerVersion || null,
    modelLabel: row.modelLabel || null,
    aiExecuted: Boolean(row.aiExecuted),
    fallbackUsed: Boolean(row.fallbackUsed),
    fallbackReason: row.fallbackReason || null,
    networkRequired: Boolean(row.networkRequired),
    externalAiRequired: Boolean(row.externalAiRequired),
    approvalStatus: row.approvalStatus || "NOT_REQUIRED",
    workspaceId: row.workspaceId || null,
    timedOut: Boolean(row.timedOut),
    cancelledRun: Boolean(row.cancelledRun),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}

function listAgentExecutionRunsForOrder(db, pilotOrderId) {
  return authDb.listPilotAgentExecutionRunsForOrder(db, pilotOrderId).map(rowToAgentExecutionRunView);
}

function getAgentExecutionRunById(db, pilotOrderId, runId) {
  const row = authDb.getPilotAgentExecutionRunById(db, runId);
  if (!row || row.pilotOrderId !== pilotOrderId) {
    throw notFound(`Der Agentenlauf "${runId}" wurde für diesen Pilotauftrag nicht gefunden.`, {
      pilotOrderId,
    });
  }
  return rowToAgentExecutionRunView(row);
}

// ---------------------------------------------------------------------------
// Start eines technischen Agentenlaufs. Runner-Auswahl (Phase 7) ist
// bewusst 1:1 an das Preset gekoppelt (preset.runnerKind), nicht ein
// zusätzlicher, frei kombinierbarer Parameter: jedes Preset legt bereits
// abschließend fest, welche Dateien/Werkzeuge/Grenzen gelten UND für welchen
// Runner es geschrieben ist (z. B. hat nur das Codex-Preset einen
// agentKeyOverride und die für einen echten Modellaufruf geeigneten
// allowedFiles). Eine Entkopplung würde erlauben, ein für den lokalen
// Runner geschriebenes Preset versehentlich mit dem Codex-Runner zu
// kombinieren (oder umgekehrt) – ausdrücklich nicht gewünscht.
async function startAgentExecutionRun(db, options = {}) {
  const presetId = String(options.presetId || "").trim();
  const preset = requireKnownPreset(presetId);
  assertChainManagedPresetHasInternalBridge(preset, options);
  const agent = resolveAgentForPreset(preset);
  const isCodexRun = preset.runnerKind === RUNNER_KINDS.CODEX;

  const pilotOrderId = String(options.pilotOrderId || pilotWorkOrderService.CANONICAL_PILOT_ORDER_ID).trim();
  const orderRow = authDb.getPilotWorkOrderById(db, pilotOrderId);
  if (!orderRow) {
    throw notFound(`Der Pilotauftrag "${pilotOrderId}" wurde nicht gefunden.`, { pilotOrderId });
  }
  if (orderRow.status !== "IN_EXECUTION") {
    throw conflict(
      `Ein Agentenlauf ist nur möglich, während der Pilotauftrag in Ausführung ist (aktuell ${orderRow.status}).`,
      { pilotOrderId, currentStatus: orderRow.status },
    );
  }
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== null &&
    orderRow.revision !== options.expectedRevision
  ) {
    throw conflict(
      `Der Pilotauftrag "${pilotOrderId}" hat sich seit dem zuletzt gelesenen Zustand geändert ` +
        `(erwartete Revision ${options.expectedRevision}, aktuell ${orderRow.revision}). ` +
        "Bitte den aktuellen Zustand erneut laden und die Aktion erneut auslösen.",
      {
        pilotOrderId,
        expectedRevision: options.expectedRevision,
        currentRevision: orderRow.revision,
        currentStatus: orderRow.status,
      },
    );
  }

  const allowedFilesForRun = resolveAllowedFilesForRun(preset, options);
  const mandateOrderRevisionForRun =
    options.mandate && Number.isInteger(options.mandate.orderRevision) && options.mandate.orderRevision >= 0
      ? options.mandate.orderRevision
      : null;

  const now = options.now || new Date();

  // Phase 7 (Schwerpunkt 6/10): "fehlende Authentifizierung/Verfügbarkeit/
  // Freigabe blockiert VOR dem Codex-Aufruf" – bewusst VOR jeder
  // Zeilenanlage. Ein derart blockierter Versuch erzeugt ABSICHTLICH KEINEN
  // Agentenlaufdatensatz (kein RUNNING/FAILED-Eintrag): es wurde technisch
  // nichts "versucht", sondern eine reine Vorbedingung war nicht erfüllt.
  // Das bleibt vollständig auditierbar über
  // PILOT_AGENT_EXECUTION_CODEX_START_BLOCKED. Niemals eine automatische
  // Freigabe, niemals ein automatischer Rückfall auf den lokalen Runner.
  let codexAvailability = null;
  if (isCodexRun) {
    codexAvailability = codexAdapter.detectCodexAvailability(options.codexAvailabilityOptions);
    const blockAndThrow = (reasonCode, message) => {
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_AGENT_EXECUTION_CODEX_START_BLOCKED",
        // "DENIED" statt eines eigenen "BLOCKED"-Ergebniswerts: auth-audit.js
        // RESULTS/auth-db-migrations.js AUDIT_RESULT_VALUES kennen
        // ausschließlich OK/DENIED/ERROR (siehe bereits bestehende Verwendung
        // in pilot-work-order-service.js für andere Ablehnungsfälle) – der
        // Ereignistyp selbst (PILOT_AGENT_EXECUTION_CODEX_START_BLOCKED)
        // macht die eigentliche Bedeutung "vor dem Codex-Aufruf blockiert"
        // bereits eindeutig.
        result: "DENIED",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId, presetId: preset.presetId, reasonCode },
      });
      throw conflict(message, { pilotOrderId });
    };
    if (!codexAvailability.available) {
      blockAndThrow(
        "CODEX_NOT_AVAILABLE",
        "Codex ist auf diesem System nicht verfügbar oder nicht installiert. Kein Codex-Lauf möglich, " +
          "kein automatischer Rückfall auf den lokalen Runner.",
      );
    }
    if (!codexAvailability.authenticated) {
      blockAndThrow(
        "CODEX_NOT_AUTHENTICATED",
        "Codex ist auf diesem System nicht authentifiziert. Kein Codex-Lauf möglich, " +
          "kein automatischer Rückfall auf den lokalen Runner.",
      );
    }
    // Korrektur 4/5 (unabhängiges Review, Kategorie B): Nutzer- und
    // Revisionsbindung werden HIER mit serverseitig frisch gelesenen Werten
    // geprüft (options.actorUserId aus dem Auth-Kontext, orderRow.revision
    // aus der soeben gelesenen Zeile) – niemals mit einem vom Client
    // behaupteten Wert. Ein optional vom Client zusätzlich gesendetes
    // `expectedRevision` (siehe Optimistic-Concurrency-Prüfung oben) ersetzt
    // diese eigenständige Tokenbindung an keiner Stelle.
    const approvalOutcome = consumeCodexRunApproval(
      options.approvalToken,
      {
        pilotOrderId,
        presetId: preset.presetId,
        runnerKind: preset.runnerKind,
        actorUserId: options.actorUserId ?? null,
        currentRevision: orderRow.revision,
      },
      { nowProvider: options.codexApprovalNowProvider },
    );
    if (!approvalOutcome.ok) {
      blockAndThrow(
        `MISSING_APPROVAL_${approvalOutcome.reason}`,
        "Für diesen Codex-Lauf liegt keine gültige, frische Freigabe vor (request-codex-run-approval zuerst " +
          "aufrufen; jeder Freigabe-Token ist kurzlebig und genau einmal verwendbar). Kein automatischer Codex-Lauf " +
          "ohne ausdrückliche Freigabe.",
      );
    }
  }

  const runId = `pilot-agent-run-${crypto.randomUUID()}`;
  const runnerId = isCodexRun ? codexRunner.RUNNER_ID : runner.RUNNER_ID;
  const runnerLabel = isCodexRun ? codexRunner.RUNNER_LABEL : runner.RUNNER_LABEL;

  // Anlage als RUNNING + Start-Audit in einer gemeinsamen Transaktion. Der
  // partielle Unique-Index (Migration 20) erzwingt dabei atomar: höchstens
  // ein RUNNING-Lauf pro Pilotauftrag gleichzeitig. Ein Verstoß wird als
  // eindeutiger Konflikt gemeldet, BEVOR der Runner überhaupt aufgerufen
  // wird (Schutz gegen Doppelklick und parallelen zweiten Start).
  let runRow;
  try {
    runRow = authDb.withAuthTransaction(db, () => {
      const inserted = authDb.insertPilotAgentExecutionRunAsRunning(db, {
        id: runId,
        pilotOrderId,
        pilotOrderRevisionAtStart: orderRow.revision,
        presetId: preset.presetId,
        pilotRole: preset.pilotRole,
        agentKey: agent.agentKey,
        taskTitle: preset.title,
        taskInstructions: preset.instructions,
        allowedFilesJson: JSON.stringify(allowedFilesForRun),
        allowedToolsJson: JSON.stringify(preset.allowedTools),
        forbiddenActionsJson: JSON.stringify(preset.forbiddenActions),
        expectedResultFormat: preset.expectedResultFormat,
        runnerId,
        runnerLabel,
        startedAt: nowIso(now),
        createdAt: nowIso(now),
        ...(mandateOrderRevisionForRun !== null ? { mandateOrderRevision: mandateOrderRevisionForRun } : {}),
        // Phase 7: nur für den Codex-Pfad tatsächlich befüllt (siehe
        // auth-db.js#insertPilotAgentExecutionRunAsRunning,
        // OPTIONAL_RUNNER_FIELDS). Der lokale Pfad lässt diese Felder
        // vollständig weg – die additiven Spalten-Defaults (Migration 22)
        // liefern dafür bereits die korrekten, ehrlichen Phase-6-Werte.
        ...(isCodexRun
          ? {
              requestedRunnerKind: RUNNER_KINDS.CODEX,
              actualRunnerKind: RUNNER_KINDS.CODEX,
              runnerVersion: codexAvailability.version || null,
              modelLabel: codexAvailability.authLabel ? `Codex (${codexAvailability.authLabel})` : "Codex",
              networkRequired: 1,
              externalAiRequired: 1,
              approvalStatus: "GRANTED",
            }
          : {}),
      });
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_AGENT_EXECUTION_RUN_STARTED",
        result: "OK",
        actorUserId: options.actorUserId ?? null,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: {
          pilotOrderId,
          pilotExecutionRunId: runId,
          pilotRole: preset.pilotRole,
          presetId: preset.presetId,
          runnerId,
          runnerKind: preset.runnerKind,
        },
      });
      return inserted;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw conflict(
        `Für den Pilotauftrag "${pilotOrderId}" läuft bereits ein aktiver Agentenlauf. ` +
          "Bitte den Abschluss abwarten oder den aktuellen Stand neu laden.",
        { pilotOrderId },
      );
    }
    throw error;
  }

  // Runner-Aufruf außerhalb jeder Transaktion (I/O-gebunden, kann bei
  // größeren Dateien bzw. einem echten Codex-Roundtrip messbar dauern) –
  // die RUNNING-Zeile ist zu diesem Zeitpunkt bereits sicher committet und
  // wirkt als Sperre.
  let execResult;
  try {
    if (isCodexRun) {
      execResult = await codexRunner.runPilotAgentCodexAnalysisTask({
        repoRoot: REPO_ROOT,
        allowedFiles: allowedFilesForRun,
        allowedTools: preset.allowedTools,
        forbiddenActions: preset.forbiddenActions,
        taskTitle: preset.title,
        taskInstructions: preset.instructions,
        expectedResultFormat: preset.expectedResultFormat,
        agentKey: agent.agentKey,
        agentDisplayName: agent.technicalName,
        agentRole: agent.technicalRole,
        pilotRole: preset.pilotRole,
        pilotRoleLabel: pilotRoleLabelFor(preset.pilotRole),
        executionRunId: runId,
        attemptTimeoutMs: options.attemptTimeoutMs,
        shouldAbort: options.shouldAbort,
        codexAvailability,
        // Phase 8: ausschließlich von pilot-agent-execution-chain-service.js
        // gesetzt – das tatsächliche, geprüfte Ergebnis des Vorgängerschritts
        // einer Kette (niemals eine freie Nutzereingabe). Für jeden
        // bestehenden Aufrufer (Phase 6/7, kein Kettenschritt) bleibt dies
        // undefined, wodurch buildAgentSpecificCodexPrompt exakt denselben
        // Prompt wie vor Phase 8 erzeugt (siehe pilot-agent-codex-runner.js).
        predecessorContext: options.predecessorContext,
        // V7.8.0: unveränderter Kernauftrag, der jeder Stufe explizit
        // vorangestellt wird (falls gesetzt ausschließlich aus der
        // Kettenorchestrierung, niemals frei aus dem Client-Body).
        mandate: options.mandate,
        // V7.9.8: verbindlicher Ergebnis-Stufenvertrag für Kettenschritt 1
        // bzw. 3 – ausschließlich serverseitig aus der Preset-ID abgeleitet
        // (siehe RESULT_CONTRACT_STAGE_BY_PRESET_ID oben), niemals aus einer
        // Client-Eingabe. Für jedes andere Preset bleibt der Wert undefined
        // und der Lauf verhält sich unverändert.
        resultContractStage: resultContractStageForPreset(preset),
        // Ausschließlich für Tests: injizierte Ersatzimplementierungen für
        // den echten Codex-Kindprozess/Dateisystemzugriff (siehe
        // pilot-agent-codex-runner.js/execution-codex-adapter.js). Im
        // Produktivbetrieb bleiben all diese Felder undefined, wodurch
        // ausschließlich die echten Node-/Codex-CLI-Implementierungen
        // verwendet werden.
        execFileImpl: options.codexExecFileImpl,
        codexAdapterImpl: options.codexAdapterImpl,
        workspaceModuleImpl: options.codexWorkspaceModuleImpl,
      });
    } else {
      execResult = await runner.runPilotAgentAnalysisTask({
        repoRoot: REPO_ROOT,
        allowedFiles: allowedFilesForRun,
        taskTitle: preset.title,
        taskInstructions: preset.instructions,
      });
    }
  } catch (error) {
    execResult = { ok: false, failed: true, errorMessage: String((error && error.message) || error) };
  }

  return finalizeAgentExecutionRun(db, {
    runId,
    pilotOrderId,
    preset,
    execResult,
    now,
    actorUserId: options.actorUserId ?? null,
    isCodexRun,
  });
}

// Korrekturlauf vor Commit (unabhängiges Opus-Review, "Ergebnis darf bei
// Handoff-Konflikt nicht verloren gehen"): der Abschluss eines Agentenlaufs
// ist jetzt strikt in zwei Stufen mit zwei getrennten Transaktionsgrenzen
// unterteilt:
//
//   Stufe A (persistFailedAgentExecutionRun / persistSucceededAgentExecutionRun):
//     ausschließlich der TECHNISCHE Runner-Abschluss – Runstatus
//     (SUCCEEDED/FAILED), resultRawText, resultSummaryJson, finishedAt und
//     das zugehörige Runner-Audit-Ereignis. Läuft in EINER eigenen
//     Transaktion. Ein erfolgreicher Abschluss dieser Stufe ist danach
//     DAUERHAFT und wird durch nichts, was in Stufe B passiert, jemals
//     zurückgerollt.
//
//   Stufe B (attemptHandoffForSucceededRun): ausschließlich die FACHLICHE
//     Rollenübergabe (submitHandoff inkl. Projektmanager-Filter) – nur
//     versucht, wenn Stufe A SUCCEEDED ergeben hat. Läuft in einer eigenen,
//     SPÄTEREN Transaktion (submitHandoff bringt seine eigene mit). Scheitert
//     Stufe B (z. B. weil sich der Pilotauftragsstatus während des Runs
//     geändert hat und submitHandoff daher ablehnt), bleibt der bereits in
//     Stufe A gespeicherte Runstatus SUCCEEDED unverändert; lediglich
//     handoffStatus/handoffErrorMessage/handoffCompletedAt (Migration 21)
//     dokumentieren den Handoff-Fehlschlag getrennt und nachvollziehbar.
//     Niemals ein automatischer Retry, niemals ein automatischer
//     Statuswechsel des Pilotauftrags.
//
// Vor diesem Korrekturlauf liefen beide Stufen in EINER gemeinsamen
// Transaktion: ein scheiterndes submitHandoff riss dabei auch das bereits
// technisch erfolgreich erzeugte Ergebnis mit in den Rollback und der Lauf
// wurde fälschlich als FAILED behandelt, obwohl der Runner tatsächlich
// erfolgreich war. Das ist mit dieser Trennung nicht mehr möglich.

// Stufe A, Fehlerfall: ein technischer Ausführungsfehler erzeugt
// AUSDRÜCKLICH keine Rollenübergabe (Stufe B entfällt vollständig).
// Phase 7, Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): die
// kleinste saubere Lösung für die Persistenz der sicheren Diagnosefelder
// (exitCode/signal/reasonCode/stderrSample/stdoutSample/runnerPhase) ist die
// bereits bestehende, bislang für fehlgeschlagene Läufe ungenutzte
// resultSummaryJson-Spalte (siehe auth-db-migrations.js Migration 20/
// updatePilotAgentExecutionRunTerminal, das dieses Feld bereits generisch für
// JEDEN Status persistiert, sowie rowToAgentExecutionRunView, das
// resultSummaryJson bereits für JEDEN Status als `resultSummary` zurückgibt).
// Keine neue Spalte, keine neue Migration, keine neue Tabelle nötig – ein
// bestehender fehlgeschlagener Lauf ohne diese Diagnose (resultSummaryJson
// bleibt NULL) bleibt dadurch unverändert lesbar (rowToAgentExecutionRunView
// liefert dafür weiterhin resultSummary: null).
const DIAGNOSTIC_NOTICE_TEXT = "Sichere technische Diagnose – möglicherweise gekürzt und redigiert.";

function buildFailedRunResultSummary(execResult) {
  const diagnostics = execResult && execResult.diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") return null;
  return {
    diagnostics: {
      reasonCode: diagnostics.reasonCode || null,
      runnerPhase: diagnostics.runnerPhase || null,
      exitCode: diagnostics.exitCode === undefined ? null : diagnostics.exitCode,
      signal: diagnostics.signal || null,
      stderrSample: diagnostics.stderrSample || null,
      stdoutSample: diagnostics.stdoutSample || null,
      timedOut: Boolean(diagnostics.timedOut),
      cancelled: Boolean(diagnostics.cancelled),
    },
    diagnosticNotice: DIAGNOSTIC_NOTICE_TEXT,
  };
}

function buildPromptMetadataPatch(execResult) {
  if (!execResult || typeof execResult !== "object") return {};
  const patch = {};
  if (execResult.promptDigest) patch.promptDigest = String(execResult.promptDigest).slice(0, 128);
  if (Number.isInteger(execResult.promptCharCount) && execResult.promptCharCount >= 0) patch.promptCharCount = execResult.promptCharCount;
  if (execResult.mandateDigest) patch.mandateDigest = String(execResult.mandateDigest).slice(0, 128);
  if (Number.isInteger(execResult.mandateOrderRevision) && execResult.mandateOrderRevision >= 0) {
    patch.mandateOrderRevision = execResult.mandateOrderRevision;
  }
  if (Number.isInteger(execResult.predecessorCharCount) && execResult.predecessorCharCount >= 0) {
    patch.predecessorCharCount = execResult.predecessorCharCount;
  }
  if (Number.isInteger(execResult.predecessorIncludedCharCount) && execResult.predecessorIncludedCharCount >= 0) {
    patch.predecessorIncludedCharCount = execResult.predecessorIncludedCharCount;
  }
  if (execResult.predecessorTruncated !== undefined) {
    patch.predecessorTruncated = Boolean(execResult.predecessorTruncated);
  }
  return patch;
}

function persistFailedAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId, isCodexRun }) {
  return authDb.withAuthTransaction(db, () => {
    const errorMessage = String((execResult && execResult.errorMessage) || "Agentenlauf ist technisch fehlgeschlagen.");
    // Nur für den Codex-Pfad befüllt – der lokale deterministische Runner
    // liefert kein execResult.diagnostics und bleibt dadurch byteidentisch
    // zu Phase 6 (resultSummaryJson weiterhin ungesetzt/null).
    const failedResultSummary = isCodexRun ? buildFailedRunResultSummary(execResult) : null;
    const applied = authDb.updatePilotAgentExecutionRunTerminal(db, {
      id: runId,
      status: "FAILED",
      finishedAt: nowIso(now),
      errorMessage: errorMessage.slice(0, 2000),
      ...(failedResultSummary ? { resultSummaryJson: JSON.stringify(failedResultSummary) } : {}),
      // Phase 7: ausschließlich für den Codex-Pfad gesetzt (siehe
      // auth-db.js#updatePilotAgentExecutionRunTerminal – dynamische
      // SET-Klausel, der lokale Pfad bleibt dadurch byteidentisch zu
      // Phase 6). aiExecuted bleibt hier IMMER false (Default): ein
      // fehlgeschlagener/abgebrochener Codex-Lauf ist per Wahrheitsregel
      // niemals "ein KI-/Codex-Agentenlauf" im Erfolgssinn, unabhängig
      // davon, ob Codex technisch aufgerufen wurde.
      ...(isCodexRun
        ? {
            workspaceId: (execResult && execResult.workspaceId) || null,
            timedOut: Boolean(execResult && execResult.timedOut),
            cancelledRun: Boolean(execResult && execResult.cancelled),
            ...buildPromptMetadataPatch(execResult),
          }
        : {}),
    });
    if (!applied) {
      throw new Error("Agentenlauf konnte nicht als fehlgeschlagen markiert werden (unerwarteter Zustand).");
    }
    // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"), Abschnitt 4:
    // Audit erhält für einen Codex-Lauf zusätzlich runnerKind sowie die
    // sicheren, kurzen technischen Kategoriewerte (exitCode/reasonCode/
    // Timeout-/Cancel-Flag) – AUSDRÜCKLICH NIEMALS stderrSample/stdoutSample,
    // Prompttext, Token oder Freigabetoken (siehe buildFailedRunResultSummary
    // oben für die vollständigere, aber weiterhin sichere Diagnosekopie in
    // resultSummaryJson).
    const diagnosticsForAudit = isCodexRun && execResult && execResult.diagnostics ? execResult.diagnostics : null;
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_AGENT_EXECUTION_RUN_FAILED",
      result: "ERROR",
      actorUserId,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: {
        pilotOrderId,
        pilotExecutionRunId: runId,
        pilotRole: preset.pilotRole,
        presetId: preset.presetId,
        runnerKind: preset.runnerKind,
        ...(diagnosticsForAudit
          ? {
              exitCode: diagnosticsForAudit.exitCode === undefined ? null : diagnosticsForAudit.exitCode,
              reasonCode: diagnosticsForAudit.reasonCode || null,
              timedOut: Boolean(diagnosticsForAudit.timedOut),
              cancelled: Boolean(diagnosticsForAudit.cancelled),
            }
          : {}),
      },
    });
    return rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId));
  });
}

// Stufe A, Erfolgsfall: ausschließlich der technische Runner-Abschluss.
// Erzeugt hier bewusst NOCH KEINEN Handoff-Versuch (siehe
// attemptHandoffForSucceededRun) – dieses Ergebnis ist bereits nach dieser
// Funktion dauerhaft gespeichert und bleibt es unabhängig vom weiteren
// Verlauf.
function persistSucceededAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId, isCodexRun }) {
  return authDb.withAuthTransaction(db, () => {
    const rawResultText = String((execResult && execResult.resultText) || "");
    const persistedResultText = rawResultText.slice(0, 8000);
    const resultWasTruncated = rawResultText.length > persistedResultText.length;
    const resultSummary = isCodexRun
      ? {
          analyzedFiles: execResult.analyzedFiles || [],
          runnerLabel: codexRunner.RUNNER_LABEL,
          secretRedactionApplied: Boolean(execResult.secretRedactionApplied),
          // Korrektur 2 (unabhängiges Review, Kategorie B): fester
          // Hinweistext, ausschließlich gesetzt, wenn tatsächlich redigiert
          // wurde – wird unverändert in Cockpit/API angezeigt (siehe
          // pilot-work-order-ui.js#renderAgentExecutionRun). Niemals ein
          // Secret- oder Tokenwert, ausschließlich der fixe Hinweissatz.
          secretRedactionNotice: execResult.secretRedactionApplied ? execResult.secretRedactionNotice || null : null,
          // V7.8.1 ("Ergebnisbudget von Kettenschritt 2 technisch erzwungen"):
          // Auditmetadaten der deterministischen Budgetdurchsetzung des
          // Dokumentationsschritts (siehe pilot-agent-documentation-result.js
          // und pilot-agent-codex-runner.js). Ausschließlich für die
          // Dokumentationsstufe vorhanden; der Name bleibt unverändert, damit
          // bestehende Leser (API/Cockpit) unberührt bleiben. Bewusst in der
          // bereits bestehenden resultSummaryJson-Spalte – keine neue Spalte,
          // keine Migration.
          ...(execResult.documentationNormalization
            ? { documentationNormalization: execResult.documentationNormalization }
            : {}),
          // V7.9.8: derselbe Metadatensatz stufenneutral – vorhanden für JEDE
          // Stufe mit Ergebnisvertrag (Schritt 1, 2 und 3) und damit der
          // kanonische Name für neue Leser. Ein Lauf ohne Stufenvertrag
          // (Phase-7-Einzellauf, lokaler Lauf) bleibt byteidentisch zum
          // bisherigen resultSummary.
          ...(execResult.resultNormalization ? { resultNormalization: execResult.resultNormalization } : {}),
        }
      : {
          observations: execResult.observations,
          recommendation: execResult.recommendation,
          analyzedFiles: (execResult.facts || []).filter((fact) => fact.exists).map((fact) => ({
            path: fact.path,
            byteLength: fact.byteLength,
            lineCount: fact.lineCount,
            sha256: fact.sha256,
          })),
        };
    const applied = authDb.updatePilotAgentExecutionRunTerminal(db, {
      id: runId,
      status: "SUCCEEDED",
      finishedAt: nowIso(now),
      resultSummaryJson: JSON.stringify(resultSummary),
      resultRawText: persistedResultText,
      // Phase 7 – siehe Kommentar in persistFailedAgentExecutionRun oben.
      // aiExecuted = true ist HIER (und ausschließlich hier) korrekt: dieser
      // Zweig wird nur erreicht, wenn execResult.ok === true (siehe
      // finalizeAgentExecutionRun) – also eine tatsächliche, nichtleere,
      // bereits inhaltlich geprüfte Codex-Antwort vorliegt (siehe
      // pilot-agent-codex-runner.js).
      ...(isCodexRun
        ? {
            workspaceId: execResult.workspaceId || null,
            aiExecuted: true,
            timedOut: false,
            cancelledRun: false,
            resultTruncated: resultWasTruncated,
            ...buildPromptMetadataPatch(execResult),
          }
        : {}),
    });
    if (!applied) {
      throw new Error("Agentenlauf konnte nicht als erfolgreich markiert werden (unerwarteter Zustand).");
    }
    authAudit.recordAuditEvent(db, {
      eventType: "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED",
      result: "OK",
      actorUserId,
      tenantId: null,
      timestamp: nowIso(now),
      metadata: {
        pilotOrderId,
        pilotExecutionRunId: runId,
        pilotRole: preset.pilotRole,
        presetId: preset.presetId,
        runnerId: isCodexRun ? codexRunner.RUNNER_ID : runner.RUNNER_ID,
      },
    });
    return rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId));
  });
}

// Stufe B: separater, nachgelagerter Versuch der fachlichen
// Rollenübergabe. Läuft AUSSERHALB der Stufe-A-Transaktion und in einer
// eigenen try/catch-Grenze: ein Scheitern hier (Konflikt, weil sich der
// Pilotauftragsstatus zwischenzeitlich geändert hat, oder jeder andere
// Fehler von submitHandoff) darf das bereits in Stufe A dauerhaft
// gespeicherte SUCCEEDED-Ergebnis NIEMALS zurückrollen oder überschreiben.
// Kein automatischer Retry, keine automatische Freigabe, kein automatischer
// Statuswechsel des Pilotauftrags durch diese Funktion selbst.
function attemptHandoffForSucceededRun(db, { runId, pilotOrderId, preset, execResult, resultSummary, now, actorUserId, isCodexRun }) {
  const basisUsed = isCodexRun
    ? `Echter Codex-Read-Only-Agentenlauf (${codexRunner.RUNNER_LABEL}), analysierte Dateien: ${(resultSummary.analyzedFiles || []).join(", ")}.`
    : `Lokal gelesene Projektdateien (${resultSummary.analyzedFiles
        .map((entry) => `${entry.path}, ${entry.byteLength} Bytes, SHA-256 ${entry.sha256.slice(0, 12)}…`)
        .join("; ")}), Runner: ${runner.RUNNER_LABEL}`;
  const riskOrLimit = isCodexRun
    ? "Analyse beschränkt auf die im Preset festgelegten Dateien; keine Aussage über den Rest des Repositories. " +
      "Echter externer Modell-Roundtrip über die lokale Codex-CLI (networkRequired/externalAiRequired)."
    : "Analyse beschränkt auf die im Preset festgelegten Dateien; keine Aussage über den Rest des Repositories. " +
      "Kein KI-Modellaufruf, keine externe Netzwerkanfrage.";

  try {
    const handoffResult = pilotWorkOrderService.submitHandoff(db, {
      pilotOrderId,
      fromPilotRole: preset.handoffFromPilotRole,
      toPilotRole: preset.handoffToPilotRole,
      shortFinding: `Agentenlauf ${runId} erfolgreich abgeschlossen (${preset.title}).`,
      resultOrRecommendation: execResult.resultText.slice(0, 4000),
      basisUsed: basisUsed.slice(0, 2000),
      riskOrLimit,
      nextStep: "Projektmanager-Filter prüft das Ergebnis; bei Annahme kann zur Abschlussprüfung vorgelegt werden.",
      forbiddenActionOccurred: false,
      autonomyBoundaryRespected: true,
      executionRunId: runId,
      now,
      actorUserId,
    });
    authDb.updatePilotAgentExecutionRunHandoffOutcome(db, {
      id: runId,
      handoffStatus: "SUCCEEDED",
      handoffErrorMessage: null,
      handoffCompletedAt: nowIso(now),
    });
    return { handoff: handoffResult.handoff, filterResult: handoffResult.filterResult, handoffStatus: "SUCCEEDED", handoffErrorMessage: null };
  } catch (handoffError) {
    const handoffErrorMessage = String((handoffError && handoffError.message) || handoffError).slice(0, 2000);
    try {
      authDb.updatePilotAgentExecutionRunHandoffOutcome(db, {
        id: runId,
        handoffStatus: "FAILED",
        handoffErrorMessage,
        handoffCompletedAt: nowIso(now),
      });
      authAudit.recordAuditEvent(db, {
        eventType: "PILOT_AGENT_EXECUTION_RUN_HANDOFF_FAILED",
        result: "ERROR",
        actorUserId,
        tenantId: null,
        timestamp: nowIso(now),
        metadata: { pilotOrderId, pilotExecutionRunId: runId, pilotRole: preset.pilotRole, presetId: preset.presetId },
      });
    } catch (_persistError) {
      // Best effort: selbst wenn das Festhalten des Handoff-Fehlschlags
      // selbst scheitert, bleibt Stufe A (das SUCCEEDED-Ergebnis) davon
      // vollständig unberührt – niemals ein Rückschluss auf den bereits
      // dauerhaft gespeicherten Runstatus.
    }
    return { handoff: null, filterResult: null, handoffStatus: "FAILED", handoffErrorMessage };
  }
}

function finalizeAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId, isCodexRun = false }) {
  const isSuccess = Boolean(execResult && execResult.ok === true);
  try {
    if (!isSuccess) {
      const run = persistFailedAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId, isCodexRun });
      return { run, handoff: null };
    }
    const succeededRun = persistSucceededAgentExecutionRun(db, { runId, pilotOrderId, preset, execResult, now, actorUserId, isCodexRun });
    // Ab hier ist Stufe A unumkehrbar abgeschlossen: succeededRun.status ist
    // dauerhaft SUCCEEDED, unabhängig vom Ausgang von Stufe B unten.
    //
    // Phase 8 ("vollständige, kontrollierte Drei-Agenten-Kette"): ein
    // chainManaged-Preset (siehe PILOT_AGENT_TASK_PRESETS oben) löst NIEMALS
    // Stufe B (die klassische Rollenübergabe/PM-Filter auf dem zugrunde
    // liegenden Pilotauftrag) aus – ein Kettenschritt-Erfolg wird
    // ausschließlich über die eigenständige, getrennte Kettenlogik
    // (pilot-agent-execution-chain-service.js) weiterverarbeitet. handoffStatus
    // der Laufzeile bleibt dadurch bewusst auf dem bereits bestehenden
    // Default "PENDING" stehen (kein neuer Enum-Wert, keine zusätzliche
    // Migration nötig) – für einen Kettenschritt bedeutet das: "Stufe B ist
    // für diesen Lauf strukturell nicht vorgesehen", niemals "es wurde
    // vergessen".
    if (preset.chainManaged) {
      return {
        run: succeededRun,
        handoff: null,
        filterResult: null,
        handoffStatus: "PENDING",
        handoffErrorMessage: null,
      };
    }
    const handoffOutcome = attemptHandoffForSucceededRun(db, {
      runId,
      pilotOrderId,
      preset,
      execResult,
      resultSummary: succeededRun.resultSummary,
      now,
      actorUserId,
      isCodexRun,
    });
    return {
      run: rowToAgentExecutionRunView(authDb.getPilotAgentExecutionRunById(db, runId)),
      handoff: handoffOutcome.handoff,
      filterResult: handoffOutcome.filterResult,
      handoffStatus: handoffOutcome.handoffStatus,
      handoffErrorMessage: handoffOutcome.handoffErrorMessage,
    };
  } catch (stageAError) {
    // Nur erreichbar, wenn bereits STUFE A selbst scheitert (z. B. ein
    // simulierter Audit-Fehler beim technischen Abschluss) – niemals durch
    // ein Scheitern von Stufe B (siehe attemptHandoffForSucceededRun, das
    // seine eigenen Fehler abfängt und niemals hierher durchreicht).
    // Sicherer, eindeutig erkennbarer Fehlerzustand außerhalb der
    // gescheiterten Transaktion: niemals ein stiller Erfolg, niemals ein
    // für immer unklarer RUNNING-Zustand.
    try {
      authDb.updatePilotAgentExecutionRunTerminal(db, {
        id: runId,
        status: "FAILED",
        finishedAt: nowIso(now),
        errorMessage: `Interner Fehler nach Ausführung: ${String((stageAError && stageAError.message) || stageAError)}`.slice(0, 2000),
      });
    } catch (_fallbackError) {
      /* best effort – der Lauf bleibt im schlimmsten Fall nachvollziehbar RUNNING, niemals fälschlich SUCCEEDED. */
    }
    throw stageAError;
  }
}

// V7.7.0 Korrektur 2: die BEIDEN EINZIGEN legitimen internen Einstiegspunkte
// für ein chainManaged-Preset – ausschließlich für
// pilot-agent-execution-chain-service.js bestimmt (siehe dessen
// startStep()). Geben das modulprivate CHAIN_INTERNAL_BRIDGE_CAPABILITY-
// Symbol an die jeweilige Funktion weiter; ein Aufrufer außerhalb dieser
// Datei kann dieses Symbol nicht selbst erzeugen oder erraten (siehe
// Kopfkommentar oben an der Konstante). Jeder normale Aufruf von
// requestCodexRunApproval/startAgentExecutionRun mit einem chainManaged-
// Preset bleibt weiterhin abgewiesen (assertChainManagedPresetHasInternalBridge).
function requestCodexRunApprovalForChainInternal(db, options = {}) {
  return requestCodexRunApproval(db, { ...options, __chainInternalBridge: CHAIN_INTERNAL_BRIDGE_CAPABILITY });
}
function startAgentExecutionRunForChainInternal(db, options = {}) {
  return startAgentExecutionRun(db, { ...options, __chainInternalBridge: CHAIN_INTERNAL_BRIDGE_CAPABILITY });
}

module.exports = {
  PilotAgentExecutionError,
  PILOT_AGENT_TASK_PRESETS,
  CHAIN_SELECTABLE_FILES,
  CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES,
  RUNNER_KINDS,
  REPO_ROOT,
  rowToAgentExecutionRunView,
  listAgentExecutionRunsForOrder,
  getAgentExecutionRunById,
  startAgentExecutionRun,
  requestCodexRunApproval,
  // V7.7.0 Korrektur 2: ausschließlich für pilot-agent-execution-chain-service.js
  // bestimmt – siehe Kopfkommentar oben. Kein normaler Aufrufer (HTTP-Route,
  // direkter Serviceaufruf) kann ein chainManaged-Preset stattdessen über
  // die beiden Funktionen darüber oder über requestCodexRunApproval/
  // startAgentExecutionRun direkt starten (dort fest abgewiesen).
  requestCodexRunApprovalForChainInternal,
  startAgentExecutionRunForChainInternal,
  // Ausschließlich für gezielte Bindungs-/TTL-Unit-Tests exportiert (siehe
  // pilot-agent-execution-codex.test.js) – der produktive Aufrufpfad läuft
  // ausschließlich über startAgentExecutionRun oben.
  consumeCodexRunApproval,
  clearCodexApprovalTokensForTests,
  getCodexAvailabilitySummary,
  resolveAgentForPreset,
  resolveChainSelectedFiles,
};
