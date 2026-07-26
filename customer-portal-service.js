"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt I) – Kundenportal: reine
// Geschäftslogik. Kennt weder HTTP noch Request-/Response-Objekte. Erhält
// ausschließlich die bereits vom Auth-Route-Guard validierte `identity`
// (siehe auth-route-guard.js) – niemals rohe Query-/Body-Werte des Browsers
// (Auftrag Abschnitt O: "keine Query-/Body-Tenantquelle").
//
// Persistenz ausschließlich über auth-db.js; dieses Modul importiert
// NIEMALS better-sqlite3 selbst.

const authDb = require("./auth-db");
const authHttpRoutes = require("./auth-http-routes");

const ACCOUNT_STATUS_LABELS = Object.freeze({
  ACTIVE: "Aktiv",
  INVITED: "Einladung ausstehend",
  LOCKED: "Vorübergehend gesperrt",
  DISABLED: "Gesperrt",
});

function accountStatusLabel(status) {
  return ACCOUNT_STATUS_LABELS[status] || "Unbekannt";
}

// GET /api/portal/me – Auftrag Abschnitt I: ausschließlich diese sechs
// Felder, keine IDs, keine technischen Codes, keine anderen Benutzer.
function getMe(db, identity) {
  const user = authDb.getUserById(db, identity.userId);
  if (!user) return null;
  return {
    displayName: user.displayName,
    email: user.emailNormalized,
    roleLabel: authHttpRoutes.roleLabel(user.role),
    tenantDisplayName: identity.tenantDisplayName,
    accountStatusLabel: accountStatusLabel(user.status),
    lastLoginAt: user.lastLoginAt || null,
  };
}

// GET /api/portal/status – Auftrag Abschnitt I: statischer, ehrlicher
// Bereitschaftsstatus. In Phase A Schritt 3 sind Fachaufträge, Veröffent-
// lichung und Billing bewusst noch nicht verfügbar (Auftrag Ziel 7).
function getStatus() {
  return {
    portalReady: true,
    workOrdersEnabled: false,
    publicationEnabled: false,
    billingEnabled: false,
    statusMessage: "Ihr Kundenbereich ist eingerichtet. Aktuell sind noch keine Arbeitsaufträge freigeschaltet.",
  };
}

module.exports = {
  accountStatusLabel,
  getMe,
  getStatus,
};
