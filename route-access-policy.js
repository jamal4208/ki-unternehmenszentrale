"use strict";

// V7.2 Phase A Schritt 2 – zentrale, kanonische Zugriffspolitik (Auftrag
// Abschnitt D/E). Dieses Modul ist die EINZIGE Wahrheitsquelle dafür, welche
// Zugriffsklasse zu welcher Route oder welchem statischen Asset gehört. Es
// enthält KEINE HTTP-Logik, KEINE Session-/Cookie-Logik und KEINE
// Entscheidung darüber, ob ein konkreter Request erlaubt ist (das übernimmt
// auth-route-guard.js) – ausschließlich die Zuordnung Route → Policy sowie
// die strukturelle Konsistenzprüfung der Tabelle selbst.
//
// "Kein Browserparameter beeinflusst die Policy" (Auftrag Regel 10): die
// Policy-Auflösung verwendet ausschließlich Methode und Pfad, niemals Query,
// Body oder Header.

// ---------------------------------------------------------------------------
// Zugriffsklassen (Auftrag Abschnitt D).
// ---------------------------------------------------------------------------

const ACCESS_CLASSES = Object.freeze({
  PUBLIC_AUTH: "PUBLIC_AUTH",
  AUTHENTICATED_ANY: "AUTHENTICATED_ANY",
  CUSTOMER_TENANT: "CUSTOMER_TENANT",
  CUSTOMER_ADMIN_TENANT: "CUSTOMER_ADMIN_TENANT",
  OWNER_ONLY: "OWNER_ONLY",
  SUPPORT_GRANT_ONLY: "SUPPORT_GRANT_ONLY",
  DISABLED_IN_PROD: "DISABLED_IN_PROD",
  STATIC_PUBLIC: "STATIC_PUBLIC",
  STATIC_OWNER_ONLY: "STATIC_OWNER_ONLY",
});

// Sichere Fehlerstrategie je Klasse (Auftrag Abschnitt K/L):
// - HIDDEN_404: jede Verweigerung (fehlende Session, falsche Rolle, falscher
//   Mandant, Prod-Deaktivierung) liefert eine generische Nicht-gefunden-
//   Antwort. Verhindert, dass die Existenz von Chef-/Support-/deaktivierten
//   Routen gegenüber Unbefugten bestätigt wird.
// - AUTH_401: fehlende/ungültige Session liefert 401 ("Bitte neu
//   anmelden."); eine falsche Rolle oder ein Mandantenkonflikt liefert
//   dennoch 404 (siehe auth-route-guard.js), damit fremde Datensätze nicht
//   bestätigt werden.
// - PUBLIC: keine Auth-Verweigerung möglich; die Route/das Asset entscheidet
//   selbst über ihren Inhalt (z. B. GET /api/auth/session).
const ERROR_STRATEGIES = Object.freeze({
  HIDDEN_404: "HIDDEN_404",
  AUTH_401: "AUTH_401",
  PUBLIC: "PUBLIC",
});

const ALL_ROLES = Object.freeze(["OWNER", "CUSTOMER_ADMIN", "CUSTOMER_USER", "SUPPORT"]);

