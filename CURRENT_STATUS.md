# CURRENT STATUS

## V7.1 Phase B.1 – HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

**Ausdrücklich noch kein Commit, kein Push, kein Deployment, kein weiterer echter HeyGen-Render, keine Veröffentlichung, keine produktive Kundenanlage, keine Canva-/Shopify-Änderung.** Der erste, bereits extern ausgeführte reale HeyGen-Pilot (fiktives Café, öffentlicher Avatar, 9:16, HeyGen-Video-Agent-Session `af66e85f550542b0a5bfcef0fc2939e8`) wurde strukturiert als **kanonisches Pilot-Review** dokumentiert und die Unternehmenszentrale erhielt additiv die sichere Grundlage für einen späteren mandantenfähigen Marketing-Agenturbetrieb. Die Unternehmenszentrale hat diesen externen Connector-Lauf **nicht selbst gestartet**; sie dokumentiert ihn nachträglich, ehrlich und ohne erfundene Werte (Kosten/Credits/Renderdauer/dauerhafte URL bleiben `UNKNOWN`). Kunden erhalten weiterhin **keinen** Zugang zum persönlichen oder zentralen HeyGen-Konto.

- **Neue Module:** `agency-tenant-registry.js` (kanonische Mandantenbasis: zwei neutrale Testkunden, Marken, Kampagnen; strikte Mandantenbindung/-trennung, keine echten Kundendaten), `heygen-pilot-review.js` (dokumentiert den einen realen Pilot strikt getrennt nach Providerstatus vs. lokaler Verifikation; `jamalDecision` niemals automatisch `APPROVED_FOR_CUSTOMER_USE`), `heygen-result-lifecycle.js` (Ergebnisrückführungs-Statuskette `PROVIDER_PROCESSING → … → PUBLICATION_NOT_APPROVED`; `PUBLISHED` bleibt strukturell unerreichbar), `agency-backup.js` (Backup/Restore-Vorschau ausschließlich für Mandanten-/Pilot-Metadaten)
- **`heygen-job-package.js` additiv erweitert:** `customerId`/`brandId`/`campaignId` sind jetzt verpflichtend und gegen die Mandantenbasis geprüft; neue Felder `providerFolderReference` (immer `PLANNED_NOT_CREATED`), `billableUnit`, `customerPackageId`, `costPackageStatus` (`INCLUDED_IN_PACKAGE`/`ADDITIONAL_APPROVAL_REQUIRED`/`UNKNOWN`/`NOT_BILLABLE_TEST`) und eine **fünfte, getrennte Freigabestufe** `customerDraftApprovalStatus` (Kundenentwurf, ausdrücklich nicht gleich Veröffentlichung)
- **`heygen-store.js` additiv erweitert:** ein bereits gespeichertes Jobpaket kann nicht mehr nachträglich einem anderen Kunden/einer anderen Marke zugeordnet werden (Persistenzgrenze); Ergebnisrückgaben übernehmen `customerId`/`brandId`/`campaignId`/`projectId` ausschließlich vom zugehörigen Jobpaket (nie vom Aufrufer); `listPackages`/`listResults` filtern optional nach `customerId`; neue Ablage für Lifecycle-Datensätze
- **Mandantentrennung technisch durchgesetzt:** Kunde A kann keine Referenz/kein Jobpaket von Kunde B lesen (API liefert bei `customerId`-Mismatch bewusst `404`, nicht `403`, um keine Existenz preiszugeben); Backup/Restore wahren die Zuordnung; unbekannte oder nicht zusammengehörige IDs blockieren strukturell
- **API:** additiv 5 neue GET-Routen (`/api/v71/agency/customers`, `/brands`, `/campaigns`, `/pilot-review`, `/backup/export`) und 5 neue POST-Routen (`heygen/job-package/approve-customer-draft`, `/request-customer-draft-changes`, `/set-cost-package-status`, `heygen/result-lifecycle/advance`, `agency/backup/restore-preview`); insgesamt jetzt **60 GET und 22 POST**; weiterhin keine Route für HeyGen-Kundenzugang, Credentialausgabe, automatischen Render, automatische Veröffentlichung oder Abrechnung
- **UI:** additiver Bereich „HeyGen-Agenturbetrieb · Testmandant“ im bestehenden HeyGen-Pilotbereich – zeigt Kunde/Marke/Kampagne/Projekt, Providerstatus, internen Status, Kostenstatus, Kundenfreigabe, Veröffentlichungsstatus und den nächsten Jamal-Schritt je Jobpaket-Karte; klar gekennzeichnet „Testmandant“, „kein echtes Kundenportal“, „Kunde hat keinen HeyGen-Zugang“, „Providerkonto bleibt intern“, „Video noch nicht veröffentlicht“, „erster Pilot ist nicht abrechenbar“; weiterhin kein Veröffentlichungsbutton, keine öffentliche Anmeldung, keine Kunden-E-Mail-Einladung
- **Tests:** 5 neue Testdateien (`agency-tenant-registry.test.js` 17, `heygen-pilot-review.test.js` 17, `heygen-result-lifecycle.test.js` 16, `heygen-store.test.js` 10, `agency-backup.test.js` 8) plus erweiterte Prüfpunkte in `heygen-job-package.test.js`, `heygen-connector.test.js`, `heygen-backup.test.js`, `server-v71-heygen-routes.test.js`, `heygen-ui.test.js`, `heygen-phase-b-integration.test.js`, `server-http-router.test.js`, `daily-work-run.test.js`, `agent-runtime.test.js`; gesamt **929 automatisierte Prüfpunkte grün** (`npm test`, Exit-Code 0, 35 Testdateien; `npm run check`, Exit-Code 0)
- **Nicht enthalten – weiterhin offen und erfordert separate Jamal-Freigabe:** weiterer echter HeyGen-Render, jede externe Übertragung, jede Kostenübernahme, jede Veröffentlichung, echte Kundenanmeldung/echtes Kundenportal, produktive Kundenanlage, Canva-Connector, vollständiges Marketing-Agentur-Gesamtsystem, Phase C

