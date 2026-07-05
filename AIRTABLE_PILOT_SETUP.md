# Airtable Pilot Setup V6.1.0

## Zweck Von V6.1.0

V6.1.0 bereitet den ersten sicheren Airtable Read-only Connection-Test fuer eine lokale Test-Base vor.

Der Test ist nur fuer lokale Pilotpruefung gedacht. Er schreibt keine Daten, synchronisiert nichts und zeigt keine Airtable-Felder oder Recorddaten im Browser an.

## Airtable-Test-Base Manuell Anlegen

Empfohlener Base-Name:

- `KI Unternehmenszentrale Pilot`

Empfohlene Tabelle:

- `Projects`

## Minimale Testfelder

Lege in der Tabelle `Projects` diese Felder an:

- `Projekt-ID`
- `Projektname`
- `Status`
- `Prioritaet`
- `Naechster manueller Schritt`
- `Freigabestatus`
- `Notiz`

## Datenregeln

Nur Testdaten verwenden.

Verboten sind:

- echte Kundendaten
- Finanzdaten
- sensible personenbezogene Daten
- echte produktive Projektdaten
- Zugangsdaten
- Tokens
- API-Keys

## Lokale Konfiguration

Das Airtable Personal Access Token wird nur lokal in `.env.local` eingetragen.

Token niemals eintragen in:

- ChatGPT
- Frontend-Dateien
- `app.js`
- `index.html`
- `styles.css`
- Backups
- Git
- Projektdokumentation

## Benoetigte `.env.local`-Variablen

Diese Datei wird lokal manuell erstellt und nicht committed:

```env
PORT=4173
AIRTABLE_PAT=<lokal eintragen>
AIRTABLE_BASE_ID=<lokal eintragen>
AIRTABLE_TABLE_PROJECTS=Projects
AIRTABLE_ENABLE_CONNECTION_TEST=true
```

Nach dem Test kann der Connection-Test wieder deaktiviert werden:

```env
AIRTABLE_ENABLE_CONNECTION_TEST=false
```

## Sicherheitsregeln

- `.env.local` wird nicht gesichert.
- `.env.local` wird nicht committed.
- `.env.local` wird nicht im Chat geteilt.
- `.env.example` enthaelt nur Platzhalter.
- Der Connection-Test ist read-only.
- Der Connection-Test liest maximal 1 Record.
- Der Connection-Test gibt keine Record-Felder zurueck.
- Der Connection-Test gibt keine Recorddaten zurueck.
- Schreiben bleibt verboten.
- Synchronisierung bleibt verboten.
- Loeschen bleibt verboten.
- Automatisierung bleibt verboten.

## Erlaubter Test

Nach lokaler Jamal-Freigabe und lokaler `.env.local` kann manuell getestet werden:

```bash
curl http://127.0.0.1:4173/api/airtable/test-connection
```

Erwartung:

- `ok` ist `true` oder `false`
- `recordsReceivedCount` ist `0` oder `1`
- `fieldsReturnedToBrowser` ist `false`
- keine Felder
- keine Recorddaten
- keine Secrets
- kein Schreiben
- kein Sync
- kein Loeschen

## Nicht Erlaubt

- kein automatischer Test beim App-Start
- keine Schreib-Endpunkte
- keine POST/PUT/PATCH/DELETE-Endpunkte
- keine n8n-Verbindung
- keine Notion-Verbindung
- keine Slack-Verbindung
- keine Google-Verbindung
- keine Kundendaten
- keine Finanzdaten

## V6.2.0 Airtable-Strukturplan

V6.2.0 plant die spaetere Airtable-Struktur fuer die echte KI-Unternehmenszentrale.

Dieser Schritt ist keine echte Airtable-Integration.

Es gilt:

- Airtable ist technisch erreichbar, aber nicht produktiv freigegeben.
- V6.2.0 plant nur die spaetere Struktur.
- Keine Datenuebernahme.
- Keine Synchronisierung.
- Keine Schreibrechte.
- Keine Automatisierung.
- Keine echten Airtable-Datensaetze anzeigen oder abfragen.

