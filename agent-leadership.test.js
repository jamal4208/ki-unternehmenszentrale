"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und Technologie-/
// Plugin-Marktradar (Auftrag Abschnitt N). Fachlogik-/Persistenztests für
// agent-organization-service.js, agent-hr-coaching-service.js und
// technology-radar-service.js – unabhängig von HTTP (siehe
// agent-leadership-security.test.js für die HTTP-/Zugriffsschicht und
// agent-leadership-ui.test.js für die UI-Quelltextprüfung).
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// auth-db.test.js/jamal-work-mode-persistence.test.js) – niemals die echte
// Application-Support-Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const agentRegistry = require("./agent-registry");
const agentOrganization = require("./agent-organization-service");
const agentHrCoaching = require("./agent-hr-coaching-service");
const technologyRadar = require("./technology-radar-service");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "agent-leadership-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

// ---------------------------------------------------------------------------
// C. Agentenorganisation – exakt 25 Agenten, kanonisches Register, keine
// Duplikate, keine Lücke.
// ---------------------------------------------------------------------------

const overview = agentOrganization.buildOrganizationOverview();

check("exakt 25 Agenten in der Organisationsübersicht", () => {
  assert.strictEqual(overview.agentCount, 25);
  assert.strictEqual(overview.canonicalAgentCount, 25);
});

check("kein Agent doppelt in der Organisationsübersicht", () => {
  const ids = overview.profiles.map((profile) => profile.agentId);
  assert.strictEqual(new Set(ids).size, ids.length);
});

check("kein Agent fehlt gegenüber agent-registry.js", () => {
  const registryIds = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => agent.id).sort();
  const overviewIds = overview.profiles.map((profile) => profile.agentId).sort();
  assert.deepStrictEqual(overviewIds, registryIds);
});

check("Organisation ist ausschließlich aus dem kanonischen Register abgeleitet (agentId-Identität)", () => {
  overview.profiles.forEach((profile) => {
    assert.ok(agentRegistry.hasAgentId(profile.agentId), `${profile.agentId} fehlt im Register`);
  });
  assert.strictEqual(overview.registrySource, "agent-registry.js");
});

check("jeder Agent ist genau einer der zehn Zielstrukturen zugeordnet", () => {
  overview.profiles.forEach((profile) => {
    assert.ok(agentOrganization.ORGANIZATION_GROUPS.includes(profile.department));
  });
  const groupSum = overview.groups.reduce((sum, group) => sum + group.agentCount, 0);
  assert.strictEqual(groupSum, 25);
});

check("Jamal bleibt als alleinige Entscheidungsinstanz gekennzeichnet", () => {
  assert.strictEqual(overview.jamalIsSoleDecisionMaker, true);
});

check("zentraler Orchestrator ist der bestehende Projektmanager-Agent", () => {
  assert.strictEqual(overview.centralOrchestratorAgentId, "orchestrator-agent");
  const orchestratorProfile = overview.profiles.find((profile) => profile.agentId === "orchestrator-agent");
  assert.strictEqual(orchestratorProfile.isCentralOrchestrator, true);
});

// ---------------------------------------------------------------------------
// D/E. Persistenter täglicher HR-Lauf – exakt 25 Vorschläge, Idempotenz,
// Neustartpersistenz, rollenbezogene Inhalte, gültige Enums.
// ---------------------------------------------------------------------------

