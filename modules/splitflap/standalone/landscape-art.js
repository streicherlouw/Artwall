"use strict";
const config = require("./config.json");
const palette = { '.':' ', O:'🟧', Y:'🟨', W:'⬜', P:'🟪', B:'🟦', R:'🟥', G:'🟩' };
function art(name, paint) {
  const grid = Array.from({length:9}, () => Array(24).fill('.'));
  const span = (y, start, end, colour) => { for(let x=start;x<=end;x++) grid[y][x]=colour; };
  paint(span);
  const columns = config.columns || 27;
  const rows = config.rows || 10;
  const left = Math.max(0, Math.floor((columns - 24) / 2));
  const top = Math.max(0, Math.floor((rows - 9) / 2));
  const canvas = Array.from({length: rows}, () => Array(columns).fill('.'));
  grid.forEach((row,y) => row.forEach((c,x) => { if(y+top<rows && x+left<columns) canvas[y+top][x+left]=c; }));
  return { name, rows: canvas.map(row => row.join('')), text: canvas.map(row=>row.map(c=>palette[c]).join('')).join('\n') };
}
module.exports = [
  art('GOLDEN FISH', s => {
    s(1,12,14,'O');
    s(2,2,3,'O');s(2,10,17,'Y');
    s(3,2,5,'O');s(3,8,19,'Y');s(3,17,17,'.');
    s(4,3,20,'Y');s(4,10,11,'O');
    s(5,2,5,'O');s(5,8,19,'Y');s(5,11,12,'O');
    s(6,2,3,'O');s(6,10,17,'Y');
    s(7,12,14,'O');
  }),
  art('BIRD IN FLIGHT', s => {
    s(1,1,3,'B');s(1,20,22,'B');
    s(2,2,6,'B');s(2,17,21,'B');
    s(3,3,9,'B');s(3,14,20,'B');s(3,11,12,'W');
    s(4,5,18,'B');s(4,11,12,'Y');
    s(5,8,15,'B');s(5,11,12,'W');
    s(6,10,13,'B');
    s(7,9,10,'B');s(7,13,14,'B');
  }),
  art('TURTLE', s => {
    s(1,9,14,'G');
    s(2,7,16,'G');s(2,10,13,'Y');
    s(3,5,18,'G');s(3,8,9,'Y');s(3,14,15,'Y');s(3,20,22,'G');
    s(4,2,22,'G');s(4,10,13,'Y');s(4,21,21,'.');
    s(5,5,18,'G');s(5,8,9,'Y');s(5,14,15,'Y');s(5,19,21,'G');
    s(6,6,17,'G');
    s(7,5,7,'G');s(7,16,18,'G');
  })
];