Aktueller Status:

- Phase 0: Strukturplan vorbereitet.

## Geplante Tabellen

### Projektregister

Zweck:

- zentrale Uebersicht aller Projekte

Moegliche Felder:

- Projekt-ID
- Projektname
- Bereich
- Status
- naechster manueller Schritt
- offene Entscheidung
- Risiko/Blocker
- Prioritaet
- letzte Aktualisierung

### Entscheidungen

Zweck:

- Jamals offene und getroffene Entscheidungen sauber dokumentieren

Moegliche Felder:

- Entscheidungs-ID
- Projektbezug
- Entscheidungsfrage
- Optionen
- Empfehlung
- Risiko
- Jamals Entscheidung
- Status
- Datum

### Agentenregister

Zweck:

- Rollen, Einsatzbereiche und Grenzen der Agenten dokumentieren

Moegliche Felder:

- Agent-ID
- Agentenname
- Rolle
- Kategorie
- Ausbildungsstand
- erlaubter Spielraum
- harte Grenzen
- naechster Trainingsschritt

### Tagesfuehrung

Zweck:

- Morgenbriefing, Tagesfokus und Abendabschluss strukturieren

Moegliche Felder:

- Datum
- Tagesfokus
- wichtigster naechster Schritt
- Blocker
- offene Entscheidung
- Abendabschluss
- Status

### Wissensbausteine

Zweck:

- freigegebenes Unternehmenswissen, SOPs und Regeln verwalten

Moegliche Felder:

- Wissens-ID
- Kategorie
- Quelle
- Kurzfassung
- Gueltigkeit
- Freigabestatus
- Datenschutz-Hinweis

### Plugin- und Integrationsregister

Zweck:

- Tools, Zugriffe und Risiken kontrolliert planen

Moegliche Felder:

- Tool/Plugin
- Zweck
- Status
- Zugriffsstufe
- erlaubte Nutzung
- verbotene Aktionen
- Risiko
- naechster Pruefschritt

### Supportfaelle

Zweck:

- spaetere Support- und Klaerfaelle strukturieren

Moegliche Felder:

- Fall-ID
- Projekt/Quelle
- Kategorie
- Dringlichkeit
- Status
- Agentenvorschlag
- naechster manueller Schritt

### HR-Agententraining

Zweck:

- taegliche 1%-Verbesserungen und Autonomie-Vorschlaege fuer Agenten dokumentieren

Moegliche Felder:

- Agent
- Trainingsvorschlag
- 1%-Verbesserung
- moeglicher neuer Spielraum
- Risiko/Grenze
- Jamals Freigabe
- naechster manueller Schritt

## Datenklassifizierung

Darf spaeter eventuell nach Airtable:

- Projekt-Metadaten
- Statusinformationen
- naechste Schritte
- Entscheidungsnotizen
- Agentenrollen
- freigegebene SOPs
- Plugin-Status
- Dummy-Testdaten

Darf nicht nach Airtable ohne separate Freigabe:

- Tokens
- Secrets
- Passwoerter
- private E-Mails
- Bankdaten
- Steuerunterlagen
- Gesundheitsdaten
- Kundendaten
- Ausweisdaten
- vertrauliche Vertraege
- echte personenbezogene Daten

## Rechte- und Phasenmodell

- Phase 0: Lokaler Strukturplan, keine Airtable-Aktion
- Phase 1: Airtable nur read-only Schema pruefen
- Phase 2: Dummy-Testdaten read-only pruefen
- Phase 3: ausgewaehlte echte Projekt-Metadaten nur nach manueller Freigabe
- Phase 4: kontrollierte Schreibaktionen erst nach separater Sicherheitsfreigabe

## Erste spaetere Pilot-Tabelle

Empfehlung:

- Projektregister

Begruendung:

Das Projektregister ist der Kern der Unternehmenszentrale. Es hilft bei Tagesfuehrung, Projektfortsetzung, Entscheidungen, Agentenwahl und Statusklarheit. Trotzdem darf es zunaechst nur lokal geplant werden.

## V6.2.0 Nicht Erlaubt

- kein Schreibbutton
- kein Synchronisieren-Button
- kein Airtable aktualisieren
- kein Datenimport
- kein Datenexport
- keine echten Airtable-Inhalte
- keine produktive Integration

## V6.2.1 Projektregister-Pilot Spezifikation

V6.2.1 spezifiziert die erste spaetere Pilot-Tabelle fuer Airtable.

Aktueller Status:

- lokale Spezifikation
- nicht produktiv
- keine Airtable-Aktion
- keine echten Projektdaten
- keine Schreibrechte

Zweck der Pilot-Tabelle:

- Das Projektregister soll spaeter die zentrale Uebersicht aller Projekte bilden.
- Es soll Tagesfuehrung, Projektfortsetzung, Entscheidungen, Agentenwahl und Statusklarheit unterstuetzen.
- In V6.2.1 wird nur die Struktur lokal geplant.

## Tabelle: Projektregister

### Feldliste

#### Projekt-ID

- Feldtyp: Text / eindeutiger Schluessel
- Pflichtfeld: ja
- Zweck: stabile interne Referenz
- Beispiel: `PRJ-DEMO-001`

#### Projektname

- Feldtyp: Einzeiliger Text
- Pflichtfeld: ja
- Zweck: verstaendlicher Projektname
- Beispiel: `Demo-Projekt`

#### Bereich

- Feldtyp: Einfachauswahl
- Pflichtfeld: ja
- Werte:
  - Unternehmenszentrale
  - Health App
  - Expansion App
  - Marketing Agentur
  - Praesentationen
  - Admin/Finanzen
  - Sonstiges

#### Status

- Feldtyp: Einfachauswahl
- Pflichtfeld: ja
- Werte:
  - Idee
  - vorbereitet
  - aktiv
  - wartet auf Entscheidung
  - blockiert
  - in Pruefung
  - abgeschlossen
  - archiviert

#### Prioritaet

- Feldtyp: Einfachauswahl
- Pflichtfeld: ja
- Werte:
  - niedrig
  - normal
  - hoch
  - kritisch

#### Naechster manueller Schritt

- Feldtyp: Mehrzeiliger Text
- Pflichtfeld: ja
- Zweck: sagt Jamal, was als Naechstes konkret zu tun ist

#### Offene Entscheidung

- Feldtyp: Mehrzeiliger Text
- Pflichtfeld: nein
- Zweck: zentrale Entscheidungsfrage

#### Risiko/Blocker

- Feldtyp: Mehrzeiliger Text
- Pflichtfeld: nein
- Zweck: Hindernisse, Unklarheiten, Risiken

#### Empfohlener Agent

- Feldtyp: Einfachauswahl oder spaeter Verknuepfung zum Agentenregister
- Pflichtfeld: nein
- Zweck: welcher Agent sinnvoll unterstuetzen kann

#### Entscheidungsbezug

- Feldtyp: Text oder spaeter Verknuepfung zur Tabelle Entscheidungen
- Pflichtfeld: nein
- Zweck: Verbindung zu offenen/getroffenen Entscheidungen

#### Letzte Aktualisierung

- Feldtyp: Datum/Uhrzeit
- Pflichtfeld: ja
- Zweck: Aktualitaet sichtbar machen

#### Freigabestatus

- Feldtyp: Einfachauswahl
- Pflichtfeld: ja
- Werte:
  - lokal
  - fuer Airtable vorgemerkt
  - read-only geprueft
  - manuell freigegeben
  - gesperrt

#### Datenschutzklasse

- Feldtyp: Einfachauswahl
- Pflichtfeld: ja
- Werte:
  - unkritisch
  - intern
  - vertraulich
  - gesperrt

