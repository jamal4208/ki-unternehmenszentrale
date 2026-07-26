"use strict";

// V7.2 Phase A Schritt 2 – HTTP-Randschicht für Auth (Auftrag Abschnitt F).
//
// Enthält ausschließlich Cookie-Serialisierung/-Parsing, Origin-/Host-
// Prüfung, CSRF (Double-Submit-Cookie, keine Serverspeicherung nötig),
// minimale Client-IP-Ermittlung und generische, geheimnisfreie
// Fehlerantworten. Keine zusätzliche Abhängigkeit, keine eigene
// Kryptografie (ausschließlich crypto.randomBytes/timingSafeEqual/
// createHash aus Node-Core). Dieses Modul kennt keine Geschäftslogik und
// importiert NIEMALS better-sqlite3.

const crypto = require("crypto");

const CSRF_HEADER_NAME = "x-kuz-csrf";
const CSRF_TOKEN_BYTES = 32;

const PROD_SESSION_COOKIE_NAME = "__Host-kuz_session";
const DEV_SESSION_COOKIE_NAME = "kuz_dev_session";
const PROD_CSRF_COOKIE_NAME = "__Host-kuz_csrf";
const DEV_CSRF_COOKIE_NAME = "kuz_dev_csrf";

function sessionCookieName(mode) {
  return mode === "prod" ? PROD_SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME;
}

function csrfCookieName(mode) {
  return mode === "prod" ? PROD_CSRF_COOKIE_NAME : DEV_CSRF_COOKIE_NAME;
}

// ---------------------------------------------------------------------------
// Cookie-Parsing/-Serialisierung. Keine externe Cookie-Bibliothek.
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader) {
  const result = {};
  if (typeof cookieHeader !== "string" || !cookieHeader) return result;
  cookieHeader.split(";").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) return;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name) return;
    try {
      result[name] = decodeURIComponent(value);
    } catch (_error) {
      result[name] = value;
    }
  });
  return result;
}

function readCookiesFromRequest(req) {
  return parseCookies(req && req.headers ? req.headers.cookie : "");
}

