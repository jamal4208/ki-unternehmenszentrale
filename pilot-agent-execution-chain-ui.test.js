"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 8 ("vollständige, kontrollierte
// Drei-Agenten-Kette als kontrollierter Nachtlauf").
//
// Gleiches Muster wie pilot-work-order-command-center-ui.test.js: führt
// pilot-work-order-ui.js TATSÄCHLICH aus (kein jsdom), gegen ein minimales,
// auf die drei additiven Ketten-Aktionen fokussiertes In-Memory-Fake-Backend
// (kein echter Server, keine echte Datenbank, kein echter Codex-Lauf). Prüft
// ausschließlich das additive Ketten-UI (renderAgentChainSection); die
// bereits bestehende Kartenlogik (Auswahl, Anlage, Revisionskonflikt,
// lokaler/Codex-Einzellauf) bleibt in pilot-work-order-command-center-ui.test.js
// abgedeckt und wird hier nicht erneut geprüft.

const assert = require("assert");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeElement(overrides = {}) {
  return Object.assign({ innerHTML: "", value: "" }, overrides);
}

const domElements = {
  "pilot-work-order-card": makeElement({ addEventListener: () => {} }),
  "pilot-work-order-list-output": makeElement(),
  "pilot-work-order-output": makeElement(),
  "pilot-work-order-diagnostics-output": makeElement(),
  "pilot-order-create-title": makeElement(),
  "pilot-order-create-desired-outcome": makeElement(),
  "pilot-order-create-requested-by": makeElement(),
  "pilot-order-create-quality-criteria": makeElement(),
  "pilot-order-create-allowed-tools": makeElement(),
  "pilot-order-create-forbidden-actions": makeElement(),
  "pilot-order-create-required-approvals": makeElement(),
  "pilot-order-create-timeframe": makeElement(),
};

global.document = {
  readyState: "complete",
  cookie: "",
  addEventListener: () => {},
  getElementById: (id) => domElements[id] || null,
};

const CANONICAL_ID = "pilot-three-agent-work-order-v1";

const CHAIN_STEP_DEFINITIONS = [
  { stepNumber: 1, agentKey: "review-agent", presetId: "codex-chain-research-analysis" },
  { stepNumber: 2, agentKey: "documentation-agent", presetId: "codex-document-chain-result" },
  { stepNumber: 3, agentKey: "orchestrator-agent", presetId: "codex-pm-evaluate-chain" },
];
const CHAIN_SELECTABLE_FILES = [
  "pilot-agent-execution-chain-service.js",
  "pilot-work-order-service.js",
  "pilot-agent-runner.js",
  "auth-db-migrations.js",
];

const RESULT_TEXT_BY_STEP = {
  1: "Kurzbefund: Testbefund Schritt 1.",
  2: "Titel: Testdokumentation Schritt 2.",
  3: "Gesamturteil: konsistent (Testergebnis Schritt 3).",
};

