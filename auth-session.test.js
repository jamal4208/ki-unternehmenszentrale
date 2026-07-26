"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authDb = require("./auth-db");
const authSession = require("./auth-session");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedDb() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-session-test-"));
  const opened = authDb.openAuthDatabase({ dataDir });
  return { ...opened, dataDir };
}

let counter = 0;
function makeTenantAndUser(db, overrides = {}) {
  counter += 1;
  const tenant = authDb.createTenantProjection(db, {
    customerId: `session-test-customer-${counter}`,
    displayName: `Session-Test-Tenant ${counter}`,
    status: "ACTIVE",
  });
  const user = authDb.createUser(db, {
    email: overrides.email || `session-nutzer-${counter}@example.test`,
    displayName: "Session-Test-Nutzer",
    role: "CUSTOMER_ADMIN",
    tenantId: tenant.id,
    status: "ACTIVE",
  });
  return { tenant, user };
}

function isoPlusMs(baseIso, ms) {
  return new Date(new Date(baseIso).getTime() + ms).toISOString();
}

const { db, dataDir } = makeIsolatedDb();

check("Session-Token hat 256 Bit Zufall (32 Byte)", () => {
  const { token } = authSession.generateSessionToken();
  const decoded = Buffer.from(token, "base64url");
  assert.strictEqual(decoded.length, authSession.SESSION_TOKEN_BYTES);
  assert.strictEqual(authSession.SESSION_TOKEN_BYTES, 32);
});

check("Klartext-Token wird nicht gespeichert – nur der Hash liegt in der Datenbank", () => {
  const { user } = makeTenantAndUser(db);
  const { token, session } = authSession.createSession(db, { userId: user.id });
  const rawRow = authDb.getSessionById(db, session.id);
  assert.ok(!JSON.stringify(rawRow).includes(token));
  assert.strictEqual(rawRow.tokenHash, authSession.hashSessionToken(token));
});

check("Hashlookup findet die Session anhand des gehashten Tokens", () => {
  const { user } = makeTenantAndUser(db);
  const { token, session } = authSession.createSession(db, { userId: user.id });
  const found = authDb.findSessionByTokenHash(db, authSession.hashSessionToken(token));
  assert.strictEqual(found.id, session.id);
});

check("absolute Ablaufzeit beträgt 12 Stunden und wird korrekt erkannt", () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const expiresAt = authSession.computeAbsoluteExpiry(createdAt);
  assert.strictEqual(expiresAt, "2026-01-01T12:00:00.000Z");
  assert.strictEqual(authSession.isAbsoluteExpired(expiresAt, "2026-01-01T11:59:59.999Z"), false);
  assert.strictEqual(authSession.isAbsoluteExpired(expiresAt, "2026-01-01T12:00:00.000Z"), true);
});

check("Leerlaufablauf tritt nach 60 Minuten ohne Aktivität ein", () => {
  const lastSeenAt = "2026-01-01T00:00:00.000Z";
  assert.strictEqual(authSession.isIdleExpired(lastSeenAt, isoPlusMs(lastSeenAt, 59 * 60 * 1000)), false);
  assert.strictEqual(authSession.isIdleExpired(lastSeenAt, isoPlusMs(lastSeenAt, 60 * 60 * 1000)), true);
});

check("validateAndTouchSession lehnt eine per Leerlauf abgelaufene Session ab", () => {
  const { user } = makeTenantAndUser(db);
  const createdAt = "2026-02-01T00:00:00.000Z";
  const { token } = authSession.createSession(db, { userId: user.id, now: createdAt });
  const idleLater = isoPlusMs(createdAt, 61 * 60 * 1000);
  const result = authSession.validateAndTouchSession(db, token, idleLater);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "EXPIRED");
});

check("validateAndTouchSession verlängert lastSeenAt bei gültiger Session", () => {
  const { user } = makeTenantAndUser(db);
  const createdAt = "2026-02-02T00:00:00.000Z";
  const { token, session } = authSession.createSession(db, { userId: user.id, now: createdAt });
  const later = isoPlusMs(createdAt, 5 * 60 * 1000);
  const result = authSession.validateAndTouchSession(db, token, later);
  assert.strictEqual(result.ok, true);
  const stored = authDb.getSessionById(db, session.id);
  assert.strictEqual(stored.lastSeenAt, later);
});

check("Widerruf einer Session macht sie ungültig", () => {
  const { user } = makeTenantAndUser(db);
  const { token, session } = authSession.createSession(db, { userId: user.id });
  const revoked = authSession.revokeSession(db, session.id);
  assert.strictEqual(revoked, true);
  const result = authSession.validateAndTouchSession(db, token);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "REVOKED");
});

check("Widerruf aller Sessions eines Nutzers invalidiert alle seine Sessions", () => {
  const { user } = makeTenantAndUser(db);
  const tokens = [];
  for (let i = 0; i < 3; i += 1) {
    const { token } = authSession.createSession(db, { userId: user.id, now: isoPlusMs("2026-03-01T00:00:00.000Z", i * 1000) });
    tokens.push(token);
  }
  const revokedCount = authSession.revokeAllSessionsForUser(db, user.id);
  assert.strictEqual(revokedCount, 3);
  tokens.forEach((token) => {
    const result = authSession.validateAndTouchSession(db, token);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "REVOKED");
  });
});

