"use strict";

// V8.0 – Pilotauftrag aus einem Satz vorausfüllen.
//
// Rein browserlokales, deterministisches Vorschlagsmodul: aus einem einzigen
// Satz Jamals wird ein sichtbarer Arbeitsvorschlag erzeugt, der die acht
// bereits bestehenden Pilotauftragsfelder vorausfüllt. Dieses Modul ist
// KEIN neuer Auftragsweg, KEIN neues Datenmodell und KEINE neue
// Statusmaschine – der bestehende Pilotauftrag
// (pilot-work-order-service.js#CANONICAL_PILOT_ORDER_ID) bleibt das einzige
// führende Auftragsobjekt. Dieses Modul legt selbst NIEMALS einen Auftrag
// an, ruft NIEMALS eine Route auf und speichert NIEMALS etwas.
//
// V8.0 unterstützt ausschließlich genau ein Profil: USER_PERSPECTIVE
// (Nutzerperspektive, Bedienbarkeit, täglicher Gebrauch der
// KI-Unternehmenszentrale). Jeder nicht erkannte Satz liefert UNSUPPORTED.
//
// Harte Grenzen (V8.0-Auftrag):
//   - deterministisch, keine Zufallsfunktion, kein Zeitstempel im Ergebnis.
//   - kein Netzwerk, kein fetch, kein Datenbankzugriff, kein require von
//     auth-db oder business-use-policy.
//   - kein Modell-, LLM-, Agenten- oder Codex-Aufruf.
//   - keine eigene Geschäftsvalidierung: jedes erzeugte Feldset muss durch
//     die bestehende, unveränderte Funktion
//     pilot-work-order-service.js#validatePilotOrderInput() akzeptiert
//     werden.
//   - kein inhaltlicher Throw-Pfad für Nutzereingaben (jede Eingabe, auch
//     leer/kurz/unpassend, liefert ein reguläres Ergebnisobjekt).
//   - keine Datei außerhalb von context.chainSelectableFiles wird jemals
//     empfohlen; context.chainRecommendedFiles und context.involvedAgents
//     werden unverändert übernommen (keine eigene Team- oder
//     Dateiauswahllogik, keine Rechteerweiterung).
//   - Rollenabweichungen (isExactRoleMatch === false, mappingNote) werden
//     niemals verborgen oder geglättet.
//
// UMD-Muster identisch zu agent-registry.js: im Browser als globaler
// Namensraum (window.PilotWorkOrderDraftProfiles) verfügbar, in Node-Tests
// per require() ladbar.

