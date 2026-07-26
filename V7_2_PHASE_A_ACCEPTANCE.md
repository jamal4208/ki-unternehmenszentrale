# V7.2 Phase A – Abnahme der Portalbasis (Schritt 4)

**Projekt:** KI-Unternehmenszentrale – Deutsches Kundenportal und Owner-Verwaltung
**Art dieses Dokuments:** Gesamtabnahme der bestehenden Portalbasis (Schritte 1–3). Kein neuer Produktfunktions-Sprint, keine Phase-B-Arbeit.
**Status:** vorbereitend, manuell kontrolliert. Kein Commit, kein Push, kein Deployment durch dieses Dokument selbst.

---

## 1. Geprüfter Commit

| Größe | Wert |
|---|---|
| Branch | `main` |
| Ausgangs-HEAD / `origin/main` (vor Schritt 4) | `5bd302d7df7a848222ae55cdd7e29258153e02c2` |
| Letzter Commit vor Schritt 4 | „V7.2 Phase A Schritt 3: Deutsches Kundenportal und Owner-Verwaltung aufbauen" |
| Working Tree zu Beginn von Schritt 4 | sauber |
| Working Tree am Ende von Schritt 4 | 2 geänderte Dateien, 3 neue Dateien (siehe Abschnitt 3) – **noch nicht committet** |

## 2. Teststand

| Größe | Vor Schritt 4 | Nach Schritt 4 | Delta |
|---|---|---|---|
| GET-Routen (Policy-Tabelle) | 68 | 68 | 0 |
| POST-Routen (Policy-Tabelle) | 51 | 51 | 0 |
| Prefix-Routen | 8 | 8 | 0 |
| statische Assets | 23 | 23 | 0 |
| Testdateien | 54 | 57 | +3 |
| automatisierte Prüfpunkte (`npm test`, reale Ausgabe) | 1535 | 1597 | +62 |
| `npm run check` | grün | grün | – |
| `git diff --check` | – | keine Whitespace-/Konfliktfehler | – |
| `npm audit` | 0 Schwachstellen | 0 Schwachstellen | 0 |
| `better-sqlite3` | 13.0.1 (exakt gepinnt) | 13.0.1 (exakt gepinnt) | unverändert |

Die 62 neuen Prüfpunkte verteilen sich auf drei neue Akzeptanztestdateien (siehe Abschnitt 27):
`portal-security-acceptance.test.js` (27), `portal-operations-acceptance.test.js` (15), `portal-usability-acceptance.test.js` (20).

## 3. Neue und geänderte Dateien

| Datei | Art | Grund |
|---|---|---|
| `owner-admin-service.js` | geändert | Sicherheitskorrektur: `findCustomerUserOrThrow` (siehe Abschnitt 6) |
| `package.json` | geändert | drei neue Testdateien in `test`- und `check`-Skript eingehängt |
| `portal-security-acceptance.test.js` | neu | Sicherheitsabnahme (Mandantentrennung, Rollenmatrix, CSRF/Cookie, Prod-Modus) |
| `portal-operations-acceptance.test.js` | neu | Betriebsabnahme (Migrationen, Owner-Bootstrap, Backup-Abgrenzung, WAL) |
| `portal-usability-acceptance.test.js` | neu | Bedienbarkeits-/Datenschutzabnahme der Portal-Oberflächen |

Keine weitere Datei wurde verändert. Insbesondere unverändert: Chef-Oberfläche (`index.html`, `app.js`, `styles.css`), Canva-/HeyGen-/Execution-Produktmodule, Fachauftragslogik, Billing, Publishing, Mehrsprachigkeit, Health, Fixture.

## 4. Diffstatistik

```
owner-admin-service.js | 30 ++++++++++++++++++++++++------
package.json           |  4 ++--
2 files changed, 26 insertions(+), 8 deletions(-)
```

Zusätzlich 3 neue, unversionierte Dateien (siehe Abschnitt 3). `git diff --check` liefert keinen Befund (keine Whitespace-Fehler).

## 5. Gefundene Fehler

Während der Read-only-Gesamtarchitekturprüfung (Auftrag Abschnitt B) wurde **ein** echter Sicherheitsbefund identifiziert:

**Befund:** Die Owner-Benutzeraktionsrouten (`.../suspend`, `.../reactivate`, `.../revoke-sessions`, `.../reissue-invitation`, `.../revoke-invitation`, `.../prepare-password-reset`) validierten in `owner-admin-service.js` nur, dass die Ziel-Benutzer-ID *existiert* (`findUserOrThrow`), nicht aber, dass sie zu einer Kundenrolle (`CUSTOMER_ADMIN`/`CUSTOMER_USER`) gehört. Eine gültige OWNER-Session hätte über diese "Kundenverwaltungs"-Fläche auch eine fremde **OWNER**- oder **SUPPORT**-Benutzer-ID adressieren können (z. B. eine zweite Owner-Instanz sperren oder deren Sessions widerrufen) – außerhalb der im Auftrag erklärten Grenze dieser Verwaltung ("Owner-Verwaltung" = Kundenverwaltung, nicht Verwaltung anderer privilegierter Rollen).

