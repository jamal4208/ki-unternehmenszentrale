#!/usr/bin/env node
"use strict";

// V7.2 Phase A Schritt 3 (Auftrag Abschnitt K) – Owner-Bootstrap.
//
// Lokales CLI-Kommando (`npm run auth:bootstrap-owner`), KEINE HTTP-Route.
// Zweck: das allererste OWNER-Konto lokal anlegen bzw. sein Passwort
// rotieren, damit sich Jamal am Kundenportal-/Owner-Bereich anmelden kann,
// bevor irgendein anderes Konto existiert.
//
// Verbindliche Grenzen (Auftrag Abschnitt K):
// - kein statisches/eingebettetes Standardpasswort im Code
// - Passwort wird ausschließlich interaktiv (verdeckte Eingabe) oder über
//   stdin abgefragt, niemals als Kommandozeilenargument (Shell-Historie!)
// - idempotent: erneuter Aufruf mit derselben E-Mail-Adresse legt kein
//   zweites Konto an, sondern rotiert bei Bedarf ausschließlich das
//   Passwort des bestehenden OWNER-Kontos
// - schreibt einen Audit-Eintrag (USER_CREATED bzw. PASSWORD_CHANGED)
// - gibt niemals das Passwort oder den Passwort-Hash aus

const readline = require("readline");

const authDb = require("../auth-db");
const authAudit = require("../auth-audit");
const authPassword = require("../auth-password");

function printUsageAndExit(message) {
  if (message) {
    console.error(message);
  }
  console.error("Verwendung: npm run auth:bootstrap-owner -- --email owner@beispiel.de");
  console.error("Das Passwort wird danach interaktiv (verdeckt) abgefragt.");
  process.exit(1);
}

function parseArgs(argv) {
  const result = { email: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email" && argv[i + 1]) {
      result.email = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

function isLikelyEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Verdeckte Passworteingabe im Terminal. Verwendet bewusst EIN eigenes
// Zeilen-Warteschlangen-Muster statt der eingebauten `rl.question()`-
// Methode: `rl.question()` hält jeweils nur EINEN Callback-Slot vor. Bei
// nicht-interaktivem, gepipetem stdin (automatisierte lokale Abnahmetests,
// siehe Auftrag Abschnitt Q) können beide Passwortzeilen in einem einzigen
// 'data'-Chunk ankommen und beide 'line'-Ereignisse synchron ausgelöst
// werden, bevor der zweite `await` fortgesetzt wird – ohne eigene
// Warteschlange ginge die zweite Zeile dabei verloren (kein registrierter
// Callback zum Zeitpunkt des Ereignisses). Die Warteschlange puffert jede
// 'line' sofort und liefert sie an den nächsten `question()`-Aufruf aus,
// unabhängig von Chunk-/Tick-Grenzen. Maskierung (Sternchen statt Klartext)
// erfolgt ausschließlich, wenn stdout an ein echtes Terminal angeschlossen
// ist; bei gepipetem stdin/stdout (Skripttest) bleibt die Eingabe
// unmaskiert, aber niemals vorbelegt oder aus dem Code erraten – es gibt
// kein Standardpasswort.
function createPasswordPrompter() {
  const isInteractiveTty = process.stdin.isTTY === true;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isInteractiveTty,
  });

  // Nicht-interaktiver Zweig (gepipetes stdin, z. B. automatisierte lokale
  // Abnahmetests, Auftrag Abschnitt Q): eigene Zeilen-Warteschlange statt
  // `rl.question()`, weil bei bereits vollständig gepuffertem Mehrzeilen-
  // Input beide 'line'-Ereignisse synchron feuern können, bevor der zweite
  // `await` fortgesetzt wird – ohne Warteschlange ginge die zweite Zeile
  // verloren. Keine Maskierung möglich/nötig ohne echtes Terminal.
  const lineQueue = [];
  const waiters = [];
  let ended = false;
  if (!isInteractiveTty) {
    rl.on("line", (line) => {
      if (waiters.length > 0) {
        waiters.shift()(line);
      } else {
        lineQueue.push(line);
      }
    });
    rl.on("close", () => {
      ended = true;
      while (waiters.length > 0) {
        waiters.shift()(null);
      }
    });
  }

  function nextLine() {
    if (lineQueue.length > 0) {
      return Promise.resolve(lineQueue.shift());
    }
    if (ended) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => waiters.push(resolve));
  }

  // Interaktiver Zweig (echtes Terminal): klassische `_writeToOutput`-
  // Maskierung. Sicher hier, weil ein Mensch pro Zeile tippt und erst nach
  // Eingabetaste die nächste Frage folgt – kein Risiko einer bereits
  // gepufferten zweiten Zeile.
  function questionMaskedTty(promptText) {
    return new Promise((resolve) => {
      let muted = false;
      const originalWriteToOutput = rl._writeToOutput.bind(rl);
      rl._writeToOutput = function maskedWrite(stringToWrite) {
        originalWriteToOutput(muted ? "*" : stringToWrite);
      };
      rl.question(promptText, (answer) => {
        rl._writeToOutput = originalWriteToOutput;
        resolve(answer);
      });
      muted = true;
    });
  }

  function question(promptText) {
    if (isInteractiveTty) {
      return questionMaskedTty(promptText);
    }
    process.stdout.write(promptText);
    return nextLine().then((line) => (line === null ? "" : line));
  }

  return {
    question,
    close() {
      rl.close();
    },
  };
}

