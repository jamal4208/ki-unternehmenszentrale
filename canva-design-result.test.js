"use strict";

const assert = require("assert");

const canvaDesignResult = require("./canva-design-result");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function validCandidatesInput(overrides = {}) {
  return {
    jobPackageId: "canva-job-test-1",
    providerJobId: "canva-provider-job-1",
    providerOperation: "GENERATE_DESIGN_CANDIDATES",
    providerStatus: "CANDIDATES_READY",
    candidateIds: ["cand-1", "cand-2", "cand-3"],
    designType: "INSTAGRAM_POST",
    source: "MANUAL_PASTE",
    ...overrides,
  };
}

function validDesignCreatedInput(overrides = {}) {
  return {
    jobPackageId: "canva-job-test-1",
    providerJobId: "canva-provider-job-2",
    providerOperation: "CREATE_SELECTED_CANDIDATE",
    providerStatus: "DESIGN_CREATED",
    candidateIds: ["cand-1", "cand-2", "cand-3"],
    selectedCandidateId: "cand-2",
    designId: "design-999",
    previewReference: "https://static.canva.example/preview.png",
    designType: "INSTAGRAM_POST",
    source: "MANUAL_PASTE",
    ...overrides,
  };
}

check("gültiges CANDIDATES_READY-Ergebnis validiert", () => {
  const { ok, result } = canvaDesignResult.validateCanvaDesignJobResult(validCandidatesInput());
  assert.strictEqual(ok, true);
  assert.strictEqual(result.localValidationStatus, "STRUCTURALLY_VALID");
  assert.strictEqual(result.locallyVerifiedSuccess, true);
});

// 51. Provider-Job-ID allein kein Erfolg.
check("CANDIDATES_READY ohne candidateIds ist kein Erfolg (Provider-Job-ID allein reicht nicht)", () => {
  const { ok, result } = canvaDesignResult.validateCanvaDesignJobResult(validCandidatesInput({ candidateIds: [] }));
  assert.strictEqual(ok, false);
  assert.strictEqual(result.locallyVerifiedSuccess, false);
  assert.ok(result.resultFingerprint);
});

// 52. Kandidatenliste erforderlich.
check("fehlende candidateIds blockieren CANDIDATES_READY", () => {
  const input = validCandidatesInput();
  delete input.candidateIds;
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(input);
  assert.strictEqual(ok, false);
});

// 53. Candidate-ID ist keine Design-ID.
check("designId identisch mit einer candidateId blockiert (Candidate-ID ist keine Design-ID)", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ designId: "cand-2" }),
  );
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /Candidate-ID ist keine Design-ID/.test(r)));
});

check("gültiges DESIGN_CREATED-Ergebnis mit unterschiedlicher Design-ID validiert", () => {
  const { ok, result } = canvaDesignResult.validateCanvaDesignJobResult(validDesignCreatedInput());
  assert.strictEqual(ok, true);
  assert.strictEqual(result.designId, "design-999");
  assert.strictEqual(result.locallyVerifiedSuccess, true);
});

check("DESIGN_CREATED ohne designId ist kein Erfolg", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(validDesignCreatedInput({ designId: null }));
  assert.strictEqual(ok, false);
});

check("unbekannte providerOperation blockiert", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult(
    validCandidatesInput({ providerOperation: "PUBLISH_DESIGN" }),
  );
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /ungültig/.test(r)));
});

check("Brand-Template-Aktion ist im ersten Pilot nicht vorgesehen", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult(
    validCandidatesInput({ providerOperation: "SEARCH_BRAND_TEMPLATES", providerStatus: "PROCESSING" }),
  );
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /nicht vorgesehen/.test(r)));
});

check("ungültiger providerStatus blockiert", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(validCandidatesInput({ providerStatus: "DONE" }));
  assert.strictEqual(ok, false);
});

// Referenz-URL-Sicherheit (analog HeyGen).
check("http-Referenz (statt https) wird abgelehnt", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ previewReference: "http://example.com/preview.png" }),
  );
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /https/.test(r)));
});

check("localhost-Referenz wird abgelehnt", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ previewReference: "https://localhost/preview.png" }),
  );
  assert.strictEqual(ok, false);
});

