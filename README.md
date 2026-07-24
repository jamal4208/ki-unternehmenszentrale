# KI-Unternehmenszentrale – Einstieg für Jamal

## Status

- **V1 lokal fertig und betriebsbereit**
- Version: **V7.0 Phase A – Guided Work Foundation** (umgesetzt, abgenommen, gesichert mit Commit `4a74ebe`)
- **V7.0 Phase B – Betriebsstabilität** ist umgesetzt, getestet, browserseitig abgenommen und mit diesem Commit gesichert
- Gesicherter vorheriger Ausgang: **V6.46.0** / `e611c9c`
- Betrieb nur lokal auf diesem Mac – kein Cloud- oder Deploymentbetrieb

## Projektordner

`/Users/jamal/Documents/New project/ki-unternehmenszentrale`

## Normaler Start

**Empfohlen (zeigt vorher den Status, verhindert doppelte Server):**

1. Terminal öffnen
2. In den Projektordner wechseln:
   `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. Status prüfen: `npm run central:status`
4. Server starten: `npm run central:start`
5. Safari öffnen
6. Adresse aufrufen: `http://127.0.0.1:4173/`

**Einfacher Fallback (weiterhin gültig):**

1. Terminal öffnen
2. In den Projektordner wechseln
3. Server starten: `npm start`
4. Safari öffnen, Adresse aufrufen: `http://127.0.0.1:4173/`

## Server sauber beenden

- Bei Start über den Controller: `npm run central:stop`
- Bei Start über `npm start`: im Terminal, in dem der Server läuft, **Ctrl + C**

## Hinweis bei EADDRINUSE

- Port **4173** wird bereits benutzt.
- **Keinen zweiten Server starten.**
- Zuerst `npm run central:status` ausführen: zeigt Port, PID, Version, Commit, Startzeit und genau einen sicheren nächsten Schritt.
- Der Controller beendet **niemals automatisch** einen fremden Prozess, nur weil der Port belegt ist.
- Nur wenn nötig: den bestehenden, tatsächlich eigenen Server-Prozess beenden (`npm run central:stop`), danach einmal neu starten (`npm run central:start`).
- Kompakter Serverstatus (Port, Version, Commit, Startzeit) ist zusätzlich direkt in der Oberfläche sichtbar; technische Details sind standardmäßig eingeklappt.

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
