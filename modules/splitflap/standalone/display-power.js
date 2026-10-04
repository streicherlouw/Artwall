"use strict";
function enabledState(text, output) {
  const lines = String(text).split(/\r?\n/);
  const index = lines.findIndex(line => line === output || line.startsWith(output + " "));
  if (index < 0) throw new Error(`Display output ${output} not found`);
  for (const line of lines.slice(index + 1)) {
    if (line && !/^\s/.test(line)) break;
    const match = line.match(/^\s+Enabled:\s*(yes|no)\s*$/i);
    if (match) return match[1].toLowerCase() === "yes";
  }
  throw new Error(`Cannot read power state of ${output}`);
}
class DisplayPower {
  constructor(config, execute, save = () => {}) {
    this.config = { enabled: true, output: "HDMI-A-1", command: "/usr/bin/wlr-randr", ...config };
    this.execute = execute;
    this.save = save;
    this.restoreOff = false;
  }
  async prepare() {
    if (!this.config.enabled) return false;
    const { command, output } = this.config;
    const result = await this.execute(command, []);
    if (enabledState(result.stdout, output)) return false;
    // Persist ownership before changing the screen so crash recovery can restore it.
    this.restoreOff = true;
    await this.save(true);
    await this.execute(command, ["--output", output, "--on", "--preferred"]);
    return true;
  }
  async off() {
    if (!this.config.enabled) throw new Error("Display power control is disabled");
    await this.execute(this.config.command, ["--output", this.config.output, "--off"]);
    this.restoreOff = false;
    await this.save(false);
  }
  async restore(relinquish = false) {
    if (!this.restoreOff) return;
    if (!relinquish) await this.execute(this.config.command, ["--output", this.config.output, "--off"]);
    this.restoreOff = false;
    await this.save(false);
  }
}
module.exports = { DisplayPower, enabledState };
