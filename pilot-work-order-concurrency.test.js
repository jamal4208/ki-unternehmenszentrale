"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 3: kontrollierte
// Parallelfähigkeit (Auftrag "mehrere Pilotaufträge technisch sicher
// gleichzeitig bearbeiten, ohne dass Status, Agentenergebnisse, Freigaben,
// Projektmanager-Entscheidungen oder Audit-Ereignisse miteinander
// kollidieren").
//
// Ergänzt pilot-work-order.test.js (Fachlogik des einzelnen/kanonischen
// Auftrags), pilot-work-order-security.test.js (HTTP-/Zugriffsschicht),
// pilot-work-order-ui.test.js (UI-Quelltextprüfung) und
// pilot-work-order-multi-order.test.js (Phase-2-Mehrfachlauf-Grundlage),
// ohne diese zu ersetzen. Dieses Modul prüft ausschließlich die in Phase 3
// neu eingeführte Konfliktsicherung: den `revision`-Zähler (Migration 19),
// das atomare Compare-and-Set beim Statusübergang, die transaktionale
// Kopplung von Statusänderung/Audit/Rollenübergabe und die kollisionssichere
// Auftragsanlage.
//
// Da better-sqlite3 vollständig synchron arbeitet und Node.js
// single-threaded ist, kann innerhalb EINES Prozesses ohne dazwischen
// liegendes `await` kein echtes Interleaving zweier Operationen auftreten
// (siehe auth-db.js#Kommentar bei getActiveWorkOrderRunForWorkOrder). Eine
// "widersprüchliche gleichzeitige Operation" wird hier deshalb – wie vom
// Arbeitsauftrag ausdrücklich erlaubt ("Es ist nicht zwingend erforderlich,
// echte Betriebssystem-Threads oder Prozesse zu starten, sofern die Race
// Condition auf Service- und Datenbankebene zuverlässig reproduziert
// wird.") – auf zwei Arten deterministisch simuliert:
//   (a) über zwei tatsächlich hintereinander gegen dieselbe Datenbank
//       ausgeführte Operationen, von denen die zweite absichtlich die vor
//       der ersten Operation gelesene (jetzt veraltete) Revision als
//       `options.expectedRevision` mitgibt – genau das Muster, das ein
//       zweiter, echt nebenläufiger Aufrufer (anderer Prozess/Worker in
//       einer künftigen Architektur) verwenden würde, wenn er auf Basis
//       seines eigenen, früheren Lesevorgangs entscheidet; und
//   (b) über gezieltes Monkey-Patching von authAudit.recordAuditEvent
//       (Modul-Exportobjekt, keine Produktivcode-Änderung), um einen
//       Audit-Fehler an einer exakt bestimmten Stelle einer Transaktion
//       auszulösen und das Rollback-Verhalten nachzuweisen.
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken, niemals die echte
// Application-Support-Datenbank. Dieses Modul führt niemals eine externe
// Aktion aus.

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

