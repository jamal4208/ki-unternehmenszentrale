# CURRENT STATUS

## Git- und Versionsstand

- Version: **V6.46.0 – Health Hybrid End-to-End-Pilot**
- Gesicherter vorheriger Ausgangsstand: **V6.45.2** / Commit **`fb9aa0d`** (Runtime-Pilot und Zusammenführung entkoppeln)
- Branch: `main`
- Verbindliche Aussage: **V1 lokal fertig und betriebsbereit**; V6.46.0 ist umgesetzt und vollständig browserseitig abgenommen
- Einstiegspunkte: `README.md`, `V1_BETRIEBSHANDBUCH.md`

## V6.46.0 – umgesetzt und abgenommen

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
- Vollständige Browser-End-to-End-Abnahme bestanden; `npm run check` / `npm test` / `git diff --check` grün vor Commit

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

Kein Hybrid-Ausbau für weitere Projekte. Nächste Schritte nur nach Jamals ausdrücklicher Freigabe; keine Deployment-, V2- oder Außenwirkungsentscheidung aus diesem Stand ableiten.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Jede spätere Deployment-, V2- oder Außenwirkungsentscheidung sowie jede Ausweitung des Hybrid-Pfads auf andere Projekte.
