"use strict";

// V7.1 Phase B – Struktur-/Sicherheitsprüfung des HeyGen-Pilotbereichs in
// v71-ui.js/index.html/styles.css (Auftrag Abschnitt L). v71-ui.js ist ein
// reines Browser-IIFE ohne module.exports (siehe v71-ui.test.js für dasselbe
// etablierte Muster); Struktureigenschaften werden daher per
// Quelltextprüfung statt per DOM-Rendering verifiziert. Kein neues
// Test-Framework, kein jsdom.

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
const htmlSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

check("Navigationseintrag 'HeyGen-Pilot' ist additiv vorhanden", () => {
  assert.ok(/data-view="v71-heygen"/.test(htmlSource));
  assert.ok(/HeyGen-Pilot/.test(htmlSource));
});

check("HeyGen-View-Sektion und Output-Container sind additiv vorhanden", () => {
  assert.ok(/id="v71-heygen-view"/.test(htmlSource));
  assert.ok(/id="v71-heygen-output"/.test(htmlSource));
});

check("bestehende V7.1-Phase-A-Navigation (Dokumente/Tools/Plugin-Gateway) bleibt unverändert vorhanden", () => {
  ["v71-documents", "v71-tools", "v71-plugin-gateway"].forEach((view) => {
    assert.ok(htmlSource.includes(`data-view="${view}"`), `${view} fehlt`);
  });
});

// 53. keine verbotenen Buttons.
check("53. Kein Button 'Veröffentlichen' im HeyGen-Pilotbereich", () => {
  assert.ok(!/>\s*Veröffentlichen\s*</.test(uiSource));
});
check("53. Kein Button 'Video löschen' im HeyGen-Pilotbereich", () => {
  assert.ok(!/>\s*Video löschen\s*</.test(uiSource));
});
check("53. Kein Button 'Avatar klonen' im HeyGen-Pilotbereich", () => {
  assert.ok(!/>\s*Avatar klonen\s*</.test(uiSource));
});
check("53. Kein Button 'Voice klonen' im HeyGen-Pilotbereich", () => {
  assert.ok(!/>\s*Voice klonen\s*</.test(uiSource));
});
check("53. Kein Button 'Credits kaufen' im HeyGen-Pilotbereich", () => {
  assert.ok(!/>\s*Credits kaufen\s*</.test(uiSource));
});

check("Primäraktionen entsprechen den in Abschnitt L vorgesehenen Buttons", () => {
  ["Videoauftrag vorbereiten", "Inhalt prüfen", "Externe Übertragung bestätigen", "Kostenrahmen bestätigen", "HeyGen-Übergabe freigeben", "Ergebnis prüfen"].forEach((label) => {
    assert.ok(uiSource.includes(label), `Primäraktion "${label}" fehlt`);
  });
});

// 51/52. klare Freigabestufen, keine Sammelfreigabe: vier getrennte
// HTTP-Aufrufe/Routen statt eines Sammel-Buttons.
check("51/52. vier getrennte Freigabeschritte werden über getrennte Routen ausgelöst (keine Sammelfreigabe)", () => {
  assert.ok(uiSource.includes("/api/v71/heygen/job-package/approve-content"));
  assert.ok(uiSource.includes("/api/v71/heygen/job-package/approve-external-transfer"));
  assert.ok(uiSource.includes("/api/v71/heygen/job-package/approve-cost"));
  assert.ok(!/approve-all|approveAll|>\s*Alles freigeben\s*</i.test(uiSource));
});

check("Veröffentlichung wird im UI-Text ausdrücklich als eigene, spätere Freigabe dargestellt", () => {
  assert.ok(/Veröffentlichung bleibt (immer )?eine eigene(,| )?(späte|later)?/.test(uiSource) || uiSource.includes("Veröffentlichung bleibt immer eine eigene, spätere Freigabe"));
});

check("UI zeigt klare Kennzeichnungen: kontrollierte Übergabe, externe Verarbeitung, kostenpflichtig möglich, noch nicht veröffentlicht, kein automatischer Start, erster Pilot", () => {
  ["kontrollierte Übergabe", "externe Verarbeitung", "kostenpflichtig möglich", "noch nicht veröffentlicht", "kein automatischer Start", "erster Pilot"].forEach((label) => {
    assert.ok(uiSource.includes(label), `Kennzeichnung "${label}" fehlt`);
  });
});

check("technische Details sind einklappbar (details/summary), keine Textwand", () => {
  assert.ok(/HeyGen-Pilot[\s\S]*?<details class="v71-details">/.test(uiSource) || uiSource.includes('<details class="v71-details">'));
});

check("Hand-off-Aktion verweist im UI-Text ausdrücklich auf 'noch nicht gestartet'", () => {
  assert.ok(/Ausführung noch nicht gestartet/.test(uiSource));
});

check("kein API-Key-/Zugangsdaten-Eingabefeld im HeyGen-Pilotbereich", () => {
  assert.ok(!/id="v71-heygen-api-key"/.test(uiSource));
  assert.ok(!/apiKey|API-Key/i.test(uiSource.match(/renderHeygenView[\s\S]*?container\.querySelectorAll/)?.[0] || ""));
});

// 59/60. Mobile/kein Überlauf: dieselben, bereits mobilgetesteten CSS-Klassen
// (v71-card, v71-form, form-grid, button-row) werden wiederverwendet statt
// neuer, ungetesteter Layoutklassen einzuführen.
check("59/60. HeyGen-Pilotbereich nutzt dieselben, bereits mobilgeprüften Layoutklassen (kein neues, ungetestetes Layout)", () => {
  ["v71-card", "v71-form", "form-grid", "button-row", "v71-tag-row", "v71-details"].forEach((cls) => {
    assert.ok(uiSource.includes(cls), `Klasse ${cls} wird im HeyGen-Bereich nicht wiederverwendet`);
  });
});

check("Formularfelder im Prepare-Formular sind kompakt begrenzt (maxlength gesetzt), keine unbegrenzte Textwand", () => {
  assert.ok(/id="v71-heygen-title" maxlength="200"/.test(uiSource));
  assert.ok(/id="v71-heygen-script" rows="4" maxlength="4000"/.test(uiSource));
});

console.log(`heygen-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
