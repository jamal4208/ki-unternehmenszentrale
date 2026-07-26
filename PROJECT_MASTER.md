# PROJECT MASTER

## V7.2 Phase C Schritt 2 – Kundenänderungsrunde, Versionierung und echte fachliche Kundenfreigabe (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Aktiviert die in Migration 8 bereits vorbereiteten, bisher unerreichbaren Statuswerte `CHANGES_REQUESTED`/`CUSTOMER_APPROVED`: der Kunde kann ein `RESULT_READY`-Ergebnis jetzt entweder mit einer konkreten Änderung zurückgeben (kontrollierter, synchroner Revisionslauf über den bestehenden, unveränderten `work-order-agent-orchestrator.js`, neue unveränderliche Ergebnisversion) oder fachlich freigeben (`CUSTOMER_APPROVED`). Verbindliche Produktregel: **ausschließlich der Kunde** entscheidet – Jamal/OWNER hat weder eine Freigabe- noch eine Ablehnungs- noch eine Änderungsanforderungsroute; die Owner-Ansicht bleibt strikt lesend. Eine Kundenfreigabe löst keine Veröffentlichung, kein Billing, keine externe Provideraktion aus.

Neue Servicegrenze (zwei Module, gleiches Muster wie Schritt 1): `work-order-change-service.js` (Änderungswunsch, drei Safety-Gates an den in Auftrag Abschnitt K benannten Punkten, Revisionslauf-Orchestrierung durch Wiederverwendung des bestehenden Orchestrators mit komponierten Eingabefeldern) und `work-order-approval-service.js` (Kundenfreigabe, Idempotenz). Neue Migration 11 (additiv, Migrationen 1–10 unverändert, Migration 10 dabei per Snapshot-Konstante byte-identisch gehalten): `work_order_change_requests` (append-only-artiger Statusfluss `SUBMITTED→IN_PROGRESS→COMPLETED/CANCELLED`, partieller `UNIQUE`-Index verhindert einen zweiten parallelen aktiven Änderungswunsch je Auftrag) und `work_order_customer_approvals` (echt append-only per Trigger, `UNIQUE`-Index auf `resultId` verhindert eine doppelte Freigabe derselben Version) – beide Invarianten real gegen die Datenbank verifiziert.

Keine neue Route auf oberster Ebene: sechs neue Endpunkte hängen ausschließlich in den bestehenden Prefix-Dispatchern (`change-request`, `change-requests`, `approve`, `result-versions` je Kunde/Owner, Owner ausdrücklich ohne Schreibroute). Routenzahlen bleiben exakt unverändert (70 GET/52 POST/8 GET-Präfixe/4 POST-Präfixe/27 statische Assets). Portal erhält Änderungswunsch-Formular, Freigabebutton und eine rein lesende Versionsliste; die Owner-Betriebsübersicht erhält zwei zusätzliche, ausschließlich lesende Bereiche (Änderungswünsche, Ergebnisversionen/Freigabestatus) ohne jedes Bedienelement. Neun neue Audit-Ereignistypen, Metadaten-Allowlist um `resultId`/`resultVersion`/`changeRequestId` erweitert.

