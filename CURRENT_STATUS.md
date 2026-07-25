# CURRENT STATUS

## Git- und Versionsstand

- Vorheriger gesicherter Ausgangsstand: **V6.46.0** / Commit **`e611c9c`** (Health Hybrid End-to-End-Pilot)
- **V7.0 Phase A – Guided Work Foundation:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`4a74ebe`** auf `origin/main`
- **V7.0 Phase B – Betriebsstabilität:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`3487a84`** auf `origin/main`
- **V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`0858b4e`** auf `origin/main`
- **V7.0 Phase D – Codex als kontrollierten Executor anbinden:** umgesetzt, getestet, echter Codex-Fixture-Pilot bestanden und gesichert mit Commit **`6553452`** auf `origin/main`
- **V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat:** technisch umgesetzt und getestet; **Umsetzungskandidat, noch nicht committed**
- Branch: `main`
- Verbindliche Aussage: Phase A bis D sind gesichert; Phase E ist technisch fertig, aber erst nach separater Commit-Freigabe verbindlich; ein read-only **V7.0-Freeze-Status** (`GET /api/v7-freeze-status`) zeigt technisch `FREEZE_CANDIDATE` erst dann, wenn der lokale Git-Stand exakt dem zuletzt gesicherten Commit entspricht und der Working Tree sauber ist – Cursor setzt nie `FROZEN`, das bleibt ausschließlich Jamals Entscheidung. **V7.0 insgesamt ist damit weiterhin nicht abgeschlossen** – Phase V7.1 ist nicht begonnen
- Einstiegspunkte: `README.md`, `V1_BETRIEBSHANDBUCH.md`

## V7.0 Phase A – Guided Work Foundation (umgesetzt und abgenommen)

- Neuer Tageslauf: `schemaVersion: 2`; v1-Läufe bleiben unverändert lesbar im selben Store
- Module: `guided-work.js` (Domäne), `guided-work-ui.js` (Hauptarbeitsraum); `daily-work-run.js` / `health-hybrid-work.js` bleiben kanonisch
- Geführter Hauptarbeitsraum: „Oben arbeiten. Unten nachschauen.“
- Deterministische, quellenbasierte Arbeitsvorschläge (kein Auto-Start)
- Editierbares Agententeam und `responsibleAgentId` vor Paketfreigabe; Invalidierung + Re-Fingerprint
- Known-dirty-Baseline für Health (read-only Live inkl. relative Pfade/Hashes, keine Dateiinhalte)
- Evidenz-Prefill für Fachbefund/QA/PM als Entwurf, nie als Bestätigung
- V6.46.0-Hybrid-Fallback vollständig erhalten; Roh-JSON standardmäßig geschlossen
- Backup-Schutz bleibt aktiv: Secret-Heuristik unverändert scharf; einzig der bestätigte False Positive bei bloßer `.env`/`.env.local`-Pfadnennung (z. B. in `forbiddenPaths`) wurde gezielt korrigiert, ohne die Erkennung realer Zugangsdaten zu schwächen
- Bekannter, bewusst offener Bedienpunkt: Für `acknowledgeV2Overwrite` (Schutz gegen stilles Überschreiben lokaler v2-Läufe durch einen reinen v1-Import) gibt es noch keine UI-Freigabesteuerung; der sichere Standard („nicht überschreiben“) bleibt dadurch aktiv, ein bewusster Override ist aktuell nur außerhalb der UI möglich
- 322 automatisierte Prüfpunkte grün; vollständige Browser-Abnahme inkl. Mobile 390×844 ohne horizontalen Überlauf bestanden
- **Nicht enthalten – weiterhin offen für spätere Phasen (siehe Phase C/D/E unten):** Codex-/Agentenstart, produktive Repository-Arbeit, Health-Schreiben, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat (technisch umgesetzt, Umsetzungskandidat vor Commit)

