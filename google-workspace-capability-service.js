"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt E/F).
//
// Rein statisches, unveränderliches Fähigkeitsmodell für Gmail/Calendar/
// Drive-Docs/Contacts – GENAU wie company-principles.js bewusst OHNE eigene
// Datenbanktabelle (siehe auth-db-migrations.js#Migration-15-Kopfkommentar):
// jede Fähigkeit ist eine feste Referenzaussage über Risiko/Sensitivität/
// empfohlene Einstiegsstufe, kein mutierbarer Zustand. Dieses Modul
// importiert KEIN better-sqlite3, führt KEINEN Netzwerkaufruf aus und
// enthält KEINE OAuth-Logik.
//
// Berechtigungsstufen (Auftrag Abschnitt F) – acht Stufen, additiv zur
// bereits bestehenden Sicherheitsarchitektur (route-access-policy.js/
// auth-route-guard.js), aber eine eigene, kleinere Skala für "wie weit darf
// eine einzelne Google-Workspace-Fähigkeit fachlich gehen".
const PERMISSION_LEVEL_VALUES = Object.freeze([
  "DISCONNECTED",
  "AUTHENTICATED_NO_ACCESS",
  "READ_METADATA",
  "READ_CONTENT",
  "PREPARE_DRAFT",
  "JAMAL_APPROVED_WRITE",
  "LIMITED_AUTOMATED_WRITE",
  "BLOCKED",
]);

const PERMISSION_LEVEL_LABELS_DE = Object.freeze({
  DISCONNECTED: "Nicht verbunden",
  AUTHENTICATED_NO_ACCESS: "Authentifiziert, aber ohne Zugriff",
  READ_METADATA: "Nur Metadaten lesen",
  READ_CONTENT: "Inhalt lesen",
  PREPARE_DRAFT: "Entwurf vorbereiten",
  JAMAL_APPROVED_WRITE: "Schreibzugriff nach Jamal-Freigabe",
  LIMITED_AUTOMATED_WRITE: "Eingeschränkter automatisierter Schreibzugriff (Zukunftsoption)",
  BLOCKED: "Blockiert",
});

// V7.6.1: maximal lokaler Zielstatus ist PREPARE_DRAFT – kein Codepfad
// dieses Moduls setzt eine Fähigkeit aktiv auf JAMAL_APPROVED_WRITE oder
// LIMITED_AUTOMATED_WRITE (Auftrag Abschnitt F: "kein JAMAL_APPROVED_WRITE
// tatsächlich aktivieren", "LIMITED_AUTOMATED_WRITE nur als Zukunftsoption
// dokumentieren"). Der tatsächliche, ehrliche Verbindungsstatus JEDER
// Fähigkeit ist "DISCONNECTED" (kein OAuth wurde je durchgeführt) –
// recommendedInitialState beschreibt lediglich die künftig sinnvolle
// Zielstufe für einen späteren, separat freizugebenden Piloten.
const CURRENT_ACTUAL_STATE = "DISCONNECTED";

const DATA_SENSITIVITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
const RISK_LEVEL_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
const READ_OR_WRITE_VALUES = Object.freeze(["READ", "WRITE"]);
const EXTERNAL_EFFECT_VALUES = Object.freeze([
  "NONE",
  "DIRECT_EXTERNAL_COMMUNICATION",
  "EXTERNAL_VISIBILITY_TO_INVITEES",
  "EXTERNAL_VISIBILITY_TO_RECIPIENTS",
  "DATA_LOSS_RISK",
]);

function capability(fields) {
  return Object.freeze({
    requiredRole: "OWNER",
    status: CURRENT_ACTUAL_STATE,
    ...fields,
  });
}

