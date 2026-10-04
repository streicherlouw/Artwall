"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const WebSocket = require("ws");
const { Service, validateMessage } = require("../lib/service");
const { loadSource } = require("../lib/sources");
const response = body => async () => new Response(body);
test("parses RSS, Atom, quote and history fixtures", async () => {
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>NEWS</title><item><title>First &amp; second</title></item></channel></rss>';
  assert.deepEqual(await loadSource({ type: "news", url: "https://example.com" }, { fetcher: response(rss) }), ["First & second\n\nNEWS"]);
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><title>ATOM</title><entry><title>Headline</title><id>1</id></entry></feed>';
  assert.deepEqual(await loadSource({ type: "news", url: "https://example.com" }, { fetcher: response(atom) }), ["Headline\n\nATOM"]);
  assert.deepEqual(await loadSource({ type: "quote" }, { fetcher: response('[{"q":"Be kind.","a":"Someone"}]') }), ["Be kind.\n- Someone\nZENQUOTES.IO"]);
  let requested;
  const items = await loadSource({ type: "history" }, { date: new Date(2026, 8, 13), fetcher: async url => { requested = url; return new Response('{"events":[{"year":1900,"text":"An event."}]}'); } });
  assert.match(requested, /events\/09\/13$/); assert.match(items[0], /1900: An event/);
});
test("rejects malformed messages and unsafe durations", () => {
  for (const value of [null, [], {}, { type: "message", text: "" }, { type: "message", text: "ok", duration: -1 }, { type: "message", text: "x".repeat(4001) }]) assert.throws(() => validateMessage(value));
  assert.equal(validateMessage({ type: "message", text: "Hi" }).duration, 60000);
});
test("interrupts rotation, replaces overrides, and resumes after expiry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const seen = [];
  const service = new Service({ sources: [], websocket: { enabled: false }, welcomeMessage: "IDLE" }, text => seen.push(text));
  service.start(); t.after(() => service.stop());
  service.receive({ type: "message", text: "FIRST", duration: 1000 });
  service.receive({ type: "message", text: "SECOND", duration: 2000 });
  t.mock.timers.tick(1001); assert.equal(seen.at(-1), "SECOND");
  service.rotate(); assert.equal(seen.at(-1), "SECOND");
  t.mock.timers.tick(1000); assert.equal(seen.at(-1), "IDLE");
  service.receive({ type: "message", text: "THIRD" });
  service.receive({ type: "clear" }); assert.equal(seen.at(-1), "IDLE");
});
test("retains cached content on failures and interleaves sources", async t => {
  let fail = false;
  const errors = [];
  const service = new Service({ sources: [{ type: "news" }, { type: "quote" }] }, () => {}, error => errors.push(error), async source => {
    if (fail) throw new Error("offline"); return source.type === "news" ? ["N1", "N2"] : ["Q"];
  });
  t.after(() => service.stop());
  await service.refresh();
  service.index = 0;
  service.rotate(); assert.equal(service.current, "N1");
  service.rotate(); assert.equal(service.current, "Q");
  service.rotate(); assert.equal(service.current, "N2");
  fail = true; service.sources.forEach(state => { state.next = 0; });
  await service.refresh();
  assert.deepEqual(service.sources[0].items, ["N1", "N2"]); assert.equal(errors.length, 2);
});
test("WebSocket authenticates, acknowledges, rejects invalid JSON and clears", async t => {
  process.env.SPLITFLAP_TEST_TOKEN = "test-secret-at-least-16";
  const seen = [];
  const service = new Service({ websocket: { host: "127.0.0.1", port: 0, tokenEnv: "SPLITFLAP_TEST_TOKEN" } }, text => seen.push(text));
  service.start(); t.after(() => { service.stop(); delete process.env.SPLITFLAP_TEST_TOKEN; });
  await once(service.server, "listening");
  const url = `ws://127.0.0.1:${service.server.address().port}`;
  const denied = new WebSocket(url); denied.on("error", () => {});
  const [error] = await once(denied, "error"); assert.match(error.message, /401/);
  const socket = new WebSocket(url, { headers: { Authorization: "Bearer test-secret-at-least-16" } });
  await once(socket, "open");
  const send = async data => { const reply = once(socket, "message"); socket.send(data); return JSON.parse((await reply)[0]); };
  assert.equal((await send("{")).ok, false);
  assert.equal((await send(JSON.stringify({ type: "message", text: "LIVE" }))).ok, true);
  assert.equal(seen.at(-1), "LIVE");
  assert.equal((await send('{"type":"clear"}')).ok, true);
  assert.notEqual(seen.at(-1), "LIVE");
  socket.close(); await once(socket, "close");
});
test("refuses a LAN listener without a token", () => {
  const errors = [];
  const service = new Service({ websocket: { host: "0.0.0.0", tokenEnv: "MISSING_SPLITFLAP_TEST_TOKEN" } }, () => {}, error => errors.push(error));
  service.start(); service.stop();
  assert.equal(service.server, undefined); assert.match(errors[0], /disabled/);
});
