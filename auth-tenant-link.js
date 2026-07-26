"use strict";

// V7.2 Phase A Schritt 1 – Mandantenanbindung (Auftrag Abschnitt G).
//
// agency-tenant-registry.js bleibt die EINZIGE kanonische Mandantenwahrheit.
// Dieses Modul gleicht die Registry ausschließlich in die betriebliche
// `tenants`-Projektion (auth-db.js) ab. Es legt niemals einen neuen
// Mandanten in der Registry an, verwendet keine Browser- oder
// Requestdaten und bietet keine Reassignment-Funktion. customerId ist und
// bleibt unveränderlich.
//
// Dieses Modul importiert selbst KEIN better-sqlite3 – Persistenz läuft
// ausschließlich über auth-db.js.

const tenantRegistry = require("./agency-tenant-registry");
const authDb = require("./auth-db");

// Sicherer Vorgabewert für neu angelegte Projektionszeilen (Auftrag
// Abschnitt G: "Registry-Mandant ohne Datenbankzeile: als SUSPENDED
// projizieren"). Ein Registry-Mandant, der in Wirklichkeit ein aktiver
// Testmandant ist, erhält trotzdem konservativ SUSPENDED als Startwert –
// serviceTier/reviewMode/status sind ausschließlich betriebliche
// Portal-Vorgabewerte und werden hier bewusst NICHT automatisch aus dem
// geschäftlichen Registry-Status ("ACTIVE_TEST_TENANT"/"INACTIVE")
// abgeleitet.
const DEFAULT_NEW_PROJECTION_STATUS = "SUSPENDED";

function canonicalCustomerExists(customerId) {
  return Boolean(tenantRegistry.getCustomerById(customerId));
}

function assertKnownCustomerId(customerId) {
  if (!canonicalCustomerExists(customerId)) {
    throw new Error(
      `Unbekannte Kunden-ID "${customerId}": kein kanonischer Registry-Mandant. Mandantenanbindung blockiert.`,
    );
  }
}

// Abgleich Registry -> Tenant-Projektion. Legt fehlende Projektionszeilen
// konservativ an, spiegelt displayName für bestehende Zeilen, und bricht
// hart ab, sobald die Datenbank einen Mandanten enthält, der in der
// Registry nicht (mehr) existiert (Auftrag Abschnitt G: "Datenbankzeile
// ohne Registry-Mandant: harter Startfehler"). Keine zweite freie
// Mandantenanlage: jede Projektion ist strikt an einen bestehenden
// Registry-Eintrag gebunden.
function syncTenantProjections(db, options = {}) {
  const now = options.now || new Date().toISOString();
  const canonicalCustomers = tenantRegistry.listCustomers();
  const canonicalIds = new Set(canonicalCustomers.map((customer) => customer.customerId));

  const createdCustomerIds = [];
  const mirroredCustomerIds = [];

  canonicalCustomers.forEach((customer) => {
    const existing = authDb.getTenantProjectionByCustomerId(db, customer.customerId);
    if (!existing) {
      authDb.createTenantProjection(db, {
        customerId: customer.customerId,
        displayName: customer.displayName,
        status: DEFAULT_NEW_PROJECTION_STATUS,
        serviceTier: null,
        reviewMode: null,
        now,
      });
      createdCustomerIds.push(customer.customerId);
      return;
    }
    if (existing.displayName !== customer.displayName) {
      authDb.updateTenantDisplayName(db, customer.customerId, customer.displayName, now);
      mirroredCustomerIds.push(customer.customerId);
    }
  });

  const existingProjections = authDb.listTenantProjections(db);
  const orphanedProjections = existingProjections.filter((row) => !canonicalIds.has(row.customerId));
  if (orphanedProjections.length > 0) {
    const orphanedIds = orphanedProjections.map((row) => row.customerId).join(", ");
    throw new Error(
      `Datenbankmandant(en) ohne Registry-Eintrag gefunden: ${orphanedIds}. ` +
        "agency-tenant-registry.js bleibt die einzige kanonische Mandantenwahrheit; harter Startabbruch.",
    );
  }

  return {
    ok: true,
    createdCustomerIds,
    mirroredCustomerIds,
    canonicalCustomerCount: canonicalCustomers.length,
  };
}

// Liefert die betriebliche Projektion für eine gültige, kanonische
// Kunden-ID. Unbekannte customerId blockiert (wirft), statt eine leere
// oder erfundene Projektion zurückzugeben.
function getTenantProjectionForCustomer(db, customerId) {
  assertKnownCustomerId(customerId);
  return authDb.getTenantProjectionByCustomerId(db, customerId);
}

module.exports = {
  DEFAULT_NEW_PROJECTION_STATUS,
  canonicalCustomerExists,
  assertKnownCustomerId,
  syncTenantProjections,
  getTenantProjectionForCustomer,
};
