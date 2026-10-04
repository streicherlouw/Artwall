/* Shared by the native renderer, browser preview, and layout tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SplitFlap = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const colors = { "⬜": "#e8e8dd", "🟥": "#d24a3f", "🟧": "#e28a35", "🟨": "#e9ce4b", "🟩": "#59a363", "🟦": "#4a7bbc", "🟪": "#8c5fbb" };
  const alphabet = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'-:;/&+()@#%=\"";
  function normalize(value) {
    return Array.from(String(value).normalize("NFKD").replace(/[\u0300-\u036f\ufe0f]/g, "")
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
      .replace(/…/g, "...").replace(/\t/g, " ").replace(/\r/g, "").toUpperCase())
      .map(c => c === "\n" || alphabet.includes(c) || colors[c] ? c : " ").join("");
  }
  function pages(text, columns = 24, rows = 9, align = "center") {
    const lines = [];
    for (const paragraph of normalize(text).split("\n")) {
      // Full-width rows are deliberate tile art; preserve their blank pixels.
      if (Array.from(paragraph).length === columns) { lines.push(Array.from(paragraph)); continue; }
      let line = [];
      for (const word of paragraph.trim().split(/ +/).filter(Boolean)) {
        let chars = Array.from(word);
        if (line.length && line.length + 1 + chars.length > columns) { lines.push(line); line = []; }
        while (chars.length > columns) { lines.push(chars.slice(0, columns)); chars = chars.slice(columns); }
        if (line.length) line.push(" ");
        line.push(...chars);
      }
      lines.push(line);
    }
    const result = [];
    for (let offset = 0; offset < lines.length; offset += rows) {
      const chunk = lines.slice(offset, offset + rows);
      const cells = Array(columns * rows).fill(" ");
      const top = Math.floor((rows - chunk.length) / 2);
      chunk.forEach((line, i) => {
        const left = align === "left" ? 0 : Math.floor((columns - line.length) / 2);
        line.forEach((c, j) => { cells[(top + i) * columns + left + j] = c; });
      });
      result.push(cells);
    }
    return result;
  }
  function beautify(text, columns = 24, rows = 9) {
    const palette = Array.from("🟥🟧🟨🟩🟦🟪");
    const centered = pages(String(text).split("\n").map(line => line.trim()).join("\n"), columns, rows, "center");
    return centered.map(values => {
      const cells = values.slice(), occupied = [];
      for (let row = 0; row < rows; row++) {
        const line = values.slice(row * columns, (row + 1) * columns);
        const first = line.findIndex(value => value !== " ");
        if (first < 0) continue;
        occupied.push(row);
        let last = columns - 1;
        while (line[last] === " ") last--;
        // Leave a blank tile between text and each accent.
        if (first >= 2 && last <= columns - 3) {
          cells[row * columns + first - 2] = palette[row % palette.length];
          cells[row * columns + last + 2] = palette[(row + 3) % palette.length];
        }
      }
      if (occupied.length && columns >= palette.length) {
        const left = Math.floor((columns - palette.length) / 2);
        for (const row of [occupied[0] - 1, occupied[occupied.length - 1] + 1]) {
          if (row >= 0 && row < rows) palette.forEach((value, i) => { cells[row * columns + left + i] = value; });
        }
      }
      return cells;
    });
  }
  function gridOptions(config) {
    const int = (value, fallback, min, max) => Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
    return { columns: int(config.columns, 24, 8, 64), rows: int(config.rows, 9, 3, 24) };
  }
  class Board {
    constructor(element, config = {}) {
      this.config = { ...config, ...gridOptions(config) };
      this.element = element;
      this.cells = [];
      this.frame = null;
      this.motion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.classList.add("sf-board");
      element.setAttribute("role", "img");
      element.style.setProperty("--sf-columns", this.config.columns);
      element.style.setProperty("--sf-rows", this.config.rows);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < this.config.columns * this.config.rows; i++) {
        const tile = document.createElement("div");
        tile.className = "sf-tile";
        tile.setAttribute("aria-hidden", "true");
        const faces = ["top", "bottom", "leaf"].map(name => {
          const face = document.createElement("span"); face.className = `sf-${name}`;
          const glyph = document.createElement("span"); glyph.className = "sf-glyph";
          glyph.textContent = " "; face.appendChild(glyph); tile.appendChild(face);
          return { face, glyph };
        });
        fragment.appendChild(tile);
        this.cells.push({ tile, faces, value: " " });
      }
      element.appendChild(fragment);
    }
    paint(cell, value) {
      cell.value = value;
      for (const { face, glyph } of cell.faces) {
        glyph.style.setProperty("--sf-swatch", colors[value] || "transparent");
        glyph.classList.toggle("sf-colour", Boolean(colors[value]));
        glyph.textContent = colors[value] ? " " : value;
      }
    }
    show(values, label) {
      this.stop();
      this.element.setAttribute("aria-label", label || values.join("").trim());
      if (this.motion || this.config.animate === false) {
        this.cells.forEach((cell, i) => this.paint(cell, values[i] || " "));
        return;
      }
      const now = performance.now();
      const duration = Math.max(30, Math.min(180, Number(this.config.flipDuration) || 65));
      const pending = this.cells.flatMap((cell, i) => {
        const target = values[i] || " ";
        if (target === cell.value) return [];
        return [{ cell, target, start: now + (i % this.config.columns) * 12 + Math.floor(i / this.config.columns) * 18,
          steps: 4 + i % 5, lastStep: -1, seed: Math.max(0, alphabet.indexOf(cell.value)) }];
      });
      const tick = time => {
        let active = false;
        for (const item of pending) {
          const elapsed = time - item.start;
          if (elapsed < 0) { active = true; continue; }
          const step = Math.floor(elapsed / duration);
          if (step >= item.steps) {
            if (item.cell.value !== item.target) this.paint(item.cell, item.target);
            item.cell.faces[2].face.style.transform = "";
            continue;
          }
          active = true;
          if (step !== item.lastStep) {
            this.paint(item.cell, alphabet[(item.seed + step + 1) % alphabet.length]);
            item.lastStep = step;
          }
          item.cell.faces[2].face.style.transform = `rotateX(${-180 * (elapsed % duration) / duration}deg)`;
        }
        this.frame = active ? requestAnimationFrame(tick) : null;
      };
      this.frame = requestAnimationFrame(tick);
    }
    stop() {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.cells.forEach(cell => { cell.faces[2].face.style.transform = ""; });
    }
    destroy() { this.stop(); this.element.replaceChildren(); }
  }
  return { Board, pages, beautify, normalize, gridOptions };
});
