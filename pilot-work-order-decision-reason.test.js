"use strict";

// V8.7 Stufe A ("Blockierungs- und Rückgabegründe dauerhaft sichern") –
// gezielte Prüfungen für die neue, append-only Fachtabelle
// pilot_work_order_decision_reasons (Migration 25), den gemeinsamen
// Schreibpfad in pilot-work-order-service.js#blockOrder/#returnOrder sowie
// die rein additive Overview-Erweiterung (currentDecisionReason /
// decisionReasonHistory).
//
// Bis V8.6 wurden blockOrder(reason) und returnOrder(note) ausschließlich auf
// Vorhandensein geprüft und danach VERWORFEN. Das System konnte deshalb
// dauerhaft nicht beantworten, warum ein Auftrag blockiert oder
// zurückgegeben wurde. Genau diese Verluststelle prüft dieses Modul.
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// pilot-work-order.test.js), niemals die echte Application-Support-Datenbank.
// Dieses Modul führt niemals eine externe Aktion aus.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const authAudit = require("./auth-audit");
const migrations = require("./auth-db-migrations");
const service = require("./pilot-work-order-service");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "pilot-decision-reason-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function orderInput(overrides = {}) {
  return {
    title: "Testauftrag: Entscheidungsgründe",
    desiredOutcome: "Nachweis, dass Blockierungs- und Rückgabegründe dauerhaft gesichert werden.",
    requestedBy: "Jamal",
    qualityCriteria: ["Ergebnis passt zum Auftrag"],
    allowedTools: ["interne Dokumentenablage (read-only)"],
    forbiddenActions: ["externe Schreibzugriffe"],
    requiredApprovals: ["Freigabe vor Ausführungsstart"],
    timeframe: "ohne festes Enddatum",
    ...overrides,
  };
}

function createOrder(db, overrides = {}) {
  return service.createPilotOrder(db, orderInput(overrides)).order.id;
}

// Bringt einen frisch angelegten Auftrag ausschließlich über die echten
// Servicefunktionen nach IN_EXECUTION (keine rohen UPDATEs).
function driveToInExecution(db, pilotOrderId) {
  service.markReadyForApproval(db, { pilotOrderId });
  service.approveForExecution(db, { pilotOrderId, confirmed: true });
  service.startExecution(db, { pilotOrderId });
  return service.getPilotOrderOverview(db, pilotOrderId);
}

