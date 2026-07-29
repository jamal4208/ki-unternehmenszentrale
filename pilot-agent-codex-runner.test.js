"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Isolierte Tests für pilot-agent-codex-runner.js: Prompt-Aufbau
// (agentKey/pilotRole beeinflussen den Auftrag tatsächlich), Erkennung
// behaupteter verbotener Aktionen sowie die vollständige Orchestrierung
// (Workspace -> Codex-Adapter -> Ergebnisprüfung -> Cleanup) mit
// injizierten Test-Doubles für codexAdapterImpl/workspaceModuleImpl -
// startet niemals einen echten Codex-Kindprozess und schreibt niemals
// tatsächlich auf Datenträger.

const assert = require("assert");
const agentRegistry = require("./agent-registry");
const codexRunner = require("./pilot-agent-codex-runner");

let passed = 0;
async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function basePromptInput(overrides = {}) {
  return {
    agentKey: "review-agent",
    agentDisplayName: "Review-Agent",
    agentRole: "Führt read-only Qualitätsreview durch",
    pilotRole: "RECHERCHE_ANALYSE",
    pilotRoleLabel: "Recherche/Analyse",
    taskTitle: "Phase-7-Pilotstruktur semantisch prüfen",
    taskInstructions: "Erstelle eine kurze Analyse.",
    allowedFiles: ["a.js", "b.js"],
    allowedTools: ["Lesen"],
    forbiddenActions: ["Dateien ändern"],
    expectedResultFormat: "Titel, Beobachtungen, Empfehlung.",
    ...overrides,
  };
}

function makeFakeWorkspaceModule({ workspaceDir = "/tmp/fake-ws", workspaceId = "ws-fake", copiedFiles = ["a.js"], createError = null, changedPaths = [] } = {}) {
  const calls = { createCalls: [], verifyCalls: [], cleanupCalls: [] };
  return {
    calls,
    createIsolatedReadOnlyWorkspace: (options) => {
      calls.createCalls.push(options);
      if (createError) throw createError;
      return { workspaceId, workspaceDir, copiedFiles, baselineHashes: { "a.js": "hash-a" }, totalBytes: 10 };
    },
    verifyWorkspaceUnchanged: (dir, baseline) => {
      calls.verifyCalls.push({ dir, baseline });
      return changedPaths;
    },
    cleanupWorkspace: (dir) => {
      calls.cleanupCalls.push(dir);
    },
  };
}

function makeFakeCodexAdapter({
  resultText = "Analyseergebnis.",
  ok = true,
  cancelled = false,
  timedOut = false,
  errors = [],
  secretRedactionApplied = false,
  codexRawOutput,
  reasonCode,
} = {}) {
  const calls = [];
  return {
    calls,
    runCodexReadOnlyAnalysis: async (options) => {
      calls.push(options);
      if (cancelled) {
        return { ok: false, cancelled: true, resultText: null, errors: ["CANCELLED"], reasonCode: reasonCode || "CANCELLED", codexRawOutput };
      }
      if (!ok) {
        return {
          ok: false,
          cancelled: false,
          timedOut,
          resultText: null,
          errors: errors.length ? errors : ["Fehler."],
          reasonCode: reasonCode || "CODEX_PROCESS_EXIT_NONZERO",
          codexRawOutput,
        };
      }
      return { ok: true, cancelled: false, timedOut: false, resultText, secretRedactionApplied, errors: [] };
    },
    detectCodexAvailability: () => ({ available: true, authenticated: true, version: "codex-cli 0.0.0-test", authLabel: "ChatGPT" }),
  };
}

