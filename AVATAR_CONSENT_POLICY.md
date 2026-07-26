# Avatar- und Persönlichkeitsrechte-Grundsatz (KI-Unternehmenszentrale)

**Stand:** V7.2 Phase B – Schutz- und Einwilligungsgrundlage, vor Commit der Self-Service-Korrektur.
**Status dieses Dokuments:** Verbindlicher Produktgrundsatz, **kein** fertiger Consent-Prozess,
**keine** juristische Prüfung. Der technische Umsetzungsbaustein („Avatar Consent & Identity
Verification") ist ein eigener, noch offener Folgeschritt (siehe Abschnitt 6).

## 1. Verbindlicher Grundsatz

> Kein realistischer Avatar einer echten Person ohne direkte, dokumentierte und widerrufbare
> Zustimmung der dargestellten Person.

Dieser Grundsatz gilt für jede Erzeugung eines realistischen Abbilds (Bild, Stimme, Video, digitaler
Avatar) einer identifizierbaren echten Person durch die KI-Unternehmenszentrale oder über
angebundene Werkzeuge (z. B. HeyGen), unabhängig davon, ob die dargestellte Person Kunde,
Mitarbeiter, Testimonial oder Dritte ist.

## 2. Was NICHT als ausreichender Nachweis gilt

- Die **bloße Behauptung des Auftraggebers**, die Zustimmung liege vor, reicht **nicht** aus.
- Ein einzelnes, unspezifisches Ankreuzfeld ohne Bezug zur konkreten Person, zum konkreten Zweck und
  ohne Widerrufsmöglichkeit reicht **nicht** aus.
- **Ausdrücklich unzureichend im aktuellen Code:** Das bestehende boolesche Feld
  `avatarConsentConfirmed` (aus V7.1 Phase B, `heygen-job-package.js`) ist eine reine
  Selbstbestätigung des anfragenden Akteurs ohne Zweckbindung, ohne Nachweis der Identität der
  dargestellten Person und ohne Widerrufsmechanismus. Es ist als **vorläufiger, unzureichender
  Platzhalter** zu behandeln – **nicht** als Nachweis im Sinne dieses Grundsatzes, insbesondere nicht
  für Drittanbieterfälle (dargestellte Person ≠ Auftraggeber selbst).

## 3. Anforderungen an eine ausreichende Zustimmung (Zielbild, noch nicht technisch umgesetzt)

Eine ausreichende Zustimmung muss künftig mindestens umfassen:

- **Direkte Zustimmung der dargestellten Person selbst** (nicht des Auftraggebers stellvertretend).
- **Identitäts-/Liveness-Prüfung** der zustimmenden Person – separat zu prüfender, eigener
  technischer Baustein (siehe Abschnitt 6).
- **Zweckbindung**: wofür genau (welche Kampagne/welches Produkt) die Zustimmung gilt.
- **Erlaubte Marken und Kanäle**: für welche Marke(n) und auf welchen Kanälen (z. B. nur intern,
  nur bestimmte Social-Media-Kanäle, nur Website) die Nutzung erlaubt ist.
- **Erlaubte Bild-/Stimmnutzung**: ob Bild, Stimme oder beides erfasst ist.
- **Erlaubte Sprachen**: in welchen Sprachen ein Avatar sprechen darf.
- **Laufzeit**: befristete Gültigkeit statt unbefristeter Nutzung.
- **Widerruf**: die dargestellte Person kann die Zustimmung jederzeit zurückziehen; ab Widerruf darf
  keine weitere Nutzung erfolgen.
- **Keine Weitergabe an andere Mandanten**: eine für Mandant A erteilte Zustimmung gilt niemals
  automatisch für Mandant B.
- **Keine Nutzung außerhalb des erlaubten Zwecks**, auch nicht durch denselben Mandanten.
- **Freigabe des fertigen Ergebnisses durch die dargestellte Person** vor jeder Veröffentlichung –
  zusätzlich zur ursprünglichen Grundsatz-Zustimmung.
- **Artikel-50-Prüfung** (EU-KI-VO, Kennzeichnungspflicht für synthetische Inhalte) **vor jeder
  Veröffentlichung** eines Avatar-Ergebnisses – eigener, separater Prüfschritt, in diesem Stand
  **nicht** technisch umgesetzt.
- Eine spätere technische Kennzeichnung synthetischer Inhalte (z. B. Wasserzeichen/Metadaten) wird,
  sobald umgesetzt, **nicht beliebig durch Kunden oder Mandanten abschaltbar** sein.

## 4. Connys Testfall (geplanter Referenz- und Testfall)

- Conny ist die **geplante erste echte Testperson** für einen vollständigen, dokumentierten
  Einwilligungsprozess.
- Bilder, Sprachaufnahmen und Videos sollen **bis Ende August 2026** vorbereitet werden.
- **In diesem Schritt (V7.2 Phase B) gibt es ausdrücklich noch keinen echten Consent-Datensatz, keine
  Avatar-Datenbank und keinen Avatar-Erstellungsprozess.** Es handelt sich um eine reine
  Produktankündigung/-planung an dieser Stelle, keine technische Umsetzung.

## 5. Verhältnis zu bestehendem Code

- `heygen-job-package.js` (V7.1 Phase B, unverändert durch diesen Schritt) bleibt technisch
  unangetastet – dieses Dokument ändert **keine** bestehende Funktion, sondern hält verbindlich fest,
  dass das dortige `avatarConsentConfirmed`-Feld für Drittanbieterfälle **nicht** als ausreichend
  gilt.
- Es gibt in diesem Schritt **keine neue Avatar-Funktion, keine neue Consent-Tabelle und keine neue
  Avatar-Route**. Das ist bewusst so, wie im Auftrag verlangt ("Keine neue Avatar-Funktion
  implementieren").

## 6. Eigener Folgebaustein

Die vollständige technische Umsetzung dieses Grundsatzes ist ein **eigener, separater Baustein**:

> **Avatar Consent & Identity Verification**

Dieser Baustein umfasst voraussichtlich mindestens: einen strukturierten Consent-Datensatz je
dargestellter Person und Zweck, einen Identitäts-/Liveness-Nachweis, einen Widerrufsmechanismus,
eine Prüfung vor Veröffentlichung (inkl. Artikel-50-Kennzeichnung) sowie eine rechtliche Prüfung der
Vertragsgrundlage (Eskalation an Agent 16, Rechts-/Compliance-Agent, gemäß `AGENTS.md`). Er ist zum
Stand dieses Berichts **nicht begonnen**.
