"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt X,
// Prüfpunkte 1-26). Fachlogik-/Persistenztests für
// external-identity-service.js, google-workspace-capability-service.js,
// office-work-service.js, finance-handoff-service.js und
// google-workspace-connector.js – unabhängig von HTTP (siehe
// office-finance-security.test.js für die HTTP-/Zugriffsschicht und
// office-finance-ui.test.js für die UI-Quelltextprüfung).
//
// Ausschließlich isolierte os.tmpdir()-Testdatenbanken (gleiches Muster wie
// agent-leadership.test.js) – niemals die echte Application-Support-
// Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const agentRegistry = require("./agent-registry");
const externalIdentityService = require("./external-identity-service");
const capabilityService = require("./google-workspace-capability-service");
const officeWorkService = require("./office-work-service");
const financeHandoffService = require("./finance-handoff-service");
const googleWorkspaceConnector = require("./google-workspace-connector");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "office-finance-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = authDb.openAuthDatabase({ dataDir }).db;
  return { db, dataDir };
}

const { db } = makeIsolatedDb();

// ---------------------------------------------------------------------------
// 1-4. Apple-first/Google-controlled, keine Vollmigration, drei Startidentitäten.
// ---------------------------------------------------------------------------

const identities = externalIdentityService.listIdentities(db);

check("4. genau drei Startidentitäten (jamal@/office@/info@jacogbr.de)", () => {
  assert.strictEqual(identities.length, 3);
  assert.deepStrictEqual(
    identities.map((identity) => identity.emailAddress).sort(),
    ["info@jacogbr.de", "jamal@jacogbr.de", "office@jacogbr.de"],
  );
});

check("1. alle drei @jacogbr.de-Identitäten sind geschäftliche Google-Workspace-Identitäten (provider !== APPLE)", () => {
  identities.forEach((identity) => {
    assert.ok(identity.emailAddress.endsWith("@jacogbr.de"));
    assert.strictEqual(identity.provider, "GOOGLE_WORKSPACE");
    assert.notStrictEqual(identity.provider, "APPLE");
  });
  const jamal = identities.find((identity) => identity.emailAddress === "jamal@jacogbr.de");
  assert.strictEqual(jamal.identityType, "OWNER_PERSONAL");
});

check("1b. Apple-first bleibt Systemzuständigkeit und wird nicht mit dem E-Mail-Provider verwechselt (kein provider=APPLE, keine erfundene Apple-E-Mail-Identität)", () => {
  assert.strictEqual(externalIdentityService.PROVIDER_VALUES.includes("APPLE"), true);
  assert.strictEqual(identities.some((identity) => identity.provider === "APPLE"), false);
  const model = fs.readFileSync(path.join(__dirname, "APPLE_GOOGLE_OPERATING_MODEL.md"), "utf8");
  assert.ok(/Apple bleibt persönlicher Arbeitsraum/i.test(model));
});

check("2. Google Workspace ist der kontrollierte Unternehmensraum (office@jacogbr.de, Provider GOOGLE_WORKSPACE)", () => {
  const office = identities.find((identity) => identity.emailAddress === "office@jacogbr.de");
  assert.strictEqual(office.provider, "GOOGLE_WORKSPACE");
  assert.strictEqual(office.identityType, "COMPANY_OFFICE");
  assert.strictEqual(office.status, "ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION");
});

check("2b. Kontotyp/Aliasstatus darf ehrlich unbestätigt sein (info@jacogbr.de, ohne externe Verifikation)", () => {
  const info = identities.find((identity) => identity.emailAddress === "info@jacogbr.de");
  assert.strictEqual(info.status, "USER_ACCOUNT_OR_ALIAS_UNCONFIRMED");
  assert.ok(externalIdentityService.IDENTITY_STATUS_VALUES.includes("USER_ACCOUNT_OR_ALIAS_UNCONFIRMED"));
  assert.ok(!/^bestätigt|^verifiziert/i.test(info.notes || ""));
});

check("3. keine Vollmigration: kein Identitätsdatensatz beansprucht eine bereits abgeschlossene Migration", () => {
  identities.forEach((identity) => {
    assert.notStrictEqual(identity.status, "MIGRATED");
    assert.ok(!/vollst(ä|ae)ndig migriert/i.test(identity.notes || ""));
  });
});

