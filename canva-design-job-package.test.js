"use strict";

const assert = require("assert");

const canvaDesignJobPackage = require("./canva-design-job-package");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const TEST_CUSTOMER_ID = "test-customer-fiktives-cafe";
const TEST_BRAND_ID = "test-brand-fiktives-cafe";
const TEST_CAMPAIGN_ID = "test-campaign-fiktives-cafe-pilot";
const OTHER_TEST_CUSTOMER_ID = "test-customer-fiktives-fitnessstudio";
const OTHER_TEST_BRAND_ID = "test-brand-fiktives-fitnessstudio";

function validInstagramPostInput(overrides = {}) {
  return {
    projectId: "ki-unternehmenszentrale",
    customerId: TEST_CUSTOMER_ID,
    brandId: TEST_BRAND_ID,
    campaignId: TEST_CAMPAIGN_ID,
    designOperation: "GENERATE_NEW_DESIGN",
    designType: "INSTAGRAM_POST",
    title: "Café-Sonntagsfrühstück-Post",
    brief: "Ein freundlicher Instagram-Post für das Sonntagsfrühstück im fiktiven Café.",
    primaryMessage: "Genießen Sie unser Sonntagsfrühstück!",
    dataClassification: "NORMAL",
    brandRightsConfirmed: true,
    ...overrides,
  };
}

// 18. gültiger neutraler Instagram-Post-Auftrag
check("gültiger neutraler Instagram-Post-Auftrag wird als DRAFT erzeugt und besteht die Inhaltsprüfung", () => {
  const { ok, package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.strictEqual(ok, true);
  assert.strictEqual(pkg.status, "DRAFT");
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, true);
  assert.strictEqual(validated.package.status, "READY_FOR_REVIEW");
});

check("kanonische Dimensionen werden automatisch für INSTAGRAM_POST gesetzt", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.strictEqual(pkg.dimensions.widthPx, 1080);
  assert.strictEqual(pkg.dimensions.heightPx, 1350);
});

// 19. fehlendes Briefing blockiert
check("fehlendes Briefing blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ brief: "" }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Briefing/.test(r)));
});

// 20. fehlende Botschaft blockiert
check("fehlende Botschaft blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ primaryMessage: "" }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Botschaft/.test(r)));
});

// 21. ungültiger Designtyp blockiert
check("ungültiger Designtyp wird strukturell abgewiesen", () => {
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ designType: "TIKTOK_VIDEO" })));
});

check("POSTER ist gültig, aber im ersten Pilot nicht vorgesehen", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ designType: "POSTER" }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /nicht vorgesehen/.test(r)));
});

// 22/23. SENSITIVE/SECRET blockiert
check("SECRET blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ dataClassification: "SECRET" }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Datenklassifizierung/.test(r)));
});

check("SENSITIVE ist im ersten Pilot ebenfalls blockiert (nur NORMAL erlaubt)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ dataClassification: "SENSITIVE" }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
});

// 24. Gesundheitsdaten blockiert
check("Gesundheitsdaten blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ containsHealthData: true }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Gesundheitsdaten/.test(r)));
});

// 25. Kundendaten im ersten Pilot blockiert
check("Kundendaten blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ containsCustomerData: true }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kundendaten/.test(r)));
});

// 26. Kinderdaten blockiert
check("Daten von Kindern/Minderjährigen blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ containsChildren: true }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kindern/.test(r)));
});

// 27. ungeklärte Assetrechte blockiert
check("ungeklärte Assetrechte blockieren, sobald Assets vorhanden sind", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ sourceAssetReferences: ["asset-1"], assetRightsConfirmed: false }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Assetrechte/.test(r)));

  const { package: pkgConfirmed } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ sourceAssetReferences: ["asset-1"], assetRightsConfirmed: true }),
  );
  const validatedConfirmed = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkgConfirmed);
  assert.strictEqual(validatedConfirmed.ok, true);
});

