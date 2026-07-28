# PROJECT FINISH DECISION BOARD

Stand: 2026-07-27 · Lauf V7.6.2

## Ganz oben: das Wichtigste zuerst

### Drei wichtigste Entscheidungen für Jamal

1. **Reihenfolge bestätigen:** Zuerst Health Upgrade Kompass bis `REFERENCE_READY` fertigstellen, danach die Marketingagentur extern anbieten – nicht umgekehrt und nicht gleichzeitig als Doppelpriorität.
2. **Dirty-Stand im Health-Repo entscheiden:** Das Waage-V1-Anschlusskonzept und die drei unversionierten Dateien (`mockScaleAdapter.js`, `scaleSnapshot.js`, `scaleSnapshot.test.js`) bewusst fertigstellen+committen oder zurückstellen – nicht unentschieden liegen lassen.
3. **Expansion-App-Trennung:** Entscheiden, ob und wann die kommunikative Trennung von Health Upgrade Kompass und Expansion App in eine echte technische Trennung überführt wird, bevor dort weitergearbeitet wird.

### Erstes abzuschließendes Projekt

**Health Upgrade Kompass** – höchste Referenzwirkung, überschaubarer Restaufwand (60–110 h), kein externer Freigabebedarf im Kern (nur Rechtstexte).

### Nächster messbarer Meilenstein

Ein vollständiger, bruchfreier Referenz-Walkthrough des Health Upgrade Kompass (Teststrecke gemäß `HEALTH_REFERENCE_FINISH_PLAN.md` Abschnitt C), von Jamal ausdrücklich als „vorzeigbar" abgenommen.

### Größtes Risiko

Parallele Öffnung zu vieler Baustellen gleichzeitig (Health-Restarbeit, Expansion-App, Marketingagentur-Verkauf, Sprachtrainer-Hörtest) verwässert Fokus und verzögert den ersten echten externen Erfolg. Zweitgrößtes Risiko: der Marketingagentur fehlt weiterhin ein echter, nicht platzhalterbasierter Beispielauftrag als Verkaufsnachweis.

### Geschätzte Zeit bis Marketingagentur-Pilot

**70–130 Stunden** Restarbeit (siehe `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md`), zusätzlich abhängig davon, wie schnell ein passender erster Pilotkunde gefunden wird – dieser zeitliche Faktor ist `NICHT LOKAL VERIFIZIERBAR`.

### Eine klare nächste Handlung für Jamal

Entscheidung zu Punkt 2 oben treffen (Dirty-Stand Health-Repo: fertigstellen oder zurückstellen), da dies die Voraussetzung für den Start der eigentlichen Health-Restarbeit ist.

---

## Priorität 1 – Health Upgrade Kompass → REFERENCE_READY

- **Begründung:** höchste Referenzwirkung für die Unternehmenszentrale, am weitesten fortgeschrittenes eigenes Endkundenprodukt, überschaubarer Restaufwand.
- **Ergebnis:** vorzeigbarer End-to-End-Referenzdurchlauf (Start-Gate → sechs Antworten → Ergebnis → Beraterübergabe → Kundenbereich).
- **Owner:** Produktmanager-Agent (3), fachlich begleitet durch Entwickler-Agent (4), Design-Director-Agent (5), Content-Agent (7); QA durch QA-Agent (6) und Compliance-/Risiko-Agent (10).
- **Abnahmekriterium:** siehe `HEALTH_REFERENCE_FINISH_PLAN.md` Abschnitt G.
- **Restaufwand:** 60–110 Stunden.
- **Risiko:** unentschiedener Dirty-Stand blockiert sauberen Start; fehlende Rechtsprüfung von Gesundheitsaussagen verzögert Abnahme.

## Priorität 2 – Marketing Agentur OS → Sellable Pilot V1

- **Begründung:** erstes strategisch gewolltes Verkaufsprodukt, kann teilweise parallel vorbereitet werden, sollte aber erst nach einem sichtbaren Health-Referenznachweis extern angeboten werden.
- **Ergebnis:** ein echter interner Beispielauftrag als Verkaufsnachweis, geprüfte Pakete/Preise, Pilotkundenkriterien erfüllbar.
- **Owner:** Projektmanager-Agent (2), fachlich begleitet durch Content-Agent (7), Design-Director-Agent (5), Video-Content-Produktionsagent (13); QA durch QA-Agent (6) und Rechts-/Compliance-Agent (16).
- **Abnahmekriterium:** vollständiger interner Beispielauftrag dokumentiert, siehe `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md`.
- **Restaufwand:** 70–130 Stunden.
- **Risiko:** Verkaufsversuch ohne echten Case wirkt unbelegt; Vertrags-/Datenschutzvorlagen sind rechtlich noch ungeprüft.

## Priorität 3 – Expansion App / Export-Modul: Trennungsentscheidung vorbereiten

- **Begründung:** ruht bereits ca. sechs Wochen, technische Kopplung an Health Upgrade Kompass erzeugt Risiko für Priorität 1, sollte aber nicht unbeachtet bleiben.
- **Ergebnis:** eine dokumentierte Trennungsempfehlung (technisch/organisatorisch) plus ein Demodurchlauf des bestehenden Cockpits.
- **Owner:** Produktmanager-Agent (3), fachlich begleitet durch Entwickler-Agent (4), Strategie-/Geschäftsentwicklungs-Agent (21), Rechts-/Compliance-Agent (16); QA durch QA-Agent (6).
- **Abnahmekriterium:** Trennungsentscheidung durch Jamal getroffen, siehe `INTERNAL_PROJECT_REFERENCE_PLAN.md` Testlauf 3.
- **Restaufwand:** 80–150 Stunden (zusätzlich externe Rechts-/Regulatorikprüfung außerhalb dieses Repositories).
- **Risiko:** ohne Trennungsentscheidung bleibt jede Weiterentwicklung technisch mit Health Upgrade Kompass verkoppelt.

## Nachrangig (keine aktive Priorität, solange 1–3 offen sind)

Sprachtrainer-Familie (Portugiesisch vor Spanisch, wartet auf echten Hörtest), Karriere-/Static-Sites (`prowin-karriere`, `health-upgrade-karriere`, `jaco-gbr-webseite`, Rechtsprüfung vor Veröffentlichung nötig), persönliche Werkzeuge (`sports-portfolio-manager`, `private-market-intelligence-bot`, kein Geschäftsprodukt), Senior Designer OS/Autopilot-Light-System (Wissensbasis/Methode, Identitätsklärung durch Jamal weiterhin offen).

**Grundsatz:** maximal drei aktive Prioritäten gleichzeitig. Aktuell: Priorität 1–3 wie oben. Kein weiteres Projekt sollte parallel neu geöffnet werden, bevor mindestens Priorität 1 abgeschlossen ist.
