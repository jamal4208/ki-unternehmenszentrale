"use strict";
/*
 * Chefmodus P1 – Startseite "Heute" (#chef-today-card, STATIC_OWNER_ONLY).
 *
 * Zweck: Der Chef sieht morgens zuerst "Was ist heute wichtig?" – nicht
 * Projekte, Agenten, Technik, Audit, Aufträge oder Ketten. Die Karte steht
 * deshalb als erster Bereich im Cockpit. Sie ersetzt keine bestehende
 * Funktionalität, sie ordnet sie neu: jede Hauptaktion führt in die
 * bestehende Pilotauftrags-Karte (#pilot-work-order-card).
 *
 * Grenzen dieses Skripts (bewusst eng):
 * - ausschließlich lesend: nur GET auf bereits vorhandene Routen
 *   (/api/pilot-work-order/orders und /api/pilot-work-order/orders/:id).
 *   Kein POST, kein CSRF-Token, keine Statusänderung, keine neue Route.
 * - keine eigene Geschäftslogik: Titel, Status, Statustext und Fortschritt
 *   kommen unverändert vom Server (pilot-work-order-service.js).
 * - keine zweite Priorisierung: Bereich A, Bereich C und die empfohlene
 *   nächste Arbeit lesen alle aus derselben Tagesordnung (siehe
 *   buildAgenda unten).
 * - keine zweite Auftragserfassung: "Neuer Auftrag" bedient die bestehende
 *   Anlage in der Pilotauftrags-Karte.
 *
 * P1.1 ("Zielgenaue Navigation", additiv zu P1): die beiden Hauptaktionen
 * sprangen bisher immer nur an den Anfang von #pilot-work-order-card. Bei
 * einer langen Auftragsliste lag das eigentliche Ziel (Anlageformular bzw.
 * Auftragszeile/Detailbereich) danach unterhalb des sichtbaren Bereichs.
 * openOrder()/openNewOrder() scrollen jetzt zum tatsächlichen Zielelement
 * (kein fester Pixelwert) und openNewOrder() fokussiert zusätzlich das
 * bestehende Titelfeld. Es entsteht dabei kein zweites Formular, keine neue
 * Anlage- oder Statuslogik und kein neuer Schreibpfad – siehe openOrder()
 * und openNewOrder() unten.
 */