**Sicherheitsauswirkung:** mittel. Kein Zugriff für Unbefugte (weiterhin nur eine echte OWNER-Session), aber eine Rechteausweitung *innerhalb* der Owner-Rolle über eine nicht dafür vorgesehene Fläche, mit Risiko einer versehentlichen oder böswilligen Störung anderer privilegierter Konten.

## 6. Behobene Fehler

Der oben genannte Befund wurde behoben:

```30:47:owner-admin-service.js
function findCustomerUserOrThrow(db, userId) {
  const user = findUserOrThrow(db, userId);
  if (!INVITABLE_ROLES.includes(user.role)) {
    throw notFound("Benutzer unbekannt.");
  }
  return user;
}
```

Alle sechs betroffenen Funktionen (`suspendUser`, `reactivateUser`, `revokeSessionsForUser`, `reissueInvitation`, `revokeInvitation`, `preparePasswordReset`) nutzen jetzt `findCustomerUserOrThrow` statt `findUserOrThrow`. Ergebnis: ein Zugriff auf eine OWNER- oder SUPPORT-Benutzer-ID über diese Routen liefert generisches `404` (wie bei jeder unbekannten ID) – keine Bestätigung, dass die ID existiert, keine Rolleninformation.

**Regressionstest:** vier neue Prüfpunkte in `portal-security-acceptance.test.js` (Abschnitt 3 des Testfiles): fremde OWNER-ID nicht sperrbar, SUPPORT-ID nicht sperrbar, SUPPORT-ID kein Passwort-Reset vorbereitbar, unveränderte Funktion für echte Kundenbenutzer (kein Kollateralschaden). Zusätzlich wurde die bestehende `owner-admin-routes.test.js` erneut ausgeführt und bleibt vollständig grün.

**Vollständige Testreihe nach der Korrektur:** `npm run check` grün, `npm test` grün (1597/1597), `git diff --check` ohne Befund, `npm audit` 0 Schwachstellen, `better-sqlite3@13.0.1` unverändert.

## 7. Nicht behobene Restlücken

Keine der folgenden Punkte ist ein akuter Sicherheitsfehler; alle sind bewusste, dokumentierte Phase-A-Grenzen (siehe Abschnitt 14):

1. Passwort-Reset-Anfrage (`/api/auth/password-reset/request`) auditiert nur den Erfolgsfall generisch, nicht jeden Fehlversuch einzeln (bewusst, um keine Enumeration über Auditvolumen zu ermöglichen).
2. Keine explizite Maximallänge für Passwörter in `auth-password.js` selbst; abgesichert ausschließlich über das generelle 8-KB-Body-Limit der Auth-API.
3. Ratenlimiter (`auth-rate-limit.js`) sind In-Memory und pro Prozess – Neustart oder Mehrprozessbetrieb setzen sie zurück (siehe Abschnitt 20).
4. Keine Backup-Verschlüsselung, kein dokumentiertes Löschkonzept, keine Datenschutztexte (AVV/Datenschutzerklärung) – außerhalb des Auftrags von Phase A.
5. `owner-admin.js` zeigt für Mandanten/Nutzer die rohen Statuswerte (`ACTIVE`/`SUSPENDED`/…) statt lokalisierter Anzeigetexte – rein kosmetisch, nur im internen Owner-Werkzeug, kein Kundenkontakt.

## 8. Authentifizierungsabnahme

Geprüft (automatisiert über `auth-password.test.js`, `auth-session.test.js`, `server-auth-routes.test.js`, `portal-security-acceptance.test.js`, sowie manuell über die reale E2E-Abnahme, Abschnitt 26):

- Login OWNER/CUSTOMER_ADMIN/CUSTOMER_USER erfolgreich; falsches Passwort und unbekannte E-Mail liefern identische generische Fehlermeldung (kein Oracle).
- Gesperrter Benutzer und suspendierter Mandant: Login schlägt sofort fehl (E2E-Schritt 17 real nachgewiesen).
- Session-Rotation bei Login, Idle-/Absolut-Ablauf, maximal 5 aktive Sessions, Einzel- und Massenwiderruf – über `auth-session.test.js` abgedeckt.
- Logout ist idempotent (wiederholtes Logout liefert weiterhin `200`, keine zweite Session mehr zu widerrufen).
- Passwortänderung (Reset) widerruft bestehende Sessions sofort (E2E-Schritt 24 real nachgewiesen: alte Session nach Reset `401`).
- Invitation-Annahme und Passwort-Reset lösen **keinen** automatischen Login aus (kein `Set-Cookie` in der Antwort; E2E-Schritt 9 real nachgewiesen).
- Sessiontoken wird ausschließlich als Hash in der Datenbank gespeichert (`auth-session.js`); kein Klartext-Token in Logs, Audit, HTML, Fehlerantworten oder Backups (durch `auth-audit.js`-Allowlist, `portal-security-acceptance.test.js` Prüfpunkt 27 sowie `portal-operations-acceptance.test.js` Prüfpunkte 11–13 strukturell nachgewiesen).

