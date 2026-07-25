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

// ---------------------------------------------------------------------------
// V7.1 Phase B.1 (Auftrag Abschnitt I) – "HeyGen-Agenturbetrieb ·
// Testmandant" Erweiterung.
// ---------------------------------------------------------------------------

// 48. Testmandant sichtbar.
check("48. UI zeigt 'HeyGen-Agenturbetrieb · Testmandant' als eigenen Bereich", () => {
  assert.ok(uiSource.includes("HeyGen-Agenturbetrieb · Testmandant"));
  assert.ok(uiSource.includes("Testmandant"));
});

// 49/50. kein HeyGen-Kundenzugang, kein Kundenportal behauptet.
check("49/50. UI kennzeichnet ausdrücklich: kein HeyGen-Kundenzugang, kein echtes Kundenportal", () => {
  assert.ok(uiSource.includes("Kunde hat keinen HeyGen-Zugang"));
  assert.ok(uiSource.includes("kein echtes Kundenportal"));
  assert.ok(uiSource.includes("Providerkonto bleibt intern"));
});

// 3/4. Video noch nicht veröffentlicht / erster Pilot nicht abrechenbar.
check("UI kennzeichnet ausdrücklich: Video noch nicht veröffentlicht, erster Pilot nicht abrechenbar", () => {
  assert.ok(uiSource.includes("Video noch nicht veröffentlicht"));
  assert.ok(uiSource.includes("erster Pilot ist nicht abrechenbar"));
});

// 51. keine Veröffentlichungsschaltfläche, auch nicht im neuen Bereich.
check("51. weiterhin kein Veröffentlichungsbutton nach der Testmandant-Erweiterung", () => {
  assert.ok(!/>\s*Veröffentlichen\s*</.test(uiSource));
  assert.ok(!/id="v71-heygen-publish"/.test(uiSource));
});

// 52. Mandantenfelder sichtbar (Kunde/Marke/Kampagne/Projekt) je Jobpaket.
check("52. Mandantenfelder (Kunde/Marke/Kampagne) sind je Jobpaket-Karte sichtbar", () => {
  assert.ok(uiSource.includes("heygenTenantRow"));
  assert.ok(/Kunde:\s*\$\{escapeHtml\(pkg\.customerId/.test(uiSource));
  assert.ok(/Marke:\s*\$\{escapeHtml\(pkg\.brandId/.test(uiSource));
  assert.ok(/Kampagne:\s*\$\{escapeHtml\(pkg\.campaignId/.test(uiSource));
});

// 53. Kostenstatus sichtbar.
check("53. Kostenstatus (Kostenpaket) ist je Jobpaket sichtbar", () => {
  assert.ok(uiSource.includes("Kostenpaket:"));
  assert.ok(uiSource.includes("HEYGEN_COST_PACKAGE_LABEL"));
});

// 54. nächster Jamal-Schritt.
check("54. Testmandant-Panel zeigt einen 'Nächster Jamal-Schritt'", () => {
  assert.ok(uiSource.includes("Nächster Jamal-Schritt"));
});

check("Testmandant-Panel lädt das kanonische Pilot-Review über die additive Agentur-Route", () => {
  assert.ok(uiSource.includes("/api/v71/agency/pilot-review"));
});

check("Kundenentwurfsfreigabe und Änderungswunsch sind getrennte, eigene Aktionen (keine Sammelfreigabe)", () => {
  assert.ok(uiSource.includes("/api/v71/heygen/job-package/approve-customer-draft"));
  assert.ok(uiSource.includes("/api/v71/heygen/job-package/request-customer-draft-changes"));
});

console.log(`heygen-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
