# PROJECT FINISH PORTFOLIO

Stand: 2026-07-27 · Lauf V7.6.2 · ausschließlich lesende Untersuchung, keine Code-/Teständerung, kein Commit, kein Push.

Dieses Dokument erfasst alle im Ordner `/Users/jamal/Documents/New project` gefundenen eigenen Softwareprojekte, bewertet ihren tatsächlichen Fertigstellungsstand nach einer einheitlichen Reifegradlogik und legt eine begründete Abschlussreihenfolge fest. Grundsatz: **erst eigene Projekte fertigstellen und die Unternehmenszentrale daran beweisen, danach zunächst die Marketingagentur verkaufen.**

Alle Prozentangaben sind **Schätzbereiche mit Begründung**, keine exakten Messwerte. Wo lokal keine sichere Aussage möglich ist, steht `NICHT LOKAL VERIFIZIERBAR`, `UNGEKLÄRT` oder `ENTSCHEIDUNG DURCH JAMAL ERFORDERLICH`.

## 0. Verbindliche Reifegradskala

`BLOCKED` · `FOUNDATION` · `FUNCTIONAL_INCOMPLETE` · `INTERNAL_PILOT_READY` · `REFERENCE_READY` · `SELLABLE_PILOT_READY` · `PRODUCTION_READY`

## 1. Kurzübersicht: alle aufgenommenen Projekte

| # | Projekt | Pfad (unter `New project/`) | Git | Reifegrad | Fertigstellung (Bereich) | Reststunden (Bandbreite) |
|---|---|---|---|---|---|---|
| A | KI-Unternehmenszentrale | `ki-unternehmenszentrale` | ja (`main`, `5b59b17`, sauber) | INTERNAL_PILOT_READY (Orchestrierungsschicht, kein Endkundenprodukt) | 70–85 % als internes Steuerungswerkzeug | laufend, kein Abschlussdatum sinnvoll |
| B | Health Upgrade Kompass | `health-upgrade-kompass` | ja (`work/check-start-gate-2026-07-19`, `395bf9e`, **dirty**) | INTERNAL_PILOT_READY | 55–70 % Richtung `REFERENCE_READY` | 60–110 h |
| D | Expansion App / Export-Modul | `health-upgrade-kompass` (gleicher Ordner, `src/views/expansionCockpitView.js`, `src/views/exportView.js` u. a.) | ja (gleiches Repo wie B) | FUNCTIONAL_INCOMPLETE | 35–50 % | 80–150 h, zusätzlich externe Rechts-/Regulatorikprüfung |
| C | Marketing Agentur OS | `marketing-agentur` | nein | INTERNAL_PILOT_READY (intern), FUNCTIONAL_INCOMPLETE (Richtung Verkauf) | 45–60 % Richtung `SELLABLE_PILOT_READY` | 70–130 h |
| E1 | Health Upgrade Karriere | `health-upgrade-karriere` | nein | FOUNDATION | 30–45 % | 25–50 h |
| E2 | proWIN Karriere | `prowin-karriere` | nein | FUNCTIONAL_INCOMPLETE | 45–60 % | 20–40 h |
| E3 | Portugiesisch-Sprechtrainer (FlowLingo-Bezug ungeklärt) | `portugiesisch-sprechtrainer` | nein | FUNCTIONAL_INCOMPLETE | 55–70 % | 40–90 h (v. a. echter Hörtest/PT-PT-Feedback) |
| E4 | Spanisch-Sprechtrainer | `spanisch-sprechtrainer` | nein | FOUNDATION/FUNCTIONAL_INCOMPLETE | 35–50 % | 40–80 h |
| E5 | Sports Portfolio Manager | `sports-portfolio-manager` | nein (kein `.git`, per Subagenten-Nachprüfung bestätigt) | FUNCTIONAL_INCOMPLETE | 40–55 % | 40–80 h |
| E6 | private-market-intelligence-bot | `private-market-intelligence-bot` | nein (kein `.git`, per Subagenten-Nachprüfung bestätigt) | FUNCTIONAL_INCOMPLETE | 30–45 % | 60–120 h |
| E7 | JACO GbR Webseite | `jaco-gbr-webseite` | nein | FOUNDATION | 40–55 % | 15–30 h (v. a. rechtliche Prüfung) |
| E8 | Senior Designer OS | `senior-designer-os` | nein | FOUNDATION (Wissensbasis, kein App-Code) | UNGEKLÄRT, da kein Softwareprodukt | ENTSCHEIDUNG DURCH JAMAL ERFORDERLICH (Projekt/Modul/Methode) |
| E9 | Autopilot-Light-System | `autopilot-light-system` | nein | FOUNDATION (Methode/Werkzeug, kein Produkt) | UNGEKLÄRT, da kein Softwareprodukt | ENTSCHEIDUNG DURCH JAMAL ERFORDERLICH (Projekt/Modul/Methode) |

