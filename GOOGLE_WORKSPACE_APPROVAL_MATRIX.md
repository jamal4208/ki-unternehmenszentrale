# Google-Workspace-Freigabematrix (V7.6.1)

Konto für alle 33 Fähigkeiten unten: `office@jacogbr.de` (Status:
`ACCOUNT_PREPARED_EXTERNALLY_OR_PENDING_CONFIRMATION`, siehe
`APPLE_GOOGLE_OPERATING_MODEL.md`). Diese Matrix ist die menschenlesbare,
ausführliche Fassung von `google-workspace-capability-service.js` (Quelle der
Wahrheit) und `office-finance-routes.js#buildApprovalMatrixRow` (kompakte
UI-Fassung unter `/api/office-finance/approval-matrix`) – eine einzige
inhaltliche Wahrheit, dreifach dargestellt.

**Aktuelle Stufe jeder Fähigkeit in V7.6.1: `DISCONNECTED`.** Es besteht
keine echte Verbindung zu Google. Die Spalte „Empfohlene Pilotphase" nennt
die künftig sinnvolle erste Testphase – keine davon wird durch dieses
Dokument oder durch V7.6.1 selbst ausgelöst.

## Prinzipien

1. Lesen, Vorbereiten und Ausführen sind immer getrennte Fähigkeiten mit
   getrennter Freigabe.
2. Kleinste Berechtigung zuerst – jeder Pilot beginnt mit `READ_METADATA`
   oder `PREPARE_DRAFT`, niemals direkt mit Schreibzugriff.
3. Keine breiten OAuth-Scopes ohne konkreten Bedarf (z. B. kein
   `gmail.readonly` für den vollständigen Posteingang, wenn
   `gmail.metadata` für den Piloten genügt).
4. Keine vollständige Mailboxfreigabe, wenn Metadaten genügen.
5. Keine Schreibrechte für den ersten Pilot.
6. Senden, Löschen, Teilen und externe Einladung sind immer gesondert
   freizugeben – niemals Teil einer allgemeinen „Schreibfreigabe".

## Berechtigungsstufen (acht Stufen)

`DISCONNECTED` → `AUTHENTICATED_NO_ACCESS` → `READ_METADATA` →
`READ_CONTENT` → `PREPARE_DRAFT` → `JAMAL_APPROVED_WRITE` →
`LIMITED_AUTOMATED_WRITE` → `BLOCKED`.

Für V7.6.1 gilt technisch und fachlich verbindlich:

- maximal lokaler Zielstatus: `PREPARE_DRAFT`
- reale Verbindung bleibt `DISCONNECTED` oder `AUTHENTICATION_PENDING`
- kein `JAMAL_APPROVED_WRITE` wird tatsächlich aktiviert
- `LIMITED_AUTOMATED_WRITE` ist ausschließlich eine dokumentierte
  Zukunftsoption, kein Codepfad erreicht sie
- kein automatischer Stufenwechsel – jede Erhöhung ist ein separater,
  manueller, von Jamal freigegebener Schritt

## Fähigkeiten je Kategorie (33 gesamt: 12 Gmail + 8 Calendar + 9 Drive/Docs + 4 Contacts)

## Gmail (12 Fähigkeiten)

| Aktion | Agent | Datenart | Aktuelle Stufe | Min. OAuth-Berechtigung (künftig) | Risiko | Sichtbare Auswirkung | Jamal-Freigabe | Erneute Freigabe je Ausführung | Audit | Rückgängig | Empfohlene Pilotphase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| READ_MESSAGE_METADATA | communication-agent | LOW | DISCONNECTED | gmail.metadata / gmail.readonly (je nach Tiefe) | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_MESSAGE | communication-agent | MEDIUM | DISCONNECTED | gmail.metadata / gmail.readonly (je nach Tiefe) | MEDIUM | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_THREAD | communication-agent | MEDIUM | DISCONNECTED | gmail.metadata / gmail.readonly (je nach Tiefe) | MEDIUM | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_ATTACHMENT | communication-agent | HIGH | DISCONNECTED | gmail.metadata / gmail.readonly (je nach Tiefe) | HIGH | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| PREPARE_DRAFT | communication-agent | MEDIUM | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | LOW | NONE | Nein | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| PREPARE_REPLY_DRAFT | communication-agent | MEDIUM | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | LOW | NONE | Nein | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| SUBMIT_DRAFT_FOR_APPROVAL | communication-agent | MEDIUM | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | LOW | NONE | Ja | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| SEND_MESSAGE | communication-agent | HIGH | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | HIGH | DIRECT_EXTERNAL_COMMUNICATION | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| FORWARD_MESSAGE | communication-agent | HIGH | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | HIGH | DIRECT_EXTERNAL_COMMUNICATION | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| ARCHIVE_MESSAGE | communication-agent | LOW | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | LOW | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| LABEL_MESSAGE | communication-agent | LOW | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | LOW | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| DELETE_MESSAGE | communication-agent | HIGH | DISCONNECTED | gmail.compose (nur Entwurf) bzw. gmail.send (nur mit Freigabe) | HIGH | DATA_LOSS_RISK | Ja | Ja | Ja | Nein – gesperrt | spätere, separat freizugebende Phase |

