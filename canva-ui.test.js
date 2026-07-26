"use strict";

// V7.1 Phase C – Struktur-/Sicherheitsprüfung des Canva-Designpilotbereichs
// in v71-ui.js/index.html/styles.css (Auftrag Abschnitt N). v71-ui.js ist
// ein reines Browser-IIFE ohne module.exports (siehe heygen-ui.test.js für
// dasselbe etablierte Muster); Struktureigenschaften werden daher per
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

check("Navigationseintrag 'Canva-Designpilot' ist additiv vorhanden", () => {
  assert.ok(/data-view="v71-canva"/.test(htmlSource));
  assert.ok(/Canva-Designpilot/.test(htmlSource));
});

check("Canva-View-Sektion und Output-Container sind additiv vorhanden", () => {
  assert.ok(/id="v71-canva-view"/.test(htmlSource));
  assert.ok(/id="v71-canva-output"/.test(htmlSource));
});

check("bestehende V7.1-Navigation (Dokumente/Tools/Plugin-Gateway/HeyGen-Pilot) bleibt unverändert vorhanden", () => {
  ["v71-documents", "v71-tools", "v71-plugin-gateway", "v71-heygen"].forEach((view) => {
    assert.ok(htmlSource.includes(`data-view="${view}"`), `${view} fehlt`);
  });
});

// 83. keine verbotenen Buttons.
check("83. Kein Button 'Veröffentlichen' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Veröffentlichen\s*</.test(uiSource));
});
check("83. Kein Button 'Öffentlich teilen' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Öffentlich teilen\s*</.test(uiSource));
});
check("83. Kein Button 'Kunden zu Canva einladen' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Kunden zu Canva einladen\s*</.test(uiSource));
});
check("83. Kein Button 'Design löschen' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Design löschen\s*</.test(uiSource));
});
check("83. Kein Button 'Credits kaufen' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Credits kaufen\s*</.test(uiSource));
});
check("83. Kein Button 'Alles freigeben' im Canva-Pilotbereich", () => {
  assert.ok(!/>\s*Alles freigeben\s*</.test(uiSource));
  assert.ok(!/approve-all|approveAll/i.test(uiSource.match(/renderCanvaView[\s\S]*?container\.querySelectorAll\("\[data-canva-action\]"\)[\s\S]*?\}\);\s*\}\);/)?.[0] || ""));
});

check("Primäraktionen entsprechen den in Abschnitt N vorgesehenen Buttons", () => {
  [
    "Designauftrag vorbereiten",
    "Briefing freigeben",
    "Assets und Rechte freigeben",
    "Externe Verarbeitung bestätigen",
    "Kostenrahmen bestätigen",
    "Canva-Übergabe freigeben",
  ].forEach((label) => {
    assert.ok(uiSource.includes(label), `Primäraktion "${label}" fehlt`);
  });
});

// 81/82. klare, getrennte Freigabestufen statt Sammelfreigabe.
check("81/82. getrennte Freigabeschritte werden über getrennte Routen ausgelöst (keine Sammelfreigabe)", () => {
  assert.ok(uiSource.includes("/api/v71/canva/job-package/approve-briefing"));
  assert.ok(uiSource.includes("/api/v71/canva/job-package/approve-assets-and-rights"));
  assert.ok(uiSource.includes("/api/v71/canva/job-package/approve-external-transfer"));
  assert.ok(uiSource.includes("/api/v71/canva/job-package/approve-cost"));
});

check("Veröffentlichung wird im UI-Text ausdrücklich als eigene, spätere Freigabe dargestellt", () => {
  assert.ok(uiSource.includes("Veröffentlichung bleibt immer eine eigene, spätere Freigabe"));
});

check("UI zeigt klare Kennzeichnungen: kontrollierte Übergabe, externe Verarbeitung, Testmandant, nicht abrechenbarer Pilot, nicht veröffentlicht, Canva-Konto intern, kein Canva-Zugang", () => {
  [
    "kontrollierte Übergabe",
    "externe Verarbeitung",
    "Testmandant",
    "nicht abrechenbarer Pilot",
    "nicht veröffentlicht",
    "Canva-Konto intern",
    "Kunde hat keinen Canva-Zugang",
  ].forEach((label) => {
    assert.ok(uiSource.includes(label), `Kennzeichnung "${label}" fehlt`);
  });
});