// ---------------------------------------------------------------------------
// Gmail (12 Fähigkeiten). allowedAgentIds: communication-agent ist laut
// Office-Agentenmodell (Auftrag Abschnitt H) für "E-Mail-Vorbereitung"
// zuständig (agent-organization-service.js-Gruppe "Marketing und
// Kommunikation", role: "Formuliert Übergabe und Kommunikation").
// ---------------------------------------------------------------------------
const GMAIL_CAPABILITIES = Object.freeze([
  capability({
    capabilityId: "gmail-read-metadata",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "READ_MESSAGE_METADATA",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_METADATA",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-read-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "READ_MESSAGE",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-read-thread",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "READ_THREAD",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-read-attachment",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "READ_ATTACHMENT",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-prepare-draft",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "PREPARE_DRAFT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-prepare-reply-draft",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "PREPARE_REPLY_DRAFT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-submit-draft-for-approval",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "SUBMIT_DRAFT_FOR_APPROVAL",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-send-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "SEND_MESSAGE",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "DIRECT_EXTERNAL_COMMUNICATION",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-forward-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "FORWARD_MESSAGE",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "DIRECT_EXTERNAL_COMMUNICATION",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-archive-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "ARCHIVE_MESSAGE",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "LIMITED_AUTOMATED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-label-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "LABEL_MESSAGE",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "LIMITED_AUTOMATED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
  capability({
    capabilityId: "gmail-delete-message",
    provider: "GOOGLE_WORKSPACE",
    category: "GMAIL",
    action: "DELETE_MESSAGE",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "DATA_LOSS_RISK",
    recommendedInitialState: "BLOCKED",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["communication-agent"],
  }),
]);

// ---------------------------------------------------------------------------
// Calendar (8 Fähigkeiten). allowedAgentIds: workflow-agent ("Bewertet
// Ablauf und Reihenfolge", Gruppe "Office und Verwaltung") ist laut
// Office-Agentenmodell für "Kalenderkoordination" zuständig.
// ---------------------------------------------------------------------------
const CALENDAR_CAPABILITIES = Object.freeze([
  capability({
    capabilityId: "calendar-read-list",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "READ_CALENDAR_LIST",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_METADATA",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-read-events",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "READ_EVENTS",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-check-availability",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "CHECK_AVAILABILITY",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-prepare-event-draft",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "PREPARE_EVENT_DRAFT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-create-event",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "CREATE_EVENT",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "EXTERNAL_VISIBILITY_TO_INVITEES",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-update-event",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "UPDATE_EVENT",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "EXTERNAL_VISIBILITY_TO_INVITEES",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-respond-invitation",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "RESPOND_INVITATION",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "DIRECT_EXTERNAL_COMMUNICATION",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
  capability({
    capabilityId: "calendar-delete-event",
    provider: "GOOGLE_WORKSPACE",
    category: "CALENDAR",
    action: "DELETE_EVENT",
    riskLevel: "HIGH",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "EXTERNAL_VISIBILITY_TO_INVITEES",
    recommendedInitialState: "BLOCKED",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["workflow-agent"],
  }),
]);

// ---------------------------------------------------------------------------
// Drive/Docs (9 Fähigkeiten). allowedAgentIds: documentation-agent
// ("Strukturiert Übergabe und Dokumentation", Gruppe "Office und
// Verwaltung") ist laut Office-Agentenmodell für "Dokumentenmanagement"
// zuständig.
// ---------------------------------------------------------------------------
const DRIVE_CAPABILITIES = Object.freeze([
  capability({
    capabilityId: "drive-read-folder-structure",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "READ_FOLDER_STRUCTURE",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_METADATA",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-search-documents",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "SEARCH_DOCUMENTS",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_METADATA",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-read-document",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "READ_DOCUMENT",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-prepare-document-draft",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "PREPARE_DOCUMENT_DRAFT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-create-document",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "CREATE_DOCUMENT",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-update-document",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "UPDATE_DOCUMENT",
    riskLevel: "MEDIUM",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-move-file",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "MOVE_FILE",
    riskLevel: "LOW",
    dataSensitivity: "LOW",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "LIMITED_AUTOMATED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-share-file",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "SHARE_FILE",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "EXTERNAL_VISIBILITY_TO_RECIPIENTS",
    recommendedInitialState: "BLOCKED",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
  capability({
    capabilityId: "drive-delete-file",
    provider: "GOOGLE_WORKSPACE",
    category: "DRIVE_DOCS",
    action: "DELETE_FILE",
    riskLevel: "HIGH",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "DATA_LOSS_RISK",
    recommendedInitialState: "BLOCKED",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["documentation-agent"],
  }),
]);

// ---------------------------------------------------------------------------
// Contacts (4 Fähigkeiten). allowedAgentIds: customer-value-agent
// ("Bewertet Nutzen aus Kundensicht") ist laut Office-Agentenmodell für
// "Kontakte/Stakeholder" zuständig.
// ---------------------------------------------------------------------------
const CONTACTS_CAPABILITIES = Object.freeze([
  capability({
    capabilityId: "contacts-search",
    provider: "GOOGLE_WORKSPACE",
    category: "CONTACTS",
    action: "SEARCH_CONTACT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_METADATA",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["customer-value-agent"],
  }),
  capability({
    capabilityId: "contacts-read-details",
    provider: "GOOGLE_WORKSPACE",
    category: "CONTACTS",
    action: "READ_CONTACT_DETAILS",
    riskLevel: "MEDIUM",
    dataSensitivity: "HIGH",
    readOrWrite: "READ",
    externalEffect: "NONE",
    recommendedInitialState: "READ_CONTENT",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["customer-value-agent"],
  }),
  capability({
    capabilityId: "contacts-prepare-draft",
    provider: "GOOGLE_WORKSPACE",
    category: "CONTACTS",
    action: "PREPARE_CONTACT_DRAFT",
    riskLevel: "LOW",
    dataSensitivity: "MEDIUM",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "PREPARE_DRAFT",
    requiresJamalApproval: false,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["customer-value-agent"],
  }),
  capability({
    capabilityId: "contacts-create-or-update",
    provider: "GOOGLE_WORKSPACE",
    category: "CONTACTS",
    action: "CREATE_OR_UPDATE_CONTACT",
    riskLevel: "MEDIUM",
    dataSensitivity: "HIGH",
    readOrWrite: "WRITE",
    externalEffect: "NONE",
    recommendedInitialState: "JAMAL_APPROVED_WRITE",
    requiresJamalApproval: true,
    requiresReauthentication: true,
    auditRequired: true,
    allowedAgentIds: ["customer-value-agent"],
  }),
]);

// Genau 33 Fähigkeiten (12 Gmail + 8 Calendar + 9 Drive/Docs + 4 Contacts).
const ALL_CAPABILITIES = Object.freeze([
  ...GMAIL_CAPABILITIES,
  ...CALENDAR_CAPABILITIES,
  ...DRIVE_CAPABILITIES,
  ...CONTACTS_CAPABILITIES,
]);

// Auftrag Abschnitt F: kein Codepfad darf jemals eine Fähigkeit aktiv auf
// JAMAL_APPROVED_WRITE oder LIMITED_AUTOMATED_WRITE als AKTUELLEN Zustand
// setzen (recommendedInitialState darf diese Werte als künftiges Ziel
// nennen – das ist eine Empfehlung, kein aktiver Zustand).
function assertNoCapabilityCurrentlyElevated() {
  const elevated = ALL_CAPABILITIES.filter((item) => item.status === "JAMAL_APPROVED_WRITE" || item.status === "LIMITED_AUTOMATED_WRITE");
  if (elevated.length > 0) {
    throw new Error(
      `google-workspace-capability-service: Fähigkeit(en) dürfen in V7.6.1 nicht aktiv erhöht sein: ${elevated.map((item) => item.capabilityId).join(", ")}.`,
    );
  }
}
assertNoCapabilityCurrentlyElevated();

function getCapabilityById(capabilityId) {
  const found = ALL_CAPABILITIES.find((item) => item.capabilityId === capabilityId);
  return found ? { ...found } : null;
}

function listCapabilities(filter = {}) {
  return ALL_CAPABILITIES.filter((item) => {
    if (filter.category && item.category !== filter.category) return false;
    if (filter.agentId && !item.allowedAgentIds.includes(filter.agentId)) return false;
    return true;
  }).map((item) => ({
    ...item,
    recommendedInitialStateLabel: PERMISSION_LEVEL_LABELS_DE[item.recommendedInitialState] || item.recommendedInitialState,
    statusLabel: PERMISSION_LEVEL_LABELS_DE[item.status] || item.status,
  }));
}

module.exports = {
  PERMISSION_LEVEL_VALUES,
  PERMISSION_LEVEL_LABELS_DE,
  DATA_SENSITIVITY_VALUES,
  RISK_LEVEL_VALUES,
  READ_OR_WRITE_VALUES,
  EXTERNAL_EFFECT_VALUES,
  CURRENT_ACTUAL_STATE,
  GMAIL_CAPABILITIES,
  CALENDAR_CAPABILITIES,
  DRIVE_CAPABILITIES,
  CONTACTS_CAPABILITIES,
  ALL_CAPABILITIES,
  getCapabilityById,
  listCapabilities,
};
