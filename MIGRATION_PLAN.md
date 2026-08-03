# MIGRATION PLAN

## V7.9.9 – Auftragsbezogene Dateiauswahl auf die Nutzerperspektive erweitern: **keine neue Migration**

**Ausdrücklich keine neue Migration, keine neue Spalte, keine neue Tabelle, kein neuer CHECK-Wertebereich, keine Datenbereinigung.** Migrationen 1–24 bleiben unverändert; die höchste Migrationsversion bleibt **24**. Keine bestehende Datenbank wurde verändert oder bereinigt.

Geändert wurde ausschließlich der Inhalt zweier serverseitiger Codekonstanten sowie ein additives, rein lesendes Antwortfeld:

| Bereich | Regel |
|---|---|
| `pilot-agent-execution-service.js` | `CHAIN_SELECTABLE_FILES` **ausschließlich additiv** um `pilot-work-order-ui.js`, `V1_BETRIEBSHANDBUCH.md` und `pilot-work-order-routes.js` erweitert (jetzt sieben Einträge); neue Konstante `CHAIN_RECOMMENDED_USER_PERSPECTIVE_FILES` (genau vier Einträge) mit struktureller Teilmengen-Zusicherung beim Modulladen; `resolveChainSelectedFiles` fachlich unverändert |
| `pilot-work-order-service.js` | additives, rein lesendes Overview-Feld `chainRecommendedFiles` aus derselben serverseitigen Quelle der Wahrheit |
| `pilot-work-order-ui.js` | deterministische Standardvorauswahl aus `chainRecommendedFiles`, verständliche Kennzeichnung der Empfehlung; keine freie Pfadeingabe, keine Auswahlentscheidung durch ein Sprachmodell |

- **Rückwärtskompatibilität (wichtigster Grund für die additive Lösung):** `pilot-agent-execution-chain-service.js` validiert die in `pilot_agent_execution_chains.selectedFilesJson` **gespeicherte** Auswahl bei jedem `getChainView` und jedem `startStep` erneut gegen `CHAIN_SELECTABLE_FILES`. Ein *entfernter* Eintrag hätte damit jede Altkette unlesbar gemacht, die diesen Eintrag gespeichert hat. Da ausschließlich hinzugefügt wurde, bleibt jede bestehende Kette gültig, unverändert lesbar und wird **nicht** nachträglich um die neuen Dateien ergänzt. Eine Altkette ohne fixierte Auswahl (`selectedFilesJson IS NULL`) bleibt unverändert als Altkette markiert und verwendet weiterhin die Preset-Dateien je Stufe. Kein Datenbestand muss nachgezogen werden.
- **Vorwärtskompatibilität:** `chainRecommendedFiles` ist ein zusätzliches Antwortfeld; ein älterer Client, der es nicht kennt, ignoriert es. Fehlt das Feld in einer Antwort (älterer Serverstand), fällt das Cockpit auf das bisherige V7.8.0-Verhalten „vollständige Liste vorausgewählt" zurück.
- **Rollback:** rein codeseitig durch Zurücknehmen der geänderten Dateien. Es gibt keinen Schemaanteil, der zurückgerollt werden müsste. Zu beachten ist ausschließlich: eine *nach* V7.9.9 vorbereitete Kette, die einen der drei neuen Pfade gespeichert hat, wäre nach einem vollständigen Rollback der Allowlist nicht mehr lesbar – seit der erfolgreichen Browser- und Praxisabnahme existiert lokal genau eine solche Kette (`pilot-agent-chain-e5b928e1-1a61-477b-a90b-dc9e01622228` mit der empfohlenen Vierer-Auswahl), ein Rollback der Allowlist muss diese Kette daher ausdrücklich mit bedenken. Der Datenbestand selbst bleibt davon unberührt; es ist weiterhin kein Schema- oder Datenrollback nötig.
- **Offener Folgepunkt (bewusst nicht in V7.9.9 umgesetzt):** eine *echte*, im Datenmodell getrennte auftragsbezogene Auswahlgruppe (Variante B des Auftrags) würde ein zusätzliches persistiertes Gruppenfeld an `pilot_agent_execution_chains` sowie an der Vorbereitungsroute und damit eine neue Migration erfordern. Das wäre keine kleine, sichere Änderung und ist deshalb ausdrücklich zurückgestellt. Bis dahin bleibt die Trennung rein logisch: eine geschlossene Allowlist plus eine deterministische, serverseitig festgelegte Standardvorauswahl.

## V7.9.8 – Ergebnisbudget für die Recherche- und die Projektmanager-Stufe technisch erzwingen: **keine neue Migration**

**Ausdrücklich keine neue Migration, keine neue Spalte, keine neue Tabelle, kein neuer CHECK-Wertebereich.** Migrationen 1–24 bleiben unverändert; die höchste Migrationsversion bleibt **24**. Der bestehende 8.000-Zeichen-CHECK auf dem gespeicherten Ergebnistext bleibt unverändert und wird durch das Stufenbudget von 4.500 Zeichen ohnehin deutlich unterschritten.

Die stufenneutralen Auditmetadaten (`resultNormalization`: angewendeter Stufenvertrag, Vertragsversion, Rohgröße, gespeicherte Größe, Abschnittsgrößen, weggelassene Punkte/Sätze, verworfene Präambel, `compactionApplied`) werden – wie schon in V7.8.1 – ausschließlich in der **bereits bestehenden** Spalte `pilot_agent_execution_runs.resultSummaryJson` geführt. Diese Spalte wird von `authDb.updatePilotAgentExecutionRunTerminal` bereits generisch für jeden Status persistiert und von `rowToAgentExecutionRunView` bereits für jeden Status als `resultSummary` zurückgegeben.

- **Rückwärtskompatibilität:** ein vor V7.9.8 gespeicherter Lauf besitzt `resultSummary.resultNormalization` nicht (`undefined`). Das Cockpit liest in diesem Fall unverändert `documentationNormalization` und zeigt für einen älteren Dokumentationslauf denselben Hinweistext wie bisher; ohne beide Felder erscheint kein Hinweis. Kein Datenbestand muss nachgezogen werden, keine bestehende Kette wird verändert oder fortgeführt.
- **Vorwärtskompatibilität:** `resultNormalization` wird ausschließlich für Läufe **mit** Stufenvertrag geschrieben, also für die drei Kettenstufen. Für Kettenschritt 2 wird zusätzlich das V7.8.1-Feld `documentationNormalization` unverändert weitergeschrieben, damit bestehende Auswertungen exakt gleich bleiben; Schritt 1 und Schritt 3 tragen dieses Feld ausdrücklich nicht. Der bestehende Phase-7-Einzellauf besitzt keinen Stufenvertrag und behält sein `resultSummary` byteidentisch.
- **Rollback:** rein codeseitig durch Zurücknehmen der geänderten Dateien. Es gibt keinen Schemaanteil, der zurückgerollt werden müsste; bereits geschriebene `resultNormalization`-Objekte bleiben als unschädliche Zusatzinformation lesbar.

## V7.8.1 – Ergebnisbudget von Schritt 2 technisch erzwingen: **keine neue Migration**

**Ausdrücklich keine neue Migration, keine neue Spalte, keine neue Tabelle, kein neuer CHECK-Wertebereich.** Migrationen 1–24 bleiben unverändert; die höchste Migrationsversion bleibt **24**.

Die Auditmetadaten der deterministischen Budgetdurchsetzung (`documentationNormalization`: Vertragsversion, Rohgröße, gespeicherte Größe, Abschnittsgrößen, weggelassene Punkte/Sätze, verworfene Präambel, `compactionApplied`) werden ausschließlich in der **bereits bestehenden** Spalte `pilot_agent_execution_runs.resultSummaryJson` geführt. Diese Spalte wird von `authDb.updatePilotAgentExecutionRunTerminal` bereits generisch für jeden Status persistiert und von `rowToAgentExecutionRunView` bereits für jeden Status als `resultSummary` zurückgegeben.

- **Rückwärtskompatibilität:** ein vor V7.8.1 gespeicherter Lauf besitzt das Unterobjekt nicht; `resultSummary.documentationNormalization` ist dort `undefined` und das Cockpit zeigt dafür keinen Hinweis. Kein Datenbestand muss nachgezogen werden.
- **Vorwärtskompatibilität:** das Feld wird ausschließlich für Läufe der Dokumentationsstufe geschrieben (Kettenschritt 2). Läufe von Schritt 1, Schritt 3 und Einzelläufe behalten ihr bisheriges `resultSummary` byteidentisch.
- **Rollback:** rein codeseitig durch Zurücknehmen der geänderten Dateien. Es gibt keinen Schemaanteil, der zurückgerollt werden müsste; bereits geschriebene `documentationNormalization`-Objekte bleiben als unschädliche Zusatzinformation lesbar.

## V7.8.0 – Drei-Agenten-Kette auftragsfähig machen (Migration 24, additiv, lokal umgesetzt, vor Commit/Push gestoppt)

Dieser Schritt erweitert ausschließlich die bestehende Ketten-/Codex-Infrastruktur; keine neue Datenbankarchitektur, keine destruktive Änderung. Migrationen 1–23 bleiben unverändert.

**Neue Migration 24** (`add_chain_mandate_and_predecessor_integrity_metadata_v17`):

| Tabelle | Additive Änderung |
|---|---|
| `pilot_agent_execution_runs` | `promptDigest`, `promptCharCount`, `mandateDigest`, `mandateOrderRevision`, `predecessorCharCount`, `predecessorIncludedCharCount`, `predecessorTruncated`, `resultTruncated` |
| `pilot_agent_execution_chains` | `selectedFilesJson`, `coreMandateJson`, `mandateDigest`, `mandateOrderRevisionAtPrepare` |
| `pilot_agent_execution_chain_steps` | `predecessorCharCount`, `predecessorIncludedCharCount`, `predecessorTruncated`, `roleHandoffBooked`, `roleHandoffBookedAt` |

| Bereich | Regel |
|---|---|
| `pilot-agent-codex-runner.js` | baut den Kernauftrag als eigenen Block in jeden Stufenprompt ein, liefert Digest-/Prompt-/Vorgänger-Metadaten zurück; Vorgängerlimit an Read-only-Grenze gekoppelt |
| `pilot-agent-execution-service.js` | fixierte Dateiauswahl für Kettenläufe (`CHAIN_SELECTABLE_FILES`), Persistenz der neuen Prompt-/Mandat-/Truncation-Metadaten |
| `pilot-agent-execution-chain-service.js` | speichert Ketten-Dateiauswahl/Kernauftrag, prüft Mandat-Digest, blockiert kontrolliert bei zu langem Vorgänger vor Laufstart, bucht Rollenfortschritt je Stufe |
| `auth-db.js` | Insert-/Update-Funktionen für Runs/Ketten/Schritte um alle Migration-24-Spalten erweitert |
| `auth-audit.js` | Allowlist um die neuen, nicht-sensiblen Chain-Metadaten ergänzt (`selectedFilesCount`, `mandateDigest`, `predecessorFullyIncluded`, `pilotRole`, `roleHandoffBooked`) |

Ergebnis: kein neuer HTTP-Top-Level-Pfad, keine neue externe Aktion; bestehende Kettenrouten bleiben bestehen und liefern erweiterte Metadaten. `npm run check` und `npm test` sind grün (Exit 0).

## V7.6.4 – Einzelne Health-Arbeitspakete korrekt abschließen (Migration 17, additiv, lokal umgesetzt, noch nicht committed/gepusht)

Vorheriger Ausgang: HEAD/`origin/main` unverändert `73a6a055414ff4baffa7f8dbf903a6e4a711e37b` (V7.6.3, Working Tree sauber, 89 GET/52 POST/8 GET-Präfixe/8 POST-Präfixe/32 statische Assets, **86 Testdateien, 2454 automatisierte Prüfpunkte grün**, Migration 16). Dieser Schritt ist rein additiv; Migrationen 1–16 byteidentisch unverändert.

**Neue Migration 17** (`add_health_reference_work_package_completed_status_and_status_changed_audit_event_v11`, gleiches bewährte Recreate-Muster wie bei jeder vorherigen CHECK-Erweiterung: Tabelle unter Versionsnamen neu angelegt, Daten verlustfrei kopiert, alte Tabelle gelöscht, umbenannt – SQLite kennt kein `ALTER TABLE ... ALTER COLUMN ... CHECK`):

| Tabelle | Änderung |
|---|---|
| `health_reference_work_packages` | `status`-Spalte erhält einen eigenständigen, um `COMPLETED` erweiterten Wertebereich (`HEALTH_REFERENCE_WORK_PACKAGE_STATUS_VALUES` = `HEALTH_REFERENCE_RUN_STATUS_VALUES` plus `COMPLETED`); `health_reference_runs.status` bleibt unverändert (Laufstatus kennt weiterhin kein `COMPLETED`) |
| `auth_audit_events` | additive Erweiterung um genau einen neuen Ereignistyp über eine neue, additive Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_17` (nicht die veränderliche `AUDIT_EVENT_TYPES`-Live-Konstante) |

Bewusst **kein** paralleles Statusmodell: `COMPLETED` existiert ausschließlich als Arbeitspaket-Status, niemals als Laufstatus; der Laufstatus bleibt weiterhin ausschließlich über `recordFinalAcceptance({ confirmed: true })` nach `REFERENCE_READY` überführbar.

| Bereich | Regel |
|---|---|
| health-reference-work-run-service.js (erweitert) | `syncRunStatusToActivePackage`-Helfer leitet den Laufstatus nach jedem Arbeitspaket-Statuswechsel aus dem Status des ersten nicht abgeschlossenen/abgebrochenen Pakets ab; `submitQaFinding` setzt Pakete 1–6 nach bestandenem QA auf `COMPLETED`, Paket 7 weiterhin auf `WAITING_FOR_FINAL_ACCEPTANCE`; `computeNextAction`/`PROGRESS_COMPLETED_PACKAGE_STATUSES`/`NEXT_PACKAGE_SKIP_STATUSES` für Fortschritt und `nextWorkPackage` |
| health-reference-work-run-ui.js (erweitert) | `biggestBlockerText` nennt jetzt konkret das betroffene Arbeitspaket statt generischem Text |
| auth-db-migrations.js (erweitert, Migration 17) | eigenständiger Wertebereich für `health_reference_work_packages.status` (siehe oben); ein neuer Audit-Ereignistyp; Migrationen 1–16 byteidentisch unverändert |
| auth-audit.js (erweitert) | ein neuer Ereignistyp: `HEALTH_REFERENCE_WORK_PACKAGE_STATUS_CHANGED` (Metadaten ausschließlich `healthReferenceRunId`, `workPackageKey`, `previousStatus`, `nextStatus`) |

Ergebnis: Routenzahlen unverändert **89 GET, 52 POST, 8 GET-Präfixe, 8 POST-Präfixe, 32 statische Assets**, **2477** automatisierte Prüfpunkte in weiterhin **86** Testdateien grün (+23 gegenüber Migration 16), `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert, exakt 25 kanonische Agenten unverändert. Health Upgrade Kompass (`work/check-start-gate-2026-07-19`, HEAD `81dca3a9967b1763d7b3e881fffe213fe64f9d62`) wurde ausschließlich read-only gelesen, nicht verändert. **Lokal umgesetzt, noch nicht committed, gepusht oder deployt.**

**Nachtrag (V7.6.5, Dokumentationsstand):** Migration 17 wurde inzwischen committed und nach `origin/main` gepusht; Migrationen 1–17 sind unverändert und byteidentisch. Der auf dieser Migration aufbauende kanonische Health-Referenzlauf (`health-reference-work-run-v1`) hat seither über mehrere separat freigegebene Arbeitspakete den Endstand **7 von 7, Laufstatus `REFERENCE_READY`** erreicht (Details: `HEALTH_REFERENCE_WORK_RUN.md` Abschnitt 12a, `CURRENT_STATUS.md` V7.6.5). Keine weitere Migration in diesem Nachtrag, keine Schema-Änderung.

## V7.6.3 – Health Upgrade Kompass als ersten echten Referenz-Arbeitslauf verankern (Migration 16, additiv, lokal umgesetzt, noch nicht committed/gepusht)

Vorheriger Ausgang: HEAD/`origin/main` `c9635a56d5fa4fcc730fd7471db5b1cd0ea08aa8` (V7.6.2, Working Tree sauber, 88 GET/52 POST/8 GET-Präfixe/7 POST-Präfixe/31 statische Assets, **83 Testdateien, 2386 automatisierte Prüfpunkte grün**, Migration 15). Dieser Schritt ist rein additiv; Migrationen 1–15 byteidentisch unverändert.

