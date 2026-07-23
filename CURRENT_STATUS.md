# CURRENT STATUS

## Git- und Versionsstand

- Version: **V6.45.0 – geführten Tageslauf als V1-Finish bündeln**
- Ausgangscommit der Zentrale: `5602cfa` (V6.44.1 Health-Verifizierungsstand synchronisieren)
- Branch: `main`
- Upstream: `origin/main` auf `5602cfa`, synchron
- V6.44.1-Abnahmestand: vollständig geprüft; der lokale V1-Betriebsstand enthält die synchronisierte Health-Momentaufnahme
- Verbindliche Aussage: **V1 lokal fertig und betriebsbereit**
- Einstiegspunkte: `README.md`, `V1_BETRIEBSHANDBUCH.md`

## V6.45.0 – aktueller Funktionsstand

- Projektmanager-Agent ist in Ergebniswunsch, Einsatzplan, Prüfkarten, Zusammenführung und kompaktem Arbeitsweg durchgehend Hauptverantwortlicher.
- QS-/Test-Agent bleibt über `approvalAgentId` separat für Qualitätsprüfung, Abnahmekriterien und Abschlussprüfung verantwortlich und übernimmt keine Führungsrolle.
- Ein normaler Health-Tageslauf wählt fünf Kernagenten: Projektmanager, Health-Kompass, Produkt, QS/Test und UI beziehungsweise Kommunikation.
- UI-Agent und Kommunikations-Agent werden nicht pauschal gleichzeitig ausgewählt.
- Explizite Risiko-Signale (Risiko, Risiken, Risiko-Prüfung, Risikobewertung, Risikocheck) wählen den Risiko-Agenten; Datenschutz allein nicht.
- Zusätzliche Risiko-, Sicherheits-, Dokumentations-, Technik-, Betriebs- oder Werkzeugrollen benötigen ein konkretes Signal im Ergebniswunsch; eine nachvollziehbar komplexere Aufgabe darf dadurch mehr als fünf Rollen erhalten.
- Darstellung trennt Kernagenten und Zusatzrollen; nicht ausgewählte Rollen bleiben „nicht benötigt“.
- Plugin-/Werkzeugprüfung zeigt „nicht benötigt“ ohne Agentenzuweisung oder weist den Plugin-/Tool-Radar-Agenten zu; keine Plugin-Ausführung, Installation oder Verbindung wird ausgelöst.
- „Prüfphase vorbereiten“ steht direkt oben im Arbeitsvorschlag mit kompakter Führung (Fokusprojekt, Ergebnis, Hauptverantwortlicher, Kernagenten, nächster Schritt, Sicherheitsgrenze). Der Hinweis nennt ausdrücklich: kein Agent gestartet, keine externe Aktion, nur interne Prüfkarten.
- Autonomie- und Sicherheitsgrenzen bleiben unverändert.
- Keine API-Änderung; `API_REGISTER.md` bleibt unverändert.
- Stand: lokaler uncommitteter Finish-Kandidat auf Basis von `5602cfa`.

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

- `local-data-backup.js` exportiert und importiert ausschließlich `ki-unternehmenszentrale-v1` und `ki-unternehmenszentrale-daily-work-runs-v1`.
- Export als JSON mit Formatversion, Zeitpunkt, Prüfinformation und Sicherheitshinweis.
- Import prüft vollständig vor jeder Änderung, zeigt Vorschau und erfordert Jamals ausdrückliche Bestätigung.
- Vor Import wird der bestehende lokale Zustand intern gesichert; bei Schreibfehlern erfolgt Rollback.
- Kein `localStorage.clear()`, kein pauschales Löschen, keine Überschreibung kanonischer Register.
- UI-Anbindung minimal im Tageslaufbereich unter „Lokale Datensicherung“.

## Architektur-Freeze

- Keine weiteren verschachtelten Vorbereitungskarten.
- Neue Kernfunktionen als eigenständige Module.
- `app.js` und `server.js` nicht unkontrolliert vergrößern.
- Agenten-Laufzeit und Plugins erst nach Datensicherung und Modularisierung.

## V6.40.3 – gesicherter Ausgangsstand (Historie)

