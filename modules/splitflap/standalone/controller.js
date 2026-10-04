"use strict";
class Controller {
  constructor(io) {
    this.io = io; this.state = "idle"; this.mode = "manual"; this.tail = Promise.resolve();
    this.generation = 0; this.timer = null; this.powerOffAt = null;
  }
  status() { return { ok: true, state: this.state, mode: this.mode, wokeDisplay: Boolean(this.io.ownsDisplay?.()), powerOffAt: this.powerOffAt }; }
  cancelExpiry() { clearTimeout(this.timer); this.timer = null; this.powerOffAt = null; this.generation++; }
  dispatch(message) {
    if (message?.type === "status") return Promise.resolve(this.status());
    const job = this.tail.then(() => this.handle(message));
    this.tail = job.catch(() => {});
    return job;
  }
  armExpiry(duration) {
    const generation = this.generation;
    this.powerOffAt = new Date(Date.now() + duration).toISOString();
    this.timer = setTimeout(() => { void this.dispatch({ type: "expire", generation }).catch(error => this.io.report?.(error)); }, duration);
  }
  async suspend() {
    if (this.state !== 'active') return this.status();
    this.remaining = this.powerOffAt ? Math.max(1, Date.parse(this.powerOffAt) - Date.now()) : null;
    this.cancelExpiry();
    await this.io.suspendRenderer?.();
    this.state = 'suspended';
    await this.io.writeState('suspended');
    return this.status();
  }
  async stop() {
    this.remaining = null;
    this.cancelExpiry();
    if (this.state === "idle") return;
    this.state = "stopping";
    await this.io.writeState("stopping");
    try { await this.io.closeRenderer(); }
    finally {
      const airplay = await this.io.airplayActive();
      try { if (!airplay) await this.io.releaseDisplay(); }
      finally { await this.io.restoreDisplay?.(airplay); }
      await this.io.writeState("idle"); this.state = "idle";
    }
  }
  async handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Expected JSON object");
    if (message.type === 'airplay') return this.suspend();
    if (message.type === 'airplay-ended') {
      if (this.state !== 'suspended' || await this.io.airplayActive()) return this.status();
      await this.io.resumeRenderer?.();
      this.state = 'active';
      await this.io.writeState('active');
      if (this.remaining !== null && this.remaining !== undefined) this.armExpiry(this.remaining);
      this.remaining = null;
      return this.status();
    }
    if (message.type === "power-off") {
      if (await this.io.airplayActive()) throw new Error("AirPlay owns the display; stop streaming before switching it off");
      await this.stop();
      if (await this.io.airplayActive()) throw new Error("AirPlay took the display; screen left on");
      await this.io.powerOff();
      return { ...this.status(), screenOff: true };
    }
    if (message.type === "expire" && message.generation !== this.generation) return this.status();
    if (["deactivate", "clear", "renderer-exit", "expire"].includes(message.type)) {
      await this.stop(); return this.status();
    }
    if (!["activate", "message"].includes(message.type)) throw new Error("type must be activate, message, deactivate or status");
    if (message.duration !== undefined) throw new Error("Use powerOffAfterMs for wake-up alerts; duration is not supported");
    const mode = message.mode || "manual";
    if (!["manual", "auto"].includes(mode)) throw new Error("mode must be manual or auto");
    if (message.text !== undefined && (typeof message.text !== "string" || !message.text.trim() || message.text.length > 4000)) throw new Error("text must contain 1–4000 characters");
    if (mode === "manual" && message.type === "message" && message.text === undefined) throw new Error("message requires text");
    if (message.align !== undefined && message.align !== "center") throw new Error("align must be center when specified");
    if (message.align !== undefined && mode !== "manual") throw new Error("align requires manual mode");
    if (message.beautify !== undefined && typeof message.beautify !== "boolean") throw new Error("beautify must be true or false");
    if (message.beautify && mode !== "manual") throw new Error("beautify requires manual mode");
    if (message.sound !== undefined && typeof message.sound !== "boolean") throw new Error("sound must be true or false");
    const duration = message.powerOffAfterMs;
    if (duration !== undefined && (!Number.isInteger(duration) || duration < 1000 || duration > 86400000)) throw new Error("powerOffAfterMs must be 1000–86400000 milliseconds");
    if (duration !== undefined && mode !== "manual") throw new Error("powerOffAfterMs requires manual mode");
    if (await this.io.airplayActive()) throw new Error("AirPlay owns the display; try after streaming ends");
    this.cancelExpiry();
    this.io.setTemporary?.(duration !== undefined);
    try {
      let woke;
      if (this.state === "idle") {
        this.state = "starting";
        await this.io.writeState("fading");
        await this.io.prepareHandoff();
        if (await this.io.airplayActive()) throw new Error("AirPlay took the display during activation");
        await this.io.acquireDisplay();
        woke = await this.io.prepareDisplay?.();
        await this.io.openRenderer(); // Renderer starts with a blank split-flap frame.
      } else {
        this.state = "starting"; // Prevent automatic content during the wake sequence.
        woke = await this.io.prepareDisplay?.();
        if (woke) await this.io.blankDisplay();
      }
      if (woke) {
        this.state = "warming";
        await this.io.writeState("warming");
        await this.io.waitForScreen();
      }
      if (await this.io.airplayActive()) throw new Error("AirPlay took the display during activation");
      this.mode = mode;
      this.state = "animating";
      await this.io.writeState("animating");
      let text = mode === "auto" ? this.io.automaticText() : (message.text || "WELCOME HOME.");
      if (message.align === "center") text = text.split("\n").map(line => line.trim()).join("\n");
      await this.io.show(text, false, message.align, message.beautify === true, message.sound === true);

      this.state = "active";
      await this.io.writeState("active");
      if (duration !== undefined) {
        this.armExpiry(duration);
      }
      if (await this.io.airplayActive()) return this.suspend();
      return this.status();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
}
module.exports = { Controller };
