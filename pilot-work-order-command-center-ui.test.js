"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 5: Pilot-Auftragszentrale im
// Cockpit.
//
// Anders als pilot-work-order-ui.test.js (reine Quelltext-/Wortlautprüfung
// ohne Ausführung, gleiches Muster wie health-reference-work-run-ui.test.js)
// führt dieses Modul pilot-work-order-ui.js TATSÄCHLICH aus: ein minimaler,
// selbst geschriebener DOM-Stub (kein jsdom, keine neue Abhängigkeit) sowie
// ein minimales In-Memory-Fake-Backend (kein echter Server, keine echte
// Datenbank) reichen aus, um echte UI-Zustandswechsel (Auswahl, Anlage,
// Aktionen, Revisionskonflikt, Neuladen) sowie die tatsächliche
// API-Anbindung (aufgerufene URL/Methode/Body je Aktion) zu prüfen.
//
// Ergänzt pilot-work-order-ui.test.js, pilot-work-order-multi-order.test.js,
// pilot-work-order-concurrency.test.js und pilot-work-order-parallel-api.test.js,
// ohne diese zu ersetzen. Führt niemals eine externe Aktion aus.

const assert = require("assert");

let passed = 0;
async function check(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// ---------------------------------------------------------------------------
// Minimaler DOM-Stub: nur die Elemente, die pilot-work-order-ui.js
// tatsächlich per getElementById anspricht. innerHTML wird als reiner
// String gehalten (genügt, um echten gerenderten Inhalt zu prüfen).
// ---------------------------------------------------------------------------

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

function setCreateFormValues(values) {
  Object.keys(values).forEach((key) => {
    const el = domElements[`pilot-order-create-${key}`];
    if (el) el.value = values[key];
  });
}

global.document = {
  readyState: "complete",
  cookie: "",
  addEventListener: () => {},
  getElementById: (id) => domElements[id] || null,
};

// ---------------------------------------------------------------------------
// Minimales In-Memory-Fake-Backend: bildet exakt den HTTP-Vertrag von
// pilot-work-order-routes.js/pilot-work-order-service.js nach (Statuswerte,
// Revisionsprüfung, 409 bei Konflikt, 404 bei unbekanntem Auftrag,
// confirmed:true-Pflicht für Freigaben) – ohne echten Server/DB-Aufbau.
// ---------------------------------------------------------------------------

const CANONICAL_ID = "pilot-three-agent-work-order-v1";
const STATUS_LABELS = {
  DRAFT: "Entwurf",
  READY_FOR_JAMAL_APPROVAL: "Wartet auf Jamal-Freigabe",
  APPROVED_FOR_EXECUTION: "Für Ausführung freigegeben",
  IN_EXECUTION: "In Ausführung",
  READY_FOR_REVIEW: "Wartet auf Abschlussprüfung",
  COMPLETED: "Abgeschlossen",
  RETURNED: "Zurückgegeben",
  BLOCKED: "Blockiert",
};
const TRANSITIONS = {
  "mark-ready-for-approval": { from: "DRAFT", to: "READY_FOR_JAMAL_APPROVAL" },
  "approve-for-execution": { from: "READY_FOR_JAMAL_APPROVAL", to: "APPROVED_FOR_EXECUTION", requiresConfirmed: true },
  "start-execution": { from: "APPROVED_FOR_EXECUTION", to: "IN_EXECUTION" },
  "submit-for-review": { from: "IN_EXECUTION", to: "READY_FOR_REVIEW" },
  "approve-completion": { from: "READY_FOR_REVIEW", to: "COMPLETED", requiresConfirmed: true },
  "reopen-from-returned": { from: "RETURNED", to: "DRAFT" },
  "unblock-order": { from: "BLOCKED", to: "RETURNED" },
};

let idCounter = 0;
let agentRunCounter = 0;
function makeFakeBackend() {
  const orders = new Map();
  let networkCallCount = 0;
  let writeCallCount = 0;
  let nextAgentExecutionOutcome = "SUCCEEDED";
  // Korrekturlauf vor Commit ("Ergebnis darf bei Handoff-Konflikt nicht
  // verloren gehen"): bildet Stufe B (Handoff-Status) unabhängig vom
  // Runstatus (Stufe A) nach, damit die UI-Unterscheidung "Runner-Erfolg,
  // aber Handoff fehlgeschlagen" getestet werden kann.
  let nextAgentExecutionHandoffStatus = "SUCCEEDED";
  let nextAgentExecutionHandoffErrorMessage = null;

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
        status: "DRAFT",
        statusLabel: STATUS_LABELS.DRAFT,
        revision: 0,
        involvedAgents: [{ pilotRoleLabel: "Projektmanager-Agent", canonicalName: "Projektmanager-Agent", focus: "Koordiniert." }],
        qualityCriteria: ["Ergebnis passt"],
        allowedTools: ["interne Dokumentenablage (read-only)"],
        forbiddenActions: ["externe Schreibzugriffe"],
        requiredApprovals: ["Freigabe vor Ausführungsstart"],
        timeframe: "ohne festes Enddatum",
        handoffs: [],
        agentExecutionRuns: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      overrides,
    );
  }

  orders.set(CANONICAL_ID, baseOrder(CANONICAL_ID, { title: "Kanonischer Pilotauftrag" }));

  // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
  // Codex-Anbindung") – additive Fake-Backend-Erweiterung: bildet
  // ausschließlich den HTTP-Vertrag nach (Verfügbarkeit, Freigabe-Token,
  // Runner-/KI-Metadaten), startet niemals einen echten Codex-Prozess.
  let codexAvailable = true;
  let codexAuthenticated = true;
  let nextCodexOutcome = "SUCCEEDED";
  let nextCodexRedactionApplied = false;
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern") – 9. bildet
  // ausschließlich den bereits über die API sichtbaren HTTP-Vertrag nach
  // (resultSummary.diagnostics/diagnosticNotice), erzeugt niemals einen
  // echten Codex-Prozess.
  let nextCodexDiagnostics = null;
  const issuedCodexTokens = new Set();

  function overviewFor(order) {
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
      openDecision: null,
      risksAndLimits: [],
      nextStep: "Weiter im Ablauf.",
      progress: { rolesPassed: 0, rolesTotal: 3 },
      autonomyBoundaries: { disclaimer: "Testfixtur." },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  function validateCreateBody(body) {
    const errors = [];
    ["title", "desiredOutcome", "requestedBy", "timeframe"].forEach((field) => {
      if (!body[field] || !String(body[field]).trim()) errors.push(field);
    });
    ["qualityCriteria", "allowedTools", "forbiddenActions", "requiredApprovals"].forEach((field) => {
      if (!Array.isArray(body[field]) || body[field].length === 0) errors.push(field);
    });
    return errors;
  }

  function respond(status, body) {
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  }

  function handle(url, opts) {
    networkCallCount += 1;
    const method = (opts && opts.method) || "GET";
    if (method !== "GET") writeCallCount += 1;
    const body = opts && opts.body ? JSON.parse(opts.body) : {};

    if (method === "GET" && url === "/api/pilot-work-order/status") {
      return respond(200, { ok: true, overview: overviewFor(orders.get(CANONICAL_ID)) });
    }
    if (method === "GET" && url === "/api/pilot-work-order/orders") {
      return respond(200, { ok: true, orders: Array.from(orders.values()).map((order) => overviewFor(order).order) });
    }
    if (method === "POST" && url === "/api/pilot-work-order/orders") {
      const errors = validateCreateBody(body);
      if (errors.length > 0) {
        return respond(400, { ok: false, message: `Pilotauftrag ist unvollständig, es fehlen: ${errors.join(", ")}.` });
      }
      idCounter += 1;
      const id = `pilot-order-test-${idCounter}`;
      const order = baseOrder(id, { ...body, status: "DRAFT", statusLabel: STATUS_LABELS.DRAFT, revision: 0, handoffs: [] });
      orders.set(id, order);
      return respond(200, { ok: true, overview: overviewFor(order) });
    }
    const getMatch = url.match(/^\/api\/pilot-work-order\/orders\/([^/]+)$/);
    if (method === "GET" && getMatch) {
      const order = orders.get(decodeURIComponent(getMatch[1]));
      if (!order) return respond(404, { ok: false, message: `Der Pilotauftrag "${getMatch[1]}" wurde nicht gefunden.` });
      return respond(200, { ok: true, overview: overviewFor(order) });
    }
    const actionMatch = url.match(/^\/api\/pilot-work-order\/orders\/([^/]+)\/([^/]+)$/);
    if (method === "POST" && actionMatch) {
      const orderId = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      const order = orders.get(orderId);
      if (!order) return respond(404, { ok: false, message: `Der Pilotauftrag "${orderId}" wurde nicht gefunden.` });
      if (order.status === "COMPLETED") {
        return respond(409, { ok: false, message: "Der Pilotauftrag ist bereits abgeschlossen.", pilotOrderId: orderId, currentStatus: "COMPLETED" });
      }
      // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): bildet den
      // HTTP-Vertrag von pilot-work-order-routes.js#PILOT_ACTIONS
      // ["start-agent-execution"] nach – verändert NIEMALS order.status
      // (rein additive technische Ausführungseinheit) und erzeugt keine
      // automatische Freigabe.
      // Phase 7 – reine Token-Ausstellung, kein Auftragszustand ändert
      // sich, kein Agentenlauf entsteht (siehe pilot-agent-execution-service.js
      // #requestCodexRunApproval).
      if (action === "request-codex-run-approval") {
        if (body.presetId !== "codex-analyze-pilot-structure") {
          return respond(400, { ok: false, message: "Eine Freigabeanforderung ist ausschließlich für ein Codex-Preset möglich." });
        }
        idCounter += 1;
        const token = `codex-approval-test-token-${idCounter}`;
        issuedCodexTokens.add(token);
        return respond(200, { ok: true, approvalToken: token, expiresInMs: 300000 });
      }
      if (action === "start-agent-execution" && body.presetId === "codex-analyze-pilot-structure") {
        if (order.status !== "IN_EXECUTION") {
          return respond(409, { ok: false, message: "Ein Agentenlauf ist nur während IN_EXECUTION möglich.", pilotOrderId: orderId, currentStatus: order.status });
        }
        if (!codexAvailable) {
          return respond(409, { ok: false, message: "Codex ist auf diesem System nicht verfügbar oder nicht installiert." });
        }
        if (!codexAuthenticated) {
          return respond(409, { ok: false, message: "Codex ist auf diesem System nicht authentifiziert." });
        }
        if (!body.approvalToken || !issuedCodexTokens.has(body.approvalToken)) {
          return respond(409, { ok: false, message: "Für diesen Codex-Lauf liegt keine gültige, frische Freigabe vor." });
        }
        issuedCodexTokens.delete(body.approvalToken);
        agentRunCounter += 1;
        const outcome = nextCodexOutcome;
        const run = {
          id: `pilot-agent-run-codex-test-${agentRunCounter}`,
          presetId: body.presetId,
          pilotRole: "RECHERCHE_ANALYSE",
          pilotRoleLabel: "Recherche-/Analyse-Agent",
          taskTitle: "Phase-7-Pilotstruktur semantisch prüfen",
          runnerId: "codex-read-only-analysis",
          runnerLabel: "Codex – echter, isolierter Read-Only-KI-Agentenlauf",
          requestedRunnerKind: "CODEX_READ_ONLY",
          actualRunnerKind: "CODEX_READ_ONLY",
          aiExecuted: outcome === "SUCCEEDED",
          fallbackUsed: false,
          modelLabel: "Codex (ChatGPT)",
          runnerVersion: "codex-cli 0.999.0-test",
          status: outcome,
          resultRawText: outcome === "SUCCEEDED" ? "# Analyse\n\nBeobachtung 1: Testergebnis (Codex)." : null,
          // Korrektur 2 (unabhängiges Review, Kategorie B): der feste
          // Redaktionshinweis muss auch über die Auftragsübersicht bis in
          // die gerenderte Cockpit-Ansicht sichtbar sein.
          resultSummary:
            outcome === "SUCCEEDED"
              ? {
                  secretRedactionApplied: nextCodexRedactionApplied,
                  secretRedactionNotice: nextCodexRedactionApplied
                    ? "Ergebnis wurde aus Sicherheitsgründen redigiert und kann fachlich verkürzt sein."
                    : null,
                }
              : nextCodexDiagnostics
                ? { diagnostics: nextCodexDiagnostics, diagnosticNotice: "Sichere technische Diagnose \u2013 m\u00f6glicherweise gek\u00fcrzt und redigiert." }
                : null,
          errorMessage:
            outcome === "FAILED"
              ? nextCodexDiagnostics
                ? "Codex-Prozess endete mit Exit-Code 1. stderr: Fehler beim Zugriff. api_key: [REDACTED] war ung\u00fcltig."
                : "Simulierter technischer Codex-Fehler (Testfixtur)."
              : null,
          handoffStatus: outcome === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
          handoffErrorMessage: null,
          startedAt: nowIso(),
          finishedAt: nowIso(),
        };
        order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
        return respond(200, { ok: true, agentExecutionRun: run, overview: overviewFor(order) });
      }
      if (action === "start-agent-execution") {
        if (order.status !== "IN_EXECUTION") {
          return respond(409, { ok: false, message: "Ein Agentenlauf ist nur während IN_EXECUTION möglich.", pilotOrderId: orderId, currentStatus: order.status });
        }
        if (body.expectedRevision !== undefined && body.expectedRevision !== order.revision) {
          return respond(409, {
            ok: false,
            message: `Der Pilotauftrag "${orderId}" wurde zwischenzeitlich verändert.`,
            pilotOrderId: orderId,
            expectedRevision: body.expectedRevision,
            currentRevision: order.revision,
          });
        }
        agentRunCounter += 1;
        const outcome = nextAgentExecutionOutcome;
        const run = {
          id: `pilot-agent-run-test-${agentRunCounter}`,
          presetId: body.presetId,
          pilotRole: "RECHERCHE_ANALYSE",
          pilotRoleLabel: "Recherche-/Analyse-Agent",
          taskTitle: "Technische Pilotstruktur analysieren",
          runnerId: "local-read-only-repo-analysis",
          runnerLabel: "Lokaler deterministischer Read-Only-Repository-Analyse-Runner",
          requestedRunnerKind: "LOCAL_DETERMINISTIC_READ_ONLY",
          actualRunnerKind: "LOCAL_DETERMINISTIC_READ_ONLY",
          aiExecuted: false,
          fallbackUsed: false,
          status: outcome,
          resultRawText: outcome === "SUCCEEDED" ? "# Bestandsaufnahme\n\nBeobachtung 1: Testergebnis." : null,
          errorMessage: outcome === "FAILED" ? "Simulierter technischer Runner-Fehler (Testfixtur)." : null,
          handoffStatus: outcome === "SUCCEEDED" ? nextAgentExecutionHandoffStatus : "PENDING",
          handoffErrorMessage: outcome === "SUCCEEDED" ? nextAgentExecutionHandoffErrorMessage : null,
          startedAt: nowIso(),
          finishedAt: nowIso(),
        };
        order.agentExecutionRuns = (order.agentExecutionRuns || []).concat([run]);
        return respond(200, { ok: true, agentExecutionRun: run, overview: overviewFor(order) });
      }
      const transition = TRANSITIONS[action];
      if (!transition) return respond(404, { ok: false, message: "Nicht gefunden." });
      if (body.expectedRevision !== undefined && body.expectedRevision !== order.revision) {
        return respond(409, {
          ok: false,
          message: `Der Pilotauftrag "${orderId}" wurde zwischenzeitlich verändert (erwartete Revision ${body.expectedRevision}, aktuell ${order.revision}).`,
          pilotOrderId: orderId,
          expectedRevision: body.expectedRevision,
          currentRevision: order.revision,
        });
      }
      if (order.status !== transition.from) {
        return respond(409, { ok: false, message: "Falscher Ausgangsstatus.", pilotOrderId: orderId, currentStatus: order.status });
      }
      if (transition.requiresConfirmed && body.confirmed !== true) {
        return respond(400, { ok: false, message: "confirmed === true erforderlich." });
      }
      order.status = transition.to;
      order.statusLabel = STATUS_LABELS[transition.to];
      order.revision += 1;
      order.updatedAt = nowIso();
      return respond(200, { ok: true, overview: overviewFor(order) });
    }
    return respond(404, { ok: false, message: "Nicht gefunden." });
  }

  return {
    handle,
    orders,
    getNetworkCallCount: () => networkCallCount,
    getWriteCallCount: () => writeCallCount,
    setNextAgentExecutionOutcome: (value) => {
      nextAgentExecutionOutcome = value;
    },
    setNextAgentExecutionHandoffOutcome: (status, errorMessage) => {
      nextAgentExecutionHandoffStatus = status;
      nextAgentExecutionHandoffErrorMessage = errorMessage || null;
    },
    setCodexAvailability: (available, authenticated) => {
      codexAvailable = available;
      codexAuthenticated = authenticated;
    },
    setNextCodexOutcome: (value) => {
      nextCodexOutcome = value;
    },
    setNextCodexRedactionApplied: (value) => {
      nextCodexRedactionApplied = value;
    },
    setNextCodexDiagnostics: (value) => {
      nextCodexDiagnostics = value;
    },
  };
}

