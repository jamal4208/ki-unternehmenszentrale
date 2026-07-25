"use strict";

// V7.1 Phase A – Dokumenten- und Wissenseingang.
//
// Kanonisches, additives Modell für Projektunterlagen. Ausschließlich sichere
// Metadaten, Referenzen und – für den isolierten Test-Upload – kleine,
// serverseitig kontrollierte Testinhalte werden verarbeitet. Originaldateien
// liegen ausschließlich außerhalb beider Repositories unter App Support.
// Kein OCR, keine Vektordatenbank, keine automatische Zusammenfassung, keine
// Cloud-Synchronisation, kein Produktiv-Upload zu Canva/HeyGen/Shopify und
// kein produktiver Lösch-Endpunkt. Reuse only: project-registry.js bleibt die
// einzige Projektquelle, agent-registry.js die einzige Agentenquelle,
// server-status.js liefert den gemeinsamen App-Support-Basisordner.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRegistry = require("./project-registry");
const agentRegistry = require("./agent-registry");
const serverStatusModule = require("./server-status");

const DOCUMENT_SOURCE_TYPES = Object.freeze([
  "LOCAL_UPLOAD",
  "LOCAL_REFERENCE",
  "EXTERNAL_LINK",
  "MANUAL_NOTE",
  "CONNECTOR_REFERENCE",
]);

const DOCUMENT_CLASSIFICATIONS = Object.freeze(["NORMAL", "SENSITIVE", "SECRET"]);

const DOCUMENT_PROCESSING_STATUSES = Object.freeze([
  "REGISTERED",
  "VALIDATED",
  "READY_FOR_REVIEW",
  "REJECTED",
  "ARCHIVED",
]);

const DOCUMENT_KNOWLEDGE_STATUSES = Object.freeze(["NOT_INDEXED", "REFERENCE_ONLY", "STRUCTURED"]);

// Allowlist statt Blockliste: nur diese Dateitypen dürfen überhaupt
// angenommen werden. Ausführbare Formate (.exe/.sh/.js/.command/... ) sind
// dadurch bereits strukturell ausgeschlossen, unabhängig vom Dateinamen.
const ALLOWED_DOCUMENT_EXTENSIONS = Object.freeze([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".rtf",
]);

// Zugangsdaten-/Zertifikatsmuster werden unabhängig von der Erweiterung immer
// blockiert bzw. in Quarantäne verschoben – auch falls ein Dateiname
// versehentlich zusätzlich zufällig auf eine erlaubte Erweiterung endet.
const SECRET_FILENAME_PATTERNS = Object.freeze([
  /\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /\.cer$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials?/i,
  /secret/i,
  /\.ovpn$/i,
  /\.kdbx$/i,
]);

const BARE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

const MAX_DOCUMENT_CONTENT_BYTES = 256 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTE_LENGTH = 4000;
const MAX_SOURCE_REFERENCE_LENGTH = 800;

function nowIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// App-Support-Pfade – eigener Unterbaum, geteilte Basis mit den bestehenden
// Phase-B/C-Modulen (server-status.js, execution-bridge.js).
// ---------------------------------------------------------------------------

function resolveDocumentPaths(options = {}) {
  const appSupportDir = options.appSupportDir || serverStatusModule.defaultAppSupportDir();
  const documentsDir = path.join(appSupportDir, "documents");
  return {
    appSupportDir,
    documentsDir,
    originalsDir: path.join(documentsDir, "originals"),
    metadataDir: path.join(documentsDir, "metadata"),
    previewsDir: path.join(documentsDir, "previews"),
    quarantineDir: path.join(documentsDir, "quarantine"),
    testInboxDir: path.join(documentsDir, "test-inbox"),
  };
}

function ensureDirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch (_error) {
    /* best effort on platforms without POSIX permission bits */
  }
}

function ensureDocumentDirs(paths) {
  [
    paths.appSupportDir,
    paths.documentsDir,
    paths.originalsDir,
    paths.metadataDir,
    paths.previewsDir,
    paths.quarantineDir,
    paths.testInboxDir,
  ].forEach(ensureDirSecure);
}

