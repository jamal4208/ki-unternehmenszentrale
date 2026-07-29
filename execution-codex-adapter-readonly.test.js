"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Isolierte Tests für das eigenständige Modul
// execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis
// (Schwerpunkt 3, "Codex-Adapter im Read-Only-Modus") sowie den davon
// vollständig unberührt gebliebenen, eingefrorenen bestehenden
// dateiverändernden Pfad in execution-codex-adapter.js (buildCodexArgs,
// detectCodexAvailability). Verwendet ausschließlich injizierte
// execFileImpl/execFileSyncImpl-Test-Doubles – startet niemals einen
// echten Codex-Kindprozess.
//
// Bewusste Modultrennung (siehe Abschlussbericht Phase 7, Abschnitt 3):
// execution-codex-adapter.js steht unter einem verbindlichen Freeze eines
// parallelen Arbeitspakets (v71-integration.test.js) und wird von diesem
// Nachtlauf NICHT verändert – deshalb zwei getrennte require()s unten.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const codexAdapter = require("./execution-codex-adapter");
const codexReadOnlyAdapter = require("./execution-codex-adapter-readonly");

let passed = 0;
async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ro-adapter-test-"));
  return fs.realpathSync(dir);
}

// Simuliert einen Codex-Kindprozess, der die --output-last-message-Datei mit
// dem gegebenen Text füllt und dann erfolgreich beendet.
function fakeExecFileImplWriting(resultText) {
  return (file, args, options, callback) => {
    const idx = args.indexOf("--output-last-message");
    const outPath = args[idx + 1];
    if (resultText !== undefined) {
      fs.writeFileSync(outPath, resultText);
    }
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => callback(null, "", ""));
    return child;
  };
}