- Ein gültiger V6.40.2-Agentenplan kann ausschließlich nach Jamals ausdrücklicher Freigabe in interne Arbeitskarten überführt werden.
- Arbeitskarten entstehen nur für ausgewählte Agenten und enthalten Rolle, Teilauftrag, Ergebnisziel, Prüfkriterium, Sicherheitsgrenze, Abhängigkeiten, Übergabe, Quelle, Status und manuelle Befundfelder.
- Kein Status behauptet echte Agentenarbeit. Sichtbar bleibt: „Die Agentenaufträge sind vorbereitet. Es wurde noch kein Agent ausgeführt.“
- Gespeicherte Abhängigkeiten steuern Grundlagen, parallele Prüfungen, QA und Orchestrator. QA wird erst nach notwendigen bestätigten Fachbefunden bereit; der Orchestrator erst nach erfasstem QA-Befund.
- Leere, fremde und doppelt bestätigte Befunde werden abgewiesen. Blocker und offene Punkte bleiben sichtbar; bestätigte Befunde werden nicht verdeckt überschrieben.
- QA, Gesamtbefund und Jamals Abschlussentscheidung werden ausschließlich manuell gespeichert. Genau ein nächster sicherer Schritt und eine einmalige Verlaufsübernahme sind abgesichert.
- Der bestehende localStorage-Schlüssel bleibt erhalten. Alte V6.40.1- und V6.40.2-Läufe bleiben ohne pauschale Migration lesbar.
- Keine neue Route oder Schreib-API; 17 Projekte, 25 Agenten, 41 GET-Routen und alle Ausführungsverbote bleiben erhalten.

## V6.40.2 – gesicherter Ausgangsstand

- Ein neuer kompakter Hauptarbeitsweg steht im Cockpit vor den historischen Detailkarten.
- Ein Tageslauf enthält genau ein bewusst gewähltes Fokusprojekt, ein großes Pflichtfeld für das gewünschte Ergebnis und eine optionale Verbotsgrenze.
- Die frühere normale Eingabe von Begründung, Abnahmekriterium, Jamal-Frage, Allowlist, Tests, Git-Regeln und Rückfallweg entfällt; diese Angaben werden nachvollziehbar abgeleitet.
- Acht Aufgabentypen werden erkannt: Agenten-/Einsatzplanung, Entwicklung/Codex, Design, Content, Recherche, Strategie/Entscheidung, Qualität/Prüfung und Plugin-/Werkzeugauswahl.
- `agent-registry.js` ist die gemeinsame kanonische Quelle für exakt 25 Hauptagenten in Server und Browser; es gibt keine zweite Agentenliste.
- Der Arbeitsvorschlag wählt projekt-, auftrags-, risiko- und umfangsbezogen nur benötigte Agenten und dokumentiert auch die Ausschlussregel.
- Je Agent werden kanonische ID, Auswahlgrund, Rolle, Teilauftrag, erwartetes Ergebnis, Prüfkriterium, Sicherheitsgrenze, Abhängigkeiten, Übergabe, Arbeitsmodus und Werkzeugprüfbedarf strukturiert gespeichert.
- Vorarbeiten, parallele Fachaufträge, wartende QA-Prüfung und abschließende Zusammenführung sind sichtbar getrennt.
- Der Integrations-Agent bewertet bei Bedarf Fähigkeit, Werkzeugkategorien, Kombinationen, Bearbeitbarkeit, Datenschutz, Kostenart, Skalierung, Freigabegrenze und Ersatzlösung. Canva ist nie automatisch die einzige Wahl.
- Der Health-Pilot berücksichtigt Projekt-/Demostand, Kernfluss, Fachgrenzen, Claims, Datenschutz/Consent, Design und Nutzertexte, Technik, Werkzeugwahl, QA und Projektwissen.
- Agenten- und Einsatzplanung bleibt ausdrücklich ohne Codex-/Repository-Auftrag; technische Arbeitsdetails stehen standardmäßig geschlossen unter „Technische Details anzeigen“.
- Die Vorlage wird nur als kopierbarer Text vorbereitet; es gibt keinen Codex-Aufruf und keinen Agentenstart.
- Jeder Statusübergang benötigt Jamals bewusste Bedienung.
- Tagesläufe werden getrennt unter `ki-unternehmenszentrale-daily-work-runs-v1` gespeichert.
- Der bestehende Managementspeicher `ki-unternehmenszentrale-v1` wird weder gelöscht noch pauschal migriert.
- Ein Projektverlauf wird erst nach bestätigtem Tagesabschluss und separater manueller Übernahme ergänzt; doppelte Einträge werden verhindert.
- Bei nicht verfügbarer Register-API erscheint der aktuelle technische Stand als `UNGEKLÄRT`; gespeicherte Momentaufnahmen dienen nicht als Ersatz.
- Keine neue API: weiterhin 41 GET-Routen, 404 für unbekannte Projekt-ID und 405 für andere Methoden.
- Browserabnahme V6.40.1 erfolgreich: neuer Lauf ohne Autofokus, manuelle Health-Auswahl, Ergebniswunsch und optionale Grenze, Agenten-/Einsatzplanung ohne Repository-Auftrag, geschlossene Technikdetails, Reload-Persistenz und fehlerfreie Konsole geprüft. Ein bestehender abgeschlossener V6.40.0-Lauf blieb vollständig lesbar.
- Browserabnahme V6.40.2 erfolgreich: Health-Pilottext vollständig verarbeitet; 13 von 25 Agenten fachlich begründet ausgewählt, Orchestrator eindeutig verantwortlich, Vorarbeiten/Parallelität/QA/Übergaben sichtbar, Integrations-Agent und verständliche Jamal-Frage vorhanden, technische Details geschlossen, Reload vollständig, Konsole fehlerfrei. Mobile Ansicht bei 390 × 844 ohne horizontalen Überlauf geprüft.