const backend = makeFakeBackend();
const fetchCalls = [];
// V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen") – 8.: ein
// einmaliger Schalter, um den NÄCHSTEN fetch()-Aufruf als Netzwerkfehler
// (rejected Promise, kein HTTP-Statuscode) zu simulieren, ohne eine echte
// Netzwerktrennung zu benötigen.
let forceNextFetchNetworkFailure = false;
global.fetch = (url, opts) => {
  fetchCalls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  if (forceNextFetchNetworkFailure) {
    forceNextFetchNetworkFailure = false;
    return Promise.reject(new Error("Simulierter Netzwerkfehler (Testfixtur)."));
  }
  return backend.handle(url, opts);
};

// Modul erst NACH dem Aufsetzen von document/fetch laden (siehe
// pilot-work-order-ui.js: Auto-Init läuft synchron beim Laden, wenn
// document.readyState !== "loading").
const ui = require("./pilot-work-order-ui.js");

async function run() {
  await ui.getInitPromise();

  // -------------------------------------------------------------------
  // 1./2./26. Auftragsliste lädt, kanonischer Auftrag ist sichtbar,
  // bestehende kanonische UI bleibt kompatibel (Startzustand = kanonisch).
  // -------------------------------------------------------------------

  await check("1. die Auftragsliste wird beim Start geladen", () => {
    const state = ui.getState();
    assert.strictEqual(state.ordersLoading, false);
    assert.ok(state.orders.length >= 1);
  });

  await check("2./26. der kanonische Auftrag ist sichtbar und standardmäßig ausgewählt (Rückwärtskompatibilität)", () => {
    const state = ui.getState();
    assert.strictEqual(state.selectedPilotOrderId, ui.CANONICAL_PILOT_ORDER_ID);
    assert.ok(state.orders.some((order) => order.id === ui.CANONICAL_PILOT_ORDER_ID));
    assert.strictEqual(state.overview.order.id, ui.CANONICAL_PILOT_ORDER_ID);
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Kanonischer Pilotauftrag/);
  });

  await check("6. Status und Revision des kanonischen Auftrags werden angezeigt", () => {
    const html = domElements["pilot-work-order-output"].innerHTML;
    assert.match(html, /Entwurf/);
    assert.match(html, />0</);
  });

  // -------------------------------------------------------------------
  // 8./9./10./11. Neuen Pilotauftrag anlegen.
  // -------------------------------------------------------------------

  let orderAId;

  await check("9. eine unvollständige Anlage wird blockiert (kein Netzwerkaufruf, verständliche Meldung)", async () => {
    const callsBefore = fetchCalls.length;
    await ui.submitCreateOrder({ title: "", desiredOutcome: "", requestedBy: "", qualityCriteria: [], allowedTools: [], forbiddenActions: [], requiredApprovals: [], timeframe: "" });
    assert.strictEqual(fetchCalls.length, callsBefore, "eine unvollständige Anlage darf keinen Request auslösen");
    assert.ok(ui.getState().createError && ui.getState().createError.length > 0);
  });

  await check("8./10./11. ein neuer Pilotauftrag kann angelegt werden, wird danach ausgewählt, schließt den Dialog, löscht Fehler und sendet kein id-Feld", async () => {
    fetchCalls.length = 0;
    await ui.submitCreateOrder({
      title: "Auftrag A: UI-Testauftrag",
      desiredOutcome: "Nachweis der Auftragszentrale.",
      requestedBy: "Jamal",
      qualityCriteria: ["Ergebnis passt"],
      allowedTools: ["interne Dokumentenablage (read-only)"],
      forbiddenActions: ["externe Schreibzugriffe"],
      requiredApprovals: ["Freigabe vor Ausführungsstart"],
      timeframe: "ohne festes Enddatum",
    });
    const createCall = fetchCalls.find((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.ok(createCall, "die Anlage muss einen POST /api/pilot-work-order/orders senden");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(createCall.body || {}, "id"), false, "die UI darf kein id-Feld mitsenden");
    const state = ui.getState();
    orderAId = state.overview.order.id;
    assert.notStrictEqual(orderAId, ui.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(state.selectedPilotOrderId, orderAId);
    assert.strictEqual(state.createOpen, false);
    assert.strictEqual(state.createError, null);
    assert.strictEqual(state.overview.status, "DRAFT", "keine automatische Ausführung/Freigabe nach Anlage");
    assert.ok(state.orders.some((order) => order.id === orderAId), "Liste wird nach Anlage aktualisiert");
    const executeCalls = fetchCalls.filter((call) => /start-execution|approve-for-execution/.test(call.url));
    assert.strictEqual(executeCalls.length, 0);
  });

  await check("9b. zwei unmittelbar ausgelöste Anlageaktionen erzeugen höchstens einen POST /orders", async () => {
    fetchCalls.length = 0;
    const createInput = {
      title: "Auftrag A0: Doppelklick-Testauftrag",
      desiredOutcome: "Nachweis des Doppelklickschutzes bei der Anlage.",
      requestedBy: "Jamal",
      qualityCriteria: ["Ergebnis passt"],
      allowedTools: ["interne Dokumentenablage (read-only)"],
      forbiddenActions: ["externe Schreibzugriffe"],
      requiredApprovals: ["Freigabe vor Ausführungsstart"],
      timeframe: "ohne festes Enddatum",
    };
    const first = ui.submitCreateOrder(createInput);
    assert.strictEqual(ui.getState().creating, true, "während der Anlage muss der laufende Zustand gesetzt sein");
    const second = ui.submitCreateOrder(createInput);
    await Promise.all([first, second]);
    const createCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(createCalls.length, 1, "zwei unmittelbare Anlageaktionen dürfen höchstens einen POST erzeugen");
    assert.strictEqual(ui.getState().creating, false, "nach abgeschlossener Anlage darf die Sperre nicht bestehen bleiben");
  });

  await check("9c. nach einer abgeschlossenen Anlage ist eine weitere Anlage wieder möglich (keine dauerhafte Sperre)", async () => {
    fetchCalls.length = 0;
    await ui.submitCreateOrder({
      title: "Auftrag A1: Anlage nach Doppelklickschutz",
      desiredOutcome: "Nachweis, dass der Doppelklickschutz nur während der Anlage greift.",
      requestedBy: "Jamal",
      qualityCriteria: ["Ergebnis passt"],
      allowedTools: ["interne Dokumentenablage (read-only)"],
      forbiddenActions: ["externe Schreibzugriffe"],
      requiredApprovals: ["Freigabe vor Ausführungsstart"],
      timeframe: "ohne festes Enddatum",
    });
    const createCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(createCalls.length, 1, "eine spätere Anlage muss wieder genau einen POST erzeugen");
    assert.strictEqual(ui.getState().creating, false);
  });

  // -------------------------------------------------------------------
  // 4./5./7. Auftrag auswählen, korrekte pilotOrderId, Wechsel entfernt
  // Daten des vorherigen Auftrags.
  // -------------------------------------------------------------------

  await check("4./5. der kanonische Auftrag kann erneut ausgewählt werden und zeigt seine eigene pilotOrderId", async () => {
    await ui.selectOrder(ui.CANONICAL_PILOT_ORDER_ID);
    const state = ui.getState();
    assert.strictEqual(state.selectedPilotOrderId, ui.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(state.overview.order.id, ui.CANONICAL_PILOT_ORDER_ID);
  });

  await check("7. ein Wechsel von A zurück zu kanonisch entfernt die zuvor angezeigten Daten von A", async () => {
    const selectPromise = ui.selectOrder(orderAId);
    // Unmittelbar nach dem Aufruf (vor dem Netzwerk-Roundtrip) darf kein
    // veraltetes overview mehr angezeigt werden.
    assert.strictEqual(ui.getState().overview, null, "overview muss beim Auftragswechsel sofort geleert werden");
    await selectPromise;
    const state = ui.getState();
    assert.strictEqual(state.overview.order.id, orderAId);
    assert.doesNotMatch(domElements["pilot-work-order-output"].innerHTML, /Kanonischer Pilotauftrag/);
  });

  // -------------------------------------------------------------------
  // 12./13./14. Aktionen verwenden die ausgewählte pilotOrderId und senden
  // expectedRevision; erfolgreiche Aktion aktualisiert Status/Revision.
  // -------------------------------------------------------------------

  await check("12./13./14. eine Aktion auf Auftrag A verwendet dessen pilotOrderId, sendet expectedRevision und aktualisiert Status/Revision", async () => {
    const revisionBefore = ui.getState().overview.order.revision;
    fetchCalls.length = 0;
    await ui.runOrderAction("mark-ready-for-approval", {});
    const actionCall = fetchCalls.find((call) => call.method === "POST" && call.url.includes("mark-ready-for-approval"));
    assert.ok(actionCall, "die Aktion muss über die adressierte Route gesendet werden");
    assert.strictEqual(actionCall.url, `/api/pilot-work-order/orders/${orderAId}/mark-ready-for-approval`);
    assert.strictEqual(actionCall.body.expectedRevision, revisionBefore);
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "READY_FOR_JAMAL_APPROVAL");
    assert.strictEqual(state.overview.order.revision, revisionBefore + 1);
  });

  // -------------------------------------------------------------------
  // 15. Aktion auf A verändert B nicht (kanonischer Auftrag als "B").
  // -------------------------------------------------------------------

  await check("15. eine Aktion auf Auftrag A verändert den kanonischen Auftrag (B) nicht", async () => {
    const canonicalBefore = backend.orders.get(ui.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(canonicalBefore.status, "DRAFT");
    assert.strictEqual(canonicalBefore.revision, 0);
  });

  // -------------------------------------------------------------------
  // 21. Freigabe erfordert weiterhin ausdrückliche Bestätigung (kein
  // automatischer confirmed:true über die Primäraktion).
  // -------------------------------------------------------------------

  await check("21. approve-for-execution löst keinen automatischen, bestätigten Request aus; ohne confirmed:true bleibt die Freigabe blockiert", async () => {
    // Der eigentliche Schutz (die Freigabeaktionen werden nie über einen
    // einfachen Klick mit `confirmed: true` verdrahtet) sitzt im
    // Klick-Handler (siehe pilot-work-order-ui.js#bindActionHandlersOnce)
    // und wird bereits durch pilot-work-order-ui.test.js quelltextlich
    // geprüft (keine postAction("approve-for-execution", {confirmed:true...)-
    // Verdrahtung). Hier wird zusätzlich geprüft, dass ein Aufruf OHNE
    // `confirmed: true` (also exakt das, was die UI tatsächlich sendet)
    // serverseitig abgelehnt wird und keinen Statuswechsel bewirkt.
    assert.strictEqual(ui.getState().selectedPilotOrderId, orderAId);
    assert.strictEqual(ui.getState().overview.status, "READY_FOR_JAMAL_APPROVAL");
    fetchCalls.length = 0;
    await ui.runOrderAction("approve-for-execution", {});
    const call = fetchCalls.find((c) => c.url.includes("approve-for-execution"));
    assert.ok(call);
    assert.notStrictEqual(call.body.confirmed, true);
    const state = ui.getState();
    assert.ok(state.actionError, "ohne confirmed:true muss die Aktion mit einer Fehlermeldung abgelehnt werden");
    assert.strictEqual(state.overview.status, "READY_FOR_JAMAL_APPROVAL", "kein Statuswechsel ohne ausdrückliche Bestätigung");
  });

  // -------------------------------------------------------------------
  // 16./17./18./19./20. HTTP 409 wird als Konflikt angezeigt, keine
  // Erfolgsmeldung, kein automatischer Retry, Neuladen zeigt neue Revision.
  // -------------------------------------------------------------------

  await check("16./17./18./19./20. veraltete expectedRevision liefert eine verständliche Konfliktanzeige, ohne Erfolgsmeldung, ohne Datenüberschreibung, ohne automatischen Retry; Neuladen zeigt die neue Revision", async () => {
    // Auftrag A ist inzwischen READY_FOR_JAMAL_APPROVAL (revision N). Ein
    // Aufruf mit einer künstlich veralteten revision (state manipuliert
    // über einen zweiten, konkurrierenden runOrderAction-Aufruf ist wegen
    // actionInFlight-Schutz nicht simulierbar) wird stattdessen direkt am
    // Fake-Backend erzwungen: externe Änderung durch einen zweiten
    // "Aufrufer" (z. B. eine parallele Sitzung).
    const order = backend.orders.get(orderAId);
    const staleRevision = order.revision;
    order.revision += 1; // simuliert eine zwischenzeitliche externe Änderung
    order.updatedAt = new Date().toISOString();

    fetchCalls.length = 0;
    await ui.runOrderAction("start-execution", {});
    const state = ui.getState();
    assert.ok(state.conflict, "ein 409 muss eine Konfliktanzeige setzen");
    assert.strictEqual(state.conflict.pilotOrderId, orderAId);
    assert.strictEqual(state.conflict.expectedRevision, staleRevision);
    assert.notStrictEqual(state.overview.status, "IN_EXECUTION", "keine Erfolgsmeldung/Statuswechsel bei Konflikt");
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Revisionskonflikt/);
    assert.doesNotMatch(domElements["pilot-work-order-output"].innerHTML, /In Ausf\u00fchrung/);

    // 18. kein automatischer Retry: genau ein POST-Aufruf für diese Aktion.
    const postCalls = fetchCalls.filter((call) => call.method === "POST");
    assert.strictEqual(postCalls.length, 1, "kein automatischer Retry nach Konflikt");

    // 19./20. Neuladen zeigt die neue (aktuelle) Revision.
    fetchCalls.length = 0;
    await ui.reloadSelectedOrder();
    const afterReload = ui.getState();
    assert.strictEqual(afterReload.conflict, null, "Konfliktanzeige verschwindet nach explizitem Neuladen");
    assert.strictEqual(afterReload.overview.order.revision, order.revision);
    const revisionMarkup = new RegExp(">" + String(order.revision) + "<");
    assert.match(domElements["pilot-work-order-output"].innerHTML, revisionMarkup);
  });

  // -------------------------------------------------------------------
  // 22. abgeschlossener Auftrag bleibt unveränderbar.
  // -------------------------------------------------------------------

  await check("22. ein abgeschlossener Auftrag bleibt über die UI-Aktionen unveränderbar (409, kein stiller Erfolg)", async () => {
    idCounter += 1;
    const completedId = `pilot-order-test-completed-${idCounter}`;
    backend.orders.set(completedId, {
      id: completedId,
      title: "Abgeschlossener Testauftrag",
      desiredOutcome: "Fertig.",
      requestedBy: "Jamal",
      status: "COMPLETED",
      statusLabel: STATUS_LABELS.COMPLETED,
      revision: 5,
      involvedAgents: [{ pilotRoleLabel: "Projektmanager-Agent", canonicalName: "Projektmanager-Agent", focus: "x" }],
      qualityCriteria: ["a"],
      allowedTools: ["a"],
      forbiddenActions: ["a"],
      requiredApprovals: ["a"],
      timeframe: "x",
      handoffs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await ui.selectOrder(completedId);
    fetchCalls.length = 0;
    await ui.runOrderAction("submit-for-review", {});
    const state = ui.getState();
    assert.ok(state.conflict, "eine Aktion auf einem COMPLETED-Auftrag muss als Konflikt (409) erscheinen");
    assert.strictEqual(backend.orders.get(completedId).status, "COMPLETED");
  });

  // -------------------------------------------------------------------
  // 23./24. Handoffs und PM-Ergebnisse sind auftragsbezogen (im Overview
  // des jeweils ausgewählten Auftrags).
  // -------------------------------------------------------------------

  await check("23./24./25. Handoffs, PM-Ergebnisse und Audit-Trail sind auftragsbezogen (kanonischer Auftrag ohne A-Daten)", async () => {
    await ui.selectOrder(ui.CANONICAL_PILOT_ORDER_ID);
    const state = ui.getState();
    assert.strictEqual(state.overview.order.id, ui.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(state.overview.handoffs.length, 0);
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Kanonischer Pilotauftrag/);
    assert.doesNotMatch(domElements["pilot-work-order-output"].innerHTML, /UI-Testauftrag/);
    assert.match(domElements["pilot-work-order-diagnostics-output"].innerHTML, /Audit-Trail/);
  });

  // -------------------------------------------------------------------
  // 27. unbekannter Auftrag wird kontrolliert behandelt.
  // -------------------------------------------------------------------

  await check("27. ein unbekannter Auftrag wird kontrolliert behandelt (verständliche Meldung, kein Absturz)", async () => {
    await ui.selectOrder("pilot-order-does-not-exist");
    const state = ui.getState();
    assert.strictEqual(state.overview, null);
    assert.ok(state.overviewError && /nicht gefunden/.test(state.overviewError));
    assert.match(domElements["pilot-work-order-output"].innerHTML, /nicht gefunden/);
  });

  // -------------------------------------------------------------------
  // 28. Buttons sind während laufender Aktion geschützt (kein Mehrfach-
  // Auslösen), Aktionsbuttons zeigen `disabled`.
  // -------------------------------------------------------------------

  await check("28. während einer laufenden Aktion wird dieselbe Aktion nicht doppelt ausgelöst; der Button ist als disabled markiert", async () => {
    await ui.selectOrder(ui.CANONICAL_PILOT_ORDER_ID);
    fetchCalls.length = 0;
    const first = ui.runOrderAction("mark-ready-for-approval", {});
    assert.strictEqual(ui.getState().actionInFlight, true);
    assert.match(domElements["pilot-work-order-output"].innerHTML, /data-action="mark-ready-for-approval" disabled/);
    const second = ui.runOrderAction("mark-ready-for-approval", {});
    await Promise.all([first, second]);
    const postCalls = fetchCalls.filter((call) => call.method === "POST" && call.url.includes("mark-ready-for-approval"));
    assert.strictEqual(postCalls.length, 1, "eine zweite, gleichzeitig ausgelöste Aktion darf keinen zweiten Request senden");
  });

  // -------------------------------------------------------------------
  // 29. Health-Referenzdaten bleiben unverändert (dieses Modul spricht
  // ausschließlich /api/pilot-work-order/ an, siehe pilot-work-order-ui.test.js
  // Prüfpunkt 12 – hier zusätzlich: keine einzige aufgerufene URL betrifft
  // Health).
  // -------------------------------------------------------------------

  await check("29. keine der aufgerufenen URLs betrifft Health-Referenzdaten", () => {
    fetchCalls.forEach((call) => assert.doesNotMatch(call.url, /health/i));
  });

  // -------------------------------------------------------------------
  // 30. keine unerwarteten Netzwerk- oder Schreiboperationen: jede vom
  // Fake-Backend gezählte Schreiboperation lässt sich auf einen der oben
  // ausgelösten, bewussten Testschritte zurückführen (kein spontaner
  // Hintergrund-Traffic durch reine State-Lesezugriffe wie getState()).
  // -------------------------------------------------------------------

  await check("30. reine Lesezugriffe auf den UI-Zustand (getState) lösen keine Netzwerkoperation aus", () => {
    const before = backend.getNetworkCallCount();
    ui.getState();
    ui.getState();
    assert.strictEqual(backend.getNetworkCallCount(), before);
  });

  // -------------------------------------------------------------------
  // Phase 6 ("technische Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner"): Ausführungssektion.
  // Ein neuer, eigenständiger Testauftrag wird bis IN_EXECUTION geführt,
  // damit die Startschaltfläche sichtbar ist und ein echter Rundlauf über
  // ui.runOrderAction("start-agent-execution", ...) geprüft werden kann.
  // -------------------------------------------------------------------

  let runOrderId;

  await check("31. die Agentenlauf-Sektion zeigt vor Ausführungsbeginn keine Startschaltfläche", async () => {
    idCounter += 1;
    runOrderId = `pilot-order-test-run-${idCounter}`;
    backend.orders.set(runOrderId, {
      id: runOrderId,
      title: "Auftrag R: Agentenlauf-Testauftrag",
      desiredOutcome: "Nachweis der Ausführungssektion.",
      requestedBy: "Jamal",
      status: "DRAFT",
      statusLabel: STATUS_LABELS.DRAFT,
      revision: 0,
      involvedAgents: [{ pilotRoleLabel: "Projektmanager-Agent", canonicalName: "Projektmanager-Agent", focus: "x" }],
      qualityCriteria: ["a"],
      allowedTools: ["a"],
      forbiddenActions: ["a"],
      requiredApprovals: ["a"],
      timeframe: "x",
      handoffs: [],
      agentExecutionRuns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await ui.selectOrder(runOrderId);
    assert.doesNotMatch(domElements["pilot-work-order-diagnostics-output"].innerHTML, /data-action="start-agent-execution"/);
    assert.match(domElements["pilot-work-order-diagnostics-output"].innerHTML, /Noch kein Agentenlauf gestartet/);
  });

  await check("32. sobald der Auftrag IN_EXECUTION ist, erscheint die Startschaltfläche für den Agentenlauf", async () => {
    await ui.runOrderAction("mark-ready-for-approval", {});
    fetchCalls.length = 0;
    // approve-for-execution erfordert confirmed:true – wird hier direkt am
    // Fake-Backend simuliert (kein Umweg über die UI, die confirmed:true nie
    // automatisch sendet, siehe Prüfpunkt 21).
    const order = backend.orders.get(runOrderId);
    order.status = "APPROVED_FOR_EXECUTION";
    order.statusLabel = STATUS_LABELS.APPROVED_FOR_EXECUTION;
    order.revision += 1;
    await ui.reloadSelectedOrder();
    await ui.runOrderAction("start-execution", {});
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "IN_EXECUTION");
    assert.match(domElements["pilot-work-order-diagnostics-output"].innerHTML, /data-action="start-agent-execution"/);
  });

  await check("V7.9.0 – die obere Statuskarte für die Drei-Agenten-Kette ist sichtbar und bleibt passiv (kein automatischer POST)", async () => {
    fetchCalls.length = 0;
    ui.render();
    const output = domElements["pilot-work-order-output"].innerHTML;
    assert.match(output, /pilot-chain-status-card/);
    assert.match(output, /Noch keine Drei-Agenten-Kette vorbereitet|wartet auf Freigabe|wird gerade ausgeführt|erfolgreich abgeschlossen/);
    const postCalls = fetchCalls.filter((call) => call.method === "POST");
    assert.strictEqual(postCalls.length, 0, "reines Rendern der Statuskarte darf niemals einen POST auslösen");
  });

  await check("33./28. ein erfolgreicher Agentenlauf wird gestartet, zeigt Status/Ergebnis und erzeugt keine automatische Freigabe/keinen Abschluss", async () => {
    backend.setNextAgentExecutionOutcome("SUCCEEDED");
    fetchCalls.length = 0;
    await ui.runOrderAction("start-agent-execution", { presetId: "analyze-pilot-structure" });
    const call = fetchCalls.find((c) => c.url.includes("start-agent-execution"));
    assert.ok(call, "der Agentenlauf muss über die adressierte Route gestartet werden");
    assert.strictEqual(call.body.presetId, "analyze-pilot-structure");
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "IN_EXECUTION", "kein automatischer Abschluss/Statuswechsel durch den Agentenlauf");
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Erfolgreich abgeschlossen/);
    assert.match(diagnostics, /Bestandsaufnahme/);
  });

  await check("34. ein zweiter Klick auf „Agentenlauf starten“, während der erste noch läuft, löst keinen zweiten Request aus", async () => {
    fetchCalls.length = 0;
    const first = ui.runOrderAction("start-agent-execution", { presetId: "analyze-pilot-structure" });
    assert.strictEqual(ui.getState().actionInFlight, true);
    assert.match(domElements["pilot-work-order-diagnostics-output"].innerHTML, /data-action="start-agent-execution" disabled/);
    const second = ui.runOrderAction("start-agent-execution", { presetId: "analyze-pilot-structure" });
    await Promise.all([first, second]);
    const postCalls = fetchCalls.filter((call) => call.method === "POST" && call.url.includes("start-agent-execution"));
    assert.strictEqual(postCalls.length, 1, "ein zweiter, gleichzeitig ausgelöster Start darf keinen zweiten Request senden");
  });

  await check("35. ein fehlgeschlagener Agentenlauf zeigt einen verständlichen technischen Fehler an, statt einen Erfolg vorzutäuschen", async () => {
    backend.setNextAgentExecutionOutcome("FAILED");
    fetchCalls.length = 0;
    await ui.runOrderAction("start-agent-execution", { presetId: "analyze-pilot-structure" });
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "IN_EXECUTION");
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Fehlgeschlagen/);
    assert.match(diagnostics, /Simulierter technischer Runner-Fehler/);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf vor Commit: Überschrift benennt den Runner ehrlich (kein
  // "echter" KI-Agentenlauf) und ein Handoff-Fehlschlag wird sichtbar vom
  // Runner-Erfolg unterschieden dargestellt (18./19.).
  // -------------------------------------------------------------------

  await check("18. die Agentenlauf-Sektion bezeichnet den Runner ehrlich (kein 'echter'/agentischer KI-Anspruch)", () => {
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Agentenlauf \(lokaler deterministischer Runner\)/);
    assert.doesNotMatch(diagnostics, /echte Ausführung/);
  });

  await check("19. ein technisch erfolgreicher Runner-Lauf mit gescheitertem Handoff wird unterscheidbar dargestellt (Runner-Erfolg bleibt sichtbar, Handoff-Fehler separat)", async () => {
    backend.setNextAgentExecutionOutcome("SUCCEEDED");
    backend.setNextAgentExecutionHandoffOutcome("FAILED", "Rollenübergaben sind nur während IN_EXECUTION möglich (aktuell BLOCKED).");
    fetchCalls.length = 0;
    await ui.runOrderAction("start-agent-execution", { presetId: "analyze-pilot-structure" });
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    // Der technische Runner-Erfolg bleibt klar sichtbar ...
    assert.match(diagnostics, /Erfolgreich abgeschlossen/);
    assert.match(diagnostics, /Bestandsaufnahme/);
    // ... UND der Handoff-Fehler wird separat und unterscheidbar angezeigt,
    // niemals als technischer Runner-Fehler bezeichnet.
    assert.match(diagnostics, /Rollenübergabe fehlgeschlagen/);
    assert.match(diagnostics, /Rollenübergaben sind nur während IN_EXECUTION möglich/);
    backend.setNextAgentExecutionHandoffOutcome("SUCCEEDED", null);
  });

  // -------------------------------------------------------------------
  // Phase 7 ("erste echte KI-Agentenausführung über die bestehende
  // Codex-Anbindung") – 39./40./41. Codex-Sektion: wahrheitsgemäße
  // Runner-Anzeige, kein Start ohne vorherige, ausdrückliche Freigabe,
  // blockierter/erfolgreicher/fehlgeschlagener Zustand.
  // -------------------------------------------------------------------

  await check("Phase 7 – die Codex-Sektion zeigt Verfügbarkeit sowie den Hinweis auf externen KI-/Netzwerkzugriff und Freigabebedarf", () => {
    backend.setCodexAvailability(true, true);
    ui.render();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Codex-Agentenlauf/);
    assert.match(diagnostics, /Codex verfügbar: ja/);
    assert.match(diagnostics, /authentifiziert: ja/);
    assert.match(diagnostics, /externen KI-\/Netzwerkzugriff/);
  });

  // Verbindliche Sicherheitsinformation für Jamal (Korrekturlauf vor dem
  // echten Referenzlauf, unabhängiges Review Kategorie B): die Grenzen der
  // Leseisolation müssen im Cockpit sichtbar sein, unabhängig vom
  // Auftragsstatus (nicht erst nach Klick auf eine Aktion).
  await check("Phase 7 – die Codex-Sektion zeigt die verbindliche Sicherheitsinformation zu den Grenzen der Leseisolation (keine vollständige Betriebssystem-Leseisolation, bewusste Einzelfreigabe, keine Secrets in der Allowlist)", () => {
    backend.setCodexAvailability(true, true);
    ui.render();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /verhindern[\s\S]*Änderungen am echten Repository/);
    assert.match(diagnostics, /KEINE vollständige Betriebssystem-Leseisolation/);
    assert.match(diagnostics, /bewusste Einzelfreigabe durch Jamal/);
    assert.match(diagnostics, /niemals \.env, \.env\.local oder andere Secrets/);
  });

  await check("Phase 7 – 40. ohne zuvor angeforderte Freigabe ist die Codex-Startschaltfläche deaktiviert (kein Start ohne Freigabe möglich)", async () => {
    await ui.reloadSelectedOrder();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /data-action="request-codex-run-approval"/);
    assert.match(diagnostics, /data-action="start-codex-agent-execution" disabled/);
  });

  await check("Phase 7 – eine angeforderte Freigabe schaltet die Codex-Startschaltfläche frei (genau ein Freigabe-Request)", async () => {
    fetchCalls.length = 0;
    await ui.requestCodexApproval();
    const approvalCalls = fetchCalls.filter((call) => call.url.includes("request-codex-run-approval"));
    assert.strictEqual(approvalCalls.length, 1);
    assert.strictEqual(approvalCalls[0].body.presetId, "codex-analyze-pilot-structure");
    assert.ok(ui.getState().codexApprovalToken, "nach erfolgreicher Anforderung muss ein Freigabe-Token im UI-Zustand vorliegen");
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.doesNotMatch(diagnostics, /data-action="start-codex-agent-execution" disabled/);
  });

  await check("Phase 7 – 39./41. ein erfolgreicher Codex-Lauf wird mit dem Freigabe-Token gestartet, zeigt Runner/KI-Status wahrheitsgemäß und verbraucht den Token", async () => {
    backend.setNextCodexOutcome("SUCCEEDED");
    fetchCalls.length = 0;
    await ui.runCodexAgentExecution();
    const call = fetchCalls.find((c) => c.url.includes("start-agent-execution") && c.body.presetId === "codex-analyze-pilot-structure");
    assert.ok(call, "der Codex-Lauf muss über dieselbe Startroute mit dem Codex-Preset ausgelöst werden");
    assert.ok(call.body.approvalToken, "der Request muss den zuvor angeforderten Freigabe-Token mitsenden");
    assert.strictEqual(ui.getState().codexApprovalToken, null, "der Token darf nach dem Startversuch nicht erneut anzeigbar/wiederverwendbar bleiben");
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Angeforderter Runner: CODEX_READ_ONLY/);
    assert.match(diagnostics, /Tatsächlicher Runner: CODEX_READ_ONLY/);
    assert.match(diagnostics, /KI ausgeführt: ja/);
    assert.match(diagnostics, /Fallback verwendet: nein/);
    // Nach dem Verbrauch ist wieder keine gültige Freigabe vorhanden – die
    // Startschaltfläche ist erneut deaktiviert (kein impliziter Nachschub).
    assert.match(diagnostics, /data-action="start-codex-agent-execution" disabled/);
  });

  // Korrektur 2 (unabhängiges Review, Kategorie B) / Sicherheitstest 8.17
  // (Teil 3, UI-Ebene): der feste Redaktionshinweis muss im Cockpit sichtbar
  // sein, sobald eine tatsächliche Redaktion stattgefunden hat.
  await check("Phase 7 – 8.17. der Redaktionshinweis wird im Cockpit angezeigt, sobald eine Codex-Antwort tatsächlich redigiert wurde", async () => {
    await ui.requestCodexApproval();
    backend.setNextCodexOutcome("SUCCEEDED");
    backend.setNextCodexRedactionApplied(true);
    await ui.runCodexAgentExecution();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /aus Sicherheitsgründen redigiert und kann fachlich verkürzt sein/);
    backend.setNextCodexRedactionApplied(false);
  });

  await check("Phase 7 – 41. ein fehlgeschlagener Codex-Lauf zeigt einen verständlichen technischen Fehler, KI ausgeführt bleibt ehrlich 'nein'", async () => {
    await ui.requestCodexApproval();
    backend.setNextCodexOutcome("FAILED");
    await ui.runCodexAgentExecution();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Fehlgeschlagen/);
    assert.match(diagnostics, /Simulierter technischer Codex-Fehler/);
    assert.match(diagnostics, /KI ausgeführt: nein/);
  });

  // -------------------------------------------------------------------
  // Korrekturlauf ("Codex-Fehlerdiagnose gezielt verbessern") – 9. die
  // strukturierten Diagnosefelder eines fehlgeschlagenen CODEX_READ_ONLY-
  // Laufs (Exit-Code, Signal, Ursache/reasonCode, Redaktionshinweis) müssen
  // im Cockpit sichtbar sein, nicht nur der bisherige Fließtext. Kein
  // Rohsecret darf dabei sichtbar werden.
  // -------------------------------------------------------------------

  await check("Korrekturlauf – 9. die strukturierte Fehlerdiagnose eines fehlgeschlagenen Codex-Laufs (Exit-Code, Signal, Ursache, Redaktionshinweis) wird im Cockpit angezeigt", async () => {
    await ui.requestCodexApproval();
    backend.setNextCodexOutcome("FAILED");
    backend.setNextCodexDiagnostics({
      exitCode: 1,
      signal: "SIGTERM",
      reasonCode: "CODEX_PROCESS_EXIT_NONZERO",
      stderrSample: "Fehler beim Zugriff. api_key: [REDACTED] war ung\u00fcltig.",
      stdoutSample: null,
      timedOut: false,
      cancelled: false,
    });
    await ui.runCodexAgentExecution();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Exit-Code: 1/);
    assert.match(diagnostics, /Signal: SIGTERM/);
    assert.match(diagnostics, /Ursache: CODEX_PROCESS_EXIT_NONZERO/);
    assert.match(diagnostics, /Sichere technische Diagnose \u2013 m\u00f6glicherweise gek\u00fcrzt und redigiert/);
    assert.match(diagnostics, /KI ausgef\u00fchrt: nein/);
    assert.ok(!diagnostics.includes("api_key: sk-"), "kein Rohsecret im Cockpit sichtbar");
    backend.setNextCodexDiagnostics(null);
  });

  await check("Phase 7 – 40. wenn Codex nicht verfügbar ist, bleibt die Freigabeanforderung deaktiviert (kein Umgehen der Verfügbarkeitsprüfung über das UI)", async () => {
    backend.setCodexAvailability(false, false);
    await ui.reloadSelectedOrder();
    const diagnostics = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.match(diagnostics, /Codex verfügbar: nein/);
    assert.match(diagnostics, /data-action="request-codex-run-approval" disabled/);
    backend.setCodexAvailability(true, true);
  });

  // -------------------------------------------------------------------
  // V7.7.1 ("Explizite Jamal-Ausführungsfreigabe bedienbar machen"): die
  // Jamal-Bestätigungsfläche ersetzt die zuvor funktionslose Ein-Klick-
  // Sperre für approve-for-execution/approve-completion. Diese Prüfpunkte
  // spiegeln exakt die im Auftrag geforderten Regressionstests 1–11 (12.
  // ist bereits in pilot-work-order.test.js abgedeckt, audit-seitig).
  // -------------------------------------------------------------------

  function setRawOrder(id, overrides) {
    backend.orders.set(
      id,
      Object.assign(
        {
          id,
          title: "Titel",
          desiredOutcome: "Ergebnis",
          requestedBy: "Jamal",
          status: "DRAFT",
          statusLabel: STATUS_LABELS.DRAFT,
          revision: 0,
          involvedAgents: [{ pilotRoleLabel: "Projektmanager-Agent", canonicalName: "Projektmanager-Agent", focus: "x" }],
          qualityCriteria: ["a"],
          allowedTools: ["a"],
          forbiddenActions: ["a"],
          requiredApprovals: ["a"],
          timeframe: "x",
          handoffs: [],
          agentExecutionRuns: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        overrides,
      ),
    );
  }

  let approvalOrderId;

  await check("V7.7.1-1. ein Klick öffnet ausschließlich die Bestätigungsfläche – kein Request, kein Statuswechsel", async () => {
    idCounter += 1;
    approvalOrderId = `pilot-order-test-approval-${idCounter}`;
    setRawOrder(approvalOrderId, {
      title: "Auftrag J: Jamal-Freigabe-Testauftrag",
      status: "READY_FOR_JAMAL_APPROVAL",
      statusLabel: STATUS_LABELS.READY_FOR_JAMAL_APPROVAL,
      revision: 3,
    });
    await ui.selectOrder(approvalOrderId);
    fetchCalls.length = 0;
    ui.openJamalConfirmationDialog("approve-for-execution");
    const state = ui.getState();
    assert.ok(state.jamalConfirmation, "die Bestätigungsfläche muss lokal geöffnet sein");
    assert.strictEqual(state.jamalConfirmation.action, "approve-for-execution");
    assert.strictEqual(state.jamalConfirmation.pilotOrderId, approvalOrderId);
    assert.strictEqual(state.jamalConfirmation.checked, false, "die Checkbox darf beim Öffnen nicht bereits gesetzt sein");
    assert.strictEqual(fetchCalls.length, 0, "das reine Öffnen darf keinen Request auslösen");
    assert.strictEqual(state.overview.status, "READY_FOR_JAMAL_APPROVAL", "kein Statuswechsel durch das Öffnen");
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Jamal-Best\u00e4tigung erforderlich/);
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Ich best\u00e4tige diese Ausf\u00fchrungsfreigabe ausdr\u00fccklich\./);
  });

  await check("V7.7.1-2. eine Bestätigung ohne gesetzte Checkbox ist nicht möglich (kein Request, kein Statuswechsel)", async () => {
    assert.strictEqual(ui.getState().jamalConfirmation.checked, false);
    fetchCalls.length = 0;
    await ui.confirmJamalConfirmation();
    assert.strictEqual(fetchCalls.length, 0, "ohne Checkbox darf kein Request gesendet werden");
    assert.ok(ui.getState().jamalConfirmation, "die Fläche muss weiterhin geöffnet sein");
    assert.strictEqual(ui.getState().overview.status, "READY_FOR_JAMAL_APPROVAL");
  });

  await check("V7.7.1-3. Abbrechen ändert keinen Status (kein Request)", async () => {
    ui.setJamalConfirmationChecked(true);
    assert.strictEqual(ui.getState().jamalConfirmation.checked, true);
    fetchCalls.length = 0;
    ui.cancelJamalConfirmation();
    assert.strictEqual(fetchCalls.length, 0, "Abbrechen darf keinen Request auslösen");
    assert.strictEqual(ui.getState().jamalConfirmation, null, "die Fläche muss nach Abbrechen geschlossen sein");
    assert.strictEqual(ui.getState().overview.status, "READY_FOR_JAMAL_APPROVAL", "Abbrechen darf keinen Status verändern");
  });

  await check("V7.7.1-4./6. ein erneutes Öffnen, Checkbox setzen und der finale Bestätigungsklick sendet confirmed:true und erreicht APPROVED_FOR_EXECUTION", async () => {
    ui.openJamalConfirmationDialog("approve-for-execution");
    assert.strictEqual(ui.getState().jamalConfirmation.checked, false, "ein erneutes Öffnen startet wieder mit ungesetzter Checkbox");
    ui.setJamalConfirmationChecked(true);
    fetchCalls.length = 0;
    await ui.confirmJamalConfirmation();
    const call = fetchCalls.find((c) => c.url.includes("approve-for-execution"));
    assert.ok(call, "die finale Bestätigung muss über die bestehende Route gesendet werden");
    assert.strictEqual(call.body.confirmed, true, "confirmed:true darf ausschließlich vom finalen Bestätigungsklick gesendet werden");
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "APPROVED_FOR_EXECUTION", "die Freigabe muss den vorgesehenen Status erreichen");
    assert.strictEqual(state.jamalConfirmation, null, "die Fläche schließt sich nach Erfolg");
  });

  await check("V7.7.1-10. nach erfolgreicher Freigabe ist der normale Phase-7-Weg (start-execution) erreichbar", async () => {
    fetchCalls.length = 0;
    await ui.runOrderAction("start-execution", {});
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "IN_EXECUTION", "APPROVED_FOR_EXECUTION -> IN_EXECUTION muss über die UI erreichbar sein");
  });

  await check("V7.7.1-7. Doppelbetätigung des finalen Bestätigungsklicks erzeugt keine doppelte Freigabe (approve-completion)", async () => {
    idCounter += 1;
    const doubleClickOrderId = `pilot-order-test-approval-double-${idCounter}`;
    setRawOrder(doubleClickOrderId, {
      title: "Auftrag J2: Doppelklick-Testauftrag",
      status: "READY_FOR_REVIEW",
      statusLabel: STATUS_LABELS.READY_FOR_REVIEW,
      revision: 7,
    });
    await ui.selectOrder(doubleClickOrderId);
    ui.openJamalConfirmationDialog("approve-completion");
    ui.setJamalConfirmationChecked(true);
    fetchCalls.length = 0;
    const first = ui.confirmJamalConfirmation();
    assert.strictEqual(ui.getState().jamalConfirmation.submitting, true, "ein laufender Bestätigungsversuch muss als 'submitting' erkennbar sein");
    assert.match(domElements["pilot-work-order-output"].innerHTML, /data-action="jamal-confirmation-confirm" disabled/);
    const second = ui.confirmJamalConfirmation();
    await Promise.all([first, second]);
    const completionCalls = fetchCalls.filter((c) => c.url.includes("approve-completion"));
    assert.strictEqual(completionCalls.length, 1, "eine zweite, gleichzeitig ausgelöste Bestätigung darf keinen zweiten Request senden");
    assert.strictEqual(ui.getState().overview.status, "COMPLETED", "V7.7.1-11.: approve-completion nutzt dieselbe Sicherheitslogik und erreicht COMPLETED");
  });

  await check("V7.7.1-8. ein Netzwerkfehler beim finalen Bestätigungsklick lässt den bisherigen Status bestehen und zeigt eine verständliche Fehlermeldung", async () => {
    idCounter += 1;
    const networkFailureOrderId = `pilot-order-test-approval-network-${idCounter}`;
    setRawOrder(networkFailureOrderId, {
      title: "Auftrag J3: Netzwerkfehler-Testauftrag",
      status: "READY_FOR_JAMAL_APPROVAL",
      statusLabel: STATUS_LABELS.READY_FOR_JAMAL_APPROVAL,
      revision: 2,
    });
    await ui.selectOrder(networkFailureOrderId);
    ui.openJamalConfirmationDialog("approve-for-execution");
    ui.setJamalConfirmationChecked(true);
    forceNextFetchNetworkFailure = true;
    fetchCalls.length = 0;
    await ui.confirmJamalConfirmation();
    const state = ui.getState();
    assert.strictEqual(state.overview.status, "READY_FOR_JAMAL_APPROVAL", "der bisherige Status muss nach einem Netzwerkfehler unverändert bleiben");
    assert.ok(state.jamalConfirmation, "die Fläche muss nach einem Netzwerkfehler geöffnet bleiben (kein automatisches Schließen)");
    assert.strictEqual(state.jamalConfirmation.submitting, false);
    assert.ok(state.jamalConfirmation.error && state.jamalConfirmation.error.length > 0, "es muss eine verständliche Fehlermeldung angezeigt werden");
    assert.match(domElements["pilot-work-order-output"].innerHTML, /Netzwerkfehler/);
    // kein automatischer Retry: genau ein tatsächlich gesendeter Versuch.
    assert.strictEqual(fetchCalls.length, 1);
    // ein erneuter, bewusster Klick nach dem Fehler sendet erfolgreich.
    fetchCalls.length = 0;
    await ui.confirmJamalConfirmation();
    const retryCall = fetchCalls.find((c) => c.url.includes("approve-for-execution"));
    assert.ok(retryCall && retryCall.body.confirmed === true);
    assert.strictEqual(ui.getState().overview.status, "APPROVED_FOR_EXECUTION");
  });

  await check("V7.7.1-9. normale Agenten-/Kettenaktionen können die Bestätigungsfläche nicht umgehen (kein confirmed:true über einen anderen Aufrufpfad)", async () => {
    idCounter += 1;
    const bypassOrderId = `pilot-order-test-approval-bypass-${idCounter}`;
    setRawOrder(bypassOrderId, {
      title: "Auftrag J4: Umgehungs-Testauftrag",
      status: "READY_FOR_JAMAL_APPROVAL",
      statusLabel: STATUS_LABELS.READY_FOR_JAMAL_APPROVAL,
      revision: 0,
    });
    await ui.selectOrder(bypassOrderId);
    fetchCalls.length = 0;
    // Weder die generische Primäraktions-Funktion noch irgendeine andere
    // öffentlich exportierte Funktion außer confirmJamalConfirmation sendet
    // jemals confirmed:true – ein Aufruf ohne den Bestätigungsweg bleibt
    // exakt so blockiert wie zuvor (siehe bereits bestehender Prüfpunkt 21).
    await ui.runOrderAction("approve-for-execution", {});
    const call = fetchCalls.find((c) => c.url.includes("approve-for-execution"));
    assert.ok(call);
    assert.notStrictEqual(call.body.confirmed, true, "ein direkter Aufruf ohne die Bestätigungsfläche darf niemals confirmed:true senden");
    assert.strictEqual(ui.getState().overview.status, "READY_FOR_JAMAL_APPROVAL", "kein Statuswechsel ohne die Bestätigungsfläche");
  });

  console.log(`pilot-work-order-command-center-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-command-center-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
