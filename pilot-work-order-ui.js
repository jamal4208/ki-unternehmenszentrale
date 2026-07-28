"use strict";
/*
 * KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
 * Client-Skript für die kompakte Pilotauftrags-Karte
 * (#pilot-work-order-card, STATIC_OWNER_ONLY). Spricht ausschließlich die
 * /api/pilot-work-order/*-Routen an. Gleiches Muster wie
 * health-reference-work-run-ui.js (eigenständiges, additives Vanilla-
 * Skript, kein Umbau von app.js/daily-work-run-ui.js).
 *
 * Grundsatz: "Oben arbeiten. Unten nachschauen." Oben sichtbar bleibt
 * kompakt (Auftrag, beteiligte Agenten, Status, bisherige Ergebnisse,
 * offene Entscheidung, Risiken/Grenzen, nächster Schritt). Alles Weitere
 * ist aufklappbar. Keine Schaltfläche löst eine echte externe Aktion,
 * einen Commit, einen Push oder ein Deployment aus. Die beiden
 * Freigabegrenzen (Ausführung/Abschluss) sind bewusst NICHT als
 * Ein-Klick-Aktion mit `confirmed: true` verdrahtet – Jamal bestätigt
 * ausdrücklich außerhalb dieser Schaltfläche.
 */