async function run() {
  await check("Phase 7 – 9. bestehender schreibender Codex-Pfad (buildCodexArgs in execution-codex-adapter.js) bleibt vollständig unverändert bei 'workspace-write' (kein sandboxMode-Parameter, kein Diff an der Datei)", async () => {
    const args = codexAdapter.buildCodexArgs({
      workspaceDir: "/tmp/some-workspace",
      outputLastMessagePath: "/tmp/some-workspace/out.txt",
      prompt: "Testauftrag",
    });
    assert.ok(args.includes("--sandbox"));
    assert.strictEqual(args[args.indexOf("--sandbox") + 1], "workspace-write");
    assert.strictEqual(typeof codexAdapter.CODEX_SANDBOX_MODES, "undefined", "execution-codex-adapter.js darf keinen neuen sandboxMode-Baustein erhalten (Freeze)");
  });

  await check("Phase 7 – 8. das eigenständige Read-Only-Modul (execution-codex-adapter-readonly.js) verwendet ausschließlich den Read-Only-Sandboxmodus", async () => {
    const args = codexReadOnlyAdapter.buildReadOnlyCodexArgs({
      workspaceDir: "/tmp/some-workspace",
      outputLastMessagePath: "/tmp/some-workspace/out.txt",
      prompt: "Testauftrag",
    });
    assert.strictEqual(args[args.indexOf("--sandbox") + 1], "read-only");
  });

  await check("Phase 7 – 10. runCodexReadOnlyAnalysis verwendet eine feste Argumentliste ohne Shell (shell: false, kein zusammengesetzter String)", async () => {
    const workspaceDir = makeWorkspace();
    let capturedArgs = null;
    let capturedOptions = null;
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-args",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        capturedArgs = args;
        capturedOptions = options;
        return fakeExecFileImplWriting("Ergebnistext")(file, args, options, callback);
      },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(capturedArgs));
    capturedArgs.forEach((entry) => assert.strictEqual(typeof entry, "string"));
    assert.strictEqual(capturedOptions.shell, false);
    assert.strictEqual(capturedArgs.includes("--output-last-message"), true);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 11. Codex wird mit reduziertem Environment gestartet (kein voller process.env-Durchreich)", async () => {
    const workspaceDir = makeWorkspace();
    let capturedEnv = null;
    process.env.KUZ_TEST_SHOULD_NOT_LEAK = "should-not-appear";
    await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-env",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        capturedEnv = options.env;
        return fakeExecFileImplWriting("Ergebnistext")(file, args, options, callback);
      },
    });
    delete process.env.KUZ_TEST_SHOULD_NOT_LEAK;
    assert.ok(capturedEnv);
    assert.strictEqual(capturedEnv.KUZ_TEST_SHOULD_NOT_LEAK, undefined);
    const allowedKeys = new Set(["PATH", "LANG", "HOME", "CODEX_HOME"]);
    Object.keys(capturedEnv).forEach((key) => assert.ok(allowedKeys.has(key), `unerwarteter Environment-Schlüssel: ${key}`));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 18. eine echte, nichtleere Modellantwort wird unverändert (bis auf Secret-Redaktion) als Rohtext zurückgegeben", async () => {
    const workspaceDir = makeWorkspace();
    const resultText = "# Analyse\n\nBeobachtung 1.\nBeobachtung 2.\nBeobachtung 3.\n\nRisiko 1.\nRisiko 2.\n\nEmpfehlung.";
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-real-text",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting(resultText),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.resultText, resultText);
    assert.strictEqual(result.secretRedactionApplied, false);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 19. eine leere Codex-Antwort wird sicher abgelehnt (kein stiller Erfolg)", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-empty",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting("   \n  "),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.resultText, null);
    assert.ok(result.errors.join(" ").includes("leere Ausgabe"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – unlesbare/fehlende Ausgabedatei wird identisch wie eine leere Antwort behandelt", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-missing-file",
      prompt: "Analysiere die Struktur.",
      // Schreibt die Ausgabedatei absichtlich NICHT.
      execFileImpl: fakeExecFileImplWriting(undefined),
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.join(" ").includes("leere Ausgabe"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 20. eine zu große Codex-Antwort wird abgelehnt statt still gekürzt", async () => {
    const workspaceDir = makeWorkspace();
    const bigText = "x".repeat(200);
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-too-big",
      prompt: "Analysiere die Struktur.",
      maxResultChars: 100,
      execFileImpl: fakeExecFileImplWriting(bigText),
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.join(" ").includes("maximale sichere Größe"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 21. eine offensichtliche Secret-Ausgabe wird redigiert, nicht unverändert gespeichert", async () => {
    const workspaceDir = makeWorkspace();
    const resultText = "Analyse abgeschlossen. api_key: sk-ABCDEFGHIJ1234567890 wurde im Code gefunden.";
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-secret",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting(resultText),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.secretRedactionApplied, true);
    assert.ok(result.resultText.includes("[REDACTED]"));
    assert.ok(!result.resultText.includes("sk-ABCDEFGHIJ1234567890"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Korrektur 2 (unabhängiges Review, Kategorie B, "Secret-Redaktion
  // fachlich nachvollziehbar machen") / Sicherheitstest 8.16: die
  // Redaktion darf den fachlich relevanten Feldnamen erhalten und nur den
  // tatsächlichen sensiblen Wert ersetzen – die vorige Version hätte die
  // gesamte Aussage vernichtet.
  await check("Phase 7 – 8.16. Secret-Redaktion bewahrt fachlich relevante Feldnamen, entfernt aber sensible Werte (realistische Codeanalyse-Sätze)", async () => {
    const workspaceDir = makeWorkspace();
    const resultText =
      "Beobachtung: in auth-db.js wird token: row.sessionToken ungeprüft geloggt. " +
      "Risiko: password = req.body.password wird nicht gehasht. " +
      "Zusätzlich sendet der Client einen Authorization: Bearer abc123secrettoken1234 Header.";
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-secret-field-names",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting(resultText),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.secretRedactionApplied, true);
    // Feldnamen/fachliche Aussage bleiben erhalten:
    assert.ok(result.resultText.includes("token:"));
    assert.ok(result.resultText.includes("password ="));
    assert.ok(result.resultText.includes("Bearer"));
    assert.ok(result.resultText.includes("auth-db.js"));
    assert.ok(result.resultText.includes("wird nicht gehasht"));
    // Tatsächliche Werte verschwinden vollständig:
    assert.ok(!result.resultText.includes("row.sessionToken"));
    assert.ok(!result.resultText.includes("req.body.password"));
    assert.ok(!result.resultText.includes("abc123secrettoken1234"));
    assert.ok(result.resultText.includes("[REDACTED]"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Sicherheitstest 8.17 (Teil 1, API-Ebene): bei jeder tatsächlich
  // erfolgten Redaktion wird der feste Hinweistext gesetzt.
  await check("Phase 7 – 8.17. Redaktionshinweis wird bei tatsächlicher Redaktion gesetzt, sonst nicht (API-Ebene)", async () => {
    const workspaceDir = makeWorkspace();
    const withSecret = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-notice-yes",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting("api_key: sk-ABCDEFGHIJ1234567890 gefunden."),
    });
    assert.strictEqual(withSecret.secretRedactionApplied, true);
    assert.strictEqual(withSecret.secretRedactionNotice, codexReadOnlyAdapter.SECRET_REDACTION_NOTICE_TEXT);
    assert.ok(withSecret.secretRedactionNotice.includes("redigiert"));

    const withoutSecret = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-notice-no",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplWriting("Ganz normale Analyse ohne Geheimnisse."),
    });
    assert.strictEqual(withoutSecret.secretRedactionApplied, false);
    assert.strictEqual(withoutSecret.secretRedactionNotice, null);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 12. ein durch Timeout beendeter Codex-Prozess wird eindeutig als Timeout gekennzeichnet (kein stiller Erfolg)", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-timeout",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        const child = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => callback(Object.assign(new Error("timeout"), { killed: true }), "", ""));
        return child;
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.resultText, null);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 13. ein per cancelRun() abgebrochener Lauf wird eindeutig als CANCELLED gekennzeichnet, kein Erfolg", async () => {
    const workspaceDir = makeWorkspace();
    let killCalled = false;
    let resolveCallback;
    const callbackCalledPromise = new Promise((resolve) => {
      resolveCallback = resolve;
    });
    const attemptId = "attempt-cancel";
    const runPromise = codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId,
      prompt: "Analysiere die Struktur.",
      shouldAbort: () => killCalled,
      execFileImpl: (file, args, options, callback) => {
        const child = new EventEmitter();
        child.exitCode = null;
        child.killed = false;
        child.kill = (signal) => {
          killCalled = true;
          setImmediate(() => {
            callback(Object.assign(new Error("killed"), { killed: true }), "", "");
            child.exitCode = 143;
            child.killed = true;
            child.emit("exit", null, signal);
            resolveCallback();
          });
        };
        return child;
      },
    });
    // Sicherstellen, dass der Kindprozess bereits als aktiv registriert ist,
    // bevor cancelRun() aufgerufen wird (echter Produktionsablauf).
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(codexReadOnlyAdapter.hasActiveProcessForTests(attemptId), true);
    await codexReadOnlyAdapter.cancelRun(attemptId);
    await callbackCalledPromise;
    const result = await runPromise;
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.resultText, null);
    assert.strictEqual(codexReadOnlyAdapter.hasActiveProcessForTests(attemptId), false);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 14. fehlender/nicht installierter Codex führt zu einem eindeutigen Verfügbarkeitsfehler (kein KI-Erfolg vorgetäuscht)", async () => {
    codexAdapter.resetCodexAvailabilityCacheForTests();
    const availability = codexAdapter.detectCodexAvailability({
      forceRefresh: true,
      execFileSyncImpl: () => {
        throw Object.assign(new Error("command not found"), { code: "ENOENT" });
      },
    });
    assert.strictEqual(availability.available, false);
    assert.strictEqual(availability.authenticated, false);
    assert.strictEqual(availability.reason, "CODEX_CLI_NOT_FOUND");
  });

  // -------------------------------------------------------------------
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"): die im
  // Fehlerpfad bislang verworfenen sicheren Diagnosefelder (exitCode/
  // signal/reasonCode/stderrSample/stdoutSample) müssen jetzt vollständig
  // im Rückgabewert von runCodexReadOnlyAnalysis ankommen.
  // -------------------------------------------------------------------

  function fakeExecFileImplExitCode(code, { stdout = "", stderr = "" } = {}) {
    return (file, args, options, callback) => {
      const child = new EventEmitter();
      child.kill = () => {};
      const error = code === 0 ? null : Object.assign(new Error(`codex beendete mit Status ${code}.`), { code });
      setImmediate(() => callback(error, stdout, stderr));
      return child;
    };
  }

  await check("Korrekturlauf – 1. Exit-Code 1 wird als reasonCode/codexRawOutput.exitCode sichtbar, statt im Fehlerpfad verworfen zu werden", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-exit-1",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stderr: "codex: Fehler beim Verarbeiten des Auftrags" }),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonCode, codexReadOnlyAdapter.CODEX_READ_ONLY_REASON_CODES.PROCESS_EXIT_NONZERO);
    assert.strictEqual(result.codexRawOutput.exitCode, 1);
    assert.ok(result.errors.join(" ").includes("Exit-Code 1"), "der Fehlertext muss den tatsächlichen Exit-Code sichtbar nennen");
    assert.ok(result.errors.join(" ").includes("codex: Fehler beim Verarbeiten des Auftrags"));
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – 2./4. stderrSample wird redigiert und begrenzt gespeichert (Secret in stderr verschwindet)", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-stderr-secret",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stderr: "Fehler. api_key: sk-ABCDEFGHIJ1234567890 ist ungültig." }),
    });
    assert.strictEqual(result.ok, false);
    assert.ok(!result.codexRawOutput.stderrSample.includes("sk-ABCDEFGHIJ1234567890"), "das Secret darf im gespeicherten stderrSample nicht auftauchen");
    assert.ok(result.codexRawOutput.stderrSample.includes("[REDACTED]"));
    assert.ok(!result.errors.join(" ").includes("sk-ABCDEFGHIJ1234567890"), "das Secret darf auch im sichtbaren Fehlertext nicht auftauchen");
    const veryLongStderr = "x".repeat(10_000);
    const boundedResult = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-stderr-long",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stderr: veryLongStderr }),
    });
    assert.ok(boundedResult.codexRawOutput.stderrSample.length < veryLongStderr.length, "stderrSample muss sicher begrenzt sein");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – 3. stdoutSample wird sicher begrenzt gespeichert und im Fehlertext nur als Rückfallebene genutzt, wenn stderr leer ist", async () => {
    const workspaceDir = makeWorkspace();
    const withStderr = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-stdout-fallback-not-needed",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stdout: "irrelevanter stdout-Text", stderr: "die eigentliche Fehlerursache" }),
    });
    assert.ok(!withStderr.errors.join(" ").includes("irrelevanter stdout-Text"), "stdout wird nicht gezeigt, wenn stderr bereits eine verwertbare Information liefert");

    const withoutStderr = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-stdout-fallback-needed",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stdout: "einzige verfügbare Diagnoseinformation", stderr: "" }),
    });
    assert.ok(withoutStderr.errors.join(" ").includes("einzige verfügbare Diagnoseinformation"), "stdout dient als Rückfallebene, wenn stderr leer ist");

    const veryLongStdout = "y".repeat(10_000);
    const boundedResult = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-stdout-long",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stdout: veryLongStdout, stderr: "" }),
    });
    assert.ok(boundedResult.codexRawOutput.stdoutSample.length < veryLongStdout.length, "stdoutSample muss sicher begrenzt sein");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – 5. ein am Fehlerobjekt vorhandenes Signal wird in codexRawOutput.signal übernommen (soweit vorhanden)", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-signal",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        const child = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => callback(Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }), "", ""));
        return child;
      },
    });
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.codexRawOutput.signal, "SIGTERM");
    assert.ok(result.errors.join(" ").includes("TIMEOUT"));

    // Kein Signal vorhanden (regulärer Exit-Code ohne Signal): bleibt
    // ehrlich null, statt fälschlich einen Wert vorzutäuschen.
    const withoutSignal = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-no-signal",
      prompt: "Analysiere die Struktur.",
      execFileImpl: fakeExecFileImplExitCode(1, { stderr: "regulärer Fehler ohne Signal" }),
    });
    assert.strictEqual(withoutSignal.codexRawOutput.signal, null);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – 6. Timeout bleibt eindeutig über reasonCode/timedOut erkennbar", async () => {
    const workspaceDir = makeWorkspace();
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-timeout-reasoncode",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        const child = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => callback(Object.assign(new Error("timeout"), { killed: true }), "", ""));
        return child;
      },
    });
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.reasonCode, codexReadOnlyAdapter.CODEX_READ_ONLY_REASON_CODES.TIMEOUT);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – 7. Cancel bleibt eindeutig über reasonCode/cancelled erkennbar", async () => {
    const workspaceDir = makeWorkspace();
    const attemptId = "attempt-cancel-reasoncode";
    const runPromise = codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId,
      prompt: "Analysiere die Struktur.",
      shouldAbort: () => true,
      execFileImpl: fakeExecFileImplWriting("Ergebnistext, das durch Cancel verworfen wird."),
    });
    const result = await runPromise;
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.reasonCode, codexReadOnlyAdapter.CODEX_READ_ONLY_REASON_CODES.CANCELLED);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------
  // Korrekturlauf, Abschnitt 6 ("Temp-Ausgabe"): ausschließlich ein hier
  // selbst per mkdtempSync erzeugtes, danach leeres codex-ro-out-*-
  // Verzeichnis wird automatisch entfernt.
  // -------------------------------------------------------------------

  await check("Korrekturlauf – 16. ein neu erzeugtes, leeres codex-ro-out-*-Verzeichnis wird nach dem Lauf zuverlässig entfernt (Erfolg und Fehlschlag)", async () => {
    const workspaceDir = makeWorkspace();
    let capturedOutputDir = null;
    const captureOutputDir = (file, args, options, callback) => {
      const idx = args.indexOf("--output-last-message");
      capturedOutputDir = path.dirname(args[idx + 1]);
      return fakeExecFileImplWriting("Ergebnistext.")(file, args, options, callback);
    };
    const successResult = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-cleanup-success",
      prompt: "Analysiere die Struktur.",
      execFileImpl: captureOutputDir,
    });
    assert.strictEqual(successResult.ok, true);
    assert.ok(capturedOutputDir && path.basename(capturedOutputDir).startsWith("codex-ro-out-"));
    assert.strictEqual(fs.existsSync(capturedOutputDir), false, "das selbst erzeugte, jetzt leere Temp-Verzeichnis muss nach einem erfolgreichen Lauf entfernt sein");

    let capturedFailureOutputDir = null;
    const failureResult = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-cleanup-failure",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        const idx = args.indexOf("--output-last-message");
        capturedFailureOutputDir = path.dirname(args[idx + 1]);
        return fakeExecFileImplExitCode(1, { stderr: "Fehler" })(file, args, options, callback);
      },
    });
    assert.strictEqual(failureResult.ok, false);
    assert.strictEqual(fs.existsSync(capturedFailureOutputDir), false, "das selbst erzeugte, jetzt leere Temp-Verzeichnis muss auch nach einem Fehlschlag entfernt sein");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – ein vom Aufrufer explizit übergebenes outputDir wird niemals automatisch entfernt (z. B. bestehende Testfixturen)", async () => {
    const workspaceDir = makeWorkspace();
    const explicitOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ro-explicit-outputdir-"));
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-explicit-outputdir",
      prompt: "Analysiere die Struktur.",
      outputDir: explicitOutputDir,
      execFileImpl: fakeExecFileImplWriting("Ergebnistext."),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.existsSync(explicitOutputDir), true, "ein vom Aufrufer übergebenes outputDir bleibt unangetastet");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(explicitOutputDir, { recursive: true, force: true });
  });

  await check("Korrekturlauf – ein selbst erzeugtes, aber nicht leeres Temp-Verzeichnis (unerwartete Zusatzdatei) wird NICHT rekursiv gelöscht", async () => {
    const workspaceDir = makeWorkspace();
    let capturedOutputDir = null;
    const result = await codexReadOnlyAdapter.runCodexReadOnlyAnalysis({
      workspaceDir,
      attemptId: "attempt-nonempty-outputdir",
      prompt: "Analysiere die Struktur.",
      execFileImpl: (file, args, options, callback) => {
        const idx = args.indexOf("--output-last-message");
        capturedOutputDir = path.dirname(args[idx + 1]);
        fs.writeFileSync(path.join(capturedOutputDir, "unerwartete-zusatzdatei.txt"), "unerwartet");
        return fakeExecFileImplWriting("Ergebnistext.")(file, args, options, callback);
      },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.existsSync(capturedOutputDir), true, "ein nicht-leeres Verzeichnis darf nicht rekursiv gelöscht werden");
    fs.rmSync(capturedOutputDir, { recursive: true, force: true });
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  await check("Phase 7 – 15. verfügbarer, aber nicht authentifizierter Codex führt zu einem eindeutigen Auth-Fehler", async () => {
    codexAdapter.resetCodexAvailabilityCacheForTests();
    const availability = codexAdapter.detectCodexAvailability({
      forceRefresh: true,
      execFileSyncImpl: (file, args) => {
        if (args[0] === "--version") return "codex-cli 0.999.0-test\n";
        if (args[0] === "login") return "Not logged in.\n";
        throw new Error("unbekannt");
      },
    });
    assert.strictEqual(availability.available, true);
    assert.strictEqual(availability.authenticated, false);
    codexAdapter.resetCodexAvailabilityCacheForTests();
  });

  console.log(`execution-codex-adapter-readonly.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("FEHLER:", error);
  process.exitCode = 1;
});
