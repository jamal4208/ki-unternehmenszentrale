# API REGISTER

## Überblick

`server.js` registriert über `server-http-router.js` **60 GET-Routen** und **22 additive POST-Routen** (Execution Bridge seit Phase C gesichert + V7.1 Phase A Dokumente/Backup + V7.1 Phase B HeyGen-Connector-Pilot + V7.1 Phase B.1 Mandantenbasis/Ergebnisrückführung, lokal umgesetzt, ungesichert). Andere HTTP-Methoden bleiben 405. GET-Routen bleiben read-only. Die POST-Routen schreiben ausschließlich lokal (App-Support-Metadaten bzw. – nach Jamal-Freigabe – ein Fixture-Testrepository); niemals in Health und niemals mit Commit/Push/Deployment.

**V7.1 Phase B.1 (lokal umgesetzt, ungesichert – Commit/Push stehen aus)** ergänzte additiv **5 neue GET-Routen** und **5 neue POST-Routen** für die mandantenfähige Agenturgrundlage und den Pilotabschluss:
- GET `/api/v71/agency/customers` – neutrale Testkunden aus `agency-tenant-registry.js` (keine echten Kundendaten)
- GET `/api/v71/agency/brands` – Testmarken, optional gefiltert nach `customerId`
- GET `/api/v71/agency/campaigns` – Testkampagnen, optional gefiltert nach `customerId`/`brandId`
- GET `/api/v71/agency/pilot-review` – kanonisches Pilot-Review des ersten realen HeyGen-Piloten (`heygen-pilot-review.js`)
- GET `/api/v71/agency/backup/export` – additive Metadatensicherung für Testkunden/-marken/-kampagnen und Pilot-Review, ohne Credentials/Medien
- POST `/api/v71/heygen/job-package/approve-customer-draft` – Kundenentwurf freigeben (fünfte, getrennte Freigabestufe; setzt eine bereits erteilte interne Inhaltsfreigabe voraus; setzt niemals `publicationApproved`)
- POST `/api/v71/heygen/job-package/request-customer-draft-changes` – Änderungswunsch des Kunden am Entwurf erfassen (eigener Status, keine Sammelfreigabe)
- POST `/api/v71/heygen/job-package/set-cost-package-status` – Kostenpaketstatus setzen (`INCLUDED_IN_PACKAGE`/`ADDITIONAL_APPROVAL_REQUIRED`/`UNKNOWN`/`NOT_BILLABLE_TEST`; keine automatische Abrechnung)
- POST `/api/v71/heygen/result-lifecycle/advance` – Ergebnisrückführungs-Statuskette gezielt und einzeln weiterschalten (`LOCAL_VALIDATED`/`INTERNAL_REVIEW`/`READY_FOR_CUSTOMER_REVIEW`/`CUSTOMER_CHANGES_REQUESTED`/`CUSTOMER_APPROVED`); `PUBLISHED` ist über diese Route nicht erreichbar
- POST `/api/v71/agency/backup/restore-preview` – geprüfte Restore-Vorschau für Agentur-Metadaten; schreibt nichts zurück, startet nichts, veröffentlicht nichts

Zusätzlich wurden die bestehenden HeyGen-Job-Routen additiv um einen optionalen `customerId`-Filter erweitert; der Einzelabruf eines Jobpakets liefert bei `customerId`-Mismatch bewusst `404` statt `403`, um die Existenz fremder Datensätze nicht preiszugeben. Sicherheit identisch zur bestehenden Architektur wiederverwendet. Keine Route für HeyGen-Kundenzugang, Credentialausgabe, Providerlogin, automatischen Render, automatische Veröffentlichung, Video-/Avatar-/Voice-Löschung, Creditkauf, Abrechnung oder Kunden-E-Mail-Versand.

**V7.1 Phase B (lokal umgesetzt, ungesichert – Commit/Push stehen aus)** ergänzte additiv **3 neue GET-Routen** und **10 neue POST-Routen** für den kontrollierten HeyGen-Connector-Piloten (`CONTROLLED_CONNECTOR_HANDOFF`):
- GET `/api/v71/heygen/status` – Capability-Profil und additiver Pilotstatus (`PARTIALLY_CONNECTED`/`CONTROLLED_HANDOFF`, niemals `DIRECT`)
- GET `/api/v71/heygen/job-packages` (+ `/api/v71/heygen/job-packages/{id}`) – lokal gespeicherte Auftragspaket-Metadaten
- GET `/api/v71/heygen/backup/export` – additive Metadatensicherung ohne Originaldateien/Credentials
- POST `/api/v71/heygen/job-package/prepare` – Auftragspaket erzeugen (Status `DRAFT`)
- POST `/api/v71/heygen/job-package/validate` – Inhalts-/Rechteprüfung (Status `READY_FOR_REVIEW` oder `BLOCKED`)
- POST `/api/v71/heygen/job-package/approve-content` – Inhalt freigeben (Freigabestufe 1 von 4)
- POST `/api/v71/heygen/job-package/approve-external-transfer` – externe Übertragung freigeben (Freigabestufe 2 von 4)
- POST `/api/v71/heygen/job-package/approve-cost` – Kostenrahmen freigeben (Freigabestufe 3 von 4)
- POST `/api/v71/heygen/handoff/request-token` – einmaligen, kurzlebigen Hand-off-Token anfordern (bestehende Execution-Bridge-Tokenarchitektur)
- POST `/api/v71/heygen/handoff/prepare` – Token einlösen, minimales Hand-off-Payload erzeugen (Status `HANDED_OFF`; startet keine HeyGen-Aktion, keine Netzwerkanfrage)
- POST `/api/v71/heygen/result/request-token` – Ergebnis-Validierungs-Token anfordern
- POST `/api/v71/heygen/result/validate` – strukturierte Ergebnisrückgabe validieren (nur gültige HTTPS-Referenzen, kein Auto-Erfolg allein durch `providerJobId`)
- POST `/api/v71/heygen/backup/restore-preview` – geprüfte Restore-Vorschau, schreibt nichts zurück, startet nichts