function readReasonRows(db, pilotOrderId) {
  return db
    .prepare("SELECT * FROM pilot_work_order_decision_reasons WHERE pilotOrderId = ? ORDER BY orderRevisionAfter ASC")
    .all(pilotOrderId);
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

  // ===================================================================
  // A. Persistierung (Prüfpunkte 1–9)
  // ===================================================================

  const blockOrderId = createOrder(db, { title: "Testauftrag: Blockierung" });
  driveToInExecution(db, blockOrderId);
  const revisionBeforeBlock = service.getPilotOrderOverview(db, blockOrderId).order.revision;
  const blockReasonText = "Externe Rechtsfreigabe fehlt, Auftrag darf nicht weiterlaufen.";
  const blockedAt = "2026-08-04T10:00:00.000Z";
  const blockedOverview = service.blockOrder(db, {
    pilotOrderId: blockOrderId,
    reason: blockReasonText,
    actorUserId: "owner-1",
    now: blockedAt,
  });

  await check("A1. blockOrder speichert den konkreten Grund dauerhaft (bisherige Verluststelle geschlossen)", () => {
    const rows = readReasonRows(db, blockOrderId);
    assert.strictEqual(rows.length, 1, "genau eine Gründe-Zeile erwartet");
    assert.strictEqual(rows[0].reasonText, blockReasonText);
  });

  await check("A3. reasonKind ist bei blockOrder BLOCK", () => {
    assert.strictEqual(readReasonRows(db, blockOrderId)[0].reasonKind, "BLOCK");
  });

  await check("A5./A6. fromStatus und toStatus des Blockierungsübergangs sind korrekt gespeichert", () => {
    const row = readReasonRows(db, blockOrderId)[0];
    assert.strictEqual(row.fromStatus, "IN_EXECUTION");
    assert.strictEqual(row.toStatus, "BLOCKED");
    assert.strictEqual(blockedOverview.status, "BLOCKED");
  });

  await check("A7. Auftragsrevision vor und nach dem Statuswechsel ist exakt gespeichert", () => {
    const row = readReasonRows(db, blockOrderId)[0];
    assert.strictEqual(row.orderRevisionBefore, revisionBeforeBlock);
    assert.strictEqual(row.orderRevisionAfter, revisionBeforeBlock + 1);
    assert.strictEqual(row.orderRevisionAfter, blockedOverview.order.revision);
  });

  await check("A8. actorUserId wird korrekt gespeichert", () => {
    assert.strictEqual(readReasonRows(db, blockOrderId)[0].actorUserId, "owner-1");
  });

  await check("A9. createdAt entspricht dem Entscheidungszeitpunkt", () => {
    assert.strictEqual(readReasonRows(db, blockOrderId)[0].createdAt, blockedAt);
  });

  const returnOrderId = createOrder(db, { title: "Testauftrag: Rückgabe" });
  driveToInExecution(db, returnOrderId);
  const revisionBeforeReturn = service.getPilotOrderOverview(db, returnOrderId).order.revision;
  const returnNoteText = "Ergebnis ist unvollständig, bitte Quellenlage nachvollziehbar ergänzen.";
  service.returnOrder(db, { pilotOrderId: returnOrderId, note: returnNoteText });

  await check("A2. returnOrder speichert die konkrete Notiz dauerhaft", () => {
    const rows = readReasonRows(db, returnOrderId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].reasonText, returnNoteText);
  });

  await check("A4. reasonKind ist bei returnOrder RETURN", () => {
    assert.strictEqual(readReasonRows(db, returnOrderId)[0].reasonKind, "RETURN");
  });

  await check("A8b. actorUserId ist null, wenn kein Akteur übergeben wurde (kein erfundener Nutzer)", () => {
    const row = readReasonRows(db, returnOrderId)[0];
    assert.strictEqual(row.actorUserId, null);
    assert.strictEqual(row.fromStatus, "IN_EXECUTION");
    assert.strictEqual(row.toStatus, "RETURNED");
    assert.strictEqual(row.orderRevisionAfter, revisionBeforeReturn + 1);
  });

  // ===================================================================
  // B. Aktualität und Historie (Prüfpunkte 10–16)
  // ===================================================================

  await check("B(Vorbedingung). unmittelbar nach der Blockierung ist der Grund der aktuell gültige", () => {
    const overview = service.getPilotOrderOverview(db, blockOrderId);
    assert.ok(overview.currentDecisionReason, "currentDecisionReason darf hier nicht null sein");
    assert.strictEqual(overview.currentDecisionReason.kind, "BLOCK");
    assert.strictEqual(overview.currentDecisionReason.text, blockReasonText);
    assert.strictEqual(overview.currentDecisionReason.setAt, blockedAt);
    assert.strictEqual(overview.currentDecisionReason.setByUserId, "owner-1");
    assert.strictEqual(overview.currentDecisionReason.fromStatus, "IN_EXECUTION");
    assert.strictEqual(overview.currentDecisionReason.toStatus, "BLOCKED");
    assert.strictEqual(overview.currentDecisionReason.orderRevision, overview.order.revision);
  });

  await check("B10. BLOCKED → RETURNED macht den Block-Grund historisch (currentDecisionReason wird null)", () => {
    const overview = service.unblockOrder(db, { pilotOrderId: blockOrderId });
    assert.strictEqual(overview.status, "RETURNED");
    assert.strictEqual(overview.currentDecisionReason, null, "der Blockgrund gilt nach dem Weiterlaufen nicht mehr");
    assert.strictEqual(overview.decisionReasonHistory.length, 1, "die Historie bleibt vollständig erhalten");
    assert.strictEqual(overview.decisionReasonHistory[0].text, blockReasonText);
  });

  await check("B11. RETURNED → DRAFT macht den Rückgabe-Grund historisch", () => {
    const before = service.getPilotOrderOverview(db, returnOrderId);
    assert.ok(before.currentDecisionReason, "vor dem Weiterführen ist der Rückgabegrund aktuell");
    const overview = service.reopenFromReturned(db, { pilotOrderId: returnOrderId });
    assert.strictEqual(overview.status, "DRAFT");
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.strictEqual(overview.decisionReasonHistory.length, 1);
    assert.strictEqual(overview.decisionReasonHistory[0].text, returnNoteText);
  });

  const secondBlockReason = "Erneute Blockierung: offene Sicherheitsfrage muss zuerst geklärt werden.";
  await check("B12. eine erneute Blockierung erzeugt einen neuen, aktuell gültigen Grund", () => {
    const overview = service.blockOrder(db, { pilotOrderId: blockOrderId, reason: secondBlockReason });
    assert.strictEqual(overview.status, "BLOCKED");
    assert.ok(overview.currentDecisionReason);
    assert.strictEqual(overview.currentDecisionReason.text, secondBlockReason);
    assert.strictEqual(overview.currentDecisionReason.fromStatus, "RETURNED");
    assert.strictEqual(overview.currentDecisionReason.orderRevision, overview.order.revision);
  });

  await check("B13. die Historie enthält alten und neuen Grund in aufsteigender, historisch richtiger Reihenfolge", () => {
    const history = service.getPilotOrderOverview(db, blockOrderId).decisionReasonHistory;
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].text, blockReasonText);
    assert.strictEqual(history[1].text, secondBlockReason);
    assert.ok(history[0].orderRevision < history[1].orderRevision, "aufsteigend nach Auftragsrevision");
  });

  await check("B14. ein früherer Grund erscheint nie wieder als aktueller Grund", () => {
    const overview = service.getPilotOrderOverview(db, blockOrderId);
    assert.notStrictEqual(overview.currentDecisionReason.text, blockReasonText);
    assert.strictEqual(overview.currentDecisionReason.text, secondBlockReason);
    const historic = overview.decisionReasonHistory.filter((entry) => entry.orderRevision !== overview.order.revision);
    assert.strictEqual(historic.length, 1);
    assert.strictEqual(historic[0].text, blockReasonText);
  });

  await check("B15. genau eine Gründe-Zeile passt zur aktuellen Auftragsrevision", () => {
    const overview = service.getPilotOrderOverview(db, blockOrderId);
    const matching = overview.decisionReasonHistory.filter((entry) => entry.orderRevision === overview.order.revision);
    assert.strictEqual(matching.length, 1);
    const rows = readReasonRows(db, blockOrderId).filter((row) => row.orderRevisionAfter === overview.order.revision);
    assert.strictEqual(rows.length, 1, "auch datenbankseitig darf es nur eine passende Zeile geben");
  });

  await check("B16. ein Auftrag ohne jeden Grund liefert null und ein leeres Array (kein Backfill, keine Erfindung)", () => {
    const freshId = createOrder(db, { title: "Testauftrag: niemals blockiert" });
    const overview = service.getPilotOrderOverview(db, freshId);
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
  });

  // ===================================================================
  // C. Systemseitige Übergänge (Prüfpunkte 17–21)
  // ===================================================================

  await check("C17. ein systemseitiger Übergang nach BLOCKED (verbotene Aktion) erzeugt KEINEN Grundeintrag", () => {
    const { db: forbiddenDb } = makeIsolatedDb("pilot-decision-reason-forbidden-");
    const orderId = createOrder(forbiddenDb, { title: "Testauftrag: verbotene Aktion" });
    driveToInExecution(forbiddenDb, orderId);
    service.submitHandoff(forbiddenDb, validHandoffInput({ pilotOrderId: orderId, forbiddenActionOccurred: true }));
    const overview = service.getPilotOrderOverview(forbiddenDb, orderId);
    assert.strictEqual(overview.status, "BLOCKED", "der systemseitige Übergang muss tatsächlich stattgefunden haben");
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
    assert.strictEqual(readReasonRows(forbiddenDb, orderId).length, 0);
  });

  await check("C18. eine PM-Filter-Ablehnung nach RETURNED erzeugt KEINEN Grundeintrag", () => {
    const { db: pmDb } = makeIsolatedDb("pilot-decision-reason-pmfilter-");
    const orderId = createOrder(pmDb, { title: "Testauftrag: PM-Filter" });
    driveToInExecution(pmDb, orderId);
    service.submitHandoff(pmDb, validHandoffInput({ pilotOrderId: orderId, autonomyBoundaryRespected: false }));
    const overview = service.getPilotOrderOverview(pmDb, orderId);
    assert.strictEqual(overview.status, "RETURNED", "die Ablehnung muss tatsächlich zu RETURNED geführt haben");
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
    assert.strictEqual(readReasonRows(pmDb, orderId).length, 0);
  });

  await check("C19./C20./C21. kein Grund wird aus riskOrLimit, decisionNeeded oder pmFilterReasonsJson abgeleitet", () => {
    const { db: derivedDb } = makeIsolatedDb("pilot-decision-reason-derive-");
    const orderId = createOrder(derivedDb, { title: "Testauftrag: keine Ableitung" });
    driveToInExecution(derivedDb, orderId);
    const markerRisk = "MARKER-RISIKO: Grenze der Autonomie erreicht.";
    const markerDecision = "MARKER-ENTSCHEIDUNG: Jamal muss entscheiden.";
    service.submitHandoff(
      derivedDb,
      validHandoffInput({
        pilotOrderId: orderId,
        riskOrLimit: markerRisk,
        decisionNeeded: markerDecision,
        autonomyBoundaryRespected: false,
      }),
    );
    const overview = service.getPilotOrderOverview(derivedDb, orderId);
    assert.strictEqual(overview.status, "RETURNED");
    assert.strictEqual(overview.currentDecisionReason, null);
    assert.deepStrictEqual(overview.decisionReasonHistory, []);
    // Die Marker existieren nachweislich in den Handoff-Daten – sie dürfen
    // trotzdem NIRGENDS als Entscheidungsgrund auftauchen.
    assert.ok(overview.risksAndLimits.includes(markerRisk), "der Handoff-Risikotext muss unverändert vorhanden sein");
    const handoffRow = derivedDb.prepare("SELECT pmFilterReasonsJson FROM pilot_handoffs WHERE pilotOrderId = ?").get(orderId);
    assert.ok(handoffRow.pmFilterReasonsJson && handoffRow.pmFilterReasonsJson.length > 2, "es müssen echte PM-Filter-Gründe vorliegen");
    assert.strictEqual(readReasonRows(derivedDb, orderId).length, 0);
  });

  // ===================================================================
  // D. Validierung (Prüfpunkte 22–41)
  // ===================================================================

  const { db: validationDb } = makeIsolatedDb("pilot-decision-reason-validation-");
  const validationOrderId = createOrder(validationDb, { title: "Testauftrag: Validierung" });
  driveToInExecution(validationDb, validationOrderId);

  function expectRejected(value, pattern, field = "reason") {
    const options = { pilotOrderId: validationOrderId };
    if (field === "reason") options.reason = value;
    else options.note = value;
    assert.throws(
      () => (field === "reason" ? service.blockOrder(validationDb, options) : service.returnOrder(validationDb, options)),
      (error) => {
        assert.strictEqual(error.statusCode, 400, `erwartet wurde eine 400-Systemrückmeldung, war: ${error.statusCode}`);
        assert.match(error.message, pattern);
        return true;
      },
    );
    // Kein abgewiesener Versuch darf jemals eine Zeile hinterlassen und
    // niemals den Status verändern.
    assert.strictEqual(readReasonRows(validationDb, validationOrderId).length, 0);
    assert.strictEqual(service.getPilotOrderOverview(validationDb, validationOrderId).status, "IN_EXECUTION");
  }

  await check("D22. leerer Text wird mit 400 abgewiesen", () => expectRejected("", /erforderlich/));
  await check("D23. reiner Leerraum wird mit 400 abgewiesen", () => expectRejected("     ", /erforderlich/));
  await check("D24. weniger als 5 Zeichen wird mit 400 abgewiesen", () => expectRejected("abcd", /zu kurz|mindestens 5/));
  await check("D27. mehr als 500 Zeichen wird mit 400 abgewiesen", () => expectRejected("a".repeat(501), /zu lang|höchstens 500/));
  await check("D31. ein C0-Steuerzeichen wird abgewiesen", () => expectRejected("Grund mit\u0007Steuerzeichen", /Steuerzeichen/));
  await check("D32. HTML-artiger Text wird abgewiesen", () => expectRejected("Grund <script>alert(1)</script>", /HTML/));
  await check("D33. ein /Users/-Pfad wird abgewiesen", () => expectRejected("Fehler in /Users/jamal/Documents/geheim.txt", /vertraulich|Sicherheitsgründen/));
  await check("D34. ein C:\\-Pfad wird abgewiesen", () => expectRejected("Fehler in C:\\Users\\jamal\\datei.txt", /vertraulich|Sicherheitsgründen/));
  await check("D35. token wird abgewiesen", () => expectRejected("Der token ist abgelaufen.", /vertraulich|Sicherheitsgründen/));
  await check("D36. password wird abgewiesen", () => expectRejected("Das password stimmt nicht.", /vertraulich|Sicherheitsgründen/));
  await check("D37. cookie wird abgewiesen", () => expectRejected("Das cookie fehlt in der Anfrage.", /vertraulich|Sicherheitsgründen/));
  await check("D38. session-id wird abgewiesen", () => expectRejected("Die session-id ist ungültig.", /vertraulich|Sicherheitsgründen/));

  await check("D22b./D24b. dieselben Regeln gelten unverändert für returnOrder(note)", () => {
    expectRejected("", /erforderlich/, "note");
    expectRejected("abcd", /zu kurz|mindestens 5/, "note");
    expectRejected("Die session-id ist ungültig.", /vertraulich|Sicherheitsgründen/, "note");
  });

  await check("D(Datenschutz). eine abgewiesene Eingabe wird NIEMALS in der Fehlermeldung gespiegelt", () => {
    const secret = "Das password lautet Sonnenschein-4711.";
    assert.throws(
      () => service.blockOrder(validationDb, { pilotOrderId: validationOrderId, reason: secret }),
      (error) => {
        assert.doesNotMatch(error.message, /Sonnenschein-4711/);
        assert.strictEqual(JSON.stringify(error.details || {}).includes("Sonnenschein"), false);
        return true;
      },
    );
  });

  await check("D25. genau 5 Zeichen sind erlaubt", () => {
    const { db: minDb } = makeIsolatedDb("pilot-decision-reason-min-");
    const orderId = createOrder(minDb, { title: "Testauftrag: Mindestlänge" });
    driveToInExecution(minDb, orderId);
    const overview = service.blockOrder(minDb, { pilotOrderId: orderId, reason: "abcde" });
    assert.strictEqual(overview.currentDecisionReason.text, "abcde");
    assert.strictEqual(overview.currentDecisionReason.text.length, 5);
  });

  await check("D26./D28. genau 500 Zeichen sind erlaubt und werden ungekürzt gespeichert (kein stilles Kürzen)", () => {
    const { db: maxDb } = makeIsolatedDb("pilot-decision-reason-max-");
    const orderId = createOrder(maxDb, { title: "Testauftrag: Maximallänge" });
    driveToInExecution(maxDb, orderId);
    const text = "G".repeat(500);
    const overview = service.blockOrder(maxDb, { pilotOrderId: orderId, reason: text });
    assert.strictEqual(overview.currentDecisionReason.text.length, 500);
    assert.strictEqual(overview.currentDecisionReason.text, text);
    assert.strictEqual(readReasonRows(maxDb, orderId)[0].reasonText, text);
  });

  await check("D29./D30. CRLF wird zu LF normalisiert, ein erlaubter Zeilenumbruch bleibt erhalten", () => {
    const { db: crlfDb } = makeIsolatedDb("pilot-decision-reason-crlf-");
    const orderId = createOrder(crlfDb, { title: "Testauftrag: Zeilenumbruch" });
    driveToInExecution(crlfDb, orderId);
    const overview = service.blockOrder(crlfDb, {
      pilotOrderId: orderId,
      reason: "Erste Zeile der Begründung.\r\nZweite Zeile der Begründung.",
    });
    const stored = overview.currentDecisionReason.text;
    assert.strictEqual(stored, "Erste Zeile der Begründung.\nZweite Zeile der Begründung.");
    assert.ok(!stored.includes("\r"), "es darf kein CR mehr enthalten sein");
    assert.ok(stored.includes("\n"), "der Zeilenumbruch selbst muss erhalten bleiben");
  });

  await check("D39./D40./D41. Umlaute, Klammern und technische Statuscodes bleiben unverändert erlaubter Text", () => {
    const { db: textDb } = makeIsolatedDb("pilot-decision-reason-text-");
    const orderId = createOrder(textDb, { title: "Testauftrag: Textzeichen" });
    driveToInExecution(textDb, orderId);
    const text = "Übergabe blockiert (Status BLOCKED, zuvor IN_EXECUTION, HTTP 409): Prüfung äußerst dringend, größer als erwartet.";
    const overview = service.blockOrder(textDb, { pilotOrderId: orderId, reason: text });
    assert.strictEqual(overview.currentDecisionReason.text, text);
    assert.ok(overview.currentDecisionReason.text.includes("äußerst"), "Umlaute bleiben unverändert");
    assert.ok(overview.currentDecisionReason.text.includes("(Status BLOCKED"), "Klammern bleiben unverändert");
    assert.ok(overview.currentDecisionReason.text.includes("HTTP 409"), "technische Statuscodes bleiben erlaubt");
  });

  await check("D(trim). führender/abschließender Leerraum wird getrimmt, der Kern bleibt unverändert", () => {
    const { db: trimDb } = makeIsolatedDb("pilot-decision-reason-trim-");
    const orderId = createOrder(trimDb, { title: "Testauftrag: Trim" });
    driveToInExecution(trimDb, orderId);
    const overview = service.blockOrder(trimDb, { pilotOrderId: orderId, reason: "   Begründung mit Leerraum.   " });
    assert.strictEqual(overview.currentDecisionReason.text, "Begründung mit Leerraum.");
  });

  // ===================================================================
  // E. Transaktion, CAS und Audit (Prüfpunkte 42–48)
  // ===================================================================

  await check("E42. eine falsche expectedRevision führt zum Konflikt UND hinterlässt keine Grundzeile", () => {
    const { db: casDb } = makeIsolatedDb("pilot-decision-reason-cas-");
    const orderId = createOrder(casDb, { title: "Testauftrag: CAS" });
    const current = driveToInExecution(casDb, orderId);
    assert.throws(
      () =>
        service.blockOrder(casDb, {
          pilotOrderId: orderId,
          reason: "Blockierung auf überholtem Auftragsstand.",
          expectedRevision: current.order.revision + 5,
        }),
      (error) => {
        assert.strictEqual(error.statusCode, 409);
        return true;
      },
    );
    assert.strictEqual(readReasonRows(casDb, orderId).length, 0, "nach einem Konflikt darf keine Grundzeile existieren");
    assert.strictEqual(service.getPilotOrderOverview(casDb, orderId).status, "IN_EXECUTION");
    assert.strictEqual(service.getPilotOrderOverview(casDb, orderId).order.revision, current.order.revision);
  });

  await check("E43./E45. schlägt der Grundeintrag fehl, wird auch der Statuswechsel vollständig zurückgerollt (echte Atomarität)", () => {
    const { db: atomicDb } = makeIsolatedDb("pilot-decision-reason-atomic-");
    const orderId = createOrder(atomicDb, { title: "Testauftrag: Atomarität" });
    const before = driveToInExecution(atomicDb, orderId);
    const auditCountBefore = atomicDb.prepare("SELECT COUNT(*) AS n FROM auth_audit_events").get().n;

    // Der Grundeintrag wird gezielt zum Scheitern gebracht. Wäre der
    // Statuswechsel NICHT in derselben Transaktionsklammer, bliebe der
    // Auftrag jetzt blockiert zurück – ohne den eingegebenen Grund.
    const original = authDb.insertPilotWorkOrderDecisionReason;
    authDb.insertPilotWorkOrderDecisionReason = () => {
      throw new Error("Testfixtur: Grundeintrag scheitert absichtlich.");
    };
    try {
      assert.throws(
        () => service.blockOrder(atomicDb, { pilotOrderId: orderId, reason: "Grund, der nicht gespeichert werden kann." }),
        /Testfixtur/,
      );
    } finally {
      authDb.insertPilotWorkOrderDecisionReason = original;
    }

    const after = service.getPilotOrderOverview(atomicDb, orderId);
    assert.strictEqual(after.status, "IN_EXECUTION", "der Statuswechsel muss zurückgerollt sein");
    assert.strictEqual(after.order.revision, before.order.revision, "die Revision darf sich nicht erhöht haben");
    assert.strictEqual(readReasonRows(atomicDb, orderId).length, 0, "es darf keine verwaiste Grundzeile geben");
    const auditCountAfter = atomicDb.prepare("SELECT COUNT(*) AS n FROM auth_audit_events").get().n;
    assert.strictEqual(auditCountAfter, auditCountBefore, "auch das Status-Audit muss mit zurückgerollt sein");
  });

  await check("E44./E46. ein erfolgreicher Statuswechsel erzeugt genau eine Grundzeile und genau ein Status-Audit-Ereignis", () => {
    const { db: auditDb } = makeIsolatedDb("pilot-decision-reason-audit-");
    const orderId = createOrder(auditDb, { title: "Testauftrag: Audit" });
    driveToInExecution(auditDb, orderId);
    const statusEventsBefore = authDb
      .listAuditEvents(auditDb, { limit: 500 })
      .filter((event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED" && String(event.metadata || "").includes(orderId)).length;

    service.blockOrder(auditDb, { pilotOrderId: orderId, reason: "Blockiert wegen offener Rückfrage an Jamal." });

    assert.strictEqual(readReasonRows(auditDb, orderId).length, 1, "genau eine Grundzeile");
    const statusEventsAfter = authDb
      .listAuditEvents(auditDb, { limit: 500 })
      .filter((event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED" && String(event.metadata || "").includes(orderId)).length;
    assert.strictEqual(statusEventsAfter - statusEventsBefore, 1, "das bestehende Status-Audit genau einmal, kein zweites Ereignis");
  });

  await check("E47. kein Audit-Ereignis enthält jemals den Freitext des Entscheidungsgrundes", () => {
    const { db: leakDb } = makeIsolatedDb("pilot-decision-reason-leak-");
    const orderId = createOrder(leakDb, { title: "Testauftrag: Auditgrenze" });
    driveToInExecution(leakDb, orderId);
    const marker = "EINDEUTIGER-GRUNDTEXT-MARKER-XYZ, dieser Satz darf niemals im Audit stehen.";
    service.blockOrder(leakDb, { pilotOrderId: orderId, reason: marker });
    const events = authDb.listAuditEvents(leakDb, { limit: 500 });
    events.forEach((event) => {
      assert.doesNotMatch(String(event.metadata || ""), /EINDEUTIGER-GRUNDTEXT-MARKER-XYZ/);
    });
    // Gegenprobe: der Text ist tatsächlich gespeichert – nur eben
    // ausschließlich in der dafür vorgesehenen Fachtabelle.
    assert.strictEqual(readReasonRows(leakDb, orderId)[0].reasonText, marker);
  });

  await check("E48. die Auditgrenze bleibt unverändert: kein neuer Ereignistyp, unveränderte Metadaten-Allowlist", () => {
    assert.ok(!authAudit.EVENT_TYPES.some((type) => /DECISION_REASON/i.test(type)), "kein neuer Auditereignistyp für Gründe");
    assert.ok(!migrations.AUDIT_EVENT_TYPES.some((type) => /DECISION_REASON/i.test(type)));
    ["reason", "note", "reasonText", "decisionReason"].forEach((forbidden) => {
      assert.ok(!authAudit.METADATA_ALLOWLIST.includes(forbidden), `${forbidden} darf nicht in der Audit-Allowlist stehen`);
    });
  });

  // ===================================================================
  // F. Append-only (Prüfpunkte 49–53)
  // ===================================================================

  await check("F49./F50. ein direkter UPDATE-Versuch scheitert und lässt die gespeicherte Zeile unverändert", () => {
    const rowBefore = readReasonRows(db, blockOrderId)[0];
    assert.throws(
      () => db.prepare("UPDATE pilot_work_order_decision_reasons SET reasonText = ? WHERE id = ?").run("manipuliert", rowBefore.id),
      /append-only/,
    );
    const rowAfter = db.prepare("SELECT * FROM pilot_work_order_decision_reasons WHERE id = ?").get(rowBefore.id);
    assert.deepStrictEqual(rowAfter, rowBefore, "die Zeile muss byte-gleich unverändert geblieben sein");
  });

  await check("F51. es wird bewusst keine Aktualisierungsfunktion für Gründe exportiert", () => {
    const updateLike = Object.keys(authDb).filter((key) => /decisionreason/i.test(key) && /^(update|set|edit|delete|remove)/i.test(key));
    assert.deepStrictEqual(updateLike, [], `unerwartete verändernde Exporte: ${updateLike.join(", ")}`);
    assert.strictEqual(typeof authDb.insertPilotWorkOrderDecisionReason, "function");
    assert.strictEqual(typeof authDb.listPilotWorkOrderDecisionReasons, "function");
  });

  await check("F52. ON DELETE CASCADE ist schema-seitig vorhanden", () => {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pilot_work_order_decision_reasons'").get().sql;
    assert.match(ddl, /REFERENCES pilot_work_orders\(id\) ON DELETE CASCADE/);
  });

  await check("F53. es existiert bewusst KEIN DELETE-Schutztrigger (sonst wäre der Auftrag nicht mehr löschbar)", () => {
    const triggers = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'pilot_work_order_decision_reasons'")
      .all();
    assert.strictEqual(triggers.length, 1, "genau ein Trigger erwartet");
    assert.match(triggers[0].sql, /BEFORE UPDATE/);
    assert.ok(!triggers.some((trigger) => /BEFORE\s+DELETE/i.test(trigger.sql)), "kein DELETE-Schutztrigger erlaubt");
  });

  // ===================================================================
  // G. Migration (Prüfpunkte 54–62)
  // ===================================================================

  await check("G55. Migration 25 ist genau einmal registriert und ist die höchste Version", () => {
    const versions = migrations.MIGRATIONS.map((migration) => migration.version);
    assert.strictEqual(versions.filter((version) => version === 25).length, 1);
    assert.strictEqual(Math.max(...versions), 25);
    assert.deepStrictEqual(versions, Array.from({ length: 25 }, (_, index) => index + 1), "lückenlos 1..25");
  });

  await check("G54./G57./G58./G59. Migration 25 ist angewendet; Tabelle, Index und UPDATE-Trigger existieren", () => {
    assert.ok(migrations.getAppliedVersions(db).includes(25));
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pilot_work_order_decision_reasons'").get();
    assert.ok(table, "Tabelle muss existieren");
    const index = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_pilot_work_order_decision_reasons_order_revision'")
      .get();
    assert.ok(index, "Index muss existieren");
    assert.match(index.sql, /pilotOrderId,\s*orderRevisionAfter DESC/);
    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_pilot_work_order_decision_reasons_no_update'")
      .get();
    assert.ok(trigger, "UPDATE-Schutztrigger muss existieren");
  });

  await check("G(DDL). die Tabellen-DDL entspricht exakt den verbindlichen Constraints", () => {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pilot_work_order_decision_reasons'").get().sql;
    assert.match(ddl, /reasonKind TEXT NOT NULL CHECK \(reasonKind IN \('BLOCK', 'RETURN'\)\)/);
    assert.match(ddl, /length\(reasonText\) BETWEEN 5 AND 500/);
    assert.match(ddl, /orderRevisionBefore INTEGER NOT NULL CHECK \(orderRevisionBefore >= 0\)/);
    assert.match(ddl, /orderRevisionAfter INTEGER NOT NULL CHECK \(orderRevisionAfter > orderRevisionBefore\)/);
    assert.match(ddl, /toStatus TEXT NOT NULL CHECK \(toStatus IN \('BLOCKED', 'RETURNED'\)\)/);
  });

  await check("G(Constraints wirken). die Datenbank weist zu kurze, zu lange, unbekannte und revisionswidrige Zeilen selbst ab", () => {
    const base = {
      pilotOrderId: blockOrderId,
      reasonKind: "BLOCK",
      reasonText: "Ausreichend langer Grundtext.",
      fromStatus: "IN_EXECUTION",
      toStatus: "BLOCKED",
      orderRevisionBefore: 1,
      orderRevisionAfter: 2,
      actorUserId: null,
      createdAt: new Date().toISOString(),
    };
    const insert = (overrides) => authDb.insertPilotWorkOrderDecisionReason(db, { id: `constraint-${Math.random()}`, ...base, ...overrides });
    assert.throws(() => insert({ reasonText: "abcd" }), /CHECK constraint failed/);
    assert.throws(() => insert({ reasonText: "a".repeat(501) }), /CHECK constraint failed/);
    assert.throws(() => insert({ reasonKind: "SOMETHING_ELSE" }), /CHECK constraint failed/);
    assert.throws(() => insert({ toStatus: "COMPLETED" }), /CHECK constraint failed/);
    assert.throws(() => insert({ orderRevisionBefore: 5, orderRevisionAfter: 5 }), /CHECK constraint failed/);
    assert.throws(() => insert({ orderRevisionBefore: -1, orderRevisionAfter: 1 }), /CHECK constraint failed/);
    assert.throws(() => insert({ pilotOrderId: "gibt-es-nicht" }), /FOREIGN KEY constraint failed/);
  });

  await check("G56./G60./G61./G62. Migration 25 auf einer echten Version-24-Datenbank: Bestandsdaten, Migrationen 1–24 und auth_audit_events bleiben unverändert; ein erneuter Lauf ist wirkungslos", () => {
    const v24DataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-decision-reason-migration24-"));
    const v24Db = authDb.openAuthDatabaseAtMigrationVersionForTests(24, { dataDir: v24DataDir }).db;
    assert.deepStrictEqual(migrations.getAppliedVersions(v24Db), Array.from({ length: 24 }, (_, index) => index + 1));
    assert.ok(!migrations.getAppliedVersions(v24Db).includes(25), "Migration 25 darf hier noch NICHT angewendet sein");

    // Realistische Bestandsdaten über die echten Servicefunktionen.
    const legacyOrderId = createOrder(v24Db, { title: "Bestandsauftrag vor Migration 25" });
    driveToInExecution(v24Db, legacyOrderId);
    const legacyOverviewBefore = service.getPilotOrderOverview(v24Db, legacyOrderId);
    assert.strictEqual(legacyOverviewBefore.currentDecisionReason, null, "vor Migration 25 gibt es keine Gründe");
    assert.deepStrictEqual(legacyOverviewBefore.decisionReasonHistory, []);

    const orderRowsBefore = v24Db.prepare("SELECT * FROM pilot_work_orders ORDER BY id ASC").all();
    const orderCountBefore = orderRowsBefore.length;
    const auditRowsBefore = v24Db.prepare("SELECT eventId, eventType, timestamp, metadata FROM auth_audit_events ORDER BY eventId ASC").all();
    const auditDdlBefore = v24Db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_audit_events'").get().sql;
    const handoffCountBefore = v24Db.prepare("SELECT COUNT(*) AS n FROM pilot_handoffs").get().n;

    const result = migrations.runMigrations(v24Db);
    assert.deepStrictEqual(result.appliedNow, [25], "genau Migration 25 wird nachgezogen");

    // G60/G61: Bestandsdaten und Zeilenzahlen exakt identisch.
    assert.deepStrictEqual(v24Db.prepare("SELECT * FROM pilot_work_orders ORDER BY id ASC").all(), orderRowsBefore);
    assert.strictEqual(v24Db.prepare("SELECT COUNT(*) AS n FROM pilot_work_orders").get().n, orderCountBefore);
    assert.strictEqual(v24Db.prepare("SELECT COUNT(*) AS n FROM pilot_handoffs").get().n, handoffCountBefore);
    // G62: auth_audit_events bleibt in Struktur UND Inhalt unangetastet.
    assert.deepStrictEqual(
      v24Db.prepare("SELECT eventId, eventType, timestamp, metadata FROM auth_audit_events ORDER BY eventId ASC").all(),
      auditRowsBefore,
    );
    assert.strictEqual(v24Db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_audit_events'").get().sql, auditDdlBefore);

    // G72: der Bestandsauftrag bleibt vollständig lesbar und liefert die
    // neuen Felder in ihrer leeren Ausprägung (kein Backfill).
    const legacyOverviewAfter = service.getPilotOrderOverview(v24Db, legacyOrderId);
    assert.strictEqual(legacyOverviewAfter.currentDecisionReason, null);
    assert.deepStrictEqual(legacyOverviewAfter.decisionReasonHistory, []);
    assert.strictEqual(legacyOverviewAfter.status, legacyOverviewBefore.status);
    assert.strictEqual(legacyOverviewAfter.order.revision, legacyOverviewBefore.order.revision);

    // Ab jetzt kann derselbe Bestandsauftrag Gründe speichern.
    const overviewWithReason = service.blockOrder(v24Db, { pilotOrderId: legacyOrderId, reason: "Nach der Migration erstmals begründet blockiert." });
    assert.ok(overviewWithReason.currentDecisionReason);

    // G56: erneuter Migrationslauf ist fehlerfrei und wirkungslos.
    const secondRun = migrations.runMigrations(v24Db);
    assert.deepStrictEqual(secondRun.appliedNow, [], "ein erneuter Lauf darf nichts mehr anwenden");
    const thirdRun = migrations.runMigrations(v24Db);
    assert.deepStrictEqual(thirdRun.appliedNow, []);
    assert.strictEqual(readReasonRows(v24Db, legacyOrderId).length, 1, "der gespeicherte Grund überlebt weitere Migrationsläufe unverändert");
    assert.ok(migrations.getAppliedVersions(v24Db).includes(25));
    assert.strictEqual(migrations.getAppliedVersions(v24Db).filter((version) => version === 25).length, 1, "schema_migrations enthält Version 25 genau einmal");
  });

  // ===================================================================
  // H. Statusmaschine und Rückwärtskompatibilität (Prüfpunkte 63–72)
  // ===================================================================

  await check("H63./H64. die Statusmaschine ist unverändert: keine neuen Statuswerte, keine neuen Übergänge", () => {
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
    const { db: transitionDb } = makeIsolatedDb("pilot-decision-reason-transitions-");
    const orderId = createOrder(transitionDb, { title: "Testauftrag: Übergänge" });
    // Eine Rückgabe bleibt aus DRAFT unverändert unmöglich.
    assert.throws(
      () => service.returnOrder(transitionDb, { pilotOrderId: orderId, note: "Rückgabe aus DRAFT ist unzulässig." }),
      /nicht möglich/,
    );
    // Entsperren bleibt ausschließlich aus BLOCKED möglich.
    assert.throws(() => service.unblockOrder(transitionDb, { pilotOrderId: orderId }), /Nur ein blockierter Auftrag/);
  });

  await check("H65./H66. die bestehenden Signaturen von blockOrder und returnOrder sind unverändert", () => {
    assert.strictEqual(typeof service.blockOrder, "function");
    assert.strictEqual(typeof service.returnOrder, "function");
    // (db, options = {}) – der Default-Parameter zählt nicht zu .length.
    assert.strictEqual(service.blockOrder.length, 1);
    assert.strictEqual(service.returnOrder.length, 1);
    assert.strictEqual(service.blockOrder.name, "blockOrder");
    assert.strictEqual(service.returnOrder.name, "returnOrder");
  });

  await check("H67. die Overview-Erweiterung ist rein additiv: alle bisherigen Felder bleiben unverändert bestehen", () => {
    const overview = service.getPilotOrderOverview(db, blockOrderId);
    [
      "order",
      "involvedAgents",
      "status",
      "statusLabel",
      "handoffs",
      "agentExecutionRuns",
      "codexAvailability",
      "chainSelectableFiles",
      "chainRecommendedFiles",
      "openDecision",
      "risksAndLimits",
      "nextStep",
      "progress",
      "chainRoleProgress",
      "autonomyBoundaries",
      "createdAt",
      "updatedAt",
    ].forEach((key) => assert.ok(key in overview, `bestehendes Overview-Feld fehlt: ${key}`));
    assert.ok("currentDecisionReason" in overview);
    assert.ok("decisionReasonHistory" in overview);
    // Keine flachen Parallelfelder neben der Objektstruktur.
    ["blockReason", "returnNote", "decisionReason", "decisionReasonText", "currentReasonText"].forEach((key) =>
      assert.ok(!(key in overview), `unerwartetes flaches Parallelfeld: ${key}`),
    );
    assert.deepStrictEqual(Object.keys(overview.currentDecisionReason).sort(), [
      "fromStatus",
      "kind",
      "orderRevision",
      "setAt",
      "setByUserId",
      "text",
      "toStatus",
    ]);
  });

  await check("H(unverändert). openDecision, risksAndLimits und nextStep bleiben unverändert abgeleitet", () => {
    const overview = service.getPilotOrderOverview(db, blockOrderId);
    assert.strictEqual(overview.status, "BLOCKED");
    assert.strictEqual(overview.openDecision, "Jamal muss den Blocker klären, bevor der Pilotlauf fortgesetzt werden kann.");
    assert.strictEqual(overview.nextStep, service.NEXT_STEP_BY_STATUS.BLOCKED);
    assert.ok(Array.isArray(overview.risksAndLimits));
    // Der Entscheidungsgrund darf NICHT in risksAndLimits einsickern.
    assert.ok(!overview.risksAndLimits.includes(secondBlockReason));
    assert.ok(!String(overview.openDecision).includes(secondBlockReason));
  });

  await check("H70./H71. es wurde keine neue Route eingeführt und die Zugriffsrichtlinie ist unverändert", () => {
    const routesSource = fs.readFileSync(path.join(__dirname, "pilot-work-order-routes.js"), "utf8");
    assert.ok(!/decision-reason|decisionReason/i.test(routesSource), "pilot-work-order-routes.js darf keine neue Gründe-Route enthalten");
    const policySource = fs.readFileSync(path.join(__dirname, "route-access-policy.js"), "utf8");
    assert.ok(!/decision-reason|decisionReason/i.test(policySource), "route-access-policy.js muss unverändert bleiben");
  });

  await check("H72. alte Aufträge ohne Gründe bleiben uneingeschränkt lesbar", () => {
    const overview = service.listPilotOrders(db);
    assert.ok(Array.isArray(overview) && overview.length > 0);
    overview.forEach((entry) => {
      assert.ok(entry.id, "jeder Auftrag bleibt lesbar");
    });
    const untouched = service.getPilotOrderOverview(db, returnOrderId);
    assert.ok(untouched.order);
    assert.strictEqual(untouched.status, "DRAFT");
  });

  console.log(`pilot-work-order-decision-reason.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-decision-reason.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
