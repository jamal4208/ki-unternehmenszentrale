"use strict";

// V7.6.1 – Apple-first/Google-controlled Office-, Google-Workspace- und
// Finance-Korridor vollständig offline vorbereiten (Auftrag Abschnitt Q).
//
// Dieser Connector ist AUSDRÜCKLICH KEIN echter HTTP-Client. Er besitzt
// keine Tokens, keine OAuth-Logik, keinen Netzwerkaufruf (kein http/https/
// fetch) und keine Zugangsdaten. Er erhält NIEMALS eine echte, injizierbare
// Providerfunktion in V7.6.1 – providerFn bleibt technisch vorbereitet
// (Dependency-Injection-Punkt für einen SPÄTEREN, separat freizugebenden
// Schritt), wird aber in diesem Lauf an keiner Stelle des Codes mit einer
// echten Implementierung aufgerufen.
//
// callGoogleWorkspaceStub(...) liefert IMMER eine deterministische,
// eindeutig als Stub gekennzeichnete Antwort und niemals eine echte
// Google-ID (siehe STUB_ID_PREFIX). Jeder Aufruf wird ausschließlich lokal
// ausgeführt.

const STUB_ID_PREFIX = "stub-offline-";

class GoogleWorkspaceConnectorError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleWorkspaceConnectorError";
  }
}

function assertNoRealProviderFunctionInjectedYet(providerFn) {
  // V7.6.1: an dieser Stelle darf niemals eine echte Providerfunktion
  // übergeben werden. Der Parameter existiert ausschließlich als künftiger
  // Erweiterungspunkt (Auftrag: "erhält später eine injizierbare
  // Providerfunktion").
  if (typeof providerFn === "function") {
    throw new GoogleWorkspaceConnectorError(
      "V7.6.1 erlaubt keine echte, injizierte Google-Workspace-Providerfunktion. Dieser Lauf bleibt vollständig offline.",
    );
  }
}

function deterministicStubId(seedText) {
  let hash = 0;
  const text = String(seedText || "offline");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${STUB_ID_PREFIX}${hash.toString(16)}`;
}

// Einziger Aufrufpunkt dieses Connectors. options.providerFn MUSS in
// V7.6.1 undefined bleiben (siehe assertNoRealProviderFunctionInjectedYet).
// Ohne providerFn liefert die Funktion ausschließlich eine lokale,
// deterministische Stub-Antwort – niemals eine echte Providerantwort.
function callGoogleWorkspaceStub(operation, payload = {}, options = {}) {
  assertNoRealProviderFunctionInjectedYet(options.providerFn);
  return Object.freeze({
    isStub: true,
    isRealProviderCall: false,
    operation: String(operation || "UNKNOWN_OPERATION"),
    stubReferenceId: deterministicStubId(`${operation}::${JSON.stringify(payload)}`),
    receivedAtOffline: true,
    networkCallMade: false,
    tokensUsed: false,
    oauthPerformed: false,
    note: "Offline-Stub gemäß V7.6.1 – keine echte Google-Workspace-Aktion wurde ausgeführt.",
  });
}

function buildConnectorStatus() {
  return Object.freeze({
    connectorType: "GOOGLE_WORKSPACE_STUB",
    isHttpClient: false,
    hasTokens: false,
    hasOAuthLogic: false,
    networkAccessPossible: false,
    realProviderFunctionInjected: false,
    canProduceRealGoogleId: false,
    stubIdPrefix: STUB_ID_PREFIX,
    laterActivationRequiresSeparateApproval: true,
  });
}

module.exports = {
  GoogleWorkspaceConnectorError,
  STUB_ID_PREFIX,
  callGoogleWorkspaceStub,
  buildConnectorStatus,
};