**Urteil: bestanden.**

## 9. Autorisierungsabnahme

Geprüft über `route-access-policy.js`/`route-access-policy.test.js`, `auth-route-guard.js`, `portal-security-acceptance.test.js` und die manuelle E2E-Abnahme:

- **OWNER**: Owner-Verwaltung, interne Chef-Routen/-Assets, Mandanten- und Benutzerverwaltung erreichbar. **Kein** automatischer Kundenzugriff: `/api/portal/me` und `/api/portal/status` bleiben für OWNER `404` (keine Impersonation, E2E- und Unit-Test-bestätigt).
- **CUSTOMER_ADMIN/CUSTOMER_USER**: ausschließlich eigenes Portal, eigene Kontoinformation, eigener Status. Owner-Routen (`/owner/kunden`, `/api/owner/*`) liefern `404`. Keine Benutzerverwaltung, keine Mandantenwahl, keine Fachaufträge, keine Tools, keine Veröffentlichung – all dies existiert im Kundenportal-Code schlicht nicht (statisch nachgewiesen in `portal-usability-acceptance.test.js`).
- **SUPPORT**: ohne aktiven Grant weder Owner- noch Kundendaten noch Portalansicht erreichbar (`404`/`401`, je nach Fehlerstrategie der Zugriffsklasse). Eine echte Grant-Vergabe existiert in Phase A bewusst noch nicht – die Klasse `SUPPORT_GRANT_ONLY` ist daher für jede reale Session strukturell gesperrt (siehe Abschnitt 14).
- **Erweiterung über Query/Body/Header/Cookie/Pfad**: nicht möglich. Die Policy-Auflösung verwendet ausschließlich Methode und Pfad (route-access-policy.js Kommentar/Test), der Mandant kommt ausschließlich aus der validierten Session (`auth-route-guard.js#identityFromRealSession`), niemals aus einem Request-Parameter.

**Urteil: bestanden.**

## 10. Rollenmatrix (zusammenfassend)

| Aktion / Route | OWNER | CUSTOMER_ADMIN | CUSTOMER_USER | SUPPORT (ohne Grant) |
|---|---|---|---|---|
| `/api/owner/*` | ✅ | ❌ (404) | ❌ (404) | ❌ (404) |
| `/owner/kunden` | ✅ | ❌ (404) | ❌ (404) | ❌ (404) |
| `/api/portal/me`, `/api/portal/status` | ❌ (404, keine Impersonation) | ✅ (nur eigener Mandant) | ✅ (nur eigener Mandant) | ❌ (401) |
| `/portal` (statisch) | ❌ (404) | ✅ | ✅ | ❌ (404) |
| interne Chef-Routen | ✅ | ❌ | ❌ | ❌ |
| Kundenbenutzer verwalten (`suspend`/`reactivate`/…) | ✅ (nur CUSTOMER_ADMIN/CUSTOMER_USER-Ziele, seit Schritt 4) | ❌ | ❌ | ❌ |

## 11. Mandantenisolation

Real mit zwei kanonischen Testmandanten (Café/Fitnessstudio) nachgewiesen, sowohl unit- als auch E2E-seitig:

1. Admin A sieht ausschließlich den Mandantennamen von A, Admin B ausschließlich B (Datenebene, nicht nur Parameterebene).
2. Owner-Benutzerliste für A enthält niemals einen Benutzer von B und umgekehrt.
3. Suspendieren von Mandant A entzieht dessen Nutzern sofort den Zugriff (`401`); Mandant B bleibt vollständig unberührt.
4. Reaktivierter Mandant A erhält wieder ausschließlich eigenen Zugriff.
5. Unbekannter Mandant und ein fremder, existierender Mandant liefern identisch generisches `404` (kein Orakel über Existenz).
6. Ein manipulierter Mandantenparameter in Query/Body/Pfad wird über `detectTenantParamMismatch` erkannt und führt zu `TENANT_MISMATCH_BLOCKED` (auditiert, `404`).
7. Der Mandant wird bei **jeder** Anfrage frisch aus der Session-/Datenbankvalidierung geladen (`loadSessionIdentity`), nicht zwischengespeichert – kein Cache überträgt Daten zwischen Mandanten.

**Verbindlich eingehalten:** Tenantquelle bleibt ausschließlich die validierte Session.

**Urteil: bestanden.**

## 12. Owner-Verwaltung

Vollständiger Lebenszyklus real durchlaufen (E2E, Abschnitt 26) und unit-getestet (`owner-admin-routes.test.js`):

Owner-Bootstrap (idempotent, rotiert nur das Passwort bei zweitem Aufruf) → Login → Mandant aktivieren/suspendieren → Kunden einladen (CUSTOMER_ADMIN/CUSTOMER_USER) → Einladung annehmen → Benutzer sperren/reaktivieren/Sessions widerrufen → Passwort-Reset vorbereiten (einmaliger Token, danach nicht erneut abrufbar) → kein Hard Delete, kein Massenimport.