## Calendar (8 Fähigkeiten)

| Aktion | Agent | Datenart | Aktuelle Stufe | Min. OAuth-Berechtigung (künftig) | Risiko | Sichtbare Auswirkung | Jamal-Freigabe | Erneute Freigabe je Ausführung | Audit | Rückgängig | Empfohlene Pilotphase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| READ_CALENDAR_LIST | workflow-agent | LOW | DISCONNECTED | calendar.readonly | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_EVENTS | workflow-agent | MEDIUM | DISCONNECTED | calendar.readonly | MEDIUM | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| CHECK_AVAILABILITY | workflow-agent | MEDIUM | DISCONNECTED | calendar.readonly | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| PREPARE_EVENT_DRAFT | workflow-agent | MEDIUM | DISCONNECTED | calendar.events (nur mit Freigabe) | LOW | NONE | Nein | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| CREATE_EVENT | workflow-agent | MEDIUM | DISCONNECTED | calendar.events (nur mit Freigabe) | MEDIUM | EXTERNAL_VISIBILITY_TO_INVITEES | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| UPDATE_EVENT | workflow-agent | MEDIUM | DISCONNECTED | calendar.events (nur mit Freigabe) | MEDIUM | EXTERNAL_VISIBILITY_TO_INVITEES | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| RESPOND_INVITATION | workflow-agent | MEDIUM | DISCONNECTED | calendar.events (nur mit Freigabe) | MEDIUM | DIRECT_EXTERNAL_COMMUNICATION | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| DELETE_EVENT | workflow-agent | MEDIUM | DISCONNECTED | calendar.events (nur mit Freigabe) | HIGH | EXTERNAL_VISIBILITY_TO_INVITEES | Ja | Ja | Ja | Nein – gesperrt | spätere, separat freizugebende Phase |

## Drive/Docs (9 Fähigkeiten)

| Aktion | Agent | Datenart | Aktuelle Stufe | Min. OAuth-Berechtigung (künftig) | Risiko | Sichtbare Auswirkung | Jamal-Freigabe | Erneute Freigabe je Ausführung | Audit | Rückgängig | Empfohlene Pilotphase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| READ_FOLDER_STRUCTURE | documentation-agent | LOW | DISCONNECTED | drive.readonly | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| SEARCH_DOCUMENTS | documentation-agent | MEDIUM | DISCONNECTED | drive.readonly | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_DOCUMENT | documentation-agent | MEDIUM | DISCONNECTED | drive.readonly | MEDIUM | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| PREPARE_DOCUMENT_DRAFT | documentation-agent | MEDIUM | DISCONNECTED | drive.file (nur mit Freigabe) | LOW | NONE | Nein | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| CREATE_DOCUMENT | documentation-agent | MEDIUM | DISCONNECTED | drive.file (nur mit Freigabe) | MEDIUM | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| UPDATE_DOCUMENT | documentation-agent | MEDIUM | DISCONNECTED | drive.file (nur mit Freigabe) | MEDIUM | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| MOVE_FILE | documentation-agent | LOW | DISCONNECTED | drive.file (nur mit Freigabe) | LOW | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| SHARE_FILE | documentation-agent | HIGH | DISCONNECTED | drive.file (nur mit Freigabe) | HIGH | EXTERNAL_VISIBILITY_TO_RECIPIENTS | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |
| DELETE_FILE | documentation-agent | HIGH | DISCONNECTED | drive.file (nur mit Freigabe) | HIGH | DATA_LOSS_RISK | Ja | Ja | Ja | Nein – gesperrt | spätere, separat freizugebende Phase |

## Contacts (4 Fähigkeiten)

| Aktion | Agent | Datenart | Aktuelle Stufe | Min. OAuth-Berechtigung (künftig) | Risiko | Sichtbare Auswirkung | Jamal-Freigabe | Erneute Freigabe je Ausführung | Audit | Rückgängig | Empfohlene Pilotphase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEARCH_CONTACT | customer-value-agent | MEDIUM | DISCONNECTED | contacts.readonly | LOW | NONE | Nein | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| READ_CONTACT_DETAILS | customer-value-agent | HIGH | DISCONNECTED | contacts.readonly | MEDIUM | NONE | Ja | Nein | Ja | Ja | spätere, separat freizugebende Phase |
| PREPARE_CONTACT_DRAFT | customer-value-agent | MEDIUM | DISCONNECTED | contacts (nur mit Freigabe) | LOW | NONE | Nein | Ja | Ja | Ja | Phase 1 (Lesen/Entwurf) |
| CREATE_OR_UPDATE_CONTACT | customer-value-agent | HIGH | DISCONNECTED | contacts (nur mit Freigabe) | MEDIUM | NONE | Ja | Ja | Ja | Ja | spätere, separat freizugebende Phase |

## Verweise

- Systemlandkarte und Zielarchitektur: `APPLE_GOOGLE_OPERATING_MODEL.md`
- Aktivierungsschritte: `V7.6_GOOGLE_WORKSPACE_ACTIVATION_CHECKLIST.md`
- Code (Quelle der Wahrheit für alle Werte oben):
  `google-workspace-capability-service.js`
- API (kompakte, für die UI gedachte Fassung derselben Daten):
  `GET /api/office-finance/approval-matrix`
