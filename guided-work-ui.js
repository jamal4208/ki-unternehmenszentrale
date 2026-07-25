"use strict";

(function initGuidedWorkUi(root, factory) {
  const guidedWorkModule =
    typeof module === "object" && module.exports
      ? require("./guided-work")
      : root?.GuidedWork;
  const agentRegistryModule =
    typeof module === "object" && module.exports
      ? require("./agent-registry")
      : root?.AgentRegistry;
  const api = factory(guidedWorkModule, agentRegistryModule);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GuidedWorkUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createGuidedWorkUi(GuidedWork, AgentRegistry) {
  function escape(deps, value) {
    return deps.escapeHtml(String(value ?? ""));
  }

  function shortHash(value) {
    const text = String(value || "");
    if (text.length <= 12) return text || "UNGEKLÄRT";
    return `${text.slice(0, 8)}…`;
  }

  function phaseLabel(phase) {
    return {
      NO_RUN: "Start",
      FOCUS: "Fokus",
      OUTCOME: "Ergebnis",
      TEAM: "Team",
      BASELINE: "Baseline",
      PACKAGE: "Paket",
      EXTERNAL: "Externe Arbeit",
      EVIDENCE: "Evidenz",
      REVIEW: "Prüfung",
      CLOSED: "Abschluss",
    }[phase] || phase || "UNGEKLÄRT";
  }

  function serverStatusUiText(status) {
    return {
      RUNNING: "Aktuell und betriebsbereit",
      VERSION_MISMATCH: "Server wahrscheinlich veraltet",
      PORT_CONFLICT: "Port durch anderen Prozess belegt",
    }[status] || "Serverstatus ungeklärt";
  }

  function formatStartedAt(value) {
    if (typeof value !== "string" || !value) return "UNGEKLÄRT";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "UNGEKLÄRT";
    try {
      return date.toLocaleString("de-DE");
    } catch (_error) {
      return date.toISOString();
    }
  }

  // Read-only rendering of a status this same page's server already reported about
  // itself. No start/stop/restart controls here — see AGENTS.md / MIGRATION_PLAN.md
  // Phase B boundary: the external controller remains the source of truth for
  // "gestoppt"; this view never claims that, since a reachable page implies a
  // reachable server.
  function renderServerStatus(serverStatusData, deps) {
    const data = serverStatusData || null;
    const status = data?.status || "UNKNOWN";
    const label = serverStatusUiText(status);
    const showNextStep = Boolean(data) && status !== "RUNNING";
    return `
      <div class="guided-work-server-status" data-server-status="${escape(deps, status)}">
        <p class="guided-work-server-status-line">
          <strong>${escape(deps, label)}</strong>
          · Port ${escape(deps, String(data?.port ?? "UNGEKLÄRT"))}
          · ${escape(deps, data?.appVersion || "UNGEKLÄRT")}
          · Commit ${escape(deps, shortHash(data?.gitCommit))}
          · Start ${escape(deps, formatStartedAt(data?.startedAt))}
        </p>
        ${showNextStep ? `<p class="guided-work-server-status-next-step">Nächster sicherer Schritt: <code>${escape(deps, data?.nextAction || "npm run central:status")}</code></p>` : ""}
        <details class="guided-work-server-status-details">
          <summary>Technische Details (PID, vollständiger Commit, Controller)</summary>
          <dl class="daily-work-run-facts">
            <div><dt>PID</dt><dd>${escape(deps, String(data?.pid ?? "UNGEKLÄRT"))}</dd></div>
            <div><dt>Commit (voll)</dt><dd><code>${escape(deps, data?.gitCommit || "UNGEKLÄRT")}</code></dd></div>
            <div><dt>Aktueller Projekt-Commit</dt><dd><code>${escape(deps, data?.currentProjectCommit || "UNGEKLÄRT")}</code></dd></div>
            <div><dt>Verwaltet durch Controller</dt><dd>${data?.managedByController ? "ja" : "nein"}</dd></div>
            <div><dt>Controller-Schema-Version</dt><dd>${escape(deps, String(data?.controllerSchemaVersion ?? "—"))}</dd></div>
          </dl>
        </details>
      </div>
    `;
  }

  function renderPrimaryAction(action, deps) {
    if (!action) return "";
    return `
      <div class="guided-work-primary-action daily-work-run-primary-next-action">
        <strong>Nächster Schritt</strong>
        <p>${escape(deps, phaseLabel(action.phase))} · genau eine primäre Aktion</p>
        <button class="primary-button" type="button" data-guided-primary-action="${escape(deps, action.id)}">${escape(deps, action.label)}</button>
      </div>
    `;
  }

  function renderSuggestions(run, deps) {
    const suggestions = Array.isArray(run?.outcomeSuggestions) ? run.outcomeSuggestions : [];
    if (run?.status !== "DRAFT") return "";
    if (!suggestions.length) {
      return `
        <article class="guided-work-block">
          <h5>Arbeitsvorschläge</h5>
          <p class="daily-work-run-empty">Keine belastbare Quelle für einen deterministischen Vorschlag. Eigenen Ergebniswunsch eingeben.</p>
        </article>
      `;
    }
    return `
      <article class="guided-work-block">
        <h5>Deterministische Arbeitsvorschläge</h5>
        <p>Keine KI-Analyse. Auswahl startet nichts automatisch.</p>
        <div class="guided-work-suggestion-list">
          ${suggestions.map((suggestion) => `
            <label class="guided-work-suggestion ${run.selectedOutcomeSuggestionId === suggestion.id ? "is-selected" : ""}">
              <input type="radio" name="guided-outcome-suggestion" value="${escape(deps, suggestion.id)}" ${run.selectedOutcomeSuggestionId === suggestion.id ? "checked" : ""} />
              <span>
                <strong>${escape(deps, suggestion.title)}</strong>
                <em>${escape(deps, suggestion.label || "deterministischer Vorschlag")}</em>
                <span>${escape(deps, suggestion.sourceLabel)}</span>
                <span>${escape(deps, suggestion.expectedOutcome)}</span>
                <span>Risiko: ${escape(deps, suggestion.risk)}</span>
                <span>Kleinster sicherer Schritt: ${escape(deps, suggestion.smallestSafeStep)}</span>
              </span>
            </label>
          `).join("")}
        </div>
        <p class="guided-work-note">Eigener Ergebniswunsch bleibt im Feld darunter jederzeit möglich.</p>
      </article>
    `;
  }

  function renderTeamEditor(run, deps) {
    if (!run?.workProposal) return "";
    const guided = GuidedWork?.ensureGuidedDefaults?.(run) || run;
    const selected = new Set(guided.workProposal.selectedAgentIds || []);
    const agents = AgentRegistry?.PRODUCTIVE_AGENT_REGISTRY || [];
    const eligible = GuidedWork?.listEligibleResponsibleAgents?.(guided) || [];
    const preferred = guided.workProposal.preferredResponsibleAgentId || guided.executionPackage?.responsibleAgentId || eligible[0]?.id || "";
    const packageLocked = ["READY_TO_COPY", "IN_EXTERNAL_WORK", "RESULT_READY"].includes(guided.executionPackage?.status);
    const unnecessary = agents.filter((agent) => !selected.has(agent.id));

    return `
      <details class="guided-work-block guided-work-team-editor" ${packageLocked ? "" : "open"}>
        <summary>Agententeam und technische Hauptverantwortung</summary>
        <p>Vor Paketfreigabe editierbar. Lead und QA bleiben erkennbar getrennt. Keine Autonomieerhöhung.</p>
        ${packageLocked ? `
          <article class="daily-work-run-notice daily-work-run-notice--warning">
            <strong>Paket freigegeben</strong>
            <p>Keine stille Teamänderung. Zuerst sichtbar auf Paketentwurf zurücksetzen. Evidenz bleibt historisch erhalten.</p>
            <button class="secondary-button" type="button" data-guided-reset-package>Auf Paketentwurf zurücksetzen</button>
          </article>
        ` : `
          <div class="guided-work-team-grid">
            <div>
              <strong>Ausgewählt</strong>
              ${agents.filter((agent) => selected.has(agent.id)).map((agent) => `
                <label class="guided-work-agent-row">
                  <input type="checkbox" data-guided-team-agent value="${escape(deps, agent.id)}" checked ${agent.id === guided.workProposal.leadAgentId || agent.id === guided.workProposal.approvalAgentId ? "disabled" : ""} />
                  <span>${escape(deps, agent.name)}${agent.id === guided.workProposal.leadAgentId ? " · Lead" : ""}${agent.id === guided.workProposal.approvalAgentId ? " · QA" : ""}</span>
                </label>
              `).join("")}
            </div>
            <div>
              <strong>Derzeit nicht nötig</strong>
              ${unnecessary.slice(0, 12).map((agent) => `
                <label class="guided-work-agent-row">
                  <input type="checkbox" data-guided-team-agent value="${escape(deps, agent.id)}" />
                  <span>${escape(deps, agent.name)}</span>
                </label>
              `).join("")}
              ${unnecessary.length > 12 ? `<p class="guided-work-note">+ ${unnecessary.length - 12} weitere in technischer Ansicht</p>` : ""}
            </div>
          </div>
          <label class="guided-work-field">Technische Hauptverantwortung (responsibleAgentId)
            <select data-guided-responsible-agent>
              <option value="">Bitte wählen</option>
              ${eligible.map((agent) => `<option value="${escape(deps, agent.id)}" ${agent.id === preferred ? "selected" : ""}>${escape(deps, agent.name)}</option>`).join("")}
            </select>
          </label>
          <p class="guided-work-note">Lead und QA sind als responsible nicht zulässig.</p>
          <label class="guided-work-field">Auswahlgrund
            <input type="text" data-guided-team-reason placeholder="Warum diese Anpassung?" value="${escape(deps, guided.workProposal.teamEditReason || "")}" />
          </label>
          <div class="daily-work-run-actions">
            <button class="secondary-button" type="button" data-guided-team-preview>Auswirkung zeigen</button>
            <button class="secondary-button" type="button" data-guided-team-save>Teamänderung speichern</button>
          </div>
          <div data-guided-team-impact class="guided-work-impact" hidden></div>
        `}
        <dl class="daily-work-run-facts">
          <div><dt>teamRevision</dt><dd>${escape(deps, String(guided.teamRevision || 0))}</dd></div>
          <div><dt>responsibleAgentRevision</dt><dd>${escape(deps, String(guided.responsibleAgentRevision || 0))}</dd></div>
          <div><dt>Bevorzugt</dt><dd>${escape(deps, preferred || "noch offen")}</dd></div>
        </dl>
      </details>
    `;
  }

  function renderBaselinePanel(run, liveStatus, deps) {
    if (run?.focusProjectId !== "health-upgrade-kompass") return "";
    if (!["READY_FOR_CODEX", "RESULT_RECORDED", "CLOSED", "OPEN"].includes(run.status)) return "";
    const live = liveStatus?.live || null;
    const detail = live?.workingTreeDetail || null;
    const baseline = run.knownWorkingTreeBaseline;
    const clean = live?.workingTreeClean === true;
    const draft = live && GuidedWork?.buildBaselineDraftFromLiveDetail
      ? (() => {
        try {
          return GuidedWork.buildBaselineDraftFromLiveDetail(liveStatus, run);
        } catch (_error) {
          return null;
        }
      })()
      : null;

    return `
      <details class="guided-work-block" ${!clean && !baseline?.jamalConfirmedAt ? "open" : ""}>
        <summary>Live-Stand und Known-dirty-Baseline</summary>
        <dl class="daily-work-run-facts">
          <div><dt>Live Branch</dt><dd>${escape(deps, live?.branch || "noch nicht gelesen")}</dd></div>
          <div><dt>Live HEAD</dt><dd><code>${escape(deps, shortHash(live?.head))}</code></dd></div>
          <div><dt>Working Tree</dt><dd>${escape(deps, clean ? "sauber (Standardfall)" : live?.workingTreeClean === false ? "nicht sauber (sichtbare Ausnahme)" : "UNGEKLÄRT")}</dd></div>
          <div><dt>Snapshot (Akte)</dt><dd>${escape(deps, `${run.canonicalSnapshot?.localBranch || "UNGEKLÄRT"} @ ${shortHash(run.canonicalSnapshot?.localHead)}`)}</dd></div>
        </dl>
        ${detail ? `
          <p><strong>Relative dirty paths</strong></p>
          <ul>${(detail.dirtyPaths || []).map((entry) => `<li><code>${escape(deps, entry)}</code></li>`).join("") || "<li>keine</li>"}</ul>
          <p><strong>Relative untracked paths</strong></p>
          <ul>${(detail.untrackedPaths || []).map((entry) => `<li><code>${escape(deps, entry)}</code></li>`).join("") || "<li>keine</li>"}</ul>
          <p class="guided-work-note">Nur Pfade und Hashes · keine Dateiinhalte · keine Secrets</p>
          <details class="daily-work-run-technical-details">
            <summary>Inhaltshashes anzeigen</summary>
            <ul>${(detail.fileHashes || []).map((entry) => `<li><code>${escape(deps, entry.path)}</code> · ${escape(deps, shortHash(entry.contentHash))}</li>`).join("") || "<li>keine</li>"}</ul>
            <p>Fingerprint: <code>${escape(deps, detail.baselineFingerprint || "UNGEKLÄRT")}</code></p>
          </details>
        ` : `<p class="daily-work-run-empty">Live-Detail noch nicht gelesen.</p>`}
        ${baseline?.jamalConfirmedAt ? `
          <article class="daily-work-run-notice">
            <strong>Baseline bestätigt</strong>
            <p>${escape(deps, baseline.jamalConfirmedAt)} · ${escape(deps, baseline.baselineFingerprint)}</p>
          </article>
        ` : draft && draft.confirmationRequired ? `
          <article class="daily-work-run-notice daily-work-run-notice--warning">
            <strong>Jamal-Bestätigung erforderlich</strong>
            <p>Dirty ohne Bestätigung ist nicht paketfähig. Vorhandene Änderungen dürfen weder verworfen noch überschrieben werden.</p>
            <button class="primary-button" type="button" data-guided-confirm-baseline>Known-dirty-Baseline bestätigen</button>
          </article>
        ` : clean ? `<p class="guided-work-note">Clean bleibt der Standardfall.</p>` : ""}
      </details>
    `;
  }

  function renderDraftFindings(run, deps) {
    const draft = run?.draftFindings;
    if (!draft) return "";
    return `
      <details class="guided-work-block">
        <summary>Evidenz-Prefill · ${escape(deps, draft.label || "aus Evidenz vorausgefüllt")}</summary>
        <p>Prefill ist niemals Bestätigung. QA und PM bleiben unbestätigt, bis Jamal bewusst speichert.</p>
        <dl class="daily-work-run-facts">
          <div><dt>Paket</dt><dd><code>${escape(deps, shortHash(draft.executionPackageId))}</code></dd></div>
          <div><dt>Fingerprint</dt><dd><code>${escape(deps, shortHash(draft.executionPackageFingerprint))}</code></dd></div>
          <div><dt>Fachbefund-Draft</dt><dd>${escape(deps, draft.technicalFindingDraft?.confirmed ? "historisch gesperrt" : "Entwurf")}</dd></div>
          <div><dt>QA-Draft</dt><dd>${escape(deps, draft.qaDraft?.confirmed ? "historisch gesperrt" : "Entwurf")}</dd></div>
          <div><dt>PM-Draft</dt><dd>${escape(deps, draft.pmDraft?.confirmed ? "historisch gesperrt" : "Entwurf")}</dd></div>
          <div><dt>runtimePilot getrennt</dt><dd>${escape(deps, draft.runtimePilotEvidenceSeparated ? "ja" : "nein")}</dd></div>
        </dl>
        <details class="daily-work-run-technical-details">
          <summary>Draft-Texte anzeigen</summary>
          <p><b>Fachbefund</b></p>
          <pre>${escape(deps, draft.technicalFindingDraft?.resultText || "")}</pre>
          <p><b>QA</b></p>
          <pre>${escape(deps, draft.qaDraft?.resultText || "")}</pre>
          <p><b>PM nächster Schritt</b></p>
          <pre>${escape(deps, draft.pmDraft?.recommendedNextStep || "")}</pre>
        </details>
      </details>
    `;
  }

  // ---------------------------------------------------------------------
  // V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor (additiv).
  //
  // Rein präsentational: kein fetch, kein Netzwerkzugriff hier. Klicks setzen
  // ausschließlich data-execution-*-Attribute, die daily-work-run-ui.js
  // auswertet und dort gegen die lokalen Execution-API-Routen ausführt.
  // ---------------------------------------------------------------------

  const EXECUTION_ATTEMPT_TARGETS = Object.freeze([
    { id: "execution-bridge-fixture", label: "Fixture-Testprojekt (technische Selbstprüfung)" },
    { id: "health-upgrade-kompass", label: "Health Upgrade Kompass (nur Baseline · Apply blockiert)" },
  ]);

  const EXECUTION_ATTEMPT_SCENARIOS = Object.freeze([
    { id: "SUCCESS", label: "Erfolg (erlaubte Datei geändert)" },
    { id: "ALLOWLIST_VIOLATION", label: "Allowlist-Verstoß (wird blockiert)" },
    { id: "FAILURE", label: "Fehler (kontrollierter Fehlschlag)" },
    { id: "TIMEOUT", label: "Zeitlimit (kontrollierter Timeout)" },
  ]);

  const MOCK_EXECUTOR_LABEL = "Deterministischer Mock-Executor – technische Sicherheitsprüfung, keine KI-Ausführung.";

  // V7.0 Phase D – rein präsentational. Die tatsächliche Verfügbarkeit/Auth von
  // Codex kommt ausschließlich aus context.executors (serverseitig ermittelt,
  // siehe execution-executor-registry.js). Hier wird nichts installiert,
  // angemeldet oder ausgeführt – nur angezeigt und ausgewählt.
  const EXECUTOR_SELECT_OPTIONS = Object.freeze([
    { id: "mock", fallbackLabel: "Deterministischer Mock – keine KI" },
    { id: "codex", fallbackLabel: "Codex – isolierter echter Code-Executor" },
  ]);

  function isTerminalAttemptStatus(status) {
    return ["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"].includes(status);
  }

  function describeExecutionAttemptState(attempt) {
    if (!attempt) {
      return { headline: "Noch keine isolierte Testausführung", note: "Nichts wurde gestartet." };
    }
    const status = attempt.status;
    const applyStatus = attempt.applyStatus;
    if (status === "PREPARED") {
      return {
        headline: "vorbereitet",
        note: "Baseline gelesen. Noch nicht gestartet. Jamal muss ausdrücklich freigeben.",
        primary: { action: "start", label: "Freigeben und isoliert starten" },
      };
    }
    if (["APPROVED", "QUEUED", "RUNNING"].includes(status)) {
      return {
        headline: "läuft isoliert",
        note: "Läuft ausschließlich in einem isolierten Arbeitsbereich außerhalb aller Repositories.",
        primary: { action: "cancel", label: "Abbrechen" },
      };
    }
    if (status === "SUCCEEDED" && applyStatus === "NOT_REQUESTED") {
      return {
        headline: "prüfpflichtig",
        note: "Isolierter Lauf erfolgreich. Das ist kein Fachbefund und keine Übernahme. Jamal muss prüfen.",
        primary: { action: "apply-review", label: "Geprüfte Änderungen prüfen" },
      };
    }
    if (status === "SUCCEEDED" && applyStatus === "APPLY_REVIEW") {
      return {
        headline: "prüfpflichtig",
        note: "Änderungen noch nicht übernommen. Kein Commit. Kein Push. Kein Deployment.",
        primary: { action: "apply-confirm", label: "Geprüfte Änderungen übernehmen" },
      };
    }
    if (applyStatus === "APPLIED") {
      return {
        headline: "Änderungen übernommen, noch nicht committed",
        note: "Übernahme in das Fixture-Repository. Kein Commit. Kein Push. Kein Deployment.",
        primary: { action: "reset", label: "Neuen Versuch vorbereiten" },
      };
    }
    if (applyStatus === "APPLY_DECLINED") {
      return {
        headline: "Health-Apply blockiert",
        note: "Health-Apply erst nach Phase-C-Abnahme und späterer ausdrücklicher Pilotfreigabe.",
        primary: { action: "reset", label: "Neuen Versuch vorbereiten" },
      };
    }
    if (applyStatus === "STALE") {
      return {
        headline: "Änderungen noch nicht übernommen",
        note: "Zielprojekt hat sich seit der Baseline verändert. Kein Schreiben. Neuer Entscheidungspunkt.",
        primary: { action: "reset", label: "Neuen Versuch vorbereiten" },
      };
    }
    if (status === "BLOCKED") {
      return {
        headline: "blockiert",
        note: "Allowlist-Verstoß erkannt. Keine Datei hat das Zielprojekt erreicht.",
        primary: { action: "reset", label: "Neuen Versuch vorbereiten" },
      };
    }
    if (isTerminalAttemptStatus(status)) {
      return {
        headline: status === "CANCELLED" ? "abgebrochen" : status === "TIMED_OUT" ? "Zeitlimit überschritten" : "fehlgeschlagen",
        note: "Kein Ergebnis wurde übernommen.",
        primary: { action: "reset", label: "Neuen Versuch vorbereiten" },
      };
    }
    return { headline: "freigegeben", note: "Warte auf Start.", primary: { action: "start", label: "Isoliert starten" } };
  }

  function renderExecutionAttempt(run, context, deps) {
    if (!run) return "";
    const attempt = run.executionAttempt || null;
    const state = describeExecutionAttemptState(attempt);
    const recovery = attempt?.recovery?.recovery === true ? attempt.recovery : null;
    const uiState = context.executionUiState || {};

    const executorEntries = (context.executors || []).length
      ? context.executors
      : EXECUTOR_SELECT_OPTIONS.map((entry) => ({ id: entry.id, displayName: entry.fallbackLabel, available: entry.id === "mock", unavailableReason: entry.id === "mock" ? null : "UNGEKLÄRT" }));
    const selectedExecutorId = uiState.selectedExecutorId || "mock";
    const selectedExecutorIsCodex = selectedExecutorId === "codex";

    const idleSelectors = !attempt ? `
      <div class="guided-work-execution-setup">
        <label class="guided-work-field">Executor
          <select data-execution-executor>
            ${executorEntries.map((entry) => `<option value="${escape(deps, entry.id)}" ${(!entry.available && entry.id !== "mock") ? "disabled" : ""} ${selectedExecutorId === entry.id ? "selected" : ""}>${escape(deps, entry.displayName)}${entry.id !== "mock" && !entry.available ? " (nicht verfügbar)" : ""}</option>`).join("")}
          </select>
        </label>
        ${selectedExecutorIsCodex ? `
          <p class="guided-work-note">Codex arbeitet in Phase D ausschließlich am Fixture-Projekt mit einem festen, geprüften Pilotauftrag (eine Fixture-Funktion korrigieren). Health bleibt für Codex vollständig blockiert.</p>
        ` : `
          <label class="guided-work-field">Zielprojekt
            <select data-execution-target>
              ${EXECUTION_ATTEMPT_TARGETS.map((entry) => `<option value="${escape(deps, entry.id)}" ${uiState.selectedTargetId === entry.id ? "selected" : ""}>${escape(deps, entry.label)}</option>`).join("")}
            </select>
          </label>
          <label class="guided-work-field">Mock-Szenario
            <select data-execution-scenario>
              ${EXECUTION_ATTEMPT_SCENARIOS.map((entry) => `<option value="${escape(deps, entry.id)}" ${uiState.selectedScenario === entry.id ? "selected" : ""}>${escape(deps, entry.label)}</option>`).join("")}
            </select>
          </label>
        `}
        <button class="primary-button" type="button" data-execution-action="prepare">Isolierte Testausführung vorbereiten</button>
      </div>
    ` : "";

    const primaryButton = state.primary
      ? `<button class="primary-button" type="button" data-execution-action="${escape(deps, state.primary.action)}" ${uiState.loading ? "disabled" : ""}>${escape(deps, state.primary.label)}</button>`
      : "";

    const codexRawOutputBlock = attempt?.executorId === "codex" && attempt.codexRawOutput ? `
      <details class="daily-work-run-technical-details">
        <summary>Codex-Ausgabe anzeigen (unverifiziert, kein Fachbefund)</summary>
        <p class="guided-work-note"><strong>${escape(deps, attempt.codexRawOutput.label || "Codex-Ausgabe – unverifiziert.")}</strong></p>
        <p>Exitcode: <code>${escape(deps, String(attempt.codexRawOutput.exitCode ?? "UNGEKLÄRT"))}</code></p>
        ${attempt.codexRawOutput.lastMessageSample ? `<p><strong>Letzte Codex-Nachricht (Auszug)</strong></p><pre>${escape(deps, attempt.codexRawOutput.lastMessageSample)}</pre>` : ""}
        <p class="guided-work-note">Dies ist Codex' eigene, unverifizierte Aussage. Maßgeblich ist ausschließlich die Evidenz darunter (Diff und selbst ausgeführte Tests).</p>
      </details>
    ` : "";

    const evidenceBlock = attempt && isTerminalAttemptStatus(attempt.status) ? `
      <details class="daily-work-run-technical-details">
        <summary>Evidenz anzeigen (Diff, Tests, Blocker)</summary>
        <p><strong>Testergebnis</strong>: ${escape(deps, attempt.testStatus || "UNGEKLÄRT")} · ${escape(deps, attempt.testSummary || "")}</p>
        <p><strong>Geänderte Dateien</strong></p>
        <ul>${(attempt.changedFiles || []).map((entry) => `<li><code>${escape(deps, entry)}</code></li>`).join("") || "<li>keine</li>"}</ul>
        ${(attempt.diff || []).length ? `<p><strong>Diff</strong></p><ul>${attempt.diff.map((entry) => `<li><code>${escape(deps, entry.path)}</code> +${escape(deps, String(entry.linesAdded || 0))} −${escape(deps, String(entry.linesRemoved || 0))}</li>`).join("")}</ul>` : ""}
        ${(attempt.blockers || []).length ? `<p><strong>Blocker</strong></p><ul>${attempt.blockers.map((entry) => `<li>${escape(deps, entry)}</li>`).join("")}</ul>` : ""}
        ${(attempt.errors || []).length ? `<p><strong>Fehler</strong></p><ul>${attempt.errors.map((entry) => `<li>${escape(deps, entry)}</li>`).join("")}</ul>` : ""}
        <p class="guided-work-note">Evidenz ist ein technischer Befund des isolierten Laufs, kein bestätigter Fachbefund.</p>
        ${codexRawOutputBlock}
      </details>
    ` : "";

    const preview = attempt?.applyStatus === "APPLY_REVIEW" ? (uiState.applyPreview || attempt.applyPreview || null) : null;
    const applyReviewBlock = preview ? `
      <article class="guided-work-apply-review" data-execution-apply-review="true">
        <h5>Prüfvorschau vor Übernahme</h5>
        <dl class="daily-work-run-facts">
          <div><dt>Paket-ID</dt><dd><code>${escape(deps, preview.executionPackageId || attempt.executionPackageId || "—")}</code></dd></div>
          <div><dt>Fingerprint</dt><dd><code>${escape(deps, preview.executionPackageFingerprint || attempt.executionPackageFingerprint || "—")}</code></dd></div>
          <div><dt>Baseline</dt><dd>${escape(deps, preview.baseline ? `${preview.baseline.branch || "?"} · ${shortHash(preview.baseline.head || "")}` : "—")}</dd></div>
          <div><dt>Attempt</dt><dd><code>${escape(deps, shortHash(preview.attemptId || attempt.attemptId || ""))}</code></dd></div>
          <div><dt>Executor</dt><dd>${escape(deps, preview.executorId === "codex" ? "Codex – isolierter echter Code-Executor" : "Deterministischer Mock – keine KI")}</dd></div>
          <div><dt>Teststatus</dt><dd>${escape(deps, preview.testStatus || attempt.testStatus || "UNGEKLÄRT")} · ${escape(deps, preview.testSummary || attempt.testSummary || "")}</dd></div>
        </dl>
        <p><strong>Geänderte Dateien</strong></p>
        <ul>${(preview.changedFiles || attempt.changedFiles || []).map((entry) => `<li><code>${escape(deps, entry)}</code></li>`).join("") || "<li>keine</li>"}</ul>
        <p><strong>Diff-Zusammenfassung</strong></p>
        <ul>${(preview.diffSummary || []).map((entry) => `<li><code>${escape(deps, entry.path)}</code> +${escape(deps, String(entry.linesAdded || 0))} −${escape(deps, String(entry.linesRemoved || 0))}</li>`).join("") || "<li>keine Diff-Zeilen</li>"}</ul>
        ${(preview.risks || []).length ? `<p><strong>Risiken</strong></p><ul>${preview.risks.map((entry) => `<li>${escape(deps, entry)}</li>`).join("")}</ul>` : ""}
        ${(preview.blockers || []).length ? `<p><strong>Blocker</strong></p><ul>${preview.blockers.map((entry) => `<li>${escape(deps, entry)}</li>`).join("")}</ul>` : ""}
        <p class="guided-work-note"><strong>${escape(deps, preview.note || "Kein Commit. Kein Push. Kein Deployment.")}</strong></p>
      </article>
    ` : "";

    const activeExecutorLabel = attempt?.executorLabel || (attempt?.executorId === "codex" ? "Codex – isolierter echter Code-Executor" : MOCK_EXECUTOR_LABEL);
    // Vor dem ersten Attempt spiegelt die Kopfzeile bereits die aktuelle
    // Browser-Auswahl (sonst stünde dort irreführend "(Mock)", während direkt
    // darunter schon "Codex – isolierter echter Code-Executor" angezeigt wird).
    const executionKindLabel = (attempt ? attempt.executorId : selectedExecutorId) === "codex" ? "Codex" : "Mock";
    // Kein separater Warnhinweis hier: Codex ist in Phase D ohnehin immer nur
    // gegen das Fixture-Projekt wählbar (siehe idleSelectors-Hinweistext
    // direkt unter der Executor-Auswahl). Ein zusätzlicher gelber
    // "Health blockiert"-Kasten allein durch die Codex-Auswahl würde einen
    // aktiven Blocker suggerieren, obwohl gar kein Health-Bezug vorliegt.

    return `
      <details class="guided-work-block guided-work-execution-attempt" open data-execution-attempt-status="${escape(deps, attempt?.status || "NONE")}">
        <summary>Isolierte Testausführung (${escape(deps, executionKindLabel)}) · ${escape(deps, state.headline)}</summary>
        <p class="guided-work-note"><strong>${escape(deps, activeExecutorLabel)}</strong></p>
        ${recovery ? `<article class="daily-work-run-notice daily-work-run-notice--warning"><strong>Recovery-Fall</strong><p>${escape(deps, recovery.reason)} ${escape(deps, recovery.recommendedAction)}</p></article>` : ""}
        ${attempt ? `
          <dl class="daily-work-run-facts">
            <div><dt>Zielprojekt</dt><dd>${escape(deps, attempt.projectId || "UNGEKLÄRT")}</dd></div>
            <div><dt>Attempt</dt><dd><code>${escape(deps, shortHash(attempt.attemptId))}</code></dd></div>
            <div><dt>Status</dt><dd>${escape(deps, attempt.status || "UNGEKLÄRT")}</dd></div>
            <div><dt>Übernahmestatus</dt><dd>${escape(deps, attempt.applyStatus || "NOT_REQUESTED")}</dd></div>
            <div><dt>Erlaubte Dateien</dt><dd>${escape(deps, (attempt.allowedFiles || []).join(", ") || "UNGEKLÄRT")}</dd></div>
          </dl>
        ` : ""}
        <p>${escape(deps, state.note)}</p>
        ${uiState.errorMessage ? `<article class="daily-work-run-notice daily-work-run-notice--warning"><strong>Hinweis</strong><p>${escape(deps, uiState.errorMessage)}</p></article>` : ""}
        <p class="guided-work-note">Apply ist kein Commit. Apply ist kein Push. Apply ist kein Deployment.</p>
        ${applyReviewBlock}
        ${idleSelectors}
        ${primaryButton}
        ${evidenceBlock}
      </details>
    `;
  }

  function renderCompactMeta(run, deps) {
    const pkg = run?.executionPackage;
    return `
      <details class="guided-work-block">
        <summary>Grenzen, Dateien, Tests, Paketstatus</summary>
        <dl class="daily-work-run-facts">
          <div><dt>Grenzen</dt><dd>${escape(deps, (run?.boundary?.prohibitedToday || []).slice(0, 3).join(" · ") || "Standardgrenzen aktiv")}</dd></div>
          <div><dt>Erlaubte Dateien</dt><dd>${escape(deps, (pkg?.allowedFiles || run?.codexPreparation?.allowedFiles || []).slice(0, 4).join(", ") || "noch offen")}</dd></div>
          <div><dt>Tests</dt><dd>${escape(deps, pkg?.testCommand || (run?.codexPreparation?.tests || [])[0] || "noch offen")}</dd></div>
          <div><dt>Paketstatus</dt><dd>${escape(deps, pkg?.status || "kein Paket")}</dd></div>
          <div><dt>schemaVersion</dt><dd>${escape(deps, String(run?.schemaVersion || "UNGEKLÄRT"))}</dd></div>
        </dl>
        <details class="daily-work-run-technical-details">
          <summary>Technische IDs und Fingerprints</summary>
          <p>Paket: <code>${escape(deps, pkg?.executionPackageId || "—")}</code></p>
          <p>Fingerprint: <code>${escape(deps, pkg?.executionPackageFingerprint || "—")}</code></p>
          <p>Run: <code>${escape(deps, run?.id || "—")}</code></p>
        </details>
      </details>
    `;
  }

  function renderMainSurface(run, context = {}) {
    const deps = context.deps;
    if (!deps?.escapeHtml) return "";
    if (!run) {
      const action = GuidedWork?.getPrimaryGuidedAction?.(null) || {
        id: "start-run",
        label: "Tageslauf manuell beginnen",
        phase: "NO_RUN",
      };
      return `
        <section class="guided-work-surface" aria-label="Geführter Hauptarbeitsraum">
          <div class="guided-work-sticky">
          <p class="eyebrow">V7.0 Phase A · Guided Work Foundation · WIP</p>
          <h4>Oben arbeiten. Unten nachschauen.</h4>
          <p>Noch kein Tageslauf. Health Upgrade Kompass bleibt read-only Pilotquelle.</p>
          ${renderServerStatus(context.serverStatus, deps)}
          ${renderPrimaryAction(action, deps)}
          </div>
        </section>
      `;
    }

    const guided = GuidedWork?.ensureGuidedDefaults?.(run) || run;
    const phase = GuidedWork?.deriveGuidedWorkPhase?.(guided) || guided.guidedWorkPhase || "FOCUS";
    const progress = GuidedWork?.summarizeGuidedProgress?.(guided) || { label: "?", phase };
    const action = GuidedWork?.getPrimaryGuidedAction?.(guided, { liveDrift: context.liveDrift }) || null;
    const projectName = guided.canonicalSnapshot?.displayName || guided.focusProjectId || "Kein Fokusprojekt";
    const desired = guided.dailyOutcome?.desiredOutcome || "Noch kein gewünschtes Ergebnis";
    const blocker = guided.decision?.blocker || guided.canonicalSnapshot?.blocker || "Kein zentraler Blocker";
    const live = context.liveStatus?.live;

    return `
      <section class="guided-work-surface" aria-label="Geführter Hauptarbeitsraum">
        <div class="guided-work-sticky">
          <p class="eyebrow">V7.0 Phase A · Guided Work · schemaVersion ${escape(deps, String(guided.schemaVersion))}</p>
          <div class="guided-work-focus-row">
            <div>
              <span class="guided-work-kicker">Fokusprojekt</span>
              <strong>${escape(deps, projectName)}</strong>
            </div>
            <div>
              <span class="guided-work-kicker">Live-Status</span>
              <strong>${escape(deps, live ? `${live.branch || "?"} · ${live.workingTreeClean ? "sauber" : "dirty"}` : "noch nicht gelesen")}</strong>
            </div>
            <div>
              <span class="guided-work-kicker">Fortschritt</span>
              <strong>${escape(deps, progress.label)} · ${escape(deps, phaseLabel(phase))}</strong>
            </div>
          </div>
          <p><b>Gewünschtes Ergebnis:</b> ${escape(deps, desired)}</p>
          <p><b>Nächster Schritt:</b> ${escape(deps, action?.label || "Prüfen")}</p>
          <p><b>Blocker / Entscheidung:</b> ${escape(deps, blocker)}</p>
          ${renderServerStatus(context.serverStatus, deps)}
          ${renderPrimaryAction(action, deps)}
        </div>
        ${renderSuggestions(guided, deps)}
        ${renderTeamEditor(guided, deps)}
        ${renderBaselinePanel(guided, context.liveStatus, deps)}
        ${renderExecutionAttempt(guided, context, deps)}
        ${renderDraftFindings(guided, deps)}
        ${renderCompactMeta(guided, deps)}
      </section>
    `;
  }

  return Object.freeze({
    renderMainSurface,
    renderSuggestions,
    renderTeamEditor,
    renderBaselinePanel,
    renderDraftFindings,
    renderExecutionAttempt,
    describeExecutionAttemptState,
    renderServerStatus,
    serverStatusUiText,
    phaseLabel,
    MOCK_EXECUTOR_LABEL,
    EXECUTION_ATTEMPT_TARGETS,
    EXECUTION_ATTEMPT_SCENARIOS,
  });
});
