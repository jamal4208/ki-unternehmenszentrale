"use strict";

// V7.3 Persistenznachtrag (Auftrag Abschnitt C) – ausschließlich dieses
// Modul übersetzt zwischen dem reinen In-Memory-Speicherformat aus
// jamal-work-mode.js (bewusst weiterhin ohne jeden Datenbankbezug – siehe
// dortiger Modulkopf) und den beiden additiven Migration-12-Tabellen
// (jamal_work_items/jamal_work_results, siehe auth-db-migrations.js).
//
// Wichtig:
//   - Dieses Modul importiert better-sqlite3 NICHT selbst. Es erhält stets
//     ein bereits geöffnetes better-sqlite3-Datenbankobjekt (von
//     server.js#ensureAuthDbReady) und reicht es ausschließlich an
//     auth-db.js weiter – auth-db.js bleibt im gesamten Projekt das
//     einzige Modul mit direktem better-sqlite3-Import.
//   - Kein LocalStorage, kein Browserbezug (reines Server-/Node-Modul).
//   - Keine Systemprompts, keine Chain-of-Thought, keine Secrets/Tokens:
//     jedes hier gespeicherte Feld ist bereits Teil der bestehenden
//     Antwort von jamal-work-mode.js#getSafeView, die dem Browser ohnehin
//     unverändert angezeigt wird (siehe jamal-work-mode-ui.js) – die
//     Persistenz erweitert also NICHT, was Jamal ohnehin schon sieht.
//
// Prinzip (Auftrag Abschnitt B/C: "mehrere parallele Serverprozesse sehen
// denselben Zustand", "Serverneustart erhält den Zustand"): server.js
// lädt vor JEDER Anfrage den vollständigen Zustand aus der Datenbank
// ("loadStore") und schreibt nach JEDER erfolgreichen Aktion den
// vollständigen resultierenden Zustand vollständig zurück
// ("persistStore") – kein Prozessspeicher-Zwischenstand.

const crypto = require("crypto");
const authDb = require("./auth-db");
const jamalWorkMode = require("./jamal-work-mode");

function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function fromJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

// item -> Zeile (jamal_work_items). Siehe auth-db-migrations.js#Migration 12
// für die fachliche Feldabbildung camelCase <-> die im Auftrag beispielhaft
// genannten snake_case-Namen.
function itemToRow(store, item) {
  const latestVersion = item.versions.length ? item.versions[item.versions.length - 1] : null;
  return {
    id: item.id,
    projectId: item.projectId,
    projectDisplayName: item.projectDisplayName,
    projectSource: item.projectSource,
    desiredOutcome: item.desiredOutcome,
    importantNotes: item.notes,
    preferredTiming: item.preferredTiming,
    status: item.status,
    clarifyingQuestionJson: toJson(item.clarifyingQuestion),
    selectedAgentsJson: toJson(item.plan ? item.plan.agents : null),
    workPlanJson: toJson(
      item.plan
        ? {
            steps: item.plan.steps,
            expectedResultFormat: item.plan.expectedResultFormat,
            qualityCriteria: item.plan.qualityCriteria,
          }
        : null,
    ),
    safetyDecisionJson: toJson(item.safetyDecision),
    qualityStatus: latestVersion ? latestVersion.qualityStatus : null,
    qualityNote: latestVersion ? latestVersion.qualityNote : null,
    decision: item.decision,
    decidedAt: item.decidedAt,
    doneAt: item.doneAt,
    stoppedAt: item.stoppedAt,
    postponedAt: item.postponedAt,
    stopReason: item.stopReason || null,
    pendingChangeText: item.pendingChangeText || null,
    escalationJson: toJson(item.escalation),
    lastUsedProjectId: store.lastUsedProjectId,
    lastUsedProjectDisplayName: store.lastUsedProjectDisplayName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.doneAt || item.stoppedAt || null,
  };
}

