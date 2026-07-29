"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Service-/Integrationstests für den Codex-Runner-Pfad in
// pilot-agent-execution-service.js: Runner-Auswahl, Freigabe-Token,
// Wahrheitsregel (aiExecuted/fallbackUsed), Ergebnis-/Handoff-Semantik,
// Isolation zwischen Aufträgen, Doppelklick, Migration 22 und
// Unversehrtheit des echten Repositories.
//
// Der reale Codex-CLI-Kindprozess wird NIEMALS gestartet: Verfügbarkeit
// wird über injizierte execFileSyncImpl-Fakes gesteuert
// (execution-codex-adapter.js#detectCodexAvailability), das eigentliche
// Modellergebnis über einen injizierten codexAdapterImpl-Fake
// (pilot-agent-codex-runner.js). Die Workspace-Erzeugung/-Bereinigung
// selbst läuft dabei ECHT gegen dieses Repository (REPO_ROOT) – ein realer,
// aussagekräftiger Nachweis für "kein Repository wurde verändert".
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken, niemals die echte
// Application-Support-Datenbank. Führt niemals eine externe Aktion aus.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");
const healthService = require("./health-reference-work-run-service");
const pilotService = require("./pilot-work-order-service");
const agentExecutionService = require("./pilot-agent-execution-service");
const chainService = require("./pilot-agent-execution-chain-service");
const codexRunnerModule = require("./pilot-agent-codex-runner");
const codexReadOnlyAdapter = require("./execution-codex-adapter-readonly");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "pilot-agent-execution-codex-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function orderInput(overrides = {}) {
  return {
    title: "Testauftrag: Codex-Agentenlauf",
    desiredOutcome: "Nachweis eines echten, isolierten Codex-Agentenlaufs.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis passt zum Auftrag"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart", "Freigabe des finalen Ergebnisses"],
    timeframe: "ohne festes Enddatum",
    ...overrides,
  };
}

function driveOrderToInExecution(db, orderId) {
  pilotService.markReadyForApproval(db, { pilotOrderId: orderId });
  pilotService.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });
  return pilotService.startExecution(db, { pilotOrderId: orderId });
}

const CODEX_PRESET_ID = "codex-analyze-pilot-structure";
const CODEX_PRESET = agentExecutionService.PILOT_AGENT_TASK_PRESETS[CODEX_PRESET_ID];
const LOCAL_PRESET_ID = "analyze-pilot-structure";

const AVAILABLE_AUTHENTICATED_EXEC = (file, args) => {
  if (args.includes("--version")) return "codex-cli 0.999.0-test\n";
  if (args.includes("login")) return "Logged in using ChatGPT\n";
  throw new Error("unbekannt");
};
const NOT_INSTALLED_EXEC = () => {
  throw Object.assign(new Error("command not found"), { code: "ENOENT" });
};
const NOT_AUTHENTICATED_EXEC = (file, args) => {
  if (args.includes("--version")) return "codex-cli 0.999.0-test\n";
  if (args.includes("login")) return "Not logged in.\n";
  throw new Error("unbekannt");
};

function fakeSuccessfulCodexAdapter(resultText, { secretRedactionApplied = false, secretRedactionNotice = null } = {}) {
  const calls = [];
  return {
    calls,
    runCodexReadOnlyAnalysis: async (options) => {
      calls.push(options);
      return { ok: true, cancelled: false, timedOut: false, resultText, secretRedactionApplied, secretRedactionNotice, errors: [] };
    },
  };
}

function fakeFailingCodexAdapter(errorMessage, { codexRawOutput, reasonCode } = {}) {
  const calls = [];
  return {
    calls,
    runCodexReadOnlyAnalysis: async (options) => {
      calls.push(options);
      return {
        ok: false,
        cancelled: false,
        timedOut: false,
        resultText: null,
        errors: [errorMessage],
        reasonCode: reasonCode || "CODEX_PROCESS_EXIT_NONZERO",
        codexRawOutput,
      };
    },
  };
}

// Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): bildet einen
// realistischen fehlgeschlagenen Read-Only-Lauf nach – Exit-Code 1, ein
// Secret in stderr (muss redigiert ankommen) sowie ein bewusst NICHT
// weiterverwendeter Prompt-/Freigabetoken-Kontext (siehe Tests unten, die
// prüfen, dass beides niemals persistiert wird).
function fakeExitCodeOneCodexAdapterWithSecretInStderr() {
  return fakeFailingCodexAdapter(
    "Codex-Prozess endete mit Exit-Code 1. stderr: Fehler beim Zugriff. api_key: [REDACTED] war ungültig.",
    {
      reasonCode: "CODEX_PROCESS_EXIT_NONZERO",
      codexRawOutput: {
        exitCode: 1,
        signal: null,
        stdoutSample: "",
        stderrSample: "Fehler beim Zugriff. api_key: [REDACTED] war ungültig.",
        timedOutAtProcessLevel: false,
      },
    },
  );
}

const REALISTIC_RESULT_TEXT =
  "# Phase-7-Pilotstruktur\n\nBeobachtung 1: Runner-Auswahl ist klar getrennt.\nBeobachtung 2: Migration ist additiv.\n" +
  "Beobachtung 3: Freigabe ist einmalig.\n\nRisiko 1: Abhängigkeit von lokaler Codex-CLI.\nRisiko 2: Antwortgröße begrenzt.\n\n" +
  "Empfehlung: Vor Produktivbetrieb weitere Rollenprompts ergänzen.";

async function startCodexRun(db, {
  pilotOrderId,
  expectedRevision,
  adapter,
  availabilityExec = AVAILABLE_AUTHENTICATED_EXEC,
  skipApproval = false,
  approvalToken,
  requestActorUserId,
  startActorUserId,
  codexApprovalNowProvider,
}) {
  let token = approvalToken;
  if (!skipApproval && token === undefined) {
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId, presetId: CODEX_PRESET_ID, actorUserId: requestActorUserId });
    token = approval.approvalToken;
  }
  return agentExecutionService.startAgentExecutionRun(db, {
    pilotOrderId,
    presetId: CODEX_PRESET_ID,
    expectedRevision,
    approvalToken: token,
    actorUserId: startActorUserId,
    codexApprovalNowProvider,
    codexAvailabilityOptions: { execFileSyncImpl: availabilityExec, forceRefresh: true },
    codexAdapterImpl: adapter,
  });
}

