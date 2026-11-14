"""EDİTORYAL DOSYA — özgün dikey video sistemi (sıfır hazır görsel, sıfır maskot).

Kimlik: koyu mürekkep zemin + ince ızgara, montserrat black tipografi,
monospace resmî etiketler, çizgi ikonlar, panel içi "belge" düzenleri.
Her kare PIL ile çizilir; motion tamamen kodla (maske açılımı, sayı sayacı,
çizgi çizimi, damga).

Kullanım: VIDEO_CFG=cfg_<x>.json python3 scripts/render_editorial.py
"""
import json
import math
import os
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
W, H, FPS, SR = 1080, 1920, 30, 44100

CFG = json.load(open(A(os.environ.get("CFG_DIR", "videos"),
                       os.environ.get("VIDEO_CFG", "cfg.json")), encoding="utf-8"))
OUT_NAME = CFG["out"]
VO_TEXT = CFG["tts"]
VO_SRC = CFG["vo_src"]

# ------------------------------------------------------------------ kimlik
BG = (11, 14, 17)
PANEL = (20, 24, 28)
PANEL2 = (26, 31, 36)
BORDER = (45, 52, 59)
TXT = (245, 243, 238)
DIM = (138, 147, 155)
ACC = (216, 255, 62)      # asit limon — imza rengi
ACC_D = (168, 204, 32)
WARN = (255, 122, 89)
COOL = (108, 196, 255)

_AVAIL = (700, 800, 900)
_FC = {}


def F(w, s):
    """En yakın mevcut Montserrat ağırlığına düşer (700/800/900)."""
    w = min(_AVAIL, key=lambda a: abs(a - w))
    key = (w, int(s))
    if key not in _FC:
        _FC[key] = ImageFont.truetype(A("assets/fonts", f"Montserrat-{w}.ttf"), max(8, int(s)))
    return _FC[key]
FM = None


def mono(size, bold=False):
    global FM
    if FM is None:
        FM = {}
    key = (size, bold)
    if key not in FM:
        FM[key] = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono%s.ttf"
                                     % ("-Bold" if bold else ""), max(8, int(size)))
    return FM[key]


def tr(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def tw(t, f):
    return f.getlength(t)


def track(t, f, extra):
    return tw(t, f) + extra * max(0, len(t) - 1)


def draw_tracked(d, pos, t, f, fill, extra, anchor_left=True):
    x = pos[0]
    for ch in t:
        d.text((x, pos[1]), ch, font=f, fill=fill)
        x += tw(ch, f) + extra
    return x


def fit(text, weight_fn, size, max_w, min_size=18):
    while size > min_size and weight_fn(size).getlength(text) > max_w:
        size -= 2
    return size


# ------------------------------------------------------------------ zaman
def build_vo():
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    dst = A("assets/vo_ed.wav")
    af = ("aresample=44100,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "atempo=1.15,areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "areverse,dynaudnorm=f=250:g=5:p=0.92,highpass=f=95")
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", A(VO_SRC),
                    "-af", af, "-ac", "1", "-ar", "44100", dst], check=True)


build_vo()
with wave.open(A("assets/vo_ed.wav")) as _w:
    VO_DUR = _w.getnframes() / _w.getframerate()

VO_START = 0.10
CONTENT_END = VO_START + VO_DUR
CTA_LEN = 3.6
TOTAL = CONTENT_END + CTA_LEN
N = int(round(TOTAL * FPS))


def _words():
    ws = VO_TEXT.split()
    w = np.array([len(x) + 1.5 + (2.2 if x.endswith(",") else 0) for x in ws], float)
    d = w / w.sum() * (VO_DUR - 0.05)
    t, out = VO_START, []
    for x, dd in zip(ws, d):
        out.append([x, t, t + dd])
        t += dd
    return out


WORDS = _words()