**Genau eine Ausnahme von „keine Prozentzahl ohne Begründung“ gibt es nicht** – jede Zahl ist im Detailabschnitt unten begründet.

## 2. Detailprofile

### A. KI-Unternehmenszentrale

- Git: `main`, HEAD/`origin/main` `5b59b177d8a5e36982cd7fafb9d6f239a7fb7d79`, Working Tree sauber, kein Stash.
- Letzter Meilenstein: V7.6.1 (Apple-first/Google-controlled Office-/Finance-Korridor offline vorbereitet), committed und gepusht.
- Zweck: zentrale Steuerungs-, Führungs- und Nachweisplattform für alle eigenen Projekte und 25 kanonische Agenten.
- Zielgruppe: ausschließlich Jamal (Owner-Betrieb, kein Kundenzugang zu dieser Schicht selbst).
- Nutzerfluss: Cockpit → „Heute arbeiten" → Agentenlauf → Ergebnis → Freigabe/Änderung.
- Hauptfunktionen: Agentenorganisation, tägliches HR-Coaching, Technologie-Radar, Jamal-Arbeitsmodus, Canva-/HeyGen-Korridore, Kundenportal-Grundlage, Office-/Finance-Vorbereitung.
- Tests: 83 Testdateien, laut `CURRENT_STATUS.md` **2384** Prüfpunkte (Auftragstext nennt **2386** als Ausgangsstand – kleine Diskrepanz von 2 Prüfpunkten zwischen Auftrag und zuletzt dokumentiertem Stand; in diesem read-only Lauf **nicht** neu gezählt, da nur Dokumentation verändert werden darf – ehrlich gekennzeichnet, nicht korrigiert).
- Dokumentationsqualität: sehr hoch (durchgängige `CURRENT_STATUS.md`/`PROJECT_MASTER.md`/`MIGRATION_PLAN.md`-Historie je Version).
- Offene Aufgaben: keine Google-/Apple-Anmeldung, kein OAuth, Finance/Controlling bleibt `CAPABILITY_GAP`.
- Reifegrad: **INTERNAL_PILOT_READY** als Orchestrierungsschicht (kein eigenständiges Verkaufsprodukt, daher keine `SELLABLE_PILOT_READY`-Einstufung sinnvoll).
- Nutzen als Testfall: **ist selbst der Testrahmen**, nicht das Testobjekt – siehe `INTERNAL_PROJECT_REFERENCE_PLAN.md`.

### B. Health Upgrade Kompass

- Pfad: `health-upgrade-kompass`, Git-Repo, Branch `work/check-start-gate-2026-07-19`, HEAD `395bf9e01f26d63dc4cc0bbc8343d10535c1ad64`, `origin` gleich.
- Working Tree: **dirty** – `M package.json`, unversioniert `src/logic/mockScaleAdapter.js`, `src/logic/scaleSnapshot.js`, `src/logic/scaleSnapshot.test.js` (bereits vor diesem Lauf so bestehend, in diesem Lauf **nicht verändert**).
- Zweck: mobile-first MVP für Homepartys, Kundenbindung, Beraterinnen-Follow-up im Health-Upgrade-Kontext.
- Zielgruppe: Gäste/Kundinnen einer Homeparty, Beraterinnen, Health-Upgrade-Admin.
- Produktversprechen: „Die Party ist der Einstieg. Die App bleibt beim Kunden."
- Nutzerfluss: Gast-Start → Upgrade-Check (Minimum 6 von ca. 20–25 Antworten für ein erstes Ergebnis) → Ergebnis-Kompass → Kundenbereich/Beraterübergabe → Berater-Dashboard/Admin.
- Hauptfunktionen: Check-Logik mit Balance-Waage, Ergebnis-Kompass, Produkt-Routine-Ideen, Kunden-/Berater-/Adminbereich, lokaler Offline-Check (`python3 scripts/check-local.py`).
- Tests: 6 Testdateien (`checkScoring`, `exportReadiness`, `consentPersistence`, `date`, `checkView`, `scaleSnapshot`), Testbefehl in `package.json` bereits um `scaleSnapshot.test.js` ergänzt (Teil des dirty Standes).
- Dokumentationsqualität: sehr hoch (README, ROADMAP, `docs/MVP_STATUS_AUDIT.md`, `docs/UX_AUDIT.md`, `WAAGE_V1_ANSCHLUSSKONZEPT.md`).
- Offene Baustellen (laut eigener Dokumentation): echte QR-Erzeugung, echte Nachrichten-/Shop-/WhatsApp-Anbindung, Authentifizierung/Rollenrechte, Datenbank/Consent-Versionierung/Audit-Log, finale rechtliche/fachliche Freigabe, Datenschutz/Impressum, mobile QA auf echten Geräten.
- Reifegrad: **INTERNAL_PILOT_READY**, Richtung `REFERENCE_READY` – Details in `HEALTH_REFERENCE_FINISH_PLAN.md`.

