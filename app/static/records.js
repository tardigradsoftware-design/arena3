"use strict";
/* Emlak Panel v2 — kayıtlar görünümü */
const Records = (() => {
  const S = { page: 1, per: 50, sort: "", dir: "asc", q: "", filters: {}, tag: "", openTasks: false, hasNotes: false, selected: new Set() };
  let total = 0, pages = 1, pageIds = [];
  let lastSync = null;

  const visCols = () => COLS.filter((c) => c.visible);
  const PILL_COLS = new Set(["c5", "c9", "c10"]);
  const NEW_FIELDS = ["c0", "c1", "c2", "c3", "c5", "c6", "c7", "c9", "c10", "c11", "c13", "c15", "c17", "c19", "c21", "c23", "c24", "c25", "c27", "c28", "c32", "c33", "c34", "c37"];
  const CMP_FIELDS = ["c0", "c1", "c2", "c3", "c5", "c6", "c7", "c9", "c10", "c11", "c13", "c15", "c17", "c19", "c21", "c23", "c24", "c25", "c27", "c28", "c32", "c33", "c34"];
  const byKey = (k) => COLS.find((c) => c.key === k);

  function params(extra = {}) {
    const p = new URLSearchParams();
    p.set("page", S.page); p.set("per_page", S.per);
    if (S.sort) { p.set("sort", S.sort); p.set("dir", S.dir); }
    if (S.q) p.set("q", S.q);
    if (S.tag) p.set("tag", S.tag);
    if (S.openTasks) p.set("open_tasks", "1");
    if (S.hasNotes) p.set("has_notes", "1");
    for (const [k, v] of Object.entries(S.filters)) {
      if (Array.isArray(v)) v.forEach((x) => { if (x !== "") p.append("f_" + k, x); });
      else if (v !== "") p.set("f_" + k, v);
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }
  function normFilters(f) {
    const o = {};
    for (const [k, v] of Object.entries(f || {})) {
      const c = byKey(k);
      if (c && c.filter) {
        const arr = (Array.isArray(v) ? v : (v !== "" ? [v] : [])).filter((x) => x !== "");
        if (arr.length) o[k] = arr;
      } else if (v !== "") o[k] = v;
    }
    return o;
  }

  function cellHTML(c, v) {
    if (PILL_COLS.has(c.key)) return pill(v);
    return fmtVal(c, v);
  }
  function badgesHTML(r) {
    let h = "";
    if (r.sync_state === "deleted") h += `<span class="pill red">Excel'de silinmiş</span> `;
    if (r.sync_state === "manual") h += `<span class="pill violet">Manuel</span> `;
    for (const t of r.tags) h += `<span class="tagchip" style="background:${esc(t.color)}">${esc(t.name)}</span>`;
    if (r.notes_n) h += `<span class="mini has">✎ ${r.notes_n}</span>`;
    if (r.tasks_open) h += `<span class="mini warn">☐ ${r.tasks_open}</span>`;
    else if (r.tasks_n) h += `<span class="mini">✓ ${r.tasks_n}</span>`;
    return h || '<span class="dim">—</span>';
  }

  /* ---------- çoklu seçim bileşeni ---------- */
  let openPanel = null;
  function multiValues(key) {
    const v = S.filters[key];
    return Array.isArray(v) ? v : (v ? [v] : []);
  }
  function paintMulti(key) {
    const root = document.querySelector(`[data-mf="${key}"]`);
    if (!root) return;
    const vals = multiValues(key);
    const lbl = root.querySelector(".msel-lbl");
    const btn = root.querySelector(".msel-btn");
    if (!vals.length) { lbl.textContent = "Tümü"; btn.classList.remove("has"); btn.title = ""; }
    else if (vals.length === 1) { lbl.textContent = vals[0]; btn.classList.add("has"); btn.title = vals[0]; }
    else { lbl.textContent = `${vals.length} seçili`; btn.classList.add("has"); btn.title = vals.join(", "); }
  }
  function closeMulti() {
    if (!openPanel) return;
    openPanel.el.remove();
    openPanel = null;
    document.removeEventListener("mousedown", outsideMulti, true);
  }
  function outsideMulti(e) {
    if (openPanel && !openPanel.el.contains(e.target) && !openPanel.root.contains(e.target)) closeMulti();
  }
  function toggleMulti(key) {
    const root = document.querySelector(`[data-mf="${key}"]`);
    if (!root) return;
    if (openPanel && openPanel.key === key) { closeMulti(); return; }
    closeMulti();
    const c = byKey(key);
    const vals = new Set(multiValues(key));
    const el = document.createElement("div");
    el.className = "msel-panel";
    el.innerHTML = `
      <div class="msel-tools"><button data-msall>Tümü</button><button data-msclear>Temizle</button></div>
      <input class="msel-filter" placeholder="Ara…" autocomplete="off">
      <div class="msel-list">${c.filter.map((v) =>
        `<label class="msel-item" data-val="${esc(v.toLocaleLowerCase("tr"))}"><input type="checkbox" class="cb" data-msval="${esc(v)}"${vals.has(v) ? " checked" : ""}><span>${esc(v)}</span></label>`).join("")}</div>`;
    document.body.appendChild(el);
    const r = root.querySelector(".msel-btn").getBoundingClientRect();
    el.style.minWidth = Math.max(210, r.width) + "px";
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 250)) + "px";
    el.style.top = (r.bottom + 4) + "px";
    const h = el.offsetHeight;
    if (r.bottom + 4 + h > window.innerHeight && r.top - 4 - h > 0) el.style.top = (r.top - 4 - h) + "px";
    openPanel = { key, el, root };
    document.addEventListener("mousedown", outsideMulti, true);
    const commit = () => { S.page = 1; S.selected.clear(); paintMulti(key); load(); };
    $$("[data-msval]", el).forEach((cb) => cb.onchange = () => {
      const cur = new Set(multiValues(key));
      if (cb.checked) cur.add(cb.dataset.msval); else cur.delete(cb.dataset.msval);
      if (cur.size) S.filters[key] = [...cur]; else delete S.filters[key];
      commit();
    });
    $("[data-msall]", el).onclick = () => {
      S.filters[key] = [...c.filter];
      $$("[data-msval]", el).forEach((x) => x.checked = true);
      commit();
    };
    $("[data-msclear]", el).onclick = () => {
      delete S.filters[key];
      $$("[data-msval]", el).forEach((x) => x.checked = false);
      commit();
    };
    $(".msel-filter", el).oninput = (e) => {
      const q = e.target.value.toLocaleLowerCase("tr");
      $$(".msel-item", el).forEach((it) => it.style.display = it.dataset.val.includes(q) ? "" : "none");
    };
  }
  document.addEventListener("scroll", (e) => { if (openPanel && !openPanel.el.contains(e.target)) closeMulti(); }, true);
  window.addEventListener("resize", () => closeMulti());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMulti(); });

  function renderHead() {
    closeMulti();
    const cols = visCols();
    let h = `<tr><th style="width:34px"><input type="checkbox" class="cb" id="sel-all" title="Sayfayı seç"></th><th style="min-width:110px">Ek</th>`;
    for (const c of cols) {
      const arrow = S.sort === c.key ? (S.dir === "asc" ? " ▲" : " ▼") : "";
      h += `<th class="sortable" data-sort="${c.key}" title="${esc(c.title)}">${esc(c.title)}<span class="arrow">${arrow}</span></th>`;
    }
    h += `</tr><tr class="filters"><th></th><th></th>`;
    for (const c of cols) {
      if (c.filter) {
        h += `<th><div class="msel" data-mf="${c.key}"><button type="button" class="msel-btn"><span class="msel-lbl">Tümü</span><span class="msel-arr">▾</span></button></div></th>`;
      } else {
        const cur = S.filters[c.key] ?? "";
        h += `<th><input data-f="${c.key}" value="${esc(Array.isArray(cur) ? cur[0] ?? "" : cur)}" placeholder="Filtrele…" autocomplete="off"></th>`;
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
    $$("#grid-head [data-mf] .msel-btn").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      toggleMulti(b.closest("[data-mf]").dataset.mf);
    });
    cols.forEach((c) => { if (c.filter) paintMulti(c.key); });
    const onF = debounce((el) => {
      if (el.value) S.filters[el.dataset.f] = el.value; else delete S.filters[el.dataset.f];
      S.page = 1; S.selected.clear(); load();
    }, 380);
    $$("#grid-head [data-f]").forEach((el) => {
      el.onclick = (e) => e.stopPropagation();
      el.oninput = () => onF(el);
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
      const sync = lastSync ? `<div class="agg"><span class="l">Son Excel senkronu</span><b>${esc(fmtDate(lastSync.at))}</b></div>` : "";
      box.innerHTML =
        `<div class="agg"><span class="l">Satış toplamı</span><b>${fmtMoney(sale.sum)}</b></div>
         <div class="agg"><span class="l">Satış ort.</span><b>${fmtMoney(sale.avg)}</b></div>
         <div class="agg"><span class="l">Kira ort.</span><b>${fmtMoney(rent.avg)}</b></div>
         <div class="agg"><span class="l">Fiyatlı kayıt</span><b>${(sale.count || 0).toLocaleString("tr-TR")}</b></div>${sync}`;
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
    const box = $("#active-filters");
    if (!box) return;
    const items = [];
    if (S.q) items.push(["Ara: " + S.q, () => { S.q = ""; const i = $("#rq"); if (i) i.value = ""; }]);
    if (S.tag) items.push(["Etiket: " + S.tag, () => { S.tag = ""; }]);
    if (S.openTasks) items.push(["Açık görevli", () => { S.openTasks = false; }]);
    if (S.hasNotes) items.push(["Notlu", () => { S.hasNotes = false; }]);
    for (const [k, v] of Object.entries(S.filters)) {
      const c = COLS.find((x) => x.key === k);
      const disp = Array.isArray(v) ? v.join(", ") : v;
      items.push([`${c ? c.title : k}: ${disp}`, () => {
        delete S.filters[k];
        const el = document.querySelector(`[data-f="${k}"]`); if (el) el.value = "";
        paintMulti(k);
      }]);
    }
    box.innerHTML = items.length
      ? items.map((it, i) => `<span class="chip" title="${esc(it[0])}">${esc(it[0].length > 60 ? it[0].slice(0, 60) + "…" : it[0])}<button data-chip="${i}">×</button></span>`).join("") +
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
      <button class="btn small" id="bulk-status">Durum değiştir</button>
      <button class="btn small" id="bulk-cmp">Karşılaştır</button>
      <button class="btn small" id="bulk-clear">Seçimi temizle</button>`;
    $("#bulk-clear").onclick = () => { S.selected.clear(); load(); };
    $("#bulk-tag").onclick = openBulkTag;
    $("#bulk-task").onclick = openBulkTask;
    $("#bulk-status").onclick = openBulkStatus;
    $("#bulk-cmp").onclick = openCompare;
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

  function openBulkStatus() {
    const opts = (byKey("c9").filter || []).filter((v) => v !== "Seçiniz");
    const bg = openModal(`Durum değiştir (${S.selected.size} kayıt)`, `
      <div class="mrow"><label>Yeni durum</label><select id="bs-v">
        ${opts.map((v) => `<option>${esc(v)}</option>`).join("")}</select></div>
      <div class="mrow"><label>Revizyon notu</label><input type="text" id="bs-n" placeholder="Örn: toplu arşivleme"></div>
      <p style="color:var(--muted);font-size:12.5px;margin:0">Her kayıt için ayrı revizyon kaydı oluşturulur.</p>`, {
      foot: `<button class="btn" id="bs-no">Vazgeç</button><button class="btn primary" id="bs-ok">Uygula</button>`
    });
    $("#bs-no", bg).onclick = closeModal;
    $("#bs-ok", bg).onclick = async () => {
      try {
        const d = await api("/api/bulk/status", {
          method: "POST",
          body: JSON.stringify({ record_ids: [...S.selected], value: $("#bs-v", bg).value, note: $("#bs-n", bg).value })
        });
        closeModal(); toast(`${d.count} kaydın durumu güncellendi`, "ok");
        S.selected.clear(); load(); refreshStats();
      } catch (e) { toast(e.message, "err"); }
    };
  }

  async function openCompare() {
    const ids = [...S.selected];
    if (ids.length < 2) { toast("Karşılaştırma için en az 2 kayıt seçin", "err"); return; }
    if (ids.length > 4) { toast("En fazla 4 kayıt karşılaştırılabilir", "err"); return; }
    const bg = openModal("Karşılaştırma", '<div class="loading">yükleniyor…</div>', { wide: true });
    try {
      const ds = await Promise.all(ids.map((id) => api("/api/records/" + id)));
      const recs = ds.map((d) => d.record);
      let h = `<div style="overflow-x:auto"><table class="grid"><thead><tr><th>Alan</th>${recs.map((r) =>
        `<th><span data-cgoto="${r.id}" style="color:var(--brand);cursor:pointer">#${esc(r.c0 || "?")} — ${esc(r.c1 || "")}</span></th>`).join("")}</tr></thead><tbody>`;
      for (const k of CMP_FIELDS) {
        const c = byKey(k);
        const vals = recs.map((r) => r[k]);
        const diff = new Set(vals.map((v) => v ?? "")).size > 1;
        h += `<tr${diff ? ' style="background:var(--brand-soft)"' : ""}><td style="color:var(--muted)">${esc(c.title)}</td>${vals.map((v) =>
          `<td>${k === "c9" || k === "c5" || k === "c10" ? pill(v) : fmtVal(c, v)}</td>`).join("")}</tr>`;
      }
      const pm = recs.map((r) => {
        const p = parseFloat(r.c23), m2 = parseFloat(r.c3);
        return p > 0 && m2 > 0 ? fmtMoney(p / m2) : "—";
      });
      h += `<tr style="background:var(--brand-soft)"><td style="color:var(--muted)">m² birim (satış)</td>${pm.map((v) => `<td><b>${esc(v)}</b></td>`).join("")}</tr>`;
      bg.querySelector(".modal-body").innerHTML = h + "</tbody></table></div>";
      $$("[data-cgoto]", bg).forEach((x) => x.onclick = () => { closeModal(); Detail.open(+x.dataset.cgoto); });
    } catch (e) { bg.querySelector(".modal-body").innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; }
  }

  /* ---- yeni ilan ---- */
  function newFieldHTML(c) {
    let h = `<div class="field"><label>${esc(c.title)}</label>`;
    if (c.filter) {
      h += `<select data-nk="${c.key}"><option value="">—</option>${c.filter.filter((v) => v !== "Seçiniz").map((v) =>
        `<option>${esc(v)}</option>`).join("")}</select>`;
    } else if (c.dtype === "date") {
      h += `<input type="date" data-nk="${c.key}">`;
    } else {
      h += `<input data-nk="${c.key}"${c.dtype === "number" ? ' inputmode="decimal"' : ""}>`;
    }
    return h + "</div>";
  }
  function openNew() {
    const bg = openModal("Yeni ilan", `<div class="fgrid">${NEW_FIELDS.map((k) => newFieldHTML(byKey(k))).join("")}</div>`, {
      wide: true,
      foot: `<button class="btn" id="nw-no">Vazgeç</button><button class="btn primary" id="nw-ok">Kaydet</button>`
    });
    $("#nw-no", bg).onclick = closeModal;
    $("#nw-ok", bg).onclick = async () => {
      const fields = {};
      $$("[data-nk]", bg).forEach((el) => { if (el.value !== "") fields[el.dataset.nk] = el.value; });
      if (!Object.keys(fields).length) { toast("En az bir alan doldurun", "err"); return; }
      try {
        const d = await api("/api/records", { method: "POST", body: JSON.stringify({ fields }) });
        closeModal(); toast("İlan oluşturuldu", "ok");
        S.page = 1; await load(); refreshStats(); Detail.open(d.id);
      } catch (e) { toast(e.message, "err"); }
    };
  }

  /* ---- Excel senkronu ---- */
  function openSync() {
    const last = lastSync
      ? `Son senkron: <b>${esc(fmtDate(lastSync.at))}</b> — ${lastSync.added} yeni, ${lastSync.updated_rows} güncellenen (${lastSync.updated_cells} hücre), ${lastSync.deleted} silinmiş.`
      : "Henüz senkron yapılmadı.";
    const bg = openModal("Excel'den güncelle", `
      <p style="margin-top:0">${last}</p>
      <p style="color:var(--muted);font-size:13px">Excel dosyası ID bazında eşleştirilip karşılaştırılır:</p>
      <ul style="color:var(--muted);font-size:13px;margin-top:0">
        <li>Değişen hücreler güncellenir, her biri <b>revizyona</b> işlenir</li>
        <li>Yeni satırlar eklenir, Excel'den silinenler işaretlenir (veriniz silinmez)</li>
        <li>Sizin elle değiştirdiğiniz hücreler <b>ezilmez</b>, çakışma olarak listelenir</li>
        <li>Not, görev ve etiketleriniz <b>korunur</b></li>
      </ul>`, {
      foot: `<button class="btn" id="sy-no">Vazgeç</button><button class="btn primary" id="sy-ok">Senkronu başlat</button>`
    });
    $("#sy-no", bg).onclick = closeModal;
    $("#sy-ok", bg).onclick = async () => {
      $("#sy-ok", bg).disabled = true; $("#sy-ok", bg).textContent = "Senkron yapılıyor…";
      try {
        const d = await api("/api/sync", { method: "POST" });
        lastSync = d;
        closeModal();
        const conf = (d.conflicts && d.conflicts.length)
          ? `<h4 style="margin:14px 0 8px">Çakışmalar — sizin değeriniz korundu (${d.conflict_count})</h4>
            <div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:8px">
            ${d.conflicts.map((cf) => `<div style="padding:8px 10px;border-bottom:1px solid var(--line);font-size:12.5px">
              <span data-cgoto="${cf.record_id}" style="color:var(--brand);cursor:pointer;font-weight:600">${esc(cf.label)}</span>
              <span style="color:var(--muted)"> · ${esc(cf.col)}</span><br>
              uygulamada: <b>${esc(cf.app_value ?? "—")}</b> · excel'de: <b style="color:var(--warn)">${esc(cf.excel_value ?? "—")}</b></div>`).join("")}</div>
            <p style="color:var(--muted);font-size:12px">Excel'deki değeri almak isterseniz kaydı açıp elle düzenleyin.</p>` : "";
        const rep = openModal("Senkron tamamlandı", `
          <div class="hbars">
            <div class="hbar"><div class="top"><span>Yeni kayıt</span><b>${d.added}</b></div></div>
            <div class="hbar"><div class="top"><span>Güncellenen kayıt</span><b>${d.updated_rows}</b></div></div>
            <div class="hbar"><div class="top"><span>Değişen hücre</span><b>${d.updated_cells}</b></div></div>
            <div class="hbar"><div class="top"><span>Excel'de silinmiş</span><b>${d.deleted}</b></div></div>
            <div class="hbar"><div class="top"><span>Çakışma</span><b>${d.conflict_count || 0}</b></div></div>
            <div class="hbar"><div class="top"><span>Toplam kayıt</span><b>${d.total.toLocaleString("tr-TR")}</b></div></div>
          </div>${conf}`, { wide: true, foot: `<button class="btn primary" id="sy-done">Tamam</button>` });
        $("#sy-done", rep).onclick = closeModal;
        $$("[data-cgoto]", rep).forEach((x) => x.onclick = () => { closeModal(); Detail.open(+x.dataset.cgoto); });
        S.page = 1; S.selected.clear(); load(); refreshStats();
      } catch (e) {
        closeModal(); toast(e.message, "err");
      }
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
    return { q: S.q, filters: JSON.parse(JSON.stringify(S.filters)), tag: S.tag, sort: S.sort, dir: S.dir, openTasks: S.openTasks, hasNotes: S.hasNotes };
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
    S.q = s.q || ""; S.filters = normFilters(s.filters); S.tag = s.tag || "";
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
          <button class="btn primary" id="btn-new">${icon("plus")}<span>Yeni İlan</span></button>
          <button class="btn" id="btn-sync">${icon("layers")}<span>Excel'den Güncelle</span></button>
          <button class="btn" id="btn-saveview">${icon("save")}<span>Görünümü kaydet</span></button>
          <button class="btn" id="btn-density">${icon("table")}<span>Sıkışık</span></button>
          <button class="btn" id="btn-cols">${icon("cols")}<span>Sütunlar</span></button>
          <button class="btn" id="btn-exp">${icon("download")}<span>Dışa Aktar</span></button>
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
    hydrateIcons(el);
    const pp = $("#perpage"); pp.value = String(S.per);
    pp.onchange = () => { S.per = +pp.value; S.page = 1; load(); };
    $("#rq").oninput = debounce((e) => { S.q = e.target.value.trim(); S.page = 1; S.selected.clear(); load(); }, 350);
    $("#btn-new").onclick = openNew;
    $("#btn-sync").onclick = openSync;
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
    try { lastSync = await api("/api/sync/status"); } catch (e) { lastSync = null; }
    renderHead();
    await load();
  }

  function bind() {}
  function refreshIfActive() { if (currentView === "records" && $("#grid-body")) load(); }

  return { render, bind, openExport, applyView, clearAll: () => { clearFilters(); load(); }, refreshIfActive, state: S };
})();
Views.records = Records;
