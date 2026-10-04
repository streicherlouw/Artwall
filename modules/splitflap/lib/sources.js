"use strict";
const Parser = require("rss-parser");
const parser = new Parser();
const MAX_BYTES = 2 * 1024 * 1024;
const clean = value => String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
async function download(url, fetcher = fetch) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Sources require HTTP or HTTPS");
  const response = await fetcher(parsed.href, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "Artwall-SplitFlap/1.0", Accept: "application/json, application/rss+xml, application/atom+xml, text/xml" }
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Source response exceeds 2 MB");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
async function loadSource(source, { fetcher = fetch, date = new Date() } = {}) {
  const limit = Math.max(1, Math.min(50, Number(source.limit) || 10));
  switch (source.type) {
    case "messages":
      return (source.messages || []).filter(x => typeof x === "string" && x.trim()).slice(0, 100).map(text => text.slice(0, 4000));
    case "news": {
      const feed = await parser.parseString(await download(source.url, fetcher));
      const attribution = clean(source.label || feed.title || "NEWS");
      return feed.items.filter(item => clean(item.title)).slice(0, limit)
        .map(item => `${clean(item.title)}\n\n${attribution}`.slice(0, 4000));
    }
    case "quote": {
      const data = JSON.parse(await download("https://zenquotes.io/api/today", fetcher));
      if (!data[0]?.q || !data[0]?.a || data[0].a === "zenquotes.io") throw new Error("Quote source unavailable");
      return [`${clean(data[0].q)}\n- ${clean(data[0].a)}\nZENQUOTES.IO`];
    }
    case "history": {
      const language = /^[a-z]{2,3}$/.test(source.language || "en") ? (source.language || "en") : "en";
      const [, month, day] = dayKey(date).split("-");
      const url = `https://${language}.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;
      const data = JSON.parse(await download(url, fetcher));
      if (!Array.isArray(data.events)) throw new Error("Invalid history response");
      return data.events.filter(event => event.text && Number.isFinite(event.year)).slice(0, limit)
        .map(event => `ON THIS DAY ${day}/${month}\n${event.year}: ${clean(event.text)}\nWIKIPEDIA / CC BY-SA`.slice(0, 4000));
    }
    default: throw new Error(`Unknown source type: ${source.type}`);
  }
}
module.exports = { loadSource, download, dayKey };