- Ziel war kein neuer Executor, sondern der Nachweis, dass der gesamte V7.0-Ablauf (Fokus → Vorschlag → Team → Baseline → Paket → isolierte Ausführung/Hybrid-Rückführung → Abschluss) stimmig, ehrlich und wiederholbar ist; nur echte Lücken wurden geschlossen
- Neues read-only Modul `v7-freeze-status.js` + Route `GET /api/v7-freeze-status`: Statusmodell `IN_REVIEW | FREEZE_CANDIDATE | FROZEN`, abgeleitet aus Phasenhistorie, aktuellem Git-Commit/Working-Tree und dem zuletzt gemessenen Testlauf; `FROZEN` wird durch dieses Modul **niemals** gesetzt – ausschließlich Jamals separate Entscheidung
- Neue, eingeklappte Freeze-Status-Karte im Guided-Work-Hauptarbeitsraum („unten nachschauen“); keine konkurrierende Primäraktion, kein Button, der den Status verändert
- Sticky-Kopfbereich um „Wer arbeitet daran“ und „Tatsächlich ausgeführt / Evidenz“ ergänzt (liest ausschließlich bereits vorhandene, sicher gefilterte Felder – kein neues Datenmodell)
- Tagesabschluss zeigt jetzt explizit „Ergebnis erreicht/nicht erreicht“, verantwortlichen Agenten und Ausführungs-/Evidenzstand
- Veraltete Oberflächenaussage korrigiert: Der Startkarten-Text behauptete fälschlich „Keine Execution Bridge“, obwohl Mock- und Codex-Fixture-Ausführung seit Phase C/D bereits existieren (Health bleibt davon unberührt: weiterhin read-only, Codex-/Apply-Start für Health bleiben hart blockiert)
- Audit bestätigt: Reload startet nie automatisch einen Attempt neu (Recovery-Fall statt Auto-Resume); `CANCELLED` ist terminal ohne Folgeübergänge; Backup/Restore bleibt vollständig auf `localStorage` beschränkt und startet nie einen Executor
- 47. GET-Route additiv (`/api/v7-freeze-status`); weiterhin keine neue Schreib-Route, keine neue Autonomieerhöhung
- **Nicht enthalten – weiterhin offen für Phase V7.1:** Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte

## V7.0 Phase D – Codex als kontrollierten Executor anbinden (umgesetzt, getestet, gesichert mit Commit `6553452`)

- Neues Modul `execution-codex-adapter.js`; Codex läuft ausschließlich isoliert, mit `--ask-for-approval never`, gegen das Execution-Bridge-Fixture-Repository – niemals gegen Health oder die Zentrale
- Codex-Start für das Health-Projekt ist serverseitig hart blockiert (Codex-Ausführung und Apply bleiben für Health verboten)
- Erweiterte Executor-Registry (`GET /api/execution/executors`) weist Mock und Codex mit Verfügbarkeit/Autorisierung aus; genau ein primärer Button je Zustand in der UI
- Echter Codex-Fixture-Pilot bestanden: Timeout auf `150000ms` korrigiert (`DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS`), Prozessführung auf `spawn()` mit `stdio: ["ignore","pipe","pipe"]` umgestellt (behebt reales Hängenbleiben von `execFile` bei offenem stdin)
- **Nicht enthalten – weiterhin offen für Phase E:** Health-E2E-Gesamtaudit, Freeze-Status, produktive Codex-/Apply-Freigabe für Health, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor (umgesetzt, getestet und browserseitig abgenommen, gesichert mit Commit `0858b4e`)

- Eigenständige Module `execution-bridge.js` und `execution-mock-adapter.js`; Tageslauf-, Hybrid- und Guided-Work-Module bleiben kanonisch
- Isolierter Workspace ausschließlich unter `~/Library/Application Support/KI-Unternehmenszentrale/workspaces/` – außerhalb Zentrale und Health
- Deterministischer Mock-Executor (keine KI, kein Netzwerk, kein `shell: true`); klar gekennzeichnet: „Deterministischer Mock-Executor – technische Sicherheitsprüfung, keine KI-Ausführung.“
- Attempt-Statusmaschine: `PREPARED | APPROVED | QUEUED | RUNNING | SUCCEEDED | FAILED | BLOCKED | CANCELLED | TIMED_OUT`
- Apply-Statusmaschine getrennt: `NOT_REQUESTED | APPLY_REVIEW | APPLY_APPROVED | APPLIED | APPLY_DECLINED | APPLY_FAILED | STALE`
- Apply nur gegen Fixture-Repository; Health-Apply in Phase C hart blockiert; Apply ist kein Commit, kein Push, kein Deployment
- Additive localhost-Routen: POST prepare/start/cancel/apply, GET status/result; One-Time-Token nur im Server-RAM; Host-/Origin-/Content-Type-/Bodygrößenprüfung; keine CORS-Öffnung
- Locks, Attempts, Audit und Workspaces außerhalb der Repositories; Phase-B-Controller und Serverstatus bleiben erhalten
- **Nicht enthalten – weiterhin offen für Phase D und Phase E:** Codex-/Cursor-Agentenstart, KI-Ausführung, produktive Health-Apply-Freigabe, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase B – Betriebsstabilität (umgesetzt, getestet und browserseitig abgenommen, gesichert mit Commit `3487a84`)

