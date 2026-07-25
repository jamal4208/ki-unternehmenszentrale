# PROJECT MASTER

## V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

V7.1 Phase B bereitet HeyGen als ersten echten, kontrollierten Medien-Connector vor (`CONTROLLED_CONNECTOR_HANDOFF`): Die Zentrale erkennt HeyGen fachlich, prüft Datenklassifizierung, externe Übertragung, Veröffentlichungsrecht, Avatar-/Stimmrechte, Kostenrahmen und Verbindungsmodus, und erstellt danach ein validiertes, kopier- bzw. connectorfähiges Auftragspaket. Die tatsächliche HeyGen-Aktion läuft – falls überhaupt – über den vorhandenen, authentifizierten HeyGen-Connector außerhalb dieses lokalen Servers, ausschließlich nach separater Jamal-Freigabe. Kein API-Key wird gespeichert, keine Veröffentlichung, kein automatischer Renderlauf. Lokal read-only auditiert, mit 816 automatisierten Prüfpunkten grün getestet, Trockenlauf und Browser-/Mobile-Abnahme gegen einen eigenen isolierten Testserver bestanden. **Kein Commit, kein Push, kein Deployment.** V7.0 bleibt `FROZEN`, V7.1 Phase A bleibt unverändert. Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`. Bereit zur manuellen Abnahme und Commit-Prüfung durch Jamal; der erste reale HeyGen-Pilot benötigt danach eine eigene, separate Freigabe.

## V7.1 Phase A – lokal umgesetzt, ungesichert (Commit/Push stehen aus)

V7.1 Phase A („Dokumenten- und Wissenseingang, Werkzeug-/Lizenzregister und sicheres Plugin-Gateway-Fundament") ist lokal vollständig umgesetzt, read-only auditiert gegen den ursprünglichen Auftrag und mit 661 automatisierten Prüfpunkten grün getestet (Browser-/Mobile-Abnahme zusätzlich manuell durchgeführt, siehe `CURRENT_STATUS.md`). Nach der ersten manuellen Safari-Abnahme wurden zwei gemeldete Abschlussfehler (Checkbox-Layout im Tool-Routing-Formular; nicht strukturierte Blockierungsantwort bei „kein Werkzeug erfunden") mit der kleinstmöglichen Korrektur behoben, siehe `MIGRATION_PLAN.md`. **Kein Commit, kein Push, kein Deployment.** V7.0 bleibt unverändert `FROZEN` auf `15ce8bb`. Details, Dateiliste und Testergebnisse siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`. Bereit zur manuellen Wiederholungsabnahme und Commit-Prüfung durch Jamal.

## V7.0 offiziell FROZEN – Jamal-Entscheidung vom 2026-07-25

V7.0 ist mit Jamals ausdrücklicher Entscheidung vom 25.07.2026 offiziell auf `FROZEN` gesetzt, auf Basis des gesicherten Phase-E-Stands **`52ce012`**. Phase A bis E sind damit abgeschlossen; V7.0 erhält keine neuen Funktionen mehr, Änderungen bleiben auf belegte Fehler-, Sicherheits- und Betriebsfixes begrenzt. Der read-only Freeze-Status (`GET /api/v7-freeze-status`, `v7-freeze-status.js#MANUAL_FREEZE_DECISION`) zeigt `FROZEN` ausschließlich wegen dieser einen, von Hand hinterlegten Entscheidung – nie automatisch aus Git-Stand oder Testzahl. Neue Funktionen beginnen erst nach separater Freigabe unter V7.1 (Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway, Marketing-Agentur, Canva/HeyGen, Shopify, weitere Umsatzprojekte). Kein Deployment, keine Autonomieerhöhung.

## Aktueller Arbeitsstand V7.0 (Phase A bis E gesichert, V7.0 offiziell FROZEN)

**V7.0 Phase A – Guided Work Foundation** ist umgesetzt, getestet, browserseitig abgenommen und mit Commit **`4a74ebe`** auf `origin/main` gesichert. Sie führt einen geführten Hauptarbeitsraum („Oben arbeiten. Unten nachschauen.“) mit deterministischen, quellenbasierten Arbeitsvorschlägen, editierbarem Agententeam, Re-Fingerprinting/Invalidierung, klarer Trennung von Live-/Snapshot-/Historienständen, bekannt-dirty-Baseline für Health und Evidenz-Prefill ein. Neue Tagesläufe erhalten `schemaVersion: 2`; `schemaVersion: 1` bleibt unverändert lesbar. Der V6.46.0-Hybrid-Fallback bleibt vollständig erhalten.