const CLASS_DEFAULTS = Object.freeze({
  [ACCESS_CLASSES.PUBLIC_AUTH]: {
    allowedRoles: [],
    authRequired: false,
    tenantRequired: false,
    enabledInProd: true,
    auditOnDeny: false,
    errorStrategy: ERROR_STRATEGIES.PUBLIC,
  },
  [ACCESS_CLASSES.AUTHENTICATED_ANY]: {
    allowedRoles: ALL_ROLES,
    authRequired: true,
    tenantRequired: false,
    enabledInProd: true,
    auditOnDeny: true,
    errorStrategy: ERROR_STRATEGIES.AUTH_401,
  },
  [ACCESS_CLASSES.CUSTOMER_TENANT]: {
    allowedRoles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"],
    authRequired: true,
    tenantRequired: true,
    enabledInProd: true,
    auditOnDeny: true,
    errorStrategy: ERROR_STRATEGIES.AUTH_401,
  },
  [ACCESS_CLASSES.CUSTOMER_ADMIN_TENANT]: {
    allowedRoles: ["CUSTOMER_ADMIN"],
    authRequired: true,
    tenantRequired: true,
    enabledInProd: true,
    auditOnDeny: true,
    errorStrategy: ERROR_STRATEGIES.AUTH_401,
  },
  [ACCESS_CLASSES.OWNER_ONLY]: {
    allowedRoles: ["OWNER"],
    authRequired: true,
    tenantRequired: false,
    enabledInProd: true,
    auditOnDeny: false,
    errorStrategy: ERROR_STRATEGIES.HIDDEN_404,
  },
  [ACCESS_CLASSES.SUPPORT_GRANT_ONLY]: {
    allowedRoles: ["SUPPORT"],
    authRequired: true,
    tenantRequired: true,
    enabledInProd: true,
    auditOnDeny: true,
    errorStrategy: ERROR_STRATEGIES.HIDDEN_404,
  },
  [ACCESS_CLASSES.DISABLED_IN_PROD]: {
    allowedRoles: ["OWNER"],
    authRequired: true,
    tenantRequired: false,
    enabledInProd: false,
    auditOnDeny: false,
    errorStrategy: ERROR_STRATEGIES.HIDDEN_404,
  },
  [ACCESS_CLASSES.STATIC_PUBLIC]: {
    allowedRoles: [],
    authRequired: false,
    tenantRequired: false,
    enabledInProd: true,
    auditOnDeny: false,
    errorStrategy: ERROR_STRATEGIES.PUBLIC,
  },
  [ACCESS_CLASSES.STATIC_OWNER_ONLY]: {
    allowedRoles: ["OWNER"],
    authRequired: true,
    tenantRequired: false,
    enabledInProd: true,
    auditOnDeny: false,
    errorStrategy: ERROR_STRATEGIES.HIDDEN_404,
  },
});

function buildEntry(method, matcher, accessClass, overrides = {}) {
  const defaults = CLASS_DEFAULTS[accessClass];
  if (!defaults) {
    throw new Error(`route-access-policy: unbekannte Zugriffsklasse "${accessClass}".`);
  }
  const entry = {
    method,
    accessClass,
    allowedRoles: overrides.allowedRoles || defaults.allowedRoles,
    authRequired: overrides.authRequired !== undefined ? overrides.authRequired : defaults.authRequired,
    tenantRequired: overrides.tenantRequired !== undefined ? overrides.tenantRequired : defaults.tenantRequired,
    enabledInProd: overrides.enabledInProd !== undefined ? overrides.enabledInProd : defaults.enabledInProd,
    auditOnDeny: overrides.auditOnDeny !== undefined ? overrides.auditOnDeny : defaults.auditOnDeny,
    errorStrategy: overrides.errorStrategy || defaults.errorStrategy,
    isPrefix: Boolean(matcher.isPrefix),
    isStaticAsset: Boolean(matcher.isStaticAsset),
    path: matcher.path,
    description: overrides.description || "",
  };
  return Object.freeze(entry);
}

function exact(path) {
  return { path, isPrefix: false, isStaticAsset: false };
}
function prefix(path) {
  return { path, isPrefix: true, isStaticAsset: false };
}
function staticAsset(path) {
  return { path, isPrefix: false, isStaticAsset: true };
}

function ownerGet(path, description) {
  return buildEntry("GET", exact(path), ACCESS_CLASSES.OWNER_ONLY, { description });
}
function ownerPost(path, description) {
  return buildEntry("POST", exact(path), ACCESS_CLASSES.OWNER_ONLY, { description });
}
function ownerPrefix(path, description) {
  return buildEntry("GET", prefix(path), ACCESS_CLASSES.OWNER_ONLY, { description });
}
function disabledInProdGet(path, description) {
  return buildEntry("GET", exact(path), ACCESS_CLASSES.DISABLED_IN_PROD, { description });
}
function disabledInProdPost(path, description) {
  return buildEntry("POST", exact(path), ACCESS_CLASSES.DISABLED_IN_PROD, { description });
}
function staticOwnerOnly(path, description) {
  return buildEntry("GET", staticAsset(path), ACCESS_CLASSES.STATIC_OWNER_ONLY, { description });
}

