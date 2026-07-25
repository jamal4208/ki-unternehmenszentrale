# MIGRATION PLAN

## V7.1 Phase B.1 – HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: **V7.1 Phase B / lokal umgesetzt, ungesichert**. Phase B.1 ist additiv; kein bestehender V7.0-, V7.1-Phase-A- oder V7.1-Phase-B-Codepfad wurde umgeschrieben oder ersetzt. Neue mandantenfähige Kern-Felder (`customerId`/`brandId`/`campaignId`) wurden bewusst als verpflichtend eingeführt (Schema-Weiterentwicklung innerhalb derselben Phase, keine zweite, widersprüchliche Wahrheit) und bestehende Tests/Fixtures entsprechend additiv erweitert.

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

## V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Vorheriger gesicherter Ausgang: **V7.1 Phase A / lokal umgesetzt, ungesichert**. Phase B ist additiv; kein bestehender V7.0- oder V7.1-Phase-A-Codepfad wurde umgeschrieben oder ersetzt. Architektur-Entscheidung: `CONTROLLED_CONNECTOR_HANDOFF` – kein direkter HTTP-Client mit API-Key im Node-Server.

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

## V7.1 Phase A – Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

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
