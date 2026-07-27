# Apple-first / Google-controlled – Systemlandkarte (V7.6.1)

Status: **vollständig offline vorbereitet**. Dieses Dokument beschreibt die
verbindliche Zielarchitektur für die Aufteilung zwischen Jamals persönlichem
Apple-Arbeitsraum und dem kontrollierten Google-Workspace-Unternehmensraum.
Es ist die menschenlesbare, ausführliche Fassung der kompakten
Systemlandkarte, die `office-finance-routes.js#SYSTEM_MAP` in der neuen
Ansicht „Office & Finanzen" anzeigt (eine einzige inhaltliche Wahrheit, hier
nur ausführlicher begründet).

Kein Teil dieses Dokuments beschreibt eine bereits durchgeführte Aktion.
Alles unten Beschriebene ist **Zielbild**, nicht Ist-Zustand: Es besteht in
V7.6.1 keine echte Google-Verbindung, kein OAuth, keine Apple-Datenmigration.

## 1. Persönlicher Apple-Arbeitsraum

**Verbindliche Aussage:** Apple bleibt persönlicher Arbeitsraum. Die
geschäftlichen `@jacogbr.de`-Identitäten liegen im kontrollierten
Google-Workspace-Raum.

Apple bleibt **zunächst führend** für:

- Jamals persönlichen Kalender
- persönliche Kontakte
- private Notizen
- Erinnerungen
- Fotos
- private Dokumente
- die persönliche iPhone-/Mac-Arbeitsweise

Die Unternehmenszentrale liest, migriert oder verändert keine Apple-Daten.
Apple ist hier ausschließlich eine **Systemzuständigkeit** (siehe oben) –
keine E-Mail-Identität und kein technischer Kontenanbieter. Es existiert
bewusst **keine erfundene Apple-E-Mail-Identität**: `external-identity-service.js`
führt `jamal@jacogbr.de`, `office@jacogbr.de` und `info@jacogbr.de` als
geschäftliche Adressen der Unternehmensdomäne einheitlich mit Provider
`GOOGLE_WORKSPACE` (technischer Konto-/Mailanbieter), unabhängig von der
jeweiligen `identityType`-Rolle (`OWNER_PERSONAL`/`COMPANY_OFFICE`/
`PUBLIC_INBOX`). `provider` und `identityType` beantworten zwei getrennte
Fragen: `provider` = technischer Konto-/Mailanbieter, `identityType` =
geschäftliche Rolle. Apple-first bedeutet nicht automatisch, dass eine
`@jacogbr.de`-Adresse den Provider `APPLE` erhält. Alle drei Datensätze
bleiben ausschließlich strukturierte Referenz – niemals ein Zugriffspunkt
auf ein echtes Postfach/Kalender/Kontaktbuch.

## 2. Geschäftlicher Google-Unternehmensraum

Google Workspace wird **zunächst führend** für:

- `office@jacogbr.de`
- geschäftliche Office-Kommunikation
- den Unternehmenskalender
- zentrale Unternehmensdokumente
- kontrollierte Agentenentwürfe
- Projekt- und Übergabedokumente
- spätere Gmail-/Drive-/Calendar-/Contacts-Korridore
- nachvollziehbare Freigaben
- zukünftige Zusammenarbeit

`office@jacogbr.de` ist lokal nicht nachweisbar eingerichtet. Der Status
lautet ausdrücklich `ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION` –
keine Annahme wird als Tatsache dokumentiert. Bestätigung erfolgt in einem
separaten, späteren Schritt außerhalb von Cursor.

## 3. Datenhoheit je System

| Datenart | Führendes System | Begründung |
|---|---|---|
| Persönlicher Kalender/Kontakte/Notizen/Fotos | Apple | Jamals privater Arbeitsraum, keine geschäftliche Pflicht zur Zentralisierung |
| Geschäftliche E-Mail/Kalender/Dokumente | Google Workspace | zentraler, kontrollierbarer Unternehmensraum mit Agentenzugriff über Korridore |
| Agentenentwürfe (E-Mail/Termin/Dokument/Kontakt) | lokale SQLite (`office_work_items`) | einzige Quelle für den Vorbereitungszustand, bevor irgendein Provider beteiligt ist |
| Finance-/Belegdaten | lokale SQLite (`finance_handoffs`), Zielsystem noch offen | Capability Gap – kein Buchhaltungssystem angebunden |

## 4. Zulässige Überschneidungen

- Ein Termin kann fachlich sowohl für Jamal persönlich als auch für das
  Unternehmen relevant sein (`systemResponsibility` im Kalender-Korridor
  markiert dies pro Terminentwurf als `APPLE` oder `GOOGLE_WORKSPACE`).
- `jamal@jacogbr.de` kann als Owner Office-Aufträge freigeben, auch wenn die
  Ausführung selbst über `office@jacogbr.de` liefe.

## 5. Verbotene Doppelpflege

- Keine zwei Kalender für dieselbe geschäftliche Terminserie ohne klare
  Führung.
- Keine parallele, manuell gepflegte zweite Kontaktliste außerhalb von
  Apple/Google.
- Keine zweite Office-Auftragsliste außerhalb von `office_work_items`
  (SQLite bleibt einzige Quelle).
- Keine zweite Fähigkeitsliste außerhalb von
  `google-workspace-capability-service.js`.

