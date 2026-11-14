"""Kinetik tipografi + vektör illüstrasyon motoru (tamamen kodla üretim).

Hiç fotoğraf / AI görsel kullanmaz: kağıt zemin, nokta ızgara, sticker çipler,
sahte uygulama kartları, makbuz, kontrol listesi ve maskot robot — hepsi PIL ile çizilir.

Kullanım:  VIDEO_CFG=cfg_para_k.json python3 scripts/render_kinetic.py
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

# ------------------------------------------------------------------ palet
PAPER = (250, 247, 240)
INK = (17, 17, 17)
RED = (232, 74, 38)
RED_D = (196, 52, 22)
GREEN = (17, 154, 74)
BLUE = (28, 58, 168)
GREY = (150, 145, 132)
LINE = (28, 28, 28)
WHITE = (255, 255, 255)
CREAM = (255, 252, 244)

F = lambda w, s: ImageFont.truetype(A("assets/fonts", f"Montserrat-{w}.ttf"), max(8, int(s)))


def tr(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


# ------------------------------------------------------------------ zaman
def build_vo():
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    dst = A("assets/vo_k.wav")
    af = ("aresample=44100,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "atempo=1.15,areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "areverse,dynaudnorm=f=250:g=5:p=0.92,highpass=f=95")
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", A(VO_SRC),
                    "-af", af, "-ac", "1", "-ar", "44100", dst], check=True)
    return dst


build_vo()

with wave.open(A("assets/vo_k.wav")) as _w:
    VO_DUR = _w.getnframes() / _w.getframerate()

VO_START = 0.12
CONTENT_END = VO_START + VO_DUR
CTA_LEN = 3.4
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

# ------------------------------------------------------------------ sahne planı
CTA_SCENE = next((s for s in CFG["scenes"] if s.get("type") == "cta"), {"type": "cta"})


def plan_scenes():
    scenes = [s for s in CFG["scenes"] if s.get("type") != "cta" and not s.get("cta")]
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


SCENES = plan_scenes()


def scene_at(t):
    for a, b, s in SCENES:
        if a <= t < b:
            return a, b, s
    return SCENES[-1]


# ------------------------------------------------------------------ çizim yardımcıları
def ease(p):
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p)


def ease_out(p):
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3


_BG = None


def paper_bg():
    """Krem kağıt + ince nokta ızgara + hafif kenar gölgesi (bir kez üretilir)."""
    global _BG
    if _BG is not None:
        return _BG
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    step = 34
    for y in range(step, H, step):
        for x in range(step, W, step):
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(226, 221, 209))
    # yumuşak vinyet (kağıt hissi)
    g = Image.new("L", (W // 8, H // 8), 0)
    gd = ImageDraw.Draw(g)
    gd.ellipse([-W // 24, -H // 24, W // 8 + W // 24, H // 8 + H // 24], fill=26)
    g = g.filter(ImageFilter.GaussianBlur(26)).resize((W, H), Image.BICUBIC).point(lambda v: v // 2)
    img = Image.composite(Image.new("RGB", (W, H), (238, 232, 219)), img, g)
    _BG = img
    return img


def shadow(d, box, radius, off=(8, 10), alpha=255):
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + off[0], y0 + off[1], x1 + off[0], y1 + off[1]],
                        radius=radius, fill=(24, 20, 14))


def sticker(img, box, radius=26, fill=WHITE, outline=INK, ow=5, off=(8, 9)):
    """Keskin kenarlı sticker: düz gölge + beyaz gövde + kalın kontur."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + off[0], y0 + off[1], x1 + off[0], y1 + off[1]],
                        radius=radius, fill=(28, 24, 18))
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=ow)
    return d


def fit(text, weight, size, max_w):
    while size > 16 and F(weight, size).getlength(text) > max_w:
        size -= 2
    return size


def text_w(t, f):
    return f.getlength(t)


