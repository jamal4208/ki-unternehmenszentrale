"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt I) – Kundenportal-HTTP-Routen.
//
// Kleines, separates Modul (gleiches Muster wie auth-http-routes.js/
// owner-admin-routes.js). Beide Routen sind reine GET-Lesezugriffe ohne
// Body; CSRF/Origin sind für GET nicht anwendbar (siehe auth-route-guard.js
// – Origin-/CSRF-Prüfung greift ausschließlich bei "unsafe methods").
// Tenant und Rolle kommen ausschließlich aus `context.identity`
// (bereits durch den Auth-Route-Guard gegen die Session validiert) –
// niemals aus Query oder Body (Auftrag Abschnitt O).

const customerPortalService = require("./customer-portal-service");

function handleGetPortalMe(res, context, deps) {
  const { getDb, sendJson } = deps;
  const me = customerPortalService.getMe(getDb(), context.identity);
  if (!me) {
    sendJson(res, 404, { ok: false, message: "Nicht gefunden." });
    return;
  }
  sendJson(res, 200, { ok: true, ...me });
}

function handleGetPortalStatus(res, context, deps) {
  const { sendJson } = deps;
  sendJson(res, 200, { ok: true, ...customerPortalService.getStatus() });
}

module.exports = {
  handleGetPortalMe,
  handleGetPortalStatus,
};
