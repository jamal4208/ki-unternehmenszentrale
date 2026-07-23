"use strict";

const assert = require("assert");
const {
  HEALTH_PROJECT_ID,
  ALLOWED_GIT_READ_COMMANDS,
  resolveCanonicalHealthPath,
  readHealthRepoStatus,
  buildHealthLiveStatusResponse,
} = require("./health-repo-status");
const { getProjectById } = require("./project-registry");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function mockExecFactory(responses) {
  const calls = [];
  const execFileImpl = (cmd, args, _opts, cb) => {
    calls.push({ cmd, args: [...args] });
    assert.strictEqual(cmd, "git");
    assert.strictEqual(_opts.shell, false);
    const key = args.join(" ");
    const response = responses[key] || { ok: false, error: new Error("unexpected git args") };
    process.nextTick(() => {
      if (response.error) {
        const err = response.error;
        cb(err, response.stdout || "", response.stderr || "");
        return;
      }
      cb(null, response.stdout || "", response.stderr || "");
    });
  };
  return { execFileImpl, calls };
}

async function main() {
  check("Health project id is fixed", () => {
    assert.strictEqual(HEALTH_PROJECT_ID, "health-upgrade-kompass");
    assert.ok(getProjectById(HEALTH_PROJECT_ID));
  });

  check("Allowed git commands are read-only fixed argv", () => {
    Object.values(ALLOWED_GIT_READ_COMMANDS).forEach((args) => {
      assert.ok(Array.isArray(args));
      assert.ok(!args.some((part) => /fetch|pull|checkout|reset|clean|commit|push|rebase/i.test(part)));
    });
  });

  check("Rejects free path input by using only registry path", () => {
    const result = resolveCanonicalHealthPath({
      project: { id: HEALTH_PROJECT_ID, localPath: "/tmp/not-health" },
      existsSyncImpl: () => false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "PATH_UNAVAILABLE");
  });

  check("Rejects non-health project", () => {
    const result = resolveCanonicalHealthPath({
      project: { id: "expansion-app", localPath: "/tmp/x" },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "PROJECT_NOT_HEALTH");
  });

  {
    const { execFileImpl, calls } = mockExecFactory({
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "rev-parse HEAD": { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" },
      "status --porcelain": { stdout: "" },
      "status -sb": { stdout: "## main\n" },
    });
    const status = await readHealthRepoStatus({
      project: {
        id: HEALTH_PROJECT_ID,
        localPath: "/canonical/health",
        localBranch: "main",
        localHead: "28cdcf7",
        workingTreeStatus: "SAUBER",
        lastVerifiedAt: "2026-07-19",
      },
      existsSyncImpl: () => true,
      realpathSyncImpl: (value) => value,
      execFileImpl,
    });
    check("Reads clean branch/head without starting tests", () => {
      assert.strictEqual(status.ok, true);
      assert.strictEqual(status.available, true);
      assert.strictEqual(status.branch, "main");
      assert.strictEqual(status.head, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.strictEqual(status.workingTreeClean, true);
      assert.strictEqual(status.testExecutionStarted, false);
      assert.strictEqual(status.gitWriteStarted, false);
      assert.strictEqual(status.writeOperationsBlocked, true);
      assert.strictEqual(status.madeExternalRequest, false);
      assert.ok(!JSON.stringify(status).includes("/canonical/health"));
      assert.ok(calls.every((call) => call.cmd === "git"));
      assert.ok(!calls.some((call) => call.args.includes("fetch")));
    });
  }

  {
    const { execFileImpl } = mockExecFactory({
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "rev-parse HEAD": { stdout: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n" },
      "status --porcelain": { stdout: " M README.md\n" },
      "status -sb": { stdout: "## main\n M README.md\n" },
    });
    const status = await readHealthRepoStatus({
      project: {
        id: HEALTH_PROJECT_ID,
        localPath: "/canonical/health",
        localBranch: "main",
        localHead: "28cdcf7",
      },
      existsSyncImpl: () => true,
      realpathSyncImpl: (value) => value,
      execFileImpl,
    });
    check("Reports dirty working tree", () => {
      assert.strictEqual(status.ok, true);
      assert.strictEqual(status.workingTreeClean, false);
    });
  }

  {
    const response = buildHealthLiveStatusResponse({
      ok: false,
      available: false,
      status: "UNGEKLÄRT",
      readAt: "2026-07-23T12:00:00.000Z",
      errorCode: "PATH_UNAVAILABLE",
      message: "Health-Repository ist lokal nicht verfügbar.",
      canonicalSnapshot: { localHead: "28cdcf7" },
    });
    check("API response never claims writes or tests", () => {
      assert.strictEqual(response.writeOperationsBlocked, true);
      assert.strictEqual(response.madeExternalRequest, false);
      assert.strictEqual(response.testExecutionStarted, false);
      assert.strictEqual(response.gitWriteStarted, false);
      assert.strictEqual(response.registrySource, "project-registry.js");
    });
  }

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