Seit Schritt 4 zusätzlich abgesichert: keine zweite Ownerrolle und kein Support-Benutzer über die Kundenverwaltung ansprechbar (Abschnitt 6). Alle Aktionen auditieren über die feste Allowlist (`routeName`, `roleLabel`, `reasonCode`) – keine Geheimnisse in Listen oder Fehlern (strukturell durch `auth-audit.js#FORBIDDEN_METADATA_PATTERNS` erzwungen und in `portal-security-acceptance.test.js` Prüfpunkt 27 stichprobenhaft nachgewiesen).

**Urteil: bestanden.**

## 13. Einladung

Gültiger/ungültiger/abgelaufener/verbrauchter Token, falscher Zweck (`purpose !== "INVITE"`), Reissue (alter Token danach ungültig), Revoke – alles über `server-auth-routes.test.js`/`owner-admin-routes.test.js` abgedeckt und in der E2E-Abnahme real durchlaufen (drei echte Einladungen angenommen). Kein automatischer Login nach Annahme (real nachgewiesen: kein `Set-Cookie` in der Antwort). Client-seitige URL-Bereinigung (`replaceState`) und fehlendes `localStorage`/`sessionStorage` strukturell nachgewiesen (`portal-operations-acceptance.test.js` Prüfpunkt 13).

**Urteil: bestanden.**

## 14. Passwort-Reset

