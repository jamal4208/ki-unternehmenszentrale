"use strict";

// V7.2 Phase A Schritt 1 – Passwort-Hashing (Auftrag Abschnitt H).
//
// Ausschließlich Node-Core-Kryptografie (crypto.scrypt, crypto.randomBytes,
// crypto.timingSafeEqual). Keine eigene Kryptografie, keine zusätzliche
// Abhängigkeit. Dieses Modul importiert NIEMALS better-sqlite3 und hat
// keine Kenntnis von HTTP, Routen oder Cookies.

const crypto = require("crypto");

const HASH_PREFIX = "scrypt";
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64; // Byte
const SCRYPT_SALT_BYTES = 16; // Byte
const SCRYPT_MAXMEM = 64 * 1024 * 1024; // 64 MB

const MIN_PASSWORD_LENGTH = 12;

// Kleine, bewusst begrenzte lokale Sperrliste offensichtlich unsicherer
// Passwörter (keine externe Abhängigkeit, kein Wörterbuchabgleich).
// Einträge sind absichtlich >= 12 Zeichen, damit sie durch die
// Mindestlängenprüfung nicht bereits vorher ausgefiltert werden.
const BLOCKED_PASSWORDS = Object.freeze(
  [
    "password1234",
    "passwort1234",
    "123456789012",
    "1234567890123",
    "qwertzuiopqwertz",
    "qwertyuiop123",
    "adminadmin123",
    "willkommen123",
    "letmein123456",
    "changeme12345",
    "administrator1",
  ].map((entry) => entry.toLowerCase()),
);

function assertPasswordIsString(password) {
  if (typeof password !== "string") {
    throw new Error("Passwort muss eine Zeichenkette sein.");
  }
}

function normalizeForComparison(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function scryptDerive(password, salt, keylen, params) {
  return crypto.scryptSync(password, salt, keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

function formatHash(params, salt, derived) {
  return [
    HASH_PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

// Parameterprüfung: liest ein gespeichertes Hashformat strukturiert und
// ohne Vertrauen in den Inhalt ein. Gibt bei jeder Abweichung null zurück,
// statt zu raten.
function parseStoredHash(stored) {
  if (typeof stored !== "string" || !stored) return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N <= 0 || r <= 0 || p <= 0) return null;
  let salt;
  let hash;
  try {
    salt = Buffer.from(parts[4], "base64");
    hash = Buffer.from(parts[5], "base64");
  } catch (_error) {
    return null;
  }
  if (!salt.length || !hash.length) return null;
  return { N, r, p, salt, hash };
}

function hashPassword(password) {
  assertPasswordIsString(password);
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const params = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  const derived = scryptDerive(password, salt, SCRYPT_KEYLEN, params);
  return formatHash(params, salt, derived);
}

// Vorbereiteter Dummy-Hash für unbekannte Konten (Auftrag Abschnitt H,
// letzter Punkt). Ein zukünftiger Login-Ablauf kann bei einem unbekannten
// Konto trotzdem verifyPassword() gegen diesen Dummy-Hash aufrufen, um die
// Rechenzeit unabhängig von der Kontoexistenz konstant zu halten. Das
// zugrunde liegende Passwort ist zufällig und wird nirgendwo verwendet.
const DUMMY_HASH_FOR_UNKNOWN_ACCOUNT = hashPassword(crypto.randomBytes(32).toString("hex"));

// Konstante Vergleichslogik: leitet das eingegebene Passwort mit den im
// Hash gespeicherten Parametern ab und vergleicht ausschließlich über
// crypto.timingSafeEqual. Bei ungültigem Hashformat wird trotzdem eine
// Ableitung durchgeführt (gegen den Dummy-Hash), damit kein Timing-
// Unterschied zwischen "unbekanntes Format" und "falsches Passwort" entsteht.
function verifyPassword(password, storedHash) {
  if (typeof password !== "string") return false;
  const parsed = parseStoredHash(storedHash) || parseStoredHash(DUMMY_HASH_FOR_UNKNOWN_ACCOUNT);
  const validStoredFormat = Boolean(parseStoredHash(storedHash));
  const derived = scryptDerive(password, parsed.salt, parsed.hash.length, parsed);
  const matches = derived.length === parsed.hash.length && crypto.timingSafeEqual(derived, parsed.hash);
  return validStoredFormat && matches;
}

// Rehash-Bedarf: true, wenn der gespeicherte Hash nicht den aktuellen
// Parametern entspricht (oder gar nicht lesbar ist).
function needsRehash(storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return true;
  return (
    parsed.N !== SCRYPT_N ||
    parsed.r !== SCRYPT_R ||
    parsed.p !== SCRYPT_P ||
    parsed.hash.length !== SCRYPT_KEYLEN ||
    parsed.salt.length !== SCRYPT_SALT_BYTES
  );
}

// Passwortregeln (Auftrag Abschnitt H, Mindestregeln). Bewusst keine
// erzwungene regelmäßige Änderung, keine Sonderzeichenregel.
function validatePasswordPolicy(password, context = {}) {
  const reasons = [];
  if (typeof password !== "string") {
    return { ok: false, reasons: ["Passwort muss eine Zeichenkette sein."] };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    reasons.push(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  const normalizedPassword = normalizeForComparison(password);
  const normalizedEmail = normalizeForComparison(context.emailNormalized || context.email);
  if (normalizedEmail && normalizedPassword === normalizedEmail) {
    reasons.push("Passwort darf nicht mit der E-Mail-Adresse identisch sein.");
  }
  const normalizedTenantName = normalizeForComparison(context.tenantDisplayName);
  if (normalizedTenantName && normalizedPassword === normalizedTenantName) {
    reasons.push("Passwort darf nicht mit dem Mandantennamen identisch sein.");
  }
  if (BLOCKED_PASSWORDS.includes(normalizedPassword)) {
    reasons.push("Passwort steht auf der Sperrliste offensichtlich unsicherer Passwörter.");
  }
  return { ok: reasons.length === 0, reasons };
}

module.exports = {
  HASH_PREFIX,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  SCRYPT_KEYLEN,
  SCRYPT_SALT_BYTES,
  SCRYPT_MAXMEM,
  MIN_PASSWORD_LENGTH,
  BLOCKED_PASSWORDS,
  DUMMY_HASH_FOR_UNKNOWN_ACCOUNT,
  parseStoredHash,
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordPolicy,
};