// ---------------------------------------------------------------------------
// Kanonische Policy-Tabelle. Jede hier gelistete Route MUSS in server.js
// registriert sein (siehe route-access-policy.test.js: keine verwaiste
// Policy) UND jede in server.js registrierte Route MUSS hier klassifiziert
// sein (keine unklassifizierte Route).
//
// Abschnitt E: alle bestehenden Chef-/Fach-Routen bleiben in Schritt 2
// OWNER_ONLY (keine Kundenfachroute wird geöffnet – Kundenportal folgt erst
// in Schritt 3). /api/execution/* ist zusätzlich DISABLED_IN_PROD.
// ---------------------------------------------------------------------------

const GET_POLICIES = [
  ownerGet("/api/projects", "Projektübersicht (Chef-Cockpit)"),
  ownerGet("/api/projects/health-upgrade-kompass", "Health-Projektdetail"),
  ownerGet("/api/projects/health-upgrade-kompass/live-status", "Health-Live-Status"),
  ownerGet("/api/airtable/pilot-status", "Airtable-Pilotstatus"),
  ownerGet("/api/cockpit/todays-one-decision", "Cockpit Tagesentscheidung"),
  ownerGet("/api/cockpit/todays-three-things", "Cockpit Tagesfokus"),
  ownerGet("/api/airtable/test-connection", "Airtable-Verbindungstest"),
  ownerGet("/api/airtable/first-readonly-preview", "Airtable-Vorschau"),
  ownerGet("/api/agents/plugin-work-capability", "Agenten-Plugin-Fähigkeiten"),
  ownerGet("/api/agents/projectmanager-plugin-task", "PM-Plugin-Aufgabe"),
  ownerGet("/api/agents/projectmanager-plugin-task/chef-approval-preview", "PM Chef-Freigabevorschau"),
  ownerGet("/api/agents/projectmanager-plugin-task/chef-output", "PM Chef-Ausgabe"),
  ownerGet("/api/agents/projectmanager-plugin-task/daily-focus", "PM Tagesfokus"),
  ownerGet("/api/agents/projectmanager-plugin-task/start-action", "PM Startaktion"),
  ownerGet("/api/agents/projectmanager-plugin-task/workflow", "PM Workflow"),
  ownerGet("/api/agents/projectmanager-plugin-task/workflow-result", "PM Workflow-Ergebnis"),
  ownerGet("/api/agents/hr-daily-training", "HR Tagestraining"),
  ownerGet("/api/agents/hr-daily-training-suggestion", "HR Trainingsvorschlag"),
  ownerGet("/api/agents/plugin-readiness", "Plugin-Bereitschaft"),
  ownerGet("/api/agents/hr-autonomy-approval", "HR Autonomiefreigabe"),
  ownerGet("/api/agents/hr-all-agents-development", "HR Agentenentwicklung"),
  ownerGet("/api/agents/knowledge-archive-plugin-task", "Wissen/Archiv-Plugin-Aufgabe"),
  ownerGet("/api/agents/knowledge-archive-plugin-task/knowledge-summary", "Wissenszusammenfassung"),
  ownerGet("/api/agents/knowledge-archive-plugin-task/workflow", "Wissen/Archiv Workflow"),
  ownerGet("/api/agents/knowledge-archive-plugin-task/workflow-result", "Wissen/Archiv Workflow-Ergebnis"),
  ownerGet("/api/agents/knowledge-archive-plugin-task/projectmanager-start-action", "Wissen/Archiv PM-Startaktion"),
  ownerGet("/api/agents/system-flow/daily-decision", "Systemfluss Tagesentscheidung"),
  ownerGet("/api/agents/system-flow/today-direction", "Systemfluss Tagesrichtung"),
  ownerGet("/api/agents/system-flow/next-agent-workflow", "Systemfluss nächster Agentenworkflow"),
  ownerGet("/api/agents/content-design-plugin-task", "Content/Design-Plugin-Aufgabe"),
  ownerGet("/api/agents/content-design-plugin-task/canva-brief", "Content/Design Canva-Briefing"),
  ownerGet("/api/agents/content-design-plugin-task/workflow", "Content/Design Workflow"),
  ownerGet("/api/agents/content-design-plugin-task/review-team", "Content/Design Review-Team"),
  ownerGet("/api/agents/content-design-plugin-task/chef-decision", "Content/Design Chef-Entscheidung"),
  ownerGet("/api/agents/content-design-plugin-task/follow-up-task", "Content/Design Folgeaufgabe"),
  ownerGet("/api/agents/content-design-plugin-task/follow-up-readiness", "Content/Design Folgebereitschaft"),
  ownerGet("/api/agents/content-design-plugin-task/refined-follow-up-task", "Content/Design verfeinerte Folgeaufgabe"),
  ownerGet("/api/agents/content-design-plugin-task/manual-team-review-prep", "Content/Design manuelle Review-Vorbereitung"),
  ownerGet(
    "/api/agents/content-design-plugin-task/manual-team-review-evaluation",
    "Content/Design manuelle Review-Auswertung",
  ),
  ownerGet("/api/agents/content-design-plugin-task/improvement-task", "Content/Design Verbesserungsaufgabe"),
  ownerGet("/api/agents/content-design-plugin-task/usable-canva-task", "Content/Design nutzbare Canva-Aufgabe"),
  ownerGet("/api/agents/projectmanager-plugin-task/autonomy-applied", "PM Autonomie angewendet"),
  ownerGet("/api/server-status", "Serverstatus"),
  ownerGet("/api/v7-freeze-status", "V7-Freeze-Status"),
  disabledInProdGet("/api/execution/attempts/status", "Execution Attempt-Status"),
  disabledInProdGet("/api/execution/attempts/result", "Execution Attempt-Ergebnis"),
  disabledInProdGet("/api/execution/executors", "Execution Executor-Registry"),
  ownerGet("/api/v71/documents", "Dokumentenregister-Liste"),
  ownerGet("/api/v71/tools", "Werkzeug-/Lizenzregister"),
  ownerGet("/api/v71/plugin-gateway", "Plugin-Gateway"),
  ownerGet("/api/v71/tool-routing", "Tool-Routing"),
  ownerGet("/api/v71/backup/export", "V7.1-Backup-Export"),
  ownerGet("/api/v71/heygen/status", "HeyGen-Connectorstatus"),
  ownerGet("/api/v71/heygen/job-packages", "HeyGen-Jobpaketliste"),
  ownerGet("/api/v71/heygen/backup/export", "HeyGen-Backup-Export"),
  ownerGet("/api/v71/agency/customers", "Agentur-Mandantenliste"),
  ownerGet("/api/v71/agency/brands", "Agentur-Markenliste"),
  ownerGet("/api/v71/agency/campaigns", "Agentur-Kampagnenliste"),
  ownerGet("/api/v71/agency/pilot-review", "Agentur-Pilot-Review"),
  ownerGet("/api/v71/agency/backup/export", "Agentur-Backup-Export"),
  ownerGet("/api/v71/canva/status", "Canva-Connectorstatus"),
  ownerGet("/api/v71/canva/job-packages", "Canva-Jobpaketliste"),
  ownerGet("/api/v71/canva/backup/export", "Canva-Backup-Export"),
  ownerGet("/api/v71/canva/pilot-results", "Canva-Pilot-Ergebnisakten-Liste"),
  // V7.2 Phase A Schritt 2 – Auth-Routen (Auftrag Abschnitt H).
  buildEntry("GET", exact("/api/auth/session"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Sessionstatus (öffentlich abrufbar, liefert nie Geheimnisse)",
  }),
];

