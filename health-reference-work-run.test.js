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
  console.log(`health-reference-work-run.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