// 28. ungeklärte Markenrechte blockiert
check("ungeklärte Markenrechte blockieren immer", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ brandRightsConfirmed: false }));
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Markenrechte/.test(r)));
});

// 29. externe Verarbeitung false blockiert (Handoff-Bereitschaft, nicht Inhalt)
check("externe Übertragung false blockiert die Handoff-Bereitschaft", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const { package: validated } = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(draft);
  const briefingApproved = canvaDesignJobPackage.approveBriefingAndText(validated);
  const assetsApproved = canvaDesignJobPackage.approveAssetsAndRights(briefingApproved);
  const costApproved = canvaDesignJobPackage.setInternalCostApproval(assetsApproved, "WITHIN_APPROVED_LIMIT");
  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness(costApproved);
  assert.strictEqual(readiness.ready, false);
  assert.ok(readiness.missing.includes("Externe Übertragung bestätigen"));
});

// 30. Kostenfreigabe fehlt blockiert
check("fehlende Kostenfreigabe blockiert die Handoff-Bereitschaft", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const { package: validated } = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(draft);
  const briefingApproved = canvaDesignJobPackage.approveBriefingAndText(validated);
  const assetsApproved = canvaDesignJobPackage.approveAssetsAndRights(briefingApproved);
  const withTransfer = canvaDesignJobPackage.approveExternalTransfer(assetsApproved);
  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness(withTransfer);
  assert.strictEqual(readiness.ready, false);
  assert.ok(readiness.missing.includes("Kostenrahmen bestätigen"));
});

// 31. Veröffentlichung bleibt false
check("Veröffentlichung bleibt immer PUBLICATION_NOT_APPROVED und kann nicht freigegeben werden", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ publicationApprovalStatus: "PUBLICATION_APPROVED" }),
  );
  assert.strictEqual(pkg.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
  assert.strictEqual(typeof canvaDesignJobPackage.approvePublication, "undefined");
});

// 32. Fingerprintbindung
check("Fingerprintbindung: gleicher Inhalt liefert denselben Fingerprint", () => {
  const { package: pkgA } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const { package: pkgB } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const fpA = canvaDesignJobPackage.computePackageFingerprint(pkgA);
  const fpB = canvaDesignJobPackage.computePackageFingerprint(pkgB);
  assert.strictEqual(fpA, fpB);
  assert.strictEqual(pkgA.packageFingerprint, fpA);
});

// 33. Änderung invalidiert Freigabe
check("Änderung am Briefing invalidiert den Fingerprint (frühere Freigabe wird ungültig)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const originalFingerprint = pkg.packageFingerprint;
  const changed = { ...pkg, brief: "Ein komplett anderer Text." };
  const newFingerprint = canvaDesignJobPackage.computePackageFingerprint(changed);
  assert.notStrictEqual(newFingerprint, originalFingerprint);
  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness({ ...changed, packageFingerprint: originalFingerprint });
  assert.ok(readiness.missing.some((m) => /Fingerprint/.test(m)));
});

// 34. Ablaufzeit
check("abgelaufenes Paket wird als expired erkannt", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
  );
  assert.strictEqual(canvaDesignJobPackage.isPackageExpired(pkg), true);
  const readiness = canvaDesignJobPackage.evaluateHandoffReadiness(pkg);
  assert.ok(readiness.missing.some((m) => /abgelaufen/.test(m)));
});

check("Paket ohne Ablaufzeit-Überschreitung gilt nicht als expired", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.strictEqual(canvaDesignJobPackage.isPackageExpired(pkg), false);
});

check("unbekanntes Projekt wird abgewiesen", () => {
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ projectId: "nicht-vorhanden" })));
});

check("ungültige Agenten-ID wird abgewiesen", () => {
  assert.throws(() =>
    canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ requestingAgentId: "nicht-vorhanden" })),
  );
});

// 35. absolute Pfade blockiert
check("absolute Pfade im Briefing blockieren das Paket", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ brief: "Siehe /Users/jamal/Documents/geheim.txt für Details." }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /pfade/i.test(r)));
});