- Separater lokaler Controller `scripts/zentral-ctl.js` (nicht Teil des laufenden App-Servers) mit `status`, `start`, `stop`, `restart`; npm-Skripte `central:start`, `central:status`, `central:stop`, `central:restart`; `npm start` bleibt einfacher manueller Fallback
- Sicherheitsregeln: verwaltet ausschließlich selbst gestartete Prozesse; beendet nie einen fremden Prozess nur wegen Portbelegung; prüft PID-Existenz, erwartete Node-Anwendung, Projektpfad-Fingerprint und Startnachweis vor `stop`/`restart`; erkennt stale Statusdateien; SIGTERM mit Timeout, kein automatisches `kill -9`; feste argv-Arrays, kein `shell: true`
- App-Support-Verzeichnis `~/Library/Application Support/KI-Unternehmenszentrale/server/` außerhalb beider Repositories; atomare Statusdatei (tmp + rename), Größenbegrenzung, keine Secrets/Env/Browserdaten/Prompts
- Neues Domänenmodul `server-status.js`: unveränderliche Start-Momentaufnahme (App-Version, Git-Commit, Startzeit, Port), Statusmodell `RUNNING | STOPPED | STALE | PORT_CONFLICT | VERSION_MISMATCH | UNKNOWN`, `UNKNOWN` statt erfundener Versionsaussage bei nicht lesbarem Git-Stand
- Neue read-only Route `GET /api/server-status` (Route 43 von 43); andere Methoden bleiben 405; keine vollständigen Pfade, keine Secrets, `writeOperationsBlocked: true`, `madeExternalRequest: false`
- Kompakte Statusanzeige im Guided Work Surface (Port, Version, kurzer Commit, Startzeit, Status); technische Details (PID, vollständiger Commit, Controllerdetails) standardmäßig geschlossen; genau ein sicherer nächster Schritt bei Problemen; **kein** Start-/Stop-/Restart-Button im Browser
- Portstrategie: Standard `4173`, kein automatischer Portwechsel, Konflikt wird klar gemeldet, alternativer Port nur explizit über `--port`
- 32 neue automatisierte Prüfpunkte (`server-status.test.js`: 18, `zentral-ctl.test.js`: 14) plus erweiterte Prüfpunkte in `server-http-router.test.js`, `guided-work.test.js`, `daily-work-run.test.js`, `agent-runtime.test.js`; gesamt **384 automatisierte Prüfpunkte grün** (`npm test`, Exit-Code 0)
- Vollständige Browser-Abnahme bestanden: realer Controller-Lifecycle (`start`/`status`/`restart`/`stop`) gegen einen tatsächlich laufenden Server, echter Portkonflikt auf 4173 gegen einen fremden, unveränderten Prozess ohne Kill, Statusanzeige inkl. Reload-Persistenz, Mobile 390×844 ohne horizontalen Überlauf, Phase-A-Hauptfluss weiterhin vollständig nutzbar
- **Nicht enthalten – weiterhin offen für Phase D und Phase E:** Codex-/Cursor-Agentenstart, produktive Repository-Arbeit, Health-Schreibaktion, automatisches Commit/Push/Deployment, Autonomieerhöhung

## V6.46.0 – vorheriger gesicherter Ausgangsstand

- Hybrid-Pilot nur für **Health Upgrade Kompass**
- Die Unternehmenszentrale liest den lokalen Health-Repository-Status ausschließlich read-only (Branch, HEAD, Working-Tree)
- Cursor/Codex arbeitet weiterhin außerhalb der Unternehmenszentrale
- Die Zentrale startet keinen Cursor-, Codex-, KI-, Test- oder Git-Schreibprozess
- Identitätsgesichertes Auftrags-/Grenzpaket; strukturierte Rückführung als `externalExecutionEvidence`
- Externe Evidenz ist kein automatisch bestätigter Fachbefund
- QA, Projektmanager-Zusammenführung und Jamals Abschlussentscheidung bleiben getrennt
- Commit-, Push-, Deployment- und Außenwirkungs-Gates sind ausschließlich Entscheidungen und führen nichts aus
- Der V6.46.0-Evidenz-Deadlock ist behoben; bestehende betroffene WIP-Läufe werden defensiv geheilt
- Andere Projekte erhalten noch keinen Health-Live- oder Ausführungspaketpfad
- Vollständige Browser-End-to-End-Abnahme bestanden; gesichert mit Commit `e611c9c`

