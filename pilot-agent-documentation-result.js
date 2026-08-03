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
// GELTUNGSBEREICH BIS V7.8.1: ausschließlich die Dokumentationsstufe
// (Kettenschritt 2).
//
// -------------------------------------------------------------------------
// V7.9.8 ("Ergebnisbudget für Recherche- und Projektmanager-Stufe technisch
// erzwingen") – ERWEITERUNG DES GELTUNGSBEREICHS.
//
// AUSGANGSPROBLEM: fünf von zwölf bestehenden Ketten sind an
// RESULT_TOO_LARGE gescheitert – drei in Schritt 2 (durch V7.8.1 behoben),
// eine in Schritt 3 mit 6002 Zeichen und eine im ersten echten
// Drei-Agenten-Praxislauf bereits in Schritt 1 mit 7584 Zeichen. Für
// Schritt 1 (Recherche/Analyse) und Schritt 3 (Projektmanager-Bewertung)
// existierte weder ein technisch erzwungener Ausgabehaushalt noch eine
// sichere Verdichtung: die 6000-Zeichen-Grenze war dort weiterhin eine reine
// Nachprüfung mit Verwerfen.
//
// LÖSUNG: dasselbe, bereits in drei Größenordnungen bewährte Verfahren wird
// auf drei STUFENVERTRÄGE verallgemeinert (STAGE_CONTRACTS unten). Jeder
// Vertrag bringt eigene, zur Aufgabe der Stufe passende Abschnitte mit; die
// Reduktions-, Satz- und Ablehnungslogik ist für alle drei Stufen EINE
// gemeinsame, deterministische Implementierung. Der Dokumentationsvertrag
// aus V7.8.1 bleibt dabei unverändert wirksam (gleiche Abschnittsnamen,
// gleiche Budgets, gleiche Reduktionsreihenfolge, gleiche Reason Codes,
// gleicher Wortlaut der Ablehnungstexte).
//
// Der Dokumentationsvertrag ist für Schritt 1/3 bewusst KEIN Ersatz: er
// erkennt Abschnitte ausschließlich an ihrer Nummer und ersetzt den Titel
// verbindlich durch den Dokumentationstitel. Eine Rechercheantwort würde
// dadurch unter fachlich falschen Überschriften gespeichert ("KURZFAZIT" ->
// "KURZERGEBNIS"). Genau deshalb erhält jede Stufe einen eigenen Vertrag.

// Für alle drei Stufen identische Budgets. Sie sind bewusst gleich: die
// technische Zusage ("was gespeichert wird, passt garantiert") ist stufen-
// unabhängig, und ein einheitlicher Wert kann nicht versehentlich für eine
// Stufe auseinanderlaufen.
//
// Roh-Annahmegrenze: sie wird dem bereits vorhandenen, bislang ungenutzten
// Adapterparameter `maxResultChars` übergeben (siehe
// execution-codex-adapter-readonly.js#runCodexReadOnlyAnalysis, Parameter
// existiert dort bereits – der Adapter wird NICHT verändert). Erst dadurch
// erreicht eine zu ausführliche Modellantwort überhaupt diese
// Normalisierung, statt schon im Adapter verworfen zu werden. Eine noch
// größere Antwort bleibt weiterhin ein sauberer RESULT_TOO_LARGE-Fehler im
// Adapter.
const STAGE_RESULT_RAW_MAX_CHARS = 12000;

// Verbindliche maximale GESPEICHERTE Ergebnisgröße. Bewusst weit unter der
// unveränderten technischen Grenze von 6000 Zeichen, damit auch die
// Vorgängerübergabe an die jeweils nächste Stufe
// (MAX_PREDECESSOR_CONTEXT_CHARS = 6000) strukturell niemals anschlagen kann.
const STAGE_RESULT_NORMALIZED_MAX_CHARS = 4500;

// Budget je nummeriertem Punkt in den Item-Abschnitten (2 bis 4).
const STAGE_RESULT_ITEM_MAX_CHARS = 320;

const RESULT_CONTRACT_STAGES = Object.freeze({
  RESEARCH: "RESEARCH",
  DOCUMENTATION: "DOCUMENTATION",
  PROJECT_MANAGER: "PROJECT_MANAGER",
});

const SECTION_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);

function proseRule(sectionNumber, title, maxSentences, maxChars) {
  return Object.freeze({ sectionNumber, title, kind: "PROSE", maxSentences, minSentences: 1, maxChars });
}

