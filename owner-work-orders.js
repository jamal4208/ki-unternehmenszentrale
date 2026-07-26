"use strict";
/*
 * V7.2 Phase B Schritt 1 (Auftrag Abschnitt F, PRODUKTKORRIGIERT) –
 * Client-Skript für die Owner-Betriebsübersicht der Arbeitsaufträge
 * (/owner/auftraege, STATIC_OWNER_ONLY). Spricht ausschließlich die
 * /api/owner/work-orders*-Routen an.
 *
 * Der OWNER ist kein fachlicher Prüfer und kein Pflichtschritt: die
 * Zentrale entscheidet Aufträge automatisch (siehe work-order-service.js).
 * Dieses Skript bietet daher AUSSCHLIESSLICH die beiden verbliebenen
 * Ausnahmeaktionen an (Eskalation/Stopp, jeweils mit Pflichtgrund) – keine
 * reguläre Freigabe, keine reguläre Ablehnung, keine reguläre Rückfrage,
 * keine Toolauswahl, keine Agentenzuweisung, keine Veröffentlichung.
 */

(function () {
  var state = {
    selectedWorkOrderId: null,
  };

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readCsrfToken() {
    return readCookie("__Host-kuz_csrf") || readCookie("kuz_dev_csrf") || "";
  }

  function setStatus(message, tone) {
    var el = document.getElementById("owner-status-message");
    el.textContent = message || "";
    el.setAttribute("data-tone", tone || "");
  }

  function fetchJson(url, options) {
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.method && opts.method !== "GET") {
      headers["x-kuz-csrf"] = readCsrfToken();
    }
    return fetch(url, {
      method: opts.method || "GET",
      credentials: "same-origin",
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

  function postAction(url, bodyObj) {
    return fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj || {}),
    });
  }

  function formatDate(isoString) {
    if (!isoString) return "–";
    try {
      return new Date(isoString).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    } catch (_error) {
      return isoString;
    }
  }

  // V7.2 Phase C Schritt 1 (Auftrag Abschnitt M): rein clientseitige
  // Anzeigeübersetzung für den technischen Laufstatus/die Agentenrolle –
  // work-order-execution-service.js liefert bewusst die rohen, stabilen
  // Enum-Werte (Auftrag Abschnitt M: "technischer Laufstatus").
  var RUN_STATUS_LABELS = {
    PREPARED: "Vorbereitet",
    IN_PROGRESS: "Läuft",
    NEEDS_CLARIFICATION: "Rückfrage nötig",
    COMPLETED: "Abgeschlossen",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Abgebrochen",
  };
  var RUN_AGENT_ROLE_LABELS = {
    PROJECT_MANAGER: "Projektleitung",
    SPECIALIST: "Fachagent",
    QUALITY: "Qualitätsprüfung",
  };

  // V7.2 Phase C Schritt 2 (Auftrag Abschnitt N): dieselbe Übersetzungslogik
  // wie RUN_STATUS_LABELS oben – work-order-change-service.js liefert
  // bewusst die rohen, stabilen Enum-Werte.
  var CHANGE_REQUEST_STATUS_LABELS = {
    SUBMITTED: "Eingereicht",
    IN_PROGRESS: "Wird bearbeitet",
    COMPLETED: "Abgeschlossen",
    CANCELLED: "Abgebrochen",
  };

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === "text") {
          node.textContent = props[key];
        } else {
          node.setAttribute(key, props[key]);
        }
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function renderWorkOrderTable(workOrders) {
    var body = document.getElementById("work-order-table-body");
    var emptyHint = document.getElementById("work-order-empty-hint");
    body.innerHTML = "";
    if (!workOrders.length) {
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    workOrders.forEach(function (workOrder) {
      var titleButton = el("button", { type: "button", class: "portal-link", text: workOrder.title }, []);
      titleButton.addEventListener("click", function () {
        showWorkOrderDetail(workOrder.id);
      });
      var titleCell = el("td", {}, [titleButton]);
      var statusBadge = el("span", { class: "portal-badge", "data-status": workOrder.status, text: workOrder.statusLabel }, []);
      var row = el("tr", {}, [
        el("td", { text: workOrder.tenantDisplayName }, []),
        titleCell,
        el("td", { text: workOrder.createdByDisplayName }, []),
        el("td", {}, [statusBadge]),
        el("td", { text: formatDate(workOrder.createdAt) }, []),
      ]);
      body.appendChild(row);
    });
  }

  function loadWorkOrderList() {
    fetchJson("/api/owner/work-orders").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderTable(result.data.workOrders);
        return;
      }
      setStatus("Arbeitsaufträge konnten nicht geladen werden.", "error");
    });
  }

  function renderWorkOrderDetail(workOrder) {
    document.getElementById("work-order-detail-title").textContent = workOrder.title;
    var badge = document.getElementById("work-order-detail-status");
    badge.textContent = workOrder.statusLabel;
    badge.setAttribute("data-status", workOrder.status);
    document.getElementById("work-order-detail-tenant").textContent = workOrder.tenantDisplayName;
    document.getElementById("work-order-detail-creator").textContent = workOrder.createdByDisplayName;
    document.getElementById("work-order-detail-result").textContent = workOrder.desiredResult;
    document.getElementById("work-order-detail-context").textContent = workOrder.context || "Keine Angabe";
    document.getElementById("work-order-detail-deadline").textContent = workOrder.deadlineText || "Keine Angabe";
    document.getElementById("work-order-detail-created").textContent = formatDate(workOrder.createdAt);
    document.getElementById("work-order-detail-note").textContent = workOrder.statusNote || "Noch keine Notiz";

    var form = document.getElementById("work-order-action-form");
    var hint = document.getElementById("work-order-action-hint");
    var escalateButton = document.getElementById("work-order-escalate-button");
    var stopButton = document.getElementById("work-order-stop-button");
    if (workOrder.escalatable || workOrder.stoppable) {
      form.hidden = false;
      hint.hidden = true;
      form.reason.value = "";
      escalateButton.hidden = !workOrder.escalatable;
      stopButton.hidden = !workOrder.stoppable;
    } else {
      form.hidden = true;
      hint.hidden = false;
    }

    // V7.2 Phase C Schritt 1 (Auftrag Abschnitt H/M): der Startbutton ist
    // ausschließlich sichtbar, solange der Auftrag READY_FOR_PROCESSING ist
    // (rein technischer Start, keine fachliche Prüfung durch den Owner).
    document.getElementById("work-order-run-start-block").hidden = workOrder.status !== "READY_FOR_PROCESSING";
    loadWorkOrderRuns(workOrder.id);
    loadWorkOrderChangeRequests(workOrder.id);
    loadWorkOrderResultVersions(workOrder.id);
  }

  // ---------------------------------------------------------------------
  // Änderungswünsche und Ergebnisversionen/Kundenfreigabe (V7.2 Phase C
  // Schritt 2, Auftrag Abschnitt N). Ausschließlich Lesen, keine Aktion –
  // es gibt in diesem Abschnitt bewusst keinen Button/kein Formular.
  // ---------------------------------------------------------------------

  function renderWorkOrderChangeRequests(changeRequests) {
    var list = document.getElementById("work-order-change-requests-list");
    var emptyHint = document.getElementById("work-order-change-requests-empty-hint");
    list.innerHTML = "";
    if (!changeRequests || !changeRequests.length) {
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    changeRequests.forEach(function (changeRequest) {
      var statusLabel = CHANGE_REQUEST_STATUS_LABELS[changeRequest.status] || changeRequest.status;
      var statusBadge = el("span", { class: "portal-badge", "data-status": changeRequest.status, text: statusLabel }, []);
      var item = el("li", {}, [
        el("div", {}, [
          statusBadge,
          el("span", { text: " – gestellt am " + formatDate(changeRequest.createdAt) }, []),
        ]),
        el("div", { class: "portal-hint", text: changeRequest.requestText }, []),
      ]);
      list.appendChild(item);
    });
  }

  function loadWorkOrderChangeRequests(workOrderId) {
    fetchJson("/api/owner/work-orders/" + encodeURIComponent(workOrderId) + "/change-requests").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderChangeRequests(result.data.changeRequests);
        return;
      }
      renderWorkOrderChangeRequests([]);
    });
  }

  function renderWorkOrderResultVersions(versions) {
    var list = document.getElementById("work-order-versions-list");
    var emptyHint = document.getElementById("work-order-versions-empty-hint");
    list.innerHTML = "";
    if (!versions || !versions.length) {
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    versions.forEach(function (version) {
      var approvalText = version.isApproved
        ? "freigegeben am " + formatDate(version.approvedAt) + " von " + (version.approvedByDisplayName || "Unbekannt")
        : "noch nicht freigegeben";
      var item = el("li", {}, [
        el("span", { text: "Version " + version.versionNumber + " (" + formatDate(version.createdAt) + ") – " + approvalText }, []),
      ]);
      list.appendChild(item);
    });
  }

  function loadWorkOrderResultVersions(workOrderId) {
    fetchJson("/api/owner/work-orders/" + encodeURIComponent(workOrderId) + "/result-versions").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderResultVersions(result.data.versions);
        return;
      }
      renderWorkOrderResultVersions([]);
    });
  }

  // ---------------------------------------------------------------------
  // Technischer Laufstatus (V7.2 Phase C Schritt 1, Auftrag Abschnitt M).
  // Rein lesend plus Startaktion – keine fachliche Freigabe, keine
  // Ergebnisbearbeitung.
  // ---------------------------------------------------------------------

  function renderRunAgentList(agents) {
    var list = el("ul", {}, []);
    (agents || []).forEach(function (agent) {
      var roleLabel = RUN_AGENT_ROLE_LABELS[agent.agentRole] || agent.agentRole;
      list.appendChild(
        el(
          "li",
          {},
          [
            el("span", { text: agent.sequenceNumber + ". " + roleLabel + " (" + agent.agentKey + ")" }, []),
            el("br", {}, []),
            el("span", { text: agent.selectionReason }, []),
          ],
        ),
      );
    });
    return list;
  }

  function renderWorkOrderRuns(runs) {
    var list = document.getElementById("work-order-run-list");
    var emptyHint = document.getElementById("work-order-run-empty-hint");
    list.innerHTML = "";
    if (!runs || !runs.length) {
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    runs.forEach(function (run) {
      var statusLabel = RUN_STATUS_LABELS[run.status] || run.status;
      var statusBadge = el("span", { class: "portal-badge", "data-status": run.status, text: statusLabel }, []);
      var qualityText = run.qualityStatus ? run.qualityStatus : "–";
      var summary = el("div", {}, [
        el("span", { text: "Lauf " + run.runNumber + " – " }, []),
        statusBadge,
        el("span", { text: " – Start: " + formatDate(run.startedAt) + " – Ende: " + formatDate(run.completedAt) }, []),
        el("span", { text: " – Fehlercode: " + (run.failureCode || "–") }, []),
        el("span", { text: " – Qualitätsstatus: " + qualityText }, []),
      ]);
      var item = el("li", {}, [summary, renderRunAgentList(run.agents)]);
      list.appendChild(item);
    });
  }

  function loadWorkOrderRuns(workOrderId) {
    fetchJson("/api/owner/work-orders/" + encodeURIComponent(workOrderId) + "/runs").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderRuns(result.data.runs);
        return;
      }
      renderWorkOrderRuns([]);
    });
  }

  function setupRunStartButton() {
    document.getElementById("work-order-run-start-button").addEventListener("click", function () {
      if (!state.selectedWorkOrderId) return;
      setStatus("", "");
      postAction("/api/owner/work-orders/" + encodeURIComponent(state.selectedWorkOrderId) + "/run", {}).then(function (result) {
        if (result.statusCode === 200 && result.data && result.data.ok) {
          setStatus("Technischer Agentenlauf gestartet.", "success");
          showWorkOrderDetail(state.selectedWorkOrderId);
          return;
        }
        setStatus((result.data && result.data.message) || "Lauf konnte nicht gestartet werden.", "error");
      });
    });
  }

  function showWorkOrderDetail(workOrderId) {
    state.selectedWorkOrderId = workOrderId;
    fetchJson("/api/owner/work-orders/" + encodeURIComponent(workOrderId)).then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderDetail(result.data.workOrder);
        document.getElementById("work-order-list-section").hidden = true;
        document.getElementById("work-order-detail-section").hidden = false;
        return;
      }
      setStatus("Arbeitsauftrag konnte nicht geladen werden.", "error");
    });
  }

  function showWorkOrderList() {
    state.selectedWorkOrderId = null;
    document.getElementById("work-order-detail-section").hidden = true;
    document.getElementById("work-order-list-section").hidden = false;
    loadWorkOrderList();
  }

  function setupDetailBack() {
    document.getElementById("work-order-detail-back").addEventListener("click", showWorkOrderList);
  }

  function setupActionForm() {
    var form = document.getElementById("work-order-action-form");
    var buttons = form.querySelectorAll("button[data-action]");
    buttons.forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        if (!state.selectedWorkOrderId) return;
        var action = button.getAttribute("data-action");
        var reason = form.reason.value.trim();
        if (!reason) {
          setStatus("Bitte einen Grund für diese Aktion angeben.", "error");
          return;
        }
        setStatus("", "");
        postAction("/api/owner/work-orders/" + encodeURIComponent(state.selectedWorkOrderId) + "/" + action, {
          reason: reason,
        }).then(function (result) {
          if (result.statusCode === 200 && result.data && result.data.ok) {
            setStatus("Aktion gespeichert.", "success");
            renderWorkOrderDetail(result.data.workOrder);
            return;
          }
          setStatus((result.data && result.data.message) || "Aktion nicht möglich.", "error");
        });
      });
    });
  }

  function setupLogout() {
    var button = document.getElementById("logout-button");
    button.addEventListener("click", function () {
      button.disabled = true;
      fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-kuz-csrf": readCsrfToken() },
      })
        .catch(function () {
          /* Bei Netzwerkfehler dennoch zur Anmeldung weiterleiten. */
        })
        .then(function () {
          window.location.href = "/portal/login";
        });
    });
  }

  function init() {
    setupLogout();
    setupDetailBack();
    setupActionForm();
    setupRunStartButton();
    loadWorkOrderList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
