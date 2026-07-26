"use strict";

// V7.3 Persistenznachtrag (Auftrag Abschnitt D) – gezielte Tests für das
// Neustart- und Mehrprozessverhalten des Jamal-Arbeitsmodus. Anders als
// jamal-work-mode.test.js (reine Fachlogik, kein DB-Bezug) und
// jamal-work-mode-e2e.test.js (voller HTTP-Ablauf, ein Prozess, eine
// DB-Verbindung) prüft diese Datei ausschließlich die neue
// Persistenzschicht (jamal-work-mode-store.js + auth-db.js#Migration 12)
// direkt: Datenbankverbindung schließen und mit demselben isolierten
// Datenverzeichnis neu öffnen simuliert einen Serverneustart; zwei
// gleichzeitig geöffnete Verbindungen auf dasselbe Verzeichnis simulieren
// zwei parallele Serviceinstanzen (gleiches Muster wie auth-db.test.js).
//
// Kein Servermodul, kein HTTP – ausschließlich os.tmpdir()-Testverzeichnisse
// (siehe Prüfpunkt weiter unten), niemals die echte Application-Support-
// Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const jamalWorkMode = require("./jamal-work-mode");
const jamalWorkModeStore = require("./jamal-work-mode-store");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const PROJECTS = [
  { id: "ki-unternehmenszentrale", displayName: "KI-Unternehmenszentrale", lastVerifiedAt: "2026-07-11" },
  { id: "health-upgrade-kompass", displayName: "Health Upgrade Kompass", lastVerifiedAt: "2026-07-19" },
];

function makeIsolatedDataDir(prefix = "jamal-work-mode-persistence-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function openDbAt(dataDir) {
  return authDb.openAuthDatabase({ dataDir }).db;
}

// ---------------------------------------------------------------------------
// 1–14: voller Lebenszyklus mit mehreren simulierten Serverneustarts
// (dieselbe Datenbankdatei, aber jedes Mal eine frisch geöffnete
// better-sqlite3-Verbindung – exakt das, was ein echter Prozessneustart
// aus Sicht der Datenbank bedeutet).
// ---------------------------------------------------------------------------

