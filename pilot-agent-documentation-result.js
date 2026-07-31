"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – V7.8.1 ("Ergebnisbudget von
// Kettenschritt 2 technisch erzwingen").
//
// AUSGANGSPROBLEM (drei echte, belegte Browserläufe): der Dokumentations-Agent
// (Kettenschritt 2) überschritt die technische Read-Only-Ergebnisgrenze von
// 6000 Zeichen dreimal (6731 / 6360 / 7684 Zeichen, jeweils
// RESULT_TOO_LARGE), obwohl die Promptvorgaben dreimal verschärft wurden.
// Ursache: im gesamten Codex-Pfad existiert KEIN technischer Output-/
// Tokenbudget-Parameter (siehe execution-codex-adapter-readonly.js#
// buildReadOnlyCodexArgs); die 6000-Zeichen-Grenze ist eine reine
// NACHprüfung mit Verwerfen (execution-codex-adapter-readonly.js,
// MAX_READ_ONLY_RESULT_CHARS). Eine Promptvorgabe allein begrenzt die
// Modellausgabe nachweislich nicht.
//
// AUFGABE DIESES MODULS: aus einer bereits vorliegenden, vollständigen
// Modellantwort deterministisch ein Ergebnis erzeugen, das die verbindliche
// Ergebnisgröße garantiert einhält – ausschließlich durch WEGLASSEN ganzer
// Items bzw. ganzer Sätze, NIEMALS durch einen Schnitt innerhalb eines
// Satzes. Jede Weglassung wird gezählt und als Auditmetadaten zurückgegeben
// (sichtbar im Cockpit, siehe pilot-work-order-ui.js).
//
// VERBINDLICHE GRENZEN DIESES MODULS:
// - reine Funktionen, keine Seiteneffekte, kein fs, kein Netzwerk, keine
//   Datenbank, keine neuen Abhängigkeiten (bewusst kein require),
// - keine Freigabeentscheidung, kein Statuswechsel, kein Schreibpfad,
// - es wird an KEINER Stelle innerhalb eines Satzes gekürzt; ein Ergebnis,
//   das auch nach der vollständigen, regelbasierten Reduktion zu groß
//   bleibt, wird ABGELEHNT (sicherer Fehler) statt abgeschnitten,
// - MAX_READ_ONLY_RESULT_CHARS (6000) wird nicht verändert und nicht erhöht;
//   dieses Modul hält die gespeicherte Größe bewusst deutlich darunter.
//
// GELTUNGSBEREICH: ausschließlich die Dokumentationsstufe (Kettenschritt 2,
// agentKey "documentation-agent" bzw. pilotRole "DOKUMENTATION", siehe
// pilot-agent-codex-runner.js#isDocumentationStage). Für Kettenschritt 1
// (Recherche/Analyse) und Kettenschritt 3 (Projektmanager-Bewertung) wird
// dieses Modul niemals aufgerufen.

const DOCUMENTATION_RESULT_CONTRACT_VERSION = "V7.8.1-DOC-5-SECTIONS";

// Roh-Annahmegrenze ausschließlich für die Dokumentationsstufe: sie wird dem
// bereits vorhandenen, bislang ungenutzten Adapterparameter `maxResultChars`
// übergeben (siehe execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis,
// Parameter existiert dort bereits – der Adapter wird NICHT verändert).
// Erst dadurch erreicht eine zu ausführliche Modellantwort überhaupt diese
// Normalisierung, statt schon im Adapter verworfen zu werden. Eine noch
// größere Antwort bleibt weiterhin ein sauberer RESULT_TOO_LARGE-Fehler im
// Adapter.
const DOCUMENTATION_RAW_MAX_CHARS = 12000;

// Verbindliche maximale GESPEICHERTE Ergebnisgröße. Bewusst weit unter der
// unveränderten technischen Grenze von 6000 Zeichen, damit auch die
// Vorgängerübergabe an Kettenschritt 3 (MAX_PREDECESSOR_CONTEXT_CHARS = 6000)
// strukturell niemals anschlagen kann.
const DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS = 4500;

// Budget je nummeriertem Punkt in den Abschnitten 2 bis 4.
const DOCUMENTATION_ITEM_MAX_CHARS = 320;

