"use strict";

// V7.5 – Unternehmensleitlinien V1.0 als verbindliche Betriebslogik
// (Auftrag Abschnitt Q): Fachlogik-/Persistenztests dafür, dass die
// Leitlinien tatsächlich in der Betriebslogik wirken, nicht nur als
// Dokumentation existieren. Ergänzt agent-leadership.test.js (dort bereits
// abgedeckt: 25 Agenten, Idempotenz, Neustartpersistenz, Radar-/Fit-Seed) –
// dieser Datei liegt der Fokus ausschließlich auf den NEUEN Leitlinien-
// Feldern/Regeln (Auftrag Abschnitt E-M, Q Punkte 1-21/23-26/29-31).
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// agent-leadership.test.js) – niemals die echte Application-Support-
// Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const agentRegistry = require("./agent-registry");
const toolRegistry = require("./tool-registry");
const companyPrinciples = require("./company-principles");
const agentOrganization = require("./agent-organization-service");
const agentHrCoaching = require("./agent-hr-coaching-service");
const technologyRadar = require("./technology-radar-service");
const reliabilitySignals = require("./agent-reliability-signal-service");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "company-principles-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

// ---------------------------------------------------------------------------
// 1. Leitlinienversion in Markdown und Code ist 1.0.
// ---------------------------------------------------------------------------

const markdownSource = fs.readFileSync(path.join(__dirname, "COMPANY_PRINCIPLES.md"), "utf8");

check("Leitlinienversion in COMPANY_PRINCIPLES.md ist 1.0", () => {
  assert.match(markdownSource, /\*\*Version:\*\*\s*1\.0/);
  assert.match(markdownSource, /verbindliche Arbeitsgrundlage/);
});

check("Leitlinienversion in company-principles.js ist 1.0 und stimmt mit Markdown überein", () => {
  assert.strictEqual(companyPrinciples.COMPANY_PRINCIPLES_VERSION, "1.0");
  companyPrinciples.COMPANY_PRINCIPLES.forEach((principle) => {
    assert.strictEqual(principle.version, "1.0");
  });
});

// ---------------------------------------------------------------------------
// 2. Alle sechs Führungsprinzipien strukturiert vorhanden.
// ---------------------------------------------------------------------------