check("absolute Pfade in sourceAssetReferences blockieren das Paket", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ sourceAssetReferences: ["/etc/passwd"], assetRightsConfirmed: true }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
});

// 36. Credentials blockiert
check("Credential-ähnlicher Text im Briefing blockiert das Paket", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ brief: "Unser Zugang ist sk-1234567890abcdefgh, bitte nutzen." }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Zugangsdaten/.test(r)));
});

check("persönliche Kontaktdaten (E-Mail) im Briefing blockieren das Paket", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ brief: "Schreib uns an kontakt@example.com für mehr Infos." }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kontaktdatum/.test(r)));
});

check("nur GENERATE_NEW_DESIGN ist für den ersten Pilot vorgesehen", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ designOperation: "COPY_EXISTING_DESIGN", sourceDesignReference: { designId: "d-1" } }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /nicht vorgesehen/.test(r)));
});

check("Brand-Template ohne ausdrückliche Auswahl blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ designOperation: "CREATE_FROM_BRAND_TEMPLATE" }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Brand-Template/.test(r)));
});

check("EDIT_EXISTING_DESIGN ohne sourceDesignReference blockiert", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ designOperation: "EDIT_EXISTING_DESIGN" }),
  );
  const validated = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /sourceDesignReference/.test(r)));
});

check("allowedCanvaActions und forbiddenActions sind serverautoritativ (Client-Eingabe wird ignoriert)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(
    validInstagramPostInput({ allowedCanvaActions: ["DELETE_DESIGN"], forbiddenActions: [] }),
  );
  assert.ok(!pkg.allowedCanvaActions.includes("DELETE_DESIGN"));
  assert.ok(pkg.forbiddenActions.includes("DELETE_DESIGN"));
});

check("CANVA_ALWAYS_FORBIDDEN_ACTIONS enthält keine erlaubte Aktion aus dem Pilot-Set", () => {
  const allowed = new Set();
  canvaDesignJobPackage.CANVA_DESIGN_OPERATIONS.forEach((operation) => {
    (canvaDesignJobPackage.ALLOWED_ACTIONS_BY_DESIGN_OPERATION[operation] || []).forEach((a) => allowed.add(a));
  });
  canvaDesignJobPackage.CANVA_ALWAYS_FORBIDDEN_ACTIONS.forEach((forbidden) => {
    assert.ok(!allowed.has(forbidden), `${forbidden} darf nie erlaubt sein`);
  });
});

check("keine Credential-Werte im Modul selbst", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("canva-design-job-package.test.js", "canva-design-job-package.js"), "utf8");
  assert.ok(!/apiKey\s*:\s*["']/i.test(source));
  assert.ok(!/canvaApiKey/i.test(source));
});

check("Auftragspaket enthält keine Netzwerklogik (kein http/https/fetch-Import)", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("canva-design-job-package.test.js", "canva-design-job-package.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

// ---------------------------------------------------------------------------
// Mandantenbindung (Pflichttests 8-17).
// ---------------------------------------------------------------------------

check("fehlende customerId wird strukturell abgewiesen", () => {
  const input = validInstagramPostInput();
  delete input.customerId;
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(input), /customerId fehlt/);
});

check("fehlende brandId wird strukturell abgewiesen", () => {
  const input = validInstagramPostInput();
  delete input.brandId;
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(input), /brandId fehlt/);
});

check("fehlende campaignId wird strukturell abgewiesen", () => {
  const input = validInstagramPostInput();
  delete input.campaignId;
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(input), /campaignId fehlt/);
});

check("unbekannte customerId wird strukturell abgewiesen", () => {
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ customerId: "unbekannt-xyz" })));
});

check("Marke, die nicht zum angegebenen Kunden gehört, wird abgewiesen (falsche Kombination blockiert)", () => {
  assert.throws(() => canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput({ brandId: OTHER_TEST_BRAND_ID })));
});