// Kanonische Abschnittsregeln. `title` wird für die Ausgabe VERBINDLICH aus
// dieser Tabelle übernommen (niemals aus der Markerzeile des Modells) – eine
// überlange oder abweichend formulierte Markerzeile kann das Ergebnis
// dadurch nicht aufblähen.
const DOCUMENTATION_SECTION_RULES = Object.freeze({
  1: Object.freeze({ sectionNumber: 1, title: "KURZERGEBNIS", kind: "PROSE", maxSentences: 3, minSentences: 1, maxChars: 600 }),
  2: Object.freeze({ sectionNumber: 2, title: "BESTAETIGTE KERNBEFUNDE", kind: "ITEMS", maxItems: 4, minItems: 2, itemMaxChars: DOCUMENTATION_ITEM_MAX_CHARS }),
  3: Object.freeze({ sectionNumber: 3, title: "OFFENE PUNKTE UND GRENZEN", kind: "ITEMS", maxItems: 3, minItems: 1, itemMaxChars: DOCUMENTATION_ITEM_MAX_CHARS }),
  4: Object.freeze({ sectionNumber: 4, title: "PRIORISIERTE EMPFEHLUNGEN", kind: "ITEMS", maxItems: 3, minItems: 2, itemMaxChars: DOCUMENTATION_ITEM_MAX_CHARS }),
  5: Object.freeze({ sectionNumber: 5, title: "HERKUNFTSHINWEIS", kind: "PROSE", maxSentences: 2, minSentences: 1, maxChars: 300 }),
});

const DOCUMENTATION_SECTION_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);

// Feste, dokumentierte Reihenfolge der globalen Reduktion. Wird zyklisch
// durchlaufen: in jedem Durchgang wird der ERSTE noch reduzierbare Eintrag um
// GENAU EINE Einheit verkleinert (ein ganzes Item bzw. ein ganzer Satz),
// niemals unter die jeweilige Mindestzahl. Abschnitt 5 (Herkunftshinweis)
// wird global nie reduziert – er ist die Nachvollziehbarkeitsspur und
// ohnehin auf 2 Sätze/300 Zeichen begrenzt.
const DOCUMENTATION_REDUCTION_ORDER = Object.freeze([
  Object.freeze({ sectionNumber: 3, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 2, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 1, unit: "SENTENCE" }),
  Object.freeze({ sectionNumber: 4, unit: "ITEM" }),
]);

const DOCUMENTATION_RESULT_REASON_CODES = Object.freeze({
  STRUCTURE_INVALID: "DOCUMENTATION_RESULT_STRUCTURE_INVALID",
  STILL_TOO_LARGE: "DOCUMENTATION_RESULT_STILL_TOO_LARGE",
});