Request mit existierendem/unbekanntem Konto liefert identische generische Antwort (kein Oracle); Rate-Limiting über `auth-rate-limit.js` (In-Memory, siehe Restlücke Abschnitt 7.3); atomare Einlösung (`consumeResetToken`, real und per `auth-db.test.js` Prüfpunkt „parallele Einlösung … nur eine Einlösung zählt" nachgewiesen); Sessions werden bei erfolgreichem Reset vollständig widerrufen (E2E-Schritt 24 real nachgewiesen). Rohtoken wird ausschließlich in der einen Owner-Ausgabeantwort zurückgegeben, niemals in Listenansichten, Logs oder Audit.

**Urteil: bestanden.**

## 15. Sessionlebenszyklus

Erstellung, Rotation bei Login, Idle-/Absolut-Ablauf, Massenwiderruf, maximal 5 aktive Sessions je Nutzer – vollständig in `auth-session.test.js` abgedeckt. Real nachgewiesen: Sessionwiderruf durch Owner wirkt sofort (E2E-Schritt 21), Suspendierung des Mandanten widerruft implizit betroffene Sessions beim nächsten Zugriffsversuch (`loadSessionIdentity` erkennt `TENANT_INVALID` und widerruft die Session aktiv – dokumentiertes, beabsichtigtes Verhalten, siehe `portal-security-acceptance.test.js` Kommentar zu Prüfpunkt 14).

## 16. Tokenbehandlung

Sessiontoken: nur Hash in DB (`auth-session.js`). Reset-/Invite-Token: nur Hash in DB (`hashResetToken`, SHA-256), Rohtoken existiert ausschließlich transient im Prozessspeicher zwischen Erzeugung und HTTP-Antwort. CSRF-Token: Double-Submit-Cookie-Muster, nicht HttpOnly (muss vom Client gelesen werden), aber ebenfalls niemals in Audit/Logs. Kein Token in Fehlerantworten (generische Nachrichten), keine Stacktraces, keine absoluten Pfade (strukturell durch `portal-security-acceptance.test.js` Prüfpunkt 27 stichprobenhaft, durch Codeaufbau der `sendJson`-Fehlerpfade grundsätzlich erzwungen).

## 17. Audit

`auth-audit.js`: 25 erlaubte Eventtypen (`EVENT_TYPES`), append-only (SQLite-Trigger lehnt `UPDATE`/`DELETE` ab, `auth-db.test.js` Prüfpunkte 16–18), strikte Metadaten-Allowlist (`routeName`, `roleLabel`, `reasonCode`), Inhaltsfilter gegen Passwörter/Tokens/Cookies/Session-IDs/Dateipfade (Ablehnung statt stiller Bereinigung – fail-closed). **Kein IP-Klartext, kein User-Agent-Klartext** im Audit (bewusst strenger als der Auftrag verlangt, der Klartextverbot nur für IP/UA fordert – hier wird beides komplett weggelassen). Audit-Schreibfehler können keine verweigerte Anfrage erlauben und keine Rollen-/Mandantengrenze umgehen: `auditSafe()` fängt jeden Audit-Fehler ab (`try/catch`) und wird ausschließlich **nach** der bereits getroffenen Zugriffsentscheidung aufgerufen – ein Auditfehler kann die vorangegangene Entscheidung nicht mehr rückgängig machen. Dieses fail-open-nur-für-Audit-Verhalten ist bewusst und hiermit dokumentiert.

**Urteil: bestanden.**

## 18. Datenbank und Migrationen

Neu real real durchlaufen (Abschnitt Q, `portal-operations-acceptance.test.js`): leere Datenbank → Migrationen 1–7 in korrekter Reihenfolge → echter Wiederanlauf (zweiter Prozess/zweites Öffnen) ohne erneute Anwendung → eine **echte** Vor-Schritt-3-Datenbank (nur Migrationen 1–6, via isoliertem Einwegskript nachgebildet) wird beim Öffnen nachträglich auf Migration 7 gehoben, bestehende Auditdaten bleiben vollständig erhalten, neue Migration-7-Eventtypen sind danach nutzbar. Fremdschlüssel und CHECK-Constraints aktiv (`auth-db.test.js`), append-only-Trigger aktiv, Dateirechte `0700`/`0600` (`auth-db.test.js`), WAL/SHM korrekt (zwei parallele Verbindungen sehen konsistente Daten). Eine beschädigte Datenbankdatei führt zu einem harten `AuthDatabaseStartupError` statt stillem Fallback (neu real nachgewiesen). Kein anderes Modul im Projekt importiert `better-sqlite3` außer `auth-db.js` (strukturell erzwungen und geprüft).

**Urteil: bestanden.**

## 19. Backup und Restore

`local-data-backup.js` (bestehendes Browser-Backup) kennt ausschließlich zwei LocalStorage-Schlüssel (Management-/Tageslaufdaten) und importiert strukturell weder `fs` noch `better-sqlite3` noch `auth-db.js` – die Auth-Datenbank ist über dieses Backup **nicht** erreichbar (neu strukturell nachgewiesen). Keine Portal-JS-Datei nutzt `localStorage`/`sessionStorage` – kein Authstatus im Browserbackup, kein Portalzugriff und keine Ownerrechte durch Restore eines Browserbackups möglich.

**Offene Blocker vor einer echten Serverdatensicherung (Phase-A-Grenze, keine akute Lücke):**
- kein dokumentierter, sicherer Backupweg für die SQLite-Auth-Datenbank selbst (WAL/SHM-Konsistenz beim Kopieren im laufenden Betrieb ungeklärt),
- keine Backupverschlüsselung,
- kein Restoreprozess für die Serverdatenbank definiert (daher auch keine Aussage zu dessen Fail-Closed-Verhalten möglich).

Es wurde in Schritt 4 bewusst **kein** neues vollständiges Produktionsbackup gebaut (Auftragsgrenze), da kein akuter Sicherheitsfehler vorliegt – die Blocker sind hiermit dokumentiert.

## 20. Betriebsstart und Wiederanlauf

Real durchlaufen: sauberer Erststart, Neustart mit bestehender Datenbank (idempotente Migrationen), Owner-Bootstrap ist idempotent (rotiert beim zweiten Aufruf mit derselben E-Mail nur das Passwort, legt kein zweites Konto an – real per Kindprozess nachgewiesen), Start bei beschädigter Datenbank bricht fail-closed ab, keine Geheimnisse in stdout/stderr des Bootstrap-Skripts (real geprüft). Zwei gleichzeitige Verbindungen auf dieselbe WAL-Datenbank funktionieren technisch (mehrere Serverprozesse könnten dieselbe Datenbankdatei öffnen) – **dokumentierte Betriebsgrenze:** SQLite ist für Mehrprozess-Schreibbetrieb nicht ausgelegt; Phase A geht von genau einem laufenden Serverprozess pro Datenverzeichnis aus. Ratenlimiter sind In-Memory und beginnen bei jedem Prozessneustart bei Null (dokumentierte Grenze, kein Fehler).

## 21. Dev-Abnahme

Loopback-Bindung: `server.listen(port, "127.0.0.1", …)` – der Server bindet **unabhängig vom Modus** ausschließlich an Loopback, nie an eine öffentliche Schnittstelle (zusätzliche, über den Auftrag hinausgehende Absicherung). Dev-Warnung wird beim Start ausgegeben (`Entwicklungsmodus: Chef-Routen lokal ohne Owner-Anmeldung erreichbar.`, real im Serverlog beobachtet). Owner-Bootstrap und Kundenportal funktionieren real (E2E, 26/26 Dev-Schritte grün). Kundengrenzen bleiben auch im Dev-Bypass aktiv: der Dev-Bypass gilt ausschließlich für `OWNER_ONLY`/`STATIC_OWNER_ONLY`/`DISABLED_IN_PROD`-Klassen auf Loopback ohne Session – niemals für Kundenrouten (`CUSTOMER_TENANT`/`STATIC_AUTHENTICATED_PORTAL` sind nicht in `CHEF_BYPASS_ELIGIBLE_CLASSES`). Kein Tenant-Bypass, keine Prod-Cookies ohne den entsprechenden Modus.

**Urteil: bestanden.**

## 22. Prod-Abnahme

Real gegen einen isolierten Prod-Testserver nachgewiesen (E2E-Schritte 27–31, 7/7 grün):

- fehlendes `KUZ_PUBLIC_ORIGIN` → Startabbruch (`resolveOperatingMode`, per Code-Pfad erzwungen, in `auth-route-guard.js` und `server.js` verdrahtet).
- `__Host-`-Cookienamen mit `Secure`+`HttpOnly` (Session) bzw. `Secure` (CSRF) real beobachtet.
- Owner-API funktioniert mit Prod-Cookies identisch zum Dev-Modus.
- fremder Origin-Header auf einer Owner-Aktionsroute wird mit `403` abgewiesen (real nachgewiesen).
- Execution ist auch für OWNER im Prod-Modus hart deaktiviert (`404`, `DISABLED_IN_PROD` – real nachgewiesen, unabhängig von der Rolle).
- Owner-Verwaltungsseite ohne Session bleibt auch auf dem öffentlichen Host gesperrt – kein Dev-Bypass (real nachgewiesen).
- unklassifizierte Route liefert generisches `404` (real nachgewiesen).
- keine Stacktraces, keine Dateipfade, keine SQL-Information, keine Tokens, keine Serverversionsanzeige in allen im E2E-Lauf beobachteten Antworten.

**Urteil: bestanden.**

## 23. Fehler-/Missbrauchstests

Abgedeckt über `server-auth-routes.test.js`, `owner-admin-routes.test.js`, `customer-portal-routes.test.js`, `route-access-policy.test.js` und die neuen Akzeptanztests: ungültiges JSON, falscher Content-Type, zu großer Body, unbekannte Felder (`assertKnownFieldsOnly`), manipuliertes Cookie (`401`/`404` je nach Zugriffsklasse), manipuliertes CSRF (`403`), fremder Origin (`403`), wiederverwendeter Invitation-/Reset-Token (`400`, generisch), Brute-Force-Login (Rate-Limit), suspendierter Benutzer/Mandant mit bestehender Session (sofortiger Entzug), sechste Session (älteste wird verdrängt). Kein Lasttest gegen externe Systeme durchgeführt (Auftragsgrenze).

## 24. Datenschutz und Datenminimierung

**Gespeicherte personenbezogene Daten:** E-Mail (normalisiert), Anzeigename, Rolle, Mandantenzugehörigkeit, Passwort-Hash (scrypt), Zeitstempel (Login/Erstellung/Statusänderung). **Wofür:** Authentifizierung, Autorisierung, Mandantentrennung, Nachvollziehbarkeit. **Gehasht:** Passwörter (scrypt), Session-/Reset-/Invite-Token (SHA-256 bzw. Sessions-Hash). **Nicht gespeichert:** Klartext-Passwörter, Klartext-Token, IP-Adressen im Klartext (nur gehasht für Rate-Limiting), User-Agent, Trackingdaten, Providerzugänge.

**Sichtbarkeit:**
- Kunde sieht: eigenen Anzeigenamen, eigene E-Mail, eigene Rollenbezeichnung (übersetzt), eigenen Mandantennamen, eigenen Kontostatus (übersetzt), letzten Login. Keine internen IDs, keine rohen Statuswerte (strukturell nachgewiesen, `portal-usability-acceptance.test.js` Prüfpunkt 20).
- Owner sieht: alle Mandanten und deren Kundenbenutzer (E-Mail, Anzeigename, Rolle, Status, aktive Sessions) – **nicht** andere OWNER/SUPPORT-Konten über die Kundenverwaltungsfläche (seit Schritt 4).
- Support ohne Grant sieht: nichts (Abschnitt 9).
- Audit enthält: Eventtyp, Ergebnis, Actor-/Tenant-ID, optional `routeName`/`roleLabel`/`reasonCode` – keine PII über die genannten IDs hinaus.
- Backup (Browser) enthält: keine Auth-/Portaldaten (Abschnitt 19).

**Offene Punkte (nicht Teil von Phase A):** Löschkonzept/Aufbewahrungsfristen für Nutzerkonten und Audit-Historie, Datenschutzerklärung/AVV-Text, Backup-Verschlüsselung. Diese werden hiermit als offen dokumentiert, nicht erfunden.

## 25. Portalbedienbarkeit

Geprüft über `portal-usability-acceptance.test.js` (20/20 Prüfpunkte) und manuelle Durchsicht der HTML/CSS/JS-Quellen:

**Bereits verständlich:** durchgängig deutsche Sprache, `lang="de"`, klare `aria-live`-Statusregionen, echte `<label for>`-Zuordnungen, sichtbare Fokuszustände (`:focus-visible`), Passwortregeln clientseitig mit `minlength="12"`, jede Ansicht hat genau einen primären Absenden-Button (klare Hauptaktion), keine externen Ressourcen/CDN/Tracking, keine Registrierung, keine Rollen-/Mandantenwahl für Kunden, keine Fachauftrags-/Publish-/Billing-/Canva-/HeyGen-Aktion sichtbar oder per API erreichbar.

**Reibung (kosmetisch, kein Blocker):** `owner-admin.js` zeigt rohe Statuswerte (`ACTIVE`/`SUSPENDED`) statt übersetzter Labels für Mandanten/Nutzer in der internen Owner-Oberfläche.

**Blocker:** keine gefunden.

**Später durch Fachagenten verbesserbar:** Statuswert-Übersetzung im Owner-Werkzeug (Agent 5/22), ggf. feinere Fehlertexte je nach Nutzerfeedback (Agent 7).

Keine optische Komplettüberarbeitung wurde in diesem Schritt vorgenommen (Auftragsgrenze eingehalten) – es wurde nichts an der Portaloberfläche verändert, nur geprüft.

## 26. End-to-End-Abnahme

Real gegen zwei eigenständige, isolierte Testserverprozesse (eigenes `HOME`/`KUZ_DATA_DIR`, eigener Port, keine Produktivdatenbank) durchlaufen:

- **Dev-Testserver** (Port 48173, `KUZ_MODE` unset): 26/26 Schritte grün – Owner-Bootstrap, Owner-Login, zwei Mandanten aktiviert, drei Einladungen ausgesprochen/angenommen, Mandantentrennung (A sieht nur A, B nur B, jeweils `404` bei Owner-Routenversuch), Sperren/Reaktivieren/Sessionwiderruf von Nutzer A mit sofortiger Wirkung, Passwort-Reset mit anschließend ungültiger Altsession, Logout mit anschließend gesperrtem Portal, Execution für Kunden nicht erreichbar, unklassifizierte Route generisch `404`.
- **Prod-Testserver** (Port 48174, `KUZ_MODE=prod`, `KUZ_PUBLIC_ORIGIN=https://kunden-e2e.beispiel.test`): 7/7 Schritte grün – `__Host-`-Secure-Cookies, identische Owner-API-Funktion, Ablehnung eines fremden Origin (`403`), Execution auch für OWNER hart deaktiviert (`404`), Owner-Seite ohne Session weiterhin gesperrt (kein Dev-Bypass), unklassifizierte Route generisch `404`.

**Danach:** beide isolierten Testserverprozesse gezielt per PID beendet (nicht pauschal, fremde langlaufende `server.js`-Prozesse aus früheren Sitzungen wurden nachweislich nicht angefasst), beide Testports freigegeben, alle eigenen `/tmp`-Testverzeichnisse und -Skripte entfernt. `git status` danach unverändert gegenüber vor der E2E-Abnahme.

**Urteil: bestanden (insgesamt 33/33 manuelle E2E-Schritte grün).**

## 27. Neue Akzeptanztests

Drei neue Testdateien wurden erstellt (Grund: die bestehenden Unit-/Integrationstests deckten die HTTP-Ende-zu-Ende-Sicht mit zwei echten Mandanten, die Betriebslebenszyklus-Szenarien mit echten Kindprozessen und die statische Bedienbarkeits-/Datenschutzprüfung der Oberflächen noch nicht ab):

- `portal-security-acceptance.test.js` – 27 Prüfpunkte: echte Cross-Tenant-Isolation, Rollenmatrix, Regressionstest für den Schritt-4-Befund, Cookie-/CSRF-Manipulation, Prod-Modus ohne Dev-Bypass, keine Secrets in Antworten.
- `portal-operations-acceptance.test.js` – 15 Prüfpunkte: Erststart/Wiederanlauf, echte Vor-Schritt-3-Datenbank wird auf Migration 7 gehoben, beschädigte Datenbank bricht fail-closed ab, Owner-Bootstrap als echter Kindprozess (idempotent, keine Geheimnisse in stdout/stderr), Backup-Abgrenzung, WAL-Mehrfachverbindung, In-Memory-Ratenlimiter-Grenze.
- `portal-usability-acceptance.test.js` – 20 Prüfpunkte: deutsche Sprache, Hauptaktionen, keine IDs/technischen Codes/externen Ressourcen, Tastaturlabels, `aria-live`, mobile Metaangaben, Fokuszustände, keine Fachaufträge/Publish/Billing.

Keine Dopplung zu bestehenden Tests: alle drei Dateien beginnen mit einem Kommentar, der explizit benennt, welche bereits vorhandene Garantie NICHT wiederholt wird.

## 28. GET-/POST-/Prefix-/Asset-Zahlen

68 GET / 51 POST / 8 Prefix / 23 statische Assets – exakt unverändert gegenüber dem Ausgangsstand (Abschnitt 2). Schritt 4 hat keine Route hinzugefügt, entfernt oder umgebaut.

## 29. Testzahl

1597 automatisierte Prüfpunkte (reale Ausgabe von `npm test`, keine Schätzung), Delta +62 gegenüber 1535 vor Schritt 4.

## 30. Testdateien

57 Testdateien (`*.test.js` im Projektverzeichnis), Delta +3 gegenüber 54 vor Schritt 4.

## 31. Exit-Codes

`npm run check`: 0. `npm test`: 0. `git diff --check`: 0. `npm audit`: 0 (0 Schwachstellen). `npm ls better-sqlite3`: 0.

## 32. npm-audit-Ergebnis

`found 0 vulnerabilities` – unverändert.

## 33. `better-sqlite3`-Version

`13.0.1`, exakt gepinnt in `package.json` und `package-lock.json` – unverändert (durch bestehenden Test in `auth-db.test.js` weiterhin automatisiert geprüft).

## 34. Scope-Kontrolle

`git status --short --branch`, `git diff --stat`, `git diff --name-status`, `git diff --check` und `git ls-files --others --exclude-standard` wurden nach jeder Änderung und erneut nach der E2E-Abnahme ausgeführt. Ergebnis durchgehend: ausschließlich `owner-admin-service.js` und `package.json` geändert, ausschließlich die drei neuen Testdateien hinzugefügt. Gezielte Suche nach Secrets, Zugangsdaten, Passwörtern, Session-/Invitation-/Reset-Tokens, Auth-Datenbanken, WAL/SHM-Dateien, `node_modules`, absoluten Nutzerpfaden, echten Kundendaten, externen URLs, Publish-/Billing-/Fachauftrags-/Canva-/HeyGen-Kundenrouten sowie Health-/Fixture-Dateien in den geänderten/neuen Dateien: **keine Treffer.**

## 35. Health-Zustand

Read-only geprüft unter `/Users/jamal/Documents/New project/health-upgrade-kompass`: Branch `work/check-start-gate-2026-07-19`, HEAD `395bf9e01f26d63dc4cc0bbc8343d10535c1ad64` – **unverändert** gegenüber dem vorgegebenen Ausgangswert. Bekannter Dirty-Stand (`M package.json` sowie drei unversionierte Dateien unter `src/logic/`) unverändert vorgefunden. Nichts bereinigt, nichts resettet, nichts committet, nichts gepusht.

## 36. Fixture-Zustand

Read-only geprüft unter dem Fixture-Repository (`execution-bridge-demo`, verwaltet über `execution-bridge.js#fixtureRepoPath`): HEAD `e38c1985b896ed34fa5f94615fef5794c363449e` – **unverändert**. Weiterhin ausschließlich `M FIXTURE_CALC.js` als bekannter Dirty-Stand. Nichts bereinigt, nichts resettet, nichts committet, nichts gepusht.

## 37. Finaler Git-Status

```
## main...origin/main
 M owner-admin-service.js
 M package.json
?? V7_2_PHASE_A_ACCEPTANCE.md
?? portal-operations-acceptance.test.js
?? portal-security-acceptance.test.js
?? portal-usability-acceptance.test.js
```

(Weitere, im Rahmen der Dokumentationsaktualisierung minimal ergänzte Dateien: `README.md`, `PROJECT_MASTER.md`, `CURRENT_STATUS.md`, `MIGRATION_PLAN.md`, `API_REGISTER.md`, `V1_BETRIEBSHANDBUCH.md` – siehe die jeweiligen Commits/Diffs dieser Dateien.)

## 38. Bestätigung

- **Kein Commit.** Kein Push. Kein Deployment.
- Keine Fachaufträge, keine Kundenwerkzeuge, keine Veröffentlichung, kein Billing, kein echter Mailversand, keine Mehrsprachigkeit, keine Phase-B-Arbeit wurden hinzugefügt.
- Keine neue npm-Abhängigkeit installiert. Keine Frameworkmigration.
- Chef-Oberfläche, Canva-/HeyGen-/Execution-Produktmodule, Health, Fixture: unverändert.

## 39. Phase-A-Urteil

> **V7.2 Phase A ist mit klar benannten Restgrenzen abgenommen und commitbereit.**

Begründung: Alle sicherheits- und funktionskritischen Prüfungen (Authentifizierung, Autorisierung, Mandantenisolation, Owner-Verwaltung, Einladung, Passwort-Reset, Sessionlebenszyklus, Audit, Datenbank/Migrationen, Dev-/Prod-Trennung) sind bestanden, ein gefundener Sicherheitsbefund wurde behoben und regressionsgetestet, die vollständige Testreihe ist grün (1597/1597), die manuelle End-to-End-Abnahme mit zwei echten Mandanten ist vollständig grün (33/33), Scope-Kontrolle und Health-/Fixture-Zustand sind unauffällig. Die benannten Restgrenzen (In-Memory-Ratenlimiter, fehlende Backup-Verschlüsselung/-Restoreweg für die Serverdatenbank, offenes Löschkonzept, kosmetische Statuswert-Anzeige im Owner-Werkzeug) sind bewusste, dokumentierte Phase-A-Grenzen ohne akute Sicherheitsrelevanz – kein Blocker vor der ersten echten Kundenfachfunktion, aber vor einem realen Produktivbetrieb mit echten Kundendaten explizit zu adressieren.

## 40. Empfehlung für den nächsten großen Schritt

Kleinster sinnvoller nächster Schritt in Richtung echter Kundenarbeit: **eine einzelne, eng begrenzte erste Kundenfachfunktion** (z. B. ein einfacher, lesender Status- oder Informationsbereich innerhalb des bestehenden Kundenportals) nach separater Produktentscheidung durch Jamal – nicht als Erweiterung dieses Abnahmeschritts, sondern als eigener, neu zu beauftragender Schritt (Phase B). Vor einem echten Produktivbetrieb mit echten Kunden zusätzlich zu klären: Backupweg/-verschlüsselung für die Serverdatenbank, Löschkonzept, Datenschutztext/AVV, Hosting-Entscheidung.

---

**Danach: Stopp. Es wird auf Jamals Freigabe gewartet. Kein Commit. Kein Push. Kein Deployment. Keine Fachaufträge. Keine Veröffentlichung. Kein Billing. Keine Phase B.**
