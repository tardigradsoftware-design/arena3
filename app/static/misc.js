"use strict";
/* Emlak Panel v2 — panel / görevler / etiketler görünümleri */

/* ================= PANEL ================= */
Views.dashboard = (() => {
  function kpi(cls, t, v, s, fn) {
    return `<div class="kpi ${cls}${fn ? " clickable" : ""}"${fn ? ` data-kpi="${fn}"` : ""}>
      <div class="bar"></div><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  }
  function activityHTML(a) {
    const ic = a.kind === "rev" ? "hist" : a.kind === "note" ? "note" : "check";
    let txt = "";
    if (a.kind === "rev") txt = `<b>${esc(a.title)}</b> güncellendi: <span style="color:var(--bad);text-decoration:line-through">${esc(a.old ?? "—")}</span> → <b style="color:var(--ok)">${esc(a.new ?? "—")}</b>`;
    else if (a.kind === "note") txt = `Not eklendi: “${esc((a.text || "").slice(0, 90))}${(a.text || "").length > 90 ? "…" : ""}”`;
    else txt = `Görev ${a.done ? "tamamlandı" : "oluşturuldu"}: <b>${esc(a.title)}</b>`;
    return `<div class="fi"><div class="fic ${a.kind}">${icon(ic)}</div>
      <div class="ft">${txt}<div class="ftm">${esc(fmtDate(a.time))} · <span class="lnk" data-goto="${a.record_id}">${esc(a.label)}</span></div></div></div>`;
  }
  async function render(el) {
    const [s, acts, tasks] = await Promise.all([
      refreshStats(), api("/api/activity?limit=12"), api("/api/tasks?done=0"),
    ]);
    const saleable = (s.by_status.find((x) => x.v === "SATILIK") || {}).n || 0;
    const sold = (s.by_status.find((x) => x.v === "SATILMIŞ") || {}).n || 0;
    const soon = tasks.filter((t) => t.due_date).slice(0, 7);
    const agenda = tasks.filter((t) => t.due_date && t.due_date <= todayStr()).slice(0, 8);
    const statusSegs = s.by_status.filter((x) => x.v && x.v !== "Seçiniz").slice(0, 8);
    el.innerHTML = `
      <div class="page-head"><div><h1>Panel</h1><div class="sub">Portföy özeti, ${fmtDate(todayStr())}</div></div>
        <div class="head-actions"><button class="btn" id="dash-exp">${icon("download")}<span>Dışa Aktar</span></button></div></div>
      <div class="kpis">
        ${kpi("b-blue", "Toplam kayıt", s.total.toLocaleString("tr-TR"), `${saleable} satılık · ${sold} satılmış`, "records")}
        ${kpi("b-green", "Satış değeri", fmtCompact(s.sale_total) + " ₺", `Ortalama ${fmtCompact(s.sale_avg)} ₺ · ${s.sale_count} kayıt`, "records")}
        ${kpi("b-amber", "Açık görev", s.open_tasks, `${s.tasks_overdue} gecikmiş · ${s.tasks_today} bugün · ${s.tasks_week} bu hafta`, "tasks")}
        ${kpi("b-red", "Hareket", (s.rev_total + s.notes_total).toLocaleString("tr-TR"), `${s.rev_total} revizyon · ${s.notes_total} not`, "")}
      </div>
      ${agenda.length ? `<div class="card card-pad" style="margin-bottom:16px"><h3>Bugünkü ajanda</h3>${agenda.map((t) =>
        `<div class="minitask"><span class="t">${esc(t.title)}</span>
         <span data-goto="${t.record_id}" style="color:var(--brand);cursor:pointer;font-size:12px">${esc(t.label)}</span>
         <span class="duepill${isOverdue(t.due_date) ? " over" : " today"}">${dueText(t.due_date)}</span></div>`).join("")}</div>` : ""}
      <div class="dash-grid">
        <div class="card"><h3>Durum dağılımı</h3><div class="donut-wrap">${donut(statusSegs.map((x) => ({ label: x.v, value: x.n })))}
          <div class="legend">${statusSegs.map((x) =>
            `<button class="li" data-st="${esc(x.v)}"><span class="dot" style="background:${PALETTE[statusSegs.indexOf(x) % PALETTE.length]}"></span>${esc(x.v)}<span class="n">${x.n.toLocaleString("tr-TR")}</span></button>`).join("")}</div></div></div>
        <div class="card"><h3>Proje dağılımı (ilk 10)</h3>${hbars(s.by_project.filter((x) => x.v).map((x) => ({ label: x.v, value: x.n })))}</div>
        <div class="card"><h3>Yaklaşan görevler</h3>
          ${soon.length ? soon.map((t) =>
            `<div class="minitask"><span class="t">${esc(t.title)}</span>
             <span class="lnk duepill${!t.done && isOverdue(t.due_date) ? " over" : isToday(t.due_date) ? " today" : ""}" data-goto="${t.record_id}" style="cursor:pointer">${dueText(t.due_date)}</span></div>`
          ).join("") : '<div class="empty">Tarihli açık görev yok.</div>'}
          <button class="viewall" data-goto-view="tasks">Tüm görevler →</button></div>
        <div class="card"><h3>Son hareketler</h3><div class="feed">
          ${acts.length ? acts.slice(0, 9).map(activityHTML).join("") : '<div class="empty">Henüz hareket yok. Kayıt düzenleyin, not veya görev ekleyin.</div>'}
        </div></div>
      </div>`;
    hydrateIcons(el);
    $("#dash-exp").onclick = () => setView("records").then(() => Records.openExport());
    $$("[data-kpi]", el).forEach((b) => b.onclick = () => setView(b.dataset.kpi));
    $$("[data-st]", el).forEach((b) => b.onclick = () => {
      Records.state.filters = { c9: b.dataset.st };
      Records.state.page = 1; Records.state.q = ""; Records.state.tag = "";
      setView("records");
    });
    $$("[data-goto]", el).forEach((x) => x.onclick = () => Detail.open(+x.dataset.goto));
    $$("[data-goto-view]", el).forEach((x) => x.onclick = () => setView(x.dataset.gotoView));
  }
  return { render };
})();

/* ================= GÖREVLER ================= */
Views.tasks = (() => {
  let seg = "open", q = "";
  function duePill(t) {
    if (!t.due_date) return '<span class="duepill">tarih yok</span>';
    const cls = !t.done && isOverdue(t.due_date) ? " over" : !t.done && isToday(t.due_date) ? " today" : "";
    return `<span class="duepill${cls}">${dueText(t.due_date)}</span>`;
  }
  function row(t) {
    return `<div class="task${t.done ? " done" : ""}">
      <input type="checkbox" class="cb" data-tdone="${t.id}"${t.done ? " checked" : ""}>
      <div class="t">${esc(t.title)}<div class="lbl" data-goto="${t.record_id}">→ ${esc(t.label)}</div></div>
      ${duePill(t)}
      <span><button class="linkbtn" data-tdate="${t.id}">tarih</button><button class="linkbtn red" data-tdel="${t.id}">sil</button></span></div>`;
  }
  async function fill() {
    const box = $("#tasks-list");
    box.innerHTML = '<div class="loading">yükleniyor…</div>';
    const p = new URLSearchParams();
    if (seg === "open") p.set("done", "0");
    if (seg === "done") p.set("done", "1");
    if (q) p.set("q", q);
    let list = await api("/api/tasks?" + p);
    if (seg === "late") list = list.filter((t) => !t.done && isOverdue(t.due_date));
    if (!list.length) { box.innerHTML = '<div class="empty">Görev yok.</div>'; return; }
    const groups = [];
    if (seg !== "done") {
      const late = list.filter((t) => !t.done && isOverdue(t.due_date));
      const today = list.filter((t) => !t.done && isToday(t.due_date));
      const up = list.filter((t) => !t.done && t.due_date && !isOverdue(t.due_date) && !isToday(t.due_date));
      const nodate = list.filter((t) => !t.done && !t.due_date);
      const done = list.filter((t) => t.done);
      if (late.length) groups.push(["Gecikmiş", late, "red"]);
      if (today.length) groups.push(["Bugün", today, ""]);
      if (up.length) groups.push(["Yaklaşan", up, ""]);
      if (nodate.length) groups.push(["Tarihsiz", nodate, ""]);
      if (done.length && seg === "all") groups.push(["Tamamlanan", done, ""]);
    } else groups.push(["Tamamlanan", list, ""]);
    box.innerHTML = groups.map(([t, items, cls]) =>
      `<div class="tgroup${cls ? " " + cls : ""}">${t} (${items.length})</div>${items.map(row).join("")}`).join("");
    Detail.bindTaskOps(box, async () => { await refreshStats(); fill(); });
  }
  async function render(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Görevler</h1><div class="sub">Tüm kayıtlardaki yapılacaklar — yeni görev için kaydı açın</div></div></div>
      <div class="card card-pad">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <div class="seg">
            <button data-seg="open" class="${seg === "open" ? "on" : ""}">Açık</button>
            <button data-seg="late" class="${seg === "late" ? "on" : ""}">Gecikmiş</button>
            <button data-seg="done" class="${seg === "done" ? "on" : ""}">Tamamlanan</button>
            <button data-seg="all" class="${seg === "all" ? "on" : ""}">Tümü</button>
          </div>
          <div class="tsearch">${icon("search")}<input id="tq" placeholder="Görev ara…" value="${esc(q)}"></div>
        </div>
        <div id="tasks-list"></div>
      </div>`;
    hydrateIcons(el);
    $$("[data-seg]", el).forEach((b) => b.onclick = () => { seg = b.dataset.seg; render(el); });
    $("#tq", el).oninput = debounce((e) => { q = e.target.value.trim(); fill(); }, 350);
    await fill();
  }
  return { render };
})();

