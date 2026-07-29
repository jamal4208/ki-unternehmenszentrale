"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 7 ("erste echte
// KI-Agentenausführung über die bestehende Codex-Anbindung").
//
// Isolierter Read-Only-Workspace für genau einen Codex-Agentenlauf
// (executionRunId). Bewusst ein eigenes, kleines Modul statt einer
// Wiederverwendung von execution-bridge.js#materializeIsolatedWorkspace:
// jener Ablauf ist auf einen ganzen, potenziell dateiverändernden
// Attempt-Workspace samt Baseline-Fingerprint/Apply-Gate zugeschnitten. Der
// hier benötigte Fall ist enger und strenger:
//   - AUSSCHLIESSLICH die in einem festen, serverseitigen Preset explizit
//     genannten Dateien werden kopiert (niemals ein ganzer Verzeichnisbaum),
//   - niemals .git, .env, .env.local, node_modules oder ein Health-Pfad,
//   - der Workspace liegt immer außerhalb jedes echten Repositories,
//   - der Workspace wird eindeutig einer executionRunId zugeordnet,
//   - vor und nach dem Codex-Lauf wird die Unversehrtheit der kopierten
//     Dateien geprüft (siehe verifyWorkspaceUnchanged) – unabhängig davon,
//     ob der Codex-Sandboxmodus selbst bereits schreibend verhindert.
//
// Dieses Modul führt selbst NIEMALS Codex oder einen anderen Kindprozess
// aus – das bleibt ausschließlich execution-codex-adapter.js vorbehalten.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Deckungsgleich mit execution-bridge.js#EXCLUDED_COPY_NAMES – bewusst
// dieselbe, bereits geprüfte Ausschlussliste, hier zusätzlich als
// Verteidigung in der Tiefe angewendet (die eigentliche Sicherheit kommt
// bereits daher, dass NUR explizit erlaubte Einzeldateien kopiert werden,
// niemals ein Verzeichnisbaum).
const FORBIDDEN_PATH_SEGMENTS = Object.freeze([".git", ".env", ".env.local", "node_modules", ".DS_Store", "data"]);
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertSafeAllowedRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Isolierter Read-Only-Workspace: leerer Dateipfad ist unzulässig.");
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (path.isAbsolute(normalized) || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Isolierter Read-Only-Workspace: absoluter Pfad ist unzulässig (${value}).`);
  }
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new Error(`Isolierter Read-Only-Workspace: Pfad-Traversierung ist unzulässig (${value}).`);
  }
  if (normalized.includes("\0")) {
    throw new Error("Isolierter Read-Only-Workspace: ungültiges Nullbyte im Pfad.");
  }
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (FORBIDDEN_PATH_SEGMENTS.some((forbidden) => lowerSegments.includes(forbidden))) {
    throw new Error(`Isolierter Read-Only-Workspace: verbotener Pfadanteil (${value}).`);
  }
  return normalized;
}

function assertOutsideForbiddenRoots(resolvedWorkspace, forbiddenRoots, realpathSyncImpl) {
  (forbiddenRoots || []).forEach((root) => {
    if (!root) return;
    let resolvedRoot;
    try {
      resolvedRoot = realpathSyncImpl(root);
    } catch (_error) {
      resolvedRoot = path.resolve(root);
    }
    if (resolvedWorkspace === resolvedRoot || resolvedWorkspace.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error("Isolierter Read-Only-Workspace: Workspace liegt innerhalb eines verbotenen Repositorypfads.");
    }
  });
}

// Erzeugt einen frischen, ausschließlich dieser executionRunId zugeordneten
// Workspace außerhalb jedes echten Repositories und kopiert ausschließlich
// die übergebenen allowedFiles (read-only Quelle, niemals eine
// Verzeichnis-Traversierung). Wirft bei jeder Grenzverletzung, statt still
// zu ignorieren.
//
// Korrektur 7 (unabhängiges Review, Kategorie B, "Workspace bei
// Erzeugungsfehler aufräumen"): scheitert die Erzeugung NACH dem Anlegen
// des Basisverzeichnisses (mkdtemp) – z. B. weil eine spätere erlaubte
// Datei fehlt, ein Größenlimit während des Kopierens überschritten wird
// oder eine Sicherheitsprüfung fehlschlägt –, wird der bereits angelegte,
// ggf. teilweise befüllte Workspace HIER selbst sofort rekursiv entfernt,
// BEVOR der ursprüngliche, kontrollierte Fehler weitergeworfen wird. Der
// Aufrufer muss sich in diesem Fehlerfall NICHT zusätzlich um Cleanup
// kümmern (anders als zuvor: früher wurde bei einem Fehler in dieser
// Funktion kein Workspace-Pfad zurückgegeben, sodass der Aufrufer ihn gar
// nicht hätte entfernen können – das teilweise gefüllte Verzeichnis blieb
// zurück). Ein NUR beim tatsächlichen Erfolg vom Aufrufer separat
// aufzurufendes cleanupWorkspace() bleibt für den Erfolgsfall zuständig
// (siehe pilot-agent-codex-runner.js#finally).
//
// Scheitert die Bereinigung selbst (z. B. Dateisystemfehler), wird der
// ursprüngliche Sicherheitsfehler NICHT verschleiert – er bleibt die
// geworfene Fehlermeldung. Der Cleanup-Fehler wird zusätzlich, rein
// informativ, als `workspaceCleanupError`/`workspaceDirLeftBehind` an das
// geworfene Error-Objekt angehängt, damit ein zurückgebliebenes Verzeichnis
// nachvollziehbar bleibt (kein Secret- oder Fachinhalt darin, siehe
// FORBIDDEN_PATH_SEGMENTS/Allowlist – ein Cleanup-Fehler ist daher ein
// Hygiene-, kein Sicherheitsleck).
function createIsolatedReadOnlyWorkspace(options = {}) {
  const {
    sourceRoot,
    allowedFiles,
    executionRunId,
    forbiddenRoots = [],
  } = options;

  if (typeof sourceRoot !== "string" || !sourceRoot) {
    throw new Error("Isolierter Read-Only-Workspace: sourceRoot fehlt.");
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error("Isolierter Read-Only-Workspace: allowedFiles ist erforderlich und darf nicht leer sein.");
  }
  if (typeof executionRunId !== "string" || !executionRunId.trim()) {
    throw new Error("Isolierter Read-Only-Workspace: executionRunId fehlt.");
  }

  const mkdtemp = options.mkdtempSyncImpl || fs.mkdtempSync;
  const mkdir = options.mkdirSyncImpl || fs.mkdirSync;
  const realpathSyncImpl = options.realpathSyncImpl || fs.realpathSync;

  const workspaceId = crypto.randomBytes(8).toString("hex");
  // Der reale Pfad enthält bewusst NICHT die executionRunId im Klartext an
  // einer vorhersagbaren, für Dritte erratbaren Stelle über die
  // Zufallskomponente hinaus – workspaceId (siehe Rückgabewert) ist die
  // einzige technische Referenz, die persistiert wird (niemals der reale
  // Dateisystempfad, siehe pilot-agent-execution-service.js).
  const workspaceDirPrefix = `kuz-codex-ro-${workspaceId}-`;
  const workspaceDir = mkdtemp(path.join(os.tmpdir(), workspaceDirPrefix));

  // Sicherheitsschranke für die Cleanup-bei-Fehler-Logik unten: es darf
  // NIEMALS ein Pfad entfernt werden, der nicht nachweislich dieser
  // frischen, eindeutigen workspaceId zuzuordnen ist. Ohne diese Schranke
  // könnte ein fehlerhaftes/getestetes mkdtempSyncImpl (siehe
  // pilot-agent-codex-workspace.test.js#"...forbiddenRoot markiert...", das
  // absichtlich sourceRoot statt eines frischen Verzeichnisses zurückgibt)
  // dazu führen, dass beim anschließenden Sicherheitsfehler versehentlich
  // sourceRoot/ein echtes Repository rekursiv gelöscht wird.
  const workspaceDirIsOwnFreshTempDir = path.basename(workspaceDir).startsWith(workspaceDirPrefix);

  // Ab hier (Basisverzeichnis existiert bereits durch mkdtemp) wird JEDER
  // Fehler abgefangen, um den bereits angelegten Workspace zu entfernen,
  // bevor er weitergeworfen wird (Korrektur 7, siehe Kopfkommentar).
  try {
    mkdir(workspaceDir, { recursive: true, mode: 0o700 });

    const resolvedWorkspace = realpathSyncImpl(workspaceDir);
    assertOutsideForbiddenRoots(resolvedWorkspace, forbiddenRoots, realpathSyncImpl);

    const resolvedSourceRoot = realpathSyncImpl(sourceRoot);
    const fileByteLimit = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : MAX_FILE_BYTES;
    const totalByteLimit = Number.isFinite(options.maxTotalBytes) ? options.maxTotalBytes : MAX_TOTAL_BYTES;

    const existsSyncImpl = options.existsSyncImpl || fs.existsSync;
    const statSyncImpl = options.statSyncImpl || fs.statSync;
    const readFileSyncImpl = options.readFileSyncImpl || fs.readFileSync;
    const writeFileSyncImpl = options.writeFileSyncImpl || fs.writeFileSync;

    let totalBytes = 0;
    const baselineHashes = {};
    const copiedFiles = [];

    allowedFiles.forEach((rawRelativePath) => {
      const relativePath = assertSafeAllowedRelativePath(rawRelativePath);
      const srcAbsolute = path.join(resolvedSourceRoot, relativePath);
      if (!existsSyncImpl(srcAbsolute) || !statSyncImpl(srcAbsolute).isFile()) {
        throw new Error(`Isolierter Read-Only-Workspace: erlaubte Datei fehlt in der Quelle (${relativePath}).`);
      }
      let realSrc;
      try {
        realSrc = realpathSyncImpl(srcAbsolute);
      } catch (_error) {
        throw new Error(`Isolierter Read-Only-Workspace: Quelldatei konnte nicht sicher aufgelöst werden (${relativePath}).`);
      }
      // Symlink-Flucht: die aufgelöste reale Datei muss innerhalb der realen
      // Quellwurzel liegen – niemals ein Symlink aus dem echten Repository,
      // der außerhalb zeigt (deckt sowohl eine Symlink-Datei als auch ein
      // Symlink-Verzeichnis im Pfad ab, da realpath beide auflöst).
      if (realSrc !== resolvedSourceRoot && !realSrc.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
        throw new Error(`Isolierter Read-Only-Workspace: Datei liegt außerhalb der erlaubten Quelle (${relativePath}).`);
      }
      const stat = statSyncImpl(realSrc);
      if (stat.size > fileByteLimit) {
        throw new Error(`Isolierter Read-Only-Workspace: Datei überschreitet die Größengrenze (${relativePath}).`);
      }
      totalBytes += stat.size;
      if (totalBytes > totalByteLimit) {
        throw new Error("Isolierter Read-Only-Workspace: Gesamtgrößengrenze überschritten.");
      }
      const buffer = readFileSyncImpl(realSrc);
      const destAbsolute = path.join(resolvedWorkspace, relativePath);
      mkdir(path.dirname(destAbsolute), { recursive: true, mode: 0o700 });
      writeFileSyncImpl(destAbsolute, buffer, { mode: 0o400 });
      baselineHashes[relativePath] = sha256Hex(buffer);
      copiedFiles.push(relativePath);
    });

    return {
      workspaceId,
      workspaceDir: resolvedWorkspace,
      copiedFiles,
      baselineHashes,
      totalBytes,
    };
  } catch (originalError) {
    if (workspaceDirIsOwnFreshTempDir) {
      const rmSyncImpl = options.rmSyncImpl || fs.rmSync;
      try {
        rmSyncImpl(workspaceDir, { recursive: true, force: true, maxRetries: 2 });
      } catch (cleanupError) {
        // Ein Cleanup-Fehler darf den ursprünglichen Sicherheitsfehler nicht
        // verschleiern (er bleibt die geworfene Fehlermeldung), muss aber
        // nachvollziehbar bleiben – siehe Kopfkommentar.
        originalError.workspaceCleanupError = String((cleanupError && cleanupError.message) || cleanupError);
        originalError.workspaceDirLeftBehind = workspaceDir;
      }
    }
    throw originalError;
  }
}

// Vergleicht den Workspace nach dem Codex-Lauf gegen die vor dem Lauf
// erfassten Hashes. Ein Read-Only-Sandboxmodus SOLL bereits jede Änderung
// verhindern – diese Funktion ist die davon unabhängige, zweite
// Prüfschicht (siehe Kopfkommentar). Ein nichtleeres Ergebnis ist immer ein
// Sicherheitsbefund, niemals ein normaler Erfolgsfall.
function verifyWorkspaceUnchanged(workspaceDir, baselineHashes, options = {}) {
  const readFileSyncImpl = options.readFileSyncImpl || fs.readFileSync;
  const existsSyncImpl = options.existsSyncImpl || fs.existsSync;
  const readdirSyncImpl = options.readdirSyncImpl || fs.readdirSync;
  const changed = [];

  Object.keys(baselineHashes).forEach((relativePath) => {
    const absolutePath = path.join(workspaceDir, relativePath);
    if (!existsSyncImpl(absolutePath)) {
      changed.push(`${relativePath} (gelöscht)`);
      return;
    }
    const buffer = readFileSyncImpl(absolutePath);
    if (sha256Hex(buffer) !== baselineHashes[relativePath]) {
      changed.push(`${relativePath} (Inhalt verändert)`);
    }
  });

  // Zusätzlich auf unerwartete NEUE Dateien im Wurzelverzeichnis prüfen
  // (flacher Scan reicht: allowedFiles legen bereits alle erlaubten
  // Unterverzeichnisse fest, ein Codex-Lauf im Read-Only-Sandboxmodus kann
  // ohnehin nichts schreiben – dies ist ausschließlich Verteidigung in der
  // Tiefe).
  let topLevelEntries = [];
  try {
    topLevelEntries = readdirSyncImpl(workspaceDir);
  } catch (_error) {
    topLevelEntries = [];
  }
  const expectedTopLevel = new Set(Object.keys(baselineHashes).map((relativePath) => relativePath.split("/")[0]));
  topLevelEntries.forEach((entry) => {
    if (!expectedTopLevel.has(entry)) {
      changed.push(`${entry} (unerwartet neu)`);
    }
  });

  return [...new Set(changed)];
}

function cleanupWorkspace(workspaceDir, options = {}) {
  if (!workspaceDir) return;
  const rmSyncImpl = options.rmSyncImpl || fs.rmSync;
  try {
    rmSyncImpl(workspaceDir, { recursive: true, force: true, maxRetries: 2 });
  } catch (_error) {
    /* best effort cleanup – niemals einen Cleanup-Fehler den Aufrufer werfen lassen */
  }
}

module.exports = {
  FORBIDDEN_PATH_SEGMENTS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  assertSafeAllowedRelativePath,
  createIsolatedReadOnlyWorkspace,
  verifyWorkspaceUnchanged,
  cleanupWorkspace,
};
