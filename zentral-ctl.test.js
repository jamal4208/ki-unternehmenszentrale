"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const net = require("net");
const ctl = require("./scripts/zentral-ctl");

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

function freshTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const p = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(p)));
    });
    server.on("error", reject);
  });
}

async function main() {
  const projectRoot = process.cwd();

  await checkAsync("1. status ohne Statusdatei ist STOPPED, kein Fehler", async () => {
    const tmpDir = freshTmpDir("ctl-1-");
    const freePort = await getFreePort();
    const status = await ctl.computeControllerStatus({ appSupportDir: tmpDir, projectRoot, port: freePort });
    assert.strictEqual(status.status, "STOPPED");
    assert.strictEqual(status.managedByController, false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("2. stale Statusdatei (toter PID) wird als STALE erkannt, kein Kill", async () => {
    const tmpDir = freshTmpDir("ctl-2-");
    const paths = ctl.resolvePaths({ appSupportDir: tmpDir, projectRoot });
    ctl.writeStatusFileAtomic(paths, {
      pid: 999999,
      port: 4173,
      startedAt: new Date().toISOString(),
      appVersion: "V7.0 Phase B",
      gitCommit: "a".repeat(40),
      projectFingerprint: ctl.computeProjectFingerprint(projectRoot),
    });
    const status = await ctl.computeControllerStatus({ appSupportDir: tmpDir, projectRoot, port: 4173 });
    assert.strictEqual(status.status, "STALE");
    assert.strictEqual(status.managedByController, false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("3. korrupte Statusdatei führt zu STALE statt Absturz", async () => {
    const tmpDir = freshTmpDir("ctl-3-");
    const paths = ctl.resolvePaths({ appSupportDir: tmpDir, projectRoot });
    fs.mkdirSync(paths.serverDir, { recursive: true });
    fs.writeFileSync(paths.statusFilePath, "{ kaputt", "utf8");
    const status = await ctl.computeControllerStatus({ appSupportDir: tmpDir, projectRoot, port: 4173 });
    assert.strictEqual(status.status, "STALE");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("4. selbst gestarteter aktueller Prozess ist RUNNING", async () => {
    const tmpDir = freshTmpDir("ctl-4-");
    const freePort = await getFreePort();
    const options = { appSupportDir: tmpDir, projectRoot, port: freePort };
    const startResult = await ctl.startServer(options);
    assert.strictEqual(startResult.ok, true);
    const status = await ctl.computeControllerStatus(options);
    assert.strictEqual(status.status, "RUNNING");
    assert.strictEqual(status.managedByController, true);
    assert.strictEqual(status.pid, startResult.pid);
    await ctl.stopServer(options);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("5. fremder Prozess auf Standardport wird als PORT_CONFLICT erkannt", async () => {
    const tmpDir = freshTmpDir("ctl-5-");
    const freePort = await getFreePort();
    const foreignServer = await occupyPort(freePort);
    try {
      const status = await ctl.computeControllerStatus({ appSupportDir: tmpDir, projectRoot, port: freePort });
      assert.strictEqual(status.status, "PORT_CONFLICT");
      assert.strictEqual(status.managedByController, false);
    } finally {
      await new Promise((resolve) => foreignServer.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await checkAsync("6. fremder Prozess auf Port wird bei start() nicht beendet (kein Kill)", async () => {
    const tmpDir = freshTmpDir("ctl-6-");
    const freePort = await getFreePort();
    const foreignServer = await occupyPort(freePort);
    try {
      const result = await ctl.startServer({ appSupportDir: tmpDir, projectRoot, port: freePort });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, "PORT_CONFLICT");
      assert.strictEqual(foreignServer.listening, true);
    } finally {
      await new Promise((resolve) => foreignServer.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await checkAsync("7. stop verlangt sichere Prozesszuordnung (falscher Fingerprint wird abgewiesen)", async () => {
    const tmpDir = freshTmpDir("ctl-7-");
    const paths = ctl.resolvePaths({ appSupportDir: tmpDir, projectRoot });
    // Long-lived helper process that is NOT server.js, to prove ownership checks refuse it.
    const { spawn } = require("child_process");
    const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      stdio: "ignore",
      detached: true,
    });
    helper.unref();
    ctl.writeStatusFileAtomic(paths, {
      pid: helper.pid,
      port: 4173,
      startedAt: new Date().toISOString(),
      appVersion: "V7.0 Phase B",
      gitCommit: "a".repeat(40),
      projectFingerprint: ctl.computeProjectFingerprint(projectRoot),
    });
    const result = await ctl.stopServer({ appSupportDir: tmpDir, projectRoot });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "REFUSED_UNSAFE_TARGET");
    assert.strictEqual(ctl.isPidAlive(helper.pid), true, "fremder Prozess darf nicht beendet worden sein");
    process.kill(helper.pid, "SIGKILL");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("8. restart betrifft ausschließlich den eigenen Prozess (neue PID, gleicher Port)", async () => {
    const tmpDir = freshTmpDir("ctl-8-");
    const freePort = await getFreePort();
    const options = { appSupportDir: tmpDir, projectRoot, port: freePort };
    const startResult = await ctl.startServer(options);
    assert.strictEqual(startResult.ok, true);
    const restartResult = await ctl.restartServer(options);
    assert.strictEqual(restartResult.ok, true);
    assert.notStrictEqual(restartResult.pid, startResult.pid);
    assert.strictEqual(restartResult.port, freePort);
    await ctl.stopServer(options);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await checkAsync("9. keine zweite parallele verwaltete Instanz desselben Projekts", async () => {
    const tmpDir = freshTmpDir("ctl-9-");
    const freePort = await getFreePort();
    const options = { appSupportDir: tmpDir, projectRoot, port: freePort };
    const first = await ctl.startServer(options);
    assert.strictEqual(first.ok, true);
    const secondPort = await getFreePort();
    const second = await ctl.startServer({ ...options, port: secondPort });
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.code, "ALREADY_RUNNING");
    await ctl.stopServer(options);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  check("10. alternativer Port nur bei expliziter CLI-Angabe", () => {
    assert.deepStrictEqual(ctl.parseArgv(["start"]), { command: "start", port: null });
    assert.deepStrictEqual(ctl.parseArgv(["start", "--port", "4174"]), { command: "start", port: 4174 });
    assert.strictEqual(ctl.DEFAULT_PORT, 4173);
  });

  check("11. keine Shell-Strings, kein shell:true im Controllercode", () => {
    const source = fs.readFileSync(path.join(__dirname, "scripts", "zentral-ctl.js"), "utf8");
    assert.doesNotMatch(source, /shell:\s*true/);
    assert.doesNotMatch(source, /exec\(/);
  });

  await checkAsync("12. atomare Statusdatei (tmp-Datei + rename, kein halbfertiger Zustand)", async () => {
    const tmpDir = freshTmpDir("ctl-12-");
    const paths = ctl.resolvePaths({ appSupportDir: tmpDir, projectRoot });
    const writeResult = ctl.writeStatusFileAtomic(paths, {
      pid: process.pid,
      port: 4173,
      startedAt: new Date().toISOString(),
      appVersion: "V7.0 Phase B",
      gitCommit: "a".repeat(40),
      projectFingerprint: "abc",
    });
    assert.strictEqual(writeResult.ok, true);
    assert.strictEqual(fs.existsSync(paths.tmpFilePath), false, "tmp-Datei darf nach rename nicht mehr existieren");
    assert.strictEqual(fs.existsSync(paths.statusFilePath), true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  check("13. App-Support-Pfad liegt außerhalb des Repositories", () => {
    const paths = ctl.resolvePaths({});
    assert.ok(!paths.appSupportDir.startsWith(projectRoot));
    assert.ok(paths.appSupportDir.includes("Application Support"));
  });

  check("14. Statusdatei enthält keine Secrets/Env-Variablen (fixes Feldschema)", () => {
    const tmpDir = freshTmpDir("ctl-14-");
    const paths = ctl.resolvePaths({ appSupportDir: tmpDir, projectRoot });
    ctl.writeStatusFileAtomic(paths, {
      pid: process.pid,
      port: 4173,
      startedAt: new Date().toISOString(),
      appVersion: "V7.0 Phase B",
      gitCommit: "a".repeat(40),
      projectFingerprint: "abc",
      // Deliberately attempt to smuggle extra fields; writeStatusFileAtomic must strip them.
      apiKey: "should-never-be-written",
      env: { SECRET: "x" },
    });
    const raw = fs.readFileSync(paths.statusFilePath, "utf8");
    assert.doesNotMatch(raw, /apiKey/i);
    assert.doesNotMatch(raw, /SECRET/);
    assert.doesNotMatch(raw, /env/i);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
