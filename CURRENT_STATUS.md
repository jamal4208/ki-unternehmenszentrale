# CURRENT STATUS

## Git- und Versionsstand

- Version: **V6.40.1 – Vereinfachter Tagesstart**
- Ausgangs-HEAD für V6.40.1: `6978ce3`
- Produktstand V6.40.0: `6978ce3` (auf `origin/main` gesichert)
- Branch: `main`
- Upstream vor Beginn: `origin/main` auf `6978ce3`, synchron
- Working Tree vor V6.40.1: sauber; V6.40.1 bleibt auftragsgemäß uncommitted und ungepusht

## V6.40.1 – aktueller Funktionsstand

- Ein neuer kompakter Hauptarbeitsweg steht im Cockpit vor den historischen Detailkarten.
- Ein Tageslauf enthält genau ein bewusst gewähltes Fokusprojekt, ein großes Pflichtfeld für das gewünschte Ergebnis und eine optionale Verbotsgrenze.
- Die frühere normale Eingabe von Begründung, Abnahmekriterium, Jamal-Frage, Allowlist, Tests, Git-Regeln und Rückfallweg entfällt; diese Angaben werden nachvollziehbar abgeleitet.
- Acht Aufgabentypen werden erkannt: Agenten-/Einsatzplanung, Entwicklung/Codex, Design, Content, Recherche, Strategie/Entscheidung, Qualität/Prüfung und Plugin-/Werkzeugauswahl.
- Der Arbeitsvorschlag enthält Zielverständnis, realistischen Tagesumfang, federführenden und weitere Agenten, Rollen, Teilaufgaben, Reihenfolge, Übergaben, Werkzeugkategorien, Dateien/Datenbereiche, Tests, Sicherheitsgrenzen, Abnahmekriterium und eine Jamal-Frage.
- Agenten- und Einsatzplanung bleibt ausdrücklich ohne Codex-/Repository-Auftrag; technische Arbeitsdetails stehen standardmäßig geschlossen unter „Technische Details anzeigen“.
- Die Vorlage wird nur als kopierbarer Text vorbereitet; es gibt keinen Codex-Aufruf und keinen Agentenstart.
- Jeder Statusübergang benötigt Jamals bewusste Bedienung.
- Tagesläufe werden getrennt unter `ki-unternehmenszentrale-daily-work-runs-v1` gespeichert.
- Der bestehende Managementspeicher `ki-unternehmenszentrale-v1` wird weder gelöscht noch pauschal migriert.
- Ein Projektverlauf wird erst nach bestätigtem Tagesabschluss und separater manueller Übernahme ergänzt; doppelte Einträge werden verhindert.
- Bei nicht verfügbarer Register-API erscheint der aktuelle technische Stand als `UNGEKLÄRT`; gespeicherte Momentaufnahmen dienen nicht als Ersatz.
- Keine neue API: weiterhin 41 GET-Routen, 404 für unbekannte Projekt-ID und 405 für andere Methoden.
- Browserabnahme V6.40.1 erfolgreich: neuer Lauf ohne Autofokus, manuelle Health-Auswahl, Ergebniswunsch und optionale Grenze, Agenten-/Einsatzplanung ohne Repository-Auftrag, geschlossene Technikdetails, Reload-Persistenz und fehlerfreie Konsole geprüft. Ein bestehender abgeschlossener V6.40.0-Lauf blieb vollständig lesbar.

## Unveränderter V6.39.0-Registerstand

- `project-registry.js` ist die einzige kanonische technische Quelle für 17 Projekte mit stabilen IDs.
- Die sichtbaren Modi sind `DEMO`, `PLANUNG`, `REAL_VERIFIZIERT` und `UNGEKLÄRT`.
- Health Upgrade Kompass ist der erste technisch `REAL_VERIFIZIERT` geführte Pilot.
- Health-Pfad, Repository, Branch `main`, HEAD `bc98b5c`, Baseline-Commit `26f65fe` und Remote-Referenzen sind als bestätigte Momentaufnahme dokumentiert.
- Health und Expansion bleiben fachlich getrennt; die technische Basis ist teilweise gemeinsam.
- Work bleibt technisch `UNGEKLÄRT`; Codex bleibt manuell kontrolliert.
- Manuelle Managementdaten werden weiter im Browser per `localStorage` gespeichert und getrennt von Kanondaten angezeigt.
- Keine autonome Produktivplattform, keine automatische externe Aktion, keine automatische Git-Aktion und keine Deploymentfreigabe.

