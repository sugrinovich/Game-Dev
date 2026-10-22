"""Природные объекты: деревья, камни, кусты, грибы, трава, цветы."""
import random
from pxlib import *

FOLIAGE = [hx('203a2c'), hx('2c5436'), hx('3b7240'), hx('56924a'), hx('82b95a')]
FOLIAGE_DRY = [hx('3a3a26'), hx('55502c'), hx('77703a'), hx('9a9248'), hx('c0b560')]
BARK = [hx('9a6c46'), hx('7a5237'), hx('59392b'), hx('3b2a24')]      # слева (светло) -> справа (тёмно)
STONE = [hx('383744'), hx('525161'), hx('717084'), hx('9594a6'), hx('c0bfcc')]
MOSS = [hx('2c4631'), hx('45703d'), hx('6f9a44'), hx('9bc45c')]
BERRY = [hx('7a1f3d'), hx('b02e4c'), hx('e0506a'), hx('ffa0a8')]


def leaf_detail(s: Spr, mask, ramp, rng, n=40):
    """Листва: светлые «кисточки» сверху-слева и тёмные снизу-справа."""
    pts = list(mask)
    for _ in range(n):
        x, y = rng.choice(pts)
        c = s.get(x, y)
        if c in ramp:
            i = ramp.index(c)
            up = ramp[min(len(ramp) - 1, i + 1)]
            s.set(x, y, up)
            s.set(x + 1, y, up)
            if (x - 1, y) in mask and rng.random() < 0.6:
                s.set(x - 1, y + 1, up)
    for _ in range(n // 2):
        x, y = rng.choice(pts)
        c = s.get(x, y)
        if c in ramp:
            i = ramp.index(c)
            dn = ramp[max(0, i - 1)]
            if (x + 1, y + 1) in mask:
                s.set(x, y, dn)
                s.set(x + 1, y + 1, dn)


def blob(cx, cy, rx, ry, rng, wobble=1.5, n=8):
    """Нерегулярное пятно: объединение нескольких эллипсов."""
    m = set()
    for _ in range(n):
        ox = rng.uniform(-rx * 0.55, rx * 0.55)
        oy = rng.uniform(-ry * 0.45, ry * 0.45)
        m |= Spr.ellipse(cx + ox, cy + oy, rx * rng.uniform(0.55, 0.9), ry * rng.uniform(0.55, 0.9))
    m |= Spr.ellipse(cx, cy, rx * 0.8, ry * 0.8)
    return m


def tree_oak(seed, w=52, h=68, ramp=FOLIAGE):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    # ствол
    trunk = set()
    for y in range(34, h - 3):
        t = (y - 34) / (h - 37)
        half = 4 + (2 if y > h - 12 else 0) + (3 if y > h - 7 else 0)
        sway = 0
        for x in range(cx - half, cx + half):
            trunk.add((x, y))
    # корни
    for dx in (-8, -7, 6, 7):
        for yy in range(h - 6, h - 2):
            trunk.add((cx + dx, yy))
    s.band(trunk, BARK, axis='x', lo=cx - 9, hi=cx + 8, dither=0.25)
    for _ in range(9):
        x = rng.randint(cx - 5, cx + 4)
        y0 = rng.randint(38, h - 14)
        for yy in range(y0, y0 + rng.randint(3, 7)):
            if (x, yy) in trunk:
                s.set(x, yy, BARK[2])
    # крона: несколько «шапок»
    mask = set()
    centers = [(cx, 22, 15, 13), (cx - 12, 28, 11, 9), (cx + 12, 28, 11, 9),
               (cx - 6, 14, 10, 8), (cx + 7, 15, 10, 8), (cx, 32, 12, 7)]
    for (x, y, rx, ry) in centers:
        mask |= blob(x + rng.uniform(-1, 1), y, rx, ry, rng, n=5)
    # убираем лишнее по краям холста
    mask = {(x, y) for (x, y) in mask if 1 <= x < w - 1 and 1 <= y < h - 24}
    # тень от кроны на стволе
    for (x, y) in list(trunk):
        if y < 44:
            s.set(x, y, BARK[3] if (x + y) % 2 else BARK[2])
    s.shade(mask, ramp, dither=0.16, rng=rng, center=(cx - 3, 20), radius=24)
    leaf_detail(s, mask, ramp, rng, n=70)
    s.outline(OUT)
    return s


def tree_pine(seed, w=40, h=68):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    trunk = Spr.rmask(cx - 3, h - 18, cx + 2, h - 3)
    for dx in (-5, -4, 3, 4):
        trunk |= Spr.rmask(cx + dx, h - 5, cx + dx, h - 3)
    s.band(trunk, BARK, axis='x', lo=cx - 6, hi=cx + 5, dither=0.2)
    mask = set()
    layers = [(h - 18, 20, 15), (h - 30, 16, 13), (h - 41, 12, 11), (h - 51, 8, 9), (h - 60, 4, 7)]
    ramp = FOLIAGE
    for (by, half, hh) in layers:
        pts = [(cx, by - hh), (cx + half, by), (cx + half - 3, by + 2), (cx - half + 3, by + 2), (cx - half, by)]
        m = Spr.polygon(pts)
        # зубчатый нижний край
        for x in range(cx - half, cx + half + 1, 3):
            m |= {(x, by + 3), (x + 1, by + 3)}
        mask |= m
        s.shade(m, ramp, light=(-0.7, -0.4), dither=0.22, rng=rng, center=(cx - half * 0.3, by - hh * 0.4), radius=half * 1.2)
        # тёмная линия под ярусом
        for x in range(cx - half + 3, cx + half - 2):
            if (x, by + 2) in m:
                s.set(x, by + 2, ramp[0])
    leaf_detail(s, mask, ramp, rng, n=40)
    s.outline(OUT)
    return s


def tree_dead(seed, w=44, h=60):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    dark = [hx('7a6a5c'), hx('5a4a42'), hx('3c3038'), hx('2a2230')]
    trunk = set()
    for y in range(24, h - 3):
        half = 3 + (2 if y > h - 10 else 0)
        for x in range(cx - half, cx + half):
            trunk.add((x, y))
    s.band(trunk, dark, axis='x', lo=cx - 5, hi=cx + 5, dither=0.25)

    def branch(x, y, dx, dy, length, thick):
        for i in range(length):
            xx, yy = x + dx * i, y + dy * i
            for t in range(thick):
                s.set(xx + t, yy, dark[1])
                s.set(xx, yy + t, dark[2] if t else dark[1])
            if i == length // 2 and length > 8:
                branch(int(xx), int(yy), -dx * 0.8 + 0.3, dy * 0.9, length // 2, max(1, thick - 1))
    branch(cx - 2, 28, -0.7, -0.8, 18, 3)
    branch(cx + 2, 26, 0.7, -0.9, 20, 3)
    branch(cx, 24, 0.1, -1.0, 14, 2)
    branch(cx - 3, 40, -0.9, -0.3, 12, 2)
    branch(cx + 3, 38, 0.9, -0.4, 13, 2)
    s.outline(OUT)
    return s


def stump(seed=3, w=22, h=16):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    side = Spr.rmask(cx - 7, 6, cx + 6, h - 3) | Spr.ellipse(cx, h - 3.5, 7.5, 3)
    s.band(side, BARK, axis='x', lo=cx - 8, hi=cx + 7, dither=0.2)
    top = Spr.ellipse(cx, 6, 7.5, 4.5)
    s.fill(top, hx('c79a63'))
    for r, c in ((5.5, hx('a97a4b')), (3.5, hx('c79a63')), (1.6, hx('a97a4b'))):
        for (x, y) in Spr.ellipse(cx, 6, r, r * 0.6):
            pass
    ring = Spr.ellipse(cx, 6, 5, 3)
    for (x, y) in ring:
        if (x, y) not in Spr.ellipse(cx, 6, 4, 2):
            s.set(x, y, hx('a97a4b'))
    for (x, y) in Spr.ellipse(cx, 6, 2, 1):
        s.set(x, y, hx('a97a4b'))
    s.outline(OUT)
    return s


def log_prop(seed=1, w=36, h=16):
    s = Spr(w, h)
    body = Spr.rmask(5, 3, w - 3, h - 3)
    s.band(body, BARK[::-1][::-1], axis='y', dither=0.2)
    end = Spr.ellipse(5, h / 2, 3.5, 5.5)
    s.fill(end, hx('c79a63'))
    for (x, y) in Spr.ellipse(5, h / 2, 2, 3.5):
        s.set(x, y, hx('a97a4b'))
    s.set(5, h // 2, hx('c79a63'))
    for x in range(10, w - 4, 4):
        s.set(x, 6, BARK[2])
        s.set(x + 1, 9, BARK[3])
    # мох
    for x in range(12, 24):
        s.set(x, 3, MOSS[1])
        if x % 2:
            s.set(x, 4, MOSS[2])
    s.outline(OUT)
    return s


def rock(seed, w, h, moss=True, cracks=2):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w / 2
    # нерегулярный многоугольник
    pts = []
    n = 9
    for i in range(n):
        a = math.pi * 2 * i / n
        rx = (w / 2 - 1.5) * rng.uniform(0.86, 1.0)
        ry = (h / 2 - 1.5) * rng.uniform(0.86, 1.0)
        pts.append((cx + math.cos(a) * rx, h / 2 + 1 + math.sin(a) * ry * 0.95))
    mask = Spr.polygon(pts)
    mask = {(x, y) for (x, y) in mask if 0 <= x < w and 0 <= y < h - 1}
    s.shade(mask, STONE, dither=0.22, rng=rng, center=(cx - w * 0.15, h * 0.35), radius=w * 0.62)
    # блики на верхне-левых гранях
    for (x, y) in mask:
        if (x - 1, y - 1) not in mask or (x, y - 1) not in mask:
            if rng.random() < 0.7:
                s.set(x, y, STONE[4])
    # трещины
    for _ in range(cracks):
        x = rng.randint(int(w * 0.3), int(w * 0.7))
        y = rng.randint(int(h * 0.3), int(h * 0.5))
        for i in range(rng.randint(4, 7)):
            if (x, y) in mask:
                s.set(x, y, STONE[0])
            y += 1
            x += rng.choice((-1, 0, 1))
    # мох сверху
    if moss:
        mm = {(x, y) for (x, y) in mask if y < h * 0.36 + (x % 5) * 0.6 and rng.random() < 0.9 and x < w * 0.8}
        for (x, y) in mm:
            s.set(x, y, MOSS[2 if (x + y) % 3 else 1])
        for (x, y) in mm:
            if (x + 1, y) not in mm or (x, y + 1) not in mm:
                s.set(x, y, MOSS[1])
    s.outline(OUT)
    return s


def rubble(seed=2, w=20, h=10):
    rng = random.Random(seed)
    s = Spr(w, h)
    for (cx, cy, r) in ((5, 6, 3.2), (11, 5, 3.6), (15, 7, 2.4), (8, 3, 2)):
        m = Spr.ellipse(cx, cy, r, r * 0.8)
        s.shade(m, STONE, rng=rng)
    s.outline(OUT)
    return s


def pebbles(seed=4, w=12, h=7):
    rng = random.Random(seed)
    s = Spr(w, h)
    for (cx, cy, r) in ((3, 4, 2), (8, 4, 2.4), (6, 2, 1.5)):
        s.shade(Spr.ellipse(cx, cy, r, r * 0.75), STONE, rng=rng)
    s.outline(OUT_SOFT)
    return s


def bush(seed, w=30, h=22, ramp=FOLIAGE, berries=0, flowers=0):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    mask = set()
    for (x, y, rx, ry) in ((cx, h - 9, 11, 8), (cx - 7, h - 8, 7, 6), (cx + 7, h - 8, 7, 6), (cx, h - 13, 8, 6)):
        mask |= blob(x, y, rx, ry, rng, n=3)
    mask = {(x, y) for (x, y) in mask if 1 <= x < w - 1 and 1 <= y < h - 1}
    s.shade(mask, ramp, dither=0.18, rng=rng, center=(cx - 3, h * 0.35), radius=w * 0.55)
    leaf_detail(s, mask, ramp, rng, n=30)
    pts = list(mask)
    for _ in range(berries):
        x, y = rng.choice(pts)
        if y < 5:
            continue
        s.rect(x, y, x + 2, y + 2, BERRY[1])
        s.set(x, y, BERRY[3])
        s.set(x + 1, y, BERRY[2])
        s.set(x + 2, y + 2, BERRY[0])
    for _ in range(flowers):
        x, y = rng.choice(pts)
        s.set(x, y, hx('f4ecd0'))
        s.set(x + 1, y, hx('f4ecd0'))
        s.set(x, y + 1, hx('e8c25a'))
    s.outline(OUT)
    return s


def tall_grass(seed, w=18, h=16, ramp=None):
    ramp = ramp or [hx('2c5436'), hx('3b7240'), hx('56924a'), hx('82b95a')]
    rng = random.Random(seed)
    s = Spr(w, h)
    for i in range(7):
        x = 2 + i * 2 + rng.randint(-1, 1)
        top = rng.randint(1, 6)
        lean = rng.choice((-1, 0, 0, 1))
        for y in range(h - 1, top, -1):
            xx = x + int((h - 1 - y) / (h - top) * lean * 2.5)
            c = ramp[2] if i % 2 else ramp[1]
            if y < top + 3:
                c = ramp[3]
            s.set(xx, y, c)
    s.outline(OUT_SOFT)
    return s


def fern(seed=1, w=22, h=16):
    rng = random.Random(seed)
    s = Spr(w, h)
    cx = w // 2
    for ang in (-1.2, -0.7, -0.25, 0.25, 0.7, 1.2):
        L = rng.randint(7, 11)
        for i in range(L):
            x = cx + math.sin(ang) * i * 1.0
            y = h - 2 - math.cos(ang) * i * 0.9 + (i * i) * 0.018 * abs(ang)
            s.set(x, y, FOLIAGE[3] if i % 2 else FOLIAGE[2])
            if i > 1 and i < L - 1:
                s.set(x - 1, y + 1, FOLIAGE[2])
                s.set(x + 1, y + 1, FOLIAGE[1])
    s.outline(OUT_SOFT)
    return s


def flower(color, seed=1, w=9, h=11):
    s = Spr(w, h)
    cx = w // 2
    for y in range(4, h):
        s.set(cx, y, FOLIAGE[2])
    s.set(cx - 1, h - 3, FOLIAGE[3])
    s.set(cx + 1, h - 4, FOLIAGE[1])
    for (dx, dy) in ((-1, 2), (1, 2), (0, 1), (0, 3)):
        s.set(cx + dx, dy, color)
    s.set(cx, 2, hx('f2d060'))
    s.outline(OUT_SOFT)
    return s


def reeds(seed=1, w=16, h=30):
    rng = random.Random(seed)
    s = Spr(w, h)
    for i, x in enumerate((3, 7, 11)):
        top = 3 + i * 2 + rng.randint(0, 3)
        for y in range(top, h - 1):
            s.set(x + (1 if y < top + 6 and i == 1 else 0), y, FOLIAGE[3] if i % 2 else FOLIAGE[2])
        s.rect(x - 1 + (1 if i == 1 else 0), top - 1, x + (1 if i == 1 else 0), top + 4, hx('6a4630'))
        s.set(x - 1 + (1 if i == 1 else 0), top - 1, hx('9a6c46'))
        s.set(x + (1 if i == 1 else 0), top - 3, hx('6a4630'))
    s.outline(OUT_SOFT)
    return s


def mushroom_red(seed=1, w=24, h=18, glow=False, frame=0):
    rng = random.Random(seed)
    s = Spr(w, h)
    caps = [(w * 0.3, h - 7, 6), (w * 0.68, h - 6, 7), (w * 0.5, h - 4, 4)] if not glow else [(w * 0.32, h - 6, 5), (w * 0.7, h - 7, 6), (w * 0.5, h - 4, 3)]
    ramp = [hx('7a1f3d'), hx('b02e4c'), hx('e0506a'), hx('ff8a8a')] if not glow else [hx('1d4f8a'), hx('2f7fc2'), hx('55c3e8'), hx('b5f0ff')]
    for (cx, cy, r) in sorted(caps, key=lambda c: c[1]):
        # ножка
        stem = Spr.rmask(int(cx - 1.5), int(cy), int(cx + 1), int(cy + r * 0.9))
        s.band(stem, [hx('f1e4c4'), hx('cdb98f'), hx('a8946c')], axis='x', dither=0.0)
        cap = {(x, y) for (x, y) in Spr.ellipse(cx, cy, r, r * 0.75) if y <= cy + 1}
        s.shade(cap, ramp, dither=0.18, rng=rng, center=(cx - r * 0.3, cy - r * 0.3), radius=r * 1.2)
        if not glow:
            for _ in range(2 + int(r // 4)):
                x, y = rng.choice(list(cap))
                s.set(x, y, hx('f6efe0'))
                s.set(x + 1, y, hx('f6efe0'))
        else:
            for _ in range(3):
                x, y = rng.choice(list(cap))
                s.set(x, y, ramp[3])
    s.outline(OUT)
    if glow:
        rng2 = random.Random(100 + frame)
        for _ in range(5):
            x = rng2.randint(2, w - 3)
            y = rng2.randint(1, h - 8)
            s.set(x, y, hx('b5f0ff'))
            if rng2.random() < 0.5:
                s.set(x + 1, y - 1, hx('55c3e8'))
    return s


def all_props(out_dir):
    items = {}
    items['tree_oak_a'] = tree_oak(11)
    items['tree_oak_b'] = tree_oak(23, ramp=[hx('26402c'), hx('335d3a'), hx('46804a'), hx('68a050'), hx('94c864')])
    items['tree_oak_c'] = tree_oak(37, w=46, h=60)
    items['tree_pine_a'] = tree_pine(5)
    items['tree_pine_b'] = tree_pine(9, w=36, h=60)
    items['tree_dead'] = tree_dead(2)
    items['stump'] = stump()
    items['log'] = log_prop()
    items['rock_s'] = rock(3, 22, 16, cracks=1)
    items['rock_m'] = rock(8, 30, 22)
    items['rock_l'] = rock(15, 42, 32, cracks=3)
    items['rubble'] = rubble()
    items['pebbles'] = pebbles()
    items['bush_a'] = bush(1)
    items['bush_b'] = bush(2, w=26, h=20, flowers=3)
    items['bush_berry'] = bush(3, berries=9)
    items['bush_berry_empty'] = bush(3, flowers=0)
    items['grass_a'] = tall_grass(1)
    items['grass_b'] = tall_grass(5, w=14, h=12)
    items['fern'] = fern()
    items['flower_red'] = flower(hx('e0506a'))
    items['flower_yellow'] = flower(hx('f2d060'))
    items['flower_blue'] = flower(hx('6fa8e8'))
    items['flower_white'] = flower(hx('f4ecd0'))
    items['reeds'] = reeds()
    items['mushroom_red'] = mushroom_red(4)
    for f in range(2):
        items[f'mushroom_glow_{f}'] = mushroom_red(6, glow=True, frame=f)
    return items


if __name__ == '__main__':
    import sys
    d = all_props('.')
    preview(list(d.values()), '/tmp/props_preview.png', scale=3, cols=8)
