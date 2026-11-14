"""Renders the 9:16 (1080x1920) vertical short for one spreadsheet row.

Usage:  python3 scripts/render.py  ->  out/4_AIDAT.mp4
"""
import os, subprocess, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)

W, H, FPS = 1080, 1920, 30
SR = 44100

# ---------------------------------------------------------------- config
import json
CFG = json.load(open(A(os.environ.get("CFG_DIR", "videos"), os.environ.get("VIDEO_CFG", "cfg.json")), encoding="utf-8"))
HOOK_TITLE = CFG["ekran_yazisi"]
CTA_WORD = CFG["cta"]
VO_TEXT = CFG["tts"]
KICKER = CFG.get("kicker", "ADIM ADIM REHBER")
TOP_LABEL = CFG.get("top_label", CFG.get("kategori", "Adım Adım Rehber").upper() if False else "ADIM ADIM REHBER")
SHOT_FILES = CFG["images"]
SHOT_BLUR = CFG.get("blur", {})
VO_SRC = CFG.get("vo_src", "assets/vo.wav")
OUT_NAME = CFG["out"]

YELLOW = (255, 214, 10)
WHITE = (255, 255, 255)
DARK = (10, 12, 16)

F = lambda w, s: ImageFont.truetype(A("assets/fonts", f"Montserrat-{w}.ttf"), s)


def tr_upper(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


# ---------------------------------------------------------------- VO build
def build_vo():
    """Normalise the TTS take: 1.15x speed, trimmed edges, energetic and even."""
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    dst = A("assets/vo.wav")
    af = ("aresample=44100,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "atempo=1.15,"
          "areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "areverse,"
          "dynaudnorm=f=250:g=5:p=0.92,"
          "highpass=f=95")
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", A(VO_SRC),
                    "-af", af, "-ac", "1", "-ar", "44100", dst], check=True)
    return dst


# ---------------------------------------------------------------- VO timing
build_vo()  # module level: the timeline constants below depend on it


def vo_duration():
    import wave
    w = wave.open(A("assets/vo.wav"))
    return w.getnframes() / w.getframerate()


VO_DUR = vo_duration()
CONTENT_END = 0.15 + VO_DUR          # caption/voice window
CTA_START = CONTENT_END
TOTAL = CTA_START + 3.2
N = int(round(TOTAL * FPS))
print(f"vo={VO_DUR:.2f}s  cta_start={CTA_START:.2f}s  total={TOTAL:.2f}s  frames={N}")


# ---------------------------------------------------------------- word timing
def build_words():
    words = VO_TEXT.replace("AİDAT", CTA_WORD).split()
    weights = []
    for w in words:
        wgt = len(w) + 1.5
        if w.endswith((",", ";", ":")):
            wgt += 2.0
        if w.endswith((".", "!", "?")):
            wgt += 3.5
        weights.append(wgt)
    weights = np.array(weights, float)
    span = VO_DUR - 0.05
    dur = weights / weights.sum() * span
    t = 0.15
    out = []
    for w, d in zip(words, dur):
        out.append([w, t, t + d])
        t += d
    return out


WORDS = build_words()
CAP_START = 2.55  # captions start once the hook title has cleared


def caption_pages(max_words=4):
    """Group words into caption pages, breaking on punctuation."""
    pages, cur = [], []
    for w in WORDS:
        cur.append(w)
        hard = w[0].endswith((".", "!", "?"))
        if len(cur) >= max_words or (hard and len(cur) >= 2) or w[0].endswith(","):
            pages.append(cur)
            cur = []
    if cur:
        pages.append(cur)
    return pages


PAGES = caption_pages()


# ---------------------------------------------------------------- visuals
def cover(img, w, h):
    iw, ih = img.size
    s = max(w / iw, h / ih)
    return img.resize((int(iw * s + 1), int(ih * s + 1)), Image.LANCZOS)


SHOTS = []  # (start, end, image, zoom_from, zoom_to, pan)
CUTS = []   # shot boundary times (seconds)

