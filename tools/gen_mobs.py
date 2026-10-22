"""Мобы (гриб-споровик, шершень), корона короля, эффекты и иконки предметов."""
import random
from pxlib import *
from gen_props import FOLIAGE, STONE, BERRY

SPORE = [hx('1d4f8a'), hx('2f7fc2'), hx('55c3e8'), hx('b5f0ff')]


# ------------------------------------------------------------ ГРИБ-СПОРОВИК
def sporeling(frame, mode='walk', w=32, h=32):
    """Кадры 0..5 — ходьба, 'puff' — выброс спор (3 кадра)."""
    rng = random.Random(14)
    s = Spr(w, h)
    cx = w // 2
    t = frame / 6 * math.pi * 2
    bob = int(round(math.sin(t * 2) * 1.2)) if mode == 'walk' else 0
    squash = 0
    if mode == 'puff':
        squash = [0, 3, 5, 2][min(frame, 3)] * -1
    base_y = h - 5
    # ножки
    sw = int(round(math.sin(t) * 2)) if mode == 'walk' else 0
    for (lx, off) in ((cx - 5, sw), (cx + 3, -sw)):
        leg = Spr.rmask(lx, base_y - 4 - max(0, -off), lx + 2, base_y + (1 if off > 0 else 0))
        s.band(leg, [hx('f1e4c4'), hx('a8946c')], axis='x', dither=0)
        s.rect(lx - 1, base_y, lx + 3, base_y + 1, hx('cdb98f'))
    # тело-ножка
    body_top = base_y - 15 + bob - squash
    body = Spr.ellipse(cx, base_y - 8 + bob / 2, 7.5, 7 + squash * 0.3) 
    s.band(body, [hx('f6ecd0'), hx('e0cfa8'), hx('b9a37a'), hx('8e7a58')], axis='x', lo=cx - 8, hi=cx + 8, dither=0.2)
    # шляпка
    cap_h = 8 + (squash * -0.3 if mode == 'puff' else 0)
    cap = {(x, y) for (x, y) in Spr.ellipse(cx, body_top + 4, 13, cap_h) if y <= body_top + 6}
    ramp = [hx('6e1a36'), hx('a62a48'), hx('d94a64'), hx('ff8a8a')]
    s.shade(cap, ramp, dither=0.18, rng=rng, center=(cx - 4, body_top), radius=14)
    for (dx, dy) in ((-7, 2), (-1, -2), (6, 1), (-9, 5), (3, 5)):
        x, y = cx + dx, body_top + dy
        if (x, y) in cap:
            s.rect(x, y, x + 1, y + 1, hx('f6efe0'))
    # низ шляпки — тёмная складка
    for x in range(cx - 12, cx + 13):
        if (x, body_top + 6) in cap:
            s.set(x, body_top + 6, hx('4a1228'))
    # лицо: злые глаза
    ey = body_top + 8
    s.rect(cx - 5, ey, cx - 3, ey + 2, hx('231a22')); s.rect(cx + 3, ey, cx + 5, ey + 2, hx('231a22'))
    s.set(cx - 4, ey, hx('f2d060')); s.set(cx + 4, ey, hx('f2d060'))
    s.line(cx - 6, ey - 1, cx - 3, ey, hx('231a22')); s.line(cx + 6, ey - 1, cx + 3, ey, hx('231a22'))
    s.rect(cx - 1, ey + 4, cx + 1, ey + 4, hx('5a3a30'))
    # споры вокруг
    n = 2 if mode == 'walk' else (4 + frame * 2)
    for i in range(n):
        a = rng.uniform(0, math.pi * 2)
        r = rng.uniform(10, 14 + (frame * 1.5 if mode == 'puff' else 0))
        x, y = cx + math.cos(a) * r, body_top + 2 + math.sin(a) * r * 0.7
        s.set(x, y, SPORE[3]); s.set(x + 1, y, SPORE[2])
    s.outline(OUT)
    return s


