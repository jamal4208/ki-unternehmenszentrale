# API REGISTER

## Überblick

`server.js` registriert über `server-http-router.js` **45 GET-Routen** und **4 additive POST-Routen** (nur Execution Bridge, Phase C). Andere HTTP-Methoden bleiben 405. GET-Routen bleiben read-only. Die POST-Routen der Execution Bridge schreiben ausschließlich in App-Support und – nach Jamal-Freigabe – in ein Fixture-Testrepository; niemals in Health und niemals mit Commit/Push/Deployment.

V7.0 Phase C (Umsetzungskandidat, noch nicht committed) ergänzt:
- GET `/api/execution/attempts/status`
- GET `/api/execution/attempts/result`
- POST `/api/execution/prepare`
- POST `/api/execution/attempts/start`
- POST `/api/execution/attempts/cancel`
- POST `/api/execution/apply` (ohne Token = Preview; mit Token + `approved:true` = Confirm)

Sicherheit: nur `127.0.0.1`, Host-/Origin-Prüfung, `application/json`, max. 32 KiB Body, unbekannte Felder abgewiesen, One-Time-Token nur im Server-RAM (kurzlebig, aktionsgebunden, nicht in localStorage/Backup/URL). Mock-Executor ist keine KI. Health-Apply bleibt hart blockiert.

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
| 44 | `/api/execution/attempts/status` | Attempt-Status der Execution Bridge | Query `attemptId` → Status, Apply-Status, Recovery | Read-only Attempt-Metadaten aus App Support; keine Secrets/Dateiinhalte; `madeExternalRequest: false` | NEIN | NEIN | V7.0 Phase C (Umsetzungskandidat); Mock ≠ KI |
| 45 | `/api/execution/attempts/result` | Attempt-Ergebnis / Evidenz | Query `attemptId` → Diff-Summary, Tests, Blocker, changedFiles | Read-only strukturierte Evidenz; kein Auto-ACCEPTED; keine Dateiinhalte | NEIN | NEIN | V7.0 Phase C (Umsetzungskandidat) |

### Additive POST-Routen (nur Execution Bridge, Phase C)

| Nr. | POST-Pfad | Zweck | Sicherheit |
|---:|---|---|---|
| P1 | `/api/execution/prepare` | Attempt vorbereiten, Start-Token ausgeben | Host/Origin/JSON/Bodylimit; Token nur RAM; kein freier Command/Pfad |
| P2 | `/api/execution/attempts/start` | Attempt starten (Mock-Szenario) | Start-Token einmalig; Lock; isolierter Workspace |
| P3 | `/api/execution/attempts/cancel` | Attempt abbrechen | Cancel-Token einmalig; SIGTERM-äquivalente Cancel-Flagge |
| P4 | `/api/execution/apply` | Preview ohne Token / Confirm mit Token + `approved:true` | Apply nur Fixture; Health hart blockiert; kein Commit/Push/Deploy |

Die V6.39.0-Routen 40–41 lesen ausschließlich die beim Serverstart geladene In-Memory-Quelle `project-registry.js` ohne Dateisystemzugriff. Route 42 liest zusätzlich lokal nur den kanonischen Health-Pfad über feste Git-Lesebefehle (`health-repo-status.js`), ohne `fetch`/`pull`/`checkout`/`reset`/`clean` und ohne Testprozess. Route 43 liest zusätzlich einmalig beim Serverstart (unveränderliche Momentaufnahme) sowie je Anfrage frisch den lokalen Git-Commit des Zentralen-Projekts und read-only die Controller-Statusdatei aus dem App-Support-Pfad; sie startet, stoppt oder verändert keinen Prozess. Routen 44–45 und P1–P4 gehören zur Execution Bridge: sie materialisieren und prüfen ausschließlich isolierte Workspaces unter App Support und dürfen Health niemals als Apply-Ziel verwenden. Andere Methoden bleiben mit HTTP 405 blockiert. Erfolgreiche GET-Antworten enthalten immer `writeOperationsBlocked: true` und `madeExternalRequest: false`.

## Statische Auslieferung

`server-http-router.js` liefert ausschließlich explizit freigegebene lokale Assets aus. GET `/` und `/index.html` liefern `index.html`; GET `/agent-registry.js` liefert das kanonische 25-Agenten-Register; GET `/health-hybrid-work.js` liefert das Health-Hybrid-Arbeitsmodul; GET `/guided-work.js` und `/guided-work-ui.js` liefern die Guided-Work-Foundation (V7.0 Phase A; Phase-B-Serverstatus und Phase-C-Execution-UI sind additiv in denselben Dateien); GET `/daily-work-run.js` liefert das lokale Tageslaufmodell; GET `/agent-runtime.js` liefert das Runtime-Modul; GET `/daily-work-run-ui.js` liefert das Tageslauf-UI-Modul; GET `/local-data-backup.js` liefert das Datensicherungsmodul; GET `/app.js` liefert `app.js`; GET `/styles.css` liefert `styles.css`. Die statische Modulauslieferung ist keine zusätzliche API-Route. Andere statische Pfade, `.env`, `.git`, Testdateien und Dokumentationen sind nicht freigegeben. `server-status.js`, `scripts/zentral-ctl.js`, `execution-bridge.js` und `execution-mock-adapter.js` sind serverseitige Node-Module und werden **nicht** statisch an den Browser ausgeliefert.

## Sicherheitsstatus

Alle GET-Routen sind read-only ausgerichtet. Nur die beiden Airtable-Test-/Vorschaurouten können bei vollständigen lokalen Zugangsdaten und ausdrücklicher Serverfreigabe eine externe HTTPS-GET-Anfrage auslösen. Die additiven POST-Routen der Execution Bridge (Phase C) schreiben ausschließlich lokal in App Support und – nach Jamal-Freigabe – in ein Fixture-Testrepository; Health bleibt Apply-gesperrt; kein Commit, Push oder Deployment. Keine Route darf extern schreiben.

## Bekannte Widersprüche

Einige Routennamen enthalten `start-action`, `workflow-result` oder `autonomy-applied`, obwohl die Implementierung ausdrücklich nur vorbereitende Status- und Vorschauausgaben erzeugt.

## Noch zu normalisieren

Exakte Query-Schemata und Antwortschemas sind nicht zentral typisiert.

## Entscheidung durch Jamal erforderlich

Ob später eine maschinenlesbare API-Spezifikation erstellt werden soll.