const POST_POLICIES = [
  disabledInProdPost("/api/execution/prepare", "Execution vorbereiten"),
  disabledInProdPost("/api/execution/attempts/start", "Execution starten"),
  disabledInProdPost("/api/execution/attempts/cancel", "Execution abbrechen"),
  disabledInProdPost("/api/execution/apply", "Execution übernehmen"),
  ownerPost("/api/v71/documents/register", "Dokument registrieren"),
  ownerPost("/api/v71/documents/test-upload", "Dokument-Test-Upload"),
  ownerPost("/api/v71/backup/import-preview", "V7.1-Backup-Importvorschau"),
  ownerPost("/api/v71/heygen/job-package/prepare", "HeyGen-Jobpaket vorbereiten"),
  ownerPost("/api/v71/heygen/job-package/validate", "HeyGen-Jobpaket validieren"),
  ownerPost("/api/v71/heygen/job-package/approve-content", "HeyGen-Jobpaket Inhalt freigeben"),
  ownerPost("/api/v71/heygen/job-package/approve-external-transfer", "HeyGen externe Übergabe freigeben"),
  ownerPost("/api/v71/heygen/job-package/approve-cost", "HeyGen Kosten freigeben"),
  ownerPost("/api/v71/heygen/handoff/request-token", "HeyGen Handoff-Token anfordern"),
  ownerPost("/api/v71/heygen/handoff/prepare", "HeyGen Handoff vorbereiten"),
  ownerPost("/api/v71/heygen/result/request-token", "HeyGen Ergebnis-Token anfordern"),
  ownerPost("/api/v71/heygen/result/validate", "HeyGen Ergebnis validieren"),
  ownerPost("/api/v71/heygen/backup/restore-preview", "HeyGen-Backup-Restorevorschau"),
  ownerPost("/api/v71/heygen/job-package/approve-customer-draft", "HeyGen Kundenentwurf freigeben"),
  ownerPost("/api/v71/heygen/job-package/request-customer-draft-changes", "HeyGen Kundenentwurf Änderungen anfordern"),
  ownerPost("/api/v71/heygen/job-package/set-cost-package-status", "HeyGen Kostenpaketstatus setzen"),
  ownerPost("/api/v71/heygen/result-lifecycle/advance", "HeyGen Ergebnis-Statuskette fortschreiben"),
  ownerPost("/api/v71/agency/backup/restore-preview", "Agentur-Backup-Restorevorschau"),
  ownerPost("/api/v71/canva/job-package/prepare", "Canva-Jobpaket vorbereiten"),
  ownerPost("/api/v71/canva/job-package/validate", "Canva-Jobpaket validieren"),
  ownerPost("/api/v71/canva/job-package/approve-briefing", "Canva Briefing freigeben"),
  ownerPost("/api/v71/canva/job-package/approve-assets-and-rights", "Canva Assets/Rechte freigeben"),
  ownerPost("/api/v71/canva/job-package/approve-external-transfer", "Canva externe Übergabe freigeben"),
  ownerPost("/api/v71/canva/job-package/approve-cost", "Canva Kosten freigeben"),
  ownerPost("/api/v71/canva/job-package/set-cost-package-status", "Canva Kostenpaketstatus setzen"),
  ownerPost("/api/v71/canva/handoff/request-token", "Canva Handoff-Token anfordern"),
  ownerPost("/api/v71/canva/handoff/prepare", "Canva Handoff vorbereiten"),
  ownerPost("/api/v71/canva/candidate/request-token", "Canva Kandidat-Token anfordern"),
  ownerPost("/api/v71/canva/candidate/approve", "Canva Kandidat freigeben"),
  ownerPost("/api/v71/canva/result/request-token", "Canva Ergebnis-Token anfordern"),
  ownerPost("/api/v71/canva/result/validate", "Canva Ergebnis validieren"),
  ownerPost("/api/v71/canva/job-package/approve-customer-draft", "Canva Kundenentwurf freigeben"),
  ownerPost("/api/v71/canva/job-package/request-customer-draft-changes", "Canva Kundenentwurf Änderungen anfordern"),
  ownerPost("/api/v71/canva/backup/restore-preview", "Canva-Backup-Restorevorschau"),
  ownerPost("/api/v71/canva/pilot-result/internal-review", "Canva Pilot-Ergebnis interne Prüfung"),
  ownerPost("/api/v71/canva/pilot-result/customer-feedback", "Canva Pilot-Ergebnis Kundenfeedback"),
  ownerPost("/api/v71/canva/pilot-result/request-changes", "Canva Pilot-Ergebnis Änderungsanforderung"),
  ownerPost("/api/v71/canva/pilot-result/mark-ready-after-changes", "Canva Pilot-Ergebnis Änderung erledigt"),
  ownerPost("/api/v71/canva/pilot-result/customer-approve", "Canva Pilot-Ergebnis Kundenfreigabe"),
  ownerPost("/api/v71/canva/pilot-result/agent-qa", "Canva Pilot-Ergebnis Agenten-QS"),
  ownerPost("/api/v71/canva/pilot-result/human-review", "Canva Pilot-Ergebnis menschliches Review"),
  ownerPost("/api/v71/canva/pilot-result/escalate", "Canva Pilot-Ergebnis Eskalation"),
  // V7.2 Phase A Schritt 2 – Auth-Routen (Auftrag Abschnitt H).
  buildEntry("POST", exact("/api/auth/login"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Login",
    auditOnDeny: true,
  }),
  buildEntry("POST", exact("/api/auth/logout"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Logout (Auth optional)",
    auditOnDeny: false,
  }),
  buildEntry("POST", exact("/api/auth/password-reset/request"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Passwort-Reset anfordern",
    auditOnDeny: false,
  }),
  buildEntry("POST", exact("/api/auth/password-reset/confirm"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Passwort-Reset bestätigen",
    auditOnDeny: true,
  }),
  buildEntry("POST", exact("/api/auth/invitation/accept"), ACCESS_CLASSES.PUBLIC_AUTH, {
    description: "Einladung annehmen",
    auditOnDeny: true,
  }),
];