def plan():
    scenes = [s for s in CFG["scenes"] if s.get("type") != "cta"]
    fixed = [s for s in scenes if s.get("dur")]
    free = [s for s in scenes if not s.get("dur")]
    used = sum(float(s["dur"]) for s in fixed)
    left = max(1.0, CONTENT_END - used)
    wtot = sum(float(s.get("weight", 1)) for s in free) or 1.0
    out, t = [], 0.0
    for s in scenes:
        d = float(s["dur"]) if s.get("dur") else left * float(s.get("weight", 1)) / wtot
        out.append((t, t + d, s))
        t += d
    return out


SCENES = plan()


def scene_at(t):
    for a, b, s in SCENES:
        if a <= t < b:
            return a, b, s
    return SCENES[-1]


# ------------------------------------------------------------------ yumuşatma
def eo(p):
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3


def eio(p):
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p)


def mix(c1, c2, k):
    k = min(1.0, max(0.0, k))
    return tuple(int(a + (b - a) * k) for a, b in zip(c1, c2))


# ------------------------------------------------------------------ zemin
_BG = None


def bg_img():
    global _BG
    if _BG is not None:
        return _BG
    img = Image.new("RGB", (W, H), BG)
    lay = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(lay)
    # ince ızgara
    for x in range(0, W, 60):
        d.line([x, 0, x, H], fill=(17, 21, 25), width=1)
    for y in range(0, H, 60):
        d.line([0, y, W, y], fill=(17, 21, 25), width=1)
    img = lay
    # üst ve alt yumuşak ışık
    glow = Image.new("L", (W // 6, H // 6), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-W // 14, -H // 12, W // 6 + W // 14, H // 12], fill=54)
    gd.ellipse([-W // 14, H // 6 - H // 10, W // 6 + W // 14, H // 6 + H // 10], fill=30)
    glow = glow.filter(ImageFilter.GaussianBlur(22)).resize((W, H), Image.BICUBIC)
    img = Image.composite(Image.new("RGB", (W, H), (22, 30, 38)), img, glow)
    _BG = img
    return img


# ------------------------------------------------------------------ temel bileşenler
def rule(d, x0, x1, y, k=1.0, color=BORDER, wdt=2):
    if k <= 0:
        return
    d.line([x0, y, x0 + (x1 - x0) * min(1.0, k), y], fill=color, width=wdt)


def label(d, text, x, y, k=1.0, color=ACC, size=26, extra=3.4):
    """Monospace, harf aralıklı resmî etiket: ▸ 01 / KONU."""
    if k <= 0.02:
        return
    f = mono(size, True)
    draw_tracked(d, (x, y), tr(text)[: int(len(text) * k) + 1], f, color, extra)


def masked_text(img, box, text_lines, f, top, fill, p):
    """Aşağıdan yukarı açılan tipografi: blok sabit, görünürlük alttan büyür."""
    if p <= 0.01:
        return top
    lh = f.size * 1.06
    block_h = int(lh * len(text_lines)) + 12
    tmp = Image.new("RGBA", (W, block_h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    for i, line in enumerate(text_lines):
        td.text((box[0], i * lh), line, font=f, fill=fill)
    k = eo(p)
    vh = max(1, int(block_h * k))
    part = tmp.crop((0, block_h - vh, W, block_h))
    img.paste(part, (0, int(top + block_h - vh)), part)
    return top + block_h


def headline(img, lines, t, top=380, size=118, max_w=900, x=84, accent=ACC,
             hl=None, per_line_delay=0.1, tracking=0):
    d = ImageDraw.Draw(img)
    y = top
    hl = hl or []
    for i, line in enumerate(lines):
        p = (t - i * per_line_delay) / 0.5
        sz = fit(tr(line), lambda s: F(900, s), size, max_w)
        f = F(900, sz)
        masked_text(img, (x, y), [tr(line)], f, y, accent if i in hl else TXT, p)
        y += sz * 1.06
    return y


def chip(d, x, y, text, fg=BG, bg=ACC, size=26, pad=22, h=54):
    f = mono(size, True)
    w = track(tr(text), f, 3.0) + pad * 2
    d.rectangle([x, y, x + w, y + h], fill=bg)
    d.text((x + pad, y + h / 2 - 1), "", font=f, fill=fg)
    xx = x + pad
    for ch in tr(text):
        d.text((xx, y + h / 2), ch, font=f, fill=fg, anchor="lm")
        xx += tw(ch, f) + 3.0
    return x + w


def icon(d, name, cx, cy, s, col=ACC, wdt=5):
    """Kodla çizilen ince çizgi ikonlar (24x24 grid -> s ölçek)."""
    u = s / 24.0

    def L(x1, y1, x2, y2):
        d.line([cx + x1 * u, cy + y1 * u, cx + x2 * u, cy + y2 * u], fill=col, width=wdt)

    if name == "search":
        d.ellipse([cx - 8 * u, cy - 8 * u, cx + 4 * u, cy + 4 * u], outline=col, width=wdt)
        L(4, 4, 10, 10)
    elif name == "doc":
        d.rounded_rectangle([cx - 7 * u, cy - 10 * u, cx + 7 * u, cy + 10 * u], radius=2, outline=col, width=wdt)
        for i in range(3):
            L(-4, -4 + i * 4, 4, -4 + i * 4)
    elif name == "wallet":
        d.rounded_rectangle([cx - 10 * u, cy - 7 * u, cx + 10 * u, cy + 7 * u], radius=3, outline=col, width=wdt)
        d.ellipse([cx + 2 * u, cy - 2 * u, cx + 7 * u, cy + 2 * u], outline=col, width=wdt)
    elif name == "check":
        L(-8, 0, -2, 7)
        L(-2, 7, 9, -8)
    elif name == "warn":
        L(0, -10, 10, 8)
        L(10, 8, -10, 8)
        L(-10, 8, 0, -10)
        L(0, -3, 0, 2)
        d.ellipse([cx - 1.6 * u, cy + 4 * u, cx + 1.6 * u, cy + 7.2 * u], fill=col)
    elif name == "id":
        d.rounded_rectangle([cx - 10 * u, cy - 7 * u, cx + 10 * u, cy + 7 * u], radius=2, outline=col, width=wdt)
        d.ellipse([cx - 6 * u, cy - 4 * u, cx - 1 * u, cy + 1 * u], outline=col, width=wdt)
        L(1, -3, 7, -3)
        L(1, 1, 6, 1)
        L(-6, 4, 7, 4)
    elif name == "clock":
        d.ellipse([cx - 10 * u, cy - 10 * u, cx + 10 * u, cy + 10 * u], outline=col, width=wdt)
        L(0, -5, 0, 1)
        L(0, 1, 5, 3)
    elif name == "shield":
        L(-9, -9, 9, -9)
        L(-9, -9, -9, 2)
        L(9, -9, 9, 2)
        L(-9, 2, 0, 10)
        L(9, 2, 0, 10)
        L(0, -5, 0, 4)


def panel(img, box, t, p=1.0, accent_bar=None, title=None, subtitle=None, num=None):
    """Editoryal panel: köşe çentikleri + ince çerçeve + başlık satırı."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    k = eo(p)
    if k <= 0.01:
        return
    yy1 = y0 + (y1 - y0) * k
    d.rectangle([x0, y0, x1, yy1], fill=PANEL)
    d.rectangle([x0, y0, x1, yy1], outline=BORDER, width=2)
    # köşe çentikleri (imza detayı)
    c = 26
    for (ax, ay, dx, dy) in ((x0, y0, 1, 1), (x1, y0, -1, 1)):
        d.line([ax, ay, ax + c * dx, ay], fill=ACC if accent_bar else BORDER, width=4)
        d.line([ax, ay, ax, ay + c * dy], fill=ACC if accent_bar else BORDER, width=4)
    if title and k > 0.6:
        f = F(800, 34)
        d.text((x0 + 38, y0 + 46), tr(title), font=f, fill=TXT, anchor="lm")
        if num:
            fm = mono(24, True)
            d.text((x1 - 38, y0 + 46), tr(num), font=fm, fill=ACC, anchor="rm")
        if subtitle:
            fm = mono(22)
            d.text((x0 + 38, y0 + 88), tr(subtitle), font=fm, fill=DIM, anchor="lm")
        d.line([x0 + 38, y0 + 118, x1 - 38, y0 + 118], fill=BORDER, width=2)


# ------------------------------------------------------------------ sahneler
def sc_hook(img, s, t, lt):
    d = ImageDraw.Draw(img)
    p = eo(lt / 0.5)
    label(d, s.get("label", "DOSYA 01"), 84, 150, min(1.0, lt * 3))
    chip(d, 84, 200, s.get("chip", "E-DEVLET"), size=24, h=50)
    y = headline(img, s["lines"], lt, top=430, size=132, hl=s.get("hl", [1]))
    rule(d, 84, W - 84, y + 18, eo((lt - 0.45) / 0.5))
    if s.get("sub"):
        p2 = eo((lt - 0.6) / 0.45)
        if p2 > 0.02:
            f = F(600, 34)
            d.text((84, y + 62), tr(s["sub"]), font=f, fill=mix(BG, DIM, p2), anchor="lm")
    # sağ altta dikey dosya numarası
    fm = mono(96, True)
    d.text((W - 84, H - 300), s.get("num", "01"), font=fm, fill=(26, 32, 37), anchor="rm")
    if s.get("art", True):
        art_flow(img, t, 1010, 1.0, y + 190)
        fm = mono(22)
        d.text((84, 1200), tr(s.get("foot", "SORGU  •  İADE  •  TRANSFER")), font=fm, fill=(84, 92, 70), anchor="lm")


def art_flow(img, t, y0, k, bottom=1500):
    """İmza grafik: üç paralel çizgi + akan nokta (veri akışı hissi)."""
    d = ImageDraw.Draw(img)
    for i in range(3):
        y = y0 + i * 46
        d.line([84, y, 84 + (W - 168) * eio((t - 0.6 - i * 0.12) / 0.8), y],
               fill=BORDER if i else ACC, width=3)
    ph = (t * 0.55) % 1.0
    x = 84 + (W - 168) * ph
    d.ellipse([x - 9, y0 - 9, x + 9, y0 + 9], fill=ACC)
    d.ellipse([x - 22, y0 - 22, x + 22, y0 + 22], outline=(60, 74, 40), width=2)


def sc_steps(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "ADIMLAR"), 84, 150, min(1, lt * 3))
    y = headline(img, s["lines"], lt, top=210, size=100, hl=s.get("hl", []))
    rows = s["rows"]
    top = 660
    n = len(rows)
    gap = min(232, (1500 - top) // max(1, n))
    for i, r in enumerate(rows):
        p = eo((lt - 0.35 - i * 0.34) / 0.45)
        if p <= 0.01:
            continue
        yy = top + i * gap - (1 - p) * 26
        # numara
        fm = mono(44, True)
        d.text((84, yy), f"0{i + 1}", font=fm, fill=ACC if p > 0.5 else DIM, anchor="lm")
        # dikey bağlantı
        if i < n - 1:
            d.line([104, yy + 34, 104, yy + gap - 30], fill=(38, 44, 50), width=3)
        # başlık + açıklama
        f1 = F(800, 46)
        sz = fit(tr(r[0]), lambda x: F(800, x), 46, W - 340)
        f1 = F(800, sz)
        d.text((166, yy - 18), tr(r[0]), font=f1, fill=mix(BG, TXT, p), anchor="lm")
        if len(r) > 1:
            f2 = F(500, 32)
            d.text((166, yy + 30), tr(r[1]), font=f2, fill=mix(BG, DIM, p), anchor="lm")
        icon(d, r[2] if len(r) > 2 else "doc", W - 120, yy - 6, 46,
             ACC if p > 0.6 else (80, 88, 60), 5)
        rule(d, 166, W - 190, yy + 62, eo((lt - 0.5 - i * 0.34) / 0.5), (32, 38, 44))
    caption(img, t)


def sc_ui(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "EKRAN"), 84, 150, min(1, lt * 3))
    headline(img, s["lines"], lt, top=210, size=100, hl=s.get("hl", []))
    box = [84, 640, W - 84, 1420]
    panel(img, box, t, (lt - 0.1) / 0.5, accent_bar=True,
          title=s.get("t_title", "E-DEVLET / ARAMA"), num=s.get("t_num", "CANLI"))
    # arama alanı
    d.rounded_rectangle([box[0] + 38, box[1] + 150, box[2] - 38, box[1] + 254], radius=6,
                        fill=(12, 16, 20), outline=BORDER, width=2)
    icon(d, "search", box[0] + 78, box[1] + 202, 34, DIM, 4)
    q = s["query"]
    n = int(max(0, min(1.0, (lt - 0.45) / 1.0)) * len(q))
    typed = q[:n]
    fm = mono(34)
    d.text((box[0] + 116, box[1] + 202), typed, font=fm, fill=TXT, anchor="lm")
    if n < len(q) and int(t * 3.0) % 2 == 0:
        cx = box[0] + 118 + tw(typed, fm)
        d.rectangle([cx, box[1] + 176, cx + 4, box[1] + 228], fill=ACC)
    # sonuçlar
    ys = box[1] + 300
    for i, r in enumerate(s["rows"]):
        p = eo((lt - 1.5 - i * 0.24) / 0.4)
        if p <= 0.01:
            continue
        ry = ys + i * 116
        hot = i == 0
        d.rectangle([box[0] + 38, ry, box[2] - 38, ry + 92],
                    fill=(24, 30, 22) if hot else PANEL2,
                    outline=ACC if hot else BORDER, width=2)
        fm2 = mono(26, True)
        d.text((box[0] + 70, ry + 46), tr(r)[:32], font=fm2,
               fill=mix(BG, TXT if hot else DIM, p), anchor="lm")
        if hot:
            d.polygon([(box[2] - 96, ry + 36), (box[2] - 78, ry + 46), (box[2] - 96, ry + 56)], fill=ACC)
    # alt bilgi
    fm3 = mono(22)
    d.text((box[0] + 38, box[3] - 48), s.get("foot", "SONUÇ 3  •  e-DEVLET  •  GÜVENLİ OTURUM"),
           font=fm3, fill=(90, 98, 70), anchor="lm")
    caption(img, t)


def sc_receipt(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "TUTAR"), 84, 150, min(1, lt * 3))
    headline(img, s["lines"], lt, top=210, size=100, hl=s.get("hl", []))
    box = [84, 640, W - 84, 1380]
    panel(img, box, t, (lt - 0.08) / 0.45, accent_bar=True,
          title=s.get("t_title", "BİRİKİM DÖKÜMÜ"), num="TL")
    y = box[1] + 170
    total = 0
    for i, (k, v) in enumerate(s["rows"]):
        p = eo((lt - 0.35 - i * 0.2) / 0.4)
        if p <= 0.01:
            continue
        total += v
        shown = int(v * eio((lt - 0.4 - i * 0.2) / 0.6))
        d.text((box[0] + 38, y), tr(k), font=F(600, 34), fill=mix(BG, TXT, p), anchor="lm")
        fm = mono(38, True)
        d.text((box[2] - 38, y), f"{shown:,} TL".replace(",", "."), font=fm,
               fill=mix(BG, ACC, p), anchor="rm")
        rule(d, box[0] + 38, box[2] - 38, y + 36, eo((lt - 0.5 - i * 0.2) / 0.5), (30, 36, 42))
        y += 92
    p = eo((lt - 0.35 - len(s["rows"]) * 0.2 - 0.1) / 0.5)
    if p > 0.01:
        d.line([box[0] + 38, y + 6, box[2] - 38, y + 6], fill=BORDER, width=2)
        d.text((box[0] + 38, y + 62), tr("TOPLAM"), font=mono(28, True), fill=DIM, anchor="lm")
        fm = mono(74, True)
        d.text((box[2] - 38, y + 66), f"{int(total * eio((lt - 1.4) / 0.7)):,} TL".replace(",", "."),
               font=fm, fill=mix(BG, ACC, p), anchor="rm")
    caption(img, t)


def sc_check(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "KONTROL"), 84, 150, min(1, lt * 3))
    headline(img, s["lines"], lt, top=210, size=100, hl=s.get("hl", []))
    top = 700
    for i, r in enumerate(s["rows"]):
        p = eo((lt - 0.3 - i * 0.32) / 0.5)
        if p <= 0.01:
            continue
        y = top + i * 148
        d.rectangle([84, y - 44, W - 84, y + 44], fill=PANEL2 if p > 0.5 else BG, outline=BORDER, width=2)
        # tik kutusu
        bs = 56
        d.rectangle([116, y - bs / 2, 116 + bs, y + bs / 2],
                    fill=ACC if p > 0.85 else BG, outline=ACC if p > 0.4 else BORDER, width=3)
        if p > 0.7:
            k2 = min(1.0, (p - 0.7) / 0.3)
            d.line([132, y + 2, 140, y + 12 * k2], fill=BG, width=7)
            d.line([140, y + 12 * k2, 158, y - 14 * k2], fill=BG, width=7)
        d.text((206, y), tr(r), font=F(700, 40), fill=mix(BG, TXT, p), anchor="lm")
        icon(d, "check" if i == 0 else "shield", W - 130, y, 40, ACC if p > 0.8 else (70, 80, 50), 4)
    caption(img, t)


def sc_warn(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "RİSK"), 84, 150, min(1, lt * 3), color=WARN)
    headline(img, s["lines"], lt, top=210, size=100, hl=s.get("hl", []), accent=WARN)
    # uyarı paneli
    box = [84, 660, W - 84, 1180]
    panel(img, box, t, (lt - 0.1) / 0.5, accent_bar=True,
          title=s.get("t_title", "ZAMAN AŞIMI"), num="RISK")
    icon(d, "warn", box[0] + 96, box[1] + 220, 96, WARN, 7)
    f = F(800, 44)
    lines = [tr(x) for x in s.get("body", [])]
    y = box[1] + 300
    for i, ln in enumerate(lines):
        p = eo((lt - 0.4 - i * 0.12) / 0.5)
        if p > 0.01:
            sz = fit(ln, lambda x: F(800, x), 44, box[2] - box[0] - 76)
            d.text((box[0] + 38, y), ln, font=F(800, sz), fill=mix(BG, TXT, p), anchor="lm")
        y += 56
    fm = mono(24)
    d.text((box[0] + 38, box[3] - 44), s.get("foot", "4632 SAYILI KANUN  •  ZAMAN AŞIMI 10 YIL"),
           font=fm, fill=(160, 120, 100), anchor="lm")
    caption(img, t)


def sc_cta(img, s, t, lt):
    d = ImageDraw.Draw(img)
    label(d, s.get("label", "SON"), 84, 150, min(1, lt * 3))
    word = tr(s.get("word", CFG["cta"]))
    sz = fit(word, lambda x: F(900, x), 210, W - 170)
    f = F(900, sz)
    p = eo((lt - 0.05) / 0.5)
    wpx = tw(word, f)
    cy = 620
    # çerçeve + limon dolgu soldan sağa
    box = [W / 2 - wpx / 2 - 44, cy - sz / 2 - 30, W / 2 + wpx / 2 + 44, cy + sz / 2 + 30]
    d.rectangle(box, outline=ACC, width=5)
    fillk = eo((lt - 0.25) / 0.55)
    if fillk > 0.01:
        d.rectangle([box[0] + 4, box[1] + 4, box[0] + 4 + (box[2] - box[0] - 8) * fillk, box[3] - 4], fill=ACC)
    if fillk > 0.55:
        d.text((W / 2, cy), word, font=f, fill=BG, anchor="mm")
    p2 = eo((lt - 0.6) / 0.5)
    if p2 > 0.01:
        f2 = F(900, 96)
        for i, line in enumerate(s.get("lines", [])):
            txt = tr(line)
            s2 = fit(txt, lambda x: F(900, x), 96, W - 150)
            d.text((W / 2, 900 + i * 116), txt, font=F(900, s2), fill=mix(BG, TXT, p2), anchor="mm")
    p3 = eo((lt - 1.0) / 0.5)
    if p3 > 0.01:
        fm = mono(26, True)
        note = tr(s.get("note", "REHBER YORUMDA GÖNDERİLİR"))
        wn = track(note, fm, 3.0)
        d.rectangle([W / 2 - wn / 2 - 26, 1150, W / 2 + wn / 2 + 26, 1216], outline=BORDER, width=2)
        xx = W / 2 - wn / 2
        for ch in note:
            d.text((xx, 1183), ch, font=fm, fill=mix(BG, ACC, p3), anchor="lm")
            xx += tw(ch, fm) + 3.0
    # alt imza çizgisi
    rule(d, 84, W - 84, 1300, eo((lt - 1.2) / 0.6), ACC)
    if p3 > 0.3:
        fm2 = mono(22)
        d.text((84, 1350), s.get("brand", "REHBER  •  ADIM ADIM"), font=fm2, fill=DIM, anchor="lm")
        d.text((W - 84, 1350), s.get("brand2", "e-DEVLET"), font=fm2, fill=DIM, anchor="rm")


RENDER = {"hook": sc_hook, "steps": sc_steps, "ui": sc_ui, "receipt": sc_receipt,
          "check": sc_check, "warn": sc_warn, "cta": sc_cta}
CTA_SCENE = next((s for s in CFG["scenes"] if s.get("type") == "cta"), {"type": "cta"})


# ------------------------------------------------------------------ altyazı
def cap_pages(maxw=4):
    pages, cur = [], []
    for w in WORDS:
        cur.append(w)
        if len(cur) >= maxw or w[0].endswith((".", "!", "?")):
            pages.append(cur)
            cur = []
    if cur:
        pages.append(cur)
    return pages


PAGES = cap_pages()


def _wrap(words, f, max_w):
    lines, cur = [], []
    for w in words:
        if cur and tw(" ".join(cur + [w]), f) > max_w:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def caption(img, t):
    if t > CONTENT_END + 0.15:
        return
    page = None
    for pg in PAGES:
        if pg[0][1] - 0.12 <= t < pg[-1][2] + 0.1:
            page = pg
            break
    if page is None:
        return
    active = 0
    for i, w in enumerate(page):
        if t >= w[1] - 0.02:
            active = i
    words = [w[0] for w in page]
    size = 46
    while size > 26:
        f = F(700, size)
        if all(tw(" ".join(l), f) <= 840 for l in _wrap(words, f, 840)):
            break
        size -= 2
    f = F(700, size)
    lines = _wrap(words, f, 840)
    d = ImageDraw.Draw(img)
    # editoryal altyazı: çerçevesiz, sol hizalı, limon vurgu bloğu
    lh = size * 1.4
    top = 1560 - lh * len(lines) / 2
    d.rectangle([60, top - 22, 64, top + lh * len(lines) + 6], fill=ACC)
    idx = 0
    for li, line in enumerate(lines):
        x = 90
        y = top + li * lh + lh / 2
        for w in line:
            ww = tw(w + " ", f)
            if idx == active:
                d.rectangle([x - 7, y - size * 0.78, x + ww - 4, y + size * 0.62], fill=ACC)
                d.text((x, y), w, font=f, fill=BG, anchor="lm")
            else:
                d.text((x, y), w, font=f, fill=(214, 216, 210), anchor="lm")
            x += ww
            idx += 1


# ------------------------------------------------------------------ ses
def mix_audio(path):
    def read(p):
        with wave.open(p) as w:
            d = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
            if w.getnchannels() == 2:
                d = d.reshape(-1, 2).mean(1)
            return d

    n = int(TOTAL * SR)
    out = np.zeros(n, np.float32)

    def add(p, at, gain):
        x = read(p) * gain
        s = int(max(0, at) * SR)
        e = min(n, s + len(x))
        if e > s:
            out[s:e] += x[: e - s]

    add(A("assets/vo_ed.wav"), VO_START, 1.0)
    add(A("assets/bed.wav"), 0.0, 0.12)
    for a, b, s in SCENES[1:]:
        add(A("assets/sfx_whoosh.wav"), max(0.0, a - 0.32), 0.22)
        add(A("assets/sfx_pop.wav"), a, 0.18)
    add(A("assets/sfx_boom.wav"), 0.02, 0.30)
    add(A("assets/sfx_whoosh.wav"), CONTENT_END - 0.3, 0.26)
    add(A("assets/sfx_boom.wav"), CONTENT_END + 0.02, 0.24)
    peak = np.max(np.abs(out)) + 1e-9
    if peak > 0.98:
        out *= 0.98 / peak
    pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ çerçeve (chrome)
def chrome(img, t, idx, total):
    d = ImageDraw.Draw(img)
    p = min(1.0, t / TOTAL)
    d.rectangle([0, 0, W, 6], fill=(24, 28, 32))
    d.rectangle([0, 0, int(W * p), 6], fill=ACC)
    fm = mono(20, True)
    d.text((84, 66), tr(CFG.get("brand", "DOSYA")), font=fm, fill=DIM, anchor="lm")
    d.text((W - 84, 66), f"{idx:02d} / {total:02d}", font=fm, fill=DIM, anchor="rm")
    if t > CONTENT_END:
        d.text((84, H - 60), tr(CFG.get("handle", "ADIM ADIM REHBER")), font=mono(22), fill=(70, 78, 84), anchor="lm")


# ------------------------------------------------------------------ main
def main():
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(A("videos"), exist_ok=True)
    wav = A("videos", "mix_ed.wav")
    mix_audio(wav)
    mp4 = A("videos", f"{OUT_NAME}.mp4")
    print(f"vo={VO_DUR:.2f}s total={TOTAL:.2f}s frames={N} scenes={len(SCENES)}")
    cmd = [ff, "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-level", "4.1", "-g", "60", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    bg = bg_img()
    n_scene = len(SCENES)
    for i in range(N):
        t = i / FPS
        img = bg.copy()
        if t >= CONTENT_END:
            sc_cta(img, CTA_SCENE, t, t - CONTENT_END)
            chrome(img, t, n_scene, n_scene)
            proc.stdin.write(img.tobytes())
            continue
        a, b, s = scene_at(t)
        RENDER.get(s["type"], sc_hook)(img, s, t, t - a)
        chrome(img, t, SCENES.index((a, b, s)) + 1, n_scene)
        # sahne geçişinde 0.12s karartma
        rem = b - t
        if rem < 0.10:
            k = 1 - rem / 0.10
            img = Image.blend(img, Image.new("RGB", (W, H), BG), 0.55 * k)
        if i % 90 == 0:
            print("frame", i, f"{t:.1f}s", flush=True)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    print("encoded ->", mp4, os.path.getsize(mp4))


if __name__ == "__main__":
    main()