Zwei neue Testdateien (`work-order-change.test.js` 36, `work-order-change-ui.test.js` 11 Prüfpunkte), ein zusätzlicher Prüfpunkt in `work-order-result-ui.test.js` (zusammen **+48**). Ausgangsstand real und zweifach isoliert nachgemessen: **1829** Prüfpunkte / 65 Testdateien bei Commit `535e648e6cbe1d8653dc7a31e01b36060626c299` (eine zwischenzeitliche Fehlbehauptung von 1849 wurde durch den realen Testlauf widerlegt und von Jamal korrigiert) → Stand nach Umsetzung C–P **1877** Prüfpunkte / **67** Testdateien. Letzter Qualitätsabgleich vor Commit: zwei weitere dedizierte Testdateien `work-order-approval.test.js` (38 Prüfpunkte) und `work-order-version-security.test.js` (20 Prüfpunkte) ergänzt, um jede im Auftrag benannte Freigabe-/Versions-Sicherheitsgarantie einzeln und direkt nachzuweisen (zusammen **+58**) → finaler Stand **1935** Prüfpunkte / **69** Testdateien. `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert, Routenzahlen unverändert. **Ausdrücklich weiterhin: kein externer Provideraufruf, kein Canva, kein HeyGen, keine Veröffentlichung, kein Billing, kein automatischer Kostenverbrauch, kein asynchroner/im Hintergrund laufender Revisionslauf, keine Owner-Freigabe/-Ablehnung im Namen des Kunden.** Details siehe `CURRENT_STATUS.md`, `API_REGISTER.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase C Schritt 1 – Kontrollierte Übergabe eines Kundenauftrags an die Agentenzentrale und erstes prüfbares internes Ergebnis (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Erste echte Agentenarbeit, weiterhin mit engen Grenzen: ein Auftrag mit Status `READY_FOR_PROCESSING` kann jetzt kontrolliert an die bestehende interne Agentenzentrale übergeben werden. Startlogik (bewusste Architekturentscheidung dieses Schritts): der Lauf startet **ausschließlich** über eine kontrollierte Owner-Aktion (`POST /api/owner/work-orders/:id/run`, Startbutton „Technischen Agentenlauf starten“) statt automatisch bei `READY_FOR_PROCESSING`, weil ein automatischer synchroner Lauf innerhalb von `createForCustomer()` die bestehenden, nicht abzuschwächenden Tests gebrochen hätte, die einen frisch angelegten Auftrag sofort mit `READY_FOR_PROCESSING` erwarten. Der Startbutton bedeutet ausdrücklich **keine** fachliche Freigabe (Jamal beurteilt keinen Auftragstext); dieselbe Servicefunktion (`work-order-execution-service.js#startRunForWorkOrder`, `actorUserId` optional `null`) ist bewusst so geschnitten, dass ein späterer automatischer Trigger sie unverändert wiederverwenden kann.

Neues Laufmodell mit klarer Servicegrenze: `work-order-agent-orchestrator.js` (reine, deterministische Funktion ohne I/O – Agentenauswahl, Arbeitsplan, Rückfrage-/Ergebniserzeugung, Qualitätsprüfung), `work-order-execution-service.js` (Statusübergänge, Idempotenz-/Parallelitätsschutz, zweites Safety-Gate, Persistenz in einer atomaren Transaktion), `work-order-result-service.js` (reine Lese-/Formatierungsschicht für die Kunden-/Owner-Ansicht, ändert nie ein Ergebnis). Der Projektmanager-Agent wählt deterministisch aus dem bestehenden kanonischen 25-Agenten-Register (`agent-registry.js`, um zwei Rollen-Mappings ergänzt) höchstens drei Fachagenten anhand von Stichwortmustern (z. B. Design, Technik) plus genau einen Qualitätsagenten; keine neue Agentenrolle, kein externer Tool-/Provideraufruf, keine Kosten, keine Veröffentlichung. Erkennt der Orchestrator eine echte fachliche Lücke, wird der Auftrag `NEEDS_CLARIFICATION` mit konkreter Rückfrage statt eines Ergebnisses.

Safety-Gate greift jetzt zweimal: einmal beim Auftragseingang (unverändert aus Phase B) und ein zweites Mal unmittelbar vor der Agentenausführung (`work-order-execution-service.js`, Auftrag Abschnitt J). `BLOCK` verhindert den Lauf vollständig (generische Kundenmeldung, kein Run-/Agenten-/Ergebnisdatensatz, Audit); `ESCALATE` setzt den Auftrag direkt auf `ESCALATED` (ebenfalls kein Run, kein Agent, kein Ergebnis) und liefert dem Aufrufer `{ started: false, workOrderStatus: "ESCALATED" }` statt eines Fehlerstatuscodes, weil das kontrollierte Nicht-Starten selbst der korrekte, erwartete Ausgang ist. Bei einem unerwarteten technischen Fehler während der Orchestrierung wird der Lauf `FAILED`, der Auftrag kehrt kontrolliert zu `READY_FOR_PROCESSING` zurück (später erneut startbar) statt fälschlich `RESULT_READY` zu werden – keine stille Teilverarbeitung.

Neue Migration 10 (`work_order_runs`, `work_order_run_agents`, `work_order_results`, alle append-only/ohne UPDATE-Recht per Trigger, Migrationen 1–9 unverändert): Run-Nummern fortlaufend je Auftrag, ein aktiver Lauf (`PREPARED`/`IN_PROGRESS`) blockiert jeden weiteren parallelen Start atomar innerhalb derselben Transaktion, Ergebnisversionen sind unveränderlich (jede spätere Revision erzeugt eine neue Version statt zu überschreiben). Neun neue Audit-Ereignistypen (`WORK_ORDER_RUN_PREPARED/_STARTED/_COMPLETED/_FAILED/_CANCELLED`, `WORK_ORDER_RESULT_CREATED`, `WORK_ORDER_AGENT_SELECTED`, `WORK_ORDER_EXECUTION_BLOCKED_BY_POLICY`, `WORK_ORDER_EXECUTION_ESCALATED_BY_POLICY`), strikte Metadaten-Allowlist (`workOrderId`/`runId`/`agentKey`/`statusTransition`/`reasonCode`/`severity`/`failureCode` – niemals Auftragstext, Ergebnistext, Systemprompts oder Chain-of-Thought).

Der Kunde sieht ein `RESULT_READY`-Ergebnis (`GET /api/portal/work-orders/:id/result`, optional `GET .../run-status`) im Portal ausschließlich zur Ansicht: Titel, Zusammenfassung, vollständiger Text, Qualitätsstatus in deutscher Sprache, offene Punkte, ehrlicher Hinweis, dass Freigabe und Änderungen erst im nächsten Schritt folgen – **keine** Agentenliste, **keine** Freigabe-/Änderungsfunktion, **keine** Veröffentlichungs-/Billing-/Provider-Erwähnung, kein „von Jamal geprüft“. Der Owner sieht unter `/owner/auftraege` zusätzlich eine rein technische Betriebsübersicht (`GET .../runs`, `GET .../runs/:runId`, `POST .../run`): Laufstatus, Run-Nummer, ausgewählte Agenten samt Auswahlgrund, Start-/Endzeit, Fehlercode, Qualitätsstatus – ohne Systemprompts, Chain-of-Thought oder Providerdaten, ohne jede fachliche Freigabefunktion.

Keine neue Route auf oberster Ebene: alle fünf neuen Endpunkte hängen ausschließlich in den bereits bestehenden Prefix-Dispatchern (`dispatchPortalWorkOrdersGetPrefix`/`dispatchOwnerWorkOrdersGetPrefix`/`dispatchOwnerWorkOrdersPostPrefix`); Routenzahlen bleiben exakt unverändert (70 GET/52 POST/8 GET-Präfixe/4 POST-Präfixe/27 statische Assets). Drei neue Testdateien (`work-order-execution.test.js` 33, `work-order-execution-security.test.js` 30, `work-order-result-ui.test.js` 17 Prüfpunkte, zusammen **+80**); Baseline 1749 → aktueller Stand **1829** Prüfpunkte (65 Testdateien). `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. **Ausdrücklich weiterhin: kein externer Provideraufruf, kein Canva, kein HeyGen, keine Veröffentlichung, kein Billing, kein automatischer Kostenverbrauch, keine reguläre Owner-Freigabe, keine echte Kundenfreigabe (`CUSTOMER_APPROVED`/`CHANGES_REQUESTED` bleiben für diesen Schritt unerreichbar).** Nächster Schritt (Phase C Schritt 2, separate Freigabe erforderlich): Kundenänderungsrunde und echte Kundenfreigabe eines Ergebnisses. Details siehe `CURRENT_STATUS.md`, `API_REGISTER.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase B – Schutz- und Einwilligungsgrundlage vor Commit der Self-Service-Korrektur (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Ergänzt vor dem Commit der Self-Service-Korrektur (siehe nächster Abschnitt) drei verbindlich entschiedene, bis dahin nur mündlich/im Auftrag festgehaltene Produktgrundsätze im Repository: **(1) Business-Use-/Safety-Policy** (`BUSINESS_USE_POLICY.md`, technisch: `SAFETY_ENFORCEMENT_MODEL.md`), **(2) Sanktions- und Sperrlogik** (Migration 9, `policy_violations`), **(3) Avatar- und Persönlichkeitsrechte-Grundsatz** (`AVATAR_CONSENT_POLICY.md`). Jamal bleibt durchgehend Plattformbetreiber, kein fachlicher Pflichtprüfer normaler Kundenaufträge – diese Grundsätze verschärfen ausschließlich die Ausnahmefälle (Sicherheit/Missbrauch/rechtliche Sensibilität), nicht den Normalfall.

Neues, klar begrenztes lokales Safety-Gate `business-use-policy.js` (reine Funktion, kein Datenbankzugriff): prüft jeden Arbeitsauftrag (Erstanlage UND erneutes Einreichen) **vor** der Speicherung, noch bevor die automatische Vollständigkeitsregel aus Schritt 1 greift. Ergebnis `ALLOW`/`BLOCK`/`ESCALATE` mit `reasonCode`, `severity` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`) und `policyVersion`. `BLOCK`: Auftrag wird **nicht** gespeichert, generische Kundenmeldung, keine Agenten-/Toolübergabe (es gibt ohnehin keine). `ESCALATE`: Auftrag wird direkt mit Status `ESCALATED` gespeichert, **keine** automatische `READY_FOR_PROCESSING`-Einstufung. Ausdrücklich **keine** vollständige KI-Inhaltsmoderation – ein kleiner, konservativer, regelbasierter Filter für eindeutige Signale; ein späterer modell-/providergestützter Check mit Deny-/Escalate-by-default bei Unsicherheit ist dokumentiert, aber nicht Teil dieses Schritts.

Additive Migration 9 (`policy_violations`, append-only wie `auth_audit_events`, keine Änderung an Migration 1–8; dabei zugleich derselbe Snapshot-Fehler behoben, den Migration 7 bereits gegenüber Migration 5 hatte: Migration 8 referenzierte fälschlich die live wachsende `AUDIT_EVENT_TYPES`-Konstante statt eines eingefrorenen Snapshots – jetzt `AUDIT_EVENT_TYPES_AT_MIGRATION_8`). `policy_violations` speichert ausschließlich `tenantId`/`userId`/`workOrderId` (optional)/`reasonCode`/`severity`/`actionTaken`/`createdAt` – **niemals** den vollständigen Auftragstext. Zwei neue Audit-Ereignistypen (`WORK_ORDER_BLOCKED_BY_POLICY`, `WORK_ORDER_AUTO_ESCALATED_BY_POLICY`), Metadaten-Allowlist um `severity` erweitert (weiterhin kein Freitext). Bei `severity=CRITICAL` (in diesem Schritt ausschließlich die enge Kategorie `CHILD_SAFETY_VIOLATION`) automatischer Sofort-Sessionwiderruf des handelnden Benutzers und Protokollierung als `LICENSE_REVIEW_REQUIRED` (= Markierung zur sofortigen Betreiberprüfung). **Kein** automatischer Lizenzentzug, **keine** automatische Mandanten-/Benutzersperre – das bleibt eine bewusste Betreiberentscheidung von Jamal nach AGB-/Rechtsgrundlage. `AVATAR_CONSENT_POLICY.md` hält fest, dass das bestehende `avatarConsentConfirmed`-Feld (`heygen-job-package.js`, V7.1 Phase B, unverändert) für Drittanbieterfälle ausdrücklich **nicht** ausreicht, und plant Connys Testfall (erste echte Testperson, Bilder/Sprache/Video bis Ende August 2026 vorzubereiten) als Referenz für den eigenen, noch nicht begonnenen Folgebaustein „Avatar Consent & Identity Verification"; die Artikel-50-Kennzeichnungsprüfung vor Veröffentlichung bleibt offen. **Keine neue Avatar-Funktion, keine AGB, keine juristische Prüfung, keine Agentenausführung, kein Deployment in diesem Schritt.** Neue Testdateien `business-use-policy.test.js` (27 Prüfpunkte) und `policy-documentation.test.js` (29 Prüfpunkte); Self-Service-Ausgangsstand 1693 → aktueller Stand **1749** Prüfpunkte (**+56**, 62 Testdateien), Routenzahlen unverändert (70 GET / 52 POST / 8 GET-Präfixe / 4 POST-Präfixe / 27 Assets). Details siehe `CURRENT_STATUS.md`, `SAFETY_ENFORCEMENT_MODEL.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase B Schritt 1 – Erste echte Kundenfachfunktion: Arbeitsauftrag anlegen, prüfen, Status verfolgen (lokal umgesetzt, ungesichert – Commit/Push stehen aus; PRODUKTKORRIGIERT)

**Produktkorrektur (vor jedem Commit/Push vollzogen):** Der OWNER ist kein fachlicher Prüfer der Kundenprojekte und kein regulärer Pflichtschritt im Kundenarbeitsfluss. Die KI-Unternehmenszentrale ist als Self-Service-Agentenzentrale gebaut: Kunde erstellt Auftrag → die Zentrale prüft automatisch Vollständigkeit und Sicherheit → (später: Projektmanager-Agent strukturiert den Auftrag) → bei Bedarf stellt die Zentrale dem Kunden eine Rückfrage → (später: automatische Übergabe an Agenten → Ergebnis an den Kunden → Kunde fordert Änderungen an oder gibt das Ergebnis selbst frei). Jamal (OWNER) prüft und gibt normale Kundenprojekte inhaltlich weder frei noch lehnt er sie ab; er greift ausschließlich bei Sicherheit, Missbrauch, rechtlicher Sensibilität, außergewöhnlichen Kosten, technischer Blockade oder expliziter Eskalation ein.

Erste kundenfachliche Funktion nach Abschluss von Phase A: Kunden (`CUSTOMER_ADMIN`/`CUSTOMER_USER`) legen über `/portal/auftrag-neu` einen Arbeitsauftrag mit vier Feldern an (Titel und gewünschtes Ergebnis Pflicht, Hintergrund und gewünschter Zeitpunkt optional), sehen ihre eigenen Aufträge kompakt auf `/portal` und im Detail unter `/portal/auftrag/:id` (clientseitig als Detailbereich der Portalseite geführt, keine eigene dynamische Route im Server), können einen Auftrag mit offener Rückfrage ergänzt erneut absenden und einen eigenen Auftrag selbst stornieren. Die Zentrale entscheidet **automatisch** (deterministische Vollständigkeitsregel, kein Owner beteiligt) über `READY_FOR_PROCESSING`/`NEEDS_CLARIFICATION`. Der Owner sieht mandantenübergreifend alle Aufträge unter `/owner/auftraege` als reine Betriebsübersicht und trifft **keine** reguläre Freigabe-/Ablehnungs-/Rückfrageentscheidung, sondern erreicht ausschließlich zwei Ausnahmeaktionen (Eskalieren, Stoppen), jeweils mit Pflichtgrund. Neue Tabelle `work_orders` (Migration 8, forward-only, transaktional, idempotent) mit Statusmodell: in Schritt 1 erreichbar `DRAFT → SUBMITTED → READY_FOR_PROCESSING/NEEDS_CLARIFICATION` (automatisch), Kunde `→ CANCELLED` (Storno, außer aus `ESCALATED`), Owner `→ ESCALATED` (Ausnahme) `→ CANCELLED` (Stopp, terminal); vier weitere Statuswerte (`IN_PROGRESS`/`RESULT_READY`/`CHANGES_REQUESTED`/`CUSTOMER_APPROVED`) sind für spätere Schritte vorbereitet, aber unerreichbar. Tenant ausschließlich aus der Session, kein Tenant-/Ersteller-/Statusfeld im Request-Body zulässig (`work-order-service.js#assertKnownFieldsOnly`), fremde oder unbekannte Auftrag-IDs liefern identisch generisches `404` mit Audit (`WORK_ORDER_TENANT_MISMATCH_BLOCKED`). Acht Audit-Ereignistypen (automatische Entscheidungen mit `actorUserId: null`), strikte Metadaten-Allowlist (`workOrderId`, `statusTransition` – niemals Auftragstext/Owner-Grund). Neue Routen: 5 Kunden- (`GET/POST /api/portal/work-orders`, `GET /api/portal/work-orders/:id`, `POST /api/portal/work-orders/:id/resubmit`, `POST /api/portal/work-orders/:id/cancel`) und 4 Owner-Routen (`GET /api/owner/work-orders`, `GET /api/owner/work-orders/:id`, `POST /api/owner/work-orders/:id/escalate`, `POST /api/owner/work-orders/:id/stop`), alle mit CSRF/Origin-/Content-Type-Prüfung, Known-fields-Allowlist, `Cache-Control: no-store`; **keine** `/approve`/`/reject`/`/request-clarification`-Route mehr. Additiv +2 GET-Routen (70 GET insgesamt), +1 POST-Route (52 POST insgesamt), +2 GET-Präfixe/+2 POST-Präfixe (8/4 insgesamt), +4 statische Assets (27 insgesamt), +3 neue Testdateien (`work-order-routes.test.js`, `work-order-security.test.js`, `work-order-ui.test.js`, zusammen +96 Prüfpunkte inkl. Produktkorrektur). Realer, reproduzierbarer Baseline-Vergleich: Baseline-Commit `be9848afc06c26dc056b33811dc2560e56696b5a` liefert 1597 Prüfpunkte, aktueller (produktkorrigierter) Stand 1693 Prüfpunkte (**+96**). `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. End-to-End-Verifikation des Selbstbedienungs-Flusses (Anlegen → automatische Entscheidung → Rückfrage/Ergänzung → erneute automatische Entscheidung → Owner-Eskalation/-Stopp bei Ausnahmefällen → Kunden-Storno, zwei echte Mandanten, Mandantentrennung, keine alten Owner-Prüfrouten mehr) vollständig gegen den echten `server.js#requestHandler` mit isolierter Testdatenbank bestanden. **Noch keine automatische Ausführung, kein Agentenstart, keine Toolauswahl, keine Veröffentlichung, kein Billing.** **Kein Commit, kein Push, kein Deployment, keine Mehrsprachigkeit, keine neue npm-Abhängigkeit.** Nächste Phase erst nach separater Produktentscheidung: kontrollierte, automatische Übergabe eines `READY_FOR_PROCESSING`-Auftrags an einen Agentenlauf, danach echte fachliche Kundenfreigabe des Ergebnisses (nicht des Owners). Details siehe `CURRENT_STATUS.md`, `API_REGISTER.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase A Schritt 4 – Betriebs-, Sicherheits- und Produktabnahme der Portalbasis (geprüft, lokal korrigiert, ungesichert – Commit/Push stehen aus)

Gesamtabnahme der Portalbasis aus Schritt 1–3 (kein neuer Produktfunktions-Sprint). Ein echter Sicherheitsbefund gefunden und behoben: Owner-Benutzeraktionsrouten adressierten ohne Rollenprüfung auch fremde OWNER-/SUPPORT-IDs, jetzt generisch `404` (`owner-admin-service.js#findCustomerUserOrThrow`, mit Regressionstest). Drei neue Akzeptanztestdateien (`portal-security-acceptance.test.js`, `portal-operations-acceptance.test.js`, `portal-usability-acceptance.test.js`, zusammen +62 Prüfpunkte, 0 neue Routen). Vollständige manuelle End-to-End-Abnahme mit zwei echten, isolierten Testservern (Dev/Prod) und zwei Mandanten real durchlaufen (33/33 Schritte grün), Testserver danach gezielt beendet. Gesamt **1597 automatisierte Prüfpunkte grün** (57 Testdateien, `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert). Dokumentierte, bewusste Restlücken ohne akute Sicherheitsrelevanz: In-Memory-Ratenlimiter, fehlender Backupweg/-verschlüsselung für die Server-Auth-Datenbank, offenes Löschkonzept/Datenschutztext. **Phase-A-Urteil: mit klar benannten Restgrenzen abgenommen und commitbereit.** **Kein Commit, kein Push, kein Deployment, keine Veröffentlichung, keine Fachaufträge, kein Billing, keine Phase B.** Vollständiger Bericht: `V7_2_PHASE_A_ACCEPTANCE.md`.

## V7.2 Phase A Schritt 3 – Deutsches Kundenportal und Owner-Verwaltung (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Baut additiv auf V7.2 Phase A Schritt 2 auf und liefert die erste kundensichtbare Oberfläche: Jamal kann als Owner über eine neue Verwaltungsseite (`/owner/kunden`) Mandanten aktivieren/suspendieren und Benutzer einladen/sperren/reaktivieren/Sitzungen widerrufen (`owner-admin-service.js`/`owner-admin-routes.js`); eingeladene Kunden aktivieren ihr Konto über einen Einladungslink, melden sich an und sehen ausschließlich ihre eigene, schlichte Portalstartseite (`/portal`) mit sechs dokumentierten Konto-/Sitzungsfeldern und einem ehrlichen Bereitschaftsstatus (`customer-portal-service.js`/`customer-portal-routes.js`) – ausdrücklich noch ohne Fachaufträge, Werkzeuge oder Veröffentlichung. Jede neue Route und jedes neue statische Asset ist einer expliziten Zugriffsklasse zugeordnet (neue Klasse `STATIC_AUTHENTICATED_PORTAL` ergänzt die bestehende kanonische Policy); die bestehende Owner-/Customer-Trennung aus Schritt 2 bleibt unverändert die alleinige Sicherheitsgrenze. Additiv +3 GET-Routen (68 GET insgesamt, weiterhin 51 POST – Owner-Aktionen laufen über zwei neue POST-Präfixrouten), +3 neue Testdateien. Realer, reproduzierbarer Baseline-Vergleich: Baseline-Commit `41b6dbc602f9fd4f5e91099492cc08be72b0014c` liefert 1450 Prüfpunkte, aktueller Stand 1535 Prüfpunkte (**+85**). `npm run check`/`npm test` Exit 0, `npm audit`: 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert. Manuelle Dev- und Prod-Abnahme mit zwei isolierten Testservern (kompletter Owner→Einladung→Kunden-Login→Portal→Logout-Fluss, inkl. Prod-Cookie-Flags und fehlendem Dev-Bypass) bestanden. **Kein Commit, kein Push, kein Deployment, keine Veröffentlichung, keine Fachaufträge, kein Billing, kein echter Mailversand, keine Mehrsprachigkeit, keine Phase B.** Details siehe `CURRENT_STATUS.md`, `API_REGISTER.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase A Schritt 2 – Route-Gates, Auth-Routen und Owner-/Customer-Trennung (lokal umgesetzt, ungesichert – Commit/Push stehen aus)

Setzt eine vollständige, serverseitige Authentifizierungs- und Autorisierungsgrenze vor alle vorhandenen und neuen Routen: eine kanonische Zugriffspolitik (`route-access-policy.js`) klassifiziert jede Route/jedes Asset, ein zentraler Auth-Route-Guard wertet Modus, Session, Rolle und Mandant vor jedem Handler aus, und sechs neue `/api/auth/*`-Routen (Login/Logout/Sessionstatus/Passwort-Reset/Einladung) machen echtes Anmelden möglich. Im Produktivmodus sind alle bestehenden Chef-Routen und -Assets nur mit Owner-Session erreichbar, Execution-Routen sind zusätzlich vollständig deaktiviert, und jede unklassifizierte Route liefert fail-closed 404. Der lokale Entwicklungsmodus bleibt für Jamals tägliche Arbeit auf Loopback kontrolliert kompatibel (sichtbare Konsolenwarnung), Kunden-/Mandantengrenzen gelten aber auch dort unverändert. Tenant-Herkunft kommt ausschließlich aus der Session, niemals aus Browserparametern; ein abweichender Tenantparameter liefert 404 und wird auditiert. Baut auf V7.2 Phase A Schritt 1 (Commit `e2cd018`) auf. 65 GET / 51 POST, 1450 automatisierte Prüfpunkte grün (51 Testdateien), `npm audit`: 0 Schwachstellen. **Kein Commit, kein Push, kein Deployment, keine Veröffentlichung, kein Kundenportal-UI, keine Phase B.** Details siehe `CURRENT_STATUS.md`, `API_REGISTER.md` und `MIGRATION_PLAN.md`.

## V7.2 Phase A Schritt 1 – Auth-Kern und persistente Identitätsschicht (umgesetzt, getestet und gesichert mit Commit `e2cd018`)

Legt die Datengrundlage für die Zugriffsgrenze: eine vollständig hinter `auth-db.js` gekapselte `auth.sqlite` (6 nummerierte Migrationen, Tabellen `tenants`/`users`/`sessions`/`password_reset_tokens`/`auth_audit_events`), Passwort-Hashing über `crypto.scrypt`, 256-Bit-Sessiontokens (nur gehasht gespeichert, 12h absolute/60min Idle-Lebensdauer, max. 5 aktive Sessions je Nutzer) und eine Projektion der kanonischen Mandantenwahrheit (`agency-tenant-registry.js`) in die Auth-Datenbank (startet `SUSPENDED`, unbekannte DB-Mandanten fail-closed). Noch keine Route-Gates, kein Login. `better-sqlite3@13.0.1` exakt gepinnt, `npm audit`: 0 Schwachstellen. Details siehe `CURRENT_STATUS.md`.

## V7.1 Phase C.1.1 – Reviewmodell skalierbar und rollenbasiert korrigiert (umgesetzt, getestet und gemeinsam mit Phase C.1 gesichert mit Commit `6621d93`)

Produktkorrektur: Jamal darf im späteren Kundenbetrieb nicht zum verpflichtenden Prüf-/Freigabeengpass werden. Die Unternehmenszentrale unterscheidet jetzt skalierbar Eigenprojekt (`OWNER_REVIEW`), Standardkunde (`CUSTOMER_SELF_REVIEW` nach Agenten-QS), Premiumkunde (`PREMIUM_INTERNAL_REVIEW` mit optionalem menschlichem Review) und Risikofall (`RISK_ESCALATION`). Agenten-QS ist eine echte eigene Prüfstufe (`PASS`/`PASS_WITH_NOTES`/`FAIL`/`ESCALATE`). Der Café-Amore-Pilot bleibt `INTERNAL`/`OWNER_REVIEW`; Jamals bestehendes Review bleibt unverfälscht. Kundenfreigabe ist weiterhin keine Veröffentlichung. Mehrsprachigkeit ist nur als Leitplanke dokumentiert (DE zuerst; später PT/EN/ES/FR lokalisiert mit eigener QS/Freigabe/Sperre) – nicht implementiert. +3 POST-Routen, zum Zeitpunkt dieses Commits 64 GET / 46 POST. **Committed und gepusht mit Commit `6621d93`. Ausdrücklich weiterhin kein Deployment, keine Veröffentlichung, keine neue Canva-Aktion, keine Phase D.** Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`.

## V7.1 Phase C.1 – realen Canva-Pilot kanonisch abgeschlossen und Kundenfeedback-Schleife vorbereitet (umgesetzt, getestet und gemeinsam mit Phase C.1.1 gesichert mit Commit `6621d93`)

V7.1 Phase C.1 baut additiv auf dem bereits committeten und gepushten V7.1 Phase C (Commit `52b2d02`) auf und bildet den ersten realen, außerhalb des lokalen Servers über den verbundenen Canva-Connector durchgeführten Canva-Pilot kanonisch und revisionssicher ab: ein fiktiver Testkunde, Marke „Café Amore“, Instagram-Post „Sonntagsfrühstück“, zwei Generierungsläufe à vier Kandidaten, Jamals Kandidatenauswahl, Umwandlung in ein echtes bearbeitbares Canva-Design (Design-ID `DAHQeIjc2ls`, 1 Seite, `NOT_BILLABLE_TEST`), internes Review mit Jamals fachlichem Feedback und bereits kontrolliert vorgenommenen Textänderungen (Zeitangabe größer/fett, neue untere Botschaft, Platzhalter-Webadresse entfernt). Ein neues kanonisches Datenmodell (`canva-pilot-result-record.js`) und eine isolierte Ablage (`canva-pilot-store.js`) trennen strikt Kandidat, Design-ID, Kundenentwurf, Kundenfreigabe und Veröffentlichung; eine kontrollierte Kundenfeedback-Schleife (`READY_FOR_CUSTOMER_REVIEW → CUSTOMER_CHANGES_REQUESTED → READY_FOR_REVIEW_AFTER_CHANGES → CUSTOMER_APPROVED`) ist vorbereitet, aber nur mit echter Design-ID, vollständiger Mandantenbindung und abgeschlossenem internem Review erreichbar. Veröffentlichung bleibt strukturell `NOT_APPROVED` und für keine Funktion dieses Datenmodells erreichbar. Additiv 1 neue GET-Route und 5 neue POST-Routen sowie ein neuer Chef-Modus-UI-Bereich „Canva-Pilot-Ergebnisakte“ mit Kundenfeedback-Aktionen (keine Veröffentlichungs-/Social-/Einladungs-/Credits-/Löschen-Buttons); Backup additiv um sichere Pilot-Metadaten erweitert, ohne Medien/Tokens/URLs; Restore löst keine externe Aktion aus. Zum Zeitpunkt dieses Commits mit 1254 automatisierten Prüfpunkten grün getestet (`npm test`, 46 Testdateien; `npm run check`; `git diff --check` sauber). **Committed und gepusht mit Commit `6621d93` (gemeinsam mit Phase C.1.1). Ausdrücklich weiterhin kein Deployment, keine Veröffentlichung, keine neue externe Canva-Aktion, kein Shopify, keine Phase D.** V7.0 bleibt `FROZEN`, V7.1 Phase A/B/B.1/C bleiben unverändert und gesichert. Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`.

## V7.1 Phase C – Canva als zweiter kontrollierter Design-Connector (umgesetzt, getestet und gesichert mit Commit `52b2d02`)

V7.1 Phase C bindet Canva – nach demselben Architekturmuster wie HeyGen (Phase B) – als zweiten echten, kontrollierten Medien-Connector an (`CONTROLLED_CONNECTOR_HANDOFF`): Die Zentrale erstellt ein validiertes `canvaDesignJobPackage` (Designbriefing, Marken-/Assetrechte, Datenklassifizierung, Kunde-/Marke-/Kampagnenbindung), prüft es gegen die bestehende Testmandantenbasis und sieben getrennte Freigabestufen (Briefing, Assets/Rechte, externe Übertragung, Kostenrahmen, Canva-Übergabe, Designkandidat-Auswahl, Edit-/Speichervorschau) und erzeugt danach ein minimales Hand-off-Payload. Die tatsächliche Canva-Aktion läuft – falls überhaupt – über einen vorhandenen, authentifizierten Canva-Connector außerhalb dieses lokalen Servers, ausschließlich nach separater Jamal-Freigabe. Kein API-Key wird gespeichert, kein echtes Canva-Design wurde im Umsetzungsauftrag selbst erstellt, keine Veröffentlichung, kein automatischer Start. Die Kandidaten- und Editing-Transaktionslogik ist korrekt gespiegelt (Kandidat ≠ Design, Vorschau ≠ gespeichert, gespeichert ≠ veröffentlicht) und vollständig getestet, aber im ersten realen Pilot ausschließlich auf `GENERATE_DESIGN_CANDIDATES`/`CREATE_SELECTED_CANDIDATE` begrenzt. Lokal read-only auditiert, mit 1165 automatisierten Prüfpunkten grün getestet (`npm test`, 43 Testdateien; `npm run check`), Trockenlauf und Browser-/Mobile-Abnahme gegen einen eigenen isolierten Testserver bestanden. **Committed und gepusht mit Commit `52b2d02` (HEAD und `origin/main`), weiterhin kein Deployment.** V7.0 bleibt `FROZEN` (Basis `52ce012`), V7.1 Phase A (`59f985f`)/B (`ff43089`)/B.1 (`37e8a28`) bleiben unverändert; HeyGen und Shopify sind von Phase C unberührt. Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`. Der erste reale Canva-Pilot wurde danach außerhalb des lokalen Servers durchgeführt und ist in Phase C.1 kanonisch abgebildet (siehe oben).

## V7.1 Phase B.1 – HeyGen-Pilot abgeschlossen, Agenturbetrieb mandantenfähig vorbereitet (umgesetzt, getestet und gesichert mit Commit `37e8a28`)

V7.1 Phase B.1 schließt den bereits extern erfolgreich ausgeführten ersten realen HeyGen-Pilot strukturiert ab (kanonisches Pilot-Review, `heygen-pilot-review.js`) und bereitet additiv die sichere, mandantenfähige Grundlage für einen späteren Marketing-Agenturbetrieb vor: eine kleine kanonische Mandantenbasis (`agency-tenant-registry.js`, zwei neutrale Testkunden mit Marken und Kampagnen, keine echten Kundendaten), verpflichtende Kunden-/Marken-/Kampagnenbindung auf jedem HeyGen-Jobpaket, eine fünfte, getrennte Freigabestufe (Kundenentwurf), Kosten-/Paketzuordnung ohne automatische Abrechnung, eine Ergebnisrückführungs-Statuskette (`heygen-result-lifecycle.js`) vom Providererfolg über internes Qualitätsreview bis zur getrennten Kundenfreigabe (Veröffentlichung bleibt strukturell unerreichbar) sowie ein additives Agentur-Backup (`agency-backup.js`) ausschließlich für Mandanten-/Pilot-Metadaten. Kunden erhalten zu keinem Zeitpunkt Zugang zum persönlichen oder zentralen HeyGen-Konto; der HeyGen-Connector bleibt `CONTROLLED_HANDOFF`, nicht kundenbedienbar, nicht öffentlich erreichbar. In dieser Phase wurde kein weiteres echtes Video erzeugt, keine externe Übertragung ausgelöst und nichts veröffentlicht. Mit 929 automatisierten Prüfpunkten grün getestet (`npm test`, 35 Testdateien; `npm run check`), Trockenlauf und Browser-/Mobile-Abnahme gegen einen eigenen isolierten Testserver bestanden. **Committed und gepusht mit Commit `37e8a28` (HEAD und `origin/main`), weiterhin kein Deployment.** V7.0 bleibt `FROZEN`, V7.1 Phase A und Phase B bleiben unverändert. Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`.

## V7.1 Phase B – HeyGen als erster kontrollierter Medien-Connector (umgesetzt, getestet und gesichert mit Commit `ff43089`)

V7.1 Phase B bereitet HeyGen als ersten echten, kontrollierten Medien-Connector vor (`CONTROLLED_CONNECTOR_HANDOFF`): Die Zentrale erkennt HeyGen fachlich, prüft Datenklassifizierung, externe Übertragung, Veröffentlichungsrecht, Avatar-/Stimmrechte, Kostenrahmen und Verbindungsmodus, und erstellt danach ein validiertes, kopier- bzw. connectorfähiges Auftragspaket. Die tatsächliche HeyGen-Aktion läuft – falls überhaupt – über den vorhandenen, authentifizierten HeyGen-Connector außerhalb dieses lokalen Servers, ausschließlich nach separater Jamal-Freigabe. Kein API-Key wird gespeichert, keine Veröffentlichung, kein automatischer Renderlauf. Lokal read-only auditiert, mit 816 automatisierten Prüfpunkten grün getestet, Trockenlauf und Browser-/Mobile-Abnahme gegen einen eigenen isolierten Testserver bestanden. **Committed und gepusht mit Commit `ff43089`, weiterhin kein Deployment.** V7.0 bleibt `FROZEN`, V7.1 Phase A bleibt unverändert. Details siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`.

## V7.1 Phase A – umgesetzt, getestet und gesichert mit Commit `59f985f`

V7.1 Phase A („Dokumenten- und Wissenseingang, Werkzeug-/Lizenzregister und sicheres Plugin-Gateway-Fundament") ist lokal vollständig umgesetzt, read-only auditiert gegen den ursprünglichen Auftrag und mit 661 automatisierten Prüfpunkten grün getestet (Browser-/Mobile-Abnahme zusätzlich manuell durchgeführt, siehe `CURRENT_STATUS.md`). Nach der ersten manuellen Safari-Abnahme wurden zwei gemeldete Abschlussfehler (Checkbox-Layout im Tool-Routing-Formular; nicht strukturierte Blockierungsantwort bei „kein Werkzeug erfunden") mit der kleinstmöglichen Korrektur behoben, siehe `MIGRATION_PLAN.md`. **Committed und gepusht mit Commit `59f985f`, weiterhin kein Deployment.** V7.0 bleibt unverändert `FROZEN` auf `15ce8bb`. Details, Dateiliste und Testergebnisse siehe `CURRENT_STATUS.md` und `MIGRATION_PLAN.md`.

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
