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

// V7.9.8: derselbe Helfer für JEDE Stufe. Die Abschnittstitel werden aus dem
// Vertrag des Produktivmoduls gelesen, damit ein stiller Vertragsdrift im Test
// sofort auffällt.
//   rawTarget      – trifft die Rohgröße exakt (Auffüllung über einen
//                    zusätzlichen, regelbasiert weggelassenen Punkt),
//   hugeFirstItem  – erzeugt einen einzelnen, unteilbaren Satz dieser Länge.
function buildStageDoc(stage, { rawTarget = 0, hugeFirstItem = 0 } = {}) {
  const contract = docResult.getStageContract(stage);
  const header = (sectionNumber) => `ABSCHNITT ${sectionNumber} ${contract.sectionRules[sectionNumber].title}`;
  const firstItem = hugeFirstItem ? `${"w".repeat(hugeFirstItem - 1)}.` : sentence("Erster belegter Punkt ist nachvollziehbar");
  const base = [
    header(1),
    sentence("Kurzfassung liegt vor"),
    "",
    header(2),
    `1. ${firstItem}`,
    `2. ${sentence("Zweiter belegter Punkt ist nachvollziehbar")}`,
    `3. ${sentence("Dritter belegter Punkt ist nachvollziehbar")}`,
    "",
    header(3),
    `1. ${sentence("Ein Punkt bleibt bestehen")}`,
    `2. ${sentence("Ein zweiter Punkt bleibt bestehen")}`,
    "",
    header(4),
    `1. ${sentence("Erster Vorschlag mit Nutzen und hoher Priorität")}`,
    `2. ${sentence("Zweiter Vorschlag mit Nutzen und mittlerer Priorität")}`,
    `3. ${sentence("Dritter Vorschlag mit Nutzen und niedriger Priorität")}`,
    "",
    header(5),
    sentence("Grundlage ist ausschließlich das tatsächlich gelesene Material"),
  ].join("\n");
  if (!rawTarget) return base;
  const marker = "\n4. ";
  const fillerLength = rawTarget - base.length - marker.length - 1;
  assert.ok(fillerLength > 0, `Zielrohgröße ${rawTarget} ist zu klein für den Basistext`);
  const insertAt = base.indexOf(`\n\n${header(3)}`);
  const text = `${base.slice(0, insertAt)}${marker}${"y".repeat(fillerLength)}.${base.slice(insertAt)}`;
  assert.strictEqual(text.length, rawTarget, "Testhelfer muss die Rohgröße exakt treffen");
  return text;
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

  // -------------------------------------------------------------------
  // V7.9.8 ("Ergebnisbudget für Recherche- und Projektmanager-Stufe
  // technisch erzwingen") – dieselbe Logik, jetzt über drei Stufenverträge.
  // -------------------------------------------------------------------

  await check("V7.9.8: es gibt genau drei Stufenverträge mit identischen Budgets und stufeneigenen Reason Codes", () => {
    assert.deepStrictEqual(Object.keys(docResult.RESULT_CONTRACT_STAGES).sort(), ["DOCUMENTATION", "PROJECT_MANAGER", "RESEARCH"]);
    assert.strictEqual(docResult.STAGE_RESULT_RAW_MAX_CHARS, 12000);
    assert.strictEqual(docResult.STAGE_RESULT_NORMALIZED_MAX_CHARS, 4500);
    assert.strictEqual(docResult.STAGE_RESULT_ITEM_MAX_CHARS, 320);
    const seenReasonCodes = new Set();
    Object.values(docResult.RESULT_CONTRACT_STAGES).forEach((stage) => {
      const contract = docResult.getStageContract(stage);
      assert.strictEqual(contract.stage, stage);
      assert.strictEqual(contract.normalizedMaxChars, 4500);
      assert.strictEqual(contract.rawMaxChars, 12000);
      assert.ok(contract.normalizedMaxChars < 6000, `${stage}: strikt unter der unveränderten technischen Grenze`);
      assert.deepStrictEqual(contract.sectionNumbers.slice(), [1, 2, 3, 4, 5]);
      // Abschnitt 5 ist in KEINEM Vertrag reduzierbar (Herkunft, Grenzen bzw.
      // Empfehlung an Jamal bleiben immer erhalten).
      assert.ok(!contract.reductionOrder.some((entry) => entry.sectionNumber === 5), `${stage}: Abschnitt 5 darf nicht reduziert werden`);
      assert.strictEqual(contract.reductionOrder.length, 4, `${stage}: feste Reduktionsreihenfolge über vier Einträge`);
      [contract.reasonCodes.STRUCTURE_INVALID, contract.reasonCodes.STILL_TOO_LARGE].forEach((reasonCode) => {
        assert.ok(reasonCode, `${stage}: Reason Code fehlt`);
        assert.ok(!seenReasonCodes.has(reasonCode), `Reason Code ${reasonCode} darf nicht doppelt vorkommen`);
        seenReasonCodes.add(reasonCode);
      });
    });
    // Die Dokumentationsstufe aus V7.8.1 bleibt wortgleich erhalten.
    const documentation = docResult.getStageContract(docResult.RESULT_CONTRACT_STAGES.DOCUMENTATION);
    assert.strictEqual(documentation.contractVersion, "V7.8.1-DOC-5-SECTIONS");
    assert.strictEqual(documentation.sectionRules, docResult.DOCUMENTATION_SECTION_RULES);
    assert.strictEqual(documentation.reductionOrder, docResult.DOCUMENTATION_REDUCTION_ORDER);
    assert.throws(() => docResult.getStageContract("UNBEKANNT"), /unbekannter Stufenvertrag/);
  });

  await check("V7.9.8: Recherche- und PM-Vertrag tragen die vorgegebenen Abschnittsnamen und eine eigene Reduktionsreihenfolge", () => {
    assert.strictEqual(docResult.RESEARCH_RESULT_CONTRACT_VERSION, "V7.9.8-RESEARCH-5-SECTIONS");
    assert.deepStrictEqual(
      [1, 2, 3, 4, 5].map((sectionNumber) => docResult.RESEARCH_SECTION_RULES[sectionNumber].title),
      ["KURZFAZIT", "BELEGTE KERNBEFUNDE", "REIBUNGSVERLUSTE", "PRIORISIERTE VERBESSERUNGEN", "GRENZEN UND UNSICHERHEITEN"],
    );
    assert.deepStrictEqual(
      docResult.RESEARCH_REDUCTION_ORDER.map((entry) => `${entry.sectionNumber}:${entry.unit}`),
      ["3:ITEM", "2:ITEM", "1:SENTENCE", "4:ITEM"],
    );
    assert.strictEqual(docResult.PROJECT_MANAGER_RESULT_CONTRACT_VERSION, "V7.9.8-PM-5-SECTIONS");
    assert.deepStrictEqual(
      [1, 2, 3, 4, 5].map((sectionNumber) => docResult.PROJECT_MANAGER_SECTION_RULES[sectionNumber].title),
      ["GESAMTURTEIL", "WICHTIGSTE BELEGTE STAERKEN", "WICHTIGSTE BELEGTE SCHWAECHEN", "PRIORISIERTE ENTSCHEIDUNGEN", "EMPFEHLUNG AN JAMAL"],
    );
    // Bewusst abweichend: eine Entscheidungsvorlage verliert ihre belegten
    // Schwächen und Entscheidungen zuletzt, nicht zuerst.
    assert.deepStrictEqual(
      docResult.PROJECT_MANAGER_REDUCTION_ORDER.map((entry) => `${entry.sectionNumber}:${entry.unit}`),
      ["2:ITEM", "3:ITEM", "1:SENTENCE", "4:ITEM"],
    );
    assert.deepStrictEqual(docResult.RESEARCH_RESULT_REASON_CODES, {
      STRUCTURE_INVALID: "RESEARCH_RESULT_STRUCTURE_INVALID",
      STILL_TOO_LARGE: "RESEARCH_RESULT_STILL_TOO_LARGE",
    });
    assert.deepStrictEqual(docResult.PROJECT_MANAGER_RESULT_REASON_CODES, {
      STRUCTURE_INVALID: "PM_RESULT_STRUCTURE_INVALID",
      STILL_TOO_LARGE: "PM_RESULT_STILL_TOO_LARGE",
    });
  });

  await check("V7.9.8/A+B: alle Rohgrößen von 4501 bis 12000 werden in beiden neuen Stufen sicher auf <= 4500 gebracht", () => {
    [docResult.RESULT_CONTRACT_STAGES.RESEARCH, docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER].forEach((stage) => {
      // 6002 und 7584 sind die beiden belegten Rohgrößen der gescheiterten
      // Praxisläufe (Schritt 3 bzw. Schritt 1).
      [4501, 5000, 6000, 6002, 7584, 9000, 12000].forEach((rawTarget) => {
        const text = buildStageDoc(stage, { rawTarget });
        assert.strictEqual(text.length, rawTarget);
        const result = docResult.normalizeStageResult(stage, text);
        assert.strictEqual(result.ok, true, `${stage}/${rawTarget}: muss akzeptiert werden`);
        assert.ok(result.normalizedText.length <= 4500, `${stage}/${rawTarget}: ${result.normalizedText.length} Zeichen`);
        assert.ok(result.normalizedText.length < 6000, `${stage}/${rawTarget}: die technische Grenze bleibt unberührt`);
        assert.ok(endsWithSentenceMark(result.normalizedText), `${stage}/${rawTarget}: endet mitten im Satz`);
        assert.strictEqual(result.metadata.contractStage, stage);
        assert.strictEqual(result.metadata.rawCharCount, rawTarget);
        assert.strictEqual(result.metadata.storedCharCount, result.normalizedText.length);
        assert.strictEqual(result.metadata.normalizedCharCount, result.normalizedText.length);
        assert.strictEqual(result.metadata.compactionApplied, true);
        assert.strictEqual(result.metadata.budgetMaxChars, 4500);
        assert.ok(result.metadata.droppedItemCount + result.metadata.droppedSentenceCount >= 1, "jede Weglassung ist gezählt");
        // Alle fünf Abschnitte bleiben erhalten – verdichtet wird innerhalb
        // der Abschnitte, niemals durch Weglassen eines ganzen Abschnitts.
        const contract = docResult.getStageContract(stage);
        contract.sectionNumbers.forEach((sectionNumber) =>
          assert.ok(
            result.normalizedText.includes(`ABSCHNITT ${sectionNumber} ${contract.sectionRules[sectionNumber].title}`),
            `${stage}/${rawTarget}: Abschnitt ${sectionNumber} fehlt`,
          ),
        );
      });
    });
  });

  await check("V7.9.8/C: budgetkonforme Antworten der neuen Stufen bleiben byteidentisch – mit und ohne Marker", () => {
    [docResult.RESULT_CONTRACT_STAGES.RESEARCH, docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER].forEach((stage) => {
      const structured = buildStageDoc(stage, {});
      assert.ok(structured.length <= 4500);
      const structuredResult = docResult.normalizeStageResult(stage, structured);
      assert.strictEqual(structuredResult.ok, true);
      assert.strictEqual(structuredResult.normalizedText, structured, `${stage}: strukturierte Antwort muss byteidentisch bleiben`);
      assert.strictEqual(structuredResult.metadata.compactionApplied, false);
      assert.strictEqual(structuredResult.metadata.droppedItemCount, 0);
      assert.strictEqual(structuredResult.metadata.droppedSentenceCount, 0);

      // Rückwärtskompatibilität: ein älteres, markerloses Ergebnis innerhalb
      // des Budgets wird unverändert durchgelassen und als solches
      // gekennzeichnet (structureValid = false, contractFallbackAccepted).
      const markerless = "Kurzbefund ohne Marker. Zweiter Satz ohne Marker.";
      const markerlessResult = docResult.normalizeStageResult(stage, markerless);
      assert.strictEqual(markerlessResult.ok, true);
      assert.strictEqual(markerlessResult.normalizedText, markerless);
      assert.strictEqual(markerlessResult.metadata.structureValid, false);
      assert.strictEqual(markerlessResult.metadata.contractFallbackAccepted, true);
      assert.strictEqual(markerlessResult.metadata.compactionApplied, false);
      assert.strictEqual(markerlessResult.metadata.storedCharCount, markerless.length);
    });
  });

  await check("V7.9.8/D: strukturlose oder unreduzierbar große Texte werden in beiden neuen Stufen mit stufeneigenem Reason Code abgelehnt", () => {
    [docResult.RESULT_CONTRACT_STAGES.RESEARCH, docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER].forEach((stage) => {
      const contract = docResult.getStageContract(stage);

      const structureless = "Ein Satz ohne jede Abschnittsstruktur. ".repeat(200);
      assert.ok(structureless.length > 4500);
      const structurelessResult = docResult.normalizeStageResult(stage, structureless);
      assert.strictEqual(structurelessResult.ok, false);
      assert.strictEqual(structurelessResult.normalizedText, null, `${stage}: es wird nichts abgeschnitten`);
      assert.strictEqual(structurelessResult.reasonCode, contract.reasonCodes.STRUCTURE_INVALID);
      assert.ok(structurelessResult.errorMessage.includes(contract.resultLabel));
      assert.ok(structurelessResult.errorMessage.includes("fehlend: Abschnitt 1, Abschnitt 2, Abschnitt 3, Abschnitt 4, Abschnitt 5"));
      assert.strictEqual(structurelessResult.metadata.structureValid, false);
      assert.strictEqual(structurelessResult.metadata.rawCharCount, structureless.length);

      // Ein einzelner, extrem langer Satz kann nicht reduziert werden, ohne
      // mitten im Satz zu schneiden – deshalb kontrollierte Ablehnung.
      const hugeSentence = docResult.normalizeStageResult(stage, buildStageDoc(stage, { hugeFirstItem: 9000 }));
      assert.strictEqual(hugeSentence.ok, false);
      assert.strictEqual(hugeSentence.normalizedText, null);
      assert.strictEqual(hugeSentence.reasonCode, contract.reasonCodes.STILL_TOO_LARGE);
      assert.ok(hugeSentence.errorMessage.includes("Es wurde nichts abgeschnitten und nichts gespeichert."));
      assert.ok(hugeSentence.metadata.normalizedCharCount > 4500, "die Metadaten belegen die tatsächliche Größe");
    });
  });

  await check("V7.9.8: die Verdichtung der neuen Stufen ist deterministisch und idempotent", () => {
    [docResult.RESULT_CONTRACT_STAGES.RESEARCH, docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER].forEach((stage) => {
      const text = buildStageDoc(stage, { rawTarget: 7584 });
      const first = docResult.normalizeStageResult(stage, text);
      const again = docResult.normalizeStageResult(stage, text);
      assert.strictEqual(first.ok, true);
      assert.strictEqual(again.normalizedText, first.normalizedText, `${stage}: gleiche Eingabe, gleiches Ergebnis`);
      const second = docResult.normalizeStageResult(stage, first.normalizedText);
      assert.strictEqual(second.ok, true);
      assert.strictEqual(second.normalizedText, first.normalizedText, `${stage}: bereits normalisierte Ausgabe bleibt unverändert`);
      assert.strictEqual(second.metadata.compactionApplied, false);
      assert.strictEqual(second.metadata.droppedItemCount, 0);
      assert.strictEqual(second.metadata.droppedSentenceCount, 0);
    });
  });

  await check("V7.9.8: die Verträge sind stufenexklusiv – ein Ergebnis wird niemals mit fremden Abschnittstiteln gespeichert", () => {
    const researchText = buildStageDoc(docResult.RESULT_CONTRACT_STAGES.RESEARCH, { rawTarget: 7584 });
    const researchResult = docResult.normalizeStageResult(docResult.RESULT_CONTRACT_STAGES.RESEARCH, researchText);
    assert.strictEqual(researchResult.ok, true);
    assert.ok(researchResult.normalizedText.includes("ABSCHNITT 1 KURZFAZIT"));
    assert.ok(!researchResult.normalizedText.includes("KURZERGEBNIS"), "kein Dokumentationstitel im Rechercheergebnis");
    assert.ok(!researchResult.normalizedText.includes("GESAMTURTEIL"), "kein PM-Titel im Rechercheergebnis");

    const pmText = buildStageDoc(docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER, { rawTarget: 6002 });
    const pmResult = docResult.normalizeStageResult(docResult.RESULT_CONTRACT_STAGES.PROJECT_MANAGER, pmText);
    assert.strictEqual(pmResult.ok, true);
    assert.ok(pmResult.normalizedText.includes("ABSCHNITT 5 EMPFEHLUNG AN JAMAL"));
    assert.ok(!pmResult.normalizedText.includes("HERKUNFTSHINWEIS"), "kein Dokumentationstitel im PM-Ergebnis");

    // Der eigentliche Ausgangsfehler von V7.9.8: dieselbe Recherchestufe
    // durch den Dokumentationsvertrag geschickt hätte die Abschnitte
    // stillschweigend UMBENANNT. Genau deshalb ist der Vertrag pro Stufe
    // getrennt.
    const wrongContract = docResult.normalizeDocumentationResult(researchText);
    assert.strictEqual(wrongContract.ok, true);
    assert.ok(wrongContract.normalizedText.includes("ABSCHNITT 1 KURZERGEBNIS"));
    assert.ok(!wrongContract.normalizedText.includes("KURZFAZIT"));
  });

  await check("V7.9.8: die Dokumentationsstufe bleibt über normalizeStageResult und normalizeDocumentationResult identisch", () => {
    [buildValidDocWithRawLength(9000), buildValidDocWithRawLength(4400), "Kurz und markerlos.", ""].forEach((text) => {
      const viaStage = docResult.normalizeStageResult(docResult.RESULT_CONTRACT_STAGES.DOCUMENTATION, text);
      const viaLegacy = docResult.normalizeDocumentationResult(text);
      assert.strictEqual(viaStage.ok, viaLegacy.ok);
      assert.strictEqual(viaStage.normalizedText, viaLegacy.normalizedText);
      assert.strictEqual(viaStage.reasonCode, viaLegacy.reasonCode);
      assert.deepStrictEqual(viaStage.metadata, viaLegacy.metadata);
      assert.strictEqual(viaLegacy.metadata.contractVersion, "V7.8.1-DOC-5-SECTIONS");
      assert.strictEqual(viaLegacy.metadata.contractStage, "DOCUMENTATION");
    });
  });

  console.log(`pilot-agent-documentation-result.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-documentation-result.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
