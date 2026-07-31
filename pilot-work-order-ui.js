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
    state.chainStepApprovalTokens = {};
    state.chainActionError = null;
    state.chainSelectedFiles = null;
    // Ein Auftragswechsel verwirft eine ggf. offene Jamal-Bestätigungsfläche
    // ohne jeden API-Aufruf (kein Status ändert sich dadurch) – dieselbe
    // Grundregel wie für codexApprovalToken/chainStepApprovalTokens oben.
    state.jamalConfirmation = null;
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
        state.jamalConfirmation = null;
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
      render();
      return Promise.resolve();
    }
    var pilotOrderId = state.selectedPilotOrderId;
    state.chainActionInFlight = true;
    state.chainActionError = null;
    render();
    return postAction(pilotOrderId, "prepare-agent-chain", { selectedFiles: selection.selectedFiles }).then(function (response) {
      state.chainActionInFlight = false;
      if (state.selectedPilotOrderId !== pilotOrderId) return;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.chainActionError = null;
        return reloadSelectedOrder();
      }
      state.chainActionError = (response.data && response.data.message) || "Die Agentenkette konnte nicht vorbereitet werden.";
      render();
    });
  }

  function requestChainStepApproval(chainId, chainStep) {
    if (state.chainActionInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    var tokenKey = chainStepTokenKey(chainId, chainStep);
    state.chainActionInFlight = true;
    state.chainActionError = null;
    render();
    return postAction(pilotOrderId, "request-chain-step-approval", { chainId: chainId, chainStep: chainStep }).then(function (response) {
      state.chainActionInFlight = false;
      if (state.selectedPilotOrderId !== pilotOrderId) return;
      if (response.statusCode === 200 && response.data && response.data.ok && response.data.approvalToken) {
        state.chainStepApprovalTokens[tokenKey] = response.data.approvalToken;
        state.chainActionError = null;
        return reloadSelectedOrder();
      }
      delete state.chainStepApprovalTokens[tokenKey];
      state.chainActionError = (response.data && response.data.message) || "Die Freigabe für diesen Kettenschritt konnte nicht angefordert werden.";
      render();
    });
  }

  // Der Freigabe-Token ist per Definition genau einmal verwendbar (siehe
  // pilot-agent-execution-chain-service.js#consumeChainApprovalToken) –
  // nach JEDEM Startversuch (Erfolg oder Fehlschlag) wird er lokal
  // verworfen, niemals erneut angezeigt oder automatisch nachgefordert.
  function startChainStep(chainId, chainStep) {
    var tokenKey = chainStepTokenKey(chainId, chainStep);
    var tokenUsed = state.chainStepApprovalTokens[tokenKey];
    if (!tokenUsed || state.chainActionInFlight || !state.selectedPilotOrderId) return Promise.resolve();
    var pilotOrderId = state.selectedPilotOrderId;
    delete state.chainStepApprovalTokens[tokenKey];
    state.chainActionInFlight = true;
    state.chainActionError = null;
    render();
    return postAction(pilotOrderId, "start-chain-step", { chainId: chainId, chainStep: chainStep, approvalToken: tokenUsed }).then(function (response) {
      state.chainActionInFlight = false;
      if (state.selectedPilotOrderId !== pilotOrderId) return;
      if (response.statusCode === 200 && response.data && response.data.ok) {
        state.chainActionError = null;
        return reloadSelectedOrder();
      }
      state.chainActionError = (response.data && response.data.message) || "Der Kettenschritt konnte nicht gestartet werden.";
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
        "Ketten-Rollenbuchung",
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

  function chainStatusLabel(status) {
    return CHAIN_STATUS_LABELS[status] || escapeHtml(String(status || ""));
  }

  function chainBlockReasonText(reasonCode) {
    var normalized = isNonEmptyString(reasonCode) ? reasonCode.trim() : "";
    if (!normalized) return "";
    return CHAIN_BLOCK_REASON_TEXT[normalized] || normalized;
  }

  // V7.8.1 ("Ergebnisbudget von Kettenschritt 2 technisch erzwungen"):
  // fester, ausschließlich informativer Hinweistext. Er wird genau dann
  // angezeigt, wenn die deterministische Budgetdurchsetzung des
  // Dokumentationsschritts tatsächlich etwas weggelassen hat (siehe
  // pilot-agent-documentation-result.js). Eine Reduktion darf niemals
  // unbemerkt bleiben. Enthält ausschließlich Zählwerte, niemals Fachinhalt.
  function documentationCompactionNoticeText(normalization) {
    var droppedItems = typeof normalization.droppedItemCount === "number" ? normalization.droppedItemCount : 0;
    var droppedSentences = typeof normalization.droppedSentenceCount === "number" ? normalization.droppedSentenceCount : 0;
    var rawChars = typeof normalization.rawCharCount === "number" ? normalization.rawCharCount : 0;
    var storedChars = typeof normalization.normalizedCharCount === "number" ? normalization.normalizedCharCount : 0;
    return (
      "Das Dokumentationsergebnis wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert (" +
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
    var normalization = summary && summary.documentationNormalization;
    if (!normalization || normalization.compactionApplied !== true) return "";
    return '<br><span class="pilot-work-order-action-error">' + escapeHtml(documentationCompactionNoticeText(normalization)) + "</span>";
  }

  function chainSelectableFilesFromOverview(overview) {
    var entries = overview && Array.isArray(overview.chainSelectableFiles) ? overview.chainSelectableFiles : [];
    var result = [];
    var seen = {};
    entries.forEach(function (entry) {
      if (!isNonEmptyString(entry)) return;
      var value = entry.trim();
      if (!value || seen[value]) return;
      seen[value] = true;
      result.push(value);
    });
    return result;
  }

  function getChainFileSelectionForOverview(overview) {
    var selectableFiles = chainSelectableFilesFromOverview(overview);
    if (!Array.isArray(state.chainSelectedFiles)) {
      state.chainSelectedFiles = selectableFiles.slice();
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
    return { selectableFiles: selectableFiles, selectedFiles: state.chainSelectedFiles.slice() };
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

  // Eine Schaltfläche für genau eine Stufe. `kind` ist "approve" oder
  // "start". Deaktiviert, sobald: falscher Kettenstatus, Vorgänger fehlt,
  // Freigabe fehlt, Codex nicht verfügbar/authentifiziert, eine andere
  // Stufe läuft, oder eine Aktion bereits läuft (siehe Auftrag Abschnitt
  // "Cockpit"/"Buttons müssen deaktiviert sein").
  function renderChainStepCard(overview, chain, step) {
    var availability = overview.codexAvailability || { available: false, authenticated: false };
    var isCurrentStep = chain.currentStep === step.stepNumber;
    var chainIsOpen = ["PREPARED", "WAITING_FOR_RESEARCH_APPROVAL", "WAITING_FOR_DOCUMENTATION_APPROVAL", "WAITING_FOR_PM_APPROVAL"].indexOf(chain.chainStatus) !== -1;
    var anyStepRunning = chain.steps.some(function (entry) {
      return entry.stepStatus === "RUNNING";
    });
    var tokenKey = chainStepTokenKey(chain.id, step.stepNumber);
    var hasToken = Boolean(state.chainStepApprovalTokens[tokenKey]);
    var pendingPredecessorTooLarge = step.pendingPredecessorTooLarge === true;

    var canRequestApproval =
      isCurrentStep &&
      chainIsOpen &&
      !anyStepRunning &&
      !pendingPredecessorTooLarge &&
      step.stepStatus === "PENDING" &&
      step.approvalStatus === "NOT_REQUESTED" &&
      availability.available &&
      availability.authenticated &&
      !state.chainActionInFlight;
    var canStart =
      isCurrentStep &&
      chainIsOpen &&
      !anyStepRunning &&
      !pendingPredecessorTooLarge &&
      step.stepStatus === "PENDING" &&
      step.approvalStatus === "REQUESTED" &&
      hasToken &&
      availability.available &&
      availability.authenticated &&
      !state.chainActionInFlight;
    var run = findAgentExecutionRunById(overview, step.executionRunId);
    var chainMandate = chain.coreMandate || null;
    var qualityCriteria = chainMandate && Array.isArray(chainMandate.qualityCriteria) ? chainMandate.qualityCriteria.filter(Boolean) : [];
    var qualityPreview = qualityCriteria.length > 0 ? qualityCriteria.join(" | ") : "nicht angegeben";
    var stageTaskLabel = run && run.taskTitle ? run.taskTitle : CHAIN_STEP_TITLES[step.stepNumber] || "Schritt " + step.stepNumber;

    var html = '<li class="pilot-agent-chain-step">';
    html += "<strong>" + escapeHtml(CHAIN_STEP_TITLES[step.stepNumber] || "Schritt " + step.stepNumber) + "</strong>";
    html += "<br>Agent: " + escapeHtml(CHAIN_AGENT_LABELS[step.agentKey] || step.agentKey) + " (" + escapeHtml(step.agentKey) + ")";
    html += "<br>Status: " + (CHAIN_STEP_STATUS_LABELS[step.stepStatus] || escapeHtml(step.stepStatus)) + " \u00b7 Freigabe: " + (CHAIN_APPROVAL_STATUS_LABELS[step.approvalStatus] || escapeHtml(step.approvalStatus));
    if (chainMandate) {
      html += "<br>Kernauftrag: " + escapeHtml(chainMandate.title || "nicht angegeben");
      html += "<br>Ergebniswunsch: " + escapeHtml(chainMandate.desiredOutcome || "nicht angegeben");
      html += "<br>Qualitätskriterien (Kernauftrag): " + escapeHtml(qualityPreview);
    } else {
      html += "<br>Kernauftrag f\u00fcr diese Altkette nicht mitgef\u00fchrt";
    }
    html += "<br>Stufenauftrag: " + escapeHtml(stageTaskLabel);
    if (step.executionRunId) {
      html += "<br>executionRunId: " + escapeHtml(step.executionRunId);
    }
    if (step.chainedFromExecutionRunId) {
      html += "<br>Vorg\u00e4nger-executionRunId: " + escapeHtml(step.chainedFromExecutionRunId);
    }
    if (step.stepNumber === 1) {
      html += "<br>Vorgänger vollständig übernommen: nicht erforderlich (Schritt 1).";
    } else if (step.predecessorFullyIncluded === true) {
      html +=
        "<br>Vorgänger vollständig übernommen: ja" +
        (step.predecessorIncludedCharCount !== null && step.predecessorIncludedCharCount !== undefined
          ? " (" + escapeHtml(String(step.predecessorIncludedCharCount)) + " Zeichen)."
          : ".");
    } else if (step.predecessorFullyIncluded === false) {
      html +=
        '<br><span class="pilot-work-order-action-error">Vorgänger vollständig übernommen: nein' +
        (step.predecessorCharCount !== null && step.predecessorCharCount !== undefined
          ? " (" + escapeHtml(String(step.predecessorCharCount)) + " Zeichen vorhanden)."
          : ".") +
        "</span>";
    }
    if (step.roleHandoffBooked) {
      html += "<br>Rollenverbuchung: erfolgt" + (step.roleHandoffBookedAt ? " (" + escapeHtml(formatTimestamp(step.roleHandoffBookedAt)) + ")" : "");
    }
    if (pendingPredecessorTooLarge) {
      var pendingCharCountText =
        step.pendingPredecessorCharCount !== null && step.pendingPredecessorCharCount !== undefined
          ? String(step.pendingPredecessorCharCount)
          : "unbekannt";
      html +=
        '<br><span class="pilot-work-order-action-error">Vorg\u00e4nger\u00fcbergabe zu lang (' +
        escapeHtml(pendingCharCountText) +
        " von maximal " +
        escapeHtml(String(CHAIN_PREDECESSOR_MAX_CHARS)) +
        " Zeichen). Dieser Schritt kann so nicht gestartet werden.</span>";
    }
    html +=
      ' <button type="button" data-action="request-chain-step-approval" data-chain-id="' +
      escapeHtml(chain.id) +
      '" data-chain-step="' +
      step.stepNumber +
      '"' +
      (canRequestApproval ? "" : " disabled") +
      ">Freigabe f\u00fcr diese Stufe anfordern</button>";
    html +=
      ' <button type="button" data-action="start-chain-step" data-chain-id="' +
      escapeHtml(chain.id) +
      '" data-chain-step="' +
      step.stepNumber +
      '"' +
      (canStart ? "" : " disabled") +
      ">Genau diese Stufe starten</button>";
    if (hasToken) {
      html += "<p>Freigabe liegt vor \u2013 gilt ausschlie\u00dflich f\u00fcr genau diese eine Stufe.</p>";
    }
    if (step.stepStatus === "SUCCEEDED" && run) {
      html +=
        "<br>Tats\u00e4chlicher Runner: " +
        escapeHtml(run.actualRunnerKind || "") +
        " \u00b7 KI ausgef\u00fchrt: " +
        (run.aiExecuted ? "ja" : "nein");
      if (run.promptDigest) {
        html += "<br>Prompt-Digest: " + escapeHtml(run.promptDigest);
      }
      if (run.mandateDigest) {
        html += "<br>Kernauftrag-Digest: " + escapeHtml(run.mandateDigest);
      }
      if (run.resultTruncated) {
        html += '<br><span class="pilot-work-order-action-error">Hinweis: Das persistierte Ergebnis wurde beim Speichern gekürzt.</span>';
      }
      html += documentationCompactionNoticeHtml(run);
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
      if (analyzedFiles.length > 0) {
        html += "<br>Tats\u00e4chlich verwendete Dateien: " + escapeHtml(analyzedFiles.join(", "));
      }
      if (run.resultRawText) {
        html += "<br>Ergebnis:<br><pre class=\"pilot-agent-execution-result\">" + escapeHtml(run.resultRawText) + "</pre>";
      }
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
        html += "<h5>PM-Gesamturteil</h5><pre class=\"pilot-agent-execution-result\">" + escapeHtml(pmRun.resultRawText) + "</pre>";
      }
    }
    html += "</div>";
    return html;
  }

  function renderAgentChainSection(overview) {
    var chains = overview.agentChains || [];
    var selection = getChainFileSelectionForOverview(overview);
    var html = "<h4>Drei-Agenten-Kette (Recherche \u2192 Dokumentation \u2192 PM-Bewertung)</h4>";
    html +=
      "<p>Jede Stufe verwendet einen echten, isolierten Codex-Agentenlauf mit eigener executionRunId und ben\u00f6tigt eine eigene, " +
      "kurzlebige Einzelfreigabe. Ein erfolgreicher Schritt startet den n\u00e4chsten niemals automatisch.</p>";
    html += "<p>Der Kernauftrag bleibt f\u00fcr alle drei Stufen unver\u00e4ndert. Jamal legt die Dateiauswahl hier einmal f\u00fcr alle drei Stufen fest.</p>";
    if (overview.status !== "IN_EXECUTION") {
      html += "<p>Eine Agentenkette kann nur w\u00e4hrend \u201eIn Ausf\u00fchrung\u201c vorbereitet werden.</p>";
      return html;
    }
    if (selection.selectableFiles.length > 0) {
      html += '<div class="pilot-chain-file-selection"><p><strong>Dateiauswahl f\u00fcr alle drei Stufen:</strong></p><ul>';
      selection.selectableFiles.forEach(function (filePath) {
        var checked = selection.selectedFiles.indexOf(filePath) !== -1;
        html +=
          "<li><label>" +
          '<input type="checkbox" data-action="toggle-chain-selected-file" data-file-path="' +
          escapeHtml(filePath) +
          '"' +
          (checked ? " checked" : "") +
          (state.chainActionInFlight ? " disabled" : "") +
          " /> " +
          escapeHtml(filePath) +
          "</label></li>";
      });
      html += "</ul></div>";
    }
    var canPrepare = !state.chainActionInFlight && selection.selectedFiles.length > 0;
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
          renderAgentChainSection(state.overview) +
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
      openJamalConfirmationDialog: openJamalConfirmationDialog,
      setJamalConfirmationChecked: setJamalConfirmationChecked,
      cancelJamalConfirmation: cancelJamalConfirmation,
      confirmJamalConfirmation: confirmJamalConfirmation,
      requestCodexApproval: requestCodexApproval,
      runCodexAgentExecution: runCodexAgentExecution,
      prepareAgentChain: prepareAgentChain,
      requestChainStepApproval: requestChainStepApproval,
      startChainStep: startChainStep,
      render: render,
      escapeHtml: escapeHtml,
      CODEX_AGENT_EXECUTION_PRESET_ID: CODEX_AGENT_EXECUTION_PRESET_ID,
    };
  }
})();