def draw_words(img, words, weight, size, cx, top, line_h, colors, max_w, alpha=1.0,
               stroke=0, stroke_fill=INK):
    """Kelime kelime renklendirilebilen, satır satır çizim (kelime animasyonları için)."""
    d = ImageDraw.Draw(img)
    f = F(weight, size)
    lines, cur = [], []
    for w, *meta in words:
        trial = " ".join([x[0] for x in cur] + [w])
        if text_w(trial, f) > max_w and cur:
            lines.append(cur)
            cur = []
        cur.append([w, *meta])
    if cur:
        lines.append(cur)
    y = top
    for line in lines:
        total = text_w(" ".join(x[0] for x in line), f)
        x = cx - total / 2
        for item in line:
            w, col = item[0], item[-1]
            d.text((x, y), w, font=f, fill=col if alpha >= 1 else tuple(
                int(c * alpha + 250 * (1 - alpha)) for c in col),
                stroke_width=stroke, stroke_fill=stroke_fill)
            x += text_w(w + " ", f)
        y += line_h
    return y


def headline(img, lines, hl_idx, t, y0=300, size=132, max_w=900, cx=W // 2,
             color_hl=RED, pop_start=0.0):
    """Büyük punto, satır satır yukarı kayarak giren, vurgulu kelimeler kırmızı."""
    d = ImageDraw.Draw(img)
    y = y0
    for i, line in enumerate(lines):
        p = ease_out((t - pop_start - i * 0.09) / 0.42)
        if p <= 0.01:
            y += size * 1.05
            continue
        sz = fit(tr(line), 900, size, max_w)
        f = F(900, sz)
        dx = (1 - p) * 46
        col = color_hl if i in hl_idx else INK
        # gölge katmanı (sticker hissi)
        for oy, al in ((9, (214, 208, 195)),):
            d.text((cx + 5, y + oy), tr(line), font=f, fill=al, anchor="ma")
        d.text((cx + dx, y), tr(line), font=f, fill=col, anchor="ma")
        y += sz * 1.02
    return y


def kicker(img, text, t, x=88, y=112, fill=INK, fg=WHITE):
    d = ImageDraw.Draw(img)
    f = F(800, 34)
    txt = tr(text)
    w = text_w(txt, f) + 62
    p = ease_out(t / 0.45)
    box = [x, y - (1 - p) * 30, x + w, y + 74 - (1 - p) * 30]
    d.rounded_rectangle([box[0] + 6, box[1] + 7, box[2] + 6, box[3] + 7], radius=20, fill=(226, 220, 206))
    d.rounded_rectangle(box, radius=20, fill=fill)
    d.text(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2 - 2), txt, font=f, fill=fg, anchor="mm")


# ------------------------------------------------------------------ vektör kartlar
def card_shell(img, box, title=None, accent=RED):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + 10, y0 + 12, x1 + 10, y1 + 12], radius=34, fill=(232, 226, 212))
    d.rounded_rectangle(box, radius=34, fill=CREAM, outline=INK, width=5)
    if title:
        f = F(800, 34)
        d.text((x0 + 40, y0 + 40), tr(title), font=f, fill=GREY, anchor="lm")
        d.line([x0 + 40, y0 + 76, x1 - 40, y0 + 76], fill=(226, 220, 206), width=3)
    return d


def card_search(img, box, q, rows, t, t0):
    d = card_shell(img, box, None)
    x0, y0, x1, y1 = box
    # arama alanı
    d.rounded_rectangle([x0 + 40, y0 + 44, x1 - 40, y0 + 148], radius=52, fill=WHITE,
                        outline=INK, width=4)
    d.ellipse([x0 + 76, y0 + 82, x0 + 108, y0 + 114], outline=INK, width=5)
    d.line([x0 + 104, y0 + 110, x0 + 120, y0 + 126], fill=INK, width=5)
    # yazılan metin
    n = int(max(0, min(1.0, (t - t0 - 0.25) / 0.9)) * len(q))
    typed = q[:n]
    f = F(700, 46)
    d.text((x0 + 146, y0 + 96), typed, font=f, fill=INK, anchor="lm")
    if n < len(q) and (int(t * 3) % 2 == 0):
        cx = x0 + 146 + text_w(typed, f)
        d.line([cx + 3, y0 + 66, cx + 3, y0 + 126], fill=RED, width=5)
    # sonuç satırları
    ys = y0 + 196
    for i, r in enumerate(rows):
        p = ease_out((t - t0 - 1.05 - i * 0.22) / 0.4)
        if p <= 0:
            continue
        ry = ys + i * 116 - (1 - p) * 22
        hot = i == 0
        d.rounded_rectangle([x0 + 40, ry, x1 - 40, ry + 96], radius=22,
                            fill=(255, 240, 232) if hot else WHITE,
                            outline=RED if hot else (222, 216, 202), width=4 if hot else 3)
        d.text((x0 + 74, ry + 48), tr(r)[:34], font=F(800, 34), fill=INK if hot else (60, 58, 52),
               anchor="lm")
        if hot:  # dokunma parmağı ikonu
            d.text((x1 - 92, ry + 48), "›", font=F(900, 62), fill=RED, anchor="rm")


