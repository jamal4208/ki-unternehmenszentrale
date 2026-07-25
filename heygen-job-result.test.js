"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const heygenJobResult = require("./heygen-job-result");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function baseResult(overrides = {}) {
  return {
    jobPackageId: "heygen-job-abc",
    providerJobId: "hg-provider-123",
    status: "SUCCEEDED",
    videoReference: "https://files.heygen.example/output/video.mp4",
    source: "MANUAL_PASTE",
    ...overrides,
  };
}

// 41. gültige Ergebnisrückgabe
check("gültige Ergebnisrückgabe wird akzeptiert und lokal verifiziert", () => {
  const { ok, result } = heygenJobResult.validateHeygenJobResult(baseResult());
  assert.strictEqual(ok, true);
  assert.strictEqual(result.locallyVerifiedSuccess, true);
  assert.strictEqual(result.jamalAcceptanceStatus, "PENDING");
  assert.strictEqual(result.publicationApproved, false);
  assert.ok(result.verifiedAt);
});

// 42. providerJobId allein kein Erfolg
check("providerJobId allein ist kein Erfolg (SUCCEEDED ohne videoReference blockiert)", () => {
  const { ok, reasons } = heygenJobResult.validateHeygenJobResult(baseResult({ videoReference: null }));
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /providerJobId allein/.test(r)));
});

// 43. ungültige URL blockiert
check("ungültige/nicht-parsebare URL blockiert", () => {
  const { ok, reasons } = heygenJobResult.validateHeygenJobResult(baseResult({ videoReference: "nicht-eine-url" }));
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /videoReference/.test(r)));
});

// 44. localhost-URL blockiert
check("localhost-URL blockiert", () => {
  const check1 = heygenJobResult.validateResultReferenceUrl("https://localhost/video.mp4", "videoReference");
  const check2 = heygenJobResult.validateResultReferenceUrl("https://127.0.0.1/video.mp4", "videoReference");
  assert.strictEqual(check1.ok, false);
  assert.strictEqual(check2.ok, false);
});

// 45. private-IP-URL blockiert
check("private-IP-URL blockiert", () => {
  ["https://10.0.0.5/x", "https://192.168.1.5/x", "https://172.16.0.5/x", "https://169.254.1.1/x"].forEach((url) => {
    const result = heygenJobResult.validateResultReferenceUrl(url, "videoReference");
    assert.strictEqual(result.ok, false, `${url} sollte blockiert werden`);
  });
});

// 46. URL mit Credentials blockiert
check("URL mit eingebetteten Zugangsdaten blockiert", () => {
  const userinfo = heygenJobResult.validateResultReferenceUrl("https://user:secret@example.com/x", "videoReference");
  const queryToken = heygenJobResult.validateResultReferenceUrl("https://example.com/x?token=abc123", "videoReference");
  assert.strictEqual(userinfo.ok, false);
  assert.strictEqual(queryToken.ok, false);
});

check("http (nicht https) wird abgewiesen", () => {
  const result = heygenJobResult.validateResultReferenceUrl("http://example.com/video.mp4", "videoReference");
  assert.strictEqual(result.ok, false);
});

check("file:// und lokale Pfade werden abgewiesen", () => {
  assert.strictEqual(heygenJobResult.validateResultReferenceUrl("file:///etc/passwd", "videoReference").ok, false);
  assert.strictEqual(heygenJobResult.validateResultReferenceUrl("/etc/passwd", "videoReference").ok, false);
});

// 47. fehlendes Video blockiert SUCCEEDED
check("fehlendes Video blockiert SUCCEEDED", () => {
  const { ok } = heygenJobResult.validateHeygenJobResult(baseResult({ status: "SUCCEEDED", videoReference: null }));
  assert.strictEqual(ok, false);
});

// 48. Failure strukturiert
check("FAILED erfordert strukturierten failureCode/failureMessage ohne Stacktrace", () => {
  const missing = heygenJobResult.validateHeygenJobResult({
    jobPackageId: "a",
    providerJobId: "p",
    status: "FAILED",
  });
  assert.strictEqual(missing.ok, false);
  assert.ok(missing.reasons.some((r) => /failureCode/.test(r)));

  const withStack = heygenJobResult.validateHeygenJobResult({
    jobPackageId: "a",
    providerJobId: "p",
    status: "FAILED",
    failureCode: "RENDER_ERROR",
    failureMessage: "Error at Object.<anonymous> (/app/index.js:12:5)",
  });
  assert.strictEqual(withStack.ok, false);

  const clean = heygenJobResult.validateHeygenJobResult({
    jobPackageId: "a",
    providerJobId: "p",
    status: "FAILED",
    failureCode: "RENDER_ERROR",
    failureMessage: "Der Rendervorgang wurde vom Anbieter mit einem Fehler beendet.",
  });
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(clean.result.failureCode, "RENDER_ERROR");
});

// 49. keine Veröffentlichung
check("keine Veröffentlichung: publicationApproved bleibt immer false", () => {
  const { result } = heygenJobResult.validateHeygenJobResult(baseResult({ publicationApproved: true }));
  assert.strictEqual(result.publicationApproved, false);
});

// 50. keine automatische Dateiablage
check("keine automatische Dateiablage: Modul verwendet weder fs.writeFile noch http/https/fetch", () => {
  const source = fs.readFileSync(path.join(__dirname, "heygen-job-result.js"), "utf8");
  assert.ok(!/require\(["']fs["']\)/.test(source));
  assert.ok(!/writeFile|createWriteStream/.test(source));
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

// Zusätzliche strukturelle Prüfungen
check("ungültiger status wird abgewiesen", () => {
  const { ok, reasons } = heygenJobResult.validateHeygenJobResult(baseResult({ status: "DONE" }));
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /status/.test(r)));
});

check("Fingerprint ist deterministisch für gleichen Inhalt", () => {
  const fp1 = heygenJobResult.computeResultFingerprint(baseResult());
  const fp2 = heygenJobResult.computeResultFingerprint(baseResult());
  assert.strictEqual(fp1, fp2);
});

check("Fingerprint ändert sich bei geänderter videoReference", () => {
  const fp1 = heygenJobResult.computeResultFingerprint(baseResult());
  const fp2 = heygenJobResult.computeResultFingerprint(baseResult({ videoReference: "https://files.heygen.example/output/other.mp4" }));
  assert.notStrictEqual(fp1, fp2);
});

check("Providerstatus, lokale Verifikation, Jamal-Abnahme und Veröffentlichung sind getrennte Felder", () => {
  const { result } = heygenJobResult.validateHeygenJobResult(baseResult());
  const keys = ["providerClaimedStatus", "locallyVerifiedSuccess", "jamalAcceptanceStatus", "publicationApproved"];
  keys.forEach((key) => assert.ok(Object.prototype.hasOwnProperty.call(result, key), `${key} fehlt`));
});

console.log(`heygen-job-result.test.js: ${passed} Prüfpunkte erfolgreich`);
