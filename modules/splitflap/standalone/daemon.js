"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { once } = require("node:events");
const { timingSafeEqual } = require("node:crypto");
const { WebSocketServer } = require("ws");
const { DisplayPower } = require("./display-power");
const { createWebServer } = require("./web-server");
const { Controller } = require("./controller");
const { Service } = require("../lib/service");
const { pages, beautify, gridOptions } = require("../lib/board");
const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const config = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, "config.json"), "utf8"));
const runtime = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
const stateFile = path.join(runtime, "splitflap-state.json");
const airplayFile = config.airplayStatusFile || path.join(runtime, "airplay-receiver-status.json");
const log = message => console.log(`[SplitFlap] ${message}`);
function readState() { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } }
function airplayActive() {
  try { return ["STREAMING", "PIN", "STARTING"].includes(JSON.parse(fs.readFileSync(airplayFile, "utf8")).state); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

let sequence = Date.now();
let phase = "idle";
let temporary = false;
const power = new DisplayPower(config.displayPower, (command, args) => exec(command, args, {
  env: { ...process.env, XDG_RUNTIME_DIR: runtime, WAYLAND_DISPLAY: config.waylandDisplay || "wayland-0" }, timeout: 5000
}), () => writeState(phase));
function writeState(nextPhase) {
  phase = nextPhase;
  const state = { phase, temporary, sequence: ++sequence, restoreDisplayOff: power.restoreOff, updatedAt: new Date().toISOString() };
  fs.writeFileSync(stateFile + ".tmp", JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(stateFile + ".tmp", stateFile);
  log(`State: ${phase}`);
}
async function recover() {
  power.restoreOff = Boolean(readState().restoreDisplayOff);
  await power.restore(airplayActive());
  writeState("idle");
}
let child = null;
let childReady = false;
let shuttingDown = false;
let controller;
let server;
let heartbeat;
let airplayPoll;
let automatic;
let webServer;
let messageId = 0;
let sessionSound = false;
const settlements = new Map();
function failSettlements() { for (const fail of settlements.values()) fail(new Error("Renderer exited before settling")); settlements.clear(); }
const io = {
  writeState,
  setTemporary(value) { temporary = value; writeState(phase); },
  airplayActive,
  report: error => log(error.message),
  ownsDisplay: () => power.restoreOff,
  prepareDisplay: () => power.prepare(),
  powerOff: () => power.off(),
  restoreDisplay: async airplay => {
    await power.restore(airplay);
  },
  waitForScreen: () => delay(6000),
  blankDisplay: () => io.show("", true),
  // Hooks allow coordinated handoffs without requiring a background display process.
  async prepareHandoff() {
    // Allow PhotoFrame's ownership/control polls and 900 ms fade to finish
    // before mapping the opaque native window over it.
    if (temporary) {
      try {
        const photo = JSON.parse(fs.readFileSync(path.join(runtime, 'artwall-photoframe-state.json'), 'utf8'));
        if (['active', 'suspended'].includes(photo.phase)) await delay(2200);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  },
  async acquireDisplay() {},
  async releaseDisplay() {},
  async openRenderer() {
    const options = { ...gridOptions(config), fps: config.fps || 60, animate: config.animate !== false,
      flipDuration: config.flipDuration || 45, cadence: config.cadence || 50, pageDuration: config.pageDuration || 10000 };
    if (config.snapshotPath) options.snapshotPath = config.snapshotPath;
    const proc = spawn(config.pythonPath || "/usr/bin/python3", [path.join(__dirname, "renderer.py"), JSON.stringify(options)], {
      env: { ...process.env, ...(config.audioSink ? { SDL_AUDIODRIVER: "pulseaudio", PULSE_SINK: config.audioSink } : {}), SDL_VIDEODRIVER: "wayland", SDL_RENDER_DRIVER: "opengles2", WAYLAND_DISPLAY: config.waylandDisplay || "wayland-0", PYGAME_HIDE_SUPPORT_PROMPT: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    child = proc; childReady = false;
    proc.stdin.on("error", error => log(`Renderer input: ${error.message}`));
    proc.stderr.on("data", data => log(`Renderer: ${String(data).trim()}`));
    proc.on("error", error => log(`Renderer: ${error.message}`));
    proc.on("exit", (code, signal) => {
      const unexpected = child === proc;
      if (unexpected) { child = null; childReady = false; }
      failSettlements();
      log(`Renderer exited: ${code ?? signal}`);
      if (unexpected && !shuttingDown) void controller.dispatch({ type: "renderer-exit" }).catch(error => log(error.message));
    });
    await new Promise((resolve, reject) => {
      let pending = "";
      const timer = setTimeout(() => done(new Error("Renderer startup timed out")), 15000);
      const onExit = () => done(new Error("Renderer exited before ready"));
      const onError = error => done(error);
      function done(error) {
        clearTimeout(timer); proc.off("exit", onExit); proc.off("error", onError);
        if (error) reject(error); else resolve();
      }
      proc.once("exit", onExit); proc.once("error", onError);
      proc.stdout.on("data", data => {
        pending += data;
        const lines = pending.split("\n"); pending = lines.pop();
        for (const line of lines) {
          log(`Renderer: ${line}`);
          try {
            const event = JSON.parse(line);
            if (event.event === "ready") { childReady = true; done(); }
            if (event.event === "settled" && event.page === 0) settlements.get(event.id)?.();
          } catch { /* Non-JSON diagnostics. */ }
        }
      });
    });
  },
  async suspendRenderer() {
    if (child && childReady) child.stdin.write(JSON.stringify({type:'suspend'})+'\n');
  },
  async resumeRenderer() {
    if (child && childReady) child.stdin.write(JSON.stringify({type:'resume',sound:sessionSound})+'\n');
  },
  async closeRenderer() {
    const proc = child;
    child = null; childReady = false;
    if (!proc || !proc.pid || proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = once(proc, "exit").catch(() => {});
    proc.stdin.end('{"type":"quit"}\n');
    const kill = setTimeout(() => proc.kill("SIGKILL"), 2000);
    await exited; clearTimeout(kill);
  },
  show(text, instant = false, align = config.align, decorate = false, sound = sessionSound) {
    if (!child || !childReady) return Promise.reject(new Error("Renderer unavailable"));
    const { columns, rows } = gridOptions(config);
    sessionSound = Boolean(sound) && !instant;
    const id = ++messageId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Renderer did not settle in time")), 5000 + 80 * Math.max((config.flipDuration || 45) + 5, config.cadence || 50));
      const finish = error => { clearTimeout(timer); settlements.delete(id); if (error) reject(error); else resolve(); };
      settlements.set(id, finish);
      child.stdin.write(JSON.stringify({ type: "show", id, instant, sound: sessionSound, pages: decorate ? beautify(text, columns, rows) : pages(text, columns, rows, align) }) + "\n", error => { if (error) finish(error); });
    });
  },
  automaticText() { return automatic.current; }
};
async function start() {
  await recover();
  if (process.argv.includes("--recover")) return;
  controller = new Controller(io);
  automatic = new Service({ ...config, pageDuration: (config.pageDuration || 10000) + 80 * Math.max((config.flipDuration || 45) + 5, config.cadence || 50), websocket: { enabled: false } }, text => {
    if (controller.state === "active" && controller.mode === "auto" && childReady) {
      void io.show(text).catch(error => log(error.message));
    }
  }, log);
  automatic.start();
  const ws = { host: "127.0.0.1", port: 8765, tokenEnv: "SPLITFLAP_TOKEN", ...config.websocket };
  const token = process.env[ws.tokenEnv] || "";
  if (!["127.0.0.1", "::1", "localhost"].includes(ws.host) && token.length < 16) throw new Error("Network listener requires a token of at least 16 characters");
  server = new WebSocketServer({ host: ws.host, port: ws.port, maxPayload: 16384, perMessageDeflate: false,
    verifyClient: ({ req }, done) => {
      if (req.headers.origin && !(ws.allowedOrigins || []).includes(req.headers.origin)) return done(false, 403);
      const supplied = Buffer.from(req.headers.authorization || "");
      const expected = Buffer.from(`Bearer ${token}`);
      const ok = !token || supplied.length === expected.length && timingSafeEqual(supplied, expected);
      done(ok, ok ? 101 : 401);
    }
  });
  server.on("error", error => { log(error.message); void shutdown(1); });
  let pending = 0;
  async function command(message) {
    if (shuttingDown) throw new Error("Service stopping");
    if (pending >= 16) throw new Error("Control queue full");
    if (!["activate", "message", "deactivate", "clear", "status", "power-off"].includes(message?.type)) throw new Error("Unknown command");
    pending++;
    try { return await controller.dispatch(message); } finally { pending--; }
  }
  webServer = createWebServer({ ...config.web, ...gridOptions(config), align: config.align || "center" }, command, log);
  webServer.on("error", error => { log(error.message); void shutdown(1); });
  server.on("connection", socket => {
    if (server.clients.size > 16) { socket.close(1013, "Too many clients"); return; }
    socket.alive = true;
    socket.on("pong", () => { socket.alive = true; });
    socket.on("error", () => {});
    const reply = data => { if (socket.readyState === 1) socket.send(JSON.stringify(data)); };
    socket.on("message", async (data, binary) => {
      if (shuttingDown) return reply({ ok: false, error: "Service stopping" });
      if (pending >= 16) return reply({ ok: false, error: "Control queue full" });
      try {
        if (binary) throw new Error("Send JSON text");
        const message = JSON.parse(String(data));
        // Internal lifecycle events cannot be injected by a network client.
        if (!["activate", "message", "deactivate", "clear", "status", "power-off"].includes(message?.type)) throw new Error("Unknown command");
        reply(await command(message));
      } catch (error) { reply({ ok: false, error: error.message }); }
    });
  });
  heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false; socket.ping();
    }
  }, 30000);
  let preempting = false;
  airplayPoll = setInterval(() => {
    try {
      const active = airplayActive();
      const event = active && controller.state !== 'idle' && controller.state !== 'suspended'
        ? 'airplay' : !active && controller.state === 'suspended' ? 'airplay-ended' : null;
      if (event && !preempting) {
        preempting = true;
        void controller.dispatch({ type: event }).catch(error => log(error.message)).finally(() => { preempting = false; });
      }
    } catch (error) { log(`AirPlay status: ${error.message}`); }
  }, 250);
  await once(server, "listening");
  log(`Listening on ${ws.host}:${ws.port}; waiting for activation`);
}
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat); clearInterval(airplayPoll);
  automatic?.stop();
  webServer?.close();
  if (server) { for (const socket of server.clients) socket.terminate(); server.close(); }
  try { if (controller) await controller.dispatch({ type: "deactivate" }); }
  catch (error) { log(`Restore failed: ${error.message}`); code = 1; }
  process.exitCode = code;
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
start().catch(async error => { log(error.stack); await shutdown(1); });
