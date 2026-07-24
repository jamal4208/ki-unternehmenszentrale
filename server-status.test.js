"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const serverStatus = require("./server-status");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function mockExecFactory(responses) {
  return (cmd, args, _opts, cb) => {
    assert.strictEqual(cmd, "git");
    assert.strictEqual(_opts.shell, false);
    const key = args.join(" ");
    const response = responses[key] || { error: new Error("unexpected git args") };
    process.nextTick(() => cb(response.error || null, response.stdout || "", ""));
  };
}

async function main() {
  check("captureStartupSnapshot ist unveränderlich (frozen)", () => {
    const snapshot = serverStatus.captureStartupSnapshot({ port: 4173, gitCommit: "a".repeat(40) });
    assert.ok(Object.isFrozen(snapshot));
    assert.throws(() => {
      snapshot.port = 9999;
    });
    assert.strictEqual(snapshot.appVersion, serverStatus.CENTRAL_APP_VERSION);
    assert.strictEqual(snapshot.gitCommit, "a".repeat(40));
    assert.strictEqual(snapshot.port, 4173);
    assert.ok(typeof snapshot.startedAt === "string" && snapshot.startedAt.length > 0);
  });

  check("captureStartupSnapshot markiert fehlenden Commit als UNKNOWN, keine Erfindung", () => {
    const snapshot = serverStatus.captureStartupSnapshot({ port: 4173, gitCommit: null });
    assert.strictEqual(snapshot.gitCommit, serverStatus.UNKNOWN);
  });

  check("describeVersionState: gleicher Commit ist RUNNING", () => {
    const result = serverStatus.describeVersionState("a".repeat(40), "a".repeat(40));
    assert.strictEqual(result.status, "RUNNING");
    assert.strictEqual(result.isCurrentVersion, true);
  });

  check("describeVersionState: abweichender Commit ist VERSION_MISMATCH", () => {
    const result = serverStatus.describeVersionState("a".repeat(40), "b".repeat(40));
    assert.strictEqual(result.status, "VERSION_MISMATCH");
    assert.strictEqual(result.isCurrentVersion, false);
  });

  check("describeVersionState: nicht lesbarer Git-Stand ist UNKNOWN, keine Erfindung", () => {
    assert.strictEqual(serverStatus.describeVersionState(serverStatus.UNKNOWN, "a".repeat(40)).status, "UNKNOWN");
    assert.strictEqual(serverStatus.describeVersionState("a".repeat(40), null).status, "UNKNOWN");
    assert.strictEqual(serverStatus.describeVersionState(serverStatus.UNKNOWN, null).isCurrentVersion, null);
  });

  check("buildServerStatusApiResponse: sichere gekürzte Antwort ohne volle Pfade", () => {
    const snapshot = serverStatus.captureStartupSnapshot({ port: 4173, gitCommit: "a".repeat(40) });
    const payload = serverStatus.buildServerStatusApiResponse({
      snapshot,
      currentGitCommit: "a".repeat(40),
      controllerRecord: null,
      currentPid: 12345,
      currentPort: 4173,
    });
    assert.strictEqual(payload.status, "RUNNING");
    assert.strictEqual(payload.port, 4173);
    assert.strictEqual(payload.pid, 12345);
    assert.strictEqual(payload.appVersion, serverStatus.CENTRAL_APP_VERSION);
    assert.strictEqual(payload.currentProjectCommit, "a".repeat(40));
    assert.strictEqual(payload.isCurrentVersion, true);
    assert.strictEqual(payload.managedByController, false);
    assert.strictEqual(payload.controllerSchemaVersion, null);
    assert.ok(typeof payload.message === "string" && payload.message.length > 0);
    assert.ok(typeof payload.nextAction === "string" && payload.nextAction.length > 0);
    assert.deepStrictEqual(Object.keys(payload).some((key) => /path|Path/.test(key)), false);
  });

  check("buildServerStatusApiResponse: writeOperationsBlocked/madeExternalRequest sind Sicherheitsflags", () => {
    const snapshot = serverStatus.captureStartupSnapshot({ port: 4173, gitCommit: null });
    const payload = serverStatus.buildServerStatusApiResponse({
      snapshot,
      currentGitCommit: null,
      controllerRecord: null,
      currentPid: 1,
      currentPort: 4173,
    });
    assert.strictEqual(payload.writeOperationsBlocked, true);
    assert.strictEqual(payload.madeExternalRequest, false);
    assert.strictEqual(payload.status, "UNKNOWN");
  });

  check("buildServerStatusApiResponse: managedByController nur bei exaktem pid+port Treffer", () => {
    const snapshot = serverStatus.captureStartupSnapshot({ port: 4173, gitCommit: "a".repeat(40) });
    const matching = serverStatus.buildServerStatusApiResponse({
      snapshot,
      currentGitCommit: "a".repeat(40),
      controllerRecord: { pid: 555, port: 4173, controllerSchemaVersion: 1 },
      currentPid: 555,
      currentPort: 4173,
    });
    assert.strictEqual(matching.managedByController, true);
    assert.strictEqual(matching.controllerSchemaVersion, 1);

    const mismatchingPid = serverStatus.buildServerStatusApiResponse({
      snapshot,
      currentGitCommit: "a".repeat(40),
      controllerRecord: { pid: 999, port: 4173, controllerSchemaVersion: 1 },
      currentPid: 555,
      currentPort: 4173,
    });
    assert.strictEqual(mismatchingPid.managedByController, false);
    assert.strictEqual(mismatchingPid.controllerSchemaVersion, null);
  });

  check("shortCommit kürzt sicher und erfindet nichts bei UNKNOWN", () => {
    assert.strictEqual(serverStatus.shortCommit("a".repeat(40)), "a".repeat(12));
    assert.strictEqual(serverStatus.shortCommit(serverStatus.UNKNOWN), "UNKNOWN");
    assert.strictEqual(serverStatus.shortCommit(null), "UNKNOWN");
  });

  check("readGitCommitReadOnly nutzt ausschließlich feste argv, kein shell", async () => {
    const execFileImpl = mockExecFactory({
      "rev-parse HEAD": { stdout: `${"c".repeat(40)}\n` },
    });
    const commit = await serverStatus.readGitCommitReadOnly("/tmp/irrelevant", { execFileImpl });
    assert.strictEqual(commit, "c".repeat(40));
  });

  check("readGitCommitReadOnly liefert null statt Erfindung bei Fehler", async () => {
    const execFileImpl = mockExecFactory({});
    const commit = await serverStatus.readGitCommitReadOnly("/tmp/irrelevant", { execFileImpl });
    assert.strictEqual(commit, null);
  });

  check("resolveStatusPaths bleibt außerhalb beider Repositories (Default-Pfad)", () => {
    const paths = serverStatus.resolveStatusPaths({});
    assert.ok(paths.appSupportDir.includes("Library"));
    assert.ok(paths.appSupportDir.includes("Application Support"));
    assert.ok(paths.appSupportDir.includes("KI-Unternehmenszentrale"));
    assert.ok(paths.statusFilePath.startsWith(paths.appSupportDir));
  });

  check("computeProjectFingerprint ist deterministisch und ist kein Klartextpfad", () => {
    const fingerprintA = serverStatus.computeProjectFingerprint(process.cwd());
    const fingerprintB = serverStatus.computeProjectFingerprint(process.cwd());
    assert.strictEqual(fingerprintA, fingerprintB);
    assert.ok(!fingerprintA.includes("/"));
    assert.ok(!fingerprintA.includes(process.cwd()));
  });

  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "server-status-test-"));
    const paths = serverStatus.resolveStatusPaths({ appSupportDir: tmpDir, projectRoot: process.cwd() });

    check("readStatusFileSafe: fehlende Datei ist MISSING, kein Fehler", () => {
      const result = serverStatus.readStatusFileSafe(paths);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "MISSING");
    });

    check("readStatusFileSafe: korrupte Datei wird sicher als CORRUPT erkannt", () => {
      fs.mkdirSync(paths.serverDir, { recursive: true });
      fs.writeFileSync(paths.statusFilePath, "{ not valid json", "utf8");
      const result = serverStatus.readStatusFileSafe(paths);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "CORRUPT");
    });

    check("readStatusFileSafe: zu große Datei wird abgewiesen (Größenbegrenzung)", () => {
      fs.writeFileSync(paths.statusFilePath, "x".repeat(serverStatus.MAX_STATUS_FILE_BYTES + 100), "utf8");
      const result = serverStatus.readStatusFileSafe(paths);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "TOO_LARGE");
    });

    check("readStatusFileSafe: fremde Controller-Schema-Version wird nicht blind akzeptiert", () => {
      fs.writeFileSync(
        paths.statusFilePath,
        JSON.stringify({
          controllerSchemaVersion: 999,
          pid: 1,
          port: 4173,
          startedAt: new Date().toISOString(),
          appVersion: "x",
          gitCommit: "a".repeat(40),
          projectFingerprint: "abc",
        }),
        "utf8",
      );
      const result = serverStatus.readStatusFileSafe(paths);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "SCHEMA_MISMATCH");
    });

    check("readStatusFileSafe: enthält keine Secrets/Env-Felder in ihrem Schema", () => {
      const validRecord = {
        controllerSchemaVersion: serverStatus.CONTROLLER_SCHEMA_VERSION,
        pid: 1,
        port: 4173,
        startedAt: new Date().toISOString(),
        appVersion: "x",
        gitCommit: "a".repeat(40),
        projectFingerprint: "abc",
      };
      fs.writeFileSync(paths.statusFilePath, JSON.stringify(validRecord), "utf8");
      const result = serverStatus.readStatusFileSafe(paths);
      assert.strictEqual(result.ok, true);
      const forbiddenKeys = Object.keys(result.record).filter((key) =>
        /secret|token|password|apikey|env/i.test(key),
      );
      assert.deepStrictEqual(forbiddenKeys, []);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
