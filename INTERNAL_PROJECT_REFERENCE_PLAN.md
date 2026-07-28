# INTERNAL PROJECT REFERENCE PLAN

Stand: 2026-07-27 · Lauf V7.6.2 · reine Planung, **keine Ausführung** in diesem Lauf.

**Nachtrag V7.6.3:** Testlauf 1 (Health Upgrade Kompass) ist jetzt als kanonischer, kontrollierter Referenz-Arbeitslauf `health-reference-work-run-v1` in der Unternehmenszentrale verankert – Status `PREPARED_FOR_EXECUTION`, sieben feste Arbeitspakete, sieben Jamal-Freigabepunkte, Übergabevertrag an Cursor. Die verbindliche Agentenzuteilung wurde dabei gegenüber der ursprünglichen Planung unten leicht angepasst (Auftrag Abschnitt 4 der V7.6.3-Freigabe): Hauptagent **Projektmanager-Agent** statt Produktmanager-Agent, Fachagenten **Produktmanager-Agent/Entwickler-Agent/Content-Agent** statt Entwickler-/Design-Director-/Content-Agent, QA-/Sicherheitsagent ausschließlich **QA-Agent** (ohne Compliance-/Risiko-Agent als zweiten QA-Agenten, da maximal ein QA-/Sicherheitsagent zulässig ist). Maßgeblich für den tatsächlichen, verankerten Referenzlauf ist ab sofort ausschließlich `HEALTH_REFERENCE_WORK_RUN.md`; die ursprüngliche Planung unten bleibt als historischer Ausgangspunkt unverändert stehen. **Kein Arbeitspaket wurde in V7.6.3 ausgeführt**, keine Health-Funktion implementiert.

Dieses Dokument plant echte, spätere End-to-End-Testläufe der KI-Unternehmenszentrale an den eigenen priorisierten Projekten. Jeder Lauf nutzt ausschließlich bestehende, kanonische Agenten (`agent-registry.js`, 25 Agenten) – **kein neuer Agent, keine Erweiterung der Agentenzahl.** Jeder Lauf benötigt eine separate Jamal-Freigabe, bevor er real gestartet wird.

## Gemeinsame Leitplanken aller Testläufe

- Genau ein verantwortlicher Hauptagent je Lauf, maximal drei Fachagenten, optional ein QA-/Sicherheitsagent.
- Kein Lauf löst automatisch eine externe Aktion aus (kein Versand, keine Veröffentlichung, keine Zahlung, kein Login).
- Jeder Lauf erzeugt einen Auditnachweis in der Zentrale (Agentenauswahl, Arbeitsschritte, Ergebnisversion).
- Abbruchkriterien gelten unmittelbar und ohne Ausnahmegenehmigung durch den Agenten selbst.

## Testlauf 1 – Health Upgrade Kompass → Referenznachweis

1. **Projekt:** Health Upgrade Kompass
2. **Ergebniswunsch:** ein vorzeigbarer, ehrlicher End-to-End-Referenzdurchlauf des Kunden-Kompasses
3. **Messbares Endergebnis:** vollständiger, bruchfreier Klickdurchlauf Startseite → Start-Gate → mindestens sechs Antworten → Ergebnis → Beraterinnenübergabe → Kundenbereich, dokumentiert mit Screenshots/Protokoll
4. **Hauptagent:** Produktmanager-Agent (3)
5. **Fachagenten (max. 3):** Entwickler-Agent (4), Design-Director-Agent (5), Content-Agent (7)
6. **QA-/Sicherheitsagent:** QA-Agent (6) gemeinsam mit Compliance-/Risiko-Agent (10)
7. **Benötigte Werkzeuge:** lokaler Editor/Terminal, bestehender lokaler Server (`npm start`), keine neuen Werkzeuge
8. **Erlaubte Read-only-Fähigkeiten:** Repository/Dokumentation lesen, bestehende Testergebnisse lesen, UX-/Rechtstexte lesen
9. **Benötigte Entwürfe:** UX-Feinschliff-Entwurf für verbleibende Lücken, Rechtstext-Prüfliste, Referenz-Walkthrough-Skript
10. **Erforderliche Jamal-Freigaben:** jede Textänderung mit Gesundheitsbezug, jeder Commit/Push im Health-Repository, jeder Browser-/Live-Test
11. **Verbotene Aktionen:** echte Waage anschließen, echte Gesundheitsdaten, Deployment, Veröffentlichung, Kontaktaufnahme mit echten Kundinnen
12. **Auditnachweis:** Agentenlauf-Protokoll im Jamal-Arbeitsmodus der Zentrale (Ziel, Agentenauswahl, Ergebnisversion)
13. **Abschlusskriterium:** alle Pflichtpunkte aus `HEALTH_REFERENCE_FINISH_PLAN.md` Abschnitt A erfüllt, keine offene P0-Baustelle
14. **Referenzartefakt:** dokumentierter Walkthrough (Screenshots/Protokoll) + Abnahmeprotokoll durch Jamal
15. **Abbruchkriterium:** jeder Fund echter Gesundheitsdaten, jede unbelegte Heils-/Diagnoseaussage, jeder Sicherheitsbefund