## Unveränderter V6.39.0-Registerstand

- `project-registry.js` ist die einzige kanonische technische Quelle für 17 Projekte mit stabilen IDs.
- Die sichtbaren Modi sind `DEMO`, `PLANUNG`, `REAL_VERIFIZIERT` und `UNGEKLÄRT`.
- Health Upgrade Kompass ist der erste technisch `REAL_VERIFIZIERT` geführte Pilot.
- Health-Pfad, Repository, Branch `main`, HEAD `28cdcf7`, Baseline-Commit `26f65fe` und Remote-Referenzen (`origin/main` `1f4f96d`, Baseline `28cdcf7`) sind als bestätigte Momentaufnahme vom 2026-07-19 dokumentiert.
- Health und Expansion bleiben fachlich getrennt; die technische Basis ist teilweise gemeinsam.
- Work bleibt technisch `UNGEKLÄRT`; Codex bleibt manuell kontrolliert.
- Manuelle Managementdaten werden weiter im Browser per `localStorage` gespeichert und getrennt von Kanondaten angezeigt.
- Keine autonome Produktivplattform, keine automatische externe Aktion, keine automatische Git-Aktion und keine Deploymentfreigabe.

## Hauptdateien

- `index.html` – Grundstruktur und Ansichten
- `app.js` – App-Shell, Zustandsintegration und Initialisierung des Tageslauf-UI-Moduls
- `server.js` – lokaler HTTP-Server, APIs und Geschäftslogik
- `project-registry.js` – kanonisches Register für exakt 17 Projekte
- `project-registry.test.js` – automatisierte Register-, API- und Persistenzgrenzen
- `agent-registry.js` – einziges kanonisches Register für 25 Hauptagenten und Rollen-Zuordnungen
- `daily-work-run.js` – Tageslaufmodell, Agentenauswahl und manuelle Statusübergänge
- `daily-work-run-ui.js` – Tageslauf-Rendering, Event-Bindings und Backup-UI-Anbindung
- `daily-work-run.test.js` – automatisierte Tageslauf-, Agenten-, Eingabe-, Speicher- und Sicherheitsprüfungen
- `daily-work-run-ui.test.js` – automatisierte Modulgrenzen-, Initialisierungs- und Integrationsprüfungen
- `local-data-backup.js` – Export, Import, Validierung und Rollback für lokale Browserdaten
- `local-data-backup.test.js` – automatisierte Datensicherungsprüfungen
- `styles.css` – Designsystem und Oberflächenregeln
- `package.json` – Start- und Syntaxprüfungen
- `package-lock.json` – Lockfile ohne installierte Paketabhängigkeiten

## Hauptmodule

Cockpit, Portfolio, Agenten, Projektaufnahme, Support, Qualität, Wissen/Archiv sowie Plugin-, Workflow-, Sicherheits- und Freigabestatus.

## Praktischer Nutzungsgrad

Die Zentrale ist als lokaler read-only Arbeits-, Entscheidungs- und Demo-Stand praktisch nutzbar. Health Upgrade Kompass ist als erstes Fokus- und Pilotprojekt in den Cockpitablauf eingebunden. Produktive Außenaktionen und autonome Arbeitsausführung sind nicht freigegeben.

## Tests

- `npm test` → **282 Prüfpunkte gesamt**: project-registry 20, daily-work-run 125, agent-runtime 56, local-data-backup 18, daily-work-run-ui 27, server-http-router 36
- `npm run check` prüft alle betroffenen JavaScript-Module syntaktisch
- `npm start` → `node server.js`
- manuelle lokale Browser- und GET-API-Prüfungen
- Airtable-Read-only-Prüfpfade mit separater Serverfreigabe

## Weiterhin fehlende Tests

Keine Coverage-, Lint-, HTML-/CSS- oder CI-Test-Suite ist im Bestand nachgewiesen. V6.40.3 ergänzt begrenzte Unit- und manuelle Browserprüfungen für Freigabe, Abhängigkeiten, Ergebnisrückführung, QA, Zusammenführung und Persistenz.

## Technische Risiken

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

Kein weiterer V1-Funktionsschritt. Health: nächsten tatsächlichen Preview-Blocker aus dem Kernfluss einzeln prüfen. Spätere Erweiterungen gehören zu **V2** und benötigen eine neue ausdrückliche Freigabe durch Jamal.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Commit und Push von V6.45.0 sowie jede spätere Deployment-, V2- oder Außenwirkungsentscheidung.