function writeJsonAtomic(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmpPath, serialized, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function writeFileAtomic(filePath, buffer) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmpPath, buffer, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, maxBytes) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return { ok: false, reason: "MISSING" };
    return { ok: false, reason: "UNREADABLE" };
  }
  if (typeof maxBytes === "number" && stat.size > maxBytes) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return { ok: false, reason: "UNREADABLE" };
  }
  try {
    return { ok: true, record: JSON.parse(raw) };
  } catch (_error) {
    return { ok: false, reason: "CORRUPT" };
  }
}

// ---------------------------------------------------------------------------
// Isolierte Test-Fixture-Dateien für den kontrollierten Test-Upload (Phase A
// implementiert bewusst keinen allgemeinen Browser-Datei-Upload-Pfad; siehe
// Auftrag Abschnitt E). Diese Dateien werden von der Zentrale selbst erzeugt,
// niemals vom Browser vorgegeben.
// ---------------------------------------------------------------------------

const TEST_FIXTURE_FILES = Object.freeze({
  "sample-note.txt": "Dokumenten-Fixture (V7.1 Phase A) – Beispieltext für den isolierten Test-Upload.\n",
  "sample-data.csv": "spalte_a,spalte_b\nwert1,wert2\n",
});

function ensureDocumentTestFixtureFiles(paths) {
  ensureDirSecure(paths.testInboxDir);
  Object.entries(TEST_FIXTURE_FILES).forEach(([name, content]) => {
    const filePath = path.join(paths.testInboxDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, { mode: 0o600 });
    }
  });
}

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

function assertKnownEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName}: unbekannter Wert "${value}".`);
  }
}

function assertBareFilename(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} fehlt.`);
  }
  const trimmed = value.trim();
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..") || trimmed.includes("\0")) {
    throw new Error(`${fieldName}: Pfadangaben oder Traversierung sind nicht erlaubt, nur ein einfacher Dateiname.`);
  }
  if (path.isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed) || trimmed.startsWith("~")) {
    throw new Error(`${fieldName}: absolute Pfade werden nicht übernommen.`);
  }
  if (!BARE_FILENAME_PATTERN.test(trimmed)) {
    throw new Error(`${fieldName}: ungültiger Dateiname.`);
  }
  return trimmed;
}

function assertAllowedExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
    throw new Error(`Dateityp "${ext || "unbekannt"}" ist nicht in der erlaubten Liste und wird abgewiesen (ausführbare und unbekannte Formate sind blockiert).`);
  }
  return ext;
}

function isSecretLikeFilename(fileName) {
  return SECRET_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

function assertNoAbsoluteBrowserPath(value, fieldName) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  if (looksLikeUrl) return;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("file://")
  ) {
    throw new Error(`${fieldName}: absolute Browser-/Systempfade werden nicht übernommen.`);
  }
}

function assertProjectExists(projectId) {
  const project = projectRegistry.getProjectById(projectId);
  if (!project) {
    const error = new Error("Unbekannte Projekt-ID. Es wurde kein Dokument registriert.");
    error.code = "PROJECT_NOT_FOUND";
    throw error;
  }
  return project;
}

function assertAllowedAgentIds(allowedAgentIds) {
  if (allowedAgentIds === undefined || allowedAgentIds === null) return [];
  if (!Array.isArray(allowedAgentIds)) {
    throw new Error("allowedAgentIds muss eine Liste sein.");
  }
  allowedAgentIds.forEach((agentId) => {
    if (!agentRegistry.hasAgentId(agentId)) {
      throw new Error(`Unbekannte Agenten-ID in allowedAgentIds: ${agentId}`);
    }
  });
  return [...new Set(allowedAgentIds)];
}

function trimmedOrNull(value, maxLength) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

// ---------------------------------------------------------------------------
// Persistenz
// ---------------------------------------------------------------------------

function metadataFilePath(paths, documentId) {
  return path.join(paths.metadataDir, `${documentId}.json`);
}

function saveDocumentRecord(paths, record) {
  ensureDirSecure(paths.metadataDir);
  writeJsonAtomic(metadataFilePath(paths, record.documentId), record);
  return record;
}

function loadDocumentRecord(paths, documentId) {
  const safeId = typeof documentId === "string" ? documentId.replace(/[^a-zA-Z0-9-]/g, "") : "";
  if (!safeId || safeId !== documentId) return { ok: false, reason: "INVALID_ID" };
  return readJsonSafe(metadataFilePath(paths, documentId), 256 * 1024);
}