check("maximal fünf aktive Sessions je Nutzer – die älteste wird widerrufen", () => {
  const { user } = makeTenantAndUser(db);
  const base = "2026-04-01T00:00:00.000Z";
  const sessions = [];
  for (let i = 0; i < 6; i += 1) {
    const created = authSession.createSession(db, { userId: user.id, now: isoPlusMs(base, i * 1000) });
    sessions.push(created);
  }
  const active = authDb.listActiveSessionsForUser(db, user.id, isoPlusMs(base, 100 * 1000));
  assert.strictEqual(active.length, authSession.MAX_ACTIVE_SESSIONS_PER_USER);

  const oldestResult = authSession.validateAndTouchSession(db, sessions[0].token, isoPlusMs(base, 100 * 1000));
  assert.strictEqual(oldestResult.ok, false);
  assert.strictEqual(oldestResult.reason, "REVOKED");

  const newestResult = authSession.validateAndTouchSession(db, sessions[5].token, isoPlusMs(base, 100 * 1000));
  assert.strictEqual(newestResult.ok, true);
});

check("Rotation erzeugt einen neuen Token und widerruft den alten", () => {
  const { user } = makeTenantAndUser(db);
  const { token: originalToken } = authSession.createSession(db, { userId: user.id });
  const rotated = authSession.rotateSession(db, originalToken);
  assert.strictEqual(rotated.ok, true);
  assert.notStrictEqual(rotated.token, originalToken);

  const originalCheck = authSession.validateAndTouchSession(db, originalToken);
  assert.strictEqual(originalCheck.ok, false);
  assert.strictEqual(originalCheck.reason, "REVOKED");

  const rotatedCheck = authSession.validateAndTouchSession(db, rotated.token);
  assert.strictEqual(rotatedCheck.ok, true);
});

check("Rotation einer bereits widerrufenen Session schlägt fehl, ohne eine neue Session anzulegen", () => {
  const { user } = makeTenantAndUser(db);
  const { token, session } = authSession.createSession(db, { userId: user.id });
  authSession.revokeSession(db, session.id);
  const before = authDb.listActiveSessionsForUser(db, user.id).length;
  const rotated = authSession.rotateSession(db, token);
  assert.strictEqual(rotated.ok, false);
  const after = authDb.listActiveSessionsForUser(db, user.id).length;
  assert.strictEqual(before, after);
});

check("abgelaufene Sessions werden durch cleanupExpiredSessions bereinigt", () => {
  const { user } = makeTenantAndUser(db);
  const createdAt = "2026-05-01T00:00:00.000Z";
  const { session } = authSession.createSession(db, { userId: user.id, now: createdAt });
  const longAfterExpiry = isoPlusMs(createdAt, 13 * 60 * 60 * 1000);
  const deletedCount = authSession.cleanupExpiredSessions(db, longAfterExpiry);
  assert.ok(deletedCount >= 1);
  assert.strictEqual(authDb.getSessionById(db, session.id), null);
});

check("Session ist an Nutzer und Mandant gebunden (aus dem Nutzerdatensatz abgeleitet, nicht vom Aufrufer übernommen)", () => {
  const { tenant, user } = makeTenantAndUser(db);
  const { session } = authSession.createSession(db, {
    userId: user.id,
    // Versuch, einen fremden Mandanten unterzuschieben – wird ignoriert.
    tenantId: "fremder-mandant-xyz",
  });
  assert.strictEqual(session.userId, user.id);
  assert.strictEqual(session.tenantId, tenant.id);
});

check("Geräte-/IP-Kontext wird ausschließlich gehasht abgelegt, niemals im Klartext", () => {
  const { user } = makeTenantAndUser(db);
  const userAgent = "Mozilla/5.0 (Testgerät)";
  const clientIp = "203.0.113.42";
  const { session } = authSession.createSession(db, { userId: user.id, userAgent, clientIp });
  assert.strictEqual(session.userAgentHash, authSession.hashOptionalContext(userAgent));
  assert.strictEqual(session.clientIpHash, authSession.hashOptionalContext(clientIp));
  assert.ok(!JSON.stringify(session).includes(userAgent));
  assert.ok(!JSON.stringify(session).includes(clientIp));
});

check("ohne User-Agent/IP bleibt der jeweilige Hash null (kein erfundener Wert)", () => {
  const { user } = makeTenantAndUser(db);
  const { session } = authSession.createSession(db, { userId: user.id });
  assert.strictEqual(session.userAgentHash, null);
  assert.strictEqual(session.clientIpHash, null);
});

check("Sessionerzeugung für einen unbekannten Nutzer wird abgewiesen", () => {
  assert.throws(() => authSession.createSession(db, { userId: "nicht-existierender-nutzer" }), /existiert nicht/);
});

check("keine Cookie- oder HTTP-Logik im Sessionkern (Auftrag Abschnitt I)", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-session.js"), "utf8");
  assert.ok(!/set-cookie/i.test(source));
  assert.ok(!/req\.|res\.|http\.createServer/.test(source));
});

check("auth-session.js importiert selbst kein better-sqlite3", () => {
  const source = fs.readFileSync(path.join(__dirname, "auth-session.js"), "utf8");
  assert.ok(!/require\(["']better-sqlite3["']\)/.test(source));
});

authDb.closeAuthDatabase(db);
fs.rmSync(dataDir, { recursive: true, force: true });

console.log(`auth-session.test.js: ${passed} Prüfpunkte erfolgreich`);
