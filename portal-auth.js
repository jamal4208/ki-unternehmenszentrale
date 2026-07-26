"use strict";
/*
 * V7.2 Phase A Schritt 3 (Auftrag Abschnitt E/F) – Client-Skript für die
 * öffentlichen Portal-Einstiegsseiten: Anmeldung, Einladung annehmen,
 * Passwort vergessen, neues Passwort setzen.
 *
 * Läuft ausschließlich auf /portal/login, /portal/einladung,
 * /portal/passwort-vergessen, /portal/passwort-neu (STATIC_PUBLIC).
 * Kein externer Aufruf, kein Tracking, keine dauerhafte Speicherung von
 * Tokens im Skript-Zustand über die Verarbeitung hinaus.
 */

(function () {
  var VIEW_BY_PATH = {
    "/portal/login": "login",
    "/portal/einladung": "invite",
    "/portal/passwort-vergessen": "forgot",
    "/portal/passwort-neu": "reset",
  };

  var statusEl = document.getElementById("portal-auth-status");

  function setStatus(message, tone) {
    statusEl.textContent = message || "";
    statusEl.setAttribute("data-tone", tone || "");
  }

  function showView(view) {
    var sections = document.querySelectorAll("[data-view]");
    for (var i = 0; i < sections.length; i += 1) {
      sections[i].hidden = sections[i].getAttribute("data-view") !== view;
    }
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  function extractTokenFromUrlAndClean() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("token") || "";
    if (token && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return token;
  }

  function disableForm(form, disabled) {
    var button = form.querySelector("button[type=submit]");
    if (button) {
      button.disabled = disabled;
    }
  }

  function setupLoginForm() {
    var form = document.getElementById("login-form");
    if (!form) {
      return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus("", "");
      var email = form.email.value.trim();
      var password = form.password.value;
      if (!email || !password) {
        setStatus("Bitte E-Mail-Adresse und Passwort eingeben.", "error");
        return;
      }
      disableForm(form, true);
      postJson("/api/auth/login", { email: email, password: password })
        .then(function (result) {
          disableForm(form, false);
          if (result.statusCode === 200 && result.data && result.data.ok) {
            window.location.href = "/portal";
            return;
          }
          setStatus(
            (result.data && result.data.message) || "Anmeldung nicht möglich. Bitte Angaben prüfen.",
            "error",
          );
        })
        .catch(function () {
          disableForm(form, false);
          setStatus("Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.", "error");
        });
    });
  }

  function setupInviteForm(token) {
    var form = document.getElementById("invite-form");
    if (!form) {
      return;
    }
    if (!token) {
      setStatus("Dieser Einladungslink ist unvollständig oder ungültig.", "error");
      form.hidden = true;
      return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus("", "");
      var newPassword = form.newPassword.value;
      var confirmPassword = form.newPasswordConfirm.value;
      if (newPassword.length < 12) {
        setStatus("Das Passwort muss mindestens 12 Zeichen lang sein.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        setStatus("Die eingegebenen Passwörter stimmen nicht überein.", "error");
        return;
      }
      disableForm(form, true);
      postJson("/api/auth/invitation/accept", { token: token, newPassword: newPassword })
        .then(function (result) {
          disableForm(form, false);
          if (result.statusCode === 200 && result.data && result.data.ok) {
            setStatus("Konto aktiviert. Sie können sich jetzt anmelden.", "success");
            form.hidden = true;
            window.setTimeout(function () {
              window.location.href = "/portal/login";
            }, 1500);
            return;
          }
          setStatus(
            (result.data && result.data.message) || "Einladung konnte nicht angenommen werden.",
            "error",
          );
        })
        .catch(function () {
          disableForm(form, false);
          setStatus("Aktivierung derzeit nicht möglich. Bitte später erneut versuchen.", "error");
        });
    });
  }

  function setupForgotForm() {
    var form = document.getElementById("forgot-form");
    if (!form) {
      return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus("", "");
      var email = form.email.value.trim();
      if (!email) {
        setStatus("Bitte E-Mail-Adresse eingeben.", "error");
        return;
      }
      disableForm(form, true);
      postJson("/api/auth/password-reset/request", { email: email })
        .then(function () {
          disableForm(form, false);
          setStatus(
            "Falls für dieses Konto ein Rücksetzvorgang möglich ist, wurde er vorbereitet.",
            "success",
          );
          form.reset();
        })
        .catch(function () {
          disableForm(form, false);
          setStatus(
            "Falls für dieses Konto ein Rücksetzvorgang möglich ist, wurde er vorbereitet.",
            "success",
          );
        });
    });
  }

  function setupResetForm(token) {
    var form = document.getElementById("reset-form");
    if (!form) {
      return;
    }
    if (!token) {
      setStatus("Dieser Link ist unvollständig oder ungültig.", "error");
      form.hidden = true;
      return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus("", "");
      var newPassword = form.newPassword.value;
      var confirmPassword = form.newPasswordConfirm.value;
      if (newPassword.length < 12) {
        setStatus("Das Passwort muss mindestens 12 Zeichen lang sein.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        setStatus("Die eingegebenen Passwörter stimmen nicht überein.", "error");
        return;
      }
      disableForm(form, true);
      postJson("/api/auth/password-reset/confirm", { token: token, newPassword: newPassword })
        .then(function (result) {
          disableForm(form, false);
          if (result.statusCode === 200 && result.data && result.data.ok) {
            setStatus("Passwort gespeichert. Sie können sich jetzt anmelden.", "success");
            form.hidden = true;
            window.setTimeout(function () {
              window.location.href = "/portal/login";
            }, 1500);
            return;
          }
          setStatus((result.data && result.data.message) || "Zurücksetzen nicht möglich.", "error");
        })
        .catch(function () {
          disableForm(form, false);
          setStatus("Zurücksetzen derzeit nicht möglich. Bitte später erneut versuchen.", "error");
        });
    });
  }

  function init() {
    var view = VIEW_BY_PATH[window.location.pathname];
    if (!view) {
      return;
    }
    showView(view);

    if (view === "login") {
      setupLoginForm();
    } else if (view === "invite") {
      setupInviteForm(extractTokenFromUrlAndClean());
    } else if (view === "forgot") {
      setupForgotForm();
    } else if (view === "reset") {
      setupResetForm(extractTokenFromUrlAndClean());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
