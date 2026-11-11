"use strict";
/* Emlak Kayıt Yönetimi - ön yüz */
const $ = (s) => document.querySelector(s);
const state = { page: 1, per: 50, sort: "", dir: "asc", q: "", filters: {}, tag: "", openTasks: false, hasNotes: false };
let COLS = [], totalRows = 0, totalPages = 1, currentId = null, detail = null, allTags = [];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const PLACEHOLDER = new Set(["Seçiniz", "default"]);

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("Hata " + r.status));
  return data;
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
  let m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "");
  return String(v);
}
function fmtNum(v) {
  const n = parseFloat(String(v).replace(",", "."));
  if (!isFinite(n)) return String(v);
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}
function fmtVal(col, v) {
  if (v === null || v === undefined || v === "") return '<span class="dim">—</span>';
  const s = String(v);
  if (PLACEHOLDER.has(s)) return `<span class="dim">${esc(s)}</span>`;
  if (col.dtype === "number") return esc(fmtNum(s));
  if (col.dtype === "date") return esc(fmtDate(s));
  return esc(s);
}
function dueText(d) { return d ? fmtDate(d) : ""; }
function isOverdue(d) {
  if (!d) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return new Date(d + "T00:00:00") < t;
}

/* ---------- sorgu ---------- */
function buildParams(extra = {}) {
  const p = new URLSearchParams();
  p.set("page", state.page); p.set("per_page", state.per);
  if (state.sort) { p.set("sort", state.sort); p.set("dir", state.dir); }
  if (state.q) p.set("q", state.q);
  if (state.tag) p.set("tag", state.tag);
  if (state.openTasks) p.set("open_tasks", "1");
  if (state.hasNotes) p.set("has_notes", "1");
  for (const [k, v] of Object.entries(state.filters)) if (v !== "") p.set("f_" + k, v);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}
const visCols = () => COLS.filter((c) => c.visible);