Sicherheit identisch zur bestehenden V7.1-Architektur wiederverwendet (Host-/Origin-Prüfung, `application/json`, Bodylimit, unbekannte Felder abgewiesen, keine Stacktraces, keine Secrets, keine absoluten Pfade). Keine Route für API-Key-Speicherung, Login, Avatar-/Video-Löschung, Credit-Kauf, Tarif-Upgrade, automatische Veröffentlichung oder freien URL-Abruf. Kein Modul (`heygen-job-package.js`, `heygen-connector.js`, `heygen-job-result.js`) enthält einen direkten Netzwerkaufruf (`http`/`https`/`fetch`); die Handler machen keine externe HTTP-Anfrage. Veröffentlichung (`publicationApproved`) bleibt strukturell unerreichbar – es gibt in Phase B keine Funktion, die dieses Feld auf `true` setzen kann.

**V7.1 Phase A (lokal umgesetzt, ungesichert – Commit/Push stehen aus)** ergänzte additiv **5 neue GET-Routen** und **3 neue POST-Routen**:
- GET `/api/v71/documents` – registrierte Dokumentmetadaten (optional gefiltert nach `projectId`)
- GET `/api/v71/documents/{documentId}` – einzelnes Dokument (Präfixroute)
- GET `/api/v71/tools` – kanonisches Werkzeug-/Lizenzregister aus `tool-registry.js`
- GET `/api/v71/plugin-gateway` – Plugin-/Adapterstatus aus `plugin-gateway.js` (optional `projectId` für Health-Hardblock)
- GET `/api/v71/tool-routing` – deterministischer Tool-Routing-Vorschlag (Query: `projectId`, `requiredCapabilities`, `dataClassification`, `externalTransferAllowed`, `publicationAllowed`, `costCeiling`)
- GET `/api/v71/backup/export` – additive V7.1-Metadatensicherung (Schema `v71-phase-a-metadata-1`)
- POST `/api/v71/documents/register` – Dokumentreferenz/-notiz registrieren (kein Dateiinhalt)
- POST `/api/v71/documents/test-upload` – isolierter Test-Upload ausschließlich gegen serverseitig erzeugte Fixture-Dateien
- POST `/api/v71/backup/import-preview` – geprüfte Restore-Vorschau, schreibt nichts zurück

Sicherheit identisch zur bestehenden Execution-Bridge-Architektur wiederverwendet: Host-/Origin-Prüfung, `application/json`, max. 64 KiB Body, unbekannte Felder abgewiesen, keine Stacktraces, keine Secrets, keine absoluten Browserpfade. Für die beiden Registrierungsrouten wurde bewusst **kein** zusätzlicher One-Time-Token eingeführt: beide schreiben ausschließlich additive, nicht-destruktive Metadaten (kein Löschen, keine externe Aktion, Dublettenschutz statt Überschreiben) und sind damit risikoärmer als die Execution-Bridge-Start-/Apply-Aktionen, für die das bestehende Token-Verfahren reserviert bleibt. Kanonische Werkzeugidentität lebt ausschließlich in `tool-registry.js`, Live-/Adapterzustand ausschließlich in `plugin-gateway.js`; die bestehende `PRODUCTIVE_PLUGIN_REGISTRY` (server.js, V6.34.2) bleibt unverändert eine reine UI-Textsammlung für den Cockpit-„Plugin-Leitstand" und ist keine zweite Wahrheitsquelle für diese Fragen.

V7.0 Phase E (gesichert `52ce012`) ergänzte **genau eine neue GET-Route**: `GET /api/v7-freeze-status`. Sie liest Phasenhistorie, aktuellen Git-Commit/Working-Tree und den zuletzt gemessenen Testlauf; Statusmodell `IN_REVIEW|FREEZE_CANDIDATE|FROZEN`. Die automatische Ableitung setzt `FROZEN` niemals selbst. Andere Methoden bleiben 405.

**V7.0 offiziell FROZEN (25.07.2026):** Dieselbe Route liefert seit Jamals ausdrücklicher Entscheidung zusätzlich `manualFreezeDecision` und zeigt `status: "FROZEN"` – ausschließlich weil server.js die eine kanonische, von Hand in `v7-freeze-status.js#MANUAL_FREEZE_DECISION` hinterlegte Entscheidung (Version, `FROZEN`, `decidedBy: "Jamal"`, Entscheidungsdatum `2026-07-25`, Basis-Commit `52ce012`) an `computeFreezeStatus()` übergibt. Kein neuer Endpunkt, keine neue Methode, kein Schreibpfad; POST bleibt 405.

V7.0 Phase D (gesichert `6553452`) ergänzte **genau eine neue GET-Route**: `GET /api/execution/executors`. Sie liest die Executor-Registry (Mock/Codex) inkl. Verfügbarkeit/Autorisierung; kein Prozessstart. Codex-Ausführung und Apply bleiben für Health hart blockiert.

V7.0 Phase C (gesichert `0858b4e`) ergänzte:
- GET `/api/execution/attempts/status`
- GET `/api/execution/attempts/result`
- POST `/api/execution/prepare`
- POST `/api/execution/attempts/start`
- POST `/api/execution/attempts/cancel`
- POST `/api/execution/apply` (ohne Token = Preview; mit Token + `approved:true` = Confirm)

Sicherheit: nur `127.0.0.1`, Host-/Origin-Prüfung, `application/json`, max. 32 KiB Body, unbekannte Felder abgewiesen, One-Time-Token nur im Server-RAM (kurzlebig, aktionsgebunden, nicht in localStorage/Backup/URL). Mock-Executor ist keine KI, Codex läuft ausschließlich isoliert gegen das Fixture-Repository. Health-Apply und Codex-Start für Health bleiben hart blockiert.