**V7.0 Phase B – Betriebsstabilität** ist umgesetzt, getestet, browserseitig abgenommen und mit Commit **`3487a84`** auf `origin/main` gesichert. Separater lokaler Controller, Serverstatus-API und kompakte Statusanzeige ohne Steuerbuttons. Health bleibt ausschließlich read-only Pilotquelle.

**V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor** ist umgesetzt, getestet, browserseitig abgenommen und mit Commit **`0858b4e`** auf `origin/main` gesichert. Isolierter Workspace unter App Support, deterministischer Mock-Executor (keine KI), Attempt-/Apply-State-Machine, One-Time-Token-API, Apply nur gegen Fixture-Repository nach Jamal-Freigabe. Health-Apply bleibt hart blockiert. Apply ist kein Commit, kein Push, kein Deployment.

**V7.0 Phase D – Codex als kontrollierten Executor anbinden** ist umgesetzt, getestet, der echte Codex-Fixture-Pilot bestanden und mit Commit **`6553452`** auf `origin/main` gesichert. Codex läuft ausschließlich isoliert gegen das Fixture-Repository (`--ask-for-approval never`, `spawn()`-basierte Prozessführung); Codex-Start und Apply für Health bleiben serverseitig hart blockiert; genau ein primärer Button je Zustand in der erweiterten Executor-Auswahl.

**V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat** ist umgesetzt, getestet und mit Commit **`52ce012`** auf `origin/main` gesichert. Kein neuer Executor, sondern Audit und gezielte Schließung echter Lücken im bestehenden Ablauf: neues read-only Modul `v7-freeze-status.js` (`GET /api/v7-freeze-status`, Statusmodell `IN_REVIEW | FREEZE_CANDIDATE | FROZEN`; `FROZEN` wird von der automatischen Ableitung nie gesetzt), eingeklappte Freeze-Status-Karte im Hauptarbeitsraum, sichtbares „Wer arbeitet daran“/„Tatsächlich ausgeführt / Evidenz“ im Sticky-Kopf und im Tagesabschluss, korrigierte veraltete Startkarten-Aussage („Keine Execution Bridge“ existierte bereits nicht mehr korrekt).

**V7.0 ist mit Jamals ausdrücklicher Entscheidung vom 25.07.2026 offiziell FROZEN** (Basis `52ce012`, siehe `v7-freeze-status.js#MANUAL_FREEZE_DECISION`). Dies ist die einzige Stelle, an der `FROZEN` entstehen kann; es gibt keinen Schreib-Endpunkt und keinen Button dafür.

**Vorheriger gesicherter Ausgangsstand:** V6.46.0 / `e611c9c`. **V7.0 insgesamt ist damit abgeschlossen und eingefroren** – Phase V7.1 ist weiterhin offen, nicht begonnen und benötigt eine neue ausdrückliche Freigabe. Kein Codex-/Cursor-Agentenstart gegen Health, keine produktive Health-Apply-Freigabe, kein automatisches Commit/Push/Deployment, keine Autonomieerhöhung.

## Verbindlicher Arbeitsstand V6.46.0

V6.46.0 führt den ersten Health-only Hybrid-End-to-End-Pilot ein und ist umgesetzt sowie vollständig browserseitig abgenommen. Die Zentrale liest Branch, HEAD und Working-Tree des kanonischen Health-Repositories lokal read-only. Cursor/Codex arbeitet außerhalb. Die Zentrale startet keinen Testprozess, keinen Cursor-/Codex-/KI-Agenten und kein Git-Schreiben. Auftrags-/Grenzpakete tragen Identität und Fingerprint; Rückführungen landen als `externalExecutionEvidence` auf der zuständigen Agentenkarte ohne Auto-`ACCEPTED`. Externe Evidenz ist kein automatisch bestätigter Fachbefund. QA, Projektmanager-Zusammenführung und Jamals Abschlussentscheidung bleiben getrennt. Jamal-Freigaben für Commit/Push/Deploy bleiben reine Entscheidungen ohne Ausführungsvortäuschung. Der frühere V6.46.0-WIP-Evidenz-Deadlock ist behoben; betroffene WIP-Läufe werden defensiv geheilt. Andere Projekte erhalten noch keinen Health-Live- oder Ausführungspaketpfad.