/* ---------- başlık + filtreler ---------- */
function renderHead() {
  const cols = visCols();
  let h = '<tr><th style="min-width:120px">Ek</th>';
  for (const c of cols) {
    const arrow = state.sort === c.key ? (state.dir === "asc" ? " ▲" : " ▼") : "";
    h += `<th class="sortable" data-sort="${c.key}"><span class="letter">${c.letter}</span>${esc(c.title)}<span class="arrow">${arrow}</span></th>`;
  }
  h += "</tr><tr class='filters'><th></th>";
  for (const c of cols) {
    const cur = state.filters[c.key] ?? "";
    if (c.filter) {
      h += `<th><select data-f="${c.key}"><option value="">Tümü</option>${c.filter.map((v) =>
        `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></th>`;
    } else {
      h += `<th><input data-f="${c.key}" value="${esc(cur)}" placeholder="filtrele..." autocomplete="off"></th>`;
    }
  }
  $("#grid-head").innerHTML = h + "</tr>";
  document.querySelectorAll("[data-sort]").forEach((th) => th.onclick = () => {
    const k = th.dataset.sort;
    if (state.sort !== k) { state.sort = k; state.dir = "asc"; }
    else if (state.dir === "asc") state.dir = "desc";
    else { state.sort = ""; state.dir = "asc"; }
    state.page = 1; renderHead(); loadRows();
  });
  const onF = debounce((el) => {
    const v = el.value;
    if (v) state.filters[el.dataset.f] = v; else delete state.filters[el.dataset.f];
    state.page = 1; loadRows();
  }, 380);
  document.querySelectorAll("[data-f]").forEach((el) => {
    el.onclick = (e) => e.stopPropagation();
    if (el.tagName === "SELECT") el.onchange = () => onF(el);
    else el.oninput = () => onF(el);
  });
}

/* ---------- satırlar ---------- */
function badgesCell(r) {
  let h = "";
  for (const t of r.tags) h += `<span class="tagchip" style="background:${esc(t.color)}">${esc(t.name)}</span>`;
  if (r.notes_n) h += `<span class="mini notes">📝${r.notes_n}</span>`;
  h += `<span class="mini tasks${r.tasks_open ? "" : " none"}">${r.tasks_open ? "☐" + r.tasks_open : "✓" + r.tasks_n}</span>`;
  return h || '<span class="dim">—</span>';
}
async function loadRows() {
  $("#grid-body").innerHTML = '<tr><td class="loading" colspan="50">yükleniyor...</td></tr>';
  try {
    const d = await api("/api/records?" + buildParams());
    totalRows = d.total;
    totalPages = Math.max(1, Math.ceil(d.total / d.per_page));
    const cols = visCols();
    $("#grid-body").innerHTML = d.rows.map((r) =>
      `<tr data-id="${r.id}"><td>${badgesCell(r)}</td>${cols.map((c) =>
        `<td class="${c.dtype === "number" ? "num" : ""}" title="${esc(r[c.key] ?? "")}">${fmtVal(c, r[c.key])}</td>`).join("")}</tr>`
    ).join("") || '<tr><td class="empty" colspan="50">Kayıt bulunamadı. Filtreleri temizlemeyi deneyin.</td></tr>';
    document.querySelectorAll("#grid-body tr[data-id]").forEach((tr) =>
      tr.onclick = () => openDrawer(+tr.dataset.id));
    renderPager(); renderActiveFilters();
    const a = d.total ? (d.page - 1) * d.per_page + 1 : 0;
    $("#count-info").textContent = d.total ? `${a}–${Math.min(d.total, a + d.rows.length - 1)} / ${d.total.toLocaleString("tr-TR")} kayıt` : "0 kayıt";
  } catch (e) { $("#grid-body").innerHTML = `<tr><td class="empty" colspan="50">Hata: ${esc(e.message)}</td></tr>`; }
}
function renderPager() {
  const h = `<button data-pg="1" ${state.page <= 1 ? "disabled" : ""}>|◀</button>
    <button data-pg="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>◀</button>
    <span class="pg">${state.page} / ${totalPages.toLocaleString("tr-TR")}</span>
    <button data-pg="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>▶</button>
    <button data-pg="${totalPages}" ${state.page >= totalPages ? "disabled" : ""}>▶|</button>`;
  $("#pager-top").innerHTML = h; $("#pager-bottom").innerHTML = h;
  document.querySelectorAll("[data-pg]").forEach((b) => b.onclick = () => {
    state.page = Math.min(totalPages, Math.max(1, +b.dataset.pg));
    loadRows(); document.querySelector(".scroll").scrollTop = 0;
  });
}
function renderActiveFilters() {
  const items = [];
  if (state.q) items.push(["Arama: " + state.q, () => { state.q = ""; $("#q").value = ""; $("#qclear").style.display = "none"; }]);
  if (state.tag) items.push(["Etiket: " + state.tag, () => { state.tag = ""; }]);
  if (state.openTasks) items.push(["Açık görevli", () => { state.openTasks = false; }]);
  if (state.hasNotes) items.push(["Notlu", () => { state.hasNotes = false; }]);
  for (const [k, v] of Object.entries(state.filters)) {
    const c = COLS.find((x) => x.key === k);
    items.push([`${c ? c.title : k}: ${v}`, () => {
      delete state.filters[k];
      const el = document.querySelector(`[data-f="${k}"]`); if (el) el.value = "";
    }]);
  }
  $("#active-filters").innerHTML = items.length
    ? items.map((_, i) => `<button class="chip on" data-af="${i}">${esc(items[i][0])}<span class="x">×</span></button>`).join("") +
      `<button class="chip" data-af="all">Tümünü temizle</button>`
    : '<span class="none">Filtre yok — tüm kayıtlar listeleniyor</span>';
  document.querySelectorAll("[data-af]").forEach((b) => b.onclick = () => {
    if (b.dataset.af === "all") {
      state.filters = {}; state.q = ""; state.tag = ""; state.openTasks = false; state.hasNotes = false;
      $("#q").value = ""; $("#qclear").style.display = "none"; renderHead();
    } else items[+b.dataset.af][1]();
    state.page = 1; loadRows(); loadStats();
  });
}

/* ---------- özet ---------- */
async function loadStats() {
  try {
    const s = await api("/api/stats");
    allTags = s.tags;
    const b = $("#tasks-badge");
    b.hidden = !s.open_tasks; b.textContent = s.open_tasks;
    const chip = (label, n, on, fn) =>
      `<button class="chip${on ? " on" : ""}" data-chip="${fn}:${esc(label)}">${esc(label)}<b>${n.toLocaleString("tr-TR")}</b></button>`;
    let h = `<div class="stat"><div class="n">${s.total.toLocaleString("tr-TR")}</div><div class="l">Toplam kayıt</div></div>`;
    h += `<div class="stat clickable" id="st-tasks"><div class="n">${s.open_tasks}</div><div class="l">Açık görev</div></div>`;
    h += `<div class="stat"><div class="n">${s.notes_total}</div><div class="l">Not</div></div>`;
    h += `<div class="stat"><div class="n">${s.rev_total}</div><div class="l">Revizyon</div></div>`;
    h += `<div class="stat"><div class="l">Durum</div><div class="chips">${s.by_status.map((x) =>
      chip(x.v ?? "—", x.n, state.filters.c9 === x.v, "status")).join("")}</div></div>`;
    h += `<div class="stat"><div class="l">Tür</div><div class="chips">${s.by_type.map((x) =>
      chip(x.v ?? "—", x.n, state.filters.c5 === x.v, "type")).join("")}</div></div>`;
    if (s.tags.length) h += `<div class="stat"><div class="l">Etiketler</div><div class="chips">${s.tags.map((t) =>
      `<button class="chip${state.tag === t.name ? " on" : ""}" data-chip="tag:${esc(t.name)}" style="border-color:${esc(t.color)}">${esc(t.name)}<b>${t.count}</b></button>`).join("")}</div></div>`;
    $("#stats").innerHTML = h;
    $("#st-tasks").onclick = () => openTasksModal();
    document.querySelectorAll("[data-chip]").forEach((el) => el.onclick = () => {
      const [kind, ...rest] = el.dataset.chip.split(":");
      const label = rest.join(":");
      if (kind === "status") {
        if (state.filters.c9 === label) delete state.filters.c9; else state.filters.c9 = label;
        const f = document.querySelector('[data-f="c9"]'); if (f) f.value = state.filters.c9 ?? "";
      } else if (kind === "type") {
        if (state.filters.c5 === label) delete state.filters.c5; else state.filters.c5 = label;
        const f = document.querySelector('[data-f="c5"]'); if (f) f.value = state.filters.c5 ?? "";
      } else if (kind === "tag") {
        state.tag = state.tag === label ? "" : label;
      }
      state.page = 1; loadRows(); loadStats();
    });
  } catch (e) { $("#stats").innerHTML = `<div class="empty">Özet yüklenemedi: ${esc(e.message)}</div>`; }
}

/* ---------- detay çekmecesi ---------- */
function recTitle(r) {
  const id = r.c0 ? "#" + r.c0 : "satır " + r.row_no;
  return `${id} ${r.c1 || ""}`.trim();
}
function recSub(r) {
  return [r.c5, r.c21, r.c9, r.c33, r.c17 ? "☎ " + r.c17 : ""].filter((x) => x && !PLACEHOLDER.has(x)).join(" • ");
}
async function openDrawer(id) {
  currentId = id;
  $("#drawer").hidden = false; $("#drawer-bg").hidden = false;
  $("#drawer-title").textContent = "yükleniyor..."; $("#drawer-sub").textContent = "";
  ["info", "revs", "notes", "tasks", "tags"].forEach((t) => $("#tab-" + t).innerHTML = '<div class="loading">yükleniyor...</div>');
  switchTab("info");
  try {
    detail = await api("/api/records/" + id);
    renderDetail();
  } catch (e) { $("#tab-info").innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; }
}
function closeDrawer() { $("#drawer").hidden = true; $("#drawer-bg").hidden = true; currentId = null; detail = null; }
function switchTab(t) {
  document.querySelectorAll("#drawer-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  ["info", "revs", "notes", "tasks", "tags"].forEach((x) => $("#tab-" + x).hidden = x !== t);
}
function renderDetail() {
  const r = detail.record;
  $("#drawer-title").textContent = recTitle(r);
  $("#drawer-sub").textContent = recSub(r) + `  (Excel satırı: ${r.row_no})`;
  $("#drawer-tags").innerHTML = detail.tags.map((t) =>
    `<span class="tagchip" style="background:${esc(t.color)};color:#fff;border-radius:12px;font-size:11px;padding:1px 8px">${esc(t.name)}</span>`).join("");
  $("#cnt-revs").textContent = detail.revisions.length || "";
  $("#cnt-notes").textContent = detail.notes.length || "";
  $("#cnt-tasks").textContent = detail.tasks.filter((t) => !t.done).length || "";
  renderInfoTab(); renderRevsTab(); renderNotesTab(); renderTasksTab(); renderTagsTab();
}
function renderInfoTab() {
  const r = detail.record;
  let h = '<div class="fgrid">';
  for (const c of COLS) {
    const v = r[c.key] ?? "";
    const long = String(v).length > 70;
    h += `<div class="field${long ? " full" : ""}"><label><span class="letter">${c.letter}</span>${esc(c.title)}</label>`;
    if (c.filter) {
      h += `<select data-k="${c.key}" data-orig="${esc(v)}"><option value="">(boş)</option>${c.filter.map((o) =>
        `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}${v && !c.filter.includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
    } else if (c.dtype === "date" && (!v || /^\d{4}-\d{2}-\d{2}$/.test(v))) {
      h += `<input type="date" data-k="${c.key}" data-orig="${esc(v)}" value="${esc(v)}">`;
    } else if (long) {
      h += `<textarea rows="2" data-k="${c.key}" data-orig="${esc(v)}">${esc(v)}</textarea>`;
    } else {
      h += `<input data-k="${c.key}" data-orig="${esc(v)}" value="${esc(v)}"${c.dtype === "number" ? ' inputmode="decimal"' : ""}>`;
    }
    h += "</div>";
  }
  h += `</div><div class="savebar"><input id="rev-note" placeholder="Revizyon notu (örn: telefon güncellendi)...">
    <button class="btn primary" id="btn-save">💾 Kaydet</button></div>`;
  $("#tab-info").innerHTML = h;
  document.querySelectorAll("#tab-info [data-k]").forEach((el) =>
    el.oninput = () => el.classList.toggle("dirty", el.value !== el.dataset.orig));
  $("#btn-save").onclick = saveRecord;
}
async function saveRecord() {
  const fields = {};
  document.querySelectorAll("#tab-info [data-k].dirty").forEach((el) => fields[el.dataset.k] = el.value);
  if (!Object.keys(fields).length) { toast("Değişiklik yok"); return; }
  try {
    const d = await api("/api/records/" + currentId, {
      method: "PUT", body: JSON.stringify({ fields, note: $("#rev-note").value })
    });
    toast(d.changed.length ? `${d.changed.length} alan güncellendi` : "Değişiklik yok", "ok");
    detail = await api("/api/records/" + currentId);
    renderDetail(); loadRows(); loadStats();
  } catch (e) { toast(e.message, "err"); }
}
function renderRevsTab() {
  $("#tab-revs").innerHTML = detail.revisions.length ? detail.revisions.map((v) =>
    `<div class="rev"><div class="meta">${esc(fmtDate(v.changed_at))} • ${esc(v.col_title)}</div>
     <div class="chg"><span class="old">${esc(v.old_value ?? "—")}</span> → <span class="new">${esc(v.new_value ?? "—")}</span></div>
     ${v.note ? `<div class="note">📝 ${esc(v.note)}</div>` : ""}</div>`).join("")
    : '<div class="empty">Henüz revizyon yok. Bilgiler sekmesinden düzenleme yapın.</div>';
}
function renderNotesTab() {
  let h = `<div class="addrow"><textarea id="new-note" placeholder="Yeni not yazın..."></textarea>
    <button class="btn primary" id="btn-note">Ekle</button></div><div id="note-list">`;
  h += detail.notes.length ? detail.notes.map((n) =>
    `<div class="note" data-nid="${n.id}"><div class="meta"><span>${esc(fmtDate(n.created_at))}</span>
     <span class="ops"><button data-nedit="${n.id}">düzenle</button><button data-ndel="${n.id}">sil</button></span></div>
     <p>${esc(n.text)}</p></div>`).join("") : '<div class="empty">Henüz not yok.</div>';
  $("#tab-notes").innerHTML = h + "</div>";
  $("#btn-note").onclick = async () => {
    const t = $("#new-note").value.trim();
    if (!t) return;
    try {
      await api(`/api/records/${currentId}/notes`, { method: "POST", body: JSON.stringify({ text: t }) });
      toast("Not eklendi", "ok"); await refreshDetail(); loadRows(); loadStats();
    } catch (e) { toast(e.message, "err"); }
  };
  document.querySelectorAll("[data-ndel]").forEach((b) => b.onclick = async () => {
    if (!confirm("Not silinsin mi?")) return;
    await api("/api/notes/" + b.dataset.ndel, { method: "DELETE" });
    toast("Not silindi", "ok"); await refreshDetail(); loadRows(); loadStats();
  });
  document.querySelectorAll("[data-nedit]").forEach((b) => b.onclick = () => {
    const box = document.querySelector(`.note[data-nid="${b.dataset.nedit}"] p`);
    const old = detail.notes.find((n) => n.id == b.dataset.nedit).text;
    box.innerHTML = `<textarea rows="3" style="width:100%">${esc(old)}</textarea>
      <div style="margin-top:6px"><button class="btn small primary" data-nsave="${b.dataset.nedit}">Kaydet</button>
      <button class="btn small" data-ncancel="${b.dataset.nedit}">Vazgeç</button></div>`;
    box.querySelector("[data-nsave]").onclick = async () => {
      const t = box.querySelector("textarea").value.trim();
      if (!t) return;
      await api("/api/notes/" + b.dataset.nedit, { method: "PUT", body: JSON.stringify({ text: t }) });
      toast("Not güncellendi", "ok"); await refreshDetail();
    };
    box.querySelector("[data-ncancel]").onclick = () => refreshDetail();
  });
}
function taskHTML(t, showLabel) {
  return `<div class="task${t.done ? " done" : ""}">
    <input type="checkbox" data-tdone="${t.id}"${t.done ? " checked" : ""}>
    <div class="t">${esc(t.title)}
      ${showLabel && t.label ? `<div class="lbl" data-goto="${t.record_id}">→ ${esc(t.label)}</div>` : ""}
      <div class="due${!t.done && isOverdue(t.due_date) ? " over" : ""}">${t.due_date ? "📅 " + dueText(t.due_date) : "tarih yok"}</div>
    </div>
    <span class="ops"><button data-tdate="${t.id}">tarih</button><button data-tdel="${t.id}">sil</button></span></div>`;
}
function renderTasksTab() {
  let h = `<div class="addrow"><input type="text" id="new-task" placeholder="Yeni görev...">
    <input type="date" id="new-task-due"><button class="btn primary" id="btn-task">Ekle</button></div>`;
  h += detail.tasks.length ? detail.tasks.map((t) => taskHTML(t, false)).join("") : '<div class="empty">Görev yok.</div>';
  $("#tab-tasks").innerHTML = h;
  $("#btn-task").onclick = async () => {
    const title = $("#new-task").value.trim();
    if (!title) return;
    try {
      await api(`/api/records/${currentId}/tasks`, {
        method: "POST", body: JSON.stringify({ title, due_date: $("#new-task-due").value || null })
      });
      toast("Görev eklendi", "ok"); await refreshDetail(); loadRows(); loadStats();
    } catch (e) { toast(e.message, "err"); }
  };
  bindTaskOps($("#tab-tasks"), refreshDetail);
}
function bindTaskOps(root, after) {
  root.querySelectorAll("[data-tdone]").forEach((cb) => cb.onchange = async () => {
    await api("/api/tasks/" + cb.dataset.tdone, { method: "PUT", body: JSON.stringify({ done: cb.checked }) });
    toast(cb.checked ? "Görev tamamlandı" : "Görev açıldı", "ok");
    await after(); loadRows(); loadStats();
  });
  root.querySelectorAll("[data-tdel]").forEach((b) => b.onclick = async () => {
    if (!confirm("Görev silinsin mi?")) return;
    await api("/api/tasks/" + b.dataset.tdel, { method: "DELETE" });
    toast("Görev silindi", "ok"); await after(); loadRows(); loadStats();
  });
  root.querySelectorAll("[data-tdate]").forEach((b) => b.onclick = async () => {
    const v = prompt("Bitiş tarihi (YYYY-AA-GG, boş bırakılabilir):",
      (detail.tasks.find((t) => t.id == b.dataset.tdate) || {}).due_date || "");
    if (v === null) return;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Tarih biçimi YYYY-AA-GG olmalı", "err"); return; }
    await api("/api/tasks/" + b.dataset.tdate, { method: "PUT", body: JSON.stringify({ due_date: v || null }) });
    toast("Tarih güncellendi", "ok"); await after();
  });
  root.querySelectorAll("[data-goto]").forEach((el) => el.onclick = () => { closeModal(); openDrawer(+el.dataset.goto); });
}
async function refreshDetail() {
  detail = await api("/api/records/" + currentId);
  renderDetail();
}
function renderTagsTab() {
  const mine = new Set(detail.tags.map((t) => t.id));
  let h = "<h4 style='margin:0 0 8px'>Bu kayıttakiler</h4>";
  h += detail.tags.length ? detail.tags.map((t) =>
    `<div class="tagrow"><span class="dot" style="background:${esc(t.color)}"></span>
     <span class="nm">${esc(t.name)}</span><button class="btn small" data-untag="${t.id}">kaldır</button></div>`).join("")
    : '<div class="empty">Etiket yok.</div>';
  h += "<h4 style='margin:14px 0 8px'>Ekle</h4>";
  const others = allTags.filter((t) => !mine.has(t.id));
  h += others.length ? others.map((t) =>
    `<div class="tagrow"><span class="dot" style="background:${esc(t.color)}"></span>
     <span class="nm">${esc(t.name)}</span><button class="btn small" data-tag="${t.id}">ekle</button></div>`).join("")
    : '<div class="empty">Eklenecek başka etiket yok.</div>';
  h += `<h4 style='margin:14px 0 8px'>Yeni etiket</h4>
    <div class="addrow"><input type="text" id="new-tag-name" placeholder="Etiket adı...">
    <input type="color" id="new-tag-color" value="#2563eb"><button class="btn primary" id="btn-newtag">Oluştur ve ekle</button></div>`;
  $("#tab-tags").innerHTML = h;
  document.querySelectorAll("[data-untag]").forEach((b) => b.onclick = async () => {
    await api(`/api/records/${currentId}/tags/${b.dataset.untag}`, { method: "DELETE" });
    await refreshDetail(); loadRows(); loadStats();
  });
  document.querySelectorAll("[data-tag]").forEach((b) => b.onclick = async () => {
    await api(`/api/records/${currentId}/tags`, { method: "POST", body: JSON.stringify({ tag_id: +b.dataset.tag }) });
    toast("Etiket eklendi", "ok"); await refreshDetail(); loadRows(); loadStats();
  });
  $("#btn-newtag").onclick = async () => {
    const name = $("#new-tag-name").value.trim();
    if (!name) return;
    await api(`/api/records/${currentId}/tags`, {
      method: "POST", body: JSON.stringify({ name, color: $("#new-tag-color").value })
    });
    toast("Etiket oluşturuldu", "ok"); await refreshDetail(); loadRows(); loadStats();
  };
}

/* ---------- modal ---------- */
function openModal(title, bodyHTML, wide = false) {
  closeModal();
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "modal-bg";
  bg.innerHTML = `<div class="modal${wide ? " wide" : ""}"><div class="modal-head"><span>${title}</span>
    <button class="btn icon" id="modal-x">✕</button></div><div class="modal-body">${bodyHTML}</div></div>`;
  document.body.appendChild(bg);
  $("#modal-x").onclick = closeModal;
  bg.onclick = (e) => { if (e.target === bg) closeModal(); };
  return bg;
}
function closeModal() { const m = $("#modal-bg"); if (m) m.remove(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); } });

/* ---------- genel görevler ---------- */
let taskFilter = "0", taskQ = "";
async function openTasksModal() {
  openModal("✓ Görevler", `<div class="seg">
      <button data-tf="0" class="${taskFilter === "0" ? "on" : ""}">Açık</button>
      <button data-tf="1" class="${taskFilter === "1" ? "on" : ""}">Tamamlanan</button>
      <button data-tf="" class="${taskFilter === "" ? "on" : ""}">Tümü</button></div>
    <div class="addrow"><input type="text" id="task-q" placeholder="Görev ara..." value="${esc(taskQ)}"></div>
    <div id="task-list"><div class="loading">yükleniyor...</div></div>`, true);
  document.querySelectorAll("[data-tf]").forEach((b) => b.onclick = () => { taskFilter = b.dataset.tf; openTasksModal(); });
  $("#task-q").oninput = debounce((e) => { taskQ = e.target.value; fillTaskList(); }, 350);
  await fillTaskList();
}
async function fillTaskList() {
  const p = new URLSearchParams();
  if (taskFilter !== "") p.set("done", taskFilter);
  if (taskQ) p.set("q", taskQ);
  const list = await api("/api/tasks?" + p);
  const box = $("#task-list");
  if (!box) return;
  box.innerHTML = list.length ? list.map((t) => taskHTML(t, true)).join("") : '<div class="empty">Görev yok.</div>';
  bindTaskOps(box, fillTaskList);
}

/* ---------- etiket yönetimi ---------- */
async function openTagsModal() {
  const tags = await api("/api/tags");
  allTags = tags;
  openModal("🏷 Etiketler", `
    <div class="addrow"><input type="text" id="tm-name" placeholder="Yeni etiket adı...">
    <input type="color" id="tm-color" value="#2563eb"><button class="btn primary" id="tm-add">Ekle</button></div>
    <div id="tm-list">${tags.length ? tags.map((t) =>
      `<div class="tagrow"><input type="color" value="${esc(t.color)}" data-tcolor="${t.id}" title="Renk">
       <input type="text" value="${esc(t.name)}" data-tname="${t.id}" style="flex:1;border:1px solid var(--line);border-radius:6px;padding:5px 8px">
       <span class="chip">${t.count} kayıt</span>
       <button class="btn small" data-tfilter="${esc(t.name)}">filtrele</button>
       <button class="btn small danger" data-tdelm="${t.id}">sil</button></div>`).join("")
      : '<div class="empty">Henüz etiket yok.</div>'}</div>`);
  $("#tm-add").onclick = async () => {
    const name = $("#tm-name").value.trim();
    if (!name) return;
    await api("/api/tags", { method: "POST", body: JSON.stringify({ name, color: $("#tm-color").value }) });
    toast("Etiket oluşturuldu", "ok"); await openTagsModal(); loadStats();
  };
  document.querySelectorAll("[data-tdelm]").forEach((b) => b.onclick = async () => {
    if (!confirm("Etiket silinsin mi? (kayıtlardan da kaldırılır)")) return;
    await api("/api/tags/" + b.dataset.tdelm, { method: "DELETE" });
    toast("Etiket silindi", "ok"); await openTagsModal(); loadRows(); loadStats();
  });
  document.querySelectorAll("[data-tfilter]").forEach((b) => b.onclick = () => {
    state.tag = b.dataset.tfilter; state.page = 1; closeModal(); loadRows(); loadStats();
  });
  const saveTag = async (id) => {
    const name = document.querySelector(`[data-tname="${id}"]`).value.trim();
    const color = document.querySelector(`[data-tcolor="${id}"]`).value;
    if (!name) return;
    try {
      await api("/api/tags/" + id, { method: "PUT", body: JSON.stringify({ name, color }) });
      toast("Etiket güncellendi", "ok"); loadStats();
    } catch (e) { toast(e.message, "err"); }
  };
  document.querySelectorAll("[data-tname]").forEach((el) =>
    el.onchange = () => saveTag(el.dataset.tname));
  document.querySelectorAll("[data-tcolor]").forEach((el) =>
    el.onchange = () => saveTag(el.dataset.tcolor));
}

/* ---------- sütunlar ---------- */
function openColsModal() {
  openModal("☰ Sütunlar", `
    <div class="seg"><button id="col-all">Tümü</button><button id="col-def">Varsayılan</button></div>
    <div class="cols-grid">${COLS.map((c) =>
      `<label><input type="checkbox" data-col="${c.key}"${c.visible ? " checked" : ""}>
       <b>${c.letter}</b> ${esc(c.title)}</label>`).join("")}</div>
    <div class="modal-foot"><button class="btn primary" id="col-ok">Uygula</button></div>`, true);
  $("#col-all").onclick = () => document.querySelectorAll("[data-col]").forEach((el) => el.checked = true);
  $("#col-def").onclick = () => document.querySelectorAll("[data-col]").forEach((el) =>
    el.checked = !["c35","c36","c37","c38","c39","c40","c41","c42","c43","c44"].includes(el.dataset.col));
  $("#col-ok").onclick = () => {
    const vis = new Set([...document.querySelectorAll("[data-col]:checked")].map((el) => el.dataset.col));
    if (!vis.size) { toast("En az bir sütun seçin", "err"); return; }
    COLS.forEach((c) => c.visible = vis.has(c.key));
    try { localStorage.setItem("emlak-cols", JSON.stringify([...vis])); } catch (e) {}
    closeModal(); renderHead(); loadRows();
  };
}

/* ---------- dışa aktarma ---------- */
function openExportModal() {
  openModal("⬇ Dışa Aktar", `
    <p>Mevcut filtrelerle <b>${totalRows.toLocaleString("tr-TR")} kayıt</b> indirilecek (sıralama dahil).</p>
    <div class="seg"><button data-xf="csv" class="on">CSV (Excel uyumlu)</button>
    <button data-xf="xlsx">XLSX</button></div>
    <div class="modal-foot"><button class="btn primary" id="dl">İndir</button></div>`);
  let fmt = "csv";
  document.querySelectorAll("[data-xf]").forEach((b) => b.onclick = () => {
    fmt = b.dataset.xf;
    document.querySelectorAll("[data-xf]").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#dl").onclick = () => {
    window.location = "/api/export?" + buildParams({ format: fmt });
    closeModal(); toast("İndirme başladı", "ok");
  };
}

/* ---------- başlatma ---------- */
async function init() {
  $("#q").oninput = debounce((e) => {
    state.q = e.target.value.trim(); state.page = 1;
    $("#qclear").style.display = state.q ? "block" : "none";
    loadRows();
  }, 350);
  $("#qclear").onclick = () => { $("#q").value = ""; state.q = ""; state.page = 1; $("#qclear").style.display = "none"; loadRows(); };
  $("#perpage").onchange = (e) => { state.per = +e.target.value; state.page = 1; loadRows(); };
  $("#btn-tasks").onclick = openTasksModal;
  $("#btn-tags").onclick = openTagsModal;
  $("#btn-cols").onclick = openColsModal;
  $("#btn-export").onclick = openExportModal;
  $("#drawer-close").onclick = closeDrawer;
  $("#drawer-bg").onclick = closeDrawer;
  document.querySelectorAll("#drawer-tabs button").forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
  try {
    COLS = await api("/api/columns");
    try {
      const saved = JSON.parse(localStorage.getItem("emlak-cols") || "null");
      if (Array.isArray(saved) && saved.length) {
        const vis = new Set(saved);
        COLS.forEach((c) => c.visible = vis.has(c.key));
      }
    } catch (e) {}
    renderHead();
    await loadStats();
    await loadRows();
  } catch (e) {
    $("#grid-body").innerHTML = `<tr><td class="empty" colspan="50">Bağlantı hatası: ${esc(e.message)}</td></tr>`;
  }
}
init();
