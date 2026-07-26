"use strict";

// V7.1 Phase A – Chef-Modus-UI für Projektunterlagen & Wissenseingang,
// Werkzeuge & Lizenzen sowie Plugin-Gateway & Tool-Routing.
//
// Bewusst als eigenständiges, additives Skript (nicht Teil von app.js).
// Nutzt ausschließlich die neuen, additiven /api/v71/*-Routen. Keine
// Schreibaktion außer den beiden ausdrücklich vorgesehenen: Dokument
// registrieren, isolierten Test-Upload registrieren. Kein automatischer
// Start, keine externe Übertragung, keine Veröffentlichung, keine
// Zugangsdaten im Browser.

(function initV71Ui() {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let json = null;
    try {
      json = await response.json();
    } catch (_error) {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  }

  function byId(id) {
    return document.getElementById(id);
  }

  const EXECUTION_MODE_LABEL = {
    DIRECT: "direkt ausführbar",
    CONTROLLED_HANDOFF: "kontrollierte Übergabe",
    RECOMMENDATION_ONLY: "nur Empfehlung",
  };

  const PLUGIN_STATUS_LABEL = {
    AVAILABLE: "verfügbar",
    REGISTERED: "nur vorgemerkt",
    DEGRADED: "eingeschränkt",
    UNAVAILABLE: "nicht verfügbar",
    BLOCKED: "gesperrt",
  };

  function pillClass(kind) {
    const map = {
      DIRECT: "v71-pill v71-pill-direct",
      CONTROLLED_HANDOFF: "v71-pill v71-pill-handoff",
      RECOMMENDATION_ONLY: "v71-pill v71-pill-recommendation",
      AVAILABLE: "v71-pill v71-pill-direct",
      REGISTERED: "v71-pill v71-pill-recommendation",
      DEGRADED: "v71-pill v71-pill-handoff",
      UNAVAILABLE: "v71-pill v71-pill-blocked",
      BLOCKED: "v71-pill v71-pill-blocked",
      NORMAL: "v71-pill v71-pill-neutral",
      SENSITIVE: "v71-pill v71-pill-handoff",
      SECRET: "v71-pill v71-pill-blocked",
    };
    return map[kind] || "v71-pill v71-pill-neutral";
  }

  // ---------------------------------------------------------------------
  // Projektunterlagen & Wissenseingang
  // ---------------------------------------------------------------------

  let cachedProjects = [];

  async function loadProjectsForSelect() {
    if (cachedProjects.length) return cachedProjects;
    const result = await fetchJson("/api/projects");
    if (result.ok && Array.isArray(result.json?.projects)) {
      cachedProjects = result.json.projects;
    }
    return cachedProjects;
  }

  function documentStatusBadges(doc) {
    const badges = [];
    badges.push(`<span class="${pillClass(doc.classification)}">${escapeHtml(doc.classification)}</span>`);
    badges.push(`<span class="v71-pill v71-pill-neutral">${escapeHtml(doc.processingStatus)}</span>`);
    if (doc.quarantined) badges.push('<span class="v71-pill v71-pill-blocked">Quarantäne</span>');
    if (doc.externalTransferAllowed === false) {
      badges.push('<span class="v71-pill v71-pill-neutral">externe Übertragung: blockiert</span>');
    }
    return badges.join(" ");
  }

  function renderDocumentCard(doc) {
    return `
      <li class="v71-card">
        <div class="v71-card-head">
          <strong>${escapeHtml(doc.title || "Ohne Titel")}</strong>
          <span class="v71-card-meta">${escapeHtml(doc.sourceType)}</span>
        </div>
        <div class="v71-tag-row">${documentStatusBadges(doc)}</div>
        ${doc.rejectionReason ? `<p class="v71-note v71-note-warning">${escapeHtml(doc.rejectionReason)}</p>` : ""}
        <details class="v71-details">
          <summary>Details</summary>
          <dl class="v71-detail-list">
            <div><dt>Projekt</dt><dd>${escapeHtml(doc.projectId)}</dd></div>
            <div><dt>Wissensstatus</dt><dd>${escapeHtml(doc.knowledgeStatus)}</dd></div>
            <div><dt>Agentenzugriff</dt><dd>${doc.allowedAgentIds && doc.allowedAgentIds.length ? escapeHtml(doc.allowedAgentIds.join(", ")) : "keine Einschränkung hinterlegt"}</dd></div>
            <div><dt>Angelegt</dt><dd>${escapeHtml(doc.createdAt)}</dd></div>
            <div><dt>Prüfsumme</dt><dd>${doc.contentHash ? escapeHtml(doc.contentHash.slice(0, 16)) + "…" : "–"}</dd></div>
            <div><dt>Herkunft</dt><dd>${escapeHtml(doc.provenanceNote || "–")}</dd></div>
          </dl>
        </details>
      </li>`;
  }

  function projectOptions(projects, selectedId) {
    return projects
      .map(
        (project) =>
          `<option value="${escapeHtml(project.id)}" ${project.id === selectedId ? "selected" : ""}>${escapeHtml(
            project.name || project.id,
          )}</option>`,
      )
      .join("");
  }

  // Kanonisches Agentenregister ist bereits vor v71-ui.js geladen (siehe
  // Skriptreihenfolge in index.html). Keine zweite Agentenquelle, keine
  // API-Anfrage nötig.
  function agentOptions() {
    const agents = (window.AgentRegistry && window.AgentRegistry.PRODUCTIVE_AGENT_REGISTRY) || [];
    return agents
      .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name || agent.id)}</option>`)
      .join("");
  }

  let selectedDocumentsProjectId = "ki-unternehmenszentrale";

  async function renderDocumentsView() {
    const container = byId("v71-documents-output");
    if (!container) return;
    const projects = await loadProjectsForSelect();
    const documentsResult = await fetchJson(
      `/api/v71/documents?projectId=${encodeURIComponent(selectedDocumentsProjectId)}`,
    );
    const documents = documentsResult.ok && Array.isArray(documentsResult.json?.documents) ? documentsResult.json.documents : [];

    container.innerHTML = `
      <div class="v71-layout">
        <form class="panel v71-form" id="v71-document-register-form">
          <div class="section-head">
            <div><p class="eyebrow">Primäraktion</p><h3>Unterlage registrieren</h3></div>
          </div>
          <label>Projekt
            <select id="v71-document-project" name="projectId">${projectOptions(projects, selectedDocumentsProjectId)}</select>
          </label>
          <label>Titel
            <input type="text" id="v71-document-title" name="title" maxlength="200" required />
          </label>
          <div class="form-grid">
            <label>Art
              <select id="v71-document-source-type" name="sourceType">
                <option value="MANUAL_NOTE">Notiz</option>
                <option value="LOCAL_REFERENCE">Lokaler Verweis</option>
                <option value="EXTERNAL_LINK">Externer Link</option>
                <option value="CONNECTOR_REFERENCE">Connector-Referenz</option>
              </select>
            </label>
            <label>Klassifizierung
              <select id="v71-document-classification" name="classification">
                <option value="NORMAL">Normal</option>
                <option value="SENSITIVE">Sensibel</option>
                <option value="SECRET">Geheim</option>
              </select>
            </label>
          </div>
          <label>Notiz / Verweis
            <textarea id="v71-document-note" name="note" rows="3" placeholder="Notiztext oder https://-Referenz"></textarea>
          </label>
          <div class="form-grid">
            <label>Wissensstatus
              <select id="v71-document-knowledge-status" name="knowledgeStatus">
                <option value="NOT_INDEXED">Nicht indiziert</option>
                <option value="REFERENCE_ONLY">Als Wissensquelle markieren (nur Referenz)</option>
              </select>
            </label>
            <label>Agentenzugriff einschränken (optional)
              <select id="v71-document-allowed-agents" multiple size="4">${agentOptions()}</select>
            </label>
          </div>
          <p class="form-note">Leere Agentenauswahl bedeutet: keine zusätzliche Einschränkung hinterlegt.</p>
          <div class="button-row">
            <button class="primary-button" type="submit">Unterlage registrieren</button>
          </div>
          <p class="form-note" id="v71-document-register-status" aria-live="polite"></p>
        </form>

        <section class="panel v71-form">
          <div class="section-head">
            <div><p class="eyebrow">Isolierter Test-Upload</p><h3>Gegen serverseitige Fixture-Datei prüfen</h3></div>
          </div>
          <p class="form-note">
            Nur zu Testzwecken (V7.1 Phase A): registriert eine kleine, von der Zentrale selbst bereitgestellte
            Beispieldatei. Kein Datei-Upload vom Browser.
          </p>
          <div class="form-grid">
            <label>Fixture-Datei
              <select id="v71-test-upload-filename">
                <option value="sample-note.txt">sample-note.txt</option>
                <option value="sample-data.csv">sample-data.csv</option>
              </select>
            </label>
            <label>Klassifizierung
              <select id="v71-test-upload-classification">
                <option value="NORMAL">Normal</option>
                <option value="SENSITIVE">Sensibel</option>
              </select>
            </label>
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" id="v71-test-upload-button">Test-Upload registrieren</button>
          </div>
          <p class="form-note" id="v71-test-upload-status" aria-live="polite"></p>
        </section>

        <section class="panel">
          <div class="section-head">
            <div><p class="eyebrow">Bestand</p><h3>Registrierte Unterlagen (${documents.length})</h3></div>
          </div>
          ${
            documents.length
              ? `<ul class="v71-card-list">${documents.map(renderDocumentCard).join("")}</ul>`
              : `<div class="empty-state">Für dieses Projekt sind noch keine Unterlagen registriert. Nutze die Primäraktion oben.</div>`
          }
          <p class="form-note">Diese Liste ist auch als Referenz im geführten Tagesablauf (Guided Work) nutzbar.</p>
        </section>
      </div>`;

    byId("v71-document-project").addEventListener("change", (event) => {
      selectedDocumentsProjectId = event.target.value;
      renderDocumentsView();
    });

    byId("v71-document-register-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const statusEl = byId("v71-document-register-status");
      statusEl.textContent = "Wird registriert…";
      const payload = {
        projectId: byId("v71-document-project").value,
        title: byId("v71-document-title").value.trim(),
        sourceType: byId("v71-document-source-type").value,
        classification: byId("v71-document-classification").value,
      };
      const note = byId("v71-document-note").value.trim();
      if (payload.sourceType === "EXTERNAL_LINK") {
        payload.sourceReference = note;
      } else {
        payload.note = note;
      }
      const knowledgeStatus = byId("v71-document-knowledge-status").value;
      if (knowledgeStatus && knowledgeStatus !== "NOT_INDEXED") {
        payload.knowledgeStatus = knowledgeStatus;
      }
      const selectedAgentIds = Array.from(byId("v71-document-allowed-agents").selectedOptions).map((option) => option.value);
      if (selectedAgentIds.length) {
        payload.allowedAgentIds = selectedAgentIds;
      }
      const result = await fetchJson("/api/v71/documents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (result.ok && result.json?.ok) {
        statusEl.textContent = result.json.isDuplicate
          ? "Bereits vorhanden – bestehende Unterlage referenziert."
          : "Registriert.";
        renderDocumentsView();
      } else {
        statusEl.textContent = result.json?.message || "Registrierung nicht möglich.";
      }
    });

    byId("v71-test-upload-button").addEventListener("click", async () => {
      const statusEl = byId("v71-test-upload-status");
      statusEl.textContent = "Wird geprüft und registriert…";
      const result = await fetchJson("/api/v71/documents/test-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedDocumentsProjectId,
          sourceFilename: byId("v71-test-upload-filename").value,
          classification: byId("v71-test-upload-classification").value,
        }),
      });
      if (result.ok && result.json?.ok) {
        statusEl.textContent = result.json.isDuplicate ? "Bereits vorhanden (gleicher Inhalt)." : "Test-Upload registriert und geprüft.";
        renderDocumentsView();
      } else {
        statusEl.textContent = result.json?.reason || result.json?.message || "Test-Upload abgewiesen.";
      }
    });
  }

  // ---------------------------------------------------------------------
  // Werkzeuge & Lizenzen
  // ---------------------------------------------------------------------

  function renderToolCard(tool) {
    return `
      <li class="v71-card">
        <div class="v71-card-head">
          <strong>${escapeHtml(tool.displayName)}</strong>
          <span class="v71-card-meta">${escapeHtml(tool.category)}</span>
        </div>
        <div class="v71-tag-row">
          <span class="${pillClass(tool.executionMode)}">${escapeHtml(EXECUTION_MODE_LABEL[tool.executionMode] || tool.executionMode)}</span>
          <span class="v71-pill v71-pill-neutral">Verbindung: ${escapeHtml(tool.connectionStatus)}</span>
          <span class="v71-pill v71-pill-neutral">Lizenz: ${escapeHtml(tool.licenseStatus)}</span>
          ${tool.publicationCapability ? '<span class="v71-pill v71-pill-handoff">Veröffentlichung</span>' : ""}
          ${tool.costModel !== "FREE" ? '<span class="v71-pill v71-pill-handoff">kostenpflichtig möglich</span>' : '<span class="v71-pill v71-pill-neutral">kostenfrei</span>'}
        </div>
        <details class="v71-details">
          <summary>Werkzeug prüfen</summary>
          <dl class="v71-detail-list">
            <div><dt>Anbieter</dt><dd>${escapeHtml(tool.provider || "UNGEKLÄRT")}</dd></div>
            <div><dt>Erlaubte Klassifizierung</dt><dd>${escapeHtml(tool.allowedDataClassifications.join(", "))}</dd></div>
            <div><dt>Benötigte Freigabe</dt><dd>${escapeHtml(tool.requiredApproval)}</dd></div>
            <div><dt>Fallback</dt><dd>${tool.fallbackToolIds.length ? escapeHtml(tool.fallbackToolIds.join(", ")) : "–"}</dd></div>
            <div><dt>Zuletzt geprüft</dt><dd>${escapeHtml(tool.lastVerifiedAt)}</dd></div>
          </dl>
          <ul class="v71-note-list">${tool.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
        </details>
      </li>`;
  }

  async function renderToolsView() {
    const container = byId("v71-tools-output");
    if (!container) return;
    const result = await fetchJson("/api/v71/tools");
    if (!result.ok || !result.json?.tools) {
      container.innerHTML = `<div class="empty-state">Werkzeugregister konnte nicht geladen werden.</div>`;
      return;
    }
    const { tools, categories } = result.json;
    const byCategory = categories
      .map((category) => ({ category, tools: tools.filter((tool) => tool.category === category) }))
      .filter((group) => group.tools.length > 0);

    container.innerHTML = `
      <div class="v71-tool-groups">
        ${byCategory
          .map(
            (group) => `
          <section class="panel">
            <div class="section-head"><div><p class="eyebrow">${escapeHtml(group.category)}</p></div></div>
            <ul class="v71-card-list">${group.tools.map(renderToolCard).join("")}</ul>
          </section>`,
          )
          .join("")}
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Plugin-Gateway & Tool-Routing
  // ---------------------------------------------------------------------

  function renderPluginCard(plugin) {
    return `
      <li class="v71-card">
        <div class="v71-card-head">
          <strong>${escapeHtml(plugin.toolId)}</strong>
          <span class="${pillClass(plugin.status)}">${escapeHtml(PLUGIN_STATUS_LABEL[plugin.status] || plugin.status)}</span>
        </div>
        <div class="v71-tag-row">
          <span class="v71-pill v71-pill-neutral">${escapeHtml(plugin.adapterType)}</span>
          ${plugin.readOnly ? '<span class="v71-pill v71-pill-neutral">read-only</span>' : ""}
          ${plugin.externalWrite ? '<span class="v71-pill v71-pill-handoff">externer Schreibzugriff</span>' : '<span class="v71-pill v71-pill-neutral">kein externer Write</span>'}
          ${plugin.publication ? '<span class="v71-pill v71-pill-handoff">Veröffentlichung</span>' : ""}
        </div>
        <p class="v71-note">${escapeHtml(plugin.healthStatus)}</p>
      </li>`;
  }

  async function renderPluginGatewayView() {
    const container = byId("v71-plugin-gateway-output");
    if (!container) return;
    const projects = await loadProjectsForSelect();
    const result = await fetchJson("/api/v71/plugin-gateway");
    const plugins = result.ok && Array.isArray(result.json?.plugins) ? result.json.plugins : [];

    container.innerHTML = `
      <div class="v71-layout">
        <section class="panel">
          <div class="section-head"><div><p class="eyebrow">Status</p><h3>Bekannte Plugins</h3></div></div>
          <ul class="v71-card-list">${plugins.map(renderPluginCard).join("")}</ul>
        </section>

        <form class="panel v71-form" id="v71-routing-form">
          <div class="section-head">
            <div><p class="eyebrow">Primäraktion</p><h3>Arbeitsweg vorbereiten</h3></div>
          </div>
          <label>Projekt
            <select id="v71-routing-project">${projectOptions(projects, "ki-unternehmenszentrale")}</select>
          </label>
          <label>Benötigte Fähigkeit
            <input type="text" id="v71-routing-capability" placeholder="z. B. Code-Ausführung, Design, Text" />
          </label>
          <div class="form-grid">
            <label>Datenklassifizierung
              <select id="v71-routing-classification">
                <option value="NORMAL">Normal</option>
                <option value="SENSITIVE">Sensibel</option>
                <option value="SECRET">Geheim</option>
              </select>
            </label>
            <label>Kostenrahmen (€/Monat, optional)
              <input type="number" id="v71-routing-cost" min="0" step="1" />
            </label>
          </div>
          <div class="form-grid">
            <label class="v71-checkbox" for="v71-routing-external">
              <input type="checkbox" id="v71-routing-external" />
              <span class="v71-checkbox-label">externe Übertragung erlaubt</span>
            </label>
            <label class="v71-checkbox" for="v71-routing-publication">
              <input type="checkbox" id="v71-routing-publication" />
              <span class="v71-checkbox-label">Veröffentlichung erlaubt</span>
            </label>
          </div>
          <div class="button-row">
            <button class="primary-button" type="submit">Arbeitsweg vorbereiten</button>
          </div>
          <div id="v71-routing-result" class="v71-routing-result" aria-live="polite"></div>
        </form>
      </div>`;

    byId("v71-routing-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const resultEl = byId("v71-routing-result");
      resultEl.innerHTML = "<p>Wird vorbereitet…</p>";
      const params = new URLSearchParams({
        projectId: byId("v71-routing-project").value,
        dataClassification: byId("v71-routing-classification").value,
        externalTransferAllowed: String(byId("v71-routing-external").checked),
        publicationAllowed: String(byId("v71-routing-publication").checked),
      });
      const capability = byId("v71-routing-capability").value.trim();
      if (capability) params.set("requiredCapabilities", capability);
      const cost = byId("v71-routing-cost").value;
      if (cost) params.set("costCeiling", cost);

      const routingResult = await fetchJson(`/api/v71/tool-routing?${params.toString()}`);
      const routing = routingResult.json;
      if (!routingResult.ok || !routing) {
        resultEl.innerHTML = `<p class="v71-note v71-note-warning">Vorbereitung nicht möglich.</p>`;
        return;
      }
      if (!routing.ok) {
        const candidate = routing.blockedCandidate || null;
        resultEl.innerHTML = `
          <div class="v71-card">
            <div class="v71-card-head">
              <strong>Kein Werkzeug erfüllt die Anforderungen</strong>
              <span class="${pillClass("BLOCKED")}">${escapeHtml(routing.status || "BLOCKED")}</span>
            </div>
            <p class="v71-note v71-note-warning">Es wird kein Werkzeug erfunden, empfohlen oder automatisch gestartet.</p>
            <ul class="v71-note-list">${routing.reasoning.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
            ${
              candidate
                ? `
              <div class="v71-blocked-candidate">
                <p class="form-note"><strong>Fachlich geeignetes Werkzeug (nicht ausführbar):</strong> ${escapeHtml(candidate.displayName)}</p>
                <div class="v71-tag-row">
                  <span class="v71-pill v71-pill-neutral">Verbindung: ${escapeHtml(candidate.connectionStatus)}</span>
                  <span class="v71-pill v71-pill-neutral">Datenschutzgrenze: ${escapeHtml(candidate.dataClassificationBoundary)}</span>
                  <span class="v71-pill v71-pill-neutral">Kosten: ${escapeHtml(candidate.costStatus)}</span>
                </div>
                ${
                  candidate.missingApprovals.length
                    ? `<p class="form-note">Fehlende Freigaben: ${escapeHtml(candidate.missingApprovals.join(", "))}</p>`
                    : ""
                }
                ${candidate.fallback ? `<p class="form-note">Fallback: ${escapeHtml(candidate.fallback)}</p>` : ""}
              </div>
              ${
                routing.blockedAlternatives && routing.blockedAlternatives.length
                  ? `<p class="form-note">Weitere fachlich passende, aber ebenfalls nicht ausführbare Kandidaten: ${routing.blockedAlternatives
                      .map((alt) => escapeHtml(`${alt.displayName} (${alt.connectionStatus})`))
                      .join(", ")}</p>`
                  : ""
              }`
                : ""
            }
            <p class="form-note">${escapeHtml(routing.nextAllowedJamalStep || "")}</p>
            <p class="form-note">Kein automatischer Start. Keine externe Übertragung. Keine Veröffentlichung. Keine Kostenfreigabe.</p>
          </div>`;
        return;
      }
      resultEl.innerHTML = `
        <div class="v71-card">
          <div class="v71-card-head">
            <strong>${escapeHtml(routing.recommendedTool.displayName)}</strong>
            <span class="${pillClass(routing.recommendedTool.executionMode)}">${escapeHtml(
              EXECUTION_MODE_LABEL[routing.recommendedTool.executionMode] || routing.recommendedTool.executionMode,
            )}</span>
          </div>
          <div class="v71-tag-row">
            <span class="v71-pill v71-pill-neutral">Datenschutzgrenze: ${escapeHtml(routing.dataClassificationBoundary)}</span>
            <span class="v71-pill v71-pill-neutral">Kosten: ${escapeHtml(routing.costStatus)}</span>
            ${routing.requiredJamalApproval ? '<span class="v71-pill v71-pill-handoff">Jamal-Freigabe nötig</span>' : '<span class="v71-pill v71-pill-neutral">keine Sonderfreigabe nötig</span>'}
          </div>
          <p class="v71-note">${escapeHtml(routing.approvalReason || "")}</p>
          <ul class="v71-note-list">${routing.reasoning.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          ${
            routing.alternatives.length
              ? `<p class="form-note">Alternativen: ${routing.alternatives
                  .map((alt) => escapeHtml(`${alt.displayName} (${EXECUTION_MODE_LABEL[alt.executionMode] || alt.executionMode})`))
                  .join(", ")}</p>`
              : ""
          }
          ${routing.fallback ? `<p class="form-note">Fallback: ${escapeHtml(routing.fallback)}</p>` : ""}
          <p class="form-note">Kein automatischer Start. Diese Ausgabe ist ausschließlich eine Vorbereitung.</p>
        </div>`;
    });
  }

  // ---------------------------------------------------------------------
  // V7.1 Phase B – HeyGen-Pilot (CONTROLLED_CONNECTOR_HANDOFF).
  //
  // Nutzt ausschließlich die additiven /api/v71/heygen/*-Routen. Kein
  // Button für Veröffentlichen/Video löschen/Avatar klonen/Voice klonen/
  // Credits kaufen (siehe Auftrag Abschnitt L). Jede Freigabe ist ein
  // eigener, getrennter Aufruf – keine Sammelfreigabe.
  // ---------------------------------------------------------------------

  const HEYGEN_STATUS_LABEL = {
    DRAFT: "Entwurf",
    READY_FOR_REVIEW: "geprüft, wartet auf Freigaben",
    BLOCKED: "blockiert",
    APPROVED_FOR_HANDOFF: "freigegeben für Übergabe",
    HANDED_OFF: "übergeben (Ausführung noch nicht bestätigt)",
    PROCESSING: "wird bei HeyGen verarbeitet",
    SUCCEEDED: "erfolgreich (Providerangabe, lokal geprüft)",
    FAILED: "fehlgeschlagen",
    CANCELLED: "abgebrochen",
    STALE: "abgelaufen",
  };

  function heygenStatusPillClass(status) {
    const map = {
      DRAFT: "v71-pill v71-pill-neutral",
      READY_FOR_REVIEW: "v71-pill v71-pill-recommendation",
      BLOCKED: "v71-pill v71-pill-blocked",
      APPROVED_FOR_HANDOFF: "v71-pill v71-pill-handoff",
      HANDED_OFF: "v71-pill v71-pill-handoff",
      PROCESSING: "v71-pill v71-pill-handoff",
      SUCCEEDED: "v71-pill v71-pill-direct",
      FAILED: "v71-pill v71-pill-blocked",
      CANCELLED: "v71-pill v71-pill-blocked",
      STALE: "v71-pill v71-pill-blocked",
    };
    return map[status] || "v71-pill v71-pill-neutral";
  }

  let heygenStatusCache = null;
  let heygenSelectedProjectId = "ki-unternehmenszentrale";

  function renderHeygenPilotBadges() {
    return `
      <span class="v71-pill v71-pill-handoff">kontrollierte Übergabe</span>
      <span class="v71-pill v71-pill-handoff">externe Verarbeitung</span>
      <span class="v71-pill v71-pill-handoff">kostenpflichtig möglich</span>
      <span class="v71-pill v71-pill-blocked">noch nicht veröffentlicht</span>
      <span class="v71-pill v71-pill-neutral">kein automatischer Start</span>
      <span class="v71-pill v71-pill-neutral">erster Pilot</span>`;
  }

  function heygenApprovalRow(pkg) {
    const items = [
      { label: "Inhalt", ok: pkg.contentApproved === true },
      { label: "Externe Übertragung", ok: pkg.externalTransferApproved === true },
      { label: "Kostenrahmen", ok: pkg.costApprovalStatus === "WITHIN_APPROVED_LIMIT" },
      // V7.1 Phase B.1 (Auftrag Abschnitt E) – fünfte, getrennte Freigabestufe.
      { label: "Kundenentwurf", ok: pkg.customerDraftApprovalStatus === "APPROVED" },
      { label: "Veröffentlichung", ok: false, always: "bleibt immer eine eigene, spätere Freigabe" },
    ];
    return items
      .map(
        (item) =>
          `<span class="v71-pill ${item.ok ? "v71-pill-direct" : "v71-pill-neutral"}" title="${escapeHtml(item.always || "")}">${escapeHtml(
            item.label,
          )}: ${item.ok ? "freigegeben" : "offen"}</span>`,
      )
      .join(" ");
  }

  // V7.1 Phase B.1 (Auftrag Abschnitt C/I) – Mandantenkennzeichnung je
  // Jobpaket. Rein informativ, keine Kundenanmeldung, kein Kundenportal.
  const HEYGEN_COST_PACKAGE_LABEL = {
    INCLUDED_IN_PACKAGE: "im Kundenpaket enthalten",
    ADDITIONAL_APPROVAL_REQUIRED: "Zusatzfreigabe nötig",
    UNKNOWN: "unbekannt",
    NOT_BILLABLE_TEST: "nicht abrechenbar (Test)",
  };

  const HEYGEN_CUSTOMER_DRAFT_LABEL = {
    PENDING: "offen",
    APPROVED: "freigegeben",
    CHANGES_REQUESTED: "Änderungen angefordert",
  };

  function heygenTenantRow(pkg) {
    return `
      <span class="v71-pill v71-pill-neutral">Kunde: ${escapeHtml(pkg.customerId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Marke: ${escapeHtml(pkg.brandId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Kampagne: ${escapeHtml(pkg.campaignId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Kostenpaket: ${escapeHtml(HEYGEN_COST_PACKAGE_LABEL[pkg.costPackageStatus] || pkg.costPackageStatus || "unbekannt")}</span>
      <span class="v71-pill ${pkg.customerDraftApprovalStatus === "APPROVED" ? "v71-pill-direct" : "v71-pill-neutral"}">Kundenfreigabe: ${escapeHtml(HEYGEN_CUSTOMER_DRAFT_LABEL[pkg.customerDraftApprovalStatus] || "offen")}</span>`;
  }

  function heygenActionButtons(pkg) {
    const buttons = [];
    if (pkg.status === "DRAFT") {
      buttons.push(`<button class="secondary-button" type="button" data-heygen-action="validate" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Inhalt prüfen</button>`);
    }
    if (pkg.status === "READY_FOR_REVIEW") {
      if (!pkg.contentApproved) {
        buttons.push(`<button class="secondary-button" type="button" data-heygen-action="approve-content" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Inhalt freigeben</button>`);
      }
      if (!pkg.externalTransferApproved) {
        buttons.push(`<button class="secondary-button" type="button" data-heygen-action="approve-transfer" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Externe Übertragung bestätigen</button>`);
      }
      if (pkg.costApprovalStatus !== "WITHIN_APPROVED_LIMIT") {
        buttons.push(`<button class="secondary-button" type="button" data-heygen-action="approve-cost" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Kostenrahmen bestätigen</button>`);
      }
      if (pkg.contentApproved && pkg.externalTransferApproved && pkg.costApprovalStatus === "WITHIN_APPROVED_LIMIT") {
        buttons.push(`<button class="primary-button" type="button" data-heygen-action="handoff" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">HeyGen-Übergabe freigeben</button>`);
      }
    }
    if (["HANDED_OFF", "PROCESSING"].includes(pkg.status)) {
      buttons.push(`<button class="secondary-button" type="button" data-heygen-action="check-result" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Ergebnis prüfen</button>`);
    }
    // V7.1 Phase B.1 (Auftrag Abschnitt E) – Kundenentwurfsfreigabe ist eine
    // eigene, fünfte Freigabestufe und setzt eine bereits erteilte interne
    // Inhaltsfreigabe voraus. Ausdrücklich KEINE Veröffentlichungsschaltfläche.
    if (pkg.contentApproved === true && pkg.customerDraftApprovalStatus !== "APPROVED") {
      buttons.push(`<button class="secondary-button" type="button" data-heygen-action="approve-customer-draft" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Kundenentwurf freigeben</button>`);
      buttons.push(`<button class="secondary-button" type="button" data-heygen-action="request-customer-draft-changes" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Änderungen anfordern</button>`);
    }
    // Ausdrücklich KEIN Button für Veröffentlichen/Video löschen/Avatar
    // klonen/Voice klonen/Credits kaufen (Auftrag Abschnitt L).
    return buttons.join(" ");
  }

  function renderHeygenPackageCard(pkg) {
    const avatar = pkg.avatarReference ? `${pkg.avatarReference.avatarId} (${pkg.avatarReference.visibility})` : "kein Avatar hinterlegt";
    return `
      <li class="v71-card" data-heygen-package-card="${escapeHtml(pkg.jobPackageId)}">
        <div class="v71-card-head">
          <strong>${escapeHtml(pkg.title || "Ohne Titel")}</strong>
          <span class="${heygenStatusPillClass(pkg.status)}">${escapeHtml(HEYGEN_STATUS_LABEL[pkg.status] || pkg.status)}</span>
        </div>
        <div class="v71-tag-row">${heygenApprovalRow(pkg)}</div>
        <div class="v71-tag-row">${heygenTenantRow(pkg)}</div>
        ${pkg.blockReasons && pkg.blockReasons.length ? `<p class="v71-note v71-note-warning">${escapeHtml(pkg.blockReasons[0])}</p>` : ""}
        <details class="v71-details">
          <summary>Technische Details</summary>
          <dl class="v71-detail-list">
            <div><dt>Format</dt><dd>${escapeHtml(pkg.aspectRatio)} · ${escapeHtml(String(pkg.durationTargetSeconds))}s · ${escapeHtml(pkg.resolutionPreference || "–")}</dd></div>
            <div><dt>Avatar</dt><dd>${escapeHtml(avatar)}</dd></div>
            <div><dt>Script</dt><dd>${escapeHtml(pkg.script || "–")}</dd></div>
            <div><dt>Datenklassifizierung</dt><dd>${escapeHtml(pkg.dataClassification)}</dd></div>
            <div><dt>Kostenobergrenze</dt><dd>${pkg.costCeiling !== null && pkg.costCeiling !== undefined ? escapeHtml(`${pkg.costCeiling} ${pkg.currency}`) : "nicht angegeben"}</dd></div>
            <div><dt>Nur vorbereitet oder übergeben?</dt><dd>${escapeHtml(pkg.status === "DRAFT" || pkg.status === "READY_FOR_REVIEW" ? "nur vorbereitet" : "an Connector übergeben")}</dd></div>
            <div><dt>Nächster Jamal-Schritt</dt><dd>${escapeHtml(pkg.nextAllowedStep || "–")}</dd></div>
          </dl>
        </details>
        <div class="button-row">${heygenActionButtons(pkg)}</div>
        <p class="form-note" data-heygen-package-status="${escapeHtml(pkg.jobPackageId)}" aria-live="polite"></p>
      </li>`;
  }

  async function heygenPostAction(path, payload) {
    return fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function renderHeygenView() {
    const container = byId("v71-heygen-output");
    if (!container) return;
    const projects = await loadProjectsForSelect();
    const [statusResult, packagesResult, pilotReviewResult] = await Promise.all([
      fetchJson("/api/v71/heygen/status"),
      fetchJson(`/api/v71/heygen/job-packages?projectId=${encodeURIComponent(heygenSelectedProjectId)}`),
      fetchJson("/api/v71/agency/pilot-review"),
    ]);
    heygenStatusCache = statusResult.ok ? statusResult.json : null;
    const jobPackages = packagesResult.ok && Array.isArray(packagesResult.json?.jobPackages) ? packagesResult.json.jobPackages : [];
    const pilotReview = pilotReviewResult.ok ? pilotReviewResult.json?.pilotReview : null;
    const pilotLocallyVerified = pilotReviewResult.ok ? pilotReviewResult.json?.locallyVerifiedSuccess : null;

    container.innerHTML = `
      <div class="v71-layout">
        <section class="panel">
          <div class="section-head">
            <div><p class="eyebrow">V7.1 Phase B.1 · Testmandant</p><h3>HeyGen-Agenturbetrieb · Testmandant</h3></div>
          </div>
          <div class="v71-tag-row">
            <span class="v71-pill v71-pill-neutral">Testmandant</span>
            <span class="v71-pill v71-pill-neutral">kein echtes Kundenportal</span>
            <span class="v71-pill v71-pill-blocked">Kunde hat keinen HeyGen-Zugang</span>
            <span class="v71-pill v71-pill-blocked">Providerkonto bleibt intern</span>
            <span class="v71-pill v71-pill-blocked">Video noch nicht veröffentlicht</span>
            <span class="v71-pill v71-pill-blocked">erster Pilot ist nicht abrechenbar</span>
          </div>
          ${
            pilotReview
              ? `<dl class="v71-detail-list">
                  <div><dt>Kunde</dt><dd>${escapeHtml(pilotReview.customerId)}</dd></div>
                  <div><dt>Marke</dt><dd>${escapeHtml(pilotReview.brandId)}</dd></div>
                  <div><dt>Kampagne</dt><dd>${escapeHtml(pilotReview.campaignId)}</dd></div>
                  <div><dt>Projekt</dt><dd>${escapeHtml(pilotReview.projectId)}</dd></div>
                  <div><dt>Videoauftrag</dt><dd>HeyGen-Session ${escapeHtml(pilotReview.providerSessionId)} (intern, keine öffentliche Video-URL)</dd></div>
                  <div><dt>Providerstatus</dt><dd>${escapeHtml(pilotReview.renderStatus)} (Providerangabe)</dd></div>
                  <div><dt>Interner Status</dt><dd>${pilotLocallyVerified ? "lokal verifiziert" : "lokal nicht verifiziert (Session-ID allein genügt nicht)"}</dd></div>
                  <div><dt>Kostenstatus</dt><dd>${escapeHtml(pilotReview.costStatus)}</dd></div>
                  <div><dt>Kundenfreigabe</dt><dd>entfällt (kein echter Kunde, nur interner Test)</dd></div>
                  <div><dt>Veröffentlichungsstatus</dt><dd>${escapeHtml(pilotReview.publicationStatus)}</dd></div>
                  <div><dt>Nächster Jamal-Schritt</dt><dd>${escapeHtml(pilotReview.jamalDecision === "ACKNOWLEDGED_SUCCESSFUL_TEST_ONLY" ? "Manuelle Abnahme/Commit-Prüfung Phase B.1; keine Kundenfreigabe ohne echten Kunden." : pilotReview.jamalDecision)}</dd></div>
                </dl>`
              : `<p class="form-note">Pilot-Review derzeit nicht ladbar.</p>`
          }
        </section>

        <section class="panel">
          <div class="section-head"><div><p class="eyebrow">Status</p><h3>HeyGen-Verbindungsstatus</h3></div></div>
          <div class="v71-tag-row">${renderHeygenPilotBadges()}</div>
          <details class="v71-details">
            <summary>Technische Details (Capability-Profil, Pilotgrenzen)</summary>
            <ul class="v71-note-list">
              ${(heygenStatusCache?.capabilityProfile?.supportedOrPlanned || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
            </ul>
            <p class="form-note">Ausdrücklich nicht im ersten Pilot: ${escapeHtml((heygenStatusCache?.capabilityProfile?.explicitlyNotAvailableInFirstPilot || []).join(", "))}</p>
          </details>
        </section>

        <form class="panel v71-form" id="v71-heygen-prepare-form">
          <div class="section-head">
            <div><p class="eyebrow">Primäraktion</p><h3>Videoauftrag vorbereiten</h3></div>
          </div>
          <label>Projekt
            <select id="v71-heygen-project">${projectOptions(projects, heygenSelectedProjectId)}</select>
          </label>
          <label>Was soll das Video erreichen? (Titel/Zweck)
            <input type="text" id="v71-heygen-title" maxlength="200" placeholder="z. B. Neutraler Café-Test" required />
          </label>
          <label>Text (Script)
            <textarea id="v71-heygen-script" rows="4" maxlength="4000" placeholder="Kurzer, neutraler deutscher Text ohne Kundendaten" required></textarea>
          </label>
          <div class="form-grid">
            <label>Format
              <select id="v71-heygen-aspect-ratio">
                <option value="9:16">9:16 (hochkant)</option>
                <option value="16:9">16:9 (querformat)</option>
              </select>
            </label>
            <label>Länge (Sekunden, max. 30 im Pilot)
              <input type="number" id="v71-heygen-duration" min="1" max="30" value="15" />
            </label>
          </div>
          <label>Welcher Avatar? (öffentliche Avatar-ID)
            <input type="text" id="v71-heygen-avatar-id" maxlength="200" placeholder="öffentlicher HeyGen-Beispielavatar" required />
          </label>
          <p class="form-note">Datenklassifizierung im ersten Pilot: ausschließlich NORMAL. Kein Kundendaten-, Gesundheits- oder Kinderbezug.</p>
          <label>Kostenobergrenze (optional, kein erfundener Preis)
            <input type="number" id="v71-heygen-cost-ceiling" min="0" step="0.01" placeholder="z. B. 5.00" />
          </label>
          <div class="button-row">
            <button class="primary-button" type="submit">Videoauftrag vorbereiten</button>
          </div>
          <p class="form-note" id="v71-heygen-prepare-status" aria-live="polite"></p>
        </form>

        <section class="panel">
          <div class="section-head">
            <div><p class="eyebrow">Bestand</p><h3>Vorbereitete HeyGen-Aufträge (${jobPackages.length})</h3></div>
          </div>
          ${
            jobPackages.length
              ? `<ul class="v71-card-list">${jobPackages.map(renderHeygenPackageCard).join("")}</ul>`
              : `<div class="empty-state">Für dieses Projekt ist noch kein HeyGen-Auftrag vorbereitet. Nutze die Primäraktion oben.</div>`
          }
          <p class="form-note">Jede Freigabe (Inhalt, externe Übertragung, Kostenrahmen) ist ein eigener, getrennter Schritt. Veröffentlichung bleibt immer eine eigene, spätere Freigabe.</p>
        </section>
      </div>`;

    byId("v71-heygen-project").addEventListener("change", (event) => {
      heygenSelectedProjectId = event.target.value;
      renderHeygenView();
    });

    byId("v71-heygen-prepare-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const statusEl = byId("v71-heygen-prepare-status");
      statusEl.textContent = "Wird vorbereitet…";
      const payload = {
        projectId: byId("v71-heygen-project").value,
        videoType: "AVATAR_VIDEO",
        title: byId("v71-heygen-title").value.trim(),
        script: byId("v71-heygen-script").value.trim(),
        aspectRatio: byId("v71-heygen-aspect-ratio").value,
        durationTargetSeconds: Number(byId("v71-heygen-duration").value),
        avatarReference: { avatarId: byId("v71-heygen-avatar-id").value.trim(), visibility: "PUBLIC" },
        dataClassification: "NORMAL",
      };
      const costCeiling = byId("v71-heygen-cost-ceiling").value;
      if (costCeiling) payload.costCeiling = Number(costCeiling);
      const result = await heygenPostAction("/api/v71/heygen/job-package/prepare", payload);
      if (result.ok && result.json?.ok) {
        statusEl.textContent = "Auftragspaket vorbereitet (DRAFT). Noch keine Ausführung, keine externe Übertragung.";
        renderHeygenView();
      } else {
        statusEl.textContent = result.json?.message || "Vorbereitung nicht möglich.";
      }
    });

    container.querySelectorAll("[data-heygen-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const jobPackageId = button.getAttribute("data-job-package-id");
        const action = button.getAttribute("data-heygen-action");
        const statusEl = container.querySelector(`[data-heygen-package-status="${jobPackageId}"]`);
        if (statusEl) statusEl.textContent = "Wird verarbeitet…";
        try {
          if (action === "validate") {
            await heygenPostAction("/api/v71/heygen/job-package/validate", { jobPackageId });
          } else if (action === "approve-content") {
            await heygenPostAction("/api/v71/heygen/job-package/approve-content", { jobPackageId });
          } else if (action === "approve-transfer") {
            await heygenPostAction("/api/v71/heygen/job-package/approve-external-transfer", { jobPackageId });
          } else if (action === "approve-cost") {
            await heygenPostAction("/api/v71/heygen/job-package/approve-cost", { jobPackageId, costApprovalStatus: "WITHIN_APPROVED_LIMIT" });
          } else if (action === "handoff") {
            const tokenResult = await heygenPostAction("/api/v71/heygen/handoff/request-token", { jobPackageId });
            if (!tokenResult.ok || !tokenResult.json?.ok) {
              if (statusEl) statusEl.textContent = (tokenResult.json?.missing || []).join(", ") || "Handoff-Voraussetzungen nicht erfüllt.";
              renderHeygenView();
              return;
            }
            const handoffResult = await heygenPostAction("/api/v71/heygen/handoff/prepare", {
              jobPackageId,
              token: tokenResult.json.token,
            });
            if (statusEl) {
              statusEl.textContent = handoffResult.json?.ok
                ? "Hand-off vorbereitet. Tatsächliche Ausführung noch nicht gestartet – erfolgt außerhalb dieses Servers nach Jamals Freigabe."
                : handoffResult.json?.message || "Hand-off nicht möglich.";
            }
          } else if (action === "check-result") {
            if (statusEl) statusEl.textContent = "Ergebnisprüfung erfolgt über die strukturierte Rückführung (Providerstatus, danach Jamal-Abnahme, danach getrennt Veröffentlichung).";
          } else if (action === "approve-customer-draft") {
            const draftResult = await heygenPostAction("/api/v71/heygen/job-package/approve-customer-draft", { jobPackageId });
            if (statusEl) {
              statusEl.textContent = draftResult.json?.ok
                ? "Kundenentwurf freigegeben. Das ist keine Veröffentlichungsfreigabe."
                : draftResult.json?.message || "Kundenentwurfsfreigabe nicht möglich.";
            }
          } else if (action === "request-customer-draft-changes") {
            const note = window.prompt("Welche Änderung soll der Kunde erhalten? (kurze Notiz)", "");
            if (note === null) return;
            const changesResult = await heygenPostAction("/api/v71/heygen/job-package/request-customer-draft-changes", { jobPackageId, note });
            if (statusEl) {
              statusEl.textContent = changesResult.json?.ok ? "Änderungswunsch erfasst." : changesResult.json?.message || "Änderungswunsch nicht möglich.";
            }
          }
        } catch (_error) {
          if (statusEl) statusEl.textContent = "Aktion nicht möglich.";
        }
        renderHeygenView();
      });
    });
  }

  // ---------------------------------------------------------------------
  // V7.1 Phase C – Canva-Designpilot (CONTROLLED_CONNECTOR_HANDOFF).
  //
  // Nutzt ausschließlich die additiven /api/v71/canva/*-Routen. Kein
  // Button für Veröffentlichen/Öffentlich teilen/Kunden zu Canva einladen/
  // Design löschen/Credits kaufen/Alles freigeben (siehe Auftrag Abschnitt
  // N). Jede Freigabe ist ein eigener, getrennter Aufruf – keine
  // Sammelfreigabe.
  // ---------------------------------------------------------------------

  const CANVA_STATUS_LABEL = {
    DRAFT: "Entwurf",
    READY_FOR_REVIEW: "geprüft, wartet auf Freigaben",
    BLOCKED: "blockiert",
    APPROVED_FOR_HANDOFF: "freigegeben für Übergabe",
    HANDED_OFF: "übergeben (Ausführung noch nicht bestätigt)",
    CANDIDATES_READY: "Designkandidaten verfügbar (noch kein Design)",
    DRAFT_EDITING: "Bearbeitungsentwurf (nicht gespeichert)",
    PREVIEW_READY: "Vorschau bereit (nicht gespeichert)",
    APPROVED_TO_SAVE: "Speicherung freigegeben",
    SAVED: "gespeichert (Providerangabe, nicht veröffentlicht)",
    INTERNAL_REVIEW: "internes Review",
    READY_FOR_CUSTOMER_REVIEW: "bereit für Kundenreview",
    CUSTOMER_CHANGES_REQUESTED: "Kunde wünscht Änderungen",
    CUSTOMER_APPROVED: "vom Kunden freigegeben (keine Veröffentlichung)",
    FAILED: "fehlgeschlagen",
    CANCELLED: "abgebrochen",
    STALE: "abgelaufen",
  };

  function canvaStatusPillClass(status) {
    const map = {
      DRAFT: "v71-pill v71-pill-neutral",
      READY_FOR_REVIEW: "v71-pill v71-pill-recommendation",
      BLOCKED: "v71-pill v71-pill-blocked",
      APPROVED_FOR_HANDOFF: "v71-pill v71-pill-handoff",
      HANDED_OFF: "v71-pill v71-pill-handoff",
      CANDIDATES_READY: "v71-pill v71-pill-handoff",
      DRAFT_EDITING: "v71-pill v71-pill-handoff",
      PREVIEW_READY: "v71-pill v71-pill-handoff",
      APPROVED_TO_SAVE: "v71-pill v71-pill-handoff",
      SAVED: "v71-pill v71-pill-direct",
      INTERNAL_REVIEW: "v71-pill v71-pill-recommendation",
      READY_FOR_CUSTOMER_REVIEW: "v71-pill v71-pill-recommendation",
      CUSTOMER_CHANGES_REQUESTED: "v71-pill v71-pill-blocked",
      CUSTOMER_APPROVED: "v71-pill v71-pill-direct",
      FAILED: "v71-pill v71-pill-blocked",
      CANCELLED: "v71-pill v71-pill-blocked",
      STALE: "v71-pill v71-pill-blocked",
    };
    return map[status] || "v71-pill v71-pill-neutral";
  }

  let canvaStatusCache = null;
  let canvaSelectedProjectId = "ki-unternehmenszentrale";

  function renderCanvaPilotBadges() {
    return `
      <span class="v71-pill v71-pill-handoff">kontrollierte Übergabe</span>
      <span class="v71-pill v71-pill-handoff">externe Verarbeitung</span>
      <span class="v71-pill v71-pill-neutral">Testmandant</span>
      <span class="v71-pill v71-pill-neutral">nicht abrechenbarer Pilot</span>
      <span class="v71-pill v71-pill-blocked">noch nicht veröffentlicht</span>
      <span class="v71-pill v71-pill-blocked">Canva-Konto intern</span>
      <span class="v71-pill v71-pill-blocked">Kunde hat keinen Canva-Zugang</span>
      <span class="v71-pill v71-pill-neutral">kein automatischer Start</span>`;
  }

  function canvaApprovalRow(pkg) {
    const items = [
      { label: "Briefing", ok: pkg.briefingApproved === true },
      { label: "Assets/Rechte", ok: pkg.assetsAndRightsApproved === true },
      { label: "Externe Übertragung", ok: pkg.externalTransferApproved === true },
      { label: "Kostenrahmen", ok: pkg.internalCostApprovalStatus === "WITHIN_APPROVED_LIMIT" },
      { label: "Kundenentwurf", ok: pkg.customerDraftApprovalStatus === "APPROVED" },
      { label: "Veröffentlichung", ok: false, always: "bleibt immer eine eigene, spätere Freigabe" },
    ];
    return items
      .map(
        (item) =>
          `<span class="v71-pill ${item.ok ? "v71-pill-direct" : "v71-pill-neutral"}" title="${escapeHtml(item.always || "")}">${escapeHtml(
            item.label,
          )}: ${item.ok ? "freigegeben" : "offen"}</span>`,
      )
      .join(" ");
  }

  const CANVA_COST_PACKAGE_LABEL = {
    INCLUDED_IN_PACKAGE: "im Kundenpaket enthalten",
    ADDITIONAL_APPROVAL_REQUIRED: "Zusatzfreigabe nötig",
    UNKNOWN: "unbekannt",
    NOT_BILLABLE_TEST: "nicht abrechenbar (Test)",
  };

  const CANVA_CUSTOMER_DRAFT_LABEL = {
    PENDING: "offen",
    APPROVED: "freigegeben",
    CHANGES_REQUESTED: "Änderungen angefordert",
  };

  function canvaTenantRow(pkg) {
    return `
      <span class="v71-pill v71-pill-neutral">Kunde: ${escapeHtml(pkg.customerId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Marke: ${escapeHtml(pkg.brandId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Kampagne: ${escapeHtml(pkg.campaignId || "–")}</span>
      <span class="v71-pill v71-pill-neutral">Kostenpaket: ${escapeHtml(CANVA_COST_PACKAGE_LABEL[pkg.costPackageStatus] || pkg.costPackageStatus || "unbekannt")}</span>
      <span class="v71-pill ${pkg.customerDraftApprovalStatus === "APPROVED" ? "v71-pill-direct" : "v71-pill-neutral"}">Kundenfreigabe: ${escapeHtml(CANVA_CUSTOMER_DRAFT_LABEL[pkg.customerDraftApprovalStatus] || "offen")}</span>`;
  }

  // Sicherheits-/Fachkorrektur: Die Kundenentwurfsaktionen dürfen
  // ausschließlich erscheinen, wenn tatsächlich ein mandantengebundener
  // Kundenentwurf existiert – eine bloße Briefingfreigabe genügt nicht.
  // Erfordert mindestens: ein erzeugter UND ausdrücklich ausgewählter
  // Designkandidat (selectedCandidateId), lokalen Status mindestens
  // READY_FOR_CUSTOMER_REVIEW (erst nach Kandidat -> Design/gespeichertem
  // Entwurf -> internem Review erreichbar) sowie eine vollständige
  // Mandantenbindung (Kunde/Marke/Kampagne).
  function canvaCustomerDraftActionsAvailable(pkg) {
    return (
      pkg.status === "READY_FOR_CUSTOMER_REVIEW" &&
      Boolean(pkg.selectedCandidateId) &&
      Boolean(pkg.customerId) &&
      Boolean(pkg.brandId) &&
      Boolean(pkg.campaignId)
    );
  }

  function canvaActionButtons(pkg) {
    const buttons = [];
    if (pkg.status === "DRAFT") {
      buttons.push(`<button class="secondary-button" type="button" data-canva-action="validate" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Inhalt prüfen</button>`);
    }
    if (pkg.status === "READY_FOR_REVIEW") {
      if (!pkg.briefingApproved) {
        buttons.push(`<button class="secondary-button" type="button" data-canva-action="approve-briefing" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Briefing freigeben</button>`);
      }
      if (!pkg.assetsAndRightsApproved) {
        buttons.push(`<button class="secondary-button" type="button" data-canva-action="approve-assets" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Assets und Rechte freigeben</button>`);
      }
      if (!pkg.externalTransferApproved) {
        buttons.push(`<button class="secondary-button" type="button" data-canva-action="approve-transfer" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Externe Verarbeitung bestätigen</button>`);
      }
      if (pkg.internalCostApprovalStatus !== "WITHIN_APPROVED_LIMIT") {
        buttons.push(`<button class="secondary-button" type="button" data-canva-action="approve-cost" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Kostenrahmen bestätigen</button>`);
      }
      if (pkg.briefingApproved && pkg.assetsAndRightsApproved && pkg.externalTransferApproved && pkg.internalCostApprovalStatus === "WITHIN_APPROVED_LIMIT") {
        buttons.push(`<button class="primary-button" type="button" data-canva-action="handoff" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Canva-Übergabe freigeben</button>`);
      }
    }
    if (["HANDED_OFF", "CANDIDATES_READY"].includes(pkg.status)) {
      buttons.push(`<button class="secondary-button" type="button" data-canva-action="check-result" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Designkandidat auswählen / Ergebnis prüfen</button>`);
    }
    if (canvaCustomerDraftActionsAvailable(pkg) && pkg.customerDraftApprovalStatus !== "APPROVED") {
      buttons.push(`<button class="secondary-button" type="button" data-canva-action="approve-customer-draft" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Kundenentwurf freigeben</button>`);
      buttons.push(`<button class="secondary-button" type="button" data-canva-action="request-customer-draft-changes" data-job-package-id="${escapeHtml(pkg.jobPackageId)}">Änderungen anfordern</button>`);
    }
    // Ausdrücklich KEIN Button für Veröffentlichen/Öffentlich teilen/Kunden
    // zu Canva einladen/Design löschen/Credits kaufen/Alles freigeben
    // (Auftrag Abschnitt N).
    return buttons.join(" ");
  }

  function renderCanvaPackageCard(pkg) {
    const dims = pkg.dimensions ? `${pkg.dimensions.widthPx}×${pkg.dimensions.heightPx}px (${pkg.dimensions.label || ""})` : "Standardformat";
    return `
      <li class="v71-card" data-canva-package-card="${escapeHtml(pkg.jobPackageId)}">
        <div class="v71-card-head">
          <strong>${escapeHtml(pkg.title || "Ohne Titel")}</strong>
          <span class="${canvaStatusPillClass(pkg.status)}">${escapeHtml(CANVA_STATUS_LABEL[pkg.status] || pkg.status)}</span>
        </div>
        <div class="v71-tag-row">${canvaApprovalRow(pkg)}</div>
        <div class="v71-tag-row">${canvaTenantRow(pkg)}</div>
        ${pkg.blockReasons && pkg.blockReasons.length ? `<p class="v71-note v71-note-warning">${escapeHtml(pkg.blockReasons[0])}</p>` : ""}
        <details class="v71-details">
          <summary>Technische Details</summary>
          <dl class="v71-detail-list">
            <div><dt>Designtyp</dt><dd>${escapeHtml(pkg.designType)} · ${escapeHtml(dims)}</dd></div>
            <div><dt>Botschaft</dt><dd>${escapeHtml(pkg.primaryMessage || "–")}</dd></div>
            <div><dt>Briefing</dt><dd>${escapeHtml(pkg.brief || "–")}</dd></div>
            <div><dt>Datenklassifizierung</dt><dd>${escapeHtml(pkg.dataClassification)}</dd></div>
            <div><dt>Ausgewählter Kandidat</dt><dd>${escapeHtml(pkg.selectedCandidateId || "noch keiner ausgewählt")}</dd></div>
            <div><dt>Nur vorbereitet oder übergeben?</dt><dd>${escapeHtml(pkg.status === "DRAFT" || pkg.status === "READY_FOR_REVIEW" ? "nur vorbereitet" : "an Connector übergeben")}</dd></div>
            <div><dt>Nächster Jamal-Schritt</dt><dd>${escapeHtml(pkg.nextAllowedStep || "–")}</dd></div>
          </dl>
        </details>
        <div class="button-row">${canvaActionButtons(pkg)}</div>
        <p class="form-note" data-canva-package-status="${escapeHtml(pkg.jobPackageId)}" aria-live="polite"></p>
      </li>`;
  }

  async function canvaPostAction(path, payload) {
    return fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function tenantOptions(entries, idField, selectedId) {
    return entries
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry[idField])}" ${entry[idField] === selectedId ? "selected" : ""}>${escapeHtml(
            entry.displayName || entry.title || entry[idField],
          )}</option>`,
      )
      .join("");
  }

  async function renderCanvaView() {
    const container = byId("v71-canva-output");
    if (!container) return;
    const projects = await loadProjectsForSelect();
    const [statusResult, packagesResult, customersResult] = await Promise.all([
      fetchJson("/api/v71/canva/status"),
      fetchJson(`/api/v71/canva/job-packages?projectId=${encodeURIComponent(canvaSelectedProjectId)}`),
      fetchJson("/api/v71/agency/customers"),
    ]);
    canvaStatusCache = statusResult.ok ? statusResult.json : null;
    const jobPackages = packagesResult.ok && Array.isArray(packagesResult.json?.jobPackages) ? packagesResult.json.jobPackages : [];
    const customers = customersResult.ok && Array.isArray(customersResult.json?.customers) ? customersResult.json.customers : [];
    const canvaSelectedCustomerId = customers.find((c) => c.customerId === "test-customer-fiktives-cafe")
      ? "test-customer-fiktives-cafe"
      : customers[0]?.customerId || "";
    const [brandsResult, campaignsResult] = await Promise.all([
      fetchJson(`/api/v71/agency/brands?customerId=${encodeURIComponent(canvaSelectedCustomerId)}`),
      fetchJson(`/api/v71/agency/campaigns?customerId=${encodeURIComponent(canvaSelectedCustomerId)}`),
    ]);
    const brands = brandsResult.ok && Array.isArray(brandsResult.json?.brands) ? brandsResult.json.brands : [];
    const campaigns = campaignsResult.ok && Array.isArray(campaignsResult.json?.campaigns) ? campaignsResult.json.campaigns : [];
    const canvaSelectedBrandId = brands.find((b) => b.brandId === "test-brand-fiktives-cafe") ? "test-brand-fiktives-cafe" : brands[0]?.brandId || "";
    const canvaSelectedCampaignId = campaigns.find((c) => c.campaignId === "test-campaign-fiktives-cafe-pilot")
      ? "test-campaign-fiktives-cafe-pilot"
      : campaigns[0]?.campaignId || "";

    container.innerHTML = `
      <div class="v71-layout">
        <section class="panel">
          <div class="section-head"><div><p class="eyebrow">Status</p><h3>Canva-Verbindungsstatus</h3></div></div>
          <div class="v71-tag-row">${renderCanvaPilotBadges()}</div>
          <details class="v71-details">
            <summary>Technische Details (Capability-Profil, Pilotgrenzen)</summary>
            <ul class="v71-note-list">
              ${(canvaStatusCache?.capabilityProfile?.supportedOrPlanned || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
            </ul>
            <p class="form-note">Ausdrücklich nicht im ersten Pilot: ${escapeHtml((canvaStatusCache?.capabilityProfile?.explicitlyNotAvailableInFirstPilot || []).join(", "))}</p>
          </details>
        </section>

        <form class="panel v71-form" id="v71-canva-prepare-form">
          <div class="section-head">
            <div><p class="eyebrow">Primäraktion</p><h3>Designauftrag vorbereiten</h3></div>
          </div>
          <label>Projekt
            <select id="v71-canva-project">${projectOptions(projects, canvaSelectedProjectId)}</select>
          </label>
          <div class="form-grid">
            <label>Kunde (Testmandant)
              <select id="v71-canva-customer">${tenantOptions(customers, "customerId", canvaSelectedCustomerId)}</select>
            </label>
            <label>Marke (Testmarke)
              <select id="v71-canva-brand">${tenantOptions(brands, "brandId", canvaSelectedBrandId)}</select>
            </label>
          </div>
          <label>Kampagne (Testkampagne)
            <select id="v71-canva-campaign">${tenantOptions(campaigns, "campaignId", canvaSelectedCampaignId)}</select>
          </label>
          <label>Titel
            <input type="text" id="v71-canva-title" maxlength="200" placeholder="z. B. Sonntagsfrühstück im Test-Café" required />
          </label>
          <label>Briefing
            <textarea id="v71-canva-brief" rows="3" maxlength="4000" placeholder="Kurzer, neutraler Briefingtext ohne Kundendaten" required></textarea>
          </label>
          <label>Botschaft (primaryMessage)
            <input type="text" id="v71-canva-message" maxlength="400" placeholder="z. B. Sonntagsfrühstück ab 9 Uhr" required />
          </label>
          <div class="form-grid">
            <label>Designtyp
              <select id="v71-canva-design-type">
                <option value="INSTAGRAM_POST">Instagram-Post</option>
                <option value="STORY">Story</option>
                <option value="FACEBOOK_POST">Facebook-Post</option>
                <option value="FLYER">Flyer</option>
                <option value="DOCUMENT">Dokument</option>
                <option value="YOUTUBE_THUMBNAIL">YouTube-Thumbnail</option>
              </select>
            </label>
            <label>Kostenpaketstatus
              <select id="v71-canva-cost-package-status">
                <option value="NOT_BILLABLE_TEST">nicht abrechenbar (Test)</option>
                <option value="INCLUDED_IN_PACKAGE">im Kundenpaket enthalten</option>
                <option value="ADDITIONAL_APPROVAL_REQUIRED">Zusatzfreigabe nötig</option>
                <option value="UNKNOWN">unbekannt</option>
              </select>
            </label>
          </div>
          <div class="form-grid">
            <label class="v71-checkbox" for="v71-canva-asset-rights">
              <input type="checkbox" id="v71-canva-asset-rights" />
              <span class="v71-checkbox-label">Assetrechte bestätigt (falls Assets verwendet werden)</span>
            </label>
            <label class="v71-checkbox" for="v71-canva-brand-rights">
              <input type="checkbox" id="v71-canva-brand-rights" checked />
              <span class="v71-checkbox-label">Markenrechte bestätigt</span>
            </label>
          </div>
          <p class="form-note">Datenklassifizierung im ersten Pilot: ausschließlich NORMAL. Kein Kundendaten-, Gesundheits- oder Kinderbezug, kein privates Brand-Kit.</p>
          <div class="button-row">
            <button class="primary-button" type="submit">Designauftrag vorbereiten</button>
          </div>
          <p class="form-note" id="v71-canva-prepare-status" aria-live="polite"></p>
        </form>

        <section class="panel">
          <div class="section-head">
            <div><p class="eyebrow">Bestand</p><h3>Vorbereitete Canva-Aufträge (${jobPackages.length})</h3></div>
          </div>
          ${
            jobPackages.length
              ? `<ul class="v71-card-list">${jobPackages.map(renderCanvaPackageCard).join("")}</ul>`
              : `<div class="empty-state">Für dieses Projekt ist noch kein Canva-Auftrag vorbereitet. Nutze die Primäraktion oben.</div>`
          }
          <p class="form-note">Jede Freigabe (Briefing, Assets/Rechte, externe Übertragung, Kostenrahmen) ist ein eigener, getrennter Schritt. Veröffentlichung bleibt immer eine eigene, spätere Freigabe.</p>
        </section>
      </div>`;

    byId("v71-canva-project").addEventListener("change", (event) => {
      canvaSelectedProjectId = event.target.value;
      renderCanvaView();
    });

    byId("v71-canva-prepare-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const statusEl = byId("v71-canva-prepare-status");
      statusEl.textContent = "Wird vorbereitet…";
      const payload = {
        projectId: byId("v71-canva-project").value,
        customerId: byId("v71-canva-customer").value,
        brandId: byId("v71-canva-brand").value,
        campaignId: byId("v71-canva-campaign").value,
        designOperation: "GENERATE_NEW_DESIGN",
        designType: byId("v71-canva-design-type").value,
        title: byId("v71-canva-title").value.trim(),
        brief: byId("v71-canva-brief").value.trim(),
        primaryMessage: byId("v71-canva-message").value.trim(),
        dataClassification: "NORMAL",
        assetRightsConfirmed: byId("v71-canva-asset-rights").checked,
        brandRightsConfirmed: byId("v71-canva-brand-rights").checked,
        costPackageStatus: byId("v71-canva-cost-package-status").value,
      };
      const result = await canvaPostAction("/api/v71/canva/job-package/prepare", payload);
      if (result.ok && result.json?.ok) {
        statusEl.textContent = "Auftragspaket vorbereitet (DRAFT). Noch keine Ausführung, keine externe Übertragung.";
        renderCanvaView();
      } else {
        statusEl.textContent = result.json?.message || "Vorbereitung nicht möglich.";
      }
    });

    container.querySelectorAll("[data-canva-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const jobPackageId = button.getAttribute("data-job-package-id");
        const action = button.getAttribute("data-canva-action");
        const statusEl = container.querySelector(`[data-canva-package-status="${jobPackageId}"]`);
        if (statusEl) statusEl.textContent = "Wird verarbeitet…";
        try {
          if (action === "validate") {
            await canvaPostAction("/api/v71/canva/job-package/validate", { jobPackageId });
          } else if (action === "approve-briefing") {
            await canvaPostAction("/api/v71/canva/job-package/approve-briefing", { jobPackageId });
          } else if (action === "approve-assets") {
            await canvaPostAction("/api/v71/canva/job-package/approve-assets-and-rights", { jobPackageId });
          } else if (action === "approve-transfer") {
            await canvaPostAction("/api/v71/canva/job-package/approve-external-transfer", { jobPackageId });
          } else if (action === "approve-cost") {
            await canvaPostAction("/api/v71/canva/job-package/approve-cost", { jobPackageId, internalCostApprovalStatus: "WITHIN_APPROVED_LIMIT" });
          } else if (action === "handoff") {
            const tokenResult = await canvaPostAction("/api/v71/canva/handoff/request-token", { jobPackageId, providerOperation: "GENERATE_DESIGN_CANDIDATES" });
            if (!tokenResult.ok || !tokenResult.json?.ok) {
              if (statusEl) statusEl.textContent = (tokenResult.json?.missing || []).join(", ") || "Handoff-Voraussetzungen nicht erfüllt.";
              renderCanvaView();
              return;
            }
            const handoffResult = await canvaPostAction("/api/v71/canva/handoff/prepare", {
              jobPackageId,
              providerOperation: "GENERATE_DESIGN_CANDIDATES",
              token: tokenResult.json.token,
            });
            if (statusEl) {
              statusEl.textContent = handoffResult.json?.ok
                ? "Hand-off vorbereitet (Designkandidaten anfordern). Tatsächliche Ausführung noch nicht gestartet – erfolgt außerhalb dieses Servers nach Jamals Freigabe."
                : handoffResult.json?.message || "Hand-off nicht möglich.";
            }
          } else if (action === "check-result") {
            if (statusEl) statusEl.textContent = "Kandidatenprüfung und -auswahl erfolgen über die strukturierte Ergebnisrückführung (Providerstatus, danach getrennte Kandidatenauswahl, danach Jamal-Abnahme).";
          } else if (action === "approve-customer-draft") {
            const draftResult = await canvaPostAction("/api/v71/canva/job-package/approve-customer-draft", { jobPackageId });
            if (statusEl) {
              statusEl.textContent = draftResult.json?.ok
                ? "Kundenentwurf freigegeben. Das ist keine Veröffentlichungsfreigabe."
                : draftResult.json?.message || "Kundenentwurfsfreigabe nicht möglich.";
            }
          } else if (action === "request-customer-draft-changes") {
            const note = window.prompt("Welche Änderung soll der Kunde erhalten? (kurze Notiz)", "");
            if (note === null) return;
            const changesResult = await canvaPostAction("/api/v71/canva/job-package/request-customer-draft-changes", { jobPackageId, note });
            if (statusEl) {
              statusEl.textContent = changesResult.json?.ok ? "Änderungswunsch erfasst." : changesResult.json?.message || "Änderungswunsch nicht möglich.";
            }
          }
        } catch (_error) {
          if (statusEl) statusEl.textContent = "Aktion nicht möglich.";
        }
        renderCanvaView();
      });
    });
  }

  function initV71Views() {
    renderDocumentsView();
    renderToolsView();
    renderPluginGatewayView();
    renderHeygenView();
    renderCanvaView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initV71Views);
  } else {
    initV71Views();
  }

  window.V71Ui = {
    renderDocumentsView,
    renderToolsView,
    renderPluginGatewayView,
    renderHeygenView,
    renderCanvaView,
  };
})();