function itemsRule(sectionNumber, title, maxItems, minItems) {
  return Object.freeze({
    sectionNumber,
    title,
    kind: "ITEMS",
    maxItems,
    minItems,
    itemMaxChars: STAGE_RESULT_ITEM_MAX_CHARS,
  });
}

// Feste, dokumentierte Reihenfolge der globalen Reduktion. Wird zyklisch
// durchlaufen: in jedem Durchgang wird der ERSTE noch reduzierbare Eintrag um
// GENAU EINE Einheit verkleinert (ein ganzes Item bzw. ein ganzer Satz),
// niemals unter die jeweilige Mindestzahl. Abschnitt 5 steht in KEINEM
// Vertrag in dieser Liste: er ist die Nachvollziehbarkeits- bzw.
// Entscheidungsspur der jeweiligen Stufe (Herkunftshinweis, Grenzen und
// Unsicherheiten, Empfehlung an Jamal) und ohnehin auf 2 Sätze/300 Zeichen
// begrenzt.
const DOCUMENTATION_REDUCTION_ORDER = Object.freeze([
  Object.freeze({ sectionNumber: 3, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 2, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 1, unit: "SENTENCE" }),
  Object.freeze({ sectionNumber: 4, unit: "ITEM" }),
]);

// Recherche: zuerst entfallen Reibungsverluste (Abschnitt 3), dann belegte
// Kernbefunde (2), dann Sätze des Kurzfazits (1) und zuletzt priorisierte
// Verbesserungen (4) – die Verbesserungen sind das eigentliche Arbeitsergebnis
// dieser Stufe und werden deshalb am spätesten angetastet.
const RESEARCH_REDUCTION_ORDER = DOCUMENTATION_REDUCTION_ORDER;

// Projektmanager: zuerst entfallen Stärken (Abschnitt 2), dann Schwächen (3),
// dann Sätze des Gesamturteils (1) und zuletzt die priorisierten
// Entscheidungen (4). Bewusst eine ANDERE Reihenfolge als in den beiden
// anderen Stufen: eine Entscheidungsvorlage darf ihre Entscheidungen und ihre
// belegten Schwächen zuletzt verlieren, niemals zuerst.
const PROJECT_MANAGER_REDUCTION_ORDER = Object.freeze([
  Object.freeze({ sectionNumber: 2, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 3, unit: "ITEM" }),
  Object.freeze({ sectionNumber: 1, unit: "SENTENCE" }),
  Object.freeze({ sectionNumber: 4, unit: "ITEM" }),
]);

// Kanonische Abschnittsregeln je Stufe. `title` wird für die Ausgabe
// VERBINDLICH aus dieser Tabelle übernommen (niemals aus der Markerzeile des
// Modells) – eine überlange oder abweichend formulierte Markerzeile kann das
// Ergebnis dadurch nicht aufblähen. Umlaute werden in den Titeln bewusst
// ausgeschrieben (STAERKEN, SCHWAECHEN), damit die Markerzeile im Prompt und
// im Ergebnis unabhängig von der Zeichenkodierung identisch bleibt.
const RESEARCH_SECTION_RULES = Object.freeze({
  1: proseRule(1, "KURZFAZIT", 3, 600),
  2: itemsRule(2, "BELEGTE KERNBEFUNDE", 4, 2),
  3: itemsRule(3, "REIBUNGSVERLUSTE", 3, 1),
  4: itemsRule(4, "PRIORISIERTE VERBESSERUNGEN", 3, 2),
  5: proseRule(5, "GRENZEN UND UNSICHERHEITEN", 2, 300),
});

const DOCUMENTATION_SECTION_RULES = Object.freeze({
  1: proseRule(1, "KURZERGEBNIS", 3, 600),
  2: itemsRule(2, "BESTAETIGTE KERNBEFUNDE", 4, 2),
  3: itemsRule(3, "OFFENE PUNKTE UND GRENZEN", 3, 1),
  4: itemsRule(4, "PRIORISIERTE EMPFEHLUNGEN", 3, 2),
  5: proseRule(5, "HERKUNFTSHINWEIS", 2, 300),
});

