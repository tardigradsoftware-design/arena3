"use strict";
/* Emlak Panel v2 — çekirdek */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const PLACEHOLDER = new Set(["Seçiniz", "default"]);
const Views = {};
let COLS = [], STATS = null, allTags = [];
let currentView = "";

/* ---------- ikonlar (çizgi SVG) ---------- */
const P = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 9v11"/>',
  check: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 12 3 3 6-6"/>',
  tag: '<path d="M20 12V4h-8L4 12l8 8 8-8Z"/><circle cx="15.5" cy="8.5" r="1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16M15 4v16"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  note: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 18v2M2 12h2M18 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3Z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  arrow: '<path d="M5 12h14m0 0-5-5m5 5-5 5"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ""}</svg>`;
function hydrateIcons(root = document) {
  $$("[data-ic]", root).forEach((el) => { el.innerHTML = icon(el.dataset.ic); el.removeAttribute("data-ic"); });
}

/* ---------- api + bildirim ---------- */
async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("Hata " + r.status));
  return data;
}
async function refreshStats() {
  STATS = await api("/api/stats");
  allTags = STATS.tags;
  const t = STATS.total;
  $("#nav-total").textContent = t > 999 ? (t / 1000).toFixed(1).replace(".", ",") + "B" : t;
  const b = $("#nav-tasks");
  b.textContent = STATS.open_tasks || "";
  b.style.display = STATS.open_tasks ? "" : "none";
  return STATS;
}
function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------- biçimlendirme ---------- */
function fmtDate(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "");
  return String(v);
}
function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(String(v).replace(",", "."));
  if (!isFinite(n)) return String(v);
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}
function fmtMoney(v) {
  if (v === null || v === undefined) return "—";
  return fmtNum(v) + " ₺";
}
function fmtCompact(v) {
  const n = +v;
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " Mr";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " Mn";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " B";
  return fmtNum(n);
}
function dueText(d) { return d ? fmtDate(d) : ""; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isOverdue(d) { return !!d && d < todayStr(); }
function isToday(d) { return d === todayStr(); }
function fmtVal(col, v) {
  if (v === null || v === undefined || v === "") return '<span class="dim">—</span>';
  const s = String(v);
  if (PLACEHOLDER.has(s)) return `<span class="dim">${esc(s)}</span>`;
  if (col.dtype === "number") return esc(fmtNum(s));
  if (col.dtype === "date") return esc(fmtDate(s));
  return esc(s);
}
const STATUS_PILL = {
  "SATILIK": "green", "SATABİLİR^^": "teal", "SATILMIŞ": "blue", "ARŞİV": "gray",
  "MARLA KİRALANDI": "amber", "KİRALANABİLİR": "violet", "KİRALIK": "amber",
  "DAİRE": "blue", "Dükkan": "amber", "BİNA": "violet", "DUBLEX": "teal",
  "BOŞ": "green", "KİRACI VAR": "amber", "MÜLK SAHİBİ": "blue",
};
function pill(v) {
  if (v === null || v === undefined || v === "" || PLACEHOLDER.has(String(v)))
    return '<span class="dim">—</span>';
  const cls = STATUS_PILL[String(v)] || "gray";
  return `<span class="pill ${cls}">${esc(v)}</span>`;
}

/* ---------- modal / onay / soru ---------- */
function openModal(title, bodyHTML, { wide = false, foot = "" } = {}) {
  closeModal();
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "modal-bg";
  bg.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog">
    <div class="modal-head"><span>${title}</span><button class="iconbtn" id="modal-x">${icon("x")}</button></div>
    <div class="modal-body">${bodyHTML}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}</div>`;
  $("#modal-root").appendChild(bg);
  $("#modal-x", bg).onclick = closeModal;
  bg.onclick = (e) => { if (e.target === bg) closeModal(); };
  return bg;
}
function closeModal() { const m = $("#modal-bg"); if (m) m.remove(); }
function confirmDlg(msg, okText = "Sil") {
  return new Promise((resolve) => {
    const bg = openModal("Onay", `<p style="margin:0 0 4px">${esc(msg)}</p>`, {
      foot: `<button class="btn" id="cf-no">Vazgeç</button><button class="btn danger" id="cf-ok">${esc(okText)}</button>`
    });
    const done = (v) => { closeModal(); resolve(v); };
    $("#cf-ok", bg).onclick = () => done(true);
    $("#cf-no", bg).onclick = () => done(false);
  });
}
function promptDlg(title, { value = "", placeholder = "", label = "" } = {}) {
  return new Promise((resolve) => {
    const bg = openModal(esc(title), `
      ${label ? `<div class="mrow"><label>${esc(label)}</label><input type="text" id="pd-in" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`
        : `<div class="mrow"><input type="text" id="pd-in" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`}`, {
      foot: `<button class="btn" id="pd-no">Vazgeç</button><button class="btn primary" id="pd-ok">Tamam</button>`
    });
    const inp = $("#pd-in", bg);
    inp.focus(); inp.select();
    const done = (v) => { closeModal(); resolve(v); };
    $("#pd-ok", bg).onclick = () => done(inp.value.trim() || null);
    $("#pd-no", bg).onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === "Enter") done(inp.value.trim() || null); };
  });
}

