"use strict";

// V7.5 – Agentenorganisation, tägliches HR-Coaching und
// Technologie-/Plugin-Marktradar (Auftrag Abschnitt I/J/L).
//
// Kleines, separates HTTP-Glue-Modul (gleiches Muster wie
// jamal-canva-routes.js): übersetzt ausschließlich HTTP (Body lesen,
// bekannte Felder prüfen, Fehler auf Statuscodes abbilden) und stellt eine
// kompakte Führungsübersicht für die Ansicht "Agenten führen" zusammen.
// Jede Fachregel selbst lebt in agent-organization-service.js/
// agent-hr-coaching-service.js/technology-radar-service.js. Dieses Modul
// importiert NIEMALS better-sqlite3 direkt; die Datenbank wird ihm bei
// jedem Aufruf über `deps.getDb()` gereicht.
//
// CSRF, Origin-/Host-Prüfung und OWNER_ONLY-Zugriff laufen bereits VOR
// jedem Aufruf dieser Handler (route-access-policy.js/
// auth-route-guard.js/server.js), gleiches etabliertes Muster wie
// dispatchJamalWorkModeActionPostPrefix/dispatchCanvaAction.

const agentOrganization = require("./agent-organization-service");
const agentHrCoaching = require("./agent-hr-coaching-service");
const technologyRadar = require("./technology-radar-service");
const reliabilitySignals = require("./agent-reliability-signal-service");
const companyPrinciples = require("./company-principles");
const authAudit = require("./auth-audit");

const AGENT_LEADERSHIP_API_MAX_BODY_BYTES = 8 * 1024;

// ---------------------------------------------------------------------------
// Kleine, lokale JSON-Body-Hilfen (bewusst eine eigene, kleine Kopie statt
// eines Requires aus server.js/jamal-canva-routes.js – jedes Routenmodul
// bleibt unabhängig lauffähig, gleiche Begründung wie dort).
// ---------------------------------------------------------------------------

function readJsonRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    if (!/^application\/json(;|$)/i.test(contentType.trim())) {
      reject(Object.assign(new Error("Content-Type muss application/json sein."), { statusCode: 415 }));
      return;
    }
    let received = 0;
    const chunks = [];
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBytes) {
        rejected = true;
        reject(Object.assign(new Error("Anfragekörper überschreitet die Größenbegrenzung."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(Object.assign(new Error("Anfragekörper muss ein JSON-Objekt sein."), { statusCode: 400 }));
          return;
        }
        resolve(parsed);
      } catch (_error) {
        reject(Object.assign(new Error("Anfragekörper ist kein gültiges JSON."), { statusCode: 400 }));
      }
    });
    req.on("error", () => {
      if (rejected) return;
      reject(Object.assign(new Error("Anfrage konnte nicht gelesen werden."), { statusCode: 400 }));
    });
  });
}