# ------------------------------------------------------------ ШЕРШЕНЬ
def wasp(frame, w=32, h=32):
    s = Spr(w, h)
    cx, cy = w // 2, h // 2 + 2
    wing_up = frame % 2 == 0
    # крылья (под телом)
    for sx in (-1, 1):
        wy = cy - (9 if wing_up else 5)
        wing = Spr.ellipse(cx + sx * 6, wy, 5.5, 3 if wing_up else 2)
        for (x, y) in wing:
            s.set(x, y, hx('d8f0ff', 190))
        s.set(cx + sx * 6, wy, hx('ffffff'))
    # брюшко
    abd = Spr.ellipse(cx + 5, cy + 1, 7, 5)
    s.band(abd, [hx('f2d060'), hx('d9a830'), hx('a8781c')], axis='y', dither=0.15)
    for x in (cx + 3, cx + 7, cx + 10):
        for y in range(cy - 3, cy + 6):
            if (x, y) in abd:
                s.set(x, y, hx('2a1a18'))
    # жало
    s.line(cx + 12, cy + 2, cx + 15, cy + 4, hx('2a1a18'))
    s.set(cx + 15, cy + 4, hx('ff5a5a'))
    # грудь+голова
    chest = Spr.ellipse(cx - 2, cy, 4.5, 4.5)
    s.band(chest, [hx('f2d060'), hx('c89420'), hx('7a5a14')], axis='y', dither=0.15)
    head = Spr.ellipse(cx - 8, cy + 1, 4, 3.8)
    s.shade(head, [hx('4a2a1c'), hx('7a4a2a'), hx('b0703c')])
    s.rect(cx - 10, cy, cx - 9, cy + 1, hx('ff4a4a'))
    s.set(cx - 10, cy, hx('ffd0d0'))
    s.line(cx - 10, cy - 3, cx - 12, cy - 6, hx('2a1a18')); s.line(cx - 8, cy - 3, cx - 8, cy - 6, hx('2a1a18'))
    # лапки
    for dx in (-3, 0, 3):
        s.set(cx + dx, cy + 5, hx('2a1a18')); s.set(cx + dx - 1, cy + 6, hx('2a1a18'))
    s.outline(OUT)
    return s


# ------------------------------------------------------------ КОРОНА КОРОЛЯ СЛИЗНЕЙ
def crown(w=16, h=11):
    s = Spr(w, h)
    gold = [hx('a2701c'), hx('d9a830'), hx('f2d060'), hx('fff0a0')]
    base = Spr.rmask(2, 6, w - 3, 9)
    s.band(base, gold[::-1][::-1], axis='y', dither=0)
    for (x, y0) in ((2, 1), (7, 0), (12, 1)):
        for k in range(y0, 6):
            s.set(x, k, gold[2]); s.set(x + 1, k, gold[1])
        s.set(x, y0, gold[3])
    for x in range(2, w - 2):
        s.set(x, 6, gold[3] if x % 2 else gold[2])
    s.set(5, 7, hx('e0506a')); s.set(9, 7, hx('55c3e8')); s.set(7, 7, hx('e0506a'))
    s.outline(OUT)
    return s


# ------------------------------------------------------------ ЭФФЕКТЫ
def slash(frame, w=56, h=56):
    """Взмах дубины. Нарисован «вправо»; в игре поворачивается на нужный угол."""
    s = Spr(w, h)
    cx, cy = 8, h // 2
    r_out, r_in = 36, 22
    sweep = [(-62, 10), (-62, 40), (-62, 62), (-40, 62), (-14, 62)][frame] if frame < 5 else (0, 0)
    a0, a1 = math.radians(sweep[0]), math.radians(sweep[1])
    fade = [1.0, 1.0, 0.85, 0.55, 0.25][frame]
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            r = math.hypot(dx, dy)
            a = math.atan2(dy, dx)
            if a0 <= a <= a1:
                k = (a - a0) / (a1 - a0 + 1e-6)
                outer = r_out - 5 * (1 - k)
                inner = r_in + 7 * (1 - k) * 0.8 + 3 * (1 - k)
                if inner <= r <= outer:
                    th = (r - inner) / (outer - inner)
                    if th > 0.78:
                        c = (255, 255, 255)
                    elif th > 0.45:
                        c = (255, 240, 206)
                    else:
                        c = (214, 190, 160)
                    alpha = int(255 * fade * (0.35 + 0.65 * k))
                    if alpha > 70 and (BAYER[y % 4][x % 4] / 16.0) < alpha / 255.0 + 0.15:
                        s.set(x, y, c + (255,))
    return s


