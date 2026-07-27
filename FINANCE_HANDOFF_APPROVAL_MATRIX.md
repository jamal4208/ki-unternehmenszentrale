# Finance-/Controlling-Handoff-Freigabematrix (V7.6.1)

Die bestehende Capability Gap im Finance-/Controlling-Bereich bleibt
bewusst sichtbar (`agent-organization-service.js#CAPABILITY_GAP`,
`finance-handoff-service.js#FINANCE_CAPABILITY_GAP_STATUS`). V7.6.1 baut
**keinen** vollwertigen Buchhaltungsagenten und **keinen** 26. Agenten.
Stattdessen entsteht ein sicherer, rein vorbereitender Handoff-Korridor.

Finance-Status (`FINANCE_STATUS_VALUES`): `CAPABILITY_GAP` →
`PREPARATION_ONLY` → `SPECIALIST_REVIEW_REQUIRED` →
`JAMAL_APPROVAL_REQUIRED`. Der aktuelle Gesamtstatus ist immer
`PREPARATION_ONLY` – V7.6.1 ändert daran nichts.

| Kategorie | Erlaubt in V7.6.1 | Später benötigte Fachprüfung | Jamal-Freigabe | Externe Wirkung | Rückgängig machbar | Benötigte Integration | Sicherheitsgrenze |
|---|---|---|---|---|---|---|---|
| Reine Sichtung (Belege sammeln/klassifizieren, `RECEIPT_REVIEW`) | Ja – vollständig lokal | Keine zwingend, empfohlen bei Unklarheit | Nein (nur Kenntnisnahme) | Keine | Ja (nur lokaler Datensatz) | Keine | Keine Bankdaten, keine vollständigen Kartennummern |
| Klassifizierungsvorschlag (Kostenstelle/Kategorie, `COST_CLASSIFICATION`) | Ja – vollständig lokal, unverbindlicher Vorschlag | Steuerberatung/Controlling bei Unsicherheit | Nein (Vorschlag, keine Buchung) | Keine | Ja | Keine | Kein verbindliches steuerliches Ergebnis |
| Rechnungsentwurf (`INVOICE_DRAFT`) | Ja – ausschließlich als lokaler Entwurf | Steuerberatung/Buchhaltung vor Versand | Ja, vor jedem späteren Versand | Keine (solange nicht versendet) | Ja | Rechnungs-/Finanzsystem (noch nicht ausgewählt) | Kein Versand, keine Buchung in diesem Lauf |
| Zahlungsvorschlag (`PAYMENT_PROPOSAL`) | Ja – ausschließlich als lokaler Vorschlag | Steuerberatung/Buchhaltung zwingend | Ja, zwingend vor jeder echten Zahlung | Keine (solange nicht ausgeführt) | Ja | Bank-/Zahlungssystem (nicht angebunden) | Kein Bankzugang, keine SEPA-Ausführung |
| Übergabe an Steuerberatung (`ADVISOR_HANDOFF`) | Ja – Zusammenstellung der Unterlagen | Steuerberatung (Empfänger der Übergabe) | Ja, vor tatsächlicher Übermittlung | Gering (Datenübermittlung an Dritte) | Bedingt (Empfänger hat Kopie) | E-Mail/Portal der Steuerberatung (nicht angebunden) | Keine automatische Übermittlung in V7.6.1 |
| Monatsübersicht (`MONTHLY_OVERVIEW`) | Ja – lokale Strukturierung | Controlling/Steuerberatung zur Prüfung | Nein (interne Übersicht) | Keine | Ja | Keine | Keine verbindliche Bilanzaussage |
| Liquiditätsinformation (`LIQUIDITY_NOTE`) | Ja – lokale Strukturierung | Controlling/Steuerberatung zur Prüfung | Nein (interne Übersicht) | Keine | Ja | Keine | Keine Bankkontostände, nur strukturierte Notizen |
| **Echte Buchung** | **Nein – technisch gesperrt** | Steuerberatung/Buchhaltung | Ja, zwingend | Hoch (bilanzwirksam) | Schwer/aufwändig | Lexoffice/Lexware/anderes Buchhaltungssystem | `finance-handoff-service.js` besitzt keine Buchungsfunktion |
| **Echte Zahlung** | **Nein – technisch gesperrt** | Steuerberatung/Buchhaltung | Ja, zwingend | Hoch (finanziell, ggf. irreversibel) | Oft nicht rückgängig machbar | Bank-/Zahlungssystem | Kein Bankzugang vorhanden, kein Code-Pfad zur Zahlung |
| **Versand (Rechnung/Mahnung)** | **Nein – technisch gesperrt** | Steuerberatung/Buchhaltung | Ja, zwingend | Hoch (Außenwirkung gegenüber Dritten) | Schwer (Widerruf nötig) | E-Mail-/Rechnungsversandsystem | Kein Versandmechanismus implementiert |

## Datenmodell-Grenzen (`finance_handoffs`, additiv Migration 15)

- keine echten Bankdaten nötig oder gespeichert
- keine vollständigen Kartennummern
- keine Zugangsdaten
- keine Steuer-ID unnötig gespeichert
- Beträge sind optional (`amount` darf `null` sein)
- keine verbindliche steuerliche Bewertung – `confidence` bleibt ein
  Vertrauensgrad, kein Rechtsurteil
- `executionBlocked` ist per `CHECK (executionBlocked = 1)`-Constraint in
  der Datenbank UND zusätzlich programmatisch in
  `finance-handoff-service.js` fixiert – kein Codepfad kann diesen Wert auf
  `0` setzen
- ein Hinweis auf Steuerberatung/Fachprüfung (`requiredSpecialist`) wird bei
  Bedarf automatisch vorbelegt (`determineRequiredSpecialist`)

## Verweise

- Übergeordnete Systemlandkarte: `APPLE_GOOGLE_OPERATING_MODEL.md`
- Spätere Aktivierungsschritte: `V7.6_FINANCE_ACTIVATION_CHECKLIST.md`
- Code: `finance-handoff-service.js`, `auth-db-migrations.js` (Migration 15)
- API: `GET /api/office-finance/finance-handoffs`,
  `POST /api/office-finance/create-finance-handoff`,
  `POST /api/office-finance/review-finance-handoff`
