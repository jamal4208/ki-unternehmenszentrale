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
 *
 * V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen"): die
 * beiden Freigabegrenzen (approve-for-execution/approve-completion) waren
 * zuvor über die Oberfläche technisch NICHT erreichbar (ein Klick zeigte
 * ausschließlich einen Hinweistext, ohne jemals `confirmed: true` zu
 * senden). Ersetzt wird das durch eine echte, bewusst reibungsbehaftete
 * Bestätigungsfläche (state.jamalConfirmation): ein Klick auf die
 * Primäraktion öffnet AUSSCHLIESSLICH lokalen Zustand (kein API-Aufruf),
 * zeigt Auftrag/Aktion/Tragweite, erfordert eine aktiv gesetzte Checkbox
 * und sendet `confirmed: true` erst nach einem zusätzlichen, eigenen
 * Bestätigungsklick (siehe openJamalConfirmationDialog/
 * confirmJamalConfirmation unten). Abbrechen/Schließen ändert nie einen
 * Status. Kein anderer Codepfad in dieser Datei setzt `confirmed: true`.
 */

(function () {
  var CANONICAL_PILOT_ORDER_ID = "pilot-three-agent-work-order-v1";

  // V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): rein additive,
  // optionale Abhängigkeit auf das deterministische, browserlokale
  // Vorschlagsmodul (siehe pilot-work-order-draft-profiles.js). Im Browser
  // lädt index.html dieses Skript VOR pilot-work-order-ui.js, wodurch der
  // globale Namensraum bereits verfügbar ist; in Node-Tests wird es per
  // require() geladen (gleiches Erkennungsmuster wie daily-work-run.js).
  // Fehlt das Modul aus irgendeinem Grund, bleibt ausschließlich die neue
  // Vorschlagsaktion inaktiv – das bestehende, manuelle Anlageformular ist
  // davon vollständig unberührt.
  var pilotWorkOrderDraftProfiles =
    typeof module === "object" && module.exports
      ? require("./pilot-work-order-draft-profiles")
      : (typeof window !== "undefined" && window && window.PilotWorkOrderDraftProfiles) || null;

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
    // Phase 8 ("vollständige echte Drei-Agenten-Kette als kontrollierter
    // Nachtlauf"): exakt dasselbe Muster wie codexApprovalToken oben, nur
    // je Kettenschritt (Schlüssel "<chainId>::<chainStep>"), da mehrere
    // Ketten je Auftrag existieren können und jede Stufe eine eigene,
    // kurzlebige Einzelfreigabe benötigt. Wird bei jedem Auftragswechsel
    // und nach jedem Startversuch verworfen – kein dauerhaftes
    // Wiederverwenden eines bereits ausgestellten Tokens.
    chainStepApprovalTokens: {},
    chainActionInFlight: false,
    chainActionError: null,
    chainActionErrorReasonCode: null,
    // V7.9.0 ("Intuitiver Arbeitsfluss und sichtbarer Agentenstatus"):
    // kurzer lokaler Start-Zwischenzustand zwischen Startklick und erster
    // bestätigter Serverantwort. Form:
    // { pilotOrderId, chainId, chainStep, acceptedAtMs, connectionInterrupted }.
    chainStartBridge: null,
    // Kontrolliertes Polling (genau ein Poller je ausgewähltem Auftrag).
    statusPollingOrderId: null,
    statusPollingTimerId: null,
    statusPollingInFlight: false,
    statusPollingStartedAtMs: null,
    statusPollingErrorCount: 0,
    statusPollingRetryNoticeActive: false,
    statusPollingStoppedByErrors: false,
    statusPollingStoppedBySafetyCap: false,
    // Korrekturlauf V7.8.0: lokale Checkbox-Auswahl für
    // "Neue Agentenkette vorbereiten" (null = noch nicht initialisiert für
    // den aktuell ausgewählten Auftrag).
    chainSelectedFiles: null,
    // V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen"): die
    // einzige Stelle, an der `confirmed: true` jemals versendet wird (siehe
    // confirmJamalConfirmation unten). Ausschließlich lokaler Zustand –
    // niemals in localStorage, niemals in der URL. Wird bei jedem
    // Auftragswechsel verworfen (siehe selectOrder) und nach jedem
    // erfolgreichen Bestätigungsversuch wieder auf null gesetzt.
    // Form: { action, pilotOrderId, orderTitle, checked, submitting, error }.
    jamalConfirmation: null,
    // V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): rein lokaler,
    // nicht persistierter Zustand des zuletzt gebauten Arbeitsvorschlags.
    // draftResult ist die unveränderte Rückgabe von
    // pilotWorkOrderDraftProfiles.buildPilotWorkOrderDraft() (oder null,
    // solange noch kein Vorschlag erzeugt wurde). draftFilledValues bildet
    // Formularfeld-ID -> zuletzt eingesetzter Vorschlagswert ab (nur bei
    // outcome === "DRAFT" gesetzt) und dient ausschließlich dem Vergleich
    // "Von dir geändert" (aktueller DOM-Wert weicht vom zuletzt eingesetzten
    // Vorschlagswert ab) – niemals einer automatischen Neuberechnung oder
    // einem Überschreiben. draftSentenceAtBuild ist der Satz, zu dem der
    // aktuell angezeigte Vorschlag gehört (für den Hinweis "Satz geändert").
    // Wird bei jedem Schließen des Anlageformulars sowie nach jeder
    // erfolgreichen Anlage vollständig geleert (siehe
    // toggle-create-form/submitCreateOrder unten).
    draftResult: null,
    draftFilledValues: null,
    draftSentenceAtBuild: null,
    // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
    // bedienbar machen"): rein lokaler, nicht persistierter Entwurf einer
    // KLASSISCHEN Rollenübergabe (submit-handoff), unabhängig vom
    // Kettenkonzept (chainStartBridge/chainStepApprovalTokens oben). Wird
    // ausschließlich durch openHandoffDraft() gesetzt (kein Request beim
    // Öffnen) und durch submitHandoffDraft() bei Erfolg wieder auf null
    // gesetzt. Form: { pilotOrderId, sourceLabel, submitting, error }. Die
    // eigentlichen Feldwerte leben – wie beim bestehenden Anlageformular
    // (siehe DRAFT_FIELD_TARGETS/CREATE_FORM_FIELD_IDS oben) – bewusst im
    // DOM (HANDOFF_DRAFT_FIELD_TARGETS unten), nicht in diesem Objekt.
    handoffDraft: null,
    // Arbeitspaket Rückgabe Pilotauftrag ("Rückgabe im Pilotauftrag über die
    // Oberfläche bedienbar machen"): rein lokaler, nicht persistierter
    // Rückgabezustand für GENAU einen Auftrag. Wird ausschließlich durch
    // openReturnDraft() gesetzt (kein Request beim Öffnen), durch
    // cancelReturnDraft() bzw. bei jedem Auftragswechsel (siehe selectOrder)
    // verworfen und nach erfolgreicher Rückgabe wieder auf null gesetzt.
    // Form: { pilotOrderId, submitting, error }. Der eingegebene Grund lebt –
    // wie beim Rollenübergabe-Entwurf oben – bewusst im DOM
    // (RETURN_DRAFT_NOTE_FIELD_ID unten), nicht in diesem Objekt.
    returnDraft: null,
  };

  var STATUS_POLLING_INTERVAL_MS = 5000;
  var STATUS_POLLING_MAX_DURATION_MS = 15 * 60 * 1000;
  var CHAIN_RUNNING_STATUSES = {
    RESEARCH_RUNNING: true,
    DOCUMENTATION_RUNNING: true,
    PM_RUNNING: true,
  };
  var CHAIN_STATUS_TO_STEP_NUMBER = {
    RESEARCH_RUNNING: 1,
    DOCUMENTATION_RUNNING: 2,
    PM_RUNNING: 3,
  };
  function createDefaultStatusTimeHooks() {
    return {
      now: function () {
        return Date.now();
      },
      setTimeout: function (callback, delayMs) {
        return setTimeout(callback, delayMs);
      },
      clearTimeout: function (timerId) {
        clearTimeout(timerId);
      },
      createTimeFormatter: function () {
        if (typeof Intl === "object" && Intl && typeof Intl.DateTimeFormat === "function") {
          return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
        }
        return null;
      },
    };
  }
  var statusTimeHooks = createDefaultStatusTimeHooks();

  function setStatusTimeHooksForTests(overrides) {
    var nextHooks = createDefaultStatusTimeHooks();
    if (overrides && typeof overrides === "object") {
      if (typeof overrides.now === "function") nextHooks.now = overrides.now;
      if (typeof overrides.setTimeout === "function") nextHooks.setTimeout = overrides.setTimeout;
      if (typeof overrides.clearTimeout === "function") nextHooks.clearTimeout = overrides.clearTimeout;
      if (typeof overrides.createTimeFormatter === "function") nextHooks.createTimeFormatter = overrides.createTimeFormatter;
    }
    statusTimeHooks = nextHooks;
  }

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

  function nowMs() {
    return statusTimeHooks.now();
  }

  function parseTimestampMs(isoValue) {
    if (!isNonEmptyString(isoValue)) return null;
    var value = Date.parse(isoValue);
    return Number.isFinite(value) ? value : null;
  }

  function formatLocalClockTime(isoValue) {
    var parsed = parseTimestampMs(isoValue);
    if (parsed === null) return null;
    var formatter = statusTimeHooks.createTimeFormatter();
    if (!formatter || typeof formatter.format !== "function") {
      var fallbackDate = new Date(parsed);
      var hour = String(fallbackDate.getHours()).padStart(2, "0");
      var minute = String(fallbackDate.getMinutes()).padStart(2, "0");
      return hour + ":" + minute;
    }
    return formatter.format(new Date(parsed));
  }

  function formatElapsedDurationFromMs(totalMs) {
    if (!Number.isFinite(totalMs) || totalMs < 0) return null;
    var totalSeconds = Math.floor(totalMs / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    if (minutes <= 0) {
      return seconds <= 3 ? "weniger als 5 Sekunden" : seconds + " Sekunden";
    }
    if (minutes < 10) {
      return minutes + (minutes === 1 ? " Minute" : " Minuten") + (seconds > 0 ? " " + seconds + " Sekunden" : "");
    }
    return minutes + (minutes === 1 ? " Minute" : " Minuten");
  }

  function runDurationFromRun(run) {
    if (!run) return null;
    var started = parseTimestampMs(run.startedAt);
    var finished = parseTimestampMs(run.finishedAt);
    if (started === null || finished === null || finished < started) return null;
    return formatElapsedDurationFromMs(finished - started);
  }

  function hasRunningChainStatus(chainStatus) {
    return Boolean(CHAIN_RUNNING_STATUSES[chainStatus]);
  }

  function hasServerRunningState(overview) {
    if (!overview) return false;
    var chains = Array.isArray(overview.agentChains) ? overview.agentChains : [];
    for (var i = 0; i < chains.length; i += 1) {
      var chain = chains[i];
      if (hasRunningChainStatus(chain.chainStatus)) return true;
      var steps = Array.isArray(chain.steps) ? chain.steps : [];
      for (var j = 0; j < steps.length; j += 1) {
        if (steps[j].stepStatus === "RUNNING") return true;
      }
    }
    var runs = Array.isArray(overview.agentExecutionRuns) ? overview.agentExecutionRuns : [];
    for (var r = 0; r < runs.length; r += 1) {
      if (runs[r].status === "RUNNING") return true;
    }
    return false;
  }

  function hasLocalStartBridgeForOrder(orderId) {
    return Boolean(state.chainStartBridge && state.chainStartBridge.pilotOrderId === orderId);
  }

  function clearChainStartBridgeForOrder(orderId) {
    if (hasLocalStartBridgeForOrder(orderId)) {
      state.chainStartBridge = null;
    }
  }

  function clearStatusPollingTimer() {
    if (state.statusPollingTimerId !== null && state.statusPollingTimerId !== undefined) {
      statusTimeHooks.clearTimeout(state.statusPollingTimerId);
    }
    state.statusPollingTimerId = null;
  }

  function stopStatusPolling(stopReason) {
    clearStatusPollingTimer();
    state.statusPollingInFlight = false;
    state.statusPollingOrderId = null;
    state.statusPollingStartedAtMs = null;
    state.statusPollingErrorCount = 0;
    state.statusPollingRetryNoticeActive = false;
    if (stopReason !== "poll-errors") {
      state.statusPollingStoppedByErrors = false;
    }
    if (stopReason !== "safety-cap") {
      state.statusPollingStoppedBySafetyCap = false;
    }
  }

  function shouldKeepPollingForOrder(orderId) {
    if (!orderId || state.selectedPilotOrderId !== orderId) return false;
    if (hasLocalStartBridgeForOrder(orderId)) return true;
    if (!state.overview || !state.overview.order || state.overview.order.id !== orderId) return false;
    return hasServerRunningState(state.overview);
  }

  function findChainById(overview, chainId) {
    if (!overview || !chainId) return null;
    var chains = Array.isArray(overview.agentChains) ? overview.agentChains : [];
    for (var i = 0; i < chains.length; i += 1) {
      if (chains[i].id === chainId) return chains[i];
    }
    return null;
  }

  function findChainStepByNumber(chain, chainStep) {
    var steps = chain && Array.isArray(chain.steps) ? chain.steps : [];
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].stepNumber === chainStep) return steps[i];
    }
    return null;
  }

  function findLatestChain(overview) {
    var chains = overview && Array.isArray(overview.agentChains) ? overview.agentChains : [];
    if (chains.length === 0) return null;
    return chains[chains.length - 1];
  }

  function resolveStepNumberFromChainStatus(chainStatus) {
    return CHAIN_STATUS_TO_STEP_NUMBER[chainStatus] || null;
  }

  function extractReasonCodeFromResponseData(data) {
    if (!data || typeof data !== "object") return null;
    if (isNonEmptyString(data.reasonCode)) return data.reasonCode.trim();
    if (isNonEmptyString(data.errorCode)) return data.errorCode.trim();
    return null;
  }

  function inferReasonCodeFromMessage(message) {
    var text = isNonEmptyString(message) ? message.toLowerCase() : "";
    if (!text) return null;
    if (text.indexOf("nicht verf") !== -1 && text.indexOf("codex") !== -1) {
      return "CODEX_UNAVAILABLE";
    }
    return null;
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

  function isChainStepServerTerminal(chain, step) {
    if (!chain) return false;
    if (chain.chainStatus === "FAILED" || chain.chainStatus === "BLOCKED" || chain.chainStatus === "COMPLETED") {
      return true;
    }
    if (!step) return false;
    return step.stepStatus === "SUCCEEDED" || step.stepStatus === "FAILED";
  }

  function syncLocalStartBridgeFromOverview(orderId) {
    if (!hasLocalStartBridgeForOrder(orderId) || !state.overview) return;
    var bridge = state.chainStartBridge;
    var chain = findChainById(state.overview, bridge.chainId);
    var step = findChainStepByNumber(chain, bridge.chainStep);
    if (hasServerRunningState(state.overview)) return;
    if (isChainStepServerTerminal(chain, step)) {
      state.chainStartBridge = null;
    }
  }

  function scheduleStatusPollingTick(orderId, delayMs) {
    if (state.selectedPilotOrderId !== orderId || state.statusPollingOrderId !== orderId) return;
    clearStatusPollingTimer();
    state.statusPollingTimerId = statusTimeHooks.setTimeout(function () {
      runStatusPollingTick(orderId);
    }, delayMs);
  }

  function registerStatusPollingFailure() {
    state.statusPollingErrorCount += 1;
    state.statusPollingRetryNoticeActive = true;
    if (state.statusPollingErrorCount >= 3) {
      state.statusPollingStoppedByErrors = true;
      stopStatusPolling("poll-errors");
      render();
      return;
    }
    render();
    scheduleStatusPollingTick(state.selectedPilotOrderId, STATUS_POLLING_INTERVAL_MS);
  }

  function runStatusPollingTick(orderId) {
    if (!orderId) return;
    if (state.selectedPilotOrderId !== orderId || state.statusPollingOrderId !== orderId) return;
    if (state.statusPollingInFlight) return;
    if (state.statusPollingStartedAtMs !== null && nowMs() - state.statusPollingStartedAtMs >= STATUS_POLLING_MAX_DURATION_MS) {
      state.statusPollingStoppedBySafetyCap = true;
      stopStatusPolling("safety-cap");
      render();
      return;
    }
    state.statusPollingInFlight = true;
    state.statusPollingTimerId = null;
    fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(orderId))
      .then(function (response) {
        if (state.selectedPilotOrderId !== orderId || state.statusPollingOrderId !== orderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok && response.data.overview) {
          state.overview = response.data.overview;
          state.overviewError = null;
          state.statusPollingErrorCount = 0;
          state.statusPollingRetryNoticeActive = false;
          syncLocalStartBridgeFromOverview(orderId);
          render();
          if (!shouldKeepPollingForOrder(orderId)) {
            stopStatusPolling("resolved");
            render();
            return;
          }
          scheduleStatusPollingTick(orderId, STATUS_POLLING_INTERVAL_MS);
          return;
        }
        registerStatusPollingFailure();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== orderId || state.statusPollingOrderId !== orderId) return;
        registerStatusPollingFailure();
      })
      .finally(function () {
        if (state.selectedPilotOrderId === orderId) {
          state.statusPollingInFlight = false;
        }
      });
  }

  function startStatusPolling(forceRestart) {
    var orderId = state.selectedPilotOrderId;
    if (!orderId) return;
    var alreadyRunning = state.statusPollingOrderId === orderId && (state.statusPollingInFlight || state.statusPollingTimerId !== null);
    if (alreadyRunning && !forceRestart) return;
    if (state.statusPollingStoppedByErrors && !forceRestart) return;
    stopStatusPolling("restart");
    state.statusPollingOrderId = orderId;
    state.statusPollingStartedAtMs = nowMs();
    state.statusPollingErrorCount = 0;
    state.statusPollingRetryNoticeActive = false;
    state.statusPollingStoppedByErrors = false;
    state.statusPollingStoppedBySafetyCap = false;
    runStatusPollingTick(orderId);
  }

  function syncStatusPollingFromOverview() {
    var orderId = state.selectedPilotOrderId;
    if (!orderId) {
      stopStatusPolling("order-change");
      return;
    }
    if (!state.overview || !state.overview.order || state.overview.order.id !== orderId) return;
    if (shouldKeepPollingForOrder(orderId)) {
      if (!state.statusPollingStoppedByErrors && !state.statusPollingStoppedBySafetyCap) {
        startStatusPolling(false);
      }
      return;
    }
    if (state.statusPollingOrderId === orderId) {
      stopStatusPolling("resolved");
    }
  }

  var pagehidePollingStopBound = false;
  function bindPagehidePollingStopOnce() {
    if (pagehidePollingStopBound) return;
    if (typeof window === "undefined" || !window || typeof window.addEventListener !== "function") return;
    pagehidePollingStopBound = true;
    window.addEventListener("pagehide", function () {
      stopStatusPolling("pagehide");
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
    stopStatusPolling("init");
    state.chainStartBridge = null;
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
        syncStatusPollingFromOverview();
        render();
        return loadOrdersList();
      });
  }

  // Auftragswechsel (Auftrag Abschnitt 2): löscht die zuvor angezeigten
  // Daten sofort, bevor der neue Auftrag geladen wird – niemals werden
  // Daten des vorherigen Auftrags während des Ladens weiter angezeigt.
  function selectOrder(orderId) {
    if (!orderId || orderId === state.selectedPilotOrderId) return Promise.resolve();
    stopStatusPolling("order-change");
    state.chainStartBridge = null;
    state.selectedPilotOrderId = orderId;
    state.overview = null;
    state.overviewLoading = true;
    state.overviewError = null;
    state.actionError = null;
    state.conflict = null;
    state.codexApprovalToken = null;
    state.codexApprovalError = null;
    state.chainStepApprovalTokens = {};
    state.chainActionError = null;
    state.chainActionErrorReasonCode = null;
    state.chainSelectedFiles = null;
    // Ein Auftragswechsel verwirft eine ggf. offene Jamal-Bestätigungsfläche
    // ohne jeden API-Aufruf (kein Status ändert sich dadurch) – dieselbe
    // Grundregel wie für codexApprovalToken/chainStepApprovalTokens oben.
    state.jamalConfirmation = null;
    // V8.0.1 ("Auftragswechsel setzt einen offenen Handoff-Entwurf zurück"):
    // ein Rollenübergabe-Entwurf gehört ausschließlich zum zuvor
    // ausgewählten Auftrag – kein API-Aufruf, kein Statuswechsel, reines
    // Verwerfen des lokalen Zustands (gleiche Grundregel wie
    // jamalConfirmation oben).
    state.handoffDraft = null;
    // Arbeitspaket Rückgabe Pilotauftrag: eine offene Rückgabefläche gehört
    // ausschließlich zum zuvor ausgewählten Auftrag. Ohne diesen Reset
    // bliebe ein bereits eingegebener Rückgabegrund beim Auftragswechsel für
    // den falschen Auftrag stehen. Reines Verwerfen des lokalen Zustands –
    // kein API-Aufruf, kein Statuswechsel (gleiche Grundregel wie
    // handoffDraft/jamalConfirmation oben).
    state.returnDraft = null;
    // Korrekturlauf F5 (V8.0): der flüchtige V8.0-Vorschlagszustand des
    // Anlageformulars (draftResult/draftFilledValues/draftSentenceAtBuild)
    // gehört ausschließlich zum zuvor geöffneten Auftrag – ohne diesen
    // Reset blieb ein "Von dir geändert"-Vorschlag über den Auftragswechsel
    // hinweg sichtbar. Dieselbe Funktion wie beim Schließen des
    // Anlageformulars/nach erfolgreicher Anlage (siehe
    // bindActionHandlersOnce/submitCreateOrder) – kein zweiter Reset-Pfad.
    resetDraftState();
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
      syncStatusPollingFromOverview();
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
        state.chainActionError = null;
        state.chainActionErrorReasonCode = null;
      } else if (response.statusCode === 404) {
        state.overview = null;
        state.overviewError = "Dieser Pilotauftrag wurde nicht gefunden.";
      } else {
        state.overviewError = "Der Pilotauftrag konnte nicht geladen werden.";
      }
      syncStatusPollingFromOverview();
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
  //
  // V7.9.7 ("Formularinhalt nach Validierungs-/Serverfehler erhalten"):
  // renderOrderListOutput() ersetzt bei JEDEM render() das komplette
  // innerHTML des Listen-/Anlage-Containers (siehe unten). Ein echter
  // Browser baut dabei alle Kindknoten – inklusive der Anlage-Formularfelder
  // – neu auf; createFormField() liefert bewusst keinen `value`-Wert, daher
  // starten neu erzeugte Felder immer leer. Bei einem fehlgeschlagenen
  // Anlageversuch (lokale Validierung, HTTP 400/409, Netzwerkfehler) blieb
  // state.createOpen weiterhin true, wodurch render() erneut aufgerufen und
  // das Formular unbeabsichtigt geleert wurde. CREATE_FORM_FIELD_IDS sowie
  // capture-/restoreCreateFormFieldValues fangen genau diesen
  // Neuaufbau ab: unmittelbar vor dem Ersetzen des innerHTML werden die
  // aktuell im DOM stehenden Werte gelesen und danach – sofern das Formular
  // weiterhin geöffnet ist – in die frisch erzeugten Felder zurückgeschrieben.
  // Nach einer ERFOLGREICHEN Anlage wird state.createOpen bewusst auf false
  // gesetzt, bevor render() läuft: die Formularfelder werden dann gar nicht
  // erst neu erzeugt (renderCreateForm() wird übersprungen) – das bisherige,
  // gewünschte Leeren des Formulars nach Erfolg bleibt dadurch unverändert.
  // -----------------------------------------------------------------------

  // V8.0: das neue Satzfeld steht ZUERST, damit es beim selben
  // Neuaufbau-/Erhaltungsmechanismus (siehe Kommentar oben) exakt wie die
  // acht bestehenden Felder behandelt wird – erhalten bei render(), HTTP
  // 400/409 und Netzwerkfehler.
  var DRAFT_SENTENCE_FIELD_ID = "pilot-order-draft-sentence";

  var CREATE_FORM_FIELD_IDS = [
    DRAFT_SENTENCE_FIELD_ID,
    "pilot-order-create-title",
    "pilot-order-create-desired-outcome",
    "pilot-order-create-requested-by",
    "pilot-order-create-quality-criteria",
    "pilot-order-create-allowed-tools",
    "pilot-order-create-forbidden-actions",
    "pilot-order-create-required-approvals",
    "pilot-order-create-timeframe",
  ];

  // Formularfeld-ID -> Schlüssel in draft.fields (buildPilotWorkOrderDraft-
  // Rückgabe) sowie ob der Wert ein Array ist (eine Zeile je Eintrag, exakt
  // wie gatherCreateFormInput()/lines() es beim Absenden wieder einliest).
  var DRAFT_FIELD_TARGETS = [
    { id: "pilot-order-create-title", key: "title", isArray: false },
    { id: "pilot-order-create-desired-outcome", key: "desiredOutcome", isArray: false },
    { id: "pilot-order-create-requested-by", key: "requestedBy", isArray: false },
    { id: "pilot-order-create-quality-criteria", key: "qualityCriteria", isArray: true },
    { id: "pilot-order-create-allowed-tools", key: "allowedTools", isArray: true },
    { id: "pilot-order-create-forbidden-actions", key: "forbiddenActions", isArray: true },
    { id: "pilot-order-create-required-approvals", key: "requiredApprovals", isArray: true },
    { id: "pilot-order-create-timeframe", key: "timeframe", isArray: false },
  ];

  function captureCreateFormFieldValues() {
    var values = {};
    CREATE_FORM_FIELD_IDS.forEach(function (id) {
      var el = byId(id);
      if (el) values[id] = el.value;
    });
    return values;
  }

  function restoreCreateFormFieldValues(values) {
    if (!values) return;
    CREATE_FORM_FIELD_IDS.forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(values, id)) return;
      var el = byId(id);
      if (el) el.value = values[id];
    });
  }

  // V8.0: rein lokaler Reset des Vorschlagszustands – niemals ein Auftrag,
  // niemals ein Request. Aufgerufen beim Schließen des Anlageformulars und
  // nach jeder erfolgreichen Anlage (siehe bindActionHandlersOnce/
  // submitCreateOrder unten).
  function resetDraftState() {
    state.draftResult = null;
    state.draftFilledValues = null;
    state.draftSentenceAtBuild = null;
  }

  function fieldValueFromDraft(fieldEntry, fields) {
    var raw = fields[fieldEntry.key];
    if (fieldEntry.isArray) {
      return Array.isArray(raw) ? raw.join("\n") : "";
    }
    return typeof raw === "string" ? raw : "";
  }

  // Einzige Stelle, die buildPilotWorkOrderDraft() aufruft. Rein
  // browserlokal und deterministisch: kein fetch, kein POST, keine
  // Speicherung, keine Kettenvorbereitung, keine Freigabe, kein
  // Agentenlauf. Bei DRAFT werden ausschließlich die acht bestehenden
  // DOM-Felder vorausgefüllt (keine neue Feld-ID, kein neues
  // Anlageverfahren). Bei UNSUPPORTED bleiben alle acht Felder unangetastet.
  function buildWorkDraft() {
    if (!pilotWorkOrderDraftProfiles || typeof pilotWorkOrderDraftProfiles.buildPilotWorkOrderDraft !== "function") return;
    var sentenceEl = byId(DRAFT_SENTENCE_FIELD_ID);
    var sentence = sentenceEl ? String(sentenceEl.value || "") : "";
    var overview = state.overview;
    var context = {
      chainSelectableFiles: chainSelectableFilesFromOverview(overview),
      chainRecommendedFiles: chainRecommendedFilesFromOverview(overview),
      involvedAgents: (overview && overview.involvedAgents) || [],
    };
    var result = pilotWorkOrderDraftProfiles.buildPilotWorkOrderDraft({ sentence: sentence, context: context });
    // V8.0 Abschnitt 7.8: "kein Überschreiben manueller Änderungen beim
    // erneuten Vorschlag". Ein Feld gilt bereits VOR diesem Aufbau als
    // manuell geändert, wenn sein aktueller DOM-Wert vom zuletzt
    // eingesetzten Vorschlagswert abweicht – genau dieses Feld bleibt beim
    // Einsetzen des neuen Vorschlags unangetastet (die "Von dir
    // geändert"-Markierung bleibt dadurch weiterhin sichtbar, da sie gegen
    // den NEUEN Vorschlagswert verglichen wird).
    //
    // Korrekturlauf F1 (V8.0): existiert noch KEIN previousFilledValues
    // (allererster Vorschlag in diesem Anlageformular), gab es bislang
    // keinen Vergleichswert – ein bereits manuell ausgefülltes Feld wurde
    // dadurch beim ersten Klick still überschrieben. Ohne einen früheren
    // Vorschlagswert gilt ein Feld deshalb bereits dann als manuell
    // eingegeben, wenn es nicht leer ist (siehe hasPreviousFilledValue
    // unten) – es wird dann genauso unangetastet gelassen wie ein Feld, das
    // vom zuletzt eingesetzten Vorschlagswert abweicht.
    var previousFilledValues = state.draftFilledValues;
    state.draftResult = result;
    state.draftSentenceAtBuild = sentence;
    if (result.outcome === "DRAFT" && result.fields) {
      var filledValues = {};
      DRAFT_FIELD_TARGETS.forEach(function (fieldEntry) {
        var value = fieldValueFromDraft(fieldEntry, result.fields);
        var el = byId(fieldEntry.id);
        var hasPreviousFilledValue =
          Boolean(previousFilledValues) && Object.prototype.hasOwnProperty.call(previousFilledValues, fieldEntry.id);
        var wasManuallyChanged = hasPreviousFilledValue
          ? Boolean(el) && el.value !== previousFilledValues[fieldEntry.id]
          : Boolean(el) && isNonEmptyString(el.value);
        if (el && !wasManuallyChanged) el.value = value;
        filledValues[fieldEntry.id] = value;
      });
      state.draftFilledValues = filledValues;
    }
    // UNSUPPORTED: state.draftFilledValues bleibt absichtlich unverändert –
    // ein vorheriger, erfolgreicher Vorschlag bleibt inhaltlich referenzierbar
    // (Grundlage für "Von dir geändert"), aber es wird kein Feld angefasst.
  }

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
    // V7.9.6 ("Doppelklickschutz beim Anlegen neuer Pilotaufträge"): das
    // `disabled` am Anlegen-Knopf greift erst nach dem Neuzeichnen. Ein
    // schneller Doppelklick (zweites Klickereignis vor dem Neuzeichnen)
    // konnte deshalb einen zweiten POST /orders auslösen. Gleiche
    // Absicherung wie bei runOrderAction/actionInFlight.
    if (state.creating) return Promise.resolve();
    var errors = validateCreateInput(input || {});
    if (errors.length > 0) {
      state.createError = "Bitte vervollst\u00e4ndigen: " + errors.join(", ") + ".";
      render();
      return Promise.resolve();
    }
    state.creating = true;
    state.createError = null;
    render();
    return fetchJson("/api/pilot-work-order/orders", { method: "POST", body: JSON.stringify(input) })
      .then(function (response) {
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
          state.jamalConfirmation = null;
          // V8.0: nach erfolgreicher Anlage wird der lokale Vorschlagszustand
          // vollständig geleert (kein Weiterbestehen für den nächsten,
          // unabhängigen Anlagevorgang) – keine Doppelanlage, kein
          // Wiederverwenden eines bereits verarbeiteten Vorschlags.
          resetDraftState();
          render();
          return loadOrdersList();
        }
        state.createError = (response.data && response.data.message) || "Der Pilotauftrag konnte nicht angelegt werden.";
        render();
      })
      .catch(function () {
        // V7.9.7: fetchJson() (letztlich fetch()) lehnt sein Promise bei
        // einem Netzwerk-/Verbindungsfehler ab (kein HTTP-Statuscode). Ohne
        // diesen Zweig blieb state.creating dauerhaft true (der
        // Anlegen-Knopf blieb dauerhaft gesperrt) und es gab keine
        // Fehlermeldung – der Fehler des Promise blieb unbehandelt.
        state.creating = false;
        state.createError = "Der Pilotauftrag konnte wegen eines Verbindungsproblems nicht angelegt werden. Bitte erneut versuchen.";
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
    return postAction(pilotOrderId, action, body)
      .then(function (response) {
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
              "Dieser Auftrag wurde zwischenzeitlich verändert. Der aktuelle Stand wurde noch nicht überschrieben. " +
              "Bitte laden Sie den Auftrag neu und prüfen Sie die nächste Aktion.",
          };
          render();
          return;
        }
        state.actionError = (response.data && response.data.message) || "Aktion ist im aktuellen Zustand nicht möglich.";
        render();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        state.actionError = "Die Aktion konnte wegen eines Verbindungsproblems nicht bestätigt werden. Bitte erneut versuchen.";
        render();
      })
      .finally(function () {
        state.actionInFlight = false;
        render();
      });
  }

  // ---------------------------------------------------------------------
  // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
  // bedienbar machen"): behebt die bekannte Integrationslücke zwischen der
  // Kette (bucht ausschließlich intern roleHandoffBooked, erzeugt NIEMALS
  // automatisch eine Zeile in pilot_handoffs – siehe
  // pilot-agent-execution-chain-service.js#finalizeChainStepSuccess/
  // pilot-agent-execution-service.js#finalizeAgentExecutionRun) und dem
  // klassischen Abschlussweg (submitForReview verlangt weiterhin
  // mindestens eine ANGENOMMENE klassische Rollenübergabe mit
  // toPilotRole=DOKUMENTATION/pmFilterStatus=PASSED, siehe
  // pilot-work-order-service.js#submitForReview). Diese Datei fügt
  // AUSSCHLIESSLICH einen bedienbaren Aufrufer der bereits bestehenden,
  // unveränderten submit-handoff-Route hinzu:
  //   - keine automatische Rollenübergabe,
  //   - keine automatische PM-Filter-Annahme außerhalb dieses Pfads,
  //   - keine automatische Abschlussprüfung (submit-for-review) und
  //   - keine automatische finale Abnahme.
  // Jamal muss den Entwurf ausdrücklich öffnen, prüfen/ändern und
  // einreichen (siehe openHandoffDraft/submitHandoffDraft unten).
  // ---------------------------------------------------------------------

  // Klassische Rollenzuordnung, exakt wie bei jedem bisherigen
  // automatischen Handoff-Versuch eines Agentenlaufs (siehe
  // pilot-agent-execution-service.js#attemptHandoffForSucceededRun:
  // handoffFromPilotRole/handoffToPilotRole sind dort für jedes bestehende
  // Preset fest RECHERCHE_ANALYSE -> DOKUMENTATION) – keine freie
  // Rollen-ID-Eingabe, keine neue Rollenkombination.
  var HANDOFF_DRAFT_FROM_ROLE = "RECHERCHE_ANALYSE";
  var HANDOFF_DRAFT_TO_ROLE = "DOKUMENTATION";
  var HANDOFF_DRAFT_FROM_ROLE_LABEL = "Recherche-/Analyse-Agent";
  var HANDOFF_DRAFT_TO_ROLE_LABEL = "Dokumentations-Agent";

  // Konservativer, klar erkennbarer Platzhalter (Auftrag Abschnitt 9): wird
  // ausschließlich für Pflichtfelder eingesetzt, die aus dem Kettenergebnis
  // NICHT eindeutig/mechanisch ableitbar sind. Niemals eine erfundene
  // Aussage, niemals eine stille Annahme – Jamal muss dies vor dem
  // Einreichen ausdrücklich prüfen.
  var HANDOFF_DRAFT_PLACEHOLDER = "[BITTE PRÜFEN UND AUSFÜLLEN \u2013 aus dem Kettenergebnis nicht eindeutig ableitbar]";

  var HANDOFF_DRAFT_FIELD_TARGETS = [
    { id: "pilot-handoff-draft-short-finding", key: "shortFinding", label: "Kurzbefund" },
    { id: "pilot-handoff-draft-result", key: "resultOrRecommendation", label: "Ergebnis/Empfehlung" },
    { id: "pilot-handoff-draft-basis", key: "basisUsed", label: "Grundlage" },
    { id: "pilot-handoff-draft-risk", key: "riskOrLimit", label: "Risiken/Grenzen" },
    { id: "pilot-handoff-draft-next-step", key: "nextStep", label: "N\u00e4chster Schritt" },
    { id: "pilot-handoff-draft-decision-needed", key: "decisionNeeded", label: "Ben\u00f6tigte Entscheidung (optional)" },
  ];
  var HANDOFF_DRAFT_FIELD_IDS = HANDOFF_DRAFT_FIELD_TARGETS.map(function (entry) {
    return entry.id;
  });
  var HANDOFF_DRAFT_REQUIRED_KEYS = ["shortFinding", "resultOrRecommendation", "basisUsed", "riskOrLimit", "nextStep"];

  // Alle klassischen Rollenübergaben dieses Auftrags, die (wie von
  // submitForReview vorausgesetzt) an die Dokumentation gerichtet sind.
  function documentationHandoffsFromOverview(overview) {
    var handoffs = (overview && overview.handoffs) || [];
    return handoffs.filter(function (handoff) {
      return handoff.toPilotRole === "DOKUMENTATION";
    });
  }

  // Exakt dieselbe Voraussetzung wie
  // pilot-work-order-service.js#submitForReview (hasPassedDocumentationHandoff):
  // mindestens EINE angenommene Dokumentations-Rollenübergabe, unabhängig
  // von ihrer Position in der Liste.
  function hasPassedDocumentationHandoff(overview) {
    return documentationHandoffsFromOverview(overview).some(function (handoff) {
      return handoff.pmFilterStatus === "PASSED";
    });
  }

  // Die zuletzt eingereichte Dokumentations-Rollenübergabe (für die
  // REJECTED-Anzeige, Auftrag Abschnitt 8.A.3) – unabhängig davon, ob
  // bereits eine frühere PASSED-Übergabe existiert (ein erneuter,
  // fehlgeschlagener Versuch soll weiterhin verständlich erklärt werden).
  function latestDocumentationHandoff(overview) {
    var list = documentationHandoffsFromOverview(overview);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  // Bevorzugte Quelle für den Entwurf (Auftrag Abschnitt 9): das Ergebnis
  // von Kettenschritt 3 (Projektmanager-Agent) der zuletzt vollständig
  // abgeschlossenen Kette dieses Auftrags. Rein lesend, verändert nichts.
  function findLatestCompletedChainPmResult(overview) {
    var chains = overview && Array.isArray(overview.agentChains) ? overview.agentChains : [];
    for (var i = chains.length - 1; i >= 0; i -= 1) {
      var chain = chains[i];
      if (chain.chainStatus !== "COMPLETED") continue;
      var step = findChainStepByNumber(chain, 3);
      if (!step || step.stepStatus !== "SUCCEEDED" || !step.executionRunId) continue;
      var run = findAgentExecutionRunById(overview, step.executionRunId);
      if (!run || run.status !== "SUCCEEDED") continue;
      return { chain: chain, step: step, run: run };
    }
    return null;
  }

  // Baut die Ausgangswerte des Entwurfs mechanisch aus dem Kettenergebnis
  // (Auftrag Abschnitt 9): keine neue KI-Zusammenfassung, keine
  // automatische Kürzung, keine erfundene Information. shortFinding/
  // basisUsed referenzieren ausschließlich bereits bekannte, strukturierte
  // Fakten (Ketten-/Lauf-ID, analysierte Dateien); resultOrRecommendation
  // ist das tatsächliche, unveränderte Ergebnis (resultRawText). riskOrLimit
  // ist aus dem freien Ergebnistext nicht eindeutig als einzelnes Feld
  // abgrenzbar und bleibt deshalb bewusst ein klar erkennbarer Platzhalter.
  function buildHandoffDraftFields(pmResult) {
    if (!pmResult) {
      return {
        values: {
          shortFinding: HANDOFF_DRAFT_PLACEHOLDER,
          resultOrRecommendation: HANDOFF_DRAFT_PLACEHOLDER,
          basisUsed: HANDOFF_DRAFT_PLACEHOLDER,
          riskOrLimit: HANDOFF_DRAFT_PLACEHOLDER,
          nextStep: "Projektmanager-Filter pr\u00fcft das Ergebnis; bei Annahme kann zur Abschlusspr\u00fcfung vorgelegt werden.",
          decisionNeeded: "",
        },
        sourceLabel:
          "Kein abgeschlossenes Kettenergebnis (Schritt 3, Projektmanager-Agent) f\u00fcr diesen Auftrag gefunden. " +
          "Bitte alle Felder vor dem Einreichen pr\u00fcfen und ausf\u00fcllen.",
      };
    }
    var chain = pmResult.chain;
    var run = pmResult.run;
    var analyzedFiles =
      run.resultSummary && Array.isArray(run.resultSummary.analyzedFiles) ? run.resultSummary.analyzedFiles : [];
    var resultText = isNonEmptyString(run.resultRawText) ? run.resultRawText.trim() : "";
    return {
      values: {
        shortFinding: "Kette " + chain.id + ", Schritt 3 (Projektmanager-Agent) erfolgreich abgeschlossen (Lauf " + run.id + ").",
        resultOrRecommendation: resultText || HANDOFF_DRAFT_PLACEHOLDER,
        basisUsed:
          "Ergebnis von Kettenschritt 3 (Projektmanager-Agent) der Kette " + chain.id + " (Lauf " + run.id + ")" +
          (analyzedFiles.length > 0 ? ", analysierte Dateien: " + analyzedFiles.join(", ") + "." : "."),
        riskOrLimit: HANDOFF_DRAFT_PLACEHOLDER,
        nextStep: "Projektmanager-Filter pr\u00fcft das Ergebnis; bei Annahme kann zur Abschlusspr\u00fcfung vorgelegt werden.",
        decisionNeeded: "",
      },
      sourceLabel: "Ergebnis von Kettenschritt 3 (Projektmanager-Agent), Lauf " + run.id + ".",
    };
  }

  function captureHandoffDraftFieldValues() {
    var values = {};
    HANDOFF_DRAFT_FIELD_IDS.forEach(function (id) {
      var el = byId(id);
      if (el) values[id] = el.value;
    });
    return values;
  }

  function restoreHandoffDraftFieldValues(values) {
    if (!values) return;
    HANDOFF_DRAFT_FIELD_IDS.forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(values, id)) return;
      var el = byId(id);
      if (el) el.value = values[id];
    });
  }

  function isHandoffDraftOpenForOrder(orderId) {
    return Boolean(state.handoffDraft) && state.handoffDraft.pilotOrderId === orderId;
  }

  // Öffnet den Entwurf für GENAU den aktuell ausgewählten Auftrag. Setzt
  // ausschließlich lokalen Zustand und (nach dem Neuaufbau des DOM) die
  // Ausgangswerte der Formularfelder – KEIN fetch, KEIN POST, KEINE
  // Datenbankänderung (Auftrag Abschnitt 8.B/13: "keine automatische
  // Statusänderung durch bloßes Öffnen des Entwurfs").
  function openHandoffDraft() {
    if (!state.selectedPilotOrderId || !state.overview) return;
    var pilotOrderId = state.selectedPilotOrderId;
    var built = buildHandoffDraftFields(findLatestCompletedChainPmResult(state.overview));
    state.handoffDraft = {
      pilotOrderId: pilotOrderId,
      sourceLabel: built.sourceLabel,
      submitting: false,
      error: null,
    };
    render();
    // Die Formularfelder existieren erst NACH diesem render() im DOM (siehe
    // renderHandoffDraftPanel unten) – jetzt die Ausgangswerte einsetzen
    // (gleiches Muster wie buildWorkDraft() für das Anlageformular oben).
    if (state.handoffDraft && state.handoffDraft.pilotOrderId === pilotOrderId) {
      HANDOFF_DRAFT_FIELD_TARGETS.forEach(function (fieldEntry) {
        var el = byId(fieldEntry.id);
        if (el) el.value = built.values[fieldEntry.key] || "";
      });
    }
  }

  // Verwerfen: ausschließlich lokalen Zustand verwerfen, niemals ein
  // Request. Ein laufender Einreichungsversuch blockiert das Verwerfen
  // (keine widersprüchliche Doppelaktion).
  function cancelHandoffDraft() {
    if (state.handoffDraft && state.handoffDraft.submitting) return;
    state.handoffDraft = null;
    render();
  }

  // Die EINZIGE Stelle in dieser Datei, die jemals die submit-handoff-Route
  // aufruft. Liest die aktuell im DOM stehenden Feldwerte (nicht den
  // ursprünglichen Vorschlag) ein – eine manuelle Änderung Jamals wird
  // dadurch immer eingereicht. Genau ein POST je Klick (submitting-Schutz,
  // gleiches Muster wie confirmJamalConfirmation/runOrderAction oben). Bei
  // HTTP 400/409/Netzwerkfehler bleibt der Entwurf mitsamt allen Feldwerten
  // vollständig erhalten und der Knopf wird wieder nutzbar – KEIN
  // automatischer Retry, KEIN automatisches submitForReview.
  function submitHandoffDraft() {
    var draft = state.handoffDraft;
    if (!draft || draft.submitting) return Promise.resolve();
    if (state.selectedPilotOrderId !== draft.pilotOrderId || !state.overview) return Promise.resolve();
    var pilotOrderId = draft.pilotOrderId;
    var expectedRevision = state.overview.order.revision;
    var fieldValues = {};
    HANDOFF_DRAFT_FIELD_TARGETS.forEach(function (fieldEntry) {
      var el = byId(fieldEntry.id);
      fieldValues[fieldEntry.key] = el ? String(el.value || "") : "";
    });
    var missingLabels = HANDOFF_DRAFT_FIELD_TARGETS.filter(function (fieldEntry) {
      return HANDOFF_DRAFT_REQUIRED_KEYS.indexOf(fieldEntry.key) !== -1 && !isNonEmptyString(fieldValues[fieldEntry.key]);
    }).map(function (fieldEntry) {
      return fieldEntry.label;
    });
    if (missingLabels.length > 0) {
      draft.error = "Bitte vervollst\u00e4ndigen: " + missingLabels.join(", ") + ".";
      render();
      return Promise.resolve();
    }
    draft.submitting = true;
    draft.error = null;
    render();
    var body = {
      fromPilotRole: HANDOFF_DRAFT_FROM_ROLE,
      toPilotRole: HANDOFF_DRAFT_TO_ROLE,
      shortFinding: fieldValues.shortFinding,
      resultOrRecommendation: fieldValues.resultOrRecommendation,
      basisUsed: fieldValues.basisUsed,
      riskOrLimit: fieldValues.riskOrLimit,
      nextStep: fieldValues.nextStep,
      decisionNeeded: fieldValues.decisionNeeded,
      expectedRevision: expectedRevision,
    };
    return postAction(pilotOrderId, "submit-handoff", body)
      .then(function (response) {
        if (state.handoffDraft !== draft) return;
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok) {
          // Erfolg (Auftrag Abschnitt 8.C): Entwurf schließen, Overview neu
          // laden (zeigt den neuen PM-Filterstatus, siehe renderHandoffs
          // unten) – KEIN automatisches submit-for-review, KEINE
          // automatische Abnahme.
          state.handoffDraft = null;
          state.actionError = null;
          state.conflict = null;
          return reloadSelectedOrder();
        }
        // 400/409/jeder andere Fehlerstatus (Auftrag Abschnitt 8.D): der
        // Entwurf bleibt bewusst GEÖFFNET, alle Feldwerte bleiben
        // unangetastet im DOM stehen (kein render()-Pfad überschreibt sie,
        // siehe renderSelectedOrderOutput#capture/restore unten) – nur
        // `submitting` wird zurückgesetzt und eine verständliche
        // Fehlermeldung angezeigt. Kein automatischer Retry.
        draft.submitting = false;
        draft.error =
          (response.data && response.data.message) ||
          "Die Rollen\u00fcbergabe konnte nicht eingereicht werden. Der bisherige Status bleibt unver\u00e4ndert.";
        render();
      })
      .catch(function () {
        if (state.handoffDraft !== draft) return;
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        draft.submitting = false;
        draft.error = "Die Rollen\u00fcbergabe konnte wegen eines Verbindungsproblems nicht eingereicht werden. Bitte erneut versuchen.";
        render();
      });
  }

  function renderHandoffDraftField(fieldEntry, disabled) {
    return (
      '<label class="pilot-handoff-draft-field">' +
      escapeHtml(fieldEntry.label) +
      '<textarea id="' +
      fieldEntry.id +
      '"' +
      (disabled ? " disabled" : "") +
      "></textarea></label>"
    );
  }

  // Rendert den vollständigen, änderbaren Übergabe-Entwurf (Auftrag
  // Abschnitt 8.B): benennt Von-Rolle, An-Rolle, Grundlage der Vorbefüllung,
  // alle Pflichtfelder der bestehenden submit-handoff-Route sowie den
  // ausdrücklichen Hinweis, dass noch nichts eingereicht wurde.
  function renderHandoffDraftPanel(draft) {
    var submitting = draft.submitting;
    var html = '<div class="pilot-handoff-draft" role="group" aria-label="Rollen\u00fcbergabe vorbereiten">';
    html += '<p class="pilot-handoff-draft-title"><strong>Rollen\u00fcbergabe vorbereiten</strong></p>';
    html += '<dl class="pilot-work-order-facts">';
    html += "<div><dt>Von Rolle</dt><dd>" + escapeHtml(HANDOFF_DRAFT_FROM_ROLE_LABEL) + "</dd></div>";
    html += "<div><dt>An Rolle</dt><dd>" + escapeHtml(HANDOFF_DRAFT_TO_ROLE_LABEL) + "</dd></div>";
    html += "<div><dt>Grundlage</dt><dd>" + escapeHtml(draft.sourceLabel) + "</dd></div>";
    html += "</dl>";
    HANDOFF_DRAFT_FIELD_TARGETS.forEach(function (fieldEntry) {
      html += renderHandoffDraftField(fieldEntry, submitting);
    });
    if (draft.error) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(draft.error) + "</p>";
    }
    html += "<p><em>Diese \u00dcbergabe wird erst mit deinem Klick eingereicht.</em></p>";
    html += '<div class="pilot-handoff-draft-buttons">';
    html += '<button type="button" data-action="cancel-handoff-draft"' + (submitting ? " disabled" : "") + ">Verwerfen</button>";
    html +=
      '<button type="button" class="primary-button" data-action="submit-handoff-draft"' +
      (submitting ? " disabled" : "") +
      ">" +
      (submitting ? "Wird eingereicht\u2026" : "Rollen\u00fcbergabe einreichen") +
      "</button>";
    html += "</div></div>";
    return html;
  }

  // ---------------------------------------------------------------------
  // Arbeitspaket Rückgabe Pilotauftrag ("Rückgabe im Pilotauftrag über die
  // Oberfläche bedienbar machen"): schließt eine reine Bedienlücke. Der
  // Server kann die Rückgabe seit V8.7 Stufe A vollständig
  // (pilot-work-order-service.js#returnOrder, Pflichtgrund `note`,
  // Zielstatus RETURNED, dauerhafte Speicherung in
  // pilot_work_order_decision_reasons) und die Route
  // (pilot-work-order-routes.js#PILOT_ACTIONS["return-order"], Felder
  // ausschließlich `note` und `expectedRevision`) existiert unverändert –
  // die Oberfläche hat diese Handlung bislang aber an drei Stellen
  // ANGEKÜNDIGT (openDecision in beiden Entscheidungsstatus, nextStep bei
  // READY_FOR_REVIEW), ohne sie bedienbar anzubieten. Dieses Modul fügt
  // AUSSCHLIESSLICH einen bedienbaren Aufrufer der bereits bestehenden,
  // unveränderten return-order-Route hinzu:
  //   - keine Serveränderung, keine neue Route, kein neuer Status,
  //   - genau zwei Status (READY_FOR_JAMAL_APPROVAL/READY_FOR_REVIEW),
  //   - IN_EXECUTION bleibt bewusst ohne Rückgabeaktion, obwohl der Service
  //     sie dort erlaubt (ein laufender Agentenlauf/Kettenschritt würde
  //     Race-/Recovery-Fragen aufwerfen, siehe
  //     pilot-agent-execution-service.js#attemptHandoffForSucceededRun, das
  //     seinerseits IN_EXECUTION verlangt),
  //   - block-order bleibt vollständig außerhalb dieses Pakets.
  //
  // Bewusst KEINE zweite Bestätigungsstufe (anders als
  // approve-for-execution/approve-completion): `returnOrder` verlangt
  // serverseitig kein `confirmed`, und RETURNED ist über
  // reopenFromReturned → DRAFT vollständig umkehrbar. Die Reibung entsteht
  // stattdessen aus dem bewussten Öffnen der Fläche (kein Request), dem
  // Pflichtgrund und einem eigenen zweiten Klick zum Absenden – exakt das
  // bereits etablierte Muster des Rollenübergabe-Entwurfs oben.
  //
  // Produktentscheidungen Jamals (verbindlich): sichtbarer Wortlaut
  // „Zur Überarbeitung zurückgeben“, identisch in beiden Status; die
  // positive Hauptaktion erhält in genau diesen beiden Status die
  // bestehende Klasse `primary-button`, die Rückgabe die bestehende Klasse
  // `secondary-button`. Kein Rot, keine Danger-Klasse, keine neue
  // CSS-Klasse – die Rückgabe ist eine normale, umkehrbare
  // Chefentscheidung, keine destruktive Aktion.
  // ---------------------------------------------------------------------

  // Der eingegebene Grund lebt bewusst im DOM (gleiches Muster wie
  // HANDOFF_DRAFT_FIELD_TARGETS/CREATE_FORM_FIELD_IDS oben) und wird bei
  // jedem render() gesichert und zurückgeschrieben (siehe
  // captureReturnDraftNoteValue/restoreReturnDraftNoteValue unten).
  var RETURN_DRAFT_NOTE_FIELD_ID = "pilot-return-draft-note";

  // Die einzigen beiden Status, in denen die Rückgabe über die Oberfläche
  // angeboten wird. Bewusst NICHT aus der Serverliste abgeleitet: der
  // Service erlaubt zusätzlich IN_EXECUTION (siehe Kopfkommentar oben).
  var RETURN_DRAFT_STATUSES = ["READY_FOR_JAMAL_APPROVAL", "READY_FOR_REVIEW"];

  function isReturnDraftStatus(status) {
    return RETURN_DRAFT_STATUSES.indexOf(status) !== -1;
  }

  function captureReturnDraftNoteValue() {
    var el = byId(RETURN_DRAFT_NOTE_FIELD_ID);
    return el ? el.value : null;
  }

  function restoreReturnDraftNoteValue(value) {
    if (value === null || value === undefined) return;
    var el = byId(RETURN_DRAFT_NOTE_FIELD_ID);
    if (el) el.value = value;
  }

  function isReturnDraftOpenForOrder(orderId) {
    return Boolean(state.returnDraft) && state.returnDraft.pilotOrderId === orderId;
  }

  // Öffnet die Rückgabefläche für GENAU den aktuell ausgewählten Auftrag.
  // Setzt ausschließlich lokalen Zustand – KEIN fetch, KEIN POST, KEINE
  // Statusänderung. Wird der Auftrag inzwischen in einem Status angezeigt,
  // in dem die Rückgabe nicht angeboten wird, passiert bewusst nichts.
  function openReturnDraft() {
    if (!state.selectedPilotOrderId || !state.overview) return;
    if (!isReturnDraftStatus(state.overview.status)) return;
    state.returnDraft = {
      pilotOrderId: state.selectedPilotOrderId,
      submitting: false,
      error: null,
    };
    render();
  }

  // Abbrechen: verwirft ausschließlich lokalen Zustand, niemals ein
  // Request. Es wurde zu keinem Zeitpunkt etwas gesendet, es gibt daher
  // nichts rückgängig zu machen. Ein laufender Absendeversuch blockiert das
  // Abbrechen (keine widersprüchliche Doppelaktion).
  function cancelReturnDraft() {
    if (state.returnDraft && state.returnDraft.submitting) return;
    state.returnDraft = null;
    render();
  }

  // Die EINZIGE Stelle in dieser Datei, die jemals die return-order-Route
  // aufruft. Genau ein POST je bewusstem Absendevorgang (submitting-Schutz,
  // gleiches Muster wie submitHandoffDraft/confirmJamalConfirmation oben).
  //
  // Die Oberfläche prüft AUSSCHLIESSLICH, dass der Grund nach trim() nicht
  // leer ist – jede weitere Regel (Mindestlänge 5, Höchstlänge 500, keine
  // Steuerzeichen/HTML/Zugangsdaten) bleibt Serverwahrheit
  // (pilot-work-order-service.js#validateDecisionReasonText) und wird als
  // Servermeldung in der bestehenden Fehlerfläche angezeigt. Bewusst KEINE
  // zweite Validierungslogik im Frontend, damit beide Seiten niemals
  // auseinanderlaufen können. Der eingegebene Text wird unverändert
  // gesendet (keine clientseitige Kürzung, kein stiller Umbau) – die
  // Normalisierung (trim, CRLF→LF) macht ausschließlich der Server.
  function submitReturnDraft() {
    var draft = state.returnDraft;
    if (!draft || draft.submitting) return Promise.resolve();
    if (state.selectedPilotOrderId !== draft.pilotOrderId || !state.overview) return Promise.resolve();
    var pilotOrderId = draft.pilotOrderId;
    var expectedRevision = state.overview.order.revision;
    var noteField = byId(RETURN_DRAFT_NOTE_FIELD_ID);
    var note = noteField ? String(noteField.value || "") : "";
    if (!isNonEmptyString(note)) {
      // Leer oder ausschließlich Leerzeichen: KEIN Request. Die Fläche
      // bleibt geöffnet, der eingegebene Text bleibt unangetastet stehen.
      draft.error = "Bitte einen Grund angeben.";
      render();
      return Promise.resolve();
    }
    draft.submitting = true;
    draft.error = null;
    render();
    return postAction(pilotOrderId, "return-order", { note: note, expectedRevision: expectedRevision })
      .then(function (response) {
        if (state.returnDraft !== draft) return;
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok) {
          // Erfolg: Fläche schließen und den Auftrag neu laden. Der
          // Freigabeknopf verschwindet dadurch zwangsläufig (renderPrimaryAction
          // rendert rein statusabhängig), „Erneut als Entwurf starten“
          // erscheint, und der gespeicherte Grund wird über die bereits
          // bestehende Gründe-Karte sichtbar (renderDecisionReasonCard).
          state.returnDraft = null;
          state.actionError = null;
          state.conflict = null;
          return reloadSelectedOrder();
        }
        if (response.statusCode === 409) {
          // Bestehendes Konfliktmuster (identisch zu
          // confirmJamalConfirmation/runOrderAction): nichts wurde
          // überschrieben, es wird nichts automatisch wiederholt und keine
          // zweite Rückgabe versucht – der Serverzustand bleibt die Wahrheit.
          var details = response.data || {};
          state.returnDraft = null;
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
        // 400/jeder andere Fehlerstatus: die Fläche bleibt bewusst geöffnet,
        // der eingegebene Grund bleibt im DOM stehen (siehe capture/restore
        // in renderSelectedOrderOutput unten) – nur `submitting` wird
        // zurückgesetzt. Kein automatischer Retry.
        draft.submitting = false;
        draft.error =
          (response.data && response.data.message) ||
          "Die R\u00fcckgabe konnte nicht gespeichert werden. Der bisherige Status bleibt unver\u00e4ndert.";
        render();
      })
      .catch(function () {
        if (state.returnDraft !== draft) return;
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        draft.submitting = false;
        draft.error =
          "Die R\u00fcckgabe konnte wegen eines Verbindungsproblems nicht gesendet werden. " +
          "Der bisherige Status bleibt unver\u00e4ndert. Bitte erneut versuchen.";
        render();
      });
  }

  // Die sekundäre Aktion neben der jeweiligen positiven Hauptaktion.
  // Bewusst dieselbe Beschriftung in beiden Entscheidungsstatus (ein
  // Statusübergang, ein Begriff) und bewusst eine eigene, von der
  // Routenaktion getrennte data-action: ein Klick darf NIEMALS unmittelbar
  // einen Request auslösen, sondern ausschließlich die Fläche öffnen.
  function renderReturnActionButton(disabledAttr) {
    return (
      '<button type="button" class="secondary-button" data-action="open-return-draft"' +
      disabledAttr +
      ">Zur \u00dcberarbeitung zur\u00fcckgeben</button>"
    );
  }

  // Rendert die Rückgabefläche. Bewusst ohne eigene CSS-Klasse und ohne
  // jede Änderung an styles.css: der klassenlose Container verhält sich
  // exakt wie der bereits produktiv abgenommene Rollenübergabe-Entwurf
  // (.pilot-handoff-draft besitzt keine einzige CSS-Regel), das Textfeld
  // trägt die globalen textarea-Regeln, die Knöpfe die bestehenden Klassen
  // primary-button/secondary-button und die Knopfzeile die bestehende
  // Klasse button-row. Kein role="alertdialog", kein aria-modal, kein
  // Modal – ausschließlich eine benannte Gruppe, wie beim
  // Rollenübergabe-Entwurf.
  function renderReturnDraftPanel(draft) {
    var submitting = draft.submitting;
    var disabledAttr = submitting ? " disabled" : "";
    var html = '<div role="group" aria-label="Zur \u00dcberarbeitung zur\u00fcckgeben">';
    html += "<p><strong>Zur \u00dcberarbeitung zur\u00fcckgeben</strong></p>";
    html +=
      "<p>Bitte kurz begr\u00fcnden, was noch fehlt oder ge\u00e4ndert werden soll. " +
      "Der Grund bleibt dauerhaft bei diesem Auftrag sichtbar.</p>";
    html +=
      "<label>Grund der R\u00fcckgabe<textarea id=\"" +
      RETURN_DRAFT_NOTE_FIELD_ID +
      '"' +
      disabledAttr +
      "></textarea></label>";
    if (draft.error) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(draft.error) + "</p>";
    }
    html += "<p><em>Der Auftrag wird erst mit deinem Klick zur\u00fcckgegeben.</em></p>";
    html += '<div class="button-row">';
    html += '<button type="button" class="secondary-button" data-action="cancel-return-draft"' + disabledAttr + ">Abbrechen</button>";
    html +=
      '<button type="button" class="primary-button" data-action="submit-return-draft"' +
      disabledAttr +
      ">" +
      (submitting ? "Wird zur\u00fcckgegeben\u2026" : "Zur \u00dcberarbeitung zur\u00fcckgeben") +
      "</button>";
    html += "</div>";
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------
  // V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen"): die
  // beiden Freigabegrenzen (approve-for-execution/approve-completion)
  // erfordern serverseitig bereits `confirmed: true`
  // (pilot-work-order-service.js#approveForExecution/#approveCompletion).
  // Bislang zeigte ein Klick auf die Primäraktion ausschließlich einen
  // Hinweistext, sendete aber niemals einen Request – APPROVED_FOR_EXECUTION
  // und COMPLETED waren über die Oberfläche technisch unerreichbar. Ersetzt
  // wird das durch eine echte, bewusst reibungsbehaftete
  // Bestätigungsfläche:
  //   1. Klick auf die Primäraktion → NUR lokaler Zustand wird gesetzt
  //      (openJamalConfirmationDialog), KEIN API-Aufruf.
  //   2. Die Fläche zeigt Auftrag, Aktion und die Tragweite der Freigabe.
  //   3. Der Bestätigungsbutton bleibt deaktiviert, bis die Checkbox aktiv
  //      gesetzt wurde (setJamalConfirmationChecked) – das Setzen der
  //      Checkbox selbst löst NIEMALS eine Statusänderung aus.
  //   4. Erst ein zusätzlicher, eigener Klick auf den Bestätigungsbutton
  //      (confirmJamalConfirmation) sendet `confirmed: true` – die einzige
  //      Stelle in dieser Datei, die das jemals tut.
  //   5. Abbrechen/Schließen (cancelJamalConfirmation) verwirft ausschließ-
  //      lich lokalen Zustand, niemals einen Request.
  //   6. Ein laufender Bestätigungsversuch (submitting) blockiert jeden
  //      weiteren Bestätigungsklick (keine doppelte Freigabe).
  //   7. Ein Netzwerk-/Serverfehler lässt den bisherigen Status unverändert
  //      und zeigt eine verständliche Fehlermeldung direkt in der Fläche.
  // ---------------------------------------------------------------------

  var JAMAL_CONFIRMATION_ACTION_LABELS = {
    "approve-for-execution": "Ausf\u00fchrung freigeben",
    "approve-completion": "Ergebnis abnehmen",
  };

  var JAMAL_CONFIRMATION_SCOPE_NOTE = {
    "approve-for-execution":
      "Diese Best\u00e4tigung gibt ausschlie\u00dflich die Ausf\u00fchrung DIESES EINEN Pilotauftrags frei \u2013 " +
      "NICHT pauschal die gesamte Drei-Agenten-Kette. Jede sp\u00e4tere Kettenstufe (Recherche, Dokumentation, " +
      "Projektmanager-Bewertung) ben\u00f6tigt weiterhin ihre eigene, gesonderte Jamal-Freigabe.",
    "approve-completion":
      "Diese Best\u00e4tigung schlie\u00dft ausschlie\u00dflich diesen einen Pilotauftrag ab und ersetzt keine " +
      "vorherige oder sp\u00e4tere Einzelfreigabe.",
  };

  // Öffnet die Bestätigungsfläche für GENAU einen Auftrag/GENAU eine
  // Aktion. Setzt ausschließlich lokalen Zustand – kein fetch(), keine
  // Statusänderung, kein versteckter Netzwerkaufruf beim Öffnen.
  function openJamalConfirmationDialog(action) {
    if (!state.selectedPilotOrderId || !state.overview) return;
    state.jamalConfirmation = {
      action: action,
      pilotOrderId: state.selectedPilotOrderId,
      orderTitle: state.overview.order.title,
      checked: false,
      submitting: false,
      error: null,
    };
    render();
  }

  // Setzt ausschließlich die lokal angezeigte Checkbox – löst niemals einen
  // Request und niemals eine Statusänderung aus (Sicherheitsanforderung
  // "kein Freigabestatus allein durch Checkbox setzen").
  function setJamalConfirmationChecked(checked) {
    if (!state.jamalConfirmation || state.jamalConfirmation.submitting) return;
    state.jamalConfirmation.checked = Boolean(checked);
    state.jamalConfirmation.error = null;
    render();
  }

  // Abbrechen/Schließen: verwirft ausschließlich lokalen Zustand. Es wurde
  // zu keinem Zeitpunkt ein Request gesendet, es gibt daher nichts, das
  // durch das Abbrechen rückgängig gemacht werden müsste – der bisherige
  // Auftragsstatus bleibt unverändert.
  function cancelJamalConfirmation() {
    if (state.jamalConfirmation && state.jamalConfirmation.submitting) return;
    state.jamalConfirmation = null;
    render();
  }

  // Die EINZIGE Stelle in dieser Datei, die jemals `confirmed: true`
  // versendet. Erfordert eine aktiv gesetzte Checkbox (server- UND
  // clientseitig sonst niemals aktivierbarer Button) und schützt über
  // `submitting` gegen Doppelbetätigung (ein zweiter Klick, während der
  // erste Versuch noch läuft, wird ignoriert statt einen zweiten Request zu
  // senden). Bei Erfolg wird der Auftrag neu geladen; bei einem
  // Revisionskonflikt (409) greift dieselbe Konfliktanzeige wie bei jeder
  // anderen Aktion; bei jedem anderen Fehler (inklusive Netzwerkfehler)
  // bleibt der bisherige Status unverändert und die Fläche zeigt eine
  // verständliche Fehlermeldung, bleibt aber geöffnet (kein automatischer
  // Retry).
  function confirmJamalConfirmation() {
    var confirmation = state.jamalConfirmation;
    if (!confirmation || confirmation.submitting || !confirmation.checked) return Promise.resolve();
    if (state.selectedPilotOrderId !== confirmation.pilotOrderId || !state.overview) return Promise.resolve();
    var pilotOrderId = confirmation.pilotOrderId;
    var action = confirmation.action;
    var expectedRevision = state.overview.order.revision;
    confirmation.submitting = true;
    confirmation.error = null;
    render();
    return postAction(pilotOrderId, action, { confirmed: true, expectedRevision: expectedRevision })
      .then(function (response) {
        if (state.jamalConfirmation !== confirmation) return;
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok) {
          state.jamalConfirmation = null;
          state.actionError = null;
          state.conflict = null;
          return reloadSelectedOrder();
        }
        if (response.statusCode === 409) {
          var details = response.data || {};
          state.jamalConfirmation = null;
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
        confirmation.submitting = false;
        confirmation.error =
          (response.data && response.data.message) ||
          "Die Freigabe konnte nicht gespeichert werden. Der bisherige Status bleibt unver\u00e4ndert.";
        render();
      })
      .catch(function () {
        if (state.jamalConfirmation !== confirmation) return;
        confirmation.submitting = false;
        confirmation.error =
          "Netzwerkfehler \u2013 die Freigabe wurde nicht gespeichert, der bisherige Status bleibt unver\u00e4ndert. " +
          "Bitte Verbindung pr\u00fcfen und erneut versuchen.";
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
    return postAction(pilotOrderId, "request-codex-run-approval", { presetId: CODEX_AGENT_EXECUTION_PRESET_ID })
      .then(function (response) {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok && response.data.approvalToken) {
          state.codexApprovalToken = response.data.approvalToken;
          state.codexApprovalError = null;
        } else {
          state.codexApprovalToken = null;
          state.codexApprovalError = (response.data && response.data.message) || "Freigabe konnte nicht angefordert werden.";
        }
        render();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        state.codexApprovalError = "Die Freigabe konnte wegen eines Verbindungsproblems nicht angefordert werden.";
        render();
      })
      .finally(function () {
        state.codexApprovalInFlight = false;
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

  // -----------------------------------------------------------------------
  // Phase 8 ("vollständige echte Drei-Agenten-Kette als kontrollierter
  // Nachtlauf"): drei getrennte Aktionen, exakt gespiegelt zum
  // zweistufigen Codex-Ablauf oben (requestCodexApproval/
  // runCodexAgentExecution), nur zusätzlich an chainId+chainStep gebunden.
  // Bewusst KEIN "gesamte Kette starten"-Aufruf: jede Schaltfläche startet
  // ausschließlich genau eine Stufe, niemals automatisch die nächste.
  // -----------------------------------------------------------------------

  function chainStepTokenKey(chainId, chainStep) {
    return chainId + "::" + chainStep;
  }

  function prepareAgentChain() {
    if (state.chainActionInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var selection = getChainFileSelectionForOverview(state.overview || {});
    if (selection.selectedFiles.length === 0) {
      state.chainActionError = null;
      state.chainActionErrorReasonCode = null;
      render();
      return Promise.resolve();
    }
    var pilotOrderId = state.selectedPilotOrderId;
    state.chainActionInFlight = true;
    state.chainActionError = null;
    state.chainActionErrorReasonCode = null;
    render();
    return postAction(pilotOrderId, "prepare-agent-chain", { selectedFiles: selection.selectedFiles })
      .then(function (response) {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok) {
          state.chainActionError = null;
          state.chainActionErrorReasonCode = null;
          return reloadSelectedOrder();
        }
        state.chainActionErrorReasonCode = extractReasonCodeFromResponseData(response.data);
        state.chainActionError = (response.data && response.data.message) || "Die Agentenkette konnte nicht vorbereitet werden.";
        render();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        state.chainActionErrorReasonCode = "NETWORK_INTERRUPTED";
        state.chainActionError = "Die Agentenkette konnte wegen eines Verbindungsproblems nicht vorbereitet werden.";
        render();
      })
      .finally(function () {
        state.chainActionInFlight = false;
        render();
      });
  }

  function requestChainStepApproval(chainId, chainStep) {
    if (state.chainActionInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    var tokenKey = chainStepTokenKey(chainId, chainStep);
    state.chainActionInFlight = true;
    state.chainActionError = null;
    state.chainActionErrorReasonCode = null;
    render();
    return postAction(pilotOrderId, "request-chain-step-approval", { chainId: chainId, chainStep: chainStep })
      .then(function (response) {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (response.statusCode === 200 && response.data && response.data.ok && response.data.approvalToken) {
          state.chainStepApprovalTokens[tokenKey] = response.data.approvalToken;
          state.chainActionError = null;
          state.chainActionErrorReasonCode = null;
          return reloadSelectedOrder();
        }
        delete state.chainStepApprovalTokens[tokenKey];
        state.chainActionErrorReasonCode = extractReasonCodeFromResponseData(response.data);
        state.chainActionError = (response.data && response.data.message) || "Die Freigabe für diesen Kettenschritt konnte nicht angefordert werden.";
        render();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        state.chainActionErrorReasonCode = "NETWORK_INTERRUPTED";
        state.chainActionError = "Die Freigabe konnte wegen eines Verbindungsproblems nicht angefordert werden.";
        render();
      })
      .finally(function () {
        state.chainActionInFlight = false;
        render();
      });
  }

  // Der Freigabe-Token ist per Definition genau einmal verwendbar (siehe
  // pilot-agent-execution-chain-service.js#consumeChainApprovalToken).
  // V7.9.0 ergänzt: bei einem reinen Verbindungsabbruch bleibt der Token bis
  // zur nächsten bestätigten Serverantwort lokal erhalten, damit er nicht
  // versehentlich verloren geht.
  function startChainStep(chainId, chainStep) {
    var tokenKey = chainStepTokenKey(chainId, chainStep);
    var tokenUsed = state.chainStepApprovalTokens[tokenKey];
    if (!tokenUsed || state.chainActionInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    state.chainStartBridge = {
      pilotOrderId: pilotOrderId,
      chainId: chainId,
      chainStep: chainStep,
      acceptedAtMs: nowMs(),
      connectionInterrupted: false,
    };
    state.chainActionInFlight = true;
    state.chainActionError = null;
    state.chainActionErrorReasonCode = null;
    render();
    startStatusPolling(false);
    return postAction(pilotOrderId, "start-chain-step", { chainId: chainId, chainStep: chainStep, approvalToken: tokenUsed })
      .then(function (response) {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        delete state.chainStepApprovalTokens[tokenKey];
        if (response.statusCode === 200 && response.data && response.data.ok) {
          state.chainActionError = null;
          state.chainActionErrorReasonCode = null;
          state.chainStartBridge = null;
          return reloadSelectedOrder();
        }
        state.chainStartBridge = null;
        state.chainActionErrorReasonCode = extractReasonCodeFromResponseData(response.data);
        state.chainActionError = (response.data && response.data.message) || "Der Kettenschritt konnte nicht gestartet werden.";
        syncStatusPollingFromOverview();
        render();
      })
      .catch(function () {
        if (state.selectedPilotOrderId !== pilotOrderId) return;
        if (state.chainStartBridge && state.chainStartBridge.pilotOrderId === pilotOrderId) {
          state.chainStartBridge.connectionInterrupted = true;
        }
        state.chainActionErrorReasonCode = "NETWORK_INTERRUPTED";
        state.chainActionError =
          "Die Verbindung wurde während des Laufs unterbrochen. Der Lauf kann weiterlaufen oder bereits fertig sein. " +
          "Der Stand wird automatisch weiter geprüft. Bitte nicht erneut starten.";
        startStatusPolling(true);
        render();
      })
      .finally(function () {
        state.chainActionInFlight = false;
        render();
      });
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

  function createFormField(id, label, tag, changed) {
    // V8.0: optionales viertes Argument `changed` markiert ein Feld als
    // "Von dir ge\u00e4ndert" (siehe isFieldChangedFromDraft unten) – rein
    // visuell, \u00e4ndert weder Feld-ID noch Wert noch Validierung.
    var badge = changed ? ' <span class="pilot-order-draft-changed-badge">Von dir ge\u00e4ndert</span>' : "";
    if (tag === "textarea") {
      return '<label for="' + id + '">' + escapeHtml(label) + badge + '</label><textarea id="' + id + '" rows="2"></textarea>';
    }
    return '<label for="' + id + '">' + escapeHtml(label) + badge + '</label><input id="' + id + '" type="text" />';
  }

  // V8.0: ein Feld gilt als "Von dir ge\u00e4ndert", wenn ein Vorschlag
  // jemals einen Wert eingesetzt hat (state.draftFilledValues kennt die
  // Feld-ID) UND der aktuell im DOM stehende Wert (preservedValues, direkt
  // vor dem Neuaufbau erfasst) davon abweicht. Reiner Vergleich, keine
  // Neuberechnung, kein Zur\u00fccksetzen.
  function isFieldChangedFromDraft(id, preservedValues) {
    if (!state.draftFilledValues || !Object.prototype.hasOwnProperty.call(state.draftFilledValues, id)) return false;
    var currentValue =
      preservedValues && Object.prototype.hasOwnProperty.call(preservedValues, id) ? preservedValues[id] : "";
    return currentValue !== state.draftFilledValues[id];
  }

  function renderDraftTeamItems(team) {
    return team
      .map(function (member) {
        var mismatch = member && member.isExactRoleMatch === false ? " (Rollenabweichung \u2013 kein exakt benannter Agent)" : "";
        var note = member && isNonEmptyString(member.mappingNote) ? "<br><em>" + escapeHtml(member.mappingNote) + "</em>" : "";
        var label = (member && member.pilotRoleLabel) || "";
        var canonical = (member && member.canonicalName) || "";
        return "<li><strong>" + escapeHtml(label) + "</strong> = " + escapeHtml(canonical) + mismatch + note + "</li>";
      })
      .join("");
  }

  function renderDraftFileItems(files) {
    return files
      .map(function (relativePath) {
        return "<li>" + escapeHtml(relativePath) + "</li>";
      })
      .join("");
  }

  // V8.0: rein darstellende Funktion, l\u00f6st selbst niemals eine Aktion
  // aus. Offen sichtbar: Auftragstyp, Ergebnisziel, Prüfhinweis,
  // Unsicherheiten. Eingeklappt (<details>): feste Bearbeitungskette,
  // Dateiauswahl, Ergebnisform, Begr\u00fcndung.
  function renderDraftResultBlock(currentSentenceValue) {
    var draftResult = state.draftResult;
    if (!draftResult) return "";
    var sentenceChanged = state.draftSentenceAtBuild !== null && currentSentenceValue !== state.draftSentenceAtBuild;
    var sentenceChangedHint = sentenceChanged
      ? '<p class="pilot-order-draft-sentence-changed">Der Satz wurde ge\u00e4ndert. Der angezeigte Vorschlag geh\u00f6rt noch zum vorherigen Satz.</p>'
      : "";
    if (draftResult.outcome !== "DRAFT" || !draftResult.fields) {
      return (
        '<div class="pilot-order-draft-result pilot-order-draft-unsupported">' +
        sentenceChangedHint +
        "<p>" + escapeHtml(draftResult.unsupportedReason || "") + "</p>" +
        "</div>"
      );
    }
    var fields = draftResult.fields;
    var uncertainties = Array.isArray(draftResult.uncertainties) ? draftResult.uncertainties : [];
    var team = Array.isArray(draftResult.team) ? draftResult.team : [];
    var recommendedFiles = Array.isArray(draftResult.recommendedFiles) ? draftResult.recommendedFiles : [];
    var rationaleNote = draftResult.rationale && isNonEmptyString(draftResult.rationale.note) ? draftResult.rationale.note : "";
    // Korrekturlauf F2 (V8.0, ausschließlich Anzeige): zeigt genau die vom
    // Profilmodul tatsächlich gelieferten Treffer (rationale.matchedKeywords)
    // in Alltagssprache an – keine zweite Stichworterkennung hier, keine
    // technische Profil-ID im Haupttext, keine Sicherheits-/Gewissheits-
    // formulierung. Bei fehlender oder leerer Trefferliste bleibt der
    // Hinweis vollständig weg (keine leere Überschrift).
    var matchedKeywords =
      draftResult.rationale && Array.isArray(draftResult.rationale.matchedKeywords)
        ? draftResult.rationale.matchedKeywords.filter(isNonEmptyString)
        : [];
    var matchedKeywordsHint =
      matchedKeywords.length > 0
        ? '<p class="pilot-order-draft-matched-keywords">Als Nutzerperspektive erkannt, weil in deinem Satz vorkommt: ' +
          matchedKeywords.map(escapeHtml).join(", ") +
          ".</p>"
        : "";
    return (
      '<div class="pilot-order-draft-result">' +
      sentenceChangedHint +
      "<p><strong>Auftragstyp:</strong> Nutzerperspektive</p>" +
      matchedKeywordsHint +
      "<p><strong>Ergebnisziel:</strong> " + escapeHtml(fields.desiredOutcome) + "</p>" +
      '<p class="pilot-order-draft-hint">Dieser Vorschlag ist keine Pr\u00fcfung. Die verbindliche Pr\u00fcfung erfolgt erst beim Anlegen des Pilotauftrags.</p>' +
      (uncertainties.length > 0
        ? '<ul class="pilot-order-draft-uncertainties">' +
          uncertainties
            .map(function (entry) {
              return "<li>" + escapeHtml(entry) + "</li>";
            })
            .join("") +
          "</ul>"
        : "") +
      '<details class="pilot-order-draft-details">' +
      "<summary>Feste Bearbeitungskette, Dateiauswahl, Ergebnisform, Begr\u00fcndungen</summary>" +
      "<p><strong>Feste Bearbeitungskette \u2013 nicht w\u00e4hlbar</strong></p>" +
      "<ul>" + renderDraftTeamItems(team) + "</ul>" +
      '<p class="pilot-order-draft-file-hint">Diese Auswahl kommt aus der bestehenden Serverempfehlung der Kette. Du kannst sie sp\u00e4ter beim Vorbereiten der Kette kontrollieren und \u00e4ndern.</p>' +
      "<ul>" + renderDraftFileItems(recommendedFiles) + "</ul>" +
      (rationaleNote ? "<p>" + escapeHtml(rationaleNote) + "</p>" : "") +
      "</details>" +
      "</div>"
    );
  }

  function renderCreateForm(preservedValues) {
    var currentSentenceValue =
      preservedValues && Object.prototype.hasOwnProperty.call(preservedValues, DRAFT_SENTENCE_FIELD_ID)
        ? preservedValues[DRAFT_SENTENCE_FIELD_ID]
        : "";
    return (
      '<div class="pilot-order-create-form">' +
      '<div class="pilot-order-draft-sentence-block">' +
      createFormField(DRAFT_SENTENCE_FIELD_ID, "Was m\u00f6chtest du erreichen?", "textarea", false) +
      '<button type="button" class="secondary-button" data-action="build-work-draft">Arbeitsvorschlag erstellen</button>' +
      renderDraftResultBlock(currentSentenceValue) +
      "</div>" +
      createFormField("pilot-order-create-title", "Titel", "input", isFieldChangedFromDraft("pilot-order-create-title", preservedValues)) +
      createFormField(
        "pilot-order-create-desired-outcome",
        "Gew\u00fcnschtes Ergebnis",
        "textarea",
        isFieldChangedFromDraft("pilot-order-create-desired-outcome", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-requested-by",
        "Angefordert von",
        "input",
        isFieldChangedFromDraft("pilot-order-create-requested-by", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-quality-criteria",
        "Qualit\u00e4tskriterien (eine Zeile je Kriterium)",
        "textarea",
        isFieldChangedFromDraft("pilot-order-create-quality-criteria", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-allowed-tools",
        "Erlaubte Werkzeuge (eine Zeile je Werkzeug)",
        "textarea",
        isFieldChangedFromDraft("pilot-order-create-allowed-tools", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-forbidden-actions",
        "Verbotene Aktionen (eine Zeile je Aktion)",
        "textarea",
        isFieldChangedFromDraft("pilot-order-create-forbidden-actions", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-required-approvals",
        "Erforderliche Freigaben (eine Zeile je Freigabe)",
        "textarea",
        isFieldChangedFromDraft("pilot-order-create-required-approvals", preservedValues),
      ) +
      createFormField(
        "pilot-order-create-timeframe",
        "Zeitrahmen",
        "input",
        isFieldChangedFromDraft("pilot-order-create-timeframe", preservedValues),
      ) +
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
    // V7.9.7: Werte VOR dem Neuaufbau des innerHTML sichern (siehe
    // Kommentar bei CREATE_FORM_FIELD_IDS oben) – nur relevant, wenn das
    // Anlageformular gerade angezeigt wird.
    var preservedCreateFormValues = state.createOpen ? captureCreateFormFieldValues() : null;
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
      (state.createOpen ? renderCreateForm(preservedCreateFormValues) : "") +
      "</div>";
    container.innerHTML = html;
    // Nach dem Neuaufbau die zuvor gesicherten Werte zurückschreiben, sofern
    // das Formular weiterhin angezeigt wird (z. B. nach einem
    // fehlgeschlagenen Anlageversuch). Nach Erfolg ist state.createOpen
    // bereits false, wodurch das Formular gar nicht neu erzeugt wird – das
    // gewünschte Leeren nach erfolgreicher Anlage bleibt unverändert.
    if (state.createOpen) {
      restoreCreateFormFieldValues(preservedCreateFormValues);
    }
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
    var chainRoleProgress = overview.chainRoleProgress || null;
    var rows = [
      ["Pilotauftrag-ID", escapeHtml(overview.order.id)],
      ["Revision", escapeHtml(String(overview.order.revision))],
      ["Auftraggeber", escapeHtml(overview.order.requestedBy)],
      ["Status", escapeHtml(overview.statusLabel)],
      ["Beteiligte Agenten", overview.involvedAgents.map(function (a) { return escapeHtml(a.pilotRoleLabel); }).join(", ")],
      ["Fortschritt", progress.rolesPassed + " von " + progress.rolesTotal + " Pilotrollen mit angenommenem Ergebnis"],
      ["Offene Entscheidung", overview.openDecision ? escapeHtml(overview.openDecision) : "Keine"],
    ];
    if (chainRoleProgress && chainRoleProgress.totalCount) {
      rows.push([
        "Von der Agentenkette erledigte Rollen",
        chainRoleProgress.bookedCount + " von " + chainRoleProgress.totalCount + " Rollen über Kettenschritte erfolgreich verbucht",
      ]);
    }
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

  // Rendert die Jamal-Bestätigungsfläche für GENAU einen Auftrag/GENAU eine
  // Aktion (siehe openJamalConfirmationDialog/confirmJamalConfirmation
  // oben). Ersetzt an dieser Stelle die normale Primäraktions-Schaltfläche,
  // solange die Fläche für den aktuell angezeigten Auftrag geöffnet ist –
  // kein doppeltes/verwirrendes Nebeneinander von Button und Fläche.
  function renderJamalConfirmationPanel(confirmation) {
    var actionLabel = JAMAL_CONFIRMATION_ACTION_LABELS[confirmation.action] || confirmation.action;
    var scopeNote = JAMAL_CONFIRMATION_SCOPE_NOTE[confirmation.action] || "";
    var submitting = confirmation.submitting;
    var confirmDisabled = submitting || !confirmation.checked;
    var html = '<div class="pilot-jamal-confirmation" role="alertdialog" aria-modal="true" aria-label="Jamal-Ausf\u00fchrungsfreigabe">';
    html += '<p class="pilot-jamal-confirmation-title"><strong>Jamal-Best\u00e4tigung erforderlich</strong></p>';
    html += '<dl class="pilot-jamal-confirmation-facts">';
    html += "<div><dt>Pilotauftrag</dt><dd>" + escapeHtml(confirmation.orderTitle) + " (" + escapeHtml(confirmation.pilotOrderId) + ")</dd></div>";
    html += "<div><dt>Freizugebende Aktion</dt><dd>" + escapeHtml(actionLabel) + "</dd></div>";
    html += "</dl>";
    html += "<p>Mit dieser Best\u00e4tigung wird eine technische Ausf\u00fchrung grunds\u00e4tzlich erm\u00f6glicht.</p>";
    html +=
      "<p>Es erfolgt <strong>keine automatische Freigabe durch einen Agenten</strong> \u2013 ausschlie\u00dflich Jamal " +
      "best\u00e4tigt dies hier pers\u00f6nlich und ausdr\u00fccklich.</p>";
    if (scopeNote) {
      html += "<p>" + escapeHtml(scopeNote) + "</p>";
    }
    html += '<label class="pilot-jamal-confirmation-checkbox-row">';
    html +=
      '<input type="checkbox" data-action="jamal-confirmation-toggle-checkbox"' +
      (confirmation.checked ? " checked" : "") +
      (submitting ? " disabled" : "") +
      " /> Ich best\u00e4tige diese Ausf\u00fchrungsfreigabe ausdr\u00fccklich.";
    html += "</label>";
    if (confirmation.error) {
      html += '<p class="pilot-work-order-action-error">' + escapeHtml(confirmation.error) + "</p>";
    }
    html += '<div class="pilot-jamal-confirmation-buttons">';
    html += '<button type="button" data-action="jamal-confirmation-cancel"' + (submitting ? " disabled" : "") + ">Abbrechen</button>";
    html +=
      '<button type="button" data-action="jamal-confirmation-confirm"' +
      (confirmDisabled ? " disabled" : "") +
      ">" +
      (submitting ? "Wird best\u00e4tigt\u2026" : "Freigabe jetzt best\u00e4tigen") +
      "</button>";
    html += "</div>";
    html += "</div>";
    return html;
  }

  function renderPrimaryAction(overview) {
    var status = overview.status;
    var confirmation = state.jamalConfirmation;
    var confirmationMatchesHere =
      confirmation &&
      confirmation.pilotOrderId === overview.order.id &&
      ((confirmation.action === "approve-for-execution" && status === "READY_FOR_JAMAL_APPROVAL") ||
        (confirmation.action === "approve-completion" && status === "READY_FOR_REVIEW"));
    if (confirmationMatchesHere) {
      return (
        '<div class="pilot-work-order-primary-action">' +
        "<p><strong>N\u00e4chster Schritt:</strong> " + escapeHtml(overview.nextStep) + "</p>" +
        renderJamalConfirmationPanel(confirmation) +
        "</div>"
      );
    }
    // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
    // bedienbar machen"): ein geöffneter Handoff-Entwurf ersetzt für GENAU
    // diesen Auftrag die normale Primäraktion – kein doppelt sichtbares
    // Nebeneinander von Button und Entwurf (gleiches Muster wie die
    // Jamal-Bestätigungsfläche oben).
    if (status === "IN_EXECUTION" && isHandoffDraftOpenForOrder(overview.order.id)) {
      return (
        '<div class="pilot-work-order-primary-action">' +
        "<p><strong>N\u00e4chster Schritt:</strong> " + escapeHtml(overview.nextStep) + "</p>" +
        renderHandoffDraftPanel(state.handoffDraft) +
        "</div>"
      );
    }
    // Arbeitspaket Rückgabe Pilotauftrag: eine geöffnete Rückgabefläche
    // ersetzt für GENAU diesen Auftrag die normale Primäraktion – kein
    // doppelt sichtbares Nebeneinander von Freigabeknopf und Rückgabefläche
    // (gleiches Muster wie Jamal-Bestätigung und Handoff-Entwurf oben). Die
    // Fläche lebt damit vollständig innerhalb der bestehenden
    // renderPrimaryAction()-Struktur; es gibt keine zweite Renderkette.
    if (isReturnDraftStatus(status) && isReturnDraftOpenForOrder(overview.order.id)) {
      return (
        '<div class="pilot-work-order-primary-action">' +
        "<p><strong>N\u00e4chster Schritt:</strong> " + escapeHtml(overview.nextStep) + "</p>" +
        renderReturnDraftPanel(state.returnDraft) +
        "</div>"
      );
    }
    var button = "";
    var disabledAttr = state.actionInFlight ? " disabled" : "";
    if (status === "DRAFT") {
      button = '<button type="button" data-action="mark-ready-for-approval"' + disabledAttr + ">Zur Freigabe vorlegen</button>";
    } else if (status === "READY_FOR_JAMAL_APPROVAL") {
      // Arbeitspaket Rückgabe Pilotauftrag: erst hier (und bei
      // READY_FOR_REVIEW unten) steht Jamal eine echte Entscheidung offen –
      // deshalb bekommt genau hier die positive Hauptaktion die bestehende
      // Klasse primary-button und die Rückgabe die bestehende Klasse
      // secondary-button (Produktentscheidung Jamals).
      button =
        '<button type="button" class="primary-button" data-action="approve-for-execution"' +
        disabledAttr +
        ">Ausf\u00fchrung freigeben</button>" +
        renderReturnActionButton(disabledAttr);
    } else if (status === "APPROVED_FOR_EXECUTION") {
      button = '<button type="button" data-action="start-execution"' + disabledAttr + ">Ausf\u00fchrung starten</button>";
    } else if (status === "IN_EXECUTION") {
      // V8.0.1: "Zur Abschlussprüfung vorlegen" darf erst sichtbar sein,
      // wenn mindestens eine ANGENOMMENE Dokumentations-Rollenübergabe
      // vorliegt (exakt dieselbe Voraussetzung wie service.js#
      // submitForReview) – vorher wäre der Klick serverseitig ohnehin
      // abgelehnt worden (Auftrag Abschnitt 3/8.A).
      if (hasPassedDocumentationHandoff(overview)) {
        button = '<button type="button" data-action="submit-for-review"' + disabledAttr + ">Zur Abschlusspr\u00fcfung vorlegen</button>";
      } else {
        var lastDocHandoff = latestDocumentationHandoff(overview);
        if (lastDocHandoff && lastDocHandoff.pmFilterStatus === "REJECTED") {
          button +=
            '<p class="pilot-work-order-action-error">Die letzte Rollen\u00fcbergabe an die Dokumentation wurde vom ' +
            "Projektmanager-Filter abgelehnt" +
            (lastDocHandoff.pmFilterReasons && lastDocHandoff.pmFilterReasons.length > 0
              ? " (" + escapeHtml(lastDocHandoff.pmFilterReasons.join("; ")) + ")"
              : "") +
            ". Es erfolgt kein automatischer erneuter Versuch \u2013 bitte einen neuen Entwurf vorbereiten.</p>";
        }
        button += '<button type="button" data-action="prepare-handoff-draft"' + disabledAttr + ">Rollen\u00fcbergabe vorbereiten</button>";
      }
    } else if (status === "READY_FOR_REVIEW") {
      button =
        '<button type="button" class="primary-button" data-action="approve-completion"' +
        disabledAttr +
        ">Ergebnis abnehmen</button>" +
        renderReturnActionButton(disabledAttr);
    } else if (status === "RETURNED") {
      button = '<button type="button" data-action="reopen-from-returned"' + disabledAttr + ">Erneut als Entwurf starten</button>";
    } else if (status === "BLOCKED") {
      // V8.10.1: "zurückgeben" darf hier NICHT mehr als Aktionsverb stehen –
      // die begründungspflichtige Rückgabe ist eine andere, eigenständige
      // Handlung (renderReturnActionButton). Die Statusfolge selbst ist
      // unverändert BLOCKED -> RETURNED und wird deshalb als Folge des Klicks
      // beschrieben, nicht als Name der Aktion. Der Hinweis nutzt die
      // bestehende Absatzregel der Primäraktion – keine neue Karte, keine
      // Warnbox, keine neue CSS-Klasse.
      button =
        '<button type="button" data-action="unblock-order"' + disabledAttr + ">Blockade aufheben</button>" +
        "<p>Der Auftrag geht danach zur\u00fcck in die \u00dcberarbeitung.</p>";
    }
    return (
      '<div class="pilot-work-order-primary-action">' +
      "<p><strong>N\u00e4chster Schritt:</strong> " + escapeHtml(overview.nextStep) + "</p>" +
      button +
      "</div>"
    );
  }

  function summarizeLastKnownChainStatus(context) {
    if (!context || !context.step || !context.chain) return "Noch kein bestätigter Kettenstatus";
    if (context.chain.chainStatus === "COMPLETED") return "Alle drei Schritte abgeschlossen";
    if (context.chain.chainStatus === "BLOCKED") return "Kette blockiert";
    if (context.step.stepStatus === "RUNNING") return "Schritt " + context.step.stepNumber + " läuft";
    if (context.step.stepStatus === "FAILED") return "Schritt " + context.step.stepNumber + " fehlgeschlagen";
    if (context.step.stepStatus === "SUCCEEDED") return "Schritt " + context.step.stepNumber + " erfolgreich abgeschlossen";
    return "Schritt " + context.step.stepNumber + " wartet";
  }

  // Die sichtbare Überschrift der Schritt-Empfehlung in der Kettenstatuskarte
  // wird AUSSCHLIESSLICH an einer Stelle gesetzt (renderChainStatusCard unten,
  // beim Zusammenbau von .pilot-chain-status-card__next). Kein Textzweig und
  // keine Hilfsfunktion darf sie zusätzlich in den eigenen Text schreiben –
  // sonst erscheint sie doppelt.
  //
  // "erlaubt" statt "sicher" ist eine bewusste fachliche Abschwächung: der
  // Schritt ist zulässig, aber nicht der empfohlene Weg (heute genutzt, wenn
  // die Kette vollständig durchgelaufen ist und ein Vorlegen zur
  // Abschlussprüfung nur noch "bei Bedarf" sinnvoll ist). Diese Unterscheidung
  // wird über nextStepLabel getragen, nicht über den Textinhalt.
  var NEXT_STEP_LABEL_SAFE = "N\u00e4chster sicherer Schritt";
  var NEXT_STEP_LABEL_ALLOWED = "N\u00e4chster erlaubter Schritt";

  // Vor der Ausführung ist eine Drei-Agenten-Kette noch möglich; nur dort darf
  // die Kettenstatuskarte überhaupt nach vorn blicken. In jeder anderen Lage
  // außerhalb von "In Ausführung" ist der Blick ausschließlich rückwärts.
  var ORDER_STATUSES_BEFORE_EXECUTION = ["DRAFT", "READY_FOR_JAMAL_APPROVAL", "APPROVED_FOR_EXECUTION"];

  // Rein ableitend: belegt kein Schritt dieser Kette einen Start, wurde die
  // Kette ausschließlich vorbereitet. Bewusst konservativ – jede Spur eines
  // Starts (Startzeitpunkt, Lauf-Zuordnung, Schrittstatus jenseits von
  // "wartend") beendet die Aussage sofort.
  function chainWasNeverStarted(chain) {
    var steps = chain && Array.isArray(chain.steps) ? chain.steps : [];
    for (var index = 0; index < steps.length; index += 1) {
      var step = steps[index];
      if (step.startedAt || step.executionRunId || step.stepStatus !== "PENDING") return false;
    }
    return true;
  }

  function renderChainStatusCard(overview) {
    if (!overview || !overview.order) return "";
    var orderId = overview.order.id;
    var context = deriveActiveRun(overview);
    var activeChain = context ? context.chain : findLatestChain(overview);
    var activeStep = context ? context.step : null;
    var activeRun = context ? context.run : null;
    var activeStepNumber = activeStep ? activeStep.stepNumber : waitingStepNumberForChain(activeChain);
    var bridge = hasLocalStartBridgeForOrder(orderId) ? state.chainStartBridge : null;
    var hasRunning = hasServerRunningState(overview);
    var pollingStopped = state.statusPollingStoppedByErrors || state.statusPollingStoppedBySafetyCap;
    var showPollingRetryNotice = state.statusPollingRetryNoticeActive && !pollingStopped;

    var variant = "neutral";
    var title = "Kettenstatus wird geladen.";
    var lines = [];
    var nextStepText = "Oben arbeiten. Unten nachschauen.";
    var nextStepLabel = NEXT_STEP_LABEL_SAFE;
    var primaryButtonHtml = "";
    var technicalDetailsHtml = "";

    // Zeitachse der Kettenstatuskarte.
    //
    // Der Auftragsstatus beantwortet ausschließlich "was kann mit dem Auftrag
    // jetzt passieren?". Er ist niemals ein Beweis darüber, ob eine
    // Drei-Agenten-Kette existiert hat oder abgeschlossen wurde. Zuvor hat
    // diese Karte für JEDEN Auftrag außerhalb von "In Ausführung" pauschal
    // behauptet, die Kette sei noch nicht aktiv – und damit eine real
    // vorhandene, vollständig abgeschlossene Kette überstimmt.
    //
    // Außerhalb des laufenden Ausführungsstatus wird die Kette deshalb
    // ausschließlich rückblickend beschrieben: Vergangenheitsform, keine
    // Handlungsaufforderung. Zwei Gegenwartslagen bleiben davon bewusst
    // ausgenommen, weil sie tatsächlich gerade passieren und eine
    // Vergangenheitsaussage dort falsch wäre: ein serverseitig bestätigter
    // laufender Schritt und eine lokal bereits angenommene Startanforderung.
    // Beide fallen unverändert in die bestehenden Gegenwartszweige.
    var chainHistoryOnly = overview.status !== "IN_EXECUTION" && !hasRunning && !bridge;

    if (chainHistoryOnly) {
      // Die Aussage stammt ausschließlich aus den Kettendaten selbst. Der
      // Auftragsstatus entscheidet hier nur noch über die Zeitachse, niemals
      // über den Inhalt. Aus 3 von 3 verbuchten Rollen wird ausdrücklich kein
      // Kettenabschluss abgeleitet – das belegt allein chainStatus.
      nextStepText = "unten den vollständigen Kettenstand nachlesen.";
      if (!activeChain) {
        title = "Für diesen Auftrag wurde keine Drei-Agenten-Kette verwendet.";
        if (ORDER_STATUSES_BEFORE_EXECUTION.indexOf(overview.status) !== -1) {
          nextStepText = "eine Drei-Agenten-Kette kann erst im laufenden Ausführungsstatus vorbereitet werden.";
        }
      } else if (activeChain.chainStatus === "COMPLETED") {
        variant = "success";
        title = "Die Drei-Agenten-Kette wurde vollständig abgeschlossen.";
      } else if (activeChain.chainStatus === "BLOCKED" || activeChain.chainStatus === "FAILED") {
        variant = "failure";
        title = activeChain.chainStatus === "BLOCKED"
          ? "Die Drei-Agenten-Kette wurde während der Ausführung blockiert."
          : "Die Drei-Agenten-Kette konnte nicht vollständig abgeschlossen werden.";
        // Die bereits vorhandene Fehlerdarstellung bleibt erhalten: die
        // benannte Ursache und die technischen Details gehen nicht verloren.
        // Der zugehörige Handlungssatz (failurePresentation.action) bleibt
        // bewusst aus, weil er in die Zukunft weist.
        var historicFailure = resolveFailurePresentation(resolveFailureReasonCodeFromContext(context), null);
        lines.push(historicFailure.cause);
        technicalDetailsHtml = buildChainFailureTechnicalDetailsHtml(context, historicFailure);
      } else if (chainWasNeverStarted(activeChain)) {
        title = "Eine Drei-Agenten-Kette wurde vorbereitet, aber nicht gestartet.";
      } else {
        title = "Die Drei-Agenten-Kette wurde teilweise ausgeführt.";
      }
    } else if (!activeChain) {
      title = "Noch keine Drei-Agenten-Kette vorbereitet.";
      lines.push("Oben arbeiten. Unten nachschauen.");
      lines.push("Es läuft aktuell kein Agent.");
      nextStepText = "unten eine neue Agentenkette vorbereiten.";
    } else if (bridge && !hasRunning) {
      variant = "running";
      if (bridge.connectionInterrupted) {
        title = "Verbindung unterbrochen – Statusprüfung läuft weiter.";
        lines.push(
          "Die Verbindung wurde während des Laufs unterbrochen. Der Lauf kann weiterlaufen oder bereits fertig sein. " +
            "Der Stand wird automatisch weiter geprüft. Bitte nicht erneut starten.",
        );
        nextStepText = "auf den bestätigten Serverstand warten.";
      } else {
        title = "Start wurde angenommen. Der Agent wird gestartet.";
        lines.push("Die serverseitige Bestätigung wird automatisch geprüft.");
        if (Number.isFinite(bridge.acceptedAtMs)) {
          var localStartElapsed = formatElapsedDurationFromMs(nowMs() - bridge.acceptedAtMs);
          if (localStartElapsed) {
            lines.push("Start angefordert vor " + localStartElapsed + ".");
          }
        }
        lines.push("Bitte nicht erneut klicken.");
        nextStepText = "auf die erste bestätigte Servermeldung warten.";
      }
    } else if (hasRunning) {
      variant = "running";
      var runningStepNumber = activeStepNumber || waitingStepNumberForChain(activeChain) || 1;
      title = "Schritt " + runningStepNumber + " wird gerade ausgeführt.";
      lines.push("Codex arbeitet ausschließlich lesend.");
      var startedAtMs = parseTimestampMs(activeStep && activeStep.startedAt);
      if (startedAtMs === null) {
        startedAtMs = parseTimestampMs(activeRun && activeRun.startedAt);
      }
      if (startedAtMs === null && bridge && Number.isFinite(bridge.acceptedAtMs)) {
        startedAtMs = bridge.acceptedAtMs;
      }
      if (startedAtMs !== null) {
        var startedAtClock = formatLocalClockTime(new Date(startedAtMs).toISOString());
        if (startedAtClock) {
          lines.push("Gestartet um " + startedAtClock + " Uhr.");
        }
        var elapsedText = formatElapsedDurationFromMs(nowMs() - startedAtMs);
        if (elapsedText) {
          lines.push("Läuft seit " + elapsedText + ".");
        }
      }
      lines.push("Typische Dauer: 1-3 Minuten.");
      lines.push("Bitte nicht erneut klicken.");
      if (bridge && bridge.connectionInterrupted) {
        variant = "notice";
        lines.unshift(
          "Die Verbindung wurde während des Laufs unterbrochen. Der Lauf kann weiterlaufen oder bereits fertig sein. " +
            "Der Stand wird automatisch weiter geprüft. Bitte nicht erneut starten.",
        );
      }
      nextStepText = "auf den Abschluss dieses Schritts warten.";
    } else if (activeChain.chainStatus === "COMPLETED") {
      variant = "success";
      title = "Alle drei Schritte abgeschlossen.";
      var finalRunDuration = runDurationFromRun(activeRun);
      if (finalRunDuration) {
        lines.push("Laufdauer des letzten Schritts: " + finalRunDuration + ".");
      }
      lines.push("Das Gesamturteil des Projektmanager-Agenten steht unten unter Details.");
      lines.push("Der Pilotauftrag selbst ist damit noch nicht automatisch abgenommen.");
      lines.push("Es wurde nichts automatisch weitergestartet.");
      nextStepLabel = NEXT_STEP_LABEL_ALLOWED;
      nextStepText = "bei Bedarf oben manuell zur Abschlussprüfung vorlegen.";
    } else if (activeStep && activeStep.stepStatus === "SUCCEEDED") {
      variant = "success";
      title = "Schritt " + activeStep.stepNumber + " erfolgreich abgeschlossen.";
      var durationText = runDurationFromRun(activeRun);
      if (durationText) {
        lines.push("Laufdauer: " + durationText + ".");
      }
      lines.push("Das vollständige Ergebnis steht unten unter Details.");
      lines.push("Es wurde nichts automatisch weitergestartet.");
      var chainStepHint = nextChainStepHint(activeChain);
      nextStepLabel = chainStepHint.label;
      nextStepText = chainStepHint.text;
    } else if (activeChain.chainStatus === "FAILED" || activeChain.chainStatus === "BLOCKED" || (activeStep && activeStep.stepStatus === "FAILED") || state.chainActionError) {
      variant = "failure";
      title = activeChain.chainStatus === "BLOCKED" ? "Die Kette ist blockiert." : "Der Kettenschritt ist fehlgeschlagen.";
      var failureCode = resolveFailureReasonCodeFromContext(context);
      var failurePresentation = resolveFailurePresentation(failureCode, state.chainActionError);
      if (isNonEmptyString(failurePresentation.title)) {
        title = failurePresentation.title;
      }
      lines.push(failurePresentation.cause);
      nextStepText = failurePresentation.action;
      technicalDetailsHtml = buildChainFailureTechnicalDetailsHtml(context, failurePresentation);
    } else {
      variant = "approval-ready";
      var waitingStep = waitingStepNumberForChain(activeChain) || activeStepNumber || 1;
      var waitingStepData = findChainStepByNumber(activeChain, waitingStep);
      var waitingTokenKey = chainStepTokenKey(activeChain.id, waitingStep);
      var waitingHasToken = waitingStepData && waitingStepData.approvalStatus === "REQUESTED" && Boolean(state.chainStepApprovalTokens[waitingTokenKey]);
      if (waitingHasToken) {
        title = "Schritt " + waitingStep + " kann jetzt gestartet werden.";
        lines.push("Der Server bestätigt aktuell keinen laufenden Agenten.");
        nextStepText = "Schritt " + waitingStep + " unten manuell starten.";
      } else {
        title = "Schritt " + waitingStep + " wartet auf Freigabe.";
        lines.push("Der Server bestätigt aktuell keinen laufenden Agenten.");
        nextStepText = "Schritt " + waitingStep + " kann jetzt freigegeben werden.";
      }
    }

    if (showPollingRetryNotice) {
      variant = variant === "running" ? "running" : "notice";
      lines.push("Der Zustand konnte gerade nicht abgefragt werden. Nächste Prüfung in 5 Sekunden.");
    }

    if (pollingStopped) {
      variant = "notice";
      lines.push("Automatische Aktualisierung angehalten.");
      if (state.statusPollingStoppedBySafetyCap) {
        lines.push("Der 15-Minuten-Sicherheitsdeckel wurde erreicht.");
      }
      lines.push("Zuletzt bestätigter Stand: " + summarizeLastKnownChainStatus(context) + ".");
      nextStepText = "den aktuellen Stand manuell neu laden.";
      primaryButtonHtml = '<button type="button" class="primary-button" data-action="reload-chain-status">Aktuellen Stand neu laden</button>';
    }

    var html = '<section class="pilot-chain-status-card pilot-chain-status-card--' + variant + '" data-chain-status-mode="' + variant + '">';
    html += '<h4 class="pilot-chain-status-card__title">' + escapeHtml(title) + "</h4>";
    if (variant === "running") {
      html += '<span class="pilot-chain-status-card__pulse" aria-hidden="true"></span>';
    }
    lines.forEach(function (line) {
      html += '<p class="pilot-chain-status-card__text">' + escapeHtml(line) + "</p>";
    });
    html += '<p class="pilot-chain-status-card__next"><strong>' + escapeHtml(nextStepLabel) + ':</strong> ' + escapeHtml(nextStepText) + "</p>";
    if (primaryButtonHtml) {
      html += '<div class="pilot-chain-status-card__actions">' + primaryButtonHtml + "</div>";
    }
    html += technicalDetailsHtml;
    html += "</section>";
    return html;
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

  // Phase 8 ("vollständige echte Drei-Agenten-Kette als kontrollierter
  // Nachtlauf"): rein informative Anzeige-Labels, keine Fachlogik. Die
  // Agentenidentitäten selbst stammen ausschließlich aus dem bestehenden
  // Register (agent-registry.js) und werden hier nur benannt, niemals neu
  // erfunden.
  var CHAIN_AGENT_LABELS = {
    "review-agent": "Review-/Recherche-Agent",
    "documentation-agent": "Dokumentations-Agent",
    "orchestrator-agent": "Orchestrator-/Projektmanager-Agent",
  };
  var CHAIN_STEP_TITLES = {
    1: "Schritt 1 \u2013 Recherche/Analyse",
    2: "Schritt 2 \u2013 Dokumentation",
    3: "Schritt 3 \u2013 Projektmanager-Bewertung",
  };
  // V7.7.0 ("Reservierte Zustände dokumentieren"): CANCELLED ist Stand
  // dieses Korrekturlaufs ausschließlich eine reservierte, von der Backend-
  // Kettenlogik (pilot-agent-execution-chain-service.js) NIEMALS tatsächlich
  // geschriebene Vokabel – es existiert kein Cancel-Endpunkt und keine
  // Abbrechen-Schaltfläche in diesem UI. Das Label bleibt rein defensiv
  // (falls der Wert einmal auftritt) und impliziert an keiner Stelle, dass
  // Abbrechen bereits verfügbar ist.
  var CHAIN_STATUS_LABELS = {
    PREPARED: "Vorbereitet",
    WAITING_FOR_RESEARCH_APPROVAL: "Wartet auf Freigabe: Recherche",
    RESEARCH_RUNNING: "Recherche l\u00e4uft\u2026",
    WAITING_FOR_DOCUMENTATION_APPROVAL: "Wartet auf Freigabe: Dokumentation",
    DOCUMENTATION_RUNNING: "Dokumentation l\u00e4uft\u2026",
    WAITING_FOR_PM_APPROVAL: "Wartet auf Freigabe: PM-Bewertung",
    PM_RUNNING: "PM-Bewertung l\u00e4uft\u2026",
    COMPLETED: "Abgeschlossen",
    FAILED: "Fehlgeschlagen",
    BLOCKED: "Blockiert",
    CANCELLED: "Abgebrochen (reserviert, derzeit nicht ausl\u00f6sbar)",
  };
  var CHAIN_STEP_STATUS_LABELS = { PENDING: "Offen", RUNNING: "L\u00e4uft\u2026", SUCCEEDED: "Erfolgreich", FAILED: "Fehlgeschlagen" };
  var CHAIN_APPROVAL_STATUS_LABELS = { NOT_REQUESTED: "keine Freigabe angefordert", REQUESTED: "Freigabe angefordert", GRANTED: "freigegeben und gestartet" };
  var CHAIN_BLOCK_REASON_TEXT = {
    PREDECESSOR_RESULT_MISSING: "Vorg\u00e4ngerergebnis fehlt oder ist nicht erfolgreich abgeschlossen.",
    PREDECESSOR_RESULT_UNAVAILABLE: "Persistiertes Vorg\u00e4ngerergebnis ist nicht verf\u00fcgbar oder ung\u00fcltig.",
    PREDECESSOR_RESULT_DIGEST_MISMATCH: "Persistiertes Vorg\u00e4ngerergebnis wurde nachtr\u00e4glich ver\u00e4ndert (Digest-Abweichung).",
    PREDECESSOR_CONTEXT_TOO_LARGE: "Vorg\u00e4nger\u00fcbergabe \u00fcberschreitet die zul\u00e4ssige Gr\u00f6\u00dfenobergrenze.",
    MANDATE_DIGEST_MISMATCH: "Der unver\u00e4nderte Kernauftrag konnte nicht verifiziert werden (Digest-Abweichung).",
  };
  var CHAIN_PREDECESSOR_MAX_CHARS = 6000;
  var CHAIN_STATUS_FAILURE_COPY = {
    RESULT_TOO_LARGE: {
      title: "Die Antwort war zu lang.",
      cause: "Die Antwort war länger als die zulässige Höchstgröße und wurde deshalb nicht gespeichert. Es wurde bewusst nichts abgeschnitten.",
      action: "Bitte den Auftrag enger fokussieren oder ein knapperes Ergebnisformat vorgeben und den Schritt danach bewusst erneut freigeben.",
    },
    DOCUMENTATION_RESULT_STRUCTURE_INVALID: {
      cause: "Das Dokumentationsergebnis hatte nicht die erwartete Struktur.",
      action: "Bitte Schritt 2 erneut freigeben und auf die geforderte Struktur achten.",
    },
    STRUCTURE_INVALID: {
      cause: "Das Ergebnisformat war technisch ungültig.",
      action: "Bitte die betroffene Stufe erneut mit klarer Formatvorgabe starten.",
    },
    DOCUMENTATION_RESULT_STILL_TOO_LARGE: {
      cause: "Das Dokumentationsergebnis blieb auch nach Reduktion über der Grenze.",
      action: "Bitte den Umfang reduzieren und die Stufe neu starten.",
    },
    // V7.9.8: dieselben beiden Befunde für Schritt 1 und Schritt 3. Ohne
    // eigene Einträge würden diese Codes kontrolliert auf UNKNOWN abgebildet
    // (siehe normalizeFailureReasonCode unten) und die Ursache wäre im
    // Cockpit nicht mehr benennbar.
    RESEARCH_RESULT_STRUCTURE_INVALID: {
      cause: "Das Rechercheergebnis hatte nicht die erwartete Struktur.",
      action: "Bitte Schritt 1 erneut freigeben und auf die geforderte Struktur achten.",
    },
    RESEARCH_RESULT_STILL_TOO_LARGE: {
      cause: "Das Rechercheergebnis blieb auch nach Reduktion über der Grenze.",
      action: "Bitte den Umfang reduzieren und die Stufe neu starten.",
    },
    PM_RESULT_STRUCTURE_INVALID: {
      cause: "Das Projektmanager-Ergebnis hatte nicht die erwartete Struktur.",
      action: "Bitte Schritt 3 erneut freigeben und auf die geforderte Struktur achten.",
    },
    PM_RESULT_STILL_TOO_LARGE: {
      cause: "Das Projektmanager-Ergebnis blieb auch nach Reduktion über der Grenze.",
      action: "Bitte den Umfang reduzieren und die Stufe neu starten.",
    },
    STILL_TOO_LARGE: {
      cause: "Das Ergebnis überschreitet weiterhin die zulässige Größe.",
      action: "Bitte den Auftrag weiter eingrenzen und dann erneut freigeben.",
    },
    PREDECESSOR_CONTEXT_TOO_LARGE: {
      cause: "Die Vorgängerübergabe war für den nächsten Schritt zu groß.",
      action: "Bitte zuerst den Vorgängerumfang reduzieren, dann erneut starten.",
    },
    PREDECESSOR_RESULT_MISSING: {
      cause: "Das benötigte Vorgängerergebnis fehlt.",
      action: "Bitte den vorherigen Schritt erfolgreich abschließen, bevor Sie fortfahren.",
    },
    PREDECESSOR_RESULT_UNAVAILABLE: {
      cause: "Das Vorgängerergebnis war technisch nicht verfügbar.",
      action: "Bitte den Vorgängerschritt erneut ausführen und danach fortsetzen.",
    },
    PREDECESSOR_RESULT_DIGEST_MISMATCH: {
      cause: "Das Vorgängerergebnis wurde nachträglich verändert.",
      action: "Bitte die Kette neu vorbereiten, damit die Integrität wieder stimmt.",
    },
    MANDATE_DIGEST_MISMATCH: {
      cause: "Der Kernauftrag stimmt nicht mehr mit der signierten Version überein.",
      action: "Bitte die Kette neu vorbereiten und anschließend neu freigeben.",
    },
    STEP_EXECUTION_FAILED: {
      cause: "Die Ausführung des Schritts ist technisch fehlgeschlagen.",
      action: "Bitte technische Details prüfen und den Schritt bewusst neu starten.",
    },
    STEP_START_FAILED: {
      cause: "Der Schritt konnte nicht sauber gestartet werden.",
      action: "Bitte den aktuellen Stand neu laden und die Stufe erneut starten.",
    },
    CHAIN_STEP_FINALIZATION_FAILED: {
      cause: "Der Schritt lief, konnte aber nicht final gespeichert werden.",
      action: "Bitte den Status neu laden und danach bewusst erneut starten.",
    },
    TIMEOUT: {
      cause: "Der Lauf hat das Zeitlimit erreicht und wurde kontrolliert beendet.",
      action: "Bitte Auftrag fokussieren und den Schritt erneut starten.",
    },
    CODEX_PROCESS_EXIT_NONZERO: {
      cause: "Der Codex-Prozess wurde mit einem Fehler beendet.",
      action: "Bitte technische Details prüfen und den Schritt bewusst neu starten.",
    },
    SPAWN_ERROR: {
      cause: "Der Codex-Prozess konnte auf diesem System technisch nicht gestartet werden.",
      action: "Bitte Codex-Verfügbarkeit prüfen und danach erneut starten.",
    },
    WORKSPACE_CHANGED: {
      cause:
        "Sicherheitsbefund: Der isolierte Read-only-Arbeitsbereich wurde während des Laufs unerwartet verändert. Das Ergebnis wurde deshalb verworfen.",
      action: "Bitte Stand stabilisieren und den Schritt danach neu starten.",
    },
    FORBIDDEN_ACTION_CLAIMED: {
      cause: "Sicherheitsbefund: Die Antwort behauptete eine unzulässige Aktion. Das Ergebnis wurde abgelehnt.",
      action: "Bitte Auftrag/Sicherheitsgrenzen prüfen, dann gezielt neu starten.",
    },
    TOKEN_EXPIRED: {
      cause: "Die Freigabe ist abgelaufen.",
      action: "Bitte eine neue Freigabe für genau diese Stufe anfordern.",
    },
    TOKEN_UNKNOWN: {
      cause: "Die Freigabe ist ungültig oder nicht mehr bekannt.",
      action: "Bitte die Freigabe für diese Stufe neu anfordern.",
    },
    TOKEN_ALREADY_USED: {
      cause: "Diese Freigabe wurde bereits verwendet.",
      action: "Bitte für diesen Schritt eine neue Freigabe anfordern.",
    },
    TOKEN_REVISION_MISMATCH: {
      cause: "Die Freigabe passt nicht mehr zur aktuellen Auftragsrevision.",
      action: "Bitte den Auftrag neu laden und eine frische Freigabe anfordern.",
    },
    TOKEN_USER_MISMATCH: {
      cause: "Die Freigabe gehört nicht zum aktuellen Benutzerkontext.",
      action: "Bitte den Schritt mit einer gültigen, frischen Freigabe starten.",
    },
    CODEX_UNAVAILABLE: {
      cause: "Codex ist auf diesem System derzeit nicht verfügbar oder nicht authentifiziert.",
      action: "Bitte Codex-Verfügbarkeit prüfen und danach erneut freigeben.",
    },
    NETWORK_INTERRUPTED: {
      cause: "Die Verbindung wurde während des Laufs unterbrochen.",
      action: "Bitte nicht erneut starten. Der aktuelle Stand wird geprüft.",
    },
    UNKNOWN: {
      cause: "Der Schritt ist technisch fehlgeschlagen. Die genaue Ursache ist derzeit nicht eindeutig bestimmbar.",
      action: "Bitte technischen Code prüfen und den Stand neu laden.",
    },
  };

  // V7.9.4 ("Konkrete Fehlerursache in der Kettenfehlerkarte sichtbar
  // machen"): feste, geschlossene Allowlist bekannter Fehlercodes – exakt
  // die Schlüssel von CHAIN_STATUS_FAILURE_COPY oben. Ein Rohwert, der hier
  // nicht enthalten ist (z. B. ein künftiger, dem UI noch unbekannter
  // Server-Code oder ein deutscher Freitext aus chain.blockReason), wird an
  // keiner Stelle als "Code: <Rohwert>" angezeigt, sondern kontrolliert auf
  // UNKNOWN abgebildet (siehe normalizeFailureReasonCode/
  // resolveFailureReasonCodeFromContext unten).
  function isKnownFailureReasonCode(code) {
    return isNonEmptyString(code) && Object.prototype.hasOwnProperty.call(CHAIN_STATUS_FAILURE_COPY, code.trim());
  }

  // Feste, geschlossene Liste der Runner-Phasen aus
  // pilot-agent-codex-runner.js#runnerPhaseForReasonCode. Ein unbekannter
  // Phasenwert wird niemals roh angezeigt.
  var CHAIN_KNOWN_RUNNER_PHASES = [
    "WORKSPACE_SETUP",
    "WORKSPACE_INTEGRITY_CHECK",
    "CONTENT_SAFETY_CHECK",
    "RESULT_VALIDATION",
    "CODEX_PROCESS",
    "UNKNOWN",
  ];

  // Fester, überall identischer Diagnosehinweis für "Technische Details"
  // (gleicher Wortlaut wie der serverseitige Standardtext, siehe
  // pilot-agent-execution-service.js#DIAGNOSTIC_NOTICE_TEXT).
  var CHAIN_TECHNICAL_DIAGNOSTIC_NOTICE = "Sichere technische Diagnose \u2013 m\u00f6glicherweise gek\u00fcrzt und redigiert.";

  // Ein kurzer, technischer Signalname (z. B. "SIGTERM") ist unkritisch;
  // alles andere wird sicherheitshalber nicht angezeigt.
  var SAFE_SIGNAL_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,19}$/;

  // Feste Muster für potenziell sensible Inhalte in einer rohen
  // Fehlermeldung (Pfade, Tokens, Schlüssel-Zuweisungen). Trifft eines
  // dieser Muster zu oder ist die Meldung zu lang, wird sie NICHT angezeigt
  // – ausschließlich der feste Ersatzhinweis erscheint.
  var UNSAFE_ERROR_MESSAGE_PATTERNS = [
    /\/Users\//,
    /\/var\//,
    /[A-Za-z]:\\\\/,
    /file:\/\//i,
    /sk-[A-Za-z0-9]/,
    /ghp_[A-Za-z0-9]/,
    /Bearer\s+\S/i,
    /\b(API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S/i,
  ];
  var UNSAFE_ERROR_MESSAGE_FALLBACK_TEXT =
    "Eine zus\u00e4tzliche technische Meldung liegt vor, wurde aus Sicherheitsgr\u00fcnden jedoch nicht vollst\u00e4ndig angezeigt.";
  var MAX_SAFE_ERROR_MESSAGE_CHARS = 300;

  function sanitizeErrorMessageForDisplay(message) {
    if (!isNonEmptyString(message)) return null;
    var trimmed = message.trim();
    var unsafe =
      trimmed.length > MAX_SAFE_ERROR_MESSAGE_CHARS ||
      UNSAFE_ERROR_MESSAGE_PATTERNS.some(function (pattern) {
        return pattern.test(trimmed);
      });
    return unsafe ? UNSAFE_ERROR_MESSAGE_FALLBACK_TEXT : trimmed;
  }

  function chainStatusLabel(status) {
    return CHAIN_STATUS_LABELS[status] || escapeHtml(String(status || ""));
  }

  function chainBlockReasonText(reasonCode) {
    var normalized = isNonEmptyString(reasonCode) ? reasonCode.trim() : "";
    if (!normalized) return "";
    return CHAIN_BLOCK_REASON_TEXT[normalized] || normalized;
  }

  function normalizeFailureReasonCode(reasonCode, fallbackMessage) {
    var normalized = isNonEmptyString(reasonCode) ? reasonCode.trim() : "";
    if (!normalized && fallbackMessage) {
      normalized = inferReasonCodeFromMessage(fallbackMessage) || "";
    }
    if (!normalized) return "UNKNOWN";
    // V7.9.4-Korrektur: ein unbekannter/neuer Rohwert (z. B. ein dem UI noch
    // nicht bekannter Server-Code) wurde hier zuvor unverändert durchgereicht
    // statt auf UNKNOWN abgebildet zu werden – die vorherige Prüfung hatte in
    // beiden Zweigen dieselbe Rückgabe. Ein unbekannter Wert wird jetzt
    // niemals roh angezeigt.
    if (!CHAIN_STATUS_FAILURE_COPY[normalized]) return "UNKNOWN";
    return normalized;
  }

  function resolveFailurePresentation(reasonCode, fallbackMessage) {
    var normalized = normalizeFailureReasonCode(reasonCode, fallbackMessage);
    var copy = CHAIN_STATUS_FAILURE_COPY[normalized] || CHAIN_STATUS_FAILURE_COPY.UNKNOWN;
    return {
      reasonCode: normalized,
      title: isNonEmptyString(copy.title) ? copy.title : null,
      cause: copy.cause,
      action: copy.action,
    };
  }

  // V7.8.1 ("Ergebnisbudget von Kettenschritt 2 technisch erzwungen") und
  // V7.9.8 (dasselbe für Schritt 1 und Schritt 3): fester, ausschließlich
  // informativer Hinweistext. Er wird genau dann angezeigt, wenn die
  // deterministische Budgetdurchsetzung einer Stufe tatsächlich etwas
  // weggelassen hat (siehe pilot-agent-documentation-result.js). Eine
  // Reduktion darf niemals unbemerkt bleiben. Enthält ausschließlich
  // Zählwerte, niemals Fachinhalt, niemals die Rohantwort und niemals einen
  // weggelassenen Inhalt.
  //
  // Die Stufenbezeichnung stammt ausschließlich aus dieser festen Tabelle.
  // Ein älterer Lauf ohne contractStage (alle Läufe vor V7.9.8 waren
  // ausnahmslos Dokumentationsläufe) behält deshalb unverändert seinen
  // bisherigen Wortlaut.
  var RESULT_CONTRACT_STAGE_RESULT_LABELS = {
    RESEARCH: "Rechercheergebnis",
    DOCUMENTATION: "Dokumentationsergebnis",
    PROJECT_MANAGER: "Projektmanager-Ergebnis",
  };

  function compactionResultLabel(normalization) {
    var stage = isNonEmptyString(normalization.contractStage) ? normalization.contractStage.trim() : "";
    return RESULT_CONTRACT_STAGE_RESULT_LABELS[stage] || RESULT_CONTRACT_STAGE_RESULT_LABELS.DOCUMENTATION;
  }

  function documentationCompactionNoticeText(normalization) {
    var droppedItems = typeof normalization.droppedItemCount === "number" ? normalization.droppedItemCount : 0;
    var droppedSentences = typeof normalization.droppedSentenceCount === "number" ? normalization.droppedSentenceCount : 0;
    var rawChars = typeof normalization.rawCharCount === "number" ? normalization.rawCharCount : 0;
    // V7.9.8 liefert storedCharCount; ältere Läufe kennen ausschließlich
    // normalizedCharCount. Beide bezeichnen dieselbe gespeicherte Größe.
    var storedChars = typeof normalization.storedCharCount === "number"
      ? normalization.storedCharCount
      : typeof normalization.normalizedCharCount === "number"
        ? normalization.normalizedCharCount
        : 0;
    return (
      "Das " +
      compactionResultLabel(normalization) +
      " wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert (" +
      droppedItems +
      " Punkte, " +
      droppedSentences +
      " Sätze weggelassen; Rohgröße " +
      rawChars +
      ", gespeichert " +
      storedChars +
      " Zeichen). Keine Kürzung innerhalb eines Satzes."
    );
  }

  function documentationCompactionNoticeHtml(run) {
    var summary = run && run.resultSummary;
    // V7.9.8: `resultNormalization` ist der stufenneutrale, kanonische Name;
    // `documentationNormalization` bleibt für Dokumentationsläufe (auch
    // ältere) unverändert lesbar.
    var normalization = summary && (summary.resultNormalization || summary.documentationNormalization);
    if (!normalization || normalization.compactionApplied !== true) return "";
    return '<br><span class="pilot-work-order-action-error">' + escapeHtml(documentationCompactionNoticeText(normalization)) + "</span>";
  }

  // -------------------------------------------------------------------
  // V8.1 ("Ergebnis verstehen ohne Technik") – rein lesende Darstellung
  // eines bereits gespeicherten Kettenergebnisses. Diese Funktionen parsen
  // NICHTS selbst: sie zeigen ausschließlich die bereits vom Server additiv
  // mitgelieferten Abschnitte (run.resultPresentation, siehe
  // pilot-work-order-service.js#buildResultPresentation). Fehlt dieses Feld
  // (älterer Overview-Stand), wird ehrlich auf den weiterhin vollständig
  // erreichbaren Rohtext unter "Technische Details" verwiesen – niemals eine
  // Struktur erfunden.
  // -------------------------------------------------------------------
  function renderResultPresentationSectionHtml(section) {
    var html = '<div class="pilot-work-order-result-section"><p class="pilot-work-order-result-section__title">' + escapeHtml(section.title) + "</p>";
    if (section.kind === "ITEMS" && Array.isArray(section.items) && section.items.length > 0) {
      html += "<ul>" + section.items.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>";
    } else if (isNonEmptyString(section.prose)) {
      html += "<p>" + escapeHtml(section.prose) + "</p>";
    }
    html += "</div>";
    return html;
  }

  // Nur die PM-Stufe liefert das abschließende Gesamturteil der Kette;
  // Recherche- und Dokumentationsergebnisse sind fachlich immer
  // Zwischenergebnisse (siehe Auftrag Abschnitt 7, "Teilergebnis").
  function isChainIntermediateStage(contractStage) {
    return contractStage === "RESEARCH" || contractStage === "DOCUMENTATION";
  }

  // V8.1 Korrektur ("echte Kettenansicht auf verständliche
  // Ergebnisdarstellung umstellen"): dieselben drei festen presetId-Werte,
  // die pilot-agent-execution-service.js#PILOT_AGENT_TASK_PRESETS
  // ausschließlich für chainManaged-Presets vergibt (dort read-only, hier
  // nur zum Wiedererkennen verwendet – keine zweite Preset-Definition,
  // keine Kettenlogik). Dient ausschließlich dazu, denselben Lauf nicht in
  // zwei verschiedenen Bereichen der Diagnoseansicht doppelt anzuzeigen.
  var CHAIN_MANAGED_PRESET_IDS = ["codex-chain-research-analysis", "codex-document-chain-result", "codex-pm-evaluate-chain"];

  function isChainManagedRun(run) {
    return Boolean(run) && CHAIN_MANAGED_PRESET_IDS.indexOf(run.presetId) !== -1;
  }

  // -------------------------------------------------------------------
  // V8.2 ("Entscheidungsansicht statt Textmenge") – dieselben, bereits vom
  // Server gelieferten Abschnitte (run.resultPresentation) werden jetzt so
  // ANGEORDNET, dass offen nur eine kompakte Entscheidungsansicht steht:
  // Fazit/Gesamturteil, höchstens drei wichtigste Erkenntnisse, bei der
  // PM-Stufe zusätzlich Empfehlung und – falls tatsächlich vorhanden –
  // Entscheidung, sowie ein kompakter Risiko-/Grenzen-Hinweis, falls
  // vorhanden. Es wird an keiner Stelle etwas NEU zusammengefasst, gekürzt
  // (außer durch das reine Weglassen ganzer, bereits vorhandener Items ab
  // dem vierten) oder umformuliert – jeder angezeigte Text ist unverändert
  // eines der bereits vom Server gelieferten `section.prose`/`section.items`-
  // Felder. Die vollständigen, unveränderten Abschnitte (alle fünf, in
  // ursprünglicher Reihenfolge) bleiben zusätzlich vollständig unter
  // "Fachliche Details" erreichbar (Auftrag Abschnitt 6/11).
  //
  // Welcher Abschnitt (per fester Abschnittsnummer, NICHT per Markertext)
  // welchen Platz in der Entscheidungsansicht füllt, ist stufenabhängig, weil
  // die drei Stufenverträge (pilot-agent-documentation-result.js) denselben
  // Abschnitten unterschiedliche fachliche Bedeutung geben (siehe Auftrag
  // Abschnitt 3, Analysefrage 1):
  //  - Abschnitt 1 ist bei allen drei Stufen das Fazit/Gesamturteil (PROSE).
  //  - Abschnitt 2 ist bei allen drei Stufen der wichtigste Kernbefund-/
  //    Stärkenabschnitt (ITEMS) – Quelle der "wichtigsten Erkenntnisse".
  //  - Der Risiko-/Grenzen-Abschnitt ist derjenige Abschnitt, dessen fester
  //    Titel bereits "GRENZEN" nennt (RESEARCH: Abschnitt 5 "GRENZEN UND
  //    UNSICHERHEITEN"; DOKUMENTATION: Abschnitt 3 "OFFENE PUNKTE UND
  //    GRENZEN") bzw. bei der PM-Stufe die belegten Schwächen (Abschnitt 3).
  //  - Nur die PM-Stufe hat einen eigenen Empfehlungsabschnitt ("EMPFEHLUNG
  //    AN JAMAL", Abschnitt 5) und einen eigenen Entscheidungsabschnitt
  //    ("PRIORISIERTE ENTSCHEIDUNGEN", Abschnitt 4) – Stufe 1/2 zeigen
  //    deshalb offen bewusst weder Empfehlung noch Entscheidung (Auftrag
  //    Abschnitt 4, "Verbindliches Zielbild").
  // Diese Zuordnung ist eine reine Auswahl unter bereits vorhandenen,
  // serverseitig festgelegten Abschnitten – keine neue Zusammenfassung, kein
  // zweiter Parser (Auftrag Abschnitt 10).
  var PRESENTATION_STAGE_SLOTS = {
    RESEARCH: { riskSectionNumber: 5, recommendationSectionNumber: null, decisionSectionNumber: null },
    DOCUMENTATION: { riskSectionNumber: 3, recommendationSectionNumber: null, decisionSectionNumber: null },
    PROJECT_MANAGER: { riskSectionNumber: 3, recommendationSectionNumber: 5, decisionSectionNumber: 4 },
  };
  var PRESENTATION_KEY_FINDINGS_SECTION_NUMBER = 1 + 1; // Abschnitt 2, siehe Kommentar oben.
  var PRESENTATION_KEY_FINDINGS_MAX_ITEMS = 3;

  function findPresentationSectionByNumber(sections, sectionNumber) {
    if (!Array.isArray(sections) || !sectionNumber) return null;
    return (
      sections.find(function (section) {
        return section && section.number === sectionNumber;
      }) || null
    );
  }

  function presentationSectionHasContent(section) {
    if (!section) return false;
    if (section.kind === "ITEMS") return Array.isArray(section.items) && section.items.length > 0;
    return isNonEmptyString(section.prose);
  }

  function renderPresentationItemListHtml(items) {
    return "<ul>" + items.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>";
  }

  // Höchstens drei wichtigste Erkenntnisse offen – die vollständige Liste
  // bleibt unverändert unter "Fachliche Details" erhalten (Auftrag Abschnitt
  // 11, Prüfpunkt 12). Reine Auswahl der ersten drei bereits vorhandenen
  // Items, keine Kürzung innerhalb eines Items.
  function renderKeyFindingsHtml(section) {
    if (!presentationSectionHasContent(section) || section.kind !== "ITEMS") return "";
    var limited = section.items.slice(0, PRESENTATION_KEY_FINDINGS_MAX_ITEMS);
    if (limited.length === 0) return "";
    return (
      '<div class="pilot-work-order-key-points"><p class="pilot-work-order-key-points__title">Wichtigste Erkenntnisse</p>' +
      renderPresentationItemListHtml(limited) +
      "</div>"
    );
  }

  // Kompakter Hinweis – nur sichtbar, wenn der zugeordnete Abschnitt
  // tatsächlich Inhalt hat (Auftrag Abschnitt 4: "nur wenn vorhanden").
  // Zeigt den vorhandenen Abschnitt unverändert, weder ergänzt noch
  // umformuliert noch dramatisiert (Auftrag Abschnitt 5).
  function renderRiskNoteHtml(section) {
    if (!presentationSectionHasContent(section)) return "";
    var body = section.kind === "ITEMS" ? renderPresentationItemListHtml(section.items) : "<p>" + escapeHtml(section.prose) + "</p>";
    return '<div class="pilot-work-order-risk-note"><p class="pilot-work-order-risk-note__title">Risiken und Grenzen</p>' + body + "</div>";
  }

  // Ausschließlich bei der PM-Stufe vorhanden (Auftrag Abschnitt 4/5).
  function renderRecommendationHtml(section) {
    if (!presentationSectionHasContent(section) || section.kind !== "PROSE") return "";
    return '<div class="pilot-work-order-recommendation"><p class="pilot-work-order-recommendation__title">Empfehlung</p><p>' + escapeHtml(section.prose) + "</p></div>";
  }

  // Nur anzeigen, wenn im vorhandenen Ergebnis tatsächlich ein
  // Entscheidungsabschnitt mit Inhalt vorliegt – niemals ein erfundener
  // Entscheidungsblock (Auftrag Abschnitt 5/11, Prüfpunkt 4/5).
  function renderDecisionRequiredHtml(section) {
    if (!presentationSectionHasContent(section) || section.kind !== "ITEMS") return "";
    return (
      '<div class="pilot-work-order-decision-required"><p class="pilot-work-order-decision-required__title">Entscheidung erforderlich</p>' +
      renderPresentationItemListHtml(section.items) +
      "</div>"
    );
  }

  // Kennzeichnung (Auftrag Abschnitt 4): "Zwischenergebnis" für Stufe 1/2,
  // "Gesamtbewertung" für die PM-Stufe. Der Wortlaut für Stufe 1/2 bleibt
  // bewusst identisch mit V8.1 (keine funktionale Änderung, ausschließlich
  // Anordnung).
  function renderStageStatusHtml(contractStage) {
    if (contractStage === "PROJECT_MANAGER") {
      return '<p class="pilot-work-order-result-status"><strong>Gesamtbewertung</strong></p>';
    }
    if (isChainIntermediateStage(contractStage)) {
      return '<p class="pilot-work-order-result-quality">Zwischenergebnis \u2013 noch nicht das abschlie\u00dfende Gesamtergebnis.</p>';
    }
    return "";
  }

  // Ebene 2 (Auftrag Abschnitt 6): genau EIN eingeklappter Bereich
  // "Fachliche Details" pro Kettenschritt, standardmäßig geschlossen (kein
  // "open"-Attribut). Enthält vollständig und in bestehender Reihenfolge
  // dieselben fünf Abschnitte, die V8.1 bereits offen zeigte – hier
  // ausschließlich in ihrer Vollständigkeit bewahrt, nicht neu erzeugt.
  function renderFachlicheDetailsHtml(presentation) {
    var body;
    if (presentation && presentation.structureStatus === "STRUCTURED" && Array.isArray(presentation.sections) && presentation.sections.length > 0) {
      body =
        '<p class="pilot-work-order-result-quality"><strong>Qualit\u00e4tsstatus:</strong> Vereinbarte Ergebnisstruktur eingehalten.</p>' +
        presentation.sections.map(renderResultPresentationSectionHtml).join("");
    } else if (presentation && presentation.structureStatus === "UNSTRUCTURED_ACCEPTED") {
      body =
        '<p class="pilot-work-order-result-quality"><strong>Qualit\u00e4tsstatus:</strong> Struktur nicht vollst\u00e4ndig eingehalten \u2013 Rohtext wird unver\u00e4ndert gezeigt.</p>' +
        "<p>" + escapeHtml(presentation.honestNotice || "") + "</p>";
    } else {
      body =
        '<p class="pilot-work-order-result-quality">Keine strukturierten Fachabschnitte verf\u00fcgbar \u2013 der vollst\u00e4ndige Rohtext ist unter \u201eTechnische Details\u201c einsehbar.</p>';
    }
    return '<details class="pilot-work-order-details pilot-work-order-result-fachlich"><summary>Fachliche Details</summary>' + body + "</details>";
  }

  function renderRunResultPresentationHtml(run) {
    var presentation = run && run.resultPresentation;
    var stage = presentation ? presentation.contractStage : null;
    var openHtml = renderStageStatusHtml(stage);

    if (presentation && presentation.structureStatus === "STRUCTURED" && Array.isArray(presentation.sections) && presentation.sections.length > 0) {
      var slots = PRESENTATION_STAGE_SLOTS[stage] || { riskSectionNumber: null, recommendationSectionNumber: null, decisionSectionNumber: null };
      var fazitSection = findPresentationSectionByNumber(presentation.sections, 1);
      var keyFindingsSection = findPresentationSectionByNumber(presentation.sections, PRESENTATION_KEY_FINDINGS_SECTION_NUMBER);
      var riskSection = findPresentationSectionByNumber(presentation.sections, slots.riskSectionNumber);
      var recommendationSection = findPresentationSectionByNumber(presentation.sections, slots.recommendationSectionNumber);
      var decisionSection = findPresentationSectionByNumber(presentation.sections, slots.decisionSectionNumber);

      if (presentationSectionHasContent(fazitSection)) {
        openHtml += '<p class="pilot-work-order-decision-verdict">' + escapeHtml(fazitSection.prose) + "</p>";
      }
      openHtml += renderKeyFindingsHtml(keyFindingsSection);
      openHtml += renderRecommendationHtml(recommendationSection);
      openHtml += renderDecisionRequiredHtml(decisionSection);
      openHtml += renderRiskNoteHtml(riskSection);
    } else if (presentation && presentation.structureStatus === "UNSTRUCTURED_ACCEPTED") {
      openHtml += "<p>" + escapeHtml(presentation.honestNotice || "") + "</p>";
    } else if (run && isNonEmptyString(run.resultRawText)) {
      // Kein serverseitig aufbereitetes Ergebnis vorhanden (\u00e4lterer
      // Overview-Stand ohne dieses additive Feld, oder
      // structureStatus === "UNAVAILABLE"): ehrlicher Hinweis statt
      // erfundener Struktur. Der Rohtext bleibt unver\u00e4ndert unter
      // "Technische Details" erreichbar (siehe renderRunTechnicalDetailsHtml).
      openHtml += '<p class="pilot-work-order-result-quality">F\u00fcr dieses Ergebnis liegt keine aufbereitete fachliche Zusammenfassung vor. Der vollst\u00e4ndige Rohtext ist unter \u201eTechnische Details\u201c einsehbar.</p>';
    }
    // Ebene 2 (Auftrag Abschnitt 6/11, Pr\u00fcfpunkt 6): genau EIN
    // "Fachliche Details"-Bereich, unabh\u00e4ngig vom Strukturstatus.
    openHtml += renderFachlicheDetailsHtml(presentation);
    return openHtml;
  }

  // Genau EIN <details>-Element pro Ergebnis (Auftrag Abschnitt 8): bündelt
  // Lauf-/Digest-/Runner-Angaben, die Verdichtungsinformationen und den
  // unveränderten Rohtext. Der gespeicherte run.resultRawText wird hier
  // ausschließlich gelesen, niemals verändert.
  //
  // V8.1 Korrektur ("echte Kettenansicht auf verständliche
  // Ergebnisdarstellung umstellen"): zusätzlich Lauf-ID, Runner-Art
  // (angefordert/tatsächlich), Runner, Modell und Start-/Endzeit ergänzt –
  // dieselben Felder, die vorher ausschließlich im alten, offenen Block
  // (renderAgentExecutionRun) sichtbar waren (Auftrag Abschnitt 4: diese
  // Angaben müssen im "Technische Details"-Bereich stehen, nicht offen).
  // Alle Werte stammen unverändert aus dem bereits vorhandenen
  // run-Objekt, keine neue Datenquelle.
  function renderRunTechnicalDetailsHtml(run) {
    if (!run) return "";
    var rows = [];
    if (run.id) rows.push("Lauf-ID: " + escapeHtml(run.id));
    if (isNonEmptyString(run.requestedRunnerKind) || isNonEmptyString(run.actualRunnerKind)) {
      rows.push(
        "Runner-Art \u2013 angefordert: " + escapeHtml(run.requestedRunnerKind || "unbekannt") +
          " \u00b7 tats\u00e4chlich: " + escapeHtml(run.actualRunnerKind || "unbekannt") +
          " \u00b7 KI ausgef\u00fchrt: " + (run.aiExecuted ? "ja" : "nein"),
      );
    }
    if (isNonEmptyString(run.runnerLabel || run.runnerId)) {
      rows.push("Runner: " + escapeHtml(run.runnerLabel || run.runnerId));
    }
    if (isNonEmptyString(run.modelLabel)) {
      rows.push("Modell: " + escapeHtml(run.modelLabel) + (run.runnerVersion ? " (" + escapeHtml(run.runnerVersion) + ")" : ""));
    }
    if (run.startedAt || run.finishedAt) {
      rows.push("Gestartet: " + escapeHtml(formatTimestamp(run.startedAt)) + " \u00b7 Beendet: " + escapeHtml(formatTimestamp(run.finishedAt)));
    }
    if (run.promptDigest) rows.push("Prompt-Digest: " + escapeHtml(run.promptDigest));
    if (run.mandateDigest) rows.push("Kernauftrag-Digest: " + escapeHtml(run.mandateDigest));
    var html = '<details class="pilot-work-order-details pilot-work-order-result-technical"><summary>Technische Details</summary>';
    html += rows.map(function (row) { return "<p>" + row + "</p>"; }).join("");
    if (run.resultTruncated) {
      html += '<p class="pilot-work-order-action-error">Hinweis: Das persistierte Ergebnis wurde beim Speichern gek\u00fcrzt.</p>';
    }
    html += documentationCompactionNoticeHtml(run);
    if (isNonEmptyString(run.resultRawText)) {
      html += "<p>Rohtext (unver\u00e4ndert gespeichert):</p><pre class=\"pilot-agent-execution-result\">" + escapeHtml(run.resultRawText) + "</pre>";
    }
    html += "</details>";
    return html;
  }

  function normalizedFileListFrom(entries) {
    var source = Array.isArray(entries) ? entries : [];
    var result = [];
    var seen = {};
    source.forEach(function (entry) {
      if (!isNonEmptyString(entry)) return;
      var value = entry.trim();
      if (!value || seen[value]) return;
      seen[value] = true;
      result.push(value);
    });
    return result;
  }

  function chainSelectableFilesFromOverview(overview) {
    return normalizedFileListFrom(overview && overview.chainSelectableFiles);
  }

  // V7.9.9: die für die Nutzerperspektive empfohlene Teilmenge kommt
  // ausschließlich aus der serverseitigen Antwort (chainRecommendedFiles).
  // Sie wird zusätzlich gegen die auswählbaren Dateien gefiltert – das
  // Cockpit zeigt und sendet niemals einen Pfad, den der Server nicht
  // ohnehin freigegeben hat. Fehlt das Feld (älterer Serverstand), bleibt
  // das bisherige V7.8.0-Verhalten erhalten.
  function chainRecommendedFilesFromOverview(overview) {
    var selectableFiles = chainSelectableFilesFromOverview(overview);
    return normalizedFileListFrom(overview && overview.chainRecommendedFiles).filter(function (entry) {
      return selectableFiles.indexOf(entry) !== -1;
    });
  }

  function getChainFileSelectionForOverview(overview) {
    var selectableFiles = chainSelectableFilesFromOverview(overview);
    var recommendedFiles = chainRecommendedFilesFromOverview(overview);
    if (!Array.isArray(state.chainSelectedFiles)) {
      // Deterministische Standardvorauswahl, keine Auswahlentscheidung durch
      // ein Sprachmodell: bevorzugt genau die empfohlenen
      // Nutzerperspektiv-Dateien, sonst (kein Feld vorhanden) unverändert
      // die vollständige Allowlist wie bisher.
      state.chainSelectedFiles = recommendedFiles.length > 0 ? recommendedFiles.slice() : selectableFiles.slice();
    } else {
      var selectedSeen = {};
      var filteredSelection = [];
      state.chainSelectedFiles.forEach(function (entry) {
        var value = isNonEmptyString(entry) ? entry.trim() : "";
        if (!value || selectedSeen[value]) return;
        if (selectableFiles.indexOf(value) === -1) return;
        selectedSeen[value] = true;
        filteredSelection.push(value);
      });
      state.chainSelectedFiles = filteredSelection;
    }
    return {
      selectableFiles: selectableFiles,
      recommendedFiles: recommendedFiles,
      selectedFiles: state.chainSelectedFiles.slice(),
    };
  }

  function toggleChainSelectedFile(filePath, checked) {
    if (!state.overview) return;
    var selection = getChainFileSelectionForOverview(state.overview);
    if (selection.selectableFiles.indexOf(filePath) === -1) return;
    var selected = selection.selectedFiles.slice();
    var idx = selected.indexOf(filePath);
    if (checked && idx === -1) selected.push(filePath);
    if (!checked && idx !== -1) selected.splice(idx, 1);
    selected = selection.selectableFiles.filter(function (pathEntry) {
      return selected.indexOf(pathEntry) !== -1;
    });
    state.chainSelectedFiles = selected;
    state.chainActionError = null;
    render();
  }

  function findAgentExecutionRunById(overview, executionRunId) {
    if (!executionRunId) return null;
    var runs = overview.agentExecutionRuns || [];
    for (var i = 0; i < runs.length; i += 1) {
      if (runs[i].id === executionRunId) return runs[i];
    }
    return null;
  }

  function isOrderChainInteractionLocked(overview) {
    if (!overview || !overview.order) return Boolean(state.chainActionInFlight);
    return state.chainActionInFlight || hasLocalStartBridgeForOrder(overview.order.id) || hasServerRunningState(overview);
  }

  function waitingStepNumberForChain(chain) {
    if (!chain) return null;
    var byStatus = {
      WAITING_FOR_RESEARCH_APPROVAL: 1,
      WAITING_FOR_DOCUMENTATION_APPROVAL: 2,
      WAITING_FOR_PM_APPROVAL: 3,
    };
    if (byStatus[chain.chainStatus]) return byStatus[chain.chainStatus];
    if (typeof chain.currentStep === "number") return chain.currentStep;
    return null;
  }

  function contextTimeMs(context) {
    if (!context) return 0;
    var run = context.run;
    var runTime = parseTimestampMs(run && (run.finishedAt || run.startedAt));
    if (runTime !== null) return runTime;
    var chainTime = parseTimestampMs(context.chain && context.chain.completedAt);
    if (chainTime !== null) return chainTime;
    return (context.chainIndex + 1) * 1000 + context.step.stepNumber;
  }

  function pickLatestContext(contexts) {
    if (!Array.isArray(contexts) || contexts.length === 0) return null;
    var winner = contexts[0];
    for (var i = 1; i < contexts.length; i += 1) {
      var candidate = contexts[i];
      var candidateTime = contextTimeMs(candidate);
      var winnerTime = contextTimeMs(winner);
      if (candidateTime > winnerTime) {
        winner = candidate;
        continue;
      }
      if (candidateTime === winnerTime) {
        if (candidate.chainIndex > winner.chainIndex) {
          winner = candidate;
          continue;
        }
        if (candidate.chainIndex === winner.chainIndex && candidate.step.stepNumber > winner.step.stepNumber) {
          winner = candidate;
          continue;
        }
        var candidateRevision = candidate.chain && typeof candidate.chain.revision === "number" ? candidate.chain.revision : -1;
        var winnerRevision = winner.chain && typeof winner.chain.revision === "number" ? winner.chain.revision : -1;
        if (candidateRevision > winnerRevision) {
          winner = candidate;
        }
      }
    }
    return winner;
  }

  function deriveActiveRun(overview) {
    if (!overview) return null;
    var chains = Array.isArray(overview.agentChains) ? overview.agentChains : [];
    if (chains.length === 0) return null;
    var runningContexts = [];
    var terminalContexts = [];
    var pendingContexts = [];
    for (var chainIndex = 0; chainIndex < chains.length; chainIndex += 1) {
      var chain = chains[chainIndex];
      var steps = Array.isArray(chain.steps) ? chain.steps : [];
      var runningStepByChainStatus = resolveStepNumberFromChainStatus(chain.chainStatus);
      for (var stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
        var step = steps[stepIndex];
        var run = findAgentExecutionRunById(overview, step.executionRunId);
        var isRunning =
          step.stepStatus === "RUNNING" ||
          (run && run.status === "RUNNING") ||
          (runningStepByChainStatus !== null && runningStepByChainStatus === step.stepNumber);
        var context = { chain: chain, step: step, run: run, chainIndex: chainIndex };
        if (isRunning) {
          runningContexts.push(context);
          continue;
        }
        if (step.stepStatus === "SUCCEEDED" || step.stepStatus === "FAILED" || chain.chainStatus === "FAILED" || chain.chainStatus === "BLOCKED") {
          terminalContexts.push(context);
          continue;
        }
        pendingContexts.push(context);
      }
    }
    if (runningContexts.length > 0) return pickLatestContext(runningContexts);
    if (terminalContexts.length > 0) return pickLatestContext(terminalContexts);
    if (pendingContexts.length > 0) return pickLatestContext(pendingContexts);
    var latestChain = findLatestChain(overview);
    if (!latestChain || !Array.isArray(latestChain.steps) || latestChain.steps.length === 0) return null;
    var fallbackStepNumber = waitingStepNumberForChain(latestChain);
    var fallbackStep = findChainStepByNumber(latestChain, fallbackStepNumber) || latestChain.steps[latestChain.steps.length - 1];
    return {
      chain: latestChain,
      step: fallbackStep,
      run: findAgentExecutionRunById(overview, fallbackStep.executionRunId),
      chainIndex: chains.length - 1,
    };
  }

  // V7.9.4 ("Konkrete Fehlerursache in der Kettenfehlerkarte sichtbar
  // machen"): die Auswahlreihenfolge war zuvor invertiert – step.
  // failureReasonCode (der Kettenservice schreibt hier bei einem regulären
  // Ausführungsfehler IMMER ausschließlich den Sammelcode
  // STEP_EXECUTION_FAILED, siehe pilot-agent-execution-chain-service.js#
  // finalizeChainStepFailure) gewann dadurch gegen den tatsächlich
  // präziseren, bereits gespeicherten und über die API gelieferten Code in
  // run.resultSummary.diagnostics.reasonCode. Die neue Reihenfolge:
  //   1. run.resultSummary.diagnostics.reasonCode – der präziseste bekannte
  //      Wert, sofern in der festen Allowlist enthalten.
  //   2. step.failureReasonCode – sofern bekannt UND NICHT ausschließlich
  //      der Sammelcode STEP_EXECUTION_FAILED (sonst wäre Schritt 5 exakt
  //      dasselbe Ergebnis, aber ohne die Sammelcode-Prüfung hier explizit
  //      sichtbar zu machen).
  //   3. chain.blockReason – AUSSCHLIESSLICH wenn die Kette tatsächlich
  //      BLOCKED ist UND der Wert einem bekannten Fehlercode entspricht. Bei
  //      FAILED enthält blockReason einen deutschen Freitextsatz (siehe
  //      finalizeChainStepFailure: blockReason = truncate(errorMessage,
  //      500)) – dieser darf NIEMALS als "Code: <Freitext>" erscheinen.
  //   4. state.chainActionErrorReasonCode – ein vom Server über die
  //      bestehende ERROR_DETAIL_FIELDS-Whitelist gelieferter reasonCode für
  //      einen lokal fehlgeschlagenen Freigabe-/Startversuch, sofern bekannt.
  //   5. STEP_EXECUTION_FAILED als bewusster, benannter Sammelcode-Rückfall.
  //   6. UNKNOWN – hier praktisch unerreichbar (Schritt 5 liefert bereits
  //      einen bekannten Code), bleibt aber der letzte sichere Rückfall in
  //      normalizeFailureReasonCode/resolveFailurePresentation.
  function resolveFailureReasonCodeFromContext(context) {
    if (context && context.run && context.run.resultSummary && context.run.resultSummary.diagnostics) {
      var diagnosticsReasonCode = context.run.resultSummary.diagnostics.reasonCode;
      if (isKnownFailureReasonCode(diagnosticsReasonCode)) return diagnosticsReasonCode.trim();
    }
    if (
      context &&
      context.step &&
      isKnownFailureReasonCode(context.step.failureReasonCode) &&
      context.step.failureReasonCode.trim() !== "STEP_EXECUTION_FAILED"
    ) {
      return context.step.failureReasonCode.trim();
    }
    if (
      context &&
      context.chain &&
      context.chain.chainStatus === "BLOCKED" &&
      isKnownFailureReasonCode(context.chain.blockReason)
    ) {
      return context.chain.blockReason.trim();
    }
    if (isKnownFailureReasonCode(state.chainActionErrorReasonCode)) {
      return state.chainActionErrorReasonCode.trim();
    }
    return "STEP_EXECUTION_FAILED";
  }

  // Der "Sammelcode" (heute ausschließlich STEP_EXECUTION_FAILED, siehe
  // Kopfkommentar oben) wird in "Technische Details" additiv gezeigt, wenn
  // er vom bereits präziser aufgelösten Code abweicht – niemals doppelt,
  // niemals roh/unbekannt.
  function resolveSammelcodeForDetails(context, preciseCode) {
    if (!context || !context.step) return null;
    var stepCode = isNonEmptyString(context.step.failureReasonCode) ? context.step.failureReasonCode.trim() : "";
    if (!isKnownFailureReasonCode(stepCode)) return null;
    return stepCode !== preciseCode ? stepCode : null;
  }

  function resolveRunnerPhaseForDetails(run) {
    var phase = run && run.resultSummary && run.resultSummary.diagnostics ? run.resultSummary.diagnostics.runnerPhase : null;
    return isNonEmptyString(phase) && CHAIN_KNOWN_RUNNER_PHASES.indexOf(phase.trim()) !== -1 ? phase.trim() : null;
  }

  function resolveExitCodeForDetails(run) {
    var diagnostics = run && run.resultSummary ? run.resultSummary.diagnostics : null;
    return diagnostics && Number.isInteger(diagnostics.exitCode) ? diagnostics.exitCode : null;
  }

  function resolveSafeSignalForDetails(run) {
    var diagnostics = run && run.resultSummary ? run.resultSummary.diagnostics : null;
    var signal = diagnostics ? diagnostics.signal : null;
    return isNonEmptyString(signal) && SAFE_SIGNAL_NAME_PATTERN.test(signal.trim()) ? signal.trim() : null;
  }

  function resolveDiagnosticFlagForDetails(run, diagnosticsField, runField) {
    var diagnostics = run && run.resultSummary ? run.resultSummary.diagnostics : null;
    if (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, diagnosticsField)) {
      return Boolean(diagnostics[diagnosticsField]);
    }
    if (run && Object.prototype.hasOwnProperty.call(run, runField)) {
      return Boolean(run[runField]);
    }
    return false;
  }

  // Additive, ausschließlich lesende Erweiterung von "Technische Details":
  // präziser Code, Sammelcode (falls abweichend), Runner-Phase, Exit-Code,
  // Signal, Zeitlimit-/Abbruchstatus, eine sicher geprüfte Kurzfassung von
  // run.errorMessage und der feste Diagnosehinweis. Niemals stdoutSample/
  // stderrSample/workspaceId/vollständige Pfade/Prompttext/Tokens/Secrets/
  // Umgebungsvariablen/vollständige rohe Systemmeldungen.
  function buildChainFailureTechnicalDetailsHtml(context, failurePresentation) {
    var run = context && context.run ? context.run : null;
    var preciseCode = failurePresentation.reasonCode || "UNKNOWN";
    var sammelcode = resolveSammelcodeForDetails(context, preciseCode);
    var phase = resolveRunnerPhaseForDetails(run);
    var exitCode = resolveExitCodeForDetails(run);
    var signal = resolveSafeSignalForDetails(run);
    var sanitizedMessage = run ? sanitizeErrorMessageForDisplay(run.errorMessage) : null;

    var rows = ["Code: " + escapeHtml(preciseCode)];
    if (sammelcode) rows.push("Sammelcode: " + escapeHtml(sammelcode));
    if (phase) rows.push("Phase: " + escapeHtml(phase));
    if (exitCode !== null) rows.push("Exit-Code: " + escapeHtml(String(exitCode)));
    if (signal) rows.push("Signal: " + escapeHtml(signal));
    if (run) {
      var timedOut = resolveDiagnosticFlagForDetails(run, "timedOut", "timedOut");
      var cancelled = resolveDiagnosticFlagForDetails(run, "cancelled", "cancelledRun");
      rows.push("Zeitlimit \u00fcberschritten: " + (timedOut ? "ja" : "nein"));
      rows.push("Abgebrochen: " + (cancelled ? "ja" : "nein"));
    }

    var html = '<details class="pilot-chain-status-card__technical"><summary>Technische Details</summary>';
    html += rows.map(function (row) { return "<p>" + row + "</p>"; }).join("");
    if (sanitizedMessage) {
      html += "<p>" + escapeHtml(sanitizedMessage) + "</p>";
    }
    html += "<p>" + escapeHtml(CHAIN_TECHNICAL_DIAGNOSTIC_NOTICE) + "</p>";
    html += "</details>";
    return html;
  }

  // Liefert Überschrift UND Text getrennt (siehe NEXT_STEP_LABEL_SAFE oben):
  // die sichtbare Überschrift setzt ausschließlich renderChainStatusCard, damit
  // sie nicht zweimal erscheint. Der COMPLETED-Fall behält die fachliche
  // Abschwächung "erlaubt" über die Überschrift.
  function nextChainStepHint(chain) {
    if (!chain) return { label: NEXT_STEP_LABEL_SAFE, text: "unten den bestätigten Status prüfen." };
    var waitingStep = waitingStepNumberForChain(chain);
    if (waitingStep === 1 || waitingStep === 2 || waitingStep === 3) {
      return { label: NEXT_STEP_LABEL_SAFE, text: "Schritt " + waitingStep + " kann jetzt freigegeben werden." };
    }
    if (chain.chainStatus === "COMPLETED") {
      return { label: NEXT_STEP_LABEL_ALLOWED, text: "bei Bedarf oben manuell zur Abschlussprüfung vorlegen." };
    }
    return { label: NEXT_STEP_LABEL_SAFE, text: "unten den bestätigten Status prüfen." };
  }

  // Eine Schaltfläche für genau eine Stufe. `kind` ist "approve" oder
  // "start". Deaktiviert, sobald: falscher Kettenstatus, Vorgänger fehlt,
  // Freigabe fehlt, Codex nicht verfügbar/authentifiziert, eine andere
  // Stufe läuft, oder eine Aktion bereits läuft (siehe Auftrag Abschnitt
  // "Cockpit"/"Buttons müssen deaktiviert sein").
  function renderChainStepCard(overview, chain, step) {
    var availability = overview.codexAvailability || { available: false, authenticated: false };
    var isCurrentStep = chain.currentStep === step.stepNumber;
    var chainIsOpen = ["PREPARED", "WAITING_FOR_RESEARCH_APPROVAL", "WAITING_FOR_DOCUMENTATION_APPROVAL", "WAITING_FOR_PM_APPROVAL"].indexOf(chain.chainStatus) !== -1;
    var orderChainLocked = isOrderChainInteractionLocked(overview);
    var anyStepRunning = chain.steps.some(function (entry) {
      return entry.stepStatus === "RUNNING";
    });
    var tokenKey = chainStepTokenKey(chain.id, step.stepNumber);
    var hasToken = Boolean(state.chainStepApprovalTokens[tokenKey]);
    var pendingPredecessorTooLarge = step.pendingPredecessorTooLarge === true;
    // Bediengrenze zum fail-closed Auftragsstatus-Gate in
    // pilot-agent-execution-chain-service.js#assertOrderAllowsChainAction:
    // neue Kettenarbeit (Freigabe anfordern, Stufe starten) beginnt
    // ausschließlich während "In Ausführung". Die Oberfläche bietet deshalb
    // keine Aktion an, die der Server verlässlich mit 409 ablehnen würde.
    // Rein additive Bediengrenze – die Sicherheit liegt ausschließlich im
    // Kettenservice; die Historie unten bleibt unverändert vollständig
    // sichtbar.
    var orderAllowsNewChainWork = overview.status === "IN_EXECUTION";

    var canRequestApproval =
      orderAllowsNewChainWork &&
      isCurrentStep &&
      chainIsOpen &&
      !anyStepRunning &&
      !pendingPredecessorTooLarge &&
      step.stepStatus === "PENDING" &&
      step.approvalStatus === "NOT_REQUESTED" &&
      availability.available &&
      availability.authenticated &&
      !state.chainActionInFlight &&
      !orderChainLocked;
    var canStart =
      orderAllowsNewChainWork &&
      isCurrentStep &&
      chainIsOpen &&
      !anyStepRunning &&
      !pendingPredecessorTooLarge &&
      step.stepStatus === "PENDING" &&
      step.approvalStatus === "REQUESTED" &&
      hasToken &&
      availability.available &&
      availability.authenticated &&
      !state.chainActionInFlight &&
      !orderChainLocked;
    var run = findAgentExecutionRunById(overview, step.executionRunId);
    var chainMandate = chain.coreMandate || null;
    var qualityCriteria = chainMandate && Array.isArray(chainMandate.qualityCriteria) ? chainMandate.qualityCriteria.filter(Boolean) : [];
    var qualityPreview = qualityCriteria.length > 0 ? qualityCriteria.join(" | ") : "nicht angegeben";
    var stageTaskLabel = run && run.taskTitle ? run.taskTitle : CHAIN_STEP_TITLES[step.stepNumber] || "Schritt " + step.stepNumber;

    // V8.2.1 ("Technischen Kopf einklappen"): dieselben Angaben, die vorher
    // unveränderlich zwischen der Schritt-Überschrift und dem eigentlichen
    // Kettenergebnis offen standen (Agent, Status/Freigabe, Kernauftrag/
    // Ergebniswunsch/Qualitätskriterien, Stufenauftrag, executionRunId,
    // Vorgänger-executionRunId, Vorgänger-Übernahme, Rollenverbuchung),
    // werden jetzt unverändert (kein Text gekürzt, umformuliert oder
    // entfernt) in `orderAndRunDetailsHtml` gesammelt. Für einen bereits
    // erfolgreich abgeschlossenen Schritt (Ergebnis vorhanden) erscheinen
    // sie erst NACH dem Ergebnis in einem neuen, standardmäßig
    // geschlossenen Bereich "Auftrags- und Laufdetails" (siehe unten) statt
    // wie bisher offen VOR dem Ergebnis. Ohne Ergebnis (Schritt noch
    // PENDING/RUNNING oder ohne zugehörigen Lauf FAILED) bleibt die
    // Darstellung exakt wie vor diesem Auftrag – dort sind Status,
    // Freigabe und die Schaltflächen weiterhin sofort ohne Aufklappen
    // sichtbar, weil dort noch keine Ergebnisdarstellung existiert, vor der
    // sie stünden.
    var orderAndRunDetailsHtml = "";
    orderAndRunDetailsHtml += "<br>Agent: " + escapeHtml(CHAIN_AGENT_LABELS[step.agentKey] || step.agentKey) + " (" + escapeHtml(step.agentKey) + ")";
    orderAndRunDetailsHtml +=
      "<br>Status: " + (CHAIN_STEP_STATUS_LABELS[step.stepStatus] || escapeHtml(step.stepStatus)) + " \u00b7 Freigabe: " + (CHAIN_APPROVAL_STATUS_LABELS[step.approvalStatus] || escapeHtml(step.approvalStatus));
    if (chainMandate) {
      orderAndRunDetailsHtml += "<br>Kernauftrag: " + escapeHtml(chainMandate.title || "nicht angegeben");
      orderAndRunDetailsHtml += "<br>Ergebniswunsch: " + escapeHtml(chainMandate.desiredOutcome || "nicht angegeben");
      orderAndRunDetailsHtml += "<br>Qualitätskriterien (Kernauftrag): " + escapeHtml(qualityPreview);
    } else {
      orderAndRunDetailsHtml += "<br>Kernauftrag f\u00fcr diese Altkette nicht mitgef\u00fchrt";
    }
    orderAndRunDetailsHtml += "<br>Stufenauftrag: " + escapeHtml(stageTaskLabel);
    if (step.executionRunId) {
      orderAndRunDetailsHtml += "<br>executionRunId: " + escapeHtml(step.executionRunId);
    }
    if (step.chainedFromExecutionRunId) {
      orderAndRunDetailsHtml += "<br>Vorg\u00e4nger-executionRunId: " + escapeHtml(step.chainedFromExecutionRunId);
    }
    if (step.stepNumber === 1) {
      orderAndRunDetailsHtml += "<br>Vorgänger vollständig übernommen: nicht erforderlich (Schritt 1).";
    } else if (step.predecessorFullyIncluded === true) {
      orderAndRunDetailsHtml +=
        "<br>Vorgänger vollständig übernommen: ja" +
        (step.predecessorIncludedCharCount !== null && step.predecessorIncludedCharCount !== undefined
          ? " (" + escapeHtml(String(step.predecessorIncludedCharCount)) + " Zeichen)."
          : ".");
    } else if (step.predecessorFullyIncluded === false) {
      orderAndRunDetailsHtml +=
        '<br><span class="pilot-work-order-action-error">Vorgänger vollständig übernommen: nein' +
        (step.predecessorCharCount !== null && step.predecessorCharCount !== undefined
          ? " (" + escapeHtml(String(step.predecessorCharCount)) + " Zeichen vorhanden)."
          : ".") +
        "</span>";
    }
    if (step.roleHandoffBooked) {
      orderAndRunDetailsHtml += "<br>Rollenverbuchung: erfolgt" + (step.roleHandoffBookedAt ? " (" + escapeHtml(formatTimestamp(step.roleHandoffBookedAt)) + ")" : "");
    }

    // Dieselben Steuerungselemente (Warnhinweis bei zu langer
    // Vorgängerübergabe, die beiden Schaltflächen, der Freigabehinweis)
    // unverändert wie bisher – für einen bereits erfolgreich
    // abgeschlossenen Schritt sind "Freigabe anfordern"/"Stufe starten"
    // ohnehin immer dauerhaft deaktiviert (siehe canRequestApproval/
    // canStart, beide verlangen step.stepStatus === "PENDING"); sie stehen
    // dann zusammen mit den übrigen Auftrags-/Laufangaben im neuen
    // eingeklappten Bereich, statt zwischen Schritt-Überschrift und
    // Ergebnis zu stehen.
    var controlsHtml = "";
    if (pendingPredecessorTooLarge) {
      var pendingCharCountText =
        step.pendingPredecessorCharCount !== null && step.pendingPredecessorCharCount !== undefined
          ? String(step.pendingPredecessorCharCount)
          : "unbekannt";
      controlsHtml +=
        '<br><span class="pilot-work-order-action-error">Vorg\u00e4nger\u00fcbergabe zu lang (' +
        escapeHtml(pendingCharCountText) +
        " von maximal " +
        escapeHtml(String(CHAIN_PREDECESSOR_MAX_CHARS)) +
        " Zeichen). Dieser Schritt kann so nicht gestartet werden.</span>";
    }
    controlsHtml +=
      ' <button type="button" data-action="request-chain-step-approval" data-chain-id="' +
      escapeHtml(chain.id) +
      '" data-chain-step="' +
      step.stepNumber +
      '"' +
      (canRequestApproval ? "" : " disabled") +
      ">Freigabe f\u00fcr diese Stufe anfordern</button>";
    controlsHtml +=
      ' <button type="button" data-action="start-chain-step" data-chain-id="' +
      escapeHtml(chain.id) +
      '" data-chain-step="' +
      step.stepNumber +
      '"' +
      (canStart ? "" : " disabled") +
      ">Genau diese Stufe starten</button>";
    if (hasToken) {
      controlsHtml += "<p>Freigabe liegt vor \u2013 gilt ausschlie\u00dflich f\u00fcr genau diese eine Stufe.</p>";
    }

    var html = '<li class="pilot-agent-chain-step">';
    html += "<strong>" + escapeHtml(CHAIN_STEP_TITLES[step.stepNumber] || "Schritt " + step.stepNumber) + "</strong>";

    var showResult = step.stepStatus === "SUCCEEDED" && Boolean(run);

    if (!showResult) {
      // Kein Kettenergebnis vorhanden, vor dem geblättert werden müsste –
      // unveränderte V8.2-Darstellung: Auftrags-/Laufangaben und
      // Steuerungselemente stehen wie bisher offen direkt unter der
      // Schritt-Überschrift.
      html += orderAndRunDetailsHtml;
      html += controlsHtml;
    }
    if (showResult) {
      // V8.1 ("Ergebnis verstehen ohne Technik"): fachlicher Inhalt zuerst
      // (resultPresentation, rein lesend vom Server aufbereitet), Runner-,
      // Digest- und Rohtext-Angaben wandern in genau EIN <details>-Element
      // weiter unten. run.resultRawText bleibt dabei unangetastet.
      html += renderRunResultPresentationHtml(run);
      var analyzedFiles = [];
      if (run.resultSummary && Array.isArray(run.resultSummary.analyzedFiles)) {
        analyzedFiles = run.resultSummary.analyzedFiles
          .map(function (entry) {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry.path === "string") return entry.path;
            return "";
          })
          .filter(Boolean);
      }
      var analyzedFilesHtml = "";
      if (analyzedFiles.length > 0) {
        analyzedFilesHtml = "<p>Tats\u00e4chlich verwendete Dateien: " + escapeHtml(analyzedFiles.join(", ")) + "</p>";
      }
      html += renderRunTechnicalDetailsHtml(run);
      // V8.2.1 ("Technischen Kopf einklappen"): Ebene 3, standardmäßig
      // geschlossen. Enthält vollständig und unverändert dieselben
      // Angaben (inklusive Steuerungselemente), die vorher offen vor dem
      // Ergebnis standen, ergänzt um die ebenfalls rein technische Angabe
      // der tatsächlich verwendeten Dateien (vorher offen zwischen
      // Ergebnis und "Technische Details"). Kein Informationsverlust: jede
      // Angabe bleibt vollständig vorhanden, ausschließlich die
      // Standard-Sichtbarkeit ändert sich.
      html +=
        '<details class="pilot-work-order-details pilot-work-order-order-run-details"><summary>Auftrags- und Laufdetails</summary>' +
        orderAndRunDetailsHtml +
        analyzedFilesHtml +
        controlsHtml +
        "</details>";
    }
    if (step.stepStatus === "FAILED") {
      html +=
        '<br><span class="pilot-work-order-action-error">Dieser Kettenschritt ist fehlgeschlagen' +
        (step.failureReasonCode ? " (" + escapeHtml(step.failureReasonCode) + ")" : "") +
        ". Die Kette wird dadurch nicht automatisch fortgesetzt.</span>";
    }
    html += "</li>";
    return html;
  }

  function renderAgentChainCard(overview, chain) {
    var html = '<div class="pilot-agent-chain-card">';
    html += "<p><strong>Kette " + escapeHtml(chain.id) + "</strong> \u2013 " + chainStatusLabel(chain.chainStatus) + " (Revision " + escapeHtml(String(chain.revision)) + ")</p>";
    if (chain.selectedFilesFixed === false) {
      html += "<p>Altkette ohne fixierte Dateiauswahl - je Stufe gelten die Preset-Dateien</p>";
    } else if (Array.isArray(chain.selectedFiles) && chain.selectedFiles.length > 0) {
      html += "<p>Dateiauswahl dieser Kette (für alle drei Stufen fixiert): " + escapeHtml(chain.selectedFiles.join(", ")) + "</p>";
    }
    if (chain.mandateDigest) {
      html += "<p>Kernauftrag-Digest der Kette: " + escapeHtml(chain.mandateDigest) + "</p>";
    }
    if (chain.chainStatus === "BLOCKED" && chain.blockReason) {
      html +=
        '<p class="pilot-work-order-action-error">Blockiert: ' +
        escapeHtml(chainBlockReasonText(chain.blockReason)) +
        ". Kein automatischer weiterer Schritt m\u00f6glich.</p>";
    }
    if (chain.chainStatus === "FAILED") {
      html += '<p class="pilot-work-order-action-error">Diese Kette ist fehlgeschlagen und wird nicht automatisch fortgesetzt.</p>';
    }
    html += "<ol>" + chain.steps.map(function (step) { return renderChainStepCard(overview, chain, step); }).join("") + "</ol>";
    if (chain.chainStatus === "COMPLETED") {
      var pmStep = chain.steps[2];
      var pmRun = pmStep ? findAgentExecutionRunById(overview, pmStep.executionRunId) : null;
      if (pmRun && pmRun.resultRawText) {
        // V8.1 Korrektur ("echte Kettenansicht auf verständliche
        // Ergebnisdarstellung umstellen"): dasselbe PM-Ergebnis ist bereits
        // oben in der Stufe-3-Karte inklusive Rohtext und "Technischen
        // Details" vollständig sichtbar. Hier deshalb ausschließlich die
        // fachliche Kurzdarstellung – KEIN zweites offenes <pre> mit dem
        // vollständigen Rohtext (Auftrag Abschnitt 4/7: Rohtext darf nicht
        // doppelt bzw. zusätzlich offen erscheinen). Auch im
        // UNSTRUCTURED_ACCEPTED- bzw. Fallback-Fall bleibt der ehrliche
        // Hinweis stehen, ohne den Rohtext hier erneut auszugeben.
        var pmPresentation = pmRun.resultPresentation;
        // V8.2 ("Entscheidungsansicht statt Textmenge", Auftrag Abschnitt 7,
        // "PM-Gesamturteil außerhalb des dritten Kettenschritts"): dasselbe
        // PM-Ergebnis steht bereits vollständig (Gesamtbewertung, wichtigste
        // Erkenntnisse, Empfehlung, ggf. Entscheidung, Risiken/Grenzen sowie
        // die vollständigen Fachlichen/Technischen Details) oben in Stufe 3.
        // Hier deshalb nur noch ein kompakter Verweis, der vollständige
        // Wortlaut bleibt zusätzlich – aber standardmäßig eingeklappt –
        // erreichbar (nicht gelöscht, siehe Auftrag Abschnitt 7, letzter
        // Absatz).
        html += "<h5>PM-Gesamturteil</h5>";
        html +=
          '<p class="pilot-work-order-result-quality">Gesamtbewertung, wichtigste Erkenntnisse, Empfehlung und ggf. Entscheidung stehen oben in Stufe 3.</p>';
        if (pmPresentation && pmPresentation.structureStatus === "STRUCTURED" && Array.isArray(pmPresentation.sections) && pmPresentation.sections.length > 0) {
          html +=
            '<details class="pilot-work-order-details"><summary>Vollst\u00e4ndiger PM-Bericht (Wiederholung aus Stufe 3)</summary>' +
            pmPresentation.sections.map(renderResultPresentationSectionHtml).join("") +
            "</details>";
        } else if (pmPresentation && pmPresentation.structureStatus === "UNSTRUCTURED_ACCEPTED") {
          html += "<p>" + escapeHtml(pmPresentation.honestNotice || "") + "</p>";
          html += '<p class="pilot-work-order-result-quality">Der vollst\u00e4ndige Rohtext steht oben in Stufe 3 unter \u201eTechnische Details\u201c.</p>';
        } else {
          html +=
            '<p class="pilot-work-order-result-quality">F\u00fcr dieses Ergebnis liegt keine aufbereitete fachliche Zusammenfassung vor. ' +
            "Der vollst\u00e4ndige Rohtext steht oben in Stufe 3 unter \u201eTechnische Details\u201c.</p>";
        }
      }
    }
    html += "</div>";
    return html;
  }

  function renderAgentChainSection(overview) {
    var chains = overview.agentChains || [];
    var selection = getChainFileSelectionForOverview(overview);
    var orderChainLocked = isOrderChainInteractionLocked(overview);
    var html = "<h4>Drei-Agenten-Kette (Recherche \u2192 Dokumentation \u2192 PM-Bewertung)</h4>";
    html +=
      "<p>Jede Stufe verwendet einen echten, isolierten Codex-Agentenlauf mit eigener executionRunId und ben\u00f6tigt eine eigene, " +
      "kurzlebige Einzelfreigabe. Ein erfolgreicher Schritt startet den n\u00e4chsten niemals automatisch.</p>";
    html += "<p>Der Kernauftrag bleibt f\u00fcr alle drei Stufen unver\u00e4ndert. Jamal legt die Dateiauswahl hier einmal f\u00fcr alle drei Stufen fest.</p>";
    // V8.1 Korrektur ("echte Kettenansicht auf verständliche
    // Ergebnisdarstellung umstellen"): NUR die Anlage einer NEUEN Kette
    // bleibt unverändert an "In Ausführung" gebunden. Vorher endete diese
    // Funktion hier per return und zeigte dadurch für jeden Pilotauftrag,
    // der nicht mehr IN_EXECUTION ist (z. B. status COMPLETED), überhaupt
    // keine Kettenkarte an – nicht einmal für eine bereits erfolgreich
    // abgeschlossene Kette. Genau das war die Ursache der fehlgeschlagenen
    // Browserabnahme (siehe Analyse zu Auftrag Abschnitt 3): der bereits
    // korrekt umgestellte renderChainStepCard/renderRunResultPresentationHtml
    // wurde dadurch im Browser für abgeschlossene Aufträge nie erreicht.
    if (overview.status !== "IN_EXECUTION") {
      html += "<p>Eine neue Agentenkette kann nur w\u00e4hrend \u201eIn Ausf\u00fchrung\u201c vorbereitet werden.</p>";
    } else {
      if (selection.selectableFiles.length > 0) {
        html += '<div class="pilot-chain-file-selection"><p><strong>Dateiauswahl f\u00fcr alle drei Stufen:</strong></p>';
        if (selection.recommendedFiles.length > 0) {
          html +=
            "<p>Vorausgew\u00e4hlt sind die f\u00fcr die Nutzerperspektive empfohlenen Dateien (" +
            escapeHtml(selection.recommendedFiles.join(", ")) +
            "). Die Auswahl ist frei \u00e4nderbar; die Liste selbst ist serverseitig geschlossen. " +
            "Eine Auswahl allein bereitet keine Kette vor, gibt nichts frei und startet nichts.</p>";
        }
        html += "<ul>";
        selection.selectableFiles.forEach(function (filePath) {
          var checked = selection.selectedFiles.indexOf(filePath) !== -1;
          var recommended = selection.recommendedFiles.indexOf(filePath) !== -1;
          html +=
            "<li><label>" +
            '<input type="checkbox" data-action="toggle-chain-selected-file" data-file-path="' +
            escapeHtml(filePath) +
            '"' +
            (checked ? " checked" : "") +
            (state.chainActionInFlight || orderChainLocked ? " disabled" : "") +
            " /> " +
            escapeHtml(filePath) +
            (recommended ? " \u2013 empfohlen f\u00fcr die Nutzerperspektive" : "") +
            "</label></li>";
        });
        html += "</ul></div>";
      }
      var canPrepare = !state.chainActionInFlight && !orderChainLocked && selection.selectedFiles.length > 0;
      html +=
        '<button type="button" data-action="prepare-agent-chain"' +
        (canPrepare ? "" : " disabled") +
        ">Neue Agentenkette vorbereiten (Recherche/Dokumentation/PM)</button>";
      if (selection.selectedFiles.length === 0) {
        html += '<p class="pilot-work-order-action-error">Mindestens eine Datei muss ausgew\u00e4hlt sein, bevor die Kette vorbereitet werden kann.</p>';
      }
      if (state.chainActionError) {
        html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.chainActionError) + "</p>";
      }
    }
    html += renderChainStatusCard(overview);
    if (chains.length === 0) {
      html += "<p>Noch keine Agentenkette vorbereitet.</p>";
    } else {
      html += chains.map(function (chain) { return renderAgentChainCard(overview, chain); }).join("");
    }
    return html;
  }

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
    if (run.status === "SUCCEEDED") {
      lines.push(documentationCompactionNoticeHtml(run));
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
    // V8.1 Korrektur ("echte Kettenansicht auf verständliche
    // Ergebnisdarstellung umstellen"): Läufe eines Drei-Agenten-Kettenschritts
    // (chainManaged, erkennbar an ihrer festen, serverseitig vergebenen
    // presetId, siehe pilot-agent-execution-service.js#PILOT_AGENT_TASK_PRESETS)
    // erscheinen ebenfalls in overview.agentExecutionRuns und wurden hier
    // bisher IMMER zusätzlich mit dem alten, offenen Rohtextblock gezeigt –
    // unabhängig vom Auftragsstatus. Sie haben weiter unten in der
    // Drei-Agenten-Kette (renderAgentChainSection/renderChainStepCard)
    // bereits genau eine vollständige Darstellung inklusive Rohtext unter
    // "Technische Details". Ohne diesen Filter gäbe es pro Kettenschritt
    // zwei technische Detailbereiche und einen doppelt offenen Rohtext
    // (Auftrag Abschnitt 4: "genau einen technischen Detailbereich je
    // Kettenschritt"). Kein Datenverlust: derselbe Lauf bleibt vollständig
    // sichtbar, ausschließlich an der einen dafür vorgesehenen Stelle.
    var nonChainRuns = runs.filter(function (run) {
      return !isChainManagedRun(run);
    });
    if (nonChainRuns.length === 0) {
      html +=
        runs.length === 0
          ? "<p>Noch kein Agentenlauf gestartet.</p>"
          : "<p>Alle bisherigen L\u00e4ufe geh\u00f6ren zu einer Drei-Agenten-Kette und werden ausschlie\u00dflich weiter unten unter \u201eDrei-Agenten-Kette\u201c gezeigt.</p>";
    } else {
      html += "<ol>" + nonChainRuns.map(renderAgentExecutionRun).join("") + "</ol>";
    }
    return html;
  }

  // V8.2 ("Entscheidungsansicht statt Textmenge", Auftrag Abschnitt 7):
  // offen stehen ausschließlich von Rolle, an Rolle, Filterstatus, ein
  // kurzer Übergabebefund und – bei einer Ablehnung durch den
  // Projektmanager-Filter – der Ablehnungsgrund. Der vollständige Wortlaut
  // (Ergebnis/Empfehlung, Grundlage, Risiko/Grenze, nächster Schritt,
  // benötigte Entscheidung, Filterhinweis) bleibt vollständig, aber
  // standardmäßig eingeklappt unter "Übergabedetails" erhalten – nichts
  // wird gelöscht.
  function renderHandoffDetailsHtml(handoff) {
    var rows = [
      "<p>Ergebnis/Empfehlung: " + escapeHtml(handoff.resultOrRecommendation) + "</p>",
      "<p>Grundlage: " + escapeHtml(handoff.basisUsed) + "</p>",
      "<p>Risiko/Grenze: " + escapeHtml(handoff.riskOrLimit) + "</p>",
      "<p>N\u00e4chster Schritt: " + escapeHtml(handoff.nextStep) + "</p>",
    ];
    if (handoff.decisionNeeded) {
      rows.push("<p>Ben\u00f6tigte Entscheidung: " + escapeHtml(handoff.decisionNeeded) + "</p>");
    }
    if (handoff.pmFilterReasons && handoff.pmFilterReasons.length > 0) {
      rows.push("<p>Filterhinweis: " + escapeHtml(handoff.pmFilterReasons.join("; ")) + "</p>");
    }
    return (
      '<details class="pilot-work-order-details pilot-work-order-handoff-details"><summary>\u00dcbergabedetails</summary>' +
      rows.join("") +
      "</details>"
    );
  }

  function renderHandoffs(overview) {
    if (!overview.handoffs || overview.handoffs.length === 0) {
      return "<h4>Rollen\u00fcbergaben</h4><p>Noch keine Rollen\u00fcbergabe eingereicht.</p>";
    }
    var items = overview.handoffs
      .map(function (handoff) {
        var rejectionHint =
          handoff.pmFilterStatus === "REJECTED" && handoff.pmFilterReasons && handoff.pmFilterReasons.length > 0
            ? "<br>Ablehnungsgrund: " + escapeHtml(handoff.pmFilterReasons.join("; "))
            : "";
        return (
          "<li><strong>" + handoff.sequence + ". von " + escapeHtml(handoff.fromPilotRole) + " an " + escapeHtml(handoff.toPilotRoleLabel) + "</strong>" +
          "<br>Filterstatus: " + escapeHtml(handoff.pmFilterStatus) +
          "<br>Kurzbefund: " + escapeHtml(handoff.shortFinding) +
          rejectionHint +
          renderHandoffDetailsHtml(handoff) +
          "</li>"
        );
      })
      .join("");
    return "<h4>Rollen\u00fcbergaben (bisherige Ergebnisse)</h4><ol>" + items + "</ol>";
  }

  // V8.7 Stufe B ("gespeicherte Entscheidungsgründe in der
  // Pilotauftrags-Detailansicht sichtbar machen"): rein darstellende,
  // seiteneffektfreie Aufbereitung von overview.currentDecisionReason/
  // overview.decisionReasonHistory (siehe buildOverview() in
  // pilot-work-order-service.js, Stufe A). Die Aktualität bestimmt
  // ausschließlich der Server über currentDecisionReason – die UI berechnet
  // niemals selbst über overview.revision oder eine Suche in der Historie,
  // welcher Grund gerade gültig ist. setByUserId, fromStatus und toStatus
  // werden bewusst nicht angezeigt; orderRevision dient ausschließlich dem
  // Ausschluss des aktuellen Eintrags aus der Historie, niemals sichtbarem
  // HTML.

  // Grundart zu Klartext – ausschließlich für die obere Karte (aktueller
  // Grund). Ein unbekannter/fehlender Wert liefert null; der Aufrufer zeigt
  // dann den defensiven Ersatzkopf "Entscheidung am <Datum>" (siehe unten),
  // niemals einen rohen Kind-Wert.
  function decisionReasonTopHeading(kind) {
    if (kind === "BLOCK") return "Warum der Auftrag blockiert ist";
    if (kind === "RETURN") return "Warum der Auftrag zur\u00fcckgegeben wurde";
    return null;
  }

  // Gleiche Klartext-Zuordnung, aber ausgehend vom aktuellen Auftragsstatus
  // (Fall C: kein konkreter aktueller Grund gespeichert).
  function decisionReasonHeadingForStatus(status) {
    if (status === "BLOCKED") return "Warum der Auftrag blockiert ist";
    if (status === "RETURNED") return "Warum der Auftrag zur\u00fcckgegeben wurde";
    return null;
  }

  // Eintragskopf für einen historischen Grund (Fall E/F). Eine unbekannte
  // Grundart zeigt niemals den technischen Rohwert, sondern ausschließlich
  // den defensiven Klartext "Entscheidung am <Datum>".
  function decisionReasonHistoryEntryHeading(kind, formattedDate) {
    if (kind === "BLOCK") return "Blockiert am " + formattedDate;
    if (kind === "RETURN") return "Zur\u00fcckgegeben am " + formattedDate;
    return "Entscheidung am " + formattedDate;
  }

  // Historische Gründe defensiv ableiten: overview.decisionReasonHistory
  // kann bei älteren Fake-Backends/Bestandsantworten undefined statt []
  // sein (siehe Array.isArray-Prüfung). Vor dem Filtern/Sortieren wird das
  // Array kopiert (slice()) – das Originalarray und overview selbst bleiben
  // unverändert. Ist currentDecisionReason null, gilt jeder vorhandene
  // Eintrag als historisch; andernfalls wird genau der Eintrag
  // ausgeschlossen, dessen orderRevision der des bereits serverseitig
  // bestimmten currentDecisionReason entspricht (kein eigener
  // Aktualitäts-Check über Status/Text). Ergebnis: neueste zuerst.
  function deriveDecisionReasonHistoryEntries(overview) {
    var rawHistory = overview && overview.decisionReasonHistory;
    if (!Array.isArray(rawHistory)) return [];
    var current = (overview && overview.currentDecisionReason) || null;
    var currentRevision = current ? current.orderRevision : null;
    var historicalEntries = rawHistory.slice().filter(function (entry) {
      if (!entry) return false;
      if (!current) return true;
      return entry.orderRevision !== currentRevision;
    });
    return historicalEntries.sort(function (a, b) {
      var revA = typeof a.orderRevision === "number" ? a.orderRevision : -Infinity;
      var revB = typeof b.orderRevision === "number" ? b.orderRevision : -Infinity;
      return revB - revA;
    });
  }

  // Obere Arbeitsebene, zwischen renderChainStatusCard() und
  // renderPrimaryAction(): Grund verstehen → bestehende Aktion sehen.
  // Rendert nichts, wenn weder ein aktueller Grund noch ein blockierter/
  // zurückgegebener Status ohne Grund vorliegt (kein neuer Abschnitt bei
  // einem normalen Auftrag ohne Grund).
  function renderDecisionReasonCard(overview) {
    if (!overview) return "";
    var current = overview.currentDecisionReason || null;
    var hasHistory = deriveDecisionReasonHistoryEntries(overview).length > 0;
    var historyHint = hasHistory
      ? '<p class="pilot-decision-reason-history-hint">Fr\u00fchere Gr\u00fcnde findest du unten in den Details.</p>'
      : "";

    if (current) {
      var topHeading = decisionReasonTopHeading(current.kind);
      var formattedSetAt = escapeHtml(formatTimestamp(current.setAt));
      var headingHtml =
        topHeading !== null
          ? "<h4>" + topHeading + "</h4><p class=\"pilot-decision-reason-timeline\">G\u00fcltig seit: " + formattedSetAt + "</p>"
          : "<h4>Entscheidung am " + formattedSetAt + "</h4>";
      return (
        '<div class="pilot-decision-reason-card">' +
        headingHtml +
        '<p class="pilot-decision-reason-text">' + escapeHtml(current.text) + "</p>" +
        historyHint +
        "</div>"
      );
    }

    if (isBlockedOrReturnedStatusForDecisionReason(overview.status)) {
      var statusHeading = decisionReasonHeadingForStatus(overview.status);
      return (
        '<div class="pilot-decision-reason-card">' +
        "<h4>" + statusHeading + "</h4>" +
        '<p class="pilot-decision-reason-text">F\u00fcr diesen Auftrag wurde kein konkreter Grund gespeichert.</p>' +
        '<p class="pilot-decision-reason-hint">Bei \u00e4lteren oder automatisch gestoppten Auftr\u00e4gen kann diese Angabe fehlen. Es wird bewusst nichts erg\u00e4nzt oder vermutet.</p>' +
        historyHint +
        "</div>"
      );
    }

    return "";
  }

  function isBlockedOrReturnedStatusForDecisionReason(status) {
    return status === "BLOCKED" || status === "RETURNED";
  }

  // Unterer Nachschaubereich, direkt vor renderAuditTrail(): frühere
  // Gründe gelten heute nicht mehr. Rendert nichts, wenn keine historischen
  // Einträge existieren (kein zusätzlicher aufklappbarer Bereich, kein
  // neuer Bedienzustand).
  function renderDecisionReasonHistory(overview) {
    var entries = deriveDecisionReasonHistoryEntries(overview);
    if (entries.length === 0) return "";
    var items = entries
      .map(function (entry) {
        var heading = decisionReasonHistoryEntryHeading(entry.kind, escapeHtml(formatTimestamp(entry.setAt)));
        return (
          "<li><strong>" + heading + "</strong>" +
          '<p class="pilot-decision-reason-text">' + escapeHtml(entry.text) + "</p>" +
          "</li>"
        );
      })
      .join("");
    return (
      '<div class="pilot-decision-reason-history">' +
      "<h4>Fr\u00fchere Gr\u00fcnde</h4>" +
      '<p class="pilot-decision-reason-history-intro">Diese Gr\u00fcnde geh\u00f6ren zu fr\u00fcheren Entscheidungen und gelten heute nicht mehr.</p>' +
      "<ol>" + items + "</ol>" +
      "</div>"
    );
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
      // V8.0.1 ("Manuelle Änderung im Entwurf bleibt nach render()
      // erhalten"): dasselbe Grundmuster wie CREATE_FORM_FIELD_IDS oben –
      // ein echter Browser ersetzt beim Setzen von innerHTML sämtliche
      // Kindknoten (die Entwurfsfelder würden sonst bei JEDEM render(),
      // z. B. durch das kontrollierte Status-Polling, auf ihren
      // Ausgangswert zurückfallen). Werte VOR dem Neuaufbau sichern und
      // danach zurückschreiben – ausschließlich relevant, wenn der Entwurf
      // gerade für den aktuell angezeigten Auftrag geöffnet ist.
      var handoffDraftOpenHere = state.overview && isHandoffDraftOpenForOrder(state.overview.order.id);
      var preservedHandoffDraftValues = handoffDraftOpenHere ? captureHandoffDraftFieldValues() : null;
      // Arbeitspaket Rückgabe Pilotauftrag: exakt dasselbe Grundmuster für
      // den eingegebenen Rückgabegrund – nach einem abgelehnten Absenden
      // (Servermeldung) oder einem fehlenden Grund darf der bereits
      // getippte Text niemals verloren gehen.
      var returnDraftOpenHere = state.overview && isReturnDraftOpenForOrder(state.overview.order.id);
      var preservedReturnDraftNote = returnDraftOpenHere ? captureReturnDraftNoteValue() : null;
      if (state.overviewLoading && !state.overview) {
        output.innerHTML = "<p>Lade Pilotauftrag\u2026</p>";
      } else if (state.overviewError && !state.overview) {
        output.innerHTML = "<p>" + escapeHtml(state.overviewError) + "</p>";
      } else if (state.overview) {
        var overview = state.overview;
        var html =
          renderHead(overview) +
          renderFacts(overview) +
          renderRisks(overview) +
          renderConflictBanner(state.conflict) +
          renderChainStatusCard(overview) +
          renderDecisionReasonCard(overview) +
          renderPrimaryAction(overview);
        if (state.actionError) {
          html += '<p class="pilot-work-order-action-error">' + escapeHtml(state.actionError) + "</p>";
        }
        html += renderDisclaimer(overview);
        output.innerHTML = html;
      } else {
        output.innerHTML = "<p>Kein Pilotauftrag ausgew\u00e4hlt.</p>";
      }
      if (handoffDraftOpenHere) {
        restoreHandoffDraftFieldValues(preservedHandoffDraftValues);
      }
      if (returnDraftOpenHere) {
        restoreReturnDraftNoteValue(preservedReturnDraftNote);
      }
    }

    var diagnostics = byId("pilot-work-order-diagnostics-output");
    if (diagnostics) {
      if (state.overview) {
        diagnostics.innerHTML =
          renderTeam(state.overview) +
          renderOrderDetails(state.overview) +
          renderAgentExecutionSection(state.overview) +
          renderAgentChainSection(state.overview) +
          renderHandoffs(state.overview) +
          renderDecisionReasonHistory(state.overview) +
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

  function getStatusPollingState() {
    return {
      orderId: state.statusPollingOrderId,
      active: Boolean(state.statusPollingOrderId) && (state.statusPollingInFlight || state.statusPollingTimerId !== null),
      timerScheduled: state.statusPollingTimerId !== null,
      inFlight: state.statusPollingInFlight,
      errorCount: state.statusPollingErrorCount,
      stoppedByErrors: state.statusPollingStoppedByErrors,
      stoppedBySafetyCap: state.statusPollingStoppedBySafetyCap,
      retryNoticeActive: state.statusPollingRetryNoticeActive,
      localStartBridgeActive: hasLocalStartBridgeForOrder(state.selectedPilotOrderId),
    };
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
        if (!state.createOpen) {
          resetDraftState();
        }
        render();
      } else if (action === "submit-create-order") {
        submitCreateOrder(gatherCreateFormInput());
      } else if (action === "build-work-draft") {
        // V8.0: ausschließlich lokal, deterministisch. Kein fetch, kein
        // POST, keine Kettenvorbereitung, keine Freigabe, kein Agentenlauf
        // (siehe buildWorkDraft oben).
        buildWorkDraft();
        render();
      } else if (action === "reload-after-conflict") {
        reloadSelectedOrder();
      } else if (action === "reload-chain-status") {
        state.statusPollingStoppedByErrors = false;
        state.statusPollingStoppedBySafetyCap = false;
        stopStatusPolling("manual-reload");
        reloadSelectedOrder().then(function () {
          syncStatusPollingFromOverview();
        });
      } else if (action === "approve-for-execution" || action === "approve-completion") {
        // V7.7.1: öffnet ausschließlich die lokale Bestätigungsfläche –
        // niemals ein direkter, unbestätigter Request (siehe
        // openJamalConfirmationDialog oben).
        openJamalConfirmationDialog(action);
      } else if (action === "jamal-confirmation-toggle-checkbox") {
        setJamalConfirmationChecked(target.checked);
      } else if (action === "jamal-confirmation-cancel") {
        cancelJamalConfirmation();
      } else if (action === "jamal-confirmation-confirm") {
        confirmJamalConfirmation();
      } else if (action === "start-agent-execution") {
        runOrderAction("start-agent-execution", { presetId: AGENT_EXECUTION_PRESET_ID });
      } else if (action === "request-codex-run-approval") {
        requestCodexApproval();
      } else if (action === "start-codex-agent-execution") {
        runCodexAgentExecution();
      } else if (action === "toggle-chain-selected-file") {
        toggleChainSelectedFile(target.getAttribute("data-file-path"), target.checked);
      } else if (action === "prepare-agent-chain") {
        prepareAgentChain();
      } else if (action === "request-chain-step-approval") {
        requestChainStepApproval(target.getAttribute("data-chain-id"), Number(target.getAttribute("data-chain-step")));
      } else if (action === "start-chain-step") {
        startChainStep(target.getAttribute("data-chain-id"), Number(target.getAttribute("data-chain-step")));
      } else if (action === "prepare-handoff-draft") {
        // V8.0.1: öffnet ausschließlich den lokalen Entwurf – kein Request
        // (siehe openHandoffDraft oben).
        openHandoffDraft();
      } else if (action === "cancel-handoff-draft") {
        cancelHandoffDraft();
      } else if (action === "submit-handoff-draft") {
        submitHandoffDraft();
      } else if (action === "open-return-draft") {
        // Arbeitspaket Rückgabe Pilotauftrag: öffnet ausschließlich die
        // lokale Rückgabefläche – kein Request (siehe openReturnDraft oben).
        openReturnDraft();
      } else if (action === "cancel-return-draft") {
        cancelReturnDraft();
      } else if (action === "submit-return-draft") {
        submitReturnDraft();
      } else if (isKnownPrimaryAction(action)) {
        runOrderAction(action, {});
      }
    });
  }

  var initPromise = null;

  function start() {
    bindActionHandlersOnce();
    bindPagehidePollingStopOnce();
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
      openJamalConfirmationDialog: openJamalConfirmationDialog,
      setJamalConfirmationChecked: setJamalConfirmationChecked,
      cancelJamalConfirmation: cancelJamalConfirmation,
      confirmJamalConfirmation: confirmJamalConfirmation,
      requestCodexApproval: requestCodexApproval,
      runCodexAgentExecution: runCodexAgentExecution,
      // V7.9.9: additiv exportiert, damit
      // pilot-agent-execution-chain-ui.test.js nachweisen kann, dass ein
      // Klick auf eine Datei ausschließlich den lokalen Auswahlzustand
      // ändert und keinen POST (Vorbereiten/Freigabe/Start) auslöst.
      toggleChainSelectedFile: toggleChainSelectedFile,
      prepareAgentChain: prepareAgentChain,
      requestChainStepApproval: requestChainStepApproval,
      startChainStep: startChainStep,
      stopStatusPolling: stopStatusPolling,
      getStatusPollingState: getStatusPollingState,
      setStatusTimeHooksForTests: setStatusTimeHooksForTests,
      deriveActiveRun: deriveActiveRun,
      resolveFailurePresentation: resolveFailurePresentation,
      // Teilpaket 2 ("Kettenstatus nach Ausführung zeitlich und fachlich wahr
      // darstellen"): additiv exportiert, damit
      // pilot-agent-execution-chain-ui.test.js die Zeit- und Zustandswahrheit
      // der Karte für jede Kombination aus Auftragsstatus und Kettenstand
      // direkt und ohne Umweg über eine erfundene Fixtur prüfen kann. Reine
      // Darstellungsfunktion: sie liest ausschließlich, sie schreibt nichts.
      renderChainStatusCard: renderChainStatusCard,
      render: render,
      escapeHtml: escapeHtml,
      CODEX_AGENT_EXECUTION_PRESET_ID: CODEX_AGENT_EXECUTION_PRESET_ID,
      // V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): additiv
      // exportiert, damit pilot-work-order-command-center-ui.test.js den
      // rein lokalen, deterministischen Vorschlagsweg direkt prüfen kann
      // (kein fetch, kein POST, siehe buildWorkDraft oben).
      buildWorkDraft: buildWorkDraft,
      DRAFT_SENTENCE_FIELD_ID: DRAFT_SENTENCE_FIELD_ID,
      CREATE_FORM_FIELD_IDS: CREATE_FORM_FIELD_IDS,
      // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
      // bedienbar machen"): additiv exportiert, damit
      // pilot-work-order-command-center-ui.test.js den neuen, bewusst
      // reibungsbehafteten Handoff-Entwurfsweg direkt prüfen kann (kein
      // fetch/POST beim Öffnen, genau ein POST beim Einreichen).
      openHandoffDraft: openHandoffDraft,
      cancelHandoffDraft: cancelHandoffDraft,
      submitHandoffDraft: submitHandoffDraft,
      hasPassedDocumentationHandoff: hasPassedDocumentationHandoff,
      HANDOFF_DRAFT_FIELD_TARGETS: HANDOFF_DRAFT_FIELD_TARGETS,
      // Arbeitspaket Rückgabe Pilotauftrag: additiv exportiert, damit
      // pilot-work-order-command-center-ui.test.js den Rückgabeweg direkt
      // prüfen kann (kein fetch/POST beim Öffnen und beim Abbrechen, genau
      // ein POST je bewusstem Absendevorgang).
      openReturnDraft: openReturnDraft,
      cancelReturnDraft: cancelReturnDraft,
      submitReturnDraft: submitReturnDraft,
      RETURN_DRAFT_NOTE_FIELD_ID: RETURN_DRAFT_NOTE_FIELD_ID,
      RETURN_DRAFT_STATUSES: RETURN_DRAFT_STATUSES,
    };
  }
})();
