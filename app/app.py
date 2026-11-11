#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Emlak Kayıt Yönetimi - Flask arka ucu."""
import csv
import io
import json
import os
import re
import sqlite3
import sys
import urllib.parse
from datetime import datetime

from flask import Flask, Response, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
DB = os.environ.get("DATA_DB", os.path.join(BASE, "data", "app.db"))
XLSX = os.environ.get("DATA_XLSX", os.path.join(BASE, "..", "TÜMÜ-revize.xlsx"))
N_COLS = 47
KEY_RE = re.compile(r"^c([0-9]|[1-3][0-9]|4[0-6])$")

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False

TR = str.maketrans("İIŞĞÜÖÇ", "iışğüöç")


def tr_lower(s):
    return (s or "").translate(TR).lower()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def cn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def ensure_schema():
    """Eski veri tabanlarını yeni şemaya taşır."""
    c = cn()
    cols = [r[1] for r in c.execute("PRAGMA table_info(records)").fetchall()]
    if "sync_state" not in cols:
        c.execute("ALTER TABLE records ADD COLUMN sync_state TEXT DEFAULT 'active'")
        c.execute("UPDATE records SET sync_state = 'active'")
    c.execute("""CREATE TABLE IF NOT EXISTS sync_log (id INTEGER PRIMARY KEY, at TEXT,
        added INTEGER, updated_rows INTEGER, updated_cells INTEGER, deleted INTEGER)""")
    try:
        c.execute("CREATE INDEX IF NOT EXISTS ix_rec_rowno ON records(row_no)")
    except sqlite3.OperationalError:
        pass
    c.commit()
    c.close()


_meta = None


def meta():
    global _meta
    if _meta is None:
        c = cn()
        rows = c.execute("SELECT * FROM columns ORDER BY pos").fetchall()
        c.close()
        _meta = []
        for r in rows:
            m = dict(r)
            m["filter"] = json.loads(m["filter_values"]) if m["filter_values"] else None
            del m["filter_values"]
            _meta.append(m)
    return _meta


def by_key(key):
    return next((m for m in meta() if m["key"] == key), None)


def apply_filters(args):
    """Ortak filtre -> (WHERE, params)."""
    where, params = [], []
    q = (args.get("q") or "").strip()
    if q:
        where.append("r.search LIKE ?")
        params.append(f"%{tr_lower(q)}%")
    for m in meta():
        v = args.get("f_" + m["key"], "")
        if v is None or v == "":
            continue
        if m["filter"]:
            where.append(f"r.{m['key']} = ?")
            params.append(v)
        elif m["dtype"] == "number":
            where.append(f"r.{m['key']} LIKE ?")
            params.append(f"%{v}%")
        else:
            where.append(f"r.t{m['key'][1:]} LIKE ?")
            params.append(f"%{tr_lower(v)}%")
    tag = (args.get("tag") or "").strip()
    if tag:
        where.append("""EXISTS (SELECT 1 FROM record_tags rt JOIN tags t ON t.id = rt.tag_id
                       WHERE rt.record_id = r.id AND t.name = ?)""")
        params.append(tag)
    if args.get("open_tasks") == "1":
        where.append("EXISTS (SELECT 1 FROM tasks WHERE record_id = r.id AND done = 0)")
    if args.get("has_notes") == "1":
        where.append("EXISTS (SELECT 1 FROM notes WHERE record_id = r.id)")
    return ("WHERE " + " AND ".join(where)) if where else "", params


def order_clause(args):
    s = args.get("sort", "")
    desc = (args.get("dir") or "").lower() == "desc"
    if KEY_RE.match(s or ""):
        m = by_key(s)
        if m and m["dtype"] in ("number", "date"):
            return f"r.n{s[1:]} {'DESC' if desc else 'ASC'} NULLS LAST, r.id ASC"
        if m:
            return f"r.{s} COLLATE NOCASE {'DESC' if desc else 'ASC'}, r.id ASC"
    return "r.id ASC"


def row_tags(c, ids):
    out = {i: [] for i in ids}
    if not ids:
        return out
    ph = ",".join("?" for _ in ids)
    for r in c.execute(f"""SELECT rt.record_id, t.name, t.color FROM record_tags rt
                           JOIN tags t ON t.id = rt.tag_id
                           WHERE rt.record_id IN ({ph}) ORDER BY t.name""", ids):
        out[r["record_id"]].append({"name": r["name"], "color": r["color"]})
    return out


def row_counts(c, ids):
    notes = {i: 0 for i in ids}
    topen = {i: 0 for i in ids}
    tdone = {i: 0 for i in ids}
    if not ids:
        return notes, topen, tdone
    ph = ",".join("?" for _ in ids)
    for r in c.execute(f"SELECT record_id, COUNT(*) n FROM notes WHERE record_id IN ({ph}) GROUP BY 1", ids):
        notes[r["record_id"]] = r["n"]
    for r in c.execute(f"SELECT record_id, done, COUNT(*) n FROM tasks WHERE record_id IN ({ph}) GROUP BY 1, 2", ids):
        (tdone if r["done"] else topen)[r["record_id"]] = r["n"]
    return notes, topen, tdone


