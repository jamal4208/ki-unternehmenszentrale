# V1-Betriebshandbuch – KI-Unternehmenszentrale

## 1. Verbindlicher V1-Stand

- **Aussage:** V1 lokal fertig und betriebsbereit
- **Aktuelle Arbeitsversion:** **V7.0 Phase A** gesichert (`4a74ebe`); **V7.0 Phase B** gesichert (`3487a84`); **V7.0 Phase C – Execution Bridge Isolation mit Mock-Executor** gesichert (`0858b4e`); **V7.0 Phase D – Codex als kontrollierten Executor anbinden** gesichert (`6553452`); **V7.0 Phase E – Health-Ende-zu-Ende-Abnahme und Freeze-Kandidat** gesichert (`52ce012`); vorheriger gesicherter Stand **V6.46.0** / `e611c9c`
- **V7.0 offiziell FROZEN:** Jamal-Entscheidung vom **25.07.2026** auf Basis von `52ce012`; Phase A bis E abgeschlossen; keine neuen Funktionen mehr in V7.0; Phase V7.1 offen und benötigt eine neue, separate Freigabe
- **V7.1 Phase A** (Dokumenten-/Wissenseingang, Werkzeug-/Lizenzregister, Plugin-Gateway) ist umgesetzt und getestet, **committed und gepusht mit Commit `59f985f`**
- **V7.1 Phase B** (HeyGen als erster kontrollierter Medien-Connector, `CONTROLLED_CONNECTOR_HANDOFF`) ist umgesetzt; kein API-Key gespeichert, kein echter Renderlauf, keine Veröffentlichung; **committed und gepusht mit Commit `ff43089`**
- **V7.1 Phase B.1** (HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet) ist umgesetzt und mit 929 automatisierten Prüfpunkten getestet, **committed und gepusht mit Commit `37e8a28`** (HEAD und `origin/main` stehen exakt darauf); der bereits extern erfolgreich ausgeführte erste reale HeyGen-Pilot ist strukturiert dokumentiert (Pilot-Review, `NOT_BILLABLE_TEST`, `NOT_PUBLISHED`); additiv eine kleine, ausschließlich neutrale Testmandantenbasis, verpflichtende Kunden-/Marken-/Kampagnenbindung je Videoauftrag, eine fünfte getrennte Freigabestufe (Kundenentwurf) und eine Ergebnisrückführungs-Statuskette bis zur getrennten Kundenfreigabe; Veröffentlichung bleibt strukturell unerreichbar; Kunden erhalten weiterhin keinen HeyGen-Zugang und kein echtes Kundenportal
- **V7.1 Phase C** (Canva als zweiter kontrollierter Design-Connector, `CONTROLLED_CONNECTOR_HANDOFF`, dieselbe neutrale Testmandantenbasis wie Phase B.1) ist umgesetzt und mit 1165 automatisierten Prüfpunkten getestet, **committed und gepusht mit Commit `52b2d02`** (HEAD und `origin/main` stehen exakt darauf); sieben getrennte Freigabestufen (Briefing, Assets/Rechte, externe Übertragung, Kostenrahmen, Canva-Übergabe, Designkandidat-Auswahl, Edit-/Speichervorschau); kein API-Key gespeichert, keine Veröffentlichung; Kunden erhalten weiterhin keinen Canva-Zugang; HeyGen und Shopify unverändert
- **V7.1 Phase C.1** (realen Canva-Pilot kanonisch abgeschlossen, Kundenfeedback-Schleife vorbereitet) ist umgesetzt, **committed und gepusht mit Commit `6621d93`**; der erste reale Canva-Pilot wurde bereits extern über den verbundenen Canva-Connector ausgeführt (fiktiver Testkunde, Marke „Café Amore“, Instagram-Post „Sonntagsfrühstück“, Design-ID `DAHQeIjc2ls`, als bearbeitbares Canva-Design gespeichert, `NOT_BILLABLE_TEST`) und ist jetzt strukturiert als kanonische Pilot-Ergebnisakte mit Jamals internem Review dokumentiert; eine kontrollierte Kundenfeedback-Schleife (Feedback erfassen, Änderungen anfordern, erneut prüfen, getrennte Kundenfreigabe) ist vorbereitet; Veröffentlichung bleibt strukturell nicht freigegeben; Kunden erhalten weiterhin keinen Canva-Zugang
- **V7.1 Phase C.1.1** (Reviewmodell skalierbar gemacht) ist umgesetzt; Jamal prüft Eigenprojekte und Risikofälle – Standardkunden prüfen nach bestandener Agenten-QS selbst; Premiumprüfung ist tarifabhängig optional; kein Jamal-Flaschenhals; deutsche Version zuerst; Mehrsprachigkeit später vorbereitet (Portugal, England, Spanien, Frankreich), aber nicht implementiert; **committed und gepusht mit Commit `6621d93`** (gemeinsam mit Phase C.1)
- **V7.2 Phase A Schritt 1** (Auth-Kern und persistente Identitätsschicht: gekapselte `auth.sqlite`, `crypto.scrypt`-Passwort-Hashing, 256-Bit-Sessiontokens, Mandantenprojektion) ist umgesetzt, **committed und gepusht mit Commit `e2cd018`**; noch keine Route-Gates, kein Login
- **V7.2 Phase A Schritt 2** (Route-Gates, Auth-Routen und Owner-/Customer-Trennung) ist umgesetzt und mit 1450 automatisierten Prüfpunkten getestet, **committed und gepusht mit Commit `41b6dbc602f9fd4f5e91099492cc08be72b0014c`** (HEAD und `origin/main` standen zu Beginn von Schritt 3 exakt darauf); jede Route hat jetzt eine explizite Zugriffspolitik (`route-access-policy.js`); im Produktivmodus (`KUZ_MODE=prod`) sind alle bestehenden Chef-Routen und -Assets nur mit Owner-Session erreichbar, Execution-Routen sind zusätzlich vollständig deaktiviert, jede unklassifizierte Route liefert 404; neue Anmelde-/Abmelde-/Sessionstatus-/Passwort-Reset-/Einladungsrouten (`/api/auth/*`); Jamals bestehender Chef-Modus bleibt im lokalen Entwicklungsmodus (`KUZ_MODE=dev`, Standard) auf Loopback weiterhin ohne Login nutzbar (sichtbare Konsolenwarnung); Kunden-/Mandantengrenzen gelten in beiden Modi unverändert; zu diesem Zeitpunkt noch **kein** Kundenportal, keine kundenbedienbare Fachroute
- **V7.2 Phase A Schritt 3** (Deutsches Kundenportal und Owner-Verwaltung) ist umgesetzt und mit 1535 automatisierten Prüfpunkten getestet (Baseline 1450 + 85 neue), **jedoch noch nicht committed, gepusht oder deployt**; neue Owner-Verwaltungsseite `/owner/kunden` (Mandanten aktivieren/suspendieren, Kunden einladen/sperren/reaktivieren, Sitzungen widerrufen, Einladung erneuern/widerrufen, Passwort-Reset vorbereiten – ausschließlich mit Owner-Session, `STATIC_OWNER_ONLY`); neue öffentliche Portal-Einstiegsseiten `/portal/login`, `/portal/einladung`, `/portal/passwort-vergessen`, `/portal/passwort-neu` (`STATIC_PUBLIC`, nutzen ausschließlich die bereits in Schritt 2 gesicherten Auth-Routen); neue Kundenportal-Startseite `/portal` mit Konto-/Sitzungsinformation und ehrlichem Bereitschaftsstatus, ausschließlich mit Kunden-/Owner-Session erreichbar (`STATIC_AUTHENTICATED_PORTAL`), die zugehörige Daten-API bleibt jedoch strikt auf `CUSTOMER_ADMIN`/`CUSTOMER_USER` begrenzt; neuer lokaler Owner-Bootstrap-Befehl `npm run auth:bootstrap-owner` für genau ein Owner-Konto; ausdrücklich noch **keine** Fachaufträge, Werkzeuge, Veröffentlichung, Billing oder echter Mailversand im Kundenportal – wartet auf Jamals manuelle Abnahme und Commit-Prüfung
- **V7.2 Phase A Schritt 4** (Betriebs-, Sicherheits- und Produktabnahme der Portalbasis) ist eine reine Gesamtabnahme von Schritt 1–3 (kein neuer Funktions-Sprint) und mit 1597 automatisierten Prüfpunkten getestet (1535 + 62 neue), **jedoch noch nicht committed, gepusht oder deployt**; ein echter Sicherheitsbefund wurde in `owner-admin-service.js` gefunden und behoben (Owner-Benutzeraktionen konnten ohne Rollenprüfung fremde OWNER-/SUPPORT-Konten adressieren, jetzt generisch `404`); drei neue Akzeptanztestdateien (Sicherheit/Betrieb/Bedienbarkeit); eine vollständige manuelle End-to-End-Abnahme mit zwei echten, isolierten Testservern (Dev und Prod) und zwei Mandanten wurde real durchlaufen (33/33 Schritte grün) und danach vollständig zurückgebaut; **Phase-A-Urteil: mit klar benannten Restgrenzen abgenommen und commitbereit** – vollständiger Bericht in `V7_2_PHASE_A_ACCEPTANCE.md`, wartet auf Jamals Freigabe
- **V7.2 Phase B Schritt 1** (Erste echte Kundenfachfunktion: Arbeitsauftrag anlegen, automatisch prüfen, Status verfolgen; **PRODUKTKORRIGIERT vor jedem Commit**) ist umgesetzt und mit 1693 automatisierten Prüfpunkten getestet (1597 + 96 neue, inkl. Produktkorrektur), **jedoch noch nicht committed, gepusht oder deployt**; **Produktkorrektur:** die erste Umsetzung sah den OWNER fälschlich als regulären fachlichen Pflichtprüfer jedes Kundenauftrags vor – das widerspricht dem Selbstbedienungsprinzip der Zentrale (Jamal prüft/genehmigt normale Kunden-Marketing-/Design-/Strategieaufträge inhaltlich nicht); korrigiert auf: Kunden (`CUSTOMER_ADMIN`/`CUSTOMER_USER`) legen erstmals über `/portal/auftrag-neu` einen einfachen Arbeitsauftrag an (Titel/gewünschtes Ergebnis Pflicht, Hintergrund/Zeitpunkt optional), die Zentrale entscheidet **automatisch** über Vollständigkeit (`READY_FOR_PROCESSING`/`NEEDS_CLARIFICATION`, kein Owner beteiligt), der Kunde verfolgt den Status auf `/portal`, ergänzt bei Rückfrage und kann selbst stornieren; der Owner sieht mandantenübergreifend unter `/owner/auftraege` nur eine Betriebsübersicht und greift ausschließlich bei Sicherheit/Missbrauch/Rechtsfragen/außergewöhnlichen Kosten/technischer Blockade/expliziter Eskalation über zwei Ausnahmeaktionen ein (Eskalieren, Stoppen) – **keine reguläre Owner-Freigabe/-Ablehnung/-Rückfrage mehr**; neue Tabelle `work_orders` (Migration 8) mit entsprechend erweitertem Statusmodell (vier weitere Statuswerte bereits für die spätere automatische Agentenübergabe und die spätere echte fachliche Kundenfreigabe eines Ergebnisses vorbereitet, in diesem Schritt unerreichbar), Tenant ausschließlich aus der Session, generisches `404` bei fremder/unbekannter Auftrag-ID; eine vollständige End-to-End-Verifikation des korrigierten Selbstbedienungs-Flusses wurde gegen den echten `server.js#requestHandler` mit isolierter Testdatenbank durchgeführt (zwei echte Mandanten, automatische Statusentscheidung, Owner-Eskalation/-Stopp, Kunden-Storno, keine alten Owner-Prüfrouten mehr); **ausdrücklich noch keine automatische Ausführung, kein Agentenstart, keine Veröffentlichung, kein Billing** – wartet auf Jamals Freigabe
- **V7.2 Phase B – Schutz- und Einwilligungsgrundlage** (vor dem Commit der Self-Service-Korrektur ergänzt) ist umgesetzt, **jedoch noch nicht committed, gepusht oder deployt**: eine verbindliche Business-Use-Policy (`BUSINESS_USE_POLICY.md` – ausschließlich legitime geschäftliche Nutzung, verbotene Nutzung wird blockiert, Grenzfälle eskalieren, schwere/wiederholte Verstöße können bis zu Lizenzentzug führen, jedoch **kein** automatischer endgültiger Lizenzentzug in diesem Schritt); ein kleines, klar begrenztes lokales Safety-Gate (`business-use-policy.js`, `SAFETY_ENFORCEMENT_MODEL.md`) prüft jeden Arbeitsauftrag vor der Speicherung (`ALLOW`/`BLOCK`/`ESCALATE`) – **keine** vollständige KI-Inhaltsmoderation, sondern eine konservative, testbare Vorprüfung; eine additive Migration 9 (`policy_violations`, append-only, niemals der vollständige Auftragstext) mit Schweregraden `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`; bei `CRITICAL` automatischer Sofort-Sessionwiderruf und Markierung zur sofortigen Betreiberprüfung, **keine** automatische Mandanten-/Benutzersperre; ein Avatar- und Persönlichkeitsrechte-Grundsatz (`AVATAR_CONSENT_POLICY.md`: kein realistischer Avatar einer echten Person ohne deren direkte, dokumentierte, widerrufbare Zustimmung; das bestehende `avatarConsentConfirmed`-Feld reicht dafür ausdrücklich **nicht**; Connys Testfall bis Ende August 2026 als Referenz geplant, noch nicht begonnen; Artikel-50-Prüfung vor Veröffentlichung bleibt offener Folgeschritt). Jamal bleibt durchgehend Plattformbetreiber, kein fachlicher Pflichtprüfer normaler Kundenaufträge. **Keine** fertigen AGB, **keine** abgeschlossene juristische Prüfung, **keine** neue Avatar-Funktion, **keine** Agentenausführung, kein Deployment in diesem Schritt – wartet auf Jamals Freigabe
- **V7.2 Phase C Schritt 1** (Kontrollierte Übergabe eines Kundenauftrags an die Agentenzentrale und erstes prüfbares internes Ergebnis) ist umgesetzt und mit **1829** automatisierten Prüfpunkten getestet (1749 + 80 neue, real und zweifach isoliert nachgemessen – eine zwischenzeitliche Fehlbehauptung von 1849 wurde widerlegt und von Jamal korrigiert), **jedoch noch nicht committed, gepusht oder deployt**; ein Auftrag mit Status `READY_FOR_PROCESSING` kann jetzt über eine ausschließlich dem Owner vorbehaltene technische Startaktion (`POST /api/owner/work-orders/:id/run` – „Technischen Agentenlauf starten“, **keine** fachliche Freigabe) an die interne Agentenzentrale übergeben werden; ein Projektmanager-Agent wählt deterministisch aus dem bestehenden kanonischen 25-Agenten-Register bis zu drei Fachagenten und genau einen Qualitätsagenten, arbeitet rein intern/textbasiert (kein externer Provideraufruf, kein Canva, kein HeyGen) und erzeugt ein prüfbares, unveränderliches Ergebnis; ein zweites Safety-Gate greift unmittelbar vor jeder Ausführung (`BLOCK`/`ESCALATE` verhindern den Lauf vollständig); erkennt der Projektmanager eine echte fachliche Lücke, wird der Auftrag `NEEDS_CLARIFICATION` mit konkreter Rückfrage statt eines Ergebnisses; bei einem technischen Fehler bleibt der Auftrag kontrolliert `READY_FOR_PROCESSING` (später erneut startbar) statt fälschlich `RESULT_READY`; der Kunde sieht ein `RESULT_READY`-Ergebnis im Portal ausschließlich zur Ansicht (**noch keine** Freigabe, Änderungsanforderung, Veröffentlichung oder Billing); neue Migration 10 (`work_order_runs`/`work_order_run_agents`/`work_order_results`, alle append-only); keine neue Route auf oberster Ebene (Routenzahlen unverändert: 70 GET/52 POST/8 GET-Prefix/4 POST-Prefix/27 statische Assets) – wartet auf Jamals Freigabe
- **V7.2 Phase C Schritt 2** (Kundenänderungsrunde, Versionierung und echte fachliche Kundenfreigabe) ist umgesetzt und mit **1935** automatisierten Prüfpunkten getestet (Baseline **1829**/65 Testdateien real und zweifach isoliert auf Commit `535e648e6cbe1d8653dc7a31e01b36060626c299` nachgemessen + 48 Prüfpunkte/2 Testdateien aus der Umsetzung + 58 Prüfpunkte/2 dedizierte Testdateien für Freigabe-/Versions-Sicherheit aus dem letzten Qualitätsabgleich vor Commit), **jedoch noch nicht committed, gepusht oder deployt**; der Kunde kann ein `RESULT_READY`-Ergebnis jetzt entweder mit einer konkreten Änderung zurückgeben (`POST .../change-request` – kontrollierter, synchroner Revisionslauf über den unveränderten Orchestrator aus Schritt 1, erzeugt eine neue, unveränderliche Ergebnisversion, ältere Versionen bleiben lesbar unter `GET .../result-versions`) oder fachlich freigeben (`POST .../approve` → `CUSTOMER_APPROVED`); **ausschließlich der Kunde** entscheidet – der Owner hat weder eine Freigabe- noch eine Änderungsanforderungsroute (real geprüft: `owner-work-orders.js` ruft niemals eine schreibende `/approve`- oder `/change-request`-Route auf) und sieht unter `/owner/auftraege` ausschließlich zwei neue, rein lesende Bereiche; drei Safety-Gates sichern Änderungswunsch/Revisionslauf/Ergebnisübernahme ab; neue Migration 11 (`work_order_change_requests`/`work_order_customer_approvals`) erzwingt Idempotenz (höchstens ein aktiver Änderungswunsch je Auftrag, keine doppelte Freigabe derselben Version) und Unveränderlichkeit per Datenbank-Constraint/-Trigger, real gegen die Datenbank verifiziert; eine Kundenfreigabe löst **keine** Veröffentlichung, kein Billing, keine externe Provideraktion aus; keine neue Route auf oberster Ebene (Routenzahlen unverändert: 70 GET/52 POST/8 GET-Prefix/4 POST-Prefix/27 statische Assets) – wartet auf Jamals Freigabe
- **V7.3 – Jamal-Arbeitsmodus** (interne Produktivitäts- und Bedienbarkeitsphase: „Heute arbeiten“ ganz oben im Cockpit, „Oben arbeiten. Unten nachschauen.“) ist umgesetzt und mit **2008** automatisierten Prüfpunkten getestet (Baseline **1935**/69 Testdateien bei Commit `2211db461d6b72ca5c8432d15bb0a8715a3a5c31` + 73 neue Prüfpunkte/3 neue Testdateien), **jedoch noch nicht committed, gepusht oder deployt**; Jamal gibt ausschließlich das gewünschte Ergebnis ein (Projekt/Hinweise/Zeitpunkt optional, keine Agenten-/Tool-/Statuswahl), ein priorisiertes Projekt ist bereits vorausgewählt, der bestehende Projektmanager-Orchestrator strukturiert Ziel/Arbeitsschritte/Agentenauswahl (dieselbe Phase-C-Architektur, dasselbe Safety-Gate, keine zweite Laufarchitektur, kein externer Provider); genau eine primäre Hauptaktion je verständlichem deutschem Status; Rückfragen nur bei echtem fachlichen Bedarf; Jamal entscheidet nur noch `Passt`/`Änderung anfordern`/`Später`/`Stoppen`; der bisherige Tageslauf bleibt vollständig erhalten, jetzt einklappbar unterhalb der neuen Karte; **keine** Kundenportal-Erweiterung, **kein** neuer externer Provider, **keine** Veröffentlichung, **kein** Billing; eine neue GET-Route und ein neuer POST-Aktions-Prefix (71 GET/52 POST/8 GET-Prefix/5 POST-Prefix/28 statische Assets); erste Selbstverbesserungsaufgabe real durchlaufen (Projektmanager-Agent, Content-Agent, QA-Agent, Ergebnis `PASSED`). **Persistenznachtrag (vor Commit-Freigabe geschlossen):** der Arbeitsstand lag zunächst bewusst nur im Prozessspeicher – ein Serverneustart hätte Ergebniswunsch, Status, Rückfrage, Agentenauswahl, Arbeitsplan und alle Ergebnisversionen ersatzlos gelöscht; behoben durch additive **Migration 12** (`jamal_work_items`, `jamal_work_results`, append-only per Trigger) auf der bestehenden `auth-db.js`-SQLite-Schicht plus neuem Übersetzungsmodul `jamal-work-mode-store.js` (kein LocalStorage, keine neue npm-Abhängigkeit, Migrationen 1–11 unverändert); Serverneustart erhält Ergebniswunsch/Status/Rückfrage/Agentenauswahl/Arbeitsplan/alle Ergebnisversionen/`Erledigt`-Status nachweislich (Tests + manuelle Neustart-Abnahme); ehrliche Grenze: keine Cluster-/Mehrbenutzer-Schreibgarantie; mit **2026** automatisierten Prüfpunkten getestet (**73** Testdateien) – wartet auf Jamals Freigabe
- **V7.4 Schritt 1 – Kontrollierte externe Werkzeugnutzung: Canva als erster Produktionskorridor – Offline-/Stub-Grundlage** ist umgesetzt, real mit **2136** automatisierten Prüfpunkten in **76** Testdateien getestet (3 neue Testdateien mit 90 neuen Prüfpunkten; die zuvor dokumentierte V7.3-Baseline nannte 2026/73 – die reale Nachmessung der 73 unveränderten Bestandstestdateien ergibt 2046, eine bereits vor diesem Schritt bestehende Dokumentationsabweichung von 20 Prüfpunkten, unabhängig von den hier vorgenommenen Änderungen), **committed und gepusht** (`f2b0909498a8fe2e552529980586ad68ea9ba722`); ein interner Jamal-Arbeitswunsch (`RESULT_READY`/`DONE`) kann jetzt kontrolliert in einen Canva-Produktionsauftrag übersetzt werden – **ausschließlich für Jamals internen Arbeitsmodus/Owner**, **keine** Kunden-Self-Service-Nutzung, **kein** Kundenzugriff auf Jamals Canva-Konto; die Zentrale prüft die Canva-Eignung mit einer erneuten, eigenständigen Business-Use-Policy-Prüfung (`CANVA_RECOMMENDED`/`CANVA_OPTIONAL`/`CANVA_NOT_SUITABLE`/`CANVA_BLOCKED_BY_POLICY`), erzeugt ein strukturiertes Briefing (Ziel, Zielgruppe, Format, Text, visuelle Richtung „Apple statt Dubai“, Marke, Bildhinweise, Qualitätskriterien) und prüft Bild-/Markenrechte sowie Consent bei realen Personen (`CLEAR`/`UNCLEAR`/`BLOCKED`, `AVATAR_CONSENT_POLICY.md` bleibt verbindlich, `avatarConsentConfirmed` allein gilt ausdrücklich als für Dritte unzureichend) – bei ungeklärten Rechten **kein** Handoff; erst nach Jamals expliziter, serverseitig auditierter Freigabe (`Canva-Produktion starten`, mit vollständiger Vorschau von Auftrag/Format/Text/Bildern/Rechtestatus) startet ein kontrollierter, Stub-/Fixture-fähiger Connectoraufruf; das Ergebnis wird zurückgeführt und von einer deterministischen internen Qualitätsprüfung bewertet (`PASSED`/`PASSED_WITH_NOTES`/`REVISION_REQUIRED`/`BLOCKED`); Jamal entscheidet danach nur noch `Passt` (`ACCEPTED_INTERNAL`) oder `Änderung anfordern` (neue Briefingversion/Revisionsnummer, alte Revision bleibt nachvollziehbar, jeder weitere Lauf braucht erneut eine explizite Freigabe); **keine** automatische Veröffentlichung, **kein** Auto-Post, **kein** Social-Media-Endpunkt, **kein** Billing – `publicationLocked` bleibt strukturell immer `true`; neues additives Datenmodell (**Migration 13**, `jamal_canva_productions`, Migrationen 1–12 unverändert, keine Zugangstoken/Provider-Secrets in der Datenbank); vier neue, bewusst eigenständige Module (`jamal-canva-briefing.js`, `jamal-canva-production-service.js`, `jamal-canva-routes.js`, `jamal-canva-ui.js`), niemals von `jamal-work-mode.js`/`jamal-work-mode-ui.js` referenziert; eine neue GET-Route und sechs neue Aktionen im bestehenden POST-Aktions-Prefix (72 GET/52 POST/8 GET-Prefix/5 POST-Prefix/29 statische Assets); echter Canva-Lauf aus dem Node-Server dieser Cursor-Umgebung heraus **nicht** durchgeführt (kein authentifizierter Canva-Connector-Zugriff aus dieser Umgebung verfügbar) – der Offline-Stub-/Fixture-Korridor ist vollständig fertiggestellt und abgenommen
- **V7.4 – authentifizierter Canva-Abnahmelauf (außerhalb von Cursor, über Jamals ChatGPT-Canva-Integration)** real durchgeführt und dokumentiert (`CANVA_AUTHENTICATED_RUN_ACCEPTANCE.md`): neutraler Testauftrag „Mediterraner Fokus – interner Canva-Abnahmetest", mehrere Vorschau-/Generierungsrunden, genau **ein** dauerhaft übernommenes finales Design (Canva-Design-ID `DAHQkWMxdPo`, Titel „AI Enterprise Headquarters in Twilight", 1 Seite, quadratisches Format), keine Kundendaten, keine reale Person, kein Avatar, keine Veröffentlichung, kein Social-Media-Posting, kein Billing, kein Deployment; Design ist ausdrücklich eine **Arbeitsgrundlage**, kein finales Corporate Design, der sichtbare „Zentrale starten"-Button ist rein visuell und ersetzt nicht den echten Start-Button der Weboberfläche; die automatisierte Rückführung dieses realen Ergebnisses in `jamal_canva_productions` erfolgte **nicht** (manuell dokumentiert statt automatisiert) – **V7.4 ist mit diesem Nachtrag fachlich abgeschlossen**
- **Gesicherter vorheriger Ausgangsstand:** **V6.45.2** / Commit **`fb9aa0d`**
- **Historischer Freeze-Ausgang:** `16bbf45` (V6.43.1) – nur Historie
- **Branch:** `main`
- **Hybrid-Grenzen:** Health-Live-Status nur read-only; Cursor/Codex außerhalb; keine Test-/Git-Schreibprozesse aus der Zentrale; externe Evidenz kein Auto-Fachbefund; Gates nur Entscheidungen
- **Einstiegspunkte:** `README.md` (kurz) und dieses Handbuch (ausführlich)
- **Betrieb:** lokal auf diesem Mac, Daten im Browser, Außenwirkung blockiert

