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
    // V8.1 ("Ergebnis verstehen ohne Technik"): setzt bzw. entfernt das
    // additive, rein lesende resultPresentation-Feld an dem Lauf, der zu
    // einer bereits erfolgreichen Stufe gehört. Simuliert, was
    // pilot-work-order-service.js#buildResultPresentation im echten Betrieb
    // liefert – ohne hier eine zweite Parserlogik nachzubauen.
    setResultPresentation: (chainId, stepNumber, presentation) => {
      const order = orders.get(CANONICAL_ID);
      const chain = findChain(order, chainId);
      if (!chain) return;
      const step = findStep(chain, stepNumber);
      if (!step || !step.executionRunId) return;
      const run = (order.agentExecutionRuns || []).find((entry) => entry.id === step.executionRunId);
      if (!run) return;
      if (presentation === null) {
        delete run.resultPresentation;
      } else {
        run.resultPresentation = presentation;
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
    // V8.1 Korrektur ("echte Kettenansicht auf verständliche
    // Ergebnisdarstellung umstellen"): derselbe Runner-Wert steht jetzt im
    // "Technische Details"-Bereich statt im alten offenen Block.
    assert.match(html, /tats\u00e4chlich: CODEX_READ_ONLY/);
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

  // -------------------------------------------------------------------
  // V8.1 ("Ergebnis verstehen ohne Technik"): additive, rein lesende
  // Darstellung von resultPresentation. Die Testfixtur simuliert hier exakt
  // die Form, die pilot-work-order-service.js#buildResultPresentation im
  // echten Betrieb liefert (siehe pilot-agent-execution-chain.test.js für
  // den Nachweis, dass der Server tatsächlich diese Form erzeugt).
  // -------------------------------------------------------------------
  await check("V8.1-14./15./16./17./18.: ein strukturiertes Ergebnis zeigt Kurzfazit/Kernbefunde vor genau einem eingeklappten „Technische Details“-Bereich, der weiterhin den vollständigen Rohtext enthält", async () => {
    backend.setResultPresentation(chainId, 1, {
      structureStatus: "STRUCTURED",
      sections: [
        { number: 1, title: "KURZFAZIT", kind: "PROSE", prose: "Kurzfazit-Text für Schritt 1.", items: [] },
        { number: 2, title: "BELEGTE KERNBEFUNDE", kind: "ITEMS", prose: null, items: ["Erster belegter Befund.", "Zweiter belegter Befund."] },
        { number: 3, title: "REIBUNGSVERLUSTE", kind: "ITEMS", prose: null, items: ["Ein Reibungsverlust."] },
        { number: 4, title: "PRIORISIERTE VERBESSERUNGEN", kind: "ITEMS", prose: null, items: ["Erste Verbesserung.", "Zweite Verbesserung."] },
        { number: 5, title: "GRENZEN UND UNSICHERHEITEN", kind: "PROSE", prose: "Grenzen-Text für Schritt 1.", items: [] },
      ],
      rawTextAvailable: true,
      contractStage: "RESEARCH",
      resultLabel: "Rechercheergebnis",
      honestNotice: null,
    });
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    // 14./15.: Kernbefunde/Prioritäten stehen offen im Haupttext.
    assert.match(html, /Kurzfazit-Text f\u00fcr Schritt 1\./);
    assert.match(html, /Erster belegter Befund\./);
    assert.match(html, /Erste Verbesserung\./);
    assert.match(html, /Grenzen-Text f\u00fcr Schritt 1\./);
    // 14.: das Kurzfazit steht textlich VOR den technischen Angaben
    // (Prompt-Digest/Rohtext), die jetzt ausschließlich im „Technische
    // Details“-Bereich liegen.
    const summaryIndex = html.indexOf("Kurzfazit-Text f\u00fcr Schritt 1.");
    const technicalIndex = html.indexOf("Technische Details");
    assert.ok(summaryIndex >= 0 && technicalIndex >= 0 && summaryIndex < technicalIndex, "das Kurzfazit muss vor den Technischen Details stehen");
    // 16./17.: Prompt-Digest & Co. stehen ausschließlich im Technische-
    // Details-Bereich; für Schritt 1 existiert genau ein solcher Bereich.
    const technicalDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-technical"').length - 1;
    assert.strictEqual(technicalDetailsCount, 1, "genau ein Technische-Details-Bereich für den einzigen bisher gelaufenen Schritt");
    assert.match(html, /Vereinbarte Ergebnisstruktur eingehalten/);
    // Abschnitt 7 ("Teilergebnis"): Recherche-/Dokumentationsergebnisse sind
    // niemals das abschließende Gesamtergebnis der Kette – nur die
    // PM-Stufe liefert das Gesamturteil.
    assert.match(html, /Zwischenergebnis \u2013 noch nicht das abschlie\u00dfende Gesamtergebnis\./);
    // 18.: der Rohtext bleibt vollständig und unverändert im Technische-
    // Details-Bereich erreichbar.
    assert.match(html, /Testbefund Schritt 1/);
  });

  await check("V8.1-8./9./10.: ein strukturell ungültiges, aber angenommenes Ergebnis erfindet keine Kurzfassung, zeigt einen ehrlichen Hinweis und lässt den Rohtext erreichbar", async () => {
    backend.setResultPresentation(chainId, 1, {
      structureStatus: "UNSTRUCTURED_ACCEPTED",
      sections: [],
      rawTextAvailable: true,
      contractStage: "RESEARCH",
      resultLabel: "Rechercheergebnis",
      honestNotice:
        "Das Ergebnis hält die vereinbarte Gliederung nicht ein. Es wird unverändert angezeigt; " +
        "eine verlässliche Kurzfassung steht nicht zur Verfügung.",
    });
    await ui.reloadSelectedOrder();
    const html = diagnosticsHtml();
    assert.match(html, /h\u00e4lt die vereinbarte Gliederung nicht ein/);
    assert.match(html, /Struktur nicht vollst\u00e4ndig eingehalten/);
    assert.match(html, /Testbefund Schritt 1/, "der Rohtext bleibt trotz ungültiger Struktur vollständig erreichbar");
    backend.setResultPresentation(chainId, 1, null);
    await ui.reloadSelectedOrder();
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
    assert.match(cardHtml, /Von der Agentenkette erledigte Rollen<\/dt><dd>/);
    // Sprachpaket A: nur das Label wurde verständlicher formuliert; die
    // Zahlen und ihre Ableitung bleiben unverändert.
    assert.match(cardHtml, /Von der Agentenkette erledigte Rollen<\/dt><dd>\d+ von \d+ Rollen über Kettenschritte erfolgreich verbucht/);
    assert.doesNotMatch(cardHtml, /Ketten-Rollenbuchung/);
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

  // -------------------------------------------------------------------
  // V8.1 Korrektur ("echte Kettenansicht auf verständliche
  // Ergebnisdarstellung umstellen"): der erste Browserversuch schlug fehl,
  // weil overview.status bei der real von Jamal geprüften Pilotauftrag
  // ("Pilotauftrag: Nutzerperspektive und täglicher Gebrauch der
  // KI-Unternehmenszentrale") bereits COMPLETED war – renderAgentChainSection
  // endete für jeden nicht-IN_EXECUTION-Status vorher per return, BEVOR
  // renderChainStepCard/renderRunResultPresentationHtml überhaupt erreicht
  // wurde. Alle bisherigen V8.1-Tests oben liefen ausschließlich gegen einen
  // IN_EXECUTION-Auftrag und haben diese exakte, real aufgetretene
  // Kombination (abgeschlossener Auftrag + abgeschlossene Kette mit
  // resultRawText UND resultPresentation an jedem Lauf) nie geprüft. Dieser
  // Block baut deshalb bewusst einen eigenen, realistisch strukturierten
  // Auftrag direkt über backend.createOrder (status COMPLETED, dieselbe
  // Form wie overviewFor() sie im echten Betrieb liefert) und rendert ihn
  // über denselben echten Weg (ui.selectOrder -> render() ->
  // renderSelectedOrderOutput -> renderAgentChainSection ->
  // renderChainStepCard), den auch der Browser verwendet.
  // -------------------------------------------------------------------
  let v81CompletedOrderId;
  let v81CompletedChainId;
  const v81RunIds = { 1: "pilot-agent-run-v81-completed-1", 2: "pilot-agent-run-v81-completed-2", 3: "pilot-agent-run-v81-completed-3" };

  function v81ChainManagedRun(stepNumber, presetId, contractStage, sections, extra) {
    return Object.assign(
      {
        id: v81RunIds[stepNumber],
        presetId,
        pilotRole: contractStage === "RESEARCH" ? "RECHERCHE_ANALYSE" : contractStage === "DOCUMENTATION" ? "DOKUMENTATION" : "PROJEKTMANAGER",
        pilotRoleLabel: "Testrolle",
        taskTitle: `Kettenschritt ${stepNumber}`,
        runnerId: "codex-read-only-analysis",
        runnerLabel: "Codex \u2013 echter, isolierter Read-Only-KI-Agentenlauf",
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
        resultRawText: `Rohtext Kettenschritt ${stepNumber} \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert (V8.1-Regressionsauftrag).`,
        resultSummary: { secretRedactionApplied: false, secretRedactionNotice: null, analyzedFiles: ["V1_BETRIEBSHANDBUCH.md"] },
        errorMessage: null,
        handoffStatus: "SUCCEEDED",
        handoffErrorMessage: null,
        startedAt: "2026-08-01T09:00:00.000Z",
        finishedAt: "2026-08-01T09:01:00.000Z",
        resultPresentation: {
          structureStatus: "STRUCTURED",
          sections,
          rawTextAvailable: true,
          contractStage,
          resultLabel: contractStage === "RESEARCH" ? "Rechercheergebnis" : contractStage === "DOCUMENTATION" ? "Dokumentationsergebnis" : "Projektmanager-Ergebnis",
          honestNotice: null,
        },
      },
      extra || {},
    );
  }

  await check(
    "V8.1 Korrektur-Setup: ein bereits COMPLETED-Pilotauftrag mit einer COMPLETED-Kette (drei erfolgreiche Schritte, jeweils resultRawText UND resultPresentation) wird direkt angelegt",
    async () => {
      v81CompletedOrderId = "pilot-order-v81-completed-real-view";
      v81CompletedChainId = "pilot-agent-chain-v81-completed-1";
      const run1 = v81ChainManagedRun(1, "codex-chain-research-analysis", "RESEARCH", [
        { number: 1, title: "KURZFAZIT", kind: "PROSE", prose: "Kurzfazit Rechercheschritt.", items: [] },
        { number: 2, title: "BELEGTE KERNBEFUNDE", kind: "ITEMS", prose: null, items: ["Kernbefund A."] },
        { number: 3, title: "REIBUNGSVERLUSTE", kind: "ITEMS", prose: null, items: ["Reibungsverlust A."] },
        { number: 4, title: "PRIORISIERTE VERBESSERUNGEN", kind: "ITEMS", prose: null, items: ["Verbesserung A."] },
        { number: 5, title: "GRENZEN UND UNSICHERHEITEN", kind: "PROSE", prose: "Grenzen Rechercheschritt.", items: [] },
      ]);
      const run2 = v81ChainManagedRun(2, "codex-document-chain-result", "DOCUMENTATION", [
        { number: 1, title: "KURZERGEBNIS", kind: "PROSE", prose: "Kurzergebnis Dokumentationsschritt.", items: [] },
        { number: 2, title: "BEST\u00c4TIGTE KERNBEFUNDE", kind: "ITEMS", prose: null, items: ["Best\u00e4tigter Kernbefund B."] },
        { number: 3, title: "OFFENE PUNKTE UND GRENZEN", kind: "ITEMS", prose: null, items: ["Offener Punkt B."] },
        { number: 4, title: "PRIORISIERTE EMPFEHLUNGEN", kind: "ITEMS", prose: null, items: ["Empfehlung B."] },
        { number: 5, title: "HERKUNFTSHINWEIS", kind: "PROSE", prose: "Herkunftshinweis B.", items: [] },
      ]);
      const run3 = v81ChainManagedRun(3, "codex-pm-evaluate-chain", "PROJECT_MANAGER", [
        { number: 1, title: "GESAMTURTEIL", kind: "PROSE", prose: "Gesamturteil des Projektmanager-Agenten: konsistent und entscheidungsreif.", items: [] },
        { number: 2, title: "ENTSCHEIDUNGSRELEVANTE ABWEICHUNGEN", kind: "ITEMS", prose: null, items: ["Keine wesentliche Abweichung."] },
        { number: 3, title: "OFFENE RISIKEN", kind: "ITEMS", prose: null, items: ["Kein offenes Risiko."] },
        { number: 4, title: "EMPFEHLUNG AN JAMAL", kind: "PROSE", prose: "Empfehlung an Jamal: Ergebnis zur Abnahme vorlegen.", items: [] },
        { number: 5, title: "ENTSCHEIDUNGSREIFE", kind: "PROSE", prose: "Entscheidungsreif.", items: [] },
      ]);
      backend.createOrder(v81CompletedOrderId, {
        title: "Pilotauftrag: Nutzerperspektive und t\u00e4glicher Gebrauch der KI-Unternehmenszentrale (Testfixtur)",
        status: "COMPLETED",
        statusLabel: "Abgeschlossen",
        revision: 9,
        handoffs: [],
        agentExecutionRuns: [run1, run2, run3],
        agentChains: [
          {
            id: v81CompletedChainId,
            chainStatus: "COMPLETED",
            currentStep: 3,
            revision: 4,
            selectedFilesFixed: true,
            selectedFiles: ["V1_BETRIEBSHANDBUCH.md"],
            mandateDigest: "a".repeat(64),
            completedAt: "2026-08-01T09:03:00.000Z",
            steps: [
              { stepNumber: 1, agentKey: "review-agent", presetId: "codex-chain-research-analysis", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v81RunIds[1], roleHandoffBooked: true },
              { stepNumber: 2, agentKey: "documentation-agent", presetId: "codex-document-chain-result", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v81RunIds[2], chainedFromExecutionRunId: v81RunIds[1], predecessorFullyIncluded: true, predecessorIncludedCharCount: 10, roleHandoffBooked: true },
              { stepNumber: 3, agentKey: "orchestrator-agent", presetId: "codex-pm-evaluate-chain", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v81RunIds[3], chainedFromExecutionRunId: v81RunIds[2], predecessorFullyIncluded: true, predecessorIncludedCharCount: 10, roleHandoffBooked: true },
            ],
          },
        ],
      });
      fetchCalls.length = 0;
      await ui.selectOrder(v81CompletedOrderId);
      assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0, "reines Auswählen/Laden eines abgeschlossenen Auftrags darf keinen POST auslösen");
      assert.strictEqual(ui.getState().overview.status, "COMPLETED", "Testfixtur: der Auftrag muss tatsächlich COMPLETED sein, wie beim echten, von Jamal geprüften Pilotauftrag");
    },
  );

  await check(
    "V8.1 Korrektur-1./2./3.: für einen bereits COMPLETED-Auftrag rendert der ECHTE Kettenrenderer trotzdem alle drei erfolgreichen Kettenschritte (vorher: renderAgentChainSection endete hier per return, bevor renderChainStepCard je erreicht wurde)",
    async () => {
      const html = diagnosticsHtml();
      assert.match(html, /Schritt 1 \u2013 Recherche\/Analyse/);
      assert.match(html, /Schritt 2 \u2013 Dokumentation/);
      assert.match(html, /Schritt 3 \u2013 Projektmanager-Bewertung/);
      assert.match(html, new RegExp(v81RunIds[1]));
      assert.match(html, new RegExp(v81RunIds[2]));
      assert.match(html, new RegExp(v81RunIds[3]));
    },
  );

  await check("V8.1 Korrektur-4.: „Gesamturteil“ (PM-Stufe, Abschnitt GESAMTURTEIL) ist offen sichtbar", async () => {
    const html = diagnosticsHtml();
    assert.match(html, /GESAMTURTEIL/);
    assert.match(html, /Gesamturteil des Projektmanager-Agenten: konsistent und entscheidungsreif\./);
    assert.match(html, /Empfehlung an Jamal: Ergebnis zur Abnahme vorlegen\./);
  });

  await check("V8.1 Korrektur-5.: Stufe 1 und Stufe 2 sind als „Zwischenergebnis“ gekennzeichnet, Stufe 3 (PM) nicht", async () => {
    const html = diagnosticsHtml();
    const zwischenergebnisCount = html.split("Zwischenergebnis \u2013 noch nicht das abschlie\u00dfende Gesamtergebnis.").length - 1;
    assert.strictEqual(zwischenergebnisCount, 2, "genau Stufe 1 und Stufe 2 sind Zwischenergebnisse, die PM-Stufe (Stufe 3) liefert das Gesamturteil und ist keines");
  });

  await check(
    "V8.1 Korrektur-6./7.: „Technische Details“ erscheint genau dreimal (einmal je Kettenschritt); Runner, Digests und Rohtext liegen ausschließlich darin",
    async () => {
      const html = diagnosticsHtml();
      const technicalDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-technical"').length - 1;
      assert.strictEqual(technicalDetailsCount, 3, "genau ein Technische-Details-Bereich je der drei erfolgreichen Kettenschritte");
      // Jeder Rohtext-/Digest-/Runner-Beleg muss innerhalb eines <details>-Blocks liegen.
      const detailsBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-result-technical">[\s\S]*?<\/details>/g) || [];
      assert.strictEqual(detailsBlocks.length, 3);
      [1, 2, 3].forEach((stepNumber) => {
        const rawTextNeedle = `Rohtext Kettenschritt ${stepNumber} \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert (V8.1-Regressionsauftrag).`;
        const containingBlock = detailsBlocks.find((block) => block.includes(rawTextNeedle));
        assert.ok(containingBlock, `der Rohtext von Schritt ${stepNumber} muss innerhalb eines Technische-Details-Blocks liegen`);
        assert.match(containingBlock, /Runner-Art \u2013 angefordert: CODEX_READ_ONLY/);
        assert.match(containingBlock, /Modell: Codex \(ChatGPT\)/);
        assert.match(containingBlock, /Prompt-Digest: b{64}/);
        assert.match(containingBlock, /Kernauftrag-Digest: a{64}/);
        assert.match(containingBlock, new RegExp(`Lauf-ID: ${v81RunIds[stepNumber]}`));
      });
    },
  );

  await check(
    "V8.1 Korrektur-8.: der alte, offene Rohtextblock erscheint für diese drei Kettenschritt-Läufe NICHT zusätzlich außerhalb von „Technische Details“ (kein doppelter Rohtext, keine zweite Stelle mit Runner/Modell)",
    async () => {
      const html = diagnosticsHtml();
      [1, 2, 3].forEach((stepNumber) => {
        const rawTextNeedle = `Rohtext Kettenschritt ${stepNumber} \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert (V8.1-Regressionsauftrag).`;
        const occurrences = html.split(rawTextNeedle).length - 1;
        assert.strictEqual(occurrences, 1, `der Rohtext von Schritt ${stepNumber} darf nur genau einmal (innerhalb der Technischen Details) erscheinen`);
      });
      // Die alte, unstrukturierte Liste "Agentenlauf (lokaler deterministischer
      // Runner)" darf für diese drei chainManaged-Läufe keinen eigenen <li>
      // mehr zeigen – sie sind ausschließlich in der Drei-Agenten-Kette sichtbar.
      assert.match(
        html,
        /Alle bisherigen L\u00e4ufe geh\u00f6ren zu einer Drei-Agenten-Kette und werden ausschlie\u00dflich weiter unten unter „Drei-Agenten-Kette“ gezeigt\./,
      );
    },
  );

  await check("V8.1 Korrektur-9.: der vollständige Rohtext bleibt (innerhalb der Technischen Details) vollständig erreichbar", async () => {
    const html = diagnosticsHtml();
    [1, 2, 3].forEach((stepNumber) => {
      assert.match(html, new RegExp(`Rohtext Kettenschritt ${stepNumber} \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert \\(V8\\.1-Regressionsauftrag\\)\\.`));
    });
  });

  await check("V8.1 Korrektur-10.: das reine Rendern des abgeschlossenen Kettenauftrags erzeugt keinen fetch/POST, keine Freigabe, keinen Kettenstart und keinen Statuswechsel", async () => {
    fetchCalls.length = 0;
    ui.render();
    ui.render();
    assert.strictEqual(fetchCalls.length, 0, "reines Rendern darf keinen fetch auslösen");
    assert.strictEqual(ui.getState().overview.status, "COMPLETED", "kein Statuswechsel durch reines Rendern");
    const html = diagnosticsHtml();
    assert.doesNotMatch(html, /data-action="prepare-agent-chain"(?! disabled)/, "für einen abgeschlossenen Auftrag darf keine aktive Schaltfläche zum Anlegen einer neuen Kette erscheinen");
    assert.match(html, /Eine neue Agentenkette kann nur w\u00e4hrend „In Ausf\u00fchrung“ vorbereitet werden\./);
  });

  // -------------------------------------------------------------------
  // Regressionstest (Auftrag Abschnitt 7, letzter Absatz): ein
  // unstrukturiertes, aber angenommenes Ergebnis im selben, echten
  // COMPLETED-Kettenrenderer – ehrlicher Hinweis sichtbar, keine erfundene
  // Kurzfassung, Rohtext ausschließlich unter „Technische Details“.
  // -------------------------------------------------------------------
  await check(
    "V8.1 Regressionstest: ein unstrukturiertes, aber angenommenes Ergebnis (UNSTRUCTURED_ACCEPTED) im echten COMPLETED-Kettenrenderer zeigt einen ehrlichen Hinweis, erfindet keine Kurzfassung und zeigt den Rohtext ausschließlich unter „Technische Details“",
    async () => {
      const order = backend.orders.get(v81CompletedOrderId);
      const run1 = order.agentExecutionRuns.find((entry) => entry.id === v81RunIds[1]);
      run1.resultPresentation = {
        structureStatus: "UNSTRUCTURED_ACCEPTED",
        sections: [],
        rawTextAvailable: true,
        contractStage: "RESEARCH",
        resultLabel: "Rechercheergebnis",
        honestNotice:
          "Das Ergebnis h\u00e4lt die vereinbarte Gliederung nicht ein. Es wird unver\u00e4ndert angezeigt; eine verl\u00e4ssliche Kurzfassung steht nicht zur Verf\u00fcgung.",
      };
      await ui.reloadSelectedOrder();
      const html = diagnosticsHtml();
      assert.match(html, /h\u00e4lt die vereinbarte Gliederung nicht ein/, "der ehrliche Hinweis muss sichtbar sein");
      assert.doesNotMatch(html, /KURZFAZIT/, "für dieses Ergebnis darf keine erfundene Struktur/Kurzfassung mehr erscheinen");
      const technicalDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-technical"').length - 1;
      assert.strictEqual(technicalDetailsCount, 3, "weiterhin genau ein Technische-Details-Bereich je Kettenschritt");
      const detailsBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-result-technical">[\s\S]*?<\/details>/g) || [];
      const step1RawTextNeedle = "Rohtext Kettenschritt 1 \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert (V8.1-Regressionsauftrag).";
      const step1Block = detailsBlocks.find((block) => block.includes(step1RawTextNeedle));
      assert.ok(step1Block, "der Rohtext von Schritt 1 muss weiterhin unter „Technische Details“ vollständig erreichbar sein");
      const occurrencesOutsideCheck = html.split(step1RawTextNeedle).length - 1;
      assert.strictEqual(occurrencesOutsideCheck, 1, "der Rohtext darf trotz UNSTRUCTURED_ACCEPTED nicht zusätzlich außerhalb der Technischen Details erscheinen");
    },
  );

  // -------------------------------------------------------------------
  // V8.2 ("Entscheidungsansicht statt Textmenge") – dieselben, bereits vom
  // Server gelieferten Abschnitte werden jetzt ANDERS ANGEORDNET: offen nur
  // eine kompakte Entscheidungsansicht, der vollständige Fachinhalt bleibt
  // unverändert unter „Fachliche Details“ (zusätzlich zu den bereits
  // geprüften „Technische Details“) erreichbar. Eigener, in sich
  // geschlossener Auftrag mit denselben, produktiv verwendeten
  // Abschnittstiteln/-nummern wie pilot-agent-documentation-result.js
  // (siehe pilot-agent-execution-chain.test.js, das denselben Wortlaut
  // serverseitig nachweist), damit dieser Test keine Fiktion prüft.
  // -------------------------------------------------------------------
  let v82OrderId;
  let v82ChainId;
  const v82RunIds = { 1: "pilot-agent-run-v82-1", 2: "pilot-agent-run-v82-2", 3: "pilot-agent-run-v82-3" };

  function v82ChainManagedRun(stepNumber, presetId, contractStage, sections, resultRawText) {
    return {
      id: v82RunIds[stepNumber],
      presetId,
      pilotRole: contractStage === "RESEARCH" ? "RECHERCHE_ANALYSE" : contractStage === "DOCUMENTATION" ? "DOKUMENTATION" : "PROJEKTMANAGER",
      pilotRoleLabel: "Testrolle",
      taskTitle: `Kettenschritt ${stepNumber}`,
      runnerId: "codex-read-only-analysis",
      runnerLabel: "Codex \u2013 echter, isolierter Read-Only-KI-Agentenlauf",
      requestedRunnerKind: "CODEX_READ_ONLY",
      actualRunnerKind: "CODEX_READ_ONLY",
      aiExecuted: true,
      fallbackUsed: false,
      modelLabel: "Codex (ChatGPT)",
      runnerVersion: "codex-cli 0.999.0-test",
      status: "SUCCEEDED",
      promptDigest: "d".repeat(64),
      mandateDigest: "c".repeat(64),
      resultTruncated: false,
      resultRawText,
      resultSummary: { secretRedactionApplied: false, secretRedactionNotice: null, analyzedFiles: ["V1_BETRIEBSHANDBUCH.md"] },
      errorMessage: null,
      handoffStatus: "SUCCEEDED",
      handoffErrorMessage: null,
      startedAt: "2026-08-04T09:00:00.000Z",
      finishedAt: "2026-08-04T09:01:00.000Z",
      resultPresentation: {
        structureStatus: "STRUCTURED",
        sections,
        rawTextAvailable: true,
        contractStage,
        resultLabel: contractStage === "RESEARCH" ? "Rechercheergebnis" : contractStage === "DOCUMENTATION" ? "Dokumentationsergebnis" : "Projektmanager-Ergebnis",
        honestNotice: null,
      },
    };
  }

  await check(
    "V8.2-Setup: ein COMPLETED-Pilotauftrag mit einer COMPLETED-Kette (echte Abschnittstitel/-nummern, mehr als drei Kernbefunde in Schritt 1, echte Entscheidung in Schritt 3) wird direkt angelegt",
    async () => {
      v82OrderId = "pilot-order-v82-decision-view";
      v82ChainId = "pilot-agent-chain-v82-decision-view-1";
      const run1 = v82ChainManagedRun(
        1,
        "codex-chain-research-analysis",
        "RESEARCH",
        [
          { number: 1, title: "KURZFAZIT", kind: "PROSE", prose: "V82-Fazit Rechercheschritt.", items: [] },
          {
            number: 2,
            title: "BELEGTE KERNBEFUNDE",
            kind: "ITEMS",
            prose: null,
            items: ["V82-Kernbefund eins.", "V82-Kernbefund zwei.", "V82-Kernbefund drei.", "V82-Kernbefund vier."],
          },
          { number: 3, title: "REIBUNGSVERLUSTE", kind: "ITEMS", prose: null, items: ["V82-Reibungsverlust eins."] },
          { number: 4, title: "PRIORISIERTE VERBESSERUNGEN", kind: "ITEMS", prose: null, items: ["V82-Verbesserung eins."] },
          { number: 5, title: "GRENZEN UND UNSICHERHEITEN", kind: "PROSE", prose: "V82-Grenzen Rechercheschritt.", items: [] },
        ],
        "Rohtext Kettenschritt 1 (V8.2-Auftrag) \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert.",
      );
      const run2 = v82ChainManagedRun(
        2,
        "codex-document-chain-result",
        "DOCUMENTATION",
        [
          { number: 1, title: "KURZERGEBNIS", kind: "PROSE", prose: "V82-Kurzergebnis Dokumentationsschritt.", items: [] },
          { number: 2, title: "BEST\u00c4TIGTE KERNBEFUNDE", kind: "ITEMS", prose: null, items: ["V82-Best\u00e4tigter Kernbefund eins."] },
          { number: 3, title: "OFFENE PUNKTE UND GRENZEN", kind: "ITEMS", prose: null, items: ["V82-Offener Punkt eins."] },
          { number: 4, title: "PRIORISIERTE EMPFEHLUNGEN", kind: "ITEMS", prose: null, items: ["V82-Empfehlung eins."] },
          { number: 5, title: "HERKUNFTSHINWEIS", kind: "PROSE", prose: "V82-Herkunftshinweis.", items: [] },
        ],
        "Rohtext Kettenschritt 2 (V8.2-Auftrag) \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert.",
      );
      const run3 = v82ChainManagedRun(
        3,
        "codex-pm-evaluate-chain",
        "PROJECT_MANAGER",
        [
          { number: 1, title: "GESAMTURTEIL", kind: "PROSE", prose: "V82-Gesamturteil: konsistent und entscheidungsreif.", items: [] },
          { number: 2, title: "WICHTIGSTE BELEGTE STAERKEN", kind: "ITEMS", prose: null, items: ["V82-St\u00e4rke eins.", "V82-St\u00e4rke zwei."] },
          { number: 3, title: "WICHTIGSTE BELEGTE SCHWAECHEN", kind: "ITEMS", prose: null, items: ["V82-Schw\u00e4che eins."] },
          {
            number: 4,
            title: "PRIORISIERTE ENTSCHEIDUNGEN",
            kind: "ITEMS",
            prose: null,
            items: ["V82-Entscheidung eins: bitte freigeben.", "V82-Entscheidung zwei."],
          },
          { number: 5, title: "EMPFEHLUNG AN JAMAL", kind: "PROSE", prose: "V82-Empfehlung: zur Abnahme vorlegen.", items: [] },
        ],
        "Rohtext Kettenschritt 3 (V8.2-Auftrag) \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert.",
      );
      backend.createOrder(v82OrderId, {
        title: "Pilotauftrag: V8.2-Entscheidungsansicht (Testfixtur)",
        status: "COMPLETED",
        statusLabel: "Abgeschlossen",
        revision: 4,
        handoffs: [
          {
            id: "pilot-handoff-v82-1",
            sequence: 1,
            fromPilotRole: "RECHERCHE_ANALYSE",
            toPilotRole: "DOKUMENTATION",
            toPilotRoleLabel: "Dokumentations-Agent",
            shortFinding: "V82-Kurzbefund f\u00fcr Handoff.",
            resultOrRecommendation: "V82-Ergebnis/Empfehlung Volltext.",
            basisUsed: "V82-Grundlage Volltext.",
            riskOrLimit: "V82-Risiko Volltext.",
            nextStep: "V82-N\u00e4chster Schritt Volltext.",
            decisionNeeded: null,
            pmFilterStatus: "PASSED",
            pmFilterReasons: [],
            createdAt: "2026-08-04T09:02:00.000Z",
          },
        ],
        agentExecutionRuns: [run1, run2, run3],
        agentChains: [
          {
            id: v82ChainId,
            chainStatus: "COMPLETED",
            currentStep: 3,
            revision: 4,
            selectedFilesFixed: true,
            selectedFiles: ["V1_BETRIEBSHANDBUCH.md"],
            mandateDigest: "c".repeat(64),
            completedAt: "2026-08-04T09:03:00.000Z",
            steps: [
              { stepNumber: 1, agentKey: "review-agent", presetId: "codex-chain-research-analysis", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v82RunIds[1], roleHandoffBooked: true },
              { stepNumber: 2, agentKey: "documentation-agent", presetId: "codex-document-chain-result", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v82RunIds[2], chainedFromExecutionRunId: v82RunIds[1], predecessorFullyIncluded: true, predecessorIncludedCharCount: 10, roleHandoffBooked: true },
              { stepNumber: 3, agentKey: "orchestrator-agent", presetId: "codex-pm-evaluate-chain", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: v82RunIds[3], chainedFromExecutionRunId: v82RunIds[2], predecessorFullyIncluded: true, predecessorIncludedCharCount: 10, roleHandoffBooked: true },
            ],
          },
        ],
      });
      fetchCalls.length = 0;
      await ui.selectOrder(v82OrderId);
      assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0, "reines Auswählen/Laden darf keinen POST auslösen");
      assert.strictEqual(ui.getState().overview.status, "COMPLETED");
    },
  );

  await check("V8.2-1./2.: Stufe 1 und Stufe 2 zeigen offen „Zwischenergebnis“, das jeweilige Fazit und höchstens drei Kernpunkte", async () => {
    const html = diagnosticsHtml();
    const zwischenergebnisCount = html.split("Zwischenergebnis \u2013 noch nicht das abschlie\u00dfende Gesamtergebnis.").length - 1;
    assert.strictEqual(zwischenergebnisCount, 2, "genau Stufe 1 und Stufe 2 sind als Zwischenergebnis gekennzeichnet");
    assert.match(html, /V82-Fazit Rechercheschritt\./);
    assert.match(html, /V82-Kurzergebnis Dokumentationsschritt\./);
    // Stufe 1 hat vier Kernbefunde, offen dürfen höchstens drei erscheinen.
    const keyPointsBlocks = html.match(/<div class="pilot-work-order-key-points">[\s\S]*?<\/div>/g) || [];
    const step1KeyPoints = keyPointsBlocks.find((block) => block.includes("V82-Kernbefund eins."));
    assert.ok(step1KeyPoints, "die wichtigsten Erkenntnisse von Schritt 1 müssen offen erscheinen");
    const step1KeyPointsItemCount = (step1KeyPoints.match(/<li>/g) || []).length;
    assert.strictEqual(step1KeyPointsItemCount, 3, "offen dürfen höchstens drei Kernpunkte erscheinen");
    assert.match(step1KeyPoints, /V82-Kernbefund eins\./);
    assert.match(step1KeyPoints, /V82-Kernbefund zwei\./);
    assert.match(step1KeyPoints, /V82-Kernbefund drei\./);
    assert.doesNotMatch(step1KeyPoints, /V82-Kernbefund vier\./, "der vierte Kernbefund darf offen nicht erscheinen");
    // 12.: der vierte, offen weggelassene Kernbefund bleibt vollständig unter „Fachliche Details“ erhalten.
    assert.match(html, /V82-Kernbefund vier\./, "der vierte Kernbefund muss vollständig unter „Fachliche Details“ erhalten bleiben");
  });

  await check("V8.2-3./4.: Stufe 3 (PM) zeigt offen „Gesamtbewertung“, das Gesamturteil, höchstens drei Kernpunkte, eine Empfehlung und die vorhandene Entscheidung", async () => {
    const html = diagnosticsHtml();
    assert.match(html, /<strong>Gesamtbewertung<\/strong>/);
    assert.match(html, /V82-Gesamturteil: konsistent und entscheidungsreif\./);
    assert.match(html, /V82-St\u00e4rke eins\./);
    assert.match(html, /V82-St\u00e4rke zwei\./);
    // Empfehlung stammt ausschließlich aus dem vorhandenen Empfehlungsabschnitt (Abschnitt 5, "EMPFEHLUNG AN JAMAL").
    const recommendationBlock = html.match(/<div class="pilot-work-order-recommendation">[\s\S]*?<\/div>/);
    assert.ok(recommendationBlock, "eine Empfehlung muss für die PM-Stufe offen erscheinen");
    assert.match(recommendationBlock[0], /V82-Empfehlung: zur Abnahme vorlegen\./);
    // 4.: eine tatsächlich vorhandene Entscheidung erscheint mit fester Kennzeichnung und dem vorhandenen Entscheidungstext.
    const decisionBlock = html.match(/<div class="pilot-work-order-decision-required">[\s\S]*?<\/div>/);
    assert.ok(decisionBlock, "„Entscheidung erforderlich“ muss erscheinen, wenn eine echte Entscheidung vorliegt");
    assert.match(decisionBlock[0], /Entscheidung erforderlich/);
    assert.match(decisionBlock[0], /V82-Entscheidung eins: bitte freigeben\./);
    assert.match(decisionBlock[0], /V82-Entscheidung zwei\./);
    assert.strictEqual((html.match(/Entscheidung erforderlich/g) || []).length, 1, "„Entscheidung erforderlich“ darf nur für die PM-Stufe erscheinen");
  });

  await check("V8.2-5.: Risiken/Grenzen erscheinen offen und kompakt, ausschließlich aus dem jeweils vorhandenen Abschnitt, nie ergänzt oder umformuliert", async () => {
    const html = diagnosticsHtml();
    const riskBlocks = html.match(/<div class="pilot-work-order-risk-note">[\s\S]*?<\/div>/g) || [];
    assert.strictEqual(riskBlocks.length, 3, "je Kettenschritt genau ein kompakter Risiko-/Grenzen-Hinweis");
    assert.ok(riskBlocks.some((block) => block.includes("V82-Grenzen Rechercheschritt.")), "Schritt 1: Risiko/Grenzen aus Abschnitt „GRENZEN UND UNSICHERHEITEN“");
    assert.ok(riskBlocks.some((block) => block.includes("V82-Offener Punkt eins.")), "Schritt 2: Risiko/Grenzen aus Abschnitt „OFFENE PUNKTE UND GRENZEN“");
    assert.ok(riskBlocks.some((block) => block.includes("V82-Schw\u00e4che eins.")), "Schritt 3: Risiko/Grenzen aus Abschnitt „WICHTIGSTE BELEGTE SCHWAECHEN“");
    riskBlocks.forEach((block) => assert.match(block, /Risiken und Grenzen/));
  });

  await check("V8.2-6./7.: pro Kettenschritt existiert genau ein „Fachliche Details“ und ein „Technische Details“, beide standardmäßig geschlossen", async () => {
    const html = diagnosticsHtml();
    const fachlicheDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-fachlich"').length - 1;
    assert.strictEqual(fachlicheDetailsCount, 3, "genau ein „Fachliche Details“-Bereich je Kettenschritt");
    const technicalDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-technical"').length - 1;
    assert.strictEqual(technicalDetailsCount, 3, "genau ein „Technische Details“-Bereich je Kettenschritt");
    const detailsTags = html.match(/<details\b[^>]*>/g) || [];
    assert.ok(detailsTags.length > 0, "es müssen <details>-Bereiche vorhanden sein");
    detailsTags.forEach((tag) => assert.doesNotMatch(tag, /\bopen\b/, `${tag} darf standardmäßig nicht geöffnet sein`));
  });

  await check("V8.2-8./9./10./11.: der vollständige Fachinhalt und der byteidentische Rohtext bleiben vollständig erhalten; Runner/Digests/IDs stehen ausschließlich unter „Technische Details“", async () => {
    const html = diagnosticsHtml();
    // 8./9.: vollständiger Fachinhalt (auch die offen weggelassenen Items) und
    // vollständiger, unveränderter Rohtext bleiben je genau einmal erhalten.
    ["V82-Kernbefund eins.", "V82-Kernbefund zwei.", "V82-Kernbefund drei.", "V82-Kernbefund vier.", "V82-Reibungsverlust eins.", "V82-Verbesserung eins."].forEach((needle) => {
      assert.match(html, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
    [1, 2, 3].forEach((stepNumber) => {
      const needle = `Rohtext Kettenschritt ${stepNumber} (V8.2-Auftrag) \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert.`;
      assert.strictEqual(html.split(needle).length - 1, 1, `der Rohtext von Schritt ${stepNumber} muss genau einmal, byteidentisch erhalten bleiben`);
    });
    // 10./11.: Runner/Digests/IDs stehen ausschließlich innerhalb von „Technische Details“.
    const technicalBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-result-technical">[\s\S]*?<\/details>/g) || [];
    assert.strictEqual(technicalBlocks.length, 3);
    technicalBlocks.forEach((block) => {
      assert.match(block, /Prompt-Digest: d{64}/);
      assert.match(block, /Kernauftrag-Digest: c{64}/);
    });
    // 11.: der neu eingeführte, offene Entscheidungskopf selbst (Fazit,
    // Kernpunkte, Empfehlung, Entscheidung, Risiko-/Grenzen-Hinweis) darf
    // keine Runner-/Digest-/ID-Angaben nennen. Die bereits vor V8.2
    // bestehende, technische Stufenkopfzeile (Stufenauftrag/executionRunId
    // je Kettenschritt) ist NICHT Teil von resultPresentation und bleibt
    // durch diesen Auftrag unverändert (Auftrag Abschnitt 9/10).
    var decisionBlockPattern = /<p class="pilot-work-order-decision-verdict">[\s\S]*?<\/p>|<div class="pilot-work-order-key-points">[\s\S]*?<\/div>|<div class="pilot-work-order-recommendation">[\s\S]*?<\/div>|<div class="pilot-work-order-decision-required">[\s\S]*?<\/div>|<div class="pilot-work-order-risk-note">[\s\S]*?<\/div>|<p class="pilot-work-order-result-status">[\s\S]*?<\/p>/g;
    var decisionBlocks = html.match(decisionBlockPattern) || [];
    assert.ok(decisionBlocks.length > 0, "es müssen offene Entscheidungsblöcke vorhanden sein");
    decisionBlocks.forEach((block) => {
      assert.doesNotMatch(block, /Prompt-Digest|Kernauftrag-Digest|executionRunId|Runner|presetId/, `${block} darf keine technischen Angaben enthalten`);
    });
  });

  await check("V8.2-Setup (kein Entscheidungsabschnitt vorhanden): ein zweiter, eigenständiger PM-Lauf ohne Abschnitt 4 wird angelegt", async () => {
    const noDecisionOrderId = "pilot-order-v82-no-decision";
    const noDecisionChainId = "pilot-agent-chain-v82-no-decision-1";
    const noDecisionRunId = "pilot-agent-run-v82-no-decision-3";
    const run3NoDecision = {
      id: noDecisionRunId,
      presetId: "codex-pm-evaluate-chain",
      pilotRole: "PROJEKTMANAGER",
      pilotRoleLabel: "Testrolle",
      taskTitle: "Kettenschritt 3",
      runnerId: "codex-read-only-analysis",
      runnerLabel: "Codex \u2013 echter, isolierter Read-Only-KI-Agentenlauf",
      requestedRunnerKind: "CODEX_READ_ONLY",
      actualRunnerKind: "CODEX_READ_ONLY",
      aiExecuted: true,
      fallbackUsed: false,
      modelLabel: "Codex (ChatGPT)",
      runnerVersion: "codex-cli 0.999.0-test",
      status: "SUCCEEDED",
      promptDigest: "e".repeat(64),
      mandateDigest: "f".repeat(64),
      resultTruncated: false,
      resultRawText: "Rohtext ohne Entscheidungsabschnitt (V8.2-Auftrag) \u2013 vollst\u00e4ndig unver\u00e4ndert gespeichert.",
      resultSummary: { secretRedactionApplied: false, secretRedactionNotice: null, analyzedFiles: ["V1_BETRIEBSHANDBUCH.md"] },
      errorMessage: null,
      handoffStatus: "SUCCEEDED",
      handoffErrorMessage: null,
      startedAt: "2026-08-04T09:00:00.000Z",
      finishedAt: "2026-08-04T09:01:00.000Z",
      resultPresentation: {
        structureStatus: "STRUCTURED",
        // Bewusst nur vier Abschnitte (kein Abschnitt 4, "PRIORISIERTE
        // ENTSCHEIDUNGEN") – testet, dass ohne echte Entscheidung kein
        // erfundener Entscheidungsblock erscheint (Auftrag Abschnitt 11,
        // Prüfpunkt 5).
        sections: [
          { number: 1, title: "GESAMTURTEIL", kind: "PROSE", prose: "V82b-Gesamturteil ohne Entscheidungsabschnitt.", items: [] },
          { number: 2, title: "WICHTIGSTE BELEGTE STAERKEN", kind: "ITEMS", prose: null, items: ["V82b-St\u00e4rke eins."] },
          { number: 3, title: "WICHTIGSTE BELEGTE SCHWAECHEN", kind: "ITEMS", prose: null, items: ["V82b-Schw\u00e4che eins."] },
          { number: 5, title: "EMPFEHLUNG AN JAMAL", kind: "PROSE", prose: "V82b-Empfehlung ohne Entscheidungsabschnitt.", items: [] },
        ],
        rawTextAvailable: true,
        contractStage: "PROJECT_MANAGER",
        resultLabel: "Projektmanager-Ergebnis",
        honestNotice: null,
      },
    };
    backend.createOrder(noDecisionOrderId, {
      title: "Pilotauftrag: V8.2 ohne Entscheidungsabschnitt (Testfixtur)",
      status: "COMPLETED",
      statusLabel: "Abgeschlossen",
      revision: 1,
      handoffs: [],
      agentExecutionRuns: [run3NoDecision],
      agentChains: [
        {
          id: noDecisionChainId,
          chainStatus: "COMPLETED",
          currentStep: 3,
          revision: 1,
          selectedFilesFixed: true,
          selectedFiles: ["V1_BETRIEBSHANDBUCH.md"],
          mandateDigest: "f".repeat(64),
          completedAt: "2026-08-04T09:03:00.000Z",
          steps: [
            { stepNumber: 1, agentKey: "review-agent", presetId: "codex-chain-research-analysis", stepStatus: "PENDING", approvalStatus: "NOT_REQUESTED", executionRunId: null },
            { stepNumber: 2, agentKey: "documentation-agent", presetId: "codex-document-chain-result", stepStatus: "PENDING", approvalStatus: "NOT_REQUESTED", executionRunId: null },
            { stepNumber: 3, agentKey: "orchestrator-agent", presetId: "codex-pm-evaluate-chain", stepStatus: "SUCCEEDED", approvalStatus: "GRANTED", executionRunId: noDecisionRunId, roleHandoffBooked: true },
          ],
        },
      ],
    });
    fetchCalls.length = 0;
    await ui.selectOrder(noDecisionOrderId);
    assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0);
    const html = diagnosticsHtml();
    assert.match(html, /V82b-Gesamturteil ohne Entscheidungsabschnitt\./);
    assert.doesNotMatch(html, /Entscheidung erforderlich/, "ohne echten Entscheidungsabschnitt darf kein erfundener Entscheidungsblock erscheinen");
  });

  await check("V8.2-14.: Rollenübergaben zeigen offen nur von Rolle, an Rolle, Filterstatus und Kurzbefund; der vollständige Wortlaut steht unter „Übergabedetails“", async () => {
    await ui.selectOrder(v82OrderId);
    const html = diagnosticsHtml();
    assert.match(html, /von RECHERCHE_ANALYSE an Dokumentations-Agent/);
    assert.match(html, /Filterstatus: PASSED/);
    assert.match(html, /Kurzbefund: V82-Kurzbefund f\u00fcr Handoff\./);
    const handoffDetailsBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-handoff-details">[\s\S]*?<\/details>/g) || [];
    assert.strictEqual(handoffDetailsBlocks.length, 1, "genau ein „Übergabedetails“-Bereich für diese eine Rollenübergabe");
    assert.match(handoffDetailsBlocks[0], /V82-Ergebnis\/Empfehlung Volltext\./);
    assert.match(handoffDetailsBlocks[0], /V82-Grundlage Volltext\./);
    assert.match(handoffDetailsBlocks[0], /V82-Risiko Volltext\./);
    assert.match(handoffDetailsBlocks[0], /V82-N\u00e4chster Schritt Volltext\./);
    // Der vollständige Wortlaut steht NICHT zusätzlich offen außerhalb von „Übergabedetails“.
    const outsideHandoffDetails = html.split(/<details class="pilot-work-order-details pilot-work-order-handoff-details">[\s\S]*?<\/details>/g).join("");
    assert.doesNotMatch(outsideHandoffDetails, /V82-Ergebnis\/Empfehlung Volltext\./);
  });

  // -------------------------------------------------------------------
  // V8.2.1 ("Technischen Kopf einklappen") – dieselbe, bereits durch V8.2
  // offen sichtbare Entscheidungsansicht (Zwischenergebnis/Gesamtbewertung,
  // Fazit, höchstens drei Kernpunkte, Empfehlung, Entscheidung, Risiken/
  // Grenzen, „Fachliche Details“, „Technische Details“) bleibt vollständig
  // unverändert. Zusätzlich geprüft: der vormals offen VOR dem Ergebnis
  // stehende technische Kopf (Agent, Status/Freigabe, Kernauftrag,
  // Stufenauftrag, executionRunId, Vorgängerlauf, Rollenverbuchung,
  // tatsächlich verwendete Dateien) steht jetzt ausschließlich innerhalb
  // eines neuen, standardmäßig geschlossenen Bereichs „Auftrags- und
  // Laufdetails“ NACH „Technische Details“ – nichts davon wurde entfernt,
  // gekürzt oder umformuliert.
  // -------------------------------------------------------------------
  await check("V8.2.1-1.: pro erfolgreichem Kettenschritt existiert genau ein neuer, standardmäßig geschlossener Bereich „Auftrags- und Laufdetails“ zusätzlich zu „Fachliche Details“/„Technische Details“", async () => {
    const html = diagnosticsHtml();
    const orderRunDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-order-run-details"').length - 1;
    assert.strictEqual(orderRunDetailsCount, 3, "genau ein „Auftrags- und Laufdetails“-Bereich je erfolgreichem Kettenschritt");
    const orderRunDetailsBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-order-run-details">[\s\S]*?<\/details>/g) || [];
    assert.strictEqual(orderRunDetailsBlocks.length, 3);
    orderRunDetailsBlocks.forEach((block) => assert.doesNotMatch(block, /\bopen\b/, "„Auftrags- und Laufdetails“ darf standardmäßig nicht geöffnet sein"));
    const fachlicheDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-fachlich"').length - 1;
    const technicalDetailsCount = html.split('class="pilot-work-order-details pilot-work-order-result-technical"').length - 1;
    assert.strictEqual(fachlicheDetailsCount, 3, "„Fachliche Details“ bleibt unverändert dreimal vorhanden");
    assert.strictEqual(technicalDetailsCount, 3, "„Technische Details“ bleibt unverändert dreimal vorhanden");
    const allDetailsTags = html.match(/<details\b[^>]*>/g) || [];
    assert.ok(allDetailsTags.length >= 9, "es müssen mindestens neun <details>-Bereiche vorhanden sein (3x je Ebene)");
    allDetailsTags.forEach((tag) => assert.doesNotMatch(tag, /\bopen\b/, `${tag} darf standardmäßig nicht geöffnet sein`));
  });

  await check("V8.2.1-2.: der vormals offene technische Kopf (Agent, Status/Freigabe, Kernauftrag, Stufenauftrag, executionRunId, Rollenverbuchung, tatsächlich verwendete Dateien) bleibt vollständig erhalten, ausschließlich innerhalb von „Auftrags- und Laufdetails“", async () => {
    const html = diagnosticsHtml();
    const orderRunDetailsBlocks = html.match(/<details class="pilot-work-order-details pilot-work-order-order-run-details">[\s\S]*?<\/details>/g) || [];
    assert.strictEqual(orderRunDetailsBlocks.length, 3);
    orderRunDetailsBlocks.forEach((block, index) => {
      const stepNumber = index + 1;
      assert.match(block, /Agent: /, `Schritt ${stepNumber}: „Agent“ muss vollständig erhalten bleiben`);
      assert.match(block, /Status: .*Freigabe: /, `Schritt ${stepNumber}: „Status“/„Freigabe“ müssen vollständig erhalten bleiben`);
      assert.match(block, /Stufenauftrag: /, `Schritt ${stepNumber}: „Stufenauftrag“ muss vollständig erhalten bleiben`);
      assert.match(block, /Kernauftrag f\u00fcr diese Altkette nicht mitgef\u00fchrt/, `Schritt ${stepNumber}: der Kernauftrag-Hinweis muss vollständig erhalten bleiben`);
      assert.match(block, new RegExp(v82RunIds[stepNumber]), `Schritt ${stepNumber}: executionRunId muss vollständig erhalten bleiben`);
      assert.match(block, /Rollenverbuchung: erfolgt/, `Schritt ${stepNumber}: „Rollenverbuchung“ muss vollständig erhalten bleiben`);
      assert.match(block, /Tats\u00e4chlich verwendete Dateien: /, `Schritt ${stepNumber}: die tatsächlich verwendeten Dateien müssen vollständig erhalten bleiben`);
    });
    assert.match(orderRunDetailsBlocks[1], new RegExp("Vorg\u00e4nger-executionRunId: " + v82RunIds[1]), "Schritt 2: der Vorgängerlauf muss vollständig erhalten bleiben");
    assert.match(orderRunDetailsBlocks[2], new RegExp("Vorg\u00e4nger-executionRunId: " + v82RunIds[2]), "Schritt 3: der Vorgängerlauf muss vollständig erhalten bleiben");
    // Dieselben Angaben stehen nicht mehr zusätzlich offen außerhalb von „Auftrags- und Laufdetails“ (kein Duplikat, aber auch kein Verlust).
    const outsideOrderRunDetails = html.split(/<details class="pilot-work-order-details pilot-work-order-order-run-details">[\s\S]*?<\/details>/g).join("");
    [1, 2, 3].forEach((stepNumber) => {
      assert.doesNotMatch(outsideOrderRunDetails, new RegExp("executionRunId: " + v82RunIds[stepNumber]), `Schritt ${stepNumber}: executionRunId darf offen nicht mehr erscheinen`);
    });
    assert.doesNotMatch(outsideOrderRunDetails, /Tats\u00e4chlich verwendete Dateien: /, "die verwendeten Dateien dürfen offen nicht mehr erscheinen");
    assert.doesNotMatch(outsideOrderRunDetails, /Stufenauftrag: /, "„Stufenauftrag“ darf offen nicht mehr erscheinen");
  });

  await check("V8.2.1-3.: nach dem Öffnen eines abgeschlossenen Kettenschritts stehen Rollenname und Ergebnis (Gesamtbewertung, Fazit, Kernpunkte, Empfehlung, Entscheidung, Risiken) unmittelbar sichtbar VOR „Fachliche Details“, „Technische Details“ und „Auftrags- und Laufdetails“ – ohne technischen Kopf und ohne Schaltflächen dazwischen", async () => {
    const html = diagnosticsHtml();
    const gesamtbewertungIndex = html.indexOf("<strong>Gesamtbewertung</strong>");
    assert.ok(gesamtbewertungIndex >= 0, "die Gesamtbewertung der PM-Stufe muss offen sichtbar sein");
    const fachlicheDetailsIndex = html.indexOf('class="pilot-work-order-details pilot-work-order-result-fachlich"', gesamtbewertungIndex);
    const technischeDetailsIndex = html.indexOf('class="pilot-work-order-details pilot-work-order-result-technical"', gesamtbewertungIndex);
    const auftragsDetailsIndex = html.indexOf('class="pilot-work-order-details pilot-work-order-order-run-details"', gesamtbewertungIndex);
    assert.ok(fachlicheDetailsIndex >= 0 && technischeDetailsIndex >= 0 && auftragsDetailsIndex >= 0, "alle drei eingeklappten Bereiche müssen für Schritt 3 vorhanden sein");
    assert.ok(
      gesamtbewertungIndex < fachlicheDetailsIndex && fachlicheDetailsIndex < technischeDetailsIndex && technischeDetailsIndex < auftragsDetailsIndex,
      "Reihenfolge muss sein: Ergebnis -> „Fachliche Details“ -> „Technische Details“ -> „Auftrags- und Laufdetails“",
    );
    const step3TitleIndex = html.lastIndexOf("<strong>Schritt 3", gesamtbewertungIndex);
    assert.ok(step3TitleIndex >= 0 && step3TitleIndex < gesamtbewertungIndex);
    const headSlice = html.slice(step3TitleIndex, gesamtbewertungIndex);
    assert.doesNotMatch(
      headSlice,
      /executionRunId|Stufenauftrag|Kernauftrag f\u00fcr diese Altkette|Rollenverbuchung|Status: |<button/,
      "zwischen Rollenname und Ergebnis dürfen für einen bereits abgeschlossenen Schritt keine technischen Kopfangaben oder Schaltflächen mehr offen stehen",
    );
  });

  await check("V8.2.1-4.: reines Rendern/Auswählen des bereits abgeschlossenen V8.2-Auftrags löst weiterhin keinen POST, keinen Statuswechsel und keine Kettenaktion aus", async () => {
    fetchCalls.length = 0;
    await ui.selectOrder(v82OrderId);
    ui.render();
    ui.render();
    assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0, "reines Auswählen/Rendern darf keinen POST auslösen");
    assert.strictEqual(ui.getState().overview.status, "COMPLETED", "kein Statuswechsel durch reines Rendern");
    assert.strictEqual(ui.getState().overview.agentChains[0].chainStatus, "COMPLETED", "keine Kettenaktion durch reines Rendern");
  });

  await check("V8.2-15./16.: reines Rendern des V8.2-Auftrags löst keinen POST/Kettenstart/Rollenübergabe/Statuswechsel aus; der abgeschlossene Auftrag bleibt vollständig dargestellt", async () => {
    fetchCalls.length = 0;
    ui.render();
    ui.render();
    assert.strictEqual(fetchCalls.length, 0, "reines Rendern darf keinen fetch auslösen");
    assert.strictEqual(ui.getState().overview.status, "COMPLETED", "kein Statuswechsel durch reines Rendern");
    const html = diagnosticsHtml();
    assert.match(html, /Schritt 1 \u2013 Recherche\/Analyse/);
    assert.match(html, /Schritt 2 \u2013 Dokumentation/);
    assert.match(html, /Schritt 3 \u2013 Projektmanager-Bewertung/);
    [1, 2, 3].forEach((stepNumber) => assert.match(html, new RegExp(v82RunIds[stepNumber])));
  });

  // -------------------------------------------------------------------------
  // Arbeitspaket "Rein darstellende Fehler in der Pilotauftragskarte
  // bereinigen": die sichtbare Überschrift der Schritt-Empfehlung
  // (.pilot-chain-status-card__next) setzt ausschließlich
  // renderChainStatusCard. Vorher setzten sieben Textzweige und
  // nextChainStepHint() dieselbe Überschrift zusätzlich in ihren eigenen Text –
  // sichtbar entstand dadurch eine doppelte Überschrift bzw. eine
  // Präfixkollision zwischen der normalen und der abgeschwächten Variante.
  //
  // Geprüft wird am tatsächlich gerenderten HTML beider Ausgabecontainer über
  // alle Kettenzustände, die die Fixtur bis hierher real aufgebaut hat.
  //
  // V8.10.2: die beiden Überschriften benennen jetzt ausdrücklich die Ebene
  // (Agentenkette statt Auftrag). Die Prüfungen selbst sind unverändert scharf –
  // nur die erwarteten Wortlaute sind nachgezogen.
  // -------------------------------------------------------------------------

  const NEXT_LABEL_SAFE = "Nächster Schritt in der Agentenkette";
  const NEXT_LABEL_ALLOWED = "Möglicher nächster Schritt in der Agentenkette";

  function chainStatusCardSections(html) {
    return html.match(/<section class="pilot-chain-status-card[\s\S]*?<\/section>/g) || [];
  }

  function assertNextStepLineIsClean(cardHtml, context) {
    assert.doesNotMatch(cardHtml, new RegExp(`${NEXT_LABEL_SAFE}:\\s*${NEXT_LABEL_SAFE}:`), `${context}: doppeltes „${NEXT_LABEL_SAFE}“`);
    assert.doesNotMatch(cardHtml, new RegExp(`${NEXT_LABEL_SAFE}:\\s*${NEXT_LABEL_ALLOWED}:`), `${context}: Präfixkollision sicher/erlaubt`);
    assert.doesNotMatch(cardHtml, new RegExp(`${NEXT_LABEL_ALLOWED}:\\s*${NEXT_LABEL_SAFE}:`), `${context}: Präfixkollision erlaubt/sicher`);
    const safeCount = (cardHtml.match(new RegExp(NEXT_LABEL_SAFE, "g")) || []).length;
    const allowedCount = (cardHtml.match(new RegExp(NEXT_LABEL_ALLOWED, "g")) || []).length;
    assert.strictEqual(safeCount + allowedCount, 1, `${context}: die Schritt-Überschrift muss je Kettenstatuskarte genau einmal erscheinen`);
    const nextLine = cardHtml.match(/<p class="pilot-chain-status-card__next">([\s\S]*?)<\/p>/);
    assert.ok(nextLine, `${context}: die Schritt-Empfehlung muss vorhanden bleiben`);
    assert.match(
      nextLine[1],
      new RegExp(`^<strong>(?:${NEXT_LABEL_SAFE}|${NEXT_LABEL_ALLOWED}):</strong> \\S`),
      `${context}: genau eine Überschrift, danach ein nicht leerer Text`,
    );
  }

  await check(
    "DARST-1./2./3./6./9.: über alle real vorhandenen Kettenzustände erscheint die Schritt-Überschrift je Kettenstatuskarte genau einmal, in beiden Ausgabecontainern",
    async () => {
      const orderIds = Array.from(backend.orders.keys());
      assert.ok(orderIds.length >= 5, "Testfixtur: mehrere Aufträge mit unterschiedlichen Kettenzuständen müssen vorliegen");
      let inspectedCards = 0;
      let failureCardsSeen = 0;
      for (const orderId of orderIds) {
        forcedOrderReadFailureCount = 0;
        fetchCalls.length = 0;
        // eslint-disable-next-line no-await-in-loop
        await ui.selectOrder(orderId);
        ui.render();
        [
          ["obere Karte", orderHtml()],
          ["Detailbereich", diagnosticsHtml()],
        ].forEach(([where, html]) => {
          const cards = chainStatusCardSections(html);
          assert.strictEqual(cards.length, 1, `${orderId} / ${where}: genau eine Kettenstatuskarte je Container`);
          cards.forEach((card) => {
            assertNextStepLineIsClean(card, `${orderId} / ${where}`);
            assert.match(card, /<h4 class="pilot-chain-status-card__title">\S/, `${orderId} / ${where}: der Zustandstitel bleibt erhalten`);
            if (/pilot-chain-status-card--failure/.test(card)) {
              failureCardsSeen += 1;
              assert.match(card, /<details class="pilot-chain-status-card__technical"><summary>Technische Details<\/summary>/, `${orderId} / ${where}: technische Fehlerdetails bleiben erreichbar`);
            }
            inspectedCards += 1;
          });
        });
        assert.strictEqual(
          fetchCalls.filter((entry) => entry.method === "POST").length,
          0,
          `${orderId}: reines Auswählen und Rendern darf keinen POST auslösen`,
        );
      }
      assert.ok(inspectedCards >= 8, `es müssen mehrere Karten geprüft worden sein (geprüft: ${inspectedCards})`);
      assert.ok(failureCardsSeen >= 1, "mindestens ein Fehlerzustand muss mitgeprüft worden sein");
      timerHarness.clearAll();
    },
  );

  await check(
    "DARST-4./5.: die fachliche Abschwächung „Möglicher nächster Schritt in der Agentenkette“ bleibt bei vollständig durchgelaufener Kette sichtbar erhalten",
    async () => {
      const order = backend.orders.get(v81CompletedOrderId);
      assert.ok(order, "Testfixtur: der Auftrag mit vollständig abgeschlossener Kette muss vorhanden sein");
      const originalStatus = order.status;
      const originalStatusLabel = order.statusLabel;
      // Der Zweig der abgeschlossenen Kette ist nur im laufenden
      // Ausführungsstatus erreichbar (siehe renderChainStatusCard); der
      // Auftragsstatus wird ausschließlich in der Fixtur gesetzt und danach
      // wieder zurückgestellt – keine echte Statusänderung über die UI.
      order.status = "IN_EXECUTION";
      order.statusLabel = "In Ausführung";
      order.revision += 1;
      ui.getState().chainStartBridge = null;
      fetchCalls.length = 0;
      await ui.selectOrder(v81CompletedOrderId);
      await ui.reloadSelectedOrder();
      ui.render();
      const card = chainStatusCardSections(orderHtml())[0] || "";
      assert.match(card, /Alle drei Schritte abgeschlossen\./, "Testfixtur muss den Zweig der abgeschlossenen Kette erreichen");
      assert.match(
        card,
        new RegExp(`<strong>${NEXT_LABEL_ALLOWED}:</strong> bei Bedarf oben manuell zur Abschlussprüfung vorlegen\\.`),
        "die Abschwächung „erlaubt“ muss sichtbar bleiben",
      );
      assert.doesNotMatch(card, new RegExp(NEXT_LABEL_SAFE), "hier darf ausdrücklich NICHT die uneingeschränkte Variante stehen");
      assertNextStepLineIsClean(card, "abgeschlossene Kette");
      assert.match(card, /Der Pilotauftrag selbst ist damit noch nicht automatisch abgenommen\./);
      assert.match(card, /Es wurde nichts automatisch weitergestartet\./);
      assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0, "kein POST durch diese Darstellung");
      order.status = originalStatus;
      order.statusLabel = originalStatusLabel;
      order.revision += 1;
      await ui.reloadSelectedOrder();
      assert.strictEqual(ui.getState().overview.status, originalStatus, "der Auftragsstatus der Fixtur ist wieder zurückgestellt");
    },
  );

  // -------------------------------------------------------------------------
  // Teilpaket 2 – "Kettenstatus nach Ausführung zeitlich und fachlich wahr
  // darstellen".
  //
  // Ursache: renderChainStatusCard() prüfte als ERSTEN Zweig pauschal
  // overview.status !== "IN_EXECUTION" und behauptete daraufhin, die
  // Drei-Agenten-Kette sei "noch nicht aktiv" – auch bei einem COMPLETED-
  // Auftrag mit vollständig abgeschlossener Kette. Der Auftragsstatus wurde
  // damit als Beweis über die Kette missbraucht.
  //
  // Geprüft wird hier der ECHTE Renderer gegen vollständige, von Hand
  // aufgebaute Kettenstände. Die Wahrheitshierarchie ist verbindlich:
  // "vollständig abgeschlossen" darf ausschließlich aus chainStatus ===
  // "COMPLETED" der konkret dargestellten Kette folgen, niemals aus 3 von 3
  // verbuchten Rollen und niemals aus dem Auftragsstatus.
  // -------------------------------------------------------------------------

  const PAST_NO_CHAIN = "Für diesen Auftrag wurde keine Drei-Agenten-Kette verwendet.";
  const PAST_PREPARED = "Eine Drei-Agenten-Kette wurde vorbereitet, aber nicht gestartet.";
  const PAST_PARTIAL = "Die Drei-Agenten-Kette wurde teilweise ausgeführt.";
  const PAST_BLOCKED = "Die Drei-Agenten-Kette wurde während der Ausführung blockiert.";
  const PAST_FAILED = "Die Drei-Agenten-Kette konnte nicht vollständig abgeschlossen werden.";
  const PAST_COMPLETED = "Die Drei-Agenten-Kette wurde vollständig abgeschlossen.";
  const HISTORY_NEXT_LINE = "unten den vollständigen Kettenstand nachlesen.";

  // Formulierungen, die einen Blick nach vorn oder eine Handlung verlangen.
  const FUTURE_PHRASES = ["jetzt starten", "freigeben", "vorlegen", "bei Bedarf", "erneut", "Bitte ", "warten", "vorbereiten"];
  // Formulierungen, die zur Auftragsachse gehören und in der Kettenkarte
  // nichts zu suchen haben (Produktentscheidung P3).
  const ORDER_AXIS_PHRASES = ["Abschlussprüfung", "abnehmen", "abgenommen", "zurückgegeben", "Rückgabe", "Jamal"];

  const TP2_TIME = "2026-02-01T09:00:00.000Z";
  const TP2_ORDER_NEXT_STEP = "Jamal entscheidet über die Abnahme des Ergebnisses.";

  function tp2Step(stepNumber, overrides) {
    return Object.assign(
      {
        stepNumber,
        agentKey: CHAIN_STEP_DEFINITIONS[stepNumber - 1].agentKey,
        presetId: CHAIN_STEP_DEFINITIONS[stepNumber - 1].presetId,
        stepStatus: "PENDING",
        approvalStatus: "NOT_REQUESTED",
        executionRunId: null,
        startedAt: null,
        completedAt: null,
        roleHandoffBooked: false,
        failureReasonCode: null,
      },
      overrides,
    );
  }

  function tp2SucceededStep(stepNumber) {
    return tp2Step(stepNumber, {
      stepStatus: "SUCCEEDED",
      approvalStatus: "GRANTED",
      executionRunId: `tp2-run-${stepNumber}`,
      startedAt: TP2_TIME,
      completedAt: TP2_TIME,
      roleHandoffBooked: true,
    });
  }

  function tp2Chain(overrides) {
    return Object.assign(
      {
        id: "tp2-chain",
        chainStatus: "PREPARED",
        currentStep: 1,
        revision: 0,
        waitingForJamal: false,
        blockReason: null,
        completedAt: null,
        createdAt: TP2_TIME,
        updatedAt: TP2_TIME,
        steps: [tp2Step(1), tp2Step(2), tp2Step(3)],
      },
      overrides,
    );
  }

  function tp2CompletedChain(overrides) {
    return tp2Chain(
      Object.assign(
        {
          chainStatus: "COMPLETED",
          currentStep: 3,
          completedAt: TP2_TIME,
          steps: [tp2SucceededStep(1), tp2SucceededStep(2), tp2SucceededStep(3)],
        },
        overrides,
      ),
    );
  }

  function tp2Overview(status, chains, overrides) {
    return Object.assign(
      {
        order: { id: "tp2-order", title: "Titel", status, statusLabel: status, revision: 0 },
        status,
        statusLabel: status,
        agentChains: chains,
        agentExecutionRuns: [],
        handoffs: [],
        progress: { rolesPassed: 0, rolesTotal: 3, chainRolesBooked: 0 },
        chainRoleProgress: { bookedRoles: [], bookedCount: 0, totalCount: 3 },
        nextStep: TP2_ORDER_NEXT_STEP,
      },
      overrides,
    );
  }

  // Rendert die Karte aus einem definierten, neutralen Bedienzustand heraus:
  // keine lokal angenommene Startanforderung, kein Aktionsfehler, kein
  // angehaltenes Polling. Damit prüft der Test ausschließlich die Zeit- und
  // Zustandswahrheit, nicht zufällige Restzustände früherer Prüfpunkte.
  function tp2Card(overview) {
    const uiState = ui.getState();
    uiState.chainStartBridge = null;
    uiState.chainActionError = null;
    uiState.chainActionErrorReasonCode = null;
    uiState.statusPollingStoppedByErrors = false;
    uiState.statusPollingStoppedBySafetyCap = false;
    uiState.statusPollingRetryNoticeActive = false;
    fetchCalls.length = 0;
    const html = ui.renderChainStatusCard(overview);
    assert.strictEqual(fetchCalls.length, 0, "das Rendern der Kettenstatuskarte darf keinen Request auslösen");
    return html;
  }

  function tp2Title(cardHtml) {
    const match = cardHtml.match(/<h4 class="pilot-chain-status-card__title">([\s\S]*?)<\/h4>/);
    assert.ok(match, "die Kettenstatuskarte muss einen Titel besitzen");
    return match[1];
  }

  function tp2NextLine(cardHtml) {
    const match = cardHtml.match(/<p class="pilot-chain-status-card__next">([\s\S]*?)<\/p>/);
    assert.ok(match, "die Kettenstatuskarte muss eine Schritt-Empfehlung besitzen");
    return match[1];
  }

  // Die technischen Fehlerdetails sind ein bewusst geschlossener Bereich mit
  // eigenem, festem Wortlaut; die Zeitform-Prüfung gilt der sichtbaren
  // Kernaussage der Karte.
  function tp2VisibleCore(cardHtml) {
    return cardHtml.replace(/<details class="pilot-chain-status-card__technical">[\s\S]*?<\/details>/, "");
  }

  function assertPurePastStatement(cardHtml, context) {
    const core = tp2VisibleCore(cardHtml);
    FUTURE_PHRASES.forEach((phrase) => {
      assert.ok(!core.includes(phrase), `${context}: keine Zukunfts-/Handlungsformulierung erlaubt („${phrase}“)`);
    });
    ORDER_AXIS_PHRASES.forEach((phrase) => {
      assert.ok(!core.includes(phrase), `${context}: die Kettenkarte wiederholt die Auftragsachse nicht („${phrase}“)`);
    });
    assert.ok(!core.includes(TP2_ORDER_NEXT_STEP), `${context}: der Auftrags-Nächster-Schritt gehört nicht in die Kettenkarte`);
    assertNextStepLineIsClean(cardHtml, context);
  }

  await check("TP2-1./20./21.: COMPLETED ohne jede Kette sagt genau das – ohne Zukunftsaufforderung und ohne Auftragsentscheidung", async () => {
    const card = tp2Card(tp2Overview("COMPLETED", []));
    assert.strictEqual(tp2Title(card), PAST_NO_CHAIN);
    assert.ok(tp2NextLine(card).includes(HISTORY_NEXT_LINE));
    assertPurePastStatement(card, "COMPLETED ohne Kette");
    assert.ok(!card.includes(PAST_COMPLETED), "ohne Kette darf kein Kettenabschluss behauptet werden");
  });

  await check("TP2-2.: COMPLETED mit vorbereiteter, nie gestarteter Kette wird sichtbar von „nie verwendet“ unterschieden", async () => {
    const card = tp2Card(tp2Overview("COMPLETED", [tp2Chain({})]));
    assert.strictEqual(tp2Title(card), PAST_PREPARED);
    assert.notStrictEqual(tp2Title(card), PAST_NO_CHAIN, "die beiden Fälle dürfen nicht zusammenfallen");
    assertPurePastStatement(card, "COMPLETED mit vorbereiteter Kette");
  });

  await check("TP2-3.: COMPLETED mit teilweise ausgeführter Kette sagt „teilweise ausgeführt“", async () => {
    const chain = tp2Chain({
      chainStatus: "WAITING_FOR_DOCUMENTATION_APPROVAL",
      currentStep: 2,
      steps: [tp2SucceededStep(1), tp2Step(2), tp2Step(3)],
    });
    const card = tp2Card(tp2Overview("COMPLETED", [chain]));
    assert.strictEqual(tp2Title(card), PAST_PARTIAL);
    assert.ok(!card.includes(PAST_COMPLETED));
    assertPurePastStatement(card, "COMPLETED mit teilweiser Kette");
  });

  await check("TP2-4.: COMPLETED mit chainStatus COMPLETED sagt endlich die Wahrheit – vollständig abgeschlossen, in der Vergangenheitsform", async () => {
    const card = tp2Card(tp2Overview("COMPLETED", [tp2CompletedChain({})]));
    assert.strictEqual(tp2Title(card), PAST_COMPLETED);
    assert.match(card, /pilot-chain-status-card--success/);
    assertPurePastStatement(card, "COMPLETED mit abgeschlossener Kette");
    assert.ok(!card.includes("noch nicht aktiv"), "der widerlegte Pauschaltext darf nicht mehr erscheinen");
  });

  await check("TP2-5./19./30.: COMPLETED mit fehlgeschlagener Kette (trotz gesetztem completedAt) erscheint niemals als „vollständig abgeschlossen“", async () => {
    const chain = tp2Chain({
      chainStatus: "FAILED",
      currentStep: 2,
      completedAt: TP2_TIME,
      steps: [tp2SucceededStep(1), tp2Step(2, { stepStatus: "FAILED", approvalStatus: "GRANTED", failureReasonCode: "STEP_EXECUTION_FAILED" }), tp2Step(3)],
    });
    const card = tp2Card(tp2Overview("COMPLETED", [chain]));
    assert.strictEqual(tp2Title(card), PAST_FAILED);
    assert.ok(!card.includes(PAST_COMPLETED), "completedAt allein beweist keinen Abschluss");
    assert.match(card, /pilot-chain-status-card--failure/);
    assert.match(card, /<details class="pilot-chain-status-card__technical"><summary>Technische Details<\/summary>/, "die bestehende Fehlerdarstellung bleibt erhalten");
    assert.match(card, /Die Ausführung des Schritts ist technisch fehlgeschlagen\./, "die benannte Ursache bleibt sichtbar");
    assertPurePastStatement(card, "COMPLETED mit fehlgeschlagener Kette");
  });

  await check("TP2-6.: COMPLETED mit blockierter Kette benennt die Kettenblockade und behält die technischen Details", async () => {
    const chain = tp2Chain({
      chainStatus: "BLOCKED",
      currentStep: 1,
      blockReason: "MANDATE_DIGEST_MISMATCH",
      steps: [tp2Step(1, { approvalStatus: "REQUESTED" }), tp2Step(2), tp2Step(3)],
    });
    const card = tp2Card(tp2Overview("COMPLETED", [chain]));
    assert.strictEqual(tp2Title(card), PAST_BLOCKED);
    assert.match(card, /Der Kernauftrag stimmt nicht mehr mit der signierten Version überein\./);
    assert.match(card, /<details class="pilot-chain-status-card__technical">/);
    assertPurePastStatement(card, "COMPLETED mit blockierter Kette");
  });

  await check("TP2-7.: READY_FOR_REVIEW nach vollständig abgeschlossener Kette zeigt ausschließlich den Kettenabschluss, nicht die Abnahmeentscheidung", async () => {
    const card = tp2Card(tp2Overview("READY_FOR_REVIEW", [tp2CompletedChain({})]));
    assert.strictEqual(tp2Title(card), PAST_COMPLETED);
    assertPurePastStatement(card, "READY_FOR_REVIEW nach abgeschlossener Kette");
  });

  await check("TP2-8.: RETURNED nach vollständig abgeschlossener Kette zeigt den Kettenabschluss und wiederholt die Rückgabe nicht", async () => {
    const card = tp2Card(tp2Overview("RETURNED", [tp2CompletedChain({})]));
    assert.strictEqual(tp2Title(card), PAST_COMPLETED);
    assertPurePastStatement(card, "RETURNED nach abgeschlossener Kette");
  });

  await check("TP2-9.: BLOCKED ohne Kette behauptet keine Kettenblockade", async () => {
    const card = tp2Card(tp2Overview("BLOCKED", []));
    assert.strictEqual(tp2Title(card), PAST_NO_CHAIN);
    assert.ok(!card.includes("blockiert"), "eine Auftragsblockade ist keine Kettenblockade");
    assert.doesNotMatch(card, /pilot-chain-status-card--failure/);
    assertPurePastStatement(card, "BLOCKED ohne Kette");
  });

  await check("TP2-10.: BLOCKED mit chainStatus BLOCKED benennt eindeutig die Kette – nicht den Auftrag", async () => {
    const chain = tp2Chain({ chainStatus: "BLOCKED", blockReason: "MANDATE_DIGEST_MISMATCH" });
    const card = tp2Card(tp2Overview("BLOCKED", [chain]));
    assert.strictEqual(tp2Title(card), PAST_BLOCKED);
    assertPurePastStatement(card, "BLOCKED mit blockierter Kette");
  });

  await check("TP2-11./12./13./14./15.: alle IN_EXECUTION-Zweige bleiben exakt wie bisher (Gegenwart, mit Handlungsempfehlung)", async () => {
    const withoutChain = tp2Card(tp2Overview("IN_EXECUTION", []));
    assert.strictEqual(tp2Title(withoutChain), "Noch keine Drei-Agenten-Kette vorbereitet.");
    assert.ok(tp2NextLine(withoutChain).includes("unten eine neue Agentenkette vorbereiten."));

    const prepared = tp2Card(tp2Overview("IN_EXECUTION", [tp2Chain({})]));
    assert.strictEqual(tp2Title(prepared), "Schritt 1 wartet auf Freigabe.");

    const waiting = tp2Card(
      tp2Overview("IN_EXECUTION", [tp2Chain({ chainStatus: "WAITING_FOR_RESEARCH_APPROVAL", waitingForJamal: true, steps: [tp2Step(1, { approvalStatus: "REQUESTED" }), tp2Step(2), tp2Step(3)] })]),
    );
    assert.strictEqual(tp2Title(waiting), "Schritt 1 wartet auf Freigabe.");

    const running = tp2Card(
      tp2Overview("IN_EXECUTION", [tp2Chain({ chainStatus: "RESEARCH_RUNNING", steps: [tp2Step(1, { stepStatus: "RUNNING", approvalStatus: "GRANTED", startedAt: TP2_TIME, executionRunId: "tp2-run-1" }), tp2Step(2), tp2Step(3)] })]),
    );
    assert.strictEqual(tp2Title(running), "Schritt 1 wird gerade ausgeführt.");
    assert.match(running, /pilot-chain-status-card--running/);

    const completed = tp2Card(tp2Overview("IN_EXECUTION", [tp2CompletedChain({})]));
    assert.strictEqual(tp2Title(completed), "Alle drei Schritte abgeschlossen.");
    assert.ok(tp2NextLine(completed).includes("bei Bedarf oben manuell zur Abschlussprüfung vorlegen."));
    assert.ok(tp2NextLine(completed).includes(NEXT_LABEL_ALLOWED), "die fachliche Abschwächung bleibt erhalten");
    [withoutChain, prepared, waiting, running, completed].forEach((card, index) => assertNextStepLineIsClean(card, `IN_EXECUTION-Zweig ${index + 1}`));
  });

  await check("TP2-16.: bei älterer COMPLETED-Kette und neuerer nur vorbereiteter Kette entscheidet die bestehende Auswahl – nicht „neueste Kette gewinnt“", async () => {
    const completedChain = tp2CompletedChain({ id: "tp2-chain-alt", createdAt: "2026-01-01T08:00:00.000Z" });
    const preparedChain = tp2Chain({ id: "tp2-chain-neu", createdAt: "2026-03-01T08:00:00.000Z" });
    const overview = tp2Overview("COMPLETED", [completedChain, preparedChain]);
    assert.strictEqual(overview.agentChains[overview.agentChains.length - 1].chainStatus, "PREPARED", "Testaufbau: die zuletzt angelegte Kette ist die nur vorbereitete");
    const card = tp2Card(overview);
    assert.strictEqual(tp2Title(card), PAST_COMPLETED, "die tatsächlich ausgeführte Kette repräsentiert den Kettenstand");
    assertPurePastStatement(card, "mehrere Ketten");
  });

  await check("TP2-17./18.: 3 von 3 verbuchten Rollen erzeugen ohne COMPLETED-Kette niemals eine Abschlussaussage", async () => {
    const partialA = tp2Chain({
      id: "tp2-teilkette-a",
      chainStatus: "FAILED",
      currentStep: 2,
      steps: [tp2SucceededStep(1), tp2Step(2, { stepStatus: "FAILED", failureReasonCode: "STEP_EXECUTION_FAILED" }), tp2Step(3)],
    });
    const partialB = tp2Chain({
      id: "tp2-teilkette-b",
      chainStatus: "WAITING_FOR_PM_APPROVAL",
      currentStep: 3,
      steps: [tp2SucceededStep(1), tp2SucceededStep(2), tp2Step(3)],
    });
    const overview = tp2Overview("COMPLETED", [partialA, partialB], {
      progress: { rolesPassed: 3, rolesTotal: 3, chainRolesBooked: 3 },
      chainRoleProgress: { bookedRoles: ["RECHERCHE_ANALYSE", "DOKUMENTATION", "PROJEKTMANAGEMENT"], bookedCount: 3, totalCount: 3 },
    });
    const card = tp2Card(overview);
    assert.ok(!card.includes(PAST_COMPLETED), "3 von 3 Rollen sind kein Nachweis einer abgeschlossenen Kette");
    assert.ok(
      tp2Title(card) === PAST_FAILED || tp2Title(card) === PAST_PARTIAL,
      `die Aussage muss aus dem Kettenstand kommen (tatsächlich: ${tp2Title(card)})`,
    );
    assertPurePastStatement(card, "3 von 3 ohne abgeschlossene Kette");
  });

  await check("TP2-22./23.: beide Ausgabecontainer zeigen weiterhin genau eine Kettenstatuskarte – mit identischer fachlicher Aussage", async () => {
    const orderIds = Array.from(backend.orders.keys());
    let comparedOrders = 0;
    for (const orderId of orderIds) {
      forcedOrderReadFailureCount = 0;
      // eslint-disable-next-line no-await-in-loop
      await ui.selectOrder(orderId);
      ui.render();
      const upper = chainStatusCardSections(orderHtml());
      const details = chainStatusCardSections(diagnosticsHtml());
      assert.strictEqual(upper.length, 1, `${orderId}: genau eine Kettenstatuskarte in der oberen Arbeitskarte`);
      assert.strictEqual(details.length, 1, `${orderId}: genau eine Kettenstatuskarte im Detailbereich`);
      assert.strictEqual(upper[0], details[0], `${orderId}: beide Container müssen dieselbe fachliche Aussage liefern`);
      comparedOrders += 1;
    }
    assert.ok(comparedOrders >= 5, `es müssen mehrere Aufträge verglichen worden sein (verglichen: ${comparedOrders})`);
    timerHarness.clearAll();
  });

  // -------------------------------------------------------------------------
  // V8.8 – "Kettenaktionen vor Beginn an IN_EXECUTION binden", Bediengrenze.
  //
  // Die Sicherheit liegt ausschließlich im Kettenservice (siehe
  // pilot-agent-execution-chain-service.js#assertOrderAllowsChainAction und
  // pilot-agent-execution-chain.test.js). Die Oberfläche darf lediglich keine
  // Aktion mehr anbieten, die der Server verlässlich mit 409 ablehnen würde.
  //
  // Der Ausgangszustand wird bewusst über den ECHTEN Bedienweg hergestellt
  // (Kette vorbereiten, Freigabe für Schritt 1 anfordern) – erst dadurch ist
  // die Start-Schaltfläche überhaupt bedienbar und der Test aussagekräftig.
  // Anschließend wird ausschließlich der Auftragsstatus der Fixtur gewechselt;
  // nichts anderes ändert sich.
  // -------------------------------------------------------------------------
  const pilotWorkOrderService = require("./pilot-work-order-service");
  const V88_STATUSES_WITHOUT_CHAIN_ACTIONS = [
    "DRAFT",
    "READY_FOR_JAMAL_APPROVAL",
    "APPROVED_FOR_EXECUTION",
    "READY_FOR_REVIEW",
    "COMPLETED",
    "RETURNED",
    "BLOCKED",
  ];

  let v88OrderId;
  let v88ChainId;

  function v88StepButton(html, action, stepNumber) {
    const match = html.match(new RegExp(`data-action="${action}" data-chain-id="${v88ChainId}" data-chain-step="${stepNumber}"[^>]*`));
    assert.ok(match, `die Schaltfläche ${action} für Schritt ${stepNumber} muss weiterhin gerendert werden`);
    return match[0];
  }

  async function v88SetOrderStatus(status) {
    const order = backend.orders.get(v88OrderId);
    order.status = status;
    order.statusLabel = pilotWorkOrderService.PILOT_STATUS_LABELS_DE[status];
    order.revision += 1;
    fetchCalls.length = 0;
    await ui.reloadSelectedOrder();
    ui.render();
    assert.strictEqual(ui.getState().overview.status, status, `Testfixtur: der Auftrag muss tatsächlich ${status} sein`);
  }

  await check(
    "V8.8-UI-Setup: ein IN_EXECUTION-Auftrag mit vorbereiteter Kette und tatsächlich angeforderter Freigabe – beide Kettenaktionen für Schritt 1 sind bedienbar",
    async () => {
      assert.deepStrictEqual(
        pilotWorkOrderService.PILOT_WORK_ORDER_STATUS_VALUES.slice().sort(),
        V88_STATUSES_WITHOUT_CHAIN_ACTIONS.concat(["IN_EXECUTION"]).sort(),
        "die UI-Matrix muss exakt der echten Auftragsstatusmaschine entsprechen",
      );

      v88OrderId = "pilot-order-v88-auftragsstatus-gate";
      backend.createOrder(v88OrderId, {
        title: "V8.8 Auftragsstatus-Gate (Bediengrenze)",
        status: "IN_EXECUTION",
        statusLabel: "In Ausführung",
        revision: 0,
        agentChains: [],
        agentExecutionRuns: [],
      });
      await ui.selectOrder(v88OrderId);
      await ui.prepareAgentChain();
      v88ChainId = newestChainId();
      assert.ok(v88ChainId, "die Kette muss über den echten Bedienweg vorbereitet worden sein");

      // Vor der Freigabeanforderung: die Freigabe-Schaltfläche ist im
      // zulässigen Status tatsächlich bedienbar (sonst wäre die spätere
      // "deaktiviert"-Prüfung wertlos).
      assert.ok(
        !v88StepButton(diagnosticsHtml(), "request-chain-step-approval", 1).includes("disabled"),
        "Ausgangszustand: die Freigabe-Schaltfläche muss in IN_EXECUTION bedienbar sein",
      );

      await ui.requestChainStepApproval(v88ChainId, 1);
      assert.ok(
        !v88StepButton(diagnosticsHtml(), "start-chain-step", 1).includes("disabled"),
        "Ausgangszustand: die Start-Schaltfläche muss in IN_EXECUTION mit gültiger Freigabe tatsächlich bedienbar sein",
      );
    },
  );

  for (const gateStatus of V88_STATUSES_WITHOUT_CHAIN_ACTIONS) {
    await check(
      `V8.8-UI/${gateStatus}: weder die Freigabe- noch die Start-Schaltfläche ist bedienbar; die Kettenhistorie bleibt vollständig sichtbar`,
      async () => {
        await v88SetOrderStatus(gateStatus);
        const html = diagnosticsHtml();

        assert.ok(
          v88StepButton(html, "request-chain-step-approval", 1).includes("disabled"),
          `${gateStatus}: die Freigabe-Schaltfläche darf nicht bedienbar sein`,
        );
        assert.ok(
          v88StepButton(html, "start-chain-step", 1).includes("disabled"),
          `${gateStatus}: die Start-Schaltfläche darf nicht bedienbar sein, obwohl lokal noch ein Freigabetoken vorliegt`,
        );
        [2, 3].forEach((stepNumber) => {
          assert.ok(v88StepButton(html, "request-chain-step-approval", stepNumber).includes("disabled"));
          assert.ok(v88StepButton(html, "start-chain-step", stepNumber).includes("disabled"));
        });

        // Historie unverändert vollständig lesbar (keine neue Warnbox, keine
        // neue Karte, keine neue Statusanzeige – nur keine bedienbare Aktion).
        assert.match(html, /Schritt 1 \u2013 Recherche\/Analyse/, `${gateStatus}: die Kettenhistorie muss sichtbar bleiben`);
        assert.match(html, /Schritt 2 \u2013 Dokumentation/);
        assert.match(html, /Schritt 3 \u2013 Projektmanager-Bewertung/);
        assert.ok(html.includes(v88ChainId), `${gateStatus}: die Kette selbst muss weiterhin ausgewiesen sein`);

        assert.strictEqual(
          fetchCalls.filter((entry) => entry.method === "POST").length,
          0,
          `${gateStatus}: reines Rendern in diesem Status darf keine Kettenaktion auslösen`,
        );
      },
    );
  }

  await check(
    "V8.8-UI/IN_EXECUTION: nach Rückkehr in den zulässigen Status sind Freigabe- und Startaktion unverändert wie zuvor bedienbar (der Auftragsstatus ist der einzige Unterschied)",
    async () => {
      await v88SetOrderStatus("IN_EXECUTION");
      const html = diagnosticsHtml();
      assert.ok(
        !v88StepButton(html, "start-chain-step", 1).includes("disabled"),
        "die bestehende Startaktion muss im zulässigen Status unverändert funktionieren",
      );
      assert.strictEqual(fetchCalls.filter((entry) => entry.method === "POST").length, 0);
    },
  );

  // -------------------------------------------------------------------------
  // V8.10.2 ("Nächster Schritt: Auftrag und Agentenkette klar trennen").
  //
  // Auftragsebene und Kettenebene beantworten zwei verschiedene Fragen und
  // können gleichzeitig sichtbar sein. Bis V8.10.1 hießen sie "Nächster
  // Schritt" und "Nächster sicherer Schritt" und standen damit sprachlich zu
  // nah beieinander. Geprüft wird am echten gerenderten HTML über alle
  // Kettenzustände, die die Fixtur real aufgebaut hat.
  // -------------------------------------------------------------------------

  const ORDER_LABEL = "Nächster Schritt im Auftrag";

  await check(
    "V8.10.2-1./2./4./5./8.: über alle real vorhandenen Kettenzustände benennt jede Ebene sichtbar sich selbst; die beiden alten Überschriften erscheinen nirgends mehr",
    async () => {
      const orderIds = Array.from(backend.orders.keys());
      assert.ok(orderIds.length >= 5, "Testfixtur: mehrere Aufträge mit unterschiedlichen Kettenzuständen müssen vorliegen");
      let orderLevelSeen = 0;
      let chainLevelSeen = 0;
      for (const orderId of orderIds) {
        forcedOrderReadFailureCount = 0;
        // eslint-disable-next-line no-await-in-loop
        await ui.selectOrder(orderId);
        ui.render();
        [
          ["obere Karte", orderHtml()],
          ["Detailbereich", diagnosticsHtml()],
        ].forEach(([where, html]) => {
          // 4./5. die alten Überschriften sind vollständig verschwunden.
          assert.doesNotMatch(html, /Nächster sicherer Schritt/, `${orderId} / ${where}: die alte Überschrift „sicher“ darf nicht mehr erscheinen`);
          assert.doesNotMatch(html, /Nächster erlaubter Schritt/, `${orderId} / ${where}: die alte Überschrift „erlaubt“ darf nicht mehr erscheinen`);
          // 2./3. die Kettenebene benennt sich selbst.
          const card = chainStatusCardSections(html)[0];
          assert.ok(card, `${orderId} / ${where}: die Kettenstatuskarte muss vorhanden bleiben`);
          const chainLine = card.match(/<p class="pilot-chain-status-card__next"><strong>([^<]+):<\/strong>/);
          assert.ok(chainLine, `${orderId} / ${where}: die Schritt-Empfehlung muss Überschrift und Text getrennt tragen`);
          assert.ok(
            chainLine[1] === NEXT_LABEL_SAFE || chainLine[1] === NEXT_LABEL_ALLOWED,
            `${orderId} / ${where}: unerwartete Kettenüberschrift „${chainLine[1]}“`,
          );
          chainLevelSeen += 1;
          // 8. kein doppeltes Label und kein Präfix im Text.
          assertNextStepLineIsClean(card, `${orderId} / ${where} (V8.10.2)`);
          // 1. wo die Primäraktion sichtbar ist, benennt sie die Auftragsebene.
          if (html.includes('<div class="pilot-work-order-primary-action">')) {
            assert.match(html, new RegExp(`<strong>${ORDER_LABEL}:</strong> \\S`), `${orderId} / ${where}: die Auftragsebene muss sich selbst benennen`);
            orderLevelSeen += 1;
          }
        });
      }
      assert.ok(chainLevelSeen >= 8, `die Kettenebene muss mehrfach geprüft worden sein (geprüft: ${chainLevelSeen})`);
      assert.ok(orderLevelSeen >= 1, "die Auftragsebene muss mindestens einmal mitgeprüft worden sein");
      timerHarness.clearAll();
    },
  );

  await check(
    "V8.10.2-6./7./9.: beide Ebenen sind gleichzeitig sichtbar, tragen unterschiedliche Texte, und der Auftragstext gelangt nicht in die Kettenkarte",
    async () => {
      const orderIds = Array.from(backend.orders.keys());
      let bothLevelsSeen = 0;
      for (const orderId of orderIds) {
        forcedOrderReadFailureCount = 0;
        // eslint-disable-next-line no-await-in-loop
        await ui.selectOrder(orderId);
        ui.render();
        const html = orderHtml();
        const card = chainStatusCardSections(html)[0] || "";
        const orderLine = html.match(new RegExp(`<strong>${ORDER_LABEL}:</strong> ([^<]+)`));
        const chainLine = card.match(/<p class="pilot-chain-status-card__next"><strong>[^<]+:<\/strong> ([^<]+)<\/p>/);
        if (!orderLine || !chainLine) continue;
        bothLevelsSeen += 1;
        // 6. beide Ebenen gleichzeitig sichtbar.
        assert.ok(html.indexOf(ORDER_LABEL) >= 0 && card.length > 0, `${orderId}: beide Ebenen müssen nebeneinander bestehen können`);
        // 7. sie tragen verschiedene Aussagen.
        assert.notStrictEqual(
          orderLine[1].trim(),
          chainLine[1].trim(),
          `${orderId}: Auftragstext und Kettentext dürfen nicht auf denselben Wert zusammenfallen`,
        );
        // 9. der Auftragstext taucht nicht in der Kettenkarte auf.
        assert.ok(!card.includes(orderLine[1].trim()), `${orderId}: der Auftrags-Nächster-Schritt gehört nicht in die Kettenkarte`);
        assert.ok(!card.includes(ORDER_LABEL), `${orderId}: die Auftragsüberschrift gehört nicht in die Kettenkarte`);
      }
      assert.ok(bothLevelsSeen >= 1, `mindestens ein Auftrag muss beide Ebenen gleichzeitig gezeigt haben (gesehen: ${bothLevelsSeen})`);
      timerHarness.clearAll();
    },
  );

  await check(
    "V8.10.2-3./11./12.: die abgeschwächte Kettenvariante lautet exakt „Möglicher nächster Schritt in der Agentenkette“; Karteninvariante und Gleichlauf beider Container bleiben erhalten",
    async () => {
      const order = backend.orders.get(v81CompletedOrderId);
      assert.ok(order, "Testfixtur: der Auftrag mit vollständig abgeschlossener Kette muss vorhanden sein");
      const originalStatus = order.status;
      const originalStatusLabel = order.statusLabel;
      order.status = "IN_EXECUTION";
      order.statusLabel = "In Ausführung";
      order.revision += 1;
      ui.getState().chainStartBridge = null;
      await ui.selectOrder(v81CompletedOrderId);
      await ui.reloadSelectedOrder();
      ui.render();

      const upper = chainStatusCardSections(orderHtml());
      const lower = chainStatusCardSections(diagnosticsHtml());
      // 11. genau eine Kettenstatuskarte je Ausgabecontainer.
      assert.strictEqual(upper.length, 1, "genau eine Kettenstatuskarte in der oberen Karte");
      assert.strictEqual(lower.length, 1, "genau eine Kettenstatuskarte im Detailbereich");
      // 3. exakter Wortlaut der Abschwächung.
      assert.match(
        upper[0],
        new RegExp(`<strong>${NEXT_LABEL_ALLOWED}:</strong> bei Bedarf oben manuell zur Abschlussprüfung vorlegen\\.`),
        "die abgeschwächte Variante muss die Ebene benennen und die Abschwächung behalten",
      );
      // 12. beide Karten sagen fachlich dasselbe.
      const nextLineOf = (card) => (card.match(/<p class="pilot-chain-status-card__next">[\s\S]*?<\/p>/) || [""])[0];
      assert.strictEqual(nextLineOf(upper[0]), nextLineOf(lower[0]), "beide Kettenkarten müssen dieselbe Aussage tragen");

      order.status = originalStatus;
      order.statusLabel = originalStatusLabel;
      order.revision += 1;
      await ui.reloadSelectedOrder();
      assert.strictEqual(ui.getState().overview.status, originalStatus, "der Auftragsstatus der Fixtur ist wieder zurückgestellt");
    },
  );

  console.log(`pilot-agent-execution-chain-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-agent-execution-chain-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
