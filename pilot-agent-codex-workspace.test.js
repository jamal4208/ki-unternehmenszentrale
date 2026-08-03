"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Fokus dieses Moduls: pilot-agent-codex-workspace.js isoliert, ohne Codex
// selbst aufzurufen. Prüft ausschließlich die Workspace-Erzeugung/-Prüfung/
// -Bereinigung gegen echte Dateien auf Datenträger (os.tmpdir()), niemals
// gegen das echte Repository oder das Health-Projekt.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const workspaceModule = require("./pilot-agent-codex-workspace");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeFixtureSourceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-src-"));
  fs.writeFileSync(path.join(root, "allowed-a.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "allowed-b.js"), "module.exports = 2;\n");
  fs.writeFileSync(path.join(root, ".env"), "SECRET=top-secret\n");
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  fs.mkdirSync(path.join(root, "sub"));
  fs.writeFileSync(path.join(root, "sub", "nested.js"), "module.exports = 3;\n");
  return root;
}

function run() {
  const sourceRoot = makeFixtureSourceRoot();

  check("Phase 7 – 4. nur erlaubte Dateien werden in den Workspace kopiert (keine weiteren)", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js", "sub/nested.js"],
      executionRunId: "run-a",
      forbiddenRoots: [sourceRoot],
    });
    assert.deepStrictEqual(ws.copiedFiles.slice().sort(), ["allowed-a.js", "sub/nested.js"]);
    assert.ok(fs.existsSync(path.join(ws.workspaceDir, "allowed-a.js")));
    assert.ok(fs.existsSync(path.join(ws.workspaceDir, "sub", "nested.js")));
    assert.ok(!fs.existsSync(path.join(ws.workspaceDir, "allowed-b.js")));
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
  });

  check("Phase 7 – 5. .git/.env/Secret-Dateien werden niemals kopiert, auch bei explizitem Versuch", () => {
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot,
          allowedFiles: [".env"],
          executionRunId: "run-env",
          forbiddenRoots: [sourceRoot],
        }),
      /verbotener Pfadanteil/,
    );
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot,
          allowedFiles: [".git/HEAD"],
          executionRunId: "run-git",
          forbiddenRoots: [sourceRoot],
        }),
      /verbotener Pfadanteil/,
    );
  });

  check("Phase 7 – Pfad-Traversierung/absolute Pfade werden abgelehnt (Verteidigung in der Tiefe)", () => {
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot,
          allowedFiles: ["../outside.js"],
          executionRunId: "run-traversal",
          forbiddenRoots: [sourceRoot],
        }),
      /Traversierung/,
    );
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot,
          allowedFiles: ["/etc/passwd"],
          executionRunId: "run-abs",
          forbiddenRoots: [sourceRoot],
        }),
      /absoluter Pfad/,
    );
  });

  check("Phase 7 – 6. der erzeugte Workspace liegt nachweislich außerhalb des (simulierten) Repositories", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-outside",
      forbiddenRoots: [sourceRoot],
    });
    const resolvedSource = fs.realpathSync(sourceRoot);
    assert.notStrictEqual(ws.workspaceDir, resolvedSource);
    assert.ok(!ws.workspaceDir.startsWith(`${resolvedSource}${path.sep}`));
    assert.ok(ws.workspaceDir.includes(os.tmpdir().replace(/\/$/, "")) || ws.workspaceDir.startsWith(os.tmpdir()));
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
  });

  check("Phase 7 – ein Workspace, dessen Wurzel selbst als forbiddenRoot markiert ist, wird abgelehnt", () => {
    assert.throws(() => {
      const fakeMkdtemp = () => sourceRoot;
      workspaceModule.createIsolatedReadOnlyWorkspace({
        sourceRoot,
        allowedFiles: ["allowed-a.js"],
        executionRunId: "run-forbidden-root",
        forbiddenRoots: [sourceRoot],
        mkdtempSyncImpl: fakeMkdtemp,
        mkdirSyncImpl: () => {},
      });
    }, /verbotenen Repositorypfads/);
  });

  check("Phase 7 – 7. zwei Läufe mit unterschiedlicher executionRunId erhalten eindeutig getrennte Workspaces", () => {
    const wsA = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-unique-a",
      forbiddenRoots: [sourceRoot],
    });
    const wsB = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-b.js"],
      executionRunId: "run-unique-b",
      forbiddenRoots: [sourceRoot],
    });
    assert.notStrictEqual(wsA.workspaceId, wsB.workspaceId);
    assert.notStrictEqual(wsA.workspaceDir, wsB.workspaceDir);
    assert.ok(fs.existsSync(path.join(wsA.workspaceDir, "allowed-a.js")));
    assert.ok(fs.existsSync(path.join(wsB.workspaceDir, "allowed-b.js")));
    workspaceModule.cleanupWorkspace(wsA.workspaceDir);
    workspaceModule.cleanupWorkspace(wsB.workspaceDir);
  });

  check("Phase 7 – eine als 'erlaubt' genannte, aber tatsächlich fehlende Quelldatei wird sicher abgelehnt", () => {
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot,
          allowedFiles: ["does-not-exist.js"],
          executionRunId: "run-missing",
          forbiddenRoots: [sourceRoot],
        }),
      /erlaubte Datei fehlt in der Quelle/,
    );
  });

  check("verifyWorkspaceUnchanged: eine unveränderte Kopie liefert keinen Befund", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-verify-clean",
      forbiddenRoots: [sourceRoot],
    });
    const changed = workspaceModule.verifyWorkspaceUnchanged(ws.workspaceDir, ws.baselineHashes);
    assert.deepStrictEqual(changed, []);
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
  });

  check("verifyWorkspaceUnchanged: eine inhaltliche Veränderung wird als Sicherheitsbefund erkannt", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-verify-modified",
      forbiddenRoots: [sourceRoot],
    });
    fs.chmodSync(path.join(ws.workspaceDir, "allowed-a.js"), 0o600);
    fs.writeFileSync(path.join(ws.workspaceDir, "allowed-a.js"), "module.exports = 999;\n");
    const changed = workspaceModule.verifyWorkspaceUnchanged(ws.workspaceDir, ws.baselineHashes);
    assert.ok(changed.some((entry) => entry.includes("Inhalt verändert")));
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
  });

  check("verifyWorkspaceUnchanged: eine gelöschte Datei sowie eine unerwartete neue Datei werden erkannt", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-verify-deleted",
      forbiddenRoots: [sourceRoot],
    });
    fs.unlinkSync(path.join(ws.workspaceDir, "allowed-a.js"));
    fs.writeFileSync(path.join(ws.workspaceDir, "unexpected.txt"), "x");
    const changed = workspaceModule.verifyWorkspaceUnchanged(ws.workspaceDir, ws.baselineHashes);
    assert.ok(changed.some((entry) => entry.includes("gelöscht")));
    assert.ok(changed.some((entry) => entry.includes("unerwartet neu")));
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
  });

  check("Phase 7 – 34./35. cleanupWorkspace entfernt das Verzeichnis vollständig, auch nach einem simulierten Fehlerpfad", () => {
    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot,
      allowedFiles: ["allowed-a.js"],
      executionRunId: "run-cleanup",
      forbiddenRoots: [sourceRoot],
    });
    assert.ok(fs.existsSync(ws.workspaceDir));
    workspaceModule.cleanupWorkspace(ws.workspaceDir);
    assert.ok(!fs.existsSync(ws.workspaceDir));
    // Ein zweiter Cleanup-Aufruf auf ein bereits entferntes Verzeichnis wirft
    // niemals (best effort) – wichtig für den finally-Zweig in
    // pilot-agent-codex-runner.js, der Cleanup IMMER aufruft.
    assert.doesNotThrow(() => workspaceModule.cleanupWorkspace(ws.workspaceDir));
  });

  // Korrektur 7 (unabhängiges Review, Kategorie B, "Workspace bei
  // Erzeugungsfehler aufräumen") / Sicherheitstest 8.9+8.10: der Testname
  // behauptete zuvor bereits "kein teilweise gefüllter Workspace bleibt
  // zurück", ohne das tatsächlich zu prüfen (überzeichneter Testname) – hier
  // jetzt mit einem echten Nachweis über das erzeugte, aber im Fehlerfall
  // NICHT zurückgegebene temporäre Verzeichnis.
  check("Phase 7 – 8.9. eine zu große Datei wird sicher abgelehnt (Dateigrößenlimit) und der teilweise angelegte Workspace wird tatsächlich entfernt", () => {
    const bigFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-big-"));
    fs.writeFileSync(path.join(bigFileRoot, "big.js"), "x".repeat(1000));
    const tmpDirsBefore = new Set(fs.readdirSync(os.tmpdir()));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: bigFileRoot,
          allowedFiles: ["big.js"],
          executionRunId: "run-too-big",
          forbiddenRoots: [bigFileRoot],
          maxFileBytes: 100,
        }),
      /Größengrenze/,
    );
    const newWorkspaceDirs = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("kuz-codex-ro-") && !tmpDirsBefore.has(entry));
    assert.deepStrictEqual(newWorkspaceDirs, [], "nach einem Erzeugungsfehler darf kein kuz-codex-ro-* Verzeichnis zurückbleiben");
    fs.rmSync(bigFileRoot, { recursive: true, force: true });
  });

  check("Phase 7 – 8.10. ein Fehler NACH der ersten erfolgreich kopierten Datei entfernt den gesamten teilweise befüllten Workspace (Gesamtgrößenlimit greift während der Erstellung)", () => {
    const multiFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-multi-"));
    fs.writeFileSync(path.join(multiFileRoot, "first.js"), "x".repeat(50));
    fs.writeFileSync(path.join(multiFileRoot, "second.js"), "y".repeat(50));
    const tmpDirsBefore = new Set(fs.readdirSync(os.tmpdir()));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: multiFileRoot,
          // "first.js" wird erfolgreich kopiert, DANACH überschreitet
          // "second.js" das Gesamtgrößenlimit.
          allowedFiles: ["first.js", "second.js"],
          executionRunId: "run-partial-then-fail",
          forbiddenRoots: [multiFileRoot],
          maxTotalBytes: 60,
        }),
      /Gesamtgrößengrenze/,
    );
    const newWorkspaceDirs = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("kuz-codex-ro-") && !tmpDirsBefore.has(entry));
    assert.deepStrictEqual(newWorkspaceDirs, [], "der bereits mit first.js teilweise befüllte Workspace muss vollständig entfernt werden");
    fs.rmSync(multiFileRoot, { recursive: true, force: true });
  });

  check("Phase 7 – 8.10. eine fehlende ZWEITE erlaubte Datei (nach einer bereits erfolgreich kopierten ersten) entfernt den gesamten teilweise befüllten Workspace", () => {
    const multiFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-multi2-"));
    fs.writeFileSync(path.join(multiFileRoot, "first.js"), "module.exports = 1;\n");
    const tmpDirsBefore = new Set(fs.readdirSync(os.tmpdir()));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: multiFileRoot,
          allowedFiles: ["first.js", "does-not-exist-second.js"],
          executionRunId: "run-partial-missing-second",
          forbiddenRoots: [multiFileRoot],
        }),
      /erlaubte Datei fehlt in der Quelle/,
    );
    const newWorkspaceDirs = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("kuz-codex-ro-") && !tmpDirsBefore.has(entry));
    assert.deepStrictEqual(newWorkspaceDirs, [], "der bereits mit first.js teilweise befüllte Workspace muss vollständig entfernt werden");
    fs.rmSync(multiFileRoot, { recursive: true, force: true });
  });

  check("Phase 7 – 8.11. ein Cleanup-Fehler beim Erzeugungsfehler verschleiert nicht den ursprünglichen Sicherheitsfehler, bleibt aber nachvollziehbar", () => {
    let thrown = null;
    try {
      workspaceModule.createIsolatedReadOnlyWorkspace({
        sourceRoot,
        allowedFiles: ["does-not-exist.js"],
        executionRunId: "run-cleanup-fails",
        forbiddenRoots: [sourceRoot],
        rmSyncImpl: () => {
          throw new Error("Simulierter Cleanup-Fehler (Testdoppel).");
        },
      });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, "der ursprüngliche Fehler muss weiterhin geworfen werden");
    assert.match(thrown.message, /erlaubte Datei fehlt in der Quelle/, "der ursprüngliche Sicherheitsfehler darf durch den Cleanup-Fehler nicht ersetzt/verschleiert werden");
    assert.strictEqual(thrown.workspaceCleanupError, "Simulierter Cleanup-Fehler (Testdoppel).");
    assert.ok(typeof thrown.workspaceDirLeftBehind === "string" && thrown.workspaceDirLeftBehind.length > 0);
  });

  // Sicherheitstest 8.7/8.8: eine Symlink-Datei bzw. ein Symlink-Verzeichnis
  // im erlaubten Pfad wird abgelehnt, da die reale (aufgelöste) Datei
  // außerhalb der erlaubten Quellwurzel liegen kann.
  check("Phase 7 – 8.7. eine Symlink-Datei, die auf eine Datei AUSSERHALB der Quellwurzel zeigt, wird abgelehnt", () => {
    const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-symlink-file-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-symlink-outside-"));
    const outsideSecretFile = path.join(outsideDir, "outside-secret.js");
    fs.writeFileSync(outsideSecretFile, "module.exports = 'geheim';\n");
    const symlinkPath = path.join(symlinkRoot, "linked.js");
    fs.symlinkSync(outsideSecretFile, symlinkPath);
    const tmpDirsBefore = new Set(fs.readdirSync(os.tmpdir()));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: symlinkRoot,
          allowedFiles: ["linked.js"],
          executionRunId: "run-symlink-file",
          forbiddenRoots: [symlinkRoot],
        }),
      /liegt außerhalb der erlaubten Quelle/,
    );
    const newWorkspaceDirs = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("kuz-codex-ro-") && !tmpDirsBefore.has(entry));
    assert.deepStrictEqual(newWorkspaceDirs, []);
    fs.rmSync(symlinkRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  check("Phase 7 – 8.8. eine Datei innerhalb eines Symlink-VERZEICHNISSES, das aus der Quellwurzel hinauszeigt, wird abgelehnt", () => {
    const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-symlink-dir-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-symlink-dir-outside-"));
    fs.writeFileSync(path.join(outsideDir, "inside-outside.js"), "module.exports = 'geheim';\n");
    const symlinkDirPath = path.join(symlinkRoot, "linked-dir");
    fs.symlinkSync(outsideDir, symlinkDirPath, "dir");
    const tmpDirsBefore = new Set(fs.readdirSync(os.tmpdir()));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: symlinkRoot,
          allowedFiles: ["linked-dir/inside-outside.js"],
          executionRunId: "run-symlink-dir",
          forbiddenRoots: [symlinkRoot],
        }),
      /liegt außerhalb der erlaubten Quelle/,
    );
    const newWorkspaceDirs = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("kuz-codex-ro-") && !tmpDirsBefore.has(entry));
    assert.deepStrictEqual(newWorkspaceDirs, []);
    fs.rmSync(symlinkRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  // Sicherheitstest 8.9 (Ergänzung): das GESAMTgrößenlimit (nicht nur das
  // Einzeldateilimit) wird technisch durchgesetzt, auch wenn jede einzelne
  // Datei für sich innerhalb des Einzeldateilimits bleibt.
  check("Phase 7 – 8.9. das Workspace-Gesamtgrößenlimit wird durchgesetzt, auch wenn jede Einzeldatei für sich zulässig ist", () => {
    const multiFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kuz-codex-ws-totalsize-"));
    fs.writeFileSync(path.join(multiFileRoot, "a.js"), "a".repeat(40));
    fs.writeFileSync(path.join(multiFileRoot, "b.js"), "b".repeat(40));
    assert.throws(
      () =>
        workspaceModule.createIsolatedReadOnlyWorkspace({
          sourceRoot: multiFileRoot,
          allowedFiles: ["a.js", "b.js"],
          executionRunId: "run-total-size",
          forbiddenRoots: [multiFileRoot],
          maxFileBytes: 50,
          maxTotalBytes: 60,
        }),
      /Gesamtgrößengrenze/,
    );
    fs.rmSync(multiFileRoot, { recursive: true, force: true });
  });

  // V7.9.9 ("auftragsbezogene Dateiauswahl auf die Nutzerperspektive
  // erweitern") – Testfall D des Auftrags: die neu aufgenommene
  // Markdown-Datei V1_BETRIEBSHANDBUCH.md muss zulässig sein und
  // gemeinsam mit den drei anderen empfohlenen Dateien byteidentisch in
  // den isolierten Read-Only-Workspace übernommen werden. Bewusst gegen
  // das ECHTE Repository als Quelle (ausschließlich lesend, wie im
  // Praxislauf), aber mit dem Repository als forbiddenRoot – der
  // Workspace muss nachweislich außerhalb liegen. Kein Codex-Aufruf, kein
  // Kettenlauf, keine Schreiboperation im Repository.
  check("V7.9.9-D: V1_BETRIEBSHANDBUCH.md ist als Markdown zulässig und wird mit den empfohlenen Dateien sicher in den isolierten Read-only-Workspace übernommen", () => {
    const agentExecutionService = require("./pilot-agent-execution-service");
    const repoRoot = fs.realpathSync(agentExecutionService.REPO_ROOT);
    const recommendedFiles = agentExecutionService.CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.slice();
    assert.ok(recommendedFiles.includes("V1_BETRIEBSHANDBUCH.md"));

    // Die Markdown-Datei besteht dieselbe Segmentprüfung wie jede
    // JavaScript-Datei – es gibt bewusst keine Endungs-Sonderregel.
    assert.strictEqual(workspaceModule.assertSafeAllowedRelativePath("V1_BETRIEBSHANDBUCH.md"), "V1_BETRIEBSHANDBUCH.md");

    const ws = workspaceModule.createIsolatedReadOnlyWorkspace({
      sourceRoot: repoRoot,
      allowedFiles: recommendedFiles,
      executionRunId: "run-v799-user-perspective",
      forbiddenRoots: [repoRoot],
    });
    try {
      assert.deepStrictEqual(ws.copiedFiles, recommendedFiles, "genau die vier empfohlenen Dateien müssen kopiert werden");
      assert.ok(
        !ws.workspaceDir.startsWith(`${repoRoot}${path.sep}`) && ws.workspaceDir !== repoRoot,
        "der Workspace muss außerhalb des Repositories liegen",
      );
      assert.ok(ws.totalBytes > 0 && ws.totalBytes <= workspaceModule.MAX_TOTAL_BYTES);

      const handbookInWorkspace = path.join(ws.workspaceDir, "V1_BETRIEBSHANDBUCH.md");
      assert.ok(fs.existsSync(handbookInWorkspace) && fs.statSync(handbookInWorkspace).isFile());
      assert.ok(
        fs.readFileSync(handbookInWorkspace).equals(fs.readFileSync(path.join(repoRoot, "V1_BETRIEBSHANDBUCH.md"))),
        "die Markdown-Datei muss byteidentisch übernommen werden",
      );

      // Keine weitere Datei aus dem echten Repository ist im Workspace
      // gelandet (insbesondere kein .env, kein .git, kein data-Verzeichnis).
      assert.deepStrictEqual(fs.readdirSync(ws.workspaceDir).sort(), recommendedFiles.slice().sort());
      assert.deepStrictEqual(workspaceModule.verifyWorkspaceUnchanged(ws.workspaceDir, ws.baselineHashes), []);
    } finally {
      workspaceModule.cleanupWorkspace(ws.workspaceDir);
    }
    assert.ok(!fs.existsSync(ws.workspaceDir), "der Workspace muss nach dem Test wieder entfernt sein");
  });

  fs.rmSync(sourceRoot, { recursive: true, force: true });

  console.log(`pilot-agent-codex-workspace.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run();