## V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

**Ausdrücklich noch kein Commit, kein Push, kein Deployment, kein echter HeyGen-Render, keine externe Übertragung, keine Kosten, keine Veröffentlichung.** V7.0 bleibt `FROZEN`. V7.1 Phase A bleibt unverändert grün. Architektur-Entscheidung: HeyGen ist ein `CONTROLLED_CONNECTOR_HANDOFF` – die Zentrale erstellt und validiert lokal ein Auftragspaket; die tatsächliche HeyGen-Aktion würde, falls überhaupt, über einen externen, authentifizierten HeyGen-Connector außerhalb dieses Servers laufen. Kein API-Key wird gespeichert. HeyGen bleibt in der kanonischen Basiswahrheit (`tool-registry.js`, `plugin-gateway.js`) weiterhin `NOT_CONNECTED` / `RECOMMENDATION_ONLY`; ein additiver, separater Pilotstatus (`heygen-connector.js#buildHeygenPilotStatus`) zeigt zusätzlich `PARTIALLY_CONNECTED` / `CONTROLLED_HANDOFF`, niemals `DIRECT` oder autonom.

- **Neue Module:** `heygen-job-package.js` (Auftragsmodell, Capability-Profil, Datenschutz-/Rechteprüfung, Freigabestufen), `heygen-connector.js` (kontrollierter Adapter, minimales Hand-off-Payload, Tokenbindung über die bestehende `execution-bridge.js`-Tokenarchitektur, Pilotstatus), `heygen-job-result.js` (strukturierte Ergebnisrückführung, URL-Validierung), `heygen-store.js` (lokale Metadaten-Persistenz unter App Support), `heygen-backup.js` (Metadaten-Export/Restore-Vorschau ohne Originaldateien/Credentials)
- **Vier getrennte Freigabestufen** (Inhalt, externe Übertragung, Kostenrahmen, Veröffentlichung); für den ersten Piloten werden nur die ersten drei benötigt; Veröffentlichung bleibt strukturell unerreichbar (`publicationApproved` kann in Phase B durch keine Funktion auf `true` gesetzt werden)
- **API:** additiv 3 neue GET-Routen (`/api/v71/heygen/status`, `/api/v71/heygen/job-packages` inkl. Einzelabruf, `/api/v71/heygen/backup/export`) und 10 neue POST-Routen (Paket vorbereiten/validieren, drei getrennte Freigaben, Hand-off-Token anfordern/einlösen, Ergebnis-Token anfordern/einlösen, Restore-Vorschau); insgesamt 55 GET und 17 POST; keine Route für API-Key-Speicherung, Login, Löschen, Kauf, Upgrade oder automatische Veröffentlichung
- **UI:** neuer additiver Chef-Modus-Bereich „HeyGen-Pilot“ mit klaren Status-Badges (kontrollierte Übergabe, externe Verarbeitung, kostenpflichtig möglich, noch nicht veröffentlicht, kein automatischer Start, erster Pilot), getrennten Freigabe-Buttons (keine Sammelfreigabe) und einklappbaren technischen Details; kein Button „Veröffentlichen“, „Video löschen“, „Avatar/Voice klonen“ oder „Credits kaufen“
- **Tests:** 144 neue automatisierte Prüfpunkte in 7 neuen Testdateien (`heygen-job-package.test.js` 29, `heygen-connector.test.js` 18, `heygen-job-result.test.js` 16, `heygen-backup.test.js` 15, `server-v71-heygen-routes.test.js` 28, `heygen-ui.test.js` 17, `heygen-phase-b-integration.test.js` 21); gesamt **816 automatisierte Prüfpunkte grün** (`npm test`, Exit-Code 0, 30 Testdateien; `npm run check`, Exit-Code 0)
- **Korrigierte Fehleinschätzung aus der Vorprüfung:** Ein erster `npm test`-Lauf brach scheinbar an einer Baseline-Prüfung der Execution Bridge gegen das (vorschriftsgemäß dirty) Fixture-Repository ab. Die genauere Ursachenprüfung ergab: Das war kein echter Zustandskonflikt im Repository, sondern eine Einschränkung der in diesem Arbeitslauf verwendeten Ausführungsumgebung (eingeschränkter Dateisystemzugriff auf das außerhalb des Projektordners liegende Fixture-Repository). Mit regulären, unbeschränkten Rechten läuft exakt derselbe Test grün durch. Das Fixture-Repository selbst blieb während der gesamten Prüfung im vorgeschriebenen, bekannten Dirty-Zustand (`M FIXTURE_CALC.js`) unverändert
- **Trockenlauf bestanden:** lokaler, nicht-externer Café-Test (Platzhalterinhalt) durchlaufen – Paket `DRAFT` → Inhaltsprüfung `READY_FOR_REVIEW` → drei getrennte Freigaben → `APPROVED_FOR_HANDOFF` → Hand-off-Payload erzeugt → Status `HANDED_OFF`; keine HeyGen-Netzwerkverbindung, keine Kosten, keine Veröffentlichung, keine automatische Ausführung; Token-Zweitnutzung wurde erwartungsgemäß abgelehnt
- **Browser-/Mobile-Abnahme bestanden:** eigener isolierter Testserver (Port 4599), vollständiger Durchlauf im echten Browser (Paket vorbereiten → Inhalt prüfen → drei getrennte Freigaben → Hand-off freigeben → Status „übergeben (Ausführung noch nicht bestätigt)“) ohne Konsolenfehler und ohne jede externe Netzwerkanfrage (`performance.getEntriesByType('resource')` zeigte ausschließlich `127.0.0.1:4599`); Mobile 390×844 ohne horizontalen Überlauf, Status-Badges und Formular vollständig bedienbar, keine Textwand. Testserver anschließend beendet, Testauftragspaket aus dem App-Support-Speicher wieder entfernt
- **Nicht enthalten – weiterhin offen und erfordert separate Jamal-Freigabe:** echter HeyGen-Renderlauf, jede externe Übertragung, jede Kostenübernahme, jede Veröffentlichung, direkter HeyGen-API-Adapter im Node-Server, Canva-Connector, Marketing-Agentur-Gesamtsystem

