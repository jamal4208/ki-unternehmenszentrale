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
// die automatische Ableitung niemals mehr als FREEZE_CANDIDATE behaupten,
// während lokal noch uncommittete Änderungen vorliegen.
//
// V7.0-Freeze-Entscheidung (25.07.2026): `FROZEN` wird ausschließlich durch
// die unten hinterlegte, von Hand eingetragene MANUAL_FREEZE_DECISION erreicht
// – niemals durch Git-Stand, Working-Tree-Sauberkeit oder Testzahl allein.
// computeFreezeStatus() bleibt dieselbe reine, automatisch abgeleitete
// Funktion wie zuvor (IN_REVIEW/FREEZE_CANDIDATE unverändert) und liefert nur
// dann FROZEN, wenn ihr explizit dieses eine kanonische, geprüfte Objekt als
// `manualFreezeDecision` übergeben wird. Es gibt bewusst keinen zweiten Weg,
// FROZEN zu setzen: kein Schreib-Endpunkt, kein Button, kein Unfreeze.
//
// Zwei getrennte, absichtlich unterschiedliche Commit-Werte (V7.0-Betriebsfix
// 25.07.2026): `LAST_SECURED_COMMIT` ist die historische Freeze-
// Entscheidungsbasis (52ce012) und bleibt unverändert. `OFFICIAL_FROZEN_COMMIT`
// ist der jeweils aktuelle, tatsächlich als FROZEN geltende Git-Stand
// (zunächst der Freeze-Dokumentations-Commit 80b827b) und wird bei jedem
// später akzeptierten Betriebsfix von Hand nachgeführt. Beide Werte werden nie
// miteinander verwechselt oder ineinander überschrieben.

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
  Object.freeze({
    phase: "E",
    title: "Health-Ende-zu-Ende-Audit, Freeze-Status und Chef-Modus-Klarheit",
    status: "DONE",
    commit: "52ce012",
  }),
]);

// Freeze-Entscheidungsbasis: der gesicherte Phase-E-Stand, auf dessen
// Grundlage Jamal die V7.0-Freeze-Entscheidung getroffen hat (siehe
// MANUAL_FREEZE_DECISION.baseCommit, muss mit diesem Wert übereinstimmen).
// Dies ist eine historische Tatsache und wird durch spätere, zulässige
// Betriebsfixes NICHT überschrieben oder umgedeutet.
const LAST_SECURED_COMMIT = "52ce0125f0d641295bcc1b83ee9442e95abb199d";

// Aktueller offizieller Freeze-Commit: der Commit, der den zuletzt
// gesicherten, tatsächlich als V7.0-FROZEN geltenden Git-Stand markiert.
// Direkt nach der Freeze-Entscheidung ist das der Dokumentations-Commit
// "V7.0 offiziell einfrieren", der die Entscheidung selbst festgehalten hat
// (Basis weiterhin `LAST_SECURED_COMMIT`/52ce012). Bei jedem später
// akzeptierten und tatsächlich committeten Betriebsfix wird dieser Wert von
// Hand auf den neuen Commit nachgeführt – genau wie LAST_SECURED_COMMIT und
// PHASE_HISTORY bereits gepflegt werden. Die Freeze-Entscheidungsbasis bleibt
// davon unabhängig und unverändert.
const OFFICIAL_FROZEN_COMMIT = "80b827b8f7edbbefbb20bda4e94a0d22fb6b07b8";

// Zuletzt tatsächlich gemessener automatisierter Teststand (siehe
// Abschlussbericht Phase E / V7.0-Freeze). Wird bei jedem neuen gesicherten
// Phasenabschluss von Hand aktualisiert, nicht bei jedem Request neu
// ausgeführt.
const LAST_KNOWN_TEST_SUMMARY = Object.freeze({
  allGreen: true,
  checkCount: 528,
  recordedAtPhase: "E",
  command: "npm test",
});

// ---------------------------------------------------------------------------
// Kanonische, manuelle V7.0-Freeze-Entscheidung durch Jamal.
//
// Dies ist die einzige Stelle im gesamten Projekt, an der `FROZEN` entstehen
// kann. Sie wird von Hand eingetragen, genau wie LAST_SECURED_COMMIT und
// PHASE_HISTORY, und niemals automatisch aus Tests, Git-Status oder einer
// Anfrage abgeleitet oder verändert. Es gibt keinen Schreib-Endpunkt und
// keinen Unfreeze-Mechanismus für dieses Objekt.
// ---------------------------------------------------------------------------
const MANUAL_FREEZE_DECISION = Object.freeze({
  version: "V7.0",
  status: "FROZEN",
  decidedBy: "Jamal",
  decisionDate: "2026-07-25",
  baseCommit: "52ce0125f0d641295bcc1b83ee9442e95abb199d",
  note:
    "Phase A bis E sind abgeschlossen. V7.0 erhält keine neuen Funktionen mehr; " +
    "Änderungen bleiben auf belegte Fehlerkorrekturen, Sicherheitskorrekturen sowie " +
    "Wiederherstellungs-/Betriebsfixes begrenzt. Neue Funktionen beginnen ab V7.1.",
});

