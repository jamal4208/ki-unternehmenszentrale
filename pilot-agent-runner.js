"use strict";

// KI-Unternehmenszentrale-Pilotbetrieb – Phase 6 ("technische
// Agentenlauf-Infrastruktur mit lokalem deterministischem Read-Only-Runner").
//
// Ehrliche Einordnung: Dies ist KEIN echter KI-/Codex-Agentenlauf. Es ist
// der tatsächlich aufgerufene, technisch ausführende, lokale deterministische
// Read-Only-Runner für einen einzelnen Pilot-Agentenlauf. Kein KI-Modellaufruf,
// kein externer Agenten-Runner. Er ist bewusst KEINE zweite
// Execution-Plattform neben execution-bridge.js: execution-bridge.js ist auf
// isolierte, dateiverändernde Code-Ausführung gegen Health/Fixture-Projekte
// zugeschnitten (Workspace-Materialisierung, Diff, Test, Apply-Gate). Der
// Pilot-Agentenlauf in dieser Phase erzeugt dagegen ein rein lesendes,
// strukturiertes TEXT-Ergebnis (keine Datei wird verändert, kein Diff, kein
// Apply). Für diese Aufgabe ist die bestehende Bridge nicht die passende
// Abstraktion; siehe Abschlussbericht Phase 6, Abschnitt 3.
//
// Dieser Runner:
//   - ruft NIEMALS ein KI-Modell, Codex oder ein Netzwerk auf,
//   - startet NIEMALS einen Kindprozess oder eine Shell,
//   - liest AUSSCHLIESSLICH die ihm explizit übergebenen, bereits
//     serverseitig geprüften Dateien read-only vom Datenträger,
//   - schreibt NIE eine Datei, NIE einen Commit, NIE einen Push.
//
// Das Ergebnis wird bei jedem Aufruf tatsächlich aus dem aktuellen Inhalt
// der übergebenen Dateien berechnet (Byte-/Zeilenzahl, SHA-256, Anzahl
// benannter Funktionsdefinitionen, Anzahl exportierter Schnittstellen) –
// nicht aus einer festen, im Code hinterlegten Beispielausgabe. Ändert sich
// eine der Dateien, ändert sich auch das Ergebnis dieses Runners.
//
// Korrekturlauf vor Commit (Korrektur 5, "Runtime-Einordnung"):
// agent-runtime.js verwendet für den bestehenden Morgenbriefing-/
// Tagesablauf bereits die ehrliche Kennzeichnung LOCAL_DETERMINISTIC_PILOT.
// Dieser Runner folgt bewusst derselben Benennungsdisziplin: lokal,
// deterministisch, kein Modellaufruf. execution-bridge.js bleibt für
// dateiverändernde, isolierte Code-Ausführung (Workspace-Materialisierung,
// Diff, Test, Apply-Gate) zuständig; ihre Nichtverwendung hier ist bewusst,
// weil dieser Anwendungsfall ausschließlich lesend und textbasiert ist
// (siehe Kopfkommentar). Eine echte Codex-/KI-Anbindung (z. B. über
// execution-codex-adapter.js) ist ausdrücklich NICHT Teil dieses Commits.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RUNNER_ID = "local-read-only-repo-analysis";
const RUNNER_LABEL =
  "Lokaler, deterministischer Read-Only-Repository-Analyse-Runner (kein Netzwerk, kein Modellaufruf, kein Codex).";

function assertSafeRelativeFilePath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Ungültiger Dateipfad: leer.");
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (path.isAbsolute(normalized) || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Absoluter Pfad ist nicht erlaubt: ${value}`);
  }
  if (normalized.split("/").includes("..")) {
    throw new Error(`Pfad-Traversierung ist nicht erlaubt: ${value}`);
  }
  if (normalized.includes("\0")) {
    throw new Error("Ungültiges Nullbyte im Pfad.");
  }
  return normalized;
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function countModuleExportsKeys(text) {
  const match = text.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\};/);
  if (!match) return 0;
  return (match[1].match(/^\s*[A-Za-z0-9_]+\s*[,:]/gm) || []).length;
}

// Liest genau eine erlaubte Datei read-only und berechnet reale,
// inhaltsabhängige Kennzahlen. Wirft, wenn der Zielpfad nach Auflösung
// außerhalb von repoRoot liegt (Symlink-Flucht o. Ä.) – niemals ein
// stilles Ignorieren.
async function readAllowedFileFacts(repoRoot, relativePath) {
  const safeRelativePath = assertSafeRelativeFilePath(relativePath);
  const resolvedRoot = fs.realpathSync(repoRoot);
  const candidateAbsolutePath = path.join(resolvedRoot, safeRelativePath);
  let resolvedFile;
  try {
    resolvedFile = fs.realpathSync(candidateAbsolutePath);
  } catch (_error) {
    return { path: safeRelativePath, exists: false };
  }
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Datei außerhalb des erlaubten Projektbereichs abgelehnt: ${relativePath}`);
  }
  const stat = fs.statSync(resolvedFile);
  if (!stat.isFile()) {
    return { path: safeRelativePath, exists: false };
  }
  // Bewusster Yield an die Event-Loop: macht echte Nebenläufigkeit zwischen
  // zwei gleichzeitig gestarteten Agentenläufen für Tests beobachtbar (siehe
  // pilot-agent-execution.test.js, "zweiter Start während aktivem Lauf").
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const buffer = fs.readFileSync(resolvedFile);
  const text = buffer.toString("utf8");
  return {
    path: safeRelativePath,
    exists: true,
    byteLength: buffer.length,
    lineCount: text.split(/\r?\n/).length,
    sha256: sha256Hex(buffer),
    functionCount: (text.match(/\bfunction\s+[A-Za-z0-9_]+\s*\(/g) || []).length,
    moduleExportsKeyCount: countModuleExportsKeys(text),
  };
}