def card_receipt(img, box, rows, total, t, t0):
    d = card_shell(img, box, None)
    x0, y0, x1, y1 = box
    # makbuz başlığı
    d.rounded_rectangle([x0 + 40, y0 + 36, x1 - 40, y0 + 104], radius=16, fill=INK)
    d.text(((x0 + x1) / 2, y0 + 70), tr("TAKASBANK • BİRİKİM"), font=F(800, 32),
           fill=WHITE, anchor="mm")
    y = y0 + 140
    for i, (k, v) in enumerate(rows):
        p = ease_out((t - t0 - 0.3 - i * 0.16) / 0.35)
        if p <= 0:
            continue
        al = p
        d.text((x0 + 48, y), tr(k), font=F(700, 40), fill=tuple(int(c * al) + int(250 * (1 - al)) for c in (70, 68, 62)), anchor="lm")
        d.text((x1 - 48, y), tr(v), font=F(800, 44), fill=tuple(int(c * al) + int(250 * (1 - al)) for c in INK), anchor="rm")
        y += 76
    # toplam
    p = ease_out((t - t0 - 0.3 - len(rows) * 0.16 - 0.1) / 0.4)
    if p > 0:
        y += 8
        d.line([x0 + 44, y, x1 - 44, y], fill=INK, width=4)
        d.text((x0 + 48, y + 62), tr("TOPLAM"), font=F(900, 46), fill=INK, anchor="lm")
        d.text((x1 - 48, y + 62), tr(total), font=F(900, 62), fill=GREEN, anchor="rm")


def card_checklist(img, box, rows, t, t0):
    d = card_shell(img, box, None)
    x0, y0, x1, y1 = box
    y = y0 + 70
    for i, r in enumerate(rows):
        p = ease_out((t - t0 - 0.25 - i * 0.30) / 0.42)
        if p <= 0:
            continue
        cy = y + i * 128
        # kutu
        s = 54 * p
        d.rounded_rectangle([x0 + 48, cy - s / 2, x0 + 48 + s, cy + s / 2], radius=14,
                            fill=GREEN if p > 0.9 else WHITE, outline=INK, width=4)
        if p > 0.55:  # tik
            d.line([x0 + 60, cy - 2, x0 + 74, cy + 16], fill=WHITE, width=8)
            d.line([x0 + 74, cy + 16, x0 + 96, cy - 20], fill=WHITE, width=8)
        al = min(1.0, p * 1.4)
        d.text((x0 + 128, cy), tr(r)[:28], font=F(800, 40),
               fill=tuple(int(c * al) + int(250 * (1 - al)) for c in INK), anchor="lm")