async function run() {
  const { db } = makeIsolatedDb();
  const healthBaselineBefore = JSON.stringify(healthService.getOrCreateCanonicalRun(db));
  const codexAdapterModule = require("./execution-codex-adapter");
  codexAdapterModule.resetCodexAvailabilityCacheForTests();

  const orderA = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag A: Codex-Agentenlauf" }));
  const orderAId = orderA.order.id;
  driveOrderToInExecution(db, orderAId);

  const orderB = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag B: Codex-Agentenlauf" }));
  const orderBId = orderB.order.id;
  driveOrderToInExecution(db, orderBId);

  // -------------------------------------------------------------------
  // 1./22./27./28. Ein vollständiger, erfolgreicher Codex-Lauf.
  // -------------------------------------------------------------------
  let successRun;

  await check("Phase 7 – 1. der Codex-Read-Only-Runner kann über sein eigenes Preset ausgewählt werden", async () => {
    assert.strictEqual(CODEX_PRESET.runnerKind, agentExecutionService.RUNNER_KINDS.CODEX);
    const revision = pilotService.getPilotOrderOverview(db, orderAId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    successRun = await startCodexRun(db, { pilotOrderId: orderAId, expectedRevision: revision, adapter });
    assert.strictEqual(successRun.run.status, "SUCCEEDED");
    assert.strictEqual(successRun.run.requestedRunnerKind, "CODEX_READ_ONLY");
    assert.strictEqual(successRun.run.actualRunnerKind, "CODEX_READ_ONLY");
    assert.strictEqual(successRun.run.runnerId, codexRunnerModule.RUNNER_ID);
    assert.strictEqual(adapter.calls.length, 1, "der Codex-Adapter muss tatsächlich genau einmal aufgerufen worden sein");
  });

  await check("Phase 7 – 22. das aiExecuted-Flag ist bei einem erfolgreichen Codex-Lauf true", () => {
    assert.strictEqual(successRun.run.aiExecuted, true);
  });

  await check("Phase 7 – der Codex-Lauf enthält Modell-/Runner-Bezeichnung sowie Netzwerk-/Freigabemetadaten wahrheitsgemäß", () => {
    assert.strictEqual(successRun.run.modelLabel, "Codex (ChatGPT)");
    assert.strictEqual(successRun.run.runnerVersion, "codex-cli 0.999.0-test");
    assert.strictEqual(successRun.run.networkRequired, true);
    assert.strictEqual(successRun.run.externalAiRequired, true);
    assert.strictEqual(successRun.run.approvalStatus, "GRANTED");
    assert.ok(typeof successRun.run.workspaceId === "string" && successRun.run.workspaceId.length > 0);
  });

  await check("Phase 7 – die tatsächlich verwendete Agentenidentität für den Codex-Lauf ist review-agent (dokumentierte Abweichung von RECHERCHE_ANALYSE -> product-agent)", () => {
    assert.strictEqual(successRun.run.agentKey, "review-agent");
    assert.strictEqual(successRun.run.pilotRole, "RECHERCHE_ANALYSE");
  });

  await check("Phase 7 – 27./28. der Handoff referenziert die executionRunId, der PM-Filter prüft das echte Codex-Ergebnis und lässt es durch", () => {
    assert.ok(successRun.handoff);
    assert.strictEqual(successRun.handoff.executionRunId, successRun.run.id);
    assert.strictEqual(successRun.filterResult.passed, true);
    assert.strictEqual(successRun.run.resultRawText, REALISTIC_RESULT_TEXT);
    assert.strictEqual(successRun.handoff.resultOrRecommendation, REALISTIC_RESULT_TEXT.slice(0, 4000));
  });

  await check("Phase 7 – 24./25. Fallback ist bei einem echten Codex-Erfolg eindeutig als NICHT verwendet gekennzeichnet (kein Fallback-Konzept in Phase 7)", () => {
    assert.strictEqual(successRun.run.fallbackUsed, false);
    assert.strictEqual(successRun.run.fallbackReason, null);
  });

  // Korrektur 2 (unabhängiges Review, Kategorie B) / Sicherheitstest 8.17
  // (Teil 2, API-Ebene): der feste Redaktionshinweis muss vom Runner bis in
  // den über die API sichtbaren Run-View durchgereicht werden.
  await check("Phase 7 – 8.17. der Redaktionshinweis erreicht über den vollständigen Codex-Lauf-Pfad den API-sichtbaren Run-View", async () => {
    const orderRedacted = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Redaktionshinweis" }));
    const orderId = orderRedacted.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter("api_key: [REDACTED]", {
      secretRedactionApplied: true,
      secretRedactionNotice: codexReadOnlyAdapter.SECRET_REDACTION_NOTICE_TEXT,
    });
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter });
    assert.strictEqual(result.run.status, "SUCCEEDED");
    assert.ok(result.run.resultSummary, "resultSummary muss für einen erfolgreichen Codex-Lauf vorhanden sein");
    assert.strictEqual(result.run.resultSummary.secretRedactionApplied, true);
    assert.strictEqual(result.run.resultSummary.secretRedactionNotice, codexReadOnlyAdapter.SECRET_REDACTION_NOTICE_TEXT);

    // Derselbe Hinweis muss auch über die Auftragsübersicht (API-Ebene, wie
    // vom Cockpit konsumiert) sichtbar sein.
    const overview = pilotService.getPilotOrderOverview(db, orderId);
    const runFromOverview = overview.agentExecutionRuns.find((run) => run.id === result.run.id);
    assert.ok(runFromOverview);
    assert.strictEqual(runFromOverview.resultSummary.secretRedactionApplied, true);
    assert.strictEqual(runFromOverview.resultSummary.secretRedactionNotice, codexReadOnlyAdapter.SECRET_REDACTION_NOTICE_TEXT);
  });

  await check("Phase 7 – ohne tatsächliche Redaktion bleibt der Redaktionshinweis leer (kein falscher Alarm)", async () => {
    const orderClean = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex ohne Redaktion" }));
    const orderId = orderClean.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT) });
    assert.strictEqual(result.run.resultSummary.secretRedactionApplied, false);
    assert.strictEqual(result.run.resultSummary.secretRedactionNotice, null);
  });

  await check("Phase 7 – 23. das aiExecuted-Flag bleibt beim lokalen deterministischen Runner weiterhin false (Gegenprobe im selben Testlauf)", async () => {
    const orderLocal = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag Lokal: Gegenprobe aiExecuted" }));
    driveOrderToInExecution(db, orderLocal.order.id);
    const revision = pilotService.getPilotOrderOverview(db, orderLocal.order.id).order.revision;
    const localRun = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderLocal.order.id,
      presetId: LOCAL_PRESET_ID,
      expectedRevision: revision,
    });
    assert.strictEqual(localRun.run.status, "SUCCEEDED");
    assert.strictEqual(localRun.run.aiExecuted, false);
    assert.strictEqual(localRun.run.fallbackUsed, false);
    assert.strictEqual(localRun.run.requestedRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY");
    assert.strictEqual(localRun.run.actualRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY");
  });

  // -------------------------------------------------------------------
  // 16./17. Freigabe-/Verfügbarkeitsgrenzen blockieren VOR dem Codex-Aufruf.
  // -------------------------------------------------------------------

  await check("Phase 7 – 16./17. ohne (oder mit fehlender) Freigabe wird der Codex-Lauf blockiert, BEVOR Codex aufgerufen wird; kein automatischer Freigabeersatz", async () => {
    const orderNoApproval = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: fehlende Freigabe" }));
    const orderId = orderNoApproval.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter, skipApproval: true }),
      (error) => {
        assert.strictEqual(error.name, "PilotAgentExecutionError");
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0, "Codex darf ohne gültige Freigabe niemals aufgerufen werden");
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 0, "ein blockierter Versuch darf keinen Laufdatensatz erzeugen");
  });

  await check("Phase 7 – ein einmal ausgestellter Freigabe-Token ist nach genau einem Verbrauch ungültig (kein Wiederverwenden)", async () => {
    const orderReuse = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Token-Wiederverwendung" }));
    const orderId = orderReuse.order.id;
    driveOrderToInExecution(db, orderId);
    let revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });
    const adapter1 = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    const firstRun = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: adapter1, approvalToken: approval.approvalToken });
    assert.strictEqual(firstRun.run.status, "SUCCEEDED");

    revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter2 = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: adapter2, approvalToken: approval.approvalToken }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        return true;
      },
    );
    assert.strictEqual(adapter2.calls.length, 0);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf vor dem echten Referenzlauf (unabhängiges Review,
  // Kategorie B, Korrekturen 4/5/6) / Sicherheitstest 8.1–8.6: die neuen
  // Bindungen (Nutzer, Revision, Preset) sowie die injizierbare Zeitquelle.
  // -------------------------------------------------------------------

  await check("Phase 7 – 8.1. ein für Auftrag A ausgestellter Freigabe-Token wird für Auftrag B abgewiesen (Cross-Order)", async () => {
    const orderCrossA = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Cross-Order-Token (A)" }));
    const orderCrossB = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Cross-Order-Token (B)" }));
    driveOrderToInExecution(db, orderCrossA.order.id);
    driveOrderToInExecution(db, orderCrossB.order.id);
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderCrossA.order.id, presetId: CODEX_PRESET_ID });
    const revisionB = pilotService.getPilotOrderOverview(db, orderCrossB.order.id).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderCrossB.order.id, expectedRevision: revisionB, adapter, approvalToken: approval.approvalToken }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0, "Codex darf mit einem fremden Auftrags-Token niemals aufgerufen werden");
    // Der Token bleibt für den korrekten, ursprünglichen Auftrag (A)
    // weiterhin gültig – ein Fehlversuch mit falscher Bindung verbraucht
    // ihn nicht (siehe pilot-agent-execution-service.js#consumeCodexRunApproval Kopfkommentar).
    const revisionA = pilotService.getPilotOrderOverview(db, orderCrossA.order.id).order.revision;
    const runA = await startCodexRun(db, {
      pilotOrderId: orderCrossA.order.id,
      expectedRevision: revisionA,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approval.approvalToken,
    });
    assert.strictEqual(runA.run.status, "SUCCEEDED");
  });

  await check("Phase 7 – 8.2. ein von Nutzer A ausgestellter Freigabe-Token wird bei einem Verbrauchsversuch durch Nutzer B abgewiesen (Cross-User)", async () => {
    const orderCrossUser = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Cross-User-Token" }));
    const orderId = orderCrossUser.order.id;
    driveOrderToInExecution(db, orderId);
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID, actorUserId: "user-a" });
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapterAsUserB = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () =>
        startCodexRun(db, {
          pilotOrderId: orderId,
          expectedRevision: revision,
          adapter: adapterAsUserB,
          approvalToken: approval.approvalToken,
          startActorUserId: "user-b",
        }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /TOKEN_USER_MISMATCH|keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapterAsUserB.calls.length, 0, "Codex darf mit dem Token eines fremden Nutzers niemals aufgerufen werden, selbst mit identischen OWNER-Rechten");
    // Selbst OWNER-Rechte auf beiden Seiten ändern daran nichts (die
    // Bindung ist an die konkrete actorUserId geknüpft, nicht an eine
    // Rolle) – der Token bleibt für den tatsächlichen Aussteller (user-a)
    // weiterhin gültig.
    const runAsUserA = await startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approval.approvalToken,
      startActorUserId: "user-a",
    });
    assert.strictEqual(runAsUserA.run.status, "SUCCEEDED");
  });

  await check("Phase 7 – 8.3. ein Freigabe-Token mit veralteter Auftragsrevision wird abgewiesen und dabei kontrolliert invalidiert", async () => {
    const orderStaleRevision = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: veraltete Token-Revision" }));
    const orderId = orderStaleRevision.order.id;
    driveOrderToInExecution(db, orderId);
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });

    // Minimaler, direkter Nachweis "die Auftragsrevision hat sich seit dem
    // Ausstellen des Tokens geändert" – bewusst eine direkte, isolierte
    // DB-Änderung (statt eines vollständigen Statusübergangs-Umwegs), damit
    // ausschließlich die Revisionsbindung selbst geprüft wird, ohne
    // gleichzeitig den Auftragsstatus zu verändern (die Revisionsbindung
    // muss unabhängig vom Status greifen).
    db.prepare("UPDATE pilot_work_orders SET revision = revision + 1 WHERE id = ?").run(orderId);
    const newRevision = pilotService.getPilotOrderOverview(db, orderId).order.revision;

    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: newRevision, adapter, approvalToken: approval.approvalToken }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /TOKEN_REVISION_MISMATCH|keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0);

    // Korrektur 5: bei einer Revisionsabweichung wird der Token kontrolliert
    // invalidiert – ein späterer Versuch (selbst wenn die Revision danach
    // zufällig wieder passen würde) schlägt weiterhin fehl, keine
    // automatische Neuausstellung.
    db.prepare("UPDATE pilot_work_orders SET revision = revision - 1 WHERE id = ?").run(orderId);
    const revertedRevision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapterRetry = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revertedRevision, adapter: adapterRetry, approvalToken: approval.approvalToken }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        return true;
      },
    );
    assert.strictEqual(adapterRetry.calls.length, 0, "ein bei Revisionsabweichung invalidierter Token darf niemals erneut funktionieren");
  });

  await check("Phase 7 – 8.4. ein Freigabe-Token für ein anderes Preset wird abgewiesen (falsches Preset)", () => {
    const record = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderAId, presetId: CODEX_PRESET_ID });
    const outcome = agentExecutionService.consumeCodexRunApproval(record.approvalToken, {
      pilotOrderId: orderAId,
      presetId: "ein-anderes-preset-als-ausgestellt",
      runnerKind: agentExecutionService.RUNNER_KINDS.CODEX,
      currentRevision: pilotService.getPilotOrderOverview(db, orderAId).order.revision,
    });
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, "TOKEN_BINDING_MISMATCH");
    // Der Token bleibt für das TATSÄCHLICH ausgestellte Preset gültig.
    const validOutcome = agentExecutionService.consumeCodexRunApproval(record.approvalToken, {
      pilotOrderId: orderAId,
      presetId: CODEX_PRESET_ID,
      runnerKind: agentExecutionService.RUNNER_KINDS.CODEX,
      currentRevision: pilotService.getPilotOrderOverview(db, orderAId).order.revision,
    });
    assert.strictEqual(validOutcome.ok, true);
  });

  await check("Phase 7 – 8.5. derselbe Freigabe-Token kann bei parallelen Startversuchen höchstens einmal erfolgreich verbraucht werden", async () => {
    const orderParallelSameToken = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: paralleler Doppelverbrauch desselben Tokens" }));
    const orderId = orderParallelSameToken.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });

    const attemptOne = startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approval.approvalToken,
    });
    let attemptTwoError = null;
    const attemptTwo = startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approval.approvalToken,
    }).catch((error) => {
      attemptTwoError = error;
    });

    const results = await Promise.allSettled([attemptOne, attemptTwo]);
    const succeeded = results.filter((entry) => entry.status === "fulfilled" && entry.value && entry.value.run && entry.value.run.status === "SUCCEEDED");
    assert.strictEqual(succeeded.length, 1, "mit demselben Token darf höchstens EIN Startversuch erfolgreich sein");
    assert.ok(attemptTwoError, "der zweite, gleichzeitige Versuch mit demselben Token muss fehlschlagen");
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 1);
  });

  await check("Phase 7 – 8.6. ein abgelaufener Freigabe-Token wird abgewiesen (injizierbare, ausschließlich für Tests bestimmte Zeitquelle)", async () => {
    const orderExpired = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: abgelaufener Freigabe-Token" }));
    const orderId = orderExpired.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const fakeStartMs = 1_000_000_000_000;
    const approval = agentExecutionService.requestCodexRunApproval(db, {
      pilotOrderId: orderId,
      presetId: CODEX_PRESET_ID,
      nowProvider: () => fakeStartMs,
    });
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    // Fünf Minuten (TTL) plus eine Millisekunde später – produktiv bleibt
    // Date.now() unverändert, ausschließlich dieser Testaufruf injiziert
    // eine abweichende Zeitquelle.
    await assert.rejects(
      () =>
        startCodexRun(db, {
          pilotOrderId: orderId,
          expectedRevision: revision,
          adapter,
          approvalToken: approval.approvalToken,
          codexApprovalNowProvider: () => fakeStartMs + 5 * 60 * 1000 + 1,
        }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /TOKEN_EXPIRED|keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0);
  });

  await check("Phase 7 – ein Freigabe-Token kurz VOR Ablauf (innerhalb der TTL) funktioniert weiterhin (Gegenprobe zur Ablauflogik)", async () => {
    const orderNearExpiry = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Freigabe-Token kurz vor Ablauf" }));
    const orderId = orderNearExpiry.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const fakeStartMs = 2_000_000_000_000;
    const approval = agentExecutionService.requestCodexRunApproval(db, {
      pilotOrderId: orderId,
      presetId: CODEX_PRESET_ID,
      nowProvider: () => fakeStartMs,
    });
    const result = await startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approval.approvalToken,
      // Eine Millisekunde VOR dem TTL-Ablauf.
      codexApprovalNowProvider: () => fakeStartMs + 5 * 60 * 1000 - 1,
    });
    assert.strictEqual(result.run.status, "SUCCEEDED");
  });

  await check("Phase 7 – ein Freigabe-Token ist nach einem simulierten Prozessneustart (In-Memory-Zustand geleert) nicht mehr vorhanden", async () => {
    const orderRestart = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Freigabe-Token nach Prozessneustart" }));
    const orderId = orderRestart.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });
    // Simuliert einen Prozessneustart: der Token lebt ausschließlich im
    // RAM dieses Prozesses (siehe Kopfkommentar), niemals auf Platte.
    agentExecutionService.clearCodexApprovalTokensForTests();
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter, approvalToken: approval.approvalToken }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /TOKEN_UNKNOWN|keine gültige, frische Freigabe/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0);
  });

  await check("Phase 7 – 14. nicht installierter/verfügbarer Codex blockiert den Lauf eindeutig, kein Fallback wird als Codex-Erfolg ausgegeben", async () => {
    const orderUnavailable = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex nicht verfügbar" }));
    const orderId = orderUnavailable.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter, availabilityExec: NOT_INSTALLED_EXEC }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /nicht verfügbar/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0);
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 0);
  });

  await check("Phase 7 – 15. verfügbarer, aber nicht authentifizierter Codex blockiert den Lauf eindeutig", async () => {
    const orderNotAuth = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex nicht authentifiziert" }));
    const orderId = orderNotAuth.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);
    await assert.rejects(
      () => startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter, availabilityExec: NOT_AUTHENTICATED_EXEC }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /nicht authentifiziert/);
        return true;
      },
    );
    assert.strictEqual(adapter.calls.length, 0);
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 0);
  });

  // -------------------------------------------------------------------
  // 29./30. Codex-Fehler/Audit-Fehler erzeugen keinen Handoff bzw. keinen
  // falschen Erfolg.
  // -------------------------------------------------------------------

  await check("Phase 7 – 29. ein technischer Codex-Fehler erzeugt KEIN Handoff und wird ehrlich als FAILED gespeichert", async () => {
    const orderFail = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Fehler" }));
    const orderId = orderFail.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeFailingCodexAdapter("Codex-Prozess beendete mit einem Fehler.");
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter });
    assert.strictEqual(result.run.status, "FAILED");
    assert.strictEqual(result.run.aiExecuted, false);
    assert.strictEqual(result.handoff, null);
    assert.strictEqual(pilotService.getPilotOrderOverview(db, orderId).handoffs.length, 0);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): die zwei
  // echten Referenzläufe scheiterten mit exitCode 1 und ausschließlich dem
  // technischen Fehlertext "Codex-Prozess beendete mit Status 1." – die
  // eigentlichen, bereits im Read-Only-Adapter erzeugten Diagnosefelder
  // wurden im Fehlerpfad verworfen. Diese Tests decken die verbindliche
  // Umsetzung (Auftrag Abschnitte 1-4) ab.
  // -------------------------------------------------------------------

  let diagnosticFailRun;
  let diagnosticFailOrderId;

  await check("Korrekturlauf – 1./2./4. Exit-Code 1 bleibt dauerhaft sichtbar gespeichert, stderr-Secret wird redigiert", async () => {
    const orderDiag = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Fehlerdiagnose" }));
    diagnosticFailOrderId = orderDiag.order.id;
    driveOrderToInExecution(db, diagnosticFailOrderId);
    const revision = pilotService.getPilotOrderOverview(db, diagnosticFailOrderId).order.revision;
    const adapter = fakeExitCodeOneCodexAdapterWithSecretInStderr();
    diagnosticFailRun = await startCodexRun(db, { pilotOrderId: diagnosticFailOrderId, expectedRevision: revision, adapter });
    assert.strictEqual(diagnosticFailRun.run.status, "FAILED");
    assert.ok(diagnosticFailRun.run.errorMessage.includes("Exit-Code 1"), "der Exit-Code muss im sichtbaren Fehlertext stehen");
    assert.ok(diagnosticFailRun.run.resultSummary, "resultSummary muss auch für einen fehlgeschlagenen Codex-Lauf gesetzt sein");
    assert.strictEqual(diagnosticFailRun.run.resultSummary.diagnostics.exitCode, 1);
    assert.strictEqual(diagnosticFailRun.run.resultSummary.diagnostics.reasonCode, "CODEX_PROCESS_EXIT_NONZERO");
    // Das Secret selbst darf an keiner Stelle auftauchen (weder im
    // Fließtext noch in der strukturierten Diagnosekopie) – nur der bereits
    // redigierte Platzhalter.
    assert.ok(!diagnosticFailRun.run.errorMessage.includes("sk-"));
    assert.ok(!JSON.stringify(diagnosticFailRun.run.resultSummary).includes("sk-"));
    assert.ok(diagnosticFailRun.run.resultSummary.diagnostics.stderrSample.includes("[REDACTED]"));
  });

  await check("Korrekturlauf – 3. stdoutSample wird nicht unnötig gespeichert (leer, da stderr bereits die Ursache liefert)", () => {
    assert.strictEqual(diagnosticFailRun.run.resultSummary.diagnostics.stdoutSample, null);
  });

  await check("Korrekturlauf – 5. Signal wird gespeichert, falls vorhanden", async () => {
    const orderSignal = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Signal" }));
    const orderId = orderSignal.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeFailingCodexAdapter("Codex-Lauf wurde durch Timeout beendet.", {
      reasonCode: "TIMEOUT",
      codexRawOutput: { exitCode: null, signal: "SIGTERM", stdoutSample: "", stderrSample: "", timedOutAtProcessLevel: true },
    });
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter });
    assert.strictEqual(result.run.resultSummary.diagnostics.signal, "SIGTERM");
  });

  await check("Korrekturlauf – 6. Timeout bleibt über den vollständigen Service-Pfad eindeutig erkennbar (top-level timedOut UND diagnostics.timedOut)", async () => {
    const orderTimeout = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Timeout" }));
    const orderId = orderTimeout.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const calls = [];
    const timeoutAdapter = {
      calls,
      runCodexReadOnlyAnalysis: async (options) => {
        calls.push(options);
        return {
          ok: false,
          cancelled: false,
          timedOut: true,
          resultText: null,
          errors: ["TIMEOUT"],
          reasonCode: "TIMEOUT",
          codexRawOutput: { exitCode: null, signal: null, stdoutSample: "", stderrSample: "", timedOutAtProcessLevel: true },
        };
      },
    };
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: timeoutAdapter });
    assert.strictEqual(result.run.status, "FAILED");
    assert.strictEqual(result.run.timedOut, true);
    assert.strictEqual(result.run.resultSummary.diagnostics.timedOut, true);
    assert.strictEqual(result.run.resultSummary.diagnostics.reasonCode, "TIMEOUT");
  });

  await check("Korrekturlauf – 7. Cancel bleibt über den vollständigen Service-Pfad eindeutig erkennbar (top-level cancelledRun UND diagnostics.cancelled)", async () => {
    const orderCancel = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Cancel" }));
    const orderId = orderCancel.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const cancelAdapter = {
      runCodexReadOnlyAnalysis: async () => ({
        ok: false,
        cancelled: true,
        timedOut: false,
        resultText: null,
        errors: ["CANCELLED"],
        reasonCode: "CANCELLED",
        codexRawOutput: { exitCode: 0, signal: null, stdoutSample: "", stderrSample: "", timedOutAtProcessLevel: false },
      }),
    };
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: cancelAdapter });
    assert.strictEqual(result.run.status, "FAILED");
    assert.strictEqual(result.run.cancelledRun, true);
    assert.strictEqual(result.run.resultSummary.diagnostics.cancelled, true);
    assert.strictEqual(result.run.resultSummary.diagnostics.reasonCode, "CANCELLED");
  });

  await check("Korrekturlauf – 10./11. weder Prompttext noch Freigabetoken werden bei einem fehlgeschlagenen Codex-Lauf persistiert", async () => {
    const orderNoLeak = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex kein Prompt-/Token-Leak" }));
    const orderId = orderNoLeak.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });
    const adapter = fakeExitCodeOneCodexAdapterWithSecretInStderr();
    const result = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderId,
      presetId: CODEX_PRESET_ID,
      expectedRevision: revision,
      approvalToken: approval.approvalToken,
      codexAvailabilityOptions: { execFileSyncImpl: AVAILABLE_AUTHENTICATED_EXEC, forceRefresh: true },
      codexAdapterImpl: adapter,
    });
    assert.strictEqual(result.run.status, "FAILED");
    const persistedText = JSON.stringify(result.run);
    // Der tatsächliche, an Codex gesendete Prompt enthält u. a. den Auftragstitel.
    const sentPrompt = adapter.calls[0].prompt;
    assert.ok(sentPrompt.includes(CODEX_PRESET.title));
    assert.ok(!persistedText.includes(sentPrompt), "der vollständige, an Codex gesendete Prompt darf nicht persistiert werden");
    assert.ok(!persistedText.includes(approval.approvalToken), "der Freigabe-Token darf nicht persistiert werden");
  });

  await check("Korrekturlauf – 12. das Audit-Ereignis eines fehlgeschlagenen Codex-Laufs enthält keine Roh-stderr/stdout-Daten, nur sichere Kategoriewerte", async () => {
    const orderAudit = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Audit-Diagnose" }));
    const orderId = orderAudit.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeExitCodeOneCodexAdapterWithSecretInStderr();
    await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter });
    const auditEvents = authAudit.listAuditEventsByType(db, "PILOT_AGENT_EXECUTION_RUN_FAILED");
    const relevantEvent = auditEvents.find((event) => {
      const metadata = event.metadata ? JSON.parse(event.metadata) : {};
      return metadata.pilotOrderId === orderId;
    });
    assert.ok(relevantEvent, "es muss genau ein PILOT_AGENT_EXECUTION_RUN_FAILED-Audit-Ereignis für diesen Auftrag geben");
    const metadata = JSON.parse(relevantEvent.metadata);
    assert.strictEqual(metadata.runnerKind, "CODEX_READ_ONLY");
    assert.strictEqual(metadata.exitCode, 1);
    assert.strictEqual(metadata.reasonCode, "CODEX_PROCESS_EXIT_NONZERO");
    assert.strictEqual(metadata.timedOut, false);
    assert.strictEqual(metadata.cancelled, false);
    assert.ok(!("stderrSample" in metadata), "Audit darf keine stderrSample enthalten");
    assert.ok(!("stdoutSample" in metadata), "Audit darf keine stdoutSample enthalten");
    assert.ok(!JSON.stringify(metadata).includes("Fehler beim Zugriff"), "Audit darf keinen stderr-Ausschnitt enthalten");
  });

  await check("Korrekturlauf – 8./9. die Fehlerdiagnose eines fehlgeschlagenen Codex-Laufs ist über denselben View sichtbar, den API und Cockpit konsumieren (getAgentExecutionRunById/Overview)", async () => {
    const byId = agentExecutionService.getAgentExecutionRunById(db, diagnosticFailOrderId, diagnosticFailRun.run.id);
    assert.strictEqual(byId.resultSummary.diagnostics.exitCode, 1);
    assert.strictEqual(byId.resultSummary.diagnosticNotice, "Sichere technische Diagnose – möglicherweise gekürzt und redigiert.");
    const overview = pilotService.getPilotOrderOverview(db, diagnosticFailOrderId);
    const runFromOverview = overview.agentExecutionRuns.find((run) => run.id === diagnosticFailRun.run.id);
    assert.ok(runFromOverview);
    assert.strictEqual(runFromOverview.resultSummary.diagnostics.exitCode, 1);
  });

  await check("Korrekturlauf – 15. ein bereits bestehender fehlgeschlagener Lauf ohne Diagnosefelder (z. B. vor diesem Korrekturlauf gespeichert) bleibt vollständig lesbar", async () => {
    const orderLegacy = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: bestehender Altlauf ohne Diagnose" }));
    const orderId = orderLegacy.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    // Simuliert exakt den bisherigen, verlustbehafteten Zustand: ein
    // fehlgeschlagener Lauf, dessen Terminalzeile OHNE resultSummaryJson
    // geschrieben wurde (wie es vor diesem Korrekturlauf für JEDEN
    // Codex-Fehler der Fall war).
    const runRow = authDb.insertPilotAgentExecutionRunAsRunning(db, {
      id: `pilot-agent-run-legacy-${crypto.randomUUID()}`,
      pilotOrderId: orderId,
      pilotOrderRevisionAtStart: revision,
      presetId: CODEX_PRESET_ID,
      pilotRole: "RECHERCHE_ANALYSE",
      agentKey: "review-agent",
      taskTitle: CODEX_PRESET.title,
      taskInstructions: CODEX_PRESET.instructions,
      allowedFilesJson: JSON.stringify(CODEX_PRESET.allowedFiles),
      allowedToolsJson: JSON.stringify(CODEX_PRESET.allowedTools),
      forbiddenActionsJson: JSON.stringify(CODEX_PRESET.forbiddenActions),
      expectedResultFormat: CODEX_PRESET.expectedResultFormat,
      runnerId: codexRunnerModule.RUNNER_ID,
      runnerLabel: codexRunnerModule.RUNNER_LABEL,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      requestedRunnerKind: "CODEX_READ_ONLY",
      actualRunnerKind: "CODEX_READ_ONLY",
      approvalStatus: "GRANTED",
    });
    authDb.updatePilotAgentExecutionRunTerminal(db, {
      id: runRow.id,
      status: "FAILED",
      finishedAt: new Date().toISOString(),
      errorMessage: "Codex-Prozess beendete mit Status 1.",
    });
    const reread = agentExecutionService.getAgentExecutionRunById(db, orderId, runRow.id);
    assert.strictEqual(reread.status, "FAILED");
    assert.strictEqual(reread.errorMessage, "Codex-Prozess beendete mit Status 1.");
    assert.strictEqual(reread.resultSummary, null, "ein Altlauf ohne Diagnose bleibt ehrlich ohne resultSummary lesbar, statt abzustürzen");
  });

  await check("Phase 7 – 30. ein Audit-Fehler beim Abschluss eines Codex-Laufs führt zu einem sicheren, eindeutigen Fehlerzustand (kein vorgetäuschter Erfolg)", async () => {
    const orderAuditFail = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Audit-Fehler" }));
    const orderId = orderAuditFail.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const adapter = fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT);

    const originalRecordAuditEvent = authAudit.recordAuditEvent;
    authAudit.recordAuditEvent = (dbArg, input) => {
      if (input && input.eventType === "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED") {
        throw new Error("Simulierter Audit-Schreibfehler (kontrolliertes Testdoppel).");
      }
      return originalRecordAuditEvent(dbArg, input);
    };
    let thrown = null;
    try {
      await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter });
    } catch (error) {
      thrown = error;
    } finally {
      authAudit.recordAuditEvent = originalRecordAuditEvent;
    }
    assert.ok(thrown, "ein Audit-Fehler beim Abschluss muss sichtbar durchschlagen, niemals als stiller Erfolg verschluckt werden");
    const runs = agentExecutionService.listAgentExecutionRunsForOrder(db, orderId);
    assert.strictEqual(runs.length, 1);
    assert.notStrictEqual(runs[0].status, "SUCCEEDED", "kein Lauf darf trotz gescheitertem Erfolgs-Audit als SUCCEEDED markiert bleiben");
  });

  // -------------------------------------------------------------------
  // 26./31. Auftragsänderung während des Runs / Handoff-Konflikt: das
  // technische Codex-Ergebnis bleibt vollständig erhalten.
  // -------------------------------------------------------------------

  await check("Phase 7 – 26./31. eine Auftragsänderung während eines laufenden Codex-Runs vernichtet das bereits erfolgreiche Ergebnis nicht (Handoff-Konflikt getrennt sichtbar)", async () => {
    const orderConflict = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Handoff-Konflikt" }));
    const orderId = orderConflict.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approval = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });

    const originalRunTask = codexRunnerModule.runPilotAgentCodexAnalysisTask;
    codexRunnerModule.runPilotAgentCodexAnalysisTask = async (input) => {
      pilotService.blockOrder(db, { pilotOrderId: orderId, reason: "Kontrollierter Test: Auftragsänderung während eines laufenden Codex-Laufs." });
      return originalRunTask(input);
    };
    let conflictResult;
    try {
      conflictResult = await agentExecutionService.startAgentExecutionRun(db, {
        pilotOrderId: orderId,
        presetId: CODEX_PRESET_ID,
        expectedRevision: revision,
        approvalToken: approval.approvalToken,
        codexAvailabilityOptions: { execFileSyncImpl: AVAILABLE_AUTHENTICATED_EXEC, forceRefresh: true },
        codexAdapterImpl: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      });
    } finally {
      codexRunnerModule.runPilotAgentCodexAnalysisTask = originalRunTask;
    }
    assert.strictEqual(conflictResult.run.status, "SUCCEEDED", "der technische Codex-Erfolg darf durch den späteren Handoff-Konflikt nicht als FAILED behandelt werden");
    assert.strictEqual(conflictResult.run.resultRawText, REALISTIC_RESULT_TEXT);
    assert.strictEqual(conflictResult.handoff, null);
    assert.strictEqual(conflictResult.run.handoffStatus, "FAILED");
    assert.match(conflictResult.run.handoffErrorMessage, /IN_EXECUTION/);
    assert.strictEqual(pilotService.getPilotOrderOverview(db, orderId).status, "BLOCKED");
  });

  // -------------------------------------------------------------------
  // 32. Doppelklick: höchstens ein aktiver Codex-Lauf pro Auftrag.
  // -------------------------------------------------------------------

  await check("Phase 7 – 32. ein zweiter, gleichzeitiger Codex-Startversuch (Doppelklick) erzeugt keinen zweiten aktiven Lauf", async () => {
    const orderDouble = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Codex-Doppelklick" }));
    const orderId = orderDouble.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const approvalOne = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });
    const approvalTwo = agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: CODEX_PRESET_ID });

    const firstAttempt = startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approvalOne.approvalToken,
    });
    let secondError = null;
    const secondAttempt = startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
      approvalToken: approvalTwo.approvalToken,
    }).catch((error) => {
      secondError = error;
    });

    const firstResult = await firstAttempt;
    await secondAttempt;

    assert.ok(secondError, "der zweite, gleichzeitig ausgelöste Codex-Start muss abgelehnt werden");
    assert.strictEqual(secondError.statusCode, 409);
    assert.strictEqual(firstResult.run.status, "SUCCEEDED");
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 1);
  });

  // -------------------------------------------------------------------
  // 33. Auftrag A und B bleiben isoliert (Codex).
  // -------------------------------------------------------------------

  await check("Phase 7 – 33. ein Codex-Lauf für Auftrag B ist vollständig unabhängig von Auftrag A", async () => {
    const revisionB = pilotService.getPilotOrderOverview(db, orderBId).order.revision;
    const runsAOnBefore = agentExecutionService.listAgentExecutionRunsForOrder(db, orderAId).length;
    const runB = await startCodexRun(db, {
      pilotOrderId: orderBId,
      expectedRevision: revisionB,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
    });
    assert.strictEqual(runB.run.status, "SUCCEEDED");
    assert.strictEqual(runB.run.pilotOrderId, orderBId);
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderAId).length, runsAOnBefore, "Auftrag A darf durch den Lauf von B nicht verändert werden");
  });

  // -------------------------------------------------------------------
  // 36. Repository bleibt unverändert – echte Workspace-Isolation gegen
  // REPO_ROOT, nur der Modellaufruf selbst ist gefaked.
  // -------------------------------------------------------------------

  await check("Phase 7 – 36. keine der im Codex-Preset erlaubten Repository-Dateien wurde durch den (isolierten, echten Workspace-) Lauf verändert", async () => {
    const hashesBefore = CODEX_PRESET.allowedFiles.map((relativePath) => {
      const absolute = path.join(agentExecutionService.REPO_ROOT, relativePath);
      return { relativePath, sha256: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex") };
    });

    const orderRepoCheck = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Repository-Unversehrtheit" }));
    const orderId = orderRepoCheck.order.id;
    driveOrderToInExecution(db, orderId);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    // Bewusst OHNE workspaceModuleImpl/execFileImpl-Fake: die
    // Workspace-Erzeugung/-Bereinigung läuft ECHT gegen REPO_ROOT, nur die
    // Codex-Modellantwort selbst ist gefaked (siehe Kopfkommentar).
    const result = await startCodexRun(db, {
      pilotOrderId: orderId,
      expectedRevision: revision,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
    });
    assert.strictEqual(result.run.status, "SUCCEEDED");
    assert.ok(result.run.workspaceId);

    hashesBefore.forEach(({ relativePath, sha256 }) => {
      const absolute = path.join(agentExecutionService.REPO_ROOT, relativePath);
      const afterHash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
      assert.strictEqual(afterHash, sha256, `Repository-Datei "${relativePath}" darf durch den Codex-Lauf nicht verändert werden`);
    });
  });

  // -------------------------------------------------------------------
  // 42./43. Migration 22 funktioniert additiv auf neuer UND bestehender
  // Datenbank.
  // -------------------------------------------------------------------

  await check("Phase 7 – 42. eine neue Testdatenbank erhält Migration 22 (Runner-/KI-/Freigabemetadaten von Anfang an)", () => {
    const { db: freshDb } = makeIsolatedDb("pilot-agent-execution-codex-migration-new-");
    assert.ok(migrations.getAppliedVersions(freshDb).includes(22));
    const columns = freshDb.prepare("PRAGMA table_info(pilot_agent_execution_runs)").all().map((c) => c.name);
    [
      "requestedRunnerKind",
      "actualRunnerKind",
      "runnerVersion",
      "modelLabel",
      "aiExecuted",
      "fallbackUsed",
      "fallbackReason",
      "networkRequired",
      "externalAiRequired",
      "approvalStatus",
      "workspaceId",
      "timedOut",
      "cancelledRun",
    ].forEach((column) => assert.ok(columns.includes(column), `Migration 22: Spalte "${column}" fehlt`));
  });

  await check("Phase 7 – 43. Migration 22 ist auf einer bereits bestehenden Phase-6-Datenbank nachrüstbar und liefert für bereits bestehende Läufe ehrliche Ausgangswerte", async () => {
    const { db: existingDb } = makeIsolatedDb("pilot-agent-execution-codex-migration-existing-");
    const preOrder = pilotService.createPilotOrder(existingDb, orderInput({ title: "Bestehender Auftrag vor Migration 22" }));
    const preOrderId = preOrder.order.id;
    driveOrderToInExecution(existingDb, preOrderId);
    const revision = pilotService.getPilotOrderOverview(existingDb, preOrderId).order.revision;
    const preMigrationRun = await agentExecutionService.startAgentExecutionRun(existingDb, {
      pilotOrderId: preOrderId,
      presetId: LOCAL_PRESET_ID,
      expectedRevision: revision,
    });
    assert.strictEqual(preMigrationRun.run.status, "SUCCEEDED");

    [
      "requestedRunnerKind",
      "actualRunnerKind",
      "runnerVersion",
      "modelLabel",
      "aiExecuted",
      "fallbackUsed",
      "fallbackReason",
      "networkRequired",
      "externalAiRequired",
      "approvalStatus",
      "workspaceId",
      "timedOut",
      "cancelledRun",
    ].forEach((column) => existingDb.exec(`ALTER TABLE pilot_agent_execution_runs DROP COLUMN ${column}`));
    existingDb.prepare("DELETE FROM schema_migrations WHERE version = ?").run(22);
    assert.ok(!migrations.getAppliedVersions(existingDb).includes(22));

    const result = migrations.runMigrations(existingDb);
    assert.deepStrictEqual(result.appliedNow, [22]);
    assert.ok(migrations.getAppliedVersions(existingDb).includes(22));

    const reread = agentExecutionService.getAgentExecutionRunById(existingDb, preOrderId, preMigrationRun.run.id);
    assert.strictEqual(reread.status, "SUCCEEDED", "der bereits bestehende Runstatus bleibt unverändert");
    assert.strictEqual(reread.resultRawText, preMigrationRun.run.resultRawText);
    assert.strictEqual(reread.requestedRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY", "additive Migration: ehrlicher Ausgangswert für bereits bestehende, lokale Läufe");
    assert.strictEqual(reread.actualRunnerKind, "LOCAL_DETERMINISTIC_READ_ONLY");
    assert.strictEqual(reread.aiExecuted, false);
    assert.strictEqual(reread.fallbackUsed, false);
    assert.strictEqual(reread.networkRequired, false);
    assert.strictEqual(reread.externalAiRequired, false);
    assert.strictEqual(reread.approvalStatus, "NOT_REQUIRED");

    // Nach der Nachrüstung funktioniert auch ein echter Codex-Lauf normal.
    const revisionAfter = pilotService.getPilotOrderOverview(existingDb, preOrderId).order.revision;
    const postMigrationCodexRun = await startCodexRun(existingDb, {
      pilotOrderId: preOrderId,
      expectedRevision: revisionAfter,
      adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
    });
    assert.strictEqual(postMigrationCodexRun.run.status, "SUCCEEDED");
    assert.strictEqual(postMigrationCodexRun.run.aiExecuted, true);
  });

  // -------------------------------------------------------------------
  // V7.7.0 Korrektur 2 ("chainManaged-Presets nur über Chain-Service
  // erlauben", unabhängiges Opus-Review, Blocker 2).
  // -------------------------------------------------------------------
  const CHAIN_PRESET_IDS = ["codex-chain-research-analysis", "codex-document-chain-result", "codex-pm-evaluate-chain"];

  await check("V7.7.0/1.-3. jedes der drei Kettenpresets kann NICHT über die normale Einzellauf-requestCodexRunApproval gestartet werden", () => {
    const orderChainIso = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Kettenpreset-Isolation (Freigabe)" }));
    const orderId = orderChainIso.order.id;
    driveOrderToInExecution(db, orderId);
    CHAIN_PRESET_IDS.forEach((presetId) => {
      assert.ok(agentExecutionService.PILOT_AGENT_TASK_PRESETS[presetId].chainManaged, `${presetId} muss chainManaged: true besitzen`);
      assert.throws(
        () => agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId }),
        (error) => {
          assert.strictEqual(error.statusCode, 400);
          assert.match(error.message, /ausschließlich durch die Ketten-Serviceschicht verwaltet/);
          return true;
        },
        `${presetId} darf keine Freigabe über die normale Einzellauf-API erhalten`,
      );
    });
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 0, "kein verwaister Lauf darf entstanden sein");
  });

  await check("V7.7.0/1.-3. jedes der drei Kettenpresets kann NICHT über die normale Einzellauf-startAgentExecutionRun gestartet werden (auch ohne vorherige Freigabe)", async () => {
    const orderChainIso = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Kettenpreset-Isolation (Start)" }));
    const orderId = orderChainIso.order.id;
    driveOrderToInExecution(db, orderId);
    for (const presetId of CHAIN_PRESET_IDS) {
      await assert.rejects(
        () =>
          agentExecutionService.startAgentExecutionRun(db, {
            pilotOrderId: orderId,
            presetId,
            approvalToken: "beliebiger-nicht-existenter-token",
            codexAvailabilityOptions: { execFileSyncImpl: AVAILABLE_AUTHENTICATED_EXEC, forceRefresh: true },
            codexAdapterImpl: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT),
          }),
        (error) => {
          assert.strictEqual(error.statusCode, 400);
          assert.match(error.message, /ausschließlich durch die Ketten-Serviceschicht verwaltet/);
          return true;
        },
        `${presetId} darf über startAgentExecutionRun nicht direkt gestartet werden`,
      );
    }
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderId).length, 0, "kein verwaister, als chainManaged markierter Lauf darf entstanden sein");
  });

  await check("V7.7.0/4./10. ein normales (nicht chainManaged) Phase-7-Preset bleibt über die Einzellauf-API unverändert startbar", async () => {
    const orderNormal = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: normales Preset bleibt startbar" }));
    const orderId = orderNormal.order.id;
    driveOrderToInExecution(db, orderId);
    assert.strictEqual(agentExecutionService.PILOT_AGENT_TASK_PRESETS[CODEX_PRESET_ID].chainManaged, undefined);
    const revision = pilotService.getPilotOrderOverview(db, orderId).order.revision;
    const result = await startCodexRun(db, { pilotOrderId: orderId, expectedRevision: revision, adapter: fakeSuccessfulCodexAdapter(REALISTIC_RESULT_TEXT) });
    assert.strictEqual(result.run.status, "SUCCEEDED");
  });

  await check("V7.7.0/6. ein HTTP-artiger Aufruf kann die interne Kennzeichnung nicht erraten oder nachbauen (String/Boolean statt Symbol)", () => {
    const orderChainIso = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: interne Kennzeichnung nicht faelschbar" }));
    const orderId = orderChainIso.order.id;
    driveOrderToInExecution(db, orderId);
    // Simuliert die realistischsten Fälschungsversuche eines HTTP-Clients:
    // ein aus JSON stammendes Feld kann niemals ein echtes Symbol sein,
    // ausschließlich String/Boolean/Objekt-Literale sind über JSON möglich.
    const forgeryAttempts = [
      { __chainInternalBridge: "CHAIN_INTERNAL_BRIDGE_CAPABILITY" },
      { __chainInternalBridge: true },
      { __chainInternalBridge: Symbol("pilot-agent-execution-chain-internal-bridge") },
      { chainInternal: true },
      { isChainInternalBridge: true },
    ];
    forgeryAttempts.forEach((forgedOptions) => {
      assert.throws(
        () => agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderId, presetId: "codex-chain-research-analysis", ...forgedOptions }),
        /ausschließlich durch die Ketten-Serviceschicht verwaltet/,
        `Fälschungsversuch ${JSON.stringify(Object.keys(forgedOptions))} darf nicht funktionieren`,
      );
    });
  });

  await check("V7.7.0/5. der Chain-Service kann jedes der drei Kettenpresets tatsächlich intern starten (Gegenprobe zur Sperre oben)", () => {
    // Reines Gegenprobe: die internen ...ForChainInternal-Einstiegspunkte
    // existieren und geben tatsächlich einen Freigabe-Token zurück (der
    // eigentliche End-zu-End-Nachweis über den vollständigen Kettenablauf
    // läuft bereits in pilot-agent-execution-chain.test.js/-api.test.js).
    const orderForChain = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: interner Chain-Start funktioniert" }));
    driveOrderToInExecution(db, orderForChain.order.id);
    const innerApproval = agentExecutionService.requestCodexRunApprovalForChainInternal(db, {
      pilotOrderId: orderForChain.order.id,
      presetId: "codex-chain-research-analysis",
    });
    assert.ok(typeof innerApproval.approvalToken === "string" && innerApproval.approvalToken.length > 0);
  });

  await check("V7.7.0/7./8. Audit unterscheidet Jamal-Kettenfreigabe (normale Weitergabe) von interner technischer Weitergabe; niemals Token/Prompt/Ergebnis im Audit", () => {
    const orderAuditNormal = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Audit normale Freigabe" }));
    driveOrderToInExecution(db, orderAuditNormal.order.id);
    agentExecutionService.requestCodexRunApproval(db, { pilotOrderId: orderAuditNormal.order.id, presetId: CODEX_PRESET_ID, actorUserId: "owner-1" });
    const normalEvents = authDb
      .listAuditEvents(db)
      .filter((e) => e.eventType === "PILOT_AGENT_EXECUTION_CODEX_APPROVAL_REQUESTED" && JSON.parse(e.metadata || "{}").pilotOrderId === orderAuditNormal.order.id);
    assert.strictEqual(normalEvents.length, 1);
    const normalMetadata = JSON.parse(normalEvents[0].metadata);
    assert.strictEqual(normalMetadata.approvalSource, undefined, "eine normale Freigabe darf NICHT als CHAIN_INTERNAL_BRIDGE markiert sein");

    const orderAuditChain = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag: Audit interne Weitergabe" }));
    driveOrderToInExecution(db, orderAuditChain.order.id);
    agentExecutionService.requestCodexRunApprovalForChainInternal(db, {
      pilotOrderId: orderAuditChain.order.id,
      presetId: "codex-chain-research-analysis",
      actorUserId: "owner-1",
    });
    const chainEvents = authDb
      .listAuditEvents(db)
      .filter((e) => e.eventType === "PILOT_AGENT_EXECUTION_CODEX_APPROVAL_REQUESTED" && JSON.parse(e.metadata || "{}").pilotOrderId === orderAuditChain.order.id);
    assert.strictEqual(chainEvents.length, 1);
    const chainMetadata = JSON.parse(chainEvents[0].metadata);
    assert.strictEqual(chainMetadata.approvalSource, "CHAIN_INTERNAL_BRIDGE", "die interne Weitergabe muss eindeutig als solche markiert sein, niemals als zweite Jamal-Freigabe");

    // Kein Token, Prompt oder Ergebnistext in irgendeinem der beiden Audit-Metadatenobjekte.
    [normalMetadata, chainMetadata].forEach((metadata) => {
      const serialized = JSON.stringify(metadata);
      assert.ok(!/[0-9a-f]{48}/i.test(serialized), "Audit-Metadaten dürfen keinen tokenartigen Hex-String enthalten");
      assert.ok(!serialized.toLowerCase().includes("prompt"));
      assert.ok(!serialized.toLowerCase().includes("resulttext"));
    });
  });

  await check("V7.7.0/9. kein Kettenlauf ohne chainId: chainService.startStep/requestStepApproval verlangen zwingend eine gültige chainId", async () => {
    assert.throws(() => chainService.requestStepApproval(db, { chainStep: 1, actorUserId: "owner-1" }), /chainId fehlt oder ist ungültig/);
    assert.throws(() => chainService.requestStepApproval(db, { chainId: "", chainStep: 1, actorUserId: "owner-1" }), /chainId fehlt oder ist ungültig/);
    await assert.rejects(
      () => chainService.startStep(db, { chainStep: 1, actorUserId: "owner-1", approvalToken: "x" }),
      /chainId fehlt oder ist ungültig/,
    );
  });

  // -------------------------------------------------------------------
  // 45. Health-Referenzdaten bleiben unverändert.
  // -------------------------------------------------------------------

  await check("Phase 7 – 45. Health-Referenzdaten bleiben durch sämtliche Codex-Agentenlauf-Operationen dieses Testmoduls unverändert", () => {
    const healthAfter = JSON.stringify(healthService.getOrCreateCanonicalRun(db));
    assert.strictEqual(healthAfter, healthBaselineBefore);
  });

  console.log(`pilot-agent-execution-codex.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("FEHLER:", error);
  process.exitCode = 1;
});
