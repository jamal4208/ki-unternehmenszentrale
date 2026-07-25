"use strict";

const assert = require("assert");

const heygenJobPackage = require("./heygen-job-package");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function validAvatarVideoInput(overrides = {}) {
  return {
    projectId: "ki-unternehmenszentrale",
    videoType: "AVATAR_VIDEO",
    title: "Café-Testvideo",
    script: "Willkommen in unserem Café. Heute gibt es einen neuen Kaffee.",
    aspectRatio: "9:16",
    durationTargetSeconds: 20,
    avatarReference: { avatarId: "public-demo-avatar-1", visibility: "PUBLIC" },
    dataClassification: "NORMAL",
    ...overrides,
  };
}

// 6. gültiger neutraler Avatarvideo-Auftrag
check("gültiger neutraler Avatarvideo-Auftrag wird als DRAFT erzeugt und besteht die Inhaltsprüfung", () => {
  const { ok, package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  assert.strictEqual(ok, true);
  assert.strictEqual(pkg.status, "DRAFT");
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, true);
  assert.strictEqual(validated.package.status, "READY_FOR_REVIEW");
});

// 7. fehlender Scripttext blockiert
check("fehlender Scripttext blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ script: "" }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Scripttext/.test(r)));
});

// 8. zu lange Laufzeit blockiert
check("zu lange Laufzeit blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ durationTargetSeconds: 90 }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Laufzeit/.test(r)));
});

// 9. ungültiges Seitenverhältnis blockiert
check("ungültiges Seitenverhältnis blockiert", () => {
  assert.throws(() => heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ aspectRatio: "4:3" })));
});

// 10. private Avatarreferenz ohne Zustimmung blockiert
check("private Avatarreferenz ohne Zustimmung blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ avatarReference: { avatarId: "private-1", visibility: "PRIVATE" } }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Privater Avatar/.test(r)));

  const { package: pkgConsented } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({
      avatarReference: { avatarId: "private-1", visibility: "PRIVATE" },
      avatarConsentConfirmed: true,
    }),
  );
  const validatedConsented = heygenJobPackage.validateHeygenJobPackageContent(pkgConsented);
  assert.strictEqual(validatedConsented.ok, true);
});

// 11. Voice Clone blockiert
check("Voice Clone blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ voiceReference: { voiceId: "v1", isClone: true }, voiceConsentConfirmed: true }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Voice Clone/.test(r)));
});

// 12. Gesundheitsdaten blockiert
check("Gesundheitsdaten blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ containsHealthData: true }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Gesundheitsdaten/.test(r)));
});

// 13. Kundendaten blockiert
check("Kundendaten blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ containsCustomerData: true }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kundendaten/.test(r)));
});

// 14. Kinder-/Minderjährigendaten blockiert
check("Kinder-/Minderjährigendaten blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ containsChildren: true }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kindern/.test(r)));
});

// 15. SECRET (und SENSITIVE) blockiert
check("SECRET blockiert", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ dataClassification: "SECRET" }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Datenklassifizierung/.test(r)));
});

check("SENSITIVE ist im ersten Pilot ebenfalls blockiert (nur NORMAL erlaubt)", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ dataClassification: "SENSITIVE" }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
});

// 16. externe Übertragung false blockiert (Handoff-Bereitschaft, nicht Inhalt)
check("externe Übertragung false blockiert die Handoff-Bereitschaft", () => {
  const { package: draft } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  const { package: validated } = heygenJobPackage.validateHeygenJobPackageContent(draft);
  const approved = heygenJobPackage.approveContent(validated);
  const costApproved = heygenJobPackage.setCostApproval(approved, "WITHIN_APPROVED_LIMIT");
  const readiness = heygenJobPackage.evaluateHandoffReadiness(costApproved);
  assert.strictEqual(readiness.ready, false);
  assert.ok(readiness.missing.includes("Externe Übertragung bestätigen"));
});

// 17. Kostenfreigabe fehlt blockiert
check("fehlende Kostenfreigabe blockiert die Handoff-Bereitschaft", () => {
  const { package: draft } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  const { package: validated } = heygenJobPackage.validateHeygenJobPackageContent(draft);
  const approved = heygenJobPackage.approveContent(validated);
  const withTransfer = heygenJobPackage.approveExternalTransfer(approved);
  const readiness = heygenJobPackage.evaluateHandoffReadiness(withTransfer);
  assert.strictEqual(readiness.ready, false);
  assert.ok(readiness.missing.includes("Kostenrahmen bestätigen"));
});

// 18. Veröffentlichung bleibt false
check("Veröffentlichung bleibt immer false und kann nicht freigegeben werden", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ publicationApproved: true }));
  assert.strictEqual(pkg.publicationApproved, false);
  assert.strictEqual(typeof heygenJobPackage.approvePublication, "undefined");
});

// 19. Fingerprintbindung
check("Fingerprintbindung: gleicher Inhalt liefert denselben Fingerprint", () => {
  const { package: pkgA } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  const { package: pkgB } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  const fpA = heygenJobPackage.computePackageFingerprint(pkgA);
  const fpB = heygenJobPackage.computePackageFingerprint(pkgB);
  assert.strictEqual(fpA, fpB);
  assert.strictEqual(pkgA.packageFingerprint, fpA);
});