def load_shots():
    """Cuts every ~3.4s through the narration; images cycle with varied framing."""
    imgs = []
    for f in SHOT_FILES:
        img_path = A(CFG.get("broll_dir", "assets/v2/broll"), f + ".png")
        im = cover(Image.open(img_path).convert("RGB"), int(W * 1.5), int(H * 1.5))
        if f in SHOT_BLUR:  # hide any readable / AI-garbled text in the plate
            im = im.filter(ImageFilter.GaussianBlur(SHOT_BLUR[f]))
        imgs.append(im)
    step = float(CFG.get("cut_every", 3.4))
    CUTS.clear()
    t = 0.0
    while t < CTA_START - 1.0:
        CUTS.append(round(t, 2))
        t += step
    bounds = CUTS + [TOTAL + 1]
    pans = [(0, 0), (0.5, -0.3), (-0.4, 0.3), (0.3, 0.2), (-0.3, -0.25), (0.45, 0.3)]
    for i in range(len(CUTS)):
        im = imgs[i % len(imgs)]
        z0 = 1.02 if i % 2 == 0 else 1.10   # alternate framing so repeats read as new shots
        SHOTS.append((bounds[i], bounds[i + 1], im, z0, z0 + 0.13, pans[i % len(pans)]))


def shot_at(t):
    for s in SHOTS:
        if s[0] <= t < s[1]:
            return s
    return SHOTS[-1]


def crop_frame(t):
    s = shot_at(t)
    x0, x1, im, z0, z1, pan = s
    p = (t - x0) / max(1e-6, (x1 - x0))
    p = min(1.0, max(0.0, p))
    z = z0 + (z1 - z0) * p
    # ease-in-out for a softer push
    z = z0 + (z1 - z0) * (p * p * (3 - 2 * p))
    iw, ih = im.size
    cw, ch = iw / z, ih / z
    cx = iw / 2 + pan[0] * (iw / 60.0) * p
    cy = ih / 2 + pan[1] * (ih / 60.0) * p
    cx = min(max(cx, cw / 2), iw - cw / 2)
    cy = min(max(cy, ch / 2), ih - ch / 2)
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    return im.crop(tuple(int(v) for v in box)).resize((W, H), Image.BICUBIC)


# gradient overlays precomputed cheaply
def vgrad(top_a, mid_a, bot_a):
    g = Image.new("L", (1, H))
    px = []
    for y in range(H):
        p = y / (H - 1)
        if p < 0.45:
            a = top_a + (mid_a - top_a) * (p / 0.45)
        else:
            a = mid_a + (bot_a - mid_a) * ((p - 0.45) / 0.55)
        px.append(int(max(0, min(255, a))))
    g.putdata(px)
    return g.resize((W, H))


OVERLAY = vgrad(215, 60, 235).convert("L")


def text_block(draw, lines, font, cx, cy, fill=WHITE, stroke=6, stroke_fill=(0, 0, 0),
               shadow=True, line_gap=1.12, word_colors=None, glow=None):
    """Draws centered multi-line text; word_colors: {(line_idx, word_idx): color}."""
    heights = []
    line_h = font.size * line_gap
    total = line_h * len(lines)
    y = cy - total / 2 + line_h / 2
    for li, line in enumerate(lines):
        words = line.split(" ")
        widths = [draw.textlength(w, font=font) for w in words]
        space = draw.textlength(" ", font=font)
        lw = sum(widths) + space * (len(words) - 1)
        x = cx - lw / 2
        for wi, (w, wd) in enumerate(zip(words, widths)):
            col = fill
            if word_colors and (li, wi) in word_colors:
                col = word_colors[(li, wi)]
            if glow and (li, wi) in glow:
                draw.text((x, y), w, font=font, fill=col, anchor="lm",
                          stroke_width=stroke + 5, stroke_fill=(255, 190, 0, 120))
            if shadow:
                draw.text((x + 4, y + 7), w, font=font, fill=(0, 0, 0), anchor="lm",
                          stroke_width=stroke, stroke_fill=(0, 0, 0))
            draw.text((x, y), w, font=font, fill=col, anchor="lm",
                      stroke_width=stroke, stroke_fill=stroke_fill)
            x += wd + space
        y += line_h
    return total


def wrap_words(words, font, max_w, draw):
    lines, cur = [], []
    for w in words:
        trial = " ".join(cur + [w])
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur.append(w)
        else:
            lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def ease_out(p):
    return 1 - (1 - p) ** 3


