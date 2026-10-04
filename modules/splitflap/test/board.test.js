"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { pages, normalize, Board } = require("../lib/board");
test("centers text horizontally and vertically", () => {
  const [page] = pages("HELLO", 8, 3);
  assert.equal(page.join(""), "        " + " HELLO  " + "        ");
});
test("wraps and paginates without losing words or long tokens", () => {
  const input = "ONE TWO THREE ABCDEFGHIJKLMNOPQRST END";
  const output = pages(input, 8, 3);
  assert.ok(output.length > 1);
  assert.ok(output.every(p => p.length === 24));
  assert.equal(output.flat().join("").replace(/ /g, ""), input.replace(/ /g, ""));
});
test("handles newlines, accents, punctuation and single-cell colors", () => {
  assert.equal(normalize("Café—‘hi’ 🟥\n"), "CAFE-'HI' 🟥\n");
  assert.equal(pages("🟥🟧🟨", 8, 3)[0].filter(c => c !== " ").length, 3);
  assert.equal(pages("", 8, 3).length, 1);
});
test("renders untrusted text safely and settles animation with no pending frames", () => {
  const dom = new JSDOM("<div id='board'></div>");
  global.document = dom.window.document;
  let callback; let frame = 0;
  global.requestAnimationFrame = fn => { callback = fn; return ++frame; };
  global.cancelAnimationFrame = () => { callback = null; };
  const board = new Board(document.getElementById("board"), { columns: 8, rows: 3 });
  const target = pages("<img src=x>🟥", 8, 3)[0];
  board.show(target, "<img src=x>🟥");
  callback(performance.now() + 5000);
  assert.equal(board.frame, null);
  assert.equal(document.querySelectorAll("img").length, 0);
  assert.deepEqual(board.cells.map(cell => cell.value), target);
  board.destroy();
  assert.equal(document.getElementById("board").children.length, 0);
  dom.window.close();
});
