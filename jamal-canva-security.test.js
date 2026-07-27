"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Schritt 1: Canva als erster
// Produktionskorridor (Auftrag Abschnitt P) – Sicherheits-/Rollentests gegen
// den echten server.js#requestHandler. Gleiches Muster wie
// work-order-execution-security.test.js/jamal-work-mode-e2e.test.js. Läuft
// mit einem isolierten HOME-/KUZ_DATA_DIR-Verzeichnis; niemals die echte
// Application-Support-Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jamal-canva-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jamal-canva-security-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authAudit = require("./auth-audit");
const authTenantLink = require("./auth-tenant-link");
const server = require("./server");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const seedDb = authDb.openAuthDatabase({ dataDir: KUZ_DATA_DIR }).db;
authTenantLink.syncTenantProjections(seedDb);

const KNOWN_PASSWORD = "EinSicheresTestpasswort123";

let emailCounter = 0;
function nextEmail(label) {
  emailCounter += 1;
  return `${label}-${emailCounter}@example.test`;
}

function makeUser(overrides = {}) {
  return authDb.createUser(seedDb, {
    email: overrides.email || nextEmail("nutzer"),
    displayName: overrides.displayName || "Testnutzer",
    role: overrides.role || "CUSTOMER_ADMIN",
    tenantId: overrides.tenantId ?? null,
    status: overrides.status || "ACTIVE",
    passwordHash: overrides.passwordHash !== undefined ? overrides.passwordHash : authPassword.hashPassword(KNOWN_PASSWORD),
  });
}

