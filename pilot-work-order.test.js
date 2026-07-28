"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – erster produktiver Pilotlauf.
// Fachlogik-/Persistenztests für pilot-work-order-service.js – unabhängig
// von HTTP (siehe pilot-work-order-security.test.js für die HTTP-/
// Zugriffsschicht und pilot-work-order-ui.test.js für die UI-
// Quelltextprüfung).
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// health-reference-work-run.test.js), niemals die echte Application-
// Support-Datenbank. Dieses Modul führt niemals eine externe Aktion aus.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const agentRegistry = require("./agent-registry");
const service = require("./pilot-work-order-service");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "pilot-work-order-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function validHandoffInput(overrides = {}) {
  return {
    fromPilotRole: "PROJEKTMANAGER",
    toPilotRole: "RECHERCHE_ANALYSE",
    shortFinding: "Auftrag geklärt, Recherche kann beginnen.",
    resultOrRecommendation: "Bitte belastbare Inhalte zum Thema erarbeiten.",
    basisUsed: "Auftragstext und Qualitätskriterien des Pilotauftrags.",
    riskOrLimit: "Zeitrahmen ist offen, keine feste Deadline.",
    nextStep: "Recherche starten und Ergebnis dokumentieren.",
    ...overrides,
  };
}

async function run() {
  const { db } = makeIsolatedDb();

  // -------------------------------------------------------------------
  // Agentenzuordnung – keine neuen Agenten, exakt 25 bleiben bestehen.
  // -------------------------------------------------------------------

  await check("exakt 25 kanonische Agenten bleiben bestehen (unverändert durch dieses Modul)", () => {
    assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
  });

  await check("alle drei Pilotrollen sind bereits bekannten, kanonischen Agenten zugeordnet (kein Agent 26)", () => {
    service.PILOT_TEAM.forEach((agent) => {
      assert.ok(agentRegistry.hasAgentId(agent.agentKey), `${agent.agentKey} ist kein bekannter Agent`);
    });
    assert.strictEqual(service.PILOT_TEAM.length, 3);
    assert.strictEqual(typeof agentRegistry.registerAgent, "undefined");
    assert.strictEqual(typeof agentRegistry.addAgent, "undefined");
  });

  await check("Projektmanager-Agent und Dokumentations-Agent sind exakte Rollentreffer; Recherche-/Analyse-Agent ist offen dokumentiert", () => {
    assert.strictEqual(service.PROJECT_MANAGER_AGENT.isExactRoleMatch, true);
    assert.strictEqual(service.DOCUMENTATION_AGENT.isExactRoleMatch, true);
    assert.strictEqual(service.RESEARCH_ANALYSIS_AGENT.isExactRoleMatch, false);
    assert.ok(service.RESEARCH_ANALYSIS_AGENT.mappingNote.length > 0);
  });

  // -------------------------------------------------------------------
  // 1. Gültige Pilotauftragserstellung.
  // -------------------------------------------------------------------

  await check("1a. der kanonische Pilotauftragsinhalt ist vollständig und wird von validatePilotOrderInput akzeptiert", () => {
    assert.doesNotThrow(() => service.validatePilotOrderInput(service.CANONICAL_PILOT_ORDER_INPUT));
  });

  const initialOverview = service.getOrCreateCanonicalPilotOrder(db);

  await check("1b. der Pilotauftrag startet als DRAFT mit allen Pflichtfeldern gesetzt", () => {
    assert.strictEqual(initialOverview.order.status, "DRAFT");
    assert.strictEqual(initialOverview.order.id, service.CANONICAL_PILOT_ORDER_ID);
    assert.ok(initialOverview.order.title.length > 0);
    assert.ok(initialOverview.order.desiredOutcome.length > 0);
    assert.strictEqual(initialOverview.order.requestedBy, "Jamal");
    assert.ok(initialOverview.order.qualityCriteria.length > 0);
    assert.ok(initialOverview.order.allowedTools.length > 0);
    assert.ok(initialOverview.order.forbiddenActions.length > 0);
    assert.ok(initialOverview.order.requiredApprovals.length > 0);
    assert.ok(initialOverview.order.timeframe.length > 0);
    assert.strictEqual(initialOverview.involvedAgents.length, 3);
  });

  await check("1c. getOrCreateCanonicalPilotOrder ist idempotent (kein zweiter Pilotauftrag)", () => {
    const again = service.getOrCreateCanonicalPilotOrder(db);
    assert.strictEqual(again.order.id, initialOverview.order.id);
  });

  // -------------------------------------------------------------------
  // 2. Ablehnung unvollständiger Aufträge.
  // -------------------------------------------------------------------

  await check("2. validatePilotOrderInput weist jedes fehlende Pflichtfeld einzeln ab", () => {
    const fields = ["title", "desiredOutcome", "requestedBy", "qualityCriteria", "allowedTools", "forbiddenActions", "requiredApprovals", "timeframe"];
    fields.forEach((field) => {
      const incomplete = { ...service.CANONICAL_PILOT_ORDER_INPUT };
      delete incomplete[field];
      assert.throws(() => service.validatePilotOrderInput(incomplete), /unvollständig/, `${field} hätte abgelehnt werden müssen`);
    });
  });

  await check("2b. leere Arrays/Strings gelten als unvollständig", () => {
    assert.throws(() => service.validatePilotOrderInput({ ...service.CANONICAL_PILOT_ORDER_INPUT, title: "   " }), /unvollständig/);
    assert.throws(() => service.validatePilotOrderInput({ ...service.CANONICAL_PILOT_ORDER_INPUT, qualityCriteria: [] }), /unvollständig/);
  });

  // -------------------------------------------------------------------
  // 5. Freigabegrenze vor Ausführung.
  // -------------------------------------------------------------------

  await check("5a. approveForExecution ohne confirmed === true wird abgewiesen", () => {
    assert.throws(() => service.approveForExecution(db, {}), /confirmed === true/);
    assert.throws(() => service.approveForExecution(db, { confirmed: false }), /confirmed === true/);
  });

  await check("5b. startExecution kann nicht ohne vorherige Freigabe erreicht werden", () => {
    assert.throws(() => service.startExecution(db, {}), /nur nach Freigabe/);
  });

  await check("5c. approveForExecution ist nur aus READY_FOR_JAMAL_APPROVAL möglich", () => {
    assert.throws(() => service.approveForExecution(db, { confirmed: true }), /nur aus READY_FOR_JAMAL_APPROVAL/);
  });

  // -------------------------------------------------------------------
  // 7. Korrekten Statusübergang (Teil 1: DRAFT → ... → IN_EXECUTION).
  // -------------------------------------------------------------------

  await check("7a. markReadyForApproval führt DRAFT nach READY_FOR_JAMAL_APPROVAL", () => {
    const overview = service.markReadyForApproval(db);
    assert.strictEqual(overview.status, "READY_FOR_JAMAL_APPROVAL");
  });

  await check("7b. keine automatische Freigabe durch einen Agenten: erst confirmed === true erreicht APPROVED_FOR_EXECUTION", () => {
    const overview = service.approveForExecution(db, { confirmed: true, note: "Testfixtur-Freigabe durch Jamal." });
    assert.strictEqual(overview.status, "APPROVED_FOR_EXECUTION");
  });

  await check("7c. startExecution führt APPROVED_FOR_EXECUTION nach IN_EXECUTION", () => {
    const overview = service.startExecution(db);
    assert.strictEqual(overview.status, "IN_EXECUTION");
  });

  // -------------------------------------------------------------------
  // 4. Projektmanager-Qualitätsfilter (reine Funktion).
  // -------------------------------------------------------------------

  const orderForFilterTests = service.getPilotOverview(db).order;

  await check("4a. runProjectManagerFilter lässt eine vollständige, passende Übergabe durch", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: orderForFilterTests.id,
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "Quelle A und B.",
      riskOrLimit: "Kein bekanntes Risiko.",
      forbiddenActionOccurred: false,
      autonomyBoundaryRespected: true,
    });
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.reasons.length, 0);
  });

  await check("4b. runProjectManagerFilter lehnt ab, wenn das Ergebnis nicht zum Auftrag passt", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: "irgendein-anderer-auftrag",
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "Quelle A.",
      riskOrLimit: "Kein Risiko.",
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.reasons.includes("Ergebnis passt zum Auftrag"));
  });

  await check("4c. runProjectManagerFilter lehnt ab, wenn keine Grundlage/Quelle nachvollziehbar ist", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: orderForFilterTests.id,
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "",
      riskOrLimit: "Kein Risiko.",
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.reasons.includes("Quellen oder Grundlagen sind nachvollziehbar"));
  });

  await check("4d. runProjectManagerFilter lehnt ab, wenn kein Risiko benannt ist", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: orderForFilterTests.id,
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "Quelle A.",
      riskOrLimit: "",
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.reasons.includes("Risiken sind genannt"));
  });

  await check("4e. runProjectManagerFilter lehnt ab, wenn eine verbotene Aktion erfolgt ist", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: orderForFilterTests.id,
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "Quelle A.",
      riskOrLimit: "Kein Risiko.",
      forbiddenActionOccurred: true,
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.reasons.includes("keine verbotene Aktion ist erfolgt"));
  });

  await check("4f. runProjectManagerFilter lehnt ab, wenn Jamals Freigabegrenze verletzt wurde", () => {
    const result = service.runProjectManagerFilter(orderForFilterTests, {
      pilotOrderId: orderForFilterTests.id,
      resultOrRecommendation: "Ergebnis liegt vor.",
      basisUsed: "Quelle A.",
      riskOrLimit: "Kein Risiko.",
      autonomyBoundaryRespected: false,
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.reasons.includes("Jamals Freigabegrenze ist eingehalten"));
  });

  // -------------------------------------------------------------------
  // 3. Korrekte Rollenübergabe.
  // -------------------------------------------------------------------

  await check("3a. submitHandoff lehnt eine unvollständige Übergabe ab (fehlende Pflichtfelder)", () => {
    assert.throws(() => service.submitHandoff(db, { toPilotRole: "RECHERCHE_ANALYSE" }), /unvollständig/);
  });

  await check("3b. submitHandoff lehnt eine unbekannte Pilotrolle ab", () => {
    assert.throws(() => service.submitHandoff(db, validHandoffInput({ toPilotRole: "UNBEKANNT" })), /toPilotRole ist unbekannt/);
  });

  const firstHandoffResult = service.submitHandoff(db, validHandoffInput());

  await check("3c. eine vollständige, passende Rollenübergabe wird angenommen (PM-Filter PASSED) und enthält alle geforderten Felder", () => {
    const handoff = firstHandoffResult.handoff;
    assert.strictEqual(handoff.pmFilterStatus, "PASSED");
    assert.strictEqual(handoff.sequence, 1);
    ["shortFinding", "resultOrRecommendation", "basisUsed", "riskOrLimit", "nextStep"].forEach((field) => {
      assert.ok(isNonEmpty(handoff[field]), `${field} fehlt in der Rollenübergabe`);
    });
  });

  function isNonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  await check("3d. eine zweite Rollenübergabe erhöht die Sequenz fortlaufend", () => {
    const second = service.submitHandoff(
      db,
      validHandoffInput({
        fromPilotRole: "RECHERCHE_ANALYSE",
        toPilotRole: "DOKUMENTATION",
        shortFinding: "Recherche abgeschlossen.",
        resultOrRecommendation: "Ergebnis liegt strukturiert vor.",
        decisionNeeded: "Passt die Struktur so für Jamal?",
      }),
    );
    assert.strictEqual(second.handoff.sequence, 2);
    assert.strictEqual(second.handoff.decisionNeeded, "Passt die Struktur so für Jamal?");
  });

  // -------------------------------------------------------------------
  // 6. Blockierung verbotener Aktionen.
  // -------------------------------------------------------------------

  await check("6a. assertToolOrActionAllowed lehnt ein nicht erlaubtes Werkzeug ab", () => {
    assert.throws(() => service.assertToolOrActionAllowed(orderForFilterTests, "unbekanntes Werkzeug"), /kein erlaubtes Werkzeug/);
  });

  await check("6b. assertToolOrActionAllowed lehnt eine ausdrücklich verbotene Aktion ab, auch wenn sie fälschlich als Werkzeug angefragt wird", () => {
    assert.throws(() => service.assertToolOrActionAllowed(orderForFilterTests, "Deployment"), /verbotene Aktion/);
  });

  await check("6c. assertToolOrActionAllowed erlaubt ein tatsächlich erlaubtes Werkzeug", () => {
    assert.ok(service.assertToolOrActionAllowed(orderForFilterTests, orderForFilterTests.allowedTools[0]));
  });

  await check("6d. eine Rollenübergabe mit forbiddenActionOccurred blockiert sofort den gesamten Pilotauftrag (BLOCKED)", () => {
    const blockedResult = service.submitHandoff(
      db,
      validHandoffInput({
        fromPilotRole: "DOKUMENTATION",
        toPilotRole: "PROJEKTMANAGER",
        forbiddenActionOccurred: true,
      }),
    );
    assert.strictEqual(blockedResult.filterResult.passed, false);
    const overview = service.getPilotOverview(db);
    assert.strictEqual(overview.status, "BLOCKED");
  });

  await check("6e. ein blockierter Pilotauftrag lässt keine weitere Rollenübergabe zu", () => {
    assert.throws(() => service.submitHandoff(db, validHandoffInput()), /nur während IN_EXECUTION/);
  });

  // -------------------------------------------------------------------
  // 7 (Teil 2). Korrekten Statusübergang – Rückkehr aus BLOCKED, erneuter
  // vollständiger Durchlauf bis COMPLETED.
  // -------------------------------------------------------------------

  await check("7d. unblockOrder führt BLOCKED nach RETURNED", () => {
    const overview = service.unblockOrder(db);
    assert.strictEqual(overview.status, "RETURNED");
  });

  await check("7e. reopenFromReturned führt RETURNED nach DRAFT", () => {
    const overview = service.reopenFromReturned(db);
    assert.strictEqual(overview.status, "DRAFT");
  });

  await check("7f. ein vollständiger, korrekter Durchlauf bis COMPLETED ist möglich", () => {
    service.markReadyForApproval(db);
    service.approveForExecution(db, { confirmed: true });
    service.startExecution(db);
    service.submitHandoff(db, validHandoffInput());
    service.submitHandoff(
      db,
      validHandoffInput({
        fromPilotRole: "RECHERCHE_ANALYSE",
        toPilotRole: "DOKUMENTATION",
        shortFinding: "Struktur erstellt.",
        resultOrRecommendation: "Dokumentiertes Endergebnis liegt vor.",
      }),
    );
    let overview = service.submitForReview(db);
    assert.strictEqual(overview.status, "READY_FOR_REVIEW");
    overview = service.approveCompletion(db, { confirmed: true });
    assert.strictEqual(overview.status, "COMPLETED");
  });

  await check("7g. submitForReview ohne angenommenes Dokumentations-Ergebnis wird abgewiesen", () => {
    const { db: freshDb } = makeIsolatedDb("pilot-work-order-test-review-gate-");
    service.getOrCreateCanonicalPilotOrder(freshDb);
    service.markReadyForApproval(freshDb);
    service.approveForExecution(freshDb, { confirmed: true });
    service.startExecution(freshDb);
    assert.throws(() => service.submitForReview(freshDb), /kein vom Projektmanager-Filter angenommenes Dokumentations-Ergebnis/);
  });

  await check("7h. approveCompletion ohne confirmed === true wird abgewiesen", () => {
    assert.throws(() => service.approveCompletion(db, {}), /confirmed === true/);
  });

  await check("7i. nach COMPLETED ist der Pilotauftrag unveränderlich", () => {
    assert.throws(() => service.markReadyForApproval(db), /bereits abgeschlossen/);
    assert.throws(() => service.blockOrder(db, { reason: "Testfixtur" }), /bereits abgeschlossen/);
  });

  // -------------------------------------------------------------------
  // 8. Ergebnisübersicht.
  // -------------------------------------------------------------------

  await check("8. die Ergebnisübersicht enthält Auftrag, Agenten, Status, Ergebnisse, offene Entscheidung, Risiken/Grenzen und nächsten Schritt", () => {
    const overview = service.getPilotOverview(db);
    assert.ok(overview.order);
    assert.strictEqual(overview.involvedAgents.length, 3);
    assert.strictEqual(overview.status, "COMPLETED");
    assert.ok(Array.isArray(overview.handoffs) && overview.handoffs.length >= 4);
    assert.ok("openDecision" in overview);
    assert.ok(Array.isArray(overview.risksAndLimits));
    assert.ok(overview.risksAndLimits.length > 0);
    assert.ok(typeof overview.nextStep === "string" && overview.nextStep.length > 0);
    assert.ok(overview.autonomyBoundaries);
    assert.strictEqual(overview.autonomyBoundaries.autoApprovalByAgentAllowed, false);
  });

  await check("die Autonomiegrenzen dieses Pilotlaufs schließen jede externe Aktion aus", () => {
    const boundaries = service.getPilotOverview(db).autonomyBoundaries;
    assert.strictEqual(boundaries.noExternalAction, true);
    assert.strictEqual(boundaries.noEmailOrMessageSent, true);
    assert.strictEqual(boundaries.noPublication, true);
    assert.strictEqual(boundaries.noPaymentOrContract, true);
    assert.strictEqual(boundaries.noDeployment, true);
    assert.strictEqual(boundaries.noHealthUpgradeKompassChange, true);
    assert.strictEqual(boundaries.noNewAgentCreated, true);
    assert.ok(Object.isFrozen(boundaries));
  });

  // -------------------------------------------------------------------
  // Audit-Nachweis dieses Laufs – hier fachlogisch, HTTP-seitig
  // zusätzlich in pilot-work-order-security.test.js geprüft.
  // -------------------------------------------------------------------

  await check("Audit erfasst Anlage, Statuswechsel, Rollenübergaben, Filterergebnisse und Freigaben", () => {
    const events = authDb.listAuditEvents(db, { limit: 500 }).filter((event) => event.eventType.startsWith("PILOT_"));
    const eventTypes = new Set(events.map((event) => event.eventType));
    [
      "PILOT_WORK_ORDER_CREATED",
      "PILOT_WORK_ORDER_STATUS_CHANGED",
      "PILOT_HANDOFF_SUBMITTED",
      "PILOT_HANDOFF_ACCEPTED_BY_PM_FILTER",
      "PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION",
      "PILOT_EXECUTION_APPROVAL_RECORDED",
      "PILOT_COMPLETION_APPROVAL_RECORDED",
    ].forEach((expectedType) => assert.ok(eventTypes.has(expectedType), `fehlendes Auditereignis: ${expectedType}`));
    events.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /gewicht|diagnose|medizinisch|kilogramm/i);
    });
  });

  console.log(`pilot-work-order.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
