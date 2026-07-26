"use strict";

// V7.3 – Jamal-Arbeitsmodus (Auftrag Abschnitt N): reine Fachlogiktests für
// jamal-work-mode.js. Kein Server, keine Datenbank – dieses Modul ist
// bewusst zustandslos/funktional (Store wird als Wert übergeben und als
// neuer Wert zurückgegeben), daher genügt ein einfacher, synchroner
// Testaufbau (gleiches Muster wie daily-work-run.test.js).

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AgentRegistry = require("./agent-registry");
const JamalWorkMode = require("./jamal-work-mode");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const PROJECTS = [
  { id: "ki-unternehmenszentrale", displayName: "KI-Unternehmenszentrale", lastVerifiedAt: "2026-07-11" },
  { id: "health-upgrade-kompass", displayName: "Health Upgrade Kompass", lastVerifiedAt: "2026-07-19" },
  { id: "flowlingo", displayName: "FlowLingo Portugiesisch Sprachtrainer", lastVerifiedAt: "2026-07-10" },
];

function freshItem(overrides) {
  let store = JamalWorkMode.createStore();
  store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date("2026-07-26T10:00:00Z") });
  store = JamalWorkMode.setDesiredOutcome(
    store,
    {
      desiredOutcome: overrides?.desiredOutcome ?? "Vereinfache den täglichen Arbeitsmodus für Jamal so, dass er sofort weiß, was zu tun ist.",
      notes: overrides?.notes ?? "Bestehende Phase-C-Architektur wiederverwenden, keine neue Architektur.",
      preferredTiming: overrides?.preferredTiming ?? "heute",
    },
    { now: new Date("2026-07-26T10:01:00Z") },
  );
  return store;
}

