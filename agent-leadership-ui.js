"use strict";
/*
 * V7.5 – Agentenorganisation, tägliches HR-Coaching und
 * Technologie-/Plugin-Marktradar (Auftrag Abschnitt L/M): eigenständiges,
 * additives Client-Skript für die neue Führungsansicht "Agenten führen"
 * (gleiches Grundmuster wie jamal-canva-ui.js/v71-ui.js). Spricht
 * ausschließlich die /api/agent-leadership/*-Routen an. Kein Umbau von
 * app.js/index.html über die neuen Container hinaus.
 *
 * UX-Leitprinzipien (Auftrag Abschnitt L): keine 25 großen Karten
 * gleichzeitig, kompakte Gruppenansicht (progressive Offenlegung über
 * <details>), Filter nach Bereich/Empfehlung/Status, pro Agent ein klarer
 * nächster Schritt, Entscheidungen oben, Details darunter.
 *
 * Sicherheits-/Autonomiegrenzen (Auftrag Abschnitt M): jede Antwort zeigt
 * ausdrücklich, dass ein HR-Vorschlag/eine Radar-Empfehlung keine
 * Autonomieänderung, Installation oder Verbindung auslöst – hier zusätzlich
 * als fester Hinweistext, unabhängig vom jeweiligen API-Antwortinhalt.
 */