/* ---------- komut paleti ---------- */
const COMMANDS = [
  { t: "Panele git", s: "Özet, grafikler, hareketler", ic: "dash", run: () => setView("dashboard") },
  { t: "Kayıtlara git", s: "Filtrele, sırala, düzenle", ic: "table", run: () => setView("records") },
  { t: "Görevlere git", s: "Yapılacaklar listesi", ic: "check", run: () => setView("tasks") },
  { t: "Etiketlere git", s: "Etiket yönetimi", ic: "tag", run: () => setView("records").then(() => Records.openExport()) },
  { t: "Dışa aktar", s: "CSV / XLSX indir", ic: "download", run: () => setView("records").then(() => Records.openExport()) },
  { t: "Temayı değiştir", s: "Açık / koyu", ic: "moon", run: () => toggleTheme() },
  { t: "Filtreleri temizle", s: "Kayıt görünümü sıfırlanır", ic: "filter", run: () => { Records.clearAll(); setView("records"); } },
];
function openPalette() {
  closePalette();
  const bg = document.createElement("div");
  bg.className = "palette-bg"; bg.id = "palette-bg";
  bg.innerHTML = `<div class="palette"><div class="pin">${icon("search")}<input id="pal-in" placeholder="Kayıt ara (ad, adres, telefon, ID) veya komut yaz…" autocomplete="off"></div>
    <div class="palette-list" id="pal-list"></div></div>`;
  $("#palette-root").appendChild(bg);
  bg.onclick = (e) => { if (e.target === bg) closePalette(); };
  const inp = $("#pal-in", bg);
  let items = [], active = 0;
  const paint = () => {
    const box = $("#pal-list", bg);
    if (!box) return;
    let h = "", lastSec = "";
    items.forEach((it, i) => {
      if (it.sec !== lastSec) { h += `<div class="sec">${it.sec}</div>`; lastSec = it.sec; }
      h += `<button class="pi${i === active ? " active" : ""}" data-pi="${i}">
        ${it.ic ? `<span style="color:var(--muted);display:inline-flex;width:18px">${icon(it.ic)}</span>` : ""}
        <span class="t">${it.t}${it.s ? `<div class="s">${it.s}</div>` : ""}</span></button>`;
    });
    box.innerHTML = h || '<div class="empty">Sonuç yok</div>';
    $$("[data-pi]", box).forEach((b) => {
      b.onclick = () => { items[+b.dataset.pi].run(); };
      b.onmousemove = () => { active = +b.dataset.pi; paint(); };
    });
  };
  const search = debounce(async () => {
    const q = inp.value.trim();
    const cmds = COMMANDS.filter((c) => !q || (c.t + " " + c.s).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")))
      .map((c) => ({ sec: "Komutlar", ic: c.ic, t: esc(c.t), s: esc(c.s), run: () => { closePalette(); c.run(); } }));
    let recs = [];
    if (q.length >= 2) {
      try {
        const d = await api("/api/records?" + new URLSearchParams({ q, per_page: 8 }));
        recs = d.rows.map((r) => ({
          sec: "Kayıtlar", ic: "home",
          t: esc(`#${r.c0 || "?"} — ${r.c1 || "adres yok"}`),
          s: esc([r.c21, r.c5, r.c9].filter(Boolean).join(" • ")),
          run: () => { closePalette(); Detail.open(r.id); }
        }));
      } catch (e) { /* yoksay */ }
    }
    items = [...recs, ...cmds].slice(0, 14);
    active = 0; paint();
  }, 200);
  inp.oninput = search;
  inp.onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
    else if (e.key === "Enter" && items[active]) { items[active].run(); }
  };
  inp.focus(); search();
}
function closePalette() { const m = $("#palette-bg"); if (m) m.remove(); }