(function () {
  // Die einzige Ordnung dieser Startseite. Die Reihenfolge entspricht der
  // Aufmerksamkeitsstufe aus dem Chefmodus-Auftrag (Entscheidung notwendig →
  // Ergebnis wartet auf Prüfung → Auftrag blockiert → Freigabe erforderlich).
  // Innerhalb einer Stufe bleibt die Reihenfolge des Servers unverändert
  // erhalten – hier wird bewusst nicht nachsortiert.
  var TODAY_STATUS_ORDER = ["RETURNED", "READY_FOR_REVIEW", "BLOCKED", "READY_FOR_JAMAL_APPROVAL"];

  // Warum ein Vorgang heute Aufmerksamkeit braucht – in Chefsprache, ohne
  // technischen Zustand.
  var TODAY_REASON_BY_STATUS = {
    RETURNED: "Entscheidung notwendig",
    READY_FOR_REVIEW: "Ergebnis wartet auf Pr\u00fcfung",
    BLOCKED: "Auftrag blockiert",
    READY_FOR_JAMAL_APPROVAL: "Freigabe erforderlich",
  };

  var RUNNING_STATUS = "IN_EXECUTION";
  var DONE_STATUS = "COMPLETED";
  var RUNNING_LIMIT = 5;

  var state = {
    orders: [],
    // Fortschritt je laufendem Vorgang, unverändert aus overview.progress.
    progressByOrderId: {},
    loading: true,
    error: null,
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  // Bewusst ohne Methoden-, Body- und CSRF-Parameter: diese Karte liest nur.
  function fetchJson(url) {
    return fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
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

  // -----------------------------------------------------------------------
  // Auswahl der Bereiche. Alle vier Funktionen lesen dieselbe Auftragsliste
  // und schließen sich gegenseitig aus (ein Vorgang erscheint höchstens in
  // einem Bereich).
  // -----------------------------------------------------------------------

  function selectToday(orders) {
    var result = [];
    TODAY_STATUS_ORDER.forEach(function (status) {
      (orders || []).forEach(function (order) {
        if (order && order.status === status) result.push(order);
      });
    });
    return result;
  }

  function selectDone(orders) {
    return (orders || []).filter(function (order) {
      return order && order.status === DONE_STATUS;
    });
  }

  function selectRunning(orders) {
    return (orders || [])
      .filter(function (order) {
        return order && order.status === RUNNING_STATUS;
      })
      .slice(0, RUNNING_LIMIT);
  }

  // Die Tagesordnung ist die einzige Priorisierung dieser Seite: zuerst das,
  // was heute Aufmerksamkeit braucht, danach das, was bereits läuft. Bereich
  // A und Bereich C sind genau die beiden Teile dieser Liste, die Empfehlung
  // ist genau ihr erster Eintrag.
  function buildAgenda(orders) {
    return selectToday(orders).concat(selectRunning(orders));
  }

  function selectRecommendedNextWork(orders) {
    var agenda = buildAgenda(orders);
    return agenda.length > 0 ? agenda[0] : null;
  }

  function reasonFor(order) {
    return (order && TODAY_REASON_BY_STATUS[order.status]) || "";
  }

  function progressTextFor(order) {
    var progress = order ? state.progressByOrderId[order.id] : null;
    if (!progress) return "Fortschritt wird geladen\u2026";
    return progress.rolesPassed + " von " + progress.rolesTotal + " Rollen abgeschlossen";
  }

  // -----------------------------------------------------------------------
  // Laden. Ein GET für die Liste, danach höchstens fünf GET für den
  // Fortschritt der laufenden Vorgänge – beides bestehende Leserouten.
  // -----------------------------------------------------------------------

  function loadRunningProgress() {
    var running = selectRunning(state.orders);
    return Promise.all(
      running.map(function (order) {
        return fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(order.id)).then(function (response) {
          var overview = response.statusCode === 200 && response.data && response.data.ok ? response.data.overview : null;
          if (overview && overview.progress) {
            state.progressByOrderId[order.id] = {
              rolesPassed: overview.progress.rolesPassed,
              rolesTotal: overview.progress.rolesTotal,
            };
          }
        });
      }),
    );
  }

  function load() {
    state.loading = true;
    render();
    return fetchJson("/api/pilot-work-order/orders")
      .then(function (response) {
        if (response.statusCode === 200 && response.data && response.data.ok) {
          state.orders = Array.isArray(response.data.orders) ? response.data.orders : [];
          state.error = null;
        } else {
          state.error = "Der Tagesstand konnte nicht geladen werden.";
        }
        return loadRunningProgress();
      })
      .catch(function () {
        state.error = "Der Tagesstand konnte nicht geladen werden.";
      })
      .then(function () {
        state.loading = false;
        render();
      });
  }

  // -----------------------------------------------------------------------
  // Darstellung. Ruhig, wenig Text, große Überschriften, höchstens eine
  // Hauptaktion je Bereich. Eine Zeile ist selbst die Aktion – sie öffnet den
  // Vorgang in der bestehenden Pilotauftrags-Karte.
  // -----------------------------------------------------------------------

  function renderSection(key, heading, bodyHtml) {
    return (
      '<section class="chef-today-section" data-chef-today-section="' +
      key +
      '"><h3>' +
      escapeHtml(heading) +
      "</h3>" +
      bodyHtml +
      "</section>"
    );
  }

  function renderEmpty(text) {
    return '<p class="chef-today-empty">' + escapeHtml(text) + "</p>";
  }

  function renderRow(order, secondaryText) {
    return (
      '<button type="button" class="chef-today-row" data-chef-today-action="open-order" data-order-id="' +
      escapeHtml(order.id) +
      '"><span class="chef-today-row-title">' +
      escapeHtml(order.title) +
      '</span><span class="chef-today-row-meta">' +
      escapeHtml(secondaryText) +
      "</span></button>"
    );
  }

  function renderTodaySection(orders) {
    var items = selectToday(orders);
    if (items.length === 0) {
      return renderSection("today", "Heute wichtig", renderEmpty("Heute wartet nichts auf deine Entscheidung."));
    }
    return renderSection(
      "today",
      "Heute wichtig",
      '<div class="chef-today-list">' +
        items
          .map(function (order) {
            return renderRow(order, reasonFor(order));
          })
          .join("") +
        "</div>",
    );
  }

  function renderDoneSection(orders) {
    var items = selectDone(orders);
    if (items.length === 0) {
      return renderSection("done", "Fertig", renderEmpty("Noch nichts abgeschlossen."));
    }
    return renderSection(
      "done",
      "Fertig",
      '<div class="chef-today-list">' +
        items
          .map(function (order) {
            return renderRow(order, order.statusLabel);
          })
          .join("") +
        "</div>",
    );
  }

  function renderRunningSection(orders) {
    var items = selectRunning(orders);
    if (items.length === 0) {
      return renderSection("running", "L\u00e4uft", renderEmpty("Gerade l\u00e4uft keine Arbeit."));
    }
    return renderSection(
      "running",
      "L\u00e4uft",
      '<div class="chef-today-list">' +
        items
          .map(function (order) {
            return renderRow(order, progressTextFor(order));
          })
          .join("") +
        "</div>",
    );
  }

  function renderRecommendationSection(orders) {
    var recommended = selectRecommendedNextWork(orders);
    if (!recommended) {
      return renderSection(
        "recommendation",
        "Empfohlene n\u00e4chste Arbeit",
        renderEmpty("Es gibt heute keine Arbeit, die auf dich wartet."),
      );
    }
    var reason = reasonFor(recommended) || progressTextFor(recommended);
    return renderSection(
      "recommendation",
      "Empfohlene n\u00e4chste Arbeit",
      '<p class="chef-today-recommendation-title">' +
        escapeHtml(recommended.title) +
        '</p><p class="chef-today-recommendation-reason">' +
        escapeHtml(reason) +
        '</p><button type="button" class="primary-button" data-chef-today-action="open-recommended">Diese Arbeit \u00f6ffnen</button>',
    );
  }

  // Bereich E verweist ausdrücklich auf die bestehende Auftragserstellung.
  // Diese Karte enthält deshalb kein einziges Eingabefeld.
  function renderNewOrderSection() {
    return renderSection(
      "new-order",
      "Neuer Auftrag",
      '<p class="chef-today-empty">Ein neuer Auftrag entsteht weiterhin im Pilotauftrag.</p>' +
        '<button type="button" class="primary-button" data-chef-today-action="open-new-order">Neuen Auftrag anlegen</button>',
    );
  }

  function render() {
    var output = typeof document !== "undefined" ? document.getElementById("chef-today-output") : null;
    if (!output) return;
    if (state.loading && state.orders.length === 0) {
      output.innerHTML = "<p>Lade deinen Tag\u2026</p>";
      return;
    }
    if (state.error && state.orders.length === 0) {
      output.innerHTML = "<p>" + escapeHtml(state.error) + "</p>";
      return;
    }
    var orders = state.orders;
    output.innerHTML =
      renderTodaySection(orders) +
      renderDoneSection(orders) +
      renderRunningSection(orders) +
      renderRecommendationSection(orders) +
      renderNewOrderSection();
  }

  // -----------------------------------------------------------------------
  // Hauptaktionen. Sie ändern nichts, sie führen nur in den bestehenden
  // Bereich: die Pilotauftrags-Karte bleibt die einzige Stelle, an der ein
  // Auftrag ausgewählt, angelegt oder bewegt wird.
  // -----------------------------------------------------------------------

  function pilotCard() {
    return typeof document !== "undefined" ? document.getElementById("pilot-work-order-card") : null;
  }

  // P1.1 ("Zielgenaue Navigation"): scrollt zu einem beliebigen, tatsächlich
  // im DOM vorhandenen Zielelement – nie zu einem festen Pixelwert. Vorher
  // wurde hier immer die ganze Pilotauftrags-Karte angesprungen; das ließ
  // das eigentliche Ziel (Anlageformular bzw. Auftragszeile/Detailbereich)
  // bei langen Auftragslisten außerhalb des sichtbaren Bereichs. Fehlt das
  // Zielelement, passiert schlicht nichts – kein Fehler.
  function scrollToElement(element) {
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function focusElement(element) {
    if (element && typeof element.focus === "function") {
      element.focus();
    }
  }

  // Bewusst über die vorhandene Auswahlzeile der Pilotauftrags-Karte statt
  // über einen eigenen Aufruf: der Zustand bleibt vollständig dort.
  function findPilotControl(card, action, orderId) {
    if (!card || typeof card.querySelectorAll !== "function") return null;
    var candidates = card.querySelectorAll('[data-action="' + action + '"]');
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (orderId == null) return candidate;
      if (candidate.getAttribute && candidate.getAttribute("data-order-id") === orderId) return candidate;
    }
    return null;
  }

  // P1.1: der bestehende, auftragsbezogene Detail-/Arbeitsbereich der
  // Pilotauftrags-Karte (schon vor P1.1 vorhanden, siehe
  // pilot-work-order-ui.js#renderSelectedOrderOutput). Er ist statisch im
  // Markup vorhanden und wird von der bestehenden Karte selbst befüllt –
  // hier wird nichts erzeugt, nur als Sprungziel wiederverwendet.
  function orderDetailArea() {
    return typeof document !== "undefined" ? document.getElementById("pilot-work-order-output") : null;
  }

  // Klick auf einen Vorgang: die bestehende Karte markiert die Zeile
  // synchron (siehe pilot-work-order-ui.js#selectOrder, ruft render() vor
  // der Rückgabe auf) – danach kann sofort gescrollt werden, ohne auf einen
  // weiteren Rendering-Schritt zu warten. Bevorzugtes Ziel ist der
  // Detailbereich; existiert er nicht, die markierte Zeile; existiert auch
  // die nicht, die Karte selbst – niemals ein Fehler.
  function openOrder(orderId) {
    var card = pilotCard();
    if (!card) return false;
    var row = findPilotControl(card, "select-order", orderId);
    if (row && typeof row.click === "function") row.click();
    scrollToElement(orderDetailArea() || row || card);
    return Boolean(row);
  }

  function openRecommendedWork() {
    var recommended = selectRecommendedNextWork(state.orders);
    if (!recommended) return false;
    return openOrder(recommended.id);
  }

  // Dasselbe bestehende Feld, das schon vorher erkannt hat, ob das
  // Anlageformular offen ist (kein neues Feld, keine neue ID) – jetzt auch
  // als Scroll- und Fokusziel wiederverwendet.
  function createFormTitleField() {
    return typeof document !== "undefined" ? document.getElementById("pilot-order-create-title") : null;
  }

  function openNewOrder() {
    var card = pilotCard();
    if (!card) return false;
    // Ist das bestehende Anlageformular bereits offen, würde ein Klick auf den
    // Umschalter es wieder schließen – dann genügt der Sprung dorthin.
    var titleField = createFormTitleField();
    var alreadyOpen = Boolean(titleField);
    var toggle = alreadyOpen ? null : findPilotControl(card, "toggle-create-form", null);
    if (toggle && typeof toggle.click === "function") toggle.click();
    // Der Umschalter rendert synchron (siehe
    // pilot-work-order-ui.js#bindActionHandlersOnce, Fall
    // "toggle-create-form"): direkt nach toggle.click() steht das Feld schon
    // im DOM, ein weiterer Rendering-Schritt ist nicht nötig. War das
    // Formular schon vorher offen, gilt schlicht das vorher gefundene Feld.
    var target = titleField || createFormTitleField();
    scrollToElement(target || card);
    focusElement(target);
    return true;
  }

  var handlersBound = false;

  function bindActionHandlersOnce() {
    if (handlersBound) return;
    var card = typeof document !== "undefined" ? document.getElementById("chef-today-card") : null;
    if (!card || typeof card.addEventListener !== "function") return;
    handlersBound = true;
    card.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("[data-chef-today-action]") : null;
      if (!target) return;
      var action = target.getAttribute("data-chef-today-action");
      if (action === "open-order") {
        openOrder(target.getAttribute("data-order-id"));
      } else if (action === "open-recommended") {
        openRecommendedWork();
      } else if (action === "open-new-order") {
        openNewOrder();
      }
    });
  }

  var initPromise = null;

  function start() {
    bindActionHandlersOnce();
    initPromise = load();
    return initPromise;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }

  // Für chef-today-ui.test.js (echte Zustandswechsel gegen ein Fake-Backend,
  // ohne Browser). Rein additiv: ändert nichts am Browser-Verhalten oben.
  if (typeof module === "object" && module.exports) {
    module.exports = {
      TODAY_STATUS_ORDER: TODAY_STATUS_ORDER,
      TODAY_REASON_BY_STATUS: TODAY_REASON_BY_STATUS,
      RUNNING_STATUS: RUNNING_STATUS,
      DONE_STATUS: DONE_STATUS,
      RUNNING_LIMIT: RUNNING_LIMIT,
      getState: function () {
        return state;
      },
      getInitPromise: function () {
        return initPromise;
      },
      start: start,
      load: load,
      render: render,
      selectToday: selectToday,
      selectDone: selectDone,
      selectRunning: selectRunning,
      buildAgenda: buildAgenda,
      selectRecommendedNextWork: selectRecommendedNextWork,
      openOrder: openOrder,
      openRecommendedWork: openRecommendedWork,
      openNewOrder: openNewOrder,
    };
  }
})();
