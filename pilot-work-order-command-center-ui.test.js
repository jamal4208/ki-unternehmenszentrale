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

const CREATE_FORM_FIELD_IDS = [
  "pilot-order-draft-sentence",
  "pilot-order-create-title",
  "pilot-order-create-desired-outcome",
  "pilot-order-create-requested-by",
  "pilot-order-create-quality-criteria",
  "pilot-order-create-allowed-tools",
  "pilot-order-create-forbidden-actions",
  "pilot-order-create-required-approvals",
  "pilot-order-create-timeframe",
];

// V7.9.7 ("Formularinhalt nach Validierungs-/Serverfehler erhalten"): ein
// echter Browser zerstört beim Setzen von innerHTML sämtliche bisherigen
// Kindknoten und erzeugt sie aus dem neuen HTML-String vollständig neu –
// die Anlage-Formularfelder verlieren dabei ihren Wert, weil
// pilot-work-order-ui.js#createFormField bewusst kein `value`-Attribut
// einbettet. Der einfache String-Stub aus makeElement() bildet dieses
// Verhalten NICHT nach (dort sind die Feld-Elemente eigenständige,
// dauerhafte Einträge in domElements, unberührt vom innerHTML des
// Container-Elements). Damit die untenstehenden V7.9.7-Tests den vor
// dieser Version bestehenden Datenverlust überhaupt nachweisen können,
// simuliert genau dieser Container (der in Wirklichkeit die
// Anlage-Formularfelder als Kindknoten enthält) den echten Neuaufbau:
// JEDES Setzen von innerHTML setzt die Werte aller Anlage-Formularfelder
// auf "" zurück. pilot-work-order-ui.js muss die zuvor eingegebenen Werte
// danach ausdrücklich wiederherstellen (siehe capture-/
// restoreCreateFormFieldValues dort).
function makeCreateFormAwareListOutputElement() {
  const el = { value: "" };
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get() {
      return html;
    },
    set(newHtml) {
      html = newHtml;
      CREATE_FORM_FIELD_IDS.forEach((id) => {
        if (domElements[id]) domElements[id].value = "";
      });
    },
  });
  return el;
}

const domElements = {
  "pilot-work-order-card": makeElement({ addEventListener: () => {} }),
  "pilot-work-order-list-output": makeCreateFormAwareListOutputElement(),
  "pilot-work-order-output": makeElement(),
  "pilot-work-order-diagnostics-output": makeElement(),
  "pilot-order-draft-sentence": makeElement(),
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

// V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): das neue Satzfeld
// steht außerhalb des `pilot-order-create-*`-Namensschemas (siehe
// DRAFT_SENTENCE_FIELD_ID in pilot-work-order-ui.js).
function setDraftSentenceValue(text) {
  domElements["pilot-order-draft-sentence"].value = text;
}

// V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette bedienbar
// machen"): dieselben Feld-IDs wie HANDOFF_DRAFT_FIELD_TARGETS in
// pilot-work-order-ui.js. Die Felder sind Kindknoten von
// #pilot-work-order-output; jedes Setzen von dessen innerHTML muss sie
// (wie in einem echten Browser) auf "" zurücksetzen (siehe
// makeHandoffDraftAwareOutputElement unten) – nur so kann der
// Capture-/Restore-Mechanismus in pilot-work-order-ui.js überhaupt
// nachgewiesen werden (gleiches Muster wie CREATE_FORM_FIELD_IDS oben).
const HANDOFF_DRAFT_FIELD_IDS = [
  "pilot-handoff-draft-short-finding",
  "pilot-handoff-draft-result",
  "pilot-handoff-draft-basis",
  "pilot-handoff-draft-risk",
  "pilot-handoff-draft-next-step",
  "pilot-handoff-draft-decision-needed",
];

function makeHandoffDraftAwareOutputElement() {
  const el = { value: "" };
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get() {
      return html;
    },
    set(newHtml) {
      html = newHtml;
      HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
        if (domElements[id]) domElements[id].value = "";
      });
    },
  });
  return el;
}

// #pilot-work-order-output selbst muss das neue Reset-Verhalten bekommen
// (bislang ein reines makeElement()); die Handoff-Entwurfsfelder werden
// als eigenständige, dauerhafte Einträge ergänzt (gleiches Muster wie die
// pilot-order-create-*-Felder oben).
domElements["pilot-work-order-output"] = makeHandoffDraftAwareOutputElement();
HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
  domElements[id] = makeElement();
});

