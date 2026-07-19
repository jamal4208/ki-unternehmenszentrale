# V1-Betriebshandbuch – KI-Unternehmenszentrale

## 1. Verbindlicher V1-Stand

- **Aussage:** V1 lokal fertig und betriebsbereit
- **Version:** V6.44.0 (V1-Betriebsfreeze)
- **Ausgangscommit für diesen Freeze:** `16bbf45` (V6.43.1 Runtime-Pilot abnahmefest abschliessen)
- **Branch:** `main`, synchron mit `origin/main` zum Freeze-Ausgang
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

1. Terminal öffnen
2. `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. `npm start`
4. Safari: `http://127.0.0.1:4173/`

## 6. Beenden des Servers

Im Server-Terminal **Ctrl + C**. Keinen parallelen Server auf Port 4173 belassen.

## 7. Umgang mit Port 4173 und EADDRINUSE

- Standardport: **4173**
- Bei `EADDRINUSE`: Port ist belegt – **keinen zweiten Server starten**
- Zuerst prüfen, ob die Oberfläche bereits läuft
- Nur bei Bedarf den bestehenden Prozess beenden und einmal neu starten

## 8. Browserdaten und localStorage

- Arbeitsdaten liegen lokal im Browser
- Schlüssel u. a.: `ki-unternehmenszentrale-v1`, `ki-unternehmenszentrale-daily-work-runs-v1`
- `schemaVersion: 1` bleibt ohne Migration
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

- V6.44.0 friert den lokalen V1-Betrieb ein
- Kleine Korrekturen nur mit klarer Dokumentation und ohne Autonomieerhöhung
- Neue Executoren, Plugins, Schreib-APIs oder Cloud gehören **nicht** in V1
- Vor jedem Update: Backup exportieren

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