const PREFIX_POLICIES = [
  ownerPrefix("/api/projects/", "Unbekannte/-nachgelagerte Projekt-Pfade"),
  ownerPrefix("/api/v71/documents/", "Dokument-Einzelabruf"),
  ownerPrefix("/api/v71/heygen/job-packages/", "HeyGen-Jobpaket-Einzelabruf"),
  ownerPrefix("/api/v71/canva/job-packages/", "Canva-Jobpaket-Einzelabruf"),
  ownerPrefix("/api/v71/canva/pilot-results/", "Canva-Pilot-Ergebnis-Einzelabruf/-feedback"),
];

const STATIC_POLICIES = [
  staticOwnerOnly("/", "Chef-Cockpit-Startseite"),
  staticOwnerOnly("/index.html", "Chef-Cockpit-Startseite"),
  staticOwnerOnly("/agent-registry.js", "Chef-UI-Skript"),
  staticOwnerOnly("/guided-work.js", "Chef-UI-Skript"),
  staticOwnerOnly("/guided-work-ui.js", "Chef-UI-Skript"),
  staticOwnerOnly("/daily-work-run.js", "Chef-UI-Skript"),
  staticOwnerOnly("/health-hybrid-work.js", "Chef-UI-Skript"),
  staticOwnerOnly("/agent-runtime.js", "Chef-UI-Skript"),
  staticOwnerOnly("/local-data-backup.js", "Chef-UI-Skript"),
  staticOwnerOnly("/daily-work-run-ui.js", "Chef-UI-Skript"),
  staticOwnerOnly("/app.js", "Chef-UI-Hauptskript"),
  staticOwnerOnly("/styles.css", "Chef-UI-Stylesheet"),
  staticOwnerOnly("/v71-ui.js", "Chef-UI-Skript V7.1"),
];

