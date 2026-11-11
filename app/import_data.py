#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TÜMÜ-revize.xlsx -> SQLite (data/app.db) aktarımı."""
import json
import os
import sqlite3
from datetime import datetime, date, time

import openpyxl
from openpyxl.utils import get_column_letter

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("DATA_DB", os.path.join(BASE, "data", "app.db"))
XLSX = os.environ.get("DATA_XLSX", os.path.join(BASE, "..", "TÜMÜ-revize.xlsx"))
N_COLS = 47

FRIENDLY = {
    "ContentPlaceHolder1_txtAdresTanimi_ctl01_ctl22_select": "Adres Tanımı 1",
    "ContentPlaceHolder1_txtAdresTanimi_ctl01_ctl24_select": "Adres Tanımı 2",
    "URL:": "URL",
    "Target:": "Hedef",
    "ContentPlaceHolder1_txtAdresTanimi_ctl02_ctl01": "Adres Tanımı 3",
    "Türü (ContentPlaceHolder1_ddListGorusmeTuru)": "Görüşme Türü",
    "Durumu (ContentPlaceHolder1_ddListSonDurumlar)": "Son Durum",
    "ContentPlaceHolder1_chHatirlatma": "Hatırlatma",
    "ContentPlaceHolder1_txtNot": "Not (Kaynak)",
    "lblHatirlatmaMetni": "Hatırlatma Metni",
    "txtErtelemeTarih": "Erteleme Tarihi",
    "txtERtelenmeSaat": "Erteleme Saati",
}
# varsayılan olarak gizli sütunlar (AJ..AS: form artıkları / boş alanlar)
HIDE_DEFAULT = set(range(35, 45))

TR = str.maketrans("İIŞĞÜÖÇ", "iışğüöç")


def tr_lower(s):
    return (s or "").translate(TR).lower()


def cell_text_num(v):
    """Hücre değeri -> (metin, sayısal) ikilisi."""
    if v is None:
        return None, None
    if isinstance(v, bool):
        return ("1" if v else "0"), float(v)
    if isinstance(v, datetime):
        s = v.strftime("%Y-%m-%d %H:%M") if (v.hour or v.minute or v.second) else v.strftime("%Y-%m-%d")
        try:
            return s, v.timestamp()
        except Exception:
            return s, None
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d"), datetime(v.year, v.month, v.day).timestamp()
    if isinstance(v, time):
        return v.strftime("%H:%M"), None
    if isinstance(v, (int, float)):
        s = str(int(v)) if float(v).is_integer() else str(v)
        return s, float(v)
    s = str(v)
    return (s if s != "" else None), None


