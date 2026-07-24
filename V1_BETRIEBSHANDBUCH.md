# V1-Betriebshandbuch – KI-Unternehmenszentrale

## 1. Verbindlicher V1-Stand

- **Aussage:** V1 lokal fertig und betriebsbereit
- **Aktuelle Arbeitsversion:** **V7.0 Phase A – Guided Work Foundation** (umgesetzt, getestet, browserseitig abgenommen, gesichert mit Commit `4a74ebe`); **V7.0 Phase B – Betriebsstabilität** ist umgesetzt, getestet, browserseitig abgenommen und mit diesem Commit auf `origin/main` gesichert; V7.0 insgesamt noch nicht abgeschlossen, Phase C bis Phase E offen; vorheriger gesicherter Stand **V6.46.0** / `e611c9c`
- **Gesicherter vorheriger Ausgangsstand:** **V6.45.2** / Commit **`fb9aa0d`**
- **Historischer Freeze-Ausgang:** `16bbf45` (V6.43.1) – nur Historie
- **Branch:** `main`
- **Hybrid-Grenzen:** Health-Live-Status nur read-only; Cursor/Codex außerhalb; keine Test-/Git-Schreibprozesse aus der Zentrale; externe Evidenz kein Auto-Fachbefund; Gates nur Entscheidungen
- **Einstiegspunkte:** `README.md` (kurz) und dieses Handbuch (ausführlich)
- **Betrieb:** lokal auf diesem Mac, Daten im Browser, Außenwirkung blockiert

## 2. Was die Zentrale heute kann

- Tagesstart mit Fokusprojekt und Ergebniswunsch
- 17 kanonische Projekte und 25 kanonische Agenten anzeigen und nutzen
- Agenten-Einsatzplan und kontrollierte Agenten-Prüfphase führen
- Lokale Datensicherung exportieren und nach Bestätigung wiederherstellen
- Modularisierte Kernbereiche (Tageslauf, Backup, Runtime, Router) nutzen
- Lokalen deterministischen Runtime-Piloten für Health Upgrade Kompass bedienen
- Manuelle Freigabe, Ergebnisannahme, Audit, Reload-Persistenz
- Serverstatus (Port, Version, Commit, Startzeit, Status) kompakt in der Oberfläche anzeigen und den lokalen Betrieb über den separaten Controller `scripts/zentral-ctl.js` verständlich starten/stoppen/neustarten (V7.0 Phase B)

## 3. Was die Zentrale bewusst noch nicht kann

- Zweiten Executor oder externe KI-Agenten ausführen
- Produktive Plugins oder Schreib-APIs betreiben
- Automatisches Git, Deployment oder Cloud-Synchronisation
- Mehrbenutzerbetrieb
- Autonome Geschäftsentscheidungen treffen

## 4. Voraussetzungen auf dem Arbeits-Mac

- Node.js für `npm start` / `npm test`
- Projektordner: `/Users/jamal/Documents/New project/ki-unternehmenszentrale`
- Browser (Safari empfohlen) für `http://127.0.0.1:4173/`
- Kein Cloud-Login erforderlich

## 5. Startanleitung

**Empfohlen (Controller, seit Phase B):**

1. Terminal öffnen
2. `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. `npm run central:status` – zeigt, ob bereits ein von der Zentrale verwalteter Server läuft, bevor irgendetwas gestartet wird
4. `npm run central:start`
5. Safari: `http://127.0.0.1:4173/`

**Einfacher Fallback (weiterhin gültig, unverändert):**

1. Terminal öffnen
2. `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. `npm start`
4. Safari: `http://127.0.0.1:4173/`

Der Controller (`scripts/zentral-ctl.js`) ist ein separates lokales Werkzeug und kein Bestandteil des App-Servers selbst; `npm start` bleibt vollständig unverändert nutzbar, ohne Controller-Metadaten zu erzeugen.

## 6. Beenden des Servers

- Bei Start über den Controller: `npm run central:stop` (sendet `SIGTERM`, beendet ausschließlich den zuvor selbst gestarteten Prozess, nie einen fremden Prozess)
- Bei Start über `npm start`: im Server-Terminal **Ctrl + C**
- Keinen parallelen Server auf demselben Port belassen

## 7. Umgang mit Port 4173 und EADDRINUSE

- Standardport: **4173**
- Zuerst `npm run central:status` ausführen – zeigt Status (`RUNNING`, `STOPPED`, `STALE`, `PORT_CONFLICT`, `VERSION_MISMATCH`, `UNKNOWN`), Port, PID, Version, Commit, Startzeit und genau einen sicheren nächsten Schritt
- Bei `PORT_CONFLICT`: der Controller stellt nur fest, dass der Port belegt ist, und **beendet niemals automatisch einen fremden Prozess** – **keinen zweiten Server starten**
- Bei `STALE`: die gespeicherte Statusdatei verweist auf einen nicht mehr laufenden Prozess; der Controller erkennt dies sicher und räumt sie kontrolliert auf, ohne einen echten Prozess zu beenden
- Bei `VERSION_MISMATCH`: ein laufender Server entspricht nicht dem aktuellen Projektstand; empfohlener nächster Schritt ist `npm run central:restart`
- Nur bei Bedarf und nach Prüfung: den bestehenden, tatsächlich eigenen Prozess beenden und einmal neu starten
- Alternativer Port nur ausdrücklich über `npm run central:start -- --port <Portnummer>`; kein automatischer Portwechsel

## 7a. Lokaler Controller `scripts/zentral-ctl.js` (V7.0 Phase B)