## 2. Was die Zentrale heute kann

- „Heute arbeiten“ ganz oben im Cockpit bedienen: priorisiertes Projekt bestätigen/wechseln, ausschließlich das gewünschte Ergebnis eingeben, internen Agentenlauf mit einer Hauptaktion starten, Rückfrage bei echtem Bedarf beantworten, Ergebnis oben prüfen und `Passt`/`Änderung anfordern`/`Später`/`Stoppen` entscheiden (V7.3, keine externe Aktion)
- Für ein geeignetes internes Ergebnis kontrolliert einen Canva-Produktionsauftrag vorbereiten: Eignung/Rechte prüfen, Briefing ansehen, nach expliziter technischer Freigabe einen Stub-/Fixture-fähigen Canva-Handoff starten, Ergebnis/Qualitätsstatus prüfen, `Passt` oder `Änderung anfordern` (V7.4 Schritt 1, ausschließlich Jamals interner Arbeitsmodus, keine Veröffentlichung, kein Kundenzugriff auf Jamals Canva-Konto)
- Tagesstart mit Fokusprojekt und Ergebniswunsch
- 17 kanonische Projekte und 25 kanonische Agenten anzeigen und nutzen
- Agenten-Einsatzplan und kontrollierte Agenten-Prüfphase führen
- Lokale Datensicherung exportieren und nach Bestätigung wiederherstellen
- Modularisierte Kernbereiche (Tageslauf, Backup, Runtime, Router) nutzen
- Lokalen deterministischen Runtime-Piloten für Health Upgrade Kompass bedienen
- Manuelle Freigabe, Ergebnisannahme, Audit, Reload-Persistenz
- Serverstatus (Port, Version, Commit, Startzeit, Status) kompakt in der Oberfläche anzeigen und den lokalen Betrieb über den separaten Controller `scripts/zentral-ctl.js` verständlich starten/stoppen/neustarten (V7.0 Phase B)
- Isolierte Mock- und Codex-Testausführung vorbereiten, starten, abbrechen und nach Jamal-Freigabe nur in ein Fixture-Repository übernehmen (V7.0 Phase C/D); Mock-Executor ist keine KI, Codex läuft ausschließlich isoliert gegen das Fixture-Repository; Health-Apply und Codex-Start für Health bleiben hart blockiert; Apply ist kein Commit/Push/Deployment
- Read-only V7.0-Freeze-Status anzeigen (`IN_REVIEW`/`FREEZE_CANDIDATE`/`FROZEN`); `FROZEN` entsteht ausschließlich durch die im Quellcode hinterlegte, von Hand eingetragene Jamal-Entscheidung (`v7-freeze-status.js#MANUAL_FREEZE_DECISION`), niemals automatisch aus Git-Stand oder Testzahl (V7.0 Phase E); aktuell zeigt die Zentrale `V7.0 · FROZEN` (Entscheidung vom 25.07.2026, Basis `52ce012`)