## V6.45.2 – vorheriger gesicherter Ausgangsstand

- Runtime-Pilot-Annahme und finale Projektmanager-Zusammenführung sind entkoppelt
- `runtimePilotEvidence` speichert die Pilotübernahme getrennt vom Orchestrierungsstatus
- Lead-Arbeitskarte wird durch Pilotannahme nicht mehr stillschweigend als finale Zusammenführung markiert
- Gesichert mit Commit `fb9aa0d` auf `origin/main`

## V6.45.0 – vorheriger Funktionsstand (Historie)

- Projektmanager-Agent führt durchgehend; QS-/Test-Agent bleibt über `approvalAgentId` separat
- Normale Health-Tagesläufe mit höchstens fünf Kernagenten plus begründeten Zusatzrollen
- „Prüfphase vorbereiten“ als primäre Aktion nach Vorschlagserstellung
- Autonomie- und Sicherheitsgrenzen unverändert

## V6.44.1 – vorheriger Funktionsstand

- Reine Synchronisierung der kanonischen technischen Health-Momentaufnahme; keine neue Produktfunktion.
- Health vorher: `bc98b5c` → jetzt: `28cdcf7` (PR #1 gemergt, Arbeitscommit `8eadc46`).
- Health Remote-Baseline `baseline/private-health-expansion-2026-07-11`: `28cdcf7`; `origin/main` bewusst `1f4f96d`.
- Health Tests/Build grün inkl. Preview-Demodaten und Check-Datum; Verifizierung `2026-07-19`.
- Expansion teilt die gemeinsamen technischen Git-Referenzen, bleibt **PLANUNG** ohne fachliche/regulatorische Freigabe.
- Keine neue Route, kein neuer Speicher, keine Runtime-Änderung, keine Autonomieerhöhung, keine Außenwirkung.
- Keine medizinische, fachliche, rechtliche oder regulatorische Freigabe.

## V6.44.0 – gesicherter Ausgangsstand (Historie)

- V1-Betriebsfreeze ohne neue Produktfunktion, ohne neue Runtime und ohne Autonomieerhöhung.
- `README.md` und `V1_BETRIEBSHANDBUCH.md` sind die verbindlichen Einstiegspunkte für Start, Backup, Sicherheitsgrenzen und Fehlerfall.
- Kompakter V1-Betriebshinweis in der Oberfläche: lokal fertig, Betrieb auf diesem Mac, Daten im Browser, Außenwirkung blockiert, nächster Schritt klar.
- Gesichert mit Commit `b2f618e` auf `origin/main`.

## V6.43.1 – gesicherter Ausgangsstand (Historie)

- V6.43.0 ist committed und gepusht; V6.43.1 schließt Dokumentation, Agentenbezeichnung und Abnahme ohne neue Ausführung ab.
- Runtime-Infrastruktur in `agent-runtime.js`; Tests in `agent-runtime.test.js`.
- Pilot-Agent: sichtbar **Projektmanager-Agent**; kanonische technische ID **`orchestrator-agent`** (über `ROLE_NAME_MAPPING`, keine neue ID).
- Runtime-Pilot nur für **Health Upgrade Kompass** mit vorbereiteter Agenten-Prüfphase und Projektmanager-Arbeitskarte.
- Erster Executor: `LOCAL_DETERMINISTIC_PILOT` – keine externe KI, kein Plugin, kein Netzwerk, kein Dateischreiben.
- Jamal-Freigabe vor Start; separate Jamal-Annahme vor Ergebnisübernahme; kein automatischer weiterer Executor.
- Persistenz additiv unter `agentRuntimePilot` im bestehenden Tageslauf (`schemaVersion: 1`, Schlüssel `ki-unternehmenszentrale-daily-work-runs-v1`).
- Gesichert mit Commit `16bbf45` auf `origin/main`.

## V6.43.0 – gesicherter Ausgangsstand (Historie)

- `agent-runtime.js` implementiert Snapshot, Fingerprint, Jamal-Freigabe, Statusmaschine, lokalen deterministischen Pilot-Executor, Timeout, Abbruch, Audit und Ergebnisprüfung.
- UI-Integration zurückhaltend in der bestehenden Agenten-Prüfphase; separater Start, keine automatische Ergebnisübernahme.
- Gesichert mit Commit `daa96e9` auf `origin/main`.

## V6.42.1 – gesicherter Ausgangsstand (Historie)

- `server-http-router.js` enthält HTTP-Dispatch, Methodenprüfung, statische Asset-Auslieferung, 404/405 und kontrollierte interne Fehlergrenzen.
- `server.js` bleibt für Serverstart, Konfiguration, Handler, Antwortdaten und die explizite Übergabe von `getRoutes`, `routePrefixHandlers` und `staticAssets` zuständig.
- `project-registry.js` bleibt kanonische Projektquelle; `agent-registry.js` bleibt kanonische Agentenquelle.
- Keine neue Produktfunktion, keine Verhaltensänderung, keine neue Route, keine Schreib-API.
- 17 Projekte, 25 Agenten, 41 GET-Routen, 8 freigegebene statische Pfade und alle Ausführungsverbote bleiben erhalten.
- Nächster geplanter Schritt nach V6.43.0: Runtime-Pilot abnahmefest abschließen (V6.43.1).

## V6.42.0 – gesicherter Ausgangsstand (Historie)

- `daily-work-run-ui.js` enthält die komplette Tageslauf-Präsentations- und Bedienlogik aus dem bisherigen `app.js`-Monolithen.
- `app.js` initialisiert das UI-Modul über `DailyWorkRunUi.init(...)` und ruft `DailyWorkRunUi.render()` aus `renderAll()` sowie nach Register-Refresh auf.
- `daily-work-run.js` bleibt Domänen- und Persistenzmodul; `local-data-backup.js` bleibt Datensicherungsmodul.
- Keine neue Produktfunktion, keine Verhaltensänderung, keine neue Vorbereitungskarte, keine Migration.
- Script-Reihenfolge: `agent-registry.js` → `daily-work-run.js` → `local-data-backup.js` → `daily-work-run-ui.js` → `app.js`.
- 17 Projekte, 25 Agenten, 41 GET-Routen, beide localStorage-Schlüssel und alle Ausführungsverbote bleiben erhalten.

## V6.41.0 – gesicherter Ausgangsstand

Siehe ältere Statusdokumentation und Git-Historie für Detailstände vor dem UI-Modul-Split.

## Bekannte technische Altlasten

- sehr große Monolithen: `app.js`, `server.js` und `styles.css` (Tageslauf-UI seit V6.42.0 ausgelagert)
- historische Register-, Status- und Sicherheitsstrukturen bleiben in Frontend und Server sichtbar; technische Projektverifizierung stammt ausschließlich aus `project-registry.js`
- zahlreiche historische Versionsschichten im laufenden Code
- uneinheitliche Agenten- und Projektnamen
- fehlende zentrale Daten- und API-Spezifikation vor dieser Dokumentation
- reale HTTPS-Fähigkeit einzelner Airtable-Read-only-Pfade bei gesetzter Freigabe

## Bekannte Versionswidersprüche

- Neuer Tageslaufstand V6.40.3, historische Cockpit- und Modulkennzeichnungen teilweise V6.38.x oder älter.
- Zwei Commits tragen V6.37.0; V6.37.2 erscheint in der Historie vor V6.37.1.
- Viele historische V4.x-, V5.x- und V6.x-Bezeichnungen bleiben parallel sichtbar.

## Genau ein empfohlener nächster Produktentwicklungsschritt

Jamals Commit-/Push-Freigabe für V7.0 Phase E einholen (inkl. manueller Safari-Abschlussprüfung); danach ist V7.0 technisch ein Freeze-Kandidat. Der geplante Pfad nach V7.0 (nur Reihenfolge, keine Umsetzung ohne separate Freigabe): Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte. Keine Deployment-, V2- oder Außenwirkungsentscheidung aus diesem Stand ableiten.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Jede spätere Deployment-, V2- oder Außenwirkungsentscheidung sowie jede Ausweitung des Hybrid-Pfads auf andere Projekte.