## Mindestfelder Fuer Spaetere Pilotfaehigkeit

Ohne diese Felder darf ein Projekt spaeter nicht in einen Airtable-Pilot uebernommen werden:

- Projekt-ID
- Projektname
- Bereich
- Status
- Prioritaet
- Naechster manueller Schritt
- Letzte Aktualisierung
- Freigabestatus
- Datenschutzklasse

## Statuswerte

- Idee = noch nicht entschieden
- vorbereitet = Struktur vorhanden, aber noch nicht aktiv
- aktiv = wird aktuell bearbeitet
- wartet auf Entscheidung = Jamal muss entscheiden
- blockiert = naechster Schritt nicht moeglich
- in Pruefung = Qualitaet/Sicherheit/Freigabe wird geprueft
- abgeschlossen = erledigt
- archiviert = nicht mehr aktiv

## Prioritaetswerte

- niedrig = beobachten
- normal = bei Gelegenheit bearbeiten
- hoch = bald bearbeiten
- kritisch = braucht kurzfristige Entscheidung oder Aktion

## Datenschutzgrenzen

Bleibt lokal:

- vollstaendige Projektverlaeufe
- vertrauliche Notizen
- private oder personenbezogene Informationen
- echte E-Mail-Inhalte
- Steuer-/Bank-/Gesundheitsdaten
- Tokens, Secrets, technische Zugangsdaten
- unfertige interne Gedanken oder Rohnotizen

Darf spaeter eventuell nach Airtable:

- Projekt-ID
- Projektname
- Bereich
- Status
- Prioritaet
- naechster manueller Schritt
- offene Entscheidung, wenn freigegeben
- Risiko/Blocker ohne vertrauliche Details
- empfohlener Agent
- letzte Aktualisierung
- Freigabestatus
- Datenschutzklasse

## Dummy-Beispiele

Nur Dummy-Beispiele, keine echten Projektdaten:

- Projekt-ID: `PRJ-DEMO-001`
- Projektname: `Demo-Projekt Tagesfuehrung`
- Bereich: `Unternehmenszentrale`
- Status: `vorbereitet`
- Prioritaet: `normal`
- Naechster manueller Schritt: `Feldstruktur pruefen`
- Datenschutzklasse: `unkritisch`

## V6.2.1 Nicht Erlaubt

- keine Airtable-API aufrufen
- keine Datensaetze abfragen
- keine echten Airtable-Daten anzeigen
- nichts schreiben, aendern, erstellen oder loeschen
- keine Synchronisierung
- kein Import
- kein Export
- keine Automatisierung
- keine `.env.local` erstellen
- keine Tokens oder Secrets anzeigen
- keine echten Projektdaten nach Airtable uebertragen

## V6.2.2 Projektregister-Pruefansicht

Aktueller Status:

- lokale Pruefung
- keine Airtable-Aktion
- keine Uebertragung

Die Projektregister-Pruefansicht hilft Jamal spaeter lokal zu pruefen, ob ein Projekt grundsaetzlich geeignet waere, in eine Airtable-Projektregister-Pilotstruktur aufgenommen zu werden.

Sie beantwortet lokal:

- Sind die Mindestfelder vorhanden?
- Ist der naechste manuelle Schritt klar?
- Gibt es offene Entscheidungen?
- Gibt es Datenschutz- oder Geheimhaltungsrisiken?
- Ist das Projekt nur lokal, vorgemerkt oder gesperrt?
- Was muesste Jamal noch bereinigen, bevor Airtable ueberhaupt infrage kommt?

## Mindestpruefung Fuer Airtable-Projektregister-Tauglichkeit

- Projekt-ID vorhanden
- Projektname vorhanden
- Bereich ausgewaehlt
- Status gesetzt
- Prioritaet gesetzt
- naechster manueller Schritt klar formuliert
- letzte Aktualisierung vorhanden
- Freigabestatus gesetzt
- Datenschutzklasse gesetzt
- keine sensiblen Inhalte im Airtable-faehigen Kurztext
- keine Tokens, Secrets, privaten E-Mails, Bank-, Steuer-, Gesundheits- oder Kundendaten
- Jamal hat spaetere Airtable-Vormerkung manuell erlaubt

