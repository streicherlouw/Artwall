"use strict";
const { portalInfo } = require("../../../common/config");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { gridOptions } = require("../lib/board");
const { timingSafeEqual } = require("node:crypto");
function createWebServer(settings = {}, dispatch, log = () => {}) {
  const config = { host: "0.0.0.0", port: 8766, authRequired: false, tokenEnv: "SPLITFLAP_WEB_TOKEN", ...settings };
  const token = config.authRequired ? (process.env[config.tokenEnv] || "") : "";
  if (config.authRequired && token.length < 16) throw new Error("Web authentication requires an access key of at least 16 characters");
  const assets = { "/": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/style.css": ["style.css", "text/css"], "/board.js": ["../../lib/board.js", "text/javascript"], "/designer.js": ["designer.js", "text/javascript"], "/font.ttf": ["font.ttf", "font/ttf"] };
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.method === "GET" && assets[req.url]) {
      const [file, type] = assets[req.url]; res.writeHead(200, { "Content-Type": type });
      res.end(fs.readFileSync(path.join(__dirname, "web", file))); return;
    }
    if (req.method === "GET" && req.url === "/api/portal") return json(200, portalInfo());
    if (req.method === "GET" && req.url === "/api/config") return json(200, { authRequired: Boolean(config.authRequired), ...gridOptions(config), align: config.align || "center" });
    if (!['/api/status','/api/message','/api/end'].includes(req.url)) return json(404, { ok: false, error: "Not found" });
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (token && !(supplied.length === expected.length && timingSafeEqual(supplied, expected))) return json(401, { ok: false, error: "Enter the display access key" });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return json(403, { ok: false, error: "Origin denied" }); }
      catch { return json(403, { ok: false, error: "Origin denied" }); }
    }
    try {
      if (req.url === "/api/status" && req.method === "GET") return json(200, await dispatch({ type: "status" }));
      if (req.url === "/api/end" && req.method === "POST") return json(200, await dispatch({ type: "deactivate" }));
      if (req.url !== "/api/message" || req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
      const contentType = req.headers["content-type"] || "";
      const isJson = /^application\/json(?:;|$)/i.test(contentType);
      const isForm = /^application\/x-www-form-urlencoded(?:;|$)/i.test(contentType);
      if (!isJson && !isForm) return json(415, { ok: false, error: "Use application/json or application/x-www-form-urlencoded" });
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { json(413, { ok: false, error: "Message too large" }); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      const message = isJson ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Expected a message object");
      if (isForm && message.powerOffAfterMs !== undefined) message.powerOffAfterMs = Number(message.powerOffAfterMs);
      for (const option of ["beautify", "sound"]) {
        if (isForm && message[option] !== undefined) {
          if (!["true", "false"].includes(message[option])) throw new Error(option + " must be true or false");
          message[option] = message[option] === "true";
        }
      }
      if (message.type === undefined) message.type = "message";
      if (!["message", "activate", "deactivate", "clear", "power-off"].includes(message?.type)) throw new Error("Unknown command");
      return json(200, await dispatch(message));
    } catch (error) { if (!res.writableEnded) json(400, { ok: false, error: error instanceof SyntaxError ? "Invalid JSON" : error.message }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(config.port, config.host, () => log(`Message page: http://${config.host}:${server.address().port}`));
  return server;
}
module.exports = { createWebServer };
