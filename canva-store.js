"use strict";

// V7.1 Phase C – lokale, dateisystembasierte Ablage für Canva-Auftrags-
// pakete, deren Ergebnisrückführung und Editing-Transaktionen. Ausschließlich
// strukturierte Metadaten (siehe canva-design-job-package.js/
// canva-design-result.js/canva-connector.js) – niemals Bilder, Videos,
// Tokens oder Zugangsdaten. Gleiches Muster wie heygen-store.js: eigener
// Unterordner außerhalb beider Repositories, atomare Schreibvorgänge,
// restriktive Dateiberechtigungen.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const serverStatusModule = require("./server-status");

function ensureDirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch (_error) {
    /* best effort on platforms without POSIX permission bits */
  }
}

function resolveCanvaStorePaths(options = {}) {
  const appSupportDir = options.appSupportDir || serverStatusModule.defaultAppSupportDir();
  const canvaDir = path.join(appSupportDir, "canva");
  return {
    appSupportDir,
    canvaDir,
    packagesDir: path.join(canvaDir, "packages"),
    resultsDir: path.join(canvaDir, "results"),
    editingTransactionsDir: path.join(canvaDir, "editing-transactions"),
  };
}

function ensureCanvaStoreDirs(paths) {
  [paths.appSupportDir, paths.canvaDir, paths.packagesDir, paths.resultsDir, paths.editingTransactionsDir]
    .filter(Boolean)
    .forEach(ensureDirSecure);
}

function writeJsonAtomic(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmpPath, serialized, { mode: 0o600 });
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

function safeId(id) {
  const text = typeof id === "string" ? id : "";
  const cleaned = text.replace(/[^a-zA-Z0-9-]/g, "");
  return cleaned === text && cleaned ? cleaned : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const MAX_RECORD_BYTES = 256 * 1024;

function packagePath(paths, jobPackageId) {
  return path.join(paths.packagesDir, `${jobPackageId}.json`);
}

function resultPath(paths, jobPackageId) {
  return path.join(paths.resultsDir, `${jobPackageId}.json`);
}

function editingTransactionPath(paths, editingTransactionId) {
  return path.join(paths.editingTransactionsDir, `${editingTransactionId}.json`);
}

// V7.1 Phase C (Auftrag Abschnitt D, Regel 15) – ein bereits gespeichertes
// Jobpaket kann NICHT nachträglich einem anderen Kunden/einer anderen Marke
// zugeordnet werden. Diese Prüfung sitzt bewusst an der Persistenzgrenze
// (nicht nur im Modul), damit sie für jeden Aufrufer verbindlich gilt.
function assertNoTenantReassignment(existing, incoming) {
  if (!existing) return;
  if (existing.customerId && incoming.customerId && existing.customerId !== incoming.customerId) {
    throw new Error(
      `Jobpaket "${incoming.jobPackageId}" ist bereits Kunde "${existing.customerId}" zugeordnet und kann nicht auf Kunde "${incoming.customerId}" umgestellt werden.`,
    );
  }
  if (existing.brandId && incoming.brandId && existing.brandId !== incoming.brandId) {
    throw new Error(
      `Jobpaket "${incoming.jobPackageId}" ist bereits Marke "${existing.brandId}" zugeordnet und kann nicht auf Marke "${incoming.brandId}" umgestellt werden.`,
    );
  }
}

function savePackage(paths, pkg) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(pkg.jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  const existing = loadPackage(paths, id);
  assertNoTenantReassignment(existing, pkg);
  writeJsonAtomic(packagePath(paths, id), pkg);
  return clone(pkg);
}

function loadPackage(paths, jobPackageId) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(packagePath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listPackages(paths, filter = {}) {
  ensureCanvaStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.packagesDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  let records = files
    .map((name) => readJsonSafe(path.join(paths.packagesDir, name), MAX_RECORD_BYTES))
    .filter((result) => result.ok)
    .map((result) => result.record);
  if (filter.projectId) {
    records = records.filter((record) => record.projectId === filter.projectId);
  }
  // V7.1 Phase C (Auftrag Abschnitt D) – Mandantentrennung: eine
  // kundengebundene Ansicht darf ausschließlich Datensätze desselben Kunden
  // liefern.
  if (filter.customerId) {
    records = records.filter((record) => record.customerId === filter.customerId);
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.map(clone);
}

// V7.1 Phase C (Auftrag Abschnitt D, Regel 17) – Ergebnisrückgaben müssen
// zum gleichen Mandanten wie das zugehörige Jobpaket gehören. customerId/
// brandId/campaignId werden hier NICHT vom Aufrufer übernommen, sondern
// ausschließlich aus dem bereits gespeicherten Jobpaket abgeleitet
// (Foreign-Key-artige Bindung statt einer zweiten, manipulierbaren Wahrheit).
function saveResult(paths, jobPackageId, result) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  const pkg = loadPackage(paths, id);
  if (!pkg) {
    throw new Error(`Kein Canva-Auftragspaket mit jobPackageId "${id}" gefunden; Ergebnis kann nicht zugeordnet werden.`);
  }
  const tenantBoundResult = {
    ...result,
    jobPackageId: id,
    customerId: pkg.customerId,
    brandId: pkg.brandId,
    campaignId: pkg.campaignId,
    projectId: pkg.projectId,
  };
  writeJsonAtomic(resultPath(paths, id), tenantBoundResult);
  return clone(tenantBoundResult);
}

function loadResult(paths, jobPackageId) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(resultPath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listResults(paths, filter = {}) {
  ensureCanvaStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.resultsDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  let records = files
    .map((name) => readJsonSafe(path.join(paths.resultsDir, name), MAX_RECORD_BYTES))
    .filter((result) => result.ok)
    .map((result) => result.record);
  if (filter.customerId) {
    records = records.filter((record) => record.customerId === filter.customerId);
  }
  return records.map(clone);
}

// ---------------------------------------------------------------------------
// Editing-Transaktionen (canva-connector.js). Gleiche Sicherheitsmuster:
// atomar, restriktive Rechte, niemals Rendermaterial. Wird im ersten realen
// Pilot nicht ausgeführt, aber vollständig modelliert und getestet.
// ---------------------------------------------------------------------------

function saveEditingTransaction(paths, record) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(record.editingTransactionId);
  if (!id) throw new Error("editingTransactionId ist ungültig.");
  writeJsonAtomic(editingTransactionPath(paths, id), record);
  return clone(record);
}

function loadEditingTransaction(paths, editingTransactionId) {
  ensureCanvaStoreDirs(paths);
  const id = safeId(editingTransactionId);
  if (!id) return null;
  const result = readJsonSafe(editingTransactionPath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listEditingTransactions(paths, filter = {}) {
  ensureCanvaStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.editingTransactionsDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  let records = files
    .map((name) => readJsonSafe(path.join(paths.editingTransactionsDir, name), MAX_RECORD_BYTES))
    .filter((result) => result.ok)
    .map((result) => result.record);
  if (filter.jobPackageId) {
    records = records.filter((record) => record.jobPackageId === filter.jobPackageId);
  }
  return records.map(clone);
}

module.exports = {
  resolveCanvaStorePaths,
  ensureCanvaStoreDirs,
  savePackage,
  loadPackage,
  listPackages,
  saveResult,
  loadResult,
  listResults,
  saveEditingTransaction,
  loadEditingTransaction,
  listEditingTransactions,
};
