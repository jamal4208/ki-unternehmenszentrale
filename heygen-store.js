"use strict";

// V7.1 Phase B – lokale, dateisystembasierte Ablage für HeyGen-Auftrags-
// pakete und deren Ergebnisrückführung. Ausschließlich strukturierte
// Metadaten (siehe heygen-job-package.js/heygen-job-result.js) – niemals
// Videos, Audios, Bilder, Tokens oder Zugangsdaten. Gleiches Muster wie
// document-registry.js: eigener Unterordner außerhalb beider Repositories,
// atomare Schreibvorgänge, restriktive Dateiberechtigungen.

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

function resolveHeygenStorePaths(options = {}) {
  const appSupportDir = options.appSupportDir || serverStatusModule.defaultAppSupportDir();
  const heygenDir = path.join(appSupportDir, "heygen");
  return {
    appSupportDir,
    heygenDir,
    packagesDir: path.join(heygenDir, "packages"),
    resultsDir: path.join(heygenDir, "results"),
    // V7.1 Phase B.1 – additive Ablage für die Ergebnisrückführungs-
    // Statuskette (siehe heygen-result-lifecycle.js). Ausschließlich
    // Statusmetadaten, kein Rendermaterial.
    lifecyclesDir: path.join(heygenDir, "lifecycles"),
  };
}

function ensureHeygenStoreDirs(paths) {
  [paths.appSupportDir, paths.heygenDir, paths.packagesDir, paths.resultsDir, paths.lifecyclesDir]
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

function lifecyclePath(paths, jobPackageId) {
  return path.join(paths.lifecyclesDir, `${jobPackageId}.json`);
}

// V7.1 Phase B.1 (Auftrag Abschnitt D, Regel 3) – ein bereits gespeichertes
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
  ensureHeygenStoreDirs(paths);
  const id = safeId(pkg.jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  const existing = loadPackage(paths, id);
  assertNoTenantReassignment(existing, pkg);
  writeJsonAtomic(packagePath(paths, id), pkg);
  return clone(pkg);
}

function loadPackage(paths, jobPackageId) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(packagePath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listPackages(paths, filter = {}) {
  ensureHeygenStoreDirs(paths);
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
  // V7.1 Phase B.1 (Auftrag Abschnitt D) – Mandantentrennung: eine
  // kundengebundene Ansicht darf ausschließlich Datensätze desselben Kunden
  // liefern.
  if (filter.customerId) {
    records = records.filter((record) => record.customerId === filter.customerId);
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.map(clone);
}

// V7.1 Phase B.1 (Auftrag Abschnitt D, Regel 4) – Ergebnisrückgaben müssen
// zum gleichen Mandanten wie das zugehörige Jobpaket gehören. customerId/
// brandId/campaignId werden hier NICHT vom Aufrufer übernommen, sondern
// ausschließlich aus dem bereits gespeicherten Jobpaket abgeleitet
// (Foreign-Key-artige Bindung statt einer zweiten, manipulierbaren Wahrheit).
function saveResult(paths, jobPackageId, result) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  const pkg = loadPackage(paths, id);
  if (!pkg) {
    throw new Error(`Kein HeyGen-Auftragspaket mit jobPackageId "${id}" gefunden; Ergebnis kann nicht zugeordnet werden.`);
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
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(resultPath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listResults(paths, filter = {}) {
  ensureHeygenStoreDirs(paths);
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
// V7.1 Phase B.1 – Ergebnisrückführungs-Statuskette (heygen-result-
// lifecycle.js). Gleiche Sicherheitsmuster: atomar, restriktive Rechte,
// niemals Rendermaterial.
// ---------------------------------------------------------------------------

function saveLifecycle(paths, jobPackageId, lifecycleRecord) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  writeJsonAtomic(lifecyclePath(paths, id), lifecycleRecord);
  return clone(lifecycleRecord);
}

function loadLifecycle(paths, jobPackageId) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(lifecyclePath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listLifecycles(paths) {
  ensureHeygenStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.lifecyclesDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  return files
    .map((name) => readJsonSafe(path.join(paths.lifecyclesDir, name), MAX_RECORD_BYTES))
    .filter((result) => result.ok)
    .map((result) => result.record)
    .map(clone);
}

module.exports = {
  resolveHeygenStorePaths,
  ensureHeygenStoreDirs,
  savePackage,
  loadPackage,
  listPackages,
  saveResult,
  loadResult,
  listResults,
  saveLifecycle,
  loadLifecycle,
  listLifecycles,
};