async function readNewPasswordTwice(prompter) {
  const first = await prompter.question("Neues Owner-Passwort (mindestens 12 Zeichen): ");
  const second = await prompter.question("Passwort erneut eingeben: ");
  if (first !== second) {
    throw new Error("Die beiden Eingaben stimmen nicht überein.");
  }
  return first;
}

function auditSafe(db, event) {
  try {
    authAudit.recordAuditEvent(db, event);
  } catch (_error) {
    // Ein fehlgeschlagener Audit-Eintrag darf den Bootstrap nicht abbrechen;
    // die eigentliche Owner-Aktion ist an dieser Stelle bereits committet.
    console.error("[intern][auth-bootstrap-owner] Audit-Eintrag konnte nicht geschrieben werden.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isLikelyEmail(args.email)) {
    printUsageAndExit("Bitte eine gültige E-Mail-Adresse mit --email angeben.");
    return;
  }
  const emailNormalized = args.email.trim().toLowerCase();

  let opened;
  try {
    opened = authDb.openAuthDatabase({});
  } catch (error) {
    console.error(error && error.userMessage ? error.userMessage : "Authentifizierungsdatenbank konnte nicht geöffnet werden.");
    process.exit(1);
    return;
  }
  const { db } = opened;
  const prompter = createPasswordPrompter();

  try {
    const existing = authDb.getUserByEmailNormalized(db, emailNormalized);
    const now = new Date().toISOString();

    if (existing && existing.role !== "OWNER") {
      console.error(
        `Diese E-Mail-Adresse gehört bereits zu einem Konto mit der Rolle ${existing.role}. ` +
          "Owner-Bootstrap wird für dieses Konto nicht durchgeführt.",
      );
      process.exitCode = 1;
      return;
    }

    const newPassword = await readNewPasswordTwice(prompter);
    const policyResult = authPassword.validatePasswordPolicy(newPassword, { emailNormalized });
    if (!policyResult.ok) {
      console.error("Passwort erfüllt die Mindestanforderungen nicht:");
      policyResult.reasons.forEach((reason) => console.error(`  - ${reason}`));
      process.exitCode = 1;
      return;
    }
    const passwordHash = authPassword.hashPassword(newPassword);

    if (existing) {
      authDb.setPasswordHash(db, existing.id, passwordHash, now);
      authDb.resetFailedLoginCount(db, existing.id, now);
      if (existing.status !== "ACTIVE") {
        authDb.updateUserStatus(db, existing.id, "ACTIVE", now);
      }
      auditSafe(db, {
        eventType: "PASSWORD_CHANGED",
        result: "OK",
        actorUserId: existing.id,
        tenantId: null,
        timestamp: now,
        metadata: { routeName: "cli-auth-bootstrap-owner" },
      });
      console.log(`Owner-Konto ${emailNormalized} war bereits vorhanden – Passwort wurde aktualisiert.`);
      return;
    }

    const displayName = emailNormalized.split("@")[0] || "Owner";
    const created = authDb.createUser(db, {
      email: emailNormalized,
      displayName,
      role: "OWNER",
      tenantId: null,
      status: "ACTIVE",
      passwordHash,
      now,
    });
    auditSafe(db, {
      eventType: "USER_CREATED",
      result: "OK",
      actorUserId: created.id,
      tenantId: null,
      timestamp: now,
      metadata: { routeName: "cli-auth-bootstrap-owner", roleLabel: "Owner" },
    });
    console.log(`Owner-Konto ${emailNormalized} wurde angelegt.`);
  } finally {
    prompter.close();
    authDb.closeAuthDatabase(db);
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : "Owner-Bootstrap fehlgeschlagen.");
  process.exitCode = 1;
});
