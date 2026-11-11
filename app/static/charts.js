"use strict";
/* Emlak Panel v2 — hafif SVG grafikler (bağımlılıksız) */
const PALETTE = ["#4f46e5", "#12b76a", "#f79009", "#f04438", "#0e7490", "#8b5cf6", "#ec4a0a", "#667085", "#175cd3", "#a6f4c5"];

function donut(segs, size = 160, thick = 26) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thick) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const circles = segs.map((s, i) => {
    const frac = s.value / total;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color || PALETTE[i % PALETTE.length]}"
      stroke-width="${thick}" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}"
      stroke-dashoffset="${(-off * c).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})">
      <title>${esc(s.label)}: ${s.value.toLocaleString("tr-TR")}</title></circle>`;
    off += frac;
    return el;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${circles}
    <text x="50%" y="47%" text-anchor="middle" font-size="21" font-weight="800" fill="var(--ink)">${total.toLocaleString("tr-TR")}</text>
    <text x="50%" y="60%" text-anchor="middle" font-size="11" fill="var(--muted)">toplam</text></svg>`;
}

function hbars(rows, colorFn) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="hbars">${rows.map((r, i) => {
    const pct = Math.max(2, (r.value / max) * 100);
    const col = colorFn ? colorFn(r, i) : PALETTE[i % PALETTE.length];
    return `<div class="hbar"><div class="top"><span>${esc(r.label)}</span><b>${r.value.toLocaleString("tr-TR")}</b></div>
      <div class="track"><div class="fill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div></div>`;
  }).join("")}</div>`;
}
