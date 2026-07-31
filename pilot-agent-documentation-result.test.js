"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – V7.8.1 ("Ergebnisbudget von
// Kettenschritt 2 technisch erzwingen").
//
// Unit-Tests für pilot-agent-documentation-result.js im bereits etablierten
// check()-Stil der übrigen Suiten. Reine Funktionsprüfung: keine Datenbank,
// kein Server, kein Codex-Lauf, kein Dateisystem.
//
// Verbindliche Zusicherungen, die hier belastbar geprüft werden:
//   - ein gespeichertes Ergebnis ist NIEMALS größer als
//     DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS (4500),
//   - es wird NIEMALS innerhalb eines Satzes gekürzt (jedes akzeptierte
//     Ergebnis endet auf einem Satzendezeichen),
//   - ein zu großes Ergebnis wird abgelehnt, nicht abgeschnitten,
//   - jede Weglassung ist gezählt und auditierbar.

const assert = require("assert");

const docResult = require("./pilot-agent-documentation-result");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const SECTION_TITLES = {
  1: "KURZERGEBNIS",
  2: "BESTAETIGTE KERNBEFUNDE",
  3: "OFFENE PUNKTE UND GRENZEN",
  4: "PRIORISIERTE EMPFEHLUNGEN",
  5: "HERKUNFTSHINWEIS",
};

// Baut eine gültige, vertragskonforme Modellantwort. `a1`/`a5` sind
// Satzlisten, `a2`/`a3`/`a4` Itemlisten.
function buildDoc({ a1, a2, a3, a4, a5, preamble = "" }) {
  const block = (sectionNumber, body) => `ABSCHNITT ${sectionNumber} ${SECTION_TITLES[sectionNumber]}\n${body}`;
  const itemsBlock = (items) => items.map((text, index) => `${index + 1}. ${text}`).join("\n");
  const parts = [
    block(1, a1.join(" ")),
    block(2, itemsBlock(a2)),
    block(3, itemsBlock(a3)),
    block(4, itemsBlock(a4)),
    block(5, a5.join(" ")),
  ];
  return `${preamble}${parts.join("\n\n")}`;
}

function sentence(text) {
  return `${text}.`;
}

// Minimal vertragskonforme Antwort, die exakt auf allen Mindestzahlen liegt
// und deshalb durch die globale Reduktion NICHT weiter verkleinert werden
// kann (A1: 1 Satz, A2: 2 Items, A3: 1 Item, A4: 2 Items).
function buildIrreducibleDoc(firstItemText) {
  return buildDoc({
    a1: [sentence("Kurzergebnis in einem Satz")],
    a2: [firstItemText, sentence("Zweiter Kernbefund")],
    a3: [sentence("Ein offener Punkt")],
    a4: [sentence("Erste Empfehlung"), sentence("Zweite Empfehlung")],
    a5: [sentence("Grundlage ist das Vorgängerergebnis")],
  });
}

// Erzeugt eine gültige Antwort mit EXAKT `targetRawChars` Rohzeichen. Die
// Auffüllung erfolgt über einen zusätzlichen, fünften Punkt in Abschnitt 2,
// der durch die Item-Deckelung (maximal 4) vollständig weggelassen wird.
function buildValidDocWithRawLength(targetRawChars) {
  const base = buildDoc({
    a1: [sentence("Kurzergebnis"), sentence("Zweiter Satz")],
    a2: [sentence("Kernbefund eins"), sentence("Kernbefund zwei"), sentence("Kernbefund drei"), sentence("Kernbefund vier")],
    a3: [sentence("Offener Punkt eins"), sentence("Offener Punkt zwei")],
    a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei"), sentence("Empfehlung drei")],
    a5: [sentence("Grundlage ist das Vorgängerergebnis aus Schritt 1")],
  });
  const marker = "\n5. ";
  const fillerLength = targetRawChars - base.length - marker.length - 1;
  assert.ok(fillerLength > 0, `Zielrohgröße ${targetRawChars} ist zu klein für den Basistext`);
  const filler = `${marker}${"y".repeat(fillerLength)}.`;
  const insertAt = base.indexOf("\n\nABSCHNITT 3");
  const text = base.slice(0, insertAt) + filler + base.slice(insertAt);
  assert.strictEqual(text.length, targetRawChars, "Testhelfer muss die Rohgröße exakt treffen");
  return text;
}

