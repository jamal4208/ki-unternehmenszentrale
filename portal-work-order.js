"use strict";
/*
 * V7.2 Phase B Schritt 1 (Auftrag Abschnitt D) – Client-Skript für die
 * Kundenportal-Seite "Neuen Arbeitsauftrag anlegen" (/portal/auftrag-neu,
 * STATIC_AUTHENTICATED_PORTAL). Spricht ausschließlich
 * POST /api/portal/work-orders an. Keine Tenant-, Rollen- oder
 * Providerwahl, keine Kostenfreigabe, keine Veröffentlichungsoption.
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

  function postAction(url, bodyObj) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-kuz-csrf": readCsrfToken(),
      },
      body: JSON.stringify(bodyObj || {}),
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

  function setupForm() {
    var form = document.getElementById("work-order-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus("", "");
      var title = form.title.value.trim();
      var desiredResult = form.desiredResult.value.trim();
      if (!title || !desiredResult) {
        setStatus("Bitte Titel und gewünschtes Ergebnis angeben.", "error");
        return;
      }
      var submitButton = form.querySelector("button[type=submit]");
      submitButton.disabled = true;
      postAction("/api/portal/work-orders", {
        title: title,
        desiredResult: desiredResult,
        context: form.context.value.trim() || null,
        deadlineText: form.deadlineText.value.trim() || null,
      })
        .then(function (result) {
          if (result.statusCode === 200 && result.data && result.data.ok) {
            window.location.href = "/portal";
            return;
          }
          submitButton.disabled = false;
          setStatus((result.data && result.data.message) || "Arbeitsauftrag konnte nicht angelegt werden.", "error");
        })
        .catch(function () {
          submitButton.disabled = false;
          setStatus("Arbeitsauftrag konnte nicht angelegt werden.", "error");
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
    setupForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