(function () {
  var state = {
    overview: null,
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
    return fetchJson("/api/pilot-work-order/" + action, { method: "POST", body: JSON.stringify(bodyObj || {}) });
  }

  function loadOverview() {
    state.loading = true;
    render();
    fetchJson("/api/pilot-work-order/status").then(function (response) {
      state.loading = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.overview = response.data.overview;
        state.error = null;
      } else {
        state.error = "Der Pilotauftrag konnte nicht geladen werden.";
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
      if (refreshAfter !== false) loadOverview();
      else render();
    });
  }

  function renderHead(overview) {
    return (
      '<div class="pilot-work-order-head">' +
      '<p class="eyebrow">Pilotbetrieb \u00b7 Drei-Agenten-Auftrag</p>' +
      "<h3>" + escapeHtml(overview.order.title) + "</h3>" +
      "<p>" + escapeHtml(overview.order.desiredOutcome) + "</p>" +
      "</div>"
    );
  }

  function renderFacts(overview) {
    var progress = overview.progress || { rolesPassed: 0, rolesTotal: 3 };
    var rows = [
      ["Auftraggeber", escapeHtml(overview.order.requestedBy)],
      ["Status", escapeHtml(overview.statusLabel)],
      ["Beteiligte Agenten", overview.involvedAgents.map(function (a) { return escapeHtml(a.pilotRoleLabel); }).join(", ")],
      ["Fortschritt", progress.rolesPassed + " von " + progress.rolesTotal + " Pilotrollen mit angenommenem Ergebnis"],
      ["Offene Entscheidung", overview.openDecision ? escapeHtml(overview.openDecision) : "Keine"],
    ];
    return (
      '<dl class="pilot-work-order-facts">' +
      rows.map(function (row) { return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>"; }).join("") +
      "</dl>"
    );
  }

  function renderRisks(overview) {
    if (!overview.risksAndLimits || overview.risksAndLimits.length === 0) {
      return "<p><strong>Risiken/Grenzen:</strong> noch keine benannt.</p>";
    }
    return (
      "<p><strong>Risiken/Grenzen:</strong></p><ul>" +
      overview.risksAndLimits.map(function (risk) { return "<li>" + escapeHtml(risk) + "</li>"; }).join("") +
      "</ul>"
    );
  }

  function renderPrimaryAction(overview) {
    var status = overview.status;
    var button = "";
    if (status === "DRAFT") {
      button = '<button type="button" data-action="mark-ready-for-approval">Zur Jamal-Freigabe vorlegen</button>';
    } else if (status === "READY_FOR_JAMAL_APPROVAL") {
      button = '<button type="button" data-action="approve-for-execution">Ausführung freigeben</button>';
    } else if (status === "APPROVED_FOR_EXECUTION") {
      button = '<button type="button" data-action="start-execution">Ausführung starten</button>';
    } else if (status === "IN_EXECUTION") {
      button = '<button type="button" data-action="submit-for-review">Zur Abschlussprüfung vorlegen</button>';
    } else if (status === "READY_FOR_REVIEW") {
      button = '<button type="button" data-action="approve-completion">Ergebnis abnehmen</button>';
    } else if (status === "RETURNED") {
      button = '<button type="button" data-action="reopen-from-returned">Erneut als Entwurf starten</button>';
    } else if (status === "BLOCKED") {
      button = '<button type="button" data-action="unblock-order">Entsperren (zurückgeben)</button>';
    }
    return (
      '<div class="pilot-work-order-primary-action">' +
      "<p><strong>N\u00e4chster Schritt:</strong> " + escapeHtml(overview.nextStep) + "</p>" +
      button +
      "</div>"
    );
  }

  function renderTeam(overview) {
    var items = overview.involvedAgents
      .map(function (agent) {
        var mismatch = agent.isExactRoleMatch === false ? " (Pilotentscheidung – kein exakt benannter Agent, siehe Hinweis)" : "";
        return "<li><strong>" + escapeHtml(agent.pilotRoleLabel) + "</strong> = " + escapeHtml(agent.canonicalName) + mismatch +
          "<br>" + escapeHtml(agent.focus) + (agent.mappingNote ? "<br><em>" + escapeHtml(agent.mappingNote) + "</em>" : "") + "</li>";
      })
      .join("");
    return "<h4>Agentenzuordnung</h4><ul>" + items + "</ul>";
  }

  function renderOrderDetails(overview) {
    function list(title, values) {
      return "<h4>" + title + "</h4><ul>" + values.map(function (v) { return "<li>" + escapeHtml(v) + "</li>"; }).join("") + "</ul>";
    }
    return (
      list("Qualit\u00e4tskriterien", overview.order.qualityCriteria) +
      list("Erlaubte Werkzeuge", overview.order.allowedTools) +
      list("Verbotene Aktionen", overview.order.forbiddenActions) +
      list("Ben\u00f6tigte Freigaben", overview.order.requiredApprovals) +
      "<h4>Zeitrahmen</h4><p>" + escapeHtml(overview.order.timeframe) + "</p>"
    );
  }

  function renderHandoffs(overview) {
    if (!overview.handoffs || overview.handoffs.length === 0) {
      return "<h4>Rollen\u00fcbergaben</h4><p>Noch keine Rollen\u00fcbergabe eingereicht.</p>";
    }
    var items = overview.handoffs
      .map(function (handoff) {
        return (
          "<li><strong>" + handoff.sequence + ". an " + escapeHtml(handoff.toPilotRoleLabel) + "</strong> \u2013 Filter: " +
          escapeHtml(handoff.pmFilterStatus) +
          "<br>Kurzbefund: " + escapeHtml(handoff.shortFinding) +
          "<br>Ergebnis/Empfehlung: " + escapeHtml(handoff.resultOrRecommendation) +
          "<br>Grundlage: " + escapeHtml(handoff.basisUsed) +
          "<br>Risiko/Grenze: " + escapeHtml(handoff.riskOrLimit) +
          "<br>N\u00e4chster Schritt: " + escapeHtml(handoff.nextStep) +
          (handoff.decisionNeeded ? "<br>Ben\u00f6tigte Entscheidung: " + escapeHtml(handoff.decisionNeeded) : "") +
          (handoff.pmFilterReasons && handoff.pmFilterReasons.length > 0
            ? "<br>Filterhinweis: " + escapeHtml(handoff.pmFilterReasons.join("; "))
            : "") +
          "</li>"
        );
      })
      .join("");
    return "<h4>Rollen\u00fcbergaben (bisherige Ergebnisse)</h4><ol>" + items + "</ol>";
  }

  function renderDisclaimer(overview) {
    var boundaries = overview.autonomyBoundaries || {};
    return '<p class="pilot-work-order-disclaimer">' + escapeHtml(boundaries.disclaimer || "") + "</p>";
  }

  function render() {
    var output = document.getElementById("pilot-work-order-output");
    if (!output) return;
    if (state.loading && !state.overview) {
      output.innerHTML = "<p>Lade Pilotauftrag\u2026</p>";
      return;
    }
    if (state.error && !state.overview) {
      output.innerHTML = "<p>" + escapeHtml(state.error) + "</p>";
      return;
    }
    var overview = state.overview;
    var html = renderHead(overview) + renderFacts(overview) + renderRisks(overview) + renderPrimaryAction(overview);
    if (state.actionError) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.actionError) + "</p>";
    }
    html += renderDisclaimer(overview);
    output.innerHTML = html;

    var diagnostics = document.getElementById("pilot-work-order-diagnostics-output");
    if (diagnostics) {
      diagnostics.innerHTML = renderTeam(overview) + renderOrderDetails(overview) + renderHandoffs(overview);
    }

    bindActionHandlers();
  }

  function bindActionHandlers() {
    var root = document.getElementById("pilot-work-order-card");
    if (!root) return;
    root.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function onClick() {
        var action = button.getAttribute("data-action");
        if (action === "approve-for-execution" || action === "approve-completion") {
          state.actionError =
            "Diese Freigabe erfordert eine ausdr\u00fcckliche Best\u00e4tigung durch Jamal au\u00dferhalb dieser Schaltfl\u00e4che " +
            "(keine automatische Freigabe durch einen Agenten).";
          render();
          return;
        }
        if (action === "mark-ready-for-approval") runAction("mark-ready-for-approval", {});
        else if (action === "start-execution") runAction("start-execution", {});
        else if (action === "submit-for-review") runAction("submit-for-review", {});
        else if (action === "reopen-from-returned") runAction("reopen-from-returned", {});
        else if (action === "unblock-order") runAction("unblock-order", {});
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadOverview);
  } else {
    loadOverview();
  }
})();
