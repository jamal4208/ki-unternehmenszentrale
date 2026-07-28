# HEALTH REFERENCE WORK RUN

Stand: 2026-07-28 · Lauf V7.6.4 · lokal umgesetzt, **keine Health-Datei verändert, kein Commit, kein Push in diesem Lauf.**

Dieses Dokument ist die **maßgebliche, kanonische Beschreibung** des ersten echten, kontrollierten Referenz-Arbeitslaufs der KI-Unternehmenszentrale am Health Upgrade Kompass (`health-reference-work-run-v1`). Es ersetzt für den tatsächlichen Lauf die ursprüngliche Planung in `INTERNAL_PROJECT_REFERENCE_PLAN.md` (Testlauf 1) und referenziert weiterhin `HEALTH_REFERENCE_FINISH_PLAN.md` als fachliche Pflichtumfang-Quelle. Keine doppelte, widersprüchliche Dokumentation.

## Grundsatz

„Wir arbeiten operativ am Health Upgrade Kompass. Die KI-Unternehmenszentrale übernimmt Führung, Struktur, Agentenzuordnung, Freigaben, Qualität und Abschlussnachweis."

Dieser Lauf implementiert **keine** Health-Funktion. Er verankert ausschließlich den verbindlichen Health-Ergebniswunsch, die Agentenzuordnung, Arbeitspakete, Freigabegrenzen, messbare Abschlusskriterien, den Übergabevertrag an Cursor sowie Fortschritts-/Ergebnisnachweise – bis zu Jamals abschließender Referenzfreigabe.

## 1. Kanonischer Referenzlauf

| Feld | Wert |
|---|---|
| Lauf-ID | `health-reference-work-run-v1` (genau ein Lauf, idempotent) |
| Titel | „Health Upgrade Kompass bis zum abnehmbaren Referenz-Walkthrough führen" |
| Projekt | Health Upgrade Kompass |
| Projektpfad (reine Referenz, read-only) | `/Users/jamal/Documents/New project/health-upgrade-kompass` |
| Ergebniswunsch | „Der Health Upgrade Kompass durchläuft stabil und nachvollziehbar den vollständigen Referenzweg von Start und sechs Antworten über Ergebnis und Beraterinnenübergabe bis zum Kundenbereich und kann von Jamal anhand eines dokumentierten Walkthroughs abgenommen werden." |
| Startstatus | `PREPARED_FOR_EXECUTION` (keine Behauptung, Health sei bereits `REFERENCE_READY`) |

## 2. Agentenzuteilung (ausschließlich bestehende kanonische Agenten)

| Rolle | Agent (kanonisch, `agent-registry.js`) | Fokus |
|---|---|---|
| Hauptverantwortlicher (genau einer) | **Projektmanager-Agent** | Hält Ergebnisverantwortung, zerlegt den Finish in kontrollierte Arbeitspakete, verhindert Scope-Ausweitung, übergibt an die Ausführungsebene, prüft Rückmeldungen, eskaliert Entscheidungen an Jamal, erklärt den Lauf erst nach Abnahme für abgeschlossen. |
| Fachagent 1 von max. 3 | **Produktmanager-Agent** | Prüft Nutzerfluss, Start-Gate, Verständlichkeit, mobile Nutzung, klare nächste Schritte, keine unnötige Komplexität. |
| Fachagent 2 von max. 3 | **Entwickler-Agent** | Technische Umsetzungsvorbereitung: Persistenz, Flow-Stabilität, Fehlerfälle, Tests, keine Phase-2-Waagenintegration. |
| Fachagent 3 von max. 3 | **Content-Agent** | Texte, Beraterinnenübergabe, Kundenbereich, Walkthrough-Dokumentation, Ehrlichkeitsgrenzen, Referenznachweis. |
| QA-/Sicherheitsagent (genau einer) | **QA-Agent** | Prüft Abschlusskriterien, Datenschutz, fehlende Rechtstexte, technische Grenzen; keine falsche Produktionsreife, keine echte Waagenbehauptung, keine automatische externe Aktion. |

Kein neuer Agent, kein Agent 26. Das kanonische 25-Agenten-Register (`agent-registry.js`) bleibt unverändert; jeder Name wird bei Modul-Ladezeit gegen `ROLE_NAME_MAPPING` geprüft und wirft bei einer unbekannten Rolle einen Fehler (kein erfundener Agent möglich).

