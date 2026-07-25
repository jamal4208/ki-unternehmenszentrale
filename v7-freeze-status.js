"use strict";

// V7.0 Phase E – read-only Freeze-/Abschlussstatus.
//
// Dieses Modul erfindet keine zweite Wahrheitsquelle: Die Phasenfakten (Nr.,
// Titel, gesicherter Commit) sind dieselben bereits dokumentierten Fakten wie
// in CURRENT_STATUS.md / PROJECT_MASTER.md / MIGRATION_PLAN.md und werden bei
// jedem neuen gesicherten Phasenabschluss zusammen mit diesen Dokumenten von
// Hand nachgeführt – genau wie server-status.js#CENTRAL_APP_VERSION. Es wird
// hier bewusst kein Testlauf bei jedem Request ausgeführt (das wäre teuer,
// riskant und kein "read-only" Verhalten mehr); der Teststand ist der zuletzt
// tatsächlich gemessene und im Abschlussbericht bestätigte Stand.
//
// Der einzige live gelesene Wert ist der aktuelle Git-Commit/-Working-Tree
// der Zentrale (read-only, shell:false, wie server-status.js). Damit kann
// dieses Modul niemals FREEZE_CANDIDATE behaupten, während lokal noch
// uncommittete Änderungen vorliegen.

const { execFile } = require("child_process");

const GIT_TIMEOUT_MS = 4000;

const FREEZE_STATUS_VALUES = Object.freeze(["IN_REVIEW", "FREEZE_CANDIDATE", "FROZEN"]);

const PHASE_HISTORY = Object.freeze([
  Object.freeze({
    phase: "A",
    title: "Guided Work Foundation",
    status: "DONE",
    commit: "4a74ebe",
  }),
  Object.freeze({
    phase: "B",
    title: "Betriebsstabilität",
    status: "DONE",
    commit: "3487a84",
  }),
  Object.freeze({
    phase: "C",
    title: "Execution Bridge Isolation mit Mock-Executor",
    status: "DONE",
    commit: "0858b4e",
  }),
  Object.freeze({
    phase: "D",
    title: "Codex als kontrollierten Executor an die Execution Bridge anbinden",
    status: "DONE",
    commit: "6553452",
  }),
]);

// Letzter gesicherter Commit auf origin/main zum Zeitpunkt dieses Phase-E-
// Standes. Bleibt bis zu Jamals Commit-Freigabe für Phase E bewusst auf dem
// Phase-D-Commit stehen – dadurch zeigt dieses Modul während der laufenden
// Phase-E-Arbeit (uncommittete Änderungen) korrekt IN_REVIEW statt
// fälschlich FREEZE_CANDIDATE.
const LAST_SECURED_COMMIT = "655345246839d787ab9f293892b6f3ae479bbd67";

// Zuletzt tatsächlich gemessener automatisierter Teststand (siehe
// Abschlussbericht Phase E). Wird bei jedem neuen gesicherten Phasenabschluss
// von Hand aktualisiert, nicht bei jedem Request neu ausgeführt.
const LAST_KNOWN_TEST_SUMMARY = Object.freeze({
  allGreen: true,
  checkCount: 489,
  recordedAtPhase: "D",
  command: "npm test",
});

const KNOWN_NON_GOALS = Object.freeze([
  "Kein Commit, kein Push, kein Deployment durch dieses Modul oder diese Anzeige.",
  "Kein automatisches Setzen auf FROZEN ohne Jamal – höchstens FREEZE_CANDIDATE wird vorbereitet.",
  "Keine Phase V7.1 (Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte).",
  "Health bleibt read-only; Codex-Start und Apply für Health bleiben hart blockiert.",
]);

const NEXT_PRODUCT_PATH_AFTER_V70 = Object.freeze([
  "Dokumenten- und Wissenseingang",
  "Werkzeug-/Lizenzregister",
  "Plugin-Gateway",
  "Marketing-Agentur",
  "Canva/HeyGen",
  "Shopify",
  "weitere Umsatzprojekte",
]);

