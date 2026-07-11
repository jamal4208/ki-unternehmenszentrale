# CURRENT STATUS

## Git- und Versionsstand

- Version: **V6.38.4 Health-Demo-Zielkarte**
- Commit: `a59c7bd`
- Branch: `main`
- Upstream: `origin/main`, synchron
- Working Tree vor Erstellung dieser Dokumentation: sauber

## Hauptdateien

- `index.html` – Grundstruktur und Ansichten
- `app.js` – Frontend-, Register-, Zustands- und Renderinglogik
- `server.js` – lokaler HTTP-Server, APIs und Geschäftslogik
- `styles.css` – Designsystem und Oberflächenregeln
- `package.json` – Start- und Syntaxprüfungen
- `package-lock.json` – Lockfile ohne installierte Paketabhängigkeiten

## Hauptmodule

Cockpit, Portfolio, Agenten, Projektaufnahme, Support, Qualität, Wissen/Archiv sowie Plugin-, Workflow-, Sicherheits- und Freigabestatus.

## Praktischer Nutzungsgrad

Die Zentrale ist als lokaler read-only Arbeits-, Entscheidungs- und Demo-Stand praktisch nutzbar. Health Upgrade Kompass ist als erstes Fokus- und Pilotprojekt in den Cockpitablauf eingebunden. Produktive Außenaktionen und autonome Arbeitsausführung sind nicht freigegeben.

## Tests

- `npm run check` → `node --check app.js && node --check server.js`
- `npm start` → `node server.js`
- manuelle lokale Browser- und GET-API-Prüfungen
- Airtable-Read-only-Prüfpfade mit separater Serverfreigabe

## Fehlende automatisierte Tests

Keine Unit-, Integrations-, End-to-End-, Coverage-, Lint-, HTML-/CSS- oder CI-Test-Suite ist im Bestand nachgewiesen.

## Technische Risiken

- sehr große Monolithen: `app.js`, `server.js` und `styles.css`
- duplizierte Register, Status- und Sicherheitsstrukturen in Frontend und Server
- zahlreiche historische Versionsschichten im laufenden Code
- uneinheitliche Agenten- und Projektnamen
- fehlende zentrale Daten- und API-Spezifikation vor dieser Dokumentation
- reale HTTPS-Fähigkeit einzelner Airtable-Read-only-Pfade bei gesetzter Freigabe

## Bekannte Versionswidersprüche

- Git-Gesamtstand V6.38.4, sichtbare Cockpit-Kennzeichnung teilweise V6.38.0.
- Zwei Commits tragen V6.37.0; V6.37.2 erscheint in der Historie vor V6.37.1.
- Viele historische V4.x-, V5.x- und V6.x-Bezeichnungen bleiben parallel sichtbar.

## Genau ein empfohlener nächster Produktentwicklungsschritt

Nach Jamals Prüfung dieser Dokumentation ein einziges kanonisches, codebasiertes Projekt- und Agentenregister als read-only Quelle planen, ohne bestehende Funktionen oder Sicherheitsgrenzen zu entfernen.

## Bekannte Widersprüche

Die Gesamtversion und sichtbare Teilversionen stimmen nicht überall überein.

## Noch zu normalisieren

Versionsquelle, Namensvarianten und doppelte Register.

## Entscheidung durch Jamal erforderlich

Welche bestehende Registerstruktur künftig kanonisch wird.