### D. Expansion App / Export-Modul (Health Upgrade Expansion App)

- Technischer Ort: **derselbe Ordner/Repository** wie Health Upgrade Kompass (`docs/app-abgrenzung-health-kompass-vs-expansion.md` bestätigt dies ausdrücklich als bewusste, vorerst nur kommunikative Trennung – keine technische Zweitarchitektur).
- Quellcode: `src/views/expansionCockpitView.js`, `src/views/exportView.js`, `src/data/exportProductProfiles.js`, `exportCountryProfiles.js`, `exportRulePacks.js`, `exportSourceRegistry.js`, `src/logic/exportReadiness.js` (+ `exportReadiness.test.js`).
- Zweck: interne Geschäftsführer-/Backoffice-App für Länderprüfung, Export-Bereitschaft, Produktdaten/Unterlagen, Team-Anforderungen – **nicht** die Kunden-App.
- Letzter dokumentierter Sprint: „Sprint 12 – Kurzfassung kopieren" (2026-06-12/13). Danach **keine** weitere dokumentierte Sprint-Aktivität gefunden (Stand dieses Lauf-Scans) – rund 6 Wochen ruhend gegenüber der Health-Kompass-Linie (zuletzt aktiv 2026-07-23).
- Reifegrad: **FUNCTIONAL_INCOMPLETE** – ein funktionierendes Cockpit mit Statuskarte/Kurzfassung existiert, aber ohne Persistenz, ohne echte Länderentscheidung, ohne Rechtsprüfung, ohne Dokumentenanforderung/E-Mail.
- Größter Blocker: **ENTSCHEIDUNG DURCH JAMAL ERFORDERLICH**, ob/wann die kommunikative Trennung von Health Upgrade Kompass in eine technische Trennung überführt wird, sowie externe Rechts-/Regulatorikprüfung vor jeder echten Länderfreigabe.

### C. Marketing Agentur OS

- Pfad: `marketing-agentur`, **kein Git-Repository**.
- Letzter sinnvoller Meilenstein: `docs/current-state.md` (Stand 2026-06-09/13, laut Dateidatum), `kunden-demo/` als lokale Premium-Startseiten-Vorschau, Produktionsboard `07-produktionssteuerung/internal-production-board.json`, Auftragsordner `auftraege/` zuletzt geändert 2026-06-26.
- Zweck: interne, kontrollierte KI-Marketingagentur – Aufträge strukturieren, Content vorbereiten, Design/Video koordinieren, Qualität prüfen, Revisionen verarbeiten, Ergebnisse zur Freigabe vorlegen.
- Zielgruppe (aktuell): intern (JACO GbR, CJ Rituals als erste zwei geführte Marken); noch keine externen Kunden.
- Vorhandene Substanz: eigenständiges Dashboard (`dashboard/server.py`, `dashboard/static/app.js`/`index.html`), Rollenmodell (`03-agentenrollen/`), QA-Checklisten, Tool-/Plugin-Handoff-Bereitschaftshinweise für Canva/HeyGen/Bild-KI/Vercel-GitHub/Social Publishing (**ohne** echte Automatisierung), `registry.json` mit realen (aber noch als „Entwurf"/„Research" markierten) Projekten.
- Ausdrücklich noch nicht vorhanden: echte Case Studies, echte Kundenreferenzen, Preismodell im Repository (Preisbasis liegt laut Auftrag als bereits beschlossene Planungsannahme vor, nicht im Dateisystem dieses Ordners), Vertragsvorlagen, tatsächlich abgeschlossene externe Kundenaufträge.
- Tests: keine automatisierten Testdateien gefunden; `scripts/check-local.py` prüft nur Python-Syntax/JS-Syntax/JSON lokal.
- Reifegrad: **INTERNAL_PILOT_READY** für die interne Produktionsmaschine, **FUNCTIONAL_INCOMPLETE** in Richtung eines verkaufsfähigen externen Angebots.
- Details: `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md`.

### E. Weitere aufgenommene eigene Projekte

