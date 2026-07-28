# HEALTH REFERENCE FINISH PLAN

Stand: 2026-07-27 · Lauf V7.6.2 · read-only geprüft, **keine Health-Datei verändert.**

Geprüfter Ordner: `/Users/jamal/Documents/New project/health-upgrade-kompass`. Bekannter, unveränderlicher Zustand zu Beginn dieses Laufs: Branch `work/check-start-gate-2026-07-19`, HEAD `395bf9e01f26d63dc4cc0bbc8343d10535c1ad64`, `M package.json`, unversioniert `src/logic/mockScaleAdapter.js`, `src/logic/scaleSnapshot.js`, `src/logic/scaleSnapshot.test.js`. Dieser Zustand wird hier **nicht als bereits freigegeben oder committed** behandelt.

## A. Pflichtumfang für die Referenz (bis `REFERENCE_READY`)

Diese Punkte sind laut eigener Projektdokumentation (`ROADMAP.md`, `docs/MVP_STATUS_AUDIT.md`, `docs/UX_AUDIT.md`) noch offen und für einen glaubwürdigen Referenznachweis notwendig:

1. Aktuellen dirty Stand bewusst entscheiden: Waage-V1-Anschlusskonzept (`WAAGE_V1_ANSCHLUSSKONZEPT.md`) und die drei unversionierten Dateien entweder fertigstellen+committen oder bewusst zurückstellen – kein unentschiedener Zwischenstand vor einer Referenzvorführung.
2. Authentifizierung/echte Rollenrechte für Kunden-/Berater-/Adminbereich (aktuell Demo-Simulation).
3. Persistente Datenbank statt Demo-Daten im Browser; Consent-Versionierung und Löschlogik.
4. Echte QR-Code-Erzeugung je Party (aktuell nur Vorschau).
5. Mindestens ein realer Anbindungskanal für Nachricht/Shop/WhatsApp – oder eine bewusste, klar kommunizierte Beschränkung auf „Beratergespräch als Kanal" für die Referenzversion.
6. Finale fachliche und rechtliche Freigabe aller Produkt-, Ergebnis- und Gesundheitstexte (keine Diagnose, kein Heilversprechen, keine Mangelbehauptung – laut eigener Dokumentation bereits als Grundsatz beachtet, aber noch nicht extern/rechtlich final abgenommen).
7. Datenschutzhinweise und Impressum für eine etwaige Preview-Domain.
8. Erweiterte mobile QA auf realen Geräten (bisher nur Browser-/Klick-Prüfung dokumentiert).

## B. Nicht notwendiger Phase-2-Umfang (für die Referenz bewusst ausklammern)

- Echte Körperanalysewaage (Yolanda 8-Elektroden oder andere Hardware) – laut `WAAGE_V1_ANSCHLUSSKONZEPT.md` ausdrücklich noch **nicht** Teil von V1, sondern Phase 2+.
- Native SDK-/Bluetooth-Anbindung.
- Vollständiges 50-Metrik-Reporting.
- Serverseitige Persistenz der Waagenwerte.
- Datenbank-Vollausbau nach `ROADMAP.md` Phase 2 (alle zwölf Kernobjekte) – für die Referenz reicht ein für die Demo ausreichender Teilausbau (mind. `checks`, `customers`, `advisors`, `products`).
- Admin-Vollausbau (Phase 4) – für die Referenz reicht ein demonstrierbarer, aber nicht vollständig produktionsreifer Adminbereich.

## C. Konkrete Teststrecke (für Testlauf 1 aus `INTERNAL_PROJECT_REFERENCE_PLAN.md`)

