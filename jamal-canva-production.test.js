"use strict";

// V7.4 – Kontrollierte externe Werkzeugnutzung, Canva-Produktionskorridor
// (Auftrag Abschnitt P): Fachlogik-Abnahme von jamal-canva-briefing.js und
// jamal-canva-production-service.js. Läuft direkt gegen eine isolierte
// SQLite-Datenbank (gleiches Grundmuster wie jamal-work-mode-
// persistence.test.js) statt über HTTP – die Routen-/Sicherheitsschicht
// wird separat in jamal-canva-security.test.js geprüft.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const jamalWorkMode = require("./jamal-work-mode");
const jamalWorkModeStoreModule = require("./jamal-work-mode-store");
const svc = require("./jamal-canva-production-service");
const briefing = require("./jamal-canva-briefing");
const authAuditModule = require("./auth-audit");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}
async function checkAsync(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jamal-canva-prod-test-"));
  const { db } = authDb.openAuthDatabase({ dataDir });
  return { db, dataDir };
}

function closeIsolatedDb(db, dataDir) {
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// Erzeugt einen echten, RESULT_READY-fähigen Jamal-Arbeitswunsch über den
// bestehenden jamal-work-mode.js-Hauptfluss (kein handgestricktes Objekt),
// damit dieselben Feldnamen/-formen wie im Produktivbetrieb verwendet
// werden.
function makeEligibleWorkItem(db, desiredOutcome, notes) {
  let store = jamalWorkModeStoreModule.loadStore(db);
  store = jamalWorkMode.startNewItem(store, [{ id: "ki-unternehmenszentrale", displayName: "KI-Unternehmenszentrale" }], {
    now: new Date(),
  });
  store = jamalWorkMode.setDesiredOutcome(store, { desiredOutcome, notes: notes || "", preferredTiming: "" }, { now: new Date() });
  store = jamalWorkMode.startRun(store, { now: new Date() });
  if (store.currentItem.status === "IN_PROGRESS") {
    store = jamalWorkMode.completeRun(store, { now: new Date() });
  }
  jamalWorkModeStoreModule.persistStore(db, store);
  return store.currentItem;
}

const CLEAR_RIGHTS = { ownsImageRights: true, brandUsageAllowed: true, containsRealPerson: false };

async function run() {
  // -------------------------------------------------------------------
  // 1+2+3. Eignungsprüfung.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "Warme, ruhige Bildsprache");
    const view = svc.prepareBriefing(db, { workItem, rightsInput: {}, actorUserId: "owner-1" });
    check("geeigneter Auftrag → CANVA_RECOMMENDED", () => {
      assert.strictEqual(view.suitability.decision, "CANVA_RECOMMENDED");
    });
    closeIsolatedDb(db, dataDir);
  }
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Vollständige Webanwendung mit neuem Website-Code", "");
    const view = svc.prepareBriefing(db, { workItem, rightsInput: {}, actorUserId: "owner-1" });
    check("ungeeigneter Auftrag → CANVA_NOT_SUITABLE", () => {
      assert.strictEqual(view.suitability.decision, "CANVA_NOT_SUITABLE");
    });
    closeIsolatedDb(db, dataDir);
  }
  {
    // Auftrag Abschnitt D: jamal-canva-briefing.js prüft die Business-Use-
    // Policy als eigene, zweite Sicherheitsebene (Reihenfolge: "zuerst
    // Business-Use-Policy, danach Werkzeugwahl" – siehe Kopfkommentar dort).
    // Ein Arbeitswunsch mit eindeutig verbotenem Inhalt würde im echten
    // Jamal-Arbeitsmodus bereits bei startRun() als ESCALATION_NEEDED
    // enden und nie RESULT_READY erreichen (jamal-work-mode.js#startRun);
    // diese zweite Ebene wird daher bewusst isoliert (ohne Datenbank-/
    // Statusgate) direkt gegen jamal-canva-briefing.js geprüft.
    const suitability = briefing.evaluateCanvaSuitability({
      desiredOutcome: "Unterstützung beim Aufbau eines Drogenhandel-Vertriebsnetzes",
      notes: "Werbetexte gewünscht.",
      pendingChangeText: null,
      projectId: "ki-unternehmenszentrale",
    });
    check("Safety-BLOCK → CANVA_BLOCKED_BY_POLICY", () => {
      assert.strictEqual(suitability.decision, "CANVA_BLOCKED_BY_POLICY");
      assert.ok(suitability.policyReasonCode);
    });
  }

  // -------------------------------------------------------------------
  // 4. Rechte ungeklärt → Handoff blockiert.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "");
    const view = svc.prepareBriefing(db, { workItem, rightsInput: {}, actorUserId: "owner-1" });
    check("Rechte ungeklärt → Handoff blockiert", () => {
      assert.strictEqual(view.status, "BLOCKED");
      assert.strictEqual(view.rights.status, "UNCLEAR");
      assert.throws(() => svc.approveHandoff(db, { workItem, actorUserId: "owner-1" }));
    });
    closeIsolatedDb(db, dataDir);
  }

  // -------------------------------------------------------------------
  // 5–12. Briefing selbst.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "Warme, ruhige Bildsprache");
    const view = svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" });
    const text = JSON.stringify(view);

    check("Briefing wird erzeugt", () => {
      assert.ok(view.briefing);
    });
    check("Briefingversion beginnt bei 1", () => {
      assert.strictEqual(view.revisionNumber, 1);
      assert.strictEqual(view.briefing.briefingVersion, 1);
    });
    check("Format vorgeschlagen", () => {
      assert.ok(typeof view.briefing.desiredFormat === "string" && view.briefing.desiredFormat.length > 0);
      assert.notStrictEqual(view.briefing.desiredFormat, "UNGEKLÄRT");
    });
    check("Zielgruppe enthalten", () => {
      assert.ok(typeof view.briefing.targetAudience === "string" && view.briefing.targetAudience.length > 0);
    });
    check("Qualitätskriterien enthalten", () => {
      assert.ok(Array.isArray(view.briefing.qualityCriteria) && view.briefing.qualityCriteria.length > 0);
    });
    check("keine Systemprompts", () => {
      assert.doesNotMatch(text, /system[- ]?prompt/i);
    });
    check("keine Chain-of-Thought", () => {
      assert.doesNotMatch(text, /chain[- ]?of[- ]?thought/i);
    });
    check("keine Secrets", () => {
      assert.doesNotMatch(text, /"(secret|token|apiKey|password)"\s*:/i);
    });

    closeIsolatedDb(db, dataDir);
  }

  // -------------------------------------------------------------------
  // 13–17. Freigabe-/Handoff-Gate.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "");
    svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" });

    let connectorCalls = 0;
    const spyConnector = async () => {
      connectorCalls += 1;
      return {
        providerStatus: "SAVED",
        canvaDesignId: "design-spy",
        designTitle: "Spy-Design",
        editLink: "https://www.canva.com/design/spy/edit",
        viewLink: "https://www.canva.com/design/spy/view",
      };
    };

    await checkAsync("explizite Handoff-Freigabe nötig", async () => {
      await assert.rejects(svc.startHandoff(db, { workItem, actorUserId: "owner-1", connector: spyConnector }));
    });
    check("ohne Freigabe kein Connectoraufruf", () => {
      assert.strictEqual(connectorCalls, 0);
    });

    svc.approveHandoff(db, { workItem, actorUserId: "owner-1" });

    await checkAsync("nach Freigabe genau ein Connectoraufruf", async () => {
      await svc.startHandoff(db, { workItem, actorUserId: "owner-1", connector: spyConnector });
      assert.strictEqual(connectorCalls, 1);
    });

    check("kein paralleler Handoff", () => {
      // Der Datensatz ist jetzt RESULT_RECEIVED (nach dem Start oben) – ein
      // erneutes Briefing-Vorbereiten für dasselbe, noch nicht entschiedene
      // Ergebnis bleibt blockiert (Auftrag Abschnitt H).
      assert.throws(() => svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" }));
    });

    await checkAsync("doppelter Start blockiert", async () => {
      await assert.rejects(svc.startHandoff(db, { workItem, actorUserId: "owner-1", connector: spyConnector }));
      assert.strictEqual(connectorCalls, 1, "der Connector darf beim blockierten zweiten Start nicht erneut aufgerufen werden");
    });

    closeIsolatedDb(db, dataDir);
  }

  // -------------------------------------------------------------------
  // 18–22. Ergebnis-/Fehlerbehandlung.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "");
    svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" });
    svc.approveHandoff(db, { workItem, actorUserId: "owner-1" });

    await checkAsync("Providerfehler → FAILED", async () => {
      const failedView = await svc.startHandoff(db, {
        workItem,
        actorUserId: "owner-1",
        connector: async () => {
          throw new Error("Provider-Simulationsfehler");
        },
      });
      assert.strictEqual(failedView.status, "FAILED");
      assert.strictEqual(failedView.errorCode, "PROVIDER_CALL_FAILED");
    });

    // Neue Revision nach dem Fehlschlag, damit die restlichen Erfolgspfade
    // unabhängig vom FAILED-Datensatz oben geprüft werden können.
    svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" });
    svc.approveHandoff(db, { workItem, actorUserId: "owner-1" });
    const resultView = await svc.startHandoff(db, { workItem, actorUserId: "owner-1" });

    check("Ergebnis wird zurückgeführt", () => {
      assert.strictEqual(resultView.status, "RESULT_RECEIVED");
      assert.ok(resultView.design);
    });
    check("Design-ID gespeichert", () => {
      assert.ok(typeof resultView.design.canvaDesignId === "string" && resultView.design.canvaDesignId.length > 0);
    });
    check("Link sicher gespeichert", () => {
      assert.match(resultView.design.editLink, /^https:\/\/www\.canva\.com\//);
      assert.match(resultView.design.viewLink, /^https:\/\/www\.canva\.com\//);
    });
    check("Qualitätsprüfung vorhanden", () => {
      assert.ok(resultView.quality && ["PASSED", "PASSED_WITH_NOTES"].includes(resultView.quality.status));
    });

    closeIsolatedDb(db, dataDir);
  }

  // -------------------------------------------------------------------
  // 23–29. Revisionsfluss, Abschluss, keine Veröffentlichung/Billing/
  // Social-Media.
  // -------------------------------------------------------------------
  {
    const { db, dataDir } = makeIsolatedDb();
    const workItem = makeEligibleWorkItem(db, "Instagram-Beitrag für das Sonntagsfrühstück", "");
    svc.prepareBriefing(db, { workItem, rightsInput: CLEAR_RIGHTS, actorUserId: "owner-1" });
    svc.approveHandoff(db, { workItem, actorUserId: "owner-1" });
    await svc.startHandoff(db, { workItem, actorUserId: "owner-1" });

    const revisedView = svc.requestRevision(db, {
      workItem,
      changeText: "Bitte wärmere Farben verwenden.",
      rightsInput: CLEAR_RIGHTS,
      actorUserId: "owner-1",
    });

    check("Revision erzeugt neue Briefingversion", () => {
      assert.strictEqual(revisedView.revisionNumber, 2);
      assert.strictEqual(revisedView.status, "READY_FOR_APPROVAL");
    });

    const safeView = svc.getCanvaSafeView(db, workItem);
    check("alte Revision bleibt nachvollziehbar", () => {
      assert.strictEqual(safeView.history.length, 1);
      assert.strictEqual(safeView.history[0].revisionNumber, 1);
      assert.strictEqual(safeView.history[0].status, "NEEDS_REVISION");
      assert.ok(safeView.history[0].design && safeView.history[0].design.canvaDesignId);
    });

    await checkAsync("neue externe Freigabe für Revision", async () => {
      await assert.rejects(svc.startHandoff(db, { workItem, actorUserId: "owner-1" }));
    });

    svc.approveHandoff(db, { workItem, actorUserId: "owner-1" });
    const secondResult = await svc.startHandoff(db, { workItem, actorUserId: "owner-1" });
    const acceptedView = svc.acceptResult(db, { workItem, actorUserId: "owner-1" });

    check("Passt → ACCEPTED_INTERNAL", () => {
      assert.strictEqual(acceptedView.status, "ACCEPTED_INTERNAL");
    });

    const wholeText = JSON.stringify({ revisedView, secondResult, acceptedView });
    check("keine Veröffentlichung", () => {
      assert.doesNotMatch(wholeText, /"publish/i);
      assert.strictEqual(revisedView.briefing.publicationLocked, true);
    });
    check("kein Billing", () => {
      assert.doesNotMatch(wholeText, /billing|invoice|priceCents/i);
    });
    check("kein Social-Media-Post", () => {
      // Bewusst nur eine tatsächliche Posting-AKTION/-Feld prüfen, nicht die
      // (erwünschte) beschreibende Erwähnung "Social-Media-Beitrag" in der
      // Eignungsbegründung (suitability.reasoning).
      assert.doesNotMatch(wholeText, /"(socialMediaPost|postToSocial|autoPost|postedAt|postStatus)"/i);
      assert.doesNotMatch(wholeText, /posted["\s]*:\s*true/i);
    });

    // -------------------------------------------------------------------
    // 30. Audit vollständig.
    // -------------------------------------------------------------------
    check("Audit vollständig", () => {
      const expectedTypes = [
        "CANVA_BRIEFING_PREPARED",
        "CANVA_HANDOFF_APPROVED",
        "CANVA_HANDOFF_STARTED",
        "CANVA_RESULT_RECEIVED",
        "CANVA_RESULT_REVIEWED",
        "CANVA_REVISION_REQUESTED",
        "CANVA_RESULT_ACCEPTED_INTERNAL",
      ];
      expectedTypes.forEach((eventType) => {
        const rows = authAuditModule.listAuditEventsByType(db, eventType);
        assert.ok(rows.length > 0, `kein Auditereignis für ${eventType} gefunden`);
      });
    });

    closeIsolatedDb(db, dataDir);
  }

  console.log(`jamal-canva-production.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