// ---------------------------------------------------------------------------
// 5-7. Kein Passwort-/Tokenfeld, kein direkter Agentenlogin.
// ---------------------------------------------------------------------------

check("5. kein Identitätsdatensatz enthält ein Passwortfeld", () => {
  identities.forEach((identity) => {
    assert.ok(!("password" in identity));
    assert.ok(!("passwordHash" in identity));
  });
});

check("6. kein Identitätsdatensatz enthält ein Tokenfeld", () => {
  identities.forEach((identity) => {
    assert.ok(!("token" in identity));
    assert.ok(!("accessToken" in identity));
    assert.ok(!("refreshToken" in identity));
    assert.ok(!("recoveryCode" in identity));
  });
});

check("7. Agenten erhalten keinen direkten Login (agentDirectLoginAllowed ist immer false)", () => {
  identities.forEach((identity) => {
    assert.strictEqual(identity.agentDirectLoginAllowed, false);
  });
});

// ---------------------------------------------------------------------------
// 8-10. Fähigkeitsstufen, maximal PREPARE_DRAFT, kein automatischer Stufenwechsel.
// ---------------------------------------------------------------------------

check("8. Fähigkeitsstufen sind korrekt (33 Fähigkeiten über Gmail/Calendar/Drive-Docs/Contacts)", () => {
  assert.strictEqual(capabilityService.ALL_CAPABILITIES.length, 33);
  const categories = new Set(capabilityService.ALL_CAPABILITIES.map((item) => item.category));
  assert.deepStrictEqual([...categories].sort(), ["CALENDAR", "CONTACTS", "DRIVE_DOCS", "GMAIL"]);
});

check("9. maximal lokaler Zielstatus PREPARE_DRAFT: keine Fähigkeit ist aktiv auf JAMAL_APPROVED_WRITE/LIMITED_AUTOMATED_WRITE gesetzt", () => {
  capabilityService.ALL_CAPABILITIES.forEach((item) => {
    assert.notStrictEqual(item.status, "JAMAL_APPROVED_WRITE");
    assert.notStrictEqual(item.status, "LIMITED_AUTOMATED_WRITE");
  });
});

check("10. kein automatischer Stufenwechsel: Fähigkeiten sind eingefroren (Object.freeze) und besitzen keine Mutationsmethode", () => {
  assert.ok(Object.isFrozen(capabilityService.ALL_CAPABILITIES));
  capabilityService.ALL_CAPABILITIES.forEach((item) => assert.ok(Object.isFrozen(item)));
});

// ---------------------------------------------------------------------------
// 11-12. Gmail-Korridor.
// ---------------------------------------------------------------------------

const emailDraft = officeWorkService.prepareEmailDraft({
  action: "NEW_MESSAGE",
  recipient: "kunde@example.test",
  subject: "Testbetreff",
  bodyDraft: "Testtext für den Entwurf.",
});

check("11. Gmail-Entwurf wird lokal vorbereitet (Korridor GMAIL_OFFLINE, sichere Vorschau vorhanden)", () => {
  assert.strictEqual(emailDraft.corridor, "GMAIL_OFFLINE");
  assert.ok(emailDraft.safePreview.length > 0);
});

check("12. keine Mail wird tatsächlich gesendet (notExecuted enthält 'senden')", () => {
  assert.ok(emailDraft.notExecuted.includes("senden"));
});

// ---------------------------------------------------------------------------
// 13-15. Kalender-Korridor.
// ---------------------------------------------------------------------------

const calendarDraft = officeWorkService.prepareCalendarDraft({
  title: "Testtermin",
  date: "2026-08-01",
  time: "10:00",
  participants: ["kunde@example.test"],
});

check("13. Kalenderentwurf wird lokal vorbereitet (Korridor CALENDAR_OFFLINE)", () => {
  assert.strictEqual(calendarDraft.corridor, "CALENDAR_OFFLINE");
  assert.strictEqual(calendarDraft.title, "Testtermin");
});

