"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AgentRegistry = require("./agent-registry");
const DailyWorkRun = require("./daily-work-run");
const { API_SECURITY_FLAGS, PROJECT_REGISTRY, buildProjectsResponse, getProjectById } = require("./project-registry");
const { requestHandler } = require("./server");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function invoke(method, url) {
  let statusCode = null;
  let rawBody = "";
  requestHandler(
    { method, url, headers: { host: "127.0.0.1" } },
    {
      writeHead(code) {
        statusCode = code;
      },
      end(body = "") {
        rawBody += body;
      },
    },
  );
  return { statusCode, body: rawBody ? JSON.parse(rawBody) : null };
}

function mockStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(data.entries());
    },
  };
}

function validDraft() {
  const health = getProjectById("health-upgrade-kompass");
  let run = DailyWorkRun.createDraftRun({ id: "run-test-1", workDate: "2026-07-11", now: "2026-07-11T08:00:00Z" });
  run = DailyWorkRun.setFocusProject(
    run,
    health,
    "Bestätigte technische Momentaufnahme; keine automatische Live-Aktualisierung.",
    "2026-07-11T08:00:00Z",
  );
  run = DailyWorkRun.createWorkProposal(run, {
    desiredOutcome: "Einen technisch begrenzten Codex-Prüfauftrag für die Health-Dokumentation vorbereiten.",
    prohibitedToday: "Keine fachliche Health-Freigabe",
  });
  return run;
}

