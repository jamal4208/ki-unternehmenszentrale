# PROJECT REGISTRY

## Kanonischer Stand V6.39.0

`project-registry.js` ist die einzige verbindliche technische Projektquelle. Sie enthält exakt **17 Projekte** mit stabilen IDs. Frühere Tabellen, Frontend-Seeds und Server-Register bleiben aus Bestandsschutzgründen im Code sichtbar, sind aber keine Quelle für technische Git-, Test- oder Verifizierungswerte.

| Stabile ID | Anzeigename | Modus | Technischer Stand |
|---|---|---|---|
| `ki-unternehmenszentrale` | KI-Unternehmenszentrale | `DEMO` | Git-Stand `main` / `a5367f1` bestätigt; V6.39.0 noch nicht committed |
| `health-upgrade-kompass` | Health Upgrade Kompass | `REAL_VERIFIZIERT` | technischer Pilotstand bestätigt |
| `health-upgrade-karriere` | Health Upgrade Karriere | `PLANUNG` | Technik ungeklärt |
| `expansion-app` | Expansion App | `PLANUNG` | gemeinsame technische Basis mit Health bestätigt; eigene Projektakte offen |
| `flowlingo-portugiesisch-sprachtrainer` | FlowLingo Portugiesisch Sprachtrainer | `PLANUNG` | Technik und Abgrenzung offen |
| `portugiesisch-sprechtrainer` | Portugiesisch-Sprechtrainer | `UNGEKLÄRT` | Identität offen |
| `spanisch-sprechtrainer` | Spanisch-Sprechtrainer | `PLANUNG` | Technik ungeklärt |
| `marketing-agentur-os` | Marketing Agentur OS | `PLANUNG` | Technik ungeklärt |
| `senior-designer-os` | Senior Designer OS | `UNGEKLÄRT` | Projektidentität offen |
| `autopilot-light-system` | Autopilot-Light-System | `PLANUNG` | Einordnung als Projekt, Modul oder Methode offen |
| `prowin-karriere` | proWIN Karriere | `PLANUNG` | Technik ungeklärt |
| `your-day-portugal-2-0` | Your Day / Portugal 2.0 | `PLANUNG` | Abgrenzung offen |
| `your-day-mlm-praesentation` | Your Day / MLM Präsentation | `PLANUNG` | Technik und Freigabeverantwortung ungeklärt |
| `jaco-eventplanung` | JACO Eventplanung | `PLANUNG` | Read-only-Pilot dokumentiert; Technik ungeklärt |
| `jaco-gbr-webseite` | JACO GbR Webseite | `UNGEKLÄRT` | Projektidentität offen |
| `portugiesische-lda-gruendung` | portugiesische Lda-Gründung | `UNGEKLÄRT` | kein belastbarer Projektstand |
| `seminare-und-praesentationen` | Seminare und Präsentationen | `PLANUNG` | Materialien dokumentiert; Gesamtprojekt ungeklärt |

## Health-Pilotakte

- lokaler Pfad: `/Users/jamal/Documents/New project/health-upgrade-kompass`
- Repository: `https://github.com/jamal4208/health-upgrade-kompass.git`
- lokal ausgecheckter Branch: `main`
- lokaler HEAD / Merge-Commit: `bc98b5c`
- erster privater Baseline-Commit: `26f65fe`
- Remote-Referenz `baseline/private-health-expansion-2026-07-11`: `bc98b5c`
- `origin/main`: `1f4f96d`
- letzter bestätigter Working Tree: sauber
- Testbefehl: `npm test`
- bestätigte Tests: Check-Logik OK; exportReadiness tests passed; Consent-Persistenz OK
- Consent-/localStorage-Widerspruch im Health-Projekt: behoben
- kein neues Produktionsdeployment, keine externe Aktion, keine öffentliche Freigabe
- Archive, Backups, Outputs, Partnerunterlagen und ungeklärte Bildbestände bleiben außerhalb der privaten Baseline