## 3. Was die Zentrale bewusst noch nicht kann

- V7.1 Phase A (Projektunterlagen, Werkzeug-/Lizenzregister, Plugin-Gateway) produktiv nutzen, bevor Jamal Commit/Push freigegeben hat – aktuell nur lokal umgesetzt und getestet
- Echte Dateiuploads aus dem Browser entgegennehmen (Phase A bietet ausschließlich Metadaten-/Referenzeingang plus einen isolierten Test-Upload gegen serverseitige Fixture-Dateien)
- Shopify produktiv ausführen (nur vorgemerkt, keine technische Verbindung)
- HeyGen produktiv rendern, extern übertragen, veröffentlichen oder kostenpflichtig nutzen (Phase B/B.1 bereiten ausschließlich ein geprüftes, kontrolliertes Auftragspaket und dessen mandantenfähige Rückführung vor; die tatsächliche Aktion liefe über einen externen Connector erst nach separater Jamal-Freigabe)
- Canva produktiv veröffentlichen, extern für Social Posting freigeben oder Kunden Zugang zum Canva-Konto geben (Phase C bereitet ein geprüftes, kontrolliertes Designauftragspaket und dessen Hand-off vor; der erste reale Pilot – Designkandidaten generieren, einen auswählen, als bearbeitbares Design speichern, kontrolliert intern Textänderungen vornehmen – wurde in Phase C.1 kanonisch abgebildet, `NOT_BILLABLE_TEST`, ohne Veröffentlichung; Brand-Template-/Edit-Transaktion im realen Pilot weiterhin nicht vorgesehen)
- Den neuen Jamal-Canva-Produktionskorridor (V7.4 Schritt 1) für Kunden-Self-Service, `CUSTOMER_ADMIN`/`CUSTOMER_USER`/`SUPPORT`, automatische Produktion oder automatische Veröffentlichung öffnen; ein echter Canva-Connectoraufruf über den **Node-seitigen** Korridor (`jamal-canva-production-service.js#startHandoff`) aus der Cursor-Umgebung heraus ist weiterhin **nicht** möglich (kein authentifizierter Zugriff auf Jamals reale Canva-Verbindung in dieser Umgebung) – der Offline-Stub-/Fixture-Ablauf deckt diesen Node-seitigen Weg vollständig ab; ein realer authentifizierter Canva-Lauf wurde stattdessen **außerhalb** dieses Korridors, über Jamals eigene ChatGPT-Canva-Integration, real durchgeführt und dokumentiert (siehe `CANVA_AUTHENTICATED_RUN_ACCEPTANCE.md`) – die automatisierte Rückführung eines solchen echten Ergebnisses in den Node-Korridor bleibt offen
- eine Kundenfreigabe automatisch als Veröffentlichung werten (Phase C.1/C.1.1: Kundenfreigabe des Entwurfs ist strukturell strikt von Veröffentlichung getrennt; Veröffentlichung bleibt für keine Funktion erreichbar)
- Jamal als verpflichtenden Prüfer jedes Kundenentwurfs behandeln (Phase C.1.1: Standardkunden prüfen nach Agenten-QS selbst; Jamal prüft Eigenprojekte, optionale Premium-Reviews und Risikofälle)
- Mehrsprachige Marktversionen ausliefern (Phase C.1.1 hält nur die Leitplanke fest: DE zuerst; später PT/EN/ES/FR lokalisiert mit eigener QS/Freigabe/Sperre; keine Sprachrouten in dieser Phase)
- Echte Kunden anlegen oder Kunden einen HeyGen-/Canva-Zugang, ein echtes Kundenportal oder eine Veröffentlichungsfreigabe geben (Phase B.1/C/C.1 kennen ausschließlich dieselben zwei neutralen Testmandanten ohne echte Kundendaten)
- Codex oder Mock produktiv gegen Health oder ein anderes echtes Repository ausführen (nur Fixture-Repository)
- Einen V7.0-Freeze auf `FROZEN` selbst setzen (ausschließlich Jamals Entscheidung)
- Produktive Plugins oder Schreib-APIs betreiben
- Automatisches Git, Deployment oder Cloud-Synchronisation
- Mehrbenutzerbetrieb
- Autonome Geschäftsentscheidungen treffen
- Kunden eine Veröffentlichungs- oder Billingfunktion erreichen lassen (Phase C Schritt 1 erlaubt dem Kunden ausschließlich das Anlegen/Verfolgen eines Arbeitsauftrags sowie das Ansehen eines `RESULT_READY`-Ergebnisses im Kundenportal `/portal`; es gibt weiterhin keine Veröffentlichung, kein Billing, keinen externen Provideraufruf, kein Canva, kein HeyGen)
- Support-Mitarbeiter ohne aktiven, noch nicht implementierten Grant auf Kunden- oder Ownerdaten zugreifen lassen (`SUPPORT_GRANT_ONLY` lehnt strukturell mit 404 ab)
- Den OWNER zu einem regulären Pflichtprüfer normaler Kundenprojekte machen (Jamal prüft/genehmigt Marketing-, Design-, Strategie- oder sonstige Kundenaufträge inhaltlich nicht; er greift ausschließlich bei Sicherheit, Missbrauch, rechtlicher Sensibilität, außergewöhnlichen Kosten, technischer Blockade oder expliziter Eskalation über die beiden Ausnahmeaktionen Eskalieren/Stoppen ein; der neue technische Startbutton „Technischen Agentenlauf starten“ aus Phase C Schritt 1 ist ausdrücklich ebenfalls **keine** fachliche Freigabe)
- Einen `READY_FOR_PROCESSING`-Arbeitsauftrag ohne Owner-Startaktion automatisch an einen Agentenlauf übergeben (Phase C Schritt 1 macht die Übergabe technisch möglich, aber ausschließlich über eine kontrollierte Owner-Startaktion, nicht vollautomatisch bei Statuswechsel; ein späterer automatischer Trigger ist architektonisch vorbereitet, aber nicht Teil dieses Schritts)
- Dem Kunden eine Veröffentlichung des Agentenergebnisses ermöglichen (Phase C Schritt 2 macht `CUSTOMER_APPROVED`/`CHANGES_REQUESTED` erstmals real erreichbar – Ergebnisfreigabe und Änderungsanforderung durch den Kunden selbst –, jede Veröffentlichung bleibt jedoch strukturell unerreichbar und ist eine eigene, spätere Phase nach separater Produktentscheidung)
- Dem OWNER eine Freigabe, Ablehnung oder Änderungsanforderung im Namen des Kunden ermöglichen (Phase C Schritt 2: ausschließlich der Kunde entscheidet fachlich; der Owner sieht Änderungswünsche und Ergebnisversionen unter `/owner/auftraege` ausschließlich lesend, ohne jedes Bedienelement)
- Einen Revisionslauf asynchron/im Hintergrund laufen lassen (Phase C Schritt 2: der Revisionslauf ist wie der Erstlauf aus Schritt 1 bewusst synchron innerhalb derselben HTTP-Anfrage)

