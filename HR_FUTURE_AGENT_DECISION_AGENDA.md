# HR FUTURE AGENT DECISION AGENDA

Stand: 2026-07-27 · Lauf V7.6.2

Verbindlicher Stand: weiterhin exakt **25 kanonische Agenten**, kein Agent 26, keine vorsorgliche Erweiterung. Finance/Controlling bleibt zunächst `CAPABILITY_GAP`. Neue Agenten entstehen erst nach echten Arbeitsläufen, nicht auf Vorrat. Dieses Dokument nimmt keine Agent-26-Entscheidung vorweg – es bereitet nur die spätere HR-Entscheidung vor.

## Bestehende Agenten für die geplanten Projektläufe (aus `INTERNAL_PROJECT_REFERENCE_PLAN.md`)

| Testlauf | Hauptagent | Fachagenten | QA/Sicherheit |
|---|---|---|---|
| Health Upgrade Kompass | Produktmanager-Agent (3) | Entwickler-Agent (4), Design-Director-Agent (5), Content-Agent (7) | QA-Agent (6), Compliance-/Risiko-Agent (10) |
| Marketing Agentur OS | Projektmanager-Agent (2) | Content-Agent (7), Design-Director-Agent (5), Video-Content-Produktionsagent (13) | QA-Agent (6), Rechts-/Compliance-Agent (16) |
| Expansion App | Produktmanager-Agent (3) | Entwickler-Agent (4), Strategie-/Geschäftsentwicklungs-Agent (21), Rechts-/Compliance-Agent (16) | QA-Agent (6) |
| Sprachtrainer | Produktmanager-Agent (3) | Content-Agent (7), Web-&App-Product-Design-Agent (22), Entwickler-Agent (4) | QA-Agent (6) |
| Karriere-/Static-Sites | Operations-/Prozess-Agent (17) | Content-Agent (7), Web-&App-Product-Design-Agent (22), Entwickler-Agent (4) | Rechts-/Compliance-Agent (16) |

**Befund:** Alle fünf geplanten Testläufe lassen sich mit den bestehenden 25 Agenten abdecken. Kein Lauf erfordert zwingend einen neuen Agenten.

## Rollen mit möglicher Überlastung bei gleichzeitiger Ausführung

- **Content-Agent (7):** taucht in vier von fünf Testläufen als Fachagent auf – bei paralleler Ausführung mehrerer Läufe die wahrscheinlichste Engpassrolle.
- **QA-Agent (6):** ist in allen fünf Testläufen als Sicherheitsinstanz vorgesehen – zweitwahrscheinlichster Engpass, besonders wenn Läufe zeitlich zusammenfallen.
- **Entwickler-Agent (4):** in drei von fünf Läufen technischer Fachagent, zusätzlich weiterhin zuständig für laufende technische Arbeiten an der Zentrale selbst.

Diese Beobachtung ist ein Grund, **maximal drei aktive Prioritäten gleichzeitig** zu halten (siehe `PROJECT_FINISH_DECISION_BOARD.md`) statt eines Grundes für einen neuen Agenten.

## Wiederkehrende Kompetenzlücken (Kandidaten für spätere HR-Entscheidungen)