## Hauptdateien

- `index.html` – Grundstruktur und Ansichten
- `app.js` – Frontend-, Register-, Zustands- und Renderinglogik
- `server.js` – lokaler HTTP-Server, APIs und Geschäftslogik
- `project-registry.js` – kanonisches Register für exakt 17 Projekte
- `project-registry.test.js` – automatisierte Register-, API- und Persistenzgrenzen
- `daily-work-run.js` – isoliertes Tageslaufmodell und manuelle Statusübergänge
- `daily-work-run.test.js` – 44 automatisierte Tageslauf-, Eingabe-, Erkennungs-, Speicher- und Sicherheitsprüfungen
- `styles.css` – Designsystem und Oberflächenregeln
- `package.json` – Start- und Syntaxprüfungen
- `package-lock.json` – Lockfile ohne installierte Paketabhängigkeiten

## Hauptmodule

Cockpit, Portfolio, Agenten, Projektaufnahme, Support, Qualität, Wissen/Archiv sowie Plugin-, Workflow-, Sicherheits- und Freigabestatus.

## Praktischer Nutzungsgrad

Die Zentrale ist als lokaler read-only Arbeits-, Entscheidungs- und Demo-Stand praktisch nutzbar. Health Upgrade Kompass ist als erstes Fokus- und Pilotprojekt in den Cockpitablauf eingebunden. Produktive Außenaktionen und autonome Arbeitsausführung sind nicht freigegeben.

## Tests

- `npm test` → 20 Register-, Health-, API- und localStorage-Prüfpunkte
- `npm test` führt zusätzlich 44 Tageslauf-Prüfpunkte aus
- `npm run check` → `node --check app.js && node --check server.js`
- `npm start` → `node server.js`
- manuelle lokale Browser- und GET-API-Prüfungen
- Airtable-Read-only-Prüfpfade mit separater Serverfreigabe

## Weiterhin fehlende Tests

Keine Coverage-, Lint-, HTML-/CSS- oder CI-Test-Suite ist im Bestand nachgewiesen. V6.40.1 ergänzt begrenzte Unit- und manuelle Browserprüfungen für den vereinfachten Tagesstart.

## Technische Risiken

- sehr große Monolithen: `app.js`, `server.js` und `styles.css`
- historische Register-, Status- und Sicherheitsstrukturen bleiben in Frontend und Server sichtbar; technische Projektverifizierung stammt ausschließlich aus `project-registry.js`
- zahlreiche historische Versionsschichten im laufenden Code
- uneinheitliche Agenten- und Projektnamen
- fehlende zentrale Daten- und API-Spezifikation vor dieser Dokumentation
- reale HTTPS-Fähigkeit einzelner Airtable-Read-only-Pfade bei gesetzter Freigabe

## Bekannte Versionswidersprüche

- Neuer Tageslaufstand V6.40.1, historische Cockpit- und Modulkennzeichnungen teilweise V6.38.x oder älter.
- Zwei Commits tragen V6.37.0; V6.37.2 erscheint in der Historie vor V6.37.1.
- Viele historische V4.x-, V5.x- und V6.x-Bezeichnungen bleiben parallel sichtbar.

## Genau ein empfohlener nächster Produktentwicklungsschritt

V6.40.1 manuell im Browser abnehmen; danach separat entscheiden, ob der uncommittete Stand gesichert werden soll.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Manuelle Abnahme von V6.40.1 sowie jede spätere Commit-, Push- oder Deploymententscheidung.