const KNOWN_OPEN_JAMAL_STEPS = Object.freeze([
  "Phase E: manuelle Abschlussabnahme (u. a. Safari) und Commit-/Push-Freigabe.",
  "Endgültiger V7.0-Freeze auf FROZEN bleibt ausschließlich Jamals Entscheidung.",
  "Jede spätere Autonomieerhöhung, Health-Schreibfreigabe oder Phase V7.1 benötigt eine neue ausdrückliche Freigabe.",
]);

function readGitCommitReadOnly(repoDir, options = {}) {
  const exec = options.execFileImpl || execFile;
  return new Promise((resolve) => {
    exec(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: repoDir,
        timeout: options.timeoutMs || GIT_TIMEOUT_MS,
        maxBuffer: 4 * 1024,
        encoding: "utf8",
        shell: false,
        env: { PATH: process.env.PATH || "", LANG: "C" },
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const commit = String(stdout || "").trim();
        resolve(/^[0-9a-f]{40}$/i.test(commit) ? commit : null);
      },
    );
  });
}

function readWorkingTreeCleanReadOnly(repoDir, options = {}) {
  const exec = options.execFileImpl || execFile;
  return new Promise((resolve) => {
    exec(
      "git",
      ["status", "--porcelain"],
      {
        cwd: repoDir,
        timeout: options.timeoutMs || GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        encoding: "utf8",
        shell: false,
        env: { PATH: process.env.PATH || "", LANG: "C" },
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(String(stdout || "").trim().length === 0);
      },
    );
  });
}

/**
 * Reine Funktion ohne I/O. `currentGitCommit`/`workingTreeClean` müssen vom
 * Aufrufer bereits sicher (read-only, shell:false) gelesen worden sein –
 * analog zu server-status.js#buildServerStatusApiResponse.
 */
function computeFreezeStatus({ currentGitCommit, workingTreeClean } = {}) {
  const gitMatchesLastSecuredCommit =
    typeof currentGitCommit === "string" && currentGitCommit.length > 0 && currentGitCommit === LAST_SECURED_COMMIT;
  const workingTreeCleanKnown = workingTreeClean === true;
  const readyForCandidate =
    gitMatchesLastSecuredCommit && workingTreeCleanKnown && LAST_KNOWN_TEST_SUMMARY.allGreen === true;
  const status = readyForCandidate ? "FREEZE_CANDIDATE" : "IN_REVIEW";

  return {
    version: "V7.0",
    phase: "E",
    status,
    phases: PHASE_HISTORY,
    lastSecuredCommit: LAST_SECURED_COMMIT,
    currentGitCommit: typeof currentGitCommit === "string" && currentGitCommit ? currentGitCommit : null,
    gitMatchesLastSecuredCommit,
    workingTreeClean: workingTreeClean === true ? true : workingTreeClean === false ? false : null,
    tests: LAST_KNOWN_TEST_SUMMARY,
    openJamalSteps: KNOWN_OPEN_JAMAL_STEPS,
    knownNonGoals: KNOWN_NON_GOALS,
    nextProductPathAfterV70: NEXT_PRODUCT_PATH_AFTER_V70,
    note: "Cursor kann höchstens FREEZE_CANDIDATE vorbereiten. Der endgültige V7.0-Freeze (FROZEN) bleibt eine separate Entscheidung von Jamal.",
  };
}

module.exports = {
  FREEZE_STATUS_VALUES,
  PHASE_HISTORY,
  LAST_SECURED_COMMIT,
  LAST_KNOWN_TEST_SUMMARY,
  KNOWN_NON_GOALS,
  NEXT_PRODUCT_PATH_AFTER_V70,
  KNOWN_OPEN_JAMAL_STEPS,
  readGitCommitReadOnly,
  readWorkingTreeCleanReadOnly,
  computeFreezeStatus,
};
