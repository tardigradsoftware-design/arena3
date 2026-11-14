"""Builds the audio bed + SFX for the vertical short.

Outputs:
  assets/sfx_whoosh.wav, assets/sfx_pop.wav, assets/sfx_boom.wav, assets/bed.wav
"""
import numpy as np
import wave, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def save(path, x):
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", path, round(len(x) / SR, 2), "s")


def env(n, a=0.02, d=0.2, sustain=0.0, r=0.2):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n)
    ai = max(1, int(a * SR))
    ri = max(1, int(r * SR))
    e[:ai] = np.linspace(0, 1, ai)
    e[-ri:] *= np.linspace(1, 0, ri)
    di = max(1, int(d * SR))
    e[ai:ai + di] = np.linspace(1, sustain, min(di, len(e) - ai))
    if ai + di < n:
        e[ai + di:] = sustain
    return e


# ---------- whoosh: filtered noise with a rising-then-falling sweep ----------
dur = 0.75
n = int(dur * SR)
t = np.arange(n) / SR
noise = rng.standard_normal(n)
# crude time-varying bandpass via moving average difference
out = np.zeros(n)
win = 40
smooth = np.convolve(noise, np.ones(win) / win, mode="same")
hp = noise - np.convolve(noise, np.ones(9) / 9, mode="same")
sweep = np.clip(t / dur, 0, 1)
out = hp * (0.35 + 0.9 * np.sin(np.pi * sweep) ** 1.5)
# add a low airy tail
out += 0.25 * smooth * np.sin(np.pi * sweep) ** 2
e = np.exp(-((t - 0.32) ** 2) / (2 * 0.14 ** 2))
out *= e / (np.max(np.abs(out)) + 1e-9) * 0.85
save(os.path.join(OUT, "sfx_whoosh.wav"), out)

# ---------- pop: quick pitch-drop blip ----------
dur = 0.16
n = int(dur * SR)
t = np.arange(n) / SR
f = 950 * np.exp(-t * 14) + 220
ph = 2 * np.pi * np.cumsum(f) / SR
pop = np.sin(ph) * np.exp(-t * 26)
pop += 0.35 * rng.standard_normal(n) * np.exp(-t * 90)
pop = pop / (np.max(np.abs(pop)) + 1e-9) * 0.8
save(os.path.join(OUT, "sfx_pop.wav"), pop)

# ---------- boom: sub impact for the hook ----------
dur = 0.9
n = int(dur * SR)
t = np.arange(n) / SR
f = 62 * np.exp(-t * 3.2) + 34
ph = 2 * np.pi * np.cumsum(f) / SR
boom = np.sin(ph) * np.exp(-t * 4.5)
boom += 0.2 * np.sin(2 * np.pi * 110 * t) * np.exp(-t * 9)
boom = boom / (np.max(np.abs(boom)) + 1e-9) * 0.9
save(os.path.join(OUT, "sfx_boom.wav"), boom)

# ---------- bed: dark minor pad, slow pulse ----------
DUR = 22.0
n = int(DUR * SR)
t = np.arange(n) / SR
pad = np.zeros(n)
for f0, amp in ((110.0, 0.5), (130.81, 0.34), (164.81, 0.30), (220.0, 0.16), (329.63, 0.08)):
    for det in (-0.4, 0.0, 0.45):
        pad += amp * np.sin(2 * np.pi * (f0 + det) * t + rng.uniform(0, 6))
pad /= 6.0
# slow tremolo / breathing
pad *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.13 * t)
# rhythmic low pulse 100bpm
beat = 60 / 100
pul = np.zeros(n)
for k in range(int(DUR / beat)):
    s = int(k * beat * SR)
    ln = min(int(0.22 * SR), n - s)
    if ln <= 0:
        break
    tt = np.arange(ln) / SR
    pul[s:s + ln] += np.sin(2 * np.pi * 58 * tt) * np.exp(-tt * 16) * 0.55
pad = pad + pul * 0.4
# gentle lowpass
pad = np.convolve(pad, np.ones(12) / 12, mode="same")
# fade
fi, fo = int(0.8 * SR), int(2.0 * SR)
pad[:fi] *= np.linspace(0, 1, fi)
pad[-fo:] *= np.linspace(1, 0, fo)
pad = pad / (np.max(np.abs(pad)) + 1e-9) * 0.5
save(os.path.join(OUT, "bed.wav"), pad)
