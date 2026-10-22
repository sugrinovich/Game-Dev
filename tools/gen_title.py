"""Фоны титульного экрана: ночное небо, луна, холмы и сосны (параллакс-слои)."""
import random
from pxlib import *

W, H = 480, 270


def sky():
    rng = random.Random(1)
    s = Spr(W, H)
    bands = [hx('0b0919'), hx('110e26'), hx('18153a'), hx('221d4c'), hx('2f2860'), hx('443a78'), hx('645290'), hx('8a6a94')]
    for y in range(H):
        v = (y / (H * 0.78)) ** 1.15
        v = min(v, 0.999)
        for x in range(W):
            vv = v * (len(bands) - 1) + (BAYER[y % 4][x % 4] / 16.0 - 0.5) * 0.9
            idx = int(max(0, min(len(bands) - 1, round(vv))))
            s.set(x, y, bands[idx])
    # звёзды
    for _ in range(110):
        x, y = rng.randint(0, W - 1), rng.randint(0, int(H * 0.62))
        c = rng.choice([hx('fff0ce'), hx('b8c8ff'), hx('d8d0ff'), hx('8a90d0')])
        s.set(x, y, c)
        if rng.random() < 0.12:
            s.set(x + 1, y, c); s.set(x - 1, y, c); s.set(x, y + 1, c); s.set(x, y - 1, c)
    # тонкие облака
    for (cx, cy, rw) in ((90, 58, 70), (330, 40, 90), (410, 96, 60), (190, 100, 50)):
        for x in range(cx - rw, cx + rw):
            for y in range(cy - 3, cy + 4):
                d = ((x - cx) / rw) ** 2 + ((y - cy) / 3.2) ** 2
                if d < 1 and BAYER[y % 4][x % 4] / 16.0 < (1 - d) * 0.7:
                    base = s.get(x, y)
                    s.set(x, y, mix(base, hx('8a7aa8'), 0.45))
    return s


def moon(size=56):
    s = Spr(size, size)
    cx = cy = size / 2
    r = size * 0.32
    for y in range(size):
        for x in range(size):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r:
                # кратеры
                c = hx('f6efd8')
                for (mx, my, mr) in ((-4, -3, 3), (5, 3, 4), (-2, 6, 2)):
                    if math.hypot(x - cx - mx, y - cy - my) < mr:
                        c = hx('d8cfb0')
                if x - cx + (y - cy) * 0.6 > r * 0.5:
                    c = mix(c, hx('b8aa98'), 0.6)
                s.set(x, y, c)
            elif d <= r + 7:
                k = 1 - (d - r) / 7
                if BAYER[y % 4][x % 4] / 16.0 < k * 0.55:
                    s.set(x, y, hx('8a82b8', 200))
    s.outline(hx('8a7a98'), bottom_color=None) if False else None
    return s


def hills(seed, base_y, amp, color, rim, w=W, h=H):
    rng = random.Random(seed)
    s = Spr(w, h)
    ph = [rng.uniform(0, 6.28) for _ in range(3)]
    for x in range(w):
        t = x / w * math.pi * 2
        y = base_y + math.sin(t * 2 + ph[0]) * amp + math.sin(t * 5 + ph[1]) * amp * 0.4 + math.sin(t * 9 + ph[2]) * amp * 0.15
        for yy in range(int(y), h):
            s.set(x, yy, color)
        s.set(x, int(y), rim)
    return s


def pine_sil(s, x, base, height, color, rim, rng):
    half = height * 0.22
    layers = 6
    for i in range(layers):
        k = i / layers
        top = base - height + k * height * 0.85
        lw = half * (0.35 + k * 0.95)
        lh = height / layers * 1.9
        pts = [(x, top), (x + lw, top + lh), (x - lw, top + lh)]
        m = Spr.polygon(pts)
        for (px, py) in m:
            s.set(px, py, color)
        # зубчики
        for dx in range(-int(lw), int(lw) + 1, 2):
            if rng.random() < 0.6:
                s.set(x + dx, top + lh + 0, color)
        # подсветка лунным светом слева
        for (px, py) in m:
            if (px - 1, py) not in m and px < x:
                s.set(px, py, rim)
    for y in range(int(base - height * 0.15), int(base) + 1):
        s.set(x, y, color); s.set(x - 1, y, color)


def forest(seed, base_y, count, hmin, hmax, color, rim, w=W, h=H):
    rng = random.Random(seed)
    s = Spr(w, h)
    xs = sorted(rng.uniform(0, w) for _ in range(count))
    for x in xs:
        hh = rng.uniform(hmin, hmax)
        for off in (-w, 0, w):
            pine_sil(s, x + off, base_y + rng.uniform(-4, 4), hh, color, rim, rng)
    for y in range(int(base_y), h):
        for x in range(w):
            s.set(x, y, color)
    return s


def ground(w=W, h=70):
    rng = random.Random(5)
    s = Spr(w, h)
    cols = [hx('1a2430'), hx('1f2d36'), hx('27373a'), hx('2f4540')]
    for y in range(h):
        for x in range(w):
            v = 0.18 + (y / h) * 0.35 + (rng.random() - 0.5) * 0.12 + (BAYER[y % 4][x % 4] / 16.0 - 0.5) * 0.25
            s.set(x, y, cols[int(max(0, min(len(cols) - 1, v * len(cols))))])
    # травинки на кромке
    for x in range(0, w, 2):
        if rng.random() < 0.7:
            hh = rng.randint(2, 6)
            for k in range(hh):
                s.set(x + (k // 3), 2 - k, cols[3] if k % 2 else cols[2])
    return s


def vignette(w=W, h=H):
    s = Spr(w, h)
    for y in range(h):
        for x in range(w):
            d = math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2))
            k = max(0.0, (d - 0.95) / 0.5)
            if BAYER[y % 4][x % 4] / 16.0 < k * 0.7:
                s.set(x, y, hx('0b0919', 255 if k > 0.7 else 200))
    return s


def all_title():
    return {
        'title_sky': sky(),
        'title_moon': moon(),
        'title_hills': hills(3, 168, 10, hx('2b2850'), hx('4a4478')),
        'title_forest_far': forest(7, 196, 26, 44, 70, hx('1e2142'), hx('3a3a6a')),
        'title_forest_near': forest(11, 230, 14, 70, 120, hx('121428'), hx('2a2c52')),
        'title_ground': ground(),
        'title_vignette': vignette(),
    }


if __name__ == '__main__':
    d = all_title()
    out = Spr(W, H)
    for k in ('title_sky', 'title_hills', 'title_forest_far', 'title_forest_near'):
        out.paste(d[k], 0, 0)
    out.paste(d['title_moon'], 360, 30)
    out.paste(d['title_ground'], 0, H - 40)
    out.paste(d['title_vignette'], 0, 0)
    out.im.resize((W * 2, H * 2), Image.NEAREST).save('/tmp/title_preview.png')
