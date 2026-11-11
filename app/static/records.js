"use strict";
/* Emlak Panel v2 — kayıtlar görünümü */
const Records = (() => {
  const S = { page: 1, per: 50, sort: "", dir: "asc", q: "", filters: {}, tag: "", openTasks: false, hasNotes: false, selected: new Set() };
  let total = 0, pages = 1, pageIds = [];

  const visCols = () => COLS.filter((c) => c.visible);
  const MONEY = new Set(["c7", "c11", "c15", "c19", "c23"]);
  const PILL_COLS = new Set(["c5", "c9", "c10"]);

  function params(extra = {}) {
    const p = new URLSearchParams();
    p.set("page", S.page); p.set("per_page", S.per);
    if (S.sort) { p.set("sort", S.sort); p.set("dir", S.dir); }
    if (S.q) p.set("q", S.q);
    if (S.tag) p.set("tag", S.tag);
    if (S.openTasks) p.set("open_tasks", "1");
    if (S.hasNotes) p.set("has_notes", "1");
    for (const [k, v] of Object.entries(S.filters)) if (v !== "") p.set("f_" + k, v);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }

  function cellHTML(c, v) {
    if (PILL_COLS.has(c.key)) return pill(v);
    return fmtVal(c, v);
  }
  function badgesHTML(r) {
    let h = "";
    for (const t of r.tags) h += `<span class="tagchip" style="background:${esc(t.color)}">${esc(t.name)}</span>`;
    if (r.notes_n) h += `<span class="mini has">✎ ${r.notes_n}</span>`;
    if (r.tasks_open) h += `<span class="mini warn">☐ ${r.tasks_open}</span>`;
    else if (r.tasks_n) h += `<span class="mini">✓ ${r.tasks_n}</span>`;
    return h || '<span class="dim">—</span>';
  }

  function renderHead() {
    const cols = visCols();
    let h = `<tr><th style="width:34px"><input type="checkbox" class="cb" id="sel-all" title="Sayfayı seç"></th><th style="min-width:110px">Ek</th>`;
    for (const c of cols) {
      const arrow = S.sort === c.key ? (S.dir === "asc" ? " ▲" : " ▼") : "";
      h += `<th class="sortable" data-sort="${c.key}" title="${esc(c.title)}">${esc(c.title)}<span class="arrow">${arrow}</span></th>`;
    }
    h += `</tr><tr class="filters"><th></th><th></th>`;
    for (const c of cols) {
      const cur = S.filters[c.key] ?? "";
      if (c.filter) {
        h += `<th><select data-f="${c.key}"><option value="">Tümü</option>${c.filter.map((v) =>
          `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></th>`;
      } else {
        h += `<th><input data-f="${c.key}" value="${esc(cur)}" placeholder="Filtrele…" autocomplete="off"></th>`;
      }
    }
    $("#grid-head").innerHTML = h + "</tr>";
    $$("#grid-head [data-sort]").forEach((th) => th.onclick = () => {
      const k = th.dataset.sort;
      if (S.sort !== k) { S.sort = k; S.dir = "asc"; }
      else if (S.dir === "asc") S.dir = "desc";
      else { S.sort = ""; S.dir = "asc"; }
      S.page = 1; renderHead(); load();
    });
    const onF = debounce((el) => {
      if (el.value) S.filters[el.dataset.f] = el.value; else delete S.filters[el.dataset.f];
      S.page = 1; S.selected.clear(); load();
    }, 380);
    $$("#grid-head [data-f]").forEach((el) => {
      el.onclick = (e) => e.stopPropagation();
      if (el.tagName === "SELECT") el.onchange = () => onF(el);
      else el.oninput = () => onF(el);
    });
    const sa = $("#sel-all");
    sa.checked = pageIds.length > 0 && pageIds.every((id) => S.selected.has(id));
    sa.onchange = () => {
      if (sa.checked) pageIds.forEach((id) => S.selected.add(id));
      else pageIds.forEach((id) => S.selected.delete(id));
      load();
    };
  }

  async function load() {
    const tb = $("#grid-body");
    if (!tb) return;
    tb.innerHTML = '<tr><td class="loading" colspan="60">yükleniyor…</td></tr>';
    try {
      const d = await api("/api/records?" + params());
      total = d.total;
      pages = Math.max(1, Math.ceil(d.total / d.per_page));
      pageIds = d.rows.map((r) => r.id);
      const cols = visCols();
      tb.innerHTML = d.rows.map((r) =>
        `<tr data-id="${r.id}" class="${S.selected.has(r.id) ? "sel" : ""}">
          <td><input type="checkbox" class="cb" data-sel="${r.id}"${S.selected.has(r.id) ? " checked" : ""}></td>
          <td>${badgesHTML(r)}</td>${cols.map((c) =>
          `<td class="${c.dtype === "number" ? "num" : ""}" title="${esc(r[c.key] ?? "")}">${cellHTML(c, r[c.key])}</td>`).join("")}</tr>`
      ).join("") || '<tr><td class="empty" colspan="60">Kayıt bulunamadı. Filtreleri temizlemeyi deneyin.</td></tr>';
      $$("#grid-body tr[data-id]").forEach((tr) => tr.onclick = (e) => {
        if (e.target.dataset.sel !== undefined) return;
        Detail.open(+tr.dataset.id);
      });
      $$("#grid-body [data-sel]").forEach((cb) => cb.onchange = () => {
        const id = +cb.dataset.sel;
        if (cb.checked) S.selected.add(id); else S.selected.delete(id);
        cb.closest("tr").classList.toggle("sel", cb.checked);
        renderBulk(); renderHeadSel();
      });
      renderHeadSel(); renderPager(); renderChips(); renderBulk();
      const a = d.total ? (d.page - 1) * d.per_page + 1 : 0;
      $("#count-info").textContent = d.total
        ? `${a.toLocaleString("tr-TR")}–${Math.min(d.total, a + d.rows.length - 1).toLocaleString("tr-TR")} / ${d.total.toLocaleString("tr-TR")} kayıt`
        : "0 kayıt";
      loadAgg();
    } catch (e) { tb.innerHTML = `<tr><td class="empty" colspan="60">Hata: ${esc(e.message)}</td></tr>`; }
  }

  async function loadAgg() {
    const box = $("#agg-strip");
    if (!box) return;
    try {
      const [sale, rent] = await Promise.all([
        api("/api/aggregate?" + params({ col: "c23" })),
        api("/api/aggregate?" + params({ col: "c7" })),
      ]);
      box.innerHTML =
        `<div class="agg"><span class="l">Satış toplamı</span><b>${fmtMoney(sale.sum)}</b></div>
         <div class="agg"><span class="l">Satış ort.</span><b>${fmtMoney(sale.avg)}</b></div>
         <div class="agg"><span class="l">Kira ort.</span><b>${fmtMoney(rent.avg)}</b></div>
         <div class="agg"><span class="l">Fiyatlı kayıt</span><b>${(sale.count || 0).toLocaleString("tr-TR")}</b></div>`;
    } catch (e) { box.innerHTML = ""; }
  }

  function renderHeadSel() {
    const sa = $("#sel-all");
    if (sa) sa.checked = pageIds.length > 0 && pageIds.every((id) => S.selected.has(id));
  }

  function renderPager() {
    const h = `<button data-pg="1" ${S.page <= 1 ? "disabled" : ""}>|◀</button>
      <button data-pg="${S.page - 1}" ${S.page <= 1 ? "disabled" : ""}>◀</button>
      <span class="pg">${S.page.toLocaleString("tr-TR")} / ${pages.toLocaleString("tr-TR")}</span>
      <button data-pg="${S.page + 1}" ${S.page >= pages ? "disabled" : ""}>▶</button>
      <button data-pg="${pages}" ${S.page >= pages ? "disabled" : ""}>▶|</button>`;
    const t = $("#pager-top"), b = $("#pager-bottom");
    if (t) t.innerHTML = h;
    if (b) b.innerHTML = h;
    $$("[data-pg]").forEach((x) => x.onclick = () => {
      S.page = Math.min(pages, Math.max(1, +x.dataset.pg));
      load();
      const sc = $(".scroll"); if (sc) sc.scrollTop = 0;
    });
  }

  function renderChips() {
    const items = [];
    if (S.q) items.push(["Ara: " + S.q, () => { S.q = ""; const i = $("#rq"); if (i) i.value = ""; }]);
    if (S.tag) items.push(["Etiket: " + S.tag, () => { S.tag = ""; }]);
    if (S.openTasks) items.push(["Açık görevli", () => { S.openTasks = false; }]);
    if (S.hasNotes) items.push(["Notlu", () => { S.hasNotes = false; }]);
    for (const [k, v] of Object.entries(S.filters)) {
      const c = COLS.find((x) => x.key === k);
      items.push([`${c ? c.title : k}: ${v}`, () => {
        delete S.filters[k];
        const el = document.querySelector(`[data-f="${k}"]`); if (el) el.value = "";
      }]);
    }
    $("#active-filters").innerHTML = items.length
      ? items.map((it, i) => `<span class="chip">${esc(it[0])}<button data-chip="${i}">×</button></span>`).join("") +
        `<button class="chip clear" data-chip="all">Tümünü temizle</button>`
      : "";
    $$("#active-filters [data-chip]").forEach((b) => b.onclick = () => {
      if (b.dataset.chip === "all") clearFilters();
      else items[+b.dataset.chip][1]();
      S.page = 1; S.selected.clear(); load();
    });
  }

  function renderBulk() {
    const bar = $("#bulkbar");
    if (!bar) return;
    if (!S.selected.size) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `<b>${S.selected.size.toLocaleString("tr-TR")} kayıt seçili</b>
      <button class="btn small" id="bulk-tag">Etiket ata</button>
      <button class="btn small" id="bulk-task">Görev oluştur</button>
      <button class="btn small" id="bulk-clear">Seçimi temizle</button>`;
    $("#bulk-clear").onclick = () => { S.selected.clear(); load(); };
    $("#bulk-tag").onclick = openBulkTag;
    $("#bulk-task").onclick = openBulkTask;
  }

  async function openBulkTag() {
    const tags = await api("/api/tags");
    const bg = openModal(`Etiket ata (${S.selected.size} kayıt)`, `
      <div class="mrow"><label>Mevcut etiket</label><select id="bt-sel">
        <option value="">— seçin —</option>${tags.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>
      <div class="mrow"><label>veya yeni etiket</label>
        <div style="display:flex;gap:8px"><input type="text" id="bt-name" placeholder="Etiket adı…" style="flex:1">
        <input type="color" id="bt-color" value="#4f46e5"></div></div>`, {
      foot: `<button class="btn" id="bt-no">Vazgeç</button><button class="btn primary" id="bt-ok">Ata</button>`
    });
    $("#bt-no", bg).onclick = closeModal;
    $("#bt-ok", bg).onclick = async () => {
      const body = { record_ids: [...S.selected] };
      if ($("#bt-sel", bg).value) body.tag_id = +$("#bt-sel", bg).value;
      else if ($("#bt-name", bg).value.trim()) { body.name = $("#bt-name", bg).value.trim(); body.color = $("#bt-color", bg).value; }
      else { toast("Etiket seçin veya yazın", "err"); return; }
      try {
        const d = await api("/api/bulk/tags", { method: "POST", body: JSON.stringify(body) });
        closeModal(); toast(`${d.count} kayda etiket atandı`, "ok");
        S.selected.clear(); load(); refreshStats();
      } catch (e) { toast(e.message, "err"); }
    };
  }

  function openBulkTask() {
    const bg = openModal(`Görev oluştur (${S.selected.size} kayıt)`, `
      <div class="mrow"><label>Görev</label><input type="text" id="bk-t" placeholder="Örn: Kiracıyı arayın"></div>
      <div class="mrow"><label>Bitiş tarihi</label><input type="date" id="bk-d"></div>`, {
      foot: `<button class="btn" id="bk-no">Vazgeç</button><button class="btn primary" id="bk-ok">Oluştur</button>`
    });
    $("#bk-no", bg).onclick = closeModal;
    $("#bk-ok", bg).onclick = async () => {
      const title = $("#bk-t", bg).value.trim();
      if (!title) { toast("Görev yazın", "err"); return; }
      try {
        const d = await api("/api/bulk/tasks", {
          method: "POST",
          body: JSON.stringify({ record_ids: [...S.selected], title, due_date: $("#bk-d", bg).value || null })
        });
        closeModal(); toast(`${d.count} kayda görev eklendi`, "ok");
        S.selected.clear(); load(); refreshStats();
      } catch (e) { toast(e.message, "err"); }
    };
  }

  function openCols() {
    const bg = openModal("Sütunlar", `
      <div class="seg" style="margin-bottom:12px"><button id="col-all">Tümü</button><button id="col-def">Varsayılan</button></div>
      <div class="cols-grid">${COLS.map((c) =>
        `<label><input type="checkbox" class="cb" data-col="${c.key}"${c.visible ? " checked" : ""}>
         <b>${c.letter}</b><span>${esc(c.title)}</span></label>`).join("")}</div>`, {
      wide: true, foot: `<button class="btn primary" id="col-ok">Uygula</button>`
    });
    $("#col-all", bg).onclick = () => $$("[data-col]", bg).forEach((el) => el.checked = true);
    $("#col-def", bg).onclick = () => $$("[data-col]", bg).forEach((el) =>
      el.checked = !["c35", "c36", "c37", "c38", "c39", "c40", "c41", "c42", "c43", "c44"].includes(el.dataset.col));
    $("#col-ok", bg).onclick = () => {
      const vis = new Set($$("[data-col]:checked", bg).map((el) => el.dataset.col));
      if (!vis.size) { toast("En az bir sütun seçin", "err"); return; }
      COLS.forEach((c) => c.visible = vis.has(c.key));
      try { localStorage.setItem("emlak-cols", JSON.stringify([...vis])); } catch (e) {}
      closeModal(); renderHead(); load();
    };
  }

  function openExport() {
    const bg = openModal("Dışa Aktar", `
      <p style="margin-top:0">Mevcut filtrelerle <b>${total.toLocaleString("tr-TR")} kayıt</b> indirilecek (sıralama dahil).</p>
      <div class="seg" style="margin-bottom:6px"><button data-xf="csv" class="on">CSV (Excel uyumlu)</button>
      <button data-xf="xlsx">XLSX</button></div>`, {
      foot: `<button class="btn" id="x-no">Vazgeç</button><button class="btn primary" id="x-ok">İndir</button>`
    });
    let fmt = "csv";
    $$("[data-xf]", bg).forEach((b) => b.onclick = () => {
      fmt = b.dataset.xf;
      $$("[data-xf]", bg).forEach((x) => x.classList.toggle("on", x === b));
    });
    $("#x-no", bg).onclick = closeModal;
    $("#x-ok", bg).onclick = () => {
      window.location = "/api/export?" + params({ format: fmt });
      closeModal(); toast("İndirme başladı", "ok");
    };
  }

  /* kayıtlı görünümler */
  function snap() {
    return { q: S.q, filters: { ...S.filters }, tag: S.tag, sort: S.sort, dir: S.dir, openTasks: S.openTasks, hasNotes: S.hasNotes };
  }
  async function saveView() {
    const name = await promptDlg("Görünüm kaydet", { placeholder: "Örn: Satılık daireler", label: "Görünüm adı (mevcut filtre + sıralama kaydedilir)" });
    if (!name) return;
    const vs = getViews();
    vs.push({ name, snap: snap() });
    try { localStorage.setItem("emlak-views2", JSON.stringify(vs)); } catch (e) {}
    renderSideViews();
    toast(`"${name}" kaydedildi`, "ok");
  }
  function applyView(v) {
    if (!v) return;
    const s = v.snap || {};
    S.q = s.q || ""; S.filters = { ...(s.filters || {}) }; S.tag = s.tag || "";
    S.sort = s.sort || ""; S.dir = s.dir || "asc";
    S.openTasks = !!s.openTasks; S.hasNotes = !!s.hasNotes;
    S.page = 1; S.selected.clear();
    const q = $("#rq"); if (q) q.value = S.q;
    renderHead(); load();
    toast(`"${v.name}" uygulandı`, "ok");
  }
  function clearFilters() {
    S.filters = {}; S.q = ""; S.tag = ""; S.openTasks = false; S.hasNotes = false;
    S.page = 1; S.selected.clear();
    const q = $("#rq"); if (q) q.value = "";
    renderHead();
  }

  async function render(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Kayıtlar</h1><div class="sub">Filtrele, sırala, seç, düzenle — değişiklikler revizyonlu kaydedilir</div></div>
        <div class="head-actions">
          <button class="btn" id="btn-saveview">${icon("save")}<span>Görünümü kaydet</span></button>
          <button class="btn" id="btn-density">${icon("table")}<span>Sıkışık</span></button>
          <button class="btn" id="btn-cols">${icon("cols")}<span>Sütunlar</span></button>
          <button class="btn primary" id="btn-exp">${icon("download")}<span>Dışa Aktar</span></button>
        </div></div>
      <div class="agg-strip" id="agg-strip"></div>
      <div class="card table-card">
        <div class="ttoolbar">
          <div class="tsearch">${icon("search")}<input id="rq" placeholder="Kayıtlarda ara: ad, adres, telefon, proje…" value="${esc(S.q)}" autocomplete="off"></div>
          <div class="chips" id="active-filters"></div>
          <div class="pager" id="pager-top" style="margin-left:auto"></div>
        </div>
        <div class="bulkbar" id="bulkbar" hidden></div>
        <div class="scroll"><table class="grid"><thead id="grid-head"></thead><tbody id="grid-body"></tbody></table></div>
        <div class="tfoot">
          <div class="count" id="count-info"></div>
          <div class="pager" id="pager-bottom"></div>
          <label class="perpage">Sayfa başına <select id="perpage">
            <option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
          </select></label>
        </div>
      </div>`;
    const pp = $("#perpage"); pp.value = String(S.per);
    pp.onchange = () => { S.per = +pp.value; S.page = 1; load(); };
    $("#rq").oninput = debounce((e) => { S.q = e.target.value.trim(); S.page = 1; S.selected.clear(); load(); }, 350);
    $("#btn-cols").onclick = openCols;
    $("#btn-exp").onclick = openExport;
    $("#btn-saveview").onclick = saveView;
    const db = $("#btn-density");
    const paintDensity = () => db.querySelector("span").textContent = document.body.classList.contains("compact") ? "Rahat" : "Sıkışık";
    paintDensity();
    db.onclick = () => {
      document.body.classList.toggle("compact");
      try { localStorage.setItem("emlak-density", document.body.classList.contains("compact") ? "compact" : "cozy"); } catch (e) {}
      paintDensity();
    };
    renderHead();
    await load();
  }

  function bind() { /* görünüm ilk açılışta render edilir */ }
  function refreshIfActive() { if (currentView === "records" && $("#grid-body")) load(); }

  return { render, bind, openExport, applyView, clearAll: () => { clearFilters(); load(); }, refreshIfActive, state: S };
})();
Views.records = Records;
