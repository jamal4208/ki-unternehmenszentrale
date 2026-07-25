"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const toolRegistry = require("./tool-registry");
const agentRegistry = require("./agent-registry");
const projectRegistry = require("./project-registry");
const localDataBackup = require("./local-data-backup");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

// 16. Lizenz ohne Verbindung
check("Lizenz ohne Verbindung möglich (licenseStatus unabhängig von connectionStatus)", () => {
  const canva = toolRegistry.getToolById("canva");
  assert.ok(canva);
  assert.notStrictEqual(canva.connectionStatus, "CONNECTED");
});

// 17. Verbindung ohne Schreibrecht
check("Verbindung ohne Schreibrecht möglich (Airtable read-only)", () => {
  const airtable = toolRegistry.getToolById("airtable");
  assert.strictEqual(airtable.readCapability, true);
  assert.strictEqual(airtable.writeCapability, false);
});

// 18. DIRECT
check("mindestens ein DIRECT-Werkzeug vorhanden (Codex)", () => {
  const codex = toolRegistry.getToolById("codex");
  assert.strictEqual(codex.executionMode, "DIRECT");
});

// 19. CONTROLLED_HANDOFF
check("mindestens ein CONTROLLED_HANDOFF-Werkzeug vorhanden", () => {
  const github = toolRegistry.getToolById("github");
  assert.strictEqual(github.executionMode, "CONTROLLED_HANDOFF");
});

// 20. RECOMMENDATION_ONLY
check("mindestens ein RECOMMENDATION_ONLY-Werkzeug vorhanden", () => {
  const chatgpt = toolRegistry.getToolById("chatgpt");
  assert.strictEqual(chatgpt.executionMode, "RECOMMENDATION_ONLY");
});

// 21. Datenklassifizierung blockiert Tool
check("Datenklassifizierung blockiert Tool (SECRET nirgends erlaubt)", () => {
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    assert.strictEqual(tool.allowedDataClassifications.includes("SECRET"), false);
  });
  assert.strictEqual(toolRegistry.isDataClassificationAllowedForTool("canva", "SECRET"), false);
});

// 22. Budget unbekannt
check("Budget standardmäßig unbekannt/nicht gesetzt", () => {
  const heygen = toolRegistry.getToolById("heygen");
  assert.strictEqual(heygen.monthlyBudget, null);
  assert.strictEqual(heygen.usageSource, "UNKNOWN");
});

// 23. Budgetgrenze
check("Budgetgrenze kann gesetzt werden, ohne automatische Nachladung zu implizieren", () => {
  const withBudget = { ...toolRegistry.getToolById("chatgpt"), monthlyBudget: 20 };
  assert.strictEqual(withBudget.monthlyBudget, 20);
  assert.ok(!Object.prototype.hasOwnProperty.call(toolRegistry, "autoRecharge"));
});

// 24. keine Credential-Werte
check("keine Credential-Werte im Register (keine api key/token/secret Felder oder Werte)", () => {
  const source = fs.readFileSync(path.join(__dirname, "tool-registry.js"), "utf8");
  assert.ok(!/apiKey\s*:/i.test(source));
  assert.ok(!/token\s*:\s*["']/i.test(source));
  const serialized = JSON.stringify(toolRegistry.TOOL_REGISTRY);
  assert.ok(!/sk-[a-zA-Z0-9]/.test(serialized));
});

// 25. Fallback
check("Fallback-Werkzeuge referenzieren existierende Tool-IDs", () => {
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    tool.fallbackToolIds.forEach((fallbackId) => {
      assert.ok(toolRegistry.getToolById(fallbackId), `Fallback ${fallbackId} von ${tool.toolId} muss existieren`);
    });
  });
});

// 26. Agentenzuordnung
check("Agentenzuordnung referenziert existierende Agenten-IDs", () => {
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    tool.allowedAgents.forEach((agentId) => {
      assert.ok(agentRegistry.hasAgentId(agentId), `Agent ${agentId} von ${tool.toolId} muss existieren`);
    });
  });
});

// 27. Projektfreigabe
check("Projektfreigabe ist 'ALL' oder eine Liste bekannter Projekt-IDs", () => {
  const knownProjectIds = new Set(projectRegistry.listProjects().map((p) => p.id));
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    if (tool.allowedProjects === "ALL") return;
    assert.ok(Array.isArray(tool.allowedProjects));
    tool.allowedProjects.forEach((projectId) => assert.ok(knownProjectIds.has(projectId)));
  });
});

// 28. letzte Verifikation
check("jedes Werkzeug trägt lastVerifiedAt und verificationSource", () => {
  toolRegistry.TOOL_REGISTRY.forEach((tool) => {
    assert.ok(tool.lastVerifiedAt);
    assert.ok(tool.verificationSource);
  });
});

// 29. unbekanntes Werkzeug sicher behandelt
check("unbekanntes Werkzeug liefert null statt Fehler oder Fake-Daten", () => {
  const result = toolRegistry.getToolById("nicht-vorhandenes-werkzeug");
  assert.strictEqual(result, null);
});

// Zusätzliche strukturelle Prüfungen
check("alle Pflichtkategorien sind abgedeckt", () => {
  const usedCategories = new Set(toolRegistry.TOOL_REGISTRY.map((t) => t.category));
  toolRegistry.TOOL_CATEGORIES.forEach((category) => assert.ok(usedCategories.has(category), `Kategorie ${category} unbenutzt`));
});

check("alle geforderten Werkzeuge sind vorgemerkt", () => {
  const required = [
    "chatgpt",
    "chatgpt-work",
    "codex",
    "cursor",
    "github",
    "airtable",
    "vercel",
    "canva",
    "heygen",
    "shopify",
    "figma",
    "webflow",
    "google-workspace",
    "slack",
    "notion",
    "n8n",
    "make",
    "hubspot",
    "lexoffice",
  ];
  required.forEach((id) => assert.ok(toolRegistry.getToolById(id), `${id} fehlt im Register`));
});

check("Canva/HeyGen/Shopify sind nicht als CONNECTED markiert", () => {
  ["canva", "heygen", "shopify"].forEach((id) => {
    const tool = toolRegistry.getToolById(id);
    assert.notStrictEqual(tool.connectionStatus, "CONNECTED");
    assert.notStrictEqual(tool.executionMode, "DIRECT");
  });
});

check("keine Originaldateien/Register-Duplikate im Backup-Schlüsselraum", () => {
  assert.ok(!localDataBackup.ALLOWED_STORAGE_KEYS.some((key) => key.toLowerCase().includes("tool")));
});

check("buildToolsResponse liefert konsistente Metadaten ohne externen Aufruf", () => {
  const response = toolRegistry.buildToolsResponse();
  assert.strictEqual(response.toolCount, toolRegistry.TOOL_REGISTRY.length);
  assert.strictEqual(response.madeExternalRequest, false);
  assert.strictEqual(response.writeOperationsBlocked, true);
});

console.log(`tool-registry.test.js: ${passed} Prüfpunkte erfolgreich`);