const ALL_POLICIES = Object.freeze([
  ...GET_POLICIES,
  ...POST_POLICIES,
  ...PREFIX_POLICIES,
  ...STATIC_POLICIES,
]);

// ---------------------------------------------------------------------------
// Strukturelle Konsistenzprüfung (Auftrag Regel 5): doppelte oder
// widersprüchliche Policy-Einträge sind ein Startfehler. Wird beim Laden
// dieses Moduls ausgeführt – ein fehlerhafter Zustand verhindert bereits das
// Requiren des Moduls (also auch den Serverstart).
// ---------------------------------------------------------------------------

function policyKey(entry) {
  return `${entry.method} ${entry.isPrefix ? "PREFIX:" : entry.isStaticAsset ? "STATIC:" : "EXACT:"}${entry.path}`;
}

function validatePolicyTable(entries) {
  const seen = new Map();
  entries.forEach((entry) => {
    const key = policyKey(entry);
    if (seen.has(key)) {
      throw new Error(`route-access-policy: doppelter oder widersprüchlicher Policy-Eintrag für "${key}".`);
    }
    seen.set(key, entry);
    if (!entry.path || typeof entry.path !== "string" || !entry.path.startsWith("/")) {
      throw new Error(`route-access-policy: ungültiger Pfad in Policy-Eintrag "${key}".`);
    }
    if (entry.path.includes("*") || entry.path.includes("?")) {
      throw new Error(
        `route-access-policy: Wildcards sind nicht erlaubt (Eintrag "${key}"). Jeder Pfad muss exakt oder als klarer Prefix definiert sein.`,
      );
    }
  });
  return true;
}

