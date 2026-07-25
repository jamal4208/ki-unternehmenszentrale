"use strict";

// Nachbesserung nach manueller Safari-Abnahme von V7.1 Phase A: zwei
// Checkboxen im Tool-Routing-Formular ("externe Übertragung erlaubt",
// "Veröffentlichung erlaubt") wurden durch eine globale Formularregel
// (siehe styles.css, "textarea, input, select { width: 100%; }" sowie
// "input, select { min-height: 42px; padding: 8px 10px; }") in Safari zu
// raumfüllenden, umrandeten Flächen aufgebläht: Beschriftung gequetscht/
// abgeschnitten, optisch nicht eindeutig als "aus" erkennbar.
//
// v71-ui.js ist ein reines Browser-IIFE ohne module.exports (siehe
// Dateikopf); wie bereits bei den Bestandsschutzprüfungen in
// v71-integration.test.js (Prüfpunkte 56/57/60) werden Struktur- und
// Sicherheitseigenschaften deshalb per Quelltextprüfung statt per DOM-
// Rendering verifiziert. Es wird bewusst kein neues Test-Framework/keine
// neue Abhängigkeit (z. B. jsdom) eingeführt.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const uiSource = fs.readFileSync(path.join(__dirname, "v71-ui.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

// 1. beide Checkboxen standardmäßig false (kein checked-Attribut im Markup)
check("Checkbox 'externe Übertragung erlaubt' hat kein checked-Attribut (Standardwert: aus)", () => {
  const match = uiSource.match(/<input type="checkbox" id="v71-routing-external"\s*\/>/);
  assert.ok(match, "Checkbox-Markup für v71-routing-external nicht gefunden");
});

check("Checkbox 'Veröffentlichung erlaubt' hat kein checked-Attribut (Standardwert: aus)", () => {
  const match = uiSource.match(/<input type="checkbox" id="v71-routing-publication"\s*\/>/);
  assert.ok(match, "Checkbox-Markup für v71-routing-publication nicht gefunden");
});

// 2. Label eindeutig mit Checkbox verbunden (doppelt: for/id UND Verschachtelung)
check("Label 'externe Übertragung erlaubt' ist per for/id UND Verschachtelung eindeutig mit der Checkbox verbunden", () => {
  assert.ok(/<label class="v71-checkbox" for="v71-routing-external">/.test(uiSource));
  assert.ok(
    /for="v71-routing-external">\s*<input type="checkbox" id="v71-routing-external"\s*\/>\s*<span class="v71-checkbox-label">externe Übertragung erlaubt<\/span>/.test(
      uiSource,
    ),
  );
});

check("Label 'Veröffentlichung erlaubt' ist per for/id UND Verschachtelung eindeutig mit der Checkbox verbunden", () => {
  assert.ok(/<label class="v71-checkbox" for="v71-routing-publication">/.test(uiSource));
  assert.ok(
    /for="v71-routing-publication">\s*<input type="checkbox" id="v71-routing-publication"\s*\/>\s*<span class="v71-checkbox-label">Veröffentlichung erlaubt<\/span>/.test(
      uiSource,
    ),
  );
});

// 6/7/8/9/10. UI liest die strukturierten Blockierungsfelder aus dem Backend
check("UI rendert bei blockiertem Routing den fachlich geeigneten, aber nicht ausführbaren Kandidaten", () => {
  assert.ok(uiSource.includes("routing.blockedCandidate"));
  assert.ok(uiSource.includes("candidate.connectionStatus"));
});

check("UI zeigt fehlende Freigaben, Kostenstatus und Datenschutzgrenze des blockierten Kandidaten", () => {
  assert.ok(uiSource.includes("candidate.missingApprovals"));
  assert.ok(uiSource.includes("candidate.costStatus"));
  assert.ok(uiSource.includes("candidate.dataClassificationBoundary"));
});

check("UI zeigt Fallback und den nächsten zulässigen Jamal-Schritt bei blockiertem Routing", () => {
  assert.ok(uiSource.includes("candidate.fallback"));
  assert.ok(uiSource.includes("routing.nextAllowedJamalStep"));
});

// 11. UI erfindet bei Blockierung weiterhin keine Ausführung
check("UI zeigt bei blockiertem Routing weiterhin explizit 'kein automatischer Start' und keine externe Aktion", () => {
  assert.ok(/Kein automatischer Start\. Keine externe Übertragung\. Keine Veröffentlichung\. Keine Kostenfreigabe\./.test(uiSource));
});

// 12. Desktop ohne abgeschnittene Labels: feste, kompakte Checkbox-Größe + Textumbruch
check("CSS setzt für .v71-checkbox eine feste, kompakte Checkbox-Größe statt der globalen width:100%-Formularregel", () => {
  const rule = cssSource.match(/\.v71-checkbox input\[type="checkbox"\]\s*\{[^}]*\}/);
  assert.ok(rule, ".v71-checkbox input[type=\"checkbox\"]-Regel fehlt");
  assert.ok(/width:\s*18px/.test(rule[0]), "Checkbox muss eine feste, kompakte Breite erhalten");
  assert.ok(/height:\s*18px/.test(rule[0]), "Checkbox muss eine feste, kompakte Höhe erhalten");
  assert.ok(/flex:\s*0 0 auto/.test(rule[0]), "Checkbox darf im Flex-Layout nicht wachsen/schrumpfen");
  assert.ok(/padding:\s*0/.test(rule[0]), "Checkbox darf nicht die globale 8px/10px-Formularpolsterung erben");
});

check("CSS erlaubt der Checkbox-Beschriftung vollständigen Zeilenumbruch (kein abgeschnittener Text)", () => {
  const rule = cssSource.match(/\.v71-checkbox-label\s*\{[^}]*\}/);
  assert.ok(rule, ".v71-checkbox-label-Regel fehlt");
  assert.ok(/white-space:\s*normal/.test(rule[0]));
  assert.ok(/overflow-wrap:\s*break-word/.test(rule[0]));
  assert.ok(/flex:\s*1 1 auto/.test(rule[0]), "Beschriftung muss den verbleibenden Platz erhalten, nicht die Checkbox");
});

// 13. Mobile ~390x844 ohne Überlauf: neue Regeln erzwingen keine feste Breite
check("neue Checkbox-Regeln erzwingen keine feste Breite, die auf schmalen Bildschirmen zu Überlauf führen könnte", () => {
  const checkboxRule = cssSource.match(/\.v71-checkbox \{[^}]*\}/)[0];
  const labelRule = cssSource.match(/\.v71-checkbox-label\s*\{[^}]*\}/)[0];
  assert.ok(!/(?<!-)width:\s*\d/.test(checkboxRule), ".v71-checkbox darf keine feste Breite erzwingen");
  assert.ok(!/(?<!-)width:\s*\d/.test(labelRule), ".v71-checkbox-label darf keine feste Breite erzwingen");
  assert.ok(/min-width:\s*0/.test(labelRule), ".v71-checkbox-label muss in Flex-/Grid-Kontexten schrumpfen dürfen");
});

check("Checkboxen bleiben innerhalb von .form-grid, das bei schmalen Breiten bereits auf eine Spalte umschaltet", () => {
  assert.ok(/<div class="form-grid">\s*<label class="v71-checkbox" for="v71-routing-external">/.test(uiSource));
});

console.log(`v71-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