## 4. Voraussetzungen auf dem Arbeits-Mac

- Node.js für `npm start` / `npm test`
- Projektordner: `/Users/jamal/Documents/New project/ki-unternehmenszentrale`
- Browser (Safari empfohlen) für `http://127.0.0.1:4173/`
- Kein Cloud-Login erforderlich

## 5. Startanleitung

**Empfohlen (Controller, seit Phase B):**

1. Terminal öffnen
2. `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. `npm run central:status` – zeigt, ob bereits ein von der Zentrale verwalteter Server läuft, bevor irgendetwas gestartet wird
4. `npm run central:start`
5. Safari: `http://127.0.0.1:4173/`

**Einfacher Fallback (weiterhin gültig, unverändert):**

1. Terminal öffnen
2. `cd "/Users/jamal/Documents/New project/ki-unternehmenszentrale"`
3. `npm start`
4. Safari: `http://127.0.0.1:4173/`

Der Controller (`scripts/zentral-ctl.js`) ist ein separates lokales Werkzeug und kein Bestandteil des App-Servers selbst; `npm start` bleibt vollständig unverändert nutzbar, ohne Controller-Metadaten zu erzeugen.

## 6. Beenden des Servers

- Bei Start über den Controller: `npm run central:stop` (sendet `SIGTERM`, beendet ausschließlich den zuvor selbst gestarteten Prozess, nie einen fremden Prozess)
- Bei Start über `npm start`: im Server-Terminal **Ctrl + C**
- Keinen parallelen Server auf demselben Port belassen

