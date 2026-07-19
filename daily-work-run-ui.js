"use strict";

(function initDailyWorkRunUi(root, factory) {
  const dailyWorkRunModule =
    typeof module === "object" && module.exports
      ? require("./daily-work-run")
      : root?.DailyWorkRun;
  const localDataBackupModule =
    typeof module === "object" && module.exports
      ? require("./local-data-backup")
      : root?.LocalDataBackup;
  const agentRuntimeModule =
    typeof module === "object" && module.exports
      ? require("./agent-runtime")
      : root?.AgentRuntime;
  const api = factory(dailyWorkRunModule, localDataBackupModule, agentRuntimeModule);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DailyWorkRunUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDailyWorkRunUi(DailyWorkRun, LocalDataBackup, AgentRuntime) {
  const REQUIRED_DEPS = [
    "byId",
    "escapeHtml",
    "comparableText",
    "showToast",
    "getCanonicalProjectRegistryState",
    "getAppState",
    "loadState",
    "saveState",
    "getProjectHistory",
    "renderAll",
    "localStorage",
  ];

  const dailyWorkRunUiState = {
    store: null,
    error: null,
  };

  const localDataBackupUiState = {
    pendingExport: null,
    preview: null,
    statusMessage: null,
    statusType: null,
    importToken: null,
    lastCompletedImportToken: null,
  };

  const agentRuntimeUiState = {
    runningAttemptId: null,
    abortController: null,
    error: null,
  };

  let deps = null;
  let initialized = false;
  let eventsBound = false;

  function assertDeps() {
    if (!deps) throw new Error("DailyWorkRunUi ist nicht initialisiert.");
  }

  function getCanonicalProjectRegistryState() {
    return deps?.getCanonicalProjectRegistryState?.() || { status: "loading", payload: null, error: null };
  }

function dailyWorkRunApi() {
  return DailyWorkRun || null;
}

function getActiveDailyWorkRun() {
  const api = dailyWorkRunApi();
  return api && dailyWorkRunUiState.store ? api.getActiveRun(dailyWorkRunUiState.store) : null;
}

function saveDailyWorkRun(run) {
  const api = dailyWorkRunApi();
  if (!api) throw new Error("Tagesarbeitslauf-Modul ist nicht verfügbar.");
  dailyWorkRunUiState.store = api.saveDailyStore(
    deps.localStorage,
    api.upsertRun(dailyWorkRunUiState.store || api.createStore(), run),
  );
  dailyWorkRunUiState.error = null;
  renderDailyWorkRun();
  return run;
}

function canonicalProjectsForDailyWorkRun() {
  const payload = getCanonicalProjectRegistryState().payload;
  if (
    getCanonicalProjectRegistryState().status !== "ready" ||
    payload?.writeOperationsBlocked !== true ||
    payload?.madeExternalRequest !== false ||
    !Array.isArray(payload?.projects)
  ) {
    return [];
  }
  return payload.projects.slice();
}

function currentCanonicalDailyProject(projectId) {
  const api = dailyWorkRunApi();
  if (!api) return { available: false, status: "UNGEKLÄRT", project: null };
  return api.currentCanonicalProject(getCanonicalProjectRegistryState().payload, projectId);
}

function localManagementProjectForCanonical(canonicalProject) {
  if (!canonicalProject) return null;
  const keys = new Set(
    [canonicalProject.id, canonicalProject.displayName, ...(canonicalProject.aliases || []), ...(canonicalProject.legacyIds || [])]
      .map(deps.comparableText)
      .filter(Boolean),
  );
  return deps.getAppState().projects.find((project) =>
    [project.id, project.title, project.name]
      .map(deps.comparableText)
      .filter(Boolean)
      .some((key) => keys.has(key)),
  ) || null;
}

function dailyWorkRunLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function dailyWorkRunList(value, fallback = "UNGEKLÄRT") {
  const items = dailyWorkRunLines(value);
  if (items.length === 0) return `<p class="daily-work-run-empty">${deps.escapeHtml(fallback)}</p>`;
  return `<ul>${items.map((item) => `<li>${deps.escapeHtml(item)}</li>`).join("")}</ul>`;
}

function dailyWorkRunRemoteRefs(remoteRefs) {
  const entries = Object.entries(remoteRefs || {});
  if (entries.length === 0) return "UNGEKLÄRT";
  return entries.map(([name, value]) => `${deps.escapeHtml(name)} → ${deps.escapeHtml(value)}`).join("<br>");
}

function dailyWorkRunStatusLabel(status) {
  const labels = {
    DRAFT: "Vorbereitung offen",
    READY_FOR_CODEX: "Arbeitsvorschlag erstellt",
    RESULT_RECORDED: "Ergebnis manuell zurückgeführt",
    CLOSED: "Tageslauf abgeschlossen",
    OPEN: "Tageslauf bewusst offen",
  };
  return labels[status] || "UNGEKLÄRT";
}

function dailyWorkRunStepClass(run, step) {
  const order = { DRAFT: 1, READY_FOR_CODEX: 2, RESULT_RECORDED: 3, CLOSED: 4, OPEN: 4 };
  const current = order[run.status] || 1;
  return current > step ? "is-complete" : current === step ? "is-current" : "";
}

function renderDailyWorkRunCurrentProject(run) {
  if (!run.focusProjectId) {
    return `
      <article class="daily-work-run-notice">
        <strong>Noch kein Fokusprojekt ausgewählt.</strong>
        <p>Es wird bewusst kein Projekt automatisch gesetzt. Health Upgrade Kompass ist nur die empfohlene erste Pilotwahl.</p>
      </article>
    `;
  }

  const current = currentCanonicalDailyProject(run.focusProjectId);
  if (!current.available) {
    return `
      <article class="daily-work-run-notice daily-work-run-notice--warning">
        <strong>Aktueller verifizierter Stand: UNGEKLÄRT</strong>
        <p>Die kanonische Register-API ist nicht verfügbar. Gespeicherte localStorage-Werte werden nicht als technische Wahrheit verwendet.</p>
      </article>
      ${renderDailyWorkRunSnapshot(run.canonicalSnapshot)}
    `;
  }

  const project = current.project;
  const healthPilot = project.id === "health-upgrade-kompass";
  return `
    <article class="daily-work-run-project-card${healthPilot ? " is-health-pilot" : ""}">
      <header>
        <div>
          <p class="eyebrow">${healthPilot ? "Empfohlener technischer Pilot" : "Kanonisches Fokusprojekt"}</p>
          <h4>${deps.escapeHtml(project.displayName)}</h4>
        </div>
        <span class="daily-work-run-mode">${deps.escapeHtml(project.portfolioMode || "UNGEKLÄRT")}</span>
      </header>
      <p>${deps.escapeHtml(project.currentStatus || "UNGEKLÄRT")}</p>
      <dl class="daily-work-run-facts">
        <div><dt>Verifizierung</dt><dd>${deps.escapeHtml(project.verificationStatus || "UNGEKLÄRT")}</dd></div>
        <div><dt>Letzte Verifizierung</dt><dd>${deps.escapeHtml(project.lastVerifiedAt || "UNGEKLÄRT")}</dd></div>
        <div><dt>Projektordner</dt><dd>${deps.escapeHtml(project.localPath || "UNGEKLÄRT")}</dd></div>
        <div><dt>Repository</dt><dd>${deps.escapeHtml(project.repositoryUrl || "UNGEKLÄRT")}</dd></div>
        <div><dt>Branch</dt><dd>${deps.escapeHtml(project.localBranch || "UNGEKLÄRT")}</dd></div>
        <div><dt>HEAD</dt><dd>${deps.escapeHtml(project.localHead || "UNGEKLÄRT")}</dd></div>
        <div><dt>Remote-Referenzen</dt><dd>${dailyWorkRunRemoteRefs(project.remoteRefs)}</dd></div>
        <div><dt>Testbefehl</dt><dd>${deps.escapeHtml(project.testCommand || "UNGEKLÄRT")}</dd></div>
        <div><dt>Letzter Teststand</dt><dd>${deps.escapeHtml(project.testStatus || "UNGEKLÄRT")}</dd></div>
        <div><dt>Consent-Fix</dt><dd>${deps.escapeHtml(project.consentFixStatus || "nicht projektspezifisch dokumentiert")}</dd></div>
      </dl>
      <div class="daily-work-run-snapshot-note">${deps.escapeHtml(getCanonicalProjectRegistryState().payload?.snapshotNotice || "Technische Momentaufnahme; keine automatische Live-Aktualisierung.")}</div>
      ${healthPilot ? `
        <div class="daily-work-run-health-boundary">
          <strong>Health-Grenze</strong>
          <p>Nur technischer Pilot. Health und Expansion bleiben fachlich getrennt, obwohl die technische Basis teilweise gemeinsam ist.</p>
          <p>Keine Gesundheits- oder Kundendaten. Keine medizinische, fachliche, rechtliche oder öffentliche Freigabe. Kein Deployment.</p>
        </div>
      ` : ""}
      ${dailyWorkRunList(project.notes, "Keine zusätzlichen Projektnotizen.")}
    </article>
    ${renderDailyWorkRunSnapshot(run.canonicalSnapshot)}
  `;
}

function renderDailyWorkRunSnapshot(snapshot) {
  if (!snapshot?.capturedAt) return "";
  return `
    <details class="daily-work-run-snapshot">
      <summary>Historische Tagesstart-Momentaufnahme anzeigen</summary>
      <p><strong>${deps.escapeHtml(snapshot.snapshotNotice)}</strong></p>
      <dl class="daily-work-run-facts">
        <div><dt>Erfasst</dt><dd>${deps.escapeHtml(snapshot.capturedAt)}</dd></div>
        <div><dt>Modus</dt><dd>${deps.escapeHtml(snapshot.portfolioMode || "UNGEKLÄRT")}</dd></div>
        <div><dt>Branch</dt><dd>${deps.escapeHtml(snapshot.localBranch || "UNGEKLÄRT")}</dd></div>
        <div><dt>HEAD</dt><dd>${deps.escapeHtml(snapshot.localHead || "UNGEKLÄRT")}</dd></div>
        <div><dt>Teststand</dt><dd>${deps.escapeHtml(snapshot.testStatus || "UNGEKLÄRT")}</dd></div>
      </dl>
    </details>
  `;
}

function renderDailyWorkRunPreparation(run) {
  const locked = run.status !== "DRAFT";
  const prep = run.codexPreparation || {};
  const proposal = run.workProposal;
  return `
    <form class="daily-work-run-form" id="daily-work-run-preparation-form">
      <section class="daily-work-run-stage daily-work-run-simple-start" aria-labelledby="daily-outcome-title">
        <div class="daily-work-run-stage-number">B</div>
        <div>
          <h4 id="daily-outcome-title">Gewünschtes Ergebnis</h4>
          <p>Ein Satz genügt. Aufgabentyp, Umfang, Agenten, Übergaben und Prüfungen werden daraus vorbereitet.</p>
        </div>
        <label class="daily-work-run-field daily-work-run-field--wide daily-work-run-primary-field">
          Welches Ergebnis möchtest du erreichen?
          <textarea name="desiredOutcome" rows="4" required ${locked ? "disabled" : ""} placeholder="Zum Beispiel: Erstelle einen Einsatzplan, welche Agenten für Health benötigt werden und wer was prüft.">${deps.escapeHtml(run.dailyOutcome.desiredOutcome)}</textarea>
        </label>
        <label class="daily-work-run-field daily-work-run-field--wide">
          Was darf auf keinen Fall passieren? <span class="daily-work-run-optional">optional</span>
          <textarea name="prohibitedToday" rows="3" ${locked ? "disabled" : ""} placeholder="Zusätzliche Grenze für heute">${deps.escapeHtml((run.boundary.prohibitedToday || []).filter((item) => !["Keine automatische Codex- oder Agentenausführung", "Keine externe Aktion", "Kein automatischer Commit oder Push", "Kein Deployment"].includes(item)).join("\n"))}</textarea>
        </label>
        ${locked ? "" : `
          <div class="daily-work-run-actions daily-work-run-field--wide">
            <button class="primary-button daily-work-run-create-button" type="submit" ${run.focusProjectId ? "" : "disabled"}>Arbeitsvorschlag erstellen</button>
            <span>Nur Vorbereitung – keine Agenten-, Codex- oder externe Aktion.</span>
          </div>
        `}
        <div class="daily-work-run-boundaries daily-work-run-field--wide">
          <span>Externe Aktionen blockiert</span><span>Codex-Ausführung blockiert</span><span>Agentenausführung blockiert</span><span>Git und Deployment blockiert</span>
        </div>
        <details class="daily-work-run-technical-details daily-work-run-field--wide">
          <summary>Technische Details anzeigen</summary>
          <dl class="daily-work-run-facts">
            <div><dt>Projektordner</dt><dd>${deps.escapeHtml(prep.projectPath || run.canonicalSnapshot.localPath || "wird automatisch abgeleitet")}</dd></div>
            <div><dt>Zieländerung</dt><dd>${deps.escapeHtml(prep.targetChange || "wird automatisch abgeleitet")}</dd></div>
            <div><dt>Erlaubte Dateien/Datenbereiche</dt><dd>${dailyWorkRunList(prep.allowedFiles, "wird automatisch abgeleitet")}</dd></div>
            <div><dt>Nicht erlaubte Bereiche</dt><dd>${dailyWorkRunList(prep.forbiddenFiles, "wird automatisch abgeleitet")}</dd></div>
            <div><dt>Tests und Qualitätsprüfung</dt><dd>${dailyWorkRunList(prep.tests, "wird automatisch abgeleitet")}</dd></div>
            <div><dt>Git-Regeln</dt><dd>${dailyWorkRunList(prep.gitRules, "kein Commit, Push oder Deployment")}</dd></div>
            <div><dt>Rückfallmöglichkeit</dt><dd>${deps.escapeHtml(prep.fallback || "Vorschlag verwerfen; keine Aktion wurde ausgelöst.")}</dd></div>
          </dl>
        </details>
      </section>
    </form>
    ${proposal ? renderDailyWorkProposal(proposal) : ""}
  `;
}

function renderDailyWorkProposal(proposal) {
  const plan = proposal.agentPlan || [];
  const nameById = new Map(plan.map((item) => [item.agentId, item.agentName || item.agent || item.agentId]));
  const modeLabel = (mode) => ({
    prerequisite: "muss vorher erfolgen",
    parallel: "parallel möglich",
    "dependent-review": "wartet auf Ergebnisse",
    "final-consolidation": "abschließende Zusammenführung",
  })[mode] || mode || "Reihenfolge vorbereitet";
  const displayAgent = (id) => id === "jamal" ? "Jamal" : (nameById.get(id) || id || "UNGEKLÄRT");
  const agents = (proposal.agentPlan || []).map((item) => `
    <article class="daily-work-run-agent-card${item.agentId === proposal.leadAgentId ? " is-lead" : ""}">
      <header>
        <div><strong>${deps.escapeHtml(item.agentName || item.agent || item.agentId)}</strong><span>${deps.escapeHtml(item.roleInRun || item.role || item.canonicalRole || "Fachrolle")}</span></div>
        <span class="daily-work-run-mode-tag">${deps.escapeHtml(modeLabel(item.executionMode))}</span>
      </header>
      ${item.selectionReason ? `<p><b>Warum jetzt:</b> ${deps.escapeHtml(item.selectionReason)}</p>` : ""}
      <p><b>Teilauftrag:</b> ${deps.escapeHtml(item.subtask)}</p>
      <details>
        <summary>Ergebnis, Prüfung und Übergabe</summary>
        <dl>
          <div><dt>Erwartetes Ergebnis</dt><dd>${deps.escapeHtml(item.expectedResult || "UNGEKLÄRT")}</dd></div>
          <div><dt>Prüfkriterium</dt><dd>${deps.escapeHtml(item.acceptanceCheck || "UNGEKLÄRT")}</dd></div>
          <div><dt>Sicherheitsgrenze</dt><dd>${deps.escapeHtml(item.safetyBoundary || "Keine automatische Ausführung.")}</dd></div>
          <div><dt>Wartet auf</dt><dd>${deps.escapeHtml((item.dependsOn || []).map(displayAgent).join(", ") || "keine Vorarbeit")}</dd></div>
          <div><dt>Übergabe an</dt><dd>${deps.escapeHtml(displayAgent(item.handoffTo))}</dd></div>
        </dl>
      </details>
    </article>
  `).join("");
  const workStructure = proposal.workStructure || {};
  const toolReview = proposal.toolReview || {};
  return `
    <section class="daily-work-run-proposal" aria-labelledby="daily-work-proposal-title">
      <header><div><p class="eyebrow">Automatisch abgeleitet · nur Vorschlag</p><h4 id="daily-work-proposal-title">Arbeitsvorschlag</h4></div><span class="daily-work-run-mode">${deps.escapeHtml(proposal.taskType)}</span></header>
      ${proposal.repositoryWorkRequired === false ? `<p class="daily-work-run-no-repo"><strong>Kein Codex-/Repository-Auftrag.</strong> Dieser Vorschlag plant Rollen und Arbeit, ohne technische Ausführung.</p>` : ""}
      <dl class="daily-work-run-facts">
        <div><dt>Verstandenes Ziel</dt><dd>${deps.escapeHtml(proposal.understoodGoal)}</dd></div>
        <div><dt>Realistischer Tagesumfang</dt><dd>${deps.escapeHtml(proposal.realisticDayScope)}</dd></div>
        <div><dt>Hauptverantwortlicher Agent</dt><dd><strong>${deps.escapeHtml(proposal.leadAgent)}</strong><br>${deps.escapeHtml(proposal.leadSelectionReason || proposal.leadAgentRole || "Einsatzleitung")}</dd></div>
        <div><dt>Abnahmekriterium</dt><dd>${deps.escapeHtml(proposal.acceptanceCriterion)}</dd></div>
        ${proposal.selectedAgentIds ? `<div><dt>Bewusst ausgewählt</dt><dd>${proposal.selectedAgentIds.length} von ${proposal.canonicalAgentRegistryCount} kanonischen Agenten</dd></div><div><dt>Bewusst nicht benötigt</dt><dd>${proposal.excludedAgentCount} · ${deps.escapeHtml(proposal.exclusionReason)}</dd></div>` : ""}
      </dl>
      <div><h5>Benötigte Agenten, Rollen und Teilaufgaben</h5><div class="daily-work-run-agent-grid">${agents}</div></div>
      <div class="daily-work-run-proposal-grid">
        <div><h5>Arbeitsstruktur</h5>
          <p><b>Muss vorher erfolgen:</b> ${(workStructure.prerequisites || []).map(displayAgent).map(escapeHtml).join(", ") || "keine"}</p>
          <p><b>Parallel möglich:</b> ${(workStructure.parallelTasks || []).map(displayAgent).map(escapeHtml).join(", ") || "keine"}</p>
          <p><b>Wartet auf Ergebnisse:</b> ${(workStructure.dependentReviews || []).map(displayAgent).map(escapeHtml).join(", ") || "keine"}</p>
          <p><b>Zusammenführung:</b> ${deps.escapeHtml(displayAgent(workStructure.finalConsolidation))}</p>
        </div>
        <div><h5>Plugin- und Werkzeugprüfung</h5>
          <p><b>Zuständig:</b> ${deps.escapeHtml(displayAgent(toolReview.responsibleAgentId))}</p>
          <p>${deps.escapeHtml(toolReview.neededCapability || "Für diesen Umfang ist keine eigene Werkzeugprüfung nötig.")}</p>
          ${dailyWorkRunList(toolReview.toolCategories || proposal.toolCategories)}
          <p><b>Auswahl:</b> ${deps.escapeHtml((toolReview.selectionCriteria || []).join(" · "))}</p>
          <p><b>Grenze:</b> ${deps.escapeHtml(toolReview.approvalBoundary || "Keine Werkzeugausführung.")}</p>
          <p><b>Ersatz:</b> ${deps.escapeHtml(toolReview.fallback || "Manuelle lokale Vorlage.")}</p>
        </div>
        <div><h5>Dateien und Datenbereiche</h5>${dailyWorkRunList(proposal.fileOrDataAreas)}</div>
        <div><h5>Tests und Qualität</h5>${dailyWorkRunList(proposal.testsAndQuality)}</div>
        ${(proposal.designQualityFramework || []).length ? `<div><h5>Design-Qualitätsrahmen</h5>${dailyWorkRunList(proposal.designQualityFramework)}</div>` : ""}
        <div><h5>Sicherheit und Freigabe</h5>${dailyWorkRunList(proposal.safetyAndApproval)}</div>
        <div><h5>Eine Entscheidung für Jamal</h5><p>${deps.escapeHtml(proposal.jamalDecisionQuestion)}</p></div>
      </div>
    </section>
  `;
}

function agentRuntimeApi() {
  return AgentRuntime || null;
}

function saveRunWithRuntimePilot(run, pilot) {
  const runtime = agentRuntimeApi();
  const nextRun = runtime ? runtime.attachRuntimePilot(run, pilot) : { ...run, agentRuntimePilot: pilot };
  return saveDailyWorkRun(nextRun);
}

function renderAgentRuntimePilot(run) {
  const runtime = agentRuntimeApi();
  if (!runtime || !run.workProposal?.selectedAgentIds || run.status !== "READY_FOR_CODEX") return "";

  const phase = dailyWorkRunApi().getAgentReviewPhase(run);
  if (!phase.preparedAt) return "";

  const availability = runtime.evaluateAvailability(run);
  const pilot = run.agentRuntimePilot || null;

  const statusLabels = {
    PREPARED: "Vorbereitet",
    AWAITING_JAMAL_APPROVAL: "Wartet auf Jamal-Freigabe",
    APPROVED: "Freigegeben",
    QUEUED: "In Warteschlange",
    RUNNING: "Lokaler Pilot läuft",
    RESULT_REVIEW_REQUIRED: "Ergebnis prüfpflichtig",
    ACCEPTED: "Ergebnis übernommen",
    REJECTED: "Ergebnis abgelehnt",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Abgebrochen",
    TIMED_OUT: "Zeitüberschreitung",
  };

  const pilotAgent = runtime.getProjektmanagerAgent();
  const snapshot = pilot?.inputSnapshot;
  const approval = pilot?.approval;
  const result = pilot?.result;
  const canPrepare = availability.available && (!pilot || runtime.isRuntimeTerminal(pilot));
  const canApprove = pilot && ["PREPARED", "AWAITING_JAMAL_APPROVAL"].includes(pilot.status);
  const canStart = pilot?.status === "APPROVED" && !agentRuntimeUiState.runningAttemptId;
  const canCancel = pilot && runtime.isRuntimeActive(pilot);
  const canAccept = pilot?.status === "RESULT_REVIEW_REQUIRED" && result;
  const canReject = pilot?.status === "RESULT_REVIEW_REQUIRED";

  return `
    <section class="daily-work-runtime-pilot" aria-labelledby="daily-agent-runtime-title">
      <header>
        <div>
          <p class="eyebrow">V6.44.0 · kontrollierte Laufzeit</p>
          <h4 id="daily-agent-runtime-title">Agenten-Laufzeit-Pilot</h4>
        </div>
        <span class="daily-work-run-mode">${deps.escapeHtml(pilot ? statusLabels[pilot.status] || pilot.status : "Noch nicht vorbereitet")}</span>
      </header>
      <article class="daily-work-run-notice daily-work-run-runtime-notice">
        <strong>Lokaler deterministischer Pilot – keine externe KI, kein Plugin, keine Außenwirkung.</strong>
        <p>Dieser Pilot prüft ausschließlich die Qualität und Vollständigkeit des vorbereiteten Arbeitsauftrags. Es arbeitet kein externer KI-Agent, es werden keine Projektdateien gelesen und keine Netzwerkzugriffe ausgeführt.</p>
      </article>
      <dl class="daily-work-run-facts">
        <div><dt>Pilot-Agent</dt><dd><strong>${deps.escapeHtml(runtime.PROJEKTMANAGER_ROLE_NAME)}</strong><span class="daily-work-runtime-agent-meta">Technische Agenten-ID: <code>${deps.escapeHtml(pilotAgent.agentId)}</code></span></dd></div>
        <div><dt>Arbeitsauftrag</dt><dd>${deps.escapeHtml(availability.workItem?.subtask || "UNGEKLÄRT")}</dd></div>
      </dl>
      ${!availability.available && !pilot ? `
        <p class="daily-work-run-empty">${deps.escapeHtml(availability.reasons.join(" "))}</p>
      ` : ""}
      ${agentRuntimeUiState.error ? `<p class="daily-work-run-error">${deps.escapeHtml(agentRuntimeUiState.error)}</p>` : ""}
      ${snapshot ? `
        <details class="daily-work-run-runtime-snapshot">
          <summary>Eingabe-Snapshot anzeigen</summary>
          <dl class="daily-work-run-facts">
            <div><dt>Fingerprint</dt><dd><code>${deps.escapeHtml(snapshot.inputFingerprint)}</code></dd></div>
            <div><dt>Ergebnisziel</dt><dd>${deps.escapeHtml(snapshot.expectedResult)}</dd></div>
            <div><dt>Prüfkriterien</dt><dd>${deps.escapeHtml(snapshot.reviewCriteria)}</dd></div>
            <div><dt>Sicherheitsgrenze</dt><dd>${deps.escapeHtml(snapshot.safetyBoundary)}</dd></div>
            <div><dt>Abhängigkeiten</dt><dd>${deps.escapeHtml((snapshot.dependencies || []).join(", ") || "keine")}</dd></div>
            <div><dt>Arbeitskartenstatus</dt><dd>${deps.escapeHtml(snapshot.workItemStatus)}</dd></div>
            <div><dt>Tagesergebnis</dt><dd>${deps.escapeHtml(snapshot.desiredDailyOutcome)}</dd></div>
            <div><dt>Vorbereitet</dt><dd>${deps.escapeHtml(snapshot.preparedAt)}</dd></div>
          </dl>
        </details>
      ` : ""}
      ${approval ? `
        <article class="daily-work-runtime-approval">
          <strong>Jamal-Freigabe</strong>
          <p>${deps.escapeHtml(approval.explanation)}</p>
          <dl class="daily-work-run-facts">
            <div><dt>Freigegeben von</dt><dd>${deps.escapeHtml(approval.approvedBy)}</dd></div>
            <div><dt>Freigegeben am</dt><dd>${deps.escapeHtml(approval.approvedAt)}</dd></div>
            <div><dt>Scope</dt><dd>${deps.escapeHtml(approval.scope)}</dd></div>
            <div><dt>Fingerprint</dt><dd><code>${deps.escapeHtml(approval.inputFingerprint)}</code></dd></div>
          </dl>
        </article>
      ` : ""}
      <div class="daily-work-run-actions daily-work-runtime-actions">
        ${canPrepare ? `<button class="secondary-button" type="button" data-runtime-prepare>Pilot vorbereiten</button>` : ""}
        ${canApprove ? `<button class="primary-button" type="button" data-runtime-approve>Jamal-Freigabe erteilen</button>` : ""}
        ${canStart ? `<button class="primary-button" type="button" data-runtime-start>Lokalen Pilot starten</button>` : ""}
        ${canCancel ? `<button class="secondary-button" type="button" data-runtime-cancel>Lauf abbrechen</button>` : ""}
      </div>
      ${result ? `
        <article class="daily-work-runtime-result">
          <strong>Prüfpflichtiges Ergebnis</strong>
          <p>${deps.escapeHtml(result.summary)}</p>
          ${dailyWorkRunList(result.completenessFindings, "Keine Vollständigkeitsbefunde.")}
          ${dailyWorkRunList(result.openPoints, "Keine offenen Punkte.")}
          ${dailyWorkRunList(result.blockers, "Keine Blocker.")}
          <p><b>Empfohlener nächster Schritt:</b> ${deps.escapeHtml(result.recommendedNextStep)}</p>
          <div class="daily-work-run-actions">
            ${canAccept ? `
              <form class="daily-work-runtime-accept-form" id="daily-work-runtime-accept-form">
                <label class="daily-work-review-confirm"><input type="checkbox" name="confirmed" required> Ergebnis bewusst übernehmen</label>
                <button class="primary-button" type="submit">Ergebnis akzeptieren</button>
              </form>
            ` : ""}
            ${canReject ? `
              <form class="daily-work-runtime-reject-form" id="daily-work-runtime-reject-form">
                <label>Ablehnungsgrund <textarea name="reason" rows="2" placeholder="Optional"></textarea></label>
                <button class="secondary-button" type="submit">Ergebnis ablehnen</button>
              </form>
            ` : ""}
          </div>
        </article>
      ` : ""}
      <details class="daily-work-run-technical-details">
        <summary>Audit-Verlauf</summary>
        ${pilot?.auditLog?.length ? `
          <ol class="daily-work-runtime-audit">
            ${pilot.auditLog.map((entry) => `<li><strong>${deps.escapeHtml(entry.eventType)}</strong> · ${deps.escapeHtml(entry.timestamp)} · ${deps.escapeHtml(entry.message)}</li>`).join("")}
          </ol>
        ` : `<p class="daily-work-run-empty">Noch keine Audit-Ereignisse.</p>`}
      </details>
    </section>
  `;
}

function renderDailyWorkAgentReviewPhase(run) {
  if (!run.workProposal?.selectedAgentIds || run.status !== "READY_FOR_CODEX") return "";
  const api = dailyWorkRunApi();
  const phase = api.getAgentReviewPhase(run);
  const statusLabels = {
    NOT_APPROVED: "Noch nicht freigegeben",
    PREPARED: "Prüfphase vorbereitet",
    RESULTS_PARTIAL: "Ergebnisse teilweise erfasst",
    READY_FOR_QA: "Bereit für QA",
    QA_COMPLETED: "QA abgeschlossen",
    OVERALL_FINDING_PREPARED: "Gesamtbefund vorbereitet",
    JAMAL_COMPLETED: "Von Jamal abgeschlossen",
  };
  const itemStatusLabels = {
    NOT_PREPARED: "Noch nicht vorbereitet",
    READY: "Auftrag vorbereitet",
    WAITING: "Wartet auf Ergebnis",
    RESULT_PENDING: "Ergebnis ausstehend",
    RESULT_RECORDED: "Ergebnis erfasst",
    REVIEW_REQUIRED: "Prüfung erforderlich",
    ACCEPTED: "Bestätigt",
    BLOCKED: "Blockiert",
    NOT_NEEDED: "Nicht benötigt",
  };
  const nameById = new Map(phase.workItems.map((item) => [item.agentId, item.agentName || item.agentId]));
  const displayAgent = (id) => id === "jamal" ? "Jamal" : (nameById.get(id) || id || "UNGEKLÄRT");
  const renderWorkItem = (item) => {
    const ready = item.status === "READY";
    const isSpecial = item.isLead || item.agentId === "quality-test-agent";
    return `
      <article class="daily-work-review-card${item.isLead ? " is-lead" : ""}" data-agent-work-card="${deps.escapeHtml(item.agentId)}">
        <header>
          <div><strong>${deps.escapeHtml(item.agentName)}</strong><span>${deps.escapeHtml(item.roleInRun)}</span></div>
          <span class="daily-work-run-mode-tag">${deps.escapeHtml(itemStatusLabels[item.status] || item.status)}</span>
        </header>
        <p><b>Teilauftrag:</b> ${deps.escapeHtml(item.subtask)}</p>
        <details>
          <summary>Auftrag, Prüfung und Sicherheitsgrenze</summary>
          <dl>
            <div><dt>Erwartetes Ergebnis</dt><dd>${deps.escapeHtml(item.expectedResult)}</dd></div>
            <div><dt>Prüfkriterium</dt><dd>${deps.escapeHtml(item.acceptanceCheck)}</dd></div>
            <div><dt>Sicherheitsgrenze</dt><dd>${deps.escapeHtml(item.safetyBoundary)}</dd></div>
            <div><dt>Abhängigkeiten</dt><dd>${deps.escapeHtml((item.dependsOn || []).map(displayAgent).join(", ") || "keine")}</dd></div>
            <div><dt>Übergabe</dt><dd>${deps.escapeHtml(displayAgent(item.handoffTo))}</dd></div>
            <div><dt>Ergebnisquelle</dt><dd>${deps.escapeHtml(item.resultSource)}</dd></div>
          </dl>
        </details>
        ${item.resultConfirmed ? `
          <div class="daily-work-review-result">
            <strong>Manuell bestätigter Befund</strong>
            <p>${deps.escapeHtml(item.resultText)}</p>
            ${dailyWorkRunList(item.openPoints, "Keine offenen Punkte erfasst.")}
            ${dailyWorkRunList(item.blockers, "Keine Blocker erfasst.")}
          </div>
        ` : (!isSpecial && ready ? `
          <form class="daily-work-review-result-form" data-agent-result-form data-agent-id="${deps.escapeHtml(item.agentId)}">
            <label>Ergebnis oder Befund<textarea name="resultText" rows="3" required></textarea></label>
            <label>Wichtigste offene Punkte<textarea name="openPoints" rows="2"></textarea></label>
            <label>Blocker<textarea name="blockers" rows="2"></textarea></label>
            <label class="daily-work-review-confirm"><input type="checkbox" name="confirmed" required> Ergebnis bewusst bestätigen</label>
            <button class="secondary-button" type="submit">Befund lokal speichern</button>
          </form>
        ` : (!isSpecial ? `<p class="daily-work-run-empty">Die gespeicherten Abhängigkeiten sind noch nicht vollständig bestätigt.</p>` : ""))}
      </article>
    `;
  };
  if (!phase.preparedAt) {
    return `
      <section class="daily-work-review-phase" aria-labelledby="daily-agent-review-title">
        <header><div><p class="eyebrow">V6.40.3 · kontrolliert und lokal</p><h4 id="daily-agent-review-title">Kontrollierte Agenten-Prüfphase</h4></div><span class="daily-work-run-mode">${deps.escapeHtml(statusLabels[phase.status])}</span></header>
        <p><strong>${deps.escapeHtml(phase.approvalQuestion)}</strong></p>
        <p>Der Button bereitet ausschließlich interne Arbeitskarten vor. Er startet keinen Agenten.</p>
        <div class="daily-work-run-boundaries"><span>Noch keine Agentenausführung</span><span>Keine Plugin-Ausführung</span><span>Keine externe Aktion</span></div>
        <div class="daily-work-run-actions">
          <button class="primary-button" type="button" data-prepare-agent-review>Prüfphase vorbereiten</button>
          <button class="secondary-button" type="button" data-adjust-agent-review>Einsatzplan noch anpassen</button>
          <button class="secondary-button" type="button" data-decline-agent-review>nicht starten</button>
        </div>
        ${phase.approvalDecision ? `<p class="daily-work-run-empty">Aktuelle manuelle Entscheidung: ${deps.escapeHtml(phase.approvalDecision)}</p>` : ""}
      </section>
    `;
  }

  const prerequisites = phase.workItems.filter((item) => item.executionMode === "prerequisite");
  const parallel = phase.workItems.filter((item) => item.executionMode === "parallel");
  const qaItem = phase.workItems.find((item) => item.agentId === "quality-test-agent");
  const leadItem = phase.workItems.find((item) => item.agentId === run.workProposal.leadAgentId);
  const qaReady = qaItem?.status === "READY";
  const leadReady = leadItem?.status === "READY";
  const finalReady = phase.orchestration.status === "CONFIRMED";
  return `
    <section class="daily-work-review-phase" aria-labelledby="daily-agent-review-title">
      <header><div><p class="eyebrow">V6.40.3 · kontrolliert und lokal</p><h4 id="daily-agent-review-title">Kontrollierte Agenten-Prüfphase</h4></div><span class="daily-work-run-mode">${deps.escapeHtml(statusLabels[phase.status])}</span></header>
      <article class="daily-work-run-notice"><strong>Die Agentenaufträge sind vorbereitet. Es wurde noch kein Agent ausgeführt.</strong><p>Freigabe: von Jamal freigegeben · interne Prüfaufträge: vorbereitet · alle Befunde werden ausschließlich manuell zurückgeführt.</p></article>
      <div class="daily-work-run-boundaries"><span>Noch keine Agentenausführung</span><span>13 interne Karten beim Health-Pilot</span><span>Reloadfest lokal gespeichert</span></div>
      <div class="daily-work-review-group"><h5>Grundlagen · kann sofort vorbereitet werden</h5><div class="daily-work-review-grid">${prerequisites.map(renderWorkItem).join("")}</div></div>
      <div class="daily-work-review-group"><h5>Parallele Fachprüfungen · nach bestätigten Grundlagen</h5><div class="daily-work-review-grid">${parallel.map(renderWorkItem).join("")}</div></div>
      ${qaItem ? `
        <div class="daily-work-review-group"><h5>QA-Prüfung</h5>${renderWorkItem(qaItem)}
          <dl class="daily-work-run-facts">
            <div><dt>Vorliegende Fachbefunde</dt><dd>${deps.escapeHtml(phase.qa.availableAgentIds.map(displayAgent).join(", ") || "keine")}</dd></div>
            <div><dt>Fehlende Fachbefunde</dt><dd>${deps.escapeHtml(phase.qa.missingAgentIds.map(displayAgent).join(", ") || "keine")}</dd></div>
            <div><dt>Blockierte Fachbefunde</dt><dd>${deps.escapeHtml(phase.qa.blockedAgentIds.map(displayAgent).join(", ") || "keine")}</dd></div>
            <div><dt>Prüfkriterien beantwortet</dt><dd>${phase.qa.criteriaAnswered ? "ja" : "noch nicht manuell bestätigt"}</dd></div>
            <div><dt>Sicherheitsgrenzen verletzt</dt><dd>${deps.escapeHtml(phase.qa.safetyBoundariesViolated.join(", ") || "keine Verletzung manuell erfasst")}</dd></div>
          </dl>
          ${qaReady ? `<form class="daily-work-review-special-form" id="daily-work-review-qa-form">
            <label>QA-Status<select name="status" required><option value="">Bitte wählen</option><option value="BESTANDEN">bestanden</option><option value="TEILWEISE_BESTANDEN">teilweise bestanden</option><option value="OFFEN">offen</option><option value="BLOCKIERT">blockiert</option></select></label>
            <label>Manueller QA-Befund<textarea name="resultText" rows="4" required></textarea></label>
            <label>Offene Punkte<textarea name="openPoints" rows="2"></textarea></label>
            <label>Blocker<textarea name="blockers" rows="2"></textarea></label>
            <label>Verletzte Sicherheitsgrenzen<textarea name="safetyBoundariesViolated" rows="2"></textarea></label>
            <label class="daily-work-review-confirm"><input type="checkbox" name="criteriaAnswered" required> Alle Prüfkriterien wurden bewusst beantwortet</label>
            <button class="primary-button" type="submit">QA-Befund lokal bestätigen</button>
          </form>` : `<p class="daily-work-run-empty">QA wartet auf ${deps.escapeHtml(phase.qa.missingAgentIds.length)} fehlende und ${deps.escapeHtml(phase.qa.blockedAgentIds.length)} blockierte Fachbefunde.</p>`}
        </div>
      ` : ""}
      ${leadItem ? `
        <div class="daily-work-review-group"><h5>Orchestrator-Zusammenführung</h5>${renderWorkItem(leadItem)}
          ${leadReady ? `<form class="daily-work-review-special-form" id="daily-work-review-orchestration-form">
            <label>Bestätigte Befunde<textarea name="confirmedFindings" rows="4" required></textarea></label>
            <label>Offene Punkte<textarea name="openPoints" rows="2"></textarea></label>
            <label>Konflikte<textarea name="conflicts" rows="2"></textarea></label>
            <label>Risiken<textarea name="risks" rows="2"></textarea></label>
            <label>Empfohlener nächster Schritt<textarea name="recommendedNextStep" rows="2" required></textarea></label>
            <label>Noch nicht freigegeben<textarea name="notApproved" rows="2"></textarea></label>
            <label>Jamal-Entscheidungsfrage<textarea name="jamalDecisionQuestion" rows="2" required>Soll die nächste Health-Arbeitsphase auf Grundlage dieses geprüften Gesamtbefunds vorbereitet werden?</textarea></label>
            <button class="primary-button" type="submit">Gesamtbefund lokal bestätigen</button>
          </form>` : `<p class="daily-work-run-empty">Die Zusammenführung wartet auf einen vollständig erfassten QA-Befund.</p>`}
        </div>
      ` : ""}
      ${finalReady ? `
        <div class="daily-work-review-group"><h5>Jamals Abschlussentscheidung</h5>
          ${phase.finalDecision.decidedAt ? `<dl class="daily-work-run-facts"><div><dt>Entscheidung</dt><dd>${deps.escapeHtml(phase.finalDecision.decision)}</dd></div><div><dt>Nächster sicherer Schritt</dt><dd>${deps.escapeHtml(phase.finalDecision.nextSafeStep)}</dd></div></dl><div class="daily-work-run-actions"><button class="secondary-button" type="button" data-transfer-agent-review-history ${phase.historyTransferredAt ? "disabled" : ""}>${phase.historyTransferredAt ? "Verlaufseintrag bereits übernommen" : "Abschluss einmalig in Verlauf übernehmen"}</button></div>` : `
            <p>${deps.escapeHtml(phase.orchestration.jamalDecisionQuestion)}</p>
            <form class="daily-work-review-special-form" id="daily-work-review-final-form">
              <label>Entscheidung<select name="decision" required><option value="">Bitte wählen</option><option value="FREIGEBEN">freigeben</option><option value="MIT_AENDERUNGEN_FREIGEBEN">mit Änderungen freigeben</option><option value="WEITERE_PRUEFUNG_NOETIG">weitere Prüfung nötig</option><option value="VORERST_STOPPEN">vorerst stoppen</option></select></label>
              <label>Genau ein nächster sicherer Schritt<textarea name="nextSafeStep" rows="3" required></textarea></label>
              <button class="primary-button" type="submit">Entscheidung lokal speichern</button>
            </form>`}
        </div>
      ` : ""}
      <details class="daily-work-run-technical-details"><summary>Technische Prüfphasendetails</summary><p>Status: ${deps.escapeHtml(phase.status)} · vorbereitet: ${deps.escapeHtml(phase.preparedAt)} · Agentenausführung: blockiert</p></details>
      ${renderAgentRuntimePilot(run)}
    </section>
  `;
}

function renderDailyWorkRunPrompt(run) {
  if (!["READY_FOR_CODEX", "RESULT_RECORDED", "CLOSED", "OPEN"].includes(run.status)) return "";
  return `
    <section class="daily-work-run-prompt" aria-labelledby="daily-work-run-prompt-title">
      <div>
        <p class="eyebrow">Manuell kopierbare Vorlage</p>
        <h4 id="daily-work-run-prompt-title">Vorbereiteter Arbeitsvorschlag</h4>
        <p>Keine Codex-API, kein Agentenstart und keine automatische Ausführung.</p>
      </div>
      <textarea id="daily-work-run-prompt-text" rows="18" readonly>${deps.escapeHtml(run.codexPreparation.preparedPrompt)}</textarea>
      <div class="daily-work-run-actions">
        <button class="secondary-button" type="button" data-copy-daily-work-prompt>Arbeitsvorschlag kopieren</button>
        <span data-daily-work-copy-status>Noch nicht kopiert.</span>
      </div>
    </section>
  `;
}

function renderDailyWorkRunResultReturn(run) {
  if (run.status === "DRAFT") return "";
  const locked = run.status !== "READY_FOR_CODEX";
  const result = run.resultReturn;
  return `
    <section class="daily-work-run-stage" aria-labelledby="daily-result-return-title">
      <div class="daily-work-run-stage-number">F</div>
      <div>
        <h4 id="daily-result-return-title">Ergebnisrückführung</h4>
        <p>Ergebnis und Git-Stand werden ausschließlich manuell eingetragen.</p>
      </div>
      <form class="daily-work-run-form daily-work-run-field--wide" id="daily-work-run-result-form">
        <label class="daily-work-run-field daily-work-run-field--wide">Ergebniszusammenfassung<textarea name="summary" rows="4" required ${locked ? "disabled" : ""}>${deps.escapeHtml(result.summary)}</textarea></label>
        <label class="daily-work-run-field">Geänderte Dateien – eine pro Zeile<textarea name="changedFiles" rows="5" ${locked ? "disabled" : ""}>${deps.escapeHtml(result.changedFiles.join("\n"))}</textarea></label>
        <label class="daily-work-run-field">Tests – einer pro Zeile<textarea name="tests" rows="5" required ${locked ? "disabled" : ""}>${deps.escapeHtml(result.tests.join("\n"))}</textarea></label>
        <label class="daily-work-run-field">Git-Branch<input name="gitBranch" value="${deps.escapeHtml(result.gitBranch || "main")}" required ${locked ? "disabled" : ""} /></label>
        <label class="daily-work-run-field">Commit<select name="commitStatus" ${locked ? "disabled" : ""}><option ${result.commitStatus === "kein Commit" ? "selected" : ""}>kein Commit</option><option ${result.commitStatus === "Commit vorhanden" ? "selected" : ""}>Commit vorhanden</option></select></label>
        <label class="daily-work-run-field">Push<select name="pushStatus" ${locked ? "disabled" : ""}><option ${result.pushStatus === "kein Push" ? "selected" : ""}>kein Push</option><option ${result.pushStatus === "Push vorhanden" ? "selected" : ""}>Push vorhanden</option></select></label>
        <label class="daily-work-run-field">Risiken – eines pro Zeile<textarea name="risks" rows="4" ${locked ? "disabled" : ""}>${deps.escapeHtml(result.risks.join("\n"))}</textarea></label>
        <label class="daily-work-run-field">Offene Punkte – einer pro Zeile<textarea name="openPoints" rows="4" ${locked ? "disabled" : ""}>${deps.escapeHtml(result.openPoints.join("\n"))}</textarea></label>
        ${locked ? "" : `<div class="daily-work-run-actions daily-work-run-field--wide"><button class="primary-button" type="submit">Ergebnis manuell zurückführen</button><span>Keine automatische Projektänderung.</span></div>`}
      </form>
    </section>
  `;
}

function renderDailyWorkRunClosure(run) {
  if (!["RESULT_RECORDED", "CLOSED", "OPEN"].includes(run.status)) return "";
  const final = ["CLOSED", "OPEN"].includes(run.status);
  if (!final) {
    return `
      <section class="daily-work-run-stage" aria-labelledby="daily-closure-title">
        <div class="daily-work-run-stage-number">G</div>
        <div><h4 id="daily-closure-title">Tagesabschluss</h4><p>Jamal entscheidet und hält genau einen nächsten Schritt fest.</p></div>
        <form class="daily-work-run-form daily-work-run-field--wide" id="daily-work-run-closure-form">
          <label class="daily-work-run-field">Status<select name="status" required><option value="">Bitte wählen</option><option value="CLOSED">abgeschlossen</option><option value="OPEN">offen</option></select></label>
          <label class="daily-work-run-field">Jamals Entscheidung<textarea name="jamalDecision" rows="3" required></textarea></label>
          <label class="daily-work-run-field daily-work-run-field--wide">Genau ein nächster sicherer Schritt<textarea name="nextSafeStep" rows="3" required></textarea></label>
          <div class="daily-work-run-actions daily-work-run-field--wide"><button class="primary-button" type="submit">Tagesabschluss lokal bestätigen</button><span>Erst danach kann ein Verlaufseintrag übernommen werden.</span></div>
        </form>
      </section>
    `;
  }

  const entry = dailyWorkRunApi().createHistoryEntry(run, true);
  return `
    <section class="daily-work-run-stage is-final" aria-labelledby="daily-closure-title">
      <div class="daily-work-run-stage-number">G</div>
      <div><h4 id="daily-closure-title">Tagesabschluss</h4><p>${deps.escapeHtml(dailyWorkRunStatusLabel(run.status))}</p></div>
      <dl class="daily-work-run-facts daily-work-run-field--wide">
        <div><dt>Jamals Entscheidung</dt><dd>${deps.escapeHtml(run.closure.jamalDecision)}</dd></div>
        <div><dt>Nächster sicherer Schritt</dt><dd>${deps.escapeHtml(run.closure.nextSafeStep)}</dd></div>
        <div><dt>Abschlusszeit</dt><dd>${deps.escapeHtml(run.closure.closedAt || "UNGEKLÄRT")}</dd></div>
      </dl>
      <div class="daily-work-run-history-preview daily-work-run-field--wide">
        <strong>Vorschau des Verlaufseintrags</strong>
        <pre>${deps.escapeHtml(entry?.description || "Kein Verlaufseintrag verfügbar.")}</pre>
      </div>
      <div class="daily-work-run-actions daily-work-run-field--wide">
        <button class="secondary-button" type="button" data-transfer-daily-work-history ${run.closure.historyTransferredAt ? "disabled" : ""}>${run.closure.historyTransferredAt ? "Verlaufseintrag bereits übernommen" : "Verlaufseintrag bewusst lokal übernehmen"}</button>
        <button class="secondary-button" type="button" data-start-daily-work-run>Neuen Tageslauf beginnen</button>
      </div>
    </section>
  `;
}

function localDataBackupApi() {
  return LocalDataBackup || null;
}

function resetLocalDataBackupFlow() {
  localDataBackupUiState.pendingExport = null;
  localDataBackupUiState.preview = null;
  localDataBackupUiState.importToken = null;
}

function reloadApplicationStateFromStorage() {
  const fresh = deps.loadState();
  deps.getAppState().projects = fresh.projects;
  deps.getAppState().tickets = fresh.tickets;
  deps.getAppState().knowledge = fresh.knowledge;
  deps.getAppState().selectedDraftId = fresh.selectedDraftId;
  deps.getAppState().selectedDetailId = fresh.selectedDetailId;
  deps.getAppState().dailyFocusProjectId = fresh.dailyFocusProjectId;
  deps.getAppState().dailyFocusReasons = fresh.dailyFocusReasons;
  deps.getAppState().dailyFocusQuestions = fresh.dailyFocusQuestions;
  deps.getAppState().dailyFocusDecisionTemplates = fresh.dailyFocusDecisionTemplates;
  deps.getAppState().dailyFocusDecisionStatuses = fresh.dailyFocusDecisionStatuses;
  if (DailyWorkRun) {
    dailyWorkRunUiState.store = DailyWorkRun.loadDailyStore(deps.localStorage);
  }
  deps.renderAll();
}

function renderLocalDataBackupSection() {
  const backupApi = localDataBackupApi();
  if (!backupApi) {
    return `<p class="daily-work-run-storage-note">Datensicherung ist derzeit nicht verfügbar.</p>`;
  }
  const preview = localDataBackupUiState.preview;
  const statusClass =
    localDataBackupUiState.statusType === "success"
      ? "daily-work-run-backup-status daily-work-run-backup-status--success"
      : localDataBackupUiState.statusType === "error"
        ? "daily-work-run-backup-status daily-work-run-backup-status--error"
        : "daily-work-run-backup-status";
  return `
    <details class="daily-work-run-backup">
      <summary>Lokale Datensicherung</summary>
      <p class="daily-work-run-storage-note">Exportiert und stellt ausschließlich lokale Browser-Arbeitsdaten wieder her. Kanonische Projekt- und Agentenregister bleiben unverändert.</p>
      <div class="daily-work-run-backup-actions">
        <button class="secondary-button" type="button" data-export-local-backup>Daten exportieren</button>
        <label class="daily-work-run-backup-file">
          <span class="secondary-button">Sicherung auswählen</span>
          <input type="file" accept="application/json,.json" data-import-local-backup-file hidden />
        </label>
      </div>
      ${preview ? `
        <article class="daily-work-run-backup-preview" aria-live="polite">
          <p class="eyebrow">Import-Vorschau · noch nicht übernommen</p>
          <dl class="daily-work-run-facts">
            <div><dt>Exportzeitpunkt</dt><dd>${deps.escapeHtml(preview.exportedAt)}</dd></div>
            <div><dt>Enthaltene Bereiche</dt><dd>${deps.escapeHtml(preview.storageAreas.map((entry) => `${entry.label}${entry.emptyInBackup ? " (leer)" : ""}`).join(" · "))}</dd></div>
            <div><dt>Tagesläufe in Sicherung</dt><dd>${deps.escapeHtml(String(preview.dailyRunCount))}</dd></div>
            <div><dt>Überschreibt vorhandene Daten</dt><dd>${deps.escapeHtml([preview.overwrite.management ? "Managementdaten" : null, preview.overwrite.daily ? "Tagesläufe" : null].filter(Boolean).join(" · ") || "Keine vorhandenen lokalen Daten")}</dd></div>
          </dl>
          <p class="daily-work-run-backup-warning">${deps.escapeHtml(preview.safetyNotice)}</p>
          <div class="daily-work-run-backup-actions">
            <button class="primary-button" type="button" data-confirm-local-backup-import>Import ausdrücklich bestätigen</button>
            <button class="secondary-button" type="button" data-cancel-local-backup-import>Abbrechen</button>
          </div>
        </article>
      ` : ""}
      ${localDataBackupUiState.statusMessage ? `<p class="${statusClass}">${deps.escapeHtml(localDataBackupUiState.statusMessage)}</p>` : ""}
    </details>
  `;
}

function renderDailyWorkRun() {
  const output = deps.byId("daily-work-run-output");
  if (!output) return;
  const api = dailyWorkRunApi();
  if (!api) {
    output.innerHTML = `<article class="daily-work-run-notice daily-work-run-notice--warning"><strong>UNGEKLÄRT</strong><p>Tagesarbeitslauf-Modul ist nicht verfügbar.</p></article>${renderLocalDataBackupSection()}`;
    return;
  }

  const run = getActiveDailyWorkRun();
  if (!run) {
    output.innerHTML = `
      <article class="daily-work-run-start-card">
        <p class="eyebrow">Bereit für einen bewussten Start</p>
        <h4>Noch kein Tageslauf begonnen</h4>
        <p>Es wird kein Fokusprojekt automatisch gewählt. Health Upgrade Kompass ist der empfohlene erste technische Pilot.</p>
        <button class="primary-button" type="button" data-start-daily-work-run>Tageslauf manuell beginnen</button>
      </article>
      <p class="daily-work-run-storage-note">Arbeitsdaten werden lokal in diesem Browser gespeichert. Kanonische Projekt-, Git- und Testdaten werden dadurch nicht verändert.</p>
      ${renderLocalDataBackupSection()}
    `;
    return;
  }

  const projects = canonicalProjectsForDailyWorkRun();
  const focusOptions = [
    `<option value="">Kein Fokusprojekt ausgewählt</option>`,
    ...projects
      .slice()
      .sort((a, b) => {
        if (a.id === "health-upgrade-kompass") return -1;
        if (b.id === "health-upgrade-kompass") return 1;
        return a.displayName.localeCompare(b.displayName, "de");
      })
      .map((project) => `<option value="${deps.escapeHtml(project.id)}" ${project.id === run.focusProjectId ? "selected" : ""}>${deps.escapeHtml(project.displayName)}${project.id === "health-upgrade-kompass" ? " · empfohlener Pilot" : ""}</option>`),
  ].join("");

  output.innerHTML = `
    <div class="daily-work-run-toolbar">
      <div>
        <span class="daily-work-run-status">${deps.escapeHtml(dailyWorkRunStatusLabel(run.status))}</span>
        <strong>${deps.escapeHtml(run.workDate)}</strong>
      </div>
      <div class="daily-work-run-progress" aria-label="Fortschritt">
        <span class="${dailyWorkRunStepClass(run, 1)}">1 Vorbereitung</span>
        <span class="${dailyWorkRunStepClass(run, 2)}">2 Arbeitsvorschlag</span>
        <span class="${dailyWorkRunStepClass(run, 3)}">3 Rückführung</span>
        <span class="${dailyWorkRunStepClass(run, 4)}">4 Abschluss</span>
      </div>
    </div>
    ${["READY_FOR_CODEX", "RESULT_RECORDED"].includes(run.status) ? `
      <article class="daily-work-run-start-card">
        <strong>Dieser gespeicherte Lauf ist nach der Vorschlagserstellung nicht mehr editierbar.</strong>
        <p>Beginne einen neuen Tageslauf, um einen neuen Ergebniswunsch einzugeben. Der vorhandene Lauf bleibt vollständig erhalten.</p>
        <button class="primary-button" type="button" data-start-daily-work-run>Neuen Tageslauf beginnen</button>
      </article>
    ` : ""}
    ${dailyWorkRunUiState.error ? `<p class="daily-work-run-error">${deps.escapeHtml(dailyWorkRunUiState.error)}</p>` : ""}
    <section class="daily-work-run-stage" aria-labelledby="daily-start-title">
      <div class="daily-work-run-stage-number">A</div>
      <div><h4 id="daily-start-title">Tagesstart</h4><p>Genau ein Fokusprojekt wird bewusst ausgewählt.</p></div>
      <label class="daily-work-run-field daily-work-run-field--wide">
        Fokusprojekt
        <select data-daily-work-focus ${run.status === "DRAFT" && projects.length > 0 ? "" : "disabled"}>${focusOptions}</select>
      </label>
      <div class="daily-work-run-field--wide">${renderDailyWorkRunCurrentProject(run)}</div>
    </section>
    ${renderDailyWorkRunPreparation(run)}
    ${renderDailyWorkAgentReviewPhase(run)}
    ${run.workProposal?.taskType === "Agenten- und Einsatzplanung" ? "" : renderDailyWorkRunPrompt(run)}
    ${run.workProposal?.taskType === "Agenten- und Einsatzplanung" ? "" : renderDailyWorkRunResultReturn(run)}
    ${run.workProposal?.taskType === "Agenten- und Einsatzplanung" ? "" : renderDailyWorkRunClosure(run)}
    <p class="daily-work-run-storage-note">Arbeitsdaten werden lokal in diesem Browser gespeichert. Kanonische Projekt-, Git- und Testdaten werden dadurch nicht verändert.</p>
    ${renderLocalDataBackupSection()}
  `;
}

function setupLocalDataBackup() {
  document.addEventListener("click", (event) => {
    const exportButton = event.target.closest("[data-export-local-backup]");
    if (exportButton) {
      try {
        const backupApi = localDataBackupApi();
        if (!backupApi) throw new Error("Datensicherung ist nicht verfügbar.");
        const json = backupApi.exportLocalDataJson(deps.localStorage);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ki-unternehmenszentrale-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        localDataBackupUiState.statusType = "success";
        localDataBackupUiState.statusMessage = "Sicherung exportiert. Es wurde keine externe Aktion ausgelöst.";
        renderDailyWorkRun();
        deps.showToast("Lokale Datensicherung exportiert.");
      } catch (error) {
        localDataBackupUiState.statusType = "error";
        localDataBackupUiState.statusMessage = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-local-backup-import]");
    if (cancelButton) {
      resetLocalDataBackupFlow();
      localDataBackupUiState.statusType = null;
      localDataBackupUiState.statusMessage = "Import abgebrochen. Bestehende lokale Daten bleiben unverändert.";
      renderDailyWorkRun();
      deps.showToast("Import abgebrochen.");
      return;
    }

    const confirmButton = event.target.closest("[data-confirm-local-backup-import]");
    if (confirmButton) {
      try {
        const backupApi = localDataBackupApi();
        if (!backupApi || !localDataBackupUiState.pendingExport) {
          throw new Error("Es liegt keine geprüfte Import-Vorschau vor.");
        }
        const token = localDataBackupUiState.importToken;
        backupApi.importLocalData(deps.localStorage, localDataBackupUiState.pendingExport, {
          confirmed: true,
          importToken: token,
          lastCompletedImportToken: localDataBackupUiState.lastCompletedImportToken,
        });
        localDataBackupUiState.lastCompletedImportToken = token;
        resetLocalDataBackupFlow();
        reloadApplicationStateFromStorage();
        localDataBackupUiState.statusType = "success";
        localDataBackupUiState.statusMessage = "Import abgeschlossen. Bitte bei Bedarf per Reload prüfen.";
        renderDailyWorkRun();
        deps.showToast("Lokale Sicherung importiert. Keine Agenten- oder externe Aktion ausgelöst.");
      } catch (error) {
        localDataBackupUiState.statusType = "error";
        localDataBackupUiState.statusMessage = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
    }
  });

  document.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-import-local-backup-file]")) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backupApi = localDataBackupApi();
      if (!backupApi) throw new Error("Datensicherung ist nicht verfügbar.");
      const text = await file.text();
      const parsed = backupApi.parseExportJson(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const validation = backupApi.validateImportPayload(parsed.export, deps.localStorage);
      if (!validation.ok) throw new Error(validation.error);
      localDataBackupUiState.pendingExport = parsed.export;
      localDataBackupUiState.preview = validation.preview;
      localDataBackupUiState.importToken = `import-${Date.now()}`;
      localDataBackupUiState.statusType = null;
      localDataBackupUiState.statusMessage = null;
      renderDailyWorkRun();
      deps.showToast("Import-Vorschau bereit. Bitte ausdrücklich bestätigen.");
    } catch (error) {
      resetLocalDataBackupFlow();
      localDataBackupUiState.statusType = "error";
      localDataBackupUiState.statusMessage = error.message;
      renderDailyWorkRun();
      deps.showToast(error.message);
    }
  });
}

function setupDailyWorkRun() {
  document.addEventListener("click", async (event) => {
    const startButton = event.target.closest("[data-start-daily-work-run]");
    if (startButton) {
      const api = dailyWorkRunApi();
      const run = api.createDraftRun();
      saveDailyWorkRun(run);
      deps.showToast("Neuer Tageslauf lokal begonnen. Noch kein Fokusprojekt gewählt.");
      return;
    }

    const prepareAgentReviewButton = event.target.closest("[data-prepare-agent-review]");
    if (prepareAgentReviewButton) {
      try {
        const run = dailyWorkRunApi().prepareAgentReviewPhase(getActiveDailyWorkRun(), { approved: true });
        saveDailyWorkRun(run);
        deps.showToast("Interne Agentenaufträge vorbereitet. Es wurde kein Agent ausgeführt.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const adjustAgentReviewButton = event.target.closest("[data-adjust-agent-review]");
    if (adjustAgentReviewButton) {
      try {
        const api = dailyWorkRunApi();
        const previous = getActiveDailyWorkRun();
        const current = currentCanonicalDailyProject(previous.focusProjectId);
        let run = api.createDraftRun();
        if (current.available) run = api.setFocusProject(run, current.project, getCanonicalProjectRegistryState().payload.snapshotNotice);
        saveDailyWorkRun(run);
        deps.showToast("Neuer bearbeitbarer Tageslauf begonnen. Der bisherige Einsatzplan bleibt erhalten.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const declineAgentReviewButton = event.target.closest("[data-decline-agent-review]");
    if (declineAgentReviewButton) {
      try {
        const run = dailyWorkRunApi().setAgentReviewApproval(getActiveDailyWorkRun(), "DECLINED");
        saveDailyWorkRun(run);
        deps.showToast("Prüfphase bewusst nicht gestartet. Keine Agentenaufträge erzeugt.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const transferAgentReviewButton = event.target.closest("[data-transfer-agent-review-history]");
    if (transferAgentReviewButton) {
      try {
        const api = dailyWorkRunApi();
        let run = getActiveDailyWorkRun();
        const current = currentCanonicalDailyProject(run.focusProjectId);
        const localProject = localManagementProjectForCanonical(current.project);
        if (!localProject) throw new Error("Keine getrennte lokale Managementakte für dieses Projekt vorhanden.");
        const entry = api.createAgentReviewHistoryEntry(run, true);
        if (!entry) throw new Error("Prüfphasen-Verlauf ist noch nicht freigegeben.");
        localProject.history = api.applyHistoryEntryOnce(deps.getProjectHistory(localProject), entry);
        run = api.markAgentReviewHistoryTransferred(run, entry);
        deps.saveState();
        saveDailyWorkRun(run);
        deps.showToast("Prüfphasenabschluss einmalig lokal in den Projektverlauf übernommen.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const runtimePrepareButton = event.target.closest("[data-runtime-prepare]");
    if (runtimePrepareButton) {
      try {
        const runtime = agentRuntimeApi();
        if (!runtime) throw new Error("Agenten-Laufzeit ist nicht verfügbar.");
        const run = getActiveDailyWorkRun();
        const pilot = runtime.createRuntimePilot(run, { actor: "Jamal" });
        saveRunWithRuntimePilot(run, pilot);
        agentRuntimeUiState.error = null;
        deps.showToast("Runtime-Pilot vorbereitet. Kein Lauf gestartet.");
      } catch (error) {
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const runtimeApproveButton = event.target.closest("[data-runtime-approve]");
    if (runtimeApproveButton) {
      try {
        const runtime = agentRuntimeApi();
        const run = getActiveDailyWorkRun();
        let pilot = runtime.refreshRuntimePilot(run) || run.agentRuntimePilot;
        if (pilot !== run.agentRuntimePilot) {
          saveRunWithRuntimePilot(run, pilot);
        }
        pilot = runtime.grantJamalApproval(getActiveDailyWorkRun().agentRuntimePilot, { actor: "Jamal" });
        saveRunWithRuntimePilot(getActiveDailyWorkRun(), pilot);
        agentRuntimeUiState.error = null;
        deps.showToast("Jamal-Freigabe gespeichert. Der Lauf startet nicht automatisch.");
      } catch (error) {
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const runtimeStartButton = event.target.closest("[data-runtime-start]");
    if (runtimeStartButton) {
      const runtime = agentRuntimeApi();
      if (!runtime || agentRuntimeUiState.runningAttemptId) return;
      try {
        const run = getActiveDailyWorkRun();
        let pilot = runtime.refreshRuntimePilot(run) || run.agentRuntimePilot;
        if (pilot !== run.agentRuntimePilot) {
          saveRunWithRuntimePilot(run, pilot);
        }
        pilot = getActiveDailyWorkRun().agentRuntimePilot;
        if (pilot.status !== "APPROVED") {
          throw new Error("Start ist ohne Freigabe nicht erlaubt.");
        }
        agentRuntimeUiState.runningAttemptId = pilot.runtimeAttemptId;
        const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        agentRuntimeUiState.abortController = abortController;
        agentRuntimeUiState.error = null;
        renderDailyWorkRun();
        runtime
          .runWithExecutor(pilot, runtime.createLocalDeterministicPilotExecutor(), {
            abortController,
            actor: "Jamal",
          })
          .then((finishedPilot) => {
            agentRuntimeUiState.runningAttemptId = null;
            agentRuntimeUiState.abortController = null;
            if (!finishedPilot) return;
            saveRunWithRuntimePilot(getActiveDailyWorkRun(), finishedPilot);
            deps.showToast("Lokaler Pilot abgeschlossen. Ergebnis ist prüfpflichtig.");
          })
          .catch((error) => {
            agentRuntimeUiState.runningAttemptId = null;
            agentRuntimeUiState.abortController = null;
            agentRuntimeUiState.error = error.message;
            renderDailyWorkRun();
            deps.showToast(error.message);
          });
      } catch (error) {
        agentRuntimeUiState.runningAttemptId = null;
        agentRuntimeUiState.abortController = null;
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const runtimeCancelButton = event.target.closest("[data-runtime-cancel]");
    if (runtimeCancelButton) {
      try {
        const runtime = agentRuntimeApi();
        const run = getActiveDailyWorkRun();
        agentRuntimeUiState.abortController?.abort();
        let pilot = runtime.requestCancel(run.agentRuntimePilot, { actor: "Jamal" });
        pilot = runtime.markCancelled(pilot, { actor: "Jamal", cancelRequested: true });
        agentRuntimeUiState.runningAttemptId = null;
        agentRuntimeUiState.abortController = null;
        saveRunWithRuntimePilot(run, pilot);
        agentRuntimeUiState.error = null;
        deps.showToast("Lauf abgebrochen. Keine Ergebnisübernahme.");
      } catch (error) {
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    const copyButton = event.target.closest("[data-copy-daily-work-prompt]");
    if (copyButton) {
      const text = deps.byId("daily-work-run-prompt-text")?.value || "";
      const status = document.querySelector("[data-daily-work-copy-status]");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = "Arbeitsvorschlag lokal kopiert. Keine Ausführung gestartet.";
        deps.showToast("Arbeitsvorschlag kopiert. Keine Ausführung gestartet.");
      } catch (_error) {
        deps.byId("daily-work-run-prompt-text")?.select();
        if (status) status.textContent = "Bitte den markierten Text manuell kopieren.";
      }
      return;
    }

    const transferButton = event.target.closest("[data-transfer-daily-work-history]");
    if (transferButton) {
      try {
        const api = dailyWorkRunApi();
        let run = getActiveDailyWorkRun();
        const current = currentCanonicalDailyProject(run.focusProjectId);
        const localProject = localManagementProjectForCanonical(current.project);
        if (!localProject) throw new Error("Keine getrennte lokale Managementakte für dieses Projekt vorhanden.");
        const entry = api.createHistoryEntry(run, true);
        if (!entry) throw new Error("Verlaufseintrag ist noch nicht freigegeben.");
        localProject.history = api.applyHistoryEntryOnce(deps.getProjectHistory(localProject), entry);
        run = api.markHistoryTransferred(run, entry);
        deps.saveState();
        saveDailyWorkRun(run);
        deps.showToast("Tagesabschluss einmalig lokal in den Projektverlauf übernommen.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
    }
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-daily-work-focus]")) return;
    try {
      const projectId = event.target.value;
      const current = currentCanonicalDailyProject(projectId);
      if (!current.available) throw new Error("Kanonisches Projekt ist aktuell UNGEKLÄRT.");
      const run = dailyWorkRunApi().setFocusProject(
        getActiveDailyWorkRun(),
        current.project,
        getCanonicalProjectRegistryState().payload.snapshotNotice,
      );
      saveDailyWorkRun(run);
      deps.showToast(`${current.project.displayName} wurde bewusst als Fokus gewählt.`);
    } catch (error) {
      dailyWorkRunUiState.error = error.message;
      renderDailyWorkRun();
      deps.showToast(error.message);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "daily-work-run-preparation-form") {
      event.preventDefault();
      try {
        const api = dailyWorkRunApi();
        const data = new FormData(event.target);
        let run = api.createWorkProposal(getActiveDailyWorkRun(), {
          desiredOutcome: data.get("desiredOutcome"),
          prohibitedToday: data.get("prohibitedToday"),
        });
        run = api.transitionRun(run, "READY_FOR_CODEX");
        saveDailyWorkRun(run);
        deps.showToast("Arbeitsvorschlag erstellt. Keine Ausführung gestartet.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.matches("[data-agent-result-form]")) {
      event.preventDefault();
      try {
        const data = new FormData(event.target);
        const run = dailyWorkRunApi().recordAgentWorkResult(
          getActiveDailyWorkRun(),
          event.target.dataset.agentId,
          {
            resultText: data.get("resultText"),
            openPoints: data.get("openPoints"),
            blockers: data.get("blockers"),
            confirmed: data.get("confirmed") === "on",
          },
        );
        saveDailyWorkRun(run);
        deps.showToast("Agentenbefund manuell bestätigt. Es wurde kein Agent ausgeführt.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-review-qa-form") {
      event.preventDefault();
      try {
        const data = new FormData(event.target);
        const run = dailyWorkRunApi().recordQaResult(getActiveDailyWorkRun(), {
          status: data.get("status"),
          resultText: data.get("resultText"),
          openPoints: data.get("openPoints"),
          blockers: data.get("blockers"),
          safetyBoundariesViolated: data.get("safetyBoundariesViolated"),
          criteriaAnswered: data.get("criteriaAnswered") === "on",
        });
        saveDailyWorkRun(run);
        deps.showToast("QA-Befund manuell bestätigt. Keine automatische Bewertung erzeugt.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-review-orchestration-form") {
      event.preventDefault();
      try {
        const data = new FormData(event.target);
        const run = dailyWorkRunApi().recordOrchestrationSummary(getActiveDailyWorkRun(), {
          confirmedFindings: data.get("confirmedFindings"),
          openPoints: data.get("openPoints"),
          conflicts: data.get("conflicts"),
          risks: data.get("risks"),
          recommendedNextStep: data.get("recommendedNextStep"),
          notApproved: data.get("notApproved"),
          jamalDecisionQuestion: data.get("jamalDecisionQuestion"),
        });
        saveDailyWorkRun(run);
        deps.showToast("Gesamtbefund manuell bestätigt. Keine externe Aktion ausgelöst.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-review-final-form") {
      event.preventDefault();
      try {
        const data = new FormData(event.target);
        const run = dailyWorkRunApi().setAgentReviewFinalDecision(getActiveDailyWorkRun(), {
          decision: data.get("decision"),
          nextSafeStep: data.get("nextSafeStep"),
        });
        saveDailyWorkRun(run);
        deps.showToast("Jamals Entscheidung lokal gespeichert. Keine Folgeaktion gestartet.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-run-result-form") {
      event.preventDefault();
      try {
        const api = dailyWorkRunApi();
        const data = new FormData(event.target);
        let run = api.setResultReturn(getActiveDailyWorkRun(), {
          summary: data.get("summary"),
          changedFiles: data.get("changedFiles"),
          tests: data.get("tests"),
          gitBranch: data.get("gitBranch"),
          commitStatus: data.get("commitStatus"),
          pushStatus: data.get("pushStatus"),
          risks: data.get("risks"),
          openPoints: data.get("openPoints"),
        });
        run = api.transitionRun(run, "RESULT_RECORDED");
        saveDailyWorkRun(run);
        deps.showToast("Ergebnis manuell zurückgeführt. Keine Projektänderung ausgelöst.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-runtime-accept-form") {
      event.preventDefault();
      try {
        const runtime = agentRuntimeApi();
        const data = new FormData(event.target);
        const run = getActiveDailyWorkRun();
        const accepted = runtime.acceptResult(run, run.agentRuntimePilot, {
          confirmed: data.get("confirmed") === "on",
        });
        saveRunWithRuntimePilot(accepted.run, accepted.pilot);
        agentRuntimeUiState.error = null;
        deps.showToast("Runtime-Ergebnis übernommen. Arbeitskarte wurde einmalig aktualisiert.");
      } catch (error) {
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-runtime-reject-form") {
      event.preventDefault();
      try {
        const runtime = agentRuntimeApi();
        const data = new FormData(event.target);
        const run = getActiveDailyWorkRun();
        const pilot = runtime.rejectResult(run.agentRuntimePilot, { reason: data.get("reason") });
        saveRunWithRuntimePilot(run, pilot);
        agentRuntimeUiState.error = null;
        deps.showToast("Runtime-Ergebnis abgelehnt. Arbeitskarte bleibt unverändert.");
      } catch (error) {
        agentRuntimeUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
      return;
    }

    if (event.target.id === "daily-work-run-closure-form") {
      event.preventDefault();
      try {
        const api = dailyWorkRunApi();
        const data = new FormData(event.target);
        let run = api.setClosure(getActiveDailyWorkRun(), {
          status: data.get("status"),
          jamalDecision: data.get("jamalDecision"),
          nextSafeStep: data.get("nextSafeStep"),
        });
        run = api.transitionRun(run, run.closure.status);
        saveDailyWorkRun(run);
        deps.showToast("Tagesabschluss lokal bestätigt. Verlauf noch nicht übernommen.");
      } catch (error) {
        dailyWorkRunUiState.error = error.message;
        renderDailyWorkRun();
        deps.showToast(error.message);
      }
    }
  });
}
  function init(dependencies = {}) {
    if (initialized) return;
    const missing = REQUIRED_DEPS.filter((key) => typeof dependencies[key] !== "function" && key !== "localStorage");
    if (missing.length > 0) {
      throw new Error(`DailyWorkRunUi: fehlende Abhängigkeiten: ${missing.join(", ")}`);
    }
    if (!dependencies.localStorage || typeof dependencies.localStorage.getItem !== "function") {
      throw new Error("DailyWorkRunUi: localStorage ist erforderlich.");
    }
    deps = dependencies;
    if (DailyWorkRun) {
      dailyWorkRunUiState.store = DailyWorkRun.loadDailyStore(deps.localStorage);
    } else {
      dailyWorkRunUiState.error = "Tagesarbeitslauf-Modul ist nicht verfügbar.";
    }
    if (!eventsBound && typeof document !== "undefined") {
      setupLocalDataBackup();
      setupDailyWorkRun();
      eventsBound = true;
    }
    initialized = true;
  }

  function render() {
    renderDailyWorkRun();
  }

  return {
    init,
    render,
    DAILY_STORAGE_KEY: DailyWorkRun?.DAILY_STORAGE_KEY || "ki-unternehmenszentrale-daily-work-runs-v1",
    LEGACY_MANAGEMENT_STORAGE_KEY: DailyWorkRun?.LEGACY_MANAGEMENT_STORAGE_KEY || "ki-unternehmenszentrale-v1",
    getInternalState() {
      return { initialized, eventsBound, dailyWorkRunUiState, localDataBackupUiState };
    },
  };
});