check("Credentials in der Referenz-URL werden abgelehnt", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ previewReference: "https://user:pass@static.canva.example/preview.png" }),
  );
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /Zugangsdaten/.test(r)));
});

check("Token im Query-String der Referenz-URL wird abgelehnt", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ previewReference: "https://static.canva.example/preview.png?token=abcdef123456" }),
  );
  assert.strictEqual(ok, false);
});

check("lokaler Dateipfad als Referenz wird abgelehnt", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ previewReference: "/Users/jamal/Desktop/design.png" }),
  );
  assert.strictEqual(ok, false);
});

check("EDIT_PREVIEW_READY erfordert designId, editingTransactionId und previewReference", () => {
  const { ok: okMissing } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ providerStatus: "EDIT_PREVIEW_READY", editingTransactionId: null }),
  );
  assert.strictEqual(okMissing, false);

  const { ok: okComplete, result } = canvaDesignResult.validateCanvaDesignJobResult(
    validDesignCreatedInput({ providerStatus: "EDIT_PREVIEW_READY", editingTransactionId: "edit-1" }),
  );
  assert.strictEqual(okComplete, true);
  assert.strictEqual(result.locallyVerifiedSuccess, true);
});

check("FAILED erfordert failureCode und failureMessage", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(
    validCandidatesInput({ providerStatus: "FAILED", candidateIds: [] }),
  );
  assert.strictEqual(ok, false);
});

check("FAILED mit vollständigen Angaben validiert strukturell", () => {
  const { ok, result } = canvaDesignResult.validateCanvaDesignJobResult(
    validCandidatesInput({
      providerStatus: "FAILED",
      candidateIds: [],
      failureCode: "PROVIDER_TIMEOUT",
      failureMessage: "Der Connector hat innerhalb der Frist keine Antwort erhalten.",
    }),
  );
  assert.strictEqual(ok, true);
  assert.strictEqual(result.failureCode, "PROVIDER_TIMEOUT");
});

check("Stacktrace-artige failureMessage wird abgelehnt", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(
    validCandidatesInput({
      providerStatus: "FAILED",
      candidateIds: [],
      failureCode: "ERR",
      failureMessage: "TypeError at Object.<anonymous> (/app/canva-connector.js:12:5)",
    }),
  );
  assert.strictEqual(ok, false);
});

check("ungültiger costStatus blockiert", () => {
  const { ok } = canvaDesignResult.validateCanvaDesignJobResult(validCandidatesInput({ costStatus: "ERFUNDEN" }));
  assert.strictEqual(ok, false);
});

check("Jamal-Abnahme startet immer bei PENDING und wird nie automatisch gesetzt", () => {
  const { result } = canvaDesignResult.validateCanvaDesignJobResult(validCandidatesInput());
  assert.strictEqual(result.jamalAcceptanceStatus, "PENDING");
});

// 70. gespeichertes Design keine Veröffentlichung.
check("publicationApproved bleibt immer false, unabhängig vom Providererfolg", () => {
  const { result } = canvaDesignResult.validateCanvaDesignJobResult(validDesignCreatedInput({ publicationApproved: true }));
  assert.strictEqual(result.publicationApproved, false);
});

check("Fingerprint ist deterministisch über inhaltsbestimmende Felder", () => {
  const inputA = validDesignCreatedInput();
  const inputB = validDesignCreatedInput();
  assert.strictEqual(canvaDesignResult.computeResultFingerprint(inputA), canvaDesignResult.computeResultFingerprint(inputB));
});

check("fehlende jobPackageId/providerJobId blockieren", () => {
  const { ok, reasons } = canvaDesignResult.validateCanvaDesignJobResult({});
  assert.strictEqual(ok, false);
  assert.ok(reasons.some((r) => /jobPackageId/.test(r)));
  assert.ok(reasons.some((r) => /providerJobId/.test(r)));
});

check("keine Netzwerklogik im Modul (kein http/https/fetch-Import)", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("canva-design-result.test.js", "canva-design-result.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

console.log(`canva-design-result.test.js: ${passed} Prüfpunkte erfolgreich`);
