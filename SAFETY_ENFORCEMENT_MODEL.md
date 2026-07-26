# Safety-Enforcement-Modell (technische Grundlage)

**Stand:** V7.2 Phase B – Schutz- und Einwilligungsgrundlage, vor Commit der Self-Service-Korrektur.
**Zweck dieses Dokuments:** technische Ergänzung zu `BUSINESS_USE_POLICY.md` – beschreibt, **wie**
das Safety-Gate technisch funktioniert, welche Datenstruktur Verstöße festhält und welche Grenzen
dieser Stand bewusst noch hat.

## 1. Gate-Reihenfolge

```
Kunde sendet Arbeitsauftrag (create ODER resubmit)
  → sanitizeFields()                     (Längen-/Pflichtfeldprüfung, unverändert seit Schritt 1)
  → business-use-policy.js#evaluateWorkOrderContent(fields)
       ALLOW      → weiter zu evaluateAutomaticDecision() (bestehende Vollständigkeitsregel)
       ESCALATE   → Auftrag wird SOFORT mit status=ESCALATED gespeichert, KEINE automatische
                    READY_FOR_PROCESSING-Einstufung, Verstoß in policy_violations protokolliert
       BLOCK      → Auftrag wird NICHT gespeichert, generische Fehlermeldung an den Kunden,
                    Verstoß in policy_violations protokolliert, bei severity=CRITICAL zusätzlich
                    sofortiger Sessionwiderruf des handelnden Benutzers
  → (nur bei ALLOW) authDb.createWorkOrder(...)
```

Das Gate greift **ausschließlich** vor der Speicherung eines Arbeitsauftrags
(`work-order-service.js#createForCustomer` und `#resubmitForCustomer`). Es gibt in diesem Schritt
**keine** Agenten- oder Toolübergabe, an der das Gate zusätzlich greifen müsste – dieser Aufrufpunkt
ist für einen späteren Schritt (automatische Agentenübergabe) bereits als verbindliche Vorgabe
dokumentiert, aber noch nicht implementiert, weil es die Übergabe selbst noch nicht gibt.

## 2. Entscheidungsformen

| Decision | Bedeutung | Auswirkung auf `work_orders` | Auswirkung auf Kunde |
|---|---|---|---|
| `ALLOW` | kein Signal erkannt | normaler Self-Service-Fluss (`READY_FOR_PROCESSING`/`NEEDS_CLARIFICATION`) | normale Statusanzeige |
| `BLOCK` | eindeutiges Signal erkannt | **kein** Datensatz wird angelegt | generische Fehlermeldung, kein Hinweis auf die erkannte Kategorie |
| `ESCALATE` | mehrdeutiges, sensibles Signal erkannt | Datensatz wird direkt mit `status=ESCALATED` angelegt | bestehende neutrale Meldung „Dieser Auftrag wird derzeit gesondert von der Zentrale geprüft." (unverändert aus Schritt 1) |

Jede Antwort des Gates enthält mindestens: `decision`, `reasonCode`, `policyVersion` (siehe
`business-use-policy.js`). `severity` wird zusätzlich zurückgegeben und ist eine von
`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`.

## 3. Verstoß-/Eskalationsprotokoll (`policy_violations`, Migration 9)

Additive Migration, **keine** Änderung an Migration 1–8:

```
policy_violations
  id            TEXT PRIMARY KEY
  tenantId      TEXT NOT NULL   → FOREIGN KEY tenants(id)
  userId        TEXT NOT NULL   → FOREIGN KEY users(id)
  workOrderId   TEXT NULL       → FOREIGN KEY work_orders(id) (NULL bei BLOCK, da kein Auftrag entsteht)
  reasonCode    TEXT NOT NULL   (Kategorie, z. B. "CHILD_SAFETY_VIOLATION" – niemals Auftragstext)
  severity      TEXT NOT NULL   CHECK IN (LOW, MEDIUM, HIGH, CRITICAL)
  actionTaken   TEXT NOT NULL   CHECK IN (BLOCKED, ESCALATED, WARNED, USER_SUSPENDED,
                                           TENANT_SUSPENDED, LICENSE_REVIEW_REQUIRED)
  createdAt     TEXT NOT NULL
```

- **Append-only** (wie `auth_audit_events`): eigene `BEFORE UPDATE`/`BEFORE DELETE`-Trigger verhindern
  nachträgliche Änderung oder Löschung einzelner Verstoßzeilen.
- Es wird **niemals** der vollständige Auftragstext (Titel, gewünschtes Ergebnis, Hintergrund)
  gespeichert – nur die Kategorie (`reasonCode`) und der Schweregrad.
