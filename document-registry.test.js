"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const documentRegistry = require("./document-registry");
const localDataBackup = require("./local-data-backup");

let passed = 0;
function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function makeIsolatedPaths() {
  const appSupportDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-registry-test-"));
  return documentRegistry.resolveDocumentPaths({ appSupportDir });
}

async function runTests() {
  const paths = makeIsolatedPaths();
  documentRegistry.ensureDocumentDirs(paths);
  documentRegistry.ensureDocumentTestFixtureFiles(paths);

  // 1. gültige Dokumentregistrierung
  const registered = documentRegistry.registerDocument(
    {
      projectId: "ki-unternehmenszentrale",
      title: "Beispielnotiz",
      sourceType: "MANUAL_NOTE",
      note: "Ein kurzer Wissenseintrag.",
      classification: "NORMAL",
    },
    { paths },
  );
  check("gültige Dokumentregistrierung", () => {
    assert.strictEqual(registered.ok, true);
    assert.ok(registered.document.documentId);
    assert.strictEqual(registered.document.processingStatus, "REGISTERED");
  });

  // 2. unbekanntes Projekt blockiert
  check("unbekanntes Projekt blockiert", () => {
    assert.throws(() =>
      documentRegistry.registerDocument(
        { projectId: "nicht-vorhanden", title: "x", sourceType: "MANUAL_NOTE", note: "x" },
        { paths },
      ),
    );
  });

  // 3. normal/sensibel/secret Klassifizierung
  check("normal/sensibel/secret Klassifizierung", () => {
    ["NORMAL", "SENSITIVE", "SECRET"].forEach((classification, index) => {
      const result = documentRegistry.registerDocument(
        {
          projectId: "ki-unternehmenszentrale",
          title: `Klassifizierung ${index}`,
          sourceType: "MANUAL_NOTE",
          note: "Text",
          classification,
        },
        { paths },
      );
      assert.strictEqual(result.document.classification, classification);
    });
    assert.throws(() =>
      documentRegistry.registerDocument(
        {
          projectId: "ki-unternehmenszentrale",
          title: "ungültig",
          sourceType: "MANUAL_NOTE",
          note: "Text",
          classification: "GEHEIM",
        },
        { paths },
      ),
    );
  });

  // 4. Traversal blockiert (Test-Upload sourceFilename)
  check("Traversal blockiert", () => {
    assert.throws(() =>
      documentRegistry.registerTestUpload(
        { projectId: "ki-unternehmenszentrale", sourceFilename: "../../etc/passwd", classification: "NORMAL" },
        { paths },
      ),
    );
  });

  // 5. absolute Pfade blockiert
  check("absolute Pfade blockiert", () => {
    assert.throws(() =>
      documentRegistry.registerTestUpload(
        { projectId: "ki-unternehmenszentrale", sourceFilename: "/etc/passwd", classification: "NORMAL" },
        { paths },
      ),
    );
    assert.throws(() =>
      documentRegistry.registerDocument(
        {
          projectId: "ki-unternehmenszentrale",
          title: "Absoluter Pfad",
          sourceType: "LOCAL_REFERENCE",
          sourceReference: "/Users/jamal/Documents/geheim.pdf",
        },
        { paths },
      ),
    );
  });

  // 6. Symlink blockiert
  check("Symlink blockiert", () => {
    const linkName = "linked-note.txt";
    const linkPath = path.join(paths.testInboxDir, linkName);
    const targetPath = path.join(paths.testInboxDir, "sample-note.txt");
    try {
      fs.unlinkSync(linkPath);
    } catch (_error) {
      /* ignore */
    }
    fs.symlinkSync(targetPath, linkPath);
    const result = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: linkName, classification: "NORMAL" },
      { paths },
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.rejected, true);
    assert.match(result.reason, /Symlink/);
  });

  // 7. ausführbare Datei blockiert
  check("ausführbare Datei blockiert", () => {
    const execName = "tool.sh";
    fs.writeFileSync(path.join(paths.testInboxDir, execName), "#!/bin/sh\necho hi\n");
    const result = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: execName, classification: "NORMAL" },
      { paths },
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.document.processingStatus, "REJECTED");
  });

  // 8. Secret-Datei blockiert oder quarantänisiert
  check("Secret-Datei blockiert oder quarantänisiert", () => {
    const secretName = "credentials.txt";
    fs.writeFileSync(path.join(paths.testInboxDir, secretName), "AIRTABLE_API_KEY=abc\n");
    const result = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: secretName, classification: "NORMAL" },
      { paths },
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.document.quarantined, true);
  });

  // 9. Größenlimit
  check("Größenlimit", () => {
    const bigName = "too-big.txt";
    fs.writeFileSync(path.join(paths.testInboxDir, bigName), Buffer.alloc(documentRegistry.MAX_DOCUMENT_CONTENT_BYTES + 10, "a"));
    const result = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: bigName, classification: "NORMAL" },
      { paths },
    );
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /Größenlimit/);
  });

  // 10. Dublette erkannt
  check("Dublette erkannt", () => {
    const first = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: "sample-note.txt", classification: "NORMAL", title: "Erste Aufnahme" },
      { paths },
    );
    const second = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: "sample-note.txt", classification: "NORMAL", title: "Zweite Aufnahme" },
      { paths },
    );
    assert.strictEqual(first.ok, true);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.document.documentId, first.document.documentId);
  });

  // 11. Hashprüfung
  check("Hashprüfung", () => {
    const result = documentRegistry.registerTestUpload(
      { projectId: "ki-unternehmenszentrale", sourceFilename: "sample-data.csv", classification: "NORMAL" },
      { paths },
    );
    assert.strictEqual(result.ok, true);
    assert.ok(typeof result.document.contentHash === "string" && result.document.contentHash.length === 64);
    const storedPath = path.join(paths.originalsDir, result.document.storedFileName);
    const actualHash = require("crypto").createHash("sha256").update(fs.readFileSync(storedPath)).digest("hex");
    assert.strictEqual(actualHash, result.document.contentHash);
  });

  // 12. keine Originaldatei in localStorage
  check("keine Originaldatei in localStorage", () => {
    const moduleSource = fs.readFileSync(path.join(__dirname, "document-registry.js"), "utf8");
    assert.ok(!moduleSource.includes("localStorage"));
  });

  // 13. keine Originaldatei im Backup
  check("keine Originaldatei im Backup", () => {
    assert.ok(!localDataBackup.ALLOWED_STORAGE_KEYS.some((key) => key.toLowerCase().includes("document")));
  });

  // 14. keine automatische externe Übertragung
  check("keine automatische externe Übertragung", () => {
    const attempted = documentRegistry.registerDocument(
      {
        projectId: "ki-unternehmenszentrale",
        title: "Externe Übertragung Versuch",
        sourceType: "MANUAL_NOTE",
        note: "x",
        externalTransferAllowed: true,
      },
      { paths },
    );
    assert.strictEqual(attempted.document.externalTransferAllowed, false);
  });

  // 15. keine automatische Löschung
  check("keine automatische Löschung", () => {
    assert.strictEqual(typeof documentRegistry.deleteDocument, "undefined");
    assert.strictEqual(typeof documentRegistry.removeDocument, "undefined");
  });

  // Zusätzliche strukturelle Prüfungen
  check("EXTERNAL_LINK erfordert http(s)-Referenz", () => {
    assert.throws(() =>
      documentRegistry.registerDocument(
        { projectId: "ki-unternehmenszentrale", title: "Link", sourceType: "EXTERNAL_LINK", sourceReference: "kein-link" },
        { paths },
      ),
    );
    const ok = documentRegistry.registerDocument(
      { projectId: "ki-unternehmenszentrale", title: "Link", sourceType: "EXTERNAL_LINK", sourceReference: "https://example.com/doc" },
      { paths },
    );
    assert.strictEqual(ok.ok, true);
  });

  check("unbekannte Agenten-ID in allowedAgentIds wird abgewiesen", () => {
    assert.throws(() =>
      documentRegistry.registerDocument(
        {
          projectId: "ki-unternehmenszentrale",
          title: "Agentenzuordnung",
          sourceType: "MANUAL_NOTE",
          note: "x",
          allowedAgentIds: ["nicht-vorhanden"],
        },
        { paths },
      ),
    );
  });

  check("listDocuments filtert nach Projekt", () => {
    documentRegistry.registerDocument(
      { projectId: "health-upgrade-kompass", title: "Health-Dokument", sourceType: "MANUAL_NOTE", note: "x" },
      { paths },
    );
    const filtered = documentRegistry.listDocuments({ projectId: "health-upgrade-kompass" }, { paths });
    assert.ok(filtered.length >= 1);
    assert.ok(filtered.every((doc) => doc.projectId === "health-upgrade-kompass"));
  });

  check("getDocumentById liefert registriertes Dokument", () => {
    const created = documentRegistry.registerDocument(
      { projectId: "ki-unternehmenszentrale", title: "Abruftest", sourceType: "MANUAL_NOTE", note: "x" },
      { paths },
    );
    const loaded = documentRegistry.getDocumentById(created.document.documentId, { paths });
    assert.ok(loaded);
    assert.strictEqual(loaded.documentId, created.document.documentId);
  });

  check("LOCAL_UPLOAD ist über registerDocument nicht direkt möglich", () => {
    assert.throws(() =>
      documentRegistry.registerDocument(
        { projectId: "ki-unternehmenszentrale", title: "x", sourceType: "LOCAL_UPLOAD" },
        { paths },
      ),
    );
  });

  check("knowledgeStatus STRUCTURED ist in Phase A blockiert", () => {
    assert.throws(() =>
      documentRegistry.registerDocument(
        {
          projectId: "ki-unternehmenszentrale",
          title: "x",
          sourceType: "MANUAL_NOTE",
          note: "x",
          knowledgeStatus: "STRUCTURED",
        },
        { paths },
      ),
    );
  });

  console.log(`document-registry.test.js: ${passed} Prüfpunkte erfolgreich`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