// 20. Änderung invalidiert Freigabe
check("Änderung an Script invalidiert den Fingerprint (frühere Freigabe wird ungültig)", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  const originalFingerprint = pkg.packageFingerprint;
  const changed = { ...pkg, script: "Ein komplett anderer Text." };
  const newFingerprint = heygenJobPackage.computePackageFingerprint(changed);
  assert.notStrictEqual(newFingerprint, originalFingerprint);
  const readiness = heygenJobPackage.evaluateHandoffReadiness({ ...changed, packageFingerprint: originalFingerprint });
  assert.ok(readiness.missing.some((m) => /Fingerprint/.test(m)));
});

// 21. Ablaufzeit
check("abgelaufenes Paket wird als expired erkannt", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
  );
  assert.strictEqual(heygenJobPackage.isPackageExpired(pkg), true);
  const readiness = heygenJobPackage.evaluateHandoffReadiness(pkg);
  assert.ok(readiness.missing.some((m) => /abgelaufen/.test(m)));
});

check("Paket ohne Ablaufzeit-Überschreitung gilt nicht als expired", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput());
  assert.strictEqual(heygenJobPackage.isPackageExpired(pkg), false);
});

// 22. unbekanntes Projekt
check("unbekanntes Projekt wird abgewiesen", () => {
  assert.throws(() => heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ projectId: "nicht-vorhanden" })));
});

// 23. ungültiger Agent
check("ungültige Agenten-ID wird abgewiesen", () => {
  assert.throws(() => heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ requestingAgentId: "nicht-vorhanden" })));
});

// 24. absolute Pfade blockiert
check("absolute Pfade im Skript blockieren das Paket", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ script: "Siehe /Users/jamal/Documents/geheim.txt für Details." }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /pfade/i.test(r)));
});

check("absolute Pfade in sourceAssetReferences blockieren das Paket", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ sourceAssetReferences: ["/etc/passwd"] }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
});

// 25. Credentials blockiert
check("Credential-ähnlicher Text im Skript blockiert das Paket", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ script: "Unser Zugang ist sk-1234567890abcdefgh, bitte nutzen." }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Zugangsdaten/.test(r)));
});

check("persönliche Kontaktdaten (E-Mail) im Skript blockieren das Paket", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ script: "Schreib uns an kontakt@example.com für mehr Infos." }),
  );
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /Kontaktdatum/.test(r)));
});

// Zusätzliche strukturelle Prüfungen
check("nur AVATAR_VIDEO ist für den ersten Pilot vorgesehen", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ videoType: "LIPSYNC" }));
  const validated = heygenJobPackage.validateHeygenJobPackageContent(pkg);
  assert.strictEqual(validated.ok, false);
  assert.ok(validated.blockReasons.some((r) => /nicht vorgesehen/.test(r)));
});

check("allowedHeyGenActions und forbiddenActions sind serverautoritativ (Client-Eingabe wird ignoriert)", () => {
  const { package: pkg } = heygenJobPackage.prepareHeygenJobPackage(
    validAvatarVideoInput({ allowedHeyGenActions: ["DELETE_VIDEO"], forbiddenActions: [] }),
  );
  assert.ok(!pkg.allowedHeyGenActions.includes("DELETE_VIDEO"));
  assert.ok(pkg.forbiddenActions.includes("DELETE_VIDEO"));
});

check("HEYGEN_ALWAYS_FORBIDDEN_ACTIONS enthält keine erlaubte Aktion aus dem Pilot-Set", () => {
  const allowed = new Set();
  ["AVATAR_VIDEO", "IMAGE_ANIMATION", "VIDEO_TRANSLATION", "LIPSYNC"].forEach((type) => {
    heygenJobPackage.prepareHeygenJobPackage(validAvatarVideoInput({ videoType: type })).package.allowedHeyGenActions.forEach((a) =>
      allowed.add(a),
    );
  });
  heygenJobPackage.HEYGEN_ALWAYS_FORBIDDEN_ACTIONS.forEach((forbidden) => {
    assert.ok(!allowed.has(forbidden), `${forbidden} darf nie erlaubt sein`);
  });
});

check("keine Credential-Werte im Modul selbst", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("heygen-job-package.test.js", "heygen-job-package.js"), "utf8");
  assert.ok(!/apiKey\s*:\s*["']/i.test(source));
  assert.ok(!/heygenApiKey/i.test(source));
});

check("Auftragspaket enthält keine Netzwerklogik (kein http/https/fetch-Import)", () => {
  const fs = require("fs");
  const source = fs.readFileSync(__filename.replace("heygen-job-package.test.js", "heygen-job-package.js"), "utf8");
  assert.ok(!/require\(["']https?["']\)/.test(source));
  assert.ok(!/\bfetch\(/.test(source));
});

console.log(`heygen-job-package.test.js: ${passed} Prüfpunkte erfolgreich`);