(function initPilotWorkOrderDraftProfiles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PilotWorkOrderDraftProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPilotWorkOrderDraftProfilesApi() {
  const PROFILE_ID_USER_PERSPECTIVE = "USER_PERSPECTIVE";

  const FIELD_MAX_LENGTHS = Object.freeze({
    title: 200,
    desiredOutcome: 2000,
    requestedBy: 200,
    timeframe: 500,
  });

  const REQUESTED_BY = "Jamal";

  // Wörtlich an pilot-work-order-service.js#CANONICAL_PILOT_ORDER_INPUT
  // orientiert – für dieses Profil bewusst nicht verhandelbar (V8.0-Auftrag
  // Abschnitt 4: "Diese Sicherheits- und Rahmenfelder sind für dieses Profil
  // nicht verhandelbar").
  const ALLOWED_TOOLS = Object.freeze([
    "interne Dokumentenablage (read-only)",
    "bestehende kanonische Register (project-registry.js, agent-registry.js, read-only)",
    "bestehende Plugin-/Tool-Radar-Übersicht (read-only)",
  ]);
  const FORBIDDEN_ACTIONS = Object.freeze([
    "externe Schreibzugriffe",
    "E-Mails oder Nachrichten versenden",
    "Veröffentlichung",
    "Zahlungen oder Verträge",
    "Deployment",
    "automatische Freigabe durch einen Agenten",
    "Änderung am Health Upgrade Kompass",
  ]);
  const REQUIRED_APPROVALS = Object.freeze([
    "Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)",
    "Freigabe des finalen Ergebnisses (COMPLETED)",
    "jede externe Aktion oder Autonomieerhöhung",
  ]);
  const QUALITY_CRITERIA = Object.freeze([
    "Ergebnis beantwortet die Nutzer-/Bedienperspektive vollständig",
    "konkrete Verbesserungsvorschläge sind nachvollziehbar begründet",
    "Risiken und Grenzen sind offen benannt",
    "keine verbotene Aktion wurde ausgeführt",
    "Ergebnis ist klar strukturiert (Titel, Kernaussage, Belege, offene Punkte)",
  ]);

  const TIMEFRAME =
    "Ohne festes Enddatum; Start ausschließlich nach Jamals ausdrücklicher Freigabe eines realen Arbeitsauftrags.";

  const TITLE = "Pilotauftrag: Nutzerperspektive und täglicher Gebrauch der KI-Unternehmenszentrale";

  const DESIRED_OUTCOME_INTRO =
    "Ergebnisziel: Die KI-Unternehmenszentrale aus Nutzer- und Bedienperspektive prüfen und konkrete, " +
    "nachvollziehbar begründete Verbesserungsvorschläge für den täglichen Gebrauch liefern (Nutzerfluss, " +
    "Verständlichkeit, Übersichtlichkeit, Cockpit-Bedienung) – vollständig vorbereitend, ohne externe Aktion.";

  const UNSUPPORTED_REASON =
    "Dafür kann ich noch keinen Kettenauftrag vorbereiten. V8.0 unterstützt zunächst ausschließlich die Prüfung der " +
    "Unternehmenszentrale aus Nutzer- und Bedienperspektive. Du kannst einen anderen Satz eingeben oder das " +
    "bestehende Formular weiterhin manuell ausfüllen.";

  // Feste, nachvollziehbare Schlüsselwörter/Wortstämme (V8.0-Auftrag
  // Abschnitt 4) – ausschließlich eine einfache, deterministische
  // Stringprüfung auf dem kleingeschriebenen Satz. Kein KI-/Modellaufruf.
  const USER_PERSPECTIVE_KEYWORDS = Object.freeze([
    "einfacher",
    "einfach",
    "täglich",
    "alltag",
    "bedienung",
    "bedienen",
    "bedienbar",
    "nutzerfreundlich",
    "benutzerfreundlich",
    "nutzersicht",
    "nutzerperspektive",
    "verständlich",
    "übersichtlich",
    "cockpit",
    "gebrauch",
  ]);

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function safeStringArray(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  }

  function detectMatchedKeywords(sentence) {
    const normalized = sentence.toLowerCase();
    return USER_PERSPECTIVE_KEYWORDS.filter((keyword) => normalized.indexOf(keyword) !== -1);
  }

  function truncateSafely(text, maxLength) {
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  // Der Originalsatz darf als Ausgangsfrage erscheinen (V8.0-Auftrag
  // Abschnitt 4). Würde er die Feldgrenze sprengen, wird er VOLLSTÄNDIG
  // weggelassen statt mitten im Satz abgeschnitten zu werden – keine
  // stillen Kürzungen mitten im Satz.
  function buildDesiredOutcome(sentence) {
    const withSentence = "Ausgangsfrage: \u201e" + sentence + "\u201c " + DESIRED_OUTCOME_INTRO;
    if (withSentence.length <= FIELD_MAX_LENGTHS.desiredOutcome) return withSentence;
    return truncateSafely(DESIRED_OUTCOME_INTRO, FIELD_MAX_LENGTHS.desiredOutcome);
  }

  function buildFields(sentence) {
    return Object.freeze({
      title: truncateSafely(TITLE, FIELD_MAX_LENGTHS.title),
      desiredOutcome: buildDesiredOutcome(sentence),
      requestedBy: truncateSafely(REQUESTED_BY, FIELD_MAX_LENGTHS.requestedBy),
      qualityCriteria: QUALITY_CRITERIA.slice(),
      allowedTools: ALLOWED_TOOLS.slice(),
      forbiddenActions: FORBIDDEN_ACTIONS.slice(),
      requiredApprovals: REQUIRED_APPROVALS.slice(),
      timeframe: truncateSafely(TIMEFRAME, FIELD_MAX_LENGTHS.timeframe),
    });
  }

  // Rollenabweichungen dürfen nicht verborgen werden (V8.0-Auftrag
  // Abschnitt 4): jedes Teammitglied mit isExactRoleMatch === false und
  // einer mappingNote erzeugt eine sichtbare Unsicherheit.
  function buildUncertainties(team) {
    const uncertainties = [];
    team.forEach((member) => {
      if (member && member.isExactRoleMatch === false) {
        const label = (member && (member.pilotRoleLabel || member.canonicalName)) || "Rolle";
        const note = isNonEmptyString(member && member.mappingNote)
          ? member.mappingNote
          : "Diese Rollenzuordnung ist keine exakte Übereinstimmung mit dem kanonischen Agentenregister.";
        uncertainties.push(label + ": " + note);
      }
    });
    return uncertainties;
  }

  function buildUnsupportedResult() {
    return Object.freeze({
      outcome: "UNSUPPORTED",
      profileId: null,
      fields: null,
      rationale: null,
      recommendedFiles: [],
      team: [],
      uncertainties: [],
      unsupportedReason: UNSUPPORTED_REASON,
    });
  }

  // Einzige öffentliche Funktion dieses Moduls. Nimmt niemals einen
  // Throw-Pfad für Nutzereingaben: jede Eingabeform (fehlend, leer, sehr
  // lang, unbekannter Typ) liefert ein reguläres Ergebnisobjekt.
  function buildPilotWorkOrderDraft(input) {
    const safeInput = input && typeof input === "object" ? input : {};
    const sentence = typeof safeInput.sentence === "string" ? safeInput.sentence : "";
    const context = safeInput.context && typeof safeInput.context === "object" ? safeInput.context : {};

    if (!isNonEmptyString(sentence)) {
      return buildUnsupportedResult();
    }

    const trimmedSentence = sentence.trim();
    const matchedKeywords = detectMatchedKeywords(trimmedSentence);
    if (matchedKeywords.length === 0) {
      return buildUnsupportedResult();
    }

    const chainSelectableFiles = safeStringArray(context.chainSelectableFiles);
    // Die empfohlenen Nutzerperspektive-Dateien müssen unverändert aus
    // context.chainRecommendedFiles stammen; die zusätzliche Filterung
    // gegen chainSelectableFiles ist ausschließlich eine defensive
    // Zusicherung ("keine Datei außerhalb von context.chainSelectableFiles")
    // und entfernt in der regulären Serverkonfiguration keinen Eintrag,
    // weil chainRecommendedFiles dort strukturell bereits eine Teilmenge
    // von chainSelectableFiles ist.
    const chainRecommendedFiles = safeStringArray(context.chainRecommendedFiles).filter(function (relativePath) {
      return chainSelectableFiles.indexOf(relativePath) !== -1;
    });
    const team = Array.isArray(context.involvedAgents) ? context.involvedAgents.slice() : [];

    return Object.freeze({
      outcome: "DRAFT",
      profileId: PROFILE_ID_USER_PERSPECTIVE,
      fields: buildFields(trimmedSentence),
      rationale: Object.freeze({
        profileId: PROFILE_ID_USER_PERSPECTIVE,
        matchedKeywords: matchedKeywords.slice(),
        note: "Deterministische Stichwortprüfung auf dem eingegebenen Satz, kein Modell-/Agenten-/Codex-Lauf.",
      }),
      recommendedFiles: chainRecommendedFiles,
      team: team,
      uncertainties: buildUncertainties(team),
      unsupportedReason: null,
    });
  }

  return Object.freeze({
    PROFILE_ID_USER_PERSPECTIVE: PROFILE_ID_USER_PERSPECTIVE,
    UNSUPPORTED_REASON: UNSUPPORTED_REASON,
    buildPilotWorkOrderDraft: buildPilotWorkOrderDraft,
  });
});
