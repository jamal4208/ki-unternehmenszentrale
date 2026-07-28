"use strict";

// Kanonische, einmalige Quelle für die erwarteten Bestandszahlen aus
// server.js (GET-Routen, POST-Routen, GET-/POST-Routenpräfixe, statische
// Assets). Ersetzt die zuvor getrennt in daily-work-run.test.js,
// agent-runtime.test.js, server-http-router.test.js und
// route-access-policy.test.js gepflegten hartkodierten Literale samt
// eigenem, jeweils identischem Änderungskommentar.
//
// Wirkung dieser Bündelung: Bei einer neuen additiven GET-/POST-Route, einem
// neuen Routenpräfix oder einem neuen statischen Asset wird ausschließlich
// EXPECTED_ROUTE_INVENTORY unten angepasst (ein Ort statt bisher bis zu vier
// Dateien). Der Schutzwert bleibt vollständig erhalten: jeder Testaufruf
// vergleicht weiterhin die tatsächliche, live aus server.js gelesene Zahl
// gegen einen festen Erwartungswert – eine unbeabsichtigte oder vergessene
// Routenänderung fällt weiterhin als roter Test auf. Es wird keine
// Assertion entfernt oder abgeschwächt, nur die Pflege der Erwartungszahl
// konsolidiert.
//
// Änderungshistorie (kompakt, ersetzt die zuvor pro Testdatei wiederholten
// Langkommentare – Details je Phase weiterhin in CURRENT_STATUS.md/
// MIGRATION_PLAN.md/API_REGISTER.md):
// Phase C: +2 GET Execution-Status/-Ergebnis
// Phase D: +1 GET Executor-Registry
// Phase E: +1 GET Freeze-Status
// V7.1 Phase A: +5 GET Dokumente/Tools/Plugin-Gateway/Tool-Routing/Backup-Export
// V7.1 Phase B: +3 GET HeyGen-Status/Jobpakete/Backup-Export
// V7.1 Phase B.1: +5 GET Agentur-Mandantenbasis/Pilot-Review/Backup-Export
// V7.1 Phase C: +3 GET Canva-Status/Jobpakete/Backup-Export
// V7.1 Phase C.1: +1 GET Pilot-Ergebnisakten-Liste
// V7.2 Phase A Schritt 2: +1 GET Auth-Sessionstatus
// V7.2 Phase A Schritt 3: +3 GET Owner-Mandantenliste/Kundenportal-Konto/-Status
// V7.2 Phase B Schritt 1: +2 GET Kundenportal-/Owner-Arbeitsauftragsliste
// V7.3 Jamal-Arbeitsmodus: +1 GET Jamal-Arbeitsmodus-Zustand
// V7.4 Canva-Produktionskorridor: +1 GET Jamal-Canva-Produktionsstatus
// V7.5 Agentenführung: +5 GET Führungsübersicht/Organisation/HR-Lauf/
//   Technologie-Radar/Agent-Technology-Fit, +1 neuer POST-Prefix
//   (/api/agent-leadership/), keine neue exakte POST-Route
// Unternehmensleitlinien V1.0: +2 GET Leitlinien/Reliability-Signale
// V7.6.1 Office & Finanzen: +9 GET Kompaktübersicht/Systemlandkarte/
//   Identitäten/Fähigkeiten/Freigabematrix/Office-Aufträge/Finance-Handoffs/
//   Authentifizierungsbedarf/Freigabeschritte, +1 neuer POST-Prefix
//   (/api/office-finance/), +1 statisches Asset (office-finance-ui.js)
// V7.6.3 Health-Referenzlauf: +1 GET Health-Referenzlauf-Status, +1 neuer
//   POST-Prefix (/api/health-reference/), +1 statisches Asset
//   (health-reference-work-run-ui.js)
// KI-Unternehmenszentrale-Pilotbetrieb: +1 GET Pilotauftrags-Status, +1 neuer
//   POST-Prefix (/api/pilot-work-order/), +1 statisches Asset
//   (pilot-work-order-ui.js)
//
// Alle Einzelabruf-/Feedback-GET-Routen laufen wie bei bestehenden
// Einzelressourcen über routePrefixHandlers und werden hier konventionsgemäß
// nicht mitgezählt.
const EXPECTED_ROUTE_INVENTORY = Object.freeze({
  getRoutes: 90,
  postRoutes: 52,
  getRoutePrefixes: 8,
  postRoutePrefixes: 9,
  staticAssets: 33,
});

function countBracketEntries(blockSource) {
  return (blockSource.match(/^\s+\["\/api\//gm) || []).length;
}

// Zählt die GET-Routen direkt aus dem Quelltext von server.js (unabhängig
// von den zur Laufzeit exportierten Maps) – bewusst als eigenständige
// Gegenprobe zu server.getRoutes.size beibehalten.
function countGetRoutesFromServerSource(serverSource) {
  const match = serverSource.match(/const getRoutes = buildRouteMap\(\[([\s\S]*?)\n\]\);/);
  return match ? countBracketEntries(match[1]) : 0;
}

// Zählt die POST-Routen direkt aus dem Quelltext von server.js – analoge
// Gegenprobe zu server.postRoutes.size.
function countPostRoutesFromServerSource(serverSource) {
  const match = serverSource.match(/const postRoutes = buildRouteMap\(\[([\s\S]*?)\]\);/);
  return match ? countBracketEntries(match[1]) : 0;
}

module.exports = {
  EXPECTED_ROUTE_INVENTORY,
  countGetRoutesFromServerSource,
  countPostRoutesFromServerSource,
};