# ---------------- sayfalar ----------------
@app.get("/")
def index():
    return render_template("index.html")


def fmt_money_tr(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    s = f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if s.endswith(",00"):
        s = s[:-3]
    return s + " ₺"


@app.get("/ilan/<int:rid>")
def ilan(rid):
    c = cn()
    r = c.execute("SELECT * FROM records WHERE id = ?", (rid,)).fetchone()
    c.close()
    if not r:
        return "Kayıt bulunamadı", 404
    rec = {f"c{i}": r[f"c{i}"] for i in range(N_COLS)}
    rec["c0"], rec["c1"] = r["c0"], r["c1"]
    facts = []
    for key, label in [("c5", "Tür"), ("c33", "Oda"), ("c3", "Metrekare"), ("c6", "Kat"),
                       ("c25", "Blok"), ("c21", "Proje"), ("c34", "Cephe"), ("c10", "Kullanım"),
                       ("c32", "Para birimi"), ("c11", "Yıllık kira"), ("c15", "Peşinat"),
                       ("c19", "Kapora"), ("c12", "Mahalle"), ("c16", "Cadde"), ("c8", "İlçe"), ("c4", "İl")]:
        v = rec.get(key)
        if v and v not in ("Seçiniz", "default"):
            if key in ("c11", "c15", "c19") and v != "0":
                v = fmt_money_tr(v) or v
            facts.append((by_key(key)["title"], v))
    per_m2 = None
    try:
        if rec.get("c23") and rec.get("c3") and float(rec["c3"]):
            per_m2 = fmt_money_tr(float(rec["c23"]) / float(rec["c3"]))
    except (ValueError, ZeroDivisionError):
        pass
    addr = ", ".join(x for x in [rec.get("c16"), rec.get("c12"), f"{rec.get('c8') or ''}/{rec.get('c4') or ''}".strip("/")]
                     if x and x not in ("Seçiniz", "default"))
    maps_q = urllib.parse.quote_plus(" ".join(x for x in
        [rec.get("c1"), rec.get("c16"), rec.get("c12"), rec.get("c8"), rec.get("c4")] if x))
    tel = re.sub(r"\D", "", rec.get("c17") or "")
    if tel.startswith("0"):
        tel = "+9" + tel
    elif tel and not tel.startswith("90"):
        tel = "+90" + tel
    else:
        tel = "+" + tel if tel else ""
    return render_template("ilan.html", r=rec, id=rid, facts=facts,
                           sale=fmt_money_tr(rec.get("c23")) if rec.get("c23") else None,
                           rent=fmt_money_tr(rec.get("c7")) if rec.get("c7") else None,
                           per_m2=per_m2, addr=addr or "—",
                           maps_url=f"https://www.google.com/maps/search/?api=1&query={maps_q}",
                           tel=f"tel:{tel}" if tel else "",
                           today=datetime.now().strftime("%d.%m.%Y"))


# ---------------- okuma ----------------
@app.get("/api/columns")
def api_columns():
    return jsonify(meta())


@app.get("/api/records")
def api_records():
    args = request.args
    try:
        page = max(1, int(args.get("page", 1) or 1))
        per = min(500, max(5, int(args.get("per_page", 50) or 50)))
    except ValueError:
        return jsonify({"error": "sayfa değeri geçersiz"}), 400
    where, params = apply_filters(args)
    order = order_clause(args)
    c = cn()
    total = c.execute(f"SELECT COUNT(*) FROM records r {where}", params).fetchone()[0]
    keys = ",".join(f"r.c{i}" for i in range(N_COLS))
    rows = c.execute(f"""SELECT r.id, r.row_no, r.sync_state, {keys} FROM records r {where}
                         ORDER BY {order} LIMIT ? OFFSET ?""",
                     params + [per, (page - 1) * per]).fetchall()
    ids = [r["id"] for r in rows]
    tags = row_tags(c, ids)
    notes, topen, tdone = row_counts(c, ids)
    c.close()
    out = []
    for r in rows:
        d = {"id": r["id"], "row_no": r["row_no"], "sync_state": r["sync_state"]}
        for i in range(N_COLS):
            d[f"c{i}"] = r[f"c{i}"]
        d["tags"] = tags[r["id"]]
        d["notes_n"] = notes[r["id"]]
        d["tasks_open"] = topen[r["id"]]
        d["tasks_n"] = topen[r["id"]] + tdone[r["id"]]
        out.append(d)
    return jsonify({"total": total, "page": page, "per_page": per, "rows": out})


@app.get("/api/stats")
def api_stats():
    c = cn()
    total = c.execute("SELECT COUNT(*) FROM records").fetchone()[0]
    manual = c.execute("SELECT COUNT(*) FROM records WHERE sync_state = 'manual'").fetchone()[0]
    deleted = c.execute("SELECT COUNT(*) FROM records WHERE sync_state = 'deleted'").fetchone()[0]
    by_status = [{"v": r["v"], "n": r["n"]} for r in
                 c.execute("SELECT c9 v, COUNT(*) n FROM records GROUP BY c9 ORDER BY n DESC")]
    by_type = [{"v": r["v"], "n": r["n"]} for r in
               c.execute("SELECT c5 v, COUNT(*) n FROM records GROUP BY c5 ORDER BY n DESC")]
    by_project = [{"v": r["v"], "n": r["n"]} for r in
                  c.execute("SELECT c21 v, COUNT(*) n FROM records GROUP BY c21 ORDER BY n DESC LIMIT 10")]
    by_room = [{"v": r["v"], "n": r["n"]} for r in
               c.execute("SELECT c33 v, COUNT(*) n FROM records GROUP BY c33 ORDER BY n DESC")]
    sale = c.execute("SELECT COUNT(n23) cnt, SUM(n23) s, AVG(n23) a FROM records WHERE n23 IS NOT NULL").fetchone()
    rent = c.execute("SELECT COUNT(n7) cnt, AVG(n7) a FROM records WHERE n7 IS NOT NULL").fetchone()
    open_tasks = c.execute("SELECT COUNT(*) FROM tasks WHERE done = 0").fetchone()[0]
    tasks_overdue = c.execute("""SELECT COUNT(*) FROM tasks
        WHERE done = 0 AND due_date IS NOT NULL AND due_date < date('now')""").fetchone()[0]
    tasks_today = c.execute("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date = date('now')").fetchone()[0]
    tasks_week = c.execute("""SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date IS NOT NULL
        AND due_date BETWEEN date('now') AND date('now', '+7 days')""").fetchone()[0]
    notes_total = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    rev_total = c.execute("SELECT COUNT(*) FROM revisions").fetchone()[0]
    tags = [{"id": r["id"], "name": r["name"], "color": r["color"], "count": r["n"]} for r in
            c.execute("""SELECT t.id, t.name, t.color, COUNT(rt.record_id) n FROM tags t
                         LEFT JOIN record_tags rt ON rt.tag_id = t.id
                         GROUP BY t.id ORDER BY t.name""")]
    last_sync = c.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
    c.close()
    return jsonify({"total": total, "manual": manual, "deleted": deleted,
                    "by_status": by_status, "by_type": by_type,
                    "by_project": by_project, "by_room": by_room,
                    "sale_count": sale["cnt"], "sale_total": sale["s"], "sale_avg": sale["a"],
                    "rent_count": rent["cnt"], "rent_avg": rent["a"],
                    "open_tasks": open_tasks, "tasks_overdue": tasks_overdue,
                    "tasks_today": tasks_today, "tasks_week": tasks_week,
                    "notes_total": notes_total, "rev_total": rev_total, "tags": tags,
                    "last_sync": dict(last_sync) if last_sync else None})


@app.get("/api/aggregate")
def api_aggregate():
    col = request.args.get("col", "")
    m = by_key(col) if KEY_RE.match(col or "") else None
    if not m or m["dtype"] != "number":
        return jsonify({"error": "sayısal bir sütun seçin"}), 400
    where, params = apply_filters(request.args)
    cond = f"{where} AND r.n{col[1:]} IS NOT NULL" if where else f"WHERE r.n{col[1:]} IS NOT NULL"
    c = cn()
    r = c.execute(f"""SELECT COUNT(*) cnt, SUM(r.n{col[1:]}) s, AVG(r.n{col[1:]}) a,
        MIN(r.n{col[1:]}) mn, MAX(r.n{col[1:]}) mx FROM records r {cond}""", params).fetchone()
    c.close()
    return jsonify({"count": r["cnt"], "sum": r["s"], "avg": r["a"], "min": r["mn"], "max": r["mx"]})


@app.get("/api/activity")
def api_activity():
    try:
        limit = min(100, max(5, int(request.args.get("limit", 30) or 30)))
    except ValueError:
        return jsonify({"error": "limit geçersiz"}), 400
    c = cn()
    items = []
    for r in c.execute("""SELECT r.changed_at t, r.record_id, r.col_title, r.old_value, r.new_value, r.note,
        rec.c0, rec.c1, rec.c2, rec.row_no FROM revisions r
        JOIN records rec ON rec.id = r.record_id ORDER BY r.id DESC LIMIT ?""", (limit,)):
        items.append({"kind": "rev", "time": r["t"], "record_id": r["record_id"], "label": task_label(r),
                      "title": r["col_title"], "old": r["old_value"], "new": r["new_value"], "note": r["note"]})
    for r in c.execute("""SELECT n.created_at t, n.record_id, n.text,
        rec.c0, rec.c1, rec.c2, rec.row_no FROM notes n
        JOIN records rec ON rec.id = n.record_id ORDER BY n.id DESC LIMIT ?""", (limit,)):
        items.append({"kind": "note", "time": r["t"], "record_id": r["record_id"],
                      "label": task_label(r), "text": r["text"]})
    for r in c.execute("""SELECT t.created_at t, t.record_id, t.title, t.done,
        rec.c0, rec.c1, rec.c2, rec.row_no FROM tasks t
        JOIN records rec ON rec.id = t.record_id ORDER BY t.id DESC LIMIT ?""", (limit,)):
        items.append({"kind": "task", "time": r["t"], "record_id": r["record_id"],
                      "label": task_label(r), "title": r["title"], "done": r["done"]})
    c.close()
    items.sort(key=lambda x: x["time"] or "", reverse=True)
    return jsonify(items[:limit])


@app.get("/api/records/<int:rid>")
def api_detail(rid):
    c = cn()
    r = c.execute("SELECT * FROM records WHERE id = ?", (rid,)).fetchone()
    if not r:
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    rec = {"id": r["id"], "row_no": r["row_no"], "sync_state": r["sync_state"]}
    for i in range(N_COLS):
        rec[f"c{i}"] = r[f"c{i}"]
    notes = [dict(x) for x in c.execute(
        "SELECT * FROM notes WHERE record_id = ? ORDER BY id DESC", (rid,))]
    tasks = [dict(x) for x in c.execute(
        "SELECT * FROM tasks WHERE record_id = ? ORDER BY done, due_date IS NULL, due_date, id", (rid,))]
    tags = [dict(x) for x in c.execute(
        """SELECT t.id, t.name, t.color FROM record_tags rt
           JOIN tags t ON t.id = rt.tag_id WHERE rt.record_id = ? ORDER BY t.name""", (rid,))]
    revs = [dict(x) for x in c.execute(
        "SELECT * FROM revisions WHERE record_id = ? ORDER BY id DESC LIMIT 300", (rid,))]
    c.close()
    return jsonify({"record": rec, "notes": notes, "tasks": tasks, "tags": tags, "revisions": revs})


# ---------------- değer hazırlama ----------------
def parse_tr_number(s):
    s = (s or "").strip().replace(" ", "").replace("\u00a0", "")
    if not s:
        return None, None
    neg = s.startswith("-")
    s = s.lstrip("+-")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.match(r"^\d{1,3}(\.\d{3})+(\.\d+)?$", s):
        s = s.replace(".", "")
    try:
        return float(s) * (-1 if neg else 1), None
    except ValueError:
        return None, None


def parse_tr_date(s):
    s = (s or "").strip()
    if not s:
        return None, None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            if "%H" in fmt or dt.hour or dt.minute:
                canon = dt.strftime("%Y-%m-%d %H:%M")
            else:
                canon = dt.strftime("%Y-%m-%d")
            return canon, dt.timestamp()
        except ValueError:
            pass
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}", None
    return s, None