V7.0 Phase B (gesichert `3487a84`) ergänzte **genau eine neue GET-Route**: `GET /api/server-status`. Sie liest ausschließlich den Status des bereits laufenden App-Servers und sichere, read-only gelesene Controller-Metadaten aus dem lokalen App-Support-Statuspfad. Keine Prozess-Start-/Stop-Aktion, keine vollständigen internen Pfade, keine Secrets. Andere Methoden bleiben 405.

V6.44.1 ändert **keine Route und kein API-Verhalten**. Es synchronisiert nur die kanonische Health-/Expansion-Momentaufnahme im Projektregister; keine neue API, keine Schreibroute, keine Autonomieerhöhung.

V6.44.0 ändert **keine Route und kein API-Verhalten**. Es ist ein V1-Betriebsfreeze mit Einstiegsdokumentation und sichtbarem Betriebsstatus; keine neue API, keine Schreibroute, keine Autonomieerhöhung.

V6.43.0 ergänzt **keine neue API-Route**. Die kontrollierte Agenten-Laufzeit läuft ausschließlich im lokalen Browser-Tageslaufmodell unter `agentRuntimePilot`. Statisch ausgeliefert wird zusätzlich `agent-runtime.js`. `writeOperationsBlocked: true` und `madeExternalRequest: false` bleiben unverändert.

V6.43.1 ändert **keine Route und kein API-Verhalten**. Es korrigiert Dokumentation und UI-Bezeichnung; der Runtime-Pilot bleibt lokal, deterministisch und ohne Außenwirkung.

V6.42.1 ändert **keine Route und kein API-Verhalten**. Die technische Routerstruktur ist modularisiert: `server.js` übergibt eine explizite Handler-Tabelle und freigegebene statische Assets an `createHttpRouter(...)`. Der Router enthält keine Geschäftslogik, keine Secrets und keine zweite Routendefinition.

V6.40.3 ergänzt **keine neue API-Route**. Freigabe, interne Arbeitskarten, manuelle Ergebnisrückführung, QA, Orchestrator und Jamals Abschlussentscheidung laufen im bestehenden lokalen Tageslaufmodell. `writeOperationsBlocked: true` und `madeExternalRequest: false` bleiben unverändert; keine Agenten-, Codex-, Plugin-, Git- oder externe Aktion wird ausgelöst.

V6.40.2 ergänzt **keine neue API-Route**. Der vertiefte Einsatzplan nutzt weiterhin ausschließlich `GET /api/projects` für den aktuellen kanonischen Projektstand. Das statisch ausgelieferte `agent-registry.js` ist die gemeinsame codebasierte Quelle der vorhandenen 25 Agenten; Agentenauswahl und Werkzeugprüfung laufen lokal und starten keine Codex-, Agenten-, Plugin-, Git-, Netzwerk- oder externe Aktion. Managementdaten werden nur lokal im Browser gespeichert.

Nur `/api/agents/plugin-readiness` liest HTTP-Query-Parameter. Lokale Serverkonfiguration ist eine Abhängigkeit, keine HTTP-Eingabe. Standardausgabe ist JSON. `Schreiben` bedeutet fachliche oder externe Schreibwirkung, nicht das Senden einer HTTP-Antwort.

