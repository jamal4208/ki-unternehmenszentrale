"use strict";
/*
 * V7.2 Phase A Schritt 3 (Auftrag Abschnitt D) – Client-Skript für die
 * authentifizierte Kundenportal-Startseite (/portal, STATIC_AUTHENTICATED_
 * PORTAL). Liest /api/portal/me und /api/portal/status; bietet seit V7.2
 * Phase B Schritt 1 (Auftrag Abschnitt D) zusätzlich die erste echte
 * Kundenfachfunktion an: eigene Arbeitsaufträge auflisten, ansehen, bei
 * offener Rückfrage ergänzt erneut absenden und selbst stornieren.
 * Weiterhin keine Toolauswahl, keine Veröffentlichung, kein Billing, keine
 * Agentensteuerung.
 *
 * Produktkorrektur (Selbstbedienungs-Fluss): der Status wird automatisch
 * von der Zentrale entschieden (statusLabel/customerMessage kommen fertig
 * vom Server, siehe work-order-service.js) – dieses Skript erfindet keine
 * eigenen Statustexte und zeigt keine Owner-Prüfoberfläche.
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
    var el = document.getElementById("portal-status-message");
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

  function formatDate(isoString) {
    if (!isoString) return "Noch keine Anmeldung";
    try {
      return new Date(isoString).toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (_error) {
      return isoString;
    }
  }

  function loadMe() {
    fetch("/api/portal/me", { credentials: "same-origin" })
      .then(function (response) {
        if (response.status === 401 || response.status === 404) {
          window.location.href = "/portal/login";
          return null;
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          return;
        }
        document.getElementById("portal-greeting-name").textContent = ", " + data.displayName;
        document.getElementById("portal-tenant-line").textContent = data.tenantDisplayName
          ? "Angemeldet für " + data.tenantDisplayName + "."
          : "Angemeldet als Owner.";
        document.getElementById("kv-display-name").textContent = data.displayName || "–";
        document.getElementById("kv-email").textContent = data.email || "–";
        document.getElementById("kv-role").textContent = data.roleLabel || "–";
        document.getElementById("kv-tenant").textContent = data.tenantDisplayName || "–";
        document.getElementById("kv-account-status").textContent = data.accountStatusLabel || "–";
        document.getElementById("kv-last-login").textContent = formatDate(data.lastLoginAt);
      })
      .catch(function () {
        setStatus("Kontoinformationen konnten nicht geladen werden.", "error");
      });
  }

  function loadStatus() {
    fetch("/api/portal/status", { credentials: "same-origin" })
      .then(function (response) {
        if (response.status === 401 || response.status === 404) {
          return null;
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          return;
        }
        document.getElementById("portal-status-text").textContent = data.statusMessage || "";
      })
      .catch(function () {
        /* Status ist informativ, kein blockierender Fehler. */
      });
  }

  // ---------------------------------------------------------------------
  // Arbeitsaufträge (V7.2 Phase B Schritt 1, Auftrag Abschnitt D/E).
  // ---------------------------------------------------------------------

  function renderWorkOrderList(workOrders) {
    var list = document.getElementById("work-order-list");
    var emptyHint = document.getElementById("work-order-empty-hint");
    list.innerHTML = "";
    if (!workOrders.length) {
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    workOrders.forEach(function (workOrder) {
      var badge = el("span", { class: "portal-badge", "data-status": workOrder.status, text: workOrder.statusLabel }, []);
      var meta = el("div", { class: "portal-list-item-meta" }, [badge, el("span", { text: formatDate(workOrder.createdAt) }, [])]);
      if (workOrder.status === "NEEDS_CLARIFICATION") {
        meta.appendChild(el("span", { text: "Rückfrage offen – bitte ansehen" }, []));
      }
      var item = el("li", {}, []);
      var button = el("button", { type: "button", class: "portal-list-item" }, [
        el("div", { class: "portal-list-item-title", text: workOrder.title }, []),
        meta,
      ]);
      button.addEventListener("click", function () {
        showWorkOrderDetail(workOrder.id);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  function loadWorkOrderList() {
    fetchJson("/api/portal/work-orders").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderWorkOrderList(result.data.workOrders);
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
    document.getElementById("work-order-detail-result").textContent = workOrder.desiredResult;
    document.getElementById("work-order-detail-context").textContent = workOrder.context || "Keine Angabe";
    document.getElementById("work-order-detail-deadline").textContent = workOrder.deadlineText || "Keine Angabe";
    document.getElementById("work-order-detail-created").textContent = formatDate(workOrder.createdAt);

    var noteBox = document.getElementById("work-order-detail-note");
    var noteParts = [];
    if (workOrder.statusNote) noteParts.push(workOrder.statusNote);
    if (workOrder.customerMessage) noteParts.push(workOrder.customerMessage);
    if (noteParts.length > 0) {
      noteBox.hidden = false;
      document.getElementById("work-order-detail-note-text").textContent = noteParts.join(" ");
    } else {
      noteBox.hidden = true;
    }

    var resubmitSection = document.getElementById("work-order-resubmit-section");
    if (workOrder.status === "NEEDS_CLARIFICATION") {
      resubmitSection.hidden = false;
      var form = document.getElementById("work-order-resubmit-form");
      form.title.value = workOrder.title;
      form.desiredResult.value = workOrder.desiredResult;
      form.context.value = workOrder.context || "";
      form.deadlineText.value = workOrder.deadlineText || "";
    } else {
      resubmitSection.hidden = true;
    }

    document.getElementById("work-order-cancel-section").hidden = !workOrder.cancellable;
  }

  function showWorkOrderDetail(workOrderId) {
    state.selectedWorkOrderId = workOrderId;
    fetchJson("/api/portal/work-orders/" + encodeURIComponent(workOrderId)).then(function (result) {
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

  function setupWorkOrderDetailBack() {
    document.getElementById("work-order-detail-back").addEventListener("click", showWorkOrderList);
  }

  function setupResubmitForm() {
    var form = document.getElementById("work-order-resubmit-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!state.selectedWorkOrderId) return;
      setStatus("", "");
      var title = form.title.value.trim();
      var desiredResult = form.desiredResult.value.trim();
      if (!title || !desiredResult) {
        setStatus("Bitte Titel und gewünschtes Ergebnis angeben.", "error");
        return;
      }
      postAction("/api/portal/work-orders/" + encodeURIComponent(state.selectedWorkOrderId) + "/resubmit", {
        title: title,
        desiredResult: desiredResult,
        context: form.context.value.trim() || null,
        deadlineText: form.deadlineText.value.trim() || null,
      }).then(function (result) {
        if (result.statusCode === 200 && result.data && result.data.ok) {
          setStatus("Arbeitsauftrag erneut eingereicht.", "success");
          renderWorkOrderDetail(result.data.workOrder);
          return;
        }
        setStatus((result.data && result.data.message) || "Erneutes Absenden nicht möglich.", "error");
      });
    });
  }

  function setupCancelButton() {
    document.getElementById("work-order-cancel-button").addEventListener("click", function () {
      if (!state.selectedWorkOrderId) return;
      if (!window.confirm("Diesen Arbeitsauftrag wirklich stornieren?")) return;
      setStatus("", "");
      postAction("/api/portal/work-orders/" + encodeURIComponent(state.selectedWorkOrderId) + "/cancel", {}).then(function (result) {
        if (result.statusCode === 200 && result.data && result.data.ok) {
          setStatus("Arbeitsauftrag storniert.", "success");
          renderWorkOrderDetail(result.data.workOrder);
          return;
        }
        setStatus((result.data && result.data.message) || "Stornieren nicht möglich.", "error");
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
    setupWorkOrderDetailBack();
    setupResubmitForm();
    setupCancelButton();
    loadMe();
    loadStatus();
    loadWorkOrderList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
