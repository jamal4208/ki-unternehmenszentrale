"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 2: Mehrfachlauf-Fähigkeit.
//
// Prüft ausschließlich die technische Grundlage für mehrere, voneinander
// getrennte Pilotaufträge (siehe pilot-work-order-service.js#Kopfkommentar
// "Phase 2 – Mehrfachlauf-Grundlage"). Ergänzt pilot-work-order.test.js
// (Fachlogik des einzelnen/kanonischen Auftrags) und
// pilot-work-order-security.test.js (HTTP-/Zugriffsschicht), ohne diese zu
// ersetzen. Noch KEINE Parallelverarbeitung: Aufträge werden hier bewusst
// nacheinander geführt.
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken, niemals die echte
// Application-Support-Datenbank. Dieses Modul führt niemals eine externe
// Aktion aus.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const service = require("./pilot-work-order-service");
const healthService = require("./health-reference-work-run-service");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "pilot-multi-order-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function orderInput(overrides = {}) {
  return {
    title: "Testauftrag: eigenständiger Pilotauftrag",
    desiredOutcome: "Nachweis, dass dieser Auftrag unabhängig von anderen Pilotaufträgen geführt werden kann.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis beantwortet die Auftragsfrage", "Risiken sind benannt"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)", "Freigabe des finalen Ergebnisses (COMPLETED)"],
    timeframe: "Ohne festes Enddatum.",
    ...overrides,
  };
}

function handoffInput(overrides = {}) {
  return {
    fromPilotRole: "PROJEKTMANAGER",
    toPilotRole: "RECHERCHE_ANALYSE",
    shortFinding: "Auftrag geklärt, Recherche kann beginnen.",
    resultOrRecommendation: "Bitte belastbare Inhalte erarbeiten.",
    basisUsed: "Auftragstext und Qualitätskriterien.",
    riskOrLimit: "Zeitrahmen ist offen.",
    nextStep: "Recherche starten.",
    ...overrides,
  };
}

function driveToInExecution(db, pilotOrderId) {
  service.markReadyForApproval(db, { pilotOrderId });
  service.approveForExecution(db, { pilotOrderId, confirmed: true });
  service.startExecution(db, { pilotOrderId });
}

function driveToCompleted(db, pilotOrderId, textSeed) {
  driveToInExecution(db, pilotOrderId);
  service.submitHandoff(
    db,
    handoffInput({
      pilotOrderId,
      shortFinding: `${textSeed}: Auftrag geklärt.`,
      resultOrRecommendation: `${textSeed}: Rechercheergebnis liegt vor.`,
    }),
  );
  service.submitHandoff(
    db,
    handoffInput({
      pilotOrderId,
      fromPilotRole: "RECHERCHE_ANALYSE",
      toPilotRole: "DOKUMENTATION",
      shortFinding: `${textSeed}: Recherche abgeschlossen.`,
      resultOrRecommendation: `${textSeed}: Dokumentiertes Endergebnis liegt vor.`,
    }),
  );
  service.submitForReview(db, { pilotOrderId });
  return service.approveCompletion(db, { pilotOrderId, confirmed: true });
}