function runTests() {
  // 1. priorisiertes Projekt wird vorausgewählt
  check("priorisiertes Projekt wird vorausgewählt (Kontinuität)", () => {
    let store = JamalWorkMode.createStore();
    store.lastUsedProjectId = "health-upgrade-kompass";
    store.lastUsedProjectDisplayName = "Health Upgrade Kompass";
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    assert.strictEqual(store.currentItem.projectId, "health-upgrade-kompass");
    assert.strictEqual(store.currentItem.projectSource, "CONTINUITY");
  });

  check("priorisiertes Projekt: Standardfall ohne Kontinuität ist die Zentrale selbst", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    assert.strictEqual(store.currentItem.projectId, JamalWorkMode.DEFAULT_PROJECT_ID);
    assert.strictEqual(store.currentItem.projectSource, "DEFAULT");
  });

  // 2. ohne Priorität kompakte Projektauswahl
  check("ohne verfügbare Priorität: kompakte Projektauswahl statt langer Liste", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS.filter((p) => p.id !== "ki-unternehmenszentrale"), { now: new Date() });
    assert.strictEqual(store.currentItem.projectId, null);
    const view = JamalWorkMode.getSafeView(store, PROJECTS);
    assert.ok(Array.isArray(view.compactProjectCandidates));
    assert.ok(view.compactProjectCandidates.length > 0);
    assert.ok(view.compactProjectCandidates.length <= 5);
  });

  // 3. Ergebniswunsch ist einziges Pflichtfeld
  check("Ergebniswunsch ist einziges Pflichtfeld", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    store = JamalWorkMode.setDesiredOutcome(store, { desiredOutcome: "Etwas Konkretes erreichen." }, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.READY);
    assert.strictEqual(store.currentItem.notes, "");
    assert.strictEqual(store.currentItem.preferredTiming, "");
  });

  check("Ergebniswunsch fehlt: klare, sichere Fehlermeldung", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    assert.throws(() => JamalWorkMode.setDesiredOutcome(store, {}, { now: new Date() }), /Ergebniswunsch ist erforderlich/);
  });

  // 4. Agentenauswahl nicht erforderlich / 5. Toolauswahl nicht erforderlich
  check("Agenten- und Toolauswahl sind beim Ergebniswunsch nicht erforderlich", () => {
    const store = freshItem();
    assert.strictEqual(store.currentItem.plan, null);
    assert.ok(!("agentSelection" in store.currentItem));
    assert.ok(!("toolId" in store.currentItem));
    assert.ok(!("tool" in store.currentItem));
  });

  // 6. Projektmanager strukturiert Ziel
  check("Projektmanager-Agent strukturiert das Ziel beim Laufstart", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.IN_PROGRESS);
    assert.strictEqual(store.currentItem.plan.agents.projectManager.canonicalName, "Projektmanager-Agent");
  });

  // 7. 3–5 Arbeitsschritte
  check("Arbeitsplan enthält 3 bis 5 Schritte", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    const stepCount = store.currentItem.plan.steps.length;
    assert.ok(stepCount >= 3 && stepCount <= 5, `Erwartet 3-5 Schritte, erhalten ${stepCount}`);
  });

  // 8. maximal 3 Fachagenten
  check("maximal drei Fachagenten", () => {
    let store = freshItem({
      desiredOutcome: "Baue eine technische Website mit modernem Design und einer stabilen API-Integration.",
      notes: "Technischer und gestalterischer Bezug gleichzeitig.",
    });
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.ok(store.currentItem.plan.agents.specialists.length <= 3);
  });

  // 9. genau 1 Qualitätsagent
  check("genau ein Qualitätsagent", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    const quality = store.currentItem.plan.agents.quality;
    assert.ok(quality && !Array.isArray(quality));
    assert.strictEqual(quality.canonicalName, "QA-Agent");
  });

  // 10. Agenten aus kanonischem Register
  check("alle beteiligten Agenten stammen aus dem kanonischen Register", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    const agents = [
      store.currentItem.plan.agents.projectManager,
      ...store.currentItem.plan.agents.specialists,
      store.currentItem.plan.agents.quality,
    ];
    agents.forEach((agent) => {
      assert.ok(AgentRegistry.hasAgentId(agent.agentKey), `unbekannter Agentenschlüssel ${agent.agentKey}`);
    });
  });

  // 11. Lauf kann starten
  check("Lauf kann aus dem Status Bereit starten", () => {
    let store = freshItem();
    assert.doesNotThrow(() => JamalWorkMode.startRun(store, { now: new Date() }));
  });

  // 12. Status wird In Bearbeitung
  check("Status wechselt beim Laufstart zu In Bearbeitung", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.IN_PROGRESS);
    assert.strictEqual(JamalWorkMode.getStatusLabel(store.currentItem.status), "In Bearbeitung");
  });

  // 13. Ergebnis wird gespeichert
  check("Ergebnis wird als unveränderliche Version gespeichert", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    store = JamalWorkMode.completeRun(store, { now: new Date() });
    assert.strictEqual(store.currentItem.versions.length, 1);
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.RESULT_READY);
  });

  // 14. Ergebnis wird sichtbar
  check("Ergebnis ist über die sichere Ansicht sichtbar", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    store = JamalWorkMode.completeRun(store, { now: new Date() });
    const view = JamalWorkMode.getSafeView(store, PROJECTS);
    const latest = view.currentItem.versions[view.currentItem.versions.length - 1];
    assert.ok(latest.summary && latest.summary.length > 0);
    assert.ok(latest.title && latest.title.length > 0);
  });

  // 15. Qualitätsstatus vorhanden
  check("Qualitätsstatus ist Teil jeder Ergebnisversion", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    store = JamalWorkMode.completeRun(store, { now: new Date() });
    const latest = store.currentItem.versions[0];
    assert.ok(["PASSED", "PASSED_WITH_NOTES"].includes(latest.qualityStatus));
  });

  // 16. Rückfrage nur bei echtem Bedarf
  check("Rückfrage erscheint nur bei echtem fachlichen Bedarf", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    store = JamalWorkMode.setDesiredOutcome(store, { desiredOutcome: "Kurzer Wunsch" }, { now: new Date() });
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.CLARIFICATION_NEEDED);
    assert.ok(typeof store.currentItem.clarifyingQuestion.question === "string");
    assert.ok(store.currentItem.clarifyingQuestion.question.length > 0);
  });

  check("kein Rückfragebedarf bei ausreichendem Hintergrund", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.notStrictEqual(store.currentItem.status, JamalWorkMode.STATUS.CLARIFICATION_NEEDED);
  });

  // 17. maximal eine Hauptfrage
  check("maximal eine Hauptfrage gleichzeitig", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    store = JamalWorkMode.setDesiredOutcome(store, { desiredOutcome: "Kurz" }, { now: new Date() });
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.ok(!Array.isArray(store.currentItem.clarifyingQuestion));
    assert.strictEqual(typeof store.currentItem.clarifyingQuestion, "object");
  });

  // 18. Änderung erzeugt neue Version / 19. alte Version bleibt unverändert
  check("Änderung erzeugt eine neue unveränderliche Ergebnisversion, alte bleibt unverändert", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    store = JamalWorkMode.completeRun(store, { now: new Date() });
    const firstVersionSnapshot = JSON.stringify(store.currentItem.versions[0]);
    assert.ok(Object.isFrozen(store.currentItem.versions[0]));

    store = JamalWorkMode.requestChange(store, "Bitte kürzer formulieren.", { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.CHANGE_IN_PROGRESS);
    store = JamalWorkMode.completeChange(store, { now: new Date() });

    assert.strictEqual(store.currentItem.versions.length, 2);
    assert.strictEqual(JSON.stringify(store.currentItem.versions[0]), firstVersionSnapshot);
    assert.strictEqual(store.currentItem.versions[1].changeRequestText, "Bitte kürzer formulieren.");
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.RESULT_READY);
  });

  // 20. „Passt“ markiert intern erledigt
  check("Passt markiert den Arbeitswunsch intern als erledigt", () => {
    let store = freshItem();
    store = JamalWorkMode.startRun(store, { now: new Date() });
    store = JamalWorkMode.completeRun(store, { now: new Date() });
    store = JamalWorkMode.markDone(store, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.DONE);
    assert.strictEqual(store.currentItem.decision, "PASST");
    assert.ok(store.currentItem.doneAt);
  });

  // 21. keine Veröffentlichung / 22. kein Billing / 23. kein Provider
  const moduleSource = fs.readFileSync(path.join(__dirname, "jamal-work-mode.js"), "utf8");
  check("keine Veröffentlichungsfunktion vorhanden", () => {
    Object.keys(JamalWorkMode).forEach((key) => {
      assert.ok(!/publish|veroeffentlich/i.test(key), `unerwarteter Veröffentlichungsbezug: ${key}`);
    });
  });
  check("kein Billing-Bezug vorhanden", () => {
    Object.keys(JamalWorkMode).forEach((key) => {
      assert.ok(!/billing|payment|zahlung|price|preis/i.test(key), `unerwarteter Billingbezug: ${key}`);
    });
    assert.ok(!/require\(["']\.\/(heygen|canva)[^"']*billing/i.test(moduleSource));
  });
  check("kein externer Provideraufruf, kein Netzwerkzugriff", () => {
    assert.ok(!/require\(["']\.\/(heygen|canva)/i.test(moduleSource));
    assert.ok(!/\bfetch\(/.test(moduleSource));
    assert.ok(!/https?\.request\(/.test(moduleSource));
  });

  // 24. kein Owner-/Kundenrollenmix
  check("kein Owner-/Kundenrollenmix", () => {
    assert.ok(!/require\(["']\.\/auth-db/i.test(moduleSource));
    assert.ok(!/require\(["']\.\/work-order-service/i.test(moduleSource));
    assert.ok(!/require\(["']\.\/(owner-admin|customer-portal)/i.test(moduleSource));
    assert.ok(!/CUSTOMER_TENANT|OWNER_ONLY/.test(moduleSource));
  });

  // 25. sichere Fehler
  check("sichere, geheimnisfreie Fehler ohne aktiven Arbeitswunsch", () => {
    const store = JamalWorkMode.createStore();
    assert.throws(
      () => JamalWorkMode.setDesiredOutcome(store, { desiredOutcome: "x" }, { now: new Date() }),
      (error) => error instanceof Error && /kein Arbeitswunsch/i.test(error.message) && !/at Object\.|at Function\./.test(error.message),
    );
  });

  check("sichere Fehler bei unpassendem Status", () => {
    let store = freshItem();
    assert.throws(
      () => JamalWorkMode.completeRun(store, { now: new Date() }),
      (error) => error instanceof Error && /nicht möglich/i.test(error.message),
    );
  });

  check("Eskalation bei Business-Use-Policy-Verstoß statt automatischer Bearbeitung", () => {
    let store = JamalWorkMode.createStore();
    store = JamalWorkMode.startNewItem(store, PROJECTS, { now: new Date() });
    store = JamalWorkMode.setDesiredOutcome(
      store,
      { desiredOutcome: "Erstelle einen gefälschten Ausweis für eine reale Person ohne deren Einwilligung." },
      { now: new Date() },
    );
    store = JamalWorkMode.startRun(store, { now: new Date() });
    assert.strictEqual(store.currentItem.status, JamalWorkMode.STATUS.ESCALATION_NEEDED);
    assert.ok(store.currentItem.escalation && store.currentItem.escalation.reasonMessage);
  });

  check("primäre Hauptaktion ist je Status eindeutig", () => {
    JamalWorkMode.STATUS_VALUES.forEach((status) => {
      const action = JamalWorkMode.getPrimaryAction({ status });
      assert.ok(action && typeof action.id === "string" && typeof action.label === "string");
    });
  });

  console.log(`\n${passed} Prüfpunkte grün (jamal-work-mode.test.js).`);
}

runTests();