check("technische Details sind einklappbar (details/summary), keine Textwand", () => {
  assert.ok(/Canva-Verbindungsstatus[\s\S]*?<details class="v71-details">/.test(uiSource));
});

check("Hand-off-Aktion verweist im UI-Text ausdrücklich auf 'noch nicht gestartet'", () => {
  assert.ok(/Ausführung noch nicht gestartet/.test(uiSource));
});

check("kein API-Key-/Zugangsdaten-Eingabefeld im Canva-Pilotbereich", () => {
  assert.ok(!/id="v71-canva-api-key"/.test(uiSource));
  assert.ok(!/apiKey|API-Key/i.test(uiSource.match(/renderCanvaView[\s\S]*?container\.querySelectorAll/)?.[0] || ""));
});

// 94. Mobile/kein Überlauf: dieselben, bereits mobilgetesteten CSS-Klassen
// werden wiederverwendet statt neuer, ungetesteter Layoutklassen.
check("94. Canva-Pilotbereich nutzt dieselben, bereits mobilgeprüften Layoutklassen (kein neues, ungetestetes Layout)", () => {
  ["v71-card", "v71-form", "form-grid", "button-row", "v71-tag-row", "v71-details"].forEach((cls) => {
    assert.ok(uiSource.includes(cls), `Klasse ${cls} wird im Canva-Bereich nicht wiederverwendet`);
  });
});

check("Formularfelder im Prepare-Formular sind kompakt begrenzt (maxlength gesetzt), keine unbegrenzte Textwand", () => {
  assert.ok(/id="v71-canva-title" maxlength="200"/.test(uiSource));
  assert.ok(/id="v71-canva-brief" rows="3" maxlength="4000"/.test(uiSource));
});

