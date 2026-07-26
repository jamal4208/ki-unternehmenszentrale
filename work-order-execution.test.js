"use strict";

// V7.2 Phase C Schritt 1 (Auftrag Abschnitt P) – Tests für die kontrollierte
// Übergabe eines READY_FOR_PROCESSING-Arbeitsauftrags an die interne
// Agentenzentrale (work-order-execution-service.js/
// work-order-agent-orchestrator.js/work-order-result-service.js).
//
// Gleiches Testmuster wie work-order-routes.test.js: echter
// server.js#requestHandler mit isoliertem HOME-/KUZ_DATA_DIR-Verzeichnis.
// Ergänzt um gezielte Modul-/Datenbankprüfungen dort, wo eine reine
// HTTP-Prüfung technische Invarianten (Parallelitätsschutz,
// Unveränderlichkeit, Arbeitsplan) nicht sinnvoll abbilden kann.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FAKE_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-execution-test-home-"));
const KUZ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "work-order-execution-test-data-"));
process.env.HOME = FAKE_HOME_DIR;
process.env.KUZ_DATA_DIR = KUZ_DATA_DIR;
delete process.env.KUZ_MODE;
delete process.env.KUZ_PUBLIC_ORIGIN;

const authDb = require("./auth-db");
const authPassword = require("./auth-password");
const authAudit = require("./auth-audit");
const authTenantLink = require("./auth-tenant-link");
const agentRegistry = require("./agent-registry");
const orchestrator = require("./work-order-agent-orchestrator");
const workOrderExecutionService = require("./work-order-execution-service");
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
  authDb.updateTenantStatus(seedDb, cafeCustomerId, "ACTIVE");
  const cafeTenant = authDb.getTenantProjectionByCustomerId(seedDb, cafeCustomerId);
  const cafeAdmin = makeUser({ role: "CUSTOMER_ADMIN", tenantId: cafeTenant.id, email: nextEmail("cafe-admin") });
  const cafeAdminSession = await loginAndGetSession(cafeAdmin.emailNormalized);
  const ownerUser = makeUser({ role: "OWNER", tenantId: null, email: nextEmail("owner") });
  const ownerSession = await loginAndGetSession(ownerUser.emailNormalized);

  async function createOrder(overrides = {}) {
    const result = await invoke({
      method: "POST",
      url: "/api/portal/work-orders",
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {
        title: "Neue Landingpage für unser Ladengeschäft",
        desiredResult: "Wir wünschen uns eine verständliche, vertrauenswürdige Landingpage für unser Ladengeschäft.",
        context: "Zielgruppe sind lokale Laufkunden, die uns über Suchmaschinen finden.",
        deadlineText: "in drei Wochen",
        ...overrides,
      },
    });
    return result.json.workOrder;
  }

  async function startRun(workOrderId) {
    return record(
      await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${workOrderId}/run`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      }),
    );
  }

  async function getOwnerRuns(workOrderId) {
    return invoke({ method: "GET", url: `/api/owner/work-orders/${workOrderId}/runs`, headers: { cookie: ownerSession.cookieHeader } });
  }

  async function getCustomerResult(workOrderId) {
    return invoke({ method: "GET", url: `/api/portal/work-orders/${workOrderId}/result`, headers: { cookie: cafeAdminSession.cookieHeader } });
  }

  // -------------------------------------------------------------------
  // 1+2+3+4+5. READY_FOR_PROCESSING startet, falscher Status nicht, Lauf
  //            setzt IN_PROGRESS (Audit), Run-Datensatz mit Run-Nummer 1.
  // -------------------------------------------------------------------

  const orderReady = await createOrder({ title: "Auftrag für den ersten kontrollierten Lauf" });
  await check("ein READY_FOR_PROCESSING-Auftrag ist zunächst READY_FOR_PROCESSING", () => {
    assert.strictEqual(orderReady.status, "READY_FOR_PROCESSING");
  });

  const orderNeedsClarification = await createOrder({ title: "Zu knapper Auftrag", desiredResult: "Kurz." });
  await check("ein NEEDS_CLARIFICATION-Auftrag kann keinen Lauf starten (409)", async () => {
    const result = await startRun(orderNeedsClarification.id);
    assert.strictEqual(result.statusCode, 409);
  });

  const firstRunStart = await startRun(orderReady.id);
  await check("ein READY_FOR_PROCESSING-Auftrag kann einen Lauf starten (200)", () => {
    assert.strictEqual(firstRunStart.statusCode, 200);
    assert.strictEqual(firstRunStart.json.ok, true);
  });

  await check("der Auftrag durchläuft serverseitig IN_PROGRESS (Audit WORK_ORDER_RUN_STARTED)", () => {
    const startedEvents = authAudit.listAuditEventsByType(seedDb, "WORK_ORDER_RUN_STARTED");
    const entry = startedEvents.find((event) => event.metadata && JSON.parse(event.metadata).workOrderId === orderReady.id);
    assert.ok(entry);
    assert.strictEqual(JSON.parse(entry.metadata).statusTransition, "READY_FOR_PROCESSING->IN_PROGRESS");
  });

  const ownerRunsAfterFirst = await getOwnerRuns(orderReady.id);
  await check("nach dem ersten Lauf existiert genau ein Run-Datensatz mit Run-Nummer 1", () => {
    assert.strictEqual(ownerRunsAfterFirst.statusCode, 200);
    assert.strictEqual(ownerRunsAfterFirst.json.runs.length, 1);
    assert.strictEqual(ownerRunsAfterFirst.json.runs[0].runNumber, 1);
  });

  // -------------------------------------------------------------------
  // 6. Zweiter Lauf erhöht die Run-Nummer (über NEEDS_CLARIFICATION eines
  //    zweiten Auftrags, Ergänzung und erneuten Lauf).
  // -------------------------------------------------------------------

  const orderForSecondRun = await createOrder({
    title: "Auftrag mit anfänglich unzureichendem Kontext",
    desiredResult: "Bitte kurz bei etwas helfen.",
    context: null,
  });
  const secondRunFirstAttempt = await startRun(orderForSecondRun.id);
  await check("ein Lauf, der eine echte fachliche Lücke erkennt, setzt den Auftrag auf NEEDS_CLARIFICATION (24)", () => {
    assert.strictEqual(secondRunFirstAttempt.statusCode, 200);
    assert.strictEqual(secondRunFirstAttempt.json.workOrderStatus, "NEEDS_CLARIFICATION");
  });

  const orderAfterClarification = (
    await invoke({ method: "GET", url: `/api/portal/work-orders/${orderForSecondRun.id}`, headers: { cookie: cafeAdminSession.cookieHeader } })
  ).json.workOrder;
  await check("die konkrete Rückfrage wird als statusNote gespeichert und dem Kunden angezeigt (25)", () => {
    assert.strictEqual(orderAfterClarification.status, "NEEDS_CLARIFICATION");
    assert.ok(orderAfterClarification.statusNote);
    assert.match(orderAfterClarification.statusNote, /gewünschte Ergebnis|Hintergrundtext/);
  });

  const resubmitResult = record(
    await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderForSecondRun.id}/resubmit`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {
        title: "Auftrag mit anfänglich unzureichendem Kontext",
        desiredResult: "Wir möchten unseren Kunden eine bessere Übersicht über offene Anfragen im System anbieten.",
        context: "Aktuell sehen unsere Mitarbeiter offene Anfragen nur verstreut in mehreren Werkzeugen.",
        deadlineText: null,
      },
    }),
  );
  await check("der ergänzte Auftrag wird automatisch wieder READY_FOR_PROCESSING", () => {
    assert.strictEqual(resubmitResult.json.workOrder.status, "READY_FOR_PROCESSING");
  });

  const secondRunSecondAttempt = await startRun(orderForSecondRun.id);
  await check("der zweite tatsächliche Lauf für denselben Auftrag erhöht die Run-Nummer auf 2", async () => {
    assert.strictEqual(secondRunSecondAttempt.statusCode, 200);
    const runs = await getOwnerRuns(orderForSecondRun.id);
    assert.strictEqual(runs.json.runs.length, 2);
    const runNumbers = runs.json.runs.map((r) => r.runNumber).sort();
    assert.deepStrictEqual(runNumbers, [1, 2]);
    const secondRun = runs.json.runs.find((r) => r.runNumber === 2);
    assert.strictEqual(secondRun.status, "COMPLETED");
  });

  // -------------------------------------------------------------------
  // 7. Kein paralleler aktiver Lauf (Invarianten-/Modulprüfung: ein
  //    bereits aktiver Lauf-Datensatz blockiert einen weiteren Start).
  // -------------------------------------------------------------------

  await check("kein paralleler aktiver Lauf für denselben Auftrag möglich (Modulinvariante)", () => {
    const parallelOrder = authDb.createWorkOrder(seedDb, {
      tenantId: cafeTenant.id,
      createdByUserId: cafeAdmin.id,
      title: "Auftrag für Parallelitätsprüfung",
      desiredResult: "Ausreichend langer, gültiger Text für den Parallelitätstest.",
      status: "READY_FOR_PROCESSING",
    });
    authDb.createWorkOrderRun(seedDb, {
      workOrderId: parallelOrder.id,
      tenantId: cafeTenant.id,
      status: "IN_PROGRESS",
      orchestratorVersion: orchestrator.ORCHESTRATOR_VERSION,
      startedAt: new Date().toISOString(),
    });
    assert.throws(() => {
      workOrderExecutionService.startRunForWorkOrder(seedDb, ownerUser.id, parallelOrder.id);
    }, /workOrderExecutionService|Lauf/);
  });

  // -------------------------------------------------------------------
  // 8. Doppelter Start ist idempotent/409 (Auftrag ist nach dem ersten
  //    synchronen Lauf nicht mehr READY_FOR_PROCESSING).
  // -------------------------------------------------------------------

  const doubleStart = await startRun(orderReady.id);
  await check("ein zweiter Startversuch auf demselben, bereits verarbeiteten Auftrag wird abgelehnt (409)", () => {
    assert.strictEqual(doubleStart.statusCode, 409);
  });

  // -------------------------------------------------------------------
  // 9-14. Agentenauswahl: Projektmanager, max. 3 Fachagenten, genau 1
  //       Qualitätsagent, kanonisches Register, keine erfundene Rolle,
  //       Auswahlgrund gespeichert.
  // -------------------------------------------------------------------

  const firstRunDetail = (await getOwnerRuns(orderReady.id)).json.runs[0];
  await check("der Projektmanager-Agent wird immer ausgewählt", () => {
    const pm = firstRunDetail.agents.find((a) => a.agentRole === "PROJECT_MANAGER");
    assert.ok(pm);
    assert.strictEqual(pm.agentKey, agentRegistry.ROLE_NAME_MAPPING["Projektmanager-Agent"]);
  });
  await check("es werden maximal 3 Fachagenten ausgewählt", () => {
    const specialists = firstRunDetail.agents.filter((a) => a.agentRole === "SPECIALIST");
    assert.ok(specialists.length >= 1 && specialists.length <= 3);
  });
  await check("es wird genau 1 Qualitätsagent ausgewählt", () => {
    const qualityAgents = firstRunDetail.agents.filter((a) => a.agentRole === "QUALITY");
    assert.strictEqual(qualityAgents.length, 1);
  });
  await check("alle ausgewählten Agenten stammen aus dem kanonischen 25-Agenten-Register", () => {
    firstRunDetail.agents.forEach((agent) => {
      assert.ok(agentRegistry.hasAgentId(agent.agentKey), `unbekannte Agenten-ID: ${agent.agentKey}`);
    });
  });
  await check("keine Agentenrolle außerhalb PROJECT_MANAGER/SPECIALIST/QUALITY", () => {
    firstRunDetail.agents.forEach((agent) => {
      assert.ok(["PROJECT_MANAGER", "SPECIALIST", "QUALITY"].includes(agent.agentRole));
    });
  });
  await check("für jeden ausgewählten Agenten ist ein Auswahlgrund gespeichert", () => {
    firstRunDetail.agents.forEach((agent) => {
      assert.ok(agent.selectionReason && agent.selectionReason.length > 0);
    });
  });

  // -------------------------------------------------------------------
  // 15. Arbeitsplan wird erzeugt (Modulprüfung des Orchestrators).
  // -------------------------------------------------------------------

  await check("der Orchestrator erzeugt einen internen Arbeitsplan mit 3-5 Schritten, Ergebnisformat und Qualitätskriterien", () => {
    const fields = {
      title: "Beispielauftrag",
      desiredResult: "Ein Beispielergebnis, das ausführlich genug beschrieben ist.",
      context: "Ein kurzer Hintergrund.",
      deadlineText: null,
    };
    const selection = orchestrator.selectAgentsForWorkOrder(fields);
    const plan = orchestrator.buildWorkPlan(fields, selection);
    assert.ok(Array.isArray(plan.steps));
    assert.ok(plan.steps.length >= 3 && plan.steps.length <= 5);
    assert.ok(plan.expectedResultFormat);
    assert.ok(Array.isArray(plan.qualityCriteria) && plan.qualityCriteria.length > 0);
  });

  // -------------------------------------------------------------------
  // 16-21. Ergebnis gespeichert, Version 1, unveränderlich, Auftrag
  //        RESULT_READY, Run COMPLETED, Qualitätsprüfung vorhanden.
  // -------------------------------------------------------------------

  const customerResult = await getCustomerResult(orderReady.id);
  await check("das Ergebnis wird gespeichert und ist für den Kunden abrufbar", () => {
    assert.strictEqual(customerResult.statusCode, 200);
    assert.ok(customerResult.json.result.title);
    assert.ok(customerResult.json.result.body);
  });
  await check("das erste Ergebnis trägt Versionsnummer 1", () => {
    assert.strictEqual(customerResult.json.result.versionNumber, 1);
  });
  await check("ein gespeichertes Ergebnis ist unveränderlich (UPDATE wird von der Datenbank verweigert)", () => {
    assert.throws(() => {
      seedDb.prepare("UPDATE work_order_results SET resultTitle = ? WHERE workOrderId = ?").run("Manipuliert", orderReady.id);
    }, /append-only|unveränderlich/);
  });
  const orderReadyFinal = (
    await invoke({ method: "GET", url: `/api/portal/work-orders/${orderReady.id}`, headers: { cookie: cafeAdminSession.cookieHeader } })
  ).json.workOrder;
  await check("der Auftrag wird nach erfolgreichem Lauf RESULT_READY", () => {
    assert.strictEqual(orderReadyFinal.status, "RESULT_READY");
  });
  await check("der zugehörige Lauf wird COMPLETED", () => {
    assert.strictEqual(firstRunDetail.status, "COMPLETED");
  });
  await check("eine Qualitätsprüfung ist Teil des Ergebnisses", () => {
    assert.ok(["PASSED", "PASSED_WITH_NOTES"].includes(customerResult.json.result.qualityStatus));
    assert.ok(customerResult.json.result.qualityStatusLabel);
  });

  // -------------------------------------------------------------------
  // 22+23. Kein Ergebnis bei FAILED, FAILED-Lauf ist erneut startbar
  //        (Modulprüfung: simulierter technischer Fehler).
  // -------------------------------------------------------------------

  const orderForFailure = await createOrder({ title: "Auftrag für simulierten technischen Fehler" });
  const originalSelectAgents = orchestrator.selectAgentsForWorkOrder;
  orchestrator.selectAgentsForWorkOrder = () => {
    throw new Error("simulierter technischer Fehler für Testzwecke");
  };
  let failureCaught = null;
  try {
    workOrderExecutionService.startRunForWorkOrder(seedDb, ownerUser.id, orderForFailure.id);
  } catch (error) {
    failureCaught = error;
  } finally {
    orchestrator.selectAgentsForWorkOrder = originalSelectAgents;
  }
  await check("bei einem technischen Fehler entsteht kein Ergebnis und keine falsche RESULT_READY-Meldung", () => {
    assert.ok(failureCaught);
    assert.strictEqual(failureCaught.statusCode, 500);
    const orderAfterFailure = authDb.getWorkOrderById(seedDb, orderForFailure.id);
    assert.notStrictEqual(orderAfterFailure.status, "RESULT_READY");
    assert.strictEqual(orderAfterFailure.status, "READY_FOR_PROCESSING");
  });
  await check("ein FAILED-Lauf kann später erneut gestartet werden", async () => {
    const restart = await startRun(orderForFailure.id);
    assert.strictEqual(restart.statusCode, 200);
    assert.strictEqual(restart.json.workOrderStatus, "RESULT_READY");
  });

  // -------------------------------------------------------------------
  // 26-30. Keine Owner-Freigabe, kein Kunden-CUSTOMER_APPROVED, keine
  //        Veröffentlichung, kein Provideraufruf, kein Billing.
  // -------------------------------------------------------------------

  await check("keine Owner-Route setzt eine fachliche Freigabe (kein approve/release)", async () => {
    for (const action of ["approve", "release", "publish"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderReady.id}/${action}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });
  await check("keine Kundenroute setzt CUSTOMER_APPROVED", async () => {
    const result = await invoke({
      method: "POST",
      url: `/api/portal/work-orders/${orderReady.id}/approve`,
      headers: authedJsonHeaders(cafeAdminSession),
      bodyObj: {},
    });
    assert.strictEqual(result.statusCode, 404);
  });
  await check("keine Provider-/Billing-/Veröffentlichungsroute existiert", async () => {
    for (const action of ["provider", "billing", "publish"]) {
      const result = await invoke({
        method: "POST",
        url: `/api/owner/work-orders/${orderReady.id}/${action}`,
        headers: authedJsonHeaders(ownerSession),
        bodyObj: {},
      });
      assert.strictEqual(result.statusCode, 404);
    }
  });

  // -------------------------------------------------------------------
  // 31-33. Audit vollständig, ohne Auftragstext/Ergebnistext.
  // -------------------------------------------------------------------

  const EXECUTION_AUDIT_EVENT_TYPES = [
    "WORK_ORDER_RUN_PREPARED",
    "WORK_ORDER_RUN_STARTED",
    "WORK_ORDER_RUN_COMPLETED",
    "WORK_ORDER_RUN_FAILED",
    "WORK_ORDER_RESULT_CREATED",
    "WORK_ORDER_AGENT_SELECTED",
  ];
  await check("alle in diesem Schritt tatsächlich ausgelösten Auditereignisse sind vorhanden", () => {
    EXECUTION_AUDIT_EVENT_TYPES.forEach((eventType) => {
      const events = authAudit.listAuditEventsByType(seedDb, eventType);
      assert.ok(events.length > 0, `kein Ereignis für ${eventType}`);
    });
  });
  await check("kein Laufaudit enthält den Auftragstext oder das Ergebnis", () => {
    const sensitiveSnippets = [
      "Ladengeschäft",
      "Landingpage",
      "Wir möchten unseren Kunden",
      "Ergebnisentwurf",
      "Ausgearbeiteter Vorschlag",
    ];
    EXECUTION_AUDIT_EVENT_TYPES.forEach((eventType) => {
      authAudit.listAuditEventsByType(seedDb, eventType).forEach((event) => {
        if (!event.metadata) return;
        const metadataKeys = Object.keys(JSON.parse(event.metadata));
        metadataKeys.forEach((key) =>
          assert.ok(
            ["workOrderId", "runId", "agentKey", "statusTransition", "reasonCode", "severity", "failureCode"].includes(key),
            `unerwartetes Auditfeld: ${key}`,
          ),
        );
        sensitiveSnippets.forEach((snippet) => assert.doesNotMatch(event.metadata, new RegExp(snippet)));
      });
    });
  });

  // -------------------------------------------------------------------
  // 34+35. Cache-Control: no-store, sichere Fehlerantworten.
  // -------------------------------------------------------------------

  await check("Antworten der neuen Routen setzen Cache-Control: no-store", () => {
    assert.strictEqual(customerResult.headers["Cache-Control"], "no-store");
    assert.strictEqual(ownerRunsAfterFirst.headers["Cache-Control"], "no-store");
  });
  await check("keine erfasste Antwort enthält Stacktraces, Pfade oder Passwort-Hashes", () => {
    capturedBodies.forEach((body) => {
      assert.ok(!/at\s+[\w.]+\s+\(/.test(body), "kein Stacktrace-Muster");
      assert.ok(!/\/Users\//.test(body), "kein absoluter Dateipfad");
      assert.ok(!/passwordHash/i.test(body), "kein Passwort-Hash-Feldname");
    });
  });

  console.log(`work-order-execution.test.js: ${passed} Prüfpunkte erfolgreich`);
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