(function () {
  var state = {
    summary: { loading: true, error: null, data: null },
    organization: { loading: true, error: null, data: null },
    hr: { loading: true, error: null, data: null },
    radar: { loading: true, error: null, data: null },
    fit: { loading: true, error: null, data: null },
    activeTab: "organization",
    filters: {
      orgDepartment: "",
      hrStatus: "",
      hrRecommendation: "",
      radarStatus: "",
      radarRecommendation: "",
      fitAgentId: "",
    },
    radarFormOpen: false,
  };

  var BOUNDARY_NOTE_TEXT =
    "Ein HR-Vorschlag ist keine Autonomieänderung. Eine Genehmigung verändert keine Berechtigung. Eine Radar-Empfehlung " +
    "installiert nichts und verbindet nichts. Read-only zuerst – Schreibzugriff nur in einem späteren, separaten " +
    "Freigabekorridor. Jamal bleibt Entscheider.";

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
    return fetchJson("/api/agent-leadership/" + action, {
      method: "POST",
      body: JSON.stringify(bodyObj || {}),
    });
  }

  function renderErrorBlock(message) {
    return (
      '<p class="jamal-canva-error" role="alert">' +
      escapeHtml(message || "Dieser Bereich konnte nicht geladen werden.") +
      "</p>"
    );
  }

  // -------------------------------------------------------------------
  // Laden.
  // -------------------------------------------------------------------

  function loadSummary() {
    state.summary.loading = true;
    render();
    return fetchJson("/api/agent-leadership/summary").then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state.summary = { loading: false, error: (result.data && result.data.message) || "Übersicht konnte nicht geladen werden.", data: null };
      } else {
        state.summary = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadOrganization() {
    state.organization.loading = true;
    render();
    return fetchJson("/api/agent-leadership/organization").then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state.organization = { loading: false, error: (result.data && result.data.message) || "Organisation konnte nicht geladen werden.", data: null };
      } else {
        state.organization = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadHr() {
    state.hr.loading = true;
    render();
    return fetchJson("/api/agent-leadership/hr-daily-run").then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state.hr = { loading: false, error: (result.data && result.data.message) || "HR-Lauf konnte nicht geladen werden.", data: null };
      } else {
        state.hr = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadRadar() {
    state.radar.loading = true;
    render();
    return fetchJson("/api/agent-leadership/technology-radar").then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state.radar = { loading: false, error: (result.data && result.data.message) || "Radar konnte nicht geladen werden.", data: null };
      } else {
        state.radar = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadFit() {
    state.fit.loading = true;
    render();
    var query = state.filters.fitAgentId ? "?agentId=" + encodeURIComponent(state.filters.fitAgentId) : "";
    return fetchJson("/api/agent-leadership/agent-technology-fit" + query).then(function (result) {
      if (result.statusCode !== 200 || !result.data || result.data.ok === false) {
        state.fit = { loading: false, error: (result.data && result.data.message) || "Agent-Technology-Fit konnte nicht geladen werden.", data: null };
      } else {
        state.fit = { loading: false, error: null, data: result.data };
      }
      render();
    });
  }

  function loadAll() {
    loadSummary();
    loadOrganization();
    loadHr();
    loadRadar();
    loadFit();
  }

  // -------------------------------------------------------------------
  // Rendering – Kompaktübersicht (oben sichtbar, Auftrag Abschnitt L 1-5).
  // -------------------------------------------------------------------

  function renderSummary() {
    var output = byId("agent-leadership-summary-output");
    if (!output) return;
    if (state.summary.loading) {
      output.innerHTML = "<p>Führungsübersicht wird geladen…</p>";
      return;
    }
    if (state.summary.error) {
      output.innerHTML = renderErrorBlock(state.summary.error);
      return;
    }
    var d = state.summary.data;
    var maxHints = d.maxPrioritizedHints || 3;
    var hints = (d.prioritizedAgentHints || [])
      .slice(0, maxHints)
      .map(function (hint) {
        return (
          "<li><strong>" +
          escapeHtml(hint.agentId) +
          "</strong> (" +
          escapeHtml(hint.priorityBucketLabel || hint.priorityBucket) +
          "): " +
          escapeHtml(hint.requiredJamalDecision) +
          "</li>"
        );
      })
      .join("");
    var capabilityGapHtml = d.capabilityGapHint
      ? '<div class="v71-card agent-leadership-capability-gap"><p class="v71-card-meta">Erkannte organisatorische Lücke</p><strong>' +
        escapeHtml(d.capabilityGapHint.group) +
        "</strong><p>" +
        escapeHtml(d.capabilityGapHint.note) +
        "</p></div>"
      : "";
    output.innerHTML =
      '<p class="agent-leadership-principles-header">Unternehmensleitlinien ' +
      escapeHtml(d.companyPrinciplesVersion || "1.0") +
      " · Betriebsregeln, keine Motivationsseite</p>" +
      (d.leadershipFocusNote ? '<p class="v71-note">' + escapeHtml(d.leadershipFocusNote) + "</p>" : "") +
      '<div class="agent-leadership-summary-grid">' +
      '<div class="v71-card"><p class="v71-card-meta">Agenten insgesamt</p><strong>' +
      d.agentCount +
      "</strong></div>" +
      '<div class="v71-card"><p class="v71-card-meta">Heutiger HR-Lauf</p><strong>' +
      escapeHtml(d.hrDailyRunStatusLabel) +
      "</strong></div>" +
      '<div class="v71-card"><p class="v71-card-meta">Technologie-Radar</p><strong>' +
      d.radarHint.newCandidates +
      " neue Kandidaten · " +
      d.radarHint.readyForReview +
      " prüfbereit · " +
      d.radarHint.blocked +
      " blockiert</strong></div>" +
      '<div class="v71-card agent-leadership-decision"><p class="v71-card-meta">Wichtigste heutige Entscheidung (höchstens ' +
      maxHints +
      " priorisierte Hinweise)</p><strong>" +
      escapeHtml(d.topDecision) +
      "</strong>" +
      (hints ? '<ul class="v71-detail-list">' + hints + "</ul>" : "") +
      "</div>" +
      capabilityGapHtml +
      "</div>" +
      '<p class="agent-leadership-boundary-note">' +
      escapeHtml(BOUNDARY_NOTE_TEXT) +
      "</p>";
  }

  // -------------------------------------------------------------------
  // Rendering – Organisation (Auftrag Abschnitt C/L).
  // -------------------------------------------------------------------

  function profileRowHtml(profile) {
    var tools = (profile.toolCapability || []).map(function (tool) {
      return escapeHtml(tool.displayName) + " (" + escapeHtml(tool.connectionStatus) + ")";
    });
    return (
      '<details class="v71-details">' +
      "<summary>" +
      escapeHtml(profile.name) +
      " · " +
      escapeHtml(profile.leadershipLevel) +
      (profile.isCentralOrchestrator ? " · zentraler Orchestrator" : "") +
      "</summary>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Verantwortungszweck</dt><dd>" + escapeHtml(profile.responsibilityPurpose) + "</dd></div>" +
      "<div><dt>Berichtet fachlich an</dt><dd>" + escapeHtml(profile.reportsTo) + "</dd></div>" +
      "<div><dt>Arbeitet regelmäßig mit</dt><dd>" + escapeHtml((profile.worksRegularlyWith || []).join(", ") || "keine") + "</dd></div>" +
      "<div><dt>Qualitätsverantwortung</dt><dd>" + escapeHtml(profile.qualityResponsibility) + "</dd></div>" +
      "<div><dt>Autonomierahmen</dt><dd>" + escapeHtml(profile.autonomyScope) + "</dd></div>" +
      "<div><dt>Plugin-/Werkzeugfähigkeit</dt><dd>" + (tools.length ? escapeHtml(tools.join(", ")) : "Keine hinterlegt") + "</dd></div>" +
      "<div><dt>Heutiger Entwicklungsfokus</dt><dd>" + escapeHtml(profile.developmentFocus) + "</dd></div>" +
      "<div><dt>Status</dt><dd>" + escapeHtml(profile.status) + "</dd></div>" +
      "</dl>" +
      "</details>"
    );
  }

  function renderOrganization() {
    var output = byId("agent-leadership-organization-output");
    if (!output) return;
    if (state.organization.loading) {
      output.innerHTML = "<p>Organisationsübersicht wird geladen…</p>";
      return;
    }
    if (state.organization.error) {
      output.innerHTML = renderErrorBlock(state.organization.error);
      return;
    }
    var d = state.organization.data;
    var departmentOptions = d.groups
      .map(function (group) {
        return (
          '<option value="' +
          escapeHtml(group.group) +
          '"' +
          (state.filters.orgDepartment === group.group ? " selected" : "") +
          ">" +
          escapeHtml(group.group) +
          " (" + group.agentCount + ")</option>"
        );
      })
      .join("");
    var groupsHtml = d.groups
      .filter(function (group) {
        return !state.filters.orgDepartment || state.filters.orgDepartment === group.group;
      })
      .map(function (group) {
        var profiles = d.profiles.filter(function (profile) {
          return profile.department === group.group;
        });
        var rows = profiles.length
          ? profiles.map(profileRowHtml).join("")
          : '<p class="v71-note">Keine Agenten in dieser Gruppe (Auftrag Abschnitt C: nicht künstlich befüllt).</p>';
        return (
          '<details class="v71-details agent-leadership-group-details" open>' +
          "<summary><span>" +
          escapeHtml(group.group) +
          "</span><span>" +
          group.agentCount +
          " Agent(en)</span></summary>" +
          rows +
          "</details>"
        );
      })
      .join("");
    output.innerHTML =
      '<div class="agent-leadership-filters">' +
      '<label for="agent-leadership-org-department-filter">Bereich</label>' +
      '<select id="agent-leadership-org-department-filter" data-filter="orgDepartment">' +
      '<option value="">Alle Bereiche (' +
      d.agentCount +
      " Agenten)</option>" +
      departmentOptions +
      "</select>" +
      "</div>" +
      '<p class="v71-note">Quelle: ' +
      escapeHtml(d.registrySource) +
      " · " +
      d.canonicalAgentCount +
      " kanonische Agenten · zentraler Orchestrator: " +
      escapeHtml(d.centralOrchestratorAgentId) +
      " (" +
      escapeHtml(d.projectManagerRoleName) +
      ")</p>" +
      groupsHtml;
  }

  // -------------------------------------------------------------------
  // Rendering – Heute entwickeln / Autonomie prüfen (Auftrag Abschnitt D/M).
  // -------------------------------------------------------------------

  function proposalRowHtml(proposal) {
    var isProposed = proposal.status === "PROPOSED";
    return (
      '<div class="agent-leadership-row" data-proposal-id="' +
      escapeHtml(proposal.id) +
      '">' +
      '<div class="agent-leadership-row-head">' +
      "<strong>" +
      escapeHtml(proposal.agentId) +
      "</strong>" +
      '<span class="v71-pill v71-pill-neutral">' +
      escapeHtml(proposal.hrRecommendationLabel) +
      "</span>" +
      '<span class="v71-pill ' +
      (proposal.status === "APPROVED" ? "v71-pill-direct" : proposal.status === "REJECTED" ? "v71-pill-blocked" : "v71-pill-recommendation") +
      '">' +
      escapeHtml(proposal.statusLabel) +
      "</span>" +
      '<span class="v71-pill v71-pill-neutral">PDCA: ' +
      escapeHtml(proposal.pdcaStageLabel || proposal.pdcaStage) +
      "</span>" +
      (proposal.reliabilitySignal && proposal.reliabilitySignal !== "NONE"
        ? '<span class="v71-pill v71-pill-recommendation">' + escapeHtml(proposal.reliabilitySignalLabel || proposal.reliabilitySignal) + "</span>"
        : "") +
      "</div>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Beobachtung</dt><dd>" + escapeHtml(proposal.observation) + "</dd></div>" +
      "<div><dt>Bedeutung</dt><dd>" + escapeHtml(proposal.businessMeaning) + "</dd></div>" +
      "<div><dt>Ziel</dt><dd>" + escapeHtml(proposal.desiredOutcome) + "</dd></div>" +
      "<div><dt>Kurzbefund</dt><dd>" + escapeHtml(proposal.reasoning) + "</dd></div>" +
      "<div><dt>1%-Schritt heute</dt><dd>" + escapeHtml(proposal.onePercentStep || proposal.improvementSuggestion) + "</dd></div>" +
      "<div><dt>Training</dt><dd>" + escapeHtml(proposal.trainingGoal) + " – " + escapeHtml(proposal.trainingExercise || proposal.concreteExercise) + "</dd></div>" +
      "<div><dt>Messkriterium</dt><dd>" + escapeHtml(proposal.successMetric || proposal.qualityCriterion) + "</dd></div>" +
      "<div><dt>Möglicher Spielraum</dt><dd>" + escapeHtml(proposal.possibleAutonomyExpansion) + "</dd></div>" +
      "<div><dt>Sicherheitsgrenze</dt><dd>" + escapeHtml(proposal.safetyBoundary || proposal.riskBoundary) + "</dd></div>" +
      "<div><dt>Nutzenbereich</dt><dd>" + escapeHtml(proposal.benefitAreaLabel) + " (" + escapeHtml(proposal.priorityBucketLabel) + ")</dd></div>" +
      "<div><dt>Nächste Prüfung</dt><dd>" + escapeHtml(proposal.nextReviewDate) + "</dd></div>" +
      "<div><dt>Benötigte Entscheidung</dt><dd>" + escapeHtml(proposal.requiredJamalDecision) + "</dd></div>" +
      (proposal.jamalNote ? "<div><dt>Jamals Notiz</dt><dd>" + escapeHtml(proposal.jamalNote) + "</dd></div>" : "") +
      "</dl>" +
      '<div class="agent-leadership-note-field">' +
      '<label for="note-' + escapeHtml(proposal.id) + '">Notiz (optional)</label>' +
      '<textarea id="note-' + escapeHtml(proposal.id) + '" data-proposal-note="' + escapeHtml(proposal.id) + '" rows="1" placeholder="Notiz für diesen Vorschlag"></textarea>' +
      "</div>" +
      '<div class="jamal-work-secondary-row">' +
      '<button type="button" class="secondary-button" data-hr-action="APPROVED" data-proposal-id="' + escapeHtml(proposal.id) + '"' + (proposal.status === "APPROVED" ? " disabled" : "") + ">Genehmigen</button>" +
      '<button type="button" class="secondary-button" data-hr-action="REJECTED" data-proposal-id="' + escapeHtml(proposal.id) + '"' + (proposal.status === "REJECTED" ? " disabled" : "") + ">Ablehnen</button>" +
      '<button type="button" class="secondary-button" data-hr-action="DEFERRED" data-proposal-id="' + escapeHtml(proposal.id) + '"' + (proposal.status === "DEFERRED" ? " disabled" : "") + ">Zurückstellen</button>" +
      '<button type="button" class="secondary-button" data-hr-action="REVIEWED" data-proposal-id="' + escapeHtml(proposal.id) + '"' + (isProposed ? "" : " disabled") + ">Nur geprüft markieren</button>" +
      "</div>" +
      "</div>"
    );
  }

  function renderHrFilters() {
    return (
      '<div class="agent-leadership-filters">' +
      '<label for="agent-leadership-hr-status-filter">Status</label>' +
      '<select id="agent-leadership-hr-status-filter" data-filter="hrStatus">' +
      '<option value="">Alle</option>' +
      ["PROPOSED", "REVIEWED", "APPROVED", "REJECTED", "DEFERRED"]
        .map(function (value) {
          return '<option value="' + value + '"' + (state.filters.hrStatus === value ? " selected" : "") + ">" + value + "</option>";
        })
        .join("") +
      "</select>" +
      '<label for="agent-leadership-hr-recommendation-filter">Empfehlung</label>' +
      '<select id="agent-leadership-hr-recommendation-filter" data-filter="hrRecommendation">' +
      '<option value="">Alle</option>' +
      ["KEEP_CURRENT", "TRAIN_FIRST", "RECOMMEND_SMALL_EXPANSION", "REDUCE_SCOPE", "ESCALATE"]
        .map(function (value) {
          return '<option value="' + value + '"' + (state.filters.hrRecommendation === value ? " selected" : "") + ">" + value + "</option>";
        })
        .join("") +
      "</select>" +
      "</div>"
    );
  }

  function filteredProposals() {
    if (!state.hr.data || !state.hr.data.hasRun) return [];
    return state.hr.data.run.proposals.filter(function (proposal) {
      if (state.filters.hrStatus && proposal.status !== state.filters.hrStatus) return false;
      if (state.filters.hrRecommendation && proposal.hrRecommendation !== state.filters.hrRecommendation) return false;
      return true;
    });
  }

  function renderHr() {
    var output = byId("agent-leadership-hr-output");
    if (!output) return;
    if (state.hr.loading) {
      output.innerHTML = "<p>Heutiger HR-Lauf wird geladen…</p>";
      return;
    }
    if (state.hr.error) {
      output.innerHTML = renderErrorBlock(state.hr.error);
      return;
    }
    if (!state.hr.data.hasRun) {
      output.innerHTML =
        '<div class="v71-card">' +
        "<p>Für heute wurde noch kein HR-Entwicklungslauf erzeugt. Ein Lauf erzeugt genau 25 Vorschläge – höchstens einer je Kalendertag.</p>" +
        '<div class="jamal-work-primary-row"><button type="button" class="primary-button" data-action="create-hr-run">Heutigen HR-Lauf erzeugen</button></div>' +
        "</div>";
      return;
    }
    var run = state.hr.data.run;
    var proposals = filteredProposals();
    output.innerHTML =
      '<p class="v71-note">Lauf vom ' +
      escapeHtml(run.runDate) +
      " · " +
      run.proposalCount +
      " Vorschläge · " +
      escapeHtml(run.statusLabel) +
      "</p>" +
      renderHrFilters() +
      (proposals.length
        ? proposals.map(proposalRowHtml).join("")
        : '<p class="v71-note">Kein Vorschlag entspricht dem aktuellen Filter.</p>');
  }

  function renderAutonomy() {
    var output = byId("agent-leadership-autonomy-output");
    if (!output) return;
    if (state.hr.loading) {
      output.innerHTML = "<p>Autonomieempfehlungen werden geladen…</p>";
      return;
    }
    if (state.hr.error) {
      output.innerHTML = renderErrorBlock(state.hr.error);
      return;
    }
    var note =
      '<p class="agent-leadership-boundary-note">Eine Empfehlung hier ändert noch keine tatsächliche Autonomiestufe. ' +
      "Eine spätere Änderung benötigt einen separaten, ausdrücklichen Jamal-Freigabeschritt, der in V7.5 noch nicht existiert.</p>";
    if (!state.hr.data.hasRun) {
      output.innerHTML = note + '<p class="v71-note">Noch kein heutiger HR-Lauf – siehe "Heute entwickeln".</p>';
      return;
    }
    var relevant = state.hr.data.run.proposals.filter(function (proposal) {
      return proposal.hrRecommendation === "RECOMMEND_SMALL_EXPANSION" || proposal.hrRecommendation === "ESCALATE" || proposal.hrRecommendation === "REDUCE_SCOPE";
    });
    output.innerHTML =
      note +
      (relevant.length
        ? relevant.map(proposalRowHtml).join("")
        : '<p class="v71-note">Heute keine Empfehlung mit Autonomiebezug (RECOMMEND_SMALL_EXPANSION/REDUCE_SCOPE/ESCALATE).</p>');
  }

  // -------------------------------------------------------------------
  // Rendering – Technologie-Radar (Auftrag Abschnitt F).
  // -------------------------------------------------------------------

  function radarRowHtml(item) {
    return (
      '<details class="v71-details">' +
      "<summary>" +
      escapeHtml(item.name) +
      " · " +
      escapeHtml(item.provider) +
      '<span class="v71-pill v71-pill-neutral"> ' +
      escapeHtml(item.statusLabel) +
      '</span><span class="v71-pill v71-pill-recommendation"> ' +
      escapeHtml(item.recommendationLabel) +
      "</span>" +
      "</summary>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Typ</dt><dd>" + escapeHtml(item.type) + "</dd></div>" +
      "<div><dt>Kurzbeschreibung</dt><dd>" + escapeHtml(item.shortDescription) + "</dd></div>" +
      "<div><dt>Möglicher Unternehmensnutzen</dt><dd>" + escapeHtml(item.possibleBusinessBenefit) + "</dd></div>" +
      "<div><dt>Mögliche Agenten</dt><dd>" + escapeHtml((item.possibleAgents || []).join(", ") || "keine hinterlegt") + "</dd></div>" +
      "<div><dt>Reifegrad</dt><dd>" + escapeHtml(item.maturityLevel) + "</dd></div>" +
      "<div><dt>Sicherheitsrisiko</dt><dd>" + escapeHtml(item.securityRisk) + "</dd></div>" +
      "<div><dt>Datenschutzrisiko</dt><dd>" + escapeHtml(item.privacyRisk) + "</dd></div>" +
      "<div><dt>Kostenklasse</dt><dd>" + escapeHtml(item.costClass) + "</dd></div>" +
      "<div><dt>Integrationsaufwand</dt><dd>" + escapeHtml(item.integrationEffort) + "</dd></div>" +
      "<div><dt>Vendor-Lock-in-Risiko</dt><dd>" + escapeHtml(item.vendorLockInRisk) + "</dd></div>" +
      "<div><dt>Schreibzugriff erforderlich</dt><dd>" + (item.writeAccessRequired ? "Ja" : "Nein") + "</dd></div>" +
      "<div><dt>Menschliche Freigabe erforderlich</dt><dd>" + (item.humanApprovalRequired ? "Ja" : "Nein") + "</dd></div>" +
      "<div><dt>Begründung</dt><dd>" + escapeHtml(item.reasoning) + "</dd></div>" +
      "<div><dt>Quelle</dt><dd>" + escapeHtml(item.sourceNote || "UNGEKLÄRT") + "</dd></div>" +
      "<div><dt>Signal</dt><dd>" + escapeHtml(item.signalTypeLabel) + ": " + escapeHtml(item.signalDescription) + "</dd></div>" +
      "<div><dt>Zeithorizont</dt><dd>" + escapeHtml(item.timeHorizonLabel) + "</dd></div>" +
      "<div><dt>Unsicherheit</dt><dd>" + escapeHtml(item.uncertaintyLevelLabel) + "</dd></div>" +
      "<div><dt>Heutiger Vorbereitungsschritt</dt><dd>" + escapeHtml(item.todayPreparationStep) + "</dd></div>" +
      "<div><dt>Nutzenbereich</dt><dd>" + escapeHtml(item.benefitAreaLabel) + " (" + escapeHtml(item.priorityBucketLabel) + ")</dd></div>" +
      "</dl>" +
      '<details class="v71-details"><summary>Konservatives Szenario</summary><p>' + escapeHtml(item.scenarioConservative) + "</p></details>" +
      '<details class="v71-details"><summary>Wahrscheinliches Szenario</summary><p>' + escapeHtml(item.scenarioLikely) + "</p></details>" +
      '<details class="v71-details"><summary>Dynamisches Szenario</summary><p>' + escapeHtml(item.scenarioDynamic) + "</p></details>" +
      '<p class="v71-note">Ein Szenario ist keine Prognosegarantie und löst keine Investition oder Installation aus.</p>' +
      "</details>"
    );
  }

  function renderRadarFilters() {
    return (
      '<div class="agent-leadership-filters">' +
      '<label for="agent-leadership-radar-status-filter">Status</label>' +
      '<select id="agent-leadership-radar-status-filter" data-filter="radarStatus">' +
      '<option value="">Alle</option>' +
      ["NOT_REVIEWED", "CANDIDATE", "REVIEWED", "READ_ONLY_TESTED", "PILOT", "CONNECTED"]
        .map(function (value) {
          return '<option value="' + value + '"' + (state.filters.radarStatus === value ? " selected" : "") + ">" + value + "</option>";
        })
        .join("") +
      "</select>" +
      '<label for="agent-leadership-radar-recommendation-filter">Empfehlung</label>' +
      '<select id="agent-leadership-radar-recommendation-filter" data-filter="radarRecommendation">' +
      '<option value="">Alle</option>' +
      ["WATCH", "RESEARCH", "TEST_READ_ONLY", "PILOT_WITH_APPROVAL", "NOT_RECOMMENDED", "BLOCKED"]
        .map(function (value) {
          return '<option value="' + value + '"' + (state.filters.radarRecommendation === value ? " selected" : "") + ">" + value + "</option>";
        })
        .join("") +
      "</select>" +
      "</div>"
    );
  }

  function renderRadarForm() {
    if (!state.radarFormOpen) {
      return '<div class="jamal-work-secondary-row"><button type="button" class="secondary-button" data-action="toggle-radar-form">Neuen Kandidaten lokal erfassen</button></div>';
    }
    var typeOptions = ["MODEL", "PLUGIN", "CONNECTOR", "AUTOMATION", "DESIGN_TOOL", "VIDEO_TOOL", "OFFICE_TOOL", "DATA_TOOL", "DEVELOPER_TOOL", "SECURITY_TOOL", "OTHER"]
      .map(function (value) {
        return '<option value="' + value + '">' + value + "</option>";
      })
      .join("");
    var recommendationOptions = ["WATCH", "RESEARCH", "TEST_READ_ONLY", "PILOT_WITH_APPROVAL", "NOT_RECOMMENDED", "BLOCKED"]
      .map(function (value) {
        return '<option value="' + value + '">' + value + "</option>";
      })
      .join("");
    return (
      '<form data-form="radar-create" class="v71-form">' +
      '<p class="v71-note">Lokale, strukturelle Bewertung (Auftrag Abschnitt F). Keine Webrecherche, keine Verbindung, keine Installation.</p>' +
      '<label for="radar-name">Name</label><input id="radar-name" name="name" required />' +
      '<label for="radar-provider">Anbieter</label><input id="radar-provider" name="provider" required />' +
      '<label for="radar-category">Kategorie</label><input id="radar-category" name="category" required />' +
      '<label for="radar-type">Typ</label><select id="radar-type" name="type">' + typeOptions + "</select>" +
      '<label for="radar-shortDescription">Kurzbeschreibung</label><textarea id="radar-shortDescription" name="shortDescription" rows="2" required></textarea>' +
      '<label for="radar-possibleBusinessBenefit">Möglicher Unternehmensnutzen</label><textarea id="radar-possibleBusinessBenefit" name="possibleBusinessBenefit" rows="2" required></textarea>' +
      '<label for="radar-maturityLevel">Reifegrad</label><input id="radar-maturityLevel" name="maturityLevel" required />' +
      '<label for="radar-securityRisk">Sicherheitsrisiko</label><input id="radar-securityRisk" name="securityRisk" required />' +
      '<label for="radar-privacyRisk">Datenschutzrisiko</label><input id="radar-privacyRisk" name="privacyRisk" required />' +
      '<label for="radar-costClass">Kostenklasse</label><input id="radar-costClass" name="costClass" required />' +
      '<label for="radar-integrationEffort">Integrationsaufwand</label><input id="radar-integrationEffort" name="integrationEffort" required />' +
      '<label for="radar-vendorLockInRisk">Vendor-Lock-in-Risiko</label><input id="radar-vendorLockInRisk" name="vendorLockInRisk" required />' +
      '<label for="radar-recommendation">Empfehlung</label><select id="radar-recommendation" name="recommendation">' + recommendationOptions + "</select>" +
      '<label for="radar-reasoning">Begründung</label><textarea id="radar-reasoning" name="reasoning" rows="2" required></textarea>' +
      '<label class="v71-checkbox"><input type="checkbox" name="writeAccessRequired" /> Schreibzugriff erforderlich</label>' +
      '<div class="jamal-work-primary-row"><button type="submit" class="primary-button">Lokal anlegen</button>' +
      '<button type="button" class="secondary-button" data-action="toggle-radar-form">Abbrechen</button></div>' +
      "</form>"
    );
  }

  function renderRadar() {
    var output = byId("agent-leadership-radar-output");
    if (!output) return;
    if (state.radar.loading) {
      output.innerHTML = "<p>Technologie-/Plugin-Marktradar wird geladen…</p>";
      return;
    }
    if (state.radar.error) {
      output.innerHTML = renderErrorBlock(state.radar.error);
      return;
    }
    var items = state.radar.data.items.filter(function (item) {
      if (state.filters.radarStatus && item.status !== state.filters.radarStatus) return false;
      if (state.filters.radarRecommendation && item.recommendation !== state.filters.radarRecommendation) return false;
      return true;
    });
    output.innerHTML =
      '<p class="v71-note">' +
      escapeHtml(state.radar.data.knownVendorCandidateNote) +
      "</p>" +
      renderRadarFilters() +
      (items.length ? items.map(radarRowHtml).join("") : '<p class="v71-note">Kein Eintrag entspricht dem aktuellen Filter.</p>') +
      renderRadarForm();
  }

  // -------------------------------------------------------------------
  // Rendering – Agenten & Werkzeuge (Auftrag Abschnitt G).
  // -------------------------------------------------------------------

  function fitRowHtml(fit) {
    var priorityOptions = ["LOW", "MEDIUM", "HIGH"]
      .map(function (value) {
        return '<option value="' + value + '"' + (fit.priority === value ? " selected" : "") + ">" + value + "</option>";
      })
      .join("");
    return (
      '<div class="agent-leadership-row" data-fit-id="' +
      escapeHtml(fit.id) +
      '">' +
      '<div class="agent-leadership-row-head">' +
      "<strong>" +
      escapeHtml(fit.agentName) +
      " → " +
      escapeHtml(fit.radarItemName || "UNGEKLÄRT") +
      "</strong>" +
      '<span class="v71-pill v71-pill-recommendation">' +
      escapeHtml(fit.recommendationLabel) +
      "</span>" +
      '<span class="v71-pill v71-pill-neutral">' +
      escapeHtml(fit.statusLabel) +
      "</span>" +
      "</div>" +
      '<dl class="v71-detail-list">' +
      "<div><dt>Nutzen</dt><dd>" + escapeHtml(fit.benefit) + "</dd></div>" +
      "<div><dt>Konkreter Einsatzfall</dt><dd>" + escapeHtml(fit.concreteUseCase) + "</dd></div>" +
      "<div><dt>Benötigte Berechtigungen</dt><dd>" + escapeHtml(fit.requiredPermissions) + "</dd></div>" +
      "<div><dt>Sicherheitsgrenze</dt><dd>" + escapeHtml(fit.securityBoundary) + "</dd></div>" +
      "<div><dt>Testvoraussetzung</dt><dd>" + escapeHtml(fit.testPrerequisite) + "</dd></div>" +
      "</dl>" +
      '<div class="agent-leadership-filters">' +
      '<label for="fit-priority-' + escapeHtml(fit.id) + '">Priorität</label>' +
      '<select id="fit-priority-' + escapeHtml(fit.id) + '" data-fit-priority="' + escapeHtml(fit.id) + '">' + priorityOptions + "</select>" +
      "</div>" +
      '<div class="jamal-work-secondary-row">' +
      '<button type="button" class="secondary-button" data-fit-action="REVIEWED" data-fit-id="' + escapeHtml(fit.id) + '">Geprüft</button>' +
      '<button type="button" class="secondary-button" data-fit-action="APPROVED_FOR_READ_ONLY_TEST" data-fit-id="' + escapeHtml(fit.id) + '">Für Read-only-Test freigeben</button>' +
      '<button type="button" class="secondary-button" data-fit-action="REJECTED" data-fit-id="' + escapeHtml(fit.id) + '">Ablehnen</button>' +
      '<button type="button" class="secondary-button" data-fit-action="DEFERRED" data-fit-id="' + escapeHtml(fit.id) + '">Zurückstellen</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderFit() {
    var output = byId("agent-leadership-fit-output");
    if (!output) return;
    if (state.fit.loading) {
      output.innerHTML = "<p>Agent-Technology-Fit wird geladen…</p>";
      return;
    }
    if (state.fit.error) {
      output.innerHTML = renderErrorBlock(state.fit.error);
      return;
    }
    var agentOptions = "";
    if (state.organization.data) {
      agentOptions = state.organization.data.profiles
        .map(function (profile) {
          return (
            '<option value="' +
            escapeHtml(profile.agentId) +
            '"' +
            (state.filters.fitAgentId === profile.agentId ? " selected" : "") +
            ">" +
            escapeHtml(profile.name) +
            "</option>"
          );
        })
        .join("");
    }
    output.innerHTML =
      '<div class="agent-leadership-filters">' +
      '<label for="agent-leadership-fit-agent-filter">Agent</label>' +
      '<select id="agent-leadership-fit-agent-filter" data-filter="fitAgentId">' +
      '<option value="">Alle Agenten (' +
      state.fit.data.fitCount +
      ")</option>" +
      agentOptions +
      "</select>" +
      "</div>" +
      (state.fit.data.items.length ? state.fit.data.items.map(fitRowHtml).join("") : '<p class="v71-note">Keine Zuordnung vorhanden.</p>');
  }

  // -------------------------------------------------------------------
  // Tabs (lokale Sicht, kein globaler switchView-Aufruf).
  // -------------------------------------------------------------------

  function applyActiveTab() {
    document.querySelectorAll(".agent-leadership-tab").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.leadershipTab === state.activeTab);
    });
    document.querySelectorAll(".agent-leadership-panel").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.dataset.leadershipPanel === state.activeTab);
    });
  }

  function render() {
    renderSummary();
    renderOrganization();
    renderHr();
    renderAutonomy();
    renderRadar();
    renderFit();
    applyActiveTab();
  }

  // -------------------------------------------------------------------
  // Ereignisbindung.
  // -------------------------------------------------------------------

  function radarFormValues(form) {
    function value(name) {
      var element = form.querySelector('[name="' + name + '"]');
      return element ? element.value : "";
    }
    return {
      name: value("name"),
      provider: value("provider"),
      category: value("category"),
      type: value("type"),
      shortDescription: value("shortDescription"),
      possibleBusinessBenefit: value("possibleBusinessBenefit"),
      maturityLevel: value("maturityLevel"),
      securityRisk: value("securityRisk"),
      privacyRisk: value("privacyRisk"),
      costClass: value("costClass"),
      integrationEffort: value("integrationEffort"),
      vendorLockInRisk: value("vendorLockInRisk"),
      recommendation: value("recommendation"),
      reasoning: value("reasoning"),
      writeAccessRequired: Boolean(form.querySelector('[name="writeAccessRequired"]') && form.querySelector('[name="writeAccessRequired"]').checked),
    };
  }

  function bindEvents() {
    var view = byId("agent-leadership-view");
    if (!view) return;

    var tabs = byId("agent-leadership-tabs");
    if (tabs) {
      tabs.addEventListener("click", function (event) {
        var button = event.target.closest("[data-leadership-tab]");
        if (!button) return;
        state.activeTab = button.dataset.leadershipTab;
        applyActiveTab();
      });
    }

    view.addEventListener("change", function (event) {
      var filterField = event.target.closest("[data-filter]");
      if (filterField) {
        state.filters[filterField.dataset.filter] = filterField.value;
        if (filterField.dataset.filter === "fitAgentId") {
          loadFit();
        } else {
          render();
        }
      }
    });

    view.addEventListener("click", function (event) {
      var reloadButton = event.target.closest("[data-action='reload']");
      if (reloadButton) {
        loadAll();
        return;
      }
      var createRunButton = event.target.closest("[data-action='create-hr-run']");
      if (createRunButton) {
        createRunButton.disabled = true;
        postAction("create-hr-daily-run", {}).then(function (result) {
          createRunButton.disabled = false;
          if (result.statusCode === 200 && result.data && result.data.ok !== false) {
            loadHr();
            loadSummary();
          }
        });
        return;
      }
      var toggleRadarForm = event.target.closest("[data-action='toggle-radar-form']");
      if (toggleRadarForm) {
        state.radarFormOpen = !state.radarFormOpen;
        renderRadar();
        return;
      }
      var hrActionButton = event.target.closest("[data-hr-action]");
      if (hrActionButton) {
        var proposalId = hrActionButton.dataset.proposalId;
        var noteField = view.querySelector('[data-proposal-note="' + proposalId + '"]');
        hrActionButton.disabled = true;
        postAction("review-hr-proposal", {
          proposalId: proposalId,
          status: hrActionButton.dataset.hrAction,
          jamalNote: noteField ? noteField.value : "",
        }).then(function (result) {
          if (result.statusCode === 200 && result.data && result.data.ok !== false) {
            loadHr();
            loadSummary();
          } else {
            hrActionButton.disabled = false;
          }
        });
        return;
      }
      var fitActionButton = event.target.closest("[data-fit-action]");
      if (fitActionButton) {
        var fitId = fitActionButton.dataset.fitId;
        var prioritySelect = view.querySelector('[data-fit-priority="' + fitId + '"]');
        fitActionButton.disabled = true;
        postAction("review-agent-technology-fit", {
          fitId: fitId,
          status: fitActionButton.dataset.fitAction,
          priority: prioritySelect ? prioritySelect.value : undefined,
        }).then(function (result) {
          fitActionButton.disabled = false;
          if (result.statusCode === 200 && result.data && result.data.ok !== false) {
            loadFit();
          }
        });
      }
    });

    view.addEventListener("submit", function (event) {
      var form = event.target.closest('form[data-form="radar-create"]');
      if (!form) return;
      event.preventDefault();
      var submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      postAction("upsert-radar-item", radarFormValues(form)).then(function (result) {
        if (submitButton) submitButton.disabled = false;
        if (result.statusCode === 200 && result.data && result.data.ok !== false) {
          state.radarFormOpen = false;
          loadRadar();
          loadSummary();
        }
      });
    });
  }

  function init() {
    if (!byId("agent-leadership-view")) return;
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

  // Für agent-leadership-ui.test.js (reine Quelltextprüfung, kein Browser).
  if (typeof module === "object" && module.exports) {
    module.exports = { escapeHtml: escapeHtml };
  }
})();