// Abschnitt 4 heißt im Prompt bewusst "genau 3 Entscheidungen", der
// GESPEICHERTE Titel trägt die Zahl aber NICHT: der Titel wird von der
// Zentrale gesetzt (siehe oben) und dürfte deshalb niemals eine Anzahl
// behaupten, die eine regelbasierte Reduktion oder eine knappe Modellantwort
// widerlegen könnte. Siehe Abschlussbericht V7.9.8, Abschnitt 6.
const PROJECT_MANAGER_SECTION_RULES = Object.freeze({
  1: proseRule(1, "GESAMTURTEIL", 3, 600),
  2: itemsRule(2, "WICHTIGSTE BELEGTE STAERKEN", 3, 2),
  3: itemsRule(3, "WICHTIGSTE BELEGTE SCHWAECHEN", 3, 2),
  4: itemsRule(4, "PRIORISIERTE ENTSCHEIDUNGEN", 3, 2),
  5: proseRule(5, "EMPFEHLUNG AN JAMAL", 2, 300),
});

const DOCUMENTATION_RESULT_CONTRACT_VERSION = "V7.8.1-DOC-5-SECTIONS";
const RESEARCH_RESULT_CONTRACT_VERSION = "V7.9.8-RESEARCH-5-SECTIONS";
const PROJECT_MANAGER_RESULT_CONTRACT_VERSION = "V7.9.8-PM-5-SECTIONS";

const DOCUMENTATION_RESULT_REASON_CODES = Object.freeze({
  STRUCTURE_INVALID: "DOCUMENTATION_RESULT_STRUCTURE_INVALID",
  STILL_TOO_LARGE: "DOCUMENTATION_RESULT_STILL_TOO_LARGE",
});

const RESEARCH_RESULT_REASON_CODES = Object.freeze({
  STRUCTURE_INVALID: "RESEARCH_RESULT_STRUCTURE_INVALID",
  STILL_TOO_LARGE: "RESEARCH_RESULT_STILL_TOO_LARGE",
});

const PROJECT_MANAGER_RESULT_REASON_CODES = Object.freeze({
  STRUCTURE_INVALID: "PM_RESULT_STRUCTURE_INVALID",
  STILL_TOO_LARGE: "PM_RESULT_STILL_TOO_LARGE",
});

// Ein Stufenvertrag bündelt ALLES, was die gemeinsame Verdichtungslogik über
// eine Stufe wissen muss. Es gibt keine stufenspezifische Verzweigung
// innerhalb der Logik selbst.
function buildStageContract({
  stage,
  contractVersion,
  resultLabel,
  structureRejectionFollowUpText,
  sectionRules,
  reductionOrder,
  reasonCodes,
}) {
  return Object.freeze({
    stage,
    contractVersion,
    resultLabel,
    structureRejectionFollowUpText,
    sectionRules,
    sectionNumbers: SECTION_NUMBERS,
    reductionOrder,
    reasonCodes,
    rawMaxChars: STAGE_RESULT_RAW_MAX_CHARS,
    normalizedMaxChars: STAGE_RESULT_NORMALIZED_MAX_CHARS,
    itemMaxChars: STAGE_RESULT_ITEM_MAX_CHARS,
  });
}

const STAGE_CONTRACTS = Object.freeze({
  [RESULT_CONTRACT_STAGES.RESEARCH]: buildStageContract({
    stage: RESULT_CONTRACT_STAGES.RESEARCH,
    contractVersion: RESEARCH_RESULT_CONTRACT_VERSION,
    resultLabel: "Rechercheergebnis",
    structureRejectionFollowUpText: "Es wurde nichts gespeichert und Schritt 2 nicht gestartet.",
    sectionRules: RESEARCH_SECTION_RULES,
    reductionOrder: RESEARCH_REDUCTION_ORDER,
    reasonCodes: RESEARCH_RESULT_REASON_CODES,
  }),
  [RESULT_CONTRACT_STAGES.DOCUMENTATION]: buildStageContract({
    stage: RESULT_CONTRACT_STAGES.DOCUMENTATION,
    contractVersion: DOCUMENTATION_RESULT_CONTRACT_VERSION,
    resultLabel: "Dokumentationsergebnis",
    structureRejectionFollowUpText: "Es wurde nichts gespeichert und Schritt 3 nicht gestartet.",
    sectionRules: DOCUMENTATION_SECTION_RULES,
    reductionOrder: DOCUMENTATION_REDUCTION_ORDER,
    reasonCodes: DOCUMENTATION_RESULT_REASON_CODES,
  }),
  [RESULT_CONTRACT_STAGES.PROJECT_MANAGER]: buildStageContract({
    stage: RESULT_CONTRACT_STAGES.PROJECT_MANAGER,
    contractVersion: PROJECT_MANAGER_RESULT_CONTRACT_VERSION,
    resultLabel: "Projektmanager-Ergebnis",
    structureRejectionFollowUpText: "Es wurde nichts gespeichert und die Kette wurde nicht abgeschlossen.",
    sectionRules: PROJECT_MANAGER_SECTION_RULES,
    reductionOrder: PROJECT_MANAGER_REDUCTION_ORDER,
    reasonCodes: PROJECT_MANAGER_RESULT_REASON_CODES,
  }),
});