def card_stat(img, box, big, small, t, t0):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + 10, y0 + 12, x1 + 10, y1 + 12], radius=34, fill=(232, 226, 212))
    d.rounded_rectangle(box, radius=34, fill=INK, outline=INK, width=5)
    words = tr(big).split()
    max_w = (x1 - x0) - 100
    size = 120
    while size > 54 and len(_wrap_cap(words, F(900, size), max_w)) > 2:
        size -= 6
    # büyük blok üstte, alt yazı için 110px pay bırak
    while size > 48 and len(_wrap_cap(words, F(900, size), max_w)) * size * 1.1 > (y1 - y0 - 190):
        size -= 4
    f = F(900, size)
    lines = _wrap_cap(words, f, max_w)
    block_h = len(lines) * size * 1.06
    top = y0 + 34 + ((y1 - y0 - 170) - block_h) / 2
    for i, line in enumerate(lines):
        d.text(((x0 + x1) / 2, top + i * size * 1.06), " ".join(line), font=f,
               fill=WHITE, anchor="ma")
    ss = 32
    f2 = F(700, ss)
    for _ in range(3):
        sl = _wrap_cap(tr(small).split(), f2, max_w)
        while ss > 20 and len(sl) > 2:
            ss -= 2
            f2 = F(700, ss)
            sl = _wrap_cap(tr(small).split(), f2, max_w)
        if len(sl) <= 2:
            break
    for i, line in enumerate(sl[:2]):
        d.text(((x0 + x1) / 2, y1 - 96 + i * ss * 1.2), " ".join(line), font=f2,
               fill=(255, 190, 170), anchor="ma")


# ------------------------------------------------------------------ illüstrasyon: para yığını
def draw_money_stack(img, cx, cy, t, s=1.0):
    """Düz vektör: banknot + madeni para yığını + parıltılar (kodla çizilir)."""
    d = ImageDraw.Draw(img)
    bob = math.sin(t * 1.8) * 10 * s
    cy = cy + bob
    # gölge
    d.ellipse([cx - 230 * s, cy + 218 * s, cx + 230 * s, cy + 262 * s], fill=(230, 224, 210))
    # arka banknot
    d.rounded_rectangle([cx - 210 * s, cy - 190 * s, cx + 210 * s, cy + 40 * s], radius=int(22 * s),
                        fill=CREAM, outline=INK, width=int(6 * s))
    d.rounded_rectangle([cx - 186 * s, cy - 166 * s, cx + 186 * s, cy + 16 * s], radius=int(14 * s),
                        fill=(255, 236, 226), outline=RED, width=int(4 * s))
    d.text((cx, cy - 74 * s), "TAKASBANK", font=F(900, int(58 * s)), fill=RED_D, anchor="mm")
    d.text((cx, cy - 18 * s), "İADE TUTARI", font=F(800, int(30 * s)), fill=(170, 90, 70), anchor="mm")
    # madeni para yığını
    for i, (dx, dy, r, label) in enumerate([(-140, 120, 82, "TL"), (10, 96, 92, "TL"), (150, 130, 74, "TL")]):
        px, py = cx + dx * s, cy + dy * s
        h = int(26 * s)
        d.ellipse([px - r * s, py - r * s * 0.55 + h, px + r * s, py + r * s * 0.55 + h],
                  fill=RED_D, outline=INK, width=int(6 * s))
        d.ellipse([px - r * s, py - r * s * 0.55, px + r * s, py + r * s * 0.55],
                  fill=(240, 196, 60), outline=INK, width=int(6 * s))
        d.ellipse([px - r * s * 0.62, py - r * s * 0.34, px + r * s * 0.62, py + r * s * 0.34],
                  outline=(190, 150, 40), width=int(4 * s))
        d.text((px, py), label, font=F(900, int(r * 0.62 * s)), fill=(120, 90, 20), anchor="mm")
    # parıltılar
    for i, (dx, dy, ph) in enumerate([(-250, -210, 0.0), (250, -150, 1.1), (230, 60, 2.2), (-230, 30, 0.6)]):
        k = 0.6 + 0.4 * math.sin(t * 4 + ph)
        px, py = cx + dx * s, cy + dy * s
        L = 26 * s * k
        d.line([px - L, py, px + L, py], fill=RED, width=int(7 * s))
        d.line([px, py - L, px, py + L], fill=RED, width=int(7 * s))