## 3. Sieben Arbeitspakete (nur vorbereitet, keines in diesem Lauf ausgeführt)

| # | Schlüssel | Titel | Umfang |
|---|---|---|---|
| 1 | `HEALTH_BASELINE_CONFIRMATION` | Health-Ausgangsstand bestätigen | Branch, HEAD, Tests, aktueller Flow; vorhandene Funktionen; offene Lücken; keine Änderungen |
| 2 | `START_GATE_AND_ENTRY` | Start-Gate und Einstieg | Start; erste klare Handlung; Start-Gate; keine tote oder verwirrende Einstiegssituation |
| 3 | `SIX_ANSWERS_AND_RESULT` | Sechs Antworten und Ergebnis | sechs Antworten; Validierung; Ergebnis; verständliche Fehlerfälle; mobile Nutzbarkeit |
| 4 | `ADVISOR_HANDOFF_AND_CUSTOMER_AREA` | Beraterinnenübergabe und Kundenbereich | Beraterinnenübergabe; Kundenbereich; klare nächste Schritte; keine unbestätigten externen Aktionen |
| 5 | `PERSISTENCE_PRIVACY_AND_LEGAL_BOUNDARIES` | Persistenz, Datenschutz und Rechtsgrenzen | nur notwendige Persistenz; Consent; Datenschutzgrenzen; Rechtstexte und offene Fachprüfung; keine medizinische Überbehauptung |
| 6 | `REFERENCE_WALKTHROUGH_AND_QA` | Referenz-Walkthrough und QA | vollständige Teststrecke; mobile Prüfung; sichtbare Ergebnisse; dokumentierte Abweichungen; Referenzartefakt |
| 7 | `JAMAL_FINAL_ACCEPTANCE` | Jamals finale Abnahme | Jamals Walkthrough; offene Punkte; Freigabe oder Rückgabe; erst danach Status `REFERENCE_READY` |

## 4. Verbindliche Nicht-Ziele

Echte Waagenhardware, BLE, Yolanda-SDK, neue Scale-UI, automatische Hardwareerkennung, Google Workspace, Finance, Marketingagentur, Expansion-App-Abtrennung, vollständiger Produktionsbetrieb, automatische Veröffentlichung, automatische Kundenkommunikation, automatische Freigaben, neue Agenten, Agent 26. Die bestehende Scale-V1-Vorarbeit bleibt ausdrücklich **Phase 2**.

## 5. Sieben Jamal-Freigabepunkte

| Schlüssel | Freigabe |
|---|---|
| `SCOPE` | Scope-Freigabe |
| `EXECUTABLE_WORK_ORDER` | Freigabe eines ausführbaren Cursor-Arbeitsauftrags |
| `SCOPE_EXTENSION` | Freigabe jeder relevanten Scope-Erweiterung |
| `LEGAL_PRIVACY_WORDING` | Freigabe rechtlicher oder datenschutzrelevanter Formulierungen |
| `PRE_COMMIT` | Freigabe vor Commit |
| `PRE_PUSH` | Freigabe vor Push |
| `FINAL_REFERENCE_ACCEPTANCE` | Finale Referenzabnahme (ausschließlich über `recordFinalAcceptance({ confirmed: true })`, nicht über die generische Freigabe-Route erreichbar) |

Kein Agent darf selbst committen, selbst pushen, den Scope eigenständig erweitern, Rechtstexte als geprüft behaupten, eine echte Waagenfunktion behaupten oder Health als produktionsreif erklären.

## 6. Übergabevertrag an die Ausführungsebene (Cursor)

Der Projektmanager-Agent bereitet aus einem freigegebenen Arbeitspaket (`prepareWorkPackagePromptDraft`) einen standardisierten, rein textuellen Cursor-Prompt-Entwurf vor. Dieser enthält verbindlich:

- Projektpfad (`/Users/jamal/Documents/New project/health-upgrade-kompass`)
- Branch/Ausgangs-HEAD des Health-Repositories, live und read-only über das bestehende `health-repo-status.js` zum Vorbereitungszeitpunkt gelesen (kein neuer Git-Zugriff, kein Schreibzugriff)
- Ergebnisziel des Arbeitspakets
- erlaubte Dateien (wird erst bei Jamal-Freigabe je Arbeitspaket konkret benannt, ausschließlich innerhalb des Health-Repository-Pfads)
- verbotene Dateien (alles außerhalb des Health-Repository-Pfads, bestehende Testdateien dürfen nicht gelöscht/abgeschwächt werden, keine Secrets/Zugangsdaten)
- fachlicher Umfang und Nicht-Ziele des Arbeitspakets
- Testanforderungen (alle bestehenden Health-Tests bleiben grün, `npm test` lokal ausführen, kein Testfall wird entfernt/abgeschwächt)
- Sicherheitsgrenzen (keine echte Waagenhardware/BLE/Yolanda-SDK, keine externen Requests/Login/OAuth/Mailversand, keine Veröffentlichung/Deployment, keine medizinische Überbehauptung)
- erwarteter Git-Status nach Abschluss
- `autoCommitAllowed: false`, `autoPushAllowed: false`, `commitRequiresJamalApproval: true`, `pushRequiresJamalApproval: true` — **keine automatische Commit-/Push-Freigabe**
- Berichtsanforderungen (Zusammenfassung, geänderte/neue Dateien, Testergebnis, tatsächliche Laufzeit, offene Punkte)

Der Entwurf setzt das Arbeitspaket und ggf. den Gesamtlauf auf `WAITING_FOR_JAMAL_APPROVAL`. **Keine automatische Ausführung implementiert** – Jamal kopiert oder genehmigt den Auftrag manuell außerhalb dieses Laufs.

## 7. Statusmodell

**Wichtige Trennung (seit V7.6.4):** Einzelne Arbeitspakete und der Gesamtlauf besitzen zwei unterschiedliche, aber konsistent geführte Statuswerte-Räume. Ein abgeschlossenes Arbeitspaket (`COMPLETED`) bedeutet **nicht**, dass der gesamte Referenzlauf oder Health fertig ist.

**Arbeitspaket-Status (12 Werte):** `PREPARED_FOR_EXECUTION` → `WAITING_FOR_JAMAL_APPROVAL` → `APPROVED_FOR_EXECUTION` → `IN_EXECUTION` → `RESULT_SUBMITTED` → `QA_REVIEW` → `CHANGES_REQUESTED`/`COMPLETED` (Pakete 1–6) bzw. `WAITING_FOR_FINAL_ACCEPTANCE` (Paket 7, `JAMAL_FINAL_ACCEPTANCE`), daneben `BLOCKED`/`CANCELLED`. `COMPLETED` existiert ausschließlich als Arbeitspaket-Status, nicht als Laufstatus.

**Laufstatus (11 Werte, unverändert):** `PREPARED_FOR_EXECUTION` → `WAITING_FOR_JAMAL_APPROVAL` → `APPROVED_FOR_EXECUTION` → `IN_EXECUTION` → `RESULT_SUBMITTED` → `QA_REVIEW` → `CHANGES_REQUESTED`/`WAITING_FOR_FINAL_ACCEPTANCE` → `REFERENCE_READY`, daneben `BLOCKED`/`CANCELLED`. Der Laufstatus wird nach jedem Paket-Statuswechsel (`syncRunStatusToActivePackage`) automatisch vom Status des ersten noch nicht abgeschlossenen/abgebrochenen Arbeitspakets ("aktives Paket") abgeleitet: Ist Paket 1 `COMPLETED` und Paket 2 `WAITING_FOR_JAMAL_APPROVAL`, zeigt der Lauf ebenfalls `WAITING_FOR_JAMAL_APPROVAL`; wird ein Paket auf `APPROVED_FOR_EXECUTION` gesetzt, führt der Lauf denselben Zwischenzustand sichtbar mit. Explizite `BLOCKED`/`CANCELLED`/`REFERENCE_READY`-Zustände des Laufs werden dabei nicht überschrieben.

**Bevorzugte Regel für den Paketabschluss:**

- Pakete 1–6: QA bestanden (`submitQaFinding(passed=true)`) → Paketstatus `COMPLETED`.
- Paket 7 (`JAMAL_FINAL_ACCEPTANCE`): QA bestanden → Paketstatus `WAITING_FOR_FINAL_ACCEPTANCE` (kein automatisches `COMPLETED`, da hier die Gesamtabnahme ansteht).
- Gesamter Lauf: erst nach bestätigter finaler Abnahme → `REFERENCE_READY`.