function getStageContract(stage) {
  const contract = STAGE_CONTRACTS[stage];
  if (!contract) {
    throw new Error(`pilot-agent-documentation-result: unbekannter Stufenvertrag "${String(stage)}".`);
  }
  return contract;
}

// Rückwärtskompatible Namen aus V7.8.1 (unveränderte Werte, weiterhin
// exportiert – siehe pilot-agent-codex-runner.js und die Tests).
const DOCUMENTATION_RAW_MAX_CHARS = STAGE_RESULT_RAW_MAX_CHARS;
const DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS = STAGE_RESULT_NORMALIZED_MAX_CHARS;
const DOCUMENTATION_ITEM_MAX_CHARS = STAGE_RESULT_ITEM_MAX_CHARS;
const DOCUMENTATION_SECTION_NUMBERS = SECTION_NUMBERS;

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

// Zerlegt die vollständige Modellantwort in die fünf Abschnitte des
// übergebenen Stufenvertrags. Die Abschnittsnummer trägt die Identität: eine
// abweichende Reihenfolge im Modelltext ist KEIN Fehler (es wird
// deterministisch nach Nummer sortiert). Ein zweites Vorkommen derselben
// Nummer verliert keinen Inhalt – sein Rumpf wird an den bereits erfassten
// Abschnitt angehängt und die Doppelung als Auditinformation gemeldet.
function parseStageSections(contract, text) {
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

  const sections = contract.sectionNumbers.filter((sectionNumber) => bodyLinesByNumber.has(sectionNumber)).map((sectionNumber) => ({
    sectionNumber,
    title: contract.sectionRules[sectionNumber].title,
    bodyLines: bodyLinesByNumber.get(sectionNumber).slice(),
    bodyText: bodyLinesByNumber.get(sectionNumber).join("\n").trim(),
  }));
  const missingSections = contract.sectionNumbers.filter((sectionNumber) => !bodyLinesByNumber.has(sectionNumber));

  return {
    sections,
    missingSections,
    duplicateSectionNumbers,
    orderOfAppearance,
    preambleCharCount: preambleLines.join("\n").trim().length,
    structureValid: missingSections.length === 0,
  };
}

function buildSectionHeader(contract, sectionNumber) {
  return `ABSCHNITT ${sectionNumber} ${contract.sectionRules[sectionNumber].title}`;
}

function renderSectionBody(state) {
  if (state.kind === "PROSE") return state.sentences.join(" ");
  return state.items.map((itemText, index) => `${index + 1}. ${itemText}`).join("\n");
}

function renderNormalizedText(contract, states) {
  return contract.sectionNumbers
    .map((sectionNumber) => {
      const state = states.get(sectionNumber);
      return `${buildSectionHeader(contract, sectionNumber)}\n${renderSectionBody(state)}`;
    })
    .join("\n\n")
    .trim();
}

