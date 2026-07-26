"use strict";

// V7.2 Phase B – Schutz- und Einwilligungsgrundlage (Auftrag Abschnitt G) –
// Dokumentationskonsistenztest. Rein dateibasiert (kein Server, keine DB):
// prüft, dass die drei neuen Policy-Dokumente existieren und dass alle
// sechs kanonischen Dokumente dieselben verbindlichen Grundsätze konsistent
// wiedergeben, ohne fertige AGB oder eine abgeschlossene Rechtsprüfung
// vorzutäuschen.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function readDoc(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), "utf8");
}

const BUSINESS_USE_POLICY = readDoc("BUSINESS_USE_POLICY.md");
const AVATAR_CONSENT_POLICY = readDoc("AVATAR_CONSENT_POLICY.md");
const SAFETY_ENFORCEMENT_MODEL = readDoc("SAFETY_ENFORCEMENT_MODEL.md");

const CANONICAL_DOC_NAMES = [
  "PROJECT_MASTER.md",
  "CURRENT_STATUS.md",
  "MIGRATION_PLAN.md",
  "README.md",
  "V1_BETRIEBSHANDBUCH.md",
  "API_REGISTER.md",
];
const CANONICAL_DOCS = Object.fromEntries(CANONICAL_DOC_NAMES.map((name) => [name, readDoc(name)]));

// Rot-Flagge: eine fertige, gerichtsfeste Rechtswirksamkeit oder
// abgeschlossene AGB dürfen an keiner Stelle behauptet werden.
const FALSE_LEGAL_FINALITY_PATTERNS = [/AGB\s+(sind|ist)\s+(fertig|abgeschlossen|final)/i, /rechtlich\s+vollständig\s+geprüft/i, /juristisch\s+abschließend\s+geprüft/i];

function assertNoFalseLegalFinality(label, text) {
  for (const pattern of FALSE_LEGAL_FINALITY_PATTERNS) {
    assert.ok(!pattern.test(text), `${label} behauptet fälschlich eine abgeschlossene Rechtsprüfung/AGB (Muster: ${pattern})`);
  }
}

check("BUSINESS_USE_POLICY.md existiert und dokumentiert den verbindlichen Zweck", () => {
  assert.ok(/legitime\s+geschäftliche\s+Zwecke/i.test(BUSINESS_USE_POLICY));
  assert.ok(/verboten/i.test(BUSINESS_USE_POLICY));
});

check("BUSINESS_USE_POLICY.md hält Jamals Betreiberrolle (kein fachlicher Prüfer) fest", () => {
  assert.ok(/Betreiber/i.test(BUSINESS_USE_POLICY));
  assert.ok(/kein[a-zäöüß]*\s+(regulär[a-zäöüß]*\s+)?fachlich[a-zäöüß]*\s+(Pflicht-?)?Prüfer/i.test(BUSINESS_USE_POLICY));
});

check("BUSINESS_USE_POLICY.md dokumentiert die Sanktionsstufen (Verwarnung bis Lizenzentzug)", () => {
  assert.ok(/Verwarnung/i.test(BUSINESS_USE_POLICY));
  assert.ok(/Benutzersperre/i.test(BUSINESS_USE_POLICY));
  assert.ok(/Mandantensperre/i.test(BUSINESS_USE_POLICY));
  assert.ok(/Lizenzentzug/i.test(BUSINESS_USE_POLICY));
});

check("BUSINESS_USE_POLICY.md täuscht keine fertigen AGB oder abgeschlossene Rechtsprüfung vor", () => {
  assert.ok(/kein[a-zäöüß]*[*\s]+AGB/i.test(BUSINESS_USE_POLICY));
  assert.ok(/juristische\s+Prüfung/i.test(BUSINESS_USE_POLICY));
  assertNoFalseLegalFinality("BUSINESS_USE_POLICY.md", BUSINESS_USE_POLICY);
});

check("SAFETY_ENFORCEMENT_MODEL.md existiert und beschreibt ALLOW/BLOCK/ESCALATE sowie policy_violations", () => {
  assert.ok(/ALLOW/.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/BLOCK/.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/ESCALATE/.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/policy_violations/.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/CRITICAL/.test(SAFETY_ENFORCEMENT_MODEL));
});

check("SAFETY_ENFORCEMENT_MODEL.md stellt keinen einfachen Keywordfilter als endgültige Lösung dar (Grenzen dokumentiert)", () => {
  assert.ok(/Grenzen/i.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/regelbasiert/i.test(SAFETY_ENFORCEMENT_MODEL));
  assert.ok(/kein(e)?\s+(Modell|Kontextverständnis)/i.test(SAFETY_ENFORCEMENT_MODEL));
});

check("AVATAR_CONSENT_POLICY.md existiert und enthält den verbindlichen Grundsatz", () => {
  assert.ok(/Kein\s+realistische[nr]?\s+Avatar/i.test(AVATAR_CONSENT_POLICY));
  assert.ok(/widerrufbare[nr]?[\s>]+Zustimmung/i.test(AVATAR_CONSENT_POLICY));
});

check("AVATAR_CONSENT_POLICY.md hält fest, dass avatarConsentConfirmed nicht ausreicht", () => {
  assert.ok(/avatarConsentConfirmed/.test(AVATAR_CONSENT_POLICY));
  assert.ok(/nicht\s+ausreichend|unzureichend/i.test(AVATAR_CONSENT_POLICY));
});

check("AVATAR_CONSENT_POLICY.md dokumentiert Connys Testfall mit Ende-August-2026-Ziel", () => {
  assert.ok(/Conny/.test(AVATAR_CONSENT_POLICY));
  assert.ok(/August\s+2026/.test(AVATAR_CONSENT_POLICY));
  assert.ok(/kein(en)?\s+echte[nr]?\s+Consent-Datensatz/i.test(AVATAR_CONSENT_POLICY));
});

check("AVATAR_CONSENT_POLICY.md dokumentiert die Artikel-50-Prüfung als offenen Folgeschritt", () => {
  assert.ok(/Artikel-?50/i.test(AVATAR_CONSENT_POLICY));
  assert.ok(/vor\s+(jeder\s+)?Veröffentlichung/i.test(AVATAR_CONSENT_POLICY));
});

check("AVATAR_CONSENT_POLICY.md täuscht keine fertige Rechtsprüfung vor", () => {
  assertNoFalseLegalFinality("AVATAR_CONSENT_POLICY.md", AVATAR_CONSENT_POLICY);
  assert.ok(/Folgebaustein/i.test(AVATAR_CONSENT_POLICY));
});

for (const name of CANONICAL_DOC_NAMES) {
  check(`${name} verweist auf BUSINESS_USE_POLICY.md`, () => {
    assert.ok(/BUSINESS_USE_POLICY\.md/.test(CANONICAL_DOCS[name]), `${name} referenziert BUSINESS_USE_POLICY.md nicht`);
  });
  check(`${name} verweist auf AVATAR_CONSENT_POLICY.md`, () => {
    assert.ok(/AVATAR_CONSENT_POLICY\.md/.test(CANONICAL_DOCS[name]), `${name} referenziert AVATAR_CONSENT_POLICY.md nicht`);
  });
  check(`${name} täuscht keine abgeschlossene Rechtsprüfung/AGB vor`, () => {
    assertNoFalseLegalFinality(name, CANONICAL_DOCS[name]);
  });
}

console.log(`policy-documentation.test.js: ${passed} Prüfpunkte erfolgreich`);