1. Gast-Start mit Party-Kontext öffnen.
2. Start-Gate/„Check-Start-Hero" ansehen („Erst Start. Dann Fragen.").
3. Mindestens sechs Antworten geben (technische Schwelle `minimumAnswers = 6` in `checkView.js`) bis „Ergebnis ansehen" aktiv wird.
4. Ergebnis-Kompass mit Fokusbereichen und nächstem Schritt ansehen.
5. Balance-Waage (Belastung/Erholung) als optionalen Zusatzschritt prüfen.
6. Übergabe an Beraterin/Berater (Produkt-Routine-Ideen, Beraterkontakt) durchlaufen.
7. Kundenbereich mit Produkten/Routine/Beraterkontakt ansehen.
8. Berater-Dashboard (Kunden, Partys, Erinnerungen) ansehen.
9. Adminbereich (Beraterstatus, Produkte, Kundenübertragung) als Demo ansehen.
10. Lokalen Offline-Check ausführen: `python3 scripts/check-local.py`.
11. `npm test` (6 Testdateien) grün.

## D. Qualitätskriterien

- Kein Bruch im Klickpfad zwischen den zehn Teststrecken-Schritten.
- Keine Diagnose-, Heilversprechen- oder Mangelbehauptungssprache in Fragen/Ergebnis/Produkttexten.
- Balance-Waage und Körperanalyse-Werte bleiben klar als freiwillig/optional gekennzeichnet.
- Demo-Charakter (Demoprofil, Demo-Beraterin, Demo-QR) bleibt für Betrachter erkennbar, keine vorgetäuschte Echtheit.
- Alle sechs bestehenden Testdateien bleiben grün; kein bestehender Testfall wird abgeschwächt.

## E. Sicherheits- und Ehrlichkeitsgrenzen

- Keine echten Gesundheitsdaten im Referenzlauf.
- Keine echte Waage anschließen, kein echter Bluetooth-/SDK-Zugriff.
- Keine echten Kundinnen/Kunden oder echten Berater-Kontaktdaten in der Referenzvorführung.
- Keine Veröffentlichung/kein Deployment aus diesem Referenzlauf.
- Jede spätere echte Anbindung (Consent-Speicherung, echte Shop-/WhatsApp-Verbindung, echte Waage) bleibt eine separate, von Jamal freizugebende Entscheidung.

## F. Sichtbarer Referenznachweis

Ein dokumentierter Walkthrough (Screenshots oder kurze Aufzeichnung + schriftliches Protokoll) der Teststrecke aus Abschnitt C, ergänzt um: aktuellen Teststand (`npm test`-Ergebnis), Liste noch offener Punkte aus Abschnitt A, und eine kurze Einordnung, was am Health Upgrade Kompass die KI-Unternehmenszentrale (Produktmanager-/Design-/Content-/QA-Agenten) tatsächlich beigetragen hat.

## G. Abnahmekriterien durch Jamal

1. Teststrecke aus Abschnitt C läuft ohne Bruch durch.
2. Kein offener P0-Punkt aus Abschnitt A (Authentifizierung, Datenschutz/Impressum, finale Textfreigabe) bleibt unkommentiert.
3. `npm test` grün, kein bestehender Testfall entfernt oder abgeschwächt.
4. Der aktuelle dirty Stand (Waage-V1-Konzept) ist bewusst entschieden (fertigstellen+committen oder zurückstellen), nicht stillschweigend liegen gelassen.
5. Jamal bestätigt den Referenznachweis ausdrücklich als „vorzeigbar" – ohne diese Bestätigung bleibt der Status `INTERNAL_PILOT_READY`, nicht `REFERENCE_READY`.

## Geschätzte Restarbeit

**60–110 Stunden** bis zu einem glaubwürdigen `REFERENCE_READY`-Stand, abhängig davon, wie viel Datenbank-/Auth-Umfang für eine Referenz tatsächlich nötig ist (untere Bandbreite: nur Demo-Persistenz vertiefen und Rechtstexte klären; obere Bandbreite: echte Auth + echte Teil-Datenbank + vollständige mobile QA). Diese Schätzung ist eine Planungsannahme, kein Festpreis.
