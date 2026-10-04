"use strict";
const WebSocket = require("ws");
const args = process.argv.slice(2);
const expiry = args.find(arg => arg.startsWith("--power-off-after-ms="));
const [action, ...words] = args.filter(arg => !arg.startsWith("--power-off-after-ms="));
const types = ["activate", "message", "deactivate", "status", "auto"];
if (!types.includes(action)) { console.error('Usage: node standalone/send.js activate|message "text"|auto|deactivate|status [--power-off-after-ms=30000]'); process.exit(1); }
const command = action === "auto" ? { type: "activate", mode: "auto" } : { type: action };
if (words.length) command.text = words.join(" ");
if (expiry) command.powerOffAfterMs = Number(expiry.split("=")[1]);
const token = process.env.SPLITFLAP_TOKEN;
const socket = new WebSocket(process.env.SPLITFLAP_URL || "ws://127.0.0.1:8765", {
  headers: token ? { Authorization: `Bearer ${token}` } : {}, handshakeTimeout: 5000
});
const timer = setTimeout(() => { console.error('Request timed out; use status to check the session'); socket.terminate(); process.exitCode = 1; }, 90000);
socket.on('open', () => socket.send(JSON.stringify(command)));
socket.on('message', data => { const result = JSON.parse(data); console.log(result); if (!result.ok) process.exitCode = 1; socket.close(); });
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => clearTimeout(timer));