**`REFERENCE_READY` ist ausschließlich über `recordFinalAcceptance({ confirmed: true })` erreichbar** — kein automatischer Sprung, kein Abschluss allein aufgrund grüner Tests, kein Abschluss allein aufgrund eines `COMPLETED`-Arbeitspakets. Technisch abgesichert:

- `recordFinalAcceptance` ohne `confirmed === true` wird abgewiesen.
- `submitQaFinding(passed=true)` erreicht niemals `REFERENCE_READY` (setzt maximal `COMPLETED`/`WAITING_FOR_FINAL_ACCEPTANCE`/`QA_REVIEW`).
- `transitionWorkPackage` lehnt `REFERENCE_READY` als Ziel generell ab.
- `recordApproval` lehnt `FINAL_REFERENCE_ACCEPTANCE` als generische Freigabe ab.
- Nach `REFERENCE_READY` ist der Lauf unveränderlich (`assertRunIsMutable` blockiert jede weitere Schreibaktion).

`nextWorkPackage` liefert das erste Arbeitspaket in der Sequenz, dessen Status weder `COMPLETED`, `REFERENCE_READY` noch `CANCELLED` ist. Der Fortschritt („X von 7 Arbeitspaketen abgeschlossen") zählt ausschließlich Pakete mit Status `COMPLETED` oder `REFERENCE_READY`; `WAITING_FOR_FINAL_ACCEPTANCE`, `QA_REVIEW`, `RESULT_SUBMITTED`, `CHANGES_REQUESTED` und `BLOCKED` zählen ausdrücklich nicht als abgeschlossen.

## 8. Abschlusskriterien für `REFERENCE_READY`

1. Startseite funktioniert
2. Start-Gate ist verständlich und stabil
3. sechs Antworten sind vollständig möglich
4. Ergebnis erscheint korrekt und verständlich
5. Beraterinnenübergabe ist nachvollziehbar
6. Kundenbereich ist erreichbar und verständlich
7. keine tote Hauptnavigation existiert
8. mobile Hauptstrecke ist geprüft
9. relevante Tests sind grün
10. Datenschutz- und Ehrlichkeitsgrenzen sind sichtbar
11. Scale-Funktion bleibt klar als Demo/Phase 2 abgegrenzt
12. Walkthrough-Protokoll ist vorhanden
13. bekannte Restpunkte sind dokumentiert
14. Jamal hat den Referenz-Walkthrough ausdrücklich freigegeben

## 9. UI

Kompakte Cockpit-Karte „Health-Referenzlauf" (`index.html#health-reference-run-card`, gerendert von `health-reference-work-run-ui.js`) nach dem Grundsatz „Oben arbeiten. Unten nachschauen.":

- **Oben sichtbar:** Projekt, Ergebniswunsch, aktueller Status, Hauptverantwortlicher, nächstes Arbeitspaket, größter Blocker, Fortschritt als „X von 7 Arbeitspaketen" (kein erfundener Prozentwert), eine klare nächste Handlung.
- **Aufklappbar darunter:** Agentenzuordnung, sieben Arbeitspakete, Nicht-Ziele, Freigaben, Abschlusskriterien, Ergebnis-/QA-Nachweise.
- **Zulässige Aktionen:** Lauf ansehen, Arbeitspaket ansehen, Prompt-Entwurf vorbereiten, Jamal-Freigabe dokumentieren; die finale Abnahme erfordert eine ausdrückliche Bestätigung außerhalb der Schaltfläche.
- **Keine Schaltfläche führt eine echte Health-Ausführung, einen Commit oder einen Push aus.** Alle schreibenden Aktionen laufen ausschließlich über `/api/health-reference/*` mit bestehendem CSRF-/Origin-/OWNER_ONLY-Muster.

## 10. Persistenz und Audit

Additive **Migration 16** (`health_reference_runs`, `health_reference_work_packages`, `health_reference_approvals`, `health_reference_results`; Migrationen 1–15 unverändert) sowie additive **Migration 17** (V7.6.4: eigenständiger, um `COMPLETED` erweiterter Wertebereich für `health_reference_work_packages.status` plus erneute Audit-Ereignistyp-Erweiterung; Migrationen 1–16 unverändert, keine destruktive Änderung, Tabellen unter Versionsnamen neu angelegt und Daten verlustfrei kopiert). Gespeichert werden ausschließlich Lauf-ID, Projekt, Ergebniswunsch, Agentenzuordnung, Arbeitspaketstatus, Jamal-Freigaben, Ergebnisberichte, QA-Befunde, Abschlussnachweis, Zeitstempel und Auditverweise — **keine** Health-Nutzerdaten, **keine** medizinischen Daten, **keine** aus dem Health-Repository kopierten personenbezogenen Daten.

Zehn neue, datensparsame Audit-Ereignistypen: `HEALTH_REFERENCE_RUN_CREATED`, `HEALTH_REFERENCE_WORK_PACKAGE_PREPARED`, `HEALTH_REFERENCE_PROMPT_DRAFT_CREATED`, `HEALTH_REFERENCE_APPROVAL_RECORDED`, `HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED`, `HEALTH_REFERENCE_QA_FINDING_RECORDED`, `HEALTH_REFERENCE_CHANGES_REQUESTED`, `HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED`, `HEALTH_REFERENCE_REFERENCE_READY_GRANTED`, `HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED` (neu, V7.6.4: protokolliert jeden Arbeitspaket-Statuswechsel, Metadaten ausschließlich `healthReferenceRunId`, `workPackageKey`, `previousStatus`, `nextStatus` — keine Berichte, Inhalte oder Gesundheitsdaten).

## 11. API

Eine neue OWNER_ONLY-GET-Route (`GET /api/health-reference/status`) und ein neuer POST-Aktions-Prefix `/api/health-reference/:action` (`ensure-run`, `prepare-work-package-prompt`, `record-approval`, `transition-work-package`, `submit-result-report`, `submit-qa-finding`, `request-changes`, `record-final-acceptance`, `block-or-cancel-run`). Identisches Sicherheitsmuster wie bestehende Owner-Routen (Origin-/Host-Prüfung, CSRF-Pflicht, Bodylimit, Known-fields-Allowlist, `Cache-Control: no-store`). Keine Login-/Send-/Deploy-/Commit-/Push-Route. Details: `API_REGISTER.md`.

## 12. Referenznachweis (dieser Lauf, V7.6.4)

- Health-Repository ausschließlich read-only gelesen (`work/check-start-gate-2026-07-19`, HEAD `81dca3a9967b1763d7b3e881fffe213fe64f9d62`, Working Tree sauber) — unverändert am Ende dieses Laufs.
- Exakt 25 kanonische Agenten unverändert, kein Agent 26.
- Migration 17 additiv (`COMPLETED`-Paketstatus, `HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED`-Audit-Ereignistyp), Migrationen 1–16 unverändert.
- Persistierter Zustand des kanonischen Referenzlaufs kontrolliert über `transitionWorkPackage` korrigiert: Paket `HEALTH_BASELINE_CONFIRMATION` (1) → `COMPLETED`; Paket `START_GATE_AND_ENTRY` (2) unverändert `WAITING_FOR_JAMAL_APPROVAL`, nicht freigegeben, nicht ausgeführt; Laufstatus → `WAITING_FOR_JAMAL_APPROVAL`; Fortschritt 1 von 7; `nextWorkPackage = START_GATE_AND_ENTRY`; `REFERENCE_READY` weiterhin nicht gesetzt.
- Keine neuen Testdateien, acht bestehende Dateien geändert (`health-reference-work-run.test.js` 22→33, `health-reference-work-run-security.test.js` 25→34, `health-reference-work-run-ui.test.js` 21→24 = 23 neue Prüfpunkte); Gesamtstand real gemessen: **2477** Prüfpunkte (vorher 2454, Delta +23) in weiterhin **86** Testdateien grün.
- `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert.
- Kein Commit, kein Push, kein Deployment in diesem Lauf.

## 13. Urteil

Die KI-Unternehmenszentrale kann einzelne Health-Arbeitspakete nun korrekt abschließen, ohne den gesamten Referenzlauf vorzeitig als fertig zu markieren. `HEALTH_BASELINE_CONFIRMATION` ist abgeschlossen und `START_GATE_AND_ENTRY` wartet als nächster kontrollierter Schritt auf Freigabe.

**Nächster Schritt (separate Freigabe erforderlich):** Die verantwortliche Leitung prüft und genehmigt den `START_GATE_AND_ENTRY`-Prompt.