## Ampellogik

### Gruen - spaeter pilotfaehig

- Mindestfelder vollstaendig
- Datenschutzklasse unkritisch oder intern
- keine sensiblen Inhalte
- naechster manueller Schritt klar
- manuelle Freigabe moeglich

### Gelb - Nachbearbeitung noetig

- einzelne Pflichtfelder fehlen
- naechster Schritt ist unklar
- Risiko/Blocker muss gekuerzt oder entschaerft werden
- Datenschutzklasse muss geprueft werden
- offene Entscheidung fehlt oder ist zu lang/unklar

### Rot - nicht Airtable-geeignet

- Datenschutzklasse gesperrt
- vertrauliche oder personenbezogene Inhalte enthalten
- Tokens, Secrets, private E-Mails, Bank-, Steuer- oder Gesundheitsdaten enthalten
- Jamal hat keine Freigabe gegeben
- Projekt ist zu roh oder nur interne Notiz

## Blocker-Regeln

Sofort gesperrt fuer Airtable, wenn enthalten:

- Tokens
- Secrets
- Passwoerter
- private E-Mail-Inhalte
- Bankdaten
- Steuerunterlagen
- Gesundheitsdaten
- Kundendaten
- Ausweisdaten
- vertrauliche Vertraege
- echte personenbezogene Daten
- unfertige Rohnotizen mit vertraulichem Inhalt

## Ergebnisformat

Lokales Pruefergebnis:

- Projekt:
- Ergebnis: Gruen / Gelb / Rot
- Fehlende Pflichtfelder:
- Datenschutz-Hinweis:
- Freigabe noetig:
- Empfohlene Aktion:
- Darf spaeter eventuell nach Airtable: Ja / Nein / erst nach Bearbeitung

Dieses Format ist nur eine lokale Anzeige. Es gibt keine echte Pruefung gegen Airtable und keine Uebertragung.

## V6.2.2 Nicht Erlaubt

- keine Airtable-API aufrufen
- keine Datensaetze abfragen
- keine echten Airtable-Daten anzeigen
- nichts nach Airtable uebertragen
- nichts schreiben, aendern, erstellen oder loeschen
- keine Synchronisierung
- kein Import
- kein Export
- keine Automatisierung
- keine `.env.local` erstellen
- keine Tokens oder Secrets anzeigen
- keine echten Projektdaten nach Airtable senden

## V6.2.3 Projektregister-Auswahlhilfe

Aktueller Status:

- lokale Auswahlhilfe
- keine Airtable-Aktion
- keine Freigabeautomatik

Die Projektregister-Auswahlhilfe hilft Jamal spaeter zu entscheiden, welches Projekt sich als erster Airtable-Projektregister-Pilot eignet.

Sie beantwortet lokal:

- Ist das Projekt ueberschaubar genug?
- Sind Status und naechster Schritt klar?
- Enthaelt es keine sensiblen Daten?
- Ist der Nutzen fuer die Tagesfuehrung hoch?
- Gibt es wenig Risiko bei einer spaeteren read-only Vormerkung?
- Muss Jamal vorher noch etwas bereinigen?

## Auswahlkriterien

Gute Pilotkandidaten haben:

- klaren Projektname
- klaren Bereich
- klaren Status
- klaren naechsten manuellen Schritt
- niedrige Datenschutzrisiken
- keine vertraulichen Inhalte im Kurztext
- hohen Nutzen fuer Tagesfuehrung und Projektfortsetzung
- wenig Abhaengigkeit von externen Systemen
- keine Kundendaten, Bankdaten, Steuerdaten, Gesundheitsdaten oder privaten E-Mails
- Jamals spaetere manuelle Freigabe moeglich

Schlechte Pilotkandidaten sind:

