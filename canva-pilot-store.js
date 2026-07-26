"use strict";

// V7.1 Phase C.1 – lokale, dateisystembasierte Ablage für kanonische
// Canva-Pilot-Ergebnisakten (canva-pilot-result-record.js). Gleiches Muster
// wie canva-store.js/heygen-store.js: eigener Unterordner, atomare
// Schreibvorgänge, restriktive Dateiberechtigungen, keine Bilder/Videos/
// Tokens/Zugangsdaten.

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

function resolveCanvaPilotStorePaths(options = {}) {
  const appSupportDir = options.appSupportDir || serverStatusModule.defaultAppSupportDir();
  const canvaDir = path.join(appSupportDir, "canva");
  return {
    appSupportDir,
    canvaDir,
    pilotResultsDir: path.join(canvaDir, "pilot-results"),
  };
}

function ensureCanvaPilotStoreDirs(paths) {
  [paths.appSupportDir, paths.canvaDir, paths.pilotResultsDir].filter(Boolean).forEach(ensureDirSecure);
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

const MAX_RECORD_BYTES = 512 * 1024;

function pilotResultPath(paths, pilotId) {
  return path.join(paths.pilotResultsDir, `${pilotId}.json`);
}

// V7.1 Phase C.1 – eine bereits gespeicherte Pilot-Ergebnisakte kann NICHT
// nachträglich einem anderen Mandanten zugeordnet werden. Gleiches Muster
// wie canva-store.js#assertNoTenantReassignment; sitzt bewusst an der
// Persistenzgrenze.
function assertNoTenantReassignment(existing, incoming) {
  if (!existing) return;
  if (existing.customerId && incoming.customerId && existing.customerId !== incoming.customerId) {
    throw new Error(
      `Pilot-Ergebnisakte "${incoming.pilotId}" ist bereits Kunde "${existing.customerId}" zugeordnet und kann nicht auf Kunde "${incoming.customerId}" umgestellt werden.`,
    );
  }
  if (existing.brandId && incoming.brandId && existing.brandId !== incoming.brandId) {
    throw new Error(
      `Pilot-Ergebnisakte "${incoming.pilotId}" ist bereits Marke "${existing.brandId}" zugeordnet und kann nicht auf Marke "${incoming.brandId}" umgestellt werden.`,
    );
  }
  if (
    existing.immutableTenantFingerprint &&
    incoming.immutableTenantFingerprint &&
    existing.immutableTenantFingerprint !== incoming.immutableTenantFingerprint
  ) {
    throw new Error(
      `Pilot-Ergebnisakte "${incoming.pilotId}" hat einen unveränderlichen Mandanten-Fingerprint, der nicht überschrieben werden kann.`,
    );
  }
}

// V7.1 Phase C.1.1 (Auftrag Abschnitt D) – "Reviewmodus darf nach erster
// Freigabe nicht stillschweigend geändert werden" und "Tarifwechsel ändert
// keine bestehende Historie". Die einzige zulässige reviewMode-Änderung ist
// eine ausdrückliche, protokollierte Eskalation (reviewMode wird dabei
// "RISK_ESCALATION"); jede andere abweichende reviewMode-Angabe für eine
// bereits gespeicherte Akte wird abgewiesen. Ein serviceTier-Wechsel nach
// bereits erteilter Kundenfreigabe (CUSTOMER_APPROVED) wird ebenfalls
// abgewiesen.
function assertNoSilentReviewModelChange(existing, incoming) {
  if (!existing) return;
  const isExplicitEscalation = incoming.reviewMode === "RISK_ESCALATION";
  if (existing.reviewMode && incoming.reviewMode && existing.reviewMode !== incoming.reviewMode && !isExplicitEscalation) {
    throw new Error(
      `Pilot-Ergebnisakte "${incoming.pilotId}" hat bereits den Reviewmodus "${existing.reviewMode}" und kann nicht stillschweigend auf "${incoming.reviewMode}" umgestellt werden (einzige zulässige Änderung ist eine ausdrückliche Eskalation).`,
    );
  }
  if (
    existing.serviceTier &&
    incoming.serviceTier &&
    existing.serviceTier !== incoming.serviceTier &&
    existing.customerReviewStatus === "CUSTOMER_APPROVED"
  ) {
    throw new Error(
      `Pilot-Ergebnisakte "${incoming.pilotId}" wurde bereits vom Kunden freigegeben; ein nachträglicher Tarifwechsel ("${existing.serviceTier}" -> "${incoming.serviceTier}") ist blockiert.`,
    );
  }
}

function savePilotResultRecord(paths, record) {
  ensureCanvaPilotStoreDirs(paths);
  const id = safeId(record.pilotId);
  if (!id) throw new Error("pilotId ist ungültig.");
  const existing = loadPilotResultRecord(paths, id);
  assertNoTenantReassignment(existing, record);
  assertNoSilentReviewModelChange(existing, record);
  writeJsonAtomic(pilotResultPath(paths, id), record);
  return clone(record);
}

function loadPilotResultRecord(paths, pilotId) {
  ensureCanvaPilotStoreDirs(paths);
  const id = safeId(pilotId);
  if (!id) return null;
  const result = readJsonSafe(pilotResultPath(paths, id), MAX_RECORD_BYTES);
  return result.ok ? clone(result.record) : null;
}

function listPilotResultRecords(paths, filter = {}) {
  ensureCanvaPilotStoreDirs(paths);
  let files;
  try {
    files = fs.readdirSync(paths.pilotResultsDir).filter((name) => name.endsWith(".json"));
  } catch (_error) {
    return [];
  }
  let records = files
    .map((name) => readJsonSafe(path.join(paths.pilotResultsDir, name), MAX_RECORD_BYTES))
    .filter((result) => result.ok)
    .map((result) => result.record);
  if (filter.projectId) {
    records = records.filter((record) => record.projectId === filter.projectId);
  }
  // V7.1 Phase C.1 – Mandantentrennung: eine kundengebundene Ansicht darf
  // ausschließlich Datensätze desselben Kunden liefern (Kunde A kann Kunde
  // B nicht lesen).
  if (filter.customerId) {
    records = records.filter((record) => record.customerId === filter.customerId);
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return records.map(clone);
}

module.exports = {
  resolveCanvaPilotStorePaths,
  ensureCanvaPilotStoreDirs,
  savePilotResultRecord,
  loadPilotResultRecord,
  listPilotResultRecords,
};