check("14. keine Verfügbarkeitsbehauptung: conflictRisk bleibt AVAILABILITY_NOT_VERIFIED", () => {
  assert.strictEqual(calendarDraft.conflictRisk, "AVAILABILITY_NOT_VERIFIED");
  assert.strictEqual(calendarDraft.availabilityVerified, false);
});

check("15. kein Termin wird tatsächlich erstellt (notExecuted enthält 'Termine erstellen')", () => {
  assert.ok(calendarDraft.notExecuted.includes("Termine erstellen"));
});

// ---------------------------------------------------------------------------
// 16-17. Drive-/Dokumenten-Korridor.
// ---------------------------------------------------------------------------

const documentDraft = officeWorkService.prepareDocumentDraft({
  documentType: "HANDOVER_DOCUMENT",
  title: "Testübergabe",
});

check("16. Dokumententwurf wird lokal vorbereitet (Korridor DRIVE_DOCS_OFFLINE)", () => {
  assert.strictEqual(documentDraft.corridor, "DRIVE_DOCS_OFFLINE");
  assert.strictEqual(documentDraft.title, "Testübergabe");
});

check("17. keine Drive-Datei wird tatsächlich erstellt (notExecuted enthält 'Datei erstellen')", () => {
  assert.ok(documentDraft.notExecuted.includes("Datei erstellen"));
});

// ---------------------------------------------------------------------------
// 18-19. Kontakt-Korridor.
// ---------------------------------------------------------------------------

const contactRequest = officeWorkService.prepareContactSearchRequest({
  expectedName: "Max Mustermann",
  purpose: "Rückfrage zu einem Angebot",
});

check("18. Kontaktauftrag wird lokal vorbereitet (Korridor CONTACTS_OFFLINE)", () => {
  assert.strictEqual(contactRequest.corridor, "CONTACTS_OFFLINE");
  assert.strictEqual(contactRequest.expectedName, "Max Mustermann");
});

check("19. keine echten Kontakte werden gelesen (notExecuted enthält 'echte Kontakte lesen')", () => {
  assert.ok(contactRequest.notExecuted.includes("echte Kontakte lesen"));
});

// ---------------------------------------------------------------------------
// 20-23. Finance-Handoff-Korridor.
// ---------------------------------------------------------------------------

const financeHandoff = financeHandoffService.createHandoff(db, {
  title: "Testbeleg Januar",
  type: "RECEIPT_REVIEW",
  sourceDescription: "Tankbeleg (Testfixtur)",
});

check("20. Finance-Handoff wird lokal persistiert", () => {
  assert.ok(financeHandoff.id);
  const fetched = financeHandoffService.getHandoffById(db, financeHandoff.id);
  assert.strictEqual(fetched.title, "Testbeleg Januar");
});

check("21. keine Buchung: executionBlocked ist immer true", () => {
  assert.strictEqual(financeHandoff.executionBlocked, true);
});

check("22. keine Zahlung: finance-handoff-service.js exportiert keine Zahlungsfunktion", () => {
  assert.strictEqual(typeof financeHandoffService.payHandoff, "undefined");
  assert.strictEqual(typeof financeHandoffService.bookHandoff, "undefined");
});

check("23. kein Rechnungsversand: finance-handoff-service.js exportiert keine Versandfunktion", () => {
  assert.strictEqual(typeof financeHandoffService.sendInvoice, "undefined");
});

// ---------------------------------------------------------------------------
// 24-25. Finance-Capability-Gap bleibt, kein 26. Agent.
// ---------------------------------------------------------------------------

check("24. Finance-Capability-Gap bleibt sichtbar (currentOverallStatus PREPARATION_ONLY, capabilityGap true)", () => {
  assert.strictEqual(financeHandoffService.FINANCE_CAPABILITY_GAP_STATUS.capabilityGap, true);
  assert.strictEqual(financeHandoffService.FINANCE_CAPABILITY_GAP_STATUS.currentOverallStatus, "PREPARATION_ONLY");
});