| Nr. | GET-Pfad | Zweck / Modul | HTTP-Eingaben → Ausgabe | Sicherheitsstatus | Extern | Schreiben | Reifegrad / Abhängigkeiten |
|---:|---|---|---|---|:---:|:---:|---|
| 1 | `/api/airtable/pilot-status` | Airtable-Pilotstatus | keine HTTP-Eingaben → Status-JSON | Read-only, intern; keine Schreibwirkung | NEIN | NEIN | vorbereitet; lokale `.env.local`-Konfiguration |
| 2 | `/api/cockpit/todays-one-decision` | eine Tagesentscheidung | keine HTTP-Eingaben → Entscheidungs-JSON | Read-only, intern; externe Anfrage nicht möglich | NEIN | NEIN | lokal nutzbar |
| 3 | `/api/cockpit/todays-three-things` | drei Tagesprioritäten | keine HTTP-Eingaben → Cockpit-JSON | Read-only, intern; externe Anfrage nicht möglich | NEIN | NEIN | lokal nutzbar |
| 4 | `/api/airtable/test-connection` | Read-only-Verbindungstest | keine HTTP-Eingaben → Teststatus | Read-only; externe HTTPS-Anfrage nur mit lokalen Zugangsdaten und Serverfreigabe; keine Schreibwirkung | JA | NEIN | geschützt; lokale `.env.local`-Konfiguration; Airtable HTTPS |
| 5 | `/api/airtable/first-readonly-preview` | erste Read-only-Vorschau | keine HTTP-Eingaben → sanitisiertes Ergebnis | Read-only, sanitisiert; externe HTTPS-Anfrage nur mit lokalen Zugangsdaten und Serverfreigabe; keine Schreibwirkung | JA | NEIN | geschützt; lokale `.env.local`-Konfiguration; Airtable HTTPS |
| 6 | `/api/agents/plugin-work-capability` | Plugin-Arbeitsfähigkeit | keine HTTP-Eingaben → Rollen-/Grenzstatus | Read-only, interne Vorschau; externe Anfrage nicht möglich | NEIN | NEIN | vorbereitet |
| 7 | `/api/agents/projectmanager-plugin-task` | PM-Arbeitsauftrag | keine HTTP-Eingaben → Aufgaben-JSON | Read-only, interne Vorschau; externe Anfrage nicht möglich | NEIN | NEIN | vorbereitet |
| 8 | `/api/agents/projectmanager-plugin-task/chef-approval-preview` | Chef-Freigabevorschau | keine HTTP-Eingaben → Bereitschaft | Read-only, lokale Vorschau; keine Schreibwirkung | NEIN | NEIN | lokale `.env.local`-Konfiguration |
| 9 | `/api/agents/projectmanager-plugin-task/chef-output` | sanitisierte Chef-Ausgabe | keine HTTP-Eingaben → Status | Read-only, sanitisiert; externe Anfrage nicht möglich | NEIN | NEIN | lokale `.env.local`-Konfiguration; keine freie Rohdatenausgabe |
| 10 | `/api/agents/projectmanager-plugin-task/daily-focus` | PM-Tagesfokus | keine HTTP-Eingaben → Fokus | Read-only, sanitisiert; externe Anfrage nicht möglich | NEIN | NEIN | lokale `.env.local`-Konfiguration |
| 11 | `/api/agents/projectmanager-plugin-task/start-action` | manueller Startauftrag | keine HTTP-Eingaben → Vorschau | Read-only, interne Vorschau; keine Ausführung | NEIN | NEIN | vorbereitet |
| 12 | `/api/agents/projectmanager-plugin-task/workflow` | PM-Workflow | keine HTTP-Eingaben → Workflow | Read-only, intern; kein automatischer Workflow | NEIN | NEIN | lokal geführt |
| 13 | `/api/agents/projectmanager-plugin-task/workflow-result` | PM-Workflow-Ergebnis | keine HTTP-Eingaben → Ergebnisstatus | Read-only, intern; keine Schreibwirkung | NEIN | NEIN | vorbereitet |
| 14 | `/api/agents/hr-daily-training` | tägliches HR-Training | keine HTTP-Eingaben → Trainingsrahmen | Read-only, Vorschlagsmodus; keine Autonomieerhöhung | NEIN | NEIN | vorbereitet |
| 15 | `/api/agents/hr-daily-training-suggestion` | 1%-Trainingsvorschlag | keine HTTP-Eingaben → Vorschlag | Read-only, Vorschlagsmodus; keine Agentenänderung | NEIN | NEIN | 25-Agenten-Bezug |
| 16 | `/api/agents/plugin-readiness` | Plugin-Bereitschaft | Query: `workRequest`, `projectId`, `resultSource` → Bewertung | Read-only, interne Bewertung; keine Plugin-Ausführung | NEIN | NEIN | vorbereitet |
| 17 | `/api/agents/hr-autonomy-approval` | Autonomie-Freigabevorschau | keine HTTP-Eingaben → Entscheidungsvorlage | Read-only, Vorschau; keine Autonomieerhöhung | NEIN | NEIN | vorbereitet |
| 18 | `/api/agents/hr-all-agents-development` | Entwicklung aller Agenten | keine HTTP-Eingaben → Entwicklungsstatus | Read-only, Vorschlagsmodus; keine Agentenänderung | NEIN | NEIN | vorbereitet |
| 19 | `/api/agents/knowledge-archive-plugin-task` | Wissens-/Archivauftrag | keine HTTP-Eingaben → Aufgabe | Read-only, interne Vorschau; keine Speicherung | NEIN | NEIN | vorbereitet |
| 20 | `/api/agents/knowledge-archive-plugin-task/knowledge-summary` | Wissenskurzfassung | keine HTTP-Eingaben → Kurzfassung | Read-only, sanitisiert; keine externe Anfrage | NEIN | NEIN | vorbereitet |
| 21 | `/api/agents/knowledge-archive-plugin-task/workflow` | Wissensworkflow | keine HTTP-Eingaben → Workflow | Read-only, intern; kein automatischer Workflow | NEIN | NEIN | lokal |
| 22 | `/api/agents/knowledge-archive-plugin-task/workflow-result` | Wissensworkflow-Ergebnis | keine HTTP-Eingaben → Ergebnis | Read-only, intern; keine Schreibwirkung | NEIN | NEIN | vorbereitet |
| 23 | `/api/agents/knowledge-archive-plugin-task/projectmanager-start-action` | Übergabe an PM | keine HTTP-Eingaben → Startvorschau | Read-only, Vorschau; kein Agentenstart | NEIN | NEIN | vorbereitet |
| 24 | `/api/agents/system-flow/daily-decision` | Systemfluss Tagesentscheidung | keine HTTP-Eingaben → Entscheidung | Read-only, intern; Jamal entscheidet | NEIN | NEIN | lokal |
| 25 | `/api/agents/system-flow/today-direction` | heutige Richtung | keine HTTP-Eingaben → Richtungsstatus | Read-only, intern; keine Ausführung | NEIN | NEIN | lokal |
| 26 | `/api/agents/system-flow/next-agent-workflow` | nächster Agentenworkflow | keine HTTP-Eingaben → Empfehlung | Read-only, Vorschau; kein automatischer Start | NEIN | NEIN | vorbereitet |
| 27 | `/api/agents/content-design-plugin-task` | Content-/Design-Auftrag | keine HTTP-Eingaben → Aufgabe | Read-only, interne Vorschau; keine Plugin-Ausführung | NEIN | NEIN | vorbereitet |
| 28 | `/api/agents/content-design-plugin-task/canva-brief` | Canva-Briefing | keine HTTP-Eingaben → Briefing | Read-only, interne Vorschau; keine Canva-Ausführung | NEIN | NEIN | vorbereitet |
| 29 | `/api/agents/content-design-plugin-task/workflow` | Content-/Design-Workflow | keine HTTP-Eingaben → Workflow | Read-only, intern; kein automatischer Workflow | NEIN | NEIN | lokal |
| 30 | `/api/agents/content-design-plugin-task/review-team` | Reviewteam | keine HTTP-Eingaben → Rollenreview | Read-only, interne Vorschau; keine Teamaktion | NEIN | NEIN | vorbereitet |
| 31 | `/api/agents/content-design-plugin-task/chef-decision` | Chefentscheidung | keine HTTP-Eingaben → Vorlage | Read-only, Entscheidungsvorlage; Jamal entscheidet | NEIN | NEIN | vorbereitet |
| 32 | `/api/agents/content-design-plugin-task/follow-up-task` | Folgeauftrag | keine HTTP-Eingaben → Entwurf | Read-only, Vorschau; kein automatischer Start | NEIN | NEIN | vorbereitet |
| 33 | `/api/agents/content-design-plugin-task/follow-up-readiness` | Folgebereitschaft | keine HTTP-Eingaben → Status | Read-only, intern; keine Ausführung | NEIN | NEIN | vorbereitet |
| 34 | `/api/agents/content-design-plugin-task/refined-follow-up-task` | geschärfter Folgeauftrag | keine HTTP-Eingaben → Entwurf | Read-only, interne Vorschau; keine Ausführung | NEIN | NEIN | vorbereitet |
| 35 | `/api/agents/content-design-plugin-task/manual-team-review-prep` | manuelles Teamreview | keine HTTP-Eingaben → Prüfpaket | Read-only, manuelle Vorschau; keine Teamaktion | NEIN | NEIN | vorbereitet |
| 36 | `/api/agents/content-design-plugin-task/manual-team-review-evaluation` | Reviewauswertung | keine HTTP-Eingaben → Bewertung | Read-only, interne Bewertung; keine Schreibwirkung | NEIN | NEIN | lokal |
| 37 | `/api/agents/content-design-plugin-task/improvement-task` | Verbesserungsauftrag | keine HTTP-Eingaben → Entwurf | Read-only, interne Vorschau; keine Umsetzung | NEIN | NEIN | vorbereitet |
| 38 | `/api/agents/content-design-plugin-task/usable-canva-task` | nutzbarer Canva-Auftrag | keine HTTP-Eingaben → Briefing | Read-only, interne Vorschau; keine Canva-Aktion | NEIN | NEIN | vorbereitet |
| 39 | `/api/agents/projectmanager-plugin-task/autonomy-applied` | Autonomie-Anwendungsstatus | keine HTTP-Eingaben → Status | Read-only, Statusvorschau; keine Autonomieerhöhung | NEIN | NEIN | vorbereitet |
| 40 | `/api/projects` | kanonische Projektliste | keine HTTP-Eingaben → 17 Projektakten aus `project-registry.js` | Read-only; `writeOperationsBlocked: true`; `madeExternalRequest: false` | NEIN | NEIN | V6.39.0; keine Live-Git-/Dateisystemprüfung |
| 41 | `/api/projects/health-upgrade-kompass` | technische Health-Pilotakte | keine HTTP-Eingaben → bestätigte Health-Momentaufnahme | Read-only; `writeOperationsBlocked: true`; `madeExternalRequest: false`; unbekannte Projekt-ID kontrolliert 404 | NEIN | NEIN | V6.39.0; keine medizinische, fachliche oder rechtliche Freigabe |
| 42 | `/api/projects/health-upgrade-kompass/live-status` | lokaler Health-Live-Status | keine HTTP-Eingaben → Branch, HEAD, Working-Tree, relative dirty/untracked paths, Inhaltshashes, Baseline-Fingerprint (read-only) | Read-only Git-Lesezugriff nur auf kanonischen Health-Pfad; kein Testlauf; kein Schreibbefehl; keine Dateiinhalte/Secrets; `writeOperationsBlocked: true`; `madeExternalRequest: false` | NEIN | NEIN | V6.46.0 + V7.0 Phase A additive Live-Details; keine Secrets/vollständigen Pfade in Fehlern |
| 43 | `/api/server-status` | Serverstatus des laufenden App-Servers | keine HTTP-Eingaben → `status`, `port`, `pid`, `startedAt`, `appVersion`, `gitCommit`, `currentProjectCommit`, `isCurrentVersion`, `managedByController`, `controllerSchemaVersion`, `message`, `nextAction` | Read-only; liest nur den bereits laufenden Prozess und die sichere Controller-Statusdatei; kein Prozessstart/-stopp; keine vollständigen Pfade/Secrets; `writeOperationsBlocked: true`; `madeExternalRequest: false` | NEIN | NEIN | V7.0 Phase B; Controller unter `scripts/zentral-ctl.js` ist separat und nicht Teil dieser Route |
| 44 | `/api/execution/attempts/status` | Attempt-Status der Execution Bridge | Query `attemptId` → Status, Apply-Status, Recovery | Read-only Attempt-Metadaten aus App Support; keine Secrets/Dateiinhalte; `madeExternalRequest: false` | NEIN | NEIN | V7.0 Phase C (gesichert `0858b4e`); Mock ≠ KI |
| 45 | `/api/execution/attempts/result` | Attempt-Ergebnis / Evidenz | Query `attemptId` → Diff-Summary, Tests, Blocker, changedFiles | Read-only strukturierte Evidenz; kein Auto-ACCEPTED; keine Dateiinhalte | NEIN | NEIN | V7.0 Phase C (gesichert `0858b4e`) |
| 46 | `/api/execution/executors` | Executor-Registry (Mock/Codex) | keine HTTP-Eingaben → Liste mit Verfügbarkeit/Autorisierung je Executor | Read-only; kein Prozessstart; keine Secrets | NEIN | NEIN | V7.0 Phase D (gesichert `6553452`); Codex nur gegen Fixture, Health hart blockiert |
| 47 | `/api/v7-freeze-status` | V7.0 Freeze-/Abschlussstatus | keine HTTP-Eingaben → `status` (`IN_REVIEW\|FREEZE_CANDIDATE\|FROZEN`), Phasenhistorie, Git-Abgleich, Teststand, `manualFreezeDecision`, offene Jamal-Schritte | Read-only; automatische Ableitung setzt `FROZEN` niemals selbst; `FROZEN` entsteht ausschließlich durch die im Quellcode hinterlegte `MANUAL_FREEZE_DECISION` | NEIN | NEIN | V7.0 Phase E (gesichert `52ce012`); seit 25.07.2026 zeigt diese Route `V7.0 · FROZEN` aufgrund von Jamals ausdrücklicher Entscheidung |
| 48 | `/api/v71/documents` (+ `/api/v71/documents/{id}`) | registrierte Projektunterlagen | Query `projectId` optional; Präfixroute für Einzelabruf → Dokumentmetadaten (nie Dateiinhalte) | Read-only; `writeOperationsBlocked`/`madeExternalRequest`; keine Originaldateien in der Antwort | NEIN | NEIN | V7.1 Phase A (lokal, ungesichert); Quelle `document-registry.js` |
| 49 | `/api/v71/tools` | kanonisches Werkzeug-/Lizenzregister | keine HTTP-Eingaben → 21 Werkzeuge mit Lizenz-/Verbindungs-/Ausführungsstatus | Read-only; keine Zugangsdaten in der Antwort | NEIN | NEIN | V7.1 Phase A (lokal, ungesichert); Quelle `tool-registry.js` |
| 50 | `/api/v71/plugin-gateway` | Plugin-/Adapterstatus | Query `projectId` optional (Health-Hardblock) → Pluginliste mit Status/Adaptertyp/Datenschutzgrenze | Read-only; spiegelt bestehende Codex-/Git-/Airtable-Statusquellen, keine neuen Netzwerkaufrufe | NEIN | NEIN | V7.1 Phase A (lokal, ungesichert); Quelle `plugin-gateway.js` |
| 51 | `/api/v71/tool-routing` | deterministischer Tool-Routing-Vorschlag | Query `projectId`, `requiredCapabilities`, `dataClassification`, `externalTransferAllowed`, `publicationAllowed`, `costCeiling` → Empfehlung, Begründung, Alternativen, Freigabebedarf | Read-only, rein deterministisch; kein Sprachmodell entscheidet; keine automatische Ausführung | NEIN | NEIN | V7.1 Phase A (lokal, ungesichert) |
| 52 | `/api/v71/backup/export` | additive V7.1-Metadatensicherung | keine HTTP-Eingaben → Dokumente/Tool-/Plugin-Schnappschuss, Schema `v71-phase-a-metadata-1` | Read-only; keine Originaldateien/Credentials/Tokens in der Antwort | NEIN | NEIN | V7.1 Phase A (lokal, ungesichert); Quelle `v71-registry-backup.js` |
| 53 | `/api/v71/heygen/status` | HeyGen-Capability-Profil und Pilotstatus | keine HTTP-Eingaben → Capability-Profil, additiver Pilotstatus (`PARTIALLY_CONNECTED`/`CONTROLLED_HANDOFF`), Pilotgrenzen | Read-only; kein API-Key in der Antwort; `noApiKeyStored: true`, `noAutomaticExecution: true` | NEIN | NEIN | V7.1 Phase B (lokal, ungesichert); Quelle `heygen-connector.js` |
| 54 | `/api/v71/heygen/job-packages` (+ `/api/v71/heygen/job-packages/{id}`) | lokal gespeicherte HeyGen-Auftragspakete | Query `projectId` optional; Präfixroute für Einzelabruf → Paket-Metadaten inkl. Handoff-Bereitschaft | Read-only; keine Videos/Audios/Bilder, keine Secrets in der Antwort | NEIN | NEIN | V7.1 Phase B (lokal, ungesichert); Quelle `heygen-store.js` |
| 55 | `/api/v71/heygen/backup/export` | additive HeyGen-Metadatensicherung | keine HTTP-Eingaben → Auftragspaket-/Ergebnis-Metadaten-Schnappschuss | Read-only; keine Originaldateien/API-Keys/Tokens/Credentials in der Antwort | NEIN | NEIN | V7.1 Phase B (lokal, ungesichert); Quelle `heygen-backup.js` |
| 56 | `/api/v71/agency/customers` | neutrale Testkunden | keine HTTP-Eingaben → Testkundenliste (keine echten Kundendaten) | Read-only; `writeOperationsBlocked`/`madeExternalRequest` | NEIN | NEIN | V7.1 Phase B.1 (lokal, ungesichert); Quelle `agency-tenant-registry.js` |
| 57 | `/api/v71/agency/brands` | Testmarken | Query `customerId` optional → Markenliste | Read-only; blockiert unbekannte `customerId` strukturell (leere Liste, keine Preisgabe) | NEIN | NEIN | V7.1 Phase B.1 (lokal, ungesichert); Quelle `agency-tenant-registry.js` |
| 58 | `/api/v71/agency/campaigns` | Testkampagnen | Query `customerId`/`brandId` optional → Kampagnenliste | Read-only; Mandantenfilterung serverseitig | NEIN | NEIN | V7.1 Phase B.1 (lokal, ungesichert); Quelle `agency-tenant-registry.js` |
| 59 | `/api/v71/agency/pilot-review` | kanonisches Pilot-Review | keine HTTP-Eingaben → dokumentierter erster realer HeyGen-Pilot (`NOT_BILLABLE_TEST`, `NOT_PUBLISHED`) | Read-only; keine erfundenen Werte, unbekannte Felder bleiben `UNKNOWN` | NEIN | NEIN | V7.1 Phase B.1 (lokal, ungesichert); Quelle `heygen-pilot-review.js` |
| 60 | `/api/v71/agency/backup/export` | additive Agentur-Metadatensicherung | keine HTTP-Eingaben → Testkunden-/Marken-/Kampagnen-/Pilot-Review-Schnappschuss | Read-only; keine Credentials/Tokens/Medien in der Antwort | NEIN | NEIN | V7.1 Phase B.1 (lokal, ungesichert); Quelle `agency-backup.js` |

