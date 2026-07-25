"use strict";

// V7.0 Phase D – kanonische Executor-Registry.
//
// Einzige Stelle, die bekannt gibt, welche Executoren existieren und welche
// Grenzen für sie gelten. execution-bridge.js fragt hier ausschließlich ab,
// welcher Adapter für eine executorId zuständig ist; sie enthält selbst
// keine Codex- oder Mock-spezifische Logik. Die tatsächliche Verfügbarkeit
// von Codex wird ausschließlich serverseitig ermittelt (execution-codex-adapter.js);
// der Browser bekommt nur das sichere, bereits geprüfte Ergebnis.

const mockAdapter = require("./execution-mock-adapter");
const codexAdapter = require("./execution-codex-adapter");

const HEALTH_PROJECT_ID = "health-upgrade-kompass";

const EXECUTOR_DESCRIPTORS = Object.freeze({
  mock: Object.freeze({
    id: "mock",
    displayName: "Deterministischer Mock – keine KI",
    capability:
      "Technische Selbstprüfung der Isolations-, Allowlist- und Evidenzmechanik der Execution Bridge. Kein echter Code, keine KI-Ausführung.",
    writeScope:
      "Schreibt ausschließlich innerhalb des isolierten Workspace. Das Zielrepository wird erst nach expliziter Apply-Freigabe berührt.",
    networkHint: "Kein Netzwerkzugriff.",
    approvalLevel: "Start erfordert Jamals ausdrückliche Freigabe je Attempt (frischer One-Time-Token).",
    supportedScenarios: mockAdapter.SUPPORTED_SCENARIOS,
    healthAllowed: true,
  }),
  codex: Object.freeze({
    id: "codex",
    displayName: "Codex – isolierter echter Code-Executor",
    capability:
      "Echter, isolierter Code-Executor über die lokale Codex-CLI. Arbeitet ausschließlich in einer isolierten Kopie eines Fixture-Repositories und ausschließlich an einem vorab festgelegten, engen Pilotauftrag.",
    writeScope:
      "Schreibt ausschließlich innerhalb des isolierten Attempt-Workspace. Kein direkter Zugriff auf ein echtes Repository. Übernahme in das Fixture-Zielrepository nur nach separater Jamal-Apply-Freigabe.",
    networkHint:
      "Netzwerk-/Modellzugriff hängt vom lokal verbundenen Codex-Konto ab und wird von der Zentrale nicht kontrolliert oder mitgelesen.",
    approvalLevel:
      "Start erfordert Jamals ausdrückliche Freigabe je Attempt, gebunden an einen frischen, einmaligen START_CODEX_EXECUTION-Token.",
    supportedScenarios: codexAdapter.SUPPORTED_SCENARIOS,
    healthAllowed: false,
  }),
});

function hasExecutor(executorId) {
  return Object.prototype.hasOwnProperty.call(EXECUTOR_DESCRIPTORS, executorId);
}

function getExecutorDescriptor(executorId) {
  return EXECUTOR_DESCRIPTORS[executorId] || null;
}

// Rückwärtskompatibel: ein fehlender oder unbekannter Wert bedeutet Mock
// (identisch zum bisherigen Phase-C-Verhalten, damit bestehende Aufrufer ohne
// executorId unverändert funktionieren).
function resolveExecutorAdapter(executorId) {
  if (executorId === "codex") return codexAdapter;
  return mockAdapter;
}

function isHealthAllowedForExecutor(executorId) {
  const descriptor = getExecutorDescriptor(executorId) || EXECUTOR_DESCRIPTORS.mock;
  return descriptor.healthAllowed === true;
}

function publicDescriptor(descriptor, availability) {
  return {
    id: descriptor.id,
    displayName: descriptor.displayName,
    capability: descriptor.capability,
    writeScope: descriptor.writeScope,
    networkHint: descriptor.networkHint,
    approvalLevel: descriptor.approvalLevel,
    supportedScenarios: descriptor.supportedScenarios,
    healthAllowed: descriptor.healthAllowed,
    available: availability.available === true,
    authStatus: availability.available ? availability.authLabel || null : null,
    version: availability.available ? availability.version || null : null,
    unavailableReason: availability.available ? null : availability.reason || "UNGEKLÄRT",
  };
}

// Ausschließlich sichere, bereits geprüfte Metadaten für den Browser. Keine
// Executable-Pfade, keine CLI-Argumente, kein Environment, keine Secrets.
function describeExecutorsForClient(options = {}) {
  const codexAvailability = codexAdapter.detectCodexAvailability(options);
  return [
    publicDescriptor(EXECUTOR_DESCRIPTORS.mock, { available: true }),
    publicDescriptor(EXECUTOR_DESCRIPTORS.codex, codexAvailability),
  ];
}

module.exports = {
  HEALTH_PROJECT_ID,
  EXECUTOR_DESCRIPTORS,
  hasExecutor,
  getExecutorDescriptor,
  resolveExecutorAdapter,
  isHealthAllowedForExecutor,
  describeExecutorsForClient,
};