// Tolerante Markererkennung: zeilenweise, case-insensitive, optionale
// Präfixe wie "#", "##", "**" oder Aufzählungszeichen. Ausschlaggebend ist
// ausschließlich die Abschnittsnummer 1 bis 5 – der Titeltext des Modells
// darf abweichen.
const SECTION_MARKER_PATTERN = /^\s*(?:[#*\-\s]*)abschnitt\s*([1-5])\b/i;

// Zeilenanfang eines nummerierten Punktes ("1.", "1)", "-", "*", "•").
const ITEM_START_PATTERN = /^\s*(?:\d+[.)]|[-*•])\s+/;

// Häufige deutsche/englische Abkürzungen, nach denen ein Punkt KEINE
// Satzgrenze ist. Bewusst konservativ: eine nicht erkannte Satzgrenze
// verbindet nur zwei Sätze zu einer größeren Einheit (harmlos), eine
// falsch erkannte Satzgrenze könnte dagegen wie ein Schnitt mitten im Satz
// wirken – genau das ist ausgeschlossen.
const SENTENCE_BOUNDARY_ABBREVIATIONS = Object.freeze([
  "z", "b", "u", "a", "s", "d", "h", "o", "i", "e", "g", "n", "f",
  "ca", "bzw", "ggf", "vgl", "nr", "abs", "evtl", "inkl", "exkl", "max", "min",
  "sog", "usw", "etc", "dr", "prof", "str", "bspw", "ggü", "bzgl", "insb", "jew",
]);

function isAbbreviationBeforeBoundary(textBeforePunctuation) {
  const match = /([A-Za-zÄÖÜäöüß]+)$/.exec(textBeforePunctuation);
  if (!match) return false;
  return SENTENCE_BOUNDARY_ABBREVIATIONS.includes(match[1].toLowerCase());
}

// Zerlegt einen Textblock in ganze Sätze. Ein Schlusssatz ohne
// Satzendezeichen gilt als UNVOLLSTÄNDIG und wird als Ganzes weggelassen
// (nie zur Hälfte übernommen, nie künstlich mit einem Punkt ergänzt).
function splitIntoSentenceUnits(text) {
  const normalized = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim();
  if (!normalized) return { sentences: [], incompleteTail: "" };
  const sentences = [];
  const pattern = /[.!?]+/g;
  let startIndex = 0;
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const endIndex = match.index + match[0].length;
    const before = normalized.slice(0, match.index);
    if (isAbbreviationBeforeBoundary(before)) continue;
    const rest = normalized.slice(endIndex);
    // Eine Satzgrenze liegt nur vor, wenn danach der Text endet oder ein
    // neuer Satz beginnt (Großbuchstabe, Ziffer, Anführungszeichen).
    if (rest && !/^\s/.test(rest)) continue;
    const trimmedRest = rest.replace(/^\s+/, "");
    if (trimmedRest && !/^[A-ZÄÖÜ0-9"„“'(\-–—[]/.test(trimmedRest)) continue;
    const sentence = normalized.slice(startIndex, endIndex).trim();
    if (sentence) sentences.push(sentence);
    startIndex = endIndex;
  }
  const tail = normalized.slice(startIndex).trim();
  return { sentences, incompleteTail: tail };
}

// Zerlegt den Rumpf eines Item-Abschnitts in einzelne Punkte.
// Fortsetzungszeilen gehören zum jeweils laufenden Punkt. Fehlt die
// Nummerierung vollständig, gilt jeder durch eine Leerzeile getrennte
// Absatz als ein Punkt (tolerant, deterministisch, niemals ein leerer
// Abschnitt nur wegen fehlender Nummerierung).
function splitIntoItems(bodyLines) {
  const items = [];
  let current = null;
  let sawMarker = false;
  bodyLines.forEach((line) => {
    if (ITEM_START_PATTERN.test(line)) {
      sawMarker = true;
      if (current !== null) items.push(current);
      current = line.replace(ITEM_START_PATTERN, "").trim();
      return;
    }
    if (!line.trim()) {
      if (current !== null) {
        items.push(current);
        current = null;
      }
      return;
    }
    current = current === null ? line.trim() : `${current} ${line.trim()}`;
  });
  if (current !== null) items.push(current);
  const cleaned = items.map((entry) => entry.trim()).filter(Boolean);
  return { items: cleaned, sawItemMarker: sawMarker };
}

// Zerlegt die vollständige Modellantwort in die fünf Abschnitte. Die
// Abschnittsnummer trägt die Identität: eine abweichende Reihenfolge im
// Modelltext ist KEIN Fehler (es wird deterministisch nach Nummer
// sortiert). Ein zweites Vorkommen derselben Nummer verliert keinen Inhalt –
// sein Rumpf wird an den bereits erfassten Abschnitt angehängt und die
// Doppelung als Auditinformation gemeldet.
function parseDocumentationSections(text) {
  const raw = String(text === null || text === undefined ? "" : text);
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const bodyLinesByNumber = new Map();
  const orderOfAppearance = [];
  const duplicateSectionNumbers = [];
  const preambleLines = [];
  let currentNumber = null;

  lines.forEach((line) => {
    const match = SECTION_MARKER_PATTERN.exec(line);
    if (match) {
      const sectionNumber = Number(match[1]);
      if (bodyLinesByNumber.has(sectionNumber)) {
        if (!duplicateSectionNumbers.includes(sectionNumber)) duplicateSectionNumbers.push(sectionNumber);
      } else {
        bodyLinesByNumber.set(sectionNumber, []);
        orderOfAppearance.push(sectionNumber);
      }
      currentNumber = sectionNumber;
      return;
    }
    if (currentNumber === null) {
      preambleLines.push(line);
      return;
    }
    bodyLinesByNumber.get(currentNumber).push(line);
  });

  const sections = DOCUMENTATION_SECTION_NUMBERS.filter((sectionNumber) => bodyLinesByNumber.has(sectionNumber)).map((sectionNumber) => ({
    sectionNumber,
    title: DOCUMENTATION_SECTION_RULES[sectionNumber].title,
    bodyLines: bodyLinesByNumber.get(sectionNumber).slice(),
    bodyText: bodyLinesByNumber.get(sectionNumber).join("\n").trim(),
  }));
  const missingSections = DOCUMENTATION_SECTION_NUMBERS.filter((sectionNumber) => !bodyLinesByNumber.has(sectionNumber));

  return {
    sections,
    missingSections,
    duplicateSectionNumbers,
    orderOfAppearance,
    preambleCharCount: preambleLines.join("\n").trim().length,
    structureValid: missingSections.length === 0,
  };
}

function buildSectionHeader(sectionNumber) {
  return `ABSCHNITT ${sectionNumber} ${DOCUMENTATION_SECTION_RULES[sectionNumber].title}`;
}

function renderSectionBody(state) {
  if (state.kind === "PROSE") return state.sentences.join(" ");
  return state.items.map((itemText, index) => `${index + 1}. ${itemText}`).join("\n");
}

function renderNormalizedText(states) {
  return DOCUMENTATION_SECTION_NUMBERS.map((sectionNumber) => {
    const state = states.get(sectionNumber);
    return `${buildSectionHeader(sectionNumber)}\n${renderSectionBody(state)}`;
  })
    .join("\n\n")
    .trim();
}

function sectionCharCountsFor(states) {
  const counts = {};
  DOCUMENTATION_SECTION_NUMBERS.forEach((sectionNumber) => {
    const state = states.get(sectionNumber);
    counts[sectionNumber] = `${buildSectionHeader(sectionNumber)}\n${renderSectionBody(state)}`.length;
  });
  return counts;
}

// Begrenzt einen einzelnen Punkt auf sein Zeichenbudget – ausschließlich
// durch Weglassen ganzer Sätze am Ende. Der erste Satz bleibt immer
// erhalten, auch wenn er allein größer als das Budget ist; die
// Gesamtgrenze wird davon unabhängig durch die globale Reduktion bzw. im
// Extremfall durch eine kontrollierte Ablehnung gesichert (niemals durch
// einen Schnitt im Satz).
function limitSentencesToBudget(sentences, maxSentences, maxChars, minSentences, joiner) {
  let kept = sentences.slice(0, Math.max(minSentences, maxSentences));
  let droppedSentences = sentences.length - kept.length;
  while (kept.length > minSentences && kept.join(joiner).length > maxChars) {
    kept = kept.slice(0, kept.length - 1);
    droppedSentences += 1;
  }
  return { kept, droppedSentences };
}

function buildInitialSectionState(section) {
  const rule = DOCUMENTATION_SECTION_RULES[section.sectionNumber];
  if (rule.kind === "PROSE") {
    const split = splitIntoSentenceUnits(section.bodyText);
    const limited = limitSentencesToBudget(split.sentences, rule.maxSentences, rule.maxChars, rule.minSentences, " ");
    return {
      sectionNumber: section.sectionNumber,
      kind: "PROSE",
      rule,
      sentences: limited.kept,
      items: [],
      droppedSentences: limited.droppedSentences,
      droppedItems: 0,
      droppedIncompleteTail: Boolean(split.incompleteTail),
    };
  }
  const parsedItems = splitIntoItems(section.bodyLines);
  const keptItems = parsedItems.items.slice(0, rule.maxItems);
  let droppedItems = parsedItems.items.length - keptItems.length;
  let droppedSentences = 0;
  let droppedIncompleteTail = false;
  const normalizedItems = [];
  keptItems.forEach((itemText) => {
    const split = splitIntoSentenceUnits(itemText);
    if (split.incompleteTail) droppedIncompleteTail = true;
    if (split.sentences.length === 0) {
      // Der Punkt bestand ausschließlich aus einem unvollständigen Satz –
      // er wird vollständig weggelassen (kein halber Satz im Ergebnis).
      droppedItems += 1;
      return;
    }
    const limited = limitSentencesToBudget(split.sentences, split.sentences.length, rule.itemMaxChars, 1, " ");
    droppedSentences += limited.droppedSentences;
    normalizedItems.push(limited.kept.join(" "));
  });
  return {
    sectionNumber: section.sectionNumber,
    kind: "ITEMS",
    rule,
    sentences: [],
    items: normalizedItems,
    droppedSentences,
    droppedItems,
    droppedIncompleteTail,
  };
}

function reduceOneUnit(states) {
  for (let index = 0; index < DOCUMENTATION_REDUCTION_ORDER.length; index += 1) {
    const entry = DOCUMENTATION_REDUCTION_ORDER[index];
    const state = states.get(entry.sectionNumber);
    if (!state) continue;
    if (entry.unit === "ITEM" && state.kind === "ITEMS" && state.items.length > state.rule.minItems) {
      state.items = state.items.slice(0, state.items.length - 1);
      state.droppedItems += 1;
      return true;
    }
    if (entry.unit === "SENTENCE" && state.kind === "PROSE" && state.sentences.length > state.rule.minSentences) {
      state.sentences = state.sentences.slice(0, state.sentences.length - 1);
      state.droppedSentences += 1;
      return true;
    }
  }
  return false;
}

function buildMetadata(overrides) {
  return {
    contractVersion: DOCUMENTATION_RESULT_CONTRACT_VERSION,
    structureValid: false,
    contractFallbackAccepted: false,
    rawCharCount: 0,
    normalizedCharCount: 0,
    sectionCharCounts: {},
    droppedItemCount: 0,
    droppedSentenceCount: 0,
    droppedIncompleteTailSentence: false,
    compactionApplied: false,
    budgetMaxChars: DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS,
    missingSections: [],
    duplicateSectionNumbers: [],
    preambleCharCount: 0,
    ...overrides,
  };
}

function structureInvalidErrorMessage(missingSections) {
  const missingText = missingSections.map((sectionNumber) => `Abschnitt ${sectionNumber}`).join(", ");
  return (
    `Das Dokumentationsergebnis hält die verbindliche Fünf-Abschnittsstruktur nicht ein (fehlend: ${missingText}). ` +
    "Es wurde nichts gespeichert und Schritt 3 nicht gestartet."
  );
}

function stillTooLargeErrorMessage(charCount) {
  return (
    `Das Dokumentationsergebnis bleibt auch nach der regelbasierten Reduktion über der zulässigen Ergebnisgröße ` +
    `(${charCount} von maximal ${DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS} Zeichen). ` +
    "Es wurde nichts abgeschnitten und nichts gespeichert."
  );
}

// Deterministische Normalisierung einer vollständigen Dokumentationsantwort.
//
// Rückgabe:
//   { ok, reasonCode, errorMessage, normalizedText, metadata }
//
// Verhalten:
//   1. Vollständige Fünf-Abschnittsstruktur erkannt -> Abschnitts-,
//      Item- und Satzbudgets werden durchgesetzt, danach wird bei Bedarf in
//      der festen Reihenfolge (DOCUMENTATION_REDUCTION_ORDER) je EIN ganzes
//      Item bzw. ein ganzer Satz weggelassen, bis die Gesamtgröße unter dem
//      Budget liegt. Ergebnis ist immer <= DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS.
//   2. Struktur unvollständig, Rohtext aber bereits innerhalb des Budgets
//      -> der Rohtext wird UNVERÄNDERT durchgelassen (contractFallbackAccepted).
//      Begründung: das Budget ist die verbindliche technische Zusage; ist es
//      bereits erfüllt, muss nichts erzwungen werden und es darf auch nichts
//      weggelassen werden. Dadurch verhält sich jede bereits heute
//      budgetkonforme Antwort exakt wie vor V7.8.1 (Rückwärtskompatibilität).
//   3. Struktur unvollständig UND Rohtext über dem Budget -> kontrollierte
//      Ablehnung (DOCUMENTATION_RESULT_STRUCTURE_INVALID). Ohne die
//      Abschnittsstruktur gibt es keine fachlich verantwortbare Reihenfolge
//      für ein Weglassen, und abgeschnitten wird NIEMALS.
//   4. Auch nach vollständiger Reduktion noch über dem Budget -> kontrollierte
//      Ablehnung (DOCUMENTATION_RESULT_STILL_TOO_LARGE), ohne Abschneiden.
function normalizeDocumentationResult(text) {
  const raw = String(text === null || text === undefined ? "" : text);
  const rawCharCount = raw.length;
  const parsed = parseDocumentationSections(raw);

  if (!parsed.structureValid) {
    if (rawCharCount <= DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS) {
      return {
        ok: true,
        reasonCode: null,
        errorMessage: null,
        normalizedText: raw,
        metadata: buildMetadata({
          structureValid: false,
          contractFallbackAccepted: true,
          rawCharCount,
          normalizedCharCount: rawCharCount,
          missingSections: parsed.missingSections.slice(),
          duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
          preambleCharCount: parsed.preambleCharCount,
        }),
      };
    }
    return {
      ok: false,
      reasonCode: DOCUMENTATION_RESULT_REASON_CODES.STRUCTURE_INVALID,
      errorMessage: structureInvalidErrorMessage(parsed.missingSections),
      normalizedText: null,
      metadata: buildMetadata({
        structureValid: false,
        rawCharCount,
        missingSections: parsed.missingSections.slice(),
        duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
        preambleCharCount: parsed.preambleCharCount,
      }),
    };
  }

  const states = new Map();
  parsed.sections.forEach((section) => {
    states.set(section.sectionNumber, buildInitialSectionState(section));
  });

  let normalizedText = renderNormalizedText(states);
  while (normalizedText.length > DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS) {
    if (!reduceOneUnit(states)) break;
    normalizedText = renderNormalizedText(states);
  }

  const droppedItemCount = DOCUMENTATION_SECTION_NUMBERS.reduce((sum, sectionNumber) => sum + states.get(sectionNumber).droppedItems, 0);
  const droppedSentenceCount = DOCUMENTATION_SECTION_NUMBERS.reduce((sum, sectionNumber) => sum + states.get(sectionNumber).droppedSentences, 0);
  const droppedIncompleteTailSentence = DOCUMENTATION_SECTION_NUMBERS.some((sectionNumber) => states.get(sectionNumber).droppedIncompleteTail);

  // Ein Pflichtabschnitt, der nach der Normalisierung inhaltsleer ist,
  // gilt wie ein fehlender Abschnitt – ein Ergebnis mit leerem
  // Pflichtabschnitt wird niemals gespeichert.
  const emptySections = DOCUMENTATION_SECTION_NUMBERS.filter((sectionNumber) => !renderSectionBody(states.get(sectionNumber)).trim());
  if (emptySections.length > 0) {
    return {
      ok: false,
      reasonCode: DOCUMENTATION_RESULT_REASON_CODES.STRUCTURE_INVALID,
      errorMessage: structureInvalidErrorMessage(emptySections),
      normalizedText: null,
      metadata: buildMetadata({
        structureValid: false,
        rawCharCount,
        normalizedCharCount: 0,
        droppedItemCount,
        droppedSentenceCount,
        droppedIncompleteTailSentence,
        missingSections: emptySections.slice(),
        duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
        preambleCharCount: parsed.preambleCharCount,
      }),
    };
  }

  if (normalizedText.length > DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS) {
    return {
      ok: false,
      reasonCode: DOCUMENTATION_RESULT_REASON_CODES.STILL_TOO_LARGE,
      errorMessage: stillTooLargeErrorMessage(normalizedText.length),
      normalizedText: null,
      metadata: buildMetadata({
        structureValid: true,
        rawCharCount,
        normalizedCharCount: normalizedText.length,
        sectionCharCounts: sectionCharCountsFor(states),
        droppedItemCount,
        droppedSentenceCount,
        droppedIncompleteTailSentence,
        compactionApplied: true,
        duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
        preambleCharCount: parsed.preambleCharCount,
      }),
    };
  }

  const compactionApplied =
    droppedItemCount > 0 || droppedSentenceCount > 0 || droppedIncompleteTailSentence || parsed.preambleCharCount > 0;

  return {
    ok: true,
    reasonCode: null,
    errorMessage: null,
    normalizedText,
    metadata: buildMetadata({
      structureValid: true,
      rawCharCount,
      normalizedCharCount: normalizedText.length,
      sectionCharCounts: sectionCharCountsFor(states),
      droppedItemCount,
      droppedSentenceCount,
      droppedIncompleteTailSentence,
      compactionApplied,
      duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
      preambleCharCount: parsed.preambleCharCount,
    }),
  };
}

module.exports = {
  DOCUMENTATION_RESULT_CONTRACT_VERSION,
  DOCUMENTATION_RAW_MAX_CHARS,
  DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS,
  DOCUMENTATION_ITEM_MAX_CHARS,
  DOCUMENTATION_SECTION_RULES,
  DOCUMENTATION_SECTION_NUMBERS,
  DOCUMENTATION_REDUCTION_ORDER,
  DOCUMENTATION_RESULT_REASON_CODES,
  SECTION_MARKER_PATTERN,
  // Ausschließlich für gezielte Unit-Tests exportiert (siehe
  // pilot-agent-documentation-result.test.js) – der produktive Aufrufpfad
  // läuft ausschließlich über normalizeDocumentationResult.
  splitIntoSentenceUnits,
  splitIntoItems,
  parseDocumentationSections,
  normalizeDocumentationResult,
};
