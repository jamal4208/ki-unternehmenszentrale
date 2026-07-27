"use strict";
/*
 * V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
 * (Auftrag Abschnitt F/L/M): eigenständiges, additives Client-Skript für den
 * Canva-Bereich innerhalb der bestehenden Hauptarbeitskarte "Heute arbeiten"
 * (#jamal-canva-output, ebenfalls STATIC_OWNER_ONLY). Spricht ausschließlich
 * die /api/jamal-work-mode/canva-*-Routen an. Gleiches Grundmuster wie
 * jamal-work-mode-ui.js – bewusst eine eigene Datei statt einer Erweiterung
 * von jamal-work-mode-ui.js (siehe dortiger Kopfkommentar/Test: "kein
 * Provider (Canva/HeyGen) im Jamal-Arbeitsmodus").
 *
 * Leitprinzipien (Auftrag Abschnitt L): eine klare primäre Aktion je
 * Zustand, keine Providerdetails im Hauptbereich (nur in
 * #jamal-canva-diagnostics-output), keine Publish-/Social-Media-/
 * Billing-Schaltfläche, kein Kundenkonto-Zugriff, keine Tokenanzeige.
 */

(function () {
  var state = {
    data: null,
    loading: true,
    error: null,
    mode: "VIEW", // VIEW | RIGHTS_FORM | CONFIRM_HANDOFF | CHANGE_FORM | BRIEFING_VIEW
    running: false,
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

  // Auftrag Abschnitt M/F: das einzige erlaubte externe Ziel eines Links in
  // dieser Karte ist ein bereits serverseitig geprüfter Canva-Link (siehe
  // canva-design-result.js#validateResultReferenceUrl); jeder andere Wert
  // wird defensiv verworfen statt als href übernommen.
  function safeCanvaHref(url) {
    return typeof url === "string" && /^https:\/\/www\.canva\.com\//.test(url) ? url : null;
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
  // Auftrag Abschnitt G/L: verständliche deutsche Texte im Hauptbereich.
  // Die Statustexte kommen bereits vom Server (statusLabel/decisionLabel);
  // hier wird ausschließlich additiv der Rechte-/Consent-Text übersetzt.
  // -------------------------------------------------------------------
  var RIGHTS_LABELS_DE = {
    CLEAR: "Rechte/Consent geklärt",
    UNCLEAR: "Rechte/Consent noch offen",
    BLOCKED: "Rechte/Consent blockiert",
  };

  function rightsLabel(status) {
    return RIGHTS_LABELS_DE[status] || "Rechte/Consent ungeklärt";
  }

  function byId(id) {
    return document.getElementById(id);
  }

  // -------------------------------------------------------------------
  // Rendering.
  // -------------------------------------------------------------------

  function renderLoading() {
    return "<p>Canva-Status wird geladen…</p>";
  }

  function renderErrorBlock(message) {
    return (
      '<p class="jamal-canva-error" role="alert">' +
      escapeHtml(message || "Der Canva-Bereich konnte nicht geladen werden.") +
      "</p>" +
      '<button type="button" class="secondary-button" data-action="reload">Erneut versuchen</button>'
    );
  }

  // Reine Formularfelder ohne <form>-Hülle – wiederverwendet sowohl von
  // renderRightsForm (eigenständiges Formular im BLOCKED-Zustand) als auch
  // vom Änderungsformular in renderResultReceived (dort bereits innerhalb
  // eines anderen <form data-form="canva-change">) – niemals verschachtelte
  // <form>-Elemente.
  function renderRightsFields(idPrefix) {
    return (
      '<label for="' + idPrefix + '-owns-rights">Besitzt du bzw. der Auftraggeber die Bildrechte?</label>' +
      '<select id="' + idPrefix + '-owns-rights" name="ownsImageRights"><option value="">Bitte wählen</option><option value="true">Ja</option><option value="false">Nein</option></select>' +
      '<label for="' + idPrefix + '-brand-allowed">Darf die Marke verwendet werden?</label>' +
      '<select id="' + idPrefix + '-brand-allowed" name="brandUsageAllowed"><option value="">Bitte wählen</option><option value="true">Ja</option><option value="false">Nein</option></select>' +
      '<label for="' + idPrefix + '-real-person">Enthält der Auftrag eine reale Person?</label>' +
      '<select id="' + idPrefix + '-real-person" name="containsRealPerson"><option value="">Bitte wählen</option><option value="true">Ja</option><option value="false">Nein</option></select>' +
      '<label for="' + idPrefix + '-consent"><input id="' + idPrefix + '-consent" type="checkbox" name="consentConfirmed" /> Zustimmung der realen Person liegt dokumentiert vor</label>' +
      '<label for="' + idPrefix + '-avatar"><input id="' + idPrefix + '-avatar" type="checkbox" name="isAvatar" /> Es handelt sich um einen Avatar einer realen Person</label>'
    );
  }

  function renderRightsForm(current) {
    var rights = current.rights || { notes: [] };
    var notes = (rights.notes || [])
      .map(function (note) {
        return "<li>" + escapeHtml(note) + "</li>";
      })
      .join("");
    return (
      '<div class="jamal-canva-rights">' +
      (notes ? '<ul class="jamal-canva-rights-notes">' + notes + "</ul>" : "") +
      '<form data-form="rights">' +
      renderRightsFields("jamal-canva-rights") +
      '<div class="jamal-work-primary-row">' +
      '<button type="submit" class="primary-button" data-primary-action="check-rights">Rechte prüfen</button>' +
      "</div>" +
      "</form>" +
      "</div>"
    );
  }

  function renderBriefingSummary(briefing) {
    if (!briefing) return "";
    return (
      '<dl class="jamal-canva-briefing-summary">' +
      "<div><dt>Ziel</dt><dd>" +
      escapeHtml(briefing.designGoal) +
      "</dd></div>" +
      "<div><dt>Zielgruppe</dt><dd>" +
      escapeHtml(briefing.targetAudience) +
      "</dd></div>" +
      "<div><dt>Format</dt><dd>" +
      escapeHtml(briefing.desiredFormat) +
      "</dd></div>" +
      "<div><dt>Text</dt><dd>" +
      escapeHtml(briefing.textContent || "Kein zusätzlicher Text angegeben.") +
      "</dd></div>" +
      "<div><dt>Bildhinweise</dt><dd>" +
      escapeHtml(briefing.imageNotes) +
      "</dd></div>" +
      "<div><dt>Veröffentlichung</dt><dd>Gesperrt – es erfolgt noch keine Veröffentlichung.</dd></div>" +
      "</dl>"
    );
  }

  function renderConfirmPanel(current) {
    var briefing = current.briefing || {};
    return (
      '<div class="jamal-canva-confirm" role="group" aria-label="Canva-Produktion freigeben">' +
      "<p>Vor dem Start wird genau dieser Inhalt an Canva übergeben:</p>" +
      renderBriefingSummary(briefing) +
      '<p class="jamal-canva-note">Es erfolgt noch keine Veröffentlichung. Es kann externe Nutzung/Kosten entstehen.</p>' +
      '<div class="jamal-work-primary-row">' +
      '<button type="button" class="primary-button" data-action="confirm-start-handoff">Canva-Produktion starten</button>' +
      "</div>" +
      '<div class="jamal-work-secondary-row">' +
      '<button type="button" class="secondary-button" data-action="close-confirm">Noch nicht</button>' +
      '<button type="button" class="secondary-button" data-action="cancel-production">Intern weiterbearbeiten</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderReadyForApproval(current) {
    var suitability = current.suitability || {};
    var pieces = [];
    pieces.push('<p class="jamal-canva-hint">' + escapeHtml(suitability.decisionLabel || "Canva könnte für dieses Ergebnis passen.") + "</p>");
    pieces.push(
      '<dl class="jamal-canva-facts">' +
        "<div><dt>Format</dt><dd>" +
        escapeHtml(suitability.suggestedFormat || "UNGEKLÄRT") +
        "</dd></div>" +
        "<div><dt>Briefingstatus</dt><dd>Bereit zur Freigabe</dd></div>" +
        "<div><dt>Rechte/Consent</dt><dd>" +
        escapeHtml(rightsLabel(current.rights && current.rights.status)) +
        "</dd></div>" +
        "</dl>",
    );
    if (state.mode === "CONFIRM_HANDOFF") {
      pieces.push(renderConfirmPanel(current));
    } else {
      pieces.push(
        '<div class="jamal-work-primary-row">' +
          '<button type="button" class="primary-button" data-action="open-confirm-handoff">Canva-Produktion starten</button>' +
          "</div>" +
          '<div class="jamal-work-secondary-row">' +
          '<button type="button" class="secondary-button" data-action="toggle-briefing">Briefing ansehen</button>' +
          '<button type="button" class="secondary-button" data-action="cancel-production">Intern weiterbearbeiten</button>' +
          "</div>",
      );
    }
    if (state.mode === "BRIEFING_VIEW") {
      pieces.push(renderBriefingSummary(current.briefing));
    }
    return pieces.join("");
  }

  function renderRunning() {
    return (
      '<p class="jamal-canva-hint" data-tone="progress">Canva-Produktion läuft</p>' +
      '<div class="jamal-work-primary-row">' +
      '<button type="button" class="primary-button" disabled aria-disabled="true">Canva-Produktion läuft</button>' +
      "</div>"
    );
  }

  function renderResultReceived(current) {
    var design = current.design || {};
    var quality = current.quality || { statusLabel: "Ungeprüft", notes: [] };
    var notes = (quality.notes || [])
      .map(function (note) {
        return "<li>" + escapeHtml(note) + "</li>";
      })
      .join("");
    var editHref = safeCanvaHref(design.editLink);
    var changeForm =
      state.mode === "CHANGE_FORM"
        ? '<form data-form="canva-change" class="jamal-work-form">' +
          '<label for="jamal-canva-change-input">Was soll geändert werden?</label>' +
          '<textarea id="jamal-canva-change-input" name="changeText" rows="2" required></textarea>' +
          renderRightsFields("jamal-canva-change") +
          '<div class="jamal-work-primary-row">' +
          '<button type="submit" class="primary-button" data-primary-action="request-revision">Änderung senden</button>' +
          "</div>" +
          '<div class="jamal-work-secondary-row">' +
          '<button type="button" class="secondary-button" data-action="close-change-form">Abbrechen</button>' +
          "</div>" +
          "</form>"
        : "";
    return (
      '<div class="jamal-canva-result">' +
      "<h3>" +
      escapeHtml(design.designTitle || "Canva-Design") +
      "</h3>" +
      '<p><span class="jamal-work-status" data-tone="' +
      (quality.status === "PASSED" ? "done" : quality.status === "BLOCKED" ? "blocked" : "attention") +
      '">' +
      escapeHtml(quality.statusLabel) +
      "</span></p>" +
      (notes ? '<ul class="jamal-canva-quality-notes">' + notes + "</ul>" : "") +
      (state.mode !== "CHANGE_FORM"
        ? '<div class="jamal-work-primary-row">' +
          '<button type="button" class="primary-button" data-action="accept-result">Passt</button>' +
          '<button type="button" class="secondary-button" data-action="open-change-form">Änderung anfordern</button>' +
          "</div>" +
          '<div class="jamal-work-secondary-row">' +
          (editHref
            ? '<a class="secondary-button" href="' + escapeHtml(editHref) + '" target="_blank" rel="noopener">In Canva öffnen</a>'
            : "") +
          '<button type="button" class="secondary-button" data-action="toggle-briefing">Briefing ansehen</button>' +
          "</div>"
        : "") +
      changeForm +
      (state.mode === "BRIEFING_VIEW" ? renderBriefingSummary(current.briefing) : "") +
      "</div>"
    );
  }

  function renderAcceptedOrTerminal(current) {
    var design = current.design || {};
    var editHref = safeCanvaHref(design.editLink);
    var statusLabel = current.statusLabel || "Abgeschlossen";
    return (
      '<p class="jamal-canva-hint">' +
      escapeHtml(statusLabel) +
      "</p>" +
      (editHref
        ? '<div class="jamal-work-secondary-row"><a class="secondary-button" href="' +
          escapeHtml(editHref) +
          '" target="_blank" rel="noopener">In Canva öffnen</a></div>'
        : "")
    );
  }

  function renderMain(view) {
    if (!view || !view.hasWorkItem || !view.eligibleForCanva) return "";
    var current = view.current;
    if (!current) return "";
    if (current.suitability && current.suitability.decision === "CANVA_NOT_SUITABLE") return "";

    if (current.status === "BLOCKED") {
      if (current.suitability && current.suitability.decision === "CANVA_BLOCKED_BY_POLICY") {
        return '<p class="jamal-canva-hint" data-tone="blocked">Dieser Auftrag ist für eine externe Produktion gesperrt.</p>';
      }
      return (
        '<p class="jamal-canva-hint" data-tone="attention">' + escapeHtml(rightsLabel(current.rights && current.rights.status)) + "</p>" +
        renderRightsForm(current)
      );
    }
    if (current.status === "READY_FOR_APPROVAL") {
      return renderReadyForApproval(current);
    }
    if (current.status === "APPROVED_FOR_HANDOFF" || current.status === "HANDOFF_STARTED" || current.status === "WAITING_FOR_CANVA" || state.running) {
      return renderRunning();
    }
    if (current.status === "RESULT_RECEIVED") {
      return renderResultReceived(current);
    }
    if (current.status === "ACCEPTED_INTERNAL" || current.status === "FAILED" || current.status === "CANCELLED") {
      return renderAcceptedOrTerminal(current);
    }
    return "";
  }

  function renderDiagnostics(view) {
    var output = byId("jamal-canva-diagnostics-output");
    if (!output) return;
    var current = view && view.current;
    if (!current) {
      output.textContent = "Keine technischen Details verfügbar.";
      return;
    }
    var lines = [
      "Interner Status: " + current.status,
      "Revision: " + current.revisionNumber,
      "Providerstatus: " + (current.design && current.design.providerStatus ? current.design.providerStatus : "UNGEKLÄRT"),
    ];
    if (current.errorCode) lines.push("Fehlercode: " + current.errorCode);
    output.innerHTML = lines
      .map(function (line) {
        return "<div>" + escapeHtml(line) + "</div>";
      })
      .join("");
  }

  function render() {
    var output = byId("jamal-canva-output");
    if (!output) return;
    if (state.loading) {
      output.innerHTML = renderLoading();
      return;
    }
    if (state.error) {
      output.innerHTML = renderErrorBlock(state.error);
      return;
    }
    output.innerHTML = renderMain(state.data);
    renderDiagnostics(state.data);
  }

  // -------------------------------------------------------------------
  // Zustand laden/aktualisieren.
  // -------------------------------------------------------------------

  function applyView(view) {
    state.data = view;
    state.error = null;
    state.loading = false;
    state.running = false;
    render();
  }

  function loadState() {
    state.loading = true;
    render();
    fetchJson("/api/jamal-work-mode/canva-state", { method: "GET" })
      .then(function (result) {
        if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
          state.loading = false;
          state.error = (result.data && result.data.message) || "Der Canva-Bereich konnte nicht geladen werden.";
          render();
          return;
        }
        var view = result.data;
        state.mode = "VIEW";
        applyView(view);
        // Auftrag Abschnitt D: die Eignungsprüfung selbst ist vorbereitend
        // und löst keine externe Aktion aus – ein automatischer erster
        // Prüflauf ist daher zulässig, sobald ein internes Ergebnis
        // vorliegt und noch keine Canva-Produktion existiert.
        if (view.hasWorkItem && view.eligibleForCanva && !view.current) {
          runAction("canva-prepare-briefing", {});
        }
      })
      .catch(function () {
        state.loading = false;
        state.error = "Der Canva-Bereich konnte nicht geladen werden.";
        render();
      });
  }

  function runAction(action, body) {
    return postAction(action, body).then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        throw new Error((result.data && result.data.message) || "Aktion ist im aktuellen Zustand nicht möglich.");
      }
      applyView({ hasWorkItem: true, eligibleForCanva: true, current: result.data.canva, history: (state.data && state.data.history) || [] });
      return result.data.canva;
    });
  }

  function runActionWithFallback(action, body) {
    return runAction(action, body).catch(function (error) {
      state.error = error.message;
      state.running = false;
      render();
    });
  }

  function rightsInputFromForm(formElement) {
    function selectBool(name) {
      var element = formElement.querySelector('[name="' + name + '"]');
      if (!element || element.value === "") return undefined;
      return element.value === "true";
    }
    return {
      ownsImageRights: selectBool("ownsImageRights"),
      brandUsageAllowed: selectBool("brandUsageAllowed"),
      containsRealPerson: selectBool("containsRealPerson"),
      consentConfirmed: Boolean(formElement.querySelector('[name="consentConfirmed"]') && formElement.querySelector('[name="consentConfirmed"]').checked),
      isAvatar: Boolean(formElement.querySelector('[name="isAvatar"]') && formElement.querySelector('[name="isAvatar"]').checked),
    };
  }

  // -------------------------------------------------------------------
  // Ereignisbindung.
  // -------------------------------------------------------------------

  function bindEvents() {
    var slot = byId("jamal-canva-card");
    if (!slot) return;

    slot.addEventListener("click", function (event) {
      var target = event.target.closest("[data-action]");
      if (!target) return;
      var action = target.getAttribute("data-action");
      if (action === "reload") {
        loadState();
      } else if (action === "open-confirm-handoff") {
        state.mode = "CONFIRM_HANDOFF";
        render();
      } else if (action === "close-confirm") {
        state.mode = "VIEW";
        render();
      } else if (action === "toggle-briefing") {
        state.mode = state.mode === "BRIEFING_VIEW" ? "VIEW" : "BRIEFING_VIEW";
        render();
      } else if (action === "cancel-production") {
        runActionWithFallback("canva-cancel", { reason: "Von Jamal intern weiterbearbeitet." });
      } else if (action === "confirm-start-handoff") {
        state.running = true;
        render();
        runAction("canva-approve-handoff", {})
          .then(function () {
            return runAction("canva-start-handoff", {});
          })
          .catch(function (error) {
            state.error = error.message;
            state.running = false;
            render();
          });
      } else if (action === "accept-result") {
        runActionWithFallback("canva-accept-result", {});
      } else if (action === "open-change-form") {
        state.mode = "CHANGE_FORM";
        render();
      } else if (action === "close-change-form") {
        state.mode = "VIEW";
        render();
      }
    });

    slot.addEventListener("submit", function (event) {
      var form = event.target.closest("form[data-form]");
      if (!form) return;
      event.preventDefault();
      var formType = form.getAttribute("data-form");
      if (formType === "rights") {
        runActionWithFallback("canva-prepare-briefing", rightsInputFromForm(form));
      } else if (formType === "canva-change") {
        var changeText = form.querySelector('[name="changeText"]').value;
        var body = Object.assign({ changeText: changeText }, rightsInputFromForm(form));
        runActionWithFallback("canva-request-revision", body);
      }
    });
  }

  function init() {
    if (!byId("jamal-canva-card")) return;
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

  // Für jamal-canva-ui.test.js (reine Quelltextprüfung, kein Browser).
  if (typeof module === "object" && module.exports) {
    module.exports = { escapeHtml: escapeHtml, rightsLabel: rightsLabel, safeCanvaHref: safeCanvaHref };
  }
})();
