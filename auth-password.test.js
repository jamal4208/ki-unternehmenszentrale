"use strict";

const assert = require("assert");
const fs = require("fs");

const authPassword = require("./auth-password");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

const TEST_PASSWORD = "EinSicheresTestpasswort123";

check("Hashformat entspricht scrypt$N$r$p$salt$hash", () => {
  const hash = authPassword.hashPassword(TEST_PASSWORD);
  const parts = hash.split("$");
  assert.strictEqual(parts.length, 6);
  assert.strictEqual(parts[0], "scrypt");
  assert.strictEqual(Number(parts[1]), authPassword.SCRYPT_N);
  assert.strictEqual(Number(parts[2]), authPassword.SCRYPT_R);
  assert.strictEqual(Number(parts[3]), authPassword.SCRYPT_P);
});

check("zwei Hashes desselben Passworts verwenden unterschiedliche Salts", () => {
  const hashA = authPassword.hashPassword(TEST_PASSWORD);
  const hashB = authPassword.hashPassword(TEST_PASSWORD);
  const saltA = hashA.split("$")[4];
  const saltB = hashB.split("$")[4];
  assert.notStrictEqual(saltA, saltB);
  assert.notStrictEqual(hashA, hashB);
});

check("korrektes Passwort wird verifiziert", () => {
  const hash = authPassword.hashPassword(TEST_PASSWORD);
  assert.strictEqual(authPassword.verifyPassword(TEST_PASSWORD, hash), true);
});

check("falsches Passwort wird abgelehnt", () => {
  const hash = authPassword.hashPassword(TEST_PASSWORD);
  assert.strictEqual(authPassword.verifyPassword("EinFalschesPasswort123", hash), false);
});

check("Dummy-Hash für unbekannte Konten ist vorbereitet und gültig formatiert", () => {
  const parsed = authPassword.parseStoredHash(authPassword.DUMMY_HASH_FOR_UNKNOWN_ACCOUNT);
  assert.ok(parsed);
  assert.strictEqual(parsed.N, authPassword.SCRYPT_N);
});

check("verifyPassword gegen ein beschädigtes Hashformat liefert false statt einen Fehler zu werfen", () => {
  assert.strictEqual(authPassword.verifyPassword(TEST_PASSWORD, "kein-gueltiges-format"), false);
  assert.strictEqual(authPassword.verifyPassword(TEST_PASSWORD, null), false);
});

check("verwendet crypto.timingSafeEqual für den Vergleich (konstante Vergleichslogik)", () => {
  const source = fs.readFileSync(__filename.replace("auth-password.test.js", "auth-password.js"), "utf8");
  assert.ok(/crypto\.timingSafeEqual/.test(source));
});

check("Modul importiert ausschließlich Node-Core-Kryptografie (keine eigene Kryptobibliothek)", () => {
  const source = fs.readFileSync(__filename.replace("auth-password.test.js", "auth-password.js"), "utf8");
  assert.ok(/require\(["']crypto["']\)/.test(source));
  assert.ok(!/require\(["'](?!crypto)[^"']*(crypt|hash|bcrypt|argon)[^"']*["']\)/i.test(source));
});

check("Passwortregel: Mindestlänge 12 Zeichen wird erzwungen", () => {
  const short = authPassword.validatePasswordPolicy("kurz1234567", {});
  assert.strictEqual(short.ok, false);
  assert.ok(short.reasons.some((reason) => /mindestens 12 Zeichen/.test(reason)));

  const longEnough = authPassword.validatePasswordPolicy("GenauLangGenug12", {});
  assert.strictEqual(longEnough.reasons.some((reason) => /mindestens 12 Zeichen/.test(reason)), false);
});

check("Passwortregel: normalisierte E-Mail als Passwort wird blockiert", () => {
  const result = authPassword.validatePasswordPolicy("Admin@Cafe.Test", { emailNormalized: "admin@cafe.test" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((reason) => /E-Mail-Adresse/.test(reason)));
});

check("Passwortregel: Mandantenname als Passwort wird blockiert", () => {
  const result = authPassword.validatePasswordPolicy("Fiktives Café Sonnenseite", {
    tenantDisplayName: "Fiktives Café Sonnenseite",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((reason) => /Mandantennamen/.test(reason)));
});

check("Passwortregel: Sperrlistenpasswort wird blockiert", () => {
  assert.ok(authPassword.BLOCKED_PASSWORDS.length > 0);
  const blocked = authPassword.BLOCKED_PASSWORDS[0];
  const result = authPassword.validatePasswordPolicy(blocked, {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.reasons.some((reason) => /Sperrliste/.test(reason)));
});

check("gültiges Passwort ohne Regelverstoß wird akzeptiert", () => {
  const result = authPassword.validatePasswordPolicy(TEST_PASSWORD, {
    emailNormalized: "admin@cafe.test",
    tenantDisplayName: "Fiktives Café Sonnenseite",
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.reasons, []);
});

check("Rehash-Erkennung: aktueller Hash braucht kein Rehash, veralteter Hash braucht Rehash", () => {
  const currentHash = authPassword.hashPassword(TEST_PASSWORD);
  assert.strictEqual(authPassword.needsRehash(currentHash), false);

  const outdatedHash = currentHash.replace(`$${authPassword.SCRYPT_N}$`, "$16384$");
  assert.strictEqual(authPassword.needsRehash(outdatedHash), true);
  assert.strictEqual(authPassword.needsRehash("kein-gueltiges-format"), true);
});

check("kein Klartext des Passworts im gespeicherten Hash enthalten", () => {
  const hash = authPassword.hashPassword(TEST_PASSWORD);
  assert.ok(!hash.includes(TEST_PASSWORD));
});

check("Fehler von validatePasswordPolicy enthalten niemals den Passwortwert selbst", () => {
  const secretMarker = "GEHEIMES_TESTPASSWORT_MARKER_998877";
  try {
    authPassword.validatePasswordPolicy(123, {});
  } catch (error) {
    assert.ok(!String(error.message).includes(secretMarker));
  }
  const result = authPassword.validatePasswordPolicy(secretMarker, {});
  const serializedReasons = JSON.stringify(result.reasons);
  assert.ok(!serializedReasons.includes(secretMarker));
});

check("hashPassword wirft bei Nicht-String ohne den Wert im Fehler zu nennen", () => {
  assert.throws(() => authPassword.hashPassword(undefined), (error) => {
    return !String(error.message).toLowerCase().includes("undefined") || /Passwort muss eine Zeichenkette sein/.test(error.message);
  });
});

console.log(`auth-password.test.js: ${passed} Prüfpunkte erfolgreich`);
