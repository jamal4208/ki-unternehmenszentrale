"use strict";
/*
 * V7.2 Phase A Schritt 3 (Auftrag Abschnitt D) – Client-Skript für die
 * authentifizierte Kundenportal-Startseite (/portal, STATIC_AUTHENTICATED_
 * PORTAL). Liest ausschließlich /api/portal/me und /api/portal/status;
 * bietet bewusst keine Fachaufträge, Tools oder Veröffentlichungsfunktionen
 * an (Auftrag Ziel 7).
 */

(function () {
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
    loadMe();
    loadStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