// Erzeugt eine gültige, NICHT weiter reduzierbare Antwort, deren
// normalisiertes Ergebnis exakt `targetNormalizedChars` Zeichen hat. Möglich
// über einen einzigen, überlangen Satz im ersten Punkt von Abschnitt 2: ein
// einzelner Satz wird niemals zerschnitten und deshalb auch nicht durch das
// Item-Zeichenbudget verkleinert.
function buildIrreducibleDocWithNormalizedLength(targetNormalizedChars) {
  const probe = docResult.normalizeDocumentationResult(buildIrreducibleDoc(sentence("X")));
  assert.strictEqual(probe.ok, true);
  const overhead = probe.metadata.normalizedCharCount - sentence("X").length;
  const bodyLength = targetNormalizedChars - overhead - 1;
  assert.ok(bodyLength > 0, `Zielgröße ${targetNormalizedChars} ist zu klein`);
  const text = buildIrreducibleDoc(`${"z".repeat(bodyLength)}.`);
  return text;
}

function endsWithSentenceMark(text) {
  return /[.!?]$/.test(String(text || "").trim());
}

async function run() {
  // -------------------------------------------------------------------
  // Vertrag und Konstanten
  // -------------------------------------------------------------------
  await check("V7.8.1: Vertragskonstanten sind gesetzt und in sich widerspruchsfrei", () => {
    assert.strictEqual(docResult.DOCUMENTATION_RESULT_CONTRACT_VERSION, "V7.8.1-DOC-5-SECTIONS");
    assert.strictEqual(docResult.DOCUMENTATION_RAW_MAX_CHARS, 12000);
    assert.strictEqual(docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS, 4500);
    assert.strictEqual(docResult.DOCUMENTATION_ITEM_MAX_CHARS, 320);
    assert.ok(
      docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS < 6000,
      "die gespeicherte Größe muss strikt unter der unveränderten technischen Grenze von 6000 Zeichen liegen",
    );
    assert.ok(docResult.DOCUMENTATION_RAW_MAX_CHARS > docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
    // Die Reduktionsreihenfolge ist fest, dokumentiert und enthält Abschnitt 5
    // (Herkunftshinweis) bewusst nicht.
    assert.deepStrictEqual(
      docResult.DOCUMENTATION_REDUCTION_ORDER.map((entry) => `${entry.sectionNumber}:${entry.unit}`),
      ["3:ITEM", "2:ITEM", "1:SENTENCE", "4:ITEM"],
    );
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[2].maxItems, 4);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[2].minItems, 2);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[3].maxItems, 3);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[3].minItems, 1);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[4].maxItems, 3);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[4].minItems, 2);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[1].maxSentences, 3);
    assert.strictEqual(docResult.DOCUMENTATION_SECTION_RULES[5].maxSentences, 2);
  });

  // -------------------------------------------------------------------
  // Parser: tolerante Markererkennung
  // -------------------------------------------------------------------
  await check("Markererkennung ist tolerant (Groß-/Kleinschreibung, #, ##, ** und Aufzählungszeichen)", () => {
    const text = [
      "## Abschnitt 1 Kurzergebnis",
      "Das Ergebnis liegt vor.",
      "",
      "**ABSCHNITT 2 BESTAETIGTE KERNBEFUNDE**",
      "1. Befund eins ist belegt.",
      "",
      "- abschnitt 3 Offene Punkte",
      "1. Ein offener Punkt bleibt.",
      "",
      "#abschnitt 4",
      "1. Erste Empfehlung folgt.",
      "2. Zweite Empfehlung folgt.",
      "",
      "ABSCHNITT 5 Herkunft",
      "Grundlage ist Schritt 1.",
    ].join("\n");
    const parsed = docResult.parseDocumentationSections(text);
    assert.strictEqual(parsed.structureValid, true);
    assert.deepStrictEqual(parsed.missingSections, []);
    assert.deepStrictEqual(
      parsed.sections.map((section) => section.sectionNumber),
      [1, 2, 3, 4, 5],
    );
    // Der kanonische Titel stammt IMMER aus den Regeln, niemals aus der
    // Markerzeile des Modells.
    assert.strictEqual(parsed.sections[4].title, "HERKUNFTSHINWEIS");
  });

  await check("eine falsche Abschnittsreihenfolge ist kein Fehler und wird deterministisch sortiert", () => {
    const text = [
      "ABSCHNITT 5 HERKUNFTSHINWEIS",
      "Grundlage ist Schritt 1.",
      "ABSCHNITT 2 BESTAETIGTE KERNBEFUNDE",
      "1. Befund eins ist belegt.",
      "2. Befund zwei ist belegt.",
      "ABSCHNITT 1 KURZERGEBNIS",
      "Das Ergebnis liegt vor.",
      "ABSCHNITT 4 PRIORISIERTE EMPFEHLUNGEN",
      "1. Erste Empfehlung folgt.",
      "2. Zweite Empfehlung folgt.",
      "ABSCHNITT 3 OFFENE PUNKTE UND GRENZEN",
      "1. Ein offener Punkt bleibt.",
    ].join("\n");
    const parsed = docResult.parseDocumentationSections(text);
    assert.strictEqual(parsed.structureValid, true);
    assert.deepStrictEqual(parsed.orderOfAppearance, [5, 2, 1, 4, 3]);
    const normalized = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(normalized.ok, true);
    const markerOrder = normalized.normalizedText
      .split("\n")
      .filter((line) => /^ABSCHNITT /.test(line))
      .map((line) => Number(line.split(" ")[1]));
    assert.deepStrictEqual(markerOrder, [1, 2, 3, 4, 5], "die Ausgabe ist immer nach Abschnittsnummer sortiert");
  });

  await check("Text vor Abschnitt 1 wird als Präambel verworfen und gezählt", () => {
    const preamble = "Ich habe die Dateien gelesen und fasse nun zusammen. Hier mein Bericht.\n\n";
    const text = buildDoc({
      a1: [sentence("Kurzergebnis liegt vor")],
      a2: [sentence("Befund eins"), sentence("Befund zwei")],
      a3: [sentence("Ein offener Punkt")],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Grundlage ist Schritt 1")],
      preamble,
    });
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, true);
    assert.ok(!result.normalizedText.includes("Ich habe die Dateien gelesen"), "die Präambel darf nicht im Ergebnis stehen");
    assert.strictEqual(result.metadata.preambleCharCount, preamble.trim().length);
    assert.strictEqual(result.metadata.compactionApplied, true, "eine verworfene Präambel ist eine sichtbare Reduktion");
    assert.ok(result.normalizedText.startsWith("ABSCHNITT 1 KURZERGEBNIS"));
  });

  // -------------------------------------------------------------------
  // Item- und Satzdeckelung
  // -------------------------------------------------------------------
  await check("acht Kernbefunde werden auf vier gedeckelt, die Weglassungen sind gezählt", () => {
    const items = [];
    for (let index = 1; index <= 8; index += 1) items.push(sentence(`Kernbefund Nummer ${index} ist belegt`));
    const text = buildDoc({
      a1: [sentence("Kurzergebnis liegt vor")],
      a2: items,
      a3: [sentence("Ein offener Punkt")],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Grundlage ist Schritt 1")],
    });
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, true);
    const section2Body = result.normalizedText.split("ABSCHNITT 2 BESTAETIGTE KERNBEFUNDE\n")[1].split("\n\nABSCHNITT 3")[0];
    assert.deepStrictEqual(
      section2Body.split("\n").map((line) => line.slice(0, 2)),
      ["1.", "2.", "3.", "4."],
    );
    assert.ok(section2Body.includes("Kernbefund Nummer 4"));
    assert.ok(!section2Body.includes("Kernbefund Nummer 5"));
    assert.strictEqual(result.metadata.droppedItemCount, 4);
    assert.strictEqual(result.metadata.compactionApplied, true);
  });

  await check("Abschnitt 1 wird auf 3 Sätze gedeckelt, Abschnitt 5 auf 2 Sätze", () => {
    const text = buildDoc({
      a1: [sentence("Satz eins"), sentence("Satz zwei"), sentence("Satz drei"), sentence("Satz vier"), sentence("Satz fuenf")],
      a2: [sentence("Befund eins"), sentence("Befund zwei")],
      a3: [sentence("Ein offener Punkt")],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Quelle eins"), sentence("Quelle zwei"), sentence("Quelle drei")],
    });
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, true);
    assert.ok(result.normalizedText.includes("Satz drei."));
    assert.ok(!result.normalizedText.includes("Satz vier."));
    assert.ok(result.normalizedText.includes("Quelle zwei."));
    assert.ok(!result.normalizedText.includes("Quelle drei."));
    assert.strictEqual(result.metadata.droppedSentenceCount, 3);
  });

  await check("ein Punkt über dem Item-Zeichenbudget verliert ganze Sätze, niemals Satzteile", () => {
    const longItem = [
      sentence(`Erster Satz mit Substanz ${"a".repeat(200)}`),
      sentence(`Zweiter Satz der nicht mehr passt ${"b".repeat(200)}`),
    ].join(" ");
    const text = buildDoc({
      a1: [sentence("Kurzergebnis liegt vor")],
      a2: [longItem, sentence("Befund zwei")],
      a3: [sentence("Ein offener Punkt")],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Grundlage ist Schritt 1")],
    });
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, true);
    assert.ok(result.normalizedText.includes("Erster Satz mit Substanz"));
    assert.ok(!result.normalizedText.includes("Zweiter Satz der nicht mehr passt"));
    assert.ok(!result.normalizedText.includes("bbb"), "der weggelassene Satz darf nicht in Resten auftauchen");
    assert.strictEqual(result.metadata.droppedSentenceCount, 1);
    assert.ok(endsWithSentenceMark(result.normalizedText));
  });

  // -------------------------------------------------------------------
  // Grenzwerte der ROHGRÖSSE (genau die belegten Problemgrößen)
  // -------------------------------------------------------------------
  await check("Rohgrößen 4999/5000/5001/5999/6000/6001 mit gültiger Struktur werden akzeptiert und auf <= 4500 gebracht", () => {
    [4999, 5000, 5001, 5999, 6000, 6001].forEach((rawTarget) => {
      const text = buildValidDocWithRawLength(rawTarget);
      const result = docResult.normalizeDocumentationResult(text);
      assert.strictEqual(result.ok, true, `Rohgröße ${rawTarget} muss akzeptiert werden`);
      assert.strictEqual(result.metadata.rawCharCount, rawTarget);
      assert.ok(
        result.normalizedText.length <= docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS,
        `Rohgröße ${rawTarget} muss auf maximal 4500 Zeichen gebracht werden`,
      );
      assert.strictEqual(result.metadata.normalizedCharCount, result.normalizedText.length);
      assert.strictEqual(result.metadata.compactionApplied, true);
      assert.ok(result.metadata.droppedItemCount >= 1);
      assert.ok(endsWithSentenceMark(result.normalizedText), `Rohgröße ${rawTarget} darf nicht mitten im Satz enden`);
    });
  });

  await check("auch die belegten drei echten Browsergrößen (6731/6360/7684) und die Roh-Obergrenze 12000 werden beherrscht", () => {
    [6360, 6731, 7684, docResult.DOCUMENTATION_RAW_MAX_CHARS].forEach((rawTarget) => {
      const result = docResult.normalizeDocumentationResult(buildValidDocWithRawLength(rawTarget));
      assert.strictEqual(result.ok, true, `Rohgröße ${rawTarget} muss akzeptiert werden`);
      assert.ok(result.normalizedText.length <= docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
      assert.ok(endsWithSentenceMark(result.normalizedText));
    });
  });

  // -------------------------------------------------------------------
  // Grenzwerte der NORMALISIERTEN GRÖSSE
  // -------------------------------------------------------------------
  await check("normalisierte Grenzwerte: 4499 und 4500 Zeichen werden akzeptiert, 4501 wird ohne Abschneiden abgelehnt", () => {
    [4499, 4500].forEach((target) => {
      const result = docResult.normalizeDocumentationResult(buildIrreducibleDocWithNormalizedLength(target));
      assert.strictEqual(result.ok, true, `${target} Zeichen müssen zulässig sein`);
      assert.strictEqual(result.normalizedText.length, target);
      assert.strictEqual(result.metadata.normalizedCharCount, target);
      assert.ok(endsWithSentenceMark(result.normalizedText));
    });
    const tooLarge = docResult.normalizeDocumentationResult(buildIrreducibleDocWithNormalizedLength(4501));
    assert.strictEqual(tooLarge.ok, false);
    assert.strictEqual(tooLarge.reasonCode, "DOCUMENTATION_RESULT_STILL_TOO_LARGE");
    assert.strictEqual(tooLarge.normalizedText, null, "es wird nichts abgeschnitten und nichts zurückgegeben");
    assert.strictEqual(tooLarge.metadata.normalizedCharCount, 4501);
    assert.ok(tooLarge.errorMessage.includes("4501 von maximal 4500 Zeichen"));
    assert.ok(tooLarge.errorMessage.includes("Es wurde nichts abgeschnitten und nichts gespeichert."));
  });

  await check("ein überzähliger Punkt wird in der festgelegten Reihenfolge weggelassen, statt das Ergebnis abzulehnen", () => {
    // Knapp unterhalb des Budgets plus ein zusätzlicher, weglassbarer Punkt
    // in Abschnitt 3: hier greift die globale Reduktion (Abschnitt 3 zuerst)
    // und das Ergebnis wird gültig, statt abgelehnt zu werden.
    const base = buildIrreducibleDocWithNormalizedLength(4470);
    const reducible = base.replace(
      "ABSCHNITT 3 OFFENE PUNKTE UND GRENZEN\n1. Ein offener Punkt.",
      "ABSCHNITT 3 OFFENE PUNKTE UND GRENZEN\n1. Ein offener Punkt.\n2. Ein zweiter offener Punkt mit Substanz.",
    );
    assert.ok(reducible.includes("Ein zweiter offener Punkt"), "Testvorbereitung muss greifen");
    const result = docResult.normalizeDocumentationResult(reducible);
    assert.strictEqual(result.ok, true);
    assert.ok(result.normalizedText.length <= docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
    assert.ok(!result.normalizedText.includes("Ein zweiter offener Punkt"), "der zuerst vorgesehene Punkt wurde weggelassen");
    assert.ok(result.normalizedText.includes("Ein offener Punkt."), "die Mindestbesetzung von Abschnitt 3 bleibt erhalten");
    assert.strictEqual(result.metadata.droppedItemCount, 1);
    assert.strictEqual(result.metadata.compactionApplied, true);
  });

  await check("ein einzelner Satz mit 9000 Zeichen wird abgelehnt und NICHT abgeschnitten", () => {
    const hugeSentence = `${"w".repeat(8999)}.`;
    const text = buildIrreducibleDoc(hugeSentence);
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonCode, "DOCUMENTATION_RESULT_STILL_TOO_LARGE");
    assert.strictEqual(result.normalizedText, null);
    assert.strictEqual(result.metadata.structureValid, true);
    assert.ok(result.metadata.normalizedCharCount > docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
    assert.ok(result.errorMessage.includes("nichts abgeschnitten"));
  });

  // -------------------------------------------------------------------
  // Struktur- und Negativfälle
  // -------------------------------------------------------------------
  await check("ein fehlender Abschnitt 5 führt oberhalb des Budgets zu STRUCTURE_INVALID mit benanntem Abschnitt", () => {
    const valid = buildValidDocWithRawLength(6001);
    const withoutSection5 = valid.slice(0, valid.indexOf("\n\nABSCHNITT 5"));
    assert.ok(withoutSection5.length > docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
    const result = docResult.normalizeDocumentationResult(withoutSection5);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonCode, "DOCUMENTATION_RESULT_STRUCTURE_INVALID");
    assert.strictEqual(result.normalizedText, null);
    assert.deepStrictEqual(result.metadata.missingSections, [5]);
    assert.ok(result.errorMessage.includes("(fehlend: Abschnitt 5)"));
    assert.ok(result.errorMessage.includes("Es wurde nichts gespeichert und Schritt 3 nicht gestartet."));
  });

  await check("ein leerer Pflichtabschnitt gilt wie ein fehlender Abschnitt", () => {
    const text = buildDoc({
      a1: [sentence("Kurzergebnis liegt vor")],
      a2: [sentence("Befund eins"), sentence("Befund zwei")],
      a3: [],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Grundlage ist Schritt 1")],
    });
    const result = docResult.normalizeDocumentationResult(text);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonCode, "DOCUMENTATION_RESULT_STRUCTURE_INVALID");
    assert.deepStrictEqual(result.metadata.missingSections, [3]);
  });

  await check("Fließtext ohne Marker wird oberhalb des Budgets abgelehnt (kein Abschneiden, keine Speicherung)", () => {
    const proseOnly = `${"Ein Satz ohne jede Abschnittsstruktur. ".repeat(200)}`;
    assert.ok(proseOnly.length > docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS);
    const result = docResult.normalizeDocumentationResult(proseOnly);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonCode, "DOCUMENTATION_RESULT_STRUCTURE_INVALID");
    assert.strictEqual(result.normalizedText, null);
    assert.deepStrictEqual(result.metadata.missingSections, [1, 2, 3, 4, 5]);
    assert.strictEqual(result.metadata.structureValid, false);
  });

  await check("Rückwärtskompatibilität: ein markerloses Ergebnis innerhalb des Budgets bleibt byteidentisch unverändert", () => {
    // Begründung: das Budget ist die verbindliche technische Zusage. Ist sie
    // bereits erfüllt, wird nichts erzwungen und ausdrücklich nichts
    // weggelassen. Jede bereits vor V7.8.1 gültige, kurze Antwort verhält
    // sich dadurch unverändert.
    const legacy = "Titel: Testdokumentation Schritt 2.\nAusgangslage: siehe Schritt 1.\nOffene Punkte: keine.";
    const result = docResult.normalizeDocumentationResult(legacy);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalizedText, legacy, "der Text muss byteidentisch erhalten bleiben");
    assert.strictEqual(result.metadata.structureValid, false);
    assert.strictEqual(result.metadata.contractFallbackAccepted, true);
    assert.strictEqual(result.metadata.compactionApplied, false, "ohne Weglassung darf kein Reduktionshinweis erscheinen");
    assert.strictEqual(result.metadata.droppedItemCount, 0);
    assert.strictEqual(result.metadata.droppedSentenceCount, 0);
  });

  await check("ein Text, der mitten im Satz endet, verliert den unvollständigen Schlusssatz vollständig", () => {
    const text = buildDoc({
      a1: [sentence("Kurzergebnis liegt vor")],
      a2: [sentence("Befund eins"), sentence("Befund zwei")],
      a3: [sentence("Ein offener Punkt")],
      a4: [sentence("Empfehlung eins"), sentence("Empfehlung zwei")],
      a5: [sentence("Grundlage ist Schritt 1")],
    });
    const truncatedByModel = `${text} Der Herkunftshinweis stammt aus dem Vorgängerlauf und wurde`;
    const result = docResult.normalizeDocumentationResult(truncatedByModel);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.metadata.droppedIncompleteTailSentence, true);
    assert.ok(!result.normalizedText.includes("und wurde"), "der unvollständige Satz darf nicht im Ergebnis stehen");
    assert.ok(endsWithSentenceMark(result.normalizedText));
    assert.strictEqual(result.metadata.compactionApplied, true);
  });

  await check("Satzzerlegung trennt nicht an Abkürzungen, Dezimalzahlen oder Dateinamen", () => {
    const split = docResult.splitIntoSentenceUnits(
      "Die Grenze liegt bei 4.500 Zeichen und gilt z. B. auch für pilot-work-order-ui.js. Danach folgt der zweite Satz.",
    );
    assert.strictEqual(split.sentences.length, 2);
    assert.ok(split.sentences[0].includes("4.500 Zeichen"));
    assert.ok(split.sentences[0].includes("z. B."));
    assert.strictEqual(split.incompleteTail, "");
  });

  await check("ein leerer oder fehlender Rohtext wird als ungültige Struktur behandelt, ohne zu werfen", () => {
    [null, undefined, "", "   "].forEach((value) => {
      const result = docResult.normalizeDocumentationResult(value);
      assert.strictEqual(result.ok, true, "leer bleibt innerhalb des Budgets und wird unverändert durchgelassen");
      assert.strictEqual(result.metadata.structureValid, false);
      assert.strictEqual(result.metadata.compactionApplied, false);
    });
  });

  // -------------------------------------------------------------------
  // Verbindliche Gesamtzusicherungen über viele Varianten
  // -------------------------------------------------------------------
  await check("über alle geprüften Varianten gilt: kein Ergebnis über 4500 Zeichen und kein Ergebnis endet mitten im Satz", () => {
    const variants = [];
    [400, 1200, 3000, 4500, 4999, 6001, 7684, 9000, 12000].forEach((rawTarget) => {
      if (rawTarget < 500) return;
      variants.push(buildValidDocWithRawLength(rawTarget));
    });
    const manyItems = [];
    for (let index = 1; index <= 30; index += 1) manyItems.push(sentence(`Punkt ${index} mit ausreichend Text ${"c".repeat(150)}`));
    variants.push(
      buildDoc({
        a1: [sentence(`Langes Kurzergebnis ${"d".repeat(400)}`), sentence("Zweiter Satz"), sentence("Dritter Satz"), sentence("Vierter Satz")],
        a2: manyItems,
        a3: manyItems,
        a4: manyItems,
        a5: [sentence(`Herkunft ${"e".repeat(400)}`), sentence("Zweite Quelle"), sentence("Dritte Quelle")],
      }),
    );
    let okCount = 0;
    variants.forEach((text, index) => {
      const result = docResult.normalizeDocumentationResult(text);
      if (!result.ok) {
        assert.strictEqual(result.normalizedText, null, `Variante ${index}: ein abgelehntes Ergebnis liefert keinen Text`);
        return;
      }
      okCount += 1;
      assert.ok(
        result.normalizedText.length <= docResult.DOCUMENTATION_RESULT_NORMALIZED_MAX_CHARS,
        `Variante ${index}: ${result.normalizedText.length} Zeichen überschreiten das Budget`,
      );
      assert.ok(result.normalizedText.length < 6000, `Variante ${index}: die technische Grenze von 6000 Zeichen bleibt unberührt`);
      assert.ok(endsWithSentenceMark(result.normalizedText), `Variante ${index}: Ergebnis endet mitten im Satz`);
      assert.strictEqual(result.metadata.normalizedCharCount, result.normalizedText.length);
      assert.strictEqual(result.metadata.contractVersion, docResult.DOCUMENTATION_RESULT_CONTRACT_VERSION);
      assert.strictEqual(result.metadata.budgetMaxChars, 4500);
    });
    assert.ok(okCount >= variants.length - 1, "nahezu alle Varianten müssen gültig normalisierbar sein");
  });

  await check("die Normalisierung ist idempotent und verändert eine bereits normalisierte Ausgabe nicht mehr", () => {
    const first = docResult.normalizeDocumentationResult(buildValidDocWithRawLength(7684));
    assert.strictEqual(first.ok, true);
    const second = docResult.normalizeDocumentationResult(first.normalizedText);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.normalizedText, first.normalizedText);
    assert.strictEqual(second.metadata.droppedItemCount, 0);
    assert.strictEqual(second.metadata.droppedSentenceCount, 0);
    assert.strictEqual(second.metadata.compactionApplied, false);
  });

  console.log(`pilot-agent-documentation-result.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-documentation-result.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