## 7. Umgang mit Port 4173 und EADDRINUSE

- Standardport: **4173**
- Zuerst `npm run central:status` ausführen – zeigt Status (`RUNNING`, `STOPPED`, `STALE`, `PORT_CONFLICT`, `VERSION_MISMATCH`, `UNKNOWN`), Port, PID, Version, Commit, Startzeit und genau einen sicheren nächsten Schritt
- Bei `PORT_CONFLICT`: der Controller stellt nur fest, dass der Port belegt ist, und **beendet niemals automatisch einen fremden Prozess** – **keinen zweiten Server starten**
- Bei `STALE`: die gespeicherte Statusdatei verweist auf einen nicht mehr laufenden Prozess; der Controller erkennt dies sicher und räumt sie kontrolliert auf, ohne einen echten Prozess zu beenden
- Bei `VERSION_MISMATCH`: ein laufender Server entspricht nicht dem aktuellen Projektstand; empfohlener nächster Schritt ist `npm run central:restart`
- Nur bei Bedarf und nach Prüfung: den bestehenden, tatsächlich eigenen Prozess beenden und einmal neu starten
- Alternativer Port nur ausdrücklich über `npm run central:start -- --port <Portnummer>`; kein automatischer Portwechsel

## 7a. Lokaler Controller `scripts/zentral-ctl.js` (V7.0 Phase B)