### Additive POST-Routen (Execution Bridge seit Phase C gesichert + V7.1 Phase A + V7.1 Phase B HeyGen-Connector-Pilot + V7.1 Phase B.1 Mandantenbasis, lokal ungesichert)

| Nr. | POST-Pfad | Zweck | Sicherheit |
|---:|---|---|---|
| P1 | `/api/execution/prepare` | Attempt vorbereiten, Start-Token ausgeben | Host/Origin/JSON/Bodylimit; Token nur RAM; kein freier Command/Pfad |
| P2 | `/api/execution/attempts/start` | Attempt starten (Mock-Szenario) | Start-Token einmalig; Lock; isolierter Workspace |
| P3 | `/api/execution/attempts/cancel` | Attempt abbrechen | Cancel-Token einmalig; SIGTERM-äquivalente Cancel-Flagge |
| P4 | `/api/execution/apply` | Preview ohne Token / Confirm mit Token + `approved:true` | Apply nur Fixture; Health hart blockiert; kein Commit/Push/Deploy |
| P5 | `/api/v71/documents/register` | Dokumentreferenz/-notiz registrieren | Host/Origin/JSON/64-KiB-Limit/bekannte Felder; kein Dateiinhalt; Projekt-/Agenten-ID muss kanonisch sein; Dublettenschutz statt Überschreiben |
| P6 | `/api/v71/documents/test-upload` | isolierter Test-Upload gegen serverseitige Fixture-Dateien | wie P5; zusätzlich Traversal-/Symlink-/Allowlist-/Größen-/Secret-Dateiprüfung; Hashprüfung vor/nach Ablage; kein Browser-Dateipfad |
| P7 | `/api/v71/backup/import-preview` | Restore-Vorschau für V7.1-Backup | wie P5; validiert Schema/Version/Inhalt vollständig; schreibt nichts in laufende Register zurück, startet kein Plugin |
| P8 | `/api/v71/heygen/job-package/prepare` | HeyGen-Auftragspaket erzeugen | wie P5; Projekt-/Agenten-ID muss kanonisch sein; Status startet immer `DRAFT`; `externalTransferApproved`/`publicationApproved` starten immer `false` |
| P9 | `/api/v71/heygen/job-package/validate` | Inhalts-/Rechteprüfung | wie P5; blockiert bei SENSITIVE/SECRET, Gesundheits-/Kunden-/Kinderdaten, Voice Clone, privatem Avatar ohne Zustimmung, Secrets, absoluten Pfaden |
| P10 | `/api/v71/heygen/job-package/approve-content` | Inhalt freigeben (1 von 4) | wie P5; nur aus Status `READY_FOR_REVIEW`; eigene, getrennte Freigabe |
| P11 | `/api/v71/heygen/job-package/approve-external-transfer` | externe Übertragung freigeben (2 von 4) | wie P5; eigene, getrennte Freigabe; kein Bezug zu Inhalts- oder Kostenfreigabe |
| P12 | `/api/v71/heygen/job-package/approve-cost` | Kostenrahmen freigeben (3 von 4) | wie P5; nur `WITHIN_APPROVED_LIMIT` zählt als Freigabe; kein erfundener Preis |
| P13 | `/api/v71/heygen/handoff/request-token` | Hand-off-Token anfordern | wie P5; Token nur bei vollständiger Handoff-Bereitschaft (Inhalt/Übertragung/Kosten freigegeben, Fingerprint aktuell, nicht abgelaufen); bestehende Execution-Bridge-Tokenarchitektur (RAM-only, einmalig) |
| P14 | `/api/v71/heygen/handoff/prepare` | Hand-off-Payload erzeugen | Token einmalig; erneute Fingerprint-/Freigabeprüfung; liefert nur minimales, whitelistetes Payload; startet keine HeyGen-Aktion, keine Netzwerkanfrage; Status wechselt zu `HANDED_OFF` |
| P15 | `/api/v71/heygen/result/request-token` | Ergebnis-Validierungs-Token anfordern | wie P13; gebunden an `jobPackageId`/`providerJobId`/Ergebnis-Fingerprint |
| P16 | `/api/v71/heygen/result/validate` | strukturierte Ergebnisrückgabe validieren | Token einmalig; nur gültige HTTPS-Referenzen (kein `file://`, kein localhost, keine private IP, keine Credentials in URL); `providerJobId` allein ist kein Erfolg |
| P17 | `/api/v71/heygen/backup/restore-preview` | Restore-Vorschau für HeyGen-Backup | wie P7; markiert abgelaufene Pakete nur in der Vorschau als `STALE`; startet keinen HeyGen-Job, wiederholt keinen Hand-off |
| P18 | `/api/v71/heygen/job-package/approve-customer-draft` | Kundenentwurf freigeben (fünfte Freigabestufe) | wie P5; nur wenn interne Inhaltsfreigabe bereits erteilt ist; setzt niemals `publicationApproved`; eigener, getrennter Aufruf |
| P19 | `/api/v71/heygen/job-package/request-customer-draft-changes` | Änderungswunsch am Kundenentwurf erfassen | wie P5; eigener Status `CHANGES_REQUESTED`, keine automatische Rückstufung anderer Freigaben |
| P20 | `/api/v71/heygen/job-package/set-cost-package-status` | Kostenpaketstatus setzen | wie P5; nur die vier definierten Enum-Werte zulässig; keine automatische Abrechnung, kein erfundener Preis |
| P21 | `/api/v71/heygen/result-lifecycle/advance` | Ergebnisrückführungs-Statuskette weiterschalten | wie P5; strikte Übergangsprüfung je Zielstatus (z. B. `LOCAL_VALIDATED` erfordert zuvor lokal verifizierten Erfolg); `PUBLISHED` ist über diese Route für keinen Zielstatus erreichbar |
| P22 | `/api/v71/agency/backup/restore-preview` | Restore-Vorschau für Agentur-Backup | wie P7; meldet unbekannte/fremde Kunden-IDs, schreibt nichts zurück, startet nichts |

