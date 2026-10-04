"use strict";
// Five single-board quotes, 15 seconds each, then release the display.
const WebSocket = require("ws");
const { once } = require("node:events");
const { download } = require("../lib/sources");
const { pages } = require("../lib/board");
const config = require("./config.json");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const colors = Array.from("🟥🟧🟨🟩🟦🟪");
function decorate(quote, index) {
  const border = Array.from({ length: config.columns || 24 }, (_, i) => colors[(Math.floor(i / 4) + index) % colors.length]).join("");
  return `${border}\n${quote.q}\n- ${quote.a}\nZENQUOTES.IO\n${border}`;
}
async function send(command) {
  const token = process.env.SPLITFLAP_TOKEN;
  const socket = new WebSocket(process.env.SPLITFLAP_URL || "ws://127.0.0.1:8765", {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, handshakeTimeout: 5000
  });
  socket.on("error", () => {});
  const timer = setTimeout(() => socket.terminate(), 45000);
  try {
    await once(socket, "open");
    const response = new Promise((resolve, reject) => {
      socket.once("message", data => resolve(JSON.parse(data)));
      socket.once("error", reject);
      socket.once("close", () => reject(new Error("Connection closed before acknowledgement")));
    });
    socket.send(JSON.stringify(command));
    const result = await response;
    if (!result.ok) throw new Error(result.error);
    return result;
  } finally { clearTimeout(timer); socket.close(); }
}
(async () => {
  const status = await send({ type: "status" });
  if (status.state !== "idle") throw new Error("An existing SplitFlap session is active; refusing to replace it");
  const [today, batch] = await Promise.all([
    download("https://zenquotes.io/api/today").then(JSON.parse),
    download("https://zenquotes.io/api/quotes").then(JSON.parse)
  ]);
  const seen = new Set();
  const quotes = [...today, ...batch].filter(quote => {
    if (!quote.q || !quote.a || quote.a === "zenquotes.io" || seen.has(quote.q)) return false;
    seen.add(quote.q);
    return pages(decorate(quote, 0), config.columns || 24, config.rows || 9).length === 1;
  }).slice(0, 5);
  if (quotes.length < 5) throw new Error("Not enough single-board quotes returned by the source");
  let active = false;
  try {
    let began;
    for (let i = 0; i < quotes.length; i++) {
      if (i) await sleep(Math.max(0, began + i * 15000 - Date.now()));
      // Mark before requesting so uncertain activation also gets a cleanup attempt.
      active = true;
      await send({ type: "message", text: decorate(quotes[i], i) });
      if (!i) began = Date.now();
      console.log(`${new Date().toISOString()} Quote ${i + 1}/5 accepted (${quotes[i].a})`);
    }
    await sleep(Math.max(0, began + 75000 - Date.now()));
  } finally {
    if (active) { await send({ type: "deactivate" }); console.log("Test finished: display released."); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