function makeFakeBackend() {
  const orders = new Map();
  let idCounter = 0;
  let chainCounter = 0;
  let runCounter = 0;
  let tokenCounter = 0;
  let codexAvailable = true;
  let codexAuthenticated = true;
  let nextStepOutcome = "SUCCEEDED";
  const issuedTokens = new Map(); // token -> { chainId, chainStep }

  function nowIso() {
    return new Date().toISOString();
  }

  function baseOrder(id, overrides) {
    return Object.assign(
      {
        id,
        title: "Titel",
        desiredOutcome: "Ergebnis",
        requestedBy: "Jamal",
        status: "IN_EXECUTION",
        statusLabel: "In Ausführung",
        revision: 0,
        involvedAgents: [{ pilotRoleLabel: "Projektmanager-Agent", canonicalName: "Projektmanager-Agent", focus: "x" }],
        qualityCriteria: ["a"],
        allowedTools: ["a"],
        forbiddenActions: ["a"],
        requiredApprovals: ["a"],
        timeframe: "x",
        handoffs: [],
        agentExecutionRuns: [],
        agentChains: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      overrides,
    );
  }

  orders.set(CANONICAL_ID, baseOrder(CANONICAL_ID, { title: "Kanonischer Pilotauftrag" }));

  function overviewFor(order) {
    const bookedCount = (order.agentChains || [])
      .flatMap((chain) => chain.steps || [])
      .filter((step) => step.roleHandoffBooked === true).length;
    return {
      codexAvailability: { available: codexAvailable, authenticated: codexAuthenticated, version: "codex-cli 0.999.0-test", authLabel: codexAuthenticated ? "ChatGPT" : null },
      order: {
        id: order.id,
        title: order.title,
        desiredOutcome: order.desiredOutcome,
        requestedBy: order.requestedBy,
        status: order.status,
        statusLabel: order.statusLabel,
        revision: order.revision,
        qualityCriteria: order.qualityCriteria,
        allowedTools: order.allowedTools,
        forbiddenActions: order.forbiddenActions,
        requiredApprovals: order.requiredApprovals,
        timeframe: order.timeframe,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      involvedAgents: order.involvedAgents,
      status: order.status,
      statusLabel: order.statusLabel,
      handoffs: order.handoffs,
      agentExecutionRuns: order.agentExecutionRuns || [],
      agentChains: order.agentChains || [],
      chainSelectableFiles: CHAIN_SELECTABLE_FILES.slice(),
      openDecision: null,
      risksAndLimits: [],
      nextStep: "Weiter im Ablauf.",
      progress: { rolesPassed: 0, rolesTotal: 3, chainRolesBooked: bookedCount },
      chainRoleProgress: { bookedRoles: [], bookedCount, totalCount: 3 },
      autonomyBoundaries: { disclaimer: "Testfixtur." },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  function respond(status, body) {
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  }

  function findChain(order, chainId) {
    return (order.agentChains || []).find((chain) => chain.id === chainId);
  }
  function findStep(chain, stepNumber) {
    return chain.steps.find((step) => step.stepNumber === stepNumber);
  }
  function waitingStatusFor(stepNumber) {
    return { 1: "WAITING_FOR_RESEARCH_APPROVAL", 2: "WAITING_FOR_DOCUMENTATION_APPROVAL", 3: "WAITING_FOR_PM_APPROVAL" }[stepNumber];
  }

  function handleChainAction(order, action, body) {
    if (action === "prepare-agent-chain") {
      chainCounter += 1;
      const selectedFiles =
        Array.isArray(body.selectedFiles) && body.selectedFiles.length > 0
          ? body.selectedFiles.slice()
          : CHAIN_SELECTABLE_FILES.slice();
      const chain = {
        id: `pilot-agent-chain-test-${chainCounter}`,
        pilotOrderId: order.id,
        chainStatus: "PREPARED",
        currentStep: 1,
        revision: 1,
        waitingForJamal: false,
        blockReason: null,
        completedAt: null,
        selectedFiles,
        selectedFilesFixed: true,
        coreMandate: {
          orderId: order.id,
          orderRevision: order.revision,
          title: order.title,
          desiredOutcome: order.desiredOutcome,
          qualityCriteria: order.qualityCriteria,
        },
        mandateDigest: "a".repeat(64),
        steps: CHAIN_STEP_DEFINITIONS.map((definition) => ({
          stepNumber: definition.stepNumber,
          agentKey: definition.agentKey,
          presetId: definition.presetId,
          stepStatus: "PENDING",
          approvalStatus: "NOT_REQUESTED",
          executionRunId: null,
          chainedFromExecutionRunId: null,
          predecessorCharCount: null,
          predecessorIncludedCharCount: null,
          predecessorTruncated: false,
          predecessorFullyIncluded: null,
          pendingPredecessorCharCount: null,
          pendingPredecessorTooLarge: null,
          roleHandoffBooked: false,
          roleHandoffBookedAt: null,
          resultDigest: null,
          failureReasonCode: null,
        })),
      };
      order.agentChains = (order.agentChains || []).concat([chain]);
      return respond(200, { ok: true, chain, overview: overviewFor(order) });
    }
    if (action === "request-chain-step-approval") {
      const chain = findChain(order, body.chainId);
      if (!chain) return respond(400, { ok: false, message: "Die Kette gehört nicht zu diesem Pilotauftrag." });
      const step = findStep(chain, body.chainStep);
      if (!step || chain.currentStep !== body.chainStep || step.stepStatus !== "PENDING") {
        return respond(409, { ok: false, message: "Für diesen Kettenschritt kann derzeit keine Freigabe angefordert werden." });
      }
      step.approvalStatus = "REQUESTED";
      if (body.chainStep === 1) chain.chainStatus = "WAITING_FOR_RESEARCH_APPROVAL";
      chain.revision += 1;
      tokenCounter += 1;
      const token = `chain-approval-test-token-${tokenCounter}`;
      issuedTokens.set(token, { chainId: chain.id, chainStep: body.chainStep });
      return respond(200, { ok: true, approvalToken: token, expiresInMs: 300000, chain });
    }
    if (action === "start-chain-step") {
      const chain = findChain(order, body.chainId);
      if (!chain) return respond(400, { ok: false, message: "Die Kette gehört nicht zu diesem Pilotauftrag." });
      const step = findStep(chain, body.chainStep);
      const tokenBinding = issuedTokens.get(body.approvalToken);
      if (!tokenBinding || tokenBinding.chainId !== body.chainId || tokenBinding.chainStep !== body.chainStep) {
        return respond(409, { ok: false, message: "Für diesen Kettenschritt liegt keine gültige, frische Freigabe vor." });
      }
      issuedTokens.delete(body.approvalToken);
      if (!step || chain.currentStep !== body.chainStep || step.approvalStatus !== "REQUESTED") {
        return respond(409, { ok: false, message: "Kettenschritt kann im aktuellen Zustand nicht gestartet werden." });
      }
      const predecessor = body.chainStep > 1 ? findStep(chain, body.chainStep - 1) : null;
      if (predecessor && predecessor.stepStatus !== "SUCCEEDED") {
        return respond(409, { ok: false, message: "Das Vorgängerergebnis fehlt." });
      }
      runCounter += 1;
      if (nextStepOutcome === "FAILED") {
        step.stepStatus = "FAILED";
        step.failureReasonCode = "CODEX_PROCESS_EXIT_NONZERO";
        chain.chainStatus = "FAILED";
        chain.revision += 1;
        return respond(200, { ok: true, chain, overview: overviewFor(order) });
      }
      const executionRunId = `pilot-agent-run-chain-test-${runCounter}`;
      step.stepStatus = "SUCCEEDED";
      step.executionRunId = executionRunId;
      step.chainedFromExecutionRunId = predecessor ? predecessor.executionRunId : null;
      step.predecessorCharCount = predecessor ? RESULT_TEXT_BY_STEP[body.chainStep - 1].length : null;
      step.predecessorIncludedCharCount = predecessor ? RESULT_TEXT_BY_STEP[body.chainStep - 1].length : null;
      step.predecessorTruncated = false;
      step.predecessorFullyIncluded = predecessor ? true : null;
      step.roleHandoffBooked = true;
      step.roleHandoffBookedAt = nowIso();
      const run = {
        id: executionRunId,
        presetId: step.presetId,
        pilotRole: "RECHERCHE_ANALYSE",
        pilotRoleLabel: "Recherche-/Analyse-Agent",
        taskTitle: `Kettenschritt ${step.stepNumber}`,
        runnerId: "codex-read-only-analysis",
        runnerLabel: "Codex – echter, isolierter Read-Only-KI-Agentenlauf",
        requestedRunnerKind: "CODEX_READ_ONLY",
        actualRunnerKind: "CODEX_READ_ONLY",
        aiExecuted: true,
        fallbackUsed: false,
        modelLabel: "Codex (ChatGPT)",
        runnerVersion: "codex-cli 0.999.0-test",
        status: "SUCCEEDED",
        promptDigest: "b".repeat(64),
        mandateDigest: "a".repeat(64),
        resultTruncated: false,
        resultRawText: RESULT_TEXT_BY_STEP[step.stepNumber],
        resultSummary: {
          secretRedactionApplied: false,
          secretRedactionNotice: null,
          analyzedFiles: chain.selectedFiles.slice(),
        },
        errorMessage: null,
        handoffStatus: "PENDING",
        handoffErrorMessage: null,
        startedAt: nowIso(),
        finishedAt: nowIso(),
      };
      order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
      if (body.chainStep < 3) {
        chain.currentStep = body.chainStep + 1;
        chain.chainStatus = waitingStatusFor(body.chainStep + 1);
      } else {
        chain.chainStatus = "COMPLETED";
        chain.completedAt = nowIso();
      }
      chain.revision += 1;
      return respond(200, { ok: true, chain, overview: overviewFor(order) });
    }
    return null;
  }

  function handle(url, opts) {
    const method = (opts && opts.method) || "GET";
    const body = opts && opts.body ? JSON.parse(opts.body) : {};

    if (method === "GET" && url === "/api/pilot-work-order/status") {
      return respond(200, { ok: true, overview: overviewFor(orders.get(CANONICAL_ID)) });
    }
    if (method === "GET" && url === "/api/pilot-work-order/orders") {
      return respond(200, { ok: true, orders: Array.from(orders.values()).map((order) => overviewFor(order).order) });
    }
    const getMatch = url.match(/^\/api\/pilot-work-order\/orders\/([^/]+)$/);
    if (method === "GET" && getMatch) {
      const order = orders.get(decodeURIComponent(getMatch[1]));
      if (!order) return respond(404, { ok: false, message: "Nicht gefunden." });
      return respond(200, { ok: true, overview: overviewFor(order) });
    }
    const actionMatch = url.match(/^\/api\/pilot-work-order\/orders\/([^/]+)\/([^/]+)$/);
    if (method === "POST" && actionMatch) {
      const orderId = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      const order = orders.get(orderId);
      if (!order) return respond(404, { ok: false, message: "Nicht gefunden." });
      const chainResult = handleChainAction(order, action, body);
      if (chainResult) return chainResult;
      return respond(200, { ok: true, overview: overviewFor(order) });
    }
    return respond(404, { ok: false, message: "Nicht gefunden." });
  }

  return {
    handle,
    orders,
    setCodexAvailability: (available, authenticated) => {
      codexAvailable = available;
      codexAuthenticated = authenticated;
    },
    setNextStepOutcome: (value) => {
      nextStepOutcome = value;
    },
    setPendingPredecessorTooLarge: (chainId, stepNumber, charCount) => {
      const order = orders.get(CANONICAL_ID);
      const chain = findChain(order, chainId);
      if (!chain) return;
      const step = findStep(chain, stepNumber);
      if (!step) return;
      step.pendingPredecessorCharCount = charCount;
      step.pendingPredecessorTooLarge = true;
      step.stepStatus = "PENDING";
      step.approvalStatus = "NOT_REQUESTED";
      chain.currentStep = stepNumber;
      chain.chainStatus = waitingStatusFor(stepNumber);
      chain.revision += 1;
    },
    // V7.8.1 ("Ergebnisbudget von Kettenschritt 2 technisch erzwungen"):
    // setzt bzw. entfernt die Auditmetadaten der deterministischen
    // Budgetdurchsetzung an dem Lauf, der zu einer bereits erfolgreichen
    // Stufe gehört. `normalization === null` entfernt das Feld vollständig
    // (Rückwärtskompatibilität für Läufe von vor V7.8.1).
    setDocumentationNormalization: (chainId, stepNumber, normalization) => {
      const order = orders.get(CANONICAL_ID);
      const chain = findChain(order, chainId);
      if (!chain) return;
      const step = findStep(chain, stepNumber);
      if (!step || !step.executionRunId) return;
      const run = (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId);
      if (!run) return;
      if (normalization === null) {
        delete run.resultSummary.documentationNormalization;
      } else {
        run.resultSummary.documentationNormalization = normalization;
      }
      chain.revision += 1;
    },
    markChainAsLegacy: (chainId) => {
      const order = orders.get(CANONICAL_ID);
      const chain = findChain(order, chainId);
      if (!chain) return;
      chain.selectedFilesFixed = false;
      chain.selectedFiles = [];
      chain.coreMandate = null;
      chain.revision += 1;
    },
  };
}

const backend = makeFakeBackend();
const fetchCalls = [];
global.fetch = (url, opts) => {
  fetchCalls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  return backend.handle(url, opts);
};

const ui = require("./pilot-work-order-ui.js");

function diagnosticsHtml() {
  return domElements["pilot-work-order-diagnostics-output"].innerHTML;
}

function orderHtml() {
  return domElements["pilot-work-order-output"].innerHTML;
}

async function run() {
  await ui.getInitPromise();

  await check("keine Agentenkette vor der ersten Vorbereitung sichtbar (kein automatischer Start)", async () => {
    assert.match(diagnosticsHtml(), /Noch keine Agentenkette vorbereitet/);
    assert.match(diagnosticsHtml(), /data-action="prepare-agent-chain"/);
    assert.doesNotMatch(diagnosticsHtml(), /data-action="prepare-agent-chain" disabled/);
    assert.match(diagnosticsHtml(), /Jamal legt die Dateiauswahl hier einmal f\u00fcr alle drei Stufen fest/);
  });

  await check("V7.8.0: wenn lokal keine Datei ausgewählt ist, bleibt 'Neue Agentenkette vorbereiten' deaktiviert und sendet keinen API-Aufruf", async () => {
    fetchCalls.length = 0;
    const uiState = ui.getState();
    uiState.chainSelectedFiles = [];
    ui.render();
    const html = diagnosticsHtml();
    assert.match(html, /Mindestens eine Datei muss ausgew\u00e4hlt sein/);
    assert.match(html, /data-action="prepare-agent-chain"[^>]*disabled/);
    await ui.prepareAgentChain();
    assert.strictEqual(fetchCalls.filter((entry) => entry.url.includes("prepare-agent-chain")).length, 0);
    uiState.chainSelectedFiles = CHAIN_SELECTABLE_FILES.slice();
    ui.render();
  });

  await check("44. eine vorbereitete Kette zeigt genau drei getrennte Stufen mit Agent und Status", async () => {
    fetchCalls.length = 0;
    await ui.prepareAgentChain();
    const prepareCall = fetchCalls.find((entry) => entry.url.includes("prepare-agent-chain"));
    assert.ok(prepareCall);
    assert.deepStrictEqual(prepareCall.body.selectedFiles, CHAIN_SELECTABLE_FILES);
    const html = diagnosticsHtml();
    assert.match(html, /Schritt 1 \u2013 Recherche\/Analyse/);
    assert.match(html, /Schritt 2 \u2013 Dokumentation/);
    assert.match(html, /Schritt 3 \u2013 Projektmanager-Bewertung/);
    assert.match(html, /Review-\/Recherche-Agent/);
    assert.match(html, /Dokumentations-Agent/);
    assert.match(html, /Orchestrator-\/Projektmanager-Agent/);
  });

  let chainId;
  await check("45./46. Freigabe- und Start-Schaltflächen sind je Stufe getrennt und zunächst korrekt deaktiviert/aktiviert", async () => {
    const state = ui.getState();
    chainId = state.overview.agentChains[0].id;
    const html = diagnosticsHtml();
    // Schritt 1 ist an der Reihe: Freigabe anfordern ist aktiv, Start ohne Freigabe ist deaktiviert.
    const step1RequestMatch = html.match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${chainId}" data-chain-step="1"[^>]*`));
    assert.ok(step1RequestMatch && !step1RequestMatch[0].includes("disabled"), "Freigabe für Schritt 1 muss anfordbar sein");
    const step1StartMatch = html.match(new RegExp(`data-action="start-chain-step" data-chain-id="${chainId}" data-chain-step="1"[^>]*`));
    assert.ok(step1StartMatch && step1StartMatch[0].includes("disabled"), "Start für Schritt 1 muss ohne Freigabe deaktiviert sein");
    // Schritt 2/3 sind noch nicht an der Reihe: beide Schaltflächen deaktiviert.
    const step2RequestMatch = html.match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${chainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2RequestMatch && step2RequestMatch[0].includes("disabled"), "Freigabe für Schritt 2 darf vor Schritt 1 nicht möglich sein");
  });

  await check("46. eine angeforderte Freigabe für Schritt 1 schaltet ausschließlich dessen Start-Schaltfläche frei", async () => {
    fetchCalls.length = 0;
    await ui.requestChainStepApproval(chainId, 1);
    const call = fetchCalls.find((entry) => entry.url.includes("request-chain-step-approval"));
    assert.ok(call);
    assert.deepStrictEqual(call.body, { chainId, chainStep: 1 });
    const html = diagnosticsHtml();
    const step1StartMatch = html.match(new RegExp(`data-action="start-chain-step" data-chain-id="${chainId}" data-chain-step="1"[^>]*`));
    assert.ok(step1StartMatch && !step1StartMatch[0].includes("disabled"), "Start für Schritt 1 muss nach Freigabe aktiv sein");
    const step2StartMatch = html.match(new RegExp(`data-action="start-chain-step" data-chain-id="${chainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2StartMatch && step2StartMatch[0].includes("disabled"), "Start für Schritt 2 bleibt weiterhin deaktiviert");
  });

  await check("47./24. Schritt 1 kann gestartet werden, zeigt den tatsächlichen Runner und startet Schritt 2 NICHT automatisch", async () => {
    fetchCalls.length = 0;
    await ui.startChainStep(chainId, 1);
    const call = fetchCalls.find((entry) => entry.url.includes("start-chain-step"));
    assert.ok(call);
    assert.strictEqual(call.body.chainStep, 1);
    const html = diagnosticsHtml();
    assert.match(html, /Tats\u00e4chlicher Runner: CODEX_READ_ONLY/);
    assert.match(html, /executionRunId: pilot-agent-run-chain-test-1/);
    assert.match(html, /Testbefund Schritt 1/);
    assert.match(html, /Dateiauswahl dieser Kette \(f\u00fcr alle drei Stufen fixiert\)/);
    assert.match(html, /Kernauftrag:/);
    assert.match(html, /Tats\u00e4chlich verwendete Dateien:/);
    // Schritt 2 wurde technisch vorbereitet (currentStep=2), aber NICHT
    // automatisch gestartet oder freigegeben.
    const step2RequestMatch = html.match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${chainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2RequestMatch && !step2RequestMatch[0].includes("disabled"), "Freigabe für Schritt 2 ist jetzt möglich");
    const step2StartMatch = html.match(new RegExp(`data-action="start-chain-step" data-chain-id="${chainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2StartMatch && step2StartMatch[0].includes("disabled"), "Schritt 2 darf ohne eigene Freigabe nicht gestartet sein");
    assert.doesNotMatch(html, /Testdokumentation Schritt 2/, "Schritt 2 darf nicht automatisch gelaufen sein");
  });

  await check("Codex nicht verfügbar deaktiviert die Freigabeanforderung für die nächste Stufe", async () => {
    backend.setCodexAvailability(false, false);
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    const step2RequestMatch = html.match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${chainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2RequestMatch && step2RequestMatch[0].includes("disabled"), "ohne verfügbaren/authentifizierten Codex darf keine Freigabe angefordert werden können");
    backend.setCodexAvailability(true, true);
    await ui.reloadSelectedOrder();
  });

  await check("48. ein fehlgeschlagener Kettenschritt wird sichtbar und blockiert automatisch keinen Folgeschritt", async () => {
    await ui.requestChainStepApproval(chainId, 2);
    backend.setNextStepOutcome("FAILED");
    await ui.startChainStep(chainId, 2);
    const html = diagnosticsHtml();
    assert.match(html, /Diese Kette ist fehlgeschlagen und wird nicht automatisch fortgesetzt/);
    assert.match(html, /Dieser Kettenschritt ist fehlgeschlagen/);
    // Keine Schaltfläche irgendeiner Stufe darf jetzt noch aktiv sein.
    assert.doesNotMatch(html, /data-action="request-chain-step-approval"[^>]*(?<!disabled)>/);
    backend.setNextStepOutcome("SUCCEEDED");
  });

  let warningChainId;
  await check("V7.8.0: bei pendingPredecessorTooLarge zeigt die UI Warnung mit Ist/Max und deaktiviert Freigabe+Start für die betroffene Stufe", async () => {
    await ui.prepareAgentChain();
    const currentState = ui.getState();
    const chains = currentState.overview.agentChains;
    warningChainId = chains[chains.length - 1].id;
    await ui.requestChainStepApproval(warningChainId, 1);
    await ui.startChainStep(warningChainId, 1);
    backend.setPendingPredecessorTooLarge(warningChainId, 2, 6123);
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    assert.match(html, /Vorg\u00e4nger\u00fcbergabe zu lang \(6123 von maximal 6000 Zeichen\)/);
    const step2RequestMatch = html.match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${warningChainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2RequestMatch && step2RequestMatch[0].includes("disabled"), "Freigabe für den zu langen Folgeschritt muss deaktiviert sein");
    const step2StartMatch = html.match(new RegExp(`data-action="start-chain-step" data-chain-id="${warningChainId}" data-chain-step="2"[^>]*`));
    assert.ok(step2StartMatch && step2StartMatch[0].includes("disabled"), "Start für den zu langen Folgeschritt muss deaktiviert sein");
  });

  await check("V7.8.0: Altkette zeigt ehrliche Hinweise statt erfundener fixer Dateiauswahl/Kernauftrag", async () => {
    backend.markChainAsLegacy(warningChainId);
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    assert.match(html, /Altkette ohne fixierte Dateiauswahl - je Stufe gelten die Preset-Dateien/);
    assert.match(html, /Kernauftrag f\u00fcr diese Altkette nicht mitgef\u00fchrt/);
  });

  // -------------------------------------------------------------------
  // Eine zweite, frische Kette bis COMPLETED durchlaufen: die erste Kette
  // oben ist nach dem simulierten Fehlschlag in Schritt 2 bewusst FAILED
  // liegen geblieben (siehe Auftrag "kein Fehler darf... einen falschen
  // COMPLETED-Status erzeugen") und eignet sich deshalb nicht mehr, um das
  // PM-Gesamturteil nach einem vollständigen, erfolgreichen Durchlauf zu
  // zeigen.
  // -------------------------------------------------------------------
  let secondChainId;
  await check("41./42. eine zweite Kette kann unabhängig von der ersten (blockierten) Kette vollständig bis COMPLETED durchlaufen werden", async () => {
    await ui.prepareAgentChain();
    const state = ui.getState();
    const chains = state.overview.agentChains;
    secondChainId = chains[chains.length - 1].id;
    for (let stepNumber = 1; stepNumber <= 3; stepNumber += 1) {
      await ui.requestChainStepApproval(secondChainId, stepNumber);
      await ui.startChainStep(secondChainId, stepNumber);
    }
    const finalState = ui.getState();
    const secondChain = finalState.overview.agentChains.find((chain) => chain.id === secondChainId);
    assert.strictEqual(secondChain.chainStatus, "COMPLETED");
    const executionRunIds = secondChain.steps.map((step) => step.executionRunId);
    assert.strictEqual(new Set(executionRunIds).size, 3, "alle drei Stufen zeigen unterschiedliche executionRunIds");
  });

  await check("PM-Gesamturteil ist nach vollständigem Abschluss sichtbar", async () => {
    const html = diagnosticsHtml();
    const cardHtml = orderHtml();
    assert.match(html, /PM-Gesamturteil/);
    assert.match(html, /Gesamturteil: konsistent \(Testergebnis Schritt 3\)/);
    assert.match(html, /Vorgänger vollständig übernommen: ja/);
    assert.match(cardHtml, /Fortschritt<\/dt><dd>0 von 3 Pilotrollen mit angenommenem Ergebnis/);
    assert.match(cardHtml, /Ketten-Rollenbuchung<\/dt><dd>/);
    // Kein "gesamte Kette starten"-Button existiert und keine Stufe der
    // abgeschlossenen Kette bietet noch eine aktive Schaltfläche an.
    assert.doesNotMatch(html, /data-action="start-agent-chain"/);
  });

  // -------------------------------------------------------------------
  // V7.8.1 ("Ergebnisbudget von Kettenschritt 2 technisch erzwungen"):
  // eine regelbasierte Reduktion darf NIEMALS unbemerkt bleiben. Der
  // Hinweistext erscheint deshalb genau dann, wenn tatsächlich etwas
  // weggelassen wurde.
  // -------------------------------------------------------------------
  const COMPACTION_NOTICE =
    "Das Dokumentationsergebnis wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert " +
    "(4 Punkte, 2 Sätze weggelassen; Rohgröße 7684, gespeichert 4312 Zeichen). Keine Kürzung innerhalb eines Satzes.";

  await check("V7.8.1: bei compactionApplied=true zeigt das Cockpit die Reduktion mit Zählwerten an", async () => {
    backend.setDocumentationNormalization(secondChainId, 2, {
      contractVersion: "V7.8.1-DOC-5-SECTIONS",
      structureValid: true,
      compactionApplied: true,
      droppedItemCount: 4,
      droppedSentenceCount: 2,
      droppedIncompleteTailSentence: false,
      rawCharCount: 7684,
      normalizedCharCount: 4312,
      budgetMaxChars: 4500,
    });
    await ui.reloadSelectedOrder();
    assert.ok(diagnosticsHtml().includes(COMPACTION_NOTICE), "der Reduktionshinweis muss im Ketten-Cockpit sichtbar sein");
  });

  await check("V7.8.1: bei compactionApplied=false erscheint kein Reduktionshinweis", async () => {
    backend.setDocumentationNormalization(secondChainId, 2, {
      contractVersion: "V7.8.1-DOC-5-SECTIONS",
      structureValid: true,
      compactionApplied: false,
      droppedItemCount: 0,
      droppedSentenceCount: 0,
      droppedIncompleteTailSentence: false,
      rawCharCount: 2480,
      normalizedCharCount: 2480,
      budgetMaxChars: 4500,
    });
    await ui.reloadSelectedOrder();
    assert.ok(!diagnosticsHtml().includes("wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert"));
    assert.match(diagnosticsHtml(), /Testdokumentation Schritt 2/, "das Ergebnis selbst bleibt unverändert sichtbar");
  });

  await check("V7.8.1: ein Lauf ohne das neue Feld bleibt rückwärtskompatibel und zeigt keinen Hinweis", async () => {
    backend.setDocumentationNormalization(secondChainId, 2, null);
    await ui.reloadSelectedOrder();
    assert.ok(!diagnosticsHtml().includes("wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert"));
    assert.match(diagnosticsHtml(), /PM-Gesamturteil/, "die übrige Kettenanzeige bleibt vollständig erhalten");
  });

  console.log(`pilot-agent-execution-chain-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution-chain-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
