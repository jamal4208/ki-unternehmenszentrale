# Business-Use-Policy (KI-Unternehmenszentrale)

**Stand:** V7.2 Phase B – Schutz- und Einwilligungsgrundlage, vor Commit der Self-Service-Korrektur.
**Status dieses Dokuments:** Verbindlicher Produkt- und Technikgrundsatz. **Kein** Ersatz für AGB, kein
Ersatz für eine juristische Prüfung. Konkrete AGB und eine rechtliche Prüfung sind ein separater,
noch offener Baustein (siehe Abschnitt „Was dieses Dokument nicht ist").

## 1. Verbindlicher Zweck

Die KI-Unternehmenszentrale darf ausschließlich für **legitime geschäftliche Zwecke** genutzt werden.

### Beispiele zulässiger Nutzung

- Unternehmenswerbung
- Marketing und Kampagnen
- Websites und Landingpages
- Präsentationen und Dokumente
- Unternehmensprozesse und -strukturen
- Kundenkommunikation
- Projektorganisation
- legitime geschäftliche Recherche und Analyse
- Bild-, Video- und Textproduktion für Unternehmen

### Verboten ist mindestens

- sexualisierte Inhalte mit Minderjährigen
- Ausbeutung oder Gefährdung von Kindern
- rassistische, antisemitische oder menschenverachtende Inhalte
- sexistische, diskriminierende oder gezielt entwürdigende Inhalte
- Hass, Gewaltaufrufe oder Verfolgung
- Betrug, Identitätsmissbrauch oder gefälschte Nachweise
- kriminelle oder illegale Zwecke
- rechtswidrige Überwachung oder Ausspähung
- politische Manipulation oder täuschende Einflussnahme
- Verletzung von Persönlichkeitsrechten
- Verletzung von Marken- oder Urheberrechten
- rechtlich sensible Nutzung außerhalb des zugelassenen geschäftlichen Rahmens

## 2. Jamals Rolle: Betreiber, nicht fachlicher Prüfer

- Jamal (OWNER) ist **Plattformbetreiber**, kein regulärer fachlicher Prüfer jedes Kundenauftrags.
- **Normale, legitime Aufträge laufen ohne Jamals Beteiligung** durch den automatischen
  Self-Service-Fluss (siehe `work-order-service.js`, Statuswerte `SUBMITTED → READY_FOR_PROCESSING`
  bzw. `→ NEEDS_CLARIFICATION`).
- Jamal greift **ausschließlich** in folgenden Ausnahmefällen ein (siehe auch
  `AGENTS.md`-Eskalationsspalte für Agent 1/10/16): Sicherheit, Missbrauch, rechtliche Sensibilität,
  außergewöhnliche Kosten, technische Blockade, explizite Eskalation.
- Diese Ausnahmerolle ist technisch als genau zwei Owner-Aktionen abgebildet: **Eskalieren**
  (`→ ESCALATED`) und **Stoppen** (`→ CANCELLED`), beide mit Pflichtgrund. Es gibt keine reguläre
  Owner-Freigabe/-Ablehnung/-Rückfrage.

## 3. Technische Durchsetzung (Stand dieses Schritts)

- Ein **lokales, deterministisches Safety-Gate** (`business-use-policy.js`) prüft jeden Arbeitsauftrag
  **vor** der Speicherung als normaler Auftrag (siehe `work-order-service.js`, aufgerufen aus
  `createForCustomer`/`resubmitForCustomer`, jeweils **vor** dem Schreibzugriff auf `work_orders`).
- Ergebnisse: `ALLOW` (normaler Self-Service-Fluss läuft weiter), `BLOCK` (Auftrag wird **nicht**
  gespeichert, generische Kundenmeldung, keine Agenten-/Toolübergabe), `ESCALATE` (Auftrag wird in
  minimaler Form direkt mit Status `ESCALATED` gespeichert, keine automatische
  `READY_FOR_PROCESSING`-Einstufung, keine Agenten-/Toolübergabe).
- Klar verbotene, eindeutig erkennbare Inhalte werden **blockiert**. Rechtlich/fachlich mehrdeutige
  Grenzfälle werden **eskaliert** statt automatisch freigegeben oder automatisch blockiert.
- Jeder Verstoß/jede Eskalation wird strukturiert protokolliert (`policy_violations`-Tabelle,
  Migration 9) – **ohne** den vollständigen verbotenen Auftragstext zu speichern (siehe
  `SAFETY_ENFORCEMENT_MODEL.md`).

### Was dieses Safety-Gate ausdrücklich NICHT ist

- **Keine** vollständige, verlässliche KI-Inhaltsmoderation.
- **Kein** Ersatz für eine spätere modell- oder providergestützte Prüfung.
- **Kein** abschließender Schutz gegen jede Form von Missbrauch – siehe „Grenzen" in
  `SAFETY_ENFORCEMENT_MODEL.md`.

## 4. Schwere oder wiederholte Verstöße

Die Datengrundlage (`policy_violations`, Migration 9) erlaubt es, Verstöße pro Mandant/Benutzer zu
zählen und nach Schweregrad zu unterscheiden. Je nach Schwere und Häufigkeit **können** folgende
Maßnahmen ergriffen werden:

- Verwarnung
- Auftragssperre (der einzelne Auftrag wird blockiert/eskaliert)
- Benutzersperre
- Sessionwiderruf
- Mandantensperre
- Vertragsbeendigung
- Lizenzentzug

**Wichtig:** In diesem Schritt ist **kein automatischer, endgültiger Lizenzentzug** und **keine
automatische, endgültige Vertragsbeendigung** vorgesehen oder implementiert. Automatische technische
Sofortmaßnahmen sind eng begrenzt auf den einen eindeutig unzulässigen Schweregrad `CRITICAL` (siehe
`SAFETY_ENFORCEMENT_MODEL.md`, Abschnitt „CRITICAL"). Jede weitergehende, dauerhafte Maßnahme
(Vertragsbeendigung, endgültiger Lizenzentzug) bleibt eine **bewusste Betreiberentscheidung** von
Jamal, die eine spätere AGB- und Rechtsgrundlage voraussetzt.

## 5. Was dieses Dokument nicht ist

- Es ersetzt **keine** AGB.
- Es ersetzt **keine** juristische Prüfung.
- Es begründet **keine** fertige, gerichtsfeste Rechtswirksamkeit einer Sperrung, Kündigung oder
  eines Lizenzentzugs.
- Konkrete AGB, eine rechtliche Prüfung der Sanktionsstufen sowie ein förmlicher Einspruchs-/
  Überprüfungsweg für gesperrte Nutzer sind **separate, noch offene Aufgaben** (Eskalation an Agent
  16, Rechts-/Compliance-Agent, gemäß `AGENTS.md`).