def spark(frame, w=20, h=20):
    s = Spr(w, h)
    c = w // 2
    r = [3, 6, 8, 9][frame]
    col = [hx('ffffff'), hx('fff0a0'), hx('f2d060'), hx('d98a30')][frame]
    for i in range(8):
        a = i * math.pi / 4
        for k in range(max(1, r - (3 if frame > 0 else 0)), r + 1):
            s.set(c + math.cos(a) * k, c + math.sin(a) * k, col)
    if frame == 0:
        s.rect(c - 1, c - 1, c + 1, c + 1, hx('ffffff'))
    return s


def dust(frame, w=24, h=16):
    s = Spr(w, h)
    rng = random.Random(8 + frame)
    n = 4 + frame
    sz = [2, 3, 4, 3][frame]
    for i in range(n):
        a = i / n * math.pi * 2
        r = 3 + frame * 2.2
        x, y = w / 2 + math.cos(a) * r, h / 2 + math.sin(a) * r * 0.55 - frame * 0.4
        for (xx, yy) in Spr.ellipse(x, y, sz * 0.8, sz * 0.6):
            s.set(xx, yy, hx('d9cdb0', 230 - frame * 40))
    return s


def poof(frame, w=40, h=40):
    s = Spr(w, h)
    rng = random.Random(33 + frame)
    n = 6
    for i in range(n):
        a = i / n * math.pi * 2 + rng.uniform(-0.3, 0.3)
        r = 4 + frame * 4.5
        x, y = w / 2 + math.cos(a) * r, h / 2 + math.sin(a) * r * 0.8
        rad = [5, 6.5, 6, 4.5, 3][frame]
        m = Spr.ellipse(x, y, rad, rad)
        s.shade(m, [hx('b8b0c0'), hx('d8d0e0'), hx('f2eef8')], rng=rng)
    if frame >= 3:
        pass
    s.outline(OUT_SOFT) if frame < 3 else None
    return s


# ------------------------------------------------------------ ИКОНКИ ПРЕДМЕТОВ 16x16
def icon_wood():
    s = Spr(16, 16)
    for (y, x0, x1) in ((4, 2, 12), (8, 3, 13), (11, 1, 11)):
        body = Spr.rmask(x0, y, x1, y + 3)
        s.band(body, [hx('c58f58'), hx('9a6c46'), hx('59392b')], axis='y', dither=0.1)
        e = Spr.ellipse(x1 + 0.5, y + 2, 1.8, 2.2)
        s.fill(e, hx('e0b880'))
    s.outline(OUT)
    return s


def icon_stone():
    s = Spr(16, 16)
    rng = random.Random(3)
    m = Spr.polygon([(3, 12), (2, 7), (6, 3), (11, 4), (14, 8), (13, 12)])
    s.shade(m, STONE, rng=rng, center=(6, 6), radius=8)
    s.set(5, 5, STONE[4]); s.set(6, 5, STONE[4]); s.set(4, 6, STONE[4])
    s.outline(OUT)
    return s