Diese Git- und Testwerte sind eine bestätigte Momentaufnahme vom **2026-07-11** und werden nicht automatisch live aktualisiert. `REAL_VERIFIZIERT` bezieht sich ausschließlich auf den technischen Projektstand. Medizinische, fachliche und rechtliche Freigaben sind ausdrücklich nicht erteilt; Produktinhalte bleiben teilweise ungeprüfte interne Prototypinhalte.

Health und Expansion bleiben fachlich getrennte Projekte mit getrennten stabilen IDs. Ihre technische Basis besteht derzeit teilweise aus demselben Ordner und Code. Das ist keine fachliche Zusammenführung und keine Freigabe.

## Betriebs- und Speichergrenzen

- Work bleibt technisch `UNGEKLÄRT`.
- Codex bleibt manuell kontrolliert.
- Manuelle Projekte, Verläufe, Entscheidungen und Notizen werden weiterhin lokal im Browser per `localStorage` gespeichert.
- Kanonische Registerdaten und lokale Managementdaten werden getrennt behandelt; localStorage kann keine kanonischen Git-, Test- oder Sicherheitswerte überschreiben.
- Die Zentrale ist keine autonome Produktivplattform.
- Keine automatische externe Aktion, Git-Aktion, Agentenausführung oder Deploymentfreigabe.

## Historischer Quellbestand vor V6.39.0 (nicht kanonisch)

Die folgende Tabelle bleibt als Migrations- und Aliasnachweis erhalten. Angaben wie `UNGEKLÄRT` zu Health-Pfad oder Repository sind durch die kanonische Health-Pilotakte oben überholt und dürfen nicht mehr als aktueller technischer Stand verwendet werden.

Statuswerte: `BESTÄTIGT`, `TEILWEISE BESTÄTIGT`, `UNGEKLÄRT`.

Für alle Projekte gelten: keine externe Aktion, Speicherung, Veröffentlichung, Zahlung, Vertragsentscheidung oder Plugin-Ausführung ohne Jamal; kleine reversible Schritte und Bestandsschutz.

