"use strict";

// V7.2 Phase B Schritt 1 (Auftrag Abschnitt M) – Bedienbarkeits-/Wortlaut-
// Abnahme der neuen Arbeitsauftrags-Oberflächen. Reine Quelltext-/
// Struktur-Prüfung ohne Browser (gleiches Muster wie
// portal-usability-acceptance.test.js), ergänzt um die dort noch nicht
// erfassten neuen Dateien (portal-work-order-new.html/portal-work-order.js/
// owner-work-orders.html/owner-work-orders.js) sowie die Erweiterungen an
// portal.html/portal-ui.js/portal.css.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const REPO_ROOT = __dirname;

function readFile(name) {
  return fs.readFileSync(path.join(REPO_ROOT, name), "utf8");
}

const WORK_ORDER_HTML_FILES = ["portal.html", "portal-work-order-new.html", "owner-work-orders.html"];
const WORK_ORDER_JS_FILES = ["portal-ui.js", "portal-work-order.js", "owner-work-orders.js"];
const WORK_ORDER_TEXT_FILES = [...WORK_ORDER_HTML_FILES, ...WORK_ORDER_JS_FILES, "portal.css"];

function extractVisibleHtmlText(source) {
  return source.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
}

// ---------------------------------------------------------------------------
// 1. Deutsche Haupttexte.
// ---------------------------------------------------------------------------

check("die neuen Arbeitsauftrags-Seiten deklarieren lang=\"de\" und tragen deutsche Überschriften", () => {
  const newOrderHtml = readFile("portal-work-order-new.html");
  const ownerHtml = readFile("owner-work-orders.html");
  assert.match(newOrderHtml, /<html lang="de">/);
  assert.match(ownerHtml, /<html lang="de">/);
  assert.match(newOrderHtml, /Neuen Arbeitsauftrag anlegen/);
  assert.match(ownerHtml, /Arbeitsaufträge/);
});

// ---------------------------------------------------------------------------
// 2. Klare Hauptaktion.
// ---------------------------------------------------------------------------

check("die Kundenseite zur Auftragserstellung hat genau einen primären Absenden-Button", () => {
  const source = readFile("portal-work-order-new.html");
  const primaryButtons = source.match(/<button class="portal-button" type="submit">/g) || [];
  assert.strictEqual(primaryButtons.length, 1);
  assert.match(source, />Arbeitsauftrag absenden</);
});

check("die Kundenportal-Startseite bietet genau eine sichtbare Hauptaktion zum Anlegen eines Auftrags an", () => {
  const source = readFile("portal.html");
  const createLinks = source.match(/href="\/portal\/auftrag-neu"/g) || [];
  assert.strictEqual(createLinks.length, 1);
  // Die Detail-/Resubmit-Ansicht ist standardmäßig verborgen (hidden), damit
  // niemals zwei konkurrierende Hauptaktionen gleichzeitig sichtbar sind.
  assert.match(source, /id="work-order-detail-section" hidden/);
});

// ---------------------------------------------------------------------------
// 3+28+29. Pflichtfelder korrekt (nur Titel/gewünschtes Ergebnis Pflicht).
// ---------------------------------------------------------------------------

check("im Anlegen-Formular sind ausschließlich Titel und gewünschtes Ergebnis Pflichtfelder", () => {
  const source = readFile("portal-work-order-new.html");
  assert.match(source, /id="wo-title"[^>]*required/);
  assert.match(source, /<textarea id="wo-desired-result"[^>]*required/);
  assert.doesNotMatch(source, /id="wo-context"[^>]*required/);
  assert.doesNotMatch(source, /id="wo-deadline"[^>]*required/);
});

// ---------------------------------------------------------------------------
// 4+5+6+7+8. Keine Tenant-/Rollen-/Providerwahl, keine Kostenfreigabe,
//            keine Veröffentlichung – weder als Formularfeld noch als
//            sichtbarer Text.
// ---------------------------------------------------------------------------

check("keine der neuen Seiten bietet eine Mandanten- oder Rollenauswahl an", () => {
  WORK_ORDER_HTML_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /name="tenant"|name="customerId"|name="mandant"|name="role"|name="rolle"/i, file);
  });
});

check("keine der neuen Seiten erwähnt Provider, Kostenfreigabe oder Veröffentlichung als Kundenaktion", () => {
  WORK_ORDER_HTML_FILES.forEach((file) => {
    const visibleText = extractVisibleHtmlText(readFile(file));
    assert.doesNotMatch(visibleText, /provider|kostenfreigabe|veröffentlich|publish|billing|rechnung|zahlung/i, file);
  });
});

