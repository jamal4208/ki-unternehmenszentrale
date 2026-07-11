# SECURITY RULES

## Verbindliche Grundwerte

- `writeOperationsBlocked: true`
- `madeExternalRequest: false` ohne ausdrücklich freigegebene tatsächliche Anfrage
- keine externe Aktion ohne ausdrückliche Freigabe von Jamal
- keine automatische Veröffentlichung oder Speicherung
- keine automatische Entscheidung, Plugin-Ausführung oder Autonomieerhöhung
- keine Zahlungen oder Vertragsentscheidungen
- keine Deployments
- keine medizinische Diagnose oder Heilversprechen
- keine Rechts-, Finanz- oder Medizinfreigabe
- keine echten Kundendaten ohne Freigabe
- keine Geheimnisse im Frontend
- keine Rohdaten, Record-IDs, Feldnamen oder Feldwerte in Chef-Ausgaben
- bestehende Funktionen und frühere Versionsstände schützen
- nur kleine reversible Schritte
- Commit und Push nur nach ausdrücklicher Freigabe

## Freigabemodell

Jamal bleibt Entscheidungsträger. Agenten und Module dürfen analysieren, strukturieren, prüfen und Vorlagen vorbereiten. Eine vorbereitet sichtbare Aktion ist keine technische oder geschäftliche Freigabe. Schreibende, externe, veröffentlichende, finanzielle, rechtliche oder produktive Schritte benötigen eine neue konkrete Freigabe.

## Airtable-Sonderfall

Der Server besitzt technisch mögliche read-only HTTPS-Anfragen. Sie sind nur zulässig, wenn:

1. lokale Zugangsdaten vollständig gesetzt sind,
2. die erforderliche ausdrückliche Serverfreigabe gesetzt ist,
3. der konkrete Vorgang von Jamal freigegeben ist,
4. ausschließlich GET/read-only verwendet wird.

Es bestehen keine Airtable-Schreibrechte. Ausgaben müssen sanitisiert bleiben; freie Rohdaten, Record-IDs, Feldnamen, Feldwerte und Tabellenstrukturen dürfen nicht als Chef-Ausgabe erscheinen. Zugangsdaten bleiben serverseitig in `.env.local` und dürfen nicht committed oder im Frontend sichtbar werden.

## Bestandsschutz und Prüfung

- vorhandene Funktionen nicht entfernen
- betroffene Routen und Syntax prüfen
- Sicherheitswerte nach jeder Änderung kontrollieren
- keine Abkürzung der Prüfung zugunsten von Geschwindigkeit
- erfolgreiche Änderung vor Commit separat überprüfen

## Bekannte Widersprüche

`madeExternalRequest: false` beschreibt den sicheren Standard und viele vorbereitete Antworten; einzelne Airtable-Handler könnten nach separater Freigabe tatsächlich extern lesen und müssen dann den realen Status korrekt ausweisen.

## Noch zu normalisieren

Mehrfach deklarierte Sicherheitsflags sollten später eine einzige kanonische Quelle erhalten, ohne Schutzwirkung zu reduzieren.

## Entscheidung durch Jamal erforderlich

Jede Aktivierung einer externen Read-only-Anfrage und jede spätere Erweiterung des Freigabemodells.
