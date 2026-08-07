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

function validCreateOrderInput(overrides = {}) {
  return {
    title: "Zusätzlicher Test-Pilotauftrag",
    desiredOutcome: "Die Anlagegrenzen des Pilotauftrags werden fachlich überprüft.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis beantwortet die Auftragsfrage", "Risiken sind benannt"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart (APPROVED_FOR_EXECUTION)"],
    timeframe: "Ohne festes Enddatum.",
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

  function expectLengthValidationError(input, expectedFieldLabel, expectedLimit, expectedLength) {
    const beforeOrderCount = service.listPilotOrders(db).length;
    let error = null;
    try {
      service.createPilotOrder(db, input);
    } catch (thrown) {
      error = thrown;
    }
    assert.ok(error, "es muss ein Fehler geworfen werden");
    assert.strictEqual(error.statusCode, 400);
    assert.ok(error.message.includes(expectedFieldLabel), "Feldname fehlt in der Fehlermeldung");
    assert.ok(error.message.includes(`höchstens ${expectedLimit} Zeichen`), "Grenze fehlt in der Fehlermeldung");
    assert.ok(error.message.includes(`aktuell ${expectedLength}`), "aktuelle Länge fehlt in der Fehlermeldung");
    assert.strictEqual(service.listPilotOrders(db).length, beforeOrderCount, "bei 400 darf kein Auftrag angelegt werden");
  }

  await check("2c. title mit 200 Zeichen wird angenommen", () => {
    const title = "T".repeat(200);
    const overview = service.createPilotOrder(db, validCreateOrderInput({ title }));
    assert.strictEqual(overview.order.title.length, 200);
  });

  await check("2d. title mit 201 Zeichen wird mit 400 abgelehnt", () => {
    const title = "T".repeat(201);
    expectLengthValidationError(validCreateOrderInput({ title }), "Titel", 200, 201);
  });

  await check("2e. desiredOutcome mit 2000 Zeichen wird angenommen", () => {
    const desiredOutcome = "E".repeat(2000);
    const overview = service.createPilotOrder(db, validCreateOrderInput({ desiredOutcome }));
    assert.strictEqual(overview.order.desiredOutcome.length, 2000);
  });

  await check("2f. desiredOutcome mit 2001 Zeichen wird mit 400 abgelehnt", () => {
    const desiredOutcome = "E".repeat(2001);
    expectLengthValidationError(validCreateOrderInput({ desiredOutcome }), "gewünschte Ergebnis", 2000, 2001);
  });

  await check("2g. requestedBy mit 200 Zeichen wird angenommen", () => {
    const requestedBy = "R".repeat(200);
    const overview = service.createPilotOrder(db, validCreateOrderInput({ requestedBy }));
    assert.strictEqual(overview.order.requestedBy.length, 200);
  });

  await check("2h. requestedBy mit 201 Zeichen wird mit 400 abgelehnt", () => {
    const requestedBy = "R".repeat(201);
    expectLengthValidationError(validCreateOrderInput({ requestedBy }), "Angefordert von", 200, 201);
  });

  await check("2i. timeframe mit 500 Zeichen wird angenommen", () => {
    const timeframe = "Z".repeat(500);
    const overview = service.createPilotOrder(db, validCreateOrderInput({ timeframe }));
    assert.strictEqual(overview.order.timeframe.length, 500);
  });

  await check("2j. timeframe mit 501 Zeichen wird mit 400 abgelehnt", () => {
    const timeframe = "Z".repeat(501);
    expectLengthValidationError(validCreateOrderInput({ timeframe }), "Zeitrahmen", 500, 501);
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
    // V8.7 Stufe A – rein additiv: beide Felder sind IMMER vorhanden. Dieser
    // Auftrag wurde nie manuell blockiert oder zurückgegeben, deshalb sind
    // sie leer (kein Backfill, keine Ableitung aus Status oder Handoffs).
    assert.ok("currentDecisionReason" in overview);
    assert.ok("decisionReasonHistory" in overview);
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
  });

  // V8.7 Stufe A ("Blockierungs- und Rückgabegründe dauerhaft sichern") – der
  // bei blockOrder(reason)/returnOrder(note) eingegebene Freitext wurde bis
  // V8.6 nur geprüft und danach verworfen. Hier wird ausschließlich die
  // Sichtbarkeit im Overview mitgeprüft; die vollständigen Prüfungen
  // (Persistierung, Aktualitätsregel, Historie, Validierung, Atomarität,
  // Append-only, Migration 25) stehen in
  // pilot-work-order-decision-reason.test.js.
  await check("8b. V8.7: ein manuell blockierter Auftrag liefert den gespeicherten Grund als currentDecisionReason und behält ihn danach historisch", () => {
    const { db: reasonDb } = makeIsolatedDb("pilot-work-order-test-decision-reason-");
    const created = service.createPilotOrder(reasonDb, validCreateOrderInput({ title: "Auftrag mit Entscheidungsgrund" }));
    const pilotOrderId = created.order.id;
    service.markReadyForApproval(reasonDb, { pilotOrderId });

    const reason = "Blockiert: die erforderliche Rechtsfreigabe liegt noch nicht vor.";
    const blocked = service.blockOrder(reasonDb, { pilotOrderId, reason, actorUserId: "owner-1" });
    assert.strictEqual(blocked.status, "BLOCKED");
    assert.ok(blocked.currentDecisionReason, "der eingegebene Grund muss jetzt dauerhaft vorliegen");
    assert.strictEqual(blocked.currentDecisionReason.kind, "BLOCK");
    assert.strictEqual(blocked.currentDecisionReason.text, reason);
    assert.strictEqual(blocked.currentDecisionReason.setByUserId, "owner-1");
    assert.strictEqual(blocked.currentDecisionReason.fromStatus, "READY_FOR_JAMAL_APPROVAL");
    assert.strictEqual(blocked.currentDecisionReason.toStatus, "BLOCKED");
    assert.strictEqual(blocked.currentDecisionReason.orderRevision, blocked.order.revision);
    assert.strictEqual(blocked.decisionReasonHistory.length, 1);

    // Nach dem Weiterführen gilt der Grund nur noch historisch – die
    // Aktualität hängt ausschließlich an der Auftragsrevision.
    const unblocked = service.unblockOrder(reasonDb, { pilotOrderId });
    assert.strictEqual(unblocked.status, "RETURNED");
    assert.strictEqual(unblocked.currentDecisionReason, null);
    assert.strictEqual(unblocked.decisionReasonHistory.length, 1);
    assert.strictEqual(unblocked.decisionReasonHistory[0].text, reason);
  });

  await check("8c. V8.7: ein zu kurzer oder sicherheitskritischer Grund wird mit 400 abgewiesen und verändert den Auftrag nicht", () => {
    const { db: rejectDb } = makeIsolatedDb("pilot-work-order-test-decision-reason-reject-");
    const created = service.createPilotOrder(rejectDb, validCreateOrderInput({ title: "Auftrag mit abgewiesenem Grund" }));
    const pilotOrderId = created.order.id;
    service.markReadyForApproval(rejectDb, { pilotOrderId });

    assert.throws(() => service.blockOrder(rejectDb, { pilotOrderId, reason: "abc" }), /zu kurz/);
    assert.throws(() => service.blockOrder(rejectDb, { pilotOrderId, reason: "Der token ist abgelaufen." }), /Sicherheitsgründen/);
    const overview = service.getPilotOrderOverview(rejectDb, pilotOrderId);
    assert.strictEqual(overview.status, "READY_FOR_JAMAL_APPROVAL", "ein abgewiesener Grund darf den Status nie verändern");
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
  });

  // -------------------------------------------------------------------
  // Teilpaket 1 – "Historischen decisionNeeded-Text nicht mehr als aktuelle
  // Entscheidung anzeigen".
  //
  // `openDecision` beantwortet ausschließlich die Frage "was ist JETZT zu
  // entscheiden?". `handoffs[].decisionNeeded` ist dagegen der historische
  // Freitext einer einzelnen Rollenübergabe. Er wurde bis hierher als
  // Rückfallwert für `openDecision` verwendet, ohne den aktuellen Status zu
  // berücksichtigen – und blieb dadurch nach jedem Statuswechsel als
  // vermeintlich offene Entscheidung stehen, bei COMPLETED sogar dauerhaft,
  // obwohl dort nach assertOrderIsMutable() gar keine Aktion mehr möglich ist.
  //
  // Die Regel lautet jetzt: der Rückfallwert greift ausschließlich bei
  // IN_EXECUTION. Das ist der einzige Status, in dem der Text aktuell sein
  // KANN, denn submitHandoff() legt eine Übergabe nur aus IN_EXECUTION heraus
  // an – jeder andere Status beweist damit einen zwischenzeitlichen
  // Statuswechsel und macht den Text zu Historie.
  //
  // Die folgenden Prüfpunkte fahren dazu jeweils einen echten Auftrag über
  // die regulären Dienstfunktionen durch die Statusmaschine; es wird nichts
  // direkt in die Datenbank geschrieben und kein Status künstlich gesetzt.
  const HISTORIC_DECISION_NEEDED =
    "Jamal entscheidet über den Abschluss dieses Pilotlaufs (COMPLETED) oder gibt ihn zur Überarbeitung zurück.";

  // Bringt einen frischen Auftrag bis IN_EXECUTION und hinterlässt dort genau
  // eine angenommene Dokumentations-Übergabe mit historischem
  // decisionNeeded-Text. Ab hier ist jeder weitere Statuswechsel im jeweiligen
  // Prüfpunkt fachlich echt.
  function orderInExecutionWithDecisionNeeded(prefix, title) {
    const { db: tpDb } = makeIsolatedDb(prefix);
    const created = service.createPilotOrder(tpDb, validCreateOrderInput({ title }));
    const pilotOrderId = created.order.id;
    service.markReadyForApproval(tpDb, { pilotOrderId });
    service.approveForExecution(tpDb, { pilotOrderId, confirmed: true });
    service.startExecution(tpDb, { pilotOrderId });
    const submitted = service.submitHandoff(
      tpDb,
      validHandoffInput({
        pilotOrderId,
        fromPilotRole: "RECHERCHE_ANALYSE",
        toPilotRole: "DOKUMENTATION",
        decisionNeeded: HISTORIC_DECISION_NEEDED,
      }),
    );
    assert.strictEqual(submitted.filterResult.passed, true);
    const overview = service.getPilotOrderOverview(tpDb, pilotOrderId);
    assert.strictEqual(overview.status, "IN_EXECUTION");
    assert.strictEqual(overview.handoffs.length, 1);
    assert.strictEqual(overview.handoffs[0].pmFilterStatus, "PASSED");
    assert.strictEqual(overview.handoffs[0].decisionNeeded, HISTORIC_DECISION_NEEDED);
    return { db: tpDb, pilotOrderId, overview };
  }

  // Der historische Text darf durch diese Korrektur nirgends verloren gehen –
  // er bleibt unverkürzt und unverändert in der Übergabe erhalten, aus der
  // die Detailansicht ihre "Übergabedetails" speist.
  function assertHistoryPreserved(overview) {
    const lastHandoff = overview.handoffs[overview.handoffs.length - 1];
    assert.strictEqual(overview.handoffs.length, 1, "es darf keine Übergabe verschwinden oder hinzukommen");
    assert.strictEqual(
      lastHandoff.decisionNeeded,
      HISTORIC_DECISION_NEEDED,
      "der historische Text muss vollständig und unverändert in der Übergabe erhalten bleiben",
    );
  }

  await check("TP1-1. IN_EXECUTION zeigt einen aktuellen decisionNeeded-Text weiterhin unverändert als offene Entscheidung", () => {
    const { overview } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-in-execution-", "TP1 laufender Auftrag");
    assert.strictEqual(overview.openDecision, HISTORIC_DECISION_NEEDED, "in IN_EXECUTION bleibt der Text die aktuelle Entscheidung");
  });

  await check("TP1-2. IN_EXECUTION ohne decisionNeeded erfindet weiterhin keine offene Entscheidung", () => {
    const { db: tpDb } = makeIsolatedDb("pilot-work-order-test-tp1-no-decision-");
    const created = service.createPilotOrder(tpDb, validCreateOrderInput({ title: "TP1 ohne Entscheidungsbedarf" }));
    const pilotOrderId = created.order.id;
    service.markReadyForApproval(tpDb, { pilotOrderId });
    service.approveForExecution(tpDb, { pilotOrderId, confirmed: true });
    service.startExecution(tpDb, { pilotOrderId });
    service.submitHandoff(tpDb, validHandoffInput({ pilotOrderId, toPilotRole: "DOKUMENTATION" }));
    const overview = service.getPilotOrderOverview(tpDb, pilotOrderId);
    assert.strictEqual(overview.status, "IN_EXECUTION");
    assert.strictEqual(overview.handoffs[0].decisionNeeded, null);
    assert.strictEqual(overview.openDecision, null);
  });

  await check("TP1-3. COMPLETED liefert keine offene Entscheidung mehr, behält den historischen Text aber vollständig in der Übergabe", () => {
    const { db: tpDb, pilotOrderId } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-completed-", "TP1 abgeschlossener Auftrag");

    const review = service.submitForReview(tpDb, { pilotOrderId });
    assert.strictEqual(review.status, "READY_FOR_REVIEW");
    assert.strictEqual(
      review.openDecision,
      "Jamal muss das Ergebnis abnehmen (COMPLETED) oder zur Überarbeitung zurückgeben.",
      "die explizite Abschlussentscheidung bleibt unverändert bestehen",
    );

    const completed = service.approveCompletion(tpDb, { pilotOrderId, confirmed: true });
    assert.strictEqual(completed.status, "COMPLETED");
    assert.strictEqual(completed.openDecision, null, "ein abgeschlossener Auftrag hat keine offene Entscheidung mehr");
    assertHistoryPreserved(completed);

    // Auch beim erneuten Laden (nicht nur im Rückgabewert des Übergangs).
    const reloaded = service.getPilotOrderOverview(tpDb, pilotOrderId);
    assert.strictEqual(reloaded.status, "COMPLETED");
    assert.strictEqual(reloaded.openDecision, null);
    assertHistoryPreserved(reloaded);

    // Statusmaschine unverändert: COMPLETED bleibt terminal.
    assert.throws(() => service.returnOrder(tpDb, { pilotOrderId, note: "Nachträgliche Rückgabe versuchen." }), /abgeschlossen/);
    assert.strictEqual(service.getPilotOrderOverview(tpDb, pilotOrderId).status, "COMPLETED");
  });

  await check("TP1-4. RETURNED zeigt keinen historischen Text mehr, der aktuelle Rückgabegrund bleibt vollständig erhalten", () => {
    const { db: tpDb, pilotOrderId } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-returned-", "TP1 zurückgegebener Auftrag");
    service.submitForReview(tpDb, { pilotOrderId });

    const returnNote = "Zurückgegeben: die Quellenangaben im Ergebnis sind noch nicht belastbar.";
    const returned = service.returnOrder(tpDb, { pilotOrderId, note: returnNote, actorUserId: "owner-1" });
    assert.strictEqual(returned.status, "RETURNED");
    assert.strictEqual(returned.openDecision, null, "der historische Übergabetext darf hier nicht mehr als aktuelle Entscheidung erscheinen");
    assertHistoryPreserved(returned);

    // Der aktuelle Rückgabegrund stammt aus der eigenen, revisionsgebundenen
    // Quelle und bleibt von dieser Korrektur unberührt.
    assert.ok(returned.currentDecisionReason, "der Rückgabegrund muss unverändert vorliegen");
    assert.strictEqual(returned.currentDecisionReason.kind, "RETURN");
    assert.strictEqual(returned.currentDecisionReason.text, returnNote);
    assert.strictEqual(returned.currentDecisionReason.toStatus, "RETURNED");
    assert.strictEqual(returned.currentDecisionReason.orderRevision, returned.order.revision);
    assert.strictEqual(returned.decisionReasonHistory.length, 1);
  });

  await check("TP1-5. DRAFT nach Rückgabe und Neustart zeigt keinen historischen Text als aktuelle Entscheidung", () => {
    const { db: tpDb, pilotOrderId } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-draft-", "TP1 neu gestarteter Auftrag");
    service.submitForReview(tpDb, { pilotOrderId });
    service.returnOrder(tpDb, { pilotOrderId, note: "Zurückgegeben: die Auftragsfrage ist noch nicht vollständig beantwortet." });

    const draft = service.reopenFromReturned(tpDb, { pilotOrderId });
    assert.strictEqual(draft.status, "DRAFT");
    assert.strictEqual(draft.openDecision, null);
    assertHistoryPreserved(draft);
  });

  await check("TP1-6. READY_FOR_JAMAL_APPROVAL und APPROVED_FOR_EXECUTION im zweiten Durchlauf zeigen keinen historischen Text", () => {
    const { db: tpDb, pilotOrderId } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-approved-", "TP1 Auftrag im zweiten Durchlauf");
    service.submitForReview(tpDb, { pilotOrderId });
    service.returnOrder(tpDb, { pilotOrderId, note: "Zurückgegeben: der Auftrag wird in einem zweiten Durchlauf geschärft." });
    service.reopenFromReturned(tpDb, { pilotOrderId });

    const readyForApproval = service.markReadyForApproval(tpDb, { pilotOrderId });
    assert.strictEqual(readyForApproval.status, "READY_FOR_JAMAL_APPROVAL");
    assert.strictEqual(
      readyForApproval.openDecision,
      "Jamal muss die Ausführung freigeben (APPROVED_FOR_EXECUTION) oder den Auftrag zurückgeben.",
      "die explizite Freigabeentscheidung bleibt unverändert bestehen",
    );

    const approved = service.approveForExecution(tpDb, { pilotOrderId, confirmed: true });
    assert.strictEqual(approved.status, "APPROVED_FOR_EXECUTION");
    assert.strictEqual(approved.openDecision, null, "vor dem Ausführungsstart gilt der Text des vorigen Durchlaufs nicht mehr");
    assertHistoryPreserved(approved);

    // Sobald die Ausführung wieder läuft, ist der Text erneut aktuell – die
    // Regel hängt allein am Status, nicht am Alter des Textes.
    const running = service.startExecution(tpDb, { pilotOrderId });
    assert.strictEqual(running.status, "IN_EXECUTION");
    assert.strictEqual(running.openDecision, HISTORIC_DECISION_NEEDED);
  });

  await check("TP1-7. BLOCKED zeigt trotz historischem Übergabetext unverändert die explizite Blockierentscheidung", () => {
    const { db: tpDb, pilotOrderId } = orderInExecutionWithDecisionNeeded("pilot-work-order-test-tp1-blocked-", "TP1 blockierter Auftrag");

    const blockReason = "Blockiert: die benötigte Quelle ist derzeit nicht zugänglich.";
    const blocked = service.blockOrder(tpDb, { pilotOrderId, reason: blockReason });
    assert.strictEqual(blocked.status, "BLOCKED");
    assert.strictEqual(
      blocked.openDecision,
      "Jamal muss den Blocker klären, bevor der Pilotlauf fortgesetzt werden kann.",
      "die explizite Blockierentscheidung hat weiterhin Vorrang und bleibt wortgleich",
    );
    assert.ok(blocked.currentDecisionReason);
    assert.strictEqual(blocked.currentDecisionReason.kind, "BLOCK");
    assert.strictEqual(blocked.currentDecisionReason.text, blockReason);
    assertHistoryPreserved(blocked);
  });

  await check("TP1-8. die acht bekannten Auftragsstatus bleiben unverändert (keine neue Statusmaschine)", () => {
    assert.deepStrictEqual(service.PILOT_WORK_ORDER_STATUS_VALUES, [
      "DRAFT",
      "READY_FOR_JAMAL_APPROVAL",
      "APPROVED_FOR_EXECUTION",
      "IN_EXECUTION",
      "READY_FOR_REVIEW",
      "COMPLETED",
      "RETURNED",
      "BLOCKED",
    ]);
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

  // V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen") – 12.:
  // die Freigabe-Audit-Ereignisse dürfen ausschließlich pilotOrderId
  // enthalten – niemals das `confirmed`-Flag, eine `note`, einen Token oder
  // einen Ergebnistext (auch nicht über einen zukünftigen unbedachten
  // Zusatz, siehe pilot-work-order-service.js#approveForExecution/
  // #approveCompletion).
  await check("die Freigabe-Audit-Ereignisse (Ausführung/Abschluss) enthalten ausschließlich pilotOrderId, keine Tokens/Prompts/Ergebnisse", () => {
    const events = authDb.listAuditEvents(db, { limit: 500 }).filter(
      (event) => event.eventType === "PILOT_EXECUTION_APPROVAL_RECORDED" || event.eventType === "PILOT_COMPLETION_APPROVAL_RECORDED",
    );
    assert.ok(events.length >= 2, "es sollten beide Freigabe-Audit-Ereignisse aus diesem Lauf vorliegen");
    events.forEach((event) => {
      const metadata = event.metadata && typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata || {};
      assert.deepStrictEqual(Object.keys(metadata).sort(), ["pilotOrderId"]);
      assert.doesNotMatch(JSON.stringify(metadata), /confirmed|token|note|prompt|result/i);
    });
  });

  console.log(`pilot-work-order.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