- vertraulich
- personenbezogen
- rechtlich oder steuerlich sensibel
- gesundheitlich sensibel
- nur Rohnotizen
- abhaengig von E-Mail-, Bank-, Steuer- oder Kundendaten
- noch nicht klar genug beschrieben
- ohne naechsten manuellen Schritt

## Eignungslogik

### Pilotfaehig

- Projekt ist klar beschrieben
- naechster Schritt ist konkret
- Datenschutzklasse unkritisch oder intern
- keine sensiblen Inhalte
- Jamal koennte spaeter manuell freigeben

### Nachbearbeitung noetig

- einzelne Angaben fehlen
- naechster Schritt ist unklar
- Risiko/Blocker muss gekuerzt werden
- Datenschutzklasse fehlt oder muss geprueft werden
- Projekt ist grundsaetzlich geeignet, aber noch nicht sauber genug

### Nicht geeignet

- enthaelt vertrauliche, personenbezogene oder gesperrte Inhalte
- enthaelt Tokens, Secrets, private E-Mails, Bank-, Steuer-, Gesundheits- oder Kundendaten
- ist zu roh oder nur interne Notiz
- Jamal hat keine Freigabe gegeben

## Ausschlussregeln

Nicht als Pilotkandidat verwenden, wenn enthalten:

- Tokens
- Secrets
- Passwoerter
- private E-Mail-Inhalte
- Bankdaten
- Steuerunterlagen
- Gesundheitsdaten
- Kundendaten
- Ausweisdaten
- vertrauliche Vertraege
- echte personenbezogene Daten
- unfertige Rohnotizen mit vertraulichem Inhalt

## Manuelle Freigabegrenze

Auch wenn ein Projekt lokal als pilotfaehig erscheint, bedeutet das nur:

- theoretisch geeignet
- lokal vorbereitet
- noch nicht uebertragen
- noch nicht freigegeben
- noch nicht produktiv

Eine spaetere Airtable-Vormerkung darf nur nach Jamals ausdruecklicher manueller Freigabe erfolgen.

## Empty State Bei 0 Projekten

Wenn keine lokalen Projekte vorhanden sind, zeigt die App:

- Noch keine lokalen Projekte fuer die Auswahlhilfe vorhanden.
- Die Auswahlhilfe ist vorbereitet.
- Sobald lokale Projekte vorhanden sind, kann Jamal sie manuell pruefen.
- Es wird nichts automatisch nach Airtable uebertragen.

## V6.2.3 Nicht Erlaubt

- keine Airtable-API aufrufen
- keine Datensaetze abfragen
- keine echten Airtable-Daten anzeigen
- nichts nach Airtable uebertragen
- nichts schreiben, aendern, erstellen oder loeschen
- keine Synchronisierung
- kein Import
- kein Export
- keine Automatisierung
- keine `.env.local` erstellen
- keine Tokens oder Secrets anzeigen
- keine echten Projektdaten nach Airtable senden
- keine harte automatische Freigabe einbauen

## V6.2.4 Projektregister-Freigabeprotokoll

Aktueller Status:

- lokales Freigabeprotokoll
- keine Airtable-Aktion
- keine echte Freigabe

Das Projektregister-Freigabeprotokoll hilft Jamal spaeter, bewusst zu dokumentieren, ob ein Projekt fuer eine moegliche Airtable-Projektregister-Vormerkung geeignet ist.

Das Protokoll beantwortet lokal:

- Soll dieses Projekt spaeter fuer Airtable vorgemerkt werden?
- Warum ja oder warum nein?
- Welche Datenschutzklasse gilt?
- Welche Risiken oder Blocker gibt es?
- Welche sensiblen Inhalte muessen ausgeschlossen bleiben?
- Welche manuelle Entscheidung hat Jamal getroffen?
- Was ist der naechste sichere manuelle Schritt?

## Lokales Protokollformat