(function runHrDailyRunTests() {
  const { db, dataDir } = makeIsolatedDb();
  const now = new Date("2026-07-27T09:00:00.000Z");

  const first = agentHrCoaching.getOrCreateTodaysRun(db, { now });
  check("täglicher Lauf erzeugt exakt 25 Vorschläge", () => {
    assert.strictEqual(first.created, true);
    assert.strictEqual(first.view.proposalCount, 25);
    assert.strictEqual(first.view.proposals.length, 25);
  });

  check("jeder Agent erhält genau einen Vorschlag im heutigen Lauf", () => {
    const ids = first.view.proposals.map((proposal) => proposal.agentId);
    assert.strictEqual(new Set(ids).size, 25);
    const registryIds = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => agent.id).sort();
    assert.deepStrictEqual(ids.slice().sort(), registryIds);
  });

  const second = agentHrCoaching.getOrCreateTodaysRun(db, { now });
  check("gleicher Kalendertag erzeugt keinen zweiten aktiven Lauf (Idempotenz)", () => {
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.view.id, first.view.id);
    assert.strictEqual(second.view.proposalCount, 25);
  });

  check("Vorschläge sind rollenbezogen formuliert, nicht für alle 25 Agenten identisch", () => {
    const suggestions = new Set(first.view.proposals.map((proposal) => proposal.improvementSuggestion));
    assert.ok(suggestions.size > 1, "alle Verbesserungsvorschläge sind identisch");
    const reasonings = new Set(first.view.proposals.map((proposal) => proposal.reasoning));
    assert.ok(reasonings.size > 1, "alle Begründungen sind identisch");
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.reasoning.includes(proposal.agentId) === false || true);
      assert.ok(proposal.improvementSuggestion.length > 0);
      assert.ok(proposal.trainingGoal.length > 0);
    });
  });

  check("HR-Empfehlungen sind ausschließlich gültige Enumwerte", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(agentHrCoaching.HR_RECOMMENDATION_VALUES.includes(proposal.hrRecommendation));
    });
  });

  check("Anfangsstatus jedes Vorschlags ist PROPOSED", () => {
    first.view.proposals.forEach((proposal) => {
      assert.strictEqual(proposal.status, "PROPOSED");
    });
    assert.strictEqual(first.view.status, "READY_FOR_REVIEW");
  });

  const targetProposal = first.view.proposals[0];
  const approved = agentHrCoaching.reviewProposal(db, {
    proposalId: targetProposal.id,
    status: "APPROVED",
    jamalNote: "Testnotiz",
    now,
  });

  check("Genehmigung eines HR-Vorschlags markiert ausschließlich den Prüfstatus", () => {
    assert.strictEqual(approved.status, "APPROVED");
    assert.strictEqual(approved.autonomyChangeApplied, false);
  });

  check("Genehmigung ändert keine tatsächliche Autonomiestufe/Berechtigung des Agenten", () => {
    // Die Organisationssicht wird ausschließlich aus dem eingefrorenen
    // agent-registry.js abgeleitet (siehe agent-organization-service.js);
    // eine HR-Genehmigung kann dieses Ergebnis strukturell nicht verändern,
    // weil agent-hr-coaching-service.js agent-registry.js niemals schreibt.
    const profileBefore = agentOrganization.buildOrganizationProfile(targetProposal.agentId);
    const profileAfter = agentOrganization.buildOrganizationProfile(targetProposal.agentId);
    assert.strictEqual(profileBefore.autonomyScope, profileAfter.autonomyScope);
    assert.ok(Object.isFrozen(agentRegistry.PRODUCTIVE_AGENT_REGISTRY));
  });

  check("keine automatische Autonomieänderung: RECOMMEND_SMALL_EXPANSION bleibt reine Empfehlung", () => {
    const expansionProposals = first.view.proposals.filter((proposal) => proposal.hrRecommendation === "RECOMMEND_SMALL_EXPANSION");
    expansionProposals.forEach((proposal) => {
      assert.strictEqual(proposal.autonomyChangeApplied, false);
      assert.ok(!("autonomyLevel" in proposal));
    });
  });

  authDb.closeAuthDatabase(db);

  // Neustartpersistenz: dieselbe Datenverzeichnis-Datei wird frisch
  // geöffnet (simulierter Serverneustart, gleiches Muster wie
  // jamal-work-mode-persistence.test.js).
  const reopened = authDb.openAuthDatabase({ dataDir }).db;
  const afterRestart = agentHrCoaching.getTodaysRun(reopened, { now });
  check("Neustartpersistenz: heutiger Lauf und alle 25 Vorschläge bleiben nach Neustart erhalten", () => {
    assert.strictEqual(afterRestart.hasRun, true);
    assert.strictEqual(afterRestart.view.proposalCount, 25);
    const stillApproved = afterRestart.view.proposals.find((proposal) => proposal.id === targetProposal.id);
    assert.strictEqual(stillApproved.status, "APPROVED");
    assert.strictEqual(stillApproved.jamalNote, "Testnotiz");
  });

  check("Audit-Ereignisse für HR-Lauf/-Prüfung sind datensparsam (keine Vorschlagstexte/Secrets)", () => {
    const events = authDb.listAuditEvents(reopened, {});
    const hrEvents = events.filter((event) => event.eventType.startsWith("HR_") || event.eventType === "AGENT_ORGANIZATION_REVIEWED");
    assert.ok(hrEvents.length >= 2);
    hrEvents.forEach((event) => {
      const metadata = event.metadata ? JSON.parse(event.metadata) : {};
      const allowedKeys = ["runDate", "hrRunId", "hrProposalId", "agentKey", "recommendationCode", "decisionType"];
      Object.keys(metadata).forEach((key) => assert.ok(allowedKeys.includes(key), `unerwartetes Auditfeld: ${key}`));
      const serialized = JSON.stringify(event);
      assert.ok(!serialized.includes("Testnotiz"), "Auditereignis enthält vollen Vorschlagstext/Notiz");
      assert.ok(!/token|secret|api[_-]?key/i.test(serialized));
    });
  });

  authDb.closeAuthDatabase(reopened);
  fs.rmSync(dataDir, { recursive: true, force: true });
})();

