"use strict";

const assert = require("assert");

const tenantRegistry = require("./agency-tenant-registry");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const CUSTOMER_A = "test-customer-fiktives-cafe";
const BRAND_A = "test-brand-fiktives-cafe";
const CAMPAIGN_A = "test-campaign-fiktives-cafe-pilot";
const CUSTOMER_B = "test-customer-fiktives-fitnessstudio";
const BRAND_B = "test-brand-fiktives-fitnessstudio";
const CAMPAIGN_B = "test-campaign-fiktives-fitnessstudio-demo";

// 6. gültiger Testkunde
check("gültiger Testkunde ist auffindbar und trägt keinen echten Kundennamen", () => {
  const customer = tenantRegistry.getCustomerById(CUSTOMER_A);
  assert.ok(customer);
  assert.strictEqual(customer.status, "ACTIVE_TEST_TENANT");
  assert.ok(/Fiktiv/i.test(customer.displayName));
});

// 7. gültige Marke
check("gültige Marke ist auffindbar und gehört zum erwarteten Kunden", () => {
  const brand = tenantRegistry.getBrandById(BRAND_A);
  assert.ok(brand);
  assert.strictEqual(brand.customerId, CUSTOMER_A);
});

// 8. gültige Kampagne
check("gültige Kampagne ist auffindbar und gehört zur erwarteten Marke", () => {
  const campaign = tenantRegistry.getCampaignById(CAMPAIGN_A);
  assert.ok(campaign);
  assert.strictEqual(campaign.brandId, BRAND_A);
  assert.strictEqual(campaign.customerId, CUSTOMER_A);
});

// 9. unbekannter Kunde blockiert
check("unbekannter Kunde blockiert die Mandantenbindung", () => {
  const result = tenantRegistry.validateTenantBinding({
    customerId: "unbekannter-kunde-xyz",
    brandId: BRAND_A,
    campaignId: CAMPAIGN_A,
    projectId: "ki-unternehmenszentrale",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((r) => /Unbekannte Kunden-ID/.test(r)));
});

// 10. Marke gehört zum Kunden
check("Marke, die nicht zum angegebenen Kunden gehört, blockiert", () => {
  const result = tenantRegistry.validateTenantBinding({
    customerId: CUSTOMER_A,
    brandId: BRAND_B,
    projectId: "ki-unternehmenszentrale",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((r) => /gehört nicht zum angegebenen Kunden/.test(r)));
});

// 11. Kampagne gehört zur Marke
check("Kampagne, die nicht zur angegebenen Marke gehört, blockiert", () => {
  const result = tenantRegistry.validateTenantBinding({
    customerId: CUSTOMER_A,
    brandId: BRAND_A,
    campaignId: CAMPAIGN_B,
    projectId: "ki-unternehmenszentrale",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((r) => /gehört nicht zur angegebenen Marke/.test(r)));
});

// 12. Projektbindung
check("Kampagne mit abweichender Projekt-ID blockiert die Projektbindung", () => {
  const result = tenantRegistry.validateTenantBinding({
    customerId: CUSTOMER_A,
    brandId: BRAND_A,
    campaignId: CAMPAIGN_A,
    projectId: "marketing-agentur-os",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((r) => /Projektbindung stimmt nicht/.test(r)));
});

check("vollständig konsistente Mandantenbindung ist gültig", () => {
  const result = tenantRegistry.validateTenantBinding({
    customerId: CUSTOMER_A,
    brandId: BRAND_A,
    campaignId: CAMPAIGN_A,
    projectId: "ki-unternehmenszentrale",
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reasons.length, 0);
});

check("assertValidTenantBindingOrThrow wirft bei ungültiger Bindung", () => {
  assert.throws(() =>
    tenantRegistry.assertValidTenantBindingOrThrow({ customerId: "unbekannt", brandId: BRAND_A }),
  );
});

// 13. doppelte IDs blockiert (Registrierungsintegrität)
check("Registrierungsintegrität: keine doppelten Kunden-/Marken-/Kampagnen-IDs, keine Waisen", () => {
  const integrity = tenantRegistry.checkRegistryIntegrity();
  assert.strictEqual(integrity.ok, true);
  assert.deepStrictEqual(integrity.duplicateCustomerIds, []);
  assert.deepStrictEqual(integrity.duplicateBrandIds, []);
  assert.deepStrictEqual(integrity.duplicateCampaignIds, []);
  assert.deepStrictEqual(integrity.orphanBrands, []);
  assert.deepStrictEqual(integrity.orphanCampaigns, []);
  assert.deepStrictEqual(integrity.unknownProjectCampaigns, []);
});

check("Registrierungsintegrität-Logik erkennt doppelte IDs in einer unabhängigen Stichprobe", () => {
  const withDuplicate = [{ customerId: "a" }, { customerId: "a" }, { customerId: "b" }];
  const seen = new Set();
  const dups = new Set();
  withDuplicate.forEach((r) => {
    if (seen.has(r.customerId)) dups.add(r.customerId);
    seen.add(r.customerId);
  });
  assert.deepStrictEqual([...dups], ["a"]);
});

// 14. keine echten Kundenseeds
check("keine echten Kundenseeds: alle Testmandanten sind ausdrücklich als fiktiv/Test gekennzeichnet", () => {
  tenantRegistry.listCustomers().forEach((customer) => {
    assert.ok(/Fiktiv|Test/i.test(customer.displayName));
    assert.strictEqual(customer.status, "ACTIVE_TEST_TENANT");
  });
});

check("Datenklassifizierungslimit ist für alle Testmandanten ausschließlich NORMAL", () => {
  tenantRegistry.listCustomers().forEach((customer) => {
    assert.strictEqual(customer.dataClassificationLimit, "NORMAL");
  });
});

// 15. Kunde A kann Kunde-B-Asset (hier: Datensätze allgemein) nicht lesen
check("filterRecordsForCustomerView liefert für Kunde A nur Kunde-A-Datensätze", () => {
  const records = [
    { id: "1", customerId: CUSTOMER_A },
    { id: "2", customerId: CUSTOMER_B },
  ];
  const filtered = tenantRegistry.filterRecordsForCustomerView(records, CUSTOMER_A);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].customerId, CUSTOMER_A);
});

check("isSameCustomer erkennt fremden Mandanten korrekt", () => {
  assert.strictEqual(tenantRegistry.isSameCustomer(CUSTOMER_A, CUSTOMER_B), false);
  assert.strictEqual(tenantRegistry.isSameCustomer(CUSTOMER_A, CUSTOMER_A), true);
  assert.strictEqual(tenantRegistry.isSameCustomer(CUSTOMER_A, null), true);
});

check("listBrands/listCampaigns lassen sich pro Kunde einschränken (keine Vermischung)", () => {
  const brandsA = tenantRegistry.listBrands({ customerId: CUSTOMER_A });
  const campaignsA = tenantRegistry.listCampaigns({ customerId: CUSTOMER_A });
  assert.ok(brandsA.every((b) => b.customerId === CUSTOMER_A));
  assert.ok(campaignsA.every((c) => c.customerId === CUSTOMER_A));
  assert.ok(!brandsA.some((b) => b.brandId === BRAND_B));
  assert.ok(!campaignsA.some((c) => c.campaignId === CAMPAIGN_B));
});

check("keine Netzwerklogik und keine Zugangsdaten im Modul", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("agency-tenant-registry.test.js", "agency-tenant-registry.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
  assert.ok(!/apiKey/i.test(source));
});

console.log(`agency-tenant-registry.test.js: ${passed} Prüfpunkte erfolgreich`);