def coerce(col_meta, raw):
    """Ham girdi -> (metin, sayısal, normalize) üçlüsü."""
    new = ("" if raw is None else str(raw)).strip() or None
    if new is None:
        return None, None, None
    if col_meta["dtype"] == "number":
        num, _ = parse_tr_number(new)
        if num is not None:
            new = str(int(num)) if float(num).is_integer() else str(num)
        return new, num, None
    if col_meta["dtype"] == "date":
        canon, ts = parse_tr_date(new)
        return canon, ts, tr_lower(canon)
    return new, None, tr_lower(new)


def build_search(cs):
    return " ".join(tr_lower(s) for s in cs if s)


# ---------------- oluşturma / güncelleme ----------------
@app.post("/api/records")
def api_create():
    body = request.get_json(force=True, silent=True) or {}
    fields = body.get("fields", {})
    if not isinstance(fields, dict):
        return jsonify({"error": "fields geçersiz"}), 400
    cs = [None] * N_COLS
    ns = [None] * N_COLS
    ts = [None] * N_COLS
    for k, v in fields.items():
        if not KEY_RE.match(k):
            continue
        m = by_key(k)
        cval, nval, tval = coerce(m, v)
        i = int(k[1:])
        cs[i], ns[i], ts[i] = cval, nval, tval
    if not any(x is not None for x in cs):
        return jsonify({"error": "en az bir alan doldurun"}), 400
    c = cn()
    cols = ",".join(f"c{i}" for i in range(N_COLS))
    nums = ",".join(f"n{i}" for i in range(N_COLS))
    txts = ",".join(f"t{i}" for i in range(N_COLS))
    cur = c.execute(f"""INSERT INTO records (row_no, {cols}, {nums}, {txts}, search, sync_state)
        VALUES ({','.join('?' for _ in range(3 + 3 * N_COLS))})""",
        [None] + cs + ns + ts + [build_search(cs), "manual"])
    nid = cur.lastrowid
    c.commit()
    c.close()
    return jsonify({"ok": True, "id": nid}), 201


