# MIGRATION PLAN

## V6.46.0 – Health Hybrid End-to-End-Pilot (umgesetzt und abgenommen)

V6.46.0 bleibt speicherkompatibel (`schemaVersion: 1`). Neue Felder `executionPackage`, `releaseGates` und `externalExecutionEvidence` sind additiv; alte Tagesläufe ohne diese Felder bleiben lesbar. Neue GET-Route: `/api/projects/health-upgrade-kompass/live-status` (nur Health, nur Git-Read). Kein Testprozess und kein Git-Schreiben aus der Zentrale. Vorheriger gesicherter Ausgang: V6.45.2 / `fb9aa0d`. Externe Evidenz ist kein automatisch bestätigter Fachbefund; der frühere V6.46.0-WIP-Evidenz-Deadlock ist behoben, betroffene WIP-Läufe werden defensiv geheilt. Andere Projekte erhalten noch keinen Hybrid-Pfad.

| Bereich | Regel |
|---|---|
| health-repo-status.js | nur kanonischer Health-Pfad, realpath, feste Lese-Args |
| executionPackage | ID + Fingerprint; READY_TO_COPY nur bei sauberer Basis |
| Ergebnisrückführung | Vorschau → Jamal-Bestätigung → Evidenz, kein Auto-ACCEPTED |
| releaseGates | nur Entscheidungstexte, keine Ausführung |
| Verboten | Agentenstart, npm test aus Zentrale, Reset/Clean, stille Allowlist-Erweiterung |

Rückfall: uncommittete Änderungen kontrolliert einzeln zurücknehmen; Browserdaten nicht löschen und kein `git reset` verwenden. Browser-End-to-End-Abnahme bestanden.

## V6.45.2 – Runtime-Pilot und Zusammenführung entkoppeln (vorheriger gesicherter Stand `fb9aa0d`)

V6.45.2 ändert weder Speicherformat-Schlüssel noch API. Additive Trennung von `runtimePilotEvidence` und finaler Orchestrierung. Vorhandene Tagesläufe bleiben lesbar.

## V6.45.0 – V1-Finish-Sprint für den geführten Tageslauf (Historie)

V6.45.0 ändert weder Speicherformat noch API. Vorhandene Tagesläufe bleiben lesbar. Neue Arbeitsvorschläge führen `orchestrator-agent` sichtbar und fachlich als Projektmanager-Agent; `approvalAgentId` ist die einzige verbindliche Abnahmequelle und muss `quality-test-agent` sein. Anzeigename und Rolle werden aus der ID und dem kanonischen Register abgeleitet; widersprüchliche `approvalAgent`-Textfelder werden abgewiesen. Die Auswahl trennt `coreAgentIds` (höchstens fünf, eindeutige IDs) und `additionalAgentIds` (keine Überschneidung, exakte Mengenabdeckung von `selectedAgentIds`). UI- und Kommunikations-Agent werden XOR gewählt. Explizite Risiko-Signale wählen den Risiko-Agenten; Datenschutz allein nicht. Zusätzliche Rollen entstehen ausschließlich aus konkreten Ziel-, Risiko-, Daten-, Dokumentations-, Technik-, Kosten- oder Werkzeugsignalen.

`toolReview` ergänzt kompatibel `status` und `statusLabel`. Ohne Werkzeugbedarf gilt `NICHT_BENOETIGT` / „nicht benötigt“ ohne Agentenzuweisung; bei Bedarf bleibt `integration-agent` als Plugin-/Tool-Radar-Agent zuständig. Die Oberfläche zeigt nach Vorschlagserstellung oben die Hauptaktion „Prüfphase vorbereiten“ mit kompakter Führung. Es gibt keine automatische Migration bestehender localStorage-Daten und keine Plugin-, Agenten-, Codex-, Repository- oder externe Ausführung. Autonomie- und Sicherheitsgrenzen bleiben unverändert.

Rückfall: uncommittete Änderungen kontrolliert einzeln zurücknehmen; Browserdaten nicht löschen und kein `git reset` verwenden.

