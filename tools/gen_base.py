"""Лагерь: костёр, здания (3 уровня), грядка, врата вылазок, обелиск, декор."""
import random
from pxlib import *
from gen_props import STONE, BARK, FOLIAGE, MOSS

WOOD = [hx('c58f58'), hx('9a6c46'), hx('76502f'), hx('55392b')]       # светлое -> тёмное
PLANK_L = hx('b07d4c'); PLANK_M = hx('8d6038'); PLANK_D = hx('5f3f2a')
STRAW = [hx('f0cf74'), hx('d9b45a'), hx('b88d3c'), hx('8a6428')]
HIDE = [hx('c9a47a'), hx('a8825a'), hx('86623f'), hx('5f4630')]
ROOF_RED = [hx('c25a3e'), hx('a2432f'), hx('7e3226'), hx('55231f')]
ROOF_SLATE = [hx('8c8b9a'), hx('6c6b7c'), hx('50505f'), hx('383744')]
FIRE = [hx('8a2f2a'), hx('d4532a'), hx('f58a2a'), hx('ffc24a'), hx('ffeaa0')]
IRON = [hx('c0bfcc'), hx('8c8b9a'), hx('5b5a6b'), hx('383744')]


def planks(s, x0, y0, x1, y1, rng, vertical=True, base=None, seam=PLANK_D):
    """Доски: вертикальные или горизонтальные с тенями и сучками."""
    base = base or [PLANK_L, PLANK_M]
    if vertical:
        i = 0
        for x in range(x0, x1 + 1):
            col = base[(x - x0) // 3 % len(base)]
            for y in range(y0, y1 + 1):
                s.set(x, y, col)
            if (x - x0) % 3 == 2:
                for y in range(y0, y1 + 1):
                    s.set(x, y, seam)
        for _ in range(int((x1 - x0) / 5)):
            kx, ky = rng.randint(x0 + 1, x1 - 1), rng.randint(y0 + 2, y1 - 2)
            s.set(kx, ky, seam)
    else:
        for y in range(y0, y1 + 1):
            col = base[(y - y0) // 3 % len(base)]
            for x in range(x0, x1 + 1):
                s.set(x, y, col)
            if (y - y0) % 3 == 2:
                for x in range(x0, x1 + 1):
                    s.set(x, y, seam)
        for _ in range(int((y1 - y0) / 4)):
            kx, ky = rng.randint(x0 + 2, x1 - 2), rng.randint(y0 + 1, y1 - 1)
            s.set(kx, ky, seam)


def stone_wall(s, x0, y0, x1, y1, rng, ramp=STONE):
    rows = 0
    for y in range(y0, y1 + 1, 4):
        off = 0 if rows % 2 == 0 else 4
        for x in range(x0 - off, x1 + 1, 8):
            m = Spr.rmask(max(x0, x + 1), y + 1, min(x1, x + 6), min(y1, y + 2))
            c = ramp[rng.choice((2, 2, 3))]
            s.fill(m, c)
            for xx in range(max(x0, x + 1), min(x1, x + 6) + 1):
                s.set(xx, min(y1, y + 3), ramp[1])
            s.set(max(x0, x + 1), y + 1, ramp[4])
        rows += 1


def thatch_roof(s, mask, rng, ramp=STRAW):
    s.shade(mask, ramp, light=(-0.4, -0.9), dither=0.2, rng=rng)
    for (x, y) in mask:
        if (x * 3 + y) % 5 == 0 and (x, y + 1) in mask:
            s.set(x, y, ramp[3 if y % 2 else 2])
        if (x * 2 + y * 3) % 11 == 0:
            s.set(x, y, ramp[0])


def shingle_roof(s, mask, rng, ramp, rows_h=4):
    ys = [p[1] for p in mask]
    y0 = min(ys)
    for (x, y) in mask:
        r = (y - y0) // rows_h
        yy = (y - y0) % rows_h
        off = 3 if r % 2 else 0
        xx = (x + off) % 6
        light = ramp[1]
        if yy == rows_h - 1:
            c = ramp[3]
        elif xx == 5:
            c = ramp[2]
        elif yy == 0:
            c = ramp[0]
        else:
            c = light
        s.set(x, y, c)


# ------------------------------------------------------------------ КОСТЁР
def campfire(frame, w=40, h=44):
    rng = random.Random(7)
    s = Spr(w, h)
    cx, cy = w // 2, h - 12
    # каменное кольцо
    for i in range(12):
        a = math.pi * 2 * i / 12
        x = cx + math.cos(a) * 12
        y = cy + math.sin(a) * 6
        r = 3.1
        m = Spr.ellipse(x, y, r, r * 0.8)
        s.shade(m, STONE, rng=rng)
    # угли внутри
    inner = Spr.ellipse(cx, cy, 9, 4)
    s.fill(inner, hx('2a1a18'))
    for (x, y) in inner:
        if rng.random() < 0.25:
            s.set(x, y, FIRE[1] if rng.random() < 0.5 else FIRE[0])
    # поленья (крест)
    for (dx, ang) in ((-1, -0.3), (1, 0.3)):
        for i in range(-9, 10):
            x = cx + i
            y = cy + 1 + int(i * ang * 0.5) + (1 if dx > 0 else 0)
            s.set(x, y, WOOD[2])
            s.set(x, y - 1, WOOD[1])
            s.set(x, y + 1, WOOD[3])
    s.set(cx - 9, cy - 2, hx('c79a63')); s.set(cx + 9, cy + 3, hx('c79a63'))
    # пламя — 6 кадров, форма «пляшет»
    t = frame / 6.0 * math.pi * 2
    for layer, (col, base_w, height) in enumerate(((FIRE[1], 7, 22), (FIRE[2], 5, 18), (FIRE[3], 3.5, 13), (FIRE[4], 2, 7))):
        fw = base_w + math.sin(t + layer) * 0.8
        fh = height + math.sin(t * 2 + layer * 1.3) * 2.2
        sway = math.sin(t + layer * 0.6) * (2.2 - layer * 0.4)
        for y in range(int(fh)):
            k = y / fh
            half = fw * (1 - k) ** 0.8
            xoff = sway * k * k * 3
            for x in range(int(cx - half + xoff), int(cx + half + xoff) + 1):
                s.set(x, cy - 2 - y + (1 if layer == 0 else 0), col)
    # искры
    for i in range(3):
        a = (frame + i * 2) % 6
        s.set(cx + (i - 1) * 4 + int(math.sin(t + i) * 2), cy - 22 - a * 2, FIRE[3])
    s.outline(OUT_SOFT)
    return s


# ------------------------------------------------------------------ ФАКЕЛ
def torch(frame, w=14, h=34):
    s = Spr(w, h)
    cx = w // 2
    pole = Spr.rmask(cx - 1, 12, cx, h - 2)
    s.band(pole, [WOOD[0], WOOD[2]], axis='x', dither=0)
    s.rect(cx - 2, h - 3, cx + 1, h - 2, WOOD[3])
    s.rect(cx - 2, 10, cx + 1, 13, IRON[2])
    s.rect(cx - 2, 10, cx + 1, 10, IRON[1])
    t = frame / 4 * math.pi * 2
    for layer, (col, bw, hh) in enumerate(((FIRE[1], 3.2, 10), (FIRE[2], 2.5, 8), (FIRE[3], 1.6, 5))):
        hh += math.sin(t + layer) * 1.4
        sway = math.sin(t + layer) * 1.0
        for y in range(int(hh)):
            k = y / hh
            half = bw * (1 - k)
            for x in range(int(cx - half + sway * k), int(cx + half + sway * k) + 1):
                s.set(x, 9 - y, col)
    s.outline(OUT_SOFT)
    return s


# ------------------------------------------------------------------ ВРАТА ВЫЛАЗОК (каменная арка с вихрем)
def gate(frame, w=72, h=76):
    rng = random.Random(21)
    s = Spr(w, h)
    cx = w // 2
    # портал внутри арки
    arch_in = Spr.ellipse(cx, 36, 15, 24) | Spr.rmask(cx - 15, 36, cx + 14, h - 12)
    t = frame / 6 * math.pi * 2
    for (x, y) in arch_in:
        d = math.hypot((x - cx) / 15.0, (y - 40) / 28.0)
        v = math.sin(d * 9 - t * 1.0 + math.atan2(y - 40, x - cx) * 1.5)
        k = (v + 1) / 2
        base = mix(hx('1b2f4a'), hx('4fd0c8'), k * (1.0 - d * 0.35))
        s.set(x, y, base)
    spark_rng = random.Random(400 + frame)
    pts = [p for p in arch_in if math.hypot((p[0] - cx) / 15.0, (p[1] - 40) / 28.0) < 0.85]
    for (x, y) in spark_rng.sample(pts, 7):
        s.set(x, y, hx('d8fff6')); s.set(x + 1, y, hx('8ff3e8'))
    # арка: колонны + свод
    left = Spr.rmask(cx - 29, 30, cx - 16, h - 5) | Spr.ellipse(cx - 22, 30, 8, 8)
    right = Spr.rmask(cx + 15, 30, cx + 28, h - 5) | Spr.ellipse(cx + 22, 30, 8, 8)
    top = {(x, y) for (x, y) in (Spr.ellipse(cx, 34, 30, 30) - Spr.ellipse(cx, 34, 15, 25)) if y < 34}
    stone = left | right | top
    s.shade(stone, STONE, light=(-0.7, -0.6), dither=0.25, rng=rng, center=(cx - 10, 20), radius=40)
    # кладка — швы
    for (x, y) in stone:
        if (y % 6 == 0) or ((x + (y // 6) * 5) % 11 == 0 and y % 6 != 0):
            c = s.get(x, y)
            s.set(x, y, darker(c, 0.28))
    # мох у основания
    for (x, y) in stone:
        if y > h - 14 and rng.random() < 0.5:
            s.set(x, y, MOSS[1 + (x + y) % 2])
    # замковый камень + руны (светятся)
    key = Spr.rmask(cx - 4, 3, cx + 3, 12)
    s.shade(key, STONE, light=(-0.5, -0.5))
    glow = hx('8ff3e8') if frame % 3 else hx('55d0c8')
    for (dx, dy) in ((0, 5), (-1, 6), (1, 6), (0, 7), (0, 8), (-1, 9), (1, 9)):
        s.set(cx + dx, dy + 1, glow)
    for (dx, dy) in ((-24, 50), (-23, 51), (-22, 52), (-24, 52)):
        s.set(cx + dx, dy, glow if (frame + dx) % 2 else darker(glow, 0.3))
    for (dx, dy) in ((22, 52), (23, 51), (24, 50), (22, 50)):
        s.set(cx + dx, dy, glow if (frame + dx) % 2 == 0 else darker(glow, 0.3))
    # основание — ступень
    base = Spr.rmask(cx - 33, h - 8, cx + 32, h - 3)
    s.shade(base, STONE, light=(-0.2, -0.9), dither=0.2, rng=rng)
    s.outline(OUT)
    return s


# ------------------------------------------------------------------ ОБЕЛИСК (камень возврата)
def obelisk(frame, w=32, h=52):
    rng = random.Random(5)
    s = Spr(w, h)
    cx = w // 2
    body = Spr.polygon([(cx - 8, h - 6), (cx - 6, 8), (cx, 2), (cx + 6, 8), (cx + 8, h - 6)])
    s.band(body, STONE[::-1][::-1], axis='x', lo=cx - 8, hi=cx + 8, dither=0.25)
    for (x, y) in body:
        if (y % 7 == 0):
            s.set(x, y, STONE[1])
    base = Spr.rmask(cx - 12, h - 8, cx + 11, h - 3)
    s.shade(base, STONE, light=(-0.2, -0.9), dither=0.2, rng=rng)
    pulse = [0.2, 0.5, 0.9, 0.5][frame % 4]
    glow = mix(hx('2f7a86'), hx('b8fff4'), pulse)
    for i, y in enumerate(range(12, h - 14, 5)):
        x = cx + (-2 if i % 2 else 1)
        s.set(x, y, glow); s.set(x + 1, y, glow); s.set(x, y + 1, glow)
        s.set(x - 1, y + 2, glow) if i % 2 else s.set(x + 2, y + 2, glow)
    s.set(cx, 4, hx('ccffff') if frame % 2 else glow)
    s.outline(OUT)
    # лёгкое свечение у основания
    return s


# ------------------------------------------------------------------ ПЛОЩАДКА ДЛЯ СТРОЙКИ
def plot(w=64, h=44, label='hammer'):
    rng = random.Random(9)
    s = Spr(w, h)
    # утоптанная земля
    ground = Spr.ellipse(w / 2, h - 16, w / 2 - 3, 13)
    s.shade(ground, [hx('4d3a2a'), hx('634a34'), hx('7d5d40')], dither=0.3, rng=rng, light=(0, -0.5))
    for _ in range(26):
        x, y = rng.choice(list(ground))
        s.set(x, y, hx('957352') if rng.random() < 0.5 else hx('3a2c22'))
    # колья по углам + верёвка
    pts = [(6, h - 22), (w - 7, h - 22), (w - 8, h - 8), (7, h - 8)]
    for i in range(4):
        a, b = pts[i], pts[(i + 1) % 4]
        for k in range(0, 21):
            x = a[0] + (b[0] - a[0]) * k / 20
            y = a[1] + (b[1] - a[1]) * k / 20 + math.sin(k / 20 * math.pi) * 1.5
            s.set(x, y - 4, hx('d9b45a') if k % 2 else hx('b88d3c'))
    for (x, y) in pts:
        s.rect(x - 1, y - 9, x, y, WOOD[1])
        s.rect(x - 1, y - 9, x - 1, y, WOOD[0])
        s.set(x - 1, y - 10, WOOD[0]); s.set(x, y - 10, WOOD[2])
    # табличка
    s.rect(w // 2 - 1, 7, w // 2, 22, WOOD[2])
    sign = Spr.rmask(w // 2 - 8, 2, w // 2 + 7, 13)
    planks(s, w // 2 - 8, 2, w // 2 + 7, 13, rng, vertical=False)
    if label == 'hammer':
        for (dx, dy) in ((0, 0), (1, 0), (2, 0), (3, 0), (1, 1), (2, 1)):
            s.set(w // 2 - 2 + dx, 3 + dy, IRON[0] if dy == 0 else IRON[1])
        for dy in range(2, 10):
            s.set(w // 2, 3 + dy, WOOD[3])
            s.set(w // 2 - 1, 3 + dy, WOOD[2])
    s.outline(OUT)
    return s


def scaffold(w=64, h=60, stage=0):
    rng = random.Random(3)
    s = Spr(w, h)
    for x in (8, w - 10):
        s.rect(x, 14, x + 2, h - 4, WOOD[1]); s.rect(x, 14, x, h - 4, WOOD[0])
    for y in (22, 36, 48):
        s.rect(8, y, w - 8, y + 2, WOOD[2]); s.rect(8, y, w - 8, y, WOOD[1])
    # диагональные распорки
    s.line(10, 24, w - 12, 46, WOOD[2]); s.line(10, 25, w - 12, 47, WOOD[3])
    # мешки/ящик
    s.rect(w // 2 - 6, h - 12, w // 2 + 5, h - 4, PLANK_M)
    s.rect(w // 2 - 6, h - 12, w // 2 + 5, h - 12, PLANK_L)
    s.outline(OUT)
    return s


# ------------------------------------------------------------------ ЗДАНИЯ
def workshop(level):
    rng = random.Random(30 + level)
    W, H = [(60, 58), (68, 66), (76, 74)][level - 1]
    s = Spr(W, H)
    cx = W // 2
    wall_y0 = H // 2 - 2
    # стена-фасад
    wall_m = Spr.rmask(8, wall_y0, W - 9, H - 6)
    if level == 1:
        planks(s, 8, wall_y0, W - 9, H - 6, rng, vertical=True)
    elif level == 2:
        planks(s, 8, wall_y0, W - 9, H - 6, rng, vertical=False)
    else:
        stone_wall(s, 8, wall_y0, W - 9, H - 6, rng)
        # деревянный каркас
        for x in (8, cx - 1, W - 10):
            s.rect(x, wall_y0, x + 1, H - 6, WOOD[2]); s.rect(x, wall_y0, x, H - 6, WOOD[1])
    # дверной проём/навес-прилавок
    door = Spr.rmask(cx - 7, wall_y0 + 8, cx + 6, H - 6)
    s.fill(door, hx('231a22'))
    for (x, y) in door:
        if y > wall_y0 + 14:
            s.set(x, y, hx('2f2230'))
    # красный огонёк горна внутри
    for (dx, dy) in ((-2, -3), (-1, -3), (0, -3), (-1, -4)):
        s.set(cx + dx, H - 8 + dy, FIRE[2 if dy == -3 else 3])
    # стол/верстак перед домом
    tbl_y = H - 12
    s.rect(6, tbl_y, 24, tbl_y + 3, PLANK_L); s.rect(6, tbl_y + 3, 24, tbl_y + 3, PLANK_D)
    s.rect(8, tbl_y + 4, 9, H - 3, WOOD[2]); s.rect(21, tbl_y + 4, 22, H - 3, WOOD[2])
    # инструменты на столе
    s.rect(10, tbl_y - 2, 13, tbl_y - 1, IRON[1]); s.set(9, tbl_y - 1, WOOD[3]); s.set(10, tbl_y - 3, IRON[0])
    s.rect(16, tbl_y - 3, 17, tbl_y - 1, WOOD[1]); s.rect(15, tbl_y - 4, 18, tbl_y - 4, IRON[0])
    # наковальня справа (с 2-го уровня) / колода
    ax = W - 24
    anv = Spr.rmask(ax, H - 12, ax + 14, H - 8)
    s.shade(anv, IRON, light=(-0.4, -0.9), dither=0.1)
    s.rect(ax + 4, H - 7, ax + 10, H - 4, IRON[2])
    # крыша
    roof = Spr.polygon([(2, wall_y0 + 3), (cx, 2 if level < 3 else 0), (W - 3, wall_y0 + 3), (W - 6, wall_y0 + 9), (5, wall_y0 + 9)])
    if level == 1:
        thatch_roof(s, roof, rng)
    elif level == 2:
        shingle_roof(s, roof, rng, ROOF_RED)
    else:
        shingle_roof(s, roof, rng, ROOF_SLATE)
    # нижний карниз/тень
    for x in range(5, W - 5):
        s.set(x, wall_y0 + 9, darker(s.get(x, wall_y0 + 9), 0.35))
        s.set(x, wall_y0 + 10, hx('3a2a26'))
    # дымоход (2–3 уровень)
    if level >= 2:
        ch = Spr.rmask(W - 20, 4, W - 13, 16)
        stone_wall(s, W - 20, 4, W - 13, 16, rng)
        s.rect(W - 21, 3, W - 12, 4, STONE[3])
    if level == 3:
        # стяг на коньке
        s.rect(cx, -1, cx, 1, WOOD[3])
    # вывеска
    s.outline(OUT)
    return s


def hut(level):
    rng = random.Random(50 + level)
    W, H = [(52, 52), (60, 56), (72, 62)][level - 1]
    s = Spr(W, H)
    cx = W // 2
    if level == 1:
        # палатка из шкур
        tent = Spr.polygon([(cx, 2), (W - 4, H - 6), (4, H - 6)])
        s.band(tent, HIDE, axis='x', dither=0.25)
        for (x, y) in tent:
            if (x - cx) * 0 + abs(x - cx) % 9 == 0:
                s.set(x, y, HIDE[3])
        # вход
        entry = Spr.polygon([(cx, 20), (cx + 8, H - 6), (cx - 8, H - 6)])
        s.fill(entry, hx('231a22'))
        s.fill({(x, y) for (x, y) in entry if y > H - 14}, hx('2f2230'))
        # шесты на вершине
        s.line(cx - 1, 2, cx - 4, -1 + 2, WOOD[1]); s.line(cx + 1, 2, cx + 4, 0, WOOD[1])
        # швы и пятна
        s.line(cx - 12, H - 12, cx - 4, 24, HIDE[3]); s.line(cx + 12, H - 12, cx + 4, 24, HIDE[3])
        # костяные украшения
        s.rect(cx - 2, 12, cx + 1, 13, hx('f1e4c4'))
        s.set(cx - 1, 14, hx('f1e4c4'))
    elif level == 2:
        wall_y0 = H // 2 - 2
        planks(s, 8, wall_y0, W - 9, H - 5, rng, vertical=True)
        door = Spr.rmask(cx - 6, wall_y0 + 9, cx + 5, H - 5)
        planks(s, cx - 6, wall_y0 + 9, cx + 5, H - 5, rng, vertical=True, base=[WOOD[2], WOOD[3]])
        s.set(cx + 3, H - 12, hx('f2d060'))
        win = Spr.rmask(W - 22, wall_y0 + 6, W - 14, wall_y0 + 13)
        s.fill(win, hx('f2c868'))
        s.rect(W - 18, wall_y0 + 6, W - 18, wall_y0 + 13, WOOD[3]); s.rect(W - 22, wall_y0 + 9, W - 14, wall_y0 + 9, WOOD[3])
        roof = Spr.polygon([(2, wall_y0 + 4), (cx, 2), (W - 3, wall_y0 + 4), (W - 6, wall_y0 + 10), (5, wall_y0 + 10)])
        thatch_roof(s, roof, rng)
        for x in range(5, W - 5):
            s.set(x, wall_y0 + 10, darker(s.get(x, wall_y0 + 10), 0.4))
    else:
        wall_y0 = H // 2 - 4
        stone_wall(s, 8, wall_y0 + 8, W - 9, H - 5, rng)
        planks(s, 8, wall_y0, W - 9, wall_y0 + 7, rng, vertical=False)
        door = Spr.rmask(cx - 7, wall_y0 + 12, cx + 6, H - 5)
        planks(s, cx - 7, wall_y0 + 12, cx + 6, H - 5, rng, vertical=True, base=[WOOD[2], WOOD[3]])
        for x in (cx - 1, cx):
            for y in range(wall_y0 + 12, H - 5):
                s.set(x, y, IRON[2])
        for wx in (12, W - 24):
            win = Spr.rmask(wx, wall_y0 + 14, wx + 9, wall_y0 + 22)
            s.fill(win, hx('f2c868'))
            s.rect(wx + 4, wall_y0 + 14, wx + 4, wall_y0 + 22, WOOD[3])
            s.rect(wx, wall_y0 + 18, wx + 9, wall_y0 + 18, WOOD[3])
        roof = Spr.polygon([(0, wall_y0 + 6), (cx, 0), (W - 1, wall_y0 + 6), (W - 4, wall_y0 + 13), (3, wall_y0 + 13)])
        shingle_roof(s, roof, rng, ROOF_RED)
        for x in range(3, W - 3):
            s.set(x, wall_y0 + 13, darker(s.get(x, wall_y0 + 13), 0.4))
        # знамя
        bx = W - 14
        s.rect(bx, wall_y0 + 14, bx + 6, wall_y0 + 28, hx('3f7a82'))
        s.rect(bx, wall_y0 + 14, bx + 6, wall_y0 + 15, hx('b8fff4'))
        s.set(bx + 3, wall_y0 + 20, hx('f2d060')); s.set(bx + 2, wall_y0 + 21, hx('f2d060')); s.set(bx + 4, wall_y0 + 21, hx('f2d060'))
    s.outline(OUT)
    return s


def storage(level):
    rng = random.Random(70 + level)
    W, H = [(44, 40), (54, 46), (64, 54)][level - 1]
    s = Spr(W, H)
    cx = W // 2
    if level == 1:
        # навес над ящиками и мешками
        for x in (6, W - 8):
            s.rect(x, 12, x + 1, H - 4, WOOD[1]); s.rect(x, 12, x, H - 4, WOOD[0])
        roof = Spr.polygon([(1, 16), (cx, 4), (W - 2, 16), (W - 4, 21), (3, 21)])
        thatch_roof(s, roof, rng)
        for (bx, by) in ((10, H - 14), (22, H - 14), (16, H - 24)):
            s.rect(bx, by, bx + 11, by + 10, PLANK_M)
            s.rect(bx, by, bx + 11, by, PLANK_L)
            s.rect(bx, by + 4, bx + 11, by + 4, PLANK_D)
            s.rect(bx + 5, by, bx + 6, by + 10, PLANK_D)
        sack = Spr.ellipse(W - 12, H - 9, 6, 7)
        s.shade(sack, [hx('8a6a44'), hx('b08a58'), hx('d6b27a')], dither=0.15)
        s.rect(W - 14, H - 17, W - 10, H - 15, hx('8a6a44'))
    elif level == 2:
        wall_y0 = 18
        planks(s, 6, wall_y0, W - 7, H - 4, rng, vertical=False, base=[PLANK_M, PLANK_D])
        door = Spr.rmask(cx - 8, wall_y0 + 5, cx + 7, H - 4)
        s.fill(door, hx('231a22'))
        for (bx, by) in ((cx - 6, H - 12), (cx + 1, H - 10)):
            s.rect(bx, by, bx + 6, by + 6, PLANK_M); s.rect(bx, by, bx + 6, by, PLANK_L)
        roof = Spr.polygon([(1, wall_y0 + 3), (cx, 3), (W - 2, wall_y0 + 3), (W - 5, wall_y0 + 8), (4, wall_y0 + 8)])
        shingle_roof(s, roof, rng, ROOF_RED)
        for x in range(4, W - 4):
            s.set(x, wall_y0 + 8, darker(s.get(x, wall_y0 + 8), 0.4))
        # бочка сбоку
        barrel(s, W - 12, H - 14)
    else:
        wall_y0 = 22
        stone_wall(s, 6, wall_y0 + 4, W - 7, H - 4, rng)
        planks(s, 6, wall_y0, W - 7, wall_y0 + 3, rng, vertical=False)
        door = Spr.rmask(cx - 10, wall_y0 + 8, cx + 9, H - 4)
        s.fill(door, hx('231a22'))
        planks(s, cx - 10, wall_y0 + 8, cx - 1, H - 4, rng, vertical=True, base=[WOOD[2], WOOD[3]])
        planks(s, cx, wall_y0 + 8, cx + 9, H - 4, rng, vertical=True, base=[WOOD[2], WOOD[3]])
        s.rect(cx - 1, wall_y0 + 8, cx, H - 4, IRON[2])
        roof = Spr.polygon([(0, wall_y0 + 4), (cx, 0), (W - 1, wall_y0 + 4), (W - 4, wall_y0 + 11), (3, wall_y0 + 11)])
        shingle_roof(s, roof, rng, ROOF_SLATE)
        for x in range(3, W - 3):
            s.set(x, wall_y0 + 11, darker(s.get(x, wall_y0 + 11), 0.4))
        barrel(s, 8, H - 14)
        barrel(s, W - 16, H - 14)
    s.outline(OUT)
    return s


def barrel(s, x, y):
    """Бочка 9x12, рисуется на готовом спрайте (x,y — левый верх)."""
    body = Spr.ellipse(x + 4.5, y + 7, 4.8, 6)
    s.band(body, [WOOD[0], WOOD[1], WOOD[2], WOOD[3]], axis='x', dither=0.2)
    for yy in (y + 3, y + 10):
        for xx in range(x, x + 9):
            if (xx, yy) in body:
                s.set(xx, yy, IRON[2])
    s.set(x + 3, y + 1, WOOD[0]); s.set(x + 4, y + 1, WOOD[0])


def barrel_sprite():
    s = Spr(14, 18)
    barrel(s, 2, 2)
    s.outline(OUT)
    return s


def crate_sprite():
    s = Spr(18, 18)
    s.rect(2, 2, 15, 15, PLANK_M)
    s.rect(2, 2, 15, 3, PLANK_L)
    for x in (2, 14):
        s.rect(x, 2, x + 1, 15, PLANK_D)
    s.rect(2, 8, 15, 9, PLANK_D)
    s.line(3, 3, 14, 14, PLANK_D)
    s.set(5, 5, PLANK_L)
    s.outline(OUT)
    return s


def garden(stage, w=64, h=40):
    rng = random.Random(90)
    s = Spr(w, h)
    # деревянная рама грядки
    soil = Spr.rmask(4, 10, w - 5, h - 6)
    s.shade(soil, [hx('3b2a22'), hx('55392b'), hx('6b4a35')], dither=0.35, rng=rng, light=(0, -1))
    for x in range(6, w - 6, 5):
        for y in range(13, h - 8, 7):
            s.set(x, y, hx('3b2a22')); s.set(x + 1, y + 1, hx('7a5a40'))
    # рамка
    s.rect(2, 8, w - 3, 10, WOOD[0]); s.rect(2, 9, w - 3, 10, WOOD[1])
    s.rect(2, h - 6, w - 3, h - 4, WOOD[1]); s.rect(2, h - 4, w - 3, h - 4, WOOD[3])
    s.rect(2, 8, 4, h - 4, WOOD[1]); s.rect(w - 5, 8, w - 3, h - 4, WOOD[2])
    # растения
    cols = 5
    for i in range(cols):
        for j, ry in enumerate((16, 27)):
            x = 10 + i * 11 + (j * 3)
            y = ry
            if stage == 0:
                continue
            if stage == 1:
                s.set(x, y, FOLIAGE[3]); s.set(x - 1, y - 1, FOLIAGE[2]); s.set(x + 1, y - 1, FOLIAGE[2]); s.set(x, y + 1, FOLIAGE[1])
            elif stage == 2:
                for k in range(5):
                    s.set(x, y - k, FOLIAGE[2])
                s.set(x - 2, y - 3, FOLIAGE[3]); s.set(x - 1, y - 4, FOLIAGE[3]); s.set(x + 2, y - 2, FOLIAGE[3]); s.set(x + 1, y - 3, FOLIAGE[3])
                s.set(x - 1, y - 5, FOLIAGE[4]); s.set(x, y - 6, FOLIAGE[4])
            else:
                for k in range(7):
                    s.set(x, y - k, FOLIAGE[2])
                for (dx, dy) in ((-2, -3), (-1, -4), (2, -2), (1, -3), (-2, -6), (2, -5)):
                    s.set(x + dx, y + dy, FOLIAGE[3])
                # спелые ягоды/тыковки
                for (dx, dy) in ((-1, -7), (1, -4), (-2, -2)):
                    s.rect(x + dx, y + dy, x + dx + 2, y + dy + 2, hx('e0802f'))
                    s.set(x + dx, y + dy, hx('ffc24a'))
                    s.set(x + dx + 2, y + dy + 2, hx('a2432f'))
    s.outline(OUT)
    return s


def signpost(w=34, h=40):
    s = Spr(w, h)
    cx = w // 2
    s.rect(cx - 1, 8, cx + 1, h - 3, WOOD[1]); s.rect(cx - 1, 8, cx - 1, h - 3, WOOD[0]); s.rect(cx + 1, 8, cx + 1, h - 3, WOOD[3])
    for (y, d, label) in ((5, 1, 0), (14, -1, 1)):
        x0, x1 = (cx - 4, cx + 14) if d == 1 else (cx - 14, cx + 4)
        planks(s, x0, y, x1, y + 6, random.Random(label), vertical=False)
        tip = Spr.polygon([(x1 + 1, y), (x1 + 4, y + 3), (x1 + 1, y + 6)]) if d == 1 else Spr.polygon([(x0 - 1, y), (x0 - 4, y + 3), (x0 - 1, y + 6)])
        s.fill(tip, PLANK_M)
        s.set(cx + (-2 if d == 1 else 2), y + 3, hx('2a1a18'))
        s.set(cx + (1 if d == 1 else -1), y + 3, hx('2a1a18'))
    s.outline(OUT)
    return s


def log_seat(w=26, h=14):
    s = Spr(w, h)
    body = Spr.rmask(3, 3, w - 3, h - 3)
    s.band(body, [WOOD[0], WOOD[1], WOOD[2]], axis='y', dither=0.2)
    end = Spr.ellipse(3, h / 2, 2.5, 4.5)
    s.fill(end, hx('c79a63'))
    s.set(3, h // 2, hx('a97a4b'))
    s.outline(OUT)
    return s


def fence(vertical=False):
    if not vertical:
        s = Spr(16, 20)
        s.rect(0, 9, 15, 10, WOOD[0]); s.rect(0, 10, 15, 10, WOOD[2])
        s.rect(0, 14, 15, 15, WOOD[1]); s.rect(0, 15, 15, 15, WOOD[3])
        s.rect(6, 4, 9, 17, WOOD[1]); s.rect(6, 4, 6, 17, WOOD[0]); s.rect(9, 4, 9, 17, WOOD[3])
        s.rect(6, 3, 9, 3, WOOD[0])
    else:
        s = Spr(10, 18)
        s.rect(3, 2, 6, 15, WOOD[1]); s.rect(3, 2, 3, 15, WOOD[0]); s.rect(6, 2, 6, 15, WOOD[3])
        s.rect(4, 0, 5, 2, WOOD[0])
        s.rect(2, 7, 7, 8, WOOD[2])
    s.outline(OUT)
    return s


def all_base():
    d = {}
    for f in range(6):
        d[f'campfire_{f}'] = campfire(f)
    for f in range(4):
        d[f'torch_{f}'] = torch(f)
    for f in range(6):
        d[f'gate_{f}'] = gate(f)
    for f in range(4):
        d[f'obelisk_{f}'] = obelisk(f)
    d['plot'] = plot()
    d['scaffold'] = scaffold()
    for lv in (1, 2, 3):
        d[f'workshop_{lv}'] = workshop(lv)
        d[f'hut_{lv}'] = hut(lv)
        d[f'storage_{lv}'] = storage(lv)
    for st in range(4):
        d[f'garden_{st}'] = garden(st)
    d['barrel'] = barrel_sprite()
    d['crate'] = crate_sprite()
    d['signpost'] = signpost()
    d['log_seat'] = log_seat()
    d['fence_h'] = fence(False)
    d['fence_v'] = fence(True)
    return d


if __name__ == '__main__':
    d = all_base()
    preview(list(d.values()), '/tmp/base_preview.png', scale=3, bg=(60, 84, 62, 255), cols=8)