def draw_hook(img, draw, t):
    """First ~3s: big title + kicker."""
    p = t / 3.3
    a = 1.0 if t < 2.05 else max(0.0, 1 - (t - 2.05) / 0.45)
    if a <= 0:
        return
    k = ease_out(min(1, t / 0.30))
    # dark plate behind hook for legibility
    plate = Image.new("RGBA", (W, 760), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    pd.rounded_rectangle([40, 40, W - 40, 720], radius=44, fill=(8, 9, 14, int(150 * a)))
    img.paste(Image.alpha_composite(img.crop((0, 330, W, 1090)).convert("RGBA"), plate).convert("RGB"), (0, 330))

    # kicker
    kf = F(700, 40)
    kick = KICKER
    tl = draw.textlength(kick, font=kf)
    y0 = 430 + int((1 - k) * -40)
    draw.rounded_rectangle([W / 2 - tl / 2 - 30, y0 - 34, W / 2 + tl / 2 + 30, y0 + 34], radius=34,
                           fill=(int(YELLOW[0]), int(YELLOW[1]), int(YELLOW[2])))
    draw.text((W / 2, y0), kick, font=kf, fill=(12, 12, 12), anchor="mm")

    # big title, scaled in
    size = int(122 * (0.86 + 0.14 * k))
    f = F(900, size)
    lines = wrap_words(tr_upper(HOOK_TITLE).split(), f, W - 170, draw)
    colors = {}
    for li, line in enumerate(lines):
        for wi, w in enumerate(line.split(" ")):
            if "AİDAT" in w or "GERİ" in w:
                colors[(li, wi)] = YELLOW
    sz = size * 1.10
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    text_block(ld, lines, f, W / 2, 700, fill=WHITE, stroke=max(4, size // 14),
               word_colors=colors, line_gap=1.06)
    if a < 1:
        alpha = layer.getchannel("A").point(lambda v: int(v * a))
        layer.putalpha(alpha)
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def draw_captions(img, draw, t):
    """Karaoke captions, just below frame centre, yellow highlight on the spoken word."""
    if t < CAP_START or t > CTA_START:
        return
    page = None
    for pg in PAGES:
        if pg[0][1] - 0.08 <= t < pg[-1][2] + 0.06:
            page = pg
            break
    if page is None:
        return
    active = 0
    for i, w in enumerate(page):
        if t >= w[1] - 0.02:
            active = i
    words = [w[0] for w in page]

    # shrink the type until the block fits comfortably on one phone screen
    size = 82 if len(words) <= 3 else 74
    while size > 46:
        f = F(900, size)
        lines = wrap_words(words, f, W - 240, draw)
        if len(lines) * size * 1.16 <= 420:
            break
        size -= 6
    f = F(900, size)
    lines = wrap_words(words, f, W - 240, draw)

    pos, i = {}, 0
    for li, line in enumerate(lines):
        for wi in range(len(line.split(" "))):
            pos[i] = (li, wi)
            i += 1
    colors = {pos[active]: YELLOW} if active in pos else {}

    cy = 1420
    line_h = size * 1.16 * len(lines)
    plate_h = line_h + 90

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    top = cy - plate_h / 2
    ld.rounded_rectangle([70, top, W - 70, top + plate_h], radius=34, fill=(6, 8, 13, 132))
    text_block(ld, lines, f, W / 2, cy, fill=WHITE, stroke=7, word_colors=colors, line_gap=1.16)
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def draw_steps_card(img, draw, t):
    """Optional motion-graphics step card over the mid b-roll."""
    t0, t1 = STEP_WINDOW
    a = 0.0
    if t0 <= t < t1:
        a = min(1.0, (t - t0) / 0.35)
    elif t1 <= t < t1 + 0.45:
        a = max(0.0, 1 - (t - t1) / 0.4)
    if a <= 0:
        return
    steps = CFG.get("steps") or []
    CH = 460
    card = Image.new("RGBA", (W, CH), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([50, 6, W - 50, CH - 6], radius=38, fill=(9, 11, 17, int(215 * a)),
                         outline=(255, 214, 10, int(200 * a)), width=4)
    f_small = F(800, 38)
    cd.text((W / 2, 62), "BAŞVURU YOLU", font=f_small, fill=(255, 214, 10), anchor="mm")
    y = 150
    for i, s in enumerate(steps):  # noqa: B007
        if t < t0 + 0.25 + i * 0.75:  # staggered reveal
            break
        cd.ellipse([92, y - 26, 144, y + 26], fill=(255, 214, 10))
        cd.text((118, y), str(i + 1), font=F(800, 34), fill=(10, 10, 10), anchor="mm")
        f = F(700, 36)
        words = wrap_words(s.split(), f, W - 260, cd)
        yy = y - (len(words) - 1) * 22
        for line in words:
            cd.text((170, yy), line, font=f, fill=(255, 255, 255), anchor="lm")
            yy += 44
        y += 118
    img.paste(card, (0, 690), card)


def draw_cta(img, draw, t):
    if t < CTA_START:
        return
    p = (t - CTA_START) / 3.2
    a = min(1.0, (t - CTA_START) / 0.30)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    # dim
    ld.rectangle([0, 0, W, H], fill=(4, 5, 9, int(150 * a)))
    kick = "REHBERİ ALMAK İÇİN"
    kf = F(800, 44)
    ld.text((W / 2, 560), kick, font=kf, fill=(255, 255, 255), anchor="mm")
    # big CTA word pill, pulsing
    pulse = 1 + 0.035 * math.sin(p * 2 * math.pi * 2.2)
    f = F(900, int(150 * pulse))
    label = CTA_WORD
    tw = ld.textlength(label, font=f)
    pad = 62
    box = [W / 2 - tw / 2 - pad, 640, W / 2 + tw / 2 + pad, 640 + 200]
    ld.rounded_rectangle(box, radius=42, fill=(255, 214, 10))
    ld.text((W / 2, 740), label, font=f, fill=(12, 12, 12), anchor="mm")
    # instruction
    f2 = F(900, 88)
    lines = ["Yoruma", f"{CTA_WORD} yaz,", "rehberi gönderelim!"]
    y = 1010
    for i, line in enumerate(lines):
        ld.text((W / 2 + 3, y + 9), line, font=f2, fill=(0, 0, 0), anchor="mm",
                stroke_width=10, stroke_fill=(0, 0, 0))
        ld.text((W / 2, y), line, font=f2, fill=(255, 255, 255), anchor="mm",
                stroke_width=10, stroke_fill=(6, 8, 13))
        y += 112
    # handle note
    f3 = F(700, 40)
    note = CFG.get("cta_note", "Kopyala - yapıştır dilekçe + başvuru linki")
    ld.text((W / 2, 1400), note, font=f3, fill=(214, 218, 228), anchor="mm")
    if a < 1:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def draw_chrome(img, draw, t):
    # progress bar
    p = min(1.0, t / TOTAL)
    draw.rectangle([0, 0, W, 12], fill=(0, 0, 0))
    draw.rectangle([0, 0, int(W * p), 12], fill=YELLOW)
    # top label
    f = F(700, 30)
    txt = TOP_LABEL
    draw.rounded_rectangle([46, 56, 46 + draw.textlength(txt, font=f) + 44, 122], radius=33,
                           fill=(0, 0, 0))
    draw.text((46 + 22, 89), txt, font=f, fill=(235, 235, 245), anchor="lm")


# ---------------------------------------------------------------- audio mix
def mix_audio(path):
    import wave

    def read(p):
        w = wave.open(p)
        assert w.getframerate() == SR
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
            out[s:e] += x[: e - s]

    add(A("assets/vo.wav"), 0.10, 1.0)
    add(A("assets/bed.wav"), 0.0, 0.30)
    add(A("assets/sfx_whoosh.wav"), 0.02, 0.55)
    add(A("assets/sfx_boom.wav"), 0.10, 0.55)
    for c in CUTS[1:]:
        add(A("assets/sfx_whoosh.wav"), c - 0.28, 0.34)
        add(A("assets/sfx_pop.wav"), c, 0.22)
    add(A("assets/sfx_whoosh.wav"), CTA_START - 0.30, 0.40)
    add(A("assets/sfx_boom.wav"), CTA_START, 0.35)
    # light limiter
    peak = np.max(np.abs(out)) + 1e-9
    if peak > 0.98:
        out *= 0.98 / peak
    pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("mix ->", path)


# ---------------------------------------------------------------- main
def main():
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(A("videos"), exist_ok=True)
    load_shots()
    global STEP_WINDOW
    if CFG.get("steps"):
        mid = CUTS[len(CUTS) // 2] if CUTS else 0.0
        STEP_WINDOW = (mid, mid + float(CFG.get("cut_every", 3.4)) * 1.0)
    wav = A("videos", "mix.wav")
    mix_audio(wav)

    mp4 = A("videos", f"{OUT_NAME}.mp4")
    cmd = [ff, "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-level", "4.1", "-g", "60", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(N):
        t = i / FPS
        img = crop_frame(t)
        img = Image.composite(Image.new("RGB", (W, H), DARK), img, OVERLAY)
        d = ImageDraw.Draw(img)
        draw_chrome(img, d, t)
        draw_hook(img, d, t)
        draw_steps_card(img, d, t)
        draw_captions(img, d, t)
        draw_cta(img, d, t)
        proc.stdin.write(img.tobytes())
        if i % 60 == 0:
            print("frame", i, f"{t:.1f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("encoded ->", mp4, os.path.getsize(mp4))


if __name__ == "__main__":
    main()