## V6.44.1 – Health-Verifizierungsstand synchronisieren

V6.44.1 führt kein neues Speicherformat, keine neue Route und keine neue Runtime ein. Ausgangscommit der Zentrale: `b2f618e`. Health-Momentaufnahme: vorher `bc98b5c`, jetzt `28cdcf7` (PR #1 / `8eadc46`).

| Bereich | Regel |
|---|---|
| project-registry.js | Health- und Expansion-Git-/Test-Momentaufnahme aktualisieren |
| Expansion | gemeinsame Referenzen sync; Portfolio-Modus PLANUNG unverändert |
| Verboten | Health-Repo ändern, Freigaben ableiten, neue API, Autonomie |

Rückfall: kontrolliert auf den gesicherten V6.44.0-Stand `b2f618e` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt: Health Preview-Blocker einzeln prüfen; kein V1-Funktionsschritt.

## V6.44.0 – Lokale V1 einfrieren und Betriebsmodus festlegen (Historie, gesichert `b2f618e`)

V6.44.0 führt kein neues Speicherformat, keinen neuen localStorage-Schlüssel, keine neue Route und keine neue Runtime ein. Ausgangscommit: `16bbf45` (V6.43.1 gesichert).

| Bereich | Regel |
|---|---|
| Dokumentation | `README.md`, `V1_BETRIEBSHANDBUCH.md`, Status auf V1-Betriebsfreeze |
| UI | kompakter V1-Betriebshinweis, Versionsanzeige V6.44.0 |
| Verboten | zweiter Executor, externe KI, Plugins, Schreib-API, Cloud, Autonomieerhöhung |

Rückfall: kontrolliert auf den gesicherten V6.43.1-Stand `16bbf45` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt nach V6.44.0: V6.44.1 Health-Verifizierungsstand synchronisieren (umgesetzt).

## V6.43.1 – Runtime-Pilot abnahmefest abschließen (Historie, gesichert `16bbf45`)

V6.43.1 führt kein neues Speicherformat, keinen neuen localStorage-Schlüssel und keinen zweiten Executor ein. V6.43.0 ist mit Commit `daa96e9` auf `origin/main` gesichert.

| Bereich | Regel |
|---|---|
| Dokumentation | Ist-Stand `daa96e9`, 241 Prüfpunkte, V1-Abschlussbewertung: lokal fertig und betriebsbereit |
| UI | Sichtbar „Projektmanager-Agent“; technische ID `orchestrator-agent` ergänzend |
| Verboten | neue Agenten-ID, zweiter Executor, Autonomieerhöhung, externe Ausführung |

Rückfall: kontrolliert auf den gesicherten V6.43.0-Stand `daa96e9` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt nach V6.43.1: V6.44.0 V1-Betriebsfreeze (umgesetzt).

## V6.43.0 – Agenten-Laufzeit-Pilot (Historie, gesichert `daa96e9`)

V6.43.0 führt kein neues Speicherformat und keinen neuen localStorage-Schlüssel ein. Runtime-Zustand wird additiv als `agentRuntimePilot` im bestehenden Tageslauf gespeichert. Alte Läufe ohne dieses Feld bleiben unverändert nutzbar; Backup und Restore übernehmen den Runtime-Zustand automatisch mit.

| Bereich | Regel |
|---|---|
| Runtime-Modul | Snapshot, Freigabe, Statusmaschine, Executor, Audit, Timeout, Abbruch |
| daily-work-run.js | Domäne, Prüfphase, bestehende Ergebnisrückführung inkl. Runtime-Akzeptanzpfad |
| daily-work-run-ui.js | Darstellung und Bedienung ohne kopierte Runtime-Geschäftslogik |
| Verboten | externe KI, Plugins, Netzwerk, Dateischreiben, automatische Ergebnisübernahme |

Rückfall: V6.43.0-Stand auf `daa96e9`; Tagesläufe ohne `agentRuntimePilot` bleiben lesbar.

Nächster Schritt nach V6.43.0: V6.43.1 Abnahmefestigung (umgesetzt).

## V6.42.1 – Server-Router modularisieren (Historie)

V6.42.1 führt keine neue Route, kein neues API-Verhalten und keine Schreibmöglichkeit ein. Die Extraktion verschiebt ausschließlich allgemeine HTTP-Verantwortung aus `server.js` nach `server-http-router.js`: Methodenprüfung, Pfadauswertung, statische Asset-Auslieferung, 404/405 und kontrollierte interne Fehlerantworten. Handler, Antwortdaten, Projektregister, Agentenregister und Plugin-Vorbereitungen bleiben in `server.js`.

| Bereich | Regel |
|---|---|
| Router-Modul | HTTP-Dispatch, MIME-Typen, statische Assets, 404/405, sichere Fehlergrenze |
| server.js | Serverstart, Handler, Route-Tabelle, Prefix-Handler für unbekannte Projekt-IDs |
| Verboten | zweite aktive Routerimplementierung, unkontrolliertes Dateisystem-Mapping, Geschäftslogik im Router |

Rückfall: uncommittete V6.42.1-Dateiänderungen kontrolliert verwerfen; API- und Browserverhalten bleibt auf V6.42.0 zurückführbar.

Nächster geplanter Schritt nach Jamals Abnahme: Agenten-Runtime-Pilot, ohne neue Vorbereitungskarte und ohne Autonomieerhöhung.

## V6.42.0 – Tageslauf-UI modularisieren

V6.42.0 führt kein neues Speicherformat ein und ändert weder `schemaVersion: 1` noch die beiden localStorage-Schlüssel. Die Extraktion verschiebt ausschließlich Präsentations- und Bedienlogik aus `app.js` nach `daily-work-run-ui.js`. Domänenlogik bleibt in `daily-work-run.js`, Datensicherungslogik in `local-data-backup.js`. Es gibt keine pauschale Migration, keine Normalisierung historischer V6.40.1-, V6.40.2-, V6.40.3- oder V6.41.0-Daten und keine Überschreibung kanonischer Register.

| Bereich | Regel |
|---|---|
| UI-Modul | Rendering, Events, Backup-Anbindung im Tageslaufbereich |
| app.js | nur `DailyWorkRunUi.init(...)`, `render()`-Aufrufe und View-Koordination |
| Verboten | parallele States, zweite Tageslauf-Implementierung, Geschäftslogik-Kopie |

Rückfall: uncommittete V6.42.0-Dateiänderungen kontrolliert verwerfen; Browserdaten bleiben unangetastet.

Nächster geplanter Schritt nach Jamals Abnahme: weitere kontrollierte Modularisierung aus `app.js`, ohne neue Vorbereitungskarte und ohne Autonomieerhöhung.

## V6.41.0 – lokale Datensicherung

V6.41.0 führt kein neues Speicherformat für Tagesläufe ein und ändert `schemaVersion: 1` nicht. Die Sicherung liest und schreibt ausschließlich die bestehenden Browser-Schlüssel `ki-unternehmenszentrale-v1` und `ki-unternehmenszentrale-daily-work-runs-v1`. Es gibt keine pauschale Migration, keine Normalisierung historischer V6.40.1-, V6.40.2- oder V6.40.3-Daten und keine Überschreibung kanonischer Projekt- oder Agentenregister.

| Bereich | Regel |
|---|---|
| Export | beide erlaubten Schlüssel, auch wenn leer |
| Import | vollständige Vorprüfung, Jamal-Freigabe, Rollback bei Schreibfehler |
| Verboten | `localStorage.clear()`, fremde Schlüssel, kanonische Registerdaten |

Rückfall: uncommittete V6.41.0-Dateiänderungen kontrolliert verwerfen; vorhandene Browserdaten bleiben unangetastet, solange kein bestätigter Import ausgeführt wurde.

## V6.40.3 – kontrollierte Agenten-Prüfphase

V6.40.3 behält `schemaVersion: 1` und `ki-unternehmenszentrale-daily-work-runs-v1`. Neue Läufe erhalten optional `agentReviewPhase` mit sicheren Unterstatus, internen Arbeitskarten, manuellen Befunden, QA, Orchestrator-Zusammenführung, Jamal-Entscheidung und einmaliger Verlaufsmarkierung. Es gibt keine pauschale Migration: Fehlt das Feld bei einem alten V6.40.1- oder V6.40.2-Lauf, wird nur zur Laufzeit ein leerer Status `NOT_APPROVED` dargestellt; der gespeicherte Altbestand wird nicht überschrieben.

Arbeitskarten kopieren ausschließlich die freigegebenen Strukturdaten des gespeicherten Agentenplans. Kanonische Projekt- und Agentenregister bleiben unverändert. Es gibt keine Datenlöschung, keine zweite Quelle, keine Schreib-API und keine automatische Ausführung. Rückfall: die uncommitteten V6.40.3-Dateiänderungen manuell prüfen oder kontrolliert verwerfen; localStorage bleibt unangetastet und `git reset` ist ausgeschlossen.

## V6.40.2 – kanonischer Agenten-Einsatzplan

Die bestehende interne 25-Agenten-Liste wird ohne Namens- oder ID-Erfindung aus `server.js` nach `agent-registry.js` als gemeinsame kanonische Quelle für Server und Browser überführt. Das ist eine Quellenkonsolidierung, keine zweite Agentenquelle. `project-registry.js` bleibt unverändert die einzige technische Projektquelle.

Bestehende Tagesläufe bleiben unter `ki-unternehmenszentrale-daily-work-runs-v1` lesbar. Neue V6.40.2-Läufe speichern zusätzlich strukturierte Agentenplanfelder wie `selectedAgentIds`, `leadAgentId`, Auswahlgrund, Teilauftrag, Ergebnis, Prüfkriterium, Grenze, Abhängigkeit, Übergabe, Arbeitsmodus und Werkzeugprüfbedarf. Es gibt keine pauschale Migration, Löschung oder automatische Ausführung. Alte `agentPlan`-Einträge ohne diese Felder werden unverändert erhalten und weiterhin defensiv dargestellt.

Rückfall: uncommittete V6.40.2-Dateiänderungen kontrolliert verwerfen oder manuell überarbeiten; keine localStorage-Löschung und kein `git reset`.

## V6.40.1 – vereinfachter Tagesstart

V6.40.1 verändert weder Projektregister noch API und löscht keine gespeicherten Tagesläufe. Bestehende V6.40.0-Läufe bleiben lesbar; neue Läufe ergänzen `workProposal` im selben getrennten Speicherschlüssel. Der normale Start verlangt nur Fokusprojekt und Ergebniswunsch, eine zusätzliche Verbotsgrenze bleibt optional. Technische Angaben werden im Lauf vorbelegt und standardmäßig geschlossen angezeigt. Es gibt keine automatische Migration, Löschung, Agenten- oder Codex-Ausführung.

Agenten- und Einsatzplanung setzt `repositoryWorkRequired: false`; sie bleibt ein vorbereitender Einsatzplan ohne Repository-Auftrag. Rückfall: den uncommitteten UI-/Modell-Patch verwerfen oder manuell überarbeiten, ohne Browserdaten zu löschen und ohne `git reset`.

## V6.40.0 – geführter Tagesarbeitslauf

V6.40.0 ergänzt keine Projektmigration und verändert das kanonische Register nicht. Der Versionsschritt führt lokale Arbeitsdaten in einem getrennten, versionierten Tageslaufmodell zusammen.

| Bereich | Quelle | Zielzustand | Migrationsregel |
|---|---|---|---|
| Kanonische Projekte | `GET /api/projects` aus `project-registry.js` | unveränderliche aktuelle Projekt-, Git- und Testwerte | niemals durch localStorage überschreiben |
| Bestehende Managementdaten | `ki-unternehmenszentrale-v1` | Projekte, Notizen, Entscheidungen und Verläufe bleiben erhalten | nicht löschen, nicht leeren, nicht pauschal migrieren |
| Neue Tagesläufe | `ki-unternehmenszentrale-daily-work-runs-v1` | genau ein Fokus, ein Ergebnis und ein nächster Schritt je Lauf | getrennt speichern; Statusübergänge nur manuell |
| Tagesstart-Momentaufnahme | Tageslauf `canonicalSnapshot` | historischer Nachweis des angezeigten Stands | nie als aktueller technischer Stand verwenden |
| Ergebnisrückführung | Tageslauf `resultReturn` | manuell dokumentiertes Ergebnis | keine automatische Projektänderung |
| Abschlussverlauf | bestehende lokale Projektakte | genau ein bestätigter Verlaufseintrag | erst nach Jamal-Bestätigung; Duplikat verhindern |

Health Upgrade Kompass ist der empfohlene erste technische Pilot, wird aber nicht automatisch ausgewählt. `REAL_VERIFIZIERT` bleibt eine technische Momentaufnahme und keine medizinische, fachliche oder rechtliche Freigabe.

Rückfall: Neue Ansicht und Modulauslieferung können später kontrolliert entfernt werden. Beide localStorage-Schlüssel bleiben unangetastet; kein automatisches Löschen und kein `git reset`.

## V6.39.0 – kanonische Migration

Das codebasierte Register `project-registry.js` führt jetzt alle **17 dokumentierten Projekte** mit stabilen IDs. Die Migration ist read-only gegenüber Servern und externen Systemen. Manuelle Browserdaten werden nicht gelöscht oder in technische Fakten umgedeutet.

| Nr. | Stabile ID | Modus | Verifizierter technischer Bezug | Nächster sicherer Schritt |
|---:|---|---|---|---|
| 1 | `ki-unternehmenszentrale` | `DEMO` | Pfad, Repository, `main`, HEAD und `origin/main` bestätigt | V6.39.0 manuell abnehmen |
| 2 | `health-upgrade-kompass` | `REAL_VERIFIZIERT` | vollständige technische Pilot-Momentaufnahme | Pilotakte manuell prüfen |
| 3 | `health-upgrade-karriere` | `PLANUNG` | ungeklärt | Quelle read-only erfassen |
| 4 | `expansion-app` | `PLANUNG` | technische Basis teilweise gemeinsam mit Health | eigenen Scope festlegen |
| 5 | `flowlingo-portugiesisch-sprachtrainer` | `PLANUNG` | ungeklärt | Identität und Quelle klären |
| 6 | `portugiesisch-sprechtrainer` | `UNGEKLÄRT` | ungeklärt | nicht automatisch zusammenführen |
| 7 | `spanisch-sprechtrainer` | `PLANUNG` | ungeklärt | Quelle und MVP-Stand prüfen |
| 8 | `marketing-agentur-os` | `PLANUNG` | ungeklärt | Ordner und Repository prüfen |
| 9 | `senior-designer-os` | `UNGEKLÄRT` | ungeklärt | Projektidentität bestätigen |
| 10 | `autopilot-light-system` | `PLANUNG` | ungeklärt | Projekt/Modul/Methode abgrenzen |
| 11 | `prowin-karriere` | `PLANUNG` | ungeklärt | Quellenbestand erfassen |
| 12 | `your-day-portugal-2-0` | `PLANUNG` | ungeklärt | Varianten abgrenzen |
| 13 | `your-day-mlm-praesentation` | `PLANUNG` | ungeklärt | Freigabeverantwortung klären |
| 14 | `jaco-eventplanung` | `PLANUNG` | Read-only-Pilot dokumentiert | Übergabe ohne Rohdaten erstellen |
| 15 | `jaco-gbr-webseite` | `UNGEKLÄRT` | ungeklärt | Existenz und Quelle bestätigen |
| 16 | `portugiesische-lda-gruendung` | `UNGEKLÄRT` | ungeklärt | Quellen und Fachprüfung benennen |
| 17 | `seminare-und-praesentationen` | `PLANUNG` | Materialien dokumentiert | Einzelprojekte inventarisieren |

Health und Expansion bleiben fachlich getrennt, obwohl ihre technische Basis derzeit teilweise gemeinsam ist. Work bleibt technisch `UNGEKLÄRT`; Codex bleibt manuell kontrolliert. Es gibt keine automatische externe Aktion, Git-Aktion, Agentenausführung oder Deploymentfreigabe.

## Historischer Migrationsplan vor V6.39.0

Die nachfolgende 14-Zeilen-Tabelle bleibt als Historie erhalten und ist nicht mehr die Zähl- oder Statusquelle.

## Ziel

Alle bisherigen Projekte werden schrittweise in der KI-Unternehmenszentrale sichtbar, dokumentiert und technisch verknüpft. Jede Migration bleibt zunächst read-only. Ein Eintrag in dieser Tabelle ist keine Freigabe für externe Aktionen oder produktive Integration.

Legende: `JA`, `NEIN`, `TEILWEISE`, `UNGEKLÄRT`.

| Reihenfolge | Projekt | Browserprojekt | lokaler Ordner | Git geprüft | Übergabe | Grundlagen | Registry | Work | Codex | Status | Nächster Schritt |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | KI-Unternehmenszentrale | JA | JA | JA | TEILWEISE | JA | JA | NEIN | JA | V6.38.4 gesichert; technische Bestandsaufnahme abgeschlossen; zentrale Dokumentation erstellt; Qualitätskorrektur in Bearbeitung; noch nicht in Work übernommen | Jamals Dokumentationsprüfung |
| 2 | Health Upgrade Kompass | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; erstes Pilotprojekt | Ordner und Repository read-only prüfen |
| 3 | Expansion App | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Projektübergabe erfassen |
| 4 | FlowLingo | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Namensvarianten offen | Identität und Ordner klären |
| 5 | Marketing Agentur OS | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Ordner/Repository prüfen |
| 6 | Senior Designer OS | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; Projektidentität ungeklärt | Jamal bestätigt Projekt und Quelle |
| 7 | Health Upgrade Karriere | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | Übergabe erstellen |
| 8 | proWIN Karriere | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | Quellenbestand erfassen |
| 9 | JACO GbR Webseite | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; nicht mit Eventplanung gleichgesetzt | Projektidentität prüfen |
| 10 | Spanisch-Sprechtrainer | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | MVP- und Repository-Stand prüfen |
| 11 | Autopilot-Light-System | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Projekt/Modul/Methode ungeklärt | verbindliche Einordnung festlegen |
| 12 | Your Day / Portugal 2.0 | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Varianten und Verantwortungen klären |
| 13 | portugiesische Lda-Gründung | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; kein belastbarer Bestand | Quellen durch Jamal benennen |
| 14 | Seminare und Präsentationen | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Materialien vorhanden, kein Gesamtprojekt | Einzelprojekte inventarisieren |

## Migrationsregeln

1. Zuerst Browser-/Quellprojekt und Eigentümerschaft bestätigen.
2. Lokalen Ordner ausschließlich read-only finden und Git-Stand prüfen.
3. Übergabe mit Zweck, Status, Risiken und Nicht-Zielen erstellen.
4. Projektgrundlagen und Namensvarianten dokumentieren.
5. Registereintrag durch Jamal bestätigen.
6. Erst danach in Work aufnehmen und gezielt in Codex öffnen.
7. Technische Verknüpfung benötigt einen separaten Auftrag und Freigabe.

## Bekannte Widersprüche

Browserprojekt, Work und Codex sind nicht als einheitliche technische Statusquellen im Repository nachgewiesen. JACO Eventplanung und JACO GbR Webseite bleiben getrennt. FlowLingo-Varianten bleiben sichtbar.

## Noch zu normalisieren

Statusdefinitionen, Übergabeformat, Pfadnachweise und Repository-Zuordnung.

## Entscheidung durch Jamal erforderlich

Jede Projektidentität, Reihenfolgeänderung und technische Verknüpfung.