function assertKnownFieldsOnly(body, allowedFields, label) {
  const unknown = Object.keys(body || {}).filter((key) => !allowedFields.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label}: unbekannte Felder werden abgewiesen (${unknown.join(", ")}).`);
  }
}

function genericErrorPayload(message) {
  return { ok: false, message: message || "Aktion ist im aktuellen Zustand nicht möglich." };
}

function actorUserIdFromContext(context) {
  const identity = context && context.identity;
  return identity && !identity.isBypass ? identity.userId : null;
}

function sendServiceError(res, sendJson, error) {
  if (
    error &&
    (error.name === "AgentHrCoachingError" || error.name === "TechnologyRadarError" || error.name === "ReliabilitySignalError")
  ) {
    sendJson(res, error.statusCode, genericErrorPayload(error.message));
    return;
  }
  sendJson(res, error && error.statusCode ? error.statusCode : 400, genericErrorPayload(error && error.message));
}

// ---------------------------------------------------------------------------
// Sicherheits-/Autonomiegrenzen (Auftrag Abschnitt M) – als fester,
// unveränderlicher Textblock in JEDER Antwort dieses Moduls sichtbar
// gemacht, statt nur an einer Stelle in der Dokumentation.
// ---------------------------------------------------------------------------
const AUTONOMY_BOUNDARIES_NOTICE = Object.freeze({
  proposalIsNotAutonomyChange: true,
  approvalDoesNotChangePermissions: true,
  pluginRecommendationInstallsNothing: true,
  radarEntryTriggersNoExternalTest: true,
  readOnlyFirst: true,
  writeAccessRequiresSeparateApprovalCorridor: true,
  jamalRemainsDecisionMaker: true,
});

// ---------------------------------------------------------------------------
// L. Kompakte Führungsübersicht ("Agenten führen" – oben sichtbar).
// ---------------------------------------------------------------------------

const RUN_STATUS_TOP_LABELS_DE = Object.freeze({
  NOT_CREATED: "Noch nicht erstellt",
  READY_FOR_REVIEW: "Bereit zur Prüfung",
  PARTIALLY_REVIEWED: "Teilweise geprüft",
  FULLY_REVIEWED: "Vollständig geprüft",
});

function buildTopDecision(runView) {
  if (!runView) {
    return "HR-Lauf für heute noch nicht erstellt – als ersten Schritt anlegen.";
  }
  const openProposal = runView.proposals.find((proposal) => proposal.status === "PROPOSED");
  if (!openProposal) {
    return "Keine offene HR-Entscheidung heute – alle 25 Vorschläge sind geprüft.";
  }
  return `${openProposal.agentId}: ${openProposal.requiredJamalDecision}`;
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt L) – "weniger beginnen,
// Wichtiges zuverlässig abschließen": höchstens drei Hinweise, sortiert nach
// priorityBucket (NOW vor NEXT vor LATER vor WATCH), nicht einfach nach
// Erstellungsreihenfolge.
const PRIORITY_BUCKET_SORT_ORDER = Object.freeze({ NOW: 0, NEXT: 1, LATER: 2, WATCH: 3 });

function buildPrioritizedHints(runView) {
  if (!runView) return [];
  return runView.proposals
    .filter((proposal) => proposal.status === "PROPOSED")
    .slice()
    .sort((a, b) => (PRIORITY_BUCKET_SORT_ORDER[a.priorityBucket] ?? 9) - (PRIORITY_BUCKET_SORT_ORDER[b.priorityBucket] ?? 9))
    .slice(0, 3)
    .map((proposal) => ({
      agentId: proposal.agentId,
      hrRecommendation: proposal.hrRecommendation,
      requiredJamalDecision: proposal.requiredJamalDecision,
      priorityBucket: proposal.priorityBucket,
      priorityBucketLabel: proposal.priorityBucketLabel,
    }));
}

function buildRadarHint(radarItems) {
  return {
    newCandidates: radarItems.filter((item) => item.status === "CANDIDATE").length,
    readyForReview: radarItems.filter((item) => item.status === "NOT_REVIEWED").length,
    blocked: radarItems.filter((item) => item.recommendation === "BLOCKED").length,
  };
}

function handleOrganization(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const overview = agentOrganization.buildOrganizationOverview();
  const todaysRun = agentHrCoaching.getTodaysRun(db);

  const developmentFocusByAgentId = new Map();
  if (todaysRun.hasRun) {
    todaysRun.view.proposals.forEach((proposal) => {
      developmentFocusByAgentId.set(proposal.agentId, proposal.improvementSuggestion);
    });
  }
  const profiles = overview.profiles.map((profile) => ({
    ...profile,
    developmentFocus: developmentFocusByAgentId.get(profile.agentId) || "Noch kein heutiger HR-Lauf erstellt.",
  }));

  agentHrCoaching.auditOrganizationReviewed(db, { actorUserId: null });

  sendJson(res, 200, {
    ok: true,
    ...overview,
    profiles,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

function handleHrDailyRun(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const result = agentHrCoaching.getTodaysRun(db);
  sendJson(res, 200, {
    ok: true,
    hasRun: result.hasRun,
    run: result.view,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

function handleTechnologyRadar(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const items = technologyRadar.listRadarItems(db);
  sendJson(res, 200, {
    ok: true,
    radarItemCount: items.length,
    items,
    knownVendorCandidateNote:
      "Bekannte Kandidaten stammen ausschließlich aus dem bestehenden tool-registry.js – keine automatische Webrecherche, keine erfundene Marktbehauptung.",
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

function handleAgentTechnologyFit(res, deps, agentIdFilter) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const agentId = agentIdFilter && String(agentIdFilter).trim() ? String(agentIdFilter).trim() : null;
  const items = technologyRadar.listAgentTechnologyFit(db, agentId ? { agentId } : {});
  sendJson(res, 200, {
    ok: true,
    fitCount: items.length,
    items,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt M) – die Finance-/
// Controlling-Lücke erscheint oben nur, wenn sie gerade für eine aktuelle
// Entscheidung relevant ist: konkret dann, wenn heute keine dringendere
// (NOW-)Priorität offensteht, sodass die Lücke nicht von echten
// Tagesprioritäten ablenkt.
function buildCapabilityGapHint(overview, prioritizedHints) {
  const gapGroup = overview.groups.find((group) => group.capabilityStatus === "CAPABILITY_GAP");
  if (!gapGroup) return null;
  const hasUrgentHint = prioritizedHints.some((hint) => hint.priorityBucket === "NOW");
  if (hasUrgentHint) return null;
  return {
    group: gapGroup.group,
    status: "CAPABILITY_GAP",
    note: gapGroup.capabilityGapNote,
    decisionOptions: gapGroup.capabilityGapDecisionOptions,
  };
}

// Oben sichtbare Kompaktkarte für die UI (Auftrag Abschnitt L, Ziffer 1-5;
// Unternehmensleitlinien V1.0 Abschnitt N: Leitlinienversion, Führungsfokus,
// höchstens drei Entscheidungen, Hinweis "Betriebsregeln, keine
// Motivationsseite").
function handleLeadershipSummary(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const overview = agentOrganization.buildOrganizationOverview();
  const todaysRun = agentHrCoaching.getTodaysRun(db);
  const runStatus = todaysRun.hasRun ? todaysRun.view.status : "NOT_CREATED";
  const radarItems = technologyRadar.listRadarItems(db);
  const prioritizedAgentHints = buildPrioritizedHints(todaysRun.hasRun ? todaysRun.view : null);

  sendJson(res, 200, {
    ok: true,
    companyPrinciplesVersion: companyPrinciples.COMPANY_PRINCIPLES_VERSION,
    leadershipFocusNote:
      "Leitlinien sind Betriebsregeln, keine Motivationsseite: sie steuern Organisation, HR-Coaching, Qualitätsprüfung und Technologie-Radar direkt.",
    agentCount: overview.agentCount,
    hrDailyRunStatus: runStatus,
    hrDailyRunStatusLabel: RUN_STATUS_TOP_LABELS_DE[runStatus],
    topDecision: buildTopDecision(todaysRun.hasRun ? todaysRun.view : null),
    prioritizedAgentHints,
    maxPrioritizedHints: 3,
    capabilityGapHint: buildCapabilityGapHint(overview, prioritizedAgentHints),
    radarHint: buildRadarHint(radarItems),
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

// Unternehmensleitlinien V1.0 (Auftrag Abschnitt O) – read-only Endpoint für
// Leitlinienversion und strukturierte Regeln. OWNER_ONLY, no-store,
// fail-closed (route-access-policy.js/server.js), keine externe Aktion.
function handleCompanyPrinciples(res, deps) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  try {
    authAudit.recordAuditEvent(db, {
      eventType: "COMPANY_PRINCIPLES_REVIEWED",
      result: "OK",
      actorUserId: null,
      tenantId: null,
      timestamp: new Date().toISOString(),
      metadata: null,
    });
  } catch (_error) {
    /* Audit darf diesen read-only Abruf niemals zum Absturz bringen. */
  }
  sendJson(res, 200, {
    ok: true,
    version: companyPrinciples.COMPANY_PRINCIPLES_VERSION,
    contexts: companyPrinciples.PRINCIPLE_CONTEXTS,
    principles: companyPrinciples.COMPANY_PRINCIPLES,
    isOperationalLogicNotJustDocumentation: true,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

function handleReliabilitySignals(res, deps, agentIdFilter) {
  const { getDb, sendJson } = deps;
  const db = getDb();
  const agentId = agentIdFilter && String(agentIdFilter).trim() ? String(agentIdFilter).trim() : null;
  const items = reliabilitySignals.listReliabilitySignals(db, agentId ? { agentId } : {});
  sendJson(res, 200, {
    ok: true,
    signalCount: items.length,
    items,
    autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE,
  });
}

// ---------------------------------------------------------------------------
// POST-Aktionen – ein einziger Prefix (Auftrag Abschnitt J/Leitprinzip
// "minimaler Dateiumfang, keine parallele neue Architektur"), gleiches
// Muster wie /api/jamal-work-mode/.
// ---------------------------------------------------------------------------

const RADAR_ITEM_FIELDS = Object.freeze([
  "radarItemId",
  "name",
  "provider",
  "category",
  "type",
  "shortDescription",
  "possibleAgents",
  "possibleBusinessBenefit",
  "maturityLevel",
  "securityRisk",
  "privacyRisk",
  "costClass",
  "integrationEffort",
  "vendorLockInRisk",
  "writeAccessRequired",
  "humanApprovalRequired",
  "recommendation",
  "reasoning",
  "status",
  "nextReviewAt",
  "sourceNote",
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt I/J/L) – optionale
  // Zukunfts-/Szenario- und Nutzenfelder.
  "signalType",
  "signalDescription",
  "timeHorizon",
  "uncertaintyLevel",
  "scenarioConservative",
  "scenarioLikely",
  "scenarioDynamic",
  "strategicImpact",
  "todayPreparationStep",
  "benefitArea",
  "priorityBucket",
]);

const AGENT_LEADERSHIP_ACTIONS = Object.freeze({
  "create-hr-daily-run": {
    fields: [],
    run: (db, _body, now, actorUserId) => {
      const result = agentHrCoaching.getOrCreateTodaysRun(db, { now, actorUserId });
      return { run: result.view, created: result.created };
    },
  },
  "review-hr-proposal": {
    fields: ["proposalId", "status", "jamalNote"],
    run: (db, body, now, actorUserId) => ({
      proposal: agentHrCoaching.reviewProposal(db, {
        proposalId: body.proposalId,
        status: body.status,
        jamalNote: body.jamalNote,
        now,
        actorUserId,
      }),
    }),
  },
  "upsert-radar-item": {
    fields: RADAR_ITEM_FIELDS,
    run: (db, body, now, actorUserId) => ({
      item: technologyRadar.upsertRadarItem(db, body, { now, actorUserId }),
    }),
  },
  "review-agent-technology-fit": {
    fields: ["fitId", "status", "priority"],
    run: (db, body, now, actorUserId) => ({
      fit: technologyRadar.reviewAgentTechnologyFit(db, {
        fitId: body.fitId,
        status: body.status,
        priority: body.priority,
        now,
        actorUserId,
      }),
    }),
  },
  // Unternehmensleitlinien V1.0 (Auftrag Abschnitt G/H/P) – vier zusätzliche
  // Führungsaktionen, bewusst im selben POST-Prefix wie oben (kein neues,
  // paralleles API-Muster).
  "advance-hr-pdca-stage": {
    fields: ["proposalId", "targetStage", "pdcaDecision"],
    run: (db, body, now, actorUserId) => ({
      proposal: agentHrCoaching.advanceHrPdcaStage(db, {
        proposalId: body.proposalId,
        targetStage: body.targetStage,
        pdcaDecision: body.pdcaDecision,
        now,
        actorUserId,
      }),
    }),
  },
  "record-reliability-signal": {
    fields: ["agentId", "relatedHrProposalId", "relatedRadarItemId", "signalType", "observation", "possibleImpact", "recommendedReview"],
    run: (db, body, now, actorUserId) => ({
      signal: reliabilitySignals.recordReliabilitySignal(db, {
        agentId: body.agentId,
        relatedHrProposalId: body.relatedHrProposalId,
        relatedRadarItemId: body.relatedRadarItemId,
        signalType: body.signalType,
        observation: body.observation,
        possibleImpact: body.possibleImpact,
        recommendedReview: body.recommendedReview,
        now,
        actorUserId,
      }),
    }),
  },
  "review-reliability-signal": {
    fields: ["signalId", "status", "jamalDecisionNote"],
    run: (db, body, now, actorUserId) => ({
      signal: reliabilitySignals.reviewReliabilitySignal(db, {
        signalId: body.signalId,
        status: body.status,
        jamalDecisionNote: body.jamalDecisionNote,
        now,
        actorUserId,
      }),
    }),
  },
  "review-foresight-scenario": {
    fields: ["radarItemId"],
    run: (db, body, now, actorUserId) => ({
      item: technologyRadar.reviewForesightScenario(db, {
        radarItemId: body.radarItemId,
        now,
        actorUserId,
      }),
    }),
  },
});

function isAgentLeadershipAction(actionName) {
  return Object.prototype.hasOwnProperty.call(AGENT_LEADERSHIP_ACTIONS, actionName);
}

async function dispatchAgentLeadershipAction(res, context, deps, actionName) {
  const { getDb, sendJson } = deps;
  const action = AGENT_LEADERSHIP_ACTIONS[actionName];
  let body;
  try {
    body = await readJsonRequestBody(context.req, AGENT_LEADERSHIP_API_MAX_BODY_BYTES);
    assertKnownFieldsOnly(body, action.fields, `agent-leadership-action-${actionName}`);
  } catch (error) {
    sendJson(res, error.statusCode || 400, genericErrorPayload(error.message));
    return;
  }
  try {
    const db = getDb();
    const actorUserId = actorUserIdFromContext(context);
    const result = action.run(db, body, new Date(), actorUserId);
    sendJson(res, 200, { ok: true, ...result, autonomyBoundaries: AUTONOMY_BOUNDARIES_NOTICE });
  } catch (error) {
    sendServiceError(res, sendJson, error);
  }
}

module.exports = {
  AGENT_LEADERSHIP_ACTIONS,
  AUTONOMY_BOUNDARIES_NOTICE,
  isAgentLeadershipAction,
  dispatchAgentLeadershipAction,
  handleOrganization,
  handleHrDailyRun,
  handleTechnologyRadar,
  handleAgentTechnologyFit,
  handleLeadershipSummary,
  handleCompanyPrinciples,
  handleReliabilitySignals,
};
