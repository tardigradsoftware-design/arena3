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
from datetime import datetime

from flask import Flask, Response, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
DB = os.environ.get("DATA_DB", os.path.join(BASE, "data", "app.db"))
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
    rows = c.execute(f"""SELECT r.id, r.row_no, {keys} FROM records r {where}
                         ORDER BY {order} LIMIT ? OFFSET ?""",
                     params + [per, (page - 1) * per]).fetchall()
    ids = [r["id"] for r in rows]
    tags = row_tags(c, ids)
    notes, topen, tdone = row_counts(c, ids)
    c.close()
    out = []
    for r in rows:
        d = {"id": r["id"], "row_no": r["row_no"]}
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
    by_status = [{"v": r["v"], "n": r["n"]} for r in
                 c.execute("SELECT c9 v, COUNT(*) n FROM records GROUP BY c9 ORDER BY n DESC")]
    by_type = [{"v": r["v"], "n": r["n"]} for r in
               c.execute("SELECT c5 v, COUNT(*) n FROM records GROUP BY c5 ORDER BY n DESC")]
    open_tasks = c.execute("SELECT COUNT(*) FROM tasks WHERE done = 0").fetchone()[0]
    notes_total = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    rev_total = c.execute("SELECT COUNT(*) FROM revisions").fetchone()[0]
    tags = [{"id": r["id"], "name": r["name"], "color": r["color"], "count": r["n"]} for r in
            c.execute("""SELECT t.id, t.name, t.color, COUNT(rt.record_id) n FROM tags t
                         LEFT JOIN record_tags rt ON rt.tag_id = t.id
                         GROUP BY t.id ORDER BY t.name""")]
    c.close()
    return jsonify({"total": total, "by_status": by_status, "by_type": by_type,
                    "open_tasks": open_tasks, "notes_total": notes_total,
                    "rev_total": rev_total, "tags": tags})


@app.get("/api/records/<int:rid>")
def api_detail(rid):
    c = cn()
    r = c.execute("SELECT * FROM records WHERE id = ?", (rid,)).fetchone()
    if not r:
        c.close()
        return jsonify({"error": "kayıt bulunamadı"}), 404
    rec = {"id": r["id"], "row_no": r["row_no"]}
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


# ---------------- güncelleme (revizyonlu) ----------------
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
            canon = dt.strftime("%Y-%m-%d %H:%M") if ("H" in fmt or dt.hour or dt.minute) else dt.strftime("%Y-%m-%d")
            if "%H" not in fmt and not dt.hour and not dt.minute:
                canon = dt.strftime("%Y-%m-%d")
            return canon, dt.timestamp()
        except ValueError:
            pass
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}", None
    return s, None


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
        new = ("" if v is None else str(v)).strip() or None
        old = r[k]
        if (old or None) == new:
            continue
        idx = k[1:]
        if m["dtype"] == "number" and new is not None:
            num, _ = parse_tr_number(new)
            if num is not None:
                new = str(int(num)) if float(num).is_integer() else str(num)
            else:
                num = None
            sets += [f"c{idx} = ?", f"n{idx} = ?", f"t{idx} = NULL"]
            params += [new, num]
        elif m["dtype"] == "date" and new is not None:
            canon, ts = parse_tr_date(new)
            sets += [f"c{idx} = ?", f"n{idx} = ?", f"t{idx} = ?"]
            params += [canon, ts, tr_lower(canon)]
            new = canon
        else:
            sets += [f"c{idx} = ?", f"n{idx} = NULL", f"t{idx} = ?"]
            params += [new, tr_lower(new) if new else None]
        changed.append({"key": k, "title": m["title"], "old": old, "new": new})
    if changed:
        cur = dict(r)
        for ch in changed:
            cur[ch["key"]] = ch["new"]
        search = " ".join(tr_lower(cur[f"c{i}"]) for i in range(N_COLS) if cur[f"c{i}"])
        sets.append("search = ?")
        params.append(search)
        params.append(rid)
        c.execute(f"UPDATE records SET {', '.join(sets)} WHERE id = ?", params)
        for ch in changed:
            c.execute("""INSERT INTO revisions (record_id, col_key, col_title, old_value, new_value, note, changed_at)
                         VALUES (?,?,?,?,?,?,?)""",
                      (rid, ch["key"], ch["title"], ch["old"], ch["new"], note, now()))
        c.commit()
    c.close()
    return jsonify({"ok": True, "changed": changed})


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
    if not c.execute("SELECT 1 FROM notes WHERE id = ?", (nid,)).fetchone():
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
    color = (body.get("color") or "#2563eb").strip() or "#2563eb"
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
        color = (body.get("color") or "#2563eb").strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", color):
            color = "#2563eb"
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
    letters = ["", ""] + [m["letter"] for m in meta()]
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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