function invoke({ method = "GET", url, headers = {}, bodyObj }) {
  return new Promise((resolve) => {
    const data = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
    let statusCode = null;
    let responseHeaders = {};
    let rawBody = "";
    const req = {
      method,
      url,
      headers: { host: "127.0.0.1", ...(bodyObj !== undefined ? { "content-type": "application/json" } : {}), ...headers },
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

function extractCookieValue(setCookieHeader, cookieName) {
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const entry of list) {
    const match = entry.match(new RegExp(`^${cookieName}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

async function loginAndGetSession(email) {
  const result = await invoke({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    bodyObj: { email, password: KNOWN_PASSWORD },
  });
  const sessionToken = extractCookieValue(result.headers["Set-Cookie"], "kuz_dev_session");
  const csrfToken = extractCookieValue(result.headers["Set-Cookie"], "kuz_dev_csrf");
  return {
    cookieHeader: `kuz_dev_session=${sessionToken}; kuz_dev_csrf=${csrfToken}`,
    csrfToken,
  };
}

function authedJsonHeaders(session, extra = {}) {
  return { cookie: session.cookieHeader, "x-kuz-csrf": session.csrfToken, "content-type": "application/json", ...extra };
}

const allResponseBodies = [];
function record(result) {
  allResponseBodies.push(result.body);
  return result;
}

// Baut über den echten OWNER-Loopback-Dev-Bypass (kein Login nötig – gleiches
// Muster wie jamal-work-mode-e2e.test.js) einen Arbeitswunsch bis zu
// RESULT_READY, damit Canva-Aktionen fachlich überhaupt möglich wären.
async function makeEligibleWorkItemOverHttp() {
  await invoke({ method: "POST", url: "/api/jamal-work-mode/start-new-item", bodyObj: {} });
  await invoke({
    method: "POST",
    url: "/api/jamal-work-mode/set-desired-outcome",
    bodyObj: {
      desiredOutcome: "Instagram-Beitrag für das Sonntagsfrühstück im Café gestalten.",
      notes: "Warme, ruhige Bildsprache, keine Stock-Grinsen.",
      preferredTiming: "heute",
    },
  });
  const runResult = await invoke({ method: "POST", url: "/api/jamal-work-mode/start-run", bodyObj: {} });
  return runResult;
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);

  const customerAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("a-customer-admin") });
  const customerAdminSession = await loginAndGetSession(customerAdmin.emailNormalized);
  const customerUser = makeUser({ role: "CUSTOMER_USER", tenantId: cafeTenant.id, email: nextEmail("b-customer-user") });
  const customerUserSession = await loginAndGetSession(customerUser.emailNormalized);
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("c-support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("d-owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  // Ein internes Ergebnis über den echten OWNER-Loopback-Dev-Bypass anlegen
  // (jamal-work-mode.js kennt nur genau einen aktuellen Arbeitswunsch, siehe
  // jamal-work-mode-store.js) – Grundlage für die Handoff-/Rechte-Tests unten.
  await makeEligibleWorkItemOverHttp();

  // -------------------------------------------------------------------
  // 1. CUSTOMER_ADMIN blockiert.
  // -------------------------------------------------------------------

  await check("CUSTOMER_ADMIN erreicht den Canva-Zustand nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("CUSTOMER_ADMIN kann kein Canva-Briefing vorbereiten (404)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-prepare-briefing",
        headers: authedJsonHeaders(customerAdminSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 2. CUSTOMER_USER blockiert.
  // -------------------------------------------------------------------

  await check("CUSTOMER_USER erreicht den Canva-Zustand nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: customerUserSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("CUSTOMER_USER kann keinen Canva-Handoff freigeben (404)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(customerUserSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 3. SUPPORT ohne Grant blockiert.
  // -------------------------------------------------------------------

  await check("SUPPORT ohne aktiven Grant erreicht die Canva-Routen nicht (404)", async () => {
    const resultState = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: supportSession.cookieHeader } });
    assert.strictEqual(resultState.statusCode, 404);
    const resultAction = await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-prepare-briefing",
      headers: authedJsonHeaders(supportSession),
      bodyObj: {},
    });
    assert.strictEqual(resultAction.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 4. OWNER erlaubt.
  // -------------------------------------------------------------------

  await check("OWNER erreicht den Canva-Zustand (200)", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.eligibleForCanva, true);
  });
  const ownerPrepare = record(
    await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-prepare-briefing",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { ownsImageRights: true, brandUsageAllowed: true, containsRealPerson: false },
    }),
  );
  await check("OWNER kann ein Canva-Briefing vorbereiten (200)", () => {
    assert.strictEqual(ownerPrepare.statusCode, 200);
    assert.strictEqual(ownerPrepare.json.canva.status, "READY_FOR_APPROVAL");
  });

  // -------------------------------------------------------------------
  // 5. lokaler Dev-Modus kontrolliert: der Loopback-Dev-Bypass greift
  //    ausschließlich ohne vorhandene Session, niemals zusätzlich zu einer
  //    fremden Rolle (bereits über 1-3 belegt) – hier: ganz ohne Cookie über
  //    Loopback ist die Route erreichbar (Dev-Bypass), über einen fremden
  //    Host dagegen nicht (siehe jamal-work-mode-e2e.test.js).
  // -------------------------------------------------------------------

  await check("lokaler lauschender Loopback-Dev-Modus ist kontrolliert: erreichbar über Loopback ohne Session", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state" });
    assert.strictEqual(result.statusCode, 200);
  });
  await check("lokaler Dev-Modus ist kontrolliert: nicht erreichbar über einen fremden Host (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { host: "evil.example.com" } });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 6. Manipuliertes Cookie.
  //    WICHTIG: Jamals Canva-Route ist OWNER_ONLY mit errorStrategy
  //    HIDDEN_404 (route-access-policy.js – bewusst kein "Konto
  //    existiert"-Signal, siehe Kopfkommentar dort). Zusätzlich ist die
  //    Route Loopback-Dev-Bypass-fähig (Auftrag Abschnitt M: "lokaler
  //    Jamal-Dev-Modus"), daher wird bewusst ein NICHT-Loopback-Host
  //    verwendet, um gezielt die Cookie-Prüfung selbst (statt des
  //    Dev-Bypasses) zu treffen: ein erfundenes Cookie darf dann nicht
  //    zu einer erfolgreichen Antwort führen.
  // -------------------------------------------------------------------

  await check("ein frei erfundener Session-Cookie-Wert wird auf der Canva-Zustandsroute abgelehnt (404, fail-closed)", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/jamal-work-mode/canva-state",
      headers: { host: "kuz-nicht-loopback.example.test", cookie: "kuz_dev_session=komplett-erfundener-wert" },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 7. Manipuliertes CSRF.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header bei einer Canva-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 8. Fremder Origin.
  // -------------------------------------------------------------------

  await check("eine fremde Origin bei einer Canva-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 9. Unbekannte Arbeits-ID: Jamals Arbeitsmodus kennt nur genau einen
  //    aktuellen Arbeitswunsch (keine :id-Route) – ein versuchtes
  //    workItemId-Feld im Körper ist daher ein unbekanntes Feld und wird
  //    abgewiesen statt fachlich verwendet zu werden.
  // -------------------------------------------------------------------

  await check("eine im Körper mitgesendete Arbeits-ID wird als unbekanntes Feld abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { workItemId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 10. Fremde Arbeitsreferenz: dieselbe Begründung – ein fremder
  //     Referenzwert (z. B. eine Canva-Produktions-ID eines anderen
  //     Datensatzes) im Körper wird ebenfalls als unbekanntes Feld
  //     abgewiesen, niemals fachlich verwendet.
  // -------------------------------------------------------------------

  await check("eine fremde Canva-Produktions-Referenz im Körper wird als unbekanntes Feld abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { canvaProductionId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // Vollständigen Handoff für die folgenden Tests durchführen (Freigabe +
  // Start), damit ein Design/Providerstatus/Audit tatsächlich existiert.
  // -------------------------------------------------------------------

  const approveResult = record(
    await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-approve-handoff",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("Freigabe war erfolgreich (Testvoraussetzung)", () => {
    assert.strictEqual(approveResult.statusCode, 200);
    assert.strictEqual(approveResult.json.canva.status, "APPROVED_FOR_HANDOFF");
  });

  const startResult = record(
    await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-start-handoff",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("Stub-Handoff war erfolgreich (Testvoraussetzung)", () => {
    assert.strictEqual(startResult.statusCode, 200);
    assert.strictEqual(startResult.json.canva.status, "RESULT_RECEIVED");
  });

  // -------------------------------------------------------------------
  // 11+12+13. Kein Token in DB/Response/Audit.
  // -------------------------------------------------------------------

  await check("kein Zugangstoken/Provider-Secret in der Canva-Datenbanktabelle", () => {
    const row = authDb.getLatestJamalCanvaProductionForWorkItem(seedDb, startResult.json.canva.workItemId);
    const rowText = JSON.stringify(row);
    assert.doesNotMatch(rowText, /accessToken|apiKey|clientSecret|refreshToken|bearer\s/i);
  });
  await check("kein Zugangstoken/Provider-Secret in einer Canva-HTTP-Antwort", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /accessToken|apiKey|clientSecret|refreshToken|"bearer"/i);
    });
  });
  await check("kein Zugangstoken/Provider-Secret im Canva-Audit", () => {
    ["CANVA_BRIEFING_PREPARED", "CANVA_HANDOFF_APPROVED", "CANVA_HANDOFF_STARTED", "CANVA_RESULT_RECEIVED", "CANVA_RESULT_REVIEWED"].forEach(
      (eventType) => {
        authAudit.listAuditEventsByType(seedDb, eventType).forEach((event) => {
          if (!event.metadata) return;
          assert.doesNotMatch(event.metadata, /accessToken|apiKey|clientSecret|refreshToken/i);
        });
      },
    );
  });

  // -------------------------------------------------------------------
  // 14. Keine vollständige Providerantwort gespeichert (nur die
  //     zulässigen, engen Felder aus jamal-canva-production-service.js#
  //     rowToSafeView – kein Roh-Providerobjekt).
  // -------------------------------------------------------------------

  await check("es wird keine vollständige, rohe Providerantwort gespeichert (nur enge, bekannte Felder)", () => {
    const row = authDb.getLatestJamalCanvaProductionForWorkItem(seedDb, startResult.json.canva.workItemId);
    const allowedColumns = [
      "id",
      "workItemId",
      "revisionNumber",
      "status",
      "suitabilityDecision",
      "suitabilityJson",
      "briefingJson",
      "rightsStatus",
      "rightsJson",
      "reviewMode",
      "changeRequestText",
      "approvedAt",
      "approvedByUserId",
      "handoffStartedAt",
      "canvaJobId",
      "canvaDesignId",
      "designTitle",
      "editLink",
      "viewLink",
      "providerStatus",
      "errorCode",
      "resultReceivedAt",
      "qualityStatus",
      "qualityNotesJson",
      "cancelledAt",
      "cancelReason",
      "createdAt",
      "updatedAt",
    ];
    Object.keys(row).forEach((key) => assert.ok(allowedColumns.includes(key), `unerlaubte Spalte ${key} in jamal_canva_productions`));
  });

  // -------------------------------------------------------------------
  // 15+16+17. BLOCK verhindert Handoff (Policy/Consent/Bildrechte
  //           ungeklärt).
  // -------------------------------------------------------------------

  await invoke({ method: "POST", url: "/api/jamal-work-mode/canva-accept-result", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
  await invoke({ method: "POST", url: "/api/jamal-work-mode/start-new-item", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
  await invoke({
    method: "POST",
    url: "/api/jamal-work-mode/set-desired-outcome",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {
      desiredOutcome: "LinkedIn-Grafik für einen neuen Blogbeitrag gestalten.",
      notes: "Neutraler Testinhalt, keine Personen.",
      preferredTiming: "heute",
    },
  });
  await invoke({ method: "POST", url: "/api/jamal-work-mode/start-run", headers: authedJsonHeaders(ownerSession), bodyObj: {} });

  const unclearRightsPrepare = record(
    await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-prepare-briefing",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("Rechte-/Consent-Fragen offen → BLOCKED statt Freigabebereitschaft", () => {
    assert.strictEqual(unclearRightsPrepare.statusCode, 200);
    assert.strictEqual(unclearRightsPrepare.json.canva.status, "BLOCKED");
    assert.strictEqual(unclearRightsPrepare.json.canva.rights.status, "UNCLEAR");
  });
  await check("Consent fehlt → BLOCKED verhindert jeden Handoff (kein canApprove/canStart)", () => {
    assert.strictEqual(unclearRightsPrepare.json.canva.availableActions.canApprove, false);
    assert.strictEqual(unclearRightsPrepare.json.canva.availableActions.canStart, false);
  });
  await check("Bildrechte ungeklärt → ein Freigabeversuch wird trotzdem serverseitig abgelehnt (409)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-approve-handoff",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 18+19+20. Kein Publish-/Social-Media-/Kunden-Canva-Endpunkt.
  // -------------------------------------------------------------------

  await check("kein Publish-Endpunkt existiert im Canva-Aktionsraum (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-publish",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("kein Social-Media-Post-Endpunkt existiert im Canva-Aktionsraum (404)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/jamal-work-mode/canva-post-social-media",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("kein Kunden-Canva-Zugriffsendpunkt existiert (Kundenportalrouten enthalten kein \"canva\")", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/portal/canva-state",
      headers: { cookie: customerAdminSession.cookieHeader },
    });
    assert.strictEqual(result.statusCode, 404);
  });

  // -------------------------------------------------------------------
  // 21. no-store.
  // -------------------------------------------------------------------

  await check("die Canva-Zustandsantwort trägt Cache-Control: no-store", async () => {
    const result = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.headers["Cache-Control"], "no-store");
  });

  // -------------------------------------------------------------------
  // 22+23+24. Generische Fehler, keine Stacktraces, keine absoluten Pfade.
  // -------------------------------------------------------------------

  await check("ein unpassender Zustand liefert eine verständliche, generische Fehlermeldung (409)", async () => {
    // RESULT_RECEIVED liegt nicht mehr vor (bereits akzeptiert/BLOCKED) → ein
    // erneuter Start ist derzeit nicht möglich.
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-start-handoff",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 409);
    assert.strictEqual(result.json.ok, false);
    assert.ok(typeof result.json.message === "string" && result.json.message.length > 0);
  });
  await check("keine Antwort dieses Ablaufs enthält eine Stacktrace", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /at Object\.|at Function\.|at async |\.js:\d+:\d+/);
    });
  });
  await check("keine Antwort dieses Ablaufs enthält einen absoluten Dateisystempfad", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /\/Users\/|\/home\/|node_modules\//);
    });
  });

  // -------------------------------------------------------------------
  // 25. Keine externe Aktion ohne Freigabe: ein frischer, noch nicht
  //     freigegebener Arbeitswunsch kann nicht direkt gestartet werden.
  // -------------------------------------------------------------------

  await invoke({ method: "POST", url: "/api/jamal-work-mode/start-new-item", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
  await invoke({
    method: "POST",
    url: "/api/jamal-work-mode/set-desired-outcome",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: {
      desiredOutcome: "Posterentwurf für ein internes Sommerfest gestalten.",
      notes: "Neutraler Testinhalt.",
      preferredTiming: "heute",
    },
  });
  await invoke({ method: "POST", url: "/api/jamal-work-mode/start-run", headers: authedJsonHeaders(ownerSession), bodyObj: {} });
  await invoke({
    method: "POST",
    url: "/api/jamal-work-mode/canva-prepare-briefing",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { ownsImageRights: true, brandUsageAllowed: true, containsRealPerson: false },
  });
  await check("kein Connectoraufruf ohne vorherige explizite Freigabe (409, kein Design entsteht)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/jamal-work-mode/canva-start-handoff",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 409);
    const stateAfter = await invoke({ method: "GET", url: "/api/jamal-work-mode/canva-state", headers: { cookie: ownerSession.cookieHeader } });
    assert.notStrictEqual(stateAfter.json.current && stateAfter.json.current.status, "RESULT_RECEIVED");
  });

  console.log(`jamal-canva-security.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run()
  .then(() => {
    authDb.closeAuthDatabase(seedDb);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    authDb.closeAuthDatabase(seedDb);
    process.exit(1);
  });
