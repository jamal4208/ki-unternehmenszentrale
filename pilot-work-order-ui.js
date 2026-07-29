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
 * kompakt (Auftragsauswahl, Auftrag, Status/Revision, nächster Schritt,
 * wichtigste Aktion, Konfliktanzeige). Alles Weitere ist aufklappbar. Keine
 * Schaltfläche löst eine echte externe Aktion, einen Commit, einen Push
 * oder ein Deployment aus. Die beiden Freigabegrenzen (Ausführung/
 * Abschluss) sind bewusst NICHT als Ein-Klick-Aktion mit `confirmed: true`
 * verdrahtet – Jamal bestätigt ausdrücklich außerhalb dieser Schaltfläche.
 *
 * Phase 5 (Auftrag "Pilot-Auftragszentrale im Cockpit"): erweitert die
 * bisher auf GENAU EINEN (kanonischen) Auftrag fest verdrahtete Karte um
 * eine kompakte Auftragsauswahl/-liste, eine kontrollierte Anlagefunktion
 * und eine auftragsbezogene Detail-/Konfliktanzeige. Die bisherige
 * kanonische Route (/api/pilot-work-order/status) bleibt der Startpunkt
 * (stellt weiterhin sicher, dass der kanonische Auftrag existiert und ist
 * standardmäßig vorausgewählt) – vollständige Rückwärtskompatibilität.
 * Jede mutierende Aktion adressiert ab jetzt ausdrücklich den aktuell
 * ausgewählten Auftrag über die additive Ressource
 * /api/pilot-work-order/orders/:pilotOrderId/:action und sendet die zuletzt
 * gelesene `revision` als `expectedRevision` mit (siehe
 * pilot-work-order-routes.js#PILOT_ACTIONS). Ein HTTP-409-Revisionskonflikt
 * überschreibt niemals lokal angezeigte Daten und wiederholt niemals
 * automatisch eine Aktion – ausschließlich ein ausdrücklicher Klick auf
 * "Aktuellen Stand neu laden" lädt den Auftrag erneut.
 */

(function () {
  var CANONICAL_PILOT_ORDER_ID = "pilot-three-agent-work-order-v1";

  // ---------------------------------------------------------------------
  // Zustand. Ein Wechsel des ausgewählten Auftrags (selectOrder) löscht
  // sofort `overview` (kein Weiteranzeigen der Daten des vorherigen
  // Auftrags während des Nachladens).
  // ---------------------------------------------------------------------
  var state = {
    orders: [],
    ordersLoading: true,
    ordersError: null,
    selectedPilotOrderId: null,
    overview: null,
    overviewLoading: true,
    overviewError: null,
    actionError: null,
    actionInFlight: false,
    conflict: null,
    createOpen: false,
    createError: null,
    creating: false,
    // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
    // Codex-Anbindung"): der Freigabe-Token lebt AUSSCHLIESSLICH kurz im
    // Client-Zustand (niemals in localStorage, niemals in der URL) und wird
    // bei jedem Auftragswechsel sowie nach jedem Start-Versuch verworfen
    // (siehe selectOrder/requestCodexApproval/starten unten) – kein
    // dauerhaftes Wiederverwenden eines bereits ausgestellten Tokens.
    codexApprovalToken: null,
    codexApprovalInFlight: false,
    codexApprovalError: null,
  };

  function byId(id) {
    return typeof document !== "undefined" ? document.getElementById(id) : null;
  }

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

  function formatTimestamp(iso) {
    if (!iso) return "\u2014";
    return String(iso).replace("T", " ").slice(0, 16);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isNonEmptyStringArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
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

  function postAction(pilotOrderId, action, bodyObj) {
    return fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(pilotOrderId) + "/" + action, {
      method: "POST",
      body: JSON.stringify(bodyObj || {}),
    });
  }

  // -----------------------------------------------------------------------
  // Laden: Liste + Auswahl (Auftrag Abschnitt 1/2).
  // -----------------------------------------------------------------------

  function loadOrdersList() {
    state.ordersLoading = true;
    render();
    return fetchJson("/api/pilot-work-order/orders").then(function (response) {
      state.ordersLoading = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.orders = response.data.orders || [];
        state.ordersError = null;
      } else {
        state.ordersError = "Die Pilotauftragsliste konnte nicht geladen werden.";
      }
      render();
    });
  }

  // Startpunkt: exakt die bisherige kanonische Route – stellt sicher, dass
  // der kanonische Auftrag existiert, und wählt ihn standardmäßig aus
  // (vollständige Rückwärtskompatibilität, siehe Kopfkommentar).
  function init() {
    state.ordersLoading = true;
    state.overviewLoading = true;
    render();
    return fetchJson("/api/pilot-work-order/status")
      .then(function (response) {
        state.overviewLoading = false;
        if (response.statusCode === 200 && response.data && response.data.ok) {
          state.overview = response.data.overview;
          state.selectedPilotOrderId = response.data.overview.order.id;
          state.overviewError = null;
        } else {
          state.overviewError = "Der Pilotauftrag konnte nicht geladen werden.";
        }
        render();
        return loadOrdersList();
      });
  }

  // Auftragswechsel (Auftrag Abschnitt 2): löscht die zuvor angezeigten
  // Daten sofort, bevor der neue Auftrag geladen wird – niemals werden
  // Daten des vorherigen Auftrags während des Ladens weiter angezeigt.
  function selectOrder(orderId) {
    if (!orderId || orderId === state.selectedPilotOrderId) return Promise.resolve();
    state.selectedPilotOrderId = orderId;
    state.overview = null;
    state.overviewLoading = true;
    state.overviewError = null;
    state.actionError = null;
    state.conflict = null;
    state.codexApprovalToken = null;
    state.codexApprovalError = null;
    render();
    return fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(orderId)).then(function (response) {
      if (state.selectedPilotOrderId !== orderId) return;
      state.overviewLoading = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.overview = response.data.overview;
        state.overviewError = null;
      } else if (response.statusCode === 404) {
        state.overview = null;
        state.overviewError = "Dieser Pilotauftrag wurde nicht gefunden.";
      } else {
        state.overview = null;
        state.overviewError = "Der Pilotauftrag konnte nicht geladen werden.";
      }
      render();
    });
  }

  // Neu laden des aktuell ausgewählten Auftrags (Auftrag Abschnitt 6):
  // ausschließlich über einen ausdrücklichen Aufruf (Button "Aktuellen
  // Stand neu laden" nach einem Konflikt, oder nach einer erfolgreichen
  // Aktion) – niemals automatisch wiederholend.
  function reloadSelectedOrder() {
    var orderId = state.selectedPilotOrderId;
    if (!orderId) return Promise.resolve();
    state.overviewLoading = true;
    render();
    return fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(orderId)).then(function (response) {
      if (state.selectedPilotOrderId !== orderId) return;
      state.overviewLoading = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.overview = response.data.overview;
        state.overviewError = null;
        state.conflict = null;
        state.actionError = null;
      } else if (response.statusCode === 404) {
        state.overview = null;
        state.overviewError = "Dieser Pilotauftrag wurde nicht gefunden.";
      } else {
        state.overviewError = "Der Pilotauftrag konnte nicht geladen werden.";
      }
      render();
      return loadOrdersList();
    });
  }

  // -----------------------------------------------------------------------
  // Anlage (Auftrag Abschnitt 3): rein clientseitige Vollständigkeitsprüfung
  // verhindert einen unnötigen Request; die Serviceschicht bleibt die
  // maßgebliche, zusätzliche Prüfung (400 bei unvollständigen Eingaben).
  // Nach Erfolg: Liste aktualisieren, neuen Auftrag auswählen, KEINE
  // automatische Ausführung, KEINE automatische Freigabe.
  // -----------------------------------------------------------------------

  function validateCreateInput(input) {
    var errors = [];
    if (!isNonEmptyString(input.title)) errors.push("Titel");
    if (!isNonEmptyString(input.desiredOutcome)) errors.push("gew\u00fcnschtes Ergebnis");
    if (!isNonEmptyString(input.requestedBy)) errors.push("angefordert von");
    if (!isNonEmptyStringArray(input.qualityCriteria)) errors.push("Qualit\u00e4tskriterien");
    if (!isNonEmptyStringArray(input.allowedTools)) errors.push("erlaubte Werkzeuge");
    if (!isNonEmptyStringArray(input.forbiddenActions)) errors.push("verbotene Aktionen");
    if (!isNonEmptyStringArray(input.requiredApprovals)) errors.push("erforderliche Freigaben");
    if (!isNonEmptyString(input.timeframe)) errors.push("Zeitrahmen");
    return errors;
  }

  function submitCreateOrder(input) {
    var errors = validateCreateInput(input || {});
    if (errors.length > 0) {
      state.createError = "Bitte vervollst\u00e4ndigen: " + errors.join(", ") + ".";
      render();
      return Promise.resolve();
    }
    state.creating = true;
    state.createError = null;
    render();
    return fetchJson("/api/pilot-work-order/orders", { method: "POST", body: JSON.stringify(input) }).then(function (response) {
      state.creating = false;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        var overview = response.data.overview;
        state.createError = null;
        state.createOpen = false;
        state.overview = overview;
        state.selectedPilotOrderId = overview.order.id;
        state.overviewError = null;
        state.actionError = null;
        state.conflict = null;
        render();
        return loadOrdersList();
      }
      state.createError = (response.data && response.data.message) || "Der Pilotauftrag konnte nicht angelegt werden.";
      render();
    });
  }

  function gatherCreateFormInput() {
    function value(id) {
      var el = byId(id);
      return el ? String(el.value || "") : "";
    }
    function lines(id) {
      return value(id)
        .split("\n")
        .map(function (line) {
          return line.trim();
        })
        .filter(Boolean);
    }
    return {
      title: value("pilot-order-create-title").trim(),
      desiredOutcome: value("pilot-order-create-desired-outcome").trim(),
      requestedBy: value("pilot-order-create-requested-by").trim(),
      qualityCriteria: lines("pilot-order-create-quality-criteria"),
      allowedTools: lines("pilot-order-create-allowed-tools"),
      forbiddenActions: lines("pilot-order-create-forbidden-actions"),
      requiredApprovals: lines("pilot-order-create-required-approvals"),
      timeframe: value("pilot-order-create-timeframe").trim(),
    };
  }

  // -----------------------------------------------------------------------
  // Aktionen (Auftrag Abschnitt 5/6): verwenden IMMER die pilotOrderId der
  // aktuellen Auswahl und die zuletzt geladene revision als
  // expectedRevision. Während eine Aktion läuft, wird sie nicht erneut
  // ausgelöst (actionInFlight). Bei Erfolg wird der Auftrag neu geladen; bei
  // einem 409-Konflikt wird NICHTS überschrieben und NICHTS automatisch
  // wiederholt – nur eine verständliche Konfliktanzeige mit Neuladen-Aktion.
  // -----------------------------------------------------------------------

  function runOrderAction(action, extraBody) {
    if (state.actionInFlight) return Promise.resolve();
    if (!state.selectedPilotOrderId || !state.overview) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    var expectedRevision = state.overview.order.revision;
    state.actionInFlight = true;
    state.actionError = null;
    render();
    var body = Object.assign({}, extraBody || {}, { expectedRevision: expectedRevision });
    return postAction(pilotOrderId, action, body).then(function (response) {
      state.actionInFlight = false;
      if (state.selectedPilotOrderId !== pilotOrderId) {
        // Auswahl hat sich während der laufenden Aktion geändert: das
        // Ergebnis betrifft einen nicht mehr angezeigten Auftrag und wird
        // verworfen (niemals Daten eines anderen Auftrags überschreiben).
        return;
      }
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.actionError = null;
        state.conflict = null;
        return reloadSelectedOrder();
      }
      if (response.statusCode === 409) {
        var details = response.data || {};
        state.conflict = {
          pilotOrderId: details.pilotOrderId || pilotOrderId,
          expectedRevision: details.expectedRevision,
          currentRevision: details.currentRevision,
          message:
            "Dieser Auftrag wurde zwischenzeitlich ver\u00e4ndert. Der aktuelle Stand wurde noch nicht \u00fcberschrieben. " +
            "Bitte laden Sie den Auftrag neu und pr\u00fcfen Sie die n\u00e4chste Aktion.",
        };
        render();
        return;
      }
      state.actionError = (response.data && response.data.message) || "Aktion ist im aktuellen Zustand nicht m\u00f6glich.";
      render();
    });
  }

  // Phase 7 (Schwerpunkt 6/9, "keine Codex-Ausführung durch einen unklaren
  // Ein-Klick-Start ohne notwendige Freigabe"): zwei ausdrücklich getrennte
  // Schritte. Schritt 1 fordert einen kurzlebigen, einmaligen
  // Freigabe-Token an (kein Agentenlauf, keine Auftragsänderung). Erst wenn
  // dieser Token vorliegt, wird die zweite Schaltfläche ("Codex-Agentenlauf
  // jetzt starten") überhaupt aktiv.
  function requestCodexApproval() {
    if (state.codexApprovalInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    state.codexApprovalInFlight = true;
    state.codexApprovalError = null;
    render();
    return postAction(pilotOrderId, "request-codex-run-approval", { presetId: CODEX_AGENT_EXECUTION_PRESET_ID }).then(function (response) {
      state.codexApprovalInFlight = false;
      if (state.selectedPilotOrderId !== pilotOrderId) return;
      if (response.statusCode === 200 && response.data && response.data.ok && response.data.approvalToken) {
        state.codexApprovalToken = response.data.approvalToken;
        state.codexApprovalError = null;
      } else {
        state.codexApprovalToken = null;
        state.codexApprovalError = (response.data && response.data.message) || "Freigabe konnte nicht angefordert werden.";
      }
      render();
    });
  }

  // Der Freigabe-Token ist per Definition genau einmal verwendbar (siehe
  // pilot-agent-execution-service.js#consumeCodexRunApproval) – nach JEDEM
  // Startversuch (Erfolg oder Fehlschlag) wird er lokal verworfen, niemals
  // erneut angezeigt oder automatisch nachgefordert.
  function runCodexAgentExecution() {
    var tokenUsed = state.codexApprovalToken;
    if (!tokenUsed) return Promise.resolve();
    state.codexApprovalToken = null;
    return runOrderAction("start-agent-execution", { presetId: CODEX_AGENT_EXECUTION_PRESET_ID, approvalToken: tokenUsed });
  }

  var PRIMARY_ACTIONS_WITHOUT_CONFIRMATION = ["mark-ready-for-approval", "start-execution", "submit-for-review", "reopen-from-returned", "unblock-order"];

  // -----------------------------------------------------------------------
  // Rendering – "Oben arbeiten": Auftragsauswahl/-anlage, dann Status/
  // nächster Schritt/wichtigste Aktion/Konflikt. "Unten nachschauen":
  // Agentenzuordnung, Auftragsdetails, Rollenübergaben, Audit-Trail.
  // -----------------------------------------------------------------------

  function renderOrderListRow(order) {
    var isSelected = order.id === state.selectedPilotOrderId;
    var isCanonical = order.id === CANONICAL_PILOT_ORDER_ID;
    return (
      '<button type="button" class="pilot-order-row' +
      (isSelected ? " is-selected" : "") +
      '" data-action="select-order" data-order-id="' +
      escapeHtml(order.id) +
      '" aria-pressed="' +
      (isSelected ? "true" : "false") +
      '">' +
      '<span class="pilot-order-row-title">' +
      escapeHtml(order.title) +
      (isCanonical ? ' <span class="pilot-order-canonical-badge">Kanonisch</span>' : "") +
      "</span>" +
      '<span class="pilot-order-row-meta">' +
      '<span class="pilot-order-row-id">' +
      escapeHtml(order.id) +
      "</span>" +
      "<span>" +
      escapeHtml(order.statusLabel) +
      "</span>" +
      "<span>Rev. " +
      escapeHtml(String(order.revision)) +
      "</span>" +
      "<span>" +
      escapeHtml(formatTimestamp(order.updatedAt)) +
      "</span>" +
      "</span>" +
      "</button>"
    );
  }

  function createFormField(id, label, tag) {
    if (tag === "textarea") {
      return '<label for="' + id + '">' + escapeHtml(label) + '</label><textarea id="' + id + '" rows="2"></textarea>';
    }
    return '<label for="' + id + '">' + escapeHtml(label) + '</label><input id="' + id + '" type="text" />';
  }

  function renderCreateForm() {
    return (
      '<div class="pilot-order-create-form">' +
      createFormField("pilot-order-create-title", "Titel", "input") +
      createFormField("pilot-order-create-desired-outcome", "Gew\u00fcnschtes Ergebnis", "textarea") +
      createFormField("pilot-order-create-requested-by", "Angefordert von", "input") +
      createFormField("pilot-order-create-quality-criteria", "Qualit\u00e4tskriterien (eine Zeile je Kriterium)", "textarea") +
      createFormField("pilot-order-create-allowed-tools", "Erlaubte Werkzeuge (eine Zeile je Werkzeug)", "textarea") +
      createFormField("pilot-order-create-forbidden-actions", "Verbotene Aktionen (eine Zeile je Aktion)", "textarea") +
      createFormField("pilot-order-create-required-approvals", "Erforderliche Freigaben (eine Zeile je Freigabe)", "textarea") +
      createFormField("pilot-order-create-timeframe", "Zeitrahmen", "input") +
      (state.createError ? '<p class="pilot-work-order-action-error">' + escapeHtml(state.createError) + "</p>" : "") +
      '<button type="button" class="primary-button" data-action="submit-create-order"' +
      (state.creating ? " disabled" : "") +
      ">" +
      (state.creating ? "Wird angelegt\u2026" : "Pilotauftrag anlegen") +
      "</button>" +
      "</div>"
    );
  }

  function renderOrderListOutput() {
    var container = byId("pilot-work-order-list-output");
    if (!container) return;
    var html = "";
    if (state.ordersLoading && state.orders.length === 0) {
      html += "<p>Lade Pilotauftr\u00e4ge\u2026</p>";
    } else if (state.ordersError && state.orders.length === 0) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.ordersError) + "</p>";
    } else {
      html += '<div class="pilot-order-list" role="listbox" aria-label="Pilotauftr\u00e4ge">' + state.orders.map(renderOrderListRow).join("") + "</div>";
    }
    html +=
      '<div class="pilot-order-create">' +
      '<button type="button" class="secondary-button" data-action="toggle-create-form">' +
      (state.createOpen ? "Anlage abbrechen" : "Neuen Pilotauftrag anlegen") +
      "</button>" +
      (state.createOpen ? renderCreateForm() : "") +
      "</div>";
    container.innerHTML = html;
  }

  function renderHead(overview) {
    var isCanonical = overview.order.id === CANONICAL_PILOT_ORDER_ID;
    return (
      '<div class="pilot-work-order-head">' +
      '<p class="eyebrow">Pilotbetrieb \u00b7 Drei-Agenten-Auftrag' +
      (isCanonical ? ' \u00b7 <strong class="pilot-order-canonical-badge">Kanonischer Pilotauftrag</strong>' : "") +
      "</p>" +
      "<h3>" + escapeHtml(overview.order.title) + "</h3>" +
      "<p>" + escapeHtml(overview.order.desiredOutcome) + "</p>" +
      "</div>"
    );
  }

  function renderFacts(overview) {
    var progress = overview.progress || { rolesPassed: 0, rolesTotal: 3 };
    var rows = [
      ["Pilotauftrag-ID", escapeHtml(overview.order.id)],
      ["Revision", escapeHtml(String(overview.order.revision))],
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

  function renderConflictBanner(conflict) {
    if (!conflict) return "";
    var revisionInfo = "";
    if (conflict.expectedRevision !== undefined && conflict.expectedRevision !== null) {
      revisionInfo += " Erwartete Revision: " + escapeHtml(String(conflict.expectedRevision)) + ".";
    }
    if (conflict.currentRevision !== undefined && conflict.currentRevision !== null) {
      revisionInfo += " Aktuelle Revision: " + escapeHtml(String(conflict.currentRevision)) + ".";
    }
    return (
      '<div class="pilot-work-order-conflict" role="alert">' +
      "<p><strong>Revisionskonflikt.</strong> " + escapeHtml(conflict.message) + revisionInfo + "</p>" +
      '<button type="button" data-action="reload-after-conflict">Aktuellen Stand neu laden</button>' +
      "</div>"
    );
  }

  function renderPrimaryAction(overview) {
    var status = overview.status;
    var button = "";
    var disabledAttr = state.actionInFlight ? " disabled" : "";
    if (status === "DRAFT") {
      button = '<button type="button" data-action="mark-ready-for-approval"' + disabledAttr + ">Zur Jamal-Freigabe vorlegen</button>";
    } else if (status === "READY_FOR_JAMAL_APPROVAL") {
      button = '<button type="button" data-action="approve-for-execution"' + disabledAttr + ">Ausf\u00fchrung freigeben</button>";
    } else if (status === "APPROVED_FOR_EXECUTION") {
      button = '<button type="button" data-action="start-execution"' + disabledAttr + ">Ausf\u00fchrung starten</button>";
    } else if (status === "IN_EXECUTION") {
      button = '<button type="button" data-action="submit-for-review"' + disabledAttr + ">Zur Abschlusspr\u00fcfung vorlegen</button>";
    } else if (status === "READY_FOR_REVIEW") {
      button = '<button type="button" data-action="approve-completion"' + disabledAttr + ">Ergebnis abnehmen</button>";
    } else if (status === "RETURNED") {
      button = '<button type="button" data-action="reopen-from-returned"' + disabledAttr + ">Erneut als Entwurf starten</button>";
    } else if (status === "BLOCKED") {
      button = '<button type="button" data-action="unblock-order"' + disabledAttr + ">Entsperren (zur\u00fcckgeben)</button>";
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

  // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): kleine, additive
  // Ausführungssektion. Zeigt Agent/Rolle, Runner, Start-/Endzeit,
  // Ausführungsstatus, das tatsächliche Ergebnis nach Abschluss und einen
  // verständlichen technischen Fehler. Die Startschaltfläche ist nur
  // während IN_EXECUTION sichtbar und wird – wie jede andere Aktion – über
  // das bestehende actionInFlight-Muster vor Mehrfachauslösung geschützt.
  // Kein automatischer nächster Lauf, keine automatische Freigabe.
  //
  // Ehrliche Einordnung für den Nutzer (Korrekturlauf vor Commit): die
  // Überschrift "Agentenlauf (lokaler deterministischer Runner)" macht
  // bewusst sichtbar, dass dies ein technisch echter, tatsächlich
  // ausgeführter und dauerhaft persistierter Lauf ist – aber KEIN
  // KI-Agentenaufruf (kein Modellaufruf, kein Codex, kein Netzwerk). Ein
  // Handoff-Fehlschlag (siehe renderAgentExecutionRun) wird deutlich vom
  // technischen Runner-Erfolg unterschieden, niemals als Runner-Fehler
  // dargestellt.
  var AGENT_EXECUTION_PRESET_ID = "analyze-pilot-structure";
  // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
  // Codex-Anbindung"): eigenes, striktes Preset für den echten,
  // ausschließlich lesenden Codex-Agentenlauf (siehe
  // pilot-agent-execution-service.js#PILOT_AGENT_TASK_PRESETS).
  var CODEX_AGENT_EXECUTION_PRESET_ID = "codex-analyze-pilot-structure";

  function renderAgentExecutionStatusLabel(status) {
    if (status === "RUNNING") return "L\u00e4uft\u2026";
    if (status === "SUCCEEDED") return "Erfolgreich abgeschlossen";
    if (status === "FAILED") return "Fehlgeschlagen";
    return escapeHtml(String(status || ""));
  }

  // Phase 7 – wahrheitsgemäße Runner-/KI-Anzeige (Schwerpunkt 9), für JEDEN
  // Lauf (lokal oder Codex): tatsächlicher Runner, ob KI ausgeführt wurde,
  // ob ein Fallback verwendet wurde, Timeout/Abbruch. Für den bestehenden
  // lokalen Runner ändert sich dadurch nur die sichtbare Zeile, niemals das
  // zugrunde liegende Verhalten.
  function renderAgentExecutionRun(run) {
    var lines = [
      "<li>",
      "<strong>" + escapeHtml(run.taskTitle) + "</strong> \u2013 " + escapeHtml(run.pilotRoleLabel || run.pilotRole),
      "<br>Status: " + renderAgentExecutionStatusLabel(run.status),
      "<br>Angeforderter Runner: " + escapeHtml(run.requestedRunnerKind || "") + " \u00b7 Tats\u00e4chlicher Runner: " + escapeHtml(run.actualRunnerKind || ""),
      "<br>Runner: " + escapeHtml(run.runnerLabel || run.runnerId),
      "<br>KI ausgef\u00fchrt: " + (run.aiExecuted ? "ja" : "nein") + " \u00b7 Fallback verwendet: " + (run.fallbackUsed ? "ja" : "nein"),
      run.modelLabel ? "<br>Modell: " + escapeHtml(run.modelLabel) + (run.runnerVersion ? " (" + escapeHtml(run.runnerVersion) + ")" : "") : "",
      run.timedOut ? '<br><span class="pilot-work-order-action-error">Lauf wurde durch Timeout beendet.</span>' : "",
      run.cancelledRun ? '<br><span class="pilot-work-order-action-error">Lauf wurde abgebrochen (Cancel).</span>' : "",
      "<br>Gestartet: " + escapeHtml(formatTimestamp(run.startedAt)) + " \u00b7 Beendet: " + escapeHtml(formatTimestamp(run.finishedAt)),
    ];
    // Korrektur 2 (unabhängiges Review, Kategorie B, "Secret-Redaktion
    // fachlich nachvollziehbar machen"): der feste Hinweistext muss überall
    // sichtbar sein, wo eine tatsächlich redigierte Codex-Antwort angezeigt
    // wird. Enthält niemals einen Secret- oder Tokenwert, ausschließlich
    // den serverseitig festgelegten Hinweissatz.
    if (run.status === "SUCCEEDED" && run.resultSummary && run.resultSummary.secretRedactionApplied) {
      lines.push(
        '<br><span class="pilot-work-order-action-error">' +
          escapeHtml(run.resultSummary.secretRedactionNotice || "Ergebnis wurde aus Sicherheitsgründen redigiert und kann fachlich verkürzt sein.") +
          "</span>",
      );
    }
    if (run.status === "SUCCEEDED" && run.resultRawText) {
      lines.push("<br>Ergebnis:<br><pre class=\"pilot-agent-execution-result\">" + escapeHtml(run.resultRawText) + "</pre>");
    }
    if (run.status === "FAILED" && run.errorMessage) {
      lines.push('<br><span class="pilot-work-order-action-error">Technischer Fehler: ' + escapeHtml(run.errorMessage) + "</span>");
    }
    // Phase 7, Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern"):
    // zusätzlich zum bereits oben angezeigten errorMessage-Fließtext werden
    // die strukturierten, bereits sicher redigierten/begrenzten
    // Diagnosefelder eines fehlgeschlagenen CODEX_READ_ONLY-Laufs sichtbar
    // gemacht (siehe pilot-agent-execution-service.js#
    // buildFailedRunResultSummary) – ausschließlich lesend, kein
    // UI-Redesign, keine neue Aktion.
    if (run.status === "FAILED" && run.resultSummary && run.resultSummary.diagnostics) {
      var diag = run.resultSummary.diagnostics;
      var diagFacts = [];
      if (diag.exitCode !== null && diag.exitCode !== undefined) {
        diagFacts.push("Exit-Code: " + escapeHtml(String(diag.exitCode)));
      }
      if (diag.signal) {
        diagFacts.push("Signal: " + escapeHtml(String(diag.signal)));
      }
      if (diag.reasonCode) {
        diagFacts.push("Ursache: " + escapeHtml(String(diag.reasonCode)));
      }
      if (diagFacts.length > 0) {
        lines.push("<br>" + diagFacts.join(" \u00b7 "));
      }
      lines.push(
        '<br><span class="pilot-work-order-action-error">' +
          escapeHtml(run.resultSummary.diagnosticNotice || "Sichere technische Diagnose \u2013 m\u00f6glicherweise gek\u00fcrzt und redigiert.") +
          "</span>",
      );
    }
    // Korrekturlauf vor Commit ("Ergebnis darf bei Handoff-Konflikt nicht
    // verloren gehen"): Stufe B (fachliche Rollenübergabe) wird bewusst
    // getrennt vom Runstatus dargestellt. Ein Handoff-Fehlschlag ist NIEMALS
    // ein technischer Runner-Fehler – der Runner-Erfolg (Status oben,
    // Ergebnis) bleibt davon unberührt sichtbar.
    if (run.status === "SUCCEEDED" && run.handoffStatus === "FAILED") {
      lines.push(
        '<br><span class="pilot-work-order-action-error">Rollen\u00fcbergabe fehlgeschlagen (technischer Runner-Lauf bleibt erfolgreich): ' +
          escapeHtml(run.handoffErrorMessage || "unbekannter Grund") +
          "</span>",
      );
    }
    lines.push("</li>");
    return lines.join("");
  }

  // Phase 7 (Schwerpunkt 9, "API und Cockpit") – additive Codex-Sektion:
  // zeigt Codex-Verfügbarkeit, den ausdrücklichen Hinweis auf externen
  // KI-/Netzwerkzugriff und den zweistufigen Freigabeablauf. Bewusst KEIN
  // Ein-Klick-Start: die Start-Schaltfläche bleibt so lange deaktiviert,
  // bis ein frischer Freigabe-Token vorliegt (siehe requestCodexApproval/
  // runCodexAgentExecution oben).
  function renderCodexAgentExecutionSection(overview) {
    var runs = overview.agentExecutionRuns || [];
    var hasActiveRun = runs.some(function (run) {
      return run.status === "RUNNING";
    });
    var availability = overview.codexAvailability || { available: false, authenticated: false };
    var html = "<h4>Codex-Agentenlauf (echter, isolierter Read-Only-KI-Lauf)</h4>";
    html +=
      "<p>Codex verf\u00fcgbar: " +
      (availability.available ? "ja" : "nein") +
      " \u00b7 authentifiziert: " +
      (availability.authenticated ? "ja" : "nein") +
      (availability.version ? " \u00b7 Version: " + escapeHtml(String(availability.version).split("\n")[0]) : "") +
      "</p>";
    html += "<p>Dieser Lauf erfordert externen KI-/Netzwerkzugriff (networkRequired/externalAiRequired) und Jamals ausdr\u00fcckliche, einmalige Freigabe.</p>";
    // Verbindliche Sicherheitsinformation f\u00fcr Jamal (Korrekturlauf vor dem
    // echten Referenzlauf, unabh\u00e4ngiges Review Kategorie B): der isolierte
    // Workspace und "--sandbox read-only" verhindern nachweislich \u00c4nderungen
    // am echten Repository (siehe execution-codex-adapter-readonly.js/
    // pilot-agent-codex-workspace.js), sind aber KEINE vollst\u00e4ndige
    // Betriebssystem-Leseisolation \u2013 die Codex-CLI bzw. der Modellkanal
    // k\u00f6nnte technisch m\u00f6glicherweise weitere lokale, lesbare Dateien
    // erreichen. Die Dateiallowlist ist deshalb zus\u00e4tzlich eine verbindliche
    // AUFTRAGSANWEISUNG an das Modell, kein technisch erzwungener Schutzwall
    // gegen jeden denkbaren Lesezugriff. Deshalb bleibt jeder Codex-Lauf an
    // eine bewusste Einzelfreigabe durch Jamal gebunden \u2013 niemals `.env`,
    // `.env.local` oder andere Secrets bewusst in eine Allowlist aufnehmen.
    html +=
      '<p class="pilot-work-order-action-error">Sicherheitshinweis: Der isolierte Workspace und der Read-Only-Sandboxmodus verhindern ' +
      "nachweislich \u00c4nderungen am echten Repository. Sie sind jedoch KEINE vollst\u00e4ndige Betriebssystem-Leseisolation \u2013 die Codex-CLI " +
      "k\u00f6nnte technisch m\u00f6glicherweise weitere lokale, lesbare Dateien erreichen. Die Dateiallowlist ist deshalb zus\u00e4tzlich eine " +
      "verbindliche Auftragsanweisung, kein vollst\u00e4ndiger technischer Leseschutz. Deshalb erfordert jeder Codex-Lauf weiterhin eine " +
      "bewusste Einzelfreigabe durch Jamal \u2013 niemals .env, .env.local oder andere Secrets bewusst als erlaubte Dateien aufnehmen.</p>";
    if (overview.status !== "IN_EXECUTION") {
      html += "<p>Ein Codex-Agentenlauf ist nur w\u00e4hrend \u201eIn Ausf\u00fchrung\u201c m\u00f6glich.</p>";
      return html;
    }
    var canRequestApproval = availability.available && availability.authenticated && !hasActiveRun && !state.codexApprovalInFlight;
    html +=
      '<button type="button" data-action="request-codex-run-approval"' +
      (canRequestApproval ? "" : " disabled") +
      ">Freigabe f\u00fcr Codex-Lauf anfordern (einmalig, kurzlebig)</button>";
    if (state.codexApprovalError) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.codexApprovalError) + "</p>";
    }
    var canStart = Boolean(state.codexApprovalToken) && !state.actionInFlight && !hasActiveRun;
    html +=
      ' <button type="button" data-action="start-codex-agent-execution"' +
      (canStart ? "" : " disabled") +
      ">Codex-Agentenlauf jetzt starten (mit Freigabe)</button>";
    if (state.codexApprovalToken) {
      html += "<p>Freigabe liegt vor \u2013 gilt ausschlie\u00dflich f\u00fcr genau diesen einen Start.</p>";
    }
    return html;
  }

  function renderAgentExecutionSection(overview) {
    var runs = overview.agentExecutionRuns || [];
    var hasActiveRun = runs.some(function (run) {
      return run.status === "RUNNING";
    });
    var html = "<h4>Agentenlauf (lokaler deterministischer Runner)</h4>";
    if (overview.status === "IN_EXECUTION") {
      var disabled = state.actionInFlight || hasActiveRun;
      html +=
        '<button type="button" data-action="start-agent-execution"' +
        (disabled ? " disabled" : "") +
        ">Agentenlauf starten (Technische Pilotstruktur analysieren)</button>";
    } else {
      html += "<p>Ein Agentenlauf ist nur w\u00e4hrend \u201eIn Ausf\u00fchrung\u201c m\u00f6glich.</p>";
    }
    html += renderCodexAgentExecutionSection(overview);
    if (runs.length === 0) {
      html += "<p>Noch kein Agentenlauf gestartet.</p>";
    } else {
      html += "<ol>" + runs.map(renderAgentExecutionRun).join("") + "</ol>";
    }
    return html;
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

  // Phase 5 (Auftrag Abschnitt 4 "Auftragsdetail"/"8. Audit-Trail"): eine
  // kompakte, auftragsbezogene Verlaufsübersicht aus bereits vorhandenen
  // Overview-Daten (Anlage, jede Rollenübergabe samt Projektmanager-
  // Filterbefund, aktueller Status) – keine neue Backend-Route, keine
  // zusätzliche externe Aktion.
  function renderAuditTrail(overview) {
    var entries = [];
    entries.push({ at: overview.createdAt, label: "Pilotauftrag angelegt (Status: Entwurf)." });
    (overview.handoffs || []).forEach(function (handoff) {
      entries.push({
        at: handoff.createdAt,
        label: handoff.sequence + ". Rollen\u00fcbergabe an " + handoff.toPilotRoleLabel + " \u2013 Projektmanager-Filter: " + handoff.pmFilterStatus + ".",
      });
    });
    entries.push({ at: overview.updatedAt, label: "Aktueller Status: " + overview.statusLabel + " (Revision " + overview.order.revision + ")." });
    var items = entries
      .map(function (entry) {
        return "<li>" + escapeHtml(formatTimestamp(entry.at)) + " \u2013 " + escapeHtml(entry.label) + "</li>";
      })
      .join("");
    return "<h4>Audit-Trail (auftragsbezogen)</h4><ol>" + items + "</ol>";
  }

  function renderMeta(overview) {
    return (
      "<h4>Erstellung/Aktualisierung</h4><p>Angelegt: " + escapeHtml(formatTimestamp(overview.createdAt)) +
      "<br>Zuletzt aktualisiert: " + escapeHtml(formatTimestamp(overview.updatedAt)) + "</p>"
    );
  }

  function renderDisclaimer(overview) {
    var boundaries = overview.autonomyBoundaries || {};
    return '<p class="pilot-work-order-disclaimer">' + escapeHtml(boundaries.disclaimer || "") + "</p>";
  }

  function renderSelectedOrderOutput() {
    var output = byId("pilot-work-order-output");
    if (output) {
      if (state.overviewLoading && !state.overview) {
        output.innerHTML = "<p>Lade Pilotauftrag\u2026</p>";
      } else if (state.overviewError && !state.overview) {
        output.innerHTML = "<p>" + escapeHtml(state.overviewError) + "</p>";
      } else if (state.overview) {
        var overview = state.overview;
        var html = renderHead(overview) + renderFacts(overview) + renderRisks(overview) + renderConflictBanner(state.conflict) + renderPrimaryAction(overview);
        if (state.actionError) {
          html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.actionError) + "</p>";
        }
        html += renderDisclaimer(overview);
        output.innerHTML = html;
      } else {
        output.innerHTML = "<p>Kein Pilotauftrag ausgew\u00e4hlt.</p>";
      }
    }

    var diagnostics = byId("pilot-work-order-diagnostics-output");
    if (diagnostics) {
      if (state.overview) {
        diagnostics.innerHTML =
          renderTeam(state.overview) +
          renderOrderDetails(state.overview) +
          renderAgentExecutionSection(state.overview) +
          renderHandoffs(state.overview) +
          renderAuditTrail(state.overview) +
          renderMeta(state.overview);
      } else {
        diagnostics.innerHTML = "Keine Details verf\u00fcgbar.";
      }
    }
  }

  function render() {
    renderOrderListOutput();
    renderSelectedOrderOutput();
  }

  function isKnownPrimaryAction(action) {
    return PRIMARY_ACTIONS_WITHOUT_CONFIRMATION.indexOf(action) !== -1;
  }

  function bindActionHandlersOnce() {
    var root = byId("pilot-work-order-card");
    if (!root || root.__pilotWorkOrderBound) return;
    root.__pilotWorkOrderBound = true;
    root.addEventListener("click", function onClick(event) {
      var target = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
      if (!target) return;
      var action = target.getAttribute("data-action");
      if (action === "select-order") {
        selectOrder(target.getAttribute("data-order-id"));
      } else if (action === "toggle-create-form") {
        state.createOpen = !state.createOpen;
        state.createError = null;
        render();
      } else if (action === "submit-create-order") {
        submitCreateOrder(gatherCreateFormInput());
      } else if (action === "reload-after-conflict") {
        reloadSelectedOrder();
      } else if (action === "approve-for-execution" || action === "approve-completion") {
        state.actionError =
          "Diese Freigabe erfordert eine ausdr\u00fcckliche Best\u00e4tigung durch Jamal au\u00dferhalb dieser Schaltfl\u00e4che " +
          "(keine automatische Freigabe durch einen Agenten).";
        render();
      } else if (action === "start-agent-execution") {
        runOrderAction("start-agent-execution", { presetId: AGENT_EXECUTION_PRESET_ID });
      } else if (action === "request-codex-run-approval") {
        requestCodexApproval();
      } else if (action === "start-codex-agent-execution") {
        runCodexAgentExecution();
      } else if (isKnownPrimaryAction(action)) {
        runOrderAction(action, {});
      }
    });
  }

  var initPromise = null;

  function start() {
    bindActionHandlersOnce();
    initPromise = init();
    return initPromise;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }

  // Für pilot-work-order-command-center-ui.test.js (Phase 5, echte
  // UI-Zustandswechsel gegen ein Fake-Backend, ohne Browser). Rein additiv:
  // ändert nichts am Browser-Verhalten oben.
  if (typeof module === "object" && module.exports) {
    module.exports = {
      CANONICAL_PILOT_ORDER_ID: CANONICAL_PILOT_ORDER_ID,
      getState: function () {
        return state;
      },
      getInitPromise: function () {
        return initPromise;
      },
      start: start,
      selectOrder: selectOrder,
      reloadSelectedOrder: reloadSelectedOrder,
      submitCreateOrder: submitCreateOrder,
      validateCreateInput: validateCreateInput,
      runOrderAction: runOrderAction,
      requestCodexApproval: requestCodexApproval,
      runCodexAgentExecution: runCodexAgentExecution,
      render: render,
      escapeHtml: escapeHtml,
      CODEX_AGENT_EXECUTION_PRESET_ID: CODEX_AGENT_EXECUTION_PRESET_ID,
    };
  }
})();