Die V6.39.0-Routen 40–41 lesen ausschließlich die beim Serverstart geladene In-Memory-Quelle `project-registry.js` ohne Dateisystemzugriff. Route 42 liest zusätzlich lokal nur den kanonischen Health-Pfad über feste Git-Lesebefehle (`health-repo-status.js`), ohne `fetch`/`pull`/`checkout`/`reset`/`clean` und ohne Testprozess. Route 43 liest zusätzlich einmalig beim Serverstart (unveränderliche Momentaufnahme) sowie je Anfrage frisch den lokalen Git-Commit des Zentralen-Projekts und read-only die Controller-Statusdatei aus dem App-Support-Pfad; sie startet, stoppt oder verändert keinen Prozess. Routen 44–46 und P1–P4 gehören zur Execution Bridge: sie materialisieren und prüfen ausschließlich isolierte Workspaces unter App Support und dürfen Health niemals als Apply-Ziel verwenden. Route 47 (Phase E) liest zusätzlich je Anfrage frisch den lokalen Git-Commit/Working-Tree der Zentrale und einen zuletzt manuell nachgeführten Teststand; sie startet, stoppt oder verändert ebenfalls keinen Prozess und schreibt nichts. Routen 48–52 und P5–P7 (V7.1 Phase A, lokal umgesetzt, ungesichert) lesen bzw. schreiben ausschließlich lokale Metadaten unter App Support (`documents/*`) bzw. spiegeln bestehende, bereits vorhandene read-only Statusquellen (Codex-Executor, lokaler Git-Stand, Airtable-Zugangsdaten-Anwesenheit); sie lösen keine neue externe Netzwerkverbindung, keinen Canva-/HeyGen-/Shopify-Produktivlauf und keine Veröffentlichung aus. Routen 53–55 und P8–P17 (V7.1 Phase B, lokal umgesetzt, ungesichert) lesen bzw. schreiben ausschließlich lokale HeyGen-Metadaten unter App Support (`heygen/*`); kein Handler in diesem Block enthält einen `http`/`https`/`fetch`-Aufruf, keine Route löst eine echte HeyGen-Anfrage, eine Kostenübernahme oder eine Veröffentlichung aus. Routen 56–60 und P18–P22 (V7.1 Phase B.1, lokal umgesetzt, ungesichert) lesen bzw. schreiben ausschließlich lokale Mandanten-, Kosten- und Ergebnisrückführungs-Metadaten unter App Support; die Testkunden-/Marken-/Kampagnendaten selbst sind fest im Quellcode (`agency-tenant-registry.js`) hinterlegt, keine produktive Kundenanlage; kein Handler in diesem Block kann `publicationApproved`/`publicationStatus` auf veröffentlicht setzen; keine Route gewährt Kunden HeyGen-Zugang oder gibt Provider-Credentials aus. Andere Methoden bleiben mit HTTP 405 blockiert. Erfolgreiche GET-Antworten enthalten immer `writeOperationsBlocked: true` und `madeExternalRequest: false`.