## Testlauf 2 – Marketing Agentur OS → Sellable Pilot V1

1. **Projekt:** Marketing Agentur OS
2. **Ergebniswunsch:** ein vollständiger interner Beispielauftrag von Briefing bis Auslieferungsentwurf als Vertriebsnachweis
3. **Messbares Endergebnis:** ein dokumentierter Beispielauftrag (z. B. ein Social-Content-Paket für eine bereits geführte Marke) durchläuft Briefing → Recherche → Contentplanung → Textproduktion → Design-/Video-Briefing → QA → Revision → interne Freigabe → Auslieferungsentwurf, ohne Bruch
4. **Hauptagent:** Projektmanager-Agent (2)
5. **Fachagenten (max. 3):** Content-Agent (7), Design-Director-Agent (5), Video-Content-Produktionsagent (13)
6. **QA-/Sicherheitsagent:** QA-Agent (6) gemeinsam mit Rechts-/Compliance-Agent (16)
7. **Benötigte Werkzeuge:** bestehende, bereits kontrolliert vorbereitete Canva-/HeyGen-Korridore der Zentrale (`CONTROLLED_CONNECTOR_HANDOFF`) – keine neue Werkzeugverbindung
8. **Erlaubte Read-only-Fähigkeiten:** `registry.json`/Brand-Profile/Asset-Index lesen, bestehende Briefing-Vorlagen lesen
9. **Benötigte Entwürfe:** Angebotstext-Entwurf, Beispielauftrag-Briefing, Pilotvertrags-Hinweisentwurf (kein Vertrag)
10. **Erforderliche Jamal-Freigaben:** jede echte Canva-/HeyGen-Produktion, jede Nutzung eines echten Markenassets, jedes Angebot an einen echten Kunden
11. **Verbotene Aktionen:** automatische Veröffentlichung, echte externe Kundenansprache, Zahlungseinzug, Social-Media-Posting
12. **Auditnachweis:** Produktionsboard-Eintrag (`internal-production-board.json`) + Agentenlauf-Protokoll
13. **Abschlusskriterium:** Beispielauftrag vollständig dokumentiert, Pakete/Preise aus `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md` konsistent referenziert
14. **Referenzartefakt:** Beispielauftrag-Akte + Vorher-/Nachher-Vergleich der Kundendemo (`kunden-demo/`)
15. **Abbruchkriterium:** ungeklärte Bild-/Markenrechte, Compliance-Warnung, fehlende Kundenzustimmung für Referenznutzung

## Testlauf 3 – Expansion App / Export-Modul (Entscheidungsvorbereitung)

1. **Projekt:** Health Upgrade Expansion App / Export-Modul
2. **Ergebniswunsch:** eine belastbare Entscheidungsgrundlage, ob und wie die technische Trennung von Health Upgrade Kompass erfolgt, plus ein dokumentierter Cockpit-Durchlauf mit Demodaten
3. **Messbares Endergebnis:** ein vollständiger Länderprüfungs-Demodurchlauf im Expansion Cockpit (Produkt → Zielland → Entscheidung → Grund → nächster Schritt) ohne Bruch, dokumentierte Trennungsempfehlung
4. **Hauptagent:** Produktmanager-Agent (3)
5. **Fachagenten (max. 3):** Entwickler-Agent (4), Strategie-/Geschäftsentwicklungs-Agent (21), Rechts-/Compliance-Agent (16)
6. **QA-/Sicherheitsagent:** QA-Agent (6)
7. **Benötigte Werkzeuge:** keine neuen; ausschließlich bestehender Code/Demo-Daten
8. **Erlaubte Read-only-Fähigkeiten:** bestehende Sprint-Dokumentation (`docs/expansion-app-sprint*.md`, `export-modul-*.md`) lesen
9. **Benötigte Entwürfe:** Trennungsentscheidungs-Vorlage (technisch/organisatorisch), aktualisierter Export-Modul-Statusbericht
10. **Erforderliche Jamal-Freigaben:** jede Entscheidung zur technischen Trennung, jede Wiederaufnahme der Sprintarbeit
11. **Verbotene Aktionen:** reale Länderfreigabe, automatische Dokumentenanforderung, E-Mail an Hersteller/Behörden, jede rechtsverbindliche Exportaussage
12. **Auditnachweis:** Agentenlauf-Protokoll + aktualisierte `app-abgrenzung-health-kompass-vs-expansion.md`
13. **Abschlusskriterium:** Trennungsempfehlung vorliegt, Demodurchlauf dokumentiert
14. **Referenzartefakt:** Entscheidungsvorlage + Cockpit-Screenshot-Protokoll
15. **Abbruchkriterium:** jede versehentliche reale Länder-/Rechtsaussage, jeder Fund echter Herstellerdaten ohne Freigabe

