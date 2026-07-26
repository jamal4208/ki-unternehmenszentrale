"use strict";
/*
 * V7.2 Phase A Schritt 3 (Auftrag Abschnitt G) – Client-Skript für die
 * Owner-Kunden-/Benutzerverwaltung (/owner/kunden, STATIC_OWNER_ONLY).
 * Spricht ausschließlich die /api/owner/*-Routen an. Zeigt Einladungs-/
 * Reset-Token exakt einmal direkt nach der auslösenden Aktion an – niemals
 * in einer Listenansicht, niemals dauerhaft gespeichert (Auftrag
 * Abschnitt G/H: "kontrollierter Owner-Ausgabeweg").
 */

(function () {
  var state = {
    selectedCustomerId: null,
    selectedTenantName: "",
  };

  var ROLE_LABELS = {
    CUSTOMER_ADMIN: "Kunde (Admin)",
    CUSTOMER_USER: "Kunde (Mitarbeiter)",
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

  function showToken(label, token, notice) {
    var box = document.getElementById("owner-token-box");
    box.innerHTML = "";
    box.hidden = false;
    box.className = "portal-card";

    var heading = document.createElement("h3");
    heading.className = "portal-subtitle";
    heading.textContent = label;
    box.appendChild(heading);

    var noticeEl = document.createElement("p");
    noticeEl.className = "portal-lede";
    noticeEl.textContent = notice || "";
    box.appendChild(noticeEl);

    var tokenEl = document.createElement("div");
    tokenEl.className = "portal-token-box";
    tokenEl.textContent = token;
    box.appendChild(tokenEl);

    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "portal-button portal-button--secondary";
    dismiss.style.width = "auto";
    dismiss.style.marginTop = "0.75rem";
    dismiss.textContent = "Ausblenden";
    dismiss.addEventListener("click", function () {
      box.hidden = true;
      box.innerHTML = "";
    });
    box.appendChild(dismiss);
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
    var options = { method: "POST" };
    if (bodyObj) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(bodyObj);
    }
    return fetchJson(url, options);
  }

  function formatDate(isoString) {
    if (!isoString) return "–";
    try {
      return new Date(isoString).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    } catch (_error) {
      return isoString;
    }
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

  function actionButton(label, handler) {
    var button = el("button", { type: "button", class: "portal-button" });
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function renderTenants(tenants) {
    var body = document.getElementById("tenant-table-body");
    body.innerHTML = "";
    tenants.forEach(function (tenant) {
      var actionsCell = el("td", {}, []);
      var actions = el("div", { class: "portal-actions" }, []);
      if (tenant.status === "ACTIVE") {
        actions.appendChild(
          actionButton("Suspendieren", function () {
            handleTenantAction(tenant.customerId, "suspend");
          }),
        );
      } else {
        actions.appendChild(
          actionButton("Aktivieren", function () {
            handleTenantAction(tenant.customerId, "activate");
          }),
        );
      }
      actions.appendChild(
        actionButton("Benutzer anzeigen", function () {
          selectTenant(tenant.customerId, tenant.displayName);
        }),
      );
      actionsCell.appendChild(actions);

      var row = el("tr", {}, [
        el("td", { text: tenant.displayName }, []),
        el("td", { text: tenant.status }, []),
        el("td", { text: String(tenant.userCount) }, []),
        el("td", { text: String(tenant.activeSessionCount) }, []),
        actionsCell,
      ]);
      body.appendChild(row);
    });
  }

  function loadTenants() {
    fetchJson("/api/owner/tenants").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderTenants(result.data.tenants);
        return;
      }
      setStatus("Mandantenliste konnte nicht geladen werden.", "error");
    });
  }

  function handleTenantAction(customerId, action) {
    setStatus("", "");
    postAction("/api/owner/tenants/" + encodeURIComponent(customerId) + "/" + action).then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        setStatus("Mandant aktualisiert.", "success");
        loadTenants();
        return;
      }
      setStatus((result.data && result.data.message) || "Aktion nicht möglich.", "error");
    });
  }

  function renderUsers(customerId, users) {
    var body = document.getElementById("user-table-body");
    body.innerHTML = "";
    users.forEach(function (user) {
      var actions = el("div", { class: "portal-actions" }, []);

      if (user.status === "ACTIVE" || user.status === "LOCKED") {
        actions.appendChild(
          actionButton("Sperren", function () {
            handleUserAction(customerId, user.userId, "suspend");
          }),
        );
        actions.appendChild(
          actionButton("Sitzungen widerrufen", function () {
            handleUserAction(customerId, user.userId, "revoke-sessions");
          }),
        );
        actions.appendChild(
          actionButton("Reset vorbereiten", function () {
            handleUserAction(customerId, user.userId, "prepare-password-reset");
          }),
        );
      } else if (user.status === "DISABLED") {
        actions.appendChild(
          actionButton("Reaktivieren", function () {
            handleUserAction(customerId, user.userId, "reactivate");
          }),
        );
      } else if (user.status === "INVITED") {
        actions.appendChild(
          actionButton("Einladung erneuern", function () {
            handleUserAction(customerId, user.userId, "reissue-invitation");
          }),
        );
        actions.appendChild(
          actionButton("Einladung widerrufen", function () {
            handleUserAction(customerId, user.userId, "revoke-invitation");
          }),
        );
      }

      var row = el("tr", {}, [
        el("td", { text: user.displayName }, []),
        el("td", { text: user.email }, []),
        el("td", { text: ROLE_LABELS[user.role] || user.roleLabel }, []),
        el("td", { text: user.status }, []),
        el("td", { text: user.invitationStatus }, []),
        el("td", { text: String(user.activeSessionCount) }, []),
        el("td", {}, [actions]),
      ]);
      body.appendChild(row);
    });
  }

  function loadUsers(customerId) {
    fetchJson("/api/owner/tenants/" + encodeURIComponent(customerId) + "/users").then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        renderUsers(customerId, result.data.users);
        return;
      }
      setStatus("Benutzerliste konnte nicht geladen werden.", "error");
    });
  }

  function selectTenant(customerId, displayName) {
    state.selectedCustomerId = customerId;
    state.selectedTenantName = displayName;
    document.getElementById("tenant-detail-section").hidden = false;
    document.getElementById("tenant-detail-title").textContent = displayName;
    loadUsers(customerId);
  }

  function handleUserAction(customerId, userId, action) {
    setStatus("", "");
    postAction("/api/owner/users/" + encodeURIComponent(userId) + "/" + action).then(function (result) {
      if (result.statusCode === 200 && result.data && result.data.ok) {
        if (result.data.invitation && result.data.invitation.token) {
          showToken("Einladungslink-Token", result.data.invitation.token, result.data.invitation.notice);
        } else if (result.data.passwordReset && result.data.passwordReset.token) {
          showToken("Rücksetz-Token", result.data.passwordReset.token, result.data.passwordReset.notice);
        }
        setStatus("Benutzer aktualisiert.", "success");
        loadUsers(customerId);
        loadTenants();
        return;
      }
      setStatus((result.data && result.data.message) || "Aktion nicht möglich.", "error");
    });
  }

  function setupInviteForm() {
    var form = document.getElementById("invite-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!state.selectedCustomerId) {
        return;
      }
      setStatus("", "");
      var displayName = form.displayName.value.trim();
      var email = form.email.value.trim();
      var role = form.role.value;
      if (!displayName || !email) {
        setStatus("Bitte Anzeigename und E-Mail-Adresse angeben.", "error");
        return;
      }
      postAction("/api/owner/tenants/" + encodeURIComponent(state.selectedCustomerId) + "/users/invite", {
        displayName: displayName,
        email: email,
        role: role,
      }).then(function (result) {
        if (result.statusCode === 200 && result.data && result.data.ok) {
          form.reset();
          showToken(
            "Einladungslink-Token",
            result.data.invitation.token,
            result.data.invitation.notice,
          );
          setStatus("Benutzer eingeladen.", "success");
          loadUsers(state.selectedCustomerId);
          loadTenants();
          return;
        }
        setStatus((result.data && result.data.message) || "Einladung nicht möglich.", "error");
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
        .catch(function () {})
        .then(function () {
          window.location.href = "/portal/login";
        });
    });
  }

  function init() {
    setupLogout();
    setupInviteForm();
    loadTenants();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