function runLifecycleTest() {
  const dataDir = makeIsolatedDataDir();
  let db = openDbAt(dataDir);

  // 1+2+3. Arbeitswunsch anlegen, Lauf starten, Ergebnisversion 1 entsteht.
  let store = jamalWorkModeStore.loadStore(db);
  check("ohne jeden bisherigen Datensatz entspricht loadStore() genau createStore()", () => {
    assert.deepStrictEqual(store, jamalWorkMode.createStore());
  });

  store = jamalWorkMode.startNewItem(store, PROJECTS, { now: new Date("2026-07-27T08:00:00Z") });
  store = jamalWorkMode.setDesiredOutcome(
    store,
    {
      desiredOutcome: "Vereinfache den täglichen Arbeitsmodus für Jamal so, dass er sofort weiß, was zu tun ist.",
      notes: "Bestehende Phase-C-Architektur wiederverwenden, keine neue Architektur.",
      preferredTiming: "heute",
    },
    { now: new Date("2026-07-27T08:01:00Z") },
  );
  store = jamalWorkMode.startRun(store, { now: new Date("2026-07-27T08:02:00Z") });
  assert.strictEqual(store.currentItem.status, jamalWorkMode.STATUS.IN_PROGRESS);
  store = jamalWorkMode.completeRun(store, { now: new Date("2026-07-27T08:03:00Z") });
  const workItemId = store.currentItem.id;

  jamalWorkModeStore.persistStore(db, store);
  check("Ergebnisversion 1 wurde tatsächlich in jamal_work_results gespeichert", () => {
    const rows = authDb.listJamalWorkResultsForWorkItem(db, workItemId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].versionNumber, 1);
  });

  // 4. "Serverneustart": Verbindung schließen und mit demselben
  // Datenverzeichnis neu öffnen.
  authDb.closeAuthDatabase(db);
  db = openDbAt(dataDir);

  // 5+6+7. Arbeitswunsch, Status und Ergebnisversion 1 bleiben erhalten.
  let reloaded = jamalWorkModeStore.loadStore(db);
  check("nach Neustart: Arbeitswunsch (Ergebniswunsch, Projekt) bleibt erhalten", () => {
    assert.ok(reloaded.currentItem);
    assert.strictEqual(reloaded.currentItem.id, workItemId);
    assert.strictEqual(
      reloaded.currentItem.desiredOutcome,
      "Vereinfache den täglichen Arbeitsmodus für Jamal so, dass er sofort weiß, was zu tun ist.",
    );
    assert.strictEqual(reloaded.currentItem.projectId, "ki-unternehmenszentrale");
  });
  check("nach Neustart: Status bleibt korrekt (Ergebnis bereit)", () => {
    assert.strictEqual(reloaded.currentItem.status, jamalWorkMode.STATUS.RESULT_READY);
  });
  check("nach Neustart: Ergebnisversion 1 bleibt vollständig erhalten", () => {
    assert.strictEqual(reloaded.currentItem.versions.length, 1);
    assert.strictEqual(reloaded.currentItem.versions[0].versionNumber, 1);
    assert.ok(reloaded.currentItem.versions[0].title);
    assert.ok(reloaded.currentItem.versions[0].body);
  });
  const version1Snapshot = JSON.stringify(reloaded.currentItem.versions[0]);

  // 8+9. Änderung erzeugt Version 2, Version 1 bleibt unverändert.
  let changed = jamalWorkMode.requestChange(reloaded, "Bitte die Zusammenfassung kürzer formulieren.", {
    now: new Date("2026-07-27T09:00:00Z"),
  });
  assert.strictEqual(changed.currentItem.status, jamalWorkMode.STATUS.CHANGE_IN_PROGRESS);
  changed = jamalWorkMode.completeChange(changed, { now: new Date("2026-07-27T09:01:00Z") });
  jamalWorkModeStore.persistStore(db, changed);
  check("Änderung erzeugt Version 2, Version 1 bleibt unverändert (vor Neustart)", () => {
    assert.strictEqual(changed.currentItem.versions.length, 2);
    assert.strictEqual(JSON.stringify(changed.currentItem.versions[0]), version1Snapshot);
    assert.strictEqual(changed.currentItem.versions[1].versionNumber, 2);
    assert.strictEqual(changed.currentItem.versions[1].changeRequestText, "Bitte die Zusammenfassung kürzer formulieren.");
  });

  // 10+11. erneuter Neustart, beide Versionen bleiben vorhanden.
  authDb.closeAuthDatabase(db);
  db = openDbAt(dataDir);
  reloaded = jamalWorkModeStore.loadStore(db);
  check("nach dem zweiten Neustart: beide Ergebnisversionen bleiben vorhanden", () => {
    assert.strictEqual(reloaded.currentItem.versions.length, 2);
    assert.strictEqual(JSON.stringify(reloaded.currentItem.versions[0]), version1Snapshot);
    assert.strictEqual(reloaded.currentItem.versions[1].versionNumber, 2);
    assert.strictEqual(reloaded.currentItem.versions[1].changeRequestText, "Bitte die Zusammenfassung kürzer formulieren.");
  });

  // 12. "Passt" setzt DONE.
  let done = jamalWorkMode.markDone(reloaded, { now: new Date("2026-07-27T09:30:00Z") });
  jamalWorkModeStore.persistStore(db, done);
  check("„Passt“ setzt den Status auf Erledigt (vor Neustart)", () => {
    assert.strictEqual(done.currentItem.status, jamalWorkMode.STATUS.DONE);
    assert.strictEqual(done.currentItem.decision, "PASST");
  });

  // 13+14. Neustart, Erledigt bleibt erhalten.
  authDb.closeAuthDatabase(db);
  db = openDbAt(dataDir);
  reloaded = jamalWorkModeStore.loadStore(db);
  check("nach Neustart: „Erledigt“ bleibt erhalten", () => {
    assert.strictEqual(reloaded.currentItem.status, jamalWorkMode.STATUS.DONE);
    assert.strictEqual(reloaded.currentItem.decision, "PASST");
    assert.ok(reloaded.currentItem.doneAt);
    assert.strictEqual(reloaded.currentItem.versions.length, 2);
  });

  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 15: Rückfrage bleibt nach Neustart erhalten.
// ---------------------------------------------------------------------------