check("Kampagne mit abweichendem Projekt wird abgewiesen (Projektbindung)", () => {
  assert.throws(() =>
    canvaDesignJobPackage.prepareCanvaDesignJobPackage(
      validInstagramPostInput({
        customerId: OTHER_TEST_CUSTOMER_ID,
        brandId: OTHER_TEST_BRAND_ID,
        campaignId: TEST_CAMPAIGN_ID,
      }),
    ),
  );
});

check("gültiger Auftrag trägt customerId/brandId/campaignId und beeinflusst den Fingerprint (Reassignment blockiert)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.strictEqual(pkg.customerId, TEST_CUSTOMER_ID);
  assert.strictEqual(pkg.brandId, TEST_BRAND_ID);
  assert.strictEqual(pkg.campaignId, TEST_CAMPAIGN_ID);
  const fingerprintWithoutTenantChange = pkg.packageFingerprint;
  const changedTenant = { ...pkg, customerId: OTHER_TEST_CUSTOMER_ID };
  const newFingerprint = canvaDesignJobPackage.computePackageFingerprint(changedTenant);
  assert.notStrictEqual(newFingerprint, fingerprintWithoutTenantChange);
});

check("canvaFolderReference bleibt geplant und ohne echte Ablage (Auftrag Abschnitt J)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.deepStrictEqual(pkg.canvaFolderReference, { status: "PLANNED_NOT_CREATED", reference: null });
});

check("Kundenpaket-/Kostenklassifizierung startet bei UNKNOWN, kann aber explizit auf NOT_BILLABLE_TEST gesetzt werden", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.strictEqual(pkg.costPackageStatus, "UNKNOWN");
  const updated = canvaDesignJobPackage.setCostPackageStatus(pkg, "NOT_BILLABLE_TEST");
  assert.strictEqual(updated.costPackageStatus, "NOT_BILLABLE_TEST");
  assert.throws(() => canvaDesignJobPackage.setCostPackageStatus(pkg, "ERFUNDENER_STATUS"));
});

// 75-78. alle vier Kostenklassifizierungen
check("alle vier Kostenklassifizierungen (75-78) sind gültig setzbar", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  canvaDesignJobPackage.CANVA_COST_PACKAGE_STATUSES.forEach((status) => {
    const updated = canvaDesignJobPackage.setCostPackageStatus(pkg, status);
    assert.strictEqual(updated.costPackageStatus, status);
  });
});

// 79/80. keine automatische Abrechnung, keine erfundenen Preise
check("keine automatische Abrechnungsfunktion existiert im Modul", () => {
  assert.strictEqual(typeof canvaDesignJobPackage.chargeCustomer, "undefined");
  assert.strictEqual(typeof canvaDesignJobPackage.purchaseCredits, "undefined");
});

// ---------------------------------------------------------------------------
// Getrennte Freigabestufen 1-4, 8 (Kundenentwurf).
// ---------------------------------------------------------------------------