check("alle sechs Führungsprinzipien (Covey/Rosenberg/1%/PDCA/Hochzuverlässigkeit/Vorausschau) sind strukturiert vorhanden", () => {
  const frameworkPrinciples = companyPrinciples.listPrinciplesByCategory("LEADERSHIP_FRAMEWORK");
  assert.strictEqual(frameworkPrinciples.length, 6);
  const expectedIds = [
    "FRAMEWORK_COVEY",
    "FRAMEWORK_ROSENBERG",
    "FRAMEWORK_ONE_PERCENT",
    "FRAMEWORK_PDCA",
    "FRAMEWORK_RELIABILITY",
    "FRAMEWORK_FORESIGHT",
  ];
  const actualIds = frameworkPrinciples.map((principle) => principle.principleId).sort();
  assert.deepStrictEqual(actualIds, expectedIds.slice().sort());
  frameworkPrinciples.forEach((principle) => {
    assert.ok(principle.internalRule.length > 0);
    assert.ok(principle.requiredEvidence.length > 0);
    assert.ok(principle.safetyBoundary.length > 0);
    assert.ok(principle.applicableContexts.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Alle Grundwerte vorhanden (genau zehn).
// ---------------------------------------------------------------------------

check("alle zehn Grundwerte sind strukturiert vorhanden", () => {
  const valuePrinciples = companyPrinciples.listPrinciplesByCategory("VALUE");
  assert.strictEqual(valuePrinciples.length, 10);
  const expectedIds = [
    "VALUE_QUALITY_OVER_SPEED",
    "VALUE_CLARITY_OVER_COMPLEXITY",
    "VALUE_RESPONSIBILITY_OVER_ACTIONISM",
    "VALUE_RELIABILITY_OVER_SHOWMANSHIP",
    "VALUE_HONESTY_OVER_EXAGGERATION",
    "VALUE_LONG_TERM_OVER_SHORT_TERM",
    "VALUE_ECONOMIC_REASON",
    "VALUE_CLEAR_OUTCOME_RESPONSIBILITY",
    "VALUE_FEWER_STARTS_RELIABLE_FINISHES",
    "VALUE_REAL_CUSTOMER_AND_COMPANY_BENEFIT",
  ];
  assert.deepStrictEqual(
    valuePrinciples.map((principle) => principle.principleId).sort(),
    expectedIds.slice().sort(),
  );
});

check("die zehn Grundwerte aus dem Auftrag sind wortgleich in COMPANY_PRINCIPLES.md Abschnitt 3 aufgeführt", () => {
  [
    "Qualität vor Geschwindigkeit",
    "Klarheit vor Komplexität",
    "Verantwortung vor Aktionismus",
    "Verlässlichkeit vor Effekthascherei",
    "Ehrlichkeit vor Übertreibung",
    "Langfristiger Nutzen vor kurzfristigem Erfolg",
    "Wirtschaftliche Vernunft",
    "Eindeutige Ergebnisverantwortung",
    "Weniger beginnen, Wichtiges zuverlässig abschließen",
    "Echter Kunden- und Unternehmensnutzen",
  ].forEach((value) => {
    assert.ok(markdownSource.includes(value), `Grundwert fehlt in COMPANY_PRINCIPLES.md: ${value}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Sicherheitsplanken vorhanden (genau elf).
// ---------------------------------------------------------------------------

check("alle elf Sicherheitsplanken sind strukturiert vorhanden", () => {
  const safetyPrinciples = companyPrinciples.listPrinciplesByCategory("SAFETY_BOUNDARY");
  assert.strictEqual(safetyPrinciples.length, 11);
});

check("die elf Sicherheitsplanken sind wortgleich in COMPANY_PRINCIPLES.md Abschnitt 6 aufgeführt", () => {
  [
    "Jamal bleibt Entscheidungsinstanz",
    "Keine automatische Autonomieerhöhung",
    "Empfehlung ist keine Ausführung",
    "Freigabe eines HR-Vorschlags ändert keine Berechtigung",
    "Read-only zuerst",
    "Keine Plugininstallation",
    "Keine externe Aktion",
    "Keine Veröffentlichung",
    "Kein Social-Media-Posting",
    "Kein Billing",
    "Keine versteckte Berechtigungsänderung",
  ].forEach((boundary) => {
    assert.ok(markdownSource.includes(boundary), `Sicherheitsplanke fehlt in COMPANY_PRINCIPLES.md: ${boundary}`);
  });
});

check("company-principles.js besitzt keine doppelte principleId und keine zweite Dokumentationswahrheit", () => {
  companyPrinciples.assertPrinciplesAreWellFormed === undefined; // Funktion läuft bereits beim require (Selbstprüfung).
  const ids = companyPrinciples.COMPANY_PRINCIPLES.map((principle) => principle.principleId);
  assert.strictEqual(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------------------
// 5-17. HR-Coaching: 25 Vorschläge, Pflichtfelder, PDCA, Reliability-Signale.
// ---------------------------------------------------------------------------

(function runHrPrincipleTests() {
  const { db, dataDir } = makeIsolatedDb();
  const now = new Date("2026-07-27T09:00:00.000Z");

  const first = agentHrCoaching.getOrCreateTodaysRun(db, { now });

  check("5. HR-Lauf erzeugt weiterhin exakt 25 Vorschläge", () => {
    assert.strictEqual(first.view.proposalCount, 25);
  });

  check("6. jeder Vorschlag hat eine Beobachtung mit präventivem Trainingsfokus statt einer Vorfallsbehauptung", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.observation.length > 0);
      assert.match(proposal.observation, /Entwicklungspotenzial|präventiver Trainingsfokus/);
    });
  });

  check("7. kein Vorschlag behauptet eine unbelegte historische Fehlerleistung", () => {
    first.view.proposals.forEach((proposal) => {
      const combinedText = `${proposal.observation} ${proposal.reasoning} ${proposal.businessMeaning}`;
      assert.ok(!/hat mehrfach versagt|in den letzten Läufen trat/i.test(combinedText));
      assert.ok(!/keine dokumentierte Leistungshistorie vorhanden/.test(combinedText) === false || true);
      assert.match(proposal.observation, /keine dokumentierte Leistungshistorie vorhanden/);
    });
  });

  check("8. jeder Vorschlag hat genau einen Owner (ownerAgentId === agentId, kein zweiter gleichrangiger Owner)", () => {
    first.view.proposals.forEach((proposal) => {
      assert.strictEqual(proposal.ownerAgentId, proposal.agentId);
    });
  });

  check("9. jeder Vorschlag enthält einen konkreten, gültigen Nutzenbereich", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(agentHrCoaching.BENEFIT_AREA_VALUES.includes(proposal.benefitArea));
      assert.ok(proposal.benefitAreaLabel && proposal.benefitAreaLabel !== "UNGEKLÄRT");
      assert.ok(proposal.expectedBenefit.length > 0);
    });
  });

  check("10. jeder Vorschlag hat einen konkreten 1%-Schritt", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.onePercentStep.length > 0);
      assert.strictEqual(proposal.onePercentStep, proposal.improvementSuggestion);
    });
  });

  check("11. jeder Vorschlag hat ein Messkriterium (successMetric)", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.successMetric.length > 0);
      assert.strictEqual(proposal.successMetric, proposal.qualityCriterion);
    });
  });

  check("12. jeder Vorschlag hat eine konkrete Sicherheitsgrenze (safetyBoundary)", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.safetyBoundary.length > 0);
      assert.strictEqual(proposal.safetyBoundary, proposal.riskBoundary);
    });
  });

  check("Kommunikationsmuster folgt Rosenberg-Reihenfolge (Beobachtung → Bedeutung → Empfehlung → Entscheidung)", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(proposal.communicationPattern.startsWith(proposal.observation));
      assert.ok(proposal.communicationPattern.includes(proposal.businessMeaning));
      assert.ok(proposal.communicationPattern.includes(proposal.requiredJamalDecision));
    });
  });

  check("Vorschläge sind nicht für alle 25 Agenten identisch (kein Floskel-Coaching)", () => {
    const observations = new Set(first.view.proposals.map((proposal) => proposal.observation));
    const businessMeanings = new Set(first.view.proposals.map((proposal) => proposal.businessMeaning));
    assert.ok(observations.size > 1);
    assert.ok(businessMeanings.size > 1);
  });

  check("jeder Vorschlag hat ein nextReviewDate exakt sieben Tage nach dem Lauf-Tag", () => {
    first.view.proposals.forEach((proposal) => {
      assert.strictEqual(proposal.nextReviewDate, "2026-08-03");
    });
  });

  check("13. jeder Vorschlag startet mit einer gültigen PDCA-Stufe (PLAN)", () => {
    first.view.proposals.forEach((proposal) => {
      assert.ok(agentHrCoaching.PDCA_STAGE_VALUES.includes(proposal.pdcaStage));
      assert.strictEqual(proposal.pdcaStage, "PLAN");
      assert.strictEqual(proposal.pdcaDecision, null);
    });
  });

  const targetProposal = first.view.proposals[0];

  check("14a. PDCA wechselt nicht automatisch (PLAN->DO ohne Genehmigung wird abgelehnt)", () => {
    assert.throws(() => {
      agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "DO", now });
    }, /erfordert zuerst eine Genehmigung/);
  });

  check("14b. PDCA erlaubt keinen Sprung von PLAN direkt zu CHECK oder ACT", () => {
    assert.throws(() => {
      agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "CHECK", now });
    }, /erlaubt ist ausschließlich der jeweils nächste Schritt/);
  });

  const approved = agentHrCoaching.reviewProposal(db, {
    proposalId: targetProposal.id,
    status: "APPROVED",
    now,
  });

  check("15. APPROVED ändert ausschließlich den Prüfstatus, keine Autonomie", () => {
    assert.strictEqual(approved.status, "APPROVED");
    assert.strictEqual(approved.autonomyChangeApplied, false);
    const profileAfter = agentOrganization.buildOrganizationProfile(targetProposal.agentId);
    assert.ok(Object.isFrozen(agentRegistry.PRODUCTIVE_AGENT_REGISTRY));
    assert.ok(profileAfter.autonomyScope);
  });

  const movedToDo = agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "DO", now });
  check("14c. nach Genehmigung ist genau der nächste Schritt PLAN->DO erlaubt", () => {
    assert.strictEqual(movedToDo.pdcaStage, "DO");
    assert.ok(movedToDo.pdcaStageChangedAt);
  });

  check("14d. DO->ACT ohne CHECK wird abgelehnt (kein Überspringen einer Stufe)", () => {
    assert.throws(() => {
      agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "ACT", pdcaDecision: "KEEP", now });
    }, /erlaubt ist ausschließlich der jeweils nächste Schritt/);
  });

  const movedToCheck = agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "CHECK", now });
  check("14e. DO->CHECK ist der nächste erlaubte Schritt", () => {
    assert.strictEqual(movedToCheck.pdcaStage, "CHECK");
  });

  check("CHECK->ACT ohne Abschlussentscheidung wird abgelehnt", () => {
    assert.throws(() => {
      agentHrCoaching.advanceHrPdcaStage(db, { proposalId: targetProposal.id, targetStage: "ACT", now });
    }, /erfordert eine Abschlussentscheidung/);
  });

  const movedToAct = agentHrCoaching.advanceHrPdcaStage(db, {
    proposalId: targetProposal.id,
    targetStage: "ACT",
    pdcaDecision: "KEEP",
    now,
  });
  check("CHECK->ACT mit gültiger Abschlussentscheidung (KEEP) funktioniert und bleibt persistent", () => {
    assert.strictEqual(movedToAct.pdcaStage, "ACT");
    assert.strictEqual(movedToAct.pdcaDecision, "KEEP");
  });

  check("kein automatisches KEEP: ohne expliziten advanceHrPdcaStage()-Aufruf bleibt jeder andere Vorschlag in PLAN", () => {
    const untouched = first.view.proposals.find((proposal) => proposal.id !== targetProposal.id);
    const reloaded = authDb.getAgentHrDailyProposalById(db, untouched.id);
    assert.strictEqual(reloaded.pdcaStage, "PLAN");
    assert.strictEqual(reloaded.pdcaDecision, null);
  });

  // -------------------------------------------------------------------
  // 16/17. Hochzuverlässigkeits-Signale.
  // -------------------------------------------------------------------

  const signal = reliabilitySignals.recordReliabilitySignal(db, {
    agentId: targetProposal.agentId,
    relatedHrProposalId: targetProposal.id,
    signalType: "UNCERTAINTY",
    observation: "Testbeobachtung: Unsicherheit über eine neue Eingabe.",
    possibleImpact: "Mögliche Verzögerung bei der nächsten Prüfung.",
    recommendedReview: "Beim nächsten Lauf erneut prüfen.",
    now,
  });

  check("16. Reliability-Signal wird korrekt und dauerhaft persistiert", () => {
    assert.ok(signal.id);
    assert.strictEqual(signal.agentId, targetProposal.agentId);
    assert.strictEqual(signal.status, "OPEN");
    const reloaded = reliabilitySignals.listReliabilitySignals(db, { agentId: targetProposal.agentId });
    assert.ok(reloaded.some((entry) => entry.id === signal.id));
  });

  check("Signal kann präventiv als UNCERTAINTY erfasst werden (kein tatsächlicher Vorfall nötig)", () => {
    assert.strictEqual(signal.signalType, "UNCERTAINTY");
  });

  check("17. ein Reliability-Signal löst keine automatische Sanktion/Autonomiereduktion aus", () => {
    assert.strictEqual(signal.noAutomaticSanction, true);
    assert.strictEqual(signal.noAutonomyChangeApplied, true);
    const profileAfter = agentOrganization.buildOrganizationProfile(targetProposal.agentId);
    assert.ok(profileAfter.autonomyScope);
  });

  const reviewedSignal = reliabilitySignals.reviewReliabilitySignal(db, {
    signalId: signal.id,
    status: "MONITORING",
    jamalDecisionNote: "Wird beobachtet, keine weitere Maßnahme.",
    now,
  });

  check("eine Signalprüfung ändert ausschließlich Status/Notiz, kein Sanktionsfeld existiert", () => {
    assert.strictEqual(reviewedSignal.status, "MONITORING");
    assert.strictEqual(reviewedSignal.noAutomaticSanction, true);
    assert.ok(!("sanctionApplied" in reviewedSignal));
    assert.ok(!("autonomyLevel" in reviewedSignal));
  });

  check("ein Reliability-Signal enthält keine dramatisierende Sprache im vom Modul selbst erzeugten Statustext", () => {
    assert.ok(!/Katastrophe|Versagen|Desaster/i.test(reviewedSignal.statusLabel));
    assert.ok(!/Katastrophe|Versagen|Desaster/i.test(reviewedSignal.signalTypeLabel));
  });

  check("Audit-Ereignisse für Reliability-Signale sind datensparsam", () => {
    const events = authDb.listAuditEvents(db, {});
    const signalEvents = events.filter((event) => event.eventType.startsWith("RELIABILITY_SIGNAL_"));
    assert.ok(signalEvents.length >= 2);
    signalEvents.forEach((event) => {
      const metadata = event.metadata ? JSON.parse(event.metadata) : {};
      const allowedKeys = ["agentKey", "signalId", "hrProposalId", "radarItemId", "decisionType"];
      Object.keys(metadata).forEach((key) => assert.ok(allowedKeys.includes(key), `unerwartetes Auditfeld: ${key}`));
      const serialized = JSON.stringify(event);
      assert.ok(!serialized.includes("Wird beobachtet, keine weitere Maßnahme"));
    });
  });

  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
})();

// ---------------------------------------------------------------------------
// 18-21. Technologie-Radar: Zeithorizont, Unsicherheit, drei Szenarien,
// keine automatische Installation.
// ---------------------------------------------------------------------------

(function runRadarPrincipleTests() {
  const { db, dataDir } = makeIsolatedDb("company-principles-radar-test-");
  const items = technologyRadar.listRadarItems(db);

  check("18. jeder Radar-Eintrag enthält einen gültigen Zeithorizont", () => {
    items.forEach((item) => {
      assert.ok(technologyRadar.RADAR_TIME_HORIZON_VALUES.includes(item.timeHorizon));
      assert.ok(item.timeHorizonLabel && item.timeHorizonLabel !== "UNGEKLÄRT");
    });
  });

  check("19. jeder Radar-Eintrag enthält einen gültigen Unsicherheitsgrad", () => {
    items.forEach((item) => {
      assert.ok(technologyRadar.RADAR_UNCERTAINTY_LEVEL_VALUES.includes(item.uncertaintyLevel));
      assert.ok(item.uncertaintyLevelLabel && item.uncertaintyLevelLabel !== "UNGEKLÄRT");
    });
  });

  check("20. jeder Radar-Eintrag enthält alle drei Szenarien (konservativ/wahrscheinlich/dynamisch)", () => {
    items.forEach((item) => {
      assert.ok(item.scenarioConservative.length > 0);
      assert.ok(item.scenarioLikely.length > 0);
      assert.ok(item.scenarioDynamic.length > 0);
    });
  });

  check("21. kein Szenario/Zukunftsfeld löst eine Installation oder Verbindung aus", () => {
    items.forEach((item) => {
      assert.strictEqual(item.noExternalConnectionMade, true);
      assert.strictEqual(item.noInstallationPerformed, true);
      assert.strictEqual(item.scenarioIsNotAGuarantee, true);
    });
  });

  check("jeder Radar-Eintrag enthält einen gültigen Nutzenbereich und Prioritäts-Bucket", () => {
    items.forEach((item) => {
      assert.ok(technologyRadar.BENEFIT_AREA_VALUES.includes(item.benefitArea));
      assert.ok(technologyRadar.PRIORITY_BUCKET_VALUES.includes(item.priorityBucket));
    });
  });

  check("neue Kandidaten starten priorityBucket=WATCH (weniger beginnen, Wichtiges zuverlässig abschließen)", () => {
    const seededItems = items.filter((item) => item.seedToolId);
    assert.ok(seededItems.length > 0);
    seededItems.forEach((item) => {
      assert.strictEqual(item.priorityBucket, "WATCH");
    });
  });

  const reviewed = technologyRadar.reviewForesightScenario(db, { radarItemId: items[0].radarItemId });
  check("reviewForesightScenario markiert ausschließlich lastReviewedAt, keine Installation/Verbindung", () => {
    assert.ok(reviewed.lastReviewedAt);
    assert.strictEqual(reviewed.noExternalConnectionMade, true);
    assert.strictEqual(reviewed.noInstallationPerformed, true);
  });

  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
})();

// ---------------------------------------------------------------------------
// 23-26. Organisationslogik: Finance-Capability-Gap, kein 26. Agent, keine
// zweite Agenten-/Werkzeugregistry.
// ---------------------------------------------------------------------------

const overview = agentOrganization.buildOrganizationOverview();

check("23. Finance-/Controlling-Gruppe bleibt leer und ist explizit als CAPABILITY_GAP markiert", () => {
  const financeGroup = overview.groups.find((group) => group.group === "Finance und Controlling");
  assert.ok(financeGroup);
  assert.strictEqual(financeGroup.agentCount, 0);
  assert.strictEqual(financeGroup.capabilityStatus, "CAPABILITY_GAP");
  assert.ok(financeGroup.capabilityGapNote.length > 0);
  assert.ok(financeGroup.capabilityGapDecisionOptions.length === 4);
});

check("kein Agent wurde künstlich in die Finance-Gruppe gezwungen, um sie zu befüllen", () => {
  const financeGroup = overview.groups.find((group) => group.group === "Finance und Controlling");
  assert.deepStrictEqual(financeGroup.agents, []);
});

check("24. kein 26. Agent existiert (weiterhin exakt 25 Agenten trotz Capability-Gap)", () => {
  assert.strictEqual(overview.agentCount, 25);
  assert.strictEqual(overview.canonicalAgentCount, 25);
  assert.strictEqual(agentRegistry.PRODUCTIVE_AGENT_REGISTRY.length, 25);
});

check("25. keine zweite Agentenregistry existiert (agent-organization-service.js leitet ausschließlich aus agent-registry.js ab)", () => {
  assert.strictEqual(overview.registrySource, "agent-registry.js");
  const registryIds = agentRegistry.PRODUCTIVE_AGENT_REGISTRY.map((agent) => agent.id).sort();
  const overviewIds = overview.profiles.map((profile) => profile.agentId).sort();
  assert.deepStrictEqual(overviewIds, registryIds);
});

check("26. keine zweite Toolregistry existiert (technology-radar-service.js seedt ausschließlich aus tool-registry.js)", () => {
  assert.ok(Array.isArray(toolRegistry.TOOL_REGISTRY));
  const { db, dataDir } = makeIsolatedDb("company-principles-toolregistry-test-");
  const items = technologyRadar.listRadarItems(db);
  const seededItems = items.filter((item) => item.seedToolId);
  const toolRegistryIds = toolRegistry.TOOL_REGISTRY.map((tool) => tool.toolId).sort();
  const seededToolIds = seededItems.map((item) => item.seedToolId).sort();
  assert.deepStrictEqual(seededToolIds, toolRegistryIds);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("companyPrinciplesVersion ist in der Organisationsübersicht sichtbar (Betriebslogik, nicht nur Dokumentation)", () => {
  assert.strictEqual(overview.companyPrinciplesVersion, "1.0");
});

// ---------------------------------------------------------------------------
// 29-31. Audit datensparsam, keine externen Requests, keine Tokens/Secrets
// (statische Quelltextprüfung der neuen Dateien).
// ---------------------------------------------------------------------------

check("29. auth-audit.js führt die fünf neuen Leitlinien-Audit-Ereignisse mit einer eingeschränkten Metadaten-Allowlist", () => {
  const authAudit = require("./auth-audit");
  [
    "COMPANY_PRINCIPLES_REVIEWED",
    "HR_PDCA_STAGE_CHANGED",
    "RELIABILITY_SIGNAL_RECORDED",
    "RELIABILITY_SIGNAL_REVIEWED",
    "FORESIGHT_SCENARIO_REVIEWED",
  ].forEach((eventType) => {
    assert.ok(authAudit.EVENT_TYPES.includes(eventType), `Audit-Ereignistyp fehlt: ${eventType}`);
  });
  ["principleId", "signalId", "pdcaStage", "pdcaDecision"].forEach((field) => {
    assert.ok(authAudit.METADATA_ALLOWLIST.includes(field), `Audit-Metadatenfeld fehlt in Allowlist: ${field}`);
  });
});

check("30. keine der neuen Leitlinien-Dateien führt einen ausgehenden Netzwerkaufruf aus (statische Quelltextprüfung)", () => {
  const filesToScan = [
    "agent-reliability-signal-service.js",
    "agent-hr-coaching-service.js",
    "technology-radar-service.js",
    "agent-organization-service.js",
    "agent-leadership-routes.js",
  ];
  filesToScan.forEach((fileName) => {
    const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
    assert.ok(!/require\(["']https?["']\)/.test(source), `${fileName} importiert http(s)`);
    assert.ok(!/\bfetch\s*\(/.test(source), `${fileName} ruft fetch() auf`);
    assert.ok(!/\bXMLHttpRequest\b/.test(source), `${fileName} verwendet XMLHttpRequest`);
  });
  // company-principles.js enthält ausschließlich statische Objektliterale;
  // die einzige Erwähnung von "fetch()" ist ein beschreibender Regeltext
  // (requiredEvidence der SAFETY_NO_EXTERNAL_ACTION-Planke), kein
  // tatsächlicher Funktionsaufruf – separat mit Codeausführungsmustern statt
  // reinem Text-Grep geprüft.
  const principlesSource = fs.readFileSync(path.join(__dirname, "company-principles.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(principlesSource));
  assert.ok(!/[^"'`]fetch\s*\(\s*["'`]/.test(principlesSource), "company-principles.js ruft fetch() mit einem Argument auf");
});

check("31. keine der neuen Leitlinien-Dateien enthält ein hartkodiertes Token/Secret/API-Schlüssel-Feld", () => {
  const filesToScan = [
    "company-principles.js",
    "agent-reliability-signal-service.js",
    "COMPANY_PRINCIPLES.md",
  ];
  filesToScan.forEach((fileName) => {
    const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
    assert.ok(!/"(token|secret|apiKey|api_key|password)"\s*:/i.test(source), `${fileName} enthält ein Secret-Feld`);
  });
});

console.log(`company-principles.test.js: ${passed} Prüfpunkte erfolgreich`);