async function run() {
  const { db } = makeIsolatedDb();

  // Referenzstand des Health-Referenzlaufs VOR jeder Pilotauftrags-Operation
  // (Test 15: bestehende Health-Referenzdaten bleiben unverändert).
  const healthBaseline = JSON.stringify(healthService.getOrCreateCanonicalRun(db));

  // -------------------------------------------------------------------
  // 1./2. Zwei unterschiedliche Pilotaufträge können angelegt werden und
  // erhalten unterschiedliche IDs.
  // -------------------------------------------------------------------

  const overviewA = service.createPilotOrder(
    db,
    orderInput({ title: "Pilotauftrag A: Marketingtext-Grundlage", desiredOutcome: "Grundlage für einen Marketingtext prüfen." }),
  );
  const overviewB = service.createPilotOrder(
    db,
    orderInput({ title: "Pilotauftrag B: interne Prozessnotiz", desiredOutcome: "Grundlage für eine interne Prozessnotiz prüfen." }),
  );
  const orderAId = overviewA.order.id;
  const orderBId = overviewB.order.id;

  await check("1. zwei unterschiedliche Pilotaufträge können über createPilotOrder angelegt werden", () => {
    assert.ok(overviewA.order);
    assert.ok(overviewB.order);
    assert.strictEqual(overviewA.status, "DRAFT");
    assert.strictEqual(overviewB.status, "DRAFT");
  });

  await check("2. beide Aufträge erhalten unterschiedliche, nicht-kanonische IDs", () => {
    assert.notStrictEqual(orderAId, orderBId);
    assert.notStrictEqual(orderAId, service.CANONICAL_PILOT_ORDER_ID);
    assert.notStrictEqual(orderBId, service.CANONICAL_PILOT_ORDER_ID);
  });

  await check("14a. ohne options.id wird eine kollisionsarme ID nach festem Muster erzeugt", () => {
    assert.match(orderAId, /^pilot-order-[0-9a-f-]{36}$/);
    assert.match(orderBId, /^pilot-order-[0-9a-f-]{36}$/);
  });

  await check("14b. mit options.id bleibt die ID in Tests deterministisch kontrollierbar", () => {
    const deterministic = service.createPilotOrder(db, orderInput({ title: "Pilotauftrag C: deterministisch" }), {
      id: "pilot-order-test-deterministic",
    });
    assert.strictEqual(deterministic.order.id, "pilot-order-test-deterministic");
  });

  await check("14c. eine bereits vergebene ID wird abgewiesen statt überschrieben (auch die kanonische ID)", () => {
    assert.throws(
      () => service.createPilotOrder(db, orderInput(), { id: "pilot-order-test-deterministic" }),
      /existiert bereits/,
    );
    assert.throws(() => service.createPilotOrder(db, orderInput(), { id: service.CANONICAL_PILOT_ORDER_ID }), /existiert bereits/);
  });

  // -------------------------------------------------------------------
  // 3. Statusänderungen eines Auftrags verändern den anderen Auftrag nicht.
  // -------------------------------------------------------------------

  await check("3. markReadyForApproval für Auftrag A verändert Auftrag B nicht", () => {
    const changed = service.markReadyForApproval(db, { pilotOrderId: orderAId });
    assert.strictEqual(changed.status, "READY_FOR_JAMAL_APPROVAL");
    const untouchedB = service.getPilotOrderOverview(db, orderBId);
    assert.strictEqual(untouchedB.status, "DRAFT");
    const untouchedCanonical = service.getPilotOverview(db);
    assert.strictEqual(untouchedCanonical.status, "DRAFT");
  });

  // -------------------------------------------------------------------
  // 9./10. Ungültige Statusübergänge bleiben blockiert; bestehende
  // Freigabeschritte bleiben erforderlich (pro Auftrag, nicht nur kanonisch).
  // -------------------------------------------------------------------

  await check("9. ein ungültiger Statusübergang bleibt für Auftrag B blockiert (startExecution ohne Freigabe)", () => {
    assert.throws(() => service.startExecution(db, { pilotOrderId: orderBId }), /nur nach Freigabe/);
  });

  await check("10. die Ausführungsfreigabe bleibt für Auftrag A erforderlich (confirmed === true)", () => {
    assert.throws(() => service.approveForExecution(db, { pilotOrderId: orderAId }), /confirmed === true/);
    assert.throws(() => service.approveForExecution(db, { pilotOrderId: orderAId, confirmed: false }), /confirmed === true/);
  });

  service.approveForExecution(db, { pilotOrderId: orderAId, confirmed: true });
  service.startExecution(db, { pilotOrderId: orderAId });

  // -------------------------------------------------------------------
  // 4./5. Agentenergebnisse, PM-Befund und PM-Entscheidung bleiben
  // auftragsbezogen.
  // -------------------------------------------------------------------

  const handoffA = service.submitHandoff(
    db,
    handoffInput({
      pilotOrderId: orderAId,
      shortFinding: "AUFTRAG-A-FUND",
      resultOrRecommendation: "AUFTRAG-A-ERGEBNIS",
    }),
  );

  await check("4a. das Agentenergebnis wird Auftrag A zugeordnet und beeinflusst Auftrag B nicht", () => {
    assert.strictEqual(handoffA.handoff.pilotOrderId, orderAId);
    const overviewAfterA = service.getPilotOrderOverview(db, orderAId);
    assert.strictEqual(overviewAfterA.handoffs.length, 1);
    assert.strictEqual(overviewAfterA.handoffs[0].resultOrRecommendation, "AUFTRAG-A-ERGEBNIS");

    const overviewBUnchanged = service.getPilotOrderOverview(db, orderBId);
    assert.strictEqual(overviewBUnchanged.handoffs.length, 0);

    const canonicalUnchanged = service.getPilotOverview(db);
    assert.strictEqual(canonicalUnchanged.handoffs.length, 0);
  });

  await check("5. der Projektmanager-Filterbefund (PASSED/REJECTED) bleibt auftragsbezogen", () => {
    assert.strictEqual(handoffA.filterResult.passed, true);
    // Eine bewusst unvollständige Übergabe für Auftrag B (noch in DRAFT)
    // muss unabhängig von Auftrag A abgelehnt werden (falscher Status).
    assert.throws(
      () => service.submitHandoff(db, handoffInput({ pilotOrderId: orderBId })),
      /nur während IN_EXECUTION/,
    );
  });

  // -------------------------------------------------------------------
  // 8. Ein ungültiger oder unbekannter Auftrag kann nicht unkontrolliert
  // verändert werden.
  // -------------------------------------------------------------------

  const UNKNOWN_ORDER_ID = "pilot-order-does-not-exist";

  await check("8. ein unbekannter Auftrag kann weder gelesen noch verändert werden", () => {
    assert.throws(() => service.getPilotOrderOverview(db, UNKNOWN_ORDER_ID), /wurde nicht gefunden/);
    assert.throws(() => service.markReadyForApproval(db, { pilotOrderId: UNKNOWN_ORDER_ID }), /wurde nicht gefunden/);
    assert.throws(
      () => service.submitHandoff(db, handoffInput({ pilotOrderId: UNKNOWN_ORDER_ID })),
      /wurde nicht gefunden/,
    );
    assert.throws(() => service.approveForExecution(db, { pilotOrderId: UNKNOWN_ORDER_ID, confirmed: true }), /wurde nicht gefunden/);
    // Auch ein leerer/fehlender Wert darf niemals stillschweigend auf den
    // kanonischen Auftrag oder irgendeinen anderen Auftrag ausweichen, wenn
    // eine ausdrückliche Leseabfrage über getPilotOrderOverview erfolgt.
    assert.throws(() => service.getPilotOrderOverview(db, ""), /pilotOrderId ist erforderlich/);
    assert.throws(() => service.getPilotOrderOverview(db, null), /pilotOrderId ist erforderlich/);
  });

  // -------------------------------------------------------------------
  // 12. Mehrere Aufträge können nacheinander bis zum vorgesehenen Zustand
  // geführt werden (hier: bis COMPLETED).
  // -------------------------------------------------------------------

  // Auftrag A ist bereits IN_EXECUTION mit einer eingereichten Rollenübergabe
  // (siehe handoffA oben) – hier wird der Lauf zu Ende geführt, ohne ihn
  // erneut von DRAFT aus zu starten (kein "erneutes Anlegen" eines bereits
  // laufenden Auftrags).
  service.submitHandoff(
    db,
    handoffInput({
      pilotOrderId: orderAId,
      fromPilotRole: "RECHERCHE_ANALYSE",
      toPilotRole: "DOKUMENTATION",
      shortFinding: "AUFTRAG-A: Recherche abgeschlossen.",
      resultOrRecommendation: "AUFTRAG-A: Dokumentiertes Endergebnis liegt vor.",
    }),
  );
  service.submitForReview(db, { pilotOrderId: orderAId });
  const completedA = service.approveCompletion(db, { pilotOrderId: orderAId, confirmed: true });

  await check("12a. Auftrag A kann vollständig bis COMPLETED geführt werden", () => {
    assert.strictEqual(completedA.status, "COMPLETED");
    assert.ok(completedA.handoffs.every((handoff) => handoff.resultOrRecommendation.startsWith("AUFTRAG-A")));
  });

  const completedB = driveToCompleted(db, orderBId, "AUFTRAG-B");

  await check("12b. Auftrag B kann anschließend, unabhängig von Auftrag A, ebenfalls bis COMPLETED geführt werden", () => {
    assert.strictEqual(completedB.status, "COMPLETED");
    assert.ok(completedB.handoffs.every((handoff) => handoff.resultOrRecommendation.startsWith("AUFTRAG-B")));
  });

  await check("4b. beide abgeschlossenen Aufträge behalten ausschließlich ihre eigenen Agentenergebnisse", () => {
    const finalA = service.getPilotOrderOverview(db, orderAId);
    const finalB = service.getPilotOrderOverview(db, orderBId);
    assert.strictEqual(finalA.handoffs.length, 2);
    assert.strictEqual(finalB.handoffs.length, 2);
    finalA.handoffs.forEach((handoff) => assert.ok(handoff.resultOrRecommendation.startsWith("AUFTRAG-A")));
    finalB.handoffs.forEach((handoff) => assert.ok(handoff.resultOrRecommendation.startsWith("AUFTRAG-B")));
    assert.strictEqual(service.getPilotOverview(db).handoffs.length, 0, "der kanonische Auftrag bleibt unberührt");
  });

  // -------------------------------------------------------------------
  // 13. Eine erneute Ausführung überschreibt keinen bereits abgeschlossenen
  // Auftrag.
  // -------------------------------------------------------------------

  await check("13a. ein abgeschlossener Auftrag (COMPLETED) kann nicht erneut verändert werden", () => {
    assert.throws(() => service.markReadyForApproval(db, { pilotOrderId: orderAId }), /bereits abgeschlossen/);
    assert.throws(() => service.blockOrder(db, { pilotOrderId: orderAId, reason: "Testfixtur" }), /bereits abgeschlossen/);
  });

  await check("13b. createPilotOrder kann die ID eines bereits abgeschlossenen Auftrags nicht wiederverwenden", () => {
    assert.throws(() => service.createPilotOrder(db, orderInput(), { id: orderAId }), /existiert bereits/);
  });

  // -------------------------------------------------------------------
  // 6./7. Audit-Ereignisse enthalten die korrekte Auftragszuordnung; Audit-
  // Historien verschiedener Aufträge werden nicht vermischt.
  // -------------------------------------------------------------------

  function pilotAuditEventsFor(orderId) {
    return authDb
      .listAuditEvents(db, {})
      .filter((event) => event.eventType.startsWith("PILOT_"))
      .filter((event) => {
        if (!event.metadata) return false;
        try {
          return JSON.parse(event.metadata).pilotOrderId === orderId;
        } catch (_error) {
          return false;
        }
      });
  }

  const auditEventsA = pilotAuditEventsFor(orderAId);
  const auditEventsB = pilotAuditEventsFor(orderBId);
  const auditEventsCanonical = pilotAuditEventsFor(service.CANONICAL_PILOT_ORDER_ID);

  await check("6. jedes Audit-Ereignis eines Auftrags trägt genau dessen pilotOrderId", () => {
    assert.ok(auditEventsA.length > 0);
    assert.ok(auditEventsB.length > 0);
    auditEventsA.forEach((event) => assert.strictEqual(JSON.parse(event.metadata).pilotOrderId, orderAId));
    auditEventsB.forEach((event) => assert.strictEqual(JSON.parse(event.metadata).pilotOrderId, orderBId));
  });

  await check("6b. Statuswechsel-Audits enthalten Vorher-/Nachher-Status und sind eindeutig zugeordnet", () => {
    const statusEventsA = auditEventsA.filter((event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED");
    assert.ok(statusEventsA.length >= 5, "Auftrag A sollte mehrere Statuswechsel-Audits besitzen (DRAFT...COMPLETED)");
    statusEventsA.forEach((event) => {
      const metadata = JSON.parse(event.metadata);
      assert.ok(service.PILOT_WORK_ORDER_STATUS_VALUES.includes(metadata.previousStatus));
      assert.ok(service.PILOT_WORK_ORDER_STATUS_VALUES.includes(metadata.nextStatus));
      assert.ok(event.timestamp);
      assert.ok(event.eventId);
    });
  });

  await check("7. Audit-Historien der drei Aufträge (A, B, kanonisch) sind disjunkt (keine Vermischung)", () => {
    const idsA = new Set(auditEventsA.map((event) => event.eventId));
    const idsB = new Set(auditEventsB.map((event) => event.eventId));
    const idsCanonical = new Set(auditEventsCanonical.map((event) => event.eventId));
    idsA.forEach((id) => assert.ok(!idsB.has(id) && !idsCanonical.has(id)));
    idsB.forEach((id) => assert.ok(!idsA.has(id) && !idsCanonical.has(id)));
    // Der kanonische Auftrag hat nur seine eigene Anlage protokolliert
    // (aus getOrCreateCanonicalPilotOrder/getPilotOverview weiter oben),
    // niemals Ereignisse aus A oder B.
    assert.ok(idsCanonical.size >= 1);
  });

  // -------------------------------------------------------------------
  // 11. Der bisherige Einzelauftragsfall funktioniert weiterhin
  // (Standardaufruf ohne pilotOrderId bleibt exakt der kanonische Auftrag).
  // -------------------------------------------------------------------

  await check("11a. getPilotOverview()/getOrCreateCanonicalPilotOrder() ohne pilotOrderId liefern weiterhin den kanonischen Auftrag", () => {
    const canonicalViaDefault = service.getPilotOverview(db);
    const canonicalViaExplicit = service.getPilotOrderOverview(db, service.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(canonicalViaDefault.order.id, service.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(canonicalViaDefault.order.id, canonicalViaExplicit.order.id);
    assert.strictEqual(canonicalViaDefault.status, canonicalViaExplicit.status);
  });

  await check("11b. der kanonische Einzelauftrag kann weiterhin ohne pilotOrderId vollständig bis COMPLETED geführt werden", () => {
    service.markReadyForApproval(db);
    service.approveForExecution(db, { confirmed: true });
    service.startExecution(db);
    service.submitHandoff(db, handoffInput());
    service.submitHandoff(
      db,
      handoffInput({
        fromPilotRole: "RECHERCHE_ANALYSE",
        toPilotRole: "DOKUMENTATION",
        shortFinding: "Kanonisch: Recherche abgeschlossen.",
        resultOrRecommendation: "Kanonisch: Dokumentiertes Endergebnis liegt vor.",
      }),
    );
    service.submitForReview(db);
    const finalCanonical = service.approveCompletion(db, { confirmed: true });
    assert.strictEqual(finalCanonical.status, "COMPLETED");
    // Die beiden anderen, längst abgeschlossenen Aufträge bleiben davon
    // unberührt.
    assert.strictEqual(service.getPilotOrderOverview(db, orderAId).handoffs.length, 2);
    assert.strictEqual(service.getPilotOrderOverview(db, orderBId).handoffs.length, 2);
  });

  // -------------------------------------------------------------------
  // Auftragsverwaltung: listPilotOrders liefert alle angelegten Aufträge,
  // ohne sie zu vermischen.
  // -------------------------------------------------------------------

  await check("listPilotOrders liefert genau die angelegten, eindeutig unterscheidbaren Aufträge", () => {
    const all = service.listPilotOrders(db);
    const ids = all.map((order) => order.id);
    assert.ok(ids.includes(orderAId));
    assert.ok(ids.includes(orderBId));
    assert.ok(ids.includes(service.CANONICAL_PILOT_ORDER_ID));
    assert.ok(ids.includes("pilot-order-test-deterministic"));
    assert.strictEqual(new Set(ids).size, ids.length, "keine doppelten IDs");
  });

  // -------------------------------------------------------------------
  // 15. Bestehende Health-Referenzdaten bleiben unverändert.
  // -------------------------------------------------------------------

  await check("15. der Health-Referenzlauf bleibt durch sämtliche Pilotauftrags-Operationen unverändert", () => {
    const healthAfter = JSON.stringify(healthService.getOrCreateCanonicalRun(db));
    assert.strictEqual(healthAfter, healthBaseline);
  });

  console.log(`pilot-work-order-multi-order.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-multi-order.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