validatePolicyTable(ALL_POLICIES);

// ---------------------------------------------------------------------------
// Auflösung: exakter Pfad schlägt Prefix (Auftrag Regel 9). Innerhalb der
// Prefixe wird der jeweils längste (spezifischste) Prefix bevorzugt, falls
// mehrere passen sollten (aktuell überschneidungsfrei, aber defensiv
// implementiert).
// ---------------------------------------------------------------------------

const EXACT_BY_METHOD_AND_PATH = new Map();
GET_POLICIES.concat(POST_POLICIES).forEach((entry) => {
  EXACT_BY_METHOD_AND_PATH.set(`${entry.method} ${entry.path}`, entry);
});

const STATIC_BY_PATH = new Map();
STATIC_POLICIES.forEach((entry) => {
  STATIC_BY_PATH.set(entry.path, entry);
});

function resolvePolicyForRequest(method, pathname) {
  if (typeof method !== "string" || typeof pathname !== "string") return null;
  const exactMatch = EXACT_BY_METHOD_AND_PATH.get(`${method} ${pathname}`);
  if (exactMatch) return exactMatch;

  if (method === "GET") {
    const staticMatch = STATIC_BY_PATH.get(pathname);
    if (staticMatch) return staticMatch;
  }

  const prefixMatches = PREFIX_POLICIES.filter(
    (entry) => entry.method === method && pathname.startsWith(entry.path),
  ).sort((a, b) => b.path.length - a.path.length);
  return prefixMatches.length > 0 ? prefixMatches[0] : null;
}

module.exports = {
  ACCESS_CLASSES,
  ERROR_STRATEGIES,
  CLASS_DEFAULTS,
  ALL_POLICIES,
  GET_POLICIES,
  POST_POLICIES,
  PREFIX_POLICIES,
  STATIC_POLICIES,
  buildEntry,
  exact,
  prefix,
  staticAsset,
  policyKey,
  validatePolicyTable,
  resolvePolicyForRequest,
};
