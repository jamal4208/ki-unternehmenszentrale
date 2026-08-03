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
// Deckungsgleich mit der serverseitigen Allowlist
// (pilot-agent-execution-service.js#CHAIN_SELECTABLE_FILES) inklusive der
// V7.9.9-Erweiterung; die Fixtur wird unten gegen die echte Konstante
// abgeglichen, damit sie nicht auseinanderlaufen kann.
const CHAIN_SELECTABLE_FILES = [
  "pilot-agent-execution-chain-service.js",
  "pilot-work-order-service.js",
  "pilot-agent-runner.js",
  "auth-db-migrations.js",
  "pilot-work-order-ui.js",
  "V1_BETRIEBSHANDBUCH.md",
  "pilot-work-order-routes.js",
];
// V7.9.9: die vom Server empfohlene, deterministische Standardvorauswahl
// für die Nutzerperspektive.
const CHAIN_RECOMMENDED_FILES = [
  "pilot-work-order-ui.js",
  "V1_BETRIEBSHANDBUCH.md",
  "pilot-work-order-service.js",
  "pilot-work-order-routes.js",
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
  let startStepMode = "IMMEDIATE";
  let deferredStart = null;
  const issuedTokens = new Map(); // token -> { chainId, chainStep }
  const pausedOrderReadCounts = new Map();
  const pausedOrderReadResolvers = new Map();

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
      chainRecommendedFiles: CHAIN_RECOMMENDED_FILES.slice(),
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

  function runningStatusFor(stepNumber) {
    return { 1: "RESEARCH_RUNNING", 2: "DOCUMENTATION_RUNNING", 3: "PM_RUNNING" }[stepNumber];
  }

  function createRunForStep(order, chain, step, predecessor, status) {
    runCounter += 1;
    const executionRunId = `pilot-agent-run-chain-test-${runCounter}`;
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
      aiExecuted: status === "SUCCEEDED" || status === "RUNNING",
      fallbackUsed: false,
      modelLabel: "Codex (ChatGPT)",
      runnerVersion: "codex-cli 0.999.0-test",
      status,
      promptDigest: "b".repeat(64),
      mandateDigest: "a".repeat(64),
      resultTruncated: false,
      resultRawText: status === "SUCCEEDED" ? RESULT_TEXT_BY_STEP[step.stepNumber] : null,
      resultSummary:
        status === "FAILED"
          ? { diagnostics: { reasonCode: "CODEX_PROCESS_EXIT_NONZERO" } }
          : {
              secretRedactionApplied: false,
              secretRedactionNotice: null,
              analyzedFiles: chain.selectedFiles.slice(),
            },
      errorMessage: status === "FAILED" ? "Simulierter technischer Codex-Fehler (Testfixtur)." : null,
      handoffStatus: status === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
      handoffErrorMessage: null,
      startedAt: nowIso(),
      finishedAt: status === "RUNNING" ? null : nowIso(),
    };
    step.executionRunId = executionRunId;
    step.chainedFromExecutionRunId = predecessor ? predecessor.executionRunId : null;
    step.predecessorCharCount = predecessor ? RESULT_TEXT_BY_STEP[step.stepNumber - 1].length : null;
    step.predecessorIncludedCharCount = predecessor ? RESULT_TEXT_BY_STEP[step.stepNumber - 1].length : null;
    step.predecessorTruncated = false;
    step.predecessorFullyIncluded = predecessor ? true : null;
    order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
    return run;
  }

  function markStepRunning(order, chain, step, predecessor) {
    const run = createRunForStep(order, chain, step, predecessor, "RUNNING");
    step.stepStatus = "RUNNING";
    step.failureReasonCode = null;
    step.approvalStatus = "GRANTED";
    chain.currentStep = step.stepNumber;
    chain.chainStatus = runningStatusFor(step.stepNumber);
    chain.revision += 1;
    return run;
  }

  function completeRunningStep(order, chain, step, outcome) {
    const run = (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId) || null;
    if (outcome === "SUCCEEDED") {
      step.stepStatus = "SUCCEEDED";
      step.failureReasonCode = null;
      step.roleHandoffBooked = true;
      step.roleHandoffBookedAt = nowIso();
      if (run) {
        run.status = "SUCCEEDED";
        run.finishedAt = nowIso();
        run.resultRawText = RESULT_TEXT_BY_STEP[step.stepNumber];
        run.errorMessage = null;
        run.resultSummary = {
          secretRedactionApplied: false,
          secretRedactionNotice: null,
          analyzedFiles: chain.selectedFiles.slice(),
        };
      }
      if (step.stepNumber < 3) {
        chain.currentStep = step.stepNumber + 1;
        chain.chainStatus = waitingStatusFor(step.stepNumber + 1);
      } else {
        chain.chainStatus = "COMPLETED";
        chain.completedAt = nowIso();
      }
      chain.revision += 1;
      return;
    }
    if (outcome === "BLOCKED") {
      step.stepStatus = "FAILED";
      step.failureReasonCode = null;
      chain.chainStatus = "BLOCKED";
      chain.blockReason = "PREDECESSOR_CONTEXT_TOO_LARGE";
      if (run) {
        run.status = "FAILED";
        run.finishedAt = nowIso();
        run.errorMessage = "Simulierter blockierter Lauf (Testfixtur).";
        run.resultSummary = { diagnostics: { reasonCode: "PREDECESSOR_CONTEXT_TOO_LARGE" } };
      }
      chain.revision += 1;
      return;
    }
    // Default: FAILED.
    // V7.9.4 ("Konkrete Fehlerursache in der Kettenfehlerkarte sichtbar
    // machen"): der reale, reguläre Fehlerpfad (finalizeChainStepFailure in
    // pilot-agent-execution-chain-service.js) schreibt auf step.
    // failureReasonCode bei einem Ausführungsfehler mit vorhandenem Run
    // IMMER ausschließlich den Sammelcode STEP_EXECUTION_FAILED – NIEMALS
    // direkt den präziseren Runner-/Adaptercode. Dieser lebt ausschließlich
    // in run.resultSummary.diagnostics.reasonCode. Die Fixtur tat zuvor so,
    // als würde step.failureReasonCode bereits den präzisen Code enthalten,
    // was das eigentliche V7.9.4-Problem (Sammelcode verdeckt präzisen
    // Runcode) in Tests unsichtbar gemacht hätte.
    step.stepStatus = "FAILED";
    step.failureReasonCode = "STEP_EXECUTION_FAILED";
    chain.chainStatus = "FAILED";
    if (run) {
      run.status = "FAILED";
      run.finishedAt = nowIso();
      run.errorMessage = "Simulierter technischer Codex-Fehler (Testfixtur).";
      run.resultSummary = { diagnostics: { reasonCode: "CODEX_PROCESS_EXIT_NONZERO" } };
    }
    chain.revision += 1;
  }

  function finalizeImmediateStep(order, chain, step, predecessor, outcome) {
    if (outcome === "FAILED") {
      // Kein Run wird hier erzeugt (siehe unten) – realistisch entspricht das
      // dem Sammelcode STEP_EXECUTION_FAILED, niemals einem präzisen
      // Runner-/Adaptercode ohne zugehörigen Run.
      step.stepStatus = "FAILED";
      step.failureReasonCode = "STEP_EXECUTION_FAILED";
      chain.chainStatus = "FAILED";
      chain.revision += 1;
      return;
    }
    createRunForStep(order, chain, step, predecessor, "SUCCEEDED");
    step.stepStatus = "SUCCEEDED";
    step.failureReasonCode = null;
    step.roleHandoffBooked = true;
    step.roleHandoffBookedAt = nowIso();
    if (step.stepNumber < 3) {
      chain.currentStep = step.stepNumber + 1;
      chain.chainStatus = waitingStatusFor(step.stepNumber + 1);
    } else {
      chain.chainStatus = "COMPLETED";
      chain.completedAt = nowIso();
    }
    chain.revision += 1;
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
      if (startStepMode === "IMMEDIATE") {
        finalizeImmediateStep(order, chain, step, predecessor, nextStepOutcome);
        return respond(200, { ok: true, chain, overview: overviewFor(order) });
      }
      markStepRunning(order, chain, step, predecessor);
      if (startStepMode === "REJECT_AFTER_RUNNING") {
        return Promise.reject(new Error("Simulierter Verbindungsabbruch während start-chain-step (Testfixtur)."));
      }
      return new Promise((resolve) => {
        deferredStart = {
          order,
          chain,
          step,
          resolve,
          outcome:
            startStepMode === "DEFERRED_FAILED"
              ? "FAILED"
              : startStepMode === "DEFERRED_BLOCKED"
                ? "BLOCKED"
                : "SUCCEEDED",
        };
      });
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
      const orderId = decodeURIComponent(getMatch[1]);
      const pauseCount = pausedOrderReadCounts.get(orderId) || 0;
      if (pauseCount > 0) {
        pausedOrderReadCounts.set(orderId, pauseCount - 1);
        return new Promise((resolve) => {
          const queue = pausedOrderReadResolvers.get(orderId) || [];
          queue.push(resolve);
          pausedOrderReadResolvers.set(orderId, queue);
        });
      }
      const order = orders.get(orderId);
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
    createOrder: (id, overrides) => {
      const order = baseOrder(id, overrides || {});
      orders.set(id, order);
      return order;
    },
    setCodexAvailability: (available, authenticated) => {
      codexAvailable = available;
      codexAuthenticated = authenticated;
    },
    setNextStepOutcome: (value) => {
      nextStepOutcome = value;
    },
    setStartStepMode: (mode) => {
      startStepMode = mode;
    },
    resolveDeferredStart: (forcedOutcome) => {
      if (!deferredStart) return;
      const pending = deferredStart;
      deferredStart = null;
      completeRunningStep(pending.order, pending.chain, pending.step, forcedOutcome || pending.outcome || "SUCCEEDED");
      pending.resolve(respond(200, { ok: true, chain: pending.chain, overview: overviewFor(pending.order) }));
    },
    completeRunningStep: (chainId, stepNumber, outcome) => {
      for (const order of orders.values()) {
        const chain = findChain(order, chainId);
        if (!chain) continue;
        const step = findStep(chain, stepNumber);
        if (!step) return;
        completeRunningStep(order, chain, step, outcome || "SUCCEEDED");
        return;
      }
    },
    pauseNextOrderRead: (orderId, count = 1) => {
      pausedOrderReadCounts.set(orderId, count);
    },
    releasePausedOrderRead: (orderId) => {
      const queue = pausedOrderReadResolvers.get(orderId) || [];
      if (queue.length === 0) return;
      const resolve = queue.shift();
      pausedOrderReadResolvers.set(orderId, queue);
      const order = orders.get(orderId);
      if (!order) {
        resolve(respond(404, { ok: false, message: "Nicht gefunden." }));
        return;
      }
      resolve(respond(200, { ok: true, overview: overviewFor(order) }));
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
    // V7.9.8: derselbe Zugriff auf das stufenneutrale Feld `resultNormalization`,
    // das jetzt für alle drei Stufen geschrieben wird.
    setResultNormalization: (chainId, stepNumber, normalization) => {
      const order = orders.get(CANONICAL_ID);
      const chain = findChain(order, chainId);
      if (!chain) return;
      const step = findStep(chain, stepNumber);
      if (!step || !step.executionRunId) return;
      const run = (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId);
      if (!run) return;
      if (normalization === null) {
        delete run.resultSummary.resultNormalization;
      } else {
        run.resultSummary.resultNormalization = normalization;
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
let forcedOrderReadFailureCount = 0;

function createTimerHarness() {
  let now = Date.parse("2026-07-31T14:00:00.000Z");
  let idCounter = 0;
  const timers = new Map();

  function runDueTimers() {
    let ran = true;
    while (ran) {
      ran = false;
      const dueEntries = Array.from(timers.entries())
        .filter(([, timer]) => timer.dueAt <= now)
        .sort((a, b) => a[1].dueAt - b[1].dueAt || a[0] - b[0]);
      if (dueEntries.length === 0) continue;
      ran = true;
      dueEntries.forEach(([id, timer]) => {
        if (!timers.has(id)) return;
        timers.delete(id);
        timer.callback();
      });
    }
  }

  return {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      idCounter += 1;
      timers.set(idCounter, { callback, dueAt: now + (delayMs || 0), delayMs: delayMs || 0 });
      return idCounter;
    },
    clearTimeout: (timerId) => {
      timers.delete(timerId);
    },
    advanceBy: (ms) => {
      now += ms;
      runDueTimers();
    },
    pendingCount: () => timers.size,
    clearAll: () => {
      timers.clear();
    },
  };
}

const timerHarness = createTimerHarness();
let formatterCallCount = 0;
const testClockFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

global.fetch = (url, opts) => {
  const method = (opts && opts.method) || "GET";
  fetchCalls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  if (forcedOrderReadFailureCount > 0 && method === "GET" && /^\/api\/pilot-work-order\/orders\/[^/]+$/.test(url)) {
    forcedOrderReadFailureCount -= 1;
    return Promise.reject(new Error("Simulierter Polling-Fehler (Testfixtur)."));
  }
  return backend.handle(url, opts);
};

const ui = require("./pilot-work-order-ui.js");
ui.setStatusTimeHooksForTests({
  now: () => timerHarness.now(),
  setTimeout: (callback, delayMs) => timerHarness.setTimeout(callback, delayMs),
  clearTimeout: (timerId) => timerHarness.clearTimeout(timerId),
  createTimeFormatter: () => ({
    format: (date) => {
      formatterCallCount += 1;
      return testClockFormatter.format(date);
    },
  }),
});

async function flushAsyncState() {
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceTimeAndFlush(ms) {
  timerHarness.advanceBy(ms);
  await flushAsyncState();
}

function diagnosticsHtml() {
  return domElements["pilot-work-order-diagnostics-output"].innerHTML;
}

function orderHtml() {
  return domElements["pilot-work-order-output"].innerHTML;
}

function statusCardHtml() {
  const match = orderHtml().match(/<section class="pilot-chain-status-card[\s\S]*?<\/section>/);
  return match ? match[0] : "";
}

function diagnosticsStatusCardHtml() {
  const match = diagnosticsHtml().match(/<section class="pilot-chain-status-card[\s\S]*?<\/section>/);
  return match ? match[0] : "";
}

function enabledButtonCountInStatusCard() {
  const card = statusCardHtml();
  const matches = card.match(/<button\b(?![^>]*disabled)[^>]*>/g);
  return matches ? matches.length : 0;
}

function newestChainId() {
  const chains = ui.getState().overview.agentChains || [];
  return chains.length > 0 ? chains[chains.length - 1].id : null;
}

async function run() {
  await ui.getInitPromise();

  await check("keine Agentenkette vor der ersten Vorbereitung sichtbar (kein automatischer Start)", async () => {
    assert.match(diagnosticsHtml(), /Noch keine Agentenkette vorbereitet/);
    assert.match(diagnosticsHtml(), /data-action="prepare-agent-chain"/);
    assert.doesNotMatch(diagnosticsHtml(), /data-action="prepare-agent-chain" disabled/);
    assert.match(diagnosticsHtml(), /Jamal legt die Dateiauswahl hier einmal f\u00fcr alle drei Stufen fest/);
  });

  await check("V7.9.9-K: das Cockpit zeigt alle serverseitig auswählbaren Dateien und wählt genau die vier empfohlenen Nutzerperspektiv-Dateien deterministisch vor", async () => {
    // Die Fixtur oben muss der echten serverseitigen Quelle der Wahrheit
    // entsprechen – sonst prüft dieser Test eine Fiktion.
    const agentExecutionService = require("./pilot-agent-execution-service");
    assert.deepStrictEqual(agentExecutionService.CHAIN_SELECTABLE_FILES.slice(), CHAIN_SELECTABLE_FILES);
    assert.deepStrictEqual(agentExecutionService.CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES.slice(), CHAIN_RECOMMENDED_FILES);

    const html = diagnosticsHtml();
    CHAIN_SELECTABLE_FILES.forEach((filePath) => {
      assert.ok(
        html.includes('data-action="toggle-chain-selected-file" data-file-path="' + filePath + '"'),
        `${filePath} muss im Cockpit auswählbar angezeigt werden`,
      );
    });
    // Genau die vier empfohlenen Dateien sind vorausgewählt (checked),
    // die drei übrigen ausdrücklich nicht.
    CHAIN_SELECTABLE_FILES.forEach((filePath) => {
      const checkboxMatch = html.match(new RegExp('<input type="checkbox" data-action="toggle-chain-selected-file" data-file-path="' + filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*'));
      assert.ok(checkboxMatch, `Checkbox für ${filePath} muss vorhanden sein`);
      const isChecked = checkboxMatch[0].includes(" checked");
      assert.strictEqual(isChecked, CHAIN_RECOMMENDED_FILES.indexOf(filePath) !== -1, `Vorauswahl von ${filePath} ist nicht wie erwartet`);
    });
    assert.deepStrictEqual(ui.getState().chainSelectedFiles, CHAIN_RECOMMENDED_FILES);
    // Nachvollziehbare Erklärung im Cockpit, keine stille Vorauswahl.
    assert.match(html, /Vorausgew\u00e4hlt sind die f\u00fcr die Nutzerperspektive empfohlenen Dateien/);
    assert.match(html, /empfohlen f\u00fcr die Nutzerperspektive/);
    assert.match(html, /Die Auswahl ist frei \u00e4nderbar; die Liste selbst ist serverseitig geschlossen/);
    // Keine freie Pfadeingabe im Cockpit: ausschließlich Checkboxen aus der
    // Serverliste, kein Text-/Datei-Eingabefeld für Pfade.
    const selectionBlock = html.match(/<div class="pilot-chain-file-selection">[\s\S]*?<\/div>/);
    assert.ok(selectionBlock, "der Auswahlblock muss vorhanden sein");
    assert.doesNotMatch(selectionBlock[0], /<input(?![^>]*type="checkbox")/);
    assert.doesNotMatch(selectionBlock[0], /<textarea|<select/);
  });

  await check("V7.9.9-L: weder die Standardvorauswahl noch ein Klick auf eine Datei löst einen POST zum Vorbereiten, Freigeben oder Starten aus", async () => {
    fetchCalls.length = 0;
    // Erneutes Rendern mit aktiver Standardvorauswahl: kein Request.
    ui.render();
    assert.deepStrictEqual(fetchCalls, [], "die Standardvorauswahl darf keinen Request auslösen");

    // Ein Klick auf eine bisher nicht ausgewählte Datei ändert nur den
    // lokalen Zustand.
    ui.toggleChainSelectedFile("pilot-agent-runner.js", true);
    assert.ok(ui.getState().chainSelectedFiles.indexOf("pilot-agent-runner.js") !== -1);
    // Und ein Klick zum Abwählen ebenso.
    ui.toggleChainSelectedFile("pilot-agent-runner.js", false);
    assert.strictEqual(ui.getState().chainSelectedFiles.indexOf("pilot-agent-runner.js"), -1);
    // Ein nicht auswählbarer Pfad wird auch lokal ignoriert (kein
    // clientseitig frei bestimmbarer Dateipfad).
    ui.toggleChainSelectedFile("../secret.txt", true);
    ui.toggleChainSelectedFile(".env", true);
    // Die Auswahl enthält wieder genau die vier empfohlenen Dateien. Die
    // Reihenfolge wird durch das bestehende V7.8.0-Verhalten auf die
    // Allowlist-Reihenfolge normalisiert (kein clientseitig frei
    // bestimmbarer Pfad und keine Dublette gelangen hinein).
    assert.deepStrictEqual(
      ui.getState().chainSelectedFiles.slice().sort(),
      CHAIN_RECOMMENDED_FILES.slice().sort(),
    );
    assert.deepStrictEqual(
      ui.getState().chainSelectedFiles,
      CHAIN_SELECTABLE_FILES.filter(function (entry) {
        return CHAIN_RECOMMENDED_FILES.indexOf(entry) !== -1;
      }),
    );

    assert.deepStrictEqual(
      fetchCalls.filter((entry) => entry.method === "POST").map((entry) => entry.url),
      [],
      "kein Klick auf eine Datei darf einen POST auslösen",
    );
    ["prepare-agent-chain", "request-chain-step-approval", "start-chain-step", "approve", "start-agent-execution"].forEach((fragment) => {
      assert.strictEqual(
        fetchCalls.filter((entry) => entry.url.includes(fragment)).length,
        0,
        `${fragment} darf durch eine Dateiauswahl nicht aufgerufen werden`,
      );
    });
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

  // -------------------------------------------------------------------
  // V7.9.8 ("Ergebnisbudget für Recherche- und Projektmanager-Stufe
  // technisch erzwingen"): derselbe Hinweis muss für ALLE DREI Stufen
  // funktionieren und die jeweilige Stufe korrekt benennen.
  // -------------------------------------------------------------------
  await check("V7.9.8: der Reduktionshinweis benennt die Recherchestufe und zeigt Roh- sowie gespeicherte Größe", async () => {
    backend.setResultNormalization(secondChainId, 1, {
      contractStage: "RESEARCH",
      contractVersion: "V7.9.8-RESEARCH-5-SECTIONS",
      structureValid: true,
      compactionApplied: true,
      droppedItemCount: 3,
      droppedSentenceCount: 1,
      droppedIncompleteTailSentence: false,
      rawCharCount: 7584,
      storedCharCount: 4288,
      normalizedCharCount: 4288,
      budgetMaxChars: 4500,
    });
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    assert.ok(
      html.includes(
        "Das Rechercheergebnis wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert " +
          "(3 Punkte, 1 Sätze weggelassen; Rohgröße 7584, gespeichert 4288 Zeichen). Keine Kürzung innerhalb eines Satzes.",
      ),
      "der Reduktionshinweis der Recherchestufe muss sichtbar sein",
    );
    // Keine Rohantwort, kein abgeschnittener Inhalt, keine technischen Interna
    // auf der ersten Ebene.
    assert.ok(!html.includes("V7.9.8-RESEARCH-5-SECTIONS"), "die Vertragsversion ist ein technisches Internum und bleibt unsichtbar");
    assert.ok(!html.includes("budgetMaxChars"), "keine technischen Feldnamen in der Anzeige");
  });

  await check("V7.9.8: der Reduktionshinweis benennt die Projektmanagerstufe", async () => {
    backend.setResultNormalization(secondChainId, 3, {
      contractStage: "PROJECT_MANAGER",
      contractVersion: "V7.9.8-PM-5-SECTIONS",
      structureValid: true,
      compactionApplied: true,
      droppedItemCount: 2,
      droppedSentenceCount: 0,
      droppedIncompleteTailSentence: false,
      rawCharCount: 6002,
      storedCharCount: 4106,
      normalizedCharCount: 4106,
      budgetMaxChars: 4500,
    });
    await ui.reloadSelectedOrder();
    assert.ok(
      diagnosticsHtml().includes(
        "Das Projektmanager-Ergebnis wurde regelbasiert auf die verbindliche Ergebnisgröße reduziert " +
          "(2 Punkte, 0 Sätze weggelassen; Rohgröße 6002, gespeichert 4106 Zeichen). Keine Kürzung innerhalb eines Satzes.",
      ),
      "der Reduktionshinweis der PM-Stufe muss sichtbar sein",
    );
  });

  await check("V7.9.8: ohne Verdichtung erscheint in den neuen Stufen kein Hinweis; ältere Läufe ohne das neue Feld bleiben lesbar", async () => {
    backend.setResultNormalization(secondChainId, 1, {
      contractStage: "RESEARCH",
      contractVersion: "V7.9.8-RESEARCH-5-SECTIONS",
      structureValid: true,
      compactionApplied: false,
      droppedItemCount: 0,
      droppedSentenceCount: 0,
      droppedIncompleteTailSentence: false,
      rawCharCount: 2480,
      storedCharCount: 2480,
      normalizedCharCount: 2480,
      budgetMaxChars: 4500,
    });
    backend.setResultNormalization(secondChainId, 3, null);
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    assert.ok(!html.includes("Das Rechercheergebnis wurde regelbasiert"), "ohne Verdichtung darf kein Hinweis erscheinen");
    assert.ok(!html.includes("Das Projektmanager-Ergebnis wurde regelbasiert"), "ein Lauf ohne das Feld bleibt hinweisfrei");
    assert.match(html, /PM-Gesamturteil/, "die übrige Kettenanzeige bleibt vollständig erhalten");
  });

  await check("V7.9.8: ein älterer Dokumentationslauf ohne contractStage behält seinen bisherigen Wortlaut", async () => {
    backend.setResultNormalization(secondChainId, 1, null);
    // Genau die Metadatenform von vor V7.9.8: kein contractStage, kein
    // storedCharCount, ausschließlich documentationNormalization.
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
    assert.ok(diagnosticsHtml().includes(COMPACTION_NOTICE), "der V7.8.1-Wortlaut muss unverändert erscheinen");
    backend.setDocumentationNormalization(secondChainId, 2, null);
    await ui.reloadSelectedOrder();
  });

  // -------------------------------------------------------------------
  // V7.9.0 – Intuitiver Arbeitsfluss und sichtbarer Agentenstatus:
  // lokale Startanzeige, serverautoritärer Running-Status, kontrolliertes
  // Polling, sauberes Entsperren bei Fehlern und klare Fehlertexte.
  // -------------------------------------------------------------------
  let v79OrderId;
  let v79ChainA;
  let v79ChainB;
  let v79StartPromise;

  await check("V7.9 setup: eigener IN_EXECUTION-Auftrag mit zwei Ketten", async () => {
    ui.stopStatusPolling("test-setup");
    timerHarness.clearAll();
    v79OrderId = "pilot-order-v79-main";
    backend.createOrder(v79OrderId, {
      title: "V7.9 Testauftrag",
      status: "IN_EXECUTION",
      statusLabel: "In Ausführung",
      revision: 0,
      agentChains: [],
      agentExecutionRuns: [],
    });
    await ui.selectOrder(v79OrderId);
    await ui.prepareAgentChain();
    v79ChainA = newestChainId();
    await ui.prepareAgentChain();
    v79ChainB = newestChainId();
    assert.ok(v79ChainA && v79ChainB && v79ChainA !== v79ChainB);
  });

  await check("V7.9-22: Anfragekörper von Freigabe- und Startaktion bleiben unverändert", async () => {
    fetchCalls.length = 0;
    await ui.requestChainStepApproval(v79ChainA, 1);
    const approvalCall = fetchCalls.find((entry) => entry.url.includes("request-chain-step-approval"));
    assert.ok(approvalCall);
    assert.deepStrictEqual(approvalCall.body, { chainId: v79ChainA, chainStep: 1 });
  });

  await check("V7.9-1/2/3/4/5/20: Start-Zwischenzustand sofort sichtbar, alle Ketten gesperrt, Polling startet einmalig per GET", async () => {
    backend.setStartStepMode("DEFERRED_SUCCESS");
    fetchCalls.length = 0;
    formatterCallCount = 0;
    forcedOrderReadFailureCount = 0;
    timerHarness.clearAll();

    v79StartPromise = ui.startChainStep(v79ChainA, 1);
    const localStartCardTop = orderHtml();
    const localStartCardBottom = diagnosticsStatusCardHtml();
    assert.match(localStartCardTop, /pilot-chain-status-card--running/);
    assert.match(localStartCardBottom, /pilot-chain-status-card--running/);
    assert.match(localStartCardTop, /Start wurde angenommen\. Der Agent wird gestartet\./);
    assert.match(localStartCardTop, /Die serverseitige Bestätigung wird automatisch geprüft\./);
    assert.match(localStartCardTop, /Bitte nicht erneut klicken\./);
    assert.match(localStartCardTop, /Start angefordert vor /);
    assert.doesNotMatch(localStartCardTop, /Schritt 1 wird gerade ausgeführt\./);
    assert.match(localStartCardBottom, /Start wurde angenommen\. Der Agent wird gestartet\./);
    assert.match(localStartCardBottom, /Die serverseitige Bestätigung wird automatisch geprüft\./);
    assert.match(localStartCardBottom, /Bitte nicht erneut klicken\./);
    assert.doesNotMatch(localStartCardBottom, /Schritt 1 wird gerade ausgeführt\./);

    const stepARequest = diagnosticsHtml().match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${v79ChainA}" data-chain-step="1"[^>]*`));
    const stepAStart = diagnosticsHtml().match(new RegExp(`data-action="start-chain-step" data-chain-id="${v79ChainA}" data-chain-step="1"[^>]*`));
    const stepBRequest = diagnosticsHtml().match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${v79ChainB}" data-chain-step="1"[^>]*`));
    const stepBStart = diagnosticsHtml().match(new RegExp(`data-action="start-chain-step" data-chain-id="${v79ChainB}" data-chain-step="1"[^>]*`));
    assert.ok(stepARequest && stepARequest[0].includes("disabled"));
    assert.ok(stepAStart && stepAStart[0].includes("disabled"));
    assert.ok(stepBRequest && stepBRequest[0].includes("disabled"));
    assert.ok(stepBStart && stepBStart[0].includes("disabled"));

    await flushAsyncState();
    assert.match(orderHtml(), /Start wurde angenommen\. Der Agent wird gestartet\./);
    assert.match(orderHtml(), /Die serverseitige Bestätigung wird automatisch geprüft\./);
    assert.match(orderHtml(), /Bitte nicht erneut klicken\./);
    assert.doesNotMatch(orderHtml(), /Schritt 1 wird gerade ausgeführt\./);

    const startCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step"));
    assert.strictEqual(startCalls.length, 1);
    assert.deepStrictEqual(Object.keys(startCalls[0].body).sort(), ["approvalToken", "chainId", "chainStep"]);
    assert.strictEqual(ui.getStatusPollingState().active, true);
    assert.ok(timerHarness.pendingCount() <= 1, "es darf nur ein Poller gleichzeitig geplant sein");

    await advanceTimeAndFlush(5000);
    assert.match(orderHtml(), /Schritt 1 wird gerade ausgeführt\./);
    assert.match(orderHtml(), /Codex arbeitet ausschließlich lesend\./);
    assert.match(orderHtml(), /Gestartet um \d{2}:\d{2} Uhr\./);
    assert.match(orderHtml(), /Läuft seit /);
    assert.match(orderHtml(), /Typische Dauer: 1-3 Minuten\./);
    assert.match(orderHtml(), /pilot-chain-status-card--running/);
    assert.match(diagnosticsStatusCardHtml(), /pilot-chain-status-card--running/);
    assert.ok(formatterCallCount > 0, "die Anzeige muss den Browser-Zeitformatierer verwenden");
    const pollGetCalls = fetchCalls.filter((entry) => entry.method === "GET" && entry.url === `/api/pilot-work-order/orders/${v79OrderId}`);
    const unexpectedPosts = fetchCalls.filter((entry) => entry.method === "POST" && !entry.url.includes("start-chain-step"));
    assert.ok(pollGetCalls.length >= 1, "Polling muss den bestehenden GET-Endpunkt verwenden");
    assert.strictEqual(unexpectedPosts.length, 0, "Polling darf keinen POST erzeugen");
  });

  await check("V7.9.1-2: RUNNING-Laufzeit bleibt ohne lokale Bridge sichtbar, wenn activeStep.startedAt vorliegt", async () => {
    const order = backend.orders.get(v79OrderId);
    const chain = (order.agentChains || []).find((entry) => entry.id === v79ChainA);
    const step = chain && chain.steps ? chain.steps.find((entry) => entry.stepNumber === 1) : null;
    const run = step ? (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId) : null;
    assert.ok(chain && step && run, "Testfixtur: laufender Schritt muss vorhanden sein");
    step.startedAt = "2026-07-31T13:58:00.000Z";
    run.startedAt = null;
    ui.getState().chainStartBridge = null;
    await ui.reloadSelectedOrder();
    assert.strictEqual(ui.getState().chainStartBridge, null);
    assert.match(orderHtml(), /Gestartet um \d{2}:\d{2} Uhr\./);
    assert.match(orderHtml(), /Läuft seit /);
    assert.match(orderHtml(), /pilot-chain-status-card--running/);
    assert.match(diagnosticsStatusCardHtml(), /Gestartet um \d{2}:\d{2} Uhr\./);
    assert.match(diagnosticsStatusCardHtml(), /Läuft seit /);
    assert.match(diagnosticsStatusCardHtml(), /pilot-chain-status-card--running/);
  });

  await check("V7.9-6/11/12/13: Polling stoppt bei Erfolg, zeigt nächsten Schritt und startet nichts automatisch", async () => {
    backend.resolveDeferredStart("SUCCEEDED");
    await v79StartPromise;
    await flushAsyncState();
    assert.strictEqual(ui.getStatusPollingState().active, false);
    assert.match(orderHtml(), /Schritt 1 erfolgreich abgeschlossen\./);
    assert.match(orderHtml(), /Schritt 2 kann jetzt freigegeben werden\./);
    assert.match(orderHtml(), /Es wurde nichts automatisch weitergestartet\./);
    assert.ok(enabledButtonCountInStatusCard() <= 1, "oben darf höchstens eine aktive Hauptschaltfläche stehen");
    const autoApprovalCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("request-chain-step-approval") && entry.body.chainStep === 2);
    const autoStartCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step") && entry.body.chainStep === 2);
    assert.strictEqual(autoApprovalCalls.length, 0, "keine automatische Freigabe");
    assert.strictEqual(autoStartCalls.length, 0, "kein automatischer Folgestart");
  });

  await check("V7.9-7/18/19: Polling stoppt bei Fehler, Fehlercode wird verständlich gemappt, technischer Code nur in Details", async () => {
    fetchCalls.length = 0;
    await ui.requestChainStepApproval(v79ChainA, 2);
    backend.setStartStepMode("DEFERRED_FAILED");
    const failingStart = ui.startChainStep(v79ChainA, 2);
    await flushAsyncState();
    backend.resolveDeferredStart("FAILED");
    await failingStart;
    await flushAsyncState();
    assert.strictEqual(ui.getStatusPollingState().active, false);
    assert.match(orderHtml(), /Der Kettenschritt ist fehlgeschlagen\./);
    assert.match(orderHtml(), /Der Codex-Prozess wurde mit einem Fehler beendet\./);
    assert.match(orderHtml(), /Bitte technische Details prüfen und den Schritt bewusst neu starten\./);
    assert.match(orderHtml(), /Technische Details/);
    const htmlWithoutDetails = orderHtml().replace(/<details[\s\S]*?<\/details>/g, "");
    assert.doesNotMatch(htmlWithoutDetails, /CODEX_PROCESS_EXIT_NONZERO/);
  });

  await check("V7.9-8: Polling stoppt bei Blockade und zeigt blockierten Zustand verständlich", async () => {
    fetchCalls.length = 0;
    await ui.requestChainStepApproval(v79ChainB, 1);
    backend.setStartStepMode("DEFERRED_BLOCKED");
    const blockedStart = ui.startChainStep(v79ChainB, 1);
    await flushAsyncState();
    backend.resolveDeferredStart("BLOCKED");
    await blockedStart;
    await flushAsyncState();
    assert.strictEqual(ui.getStatusPollingState().active, false);
    assert.match(orderHtml(), /Die Kette ist blockiert\./);
    assert.match(orderHtml(), /Die Vorgängerübergabe war für den nächsten Schritt zu groß\./);
  });

  await check("V7.9-9: Auftragswechsel beendet laufendes Polling", async () => {
    const switchOrderA = "pilot-order-v79-switch-a";
    const switchOrderB = "pilot-order-v79-switch-b";
    backend.createOrder(switchOrderA, { title: "V7.9 Switch A", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    backend.createOrder(switchOrderB, { title: "V7.9 Switch B", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    await ui.selectOrder(switchOrderA);
    await ui.prepareAgentChain();
    const switchChain = newestChainId();
    await ui.requestChainStepApproval(switchChain, 1);
    backend.setStartStepMode("DEFERRED_SUCCESS");
    const pendingSwitchStart = ui.startChainStep(switchChain, 1);
    await flushAsyncState();
    assert.strictEqual(ui.getStatusPollingState().active, true);
    await ui.selectOrder(switchOrderB);
    assert.strictEqual(ui.getStatusPollingState().active, false);
    backend.resolveDeferredStart("SUCCEEDED");
    await pendingSwitchStart;
    await flushAsyncState();
  });

  await check("V7.9-10: verspätete Antwort des alten Auftrags überschreibt den neuen Auftragsstand nicht", async () => {
    const delayedOrderA = "pilot-order-v79-delay-a";
    const delayedOrderB = "pilot-order-v79-delay-b";
    backend.createOrder(delayedOrderA, { title: "V7.9 Verzögert A", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    backend.createOrder(delayedOrderB, { title: "V7.9 Verzögert B", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    backend.pauseNextOrderRead(delayedOrderA, 1);
    const delayedSelectPromise = ui.selectOrder(delayedOrderA);
    await flushAsyncState();
    await ui.selectOrder(delayedOrderB);
    backend.releasePausedOrderRead(delayedOrderA);
    await delayedSelectPromise;
    await flushAsyncState();
    assert.strictEqual(ui.getState().selectedPilotOrderId, delayedOrderB);
    assert.match(orderHtml(), /V7\.9 Verzögert B/);
    assert.doesNotMatch(orderHtml(), /V7\.9 Verzögert A/);
  });

  await check("V7.9-14/15/16/21: Verbindungsabbruch entsperrt sauber, wiederholt keinen POST, zeigt Hinweis und RUNNING bleibt nach Reload sichtbar", async () => {
    const disconnectOrderId = "pilot-order-v79-disconnect";
    backend.createOrder(disconnectOrderId, { title: "V7.9 Verbindungsabbruch", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    await ui.selectOrder(disconnectOrderId);
    await ui.prepareAgentChain();
    const disconnectChainId = newestChainId();
    await ui.requestChainStepApproval(disconnectChainId, 1);
    backend.setStartStepMode("REJECT_AFTER_RUNNING");
    fetchCalls.length = 0;
    await ui.startChainStep(disconnectChainId, 1);
    assert.strictEqual(ui.getState().chainActionInFlight, false);
    assert.match(ui.getState().chainActionError, /Die Verbindung wurde während des Laufs unterbrochen\./);
    assert.match(orderHtml(), /Die Verbindung wurde während des Laufs unterbrochen\./);
    await flushAsyncState();
    const startPosts = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step"));
    assert.strictEqual(startPosts.length, 1);
    await advanceTimeAndFlush(5000);
    assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step")).length, 1, "kein automatischer Wiederholungs-POST");
    await ui.reloadSelectedOrder();
    assert.match(orderHtml(), /Schritt 1 wird gerade ausgeführt\./);
  });

  await check("V7.9-17: drei Pollingfehler stoppen die Aktualisierung und zeigen die manuelle Neu-Laden-Schaltfläche", async () => {
    forcedOrderReadFailureCount = 3;
    await advanceTimeAndFlush(5000);
    await advanceTimeAndFlush(5000);
    await advanceTimeAndFlush(5000);
    assert.strictEqual(ui.getStatusPollingState().stoppedByErrors, true);
    assert.match(orderHtml(), /Automatische Aktualisierung angehalten\./);
    assert.match(orderHtml(), /data-action="reload-chain-status"/);
    forcedOrderReadFailureCount = 0;
  });

  await check("V7.9.3-4/5/6/7: sehr kurzer Lauf springt direkt zu SUCCEEDED, zeigt aber vorher Startzustand und Sperre", async () => {
    const shortOrderId = "pilot-order-v793-short";
    backend.createOrder(shortOrderId, { title: "V7.9.3 Kurzlauf", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    await ui.selectOrder(shortOrderId);
    await ui.prepareAgentChain();
    const shortChainId = newestChainId();
    await ui.requestChainStepApproval(shortChainId, 1);
    backend.setStartStepMode("IMMEDIATE");
    fetchCalls.length = 0;
    timerHarness.clearAll();

    const shortStartPromise = ui.startChainStep(shortChainId, 1);
    const shortLocalTop = orderHtml();
    const shortLocalBottom = diagnosticsStatusCardHtml();
    assert.match(shortLocalTop, /pilot-chain-status-card--running/);
    assert.match(shortLocalBottom, /pilot-chain-status-card--running/);
    assert.match(shortLocalTop, /Start wurde angenommen\. Der Agent wird gestartet\./);
    assert.match(shortLocalTop, /Die serverseitige Bestätigung wird automatisch geprüft\./);
    assert.match(shortLocalTop, /Bitte nicht erneut klicken\./);
    assert.match(shortLocalTop, /Start angefordert vor /);
    assert.doesNotMatch(shortLocalTop, /Schritt 1 wird gerade ausgeführt\./);

    const shortStepRequest = diagnosticsHtml().match(new RegExp(`data-action="request-chain-step-approval" data-chain-id="${shortChainId}" data-chain-step="1"[^>]*`));
    const shortStepStart = diagnosticsHtml().match(new RegExp(`data-action="start-chain-step" data-chain-id="${shortChainId}" data-chain-step="1"[^>]*`));
    assert.ok(shortStepRequest && shortStepRequest[0].includes("disabled"));
    assert.ok(shortStepStart && shortStepStart[0].includes("disabled"));

    await shortStartPromise;
    await flushAsyncState();
    assert.match(orderHtml(), /Schritt 1 erfolgreich abgeschlossen\./);
    assert.match(orderHtml(), /Es wurde nichts automatisch weitergestartet\./);

    const startPosts = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step"));
    const autoApprovalCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("request-chain-step-approval") && entry.body.chainStep === 2);
    const autoStartCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step") && entry.body.chainStep === 2);
    assert.strictEqual(startPosts.length, 1, "kein zusätzlicher POST");
    assert.strictEqual(autoApprovalCalls.length, 0, "keine automatische Freigabe");
    assert.strictEqual(autoStartCalls.length, 0, "kein automatischer Folgestart");

    await ui.selectOrder(v79OrderId);
  });

  await check("V7.9-23: bestehende Sicherheitsbedingungen bleiben erhalten (kein Start ohne Token)", async () => {
    fetchCalls.length = 0;
    const disconnectChainId = newestChainId();
    await ui.startChainStep(disconnectChainId, 2);
    const startCalls = fetchCalls.filter((entry) => entry.method === "POST" && entry.url.includes("start-chain-step"));
    assert.strictEqual(startCalls.length, 0);
  });

  // -------------------------------------------------------------------
  // V7.9.4 ("Konkrete Fehlerursache in der Kettenfehlerkarte sichtbar
  // machen"): Pflichttests für die neue Auswahlreihenfolge, die feste
  // Allowlist, die additiven "Technische Details" und die Sanitization.
  // Eigener, frischer Auftrag/Kette – unabhängig von allen Tests oben –
  // damit direkt am rohen Fixturenzustand (Backend-Map) manipuliert werden
  // kann, ohne bestehende Abläufe zu beeinflussen.
  // -------------------------------------------------------------------
  let v794OrderId;
  let v794ChainId;

  function v794ChainAndStep() {
    const order = backend.orders.get(v794OrderId);
    const chain = order.agentChains.find((entry) => entry.id === v794ChainId);
    const step = chain.steps.find((entry) => entry.stepNumber === 3);
    return { order, chain, step };
  }

  function v794TechnicalDetailsHtml(html) {
    const match = html.match(/<details[\s\S]*?<\/details>/);
    return match ? match[0] : "";
  }

  await check("V7.9.4 setup: eigener Auftrag/eigene Kette für die neuen Fehlerursache-Pflichttests", async () => {
    v794OrderId = "pilot-order-v794-main";
    backend.createOrder(v794OrderId, { title: "V7.9.4 Testauftrag", status: "IN_EXECUTION", statusLabel: "In Ausführung", revision: 0, agentChains: [], agentExecutionRuns: [] });
    await ui.selectOrder(v794OrderId);
    await ui.prepareAgentChain();
    v794ChainId = newestChainId();
    assert.ok(v794ChainId, "Testfixtur: frische Kette muss vorhanden sein");
  });

  await check("V7.9.4-1: präziser Code (RESULT_TOO_LARGE) schlägt Sammelcode (STEP_EXECUTION_FAILED) – sichtbarer Text UND Technische Details", async () => {
    const { order, chain, step } = v794ChainAndStep();
    step.stepStatus = "FAILED";
    step.failureReasonCode = "STEP_EXECUTION_FAILED";
    chain.chainStatus = "FAILED";
    chain.blockReason = null;
    chain.revision += 1;
    const run = {
      id: "pilot-agent-run-v794-1",
      status: "FAILED",
      errorMessage: "Kurze, sichere Testmeldung ohne sensible Inhalte.",
      resultSummary: {
        diagnostics: { reasonCode: "RESULT_TOO_LARGE", runnerPhase: "RESULT_VALIDATION", exitCode: 0, timedOut: false, cancelled: false },
      },
      startedAt: "2026-07-31T14:00:00.000Z",
      finishedAt: "2026-07-31T14:01:00.000Z",
    };
    order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
    step.executionRunId = run.id;
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.match(html, /Die Antwort war zu lang\./, "die konkrete Überschrift für RESULT_TOO_LARGE muss erscheinen");
    assert.match(
      html,
      /Die Antwort war länger als die zulässige Höchstgröße und wurde deshalb nicht gespeichert\. Es wurde bewusst nichts abgeschnitten\./,
    );
    assert.match(html, /Bitte den Auftrag enger fokussieren oder ein knapperes Ergebnisformat vorgeben/);
    const details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: RESULT_TOO_LARGE/, "Technische Details müssen den präzisen Code zeigen");
    assert.match(details, /Sammelcode: STEP_EXECUTION_FAILED/, "Technische Details müssen zusätzlich den Sammelcode zeigen");
    assert.match(details, /Phase: RESULT_VALIDATION/);
    assert.match(details, /Exit-Code: 0/);
    assert.match(details, /Zeitlimit überschritten: nein/);
    assert.match(details, /Abgebrochen: nein/);
    assert.match(details, /Kurze, sichere Testmeldung ohne sensible Inhalte\./);
  });

  await check("V7.9.4-2: die Produktionsfixtur persistiert bei einem regulären Fehlerlauf ausschließlich den Sammelcode auf step.failureReasonCode, nie den präzisen Runcode direkt", async () => {
    // Bezieht sich auf den bereits weiter oben (V7.9-7/18/19) real durchlaufenen
    // regulären DEFERRED_FAILED-Fehlerpfad über completeRunningStep(): dort
    // persistiert die Fixtur jetzt realitätsnah STEP_EXECUTION_FAILED auf dem
    // Kettenschritt, während der präzisere Code ausschließlich am Run liegt.
    const order = backend.orders.get(v79OrderId);
    const chain = order.agentChains.find((entry) => entry.id === v79ChainA);
    const step = chain.steps.find((entry) => entry.stepNumber === 2);
    assert.strictEqual(step.failureReasonCode, "STEP_EXECUTION_FAILED", "step.failureReasonCode darf bei einem regulären Ausführungsfehler nur den Sammelcode enthalten");
    const run = (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId);
    assert.ok(run, "Testfixtur: zugehöriger Run muss vorhanden sein");
    assert.strictEqual(run.resultSummary.diagnostics.reasonCode, "CODEX_PROCESS_EXIT_NONZERO", "der präzise Code lebt ausschließlich am Run");
  });

  await check("V7.9.4-3: FAILED-chain.blockReason mit deutschem Freitext erscheint niemals als Code", async () => {
    const { chain, step } = v794ChainAndStep();
    step.stepStatus = "FAILED";
    step.failureReasonCode = "STEP_EXECUTION_FAILED";
    step.executionRunId = null;
    chain.chainStatus = "FAILED";
    chain.blockReason = "Die Antwort war länger als die zulässige Höchstgröße und wurde deshalb nicht gespeichert (Freitext, kein Code).";
    chain.revision += 1;
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.doesNotMatch(html, /Code: Die Antwort/);
    assert.doesNotMatch(html, /Freitext, kein Code/);
    const details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: STEP_EXECUTION_FAILED/, "FAILED (nicht BLOCKED) darf blockReason nicht als Code verwenden");
  });

  await check("V7.9.4-4: ein unbekannter/neuer reasonCode wird nicht roh angezeigt, sondern kontrolliert auf UNKNOWN abgebildet", async () => {
    const presentation = ui.resolveFailurePresentation("SOME_FUTURE_UNKNOWN_CODE_XYZ");
    assert.strictEqual(presentation.reasonCode, "UNKNOWN");
    assert.strictEqual(presentation.cause, "Der Schritt ist technisch fehlgeschlagen. Die genaue Ursache ist derzeit nicht eindeutig bestimmbar.");
  });

  // V7.9.8: die vier neuen, stufeneigenen Befunde müssen benannt werden – ohne
  // eigene Einträge würden sie kontrolliert auf UNKNOWN fallen und die Ursache
  // wäre im Cockpit nicht mehr erkennbar (siehe V7.9.4-4 direkt darüber).
  await check("V7.9.8: die vier neuen Recherche-/PM-Befunde werden im Cockpit benannt statt auf UNKNOWN abgebildet", async () => {
    const expectations = [
      { reasonCode: "RESEARCH_RESULT_STRUCTURE_INVALID", cause: "Das Rechercheergebnis hatte nicht die erwartete Struktur." },
      { reasonCode: "RESEARCH_RESULT_STILL_TOO_LARGE", cause: "Das Rechercheergebnis blieb auch nach Reduktion über der Grenze." },
      { reasonCode: "PM_RESULT_STRUCTURE_INVALID", cause: "Das Projektmanager-Ergebnis hatte nicht die erwartete Struktur." },
      { reasonCode: "PM_RESULT_STILL_TOO_LARGE", cause: "Das Projektmanager-Ergebnis blieb auch nach Reduktion über der Grenze." },
    ];
    expectations.forEach((expectation) => {
      const presentation = ui.resolveFailurePresentation(expectation.reasonCode);
      assert.strictEqual(presentation.reasonCode, expectation.reasonCode, `${expectation.reasonCode} darf nicht auf UNKNOWN fallen`);
      assert.strictEqual(presentation.cause, expectation.cause);
      assert.ok(presentation.action, `${expectation.reasonCode}: eine Handlungsempfehlung muss vorliegen`);
      // Keine automatische Wiederholung, kein Folgestart: die Empfehlung
      // verlangt ausdrücklich eine erneute, manuelle Freigabe bzw. einen
      // manuellen Neustart.
      assert.ok(/Bitte/.test(presentation.action));
    });
    // Der bestehende Dokumentationsbefund aus V7.8.1 bleibt unverändert.
    const documentation = ui.resolveFailurePresentation("DOCUMENTATION_RESULT_STRUCTURE_INVALID");
    assert.strictEqual(documentation.cause, "Das Dokumentationsergebnis hatte nicht die erwartete Struktur.");
  });

  await check("V7.9.4-4b: unbekannte Rohwerte in step.failureReasonCode UND diagnostics.reasonCode werden nie unkontrolliert in der Kettenfehlerkarte gerendert", async () => {
    const { order, chain, step } = v794ChainAndStep();
    step.stepStatus = "FAILED";
    step.failureReasonCode = "GARBAGE_CODE_NOT_IN_ALLOWLIST";
    chain.chainStatus = "FAILED";
    chain.blockReason = null;
    chain.revision += 1;
    const run = {
      id: "pilot-agent-run-v794-4b",
      status: "FAILED",
      errorMessage: null,
      resultSummary: { diagnostics: { reasonCode: "ANOTHER_GARBAGE_CODE_XYZ" } },
      startedAt: "2026-07-31T14:00:00.000Z",
      finishedAt: "2026-07-31T14:01:00.000Z",
    };
    order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
    step.executionRunId = run.id;
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.doesNotMatch(html, /GARBAGE_CODE_NOT_IN_ALLOWLIST/);
    assert.doesNotMatch(html, /ANOTHER_GARBAGE_CODE_XYZ/);
    const details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: STEP_EXECUTION_FAILED/, "unbekannte Rohwerte fallen sicher auf den benannten Sammelcode zurück");
  });

  await check("V7.9.4-5: fehlender executionRun bzw. fehlende executionRunId führt kontrolliert zum Sammelcode, ohne Absturz", async () => {
    const { chain, step } = v794ChainAndStep();
    step.stepStatus = "FAILED";
    step.failureReasonCode = "STEP_EXECUTION_FAILED";
    step.executionRunId = null;
    chain.chainStatus = "FAILED";
    chain.blockReason = null;
    chain.revision += 1;
    await ui.reloadSelectedOrder();
    let html = orderHtml();
    assert.match(html, /Der Kettenschritt ist fehlgeschlagen\./);
    let details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: STEP_EXECUTION_FAILED/);

    step.executionRunId = "pilot-agent-run-does-not-exist";
    chain.revision += 1;
    await ui.reloadSelectedOrder();
    html = orderHtml();
    assert.match(html, /Der Kettenschritt ist fehlgeschlagen\./, "eine auf keinen Run verweisende executionRunId darf nicht zum Absturz führen");
    details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: STEP_EXECUTION_FAILED/);
  });

  await check("V7.9.4-6: BLOCKED-Fälle wie PREDECESSOR_RESULT_MISSING und MANDATE_DIGEST_MISMATCH bleiben unverändert korrekt", async () => {
    const { chain, step } = v794ChainAndStep();
    step.stepStatus = "PENDING";
    step.failureReasonCode = null;
    step.executionRunId = null;
    chain.chainStatus = "BLOCKED";
    chain.blockReason = "PREDECESSOR_RESULT_MISSING";
    chain.revision += 1;
    await ui.reloadSelectedOrder();
    let html = orderHtml();
    assert.match(html, /Die Kette ist blockiert\./);
    assert.match(html, /Das benötigte Vorgängerergebnis fehlt\./);
    let details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: PREDECESSOR_RESULT_MISSING/);

    chain.blockReason = "MANDATE_DIGEST_MISMATCH";
    chain.revision += 1;
    await ui.reloadSelectedOrder();
    html = orderHtml();
    assert.match(html, /Der Kernauftrag stimmt nicht mehr mit der signierten Version überein\./);
    details = v794TechnicalDetailsHtml(html);
    assert.match(details, /Code: MANDATE_DIGEST_MISMATCH/);
  });

  await check("V7.9.4-7: stderrSample und stdoutSample erscheinen niemals in der Fehlerkarte", async () => {
    const { order, chain, step } = v794ChainAndStep();
    step.stepStatus = "FAILED";
    step.failureReasonCode = "STEP_EXECUTION_FAILED";
    step.executionRunId = null;
    chain.chainStatus = "FAILED";
    chain.blockReason = null;
    chain.revision += 1;
    const run = {
      id: "pilot-agent-run-v794-7",
      status: "FAILED",
      errorMessage: "Kurze sichere Meldung.",
      resultSummary: {
        diagnostics: {
          reasonCode: "CODEX_PROCESS_EXIT_NONZERO",
          stderrSample: "GEHEIM_STDERR: /Users/jamal/geheimer-pfad und TOKEN=abcdef1234567890",
          stdoutSample: "GEHEIM_STDOUT_INHALT_DARF_NIE_ERSCHEINEN",
        },
      },
      startedAt: "2026-07-31T14:00:00.000Z",
      finishedAt: "2026-07-31T14:01:00.000Z",
    };
    order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
    step.executionRunId = run.id;
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.doesNotMatch(html, /GEHEIM_STDOUT_INHALT_DARF_NIE_ERSCHEINEN/);
    assert.doesNotMatch(html, /GEHEIM_STDERR/);
    assert.doesNotMatch(html, /geheimer-pfad/);
  });

  await check("V7.9.4-8: Pfad-, Token- und Secret-Muster aus errorMessage werden nicht angezeigt, stattdessen der feste Sicherheitshinweis", async () => {
    const { order, step } = v794ChainAndStep();
    const run = order.agentExecutionRuns.find((entry) => entry.id === step.executionRunId);
    run.errorMessage = "Fehler bei /Users/jamal/Documents/geheim/config mit TOKEN=abcdefghijklmnopqrst";
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.doesNotMatch(html, /\/Users\/jamal/);
    assert.doesNotMatch(html, /TOKEN=abcdefghijklmnopqrst/);
    assert.match(
      html,
      /Eine zusätzliche technische Meldung liegt vor, wurde aus Sicherheitsgründen jedoch nicht vollständig angezeigt\./,
    );
  });

  await check("V7.9.4-9: eine sichere, kurze Fehlermeldung darf gekürzt/escaped angezeigt werden", async () => {
    const { order, step } = v794ChainAndStep();
    const run = order.agentExecutionRuns.find((entry) => entry.id === step.executionRunId);
    run.errorMessage = "Kurzer Hinweis <script>alert(1)</script> ohne sensible Inhalte.";
    await ui.reloadSelectedOrder();
    const html = orderHtml();
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /Kurzer Hinweis &lt;script&gt;alert\(1\)&lt;\/script&gt; ohne sensible Inhalte\./);
  });

  await check("V7.9.4-10: das Rendern der Fehlerkarte erzeugt keinen POST-Aufruf", async () => {
    fetchCalls.length = 0;
    ui.render();
    assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0, "reines Rendern darf niemals einen POST auslösen");
  });

  await check("V7.9.4-11/12/13: nach einem fehlgeschlagenen/blockierten Schritt läuft kein automatischer Retry, Folgestart oder Freigabe", async () => {
    assert.strictEqual(ui.getStatusPollingState().active, false, "kein aktives Polling auf einem bereits terminalen Fehlerzustand");
    fetchCalls.length = 0;
    await advanceTimeAndFlush(5000);
    await advanceTimeAndFlush(5000);
    assert.strictEqual(
      fetchCalls.filter((entry) => entry.method === "POST").length,
      0,
      "kein automatischer POST (kein Retry, kein Folgestart, keine Freigabe)",
    );
  });

  await check("V7.9.4-14: die bestehenden 28 Prüfpunkte wurden erweitert, nicht reduziert", async () => {
    assert.ok(passed >= 28, "alle vorher bestehenden Prüfpunkte müssen weiterhin erfolgreich durchlaufen sein");
  });

  console.log(`pilot-agent-execution-chain-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution-chain-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