- Befehle: `npm run central:status`, `npm run central:start`, `npm run central:stop`, `npm run central:restart`
- Speichert ausschließlich technische Betriebsmetadaten (PID, Port, Startzeit, Projektpfad-Fingerprint, App-Version, Commit bei Start, Controller-Schema-Version) unter `~/Library/Application Support/KI-Unternehmenszentrale/server/` – außerhalb dieses und des Health-Repositories
- Verwaltet ausschließlich selbst gestartete Prozesse; prüft vor `stop`/`restart` PID-Existenz, erwartete Node-Anwendung, Projektpfad und Startnachweis; beendet nie einen fremden Prozess
- Enthält keine Execution Bridge, keinen Executor, keinen Codex-/Agentenstart und keine Browser-Steuerbuttons – rein lokale Terminal-Bedienung

## 8. Browserdaten und localStorage

- Arbeitsdaten liegen lokal im Browser
- Schlüssel u. a.: `ki-unternehmenszentrale-v1`, `ki-unternehmenszentrale-daily-work-runs-v1`
- `schemaVersion: 1` und `schemaVersion: 2` koexistieren; neue Läufe starten mit 2, ohne automatische Migration
- Kanonische Projekt- und Agentenregister werden **nicht** in localStorage kopiert

## 9. Backup-Export

