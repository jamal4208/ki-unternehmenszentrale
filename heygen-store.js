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
  };
}

function ensureHeygenStoreDirs(paths) {
  [paths.appSupportDir, paths.heygenDir, paths.packagesDir, paths.resultsDir].forEach(ensureDirSecure);
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

function savePackage(paths, pkg) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(pkg.jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
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
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.map(clone);
}

function saveResult(paths, jobPackageId, result) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) throw new Error("jobPackageId ist ungültig.");
  writeJsonAtomic(resultPath(paths, id), result);
  return clone(result);
}

function loadResult(paths, jobPackageId) {
  ensureHeygenStoreDirs(paths);
  const id = safeId(jobPackageId);
  if (!id) return null;
  const result = readJsonSafe(resultPath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listResults(paths) {
  ensureHeygenStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.resultsDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  return files
    .map((name) => readJsonSafe(path.join(paths.resultsDir, name), MAX_RECORD_BYTES))
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
};