def main():
    if not os.path.exists(XLSX):
        raise SystemExit(f"Excel bulunamadı: {XLSX}  (DATA_XLSX ile yol verilebilir)")
    print(f">> okunuyor: {XLSX}")
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.active

    titles = []
    for c in range(1, N_COLS + 1):
        h = ws.cell(1, c).value
        h = str(h).strip() if h not in (None, "") else f"Sütun {get_column_letter(c)}"
        titles.append(FRIENDLY.get(h, h))

    rows, flags, distinct = [], [], [set() for _ in range(N_COLS)]
    for c in range(N_COLS):
        flags.append({"dt": 0, "num": 0, "str": 0})
    n = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        out = []
        for c in range(N_COLS):
            v = row[c] if c < len(row) else None
            s, num = cell_text_num(v)
            out.append((s, num))
            if s is not None:
                if isinstance(v, (datetime, date, time)):
                    flags[c]["dt"] += 1
                elif isinstance(v, bool) or isinstance(v, (int, float)):
                    flags[c]["num"] += 1
                else:
                    flags[c]["str"] += 1
                if len(distinct[c]) < 500:
                    distinct[c].add(s)
        rows.append(out)
        n += 1
    wb.close()
    print(f">> {n} satır okundu")

    dtypes = []
    for c in range(N_COLS):
        f = flags[c]
        if f["dt"] and not f["str"] and not f["num"]:
            dtypes.append("date")
        elif f["dt"] and f["str"] == 0:
            dtypes.append("date")
        elif f["num"] and not f["str"] and not f["dt"]:
            dtypes.append("number")
        else:
            dtypes.append("text")

    os.makedirs(os.path.dirname(DB), exist_ok=True)
    if os.path.exists(DB):
        os.remove(DB)
    cn = sqlite3.connect(DB)
    cc = cn.cursor()
    coldefs = ", ".join(f"c{i} TEXT" for i in range(N_COLS))
    numdefs = ", ".join(f"n{i} REAL" for i in range(N_COLS))
    txtdefs = ", ".join(f"t{i} TEXT" for i in range(N_COLS))
    cc.execute(f"CREATE TABLE records (id INTEGER PRIMARY KEY, row_no INTEGER, {coldefs}, {numdefs}, {txtdefs}, search TEXT)")
    cc.execute("""CREATE TABLE columns (
        key TEXT PRIMARY KEY, pos INTEGER, letter TEXT, title TEXT,
        dtype TEXT, visible INTEGER, filter_values TEXT)""")
    cc.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, record_id INTEGER, text TEXT, created_at TEXT)")
    cc.execute("""CREATE TABLE tasks (id INTEGER PRIMARY KEY, record_id INTEGER, title TEXT,
        done INTEGER DEFAULT 0, due_date TEXT, created_at TEXT, updated_at TEXT)""")
    cc.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT)")
    cc.execute("CREATE TABLE record_tags (record_id INTEGER, tag_id INTEGER, PRIMARY KEY (record_id, tag_id))")
    cc.execute("""CREATE TABLE revisions (id INTEGER PRIMARY KEY, record_id INTEGER, col_key TEXT,
        col_title TEXT, old_value TEXT, new_value TEXT, note TEXT, changed_at TEXT)""")
    cc.execute("CREATE INDEX ix_notes_rec ON notes(record_id)")
    cc.execute("CREATE INDEX ix_tasks_rec ON tasks(record_id)")
    cc.execute("CREATE INDEX ix_rtags_rec ON record_tags(record_id)")
    cc.execute("CREATE INDEX ix_rev_rec ON revisions(record_id)")

    for c in range(N_COLS):
        vals = sorted(distinct[c])
        filt = None
        if 2 <= len(vals) <= 30:
            try:
                vals = sorted(vals, key=lambda x: (float(x.replace(",", ".")), x))
            except ValueError:
                vals = sorted(vals, key=tr_lower)
            filt = json.dumps(vals, ensure_ascii=False)
        cc.execute("INSERT INTO columns VALUES (?,?,?,?,?,?,?)",
                   (f"c{c}", c, get_column_letter(c + 1), titles[c], dtypes[c],
                    0 if c in HIDE_DEFAULT else 1, filt))

    ins = (f"INSERT INTO records (row_no, {','.join(f'c{i}' for i in range(N_COLS))},"
           f"{','.join(f'n{i}' for i in range(N_COLS))},{','.join(f't{i}' for i in range(N_COLS))},search)"
           f" VALUES ({','.join('?' for _ in range(1 + 3 * N_COLS + 1))})")
    batch = []
    for rno, out in enumerate(rows, start=2):
        cs = [s for s, _ in out]
        ns = [num if dtypes[c] in ("number", "date") else None for c, (_, num) in enumerate(out)]
        ts = [tr_lower(s) if (s is not None and dtypes[c] != "number") else None
              for c, s in enumerate(cs)]
        search = " ".join(tr_lower(s) for s in cs if s)
        batch.append([rno] + cs + ns + ts + [search])
    cc.executemany(ins, batch)
    cn.commit()
    print(f">> yazıldı: {DB} ({cn.execute('SELECT COUNT(*) FROM records').fetchone()[0]} kayıt)")
    print(">> türler:", {t: dtypes.count(t) for t in ("text", "number", "date")})
    cn.close()


if __name__ == "__main__":
    main()