## 6. Kalenderstrategie

Apple bleibt für Jamals persönlichen Kalender führend. Ein
Unternehmenskalender unter `office@jacogbr.de` wird vorbereitet, aber in
V7.6.1 nicht gelesen, geprüft oder beschrieben. Der lokale
Kalender-Offline-Korridor (`office-work-service.js#prepareCalendarDraft`)
erfasst Terminwünsche rein lokal und markiert jeden Entwurf ausdrücklich als
`AVAILABILITY_NOT_VERIFIED` – es gibt keine echte Verfügbarkeitsprüfung.

## 7. Kontaktstrategie

Persönliche Kontakte bleiben in Apple. Geschäftliche Kontakte/Stakeholder
werden über den Kontakt-Korridor (`prepareContactSearchRequest`) als reine
Suchaufträge mit erwartetem Namen, Firma, Rolle und Zweck erfasst – niemals
werden echte Kontakte gelesen oder verändert.

## 8. Dokumentenstrategie

Zentrale Unternehmensdokumente sollen künftig in Google Drive/Docs unter
`office@jacogbr.de` liegen. Der Drive-/Dokumenten-Korridor
(`prepareDocumentDraft`) bereitet Dokumententwürfe, Ordnerpläne,
Dateinamenskonventionen, Übergabedokumente, Sitzungsnotizen,
Entscheidungsvorlagen, Projektstatus- und Prozessbeschreibungen lokal vor –
ohne jemals eine echte Drive-Datei zu lesen, zu erstellen, zu verschieben,
zu teilen oder zu löschen.

## 9. E-Mail-Strategie

`office@jacogbr.de` wird die geschäftliche Kommunikationsadresse,
`info@jacogbr.de` bleibt die allgemeine Außen- und Erstkontaktadresse. Der
Gmail-Offline-Korridor (`prepareEmailDraft`) klassifiziert E-Mail-Aufträge,
bereitet Empfänger/Betreff/Textvorschlag vor, markiert sensible Inhalte,
beschreibt Anhänge (ohne Upload) und zeigt eine sichere Vorschau – ohne
jemals zu senden, zu speichern, weiterzuleiten, zu archivieren, zu labeln
oder zu löschen.

## 10. Erinnerungs-/Aufgabenstrategie

Persönliche Erinnerungen bleiben in Apple. Geschäftliche Office-Aufträge
laufen ausschließlich über die lokale Tabelle `office_work_items` mit dem in
V7.6.1 maximal erreichbaren Ausführungsstatus
`WAITING_FOR_AUTHENTICATION` – kein „echtes" Aufgabensystem wird angebunden.

## 11. Freigabestrategie

Jede Fähigkeit mit `requiresJamalApproval: true`
(`google-workspace-capability-service.js`) benötigt eine ausdrückliche
Jamal-Entscheidung, bevor überhaupt eine spätere technische Aktivierung in
Frage kommt. Lesen, Vorbereiten und Ausführen sind strikt getrennt (siehe
`GOOGLE_WORKSPACE_APPROVAL_MATRIX.md`). Jamal bleibt in jedem Fall der
einzige Entscheider für eine echte Außenwirkung – kein Agent erhält diese
Befugnis.

## 12. Migrationsstrategie

Es gibt **keine Vollmigration**. Apple-Daten werden nicht automatisch nach
Google übernommen. Eine etwaige, künftige, selektive Übernahme (z. B.
einzelne geschäftliche Termine) wäre ein separates, eigenständiges Vorhaben
mit eigener Freigabe – nicht Teil von V7.6.1 und nicht automatisch aus
diesem Dokument ableitbar.

## 13. Rückfallstrategie

Solange `office@jacogbr.de` nicht bestätigt eingerichtet und authentifiziert
ist, bleibt Apple die einzige tatsächlich nutzbare Plattform für alle
oben genannten persönlichen Datenarten, und alle Office-Aufträge bleiben
lokal im Status `WAITING_FOR_AUTHENTICATION` liegen. Es gibt keinen
automatischen Rückfall, der eine Aktion an einem anderen System versucht.

## 14. Spätere Entscheidungsoptionen (noch nicht festgelegt)

- vollständige Migration alter Apple-Kalendereinträge
- vollständige Kontaktmigration
- vollständige Dokumentmigration
- Google als persönliches Hauptsystem für Jamal
- automatische bidirektionale Synchronisation zwischen Apple und Google

Diese Optionen werden bewusst offengehalten und erfordern jeweils eine
eigene, spätere Entscheidung von Jamal.

## Verweise

- Freigabestufen und Fähigkeiten: `GOOGLE_WORKSPACE_APPROVAL_MATRIX.md`
- Finance-/Controlling-Handoff: `FINANCE_HANDOFF_APPROVAL_MATRIX.md`
- Aktivierungsschritte Google Workspace: `V7.6_GOOGLE_WORKSPACE_ACTIVATION_CHECKLIST.md`
- Aktivierungsschritte Finance: `V7.6_FINANCE_ACTIVATION_CHECKLIST.md`
- Code: `external-identity-service.js`, `google-workspace-capability-service.js`,
  `office-work-service.js`, `finance-handoff-service.js`,
  `google-workspace-connector.js`, `office-finance-routes.js`,
  `office-finance-ui.js`
