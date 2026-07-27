"use strict";
/*
 * V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
 * Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt U):
 * eigenständiges, additives Client-Skript für die neue Hauptansicht "Office
 * & Finanzen" (gleiches Grundmuster wie agent-leadership-ui.js). Spricht
 * ausschließlich die /api/office-finance/*-Routen an. Kein Umbau von
 * app.js/index.html über die neuen Container hinaus.
 *
 * UX-Leitprinzipien (Auftrag Abschnitt U): keine Textwand, progressive
 * Offenlegung über <details>, klare Warnung bei Außenwirkung, Read-only/
 * Entwurf/Schreiben sichtbar unterscheiden, keine Schaltfläche, die echten
 * Google-Zugriff vortäuscht ("Verbindung später gemeinsam einrichten" statt
 * eines nicht funktionierenden "Verbinden"-Buttons).
 */

(function () {
  var state = {
    summary: { loading: true, error: null, data: null },
    systemMap: { loading: true, error: null, data: null },
    identities: { loading: true, error: null, data: null },
    capabilities: { loading: true, error: null, data: null },
    approvalMatrix: { loading: true, error: null, data: null },
    workItems: { loading: true, error: null, data: null },
    financeHandoffs: { loading: true, error: null, data: null },
    authStatus: { loading: true, error: null, data: null },
    checklists: { loading: true, error: null, data: null },
    activeTab: "system",
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readCsrfToken() {
    return readCookie("__Host-kuz_csrf") || readCookie("kuz_dev_csrf") || "";
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
    return fetchJson("/api/office-finance/" + action, {
      method: "POST",
      body: JSON.stringify(bodyObj || {}),
    });
  }

  function renderErrorBlock(message) {
    return '<p class="jamal-canva-error" role="alert">' + escapeHtml(message || "Dieser Bereich konnte nicht geladen werden.") + "</p>";
  }

  // -------------------------------------------------------------------
  // Laden.
  // -------------------------------------------------------------------

  function loadSimple(key, url) {
    state[key].loading = true;
    render();
    return fetchJson(url).then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state[key] = { loading: false, error: (result.data && result.data.message) || "Konnte nicht geladen werden.", data: null };
      } else {
        state[key] = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadAll() {
    loadSimple("summary", "/api/office-finance/summary");
    loadSimple("systemMap", "/api/office-finance/system-map");
    loadSimple("identities", "/api/office-finance/identities");
    loadSimple("capabilities", "/api/office-finance/capabilities");
    loadSimple("approvalMatrix", "/api/office-finance/approval-matrix");
    loadSimple("workItems", "/api/office-finance/work-items");
    loadSimple("financeHandoffs", "/api/office-finance/finance-handoffs");
    loadSimple("authStatus", "/api/office-finance/authentication-status");
    loadSimple("checklists", "/api/office-finance/activation-checklists");
  }

  // -------------------------------------------------------------------
  // Kopfkarte (Auftrag Abschnitt U, oben 1-6).
  // -------------------------------------------------------------------

  function renderSummary() {
    var output = byId("office-finance-summary-output");
    if (!output) return;
    if (state.summary.loading) {
      output.innerHTML = "<p>Kompaktübersicht wird geladen…</p>";
      return;
    }
    if (state.summary.error) {
      output.innerHTML = renderErrorBlock(state.summary.error);
      return;
    }
    var d = state.summary.data;
    var decisions = (d.topDecisions || [])
      .slice(0, d.maxTopDecisions || 3)
      .map(function (text) {
        return "<li>" + escapeHtml(text) + "</li>";
      })
      .join("");
    output.innerHTML =
      '<div class="office-finance-summary-grid">' +
      '<div class="v71-card"><p class="v71-card-meta">Architektur</p><strong>Apple-first / Google-controlled</strong></div>' +
      '<div class="v71-card"><p class="v71-card-meta">Google-Kontenstatus (office@jacogbr.de)</p><strong>' +
      escapeHtml(d.googleAccountStatus) +
      "</strong></div>" +
      '<div class="v71-card"><p class="v71-card-meta">Authentifizierung ausstehend</p><strong>' +
      d.pendingAuthenticationCount +
      " Konto(en)</strong></div>" +
      '<div class="v71-card agent-leadership-decision"><p class="v71-card-meta">Wichtigste Entscheidungen (höchstens ' +
      (d.maxTopDecisions || 3) +
      ")</p>" +
      (decisions ? '<ul class="v71-detail-list">' + decisions + "</ul>" : "<strong>Keine offene Entscheidung.</strong>") +
      "</div>" +
      '<div class="v71-card agent-leadership-capability-gap"><p class="v71-card-meta">Finance-Capability-Gap</p><strong>' +
      escapeHtml(d.financeCapabilityGap.currentOverallStatus) +
      "</strong><p>" +
      escapeHtml(d.financeCapabilityGap.note) +
      "</p></div>" +
      '<div class="v71-card"><p class="v71-card-meta">Heutiger nächster Schritt</p><strong>' +
      escapeHtml(d.todayNextStep) +
      "</strong></div>" +
      "</div>" +
      '<p class="agent-leadership-boundary-note">Apple-first: kein Apple-Datenzugriff, keine Migration. Google-controlled: keine echte Verbindung, kein OAuth, keine Mail, kein Termin, keine Drive-Datei, keine Kontakte. Finance bleibt Preparation-only: keine Buchung, keine Zahlung, kein Rechnungsversand.</p>';
  }

  // -------------------------------------------------------------------
  // Systemaufteilung.
  // -------------------------------------------------------------------

  function renderSystemMap() {
    var output = byId("office-finance-system-output");
    if (!output) return;
    if (state.systemMap.loading) {
      output.innerHTML = "<p>Systemlandkarte wird geladen…</p>";
      return;
    }
    if (state.systemMap.error) {
      output.innerHTML = renderErrorBlock(state.systemMap.error);
      return;
    }
    var m = state.systemMap.data.systemMap;
    output.innerHTML =
      '<div class="office-finance-summary-grid">' +
      '<div class="v71-card"><p class="v71-card-meta">Apple (persönlich, Jamal)</p><strong>' +
      escapeHtml(m.appleWorkspace.role) +
      "</strong><p>" +
      escapeHtml(m.appleWorkspace.leadsFor.join(", ")) +
      "</p></div>" +
      '<div class="v71-card"><p class="v71-card-meta">Google Workspace (Unternehmen)</p><strong>' +
      escapeHtml(m.googleWorkspace.role) +
      "</strong><p>" +
      escapeHtml(m.googleWorkspace.leadsFor.join(", ")) +
      "</p><p>Verbindungsstatus: " +
      escapeHtml(m.googleWorkspace.connectionStatus) +
      "</p></div>" +
      "</div>" +
      '<p class="v71-note">Keine Vollmigration, keine automatische bidirektionale Synchronisation. Ausführliche Fassung: ' +
      escapeHtml(m.documentReference) +
      "</p>";
  }

  // -------------------------------------------------------------------
  // Identitäten.
  // -------------------------------------------------------------------

  function identityRowHtml(identity) {
    return (
      '<details class="v71-details">' +
      "<summary>" +
      escapeHtml(identity.emailAddress) +
      " · " +
      escapeHtml(identity.identityTypeLabel) +
      '<span class="v71-pill v71-pill-neutral"> ' +
      escapeHtml(identity.statusLabel) +
      "</span></summary>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Zweck</dt><dd>" + escapeHtml(identity.intendedPurpose) + "</dd></div>" +
      "<div><dt>Anbieter</dt><dd>" + escapeHtml(identity.provider) + "</dd></div>" +
      "<div><dt>Authentifizierung</dt><dd>" + escapeHtml(identity.authenticationState) + "</dd></div>" +
      "<div><dt>Login durch Agenten</dt><dd>" + (identity.agentDirectLoginAllowed ? "Ja" : "Nein – niemals") + "</dd></div>" +
      "<div><dt>Notiz</dt><dd>" + escapeHtml(identity.notes || "keine") + "</dd></div>" +
      "</dl>" +
      "</details>"
    );
  }

  function renderIdentities() {
    var output = byId("office-finance-identities-output");
    if (!output) return;
    if (state.identities.loading) {
      output.innerHTML = "<p>Identitäten werden geladen…</p>";
      return;
    }
    if (state.identities.error) {
      output.innerHTML = renderErrorBlock(state.identities.error);
      return;
    }
    output.innerHTML =
      '<p class="v71-note">Kein Passwort, kein Token, kein Recovery-Code wird gespeichert. Kein Agent erhält eigene Zugangsdaten.</p>' +
      state.identities.data.identities.map(identityRowHtml).join("");
  }

  // -------------------------------------------------------------------
  // E-Mail / Kalender / Dokumente / Kontakte (Fähigkeiten + Aufträge).
  // -------------------------------------------------------------------

  function capabilityRowHtml(cap) {
    return (
      '<details class="v71-details">' +
      "<summary>" +
      escapeHtml(cap.action) +
      '<span class="v71-pill v71-pill-neutral"> ' +
      escapeHtml(cap.recommendedInitialStateLabel) +
      "</span></summary>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Risiko</dt><dd>" + escapeHtml(cap.riskLevel) + "</dd></div>" +
      "<div><dt>Datensensitivität</dt><dd>" + escapeHtml(cap.dataSensitivity) + "</dd></div>" +
      "<div><dt>Lesen/Schreiben</dt><dd>" + escapeHtml(cap.readOrWrite) + "</dd></div>" +
      "<div><dt>Jamal-Freigabe erforderlich</dt><dd>" + (cap.requiresJamalApproval ? "Ja" : "Nein") + "</dd></div>" +
      "<div><dt>Zuständige Agenten</dt><dd>" + escapeHtml((cap.allowedAgentIds || []).join(", ")) + "</dd></div>" +
      "<div><dt>Aktueller Status</dt><dd>" + escapeHtml(cap.statusLabel) + " (kein echter Verbindungsversuch)</dd></div>" +
      "</dl>" +
      "</details>"
    );
  }

  function workItemRowHtml(item) {
    return (
      '<div class="agent-leadership-row">' +
      '<div class="agent-leadership-row-head"><strong>' +
      escapeHtml(item.title) +
      "</strong><span class=\"v71-pill v71-pill-neutral\">" +
      escapeHtml(item.category) +
      '</span><span class="v71-pill v71-pill-recommendation">' +
      escapeHtml(item.approvalStatus) +
      '</span><span class="v71-pill v71-pill-neutral">' +
      escapeHtml(item.executionStatus) +
      "</span></div>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Zusammenfassung</dt><dd>" + escapeHtml(item.safeSummary) + "</dd></div>" +
      "<div><dt>Owner-Agent</dt><dd>" + escapeHtml(item.ownerAgentId) + "</dd></div>" +
      "</dl>" +
      (item.approvalStatus === "READY_FOR_REVIEW" || item.approvalStatus === "DRAFT"
        ? '<div class="jamal-work-secondary-row">' +
          '<button type="button" class="secondary-button" data-workitem-action="APPROVED_FOR_EXTERNAL_ACTION" data-workitem-id="' +
          escapeHtml(item.id) +
          '">Für externe Aktion freigeben (bleibt lokal, keine echte Ausführung)</button>' +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function renderCorridorSection(outputId, capabilityCategory, workCategory) {
    var output = byId(outputId);
    if (!output) return;
    if (state.capabilities.loading || state.workItems.loading) {
      output.innerHTML = "<p>Wird geladen…</p>";
      return;
    }
    if (state.capabilities.error || state.workItems.error) {
      output.innerHTML = renderErrorBlock(state.capabilities.error || state.workItems.error);
      return;
    }
    var caps = state.capabilities.data.capabilities.filter(function (c) {
      return c.category === capabilityCategory;
    });
    var items = state.workItems.data.workItems.filter(function (w) {
      return w.category === workCategory;
    });
    output.innerHTML =
      '<details class="v71-details"><summary>Fähigkeiten (' + caps.length + ")</summary>" + caps.map(capabilityRowHtml).join("") + "</details>" +
      '<h4>Vorbereitete Aufträge (' +
      items.length +
      ")</h4>" +
      (items.length ? items.map(workItemRowHtml).join("") : '<p class="v71-note">Noch kein Auftrag in dieser Kategorie.</p>');
  }

  function renderEmail() {
    renderCorridorSection("office-finance-email-output", "GMAIL", "EMAIL");
  }
  function renderCalendar() {
    renderCorridorSection("office-finance-calendar-output", "CALENDAR", "CALENDAR");
  }
  function renderDocuments() {
    renderCorridorSection("office-finance-documents-output", "DRIVE_DOCS", "DOCUMENT");
  }
  function renderContacts() {
    renderCorridorSection("office-finance-contacts-output", "CONTACTS", "CONTACT");
  }

  // -------------------------------------------------------------------
  // Finanzen.
  // -------------------------------------------------------------------

  function handoffRowHtml(handoff) {
    return (
      '<div class="agent-leadership-row">' +
      '<div class="agent-leadership-row-head"><strong>' +
      escapeHtml(handoff.title) +
      "</strong><span class=\"v71-pill v71-pill-neutral\">" +
      escapeHtml(handoff.type) +
      '</span><span class="v71-pill v71-pill-recommendation">' +
      escapeHtml(handoff.approvalStatus) +
      "</span></div>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Quelle</dt><dd>" + escapeHtml(handoff.sourceDescription) + "</dd></div>" +
      "<div><dt>Benötigte Fachprüfung</dt><dd>" + escapeHtml(handoff.requiredSpecialist || "keine hinterlegt") + "</dd></div>" +
      "<div><dt>Ausführung gesperrt</dt><dd>Ja – keine Buchung, keine Zahlung, kein Versand</dd></div>" +
      "</dl>" +
      "</div>"
    );
  }

  function renderFinance() {
    var output = byId("office-finance-finance-output");
    if (!output) return;
    if (state.financeHandoffs.loading) {
      output.innerHTML = "<p>Finance-Handoffs werden geladen…</p>";
      return;
    }
    if (state.financeHandoffs.error) {
      output.innerHTML = renderErrorBlock(state.financeHandoffs.error);
      return;
    }
    var d = state.financeHandoffs.data;
    output.innerHTML =
      '<div class="v71-card agent-leadership-capability-gap"><p class="v71-card-meta">Finance-Capability-Gap</p><strong>' +
      escapeHtml(d.financeCapabilityGap.currentOverallStatus) +
      "</strong><p>" +
      escapeHtml(d.financeCapabilityGap.note) +
      "</p></div>" +
      "<h4>Handoffs (" +
      d.handoffCount +
      ")</h4>" +
      (d.handoffCount ? d.handoffs.map(handoffRowHtml).join("") : '<p class="v71-note">Noch kein Finance-Handoff vorbereitet.</p>');
  }

  // -------------------------------------------------------------------
  // Freigaben.
  // -------------------------------------------------------------------

  function approvalRowHtml(row) {
    return (
      "<tr><td>" +
      escapeHtml(row.action) +
      "</td><td>" +
      escapeHtml(row.currentLevel) +
      "</td><td>" +
      escapeHtml(row.recommendedInitialState) +
      "</td><td>" +
      (row.requiresJamalApproval ? "Ja" : "Nein") +
      "</td><td>" +
      (row.reversible ? "Ja" : "Nein") +
      "</td></tr>"
    );
  }

  function renderApprovals() {
    var output = byId("office-finance-approvals-output");
    if (!output) return;
    if (state.approvalMatrix.loading) {
      output.innerHTML = "<p>Freigabematrix wird geladen…</p>";
      return;
    }
    if (state.approvalMatrix.error) {
      output.innerHTML = renderErrorBlock(state.approvalMatrix.error);
      return;
    }
    var d = state.approvalMatrix.data;
    output.innerHTML =
      "<ul class=\"v71-detail-list\">" +
      d.principles.map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("") +
      "</ul>" +
      '<table class="office-finance-table"><thead><tr><th>Aktion</th><th>Aktuelle Stufe</th><th>Empfohlene Zielstufe</th><th>Jamal-Freigabe</th><th>Rückgängig</th></tr></thead><tbody>' +
      d.rows.map(approvalRowHtml).join("") +
      "</tbody></table>";
  }

  // -------------------------------------------------------------------
  // Verbindungen (Auftrag Abschnitt U: keine vortäuschende "Verbinden"-
  // Schaltfläche).
  // -------------------------------------------------------------------

  function renderConnections() {
    var output = byId("office-finance-connections-output");
    if (!output) return;
    if (state.authStatus.loading || state.checklists.loading) {
      output.innerHTML = "<p>Wird geladen…</p>";
      return;
    }
    if (state.authStatus.error || state.checklists.error) {
      output.innerHTML = renderErrorBlock(state.authStatus.error || state.checklists.error);
      return;
    }
    var pending = state.authStatus.data.pendingIdentities
      .map(function (identity) {
        return "<li>" + escapeHtml(identity.emailAddress) + " – " + escapeHtml(identity.authenticationState) + "</li>";
      })
      .join("");
    var checklists = state.checklists.data.checklists
      .map(function (c) {
        return (
          '<div class="v71-card"><p class="v71-card-meta">' +
          escapeHtml(c.documentReference) +
          "</p><strong>" +
          escapeHtml(c.title) +
          "</strong><p>Erster Schritt: " +
          escapeHtml(c.firstStep) +
          " (" +
          c.stepCount +
          " Schritte insgesamt)</p></div>"
        );
      })
      .join("");
    output.innerHTML =
      '<div class="v71-card"><p class="v71-card-meta">Authentifizierung ausstehend</p>' +
      (pending ? '<ul class="v71-detail-list">' + pending + "</ul>" : "<p>Keine offene Authentifizierung erfasst.</p>") +
      "</div>" +
      '<div class="office-finance-summary-grid">' + checklists + "</div>" +
      '<div class="jamal-work-secondary-row"><button type="button" class="secondary-button" disabled>Verbindung später gemeinsam einrichten</button></div>' +
      '<p class="agent-leadership-boundary-note">Diese Schaltfläche verbindet nichts. Eine echte Google-Verbindung erfordert einen separaten, außerhalb dieses Laufs stattfindenden Schritt mit Jamal.</p>';
  }

  // -------------------------------------------------------------------
  // Tabs.
  // -------------------------------------------------------------------

  function applyActiveTab() {
    document.querySelectorAll(".office-finance-tab").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.officeFinanceTab === state.activeTab);
    });
    document.querySelectorAll(".office-finance-panel").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.dataset.officeFinancePanel === state.activeTab);
    });
  }

  function render() {
    renderSummary();
    renderSystemMap();
    renderIdentities();
    renderEmail();
    renderCalendar();
    renderDocuments();
    renderContacts();
    renderFinance();
    renderApprovals();
    renderConnections();
    applyActiveTab();
  }

  function bindEvents() {
    var view = byId("office-finance-view");
    if (!view) return;

    var tabs = byId("office-finance-tabs");
    if (tabs) {
      tabs.addEventListener("click", function (event) {
        var button = event.target.closest("[data-office-finance-tab]");
        if (!button) return;
        state.activeTab = button.dataset.officeFinanceTab;
        applyActiveTab();
      });
    }

    view.addEventListener("click", function (event) {
      var reloadButton = event.target.closest("[data-action='reload']");
      if (reloadButton) {
        loadAll();
        return;
      }
      var workItemButton = event.target.closest("[data-workitem-action]");
      if (workItemButton) {
        workItemButton.disabled = true;
        postAction("review-office-work-item", {
          workItemId: workItemButton.dataset.workitemId,
          approvalStatus: workItemButton.dataset.workitemAction,
        }).then(function (result) {
          if (result.statusCode === 200 && result.data && result.data.ok !== false) {
            loadSimple("workItems", "/api/office-finance/work-items");
            loadSimple("summary", "/api/office-finance/summary");
          } else {
            workItemButton.disabled = false;
          }
        });
      }
    });
  }

  function init() {
    if (!byId("office-finance-view")) return;
    bindEvents();
    loadAll();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  // Für office-finance-ui.test.js (reine Quelltextprüfung, kein Browser).
  if (typeof module === "object" && module.exports) {
    module.exports = { escapeHtml: escapeHtml };
  }
})();
