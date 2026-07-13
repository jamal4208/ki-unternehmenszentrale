"use strict";

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const REQUIRED_CREATE_OPTIONS = [
  "getRoutes",
  "staticAssets",
  "rootDir",
  "sendJson",
  "sendText",
  "methodNotAllowedPayload",
];

function assertCreateOptions(options) {
  if (!options || typeof options !== "object") {
    throw new Error("createHttpRouter benötigt ein Optionsobjekt.");
  }
  REQUIRED_CREATE_OPTIONS.forEach((key) => {
    if (!(key in options)) {
      throw new Error(`createHttpRouter: Pflichtoption "${key}" fehlt.`);
    }
  });
  if (!(options.getRoutes instanceof Map)) {
    throw new Error("createHttpRouter: getRoutes muss eine Map sein.");
  }
  if (!(options.staticAssets instanceof Map)) {
    throw new Error("createHttpRouter: staticAssets muss eine Map sein.");
  }
  if (typeof options.sendJson !== "function" || typeof options.sendText !== "function") {
    throw new Error("createHttpRouter: sendJson und sendText müssen Funktionen sein.");
  }
}

function buildRouteMap(routeEntries) {
  if (!Array.isArray(routeEntries)) {
    throw new Error("buildRouteMap benötigt ein Array von [Pfad, Handler]-Einträgen.");
  }
  const map = new Map();
  routeEntries.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      throw new Error("buildRouteMap: jeder Eintrag muss [Pfad, Handler] sein.");
    }
    const [routePath, handler] = entry;
    if (typeof routePath !== "string" || !routePath.startsWith("/")) {
      throw new Error(`buildRouteMap: ungültiger Routenpfad "${routePath}".`);
    }
    if (map.has(routePath)) {
      throw new Error(`buildRouteMap: doppelte Route "${routePath}".`);
    }
    if (typeof handler !== "function") {
      throw new Error(`buildRouteMap: Handler für "${routePath}" muss eine Funktion sein.`);
    }
    map.set(routePath, handler);
  });
  return map;
}

function validateUniqueRoutePaths(getRoutes) {
  const seen = new Set();
  getRoutes.forEach((_handler, routePath) => {
    if (typeof routePath !== "string" || !routePath.startsWith("/")) {
      throw new Error(`createHttpRouter: ungültiger Routenpfad "${routePath}".`);
    }
    if (seen.has(routePath)) {
      throw new Error(`createHttpRouter: doppelte Route "${routePath}".`);
    }
    seen.add(routePath);
  });
}

function validateStaticAssets(staticAssets) {
  staticAssets.forEach((fileName, assetPath) => {
    if (typeof assetPath !== "string" || !assetPath.startsWith("/")) {
      throw new Error(`createHttpRouter: ungültiger statischer Pfad "${assetPath}".`);
    }
    if (typeof fileName !== "string" || !fileName.trim()) {
      throw new Error(`createHttpRouter: ungültiger Dateiname für "${assetPath}".`);
    }
    if (fileName.includes("..") || assetPath.includes("..")) {
      throw new Error(`createHttpRouter: Pfad-Traversierung ist nicht erlaubt (${assetPath}).`);
    }
  });
}

function normalizeRequestPathname(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) {
    return null;
  }
  if (pathname.includes("..") || pathname.includes("\\")) {
    return null;
  }
  return pathname;
}

function getMimeType(fileName) {
  if (fileName.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (fileName.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "application/javascript; charset=utf-8";
}

function createHttpRouter(options) {
  assertCreateOptions(options);
  validateUniqueRoutePaths(options.getRoutes);
  validateStaticAssets(options.staticAssets);

  const routePrefixHandlers = Array.isArray(options.routePrefixHandlers)
    ? options.routePrefixHandlers
    : [];
  const onInternalError =
    typeof options.onInternalError === "function"
      ? options.onInternalError
      : (res, sendJson) => {
          sendJson(res, 500, {
            ok: false,
            message: "Interner Serverfehler.",
          });
        };

  function serveStatic(reqPath, res) {
    const normalizedPath = normalizeRequestPathname(reqPath);
    if (!normalizedPath) {
      options.sendText(res, 404, "Not found");
      return;
    }

    const fileName = options.staticAssets.get(normalizedPath);
    if (!fileName) {
      options.sendText(res, 404, "Not found");
      return;
    }

    const filePath = path.join(options.rootDir, fileName);
    const resolvedRoot = path.resolve(options.rootDir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      options.sendText(res, 404, "Not found");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        options.sendText(res, 500, "File could not be read");
        return;
      }

      res.writeHead(200, {
        "Content-Type": getMimeType(fileName),
        "Cache-Control": "no-store",
      });
      res.end(content);
    });
  }

  function requestHandler(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = normalizeRequestPathname(requestUrl.pathname);

    if (req.method !== "GET") {
      options.sendJson(res, 405, options.methodNotAllowedPayload);
      return;
    }

    if (!pathname) {
      options.sendText(res, 404, "Not found");
      return;
    }

    const routeHandler = options.getRoutes.get(pathname);
    if (routeHandler) {
      try {
        routeHandler(res, { requestUrl, pathname, req });
      } catch (_error) {
        onInternalError(res, options.sendJson);
      }
      return;
    }

    for (const prefixHandler of routePrefixHandlers) {
      if (
        prefixHandler &&
        typeof prefixHandler.prefix === "string" &&
        pathname.startsWith(prefixHandler.prefix) &&
        typeof prefixHandler.handler === "function"
      ) {
        try {
          prefixHandler.handler(res, { requestUrl, pathname, req });
        } catch (_error) {
          onInternalError(res, options.sendJson);
        }
        return;
      }
    }

    serveStatic(pathname, res);
  }

  return {
    requestHandler,
    serveStatic,
    getRegisteredRouteCount() {
      return options.getRoutes.size;
    },
    getRegisteredStaticAssetCount() {
      return options.staticAssets.size;
    },
  };
}

module.exports = {
  createHttpRouter,
  buildRouteMap,
  normalizeRequestPathname,
  getMimeType,
};
