"use strict";

// V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
// der KI-Unternehmenszentrale verankern (Auftrag Abschnitt 13,
// Prüfpunkte 10, 12, 13, 14) – Sicherheits-/Rollentests gegen den echten
// server.js#requestHandler. Gleiches Muster wie
// office-finance-security.test.js. Läuft mit einem isolierten HOME-/
// KUZ_DATA_DIR-Verzeichnis; niemals die echte Application-Support-
// Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "health-reference-security-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "health-reference-security-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
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

async function run() {
  const cafeCustomerId = "test-customer-fiktives-cafe";
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);

  const customerAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("a-customer-admin") });
  const customerAdminSession = await loginAndGetSession(customerAdmin.emailNormalized);
  const supportUser = makeUser({ role: "SUPPORT", tenantId: null, email: nextEmail("b-support") });
  const supportSession = await loginAndGetSession(supportUser.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("c-owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  // -------------------------------------------------------------------
  // 12. OWNER_ONLY-Routen: Kunde/Support blockiert, OWNER erlaubt.
  // -------------------------------------------------------------------

  await check("CUSTOMER_ADMIN erreicht /api/health-reference/status nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/health-reference/status", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("SUPPORT ohne aktiven Grant erreicht /api/health-reference/status nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/api/health-reference/status", headers: { cookie: supportSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("CUSTOMER_ADMIN erreicht das statische health-reference-work-run-ui.js nicht (404)", async () => {
    const result = await invoke({ method: "GET", url: "/health-reference-work-run-ui.js", headers: { cookie: customerAdminSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 404);
  });

  await check("Kundenrolle kann keine Health-Referenz-Aktion über den POST-Prefix auslösen (404)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/ensure-run",
        headers: authedJsonHeaders(customerAdminSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 404);
  });

  await check("OWNER erreicht /api/health-reference/status (200, no-store)", async () => {
    const result = await invoke({ method: "GET", url: "/api/health-reference/status", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.headers["Cache-Control"], "no-store");
    assert.strictEqual(result.json.run.status, "PREPARED_FOR_EXECUTION");
  });

  await check("OWNER erreicht das statische health-reference-work-run-ui.js (200)", async () => {
    const result = await invoke({ method: "GET", url: "/health-reference-work-run-ui.js", headers: { cookie: ownerSession.cookieHeader } });
    assert.strictEqual(result.statusCode, 200);
  });

  // -------------------------------------------------------------------
  // 13. CSRF/Origin-Schutz.
  // -------------------------------------------------------------------

  await check("ein falscher CSRF-Header bei einer Health-Referenz-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/ensure-run",
        headers: authedJsonHeaders(ownerSession, { "x-kuz-csrf": "falscher-csrf-wert" }),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  await check("eine fremde Origin bei einer Health-Referenz-Aktion wird abgelehnt (403)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/ensure-run",
        headers: authedJsonHeaders(ownerSession, { origin: "https://angreifer.example.test" }),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 403);
  });

  // -------------------------------------------------------------------
  // Lauf über HTTP anlegen (Testvoraussetzung für die folgenden Prüfungen).
  // -------------------------------------------------------------------

  const ensureRunResult = record(
    await invoke({ method: "POST", url: "/api/health-reference/ensure-run", headers: authedJsonHeaders(ownerSession), bodyObj: {} }),
  );
  await check("OWNER kann den kanonischen Health-Referenzlauf über HTTP anlegen/abrufen (200)", () => {
    assert.strictEqual(ensureRunResult.statusCode, 200);
    assert.strictEqual(ensureRunResult.json.run.id, "health-reference-work-run-v1");
    assert.strictEqual(ensureRunResult.json.run.status, "PREPARED_FOR_EXECUTION");
  });

  await check("ein unbekanntes Feld im Aktionskörper wird abgewiesen (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/ensure-run",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { extraFeld: true },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // 10. keine externe Aktion: es existiert keine Login-/Send-/Deploy-/
  // Commit-/Push-Route unter diesem Prefix.
  // -------------------------------------------------------------------

  for (const forbiddenAction of ["send-email", "deploy", "commit", "push", "publish", "google-login", "oauth-start", "book-scale-hardware"]) {
    await check(`10. es existiert keine Aktion "${forbiddenAction}" (404 – keine externe Aktion, kein Commit/Push/Deploy)`, async () => {
      const result = record(
        await invoke({
          method: "POST",
          url: `/api/health-reference/${forbiddenAction}`,
          headers: authedJsonHeaders(ownerSession),
          bodyObj: {},
        }),
      );
      assert.strictEqual(result.statusCode, 404);
    });
  }

  const firstWorkPackageKey = ensureRunResult.json.run.nextWorkPackage.packageKey;

  const preparePromptResult = record(
    await invoke({
      method: "POST",
      url: "/api/health-reference/prepare-work-package-prompt",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { workPackageKey: firstWorkPackageKey },
    }),
  );
  await check("OWNER kann über HTTP einen Prompt-Entwurf vorbereiten (200, WAITING_FOR_JAMAL_APPROVAL)", () => {
    assert.strictEqual(preparePromptResult.statusCode, 200);
    assert.strictEqual(preparePromptResult.json.workPackage.status, "WAITING_FOR_JAMAL_APPROVAL");
    assert.ok(preparePromptResult.json.workPackage.promptDraft.projectPath.includes("health-upgrade-kompass"));
    assert.strictEqual(preparePromptResult.json.workPackage.promptDraft.autoCommitAllowed, false);
    assert.strictEqual(preparePromptResult.json.workPackage.promptDraft.autoPushAllowed, false);
  });

  const recordApprovalResult = record(
    await invoke({
      method: "POST",
      url: "/api/health-reference/record-approval",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { approvalKey: "SCOPE", decision: "APPROVED", note: "Testfixtur-Scope-Freigabe." },
    }),
  );
  await check("OWNER kann eine Scope-Freigabe über HTTP dokumentieren (200)", () => {
    assert.strictEqual(recordApprovalResult.statusCode, 200);
    assert.strictEqual(recordApprovalResult.json.approval.decision, "APPROVED");
  });

  await check("die finale Referenzabnahme kann nicht über die generische Freigabe-Route ausgelöst werden (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/record-approval",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: { approvalKey: "FINAL_REFERENCE_ACCEPTANCE", decision: "APPROVED" },
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  await check("REFERENCE_READY wird ohne confirmed === true abgelehnt (400)", async () => {
    const result = record(
      await invoke({
        method: "POST",
        url: "/api/health-reference/record-final-acceptance",
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
    assert.strictEqual(result.statusCode, 400);
  });

  // -------------------------------------------------------------------
  // V7.6.4 – einzelne Health-Arbeitspakete korrekt abschließen (Auftrag
  // Abschnitt 8, Prüfpunkte 9, 10, 11 aus HTTP-/Datensicht: dieselben
  // Felder, die health-reference-work-run-ui.js für die Anzeige nutzt).
  // Führt Paket 1 (firstWorkPackageKey) vollständig bis COMPLETED und
  // bereitet Paket 2 vor – ausschließlich über HTTP, gleiches Muster wie
  // oben.
  // -------------------------------------------------------------------

  await invoke({
    method: "POST",
    url: "/api/health-reference/transition-work-package",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { workPackageKey: firstWorkPackageKey, toStatus: "APPROVED_FOR_EXECUTION" },
  });
  await invoke({
    method: "POST",
    url: "/api/health-reference/transition-work-package",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { workPackageKey: firstWorkPackageKey, toStatus: "IN_EXECUTION" },
  });
  await invoke({
    method: "POST",
    url: "/api/health-reference/submit-result-report",
    headers: authedJsonHeaders(ownerSession),
    bodyObj: { workPackageKey: firstWorkPackageKey, summary: "Ergebnis Paket 1 (HTTP-Testfixtur)." },
  });
  const qaResult = record(
    await invoke({
      method: "POST",
      url: "/api/health-reference/submit-qa-finding",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { workPackageKey: firstWorkPackageKey, summary: "QA Paket 1 bestanden (HTTP-Testfixtur).", passed: true },
    }),
  );

  await check("V7.6.4-2. Paket 1 wird nach bestandenem QA über HTTP COMPLETED (nicht REFERENCE_READY)", () => {
    assert.strictEqual(qaResult.statusCode, 200);
    assert.strictEqual(qaResult.json.workPackage.status, "COMPLETED");
  });

  const statusAfterPkg1Result = record(
    await invoke({ method: "GET", url: "/api/health-reference/status", headers: { cookie: ownerSession.cookieHeader } }),
  );
  await check("V7.6.4-7/8. Fortschritt zählt Paket 1 (1 von 7), nextWorkPackage liefert Paket 2", () => {
    assert.strictEqual(statusAfterPkg1Result.json.run.progress.completed, 1);
    assert.strictEqual(statusAfterPkg1Result.json.run.progress.total, 7);
    assert.notStrictEqual(statusAfterPkg1Result.json.run.nextWorkPackage.packageKey, firstWorkPackageKey);
  });
  const secondWorkPackageKey = statusAfterPkg1Result.json.run.nextWorkPackage.packageKey;

  const preparePrompt2Result = record(
    await invoke({
      method: "POST",
      url: "/api/health-reference/prepare-work-package-prompt",
      headers: authedJsonHeaders(ownerSession),
      bodyObj: { workPackageKey: secondWorkPackageKey },
    }),
  );
  await check("V7.6.4-6/9/10. nach Vorbereitung von Paket 2 zeigt der Lauf WAITING_FOR_JAMAL_APPROVAL mit Paket 2 als nächste Handlung", () => {
    assert.strictEqual(preparePrompt2Result.statusCode, 200);
    assert.strictEqual(preparePrompt2Result.json.workPackage.status, "WAITING_FOR_JAMAL_APPROVAL");
  });

  const finalStatusResult = record(
    await invoke({ method: "GET", url: "/api/health-reference/status", headers: { cookie: ownerSession.cookieHeader } }),
  );
  await check("V7.6.4-6. der Laufstatus ist WAITING_FOR_JAMAL_APPROVAL, nicht mehr QA_REVIEW/RESULT_SUBMITTED", () => {
    assert.strictEqual(finalStatusResult.json.run.status, "WAITING_FOR_JAMAL_APPROVAL");
    assert.notStrictEqual(finalStatusResult.json.run.status, "REFERENCE_READY");
  });

  await check("V7.6.4-9/10. Fortschritt zeigt weiterhin 1 von 7 und Paket 2 als nächstes Arbeitspaket", () => {
    assert.strictEqual(finalStatusResult.json.run.progress.completed, 1);
    assert.strictEqual(finalStatusResult.json.run.progress.total, 7);
    assert.strictEqual(finalStatusResult.json.run.nextWorkPackage.packageKey, secondWorkPackageKey);
  });

  await check("V7.6.4-10. die nächste Handlung nennt konkret das nächste Arbeitspaket (kein generischer Text ohne Bezug)", () => {
    assert.strictEqual(finalStatusResult.json.run.nextAction.id, "REVIEW_PROMPT_DRAFT");
    assert.match(finalStatusResult.json.run.nextAction.label, new RegExp(finalStatusResult.json.run.nextWorkPackage.title));
  });

  await check("V7.6.4-11. Paket 1 fordert nach COMPLETED keine erneute QA (Status bleibt COMPLETED, kein Rückfall)", () => {
    const pkg1View = finalStatusResult.json.run.workPackages.find((pkg) => pkg.packageKey === firstWorkPackageKey);
    assert.strictEqual(pkg1View.status, "COMPLETED");
    assert.strictEqual(pkg1View.statusLabel, "Abgeschlossen");
  });

  await check("V7.6.4-14. Paket 2 bleibt nach der Vorbereitung unausgeführt (nicht freigegeben, nicht ausgeführt)", () => {
    const pkg2View = finalStatusResult.json.run.workPackages.find((pkg) => pkg.packageKey === secondWorkPackageKey);
    assert.strictEqual(pkg2View.status, "WAITING_FOR_JAMAL_APPROVAL");
  });

  await check("V7.6.4-12/13. der Statusübergang von Paket 1 erzeugt ein datensparsames HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED-Auditereignis", () => {
    const events = authDb
      .listAuditEvents(seedDb, { eventType: "HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED" })
      .filter((event) => JSON.parse(event.metadata || "{}").workPackageKey === firstWorkPackageKey);
    assert.ok(events.length > 0);
    const completedEvent = events.find((event) => JSON.parse(event.metadata).nextStatus === "COMPLETED");
    assert.ok(completedEvent, "kein Auditereignis für den Übergang nach COMPLETED gefunden");
    events.forEach((event) => {
      const metadataKeys = Object.keys(JSON.parse(event.metadata));
      assert.deepStrictEqual(
        metadataKeys.sort(),
        ["healthReferenceRunId", "nextStatus", "previousStatus", "workPackageKey"].sort(),
      );
      assert.doesNotMatch(event.metadata, /gewicht|diagnose|medizinisch|kilogramm|geburtsdatum/i);
    });
  });

  // -------------------------------------------------------------------
  // 14. Auditereignisse (HTTP-Ebene) sind datensparsam.
  // -------------------------------------------------------------------

  await check("14. Auditereignisse dieses HTTP-Laufs sind datensparsam (keine Gesundheits-/Personendaten, kein Secret)", () => {
    const events = authDb.listAuditEvents(seedDb, { limit: 500 }).filter((event) => event.eventType.startsWith("HEALTH_REFERENCE_"));
    assert.ok(events.length > 0);
    events.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /gewicht|diagnose|medizinisch|kilogramm|geburtsdatum/i);
      assert.doesNotMatch(event.metadata, /"(accessToken|refreshToken|apiKey|clientSecret|password)"\s*:\s*"[^"]+"/i);
    });
  });

  await check("keine Antwort dieses gesamten Testlaufs enthält ein Zugangstoken/Provider-Secret", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /"(accessToken|refreshToken|apiKey|clientSecret|password)"\s*:\s*"[^"]+"/i);
    });
  });

  await check("keine Antwort dieses gesamten Testlaufs enthält Stacktraces oder absolute Dateisystempfade der Zentrale", () => {
    allResponseBodies.forEach((body) => {
      assert.doesNotMatch(body, /at\s+[A-Za-z0-9_.]+\s+\(.*:\d+:\d+\)/);
      assert.doesNotMatch(body, new RegExp(__dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  });

  console.log(`health-reference-work-run-security.test.js: ${passed} Prüfpunkte erfolgreich`);
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
