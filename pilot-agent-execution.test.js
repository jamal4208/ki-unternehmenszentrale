"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 6 ("technische
// Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner").
//
// Fachlogik-/Persistenztests für pilot-agent-execution-service.js und
// pilot-agent-runner.js – unabhängig von HTTP (siehe
// pilot-agent-execution-api.test.js für die HTTP-/Zugriffsschicht).
//
// Anders als ein reiner Datenbanktest schreibt dieses Modul KEIN statisches
// Beispiel-Ergebnisobjekt direkt in die Datenbank: jeder "echte Lauf"-Test
// ruft tatsächlich agentExecutionService.startAgentExecutionRun(...) auf,
// welches wiederum den echten Runner (pilot-agent-runner.js) aufruft, der
// wiederum tatsächlich vorhandene Projektdateien read-only vom Datenträger
// liest und daraus ein inhaltsabhängiges Ergebnis berechnet (siehe Test
// "35."). Für die gezielte Prüfung von Fehler-/Rollback-Pfaden (Tests
// "15./16.") wird ausschließlich der Runner- bzw. Audit-Aufruf punktuell
// durch einen Test-Doppel ersetzt (Monkey-Patch auf dem bereits geladenen,
// von Node gecachten Modul) – niemals der komplette Ablauf simuliert.
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// pilot-work-order.test.js), niemals die echte Application-Support-
// Datenbank. Dieses Modul führt niemals eine externe Aktion aus, committet,
// pusht oder deployt nicht.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const authDb = require("./auth-db");
const migrations = require("./auth-db-migrations");
const healthService = require("./health-reference-work-run-service");
const agentRegistry = require("./agent-registry");
const pilotService = require("./pilot-work-order-service");
const agentExecutionService = require("./pilot-agent-execution-service");
const runnerModule = require("./pilot-agent-runner");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "pilot-agent-execution-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function orderInput(overrides = {}) {
  return {
    title: "Testauftrag: Agentenlauf",
    desiredOutcome: "Nachweis eines echten, technisch ausgeführten Agentenlaufs.",
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

function auditEventsFor(db, orderId, eventType) {
  return authDb.listAuditEvents(db).filter((event) => {
    if (eventType && event.eventType !== eventType) return false;
    if (!event.metadata) return false;
    try {
      return JSON.parse(event.metadata).pilotOrderId === orderId;
    } catch (_error) {
      return false;
    }
  });
}

const PRESET_ID = "analyze-pilot-structure";
const PRESET = agentExecutionService.PILOT_AGENT_TASK_PRESETS[PRESET_ID];

async function run() {
  const { db } = makeIsolatedDb();
  const healthBaselineBefore = JSON.stringify(healthService.getOrCreateCanonicalRun(db));

  await check("V7.8.0: resolveChainSelectedFiles akzeptiert gültige Teilauswahl, lehnt ungültige Pfade/Typen ab und nutzt ohne Eingabe die vollständige Liste", () => {
    const fullSelection = agentExecutionService.resolveChainSelectedFiles();
    assert.deepStrictEqual(fullSelection, agentExecutionService.CHAIN_SELECTABLE_FILES.slice());
    assert.deepStrictEqual(agentExecutionService.resolveChainSelectedFiles(["pilot-work-order-service.js"]), ["pilot-work-order-service.js"]);
    [".env", ".git/config", "../.env", "/etc/passwd", "unbekannt.js"].forEach((invalidPath) => {
      assert.throws(
        () => agentExecutionService.resolveChainSelectedFiles([invalidPath]),
        /selectedFiles enth\u00e4lt nicht erlaubte Dateien/,
        `${invalidPath} muss abgewiesen werden`,
      );
    });
    assert.throws(() => agentExecutionService.resolveChainSelectedFiles("pilot-work-order-service.js"), /selectedFiles muss ein Array/);
    assert.throws(() => agentExecutionService.resolveChainSelectedFiles([]), /selectedFiles darf nicht leer sein/);
  });

  // -------------------------------------------------------------------
  // Zwei unabhängige Pilotaufträge, beide bis IN_EXECUTION geführt
  // (Voraussetzung für einen Agentenlauf, siehe Schwerpunkt 3).
  // -------------------------------------------------------------------
  const orderA = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag A: Agentenlauftest" }));
  const orderAId = orderA.order.id;
  driveOrderToInExecution(db, orderAId);

  const orderB = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag B: Agentenlauftest" }));
  const orderBId = orderB.order.id;
  driveOrderToInExecution(db, orderBId);

  // -------------------------------------------------------------------
  // 1./3./4./5./6./7./8. Ein technischer Agentenlauf (lokaler
  // deterministischer Read-Only-Runner, kein KI-Modellaufruf) für Auftrag A:
  // der tatsächliche Runner wird aufgerufen, liest reale Projektdateien und
  // erzeugt daraus ein inhaltsabhängiges Ergebnis.
  // -------------------------------------------------------------------

  let firstRunResult;
  let firstRunId;

  await check("1. ein Agentenlauf kann für einen Pilotauftrag (IN_EXECUTION) angelegt und tatsächlich ausgeführt werden", async () => {
    const revision = pilotService.getPilotOrderOverview(db, orderAId).order.revision;
    firstRunResult = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderAId,
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    firstRunId = firstRunResult.run.id;
    assert.strictEqual(firstRunResult.run.status, "SUCCEEDED");
  });

  await check("3. pilotOrderId wird korrekt dem gestarteten Auftrag zugeordnet", () => {
    assert.strictEqual(firstRunResult.run.pilotOrderId, orderAId);
  });

  await check("4. agentId (agentKey) und Rolle werden korrekt gemäß Preset gespeichert", () => {
    const expectedAgent = pilotService.PILOT_TEAM.find((agent) => agent.pilotRole === PRESET.pilotRole);
    assert.strictEqual(firstRunResult.run.pilotRole, PRESET.pilotRole);
    assert.strictEqual(firstRunResult.run.agentKey, expectedAgent.agentKey);
    assert.ok(agentRegistry.hasAgentId(firstRunResult.run.agentKey), "agentKey muss ein bekannter, bestehender Agent sein (kein neuer Agent)");
  });

  await check("5. Eingabe (Auftrag/Anweisung) und Ergebnis (Ergebnistext) werden getrennt persistiert", () => {
    const run = firstRunResult.run;
    assert.strictEqual(run.taskTitle, PRESET.title);
    assert.strictEqual(run.taskInstructions, PRESET.instructions);
    assert.notStrictEqual(run.resultRawText, run.taskInstructions, "Eingabe und Ergebnis dürfen nicht identisch sein");
    assert.ok(run.resultRawText.length > 0);
  });

  await check("6. erlaubte und verbotene Aktionen werden exakt gemäß serverseitigem Preset gespeichert (keine Client-Erweiterung möglich)", () => {
    const run = firstRunResult.run;
    assert.deepStrictEqual(run.allowedFiles, Array.from(PRESET.allowedFiles));
    assert.deepStrictEqual(run.allowedTools, Array.from(PRESET.allowedTools));
    assert.deepStrictEqual(run.forbiddenActions, Array.from(PRESET.forbiddenActions));
  });

  await check("7. der Runner wurde ausschließlich mit den im Preset festgelegten Dateien aufgerufen (keine Erweiterung der Grenzen)", () => {
    const analyzedPaths = firstRunResult.run.resultSummary.analyzedFiles.map((f) => f.path);
    analyzedPaths.forEach((analyzedPath) => {
      assert.ok(PRESET.allowedFiles.includes(analyzedPath), `"${analyzedPath}" ist nicht Teil des erlaubten Presets`);
    });
    assert.ok(analyzedPaths.length > 0, "es muss mindestens eine tatsächlich existierende Datei analysiert worden sein");
  });

  await check("8./35. ein erfolgreiches, tatsächlich berechnetes Ergebnis wird gespeichert – aus dem realen Dateiinhalt (kein KI-Modellaufruf), kein statisches Beispiel", () => {
    const run = firstRunResult.run;
    assert.strictEqual(run.status, "SUCCEEDED");
    assert.match(run.resultRawText, /Bestandsaufnahme/);
    // Unabhängige Gegenprobe: der Runner-Test unten (Abschnitt "Runner")
    // berechnet dieselben Kennzahlen unabhängig direkt aus dem Dateisystem
    // und vergleicht sie mit dem hier gespeicherten Ergebnis.
    const analyzed = run.resultSummary.analyzedFiles.find((f) => f.path === "pilot-agent-runner.js");
    assert.ok(analyzed, "pilot-agent-runner.js muss als real existierende, erlaubte Datei analysiert worden sein");
    const actualBuffer = fs.readFileSync(path.join(__dirname, "pilot-agent-runner.js"));
    const actualHash = crypto.createHash("sha256").update(actualBuffer).digest("hex");
    assert.strictEqual(analyzed.sha256, actualHash, "der gespeicherte SHA-256 muss exakt dem tatsächlichen Dateiinhalt entsprechen");
    assert.strictEqual(analyzed.byteLength, actualBuffer.length);
  });

  await check("22. ein abgeschlossener Agentenlauf bleibt nachträglich vollständig lesbar", () => {
    const reread = agentExecutionService.getAgentExecutionRunById(db, orderAId, firstRunId);
    assert.strictEqual(reread.status, "SUCCEEDED");
    assert.strictEqual(reread.resultRawText, firstRunResult.run.resultRawText);
    assert.strictEqual(reread.startedAt <= reread.finishedAt, true);
  });

  // -------------------------------------------------------------------
  // 10./11./12. Handoff referenziert die executionRunId, PM-Filter prüft
  // das tatsächliche Ergebnis, Zuordnung bleibt auftragsbezogen.
  // -------------------------------------------------------------------

  await check("10. der Handoff referenziert exakt die executionRunId des tatsächlichen Laufs", () => {
    assert.ok(firstRunResult.handoff, "ein erfolgreicher Lauf muss eine echte Rollenübergabe erzeugen");
    assert.strictEqual(firstRunResult.handoff.executionRunId, firstRunId);
  });

  await check("11. der Projektmanager-Filter prüft das tatsächliche Ergebnis und lässt ein vollständiges, echtes Ergebnis durch (PASSED)", () => {
    assert.strictEqual(firstRunResult.filterResult.passed, true);
    assert.deepStrictEqual(firstRunResult.filterResult.reasons, []);
    assert.strictEqual(firstRunResult.handoff.pmFilterStatus, "PASSED");
    assert.strictEqual(firstRunResult.handoff.resultOrRecommendation, firstRunResult.run.resultRawText.slice(0, 4000));
  });

  await check("12. der PM-Befund (Handoff) ist eindeutig dem richtigen Auftrag zugeordnet", () => {
    assert.strictEqual(firstRunResult.handoff.pilotOrderId, orderAId);
  });

  // -------------------------------------------------------------------
  // 13./14./24./25. Kein automatischer Fortschritt der fachlichen
  // Statusmaschine, keine automatische Freigabe.
  // -------------------------------------------------------------------

  await check("13./14. der Agentenlauf erzeugt keine automatische Freigabe und keinen automatischen Abschluss (Auftrag bleibt IN_EXECUTION)", () => {
    const overview = pilotService.getPilotOrderOverview(db, orderAId);
    assert.strictEqual(overview.status, "IN_EXECUTION");
  });

  await check("24./25. die bestehende Pilotstatusmaschine und Freigabegrenzen bleiben unverändert (approveCompletion erfordert weiterhin confirmed === true)", () => {
    assert.throws(
      () => pilotService.approveCompletion(db, { pilotOrderId: orderAId, confirmed: false }),
      /confirmed/i,
    );
    assert.deepStrictEqual(
      pilotService.PILOT_WORK_ORDER_STATUS_VALUES.slice().sort(),
      ["APPROVED_FOR_EXECUTION", "BLOCKED", "COMPLETED", "DRAFT", "IN_EXECUTION", "READY_FOR_JAMAL_APPROVAL", "READY_FOR_REVIEW", "RETURNED"].sort(),
    );
  });

  // -------------------------------------------------------------------
  // 9. Ein zweiter Lauf überschreibt den ersten nicht.
  // -------------------------------------------------------------------

  let secondRunResult;

  await check("9. ein zweiter Agentenlauf für denselben Auftrag überschreibt das Ergebnis des ersten Laufs nicht", async () => {
    const revision = pilotService.getPilotOrderOverview(db, orderAId).order.revision;
    secondRunResult = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderAId,
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    assert.notStrictEqual(secondRunResult.run.id, firstRunId, "executionRunId muss beim zweiten Lauf neu und eindeutig sein");
    const stillReadableFirst = agentExecutionService.getAgentExecutionRunById(db, orderAId, firstRunId);
    assert.strictEqual(stillReadableFirst.status, "SUCCEEDED");
    assert.strictEqual(stillReadableFirst.resultRawText, firstRunResult.run.resultRawText);
    const allRuns = agentExecutionService.listAgentExecutionRunsForOrder(db, orderAId);
    assert.strictEqual(allRuns.length, 2, "beide Läufe müssen als getrennte Datensätze bestehen bleiben");
  });

  await check("2. executionRunId ist über mehrere Läufe hinweg eindeutig", () => {
    assert.notStrictEqual(firstRunId, secondRunResult.run.id);
    assert.match(firstRunId, /^pilot-agent-run-[0-9a-f-]{36}$/);
    assert.match(secondRunResult.run.id, /^pilot-agent-run-[0-9a-f-]{36}$/);
  });

  // -------------------------------------------------------------------
  // 19. veraltete expectedRevision wird als Konflikt behandelt.
  // -------------------------------------------------------------------

  await check("19. eine veraltete expectedRevision beim Start eines Agentenlaufs wird als eindeutiger Konflikt (409) abgelehnt", async () => {
    const currentRevision = pilotService.getPilotOrderOverview(db, orderAId).order.revision;
    const staleRevision = currentRevision - 1;
    await assert.rejects(
      () =>
        agentExecutionService.startAgentExecutionRun(db, {
          pilotOrderId: orderAId,
          presetId: PRESET_ID,
          expectedRevision: staleRevision,
        }),
      (error) => {
        assert.strictEqual(error.name, "PilotAgentExecutionError");
        assert.strictEqual(error.statusCode, 409);
        return true;
      },
    );
    // Kein dritter Lauf darf durch den abgelehnten Versuch entstanden sein.
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderAId).length, 2);
  });

  // -------------------------------------------------------------------
  // 20./21. Auftrag A und Auftrag B bleiben vollständig isoliert.
  // -------------------------------------------------------------------

  let orderBRunResult;

  await check("20./21. ein Agentenlauf für Auftrag B ist vollständig unabhängig von Auftrag A und verändert dessen Daten nicht", async () => {
    const revisionB = pilotService.getPilotOrderOverview(db, orderBId).order.revision;
    orderBRunResult = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderBId,
      presetId: PRESET_ID,
      expectedRevision: revisionB,
    });
    assert.strictEqual(orderBRunResult.run.pilotOrderId, orderBId);
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderAId).length, 2, "Auftrag A darf durch den Lauf von B nicht verändert werden");
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderBId).length, 1);
    assert.notStrictEqual(orderBRunResult.run.id, firstRunId);
    assert.notStrictEqual(orderBRunResult.run.id, secondRunResult.run.id);
  });

  // -------------------------------------------------------------------
  // 26. der kanonische Pilotauftrag bleibt kompatibel (Agentenlauf ohne
  // ausdrückliche pilotOrderId fällt auf den kanonischen Auftrag zurück).
  // -------------------------------------------------------------------

  await check("26. ein Agentenlauf ohne ausdrückliche pilotOrderId bleibt kompatibel zum kanonischen Pilotauftrag", async () => {
    const canonicalOverview = pilotService.getOrCreateCanonicalPilotOrder(db);
    driveOrderToInExecution(db, canonicalOverview.order.id);
    const revision = pilotService.getPilotOrderOverview(db, pilotService.CANONICAL_PILOT_ORDER_ID).order.revision;
    const canonicalRun = await agentExecutionService.startAgentExecutionRun(db, {
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    assert.strictEqual(canonicalRun.run.pilotOrderId, pilotService.CANONICAL_PILOT_ORDER_ID);
  });

  // -------------------------------------------------------------------
  // 17./18. Doppelklick/zweiter Start während eines aktiven Laufs: der
  // partielle Unique-Index erzwingt höchstens einen aktiven Lauf pro
  // Auftrag – ein echter, gleichzeitiger zweiter Startversuch wird
  // atomar abgelehnt, bevor ein zweiter Runner-Aufruf entstehen kann.
  // -------------------------------------------------------------------

  await check("17./18. ein zweiter, gleichzeitiger Startversuch (Doppelklick) während eines bereits aktiven Laufs erzeugt keinen zweiten aktiven Lauf", async () => {
    const orderC = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag C: Doppelklick-Test" }));
    const orderCId = orderC.order.id;
    driveOrderToInExecution(db, orderCId);
    const revision = pilotService.getPilotOrderOverview(db, orderCId).order.revision;

    const firstAttempt = agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderCId,
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    let secondError = null;
    const secondAttempt = agentExecutionService
      .startAgentExecutionRun(db, { pilotOrderId: orderCId, presetId: PRESET_ID, expectedRevision: revision })
      .catch((error) => {
        secondError = error;
      });

    const firstResult = await firstAttempt;
    await secondAttempt;

    assert.ok(secondError, "der zweite, gleichzeitig ausgelöste Start muss abgelehnt werden");
    assert.strictEqual(secondError.name, "PilotAgentExecutionError");
    assert.strictEqual(secondError.statusCode, 409);
    assert.strictEqual(firstResult.run.status, "SUCCEEDED");
    assert.strictEqual(
      agentExecutionService.listAgentExecutionRunsForOrder(db, orderCId).length,
      1,
      "es darf nur genau ein Agentenlauf-Datensatz entstanden sein",
    );
  });

  // -------------------------------------------------------------------
  // 15./23. Ein technischer Runner-Fehler erzeugt kein erfolgreiches
  // Handoff und bleibt mit Fehlergrund lesbar. Der Runner selbst wird
  // NICHT mit einem gefälschten Ergebnisobjekt ersetzt – stattdessen wird
  // punktuell die bereits vom Node-Modulcache gehaltene Runner-Funktion
  // durch ein technisches Fehlschlag-Doppel ersetzt (entspricht einem
  // "technischen Abbruch", nicht einer vorgetäuschten Erfolgssimulation).
  // -------------------------------------------------------------------

  const originalRunTask = runnerModule.runPilotAgentAnalysisTask;
  let failedRunResult;
  let orderFailId;

  await check("15./23. ein technischer Runner-Fehler erzeugt KEIN erfolgreiches Handoff und bleibt mit Fehlergrund lesbar (FAILED)", async () => {
    const orderFail = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag D: Technischer Fehlerfall" }));
    orderFailId = orderFail.order.id;
    driveOrderToInExecution(db, orderFailId);
    const revision = pilotService.getPilotOrderOverview(db, orderFailId).order.revision;

    runnerModule.runPilotAgentAnalysisTask = async () => ({
      ok: false,
      failed: true,
      errorMessage: "Simulierter technischer Runner-Fehler (kontrolliertes Testdoppel, kein echter Erfolg).",
    });
    try {
      failedRunResult = await agentExecutionService.startAgentExecutionRun(db, {
        pilotOrderId: orderFailId,
        presetId: PRESET_ID,
        expectedRevision: revision,
      });
    } finally {
      runnerModule.runPilotAgentAnalysisTask = originalRunTask;
    }

    assert.strictEqual(failedRunResult.run.status, "FAILED");
    assert.match(failedRunResult.run.errorMessage, /Simulierter technischer Runner-Fehler/);
    assert.strictEqual(failedRunResult.handoff, null, "ein technischer Fehler darf niemals als erfolgreiches Handoff gespeichert werden");
    assert.strictEqual(pilotService.getPilotOrderOverview(db, orderFailId).handoffs.length, 0);
    assert.strictEqual(pilotService.getPilotOrderOverview(db, orderFailId).status, "IN_EXECUTION", "ein technischer Fehler darf den fachlichen Status nicht verändern");

    // bleibt mit Fehlergrund nachträglich lesbar (Test 23).
    const reread = agentExecutionService.getAgentExecutionRunById(db, orderFailId, failedRunResult.run.id);
    assert.strictEqual(reread.status, "FAILED");
    assert.match(reread.errorMessage, /Simulierter technischer Runner-Fehler/);
  });

  await check("nach einem technischen Fehlschlag ist der Auftrag wieder frei für einen neuen Agentenlauf (kein dauerhaft blockierter Lock)", async () => {
    const revision = pilotService.getPilotOrderOverview(db, orderFailId).order.revision;
    const retryResult = await agentExecutionService.startAgentExecutionRun(db, {
      pilotOrderId: orderFailId,
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    assert.strictEqual(retryResult.run.status, "SUCCEEDED");
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, orderFailId).length, 2);
  });

  // -------------------------------------------------------------------
  // 16. Ein Audit-Fehler beim Abschluss führt zu einem sicheren,
  // eindeutig erkennbaren Fehlerzustand (niemals ein stiller,
  // vorgetäuschter Erfolg).
  // -------------------------------------------------------------------

  await check("16. ein Audit-Fehler beim Abschluss eines erfolgreichen Laufs führt zu einem sicheren, eindeutigen Fehlerzustand (kein vorgetäuschter Erfolg)", async () => {
    const authAudit = require("./auth-audit");
    const orderAudit = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag E: Audit-Fehler-Test" }));
    const orderAuditId = orderAudit.order.id;
    driveOrderToInExecution(db, orderAuditId);
    const revision = pilotService.getPilotOrderOverview(db, orderAuditId).order.revision;

    const originalRecordAuditEvent = authAudit.recordAuditEvent;
    authAudit.recordAuditEvent = (dbArg, input) => {
      if (input && input.eventType === "PILOT_AGENT_EXECUTION_RUN_SUCCEEDED") {
        throw new Error("Simulierter Audit-Schreibfehler (kontrolliertes Testdoppel).");
      }
      return originalRecordAuditEvent(dbArg, input);
    };

    let thrown = null;
    try {
      await agentExecutionService.startAgentExecutionRun(db, {
        pilotOrderId: orderAuditId,
        presetId: PRESET_ID,
        expectedRevision: revision,
      });
    } catch (error) {
      thrown = error;
    } finally {
      authAudit.recordAuditEvent = originalRecordAuditEvent;
    }

    assert.ok(thrown, "ein gescheiterter Audit-Schreibvorgang muss sichtbar (nicht still) fehlschlagen");
    const runs = agentExecutionService.listAgentExecutionRunsForOrder(db, orderAuditId);
    assert.strictEqual(runs.length, 1);
    // Niemals ein vorgetäuschter Erfolg: entweder eindeutig FAILED, oder
    // (im schlimmsten Fall des Fallbacks) nachvollziehbar RUNNING – niemals
    // SUCCEEDED ohne tatsächlich dauerhaft gespeichertes Audit-Ereignis.
    assert.notStrictEqual(runs[0].status, "SUCCEEDED", "bei gescheitertem Audit darf niemals SUCCEEDED vorgetäuscht werden");
    assert.strictEqual(pilotService.getPilotOrderOverview(db, orderAuditId).handoffs.length, 0, "bei gescheitertem Audit darf keine Rollenübergabe entstanden sein");
    if (runs[0].status === "FAILED") {
      assert.match(runs[0].errorMessage || "", /Interner Fehler|Audit/i);
    }
  });

  // -------------------------------------------------------------------
  // Korrekturlauf vor Commit ("Ergebnis darf bei Handoff-Konflikt nicht
  // verloren gehen"): der Pilotauftrag wird WÄHREND der Runner tatsächlich
  // läuft (zwischen Start und Abschluss) über einen unabhängigen,
  // gleichzeitigen Vorgang (blockOrder) in einen Zustand gebracht, in dem
  // kein Handoff mehr zulässig ist (submitHandoff verlangt IN_EXECUTION).
  // Der Runner selbst wird NICHT ersetzt/simuliert – er läuft tatsächlich,
  // liest reale Dateien und erzeugt ein echtes Ergebnis; lediglich der
  // Zeitpunkt der Statusänderung wird über einen punktuellen Monkey-Patch
  // des bereits geladenen Runner-Moduls deterministisch in das Zeitfenster
  // "zwischen Start und Abschluss" gelegt (kein statisches Ergebnisobjekt,
  // kein direktes Schreiben in die Datenbank).
  // -------------------------------------------------------------------

  let conflictOrderId;
  let conflictRunResult;

  await check("Korrektur 3 (1./2./3./4./5.): der Runner läuft trotz Auftragsänderung während des Runs erfolgreich zu Ende und der Lauf endet SUCCEEDED", async () => {
    const orderBBefore = pilotService.getPilotOrderOverview(db, orderBId);

    const orderConflict = pilotService.createPilotOrder(db, orderInput({ title: "Auftrag F: Auftragsänderung während des Runs" }));
    conflictOrderId = orderConflict.order.id;
    driveOrderToInExecution(db, conflictOrderId);
    const revision = pilotService.getPilotOrderOverview(db, conflictOrderId).order.revision;

    const originalRunTaskForConflict = runnerModule.runPilotAgentAnalysisTask;
    runnerModule.runPilotAgentAnalysisTask = async (input) => {
      // Simuliert exakt das im Auftrag beschriebene Zeitfenster: "während
      // der Runner zwischen Start und Abschluss steht" – der Auftrag wird
      // kontrolliert (nicht spekulativ) in einen Zustand versetzt, in dem
      // kein Handoff mehr zulässig ist, BEVOR der tatsächliche Runner sein
      // echtes Ergebnis zurückgibt.
      pilotService.blockOrder(db, {
        pilotOrderId: conflictOrderId,
        reason: "Kontrollierter Test: Auftragsänderung während eines laufenden Agentenlaufs.",
      });
      return originalRunTaskForConflict(input);
    };

    try {
      conflictRunResult = await agentExecutionService.startAgentExecutionRun(db, {
        pilotOrderId: conflictOrderId,
        presetId: PRESET_ID,
        expectedRevision: revision,
      });
    } finally {
      runnerModule.runPilotAgentAnalysisTask = originalRunTaskForConflict;
    }

    assert.strictEqual(conflictRunResult.run.status, "SUCCEEDED", "der technisch erfolgreiche Runner-Abschluss darf durch den späteren Handoff-Konflikt nicht als FAILED behandelt werden");

    // 13. andere Aufträge (hier: Auftrag B) bleiben unberührt.
    const orderBAfter = pilotService.getPilotOrderOverview(db, orderBId);
    assert.deepStrictEqual(orderBAfter, orderBBefore, "ein Handoff-Konflikt bei Auftrag F darf Auftrag B nicht verändern");
  });

  await check("Korrektur 3 (6.): resultRawText und resultSummaryJson bleiben trotz des Handoff-Konflikts vollständig lesbar", () => {
    assert.match(conflictRunResult.run.resultRawText, /Bestandsaufnahme/);
    assert.ok(conflictRunResult.run.resultSummary && conflictRunResult.run.resultSummary.analyzedFiles.length > 0, "das echte Analyseergebnis muss vollständig erhalten bleiben");
  });

  await check("Korrektur 3 (7./8./11.): es entsteht kein erfolgreicher Handoff und kein PM-Erfolgseintrag", () => {
    assert.strictEqual(conflictRunResult.handoff, null, "bei einem Handoff-Konflikt darf niemals ein Handoff-Objekt zurückgegeben werden");
    assert.strictEqual(pilotService.getPilotOrderOverview(db, conflictOrderId).handoffs.length, 0, "es darf kein Handoff-Datensatz entstanden sein");
  });

  await check("Korrektur 3 (9./10.): der Handoff-Fehler ist eindeutig und separat vom Runstatus lesbar, kein automatischer Retry", () => {
    assert.strictEqual(conflictRunResult.run.handoffStatus, "FAILED");
    assert.match(conflictRunResult.run.handoffErrorMessage, /IN_EXECUTION/);
    // Kein automatischer Retry: es existiert weiterhin genau ein
    // Agentenlauf-Datensatz für diesen Auftrag.
    assert.strictEqual(agentExecutionService.listAgentExecutionRunsForOrder(db, conflictOrderId).length, 1);
  });

  await check("Korrektur 3 (12.): der fachliche Pilotauftragsstatus wird durch den Handoff-Konflikt nicht unkontrolliert zurückgesetzt (bleibt BLOCKED)", () => {
    assert.strictEqual(pilotService.getPilotOrderOverview(db, conflictOrderId).status, "BLOCKED", "der während des Runs herbeigeführte Status bleibt bestehen, kein automatischer Statuswechsel durch den Agentenlauf");
  });

  await check("Korrektur 3: der Lauf und sein Handoff-Fehler bleiben nachträglich unverändert und stabil lesbar", () => {
    const reread = agentExecutionService.getAgentExecutionRunById(db, conflictOrderId, conflictRunResult.run.id);
    assert.strictEqual(reread.status, "SUCCEEDED");
    assert.strictEqual(reread.handoffStatus, "FAILED");
    assert.strictEqual(reread.resultRawText, conflictRunResult.run.resultRawText);
    assert.match(reread.handoffErrorMessage, /IN_EXECUTION/);
  });

  // -------------------------------------------------------------------
  // Runner-Unit-Tests (pilot-agent-runner.js) – reine, deterministische
  // Read-Only-Analyse ohne Netzwerk/Kindprozess.
  // -------------------------------------------------------------------

  await check("Runner: liest tatsächlich vorhandene Projektdateien und berechnet reale, inhaltsabhängige Kennzahlen", async () => {
    const result = await runnerModule.runPilotAgentAnalysisTask({
      repoRoot: __dirname,
      allowedFiles: ["pilot-agent-runner.js"],
      taskTitle: "Unit-Test",
      taskInstructions: "Direkter Runner-Aufruf ohne Serviceschicht.",
    });
    assert.strictEqual(result.ok, true);
    const actualBuffer = fs.readFileSync(path.join(__dirname, "pilot-agent-runner.js"));
    const actualLineCount = actualBuffer.toString("utf8").split(/\r?\n/).length;
    assert.strictEqual(result.facts[0].byteLength, actualBuffer.length);
    assert.strictEqual(result.facts[0].lineCount, actualLineCount);
  });

  await check("Runner: eine nicht existierende Datei wird als 'exists: false' erkannt, kein Absturz, kein stilles Ignorieren des Gesamtergebnisses", async () => {
    const result = await runnerModule.runPilotAgentAnalysisTask({
      repoRoot: __dirname,
      allowedFiles: ["diese-datei-existiert-nicht-12345.js"],
      taskTitle: "Unit-Test",
      taskInstructions: "Nicht existierende Datei.",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, true);
    assert.match(result.errorMessage, /Keine der erlaubten Dateien/);
  });

  await check("Runner: Pfad-Traversierung außerhalb des Repositories wird abgelehnt (assertSafeRelativeFilePath)", () => {
    assert.throws(() => runnerModule.assertSafeRelativeFilePath("../../etc/passwd"), /Traversierung/);
    assert.throws(() => runnerModule.assertSafeRelativeFilePath("/etc/passwd"), /Absoluter Pfad/);
  });

  await check("Runner-Quelltext ruft nachweislich niemals ein Netzwerk, keinen Kindprozess und kein KI-Modell auf (30. keine externe Netzwerk-/Schreiboperation)", () => {
    const runnerSource = fs.readFileSync(path.join(__dirname, "pilot-agent-runner.js"), "utf8");
    assert.doesNotMatch(runnerSource, /require\(["']child_process["']\)/);
    assert.doesNotMatch(runnerSource, /require\(["']https?["']\)/);
    assert.doesNotMatch(runnerSource, /fetch\s*\(/);
    assert.doesNotMatch(runnerSource, /fs\.write|fs\.appendFile|fs\.unlink|fs\.rm\(/);
  });

  // -------------------------------------------------------------------
  // 33./34. additive Migration funktioniert auf neuer UND bestehender
  // Datenbank.
  // -------------------------------------------------------------------

  await check("33. eine neue Testdatenbank erhält Migration 20 (pilot_agent_execution_runs existiert von Anfang an)", () => {
    const { db: freshDb } = makeIsolatedDb("pilot-agent-execution-migration-new-");
    assert.ok(migrations.getAppliedVersions(freshDb).includes(20));
    const tableRow = freshDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pilot_agent_execution_runs'")
      .get();
    assert.ok(tableRow, "pilot_agent_execution_runs muss in einer neuen Datenbank existieren");
  });

  await check("34. Migration 20 ist auf einer bereits bestehenden Datenbank (ohne die neue Tabelle/Spalte) wiederholbar nachrüstbar, ohne bestehende Daten zu verändern", () => {
    const { db: existingDb } = makeIsolatedDb("pilot-agent-execution-migration-existing-");
    const preMigrationOrder = pilotService.createPilotOrder(existingDb, orderInput({ title: "Bestehender Auftrag vor Migration 20" }));
    const preOrderId = preMigrationOrder.order.id;
    driveOrderToInExecution(existingDb, preOrderId);
    const beforeDowngrade = pilotService.getPilotOrderOverview(existingDb, preOrderId);
    const auditCountBefore = auditEventsFor(existingDb, preOrderId).length;

    // Simuliert eine "bestehende Testdatenbank von vor Phase 6": die neue
    // Tabelle und Spalte werden entfernt und ihr Migrationseintrag
    // gelöscht (ausschließlich zu Testzwecken; das produktive
    // Migrationssystem selbst löscht/baut niemals eine bestehende Tabelle
    // neu auf, siehe auth-db-migrations.js Migration 20).
    existingDb.exec("DROP TABLE pilot_agent_execution_runs");
    existingDb.exec("ALTER TABLE pilot_handoffs DROP COLUMN executionRunId");
    existingDb.prepare("DELETE FROM schema_migrations WHERE version = ?").run(20);
    assert.ok(!migrations.getAppliedVersions(existingDb).includes(20));

    const result = migrations.runMigrations(existingDb);
    assert.deepStrictEqual(result.appliedNow, [20]);
    assert.ok(migrations.getAppliedVersions(existingDb).includes(20));

    const afterMigration = pilotService.getPilotOrderOverview(existingDb, preOrderId);
    assert.strictEqual(afterMigration.status, beforeDowngrade.status);
    assert.strictEqual(afterMigration.order.title, beforeDowngrade.order.title);
    assert.strictEqual(afterMigration.order.createdAt, beforeDowngrade.order.createdAt);
    assert.strictEqual(auditEventsFor(existingDb, preOrderId).length, auditCountBefore, "bestehende Audit-Daten bleiben unverändert erhalten");

    // Nach der Nachrüstung funktioniert ein technischer Agentenlauf (lokaler deterministischer Runner) normal.
    return agentExecutionService
      .startAgentExecutionRun(existingDb, {
        pilotOrderId: preOrderId,
        presetId: PRESET_ID,
        expectedRevision: afterMigration.order.revision,
      })
      .then((postMigrationRun) => {
        assert.strictEqual(postMigrationRun.run.status, "SUCCEEDED");
      });
  });

  // -------------------------------------------------------------------
  // Korrekturlauf vor Commit: Migration 21 (handoffStatus/
  // handoffErrorMessage/handoffCompletedAt) funktioniert additiv auf einer
  // neuen UND auf einer bereits bestehenden Phase-6-Datenbank.
  // -------------------------------------------------------------------

  await check("Migration 21 (neue Datenbank): pilot_agent_execution_runs erhält von Anfang an handoffStatus/handoffErrorMessage/handoffCompletedAt", () => {
    const { db: freshDb } = makeIsolatedDb("pilot-agent-execution-migration21-new-");
    assert.ok(migrations.getAppliedVersions(freshDb).includes(21));
    const columns = freshDb.prepare("PRAGMA table_info(pilot_agent_execution_runs)").all().map((c) => c.name);
    assert.ok(columns.includes("handoffStatus"));
    assert.ok(columns.includes("handoffErrorMessage"));
    assert.ok(columns.includes("handoffCompletedAt"));
  });

  await check("Migration 21 (bestehende Phase-6-Datenbank): ein bereits bestehender, vor Migration 21 SUCCEEDED gespeicherter Lauf bleibt nach der Nachrüstung unverändert lesbar und erhält handoffStatus = 'PENDING'", async () => {
    const { db: existingDb } = makeIsolatedDb("pilot-agent-execution-migration21-existing-");
    const preOrder = pilotService.createPilotOrder(existingDb, orderInput({ title: "Bestehender Auftrag vor Migration 21" }));
    const preOrderId = preOrder.order.id;
    driveOrderToInExecution(existingDb, preOrderId);
    const revision = pilotService.getPilotOrderOverview(existingDb, preOrderId).order.revision;
    const preMigrationRun = await agentExecutionService.startAgentExecutionRun(existingDb, {
      pilotOrderId: preOrderId,
      presetId: PRESET_ID,
      expectedRevision: revision,
    });
    assert.strictEqual(preMigrationRun.run.status, "SUCCEEDED");

    // Simuliert eine "bestehende Testdatenbank von vor dem Korrekturlauf":
    // die drei neuen Spalten werden entfernt und der Migrationseintrag
    // gelöscht (ausschließlich zu Testzwecken).
    existingDb.exec("ALTER TABLE pilot_agent_execution_runs DROP COLUMN handoffStatus");
    existingDb.exec("ALTER TABLE pilot_agent_execution_runs DROP COLUMN handoffErrorMessage");
    existingDb.exec("ALTER TABLE pilot_agent_execution_runs DROP COLUMN handoffCompletedAt");
    existingDb.prepare("DELETE FROM schema_migrations WHERE version = ?").run(21);
    assert.ok(!migrations.getAppliedVersions(existingDb).includes(21));

    const result = migrations.runMigrations(existingDb);
    assert.deepStrictEqual(result.appliedNow, [21]);
    assert.ok(migrations.getAppliedVersions(existingDb).includes(21));

    const rereadRun = agentExecutionService.getAgentExecutionRunById(existingDb, preOrderId, preMigrationRun.run.id);
    assert.strictEqual(rereadRun.status, "SUCCEEDED", "der bereits bestehende Runstatus bleibt unverändert");
    assert.strictEqual(rereadRun.resultRawText, preMigrationRun.run.resultRawText, "das bereits bestehende Ergebnis bleibt unverändert");
    assert.strictEqual(rereadRun.handoffStatus, "PENDING", "additive Migration: bestehende Läufe erhalten den sicheren Ausgangswert PENDING");

    // 17. bestehende Handoffs ohne executionRunId bleiben gültig: das bereits
    // vor Migration 21 entstandene, echte Handoff dieses Laufs bleibt
    // vollständig lesbar und unverändert.
    const overviewAfter = pilotService.getPilotOrderOverview(existingDb, preOrderId);
    assert.strictEqual(overviewAfter.handoffs.length, 1);
    assert.strictEqual(overviewAfter.handoffs[0].executionRunId, preMigrationRun.run.id);
  });

  // -------------------------------------------------------------------
  // 31. Health-Referenzdaten bleiben durch sämtliche Agentenlauf-
  // Operationen dieses Testmoduls unverändert.
  // -------------------------------------------------------------------

  await check("31. Health-Referenzdaten bleiben durch sämtliche Agentenlauf-Operationen dieses Testmoduls unverändert", () => {
    const healthAfter = JSON.stringify(healthService.getOrCreateCanonicalRun(db));
    assert.strictEqual(healthAfter, healthBaselineBefore);
  });

  console.log(`pilot-agent-execution.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