| Projekt | Varianten | Art / Zweck | Status und Rolle | Nachweis | Pfad / Repository | Agenten | Sicherheitsgrenzen | Nächster Migrationsschritt | Kennzeichnung |
|---|---|---|---|---|---|---|---|---|---|
| KI-Unternehmenszentrale | KI-Zentrum, Unternehmenszentrale | zentrale Steuerungsplattform | V6.38.4; zentrales Steuerungsprojekt | gesamtes Repository | `/Users/jamal/Documents/New project/ki-unternehmenszentrale`; `https://github.com/jamal4208/ki-unternehmenszentrale.git` | alle 25 Hauptagenten | read-only Grundbetrieb; keine externe Aktion oder automatische Schreibfreigabe; Commit/Push nur nach Jamal | Dokumentation prüfen und als Ausgangsstand freigeben | BESTÄTIGT |
| Health Upgrade Kompass | Health-Kompass, Health Upgrade | Health-/Orientierungsprodukt | erstes reales Pilot- und Fokusprojekt; Demo Bereich 1–4 | `app.js`, `server.js`, Portfolio | UNGEKLÄRT | PM, Produkt, Health-Spezialrolle, Compliance, QA | keine Diagnose, Heilversprechen oder medizinische Empfehlung; keine echten Gesundheitsdaten; Waage/Labor außerhalb V1, Waage Phase 2 | lokalen Ordner und Repository separat prüfen | BESTÄTIGT |
| Health Upgrade Karriere | Health Karriere | Karriereprojekt | Registereintrag vorhanden, technischer Projektstand begrenzt | `app.js`, Anbindungscheckliste | UNGEKLÄRT | PM, HR, Content, Compliance | keine verbindliche Karriere-, Vertrags- oder Vergütungszusage; keine externe Kommunikation ohne Jamal – TEILWEISE BESTÄTIGT | Projektübergabe und Quellenbestand erfassen | TEILWEISE BESTÄTIGT |
| Expansion App | Expansion | App-/Projektarbeitsfall | realer zweiter Trainings- und Projektarbeitsfall | `app.js`, `server.js`, Airtable-Doku | UNGEKLÄRT | PM, Produkt, Entwicklung, QA, Compliance | keine rechtsverbindliche Export-/Regulatorikfreigabe, automatische Länderentscheidung, Dokumentenanforderung oder E-Mail; Rechtsprüfung manuell | Ordner/Repository und aktuellen Stand prüfen | BESTÄTIGT |
| FlowLingo Portugiesisch Sprachtrainer | FlowLingo, Flowlingo, Flowlingo Lernprodukt | Sprachlernprodukt | Portfolio-/Arbeitsprojekt | `app.js`, `server.js`, Video-Doku | UNGEKLÄRT | Produkt, Web/App-Design, Content, QA | keine ungeprüfte Veröffentlichung oder automatische Nutzerkommunikation; keine Zusammenführung mit Sprachtrainer-Projekten ohne Jamal – TEILWEISE BESTÄTIGT | Namen und Verhältnis zum Portugiesisch-Sprechtrainer klären | BESTÄTIGT |
| Portugiesisch-Sprechtrainer | FlowLingo möglicherweise verwandt | Sprachlernprojekt | nur Register-/Checklistenbezug | Anbindungscheckliste | UNGEKLÄRT | Produkt, Content, QA | nicht ungeprüft mit FlowLingo gleichsetzen; keine Veröffentlichung/externe Aktion ohne Jamal – TEILWEISE BESTÄTIGT | nicht automatisch mit FlowLingo zusammenführen; Identität klären | TEILWEISE BESTÄTIGT |
| Spanisch-Sprechtrainer | Spanisch Sprechtrainer | Sprachlernprojekt | Lernpfad, Dialoglogik und MVP-Test beschrieben | `app.js`, Anbindungscheckliste | UNGEKLÄRT | Produkt, Content, Web/App-Design, QA | keine ungeprüfte Veröffentlichung; keine automatische Übernahme von FlowLingo-Logik – TEILWEISE BESTÄTIGT | Quellenprojekt und MVP-Stand prüfen | BESTÄTIGT |
| Marketing Agentur OS | Marketing-Agentur, Marketing Agentur | Marketing-/Betriebssystem | dritter Trainings- und Projektarbeitsfall | `index.html`, `app.js`, `server.js` | UNGEKLÄRT | PM, Design, Content, Video, QA | keine automatische Veröffentlichung, externe Kampagne oder Markenfreigabe; Rechteprüfung nicht überspringen | Ordner/Repository und erstes Artefakt prüfen | BESTÄTIGT |
| Senior Designer OS | Senior Designer, Senior Design Manager | Design-Betriebssystem | kein eindeutiger Projektregistereintrag | nur fachliche Designbezüge | UNGEKLÄRT | Design-Director, Web/App-Design, Bildwelt, Präsentation | UNGEKLÄRT – keine automatische Zusammenführung mit Marketing Agentur OS; keine finale Designfreigabe ohne Jamal | Existenz und verbindlichen Namen durch Jamal klären | UNGEKLÄRT |
| Autopilot-Light-System | Autopilot, Autopilot V2 | sicherer Arbeitsauftrags-/Steuerungskontext | in Checkliste und Arbeitsstandard genannt | `index.html`, Anbindungscheckliste | UNGEKLÄRT | GF, PM, Compliance, Entwicklung | keine autonome externe Ausführung, automatische Eskalation oder Veröffentlichung; Autonomie nur nach Jamal | abgrenzen, ob Projekt, Modul oder Methode | TEILWEISE BESTÄTIGT |
| proWIN Karriere | ProWin Karriere | Karriere-/Vertriebskontext | Registereintrag vorhanden | `app.js` | UNGEKLÄRT | Vertrieb, HR, Content, Compliance | keine verbindlichen Einkommens-, Karriere- oder Erfolgsaussagen; keine externe Kommunikation ohne Jamal – TEILWEISE BESTÄTIGT | Projektübergabe erstellen | TEILWEISE BESTÄTIGT |
| Your Day / Portugal 2.0 | Your Day, Portugal 2.0 | Portugal-/Kommunikationsprojekt | Portfolio-/Arbeitskontext | `app.js`, `server.js` | UNGEKLÄRT | Strategie, PM, Content, Compliance | keine Finanz-, Gesellschaftsrechts- oder Vertragsentscheidung; keine externe Veröffentlichung ohne Jamal – TEILWEISE BESTÄTIGT | Verhältnis zu MLM-Präsentation klären | BESTÄTIGT |
| Your Day / MLM Präsentation | Your Day Präsentation | Präsentationsprojekt | eigener Arbeitseintrag; Conny-Bezug | `app.js`, `server.js` | UNGEKLÄRT | Präsentation, Content, Design, Compliance | keine unbelegten Leistungs-/Einkommensversprechen; keine Veröffentlichung ohne Jamal – TEILWEISE BESTÄTIGT | Inhalte und Freigabeverantwortung prüfen | BESTÄTIGT |
| JACO Eventplanung | Eventplanung JACO | Airtable-Eventplanung | read-only Pilot-Base dokumentiert | `AIRTABLE_PILOT_SETUP.md`, `app.js` | UNGEKLÄRT | PM, Operations, Compliance | keine Buchung, Zahlung, externe Kommunikation oder personenbezogenen Daten ohne Jamal – TEILWEISE BESTÄTIGT | Projektübergabe ohne Rohdaten erstellen | BESTÄTIGT |
| JACO GbR Webseite | JACO Webseite | Websiteprojekt | nicht als JACO Eventplanung gleichzusetzen | kein eindeutiger Registereintrag | UNGEKLÄRT | Web/App-Design, Content, Entwicklung, QA | UNGEKLÄRT – keine Veröffentlichung/rechtlich verbindlichen Angaben; Impressum, Datenschutz und Kontaktdaten nur nach Prüfung/Jamal | Existenz, Ordner und Repository durch Jamal klären | UNGEKLÄRT |
| portugiesische Lda-Gründung | Lda-Gründung | Gesellschafts-/Gründungsprojekt | kein eindeutiger Projektstand | kein belastbarer Nachweis | UNGEKLÄRT | Strategie, Finanz, Rechts/Compliance | UNGEKLÄRT – keine Rechtsberatung, Vertragsentscheidung, Behördenkommunikation, Zahlung oder Gründungshandlung | Quellen und fachliche Zuständigkeit klären | UNGEKLÄRT |
| Seminare und Präsentationen | Seminare, Präsentationen | Content-/Veranstaltungsbereich | Präsentations- und Videoarbeitslogik vorhanden, kein konsolidiertes Projekt | Video-Doku, Präsentationsagent, Your-Day-Eintrag | UNGEKLÄRT | Präsentation, Content, Video, Design | keine Veröffentlichung, Teilnehmerkommunikation oder verbindliche Termin-/Inhaltsfreigabe ohne Jamal – TEILWEISE BESTÄTIGT | einzelne Projekte und Materialien inventarisieren | TEILWEISE BESTÄTIGT |

## Bekannte Widersprüche

- FlowLingo und Portugiesisch-Sprechtrainer können identisch, verwandt oder getrennt sein.
- Your Day, Portugal 2.0, proWIN und MLM-Präsentation überlappen, sind aber nicht verbindlich zusammengeführt.
- JACO Eventplanung belegt nicht die Existenz oder Identität der JACO GbR Webseite.

## Noch zu normalisieren

Namensschreibweisen, Projektarten, lokale Pfade, Repositories und verbindliche Zuständigkeiten.

## Entscheidung durch Jamal erforderlich

Identität und Trennung der genannten Varianten sowie Bestätigung aller derzeit `UNGEKLÄRT` markierten Projekte.