function isValidManualFreezeDecision(decision) {
  return Boolean(
    decision &&
      decision.version === "V7.0" &&
      decision.status === "FROZEN" &&
      decision.decidedBy === "Jamal" &&
      typeof decision.decisionDate === "string" &&
      decision.decisionDate.length > 0 &&
      typeof decision.baseCommit === "string" &&
      /^[0-9a-f]{40}$/i.test(decision.baseCommit),
  );
}

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
  "V7.0 ist mit Jamals ausdrücklicher Entscheidung vom 2026-07-25 offiziell FROZEN (siehe MANUAL_FREEZE_DECISION).",
  "Jede spätere Autonomieerhöhung, Health-Schreibfreigabe oder der Beginn von Phase V7.1 benötigt eine neue ausdrückliche Freigabe.",
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
 *
 * `manualFreezeDecision` ist optional und additiv: ohne dieses Argument
 * verhält sich die Funktion exakt wie zuvor (niemals FROZEN, ausschließlich
 * IN_REVIEW/FREEZE_CANDIDATE aus Git-Stand/Working-Tree/Teststand
 * abgeleitet). Nur wenn hier das eine kanonische, geprüfte
 * MANUAL_FREEZE_DECISION-Objekt übergeben wird, lautet der Status FROZEN –
 * unabhängig vom aktuellen Git-Stand, damit spätere zulässige Fehler-/
 * Sicherheits-/Betriebsfixes den Freeze nicht stillschweigend aufheben.
 *
 * Der Rückgabewert unterscheidet bewusst zwei verschiedene Vergleiche:
 * `gitMatchesLastSecuredCommit` vergleicht mit der historischen
 * Freeze-Entscheidungsbasis (52ce012) und bleibt unverändert für die
 * automatische IN_REVIEW/FREEZE_CANDIDATE-Ableitung erhalten;
 * `gitMatchesOfficialFrozenCommit` vergleicht mit dem aktuellen offiziellen
 * Freeze-Commit (OFFICIAL_FROZEN_COMMIT) und ist der für die Anzeige "aktueller
 * Git-Stand entspricht offiziellem Freeze-Commit" maßgebliche Wert.
 */
function computeFreezeStatus({ currentGitCommit, workingTreeClean, manualFreezeDecision } = {}) {
  const gitMatchesLastSecuredCommit =
    typeof currentGitCommit === "string" && currentGitCommit.length > 0 && currentGitCommit === LAST_SECURED_COMMIT;
  const gitMatchesOfficialFrozenCommit =
    typeof currentGitCommit === "string" &&
    currentGitCommit.length > 0 &&
    currentGitCommit === OFFICIAL_FROZEN_COMMIT;
  const workingTreeCleanKnown = workingTreeClean === true;
  const readyForCandidate =
    gitMatchesLastSecuredCommit && workingTreeCleanKnown && LAST_KNOWN_TEST_SUMMARY.allGreen === true;
  const manualDecisionValid = isValidManualFreezeDecision(manualFreezeDecision);
  const status = manualDecisionValid ? "FROZEN" : readyForCandidate ? "FREEZE_CANDIDATE" : "IN_REVIEW";

  const note = manualDecisionValid
    ? `V7.0 ist durch Jamals ausdrückliche Entscheidung vom ${manualFreezeDecision.decisionDate} offiziell FROZEN ` +
      `(Basis-Commit ${manualFreezeDecision.baseCommit}). Phase A bis E sind abgeschlossen. Neue Funktionen beginnen ` +
      `erst ab V7.1; V7.0 bleibt auf belegte Fehler-, Sicherheits- und Betriebsfixes begrenzt.`
    : "Cursor kann höchstens FREEZE_CANDIDATE vorbereiten. Der endgültige V7.0-Freeze (FROZEN) bleibt eine separate Entscheidung von Jamal.";

  return {
    version: "V7.0",
    phase: "E",
    status,
    phases: PHASE_HISTORY,
    lastSecuredCommit: LAST_SECURED_COMMIT,
    officialFrozenCommit: OFFICIAL_FROZEN_COMMIT,
    currentGitCommit: typeof currentGitCommit === "string" && currentGitCommit ? currentGitCommit : null,
    gitMatchesLastSecuredCommit,
    gitMatchesOfficialFrozenCommit,
    workingTreeClean: workingTreeClean === true ? true : workingTreeClean === false ? false : null,
    tests: LAST_KNOWN_TEST_SUMMARY,
    manualFreezeDecision: manualDecisionValid ? manualFreezeDecision : null,
    openJamalSteps: KNOWN_OPEN_JAMAL_STEPS,
    knownNonGoals: KNOWN_NON_GOALS,
    nextProductPathAfterV70: NEXT_PRODUCT_PATH_AFTER_V70,
    note,
  };
}

module.exports = {
  FREEZE_STATUS_VALUES,
  PHASE_HISTORY,
  LAST_SECURED_COMMIT,
  OFFICIAL_FROZEN_COMMIT,
  LAST_KNOWN_TEST_SUMMARY,
  MANUAL_FREEZE_DECISION,
  KNOWN_NON_GOALS,
  NEXT_PRODUCT_PATH_AFTER_V70,
  KNOWN_OPEN_JAMAL_STEPS,
  readGitCommitReadOnly,
  readWorkingTreeCleanReadOnly,
  isValidManualFreezeDecision,
  computeFreezeStatus,
};
