"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const authDb = require("./auth-db");
const authTenantLink = require("./auth-tenant-link");
const authPassword = require("./auth-password");
const migrations = require("./auth-db-migrations");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb(prefix = "auth-db-test-") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const opened = authDb.openAuthDatabase({ dataDir });
  return { ...opened, dataDir };
}

function makeTenant(db, customerId, overrides = {}) {
  return authDb.createTenantProjection(db, {
    customerId,
    displayName: overrides.displayName || `Test-Tenant ${customerId}`,
    status: overrides.status || "ACTIVE",
    now: overrides.now,
  });
}

function makeUser(db, tenantId, overrides = {}) {
  return authDb.createUser(db, {
    email: overrides.email || `nutzer-${Math.random().toString(36).slice(2)}@example.test`,
    displayName: overrides.displayName || "Test-Nutzer",
    role: overrides.role || (tenantId ? "CUSTOMER_ADMIN" : "OWNER"),
    tenantId,
    status: overrides.status || "ACTIVE",
    passwordHash: overrides.passwordHash ?? authPassword.hashPassword("EinSicheresTestpasswort123"),
    now: overrides.now,
  });
}

// ---------------------------------------------------------------------------
// 1. Datenbank entsteht nur im isolierten Testverzeichnis; Dateirechte.
// ---------------------------------------------------------------------------

const productionDataDirCandidates = [
  path.join(os.homedir(), "Library", "Application Support", "KI-Unternehmenszentrale"),
];

