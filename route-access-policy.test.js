"use strict";

// V7.2 Phase A Schritt 2 – Tests für die zentrale Zugriffspolitik
// (route-access-policy.js) und den Auth-Route-Guard (auth-route-guard.js),
// siehe Auftrag Abschnitt N ("Neue Datei route-access-policy.test.js").
//
// Alle HTTP-Aufrufe gegen den echten server.js in dieser Datei laufen mit
// einem isolierten HOME-/KUZ_DATA_DIR-Verzeichnis. Es wird niemals die
// tatsächliche Application-Support-Datenbank des Entwicklungsrechners
// berührt (gleiches Muster wie server-http-router.test.js/auth-db.test.js).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "route-policy-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "route-policy-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const routeAccessPolicy = require("./route-access-policy");
const authRouteGuard = require("./auth-route-guard");
const RouteInventory = require("./route-inventory");
const authHttp = require("./auth-http");
const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const server = require("./server");

const { ACCESS_CLASSES, ERROR_STRATEGIES } = routeAccessPolicy;

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// ---------------------------------------------------------------------------
// Seeding: eine eigene, unabhängige Datenbankverbindung auf dasselbe
// KUZ_DATA_DIR wie server.js (server.js öffnet seine eigene Verbindung erst
// lazy beim ersten Request – siehe server.js#ensureAuthDbReady). WAL-Modus
// erlaubt mehrere gleichzeitige Verbindungen auf dieselbe Datei.
// ---------------------------------------------------------------------------

const seedDb = authDb.openAuthDatabase({ dataDir: KUZ_DATA_DIR }).db;

function makeTenant(customerId, overrides = {}) {
  const existing = authDb.getTenantProjectionByCustomerId(seedDb, customerId);
  if (existing) return existing;
  return authDb.createTenantProjection(seedDb, {
    customerId,
    displayName: overrides.displayName || `Testmandant ${customerId}`,
    status: overrides.status || "ACTIVE",
  });
}

function makeUser(overrides = {}) {
  return authDb.createUser(seedDb, {
    email: overrides.email || `nutzer-${Math.random().toString(36).slice(2)}@example.test`,
    displayName: overrides.displayName || "Testnutzer",
    role: overrides.role || "OWNER",
    tenantId: overrides.tenantId ?? null,
    status: overrides.status || "ACTIVE",
    passwordHash: overrides.passwordHash ?? authPassword.hashPassword("EinSicheresTestpasswort123"),
  });
}

function loginCookiesFor(user) {
  const authSession = require("./auth-session");
  const { token } = authSession.createSession(seedDb, { userId: user.id, now: new Date().toISOString() });
  return `${authHttp.sessionCookieName("dev")}=${token}`;
}

function loginCookiesForMode(user, mode) {
  const authSession = require("./auth-session");
  const { token } = authSession.createSession(seedDb, { userId: user.id, now: new Date().toISOString() });
  return `${authHttp.sessionCookieName(mode)}=${token}`;
}

// ---------------------------------------------------------------------------
// invoke(): ruft server.js#requestHandler mit einem minimalen Mock-req/-res
// auf (gleiches Muster wie server-http-router.test.js), ohne echten Socket.
// ---------------------------------------------------------------------------

function invoke({ method = "GET", url, headers = {}, bodyObj }) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
    let statusCode = null;
    let responseHeaders = {};
    let rawBody = "";
    const req = {
      method,
      url,
      headers: { host: "127.0.0.1", ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      on(event, cb) {
        if (event === "data" && data !== undefined) cb(Buffer.from(data, "utf8"));
        if (event === "end") cb();
      },
      destroy() {},
    };
    const res = {
      setHeader(name, value) {
        responseHeaders[name] = value;
      },
      writeHead(code, hdrs) {
        statusCode = code;
        if (hdrs) Object.assign(responseHeaders, hdrs);
      },
      end(body = "") {
        rawBody += body;
        let json = null;
        try {
          json = rawBody ? JSON.parse(rawBody) : null;
        } catch (_error) {
          json = null;
        }
        resolve({ statusCode, headers: responseHeaders, body: rawBody, json });
      },
    };
    server.requestHandler(req, res);
  });
}