function runTests() {
  const draft = DailyWorkRun.createDraftRun({ id: "schema", workDate: "2026-07-11" });
  check("gültiges Grundschema", () => assert.strictEqual(draft.schemaVersion, 1));
  check("genau ein Fokusprojekt", () => assert.throws(() => DailyWorkRun.setFocusProject(draft, { id: ["a", "b"] }), /Textwert/));
  check("genau ein Tagesergebnis", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: ["a", "b"] }), /Textwert/));
  check("genau ein Abnahmekriterium", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: "a", reason: "b", acceptanceCriterion: [] }), /Textwert/));
  check("genau eine Jamal-Entscheidungsfrage", () => assert.throws(() => DailyWorkRun.setDailyOutcome(draft, { desiredOutcome: "a", reason: "b", acceptanceCriterion: "c", jamalDecisionQuestion: ["x"] }), /Textwert/));

  const health = getProjectById("health-upgrade-kompass");
  const focused = DailyWorkRun.setFocusProject(draft, health, "Testmomentaufnahme", "2026-07-11T08:00:00Z");
  check("im normalen Start ist nur der Ergebniswunsch erforderlich", () => {
    const proposed = DailyWorkRun.createWorkProposal(focused, { desiredOutcome: "Bereite eine Strategieentscheidung vor" });
    assert.strictEqual(proposed.dailyOutcome.desiredOutcome, "Bereite eine Strategieentscheidung vor");
    assert.ok(proposed.dailyOutcome.acceptanceCriterion);
    assert.ok(proposed.decision.jamalDecisionQuestion);
  });
  check("fehlender Ergebniswunsch wird abgelehnt", () => assert.throws(() => DailyWorkRun.createWorkProposal(focused, {}), /desiredOutcome/));
  check("optionale Verbotsgrenze ist nicht erforderlich", () => assert.doesNotThrow(() => DailyWorkRun.createWorkProposal(focused, { desiredOutcome: "Bereite eine Entscheidung vor" })));
  check("alle acht Aufgabentypen werden erkannt", () => {
    const cases = [
      ["Welche Agenten werden benötigt und wer prüft?", "Agenten- und Einsatzplanung"],
      ["Entwickle mit Codex eine API", "Entwicklung/Codex"],
      ["Erstelle ein UX Design", "Design"],
      ["Formuliere einen Content Text", "Content"],
      ["Recherchiere belastbare Quellen", "Recherche"],
      ["Bereite eine Strategieentscheidung vor", "Strategie/Entscheidung"],
      ["Prüfe Qualität und Tests", "Qualität/Prüfung"],
      ["Wähle ein passendes Plugin oder Werkzeug", "Plugin-/Werkzeugauswahl"],
    ];
    assert.deepStrictEqual(cases.map(([text]) => DailyWorkRun.detectTaskType(text)), cases.map(([, type]) => type));
  });
  const agentPlanning = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Ich möchte wissen, welche Agenten jetzt beim Health Upgrade Kompass eingesetzt werden müssen und was jeder davon prüfen soll.",
  });
  check("Agentenplanung wird nicht zum Codex- oder Repository-Auftrag", () => {
    assert.strictEqual(agentPlanning.workProposal.taskType, "Agenten- und Einsatzplanung");
    assert.strictEqual(agentPlanning.workProposal.repositoryWorkRequired, false);
    assert.match(agentPlanning.codexPreparation.preparedPrompt, /kein Codex- oder Repository-Auftrag/i);
    assert.doesNotMatch(agentPlanning.codexPreparation.preparedPrompt, /Arbeite ausschließlich im Projekt/);
  });
  check("Agentenplanung enthält Rollen, Teilaufgaben und Übergaben", () => {
    assert.ok(agentPlanning.workProposal.agentPlan.length >= 3);
    assert.ok(agentPlanning.workProposal.agentPlan.every((item) => item.agentName && item.roleInRun && item.subtask && item.handoffTo));
    assert.ok(agentPlanning.workProposal.agentPlan.some((item) => item.agentId === "health-compass-agent"));
  });
  check("kanonisches Agentenregister enthält exakt 25 Hauptagenten", () => {
    assert.strictEqual(AgentRegistry.CANONICAL_AGENT_COUNT, 25);
    assert.strictEqual(AgentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
  });
  check("Server und Browser-Tageslauf verwenden dieselbe Agentenquelle", () => {
    const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const browserSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    const htmlSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    assert.match(serverSource, /require\("\.\/agent-registry"\)/);
    assert.doesNotMatch(serverSource, /const PRODUCTIVE_AGENT_REGISTRY = \[/);
    assert.match(browserSource, /window\.AgentRegistry\?\.PRODUCTIVE_AGENT_REGISTRY/);
    assert.doesNotMatch(browserSource, /const PRODUCTIVE_AGENT_REGISTRY = \[/);
    assert.match(htmlSource, /<script src="agent-registry\.js"><\/script>\s*<script src="health-hybrid-work\.js"><\/script>\s*<script src="daily-work-run\.js"><\/script>\s*<script src="agent-runtime\.js"><\/script>\s*<script src="local-data-backup\.js"><\/script>\s*<script src="daily-work-run-ui\.js"><\/script>/);
  });
  check("normaler Health-Tageslauf wählt höchstens fünf Kernagenten", () => {
    assert.strictEqual(agentPlanning.workProposal.selectedAgentIds.length, 5);
    assert.deepStrictEqual(agentPlanning.workProposal.selectedAgentIds, ["orchestrator-agent", "health-compass-agent", "product-agent", "quality-test-agent", "ui-agent"]);
  });
  check("Health-Pilot wählt bewusst nicht alle Agenten", () => assert.ok(agentPlanning.workProposal.selectedAgentIds.length < AgentRegistry.CANONICAL_AGENT_COUNT));
  check("kein erfundener Agent wird ausgewählt", () => {
    assert.ok(agentPlanning.workProposal.selectedAgentIds.every(AgentRegistry.hasAgentId));
    assert.deepStrictEqual(agentPlanning.workProposal.selectedAgentIds, agentPlanning.workProposal.agentPlan.map((item) => item.agentId));
  });
  check("jeder Agent hat Begründung, Teilauftrag, Ergebnis, Prüfung und Grenze", () => {
    assert.deepStrictEqual(DailyWorkRun.validateAgentPlan(agentPlanning.workProposal), []);
    assert.ok(agentPlanning.workProposal.agentPlan.every((item) => item.selectionReason && item.expectedResult && item.acceptanceCheck && item.safetyBoundary));
  });
  check("Hauptverantwortlicher ist eindeutig", () => {
    assert.strictEqual(agentPlanning.workProposal.leadAgentId, "orchestrator-agent");
    assert.strictEqual(agentPlanning.workProposal.leadAgent, "Projektmanager-Agent");
    assert.strictEqual(agentPlanning.workProposal.agentPlan.filter((item) => item.agentId === agentPlanning.workProposal.leadAgentId).length, 1);
  });
  check("QS-/Test-Agent bleibt Abnahmeverantwortlicher und nicht Gesamtleiter", () => {
    assert.strictEqual(agentPlanning.workProposal.approvalAgentId, "quality-test-agent");
    assert.strictEqual(agentPlanning.workProposal.approvalAgent, "QS-/Test-Agent");
    assert.notStrictEqual(agentPlanning.workProposal.leadAgentId, "quality-test-agent");
    assert.match(agentPlanning.workProposal.approvalAgentRole, /Abnahmekriterien und Abschlussprüfung/);
    assert.strictEqual(agentPlanning.workProposal.agentPlan.find((item) => item.agentId === "quality-test-agent").executionMode, "dependent-review");
    assert.strictEqual(agentPlanning.workProposal.agentPlan.find((item) => item.agentId === "orchestrator-agent").executionMode, "final-consolidation");
  });
  check("parallele Fachaufträge sind markiert", () => assert.ok(agentPlanning.workProposal.workStructure.parallelTasks.length > 0));
  check("Abhängigkeiten sind strukturiert markiert", () => {
    assert.ok(agentPlanning.workProposal.agentPlan.some((item) => item.dependsOn.length > 0));
    assert.ok(agentPlanning.workProposal.workStructure.dependentReviews.includes("quality-test-agent"));
  });
  check("jede Übergabe endet bei Agent, QA oder Jamal", () => {
    assert.ok(agentPlanning.workProposal.agentPlan.every((item) => item.handoffTo === "jamal" || AgentRegistry.hasAgentId(item.handoffTo)));
  });
  check("nicht benötigte Plugin- und Werkzeugprüfung ist eindeutig", () => {
    assert.ok(!agentPlanning.workProposal.selectedAgentIds.includes("integration-agent"));
    assert.strictEqual(agentPlanning.workProposal.toolReview.responsibleAgentId, null);
    assert.strictEqual(agentPlanning.workProposal.toolReview.required, false);
    assert.strictEqual(agentPlanning.workProposal.toolReview.statusLabel, "nicht benötigt");
  });
  check("Werkzeugprüfung bewertet Qualität, Datenschutz, Kosten und Ersatz", () => {
    const review = agentPlanning.workProposal.toolReview;
    ["Ergebnisqualität", "Datenschutz und Datenabfluss", "Kostenart", "Skalierbarkeit"].forEach((criterion) => assert.ok(review.selectionCriteria.includes(criterion)));
    assert.deepStrictEqual(review.possibleCombination, []);
    assert.ok(review.fallback);
  });
  check("Canva wird nicht automatisch als einziges Werkzeug festgelegt", () => {
    const reviewText = JSON.stringify(agentPlanning.workProposal.toolReview);
    assert.match(reviewText, /Keine automatische Festlegung auf Canva/);
    assert.notDeepStrictEqual(agentPlanning.workProposal.toolReview.toolCategories, ["Canva"]);
  });
  check("Health-Kernstruktur deckt Führung, Fachkontext, Produkt, QA und UI ab", () => {
    ["orchestrator-agent", "health-compass-agent", "product-agent", "quality-test-agent", "ui-agent"].forEach((id) => assert.ok(agentPlanning.workProposal.selectedAgentIds.includes(id)));
  });
  const healthFinish = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Den Health Upgrade Kompass als stabile und verständliche Demo vollständig prüfen und den nächsten sicheren Fertigstellungsschritt festlegen.",
  });
  check("normaler Health-Finish-Auftrag erhält höchstens fünf Kernagenten", () => {
    assert.ok(healthFinish.workProposal.coreAgentIds.length <= 5);
    assert.strictEqual(healthFinish.workProposal.additionalAgentIds.length, 0);
    assert.ok(healthFinish.workProposal.selectedAgentIds.length <= 5);
    assert.strictEqual(healthFinish.workProposal.leadAgentId, "orchestrator-agent");
    assert.strictEqual(healthFinish.workProposal.approvalAgentId, "quality-test-agent");
    ["orchestrator-agent", "health-compass-agent", "product-agent", "quality-test-agent"].forEach((id) => assert.ok(healthFinish.workProposal.selectedAgentIds.includes(id)));
    assert.ok(
      healthFinish.workProposal.selectedAgentIds.includes("communication-agent")
      || healthFinish.workProposal.selectedAgentIds.includes("ui-agent"),
    );
    assert.ok(!(
      healthFinish.workProposal.selectedAgentIds.includes("communication-agent")
      && healthFinish.workProposal.selectedAgentIds.includes("ui-agent")
    ));
    ["risk-agent", "security-agent", "documentation-agent", "integration-agent"].forEach((id) => {
      assert.ok(!healthFinish.workProposal.selectedAgentIds.includes(id));
    });
  });
  const designOnly = DailyWorkRun.createWorkProposal(
    DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "design-run", workDate: "2026-07-23" }), getProjectById("expansion-app"), "Snap", "2026-07-11T08:00:00Z"),
    { desiredOutcome: "Erstelle ein UX Design" },
  );
  check("UI-Agent und Kommunikations-Agent werden nicht pauschal gleichzeitig ausgewählt", () => {
    assert.ok(!(
      designOnly.workProposal.selectedAgentIds.includes("ui-agent")
      && designOnly.workProposal.selectedAgentIds.includes("communication-agent")
    ));
    assert.ok(designOnly.workProposal.selectedAgentIds.includes("ui-agent"));
    assert.strictEqual(designOnly.workProposal.leadAgentId, "orchestrator-agent");
  });
  const extendedPlanning = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Erstelle einen Health-Einsatzplan mit konkreter Plugin-, Datenschutz- und Dokumentationsprüfung.",
  });
  check("zusätzliche Agenten entstehen nur aus konkretem Bedarf", () => {
    assert.ok(extendedPlanning.workProposal.selectedAgentIds.length > 5);
    ["integration-agent", "security-agent", "documentation-agent"].forEach((id) => assert.ok(extendedPlanning.workProposal.selectedAgentIds.includes(id)));
    assert.ok(extendedPlanning.workProposal.agentPlan.every((item) => item.selectionReason));
    assert.strictEqual(extendedPlanning.workProposal.toolReview.responsibleAgentId, "integration-agent");
    assert.strictEqual(extendedPlanning.workProposal.toolReview.statusLabel, "Plugin-/Tool-Radar-Agent zuständig");
  });
  check("Sicherheits-, Risiko-, Dokumentations- und Plugin-Agenten bleiben ohne konkreten Bedarf draußen", () => {
    ["security-agent", "risk-agent", "documentation-agent", "integration-agent"].forEach((id) => {
      assert.ok(!agentPlanning.workProposal.selectedAgentIds.includes(id));
    });
  });
  check("Kernagenten und Zusatzrollen sind getrennt und konsistent", () => {
    assert.ok(agentPlanning.workProposal.coreAgentIds.length <= 5);
    assert.strictEqual(agentPlanning.workProposal.additionalAgentIds.length, 0);
    assert.strictEqual(
      agentPlanning.workProposal.coreAgentIds.length + agentPlanning.workProposal.additionalAgentIds.length,
      agentPlanning.workProposal.selectedAgentIds.length,
    );
    assert.ok(extendedPlanning.workProposal.coreAgentIds.length <= 5);
    assert.ok(extendedPlanning.workProposal.additionalAgentIds.length >= 3);
    assert.strictEqual(
      extendedPlanning.workProposal.coreAgentIds.length + extendedPlanning.workProposal.additionalAgentIds.length,
      extendedPlanning.workProposal.selectedAgentIds.length,
    );
  });

  const privacyAndRisk = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Prüfe Datenschutz und Risiko für den Tagesauftrag.",
  });
  check("Datenschutz und Risiko wählen Sicherheits- und Risiko-Agent", () => {
    assert.ok(privacyAndRisk.workProposal.selectedAgentIds.includes("security-agent"));
    assert.ok(privacyAndRisk.workProposal.selectedAgentIds.includes("risk-agent"));
    assert.ok(privacyAndRisk.workProposal.additionalAgentIds.includes("security-agent"));
    assert.ok(privacyAndRisk.workProposal.additionalAgentIds.includes("risk-agent"));
    const riskItem = privacyAndRisk.workProposal.agentPlan.find((item) => item.agentId === "risk-agent");
    assert.ok(riskItem.selectionReason && riskItem.subtask && riskItem.expectedResult && riskItem.acceptanceCheck && riskItem.handoffTo);
  });
  const privacyOnly = DailyWorkRun.createWorkProposal(focused, {
    desiredOutcome: "Prüfe Datenschutz für den Tagesauftrag.",
  });
  check("reiner Datenschutzauftrag wählt nicht pauschal den Risiko-Agenten", () => {
    assert.ok(privacyOnly.workProposal.selectedAgentIds.includes("security-agent"));
    assert.ok(!privacyOnly.workProposal.selectedAgentIds.includes("risk-agent"));
  });
  check("Risiko-Varianten werden erkannt", () => {
    ["Prüfe das Risiko", "Bewerte die Risiken", "Führe eine Risiko-Prüfung durch", "Erstelle eine Risikobewertung", "Mach einen Risikocheck", "Führe eine Risikoprüfung durch"].forEach((desiredOutcome) => {
      const proposal = DailyWorkRun.createWorkProposal(focused, { desiredOutcome }).workProposal;
      assert.ok(proposal.selectedAgentIds.includes("risk-agent"), desiredOutcome);
    });
  });
  check("identischer Auftrag bleibt deterministisch", () => {
    const first = DailyWorkRun.createWorkProposal(focused, {
      desiredOutcome: "Prüfe Datenschutz und Risiko für den Tagesauftrag.",
    }).workProposal;
    const second = DailyWorkRun.createWorkProposal(focused, {
      desiredOutcome: "Prüfe Datenschutz und Risiko für den Tagesauftrag.",
    }).workProposal;
    assert.deepStrictEqual(first.selectedAgentIds, second.selectedAgentIds);
    assert.deepStrictEqual(first.coreAgentIds, second.coreAgentIds);
    assert.deepStrictEqual(first.additionalAgentIds, second.additionalAgentIds);
  });

  check("approvalAgentId ist verbindliche Abnahmequelle", () => {
    assert.strictEqual(agentPlanning.workProposal.approvalAgentId, "quality-test-agent");
    assert.strictEqual(DailyWorkRun.resolveApprovalAgentId(agentPlanning.workProposal).approvalAgentId, "quality-test-agent");
    assert.strictEqual(DailyWorkRun.getApprovalAgentDisplay(agentPlanning.workProposal).approvalAgent, "QS-/Test-Agent");
    assert.notStrictEqual(agentPlanning.workProposal.leadAgentId, agentPlanning.workProposal.approvalAgentId);
    const ready = DailyWorkRun.transitionRun(agentPlanning, "READY_FOR_CODEX");
    const prepared = DailyWorkRun.prepareAgentReviewPhase(ready, { approved: true, now: "2026-07-23T11:00:00Z" });
    const approvalCard = DailyWorkRun.getAgentReviewPhase(prepared).workItems.find((item) => item.isApproval);
    assert.strictEqual(approvalCard.agentId, "quality-test-agent");
    assert.strictEqual(approvalCard.agentName, "QS-/Test-Agent");
  });
  check("product-agent als approvalAgentId wird abgewiesen", () => {
    const invalid = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    invalid.approvalAgentId = "product-agent";
    invalid.approvalAgent = "QS-/Test-Agent";
    assert.ok(DailyWorkRun.validateAgentPlan(invalid).some((error) => /quality-test-agent/.test(error)));
    assert.strictEqual(DailyWorkRun.resolveApprovalAgentId(invalid).ok, false);
  });
  check("widersprüchlicher Approval-Anzeigename wird abgewiesen", () => {
    const conflict = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    conflict.approvalAgentId = "quality-test-agent";
    conflict.approvalAgent = "Produkt-Agent";
    assert.ok(DailyWorkRun.validateAgentPlan(conflict).some((error) => /approvalAgent widerspricht approvalAgentId/.test(error)));
    assert.strictEqual(DailyWorkRun.getApprovalAgentDisplay(conflict).approvalAgent, "QS-/Test-Agent");
  });
  check("fehlende Approval-ID in Altbestand fällt sicher auf QS zurück", () => {
    const legacy = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    delete legacy.approvalAgentId;
    const resolved = DailyWorkRun.resolveApprovalAgentId(legacy, { allowLegacyFallback: true });
    assert.strictEqual(resolved.ok, true);
    assert.strictEqual(resolved.approvalAgentId, "quality-test-agent");
    assert.strictEqual(resolved.legacyFallback, true);
  });
  check("Legacy ohne Approval-ID und ohne QS wird abgewiesen", () => {
    const legacy = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    delete legacy.approvalAgentId;
    legacy.selectedAgentIds = legacy.selectedAgentIds.filter((id) => id !== "quality-test-agent");
    legacy.agentPlan = legacy.agentPlan.filter((item) => item.agentId !== "quality-test-agent");
    legacy.coreAgentIds = legacy.coreAgentIds.filter((id) => id !== "quality-test-agent");
    const resolved = DailyWorkRun.resolveApprovalAgentId(legacy, { allowLegacyFallback: true });
    assert.strictEqual(resolved.ok, false);
    assert.ok(DailyWorkRun.validateAgentPlan(legacy).some((error) => /approvalAgentId fehlt/.test(error)));
  });
  check("ungültige Approval-ID wird abgewiesen", () => {
    const invalid = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    invalid.approvalAgentId = "not-an-agent";
    assert.ok(DailyWorkRun.validateAgentPlan(invalid).some((error) => /approvalAgentId/.test(error)));
  });
  check("Approval-Agent außerhalb der Auswahl wird abgewiesen", () => {
    const mismatch = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    mismatch.selectedAgentIds = mismatch.selectedAgentIds.filter((id) => id !== "quality-test-agent");
    mismatch.agentPlan = mismatch.agentPlan.filter((item) => item.agentId !== "quality-test-agent");
    mismatch.coreAgentIds = mismatch.coreAgentIds.filter((id) => id !== "quality-test-agent");
    assert.ok(DailyWorkRun.validateAgentPlan(mismatch).some((error) => /approvalAgentId fehlt in der Agentenauswahl|quality-test-agent/.test(error)));
  });
  check("Approval-Agent als Lead wird abgewiesen", () => {
    const asLead = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    asLead.leadAgentId = "quality-test-agent";
    asLead.leadAgent = "QS-/Test-Agent";
    assert.ok(DailyWorkRun.validateAgentPlan(asLead).some((error) => /Gesamtleiter|orchestrator-agent/.test(error)));
  });
  check("Widerspruch zwischen Approval-ID und Auswahl wird abgewiesen", () => {
    const mismatch = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    mismatch.approvalAgentId = "strategy-agent";
    assert.ok(DailyWorkRun.validateAgentPlan(mismatch).some((error) => /approvalAgentId|quality-test-agent/.test(error)));
  });

  check("Rollenlisten: doppelte Kern-ID wird abgewiesen", () => {
    const broken = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    broken.coreAgentIds = [...broken.coreAgentIds, broken.coreAgentIds[0]];
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /coreAgentIds enthält Duplikate/.test(error)));
  });
  check("Rollenlisten: doppelte Zusatz-ID wird abgewiesen", () => {
    const broken = JSON.parse(JSON.stringify(extendedPlanning.workProposal));
    broken.additionalAgentIds = [...broken.additionalAgentIds, broken.additionalAgentIds[0]];
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /additionalAgentIds enthält Duplikate/.test(error)));
  });
  check("Rollenlisten: Überschneidung Kern/Zusatz wird abgewiesen", () => {
    const broken = JSON.parse(JSON.stringify(extendedPlanning.workProposal));
    broken.additionalAgentIds = [...broken.additionalAgentIds, broken.coreAgentIds[0]];
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /überschneiden/.test(error)));
  });
  check("Rollenlisten: selectedAgentId fehlt in beiden Listen", () => {
    const broken = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    broken.coreAgentIds = broken.coreAgentIds.slice(0, -1);
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /fehlt in Kern- und Zusatzrollen|passen nicht/.test(error)));
  });
  check("Rollenlisten: Fremd-ID in Kern fehlt in selectedAgentIds", () => {
    const broken = JSON.parse(JSON.stringify(agentPlanning.workProposal));
    broken.coreAgentIds = [...broken.coreAgentIds.slice(0, -1), "strategy-agent"];
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /fehlt in der Agentenauswahl|passen nicht/.test(error)));
  });
  check("Rollenlisten: mehr als fünf Kernagenten werden abgewiesen", () => {
    const broken = JSON.parse(JSON.stringify(extendedPlanning.workProposal));
    broken.coreAgentIds = broken.selectedAgentIds.slice(0, 6);
    broken.additionalAgentIds = broken.selectedAgentIds.slice(6);
    assert.ok(DailyWorkRun.validateAgentPlan(broken).some((error) => /Mehr als fünf Kernagenten/.test(error)));
  });
  check("Legacy ohne Rollenlisten normalisiert deterministisch", () => {
    const legacy = JSON.parse(JSON.stringify(extendedPlanning.workProposal));
    delete legacy.coreAgentIds;
    delete legacy.additionalAgentIds;
    const normalized = DailyWorkRun.normalizeRolePartitions(legacy);
    assert.strictEqual(normalized.legacyFallback, true);
    assert.deepStrictEqual(normalized.coreAgentIds, legacy.selectedAgentIds.slice(0, 5));
    assert.deepStrictEqual(normalized.additionalAgentIds, legacy.selectedAgentIds.slice(5));
    assert.strictEqual(DailyWorkRun.validateAgentPlan(legacy).filter((error) => /Kern- und Zusatzrollen/.test(error)).length, 0);
  });
  const nonHealth = DailyWorkRun.createWorkProposal(
    DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "non-health", workDate: "2026-07-23" }), getProjectById("expansion-app"), "Snap", "2026-07-11T08:00:00Z"),
    { desiredOutcome: "Bereite eine Strategieentscheidung vor" },
  );
  check("normaler Nicht-Health-Auftrag bleibt schlank und PM-geführt", () => {
    assert.ok(nonHealth.workProposal.selectedAgentIds.length <= 5);
    assert.strictEqual(nonHealth.workProposal.leadAgentId, "orchestrator-agent");
    assert.strictEqual(nonHealth.workProposal.approvalAgentId, "quality-test-agent");
    assert.strictEqual(nonHealth.workProposal.additionalAgentIds.length, 0);
  });
  const pluginOnly = DailyWorkRun.createWorkProposal(
    DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "plugin-run", workDate: "2026-07-23" }), getProjectById("expansion-app"), "Snap", "2026-07-11T08:00:00Z"),
    { desiredOutcome: "Wähle ein passendes Plugin oder Werkzeug" },
  );
  check("Plugin-Auftrag weist Plugin-/Tool-Radar klar zu", () => {
    assert.ok(pluginOnly.workProposal.selectedAgentIds.includes("integration-agent"));
    assert.strictEqual(pluginOnly.workProposal.toolReview.statusLabel, "Plugin-/Tool-Radar-Agent zuständig");
    assert.strictEqual(pluginOnly.workProposal.leadAgentId, "orchestrator-agent");
  });
  const communicationOnly = DailyWorkRun.createWorkProposal(
    DailyWorkRun.setFocusProject(DailyWorkRun.createDraftRun({ id: "comm-run", workDate: "2026-07-23" }), getProjectById("expansion-app"), "Snap", "2026-07-11T08:00:00Z"),
    { desiredOutcome: "Formuliere einen Content Text" },
  );
  check("Kommunikationsauftrag wählt Kommunikations-Agent ohne UI-Doppelung", () => {
    assert.ok(communicationOnly.workProposal.selectedAgentIds.includes("communication-agent"));
    assert.ok(!communicationOnly.workProposal.selectedAgentIds.includes("ui-agent"));
  });
  check("bestehende Design-DNA und 8-von-10-Regel bleiben im Plan", () => {
    assert.ok(agentPlanning.workProposal.designQualityFramework.includes("Apple statt Dubai"));
    assert.ok(agentPlanning.workProposal.designQualityFramework.some((item) => item.includes("8/10")));
  });
  check("Jamal erhält eine verständliche Health-Frage", () => assert.strictEqual(agentPlanning.workProposal.jamalDecisionQuestion, "Soll die Zentrale mit diesem Agententeam die nächste Health-Prüfphase vorbereiten?"));
  check("nicht benötigte Agenten werden mit nachvollziehbarer Regel ausgeschlossen", () => {
    assert.strictEqual(agentPlanning.workProposal.excludedAgentCount, 25 - agentPlanning.workProposal.selectedAgentIds.length);
    assert.match(agentPlanning.workProposal.exclusionReason, /Nicht ausgewählt/);
  });
  check("Reload erhält den vollständigen strukturierten Einsatzplan", () => {
    const dailyStorage = mockStorage();
    DailyWorkRun.saveDailyStore(dailyStorage, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), agentPlanning));
    const reloaded = DailyWorkRun.getActiveRun(DailyWorkRun.loadDailyStore(dailyStorage));
    assert.deepStrictEqual(reloaded.workProposal, agentPlanning.workProposal);
  });
  check("alter Tageslauf ohne V6.40.2-Felder bleibt erhalten", () => {
    const oldRun = { ...DailyWorkRun.createDraftRun({ id: "alter-v6401-lauf" }), workProposal: { taskType: "Agenten- und Einsatzplanung", agentPlan: [{ agent: "Orchestrator-Agent", role: "Einsatzleitung", subtask: "Altbestand", handoffTo: "Jamal" }] } };
    const oldStore = DailyWorkRun.createStore({ activeRunId: oldRun.id, runs: [oldRun] });
    assert.deepStrictEqual(DailyWorkRun.getActiveRun(oldStore).workProposal, oldRun.workProposal);
  });
  check("keine Löschung und keine automatische Agenten-, Codex- oder Plugin-Ausführung", () => {
    const sources = ["daily-work-run.js", "daily-work-run-ui.js", "app.js", "agent-registry.js"].map((file) => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
    assert.doesNotMatch(sources, /localStorage\.(?:clear|removeItem)/);
    assert.strictEqual(agentPlanning.boundary.agentExecutionBlocked, true);
    assert.strictEqual(agentPlanning.boundary.codexExecutionBlocked, true);
    assert.match(agentPlanning.codexPreparation.preparedPrompt, /Keine Agenten-, Codex- oder Plugin-Ausführung/);
  });

  const readyAgentPlanning = DailyWorkRun.transitionRun(agentPlanning, "READY_FOR_CODEX");
  check("V6.40.3-Prüfphase startet sicher ohne Freigabe", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(readyAgentPlanning);
    assert.strictEqual(phase.status, "NOT_APPROVED");
    assert.strictEqual(phase.noAgentExecution, true);
    assert.deepStrictEqual(phase.workItems, []);
  });
  check("Prüfphase kann ohne Jamals Freigabe nicht vorbereitet werden", () => {
    assert.throws(() => DailyWorkRun.prepareAgentReviewPhase(readyAgentPlanning), /Freigabe/);
  });
  check("Prüfphase wird nur aus gültigem Agentenplan erzeugt", () => {
    const invalid = JSON.parse(JSON.stringify(readyAgentPlanning));
    invalid.workProposal.leadAgentId = "missing-agent";
    assert.throws(() => DailyWorkRun.prepareAgentReviewPhase(invalid, { approved: true }), /Hauptverantwortlicher/);
  });

  const preparedAgentReview = DailyWorkRun.prepareAgentReviewPhase(readyAgentPlanning, { approved: true, now: "2026-07-12T09:00:00Z" });
  const preparedPhase = DailyWorkRun.getAgentReviewPhase(preparedAgentReview);
  check("genau ausgewählte Agenten erhalten Arbeitskarten", () => {
    assert.strictEqual(preparedPhase.workItems.length, 5);
    assert.deepStrictEqual(preparedPhase.workItems.map((item) => item.agentId), agentPlanning.workProposal.selectedAgentIds);
  });
  check("ausgeschlossene Agenten erhalten keine Arbeitskarte", () => {
    const workIds = new Set(preparedPhase.workItems.map((item) => item.agentId));
    AgentRegistry.PRODUCTIVE_AGENT_REGISTRY.filter((agent) => !agentPlanning.workProposal.selectedAgentIds.includes(agent.id)).forEach((agent) => assert.strictEqual(workIds.has(agent.id), false));
  });
  check("genau ein Lead-Agent bleibt erhalten", () => {
    const leads = preparedPhase.workItems.filter((item) => item.isLead);
    assert.strictEqual(leads.length, 1);
    assert.strictEqual(leads[0].agentId, "orchestrator-agent");
  });
  check("kein Agent wird als tatsächlich ausgeführt dargestellt", () => {
    assert.strictEqual(preparedPhase.noAgentExecution, true);
    assert.doesNotMatch(JSON.stringify(preparedPhase), /arbeitet gerade|RUNNING|EXECUTING/i);
  });
  check("jede Arbeitskarte enthält Auftrag, Ergebnisziel, Prüfung und Grenze", () => {
    assert.ok(preparedPhase.workItems.every((item) => item.subtask && item.expectedResult && item.acceptanceCheck && item.safetyBoundary));
  });
  check("Agentenstatus besitzt ausschließlich sichere Standardwerte", () => {
    assert.ok(preparedPhase.workItems.every((item) => DailyWorkRun.AGENT_WORK_ITEM_STATUSES.includes(item.status)));
    assert.ok(preparedPhase.workItems.every((item) => ["READY", "WAITING"].includes(item.status)));
  });
  check("vorbereitende Grundlagen sind sofort bereit", () => {
    const prerequisites = preparedPhase.workItems.filter((item) => item.executionMode === "prerequisite");
    assert.deepStrictEqual(prerequisites.map((item) => item.agentId), ["health-compass-agent", "product-agent"]);
    assert.ok(prerequisites.every((item) => item.status === "READY"));
  });
  check("parallele Aufgaben warten zunächst auf Grundlagen", () => {
    assert.ok(preparedPhase.workItems.filter((item) => item.executionMode === "parallel").every((item) => item.status === "WAITING"));
  });
  check("QA ist vor notwendigen Fachbefunden nicht bereit", () => {
    assert.strictEqual(preparedPhase.workItems.find((item) => item.agentId === "quality-test-agent").status, "WAITING");
    assert.throws(() => DailyWorkRun.recordQaResult(preparedAgentReview, { status: "BESTANDEN", resultText: "Zu früh" }), /erst nach/);
  });
  check("Orchestrator wartet vor QA", () => {
    assert.strictEqual(preparedPhase.workItems.find((item) => item.agentId === "orchestrator-agent").status, "WAITING");
    assert.throws(() => DailyWorkRun.recordOrchestrationSummary(preparedAgentReview, { confirmedFindings: "Zu früh" }), /erst nach/);
  });
  check("leeres Agentenergebnis kann nicht bestätigt werden", () => {
    assert.throws(() => DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "product-agent", { resultText: "", confirmed: true }), /resultText/);
  });
  check("Ergebnis muss zum richtigen ausgewählten Agenten gehören", () => {
    assert.throws(() => DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "strategy-agent", { resultText: "Fremd", confirmed: true }), /gehört nicht/);
  });

  let reviewProgress = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "product-agent", {
    resultText: "Technischer Projektstand wurde manuell gegen die kanonische Akte geprüft.",
    openPoints: "Live-Aktualisierung bleibt offen.",
    confirmed: true,
    now: "2026-07-12T09:10:00Z",
  });
  check("manuelle Ergebnisrückführung speichert Befund und Quelle", () => {
    const item = DailyWorkRun.getAgentReviewPhase(reviewProgress).workItems.find((entry) => entry.agentId === "product-agent");
    assert.strictEqual(item.status, "ACCEPTED");
    assert.strictEqual(item.resultConfirmed, true);
    assert.match(item.resultSource, /Manuelle Rückführung/);
  });
  check("bestätigtes Ergebnis kann nicht unbeabsichtigt doppelt bestätigt werden", () => {
    assert.throws(() => DailyWorkRun.recordAgentWorkResult(reviewProgress, "product-agent", { resultText: "Überschreiben", confirmed: true }), /bereits bestätigt/);
  });
  check("Blocker bleiben sichtbar und verhindern Abschlussreife", () => {
    const blocked = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "health-compass-agent", { resultText: "Fachgrenze offen.", blockers: "Medizinische Freigabe fehlt.", confirmed: true });
    const item = DailyWorkRun.getAgentReviewPhase(blocked).workItems.find((entry) => entry.agentId === "health-compass-agent");
    assert.strictEqual(item.status, "BLOCKED");
    assert.deepStrictEqual(item.blockers, ["Medizinische Freigabe fehlt."]);
  });
  check("eindeutig negative Blocker-Angaben werden als kein Blocker normalisiert", () => {
    [
      "",
      "Keine.",
      "keine",
      "Kein Blocker",
      "nicht vorhanden",
      "kein",
      "keine blocker",
      "-",
    ].forEach((blockers) => {
      assert.deepStrictEqual(DailyWorkRun.normalizeBlockerList(blockers), []);
      const accepted = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "health-compass-agent", {
        resultText: "Health-Fachbefund ohne echten Blocker.",
        blockers,
        confirmed: true,
      });
      const item = DailyWorkRun.getAgentReviewPhase(accepted).workItems.find((entry) => entry.agentId === "health-compass-agent");
      assert.strictEqual(item.status, "ACCEPTED");
      assert.deepStrictEqual(item.blockers, []);
      assert.strictEqual(item.resultConfirmed, true);
      assert.strictEqual(item.resultText, "Health-Fachbefund ohne echten Blocker.");
    });
  });
  check("echte Blocker-Aussagen bleiben erhalten und blockieren", () => {
    [
      "Keine Freigabe vorhanden",
      "Kein Zugriff auf Testdaten",
      "Externe Freigabe fehlt",
      "Kein Zugriff auf die Testdaten",
      "Risiko nicht geklärt",
      "Blocker: externe Freigabe fehlt",
    ].forEach((blockers) => {
      assert.deepStrictEqual(DailyWorkRun.normalizeBlockerList(blockers), [blockers]);
      const blocked = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "health-compass-agent", {
        resultText: "Echter Blocker liegt vor.",
        blockers,
        confirmed: true,
      });
      const item = DailyWorkRun.getAgentReviewPhase(blocked).workItems.find((entry) => entry.agentId === "health-compass-agent");
      assert.strictEqual(item.status, "BLOCKED");
      assert.deepStrictEqual(item.blockers, [blockers]);
    });
  });
  check("gespeicherter Fehlblocker „Keine.“ wird sicher geheilt ohne Befundverlust", () => {
    let poisoned = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "product-agent", {
      resultText: "Produktfluss und Demo-Grenzen manuell geprüft.",
      confirmed: true,
      now: "2026-07-23T11:55:00Z",
    });
    poisoned = DailyWorkRun.recordAgentWorkResult(poisoned, "health-compass-agent", {
      resultText: "Health-Kernfluss und offene Fachfragen manuell geprüft.",
      blockers: "Temporärer Platzhalter.",
      confirmed: true,
      now: "2026-07-23T12:00:00Z",
    });
    const healthItem = poisoned.agentReviewPhase.workItems.find((entry) => entry.agentId === "health-compass-agent");
    healthItem.blockers = ["Keine."];
    healthItem.status = "BLOCKED";
    const parallelBefore = poisoned.agentReviewPhase.workItems.filter((entry) => entry.executionMode === "parallel");
    parallelBefore.forEach((entry) => {
      entry.status = "WAITING";
    });
    const healed = DailyWorkRun.getAgentReviewPhase(poisoned);
    const healedHealth = healed.workItems.find((entry) => entry.agentId === "health-compass-agent");
    assert.strictEqual(healedHealth.resultConfirmed, true);
    assert.strictEqual(healedHealth.resultText, "Health-Kernfluss und offene Fachfragen manuell geprüft.");
    assert.deepStrictEqual(healedHealth.blockers, []);
    assert.strictEqual(healedHealth.status, "ACCEPTED");
    assert.ok(!healed.qa.blockedAgentIds.includes("health-compass-agent"));
    const parallelAfter = healed.workItems.filter((entry) => entry.executionMode === "parallel");
    assert.ok(parallelAfter.length > 0);
    assert.ok(parallelAfter.every((entry) => entry.status === "READY"));
  });
  check("teilweise Ergebnisse bleiben nach Reload erhalten", () => {
    const storageV6403 = mockStorage();
    DailyWorkRun.saveDailyStore(storageV6403, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), reviewProgress));
    const reloaded = DailyWorkRun.getActiveRun(DailyWorkRun.loadDailyStore(storageV6403));
    assert.deepStrictEqual(reloaded.agentReviewPhase, reviewProgress.agentReviewPhase);
  });
  check("alter V6.40.2-Lauf ohne Prüfphase bleibt lesbar", () => {
    const oldV6402 = JSON.parse(JSON.stringify(readyAgentPlanning));
    delete oldV6402.agentReviewPhase;
    const oldStore = DailyWorkRun.createStore({ activeRunId: oldV6402.id, runs: [oldV6402] });
    assert.strictEqual(DailyWorkRun.getActiveRun(oldStore).workProposal.selectedAgentIds.length, 5);
    assert.strictEqual(DailyWorkRun.getAgentReviewPhase(DailyWorkRun.getActiveRun(oldStore)).status, "NOT_APPROVED");
  });

  for (const agentId of ["health-compass-agent"]) {
    reviewProgress = DailyWorkRun.recordAgentWorkResult(reviewProgress, agentId, { resultText: `${agentId}: Grundlage manuell bestätigt.`, confirmed: true });
  }
  check("parallele Aufgaben werden nach Grundlagen bereit", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(reviewProgress);
    assert.ok(phase.workItems.filter((item) => item.executionMode === "parallel").every((item) => item.status === "READY"));
  });

  const parallelAgentIds = DailyWorkRun.getAgentReviewPhase(reviewProgress).workItems.filter((item) => item.executionMode === "parallel").map((item) => item.agentId);
  for (const agentId of parallelAgentIds) {
    reviewProgress = DailyWorkRun.recordAgentWorkResult(reviewProgress, agentId, { resultText: `${agentId}: Fachbefund manuell bestätigt.`, confirmed: true });
  }
  check("QA wird erst nach allen notwendigen Ergebnissen bereit", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(reviewProgress);
    assert.strictEqual(phase.status, "READY_FOR_QA");
    assert.strictEqual(phase.workItems.find((item) => item.agentId === "quality-test-agent").status, "READY");
    assert.strictEqual(phase.qa.missingAgentIds.length, 0);
  });
  check("QA erzeugt keine automatische Bestanden-Behauptung", () => {
    const qa = DailyWorkRun.getAgentReviewPhase(reviewProgress).qa;
    assert.strictEqual(qa.status, "NOT_READY");
    assert.strictEqual(qa.confirmedAt, null);
  });

  reviewProgress = DailyWorkRun.recordQaResult(reviewProgress, {
    status: "TEILWEISE_BESTANDEN",
    resultText: "Alle Fachbefunde wurden manuell geprüft; offene Punkte bleiben sichtbar.",
    openPoints: "Fachfreigabe bleibt offen.",
    criteriaAnswered: true,
    now: "2026-07-12T11:00:00Z",
  });
  check("QA-Befund wird ausschließlich manuell gespeichert", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(reviewProgress);
    assert.strictEqual(phase.qa.status, "TEILWEISE_BESTANDEN");
    assert.strictEqual(phase.qa.criteriaAnswered, true);
    assert.strictEqual(phase.status, "QA_COMPLETED");
  });
  check("Orchestrator wird erst nach QA bereit", () => {
    assert.strictEqual(DailyWorkRun.getAgentReviewPhase(reviewProgress).workItems.find((item) => item.agentId === "orchestrator-agent").status, "READY");
  });
  check("Jamals Abschlussentscheidung bleibt vor Gesamtbefund gesperrt", () => {
    assert.throws(() => DailyWorkRun.setAgentReviewFinalDecision(reviewProgress, { decision: "FREIGEBEN", nextSafeStep: "Prüfen" }), /Gesamtbefund/);
  });

  reviewProgress = DailyWorkRun.recordOrchestrationSummary(reviewProgress, {
    confirmedFindings: "Projektstand, Fachgrenzen und Qualitätsbefunde liegen manuell bestätigt vor.",
    openPoints: "Medizinische und rechtliche Freigabe bleiben ausgeschlossen.",
    conflicts: "Keine technischen Konflikte bestätigt.",
    risks: "Keine echten Gesundheitsdaten verwenden.",
    recommendedNextStep: "Jamal prüft den Gesamtbefund.",
    notApproved: "Keine Umsetzung, Veröffentlichung oder externe Aktion.",
    jamalDecisionQuestion: "Soll die nächste Health-Arbeitsphase auf Grundlage dieses geprüften Gesamtbefunds vorbereitet werden?",
    now: "2026-07-12T11:20:00Z",
  });
  check("Orchestrator-Zusammenführung bleibt strukturiert und manuell", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(reviewProgress);
    assert.strictEqual(phase.orchestration.status, "CONFIRMED");
    assert.strictEqual(phase.status, "OVERALL_FINDING_PREPARED");
    assert.strictEqual(phase.orchestration.confirmedFindings.length, 1);
  });
  check("Runtime-Pilot bestätigt Lead nicht vorzeitig als Zusammenführung", () => {
    let withPilot = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "orchestrator-agent", {
      resultText: "Lokaler deterministischer Pilot: Auftrag strukturell vollständig.",
      confirmed: true,
      runtimePilotAcceptance: true,
      pilotAgentId: "orchestrator-agent",
      now: "2026-07-23T13:00:00Z",
    });
    let phase = DailyWorkRun.getAgentReviewPhase(withPilot);
    const lead = phase.workItems.find((item) => item.agentId === "orchestrator-agent");
    assert.strictEqual(lead.resultConfirmed, false);
    assert.ok(lead.runtimePilotEvidence?.acceptedAt);
    assert.match(lead.runtimePilotEvidence.resultText, /Lokaler deterministischer Pilot/);
    assert.notStrictEqual(lead.status, "ACCEPTED");
    assert.strictEqual(phase.orchestration.status, "NOT_READY");

    for (const agentId of ["product-agent", "health-compass-agent"]) {
      withPilot = DailyWorkRun.recordAgentWorkResult(withPilot, agentId, {
        resultText: `${agentId}: Fachbefund bestätigt.`,
        confirmed: true,
      });
    }
    const parallelIds = DailyWorkRun.getAgentReviewPhase(withPilot).workItems
      .filter((item) => item.executionMode === "parallel")
      .map((item) => item.agentId);
    for (const agentId of parallelIds) {
      withPilot = DailyWorkRun.recordAgentWorkResult(withPilot, agentId, {
        resultText: `${agentId}: Fachbefund bestätigt.`,
        confirmed: true,
      });
    }
    withPilot = DailyWorkRun.recordQaResult(withPilot, {
      status: "BESTANDEN",
      resultText: "QA manuell bestanden.",
      criteriaAnswered: true,
      now: "2026-07-23T13:30:00Z",
    });
    phase = DailyWorkRun.getAgentReviewPhase(withPilot);
    assert.strictEqual(phase.status, "QA_COMPLETED");
    assert.strictEqual(phase.workItems.find((item) => item.agentId === "orchestrator-agent").status, "READY");
    assert.ok(phase.workItems.find((item) => item.agentId === "orchestrator-agent").runtimePilotEvidence?.acceptedAt);
    withPilot = DailyWorkRun.recordOrchestrationSummary(withPilot, {
      confirmedFindings: "Gesamtbefund nach Pilot-Evidenz und QA.",
      recommendedNextStep: "Jamal prüft den Gesamtbefund.",
      jamalDecisionQuestion: "Soll der nächste Schritt vorbereitet werden?",
      now: "2026-07-23T13:40:00Z",
    });
    phase = DailyWorkRun.getAgentReviewPhase(withPilot);
    assert.strictEqual(phase.orchestration.status, "CONFIRMED");
    assert.strictEqual(phase.workItems.find((item) => item.agentId === "orchestrator-agent").status, "ACCEPTED");
    assert.ok(phase.workItems.find((item) => item.agentId === "orchestrator-agent").runtimePilotEvidence?.acceptedAt);
  });
  check("bestehender Pilot-Deadlock wird sicher geheilt ohne echten Gesamtbefund zu öffnen", () => {
    let deadlock = DailyWorkRun.recordAgentWorkResult(preparedAgentReview, "product-agent", {
      resultText: "Produkt bestätigt.",
      confirmed: true,
    });
    deadlock = DailyWorkRun.recordAgentWorkResult(deadlock, "health-compass-agent", {
      resultText: "Health bestätigt.",
      confirmed: true,
    });
    const parallelIds = DailyWorkRun.getAgentReviewPhase(deadlock).workItems
      .filter((item) => item.executionMode === "parallel")
      .map((item) => item.agentId);
    for (const agentId of parallelIds) {
      deadlock = DailyWorkRun.recordAgentWorkResult(deadlock, agentId, {
        resultText: `${agentId}: bestätigt.`,
        confirmed: true,
      });
    }
    deadlock = DailyWorkRun.recordQaResult(deadlock, {
      status: "BESTANDEN",
      resultText: "QA bestanden.",
      criteriaAnswered: true,
      now: "2026-07-23T14:00:00Z",
    });
    const lead = deadlock.agentReviewPhase.workItems.find((item) => item.agentId === "orchestrator-agent");
    lead.status = "ACCEPTED";
    lead.resultConfirmed = true;
    lead.resultConfirmedAt = "2026-07-23T12:00:00Z";
    lead.resultRecordedAt = "2026-07-23T12:00:00Z";
    lead.resultText = "Lokaler deterministischer Pilot: Deadlock-Evidenz.";
    delete lead.runtimePilotEvidence;
    deadlock.agentReviewPhase.orchestration = {
      status: "NOT_READY",
      confirmedFindings: [],
      openPoints: [],
      conflicts: [],
      risks: [],
      recommendedNextStep: "",
      notApproved: [],
      jamalDecisionQuestion: "",
      confirmedAt: null,
    };
    const healed = DailyWorkRun.getAgentReviewPhase(deadlock);
    const healedLead = healed.workItems.find((item) => item.agentId === "orchestrator-agent");
    assert.strictEqual(healedLead.resultConfirmed, false);
    assert.strictEqual(healedLead.status, "READY");
    assert.match(healedLead.runtimePilotEvidence.resultText, /Deadlock-Evidenz/);
    assert.strictEqual(healed.orchestration.status, "NOT_READY");
    assert.strictEqual(healed.qa.status, "BESTANDEN");
    assert.strictEqual(healed.status, "QA_COMPLETED");

    const completed = DailyWorkRun.recordOrchestrationSummary(deadlock, {
      confirmedFindings: "Echter Gesamtbefund nach Heilung.",
      recommendedNextStep: "Jamal entscheidet den nächsten Schritt.",
      jamalDecisionQuestion: "Soll fortgesetzt werden?",
      now: "2026-07-23T14:10:00Z",
    });
    assert.strictEqual(DailyWorkRun.getAgentReviewPhase(completed).orchestration.status, "CONFIRMED");
    assert.throws(
      () => DailyWorkRun.recordOrchestrationSummary(completed, {
        confirmedFindings: "Zweiter Versuch",
        recommendedNextStep: "Nein",
        jamalDecisionQuestion: "Nein?",
      }),
      /bereits bestätigt/,
    );
  });
  check("Abschluss benötigt genau einen sicheren Textschritt", () => {
    assert.throws(() => DailyWorkRun.setAgentReviewFinalDecision(reviewProgress, { decision: "FREIGEBEN", nextSafeStep: ["a", "b"] }), /Textwert/);
  });

  const completedAgentReview = DailyWorkRun.setAgentReviewFinalDecision(reviewProgress, {
    decision: "WEITERE_PRUEFUNG_NOETIG",
    nextSafeStep: "Jamal klärt die offene fachliche Freigabe ohne externe Aktion.",
    now: "2026-07-12T11:30:00Z",
  });
  check("Jamals Abschlussentscheidung und nächster Schritt bleiben erhalten", () => {
    const phase = DailyWorkRun.getAgentReviewPhase(completedAgentReview);
    assert.strictEqual(phase.status, "JAMAL_COMPLETED");
    assert.strictEqual(phase.finalDecision.decision, "WEITERE_PRUEFUNG_NOETIG");
    assert.ok(phase.finalDecision.nextSafeStep);
  });
  check("Prüfphasen-Verlauf entsteht nur nach bewusster Bestätigung", () => {
    assert.strictEqual(DailyWorkRun.createAgentReviewHistoryEntry(completedAgentReview, false), null);
    assert.ok(DailyWorkRun.createAgentReviewHistoryEntry(completedAgentReview, true));
  });
  check("Prüfphasen-Verlauf kann nur einmal übernommen werden", () => {
    const entry = DailyWorkRun.createAgentReviewHistoryEntry(completedAgentReview, true);
    const once = DailyWorkRun.applyHistoryEntryOnce([], entry);
    const twice = DailyWorkRun.applyHistoryEntryOnce(once, entry);
    assert.strictEqual(twice.length, 1);
    const marked = DailyWorkRun.markAgentReviewHistoryTransferred(completedAgentReview, entry, "2026-07-12T11:40:00Z");
    assert.strictEqual(DailyWorkRun.markAgentReviewHistoryTransferred(marked, entry).agentReviewPhase.historyTransferredAt, "2026-07-12T11:40:00.000Z");
  });
  check("V6.40.3 behält alle Ausführungsverbote", () => {
    assert.strictEqual(completedAgentReview.boundary.agentExecutionBlocked, true);
    assert.strictEqual(completedAgentReview.boundary.codexExecutionBlocked, true);
    assert.strictEqual(completedAgentReview.agentReviewPhase.noAgentExecution, true);
  });

  const preparedDraft = validDraft();
  check("vollständige Pflichtfelder", () => assert.deepStrictEqual(DailyWorkRun.validateReadyForCodex(preparedDraft), []));
  check("nur zulässige Statuswerte", () => assert.deepStrictEqual(DailyWorkRun.STATUS_VALUES, ["DRAFT", "READY_FOR_CODEX", "RESULT_RECORDED", "CLOSED", "OPEN"]));
  check("kein automatischer Statusübergang", () => assert.strictEqual(preparedDraft.status, "DRAFT"));
  check("externe Aktionen blockiert", () => assert.strictEqual(preparedDraft.boundary.externalActionsBlocked, true));
  check("Codex-Ausführung blockiert", () => assert.strictEqual(preparedDraft.boundary.codexExecutionBlocked, true));
  check("Agentenausführung blockiert", () => assert.strictEqual(preparedDraft.boundary.agentExecutionBlocked, true));
  check("automatische Git-Aktion blockiert", () => assert.strictEqual(preparedDraft.boundary.automaticGitBlocked, true));
  check("Deployment blockiert", () => assert.strictEqual(preparedDraft.boundary.deploymentBlocked, true));

  const legacyState = {
    projects: [{ id: "manual-1", notes: ["Notiz"], history: [{ id: "h1" }], decisionNote: { decision: "Offen" } }],
  };
  const legacyJson = JSON.stringify(legacyState);
  const storage = mockStorage({ [DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY]: legacyJson });
  const stored = DailyWorkRun.saveDailyStore(storage, DailyWorkRun.upsertRun(DailyWorkRun.createStore(), preparedDraft));
  check("getrennte localStorage-Struktur", () => assert.notStrictEqual(DailyWorkRun.DAILY_STORAGE_KEY, DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY));
  check("bestehende manuelle Projekte bleiben erhalten", () => assert.strictEqual(storage.snapshot()[DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY], legacyJson));
  check("Notizen, Entscheidungen und Verläufe bleiben erhalten", () => assert.deepStrictEqual(JSON.parse(storage.snapshot()[DailyWorkRun.LEGACY_MANAGEMENT_STORAGE_KEY]), legacyState));
  check("Kanondaten können nicht überschrieben werden", () => assert.strictEqual(getProjectById("health-upgrade-kompass").localHead, "28cdcf7"));
  check("API-Ausfall nutzt keinen localStorage-Technikstand", () => assert.deepStrictEqual(DailyWorkRun.currentCanonicalProject(null, "health-upgrade-kompass"), { available: false, status: "UNGEKLÄRT", project: null }));

  const apiPayload = buildProjectsResponse();
  const currentHealth = DailyWorkRun.currentCanonicalProject(apiPayload, "health-upgrade-kompass");
  check("Health über stabile kanonische ID", () => assert.strictEqual(currentHealth.project.id, "health-upgrade-kompass"));
  check("Health bleibt REAL_VERIFIZIERT", () => assert.strictEqual(currentHealth.project.portfolioMode, "REAL_VERIFIZIERT"));
  check("Health-HEAD bleibt 28cdcf7", () => assert.strictEqual(currentHealth.project.localHead, "28cdcf7"));
  check("Health und Expansion bleiben getrennt", () => assert.notStrictEqual(currentHealth.project.id, getProjectById("expansion-app").id));
  check("Codex-Auftrag ist nur Textvorlage", () => {
    assert.strictEqual(typeof preparedDraft.codexPreparation.preparedPrompt, "string");
    assert.match(preparedDraft.codexPreparation.preparedPrompt, /manuell kopierbare Planungsvorlage/);
  });

  const uiSource = fs.readFileSync(path.join(__dirname, "daily-work-run-ui.js"), "utf8");
  check("technische Details sind standardmäßig geschlossen", () => {
    assert.match(uiSource, /<details class="daily-work-run-technical-details daily-work-run-field--wide">/);
    assert.doesNotMatch(uiSource, /<details class="daily-work-run-technical-details[^>]*\sopen/);
  });
  check("normaler Start zeigt genau ein erforderliches Ergebnisfeld", () => {
    const preparationSource = uiSource.slice(uiSource.indexOf("function renderDailyWorkRunPreparation"), uiSource.indexOf("function renderDailyWorkProposal"));
    assert.strictEqual((preparationSource.match(/<textarea[^>]*required/g) || []).length, 1);
    assert.match(preparationSource, /Arbeitsvorschlag erstellen/);
  });
  check("Ergebnis- und Verbotsfeld sind im neuen Tageslauf editierbar", () => {
    const preparationSource = uiSource
      .slice(uiSource.indexOf("function renderDailyWorkRunPreparation"), uiSource.indexOf("function renderDailyWorkProposal"))
      .replace(/deps\.escapeHtml/g, "escapeHtml");
    const renderPreparation = new Function(
      "escapeHtml",
      "dailyWorkRunList",
      "renderDailyWorkProposal",
      `${preparationSource}; return renderDailyWorkRunPreparation;`,
    )(
      (value) => String(value ?? ""),
      () => "",
      () => "",
    );
    const html = renderPreparation(focused);
    const desiredOutcomeField = html.match(/<textarea name="desiredOutcome"[^>]*>/)?.[0] || "";
    const prohibitedTodayField = html.match(/<textarea name="prohibitedToday"[^>]*>/)?.[0] || "";
    assert.ok(desiredOutcomeField);
    assert.ok(prohibitedTodayField);
    assert.doesNotMatch(desiredOutcomeField, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(desiredOutcomeField, /\sreadonly(?:\s|>)/);
    assert.doesNotMatch(prohibitedTodayField, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(prohibitedTodayField, /\sreadonly(?:\s|>)/);
  });
  check("eingegebener Health-Ergebnistext wird unverändert übernommen", () => {
    const desiredOutcome = "Ich möchte wissen, welche Agenten jetzt beim Health Upgrade Kompass eingesetzt werden müssen und was jeder davon prüfen soll.";
    const proposed = DailyWorkRun.createWorkProposal(focused, { desiredOutcome });
    assert.strictEqual(proposed.dailyOutcome.desiredOutcome, desiredOutcome);
    assert.strictEqual(proposed.workProposal.understoodGoal, desiredOutcome);
    assert.strictEqual(proposed.workProposal.taskType, "Agenten- und Einsatzplanung");
    assert.strictEqual(proposed.workProposal.repositoryWorkRequired, false);
    assert.strictEqual(proposed.boundary.codexExecutionBlocked, true);
  });
  check("gesperrter gespeicherter Lauf bietet einen verlustfreien Neustart", () => {
    assert.match(uiSource, /\["READY_FOR_CODEX", "RESULT_RECORDED"\]\.includes\(run\.status\)/);
    assert.match(uiSource, /Der vorhandene Lauf bleibt vollständig erhalten/);
    const readyRun = DailyWorkRun.transitionRun(preparedDraft, "READY_FOR_CODEX");
    let restartStore = DailyWorkRun.upsertRun(DailyWorkRun.createStore(), readyRun);
    restartStore = DailyWorkRun.upsertRun(restartStore, DailyWorkRun.createDraftRun({ id: "run-neustart", workDate: "2026-07-12" }));
    assert.strictEqual(restartStore.runs.length, 2);
    assert.strictEqual(DailyWorkRun.getActiveRun(restartStore).status, "DRAFT");
    assert.ok(restartStore.runs.some((run) => run.id === readyRun.id && run.status === "READY_FOR_CODEX"));
  });

  let ready = DailyWorkRun.transitionRun(preparedDraft, "READY_FOR_CODEX");
  ready = DailyWorkRun.setResultReturn(ready, {
    summary: "Prüfauftrag wurde manuell bearbeitet.",
    changedFiles: ["README.md"],
    tests: ["npm test: erfolgreich"],
    gitBranch: "main",
    commitStatus: "kein Commit",
    pushStatus: "kein Push",
    risks: ["Fachliche Prüfung offen"],
    openPoints: ["Jamal entscheidet über nächsten Schritt"],
  });
  const resultRecorded = DailyWorkRun.transitionRun(ready, "RESULT_RECORDED");
  check("Abschluss benötigt Jamals Entscheidung", () => assert.throws(() => DailyWorkRun.setClosure(resultRecorded, { status: "CLOSED", nextSafeStep: "Prüfen" }), /jamalDecision/));
  check("Abschluss benötigt genau einen nächsten Schritt", () => assert.throws(() => DailyWorkRun.setClosure(resultRecorded, { status: "CLOSED", jamalDecision: "Abnehmen", nextSafeStep: ["a", "b"] }), /Textwert/));
  check("Verlauf erst nach manueller Bestätigung", () => assert.strictEqual(DailyWorkRun.createHistoryEntry(resultRecorded, false), null));

  const closureDraft = DailyWorkRun.setClosure(resultRecorded, {
    status: "CLOSED",
    jamalDecision: "Technischen Tageslauf abschließen.",
    nextSafeStep: "Ergebnis morgen manuell prüfen.",
    closedAt: "2026-07-11T18:00:00Z",
  });
  const closed = DailyWorkRun.transitionRun(closureDraft, "CLOSED");
  const historyEntry = DailyWorkRun.createHistoryEntry(closed, true);
  const once = DailyWorkRun.applyHistoryEntryOnce([], historyEntry);
  const twice = DailyWorkRun.applyHistoryEntryOnce(once, historyEntry);
  check("doppelter Verlaufseintrag wird verhindert", () => {
    assert.strictEqual(twice.length, 1);
    assert.doesNotMatch(twice[0].description, /\.\./);
  });
  check("bestehende Registertests bleiben eingebunden", () => assert.ok(fs.readFileSync(path.join(__dirname, "package.json"), "utf8").includes("project-registry.test.js")));

  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const routeCount = (serverSource.match(/^\s+\["\/api\//gm) || []).length;
  check("42 GET-Routen bleiben erhalten", () => assert.strictEqual(routeCount, 42));
  check("unbekannte Projekt-ID bleibt 404", () => assert.strictEqual(invoke("GET", "/api/projects/unbekannt").statusCode, 404));
  check("POST bleibt 405", () => assert.strictEqual(invoke("POST", "/api/projects").statusCode, 405));
  check("writeOperationsBlocked bleibt true", () => assert.strictEqual(API_SECURITY_FLAGS.writeOperationsBlocked, true));
  check("madeExternalRequest bleibt false", () => assert.strictEqual(API_SECURITY_FLAGS.madeExternalRequest, false));

  assert.strictEqual(passed, 130);
  assert.strictEqual(DailyWorkRun.getActiveRun(stored).id, preparedDraft.id);
  assert.strictEqual(PROJECT_REGISTRY.length, 17);
  console.log("daily-work-run.test.js: 130 Prüfpunkte erfolgreich");
}

runTests();