check("25. kein 26. Agent: officeWorkService verwendet ausschließlich bestehende agent-registry.js-Agenten", () => {
  assert.strictEqual(agentRegistry.CANONICAL_AGENT_COUNT, 25);
  officeWorkService.OFFICE_AGENT_ROLE_MODEL.forEach((entry) => {
    if (!entry.agentId) return;
    assert.ok(agentRegistry.hasAgentId(entry.agentId), `${entry.agentId} ist kein bekannter agent-registry.js-Agent`);
  });
  capabilityService.ALL_CAPABILITIES.forEach((item) => {
    item.allowedAgentIds.forEach((agentId) => {
      assert.ok(agentRegistry.hasAgentId(agentId), `${agentId} ist kein bekannter agent-registry.js-Agent`);
    });
  });
});

// ---------------------------------------------------------------------------
// 26. Genau ein Owner je Auftrag.
// ---------------------------------------------------------------------------

const workItem = officeWorkService.createWorkItem(db, {
  title: "Testauftrag",
  requestedOutcome: "Testergebnis",
  category: "EMAIL",
  ownerAgentId: "communication-agent",
  contributorAgentIds: ["orchestrator-agent"],
  draftInput: { action: "NEW_MESSAGE", recipient: "a@example.test", subject: "S", bodyDraft: "T" },
});

check("26. genau ein Owner je Office-Auftrag (ownerAgentId gesetzt, Contributor zulässig, kein doppelter Owner)", () => {
  assert.strictEqual(workItem.ownerAgentId, "communication-agent");
  assert.ok(!workItem.contributorAgentIds.includes(workItem.ownerAgentId));
});

check("ein Office-Auftrag ohne ownerAgentId wird abgewiesen", () => {
  assert.throws(() => {
    officeWorkService.createWorkItem(db, {
      title: "Ohne Owner",
      requestedOutcome: "X",
      category: "GENERAL_OFFICE",
      draftInput: {},
    });
  }, /ownerAgentId/);
});

check("Office-Auftrag kann technisch nicht über WAITING_FOR_AUTHENTICATION hinaus ausgeführt werden", () => {
  assert.throws(() => {
    officeWorkService.reviewWorkItem(db, { workItemId: workItem.id, executionStatus: "EXECUTED" });
  }, /WAITING_FOR_AUTHENTICATION/);
});

check("eine Jamal-Freigabe (APPROVED_FOR_EXTERNAL_ACTION) bewegt den Auftrag maximal bis WAITING_FOR_AUTHENTICATION", () => {
  const reviewed = officeWorkService.reviewWorkItem(db, { workItemId: workItem.id, approvalStatus: "APPROVED_FOR_EXTERNAL_ACTION" });
  assert.strictEqual(reviewed.approvalStatus, "APPROVED_FOR_EXTERNAL_ACTION");
  assert.strictEqual(reviewed.executionStatus, "WAITING_FOR_AUTHENTICATION");
});

// ---------------------------------------------------------------------------
// 35-36. Connector eindeutig Stub, keine echte Google-ID.
// ---------------------------------------------------------------------------

check("35. google-workspace-connector.js ist eindeutig als Stub gekennzeichnet", () => {
  const status = googleWorkspaceConnector.buildConnectorStatus();
  assert.strictEqual(status.isHttpClient, false);
  const result = googleWorkspaceConnector.callGoogleWorkspaceStub("READ_METADATA", {});
  assert.strictEqual(result.isStub, true);
  assert.strictEqual(result.isRealProviderCall, false);
  assert.strictEqual(result.networkCallMade, false);
});

check("36. keine echte Google-ID: die Stub-Referenz-ID beginnt immer mit dem lokalen Präfix", () => {
  const result = googleWorkspaceConnector.callGoogleWorkspaceStub("READ_METADATA", {});
  assert.ok(result.stubReferenceId.startsWith(googleWorkspaceConnector.STUB_ID_PREFIX));
});

check("google-workspace-connector.js lehnt eine echte, injizierte Providerfunktion ab", () => {
  assert.throws(() => {
    googleWorkspaceConnector.callGoogleWorkspaceStub("READ_METADATA", {}, { providerFn: () => ({}) });
  }, /keine echte.*Providerfunktion/i);
});

authDb.closeAuthDatabase(db);
console.log(`office-finance.test.js: ${passed} Prüfpunkte erfolgreich`);
