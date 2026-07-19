"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  PORTFOLIO_MODES,
  PROJECT_REGISTRY,
  REQUIRED_PROJECT_FIELDS,
  buildProjectResponse,
  buildProjectsResponse,
  getProjectById,
  linkManualManagementData,
} = require("./project-registry");
const { requestHandler } = require("./server");

function invoke(method, url) {
  let statusCode = null;
  let headers = null;
  let rawBody = "";
  requestHandler(
    { method, url, headers: { host: "127.0.0.1" } },
    {
      writeHead(code, responseHeaders) {
        statusCode = code;
        headers = responseHeaders;
      },
      end(body = "") {
        rawBody += body;
      },
    },
  );
  return {
    statusCode,
    headers,
    body: rawBody ? JSON.parse(rawBody) : null,
  };
}

function run() {
  // 1–5: Umfang, stabile IDs, Modi und Pflichtfelder.
  assert.strictEqual(PROJECT_REGISTRY.length, 17, "Das Register muss exakt 17 Projekte enthalten.");
  const ids = PROJECT_REGISTRY.map((project) => project.id);
  assert.strictEqual(new Set(ids).size, 17, "Projekt-IDs müssen eindeutig sein.");
  assert.ok(ids.every((id) => typeof id === "string" && id.trim()), "Keine Projekt-ID darf fehlen.");
  assert.ok(
    PROJECT_REGISTRY.every((project) => PORTFOLIO_MODES.includes(project.portfolioMode)),
    "Alle portfolioMode-Werte müssen zulässig sein.",
  );
  PROJECT_REGISTRY.forEach((project) => {
    REQUIRED_PROJECT_FIELDS.forEach((field) => {
      assert.ok(Object.prototype.hasOwnProperty.call(project, field), `${project.id}: Pflichtfeld ${field} fehlt.`);
    });
  });

  const health = getProjectById("health-upgrade-kompass");
  const expansion = getProjectById("expansion-app");
  const central = getProjectById("ki-unternehmenszentrale");

  // 6–11: Health-Pilot und zentraler Git-Snapshot.
  assert.strictEqual(health.portfolioMode, "REAL_VERIFIZIERT");
  assert.strictEqual(health.localBranch, "main");
  assert.strictEqual(health.localHead, "28cdcf7");
  assert.strictEqual(health.remoteRefs["origin/main"], "1f4f96d");
  assert.strictEqual(
    health.remoteRefs["baseline/private-health-expansion-2026-07-11"],
    "28cdcf7",
  );
  assert.strictEqual(health.lastVerifiedAt, "2026-07-19");
  assert.match(health.testStatus, /Preview-Demodaten und Check-Datum OK/);
  assert.match(health.testStatus, /Static build erfolgreich/);
  assert.ok(
    health.notes.some((note) => /PR #1/i.test(note)),
    "PR #1 beziehungsweise Preview-Fix muss dokumentiert sein.",
  );
  assert.strictEqual(central.localHead, "a5367f1");

  // Expansion: gemeinsame technische Referenzen, aber PLANUNG ohne Freigabe.
  assert.strictEqual(expansion.portfolioMode, "PLANUNG");
  assert.strictEqual(expansion.localHead, "28cdcf7");
  assert.strictEqual(expansion.remoteRefs["origin/main"], "1f4f96d");
  assert.strictEqual(
    expansion.remoteRefs["baseline/private-health-expansion-2026-07-11"],
    "28cdcf7",
  );
  assert.strictEqual(expansion.lastVerifiedAt, "2026-07-19");
  assert.ok(
    expansion.notes.some((note) => /Health-PR #1/i.test(note)),
    "Expansion muss die gemeinsame technische Basisaktualisierung dokumentieren.",
  );
  assert.doesNotMatch(expansion.portfolioMode, /REAL_VERIFIZIERT/);
  assert.doesNotMatch(JSON.stringify(expansion.safetyProfile), /Länderfreigabe erteilt|regulatorisch freigegeben/i);

  // 12–14: Ungeklärte Angaben, Trennung und gemeinsame technische Basis.
  PROJECT_REGISTRY.filter((project) =>
    project.verificationStatus === "UNGEKLÄRT" || project.localHead === null,
  ).forEach((project) => {
    assert.notStrictEqual(
      project.portfolioMode,
      "REAL_VERIFIZIERT",
      `${project.id}: ungeklärte Angaben dürfen nicht REAL_VERIFIZIERT sein.`,
    );
  });
  assert.notStrictEqual(health.id, expansion.id);
  assert.ok(health.relatedProjectIds.includes(expansion.id));
  assert.ok(expansion.relatedProjectIds.includes(health.id));
  assert.strictEqual(health.localPath, expansion.localPath, "Die gemeinsame technische Basis muss sichtbar sein.");
  assert.ok(
    expansion.notes.some((note) => /keine fachliche Zusammenführung/i.test(note)),
    "Die fachliche Trennung muss dokumentiert sein.",
  );

  // 15: Keine echten Kunden-, Gesundheits- oder Kontaktdaten.
  const serializedRegistry = JSON.stringify(PROJECT_REGISTRY);
  assert.doesNotMatch(serializedRegistry, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(serializedRegistry, /\b(?:\+?\d[\s().-]*){10,}\b/);
  const forbiddenDataKeys = new Set([
    "customerData",
    "healthData",
    "contactData",
    "email",
    "phone",
    "postalAddress",
  ]);
  PROJECT_REGISTRY.forEach((project) => {
    Object.keys(project).forEach((key) => {
      assert.ok(!forbiddenDataKeys.has(key), `${project.id}: sensibles Datenfeld ${key} ist nicht erlaubt.`);
    });
  });

  // 16–18: API-Flags, 404 und blockierte Methoden ohne gestarteten Server.
  const listResponse = buildProjectsResponse();
  const healthResponse = buildProjectResponse("health-upgrade-kompass");
  assert.strictEqual(listResponse.writeOperationsBlocked, true);
  assert.strictEqual(listResponse.madeExternalRequest, false);
  assert.strictEqual(healthResponse.writeOperationsBlocked, true);
  assert.strictEqual(healthResponse.madeExternalRequest, false);

  const listApi = invoke("GET", "/api/projects");
  assert.strictEqual(listApi.statusCode, 200);
  assert.strictEqual(listApi.body.projectCount, 17);
  assert.strictEqual(listApi.body.writeOperationsBlocked, true);
  assert.strictEqual(listApi.body.madeExternalRequest, false);

  const healthApi = invoke("GET", "/api/projects/health-upgrade-kompass");
  assert.strictEqual(healthApi.statusCode, 200);
  assert.strictEqual(healthApi.body.project.id, "health-upgrade-kompass");
  assert.strictEqual(healthApi.body.writeOperationsBlocked, true);
  assert.strictEqual(healthApi.body.madeExternalRequest, false);

  const missingApi = invoke("GET", "/api/projects/unbekannt");
  assert.strictEqual(missingApi.statusCode, 404);
  assert.strictEqual(missingApi.body.error, "PROJECT_NOT_FOUND");
  assert.strictEqual(missingApi.body.writeOperationsBlocked, true);
  assert.strictEqual(missingApi.body.madeExternalRequest, false);

  const blockedMethod = invoke("POST", "/api/projects");
  assert.strictEqual(blockedMethod.statusCode, 405);
  assert.strictEqual(blockedMethod.body.writeOperationsBlocked, true);
  assert.strictEqual(blockedMethod.body.madeExternalRequest, false);

  // 19–20: Manuelle Daten bleiben erhalten und können Kanondaten nicht überschreiben.
  const manualProjects = [
    {
      id: "proj-health",
      title: "Alte Health-Karte",
      localHead: "falscher-lokaler-wert",
      history: [{ id: "hist-1", description: "Bestehender Verlauf" }],
      decisionNote: { decision: "Bestehende Entscheidung" },
      notes: ["Bestehende lokale Notiz"],
    },
    {
      id: "manual-project-1",
      title: "Manuelles Projekt",
      history: [{ id: "hist-2", description: "Manueller Verlauf" }],
    },
  ];
  const manualBefore = JSON.parse(JSON.stringify(manualProjects));
  const linked = linkManualManagementData(manualProjects);
  assert.deepStrictEqual(manualProjects, manualBefore, "Manuelle Projekt- und Verlaufseinträge dürfen nicht verändert werden.");
  assert.strictEqual(linked.unmatchedManualProjects.length, 1, "Manuelle Projekte müssen erhalten bleiben.");
  assert.strictEqual(linked.unmatchedManualProjects[0].id, "manual-project-1");
  const linkedHealth = linked.projects.find((entry) => entry.canonical.id === "health-upgrade-kompass");
  assert.strictEqual(linkedHealth.canonical.localHead, "28cdcf7");
  assert.strictEqual(linkedHealth.localManagement.localHead, "falscher-lokaler-wert");
  assert.strictEqual(linkedHealth.localManagement.history.length, 1);

  const healthApiBody = healthApi.body.project;
  assert.strictEqual(healthApiBody.localHead, "28cdcf7");
  assert.strictEqual(healthApiBody.remoteRefs["origin/main"], "1f4f96d");
  assert.strictEqual(
    healthApiBody.remoteRefs["baseline/private-health-expansion-2026-07-11"],
    "28cdcf7",
  );
  assert.strictEqual(healthApiBody.lastVerifiedAt, "2026-07-19");

  const listedExpansion = listApi.body.projects.find((project) => project.id === "expansion-app");
  assert.ok(listedExpansion, "Expansion muss in GET /api/projects enthalten sein.");
  assert.strictEqual(listedExpansion.portfolioMode, "PLANUNG");
  assert.strictEqual(listedExpansion.localHead, "28cdcf7");
  assert.strictEqual(listedExpansion.lastVerifiedAt, "2026-07-19");
  assert.strictEqual(listApi.body.writeOperationsBlocked, true);
  assert.strictEqual(listApi.body.madeExternalRequest, false);

  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(appSource, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(appSource, /localStorage\.(?:removeItem|clear)\s*\(/);
  assert.match(appSource, /canonicalProjectRegistryState/);
  assert.match(appSource, /überschreibt keine kanonischen Git-, Test- oder Sicherheitswerte/);

  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const projectHandlerSource = serverSource.slice(
    serverSource.indexOf("function handleProjects"),
    serverSource.indexOf("const qualitySprintStandard"),
  );
  assert.doesNotMatch(projectHandlerSource, /\b(?:fs|https|exec|spawn)\s*\./);

  console.log("project-registry.test.js: 20 Prüfpunkte erfolgreich");
  console.log("17 Projekte · Health REAL_VERIFIZIERT · API read-only · localStorage getrennt");
}

run();