- `actionTaken` deckt sowohl automatische Aktionen dieses Schritts (`BLOCKED`, `ESCALATED`,
  `LICENSE_REVIEW_REQUIRED`) als auch **künftige, manuelle** Owner-Aktionen ab (`WARNED`,
  `USER_SUSPENDED`, `TENANT_SUSPENDED`) – letztere drei Werte existieren bereits in der
  `CHECK`-Aufzählung, werden aber von keiner Funktion dieses Schritts automatisch gesetzt (reine
  Datenmodell-Vorbereitung, analog zu den vier vorbereiteten, aber unerreichbaren
  `work_orders.status`-Werten aus Schritt 1).

## 4. Automatische Maßnahmen je Schweregrad

| Severity | Automatische Maßnahme in diesem Schritt |
|---|---|
| `LOW` | wird von keiner aktuellen Regel erzeugt (reserviert für künftige, feinere Abstufung) |
| `MEDIUM` | Verstoß/Eskalation protokolliert; bei `BLOCK` `actionTaken=BLOCKED`, bei `ESCALATE` `actionTaken=ESCALATED`; **keine** weitere automatische Aktion |
| `HIGH` | wie `MEDIUM`, ausschließlich bei `BLOCK`-Entscheidungen; **keine** weitere automatische Aktion |
| `CRITICAL` | Auftrag wird blockiert (nicht gespeichert), `actionTaken=LICENSE_REVIEW_REQUIRED` protokolliert (= Markierung zur **sofortigen Betreiberprüfung**, keine automatische Kündigung), **zusätzlich** werden alle aktiven Sessions des handelnden Benutzers sofort widerrufen (`authDb.revokeAllSessionsForUser`, Audit-Ereignis `USER_SESSIONS_REVOKED` mit `actorUserId: null`) |

**Bewusst nicht automatisiert, auch nicht bei `CRITICAL`:** Mandantensperre, Benutzersperre (im
Sinne von `status=DISABLED`), Vertragsbeendigung, Lizenzentzug. Diese bleiben – wie in
`BUSINESS_USE_POLICY.md` festgehalten – eine bewusste Betreiberentscheidung von Jamal, die er nach
Prüfung der markierten `policy_violations`-Zeile über die bereits bestehenden Owner-Funktionen
(`suspendUser`/`suspendTenant` in `owner-admin-service.js`, unverändert seit Phase A) selbst
auslösen kann. Es gibt in diesem Schritt **keine eigene Owner-Oberfläche**, die
`policy_violations`-Zeilen anzeigt – das ist ein offener Punkt (siehe Abschnitt 6).

## 5. Wiederholung zählen

`auth-db.js#countPolicyViolationsForUser`/`#countPolicyViolationsForTenant` liefern die reine Anzahl
protokollierter Verstöße. Das ist die „technische Grundlage für eskalierende Maßnahmen" – in diesem
Schritt löst eine höhere Zahl **keine** automatische zusätzliche Aktion aus (kein automatischer
Stufenplan „beim dritten Verstoß automatisch sperren"). Das bewusste Offenlassen verhindert, dass
eine noch unreife, rein musterbasierte Erkennung ohne menschliche Prüfung zu einer automatischen
Kontosperrung führt.

## 6. Grenzen dieses Stands (ehrlich, ohne Übertreibung)

- Die Mustererkennung ist ein **kleiner, konservativer, rein regelbasierter Filter** – kein Modell,
  kein Kontextverständnis, keine Mehrsprachigkeit (nur deutschsprachige Muster), keine
  Umgehungsresistenz (z. B. absichtliche Tippfehler, Umschreibungen oder Fremdsprachen werden nicht
  erkannt).
- Es gibt **keine automatische ESCALATE-Einstufung bei genereller Unsicherheit** – die aktuelle Regel
  kennt nur „Muster erkannt" oder „kein Muster erkannt", keine Zwischenstufe. Das deny-/
  escalate-by-default-Prinzip ist als Vorgabe für eine **künftige** modellgestützte Prüfung
  dokumentiert (siehe `business-use-policy.js`, Kopfkommentar), aber in der aktuellen, rein
  regelbasierten Vorprüfung nicht erforderlich, weil es keine Konfidenzstufe gibt, die es
  anzuwenden gälte.
- Es gibt **keine** Owner-Oberfläche zur Ansicht/Bearbeitung von `policy_violations`.
- Es gibt **keine** Prüfung von Bild-/Video-Inhalten (nur die vier Textfelder eines Arbeitsauftrags).
- Es gibt **keine** automatische Eskalationsstufe bei wiederholten Verstößen.
- Ein späterer, modell- oder providergestützter Sicherheitscheck ist ausdrücklich vorgesehen, aber
  **nicht** Teil dieses Schritts.