// serializeCookie: baut EIN Set-Cookie-Headerfragment. `secure` wird für den
// Produktiv-Cookienamen niemals durch Aufrufer deaktivierbar gemacht (siehe
// buildSessionSetCookie/buildCsrfSetCookie – dort ist secure fest verdrahtet
// an mode==="prod", kein Parameter, der versehentlich false gesetzt werden
// könnte).
function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || "/"}`);
  if (options.maxAgeSeconds !== undefined) {
    if (options.maxAgeSeconds <= 0) {
      segments.push("Max-Age=0");
      segments.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    } else {
      segments.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
    }
  }
  segments.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly) segments.push("HttpOnly");
  if (options.secure) segments.push("Secure");
  // Bewusst kein Domain-Attribut (Auftrag Abschnitt F).
  return segments.join("; ");
}

function buildSessionSetCookie(mode, token, maxAgeSeconds) {
  return serializeCookie(sessionCookieName(mode), token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: mode === "prod",
    maxAgeSeconds,
  });
}

function buildCsrfSetCookie(mode, token, maxAgeSeconds) {
  return serializeCookie(csrfCookieName(mode), token, {
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: mode === "prod",
    maxAgeSeconds,
  });
}

function buildClearedSessionSetCookie(mode) {
  return serializeCookie(sessionCookieName(mode), "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: mode === "prod",
    maxAgeSeconds: 0,
  });
}

function buildClearedCsrfSetCookie(mode) {
  return serializeCookie(csrfCookieName(mode), "", {
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: mode === "prod",
    maxAgeSeconds: 0,
  });
}

function readSessionTokenFromRequest(req, mode) {
  const cookies = readCookiesFromRequest(req);
  const value = cookies[sessionCookieName(mode)];
  return typeof value === "string" && value ? value : null;
}

function readCsrfCookieFromRequest(req, mode) {
  const cookies = readCookiesFromRequest(req);
  const value = cookies[csrfCookieName(mode)];
  return typeof value === "string" && value ? value : null;
}

// ---------------------------------------------------------------------------
// CSRF: Double-Submit-Cookie. Kein serverseitiger Speicher nötig – das
// Cookie selbst ist der Token; der Client muss denselben Wert zusätzlich im
// Header x-kuz-csrf senden. Ein Angreifer auf einer fremden Origin kann das
// Cookie (SameSite=Lax, HttpOnly=false, aber cross-origin nicht lesbar)
// weder lesen noch den Header korrekt setzen.
// ---------------------------------------------------------------------------

function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}

function timingSafeEqualStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Dennoch konstante Vergleichszeit gegen einen Dummy-Puffer gleicher
    // Länge wie bufA, um Längen-Timing nicht zusätzlich zu verstärken.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function validateCsrfDoubleSubmit(req, mode) {
  const cookieToken = readCsrfCookieFromRequest(req, mode);
  const headerToken = req && req.headers ? req.headers[CSRF_HEADER_NAME] : null;
  if (!cookieToken || typeof headerToken !== "string" || !headerToken) return false;
  return timingSafeEqualStrings(cookieToken, headerToken);
}

// ---------------------------------------------------------------------------
// Origin-/Host-Prüfung. Dev: Loopback-Host, Origin (falls vorhanden) muss
// ebenfalls Loopback sein (gleiches Muster wie server.js#isExecutionRequest
// OriginAllowed, damit bestehende lokale Abläufe kompatibel bleiben). Prod:
// Host und – falls vorhanden – Origin müssen exakt der konfigurierten
// KUZ_PUBLIC_ORIGIN entsprechen.
// ---------------------------------------------------------------------------

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function isLoopbackHostHeader(hostHeader) {
  if (typeof hostHeader !== "string" || !hostHeader) return false;
  // IPv6-Hosts werden im Host-Header per RFC 3986 in eckigen Klammern
  // notiert (z. B. "[::1]:3000") – ein naives split(":")[0] würde bei "::1"
  // fälschlich einen leeren String liefern und die IPv6-Loopback-Adresse
  // nie als Loopback erkennen.
  if (hostHeader.startsWith("[")) {
    const closeBracketIndex = hostHeader.indexOf("]");
    if (closeBracketIndex === -1) return false;
    return isLoopbackHostname(hostHeader.slice(1, closeBracketIndex));
  }
  const withoutPort = hostHeader.split(":")[0];
  return isLoopbackHostname(withoutPort);
}

function validateOriginForMode(req, mode, publicOrigin) {
  const hostHeader = req && req.headers ? req.headers.host : null;
  const origin = req && req.headers ? req.headers.origin : null;

  if (mode === "prod") {
    if (typeof publicOrigin !== "string" || !publicOrigin) return false;
    let originUrl;
    try {
      originUrl = new URL(publicOrigin);
    } catch (_error) {
      return false;
    }
    const hostMatchesPublicOrigin =
      typeof hostHeader === "string" && hostHeader.split(":")[0] === originUrl.hostname;
    if (!hostMatchesPublicOrigin) return false;
    if (typeof origin === "string" && origin) {
      return origin === publicOrigin;
    }
    return true;
  }

  // Entwicklungsmodus: Host muss Loopback sein; ein vorhandener Origin-Header
  // muss ebenfalls Loopback sein (Ports werden bewusst nicht erzwungen,
  // damit bestehende Tests ohne Origin-Header unverändert funktionieren).
  if (!isLoopbackHostHeader(hostHeader)) return false;
  if (typeof origin === "string" && origin) {
    try {
      const originUrl = new URL(origin);
      return isLoopbackHostname(originUrl.hostname);
    } catch (_error) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Client-IP: nur gehasht weitergereicht (an auth-session.js/auth-rate-
// limit.js), niemals im Klartext gespeichert oder geloggt.
// ---------------------------------------------------------------------------

function getRawClientIp(req) {
  const socket = req && req.socket;
  return (socket && socket.remoteAddress) || null;
}

function hashClientIp(req) {
  const raw = getRawClientIp(req);
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function getUserAgent(req) {
  const value = req && req.headers ? req.headers["user-agent"] : null;
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------------
// Sichere, geheimnisfreie Fehlerantworten (Auftrag Abschnitt K).
// ---------------------------------------------------------------------------

// script-src bleibt strikt 'self' (index.html lädt ausschließlich lokale
// <script src="...">-Dateien, keine Inline-Skripte). style-src erlaubt
// 'unsafe-inline', weil app.js/v71-ui.js Layoutwerte (z. B. Fortschrittsbalken-
// Breiten) bewusst über dynamisch erzeugte style="..."-Attribute im
// bestehenden innerHTML-Rendering setzen – ein Verbot würde den
// bestehenden, unveränderten Chef-Modus optisch brechen.
const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
});

const GENERIC_MESSAGES = Object.freeze({
  UNAUTHENTICATED: "Bitte neu anmelden.",
  REJECTED: "Anfrage wurde nicht akzeptiert.",
  NOT_FOUND: "Nicht gefunden.",
  RATE_LIMITED: "Zu viele Versuche. Bitte später erneut versuchen.",
  INTERNAL: "Interner Serverfehler.",
});

module.exports = {
  CSRF_HEADER_NAME,
  PROD_SESSION_COOKIE_NAME,
  DEV_SESSION_COOKIE_NAME,
  PROD_CSRF_COOKIE_NAME,
  DEV_CSRF_COOKIE_NAME,
  SECURITY_HEADERS,
  GENERIC_MESSAGES,
  sessionCookieName,
  csrfCookieName,
  parseCookies,
  readCookiesFromRequest,
  serializeCookie,
  buildSessionSetCookie,
  buildCsrfSetCookie,
  buildClearedSessionSetCookie,
  buildClearedCsrfSetCookie,
  readSessionTokenFromRequest,
  readCsrfCookieFromRequest,
  generateCsrfToken,
  timingSafeEqualStrings,
  validateCsrfDoubleSubmit,
  isLoopbackHostname,
  isLoopbackHostHeader,
  validateOriginForMode,
  getRawClientIp,
  hashClientIp,
  getUserAgent,
};