# ------------------------------------------------------------------ maskot
def robot(img, cx, cy, s, t, wave=True):
    d = ImageDraw.Draw(img)
    # gölge
    d.ellipse([cx - 96 * s, cy + 118 * s, cx + 96 * s, cy + 150 * s], fill=(228, 222, 208))
    # anten
    bob = math.sin(t * 3.1) * 5 * s
    d.line([cx, cy - 78 * s, cx, cy - 122 * s + bob], fill=INK, width=int(7 * s))
    d.ellipse([cx - 15 * s, cy - 140 * s + bob, cx + 15 * s, cy - 110 * s + bob],
              fill=RED, outline=INK, width=int(4 * s))
    # gövde
    d.rounded_rectangle([cx - 86 * s, cy - 82 * s, cx + 86 * s, cy + 112 * s], radius=int(40 * s),
                        fill=RED, outline=INK, width=int(6 * s))
    # ekran yüz
    d.rounded_rectangle([cx - 62 * s, cy - 56 * s, cx + 62 * s, cy + 62 * s], radius=int(26 * s),
                        fill=INK, outline=INK, width=int(4 * s))
    # gözler (ara sıra kırp)
    blink = (t % 4.2) < 0.13
    ey = cy - 8 * s
    if blink:
        for dx in (-30, 30):
            d.line([cx + (dx - 13) * s, ey, cx + (dx + 13) * s, ey], fill=WHITE, width=int(9 * s))
    else:
        for dx in (-30, 30):
            d.ellipse([cx + (dx - 15) * s, ey - 17 * s, cx + (dx + 15) * s, ey + 13 * s], fill=WHITE)
            d.ellipse([cx + (dx - 2) * s, ey - 8 * s, cx + (dx + 12) * s, ey + 6 * s], fill=INK)
    # gülümseme
    d.arc([cx - 26 * s, cy + 12 * s, cx + 26 * s, cy + 52 * s], 20, 160, fill=WHITE, width=int(6 * s))
    # kollar
    sway = math.sin(t * 2.4) * 10 * s if wave else 0
    d.ellipse([cx - 122 * s, cy + 6 * s - sway, cx - 92 * s, cy + 36 * s - sway],
              fill=RED, outline=INK, width=int(5 * s))
    d.ellipse([cx + 92 * s, cy + 6 * s + sway, cx + 122 * s, cy + 36 * s + sway],
              fill=RED, outline=INK, width=int(5 * s))
    # ayaklar
    for dx in (-46, 46):
        d.ellipse([cx + (dx - 26) * s, cy + 104 * s, cx + (dx + 26) * s, cy + 140 * s],
                  fill=RED, outline=INK, width=int(5 * s))


# ------------------------------------------------------------------ altyazı (sticker)
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
CAP_CY = 1470


def _wrap_cap(words, f, max_w):
    lines, cur = [], []
    for w in words:
        if cur and text_w(" ".join(cur + [w]), f) > max_w:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def captions(img, t):
    if t > CONTENT_END + 0.1:
        return
    page = None
    for pg in PAGES:
        if pg[0][1] - 0.1 <= t < pg[-1][2] + 0.08:
            page = pg
            break
    if page is None:
        return
    active = 0
    for i, w in enumerate(page):
        if t >= w[1] - 0.02:
            active = i
    words = [w[0] for w in page]
    size = 56
    while size > 32:
        f = F(900, size)
        if all(text_w(" ".join(l), f) <= 800 for l in _wrap_cap(words, f, 800)):
            break
        size -= 2
    f = F(900, size)
    lines = _wrap_cap(words, f, 800)
    line_h = size * 1.22
    block_h = line_h * len(lines)
    d = ImageDraw.Draw(img)
    top = CAP_CY - block_h / 2
    widest = max(text_w(" ".join(l), f) for l in lines)
    pad_x, pad_y = 40, 26
    box = [W / 2 - widest / 2 - pad_x, top - pad_y, W / 2 + widest / 2 + pad_x, top + block_h + pad_y]
    d.rounded_rectangle([box[0] + 7, box[1] + 9, box[2] + 7, box[3] + 9], radius=22, fill=(30, 26, 20))
    d.rounded_rectangle(box, radius=22, fill=WHITE, outline=INK, width=5)
    idx = 0
    for li, line in enumerate(lines):
        total = text_w(" ".join(line), f)
        x = W / 2 - total / 2
        y = top + li * line_h + line_h / 2
        for wi, w in enumerate(line):
            ww = text_w(w, f)
            if idx == active:
                d.rounded_rectangle([x - 9, y - size / 2 - 6, x + ww + 9, y + size / 2 + 6],
                                    radius=11, fill=RED)
                d.text((x, y), w, font=f, fill=WHITE, anchor="lm")
            else:
                d.text((x, y), w, font=f, fill=INK, anchor="lm")
            x += text_w(w + " ", f)
            idx += 1