// Zeile (jamal_work_items) + ihre Ergebnisversionen -> item (exakt das
// Format, das jamal-work-mode.js selbst erzeugt und erwartet).
function rowToItem(row, versions) {
  const agents = fromJson(row.selectedAgentsJson);
  const workPlan = fromJson(row.workPlanJson);
  const item = {
    schemaVersion: 1,
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectId: row.projectId,
    projectDisplayName: row.projectDisplayName,
    projectSource: row.projectSource,
    desiredOutcome: row.desiredOutcome,
    notes: row.importantNotes,
    preferredTiming: row.preferredTiming,
    status: row.status,
    clarifyingQuestion: fromJson(row.clarifyingQuestionJson),
    plan:
      agents && workPlan
        ? {
            steps: workPlan.steps,
            expectedResultFormat: workPlan.expectedResultFormat,
            qualityCriteria: workPlan.qualityCriteria,
            agents,
          }
        : null,
    safetyDecision: fromJson(row.safetyDecisionJson),
    versions: Object.freeze(versions),
    decision: row.decision,
    decidedAt: row.decidedAt,
    doneAt: row.doneAt,
    stoppedAt: row.stoppedAt,
    postponedAt: row.postponedAt,
    escalation: fromJson(row.escalationJson),
  };
  if (row.stopReason) item.stopReason = row.stopReason;
  if (row.pendingChangeText) item.pendingChangeText = row.pendingChangeText;
  return item;
}

// Ergebnisversion -> Zeile (jamal_work_results). jamal-work-mode.js#
// pushImmutableVersion vergibt selbst keine id für eine Version – diese
// wird ausschließlich für die Datenbankzeile benötigt und hier neu
// erzeugt (gleiches Muster wie auth-db.js#createWorkOrderResult).
function versionToRow(workItemId, version) {
  return {
    id: crypto.randomUUID(),
    workItemId,
    versionNumber: version.versionNumber,
    resultTitle: version.title,
    resultSummary: version.summary,
    resultBody: version.body,
    qualityStatus: version.qualityStatus,
    qualityNote: version.qualityNote,
    openPointsJson: toJson(version.openPoints),
    agentsInvolvedJson: toJson(version.agentsInvolved),
    triggerType: version.trigger,
    changeRequestText: version.changeRequestText || null,
    createdAt: version.createdAt,
  };
}

// Zeile (jamal_work_results) -> Version (exakt das Format aus
// jamal-work-mode.js#pushImmutableVersion).
function rowToVersion(row) {
  return Object.freeze({
    versionNumber: row.versionNumber,
    title: row.resultTitle,
    summary: row.resultSummary,
    body: row.resultBody,
    qualityStatus: row.qualityStatus,
    qualityNote: row.qualityNote,
    openPoints: fromJson(row.openPointsJson) || [],
    agentsInvolved: fromJson(row.agentsInvolvedJson) || [],
    trigger: row.triggerType,
    changeRequestText: row.changeRequestText,
    createdAt: row.createdAt,
  });
}

// Liest den vollständigen aktuellen Zustand ausschließlich aus der
// Datenbank – kein Prozessspeicher-Zwischenstand. Ohne jeden bisherigen
// Datensatz entspricht das Ergebnis exakt jamalWorkMode.createStore()
// (unverändertes Verhalten beim allerersten Start, auch nach einem
// vollständig frischen Datenbankverzeichnis).
function loadStore(db) {
  const row = authDb.getLatestJamalWorkItem(db);
  if (!row) return jamalWorkMode.createStore();
  const versions = authDb.listJamalWorkResultsForWorkItem(db, row.id).map(rowToVersion);
  return {
    schemaVersion: 1,
    currentItem: rowToItem(row, versions),
    lastUsedProjectId: row.lastUsedProjectId || null,
    lastUsedProjectDisplayName: row.lastUsedProjectDisplayName || null,
  };
}

// Schreibt den vollständigen resultierenden Zustand transaktional und
// idempotent zurück: genau ein Upsert der Arbeitswunsch-Zeile (Auftrag
// Abschnitt C: "Statuswechsel transaktional") plus ausschließlich neue,
// in der Datenbank noch nicht vorhandene Ergebnisversionen (append-only,
// siehe Migration 12 – bestehende Versionen werden nie verändert). Ohne
// aktuellen Arbeitswunsch (store.currentItem === null, z. B. vor dem
// allerersten "Ergebniswunsch festlegen") gibt es nichts zu schreiben.
function persistStore(db, store) {
  const item = store.currentItem;
  if (!item) return;
  const run = db.transaction(() => {
    authDb.upsertJamalWorkItem(db, itemToRow(store, item));
    const existingVersionNumbers = new Set(
      authDb.listJamalWorkResultsForWorkItem(db, item.id).map((row) => row.versionNumber),
    );
    for (const version of item.versions) {
      if (!existingVersionNumbers.has(version.versionNumber)) {
        authDb.appendJamalWorkResult(db, versionToRow(item.id, version));
      }
    }
  });
  run();
}

module.exports = {
  loadStore,
  persistStore,
};
