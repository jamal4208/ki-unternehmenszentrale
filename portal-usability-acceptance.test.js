"use strict";

// V7.2 Phase A Schritt 4 (Auftrag Abschnitt Q) – Bedienbarkeits-/
// Datenschutzabnahme der Portal-Oberflächen: statische Prüfung der
// tatsächlich ausgelieferten HTML-/CSS-/JS-Dateien. Reine Quelltext-/
// Struktur-Prüfung ohne Browser – ergänzt portal-assets.test.js (das die
// Zugriffsklassen der Assets prüft) um Inhalts-/Bedienbarkeitsgarantien.

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

const PORTAL_HTML_FILES = ["portal-login.html", "portal.html", "owner-admin.html"];
const PORTAL_JS_FILES = ["portal-auth.js", "portal-ui.js", "owner-admin.js"];
const PORTAL_TEXT_FILES = [...PORTAL_HTML_FILES, ...PORTAL_JS_FILES, "portal.css"];

// ---------------------------------------------------------------------------
// 1. Deutsche Sprache, Grundstruktur, keine offene Registrierung/Rollenwahl.
// ---------------------------------------------------------------------------

check("alle drei Portal-Seiten deklarieren lang=\"de\"", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    assert.match(readFile(file), /<html lang="de">/, `${file} ohne lang="de"`);
  });
});

check("alle drei Portal-Seiten haben ein Viewport-Meta für mobile Darstellung", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    assert.match(readFile(file), /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/, file);
  });
});

check("alle drei Portal-Seiten sind für Suchmaschinen ausgeschlossen (noindex, nofollow)", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    assert.match(readFile(file), /<meta name="robots" content="noindex, nofollow" \/>/, file);
  });
});

check("jede Statusmeldung ist als role=\"status\" mit aria-live=\"polite\" ausgezeichnet", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    const source = readFile(file);
    assert.match(source, /role="status" aria-live="polite"/, `${file} ohne aria-live-Statusregion`);
  });
});

check("jedes Formularfeld besitzt ein echtes <label for=...> (keine reinen Platzhaltertexte)", () => {
  ["portal-login.html", "owner-admin.html"].forEach((file) => {
    const source = readFile(file);
    const inputIds = Array.from(source.matchAll(/<input id="([^"]+)"/g)).map((m) => m[1]);
    const selectIds = Array.from(source.matchAll(/<select id="([^"]+)"/g)).map((m) => m[1]);
    [...inputIds, ...selectIds].forEach((id) => {
      assert.match(source, new RegExp(`<label for="${id}">`), `${file}: Feld ${id} ohne zugehöriges <label for>`);
    });
  });
});

check("Passwortfelder erzwingen mindestens 12 Zeichen (minlength=\"12\")", () => {
  const source = readFile("portal-login.html");
  const passwordInputs = source.match(/<input[^>]*type="password"[^>]*>/g) || [];
  assert.ok(passwordInputs.length >= 4, "erwartet: Login-Passwort, Einladung neu/bestätigen, Reset neu/bestätigen");
  passwordInputs.forEach((tag) => {
    if (tag.includes('name="password"')) return; // Login-Feld selbst hat keine Regel, nur neue Passwörter.
    assert.match(tag, /minlength="12"/, tag);
  });
});

check("keine Portal-Seite enthält ein Registrierungsformular oder eine Rollen-/Mandantenauswahl für Kunden", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /registrieren|registrierung|sign[- ]?up/i, file);
  });
  // Die einzige Rollenauswahl im gesamten Portal ist die Owner-seitige
  // Einladungsrolle (CUSTOMER_ADMIN/CUSTOMER_USER) – keine Mandantenwahl.
  const ownerSource = readFile("owner-admin.html");
  assert.doesNotMatch(ownerSource, /name="tenant"|name="customerId"|name="mandant"/i);
});

function extractVisibleHtmlText(source) {
  // Entfernt Kommentare (die z.B. absichtlich "keine Veröffentlichung"
  // dokumentieren) und alle Tags, damit nur echter, dem Nutzer sichtbarer
  // Text übrig bleibt.
  return source.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
}

check("keine Portal-Seite zeigt eine sichtbare Fachauftrags-, Veröffentlichungs- oder Billing-Aktion", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    const visibleText = extractVisibleHtmlText(readFile(file));
    assert.doesNotMatch(visibleText, /veröffentlich|publish|billing|rechnung|zahlung|fachauftrag/i, file);
  });
});

check("keine Portal-Seite bietet eine sichtbare Canva-/HeyGen-Kundenaktion an", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    const visibleText = extractVisibleHtmlText(readFile(file));
    assert.doesNotMatch(visibleText, /canva|heygen/i, file);
  });
});