@app.put("/api/records/<int:rid>")
def api_update(rid):
    body = request.get_json(force=True, silent=True) or {}
    fields = body.get("fields", {})
    note = (body.get("note") or "").strip() or None
    if not isinstance(fields, dict):
        return jsonify({"error": "fields geçersiz"}), 400
    c = cn()
    r = c.execute("SELECT * FROM records WHERE id = ?", (rid,)).fetchone()
    if not r:
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    changed = []
    sets, params = [], []
    for k, v in fields.items():
        if not KEY_RE.match(k):
            continue
        m = by_key(k)
        new, num, tnorm = coerce(m, v)
        old = r[k]
        if (old or None) == new:
            continue
        idx = k[1:]
        sets += [f"c{idx} = ?", f"n{idx} = ?", f"t{idx} = ?"]
        params += [new, num if m["dtype"] in ("number", "date") else None, tnorm]
        changed.append({"key": k, "title": m["title"], "old": old, "new": new})
    if changed:
        cur = dict(r)
        for ch in changed:
            cur[ch["key"]] = ch["new"]
        sets.append("search = ?")
        params.append(build_search([cur[f"c{i}"] for i in range(N_COLS)]))
        params.append(rid)
        c.execute(f"UPDATE records SET {', '.join(sets)} WHERE id = ?", params)
        for ch in changed:
            c.execute("""INSERT INTO revisions (record_id, col_key, col_title, old_value, new_value, note, changed_at)
                         VALUES (?,?,?,?,?,?,?)""",
                      (rid, ch["key"], ch["title"], ch["old"], ch["new"], note, now()))
        c.commit()
    c.close()
    return jsonify({"ok": True, "changed": changed})