1. Bereich „Lokale Datensicherung“ öffnen
2. „Daten exportieren“
3. JSON-Datei sicher ablegen
4. Vor größeren Änderungen oder Updates immer exportieren

## 10. Backup-Import

1. „Sicherung auswählen“
2. Importvorschau prüfen
3. Import ausdrücklich bestätigen
4. Seite neu laden
5. Kein `localStorage.clear()`, keine fremden Schlüssel

## 11. Tagesarbeitsablauf

1. Fokusprojekt wählen
2. Gewünschtes Ergebnis formulieren
3. Arbeitsvorschlag erstellen und prüfen
4. Agenten-Prüfphase nur bewusst freigeben
5. Bei Health-Pilot: Runtime nur bewusst vorbereiten → freigeben → starten
6. Ergebnis prüfen und bewusst übernehmen oder ablehnen
7. Tageslauf abschließen
8. Backup exportieren

## 12. Health Upgrade Kompass als erster Runtime-Pilot

- Der Runtime-Pilot ist in V1 nur für **Health Upgrade Kompass** verfügbar
- Voraussetzung: gültiger Arbeitsvorschlag, freigegebene Prüfphase, Projektmanager-Arbeitskarte
- Kein bestätigter Befund und kein anderer aktiver Runtime-Versuch

