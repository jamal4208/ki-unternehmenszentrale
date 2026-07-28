"use strict";

// V7.2 Phase A Schritt 4 (Auftrag Abschnitt Q) – Betriebsabnahme der
// Portalbasis: Erststart, Wiederanlauf, Migrationen im echten Dateisystem-
// Lebenszyklus, Owner-Bootstrap als echter Kindprozess, defensive
// Startfehler und Browserbackup-Abgrenzung.
//
// auth-db.test.js deckt bereits Migrationssequenz/-idempotenz, Constraints,
// Dateirechte und den fail-closed Importpfad ab (Unit-Ebene). Dieses Modul
// ergänzt ausschließlich echte End-to-End-Lebenszyklus-Szenarien, die dort
// NICHT abgedeckt sind: mehrfacher echter Prozess-/Datenbankneuanlauf über
// mehrere KUZ_DATA_DIR-Zustände, ein echter Owner-Bootstrap-Kindprozess
// (idempotent, zweimal mit derselben E-Mail-Adresse), eine beschädigte
// Datenbankdatei und die strukturelle Abgrenzung des Browser-Backups von
// der Auth-Datenbank.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}
async function checkAsync(label, assertion) {
  await assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const REPO_ROOT = __dirname;

// ---------------------------------------------------------------------------
// 1. Erststart: leere Datenbank, Migrationen 1–14 in korrekter Reihenfolge
//    (V7.2 Phase B Schritt 1 ergänzt Migration 8: work_orders-Tabelle;
//    V7.2 Phase B Schutz-/Einwilligungsgrundlage ergänzt Migration 9:
//    policy_violations-Tabelle; V7.2 Phase C Schritt 1 ergänzt Migration 10:
//    work_order_runs/work_order_run_agents/work_order_results; V7.2 Phase C
//    Schritt 2 ergänzt Migration 11: work_order_change_requests/
//    work_order_customer_approvals; V7.3 Persistenznachtrag ergänzt
//    Migration 12: jamal_work_items/jamal_work_results; V7.4 Canva-
//    Produktionskorridor ergänzt Migration 13: jamal_canva_productions +
//    erweiterte auth_audit_events-Ereignistypen; V7.5 Agentenführung ergänzt
//    Migration 14: agent_hr_daily_runs/agent_hr_daily_proposals/
//    technology_radar_items/agent_technology_fit + erneut erweiterte
//    auth_audit_events-Ereignistypen), danach echter Wiederanlauf (zweites
//    Öffnen desselben Verzeichnisses) idempotent und ohne erneute Anwendung.
// ---------------------------------------------------------------------------

function withIsolatedDataDir(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-ops-test-data-"));
  try {
    return fn(dataDir);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

withIsolatedDataDir((dataDir) => {
  // Frischer require-Kontext pro Testblock: auth-db.js hält keinen globalen
  // Zustand außerhalb der übergebenen db-Handles, ein einfacher require auf
  // Modulebene reicht (kein Cache-Problem, da jede Funktion das db-Handle
  // explizit erhält).
  const authDb = require("./auth-db");
  const migrations = require("./auth-db-migrations");

  const opened = authDb.openAuthDatabase({ dataDir });
  // Dynamisch aus der kanonischen Migrationsliste (auth-db-migrations.js)
  // abgeleitet statt eines hartkodierten Zahlenarrays: bei einer neuen
  // additiven Migration muss diese Assertion nicht mehr manuell angepasst
  // werden, der Schutzwert bleibt erhalten (aufsteigende Reihenfolge ohne
  // Lücke oder Duplikat wird weiterhin real geprüft).
  check("Erststart: alle Migrationen werden vollständig und in aufsteigender Reihenfolge angewendet", () => {
    const applied = migrations.getAppliedVersions(opened.db);
    const expectedVersions = migrations.MIGRATIONS.map((migration) => migration.version);
    assert.deepStrictEqual(applied, expectedVersions);
    assert.deepStrictEqual(
      expectedVersions,
      Array.from({ length: expectedVersions.length }, (_, index) => index + 1),
    );
  });
  check("Erststart: die Datenbankdatei existiert unter dem erwarteten isolierten Pfad", () => {
    assert.ok(fs.existsSync(path.join(dataDir, "auth", "auth.sqlite")));
  });
  authDb.closeAuthDatabase(opened.db);

  // Echter Wiederanlauf: dasselbe Verzeichnis erneut öffnen (neuer Prozess
  // würde denselben Pfad wiederverwenden) – Migrationen dürfen kein zweites
  // Mal angewendet werden, bestehende Daten bleiben erhalten.
  const reopened = authDb.openAuthDatabase({ dataDir });
  check("Wiederanlauf auf bestehender Datenbank: keine Migration wird erneut angewendet", () => {
    const result = migrations.runMigrations(reopened.db);
    assert.deepStrictEqual(result.appliedNow, []);
  });
  authDb.closeAuthDatabase(reopened.db);
});

// ---------------------------------------------------------------------------
// 2. Bestehende Datenbank aus einem älteren Stand (nur Migrationen 1–6, wie
//    vor Schritt 3) wird beim nächsten Öffnen sauber auf 7 migriert und
//    bestehende Auditdaten bleiben dabei vollständig erhalten.
// ---------------------------------------------------------------------------

withIsolatedDataDir((dataDir) => {
  const authDb = require("./auth-db");
  const migrations = require("./auth-db-migrations");
  const authAudit = require("./auth-audit");

  // Verbindliche Projektregel (siehe auth-db.test.js, Abschnitt 9):
  // ausschließlich auth-db.js darf "better-sqlite3" importieren. Um trotzdem
  // eine ECHTE Vor-Schritt-3-Datenbank (nur Migrationen 1–6) nachzubilden,
  // wird ein Einwegskript in ein temporäres Verzeichnis INNERHALB des
  // Projekts geschrieben (für normale node_modules-Auflösung), dort in
  // einem eigenen Kindprozess ausgeführt und danach sofort vollständig
  // entfernt – bevor irgendein anderer Testlauf das Projektverzeichnis auf
  // better-sqlite3-Importe absucht. Dieses .js bleibt selbst frei von einem
  // solchen Import.
  const harnessDir = fs.mkdtempSync(path.join(REPO_ROOT, ".tmp-portal-ops-legacy-db-"));
  try {
    const authDir = path.join(dataDir, "auth");
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    const harnessScriptPath = path.join(harnessDir, "build-legacy-db.js");
    fs.writeFileSync(
      harnessScriptPath,
      [
        '"use strict";',
        `const Database = require(${JSON.stringify(path.join(REPO_ROOT, "node_modules", "better-sqlite3"))});`,
        `const migrations = require(${JSON.stringify(path.join(REPO_ROOT, "auth-db-migrations"))});`,
        `const dbPath = process.argv[2];`,
        "const rawDb = new Database(dbPath);",
        'rawDb.pragma("journal_mode = WAL");',
        'rawDb.pragma("foreign_keys = ON");',
        "const legacyMigrations = migrations.MIGRATIONS.slice(0, 6);",
        "legacyMigrations.forEach((migration) => { rawDb.exec(migration.sql); });",
        'rawDb.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);");',
        'legacyMigrations.forEach((migration) => { rawDb.prepare("INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(migration.version, "2026-01-01T00:00:00.000Z"); });',
        "rawDb.prepare(",
        '  "INSERT INTO auth_audit_events (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata) VALUES (?, NULL, NULL, \'LOGIN_SUCCESS\', \'OK\', ?, NULL)",',
        ').run("bestehendes-vor-schritt-3-ereignis", "2026-01-01T00:00:00.000Z");',
        "rawDb.close();",
      ].join("\n"),
    );
    execFileSync(process.execPath, [harnessScriptPath, path.join(authDir, "auth.sqlite")], { timeout: 15000 });
  } finally {
    fs.rmSync(harnessDir, { recursive: true, force: true });
  }

  const opened = authDb.openAuthDatabase({ dataDir });
  // Dynamisch aus der kanonischen Migrationsliste abgeleitet statt eines
  // hartkodierten Zahlenarrays (siehe Kommentar bei der Erststart-Prüfung
  // oben) – bei einer neuen additiven Migration muss auch dieser
  // Nachzieh-Fall nicht mehr manuell angepasst werden.
  check("alle fehlenden Migrationen werden auf einer bestehenden Vor-Schritt-3-Datenbank (nur 1–6) nachträglich vollständig angewendet", () => {
    assert.deepStrictEqual(
      migrations.getAppliedVersions(opened.db),
      migrations.MIGRATIONS.map((migration) => migration.version),
    );
  });
  check("Migration 7 erhält bestehende Auditdaten vollständig (keine verlorene Zeile)", () => {
    const row = authAudit.listAuditEventsByType(opened.db, "LOGIN_SUCCESS");
    assert.ok(row.some((e) => e.eventId === "bestehendes-vor-schritt-3-ereignis"));
  });
  check("nach Migration 7 kann ein neuer, in Migration 7 hinzugefügter Ereignistyp geschrieben werden", () => {
    const written = authAudit.recordAuditEvent(opened.db, {
      eventType: "TENANT_ACTIVATED",
      result: "OK",
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    assert.strictEqual(written.eventType, "TENANT_ACTIVATED");
  });
  authDb.closeAuthDatabase(opened.db);
});

// ---------------------------------------------------------------------------
// 3. Beschädigte Datenbankdatei: harter, fail-closed Startfehler statt
//    stillem Fallback oder unklarem Absturz.
// ---------------------------------------------------------------------------

withIsolatedDataDir((dataDir) => {
  const authDb = require("./auth-db");
  const authDir = path.join(dataDir, "auth");
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(authDir, "auth.sqlite"), "dies ist keine gültige SQLite-Datei, sondern absichtlich beschädigt");

  check("eine beschädigte Datenbankdatei führt zu einem AuthDatabaseStartupError statt zu einem stillen Fallback", () => {
    assert.throws(
      () => authDb.openAuthDatabase({ dataDir }),
      (error) => error instanceof authDb.AuthDatabaseStartupError && Boolean(error.userMessage),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Owner-Bootstrap als echter Kindprozess: idempotent, rotiert nur das
//    Passwort, legt kein zweites Konto an, kein Geheimnis in stdout/stderr.
// ---------------------------------------------------------------------------

async function run() {
  await checkAsync("Owner-Bootstrap (echter Kindprozess): erster Aufruf legt genau ein OWNER-Konto an", async () => {
    await withIsolatedDataDirAsync(async (dataDir, homeDir) => {
      const email = "owner-bootstrap-test@example.test";
      const result = runBootstrap(dataDir, homeDir, email, "EinBootstrapPasswort123", "EinBootstrapPasswort123");
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /wurde angelegt/);

      const authDb = require("./auth-db");
      const opened = authDb.openAuthDatabase({ dataDir });
      const user = authDb.getUserByEmailNormalized(opened.db, email);
      assert.ok(user);
      assert.strictEqual(user.role, "OWNER");
      authDb.closeAuthDatabase(opened.db);
    });
  });

  await checkAsync("Owner-Bootstrap (echter Kindprozess): zweiter Aufruf mit derselben E-Mail-Adresse rotiert nur das Passwort (kein zweites Konto)", async () => {
    await withIsolatedDataDirAsync(async (dataDir, homeDir) => {
      const email = "owner-bootstrap-idempotenz@example.test";
      runBootstrap(dataDir, homeDir, email, "ErstesPasswort12345", "ErstesPasswort12345");
      const second = runBootstrap(dataDir, homeDir, email, "ZweitesPasswort67890", "ZweitesPasswort67890");
      assert.strictEqual(second.exitCode, 0);
      assert.match(second.stdout, /war bereits vorhanden/);

      const authDb = require("./auth-db");
      const authPassword = require("./auth-password");
      const opened = authDb.openAuthDatabase({ dataDir });
      const allUsers = opened.db.prepare("SELECT * FROM users WHERE emailNormalized = ?").all(email);
      assert.strictEqual(allUsers.length, 1, "es darf nach zwei Aufrufen weiterhin nur genau ein Konto existieren");
      assert.strictEqual(authPassword.verifyPassword("ZweitesPasswort67890", allUsers[0].passwordHash), true);
      assert.strictEqual(authPassword.verifyPassword("ErstesPasswort12345", allUsers[0].passwordHash), false);
      authDb.closeAuthDatabase(opened.db);
    });
  });

  await checkAsync("Owner-Bootstrap (echter Kindprozess): stdout/stderr enthalten niemals das eingegebene Passwort", async () => {
    await withIsolatedDataDirAsync(async (dataDir, homeDir) => {
      const secret = "GanzGeheimesPasswortXYZ987";
      const result = runBootstrap(dataDir, homeDir, "owner-bootstrap-secret@example.test", secret, secret);
      assert.strictEqual(result.exitCode, 0);
      assert.doesNotMatch(result.stdout, new RegExp(secret));
      assert.doesNotMatch(result.stderr, new RegExp(secret));
    });
  });

  // -------------------------------------------------------------------
  // 5. Backup-/Restore-Abgrenzung: das bestehende Browser-Backup
  //    (local-data-backup.js) kennt ausschließlich zwei LocalStorage-
  //    Schlüssel und hat strukturell KEINEN Dateisystemzugriff – die
  //    Auth-Datenbank kann darüber weder exportiert noch wiederhergestellt
  //    werden.
  // -------------------------------------------------------------------

  await checkAsync("local-data-backup.js kennt ausschließlich die zwei bestehenden LocalStorage-Schlüssel (keinen Auth-/Session-Schlüssel)", async () => {
    const localDataBackup = require("./local-data-backup.js");
    const allowedKeys = localDataBackup.ALLOWED_STORAGE_KEYS || [];
    assert.ok(allowedKeys.length > 0);
    allowedKeys.forEach((key) => {
      assert.doesNotMatch(key, /auth|session|owner|portal/i);
    });
  });

  await checkAsync("local-data-backup.js importiert kein Dateisystem-/Datenbankmodul (kann die Auth-Datenbank strukturell nicht berühren)", async () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "local-data-backup.js"), "utf8");
    assert.doesNotMatch(source, /require\((["'])fs\1\)/);
    assert.doesNotMatch(source, /require\((["'])better-sqlite3\1\)/);
    assert.doesNotMatch(source, /require\((["'])\.\/auth-db\1\)/);
  });

  check("portal-ui.js/portal-auth.js/owner-admin.js verwenden weder localStorage noch sessionStorage (kein Authstatus im Browserbackup)", () => {
    ["portal-ui.js", "portal-auth.js", "owner-admin.js"].forEach((file) => {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      assert.doesNotMatch(source, /localStorage/);
      assert.doesNotMatch(source, /sessionStorage/);
    });
  });

  // -------------------------------------------------------------------
  // 6. Betriebsgrenze: mehrere gleichzeitige Verbindungen auf dieselbe
  //    WAL-Datenbank funktionieren (dokumentierte SQLite-Grenze wird nicht
  //    verschwiegen, sondern hier real nachgewiesen).
  // -------------------------------------------------------------------

  await checkAsync("zwei gleichzeitige Verbindungen auf dieselbe Datenbank (WAL) sehen dieselben, jeweils aktuellen Daten", async () => {
    await withIsolatedDataDirAsync(async (dataDir) => {
      const authDb = require("./auth-db");
      const authTenantLink = require("./auth-tenant-link");
      const first = authDb.openAuthDatabase({ dataDir });
      authTenantLink.syncTenantProjections(first.db);
      const second = authDb.openAuthDatabase({ dataDir });
      const tenantsViaFirst = authDb.listTenantProjections(first.db);
      const tenantsViaSecond = authDb.listTenantProjections(second.db);
      assert.strictEqual(tenantsViaFirst.length, tenantsViaSecond.length);
      assert.ok(tenantsViaFirst.length > 0);
      authDb.closeAuthDatabase(first.db);
      authDb.closeAuthDatabase(second.db);
    });
  });

  // -------------------------------------------------------------------
  // 7. Ratenlimiter-Betriebsgrenze: In-Memory, daher bewusst NICHT über
  //    einen Prozessneustart hinweg persistent (dokumentierte Grenze).
  // -------------------------------------------------------------------

  check("Ratenlimiter sind In-Memory: ein neuer Prozess (neue Limiter-Instanz) startet ohne jede Vorgeschichte (dokumentierte Betriebsgrenze)", () => {
    const authRateLimit = require("./auth-rate-limit");
    const limiters = authRateLimit.createAuthRateLimiters();
    assert.strictEqual(limiters.loginPerEmail.size(), 0);
    limiters.loginPerEmail.consume("irgendein-schluessel", Date.now());
    assert.strictEqual(limiters.loginPerEmail.size(), 1);
    const restarted = authRateLimit.createAuthRateLimiters();
    assert.strictEqual(restarted.loginPerEmail.size(), 0);
  });

  console.log(`portal-operations-acceptance.test.js: ${passed} Prüfpunkte erfolgreich`);
}

function withIsolatedDataDirAsync(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-ops-test-data-"));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-ops-test-home-"));
  return Promise.resolve(fn(dataDir, homeDir)).finally(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });
}

function runBootstrap(dataDir, homeDir, email, password, passwordConfirm) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "scripts", "auth-bootstrap-owner.js"), "--email", email],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: homeDir, KUZ_DATA_DIR: dataDir },
        input: `${password}\n${passwordConfirm}\n`,
        encoding: "utf8",
        timeout: 15000,
      },
    );
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: error.stderr ? error.stderr.toString() : "",
    };
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