# ---------------- Excel senkronu ----------------
@app.get("/api/sync/status")
def api_sync_status():
    ensure_schema()
    c = cn()
    row = c.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
    c.close()
    return jsonify(dict(row) if row else None)


@app.post("/api/sync")
def api_sync():
    ensure_schema()
    import import_data
    try:
        titles, rows, dtypes = import_data.parse_workbook(XLSX)[:3]
    except FileNotFoundError:
        return jsonify({"error": f"Excel bulunamadı: {XLSX}"}), 400
    stored_dtypes = [by_key(f"c{i}")["dtype"] for i in range(N_COLS)]
    c = cn()
    keys = ",".join(f"c{i}" for i in range(N_COLS))
    db_rows, db_by_id, db_by_row = {}, {}, {}
    for r in c.execute(f"SELECT id, row_no, sync_state, {keys} FROM records WHERE row_no IS NOT NULL"):
        db_rows[r["id"]] = r
        db_by_row[r["row_no"]] = r["id"]
        if r["c0"]:
            db_by_id.setdefault(r["c0"], []).append(r["id"])
    xl = []
    for idx, out in enumerate(rows):
        cs, ns, ts, search = import_data.row_values(out, stored_dtypes)
        xl.append({"row_no": idx + 2, "cs": cs, "ns": ns, "ts": ts, "search": search})
    xl_by_id = {}
    for j, x in enumerate(xl):
        if x["cs"][0]:
            xl_by_id.setdefault(x["cs"][0], []).append(j)
    pairs, used_db, used_xl = [], set(), set()
    # 1. geç: ID eşleşmesi (tekrarlı ID'lerde sırayla eşle, kaymalara dayanıklı)
    for ident, js in xl_by_id.items():
        for did, j in zip(db_by_id.get(ident, []), js):
            pairs.append((did, j))
            used_db.add(did)
            used_xl.add(j)
    # 2. geç: ID'siz satırlarda satır no eşleşmesi
    for j, x in enumerate(xl):
        if j in used_xl or x["cs"][0]:
            continue
        did = db_by_row.get(x["row_no"])
        if did is not None and did not in used_db and not db_rows[did]["c0"]:
            pairs.append((did, j))
            used_db.add(did)
            used_xl.add(j)
    # kullanıcının elle değiştirdiği hücreler (çakışma adayı, Excel ezemez)
    user_rev = set((r["record_id"], r["col_key"]) for r in c.execute(
        "SELECT record_id, col_key FROM revisions WHERE note IS NULL OR note != 'Excel senkronu'"))
    t = now()
    added = upd_rows = upd_cells = conflict_n = 0
    conflicts = []
    cols = ",".join(f"c{i}" for i in range(N_COLS))
    nums = ",".join(f"n{i}" for i in range(N_COLS))
    txts = ",".join(f"t{i}" for i in range(N_COLS))
    for did, j in pairs:
        old = db_rows[did]
        x = xl[j]
        cs, ns, ts = x["cs"], x["ns"], x["ts"]
        diffs = [(i, old[f"c{i}"], cs[i]) for i in range(N_COLS) if (old[f"c{i}"] or None) != cs[i]]
        apply = [(i, o, n) for i, o, n in diffs if (did, f"c{i}") not in user_rev]
        for i, o, n in diffs:
            if (did, f"c{i}") in user_rev:
                conflict_n += 1
                if len(conflicts) < 50:
                    m = by_key(f"c{i}")
                    conflicts.append({"record_id": did, "label": task_label(old),
                                      "col": m["title"], "app_value": o, "excel_value": n})
        if not apply:
            if old["sync_state"] == "deleted" or old["row_no"] != x["row_no"]:
                c.execute("UPDATE records SET sync_state = 'active', row_no = ? WHERE id = ?",
                          (x["row_no"], did))
            continue
        sets, params = [], []
        for i, _, new in apply:
            sets += [f"c{i} = ?", f"n{i} = ?", f"t{i} = ?"]
            params += [new, ns[i], ts[i]]
        sets += ["search = ?", "sync_state = 'active'", "row_no = ?"]
        params += [x["search"], x["row_no"], did]
        c.execute(f"UPDATE records SET {', '.join(sets)} WHERE id = ?", params)
        for i, o, n in apply:
            m = by_key(f"c{i}")
            c.execute("""INSERT INTO revisions (record_id, col_key, col_title, old_value, new_value, note, changed_at)
                         VALUES (?,?,?,?,?,?,?)""",
                      (did, f"c{i}", m["title"], o, n, "Excel senkronu", t))
        upd_rows += 1
        upd_cells += len(apply)
    for j, x in enumerate(xl):
        if j in used_xl:
            continue
        c.execute(f"""INSERT INTO records (row_no, {cols}, {nums}, {txts}, search, sync_state)
            VALUES ({','.join('?' for _ in range(3 + 3 * N_COLS))})""",
            [x["row_no"]] + x["cs"] + x["ns"] + x["ts"] + [x["search"], "active"])
        added += 1
    deleted = 0
    for did, r in db_rows.items():
        if did not in used_db and r["sync_state"] != "deleted":
            c.execute("UPDATE records SET sync_state = 'deleted' WHERE id = ?", (did,))
            deleted += 1
    c.execute("INSERT INTO sync_log (at, added, updated_rows, updated_cells, deleted) VALUES (?,?,?,?,?)",
              (t, added, upd_rows, upd_cells, deleted))
    c.commit()
    total = c.execute("SELECT COUNT(*) FROM records").fetchone()[0]
    c.close()
    return jsonify({"ok": True, "at": t, "added": added, "updated_rows": upd_rows,
                    "updated_cells": upd_cells, "deleted": deleted, "total": total,
                    "conflict_count": conflict_n, "conflicts": conflicts})