| Projekt | Kernbefund |
|---|---|
| `health-upgrade-karriere` | Statische Karriere-/Infoseite (Health Upgrade/AltioraX-Direktvertrieb), `package.json` + `node server.js`, README nennt Platzhalter für Impressum/Datenschutz. Kein Git. Reifegrad `FOUNDATION`. |
| `prowin-karriere` | Statische Website `prowin-karriere.de`, README sehr ausführlich, `docs/`-Ordner mit 29 Einträgen, eigenes `vertriebscoach`-Modul mit Lint-Skript. Kein Git. Reifegrad `FUNCTIONAL_INCOMPLETE`. |
| `portugiesisch-sprechtrainer` | Größte Einzelanwendung dieser Gruppe (`app.js` 586 KB), README nennt eingefrorene Version „110 Audio-QA1/Safety1" bis echte Hörtestdaten vorliegen; sechs `node --check`/Testläufe in `package.json#test`. Verhältnis zu „FlowLingo" laut `PROJECT_REGISTRY.md` weiterhin **UNGEKLÄRT**. Reifegrad `FUNCTIONAL_INCOMPLETE`, eingefroren bis Hörtest. |
| `portugiesisch-sprechtrainer-{github-upload,package-fix,upload-clean,vercel-fix,vercel-output-fix}` | Fünf Ordner, die nach Struktur wie Upload-/Deployment-Kopien des Hauptordners wirken – **nicht** als eigenständige Projekte aufgenommen (siehe Abschnitt 4). |
| `spanisch-sprechtrainer` | Eigenständige App mit gleicher Trainingsstruktur, `app.js` 100 KB, README nennt lokalen Zugangscode. Kein Git. Reifegrad `FOUNDATION`/`FUNCTIONAL_INCOMPLETE`. |
| `sports-portfolio-manager` | Next.js/TypeScript/Prisma/SQLite/Tailwind/Vitest-MVP für Sportwetten-Entscheidungsunterstützung, README nennt „31 tests passed" (lokal nur 1 Testdatei vorgefunden, `node_modules` fehlt lokal). Kein `.git` – per Subagenten-Nachprüfung bestätigt kein eigenes Repository. Letzte Code-/Doku-Änderung ca. 2026-05-27–29, `prisma/dev.db` zuletzt berührt 2026-06-26 – Einschätzung eher pausiert/eingefroren als aktiv weiterentwickelt. Persönliches Analysewerkzeug, kein Kundenprodukt. Reifegrad `FUNCTIONAL_INCOMPLETE`. |
| `private-market-intelligence-bot` | Python-Paket (`pyproject.toml`, 12 Testdateien `test_*.py`, `Dockerfile`, Streamlit-Dashboard) für konservative Portfoliobeobachtung, Live-Trading V1 explizit nicht implementiert. Kein `.git` – per Subagenten-Nachprüfung bestätigt kein eigenes Repository. Letzte Änderung ca. 2026-05-27–29, danach kein sichtbarer Fortschritt – eher eingefroren/pausiert. Persönliches Werkzeug. Reifegrad `FUNCTIONAL_INCOMPLETE`. |
| `jaco-gbr-webseite` | Statische Firmenwebseite für Strato-Hosting, README nennt offene Impressum-/Datenschutzprüfung. Reifegrad `FOUNDATION`. |
| `senior-designer-os` | Reine Wissens-/Regelsammlung („keine technische App-Logik") für Bildsprache/UI/Marke. Kein Softwareprodukt im engeren Sinn. Laut `PROJECT_REGISTRY.md` bereits als `UNGEKLÄRT` (Projektidentität) markiert. |
| `autopilot-light-system` | Wiederverwendbarer lokaler Arbeits-/Freigabestandard für kontrollierte Codex-Läufe (Dokumente/Skripte, kein Endnutzerprodukt). Laut `PROJECT_REGISTRY.md` bereits als „Projekt, Modul oder Methode?" offen markiert. |

## 3. Nicht als eigenständige Projekte aufgenommene Verzeichnisse (mit Begründung)

| Verzeichnis/Gruppe | Begründung für Ausschluss |
|---|---|
| `CJ_Rituals_Projektzentrale`, `Valphira_medical_solutions_GmbH_Marcel_Hermann`, `CJ_Ritter_Branding`, `CJ_Rituals_Branding`, `CJ_video_assets` | reales Geschäftsvorhaben (Herstellersourcing für ein Shot-Pulver-Produkt), aber **kein Software-/Codeprojekt** – gehört fachlich zu Vertrieb/Partnerschaften, nicht in einen technischen Finish-Korridor der Zentrale. |
| `hupgrade-shop-material` | reine Rohdatensammlung (21 Shop-Produkte, gescraped) als Recherchematerial für Health Upgrade – kein eigenständiges Projekt. |
| `natural_holistic_odyssey` | wenige Einzeldateien (PDF/DOCX/Python-Skripte für einen Canva-Import), kein README, kein erkennbarer laufender Entwicklungsstand. |
| `output/`, `outputs/` | ausdrücklich als Exportablage benannt (u. a. PowerPoint-Foliensätze „Yourday"); Exporte zählen laut Auftrag nicht als eigenständiges Projekt. |
| `portugiesisch-sprechtrainer-github-upload`, `-package-fix`, `-upload-clean`, `-vercel-fix`, `-vercel-output-fix` | Struktur und Namensgebung entsprechen Upload-/Build-/Deployment-Korrekturkopien des Hauptordners `portugiesisch-sprechtrainer`, keine eigenständige Weiterentwicklung. |
| `preview_*`, `*_pdf_preview*`, `*_thumb`, `avatar_anleitung_preview`, `projektuebersicht_pdf_preview`, `konni_pdf_preview*` | reine Vorschau-/Renderordner für Dokumente, keine Projekte. |
| `ausgelesene_bilder_prowin_buecher`, `assets`, `tools`, `tmp`, `__pycache__` | generische Medien-/Werkzeug-/Cache-Ordner ohne eigenständigen Projektcharakter. |
| `workbook_jahrseminar_*`, `Ordnungsplan_Listen`, Hunderte businessbezogene Einzeldateien (Herstellerkorrespondenz, Präsentationen, Rechnungen, Sortierprotokolle) im Wurzelverzeichnis | Einzeldokumente/Ablagevorgänge, kein Anwendungscode, keine Projektstruktur; nicht einzeln aufgeführt. |
| `07-produktionssteuerung` (Top-Level, **nicht** identisch mit `marketing-agentur/07-produktionssteuerung`) | eigenständige, kleine n8n-Pilot-Workflow-Notiz + Runbooks, kein eigenständiges Projekt. |
| `shop_konzept_juni_2026`, `Doehler_Sven_Matulic_2026-06-08`, `workbook_jahrseminar_contact` u. ä. Terminordner | Meeting-/Themenordner ohne Anwendungscode. |

Registrierte, aber im Dateisystem dieses Laufs **ohne eindeutige eigene Projektmappe gefundene** Einträge aus `PROJECT_REGISTRY.md` (`your-day-portugal-2-0`, `your-day-mlm-praesentation`, `jaco-eventplanung`, `portugiesische-lda-gruendung`, `seminare-und-praesentationen`): Status bleibt **UNGEKLÄRT**, wie im bestehenden Register dokumentiert – in diesem Lauf nicht neu untersucht, da kein klarer Ordnerfund vorlag.

## 4. Verbindliche Abschlussreihenfolge

Siehe Begründung und Priorisierungsmatrix in `PROJECT_FINISH_DECISION_BOARD.md`. Kurzfassung:

1. **Health Upgrade Kompass** bis `REFERENCE_READY` (siehe `HEALTH_REFERENCE_FINISH_PLAN.md`).
2. **Marketing Agentur OS** bis `SELLABLE_PILOT_READY` (siehe `MARKETING_AGENCY_SELLABLE_PILOT_PLAN.md`) – kann teilweise parallel zu 1 vorbereitet werden, sollte aber nicht vor einem sichtbaren Health-Referenznachweis extern angeboten werden.
3. **Expansion App / Export-Modul** – erst nach einer bewussten Entscheidung, ob/wie die technische Trennung von Health Upgrade Kompass erfolgt.
4. **Sprachtrainer-Familie** (Portugiesisch/Spanisch) – Portugiesisch zuerst (weiter fortgeschritten, wartet konkret auf einen echten Hörtest), Spanisch danach.
5. **Karriere-/Static-Sites** (`prowin-karriere`, `health-upgrade-karriere`, `jaco-gbr-webseite`) – niedriger technischer Aufwand, aber vor Veröffentlichung Rechtsprüfung nötig; keine Priorität vor 1–2.
6. **Persönliche Werkzeuge** (`sports-portfolio-manager`, `private-market-intelligence-bot`) – kein Geschäftsprodukt, keine Priorität in diesem Portfolio-Lauf.
7. **Senior Designer OS / Autopilot-Light-System** – bleiben Methode/Wissensbasis, keine „Fertigstellung" im Produktsinn nötig; Identitätsklärung durch Jamal ausstehend.

Oben aktiv: **maximal drei Prioritäten gleichzeitig** – siehe Entscheidungsboard.
