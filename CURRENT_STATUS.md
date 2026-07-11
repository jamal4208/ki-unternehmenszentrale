# CURRENT STATUS

## Git- und Versionsstand

- Version: **V6.39.0 – Kanonisches Projektregister und Health-Pilotakte**
- Ausgangs-HEAD: `a5367f1`
- Produktstand V6.38.4: `a59c7bd`
- Branch: `main`
- Upstream vor Beginn: `origin/main` auf `a5367f1`, synchron
- Working Tree vor V6.39.0: sauber; V6.39.0 ist noch nicht committed

## V6.39.0 – aktueller Funktionsstand

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
- `styles.css` – Designsystem und Oberflächenregeln
- `package.json` – Start- und Syntaxprüfungen
- `package-lock.json` – Lockfile ohne installierte Paketabhängigkeiten

## Hauptmodule

Cockpit, Portfolio, Agenten, Projektaufnahme, Support, Qualität, Wissen/Archiv sowie Plugin-, Workflow-, Sicherheits- und Freigabestatus.

## Praktischer Nutzungsgrad

Die Zentrale ist als lokaler read-only Arbeits-, Entscheidungs- und Demo-Stand praktisch nutzbar. Health Upgrade Kompass ist als erstes Fokus- und Pilotprojekt in den Cockpitablauf eingebunden. Produktive Außenaktionen und autonome Arbeitsausführung sind nicht freigegeben.

## Tests

- `npm test` → 20 Register-, Health-, API- und localStorage-Prüfpunkte
- `npm run check` → `node --check app.js && node --check server.js`
- `npm start` → `node server.js`
- manuelle lokale Browser- und GET-API-Prüfungen
- Airtable-Read-only-Prüfpfade mit separater Serverfreigabe

## Weiterhin fehlende Tests

Keine End-to-End-, Browser-, Coverage-, Lint-, HTML-/CSS- oder CI-Test-Suite ist im Bestand nachgewiesen. V6.39.0 ergänzt nur die begrenzten Register- und API-Tests.

## Technische Risiken

- sehr große Monolithen: `app.js`, `server.js` und `styles.css`
- historische Register-, Status- und Sicherheitsstrukturen bleiben in Frontend und Server sichtbar; technische Projektverifizierung stammt ausschließlich aus `project-registry.js`
- zahlreiche historische Versionsschichten im laufenden Code
- uneinheitliche Agenten- und Projektnamen
- fehlende zentrale Daten- und API-Spezifikation vor dieser Dokumentation
- reale HTTPS-Fähigkeit einzelner Airtable-Read-only-Pfade bei gesetzter Freigabe

## Bekannte Versionswidersprüche

- Neuer Registerstand V6.39.0, historische Cockpit- und Modulkennzeichnungen teilweise V6.38.x oder älter.
- Zwei Commits tragen V6.37.0; V6.37.2 erscheint in der Historie vor V6.37.1.
- Viele historische V4.x-, V5.x- und V6.x-Bezeichnungen bleiben parallel sichtbar.

## Genau ein empfohlener nächster Produktentwicklungsschritt

V6.39.0 manuell in Oberfläche und API abnehmen; danach separat entscheiden, ob der uncommittete Stand gesichert werden soll.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Historische Versionskennzeichnungen, Namensvarianten und nicht-kanonische Altregister, ohne sie in diesem begrenzten Schritt zu entfernen.

## Entscheidung durch Jamal erforderlich

Manuelle Abnahme von V6.39.0 sowie jede spätere Commit-, Push- oder Deploymententscheidung.