## Testlauf 4 – Sprachtrainer-Familie (Portugiesisch zuerst)

1. **Projekt:** Portugiesisch-Sprechtrainer (danach ggf. Spanisch-Sprechtrainer nach demselben Muster)
2. **Ergebniswunsch:** der im Projekt selbst als nächster Schritt benannte echte Hörtest wird vorbereitet, durchgeführt und ausgewertet
3. **Messbares Endergebnis:** Hörtest-Exportdatei (`flowlingo-hoertest-v110-audioqa1-*.json`) liegt vor und ist formal geprüft; Freigabe-/Stopp-Entscheidung für Version 111 liegt vor
4. **Hauptagent:** Produktmanager-Agent (3)
5. **Fachagenten (max. 3):** Content-Agent (7), Web- & App-Product-Design-Agent (22), Entwickler-Agent (4)
6. **QA-/Sicherheitsagent:** QA-Agent (6)
7. **Benötigte Werkzeuge:** keine neuen; lokaler Server (`python3 -m http.server`)
8. **Erlaubte Read-only-Fähigkeiten:** bestehende Content-Packs/Testberichte lesen
9. **Benötigte Entwürfe:** Hörtest-Protokollvorlage, Auswertungsbericht-Entwurf
10. **Erforderliche Jamal-Freigaben:** Durchführung des echten Hörtests mit Jamal/Conny bzw. PT-PT-Muttersprachler, Freigabe von Version 111
11. **Verbotene Aktionen:** Veröffentlichung, automatische Nutzerkommunikation, Zusammenführung mit „FlowLingo"-Namensfrage ohne Jamal-Entscheidung
12. **Auditnachweis:** Agentenlauf-Protokoll + Hörtestauswertung als Dokument
13. **Abschlusskriterium:** Hörtestauswertung vorhanden, Version-111-Entscheidung getroffen
14. **Referenzartefakt:** Hörtest-Exportdatei + Auswertungsbericht
15. **Abbruchkriterium:** unklare PT-PT-Sprachqualität, fehlende Testperson, technischer Blocker im Content-Pack

## Testlauf 5 – Karriere-/Static-Sites (proWIN Karriere, Health Upgrade Karriere, JACO GbR Webseite)

1. **Projekt:** `prowin-karriere`, `health-upgrade-karriere`, `jaco-gbr-webseite` (gemeinsames Muster, einzeln durchführbar)
2. **Ergebniswunsch:** rechtssichere, veröffentlichungsreife Minimalversion je Seite
3. **Messbares Endergebnis:** Impressum/Datenschutz vollständig und rechtlich geprüft, keine offenen Platzhalter, funktionierender Klickdurchlauf
4. **Hauptagent:** Operations-/Prozess-Agent (17)
5. **Fachagenten (max. 3):** Content-Agent (7), Web- & App-Product-Design-Agent (22), Entwickler-Agent (4)
6. **QA-/Sicherheitsagent:** Rechts-/Compliance-Agent (16)
7. **Benötigte Werkzeuge:** keine neuen
8. **Erlaubte Read-only-Fähigkeiten:** bestehende HTML/CSS/JS und README lesen
9. **Benötigte Entwürfe:** finaler Impressums-/Datenschutztext-Entwurf (juristisch noch zu prüfen)
10. **Erforderliche Jamal-Freigaben:** jede Veröffentlichung/jedes Hosting-Upload, jede rechtliche Endabnahme
11. **Verbotene Aktionen:** Veröffentlichung ohne juristische Prüfung, verbindliche Einkommens-/Karriereversprechen
12. **Auditnachweis:** Agentenlauf-Protokoll je Seite
13. **Abschlusskriterium:** kein offener rechtlicher Platzhalter, Jamal-Freigabe zur Veröffentlichung erteilt oder bewusst zurückgestellt
14. **Referenzartefakt:** geprüfte Textfassung + Freigabeprotokoll
15. **Abbruchkriterium:** ungeklärte Rechtsfrage ohne externe Fachperson

## Reihenfolge der Testläufe

Testlauf 1 (Health) zuerst, da strategischer Referenzfall. Testlauf 2 (Marketing Agentur) kann parallel vorbereitet, aber nicht vor einem sichtbaren Health-Ergebnis extern genutzt werden. Testlauf 3 (Expansion) erst nach einer Jamal-Entscheidung zur Trennungsfrage. Testlauf 4 (Sprachtrainer) unabhängig, sobald ein echter Testperson-Termin steht. Testlauf 5 (Karriere-/Static-Sites) niedrigste Priorität, jederzeit parallel möglich, da geringer technischer Aufwand.