function sectionCharCountsFor(contract, states) {
  const counts = {};
  contract.sectionNumbers.forEach((sectionNumber) => {
    const state = states.get(sectionNumber);
    counts[sectionNumber] = `${buildSectionHeader(contract, sectionNumber)}\n${renderSectionBody(state)}`.length;
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

function buildInitialSectionState(contract, section) {
  const rule = contract.sectionRules[section.sectionNumber];
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

function reduceOneUnit(contract, states) {
  for (let index = 0; index < contract.reductionOrder.length; index += 1) {
    const entry = contract.reductionOrder[index];
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

// V7.9.8: `contractStage` benennt den tatsächlich angewendeten Stufenvertrag
// und `storedCharCount` die tatsächlich GESPEICHERTE Zeichenzahl (0, wenn das
// Ergebnis kontrolliert abgelehnt wurde). Beide Felder sind additiv – ein
// älterer Lauf ohne diese Felder bleibt unverändert lesbar.
function buildMetadata(contract, overrides) {
  return {
    contractStage: contract.stage,
    contractVersion: contract.contractVersion,
    structureValid: false,
    contractFallbackAccepted: false,
    rawCharCount: 0,
    normalizedCharCount: 0,
    storedCharCount: 0,
    sectionCharCounts: {},
    droppedItemCount: 0,
    droppedSentenceCount: 0,
    droppedIncompleteTailSentence: false,
    compactionApplied: false,
    budgetMaxChars: contract.normalizedMaxChars,
    missingSections: [],
    duplicateSectionNumbers: [],
    preambleCharCount: 0,
    ...overrides,
  };
}

function structureInvalidErrorMessage(contract, missingSections) {
  const missingText = missingSections.map((sectionNumber) => `Abschnitt ${sectionNumber}`).join(", ");
  return (
    `Das ${contract.resultLabel} hält die verbindliche Fünf-Abschnittsstruktur nicht ein (fehlend: ${missingText}). ` +
    contract.structureRejectionFollowUpText
  );
}

function stillTooLargeErrorMessage(contract, charCount) {
  return (
    `Das ${contract.resultLabel} bleibt auch nach der regelbasierten Reduktion über der zulässigen Ergebnisgröße ` +
    `(${charCount} von maximal ${contract.normalizedMaxChars} Zeichen). ` +
    "Es wurde nichts abgeschnitten und nichts gespeichert."
  );
}

// Deterministische Normalisierung einer vollständigen Stufenantwort gegen
// den Vertrag der jeweiligen Stufe (RESEARCH, DOCUMENTATION,
// PROJECT_MANAGER). Für alle drei Stufen EINE gemeinsame Implementierung.
//
// Rückgabe:
//   { ok, reasonCode, errorMessage, normalizedText, metadata }
//
// Verhalten:
//   1. Vollständige Fünf-Abschnittsstruktur erkannt -> Abschnitts-,
//      Item- und Satzbudgets werden durchgesetzt, danach wird bei Bedarf in
//      der festen Reihenfolge (contract.reductionOrder) je EIN ganzes
//      Item bzw. ein ganzer Satz weggelassen, bis die Gesamtgröße unter dem
//      Budget liegt. Ergebnis ist immer <= contract.normalizedMaxChars.
//   2. Struktur unvollständig, Rohtext aber bereits innerhalb des Budgets
//      -> der Rohtext wird UNVERÄNDERT durchgelassen (contractFallbackAccepted).
//      Begründung: das Budget ist die verbindliche technische Zusage; ist es
//      bereits erfüllt, muss nichts erzwungen werden und es darf auch nichts
//      weggelassen werden. Dadurch verhält sich jede bereits heute
//      budgetkonforme Antwort byteidentisch wie vor V7.8.1/V7.9.8
//      (Rückwärtskompatibilität).
//   3. Struktur unvollständig UND Rohtext über dem Budget -> kontrollierte
//      Ablehnung (<STUFE>_RESULT_STRUCTURE_INVALID). Ohne die
//      Abschnittsstruktur gibt es keine fachlich verantwortbare Reihenfolge
//      für ein Weglassen, und abgeschnitten wird NIEMALS.
//   4. Auch nach vollständiger Reduktion noch über dem Budget -> kontrollierte
//      Ablehnung (<STUFE>_RESULT_STILL_TOO_LARGE), ohne Abschneiden.
//
// Die Funktion trifft KEINE fachliche Bewertung: sie erfindet niemals ein
// Erfolgssignal, erteilt keine Freigabe und löst keine Folgestufe aus.
function normalizeStageResult(stage, text) {
  const contract = getStageContract(stage);
  const raw = String(text === null || text === undefined ? "" : text);
  const rawCharCount = raw.length;
  const parsed = parseStageSections(contract, raw);

  if (!parsed.structureValid) {
    if (rawCharCount <= contract.normalizedMaxChars) {
      return {
        ok: true,
        reasonCode: null,
        errorMessage: null,
        normalizedText: raw,
        metadata: buildMetadata(contract, {
          structureValid: false,
          contractFallbackAccepted: true,
          rawCharCount,
          normalizedCharCount: rawCharCount,
          storedCharCount: rawCharCount,
          missingSections: parsed.missingSections.slice(),
          duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
          preambleCharCount: parsed.preambleCharCount,
        }),
      };
    }
    return {
      ok: false,
      reasonCode: contract.reasonCodes.STRUCTURE_INVALID,
      errorMessage: structureInvalidErrorMessage(contract, parsed.missingSections),
      normalizedText: null,
      metadata: buildMetadata(contract, {
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
    states.set(section.sectionNumber, buildInitialSectionState(contract, section));
  });

  let normalizedText = renderNormalizedText(contract, states);
  while (normalizedText.length > contract.normalizedMaxChars) {
    if (!reduceOneUnit(contract, states)) break;
    normalizedText = renderNormalizedText(contract, states);
  }

  const droppedItemCount = contract.sectionNumbers.reduce((sum, sectionNumber) => sum + states.get(sectionNumber).droppedItems, 0);
  const droppedSentenceCount = contract.sectionNumbers.reduce((sum, sectionNumber) => sum + states.get(sectionNumber).droppedSentences, 0);
  const droppedIncompleteTailSentence = contract.sectionNumbers.some((sectionNumber) => states.get(sectionNumber).droppedIncompleteTail);

  // Ein Pflichtabschnitt, der nach der Normalisierung inhaltsleer ist,
  // gilt wie ein fehlender Abschnitt – ein Ergebnis mit leerem
  // Pflichtabschnitt wird niemals gespeichert.
  const emptySections = contract.sectionNumbers.filter((sectionNumber) => !renderSectionBody(states.get(sectionNumber)).trim());
  if (emptySections.length > 0) {
    return {
      ok: false,
      reasonCode: contract.reasonCodes.STRUCTURE_INVALID,
      errorMessage: structureInvalidErrorMessage(contract, emptySections),
      normalizedText: null,
      metadata: buildMetadata(contract, {
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

  if (normalizedText.length > contract.normalizedMaxChars) {
    return {
      ok: false,
      reasonCode: contract.reasonCodes.STILL_TOO_LARGE,
      errorMessage: stillTooLargeErrorMessage(contract, normalizedText.length),
      normalizedText: null,
      metadata: buildMetadata(contract, {
        structureValid: true,
        rawCharCount,
        normalizedCharCount: normalizedText.length,
        sectionCharCounts: sectionCharCountsFor(contract, states),
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
    metadata: buildMetadata(contract, {
      structureValid: true,
      rawCharCount,
      normalizedCharCount: normalizedText.length,
      storedCharCount: normalizedText.length,
      sectionCharCounts: sectionCharCountsFor(contract, states),
      droppedItemCount,
      droppedSentenceCount,
      droppedIncompleteTailSentence,
      compactionApplied,
      duplicateSectionNumbers: parsed.duplicateSectionNumbers.slice(),
      preambleCharCount: parsed.preambleCharCount,
    }),
  };
}

// Unveränderter Einstiegspunkt der Dokumentationsstufe aus V7.8.1.
function normalizeDocumentationResult(text) {
  return normalizeStageResult(RESULT_CONTRACT_STAGES.DOCUMENTATION, text);
}

function parseDocumentationSections(text) {
  return parseStageSections(STAGE_CONTRACTS[RESULT_CONTRACT_STAGES.DOCUMENTATION], text);
}

module.exports = {
  // V7.9.8 – Stufenverträge.
  RESULT_CONTRACT_STAGES,
  STAGE_CONTRACTS,
  STAGE_RESULT_RAW_MAX_CHARS,
  STAGE_RESULT_NORMALIZED_MAX_CHARS,
  STAGE_RESULT_ITEM_MAX_CHARS,
  RESEARCH_RESULT_CONTRACT_VERSION,
  RESEARCH_SECTION_RULES,
  RESEARCH_REDUCTION_ORDER,
  RESEARCH_RESULT_REASON_CODES,
  PROJECT_MANAGER_RESULT_CONTRACT_VERSION,
  PROJECT_MANAGER_SECTION_RULES,
  PROJECT_MANAGER_REDUCTION_ORDER,
  PROJECT_MANAGER_RESULT_REASON_CODES,
  getStageContract,
  normalizeStageResult,
  // V7.8.1 – unveränderte Namen und Werte der Dokumentationsstufe.
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
  // läuft ausschließlich über normalizeStageResult.
  splitIntoSentenceUnits,
  splitIntoItems,
  parseStageSections,
  parseDocumentationSections,
  normalizeDocumentationResult,
};