function runClarificationTest() {
  const dataDir = makeIsolatedDataDir();
  let db = openDbAt(dataDir);

  let store = jamalWorkModeStore.loadStore(db);
  store = jamalWorkMode.startNewItem(store, PROJECTS, { now: new Date("2026-07-27T10:00:00Z") });
  // Bewusst sehr kurzer Ergebniswunsch ohne Hintergrund -> löst die
  // deterministische Rückfrageerkennung aus (siehe
  // work-order-agent-orchestrator.js#detectMissingInformation).
  store = jamalWorkMode.setDesiredOutcome(store, { desiredOutcome: "Kurz." }, { now: new Date("2026-07-27T10:01:00Z") });
  store = jamalWorkMode.startRun(store, { now: new Date("2026-07-27T10:02:00Z") });
  assert.strictEqual(store.currentItem.status, jamalWorkMode.STATUS.CLARIFICATION_NEEDED);
  assert.ok(store.currentItem.clarifyingQuestion && store.currentItem.clarifyingQuestion.question);
  const questionText = store.currentItem.clarifyingQuestion.question;

  jamalWorkModeStore.persistStore(db, store);
  authDb.closeAuthDatabase(db);
  db = openDbAt(dataDir);

  const reloaded = jamalWorkModeStore.loadStore(db);
  check("Rückfrage bleibt nach Neustart erhalten (Frage, Status, noch keine Antwort)", () => {
    assert.strictEqual(reloaded.currentItem.status, jamalWorkMode.STATUS.CLARIFICATION_NEEDED);
    assert.ok(reloaded.currentItem.clarifyingQuestion);
    assert.strictEqual(reloaded.currentItem.clarifyingQuestion.question, questionText);
    assert.strictEqual(reloaded.currentItem.clarifyingQuestion.answer, null);
  });

  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 16: zwei Serviceinstanzen sehen denselben persistenten Stand.
// ---------------------------------------------------------------------------

function runTwoInstancesTest() {
  const dataDir = makeIsolatedDataDir();
  const dbA = openDbAt(dataDir);
  const dbB = openDbAt(dataDir);

  let storeA = jamalWorkModeStore.loadStore(dbA);
  storeA = jamalWorkMode.startNewItem(storeA, PROJECTS, { now: new Date("2026-07-27T11:00:00Z") });
  storeA = jamalWorkMode.setDesiredOutcome(
    storeA,
    { desiredOutcome: "Zwei-Instanzen-Test: derselbe Zustand muss überall sichtbar sein.", notes: "Kontext für den Test." },
    { now: new Date("2026-07-27T11:01:00Z") },
  );
  jamalWorkModeStore.persistStore(dbA, storeA);

  const storeB = jamalWorkModeStore.loadStore(dbB);
  check("eine zweite, unabhängig geöffnete Datenbankverbindung sieht denselben Arbeitswunsch", () => {
    assert.ok(storeB.currentItem);
    assert.strictEqual(storeB.currentItem.id, storeA.currentItem.id);
    assert.strictEqual(storeB.currentItem.desiredOutcome, storeA.currentItem.desiredOutcome);
    assert.strictEqual(storeB.currentItem.status, jamalWorkMode.STATUS.READY);
  });

  authDb.closeAuthDatabase(dbA);
  authDb.closeAuthDatabase(dbB);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Ergebnisversionen sind auf Datenbankebene append-only (UPDATE/DELETE
// werden durch die Migration-12-Trigger abgelehnt) – zweite
// Verteidigungslinie zusätzlich dazu, dass jamal-work-mode-store.js selbst
// keine Update-/Delete-Funktion für Ergebnisversionen aufruft.
// ---------------------------------------------------------------------------

function runAppendOnlyTest() {
  const dataDir = makeIsolatedDataDir();
  const db = openDbAt(dataDir);

  let store = jamalWorkModeStore.loadStore(db);
  store = jamalWorkMode.startNewItem(store, PROJECTS, { now: new Date("2026-07-27T12:00:00Z") });
  store = jamalWorkMode.setDesiredOutcome(
    store,
    { desiredOutcome: "Append-only-Test für Ergebnisversionen.", notes: "Kontext." },
    { now: new Date("2026-07-27T12:01:00Z") },
  );
  store = jamalWorkMode.startRun(store, { now: new Date("2026-07-27T12:02:00Z") });
  store = jamalWorkMode.completeRun(store, { now: new Date("2026-07-27T12:03:00Z") });
  jamalWorkModeStore.persistStore(db, store);

  const [resultRow] = authDb.listJamalWorkResultsForWorkItem(db, store.currentItem.id);

  check("eine gespeicherte Ergebnisversion kann nicht per UPDATE verändert werden (Datenbank-Trigger)", () => {
    assert.throws(
      () => db.prepare("UPDATE jamal_work_results SET resultTitle = ? WHERE id = ?").run("Manipuliert", resultRow.id),
      /append-only/,
    );
  });

  check("eine gespeicherte Ergebnisversion kann nicht per DELETE entfernt werden (Datenbank-Trigger)", () => {
    assert.throws(() => db.prepare("DELETE FROM jamal_work_results WHERE id = ?").run(resultRow.id), /append-only/);
  });

  check("zweiter Aufruf von persistStore() für denselben Zustand hängt keine doppelte Version an (idempotent)", () => {
    jamalWorkModeStore.persistStore(db, store);
    const rows = authDb.listJamalWorkResultsForWorkItem(db, store.currentItem.id);
    assert.strictEqual(rows.length, 1);
  });

  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Weitere verbindliche Prüfpunkte (Auftrag Abschnitt D, Punkte 17–20).
// ---------------------------------------------------------------------------

function runScopeAndFailClosedTests() {
  check("kein tatsächlicher LocalStorage-Zugriff in der Persistenzschicht (nur Verneinungen in Kommentaren erlaubt)", () => {
    const storeSource = fs.readFileSync(path.join(__dirname, "jamal-work-mode-store.js"), "utf8");
    const authDbSource = fs.readFileSync(path.join(__dirname, "auth-db.js"), "utf8");
    // Bewusst nur einen tatsächlichen API-Zugriff (localStorage.getItem/
    // setItem/removeItem/clear) ablehnen, nicht die Verneinung
    // "Kein LocalStorage" im Modulkommentar oben.
    assert.doesNotMatch(storeSource, /localStorage\s*\.\s*(get|set|remove)Item|localStorage\s*\.\s*clear/i);
    assert.doesNotMatch(authDbSource, /localStorage\s*\.\s*(get|set|remove)Item|localStorage\s*\.\s*clear/i);
  });

  check("keine Datenbankdatei dieses Projekts ist von Git erfasst (.gitignore schließt *.sqlite* aus)", () => {
    const gitignore = fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8");
    assert.match(gitignore, /\*\.sqlite/);
  });

  check("Migration 12 speichert keine Systemprompts/Chain-of-Thought/Secrets/Tokens (Spaltennamen)", () => {
    const migrationsSource = fs.readFileSync(path.join(__dirname, "auth-db-migrations.js"), "utf8");
    const migration12Start = migrationsSource.indexOf("version: 12");
    assert.ok(migration12Start > 0);
    const migration12Sql = migrationsSource.slice(migration12Start, migration12Start + 4000);
    assert.doesNotMatch(migration12Sql, /systemPrompt|chainOfThought|reasoning|secret|token|apiKey|password/i);
  });

  check("beschädigte, nicht migrierbare Datenbankdatei bleibt fail-closed (kein stiller Ersatz)", () => {
    const dataDir = makeIsolatedDataDir("jamal-work-mode-persistence-broken-");
    fs.mkdirSync(path.join(dataDir, "auth"), { recursive: true, mode: 0o700 });
    // Absichtlich keine gültige SQLite-Datei: better-sqlite3/SQLite muss den
    // Start ablehnen, auth-db.js muss dies als AuthDatabaseStartupError
    // hart nach oben werfen (siehe auth-db.js#openAuthDatabase) statt
    // irgendeinen leeren/neuen Zustand stillschweigend zu erzeugen.
    fs.writeFileSync(path.join(dataDir, "auth", "auth.sqlite"), "dies ist keine gültige SQLite-Datenbankdatei\0\0\0garbage");
    assert.throws(
      () => authDb.openAuthDatabase({ dataDir }),
      (error) => error instanceof authDb.AuthDatabaseStartupError,
    );
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
}

runLifecycleTest();
runClarificationTest();
runTwoInstancesTest();
runAppendOnlyTest();
runScopeAndFailClosedTests();

console.log(`jamal-work-mode-persistence.test.js: ${passed} Prüfpunkte erfolgreich`);