// Führt genau eine Read-Only-Repository-Analyseaufgabe aus. `allowedFiles`
// ist bereits serverseitig aus einem festen Preset bestimmt
// (pilot-agent-execution-service.js) – dieser Runner erweitert die Menge
// der gelesenen Dateien niemals eigenständig.
async function runPilotAgentAnalysisTask(input = {}) {
  const repoRoot = input.repoRoot;
  const allowedFiles = input.allowedFiles;
  const taskTitle = String(input.taskTitle || "").trim();
  const taskInstructions = String(input.taskInstructions || "").trim();

  if (typeof repoRoot !== "string" || !repoRoot) {
    throw new Error("repoRoot ist erforderlich.");
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error("allowedFiles ist erforderlich und darf nicht leer sein.");
  }

  const facts = [];
  for (const relativePath of allowedFiles) {
    // eslint-disable-next-line no-await-in-loop
    const fact = await readAllowedFileFacts(repoRoot, relativePath);
    facts.push(fact);
  }

  const existingFacts = facts.filter((fact) => fact.exists);
  if (existingFacts.length === 0) {
    return {
      ok: false,
      failed: true,
      errorMessage: "Keine der erlaubten Dateien konnte gelesen werden. Kein Ergebnis erzeugt.",
      facts,
    };
  }

  const totalLines = existingFacts.reduce((sum, fact) => sum + fact.lineCount, 0);
  const totalFunctions = existingFacts.reduce((sum, fact) => sum + fact.functionCount, 0);
  const totalExportedKeys = existingFacts.reduce((sum, fact) => sum + fact.moduleExportsKeyCount, 0);
  const filesWithExports = existingFacts.filter((fact) => fact.moduleExportsKeyCount > 0).length;
  const largestFile = existingFacts.slice().sort((a, b) => b.byteLength - a.byteLength)[0];

  const observations = [
    `Beobachtung 1: Die ${existingFacts.length} tatsächlich gelesene(n) Datei(en) (${existingFacts
      .map((fact) => fact.path)
      .join(", ")}) umfassen zusammen ${totalLines} Zeilen und enthalten insgesamt ${totalFunctions} benannte ` +
      'Funktionsdefinitionen (Muster "function name(").',
    `Beobachtung 2: Die größte analysierte Datei ist "${largestFile.path}" mit ${largestFile.byteLength} Bytes ` +
      `(SHA-256 ${largestFile.sha256.slice(0, 16)}…) und ${largestFile.lineCount} Zeilen.`,
    `Beobachtung 3: ${filesWithExports} von ${existingFacts.length} analysierten Datei(en) exportieren über ` +
      `module.exports insgesamt ${totalExportedKeys} benannte Schnittstellen.`,
  ];

  const recommendation =
    totalFunctions > 40
      ? "Empfehlung: Die geprüfte Pilot-Auftragsstruktur ist bereits umfangreich (mehr als 40 Funktionen in den " +
        "geprüften Kerndateien). Nächster sinnvoller technischer Schritt ist die gezielte Konsolidierung " +
        "wiederkehrender Muster (z. B. Statusübergänge, Fehlerbehandlung), nicht das Hinzufügen weiterer Funktionalität."
      : "Empfehlung: Die geprüfte Pilot-Auftragsstruktur ist noch kompakt. Nächster sinnvoller technischer Schritt " +
        "ist die gezielte Ergänzung des jeweils fehlenden Bausteins, ohne die bestehende Struktur zu verändern.";

  const resultText = [
    `# Bestandsaufnahme: ${taskTitle}`,
    "",
    taskInstructions,
    "",
    ...observations,
    "",
    recommendation,
  ].join("\n");

  return {
    ok: true,
    failed: false,
    facts,
    observations,
    recommendation,
    resultText,
  };
}

module.exports = {
  RUNNER_ID,
  RUNNER_LABEL,
  assertSafeRelativeFilePath,
  readAllowedFileFacts,
  runPilotAgentAnalysisTask,
};