# ---------------- notlar ----------------
@app.post("/api/records/<int:rid>/notes")
def api_note_add(rid):
    text = ((request.get_json(force=True, silent=True) or {}).get("text") or "").strip()
    if not text:
        return jsonify({"error": "not boş olamaz"}), 400
    c = cn()
    if not c.execute("SELECT 1 FROM records WHERE id = ?", (rid,)).fetchone():
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    cur = c.execute("INSERT INTO notes (record_id, text, created_at) VALUES (?,?,?)", (rid, text, now()))
    nid = cur.lastrowid
    c.commit()
    row = dict(c.execute("SELECT * FROM notes WHERE id = ?", (nid,)).fetchone())
    c.close()
    return jsonify(row), 201


@app.put("/api/notes/<int:nid>")
def api_note_edit(nid):
    text = ((request.get_json(force=True, silent=True) or {}).get("text") or "").strip()
    if not text:
        return jsonify({"error": "not boş olamaz"}), 400
    c = cn()
    if not c.execute("SELECT 1 FROM records WHERE id = ?", (nid,)).fetchone():
        c.close()
        return jsonify({"error": "not bulunamadı"}), 404
    c.execute("UPDATE notes SET text = ? WHERE id = ?", (text, nid))
    c.commit()
    c.close()
    return jsonify({"ok": True})


@app.delete("/api/notes/<int:nid>")
def api_note_del(nid):
    c = cn()
    c.execute("DELETE FROM notes WHERE id = ?", (nid,))
    c.commit()
    c.close()
    return jsonify({"ok": True})


# ---------------- görevler ----------------
def task_label(row):
    parts = [f"#{row['c0']}" if row["c0"] else f"satır {row['row_no']}"]
    if row["c1"]:
        parts.append(row["c1"])
    if row["c2"]:
        parts.append(f"Daire {row['c2']}")
    return " - ".join(parts)