// Mandantenfelder sichtbar (Kunde/Marke/Kampagne) je Jobpaket.
check("Mandantenfelder (Kunde/Marke/Kampagne) sind je Jobpaket-Karte sichtbar", () => {
  assert.ok(uiSource.includes("canvaTenantRow"));
  assert.ok(/Kunde:\s*\$\{escapeHtml\(pkg\.customerId/.test(uiSource));
  assert.ok(/Marke:\s*\$\{escapeHtml\(pkg\.brandId/.test(uiSource));
  assert.ok(/Kampagne:\s*\$\{escapeHtml\(pkg\.campaignId/.test(uiSource));
});

check("Kostenstatus (Kostenpaket) ist je Jobpaket sichtbar", () => {
  assert.ok(uiSource.includes("Kostenpaket:"));
  assert.ok(uiSource.includes("CANVA_COST_PACKAGE_LABEL"));
});

check("Jobpaket-Karte zeigt einen 'Nächster Jamal-Schritt'", () => {
  assert.ok(/Nächster Jamal-Schritt[\s\S]*?pkg\.nextAllowedStep/.test(uiSource));
});

check("Prepare-Formular fragt Kunde/Marke/Kampagne aktiv ab (Mandantenbindung ist im UI editierbar, nicht nur Anzeige)", () => {
  assert.ok(uiSource.includes('id="v71-canva-customer"'));
  assert.ok(uiSource.includes('id="v71-canva-brand"'));
  assert.ok(uiSource.includes('id="v71-canva-campaign"'));
  assert.ok(uiSource.includes("/api/v71/agency/customers"));
  assert.ok(uiSource.includes("/api/v71/agency/brands"));
  assert.ok(uiSource.includes("/api/v71/agency/campaigns"));
});

check("Kundenentwurfsfreigabe und Änderungswunsch sind getrennte, eigene Aktionen (keine Sammelfreigabe)", () => {
  assert.ok(uiSource.includes("/api/v71/canva/job-package/approve-customer-draft"));
  assert.ok(uiSource.includes("/api/v71/canva/job-package/request-customer-draft-changes"));
});

check("Status Kandidat/Entwurf/Vorschau/gespeichert sind im UI textlich unterscheidbar", () => {
  assert.ok(uiSource.includes("CANDIDATES_READY"));
  assert.ok(uiSource.includes("Designkandidaten verfügbar"));
  assert.ok(uiSource.includes("DRAFT_EDITING"));
  assert.ok(uiSource.includes("PREVIEW_READY"));
  assert.ok(uiSource.includes("Vorschau bereit (nicht gespeichert)"));
  assert.ok(uiSource.includes("SAVED"));
  assert.ok(uiSource.includes("gespeichert (Providerangabe, nicht veröffentlicht)"));
});

// ---------------------------------------------------------------------------
// Sicherheits-/Fachkorrektur (Fund bei manueller Safari-Abnahme, 25.07.2026):
// "Kundenentwurf freigeben"/"Änderungen anfordern" erschienen fälschlich
// bereits nach einer bloßen Briefingfreigabe, obwohl noch kein Kandidat, kein
// Design und kein Kundenentwurf existierte. Die folgenden Prüfungen
// extrahieren die reine, DOM-freie Gate-Funktion canvaCustomerDraftActions-
// Available(pkg) direkt aus dem Quelltext und werten sie mit new Function(...)
// isoliert aus (kein jsdom, kein neues Test-Framework, gleiches Muster wie
// die übrige Quelltextprüfung dieser Datei).
// ---------------------------------------------------------------------------

const customerDraftGateMatch = uiSource.match(
  /function canvaCustomerDraftActionsAvailable\(pkg\) \{([\s\S]*?)\n {2}\}/,
);

check("canvaCustomerDraftActionsAvailable(pkg) ist als eigene, testbare Gate-Funktion vorhanden", () => {
  assert.ok(customerDraftGateMatch, "canvaCustomerDraftActionsAvailable wurde im Quelltext nicht gefunden");
});

const canvaCustomerDraftActionsAvailable = new Function("pkg", customerDraftGateMatch[1]);

check("die alte, unsichere Einzelbedingung (nur briefingApproved) gilt nicht mehr als Sichtbarkeitsregel", () => {
  assert.ok(
    !/canvaCustomerDraftActionsAvailable[\s\S]{0,400}pkg\.briefingApproved === true/.test(uiSource) &&
      !uiSource.includes('if (pkg.briefingApproved === true && pkg.customerDraftApprovalStatus !== "APPROVED")'),
  );
});

check("canvaActionButtons ruft für die Kundenentwurfsaktionen ausschließlich canvaCustomerDraftActionsAvailable(pkg) auf", () => {
  assert.ok(uiSource.includes('if (canvaCustomerDraftActionsAvailable(pkg) && pkg.customerDraftApprovalStatus !== "APPROVED")'));
});

function baseCanvaPackage(overrides) {
  return {
    jobPackageId: "canva-job-test",
    customerId: "test-customer-fiktives-cafe",
    brandId: "test-brand-fiktives-cafe",
    campaignId: "test-campaign-fiktives-cafe-pilot",
    status: "DRAFT",
    briefingApproved: false,
    assetsAndRightsApproved: false,
    externalTransferApproved: false,
    internalCostApprovalStatus: "UNKNOWN",
    selectedCandidateId: null,
    customerDraftApprovalStatus: "PENDING",
    ...overrides,
  };
}

// 1. DRAFT.
check("1. Kundenentwurfsbuttons fehlen bei DRAFT", () => {
  assert.strictEqual(canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "DRAFT" })), false);
});

// 2. READY_FOR_REVIEW.
check("2. Kundenentwurfsbuttons fehlen bei READY_FOR_REVIEW", () => {
  assert.strictEqual(canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "READY_FOR_REVIEW" })), false);
});

// 3. nur eine Briefing-Freigabe (der ursprüngliche Fehlerfund).
check("3. Kundenentwurfsbuttons fehlen nach nur einer Briefing-Freigabe", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "READY_FOR_REVIEW", briefingApproved: true })),
    false,
  );
});

// 4. APPROVED_FOR_HANDOFF.
check("4. Kundenentwurfsbuttons fehlen bei APPROVED_FOR_HANDOFF", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "APPROVED_FOR_HANDOFF", briefingApproved: true })),
    false,
  );
});

// 5. HANDED_OFF ohne Providerergebnis.
check("5. Kundenentwurfsbuttons fehlen bei HANDED_OFF ohne Providerergebnis", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "HANDED_OFF", briefingApproved: true })),
    false,
  );
});

// 6. CANDIDATES_READY ohne Kandidatenauswahl.
check("6. Kundenentwurfsbuttons fehlen bei CANDIDATES_READY ohne Kandidatenauswahl", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(baseCanvaPackage({ status: "CANDIDATES_READY", selectedCandidateId: null })),
    false,
  );
});

