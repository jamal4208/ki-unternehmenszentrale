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
 *
 * V8.4 ("Chefmodus 'Heute wichtig'", additiv zu P1/P1.1): Bereich A zeigte
 * bisher nur Titel und einen kurzen Kategorie-Klartext (z. B. "Auftrag
 * blockiert"). Jamal fehlte dabei, WARUM sein Eingreifen nötig ist, SEIT
 * WANN der Vorgang wartet, und dass er über "Öffnen" in die bestehende
 * Pilotauftrags-Karte gelangt. V8.4 lädt dafür je entscheidungsrelevantem
 * Auftrag (höchstens fünf, technische Obergrenze, siehe
 * TODAY_OVERVIEW_FETCH_LIMIT) zusätzlich das bereits bestehende
 * Einzel-Overview nach (dieselbe Route, die loadRunningProgress() für
 * laufende Vorgänge schon seit P1 nutzt) und liest daraus ausschließlich
 * das bereits vorhandene Feld `openDecision` – niemals eine neue
 * Statusmaschine, niemals eine neue Priorisierung. Ohne `openDecision`
 * (kein Overview geladen, oder Feld leer) gilt ein statusspezifischer,
 * fest hinterlegter Fallback-Satz (CHEF_TODAY_WHY_FALLBACK_BY_STATUS). Die
 * Wartedauer (Heute/Gestern/Seit X Tagen) kommt ausschließlich aus dem
 * bereits vorhandenen Feld `order.updatedAt` der ohnehin geladenen Liste –
 * dafür ist kein zusätzlicher Abruf nötig, deshalb bleibt sie für JEDEN
 * entscheidungsrelevanten Auftrag sichtbar, auch jenseits der
 * Detailabruf-Grenze. Ein fehlgeschlagener Einzelabruf wird defensiv
 * abgefangen (siehe loadTodayOverviews()) und fällt auf den Fallback-Satz
 * zurück – er macht die Startkarte nicht unbrauchbar. Öffnen bleibt
 * ausschließlich openOrder(); es entsteht kein neuer Navigationspfad und
 * keine Entscheidung wird direkt aus der Startkarte ausgeführt.
 *
 * Bekannte, bewusst nicht in V8.4 behobene Lücke: der Freitext aus
 * blockOrder(reason) und returnOrder(note) wird von der bestehenden
 * Serviceschicht heute nicht dauerhaft gespeichert (kein Feld in
 * buildOverview()) – deshalb kann V8.4 diesen konkreten Grund nicht
 * anzeigen und verwendet stattdessen den statusspezifischen Fallback-Satz.
 * Diese Lücke ist Gegenstand eines künftigen, eigenen Arbeitspakets (siehe
 * CURRENT_STATUS.md).
 *
 * V8.4-Korrekturlauf ("Chefsprache in den sichtbaren Warum-Sätzen"): die
 * isolierte Browserabnahme wies nach, dass zwei reale `openDecision`-Texte
 * aus buildOverview() (READY_FOR_REVIEW, READY_FOR_JAMAL_APPROVAL) einen
 * technischen Statuscode in Klammern enthalten (" (COMPLETED)" bzw.
 * " (APPROVED_FOR_EXECUTION)") – auf der ersten Chefmodus-Ebene unerwünscht.
 * Die bisherigen Tests nutzten dafür ausschließlich frei erfundene
 * Fake-Backend-Texte ohne diese Zusätze und erkannten den Befund deshalb
 * nicht. Die Korrektur bleibt ausschließlich Darstellungslogik: whyTextFor()
 * bereinigt das unverändert gelesene `openDecision` jetzt zusätzlich über
 * sanitizeChefDecisionText() (siehe dort), bevor es sichtbar gerendert wird.
 * `pilot-work-order-service.js`, `buildOverview()` und das Feld
 * `openDecision` selbst bleiben unangetastet – die technische Detailansicht
 * zeigt weiterhin den unveränderten Originaltext.
 *
 * V8.5 ("Entscheidungen im Chefmodus besser vorbereiten", additiv zu V8.4):
 * jede Zeile in "Heute wichtig" macht jetzt zusätzlich sichtbar, WAS zu
 * entscheiden ist (bereits vorhandener whyTextFor()-Text, jetzt mit
 * sichtbarem Label "Zu entscheiden"), OB eine belastbare Empfehlung bzw.
 * ein belastbarer Risiko-/Grenzhinweis vorliegt (recommendationTextFor()/
 * riskTextFor(), beide reine, ausschließlich lesende Funktionen), und WELCHE
 * tatsächliche Primäraktion in der bestehenden Pilotauftrags-Karte dafür
 * vorgesehen ist (primaryActionLabelFor(), eine reine, statische
 * Status-zu-Klartext-Ableitung – niemals ein neuer Button, niemals eine
 * ausgelöste Aktion). Alle drei Ableitungen lesen ausschließlich bereits
 * vorhandene Overview-Felder (`handoffs`, `risksAndLimits`, `status`),
 * niemals eine neue Route, niemals eine zweite Statusquelle. Für BLOCKED und
 * RETURNED bleiben Empfehlung und Risiko/Grenze bewusst immer `null` (siehe
 * recommendationTextFor()/riskTextFor()): ältere Handoff-Daten könnten
 * veraltet oder unpassend sein. Lieber keine Information als eine
 * möglicherweise falsche. Die sichtbare Beschriftung "Öffnen" heißt jetzt
 * "Entscheidung öffnen" – unverändert derselbe Button, derselbe
 * Navigationspfad (openOrder()).
 *
 * Stand seit V8.7 Stufe A ("Blockierungs- und Rückgabegründe dauerhaft
 * sichern"): der bei blockOrder(reason)/returnOrder(note) eingegebene
 * Freitext WIRD inzwischen dauerhaft gespeichert (append-only Fachtabelle
 * pilot_work_order_decision_reasons, Migration 25) und steht im Overview
 * additiv als `currentDecisionReason`/`decisionReasonHistory` bereit. Diese
 * Datei liest diese Felder in V8.7 Stufe A bewusst noch NICHT – die
 * sichtbare Darstellung des Grundes ist ausdrücklich nicht Teil von Stufe A.
 * Die obige Entscheidung, für BLOCKED/RETURNED keine Empfehlung und keinen
 * Risikotext aus Handoff-Daten abzuleiten, bleibt davon unberührt.
 *
 * Bekannte, bewusst weiterhin offene Lücken (gesondert dokumentiert in
 * CURRENT_STATUS.md): READY_FOR_REVIEW und READY_FOR_JAMAL_APPROVAL besitzen
 * im UI weiterhin nur je eine Primäraktion, keine Rückgabe-Schaltfläche
 * (serverseitige Rückgaberouten existieren, sind aber nicht verdrahtet).
 *
 * V8.7 Stufe C ("aktuellen Entscheidungsgrund im Chefmodus sichtbar
 * machen", additiv zu V8.4/V8.5): schließt genau die oben (V8.4) und in
 * V8.7 Stufe A benannte Lücke – der bei blockOrder(reason)/returnOrder(note)
 * eingegebene Freitext wird seit V8.7 Stufe A dauerhaft gespeichert und
 * steht im Overview additiv als `currentDecisionReason` bereit
 * (`{ kind, text, ... }` oder `null`, siehe pilot-work-order-service.js#
 * buildOverview). loadTodayOverviews() übernimmt dieses eine Feld jetzt
 * zusätzlich unverändert (niemals `decisionReasonHistory` – die Historie
 * wird bewusst nicht in den Chefmodus-State übernommen und nie gerendert).
 * decisionReasonTextFor() liefert daraus – ausschließlich für BLOCKED und
 * RETURNED, ausschließlich bei vorhandenem, nicht leerem Text – den
 * konkreten Grundtext, decisionReasonLineLabel() die dazu passende
 * Beschriftung ("Warum blockiert?"/"Warum zurückgegeben?", unbekannte
 * Grundart defensiv "Grund"). renderTodayRow() zeigt diesen Text als
 * zusätzliche, optionale Zeile direkt unter "Zu entscheiden" – über
 * dieselbe bestehende renderTodayRowLine()-Konvention (escapeHtml,
 * truncateForRowDisplay/CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT), also mit
 * derselben Sicherheits- und Kürzungsgarantie wie die übrigen Zeilen.
 * Fehlt `currentDecisionReason` (kein Grund gespeichert, Auftrag außerhalb
 * der Abrufgrenze, oder ein anderer Status), bleibt die bestehende Zeile
 * "Zu entscheiden" unverändert die einzige Aussage dazu – kein Ersatztext,
 * keine erfundene Begründung.
 *
 * V8.8.1 ("Reihenfolge und Ruhe im Chefmodus", rein darstellend – weder
 * Funktionsinhalte noch Auswahl, Sortierung, Statusmodell, Navigation oder
 * API-Aufrufe ändern sich): zwei ausschließlich strukturelle Änderungen an
 * render() unten. Erstens die Zusammenstellung der fünf Bereiche: Handlung
 * zuerst (Heute wichtig, Empfohlene nächste Arbeit, Neuen Auftrag anlegen),
 * Beobachtung und Vergangenheit danach (Läuft, Fertig) – vorher standen
 * "Fertig" und "Läuft" vor der Empfehlung und der Auftragsanlage. Zweitens
 * zeigen renderRunningSection() und renderDoneSection() bei leerer Auswahl
 * (selectRunning()/selectDone(), unverändert) jetzt einen leeren String
 * statt einer Section mit Verneinungstext ("Gerade läuft keine Arbeit."/
 * "Noch nichts abgeschlossen.") – ein leerer Tag zeigt beide Bereiche
 * dadurch gar nicht mehr. Sobald mindestens ein Eintrag vorhanden ist,
 * bleibt die Darstellung (Überschrift, Zeilen, Fortschritt/Statuslabel)
 * byte- bzw. inhaltsgleich zum Stand vor V8.8.1.
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

  // V8.4 – defensive technische Obergrenze für Einzel-Overview-Nachladungen
  // je Seitenaufruf (siehe Modulkopf). Unabhängig von RUNNING_LIMIT, auch
  // wenn beide zufällig denselben Wert haben: unterschiedliche Zwecke,
  // unterschiedliche Auswahl (selectToday() statt selectRunning()).
  var TODAY_OVERVIEW_FETCH_LIMIT = 5;

  // V8.4 – der sichtbare "Warum"-Satz, wenn kein `openDecision` aus dem
  // Einzel-Overview vorliegt (kein Abruf mehr innerhalb der Obergrenze,
  // Feld leer, oder der Abruf ist fehlgeschlagen). Bewusst ausführlichere,
  // eigenständige Sätze – ergänzend zur bestehenden, unveränderten
  // Kategorie aus TODAY_REASON_BY_STATUS, nicht deren Ersatz.
  var CHEF_TODAY_WHY_FALLBACK_BY_STATUS = {
    RETURNED: "Der Auftrag wurde zur\u00fcckgegeben und wartet auf deine n\u00e4chste Entscheidung.",
    READY_FOR_REVIEW: "Das Ergebnis wartet auf deine Pr\u00fcfung.",
    BLOCKED: "Der Auftrag ist blockiert und wartet auf deine Entscheidung.",
    READY_FOR_JAMAL_APPROVAL: "Der Auftrag wartet auf deine Freigabe.",
  };

  var state = {
    orders: [],
    // Fortschritt je laufendem Vorgang, unverändert aus overview.progress.
    progressByOrderId: {},
    // V8.4 – ausschließlich ergänzende Erklärung/Zeitpunkt je entscheidungs-
    // relevantem Auftrag, nachgeladen aus dem bestehenden Einzel-Overview.
    // Niemals eine zweite Quelle für Status oder Titel: Kategorie und
    // Auswahl bleiben ausschließlich Sache der Liste (state.orders).
    todayOverviewByOrderId: {},
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

  // V8.4-Korrekturlauf – feste, kleine Liste bekannter technischer
  // Klammerzusätze aus dem bestehenden `openDecision` (siehe
  // pilot-work-order-service.js#buildOverview). Bewusst KEINE pauschale
  // Klammerentfernung: normale fachliche Klammertexte (z. B.
  // "(Vier-Augen-Prinzip)") sind hiervon nicht betroffen und bleiben
  // erhalten, weil sie nicht in dieser Liste stehen.
  var KNOWN_TECHNICAL_DECISION_SUFFIXES = [" (COMPLETED)", " (APPROVED_FOR_EXECUTION)"];

  // V8.4-Korrekturlauf – entfernt ausschließlich die oben gelisteten,
  // bekannten technischen Zusätze aus einem sichtbaren openDecision-Text.
  // Reine Funktion: das übergebene Original bleibt unverändert (String-
  // Operationen in JavaScript sind ohnehin nie mutierend), die technische
  // Detailansicht kann das unveränderte `openDecision` also weiterhin
  // unverändert anzeigen. Defensiv:
  // - null/undefined/leer -> null (Aufrufer nutzt dann den Status-Fallback)
  // - mehrfach vorkommende bekannte Zusätze werden vollständig entfernt
  // - danach keine doppelten Leerzeichen, keine Leerzeichen vor Satzzeichen
  // - bleibt nach der Bereinigung nichts Sinnvolles übrig -> ebenfalls null
  // - ein unbekannter, normaler Text (inkl. normaler Klammerinhalte) bleibt
  //   unverändert
  function sanitizeChefDecisionText(text) {
    if (text == null) return null;
    var cleaned = String(text);
    KNOWN_TECHNICAL_DECISION_SUFFIXES.forEach(function (suffix) {
      while (cleaned.indexOf(suffix) !== -1) {
        cleaned = cleaned.split(suffix).join("");
      }
    });
    cleaned = cleaned.replace(/[ \t]+/g, " ");
    cleaned = cleaned.replace(/[ \t]+([.,;:!?])/g, "$1");
    cleaned = cleaned.trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  // V8.4 – der sichtbare "Warum"-Satz: zuerst das bestehende Feld
  // `openDecision` aus dem nachgeladenen Einzel-Overview (nur vorhanden,
  // wenn dieser Auftrag innerhalb von TODAY_OVERVIEW_FETCH_LIMIT lag und
  // der Abruf erfolgreich war), kontrolliert bereinigt über
  // sanitizeChefDecisionText() (V8.4-Korrekturlauf), andernfalls der
  // statusspezifische Fallback-Satz. Keine eigene Textgenerierung, keine
  // Kombination beider Quellen.
  function whyTextFor(order) {
    var overview = order ? state.todayOverviewByOrderId[order.id] : null;
    var sanitized = overview ? sanitizeChefDecisionText(overview.openDecision) : null;
    if (sanitized) return sanitized;
    return (order && CHEF_TODAY_WHY_FALLBACK_BY_STATUS[order.status]) || "";
  }

  // -----------------------------------------------------------------------
  // V8.5 ("Entscheidungen im Chefmodus besser vorbereiten") – Empfehlung,
  // Risiko/Grenze und verfügbare Aktion. Alle drei Funktionen sind reine
  // Lesefunktionen auf dem bereits geladenen state.todayOverviewByOrderId
  // (siehe loadTodayOverviews() oben) bzw. auf order.status – keine neue
  // Regel, keine neue Priorisierung, keine Statusänderung.
  // -----------------------------------------------------------------------

  // Dieselbe Rolle, an die die bestehende Pilotauftrags-Karte
  // (pilot-work-order-ui.js#documentationHandoffsFromOverview) ihre
  // Dokumentations-Rollenübergaben richtet. Bewusst wortgleich, keine neue
  // Rollenbezeichnung.
  var DOCUMENTATION_PILOT_ROLE = "DOKUMENTATION";

  // Fachlich exakt dieselbe Filterung wie
  // pilot-work-order-ui.js#documentationHandoffsFromOverview: alle
  // Rollenübergaben dieses Auftrags, die an die Dokumentation gerichtet
  // sind, in unveränderter Reihenfolge.
  function documentationHandoffsFor(order) {
    var overview = order ? state.todayOverviewByOrderId[order.id] : null;
    var handoffs = overview && Array.isArray(overview.handoffs) ? overview.handoffs : [];
    return handoffs.filter(function (handoff) {
      return Boolean(handoff) && handoff.toPilotRole === DOCUMENTATION_PILOT_ROLE;
    });
  }

  // Spiegelt fachlich hasPassedDocumentationHandoff() UND
  // latestDocumentationHandoff() aus pilot-work-order-ui.js in einem
  // Schritt: die zuletzt eingereichte Dokumentations-Rollenübergabe, die
  // tatsächlich vom Projektmanager-Filter angenommen wurde
  // (pmFilterStatus === "PASSED"). Keine abweichende neue Definition –
  // lediglich dieselben zwei bestehenden Prüfungen kombiniert, weil die
  // Startkarte (anders als der reine Vorhanden-Check in
  // hasPassedDocumentationHandoff()) den tatsächlichen Ergebnistext
  // braucht.
  function latestPassedDocumentationHandoff(order) {
    var documentationHandoffs = documentationHandoffsFor(order);
    for (var index = documentationHandoffs.length - 1; index >= 0; index -= 1) {
      var handoff = documentationHandoffs[index];
      if (handoff && handoff.pmFilterStatus === "PASSED") return handoff;
    }
    return null;
  }

  // Empfehlung (Auftrag Abschnitt "B. Empfehlung"): ausschließlich aus einem
  // belastbaren, tatsächlich angenommenen Dokumentations-Handoff. Für
  // BLOCKED und RETURNED immer `null` (alte Handoffs wären hier
  // möglicherweise veraltet oder unpassend – lieber keine Information als
  // eine möglicherweise falsche). Für READY_FOR_JAMAL_APPROVAL gilt exakt
  // dieselbe Regel wie für READY_FOR_REVIEW (keine neue, abweichende
  // Sonderregel) – in der typischen Lage vor Ausführungsstart existiert vor
  // diesem Zeitpunkt noch kein Dokumentations-Handoff, die Zeile entfällt
  // dann ersatzlos.
  function recommendationTextFor(order) {
    if (!order) return null;
    if (order.status !== "READY_FOR_REVIEW" && order.status !== "READY_FOR_JAMAL_APPROVAL") return null;
    var handoff = latestPassedDocumentationHandoff(order);
    if (!handoff) return null;
    if (typeof handoff.resultOrRecommendation !== "string") return null;
    if (handoff.resultOrRecommendation.trim().length === 0) return null;
    return sanitizeChefDecisionText(handoff.resultOrRecommendation);
  }

  // Risiko/Grenze (Auftrag Abschnitt "C. Risiko oder Grenze"): ausschließlich
  // aus dem bereits bestehenden, servergebauten overview.risksAndLimits
  // (pilot-work-order-service.js#buildOverview, bereits dedupliziert). Für
  // BLOCKED und RETURNED immer `null`. Bevorzugt den letzten nicht leeren,
  // nach der Bereinigung noch sinnvollen Text – keine Interpretation, keine
  // Zusammenfassung, maximal ein Text.
  function riskTextFor(order) {
    if (!order) return null;
    if (order.status !== "READY_FOR_REVIEW" && order.status !== "READY_FOR_JAMAL_APPROVAL") return null;
    var overview = state.todayOverviewByOrderId[order.id];
    var risksAndLimits = overview && Array.isArray(overview.risksAndLimits) ? overview.risksAndLimits : [];
    for (var index = risksAndLimits.length - 1; index >= 0; index -= 1) {
      var candidate = risksAndLimits[index];
      if (typeof candidate !== "string") continue;
      var sanitized = sanitizeChefDecisionText(candidate);
      if (sanitized) return sanitized;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // V8.7 Stufe C ("aktuellen Entscheidungsgrund im Chefmodus sichtbar
  // machen") – der bei blockOrder(reason)/returnOrder(note) eingegebene,
  // seit V8.7 Stufe A dauerhaft gespeicherte Freitext. Ausschließlich aus
  // dem bereits übernommenen state.todayOverviewByOrderId[...].
  // currentDecisionReason (siehe loadTodayOverviews() oben) – niemals aus
  // decisionReasonHistory, niemals aus Handoffs, Risiken, openDecision oder
  // Statuscodes abgeleitet.
  // -----------------------------------------------------------------------

  // Dasselbe bereits übernommene Feld, einmal zentral gelesen – sowohl für
  // den Grundtext (decisionReasonTextFor) als auch für die dazu passende
  // Beschriftung (decisionReasonLineLabel) in renderTodayRow().
  function currentDecisionReasonFor(order) {
    var overview = order ? state.todayOverviewByOrderId[order.id] : null;
    return overview ? overview.currentDecisionReason || null : null;
  }

  // Verbindliche Beschriftung je Grundart (Auftrag: BLOCK → "Warum
  // blockiert?", RETURN → "Warum zurückgegeben?"). Eine unbekannte
  // Grundart bleibt defensiv "Grund" statt eines rohen, technischen Werts.
  function decisionReasonLineLabel(kind) {
    if (kind === "BLOCK") return "Warum blockiert?";
    if (kind === "RETURN") return "Warum zur\u00fcckgegeben?";
    return "Grund";
  }

  // Der konkrete Grundtext (Auftrag Abschnitt "B. Reine Ableitungsfunktionen"):
  // nur für BLOCKED oder RETURNED, nur bei vorhandenem currentDecisionReason
  // mit einem nicht leeren Text. Sonst überall `null` – kein Ersatztext, kein
  // Rückgriff auf decisionReasonHistory, keine Ableitung aus einer anderen
  // Quelle.
  function decisionReasonTextFor(order) {
    if (!order) return null;
    if (order.status !== "BLOCKED" && order.status !== "RETURNED") return null;
    var reason = currentDecisionReasonFor(order);
    if (!reason || typeof reason.text !== "string") return null;
    if (reason.text.trim().length === 0) return null;
    return reason.text;
  }

  // Verfügbare Aktion (Auftrag Abschnitt "D. Verfügbare Aktion"): eine reine,
  // statische Status-zu-Klartext-Ableitung. Die Werte spiegeln wortgleich
  // die vier tatsächlichen Primäraktionen aus
  // pilot-work-order-ui.js#renderPrimaryAction – kein DOM-Zugriff, keine
  // Aktion, kein neuer Statuswert. BLOCKED spiegelt bewusst den tatsächlichen
  // Button-Text "Entsperren (zurückgeben)" (nicht "Entsperren und
  // zurückgeben") – so lautet der reale, im UI verdrahtete Text.
  var PRIMARY_ACTION_LABEL_BY_STATUS = {
    RETURNED: "Erneut als Entwurf starten",
    READY_FOR_REVIEW: "Ergebnis abnehmen",
    BLOCKED: "Entsperren (zur\u00fcckgeben)",
    READY_FOR_JAMAL_APPROVAL: "Ausf\u00fchrung freigeben",
  };

  function primaryActionLabelFor(order) {
    return (order && PRIMARY_ACTION_LABEL_BY_STATUS[order.status]) || null;
  }

  // Rein darstellende, nachvollziehbare Begrenzung (Auftrag Abschnitt "F.
  // Umfang und Ruhe"): Freitexte aus Handoffs (resultOrRecommendation,
  // riskOrLimit) können bis zu 4000 Zeichen lang sein (siehe
  // pilot-work-order-service.js#truncate). Auf der ruhigen Startkarte wird
  // ausschließlich die ANZEIGE gekürzt – keine sinnverändernde
  // Zusammenfassung, kein neuer Text. Der vollständige, unveränderte Text
  // bleibt in recommendationTextFor()/riskTextFor() sowie in der
  // bestehenden Detailansicht (Pilotauftrags-Karte) erhalten.
  var CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT = 200;

  function truncateForRowDisplay(text) {
    if (typeof text !== "string") return text;
    if (text.length <= CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT) return text;
    return text.slice(0, CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT - 1).trim() + "\u2026";
  }

  // V8.4 – laufende Nummer des lokalen Kalendertags. Date.UTC() liegt immer
  // exakt auf einer Tagesgrenze (kein DST-Sprung wie bei lokalen
  // Mitternachtswerten), deshalb ist die Differenz zweier Kalendertage
  // immer ein exaktes Vielfaches von 86400000 – keine Rundung nötig.
  function localDayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  }

  // V8.4 – deterministische Wartedauer ausschließlich aus dem bestehenden
  // Feld `updatedAt` (identisch, ob aus der Liste oder aus dem Overview:
  // beide liefern denselben, unveränderten Datenbankwert). Keine Uhrzeit,
  // keine Minuten-/Stundenanzeige. Ein fehlender oder ungültiger Wert löst
  // keinen Fehler aus – die Wartedauer entfällt dann ersatzlos.
  function waitLabelFor(order) {
    var raw = order && order.updatedAt;
    if (!raw) return "";
    var updated = new Date(raw);
    if (isNaN(updated.getTime())) return "";
    var diffDays = localDayNumber(new Date()) - localDayNumber(updated);
    if (diffDays <= 0) return "Heute";
    if (diffDays === 1) return "Gestern";
    return "Seit " + diffDays + " Tagen";
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

  // V8.4 – höchstens TODAY_OVERVIEW_FETCH_LIMIT Einzel-Overviews für die
  // entscheidungsrelevanten Aufträge (dieselbe bestehende Leseroute wie
  // loadRunningProgress()). Jeder einzelne Abruf ist defensiv abgesichert:
  // ein fehlgeschlagener Abruf (Netzwerkfehler, Timeout, unerwarteter
  // Serverfehler) lässt den betroffenen Auftrag einfach ohne
  // `openDecision` zurück – whyTextFor() fällt dann auf den Fallback-Satz
  // zurück. Ein fehlerhafter Detailabruf macht die Startkarte damit nie
  // unbrauchbar; Promise.all() selbst kann wegen der einzelnen .catch()
  // nicht mehr ablehnen.
  function loadTodayOverviews() {
    var candidates = selectToday(state.orders).slice(0, TODAY_OVERVIEW_FETCH_LIMIT);
    return Promise.all(
      candidates.map(function (order) {
        return fetchJson("/api/pilot-work-order/orders/" + encodeURIComponent(order.id))
          .then(function (response) {
            var overview = response.statusCode === 200 && response.data && response.data.ok ? response.data.overview : null;
            if (overview) {
              state.todayOverviewByOrderId[order.id] = {
                openDecision: overview.openDecision || null,
                // nextStep wird bewusst nicht dargestellt (enthält
                // technische Funktionsnamen, siehe pilot-work-order-
                // service.js#NEXT_STEP_BY_STATUS) – nur defensiv gehalten,
                // falls ein künftiges Arbeitspaket ihn fachlich aufbereitet.
                nextStep: overview.nextStep || null,
                // V8.5 – ausschließlich zum Lesen übernommen (siehe
                // recommendationTextFor()/riskTextFor() unten), niemals
                // mutiert: dieselben Arrays, die auch die bestehende
                // Pilotauftrags-Karte (pilot-work-order-ui.js) für ihre
                // eigene, unveränderte Primäraktions- und Handoff-Logik
                // liest. Ein fehlendes oder ungültiges Feld wird defensiv zu
                // einer leeren Liste – keine zweite Statusquelle, keine neue
                // Bedeutung dieser Felder.
                handoffs: Array.isArray(overview.handoffs) ? overview.handoffs : [],
                risksAndLimits: Array.isArray(overview.risksAndLimits) ? overview.risksAndLimits : [],
                // V8.7 Stufe C – ausschließlich das bereits bestehende,
                // aktuelle Feld (siehe decisionReasonTextFor() unten).
                // Bewusst KEINE Übernahme des historischen Overview-Feldes
                // (Feldname siehe Modulkopf, hier absichtlich nicht als
                // Objektzugriff notiert): die Historie gehört nicht in den
                // Chefmodus-State und wird hier nie gerendert.
                currentDecisionReason: overview.currentDecisionReason || null,
              };
            }
          })
          .catch(function () {
            /* V8.4: defensiv – ein fehlgeschlagener Einzelabruf darf die
               Startkarte nicht unbrauchbar machen (siehe Modulkopf). */
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
        return Promise.all([loadRunningProgress(), loadTodayOverviews()]);
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

  // V8.5 – eine optionale, eindeutig beschriftete Informationszeile
  // innerhalb einer Auftragszeile (siehe renderTodayRow()). Fehlt der Text
  // (null/leer), wird nichts gerendert – keine leere Überschrift, kein
  // erfundener Platzhaltertext wie "Keine Empfehlung vorhanden".
  //
  // V8.7 Stufe C (Browserabnahme-Korrektur): ein Label bekommt nur dann
  // zusätzlich einen Doppelpunkt angehängt, wenn es nicht bereits mit einem
  // Fragezeichen endet ("Zu entscheiden" → "Zu entscheiden:", aber "Warum
  // blockiert?" bleibt "Warum blockiert?" statt "Warum blockiert?:"). Die
  // bestehenden, bereits freigegebenen Labels ohne Fragezeichen sind davon
  // nicht betroffen – ausschließlich decisionReasonLineLabel() liefert
  // aktuell ein mit "?" endendes Label.
  function renderTodayRowLine(className, label, text) {
    if (!text) return "";
    var labelText = /\?$/.test(label) ? label : label + ":";
    return (
      '<span class="chef-today-row-line ' +
      className +
      '"><span class="chef-today-row-line-label">' +
      escapeHtml(labelText) +
      '</span> <span class="chef-today-row-line-text">' +
      escapeHtml(truncateForRowDisplay(text)) +
      "</span></span>"
    );
  }

  // V8.4/V8.5/V8.7 Stufe C – eine Zeile in "Heute wichtig". Sichtbare
  // Reihenfolge: Kategorie, Auftragstitel, "Zu entscheiden" (bestehender
  // whyTextFor()-Text, jetzt beschriftet), optional der konkrete
  // Entscheidungsgrund ("Warum blockiert?"/"Warum zurückgegeben?", siehe
  // decisionReasonTextFor()/decisionReasonLineLabel() – ergänzt die Zeile
  // darüber, ersetzt sie nie), optional "Empfehlung"
  // (recommendationTextFor()), optional "Wichtig zu beachten"
  // (riskTextFor()), Wartedauer, "Verfügbare Aktion"
  // (primaryActionLabelFor()) und die sichtbare Beschriftung "Entscheidung
  // öffnen". Die ganze Zeile bleibt EIN bestehender Button
  // (data-chef-today-action="open-order", siehe bindActionHandlersOnce) –
  // jede Beschriftung ist ausschließlich sichtbarer Text, kein zweites,
  // eigenständiges Bedienelement, keine Aktion, kein neuer Navigationspfad.
  function renderTodayRow(order) {
    var wait = waitLabelFor(order);
    var reason = currentDecisionReasonFor(order);
    return (
      '<button type="button" class="chef-today-row" data-chef-today-action="open-order" data-order-id="' +
      escapeHtml(order.id) +
      '"><span class="chef-today-row-meta">' +
      escapeHtml(reasonFor(order)) +
      '</span><span class="chef-today-row-title">' +
      escapeHtml(order.title) +
      "</span>" +
      renderTodayRowLine("chef-today-row-decision", "Zu entscheiden", whyTextFor(order)) +
      renderTodayRowLine(
        "chef-today-row-reason",
        reason ? decisionReasonLineLabel(reason.kind) : null,
        decisionReasonTextFor(order),
      ) +
      renderTodayRowLine("chef-today-row-recommendation", "Empfehlung", recommendationTextFor(order)) +
      renderTodayRowLine("chef-today-row-risk", "Wichtig zu beachten", riskTextFor(order)) +
      (wait ? '<span class="chef-today-row-wait">' + escapeHtml(wait) + "</span>" : "") +
      renderTodayRowLine("chef-today-row-action", "Verf\u00fcgbare Aktion", primaryActionLabelFor(order)) +
      '<span class="chef-today-row-open">Entscheidung \u00f6ffnen</span>' +
      "</button>"
    );
  }

  function renderTodaySection(orders) {
    var items = selectToday(orders);
    if (items.length === 0) {
      return renderSection("today", "Heute wichtig", renderEmpty("Heute wartet nichts auf deine Entscheidung."));
    }
    // V8.4 – die Abrufgrenze (TODAY_OVERVIEW_FETCH_LIMIT) begrenzt nur die
    // Anzahl der nachgeladenen Einzel-Overviews, nie die Sichtbarkeit:
    // JEDER entscheidungsrelevante Auftrag bleibt in dieser Liste stehen
    // (weiterhin die bestehende, unveränderte Reihenfolge). Ein ruhiger
    // Hinweis macht lediglich transparent, dass mehr Overviews vorhanden
    // sein könnten, als nachgeladen wurden – keine neue Priorisierung.
    var hint =
      items.length > TODAY_OVERVIEW_FETCH_LIMIT
        ? '<p class="chef-today-more-hint">Weitere wichtige Vorg\u00e4nge vorhanden.</p>'
        : "";
    return renderSection(
      "today",
      "Heute wichtig",
      '<div class="chef-today-list">' +
        items
          .map(function (order) {
            return renderTodayRow(order);
          })
          .join("") +
        "</div>" +
        hint,
    );
  }

  // V8.8.1 ("Reihenfolge und Ruhe im Chefmodus") – ein leerer Tag zeigt
  // "Fertig" gar nicht mehr (weder Überschrift noch Verneinungstext): eine
  // leere Beobachtungssektion lenkt von der nächsten Handlung ab, ohne
  // selbst eine Information zu tragen. Sobald mindestens ein Auftrag
  // COMPLETED ist, bleibt die Darstellung darunter unverändert (dieselbe
  // Auswahl selectDone(), derselbe HTML-Aufbau wie vor V8.8.1).
  function renderDoneSection(orders) {
    var items = selectDone(orders);
    if (items.length === 0) {
      return "";
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

  // V8.8.1 ("Reihenfolge und Ruhe im Chefmodus") – dieselbe Begründung wie
  // bei renderDoneSection() oben: ein leerer Tag zeigt "Läuft" gar nicht
  // mehr. Sobald mindestens ein Auftrag IN_EXECUTION ist, bleibt die
  // Darstellung darunter unverändert (dieselbe Auswahl selectRunning(),
  // derselbe HTML-Aufbau wie vor V8.8.1).
  function renderRunningSection(orders) {
    var items = selectRunning(orders);
    if (items.length === 0) {
      return "";
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
      renderRecommendationSection(orders) +
      renderNewOrderSection() +
      renderRunningSection(orders) +
      renderDoneSection(orders);
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
      CHEF_TODAY_WHY_FALLBACK_BY_STATUS: CHEF_TODAY_WHY_FALLBACK_BY_STATUS,
      RUNNING_STATUS: RUNNING_STATUS,
      DONE_STATUS: DONE_STATUS,
      RUNNING_LIMIT: RUNNING_LIMIT,
      TODAY_OVERVIEW_FETCH_LIMIT: TODAY_OVERVIEW_FETCH_LIMIT,
      escapeHtml: escapeHtml,
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
      whyTextFor: whyTextFor,
      sanitizeChefDecisionText: sanitizeChefDecisionText,
      waitLabelFor: waitLabelFor,
      recommendationTextFor: recommendationTextFor,
      riskTextFor: riskTextFor,
      decisionReasonLineLabel: decisionReasonLineLabel,
      decisionReasonTextFor: decisionReasonTextFor,
      primaryActionLabelFor: primaryActionLabelFor,
      PRIMARY_ACTION_LABEL_BY_STATUS: PRIMARY_ACTION_LABEL_BY_STATUS,
      CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT: CHEF_TODAY_ROW_TEXT_DISPLAY_LIMIT,
      truncateForRowDisplay: truncateForRowDisplay,
      openOrder: openOrder,
      openRecommendedWork: openRecommendedWork,
      openNewOrder: openNewOrder,
    };
  }
})();