// Sicherheits-/Fachkorrektur (Fund bei manueller Safari-Abnahme, 25.07.2026):
// eine bloße Briefingfreigabe allein bedeutet NICHT, dass bereits ein
// mandantengebundener Kundenentwurf existiert. approveCustomerDraft/
// requestCustomerDraftChanges setzen deshalb zusätzlich einen ausgewählten
// Designkandidaten (selectedCandidateId) UND den Status
// READY_FOR_CUSTOMER_REVIEW voraus.
check("Kundenentwurfsfreigabe ist von Veröffentlichung getrennt und setzt einen tatsächlich existierenden Kundenentwurf voraus (Kandidat + READY_FOR_CUSTOMER_REVIEW), nicht nur eine Briefingfreigabe", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const { package: validated } = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(draft);
  assert.strictEqual(validated.customerDraftApprovalStatus, "PENDING");
  assert.throws(() => canvaDesignJobPackage.approveCustomerDraft(validated));

  // Nur Briefing freigegeben (der ursprüngliche Fehlerfund): weiterhin
  // ausdrücklich verweigert, weil noch kein Kandidat/Design/Kundenentwurf
  // existiert.
  const briefingApproved = canvaDesignJobPackage.approveBriefingAndText(validated);
  assert.throws(() => canvaDesignJobPackage.approveCustomerDraft(briefingApproved), /selectedCandidateId fehlt/);

  // Status READY_FOR_CUSTOMER_REVIEW allein (ohne ausgewählten Kandidaten)
  // genügt ebenfalls nicht.
  assert.throws(
    () => canvaDesignJobPackage.approveCustomerDraft({ ...briefingApproved, status: "READY_FOR_CUSTOMER_REVIEW" }),
    /selectedCandidateId fehlt/,
  );

  // Ausgewählter Kandidat allein (ohne den Status READY_FOR_CUSTOMER_REVIEW)
  // genügt ebenfalls nicht.
  assert.throws(
    () => canvaDesignJobPackage.approveCustomerDraft({ ...briefingApproved, selectedCandidateId: "cand-1" }),
    /READY_FOR_CUSTOMER_REVIEW/,
  );

  // Erst mit ausgewähltem Kandidaten UND Status READY_FOR_CUSTOMER_REVIEW
  // existiert fachlich ein Kundenentwurf, der freigegeben werden kann.
  const readyForCustomerReview = { ...briefingApproved, selectedCandidateId: "cand-1", status: "READY_FOR_CUSTOMER_REVIEW" };
  const customerApproved = canvaDesignJobPackage.approveCustomerDraft(readyForCustomerReview);
  assert.strictEqual(customerApproved.customerDraftApprovalStatus, "APPROVED");
  // Kundenentwurfsfreigabe ist ausdrücklich keine Veröffentlichungsfreigabe.
  assert.strictEqual(customerApproved.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
});

// 81/82. keine Sammelfreigabe: jede Freigabestufe ist ein eigener Aufruf mit eigenem Feld
check("keine Sammelfreigabe: Freigabestufen sind getrennte Felder/Funktionen", () => {
  const { package: draft } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  const { package: validated } = canvaDesignJobPackage.validateCanvaDesignJobPackageContent(draft);
  const briefingApproved = canvaDesignJobPackage.approveBriefingAndText(validated);
  assert.strictEqual(briefingApproved.assetsAndRightsApproved, false);
  assert.strictEqual(briefingApproved.externalTransferApproved, false);
  assert.strictEqual(briefingApproved.internalCostApprovalStatus, "UNKNOWN");
  assert.strictEqual(briefingApproved.customerDraftApprovalStatus, "PENDING");
  assert.strictEqual(briefingApproved.publicationApprovalStatus, "PUBLICATION_NOT_APPROVED");
  assert.strictEqual(typeof canvaDesignJobPackage.approveAll, "undefined");
});

check("Kundenänderungswunsch setzt ebenfalls einen tatsächlich existierenden Kundenentwurf voraus (Kandidat + READY_FOR_CUSTOMER_REVIEW)", () => {
  const { package: pkg } = canvaDesignJobPackage.prepareCanvaDesignJobPackage(validInstagramPostInput());
  assert.throws(
    () => canvaDesignJobPackage.requestCustomerDraftChanges(pkg, "Bitte Ton freundlicher formulieren."),
    /selectedCandidateId fehlt/,
  );

  const readyForCustomerReview = { ...pkg, selectedCandidateId: "cand-1", status: "READY_FOR_CUSTOMER_REVIEW" };
  const changed = canvaDesignJobPackage.requestCustomerDraftChanges(readyForCustomerReview, "Bitte Ton freundlicher formulieren.");
  assert.strictEqual(changed.customerDraftApprovalStatus, "CHANGES_REQUESTED");
  assert.strictEqual(changed.customerChangeRequestNote, "Bitte Ton freundlicher formulieren.");
});

console.log(`canva-design-job-package.test.js: ${passed} Prüfpunkte erfolgreich`);
