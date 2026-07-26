# KI-Unternehmenszentrale – Einstieg für Jamal

## Status

- **V1 lokal fertig und betriebsbereit**
- Version: **V7.0 Phase A – Guided Work Foundation** (umgesetzt, abgenommen, gesichert mit Commit `4a74ebe`)
- **V7.0 Phase B – Betriebsstabilität** ist umgesetzt, getestet, browserseitig abgenommen und mit Commit `3487a84` gesichert
- **V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor** ist umgesetzt, getestet, abgenommen und mit Commit `0858b4e` gesichert; Mock-Executor ist keine KI; Apply nur Fixture, Health-Apply blockiert
- **V7.0 Phase D – Codex als kontrollierten Executor anbinden** ist umgesetzt, getestet, echter Codex-Fixture-Pilot bestanden und mit Commit `6553452` gesichert; Codex läuft ausschließlich isoliert gegen das Fixture-Repository, Codex-Start und Apply für Health bleiben hart blockiert
- **V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat** ist umgesetzt, getestet und mit Commit `52ce012` gesichert; read-only V7.0-Freeze-Status (`IN_REVIEW|FREEZE_CANDIDATE|FROZEN`)
- **V7.0 ist mit Jamals ausdrücklicher Entscheidung vom 25.07.2026 offiziell `FROZEN`** (Basis `52ce012`); Phase A bis E abgeschlossen; keine neuen Funktionen mehr in V7.0; neue Funktionen erst ab V7.1 nach separater Freigabe
- **V7.1 Phase A – Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway** ist umgesetzt und mit 661 automatisierten Prüfpunkten grün getestet (inkl. Nachbesserung aus der ersten manuellen Safari-Abnahme: Checkbox-Layout und strukturierte Blockierungsantwort), **committed und gepusht mit Commit `59f985f`**
- **V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector** ist umgesetzt (`CONTROLLED_CONNECTOR_HANDOFF`: die Zentrale bereitet nur ein geprüftes Auftragspaket vor, der echte HeyGen-Renderlauf würde – falls überhaupt – über einen externen Connector nach separater Freigabe laufen); kein API-Key gespeichert, keine Veröffentlichung, kein automatischer Start; **committed und gepusht mit Commit `ff43089`**
- **V7.1 Phase B.1 – HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet:** der bereits extern erfolgreich ausgeführte erste reale HeyGen-Pilot (fiktives Café, keine Veröffentlichung) ist strukturiert als Pilot-Review dokumentiert; additiv eine kleine Mandantenbasis (zwei neutrale Testkunden, keine echten Kundendaten), verpflichtende Kunden-/Marken-/Kampagnenbindung je Videoauftrag, eine fünfte getrennte Freigabestufe (Kundenentwurf) und eine Ergebnisrückführungs-Statuskette bis zur getrennten Kundenfreigabe (Veröffentlichung bleibt strukturell unerreichbar); Kunden erhalten weiterhin keinen HeyGen-Zugang; mit 929 automatisierten Prüfpunkten grün getestet; **committed und gepusht mit Commit `37e8a28`** (HEAD und `origin/main` stehen exakt darauf)
- **V7.1 Phase C – Canva als zweiter kontrollierter Design-Connector:** Canva ist – nach demselben Muster wie HeyGen – als `CONTROLLED_CONNECTOR_HANDOFF` vorbereitet; die Zentrale erstellt ein geprüftes Designauftragspaket (Briefing, Marken-/Assetrechte, Kunde-/Marke-/Kampagnenbindung, sieben getrennte Freigabestufen), die echte Canva-Designerstellung würde – falls überhaupt – über einen externen, authentifizierten Canva-Connector nach separater Freigabe laufen; kein API-Key gespeichert, keine Veröffentlichung, kein automatischer Start; Kunden erhalten weiterhin keinen Canva-Zugang; HeyGen und Shopify sind unverändert; mit 1165 automatisierten Prüfpunkten grün getestet; **committed und gepusht mit Commit `52b2d02`** (HEAD und `origin/main` stehen exakt darauf)
- **V7.1 Phase C.1 – realen Canva-Pilot kanonisch abgeschlossen, Kundenfeedback-Schleife vorbereitet:** ein realer, außerhalb des lokalen Servers durchgeführter Canva-Pilot (fiktiver Testkunde, Marke „Café Amore“, Instagram-Post „Sonntagsfrühstück“, Design-ID `DAHQeIjc2ls`, als bearbeitbares Canva-Design gespeichert, `NOT_BILLABLE_TEST`) ist jetzt als kanonische Pilot-Ergebnisakte mit Jamals internem Review dokumentiert; eine kontrollierte Kundenfeedback-Schleife (Feedback erfassen, Änderungen anfordern, erneut prüfen, getrennte Kundenfreigabe) ist vorbereitet, Veröffentlichung bleibt strukturell nicht freigegeben; kein Kundenzugang zu Canva, kein Social Posting, keine Kosten; **committed und gepusht mit Commit `6621d93`** (gemeinsam mit Phase C.1.1)
- **V7.1 Phase C.1.1 – Reviewmodell skalierbar gemacht:** Jamal ist kein verpflichtender Prüf-/Freigabeengpass mehr. Eigenprojekt → Owner-Review; Standardkunde → Agenten-QS + Kunden-Selbstprüfung; Premiumkunde → Agenten-QS + optionales menschliches Review + Kundenfreigabe; Risikofall → Eskalation. Café-Amore bleibt `OWNER_REVIEW`. Mehrsprachigkeit nur als Leitplanke (DE zuerst; später PT/EN/ES/FR lokalisiert) – nicht implementiert. **committed und gepusht mit Commit `6621d93`**
- **V7.2 Phase A Schritt 1 – Auth-Kern und persistente Identitätsschicht:** neue, vollständig gekapselte `auth.sqlite` (Nutzer, Sessions, Mandanten, Reset-Tokens, Audit-Log), Passwort-Hashing über `crypto.scrypt`, 256-Bit-Sessiontokens; noch keine Route-Gates, kein Login. **committed und gepusht mit Commit `e2cd018`**
- **V7.2 Phase A Schritt 2 – Route-Gates, Auth-Routen und Owner-/Customer-Trennung:** jede Route hat jetzt eine explizite Zugriffspolitik; im Produktivmodus sind alle bestehenden Chef-Routen und -Assets nur mit Owner-Login erreichbar, Execution ist zusätzlich vollständig deaktiviert; neue Anmelde-/Abmelde-/Sessionstatus-/Passwort-Reset-/Einladungsrouten (`/api/auth/*`); Jamals lokaler Chef-Modus bleibt im Entwicklungsmodus auf Loopback weiterhin ohne Login nutzbar (sichtbare Konsolenwarnung); noch **kein** Kundenportal, keine kundenbedienbare Fachroute; mit 1450 automatisierten Prüfpunkten grün getestet; **lokal umgesetzt, aber noch nicht committed, gepusht oder deployt**; bereit zur manuellen Abnahme durch Jamal (siehe `CURRENT_STATUS.md`)
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