## Vorheriger gesicherter Ausgangsstand V6.45.2

V6.45.2 entkoppelt Runtime-Pilot-Annahme und finale Projektmanager-Zusammenführung. Gesichert mit Commit **`fb9aa0d`**. `runtimePilotEvidence` bleibt getrennt von Orchestrierung und von der neuen externen Evidenz in V6.46.0.

## Vorheriger Versionsstand V6.45.0 (Historie)

V6.45.0 bündelt den V1-Finish-Sprint für den geführten Tageslauf. Der Projektmanager-Agent führt und koordiniert jetzt durchgehend; der QS-/Test-Agent verantwortet Qualitätsprüfung, Abnahmekriterien und Abschlussprüfung über die verbindliche Quelle `approvalAgentId` und übernimmt keine Führungsrolle. Normale Tagesläufe verwenden höchstens fünf Kernagenten plus optional begründete Zusatzrollen. UI- und Kommunikations-Agent werden XOR gewählt. Explizite Risikoaufträge wählen den Risiko-Agenten; Datenschutz allein tut das nicht. Plugin- und Werkzeugprüfung ist entweder dem Plugin-/Tool-Radar-Agenten zugewiesen oder ausdrücklich als „nicht benötigt“ ohne Agentenzuweisung markiert. Direkt nach der Planerstellung steht die primäre Aktion „Prüfphase vorbereiten“ mit kompakter Führung und den unveränderten Ausführungsgrenzen oben bereit. Der gesicherte Folgestand ist V6.45.2/`fb9aa0d`.

Keine Runtime-Autonomieerhöhung. Agenten-, Codex-, Repository-, Plugin- und externe Ausführung, Deployment, automatische Freigaben sowie automatische Git-Aktionen bleiben blockiert; V6.46.0 ergänzt nur den kontrollierten Hybrid-Lesepfad und die manuelle Rückführung.

## Vorheriger Versionsstand V6.44.1

