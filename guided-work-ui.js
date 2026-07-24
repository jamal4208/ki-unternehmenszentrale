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
    renderServerStatus,
    serverStatusUiText,
    phaseLabel,
  });
});