check("keine der neuen Seiten verwendet technische Begriffe wie Payload/Tenant/Execution/Workflow/Agent im sichtbaren Text", () => {
  WORK_ORDER_HTML_FILES.forEach((file) => {
    const visibleText = extractVisibleHtmlText(readFile(file));
    assert.doesNotMatch(visibleText, /payload|execution|workflow|\bagent\b/i, file);
  });
});

// ---------------------------------------------------------------------------
// 9+10. Statusübersetzungen und ehrliche, neutrale Statusmeldungen
//       (Quelle: work-order-service.js, von beiden UI-Skripten unverändert
//       weitergereicht statt eigenständig übersetzt). Produktkorrektur:
//       kein APPROVED/REJECTED durch den OWNER mehr, kein Owner als
//       Pflichtstation – nur READY_FOR_PROCESSING/ESCALATED/CANCELLED
//       tragen eine erklärende customerMessage.
// ---------------------------------------------------------------------------

check("work-order-service.js übersetzt jeden erreichbaren Status in genau den im Auftrag vorgegebenen deutschen Text", () => {
  const workOrderService = require("./work-order-service");
  assert.deepStrictEqual(workOrderService.REACHABLE_STATUS_VALUES, [
    "DRAFT",
    "SUBMITTED",
    "NEEDS_CLARIFICATION",
    "READY_FOR_PROCESSING",
    "ESCALATED",
    "CANCELLED",
  ]);
  workOrderService.REACHABLE_STATUS_VALUES.forEach((status) => {
    assert.notStrictEqual(workOrderService.statusLabel(status), "Unbekannt", `Status ${status} ohne deutschen Text`);
  });
  // Kein APPROVED/REJECTED (regulär durch den OWNER) mehr im Statusmodell.
  assert.strictEqual(workOrderService.STATUS_LABELS.APPROVED, undefined);
  assert.strictEqual(workOrderService.STATUS_LABELS.REJECTED, undefined);
});

check("die ehrliche READY_FOR_PROCESSING-Kundenmeldung behauptet keine bereits laufende Ausführung", () => {
  const source = readFile("work-order-service.js");
  assert.match(source, /Die Bearbeitung durch Agenten ist in diesem Schritt noch nicht gestartet\./);
  assert.doesNotMatch(source, /wird jetzt bearbeitet|Agent(en)? (arbeitet|arbeiten) bereits/);
});

check("portal-ui.js übernimmt statusLabel/statusNote/customerMessage unverändert vom Server statt eigene Statustexte zu erfinden", () => {
  const source = readFile("portal-ui.js");
  assert.match(source, /workOrder\.statusLabel/);
  assert.match(source, /workOrder\.statusNote/);
  assert.match(source, /workOrder\.customerMessage/);
  // Keine hartkodierte zweite Übersetzungstabelle im Client (Single Source
  // of Truth bleibt work-order-service.js#STATUS_LABELS).
  assert.doesNotMatch(source, /"Bereit zur Bearbeitung"|"Rückfrage offen"|"In besonderer Prüfung"/);
});

// ---------------------------------------------------------------------------
// 11+12. Keine technischen IDs oder internen Statuscodes für Kunden
//        sichtbar (nur für Owner als interne Rolle unkritisch).
// ---------------------------------------------------------------------------

check("das Kundenportal zeigt niemals eine rohe Arbeitsauftrags-ID oder einen rohen Statuscode als sichtbaren Text an", () => {
  const source = readFile("portal-ui.js");
  // .id wird ausschließlich für Fetch-URLs/Klick-Handler verwendet, niemals
  // per textContent/innerHTML/innerText gerendert.
  assert.doesNotMatch(source, /textContent\s*=\s*workOrder\.id\b/);
  assert.doesNotMatch(source, /textContent\s*=\s*[^;]*workOrder\.status\b(?!Label)/);
  const newOrderHtml = readFile("portal-work-order-new.html");
  assert.doesNotMatch(newOrderHtml, /workOrderId|\{\{id\}\}/i);
});

// ---------------------------------------------------------------------------
// 13. aria-live-Statusregionen auf allen neuen Seiten.
// ---------------------------------------------------------------------------

check("jede neue Arbeitsauftrags-Seite hat eine role=\"status\" aria-live=\"polite\"-Statusregion", () => {
  WORK_ORDER_HTML_FILES.forEach((file) => {
    assert.match(readFile(file), /role="status" aria-live="polite"/, `${file} ohne aria-live-Statusregion`);
  });
});

// ---------------------------------------------------------------------------
// 14. Echte <label for=...> für jedes Formularfeld.
// ---------------------------------------------------------------------------

check("jedes Eingabefeld der neuen Arbeitsauftrags-Seiten besitzt ein echtes <label for=...>", () => {
  WORK_ORDER_HTML_FILES.forEach((file) => {
    const source = readFile(file);
    const inputIds = Array.from(source.matchAll(/<input id="([^"]+)"/g)).map((m) => m[1]);
    const textareaIds = Array.from(source.matchAll(/<textarea id="([^"]+)"/g)).map((m) => m[1]);
    [...inputIds, ...textareaIds].forEach((id) => {
      assert.match(source, new RegExp(`<label for="${id}">`), `${file}: Feld ${id} ohne zugehöriges <label for>`);
    });
  });
});