V6.44.1 synchronisiert ausschließlich die kanonische technische Health-Momentaufnahme mit dem bestätigten Health-Stand `28cdcf7` (PR #1, Arbeitscommit `8eadc46`). Ausgangscommit der Zentrale: `b2f618e` (V6.44.0). **V1 lokal fertig und betriebsbereit** bleibt erhalten.

Keine neue Produktfunktion, keine Runtime-Änderung, keine Autonomieerhöhung, keine Außenwirkung und keine medizinische, fachliche, rechtliche oder regulatorische Freigabe. Expansion teilt die gemeinsamen technischen Git-Referenzen, bleibt aber **PLANUNG**.

## Verbindlicher Versionsstand V6.44.0 (Historie)

V6.44.0 friert den vollständig geprüften lokalen V1-Stand als Betriebsmodus ein. **V1 lokal fertig und betriebsbereit.** Gesichert mit Commit `b2f618e`. Einstiegspunkte: `README.md` und `V1_BETRIEBSHANDBUCH.md`.

## Verbindlicher Versionsstand V6.43.1 (Historie)

V6.43.1 schließt den in V6.43.0 (`daa96e9`) eingeführten Runtime-Piloten abnahmefest ab und ist mit `16bbf45` auf `origin/main` gesichert. Sichtbarer Name **Projektmanager-Agent**, technische ID **`orchestrator-agent`**. Lokaler deterministischer Pilot ohne externe KI, Plugin oder Netzwerk.

## Verbindlicher Versionsstand V6.43.0 (Historie)

V6.43.0 ergänzt eine kontrollierte Agenten-Laufzeit mit lokalem deterministischen Pilot-Executor als eigenständiges Modul `agent-runtime.js`. Gesichert mit Commit `daa96e9`. Der Pilot ist nur für Health Upgrade Kompass mit vorbereiteter Agenten-Prüfphase und Projektmanager-Arbeitskarte verfügbar.

## Architektur-Freeze ab V6.43.0

- `agent-runtime.js` enthält Laufzeit-Datenmodell, Snapshot, Fingerprint, Freigabelogik, Statusmaschine, Executor-Schnittstelle, Timeout, Abbruch, Audit und Ergebnisvalidierung.
- `daily-work-run.js` bleibt Domänen- und Persistenzmodul; Runtime-Zustand liegt additiv unter `agentRuntimePilot` im bestehenden Tageslauf-Datensatz.
- `daily-work-run-ui.js` rendert und bedient den Runtime-Piloten in der bestehenden Agenten-Prüfphase ohne kopierte Geschäftslogik.
- Keine neue API-Route, keine Schreib-API, kein Deployment, keine Autonomieerhöhung.
- Nächster Schritt: V1 ist eingefroren; V2 nur nach ausdrücklicher Freigabe.

## Gesicherter Ausgangsstand V6.42.1 (Historie)

- Keine weiteren verschachtelten Vorbereitungs-, Simulations- oder Abschlusskarten als Ersatz für echte Funktionen.
- Neue Kernfunktionen werden grundsätzlich als eigenständige Module umgesetzt; `app.js` und `server.js` werden nicht unkontrolliert vergrößert.
- Agenten-Laufzeit und Plugin-Gateway folgen erst nach Datensicherung und kontrollierter Modularisierung.
- V6.42.1 ist reine Architekturmodularisierung ohne neue Ausführung.
- Nächster geplanter Schritt nach V6.42.1: Agenten-Runtime-Pilot (umgesetzt in V6.43.0).

## Gesicherter Ausgangsstand V6.42.0 (Historie)

V6.42.0 modularisiert die Tageslauf-Oberfläche als eigenständiges Modul `daily-work-run-ui.js`. Rendering, Formularlogik, Event-Bindings und die Anbindung der lokalen Datensicherung im Tageslaufbereich liegen dort. `daily-work-run.js` bleibt Domänen- und Persistenzmodul, `local-data-backup.js` bleibt Datensicherungsmodul, `app.js` bleibt App-Shell mit Initialisierung und View-Koordination. Es gibt keine neue Produktfunktion, keine Verhaltensänderung und keine neue Vorbereitungskarte.

## Architektur-Freeze ab V6.42.0

- Keine weiteren verschachtelten Vorbereitungs-, Simulations- oder Abschlusskarten als Ersatz für echte Funktionen.
- Neue Kernfunktionen werden grundsätzlich als eigenständige Module umgesetzt; `app.js` und `server.js` werden nicht unkontrolliert vergrößert.
- Agenten-Laufzeit und Plugin-Gateway folgen erst nach Datensicherung und kontrollierter Modularisierung.
- V6.42.0 ist reine Architekturmodularisierung ohne neue Ausführung.

## Gesicherter Ausgangsstand V6.41.0

V6.41.0 ergänzt eine echte lokale Datensicherung als eigenständiges Modul `local-data-backup.js`. Jamal kann die beiden bestehenden Browser-Speicherbereiche `ki-unternehmenszentrale-v1` und `ki-unternehmenszentrale-daily-work-runs-v1` als JSON exportieren, vor dem Import prüfen und nach ausdrücklicher Bestätigung verlustfrei wiederherstellen. Kanonische Projekt- und Agentenregister bleiben außerhalb dieser Sicherung.

## Gesicherter Ausgangsstand V6.40.3 (Historie)

V6.40.3 ergänzt den abgenommenen Agenten-Einsatzplan um eine kontrollierte, ausschließlich lokale Agenten-Prüfphase. Nach Jamals ausdrücklicher Freigabe entstehen interne Arbeitskarten für genau die ausgewählten Agenten. Diese Karten bilden Auftrag, erwartetes Ergebnis, Prüfkriterium, Sicherheitsgrenze, gespeicherte Abhängigkeiten, Übergabe und manuelle Ergebnisrückführung ab. Sie starten keine Agenten und erzeugen keine simulierten Erfolgs- oder Ausführungsmeldungen.

Grundlagen, parallele Fachbefunde, QS-/Test-Prüfung und Projektmanager-Zusammenführung werden in der gespeicherten Reihenfolge freigeschaltet. QA und Gesamtbefund bleiben manuelle Rückführungen. Jamals Abschlussentscheidung speichert genau einen nächsten sicheren Schritt und kann nur einmal in den bestehenden lokalen Projektverlauf übernommen werden. Alte V6.40.1- und V6.40.2-Läufe bleiben ohne pauschale Migration lesbar.

Die Grenzen bleiben unverändert: 17 kanonische Projekte, 25 kanonische Agenten, 41 GET-Routen, keine Schreib-API, keine Agenten-, Codex-, Plugin-, Git- oder externe Ausführung und kein Deployment.

## Gesicherter Ausgangsstand V6.40.2

Die KI-Unternehmenszentrale erhält in V6.40.2 den vereinfachten Tagesstart aus V6.40.1 und vertieft ausschließlich den daraus abgeleiteten Agenten-Einsatzplan. Jamal wählt ein Fokusprojekt, formuliert genau einen Ergebniswunsch und kann optional eine zusätzliche Verbotsgrenze nennen. Die Zentrale erkennt den Auftragstyp und wählt aus dem kanonischen Bestand von 25 Hauptagenten ein möglichst kleines, aber fachlich vollständiges Team. Für jeden ausgewählten Agenten werden Auswahlgrund, Rolle, Teilauftrag, erwartetes Ergebnis, Prüfkriterium, Sicherheitsgrenze, Abhängigkeit, Arbeitsmodus und Übergabe strukturiert gespeichert.

`agent-registry.js` ist die einzige kanonische Quelle der 25 Hauptagenten für Server, Tageslauf und Browser. Historische Rollenbezeichnungen wie Projektmanager-, Entwickler-, Design-Director- oder Plugin-/Tool-Agent werden auf vorhandene kanonische IDs abgebildet; sie erzeugen keine zweite Agentenquelle. Werkzeuge wie Codex, Canva, HeyGen, GitHub oder Airtable bleiben Werkzeuge zuständiger Agenten und werden weder zu Steuerungsrollen noch automatisch ausgeführt.

`project-registry.js` bleibt unverändert die einzige kanonische technische Quelle für **17 Projekte mit stabilen IDs**. Die Oberfläche unterscheidet `DEMO`, `PLANUNG`, `REAL_VERIFIZIERT` und `UNGEKLÄRT`. Health Upgrade Kompass bleibt der erste technisch real verifizierte Pilot; Git- und Testdaten sind bestätigte Momentaufnahmen und keine automatische Live-Prüfung.

Health und Expansion bleiben fachlich getrennt, obwohl sie aktuell teilweise denselben Projektordner und Code nutzen. Work bleibt technisch `UNGEKLÄRT`, Codex bleibt manuell kontrolliert. Bestehende Managementdaten bleiben im bisherigen Browser-Speicher erhalten. Tagesläufe verwenden getrennt `ki-unternehmenszentrale-daily-work-runs-v1`; keine lokale Momentaufnahme darf die kanonische technische Akte überschreiben.

V6.40.2 erteilt keine medizinische, fachliche, rechtliche, öffentliche oder produktive Freigabe. Agenten- und Einsatzplanung bleibt ausdrücklich ein Rollen- und Arbeitsplan und wird nicht in einen Codex-/Repository-Auftrag umgedeutet. Kopierbare Arbeitsvorlagen starten nichts. Die Zentrale bleibt eine lokale, kontrollierte Arbeitsoberfläche: keine autonome Produktivplattform, keine automatische externe Aktion, keine automatische Git-Aktion, keine Agenten- oder Plugin-Ausführung und keine Deploymentfreigabe.

## Projekt

**Name:** KI-Unternehmenszentrale

Die KI-Unternehmenszentrale ist das zentrale Steuerungsprojekt für alle weiteren Projekte. Sie bündelt Portfolio, Tagesführung, Entscheidungen, Agenten, Qualität, Wissen, Support, Projektaufnahme sowie Plugin- und Freigabestatus.

## Zweck und Zielbild

Zweck ist eine lokale, verständliche und kontrollierte Steuerungsplattform, die Jamal zeigt, welches Projekt, welche Entscheidung und welcher kleinste sichere Schritt als Nächstes sinnvoll ist. Das Zielbild ist eine zentrale Arbeitsoberfläche, in der Projekte sichtbar, Agenten klar begrenzt, Übergaben nachvollziehbar und externe Aktionen stets manuell freigegeben sind.

## Aktueller Betriebscharakter

- lokaler V1-Arbeits- und Demo-Stand
- read-only und manuell geführt
- Vorbereitung von Entscheidungen, Briefings und Arbeitsaufträgen
- keine autonom produktiv handelnde Unternehmensplattform
- Health Upgrade Kompass als erstes reales Pilotprojekt

## Hauptmodule

- Cockpit und Tagesführung
- Portfolio
- Agenten-Zentrale
- Projektaufnahme
- Support
- Qualität
- Wissen und Archiv
- Plugin-/Tool-Bereitschaft
- Sicherheits-, Freigabe- und Entscheidungslogik

## Demo, Vorbereitung und produktive Nutzung

- **Demo:** zeigt vorhandene Abläufe lokal und ohne echte Außenwirkung.
- **Vorbereitung:** strukturiert Arbeitsaufträge, Entscheidungen, Agentenübergaben und Plugin-Bedarf.
- **Produktive Nutzung:** beginnt erst, wenn ein konkreter Vorgang ausdrücklich durch Jamal freigegeben und technisch sicher begrenzt wurde. Der aktuelle Gesamtstand ist nicht als autonome produktive Ausführung freigegeben.

## Rolle von Work, Codex und Jamal

- **Work:** `UNGEKLÄRT` als technisch eindeutig definiertes Modul. Im Projektkontext bezeichnet Work die organisierte Projektarbeit und Aufnahme migrierter Projekte in den Arbeitskontext.
- **Codex:** liest, analysiert, dokumentiert oder setzt einen ausdrücklich begrenzten Auftrag kontrolliert um; Änderungen werden geprüft und erst nach gesonderter Freigabe gesichert.
- **Jamal:** entscheidet Priorität, Freigabe, externe Aktion, Autonomie, Commit, Push und produktive Nutzung.

## Nicht-Ziele

- keine automatische Geschäftsführung oder Freigabe
- keine ungeprüfte Automatisierung
- keine automatische Veröffentlichung, externe oder serverseitige Speicherung oder Plugin-Ausführung; lokale Browser-Persistenz für Managementdaten bleibt sichtbar
- keine Zahlungen, Verträge oder Deployments
- keine Rechts-, Finanz- oder Medizinfreigabe
- keine Diagnose oder Heilversprechen
- kein unkontrolliertes Überschreiben früherer Versionsstände

## Verbindliche Arbeitsweise

1. Bestand lesen und kleinsten sinnvollen Schritt bestimmen.
2. Wirkung, Risiko, Grenze und Prüfweg sichtbar machen.
3. Jamals Freigabe einholen, wenn eine echte Änderung oder externe Aktion betroffen ist.
4. Kleine reversible Schritte ausführen.
5. Syntax, betroffene Abläufe, Sicherheitswerte und Bestandsschutz prüfen.
6. Commit und Push nur nach ausdrücklicher separater Freigabe.

## Abschlussdefinition eines Versionsschritts

Ein Versionsschritt ist abgeschlossen, wenn Ziel und Nicht-Ziele erfüllt, betroffene Funktionen geprüft, bestehende Funktionen erhalten, Sicherheitsgrenzen unverändert, Widersprüche dokumentiert, der Working Tree nachvollziehbar und Commit/Push nur nach Jamals Freigabe erfolgt sind.

## Bekannte Widersprüche

- Sichtbare und interne historische Teilversionsangaben sind nicht durchgehend auf V6.39.0 vereinheitlicht.
- Work ist im Bestand nicht als eigenes technisches Modul eindeutig definiert.

## Noch zu normalisieren

- zentrale Versionsquelle
- Projekt- und Agentennamen
- weitere Trennung historischer Demo-, Vorbereitungs- und aktueller Arbeitsstrukturen; die technische Projektquelle ist bereits `project-registry.js`

## Entscheidung durch Jamal erforderlich

**V1 lokal eingefroren und betriebsbereit (V6.44.0/V6.44.1). V7.0 offiziell eingefroren (25.07.2026, Basis `52ce012`).** Health-Verifizierungsstand auf `28cdcf7` synchronisiert. Einstieg über `README.md` und `V1_BETRIEBSHANDBUCH.md`. Jede spätere produktive Außenwirkung, Deployment-, V2- oder V7.1-Entscheidung benötigt eine neue ausdrückliche Freigabe durch Jamal.
