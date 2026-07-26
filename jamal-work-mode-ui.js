"use strict";
/*
 * V7.3 – Jamal-Arbeitsmodus (Auftrag Abschnitt C/D/F/G/H/I/K): Client-Skript
 * für die einzige zentrale Arbeitskarte "Heute arbeiten" (#jamal-work-card,
 * STATIC_OWNER_ONLY). Spricht ausschließlich die /api/jamal-work-mode/*-
 * Routen an. Gleiches Muster wie owner-work-orders.js (eigenständiges,
 * additives Vanilla-Skript, kein Umbau von app.js/daily-work-run-ui.js).
 *
 * Leitprinzipien (Auftrag): eine klare Hauptaktion pro Zustand, kein
 * technischer Jargon im Hauptfluss (technische Details liegen ausschließlich
 * in #jamal-work-diagnostics-output), keine Rohstatuscodes/technischen IDs
 * im Hauptfluss, kein LocalStorage für diese Arbeitsdaten, kein Tracking,
 * keine externe Ressource.
 */

(function () {
  var state = {
    data: null,
    loading: true,
    error: null,
    mode: "VIEW", // VIEW | EDIT_OUTCOME | PROJECT_PICKER | CHANGE_FORM
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
    return fetchJson("/api/jamal-work-mode/" + action, {
      method: "POST",
      body: JSON.stringify(bodyObj || {}),
    });
  }

  // -------------------------------------------------------------------
  // Auftrag Abschnitt G: verständliche deutsche Statuswerte im Hauptfluss.
  // Die Textbeschriftung kommt bereits vom Server (statusLabel); der
  // "Ton" (Farbakzent) wird hier rein clientseitig, additiv zugeordnet
  // (Auftrag Abschnitt K: "keine reine Farbcodierung" – der Text bleibt
  // in jedem Fall die primäre Information).
  // -------------------------------------------------------------------
  var STATUS_TONE = {
    NOT_STARTED: "neutral",
    READY: "neutral",
    IN_PROGRESS: "progress",
    CLARIFICATION_NEEDED: "attention",
    RESULT_READY: "done",
    CHANGE_IN_PROGRESS: "progress",
    DONE: "done",
    STOPPED: "neutral",
    ESCALATION_NEEDED: "blocked",
  };

  var QUALITY_LABELS = {
    PASSED: "Ohne Einschränkung geprüft",
    PASSED_WITH_NOTES: "Geprüft, mit Hinweisen",
  };

  function statusTone(status) {
    return STATUS_TONE[status] || "neutral";
  }

  function qualityLabel(qualityStatus) {
    return QUALITY_LABELS[qualityStatus] || "Ungeprüft";
  }

  function byId(id) {
    return document.getElementById(id);
  }

  // -------------------------------------------------------------------
  // Rendering. Ein Aufruf pro Zustand, kein Teil-Update – bei dieser
  // Kartengröße ist ein vollständiges Neurendern klar genug (gleiches
  // Prinzip wie daily-work-run-ui.js#render).
  // -------------------------------------------------------------------

  function renderLoading() {
    var output = byId("jamal-work-output");
    if (output) output.innerHTML = "<p>Lade deinen Arbeitsmodus…</p>";
  }

  function renderError(message) {
    var output = byId("jamal-work-output");
    if (output) {
      output.innerHTML =
        '<p class="jamal-work-error" role="alert">' +
        escapeHtml(message || "Der Arbeitsmodus konnte nicht geladen werden.") +
        "</p>" +
        '<button type="button" class="secondary-button" data-action="reload">Erneut versuchen</button>';
    }
  }

  function renderProjectLine(view) {
    var item = view.currentItem;
    var projectName = item && item.projectDisplayName ? item.projectDisplayName : null;
    if (projectName) {
      return (
        '<p class="jamal-work-project">Projekt: <strong>' +
        escapeHtml(projectName) +
        "</strong> " +
        '<button type="button" class="link-button" data-action="open-project-picker">Projekt wechseln</button></p>'
      );
    }
    return (
      '<p class="jamal-work-project">Noch kein Projekt gewählt. ' +
      '<button type="button" class="link-button" data-action="open-project-picker">Projekt wählen</button></p>'
    );
  }

  function renderProjectPicker(view) {
    var candidates = view.compactProjectCandidates || [];
    if (!candidates.length) {
      return '<p class="jamal-work-project">Keine weiteren Projekte verfügbar.</p>';
    }
    var buttons = candidates
      .map(function (project) {
        return (
          '<button type="button" class="secondary-button" data-action="choose-project" data-project-id="' +
          escapeHtml(project.id) +
          '" data-project-name="' +
          escapeHtml(project.displayName) +
          '">' +
          escapeHtml(project.displayName) +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="jamal-work-project-picker" role="group" aria-label="Projekt wählen">' +
      buttons +
      '<button type="button" class="link-button" data-action="close-project-picker">Abbrechen</button>' +
      "</div>"
    );
  }

  function renderOutcomeForm(view, existingItem) {
    var outcomeValue = existingItem ? existingItem.desiredOutcome : "";
    var notesValue = existingItem ? existingItem.notes : "";
    var timingValue = existingItem ? existingItem.preferredTiming : "";
    var primaryLabel = existingItem ? "Ergebniswunsch aktualisieren" : "Ergebniswunsch festlegen";
    return (
      '<form class="jamal-work-form" data-form="outcome">' +
      '<label for="jamal-work-outcome-input">Welches Ergebnis möchtest du erreichen?</label>' +
      '<textarea id="jamal-work-outcome-input" name="desiredOutcome" rows="3" required>' +
      escapeHtml(outcomeValue) +
      "</textarea>" +
      '<label for="jamal-work-notes-input">Wichtige Hinweise (optional)</label>' +
      '<textarea id="jamal-work-notes-input" name="notes" rows="2">' +
      escapeHtml(notesValue) +
      "</textarea>" +
      '<label for="jamal-work-timing-input">Gewünschter Zeitpunkt (optional)</label>' +
      '<input id="jamal-work-timing-input" name="preferredTiming" type="text" value="' +
      escapeHtml(timingValue) +
      '" />' +
      '<div class="jamal-work-primary-row">' +
      '<button type="submit" class="primary-button" data-primary-action="set-desired-outcome">' +
      escapeHtml(primaryLabel) +
      "</button>" +
      "</div>" +
      "</form>"
    );
  }

  function renderClarification(item) {
    var question = item.clarifyingQuestion;
    return (
      '<div class="jamal-work-question">' +
      "<p><strong>Rückfrage:</strong> " +
      escapeHtml(question.question) +
      "</p>" +
      (question.reason ? "<p>" + escapeHtml(question.reason) + "</p>" : "") +
      '<form data-form="clarification">' +
      '<label for="jamal-work-answer-input">Deine Antwort</label>' +
      '<textarea id="jamal-work-answer-input" name="answer" rows="2" required></textarea>' +
      '<div class="jamal-work-primary-row">' +
      '<button type="submit" class="primary-button" data-primary-action="answer-clarification">Rückfrage beantworten</button>' +
      "</div>" +
      "</form>" +
      "</div>"
    );
  }

  function renderEscalation(item) {
    var escalation = item.escalation || {};
    return (
      '<div class="jamal-work-question">' +
      "<p><strong>An Jamal eskaliert.</strong> " +
      escapeHtml(escalation.reasonMessage || "Dieser Auftrag braucht eine bewusste Einzelfallprüfung.") +
      "</p>" +
      "</div>"
    );
  }

  function renderAgents(agentsInvolved) {
    if (!agentsInvolved || !agentsInvolved.length) return "";
    var pills = agentsInvolved
      .map(function (agent) {
        return (
          '<span class="jamal-work-agent-pill" title="' +
          escapeHtml(agent.reason || "") +
          '">' +
          escapeHtml(agent.roleLabel || "Beteiligt") +
          ": " +
          escapeHtml(agent.canonicalName) +
          "</span>"
        );
      })
      .join("");
    return '<div class="jamal-work-agents">' + pills + "</div>";
  }

  function renderResult(item, view) {
    var versions = item.versions || [];
    var latest = versions[versions.length - 1];
    if (!latest) return "";
    var openPoints = (latest.openPoints || [])
      .map(function (point) {
        return "<li>" + escapeHtml(point) + "</li>";
      })
      .join("");
    var changeForm =
      view.mode === "CHANGE_FORM"
        ? '<form data-form="change" class="jamal-work-form">' +
          '<label for="jamal-work-change-input">Was soll geändert werden?</label>' +
          '<textarea id="jamal-work-change-input" name="changeText" rows="2" required></textarea>' +
          '<div class="jamal-work-primary-row">' +
          '<button type="submit" class="secondary-button" data-primary-action="request-change">Änderung senden</button>' +
          '<button type="button" class="link-button" data-action="close-change-form">Abbrechen</button>' +
          "</div>" +
          "</form>"
        : "";
    return (
      '<div class="jamal-work-result">' +
      "<h3>" +
      escapeHtml(latest.title) +
      "</h3>" +
      "<p>" +
      escapeHtml(latest.summary) +
      "</p>" +
      '<div class="jamal-work-result-body">' +
      escapeHtml(latest.body) +
      "</div>" +
      '<p><span class="jamal-work-status" data-tone="' +
      (latest.qualityStatus === "PASSED" ? "done" : "attention") +
      '">' +
      escapeHtml(qualityLabel(latest.qualityStatus)) +
      "</span></p>" +
      (openPoints ? '<ul class="jamal-work-open-points">' + openPoints + "</ul>" : "") +
      renderAgents(latest.agentsInvolved) +
      (item.status === "RESULT_READY" && versions.length > 1
        ? '<p class="jamal-work-project">Version ' + versions.length + " von " + versions.length + " – frühere Versionen bleiben unverändert erhalten.</p>"
        : "") +
      changeForm +
      "</div>"
    );
  }

  function renderPrimaryAndSecondary(view) {
    var item = view.currentItem;
    var status = item ? item.status : null;
    var rows = "";

    if (status === "RESULT_READY") {
      rows +=
        '<div class="jamal-work-primary-row">' +
        '<button type="button" class="primary-button" data-action="mark-done">Passt</button>' +
        (view.mode !== "CHANGE_FORM"
          ? '<button type="button" class="secondary-button" data-action="open-change-form">Änderung anfordern</button>'
          : "") +
        "</div>";
    } else if (status === "IN_PROGRESS" || status === "CHANGE_IN_PROGRESS") {
      rows +=
        '<div class="jamal-work-primary-row">' +
        '<button type="button" class="primary-button" disabled aria-disabled="true">' +
        escapeHtml(view.primaryAction.label) +
        "</button></div>";
    } else if (status === "ESCALATION_NEEDED") {
      rows +=
        '<div class="jamal-work-primary-row">' +
        '<button type="button" class="primary-button" disabled aria-disabled="true">An Jamal eskaliert</button>' +
        "</div>";
    } else if (status === "READY") {
      rows +=
        '<div class="jamal-work-primary-row">' +
        '<button type="button" class="primary-button" data-action="start-run">Arbeitslauf starten</button>' +
        "</div>";
    } else if (status === "DONE" || status === "STOPPED") {
      rows +=
        '<div class="jamal-work-primary-row">' +
        '<button type="button" class="primary-button" data-action="start-new-item">Neuen Ergebniswunsch festlegen</button>' +
        "</div>";
    }

    var secondary = ['<button type="button" class="secondary-button" data-action="reload">Details</button>'];
    if (item && status !== "DONE" && status !== "STOPPED") {
      secondary.push('<button type="button" class="secondary-button" data-action="mark-later">Später</button>');
      secondary.push('<button type="button" class="secondary-button" data-action="stop">Stoppen</button>');
    }
    rows += '<div class="jamal-work-secondary-row">' + secondary.join("") + "</div>";
    return rows;
  }

  function renderMain(view) {
    var item = view.currentItem;

    if (!item || item.status === "NOT_STARTED") {
      return (
        '<p class="jamal-work-next-step">Beschreibe, welches Ergebnis du heute erreichen möchtest. Alles andere übernimmt die Zentrale.</p>' +
        renderProjectLine(view) +
        (view.mode === "PROJECT_PICKER" ? renderProjectPicker(view) : "") +
        renderOutcomeForm(view, item)
      );
    }

    var pieces = [];
    pieces.push(
      '<div class="jamal-work-status-row"><span class="jamal-work-status" data-tone="' +
        statusTone(item.status) +
        '">' +
        escapeHtml(view.statusLabel) +
        "</span></div>",
    );
    pieces.push(renderProjectLine(view));
    if (view.mode === "PROJECT_PICKER") pieces.push(renderProjectPicker(view));

    if (item.status === "READY") {
      pieces.push(renderOutcomeForm(view, item));
    } else if (item.status === "CLARIFICATION_NEEDED") {
      pieces.push('<p class="jamal-work-next-step">Ergebniswunsch: ' + escapeHtml(item.desiredOutcome) + "</p>");
      pieces.push(renderClarification(item));
    } else if (item.status === "ESCALATION_NEEDED") {
      pieces.push('<p class="jamal-work-next-step">Ergebniswunsch: ' + escapeHtml(item.desiredOutcome) + "</p>");
      pieces.push(renderEscalation(item));
    } else if (item.status === "IN_PROGRESS" || item.status === "CHANGE_IN_PROGRESS") {
      pieces.push('<p class="jamal-work-next-step">Der Arbeitslauf läuft. Dies dauert normalerweise nur einen Moment.</p>');
    } else if (
      item.status === "RESULT_READY" ||
      item.status === "DONE" ||
      item.status === "STOPPED"
    ) {
      pieces.push(renderResult(item, view));
    }

    pieces.push(renderPrimaryAndSecondary(view));
    return pieces.join("");
  }

  function renderDiagnostics(view) {
    var output = byId("jamal-work-diagnostics-output");
    if (!output) return;
    var item = view.currentItem;
    if (!item) {
      output.textContent = "Keine technischen Details verfügbar.";
      return;
    }
    var lines = ["Interner Status: " + item.status, "Projektquelle: " + (item.projectSource || "UNGEKLÄRT")];
    if (item.plan) {
      lines.push("Arbeitsschritte: " + item.plan.steps.length);
      lines.push(
        "Agenten: " +
          [item.plan.agents.projectManager, ...item.plan.agents.specialists, item.plan.agents.quality]
            .map(function (agent) {
              return agent.canonicalName;
            })
            .join(", "),
      );
    }
    lines.push("Ergebnisversionen: " + (item.versions || []).length);
    output.innerHTML = lines.map(function (line) {
      return "<div>" + escapeHtml(line) + "</div>";
    }).join("");
  }

  function render() {
    if (state.loading) {
      renderLoading();
      return;
    }
    if (state.error) {
      renderError(state.error);
      return;
    }
    var output = byId("jamal-work-output");
    if (output) output.innerHTML = renderMain(state.data);
    renderDiagnostics(state.data);
  }

  // -------------------------------------------------------------------
  // Zustand laden/aktualisieren.
  // -------------------------------------------------------------------

  function applyView(view) {
    state.data = view;
    state.error = null;
    state.loading = false;
    state.mode = "VIEW";
    render();
  }

  function loadState() {
    state.loading = true;
    render();
    fetchJson("/api/jamal-work-mode/state", { method: "GET" })
      .then(function (result) {
        if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
          state.loading = false;
          state.error = (result.data && result.data.message) || "Der Arbeitsmodus konnte nicht geladen werden.";
          render();
          return;
        }
        applyView(result.data);
      })
      .catch(function () {
        state.loading = false;
        state.error = "Der Arbeitsmodus konnte nicht geladen werden.";
        render();
      });
  }

  function runAction(action, body) {
    return postAction(action, body).then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        throw new Error((result.data && result.data.message) || "Aktion ist im aktuellen Zustand nicht möglich.");
      }
      applyView(result.data);
      return result.data;
    });
  }

  function runActionWithFallback(action, body) {
    return runAction(action, body).catch(function (error) {
      state.error = error.message;
      render();
    });
  }

  // -------------------------------------------------------------------
  // Ereignisbindung (Auftrag Abschnitt K: sichtbare Fokuszustände über die
  // bestehenden globalen button:focus-visible-Regeln in styles.css – kein
  // eigener Fokus-Reset hier nötig).
  // -------------------------------------------------------------------

  function handleOutcomeSubmit(formElement) {
    var desiredOutcome = formElement.querySelector('[name="desiredOutcome"]').value;
    var notes = formElement.querySelector('[name="notes"]').value;
    var preferredTiming = formElement.querySelector('[name="preferredTiming"]').value;
    var body = { desiredOutcome: desiredOutcome, notes: notes, preferredTiming: preferredTiming };
    var hasItem = state.data && state.data.currentItem;
    var chain = hasItem ? Promise.resolve() : runAction("start-new-item", {});
    chain
      .then(function () {
        return runAction("set-desired-outcome", body);
      })
      .catch(function (error) {
        state.error = error.message;
        render();
      });
  }

  function bindEvents() {
    var card = byId("jamal-work-card");
    if (!card) return;

    card.addEventListener("click", function (event) {
      var target = event.target.closest("[data-action]");
      if (!target) return;
      var action = target.getAttribute("data-action");
      if (action === "reload") {
        loadState();
      } else if (action === "open-project-picker") {
        state.mode = "PROJECT_PICKER";
        render();
      } else if (action === "close-project-picker") {
        state.mode = "VIEW";
        render();
      } else if (action === "choose-project") {
        runActionWithFallback("choose-project", {
          projectId: target.getAttribute("data-project-id"),
          displayName: target.getAttribute("data-project-name"),
        });
      } else if (action === "start-run") {
        runActionWithFallback("start-run", {});
      } else if (action === "mark-done") {
        runActionWithFallback("mark-done", {});
      } else if (action === "mark-later") {
        runActionWithFallback("mark-later", {});
      } else if (action === "stop") {
        runActionWithFallback("stop", { reason: "Von Jamal gestoppt." });
      } else if (action === "start-new-item") {
        runActionWithFallback("start-new-item", {});
      } else if (action === "open-change-form") {
        state.mode = "CHANGE_FORM";
        render();
      } else if (action === "close-change-form") {
        state.mode = "VIEW";
        render();
      }
    });

    card.addEventListener("submit", function (event) {
      var form = event.target.closest("form[data-form]");
      if (!form) return;
      event.preventDefault();
      var formType = form.getAttribute("data-form");
      if (formType === "outcome") {
        handleOutcomeSubmit(form);
      } else if (formType === "clarification") {
        var answer = form.querySelector('[name="answer"]').value;
        runActionWithFallback("answer-clarification", { answer: answer });
      } else if (formType === "change") {
        var changeText = form.querySelector('[name="changeText"]').value;
        runActionWithFallback("request-change", { changeText: changeText });
      }
    });
  }

  function init() {
    if (!byId("jamal-work-card")) return;
    bindEvents();
    loadState();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  // Für jamal-work-mode-ui.test.js (reine Quelltextprüfung, kein Browser).
  if (typeof module === "object" && module.exports) {
    module.exports = { escapeHtml: escapeHtml, statusTone: statusTone, qualityLabel: qualityLabel };
  }
})();
