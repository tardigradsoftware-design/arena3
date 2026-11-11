"use strict";
/* Emlak Panel v2 — kayıt detay çekmecesi */
const Detail = (() => {
  let rid = null, D = null;
  const GENEL = ["c1", "c2", "c3", "c5", "c6", "c7", "c9", "c10", "c11", "c13", "c15", "c17", "c19", "c21", "c23", "c24", "c25", "c27", "c28", "c32", "c33", "c34", "c37"];
  const byKey = (k) => COLS.find((c) => c.key === k);

  function telHref(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (!d) return null;
    return "tel:+" + (d.startsWith("0") ? "9" + d : d.startsWith("90") ? d : "90" + d);
  }
  function mapsURL(r) {
    const q = [r.c1, r.c16, r.c12, r.c8, r.c4].filter((x) => x).join(" ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function bind() {
    $("#drawer-close").onclick = close;
    $("#drawer-bg").onclick = close;
    $$("#drawer-tabs button").forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
  }
  function switchTab(t) {
    $$("#drawer-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    ["info", "all", "revs", "notes", "tasks", "tags"].forEach((x) => $("#tab-" + x).hidden = x !== t);
  }

  async function open(id) {
    rid = id;
    $("#drawer").hidden = false; $("#drawer-bg").hidden = false;
    $("#drawer-title").textContent = "yükleniyor…"; $("#drawer-sub").textContent = "";
    $("#drawer-status").innerHTML = ""; $("#drawer-call").innerHTML = ""; $("#drawer-tags").innerHTML = "";
    ["info", "all", "revs", "notes", "tasks", "tags"].forEach((t) => $("#tab-" + t).innerHTML = '<div class="loading">yükleniyor…</div>');
    switchTab("info");
    try { D = await api("/api/records/" + id); paint(); }
    catch (e) { $("#tab-info").innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; }
  }
  function close() { $("#drawer").hidden = true; $("#drawer-bg").hidden = true; rid = null; D = null; }
  async function refresh() { D = await api("/api/records/" + rid); paint(); }
  function afterMutation() { refreshStats(); Records.refreshIfActive(); if (currentView === "tasks") Views.tasks.render($("#view")); if (currentView === "dashboard") Views.dashboard.render($("#view")); }

  function priceHistorySVG(key) {
    const pts = D.revisions.filter((v) => v.col_key === key && parseFloat(v.new_value) > 0).reverse();
    if (pts.length < 1) return "";
    const vals = pts.map((v) => parseFloat(v.new_value));
    const all = [...vals];
    const first = pts[0];
    if (first && parseFloat(first.old_value) > 0) all.unshift(parseFloat(first.old_value));
    if (all.length < 2) return "";
    const W = 260, H = 64, P = 6;
    const mn = Math.min(...all), mx = Math.max(...all), rg = (mx - mn) || 1;
    const X = (i) => (P + (i * (W - 2 * P)) / (all.length - 1)).toFixed(1);
    const Y = (v) => (H - P - ((v - mn) / rg) * (H - 2 * P)).toFixed(1);
    const line = all.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    const last = all[all.length - 1], prev = all[all.length - 2];
    const col = last >= prev ? "var(--ok)" : "var(--bad)";
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
      <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>
      ${all.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${col}"><title>${fmtMoney(v)}</title></circle>`).join("")}</svg>`;
  }

  function paintInsights() {
    const r = D.record;
    const cards = [];
    const m2 = parseFloat(r.c3);
    const sale = parseFloat(r.c23), rent = parseFloat(r.c7);
    if (sale > 0 && m2 > 0) cards.push(["m² birim (satış)", fmtMoney(sale / m2)]);
    if (rent > 0 && m2 > 0) cards.push(["m² birim (kira)", fmtMoney(rent / m2)]);
    if (sale > 0 && rent > 0) cards.push(["Satış / yıllık kira", (sale / (rent * 12)).toFixed(1) + " yıl"]);
    const hist = priceHistorySVG("c23") || priceHistorySVG("c7");
    if (!cards.length && !hist) return "";
    return `<div class="card" style="margin-bottom:14px;padding:14px 16px">
      <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
        ${cards.map(([l, v]) => `<div><div style="font-size:11.5px;color:var(--muted);font-weight:600">${l}</div>
          <div style="font-size:19px;font-weight:800;color:var(--brand)">${esc(v)}</div></div>`).join("")}
        ${hist ? `<div style="flex:1;min-width:220px"><div style="font-size:11.5px;color:var(--muted);font-weight:600;margin-bottom:4px">Fiyat geçmişi</div>${hist}</div>` : ""}
      </div></div>`;
  }

  function paint() {
    const r = D.record;
    $("#drawer-status").innerHTML = pill(r.c9) +
      (r.sync_state === "deleted" ? ' <span class="pill red">Excel\'de silinmiş</span>' : "") +
      (r.sync_state === "manual" ? ' <span class="pill violet">Manuel kayıt</span>' : "");
    $("#drawer-title").textContent = `#${r.c0 || "?"} — ${r.c1 || "Adres yok"}`;
    $("#drawer-sub").textContent = [r.c21, r.c5, r.c33, r.c2 && !PLACEHOLDER.has(r.c2) ? "Daire " + r.c2 : ""].filter(Boolean).join(" • ") + `  ·  ${r.row_no ? "Excel satırı " + r.row_no : "manuel kayıt"}`;
    const tel = telHref(r.c17);
    let btns = "";
    if (tel) btns += `<a class="btn small" href="${tel}">${icon("phone")}<span>${esc(r.c17)}</span></a>`;
    btns += `<a class="btn small" href="/ilan/${r.id}" target="_blank" rel="noopener">${icon("eye")}<span>İlan sayfası</span></a>`;
    btns += `<a class="btn small" href="${mapsURL(r)}" target="_blank" rel="noopener">${icon("home")}<span>Harita</span></a>`;
    if (r.c37) btns += `<a class="btn small" href="${esc(r.c37)}" target="_blank" rel="noopener">${icon("arrow")}<span>İlan linki</span></a>`;
    $("#drawer-call").innerHTML = btns;
    $("#drawer-tags").innerHTML = D.tags.map((t) =>
      `<span class="tagchip" style="background:${esc(t.color)}">${esc(t.name)}</span>`).join("");
    $("#cnt-revs").textContent = D.revisions.length || "";
    $("#cnt-notes").textContent = D.notes.length || "";
    $("#cnt-tasks").textContent = D.tasks.filter((t) => !t.done).length || "";
    paintForm("info", GENEL, true);
    paintForm("all", COLS.map((c) => c.key), false);
    paintRevs(); paintNotes(); paintTasks(); paintTags();
  }

  function fieldHTML(c, v) {
    v = v ?? "";
    const long = String(v).length > 70;
    let h = `<div class="field${long ? " full" : ""}"><label><span class="letter">${c.letter}</span>${esc(c.title)}</label>`;
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
    return h + "</div>";
  }

  function paintForm(tab, keys, insights) {
    const r = D.record;
    const banner = r.sync_state === "deleted"
      ? `<div class="card" style="margin-bottom:14px;padding:11px 14px;border-color:var(--bad);background:var(--bad-bg);font-size:13px">⚠ Bu kayıt Excel dosyasında artık bulunmuyor. Verileriniz korunur; silinmez.</div>` : "";
    $("#tab-" + tab).innerHTML = banner + (insights ? paintInsights() : "") +
      `<div class="fgrid">${keys.map((k) => fieldHTML(byKey(k), r[k])).join("")}</div>
      <div class="savebar"><input id="rev-note-${tab}" placeholder="Revizyon notu (örn: telefon güncellendi)…">
      <button class="btn primary" id="btn-save-${tab}">${icon("check")}<span>Kaydet</span></button></div>`;
    $$(`#tab-${tab} [data-k]`).forEach((el) =>
      el.oninput = () => el.classList.toggle("dirty", el.value !== el.dataset.orig));
    $("#btn-save-" + tab).onclick = () => save(tab);
  }

  async function save(tab) {
    const fields = {};
    $$(`#tab-${tab} [data-k].dirty`).forEach((el) => fields[el.dataset.k] = el.value);
    if (!Object.keys(fields).length) { toast("Değişiklik yok"); return; }
    try {
      const d = await api("/api/records/" + rid, {
        method: "PUT", body: JSON.stringify({ fields, note: $("#rev-note-" + tab).value })
      });
      toast(d.changed.length ? `${d.changed.length} alan güncellendi` : "Değişiklik yok", "ok");
      await refresh(); afterMutation();
    } catch (e) { toast(e.message, "err"); }
  }

  function paintRevs() {
    $("#tab-revs").innerHTML = D.revisions.length
      ? `<div class="tl">${D.revisions.map((v) =>
        `<div class="rev"><div class="meta">${esc(fmtDate(v.changed_at))} · ${esc(v.col_title)}</div>
         <div class="chg"><span class="old">${esc(v.old_value ?? "—")}</span> → <span class="new">${esc(v.new_value ?? "—")}</span></div>
         ${v.note ? `<div class="note">✎ ${esc(v.note)}</div>` : ""}</div>`).join("")}</div>`
      : '<div class="empty">Henüz revizyon yok. Genel sekmesinden düzenleme yapın.</div>';
  }

  function paintNotes() {
    let h = `<div class="addrow"><textarea id="new-note" placeholder="Yeni not yazın…"></textarea>
      <button class="btn primary" id="btn-note">Ekle</button></div>`;
    h += D.notes.length ? D.notes.map((n) =>
      `<div class="note" data-nid="${n.id}"><div class="meta"><span>${esc(fmtDate(n.created_at))}</span>
       <span><button class="linkbtn" data-nedit="${n.id}">düzenle</button><button class="linkbtn red" data-ndel="${n.id}">sil</button></span></div>
       <p>${esc(n.text)}</p></div>`).join("") : '<div class="empty">Henüz not yok.</div>';
    $("#tab-notes").innerHTML = h;
    $("#btn-note").onclick = async () => {
      const t = $("#new-note").value.trim();
      if (!t) return;
      try {
        await api(`/api/records/${rid}/notes`, { method: "POST", body: JSON.stringify({ text: t }) });
        toast("Not eklendi", "ok"); await refresh(); afterMutation();
      } catch (e) { toast(e.message, "err"); }
    };
    $$("#tab-notes [data-ndel]").forEach((b) => b.onclick = async () => {
      if (!await confirmDlg("Not silinsin mi?")) return;
      await api("/api/notes/" + b.dataset.ndel, { method: "DELETE" });
      toast("Not silindi", "ok"); await refresh(); afterMutation();
    });
    $$("#tab-notes [data-nedit]").forEach((b) => b.onclick = () => {
      const box = $(`#tab-notes .note[data-nid="${b.dataset.nedit}"] p`);
      const old = D.notes.find((n) => n.id == b.dataset.nedit).text;
      box.innerHTML = `<textarea rows="3" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:7px">${esc(old)}</textarea>
        <div style="margin-top:6px;display:flex;gap:6px"><button class="btn small primary" data-nsave="${b.dataset.nedit}">Kaydet</button>
        <button class="btn small" data-ncancel="1">Vazgeç</button></div>`;
      $("[data-nsave]", box).onclick = async () => {
        const t = $("textarea", box).value.trim();
        if (!t) return;
        await api("/api/notes/" + b.dataset.nedit, { method: "PUT", body: JSON.stringify({ text: t }) });
        toast("Not güncellendi", "ok"); await refresh();
      };
      $("[data-ncancel]", box).onclick = () => refresh();
    });
  }

  function taskHTML(t, showLabel) {
    return `<div class="task${t.done ? " done" : ""}">
      <input type="checkbox" class="cb" data-tdone="${t.id}"${t.done ? " checked" : ""}>
      <div class="t">${esc(t.title)}
        ${showLabel && t.label ? `<div class="lbl" data-goto="${t.record_id}">→ ${esc(t.label)}</div>` : ""}
        <div class="due${!t.done && isOverdue(t.due_date) ? " over" : ""}">${t.due_date ? "📅 " + dueText(t.due_date) + (!t.done && isOverdue(t.due_date) ? " · gecikmiş" : isToday(t.due_date) && !t.done ? " · bugün" : "") : "tarih yok"}</div>
      </div>
      <span><button class="linkbtn" data-tdate="${t.id}">tarih</button><button class="linkbtn red" data-tdel="${t.id}">sil</button></span></div>`;
  }

  function paintTasks() {
    let h = `<div class="addrow"><input type="text" id="new-task" placeholder="Yeni görev…">
      <input type="date" id="new-task-due"><button class="btn primary" id="btn-task">Ekle</button></div>`;
    h += D.tasks.length ? D.tasks.map((t) => taskHTML(t, false)).join("") : '<div class="empty">Görev yok.</div>';
    $("#tab-tasks").innerHTML = h;
    $("#btn-task").onclick = async () => {
      const title = $("#new-task").value.trim();
      if (!title) return;
      try {
        await api(`/api/records/${rid}/tasks`, {
          method: "POST", body: JSON.stringify({ title, due_date: $("#new-task-due").value || null })
        });
        toast("Görev eklendi", "ok"); await refresh(); afterMutation();
      } catch (e) { toast(e.message, "err"); }
    };
    bindTaskOps($("#tab-tasks"), async () => { await refresh(); afterMutation(); });
  }

  function bindTaskOps(root, after) {
    $$("[data-tdone]", root).forEach((cb) => cb.onchange = async () => {
      await api("/api/tasks/" + cb.dataset.tdone, { method: "PUT", body: JSON.stringify({ done: cb.checked }) });
      toast(cb.checked ? "Görev tamamlandı" : "Görev yeniden açıldı", "ok");
      await after();
    });
    $$("[data-tdel]", root).forEach((b) => b.onclick = async () => {
      if (!await confirmDlg("Görev silinsin mi?")) return;
      await api("/api/tasks/" + b.dataset.tdel, { method: "DELETE" });
      toast("Görev silindi", "ok"); await after();
    });
    $$("[data-tdate]", root).forEach((b) => b.onclick = async () => {
      const cur = (D && D.tasks.find((t) => t.id == b.dataset.tdate)) || {};
      const v = await promptDlg("Bitiş tarihi", { value: cur.due_date || "", placeholder: "YYYY-AA-GG (boş bırakılabilir)" });
      if (v === null) return;
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Tarih biçimi YYYY-AA-GG olmalı", "err"); return; }
      await api("/api/tasks/" + b.dataset.tdate, { method: "PUT", body: JSON.stringify({ due_date: v || null }) });
      toast("Tarih güncellendi", "ok"); await after();
    });
    $$("[data-goto]", root).forEach((el) => el.onclick = () => open(+el.dataset.goto));
  }

  function paintTags() {
    const mine = new Set(D.tags.map((t) => t.id));
    let h = "<h4 style='margin:2px 0 10px'>Bu kayıttakiler</h4>";
    h += D.tags.length ? D.tags.map((t) =>
      `<div class="tagrow"><span class="dot" style="background:${esc(t.color)}"></span>
       <span class="nm">${esc(t.name)}</span><button class="btn small" data-untag="${t.id}">kaldır</button></div>`).join("")
      : '<div class="empty">Etiket yok.</div>';
    h += "<h4 style='margin:16px 0 10px'>Ekle</h4>";
    const others = allTags.filter((t) => !mine.has(t.id));
    h += others.length ? others.map((t) =>
      `<div class="tagrow"><span class="dot" style="background:${esc(t.color)}"></span>
       <span class="nm">${esc(t.name)}</span><button class="btn small" data-tag="${t.id}">ekle</button></div>`).join("")
      : '<div class="empty">Eklenecek başka etiket yok.</div>';
    h += `<h4 style='margin:16px 0 10px'>Yeni etiket</h4>
      <div class="addrow"><input type="text" id="new-tag-name" placeholder="Etiket adı…">
      <input type="color" id="new-tag-color" value="#4f46e5" style="width:44px;padding:2px;border:1px solid var(--line);border-radius:8px">
      <button class="btn primary" id="btn-newtag">Oluştur ve ekle</button></div>`;
    $("#tab-tags").innerHTML = h;
    $$("#tab-tags [data-untag]").forEach((b) => b.onclick = async () => {
      await api(`/api/records/${rid}/tags/${b.dataset.untag}`, { method: "DELETE" });
      await refresh(); afterMutation();
    });
    $$("#tab-tags [data-tag]").forEach((b) => b.onclick = async () => {
      await api(`/api/records/${rid}/tags`, { method: "POST", body: JSON.stringify({ tag_id: +b.dataset.tag }) });
      toast("Etiket eklendi", "ok"); await refresh(); afterMutation();
    });
    $("#btn-newtag").onclick = async () => {
      const name = $("#new-tag-name").value.trim();
      if (!name) return;
      await api(`/api/records/${rid}/tags`, {
        method: "POST", body: JSON.stringify({ name, color: $("#new-tag-color").value })
      });
      toast("Etiket oluşturuldu", "ok"); await refresh(); afterMutation();
    };
  }

  return { bind, open, close, taskHTML, bindTaskOps, afterMutation };
})();