| Beobachtete Kompetenzlücke | Häufigkeit | Auswirkung | Bestehender Agent als möglicher Owner | Trainingsmöglichkeit | Sicherheitsgrenze | Externe Fachperson möglich | Neuer Agent notwendig? |
|---|---|---|---|---|---|---|---|
| Finanz-/Margenkalkulation für reale Kundenaufträge (Marketingagentur) | mittel (jeder echte Pilotauftrag braucht eine Kalkulation) | hoch – ohne belastbare Marge kein seriöses Preismodell | Finanz-/Controlling-Agent (15) als Analyseowner | 1%-Training über HR-/Team-Agent (18) zu Kalkulationsmethodik | keine Buchhaltung, keine Zahlungsausführung, keine Investitionsentscheidung | ja, Steuerberater/Buchhalter für echte Zahlen | **Nein aktuell** – Agent 15 deckt Analyse ab; ein spezialisierter „Finance-Ops"-Agent 26 bleibt lediglich ein möglicher, nicht beschlossener Kandidat |
| Rechtliche Endprüfung von Verträgen/AGB für Marketingagentur-Pakete | niedrig bis mittel (einmalig je Vertragswerk, dann wiederkehrend bei Änderungen) | hoch – ohne Vertragsprüfung kein rechtssicherer Verkauf | Rechts-/Compliance-Agent (16) als Risikomarkierer | keine interne Trainingsmöglichkeit für echte Rechtsberatung | markiert Risiken, gibt keine Rechtsfreigabe | ja, zwingend (Rechtsanwalt/Fachanwalt) | Nein – dies ist strukturell eine externe Fachaufgabe, kein Agentenauftrag |
| Mobile-QA auf echten Geräten (Health Upgrade Kompass) | einmalig bis mittel je Release | mittel – betrifft Referenzreife, nicht Kernfunktion | QA-Agent (6) als Prüfkoordinator | Trainingsmaterial zu Geräte-/Browser-Matrix über HR-Agent (18) | keine echten Kundendaten auf Testgeräten | ja, externer QA-Dienstleister möglich | Nein |
| Konsistente Kalkulation variabler Tool-Kosten (Canva/HeyGen-Nutzung je Auftrag) | mittel, steigt mit Kundenzahl | mittel – beeinflusst Margenberechnung der Marketingagentur | Finanz-/Controlling-Agent (15) in Zusammenarbeit mit Plugin-/Tool-Radar-Agent (9) | Training zu Tool-Kostenverfolgung | keine automatische Kostenübernahme/Zahlung | UNGEKLÄRT | Nein aktuell |
| Kundenspezifische Rechteklärung (Marken-/Bild-/Personendarstellungsrechte) bei jedem neuen Pilotkunden | mittel, wiederkehrend bei jedem neuen Kunden | hoch – Voraussetzung für jede Auslieferung | Rechts-/Compliance-Agent (16) gemeinsam mit Kunden-/Customer-Success-Agent (20) | Checklisten-Training über HR-Agent (18) | keine Nutzung ungeklärter Rechte | teilweise, bei komplexen Fällen | Nein |

## Mögliche Finance-/Controlling-Lücke

Ein spezialisierter Finance-/Controlling-Ausführungsagent (potenzieller „Agent 26") wird hier als **möglicher Kandidat benannt, aber ausdrücklich nicht beschlossen**. Grund für die Beobachtung: Agent 15 (Finanz-/Controlling-Agent) ist laut `AGENTS.md` auf Analyse begrenzt („keine Buchhaltung, Steuerberatung, Zahlung oder Investition") – für reale Kundenverträge/Rechnungsstellung der Marketingagentur könnte das auf Dauer zu eng sein. Diese Einschätzung ersetzt keine Jamal-Entscheidung.

## Entscheidungsprozess

1. HR-/Team-Agent (18) beobachtet die oben genannten Lücken über die ersten realen Testläufe (Health-Referenz, Marketingagentur-Pilot) hinweg.
2. HR-/Team-Agent (18) dokumentiert Häufigkeit und Auswirkung anhand echter, nicht hypothetischer Vorfälle.
3. HR-/Team-Agent (18) legt Jamal eine Empfehlung vor (Training bestehender Agent vs. externe Fachperson vs. neuer Agent).
4. **Entscheidung ausschließlich durch Jamal.** Kein Agent entscheidet selbst über seine eigene Kompetenzerweiterung oder über eine Erhöhung der Agentenzahl.
5. Bis zu einer expliziten Jamal-Entscheidung bleibt es bei 25 Agenten und der bestehenden Aufgabenverteilung.