## Statische Auslieferung

`server-http-router.js` liefert ausschließlich explizit freigegebene lokale Assets aus. GET `/` und `/index.html` liefern `index.html`; GET `/agent-registry.js` liefert das kanonische 25-Agenten-Register; GET `/health-hybrid-work.js` liefert das Health-Hybrid-Arbeitsmodul; GET `/guided-work.js` und `/guided-work-ui.js` liefern die Guided-Work-Foundation (V7.0 Phase A; Phase-B-Serverstatus und Phase-C-Execution-UI sind additiv in denselben Dateien); GET `/daily-work-run.js` liefert das lokale Tageslaufmodell; GET `/agent-runtime.js` liefert das Runtime-Modul; GET `/daily-work-run-ui.js` liefert das Tageslauf-UI-Modul; GET `/local-data-backup.js` liefert das Datensicherungsmodul; GET `/app.js` liefert `app.js`; GET `/styles.css` liefert `styles.css`; GET `/v71-ui.js` liefert das additive V7.1-Phase-A-UI-Modul (lokal, ungesichert). Die statische Modulauslieferung ist keine zusätzliche API-Route. Andere statische Pfade, `.env`, `.git`, Testdateien und Dokumentationen sind nicht freigegeben. `server-status.js`, `scripts/zentral-ctl.js`, `execution-bridge.js` und `execution-mock-adapter.js` sind serverseitige Node-Module und werden **nicht** statisch an den Browser ausgeliefert.

## Sicherheitsstatus

Alle GET-Routen sind read-only ausgerichtet. Nur die beiden Airtable-Test-/Vorschaurouten können bei vollständigen lokalen Zugangsdaten und ausdrücklicher Serverfreigabe eine externe HTTPS-GET-Anfrage auslösen. Die additiven POST-Routen der Execution Bridge (seit Phase C gesichert) schreiben ausschließlich lokal in App Support und – nach Jamal-Freigabe – in ein Fixture-Testrepository; Health bleibt Apply- und Codex-gesperrt; kein Commit, Push oder Deployment. Keine Route darf extern schreiben.

## Bekannte Widersprüche

Einige Routennamen enthalten `start-action`, `workflow-result` oder `autonomy-applied`, obwohl die Implementierung ausdrücklich nur vorbereitende Status- und Vorschauausgaben erzeugt.

## Noch zu normalisieren

Exakte Query-Schemata und Antwortschemas sind nicht zentral typisiert.

## Entscheidung durch Jamal erforderlich

Ob später eine maschinenlesbare API-Spezifikation erstellt werden soll.