async function run() {
  // -------------------------------------------------------------------
  // 1–4. Jede tatsächlich registrierte Route/jedes Asset ist klassifiziert.
  // Verwendet die tatsächlich in server.js registrierten Maps (Auftrag
  // Abschnitt N: "jede GET-Route/POST-Route/Prefix/statisches Asset
  // klassifiziert") statt einer eigenen, potenziell abweichenden Kopie.
  // -------------------------------------------------------------------

  const policyGetPaths = new Set(routeAccessPolicy.GET_POLICIES.map((entry) => entry.path));
  const policyPostPaths = new Set(routeAccessPolicy.POST_POLICIES.map((entry) => entry.path));
  const policyPrefixPaths = new Set(routeAccessPolicy.PREFIX_POLICIES.map((entry) => entry.path));
  const policyStaticPaths = new Set(routeAccessPolicy.STATIC_POLICIES.map((entry) => entry.path));

  await check("jede tatsächlich registrierte GET-Route ist klassifiziert", () => {
    for (const routePath of server.getRoutes.keys()) {
      assert.ok(policyGetPaths.has(routePath), `GET ${routePath} hat keine Policy`);
    }
  });

  await check("jede tatsächlich registrierte POST-Route ist klassifiziert", () => {
    for (const routePath of server.postRoutes.keys()) {
      assert.ok(policyPostPaths.has(routePath), `POST ${routePath} hat keine Policy`);
    }
  });

  await check("jeder tatsächlich registrierte GET-Prefix-Handler ist klassifiziert", () => {
    for (const entry of server.routePrefixHandlers) {
      assert.ok(policyPrefixPaths.has(entry.prefix), `Prefix ${entry.prefix} hat keine Policy`);
    }
  });

  // V7.2 Phase A Schritt 3 (Auftrag Abschnitt H/M) – seit
  // server-http-router.js#postRoutePrefixHandlers gibt es zusätzlich zu den
  // GET-Prefixen auch POST-Prefixe (Owner-Aktionsrouten mit dynamischem
  // Pfadsegment). Beide Richtungen (Route→Policy und Policy→Route) werden
  // getrennt nach Methode geprüft, weil GET_POLICIES/PREFIX_POLICIES Einträge
  // beider Methoden mischen können.
  await check("jeder tatsächlich registrierte POST-Prefix-Handler ist klassifiziert", () => {
    const policyPostPrefixPaths = new Set(
      routeAccessPolicy.PREFIX_POLICIES.filter((entry) => entry.method === "POST").map((entry) => entry.path),
    );
    for (const entry of server.postRoutePrefixHandlers) {
      assert.ok(policyPostPrefixPaths.has(entry.prefix), `POST-Prefix ${entry.prefix} hat keine Policy`);
    }
  });

  await check("jedes tatsächlich registrierte statische Asset ist klassifiziert", () => {
    for (const assetPath of server.staticAssets.keys()) {
      assert.ok(policyStaticPaths.has(assetPath), `Statisches Asset ${assetPath} hat keine Policy`);
    }
  });

  // -------------------------------------------------------------------
  // 5. Keine doppelte oder widersprüchliche Policy.
  // -------------------------------------------------------------------

  await check("Policy-Tabelle ist strukturell konsistent (keine Duplikate)", () => {
    assert.strictEqual(routeAccessPolicy.validatePolicyTable(routeAccessPolicy.ALL_POLICIES), true);
  });

  await check("ein doppelter Policy-Eintrag wird als Startfehler erkannt", () => {
    const duplicate = routeAccessPolicy.buildEntry(
      "GET",
      routeAccessPolicy.exact("/api/server-status"),
      ACCESS_CLASSES.OWNER_ONLY,
    );
    assert.throws(() => {
      routeAccessPolicy.validatePolicyTable([...routeAccessPolicy.ALL_POLICIES, duplicate]);
    }, /doppelter oder widersprüchlicher Policy-Eintrag/);
  });

  await check("ein Policy-Eintrag mit Wildcard wird abgelehnt", () => {
    assert.throws(() => {
      routeAccessPolicy.validatePolicyTable([
        routeAccessPolicy.buildEntry("GET", routeAccessPolicy.exact("/api/wild*card"), ACCESS_CLASSES.OWNER_ONLY),
      ]);
    }, /Wildcards sind nicht erlaubt/);
  });

  // -------------------------------------------------------------------
  // 6. Keine verwaiste Policy (Rückrichtung von 1–4).
  // -------------------------------------------------------------------

  await check("keine verwaiste GET-Policy (jede Policy hat eine tatsächliche Route)", () => {
    const serverGetPaths = new Set(server.getRoutes.keys());
    for (const entry of routeAccessPolicy.GET_POLICIES) {
      assert.ok(serverGetPaths.has(entry.path), `Policy für GET ${entry.path} hat keine registrierte Route`);
    }
  });

  await check("keine verwaiste POST-Policy (jede Policy hat eine tatsächliche Route)", () => {
    const serverPostPaths = new Set(server.postRoutes.keys());
    for (const entry of routeAccessPolicy.POST_POLICIES) {
      assert.ok(serverPostPaths.has(entry.path), `Policy für POST ${entry.path} hat keine registrierte Route`);
    }
  });

  await check("keine verwaiste Prefix-Policy (GET und POST getrennt geprüft)", () => {
    const serverGetPrefixes = new Set(server.routePrefixHandlers.map((entry) => entry.prefix));
    const serverPostPrefixes = new Set(server.postRoutePrefixHandlers.map((entry) => entry.prefix));
    for (const entry of routeAccessPolicy.PREFIX_POLICIES) {
      const serverPrefixes = entry.method === "POST" ? serverPostPrefixes : serverGetPrefixes;
      assert.ok(
        serverPrefixes.has(entry.path),
        `Policy für ${entry.method}-Prefix ${entry.path} hat keinen registrierten Handler`,
      );
    }
  });

  await check("keine verwaiste statische Policy", () => {
    const serverStaticPaths = new Set(server.staticAssets.keys());
    for (const entry of routeAccessPolicy.STATIC_POLICIES) {
      assert.ok(serverStaticPaths.has(entry.path), `Policy für Asset ${entry.path} hat kein registriertes Asset`);
    }
  });

  // V7.5 – Agentenorganisation, tägliches HR-Coaching und Technologie-/
  // Plugin-Marktradar (Auftrag Abschnitt J/P) – Zuwachs gegenüber der
  // V7.4-Baseline (72/52/8/5/29): fünf neue lesende GET-Routen
  // (/api/agent-leadership/summary, .../organization, .../hr-daily-run,
  // .../technology-radar, .../agent-technology-fit), keine neue exakte
  // POST-Route (alle Führungsaktionen laufen über einen einzigen neuen
  // POST-Prefix /api/agent-leadership/ – eine Aktion je Anfrage über
  // .../:action, siehe agent-leadership-routes.js#Kopfkommentar), keine
  // neue GET-Prefix-Route, ein neuer POST-Prefix und ein neues statisches
  // Chef-UI-Skript (agent-leadership-ui.js).
  //
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt O) – Zuwachs gegenüber
  // der V7.5-Baseline (79/52/8/6/30): V7.6.1 (Auftrag Abschnitt S) ergänzt
  // neun neue lesende GET-Routen (/api/office-finance/summary,
  // .../system-map, .../identities, .../capabilities, .../approval-matrix,
  // .../work-items, .../finance-handoffs, .../authentication-status,
  // .../activation-checklists), keine neue exakte POST-Route (alle
  // schreibenden Office-/Finance-Aktionen laufen über einen neuen
  // POST-Prefix /api/office-finance/), keine neue GET-Prefix-Route und ein
  // neues statisches Asset (office-finance-ui.js). V7.6.3 (Auftrag
  // Abschnitt 13, Health Upgrade Kompass als Referenz-Arbeitslauf) ergänzt
  // eine neue lesende GET-Route (/api/health-reference/status), keine neue
  // exakte POST-Route (alle schreibenden Health-Referenzlauf-Aktionen
  // laufen über einen neuen POST-Prefix /api/health-reference/), keine
  // neue GET-Prefix-Route und ein neues statisches Asset
  // (health-reference-work-run-ui.js). KI-Unternehmenszentrale-Pilotbetrieb
  // (erster produktiver Drei-Agenten-Pilot) ergänzt eine neue lesende
  // GET-Route (/api/pilot-work-order/status), keine neue exakte POST-Route
  // (alle schreibenden Pilotauftrags-Aktionen laufen über einen neuen
  // POST-Prefix /api/pilot-work-order/), keine neue GET-Prefix-Route, einen
  // neuen POST-Prefix und ein neues statisches Asset
  // (pilot-work-order-ui.js).
  // Erwartete Bestandszahlen kommen jetzt ausschließlich aus der kanonischen
  // Quelle route-inventory.js (siehe dort für die vollständige
  // Änderungshistorie je Phase) statt aus lokal hartkodierten Literalen.
  await check("Routenzahlen in Policy und Server sind identisch und entsprechen dem kanonischen Bestand aus route-inventory.js", () => {
    const expected = RouteInventory.EXPECTED_ROUTE_INVENTORY;
    assert.strictEqual(server.getRoutes.size, expected.getRoutes);
    assert.strictEqual(routeAccessPolicy.GET_POLICIES.length, expected.getRoutes);
    assert.strictEqual(server.postRoutes.size, expected.postRoutes);
    assert.strictEqual(routeAccessPolicy.POST_POLICIES.length, expected.postRoutes);
    assert.strictEqual(server.routePrefixHandlers.length, expected.getRoutePrefixes);
    assert.strictEqual(
      routeAccessPolicy.PREFIX_POLICIES.filter((entry) => entry.method === "GET").length,
      expected.getRoutePrefixes,
    );
    assert.strictEqual(server.postRoutePrefixHandlers.length, expected.postRoutePrefixes);
    assert.strictEqual(
      routeAccessPolicy.PREFIX_POLICIES.filter((entry) => entry.method === "POST").length,
      expected.postRoutePrefixes,
    );
    assert.strictEqual(server.staticAssets.size, expected.staticAssets);
    assert.strictEqual(routeAccessPolicy.STATIC_POLICIES.length, expected.staticAssets);
  });

  // -------------------------------------------------------------------
  // 7. Unbekannte Route bleibt fail-closed.
  // -------------------------------------------------------------------

  await check("resolvePolicyForRequest liefert null für eine unbekannte Route", () => {
    assert.strictEqual(routeAccessPolicy.resolvePolicyForRequest("GET", "/api/dies-gibt-es-nicht"), null);
  });

  await check("unbekannte Route liefert im Produktivmodus 404 über den echten Server", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({
        method: "GET",
        url: "/api/dies-gibt-es-nicht",
        headers: { host: "kuz.example.test" },
      });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("decideForPolicy ohne Policy-Objekt liefert fail-closed 404 (NO_POLICY)", () => {
    const decision = authRouteGuard.decideForPolicy({
      policy: null,
      method: "GET",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity: null },
    });
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.statusCode, 404);
    assert.strictEqual(decision.reasonCode, "NO_POLICY");
  });

  // -------------------------------------------------------------------
  // 8/9. Prod ohne Session blockiert Chef-GET/-POST.
  // -------------------------------------------------------------------

  await check("Prod ohne Session blockiert eine Chef-GET-Route (404)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({
        method: "GET",
        url: "/api/server-status",
        headers: { host: "kuz.example.test" },
      });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Prod ohne Session blockiert eine Chef-POST-Route (404)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({
        method: "POST",
        url: "/api/v71/documents/register",
        headers: { host: "kuz.example.test", origin: "https://kuz.example.test", "content-type": "application/json" },
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  // -------------------------------------------------------------------
  // 10. Customer auf Owner-Route → 404 (via echter Session).
  // -------------------------------------------------------------------

  await check("Kundenrolle (CUSTOMER_ADMIN) erreicht eine Owner-Route nicht (404)", async () => {
    const tenant = makeTenant("route-policy-test-customer-a");
    const customer = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenant.id, email: "kunde-a@example.test" });
    const cookie = loginCookiesFor(customer);
    const result = await invoke({
      method: "GET",
      url: "/api/server-status",
      headers: { cookie },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("OWNER-Rolle mit echter Session erreicht die Owner-Route (200)", async () => {
    const owner = makeUser({ role: "OWNER", email: "owner-route-test@example.test" });
    const cookie = loginCookiesFor(owner);
    const result = await invoke({
      method: "GET",
      url: "/api/server-status",
      headers: { cookie },
    });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 11. Support ohne Grant → 404 (synthetische Policy, da Schritt 2 keine
  // reale SUPPORT_GRANT_ONLY-Route besitzt – Auftrag Abschnitt M: "Guard-
  // Infrastruktur vorbereitet und getestet").
  // -------------------------------------------------------------------

  await check("SUPPORT_GRANT_ONLY: SUPPORT-Rolle ohne aktiven Grant wird abgelehnt (404)", () => {
    const supportPolicy = routeAccessPolicy.buildEntry(
      "GET",
      routeAccessPolicy.exact("/api/support/customer-data"),
      ACCESS_CLASSES.SUPPORT_GRANT_ONLY,
    );
    const identity = authRouteGuard.identityFromRealSession(
      { id: "support-user-1", role: "SUPPORT", tenantId: null, displayName: "Support" },
      null,
      { id: "session-1" },
    );
    const decision = authRouteGuard.decideForPolicy({
      policy: supportPolicy,
      method: "GET",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
    });
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.statusCode, 404);
    assert.strictEqual(decision.reasonCode, "NO_SUPPORT_GRANT");
  });

  await check("SUPPORT_GRANT_ONLY existiert als Zugriffsklasse", () => {
    assert.strictEqual(ACCESS_CLASSES.SUPPORT_GRANT_ONLY, "SUPPORT_GRANT_ONLY");
  });

  // -------------------------------------------------------------------
  // 12/13. Execution in Prod deaktiviert, im Dev-Modus nur Owner-/Dev-Regel.
  // -------------------------------------------------------------------

  await check("Execution-Route ist in Prod deaktiviert (404), auch mit Owner-Session", async () => {
    const owner = makeUser({ role: "OWNER", email: "owner-execution-prod@example.test" });
    const cookie = loginCookiesForMode(owner, "prod");
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({
        method: "GET",
        url: "/api/execution/attempts/status?attemptId=x",
        headers: { host: "kuz.example.test", cookie },
      });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Execution-Route ist im Dev-Modus auf Loopback ohne Session per Dev-Bypass erreichbar (nicht 404 wegen fehlender Policy)", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/execution/attempts/status?attemptId=nicht-vorhanden",
      headers: { host: "127.0.0.1" },
    });
    // Route existiert (Policy DISABLED_IN_PROD + Dev-Bypass) – der Handler
    // selbst antwortet mit 404, weil der attemptId nicht existiert (fachliche
    // Antwort), nicht weil das Gate den Zugriff verweigert hätte. Die
    // Unterscheidung erfolgt über den JSON-Body (kein generisches "Nicht
    // gefunden." ohne jede weitere Angabe).
    assert.strictEqual(result.statusCode, 404);
    assert.ok(result.json && typeof result.json.reason === "string");
  });

  await check("Execution-Route im Dev-Modus verweigert einer echten Kundenrolle (kein Dev-Bypass für Kundenrollen)", async () => {
    const tenant = makeTenant("route-policy-test-customer-execution");
    const customer = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: "kunde-exec@example.test" });
    // Kundenrollen dürfen den Dev-Bypass niemals nutzen (Auftrag Abschnitt C:
    // "Kundenrollen und Tenantgrenzen dürfen auch im Dev-Modus niemals
    // umgangen werden"). Eine reale Kundensession auf einer OWNER_ONLY/
    // DISABLED_IN_PROD-Route wird über die Rollenprüfung abgelehnt.
    const cookie = loginCookiesFor(customer);
    const result = await invoke({
      method: "GET",
      url: "/api/execution/attempts/status?attemptId=x",
      headers: { host: "127.0.0.1", cookie },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 14. OWNER erreicht Owner-Route (bereits oben mit echter Session
  // gezeigt) – zusätzlich über den Dev-Bypass ohne jede Session.
  // -------------------------------------------------------------------

  await check("OWNER erreicht eine Owner-Route im Dev-Modus per Dev-Bypass ohne Session", async () => {
    const result = await invoke({ method: "GET", url: "/api/server-status", headers: { host: "127.0.0.1" } });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 15/16/17. Kundenrolle kann Rolle/Tenant über Body/Query nicht
  // manipulieren (Auftrag Abschnitt L, direkt über decideForPolicy/
  // evaluateRouteAccess getestet, da Schritt 2 keine reale
  // CUSTOMER_TENANT-Route besitzt).
  // -------------------------------------------------------------------

  await check("Rolle aus dem Body kann die tatsächliche Session-Rolle nicht überschreiben", () => {
    const tenant = makeTenant("route-policy-test-customer-role-body");
    const customer = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: "kunde-role-body@example.test" });
    const ownerOnlyPolicy = routeAccessPolicy.buildEntry(
      "POST",
      routeAccessPolicy.exact("/api/test/owner-post"),
      ACCESS_CLASSES.OWNER_ONLY,
    );
    const identity = authRouteGuard.identityFromRealSession(customer, tenant, { id: "session-role-body" });
    const decision = authRouteGuard.decideForPolicy({
      policy: ownerOnlyPolicy,
      method: "POST",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
      requestParams: {},
      originOk: true,
      csrfOk: true,
    });
    // Der Body-Wert role="OWNER" (fiktiv) wird von evaluateRouteAccess
    // niemals gelesen oder ausgewertet – die Rolle stammt ausschließlich aus
    // identity.role (aus der Session). Der Zugriff bleibt verweigert, obwohl
    // ein Angreifer role:"OWNER" in den Body geschrieben hätte.
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.reasonCode, "ROLE_DENIED");
  });

  await check("Kundenrolle kann den Mandanten über die Query nicht manipulieren (Mismatch → 404)", () => {
    const tenant = makeTenant("route-policy-test-customer-b1");
    const otherTenant = makeTenant("route-policy-test-customer-b2");
    const customer = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: "kunde-query@example.test" });
    const customerTenantPolicy = routeAccessPolicy.buildEntry(
      "GET",
      routeAccessPolicy.exact("/api/test/customer-tenant"),
      ACCESS_CLASSES.CUSTOMER_TENANT,
    );
    const identity = authRouteGuard.identityFromRealSession(customer, tenant, { id: "session-query" });
    const requestUrl = new URL(`http://127.0.0.1/api/test/customer-tenant?customerId=${otherTenant.customerId}`);
    const requestParams = authRouteGuard.collectRequestTenantParams(requestUrl, undefined);
    const decision = authRouteGuard.decideForPolicy({
      policy: customerTenantPolicy,
      method: "GET",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
      requestParams,
    });
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.statusCode, 404);
    assert.strictEqual(decision.reasonCode, "TENANT_MISMATCH_BLOCKED");
  });

  await check("Kundenrolle kann den Mandanten über den Body nicht manipulieren (Mismatch → 404)", () => {
    const tenant = makeTenant("route-policy-test-customer-c1");
    const otherTenant = makeTenant("route-policy-test-customer-c2");
    const customer = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenant.id, email: "kunde-body@example.test" });
    const customerAdminPolicy = routeAccessPolicy.buildEntry(
      "POST",
      routeAccessPolicy.exact("/api/test/customer-admin-tenant"),
      ACCESS_CLASSES.CUSTOMER_ADMIN_TENANT,
    );
    const identity = authRouteGuard.identityFromRealSession(customer, tenant, { id: "session-body" });
    const requestUrl = new URL("http://127.0.0.1/api/test/customer-admin-tenant");
    const requestParams = authRouteGuard.collectRequestTenantParams(requestUrl, { customerId: otherTenant.customerId });
    const decision = authRouteGuard.decideForPolicy({
      policy: customerAdminPolicy,
      method: "POST",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
      requestParams,
      originOk: true,
      csrfOk: true,
    });
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.statusCode, 404);
    assert.strictEqual(decision.reasonCode, "TENANT_MISMATCH_BLOCKED");
  });

  await check("gleicher (korrekter) Tenantparameter wird akzeptiert, ohne als Quelle verwendet zu werden", () => {
    const tenant = makeTenant("route-policy-test-customer-d");
    const customer = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: "kunde-gleich@example.test" });
    const customerTenantPolicy = routeAccessPolicy.buildEntry(
      "GET",
      routeAccessPolicy.exact("/api/test/customer-tenant-ok"),
      ACCESS_CLASSES.CUSTOMER_TENANT,
    );
    const identity = authRouteGuard.identityFromRealSession(customer, tenant, { id: "session-ok" });
    const requestUrl = new URL(`http://127.0.0.1/api/test/customer-tenant-ok?customerId=${tenant.customerId}`);
    const requestParams = authRouteGuard.collectRequestTenantParams(requestUrl, undefined);
    const decision = authRouteGuard.decideForPolicy({
      policy: customerTenantPolicy,
      method: "GET",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
      requestParams,
    });
    assert.strictEqual(decision.allow, true);
    assert.strictEqual(decision.identity.tenantCustomerId, tenant.customerId);
  });

  // -------------------------------------------------------------------
  // 18. Tenant-Mismatch wird auditiert.
  // -------------------------------------------------------------------

  await check("Tenant-Mismatch wird als TENANT_MISMATCH_BLOCKED auditiert", () => {
    const tenant = makeTenant("route-policy-test-customer-audit-a");
    const otherTenant = makeTenant("route-policy-test-customer-audit-b");
    const customer = makeUser({ role: "CUSTOMER_USER", tenantId: tenant.id, email: "kunde-audit@example.test" });
    const customerTenantPolicy = routeAccessPolicy.buildEntry(
      "GET",
      routeAccessPolicy.exact("/api/test/customer-tenant-audit"),
      ACCESS_CLASSES.CUSTOMER_TENANT,
    );
    const identity = authRouteGuard.identityFromRealSession(customer, tenant, { id: "session-audit" });
    const requestUrl = new URL(`http://127.0.0.1/api/test/customer-tenant-audit?customerId=${otherTenant.customerId}`);
    const requestParams = authRouteGuard.collectRequestTenantParams(requestUrl, undefined);
    const decision = authRouteGuard.decideForPolicy({
      policy: customerTenantPolicy,
      method: "GET",
      mode: "prod",
      isLoopbackHost: false,
      sessionLoadResult: { identity },
      requestParams,
    });
    authRouteGuard.auditDenialIfNeeded(seedDb, decision, new Date().toISOString());
    const authAudit = require("./auth-audit");
    const events = authAudit.listAuditEventsByType(seedDb, "TENANT_MISMATCH_BLOCKED");
    assert.ok(events.some((event) => event.actorUserId === customer.id));
  });

  // -------------------------------------------------------------------
  // 19. Chef-Assets in Prod ohne Owner blockiert.
  // -------------------------------------------------------------------

  await check("Chef-Asset (index.html) ist in Prod ohne Owner-Session blockiert (404)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({ method: "GET", url: "/", headers: { host: "kuz.example.test" } });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Chef-Asset (app.js) ist in Prod ohne Owner-Session blockiert (404)", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const result = await invoke({ method: "GET", url: "/app.js", headers: { host: "kuz.example.test" } });
      assert.strictEqual(result.statusCode, 404);
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  await check("Chef-Asset ist in Dev-Modus lokal per Dev-Bypass erreichbar (Bestandsschutz)", async () => {
    const result = await invoke({ method: "GET", url: "/", headers: { host: "127.0.0.1" } });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 20. V7.2 Phase A Schritt 3 (Auftrag Abschnitt D/G/M) – Portal-/Owner-
  // Verwaltungsassets sind jetzt bewusst registriert und korrekt
  // klassifiziert (Schritt 2 hatte hier ausdrücklich noch keine Portal-UI).
  // -------------------------------------------------------------------

  await check("öffentliche Portal-Einstiegsseiten sind registriert und STATIC_PUBLIC", () => {
    const publicPortalPaths = [
      "/portal/login",
      "/portal/einladung",
      "/portal/passwort-vergessen",
      "/portal/passwort-neu",
      "/portal-auth.js",
      "/portal.css",
    ];
    publicPortalPaths.forEach((assetPath) => {
      assert.strictEqual(server.staticAssets.has(assetPath), true, `${assetPath} nicht registriert`);
      const entry = routeAccessPolicy.resolvePolicyForRequest("GET", assetPath);
      assert.ok(entry, `${assetPath} nicht klassifiziert`);
      assert.strictEqual(entry.accessClass, ACCESS_CLASSES.STATIC_PUBLIC);
    });
  });

  await check("Kundenportal-Startseite/-Skript sind registriert und STATIC_AUTHENTICATED_PORTAL", () => {
    ["/portal", "/portal-ui.js"].forEach((assetPath) => {
      assert.strictEqual(server.staticAssets.has(assetPath), true, `${assetPath} nicht registriert`);
      const entry = routeAccessPolicy.resolvePolicyForRequest("GET", assetPath);
      assert.ok(entry, `${assetPath} nicht klassifiziert`);
      assert.strictEqual(entry.accessClass, ACCESS_CLASSES.STATIC_AUTHENTICATED_PORTAL);
    });
  });

  await check("Owner-Verwaltungsseite/-Skript sind registriert und STATIC_OWNER_ONLY", () => {
    ["/owner/kunden", "/owner-admin.js"].forEach((assetPath) => {
      assert.strictEqual(server.staticAssets.has(assetPath), true, `${assetPath} nicht registriert`);
      const entry = routeAccessPolicy.resolvePolicyForRequest("GET", assetPath);
      assert.ok(entry, `${assetPath} nicht klassifiziert`);
      assert.strictEqual(entry.accessClass, ACCESS_CLASSES.STATIC_OWNER_ONLY);
    });
  });

  await check("Kundenrolle erreicht /portal, aber nicht /owner/kunden (404)", async () => {
    const tenant = makeTenant("route-policy-test-portal-customer");
    const customer = makeUser({ role: "CUSTOMER_ADMIN", tenantId: tenant.id, email: "kunde-portal-asset@example.test" });
    const cookie = loginCookiesFor(customer);
    const portalResult = await invoke({ method: "GET", url: "/portal", headers: { cookie } });
    assert.strictEqual(portalResult.statusCode, 200);
    const ownerResult = await invoke({ method: "GET", url: "/owner/kunden", headers: { cookie } });
    assert.strictEqual(ownerResult.statusCode, 404);
  });

  await check("ohne Session ist /portal blockiert, auch auf Loopback (kein Dev-Bypass für Kundenportal)", async () => {
    const result = await invoke({ method: "GET", url: "/portal", headers: { host: "127.0.0.1" } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT-Rolle erreicht /portal nicht (kein automatischer Kundenportalzugriff)", async () => {
    const support = makeUser({ role: "SUPPORT", tenantId: null, email: "support-portal-asset@example.test" });
    const cookie = loginCookiesFor(support);
    const result = await invoke({ method: "GET", url: "/portal", headers: { cookie } });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 21. Statischer Pfad-Traversal-Schutz bleibt (Bestandsschutz).
  // -------------------------------------------------------------------

  await check("statischer Pfad-Traversal-Schutz bleibt auch mit aktivem Gate bestehen", async () => {
    const result = await invoke({ method: "GET", url: "/../package.json", headers: { host: "127.0.0.1" } });
    assert.notStrictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 22. Unbekanntes GET fällt nicht auf internes Asset zurück.
  // -------------------------------------------------------------------

  await check("unbekanntes GET auf einen API-artigen Pfad liefert 404, kein statisches Asset", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/v71/documents/../../server.js",
      headers: { host: "127.0.0.1" },
    });
    assert.notStrictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 23. Keine Publish-Route.
  // -------------------------------------------------------------------

  await check("keine Veröffentlichungs-/Publish-Route existiert", () => {
    const forbidden = [
      ["POST", "/api/publish"],
      ["POST", "/api/v71/canva/pilot-result/publish"],
      ["POST", "/api/v71/canva/pilot-result/share"],
      ["POST", "/api/v71/canva/pilot-result/invite-customer"],
    ];
    forbidden.forEach(([method, routePath]) => {
      assert.strictEqual(routeAccessPolicy.resolvePolicyForRequest(method, routePath), null);
      assert.strictEqual(server.postRoutes.has(routePath), false);
    });
  });

  // -------------------------------------------------------------------
  // 24/25/26/27/28. Bestehende Fachbereiche bleiben Owner-only.
  // -------------------------------------------------------------------

  await check("alle Canva-/HeyGen-Routen bleiben OWNER_ONLY", () => {
    const canvaHeygenPaths = routeAccessPolicy.ALL_POLICIES.filter(
      (entry) => entry.path.includes("/canva/") || entry.path.includes("/heygen/"),
    );
    assert.ok(canvaHeygenPaths.length > 0);
    canvaHeygenPaths.forEach((entry) => {
      assert.ok(
        [ACCESS_CLASSES.OWNER_ONLY, ACCESS_CLASSES.STATIC_OWNER_ONLY].includes(entry.accessClass),
        `${entry.method} ${entry.path} ist nicht OWNER_ONLY (${entry.accessClass})`,
      );
    });
  });

  await check("alle Backup-Routen bleiben OWNER_ONLY", () => {
    const backupPaths = routeAccessPolicy.ALL_POLICIES.filter((entry) => entry.path.includes("/backup/"));
    assert.ok(backupPaths.length > 0);
    backupPaths.forEach((entry) => {
      assert.strictEqual(entry.accessClass, ACCESS_CLASSES.OWNER_ONLY);
    });
  });

  await check("alle Agentur-/Agency-Routen bleiben OWNER_ONLY", () => {
    const agencyPaths = routeAccessPolicy.ALL_POLICIES.filter((entry) => entry.path.includes("/agency/"));
    assert.ok(agencyPaths.length > 0);
    agencyPaths.forEach((entry) => {
      assert.strictEqual(entry.accessClass, ACCESS_CLASSES.OWNER_ONLY);
    });
  });

  await check("GET /api/server-status bleibt OWNER_ONLY", () => {
    const entry = routeAccessPolicy.resolvePolicyForRequest("GET", "/api/server-status");
    assert.ok(entry);
    assert.strictEqual(entry.accessClass, ACCESS_CLASSES.OWNER_ONLY);
  });

  await check("GET /api/v7-freeze-status bleibt OWNER_ONLY", () => {
    const entry = routeAccessPolicy.resolvePolicyForRequest("GET", "/api/v7-freeze-status");
    assert.ok(entry);
    assert.strictEqual(entry.accessClass, ACCESS_CLASSES.OWNER_ONLY);
  });

  // -------------------------------------------------------------------
  // 29. Alle Fehler ohne Secrets/Pfade.
  // -------------------------------------------------------------------

  await check("verweigerte Antworten enthalten keine Stacktraces, Pfade oder Tokens", async () => {
    process.env.KUZ_MODE = "prod";
    process.env.KUZ_PUBLIC_ORIGIN = "https://kuz.example.test";
    try {
      const results = await Promise.all([
        invoke({ method: "GET", url: "/api/server-status", headers: { host: "kuz.example.test" } }),
        invoke({ method: "GET", url: "/api/dies-gibt-es-nicht", headers: { host: "kuz.example.test" } }),
        invoke({ method: "GET", url: "/", headers: { host: "kuz.example.test" } }),
      ]);
      results.forEach((result) => {
        assert.doesNotMatch(result.body, /\/Users\//);
        assert.doesNotMatch(result.body, /at [A-Za-z]+\.[A-Za-z]+ \(/);
        assert.doesNotMatch(result.body, /scrypt\$/);
        assert.doesNotMatch(result.body, /SELECT .* FROM/i);
      });
    } finally {
      delete process.env.KUZ_MODE;
      delete process.env.KUZ_PUBLIC_ORIGIN;
    }
  });

  // -------------------------------------------------------------------
  // 30. Dev-Modus nur auf Loopback zulässig (Chef-Bypass).
  // -------------------------------------------------------------------

  await check("Dev-Bypass gilt nicht für einen fremden (Nicht-Loopback-)Host", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/server-status",
      headers: { host: "evil.example.com" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("isLoopbackHostHeader erkennt 127.0.0.1/localhost/::1, aber keine fremden Hosts", () => {
    assert.strictEqual(authHttp.isLoopbackHostHeader("127.0.0.1"), true);
    assert.strictEqual(authHttp.isLoopbackHostHeader("127.0.0.1:4000"), true);
    assert.strictEqual(authHttp.isLoopbackHostHeader("localhost:4000"), true);
    assert.strictEqual(authHttp.isLoopbackHostHeader("[::1]"), true);
    assert.strictEqual(authHttp.isLoopbackHostHeader("[::1]:4000"), true);
    assert.strictEqual(authHttp.isLoopbackHostHeader("evil.example.com"), false);
    assert.strictEqual(authHttp.isLoopbackHostHeader(""), false);
    assert.strictEqual(authHttp.isLoopbackHostHeader(null), false);
  });

  // -------------------------------------------------------------------
  // Zusatz: Betriebsmodus-Startprüfung (Auftrag Abschnitt C/O).
  // -------------------------------------------------------------------

  await check("resolveOperatingMode: fehlendes KUZ_PUBLIC_ORIGIN in Prod bricht ab (ok:false)", () => {
    const result = authRouteGuard.resolveOperatingMode({ KUZ_MODE: "prod" });
    assert.strictEqual(result.ok, false);
    assert.match(result.errorReason, /KUZ_PUBLIC_ORIGIN/);
  });

  await check("resolveOperatingMode: ungültiges KUZ_PUBLIC_ORIGIN in Prod bricht ab (ok:false)", () => {
    const result = authRouteGuard.resolveOperatingMode({ KUZ_MODE: "prod", KUZ_PUBLIC_ORIGIN: "keine-url" });
    assert.strictEqual(result.ok, false);
  });

  await check("resolveOperatingMode: ohne KUZ_MODE ist der Standardmodus dev", () => {
    const result = authRouteGuard.resolveOperatingMode({});
    assert.strictEqual(result.mode, "dev");
    assert.strictEqual(result.ok, true);
  });

  await check("resolveOperatingMode: gültiges KUZ_PUBLIC_ORIGIN in Prod ist ok", () => {
    const result = authRouteGuard.resolveOperatingMode({
      KUZ_MODE: "prod",
      KUZ_PUBLIC_ORIGIN: "https://kuz.example.test",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.mode, "prod");
  });

  await check("kein Fallback auf Dev-Modus: fehlkonfigurierter Prod-Request wird über den Guard hart verweigert (500)", () => {
    const decision = authRouteGuard.evaluateRouteAccess({
      method: "GET",
      pathname: "/api/server-status",
      req: { headers: { host: "kuz.example.test" } },
      requestUrl: new URL("http://kuz.example.test/api/server-status"),
      db: null,
      now: new Date().toISOString(),
      env: { KUZ_MODE: "prod" },
    });
    assert.strictEqual(decision.allow, false);
    assert.strictEqual(decision.statusCode, 500);
    assert.strictEqual(decision.reasonCode, "INVALID_MODE_CONFIG");
  });

  // -------------------------------------------------------------------
  // Zusatz: ERROR_STRATEGIES/CLASS_DEFAULTS-Konsistenz.
  // -------------------------------------------------------------------

  await check("jede Zugriffsklasse besitzt genau eine Fehlerstrategie", () => {
    Object.values(ACCESS_CLASSES).forEach((accessClass) => {
      const defaults = routeAccessPolicy.CLASS_DEFAULTS[accessClass];
      assert.ok(defaults, `keine CLASS_DEFAULTS für ${accessClass}`);
      assert.ok(Object.values(ERROR_STRATEGIES).includes(defaults.errorStrategy));
    });
  });

  await check("DISABLED_IN_PROD ist im Prod-Modus enabledInProd=false", () => {
    assert.strictEqual(routeAccessPolicy.CLASS_DEFAULTS[ACCESS_CLASSES.DISABLED_IN_PROD].enabledInProd, false);
  });

  console.log(`route-access-policy.test.js: ${passed} Prüfpunkte erfolgreich`);

  authDb.closeAuthDatabase(seedDb);
  fs.rmSync(FAKE_HOME_DIR, { recursive: true, force: true });
  fs.rmSync(KUZ_DATA_DIR, { recursive: true, force: true });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
