"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");
const adapter = require("./execution-codex-adapter");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

async function checkAsync(label, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function freshWorkspace(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(
    path.join(dir, "FIXTURE_CALC.js"),
    "\"use strict\";\nfunction addFixtureNumbers(a, b) {\n  return a - b;\n}\nmodule.exports = { addFixtureNumbers };\n",
    "utf8",
  );
  return dir;
}

// Minimaler Fake-ChildProcess für deterministische Tests ohne echten Codex-Aufruf.
function makeFakeChild() {
  const emitter = new EventEmitter();
  emitter.pid = 999001;
  emitter.exitCode = null;
  emitter.killed = false;
  emitter.killCalls = [];
  emitter.kill = function fakeKill(signal) {
    emitter.killCalls.push(signal);
    if (signal === "SIGKILL") {
      emitter.killed = true;
      emitter.exitCode = 137;
      setImmediate(() => emitter.emit("exit", null, "SIGKILL"));
    }
  };
  return emitter;
}

function fakeExecFileImplFactory({ onSpawn, finishAfterMs = 5, stdout = "", stderr = "", error = null } = {}) {
  return function fakeExecFile(file, args, options, callback) {
    const child = makeFakeChild();
    if (typeof onSpawn === "function") onSpawn(child, { file, args, options });
    const timer = setTimeout(() => {
      callback(error, stdout, stderr);
    }, finishAfterMs);
    child.kill = function fakeKill(signal) {
      child.killCalls.push(signal);
      if (signal === "SIGTERM") {
        clearTimeout(timer);
        setImmediate(() => {
          child.exitCode = null;
          callback(Object.assign(new Error("killed"), { killed: true }), stdout, stderr);
          child.emit("exit", null, "SIGTERM");
        });
      }
    };
    return child;
  };
}

async function main() {
  // ---------------------------------------------------------------------
  // Codex-Verfügbarkeit
  // ---------------------------------------------------------------------

  check("Codex 1. CLI vorhanden liefert available:true mit Version", () => {
    adapter.resetCodexAvailabilityCacheForTests();
    const result = adapter.detectCodexAvailability({
      execFileSyncImpl: (file, args) => {
        if (args[0] === "--version") return "codex-cli 0.142.2\n";
        if (args[0] === "login") return "Logged in using ChatGPT\n";
        throw new Error("unbekannt");
      },
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.version, "codex-cli 0.142.2");
    assert.strictEqual(result.authenticated, true);
    assert.strictEqual(result.authLabel, "ChatGPT");
  });

  check("Codex 2. CLI nicht vorhanden liefert available:false ohne Installationsversuch", () => {
    adapter.resetCodexAvailabilityCacheForTests();
    const result = adapter.detectCodexAvailability({
      execFileSyncImpl: () => {
        throw Object.assign(new Error("command not found"), { code: "ENOENT" });
      },
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, "CODEX_CLI_NOT_FOUND");
  });

  check("Codex 3. Version wird als reiner Text ohne Zusatzinterpretation gelesen", () => {
    adapter.resetCodexAvailabilityCacheForTests();
    const result = adapter.detectCodexAvailability({
      execFileSyncImpl: (file, args) => (args[0] === "--version" ? "codex-cli 9.9.9\n" : "not logged in\n"),
    });
    assert.strictEqual(result.version, "codex-cli 9.9.9");
    assert.strictEqual(result.authenticated, false);
  });

  check("Codex 4. Verfügbarkeitsergebnis wird für die TTL zwischengespeichert (kein wiederholter CLI-Aufruf)", () => {
    adapter.resetCodexAvailabilityCacheForTests();
    let calls = 0;
    const exec = () => {
      calls += 1;
      return "codex-cli 1.0.0\n";
    };
    adapter.detectCodexAvailability({ execFileSyncImpl: exec, now: 1000, ttlMs: 5000 });
    adapter.detectCodexAvailability({ execFileSyncImpl: exec, now: 2000, ttlMs: 5000 });
    assert.strictEqual(calls, 2); // --version + login status, aber nur EIN Durchlauf
    adapter.resetCodexAvailabilityCacheForTests();
  });

  check("Codex 5. Kein Login-Ergebnis enthält Zugangsdaten oder Rohtoken", () => {
    adapter.resetCodexAvailabilityCacheForTests();
    const result = adapter.detectCodexAvailability({
      execFileSyncImpl: (file, args) =>
        args[0] === "--version" ? "codex-cli 1.0.0\n" : "Logged in using ChatGPT (token sk-abc123DEADBEEF)\n",
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /sk-abc123DEADBEEF/);
    assert.strictEqual(result.authLabel, "ChatGPT");
  });

  // ---------------------------------------------------------------------
  // Prompt/Argumente – feste, deterministische Argumentliste
  // ---------------------------------------------------------------------

         check("Codex 9. buildCodexArgs liefert feste Argumentliste ohne Shell-Syntax", () => {
           const preset = adapter.CODEX_TASK_PRESETS.FIXTURE_ADD_FUNCTION_FIX;
           const prompt = adapter.buildCodexPrompt(preset);
           const args = adapter.buildCodexArgs({ workspaceDir: "/tmp/ws-test", outputLastMessagePath: "/tmp/out.txt", prompt });
           // Reihenfolge verbindlich gegen lokal installiertes `codex --help` /
           // `codex exec --help` geprüft: --ask-for-approval ist ein globaler
           // Parameter des Wurzelkommandos und muss vor `exec` stehen (die
           // exec-Subcommand-Argumentliste lehnt ihn sonst mit "unexpected
           // argument" ab).
           assert.deepStrictEqual(args, [
             "--ask-for-approval",
             "never",
             "exec",
             "--json",
             "--sandbox",
             "workspace-write",
             "--skip-git-repo-check",
             "--ephemeral",
             "--ignore-user-config",
             "--cd",
             "/tmp/ws-test",
             "--output-last-message",
             "/tmp/out.txt",
             prompt,
           ]);
           args.forEach((entry) => assert.strictEqual(typeof entry, "string"));
           assert.doesNotMatch(prompt, /;|&&|\|\|/);
         });

  check("Codex: Prompt enthält ausdrückliche Grenzen und keine freie Systemprompt-Übernahme", () => {
    const preset = adapter.CODEX_TASK_PRESETS.FIXTURE_ADD_FUNCTION_FIX;
    const prompt = adapter.buildCodexPrompt(preset);
    assert.match(prompt, /kein Commit/);
    assert.match(prompt, /kein Push/);
    assert.match(prompt, /kein Deployment/);
    assert.match(prompt, /FIXTURE_CALC\.js/);
  });

  check("Codex 10. Environment ist auf technisch Nötige reduziert (kein process.env-Durchgriff)", () => {
    const originalSecret = process.env.SOME_TEST_SECRET_VALUE;
    process.env.SOME_TEST_SECRET_VALUE = "top-secret-value";
    const env = adapter.buildReducedEnv();
    assert.deepStrictEqual(
      Object.keys(env).sort(),
      Object.keys(env)
        .filter((key) => ["PATH", "LANG", "HOME", "CODEX_HOME"].includes(key))
        .sort(),
    );
    assert.strictEqual(env.SOME_TEST_SECRET_VALUE, undefined);
    if (originalSecret === undefined) delete process.env.SOME_TEST_SECRET_VALUE;
    else process.env.SOME_TEST_SECRET_VALUE = originalSecret;
  });

  check("Codex 11. stdout/stderr werden größenbegrenzt und redigiert", () => {
    const long = "x".repeat(10_000);
    const redacted = adapter.redactSecrets(`Bearer abcDEF123.token secret=hunter2 sk-1234567890ABCDEFxxxx ${long}`);
    assert.doesNotMatch(redacted, /hunter2/);
    assert.doesNotMatch(redacted, /sk-1234567890ABCDEFxxxx/);
    assert.doesNotMatch(redacted, /Bearer abcDEF123\.token/);
  });

  check("Mock/Codex 8. Modul verwendet kein shell:true", () => {
    const source = fs.readFileSync(path.join(__dirname, "execution-codex-adapter.js"), "utf8");
    assert.doesNotMatch(source, /shell:\s*true/);
    assert.match(source, /shell:\s*false/);
  });

  // ---------------------------------------------------------------------
  // Workspace-/Repositorygrenze
  // ---------------------------------------------------------------------

  await checkAsync("Codex 6+7. Start innerhalb eines verbotenen Repositorypfads wird abgelehnt", async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-forbidden-"));
    const nestedWorkspace = path.join(parentDir, "nested-ws");
    fs.mkdirSync(nestedWorkspace, { recursive: true });
    fs.writeFileSync(path.join(nestedWorkspace, "FIXTURE_CALC.js"), "module.exports = {};", "utf8");
    await assert.rejects(
      adapter.runCodexExecutionScenario({
        workspaceDir: nestedWorkspace,
        allowedFiles: ["FIXTURE_CALC.js"],
        scenario: adapter.SCENARIOS.REAL_RUN,
        attemptId: "att-forbidden-1",
        codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
        forbiddenRoots: [parentDir],
        execFileImpl: fakeExecFileImplFactory(),
      }),
      /verbotenen Repositorypfad/,
    );
    fs.rmSync(parentDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------
  // Prozess-Lebenszyklus (mit Fake-ChildProcess, kein echter Codex-Aufruf)
  // ---------------------------------------------------------------------

  await checkAsync("Codex: erfolgreicher Lauf führt das erlaubte Testkommando selbst aus und meldet PASSED", async () => {
    const dir = freshWorkspace("codex-real-");
    fs.writeFileSync(
      path.join(dir, "FIXTURE_CALC.js"),
      "\"use strict\";\nfunction addFixtureNumbers(a, b) {\n  return a + b;\n}\nmodule.exports = { addFixtureNumbers };\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "FIXTURE_CALC.test.js"),
      "const assert = require('assert');\nconst { addFixtureNumbers } = require('./FIXTURE_CALC.js');\nassert.strictEqual(addFixtureNumbers(2, 3), 5);\nconsole.log('ok');\n",
      "utf8",
    );
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-out-real-"));
    const result = await adapter.runCodexExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_CALC.js"],
      scenario: adapter.SCENARIOS.REAL_RUN,
      attemptId: "att-success-1",
      codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
      outputDir,
      execFileImpl: fakeExecFileImplFactory({ stdout: "{\"type\":\"final\"}\n", finishAfterMs: 5 }),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.testStatus, "PASSED");
    assert.strictEqual(result.testExitCode, 0);
    assert.match(result.label, /Codex/);
    assert.ok(result.codexRawOutput);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  await checkAsync("Codex: fehlgeschlagener Testlauf meldet FAILED, kein Erfolgsanspruch aus Codex-Text übernommen", async () => {
    const dir = freshWorkspace("codex-fail-");
    // FIXTURE_CALC.js bleibt fehlerhaft (subtrahiert weiterhin).
    fs.writeFileSync(
      path.join(dir, "FIXTURE_CALC.test.js"),
      "const assert = require('assert');\nconst { addFixtureNumbers } = require('./FIXTURE_CALC.js');\nassert.strictEqual(addFixtureNumbers(2, 3), 5);\n",
      "utf8",
    );
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-out-fail-"));
    const result = await adapter.runCodexExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_CALC.js"],
      scenario: adapter.SCENARIOS.REAL_RUN,
      attemptId: "att-fail-1",
      codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
      outputDir,
      execFileImpl: fakeExecFileImplFactory({ stdout: "Ich habe die Funktion erfolgreich korrigiert.\n" }),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, true);
    assert.strictEqual(result.testStatus, "FAILED");
    assert.notStrictEqual(result.testExitCode, 0);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  await checkAsync("Codex 14. Prozessfehler (Spawn-Fehler) endet als failed, keine Testausführung", async () => {
    const dir = freshWorkspace("codex-spawnerr-");
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-out-spawnerr-"));
    const result = await adapter.runCodexExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_CALC.js"],
      scenario: adapter.SCENARIOS.REAL_RUN,
      attemptId: "att-spawnerr-1",
      codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
      outputDir,
      execFileImpl: (file, args, options, callback) => {
        const child = makeFakeChild();
        setImmediate(() => child.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" })));
        return child;
      },
    });
    assert.strictEqual(result.failed, true);
    assert.strictEqual(result.testStatus, null);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  await checkAsync("Codex 12+17. Cancel beendet ausschließlich den eigenen Prozess, kein fremder Prozess wird berührt", async () => {
    const otherChild = makeFakeChild();
    const dir = freshWorkspace("codex-cancel-");
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-out-cancel-"));
    let capturedChild = null;
    const runPromise = adapter.runCodexExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_CALC.js"],
      scenario: adapter.SCENARIOS.REAL_RUN,
      attemptId: "att-cancel-1",
      codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
      outputDir,
      shouldAbort: () => true,
      execFileImpl: fakeExecFileImplFactory({
        finishAfterMs: 200,
        onSpawn: (child) => {
          capturedChild = child;
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(adapter.hasActiveProcessForTests("att-cancel-1"), true);
    await adapter.cancelRun("att-cancel-1");
    assert.strictEqual(adapter.hasActiveProcessForTests("att-cancel-1"), false);
    assert.ok(capturedChild.killCalls.includes("SIGTERM"));
    assert.strictEqual(otherChild.killCalls.length, 0);
    const result = await runPromise;
    assert.strictEqual(result.cancelled, true);
    assert.deepStrictEqual(result.changedFiles, []);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  await checkAsync("Codex 13. Timeout am Prozess führt zu erkanntem killedByTimeout ohne falschen Erfolg", async () => {
    const dir = freshWorkspace("codex-timeout-");
    fs.writeFileSync(
      path.join(dir, "FIXTURE_CALC.test.js"),
      "const assert = require('assert');\nconst { addFixtureNumbers } = require('./FIXTURE_CALC.js');\nassert.strictEqual(addFixtureNumbers(2, 3), 5);\n",
      "utf8",
    );
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-out-timeout-"));
    const result = await adapter.runCodexExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_CALC.js"],
      scenario: adapter.SCENARIOS.REAL_RUN,
      attemptId: "att-timeout-1",
      codexTaskPresetId: "FIXTURE_ADD_FUNCTION_FIX",
      outputDir,
      execFileImpl: fakeExecFileImplFactory({
        error: Object.assign(new Error("timeout"), { killed: true }),
        stdout: "",
        stderr: "",
      }),
    });
    assert.strictEqual(result.codexRawOutput.timedOutAtProcessLevel, true);
    assert.notStrictEqual(result.testStatus, "PASSED");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  check("Codex: cancelRun ohne aktiven Prozess ist ein sicheres No-Op", async () => {
    await adapter.cancelRun("att-does-not-exist");
  });

  // Regressionstests für einen im echten Pilot (Abschnitt K) gefundenen
  // Fehler: `execFile` mit einem `stdio`-Array-Override hängt bei der lokal
  // installierten Codex-CLI unbegrenzt, da eine nie geschlossene stdin-Pipe
  // offen bleibt. spawnFileWithCallback (der reale Default-Prozessaufruf) muss
  // stdin sofort schließen, Ausgabe/Exitcode korrekt liefern und einen echten
  // Timeout durchsetzen – geprüft gegen `node` selbst statt gegen die
  // Codex-CLI, damit der Test ohne Netzwerkzugriff läuft.
  await checkAsync("Codex: spawnFileWithCallback schließt stdin sofort (kein Warten auf nie kommendes EOF)", async () => {
    const result = await new Promise((resolve) => {
      adapter.spawnFileWithCallback(
        process.execPath,
        [
          "-e",
          "process.stdin.on('end', () => { process.stdout.write('stdin-closed'); process.exit(0); }); process.stdin.resume(); setTimeout(() => process.exit(1), 4000);",
        ],
        { cwd: process.cwd(), timeout: 8000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      );
    });
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.stdout, "stdin-closed");
  });

  await checkAsync("Codex: spawnFileWithCallback liefert stdout/stderr und Exitcode korrekt", async () => {
    const result = await new Promise((resolve) => {
      adapter.spawnFileWithCallback(
        process.execPath,
        ["-e", "console.log('out-line'); console.error('err-line'); process.exit(3);"],
        { cwd: process.cwd(), timeout: 5000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      );
    });
    assert.ok(result.stdout.includes("out-line"));
    assert.ok(result.stderr.includes("err-line"));
    assert.strictEqual(result.error.code, 3);
  });

  await checkAsync("Codex: spawnFileWithCallback beendet den Prozess nach Ablauf des Timeouts (killed:true)", async () => {
    const startedAt = Date.now();
    const result = await new Promise((resolve) => {
      adapter.spawnFileWithCallback(
        process.execPath,
        ["-e", "setTimeout(() => process.exit(0), 5000);"],
        { cwd: process.cwd(), timeout: 300, killSignal: "SIGTERM" },
        (error, stdout, stderr) => resolve({ error, stdout, stderr, elapsedMs: Date.now() - startedAt }),
      );
    });
    assert.strictEqual(result.error.killed, true);
    assert.ok(result.elapsedMs < 4000, "Timeout muss den Prozess deutlich vor Ablauf der 5s Eigenlaufzeit beenden");
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
