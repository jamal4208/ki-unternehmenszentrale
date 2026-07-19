# KI-Unternehmenszentrale – Einstieg für Jamal

## Status

- **V1 lokal fertig und betriebsbereit**
- Version: **V6.44.1**
- Betrieb nur lokal auf diesem Mac – kein Cloud- oder Deploymentbetrieb

## Projektordner

`/Users/jamal/Documents/New project/ki-unternehmenszentrale`

## Normaler Start

1. Terminal öffnen
2. In den Projektordner wechseln:
   `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. Server starten: `npm start`
4. Safari öffnen
5. Adresse aufrufen: `http://127.0.0.1:4173/`

## Server sauber beenden

Im Terminal, in dem der Server läuft: **Ctrl + C**

## Hinweis bei EADDRINUSE

- Port **4173** wird bereits benutzt.
- **Keinen zweiten Server starten.**
- Zuerst prüfen, ob die Zentrale unter `http://127.0.0.1:4173/` schon erreichbar ist.
- Nur wenn nötig: den bestehenden Server-Prozess beenden, danach einmal neu starten.

## Datensicherung

1. Im Cockpit „Lokale Datensicherung“ öffnen
2. „Daten exportieren“ wählen
3. Die JSON-Datei sicher aufbewahren
4. Vor größeren Änderungen immer zuerst sichern

## Wiederherstellung

1. „Sicherung auswählen“
2. Importvorschau prüfen
3. Import ausdrücklich bestätigen
4. Seite neu laden

## Normaler Arbeitsablauf

1. Fokusprojekt wählen
2. Gewünschtes Ergebnis eingeben
3. Arbeitsvorschlag prüfen
4. Agenten-Prüfphase nur bewusst freigeben
5. Runtime-Pilot nur bewusst vorbereiten, freigeben und starten
6. Ergebnis bewusst prüfen und übernehmen
7. Tageslauf abschließen
8. Regelmäßig Backup exportieren

## Sicherheitsgrenzen

- keine automatische externe KI-Ausführung
- keine automatische Plugin-Ausführung
- keine automatische Git-Aktion
- keine automatische Veröffentlichung
- keine Zahlungen, Verträge oder Deployments
- **Jamal entscheidet über jede echte Außenwirkung**

## Fehlerfall

1. Nichts löschen
2. Keinen `git reset` ausführen
3. Fehlermeldung vollständig sichern
4. Letzten funktionierenden Commit und das letzte Backup nennen

Ausführlich: `V1_BETRIEBSHANDBUCH.md`