- Befehle: `npm run central:status`, `npm run central:start`, `npm run central:stop`, `npm run central:restart`
- Speichert ausschließlich technische Betriebsmetadaten (PID, Port, Startzeit, Projektpfad-Fingerprint, App-Version, Commit bei Start, Controller-Schema-Version) unter `~/Library/Application Support/KI-Unternehmenszentrale/server/` – außerhalb dieses und des Health-Repositories
- Verwaltet ausschließlich selbst gestartete Prozesse; prüft vor `stop`/`restart` PID-Existenz, erwartete Node-Anwendung, Projektpfad und Startnachweis; beendet nie einen fremden Prozess
- Enthält keine Execution Bridge, keinen Executor, keinen Codex-/Agentenstart und keine Browser-Steuerbuttons – rein lokale Terminal-Bedienung

## 8. Browserdaten und localStorage

- Arbeitsdaten liegen lokal im Browser
- Schlüssel u. a.: `ki-unternehmenszentrale-v1`, `ki-unternehmenszentrale-daily-work-runs-v1`
- `schemaVersion: 1` und `schemaVersion: 2` koexistieren; neue Läufe starten mit 2, ohne automatische Migration
- Kanonische Projekt- und Agentenregister werden **nicht** in localStorage kopiert

## 9. Backup-Export

1. Bereich „Lokale Datensicherung“ öffnen
2. „Daten exportieren“
3. JSON-Datei sicher ablegen
4. Vor größeren Änderungen oder Updates immer exportieren

## 10. Backup-Import

1. „Sicherung auswählen“
2. Importvorschau prüfen
3. Import ausdrücklich bestätigen
4. Seite neu laden
5. Kein `localStorage.clear()`, keine fremden Schlüssel

## 11. Tagesarbeitsablauf

1. Fokusprojekt wählen
2. Gewünschtes Ergebnis formulieren
3. Arbeitsvorschlag erstellen und prüfen
4. Agenten-Prüfphase nur bewusst freigeben
5. Bei Health-Pilot: Runtime nur bewusst vorbereiten → freigeben → starten
6. Ergebnis prüfen und bewusst übernehmen oder ablehnen
7. Tageslauf abschließen
8. Backup exportieren

## 12. Health Upgrade Kompass als erster Runtime-Pilot

- Der Runtime-Pilot ist in V1 nur für **Health Upgrade Kompass** verfügbar
- Voraussetzung: gültiger Arbeitsvorschlag, freigegebene Prüfphase, Projektmanager-Arbeitskarte
- Kein bestätigter Befund und kein anderer aktiver Runtime-Versuch

## 13. Projektmanager-Agent und technische ID `orchestrator-agent`

- Sichtbarer Name: **Projektmanager-Agent**
- Kanonische technische ID: **`orchestrator-agent`**
- Mapping nur über `agent-registry.js` – keine zweite Quelle, keine neue ID

## 14. Jamal-Freigaben

- Prüfphase: ausdrückliche Freigabe vor internen Arbeitskarten
- Runtime: Freigabe gilt nur für den lokalen deterministischen Pilot-Executor
- Freigabe allein startet keinen Lauf – Start ist ein eigener Klick

## 15. Ergebnisannahme

- Nach dem Lauf: Ergebnis ist prüfpflichtig
- Arbeitskarte bleibt bis zur bewussten Annahme unverändert
- Annahme nutzt die bestehende manuelle Ergebnisrückführung
- Ablehnung verändert die Arbeitskarte nicht

## 16. Audit-Verlauf

- Append-only Ereignisse (Prepare, Freigabe, Start, Ergebnis, Annahme/Ablehnung, Abbruch, Timeout)
- Standardmäßig geschlossen in der UI
- Keine Secrets oder Stacktraces

## 17. Sicherheitsgrenzen

- `writeOperationsBlocked: true`
- `madeExternalRequest: false`
- Keine automatische externe KI, Plugins, Git, Veröffentlichung, Zahlungen, Verträge, Deployments
- Jamal entscheidet über jede echte Außenwirkung

## 18. Fehler- und Rückfallverfahren

1. Nichts löschen
2. Keinen `git reset` ausführen
3. Fehlermeldung vollständig sichern
4. Letzten funktionierenden Commit und letztes Backup nennen
5. Bei Bedarf aus Backup wiederherstellen und Seite neu laden

## 19. Update- und Versionsregel

- V6.44.0 friert den lokalen V1-Betrieb ein; V6.44.1 synchronisiert nur die Health-Verifizierungsmomentaufnahme
- V6.45.0 bündelt den Finish-Sprint für Führung, Agentenauswahl und Nutzerführung im Tageslauf; Autonomie- und Sicherheitsgrenzen bleiben unverändert
- Kleine Korrekturen nur mit klarer Dokumentation und ohne Autonomieerhöhung
- Neue Executoren, Plugins, Schreib-APIs oder Cloud gehören **nicht** in V1
- Vor jedem Update: Backup exportieren
- V6.45.0 erst nach Browser-Abnahme und ausdrücklichem Commit als verbindlichen Stand behandeln; bis dahin ist es ein lokaler Finish-Kandidat auf Basis von `5602cfa`

## 20. Grenze zwischen V1 und späterer V2

### Zur V1 gehören

- lokaler Tagesstart
- 17 kanonische Projekte
- 25 kanonische Agenten
- Agenten-Einsatzplan
- Agenten-Prüfphase
- lokale Datensicherung
- modularisierte Kernbereiche
- lokaler deterministischer Runtime-Pilot
- manuelle Freigabe und Ergebnisannahme
- Audit, Reload-Persistenz und Backup-Restore

### Nicht zur V1 gehören

- zweiter Executor
- externe KI-Agenten
- produktive Plugins
- Schreib-APIs
- automatisches Git
- Deployment
- Cloud-Synchronisation
- Mehrbenutzerbetrieb
- autonome Geschäftsentscheidungen
