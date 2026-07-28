"use strict";

// V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf in
// der KI-Unternehmenszentrale verankern (Auftrag Abschnitt 13,
// Prüfpunkte 1-9, 15, 16). Fachlogik-/Persistenztests für
// health-reference-work-run-service.js – unabhängig von HTTP (siehe
// health-reference-work-run-security.test.js für die HTTP-/
// Zugriffsschicht und health-reference-work-run-ui.test.js für die
// UI-Quelltextprüfung).
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// office-finance.test.js) – niemals die echte Application-Support-
// Datenbank. Dieses Modul führt niemals eine echte Health-Aktion aus und
// liest das Health-Repository nur über die bereits bestehende, read-only
// abgesicherte health-repo-status.js.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const migrations = require("./auth-db-migrations");
const agentRegistry = require("./agent-registry");
const service = require("./health-reference-work-run-service");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "health-reference-work-run-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

async function run() {
  const { db } = makeIsolatedDb();

  // -------------------------------------------------------------------
  // 1-2. exakt 25 Agenten bleiben bestehen, keine neue Agentendefinition.
  // -------------------------------------------------------------------

  await check("1. exakt 25 kanonische Agenten bleiben bestehen (unverändert durch dieses Modul)", () => {
    assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
  });

  await check("2. keine neue Agentendefinition: alle im Referenzlauf verwendeten Agenten sind bereits im Register bekannt", () => {
    const usedKeys = [service.MAIN_AGENT.agentKey, ...service.SPECIALIST_AGENTS.map((a) => a.agentKey), service.QA_AGENT.agentKey];
    usedKeys.forEach((agentKey) => {
      assert.ok(agentRegistry.hasAgentId(agentKey), `${agentKey} ist kein bekannter agent-registry.js-Agent`);
    });
    assert.strictEqual(typeof agentRegistry.registerAgent, "undefined");
    assert.strictEqual(typeof agentRegistry.addAgent, "undefined");
  });

  await check("2b. ein unbekannter kanonischer Rollenname wird beim Auflösen abgewiesen (kein erfundener Agent)", () => {
    assert.throws(() => service.resolveCanonicalAgent("Agent-26-Erfindung"), /unbekannte kanonische Agentenrolle/);
  });

  // -------------------------------------------------------------------
  // 3-5. Projektmanager Hauptverantwortlicher, max. drei Fachagenten,
  // genau ein QA-/Sicherheitsagent.
  // -------------------------------------------------------------------

  await check("3. Projektmanager-Agent ist der einzige Hauptverantwortliche", () => {
    assert.strictEqual(service.MAIN_AGENT.canonicalName, "Projektmanager-Agent");
    assert.strictEqual(service.MAIN_AGENT.runRole, "MAIN_RESPONSIBLE");
  });

  await check("4. maximal drei Fachagenten sind zugeordnet", () => {
    assert.ok(service.SPECIALIST_AGENTS.length <= 3);
    assert.strictEqual(service.SPECIALIST_AGENTS.length, 3);
    const distinctNames = new Set(service.SPECIALIST_AGENTS.map((a) => a.canonicalName));
    assert.strictEqual(distinctNames.size, 3, "keine doppelte Fachagentenzuordnung");
    assert.ok(!distinctNames.has(service.MAIN_AGENT.canonicalName), "Hauptverantwortlicher darf nicht zugleich Fachagent sein");
  });

  await check("5. genau ein QA-/Sicherheitsagent ist zugeordnet", () => {
    assert.strictEqual(service.QA_AGENT.canonicalName, "QA-Agent");
    assert.strictEqual(service.QA_AGENT.runRole, "QA_SECURITY");
    assert.notStrictEqual(service.QA_AGENT.canonicalName, service.MAIN_AGENT.canonicalName);
    service.SPECIALIST_AGENTS.forEach((agent) => assert.notStrictEqual(agent.canonicalName, service.QA_AGENT.canonicalName));
  });

  // -------------------------------------------------------------------
  // 6. Health-Lauf startet nicht als abgeschlossen.
  // -------------------------------------------------------------------

  const initialRun = service.getOrCreateCanonicalRun(db);

  await check("6. der Health-Referenzlauf startet nicht als abgeschlossen (PREPARED_FOR_EXECUTION, kein REFERENCE_READY)", () => {
    assert.strictEqual(initialRun.status, "PREPARED_FOR_EXECUTION");
    assert.notStrictEqual(initialRun.status, "REFERENCE_READY");
    assert.strictEqual(initialRun.progress.completed, 0);
    assert.strictEqual(initialRun.progress.total, 7);
    assert.strictEqual(initialRun.workPackages.length, 7);
    initialRun.workPackages.forEach((pkg) => assert.notStrictEqual(pkg.status, "REFERENCE_READY"));
  });

  await check("getOrCreateCanonicalRun ist idempotent (gleiche Lauf-ID, kein zweiter Lauf)", () => {
    const again = service.getOrCreateCanonicalRun(db);
    assert.strictEqual(again.id, initialRun.id);
    assert.strictEqual(again.id, service.CANONICAL_RUN_ID);
  });

  // -------------------------------------------------------------------
  // 15. Prompt-Entwurf enthält Pfad, Branch, HEAD, Grenzen und Tests.
  // -------------------------------------------------------------------

  const firstPackageKey = service.WORK_PACKAGE_DEFINITIONS[0].key;
  const preparedPackage = await service.prepareWorkPackagePromptDraft(db, { packageKey: firstPackageKey });

  await check("15. der Prompt-Entwurf enthält Projektpfad, Branch, HEAD, Sicherheitsgrenzen und Testanforderungen", () => {
    assert.ok(preparedPackage.hasPromptDraft);
    const draft = preparedPackage.promptDraft;
    assert.strictEqual(draft.projectPath, service.HEALTH_PROJECT_PATH);
    assert.ok("branch" in draft);
    assert.ok("head" in draft);
    assert.ok(Array.isArray(draft.securityBoundaries) && draft.securityBoundaries.length > 0);
    assert.ok(Array.isArray(draft.testRequirements) && draft.testRequirements.length > 0);
    assert.ok(Array.isArray(draft.nonGoals) && draft.nonGoals.length > 0);
  });

  // -------------------------------------------------------------------
  // 16. keine automatische Commit-/Push-Freigabe.
  // -------------------------------------------------------------------

  await check("16. der Prompt-Entwurf erteilt niemals eine automatische Commit-/Push-Freigabe", () => {
    const draft = preparedPackage.promptDraft;
    assert.strictEqual(draft.autoCommitAllowed, false);
    assert.strictEqual(draft.autoPushAllowed, false);
    assert.strictEqual(draft.commitRequiresJamalApproval, true);
    assert.strictEqual(draft.pushRequiresJamalApproval, true);
    assert.strictEqual(draft.status, "WAITING_FOR_JAMAL_APPROVAL");
  });

  await check("nach dem ersten Prompt-Entwurf wechselt der Gesamtlauf auf WAITING_FOR_JAMAL_APPROVAL", () => {
    const view = service.getRunView(db);
    assert.strictEqual(view.status, "WAITING_FOR_JAMAL_APPROVAL");
  });

  // -------------------------------------------------------------------
  // 8. Scale bleibt Phase 2 (Nicht-Ziele).
  // -------------------------------------------------------------------

  await check("8. Scale-V1-Hardwarefunktionen sind ausdrücklich Nicht-Ziel (bleiben Phase 2)", () => {
    assert.ok(service.NON_GOALS.includes("Echte Waagenhardware"));
    assert.ok(service.NON_GOALS.includes("BLE"));
    assert.ok(service.NON_GOALS.includes("Yolanda-SDK"));
    assert.ok(service.NON_GOALS.includes("Neue Scale-UI"));
    assert.ok(service.NON_GOALS.includes("Automatische Hardwareerkennung"));
  });

  await check("keine neuen Agenten, kein Agent 26 als Nicht-Ziel verankert", () => {
    assert.ok(service.NON_GOALS.includes("Neue Agenten"));
    assert.ok(service.NON_GOALS.includes("Agent 26"));
  });

  // -------------------------------------------------------------------
  // 9. keine echte Health-Ausführung (Autonomiegrenzen-Kennzeichnung).
  // -------------------------------------------------------------------

  await check("9. jede Antwort trägt feste Autonomiegrenzen ohne echte Health-Ausführung", () => {
    const boundaries = initialRun.autonomyBoundaries;
    assert.strictEqual(boundaries.noRealHealthExecution, true);
    assert.strictEqual(boundaries.noHealthFileChanged, true);
    assert.strictEqual(boundaries.noHealthBranchSwitch, true);
    assert.strictEqual(boundaries.noHealthCommit, true);
    assert.strictEqual(boundaries.noHealthPush, true);
    assert.strictEqual(boundaries.noNewAgentCreated, true);
    assert.strictEqual(boundaries.noExternalAction, true);
    assert.strictEqual(boundaries.productionReadinessClaim, false);
    assert.ok(Object.isFrozen(boundaries));
  });

  // -------------------------------------------------------------------
  // 7. REFERENCE_READY nur nach Jamals finaler Abnahme.
  // -------------------------------------------------------------------

  await check("7a. recordFinalAcceptance ohne confirmed === true wird abgewiesen (kein automatischer Sprung zu REFERENCE_READY)", () => {
    assert.throws(() => service.recordFinalAcceptance(db, {}), /confirmed === true/);
    assert.throws(() => service.recordFinalAcceptance(db, { confirmed: false }), /confirmed === true/);
    assert.notStrictEqual(service.getRunView(db).status, "REFERENCE_READY");
  });

  await check("7b. grüne Tests/QA-Befunde allein reichen nicht: submitQaFinding(passed=true) erreicht niemals REFERENCE_READY", () => {
    const pkgKey = service.WORK_PACKAGE_DEFINITIONS[0].key;
    service.transitionWorkPackage(db, { packageKey: pkgKey, toStatus: "APPROVED_FOR_EXECUTION" });
    service.transitionWorkPackage(db, { packageKey: pkgKey, toStatus: "IN_EXECUTION" });
    service.submitResultReport(db, { packageKey: pkgKey, summary: "Baseline bestätigt (Testfixtur)." });
    const afterQa = service.submitQaFinding(db, { packageKey: pkgKey, summary: "QA-Befund grün (Testfixtur).", passed: true });
    assert.notStrictEqual(afterQa.status, "REFERENCE_READY");
    assert.notStrictEqual(service.getRunView(db).status, "REFERENCE_READY");
  });

  await check("7c. transitionWorkPackage lehnt REFERENCE_READY als generisches Ziel ab", () => {
    const pkgKey = service.WORK_PACKAGE_DEFINITIONS[0].key;
    assert.throws(() => service.transitionWorkPackage(db, { packageKey: pkgKey, toStatus: "REFERENCE_READY" }), /ausschließlich über die finale Abnahme/);
    assert.ok(!service.ALLOWED_GENERIC_PACKAGE_TARGET_STATUSES.includes("REFERENCE_READY"));
  });

  await check("7d. recordApproval lehnt FINAL_REFERENCE_ACCEPTANCE als generische Freigabe ab", () => {
    assert.throws(
      () => service.recordApproval(db, { approvalKey: "FINAL_REFERENCE_ACCEPTANCE", decision: "APPROVED" }),
      /eigene Abnahmefunktion/,
    );
  });

  await check("7e. erst confirmed === true erreicht REFERENCE_READY, ausschließlich über recordFinalAcceptance", () => {
    const finalView = service.recordFinalAcceptance(db, { confirmed: true, note: "Testfixtur-Abnahme durch Jamal." });
    assert.strictEqual(finalView.status, "REFERENCE_READY");
    const finalApproval = finalView.approvals.find((a) => a.approvalKey === "FINAL_REFERENCE_ACCEPTANCE");
    assert.strictEqual(finalApproval.decision, "APPROVED");
  });

  await check("nach REFERENCE_READY ist der Lauf unveränderlich (assertRunIsMutable blockiert weitere Schreibaktionen)", () => {
    assert.throws(
      () => service.submitResultReport(db, { packageKey: service.WORK_PACKAGE_DEFINITIONS[1].key, summary: "Sollte abgelehnt werden." }),
      /bereits abgenommen/,
    );
  });

  // -------------------------------------------------------------------
  // Audit-Nachweis dieses Laufs (Auftrag Abschnitt 12/13 Prüfpunkt 14) –
  // hier fachlogisch, HTTP-seitig zusätzlich in
  // health-reference-work-run-security.test.js geprüft.
  // -------------------------------------------------------------------

  await check("14. Audit erfasst Lauf-Anlage, Arbeitspaket-Vorbereitung, Freigaben, Ergebnisse und finale Abnahme", () => {
    const events = authDb.listAuditEvents(db, { limit: 500 }).filter((event) => event.eventType.startsWith("HEALTH_REFERENCE_"));
    const eventTypes = new Set(events.map((event) => event.eventType));
    [
      "HEALTH_REFERENCE_RUN_CREATED",
      "HEALTH_REFERENCE_WORK_PACKAGE_PREPARED",
      "HEALTH_REFERENCE_PROMPT_DRAFT_CREATED",
      "HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED",
      "HEALTH_REFERENCE_QA_FINDING_RECORDED",
      "HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED",
      "HEALTH_REFERENCE_REFERENCE_READY_GRANTED",
    ].forEach((expectedType) => assert.ok(eventTypes.has(expectedType), `fehlendes Auditereignis: ${expectedType}`));
    events.forEach((event) => {
      if (!event.metadata) return;
      assert.doesNotMatch(event.metadata, /gewicht|diagnose|medizinisch|kilogramm/i);
    });
  });

  // -------------------------------------------------------------------
  // 10. keine externe Aktion – dieses Modul exportiert keine
  // netzwerk-/versand-/zahlungs-/veröffentlichungsfähige Funktion.
  // -------------------------------------------------------------------

  await check("10. der Service exportiert keine externe Aktion (kein Versand, keine Veröffentlichung, kein Deployment, kein Commit/Push)", () => {
    ["sendEmail", "publish", "deploy", "commit", "push", "gitCommit", "gitPush", "callGoogleWorkspace", "sendInvoice"].forEach((name) => {
      assert.strictEqual(typeof service[name], "undefined", `unerwarteter externer Export: ${name}`);
    });
  });

  authDb.closeAuthDatabase(db);

  // -------------------------------------------------------------------
  // V7.6.4 – einzelne Arbeitspakete korrekt abschließen (Auftrag
  // Abschnitt 8, Prüfpunkte 1-8, 12, 13). Eigene, frische isolierte
  // Datenbank, da der obige Lauf bereits REFERENCE_READY (unveränderlich)
  // ist.
  // -------------------------------------------------------------------

  const { db: db2 } = makeIsolatedDb("health-reference-work-run-test-v764-");
  service.getOrCreateCanonicalRun(db2);
  const [pkgKey1, pkgKey2, pkgKey3, pkgKey4, pkgKey5, pkgKey6, pkgKey7] = service.WORK_PACKAGE_DEFINITIONS.map(
    (definition) => definition.key,
  );

  await check("V7.6.4-1. COMPLETED existiert ausschließlich als Arbeitspaket-Status, niemals als Laufstatus", () => {
    assert.ok(migrations.HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES.includes("COMPLETED"));
    assert.ok(!migrations.HEALTH_REFERENCE_RUN_STATUS_VALUES.includes("COMPLETED"));
    assert.strictEqual(
      migrations.HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES.length,
      migrations.HEALTH_REFERENCE_RUN_STATUS_VALUES.length + 1,
    );
  });

  await service.prepareWorkPackagePromptDraft(db2, { packageKey: pkgKey1 });
  service.transitionWorkPackage(db2, { packageKey: pkgKey1, toStatus: "APPROVED_FOR_EXECUTION" });

  await check("V7.6.4-5. der Laufstatus folgt APPROVED_FOR_EXECUTION, sobald ein Arbeitspaket dorthin wechselt", () => {
    assert.strictEqual(service.getRunView(db2).status, "APPROVED_FOR_EXECUTION");
  });

  service.transitionWorkPackage(db2, { packageKey: pkgKey1, toStatus: "IN_EXECUTION" });
  service.submitResultReport(db2, { packageKey: pkgKey1, summary: "Ergebnis Paket 1 (Testfixtur)." });
  const pkg1AfterQa = service.submitQaFinding(db2, { packageKey: pkgKey1, summary: "QA Paket 1 bestanden (Testfixtur).", passed: true });

  await check("V7.6.4-2. Paket 1 (eines von 1-6) wird nach bestandenem QA COMPLETED, nicht REFERENCE_READY", () => {
    assert.strictEqual(pkg1AfterQa.status, "COMPLETED");
    assert.notStrictEqual(pkg1AfterQa.status, "REFERENCE_READY");
  });

  const viewAfterPkg1Completed = service.getRunView(db2);
  await check("V7.6.4-7. der Fortschritt zählt das abgeschlossene Paket 1 (1 von 7)", () => {
    assert.strictEqual(viewAfterPkg1Completed.progress.completed, 1);
    assert.strictEqual(viewAfterPkg1Completed.progress.total, 7);
  });

  await check("V7.6.4-8. nextWorkPackage liefert nach Abschluss von Paket 1 korrekt Paket 2", () => {
    assert.strictEqual(viewAfterPkg1Completed.nextWorkPackage.packageKey, pkgKey2);
  });

  await service.prepareWorkPackagePromptDraft(db2, { packageKey: pkgKey2 });
  const viewAfterPkg2Prepared = service.getRunView(db2);

  await check("V7.6.4-6. nach Paketabschluss und vorbereitetem Folgepaket zeigt der Lauf WAITING_FOR_JAMAL_APPROVAL", () => {
    assert.strictEqual(viewAfterPkg2Prepared.status, "WAITING_FOR_JAMAL_APPROVAL");
    assert.strictEqual(viewAfterPkg2Prepared.workPackages[0].status, "COMPLETED");
    assert.strictEqual(viewAfterPkg2Prepared.workPackages[1].status, "WAITING_FOR_JAMAL_APPROVAL");
    assert.notStrictEqual(viewAfterPkg2Prepared.status, "REFERENCE_READY");
  });

  await check("V7.6.4-14. Paket 2 bleibt nach der Vorbereitung unausgeführt (nicht freigegeben, nicht ausgeführt)", () => {
    assert.strictEqual(viewAfterPkg2Prepared.workPackages[1].status, "WAITING_FOR_JAMAL_APPROVAL");
    assert.notStrictEqual(viewAfterPkg2Prepared.workPackages[1].status, "APPROVED_FOR_EXECUTION");
    assert.notStrictEqual(viewAfterPkg2Prepared.workPackages[1].status, "IN_EXECUTION");
    assert.notStrictEqual(viewAfterPkg2Prepared.workPackages[1].status, "COMPLETED");
  });

  await check("V7.6.4-12/13. jeder Statusübergang erzeugt ein datensparsames HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED-Auditereignis", () => {
    const events = authDb
      .listAuditEvents(db2, { eventType: "HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED" })
      .filter((event) => JSON.parse(event.metadata || "{}").workPackageKey === pkgKey1);
    const transitions = events.map((event) => {
      const metadata = JSON.parse(event.metadata);
      return `${metadata.previousStatus}->${metadata.nextStatus}`;
    });
    assert.ok(transitions.includes("WAITING_FOR_JAMAL_APPROVAL->APPROVED_FOR_EXECUTION"));
    assert.ok(transitions.includes("APPROVED_FOR_EXECUTION->IN_EXECUTION"));
    assert.ok(transitions.includes("IN_EXECUTION->RESULT_SUBMITTED"));
    assert.ok(transitions.includes("RESULT_SUBMITTED->COMPLETED"));
    events.forEach((event) => {
      const metadataKeys = Object.keys(JSON.parse(event.metadata));
      assert.deepStrictEqual(
        metadataKeys.sort(),
        ["healthReferenceRunId", "nextStatus", "previousStatus", "workPackageKey"].sort(),
      );
      assert.doesNotMatch(event.metadata, /gewicht|diagnose|medizinisch|kilogramm/i);
    });
  });

  // Pakete 2-6 auf COMPLETED bringen (generischer Statuswechsel, gleiches
  // Verhalten wie über submitQaFinding), um Paket 7 (letztes Paket) isoliert
  // zu prüfen.
  [pkgKey2, pkgKey3, pkgKey4, pkgKey5, pkgKey6].forEach((key) => {
    service.transitionWorkPackage(db2, { packageKey: key, toStatus: "COMPLETED" });
  });

  await service.prepareWorkPackagePromptDraft(db2, { packageKey: pkgKey7 });
  service.transitionWorkPackage(db2, { packageKey: pkgKey7, toStatus: "APPROVED_FOR_EXECUTION" });
  service.transitionWorkPackage(db2, { packageKey: pkgKey7, toStatus: "IN_EXECUTION" });
  service.submitResultReport(db2, { packageKey: pkgKey7, summary: "Ergebnis Paket 7 (Testfixtur)." });
  const pkg7AfterQa = service.submitQaFinding(db2, { packageKey: pkgKey7, summary: "QA Paket 7 bestanden (Testfixtur).", passed: true });

  await check("V7.6.4-3. Paket 7 (letztes Paket) wird nach bestandenem QA NICHT automatisch COMPLETED, sondern wartet auf finale Abnahme", () => {
    assert.strictEqual(pkg7AfterQa.status, "WAITING_FOR_FINAL_ACCEPTANCE");
    assert.notStrictEqual(pkg7AfterQa.status, "COMPLETED");
  });

  const viewBeforeFinalAcceptance = service.getRunView(db2);
  await check("V7.6.4-4a. REFERENCE_READY ist vor der finalen Abnahme weiterhin nicht gesetzt (6 von 7 abgeschlossen)", () => {
    assert.strictEqual(viewBeforeFinalAcceptance.status, "WAITING_FOR_FINAL_ACCEPTANCE");
    assert.notStrictEqual(viewBeforeFinalAcceptance.status, "REFERENCE_READY");
    assert.strictEqual(viewBeforeFinalAcceptance.progress.completed, 6);
  });

  const viewAfterFinalAcceptance = service.recordFinalAcceptance(db2, { confirmed: true, note: "Testfixtur-Abnahme." });
  await check("V7.6.4-4b. REFERENCE_READY wird ausschließlich durch die bestätigte finale Abnahme erreicht (7 von 7)", () => {
    assert.strictEqual(viewAfterFinalAcceptance.status, "REFERENCE_READY");
    assert.strictEqual(viewAfterFinalAcceptance.progress.completed, 7);
  });

  authDb.closeAuthDatabase(db2);
  console.log(`health-reference-work-run.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