/* ================= ETİKETLER ================= */
Views.tags = (() => {
  async function render(el) {
    const tags = await api("/api/tags");
    allTags = tags;
    el.innerHTML = `
      <div class="page-head"><div><h1>Etiketler</h1><div class="sub">${tags.length} etiket — kayda atamak için kaydı açın veya tablodan toplu seçin</div></div>
        <div class="head-actions"><button class="btn primary" id="tag-new">${icon("plus")}<span>Yeni etiket</span></button></div></div>
      <div class="taggrid">${tags.map((t) => `
        <div class="tagcard"><div class="top"><span class="dot" style="background:${esc(t.color)}"></span>
          <span class="nm">${esc(t.name)}</span></div>
          <div class="cnt">${t.count} kayıtta kullanılıyor</div>
          <div class="ops"><button class="btn small" data-tshow="${esc(t.name)}">Kayıtları göster</button>
          <button class="btn small" data-tren="${t.id}">Yeniden adlandır</button>
          <input type="color" value="${esc(t.color)}" data-tcol="${t.id}" title="Renk" style="width:34px;height:30px;padding:1px;border:1px solid var(--line);border-radius:7px">
          <button class="btn small danger" data-tdel="${t.id}">Sil</button></div></div>`).join("")
        || '<div class="card card-pad">Henüz etiket yok. “Yeni etiket” ile oluşturun.</div>'}</div>`;
    hydrateIcons(el);
    $("#tag-new").onclick = async () => {
      const name = await promptDlg("Yeni etiket", { placeholder: "Etiket adı…", label: "Etiket adı" });
      if (!name) return;
      try {
        await api("/api/tags", { method: "POST", body: JSON.stringify({ name }) });
        toast("Etiket oluşturuldu", "ok"); refreshStats(); render(el);
      } catch (e) { toast(e.message, "err"); }
    };
    $$("[data-tshow]", el).forEach((b) => b.onclick = () => {
      Records.state.tag = b.dataset.tshow; Records.state.page = 1;
      setView("records");
    });
    $$("[data-tren]", el).forEach((b) => b.onclick = async () => {
      const cur = tags.find((t) => t.id == b.dataset.tren);
      const name = await promptDlg("Yeniden adlandır", { value: cur.name });
      if (!name || name === cur.name) return;
      try {
        await api("/api/tags/" + b.dataset.tren, { method: "PUT", body: JSON.stringify({ name }) });
        toast("Güncellendi", "ok"); refreshStats(); render(el);
      } catch (e) { toast(e.message, "err"); }
    });
    $$("[data-tcol]", el).forEach((c) => c.onchange = async () => {
      await api("/api/tags/" + c.dataset.tcol, { method: "PUT", body: JSON.stringify({ color: c.value }) });
      toast("Renk güncellendi", "ok"); refreshStats();
    });
    $$("[data-tdel]", el).forEach((b) => b.onclick = async () => {
      if (!await confirmDlg("Etiket silinsin mi? (kayıtlardan da kaldırılır)")) return;
      await api("/api/tags/" + b.dataset.tdel, { method: "DELETE" });
      toast("Etiket silindi", "ok"); refreshStats(); render(el);
    });
  }
  return { render };
})();
