"use strict";
/*
 * V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
 * der KI-Unternehmenszentrale verankern (Auftrag Abschnitt 11). Client-
 * Skript für die kompakte Health-Referenzlauf-Karte
 * (#health-reference-run-card, STATIC_OWNER_ONLY). Spricht ausschließlich
 * die /api/health-reference/*-Routen an. Gleiches Muster wie
 * jamal-work-mode-ui.js/office-finance-ui.js (eigenständiges, additives
 * Vanilla-Skript, kein Umbau von app.js/daily-work-run-ui.js).
 *
 * Grundsatz (Auftrag Abschnitt 11): "Oben arbeiten. Unten nachschauen."
 * Oben sichtbar bleibt kompakt (Projekt, Ergebniswunsch, Status,
 * Hauptverantwortlicher, nächstes Arbeitspaket, benötigte Jamal-
 * Entscheidung, größter Blocker, Fortschritt als Arbeitspakete, eine klare
 * nächste Handlung). Alles Weitere ist aufklappbar. Keine Schaltfläche
 * führt eine echte Health-Ausführung aus, committet oder pusht.
 */

(function () {
  var state = {
    run: null,
    loading: true,
    error: null,
    actionError: null,
  };

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readCsrfToken() {
    return readCookie("__Host-kuz_csrf") || readCookie("kuz_dev_csrf") || "";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function fetchJson(url, options) {
    var opts = options || {};
    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    if (opts.method && opts.method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["x-kuz-csrf"] = readCsrfToken();
    }
    return fetch(url, {
      method: opts.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: headers,
      body: opts.body,
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { statusCode: response.status, data: data };
        });
    });
  }

  function postAction(action, bodyObj) {
    return fetchJson("/api/health-reference/" + action, {
      method: "POST",
      body: JSON.stringify(bodyObj || {}),
    });
  }

  function loadStatus() {
    state.loading = true;
    render();
    fetchJson("/api/health-reference/status").then(function (response) {
      state.loading = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.run = response.data.run;
        state.error = null;
      } else {
        state.error = "Der Health-Referenzlauf konnte nicht geladen werden.";
      }
      render();
    });
  }

  function runAction(action, bodyObj, refreshAfter) {
    state.actionError = null;
    return postAction(action, bodyObj).then(function (response) {
      if (response.statusCode !== 200 || !response.data || !response.data.ok) {
        state.actionError = (response.data && response.data.message) || "Aktion ist im aktuellen Zustand nicht möglich.";
      }
      if (refreshAfter !== false) loadStatus();
      else render();
    });
  }

  function progressLabel(run) {
    var progress = run.progress || { completed: 0, total: 7 };
    return progress.completed + " von " + progress.total + " Arbeitspaketen abgeschlossen";
  }

  function biggestBlockerText(run) {
    if (run.status === "BLOCKED") return "Der Referenzlauf ist blockiert – Klärung mit Jamal nötig.";
    if (run.status === "CHANGES_REQUESTED") {
      return run.nextWorkPackage
        ? "Für " + run.nextWorkPackage.title + " liegt eine offene Änderungsanforderung vor."
        : "Es liegt eine offene Änderungsanforderung vor.";
    }
    if (run.status === "PREPARED_FOR_EXECUTION") {
      return run.nextWorkPackage
        ? "Für " + run.nextWorkPackage.title + " ist noch kein Arbeitspaket-Prompt vorbereitet."
        : "Noch kein Arbeitspaket-Prompt vorbereitet.";
    }
    if (run.status === "WAITING_FOR_JAMAL_APPROVAL" && run.nextWorkPackage) {
      return "Prompt für " + run.nextWorkPackage.title + " wartet auf Prüfung und Freigabe durch Jamal.";
    }
    if (run.status === "WAITING_FOR_FINAL_ACCEPTANCE") {
      return "Jamals finale Referenzabnahme steht noch aus.";
    }
    return "Kein bekannter Blocker.";
  }

  function renderHead(run) {
    return (
      '<div class="health-reference-run-head">' +
      "<p class=\"eyebrow\">Health Upgrade Kompass \u00b7 Referenzlauf</p>" +
      "<h3>" + escapeHtml(run.title) + "</h3>" +
      "<p>" + escapeHtml(run.outcomeText) + "</p>" +
      "</div>"
    );
  }

  function renderFacts(run) {
    var rows = [
      ["Status", escapeHtml(run.statusLabel)],
      ["Hauptverantwortlicher", escapeHtml(run.team.mainAgent.canonicalName)],
      ["N\u00e4chstes Arbeitspaket", run.nextWorkPackage ? escapeHtml(run.nextWorkPackage.title) : "Keines mehr offen"],
      ["Fortschritt", escapeHtml(progressLabel(run))],
      ["Gr\u00f6\u00dfter Blocker", escapeHtml(biggestBlockerText(run))],
    ];
    return (
      '<dl class="health-reference-run-facts">' +
      rows
        .map(function (row) {
          return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>";
        })
        .join("") +
      "</dl>"
    );
  }

  function renderPrimaryAction(run) {
    var nextAction = run.nextAction || { id: "NONE", label: "Kein weiterer Schritt." };
    var button = "";
    if (nextAction.id === "PREPARE_FIRST_WORK_PACKAGE" && run.nextWorkPackage) {
      button =
        '<button type="button" data-action="prepare-prompt" data-package-key="' +
        escapeHtml(run.nextWorkPackage.packageKey) +
        '">' +
        escapeHtml(nextAction.label) +
        "</button>";
    } else if (nextAction.id === "REVIEW_PROMPT_DRAFT") {
      button =
        '<button type="button" data-action="approve-scope">Scope-Freigabe dokumentieren</button>';
    } else if (nextAction.id === "PREPARE_FINAL_ACCEPTANCE") {
      button = '<button type="button" data-action="prepare-final-acceptance">Finale Abnahme vorbereiten</button>';
    }
    return (
      '<div class="health-reference-run-primary-action">' +
      "<p><strong>N\u00e4chste Handlung:</strong> " + escapeHtml(nextAction.label) + "</p>" +
      button +
      "</div>"
    );
  }

  function renderTeam(run) {
    var specialists = run.team.specialists
      .map(function (agent) {
        return "<li>" + escapeHtml(agent.canonicalName) + " – " + escapeHtml(agent.focus) + "</li>";
      })
      .join("");
    return (
      "<h4>Agentenzuordnung</h4>" +
      "<p><strong>Hauptverantwortlicher:</strong> " + escapeHtml(run.team.mainAgent.canonicalName) + "</p>" +
      "<p><strong>Fachagenten (max. 3):</strong></p><ul>" + specialists + "</ul>" +
      "<p><strong>QA-/Sicherheitsagent:</strong> " + escapeHtml(run.team.qaAgent.canonicalName) + "</p>"
    );
  }

  function renderWorkPackages(run) {
    var items = run.workPackages
      .map(function (pkg) {
        var promptButton =
          pkg.hasPromptDraft
            ? "<span>Prompt-Entwurf vorhanden (Status: " + escapeHtml(pkg.statusLabel) + ")</span>"
            : '<button type="button" data-action="prepare-prompt" data-package-key="' +
              escapeHtml(pkg.packageKey) +
              '">Prompt-Entwurf vorbereiten</button>';
        return (
          "<li><strong>" +
          pkg.sequence +
          ". " +
          escapeHtml(pkg.title) +
          "</strong> – " +
          escapeHtml(pkg.statusLabel) +
          "<br>" +
          promptButton +
          "</li>"
        );
      })
      .join("");
    return "<h4>Sieben Arbeitspakete</h4><ol>" + items + "</ol>";
  }

  function renderApprovals(run) {
    var items = run.approvals
      .map(function (approval) {
        return "<li>" + escapeHtml(approval.label) + ": " + escapeHtml(approval.decision) + "</li>";
      })
      .join("");
    return "<h4>Jamal-Freigaben</h4><ul>" + items + "</ul>";
  }

  function renderNonGoals(run) {
    return "<h4>Nicht-Ziele</h4><ul>" + run.nonGoals.map(function (goal) { return "<li>" + escapeHtml(goal) + "</li>"; }).join("") + "</ul>";
  }

  function renderAcceptanceCriteria(run) {
    return (
      "<h4>Abschlusskriterien</h4><ul>" +
      run.acceptanceCriteria.map(function (criterion) { return "<li>" + escapeHtml(criterion) + "</li>"; }).join("") +
      "</ul>"
    );
  }

  function renderResults(run) {
    if (!run.results || run.results.length === 0) {
      return "<h4>Ergebnis-/QA-Nachweise</h4><p>Noch keine Nachweise erfasst.</p>";
    }
    var items = run.results
      .map(function (result) {
        return "<li>[" + escapeHtml(result.kind) + "] " + escapeHtml(result.summary) + "</li>";
      })
      .join("");
    return "<h4>Ergebnis-/QA-Nachweise</h4><ul>" + items + "</ul>";
  }

  function renderDisclaimer(run) {
    var boundaries = run.autonomyBoundaries || {};
    return (
      '<p class="health-reference-run-disclaimer">' +
      escapeHtml(boundaries.disclaimer || "Kein Nachweis der Produktionsreife.") +
      "</p>"
    );
  }

  function render() {
    var output = document.getElementById("health-reference-run-output");
    if (!output) return;
    if (state.loading && !state.run) {
      output.innerHTML = "<p>Lade Health-Referenzlauf…</p>";
      return;
    }
    if (state.error && !state.run) {
      output.innerHTML = "<p>" + escapeHtml(state.error) + "</p>";
      return;
    }
    var run = state.run;
    var html = renderHead(run) + renderFacts(run) + renderPrimaryAction(run);
    if (state.actionError) {
      html += '<p class="health-reference-run-action-error">' + escapeHtml(state.actionError) + "</p>";
    }
    html += renderDisclaimer(run);
    output.innerHTML = html;

    var diagnostics = document.getElementById("health-reference-run-diagnostics-output");
    if (diagnostics) {
      diagnostics.innerHTML =
        renderTeam(run) +
        renderWorkPackages(run) +
        renderApprovals(run) +
        renderNonGoals(run) +
        renderAcceptanceCriteria(run) +
        renderResults(run);
    }

    bindActionHandlers();
  }

  function bindActionHandlers() {
    var root = document.getElementById("health-reference-run-card");
    if (!root) return;
    root.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function onClick() {
        var action = button.getAttribute("data-action");
        if (action === "prepare-prompt") {
          runAction("prepare-work-package-prompt", { workPackageKey: button.getAttribute("data-package-key") });
        } else if (action === "approve-scope") {
          runAction("record-approval", { approvalKey: "SCOPE", decision: "APPROVED", note: "Von Jamal im Cockpit dokumentiert." });
        } else if (action === "prepare-final-acceptance") {
          state.actionError = "Die finale Abnahme erfordert eine ausdr\u00fcckliche Best\u00e4tigung durch Jamal au\u00dferhalb dieser Schaltfl\u00e4che.";
          render();
        }
      });
    });
  }

  function ensureRunThenLoad() {
    postAction("ensure-run", {}).then(loadStatus);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRunThenLoad);
  } else {
    ensureRunThenLoad();
  }
})();