@app.get("/api/tasks")
def api_tasks_all():
    args = request.args
    where, params = [], []
    if args.get("done") in ("0", "1"):
        where.append("t.done = ?")
        params.append(int(args["done"]))
    if args.get("record_id"):
        where.append("t.record_id = ?")
        params.append(args["record_id"])
    q = (args.get("q") or "").strip()
    if q:
        where.append("t.title LIKE ?")
        params.append(f"%{tr_lower(q)}%")
    w = ("WHERE " + " AND ".join(where)) if where else ""
    c = cn()
    rows = c.execute(f"""SELECT t.*, r.c0, r.c1, r.c2, r.row_no FROM tasks t
                         JOIN records r ON r.id = t.record_id {w}
                         ORDER BY t.done, t.due_date IS NULL, t.due_date, t.id DESC
                         LIMIT 1000""", params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["label"] = task_label(r)
        out.append(d)
    c.close()
    return jsonify(out)


@app.post("/api/records/<int:rid>/tasks")
def api_task_add(rid):
    body = request.get_json(force=True, silent=True) or {}
    title = (body.get("title") or "").strip()
    due = (body.get("due_date") or "").strip() or None
    if not title:
        return jsonify({"error": "görev boş olamaz"}), 400
    if due and not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
        return jsonify({"error": "tarih YYYY-AA-GG olmalı"}), 400
    c = cn()
    if not c.execute("SELECT 1 FROM records WHERE id = ?", (rid,)).fetchone():
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    t = now()
    cur = c.execute("""INSERT INTO tasks (record_id, title, done, due_date, created_at, updated_at)
                       VALUES (?,?,0,?,?,?)""", (rid, title, due, t, t))
    tid = cur.lastrowid
    c.commit()
    row = dict(c.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone())
    c.close()
    return jsonify(row), 201


@app.put("/api/tasks/<int:tid>")
def api_task_edit(tid):
    body = request.get_json(force=True, silent=True) or {}
    sets, params = [], []
    if "title" in body:
        title = (body["title"] or "").strip()
        if not title:
            return jsonify({"error": "görev boş olamaz"}), 400
        sets.append("title = ?")
        params.append(title)
    if "done" in body:
        sets.append("done = ?")
        params.append(1 if body["done"] else 0)
    if "due_date" in body:
        due = (body["due_date"] or "").strip() or None
        if due and not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
            return jsonify({"error": "tarih YYYY-AA-GG olmalı"}), 400
        sets.append("due_date = ?")
        params.append(due)
    if not sets:
        return jsonify({"error": "değişiklik yok"}), 400
    sets.append("updated_at = ?")
    params.append(now())
    params.append(tid)
    c = cn()
    if not c.execute("SELECT 1 FROM tasks WHERE id = ?", (tid,)).fetchone():
        c.close()
        return jsonify({"error": "görev bulunamadı"}), 404
    c.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", params)
    c.commit()
    c.close()
    return jsonify({"ok": True})


@app.delete("/api/tasks/<int:tid>")
def api_task_del(tid):
    c = cn()
    c.execute("DELETE FROM tasks WHERE id = ?", (tid,))
    c.commit()
    c.close()
    return jsonify({"ok": True})


# ---------------- toplu işlemler ----------------
def clean_ids(ids):
    out = []
    for i in (ids or []):
        try:
            out.append(int(i))
        except (TypeError, ValueError):
            pass
    return out


@app.post("/api/bulk/tags")
def api_bulk_tags():
    body = request.get_json(force=True, silent=True) or {}
    ids = clean_ids(body.get("record_ids"))
    if not ids or len(ids) > 2000:
        return jsonify({"error": "1-2000 arası kayıt seçin"}), 400
    tid = body.get("tag_id")
    c = cn()
    if tid is None and (body.get("name") or "").strip():
        name = body["name"].strip()
        color = (body.get("color") or "#4f46e5").strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", color):
            color = "#4f46e5"
        try:
            cur = c.execute("INSERT INTO tags (name, color) VALUES (?,?)", (name, color))
            tid = cur.lastrowid
        except sqlite3.IntegrityError:
            tid = c.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()["id"]
    try:
        tid = int(tid)
    except (TypeError, ValueError):
        c.close()
        return jsonify({"error": "etiket seçin"}), 400
    if not c.execute("SELECT 1 FROM tags WHERE id = ?", (tid,)).fetchone():
        c.close()
        return jsonify({"error": "etiket bulunamadı"}), 404
    c.executemany("INSERT OR IGNORE INTO record_tags VALUES (?,?)", [(i, tid) for i in ids])
    c.commit()
    c.close()
    return jsonify({"ok": True, "count": len(ids)})


@app.post("/api/bulk/tasks")
def api_bulk_tasks():
    body = request.get_json(force=True, silent=True) or {}
    ids = clean_ids(body.get("record_ids"))
    title = (body.get("title") or "").strip()
    due = (body.get("due_date") or "").strip() or None
    if not ids or len(ids) > 2000:
        return jsonify({"error": "1-2000 arası kayıt seçin"}), 400
    if not title:
        return jsonify({"error": "görev boş olamaz"}), 400
    if due and not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
        return jsonify({"error": "tarih YYYY-AA-GG olmalı"}), 400
    t = now()
    c = cn()
    c.executemany("""INSERT INTO tasks (record_id, title, done, due_date, created_at, updated_at)
                     VALUES (?,?,0,?,?,?)""", [(i, title, due, t, t) for i in ids])
    c.commit()
    c.close()
    return jsonify({"ok": True, "count": len(ids)})


@app.post("/api/bulk/status")
def api_bulk_status():
    body = request.get_json(force=True, silent=True) or {}
    ids = clean_ids(body.get("record_ids"))
    value = (body.get("value") or "").strip()
    note = (body.get("note") or "").strip() or "Toplu durum güncelleme"
    if not ids or len(ids) > 2000:
        return jsonify({"error": "1-2000 arası kayıt seçin"}), 400
    if not value or len(value) > 200:
        return jsonify({"error": "durum değeri geçersiz"}), 400
    c = cn()
    keys = ",".join(f"c{i}" for i in range(N_COLS))
    ph = ",".join("?" for _ in ids)
    rows = c.execute(f"SELECT id, {keys} FROM records WHERE id IN ({ph})", ids).fetchall()
    t = now()
    n = 0
    for r in rows:
        if (r["c9"] or None) == value:
            continue
        cur = dict(r)
        cur["c9"] = value
        c.execute("UPDATE records SET c9 = ?, t9 = ?, search = ? WHERE id = ?",
                  (value, tr_lower(value), build_search([cur[f"c{i}"] for i in range(N_COLS)]), r["id"]))
        c.execute("""INSERT INTO revisions (record_id, col_key, col_title, old_value, new_value, note, changed_at)
                     VALUES (?, 'c9', 'Durumu', ?, ?, ?, ?)""", (r["id"], r["c9"], value, note, t))
        n += 1
    c.commit()
    c.close()
    return jsonify({"ok": True, "count": n})


# ---------------- etiketler ----------------
@app.get("/api/tags")
def api_tags():
    c = cn()
    rows = c.execute("""SELECT t.id, t.name, t.color, COUNT(rt.record_id) n FROM tags t
                        LEFT JOIN record_tags rt ON rt.tag_id = t.id
                        GROUP BY t.id ORDER BY t.name""").fetchall()
    c.close()
    return jsonify([{"id": r["id"], "name": r["name"], "color": r["color"], "count": r["n"]} for r in rows])


@app.post("/api/tags")
def api_tag_add():
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    color = (body.get("color") or "#4f46e5").strip() or "#4f46e5"
    if not name:
        return jsonify({"error": "etiket adı boş olamaz"}), 400
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        return jsonify({"error": "renk #rrggbb olmalı"}), 400
    c = cn()
    try:
        cur = c.execute("INSERT INTO tags (name, color) VALUES (?,?)", (name, color))
        c.commit()
        tid = cur.lastrowid
    except sqlite3.IntegrityError:
        tid = c.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()["id"]
    row = dict(c.execute("SELECT * FROM tags WHERE id = ?", (tid,)).fetchone())
    c.close()
    return jsonify(row), 201


@app.put("/api/tags/<int:tid>")
def api_tag_edit(tid):
    body = request.get_json(force=True, silent=True) or {}
    c = cn()
    if not c.execute("SELECT 1 FROM tags WHERE id = ?", (tid,)).fetchone():
        c.close()
        return jsonify({"error": "etiket bulunamadı"}), 404
    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            c.close()
            return jsonify({"error": "etiket adı boş olamaz"}), 400
        try:
            c.execute("UPDATE tags SET name = ? WHERE id = ?", (name, tid))
        except sqlite3.IntegrityError:
            c.close()
            return jsonify({"error": "bu ad zaten var"}), 400
    if "color" in body:
        color = (body["color"] or "").strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", color):
            c.close()
            return jsonify({"error": "renk #rrggbb olmalı"}), 400
        c.execute("UPDATE tags SET color = ? WHERE id = ?", (color, tid))
    c.commit()
    c.close()
    return jsonify({"ok": True})


@app.delete("/api/tags/<int:tid>")
def api_tag_del(tid):
    c = cn()
    c.execute("DELETE FROM record_tags WHERE tag_id = ?", (tid,))
    c.execute("DELETE FROM tags WHERE id = ?", (tid,))
    c.commit()
    c.close()
    return jsonify({"ok": True})


@app.post("/api/records/<int:rid>/tags")
def api_record_tag_add(rid):
    body = request.get_json(force=True, silent=True) or {}
    c = cn()
    if not c.execute("SELECT 1 FROM records WHERE id = ?", (rid,)).fetchone():
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    tid = body.get("tag_id")
    if tid is None and body.get("name"):
        name = body["name"].strip()
        color = (body.get("color") or "#4f46e5").strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", color):
            color = "#4f46e5"
        try:
            cur = c.execute("INSERT INTO tags (name, color) VALUES (?,?)", (name, color))
            tid = cur.lastrowid
        except sqlite3.IntegrityError:
            tid = c.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()["id"]
    if tid is None or not c.execute("SELECT 1 FROM tags WHERE id = ?", (tid,)).fetchone():
        c.close()
        return jsonify({"error": "etiket bulunamadı"}), 404
    c.execute("INSERT OR IGNORE INTO record_tags VALUES (?,?)", (rid, tid))
    c.commit()
    c.close()
    return jsonify({"ok": True})


@app.delete("/api/records/<int:rid>/tags/<int:tid>")
def api_record_tag_del(rid, tid):
    c = cn()
    c.execute("DELETE FROM record_tags WHERE record_id = ? AND tag_id = ?", (rid, tid))
    c.commit()
    c.close()
    return jsonify({"ok": True})


# ---------------- dışa aktarma ----------------
@app.get("/api/export")
def api_export():
    args = request.args
    fmt = (args.get("format") or "csv").lower()
    where, params = apply_filters(args)
    order = order_clause(args)
    keys = ",".join(f"c{i}" for i in range(N_COLS))
    c = cn()
    rows = c.execute(f"SELECT id, row_no, {keys} FROM records r {where} ORDER BY {order} LIMIT 60000",
                     params).fetchall()
    c.close()
    titles = ["Kayıt No", "Excel Satırı"] + [m["title"] for m in meta()]
    if fmt == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font
        from openpyxl.utils import get_column_letter
        wb = Workbook()
        ws = wb.active
        ws.title = "Kayıtlar"
        ws.append(titles)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in rows:
            ws.append([r["id"], r["row_no"]] + [r[f"c{i}"] for i in range(N_COLS)])
        for i in range(len(titles)):
            ws.column_dimensions[get_column_letter(i + 1)].width = 20
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return Response(buf.read(),
                        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": "attachment; filename=kayitlar.xlsx"})
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\n")
    w.writerow(titles)
    for r in rows:
        w.writerow([r["id"], r["row_no"]] + [r[f"c{i}"] if r[f"c{i}"] is not None else "" for i in range(N_COLS)])
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=kayitlar.csv"})


@app.errorhandler(404)
def nf(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "bulunamadı"}), 404
    return render_template("index.html")


if __name__ == "__main__":
    if not os.path.exists(DB):
        print(">> veri tabanı yok, aktarım başlatılıyor...")
        import import_data
        import_data.main()
    ensure_schema()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