async function run() {
  await check("Phase 7 – 2. unterschiedliche Agentenidentität/Rolle erzeugt einen inhaltlich unterschiedlichen Codex-Prompt", async () => {
    const promptA = codexRunner.buildAgentSpecificCodexPrompt(basePromptInput());
    const promptB = codexRunner.buildAgentSpecificCodexPrompt(
      basePromptInput({
        agentKey: "product-agent",
        agentDisplayName: "Produkt-Agent",
        agentRole: "Ordnet Auftrag produktlogisch ein",
        pilotRole: "DOKUMENTATION",
        pilotRoleLabel: "Dokumentation",
      }),
    );
    assert.notStrictEqual(promptA, promptB);
    assert.ok(promptA.includes("review-agent"));
    assert.ok(promptA.includes("Recherche/Analyse"));
    assert.ok(promptB.includes("product-agent"));
    assert.ok(promptB.includes("Dokumentation"));
  });

  await check("Phase 7 – der Prompt enthält alle im Auftrag geforderten Pflichtbestandteile", async () => {
    const prompt = codexRunner.buildAgentSpecificCodexPrompt(basePromptInput());
    [
      "review-agent",
      "RECHERCHE_ANALYSE",
      "Phase-7-Pilotstruktur semantisch prüfen",
      "Erstelle eine kurze Analyse.",
      "a.js, b.js",
      "Lesen",
      "Dateien ändern",
      "Ausschließlich lesen und analysieren",
      "Keine Dateiänderung",
      "Kein Commit, kein Push, kein Deployment",
      "Keine unaufgeforderten Dateien lesen",
      "Keine Secrets, Zugangsdaten oder Tokens ausgeben",
      "ausschließlich als Textantwort",
      "Titel, Beobachtungen, Empfehlung.",
    ].forEach((mustContain) => assert.ok(prompt.includes(mustContain), `Prompt fehlt: "${mustContain}"`));
  });

  await check("Phase 7 – 3. die im Codex-Prompt verwendete Agentenidentität ist tatsächlich im kanonischen Register eingetragen", async () => {
    assert.strictEqual(agentRegistry.hasAgentId("review-agent"), true);
    const entry = agentRegistry.getAgentById("review-agent");
    assert.strictEqual(entry.name, "Review-Agent");
    assert.strictEqual(agentRegistry.hasAgentId("does-not-exist-agent"), false);
  });

  // Korrekturlauf vor dem echten Referenzlauf (unabhängiges Review,
  // Kategorie B, Korrektur 1/8.15): tatsächliche deutsche UND englische
  // Erfolgsbehauptungen über eine verbotene Aktion werden blockiert – auch
  // in unpersönlicher Passivform, nicht nur in der Ich-Form.
  await check("Phase 7 – 8.15. tatsächliche deutsche und englische Schreibbehauptungen werden blockiert", async () => {
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Ich habe die Datei geändert und gespeichert."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Ich habe die Konfigurationsdatei geändert und den Commit durchgeführt."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Die Datei wurde erfolgreich gelöscht."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Push wurde erfolgreich durchgeführt."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I modified the file and committed it."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I have successfully pushed the changes to the repository."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I have successfully installed the new dependency."), true);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("The file has been successfully deleted."), true);
  });

  // Korrektur 1/8.13: eine Negation (Deutsch und Englisch) darf niemals als
  // Verstoß gewertet werden, selbst wenn sie exakt dieselben Aktionsbegriffe
  // wie eine echte Verstoßbehauptung enthält.
  await check("Phase 7 – 8.13. eine negierte Schreibbehauptung wird akzeptiert (Deutsch und Englisch)", async () => {
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Ich habe nichts geändert."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Ich habe keine Datei geändert oder gelöscht."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Kein Commit wurde durchgeführt."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I did not modify any file."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I have not pushed anything."), false);
  });

  // Korrektur 1/8.14: eine Empfehlung, die einen verbotenen Begriff nur
  // erwähnt (Deutsch und Englisch), sowie eine Erklärung über einen
  // späteren manuellen Schritt sind kein Verstoß – die bloße Erwähnung
  // eines Begriffs genügt nicht mehr, es muss eine tatsächliche
  // Erfolgsbehauptung sein.
  await check("Phase 7 – 8.14. eine Empfehlung mit npm install/git commit/push/Deployment wird akzeptiert (Deutsch und Englisch)", async () => {
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Empfehlung: fuehre npm install nach dem Merge aus."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Ein Mensch sollte anschließend git commit und git push ausführen."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Nach Freigabe könnte ein Deployment sinnvoll sein."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Recommendation: a human should run git push and deploy afterwards."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("I would recommend running npm install after merging."), false);
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("This should be committed by a human reviewer."), false);
    // Erklärung über einen späteren manuellen Schritt / Wirkzeitpunkt.
    assert.strictEqual(codexRunner.detectClaimedForbiddenAction("Die Datei wird erst bei git commit wirksam."), false);
  });

  await check("detectClaimedForbiddenAction lässt eine normale, rein lesende Analyseantwort unverändert durch", async () => {
    assert.strictEqual(
      codexRunner.detectClaimedForbiddenAction("Beobachtung 1: Die Datei enthält eine Funktion. Empfehlung: prüfen."),
      false,
    );
    assert.strictEqual(
      codexRunner.detectClaimedForbiddenAction("Ich habe die Struktur analysiert und drei Beobachtungen notiert."),
      false,
    );
  });

  // Korrektur 1: ein Zitat (z. B. eine wörtlich zitierte Kommentarzeile) ist
  // keine eigene Behauptung von Codex und wird vor der Prüfung entfernt.
  await check("Phase 7 – Korrektur 1: ein zitierter Text mit fremder Erfolgsbehauptung wird nicht als eigene Behauptung von Codex gewertet", async () => {
    assert.strictEqual(
      codexRunner.detectClaimedForbiddenAction(
        'Der Kommentar in der Datei lautet wörtlich: "Ich habe diese Funktion geändert und committed." Das bezieht sich auf einen früheren, menschlichen Commit.',
      ),
      false,
    );
  });

  await check("Phase 7 – erfolgreicher Lauf: Workspace wird erzeugt, Codex aufgerufen, Ergebnis geliefert, Cleanup erfolgt (34.)", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-success" });
    const fakeAdapter = makeFakeCodexAdapter({ resultText: "Echtes Ergebnis." });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: ["Lesen"],
      forbiddenActions: ["Dateien ändern"],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Führt read-only Qualitätsreview durch",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-success",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.resultText, "Echtes Ergebnis.");
    assert.strictEqual(result.workspaceId, "ws-success");
    assert.deepStrictEqual(result.analyzedFiles, ["a.js"]);
    assert.strictEqual(fakeWorkspace.calls.cleanupCalls.length, 1);
    assert.strictEqual(fakeWorkspace.calls.verifyCalls.length, 1);
    // Der Prompt, den der Codex-Adapter tatsächlich erhalten hat, muss die
    // Agentenidentität enthalten (Schwerpunkt 4 wirkt bis in den echten
    // Adapteraufruf hinein).
    assert.ok(fakeAdapter.calls[0].prompt.includes("review-agent"));
  });

  await check("Phase 7 – 35. Workspace-Erstellung scheitert: kein Codex-Aufruf, sicherer Fehler, kein Cleanup-Aufruf nötig (Workspace existiert nicht)", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ createError: new Error("Quelle fehlt.") });
    const fakeAdapter = makeFakeCodexAdapter();
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["missing.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-ws-fail",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, true);
    assert.ok(result.errorMessage.includes("Workspace konnte nicht erstellt werden"));
    assert.strictEqual(fakeAdapter.calls.length, 0);
  });

  await check("Phase 7 – 35. ein technischer Codex-Fehler führt zu FAILED, aber Cleanup erfolgt trotzdem", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-codex-fail" });
    const fakeAdapter = makeFakeCodexAdapter({ ok: false, errors: ["Codex-Prozess beendete mit einem Fehler."] });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-codex-fail",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, true);
    assert.strictEqual(fakeWorkspace.calls.cleanupCalls.length, 1);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): die bisher
  // an dieser Stelle verworfenen sicheren Diagnosefelder (codexRawOutput)
  // müssen jetzt vollständig als result.diagnostics ankommen.
  // -------------------------------------------------------------------

  await check("Korrekturlauf – ein technischer Codex-Fehler reicht exitCode/signal/reasonCode/stderrSample/stdoutSample als result.diagnostics durch", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-codex-diag" });
    const fakeAdapter = makeFakeCodexAdapter({
      ok: false,
      errors: ["Codex-Prozess endete mit Exit-Code 1. stderr: echte Ursache"],
      reasonCode: "CODEX_PROCESS_EXIT_NONZERO",
      codexRawOutput: { exitCode: 1, signal: null, stdoutSample: "", stderrSample: "echte Ursache", timedOutAtProcessLevel: false },
    });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-codex-diag",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.diagnostics, "result.diagnostics muss vorhanden sein");
    assert.strictEqual(result.diagnostics.exitCode, 1);
    assert.strictEqual(result.diagnostics.signal, null);
    assert.strictEqual(result.diagnostics.reasonCode, "CODEX_PROCESS_EXIT_NONZERO");
    assert.strictEqual(result.diagnostics.runnerPhase, "CODEX_PROCESS");
    assert.strictEqual(result.diagnostics.stderrSample, "echte Ursache");
    assert.strictEqual(result.diagnostics.timedOut, false);
    assert.strictEqual(result.diagnostics.cancelled, false);
    assert.ok(result.errorMessage.includes("Exit-Code 1"));
  });

  await check("Korrekturlauf – ein per Fake-Doppel ohne codexRawOutput gemeldeter Fehler stürzt nicht ab (defensiver Umgang mit fehlendem optionalen Feld)", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-codex-no-raw" });
    const fakeAdapter = makeFakeCodexAdapter({ ok: false, errors: ["Fehler ohne codexRawOutput."] });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-codex-no-raw",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.diagnostics);
    assert.strictEqual(result.diagnostics.exitCode, null);
    assert.strictEqual(result.diagnostics.stderrSample, null);
  });

  await check("Korrekturlauf – Timeout/Cancel bleiben in result.diagnostics eindeutig erkennbar", async () => {
    const fakeWorkspaceTimeout = makeFakeWorkspaceModule({ workspaceId: "ws-timeout-diag" });
    const timeoutAdapter = makeFakeCodexAdapter({
      ok: false,
      timedOut: true,
      errors: ["TIMEOUT"],
      reasonCode: "TIMEOUT",
      codexRawOutput: { exitCode: null, signal: "SIGTERM", stdoutSample: "", stderrSample: "", timedOutAtProcessLevel: true },
    });
    const timeoutResult = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-timeout-diag",
      codexAdapterImpl: timeoutAdapter,
      workspaceModuleImpl: fakeWorkspaceTimeout,
    });
    assert.strictEqual(timeoutResult.timedOut, true);
    assert.strictEqual(timeoutResult.diagnostics.timedOut, true);
    assert.strictEqual(timeoutResult.diagnostics.signal, "SIGTERM");
    assert.strictEqual(timeoutResult.diagnostics.reasonCode, "TIMEOUT");

    const fakeWorkspaceCancel = makeFakeWorkspaceModule({ workspaceId: "ws-cancel-diag" });
    const cancelAdapter = makeFakeCodexAdapter({ cancelled: true, reasonCode: "CANCELLED" });
    const cancelResult = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-cancel-diag",
      codexAdapterImpl: cancelAdapter,
      workspaceModuleImpl: fakeWorkspaceCancel,
    });
    assert.strictEqual(cancelResult.cancelled, true);
    assert.strictEqual(cancelResult.diagnostics.cancelled, true);
    assert.strictEqual(cancelResult.diagnostics.reasonCode, "CANCELLED");
  });

  await check("Korrekturlauf – eine gescheiterte Workspace-Erzeugung liefert diagnostics.reasonCode WORKSPACE_CREATE_FAILED", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ createError: new Error("Quelle fehlt.") });
    const fakeAdapter = makeFakeCodexAdapter();
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["missing.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-ws-fail-diag",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.diagnostics.reasonCode, codexRunner.CODEX_RUNNER_REASON_CODES.WORKSPACE_CREATE_FAILED);
    assert.strictEqual(result.diagnostics.runnerPhase, "WORKSPACE_SETUP");
  });

  await check("Korrekturlauf – eine erkannte Workspace-Manipulation liefert diagnostics.reasonCode WORKSPACE_CHANGED", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-tampered-diag", changedPaths: ["a.js (Inhalt verändert)"] });
    const fakeAdapter = makeFakeCodexAdapter({ ok: true, resultText: "Ergebnis trotz Manipulation." });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-tampered-diag",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.diagnostics.reasonCode, codexRunner.CODEX_RUNNER_REASON_CODES.WORKSPACE_CHANGED);
    assert.strictEqual(result.diagnostics.runnerPhase, "WORKSPACE_INTEGRITY_CHECK");
  });

  await check("Korrekturlauf – eine behauptete verbotene Aktion liefert diagnostics.reasonCode FORBIDDEN_ACTION_CLAIMED", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-forbidden-diag" });
    const fakeAdapter = makeFakeCodexAdapter({ ok: true, resultText: "Ich habe die Datei geändert und gespeichert." });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-forbidden-diag",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.diagnostics.reasonCode, codexRunner.CODEX_RUNNER_REASON_CODES.FORBIDDEN_ACTION_CLAIMED);
    assert.strictEqual(result.diagnostics.runnerPhase, "CONTENT_SAFETY_CHECK");
  });

  await check("ein durch Codex als CANCELLED gemeldeter Lauf wird als cancelled (nicht failed) markiert, Cleanup erfolgt", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-cancel" });
    const fakeAdapter = makeFakeCodexAdapter({ cancelled: true });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-cancel",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.failed, false);
    assert.strictEqual(fakeWorkspace.calls.cleanupCalls.length, 1);
  });

  await check("eine unerwartete Workspace-Veränderung während des Laufs wird als Sicherheitsbefund abgelehnt, trotz technischem Codex-Erfolg", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-tampered", changedPaths: ["a.js (Inhalt verändert)"] });
    const fakeAdapter = makeFakeCodexAdapter({ ok: true, resultText: "Ergebnis trotz Manipulation." });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-tampered",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errorMessage.includes("unerwartet verändert"));
    assert.strictEqual(fakeWorkspace.calls.cleanupCalls.length, 1);
  });

  await check("Phase 7 – 21. eine Codex-Antwort mit behaupteter verbotener Aktion wird trotz technischem Erfolg abgelehnt", async () => {
    const fakeWorkspace = makeFakeWorkspaceModule({ workspaceId: "ws-forbidden" });
    const fakeAdapter = makeFakeCodexAdapter({ ok: true, resultText: "Ich habe die Datei geändert und gespeichert." });
    const result = await codexRunner.runPilotAgentCodexAnalysisTask({
      repoRoot: "/tmp/fake-repo",
      allowedFiles: ["a.js"],
      allowedTools: [],
      forbiddenActions: [],
      taskTitle: "T",
      taskInstructions: "I",
      expectedResultFormat: "F",
      agentKey: "review-agent",
      agentDisplayName: "Review-Agent",
      agentRole: "Rolle",
      pilotRole: "RECHERCHE_ANALYSE",
      pilotRoleLabel: "Recherche/Analyse",
      executionRunId: "run-forbidden",
      codexAdapterImpl: fakeAdapter,
      workspaceModuleImpl: fakeWorkspace,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errorMessage.includes("verbotene Aktion"));
    assert.strictEqual(fakeWorkspace.calls.cleanupCalls.length, 1);
  });

  console.log(`pilot-agent-codex-runner.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("FEHLER:", error);
  process.exitCode = 1;
});