function getCreateFormFieldValues() {
  const values = {};
  [
    "title",
    "desired-outcome",
    "requested-by",
    "quality-criteria",
    "allowed-tools",
    "forbidden-actions",
    "required-approvals",
    "timeframe",
  ].forEach((suffix) => {
    values[suffix] = domElements[`pilot-order-create-${suffix}`].value;
  });
  return values;
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
  READY_FOR_JAMAL_APPROVAL: "Wartet auf deine Freigabe",
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
  // V8.0.1: standardmäßig PASSED (deckt sich mit dem echten deterministischen
  // Filter, solange alle Pflichtfelder ausgefüllt sind, siehe
  // pilot-work-order-service.js#runProjectManagerFilter); für den
  // REJECTED-Testfall gezielt umschaltbar, ohne den restlichen Vertrag zu
  // verändern.
  let nextHandoffPmFilterOutcome = "PASSED";

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
      // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
      // bedienbar machen"): bildet exakt das additive Feld aus
      // pilot-work-order-routes.js#withAgentChains nach (jede für diesen
      // Auftrag vorbereitete Kette samt Schritten) – ausschließlich lesend,
      // von Tests über backend.orders.get(id).agentChains gesetzt.
      agentChains: order.agentChains || [],
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
      // V8.7 Stufe B ("gespeicherte Entscheidungsgründe sichtbar machen"):
      // bildet exakt das additive Overview-Feld aus buildOverview() in
      // pilot-work-order-service.js (Stufe A) nach. Bewusst KEIN Fallback
      // auf null/[] hier – bleiben order.currentDecisionReason/
      // order.decisionReasonHistory beim jeweiligen Testauftrag ungesetzt,
      // liefert dieses Fake-Backend genauso undefined wie ein älterer
      // Fake-Backend-/Antwortstand (siehe Testfälle zur defensiven
      // Feldbehandlung in pilot-work-order-ui.js).
      currentDecisionReason: order.currentDecisionReason,
      decisionReasonHistory: order.decisionReasonHistory,
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
      // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
      // bedienbar machen"): bildet den HTTP-Vertrag der bestehenden,
      // UNVERÄNDERTEN submit-handoff-Route
      // (pilot-work-order-service.js#submitHandoff) nach – Pflichtfelder,
      // expectedRevision, deterministischer PM-Filter (per Testfixtur
      // erzwingbar über setNextHandoffPmFilterOutcome), REJECTED verschiebt
      // den Auftrag nach RETURNED (exakt wie im echten Service), PASSED
      // belässt ihn in IN_EXECUTION.
      if (action === "submit-handoff") {
        if (order.status !== "IN_EXECUTION") {
          return respond(409, {
            ok: false,
            message: `Rollenübergaben sind nur während IN_EXECUTION möglich (aktuell ${order.status}).`,
            pilotOrderId: orderId,
            currentStatus: order.status,
          });
        }
        if (body.expectedRevision !== undefined && body.expectedRevision !== order.revision) {
          return respond(409, {
            ok: false,
            message: `Der Pilotauftrag "${orderId}" wurde zwischenzeitlich verändert (erwartete Revision ${body.expectedRevision}, aktuell ${order.revision}).`,
            pilotOrderId: orderId,
            expectedRevision: body.expectedRevision,
            currentRevision: order.revision,
          });
        }
        const requiredTextFields = ["shortFinding", "resultOrRecommendation", "basisUsed", "riskOrLimit", "nextStep"];
        const missing = requiredTextFields.filter((field) => !body[field] || !String(body[field]).trim());
        if (missing.length > 0) {
          return respond(400, { ok: false, message: `Rollenübergabe ist unvollständig, es fehlen: ${missing.join(", ")}.` });
        }
        idCounter += 1;
        const pmFilterStatus = nextHandoffPmFilterOutcome;
        const pmFilterReasons = pmFilterStatus === "REJECTED" ? ["Testfixtur: erzwungene Ablehnung durch den Projektmanager-Filter."] : [];
        const handoff = {
          id: `pilot-handoff-test-${idCounter}`,
          fromPilotRole: body.fromPilotRole || "JAMAL",
          toPilotRole: body.toPilotRole,
          toPilotRoleLabel: body.toPilotRole === "DOKUMENTATION" ? "Dokumentations-Agent" : body.toPilotRole,
          shortFinding: body.shortFinding,
          resultOrRecommendation: body.resultOrRecommendation,
          basisUsed: body.basisUsed,
          riskOrLimit: body.riskOrLimit,
          nextStep: body.nextStep,
          decisionNeeded: body.decisionNeeded || null,
          pmFilterStatus,
          pmFilterReasons,
          createdAt: nowIso(),
        };
        order.handoffs = (order.handoffs || []).concat([handoff]);
        if (pmFilterStatus === "REJECTED") {
          order.status = "RETURNED";
          order.statusLabel = STATUS_LABELS.RETURNED;
        }
        order.revision += 1;
        order.updatedAt = nowIso();
        return respond(200, { ok: true, handoff, overview: overviewFor(order) });
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
    setNextHandoffPmFilterOutcome: (value) => {
      nextHandoffPmFilterOutcome = value;
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
// V7.9.7 ("Formularinhalt nach Validierungs-/Serverfehler erhalten"): ein
// einmaliger Schalter, um die NÄCHSTE POST /api/pilot-work-order/orders-
// Antwort auf einen bestimmten HTTP-Statuscode (400/409) zu erzwingen, ohne
// das In-Memory-Fake-Backend selbst verändern zu müssen. Gleiches Muster
// wie forceNextFetchNetworkFailure oben.
let forceNextCreateOrderResponse = null;
// V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette bedienbar
// machen"): gleiches Muster wie forceNextCreateOrderResponse oben – erzwingt
// für den NÄCHSTEN submit-handoff-POST einen bestimmten HTTP-Statuscode
// (400/409), ohne das In-Memory-Fake-Backend selbst (Pflichtfeld-/
// Revisionsprüfung) verändern zu müssen.
let forceNextSubmitHandoffResponse = null;
global.fetch = (url, opts) => {
  fetchCalls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  if (forceNextFetchNetworkFailure) {
    forceNextFetchNetworkFailure = false;
    return Promise.reject(new Error("Simulierter Netzwerkfehler (Testfixtur)."));
  }
  if (forceNextCreateOrderResponse && (opts && opts.method) === "POST" && url === "/api/pilot-work-order/orders") {
    const { status, body } = forceNextCreateOrderResponse;
    forceNextCreateOrderResponse = null;
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  }
  if (forceNextSubmitHandoffResponse && (opts && opts.method) === "POST" && /\/submit-handoff$/.test(url)) {
    const { status, body } = forceNextSubmitHandoffResponse;
    forceNextSubmitHandoffResponse = null;
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
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
  // V7.9.7 ("Formularinhalt beim Anlegen eines Pilotauftrags nach einer
  // Validierungs- oder Serverfehlermeldung erhalten"): bereits eingegebene
  // Formulardaten müssen nach einem fehlgeschlagenen Anlageversuch
  // vollständig erhalten bleiben (lokale Validierung, HTTP 400, HTTP 409,
  // Netzwerkfehler); state.creating darf dabei nie dauerhaft hängen
  // bleiben; der V7.9.6-Doppelklickschutz bleibt unangetastet. Nur nach
  // ERFOLG darf das Formular geleert werden.
  // -------------------------------------------------------------------

  const v797DomDraft = {
    title: "Entwurf V7.9.7: darf nicht verloren gehen",
    "desired-outcome": "Dieser Text muss nach einem Fehler exakt erhalten bleiben.",
    "requested-by": "Jamal",
    "quality-criteria": "Ergebnis passt",
    "allowed-tools": "interne Dokumentenablage (read-only)",
    "forbidden-actions": "externe Schreibzugriffe",
    "required-approvals": "Freigabe vor Ausführungsstart",
    timeframe: "ohne festes Enddatum",
  };
  const v797ValidInput = {
    title: v797DomDraft.title,
    desiredOutcome: v797DomDraft["desired-outcome"],
    requestedBy: v797DomDraft["requested-by"],
    qualityCriteria: [v797DomDraft["quality-criteria"]],
    allowedTools: [v797DomDraft["allowed-tools"]],
    forbiddenActions: [v797DomDraft["forbidden-actions"]],
    requiredApprovals: [v797DomDraft["required-approvals"]],
    timeframe: v797DomDraft.timeframe,
  };

  function assertV797DomDraftPreserved(message) {
    Object.keys(v797DomDraft).forEach((suffix) => {
      const id = `pilot-order-create-${suffix}`;
      assert.strictEqual(domElements[id].value, v797DomDraft[suffix], `${message} (Feld ${id})`);
    });
  }

  await check("V7.9.7-A. lokaler Validierungsfehler: Formularwerte bleiben erhalten, kein POST, Fehlermeldung sichtbar", async () => {
    ui.getState().createOpen = true;
    ui.getState().createError = null;
    setCreateFormValues(v797DomDraft);
    const callsBefore = fetchCalls.length;
    // requestedBy fehlt bewusst: löst die rein clientseitige
    // Vollständigkeitsprüfung aus (validateCreateInput), ohne dass ein
    // Request gesendet wird.
    await ui.submitCreateOrder(Object.assign({}, v797ValidInput, { requestedBy: "" }));
    assert.strictEqual(fetchCalls.length, callsBefore, "eine unvollständige Anlage darf keinen Request auslösen");
    assert.ok(ui.getState().createError && ui.getState().createError.length > 0, "Fehlermeldung muss sichtbar sein");
    assert.strictEqual(ui.getState().creating, false);
    assertV797DomDraftPreserved("nach lokalem Validierungsfehler");
  });

  await check("V7.9.7-B. HTTP 400: Formularwerte bleiben erhalten, Fehlermeldung sichtbar, state.creating wird zurückgesetzt, erneuter Versuch möglich", async () => {
    ui.getState().createOpen = true;
    ui.getState().createError = null;
    setCreateFormValues(v797DomDraft);
    fetchCalls.length = 0;
    forceNextCreateOrderResponse = { status: 400, body: { ok: false, message: "Pilotauftrag ist unvollständig, es fehlen: requestedBy. (Testfixtur)" } };
    await ui.submitCreateOrder(v797ValidInput);
    assert.strictEqual(fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders").length, 1, "genau ein POST bei HTTP 400");
    assert.ok(ui.getState().createError && /unvollständig/.test(ui.getState().createError), "Serverfehlermeldung muss sichtbar sein");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach HTTP 400 zurückgesetzt werden");
    assert.strictEqual(ui.getState().createOpen, true, "Dialog bleibt nach einem Fehler geöffnet");
    assertV797DomDraftPreserved("nach HTTP 400");

    // Erneuter Anlageversuch muss wieder möglich sein (keine dauerhafte Sperre).
    fetchCalls.length = 0;
    await ui.submitCreateOrder(v797ValidInput);
    const retryCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(retryCalls.length, 1, "nach HTTP 400 muss ein erneuter Anlageversuch genau einen POST erzeugen");
    assert.strictEqual(ui.getState().createOpen, false, "eine erfolgreiche Anlage schließt den Dialog");
    assert.strictEqual(ui.getState().createError, null);
  });

  await check("V7.9.7-C. HTTP 409: Formularwerte bleiben erhalten, Kollisionsmeldung sichtbar, state.creating wird zurückgesetzt, erneuter Versuch möglich", async () => {
    ui.getState().createOpen = true;
    ui.getState().createError = null;
    setCreateFormValues(v797DomDraft);
    fetchCalls.length = 0;
    forceNextCreateOrderResponse = {
      status: 409,
      body: { ok: false, message: 'Ein Pilotauftrag mit der ID "pilot-order-test-collision" existiert bereits und wird nicht überschrieben.' },
    };
    await ui.submitCreateOrder(v797ValidInput);
    assert.strictEqual(fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders").length, 1, "genau ein POST bei HTTP 409");
    assert.ok(ui.getState().createError && /existiert bereits/.test(ui.getState().createError), "Kollisionsmeldung muss sichtbar sein");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach HTTP 409 zurückgesetzt werden");
    assert.strictEqual(ui.getState().createOpen, true, "Dialog bleibt nach einem Konflikt geöffnet");
    assertV797DomDraftPreserved("nach HTTP 409");

    fetchCalls.length = 0;
    await ui.submitCreateOrder(v797ValidInput);
    const retryCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(retryCalls.length, 1, "nach HTTP 409 muss ein erneuter Anlageversuch genau einen POST erzeugen");
    assert.strictEqual(ui.getState().createOpen, false, "eine erfolgreiche Anlage schließt den Dialog");
    assert.strictEqual(ui.getState().createError, null);
  });

  await check("V7.9.7-D. Netzwerkfehler: Formularwerte bleiben erhalten, verständliche Meldung, state.creating wird zurückgesetzt, Anlegen-Knopf bleibt nicht dauerhaft gesperrt", async () => {
    ui.getState().createOpen = true;
    ui.getState().createError = null;
    setCreateFormValues(v797DomDraft);
    fetchCalls.length = 0;
    forceNextFetchNetworkFailure = true;
    await ui.submitCreateOrder(v797ValidInput);
    assert.strictEqual(fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders").length, 1, "genau ein POST-Versuch beim Netzwerkfehler");
    assert.ok(ui.getState().createError && ui.getState().createError.length > 0, "verständliche Fehlermeldung muss sichtbar sein");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach einem Netzwerkfehler zurückgesetzt werden (Knopf nicht dauerhaft gesperrt)");
    assert.strictEqual(ui.getState().createOpen, true, "Dialog bleibt nach einem Netzwerkfehler geöffnet");
    assertV797DomDraftPreserved("nach Netzwerkfehler");

    fetchCalls.length = 0;
    await ui.submitCreateOrder(v797ValidInput);
    const retryCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(retryCalls.length, 1, "nach einem Netzwerkfehler muss ein erneuter Anlageversuch genau einen POST erzeugen");
    assert.strictEqual(ui.getState().createOpen, false, "eine erfolgreiche Anlage schließt den Dialog");
  });

  await check("V7.9.7-E. Erfolg: Doppelklickschutz bleibt aktiv, genau ein POST, Formular wird erst nach Erfolg geleert, Dialog schließt, neuer Auftrag wird ausgewählt, weitere Anlage danach möglich", async () => {
    ui.getState().createOpen = true;
    ui.getState().createError = null;
    setCreateFormValues(v797DomDraft);
    fetchCalls.length = 0;
    const first = ui.submitCreateOrder(v797ValidInput);
    assert.strictEqual(ui.getState().creating, true, "während der Anlage muss der Doppelklickschutz aktiv sein");
    // Simuliert einen sofortigen zweiten Klick während die Anlage noch läuft.
    const second = ui.submitCreateOrder(v797ValidInput);
    await Promise.all([first, second]);
    const createCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(createCalls.length, 1, "trotz zweitem Klick während der Anlage darf nur genau ein POST entstehen");
    const state = ui.getState();
    assert.strictEqual(state.creating, false, "nach Erfolg darf keine dauerhafte Sperre bestehen bleiben");
    assert.strictEqual(state.createOpen, false, "der Dialog muss nach Erfolg schließen");
    assert.strictEqual(state.createError, null);
    assert.notStrictEqual(state.selectedPilotOrderId, ui.CANONICAL_PILOT_ORDER_ID, "der neu angelegte Auftrag muss ausgewählt werden");
    assert.strictEqual(state.overview.order.id, state.selectedPilotOrderId);
    Object.keys(v797DomDraft).forEach((suffix) => {
      const id = `pilot-order-create-${suffix}`;
      assert.strictEqual(domElements[id].value, "", `Formularfeld ${id} muss erst NACH erfolgreicher Anlage geleert werden`);
    });

    // Eine weitere, spätere Anlage muss weiterhin möglich sein.
    ui.getState().createOpen = true;
    setCreateFormValues(v797DomDraft);
    fetchCalls.length = 0;
    await ui.submitCreateOrder(v797ValidInput);
    const laterCreateCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(laterCreateCalls.length, 1, "eine spätere Anlage nach einem erfolgreichen Durchlauf muss wieder genau einen POST erzeugen");
    assert.strictEqual(ui.getState().creating, false);
    assert.strictEqual(ui.getState().createOpen, false);
  });

  // -------------------------------------------------------------------
  // V8.0 ("Pilotauftrag aus einem Satz vorausfüllen"): rein lokaler,
  // deterministischer Arbeitsvorschlag füllt die acht bestehenden
  // Anlage-Formularfelder vor. Ergänzt (ersetzt nicht) die V7.9.6/
  // V7.9.7-Prüfpunkte oben. Kein fetch, kein POST, keine Kettenvorbereitung,
  // keine Freigabe, kein Agentenlauf für den Vorschlag selbst.
  // -------------------------------------------------------------------

  const V8_USER_PERSPECTIVE_SENTENCE =
    "Pr\u00fcfe bitte, wie wir die Unternehmenszentrale f\u00fcr den t\u00e4glichen Gebrauch einfacher machen.";
  const V8_UNSUPPORTED_SENTENCE = "Bereite bitte einen ProWin-Vertriebstermin f\u00fcr Marketingassets vor.";

  function resetDraftTestState() {
    const state = ui.getState();
    state.createOpen = true;
    state.createError = null;
    state.draftResult = null;
    state.draftFilledValues = null;
    state.draftSentenceAtBuild = null;
    CREATE_FORM_FIELD_IDS.forEach((id) => {
      domElements[id].value = "";
    });
    ui.render();
  }

  function captureFullFormSnapshot() {
    return Object.assign({ sentence: domElements["pilot-order-draft-sentence"].value }, getCreateFormFieldValues());
  }

  function assertFullFormSnapshotEqual(expected, message) {
    assert.deepStrictEqual(captureFullFormSnapshot(), expected, message);
  }

  await check("V8.0-1./2. Arbeitsvorschlag erstellen erzeugt weder einen fetch noch einen POST /orders", async () => {
    resetDraftTestState();
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);
    fetchCalls.length = 0;
    ui.buildWorkDraft();
    assert.strictEqual(fetchCalls.length, 0, "buildWorkDraft darf niemals einen fetch auslösen");
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/pilot-work-order/orders").length, 0);
  });

  await check("V8.0-3. alle acht bestehenden Formularfelder werden gefüllt", async () => {
    ui.render();
    const values = getCreateFormFieldValues();
    Object.keys(values).forEach((suffix) => {
      assert.ok(values[suffix] && values[suffix].length > 0, `Feld pilot-order-create-${suffix} muss gefüllt sein`);
    });
    assert.strictEqual(values["requested-by"], "Jamal");
    assert.strictEqual(fetchCalls.length, 0, "das Vorausfüllen darf keinen Request auslösen");
  });

  await check("V8.0-4. das Satzfeld bleibt nach render() erhalten", async () => {
    ui.render();
    assert.strictEqual(domElements["pilot-order-draft-sentence"].value, V8_USER_PERSPECTIVE_SENTENCE);
  });

  await check("V8.0-5. eine manuelle Änderung bleibt nach render() erhalten und wird als 'Von dir geändert' markiert", async () => {
    domElements["pilot-order-create-title"].value = "Von Jamal manuell ge\u00e4nderter Titel";
    ui.render();
    assert.strictEqual(domElements["pilot-order-create-title"].value, "Von Jamal manuell ge\u00e4nderter Titel");
    assert.match(domElements["pilot-work-order-list-output"].innerHTML, /Von dir ge\u00e4ndert/);
  });

  await check("V8.0-6. ein erneuter Vorschlag überschreibt die manuelle Änderung nicht", async () => {
    fetchCalls.length = 0;
    ui.buildWorkDraft();
    ui.render();
    assert.strictEqual(
      domElements["pilot-order-create-title"].value,
      "Von Jamal manuell ge\u00e4nderter Titel",
      "ein erneuter Vorschlag darf eine manuelle Änderung niemals überschreiben",
    );
    assert.strictEqual(fetchCalls.length, 0);
    assert.ok(domElements["pilot-order-create-desired-outcome"].value.length > 0, "nicht manuell geänderte Felder werden weiterhin gefüllt");
  });

  await check("V8.0-7. ein Doppelklick auf den Vorschlagsknopf erzeugt keinen doppelten Zustand und keinen Request", async () => {
    resetDraftTestState();
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);
    fetchCalls.length = 0;
    ui.buildWorkDraft();
    const afterFirst = getCreateFormFieldValues();
    ui.buildWorkDraft();
    const afterSecond = getCreateFormFieldValues();
    assert.deepStrictEqual(afterSecond, afterFirst, "ein zweiter, unmittelbarer Vorschlagsklick darf keinen abweichenden Zustand erzeugen");
    assert.strictEqual(fetchCalls.length, 0, "ein Doppelklick auf den Vorschlagsknopf darf niemals einen Request auslösen");
  });

  await check("V8.0-8. der bestehende Doppelklickschutz für 'Pilotauftrag anlegen' bleibt genau ein POST (Regression, siehe auch 9b./V7.9.7-E)", async () => {
    fetchCalls.length = 0;
    const input = {
      title: "Auftrag A5: V8.0-Regressionstest Doppelklickschutz",
      desiredOutcome: "Nachweis, dass V8.0 den bestehenden Doppelklickschutz nicht verändert.",
      requestedBy: "Jamal",
      qualityCriteria: ["Ergebnis passt"],
      allowedTools: ["interne Dokumentenablage (read-only)"],
      forbiddenActions: ["externe Schreibzugriffe"],
      requiredApprovals: ["Freigabe vor Ausführungsstart"],
      timeframe: "ohne festes Enddatum",
    };
    const first = ui.submitCreateOrder(input);
    const second = ui.submitCreateOrder(input);
    await Promise.all([first, second]);
    const createCalls = fetchCalls.filter((call) => call.method === "POST" && call.url === "/api/pilot-work-order/orders");
    assert.strictEqual(createCalls.length, 1);
  });

  await check("V8.0-9. ein nicht unterstützter Satz füllt kein Feld", async () => {
    resetDraftTestState();
    setDraftSentenceValue(V8_UNSUPPORTED_SENTENCE);
    fetchCalls.length = 0;
    ui.buildWorkDraft();
    ui.render();
    const values = getCreateFormFieldValues();
    Object.keys(values).forEach((suffix) => {
      assert.strictEqual(values[suffix], "", `Feld pilot-order-create-${suffix} darf bei UNSUPPORTED nicht gefüllt werden`);
    });
    assert.strictEqual(fetchCalls.length, 0);
    assert.match(
      domElements["pilot-work-order-list-output"].innerHTML,
      /Daf\u00fcr kann ich noch keinen Kettenauftrag vorbereiten/,
    );
  });

  await check("V8.0-10./11./12. der Vorschlagsweg löst niemals prepare-agent-chain, approve-for-execution oder start-chain-step aus", async () => {
    assert.strictEqual(
      fetchCalls.filter((call) => /prepare-agent-chain|approve-for-execution|start-chain-step/.test(call.url)).length,
      0,
    );
  });

  await check("V8.0-13. Satz und alle acht Felder bleiben nach HTTP 400 erhalten", async () => {
    resetDraftTestState();
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);
    ui.buildWorkDraft();
    ui.render();
    const snapshot = captureFullFormSnapshot();
    fetchCalls.length = 0;
    forceNextCreateOrderResponse = { status: 400, body: { ok: false, message: "Pilotauftrag ist unvollst\u00e4ndig (Testfixtur V8.0)." } };
    await ui.submitCreateOrder(v797ValidInput);
    assertFullFormSnapshotEqual(snapshot, "nach HTTP 400");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach HTTP 400 zurückgesetzt werden");
  });

  await check("V8.0-14. Satz und alle acht Felder bleiben nach HTTP 409 erhalten", async () => {
    const snapshot = captureFullFormSnapshot();
    fetchCalls.length = 0;
    forceNextCreateOrderResponse = {
      status: 409,
      body: { ok: false, message: "Ein Pilotauftrag mit dieser ID existiert bereits (Testfixtur V8.0)." },
    };
    await ui.submitCreateOrder(v797ValidInput);
    assertFullFormSnapshotEqual(snapshot, "nach HTTP 409");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach HTTP 409 zurückgesetzt werden");
  });

  await check("V8.0-15. Satz und alle acht Felder bleiben nach einem Netzwerkfehler erhalten", async () => {
    const snapshot = captureFullFormSnapshot();
    fetchCalls.length = 0;
    forceNextFetchNetworkFailure = true;
    await ui.submitCreateOrder(v797ValidInput);
    assertFullFormSnapshotEqual(snapshot, "nach einem Netzwerkfehler");
    assert.strictEqual(ui.getState().creating, false, "state.creating muss nach einem Netzwerkfehler zurückgesetzt werden");
  });

  await check("V8.0-16. state.creating wird nach jedem der drei vorstehenden Fehler zurückgesetzt (Zusammenfassung 13.–15.)", async () => {
    assert.strictEqual(ui.getState().creating, false);
    assert.strictEqual(ui.getState().createOpen, true, "der Dialog bleibt nach einem Fehler geöffnet");
  });

  await check("V8.0-17. nach erfolgreicher Anlage wird der Vorschlagszustand vollständig geleert", async () => {
    fetchCalls.length = 0;
    await ui.submitCreateOrder(v797ValidInput);
    const state = ui.getState();
    assert.strictEqual(state.createOpen, false, "eine erfolgreiche Anlage schließt den Dialog");
    assert.strictEqual(state.draftResult, null, "draftResult muss nach erfolgreicher Anlage geleert werden");
    assert.strictEqual(state.draftFilledValues, null, "draftFilledValues muss nach erfolgreicher Anlage geleert werden");
    assert.strictEqual(state.draftSentenceAtBuild, null, "draftSentenceAtBuild muss nach erfolgreicher Anlage geleert werden");
    assert.strictEqual(domElements["pilot-order-draft-sentence"].value, "", "das Satzfeld muss nach erfolgreicher Anlage geleert werden");
  });

  // -------------------------------------------------------------------
  // Korrekturlauf V8.0 (F1): bereits manuell ausgefüllte Felder dürfen
  // beim ERSTEN Klick auf "Arbeitsvorschlag erstellen" nicht still
  // überschrieben werden (vorher fehlte ein Vergleichswert, solange
  // state.draftFilledValues noch nie gesetzt wurde).
  // -------------------------------------------------------------------

  await check("F1. bereits manuell ausgefüllte Felder werden beim ERSTEN Arbeitsvorschlag nicht überschrieben", async () => {
    resetDraftTestState();
    const manualTitle = "Mein eigener Titel vor dem Vorschlag";
    const manualTimeframe = "Diese Woche";
    domElements["pilot-order-create-title"].value = manualTitle;
    domElements["pilot-order-create-timeframe"].value = manualTimeframe;
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);

    const ordersCountBefore = backend.orders.size;
    fetchCalls.length = 0;
    // state.draftFilledValues ist an dieser Stelle nachweislich noch nie
    // gesetzt worden (erster Vorschlag in diesem frisch geöffneten
    // Anlageformular) – genau der zuvor fehlerhafte Fall.
    assert.strictEqual(ui.getState().draftFilledValues, null, "Vorbedingung: noch kein früherer Vorschlagswert vorhanden");

    ui.buildWorkDraft();
    ui.render();

    assert.strictEqual(domElements["pilot-order-create-title"].value, manualTitle, "der bereits eingetragene Titel darf beim ersten Vorschlag nicht überschrieben werden");
    assert.strictEqual(domElements["pilot-order-create-timeframe"].value, manualTimeframe, "der bereits eingetragene Zeitrahmen darf beim ersten Vorschlag nicht überschrieben werden");

    ["desired-outcome", "requested-by", "quality-criteria", "allowed-tools", "forbidden-actions", "required-approvals"].forEach((suffix) => {
      const value = domElements[`pilot-order-create-${suffix}`].value;
      assert.ok(value && value.length > 0, `das zuvor leere Feld pilot-order-create-${suffix} muss regulär vorausgefüllt werden`);
    });

    const listOutputHtml = domElements["pilot-work-order-list-output"].innerHTML;
    assert.match(
      listOutputHtml,
      /for="pilot-order-create-title">Titel <span class="pilot-order-draft-changed-badge">Von dir ge\u00e4ndert<\/span>/,
      "der manuell eingetragene Titel muss als 'Von dir geändert' erkannt werden",
    );
    assert.match(
      listOutputHtml,
      /for="pilot-order-create-timeframe">Zeitrahmen <span class="pilot-order-draft-changed-badge">Von dir ge\u00e4ndert<\/span>/,
      "der manuell eingetragene Zeitrahmen muss als 'Von dir geändert' erkannt werden",
    );
    assert.doesNotMatch(
      listOutputHtml,
      /for="pilot-order-create-desired-outcome">Gew\u00fcnschtes Ergebnis <span class="pilot-order-draft-changed-badge"/,
      "ein regulär vorausgefülltes Feld darf nicht fälschlich als 'Von dir geändert' markiert werden",
    );

    assert.strictEqual(fetchCalls.length, 0, "der Arbeitsvorschlag darf beim ersten Klick keinen fetch-Aufruf auslösen");
    assert.strictEqual(backend.orders.size, ordersCountBefore, "der Arbeitsvorschlag darf keinen Auftrag anlegen");
    assert.strictEqual(ui.getState().creating, false, "der Arbeitsvorschlag darf keinen Anlage- oder Kettenlauf auslösen");
  });

  // -------------------------------------------------------------------
  // Korrekturlauf V8.0 (F5): ein Auftragswechsel muss den offenen
  // V8.0-Vorschlagszustand vollständig zurücksetzen (resetDraftState()),
  // ohne einen zusätzlichen Request oder eine zweite Reset-Logik.
  // -------------------------------------------------------------------

  await check("F5. ein Auftragswechsel setzt den offenen V8.0-Vorschlagszustand vollständig zurück", async () => {
    resetDraftTestState();
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);
    fetchCalls.length = 0;
    ui.buildWorkDraft();
    ui.render();

    assert.ok(ui.getState().draftResult, "vor dem Auftragswechsel muss ein Vorschlagszustand vorhanden sein");
    assert.ok(ui.getState().draftFilledValues, "vor dem Auftragswechsel muss draftFilledValues vorhanden sein");
    assert.strictEqual(ui.getState().draftSentenceAtBuild, V8_USER_PERSPECTIVE_SENTENCE);
    assert.match(
      domElements["pilot-work-order-list-output"].innerHTML,
      /pilot-order-draft-result/,
      "der Vorschlagsblock muss vor dem Auftragswechsel sichtbar sein",
    );

    const previouslySelectedOrderId = ui.getState().selectedPilotOrderId;
    assert.notStrictEqual(previouslySelectedOrderId, orderAId, "Testvoraussetzung: aktuell ist ein anderer Auftrag als orderAId ausgewählt");

    fetchCalls.length = 0;
    const selectPromise = ui.selectOrder(orderAId);

    // Unmittelbar nach dem Aufruf (vor dem Netzwerk-Roundtrip) muss der
    // V8.0-Vorschlagszustand bereits vollständig verworfen sein.
    const stateRightAfterCall = ui.getState();
    assert.strictEqual(stateRightAfterCall.draftResult, null, "draftResult muss sofort beim Auftragswechsel zurückgesetzt werden");
    assert.strictEqual(stateRightAfterCall.draftFilledValues, null, "draftFilledValues muss sofort beim Auftragswechsel zurückgesetzt werden");
    assert.strictEqual(stateRightAfterCall.draftSentenceAtBuild, null, "draftSentenceAtBuild muss sofort beim Auftragswechsel zurückgesetzt werden");

    await selectPromise;
    const state = ui.getState();
    assert.strictEqual(state.draftResult, null, "draftResult bleibt nach dem Laden des neuen Auftrags zurückgesetzt");
    assert.strictEqual(state.draftFilledValues, null, "draftFilledValues bleibt nach dem Laden des neuen Auftrags zurückgesetzt");
    assert.strictEqual(state.draftSentenceAtBuild, null, "draftSentenceAtBuild bleibt nach dem Laden des neuen Auftrags zurückgesetzt");
    assert.strictEqual(state.overview.order.id, orderAId, "der ausgewählte Auftrag wird regulär geladen");

    ui.render();
    assert.doesNotMatch(
      domElements["pilot-work-order-list-output"].innerHTML,
      /pilot-order-draft-result/,
      "der Vorschlagsblock muss nach dem Auftragswechsel verschwunden sein",
    );

    assert.strictEqual(
      fetchCalls.filter((call) => call.method === "POST").length,
      0,
      "der Reset selbst darf keinen Request auslösen (kein POST durch den Auftragswechsel)",
    );
    assert.strictEqual(
      fetchCalls.filter((call) => call.url === `/api/pilot-work-order/orders/${orderAId}`).length,
      1,
      "ausschließlich der reguläre Ladevorgang des neu ausgewählten Auftrags",
    );
  });

  // -------------------------------------------------------------------
  // Korrekturlauf V8.0 (F2, ausschließlich Anzeige): die vom
  // Profilmodul tatsächlich gelieferten Treffer (rationale.matchedKeywords)
  // werden im Vorschlagsblock in Alltagssprache angezeigt – keine zweite
  // Stichworterkennung in pilot-work-order-ui.js, alle Werte über die
  // bestehende escapeHtml()-Logik.
  // -------------------------------------------------------------------

  await check("F2. die tatsächlich erkannten Stichwörter werden im Vorschlagsblock sichtbar und escaped angezeigt", async () => {
    await ui.selectOrder(ui.CANONICAL_PILOT_ORDER_ID);
    resetDraftTestState();
    setDraftSentenceValue(V8_USER_PERSPECTIVE_SENTENCE);
    fetchCalls.length = 0;
    ui.buildWorkDraft();

    const draftResult = ui.getState().draftResult;
    assert.strictEqual(draftResult.outcome, "DRAFT");
    const realMatchedKeywords = draftResult.rationale && draftResult.rationale.matchedKeywords;
    assert.ok(Array.isArray(realMatchedKeywords) && realMatchedKeywords.length > 0, "Testvoraussetzung: das Profilmodul liefert tatsächliche Treffer");

    ui.render();
    const htmlWithRealKeywords = domElements["pilot-work-order-list-output"].innerHTML;
    assert.match(htmlWithRealKeywords, /Als Nutzerperspektive erkannt, weil in deinem Satz vorkommt:/, "der Hinweis muss in Alltagssprache erscheinen");
    realMatchedKeywords.forEach((keyword) => {
      assert.ok(htmlWithRealKeywords.includes(keyword), `das tatsächlich gelieferte Stichwort "${keyword}" muss sichtbar sein`);
    });
    assert.doesNotMatch(htmlWithRealKeywords, /USER_PERSPECTIVE/, "keine technische Profil-ID im Haupttext");

    // Sonderzeichen-Nachweis sowie Nachweis "keine zweite Stichworterkennung
    // in der UI": es wird ausschließlich rationale.matchedKeywords
    // durchgereicht, unabhängig davon, ob das Wort tatsächlich im Satz
    // vorkommt oder Sonderzeichen enthält (kein eigenes Nachprüfen/erneutes
    // Suchen in pilot-work-order-ui.js).
    const injectedKeywords = ['<b>t\u00e4glich</b>', 'einfacher"\'&'];
    ui.getState().draftResult = Object.assign({}, draftResult, {
      rationale: Object.assign({}, draftResult.rationale, { matchedKeywords: injectedKeywords }),
    });
    ui.render();
    const htmlWithInjection = domElements["pilot-work-order-list-output"].innerHTML;
    assert.doesNotMatch(htmlWithInjection, /<b>t\u00e4glich<\/b>/, "spitze Klammern in Stichwörtern dürfen nicht ungeschützt in das HTML gelangen");
    assert.match(htmlWithInjection, /&lt;b&gt;t\u00e4glich&lt;\/b&gt;/, "spitze Klammern in Stichwörtern müssen escaped werden");
    assert.match(htmlWithInjection, /einfacher&quot;&#39;&amp;/, "Anführungszeichen und Et-Zeichen in Stichwörtern müssen escaped werden");

    // Keine leere Überschrift bei leerer Trefferliste.
    ui.getState().draftResult = Object.assign({}, draftResult, {
      rationale: Object.assign({}, draftResult.rationale, { matchedKeywords: [] }),
    });
    ui.render();
    assert.doesNotMatch(
      domElements["pilot-work-order-list-output"].innerHTML,
      /Als Nutzerperspektive erkannt/,
      "bei leerer Trefferliste darf kein Hinweis angezeigt werden",
    );

    // Kein Missbrauch als zweite Erkennung: fehlt rationale vollständig,
    // bleibt der Hinweis ebenfalls vollständig weg.
    ui.getState().draftResult = Object.assign({}, draftResult, { rationale: null });
    ui.render();
    assert.doesNotMatch(
      domElements["pilot-work-order-list-output"].innerHTML,
      /Als Nutzerperspektive erkannt/,
      "bei fehlender rationale darf kein Hinweis angezeigt werden",
    );

    resetDraftTestState();
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

  // -------------------------------------------------------------------
  // V8.0.1 ("Rollenübergabe nach abgeschlossener Drei-Agenten-Kette
  // bedienbar machen"): ein eigenständiger, dedizierter Testauftrag wird
  // direkt in IN_EXECUTION mit einer bereits COMPLETED-Kette (Schritt 3 /
  // Projektmanager-Agent erfolgreich) angelegt, damit sowohl die
  // Vorbefüllung als auch die volle Bedienstrecke (Öffnen, Ändern,
  // Einreichen, Fehlerfälle, Auftragswechsel) geprüft werden können.
  // -------------------------------------------------------------------

  let handoffOrderId;
  let handoffChainId;
  let handoffPmRunId;

  await check(
    "V8.0.1-1. IN_EXECUTION ohne angenommene Dokumentationsübergabe: Abschlussknopf nicht sichtbar, 'Rollenübergabe vorbereiten' sichtbar",
    async () => {
      idCounter += 1;
      handoffOrderId = `pilot-order-test-handoff-${idCounter}`;
      handoffChainId = `pilot-agent-chain-test-${idCounter}`;
      handoffPmRunId = `pilot-agent-run-test-pm-${idCounter}`;
      setRawOrder(handoffOrderId, {
        title: "Auftrag H: Handoff-Testauftrag",
        status: "IN_EXECUTION",
        statusLabel: STATUS_LABELS.IN_EXECUTION,
        revision: 5,
        handoffs: [],
        agentExecutionRuns: [
          {
            id: handoffPmRunId,
            presetId: "codex-pm-evaluate-chain",
            pilotRole: "PROJEKTMANAGER",
            pilotRoleLabel: "Projektmanager-Agent",
            status: "SUCCEEDED",
            resultRawText: "# Projektmanager-Bewertung\n\nGesamturteil: passt.\n\nEmpfehlung: annehmen.",
            resultSummary: { analyzedFiles: ["a.md", "b.md"] },
          },
        ],
        agentChains: [
          {
            id: handoffChainId,
            chainStatus: "COMPLETED",
            steps: [
              { stepNumber: 1, stepStatus: "SUCCEEDED", executionRunId: "run-h-1", roleHandoffBooked: true },
              { stepNumber: 2, stepStatus: "SUCCEEDED", executionRunId: "run-h-2", roleHandoffBooked: true },
              { stepNumber: 3, stepStatus: "SUCCEEDED", executionRunId: handoffPmRunId, roleHandoffBooked: true },
            ],
          },
        ],
      });
      await ui.selectOrder(handoffOrderId);
      const html = domElements["pilot-work-order-output"].innerHTML;
      assert.doesNotMatch(html, /data-action="submit-for-review"/, "ohne angenommene Dokumentationsübergabe darf kein Abschlussknopf sichtbar sein");
      assert.match(html, /data-action="prepare-handoff-draft"/);
      assert.match(html, /Rollen\u00fcbergabe vorbereiten/);
    },
  );

  await check(
    "V8.0.1-2. Klick auf 'Rollenübergabe vorbereiten': kein Request, Entwurf sichtbar, Pflichtfelder vorausgefüllt, Hinweis sichtbar",
    async () => {
      fetchCalls.length = 0;
      ui.openHandoffDraft();
      assert.strictEqual(fetchCalls.length, 0, "das reine Öffnen des Entwurfs darf keinen Request auslösen");
      const state = ui.getState();
      assert.ok(state.handoffDraft, "der Entwurf muss lokal geöffnet sein");
      assert.strictEqual(state.handoffDraft.pilotOrderId, handoffOrderId);
      const html = domElements["pilot-work-order-output"].innerHTML;
      assert.match(html, /Diese \u00dcbergabe wird erst mit deinem Klick eingereicht\./);
      assert.match(html, /Recherche-\/Analyse-Agent/);
      assert.match(html, /Dokumentations-Agent/);
      assert.match(html, new RegExp(handoffPmRunId), "die Grundlage muss den tatsächlichen Lauf von Kettenschritt 3 referenzieren");
      assert.match(
        domElements["pilot-handoff-draft-result"].value,
        /Gesamturteil: passt\./,
        "das Ergebnisfeld muss unverändert aus Kettenschritt 3 (Projektmanager-Agent) vorbefüllt sein",
      );
      assert.notStrictEqual(domElements["pilot-handoff-draft-short-finding"].value, "", "Kurzbefund muss vorausgefüllt sein");
      assert.notStrictEqual(domElements["pilot-handoff-draft-basis"].value, "", "Grundlage muss vorausgefüllt sein");
      assert.notStrictEqual(domElements["pilot-handoff-draft-next-step"].value, "", "nächster Schritt muss vorausgefüllt sein");
    },
  );

  await check("V8.0.1-3. eine manuelle Änderung im Entwurf bleibt nach render() erhalten", () => {
    domElements["pilot-handoff-draft-risk"].value = "Manuell erg\u00e4nztes Risiko: keine bekannten Blocker.";
    ui.render();
    assert.strictEqual(domElements["pilot-handoff-draft-risk"].value, "Manuell erg\u00e4nztes Risiko: keine bekannten Blocker.");
  });

  await check("V8.0.1-4./5. HTTP 400: alle Feldwerte bleiben erhalten, der Einreichen-Knopf wird wieder nutzbar", async () => {
    forceNextSubmitHandoffResponse = { status: 400, body: { ok: false, message: "Rollenübergabe ist unvollständig, es fehlen: shortFinding." } };
    fetchCalls.length = 0;
    const valuesBefore = {};
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      valuesBefore[id] = domElements[id].value;
    });
    await ui.submitHandoffDraft();
    const postCalls = fetchCalls.filter((c) => c.method === "POST" && c.url.includes("submit-handoff"));
    assert.strictEqual(postCalls.length, 1, "genau ein POST submit-handoff je Klick");
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      assert.strictEqual(domElements[id].value, valuesBefore[id], `Feld ${id} muss nach HTTP 400 erhalten bleiben`);
    });
    const state = ui.getState();
    assert.ok(state.handoffDraft, "der Entwurf muss nach einem Fehler geöffnet bleiben");
    assert.strictEqual(state.handoffDraft.submitting, false, "der Knopf muss nach dem Fehler wieder nutzbar sein");
    assert.ok(state.handoffDraft.error && state.handoffDraft.error.length > 0, "es muss eine verständliche Fehlermeldung angezeigt werden");
    assert.strictEqual(state.overview.status, "IN_EXECUTION", "der Status darf sich durch einen 400er nicht ändern");
    assert.strictEqual(state.overview.handoffs.length, 0, "kein Handoff darf bei HTTP 400 entstanden sein");
  });

  await check("V8.0.1-6./7. HTTP 409: alle Feldwerte bleiben erhalten, der Einreichen-Knopf wird wieder nutzbar", async () => {
    forceNextSubmitHandoffResponse = {
      status: 409,
      body: { ok: false, message: `Der Pilotauftrag "${handoffOrderId}" wurde zwischenzeitlich verändert.`, pilotOrderId: handoffOrderId },
    };
    fetchCalls.length = 0;
    const valuesBefore = {};
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      valuesBefore[id] = domElements[id].value;
    });
    await ui.submitHandoffDraft();
    const postCalls = fetchCalls.filter((c) => c.method === "POST" && c.url.includes("submit-handoff"));
    assert.strictEqual(postCalls.length, 1);
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      assert.strictEqual(domElements[id].value, valuesBefore[id], `Feld ${id} muss nach HTTP 409 erhalten bleiben`);
    });
    const state = ui.getState();
    assert.ok(state.handoffDraft, "der Entwurf muss nach einem Konflikt geöffnet bleiben");
    assert.strictEqual(state.handoffDraft.submitting, false);
    assert.ok(state.handoffDraft.error && state.handoffDraft.error.length > 0);
    assert.strictEqual(state.overview.status, "IN_EXECUTION");
    assert.strictEqual(state.overview.handoffs.length, 0, "kein Handoff darf bei HTTP 409 entstanden sein");
  });

  await check("V8.0.1-8./9. Netzwerkfehler: alle Feldwerte bleiben erhalten, der Einreichen-Knopf wird wieder nutzbar", async () => {
    forceNextFetchNetworkFailure = true;
    fetchCalls.length = 0;
    const valuesBefore = {};
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      valuesBefore[id] = domElements[id].value;
    });
    await ui.submitHandoffDraft();
    assert.strictEqual(fetchCalls.length, 1, "kein automatischer Retry, genau ein tatsächlich gesendeter Versuch");
    HANDOFF_DRAFT_FIELD_IDS.forEach((id) => {
      assert.strictEqual(domElements[id].value, valuesBefore[id], `Feld ${id} muss nach einem Netzwerkfehler erhalten bleiben`);
    });
    const state = ui.getState();
    assert.ok(state.handoffDraft, "der Entwurf muss nach einem Netzwerkfehler geöffnet bleiben");
    assert.strictEqual(state.handoffDraft.submitting, false);
    assert.ok(state.handoffDraft.error && state.handoffDraft.error.length > 0);
    assert.strictEqual(state.overview.status, "IN_EXECUTION");
  });

  await check(
    "V8.0.1-10. Auftragswechsel setzt einen offenen Handoff-Entwurf zurück, ohne dabei einen Request auszulösen",
    async () => {
      assert.ok(ui.getState().handoffDraft, "zu Beginn dieses Prüfpunkts muss der Entwurf noch geöffnet sein");
      fetchCalls.length = 0;
      await ui.selectOrder(CANONICAL_ID);
      const postCalls = fetchCalls.filter((c) => c.method === "POST");
      assert.strictEqual(postCalls.length, 0, "ein bloßer Auftragswechsel darf keinen POST auslösen");
      assert.strictEqual(ui.getState().handoffDraft, null, "der Entwurf muss beim Auftragswechsel zurückgesetzt werden");
      await ui.selectOrder(handoffOrderId);
      assert.strictEqual(ui.getState().handoffDraft, null, "auch nach der Rückkehr zum Auftrag darf kein alter Entwurf mehr offen sein");
    },
  );

  await check(
    "V8.0.1-11./12. Einreichen: genau ein POST submit-handoff mit korrektem expectedRevision, Doppelklick erzeugt genau einen POST",
    async () => {
      ui.openHandoffDraft();
      domElements["pilot-handoff-draft-risk"].value = "Kein bekanntes Risiko f\u00fcr diese Testauftrags-Rollen\u00fcbergabe.";
      const expectedRevision = ui.getState().overview.order.revision;
      fetchCalls.length = 0;
      const first = ui.submitHandoffDraft();
      assert.strictEqual(ui.getState().handoffDraft.submitting, true, "während des Einreichens muss der Zustand als 'submitting' erkennbar sein");
      assert.match(domElements["pilot-work-order-output"].innerHTML, /data-action="submit-handoff-draft" disabled/);
      const second = ui.submitHandoffDraft();
      await Promise.all([first, second]);
      const postCalls = fetchCalls.filter((c) => c.method === "POST" && c.url.includes("submit-handoff"));
      assert.strictEqual(postCalls.length, 1, "ein zweiter, gleichzeitig ausgelöster Klick darf keinen zweiten POST senden");
      assert.strictEqual(postCalls[0].body.expectedRevision, expectedRevision, "expectedRevision muss aus dem aktuellen Overview stammen");
      assert.strictEqual(postCalls[0].body.fromPilotRole, "RECHERCHE_ANALYSE");
      assert.strictEqual(postCalls[0].body.toPilotRole, "DOKUMENTATION");
    },
  );

  await check(
    "V8.0.1-13. Erfolg (PASSED): Overview wird neu geladen, PM-Filterstatus PASSED sichtbar, Abschlussknopf erst danach sichtbar, kein automatisches submit-for-review",
    () => {
      const state = ui.getState();
      assert.strictEqual(state.handoffDraft, null, "der Entwurf muss nach erfolgreichem Einreichen geschlossen sein");
      assert.strictEqual(state.overview.status, "IN_EXECUTION", "kein automatisches submitForReview/submit-for-review durch die Einreichung selbst");
      assert.strictEqual(state.overview.handoffs.length, 1, "genau eine Rollenübergabe darf entstanden sein");
      assert.strictEqual(state.overview.handoffs[0].toPilotRole, "DOKUMENTATION");
      assert.strictEqual(state.overview.handoffs[0].pmFilterStatus, "PASSED");
      const html = domElements["pilot-work-order-output"].innerHTML;
      assert.match(html, /data-action="submit-for-review"/, "erst jetzt darf der Abschlussknopf sichtbar sein");
      assert.doesNotMatch(html, /data-action="prepare-handoff-draft"/);
      const submitForReviewCalls = fetchCalls.filter((c) => c.url.includes("submit-for-review"));
      assert.strictEqual(submitForReviewCalls.length, 0, "kein automatischer POST submit-for-review durch die Rollenübergabe selbst");
    },
  );

  // -------------------------------------------------------------------
  // V8.0.1-14.: REJECTED – verständlicher Hinweis, kein Abschlussknopf,
  // kein automatischer Retry. Ein eigener, unabhängiger Testauftrag
  // vermeidet jede Rückwirkung auf den oben abgeschlossenen PASSED-Ablauf.
  // Der reale submitHandoff-Service verschiebt den Auftrag bei REJECTED
  // nach RETURNED (siehe pilot-work-order-service.js#submitHandoff) – ein
  // erneutes IN_EXECUTION mit einer bereits vorhandenen REJECTED-
  // Dokumentationsübergabe entsteht dadurch erst nach einem späteren
  // reopenFromReturned + erneuter Freigabe (Auftrag Abschnitt 13: "ältere
  // abgeschlossene Ketten können nachträglich abgeschlossen werden").
  // Genau diesen realistischen Folgezustand bildet dieser Testauftrag
  // direkt nach, ohne die gesamte Statuskette erneut durchlaufen zu
  // müssen.
  // -------------------------------------------------------------------

  await check("V8.0.1-14. REJECTED: verständlicher Hinweis, kein Abschlussknopf, kein automatischer Retry", async () => {
    idCounter += 1;
    const rejectedOrderId = `pilot-order-test-handoff-rejected-${idCounter}`;
    setRawOrder(rejectedOrderId, {
      title: "Auftrag H2: REJECTED-Testauftrag",
      status: "IN_EXECUTION",
      statusLabel: STATUS_LABELS.IN_EXECUTION,
      revision: 2,
      handoffs: [
        {
          id: `pilot-handoff-test-rejected-${idCounter}`,
          fromPilotRole: "RECHERCHE_ANALYSE",
          toPilotRole: "DOKUMENTATION",
          toPilotRoleLabel: "Dokumentations-Agent",
          shortFinding: "Testbefund.",
          resultOrRecommendation: "Testergebnis.",
          basisUsed: "Testgrundlage.",
          riskOrLimit: "Testrisiko.",
          nextStep: "Testschritt.",
          decisionNeeded: null,
          pmFilterStatus: "REJECTED",
          pmFilterReasons: ["Ergebnis passt zum Auftrag"],
          createdAt: new Date().toISOString(),
        },
      ],
      agentExecutionRuns: [],
      agentChains: [],
    });
    fetchCalls.length = 0;
    await ui.selectOrder(rejectedOrderId);
    const html = domElements["pilot-work-order-output"].innerHTML;
    assert.doesNotMatch(html, /data-action="submit-for-review"/, "bei REJECTED darf kein Abschlussknopf sichtbar sein");
    assert.match(html, /abgelehnt/, "es muss ein verständlicher Hinweis auf die Ablehnung sichtbar sein");
    assert.match(html, /Ergebnis passt zum Auftrag/, "der PM-Filter-Ablehnungsgrund muss sichtbar sein");
    assert.match(html, /data-action="prepare-handoff-draft"/, "ein neuer, bewusst ausgelöster Entwurf muss weiterhin möglich sein");
    const postCalls = fetchCalls.filter((c) => c.method === "POST");
    assert.strictEqual(postCalls.length, 0, "die reine Anzeige der Ablehnung darf keinen automatischen erneuten Versuch auslösen");
  });

  // -------------------------------------------------------------------
  // V8.7 Stufe B ("gespeicherte Entscheidungsgründe in der
  // Pilotauftrags-Detailansicht sichtbar machen"): Prüfpunkte 1–43.
  // Ausschließlich bestehende Testmuster (setRawOrder, ui.selectOrder,
  // domElements[...].innerHTML, ui.escapeHtml, ui.render()) – kein neuer
  // Request, keine neue Route, kein neuer Primär-Button.
  // -------------------------------------------------------------------

  function buildLongDecisionReasonText() {
    var prefix =
      "Ausf\u00fchrlicher Grund (Testfixtur) mit \"Anf\u00fchrungszeichen\", Klammern (wie hier) und Uml\u00e4uten \u00e4\u00f6\u00fc\u00df.\n" +
      "Zweite Zeile nach einem echten Zeilenumbruch, damit der Text insgesamt sehr lang wird und ohne K\u00fcrzung vollst\u00e4ndig sichtbar bleiben muss.\n";
    var text = prefix;
    while (text.length < 500) {
      text += "Weiterer F\u00fcllsatz zur Testl\u00e4nge. ";
    }
    return text.slice(0, 500);
  }
  const longDecisionReasonText = buildLongDecisionReasonText();
  assert.strictEqual(longDecisionReasonText.length, 500, "Testfixtur muss exakt 500 Zeichen lang sein");

  const secretActorId = "user-secret-do-not-show";

  function extractDecisionReasonCardHtml(html) {
    const start = html.indexOf('<div class="pilot-decision-reason-card">');
    if (start === -1) return "";
    const end = html.indexOf('<div class="pilot-work-order-primary-action">', start);
    return end === -1 ? html.slice(start) : html.slice(start, end);
  }

  function extractDecisionReasonHistoryHtml(html) {
    const start = html.indexOf('<div class="pilot-decision-reason-history">');
    if (start === -1) return "";
    const end = html.indexOf("<h4>Audit-Trail", start);
    return end === -1 ? html.slice(start) : html.slice(start, end);
  }

  const writeCallCountBeforeDecisionReasonTests = backend.getWriteCallCount();

  // Testauftrag A: BLOCKED mit aktuellem Block-Grund (500-Zeichen-Text mit
  // Zeilenumbruch, Umlauten, Klammern, Anführungszeichen) und zwei
  // historischen Gründen (einer davon zufällig auf derselben Revision wie
  // der aktuelle Grund selbst – siehe Stufe A: das ist exakt der Eintrag,
  // der als currentDecisionReason bestimmt wurde und deshalb NICHT
  // zusätzlich als früherer Grund erscheinen darf).
  idCounter += 1;
  const blockedWithReasonId = `pilot-order-test-decision-reason-blocked-${idCounter}`;
  setRawOrder(blockedWithReasonId, {
    title: "Auftrag mit aktuellem Block-Grund",
    status: "BLOCKED",
    statusLabel: STATUS_LABELS.BLOCKED,
    revision: 5,
    currentDecisionReason: {
      kind: "BLOCK",
      text: longDecisionReasonText,
      setAt: "2026-02-03T09:15:00.000Z",
      setByUserId: secretActorId,
      fromStatus: "IN_EXECUTION",
      toStatus: "BLOCKED",
      orderRevision: 5,
    },
    decisionReasonHistory: [
      {
        kind: "RETURN",
        text: "Fr\u00fcherer R\u00fcckgabegrund (Testfixtur, \u00e4ltere Revision).",
        setAt: "2026-01-01T08:00:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "READY_FOR_REVIEW",
        toStatus: "RETURNED",
        orderRevision: 2,
      },
      {
        kind: "BLOCK",
        text: "Fr\u00fcherer Block-Grund (Testfixtur), zwischenzeitlich entsperrt.",
        setAt: "2026-01-15T12:00:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "IN_EXECUTION",
        toStatus: "BLOCKED",
        orderRevision: 4,
      },
      {
        kind: "BLOCK",
        text: longDecisionReasonText,
        setAt: "2026-02-03T09:15:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "IN_EXECUTION",
        toStatus: "BLOCKED",
        orderRevision: 5,
      },
    ],
  });

  await check(
    "1./2./4./5./6./7./9./10./11./12./13./14./15./16./17./18./D./Position. BLOCKED mit aktuellem Block-Grund: korrekte Überschrift, vollständiger 500-Zeichen-Text mit Zeilenumbruch/Umlauten/Klammern/Anführungszeichen, keine IDs/Statuscodes/Rohwerte, Historienhinweis, Position vor der bestehenden Aktion",
    async () => {
      fetchCalls.length = 0;
      await ui.selectOrder(blockedWithReasonId);
      const html = domElements["pilot-work-order-output"].innerHTML;
      const cardHtml = extractDecisionReasonCardHtml(html);
      assert.ok(cardHtml.length > 0, "die neue Grund-Karte muss oben gerendert werden");

      // 1./18. korrekte, statusbezogene Überschrift als Klartext.
      assert.match(cardHtml, /<h4>Warum der Auftrag blockiert ist<\/h4>/);

      // 4. Zeitzeile "Gültig seit" mit dem bestehenden formatierten Datum.
      assert.match(cardHtml, /G\u00fcltig seit: 2026-02-03 09:15/);

      // 2./5./6. vollständiger 500-Zeichen-Text, keine Kürzung, kein Auslassungszeichen.
      assert.ok(cardHtml.includes(ui.escapeHtml(longDecisionReasonText)), "der vollständige, escapte Grundtext muss unverändert enthalten sein");
      assert.doesNotMatch(cardHtml, /\u2026/, "kein Auslassungszeichen wegen Kürzung");
      assert.doesNotMatch(cardHtml, /\.\.\./, "keine drei Punkte wegen Kürzung");

      // 7. Zeilenumbrüche bleiben im Text erhalten (kein <br>-Ersatz).
      assert.ok(cardHtml.includes("\n"), "ein echter Zeilenumbruch muss im Grundtext erhalten bleiben");
      assert.doesNotMatch(cardHtml, /<br\s*\/?>/i, "kein <br> als Ersatz für Zeilenumbrüche");

      // 9./10./11. Umlaute, Klammern, Anführungszeichen bleiben sichtbar erhalten.
      assert.ok(cardHtml.includes("\u00e4\u00f6\u00fc\u00df"), "Umlaute müssen erhalten bleiben");
      assert.ok(cardHtml.includes("(wie hier)"), "Klammern müssen erhalten bleiben");
      assert.ok(cardHtml.includes("&quot;Anf\u00fchrungszeichen&quot;"), "Anführungszeichen müssen als sichtbarer (escapter) Text erhalten bleiben");

      // 12. keine Revision im Grundabschnitt (gleiches Anzeigemuster wie sonst für Revision, hier bewusst NICHT vorhanden).
      assert.doesNotMatch(cardHtml, />5</, "die Auftragsrevision darf im Grundabschnitt nicht sichtbar sein");
      assert.doesNotMatch(cardHtml, /orderRevision/);

      // 13. setByUserId nicht sichtbar (weder als ID noch als Namensbehauptung).
      assert.ok(!html.includes(secretActorId), "setByUserId darf an keiner Stelle der Ausgabe sichtbar sein");
      assert.doesNotMatch(cardHtml, /setByUserId/);

      // 14./15./16. fromStatus/toStatus und Statuscodes nicht sichtbar.
      assert.doesNotMatch(cardHtml, /\bIN_EXECUTION\b/);
      assert.doesNotMatch(cardHtml, /\bBLOCKED\b/);
      assert.doesNotMatch(cardHtml, /\bRETURNED\b/);
      assert.doesNotMatch(cardHtml, /fromStatus/);
      assert.doesNotMatch(cardHtml, /toStatus/);

      // 17. keine Rohwerte BLOCK/RETURN sichtbar (nur die deutschen Klartexte).
      assert.doesNotMatch(cardHtml, /\bBLOCK\b/);
      assert.doesNotMatch(cardHtml, /\bRETURN\b/);

      // D. Hinweis auf die Historie, weil frühere Gründe existieren.
      assert.match(cardHtml, /Fr\u00fchere Gr\u00fcnde findest du unten in den Details\./);

      // Position: die Karte steht zwischen der Kettenstatuskarte und der
      // bestehenden Primäraktion (renderChainStatusCard(overview) → …
      // Grundkarte … → renderPrimaryAction(overview)).
      const cardIndex = html.indexOf('<div class="pilot-decision-reason-card">');
      const primaryActionIndex = html.indexOf('<div class="pilot-work-order-primary-action">');
      assert.ok(cardIndex >= 0 && primaryActionIndex > cardIndex, "die Grundkarte muss unmittelbar vor der bestehenden Primäraktion stehen");

      // 35./36. kein Button, kein data-action im neuen Bereich.
      assert.doesNotMatch(cardHtml, /<button/i);
      assert.doesNotMatch(cardHtml, /data-action/);

      // 37. bestehende BLOCKED-Primäraktion bleibt unverändert (unmittelbar danach).
      assert.match(html, /data-action="unblock-order">Entsperren \(zur\u00fcckgeben\)<\/button>/);

      // 41. kein Grundtext in der Risikoanzeige (renderRisks steht VOR der Grundkarte).
      const risksHtmlPortion = html.slice(0, cardIndex);
      assert.ok(!risksHtmlPortion.includes(longDecisionReasonText.slice(0, 40)), "der Grundtext darf nicht in der Risikoanzeige erscheinen");

      // 40. keine zusätzliche Route: ausschließlich der bestehende GET auf den Auftrag.
      assert.ok(fetchCalls.every((call) => call.method === "GET"), "das reine Anzeigen darf keinen Schreib-Request auslösen");
    },
  );

  await check(
    "24./25./26./27./28./29./30./32. Historie unten: nur historische Einträge (aktueller Eintrag ausgeschlossen), neueste zuerst, korrekte Überschrift/Einleitung/Eintragsköpfe, vollständiger Text",
    () => {
      const diagnosticsHtml = domElements["pilot-work-order-diagnostics-output"].innerHTML;
      const historyHtml = extractDecisionReasonHistoryHtml(diagnosticsHtml);
      assert.ok(historyHtml.length > 0, "die Historie muss im unteren Nachschaubereich stehen");

      // 28. Überschrift und Einleitung.
      assert.match(historyHtml, /<h4>Fr\u00fchere Gr\u00fcnde<\/h4>/);
      assert.match(historyHtml, /Diese Gr\u00fcnde geh\u00f6ren zu fr\u00fcheren Entscheidungen und gelten heute nicht mehr\./);

      // 24./26. genau zwei historische Einträge (der dritte, mit derselben
      // Revision wie currentDecisionReason, darf NICHT zusätzlich erscheinen).
      const blockiertAmCount = (historyHtml.match(/Blockiert am/g) || []).length;
      const zurueckgegebenAmCount = (historyHtml.match(/Zur\u00fcckgegeben am/g) || []).length;
      assert.strictEqual(blockiertAmCount, 1, "genau ein historischer Block-Eintrag darf erscheinen");
      assert.strictEqual(zurueckgegebenAmCount, 1, "genau ein historischer Rückgabe-Eintrag darf erscheinen");
      assert.ok(!historyHtml.includes(ui.escapeHtml(longDecisionReasonText)), "der aktuelle Grundtext darf nicht zusätzlich in der Historie erscheinen");

      // 25./29./30. neueste zuerst: der Block-Eintrag vom 15.01. steht vor dem Rückgabe-Eintrag vom 01.01.
      const blockiertIndex = historyHtml.indexOf("Blockiert am 2026-01-15 12:00");
      const zurueckgegebenIndex = historyHtml.indexOf("Zur\u00fcckgegeben am 2026-01-01 08:00");
      assert.ok(blockiertIndex >= 0 && zurueckgegebenIndex >= 0, "beide Eintragsköpfe müssen mit Klartext-Datum vorhanden sein");
      assert.ok(blockiertIndex < zurueckgegebenIndex, "der neuere historische Grund muss zuerst erscheinen");

      // 32. vollständiger historischer Grundtext.
      assert.match(historyHtml, /Fr\u00fcherer Block-Grund \(Testfixtur\), zwischenzeitlich entsperrt\./);
      assert.match(historyHtml, /Fr\u00fcherer R\u00fcckgabegrund \(Testfixtur, \u00e4ltere Revision\)\./);

      // 35./36. kein Button, kein data-action in der Historie.
      assert.doesNotMatch(historyHtml, /<button/i);
      assert.doesNotMatch(historyHtml, /data-action/);

      // Position: die Historie steht direkt vor dem bestehenden Audit-Trail.
      const historyIndex = diagnosticsHtml.indexOf('<div class="pilot-decision-reason-history">');
      const auditIndex = diagnosticsHtml.indexOf("<h4>Audit-Trail");
      assert.ok(historyIndex >= 0 && auditIndex > historyIndex, "die Historie muss unmittelbar vor dem bestehenden Audit-Trail stehen");
    },
  );

  await check("33./34./39. wiederholtes Rendern ist seiteneffektfrei: identischer Inhalt, keine Mutation von overview/History, writeCallCount bleibt unverändert", () => {
    const stateBefore = ui.getState();
    const outputBefore = domElements["pilot-work-order-output"].innerHTML;
    const diagnosticsBefore = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    const historySnapshotBefore = JSON.stringify(stateBefore.overview.decisionReasonHistory);
    const currentSnapshotBefore = JSON.stringify(stateBefore.overview.currentDecisionReason);

    ui.render();

    const outputAfter = domElements["pilot-work-order-output"].innerHTML;
    const diagnosticsAfter = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.strictEqual(outputAfter, outputBefore, "wiederholtes Rendern muss identischen Inhalt ergeben");
    assert.strictEqual(diagnosticsAfter, diagnosticsBefore, "wiederholtes Rendern muss identischen Inhalt ergeben (unterer Bereich)");

    assert.strictEqual(JSON.stringify(ui.getState().overview.decisionReasonHistory), historySnapshotBefore, "decisionReasonHistory darf nicht mutiert werden");
    assert.strictEqual(JSON.stringify(ui.getState().overview.currentDecisionReason), currentSnapshotBefore, "currentDecisionReason darf nicht mutiert werden");

    const rawOrder = backend.orders.get(blockedWithReasonId);
    assert.strictEqual(rawOrder.decisionReasonHistory.length, 3, "das Original-Backend-Array darf nicht verändert werden");
    assert.strictEqual(rawOrder.currentDecisionReason.setByUserId, secretActorId, "das Original-Objekt darf nicht verändert werden");

    assert.strictEqual(backend.getWriteCallCount(), writeCallCountBeforeDecisionReasonTests, "reines Anzeigen/Rendern darf niemals einen Schreib-Request auslösen");
  });

  // Testauftrag B: RETURNED mit aktuellem Rückgabe-Grund (3./18. sowie
  // erneuter Nachweis 12.–17. für den RETURN-Zweig, 38. bestehende
  // RETURNED-Primäraktion bleibt unverändert).
  idCounter += 1;
  const returnedWithReasonId = `pilot-order-test-decision-reason-returned-${idCounter}`;
  setRawOrder(returnedWithReasonId, {
    title: "Auftrag mit aktuellem R\u00fcckgabe-Grund",
    status: "RETURNED",
    statusLabel: STATUS_LABELS.RETURNED,
    revision: 3,
    currentDecisionReason: {
      kind: "RETURN",
      text: "R\u00fcckgabegrund: Ergebnis entspricht noch nicht den Qualit\u00e4tskriterien (Testfixtur).",
      setAt: "2026-03-01T14:30:00.000Z",
      setByUserId: secretActorId,
      fromStatus: "READY_FOR_REVIEW",
      toStatus: "RETURNED",
      orderRevision: 3,
    },
    decisionReasonHistory: [
      {
        kind: "RETURN",
        text: "R\u00fcckgabegrund: Ergebnis entspricht noch nicht den Qualit\u00e4tskriterien (Testfixtur).",
        setAt: "2026-03-01T14:30:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "READY_FOR_REVIEW",
        toStatus: "RETURNED",
        orderRevision: 3,
      },
    ],
  });

  await check("3./4./18./38. RETURNED mit aktuellem Rückgabe-Grund zeigt korrekte Überschrift, Zeitzeile, keinen zusätzlichen historischen Eintrag (nur der aktuelle existiert) und lässt die bestehende RETURNED-Primäraktion unverändert", async () => {
    fetchCalls.length = 0;
    await ui.selectOrder(returnedWithReasonId);
    const html = domElements["pilot-work-order-output"].innerHTML;
    const cardHtml = extractDecisionReasonCardHtml(html);
    assert.match(cardHtml, /<h4>Warum der Auftrag zur\u00fcckgegeben wurde<\/h4>/);
    assert.match(cardHtml, /G\u00fcltig seit: 2026-03-01 14:30/);
    assert.ok(cardHtml.includes(ui.escapeHtml("Ergebnis entspricht noch nicht den Qualit\u00e4tskriterien (Testfixtur).")));
    // kein Hinweis auf frühere Gründe, weil der einzige History-Eintrag dem aktuellen Grund entspricht.
    assert.doesNotMatch(cardHtml, /Fr\u00fchere Gr\u00fcnde findest du unten/);
    const diagnosticsHtml = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.doesNotMatch(diagnosticsHtml, /<div class="pilot-decision-reason-history">/, "ohne echten historischen Eintrag darf kein Historienbereich erscheinen");

    // 38. bestehende RETURNED-Primäraktion bleibt unverändert.
    assert.match(html, /data-action="reopen-from-returned">Erneut als Entwurf starten<\/button>/);
  });

  // Testauftrag C: BLOCKED ohne gespeicherten Grund (systemseitig gestoppt,
  // ältere Bestandsantwort – currentDecisionReason/decisionReasonHistory
  // bleiben bewusst undefined statt null/[]).
  idCounter += 1;
  const blockedWithoutReasonId = `pilot-order-test-decision-reason-blocked-missing-${idCounter}`;
  setRawOrder(blockedWithoutReasonId, {
    title: "\u00e4lterer systemseitig blockierter Testauftrag",
    status: "BLOCKED",
    statusLabel: STATUS_LABELS.BLOCKED,
    revision: 7,
  });

  await check("19./21./22. BLOCKED ohne Grundeintrag zeigt den verbindlichen Ersatztext, erfindet nichts, fehlende Felder (undefined) zerstören die Ansicht nicht", async () => {
    fetchCalls.length = 0;
    await ui.selectOrder(blockedWithoutReasonId);
    assert.strictEqual(ui.getState().overview.currentDecisionReason, undefined, "die Testfixtur bildet bewusst eine ältere Antwort ohne dieses Feld nach");
    assert.strictEqual(ui.getState().overview.decisionReasonHistory, undefined);
    const html = domElements["pilot-work-order-output"].innerHTML;
    const cardHtml = extractDecisionReasonCardHtml(html);
    assert.match(cardHtml, /<h4>Warum der Auftrag blockiert ist<\/h4>/);
    assert.match(cardHtml, /F\u00fcr diesen Auftrag wurde kein konkreter Grund gespeichert\./);
    assert.match(cardHtml, /Bei \u00e4lteren oder automatisch gestoppten Auftr\u00e4gen kann diese Angabe fehlen\. Es wird bewusst nichts erg\u00e4nzt oder vermutet\./);
    assert.doesNotMatch(cardHtml, /Fr\u00fchere Gr\u00fcnde findest du unten/, "ohne jede Historie darf kein Hinweis auf frühere Gründe erscheinen");
    // weiterhin die normale Kopfzeile/Fakten sichtbar – keine zerstörte Ansicht.
    assert.match(html, /Blockiert/);
  });

  // Testauftrag D: RETURNED ohne gespeicherten Grund (Spiegelfall zu C, 20.).
  idCounter += 1;
  const returnedWithoutReasonId = `pilot-order-test-decision-reason-returned-missing-${idCounter}`;
  setRawOrder(returnedWithoutReasonId, {
    title: "\u00e4lterer zur\u00fcckgegebener Testauftrag ohne Grund",
    status: "RETURNED",
    statusLabel: STATUS_LABELS.RETURNED,
    revision: 6,
  });

  await check("20. RETURNED ohne Grundeintrag zeigt den verbindlichen Ersatztext mit passender Überschrift", async () => {
    await ui.selectOrder(returnedWithoutReasonId);
    const cardHtml = extractDecisionReasonCardHtml(domElements["pilot-work-order-output"].innerHTML);
    assert.match(cardHtml, /<h4>Warum der Auftrag zur\u00fcckgegeben wurde<\/h4>/);
    assert.match(cardHtml, /F\u00fcr diesen Auftrag wurde kein konkreter Grund gespeichert\./);
  });

  await check("23. ein normaler Status ohne Grund zeigt keinen neuen Abschnitt", async () => {
    idCounter += 1;
    const normalOrderId = `pilot-order-test-decision-reason-normal-${idCounter}`;
    setRawOrder(normalOrderId, {
      title: "Normaler Testauftrag ohne Grund",
      status: "IN_EXECUTION",
      statusLabel: STATUS_LABELS.IN_EXECUTION,
      revision: 1,
      agentChains: [],
    });
    await ui.selectOrder(normalOrderId);
    const html = domElements["pilot-work-order-output"].innerHTML;
    const diagnosticsHtml = domElements["pilot-work-order-diagnostics-output"].innerHTML;
    assert.doesNotMatch(html, /pilot-decision-reason/, "ein normaler Auftrag ohne jeden Grund darf keinen neuen Abschnitt oben zeigen");
    assert.doesNotMatch(diagnosticsHtml, /pilot-decision-reason/, "ein normaler Auftrag ohne jeden Grund darf keinen neuen Abschnitt unten zeigen");
  });

  // Testauftrag E: kein aktueller Grund (currentDecisionReason === null),
  // aber zwei historische Gründe UND eine unbekannte, defensiv abgefangene
  // Grundart – Status ist bewusst COMPLETED (weder BLOCKED noch RETURNED),
  // damit die obere Karte nachweislich NICHTS zeigt, während die Historie
  // unten trotzdem vollständig erscheint (27./31.).
  idCounter += 1;
  const historyOnlyOrderId = `pilot-order-test-decision-reason-history-only-${idCounter}`;
  setRawOrder(historyOnlyOrderId, {
    title: "Abgeschlossener Auftrag mit ausschließlich historischen Gründen",
    status: "COMPLETED",
    statusLabel: STATUS_LABELS.COMPLETED,
    revision: 9,
    currentDecisionReason: null,
    decisionReasonHistory: [
      {
        kind: "RETURN",
        text: "Historischer R\u00fcckgabegrund ohne aktuelle G\u00fcltigkeit.",
        setAt: "2026-01-10T09:00:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "READY_FOR_REVIEW",
        toStatus: "RETURNED",
        orderRevision: 3,
      },
      {
        kind: "BLOCK",
        text: "Historischer Block-Grund ohne aktuelle G\u00fcltigkeit.",
        setAt: "2026-01-20T09:00:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "IN_EXECUTION",
        toStatus: "BLOCKED",
        orderRevision: 5,
      },
      {
        kind: "SOME_FUTURE_KIND",
        text: "Grundtext einer bislang unbekannten Grundart.",
        setAt: "2026-01-25T09:00:00.000Z",
        setByUserId: secretActorId,
        fromStatus: "BLOCKED",
        toStatus: "RETURNED",
        orderRevision: 6,
      },
    ],
  });

  await check(
    "27./31. ohne aktuellen Grund (null) gelten alle History-Einträge als historisch, inklusive defensiv abgefangener unbekannter Grundart ohne technischen Rohwert; die obere Karte bleibt bei einem nicht blockierten/zurückgegebenen Status leer",
    async () => {
      await ui.selectOrder(historyOnlyOrderId);
      const html = domElements["pilot-work-order-output"].innerHTML;
      assert.doesNotMatch(html, /pilot-decision-reason-card/, "ohne aktuellen Grund und ohne BLOCKED/RETURNED-Status darf oben nichts erscheinen");

      const diagnosticsHtml = domElements["pilot-work-order-diagnostics-output"].innerHTML;
      const historyHtml = extractDecisionReasonHistoryHtml(diagnosticsHtml);
      assert.ok(historyHtml.length > 0, "die Historie muss trotzdem unten erscheinen");
      assert.match(historyHtml, /Blockiert am 2026-01-20 09:00/);
      assert.match(historyHtml, /Zur\u00fcckgegeben am 2026-01-10 09:00/);
      // 31. unbekannte Grundart → defensiver Klartext, kein technischer Rohwert.
      assert.match(historyHtml, /Entscheidung am 2026-01-25 09:00/);
      assert.doesNotMatch(historyHtml, /SOME_FUTURE_KIND/);
      assert.match(historyHtml, /Grundtext einer bislang unbekannten Grundart\./);
    },
  );

  // Testauftrag F: HTML-artiger Grundtext (8.) sowie expliziter Nachweis,
  // dass openDecision unverändert bleibt und keinen Grundtext enthält (42.).
  idCounter += 1;
  const htmlLikeReasonOrderId = `pilot-order-test-decision-reason-html-like-${idCounter}`;
  const htmlLikeReasonText = 'Auftrag <b>wichtig</b> pr\u00fcfen & "sofort" (Test) <script>alert(1)</script> <img src=x onerror=alert(1)>';
  setRawOrder(htmlLikeReasonOrderId, {
    title: "Auftrag mit HTML-artigem Grundtext",
    status: "BLOCKED",
    statusLabel: STATUS_LABELS.BLOCKED,
    revision: 2,
    currentDecisionReason: {
      kind: "BLOCK",
      text: htmlLikeReasonText,
      setAt: "2026-04-01T10:00:00.000Z",
      setByUserId: secretActorId,
      fromStatus: "IN_EXECUTION",
      toStatus: "BLOCKED",
      orderRevision: 2,
    },
    decisionReasonHistory: [],
  });

  await check("8./42. HTML-artiger Grundtext wird maskiert und nicht als Element gerendert; openDecision bleibt unverändert und enthält keinen Grundtext", async () => {
    await ui.selectOrder(htmlLikeReasonOrderId);
    const html = domElements["pilot-work-order-output"].innerHTML;
    const cardHtml = extractDecisionReasonCardHtml(html);

    // 8. keine echten HTML-Elemente aus dem Grundtext, ausschließlich maskierter Text.
    assert.ok(cardHtml.includes(ui.escapeHtml(htmlLikeReasonText)), "der Grundtext muss vollständig, aber ausschließlich escaped enthalten sein");
    assert.doesNotMatch(cardHtml, /<script>/i);
    assert.doesNotMatch(cardHtml, /<b>wichtig<\/b>/i);
    assert.doesNotMatch(cardHtml, /<img\s/i);
    assert.match(cardHtml, /&lt;script&gt;/);
    assert.match(cardHtml, /&lt;b&gt;wichtig&lt;\/b&gt;/);

    // 42. openDecision bleibt unverändert (dieses Fake-Backend liefert stets null) und enthält keinen Grundtext.
    assert.strictEqual(ui.getState().overview.openDecision, null);
    assert.doesNotMatch(html, /Offene Entscheidung<\/dt><dd>[^<]*wichtig/, "der Grundtext darf nicht in die Anzeige der offenen Entscheidung gelangen");
  });

  assert.strictEqual(backend.getWriteCallCount(), writeCallCountBeforeDecisionReasonTests, "V8.7 Stufe B darf über die gesamte Testreihe hinweg keinen einzigen Schreib-Request auslösen");

  console.log(`pilot-work-order-command-center-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-command-center-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
