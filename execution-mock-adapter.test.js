"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const adapter = require("./execution-mock-adapter");

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
  fs.writeFileSync(path.join(dir, "FIXTURE_NOTE.md"), "# Vorher\n", "utf8");
  return dir;
}

async function main() {
  await checkAsync("Mock 1. Erfolg ändert nur die erlaubte Datei", async () => {
    const dir = freshWorkspace("mock-1-");
    const result = await adapter.runMockExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_NOTE.md"],
      scenario: adapter.SCENARIOS.SUCCESS,
      attemptId: "att-test-1",
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.changedFiles, ["FIXTURE_NOTE.md"]);
    assert.strictEqual(result.testStatus, "PASSED");
    assert.strictEqual(result.testExitCode, 0);
    assert.ok(result.diff[0].afterHash);
    assert.notStrictEqual(result.diff[0].beforeHash, result.diff[0].afterHash);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 2. Erfolgsbericht enthält keinen KI-Anspruch, sondern das Mock-Label", async () => {
    const dir = freshWorkspace("mock-2-");
    const result = await adapter.runMockExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_NOTE.md"],
      scenario: adapter.SCENARIOS.SUCCESS,
      attemptId: "att-test-2",
    });
    assert.match(result.label, /Mock-Executor/);
    assert.match(result.label, /keine KI-Ausführung/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 3. Allowlist-Verstoß-Szenario schreibt zusätzlich eine nicht erlaubte Datei", async () => {
    const dir = freshWorkspace("mock-3-");
    const result = await adapter.runMockExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_NOTE.md"],
      scenario: adapter.SCENARIOS.ALLOWLIST_VIOLATION,
      attemptId: "att-test-3",
    });
    assert.ok(result.changedFiles.includes("UNAUTHORIZED_MOCK_CHANGE.txt"));
    assert.ok(fs.existsSync(path.join(dir, "UNAUTHORIZED_MOCK_CHANGE.txt")));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 4. Fehler-Szenario liefert terminalen Fehlstatus ohne Dateiänderung", async () => {
    const dir = freshWorkspace("mock-4-");
    const before = fs.readFileSync(path.join(dir, "FIXTURE_NOTE.md"), "utf8");
    const result = await adapter.runMockExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_NOTE.md"],
      scenario: adapter.SCENARIOS.FAILURE,
      attemptId: "att-test-4",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, true);
    assert.strictEqual(result.testExitCode, 1);
    assert.strictEqual(fs.readFileSync(path.join(dir, "FIXTURE_NOTE.md"), "utf8"), before);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 5. Symlink-Flucht außerhalb des Workspace wird abgewiesen", async () => {
    const dir = freshWorkspace("mock-5-");
    await assert.rejects(
      adapter.runMockExecutionScenario({
        workspaceDir: dir,
        allowedFiles: ["../../etc/passwd"],
        scenario: adapter.SCENARIOS.SUCCESS,
        attemptId: "att-test-5",
      }),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 6. Unbekanntes Szenario wird abgelehnt", async () => {
    const dir = freshWorkspace("mock-6-");
    await assert.rejects(
      adapter.runMockExecutionScenario({
        workspaceDir: dir,
        allowedFiles: ["FIXTURE_NOTE.md"],
        scenario: "FREE_FORM_COMMAND",
        attemptId: "att-test-6",
      }),
      /unbekanntes Szenario/i,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await checkAsync("Mock 7. TIMEOUT-Szenario reagiert auf shouldAbort und schreibt keine Datei", async () => {
    const dir = freshWorkspace("mock-7-");
    const before = fs.readFileSync(path.join(dir, "FIXTURE_NOTE.md"), "utf8");
    let aborted = false;
    setTimeout(() => {
      aborted = true;
    }, 40);
    const result = await adapter.runMockExecutionScenario({
      workspaceDir: dir,
      allowedFiles: ["FIXTURE_NOTE.md"],
      scenario: adapter.SCENARIOS.TIMEOUT,
      attemptId: "att-test-7",
      timeoutDelayMs: 5000,
      shouldAbort: () => aborted,
    });
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.failed, false);
    assert.deepStrictEqual(result.changedFiles, []);
    assert.strictEqual(fs.readFileSync(path.join(dir, "FIXTURE_NOTE.md"), "utf8"), before);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  check("Mock 8. Modul verwendet weder child_process noch net/http (keine Shell, kein Netzwerk)", () => {
    const source = fs.readFileSync(path.join(__dirname, "execution-mock-adapter.js"), "utf8");
    assert.doesNotMatch(source, /require\(["']child_process["']\)/);
    assert.doesNotMatch(source, /require\(["']net["']\)/);
    assert.doesNotMatch(source, /require\(["']http["']\)/);
    assert.doesNotMatch(source, /require\(["']https["']\)/);
    assert.doesNotMatch(source, /shell:\s*true/);
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