function makeIsolatedDb(prefix = "pilot-concurrency-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

function orderInput(overrides = {}) {
  return {
    title: "Testauftrag: Konfliktsicherung",
    desiredOutcome: "Nachweis, dass dieser Auftrag konfliktfest gegen veraltete Zustände geschützt ist.",
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

function pilotAuditEventsFor(db, orderId) {
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

// Ersetzt authAudit.recordAuditEvent vorübergehend durch einen Stub, der
// für einen bestimmten Ereignistyp (oder generell) einen Fehler auslöst.
// Reine Modul-Exportobjekt-Ersetzung zur Testlaufzeit (kein Produktivcode-
// Test-Hook, keine Änderung an pilot-work-order-service.js); wird über
// `restore()` immer im finally-Zweig zurückgesetzt.
function withForcedAuditFailure(failingEventType, fn) {
  const original = authAudit.recordAuditEvent;
  authAudit.recordAuditEvent = (db, input) => {
    if (!failingEventType || input.eventType === failingEventType) {
      throw new Error(`Erzwungener Audit-Fehler für Testzwecke (${input.eventType}).`);
    }
    return original(db, input);
  };
  try {
    return fn();
  } finally {
    authAudit.recordAuditEvent = original;
  }
}

async function run() {
  // =====================================================================
  // Block A – Zwei unterschiedliche Pilotaufträge, überlappend bearbeitet
  // (Tests 1, 2, 17, 24).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overviewA = service.createPilotOrder(db, orderInput({ title: "Auftrag A" }));
    const overviewB = service.createPilotOrder(db, orderInput({ title: "Auftrag B" }));
    const orderAId = overviewA.order.id;
    const orderBId = overviewB.order.id;

    await check("1. zwei unterschiedliche Pilotaufträge können überlappend (verschränkt) bearbeitet werden", () => {
      // "Überlappend" bedeutet hier: Operationen auf A und B wechseln sich
      // ab, statt A vollständig bis COMPLETED zu führen, bevor B überhaupt
      // beginnt (Abgrenzung zu Phase 2, wo Aufträge rein sequenziell bis
      // zum Ende geführt wurden).
      let a = service.markReadyForApproval(db, { pilotOrderId: orderAId });
      let b = service.markReadyForApproval(db, { pilotOrderId: orderBId });
      assert.strictEqual(a.status, "READY_FOR_JAMAL_APPROVAL");
      assert.strictEqual(b.status, "READY_FOR_JAMAL_APPROVAL");
      a = service.approveForExecution(db, { pilotOrderId: orderAId, confirmed: true });
      b = service.approveForExecution(db, { pilotOrderId: orderBId, confirmed: true });
      assert.strictEqual(a.status, "APPROVED_FOR_EXECUTION");
      assert.strictEqual(b.status, "APPROVED_FOR_EXECUTION");
      a = service.startExecution(db, { pilotOrderId: orderAId });
      b = service.startExecution(db, { pilotOrderId: orderBId });
      assert.strictEqual(a.status, "IN_EXECUTION");
      assert.strictEqual(b.status, "IN_EXECUTION");
    });

    await check("2. eine Statusänderung von Auftrag A verändert Auftrag B nicht (Revision eingeschlossen)", () => {
      const beforeB = service.getPilotOrderOverview(db, orderBId);
      service.submitHandoff(db, handoffInput({ pilotOrderId: orderAId }));
      const afterB = service.getPilotOrderOverview(db, orderBId);
      assert.strictEqual(afterB.status, beforeB.status);
      assert.strictEqual(afterB.order.revision, beforeB.order.revision);
      assert.strictEqual(afterB.handoffs.length, 0);
    });

    await check("24. ein Konflikt auf Auftrag A blockiert keine legitime Operation auf Auftrag B", () => {
      const overviewA = service.getPilotOrderOverview(db, orderAId);
      // Absichtlich veraltete Revision für A -> muss als Konflikt abgelehnt werden.
      assert.throws(
        () => service.submitForReview(db, { pilotOrderId: orderAId, expectedRevision: overviewA.order.revision + 1 }),
        /geändert|Revision/,
      );
      // Auftrag B bleibt davon vollkommen unberührt und lässt sich normal weiterführen.
      const overviewB = service.getPilotOrderOverview(db, orderBId);
      const handoffB = service.submitHandoff(db, handoffInput({ pilotOrderId: orderBId }));
      assert.strictEqual(handoffB.handoff.pilotOrderId, orderBId);
      assert.ok(service.getPilotOrderOverview(db, orderBId).order.revision >= overviewB.order.revision);
    });

    await check("17. zwei verschiedene Aufträge können unabhängig, verschränkt bis COMPLETED gelangen", () => {
      // Auftrag A: zweite (Dokumentations-)Übergabe, dann Review/Abschluss.
      service.submitHandoff(
        db,
        handoffInput({
          pilotOrderId: orderAId,
          fromPilotRole: "RECHERCHE_ANALYSE",
          toPilotRole: "DOKUMENTATION",
          shortFinding: "A: Recherche abgeschlossen.",
          resultOrRecommendation: "A: Dokumentiertes Ergebnis liegt vor.",
        }),
      );
      // Auftrag B: erste Übergabe, verschränkt mit A's Fortschritt.
      service.submitHandoff(
        db,
        handoffInput({
          pilotOrderId: orderBId,
          shortFinding: "B: Auftrag geklärt.",
          resultOrRecommendation: "B: Rechercheergebnis liegt vor.",
        }),
      );
      service.submitForReview(db, { pilotOrderId: orderAId });
      service.submitHandoff(
        db,
        handoffInput({
          pilotOrderId: orderBId,
          fromPilotRole: "RECHERCHE_ANALYSE",
          toPilotRole: "DOKUMENTATION",
          shortFinding: "B: Recherche abgeschlossen.",
          resultOrRecommendation: "B: Dokumentiertes Ergebnis liegt vor.",
        }),
      );
      const completedA = service.approveCompletion(db, { pilotOrderId: orderAId, confirmed: true });
      service.submitForReview(db, { pilotOrderId: orderBId });
      const completedB = service.approveCompletion(db, { pilotOrderId: orderBId, confirmed: true });
      assert.strictEqual(completedA.status, "COMPLETED");
      assert.strictEqual(completedB.status, "COMPLETED");
      assert.notStrictEqual(completedA.order.id, completedB.order.id);
    });
  }

  // =====================================================================
  // Block B – Optimistische Nebenläufigkeitskontrolle: gleicher
  // Ausgangszustand, zwei Operationen, eine gewinnt (Tests 3–8, 22, 23).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overview = service.createPilotOrder(db, orderInput({ title: "Konfliktauftrag" }));
    const orderId = overview.order.id;

    // 3. Zwei Operationen lesen denselben Ausgangszustand desselben Auftrags.
    const readByFirstCaller = service.getPilotOrderOverview(db, orderId);
    const readBySecondCaller = service.getPilotOrderOverview(db, orderId);

    await check("3. zwei Operationen lesen denselben Ausgangszustand desselben Auftrags (gleiche Revision)", () => {
      assert.strictEqual(readByFirstCaller.order.revision, readBySecondCaller.order.revision);
      assert.strictEqual(readByFirstCaller.status, readBySecondCaller.status);
      assert.strictEqual(readByFirstCaller.status, "DRAFT");
    });

    let firstCallerResult;
    await check("4. die erste Operation (mit der zuvor gelesenen Revision) ist erfolgreich", () => {
      firstCallerResult = service.markReadyForApproval(db, {
        pilotOrderId: orderId,
        expectedRevision: readByFirstCaller.order.revision,
      });
      assert.strictEqual(firstCallerResult.status, "READY_FOR_JAMAL_APPROVAL");
      assert.strictEqual(firstCallerResult.order.revision, readByFirstCaller.order.revision + 1);
    });

    await check(
      "5. die zweite Operation mit derselben, jetzt veralteten Revision wird als eindeutiger Konflikt abgelehnt",
      () => {
        assert.throws(
          () =>
            service.markReadyForApproval(db, {
              pilotOrderId: orderId,
              expectedRevision: readBySecondCaller.order.revision,
            }),
          (error) => {
            assert.strictEqual(error.name, "PilotWorkOrderError");
            assert.strictEqual(error.statusCode, 409);
            assert.match(error.message, /geändert/);
            assert.match(error.message, new RegExp(`erwartete Revision ${readBySecondCaller.order.revision}`));
            return true;
          },
        );
      },
    );

    await check("6. der durch die erste Operation erreichte Zustand wird durch den Konflikt nicht zurückgesetzt", () => {
      const current = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(current.status, "READY_FOR_JAMAL_APPROVAL");
      assert.strictEqual(current.order.revision, firstCallerResult.order.revision);
    });

    await check("7. der Audit-Trail enthält nur den tatsächlich erfolgreichen Übergang (kein doppelter Eintrag)", () => {
      const statusEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED",
      );
      assert.strictEqual(statusEvents.length, 1);
      const metadata = JSON.parse(statusEvents[0].metadata);
      assert.strictEqual(metadata.previousStatus, "DRAFT");
      assert.strictEqual(metadata.nextStatus, "READY_FOR_JAMAL_APPROVAL");
      assert.strictEqual(metadata.previousRevision, readByFirstCaller.order.revision);
      assert.strictEqual(metadata.nextRevision, readByFirstCaller.order.revision + 1);
    });

    await check("8. ein abgelehnter Konflikt erzeugt keinen falschen Erfolgseintrag im Audit-Trail", () => {
      const events = pilotAuditEventsFor(db, orderId);
      // Jedes vorhandene Ereignis muss "OK" (Anlage/tatsächlicher
      // Übergang) sein – der abgewiesene zweite Versuch hat NICHTS
      // geschrieben (weder OK noch DENIED), weil er bereits vor jedem
      // Schreibzugriff mit einer geworfenen Ausnahme endete.
      events.forEach((event) => assert.strictEqual(event.result, "OK"));
      const createdEvents = events.filter((event) => event.eventType === "PILOT_WORK_ORDER_CREATED");
      assert.strictEqual(createdEvents.length, 1);
    });

    await check("22. Revisionswerte steigen ausschließlich bei tatsächlich erfolgreichen Zustandsänderungen", () => {
      const beforeHandoffPrep = service.getPilotOrderOverview(db, orderId);
      service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });
      service.startExecution(db, { pilotOrderId: orderId });
      const beforeHandoff = service.getPilotOrderOverview(db, orderId);
      // Eine erfolgreich vom PM-Filter angenommene Rollenübergabe ändert
      // den Auftragsstatus NICHT (bleibt IN_EXECUTION) -> keine
      // Revisionserhöhung, obwohl eine Rollenübergabe gespeichert wurde.
      service.submitHandoff(db, handoffInput({ pilotOrderId: orderId }));
      const afterHandoff = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(afterHandoff.order.revision, beforeHandoff.order.revision);
      assert.strictEqual(afterHandoff.status, "IN_EXECUTION");
      assert.ok(afterHandoff.order.revision > beforeHandoffPrep.order.revision);
    });

    await check("23. reine Lesefunktionen verändern die Revision nicht", () => {
      const before = service.getPilotOrderOverview(db, orderId).order.revision;
      service.getPilotOverview.length; // no-op reference, reine Lesbarkeitsprüfung
      service.getPilotOrderOverview(db, orderId);
      service.getPilotOrderOverview(db, orderId);
      service.listPilotOrders(db);
      const after = service.getPilotOrderOverview(db, orderId).order.revision;
      assert.strictEqual(after, before);
    });
  }

  // =====================================================================
  // Block C – Atomare Kopplung von Statusänderung und Audit-Ereignis
  // (Tests 9, 10).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overview = service.createPilotOrder(db, orderInput({ title: "Atomarität Status+Audit" }));
    const orderId = overview.order.id;

    await check("9. eine Statusänderung und ihr Audit-Ereignis werden gemeinsam (atomar) sichtbar", () => {
      const before = service.getPilotOrderOverview(db, orderId);
      const after = service.markReadyForApproval(db, { pilotOrderId: orderId });
      const statusEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED",
      );
      assert.strictEqual(statusEvents.length, 1);
      const metadata = JSON.parse(statusEvents[0].metadata);
      assert.strictEqual(metadata.previousRevision, before.order.revision);
      assert.strictEqual(metadata.nextRevision, after.order.revision);
      assert.strictEqual(after.order.revision, before.order.revision + 1);
    });

    await check("10. ein absichtlich ausgelöster Audit-Fehler führt zum vollständigen Rollback der Statusänderung", () => {
      const before = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(before.status, "READY_FOR_JAMAL_APPROVAL");
      assert.throws(
        () =>
          withForcedAuditFailure("PILOT_EXECUTION_APPROVAL_RECORDED", () =>
            service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true }),
          ),
        /Erzwungener Audit-Fehler/,
      );
      const after = service.getPilotOrderOverview(db, orderId);
      // Status UND Revision sind exakt auf dem Stand vor dem fehlgeschlagenen
      // Versuch stehen geblieben – auch der bereits durchgeführte
      // Statuswechsel (READY_FOR_JAMAL_APPROVAL -> APPROVED_FOR_EXECUTION)
      // wurde durch den nachfolgenden Audit-Fehler in derselben Transaktion
      // vollständig zurückgerollt.
      assert.strictEqual(after.status, "READY_FOR_JAMAL_APPROVAL");
      assert.strictEqual(after.order.revision, before.order.revision);
      const statusEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED",
      );
      // Kein zusätzliches (fälschliches) STATUS_CHANGED-Ereignis für den
      // zurückgerollten Versuch nach APPROVED_FOR_EXECUTION.
      assert.ok(!statusEvents.some((event) => JSON.parse(event.metadata).nextStatus === "APPROVED_FOR_EXECUTION"));
      // Die zweite, unbeteiligte Auditart wurde ebenfalls nicht geschrieben.
      const approvalEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_EXECUTION_APPROVAL_RECORDED",
      );
      assert.strictEqual(approvalEvents.length, 0);
      // Der Auftrag lässt sich anschließend normal (ohne Audit-Fehler) freigeben.
      const recovered = service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });
      assert.strictEqual(recovered.status, "APPROVED_FOR_EXECUTION");
    });
  }

  // =====================================================================
  // Block D – Rollenübergabe und zugehöriger Statusübergang bleiben atomar
  // (Test 11).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overview = service.createPilotOrder(db, orderInput({ title: "Atomarität Rollenübergabe+Status" }));
    const orderId = overview.order.id;
    service.markReadyForApproval(db, { pilotOrderId: orderId });
    service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });
    service.startExecution(db, { pilotOrderId: orderId });

    await check(
      "11. eine Rollenübergabe und der durch sie ausgelöste Statusübergang (BLOCKED) bleiben atomar gekoppelt",
      () => {
        const before = service.getPilotOrderOverview(db, orderId);
        assert.strictEqual(before.status, "IN_EXECUTION");
        assert.strictEqual(before.handoffs.length, 0);

        assert.throws(
          () =>
            withForcedAuditFailure("PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION", () =>
              service.submitHandoff(db, handoffInput({ pilotOrderId: orderId, forbiddenActionOccurred: true })),
            ),
          /Erzwungener Audit-Fehler/,
        );

        const after = service.getPilotOrderOverview(db, orderId);
        // Weder die Rollenübergabe (samt ihrem eigenen, bereits erfolgreich
        // gewesenen PILOT_HANDOFF_SUBMITTED-Audit) noch der Statusübergang
        // nach BLOCKED (samt PILOT_WORK_ORDER_STATUS_CHANGED-Audit) dürfen
        // bestehen bleiben, weil der spätere
        // PILOT_HANDOFF_BLOCKED_BY_FORBIDDEN_ACTION-Audit in derselben
        // Transaktion fehlgeschlagen ist.
        assert.strictEqual(after.status, "IN_EXECUTION");
        assert.strictEqual(after.order.revision, before.order.revision);
        assert.strictEqual(after.handoffs.length, 0);
        const events = pilotAuditEventsFor(db, orderId);
        assert.ok(!events.some((event) => event.eventType === "PILOT_HANDOFF_SUBMITTED"));
        // Die drei bereits VOR diesem Testfall erfolgreich durchlaufenen
        // Statusübergänge (DRAFT->...->IN_EXECUTION) bleiben unverändert
        // erhalten; es darf aber kein (Rest-)Ereignis für den
        // zurückgerollten Übergang nach BLOCKED existieren.
        assert.ok(!events.some((event) => JSON.parse(event.metadata).nextStatus === "BLOCKED"));

        // Ein normaler (nicht künstlich fehlschlagender) zweiter Versuch
        // funktioniert anschließend vollständig, inklusive korrekter
        // Sequenznummer 1 (keine "verbrannte" Sequenznummer durch den
        // zurückgerollten Versuch).
        const retried = service.submitHandoff(db, handoffInput({ pilotOrderId: orderId, forbiddenActionOccurred: true }));
        assert.strictEqual(retried.handoff.sequence, 1);
        const overviewAfterRetry = service.getPilotOrderOverview(db, orderId);
        assert.strictEqual(overviewAfterRetry.status, "BLOCKED");
        assert.strictEqual(overviewAfterRetry.handoffs.length, 1);
      },
    );
  }

  // =====================================================================
  // Block E – Kollisionssichere Auftragsanlage (Tests 12, 13).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();

    await check("12./13. ein doppelter Anlageversuch derselben ID wird kollisionssicher abgelehnt (genau ein Auftrag danach)", () => {
      const firstAttempt = service.createPilotOrder(db, orderInput({ title: "Original" }), { id: "pilot-order-race-fixed-id" });
      assert.strictEqual(firstAttempt.order.title, "Original");

      assert.throws(
        () => service.createPilotOrder(db, orderInput({ title: "Zweiter Versuch – darf nicht durchkommen" }), {
          id: "pilot-order-race-fixed-id",
        }),
        (error) => {
          assert.strictEqual(error.name, "PilotWorkOrderError");
          assert.strictEqual(error.statusCode, 409);
          assert.match(error.message, /existiert bereits/);
          return true;
        },
      );

      // Genau ein Auftrag mit dieser ID, unverändert der ERSTE Inhalt.
      const all = service.listPilotOrders(db).filter((order) => order.id === "pilot-order-race-fixed-id");
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].title, "Original");

      // Genau ein zugehöriges PILOT_WORK_ORDER_CREATED-Audit-Ereignis, kein
      // zweites für den abgewiesenen Versuch.
      const createdEvents = pilotAuditEventsFor(db, "pilot-order-race-fixed-id").filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_CREATED",
      );
      assert.strictEqual(createdEvents.length, 1);
    });

    await check("12b. auch die konkurrierende Anlage des kanonischen Auftrags bleibt kollisionssicher (kein doppelter Audit-Eintrag)", () => {
      const firstCanonical = service.getOrCreateCanonicalPilotOrder(db);
      const secondCanonical = service.getOrCreateCanonicalPilotOrder(db);
      const thirdCanonical = service.getOrCreateCanonicalPilotOrder(db);
      assert.strictEqual(firstCanonical.order.id, service.CANONICAL_PILOT_ORDER_ID);
      assert.strictEqual(secondCanonical.order.revision, firstCanonical.order.revision);
      assert.strictEqual(thirdCanonical.order.revision, firstCanonical.order.revision);
      const createdEvents = pilotAuditEventsFor(db, service.CANONICAL_PILOT_ORDER_ID).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_CREATED",
      );
      assert.strictEqual(createdEvents.length, 1);
    });
  }

  // =====================================================================
  // Block F – Doppelte Operationen/Idempotenz (Tests 14, 15, 16).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overview = service.createPilotOrder(db, orderInput({ title: "Doppelte Operationen" }));
    const orderId = overview.order.id;
    service.markReadyForApproval(db, { pilotOrderId: orderId });
    service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });

    await check("14. eine doppelte Ausführungsfreigabe wird kontrolliert als Konflikt abgelehnt (kein zweiter Erfolg)", () => {
      const before = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(before.status, "APPROVED_FOR_EXECUTION");
      assert.throws(
        () => service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true }),
        /nur aus READY_FOR_JAMAL_APPROVAL möglich/,
      );
      const after = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(after.order.revision, before.order.revision, "die wiederholte Freigabe darf die Revision nicht erhöhen");
      const approvalEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_EXECUTION_APPROVAL_RECORDED",
      );
      assert.strictEqual(approvalEvents.length, 1, "es darf nur genau ein Freigabe-Audit existieren");
    });

    service.startExecution(db, { pilotOrderId: orderId });
    service.submitHandoff(db, handoffInput({ pilotOrderId: orderId }));
    service.submitHandoff(
      db,
      handoffInput({
        pilotOrderId: orderId,
        fromPilotRole: "RECHERCHE_ANALYSE",
        toPilotRole: "DOKUMENTATION",
        shortFinding: "Recherche abgeschlossen.",
        resultOrRecommendation: "Dokumentiertes Ergebnis liegt vor.",
      }),
    );
    service.submitForReview(db, { pilotOrderId: orderId });
    service.approveCompletion(db, { pilotOrderId: orderId, confirmed: true });

    await check("15. ein doppelter Abschluss wird kontrolliert als Konflikt abgelehnt (kein zweiter Erfolg)", () => {
      const before = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(before.status, "COMPLETED");
      assert.throws(
        () => service.approveCompletion(db, { pilotOrderId: orderId, confirmed: true }),
        /bereits abgeschlossen/,
      );
      const after = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(after.order.revision, before.order.revision);
      const completionEvents = pilotAuditEventsFor(db, orderId).filter(
        (event) => event.eventType === "PILOT_COMPLETION_APPROVAL_RECORDED",
      );
      assert.strictEqual(completionEvents.length, 1);
    });

    await check("16. ein abgeschlossener Auftrag bleibt unveränderbar, auch mit korrekt mitgegebener aktueller Revision", () => {
      const current = service.getPilotOrderOverview(db, orderId);
      assert.throws(
        () => service.blockOrder(db, { pilotOrderId: orderId, reason: "Testfixtur", expectedRevision: current.order.revision }),
        /bereits abgeschlossen/,
      );
      assert.throws(
        () => service.returnOrder(db, { pilotOrderId: orderId, note: "Testfixtur", expectedRevision: current.order.revision }),
        /bereits abgeschlossen/,
      );
      const after = service.getPilotOrderOverview(db, orderId);
      assert.strictEqual(after.order.revision, current.order.revision);
      assert.strictEqual(after.status, "COMPLETED");
    });
  }

  // =====================================================================
  // Block G – Rückwärtskompatibilität des kanonischen Einzelauftrags
  // (Tests 18, 20) und bestehende Mehrfachlauf-/Fachtests bleiben grün
  // (Test 19, separat per npm test/direktem Aufruf geprüft).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();

    await check("18. der kanonische Einzelauftrag funktioniert weiterhin vollständig ohne explizite Auftrags-ID", () => {
      const initial = service.getPilotOverview(db);
      assert.strictEqual(initial.order.id, service.CANONICAL_PILOT_ORDER_ID);
      assert.strictEqual(initial.order.revision, 0);
      const afterReady = service.markReadyForApproval(db);
      assert.strictEqual(afterReady.order.revision, 1);
      const afterApproval = service.approveForExecution(db, { confirmed: true });
      assert.strictEqual(afterApproval.order.revision, 2);
      const afterStart = service.startExecution(db);
      assert.strictEqual(afterStart.order.revision, 3);
      service.submitHandoff(db, handoffInput());
      service.submitHandoff(
        db,
        handoffInput({
          fromPilotRole: "RECHERCHE_ANALYSE",
          toPilotRole: "DOKUMENTATION",
          shortFinding: "Kanonisch: Recherche abgeschlossen.",
          resultOrRecommendation: "Kanonisch: Dokumentiertes Ergebnis liegt vor.",
        }),
      );
      const afterReview = service.submitForReview(db);
      assert.strictEqual(afterReview.order.revision, 4);
      const completed = service.approveCompletion(db, { confirmed: true });
      assert.strictEqual(completed.status, "COMPLETED");
      assert.strictEqual(completed.order.revision, 5);
    });
  }

  // =====================================================================
  // Block H – Health-Referenzdaten bleiben unverändert (Test 20).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const healthService = require("./health-reference-work-run-service");
    const baseline = JSON.stringify(healthService.getOrCreateCanonicalRun(db));

    const overview = service.createPilotOrder(db, orderInput({ title: "Health-Unberührtheit" }));
    service.markReadyForApproval(db, { pilotOrderId: overview.order.id });
    assert.throws(
      () => service.markReadyForApproval(db, { pilotOrderId: overview.order.id, expectedRevision: 999 }),
      /geändert|Revision/,
    );

    await check("20. Health-Referenzdaten bleiben durch sämtliche Konfliktszenarien dieses Testmoduls unverändert", () => {
      const after = JSON.stringify(healthService.getOrCreateCanonicalRun(db));
      assert.strictEqual(after, baseline);
    });
  }

  // =====================================================================
  // Block I – Migration funktioniert bei neuer UND bereits bestehender
  // Datenbank (Test 21).
  // =====================================================================
  {
    const { db } = makeIsolatedDb("pilot-concurrency-migration-new-");

    await check("21a. eine neue Testdatenbank erhält Migration 19 und startet jeden Auftrag mit revision = 0", () => {
      assert.ok(migrations.getAppliedVersions(db).includes(19));
      const overview = service.createPilotOrder(db, orderInput({ title: "Neue DB" }));
      assert.strictEqual(overview.order.revision, 0);
    });
  }

  {
    const { db } = makeIsolatedDb("pilot-concurrency-migration-existing-");
    const overview = service.createPilotOrder(db, orderInput({ title: "Bestehender Auftrag vor Migration 19" }));
    const orderId = overview.order.id;
    service.markReadyForApproval(db, { pilotOrderId: orderId });
    const beforeDowngrade = service.getPilotOrderOverview(db, orderId);
    const auditCountBefore = pilotAuditEventsFor(db, orderId).length;

    await check(
      "21b. Migration 19 ist auf einer bereits bestehenden Datenbank (ohne revision-Spalte) wiederholbar nachrüstbar, " +
        "ohne bestehende Aufträge oder Audit-Daten zu verändern",
      () => {
        // Simuliert eine "bestehende Testdatenbank von vor Phase 3": die
        // additive Spalte wird entfernt und ihr Migrationseintrag
        // gelöscht (ausschließlich zu Testzwecken; das produktive
        // Migrationssystem selbst löscht/baut niemals eine bestehende
        // Tabelle neu auf, siehe auth-db-migrations.js Migration 19).
        db.exec("ALTER TABLE pilot_work_orders DROP COLUMN revision");
        db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(19);
        assert.ok(!migrations.getAppliedVersions(db).includes(19));

        const result = migrations.runMigrations(db);
        assert.deepStrictEqual(result.appliedNow, [19]);
        assert.ok(migrations.getAppliedVersions(db).includes(19));

        // Der bereits bestehende Auftrag bleibt vollständig lesbar, mit
        // sicherem Ausgangswert revision = 0, und ist ansonsten
        // unverändert (Status, Titel, Zeitstempel).
        const afterMigration = service.getPilotOrderOverview(db, orderId);
        assert.strictEqual(afterMigration.order.revision, 0);
        assert.strictEqual(afterMigration.status, beforeDowngrade.status);
        assert.strictEqual(afterMigration.order.title, beforeDowngrade.order.title);
        assert.strictEqual(afterMigration.order.createdAt, beforeDowngrade.order.createdAt);
        assert.strictEqual(afterMigration.order.updatedAt, beforeDowngrade.order.updatedAt);

        // Bestehende Audit-Daten bleiben unverändert erhalten.
        assert.strictEqual(pilotAuditEventsFor(db, orderId).length, auditCountBefore);

        // Nach der Nachrüstung funktioniert die Konfliktsicherung normal
        // weiter (kein Sonderfall für nachträglich migrierte Aufträge).
        const afterApproval = service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true });
        assert.strictEqual(afterApproval.order.revision, 1);
        assert.throws(
          () => service.approveForExecution(db, { pilotOrderId: orderId, confirmed: true, expectedRevision: 0 }),
          /geändert|Revision|nur aus READY_FOR_JAMAL_APPROVAL/,
        );
      },
    );

    await check("21c. ein erneuter Migrationslauf auf der jetzt vollständig migrierten Datenbank ist ein No-op", () => {
      const result = migrations.runMigrations(db);
      assert.deepStrictEqual(result.appliedNow, []);
    });
  }

  // =====================================================================
  // Block J – Audit-Ereignisse bleiben eindeutig nach pilotOrderId und
  // Revision filterbar (Test 25).
  // =====================================================================
  {
    const { db } = makeIsolatedDb();
    const overviewA = service.createPilotOrder(db, orderInput({ title: "Audit-Filter A" }));
    const overviewB = service.createPilotOrder(db, orderInput({ title: "Audit-Filter B" }));
    service.markReadyForApproval(db, { pilotOrderId: overviewA.order.id });
    service.markReadyForApproval(db, { pilotOrderId: overviewB.order.id });
    service.approveForExecution(db, { pilotOrderId: overviewA.order.id, confirmed: true });

    await check("25. Audit-Ereignisse bleiben eindeutig nach pilotOrderId UND nextRevision filterbar", () => {
      const statusEventsA = pilotAuditEventsFor(db, overviewA.order.id).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED",
      );
      const statusEventsB = pilotAuditEventsFor(db, overviewB.order.id).filter(
        (event) => event.eventType === "PILOT_WORK_ORDER_STATUS_CHANGED",
      );
      assert.strictEqual(statusEventsA.length, 2);
      assert.strictEqual(statusEventsB.length, 1);
      const revisionsA = statusEventsA.map((event) => JSON.parse(event.metadata).nextRevision).sort();
      assert.deepStrictEqual(revisionsA, [1, 2]);
      const findByRevision = (events, pilotOrderId, nextRevision) =>
        events.find((event) => {
          const metadata = JSON.parse(event.metadata);
          return metadata.pilotOrderId === pilotOrderId && metadata.nextRevision === nextRevision;
        });
      const exact = findByRevision(statusEventsA, overviewA.order.id, 2);
      assert.ok(exact, "das Ereignis muss eindeutig über pilotOrderId + nextRevision auffindbar sein");
      assert.strictEqual(JSON.parse(exact.metadata).nextStatus, "APPROVED_FOR_EXECUTION");
      // Zeitstempel allein wären hier nicht ausreichend eindeutig, sofern
      // zwei Ereignisse zufällig dieselbe Millisekunde treffen -
      // pilotOrderId + nextRevision bleibt auch dann eindeutig.
    });
  }

  console.log(`pilot-work-order-concurrency.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-concurrency.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
