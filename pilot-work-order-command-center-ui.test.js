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
function makeFakeBackend() {
  const orders = new Map();
  let networkCallCount = 0;
  let writeCallCount = 0;

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
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      overrides,
    );
  }

  orders.set(CANONICAL_ID, baseOrder(CANONICAL_ID, { title: "Kanonischer Pilotauftrag" }));

  function overviewFor(order) {
    return {
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
  };
}

const backend = makeFakeBackend();
const fetchCalls = [];
global.fetch = (url, opts) => {
  fetchCalls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : undefined });
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

  await check("8./10./11. ein neuer Pilotauftrag kann angelegt werden, wird danach ausgewählt, ohne automatische Ausführung/Freigabe", async () => {
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
    const state = ui.getState();
    orderAId = state.overview.order.id;
    assert.notStrictEqual(orderAId, ui.CANONICAL_PILOT_ORDER_ID);
    assert.strictEqual(state.selectedPilotOrderId, orderAId);
    assert.strictEqual(state.overview.status, "DRAFT", "keine automatische Ausführung/Freigabe nach Anlage");
    assert.ok(state.orders.some((order) => order.id === orderAId), "Liste wird nach Anlage aktualisiert");
    const executeCalls = fetchCalls.filter((call) => /start-execution|approve-for-execution/.test(call.url));
    assert.strictEqual(executeCalls.length, 0);
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

  console.log(`pilot-work-order-command-center-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
}

run().catch((error) => {
  console.error("pilot-work-order-command-center-ui.test.js FEHLGESCHLAGEN:", error);
  process.exitCode = 1;
});