## V7.1 Phase A – Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

**Ausdrücklich noch kein Commit, kein Push, kein Deployment.** V7.0 bleibt unverändert `FROZEN` auf `15ce8bb`. V7.1 Phase A wurde lokal umgesetzt, vollständig read-only auditiert und mit 661 automatisierten Prüfpunkten grün getestet (`npm test`, Exit-Code 0, 23 Testdateien; `npm run check`, Exit-Code 0). Browser-/Mobile-Abnahme wurde zusätzlich gegen einen eigenen, isolierten Testserver (Port 4581, eigenes `HOME`) durchgeführt: Dokumentregistrierung, Test-Upload, Traversal-/Unbekannte-Felder-Blockade, Tool-Registry, Plugin-Gateway (Canva/HeyGen/Shopify korrekt nur vorgemerkt), deterministisches Tool-Routing (Beispiel: „Code-Ausführung" → Codex/DIRECT, Fallback Cursor, Jamal-Freigabe erforderlich) und Backup-Export/Import-Preview funktionieren wie spezifiziert; mobile Ansicht (390×844) ohne horizontalen Überlauf (geprüft: `innerWidth === scrollWidth === 390`), Karten und Formulare vollständig bedienbar; keine sichtbaren Fehlertexte im DOM nach Hard-Reload und Durchlauf aller drei neuen Bereiche. Testserver wurde danach beendet, temporäre Testdaten entfernt.

**Nachbesserung nach erster manueller Safari-Abnahme (25.07.2026):** Zwei gemeldete Abschlussfehler wurden mit der kleinstmöglichen Phase-A-Korrektur behoben, ohne die Sicherheits-/Routing-Logik zu ändern:
1. *Checkbox-Layout:* Die allgemeine Formularregel `textarea, input, select { width: 100%; }` bzw. `input, select { min-height: 42px; padding: 8px 10px; }` (`styles.css`) griff ungewollt auch auf `type="checkbox"` und blähte die beiden Checkboxen im Tool-Routing-Formular („externe Übertragung erlaubt“, „Veröffentlichung erlaubt“) zu einer raumfüllenden, umrandeten Fläche auf – in Safari optisch wie „aktiv“ wirkend, Beschriftung gequetscht/abgeschnitten. Korrektur ausschließlich innerhalb von `.v71-checkbox`/`.v71-checkbox-label` (neue, eng begrenzte CSS-Regel, kein globaler Checkbox-Reset); Markup in `v71-ui.js` erhielt zusätzlich ein explizites `for`/`id`-Paar und einen eigenen `<span>` für die Beschriftung. Standardwert beider Checkboxen bleibt unverändert `false` (kein `checked`-Attribut).
2. *Nicht strukturierte Blockierungsantwort:* `plugin-gateway.js` (`recommendToolForTask`) zeigte bei „kein Werkzeug erfüllt alle Grenzen“ (Beispiel: Video-Auftrag, externe Übertragung/Veröffentlichung aus) nur eine Textzeile. Die Funktion liefert bei Blockierung jetzt zusätzlich `status: "BLOCKED"`, `blockedCandidate` (fachlich geeignetes, aber nicht ausführbares Werkzeug samt `connectionStatus`, `missingApprovals`, `costStatus`, `dataClassificationBoundary`, `fallback`), `blockedAlternatives` und `nextAllowedJamalStep`. Es wird weiterhin kein Werkzeug erfunden, empfohlen oder automatisch gestartet; Canva/HeyGen/Shopify bleiben `NOT_CONNECTED`. `v71-ui.js` rendert diese Felder strukturiert. Geänderte Dateien: `plugin-gateway.js`, `v71-ui.js`, `styles.css`; neue Tests: 10 zusätzliche Prüfpunkte in `plugin-gateway.test.js` (jetzt 35) sowie neue Datei `v71-ui.test.js` (12 Prüfpunkte). Automatisiert per `plugin-gateway.test.js` und `v71-ui.test.js` verifiziert (siehe oben, 661 Prüfpunkte gesamt). Die automatisierte Browser-/CDP-Prüfung dieser konkreten Korrektur konnte in diesem Lauf nicht abgeschlossen werden (Browser-MCP-Versuch reagierte nicht innerhalb angemessener Zeit; gemäß Vorgabe kein weiterer Versuch). Beide eigenen, isolierten Testserver dieses Laufs wurden anschließend kontrolliert beendet (Ports frei). Health und Fixture vor/nach dieser Korrektur unverändert. Bereit zur manuellen Wiederholungsabnahme (Jamal startet bei Bedarf einen neuen isolierten Testserver, siehe Abschlussbericht) und Commit-Prüfung durch Jamal, nicht bereits gesichert.

- **Neue Module:** `document-registry.js` (Dokumenten-/Wissenseingang), `tool-registry.js` (kanonisches Werkzeug-/Lizenzregister, 21 vorgemerkte Werkzeuge), `plugin-gateway.js` (Plugin-Gateway-Grundmodell + deterministisches Tool-Routing), `v71-registry-backup.js` (additives Backup/Export für die drei neuen Register), `v71-ui.js` (Chef-Modus-UI für alle drei Bereiche)
- **Dokumenten-/Wissenseingang:** ausschließlich sichere Metadaten/Referenzen; Originaldateien nur außerhalb beider Repositories unter `~/Library/Application Support/KI-Unternehmenszentrale/documents/{originals,metadata,previews,quarantine,test-inbox}`; echter Browser-Datei-Upload ist in Phase A bewusst **nicht** produktiv umgesetzt – stattdessen ein isolierter Test-Upload gegen zwei serverseitig erzeugte Fixture-Dateien (`sample-note.txt`, `sample-data.csv`); Klassifizierung NORMAL/SENSITIVE/SECRET; Traversal-, Symlink-, Größen-, Dubletten- und Secret-Dateischutz; kein produktiver Lösch-Endpunkt
- **Werkzeug-/Lizenzregister:** `tool-registry.js` ist die alleinige kanonische Quelle für Werkzeugidentität, Fähigkeiten, Lizenz- und Kostenmetadaten (21 Werkzeuge, alle 14 geforderten Kategorien abgedeckt); eine Lizenz wird niemals automatisch als `CONNECTED` gewertet; keine Zugangsdaten im Register
- **Plugin-Gateway:** `plugin-gateway.js` ist die alleinige kanonische Quelle für Live-/Adapterzustand und Tool-Routing; spiegelt bestehenden Codex-Executor, lokalen read-only Git-Stand („GitHub“) und lokale Airtable-Zugangsdaten-Anwesenheit; Canva, HeyGen und Shopify sind ausschließlich vorgemerkt (`REGISTERED`, `RECOMMENDATION_ONLY`), keine technische Verbindung, kein Produktivlauf; Health-Hardblock für Codex bleibt auch im neuen Gateway wirksam
- **Plugin-Wahrheitsquelle geklärt:** die bestehende, V7.0-eingefrorene `PRODUCTIVE_PLUGIN_REGISTRY` (`server.js`, V6.34.2) bleibt unverändert als reine UI-Textsammlung für den Cockpit-„Plugin-Leitstand"; sie wird von den neuen V7.1-Modulen nicht gelesen, verändert oder dupliziert. Ein Bestandsschutztest (`v71-integration.test.js`) prüft Widerspruchsfreiheit zwischen beiden Quellen
- **API:** additiv genau 5 neue GET-Routen und 3 neue POST-Routen (siehe `API_REGISTER.md`); insgesamt 52 GET- und 7 POST-Routen; alle bestehenden Sicherheitsgrenzen (Host/Origin, Content-Type, Bodylimit, bekannte Feldmengen, keine Stacktraces) wiederverwendet
- **UI:** drei neue additive Chef-Modus-Bereiche „Projektunterlagen & Wissenseingang“, „Werkzeuge & Lizenzen“, „Plugin-Gateway & Tool-Routing“; jeweils klar als „V7.1 Phase A · neu“ gekennzeichnet; Canva/HeyGen/Shopify erscheinen nirgends als produktiv verbunden
- **Bestandsschutz bestätigt:** 25 Agenten, 17 Projekte, Execution Bridge, Guided Work, Team-Editor, V7.0-Freeze (`15ce8bb`) und Health-/Fixture-Repositories unverändert; Health und Fixture ausschließlich read-only referenziert
- **Nicht enthalten – weiterhin offen für Phase V7.1 B:** produktiver Browser-Datei-Upload, echte Canva-/HeyGen-/Shopify-Anbindung, Wissensquellen-Sichtbarkeit direkt in Guided Work UI (Datenmodell und Lesefunktion bestehen bereits, `guided-work-ui.js` bleibt in Phase A bewusst unverändert), Marketing-Agentur, Shopify-Verkaufspfad

## V7.0 offiziell FROZEN – Jamal-Entscheidung vom 2026-07-25

**V7.0 ist mit Jamals ausdrücklicher Entscheidung vom 25.07.2026 offiziell auf `FROZEN` gesetzt.** Basis ist der gesicherte Phase-E-Stand **`52ce012`** (`52ce0125f0d641295bcc1b83ee9442e95abb199d`) auf `origin/main`; Phase A bis E sind damit vollständig abgeschlossen. Der read-only **V7.0-Freeze-Status** (`GET /api/v7-freeze-status`) zeigt diesen Stand jetzt korrekt als `FROZEN` an – ausschließlich weil im Quellcode (`v7-freeze-status.js#MANUAL_FREEZE_DECISION`) genau diese eine, von Hand eingetragene Jamal-Entscheidung hinterlegt ist, niemals automatisch aus Git-Stand oder Testzahl. Es gibt keinen neuen Schreib-Endpunkt, keinen Freeze-/Unfreeze-Button und keinen zweiten Weg, den Status zu ändern.

**Bedeutung:** V7.0 erhält keine neuen Funktionen mehr. Änderungen an V7.0 sind nur noch als belegte Fehlerkorrektur, Sicherheitskorrektur oder Wiederherstellungs-/Betriebsfix zulässig. Neue Funktionen beginnen erst ab **V7.1**: Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify und weitere Umsatzprojekte gehören ausdrücklich **nicht** mehr zu V7.0. Kein Deployment; Health bleibt weiterhin ausschließlich read-only; Codex bleibt weiterhin ausschließlich isoliert gegen das Fixture-Repository begrenzt; Apply bleibt weiterhin getrennt von Commit, Push und Deployment.

## Git- und Versionsstand

- Vorheriger gesicherter Ausgangsstand: **V6.46.0** / Commit **`e611c9c`** (Health Hybrid End-to-End-Pilot)
- **V7.0 Phase A – Guided Work Foundation:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`4a74ebe`** auf `origin/main`
- **V7.0 Phase B – Betriebsstabilität:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`3487a84`** auf `origin/main`
- **V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor:** umgesetzt, getestet, browserseitig abgenommen und gesichert mit Commit **`0858b4e`** auf `origin/main`
- **V7.0 Phase D – Codex als kontrollierten Executor anbinden:** umgesetzt, getestet, echter Codex-Fixture-Pilot bestanden und gesichert mit Commit **`6553452`** auf `origin/main`
- **V7.0 Phase E – Health-Ende-zu-Ende-Audit, Freeze-Status und Chef-Modus-Klarheit:** umgesetzt, getestet und gesichert mit Commit **`52ce012`** auf `origin/main`
- **V7.0 offiziell FROZEN:** Jamal-Entscheidung vom **2026-07-25** auf Basis von `52ce012`; Phase A bis E abgeschlossen; keine neuen Funktionen mehr in V7.0
- Branch: `main`
- Verbindliche Aussage: Phase A bis E sind gesichert und Jamal hat V7.0 auf dieser Basis offiziell eingefroren; der read-only **V7.0-Freeze-Status** (`GET /api/v7-freeze-status`) zeigt `FROZEN` ausschließlich wegen dieser hinterlegten Jamal-Entscheidung – niemals automatisch aus Git-Stand oder Testzahl allein. **Phase V7.1 ist nicht begonnen** und benötigt eine neue, separate Freigabe
- Einstiegspunkte: `README.md`, `V1_BETRIEBSHANDBUCH.md`

## V7.0 Phase A – Guided Work Foundation (umgesetzt und abgenommen)

- Neuer Tageslauf: `schemaVersion: 2`; v1-Läufe bleiben unverändert lesbar im selben Store
- Module: `guided-work.js` (Domäne), `guided-work-ui.js` (Hauptarbeitsraum); `daily-work-run.js` / `health-hybrid-work.js` bleiben kanonisch
- Geführter Hauptarbeitsraum: „Oben arbeiten. Unten nachschauen.“
- Deterministische, quellenbasierte Arbeitsvorschläge (kein Auto-Start)
- Editierbares Agententeam und `responsibleAgentId` vor Paketfreigabe; Invalidierung + Re-Fingerprint
- Known-dirty-Baseline für Health (read-only Live inkl. relative Pfade/Hashes, keine Dateiinhalte)
- Evidenz-Prefill für Fachbefund/QA/PM als Entwurf, nie als Bestätigung
- V6.46.0-Hybrid-Fallback vollständig erhalten; Roh-JSON standardmäßig geschlossen
- Backup-Schutz bleibt aktiv: Secret-Heuristik unverändert scharf; einzig der bestätigte False Positive bei bloßer `.env`/`.env.local`-Pfadnennung (z. B. in `forbiddenPaths`) wurde gezielt korrigiert, ohne die Erkennung realer Zugangsdaten zu schwächen
- Bekannter, bewusst offener Bedienpunkt: Für `acknowledgeV2Overwrite` (Schutz gegen stilles Überschreiben lokaler v2-Läufe durch einen reinen v1-Import) gibt es noch keine UI-Freigabesteuerung; der sichere Standard („nicht überschreiben“) bleibt dadurch aktiv, ein bewusster Override ist aktuell nur außerhalb der UI möglich
- 322 automatisierte Prüfpunkte grün; vollständige Browser-Abnahme inkl. Mobile 390×844 ohne horizontalen Überlauf bestanden
- **Nicht enthalten – weiterhin offen für spätere Phasen (siehe Phase C/D/E unten):** Codex-/Agentenstart, produktive Repository-Arbeit, Health-Schreiben, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat (umgesetzt, getestet und gesichert mit Commit `52ce012`; V7.0 seit 25.07.2026 offiziell FROZEN)

- Ziel war kein neuer Executor, sondern der Nachweis, dass der gesamte V7.0-Ablauf (Fokus → Vorschlag → Team → Baseline → Paket → isolierte Ausführung/Hybrid-Rückführung → Abschluss) stimmig, ehrlich und wiederholbar ist; nur echte Lücken wurden geschlossen
- Neues read-only Modul `v7-freeze-status.js` + Route `GET /api/v7-freeze-status`: Statusmodell `IN_REVIEW | FREEZE_CANDIDATE | FROZEN`, abgeleitet aus Phasenhistorie, aktuellem Git-Commit/Working-Tree und dem zuletzt gemessenen Testlauf; `FROZEN` wird durch dieses Modul **niemals** gesetzt – ausschließlich Jamals separate Entscheidung
- Neue, eingeklappte Freeze-Status-Karte im Guided-Work-Hauptarbeitsraum („unten nachschauen“); keine konkurrierende Primäraktion, kein Button, der den Status verändert
- Sticky-Kopfbereich um „Wer arbeitet daran“ und „Tatsächlich ausgeführt / Evidenz“ ergänzt (liest ausschließlich bereits vorhandene, sicher gefilterte Felder – kein neues Datenmodell)
- Tagesabschluss zeigt jetzt explizit „Ergebnis erreicht/nicht erreicht“, verantwortlichen Agenten und Ausführungs-/Evidenzstand
- Veraltete Oberflächenaussage korrigiert: Der Startkarten-Text behauptete fälschlich „Keine Execution Bridge“, obwohl Mock- und Codex-Fixture-Ausführung seit Phase C/D bereits existieren (Health bleibt davon unberührt: weiterhin read-only, Codex-/Apply-Start für Health bleiben hart blockiert)
- Audit bestätigt: Reload startet nie automatisch einen Attempt neu (Recovery-Fall statt Auto-Resume); `CANCELLED` ist terminal ohne Folgeübergänge; Backup/Restore bleibt vollständig auf `localStorage` beschränkt und startet nie einen Executor
- 47. GET-Route additiv (`/api/v7-freeze-status`); weiterhin keine neue Schreib-Route, keine neue Autonomieerhöhung
- **Nicht enthalten – weiterhin offen für Phase V7.1:** Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte

## V7.0 Phase D – Codex als kontrollierten Executor anbinden (umgesetzt, getestet, gesichert mit Commit `6553452`)

- Neues Modul `execution-codex-adapter.js`; Codex läuft ausschließlich isoliert, mit `--ask-for-approval never`, gegen das Execution-Bridge-Fixture-Repository – niemals gegen Health oder die Zentrale
- Codex-Start für das Health-Projekt ist serverseitig hart blockiert (Codex-Ausführung und Apply bleiben für Health verboten)
- Erweiterte Executor-Registry (`GET /api/execution/executors`) weist Mock und Codex mit Verfügbarkeit/Autorisierung aus; genau ein primärer Button je Zustand in der UI
- Echter Codex-Fixture-Pilot bestanden: Timeout auf `150000ms` korrigiert (`DEFAULT_CODEX_ATTEMPT_TIMEOUT_MS`), Prozessführung auf `spawn()` mit `stdio: ["ignore","pipe","pipe"]` umgestellt (behebt reales Hängenbleiben von `execFile` bei offenem stdin)
- **Nicht enthalten – weiterhin offen für Phase E:** Health-E2E-Gesamtaudit, Freeze-Status, produktive Codex-/Apply-Freigabe für Health, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor (umgesetzt, getestet und browserseitig abgenommen, gesichert mit Commit `0858b4e`)

- Eigenständige Module `execution-bridge.js` und `execution-mock-adapter.js`; Tageslauf-, Hybrid- und Guided-Work-Module bleiben kanonisch
- Isolierter Workspace ausschließlich unter `~/Library/Application Support/KI-Unternehmenszentrale/workspaces/` – außerhalb Zentrale und Health
- Deterministischer Mock-Executor (keine KI, kein Netzwerk, kein `shell: true`); klar gekennzeichnet: „Deterministischer Mock-Executor – technische Sicherheitsprüfung, keine KI-Ausführung.“
- Attempt-Statusmaschine: `PREPARED | APPROVED | QUEUED | RUNNING | SUCCEEDED | FAILED | BLOCKED | CANCELLED | TIMED_OUT`
- Apply-Statusmaschine getrennt: `NOT_REQUESTED | APPLY_REVIEW | APPLY_APPROVED | APPLIED | APPLY_DECLINED | APPLY_FAILED | STALE`
- Apply nur gegen Fixture-Repository; Health-Apply in Phase C hart blockiert; Apply ist kein Commit, kein Push, kein Deployment
- Additive localhost-Routen: POST prepare/start/cancel/apply, GET status/result; One-Time-Token nur im Server-RAM; Host-/Origin-/Content-Type-/Bodygrößenprüfung; keine CORS-Öffnung
- Locks, Attempts, Audit und Workspaces außerhalb der Repositories; Phase-B-Controller und Serverstatus bleiben erhalten
- **Nicht enthalten – weiterhin offen für Phase D und Phase E:** Codex-/Cursor-Agentenstart, KI-Ausführung, produktive Health-Apply-Freigabe, Commit/Push/Deployment, Autonomieerhöhung

## V7.0 Phase B – Betriebsstabilität (umgesetzt, getestet und browserseitig abgenommen, gesichert mit Commit `3487a84`)

- Separater lokaler Controller `scripts/zentral-ctl.js` (nicht Teil des laufenden App-Servers) mit `status`, `start`, `stop`, `restart`; npm-Skripte `central:start`, `central:status`, `central:stop`, `central:restart`; `npm start` bleibt einfacher manueller Fallback
- Sicherheitsregeln: verwaltet ausschließlich selbst gestartete Prozesse; beendet nie einen fremden Prozess nur wegen Portbelegung; prüft PID-Existenz, erwartete Node-Anwendung, Projektpfad-Fingerprint und Startnachweis vor `stop`/`restart`; erkennt stale Statusdateien; SIGTERM mit Timeout, kein automatisches `kill -9`; feste argv-Arrays, kein `shell: true`
- App-Support-Verzeichnis `~/Library/Application Support/KI-Unternehmenszentrale/server/` außerhalb beider Repositories; atomare Statusdatei (tmp + rename), Größenbegrenzung, keine Secrets/Env/Browserdaten/Prompts
- Neues Domänenmodul `server-status.js`: unveränderliche Start-Momentaufnahme (App-Version, Git-Commit, Startzeit, Port), Statusmodell `RUNNING | STOPPED | STALE | PORT_CONFLICT | VERSION_MISMATCH | UNKNOWN`, `UNKNOWN` statt erfundener Versionsaussage bei nicht lesbarem Git-Stand
- Neue read-only Route `GET /api/server-status` (Route 43 von 43); andere Methoden bleiben 405; keine vollständigen Pfade, keine Secrets, `writeOperationsBlocked: true`, `madeExternalRequest: false`
- Kompakte Statusanzeige im Guided Work Surface (Port, Version, kurzer Commit, Startzeit, Status); technische Details (PID, vollständiger Commit, Controllerdetails) standardmäßig geschlossen; genau ein sicherer nächster Schritt bei Problemen; **kein** Start-/Stop-/Restart-Button im Browser
- Portstrategie: Standard `4173`, kein automatischer Portwechsel, Konflikt wird klar gemeldet, alternativer Port nur explizit über `--port`
- 32 neue automatisierte Prüfpunkte (`server-status.test.js`: 18, `zentral-ctl.test.js`: 14) plus erweiterte Prüfpunkte in `server-http-router.test.js`, `guided-work.test.js`, `daily-work-run.test.js`, `agent-runtime.test.js`; gesamt **384 automatisierte Prüfpunkte grün** (`npm test`, Exit-Code 0)
- Vollständige Browser-Abnahme bestanden: realer Controller-Lifecycle (`start`/`status`/`restart`/`stop`) gegen einen tatsächlich laufenden Server, echter Portkonflikt auf 4173 gegen einen fremden, unveränderten Prozess ohne Kill, Statusanzeige inkl. Reload-Persistenz, Mobile 390×844 ohne horizontalen Überlauf, Phase-A-Hauptfluss weiterhin vollständig nutzbar
- **Nicht enthalten – weiterhin offen für Phase D und Phase E:** Codex-/Cursor-Agentenstart, produktive Repository-Arbeit, Health-Schreibaktion, automatisches Commit/Push/Deployment, Autonomieerhöhung

## V6.46.0 – vorheriger gesicherter Ausgangsstand

- Hybrid-Pilot nur für **Health Upgrade Kompass**
- Die Unternehmenszentrale liest den lokalen Health-Repository-Status ausschließlich read-only (Branch, HEAD, Working-Tree)
- Cursor/Codex arbeitet weiterhin außerhalb der Unternehmenszentrale
- Die Zentrale startet keinen Cursor-, Codex-, KI-, Test- oder Git-Schreibprozess
- Identitätsgesichertes Auftrags-/Grenzpaket; strukturierte Rückführung als `externalExecutionEvidence`
- Externe Evidenz ist kein automatisch bestätigter Fachbefund
- QA, Projektmanager-Zusammenführung und Jamals Abschlussentscheidung bleiben getrennt
- Commit-, Push-, Deployment- und Außenwirkungs-Gates sind ausschließlich Entscheidungen und führen nichts aus
- Der V6.46.0-Evidenz-Deadlock ist behoben; bestehende betroffene WIP-Läufe werden defensiv geheilt
- Andere Projekte erhalten noch keinen Health-Live- oder Ausführungspaketpfad
- Vollständige Browser-End-to-End-Abnahme bestanden; gesichert mit Commit `e611c9c`

## V6.45.2 – vorheriger gesicherter Ausgangsstand

- Runtime-Pilot-Annahme und finale Projektmanager-Zusammenführung sind entkoppelt
- `runtimePilotEvidence` speichert die Pilotübernahme getrennt vom Orchestrierungsstatus
- Lead-Arbeitskarte wird durch Pilotannahme nicht mehr stillschweigend als finale Zusammenführung markiert
- Gesichert mit Commit `fb9aa0d` auf `origin/main`

## V6.45.0 – vorheriger Funktionsstand (Historie)

- Projektmanager-Agent führt durchgehend; QS-/Test-Agent bleibt über `approvalAgentId` separat
- Normale Health-Tagesläufe mit höchstens fünf Kernagenten plus begründeten Zusatzrollen
- „Prüfphase vorbereiten“ als primäre Aktion nach Vorschlagserstellung
- Autonomie- und Sicherheitsgrenzen unverändert

## V6.44.1 – vorheriger Funktionsstand

- Reine Synchronisierung der kanonischen technischen Health-Momentaufnahme; keine neue Produktfunktion.
- Health vorher: `bc98b5c` → jetzt: `28cdcf7` (PR #1 gemergt, Arbeitscommit `8eadc46`).
- Health Remote-Baseline `baseline/private-health-expansion-2026-07-11`: `28cdcf7`; `origin/main` bewusst `1f4f96d`.
- Health Tests/Build grün inkl. Preview-Demodaten und Check-Datum; Verifizierung `2026-07-19`.
- Expansion teilt die gemeinsamen technischen Git-Referenzen, bleibt **PLANUNG** ohne fachliche/regulatorische Freigabe.
- Keine neue Route, kein neuer Speicher, keine Runtime-Änderung, keine Autonomieerhöhung, keine Außenwirkung.
- Keine medizinische, fachliche, rechtliche oder regulatorische Freigabe.

## V6.44.0 – gesicherter Ausgangsstand (Historie)

- V1-Betriebsfreeze ohne neue Produktfunktion, ohne neue Runtime und ohne Autonomieerhöhung.
- `README.md` und `V1_BETRIEBSHANDBUCH.md` sind die verbindlichen Einstiegspunkte für Start, Backup, Sicherheitsgrenzen und Fehlerfall.
- Kompakter V1-Betriebshinweis in der Oberfläche: lokal fertig, Betrieb auf diesem Mac, Daten im Browser, Außenwirkung blockiert, nächster Schritt klar.
- Gesichert mit Commit `b2f618e` auf `origin/main`.

## V6.43.1 – gesicherter Ausgangsstand (Historie)

- V6.43.0 ist committed und gepusht; V6.43.1 schließt Dokumentation, Agentenbezeichnung und Abnahme ohne neue Ausführung ab.
- Runtime-Infrastruktur in `agent-runtime.js`; Tests in `agent-runtime.test.js`.
- Pilot-Agent: sichtbar **Projektmanager-Agent**; kanonische technische ID **`orchestrator-agent`** (über `ROLE_NAME_MAPPING`, keine neue ID).
- Runtime-Pilot nur für **Health Upgrade Kompass** mit vorbereiteter Agenten-Prüfphase und Projektmanager-Arbeitskarte.
- Erster Executor: `LOCAL_DETERMINISTIC_PILOT` – keine externe KI, kein Plugin, kein Netzwerk, kein Dateischreiben.
- Jamal-Freigabe vor Start; separate Jamal-Annahme vor Ergebnisübernahme; kein automatischer weiterer Executor.
- Persistenz additiv unter `agentRuntimePilot` im bestehenden Tageslauf (`schemaVersion: 1`, Schlüssel `ki-unternehmenszentrale-daily-work-runs-v1`).
- Gesichert mit Commit `16bbf45` auf `origin/main`.

## V6.43.0 – gesicherter Ausgangsstand (Historie)

- `agent-runtime.js` implementiert Snapshot, Fingerprint, Jamal-Freigabe, Statusmaschine, lokalen deterministischen Pilot-Executor, Timeout, Abbruch, Audit und Ergebnisprüfung.
- UI-Integration zurückhaltend in der bestehenden Agenten-Prüfphase; separater Start, keine automatische Ergebnisübernahme.
- Gesichert mit Commit `daa96e9` auf `origin/main`.

## V6.42.1 – gesicherter Ausgangsstand (Historie)

- `server-http-router.js` enthält HTTP-Dispatch, Methodenprüfung, statische Asset-Auslieferung, 404/405 und kontrollierte interne Fehlergrenzen.
- `server.js` bleibt für Serverstart, Konfiguration, Handler, Antwortdaten und die explizite Übergabe von `getRoutes`, `routePrefixHandlers` und `staticAssets` zuständig.
- `project-registry.js` bleibt kanonische Projektquelle; `agent-registry.js` bleibt kanonische Agentenquelle.
- Keine neue Produktfunktion, keine Verhaltensänderung, keine neue Route, keine Schreib-API.
- 17 Projekte, 25 Agenten, 41 GET-Routen, 8 freigegebene statische Pfade und alle Ausführungsverbote bleiben erhalten.
- Nächster geplanter Schritt nach V6.43.0: Runtime-Pilot abnahmefest abschließen (V6.43.1).

## V6.42.0 – gesicherter Ausgangsstand (Historie)

- `daily-work-run-ui.js` enthält die komplette Tageslauf-Präsentations- und Bedienlogik aus dem bisherigen `app.js`-Monolithen.
- `app.js` initialisiert das UI-Modul über `DailyWorkRunUi.init(...)` und ruft `DailyWorkRunUi.render()` aus `renderAll()` sowie nach Register-Refresh auf.
- `daily-work-run.js` bleibt Domänen- und Persistenzmodul; `local-data-backup.js` bleibt Datensicherungsmodul.
- Keine neue Produktfunktion, keine Verhaltensänderung, keine neue Vorbereitungskarte, keine Migration.
- Script-Reihenfolge: `agent-registry.js` → `daily-work-run.js` → `local-data-backup.js` → `daily-work-run-ui.js` → `app.js`.
- 17 Projekte, 25 Agenten, 41 GET-Routen, beide localStorage-Schlüssel und alle Ausführungsverbote bleiben erhalten.

## V6.41.0 – gesicherter Ausgangsstand

Siehe ältere Statusdokumentation und Git-Historie für Detailstände vor dem UI-Modul-Split.

## Bekannte technische Altlasten

- sehr große Monolithen: `app.js`, `server.js` und `styles.css` (Tageslauf-UI seit V6.42.0 ausgelagert)
- historische Register-, Status- und Sicherheitsstrukturen bleiben in Frontend und Server sichtbar; technische Projektverifizierung stammt ausschließlich aus `project-registry.js`
- zahlreiche historische Versionsschichten im laufenden Code
- uneinheitliche Agenten- und Projektnamen
- fehlende zentrale Daten- und API-Spezifikation vor dieser Dokumentation
- reale HTTPS-Fähigkeit einzelner Airtable-Read-only-Pfade bei gesetzter Freigabe

## Bekannte Versionswidersprüche

- Neuer Tageslaufstand V6.40.3, historische Cockpit- und Modulkennzeichnungen teilweise V6.38.x oder älter.
- Zwei Commits tragen V6.37.0; V6.37.2 erscheint in der Historie vor V6.37.1.
- Viele historische V4.x-, V5.x- und V6.x-Bezeichnungen bleiben parallel sichtbar.

## Genau ein empfohlener nächster Produktentwicklungsschritt

V7.0 ist mit Jamals Entscheidung vom 25.07.2026 offiziell FROZEN. Der nächste Schritt ist ausschließlich eine neue, separate Freigabe durch Jamal für den Start von V7.1. Der geplante Pfad nach V7.0 (nur Reihenfolge, keine Umsetzung ohne separate Freigabe): Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte. Bis zu dieser Freigabe sind an V7.0 nur belegte Fehler-, Sicherheits- oder Betriebsfixes zulässig. Keine Deployment-, V2- oder Außenwirkungsentscheidung aus diesem Stand ableiten.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Jede spätere Deployment-, V2- oder Außenwirkungsentscheidung sowie jede Ausweitung des Hybrid-Pfads auf andere Projekte.