function listAllDocumentRecords(paths) {
  ensureDirSecure(paths.metadataDir);
  let files;
  try {
    files = fs.readdirSync(paths.metadataDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  return files
    .map((name) => readJsonSafe(path.join(paths.metadataDir, name), 256 * 1024))
    .filter((result) => result.ok)
    .map((result) => result.record);
}

function findDuplicateByContentHash(paths, projectId, contentHash) {
  if (!contentHash) return null;
  return (
    listAllDocumentRecords(paths).find(
      (record) => record.projectId === projectId && record.contentHash === contentHash && !record.quarantined,
    ) || null
  );
}

function findDuplicateReference(paths, { projectId, sourceType, sourceReference, title }) {
  if (!sourceReference) return null;
  return (
    listAllDocumentRecords(paths).find(
      (record) =>
        record.projectId === projectId &&
        record.sourceType === sourceType &&
        record.sourceReference === sourceReference &&
        record.title === title,
    ) || null
  );
}

// ---------------------------------------------------------------------------
// Öffentliche kanonische Record-Fabrik
// ---------------------------------------------------------------------------

function baseDocumentRecord(overrides) {
  const createdAt = nowIso();
  return {
    schemaVersion: 1,
    documentId: randomId("doc"),
    projectId: null,
    title: null,
    originalFilename: null,
    mediaType: null,
    sizeBytes: 0,
    sourceType: null,
    classification: "NORMAL",
    processingStatus: "REGISTERED",
    knowledgeStatus: "NOT_INDEXED",
    createdAt,
    updatedAt: createdAt,
    addedBy: "Jamal",
    sourceReference: null,
    contentHash: null,
    documentType: null,
    allowedAgentIds: [],
    externalTransferAllowed: false,
    retentionNotice:
      "Aufbewahrung lokal außerhalb der Repositories. Sichere Löschung erfordert eine spätere, separate Jamal-Freigabe (in Phase A kein produktiver Lösch-Endpunkt).",
    provenanceNote: null,
    storedFileName: null,
    quarantined: false,
    rejectionReason: null,
    isDuplicate: false,
    duplicateOfDocumentId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registrierung ohne Dateiinhalt (LOCAL_REFERENCE / EXTERNAL_LINK /
// MANUAL_NOTE / CONNECTOR_REFERENCE). Es wird niemals ein Dateisystempfad vom
// Browser gelesen oder aufgelöst – ausschließlich eine geprüfte Textreferenz.
// ---------------------------------------------------------------------------

function registerDocument(input = {}, options = {}) {
  const paths = options.paths || resolveDocumentPaths(options);
  ensureDocumentDirs(paths);

  const sourceType = String(input.sourceType || "").trim();
  assertKnownEnum(sourceType, DOCUMENT_SOURCE_TYPES, "sourceType");
  if (sourceType === "LOCAL_UPLOAD") {
    throw new Error("LOCAL_UPLOAD ist ausschließlich über den isolierten Test-Upload-Endpunkt möglich.");
  }

  const projectId = String(input.projectId || "").trim();
  assertProjectExists(projectId);

  const classification = String(input.classification || "NORMAL").trim();
  assertKnownEnum(classification, DOCUMENT_CLASSIFICATIONS, "classification");

  const title = trimmedOrNull(input.title, MAX_TITLE_LENGTH);
  if (!title) throw new Error("title fehlt.");

  const knowledgeStatus = String(input.knowledgeStatus || "NOT_INDEXED").trim();
  if (knowledgeStatus === "STRUCTURED") {
    throw new Error("knowledgeStatus STRUCTURED erfordert echte Aufbereitung und ist in Phase A nicht verfügbar.");
  }
  assertKnownEnum(knowledgeStatus, ["NOT_INDEXED", "REFERENCE_ONLY"], "knowledgeStatus");

  const sourceReference = trimmedOrNull(input.sourceReference, MAX_SOURCE_REFERENCE_LENGTH);
  if (sourceType === "EXTERNAL_LINK") {
    if (!sourceReference || !/^https?:\/\//i.test(sourceReference)) {
      throw new Error("EXTERNAL_LINK erfordert eine gültige http(s)-Referenz in sourceReference.");
    }
  }
  if (sourceReference) {
    assertNoAbsoluteBrowserPath(sourceReference, "sourceReference");
  }
  if (sourceType === "MANUAL_NOTE" && !sourceReference && !input.note) {
    throw new Error("MANUAL_NOTE erfordert sourceReference oder note.");
  }

  const note = trimmedOrNull(input.note, MAX_NOTE_LENGTH);
  const allowedAgentIds = assertAllowedAgentIds(input.allowedAgentIds);
  const documentType = trimmedOrNull(input.documentType, 120);
  const mediaType = trimmedOrNull(input.mediaType, 80);
  const provenanceNote = trimmedOrNull(input.provenanceNote, MAX_NOTE_LENGTH);

  const duplicate = findDuplicateReference(paths, { projectId, sourceType, sourceReference, title });
  if (duplicate) {
    return { ok: true, document: clone(duplicate), isDuplicate: true };
  }

  const record = baseDocumentRecord({
    projectId,
    title,
    originalFilename: null,
    mediaType,
    sizeBytes: 0,
    sourceType,
    classification,
    processingStatus: "REGISTERED",
    knowledgeStatus,
    sourceReference: sourceReference || note,
    documentType,
    allowedAgentIds,
    externalTransferAllowed: false,
    provenanceNote,
  });

  saveDocumentRecord(paths, record);
  return { ok: true, document: clone(record), isDuplicate: false };
}

// ---------------------------------------------------------------------------
// Isolierter Test-Upload – liest ausschließlich aus dem selbst erzeugten
// Test-Inbox-Ordner, niemals aus einem vom Browser übergebenen Dateisystem-
// pfad. Traversal, absolute Pfade und Symlinks werden aktiv geprüft.
// ---------------------------------------------------------------------------

function registerTestUpload(input = {}, options = {}) {
  const paths = options.paths || resolveDocumentPaths(options);
  ensureDocumentDirs(paths);
  ensureDocumentTestFixtureFiles(paths);

  const projectId = String(input.projectId || "").trim();
  assertProjectExists(projectId);

  const classification = String(input.classification || "NORMAL").trim();
  assertKnownEnum(classification, DOCUMENT_CLASSIFICATIONS, "classification");

  const title = trimmedOrNull(input.title, MAX_TITLE_LENGTH) || "Test-Upload";
  const allowedAgentIds = assertAllowedAgentIds(input.allowedAgentIds);
  const documentType = trimmedOrNull(input.documentType, 120);

  const sourceFilename = assertBareFilename(input.sourceFilename, "sourceFilename");
  const isSecret = isSecretLikeFilename(sourceFilename);

  const inboxPath = path.join(paths.testInboxDir, sourceFilename);
  const resolvedInboxRoot = path.resolve(paths.testInboxDir);
  const resolvedTarget = path.resolve(inboxPath);
  if (!resolvedTarget.startsWith(resolvedInboxRoot + path.sep) && resolvedTarget !== resolvedInboxRoot) {
    throw new Error("sourceFilename verlässt den erlaubten Test-Inbox-Bereich.");
  }

  let lstat;
  try {
    lstat = fs.lstatSync(inboxPath);
  } catch (_error) {
    throw new Error("Test-Datei wurde im Test-Inbox-Bereich nicht gefunden.");
  }
  if (lstat.isSymbolicLink()) {
    return rejectUpload(paths, {
      projectId,
      title,
      originalFilename: sourceFilename,
      classification,
      documentType,
      allowedAgentIds,
      reason: "Symlinks werden nicht angenommen.",
    });
  }
  if (!lstat.isFile()) {
    throw new Error("sourceFilename verweist auf keine reguläre Datei.");
  }

  if (isSecret) {
    return rejectUpload(paths, {
      projectId,
      title,
      originalFilename: sourceFilename,
      classification,
      documentType,
      allowedAgentIds,
      reason: "Zugangsdaten-, Zertifikats- oder Schlüsseldateien werden nicht angenommen (Quarantäne).",
      quarantine: true,
    });
  }

  let extension;
  try {
    extension = assertAllowedExtension(sourceFilename);
  } catch (error) {
    return rejectUpload(paths, {
      projectId,
      title,
      originalFilename: sourceFilename,
      classification,
      documentType,
      allowedAgentIds,
      reason: error.message,
    });
  }

  if (lstat.size > MAX_DOCUMENT_CONTENT_BYTES) {
    return rejectUpload(paths, {
      projectId,
      title,
      originalFilename: sourceFilename,
      classification,
      documentType,
      allowedAgentIds,
      reason: `Größenlimit überschritten (max. ${MAX_DOCUMENT_CONTENT_BYTES} Byte).`,
    });
  }

  const content = fs.readFileSync(inboxPath);
  const preHash = sha256Hex(content);

  const duplicate = findDuplicateByContentHash(paths, projectId, preHash);
  if (duplicate) {
    return { ok: true, document: clone(duplicate), isDuplicate: true };
  }

  const documentId = randomId("doc");
  const storedFileName = `${documentId}${extension}`;
  const destinationPath = path.join(paths.originalsDir, storedFileName);
  if (fs.existsSync(destinationPath)) {
    throw new Error("Interner Namenskonflikt bei der Ablage. Kein Dokument wurde überschrieben.");
  }
  writeFileAtomic(destinationPath, content);

  const postHash = sha256Hex(fs.readFileSync(destinationPath));
  if (postHash !== preHash) {
    try {
      fs.unlinkSync(destinationPath);
    } catch (_error) {
      /* best effort cleanup */
    }
    throw new Error("Hashprüfung nach Ablage fehlgeschlagen. Kein Dokument wurde registriert.");
  }

  const record = baseDocumentRecord({
    projectId,
    title,
    originalFilename: sourceFilename,
    mediaType: extension.slice(1),
    sizeBytes: content.length,
    sourceType: "LOCAL_UPLOAD",
    classification,
    processingStatus: "VALIDATED",
    knowledgeStatus: "NOT_INDEXED",
    sourceReference: null,
    contentHash: postHash,
    documentType,
    allowedAgentIds,
    externalTransferAllowed: false,
    provenanceNote: "Isolierter Test-Upload gegen serverseitig verwaltete Fixture-Datei (V7.1 Phase A).",
    storedFileName,
  });
  saveDocumentRecord(paths, { ...record, documentId });
  return { ok: true, document: clone({ ...record, documentId }), isDuplicate: false };
}

function rejectUpload(paths, { projectId, title, originalFilename, classification, documentType, allowedAgentIds, reason, quarantine }) {
  const record = baseDocumentRecord({
    projectId,
    title,
    originalFilename,
    sourceType: "LOCAL_UPLOAD",
    classification,
    processingStatus: "REJECTED",
    documentType,
    allowedAgentIds,
    quarantined: Boolean(quarantine),
    rejectionReason: reason,
    provenanceNote: "Isolierter Test-Upload abgewiesen (V7.1 Phase A Sicherheitsprüfung).",
  });
  saveDocumentRecord(paths, record);
  return { ok: false, document: clone(record), rejected: true, reason };
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

function listDocuments(filter = {}, options = {}) {
  const paths = options.paths || resolveDocumentPaths(options);
  ensureDocumentDirs(paths);
  let records = listAllDocumentRecords(paths);
  if (filter.projectId) {
    records = records.filter((record) => record.projectId === filter.projectId);
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.map(clone);
}

function getDocumentById(documentId, options = {}) {
  const paths = options.paths || resolveDocumentPaths(options);
  ensureDocumentDirs(paths);
  const result = loadDocumentRecord(paths, documentId);
  if (!result.ok) return null;
  return clone(result.record);
}

// Read-only Referenzliste für Guided Work (V7.1 Phase A, Auftrag Abschnitt E:
// "Referenz in Guided Work verwenden"). Bewusst keine Änderung an
// guided-work.js selbst – die dortige Attempt-/Baseline-Statusmaschine bleibt
// unverändert. Guided Work (bzw. dessen UI) kann für das fokussierte Projekt
// die vorhandenen, bereits geprüften Dokumentreferenzen read-only abrufen,
// nichts wird automatisch angehängt oder verändert.
function listDocumentReferencesForGuidedWork(focusProjectId, options = {}) {
  if (!focusProjectId) return [];
  return listDocuments({ projectId: focusProjectId }, options).filter((doc) => !doc.quarantined);
}

module.exports = {
  DOCUMENT_SOURCE_TYPES,
  DOCUMENT_CLASSIFICATIONS,
  DOCUMENT_PROCESSING_STATUSES,
  DOCUMENT_KNOWLEDGE_STATUSES,
  ALLOWED_DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_CONTENT_BYTES,
  resolveDocumentPaths,
  ensureDocumentDirs,
  ensureDocumentTestFixtureFiles,
  registerDocument,
  registerTestUpload,
  listDocuments,
  getDocumentById,
  listDocumentReferencesForGuidedWork,
};