// 7. ohne Design-ID (hier: selectedCandidateId fehlt trotz sonst passendem Status).
check("7. Kundenentwurfsbuttons fehlen ohne ausgewählten Kandidaten/Design-Bezug", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(
      baseCanvaPackage({ status: "READY_FOR_CUSTOMER_REVIEW", selectedCandidateId: null }),
    ),
    false,
  );
});

// 8. ohne validierte Mandantenbindung.
check("8. Kundenentwurfsbuttons fehlen ohne vollständige Mandantenbindung", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(
      baseCanvaPackage({ status: "READY_FOR_CUSTOMER_REVIEW", selectedCandidateId: "cand-1", customerId: null }),
    ),
    false,
  );
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(
      baseCanvaPackage({ status: "READY_FOR_CUSTOMER_REVIEW", selectedCandidateId: "cand-1", brandId: "" }),
    ),
    false,
  );
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(
      baseCanvaPackage({ status: "READY_FOR_CUSTOMER_REVIEW", selectedCandidateId: "cand-1", campaignId: undefined }),
    ),
    false,
  );
});

// 9. erscheinen erst bei READY_FOR_CUSTOMER_REVIEW mit vollständigen Voraussetzungen.
check("9. Kundenentwurfsbuttons erscheinen erst bei READY_FOR_CUSTOMER_REVIEW mit ausgewähltem Kandidaten und vollständiger Mandantenbindung", () => {
  assert.strictEqual(
    canvaCustomerDraftActionsAvailable(
      baseCanvaPackage({ status: "READY_FOR_CUSTOMER_REVIEW", selectedCandidateId: "cand-1", briefingApproved: true }),
    ),
    true,
  );
});

// 10. "Änderungen anfordern" ist an dieselbe Bedingung gebunden wie "Kundenentwurf freigeben".
check('10. "Änderungen anfordern" ist an dieselbe Sichtbarkeitsbedingung gebunden wie "Kundenentwurf freigeben"', () => {
  const buttonBlockMatch = uiSource.match(
    /if \(canvaCustomerDraftActionsAvailable\(pkg\) && pkg\.customerDraftApprovalStatus !== "APPROVED"\) \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(buttonBlockMatch, "gemeinsamer Bedingungsblock für beide Kundenentwurfsbuttons nicht gefunden");
  assert.ok(buttonBlockMatch[1].includes('data-canva-action="approve-customer-draft"'));
  assert.ok(buttonBlockMatch[1].includes('data-canva-action="request-customer-draft-changes"'));
});

// 11. Veröffentlichung bleibt weiterhin separat und blockiert (Bestandsschutz).
check("11. Veröffentlichung bleibt von der Kundenentwurfskorrektur unberührt: weiterhin separat und blockiert", () => {
  assert.ok(uiSource.includes("Veröffentlichung bleibt immer eine eigene, spätere Freigabe"));
  assert.ok(!/data-canva-action="publish"/.test(uiSource));
});

// 12. bestehende Canva-Freigabestufen (Briefing/Assets/Transfer/Kosten) bleiben unverändert.
check("12. bestehende Freigabelogik für Briefing/Assets/Rechte/externe Verarbeitung/Kostenrahmen bleibt unverändert", () => {
  assert.ok(uiSource.includes('if (pkg.status === "READY_FOR_REVIEW") {'));
  assert.ok(uiSource.includes("if (!pkg.briefingApproved) {"));
  assert.ok(uiSource.includes("if (!pkg.assetsAndRightsApproved) {"));
  assert.ok(uiSource.includes("if (!pkg.externalTransferApproved) {"));
  assert.ok(uiSource.includes('if (pkg.internalCostApprovalStatus !== "WITHIN_APPROVED_LIMIT") {'));
});

// 13. Mobile ohne Überlauf: keine neue Layoutklasse für den korrigierten Bereich eingeführt.
check("13. Kundenentwurfskorrektur führt keine neue, ungetestete Layoutklasse ein (Mobile bleibt unverändert überlauffrei)", () => {
  const buttonBlockMatch = uiSource.match(
    /if \(canvaCustomerDraftActionsAvailable\(pkg\) && pkg\.customerDraftApprovalStatus !== "APPROVED"\) \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(buttonBlockMatch);
  const classAttributes = buttonBlockMatch[1].match(/class="([^"]*)"/g) || [];
  assert.ok(classAttributes.length === 2, "es werden weiterhin genau zwei Buttons erwartet");
  classAttributes.forEach((attr) => {
    assert.strictEqual(attr, 'class="secondary-button"');
  });
});

console.log(`canva-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