**Neue Migration 16** (vier neue Tabellen plus additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen, gleiches bewährte Recreate-Muster wie bei Migration 14/15: neue Zwischentabelle mit erweitertem `CHECK` über eine neue, additive Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_16` – **nicht** die veränderliche `AUDIT_EVENT_TYPES`-Live-Konstante –, vollständige Datenübernahme, Umbenennung, erneute Anlage der append-only-Trigger/Indizes):

| Tabelle | Zweck | Wichtige Felder/Regeln |
|---|---|---|
| `health_reference_runs` | genau ein kanonischer Health-Referenz-Arbeitslauf | `status` als `CHECK`-Enum (11 Werte, Standard `PREPARED_FOR_EXECUTION`), `mainAgentCanonicalName`/`qaAgentCanonicalName`/`specialistAgentsJson` (max. drei Fachagenten als JSON-Array), `outcomeText` 1–2000 Zeichen |
| `health_reference_work_packages` | sieben feste, sequenzielle Arbeitspakete je Lauf | `packageKey` als `CHECK`-Enum (7 feste Codes), `sequence` `CHECK (sequence BETWEEN 1 AND 7)`, `UNIQUE (runId, packageKey)`, `promptDraftJson` auf 8000 Zeichen begrenzt |
| `health_reference_approvals` | sieben feste Jamal-Freigabepunkte je Lauf | `approvalKey` als `CHECK`-Enum (7 feste Codes), `decision` als `CHECK`-Enum (`PENDING`/`APPROVED`/`REJECTED`), `UNIQUE (runId, approvalKey)` |
| `health_reference_results` | Ergebnisberichte, QA-Befunde, Änderungsanforderungen, Abschlussnachweise | `kind` als `CHECK`-Enum (4 feste Werte), `summary` 1–500 Zeichen, `detailsJson` auf 4000 Zeichen begrenzt, `FOREIGN KEY (runId) REFERENCES health_reference_runs(id) ON DELETE CASCADE` |

Bewusst **keine** zweite, parallele Arbeitslauf-/Projekttabelle: das Modell ist additiv auf derselben `auth-db.js`-SQLite-Schicht wie `office_work_items`/`finance_handoffs` (Migration 15) aufgebaut und nutzt dasselbe CRUD-/Audit-/Routing-Muster. Bewusst **keine** Health-Nutzerdaten-Spalte – gespeichert werden ausschließlich Steuerungsmetadaten der Zentrale selbst (Lauf-/Arbeitspaket-/Freigabe-/Ergebnisstatus, Zeitstempel, Auditverweise).

| Bereich | Regel |
|---|---|
| health-reference-work-run-service.js (neu) | Statusmodell/-übergänge für den Referenzlauf, Persistenz über `auth-db.js` (Migration 16), Audit über `auth-audit.js`; `REFERENCE_READY` ausschließlich über `recordFinalAcceptance({ confirmed: true })` erreichbar, kein automatischer Sprung; liest Health-Branch/-HEAD ausschließlich read-only über das bestehende `health-repo-status.js` |
| health-reference-work-run-routes.js (neu) | reines HTTP-Glue-Modul (gleiches Muster wie `office-finance-routes.js`): liest den Anfragekörper, prüft je Aktion eine enge Known-Fields-Allowlist, bildet Fehler auf Statuscodes ab; keine Login-/Send-/Deploy-/Commit-/Push-Aktion |
| health-reference-work-run-ui.js (neu) | eigenständiges Vanilla-Client-Skript, rendert ausschließlich `#health-reference-run-card`; spricht ausschließlich `/api/health-reference/*` an |
| auth-db-migrations.js (erweitert, Migration 16) | vier neue Tabellen (siehe oben); additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen; Migrationen 1–15 byteidentisch unverändert |
| auth-db.js (erweitert) | neue CRUD-Funktionen für Lauf-/Arbeitspaket-/Freigabe-/Ergebnisdatensätze |
| auth-audit.js (erweitert) | neun neue Ereignistypen: `HEALTH_REFERENCE_RUN_CREATED`, `HEALTH_REFERENCE_WORK_PACKAGE_PREPARED`, `HEALTH_REFERENCE_PROMPT_DRAFT_CREATED`, `HEALTH_REFERENCE_APPROVAL_RECORDED`, `HEALTH_REFERENCE_RESULT_REPORT_SUBMITTED`, `HEALTH_REFERENCE_QA_FINDING_RECORDED`, `HEALTH_REFERENCE_CHANGES_REQUESTED`, `HEALTH_REFERENCE_FINAL_ACCEPTANCE_PREPARED`, `HEALTH_REFERENCE_REFERENCE_READY_GRANTED` |

Ergebnis: **89 GET, 52 POST, 8 GET-Präfixe, 8 POST-Präfixe, 32 statische Assets**, **2454** automatisierte Prüfpunkte in **86** Testdateien grün, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert, exakt 25 kanonische Agenten unverändert. Health Upgrade Kompass (`work/check-start-gate-2026-07-19`, HEAD `81dca3a9967b1763d7b3e881fffe213fe64f9d62`) wurde ausschließlich read-only gelesen, nicht verändert. **Lokal umgesetzt, noch nicht committed, gepusht oder deployt.**

## V7.6.2 – Projekt-Finish-Portfolio, interne Referenzläufe und verkaufsfähige Marketingagentur (keine neue Migration)

Reiner Planungs- und Dokumentationslauf. **Keine neue Migration** – Migration 15 bleibt der aktuelle, unveränderte Stand (Migrationen 1–15 byteidentisch unverändert). Es wurden ausschließlich sechs neue Markdown-Dokumente erstellt (`PROJECT_FINISH_PORTFOLIO.md`, `INTERNAL_PROJECT_REFERENCE_PLAN.md`, `HEALTH_REFERENCE_FINISH_PLAN.md`, `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md`, `PROJECT_FINISH_DECISION_BOARD.md`, `HR_FUTURE_AGENT_DECISION_AGENDA.md`) und fünf kanonische Dokumente ergänzt (`PROJECT_MASTER.md`, `CURRENT_STATUS.md`, `MIGRATION_PLAN.md`, `README.md`, `V1_BETRIEBSHANDBUCH.md`). Kein Code, keine Datenbank, keine Tabelle, kein Index, kein Trigger geändert. Details siehe `CURRENT_STATUS.md` und `PROJECT_FINISH_PORTFOLIO.md`.

## V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und Finance-Korridor (Migration 15, additiv, lokal umgesetzt, noch nicht committed/gepusht)

Vorheriger Ausgang: HEAD/`origin/main` `6ffa3f8c212a9417af523327ddb445354b95093c` (Working Tree sauber, 79 GET/52 POST/8 GET-Präfixe/6 POST-Präfixe/30 statische Assets, **80 Testdateien, 2269 automatisierte Prüfpunkte grün**, Migration 14). Dieser Schritt ist rein additiv; Migrationen 1–14 byteidentisch unverändert.

**Neue Migration 15** (drei neue Tabellen plus additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen, gleiches bewährte Recreate-Muster wie bei Migration 14: neue Zwischentabelle mit erweitertem `CHECK` über eine neue, additive Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_15` – **nicht** die veränderliche `AUDIT_EVENT_TYPES`-Live-Konstante –, vollständige Datenübernahme, Umbenennung, erneute Anlage der append-only-Trigger/Indizes):

| Tabelle | Zweck | Wichtige Felder/Regeln |
|---|---|---|
| `external_identities` | lokales Identitäts-/Kontenmodell (`jamal@jacogbr.de`/`office@jacogbr.de`/`info@jacogbr.de`) | `emailAddress` `UNIQUE`, `identityType`/`provider`/`writePermissionState`/`authenticationState`/`recoveryState`/`twoFactorState`/`status` als `CHECK`-Enums, `agentDirectLoginAllowed` per `CHECK (agentDirectLoginAllowed = 0)` hart auf 0 fixiert, **kein** Passwort-/Token-/Recovery-Code-Feld |
| `office_work_items` | persistente lokale Office-Aufträge (E-Mail/Kalender/Dokument/Kontakt/Allgemein) | `category`/`approvalStatus`/`executionStatus`/`dataSensitivity`/`externalEffect` als `CHECK`-Enums, `executionStatus`-Aufzählung endet technisch bei `WAITING_FOR_AUTHENTICATION` (kein `READY_FOR_PROVIDER`/`EXECUTED` in V7.6.1 erreichbar), `draftPayloadJson` begrenzt auf 4000 Zeichen |
| `finance_handoffs` | Finance-/Controlling-Handoff-Korridor (Beleg/Rechnung/Zahlung/Kostenstelle/Steuerberaterübergabe/Monatsübersicht/Liquidität) | `type`/`taxRelevance`/`confidence`/`sensitivity`/`approvalStatus` als `CHECK`-Enums, `executionBlocked` per `CHECK (executionBlocked = 1)` hart auf 1 fixiert – kein Codepfad kann diesen Wert auf 0 setzen |

Bewusst **keine** vierte Tabelle `external_action_approvals` (Auftrag Abschnitt R nennt sie als mögliche, nicht verpflichtende Tabelle): `office_work_items` besitzt bereits `approvalStatus`/`executionStatus` – eine zweite, separate Freigabetabelle würde denselben Entscheidungszustand doppelt speichern und veralten können. Ebenso bewusst **keine** eigene Tabelle `provider_capabilities` – die 33 Google-Workspace-Fähigkeiten (`google-workspace-capability-service.js`) sind statische, unveränderliche Referenzdaten ohne mutierbaren Zustand, genau wie `company-principles.js`.

| Bereich | Regel |
|---|---|
| external-identity-service.js (neu) | Seed genau drei Startidentitäten (idempotent, verändert nie eine bereits bestehende Zeile), Persistenz über `auth-db.js` (Migration 15), Audit über `auth-audit.js`; kein Netzwerkzugriff |
| google-workspace-capability-service.js (neu) | rein statisches, eingefrorenes Fähigkeitsmodell ohne eigene Tabelle; `assertNoCapabilityCurrentlyElevated()` verhindert beim Laden jeden aktiv erhöhten Zustand |
| office-work-service.js (neu) | Office-Agentenmodell (ausschließlich vorhandene `agent-registry.js`-Agenten) und vier deterministische Offline-Korridore; `assertExecutionStatusAllowed` sperrt technisch jeden Versuch über `WAITING_FOR_AUTHENTICATION` hinaus |
| finance-handoff-service.js (neu) | Handoff-Erfassung/-Prüfung, `executionBlocked` programmatisch zusätzlich zur DB-Constraint fixiert; kein Buchungs-/Zahlungs-/Versandcode |
| google-workspace-connector.js (neu) | deterministischer Offline-Stub ohne Tokens/OAuth/Netzwerkaufruf; lehnt jede echte, injizierte Providerfunktion ab |
| office-finance-routes.js (neu) | reines HTTP-Glue-Modul (gleiches Muster wie `agent-leadership-routes.js`): liest den Anfragekörper, prüft je Aktion eine enge Known-Fields-Allowlist, bildet Fehler auf Statuscodes ab |
| office-finance-ui.js (neu) | eigenständiges Vanilla-Client-Skript, rendert ausschließlich `#office-finance-view`; spricht ausschließlich `/api/office-finance/*` an |
| auth-db-migrations.js (erweitert, Migration 15) | drei neue Tabellen (siehe oben); additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen; Migrationen 1–14 byteidentisch unverändert |
| auth-db.js (erweitert) | neue CRUD-Funktionen für Identitäts-/Office-Auftrags-/Finance-Handoff-Datensätze |
| auth-audit.js (erweitert) | neun neue Ereignistypen: `EXTERNAL_IDENTITY_REVIEWED`, `PROVIDER_CAPABILITY_REVIEWED`, `OFFICE_WORK_ITEM_CREATED`/`REVIEWED`, `OFFICE_EXTERNAL_ACTION_APPROVED`, `OFFICE_AUTHENTICATION_REQUIRED`, `FINANCE_HANDOFF_CREATED`/`REVIEWED`, `FINANCE_SPECIALIST_REQUIRED` |

Ergebnis: **88 GET, 52 POST, 8 GET-Präfixe, 7 POST-Präfixe, 31 statische Assets**, **2384** automatisierte Prüfpunkte in **83** Testdateien grün, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. **Lokal umgesetzt, noch nicht committed, gepusht oder deployt.**

## V7.5 – Agentenorganisation, tägliches HR-Coaching und Technologie-/Plugin-Marktradar (Migration 14, additiv, lokal umgesetzt, noch nicht committed/gepusht)

Vorheriger Ausgang: HEAD/`origin/main` `c5b4130b8a3f6dbf4f6fb0d6f8b01598e595a43e` (Working Tree sauber, 72 GET/52 POST/8 GET-Präfixe/5 POST-Präfixe/29 statische Assets, **76 Testdateien, 2136 automatisierte Prüfpunkte grün**). Dieser Schritt ist rein additiv; Migrationen 1–13 byteidentisch unverändert.

**Neue Migration 14** (vier neue Tabellen plus additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen, gleiches bewährte Recreate-Muster wie bei Migration 13: neue Zwischentabelle mit erweitertem `CHECK` über eine neue, additive Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_14` – **nicht** die veränderliche `AUDIT_EVENT_TYPES`-Live-Konstante –, vollständige Datenübernahme, Umbenennung, erneute Anlage der append-only-Trigger/Indizes):

| Tabelle | Zweck | Wichtige Felder/Regeln |
|---|---|---|
| `agent_hr_daily_runs` | ein Lauf je Kalendertag | `runDate` `UNIQUE`, kein zweiter aktiver Lauf am selben Tag |
| `agent_hr_daily_proposals` | ein Vorschlag je Agent und Lauf | `FOREIGN KEY (runId) REFERENCES agent_hr_daily_runs(id) ON DELETE RESTRICT`, `status`/`hrRecommendation` als `CHECK`-Enums, kein Zeitstempel-/UUID-Feld für Chain-of-Thought |
| `technology_radar_items` | ein Eintrag je Technologie/Werkzeug | `type`/`recommendation`/`status` als `CHECK`-Enums, kein Zugangstoken-/Provider-Secret-Feld |
| `agent_technology_fit` | kontrollierte Zuordnung Radar-Eintrag ↔ Agent | `FOREIGN KEY (radarItemId) REFERENCES technology_radar_items(id) ON DELETE RESTRICT`, `recommendation`/`priority`/`status` als `CHECK`-Enums |

Die Organisationssicht selbst (`agent-organization-service.js`) erhält **keine** eigene Tabelle – sie wird vollständig deterministisch aus dem bereits bestehenden, unveränderten `agent-registry.js` (+ optional `tool-registry.js`) abgeleitet, damit keine zweite, potenziell veraltende Agentenliste entsteht.

| Bereich | Regel |
|---|---|
| agent-organization-service.js (neu) | reine, zustandslose Fachlogik ohne I/O: leitet Bereich/Führungsebene/Berichtslinie/Qualitätsverantwortung/Autonomierahmen/Werkzeugfähigkeit für alle 25 Agenten deterministisch aus `agent-registry.js` ab |
| agent-hr-coaching-service.js (neu) | Statusmodell/-übergänge für den täglichen Lauf, Persistenz über `auth-db.js` (Migration 14), Audit über `auth-audit.js`, vollständig deterministisch (FNV-1a-Tagesindex statt Zufall), kein externer Modellaufruf |
| technology-radar-service.js (neu) | Seed aus `tool-registry.js`, lokale Erfassung/Aktualisierung von Radar-Einträgen und Agent-Technology-Fit; kein Netzwerkzugriff |
| agent-leadership-routes.js (neu) | reines HTTP-Glue-Modul (gleiches Muster wie `jamal-canva-routes.js`): liest den Anfragekörper, prüft je Aktion eine enge Known-Fields-Allowlist, bildet Fehler auf Statuscodes ab |
| agent-leadership-ui.js (neu) | eigenständiges Vanilla-Client-Skript, rendert ausschließlich `#agent-leadership-view`; spricht ausschließlich `/api/agent-leadership/*` an |
| auth-db-migrations.js (erweitert, Migration 14) | vier neue Tabellen (siehe oben); additive Erweiterung von `auth_audit_events` um neun neue Ereignistypen; Migrationen 1–13 byteidentisch unverändert |
| auth-db.js (erweitert) | neue CRUD-Funktionen für Lauf-/Vorschlags-/Radar-/Fit-Datensätze |
| auth-audit.js (erweitert) | neun neue Ereignistypen: `AGENT_ORGANIZATION_REVIEWED`, `HR_DAILY_RUN_CREATED`, `HR_PROPOSAL_REVIEWED`/`APPROVED`/`REJECTED`/`DEFERRED`, `TECH_RADAR_ITEM_CREATED`/`UPDATED`, `AGENT_TECH_FIT_REVIEWED` |

Ergebnis: **77 GET, 52 POST, 8 GET-Präfixe, 6 POST-Präfixe, 30 statische Assets**, **2223** automatisierte Prüfpunkte in **79** Testdateien grün, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. **Lokal umgesetzt, noch nicht committed, gepusht oder deployt.**

## V7.5 – Unternehmensleitlinien V1.0 als verbindliche Betriebslogik verankert (Migration 14 additiv erweitert, keine Migration 15, lokal umgesetzt, noch nicht committed/gepusht)

Vorheriger Ausgang: HEAD/`origin/main` unverändert `c5b4130b8a3f6dbf4f6fb0d6f8b01598e595a43e`, V7.5-Agentenführung (oben) bereits lokal umgesetzt (77 GET/52 POST/8 GET-Präfixe/6 POST-Präfixe/30 statische Assets, **79 Testdateien, 2223 automatisierte Prüfpunkte grün**, Migration 14 mit vier Tabellen). Da Migration 14 noch nicht committed war, wurde sie gemäß Auftrag Abschnitt O **direkt erweitert statt einer neuen Migration 15** – Migrationen 1–13 bleiben byteidentisch unverändert.

**Migration 14 additiv erweitert** (11 neue Spalten auf `agent_hr_daily_proposals`, 11 neue Spalten auf `technology_radar_items`, eine neue Tabelle `agent_reliability_signals`, additive Erweiterung von `auth_audit_events` um fünf weitere neue Ereignistypen – gleiches Recreate-Muster wie zuvor, jetzt über eine erneut erweiterte `AUDIT_EVENT_TYPES_AT_MIGRATION_14`):

| Tabelle/Erweiterung | Zweck | Wichtige Felder/Regeln |
|---|---|---|
| `agent_hr_daily_proposals` (+11 Spalten) | Rosenberg-/1%-/PDCA-/Nutzen-Felder je Vorschlag | `observation`, `businessMeaning`, `desiredOutcome`, `priorityReason`, `benefitArea` (`CHECK`-Enum), `priorityBucket` (`CHECK`-Enum `NOW`/`NEXT`/`LATER`/`WATCH`), `nextReviewDate`, `pdcaStage` (`CHECK`-Enum `PLAN`/`DO`/`CHECK`/`ACT`, `DEFAULT 'PLAN'`), `pdcaDecision` (`CHECK`-Enum `KEEP`/`ADJUST`/`REPEAT`/`DISCARD`, nullable), `pdcaStageChangedAt`, `reliabilitySignal` (`CHECK`-Enum, `DEFAULT 'NONE'`) – die übrigen aus Auftrag Abschnitt E benannten Felder (`onePercentStep`/`trainingExercise`/`successMetric`/`safetyBoundary`/`ownership`) sind bewusst **keine** eigenen Spalten, sondern zur Lesezeit identisch mit bereits bestehenden Spalten (`improvementSuggestion`/`concreteExercise`/`qualityCriterion`/`riskBoundary`/`agentId`); `communicationPattern` wird ausschließlich zur Lesezeit aus vorhandenen Feldern zusammengesetzt – keine unnötige doppelte Speicherung |
| `technology_radar_items` (+11 Spalten) | Zukunfts-/Szenario-/Nutzenfelder je Radar-Eintrag | `signalType`, `signalDescription`, `timeHorizon` (`CHECK`-Enum `NOW`/`1_2_YEARS`/`3_5_YEARS`/`5_PLUS_YEARS`), `uncertaintyLevel` (`CHECK`-Enum `LOW`/`MEDIUM`/`HIGH`), `scenarioConservative`, `scenarioLikely`, `scenarioDynamic`, `strategicImpact`, `todayPreparationStep`, `benefitArea` (`CHECK`-Enum), `priorityBucket` (`CHECK`-Enum), kein Zugangstoken-/Provider-Secret-Feld |
| `agent_reliability_signals` (neu) | lokal erfasste Hochzuverlässigkeitssignale | `agentId`, `relatedProposalId`/`relatedRadarItemId` (optional, `FOREIGN KEY ... ON DELETE RESTRICT`), `signalType` (`CHECK`-Enum `UNCERTAINTY`/`EARLY_WARNING`/`DEVIATION`/`NEAR_MISS`/sicherheitsrelevante Eskalation), `observation`, `possibleImpact`, `recommendedCheck`, `status`, `jamalDecision`, Zeitstempel; kein Sanktionsfeld, keine Autonomiereduktion in der Tabelle |

`company-principles.js` selbst erhält **keine** eigene Tabelle – analog zur Organisationssicht wird das Leitlinienmodell vollständig aus der versionierten Codedatei gelesen, damit keine zweite Leitlinienwahrheit in der Datenbank entsteht.

| Bereich | Regel |
|---|---|
| company-principles.js (neu) | reine, zustandslose Konstantendatei ohne I/O: sechs Führungsrahmen, zehn Grundwerte, elf Sicherheitsplanken als strukturierte Regelobjekte, Version `1.0` identisch zu `COMPANY_PRINCIPLES.md` |
| agent-reliability-signal-service.js (neu) | Statusmodell/-übergänge für Reliability-Signale, Persistenz über `auth-db.js` (Migration 14 erweitert), Audit über `auth-audit.js`, keine automatische Sanktion/Autonomieänderung |
| agent-hr-coaching-service.js (erweitert) | PDCA-Stufenlogik (`advanceHrPdcaStage`) mit Guards, Ableitung von `benefitArea`/`priorityBucket`/`nextReviewDate`, Rosenberg-Kommunikationsmuster |
| technology-radar-service.js (erweitert) | Zukunfts-/Szenariofelder, `reviewForesightScenario`, Erhalt manuell gepflegter Felder bei erneutem Seeding |
| agent-organization-service.js (erweitert) | Finance-/Controlling-`CAPABILITY_GAP`-Kennzeichnung, `ownerAgentId`/`contributorAgentIds` |
| agent-leadership-routes.js (erweitert) | zwei neue read-only GET-Handler, vier neue Aktionen im bestehenden POST-Aktions-Prefix |
| auth-db-migrations.js (Migration 14 erweitert) | 11+11 neue Spalten, eine neue Tabelle (siehe oben); additive Erweiterung von `auth_audit_events` um fünf weitere Ereignistypen; Migrationen 1–13 byteidentisch unverändert |
| auth-db.js (erweitert) | neue CRUD-Funktionen für Reliability-Signale, erweiterte Lese-/Schreibfunktionen für Vorschlags-/Radar-Datensätze |
| auth-audit.js (erweitert) | fünf neue Ereignistypen: `COMPANY_PRINCIPLES_REVIEWED`, `HR_PDCA_STAGE_CHANGED`, `RELIABILITY_SIGNAL_RECORDED`, `RELIABILITY_SIGNAL_REVIEWED`, `FORESIGHT_SCENARIO_REVIEWED` |

Ergebnis: **79 GET, 52 POST, 8 GET-Präfixe, 6 POST-Präfixe, 30 statische Assets**, **2269** automatisierte Prüfpunkte in **80** Testdateien grün, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. **Keine Migration 15, Migrationen 1–13 unverändert. Lokal umgesetzt, noch nicht committed, gepusht oder deployt.**

## V7.4 – Nachtrag: authentifizierter Canva-Abnahmelauf ohne neue Migration

Nach dem Commit/Push von Schritt 1 (unten, Migration 13) wurde ein authentifizierter Canva-Abnahmelauf außerhalb von Cursor durchgeführt (siehe `CANVA_AUTHENTICATED_RUN_ACCEPTANCE.md`). Dieser Nachtrag ist **keine neue Migration** und **keine Codeänderung** – das reale Ergebnis (Canva-Design-ID `DAHQkWMxdPo`) wurde manuell dokumentiert, nicht automatisiert in `jamal_canva_productions` zurückgeschrieben. Migration 13 bleibt unverändert die letzte Migration.

## V7.4 Schritt 1 – Kontrollierte externe Werkzeugnutzung: Canva als erster Produktionskorridor – Offline-/Stub-Grundlage (committed und gepusht `f2b0909`; **kein echter Canva-Handoff in diesem Schritt** – siehe Nachtrag oben)

Vorheriger Ausgang: HEAD/`origin/main` `1fc142d27f2469703ae544a3862b0b872cf43a2c` (Working Tree sauber, 71 GET/52 POST/8 GET-Präfixe/5 POST-Präfixe/28 statische Assets, **73 Testdateien, 2026 automatisierte Prüfpunkte grün**). Dieser Schritt ist additiv; Migrationen 1–12 byteidentisch unverändert.

**Neue Migration 13** (`jamal_canva_productions`, additiv, plus additive Erweiterung von `auth_audit_events` um zehn neue Ereignistypen): erste Migration seit V7.3, die zusätzlich zu einer neuen Tabelle auch die bestehende `auth_audit_events`-`CHECK`-Constraint erweitert, ohne die Historie älterer Migrationen zu verändern (gleiches bewährtes Recreate-Muster wie bei früheren Erweiterungen dieser Tabelle: neue Zwischentabelle `auth_audit_events_v7` mit erweitertem `CHECK` über eine neue, additive Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_13` – **nicht** die veränderliche `AUDIT_EVENT_TYPES`-Live-Konstante –, vollständige Datenübernahme, Umbenennung, erneute Anlage der append-only-Trigger/Indizes).

| Bereich | Regel |
|---|---|
| jamal-canva-briefing.js (neu) | reine, zustandslose Fachlogik ohne I/O (kein Datenbank-, kein Netzwerkzugriff): Canva-Eignungsprüfung (`evaluateCanvaSuitability` – führt die bestehende `business-use-policy.js#evaluateWorkOrderContent` eigenständig ein zweites Mal aus, unabhängig vom ersten Safety-Gate in `jamal-work-mode.js#startRun`), Rechte-/Consent-Prüfung (`evaluateRightsAndConsent`), Briefingerzeugung (`buildCanvaBriefing`, inkl. Jamals Design-DNA „Apple statt Dubai") |
| jamal-canva-production-service.js (neu) | Statusmodell/-übergänge (`DRAFT`…`BLOCKED`), Persistenz über `auth-db.js` (Migration 13), Audit über `auth-audit.js`, deterministischer Stub-Connector (`defaultCanvaConnectorStub`) als Default, deterministische interne Qualitätsprüfung (`runCanvaQualityCheck`); kennt keine Auth-Rollen/Mandanten (ausschließlich Jamal/OWNER) |
| jamal-canva-routes.js (neu) | reines HTTP-Glue-Modul (gleiches Muster wie `work-order-routes.js`): liest den Anfragekörper, prüft je Aktion eine enge Known-Fields-Allowlist, bildet Fehler auf Statuscodes ab; importiert **nie** `better-sqlite3` direkt (erhält `db` über `deps.getDb()`) |
| jamal-canva-ui.js (neu) | eigenständiges Vanilla-Client-Skript, rendert ausschließlich `#jamal-canva-card` innerhalb der bestehenden Hauptarbeitskarte; spricht ausschließlich `/api/jamal-work-mode/canva-*` an; **bewusst niemals** von `jamal-work-mode.js`/`jamal-work-mode-ui.js` importiert oder umgekehrt (erzwungen durch `jamal-work-mode-ui.test.js#"kein Provider (Canva/HeyGen)"`) |
| auth-db-migrations.js (erweitert, Migration 13) | neue Tabelle `jamal_canva_productions` (Fremdschlüssel auf `jamal_work_items`, `UNIQUE(workItemId, revisionNumber)`, kein Zugangstoken-/Provider-Secret-Feld); additive Erweiterung von `auth_audit_events` um zehn neue `CANVA_*`-Ereignistypen über eine neue, additive Snapshot-Konstante; Migrationen 1–12 byteidentisch unverändert |
| auth-db.js (erweitert) | neue CRUD-Funktionen `upsertJamalCanvaProduction`/`getJamalCanvaProductionById`/`getLatestJamalCanvaProductionForWorkItem`/`listJamalCanvaProductionsForWorkItem` |
| auth-audit.js (erweitert) | zehn neue `EVENT_TYPES` (`CANVA_BRIEFING_PREPARED` … `CANVA_HANDOFF_BLOCKED_BY_RIGHTS`); `METADATA_ALLOWLIST` um `workItemId`/`canvaJobId`/`canvaDesignId`/`format`/`revisionNumber`/`rightsCode` erweitert |
| server.js (erweitert) | `handleJamalCanvaState` (GET `/api/jamal-work-mode/canva-state`); bestehender `dispatchJamalWorkModeActionPostPrefix` leitet `canva-*`-Aktionen zusätzlich an `jamal-canva-routes.js#dispatchCanvaAction` weiter; `jamal-canva-ui.js` in `staticAssets` aufgenommen |
| route-access-policy.js (erweitert) | neue `OWNER_ONLY`-Policy-Einträge: `GET /api/jamal-work-mode/canva-state`, statisches Asset `/jamal-canva-ui.js` (der bestehende `POST-Prefix /api/jamal-work-mode/` deckt die sechs neuen Canva-Aktionen bereits ab, keine neue Prefix-Policy nötig) |
| route-access-policy.test.js / server-http-router.test.js / agent-runtime.test.js / daily-work-run.test.js (angepasst) | reale Routen-/Testzahlen aktualisiert: 72 GET/52 POST/8 GET-Präfixe/5 POST-Präfixe/**29 statische Assets** (jeweils nur die tatsächlich neu hinzugekommene Zahl geändert, keine bestehende Assertion entfernt) |
| portal-operations-acceptance.test.js (angepasst) | hartcodiertes Migrationsarray `[1, …, 12]` auf `[1, …, 13]` erweitert, Kommentar entsprechend ergänzt |
| index.html / styles.css (erweitert) | neuer additiver Bereich `#jamal-canva-card` innerhalb der bestehenden Hauptarbeitskarte, neuer `<script src="jamal-canva-ui.js">`; additive `.jamal-canva-*`-Regeln (wiederverwendete Design-Tokens, mobiler Breakpoint) – keine bestehende Regel verändert |
| package.json (erweitert) | drei neue Testdateien in `test`- und `check`-Skript eingehängt; die vier neuen Quellmodule in `check` eingehängt; keine neue Abhängigkeit |
| jamal-canva-production.test.js / jamal-canva-security.test.js / jamal-canva-ui.test.js (neu) | 30 + 31 + 29 = **90** neue Prüfpunkte; real gemessener Gesamtstand **2136** Prüfpunkte / **76** Testdateien (V7.3-Baseline dokumentierte 2026/73; reale Nachmessung der 73 unveränderten Bestandstestdateien ergibt 2046 – historische Dokumentationsabweichung von 20 Prüfpunkten, unabhängig von diesem Schritt) |

## V7.3 – Jamal-Arbeitsmodus: vom Ergebniswunsch zum prüfbaren internen Ergebnis (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger Ausgang: HEAD/`origin/main` `2211db461d6b72ca5c8432d15bb0a8715a3a5c31` (Working Tree sauber, 70 GET/52 POST/8 GET-Präfixe/4 POST-Präfixe/27 statische Assets, **69 Testdateien, 1935 automatisierte Prüfpunkte grün**). Dieser Schritt ist additiv; Migrationen 1–11 byteidentisch unverändert.

**Persistenznachtrag (vor Commit-Freigabe ergänzt):** die erste Umsetzung sah **keine** neue Migration vor (der Arbeitswunsch lebte bewusst nur im Prozessspeicher). Das erwies sich als echter Betriebsblocker (Serverneustart verlor den gesamten Arbeitswunsch) und wurde vor der Commit-Freigabe durch eine additive **Migration 12** behoben (siehe eigene Tabellenzeilen unten) – Migrationen 1–11 bleiben davon unberührt.

| Bereich | Regel |
|---|---|
| jamal-work-mode.js (neu) | reine, zustandslose Fachlogik (Store als Wert, kein Datenbankzugriff, keine Zufallszahlen, keine Uhrzeitabhängigkeit außer über injizierbares `now`): Statusmodell (`STATUS`/`STATUS_LABELS_DE`), Projektpriorisierung (`resolvePrioritizedProject`/`compactProjectCandidates`), Arbeitswunsch-Lebenszyklus (`startNewItem`/`chooseProject`/`setDesiredOutcome`), Laufsteuerung (`startRun`/`completeRun` – ruft ausschließlich `work-order-agent-orchestrator.js` und `business-use-policy.js` unverändert auf), Rückfragen (`answerClarifyingQuestion`), Revision (`requestChange`/`completeChange`, unveränderliche Versionierung wie `work_order_results`), Abschluss (`markDone`/`markLater`/`stopWorkItem`), sichere Ansicht (`getSafeView`) |
| jamal-work-mode-ui.js (neu) | eigenständiges Vanilla-Client-Skript nach demselben additiven Muster wie `owner-work-orders.js`; rendert ausschließlich `#jamal-work-card`, spricht ausschließlich `/api/jamal-work-mode/*` an; kein Umbau von `app.js`/`daily-work-run-ui.js` |
| index.html (erweitert) | neue Sektion `#jamal-work-card` als erstes Kind von `#cockpit-view` (vor dem bisherigen Tageslauf); bisheriger `#daily-work-run-section` unverändert, jetzt in `<details class="jamal-work-secondary" open>` gekapselt (Bestandsschutz, nur eingeklappt statt gelöscht); neuer `<script src="jamal-work-mode-ui.js">` |
| styles.css (erweitert) | additive Regeln `.jamal-work-*` (wiederverwendete gedeckte `--badge-*`-Tokens, kein neues Farbschema; mobiler Breakpoint `@media (max-width: 640px)`); keine bestehende Regel verändert |
| server.js (erweitert) | ursprünglich Prozessspeicher-Singleton `jamalWorkModeStore` – im Persistenznachtrag ersetzt durch `jamal-work-mode-store.js#loadStore`/`persistStore` gegen die bestehende Auth-Datenbank (siehe unten); `handleJamalWorkModeState` (GET); `JAMAL_WORK_MODE_ACTIONS`-Tabelle (neun Aktionen) und `dispatchJamalWorkModeActionPostPrefix` (POST-Prefix-Dispatcher, gleiches Sicherheitsmuster wie die bestehenden Owner-/Portal-Dispatcher: Origin-/Host-Prüfung, Bodylimit, Known-fields-Allowlist, sichere generische Fehler) |
| route-access-policy.js (erweitert) | neue `OWNER_ONLY`-Policy-Einträge: `GET /api/jamal-work-mode/state`, `POST-Prefix /api/jamal-work-mode/`, statisches Asset `/jamal-work-mode-ui.js` |
| route-access-policy.test.js / server-http-router.test.js / agent-runtime.test.js / daily-work-run.test.js (angepasst) | reale Routen-/Testzahlen aktualisiert: 71 GET/52 POST/8 GET-Präfixe/**5 POST-Präfixe**/28 statische Assets (jeweils nur die tatsächlich neu hinzugekommene Zahl geändert, keine bestehende Assertion entfernt) |
| daily-work-run-ui.test.js (korrigiert, keine Assertion verändert) | ein neuer, weiter oben in `index.html` stehender Kommentar enthielt zufällig zuerst die Zeichenkette, die der bestehende Test `htmlSource.indexOf("daily-work-run-output")` als Endmarke eines Ausschnitts nutzte, und verkürzte den Ausschnitt fälschlich auf Leerstring; der Kommentar wurde umformuliert (keine Testassertion geändert) |
| package.json (erweitert) | drei neue Testdateien in `test`- und `check`-Skript eingehängt; die beiden neuen Quellmodule in `check` eingehängt; keine neue Abhängigkeit |
| jamal-work-mode.test.js / jamal-work-mode-ui.test.js / jamal-work-mode-e2e.test.js (neu) | 29 + 28 + 16 = **73** neue Prüfpunkte; Gesamtstand **2008** Prüfpunkte / **72** Testdateien |
| **Persistenznachtrag** – auth-db-migrations.js (erweitert, additiv) | neue **Migration 12** (`create_jamal_work_items_and_results`): legt zwei Tabellen an – `jamal_work_items` (`id`, `projectId`/`projectDisplayName`/`projectSource`, `desiredOutcome`/`importantNotes`/`preferredTiming`, `status` `CHECK IN (...)` mit dem vollständigen `jamal-work-mode.js#STATUS`-Wertebereich, `clarifyingQuestionJson`/`selectedAgentsJson`/`workPlanJson`/`safetyDecisionJson`/`escalationJson` als JSON-Text, `qualityStatus`/`qualityNote`, `decision`/`decidedAt`/`doneAt`/`stoppedAt`/`postponedAt`/`stopReason`/`pendingChangeText`, `lastUsedProjectId`/`lastUsedProjectDisplayName`, Zeitstempel/`completedAt`), `jamal_work_results` (`id`, `workItemId` Foreign Key, `versionNumber`, `resultTitle`/`resultSummary`/`resultBody` mit `CHECK`-Längenbegrenzung, `qualityStatus`/`qualityNote`, `openPointsJson`/`agentsInvolvedJson`, `triggerType` `CHECK IN (INITIAL,CHANGE_REQUEST)`, `changeRequestText`, `createdAt`; `UNIQUE(workItemId, versionNumber)`; append-only-Trigger-Schutz wie `work_order_results`); Indizes auf `createdAt`/`status`/`workItemId`; transaktional, forward-only, idempotent; Migrationen 1–11 byteidentisch unverändert |
| **Persistenznachtrag** – auth-db.js (additiv erweitert) | `upsertJamalWorkItem`, `getJamalWorkItemById`, `getLatestJamalWorkItem` (aktueller Arbeitswunsch = zuletzt angelegte Zeile), `appendJamalWorkResult`, `getJamalWorkResultById`, `listJamalWorkResultsForWorkItem`; keine Update-/Delete-Funktion für Ergebnisversionen (append-only) |
| **Persistenznachtrag** – jamal-work-mode-store.js (neu) | reine Übersetzungsschicht zwischen dem In-Memory-Format aus `jamal-work-mode.js` und den Migration-12-Tabellen: `loadStore(db)` (liest aktuellen Zustand vollständig aus der Datenbank, ohne Datensatz identisch zu `createStore()`), `persistStore(db, store)` (transaktionaler Upsert der Arbeitswunsch-Zeile plus ausschließlich neue, append-only Ergebnisversionen); importiert `better-sqlite3` nicht selbst, reicht das `db`-Handle ausschließlich an `auth-db.js` weiter |
| **Persistenznachtrag** – server.js (erweitert) | `jamalWorkModeStore`-Prozessspeichervariable entfernt; `handleJamalWorkModeState`/`dispatchJamalWorkModeActionPostPrefix` laden/schreiben den Zustand jetzt über `jamal-work-mode-store.js` gegen die via `ensureAuthDbReady()` bereits vorhandene Auth-Datenbank |
| **Persistenznachtrag** – portal-operations-acceptance.test.js (angepasst) | zwei hartcodierte Migrationszahlen von `1–11` auf `1–12` korrigiert (reale Zahlenaktualisierung, keine Assertion abgeschwächt) |
| **Persistenznachtrag** – jamal-work-mode-persistence.test.js (neu) | **18** neue Prüfpunkte (Neustart-/Mehrprozessverhalten, Append-only, Idempotenz, Scope-/Fail-closed-Kontrolle); Gesamtstand **2026** Prüfpunkte / **73** Testdateien |

## V7.2 Phase C Schritt 2 – Kundenänderungsrunde, Versionierung und echte fachliche Kundenfreigabe (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger Ausgang: HEAD/`origin/main` `535e648e6cbe1d8653dc7a31e01b36060626c299` (Working Tree sauber, 70 GET/52 POST/8 GET-Präfixe/4 POST-Präfixe/27 statische Assets, **65 Testdateien, 1829 automatisierte Prüfpunkte grün** – real und zweifach isoliert nachgemessen; eine zwischenzeitliche Fehlbehauptung von 1849 wurde durch den realen Testlauf widerlegt und von Jamal korrigiert). Dieser Schritt ist additiv; kein bestehender Codepfad wurde umgeschrieben, Migrationen 1–10 byteidentisch unverändert (Migration 10 dabei per Snapshot-Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_10` geschützt).

| Bereich | Regel |
|---|---|
| auth-db-migrations.js (erweitert, additiv) | neue Migration 11 (`create_work_order_change_requests_and_approvals`): legt zwei Tabellen an – `work_order_change_requests` (`id`, `workOrderId`/`tenantId`/`requestedByUserId`/`basedOnResultId` Foreign Keys, `requestText`/`preserveText`/`importantNote` mit `CHECK`-Längenbegrenzung, `status` `CHECK IN (SUBMITTED,IN_PROGRESS,COMPLETED,CANCELLED)`, `runId`/`resultingResultId`, Zeitstempel; partieller `UNIQUE`-Index auf `workOrderId` für `status IN (SUBMITTED,IN_PROGRESS)` – höchstens ein aktiver Änderungswunsch je Auftrag), `work_order_customer_approvals` (`id`, `workOrderId`/`tenantId`/`resultId`/`approvedByUserId` Foreign Keys, `approvalVersion`, `approvalNote` mit `CHECK`-Längenbegrenzung, `approvedAt`; `UNIQUE`-Index auf `resultId` – keine doppelte Freigabe derselben Version; append-only-Trigger-Schutz wie `work_order_results`); Indizes auf `workOrderId`/`tenantId`; transaktional, forward-only, idempotent; Migrationen 1–10 byteidentisch unverändert |
| auth-audit.js (erweitert) | `EVENT_TYPES` um neun neue Ereignistypen erweitert (`WORK_ORDER_CHANGES_REQUESTED`, `WORK_ORDER_CHANGE_REQUEST_STARTED`/`_COMPLETED`/`_FAILED`/`_CANCELLED`, `WORK_ORDER_RESULT_VERSION_CREATED`, `WORK_ORDER_RESULT_APPROVED_BY_CUSTOMER`, `WORK_ORDER_CHANGE_BLOCKED_BY_POLICY`, `WORK_ORDER_CHANGE_ESCALATED_BY_POLICY`); Metadaten-Allowlist um `resultId`/`resultVersion`/`changeRequestId` erweitert (weiterhin kein Freitext, kein Änderungswunsch-/Ergebnis-/Freigabenotiztext) |
| auth-db.js (additiv erweitert) | `listWorkOrderResultsForWorkOrder` (Versionsliste); für Änderungswünsche: `createWorkOrderChangeRequest`, `getWorkOrderChangeRequestById`, `getActiveWorkOrderChangeRequestForWorkOrder` (Idempotenzprüfung), `listWorkOrderChangeRequestsForWorkOrder`, `transitionWorkOrderChangeRequest` (compare-and-set wie bei `work_orders`/`work_order_runs`); für Freigaben: `createWorkOrderCustomerApproval`, `getWorkOrderCustomerApprovalByResultId`, `listWorkOrderCustomerApprovalsForWorkOrder`; keine Update-/Delete-Funktion für Freigaben (append-only) |
| work-order-change-service.js (neu) | `requestChanges` (Statusprüfung `RESULT_READY`, Safety-Gate 1, atomare Anlage + Statuswechsel `RESULT_READY→CHANGES_REQUESTED`, löst `startRevisionRun` aus), `startRevisionRun`/`executeRevisionRun` (Safety-Gate 2 vor dem Lauf, Safety-Gate 3 vor Ergebnisübernahme, komponiert Änderungswunschfelder in den bestehenden, unveränderten `work-order-agent-orchestrator.js`, atomare Ergebnis-/Statuspersistenz `CHANGES_REQUESTED→RESULT_READY`), `handleRevisionFailure` (kontrollierter Rücksprung bei technischem Fehler), `customerChangeRequestView`/`listChangeRequestsForCustomer`, `ownerChangeRequestView`/`listChangeRequestsForOwner` (read-only) |
| work-order-approval-service.js (neu) | `approveResult` (Statusprüfung `RESULT_READY`, Idempotenzprüfung, atomarer Statuswechsel `RESULT_READY→CUSTOMER_APPROVED` + Freigabeanlage), `getApprovalForResult`, `listApprovalsForOwner` (read-only) |
| work-order-result-service.js (erweitert) | `disclaimerForStatus`/`nextStepNoteForStatus` (statusabhängige, ehrliche Kundenhinweise statt der bisherigen Schritt-1-Platzhaltertexte); `customerResultView` liefert zusätzlich `workOrderStatus`/`isApproved`/`approvedAt`; neu `listResultVersionsForCustomer`, `ownerResultVersionView`/`listResultVersionsForOwner` |
| work-order-change-routes.js (neu) | dünne HTTP-Schicht für sechs Endpunkte, eingehängt in die bereits bestehenden Prefix-Dispatcher aus `work-order-routes.js` (keine neue Top-Level-Route): `POST`/`GET .../change-request(s)`, `POST .../approve`, `GET .../result-versions` (Kunde); `GET .../change-requests`, `GET .../result-versions` (Owner, read-only, bewusst ohne Schreibroute) |
| work-order-routes.js (erweitert) | `dispatchPortalWorkOrdersGetPrefix`/`dispatchPortalWorkOrdersPostPrefix`/`dispatchOwnerWorkOrdersGetPrefix` erkennen zusätzlich die neuen Unterpfade und delegieren an `work-order-change-routes.js`; keine neue Route auf oberster Ebene, keine Änderung an bestehenden Pfaden |
| work-order-service.js (erweitert) | `CUSTOMER_STATUS_MESSAGES` um Texte für `CHANGES_REQUESTED`/`CUSTOMER_APPROVED` ergänzt; `RESULT_READY`-Text an die jetzt tatsächlich verfügbare Freigabe-/Änderungsfunktion angepasst |
| portal.html/portal-ui.js/portal.css (erweitert) | neue Bereiche `work-order-change-request-section`/`work-order-approve-section`/`work-order-versions-section` (sichtbar bei `RESULT_READY`/`CHANGES_REQUESTED`/`CUSTOMER_APPROVED`); `setupChangeRequestForm`/`setupApproveForm`/`renderWorkOrderVersions`/`loadWorkOrderVersions` in `portal-ui.js`; Badge-Stile für `CHANGES_REQUESTED`/`CUSTOMER_APPROVED`, `.portal-version-item` (rein lesend, nicht klickbar) |
| owner-work-orders.html/owner-work-orders.js (erweitert) | zwei neue, ausschließlich lesende Bereiche „Änderungswünsche (Kunde)“ und „Ergebnisversionen und Kundenfreigabe“ (`CHANGE_REQUEST_STATUS_LABELS`, `renderWorkOrderChangeRequests`/`loadWorkOrderChangeRequests`, `renderWorkOrderResultVersions`/`loadWorkOrderResultVersions`); kein Button/Formular |
| package.json (erweitert) | zwei neue Testdateien in `test`- und `check`-Skript eingehängt; die drei neuen Quellmodule in `check` eingehängt; keine neue Abhängigkeit |
| work-order-change.test.js (neu) | 36 Prüfpunkte: erfolgreicher Änderungswunsch mit Versionssprung, alte Version bleibt lesbar, Kunden-/Owner-Lesesicht, Statusvoraussetzung `RESULT_READY` (409 sonst), Feldvalidierung/Längenlimits/unbekannte Felder, beide Safety-Gates `BLOCK`/`ESCALATE`, Datenbank-Idempotenzinvarianten (aktiver Änderungswunsch, doppelte Freigabe, Append-only-UPDATE), vollständiger Freigabefluss inkl. erneuter-Freigabe-409, keine Owner-Schreibroute, Mandantentrennung, CSRF/Origin, Audit-Vollständigkeit/-Allowlist/-Datensparsamkeit, `no-store`, keine Publish-/Billing-/Providerroute |
| work-order-change-ui.test.js (neu) | 11 Prüfpunkte: Owner-Bereiche vorhanden und werden nachgeladen, beide Bereiche rein lesend (kein Button/Formular), Rollentrennung im Text erkennbar, keine schreibende Route im Owner-Skript, übersetzte Statuswerte, Freigabeinformation sichtbar, keine Systemprompts/Chain-of-Thought, keine Veröffentlichung/Billing/Providerwahl, Leerzustände |
| work-order-execution.test.js (punktuell angepasst) | Prüfpunkt 28 kehrt sich um: die Kundenfreigaberoute liefert jetzt legitim `200`/`CUSTOMER_APPROVED` statt `404` (feingranulare Prüfung neu in `work-order-change.test.js`) |
| work-order-result-ui.test.js (punktuell angepasst, +1 Prüfpunkt) | Prüfpunkte 8/9 bewusst umgekehrt (Anwesenheit statt Abwesenheit der Freigabe-/Änderungsfunktion), Prüfpunkt 10 an die neuen statusabhängigen Hinweistexte angepasst, neuer Prüfpunkt für die rein lesende Versionsansicht |
| portal-operations-acceptance.test.js (punktuell angepasst) | erwartete Migrationsversionsliste von `1–10` auf `1–11` angehoben (zwei Stellen: Erststart, Nachrüstung auf einer Vor-Schritt-Datenbank) |
| Verboten in diesem Schritt, offen für spätere Phasen | asynchroner/im Hintergrund laufender Revisionslauf, externer Provideraufruf, Canva, HeyGen, Veröffentlichung, Billing, automatischer Kostenverbrauch, Owner-Freigabe/-Ablehnung/-Änderungsanforderung im Namen des Kunden, Mehrsprachigkeit, neue npm-Abhängigkeit, Commit/Push/Deploy |

+0 GET-/POST-/Prefix-Routen auf oberster Ebene, +0 statische Assets (alle sechs neuen Endpunkte hängen in den bereits bestehenden Prefix-Dispatchern; Routenzahlen bleiben exakt 70 GET/52 POST/8 GET-Prefix/4 POST-Prefix/27 statische Assets). +48 neue Prüfpunkte, +2 Testdateien: alte Summe **1829** (real, isoliert auf Commit `535e648` nachgemessen), Stand nach Umsetzung C–P **1877** (67 Testdateien). Letzter Qualitätsabgleich vor Commit: +2 weitere dedizierte Testdateien für Freigabe-/Versions-Sicherheit (`work-order-approval.test.js` +38, `work-order-version-security.test.js` +20), finale Gesamtsumme **1935** (69 Testdateien, `npm run check`/`npm test` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt).

## V7.2 Phase C Schritt 1 – Kontrollierte Übergabe eines Kundenauftrags an die Agentenzentrale und erstes prüfbares internes Ergebnis (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: HEAD/`origin/main` `3815694c1b0a66ef3f3edf14438b01bca6b4c66c` (Working Tree sauber, 70 GET/52 POST/8 GET-Präfixe/4 POST-Präfixe/27 statische Assets/62 Testdateien, 1749 automatisierte Prüfpunkte grün). Dieser Schritt ist additiv; kein bestehender Codepfad wurde umgeschrieben, Migrationen 1–9 byteidentisch unverändert.

| Bereich | Regel |
|---|---|
| auth-db-migrations.js (erweitert, additiv) | neue Migration 10 (`create_work_order_runs_and_results`): legt drei Tabellen an – `work_order_runs` (`id`, `workOrderId`/`tenantId` Foreign Keys, `runNumber`, `status` `CHECK IN (PREPARED,IN_PROGRESS,NEEDS_CLARIFICATION,COMPLETED,FAILED,CANCELLED)`, `startedAt`/`completedAt`/`failedAt`/`failureCode`, `orchestratorVersion`, `createdAt`), `work_order_run_agents` (`runId` Foreign Key, `agentKey`, `agentRole` `CHECK IN (PROJECT_MANAGER,SPECIALIST,QUALITY)`, `sequenceNumber`, `selectionReason`, `status`, `startedAt`/`completedAt`), `work_order_results` (`id`, `workOrderId`/`runId`/`tenantId` Foreign Keys, `versionNumber`, `resultTitle`/`resultSummary`/`resultBody` mit `CHECK`-Längenbegrenzung, `qualityStatus` `CHECK IN (PASSED,PASSED_WITH_NOTES)`, `qualityNote`, `openPoints`, `createdAt`); `work_order_results` erhält denselben append-only-Trigger-Schutz wie `auth_audit_events`/`policy_violations` (kein `UPDATE`/`DELETE`); Indizes auf `workOrderId`/`tenantId`; transaktional, forward-only, idempotent; Migrationen 1–9 byteidentisch unverändert |
| auth-audit.js (erweitert) | `EVENT_TYPES` um neun neue Ereignistypen erweitert (`WORK_ORDER_RUN_PREPARED`/`_STARTED`/`_COMPLETED`/`_FAILED`/`_CANCELLED`, `WORK_ORDER_RESULT_CREATED`, `WORK_ORDER_AGENT_SELECTED`, `WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY`, `WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY`); Metadaten-Allowlist um `runId`/`agentKey`/`failureCode` erweitert (weiterhin kein Freitext, kein Auftrags-/Ergebnistext) |
| auth-db.js (additiv erweitert) | neue Funktionen für `work_order_runs`/`work_order_run_agents`/`work_order_results`: `getActiveWorkOrderRunForWorkOrder` (Parallelitätsschutz), `nextWorkOrderRunNumber`, `createWorkOrderRun`, `getWorkOrderRunById`, `listWorkOrderRunsForWorkOrder`, `transitionWorkOrderRun` (compare-and-set wie bei `work_orders`); `createWorkOrderRunAgent`, `listWorkOrderRunAgents`; `nextWorkOrderResultVersionNumber`, `createWorkOrderResult`, `getWorkOrderResultById`, `getWorkOrderResultByRunId`, `getLatestWorkOrderResultForWorkOrder`; keine Update-/Delete-Funktion für Ergebnisse (append-only) |
| agent-registry.js (erweitert) | `ROLE_NAME_MAPPING` um zwei kanonische Aliase ergänzt (`Content-Agent`→`communication-agent`, `QA-Agent`→`quality-test-agent`), damit der Orchestrator ausschließlich aus dem bestehenden 25-Agenten-Register auflösen kann; keine neue Agenten-ID |
| work-order-agent-orchestrator.js (neu) | reine, deterministische Funktion ohne I/O und ohne Datenbankzugriff: `selectAgentsForWorkOrder` (Projektmanager immer, bis zu 3 Fachagenten anhand von Stichwortmustern, genau 1 Qualitätsagent), `buildWorkPlan` (3–5 Arbeitsschritte, erwartetes Ergebnisformat, Qualitätskriterien), `detectMissingInformation` (echte fachliche Lücke → konkrete Rückfrage statt Ergebnis), `generateResult` (Titel/Zusammenfassung/Text ohne interne Agentennamen im Kundentext), `runQualityCheck` (`PASSED`/`PASSED_WITH_NOTES`, offene Punkte) |
| work-order-execution-service.js (neu) | `startRunForWorkOrder` als einziger Einstiegspunkt: Idempotenz-/Parallelitätsprüfung, Statuswechsel `READY_FOR_PROCESSING → IN_PROGRESS` transaktional mit Laufanlage, zweites Safety-Gate (`businessUsePolicy.evaluateWorkOrderContent`) vor jeder Agentenausführung, `executeRun` (Orchestrator aufrufen, Ergebnis/Rückfrage/Fehler behandeln, alles transaktional persistieren), `listRunsForOwner`/`getRunForOwner` für die Owner-Betriebsansicht; kennt weder HTTP noch Request-/Response-Objekte |
| work-order-result-service.js (neu) | reine Lese-/Formatierungsschicht: `getResultForCustomer` (kundensichere Projektion ohne Agentendetails), `getRunStatusForCustomer` (minimaler Laufstatus, optional); `qualityStatusLabel` deutsche Übersetzung; erzeugt/ändert niemals ein Ergebnis |
| work-order-execution-routes.js (neu) | dünne HTTP-Schicht für fünf Endpunkte, eingehängt in die bereits bestehenden Prefix-Dispatcher aus `work-order-routes.js` (keine neue Top-Level-Route): `GET .../result`, `GET .../run-status` (Kunde), `GET .../runs`, `GET .../runs/:runId`, `POST .../run` (Owner); gleiches Muster wie `work-order-routes.js` (`readJsonRequestBody`/`assertKnownFieldsOnly`/generische Fehlerantworten, leere Feld-Allowlist beim Run-Start) |
| work-order-routes.js (erweitert) | `dispatchPortalWorkOrdersGetPrefix`/`dispatchOwnerWorkOrdersGetPrefix`/`dispatchOwnerWorkOrdersPostPrefix` erkennen zusätzlich die neuen Unterpfade und delegieren an `work-order-execution-routes.js`; keine neue Route auf oberster Ebene, keine Änderung an bestehenden Pfaden |
| work-order-service.js (erweitert) | `CUSTOMER_STATUS_MESSAGES` um Texte für `IN_PROGRESS`/`RESULT_READY` ergänzt; bestehender `READY_FOR_PROCESSING`-Text unverändert |
| portal.html/portal-ui.js/portal.css (erweitert) | neuer Ergebnisbereich `work-order-result-section` (wird bei `RESULT_READY` nachgeladen); `renderWorkOrderResult`/`loadWorkOrderResult` in `portal-ui.js`; Badge-Stile für `IN_PROGRESS`/`RESULT_READY`/`COMPLETED`/`PASSED`/`PASSED_WITH_NOTES`/`FAILED`, `white-space: pre-wrap` für den Ergebnistext |
| owner-work-orders.html/owner-work-orders.js (erweitert) | neuer Bereich „Technischer Laufstatus“ mit Startbutton „Technischen Agentenlauf starten“ (sichtbar nur bei `READY_FOR_PROCESSING`) und Laufliste (Run-Nummer, Status, Agenten, Zeiten, Fehlercode, Qualitätsstatus) |
| package.json (erweitert) | drei neue Testdateien in `test`- und `check`-Skript eingehängt; keine neue Abhängigkeit |
| work-order-execution.test.js (neu) | 33 Prüfpunkte: Laufstart/-status/-nummerierung, Parallelitätsschutz, doppelter Start, Agentenauswahl (Projektmanager immer, max. 3 Fachagenten, genau 1 Qualitätsagent, kanonisches Register, Auswahlgrund), Arbeitsplan, Ergebnis/Version 1/Unveränderlichkeit, `RESULT_READY`/`COMPLETED`, Qualitätsprüfung, `FAILED`+Neustart, `NEEDS_CLARIFICATION`+Rückfrage, keine Owner-/Kundenfreigabe/-Veröffentlichung/-Billing/-Provideraufruf, Audit-Vollständigkeit/-Datensparsamkeit, `no-store`, sichere Fehler |
| work-order-execution-security.test.js (neu) | 30 Prüfpunkte: Mandantentrennung bei Ergebnis-/Laufabfragen, fremde Work-Order-/Run-ID → 404, Tenant-/User-ID-Manipulation im Körper, Rollen-/Grant-/Sperrzustände, manipulierte Cookies/CSRF/Origin, zweites Safety-Gate `BLOCK`/`ESCALATE` (inkl. Datenbankinvarianten: kein Run-/Agenten-/Ergebnisdatensatz), kein paralleler Lauf, keine Systemprompt-/Chain-of-Thought-/Secret-Leckage, keine Publish-/Billing-/Providerroute, Audit-Metadaten-Allowlist |
| work-order-result-ui.test.js (neu) | 17 Prüfpunkte: Ergebnisdarstellung (Version/Zusammenfassung/Text/Qualitätsstatus deutsch), keine Agentenlog-/Systemprompt-/Chain-of-Thought-Anzeige, keine Freigabe-/Änderungsfunktion, ehrlicher Folgehinweis, kein „von Jamal geprüft“, keine Veröffentlichung/Billing/Providerwahl, mobile Metaangaben, Labels, `aria-live`, Fokuszustände, keine externe Ressource, kein Storage |
| portal-operations-acceptance.test.js (punktuell angepasst) | erwartete Migrationsversionsliste von `1–9` auf `1–10` angehoben (zwei Stellen: Erststart, Nachrüstung auf einer Vor-Schritt-3-Datenbank) |
| Verboten in diesem Schritt, offen für spätere Phasen | automatische (ungetriggerte) Ausführung ohne Owner-Startaktion, externer Provideraufruf, Canva, HeyGen, Veröffentlichung, Billing, automatischer Kostenverbrauch, reguläre Owner-Freigabe, echte Kundenfreigabe (`CUSTOMER_APPROVED`/`CHANGES_REQUESTED`), Mehrsprachigkeit, neue npm-Abhängigkeit, Commit/Push/Deploy |

+0 GET-/POST-/Prefix-Routen auf oberster Ebene, +0 statische Assets (alle fünf neuen Endpunkte hängen in den bereits bestehenden Prefix-Dispatchern; Routenzahlen bleiben exakt 70 GET/52 POST/8 GET-Prefix/4 POST-Prefix/27 statische Assets). +80 neue Prüfpunkte, +3 Testdateien: alte Summe 1749, neue Gesamtsumme **1829** (65 Testdateien, `npm run check`/`npm test` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt, `git diff --check` sauber).

## V7.2 Phase B – Schutz- und Einwilligungsgrundlage vor Commit der Self-Service-Korrektur (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger Ausgang: der bereits read-only geprüfte, produktkorrigierte Self-Service-Stand (siehe nächster Abschnitt), HEAD/`origin/main` weiterhin `be9848afc06c26dc056b33811dc2560e56696b5a`, 1693 Prüfpunkte grün, 60 Testdateien. Diese Ergänzung ist additiv; kein bestehender Codepfad aus Schritt 1 wurde inhaltlich umgeschrieben, mit einer Ausnahme (siehe Migration-8-Korrektur unten).

| Bereich | Regel |
|---|---|
| auth-db-migrations.js (erweitert, additiv) | neue Migration 9 (`create_policy_violations_and_widen_audit_event_types_v3`): legt Tabelle `policy_violations` an (`id`, `tenantId`/`userId` Foreign Keys, `workOrderId` optional Foreign Key mit `ON DELETE SET NULL`, `reasonCode`, `severity` `CHECK IN (LOW,MEDIUM,HIGH,CRITICAL)`, `actionTaken` `CHECK IN (BLOCKED,ESCALATED,WARNED,USER_SUSPENDED,TENANT_SUSPENDED,LICENSE_REVIEW_REQUIRED)`, `createdAt`), append-only per Trigger (wie `auth_audit_events`), Indizes auf `tenantId`/`userId`/`createdAt`; erweitert zugleich erneut die `eventType`-`CHECK`-Aufzählung von `auth_audit_events` (Tabellen-Neuaufbau-Technik wie Migration 7/8, SQLite kennt kein `ALTER TABLE ... ALTER COLUMN ... CHECK`) um zwei neue Ereignistypen. Transaktional, forward-only, idempotent |
| auth-db-migrations.js (Korrektur an Migration 8) | derselbe historische Snapshot-Fehler, der für Migration 7 bereits behoben wurde, trat erneut auf: Migration 8 referenzierte die live weiterwachsende `AUDIT_EVENT_TYPES`-Konstante statt eines eingefrorenen Snapshots – dadurch hätte Migration 8 nach Hinzufügen der beiden neuen Ereignistypen rückwirkend eine andere `CHECK`-Aufzählung erhalten, als sie zum Zeitpunkt ihrer ursprünglichen Anwendung hatte. Korrigiert **vor jedem Commit/Push** durch neue eingefrorene Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_8` (exakt die 33 Werte, die Migration 8 tatsächlich hatte); Migration 8s SQL referenziert jetzt diese Konstante statt der live wachsenden. Migrationen 1–7 dadurch nicht berührt; Migration 8s eigentliche `work_orders`-Struktur unverändert |
| business-use-policy.js (neu) | reines, DB-freies Modul: `evaluateWorkOrderContent(fields)` → `{decision, reasonCode, severity, policyVersion}`; fünf BLOCK-Kategorien (`CHILD_SAFETY_VIOLATION` CRITICAL, `HATE_OR_DISCRIMINATION`/`FRAUD_OR_IMPERSONATION`/`ILLEGAL_PURPOSE` HIGH, `UNLAWFUL_SURVEILLANCE` MEDIUM), drei ESCALATE-Kategorien (alle MEDIUM); deterministisch, keine Konfidenzstufe; dokumentiert Deny-/Escalate-by-default als Vorgabe für eine künftige, hier noch nicht implementierte modellgestützte Prüfung |
| auth-db.js (additiv erweitert) | neue Funktionen für `policy_violations`: `recordPolicyViolation`, `listPolicyViolationsForTenant`/`-ForUser`, `countPolicyViolationsForUser`/`-ForTenant`; keine Update-/Delete-Funktion (append-only) |
| auth-audit.js (erweitert) | `EVENT_TYPES` um `WORK_ORDER_BLOCKED_BY_POLICY`/`WORK_ORDER_AUTO_ESCALATED_BY_POLICY` erweitert (muss exakt der Migration-9-`CHECK`-Aufzählung entsprechen); Metadaten-Allowlist um `severity` erweitert (reiner Schweregrad-Code, kein Freitext) |
| work-order-service.js (erweitert) | `enforceBusinessUsePolicy`/`recordEscalationViolation`/`actionTakenFor` neu: Gate-Aufruf vor jeder Speicherung in `createForCustomer`/`resubmitForCustomer`, vor der automatischen Vollständigkeitsregel. `BLOCK` wirft `400` mit generischer Meldung, kein Datensatz entsteht; bei `severity=CRITICAL` zusätzlich `authDb.revokeAllSessionsForUser` und `actionTaken=LICENSE_REVIEW_REQUIRED`. `ESCALATE` speichert den Auftrag direkt mit Status `ESCALATED` |
| BUSINESS_USE_POLICY.md, SAFETY_ENFORCEMENT_MODEL.md, AVATAR_CONSENT_POLICY.md (neu) | kanonische Produkt-/Technikgrundsätze; keine fertigen AGB, keine abgeschlossene Rechtsprüfung; siehe eigene Abschnitte in `CURRENT_STATUS.md`/`PROJECT_MASTER.md` |
| package.json (erweitert) | zwei neue Testdateien in `test`- und `check`-Skript eingehängt; keine neue Abhängigkeit |
| business-use-policy.test.js (neu) | 27 Prüfpunkte: reine Gate-Funktionstests (ALLOW/BLOCK/ESCALATE, Determinismus, `policyVersion`) plus Ende-zu-Ende über `server.js#requestHandler` (BLOCK ohne Datensatz, generische Meldung, Audit-Datenminimierung, Wiederholungszählung, ESCALATE mit korrekter `workOrderId`-Referenz, CRITICAL mit Sessionwiderruf und `LICENSE_REVIEW_REQUIRED`, kein automatischer Lizenzentzug, Owner-Ausnahmerolle bleibt unverändert, normale Aufträge laufen weiterhin ohne Owner) |
| policy-documentation.test.js (neu) | Dokumentationskonsistenztest: prüft Existenz und Kerninhalte der drei neuen Policy-Dokumente sowie Querverweise/Konsistenz in allen sechs kanonischen Dokumenten, verhindert Behauptung einer abgeschlossenen Rechtsprüfung/fertiger AGB |
| Verboten in diesem Schritt, offen für spätere Phasen | vollständige KI-Inhaltsmoderation, automatische Eskalationsstufen bei wiederholten Verstößen, automatische Mandanten-/Benutzersperre, automatischer Lizenzentzug, Owner-Oberfläche für `policy_violations`, neue Avatar-Funktion, Agentenausführung, Veröffentlichung, Billing, Commit/Push/Deploy |

+0 GET-/POST-/Prefix-Routen, +0 statische Assets (reine Datenmodell-/Service-/Dokumentationsergänzung, keine neue HTTP-Fläche). +2 Testdateien (`business-use-policy.test.js` 27 Prüfpunkte, `policy-documentation.test.js` 29 Prüfpunkte; plus punktuelle Anpassung von `portal-operations-acceptance.test.js` an Migration 9): Self-Service-Ausgangsstand 1693, neue Gesamtsumme **1749** (**+56**, 62 Testdateien, `npm run check`/`npm test` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt, `git diff --check` sauber).

## V7.2 Phase B Schritt 1 – Erste echte Kundenfachfunktion: Arbeitsauftrag anlegen, prüfen, Status verfolgen (lokal umgesetzt, ungesichert – Commit/Push stehen aus; PRODUKTKORRIGIERT)

Vorheriger gesicherter Ausgang: **V7.2 Phase A Schritt 4**, Commit `be9848afc06c26dc056b33811dc2560e56696b5a` (Working Tree sauber, 68 GET/51 POST/8 Prefix/23 statische Assets/57 Testdateien, 1597 automatisierte Prüfpunkte grün). Schritt 1 von Phase B ist additiv; kein bestehender V7.0-, V7.1- oder Phase-A-Codepfad wurde umgeschrieben. Endet bewusst vor jeder automatischen Ausführung, jedem Agentenstart, jeder Veröffentlichung oder Kostenfreigabe.

**Produktkorrektur vor Commit/Push:** Die erste Umsetzung sah den OWNER fälschlich als regulären Pflichtprüfer (Freigabe/Ablehnung/Rückfrage) jedes Kundenauftrags vor. Korrigiert auf ein Selbstbedienungsmodell: die Zentrale entscheidet automatisch über Vollständigkeit, der OWNER greift nur noch in klar benannten Ausnahmefällen ein (Eskalieren/Stoppen). Migration 8, `auth-audit.js`, `auth-db.js`, `work-order-service.js`, `work-order-routes.js`, beide Oberflächen und alle drei Testdateien wurden entsprechend angepasst, bevor irgendetwas committet wurde.

| Bereich | Regel |
|---|---|
| auth-db-migrations.js (erweitert, additiv) | neue Migration 8 (`create_work_orders`): legt Tabelle `work_orders` an (`id` TEXT Primary Key serverseitig per UUID erzeugt, `tenant_id` als Foreign Key auf die bestehende Mandantenstruktur, `created_by_user_id`/`decided_by_user_id` als Foreign Keys auf Benutzer, `title`/`desired_result`/`context`/`deadline_text` mit `CHECK`-Längenbegrenzung, `status` mit `CHECK` auf zehn Werte (`DRAFT`/`SUBMITTED`/`NEEDS_CLARIFICATION`/`READY_FOR_PROCESSING`/`ESCALATED`/`CANCELLED` in Schritt 1 erreichbar; `IN_PROGRESS`/`RESULT_READY`/`CHANGES_REQUESTED`/`CUSTOMER_APPROVED` bereits für spätere Schritte vorbereitet, von keiner Funktion dieses Schritts gesetzt), `status_note`, `created_at`/`updated_at`/`submitted_at`/`decided_at`); Index auf `tenant_id` für die Kundenliste; transaktional, forward-only, idempotent; Migrationen 1–7 byteidentisch unverändert |
| auth-audit.js (erweitert) | `EVENT_TYPES` um acht neue Ereignistypen erweitert (`WORK_ORDER_CREATED`/`WORK_ORDER_SUBMITTED`/`WORK_ORDER_RESUBMITTED`/`WORK_ORDER_AUTO_READY`/`WORK_ORDER_AUTO_NEEDS_CLARIFICATION`/`WORK_ORDER_ESCALATED`/`WORK_ORDER_CANCELLED`/`WORK_ORDER_TENANT_MISMATCH_BLOCKED`); Metadaten-Allowlist um `workOrderId`/`statusTransition` erweitert; bestehender Sensitivinhalt-Filter unverändert und greift weiterhin fail-closed (kein Auftragstext, kein Owner-Grund im Audit) |
| auth-db.js (additiv erweitert) | neue, minimale Funktionen für `work_orders`: Anlegen (inkl. serverseitig entschiedenem Startstatus), Auflisten je Tenant, Auflisten aller (Owner), Einzelabruf mit Tenant-Prüfung, generischer `transitionWorkOrder` für jeden Statuswechsel (automatische Entscheidung, Resubmit, Escalate, Stop, Cancel) mit `updated_at`-Pflege; bleibt das einzige Modul mit direktem `better-sqlite3`-Import |
| work-order-service.js (neu) | reine Geschäftslogik ohne HTTP-Bezug: Validierung (Pflichtfelder, Textlängen, `assertKnownFieldsOnly` gegen Tenant-/Rollen-/Status-/Notizfelder im Kundenkörper), deterministische automatische Vollständigkeitsregel (`evaluateAutomaticDecision`, kein Owner beteiligt) für `SUBMITTED → READY_FOR_PROCESSING/NEEDS_CLARIFICATION`, Kunden-Resubmit/-Cancel, Owner-Ausnahmeaktionen `escalateForOwner`/`stopForOwner` (Pflichtgrund), deutsche Statusübersetzung und ehrlicher `READY_FOR_PROCESSING`-Hinweistext ohne Ausführungsbehauptung, keine Ausführungs-/Agentenfelder in jeder Antwort |
| work-order-routes.js (neu) | dünne HTTP-Schicht für fünf Kunden- und vier Owner-Routen; gleiches Muster wie `owner-admin-routes.js`/`customer-portal-routes.js` (`readJsonRequestBody`/`assertKnownFieldsOnly`/generische Fehlerantworten); Dispatcher für die dynamischen Pfadsegmente (`/:id`, `/:id/resubmit`, `/:id/cancel`, `/:id/escalate`, `/:id/stop`); **keine** `/approve`/`/reject`/`/request-clarification`-Route mehr |
| route-access-policy.js (erweitert) | neue Policy-Einträge: `GET/POST /api/portal/work-orders` und Präfix `/api/portal/work-orders/*` (`CUSTOMER_TENANT`), `GET /api/owner/work-orders` und Präfix `/api/owner/work-orders/*` (`OWNER_ONLY`); vier neue statische Assets (`/portal/auftrag-neu`, `/portal-work-order.js` `STATIC_AUTHENTICATED_PORTAL`; `/owner/auftraege`, `/owner-work-orders.js` `STATIC_OWNER_ONLY`); keine bestehende Policy-Zeile entfernt oder umklassifiziert |
| server.js (erweitert) | neue Routen/Präfixe/statische Assets verdrahtet; `customer-portal-service.js#getStatus` liefert `workOrdersEnabled: true` (weiterhin `publicationEnabled`/`billingEnabled: false`) |
| portal.html/portal-ui.js/portal.css (erweitert) | primäre Aktion „Neuen Arbeitsauftrag anlegen“, Liste „Meine Arbeitsaufträge“, eingebetteter Detail-/Resubmit-/Storno-Bereich (kein separates dynamisches Routing im Server nötig); ergänzte Stile für `textarea`/Listenelemente/Badges (inkl. `READY_FOR_PROCESSING`/`ESCALATED`/`CANCELLED`)/Link-Buttons inkl. sichtbarer Fokuszustände |
| portal-work-order-new.html/portal-work-order.js (neu) | Kundenformular mit vier Feldern (Titel/gewünschtes Ergebnis Pflicht), deutsche kundenfreundliche Sprache, Bestätigung, dass die Zentrale die Angaben automatisch prüft |
| owner-work-orders.html/owner-work-orders.js (neu) | Owner-Betriebsübersicht mandantenübergreifend, Detailansicht, genau zwei Ausnahmeaktionen (Eskalieren/Stoppen) mit Pflichtgrund statt regulärer Freigabe/Ablehnung/Rückfrage |
| package.json (erweitert) | drei neue Testdateien in `test`- und `check`-Skript eingehängt; keine neue Abhängigkeit |
| work-order-routes.test.js (neu) | 52 Prüfpunkte: Anlegen/automatische Statusentscheidung/Validierung/Feldlängen/verbotene Felder, Content-Type/CSRF/Origin, Resubmit/Cancel, Owner-Escalate/Stop, Audit (inkl. `actorUserId: null` bei automatischen Entscheidungen), `Cache-Control: no-store`, generische Fehler |
| work-order-security.test.js (neu) | 23 Prüfpunkte: Mandantenisolation, fremde/unbekannte ID identisch 404, verbotene Body-Felder, Rollen-/Grant-Blockaden, gesperrter Benutzer/Mandant, manipulierte Cookies/CSRF/Origin, keine Execution-/Publish-/Billing-/Providerroute, **keine** alte Owner-Freigabe-/Ablehnungs-/Rückfrageroute mehr (404), `CUSTOMER_ADMIN` erreicht Owner-Ausnahmeaktionen nicht, Audit bei Tenant-Mismatch |
| work-order-ui.test.js (neu) | 21 Prüfpunkte: deutsche Sprache, genau eine Hauptaktion je Seite, korrekte Pflichtfelder, keine Tenant-/Rollen-/Provider-/Kostenwahl, korrekte Statusübersetzungen (inkl. `READY_FOR_PROCESSING`/`ESCALATED`/`CANCELLED`), ehrlicher `READY_FOR_PROCESSING`-Hinweis, keine rohen IDs/Codes für Kunden, `aria-live`, Labels, Fokuszustände, mobile Metaangaben, keine externen Ressourcen/Tracking/Storage, Owner-Ausnahmeformular mit genau zwei Aktionen statt Prüfformular |
| Verboten in Schritt 1, offen für spätere Phasen | automatische Ausführung, Agentenstart, Toolauswahl, Veröffentlichung, Billing, echter Mailversand, Mehrsprachigkeit, Dateianhänge, Frameworkmigration, Commit/Push/Deploy, reguläre Owner-Freigabe/-Ablehnung |

+2 GET-Routen, +1 POST-Route, +2 GET-Prefixe, +2 POST-Prefixe, +4 statische Assets (jetzt 70 GET/52 POST/8 GET-Prefix/4 POST-Prefix/27 statische Assets). +96 neue Prüfpunkte (inkl. Produktkorrektur), +3 Testdateien: alte Summe 1597, neue Gesamtsumme **1693** (60 Testdateien, `npm run check`/`npm test` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt, `git diff --check` sauber). End-to-End-Verifikation des korrigierten Selbstbedienungs-Flusses vollständig gegen den echten `server.js#requestHandler` mit isolierter, temporärer Auth-Datenbank durchgeführt (siehe `work-order-routes.test.js`, kein Mock der Fachlogik); frühere Phase-A-Testserver-Läufe (Dev/Prod, zwei echte Mandanten) bleiben unverändert gültig, da Routen-/Session-/CSRF-Schicht identisch bleibt.

## V7.2 Phase A Schritt 4 – Betriebs-, Sicherheits- und Produktabnahme der Portalbasis (geprüft, lokal korrigiert, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: **V7.2 Phase A Schritt 3**, Commit `5bd302d7df7a848222ae55cdd7e29258153e02c2` (Working Tree sauber, 68 GET/51 POST/54 Testdateien, 1535 automatisierte Prüfpunkte grün). Schritt 4 ist eine reine Gesamtabnahme – kein neuer Produktfunktions-Sprint, keine neue Route, keine Frameworkmigration, keine neue npm-Abhängigkeit.

| Bereich | Regel |
|---|---|
| owner-admin-service.js (korrigiert) | neue Funktion `findCustomerUserOrThrow(db, userId)`: prüft zusätzlich zu `findUserOrThrow`, dass die Rolle in `INVITABLE_ROLES` (`CUSTOMER_ADMIN`/`CUSTOMER_USER`) liegt, sonst generisches `404` (`notFound("Benutzer unbekannt.")`); ersetzt `findUserOrThrow` in `suspendUser`/`reactivateUser`/`revokeSessionsForUser`/`reissueInvitation`/`revokeInvitation`/`preparePasswordReset`; verhindert, dass die Owner-Kundenverwaltungsfläche fremde OWNER-/SUPPORT-Konten adressieren kann; keine Verhaltensänderung für echte Kundenbenutzer |
| package.json (erweitert) | drei neue Testdateien in `test`- und `check`-Skript eingehängt; keine neue Abhängigkeit |
| portal-security-acceptance.test.js (neu) | 27 Prüfpunkte: echte Cross-Tenant-Isolation mit zwei kanonischen Mandanten, Rollenmatrix (OWNER/CUSTOMER_ADMIN/CUSTOMER_USER/SUPPORT), Regressionstest für die obige Korrektur, Cookie-/CSRF-Manipulation, Prod-Modus ohne Dev-Bypass, keine Secrets in Antworten |
| portal-operations-acceptance.test.js (neu) | 15 Prüfpunkte: echter Erststart/Wiederanlauf, eine über ein isoliertes Einwegskript nachgebildete echte Vor-Schritt-3-Datenbank (nur Migrationen 1–6) wird beim Öffnen auf Migration 7 gehoben und behält ihre Auditdaten, beschädigte Datenbank bricht fail-closed ab, Owner-Bootstrap als echter Kindprozess (idempotent), Backup-Abgrenzung, WAL-Mehrfachverbindung, In-Memory-Ratenlimiter-Grenze |
| portal-usability-acceptance.test.js (neu) | 20 Prüfpunkte: statische Prüfung der ausgelieferten HTML-/CSS-/JS-Dateien auf deutsche Sprache, Hauptaktionen, fehlende IDs/technische Codes/externe Ressourcen, Tastaturlabels, `aria-live`, Fokuszustände, fehlende Fachauftrags-/Publish-/Billing-Aktionen |
| Verboten in Schritt 4, offen für spätere Phasen | jede neue Fachfunktion, Veröffentlichung, Billing, echter Mailversand, Mehrsprachigkeitsfunktion, Phase B, Commit/Push/Deploy |

0 neue/entfernte Routen (weiterhin 68 GET/51 POST/8 Prefix/23 statische Assets). +62 neue Prüfpunkte, +3 Testdateien: alte Summe 1535, neue Gesamtsumme **1597** (57 Testdateien, `npm run check`/`npm test` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt, `git diff --check` sauber). Vollständige manuelle End-to-End-Abnahme mit zwei eigenständigen isolierten Testservern (Dev und Prod, eigenes `HOME`/`KUZ_DATA_DIR`, eigener Port) und zwei echten Mandanten (33/33 Schritte grün) durchgeführt und danach gezielt beendet – fremde, langlaufende Serverprozesse aus früheren Sitzungen wurden dabei nachweislich nicht angefasst. Vollständiger Bericht mit allen Einzelprüfungen: `V7_2_PHASE_A_ACCEPTANCE.md`.

## V7.2 Phase A Schritt 3 – Deutsches Kundenportal und Owner-Verwaltung (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: **V7.2 Phase A Schritt 2**, verifiziert am Commit `41b6dbc602f9fd4f5e91099492cc08be72b0014c` (Working Tree sauber, 65 GET/51 POST/51 Testdateien, 1450 automatisierte Prüfpunkte grün laut realem, isoliertem Testlauf desselben Commits). Schritt 3 ist additiv; kein bestehender V7.0-, V7.1- oder Schritt-1/2-Codepfad wurde umgeschrieben, außer der notwendigen additiven Router-Erweiterung um POST-Präfixrouten. Kein Kundenportal-Fachauftrag, keine Canva-/HeyGen-Kundenfreigabe, kein Billing, kein echter Mailversand, keine Mehrsprachigkeit, keine Phase B.

| Bereich | Regel |
|---|---|
| route-access-policy.js (erweitert) | neue Zugriffsklasse `STATIC_AUTHENTICATED_PORTAL` (`allowedRoles: OWNER/CUSTOMER_ADMIN/CUSTOMER_USER`, `authRequired: true`, `tenantRequired: false`, kein Dev-Bypass, `HIDDEN_404`); neue Policy-Einträge für `GET /api/owner/tenants` (+ Präfixrouten Einzelabruf/Benutzerliste), `GET /api/portal/me`, `GET /api/portal/status` (`CUSTOMER_TENANT`), zwei neue POST-Präfixe `/api/owner/tenants/*`/`/api/owner/users/*` (`OWNER_ONLY`); statische Assets klassifiziert: Login/Einladung/Reset `STATIC_PUBLIC`, Kundenportal-Startseite/-Skript `STATIC_AUTHENTICATED_PORTAL`, Owner-Verwaltungsseite/-Skript `STATIC_OWNER_ONLY`; keine bestehende Policy-Zeile wurde entfernt oder umklassifiziert |
| auth-db-migrations.js (erweitert, additiv) | neue Migration 7 (`widen_audit_event_types`): atomarer Tabellen-Rebuild von `auth_audit_events` (Kopie in `auth_audit_events_v2` mit erweitertem `CHECK`, `DROP`/`RENAME`, Trigger/Indizes neu angelegt), da SQLite kein direktes `ALTER` einer `CHECK`-Klausel erlaubt; neue Konstante `AUDIT_EVENT_TYPES_AT_MIGRATION_5` hält den historischen Enum-Stand exakt fest, damit Migration 5 (`create_auth_audit_events`) unverändert bleibt und ihre Reproduzierbarkeit nicht rückwirkend verändert wird; Migrationen 1–6 sind byteidentisch unverändert |
| auth-audit.js (erweitert) | `EVENT_TYPES` um neun neue Ereignistypen erweitert (`TENANT_ACTIVATED`/`TENANT_SUSPENDED`/`USER_INVITED`/`INVITATION_REISSUED`/`INVITATION_REVOKED`/`USER_SUSPENDED`/`USER_REACTIVATED`/`USER_SESSIONS_REVOKED`/`PASSWORD_RESET_PREPARED`); bestehender Sensitivinhalt-Filter (`FORBIDDEN_METADATA_PATTERNS`, u. a. `/password/i`/`/passwort/i`/`/\btoken\b/i`) unverändert und greift fail-closed unabhängig vom Feldnamen – `routeName`-Werte müssen diese Muster meiden (z. B. `owner-user-prepare-reset` statt eines „password“ enthaltenden Namens) |
| auth-db.js (additiv erweitert) | vier neue, minimale Funktionen: `updateTenantStatus` (expliziter Statuswechsel getrennt von `updateTenantDisplayName`), `listUsersByTenantId`, `findLatestPendingTokenForUser`, `revokePendingTokensForUser`; bleibt das einzige Modul mit direktem `better-sqlite3`-Import |
| owner-admin-service.js (neu) | reine Geschäftslogik ohne HTTP-Bezug; `listTenants`/`getTenantDetail`/`activateTenant`/`suspendTenant`/`listUsersForTenant`/`inviteUser`/`suspendUser`/`reactivateUser`/`revokeSessionsForUser`/`reissueInvitation`/`revokeInvitation`/`preparePasswordReset`; `INVITABLE_ROLES` erlaubt ausschließlich `CUSTOMER_ADMIN`/`CUSTOMER_USER` (niemals `OWNER`/`SUPPORT`); jede Aktion protokolliert genau ein geschlossenes Audit-Ereignis über `auditSafe` (schluckt Auditfehler, ohne die Aktion selbst zu blockieren – Audit ist Beobachtung, keine Voraussetzung); Tokens werden nur als Rückgabewert weitergegeben, nie persistiert im Klartext (Hash über bestehende `auth-http-routes.js#generateAndStoreToken`) |
| owner-admin-routes.js (neu) | dünne HTTP-Schicht; lokale `readJsonRequestBody`/`assertKnownFieldsOnly` (gleiches Muster wie `auth-http-routes.js`); `sendServiceError` mappt Service-Fehler auf generische, geheimnisfreie HTTP-Antworten (404 unbekannt, 409 Konflikt, 400 Validierung); Dispatcher `dispatchOwnerTenantsGetPrefix`/`dispatchOwnerTenantsPostPrefix`/`dispatchOwnerUsersPostPrefix` für die dynamischen Pfadsegmente |
| customer-portal-service.js (neu) | `getMe(db, identity)` liefert ausschließlich die sechs dokumentierten Felder aus der bereits vom Route-Guard validierten `identity` (niemals rohe Query-/Body-Werte); `getStatus()` liefert einen statischen, ehrlichen Bereitschaftsstatus ohne Datenbankzugriff |
| customer-portal-routes.js (neu) | `handleGetPortalMe`/`handleGetPortalStatus`; beide reine GET-Lesezugriffe ohne Body; Tenant/Rolle ausschließlich aus `context.identity` |
| server-http-router.js (additiv erweitert) | neue, optionale `postRoutePrefixHandlers`-Liste (Standard `[]`, identisches Verhalten für jeden bestehenden Aufrufer ohne diese Option); POST-Dispatch prüft zuerst exakte `postRoutes`, danach `postRoutePrefixHandlers`, sonst 405; `getRegisteredPostRoutePrefixHandlerCount()` additiv für Tests |
| server.js (Verdrahtung) | Import `owner-admin-routes.js`/`customer-portal-routes.js`; `staticAssets` um 8 neue Einträge erweitert (`portal-login.html` für 4 Pfade, `portal-auth.js`, `portal.css`, `portal.html`, `portal-ui.js`, `owner-admin.html`, `owner-admin.js`); `getRoutes` um 3 neue exakte GET erweitert; `routePrefixHandlers` um `/api/owner/tenants/` (GET) erweitert; neue `postRoutePrefixHandlers`-Liste (`/api/owner/tenants/`, `/api/owner/users/`) an `createHttpRouter` übergeben und zusätzlich exportiert; insgesamt jetzt 68 GET / 51 POST |
| scripts/auth-bootstrap-owner.js (neu) | `npm run auth:bootstrap-owner`; erstellt/aktualisiert genau ein Owner-Konto; maskierte Passworteingabe über eine eigene `readline`-Zeilenwarteschlange (funktioniert identisch bei echtem TTY und bei Pipe-Eingabe in Tests); Passwortpolitik wiederverwendet (`auth-password.js#validatePasswordPolicy`); idempotent (zweiter Lauf mit bekannter E-Mail aktualisiert nur Passwort/Status, legt kein zweites Konto an); bricht kontrolliert ab, wenn die E-Mail bereits einer Nicht-Owner-Rolle gehört; kein HTTP-Endpunkt, kein statischer Zugangscode |
| Portal-Assets (neu) | `portal.html`/`portal-login.html`/`portal-ui.js`/`portal-auth.js`/`portal.css`/`owner-admin.html`/`owner-admin.js`; reines HTML/CSS/Vanilla-JS ohne Build-Schritt, kein externes CDN, keine externe Schriftart, kein Tracking, keine Selbstregistrierung; `portal-auth.js` unterscheidet die vier öffentlichen Einstiegspfade anhand `location.pathname` und entfernt Tokens nach Verwendung aus der URL |
| Verboten in Schritt 3, offen für spätere Phasen | Fachaufträge/Business-Routen, Veröffentlichung, Billing, echter Mailversand, Canva-/HeyGen-Kundenbedienung, Mehrsprachigkeitsfunktion, vollständige Support-Grant-Vergabe, Phase B, Commit/Push/Deploy |

3 neue Testdateien (`owner-admin-routes.test.js` 34, `customer-portal-routes.test.js` 18, `portal-assets.test.js` 23 = 75 neue Prüfpunkte) sowie punktuell angepasste Erwartungen in `route-access-policy.test.js`, `server-http-router.test.js`, `daily-work-run.test.js` und `agent-runtime.test.js` (Routenzahlen 68 GET/51 POST/6 GET-Präfixe/2 POST-Präfixe/23 statische Assets). Realer, reproduzierbarer Baseline-Vergleich (kein Schätzwert, keine manuelle Hochrechnung): ein isolierter Checkout des unveränderten Baseline-Commits `41b6dbc602f9fd4f5e91099492cc08be72b0014c` liefert bei identischem `npm test`-Lauf exakt **1450** `ok`-Prüfpunkte (Exit-Code 0); der aktuelle Arbeitsstand liefert exakt **1535** `ok`-Prüfpunkte (Exit-Code 0) – **alte Baseline 1450, +85 neue Prüfpunkte, neue Gesamtsumme 1535** (54 Testdateien, `npm run check` Exit-Code 0, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert gepinnt). Werkzeug-Sandbox-Nebenbefund (kein Produktfehler, siehe `CURRENT_STATUS.md`): ein einzelner Integrationstest benötigte in der verwendeten Ausführungsumgebung erweiterte Dateisystemrechte, um gegen das Execution-Bridge-Fixture-Repository zu laufen; mit diesen Rechten bestehen alle 73 Prüfpunkte in `server-http-router.test.js`. Manuelle lokale HTTP-Abnahme gegen zwei isolierte Testserver (Dev und Prod, eigenes `HOME`/`KUZ_DATA_DIR` unter `/tmp`, eigener Port, keine echten Zugangsdaten) mit vollständigem Owner→Einladung→Kunden→Logout-Fluss bestanden und danach kontrolliert beendet.

## V7.2 Phase A Schritt 2 – Route-Gates, Auth-Routen und Owner-/Customer-Trennung (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: **V7.2 Phase A Schritt 1 / gesichert mit Commit `e2cd018`**. Schritt 2 ist additiv; kein bestehender V7.0-, V7.1- oder Schritt-1-Codepfad wurde umgeschrieben, außer der notwendigen Router-/Server-Integration des neuen Auth-Gates. Kein Kundenportal-UI, keine Auftragserfassung, keine Canva-/HeyGen-Kundenfreigabe, kein Billing, keine Mehrsprachigkeit, keine Phase B.

| Bereich | Regel |
|---|---|
| route-access-policy.js (neu) | einzige kanonische Zugriffspolitik-Wahrheit; Zugriffsklassen `PUBLIC_AUTH`/`AUTHENTICATED_ANY`/`CUSTOMER_TENANT`/`CUSTOMER_ADMIN_TENANT`/`OWNER_ONLY`/`SUPPORT_GRANT_ONLY`/`DISABLED_IN_PROD`/`STATIC_PUBLIC`/`STATIC_OWNER_ONLY`; jede GET-/POST-Route, jeder Prefix-Handler und jedes statische Asset hat genau eine Policy; doppelte/widersprüchliche Einträge sind Startfehler; Route ohne Policy ist fail-closed (Prod 404, Test Fehler); `validatePolicyTable`/`resolvePolicyForRequest` gegen echte, spezifischere Pfade vor Prefix; keine Wildcards, kein Browserparameter beeinflusst die Policy |
| Klassifizierung | alle bestehenden Chef-Routen (`/api/projects*`, `/api/airtable/*`, `/api/cockpit/*`, `/api/agents/*`, `/api/server-status`, `/api/v7-freeze-status`, `/api/v71/documents*`/`tools*`/`plugin-gateway*`/`tool-routing*`, alle Backup-/Restore-, HeyGen-, Canva-, Agency-Routen, alle Chef-Assets) → `OWNER_ONLY`; `/api/execution/*` zusätzlich `DISABLED_IN_PROD` (Dev-Modus weiterhin `OWNER_ONLY`); keine bestehende Kundenfachroute wird geöffnet |
| auth-http.js (neu) | Cookie-Lesen/-Schreiben ohne weitere Dependency; Session-Cookie `__Host-kuz_session` (Prod, HttpOnly/Secure/SameSite=Lax/Path=/) bzw. `kuz_dev_session` (Dev, kein HTTPS); CSRF-Cookie `__Host-kuz_csrf`/`kuz_dev_csrf` (nicht HttpOnly, 32-Byte-Zufallstoken, Header `x-kuz-csrf`, timing-safe Vergleich, rotiert mit Sessionrotation); Origin-/Host-Validierung inkl. IPv6-Bracket-Notation; Client-IP nur gehasht; zentrale Sicherheitsheader; keine Sessiondaten in localStorage/sessionStorage/URL/HTML/Logs |
| auth-rate-limit.js (neu) | In-Memory Fixed-Window-Limiter ohne weitere Dependency; Login 10/15min je normalisierter E-Mail, 20/5min je IP-Hash; Reset-Anfrage 3/h je Konto, 10/h je IP-Hash; Reset-Bestätigung 20/h je IP-Hash; Schlüssel nur als Hash; Cleanup gegen unbeschränktes Speicherwachstum; kontrollierbare Uhr für Tests |
| auth-route-guard.js (neu) | zentrales Gate vor jedem Handler: Modus → Policy → fail-closed ohne Policy → Prod-Deaktivierung → Sessioncookie → Sessionhash → Lebensdauer → frischer Nutzer-/Mandantenstatus → Session-Widerruf bei ungültigem Nutzer/Mandant → Rolle → Tenant aus Session → Tenant-Mismatch-Prüfung (`customerId`/`tenantId`/`brandId`/`campaignId`/`projectId` in Query/Body/Pfad) → CSRF/Origin bei unsicheren Methoden → Request-Identity; abweichender Tenantparameter → 404 + Audit `TENANT_MISMATCH_BLOCKED`; `SUPPORT_GRANT_ONLY` ohne `identity.supportGrant` → 404 (keine pauschale Support-Bypass-Regel); Audit-Fehler dürfen das Gate nie zum Absturz bringen, Ablehnung bleibt fail-closed |
| auth-http-routes.js (neu) | `POST /api/auth/login` (Host-/Origin-Prüfung, JSON, Bodylimit, bekannte Felder, generische Fehlermeldung für unbekannte E-Mail/falsches Passwort/INVITED/LOCKED/DISABLED/SUSPENDED-Tenant, Dummy-scrypt bei unbekanntem Konto, Rate-Limit, transaktionaler Fehlversuchszähler, Lockout, bei Erfolg Zähler-Reset/`lastLoginAt`/neue Session ohne Übernahme der mitgelieferten Session/Sessionrotation/minimierte Antwort ohne interne IDs); `POST /api/auth/logout` (Auth optional, Origin/CSRF bei vorhandener Session, Session-Widerruf, beide Cookies löschen, immer `{ok:true}`, idempotent); `GET /api/auth/session` (ohne Session `{authenticated:false}`, mit Session nur `displayName`/`roleLabel`/`tenantDisplayName`); `POST /api/auth/password-reset/request` (immer identische Antwort, kein Kontonachweis, Token nur gehasht gespeichert, kein Mailversand in Phase A, kein Token in Log/Audit); `POST /api/auth/password-reset/confirm` (generische Fehlermeldung bei ungültig/abgelaufen/verbraucht, atomare Einlösung, Passwortregeln, Sessions widerrufen, kein Auto-Login); `POST /api/auth/invitation/accept` (nur Zweck INVITE, `INVITED`→`ACTIVE`, atomare Einlösung, alte Sessions widerrufen, kein automatischer Mandantenwechsel) |
| server-http-router.js (Gate-Integration) | optionales `evaluateAccess` läuft vor jedem GET-/POST-Handler und vor `serveStatic`; ohne `evaluateAccess` bleibt der Router unverändert (bestehende Aufrufer/Tests unberührt); kein Handler lädt oder schreibt vor erfolgreichem Gate; unbekannte POST-Route bleibt 405; statische Asset-Policy wird vor Auslieferung geprüft; Pfad-Traversal-Schutz unverändert |
| server.js (Verdrahtung) | `ensureAuthDbReady` (Migrationen + Tenant-Projektion, fail-closed bei Startfehler in echtem Serverstart via `process.exit(1)`); `KUZ_MODE`-Validierung (`prod` ohne `KUZ_PUBLIC_ORIGIN` → Startabbruch); Konsolenwarnung im Dev-Modus; `evaluateAccess` wrappt `auth-route-guard.js#evaluateRouteAccess`; alle Antworten inkl. `authHttpModule.SECURITY_HEADERS`; +1 GET/+5 POST Auth-Routen; insgesamt jetzt 65 GET / 51 POST |
| Betriebsmodi | `KUZ_MODE=dev` (Standard): Loopback, bestehender Chef-Modus lokal ohne Owner-Login nutzbar, Kunden-/Tenantgrenzen bleiben unverändert; `KUZ_MODE=prod`: `KUZ_PUBLIC_ORIGIN` zwingend, exakte Origin-Prüfung, `Secure`-Cookies, kein Dev-Bypass, Chef-Assets/-Routen nur mit OWNER-Session, Execution vollständig deaktiviert, unklassifizierte Route 404, Startabbruch bei fehlender Pflichtvariable |
| Verboten in Schritt 2, offen für Schritt 3 oder spätere Phasen | Kundenportal-UI, kundenbedienbare Fachroute, Owner-Route zur Benutzeranlage, vollständige Support-Grant-Vergabe, Veröffentlichung, Mehrsprachigkeitsfunktion, Billing, Phase B, Commit/Push/Deploy |

2 neue Testdateien (`route-access-policy.test.js` 52, `server-auth-routes.test.js` 44 = 96 neue Prüfpunkte) sowie punktuell angepasste Erwartungen in `server-http-router.test.js` (Routenzahlen 65 GET/51 POST; `POST /api/execution/prepare` mit fremdem Host liefert jetzt 404 statt 403, da das Auth-Gate mit `HIDDEN_404`-Strategie bereits vor dem bisherigen Handler-internen Origin-Check greift), `daily-work-run.test.js` und `agent-runtime.test.js` (Routenzahl 65 GET); gesamt 1450 von 1450 Prüfpunkten grün (51 Testdateien, `npm run check` Exit-Code 0, `npm audit` 0 Schwachstellen, `git diff --check` sauber). Manuelle lokale HTTP-Abnahme gegen zwei isolierte Testserver (Dev und Prod, eigenes `HOME`/`KUZ_DATA_DIR` unter `/tmp`, eigener Port, keine echten Zugangsdaten) bestanden und danach kontrolliert beendet.

## V7.2 Phase A Schritt 1 – Auth-Kern und persistente Identitätsschicht (umgesetzt, getestet und gesichert mit Commit `e2cd018`)

Vorheriger gesicherter Ausgang: **V7.1 Phase C.1 und C.1.1 / gemeinsam gesichert mit Commit `6621d93`**. Legt ausschließlich die Datengrundlage; keine Route-Gates, kein Login, kein Kundenportal. `auth-db.js` kapselt vollständig eine neue `auth.sqlite` (6 nummerierte Migrationen; Tabellen `tenants`/`users`/`sessions`/`password_reset_tokens`/`auth_audit_events`); `auth-password.js` (`crypto.scrypt`-Hashing); `auth-session.js` (256-Bit-Sessiontokens nur gehasht gespeichert, 12h absolute/60min Idle-Lebensdauer, max. 5 aktive Sessions je Nutzer); `auth-audit.js` (Append-only Audit-Log); `auth-tenant-link.js` (Projektion der kanonischen `agency-tenant-registry.js` in die Auth-Datenbank; Projektionen starten `SUSPENDED`; unbekannte DB-Mandanten fail-closed zum Startabbruch). `better-sqlite3@13.0.1` exakt gepinnt, `npm audit`: 0 Schwachstellen.

## V7.1 Phase C.1.1 – Reviewmodell skalierbar und rollenbasiert korrigiert (umgesetzt, getestet und gemeinsam mit Phase C.1 gesichert mit Commit `6621d93`)

Vorheriger Ausgang: Phase-C.1-Stand auf gesichertem Phase-C-Commit `52b2d02`. Ausschließlich Review-/Freigabemodell; kein neuer Funktionsbereich, keine Phase D, keine Veröffentlichung, keine neue Canva-Aktion.

| Bereich | Regel |
|---|---|
| Reviewmodell | `reviewMode`: `OWNER_REVIEW` / `CUSTOMER_SELF_REVIEW` / `PREMIUM_INTERNAL_REVIEW` / `RISK_ESCALATION`; `qualityReviewStatus`: `NOT_STARTED` → `AGENT_QA_PENDING` → `AGENT_QA_PASSED`/`AGENT_QA_FAILED` → ggf. `HUMAN_REVIEW_REQUIRED` → `HUMAN_REVIEW_COMPLETED` bzw. `ESCALATED` |
| Service-Tiers | `INTERNAL` (Eigenprojekt, Owner-Review), `STANDARD` (Kunden-Selbstprüfung nach Agenten-QS), `PREMIUM` (optionales menschliches Review + Kundenfreigabe), `ESCALATED` (Risikofall); Flags `ownerReviewRequired` / `customerSelfReviewAllowed` / `humanReviewRequired` / `riskEscalationRequired` |
| Agenten-QS | eigene Prüfstufe mit `PASS`/`PASS_WITH_NOTES`/`FAIL`/`ESCALATE` und 9 Checklist-Punkten; FAIL/ESCALATE blockieren Kundenreview; Standardkunde erreicht nach PASS direkt `READY_FOR_CUSTOMER_REVIEW` ohne Jamal-Prüfung |
| Café-Amore-Pilot | bleibt `INTERNAL`/`OWNER_REVIEW`/`ownerReviewRequired=true`; Jamals Review unverfälscht erhalten |
| Persistenzschutz | Mandantenwechsel blockiert; stillschweigender Reviewmoduswechsel blockiert; einzige zulässige reviewMode-Änderung ist ausdrückliche Eskalation; Tarifwechsel nach Kundenfreigabe blockiert |
| API | +3 POST (`agent-qa`, `human-review`, `escalate`); Reviewmodus lesen über bestehende GET-Pilotakte; insgesamt 64 GET / 46 POST |
| Mehrsprachigkeit | nur Leitplanke: DE zuerst; später PT/EN/ES/FR lokalisiert mit eigenem Status/QS/Freigabe/Veröffentlichungssperre; keine Sprachrouten in dieser Phase |
| Verboten | Veröffentlichung, neue Canva-Aktion, Commit/Push/Deploy, Phase D, Übersetzungsfunktion |

## V7.1 Phase C.1 – realen Canva-Pilot kanonisch abgeschlossen und Kundenfeedback-Schleife vorbereitet (umgesetzt, getestet und gemeinsam mit Phase C.1.1 gesichert mit Commit `6621d93`)

Vorheriger gesicherter Ausgang: **V7.1 Phase C / gesichert mit Commit `52b2d02`**. Phase C.1 ist additiv; kein bestehender V7.0-, V7.1-Phase-A-, -B-, -B.1- oder -C-Codepfad wurde umgeschrieben oder ersetzt. Der reale Canva-Pilot wurde außerhalb des lokalen Servers über den bereits in Phase C beschriebenen `CONTROLLED_CONNECTOR_HANDOFF` durchgeführt; diese Phase bildet das Ergebnis nachträglich kanonisch ab und bereitet die Kundenfeedback-Schleife vor, ohne selbst eine neue Canva-Aktion auszulösen.

| Bereich | Regel |
|---|---|
| canva-pilot-result-record.js (neu) | kanonisches, testbares Datenmodell `pilotResultRecord`; Pflichtfelder `pilotId`/`toolId`/`connectorType`/`customerId`/`brandId`/`campaignId`/`projectId`/`jobPackageId`/`providerJobId`/`candidateId`/`designId`/`designTitle`/`designType`/`pageCount`/`costPackageStatus`/`providerExecutionStatus`/`internalReviewStatus`/`customerReviewStatus`/`publicationApprovalStatus`/`createdAt`/`updatedAt`/`evidence`/`feedbackHistory`/`changeRequestHistory`/`decisionHistory`/`immutableTenantFingerprint`; `designId` darf nicht identisch mit `candidateId` sein (Kandidat ≠ Design); Erstellung ohne vollständige Mandantenbindung wird abgewiesen; `computeImmutableTenantFingerprint` bindet Mandant/Marke/Kampagne dauerhaft; keine edit-/view-URL als öffentliche Wahrheit; referenziert `canva-connector.js` nicht (keine Canva-Aktion möglich); `publicationApprovalStatus` kann durch keine exportierte Funktion verändert werden (kennt nur den einen Wert `NOT_APPROVED`); `buildRealPilotResultRecordSeed()` liefert exakt die berichteten kanonischen Pilotdaten inkl. Jamals realer `evidence`-Bewertung |
| Kundenfeedback-Schleife (canva-pilot-result-record.js) | Lifecycle `NOT_READY/CHANGES_POSSIBLE → READY_FOR_CUSTOMER_REVIEW → CUSTOMER_CHANGES_REQUESTED → READY_FOR_REVIEW_AFTER_CHANGES → CUSTOMER_APPROVED`; `recordInternalReview` nur erreichbar mit echter `designId`, vollständiger Mandantenbindung und weiterhin nicht freigegebener Veröffentlichung; `recordCustomerFeedback` bindet Feedback zwingend an den Mandanten der Akte (nie an Aufrufer-Angaben), blockiert ohne `designId`, erlaubt ausschließlich die sechs definierten `feedbackType`-Werte (`TEXT_CHANGE`/`IMAGE_CHANGE`/`LAYOUT_CHANGE`/`BRAND_ADJUSTMENT`/`MESSAGE_ADJUSTMENT`/`GENERAL_FEEDBACK`) und `createdByRole`-Werte; `requestChanges`/`markReadyAfterChanges`/`approveByCustomer` ändern niemals `costPackageStatus`, Rechtefreigaben oder `publicationApprovalStatus`; `approveByCustomer` ist ohne abgeschlossenes internes Review strukturell nicht erreichbar |
| canva-pilot-store.js (neu) | isolierte, dateibasierte Metadaten-Persistenz unter App Support (`canva-pilot/pilot-results`), analog zu `canva-store.js`; `assertNoTenantReassignment` blockiert eine nachträgliche Kunden-/Mandantenumstellung und ein Überschreiben des `immutableTenantFingerprint`; `listPilotResultRecords` filtert optional nach `customerId` (Kunde A kann Kunde B nicht lesen); `safeId` verhindert Directory-Traversal über `pilotId` |
| canva-backup.js (additiv erweitert) | Export-Allowlist um `pilotResults` erweitert (Pilot-/Design-ID, Titel, Status, interne Bewertungsnotizen, Kundenfeedback, Änderungs-/Entscheidungsverlauf, Mandanten-Fingerprint); keine Bilder, Canva-Dateien, Vorschaubilder, Tokens, Credentials, Provider-Komplettantworten, private Canva-URLs, Brand-Kit-Assets oder App-Support-Dateien im Export; Restore weist eine versuchte Mandanten-Neuzuordnung gezielt zurück (`rejectedPilotResultIds`), startet keine Canva-Aktion, erzeugt kein Design, speichert nichts extern, veröffentlicht nichts, setzt keine Freigabe zurück, lädt keine Medien/Providerdaten nach; ältere Sicherungen ohne `pilotResults` bleiben abwärtskompatibel gültig |
| server.js (additive Routen) | Phase C.1: 1 neue GET (`/api/v71/canva/pilot-results` inkl. Präfixrouten) + 5 neue POST; Phase C.1.1: +3 POST (`agent-qa`, `human-review`, `escalate`); insgesamt jetzt 64 GET / 46 POST; keine Route für Veröffentlichung, Social Posting, Canva-Login, API-Key, Einladung, Freigabelink, Löschen, Abrechnung, Credits oder Brand-Kit-Zugang; alle bestehenden Sicherheitsguards unverändert wiederverwendet; die reale Pilotakte wird beim ersten Zugriff einmalig deterministisch aus dem kanonischen Seed erzeugt (C.1.1 backfillt fehlende Reviewmodell-Felder additiv, ohne Pilotprotokoll zu verfälschen) |
| index.html / v71-ui.js (additiv) | neuer Chef-Modus-Bereich „Canva-Pilot-Ergebnisakte“ innerhalb des bestehenden Canva-Designpilot-Bereichs: reales Ergebnis (gespeichertes Design, interne Design-ID, 1 Seite, interne Prüfung, nicht veröffentlicht), Jamals Bewertung (`evidence`), Kundenfeedback-Historie, klare Statusanzeige (Entwurf gespeichert / interne Prüfung abgeschlossen / Kundenfeedback möglich / Veröffentlichung offen – nicht freigegeben); Aktionsbuttons ausschließlich für erneute interne Prüfung, Kundenfeedback erfassen, Änderungswunsch anfordern, Änderung erledigt & erneut geprüft, Kundenfreigabe (Entwurf, keine Veröffentlichung); keine verbotenen Buttons (Veröffentlichen/Teilen/Einladen/Canva öffnen als Kunde/Alles freigeben/Credits kaufen/Löschen) |
| Verboten in Phase C.1, offen für spätere, separat freigegebene Phasen | jede Veröffentlichung, jedes Social Posting, jeder echte Kundenzugang zu Canva, jede weitere externe Canva-Aktion, Brand-Kit-Anbindung, automatische Kundenkommunikation, Marketing-Agentur-Gesamtsystem, Shopify-Anbindung, Commit/Push/Deploy, Autonomieerhöhung, Phase D |

3 neue Testdateien (`canva-pilot-result-record.test.js` 25, `canva-pilot-store.test.js` 7, `server-v71-canva-pilot-routes.test.js` 25 = 57 neue Prüfpunkte) sowie erweiterte Prüfpunkte in `canva-backup.test.js` (+4), `canva-ui.test.js` (+10) und aktualisierte Routenzahl-Prüfpunkte in `server-http-router.test.js`/`daily-work-run.test.js`/`agent-runtime.test.js`; gesamt 1254 von 1254 Prüfpunkten grün (46 Testdateien). Kein neuer Trockenlauf gegen einen externen Server nötig, da der reale Pilot bereits real (extern) ausgeführt wurde; die kanonische Abbildung selbst wurde ausschließlich lokal gegen isolierte, temporäre App-Support-Verzeichnisse getestet – keine externe Netzwerkanfrage, keine Kosten, keine Veröffentlichung.

## V7.1 Phase C – Canva als zweiter kontrollierter Design-Connector (umgesetzt, getestet und gesichert mit Commit `52b2d02`)

Vorheriger gesicherter Ausgang: **V7.1 Phase B.1 / gesichert mit Commit `37e8a28`**. Phase C ist additiv; kein bestehender V7.0-, V7.1-Phase-A-, -B- oder -B.1-Codepfad wurde umgeschrieben oder ersetzt. Architektur-Entscheidung: `CONTROLLED_CONNECTOR_HANDOFF` – kein direkter HTTP-Client mit API-Key im Node-Server (dasselbe Muster wie Phase B, eigenständige, isolierte Canva-Module).

| Bereich | Regel |
|---|---|
| canva-design-job-package.js (neu) | kanonisches `canvaDesignJobPackage`-Modell; Capability-Profil; Datenschutz-/Marken-/Rechteprüfung (nur `NORMAL`, kein Kunden-/Gesundheits-/Kinderbezug, keine ungeklärten Asset-/Markenrechte, kein privates Brand-Kit/Template im ersten Pilot, keine Secrets/absoluten Pfade); `customerId`/`brandId`/`campaignId` verpflichtend und gegen `agency-tenant-registry.js` geprüft; Fingerprint über inhaltsbestimmende Felder invalidiert frühere Freigaben bei Änderung; sieben getrennte Freigabefunktionen (`approveBriefingAndText`, `approveAssetsAndRights`, `approveExternalTransfer`, `setInternalCostApproval`, Handoff-Freigabe über Token, Kandidatenauswahl-Freigabe über Token, Save-Freigabe über Token); `publicationApprovalStatus` startet immer auf `PUBLICATION_NOT_APPROVED` und kann durch keine Funktion auf `APPROVED` gesetzt werden |
| canva-connector.js (neu) | kontrollierter Adapter; keine Netzwerklogik (kein `http`/`https`/`fetch`); minimales Hand-off-Payload per strikter Allowlist (keine internen Pfade, keine App-Support-Pfade, keine Secrets, keine Governance-Felder); Hand-off-/Kandidaten-/Ergebnis-/Save-Token nutzen ausschließlich die bestehende `execution-bridge.js`-Tokenarchitektur (`mintToken`/`consumeToken`, RAM-only, einmalig); Kandidaten- und Editing-Transaktionslogik korrekt gespiegelt (Kandidat ≠ Design, Vorschau ≠ gespeichert, Commit nur mit eigener Freigabe, Cancel verwirft kontrolliert); im ersten realen Pilot ausschließlich `GENERATE_DESIGN_CANDIDATES`/`CREATE_SELECTED_CANDIDATE` vorgesehen, Brand-Template-/Edit-Aktionen nur modelliert/getestet; additiver Pilotstatus (`PARTIALLY_CONNECTED`/`CONTROLLED_HANDOFF`) ohne Änderung der kanonischen `tool-registry.js`/`plugin-gateway.js`-Basiswahrheit |
| canva-design-result.js (neu) | strukturierte Ergebnisrückführung `canvaDesignJobResult`; `providerJobId` allein ist kein Erfolg; Candidate-ID ist keine Design-ID (identische Werte werden abgewiesen); nur gültige HTTPS-Ergebnisreferenzen (kein `file://`, kein localhost, keine private IP, keine Credentials in URL); keine automatische Veröffentlichung, kein automatischer Dateidownload |
| canva-store.js (neu) | lokale, dateibasierte Metadaten-Persistenz unter App Support (`canva/{packages,results,editing-transactions}`), analog zu `heygen-store.js`; `assertNoTenantReassignment` blockiert eine nachträgliche Kunden-/Markenumstellung eines bereits gespeicherten Jobpakets; `listPackages`/`listResults` filtern optional nach `customerId`; keine Videos/Bilder, keine Secrets |
| canva-backup.js (neu) | additiver Export von Auftragspaket-/Ergebnis-/Editing-Transaktions-Metadaten ohne Originaldateien, API-Keys, Tokens, Credentials oder private Brand-Kit-/Template-Assets; Restore startet keine Canva-Aktion (keine Generierung, kein Design, keine Editing-Transaktion, keine Veröffentlichung), setzt keine Freigabe zurück, markiert nur abgelaufene Pakete `STALE` |
| tool-registry.js | additiv erweiterter Canva-Eintrag (Capability-Details, Pilotgrenzen als Hinweistexte); Basis-`connectionStatus`/`executionMode` bleiben unverändert `NOT_CONNECTED`/`RECOMMENDATION_ONLY` |
| server.js (additive Routen) | 3 neue GET (`/api/v71/canva/status`, `/api/v71/canva/job-packages` inkl. Präfixroute für Einzelabruf, `/api/v71/canva/backup/export`) + 16 neue POST (Paket vorbereiten/validieren, vier getrennte Freigaben, Kostenpaketstatus setzen, Hand-off-Token anfordern/einlösen, Kandidaten-Token anfordern/einlösen, Ergebnis-Token anfordern/einlösen, Kundenentwurf freigeben/Änderungen anfordern, Restore-Vorschau); insgesamt jetzt 63 GET / 38 POST; keine Route für Canva-Login, API-Key-Speicherung, automatische Veröffentlichung, öffentliche Freigabelinks, Kunden-/Team-Einladung, Designlöschung, Kontoverwaltung, Creditkauf oder Abrechnung |
| index.html / v71-ui.js (additiv) | neuer Chef-Modus-Bereich „Canva-Designpilot · Testmandant“; editierbare Kunde-/Marke-/Kampagne-Auswahl (Testmandantenbasis); vier getrennte Freigabeschritte über getrennte Buttons/Routen vor der Übergabe (keine Sammelfreigabe); keine verbotenen Buttons (Veröffentlichen/Öffentlich teilen/Kunden einladen/Löschen/Credits kaufen); Status Kandidat/Entwurf/Vorschau/gespeichert textlich klar unterscheidbar; technische Details einklappbar; bestehende, mobilgeprüfte Layoutklassen wiederverwendet |
| Verboten in Phase C, offen für spätere, separat freigegebene Phasen | echte Canva-Designerstellung, jede externe Übertragung, jede Kostenübernahme, jede Veröffentlichung, Brand-Template-/Edit-Transaktion im realen Pilot, direkter Canva-API-Adapter im Node-Server, Löschaktionen, Marketing-Agentur-Gesamtsystem, Shopify-Anbindung, Commit/Push/Deploy, Autonomieerhöhung |

236 neue automatisierte Prüfpunkte (8 neue Testdateien); gesamt 1165 von 1165 Prüfpunkten grün. Trockenlauf (neutraler, fiktiver Café-Test, Instagram-Post, `NOT_BILLABLE_TEST`) und vollständige Browser-/Mobile-Abnahme (eigener isolierter Testserver, Port 4199, danach beendet, Testauftragspaket aus dem App-Support-Speicher wieder entfernt) bestanden; keine externe Netzwerkanfrage, keine Kosten, keine Veröffentlichung.

## V7.1 Phase B.1 – HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet (umgesetzt, getestet und gesichert mit Commit `37e8a28`)

Vorheriger gesicherter Ausgang: **V7.1 Phase B / gesichert mit Commit `ff43089`**. Phase B.1 ist additiv; kein bestehender V7.0-, V7.1-Phase-A- oder V7.1-Phase-B-Codepfad wurde umgeschrieben oder ersetzt. Neue mandantenfähige Kern-Felder (`customerId`/`brandId`/`campaignId`) wurden bewusst als verpflichtend eingeführt (Schema-Weiterentwicklung innerhalb derselben Phase, keine zweite, widersprüchliche Wahrheit) und bestehende Tests/Fixtures entsprechend additiv erweitert.

| Bereich | Regel |
|---|---|
| agency-tenant-registry.js (neu) | kanonische Mandantenbasis: `customer`/`brand`/`campaign`-Modelle; zwei fest hinterlegte, ausdrücklich als „Testmandant/kein echter Kunde“ gekennzeichnete Testkunden mit je einer Testmarke und Testkampagne; `validateTenantBinding`/`assertValidTenantBindingOrThrow` blockieren unbekannte oder nicht zusammengehörige IDs; `filterRecordsForCustomerView` erzwingt Mandantentrennung in Ansichten; keine zweite Projekt-/Agentenregistry |
| heygen-pilot-review.js (neu) | kanonisches Pilot-Review-Modell für den bereits extern ausgeführten ersten realen Piloten; trennt Providerstatus (`renderStatus`) strikt von lokaler Verifikation (`isLocallyVerifiedSuccess`; Session-ID allein genügt nicht); unbekannte Werte (Kosten, Credits, Renderdauer, dauerhafte URL) bleiben `UNKNOWN`; `jamalDecision` kann durch keine Funktion automatisch `APPROVED_FOR_CUSTOMER_USE` werden; `reviewFingerprint` bindet die inhaltsbestimmenden Felder |
| heygen-result-lifecycle.js (neu) | Ergebnisrückführungs-Statuskette `PROVIDER_PROCESSING → PROVIDER_SUCCEEDED → LOCAL_VALIDATED → INTERNAL_REVIEW → READY_FOR_CUSTOMER_REVIEW → CUSTOMER_CHANGES_REQUESTED/CUSTOMER_APPROVED → PUBLICATION_NOT_APPROVED`; jeder Übergang ist eine eigene, explizite Funktion (keine Sammelfreigabe); `PUBLISHED` ist strukturell unerreichbar (keine exportierte Funktion kann diesen Zustand setzen); Datensatz bleibt mandantengebunden |
| agency-backup.js (neu) | additiver Export von Testkunden-/Marken-/Kampagnenmetadaten und dem kanonischen Pilot-Review ohne Credentials/Tokens/Medien; Restore-Vorschau prüft Konsistenz gegen die code-definierte Registry und meldet unbekannte/fremde Kunden-IDs, verändert aber nichts, startet nichts, veröffentlicht nichts |
| heygen-job-package.js (additiv erweitert) | `customerId`/`brandId`/`campaignId` jetzt verpflichtend und gegen `agency-tenant-registry.js` geprüft; neue Felder `providerFolderReference` (immer `PLANNED_NOT_CREATED`), `billableUnit`, `customerPackageId`, `costPackageStatus` (`INCLUDED_IN_PACKAGE`/`ADDITIONAL_APPROVAL_REQUIRED`/`UNKNOWN`/`NOT_BILLABLE_TEST`), fünfte Freigabestufe `customerDraftApprovalStatus` (`approveCustomerDraft` setzt eine bereits erteilte interne Inhaltsfreigabe voraus, setzt niemals `publicationApproved`; `requestCustomerDraftChanges` für Änderungswünsche) |
| heygen-store.js (additiv erweitert) | `assertNoTenantReassignment` blockiert an der Persistenzgrenze eine nachträgliche Kunden-/Markenumstellung eines bereits gespeicherten Jobpakets; `saveResult` leitet `customerId`/`brandId`/`campaignId`/`projectId` ausschließlich vom zugehörigen Jobpaket ab (nie vom Aufrufer); `listPackages`/`listResults` filtern optional nach `customerId`; neue `lifecycles`-Ablage (`saveLifecycle`/`loadLifecycle`/`listLifecycles`) |
| heygen-backup.js (additiv erweitert) | Export-Allowlist um `customerId`/`brandId`/`campaignId`/`providerFolderReference`/`billableUnit`/`customerPackageId`/`costPackageStatus`/`customerDraftApprovalStatus`/`customerChangeRequestNote` sowie die vom Store abgeleitete Ergebnis-Mandantenbindung erweitert; Restore weist einzelne Datensätze mit widersprüchlicher Mandantenzuordnung gezielt ab (`rejectedJobPackageIds`/`rejectedJobResultJobPackageIds`), statt den gesamten Restore abzubrechen oder die Zuordnung stillschweigend zu überschreiben |
| heygen-connector.js (additiv erweitert) | `buildAgencyConnectorOperatingModel()` dokumentiert rein beschreibend das zentrale Agentur-Servicekonto-Modell (kein Kundenlogin, keine Kundenaktion, `CONTROLLED_HANDOFF`, `INTERNAL_ONLY`, geplante-aber-nicht-angelegte Providerordnerstrategie); keine echte HeyGen-Ordner-/Sub-Workspace-Anlage, keine Connectoraktion |
| server.js (additive Routen) | 5 neue GET (`/api/v71/agency/customers`, `/brands`, `/campaigns`, `/pilot-review`, `/backup/export`) + 5 neue POST (`heygen/job-package/approve-customer-draft`, `/request-customer-draft-changes`, `/set-cost-package-status`, `heygen/result-lifecycle/advance`, `agency/backup/restore-preview`); bestehende HeyGen-GET-Routen um optionalen `customerId`-Filter erweitert; Einzelabruf eines Jobpakets liefert bei `customerId`-Mismatch bewusst `404` (keine Existenzpreisgabe) statt `403`; insgesamt jetzt 60 GET / 22 POST |
| index.html / v71-ui.js (additiv) | neuer Bereich „HeyGen-Agenturbetrieb · Testmandant“ im bestehenden HeyGen-Pilotbereich: Kunde/Marke/Kampagne/Projekt, Providerstatus, interner Status, Kostenstatus, Kundenfreigabe, Veröffentlichungsstatus, nächster Jamal-Schritt je Jobpaket-Karte; klare Kennzeichnung Testmandant/kein Kundenportal/kein HeyGen-Zugang/Providerkonto intern/nicht veröffentlicht/nicht abrechenbar; zwei zusätzliche, getrennte Buttons (Kundenentwurf freigeben / Änderungen anfordern); weiterhin kein Veröffentlichungsbutton |
| Verboten in Phase B.1, offen für spätere, separat freigegebene Phasen | weiterer echter HeyGen-Renderlauf, jede externe Übertragung, jede Kostenübernahme, jede Veröffentlichung, echte Kundenanmeldung/echtes Kundenportal, produktive Kundenanlage, Canva-Connector, vollständiges Marketing-Agentur-Gesamtsystem, Commit/Push/Deploy, Autonomieerhöhung, Phase C |

188 neue/erweiterte automatisierte Prüfpunkte (5 neue Testdateien plus additive Erweiterungen in 9 bestehenden Testdateien); gesamt 929 von 929 Prüfpunkten grün. Browser-/Mobile-Abnahme gegen einen eigenen isolierten Testserver bestanden; keine externe Netzwerkanfrage, kein weiterer HeyGen-Render, keine Kosten, keine Veröffentlichung.

## V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector (umgesetzt, getestet und gesichert mit Commit `ff43089`)

Vorheriger gesicherter Ausgang: **V7.1 Phase A / gesichert mit Commit `59f985f`**. Phase B ist additiv; kein bestehender V7.0- oder V7.1-Phase-A-Codepfad wurde umgeschrieben oder ersetzt. Architektur-Entscheidung: `CONTROLLED_CONNECTOR_HANDOFF` – kein direkter HTTP-Client mit API-Key im Node-Server.

| Bereich | Regel |
|---|---|
| heygen-job-package.js (neu) | kanonisches `heygenJobPackage`-Modell; Capability-Profil; Datenschutz-/Rechteprüfung (nur `NORMAL`, kein Voice Clone, kein privater Avatar ohne Zustimmung, keine Gesundheits-/Kunden-/Kinderdaten, keine Secrets/absoluten Pfade); Fingerprint über inhaltsbestimmende Felder; `externalTransferApproved`/`costApprovalStatus`/`publicationApproved` starten immer auf Nicht-Freigabe; `publicationApproved` kann durch keine Funktion auf `true` gesetzt werden |
| heygen-connector.js (neu) | kontrollierter Adapter; keine Netzwerklogik (kein `http`/`https`/`fetch`); minimales Hand-off-Payload per strikter Allowlist (keine internen Pfade, keine App-Support-Pfade, keine Secrets, keine Governance-Felder); Hand-off-/Ergebnis-Token nutzen ausschließlich die bestehende `execution-bridge.js`-Tokenarchitektur (`mintToken`/`consumeToken`, RAM-only, einmalig); additiver Pilotstatus (`PARTIALLY_CONNECTED`/`CONTROLLED_HANDOFF`) ohne Änderung der kanonischen `tool-registry.js`/`plugin-gateway.js`-Basiswahrheit |
| heygen-job-result.js (neu) | strukturierte Ergebnisrückführung; `providerJobId` allein ist kein Erfolg; nur gültige HTTPS-Ergebnisreferenzen (kein `file://`, kein localhost, keine private IP, keine Credentials in URL); keine automatische Veröffentlichung, kein automatischer Dateidownload |
| heygen-store.js (neu) | lokale, dateibasierte Metadaten-Persistenz unter App Support (`heygen/{packages,results}`), analog zu `document-registry.js`; keine Videos/Audios/Bilder, keine Secrets |
| heygen-backup.js (neu) | additiver Export von Auftragspaket-/Ergebnis-Metadaten ohne Originaldateien, API-Keys, Tokens oder Credentials; Restore startet keinen HeyGen-Job, wiederholt keinen Hand-off, veröffentlicht/kauft nichts, markiert nur abgelaufene Pakete `STALE` |
| tool-registry.js | additiv erweiterter HeyGen-Eintrag (Capability-Details, Pilotgrenzen als Hinweistexte); Basis-`connectionStatus`/`executionMode` bleiben unverändert `NOT_CONNECTED`/`RECOMMENDATION_ONLY` |
| server.js (additive Routen) | 3 neue GET (`/api/v71/heygen/status`, `/api/v71/heygen/job-packages` inkl. Präfixroute für Einzelabruf, `/api/v71/heygen/backup/export`) + 10 neue POST (Paket vorbereiten/validieren, Inhalt/externe Übertragung/Kosten getrennt freigeben, Hand-off-Token anfordern, Hand-off vorbereiten, Ergebnis-Token anfordern, Ergebnis validieren, Restore-Vorschau); insgesamt 55 GET / 17 POST; keine Route für API-Key-Speicherung, Login, Löschen, Kauf, Upgrade, automatische Veröffentlichung oder freien URL-Abruf |
| index.html / v71-ui.js / styles.css (additiv) | neuer Chef-Modus-Bereich „HeyGen-Pilot“; vier getrennte Freigabeschritte über getrennte Buttons/Routen (keine Sammelfreigabe); keine verbotenen Buttons (Veröffentlichen/Löschen/Klonen/Credits kaufen); technische Details einklappbar; bestehende, mobilgeprüfte Layoutklassen wiederverwendet |
| Verboten in Phase B, offen für spätere, separat freigegebene Phasen | echter HeyGen-Renderlauf, jede externe Übertragung, jede Kostenübernahme, jede Veröffentlichung, direkter HeyGen-API-Adapter im Node-Server, Avatar-/Voice-Erstellung, Löschaktionen, Canva-Connector, Marketing-Agentur-Gesamtsystem, Commit/Push/Deploy, Autonomieerhöhung |
| Korrigierte Fehleinschätzung aus der Vorprüfung | ein scheinbarer Baseline-Konflikt zwischen der vorgeschriebenen Fixture-Dirty-Baseline und der Execution-Bridge-Prüfung erwies sich bei genauerer Prüfung als Einschränkung der verwendeten Ausführungsumgebung (Dateisystemzugriff), nicht als echter Code- oder Repository-Fehler; mit regulären Rechten läuft der betroffene Test grün; Fixture-Repository blieb währenddessen unverändert im vorgeschriebenen Dirty-Zustand |

144 neue automatisierte Prüfpunkte (7 neue Testdateien); gesamt 816 von 816 Prüfpunkten grün. Trockenlauf (neutraler, nicht-existenter Café-Test) und vollständige Browser-/Mobile-Abnahme (eigener isolierter Testserver, Port 4599, danach beendet) bestanden; keine externe Netzwerkanfrage, keine Kosten, keine Veröffentlichung.

## V7.1 Phase A – Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway (umgesetzt, getestet und gesichert mit Commit `59f985f`)

Vorheriger gesicherter Ausgang: **V7.0 offiziell FROZEN / `15ce8bb`**. V7.1 Phase A ist additiv; kein bestehender V7.0-Codepfad wurde umgeschrieben oder ersetzt.

| Bereich | Regel |
|---|---|
| document-registry.js (neu) | Metadaten-/Referenzmodell für Projektunterlagen; Originale ausschließlich unter App Support (`documents/{originals,metadata,previews,quarantine,test-inbox}`); Allowlist-Dateitypen; Traversal-/Symlink-/Secret-Dateischutz; Hashing vor/nach Ablage; Dublettenerkennung; kein produktiver Browser-Upload, stattdessen isolierter Test-Upload gegen serverseitige Fixture-Dateien; kein Lösch-Endpunkt |
| tool-registry.js (neu) | alleinige kanonische Quelle für Werkzeugidentität/-fähigkeiten/-lizenz/-kosten; 21 vorgemerkte Werkzeuge in 14 Kategorien; keine Zugangsdaten; Lizenz niemals automatisch `CONNECTED` |
| plugin-gateway.js (neu) | alleinige kanonische Quelle für Live-/Adapterzustand und deterministisches Tool-Routing; spiegelt Codex/GitHub(lokal, read-only)/Airtable(Zugangsdaten-Anwesenheit); Canva/HeyGen/Shopify/Vercel nur vorgemerkt; Health-Hardblock bleibt wirksam |
| server.js (PRODUCTIVE_PLUGIN_REGISTRY) | unverändert, V7.0-eingefroren, ausschließlich UI-Textsammlung für den Cockpit-„Plugin-Leitstand"; wird von V7.1-Modulen nicht gelesen/verändert; zusätzlich als `module.exports.PRODUCTIVE_PLUGIN_REGISTRY` für Bestandsschutztests exportiert (keine Verhaltensänderung) |
| v71-registry-backup.js (neu) | additives, eigenständig versioniertes Schema `v71-phase-a-metadata-1`; sichert nur Metadaten/Register-Schnappschüsse; keine Originaldateien, Credentials, Tokens; Restore liefert nur eine geprüfte Vorschau, schreibt nichts zurück; Schema v1/v2 von `local-data-backup.js` bleiben unverändert und getrennt |
| server.js (additive Routen) | 5 neue GET (`/api/v71/documents`, `/api/v71/tools`, `/api/v71/plugin-gateway`, `/api/v71/tool-routing`, `/api/v71/backup/export`) + 3 neue POST (`/api/v71/documents/register`, `/api/v71/documents/test-upload`, `/api/v71/backup/import-preview`); insgesamt 52 GET / 7 POST; alle bestehenden Sicherheitsguards wiederverwendet (kein zweiter Token-Mechanismus) |
| index.html / styles.css / v71-ui.js (neu) | drei additive Chef-Modus-Bereiche; bestehende CSS-Klassen wiederverwendet, kein Redesign; Agentenzugriff-Einschränkung und Wissensquellen-Markierung im Formular ergänzt |
| Verboten in Phase A, offen für Phase V7.1 B | produktiver Canva-/HeyGen-/Shopify-Lauf, echter Browser-Datei-Upload, Sichtbarkeit von Dokumentreferenzen direkt in `guided-work-ui.js` (bewusst unverändert gelassen), Commit/Push/Deploy, Autonomieerhöhung |
| Nachbesserung nach 1. manueller Safari-Abnahme (styles.css, v71-ui.js, plugin-gateway.js) | Checkbox-Layout „externe Übertragung erlaubt"/„Veröffentlichung erlaubt" korrigiert: globale Formularregel (`width:100%`, `min-height:42px`, `padding:8px 10px`) griff ungewollt auf `type="checkbox"`; jetzt eng begrenzte `.v71-checkbox`/`.v71-checkbox-label`-Regel (feste 18×18px-Box, umbrechende Beschriftung, `for`/`id`-Kopplung); Standardwert weiterhin `false`. `recommendToolForTask` liefert bei Blockierung zusätzlich `status: "BLOCKED"`, `blockedCandidate` (fachlich geeignet, aber nicht ausführbar, inkl. `connectionStatus`/`missingApprovals`/`costStatus`/`dataClassificationBoundary`/`fallback`), `blockedAlternatives`, `nextAllowedJamalStep`; weiterhin keine erfundene Empfehlung, kein automatischer Start, Canva/HeyGen/Shopify bleiben `NOT_CONNECTED`. Neue Tests: 10 zusätzliche Prüfpunkte in `plugin-gateway.test.js`, neue Datei `v71-ui.test.js` (12 Prüfpunkte) |

## V7.0 offiziell FROZEN – Jamal-Entscheidung (2026-07-25)

Vorheriger gesicherter Ausgang: **V7.0 Phase E / `52ce012`**. Kein neuer Code-Pfad, keine Autonomieerhöhung, kein Deployment, keine Phase V7.1: nur der kanonische, auditierbare Nachweis von Jamals ausdrücklicher Entscheidung, V7.0 einzufrieren.

| Bereich | Regel |
|---|---|
| v7-freeze-status.js (additiv) | neue Konstante `MANUAL_FREEZE_DECISION` (Version, Status FROZEN, `decidedBy: "Jamal"`, Entscheidungsdatum `2026-07-25`, Basis-Commit `52ce012`); `computeFreezeStatus()` liefert `FROZEN` ausschließlich, wenn genau dieses geprüfte Objekt explizit übergeben wird; ohne dieses Argument unverändert nur `IN_REVIEW`/`FREEZE_CANDIDATE` |
| server.js | `GET /api/v7-freeze-status` übergibt `MANUAL_FREEZE_DECISION`; keine neue Route, keine neue Methode, weiterhin 405 für alles außer GET |
| guided-work-ui.js | bestehende, eingeklappte Freeze-Karte zeigt bei FROZEN zusätzlich Entscheidungsträger, Datum und Basis-Commit; kein neuer Button, keine neue Primäraktion |
| Verboten in diesem Schritt, offen für Phase V7.1 | Unfreeze-Mechanismus, zweiter Weg zu FROZEN, Commit/Push/Deploy außerhalb dieses einen Freeze-Commits, Autonomieerhöhung, Beginn von V7.1 |

## V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat (umgesetzt, getestet, gesichert mit Commit `52ce012`)

Vorheriger gesicherter Ausgang: **V7.0 Phase D / `6553452`**. Phase E baut keinen neuen Executor, sondern prüft den gesamten bestehenden Ablauf (Fokus → Vorschlag → Team → Baseline → Paket → isolierte Ausführung/Hybrid-Rückführung → Abschluss) auf Stimmigkeit und schließt nur echte, bestätigte Lücken.

| Bereich | Regel |
|---|---|
| v7-freeze-status.js (neu) | read-only Statusmodell `IN_REVIEW\|FREEZE_CANDIDATE\|FROZEN`; leitet Status aus Phasenhistorie, aktuellem Git-Commit/Working-Tree und zuletzt gemessenem Testlauf ab; die automatische Ableitung setzt `FROZEN` nie selbst |
| GET /api/v7-freeze-status | Route additiv (47. GET-Route); read-only; andere Methoden 405 |
| guided-work-ui.js | eingeklappte Freeze-Status-Karte („unten nachschauen“); Sticky-Kopf und Tagesabschluss zeigen zusätzlich „Wer arbeitet daran“ und „Tatsächlich ausgeführt / Evidenz“ (bestehende Felder, kein neues Datenmodell) |
| index.html | veraltete Aussage „Keine Execution Bridge“ korrigiert (Mock/Codex-Fixture existieren seit Phase C/D; Health bleibt unberührt) |
| Verboten in Phase E, offen für Phase V7.1 | automatisches Setzen von `FROZEN` ohne Jamal, Codex-/Apply-Start für Health, Commit/Push/Deploy, Autonomieerhöhung, Beginn von V7.1 |

## V7.0 Phase D – Codex als kontrollierten Executor anbinden (umgesetzt, getestet, gesichert mit Commit `6553452`)

Vorheriger gesicherter Ausgang: **V7.0 Phase C / `0858b4e`**. Phase D bindet Codex als ersten realen Executor an die Execution Bridge an, ausschließlich isoliert gegen das Fixture-Repository. Health bleibt für Codex und Apply hart blockiert.

| Bereich | Regel |
|---|---|
| execution-codex-adapter.js | `spawn()`-basierte Prozessführung, `stdio: ["ignore","pipe","pipe"]`, `--ask-for-approval never`; kein `shell: true` |
| execution-executor-registry.js | listet Mock und Codex mit Verfügbarkeit/Autorisierung; genau ein primärer Button je Zustand in der UI |
| Health-Blockade | Codex-Start und Apply für das Health-Projekt serverseitig hart blockiert |
| DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS | `150000`ms (echter Fixture-Pilot zeigte: 15s reichte nicht) |
| Verboten in Phase D, offen für Phase E | Health-E2E-Gesamtaudit/Freeze-Status, produktive Codex-/Apply-Freigabe für Health, Commit/Push/Deploy, Autonomieerhöhung |

## V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor (umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit `0858b4e`)

Vorheriger gesicherter Ausgang: **V7.0 Phase B / `3487a84`**. Phase C baut die isolierte Ausführungsgrundlage mit deterministischem Mock-Executor. Kein Codex, keine KI, kein Commit/Push/Deployment. Health bleibt Apply-gesperrt. Apply nur gegen Fixture-Repository nach Jamal-Freigabe.

| Bereich | Regel |
|---|---|
| execution-bridge.js | Baseline, Isolation, Lock, Attempt-/Apply-State, Evidence, Apply-Gate |
| execution-mock-adapter.js | nur deterministische Szenarien SUCCESS/ALLOWLIST_VIOLATION/FAILURE/TIMEOUT |
| Workspaces/Locks/Audit | unter `~/Library/Application Support/KI-Unternehmenszentrale/` |
| API | GET status/result + POST prepare/start/cancel/apply; Token nur RAM |
| Verboten in Phase C, offen für Phase D–E | Codex-/Cursor-Agentenstart, KI, produktive Health-Apply-Freigabe, Commit/Push/Deploy |

## V7.0 Phase B – Betriebsstabilität (umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit `3487a84`)

Vorheriger gesicherter Ausgang: **V7.0 Phase A / `4a74ebe`**. Phase B macht den lokalen Betrieb der Zentrale verständlich und zuverlässig (Serverstatus, Port, PID, Version, Commit, nächster sicherer Schritt) und behebt Unklarheit bei `EADDRINUSE` und veraltetem Code. Der Controller (`npm run central:start` u. a.) ist der empfohlene lokale Startweg; `npm start` bleibt manueller Fallback. Health bleibt ausschließlich read-only Pilotquelle.

| Bereich | Regel |
|---|---|
| scripts/zentral-ctl.js | separater lokaler Controller; `status`/`start`/`stop`/`restart`; verwaltet nur selbst gestartete Prozesse; nie Fremd-Kill; SIGTERM statt `kill -9`; kein `shell: true` |
| App-Support-Verzeichnis | `~/Library/Application Support/KI-Unternehmenszentrale/server/`; außerhalb aller Repositories; atomare Statusdatei; keine Secrets/Env/Browserdaten |
| server-status.js | reines Domänenmodul; unveränderliche Start-Momentaufnahme; Statusmodell `RUNNING\|STOPPED\|STALE\|PORT_CONFLICT\|VERSION_MISMATCH\|UNKNOWN` |
| GET /api/server-status | Route 43 von 43; read-only; kein Prozessstart/-stopp; andere Methoden 405 |
| guided-work-ui.js | additive, kompakte Statusanzeige; Details standardmäßig geschlossen; kein Steuerbutton |
| Verboten in Phase B, offen für Phase D–E (Phase C siehe oben) | Codex-/Agentenstart, produktive Repository-Arbeit, Health-Schreiben, Commit/Push/Deploy, Autonomieerhöhung |

Server-Version/-Commit werden beim Start unveränderlich erfasst (`UNKNOWN` bei nicht lesbarem Git-Stand). Portkonflikte werden nur gemeldet, nie automatisch aufgelöst; ein fremder Prozess auf Port 4173 wurde real getestet und blieb während des gesamten Controller-Lebenszyklus (start/status/restart/stop auf Alternativport) unverändert am Leben. 32 neue automatisierte Prüfpunkte plus erweiterte Bestandstests; gesamt 384 von 384 Prüfpunkten grün; vollständige Browser-Abnahme inkl. Mobile 390×844 bestanden.

## V7.0 Phase A – Guided Work Foundation (umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit `4a74ebe`)

Vorheriger gesicherter Ausgang: **V6.46.0 / `e611c9c`**. V7.0 insgesamt ist damit **nicht** abgeschlossen; Phase B und Phase C siehe oben; Phase D bis Phase E bleiben offen und nicht umgesetzt. Phase A ist speicherkompatibel über denselben Key `ki-unternehmenszentrale-daily-work-runs-v1`. Neue Läufe erhalten `schemaVersion: 2`; v1-Läufe bleiben unverändert lesbar. Keine automatische persistente Migration. Backup/Restore erkennt v1 und v2; ein v1-Import darf lokale v2-Läufe nicht stillschweigend überschreiben (`acknowledgeV2Overwrite` erforderlich; für diesen Override existiert bewusst noch keine UI-Freigabesteuerung – der sichere Standard bleibt aktiv).

| Bereich | Regel |
|---|---|
| guided-work.js | Phasen, Vorschläge, Team, Baseline, Prefill, Invalidierung |
| guided-work-ui.js | Hauptarbeitsraum; sticky Führung; keine zweite State-Quelle |
| daily-work-run.js | bleibt kanonische Tageslaufdomäne |
| health-hybrid-work.js | bleibt Paket-/Fingerprint-/Evidenz-/Gate-Domäne; known-dirty mit Bestätigung |
| health-repo-status.js | additive Live-Details: relative dirty/untracked paths, Inhaltshashes, Fingerprint |
| local-data-backup.js | Secret-Heuristik unverändert scharf; False Positive bei bloßer `.env`/`.env.local`-Pfadnennung gezielt korrigiert |
| Verboten in Phase A und B, offen für Phase D–E (Phase C siehe oben) | Codex-/Agentenstart, Tests aus Zentrale, Health-Schreiben, Commit/Push/Deploy |

Health Upgrade Kompass bleibt ausschließlich read-only Pilotquelle. Hybrid-Fallback V6.46.0 bleibt vollständig nutzbar. 322 automatisierte Prüfpunkte grün; vollständige Browser-Abnahme inkl. Mobile 390×844 bestanden.

## V6.46.0 – Health Hybrid End-to-End-Pilot (letzter gesicherter Stand `e611c9c`)

V6.46.0 bleibt speicherkompatibel (`schemaVersion: 1`). Neue Felder `executionPackage`, `releaseGates` und `externalExecutionEvidence` sind additiv; alte Tagesläufe ohne diese Felder bleiben lesbar. Neue GET-Route: `/api/projects/health-upgrade-kompass/live-status` (nur Health, nur Git-Read). Kein Testprozess und kein Git-Schreiben aus der Zentrale. Vorheriger gesicherter Ausgang: V6.45.2 / `fb9aa0d`. Externe Evidenz ist kein automatisch bestätigter Fachbefund; der frühere V6.46.0-WIP-Evidenz-Deadlock ist behoben, betroffene WIP-Läufe werden defensiv geheilt. Andere Projekte erhalten noch keinen Hybrid-Pfad.

| Bereich | Regel |
|---|---|
| health-repo-status.js | nur kanonischer Health-Pfad, realpath, feste Lese-Args |
| executionPackage | ID + Fingerprint; READY_TO_COPY nur bei sauberer Basis |
| Ergebnisrückführung | Vorschau → Jamal-Bestätigung → Evidenz, kein Auto-ACCEPTED |
| releaseGates | nur Entscheidungstexte, keine Ausführung |
| Verboten | Agentenstart, npm test aus Zentrale, Reset/Clean, stille Allowlist-Erweiterung |

Rückfall: uncommittete Änderungen kontrolliert einzeln zurücknehmen; Browserdaten nicht löschen und kein `git reset` verwenden. Browser-End-to-End-Abnahme bestanden.

## V6.45.2 – Runtime-Pilot und Zusammenführung entkoppeln (vorheriger gesicherter Stand `fb9aa0d`)

V6.45.2 ändert weder Speicherformat-Schlüssel noch API. Additive Trennung von `runtimePilotEvidence` und finaler Orchestrierung. Vorhandene Tagesläufe bleiben lesbar.

## V6.45.0 – V1-Finish-Sprint für den geführten Tageslauf (Historie)

V6.45.0 ändert weder Speicherformat noch API. Vorhandene Tagesläufe bleiben lesbar. Neue Arbeitsvorschläge führen `orchestrator-agent` sichtbar und fachlich als Projektmanager-Agent; `approvalAgentId` ist die einzige verbindliche Abnahmequelle und muss `quality-test-agent` sein. Anzeigename und Rolle werden aus der ID und dem kanonischen Register abgeleitet; widersprüchliche `approvalAgent`-Textfelder werden abgewiesen. Die Auswahl trennt `coreAgentIds` (höchstens fünf, eindeutige IDs) und `additionalAgentIds` (keine Überschneidung, exakte Mengenabdeckung von `selectedAgentIds`). UI- und Kommunikations-Agent werden XOR gewählt. Explizite Risiko-Signale wählen den Risiko-Agenten; Datenschutz allein nicht. Zusätzliche Rollen entstehen ausschließlich aus konkreten Ziel-, Risiko-, Daten-, Dokumentations-, Technik-, Kosten- oder Werkzeugsignalen.

`toolReview` ergänzt kompatibel `status` und `statusLabel`. Ohne Werkzeugbedarf gilt `NICHT_BENOETIGT` / „nicht benötigt“ ohne Agentenzuweisung; bei Bedarf bleibt `integration-agent` als Plugin-/Tool-Radar-Agent zuständig. Die Oberfläche zeigt nach Vorschlagserstellung oben die Hauptaktion „Prüfphase vorbereiten“ mit kompakter Führung. Es gibt keine automatische Migration bestehender localStorage-Daten und keine Plugin-, Agenten-, Codex-, Repository- oder externe Ausführung. Autonomie- und Sicherheitsgrenzen bleiben unverändert.

Rückfall: uncommittete Änderungen kontrolliert einzeln zurücknehmen; Browserdaten nicht löschen und kein `git reset` verwenden.

## V6.44.1 – Health-Verifizierungsstand synchronisieren

V6.44.1 führt kein neues Speicherformat, keine neue Route und keine neue Runtime ein. Ausgangscommit der Zentrale: `b2f618e`. Health-Momentaufnahme: vorher `bc98b5c`, jetzt `28cdcf7` (PR #1 / `8eadc46`).

| Bereich | Regel |
|---|---|
| project-registry.js | Health- und Expansion-Git-/Test-Momentaufnahme aktualisieren |
| Expansion | gemeinsame Referenzen sync; Portfolio-Modus PLANUNG unverändert |
| Verboten | Health-Repo ändern, Freigaben ableiten, neue API, Autonomie |

Rückfall: kontrolliert auf den gesicherten V6.44.0-Stand `b2f618e` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt: Health Preview-Blocker einzeln prüfen; kein V1-Funktionsschritt.

## V6.44.0 – Lokale V1 einfrieren und Betriebsmodus festlegen (Historie, gesichert `b2f618e`)

V6.44.0 führt kein neues Speicherformat, keinen neuen localStorage-Schlüssel, keine neue Route und keine neue Runtime ein. Ausgangscommit: `16bbf45` (V6.43.1 gesichert).

| Bereich | Regel |
|---|---|
| Dokumentation | `README.md`, `V1_BETRIEBSHANDBUCH.md`, Status auf V1-Betriebsfreeze |
| UI | kompakter V1-Betriebshinweis, Versionsanzeige V6.44.0 |
| Verboten | zweiter Executor, externe KI, Plugins, Schreib-API, Cloud, Autonomieerhöhung |

Rückfall: kontrolliert auf den gesicherten V6.43.1-Stand `16bbf45` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt nach V6.44.0: V6.44.1 Health-Verifizierungsstand synchronisieren (umgesetzt).

## V6.43.1 – Runtime-Pilot abnahmefest abschließen (Historie, gesichert `16bbf45`)

V6.43.1 führt kein neues Speicherformat, keinen neuen localStorage-Schlüssel und keinen zweiten Executor ein. V6.43.0 ist mit Commit `daa96e9` auf `origin/main` gesichert.

| Bereich | Regel |
|---|---|
| Dokumentation | Ist-Stand `daa96e9`, 241 Prüfpunkte, V1-Abschlussbewertung: lokal fertig und betriebsbereit |
| UI | Sichtbar „Projektmanager-Agent“; technische ID `orchestrator-agent` ergänzend |
| Verboten | neue Agenten-ID, zweiter Executor, Autonomieerhöhung, externe Ausführung |

Rückfall: kontrolliert auf den gesicherten V6.43.0-Stand `daa96e9` zurückgehen; lokale Browserdaten bleiben unangetastet.

Nächster Schritt nach V6.43.1: V6.44.0 V1-Betriebsfreeze (umgesetzt).

## V6.43.0 – Agenten-Laufzeit-Pilot (Historie, gesichert `daa96e9`)

V6.43.0 führt kein neues Speicherformat und keinen neuen localStorage-Schlüssel ein. Runtime-Zustand wird additiv als `agentRuntimePilot` im bestehenden Tageslauf gespeichert. Alte Läufe ohne dieses Feld bleiben unverändert nutzbar; Backup und Restore übernehmen den Runtime-Zustand automatisch mit.

| Bereich | Regel |
|---|---|
| Runtime-Modul | Snapshot, Freigabe, Statusmaschine, Executor, Audit, Timeout, Abbruch |
| daily-work-run.js | Domäne, Prüfphase, bestehende Ergebnisrückführung inkl. Runtime-Akzeptanzpfad |
| daily-work-run-ui.js | Darstellung und Bedienung ohne kopierte Runtime-Geschäftslogik |
| Verboten | externe KI, Plugins, Netzwerk, Dateischreiben, automatische Ergebnisübernahme |

Rückfall: V6.43.0-Stand auf `daa96e9`; Tagesläufe ohne `agentRuntimePilot` bleiben lesbar.

Nächster Schritt nach V6.43.0: V6.43.1 Abnahmefestigung (umgesetzt).

## V6.42.1 – Server-Router modularisieren (Historie)

V6.42.1 führt keine neue Route, kein neues API-Verhalten und keine Schreibmöglichkeit ein. Die Extraktion verschiebt ausschließlich allgemeine HTTP-Verantwortung aus `server.js` nach `server-http-router.js`: Methodenprüfung, Pfadauswertung, statische Asset-Auslieferung, 404/405 und kontrollierte interne Fehlerantworten. Handler, Antwortdaten, Projektregister, Agentenregister und Plugin-Vorbereitungen bleiben in `server.js`.

| Bereich | Regel |
|---|---|
| Router-Modul | HTTP-Dispatch, MIME-Typen, statische Assets, 404/405, sichere Fehlergrenze |
| server.js | Serverstart, Handler, Route-Tabelle, Prefix-Handler für unbekannte Projekt-IDs |
| Verboten | zweite aktive Routerimplementierung, unkontrolliertes Dateisystem-Mapping, Geschäftslogik im Router |

Rückfall: uncommittete V6.42.1-Dateiänderungen kontrolliert verwerfen; API- und Browserverhalten bleibt auf V6.42.0 zurückführbar.

Nächster geplanter Schritt nach Jamals Abnahme: Agenten-Runtime-Pilot, ohne neue Vorbereitungskarte und ohne Autonomieerhöhung.

## V6.42.0 – Tageslauf-UI modularisieren

V6.42.0 führt kein neues Speicherformat ein und ändert weder `schemaVersion: 1` noch die beiden localStorage-Schlüssel. Die Extraktion verschiebt ausschließlich Präsentations- und Bedienlogik aus `app.js` nach `daily-work-run-ui.js`. Domänenlogik bleibt in `daily-work-run.js`, Datensicherungslogik in `local-data-backup.js`. Es gibt keine pauschale Migration, keine Normalisierung historischer V6.40.1-, V6.40.2-, V6.40.3- oder V6.41.0-Daten und keine Überschreibung kanonischer Register.

| Bereich | Regel |
|---|---|
| UI-Modul | Rendering, Events, Backup-Anbindung im Tageslaufbereich |
| app.js | nur `DailyWorkRunUi.init(...)`, `render()`-Aufrufe und View-Koordination |
| Verboten | parallele States, zweite Tageslauf-Implementierung, Geschäftslogik-Kopie |

Rückfall: uncommittete V6.42.0-Dateiänderungen kontrolliert verwerfen; Browserdaten bleiben unangetastet.

Nächster geplanter Schritt nach Jamals Abnahme: weitere kontrollierte Modularisierung aus `app.js`, ohne neue Vorbereitungskarte und ohne Autonomieerhöhung.

## V6.41.0 – lokale Datensicherung

V6.41.0 führt kein neues Speicherformat für Tagesläufe ein und ändert `schemaVersion: 1` nicht. Die Sicherung liest und schreibt ausschließlich die bestehenden Browser-Schlüssel `ki-unternehmenszentrale-v1` und `ki-unternehmenszentrale-daily-work-runs-v1`. Es gibt keine pauschale Migration, keine Normalisierung historischer V6.40.1-, V6.40.2- oder V6.40.3-Daten und keine Überschreibung kanonischer Projekt- oder Agentenregister.

| Bereich | Regel |
|---|---|
| Export | beide erlaubten Schlüssel, auch wenn leer |
| Import | vollständige Vorprüfung, Jamal-Freigabe, Rollback bei Schreibfehler |
| Verboten | `localStorage.clear()`, fremde Schlüssel, kanonische Registerdaten |

Rückfall: uncommittete V6.41.0-Dateiänderungen kontrolliert verwerfen; vorhandene Browserdaten bleiben unangetastet, solange kein bestätigter Import ausgeführt wurde.

## V6.40.3 – kontrollierte Agenten-Prüfphase

V6.40.3 behält `schemaVersion: 1` und `ki-unternehmenszentrale-daily-work-runs-v1`. Neue Läufe erhalten optional `agentReviewPhase` mit sicheren Unterstatus, internen Arbeitskarten, manuellen Befunden, QA, Orchestrator-Zusammenführung, Jamal-Entscheidung und einmaliger Verlaufsmarkierung. Es gibt keine pauschale Migration: Fehlt das Feld bei einem alten V6.40.1- oder V6.40.2-Lauf, wird nur zur Laufzeit ein leerer Status `NOT_APPROVED` dargestellt; der gespeicherte Altbestand wird nicht überschrieben.

Arbeitskarten kopieren ausschließlich die freigegebenen Strukturdaten des gespeicherten Agentenplans. Kanonische Projekt- und Agentenregister bleiben unverändert. Es gibt keine Datenlöschung, keine zweite Quelle, keine Schreib-API und keine automatische Ausführung. Rückfall: die uncommitteten V6.40.3-Dateiänderungen manuell prüfen oder kontrolliert verwerfen; localStorage bleibt unangetastet und `git reset` ist ausgeschlossen.

## V6.40.2 – kanonischer Agenten-Einsatzplan

Die bestehende interne 25-Agenten-Liste wird ohne Namens- oder ID-Erfindung aus `server.js` nach `agent-registry.js` als gemeinsame kanonische Quelle für Server und Browser überführt. Das ist eine Quellenkonsolidierung, keine zweite Agentenquelle. `project-registry.js` bleibt unverändert die einzige technische Projektquelle.

Bestehende Tagesläufe bleiben unter `ki-unternehmenszentrale-daily-work-runs-v1` lesbar. Neue V6.40.2-Läufe speichern zusätzlich strukturierte Agentenplanfelder wie `selectedAgentIds`, `leadAgentId`, Auswahlgrund, Teilauftrag, Ergebnis, Prüfkriterium, Grenze, Abhängigkeit, Übergabe, Arbeitsmodus und Werkzeugprüfbedarf. Es gibt keine pauschale Migration, Löschung oder automatische Ausführung. Alte `agentPlan`-Einträge ohne diese Felder werden unverändert erhalten und weiterhin defensiv dargestellt.

Rückfall: uncommittete V6.40.2-Dateiänderungen kontrolliert verwerfen oder manuell überarbeiten; keine localStorage-Löschung und kein `git reset`.

## V6.40.1 – vereinfachter Tagesstart

V6.40.1 verändert weder Projektregister noch API und löscht keine gespeicherten Tagesläufe. Bestehende V6.40.0-Läufe bleiben lesbar; neue Läufe ergänzen `workProposal` im selben getrennten Speicherschlüssel. Der normale Start verlangt nur Fokusprojekt und Ergebniswunsch, eine zusätzliche Verbotsgrenze bleibt optional. Technische Angaben werden im Lauf vorbelegt und standardmäßig geschlossen angezeigt. Es gibt keine automatische Migration, Löschung, Agenten- oder Codex-Ausführung.

Agenten- und Einsatzplanung setzt `repositoryWorkRequired: false`; sie bleibt ein vorbereitender Einsatzplan ohne Repository-Auftrag. Rückfall: den uncommitteten UI-/Modell-Patch verwerfen oder manuell überarbeiten, ohne Browserdaten zu löschen und ohne `git reset`.

## V6.40.0 – geführter Tagesarbeitslauf

V6.40.0 ergänzt keine Projektmigration und verändert das kanonische Register nicht. Der Versionsschritt führt lokale Arbeitsdaten in einem getrennten, versionierten Tageslaufmodell zusammen.

| Bereich | Quelle | Zielzustand | Migrationsregel |
|---|---|---|---|
| Kanonische Projekte | `GET /api/projects` aus `project-registry.js` | unveränderliche aktuelle Projekt-, Git- und Testwerte | niemals durch localStorage überschreiben |
| Bestehende Managementdaten | `ki-unternehmenszentrale-v1` | Projekte, Notizen, Entscheidungen und Verläufe bleiben erhalten | nicht löschen, nicht leeren, nicht pauschal migrieren |
| Neue Tagesläufe | `ki-unternehmenszentrale-daily-work-runs-v1` | genau ein Fokus, ein Ergebnis und ein nächster Schritt je Lauf | getrennt speichern; Statusübergänge nur manuell |
| Tagesstart-Momentaufnahme | Tageslauf `canonicalSnapshot` | historischer Nachweis des angezeigten Stands | nie als aktueller technischer Stand verwenden |
| Ergebnisrückführung | Tageslauf `resultReturn` | manuell dokumentiertes Ergebnis | keine automatische Projektänderung |
| Abschlussverlauf | bestehende lokale Projektakte | genau ein bestätigter Verlaufseintrag | erst nach Jamal-Bestätigung; Duplikat verhindern |

Health Upgrade Kompass ist der empfohlene erste technische Pilot, wird aber nicht automatisch ausgewählt. `REAL_VERIFIZIERT` bleibt eine technische Momentaufnahme und keine medizinische, fachliche oder rechtliche Freigabe.

Rückfall: Neue Ansicht und Modulauslieferung können später kontrolliert entfernt werden. Beide localStorage-Schlüssel bleiben unangetastet; kein automatisches Löschen und kein `git reset`.

## V6.39.0 – kanonische Migration

Das codebasierte Register `project-registry.js` führt jetzt alle **17 dokumentierten Projekte** mit stabilen IDs. Die Migration ist read-only gegenüber Servern und externen Systemen. Manuelle Browserdaten werden nicht gelöscht oder in technische Fakten umgedeutet.

| Nr. | Stabile ID | Modus | Verifizierter technischer Bezug | Nächster sicherer Schritt |
|---:|---|---|---|---|
| 1 | `ki-unternehmenszentrale` | `DEMO` | Pfad, Repository, `main`, HEAD und `origin/main` bestätigt | V6.39.0 manuell abnehmen |
| 2 | `health-upgrade-kompass` | `REAL_VERIFIZIERT` | vollständige technische Pilot-Momentaufnahme | Pilotakte manuell prüfen |
| 3 | `health-upgrade-karriere` | `PLANUNG` | ungeklärt | Quelle read-only erfassen |
| 4 | `expansion-app` | `PLANUNG` | technische Basis teilweise gemeinsam mit Health | eigenen Scope festlegen |
| 5 | `flowlingo-portugiesisch-sprachtrainer` | `PLANUNG` | ungeklärt | Identität und Quelle klären |
| 6 | `portugiesisch-sprechtrainer` | `UNGEKLÄRT` | ungeklärt | nicht automatisch zusammenführen |
| 7 | `spanisch-sprechtrainer` | `PLANUNG` | ungeklärt | Quelle und MVP-Stand prüfen |
| 8 | `marketing-agentur-os` | `PLANUNG` | ungeklärt | Ordner und Repository prüfen |
| 9 | `senior-designer-os` | `UNGEKLÄRT` | ungeklärt | Projektidentität bestätigen |
| 10 | `autopilot-light-system` | `PLANUNG` | ungeklärt | Projekt/Modul/Methode abgrenzen |
| 11 | `prowin-karriere` | `PLANUNG` | ungeklärt | Quellenbestand erfassen |
| 12 | `your-day-portugal-2-0` | `PLANUNG` | ungeklärt | Varianten abgrenzen |
| 13 | `your-day-mlm-praesentation` | `PLANUNG` | ungeklärt | Freigabeverantwortung klären |
| 14 | `jaco-eventplanung` | `PLANUNG` | Read-only-Pilot dokumentiert | Übergabe ohne Rohdaten erstellen |
| 15 | `jaco-gbr-webseite` | `UNGEKLÄRT` | ungeklärt | Existenz und Quelle bestätigen |
| 16 | `portugiesische-lda-gruendung` | `UNGEKLÄRT` | ungeklärt | Quellen und Fachprüfung benennen |
| 17 | `seminare-und-praesentationen` | `PLANUNG` | Materialien dokumentiert | Einzelprojekte inventarisieren |

Health und Expansion bleiben fachlich getrennt, obwohl ihre technische Basis derzeit teilweise gemeinsam ist. Work bleibt technisch `UNGEKLÄRT`; Codex bleibt manuell kontrolliert. Es gibt keine automatische externe Aktion, Git-Aktion, Agentenausführung oder Deploymentfreigabe.

## Historischer Migrationsplan vor V6.39.0

Die nachfolgende 14-Zeilen-Tabelle bleibt als Historie erhalten und ist nicht mehr die Zähl- oder Statusquelle.

## Ziel

Alle bisherigen Projekte werden schrittweise in der KI-Unternehmenszentrale sichtbar, dokumentiert und technisch verknüpft. Jede Migration bleibt zunächst read-only. Ein Eintrag in dieser Tabelle ist keine Freigabe für externe Aktionen oder produktive Integration.

Legende: `JA`, `NEIN`, `TEILWEISE`, `UNGEKLÄRT`.

| Reihenfolge | Projekt | Browserprojekt | lokaler Ordner | Git geprüft | Übergabe | Grundlagen | Registry | Work | Codex | Status | Nächster Schritt |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | KI-Unternehmenszentrale | JA | JA | JA | TEILWEISE | JA | JA | NEIN | JA | V6.38.4 gesichert; technische Bestandsaufnahme abgeschlossen; zentrale Dokumentation erstellt; Qualitätskorrektur in Bearbeitung; noch nicht in Work übernommen | Jamals Dokumentationsprüfung |
| 2 | Health Upgrade Kompass | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; erstes Pilotprojekt | Ordner und Repository read-only prüfen |
| 3 | Expansion App | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Projektübergabe erfassen |
| 4 | FlowLingo | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Namensvarianten offen | Identität und Ordner klären |
| 5 | Marketing Agentur OS | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Ordner/Repository prüfen |
| 6 | Senior Designer OS | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; Projektidentität ungeklärt | Jamal bestätigt Projekt und Quelle |
| 7 | Health Upgrade Karriere | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | Übergabe erstellen |
| 8 | proWIN Karriere | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | Quellenbestand erfassen |
| 9 | JACO GbR Webseite | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; nicht mit Eventplanung gleichgesetzt | Projektidentität prüfen |
| 10 | Spanisch-Sprechtrainer | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | NEIN | NEIN | noch nicht vollständig migriert | MVP- und Repository-Stand prüfen |
| 11 | Autopilot-Light-System | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Projekt/Modul/Methode ungeklärt | verbindliche Einordnung festlegen |
| 12 | Your Day / Portugal 2.0 | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert | Varianten und Verantwortungen klären |
| 13 | portugiesische Lda-Gründung | UNGEKLÄRT | UNGEKLÄRT | NEIN | NEIN | NEIN | JA | NEIN | NEIN | noch nicht vollständig migriert; kein belastbarer Bestand | Quellen durch Jamal benennen |
| 14 | Seminare und Präsentationen | TEILWEISE | UNGEKLÄRT | NEIN | NEIN | TEILWEISE | JA | TEILWEISE | NEIN | noch nicht vollständig migriert; Materialien vorhanden, kein Gesamtprojekt | Einzelprojekte inventarisieren |

## Migrationsregeln

1. Zuerst Browser-/Quellprojekt und Eigentümerschaft bestätigen.
2. Lokalen Ordner ausschließlich read-only finden und Git-Stand prüfen.
3. Übergabe mit Zweck, Status, Risiken und Nicht-Zielen erstellen.
4. Projektgrundlagen und Namensvarianten dokumentieren.
5. Registereintrag durch Jamal bestätigen.
6. Erst danach in Work aufnehmen und gezielt in Codex öffnen.
7. Technische Verknüpfung benötigt einen separaten Auftrag und Freigabe.

## Bekannte Widersprüche

Browserprojekt, Work und Codex sind nicht als einheitliche technische Statusquellen im Repository nachgewiesen. JACO Eventplanung und JACO GbR Webseite bleiben getrennt. FlowLingo-Varianten bleiben sichtbar.

## Noch zu normalisieren

Statusdefinitionen, Übergabeformat, Pfadnachweise und Repository-Zuordnung.

## Entscheidung durch Jamal erforderlich

Jede Projektidentität, Reihenfolgeänderung und technische Verknüpfung.
