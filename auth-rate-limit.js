"use strict";

// V7.2 Phase A Schritt 2 – In-Memory-Rate-Limiting für Auth-Routen (Auftrag
// Abschnitt I). Keine zusätzliche Abhängigkeit. Schlüssel werden vor der
// Ablage gehasht (niemals Klartext-E-Mail/-IP im Speicher). Uhr ist über
// `now` injizierbar, damit Tests kontrollierbare Zeit verwenden können.

const crypto = require("crypto");

function hashKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey || ""), "utf8").digest("hex");
}

// Ein einzelner Zähler mit festem Zeitfenster (Fixed-Window). Für die hier
// verlangten Grenzwerte ausreichend präzise und einfach nachvollziehbar.
function createFixedWindowLimiter({ windowMs, max }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("createFixedWindowLimiter: windowMs muss positiv sein.");
  }
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error("createFixedWindowLimiter: max muss eine positive Ganzzahl sein.");
  }

  const buckets = new Map(); // hashedKey -> { count, windowStart }

  function cleanup(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.windowStart >= windowMs) {
        buckets.delete(key);
      }
    }
  }

  // check: verbraucht KEINEN Versuch, meldet nur, ob aktuell noch Kapazität
  // vorhanden wäre. consume: verbraucht tatsächlich einen Versuch.
  function getBucket(rawKey, now) {
    const key = hashKey(rawKey);
    const existing = buckets.get(key);
    if (!existing || now - existing.windowStart >= windowMs) {
      return { key, bucket: { count: 0, windowStart: now }, isNew: true };
    }
    return { key, bucket: existing, isNew: false };
  }

  function retryAfterMs(bucket, now) {
    return Math.max(0, windowMs - (now - bucket.windowStart));
  }

  function check(rawKey, now = Date.now()) {
    const { bucket } = getBucket(rawKey, now);
    const allowed = bucket.count < max;
    return { allowed, retryAfterMs: allowed ? 0 : retryAfterMs(bucket, now) };
  }

  function consume(rawKey, now = Date.now()) {
    if (buckets.size > 10000) cleanup(now);
    const { key, bucket, isNew } = getBucket(rawKey, now);
    const allowed = bucket.count < max;
    if (allowed) {
      bucket.count += 1;
    }
    if (isNew || allowed) {
      buckets.set(key, bucket);
    }
    return { allowed, retryAfterMs: allowed ? 0 : retryAfterMs(bucket, now) };
  }

  function reset(rawKey) {
    buckets.delete(hashKey(rawKey));
  }

  function size() {
    return buckets.size;
  }

  return { check, consume, reset, cleanup, size, windowMs, max };
}

// ---------------------------------------------------------------------------
// Konkrete, im Auftrag geforderte Limiter (Auftrag Abschnitt I).
// ---------------------------------------------------------------------------

function createAuthRateLimiters() {
  return {
    loginPerEmail: createFixedWindowLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
    loginPerIp: createFixedWindowLimiter({ windowMs: 5 * 60 * 1000, max: 20 }),
    resetRequestPerAccount: createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 3 }),
    resetRequestPerIp: createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    resetConfirmPerIp: createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 20 }),
  };
}

module.exports = {
  hashKey,
  createFixedWindowLimiter,
  createAuthRateLimiters,
};