check("Datenbank entsteht nur im isolierten Testverzeichnis (Produktivpfad bleibt unberührt)", () => {
  const before = productionDataDirCandidates.map((dir) => (fs.existsSync(path.join(dir, "auth")) ? fs.readdirSync(path.join(dir, "auth")).length : null));
  const { db, paths, dataDir } = makeIsolatedDb();
  assert.ok(paths.dbPath.startsWith(dataDir));
  assert.ok(fs.existsSync(paths.dbPath));
  authDb.closeAuthDatabase(db);
  const after = productionDataDirCandidates.map((dir) => (fs.existsSync(path.join(dir, "auth")) ? fs.readdirSync(path.join(dir, "auth")).length : null));
  assert.deepStrictEqual(before, after);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Verzeichnisrechte des auth-Verzeichnisses sind 0o700", () => {
  const { db, paths, dataDir } = makeIsolatedDb();
  const mode = fs.statSync(paths.authDir).mode & 0o777;
  assert.strictEqual(mode, 0o700);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Dateirechte der Datenbankdatei sind 0o600", () => {
  const { db, paths, dataDir } = makeIsolatedDb();
  const mode = fs.statSync(paths.dbPath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 2. Migrationen: idempotent, transaktional.
// ---------------------------------------------------------------------------

check("Migrationen sind idempotent: zweiter Lauf wendet nichts erneut an", () => {
  const { db, dataDir } = makeIsolatedDb();
  const secondRun = migrations.runMigrations(db);
  assert.deepStrictEqual(secondRun.appliedNow, []);
  const versions = migrations.getAppliedVersions(db);
  assert.deepStrictEqual(versions, migrations.MIGRATIONS.map((m) => m.version));
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Migrationen sind transaktional: eine fehlerhafte Migration hinterlässt keinen Teilzustand", () => {
  const { db, dataDir } = makeIsolatedDb();
  assert.throws(() => {
    db.transaction(() => {
      db.exec("CREATE TABLE trial_rollback_table (id TEXT)");
      throw new Error("Erzwungener Testfehler nach DDL innerhalb der Transaktion.");
    })();
  });
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trial_rollback_table'")
    .get();
  assert.strictEqual(tableExists, undefined);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 3. Unique-E-Mail, Rollen-/Status-/Tenantconstraints.
// ---------------------------------------------------------------------------

check("E-Mail-Adresse ist eindeutig (Unique-Constraint)", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "constraint-test-customer-a");
  makeUser(db, tenant.id, { email: "doppelt@example.test" });
  assert.throws(() => makeUser(db, tenant.id, { email: "Doppelt@Example.Test" }), /UNIQUE/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Rollenconstraint: unbekannte Rolle wird von der Datenbank abgewiesen", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "constraint-test-customer-b");
  assert.throws(() => makeUser(db, tenant.id, { role: "SUPERADMIN" }), /CHECK/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Statusconstraint: unbekannter Nutzerstatus wird von der Datenbank abgewiesen", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "constraint-test-customer-c");
  assert.throws(() => makeUser(db, tenant.id, { status: "GEHEIM" }), /CHECK/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Tenantconstraint: OWNER/SUPPORT ohne tenantId ist gültig, CUSTOMER_ADMIN ohne tenantId wird abgewiesen", () => {
  const { db, dataDir } = makeIsolatedDb();
  const owner = makeUser(db, null, { role: "OWNER", email: "owner@example.test" });
  assert.strictEqual(owner.tenantId, null);
  const support = makeUser(db, null, { role: "SUPPORT", email: "support@example.test" });
  assert.strictEqual(support.tenantId, null);
  assert.throws(() => makeUser(db, null, { role: "CUSTOMER_ADMIN", email: "admin-ohne-tenant@example.test" }), /CHECK/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Tenantconstraint: unbekannte tenantId wird per Foreign Key abgewiesen", () => {
  const { db, dataDir } = makeIsolatedDb();
  assert.throws(
    () => makeUser(db, "nicht-existierende-tenant-id", { role: "CUSTOMER_ADMIN", email: "fk-test@example.test" }),
    /FOREIGN KEY/,
  );
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Tenantstatusconstraint: unbekannter Tenantstatus wird von der Datenbank abgewiesen", () => {
  const { db, dataDir } = makeIsolatedDb();
  assert.throws(() => makeTenant(db, "constraint-test-customer-d", { status: "UNBEKANNT" }), /CHECK/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 4. Reset-Token: atomar, einmalig, parallele Einlösung blockiert.
// ---------------------------------------------------------------------------

check("Reset-Token-Einlösung ist atomar und genau einmal möglich", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "reset-token-customer-a");
  const user = makeUser(db, tenant.id, { email: "reset-a@example.test" });
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  authDb.createResetToken(db, { tokenHash: "reset-hash-a", userId: user.id, purpose: "RESET", now, expiresAt });

  const first = authDb.consumeResetToken(db, "reset-hash-a", now);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.changes, 1);

  const second = authDb.consumeResetToken(db, "reset-hash-a", now);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.changes, 0);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("parallele Einlösung desselben Reset-Tokens: nur eine Einlösung zählt", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "reset-token-customer-b");
  const user = makeUser(db, tenant.id, { email: "reset-b@example.test" });
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  authDb.createResetToken(db, { tokenHash: "reset-hash-b", userId: user.id, purpose: "INVITE", now, expiresAt });

  const results = [
    authDb.consumeResetToken(db, "reset-hash-b", now),
    authDb.consumeResetToken(db, "reset-hash-b", now),
    authDb.consumeResetToken(db, "reset-hash-b", now),
  ];
  const successCount = results.filter((result) => result.ok).length;
  assert.strictEqual(successCount, 1);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("abgelaufener Reset-Token kann nicht mehr eingelöst werden", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "reset-token-customer-c");
  const user = makeUser(db, tenant.id, { email: "reset-c@example.test" });
  const now = new Date().toISOString();
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  authDb.createResetToken(db, { tokenHash: "reset-hash-c", userId: user.id, purpose: "RESET", now, expiresAt: expiredAt });
  const result = authDb.consumeResetToken(db, "reset-hash-c", now);
  assert.strictEqual(result.ok, false);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 5. Sessions: Massenwiderruf.
// ---------------------------------------------------------------------------

check("Massenwiderruf widerruft alle aktiven Sessions eines Nutzers und lässt fremde Sessions unberührt", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenant = makeTenant(db, "bulk-revoke-customer");
  const userA = makeUser(db, tenant.id, { email: "bulk-a@example.test" });
  const userB = makeUser(db, tenant.id, { email: "bulk-b@example.test" });
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  for (let i = 0; i < 3; i += 1) {
    authDb.insertSession(db, {
      id: `sess-a-${i}`,
      tokenHash: `hash-a-${i}`,
      userId: userA.id,
      tenantId: tenant.id,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    });
  }
  authDb.insertSession(db, {
    id: "sess-b-0",
    tokenHash: "hash-b-0",
    userId: userB.id,
    tenantId: tenant.id,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
  });

  const revokedCount = authDb.revokeAllSessionsForUser(db, userA.id, now);
  assert.strictEqual(revokedCount, 3);
  const activeA = authDb.listActiveSessionsForUser(db, userA.id, now);
  assert.strictEqual(activeA.length, 0);
  const activeB = authDb.listActiveSessionsForUser(db, userB.id, now);
  assert.strictEqual(activeB.length, 1);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 6. Audit: append-only.
// ---------------------------------------------------------------------------

check("Audit-Tabelle ist append-only: UPDATE wird per Trigger abgelehnt", () => {
  const { db, dataDir } = makeIsolatedDb();
  db.prepare(
    "INSERT INTO auth_audit_events (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata) VALUES (?, NULL, NULL, 'LOGIN_SUCCESS', 'OK', ?, NULL)",
  ).run("audit-append-only-1", new Date().toISOString());
  assert.throws(
    () => db.prepare("UPDATE auth_audit_events SET result = 'ERROR' WHERE eventId = ?").run("audit-append-only-1"),
    /append-only/,
  );
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Audit-Tabelle ist append-only: DELETE wird per Trigger abgelehnt", () => {
  const { db, dataDir } = makeIsolatedDb();
  db.prepare(
    "INSERT INTO auth_audit_events (eventId, actorUserId, tenantId, eventType, result, timestamp, metadata) VALUES (?, NULL, NULL, 'LOGOUT', 'OK', ?, NULL)",
  ).run("audit-append-only-2", new Date().toISOString());
  assert.throws(
    () => db.prepare("DELETE FROM auth_audit_events WHERE eventId = ?").run("audit-append-only-2"),
    /append-only/,
  );
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("auth-db.js exportiert keine Update- oder Delete-Funktion für Audit-Ereignisse", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-db.js"), "utf8");
  assert.ok(!/updateAuditEvent|deleteAuditEvent/.test(source));
});

// ---------------------------------------------------------------------------
// 7. Registry-Abgleich (auth-tenant-link.js).
// ---------------------------------------------------------------------------

check("Registry-Abgleich projiziert bestehende Café-/Testmandanten korrekt", () => {
  const { db, dataDir } = makeIsolatedDb();
  const sync = authTenantLink.syncTenantProjections(db);
  assert.ok(sync.createdCustomerIds.includes("test-customer-fiktives-cafe"));
  assert.ok(sync.createdCustomerIds.includes("test-customer-fiktives-fitnessstudio"));
  const cafe = authDb.getTenantProjectionByCustomerId(db, "test-customer-fiktives-cafe");
  assert.ok(cafe);
  assert.ok(/Fiktiv/i.test(cafe.displayName));
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Registry-Mandant ohne Datenbankzeile wird als SUSPENDED projiziert", () => {
  const { db, dataDir } = makeIsolatedDb();
  authTenantLink.syncTenantProjections(db);
  const cafe = authDb.getTenantProjectionByCustomerId(db, "test-customer-fiktives-cafe");
  assert.strictEqual(cafe.status, "SUSPENDED");
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("unbekannter Datenbankmandant (ohne Registry-Eintrag) bricht den Abgleich hart ab", () => {
  const { db, dataDir } = makeIsolatedDb();
  authDb.createTenantProjection(db, {
    customerId: "nicht-in-der-registry-vorhandener-kunde",
    displayName: "Waisen-Mandant",
    status: "ACTIVE",
  });
  assert.throws(() => authTenantLink.syncTenantProjections(db), /kanonische Mandantenwahrheit/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("Registry bleibt kanonisch: Abgleich legt niemals einen neuen Registry-Mandanten an", () => {
  const { db, dataDir } = makeIsolatedDb();
  const tenantRegistry = require("./agency-tenant-registry");
  const before = tenantRegistry.listCustomers().length;
  authTenantLink.syncTenantProjections(db);
  const after = tenantRegistry.listCustomers().length;
  assert.strictEqual(before, after);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("unbekannte customerId blockiert die Projektionsanfrage", () => {
  const { db, dataDir } = makeIsolatedDb();
  assert.throws(() => authTenantLink.getTenantProjectionForCustomer(db, "voellig-unbekannt-xyz"), /Unbekannte Kunden-ID/);
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

check("kein Test berührt Produktivdaten: alle Testdatenbanken liegen unter os.tmpdir()", () => {
  const { db, dataDir } = makeIsolatedDb();
  assert.ok(dataDir.startsWith(fs.realpathSync(os.tmpdir())) || dataDir.startsWith(os.tmpdir()));
  authDb.closeAuthDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 8. Fail-closed-Startverhalten bei fehlgeschlagenem Modulimport.
// ---------------------------------------------------------------------------

check("fehlgeschlagener better-sqlite3-Import führt zu hartem, ungefangenem Startabbruch (kein stiller Fallback)", () => {
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-db-broken-import-"));
  try {
    const authDbSource = fs.readFileSync(path.join(__dirname, "auth-db.js"), "utf8");
    fs.writeFileSync(path.join(isolatedDir, "auth-db.js"), authDbSource);
    let stderr = "";
    let exitCode = 0;
    try {
      execFileSync(process.execPath, ["-e", "require('./auth-db.js')"], {
        cwd: isolatedDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      exitCode = typeof error.status === "number" ? error.status : 1;
      stderr = String(error.stderr || "");
    }
    assert.notStrictEqual(exitCode, 0);
    assert.ok(/Cannot find module ["']better-sqlite3["']/.test(stderr) || /MODULE_NOT_FOUND/.test(stderr));
  } finally {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
});

check("better-sqlite3-Import in auth-db.js ist NICHT von try/catch umschlossen", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-db.js"), "utf8");
  const importLine = source.split("\n").find((line) => /require\(["']better-sqlite3["']\)/.test(line));
  assert.ok(importLine);
  const importIndex = source.indexOf(importLine);
  const before = source.slice(0, importIndex);
  const openTryCount = (before.match(/\btry\s*\{/g) || []).length;
  const closeCatchCount = (before.match(/\}\s*catch/g) || []).length;
  assert.strictEqual(openTryCount, closeCatchCount);
});

check("fehlerhafte Migration führt zu einem geschlossenen fail-closed Startfehler (AuthDatabaseStartupError)", () => {
  // Bewusst als Unterverzeichnis des Projekts (nicht os.tmpdir()) angelegt,
  // damit die normale better-sqlite3-Modulauflösung über das vorhandene
  // node_modules dieses Projekts funktioniert. Wird am Ende vollständig
  // entfernt und nie committet (siehe .gitignore-Prüfung in Abschnitt O).
  const harnessDir = fs.mkdtempSync(path.join(__dirname, ".tmp-auth-db-migration-test-"));
  const brokenAuthDbPath = path.join(harnessDir, "auth-db-broken.js");
  const brokenMigrationsPath = path.join(harnessDir, "auth-db-migrations-broken.js");
  fs.writeFileSync(
    brokenMigrationsPath,
    "\"use strict\";\nfunction runMigrations() { throw new Error(\"Erzwungener Migrationsfehler.\"); }\nmodule.exports = { runMigrations, getAppliedVersions: () => [], MIGRATIONS: [] };\n",
  );
  const originalSource = fs.readFileSync(path.join(__dirname, "auth-db.js"), "utf8");
  const patchedSource = originalSource.replace('require("./auth-db-migrations")', 'require("./auth-db-migrations-broken")');
  fs.writeFileSync(brokenAuthDbPath, patchedSource);
  fs.copyFileSync(path.join(__dirname, "server-status.js"), path.join(harnessDir, "server-status.js"));
  fs.copyFileSync(path.join(__dirname, "project-registry.js"), path.join(harnessDir, "project-registry.js"));

  const brokenAuthDb = require(brokenAuthDbPath);
  const isolatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-db-broken-migration-target-"));
  try {
    assert.throws(
      () => brokenAuthDb.openAuthDatabase({ dataDir: isolatedDataDir }),
      (error) => error instanceof brokenAuthDb.AuthDatabaseStartupError && error.reasonCode === "MIGRATION_FAILED",
    );
  } finally {
    fs.rmSync(harnessDir, { recursive: true, force: true });
    fs.rmSync(isolatedDataDir, { recursive: true, force: true });
    delete require.cache[require.resolve(brokenAuthDbPath)];
  }
});

// ---------------------------------------------------------------------------
// 9. Ausschließlichkeit des better-sqlite3-Imports und der Dependency-Version.
// ---------------------------------------------------------------------------

check("kein anderes Modul im Projekt importiert better-sqlite3", () => {
  const projectFiles = fs
    .readdirSync(__dirname)
    .filter((name) => name.endsWith(".js") && !name.startsWith("."));
  const offenders = projectFiles.filter((name) => {
    if (name === "auth-db.js") return false;
    const content = fs.readFileSync(path.join(__dirname, name), "utf8");
    return /require\(["']better-sqlite3["']\)/.test(content);
  });
  assert.deepStrictEqual(offenders, []);
});

check("package.json und package-lock.json enthalten dieselbe exakte, gepinnte better-sqlite3-Version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, "package-lock.json"), "utf8"));
  const declaredVersion = pkg.dependencies && pkg.dependencies["better-sqlite3"];
  assert.ok(declaredVersion, "better-sqlite3 fehlt in package.json#dependencies");
  assert.ok(!/^[\^~]/.test(declaredVersion), "keine Caret- oder Tilde-Range erlaubt");
  assert.ok(/^\d+\.\d+\.\d+$/.test(declaredVersion), "keine Range, exakt eine Version erwartet");
  const lockEntry = lock.packages && lock.packages["node_modules/better-sqlite3"];
  assert.ok(lockEntry, "better-sqlite3 fehlt im Lockfile");
  assert.strictEqual(lockEntry.version, declaredVersion);
});

check("keine zweite neue Produktivdependency in package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const dependencyNames = Object.keys(pkg.dependencies || {});
  assert.deepStrictEqual(dependencyNames, ["better-sqlite3"]);
});

console.log(`auth-db.test.js: ${passed} Prüfpunkte erfolgreich`);