## 13. Projektmanager-Agent und technische ID `orchestrator-agent`

- Sichtbarer Name: **Projektmanager-Agent**
- Kanonische technische ID: **`orchestrator-agent`**
- Mapping nur über `agent-registry.js` – keine zweite Quelle, keine neue ID

## 14. Jamal-Freigaben

- Prüfphase: ausdrückliche Freigabe vor internen Arbeitskarten
- Runtime: Freigabe gilt nur für den lokalen deterministischen Pilot-Executor
- Freigabe allein startet keinen Lauf – Start ist ein eigener Klick

## 15. Ergebnisannahme

- Nach dem Lauf: Ergebnis ist prüfpflichtig
- Arbeitskarte bleibt bis zur bewussten Annahme unverändert
- Annahme nutzt die bestehende manuelle Ergebnisrückführung
- Ablehnung verändert die Arbeitskarte nicht

## 16. Audit-Verlauf

- Append-only Ereignisse (Prepare, Freigabe, Start, Ergebnis, Annahme/Ablehnung, Abbruch, Timeout)
- Standardmäßig geschlossen in der UI
- Keine Secrets oder Stacktraces

## 17. Sicherheitsgrenzen

- `writeOperationsBlocked: true`
- `madeExternalRequest: false`
- Keine automatische externe KI, Plugins, Git, Veröffentlichung, Zahlungen, Verträge, Deployments
- Jamal entscheidet über jede echte Außenwirkung

## 18. Fehler- und Rückfallverfahren

1. Nichts löschen
2. Keinen `git reset` ausführen
3. Fehlermeldung vollständig sichern
4. Letzten funktionierenden Commit und letztes Backup nennen
5. Bei Bedarf aus Backup wiederherstellen und Seite neu laden

## 19. Update- und Versionsregel

- V6.44.0 friert den lokalen V1-Betrieb ein; V6.44.1 synchronisiert nur die Health-Verifizierungsmomentaufnahme
- V6.45.0 bündelt den Finish-Sprint für Führung, Agentenauswahl und Nutzerführung im Tageslauf; Autonomie- und Sicherheitsgrenzen bleiben unverändert
- Kleine Korrekturen nur mit klarer Dokumentation und ohne Autonomieerhöhung
- Neue Executoren, Plugins, Schreib-APIs oder Cloud gehören **nicht** in V1
- Vor jedem Update: Backup exportieren
- V6.45.0 erst nach Browser-Abnahme und ausdrücklichem Commit als verbindlichen Stand behandeln; bis dahin ist es ein lokaler Finish-Kandidat auf Basis von `5602cfa`

## 20. Grenze zwischen V1 und späterer V2

### Zur V1 gehören

- lokaler Tagesstart
- 17 kanonische Projekte
- 25 kanonische Agenten
- Agenten-Einsatzplan
- Agenten-Prüfphase
- lokale Datensicherung
- modularisierte Kernbereiche
- lokaler deterministischer Runtime-Pilot
- manuelle Freigabe und Ergebnisannahme
- Audit, Reload-Persistenz und Backup-Restore

### Nicht zur V1 gehören

- zweiter Executor
- externe KI-Agenten
- produktive Plugins
- Schreib-APIs
- automatisches Git
- Deployment
- Cloud-Synchronisation
- Mehrbenutzerbetrieb
- autonome Geschäftsentscheidungen