def icon_fiber():
    s = Spr(16, 16)
    for i, x in enumerate(range(4, 12, 2)):
        for y in range(3, 14):
            s.set(x + (y - 3) // 5 * (1 if i % 2 else -1) * 0, y, hx('b8d070') if i % 2 else hx('8cae4a'))
    s.rect(3, 8, 12, 9, hx('9a6c46'))
    s.rect(3, 8, 12, 8, hx('c58f58'))
    s.outline(OUT)
    return s


def icon_berries():
    s = Spr(16, 16)
    for (cx, cy) in ((5, 10), (10, 10), (7.5, 6.5)):
        m = Spr.ellipse(cx, cy, 3.2, 3.2)
        s.shade(m, BERRY, center=(cx - 1, cy - 1), radius=4)
        s.set(cx - 1, cy - 1, hx('ffe0e0'))
    s.rect(7, 2, 8, 3, hx('56924a')); s.set(9, 3, hx('82b95a')); s.set(6, 3, hx('3b7240'))
    s.outline(OUT)
    return s


def icon_gel():
    s = Spr(16, 16)
    m = Spr.ellipse(8, 9.5, 5.5, 4.8) | Spr.ellipse(8, 6, 3, 3)
    s.shade(m, [hx('2f6a5e'), hx('51a38a'), hx('63c99f'), hx('98f0bf')], center=(6, 6), radius=8)
    s.set(6, 6, hx('ceffc0')); s.set(7, 6, hx('ceffc0')); s.set(6, 7, hx('ceffc0'))
    s.outline(hx('264547'))
    return s


def icon_spore():
    s = Spr(16, 16)
    for (cx, cy, r) in ((8, 8, 4.5), (4, 4, 2), (12, 5, 2), (11, 12, 2), (4, 12, 1.5)):
        m = Spr.ellipse(cx, cy, r, r)
        s.shade(m, SPORE, center=(cx - 1, cy - 1), radius=r * 1.3)
    s.set(7, 6, hx('ffffff'))
    s.outline(OUT)
    return s


def icon_stinger():
    s = Spr(16, 16)
    m = Spr.polygon([(6, 3), (10, 3), (11, 7), (9, 13), (8, 14), (7, 13), (5, 7)])
    s.band(m, [hx('f2d060'), hx('c89420'), hx('7a5a14')], axis='x', dither=0.1)
    s.rect(6, 5, 10, 5, hx('2a1a18')); s.rect(6, 8, 10, 8, hx('2a1a18'))
    s.set(8, 14, hx('ff5a5a'))
    s.outline(OUT)
    return s


def icon_royal_gel():
    s = Spr(16, 16)
    m = Spr.ellipse(8, 10, 5.5, 4.5) | Spr.ellipse(8, 7, 3, 3)
    s.shade(m, [hx('a2701c'), hx('d9a830'), hx('f2d060'), hx('fff0a0')], center=(6, 7), radius=8)
    s.rect(5, 1, 10, 2, hx('f2d060')); s.set(5, 0, hx('fff0a0')); s.set(7, 0, hx('fff0a0')); s.set(10, 0, hx('fff0a0'))
    s.set(6, 8, hx('ffffff')); s.set(7, 8, hx('ffffff'))
    s.outline(OUT)
    return s


def icon_poultice():
    s = Spr(16, 16)
    leaf = Spr.ellipse(8, 9, 6, 4.5)
    s.shade(leaf, FOLIAGE, center=(6, 7), radius=8)
    for x in range(4, 12):
        s.set(x, 9, hx('c8e890'))
    s.rect(7, 4, 8, 14, hx('8d6038'))
    s.rect(3, 7, 12, 8, hx('d9b45a'))
    s.rect(3, 7, 12, 7, hx('f0cf74'))
    s.set(8, 5, hx('e0506a')); s.set(9, 5, hx('e0506a')); s.set(8, 4, hx('ffa0a8'))
    s.outline(OUT)
    return s


def icon_heart():
    s = Spr(16, 16)
    m = Spr.polygon([(8, 14), (2, 8), (2, 5), (4, 3), (7, 3), (8, 5), (9, 3), (12, 3), (14, 5), (14, 8)])
    s.shade(m, [hx('7a1f3d'), hx('b02e4c'), hx('e0506a'), hx('ff9aa8')], center=(6, 5), radius=9)
    s.set(4, 5, hx('ffe0e0')); s.set(5, 4, hx('ffe0e0'))
    s.outline(OUT)
    return s


def icon_backpack():
    s = Spr(16, 16)
    body = Spr.rmask(3, 4, 12, 13)
    s.band(body, [hx('c9a47a'), hx('a8825a'), hx('86623f')], axis='x', dither=0.15)
    s.rect(4, 2, 11, 4, hx('86623f'))
    s.rect(3, 8, 12, 9, hx('5f4630'))
    s.rect(7, 8, 8, 10, hx('f2d060'))
    s.rect(5, 11, 10, 12, hx('76502f'))
    s.outline(OUT)
    return s


def icon_dash():
    s = Spr(16, 16)
    for y, x in ((4, 3), (7, 2), (10, 4)):
        s.rect(x, y, x + 4, y, hx('b8fff4'))
    boot = Spr.polygon([(8, 3), (12, 3), (12, 10), (14, 12), (14, 13), (7, 13), (7, 10)])
    s.shade(boot, [hx('4a3a50'), hx('6a5a78'), hx('8c7aa0')], center=(9, 5), radius=8)
    s.outline(OUT)
    return s


def icon_club(level):
    s = Spr(16, 16)
    head_cols = [WOOD_L := hx('9a6c46'), hx('b0b0c0'), hx('f1e4c4'), hx('f2d060')][level]
    s.line(3, 13, 10, 6, hx('76502f')); s.line(4, 13, 11, 6, hx('9a6c46'))
    m = Spr.ellipse(11, 5, 3.6, 3.6)
    base = [[hx('59392b'), hx('7a5237'), hx('9a6c46')], [hx('5b5a6b'), hx('8c8b9a'), hx('c0bfcc')], [hx('a8946c'), hx('d8c8a0'), hx('f6ecd0')], [hx('a2701c'), hx('d9a830'), hx('fff0a0')]][level]
    s.shade(m, base, center=(10, 4), radius=5)
    if level >= 1:
        for (x, y) in ((9, 2), (13, 3), (14, 6), (12, 8)):
            s.set(x, y, base[2])
    s.outline(OUT)
    return s


def icon_lock():
    s = Spr(16, 16)
    body = Spr.rmask(4, 7, 11, 13)
    s.band(body, [hx('f2d060'), hx('c89420'), hx('7a5a14')], axis='y', dither=0)
    s.rect(5, 3, 5, 7, IRON_C); s.rect(10, 3, 10, 7, IRON_C); s.rect(5, 2, 10, 3, IRON_C)
    s.rect(7, 9, 8, 11, hx('2a1a18'))
    s.outline(OUT)
    return s


IRON_C = hx('8c8b9a')


def icon_skull():
    s = Spr(16, 16)
    m = Spr.ellipse(8, 7, 5.5, 5) | Spr.rmask(5, 9, 10, 13)
    s.shade(m, [hx('a8946c'), hx('d8c8a0'), hx('f6ecd0')], center=(6, 5), radius=8)
    s.rect(4, 6, 6, 8, hx('231a22')); s.rect(9, 6, 11, 8, hx('231a22'))
    s.rect(7, 9, 8, 10, hx('231a22'))
    for x in (6, 8, 10):
        s.set(x, 12, hx('231a22'))
    s.outline(OUT)
    return s


def key_cap(label_px):
    pass


def all_mobs_fx():
    d = {}
    for f in range(6):
        d[f'sporeling_walk_{f}'] = sporeling(f, 'walk')
    for f in range(4):
        d[f'sporeling_puff_{f}'] = sporeling(f, 'puff')
    for f in range(4):
        d[f'wasp_{f}'] = wasp(f)
    d['crown'] = crown()
    for f in range(5):
        d[f'slash_{f}'] = slash(f)
    for f in range(4):
        d[f'spark_{f}'] = spark(f)
    for f in range(4):
        d[f'dust_{f}'] = dust(f)
    for f in range(5):
        d[f'poof_{f}'] = poof(f)
    return d


def all_icons():
    d = {
        'wood': icon_wood(), 'stone': icon_stone(), 'fiber': icon_fiber(), 'berries': icon_berries(),
        'gel': icon_gel(), 'spores': icon_spore(), 'stinger': icon_stinger(), 'royal_gel': icon_royal_gel(),
        'poultice': icon_poultice(), 'heart': icon_heart(), 'backpack': icon_backpack(), 'dash': icon_dash(),
        'club_0': icon_club(0), 'club_1': icon_club(1), 'club_2': icon_club(2), 'club_3': icon_club(3),
        'lock': icon_lock(), 'skull': icon_skull(),
    }
    return d


if __name__ == '__main__':
    d = all_mobs_fx()
    d.update(all_icons())
    preview(list(d.values()), '/tmp/mobs_preview.png', scale=3, bg=(60, 84, 62, 255), cols=9)
