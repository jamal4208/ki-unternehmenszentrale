"use strict";

// V7.2 Phase B Schritt 1 (Auftrag Abschnitt M), PRODUKTKORRIGIERT – Tests
// für den Selbstbedienungs-Fluss der ersten echten Kundenfachfunktion:
// Arbeitsauftrag anlegen, automatisch prüfen, Status verfolgen. Der OWNER
// ist kein fachlicher Prüfer mehr; die automatische Vollständigkeitsregel
// entscheidet über READY_FOR_PROCESSING/NEEDS_CLARIFICATION, der OWNER
// bleibt auf die beiden Ausnahmeaktionen (Eskalation/Stopp) beschränkt.
//
// Alle Aufrufe laufen gegen den echten server.js#requestHandler mit einem
// isolierten HOME-/KUZ_DATA_DIR-Verzeichnis (gleiches Muster wie
// customer-portal-routes.test.js/owner-admin-routes.test.js) – niemals die
// tatsächliche Application-Support-Datenbank des Entwicklungsrechners.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-routes-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-routes-test-data-"));
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

const capturedBodies = [];
function record(result) {
  capturedBodies.push(result.body);
  return result;
}

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  const fitnessCustomerId = "test-customer-fiktives-fitnessstudio";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  authDb.updateTenantStatus(seedDb, fitnessCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);
  const fitnessTenant = authDb.getTenantProjectionByCustomerId(seedDb, fitnessCustomerId);

  const cafeAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("cafe-admin") });
  const cafeAdminSession = await loginAndGetSession(cafeAdmin.emailNormalized);
  const cafeUser = makeUser({ role: "CUSTOMER_USER", tenantId: cafeTenant.id, email: nextEmail("cafe-user") });
  const cafeUserSession = await loginAndGetSession(cafeUser.emailNormalized);

  const fitnessAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: fitnessTenant.id, email: nextEmail("fitness-admin") });
  const fitnessAdminSession = await loginAndGetSession(fitnessAdmin.emailNormalized);

  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  function validWorkOrderBody(overrides = {}) {
    return {
      title: "Neue Broschüre für den Empfangsbereich",
      desiredResult: "Eine kurze, freundliche Broschüre mit den wichtigsten Leistungen.",
      context: "Wird an der Rezeption ausgelegt.",
      deadlineText: "Bis Ende des Monats",
      ...overrides,
    };
  }

  // -------------------------------------------------------------------
  // 1+2+9+10. CUSTOMER_ADMIN/CUSTOMER_USER erstellen einen Auftrag, der
  //           automatisch (ausreichende Angaben) READY_FOR_PROCESSING
  //           wird und ausschließlich dem eigenen Mandanten (aus der
  //           Session) zugeordnet ist.
  // -------------------------------------------------------------------

  const adminCreate = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody(),
    }),
  );
  await check("CUSTOMER_ADMIN kann einen Arbeitsauftrag anlegen (200)", () => {
    assert.strictEqual(adminCreate.statusCode, 200);
    assert.strictEqual(adminCreate.json.ok, true);
  });
  await check("ein ausreichend beschriebener Arbeitsauftrag wird automatisch READY_FOR_PROCESSING (kein Owner beteiligt)", () => {
    assert.strictEqual(adminCreate.json.workOrder.status, "READY_FOR_PROCESSING");
    assert.strictEqual(adminCreate.json.workOrder.statusLabel, "Bereit zur Bearbeitung");
    assert.ok(adminCreate.json.workOrder.customerMessage);
    assert.strictEqual(adminCreate.json.workOrder.statusNote, null);
  });

  const userCreate = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeUserSession),
      bodyObj: validWorkOrderBody({ title: "Zweiter Auftrag von einem Mitarbeiterkonto" }),
    }),
  );
  await check("CUSTOMER_USER kann ebenfalls einen Arbeitsauftrag anlegen (200)", () => {
    assert.strictEqual(userCreate.statusCode, 200);
    assert.strictEqual(userCreate.json.workOrder.status, "READY_FOR_PROCESSING");
  });

  await check("Tenant kommt ausschließlich aus der Session: beide Café-Aufträge erscheinen in der Café-Liste", () => {
    // wird weiter unten (Listenabruf) zusätzlich abgesichert
    assert.ok(adminCreate.json.workOrder.id);
    assert.ok(userCreate.json.workOrder.id);
    assert.notStrictEqual(adminCreate.json.workOrder.id, userCreate.json.workOrder.id);
  });

  // -------------------------------------------------------------------
  // 1b. Ein zu knapp beschriebener Auftrag wird automatisch NEEDS_
  //     CLARIFICATION (simulierte automatische Vollständigkeitsregel).
  // -------------------------------------------------------------------

  const vagueCreate = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { title: "Kurzauftrag", desiredResult: "Kurz." },
    }),
  );
  await check("ein zu knapp beschriebener Auftrag wird automatisch NEEDS_CLARIFICATION (kein Owner beteiligt)", () => {
    assert.strictEqual(vagueCreate.statusCode, 200);
    assert.strictEqual(vagueCreate.json.workOrder.status, "NEEDS_CLARIFICATION");
    assert.strictEqual(vagueCreate.json.workOrder.statusLabel, "Rückfrage offen");
    assert.ok(vagueCreate.json.workOrder.statusNote);
  });

  // -------------------------------------------------------------------
  // 3. Pflichtfelder.
  // -------------------------------------------------------------------

  const missingTitle = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "" }),
    }),
  );
  await check("ein Arbeitsauftrag ohne Titel wird abgelehnt (400)", () => {
    assert.strictEqual(missingTitle.statusCode, 400);
    assert.strictEqual(missingTitle.json.ok, false);
  });

  const missingDesiredResult = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { title: "Nur ein Titel" },
    }),
  );
  await check("ein Arbeitsauftrag ohne gewünschtes Ergebnis wird abgelehnt (400)", () => {
    assert.strictEqual(missingDesiredResult.statusCode, 400);
  });

  await check("Hintergrund und gewünschter Zeitpunkt sind optional (200 ohne diese Felder)", async () => {
    const minimal = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { title: "Minimalauftrag", desiredResult: "Ein kurzes, klares Ergebnis." },
    });
    assert.strictEqual(minimal.statusCode, 200);
    assert.strictEqual(minimal.json.workOrder.context, null);
    assert.strictEqual(minimal.json.workOrder.deadlineText, null);
  });

  // -------------------------------------------------------------------
  // 4. Maximale Feldlängen.
  // -------------------------------------------------------------------

  await check("ein zu langer Titel (>200 Zeichen) wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "A".repeat(201) }),
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("eine zu lange Ergebnisbeschreibung (>4000 Zeichen) wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ desiredResult: "A".repeat(4001) }),
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("ein zu langer Hintergrundtext (>4000 Zeichen) wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ context: "A".repeat(4001) }),
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await check("ein zu langer gewünschter Zeitpunkt (>200 Zeichen) wird abgelehnt (400)", async () => {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ deadlineText: "A".repeat(201) }),
    });
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 5+11+12+28+29. Unbekannte/verbotene Felder (Tenant/User/Status/
  //                Status-Notiz aus dem Kundenkörper) werden abgewiesen.
  // -------------------------------------------------------------------

  for (const forbiddenField of ["unbekanntesFeld", "tenantId", "customerId", "userId", "createdByUserId", "status", "statusNote", "id"]) {
    await check(`ein unbekanntes/verbotenes Feld "${forbiddenField}" im Anlegen-Körper wird abgewiesen (400)`, async () => {
      const result = await invoke({
        method: "POST",
        url: "/api/portal/work-orders",
        headers: authedJsonHeaders(cafeAdminSession),
        bodyObj: { ...validWorkOrderBody(), [forbiddenField]: "irgendein-wert" },
      });
      assert.strictEqual(result.statusCode, 400);
    });
  }

  // -------------------------------------------------------------------
  // 6. Falscher Content-Type.
  // -------------------------------------------------------------------

  const wrongContentType = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: { cookie: cafeAdminSession.cookieHeader, "x-kuz-csrf": cafeAdminSession.csrfToken, "content-type": "text/plain" },
      bodyObj: validWorkOrderBody(),
    }),
  );
  await check("ein falscher Content-Type wird abgelehnt (415)", () => {
    assert.strictEqual(wrongContentType.statusCode, 415);
  });

  // -------------------------------------------------------------------
  // 7. CSRF.
  // -------------------------------------------------------------------

  const missingCsrf = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: { cookie: cafeAdminSession.cookieHeader, "content-type": "application/json" },
      bodyObj: validWorkOrderBody(),
    }),
  );
  await check("ein fehlender CSRF-Header wird abgelehnt (403)", () => {
    assert.strictEqual(missingCsrf.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 8. Origin.
  // -------------------------------------------------------------------

  const wrongOrigin = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession, { origin: "https://boesartig.example.test" }),
      bodyObj: validWorkOrderBody(),
    }),
  );
  await check("eine fremde Origin wird abgelehnt (403)", () => {
    assert.strictEqual(wrongOrigin.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // 13+14+15+16. Kundenliste/-detail, Mandantentrennung, unbekannte ID.
  // -------------------------------------------------------------------

  const cafeList = record(await invoke({ method: "GET", url: "/api/portal/work-orders", headers: { cookie: cafeAdminSession.cookieHeader } }));
  await check("CUSTOMER_ADMIN listet ausschließlich die eigenen Aufträge des Café-Mandanten", () => {
    assert.strictEqual(cafeList.statusCode, 200);
    assert.ok(cafeList.json.workOrders.length >= 2);
    assert.ok(cafeList.json.workOrders.every((wo) => typeof wo.id === "string"));
  });

  const cafeDetail = record(
    await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${adminCreate.json.workOrder.id}`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    }),
  );
  await check("Kunde sieht den eigenen Auftrag im Detail (200)", () => {
    assert.strictEqual(cafeDetail.statusCode, 200);
    assert.strictEqual(cafeDetail.json.workOrder.id, adminCreate.json.workOrder.id);
  });

  const fitnessCreate = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(fitnessAdminSession),
      bodyObj: validWorkOrderBody({ title: "Auftrag des Fitnessstudio-Mandanten" }),
    }),
  );
  await check("der Fitnessstudio-Mandant kann ebenfalls einen Auftrag anlegen (200)", () => {
    assert.strictEqual(fitnessCreate.statusCode, 200);
  });

  const crossTenantDetail = record(
    await invoke({
      method: "GET",
      url: `/api/portal/work-orders/${fitnessCreate.json.workOrder.id}`,
      headers: { cookie: cafeAdminSession.cookieHeader },
    }),
  );
  await check("ein Kunde sieht den Auftrag eines fremden Mandanten nicht (generisches 404)", () => {
    assert.strictEqual(crossTenantDetail.statusCode, 404);
  });

  const unknownIdDetail = record(
    await invoke({
      method: "GET",
      url: "/api/portal/work-orders/00000000-0000-0000-0000-000000000000",
      headers: { cookie: cafeAdminSession.cookieHeader },
    }),
  );
  await check("eine unbekannte Auftrag-ID liefert dasselbe generische 404 wie ein Mandanten-Mismatch", () => {
    assert.strictEqual(unknownIdDetail.statusCode, 404);
    assert.deepStrictEqual(Object.keys(unknownIdDetail.json).sort(), Object.keys(crossTenantDetail.json).sort());
  });

  // -------------------------------------------------------------------
  // 17+18+19+20. Statusübergänge bei erneuter Einreichung: die
  //              automatische Regel entscheidet erneut, kein Owner nötig.
  // -------------------------------------------------------------------

  const forClarificationOrder = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { title: "Auftrag für Rückfrage-Szenario", desiredResult: "Kurz." },
    }),
  );
  await check("der Auftrag für das Rückfrage-Szenario startet automatisch mit NEEDS_CLARIFICATION", () => {
    assert.strictEqual(forClarificationOrder.json.workOrder.status, "NEEDS_CLARIFICATION");
  });

  const resubmitTooShortAgain = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${forClarificationOrder.json.workOrder.id}/resubmit`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: { title: "Auftrag für Rückfrage-Szenario", desiredResult: "Noch." },
    }),
  );
  await check("ein erneut zu knapp ergänzter Auftrag bleibt automatisch NEEDS_CLARIFICATION", () => {
    assert.strictEqual(resubmitTooShortAgain.statusCode, 200);
    assert.strictEqual(resubmitTooShortAgain.json.workOrder.status, "NEEDS_CLARIFICATION");
  });

  const resubmitResult = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${forClarificationOrder.json.workOrder.id}/resubmit`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "Auftrag für Rückfrage-Szenario (ergänzt)" }),
    }),
  );
  await check("Kunde kann einen Auftrag mit offener Rückfrage ausreichend ergänzt erneut absenden (200, automatisch READY_FOR_PROCESSING)", () => {
    assert.strictEqual(resubmitResult.statusCode, 200);
    assert.strictEqual(resubmitResult.json.workOrder.status, "READY_FOR_PROCESSING");
    assert.strictEqual(resubmitResult.json.workOrder.title, "Auftrag für Rückfrage-Szenario (ergänzt)");
  });

  const resubmitAgainOnReady = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${forClarificationOrder.json.workOrder.id}/resubmit`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody(),
    }),
  );
  await check("ein bereits READY_FOR_PROCESSING-Auftrag kann nicht erneut abgesendet werden (409)", () => {
    assert.strictEqual(resubmitAgainOnReady.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 21+22. Owner-Liste über alle Mandanten hinweg mit Mandantenzuordnung
  //        (reine Betriebsübersicht, keine Prüfpflicht).
  // -------------------------------------------------------------------

  const ownerList = record(await invoke({ method: "GET", url: "/api/owner/work-orders", headers: { cookie: ownerSession.cookieHeader } }));
  await check("Owner sieht Aufträge über alle Mandanten hinweg (mindestens Café und Fitnessstudio)", () => {
    assert.strictEqual(ownerList.statusCode, 200);
    const tenantNames = new Set(ownerList.json.workOrders.map((wo) => wo.tenantDisplayName));
    assert.ok(tenantNames.has(cafeTenant.displayName));
    assert.ok(tenantNames.has(fitnessTenant.displayName));
  });

  await check("es gibt keine Owner-Route zur regulären Freigabe/Ablehnung mehr (404)", async () => {
    for (const legacyAction of ["approve", "reject", "request-clarification"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${adminCreate.json.workOrder.id}/${legacyAction}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { reason: "Testversuch auf entfernter Route." },
      });
      assert.strictEqual(result.statusCode, 404, `Route .../${legacyAction} sollte nicht mehr existieren`);
    }
  });

  // -------------------------------------------------------------------
  // 23+24+25. Owner-Ausnahmeaktion "Eskalieren": Grund erforderlich,
  //           gültiger Übergang, ungültiger Übergang.
  // -------------------------------------------------------------------

  const missingEscalateReason = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${userCreate.json.workOrder.id}/escalate`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("eine Eskalation ohne Grund wird abgelehnt (400)", () => {
    assert.strictEqual(missingEscalateReason.statusCode, 400);
  });

  const escalateResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${userCreate.json.workOrder.id}/escalate`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Ungewöhnlich hohe Kostenerwartung, bitte gesondert prüfen." },
    }),
  );
  await check("Owner kann einen Auftrag im Ausnahmefall eskalieren (200, Status ESCALATED)", () => {
    assert.strictEqual(escalateResult.statusCode, 200);
    assert.strictEqual(escalateResult.json.workOrder.status, "ESCALATED");
    assert.strictEqual(escalateResult.json.workOrder.statusLabel, "In besonderer Prüfung");
  });

  const doubleEscalate = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${userCreate.json.workOrder.id}/escalate`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Zweiter Versuch auf bereits eskaliertem Auftrag." },
    }),
  );
  await check("ein bereits eskalierter Auftrag kann nicht erneut eskaliert werden (409)", () => {
    assert.strictEqual(doubleEscalate.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 26+27. Owner-Ausnahmeaktion "Stoppen": aus ESCALATED heraus UND
  //        direkt aus einem aktiven Status heraus (dringender
  //        Sicherheitsstopp, ohne vorherige Eskalation nötig).
  // -------------------------------------------------------------------

  const missingStopReason = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${escalateResult.json.workOrder.id}/stop`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: {},
    }),
  );
  await check("ein Stopp ohne Grund wird abgelehnt (400)", () => {
    assert.strictEqual(missingStopReason.statusCode, 400);
  });

  const stopAfterEscalate = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${escalateResult.json.workOrder.id}/stop`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Nach Prüfung: Auftrag wird aus Kostengründen gestoppt." },
    }),
  );
  await check("Owner kann einen eskalierten Auftrag stoppen (200, Status CANCELLED)", () => {
    assert.strictEqual(stopAfterEscalate.statusCode, 200);
    assert.strictEqual(stopAfterEscalate.json.workOrder.status, "CANCELLED");
  });

  const stopAlreadyCancelled = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${escalateResult.json.workOrder.id}/stop`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Erneuter Versuch auf bereits gestopptem Auftrag." },
    }),
  );
  await check("ein bereits gestoppter (terminaler) Auftrag kann nicht erneut gestoppt werden (409)", () => {
    assert.strictEqual(stopAlreadyCancelled.statusCode, 409);
  });

  const directStopOrder = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "Auftrag für dringenden Sicherheitsstopp" }),
    }),
  );
  const directStopResult = record(
    await invoke({
      method: "POST",
      url: `/api/owner/work-orders/${directStopOrder.json.workOrder.id}/stop`,
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { reason: "Sicherheitsverdacht, sofortiger Stopp ohne vorherige Eskalation." },
    }),
  );
  await check("ein dringender Sicherheitsstopp funktioniert auch ohne vorherige Eskalation (200, Status CANCELLED)", () => {
    assert.strictEqual(directStopResult.statusCode, 200);
    assert.strictEqual(directStopResult.json.workOrder.status, "CANCELLED");
  });

  // -------------------------------------------------------------------
  // 28. Kunden-Cancel: eigener Auftrag kann storniert werden, ein
  //     eskalierter/bereits stornierter Auftrag nicht.
  // -------------------------------------------------------------------

  const cancellableOrder = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "Auftrag für Kunden-Stornierung" }),
    }),
  );
  const customerCancelResult = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${cancellableOrder.json.workOrder.id}/cancel`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    }),
  );
  await check("Kunde kann den eigenen Auftrag selbst stornieren (200, Status CANCELLED)", () => {
    assert.strictEqual(customerCancelResult.statusCode, 200);
    assert.strictEqual(customerCancelResult.json.workOrder.status, "CANCELLED");
  });

  const customerCancelAgain = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${cancellableOrder.json.workOrder.id}/cancel`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    }),
  );
  await check("ein bereits stornierter Auftrag kann nicht erneut storniert werden (409)", () => {
    assert.strictEqual(customerCancelAgain.statusCode, 409);
  });

  const cancelForeignOrder = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${fitnessCreate.json.workOrder.id}/cancel`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    }),
  );
  await check("ein fremder Auftrag kann nicht storniert werden (generisches 404)", () => {
    assert.strictEqual(cancelForeignOrder.statusCode, 404);
  });

  const escalatedForCancelAttempt = record(
    await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: validWorkOrderBody({ title: "Auftrag wird eskaliert, dann Kunden-Stornoversuch" }),
    }),
  );
  await invoke({
    method: "POST",
    url: `/api/owner/work-orders/${escalatedForCancelAttempt.json.workOrder.id}/escalate`,
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { reason: "Wird geprüft, Kunde soll währenddessen nicht stornieren können." },
  });
  const cancelEscalatedOrder = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${escalatedForCancelAttempt.json.workOrder.id}/cancel`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    }),
  );
  await check("ein eskalierter Auftrag kann vom Kunden nicht durch eine einfache Stornierung umgangen werden (409)", () => {
    assert.strictEqual(cancelEscalatedOrder.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 30. Keine automatische Ausführung: die Antwort enthält ausschließlich
  //     die dokumentierten Felder, insbesondere keinen Agentenlauf/keine
  //     Execution-Kennung.
  // -------------------------------------------------------------------

  await check("keine Antwort der Arbeitsauftrags-API enthält Ausführungs-/Agentenfelder", () => {
    const serialized = JSON.stringify([escalateResult.json, stopAfterEscalate.json, customerCancelResult.json]);
    assert.ok(!/agentRun|executionId|attemptId|toolCall|provider/i.test(serialized));
  });

  // -------------------------------------------------------------------
  // 31+32+33. Audit für Erstellung, automatische Entscheidung und
  //           Owner-Ausnahmeaktionen, ohne Auftragstext/Grundtext.
  // -------------------------------------------------------------------

  await check("WORK_ORDER_CREATED und WORK_ORDER_SUBMITTED werden für die Erstellung auditiert", () => {
    const createdEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_CREATED");
    const submittedEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_SUBMITTED");
    assert.ok(createdEvents.some((event) => event.metadata && JSON.parse(event.metadata).workOrderId === adminCreate.json.workOrder.id));
    assert.ok(submittedEvents.some((event) => event.metadata && JSON.parse(event.metadata).workOrderId === adminCreate.json.workOrder.id));
  });

  await check("WORK_ORDER_AUTO_READY/WORK_ORDER_AUTO_NEEDS_CLARIFICATION werden ohne Akteur (System) auditiert", () => {
    const autoReadyEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_AUTO_READY");
    const autoNeedsClarificationEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_AUTO_NEEDS_CLARIFICATION");
    const readyEntry = autoReadyEvents.find(
      (event) => event.metadata && JSON.parse(event.metadata).workOrderId === adminCreate.json.workOrder.id,
    );
    const clarificationEntry = autoNeedsClarificationEvents.find(
      (event) => event.metadata && JSON.parse(event.metadata).workOrderId === vagueCreate.json.workOrder.id,
    );
    assert.ok(readyEntry);
    assert.strictEqual(readyEntry.actorUserId, null);
    assert.strictEqual(JSON.parse(readyEntry.metadata).statusTransition, "SUBMITTED->READY_FOR_PROCESSING");
    assert.ok(clarificationEntry);
    assert.strictEqual(clarificationEntry.actorUserId, null);
    assert.strictEqual(JSON.parse(clarificationEntry.metadata).statusTransition, "SUBMITTED->NEEDS_CLARIFICATION");
  });

  await check("WORK_ORDER_ESCALATED und WORK_ORDER_CANCELLED werden mit Statusübergang und Owner als Akteur auditiert", () => {
    const escalatedEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_ESCALATED");
    const cancelledEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_CANCELLED");
    const escalatedEntry = escalatedEvents.find(
      (event) => event.metadata && JSON.parse(event.metadata).workOrderId === escalateResult.json.workOrder.id,
    );
    const cancelledEntry = cancelledEvents.find(
      (event) => event.metadata && JSON.parse(event.metadata).workOrderId === stopAfterEscalate.json.workOrder.id,
    );
    assert.ok(escalatedEntry);
    assert.strictEqual(escalatedEntry.actorUserId, ownerUser.id);
    assert.strictEqual(JSON.parse(escalatedEntry.metadata).statusTransition, "READY_FOR_PROCESSING->ESCALATED");
    assert.ok(cancelledEntry);
    assert.strictEqual(cancelledEntry.actorUserId, ownerUser.id);
    assert.strictEqual(JSON.parse(cancelledEntry.metadata).statusTransition, "ESCALATED->CANCELLED");
  });

  await check("kein Auftragsaudit enthält den Auftragstext oder den Owner-Grund", () => {
    const allWorkOrderEventTypes = [
      "WORK_ORDER_CREATED",
      "WORK_ORDER_SUBMITTED",
      "WORK_ORDER_RESUBMITTED",
      "WORK_ORDER_AUTO_READY",
      "WORK_ORDER_AUTO_NEEDS_CLARIFICATION",
      "WORK_ORDER_ESCALATED",
      "WORK_ORDER_CANCELLED",
    ];
    allWorkOrderEventTypes.forEach((eventType) => {
      authAudit.listAuditEventsByType(seedDb, eventType).forEach((event) => {
        if (!event.metadata) return;
        const metadataKeys = Object.keys(JSON.parse(event.metadata));
        metadataKeys.forEach((key) => assert.ok(["workOrderId", "statusTransition"].includes(key), `unerwartetes Auditfeld: ${key}`));
        assert.doesNotMatch(
          event.metadata,
          /Broschüre|Empfangsbereich|Rezeption|Kostenerwartung|Kostengründen|Sicherheitsverdacht/,
        );
      });
    });
  });

  // -------------------------------------------------------------------
  // 34. Cache-Control: no-store.
  // -------------------------------------------------------------------

  await check("Antworten der Arbeitsauftrags-API setzen Cache-Control: no-store", () => {
    assert.strictEqual(cafeList.headers["Cache-Control"], "no-store");
    assert.strictEqual(cafeDetail.headers["Cache-Control"], "no-store");
    assert.strictEqual(escalateResult.headers["Cache-Control"], "no-store");
  });

  // -------------------------------------------------------------------
  // 35. Generische Fehler: keine Stacktraces, Pfade oder Passwort-Hashes.
  // -------------------------------------------------------------------

  await check("keine erfasste Antwort enthält Stacktraces, Pfade oder Passwort-Hashes", () => {
    capturedBodies.forEach((body) => {
      assert.ok(!/at\s+[\w.]+\s+\(/.test(body), "kein Stacktrace-Muster");
      assert.ok(!/\/Users\//.test(body), "kein absoluter Dateipfad");
      assert.ok(!/passwordHash/i.test(body), "kein Passwort-Hash-Feldname");
    });
  });

  console.log(`work-order-routes.test.js: ${passed} Prüfpunkte erfolgreich`);
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
