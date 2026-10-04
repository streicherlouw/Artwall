"use strict";
const { WebSocketServer, WebSocket } = require("ws");
const { timingSafeEqual } = require("node:crypto");
const { loadSource, dayKey } = require("./sources");
const { pages, gridOptions } = require("./board");
function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Expected a JSON object");
  if (message.type === "clear") return { type: "clear" };
  if (message.type !== "message") throw new Error("type must be message or clear");
  if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 4000) throw new Error("text must contain 1–4000 characters");
  const duration = message.duration === undefined ? 60000 : message.duration;
  if (!Number.isInteger(duration) || duration < 1000 || duration > 86400000) throw new Error("duration must be 1000–86400000 milliseconds");
  return { type: "message", text: message.text, duration };
}
class Service {
  constructor(config, emit, report = console.warn, loader = loadSource) {
    this.config = config;
    this.emit = emit;
    this.report = report;
    this.loader = loader;
    this.sources = (config.sources || []).filter(source => source.enabled !== false).map(source => ({ source, items: [], next: 0, day: null }));
    this.index = 0;
    this.current = config.welcomeMessage || "HELLO, WORLD.\nMAKE YOURSELF AT HOME.";
    this.override = null;
    this.closed = false;
  }
  start() {
    this.emit(this.current);
    this.schedule();
    void this.refresh();
    this.refreshTimer = setInterval(() => { void this.refresh(); }, 60000);
    const ws = { enabled: true, host: "127.0.0.1", port: 8765, tokenEnv: "SPLITFLAP_TOKEN", ...this.config.websocket };
    if (ws.enabled) this.startWebSocket(ws);
  }
  schedule() {
    clearTimeout(this.rotationTimer);
    const { columns, rows } = gridOptions(this.config);
    const readingTime = pages(this.current, columns, rows).length * Math.max(2000, Number(this.config.pageDuration) || 10000);
    this.rotationTimer = setTimeout(() => { this.rotate(); }, Math.max(3000, Number(this.config.rotationInterval) || 30000, readingTime));
  }
  rotate() {
    if (this.closed) return;
    if (!this.override) {
      // Interleave providers so a large news feed cannot starve the daily quote.
      const pool = [];
      const count = Math.max(0, ...this.sources.map(state => state.items.length));
      for (let i = 0; i < count; i++) for (const state of this.sources) if (state.items[i]) pool.push(state.items[i]);
      this.current = pool.length ? pool[this.index++ % pool.length] : (this.config.welcomeMessage || "HELLO, WORLD.");
      this.emit(this.current);
    }
    this.schedule();
  }
  async refresh() {
    await Promise.allSettled(this.sources.map(async state => {
      const now = Date.now();
      const today = dayKey();
      const daily = ["quote", "history"].includes(state.source.type);
      if (state.loading || now < state.next && (!daily || state.day === today)) return;
      state.loading = true;
      const refreshInterval = Math.max(300000, Number(state.source.refreshInterval) || (daily ? 3600000 : 900000));
      // Set the retry boundary before I/O; a failed source never empties good content.
      state.next = now + refreshInterval;
      state.day = today;
      try {
        const items = await this.loader(state.source);
        if (!Array.isArray(items) || !items.length) throw new Error("Source returned no content");
        if (this.closed) return;
        const first = !this.sources.some(other => other.items.length);
        state.items = items;
        if (first && !this.override) this.rotate();
      } catch (error) {
        if (!this.closed) this.report(`${state.source.type}: ${error.message}`);
      } finally { state.loading = false; }
    }));
  }
  receive(input) {
    const message = validateMessage(input);
    clearTimeout(this.overrideTimer);
    if (message.type === "clear") {
      this.override = null;
      this.rotate();
    } else {
      this.override = message;
      this.emit(message.text);
      this.overrideTimer = setTimeout(() => { this.override = null; this.rotate(); }, message.duration);
    }
    return { ok: true, type: message.type, instanceId: this.config.instanceId || "main" };
  }
  startWebSocket(options) {
    const token = process.env[options.tokenEnv] || "";
    if (!["127.0.0.1", "::1", "localhost"].includes(options.host) && token.length < 16) {
      this.report(`WebSocket disabled: set ${options.tokenEnv} to at least 16 characters for a network listener`);
      return;
    }
    this.server = new WebSocketServer({ host: options.host, port: options.port, maxPayload: 16384, perMessageDeflate: false,
      verifyClient: ({ req }, done) => {
        // Browser origins require an explicit allowlist, including on loopback.
        if (req.headers.origin && !(options.allowedOrigins || []).includes(req.headers.origin)) return done(false, 403, "Origin denied");
        const supplied = req.headers.authorization || "";
        const expected = `Bearer ${token}`;
        const accepted = !token || (Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
        done(accepted, accepted ? 101 : 401);
      }
    });
    this.server.on("error", error => this.report(`WebSocket: ${error.message}`));
    this.server.on("connection", socket => {
      socket.alive = true;
      socket.on("pong", () => { socket.alive = true; });
      socket.on("error", () => {});
      let windowStart = Date.now(); let count = 0;
      socket.on("message", (data, binary) => {
        try {
          if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
          if (++count > 10) throw new Error("Rate limit: 10 messages per second");
          if (binary) throw new Error("Send text JSON, not binary");
          const message = JSON.parse(data.toString());
          if (message.instanceId && message.instanceId !== (this.config.instanceId || "main")) throw new Error("Unknown instanceId");
          socket.send(JSON.stringify(this.receive(message)));
        } catch (error) {
          socket.send(JSON.stringify({ ok: false, error: error instanceof SyntaxError ? "Invalid JSON" : error.message }));
        }
      });
    });
    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.server.clients) {
        if (!socket.alive) { socket.terminate(); continue; }
        socket.alive = false;
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }
    }, 30000);
  }
  stop() {
    this.closed = true;
    clearTimeout(this.rotationTimer); clearTimeout(this.overrideTimer);
    clearInterval(this.refreshTimer); clearInterval(this.heartbeatTimer);
    if (this.server) { for (const client of this.server.clients) client.terminate(); this.server.close(); }
  }
}
module.exports = { Service, validateMessage };