# ------------------------------------------------------------------ sahne çizimleri
def draw_hook(img, s, t, lt):
    kicker(img, s.get("kicker", "E-DEVLET REHBERİ"), lt, fill=INK)
    y = headline(img, s["lines"], s.get("hl", [1]), lt, y0=330, size=150, pop_start=0.05)
    if s.get("sub"):
        p = ease_out((lt - 0.55) / 0.4)
        if p > 0:
            f = F(700, 42)
            txt = tr(s["sub"])
            d = ImageDraw.Draw(img)
            w = text_w(txt, f)
            d.rounded_rectangle([W / 2 - w / 2 - 30, y + 40, W / 2 + w / 2 + 30, y + 128],
                                radius=14, fill=(255, 236, 226), outline=RED, width=4)
            d.text((W / 2, y + 84), txt, font=f, fill=RED_D, anchor="mm")
    if s.get("art", True):
        draw_money_stack(img, W / 2, 1130, t, 1.0)
    robot(img, 920, 1660, 0.56, t)


def draw_ui(img, s, t, lt):
    kicker(img, s.get("kicker", CFG.get("kicker", "")), lt)
    headline(img, s["lines"], s.get("hl", [len(s["lines"]) - 1]), lt, y0=250, size=112, pop_start=0)
    card = s["card"]
    box = [88, 700, W - 88, 1300]
    card_search(img, box, card.get("query", ""), card.get("rows", []), lt, 0.15)
    captions(img, t)
    robot(img, 930, 1660, 0.52, t)


def draw_receipt(img, s, t, lt):
    kicker(img, s.get("kicker", CFG.get("kicker", "")), lt)
    headline(img, s["lines"], s.get("hl", [len(s["lines"]) - 1]), lt, y0=250, size=112, pop_start=0)
    card = s["card"]
    card_receipt(img, [88, 690, W - 88, 1320], card.get("rows", []), card.get("total", ""), lt, 0.1)
    captions(img, t)
    robot(img, 930, 1660, 0.52, t)


def draw_check(img, s, t, lt):
    kicker(img, s.get("kicker", CFG.get("kicker", "")), lt)
    headline(img, s["lines"], s.get("hl", [len(s["lines"]) - 1]), lt, y0=250, size=112, pop_start=0)
    card = s["card"]
    card_checklist(img, [88, 690, W - 88, 1300], card.get("rows", []), lt, 0.15)
    captions(img, t)
    robot(img, 930, 1660, 0.52, t)


def draw_stat(img, s, t, lt):
    kicker(img, s.get("kicker", CFG.get("kicker", "")), lt)
    headline(img, s["lines"], s.get("hl", [len(s["lines"]) - 1]), lt, y0=250, size=112, pop_start=0)
    card = s["card"]
    card_stat(img, [88, 640, W - 88, 1010], card.get("big", ""), card.get("small", ""), lt, 0.05)
    if s.get("art", True):
        draw_money_stack(img, W / 2, 1235, t, 0.62)
    captions(img, t)
    robot(img, 930, 1660, 0.52, t)