- Projekt:
- Projekt-ID:
- Pruefergebnis aus V6.2.2: Gruen / Gelb / Rot
- Auswahlhilfe aus V6.2.3: Pilotfaehig / Nachbearbeitung noetig / Nicht geeignet
- Jamals Entscheidung: Freigeben / Zur Nachbearbeitung / Ablehnen
- Begruendung:
- Datenschutzklasse: unkritisch / intern / vertraulich / gesperrt
- Enthaelt sensible Inhalte: Ja / Nein / unklar
- Risiko-Hinweis:
- Blocker:
- Naechster manueller Schritt:
- Spaetere Airtable-Vormerkung erlaubt: Ja / Nein / erst nach Bearbeitung
- Datum der lokalen Entscheidung:
- Hinweis: keine Uebertragung, keine Airtable-Aktion

Das ist nur ein Anzeigeformat. Keine echte Freigabe. Keine Uebertragung. Keine Airtable-Aktion.

## Entscheidungslogik

### Freigeben

Nur moeglich, wenn:

- Mindestfelder vollstaendig
- Datenschutzklasse unkritisch oder intern
- keine sensiblen Inhalte enthalten
- naechster manueller Schritt klar
- Jamal ausdruecklich spaeter freigibt

### Zur Nachbearbeitung

Wenn:

- Pflichtfelder fehlen
- Datenschutzklasse noch unklar ist
- Kurztext bereinigt werden muss
- offene Entscheidung zu lang oder unklar ist
- Risiko/Blocker entschaerft werden muss

### Ablehnen

Wenn:

- Datenschutzklasse vertraulich oder gesperrt ist
- personenbezogene oder vertrauliche Inhalte enthalten sind
- Bank-, Steuer-, Gesundheits-, Kunden- oder private E-Mail-Daten enthalten sind
- Tokens, Secrets oder Passwoerter enthalten sind
- Projekt nur Rohnotiz oder intern vertraulich ist

## Freigabe-Checkliste

Vor spaeterer Airtable-Vormerkung muss Jamal pruefen:

- Sind Projekt-ID und Projektname sauber?
- Ist der Bereich richtig?
- Ist der Status aktuell?
- Ist der naechste manuelle Schritt klar?
- Sind vertrauliche Details entfernt?
- Sind personenbezogene Daten entfernt?
- Sind Tokens, Secrets, private E-Mails, Bank-, Steuer- und Gesundheitsdaten ausgeschlossen?
- Ist die Datenschutzklasse korrekt?
- Ist die spaetere Vormerkung wirklich sinnvoll?
- Hat Jamal ausdruecklich manuell entschieden?

## Sperrgruende

Sofort ablehnen oder lokal behalten, wenn enthalten:

- Tokens
- Secrets
- Passwoerter
- private E-Mail-Inhalte
- Bankdaten
- Steuerunterlagen
- Gesundheitsdaten
- Kundendaten
- Ausweisdaten
- vertrauliche Vertraege
- echte personenbezogene Daten
- unfertige Rohnotizen mit vertraulichem Inhalt

## Audit- Und Sicherheitshinweis

Das Freigabeprotokoll dokumentiert nur lokal eine spaetere Absicht. Es fuehrt nichts aus.

Auch bei Freigeben gilt:

- keine Airtable-Uebertragung
- keine Synchronisierung
- kein Import
- kein Export
- keine Schreibaktion
- keine produktive Freigabe
- spaetere echte Airtable-Nutzung nur nach separater technischer Sicherheitsfreigabe

## V6.2.4 Nicht Erlaubt

- keine Airtable-API aufrufen
- keine Datensaetze abfragen
- keine echten Airtable-Daten anzeigen
- nichts nach Airtable uebertragen
- nichts schreiben, aendern, erstellen oder loeschen
- keine Synchronisierung
- kein Import
- kein Export
- keine Automatisierung
- keine `.env.local` erstellen
- keine Tokens oder Secrets anzeigen
- keine echten Projektdaten nach Airtable senden
- keine automatische Freigabe einbauen