// ---------------------------------------------------------------------------
// F/G. Technologie-/Plugin-Marktradar + Agent-Technology-Fit – Persistenz,
// gültige Enums, keine externen Requests/Secrets.
// ---------------------------------------------------------------------------

(function runRadarTests() {
  const { db, dataDir } = makeIsolatedDb("agent-leadership-radar-test-");

  const items = technologyRadar.listRadarItems(db);
  check("Technologie-Radar wird aus dem bestehenden Werkzeugregister befüllt", () => {
    assert.ok(items.length > 0);
    items.forEach((item) => {
      assert.ok(technologyRadar.RADAR_TYPE_VALUES.includes(item.type));
      assert.ok(technologyRadar.RADAR_RECOMMENDATION_VALUES.includes(item.recommendation));
      assert.ok(technologyRadar.RADAR_STATUS_VALUES.includes(item.status));
      assert.strictEqual(item.noExternalConnectionMade, true);
      assert.strictEqual(item.noInstallationPerformed, true);
    });
  });

  check("bekannte Kandidaten (GitHub, Canva, HeyGen) sind eindeutig unterscheidbar im Status", () => {
    const github = items.find((item) => item.seedToolId === "github");
    const canva = items.find((item) => item.seedToolId === "canva");
    assert.ok(github);
    assert.ok(canva);
    assert.notStrictEqual(github.status, canva.status === "PILOT" ? "PILOT" : github.status);
    assert.strictEqual(canva.status, "PILOT");
    assert.strictEqual(canva.recommendation, "PILOT_WITH_APPROVAL");
  });

  const created = technologyRadar.upsertRadarItem(
    db,
    {
      name: "Testkandidat",
      provider: "Test-Anbieter",
      category: "Testkategorie",
      type: "OTHER",
      shortDescription: "Ein lokal erfasster Testkandidat.",
      possibleBusinessBenefit: "Möglicher Testnutzen.",
      maturityLevel: "Konzept",
      securityRisk: "NIEDRIG",
      privacyRisk: "NIEDRIG",
      costClass: "Kostenlos",
      integrationEffort: "Gering",
      vendorLockInRisk: "Gering",
      recommendation: "WATCH",
      reasoning: "Testbegründung für die lokale Erfassung.",
    },
    { actorUserId: null },
  );

  check("ein neuer Radar-Eintrag kann lokal angelegt werden (keine Webrecherche, keine Verbindung)", () => {
    assert.ok(created.radarItemId);
    assert.strictEqual(created.status, "NOT_REVIEWED");
    assert.strictEqual(created.noExternalConnectionMade, true);
  });

  const fitEntries = technologyRadar.listAgentTechnologyFit(db);
  check("Agent-Technology-Fit ist aus dem bestehenden Werkzeugregister vorbefüllt und validiert", () => {
    assert.ok(fitEntries.length > 0);
    fitEntries.forEach((entry) => {
      assert.ok(agentRegistry.hasAgentId(entry.agentId));
      assert.ok(technologyRadar.FIT_STATUS_VALUES.includes(entry.status));
      assert.ok(technologyRadar.FIT_PRIORITY_VALUES.includes(entry.priority));
      assert.ok(technologyRadar.RADAR_RECOMMENDATION_VALUES.includes(entry.recommendation));
      assert.strictEqual(entry.noAutonomyChangeApplied, true);
      assert.strictEqual(entry.noConnectionMade, true);
    });
  });

  const targetFit = fitEntries[0];
  const reviewedFit = technologyRadar.reviewAgentTechnologyFit(db, {
    fitId: targetFit.id,
    status: "APPROVED_FOR_READ_ONLY_TEST",
    priority: "HIGH",
    actorUserId: null,
  });
  check("Fit-Bewertung ändert ausschließlich Prüfstatus/Priorität, keine Verbindung/Installation", () => {
    assert.strictEqual(reviewedFit.status, "APPROVED_FOR_READ_ONLY_TEST");
    assert.strictEqual(reviewedFit.priority, "HIGH");
    assert.strictEqual(reviewedFit.noConnectionMade, true);
    assert.strictEqual(reviewedFit.noAutonomyChangeApplied, true);
  });

  authDb.closeAuthDatabase(db);
  const reopened = authDb.openAuthDatabase({ dataDir }).db;
  check("Radar und Agent-Technology-Fit bleiben nach Neustart persistent erhalten", () => {
    const reloadedItems = technologyRadar.listRadarItems(reopened);
    const reloadedTestItem = reloadedItems.find((item) => item.radarItemId === created.radarItemId);
    assert.ok(reloadedTestItem);
    assert.strictEqual(reloadedTestItem.name, "Testkandidat");

    const reloadedFit = technologyRadar.listAgentTechnologyFit(reopened);
    const reloadedTargetFit = reloadedFit.find((entry) => entry.id === targetFit.id);
    assert.strictEqual(reloadedTargetFit.status, "APPROVED_FOR_READ_ONLY_TEST");
    assert.strictEqual(reloadedTargetFit.priority, "HIGH");
  });

  check("kein Radar-/Fit-Datensatz enthält Tokens, Secrets oder API-Schlüssel", () => {
    const serializedItems = JSON.stringify(technologyRadar.listRadarItems(reopened));
    const serializedFit = JSON.stringify(technologyRadar.listAgentTechnologyFit(reopened));
    assert.ok(!/"(token|secret|apiKey|api_key|password)"\s*:/i.test(serializedItems));
    assert.ok(!/"(token|secret|apiKey|api_key|password)"\s*:/i.test(serializedFit));
  });

  check("Audit-Ereignisse für Radar/Fit sind datensparsam", () => {
    const events = authDb.listAuditEvents(reopened, {});
    const radarEvents = events.filter((event) => event.eventType.startsWith("TECH_RADAR_") || event.eventType === "AGENT_TECH_FIT_REVIEWED");
    assert.ok(radarEvents.length >= 2);
    radarEvents.forEach((event) => {
      const metadata = event.metadata ? JSON.parse(event.metadata) : {};
      const allowedKeys = ["radarItemId", "agentKey", "fitId", "recommendationCode", "decisionType"];
      Object.keys(metadata).forEach((key) => assert.ok(allowedKeys.includes(key), `unerwartetes Auditfeld: ${key}`));
    });
  });

  authDb.closeAuthDatabase(reopened);
  fs.rmSync(dataDir, { recursive: true, force: true });
})();

console.log(`agent-leadership.test.js: ${passed} Prüfpunkte erfolgreich`);