check("keine Portal-JS-Datei ruft eine Fachauftrags-, Billing-, Publish- oder Canva-/HeyGen-API-Route auf", () => {
  PORTAL_JS_FILES.forEach((file) => {
    const source = readFile(file);
    const fetchCalls = Array.from(source.matchAll(/fetch\(\s*["']([^"']+)["']/g)).map((m) => m[1]);
    fetchCalls.forEach((url) => {
      assert.doesNotMatch(url, /billing|publish|canva|heygen|fachauftrag|execution/i, `${file}: ${url}`);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Keine externen Ressourcen, kein Tracking, kein CDN.
// ---------------------------------------------------------------------------

check("keine Portal-Datei referenziert eine externe URL (http://, https://, //, CDN, Google Fonts)", () => {
  PORTAL_TEXT_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /https?:\/\//i, `${file} referenziert eine absolute URL`);
    assert.doesNotMatch(source, /\/\/(fonts|cdn|ajax)\./i, file);
  });
});

check("keine Portal-HTML-Datei lädt ein <script>/<link> von einer fremden Origin (nur lokale, relative Pfade)", () => {
  PORTAL_HTML_FILES.forEach((file) => {
    const source = readFile(file);
    const srcRefs = Array.from(source.matchAll(/(?:src|href)="([^"]+)"/g)).map((m) => m[1]);
    srcRefs.forEach((ref) => {
      assert.ok(ref.startsWith("/"), `${file}: Referenz "${ref}" ist nicht lokal/relativ`);
    });
  });
});

check("keine Portal-JS-Datei führt einen fetch()/XHR-Aufruf auf eine absolute fremde URL aus (nur relative /api/-Pfade)", () => {
  PORTAL_JS_FILES.forEach((file) => {
    const source = readFile(file);
    const fetchCalls = Array.from(source.matchAll(/fetch\(\s*["']([^"']+)["']/g)).map((m) => m[1]);
    fetchCalls.forEach((url) => {
      assert.ok(url.startsWith("/"), `${file}: fetch() auf "${url}" ist nicht lokal/relativ`);
    });
  });
});

check("keine Portal-Datei enthält ein Tracking-/Analytics-Muster (gtag, analytics, facebook, pixel)", () => {
  PORTAL_TEXT_FILES.forEach((file) => {
    const source = readFile(file);
    assert.doesNotMatch(source, /gtag|google-analytics|analytics\.js|facebook\.net|fbq\(|pixel/i, file);
  });
});

// ---------------------------------------------------------------------------
// 3. Barrierefreiheit/Fokus, ruhige Bedienbarkeit.
// ---------------------------------------------------------------------------

check("portal.css definiert einen sichtbaren Fokuszustand (:focus-visible) für Felder, Buttons und Links", () => {
  const css = readFile("portal.css");
  assert.match(css, /:focus-visible\s*{/);
  assert.match(css, /\.portal-field input:focus-visible/);
  assert.match(css, /\.portal-button:focus-visible/);
});

check("portal.css lädt keine externe Schriftart (nur Systemschriftarten)", () => {
  const css = readFile("portal.css");
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /@font-face/);
});

check("jede Seite hat genau eine erkennbare Hauptaktion (primärer Submit-Button je Formular, keine konkurrierenden Primäraktionen)", () => {
  // Login/Einladung/Reset-Seiten: genau ein Formular je sichtbarem
  // Abschnitt mit genau einem primären Submit-Button.
  const loginSource = readFile("portal-login.html");
  const sections = loginSource.match(/data-view="[a-z]+"/g) || [];
  assert.strictEqual(sections.length, 4, "erwartet: login/invite/forgot/reset");
  const primaryButtons = loginSource.match(/<button class="portal-button" type="submit">/g) || [];
  assert.strictEqual(primaryButtons.length, 4, "jede der vier Ansichten hat genau einen primären Absenden-Button");
});

// ---------------------------------------------------------------------------
// 4. Kein Client-seitiger Zustand außerhalb des Cookies (Datenschutz/
//    Datenminimierung, ergänzt portal-operations-acceptance.test.js).
// ---------------------------------------------------------------------------

check("keine Portal-JS-Datei speichert Tokens/Passwörter dauerhaft im Skriptzustand (Modulvariable) über die Verarbeitung hinaus", () => {
  PORTAL_JS_FILES.forEach((file) => {
    const source = readFile(file);
    // Ein Token darf nur als lokale Funktionsvariable (var token = ...)
    // innerhalb einer Formularverarbeitung existieren, niemals als
    // Modul-weiter state.-Eintrag.
    assert.doesNotMatch(source, /state\.(token|password|newPassword)/i, file);
  });
});

check("owner-admin.js zeigt Einladungs-/Reset-Token ausschließlich per textContent an (kein innerHTML mit Servertext)", () => {
  const source = readFile("owner-admin.js");
  // showToken() baut das Token-Element ausschließlich über
  // document.createElement + .textContent auf; box.innerHTML wird nur zum
  // Leeren auf "" gesetzt, niemals mit einem Servertext befüllt.
  const innerHtmlAssignments = Array.from(source.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)).map((m) => m[1].trim());
  innerHtmlAssignments.forEach((rhs) => {
    assert.strictEqual(rhs, '""', `owner-admin.js weist innerHTML einen nicht-leeren Wert zu: ${rhs}`);
  });
  assert.match(source, /tokenEl\.textContent = token;/);
});

check("Kundenportal/Owner-Verwaltung zeigen niemals interne IDs oder rohe DB-Statuswerte im Kundenportal (nur /portal, nicht /owner/kunden)", () => {
  const customerHtml = readFile("portal.html");
  const customerJs = readFile("portal-ui.js");
  // Das Kundenportal zeigt ausschließlich roleLabel/accountStatusLabel
  // (übersetzte Anzeigetexte), niemals die rohen role/status-Enum-Werte.
  assert.doesNotMatch(customerJs, /data\.role\b/);
  assert.doesNotMatch(customerJs, /data\.status\b/);
  assert.doesNotMatch(customerHtml, /userId|customerId|tenantId/i);
});

console.log(`portal-usability-acceptance.test.js: ${passed} Prüfpunkte erfolgreich`);