def draw_cta(img, s, t, lt):
    if lt < 0.03:
        return
    word = tr(s.get("word", CFG["cta"]))
    # dev sticker çip
    size = fit(word, 900, 210, 760)
    f = F(900, size)
    d = ImageDraw.Draw(img)
    tw = text_w(word, f)
    p = ease_out((lt - 0.05) / 0.45)
    cy = 700
    box = [W / 2 - (tw / 2 + 66) * (0.8 + 0.2 * p), cy - 110 * p, W / 2 + (tw / 2 + 66) * (0.8 + 0.2 * p), cy + 110 * p]
    d.rounded_rectangle([box[0] + 12, box[1] + 14, box[2] + 12, box[3] + 14], radius=30, fill=(28, 24, 18))
    d.rounded_rectangle(box, radius=30, fill=RED, outline=INK, width=6)
    if p > 0.5:
        d.text((W / 2, cy), word, font=f, fill=WHITE, anchor="mm")
    # yönerge
    p2 = ease_out((lt - 0.35) / 0.45)
    if p2 > 0:
        lines = [tr(x) for x in s.get("lines", [])]
        fs = 104
        while fs > 46 and any(text_w(x, F(900, fs)) > 930 for x in lines):
            fs -= 4
        f2 = F(900, fs)
        for i, txt in enumerate(lines):
            d.text((W / 2, 960 + i * (fs * 1.18) + (1 - p2) * 40), txt, font=f2, fill=INK, anchor="mm")
    p3 = ease_out((lt - 0.7) / 0.4)
    if p3 > 0:
        f3 = F(700, 38)
        note = tr(s.get("note", "REHBERİ YORUMUNA GÖNDERİYORUZ"))
        w = text_w(note, f3)
        d.rounded_rectangle([W / 2 - w / 2 - 26, 1220 - 40, W / 2 + w / 2 + 26, 1220 + 40],
                            radius=12, fill=(255, 236, 226), outline=RED, width=4)
        d.text((W / 2, 1220), note, font=f3, fill=RED_D, anchor="mm")
    robot(img, W / 2, 1530, 1.15, t)


RENDER = {"hook": draw_hook, "ui": draw_ui, "receipt": draw_receipt,
          "check": draw_check, "stat": draw_stat, "cta": draw_cta}


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
        s = int(at * SR)
        e = min(n, s + len(x))
        if e > s:
            out[s:e] += read(p)[: e - s] * gain

    add(A("assets/vo_k.wav"), VO_START, 1.0)
    add(A("assets/bed.wav"), 0.0, 0.16)
    for a, b, s in SCENES:
        if a > 0.01:
            add(A("assets/sfx_whoosh.wav"), max(0.0, a - 0.3), 0.30)
            add(A("assets/sfx_pop.wav"), a, 0.30)
    add(A("assets/sfx_boom.wav"), 0.02, 0.45)
    add(A("assets/sfx_whoosh.wav"), CONTENT_END - 0.28, 0.35)
    add(A("assets/sfx_boom.wav"), CONTENT_END + 0.02, 0.32)
    peak = np.max(np.abs(out)) + 1e-9
    if peak > 0.98:
        out *= 0.98 / peak
    pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ main
def main():
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(A("videos"), exist_ok=True)
    wav = A("videos", "mix_k.wav")
    mix_audio(wav)
    mp4 = A("videos", f"{OUT_NAME}.mp4")
    print(f"vo={VO_DUR:.2f}s total={TOTAL:.2f}s frames={N} scenes={len(SCENES)}")
    cmd = [ff, "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-level", "4.1", "-g", "60", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    bg = paper_bg()
    for i in range(N):
        t = i / FPS
        img = bg.copy()
        if t >= CONTENT_END:
            draw_cta(img, CTA_SCENE, t, t - CONTENT_END)
            proc.stdin.write(img.tobytes())
            if i % 90 == 0:
                print("frame", i, f"{t:.1f}s", flush=True)
            continue
        a, b, s = scene_at(t)
        lt = t - a
        p = (t - a) / max(1e-6, b - a)
        # sahne giriş/çıkış: kısa yukarı kayma + beyaz parlama
        fn = RENDER.get(s["type"], draw_hook)
        fn(img, s, t, lt)
        if p > 0.93:  # çıkışta hafif yukarı kayma
            k = (p - 0.93) / 0.07
            dy = int(-26 * ease(k))
            img = Image.new("RGB", (W, H), PAPER)
            img.paste(bg.crop((0, -dy, W, H - dy)), (0, dy))
            fn(img, s, t, lt)
        proc.stdin.write(img.tobytes())
        if i % 90 == 0:
            print("frame", i, f"{t:.1f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("encoded ->", mp4, os.path.getsize(mp4))


if __name__ == "__main__":
    main()