// ---------------------------------------------------------------------------
// 15. Sichtbare Fokuszustände für die neu ergänzten Elemente
//     (Textarea/Listeneinträge/Link-Buttons).
// ---------------------------------------------------------------------------

check("portal.css definiert sichtbare Fokuszustände auch für Textarea, Listeneinträge und Link-Buttons", () => {
  const css = readFile("portal.css");
  assert.match(css, /\.portal-field textarea:focus-visible/);
  assert.match(css, /\.portal-list-item:focus-visible/);
  assert.match(css, /button\.portal-link:focus-visible/);
});

// ---------------------------------------------------------------------------
// 16. Mobile Metaangaben.
// ---------------------------------------------------------------------------

check("beide neuen HTML-Seiten haben ein Viewport-Meta für mobile Darstellung", () => {
  ["portal-work-order-new.html", "owner-work-orders.html"].forEach((file) => {
    assert.match(readFile(file), /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/, file);
  });
});

// ---------------------------------------------------------------------------
// 17+18. Keine externen Ressourcen, kein Tracking.
// ---------------------------------------------------------------------------

check("keine der neuen Arbeitsauftrags-Dateien referenziert eine externe URL, ein CDN oder eine Google-Schriftart", () => {
  WORK_ORDER_TEXT_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /https?:\/\//i, `${file} referenziert eine absolute URL`);
    assert.doesNotMatch(source, /\/\/(fonts|cdn|ajax)\./i, file);
  });
});

check("keine der neuen HTML-Seiten lädt ein <script>/<link> von einer fremden Origin", () => {
  ["portal-work-order-new.html", "owner-work-orders.html"].forEach((file) => {
    const source = readFile(file);
    const srcRefs = Array.from(source.matchAll(/(?:src|href)="([^"]+)"/g)).map((m) => m[1]);
    srcRefs.forEach((ref) => assert.ok(ref.startsWith("/"), `${file}: Referenz "${ref}" ist nicht lokal/relativ`));
  });
});

check("keine der neuen Arbeitsauftrags-JS-Dateien führt einen fetch()-Aufruf auf eine absolute fremde URL aus", () => {
  ["portal-ui.js", "portal-work-order.js", "owner-work-orders.js"].forEach((file) => {
    const source = readFile(file);
    const fetchCalls = Array.from(source.matchAll(/fetch\(\s*["']([^"']+)["']/g)).map((m) => m[1]);
    fetchCalls.forEach((url) => assert.ok(url.startsWith("/"), `${file}: fetch() auf "${url}" ist nicht lokal/relativ`));
  });
});

check("keine der neuen Arbeitsauftrags-Dateien enthält ein Tracking-/Analytics-Muster", () => {
  WORK_ORDER_TEXT_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /gtag|google-analytics|analytics\.js|facebook\.net|fbq\(|pixel/i, file);
  });
});

// ---------------------------------------------------------------------------
// 19+20. Kein LocalStorage/SessionStorage.
// ---------------------------------------------------------------------------

check("keine der neuen Arbeitsauftrags-JS-Dateien verwendet localStorage oder sessionStorage", () => {
  ["portal-ui.js", "portal-work-order.js", "owner-work-orders.js"].forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /\blocalStorage\b/, file);
    assert.doesNotMatch(source, /\bsessionStorage\b/, file);
  });
});

// ---------------------------------------------------------------------------
// Zusatz (Produktkorrektur): Der OWNER hat kein reguläres Prüfformular mehr
// mit approve/reject/request-clarification. Es gibt nur noch genau zwei
// Ausnahmeaktionen (escalate/stop), beide verlangen zwingend einen Grund
// (clientseitig gespiegeltes Pflichtfeld, serverseitig ohnehin erzwungen).
// ---------------------------------------------------------------------------

check("das Owner-Ausnahmeformular verlangt einen Grund (Pflichtfeld) für genau zwei Aktionen (escalate/stop), keine approve/reject/request-clarification-Route mehr", () => {
  const source = readFile("owner-work-orders.html");
  assert.match(source, /<textarea id="action-reason"[^>]*required/);
  const actionButtons = source.match(/data-action="(escalate|stop)"/g) || [];
  assert.strictEqual(actionButtons.length, 2);
  assert.doesNotMatch(source, /data-action="(approve|reject|request-clarification)"/);
  assert.doesNotMatch(source, /id="review-owner-note"/);
});

console.log(`work-order-ui.test.js: ${passed} Prüfpunkte erfolgreich`);