/* ---------- yönlendirme ---------- */
const CRUMBS = { dashboard: "Panel", records: "Kayıtlar", tasks: "Görevler", tags: "Etiketler" };
async function setView(name) {
  if (!Views[name]) name = "dashboard";
  currentView = name;
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#crumb").textContent = CRUMBS[name];
  document.body.classList.remove("nav-open");
  if (location.hash !== "#/" + name) history.replaceState(null, "", "#/" + name);
  const el = $("#view");
  el.innerHTML = '<div class="loading">yükleniyor…</div>';
  try { await Views[name].render(el); }
  catch (e) { el.innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; }
  el.scrollTop = 0; $("#view").scrollTop = 0;
}

/* ---------- tema ---------- */
function applyTheme(t) {
  document.body.dataset.theme = t;
  $("#theme-lbl").textContent = t === "dark" ? "Açık tema" : "Koyu tema";
  try { localStorage.setItem("emlak-theme", t); } catch (e) {}
}
function toggleTheme() { applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"); }

/* ---------- kayıtlı görünümler (kenar çubuğu) ---------- */
function getViews() {
  try { return JSON.parse(localStorage.getItem("emlak-views2") || "[]"); }
  catch (e) { return []; }
}
function renderSideViews() {
  const vs = getViews();
  $("#side-views").innerHTML = vs.length ? vs.map((v, i) =>
    `<button class="sv" data-sv="${i}" title="${esc(v.name)}"><span style="display:inline-flex;width:15px">${icon("eye")}</span><span>${esc(v.name)}</span><span class="del" data-svdel="${i}" title="Sil">×</span></button>`
  ).join("") : '<div class="none">Henüz görünüm yok.<br>Kayıtlar sayfasından kaydedin.</div>';
  $$("#side-views [data-sv]").forEach((b) => b.onclick = (e) => {
    if (e.target.dataset.svdel !== undefined) {
      const arr = getViews(); arr.splice(+b.dataset.sv, 1);
      try { localStorage.setItem("emlak-views2", JSON.stringify(arr)); } catch (err) {}
      renderSideViews(); return;
    }
    Records.applyView(getViews()[+b.dataset.sv]);
    setView("records");
  });
}

/* ---------- başlatma ---------- */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase("tr") === "k") { e.preventDefault(); openPalette(); }
  else if (e.key === "Escape") {
    if ($("#palette-bg")) closePalette();
    else if ($("#modal-bg")) closeModal();
    else if (!$("#drawer").hidden) Detail.close();
  }
});
async function boot() {
  hydrateIcons();
  try { applyTheme(localStorage.getItem("emlak-theme") || "light"); } catch (e) { applyTheme("light"); }
  try { document.body.classList.toggle("compact", localStorage.getItem("emlak-density") === "compact"); } catch (e) {}
  $$("#nav button").forEach((b) => b.onclick = () => setView(b.dataset.view));
  $("#theme-btn").onclick = toggleTheme;
  $("#cmdk-btn").onclick = openPalette;
  $("#btn-export").onclick = () => setView("records").then(() => Records.openExport());
  $("#menu-btn").onclick = () => document.body.classList.toggle("nav-open");
  $("#side-bg").onclick = () => document.body.classList.remove("nav-open");
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "").replace("#/", "");
    if (v && v !== currentView && Views[v]) setView(v);
  });
  try {
    COLS = await api("/api/columns");
    try {
      const saved = JSON.parse(localStorage.getItem("emlak-cols") || "null");
      if (Array.isArray(saved) && saved.length) {
        const vis = new Set(saved);
        COLS.forEach((c) => c.visible = vis.has(c.key));
      }
    } catch (e) {}
    Detail.bind();
    Records.bind();
    await refreshStats();
    renderSideViews();
    const v = (location.hash || "").replace("#/", "");
    await setView(Views[v] ? v : "dashboard");
  } catch (e) {
    $("#view").innerHTML = `<div class="empty">Bağlantı hatası: ${esc(e.message)}</div>`;
  }
}
document.addEventListener("DOMContentLoaded", boot);
