"""Мини-библиотека для рисования пиксель-арта кодом (Pillow).

Все спрайты проекта рисуются скриптами из папки tools/ и сохраняются в src/assets/.
Свет всегда падает сверху-слева — так объекты выглядят в одном стиле со спрайтами
игрока и слизи.
"""
from __future__ import annotations
import math
import random
from PIL import Image, ImageDraw

# --- Общая палитра (тёплые коричневые + приглушённая зелень, тёмно-фиолетовый контур) ---
def hx(s: str, a: int = 255):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)

OUT = hx('1d1822')          # общий контур
OUT_SOFT = hx('2b2433')

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def darker(c, t=0.3):
    return mix(c, (20, 14, 28, 255), t)


def lighter(c, t=0.3):
    return mix(c, (255, 244, 214, 255), t)


class Spr:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.px = self.im.load()

    # ---------- базовые операции ----------
    def set(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return (0, 0, 0, 0)

    def solid(self, x, y):
        return self.get(x, y)[3] > 0

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def paste(self, other: 'Spr', x: int, y: int):
        for yy in range(other.h):
            for xx in range(other.w):
                p = other.px[xx, yy]
                if p[3] > 0:
                    self.set(x + xx, y + yy, p)

    def copy(self) -> 'Spr':
        s = Spr(self.w, self.h)
        s.im = self.im.copy()
        s.px = s.im.load()
        return s

    def flipped(self) -> 'Spr':
        s = Spr(self.w, self.h)
        s.im = self.im.transpose(Image.FLIP_LEFT_RIGHT)
        s.px = s.im.load()
        return s

    # ---------- маски ----------
    @staticmethod
    def ellipse(cx, cy, rx, ry):
        m = set()
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x + 0.5 - cx) / max(rx, 0.1)) ** 2 + ((y + 0.5 - cy) / max(ry, 0.1)) ** 2 <= 1.0:
                    m.add((x, y))
        return m

    @staticmethod
    def polygon(points):
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0, x1, y0, y1 = int(min(xs)), int(max(xs)) + 1, int(min(ys)), int(max(ys)) + 1
        img = Image.new('1', (x1 - x0 + 2, y1 - y0 + 2), 0)
        ImageDraw.Draw(img).polygon([(p[0] - x0, p[1] - y0) for p in points], fill=1)
        px = img.load()
        m = set()
        for yy in range(img.height):
            for xx in range(img.width):
                if px[xx, yy]:
                    m.add((xx + x0, yy + y0))
        return m

    @staticmethod
    def rmask(x0, y0, x1, y1):
        return {(x, y) for y in range(int(y0), int(y1) + 1) for x in range(int(x0), int(x1) + 1)}

    # ---------- заливка ----------
    def fill(self, mask, c):
        for (x, y) in mask:
            self.set(x, y, c)

    def shade(self, mask, ramp, light=(-0.55, -0.8), dither=0.10, rng=None, center=None, radius=None):
        """Объёмная заливка маски по рампе цветов (от тёмного к светлому) с дизерингом."""
        if not mask:
            return
        xs = [p[0] for p in mask]
        ys = [p[1] for p in mask]
        cx = (min(xs) + max(xs) + 1) / 2 if center is None else center[0]
        cy = (min(ys) + max(ys) + 1) / 2 if center is None else center[1]
        r = max(max(xs) - min(xs) + 1, max(ys) - min(ys) + 1) / 2 if radius is None else radius
        hx_, hy_ = cx + light[0] * r * 0.55, cy + light[1] * r * 0.55
        n = len(ramp)
        for (x, y) in mask:
            d = math.hypot(x + 0.5 - hx_, y + 0.5 - hy_) / (r * 1.25)
            d += (BAYER[y % 4][x % 4] / 16.0 - 0.5) * dither
            if rng is not None:
                d += (rng.random() - 0.5) * 0.04
            idx = n - 1 - int(max(0.0, min(0.999, d)) * n)
            self.set(x, y, ramp[idx])

    def band(self, mask, ramp, axis='y', lo=None, hi=None, dither=0.12):
        """Заливка полосами вдоль оси (для стен, стволов, брёвен)."""
        if not mask:
            return
        vals = [p[1] if axis == 'y' else p[0] for p in mask]
        lo = min(vals) if lo is None else lo
        hi = max(vals) if hi is None else hi
        n = len(ramp)
        for (x, y) in mask:
            v = ((y if axis == 'y' else x) - lo) / max(1, hi - lo)
            v += (BAYER[y % 4][x % 4] / 16.0 - 0.5) * dither
            idx = int(max(0.0, min(0.999, v)) * n)
            self.set(x, y, ramp[idx])

    # ---------- контур ----------
    def outline(self, color=OUT, diagonal=False, bottom_color=None):
        res = []
        for y in range(-1, self.h + 1):
            for x in range(-1, self.w + 1):
                if self.solid(x, y):
                    continue
                nb = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                if diagonal:
                    nb += [(x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1)]
                if any(self.solid(a, b) for a, b in nb):
                    c = color
                    if bottom_color is not None and self.solid(x, y - 1):
                        c = bottom_color
                    res.append((x, y, c))
        for x, y, c in res:
            self.set(x, y, c)

    def noise_edge(self, rng, amount=0.25, color=None):
        """Слегка «рвёт» край силуэта: убирает/добавляет угловые пиксели (листва, кусты)."""
        rm, add = [], []
        for y in range(self.h):
            for x in range(self.w):
                if self.solid(x, y):
                    nb = sum(1 for a, b in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if self.solid(a, b))
                    if nb <= 2 and rng.random() < amount:
                        rm.append((x, y))
        for x, y in rm:
            self.set(x, y, (0, 0, 0, 0))

    def save(self, path):
        self.im.save(path)


def sheet(frames, cols=None):
    """Склеивает кадры (Spr одинакового размера) в одну горизонтальную/сеточную картинку."""
    n = len(frames)
    cols = cols or n
    rows = (n + cols - 1) // cols
    fw, fh = frames[0].w, frames[0].h
    s = Spr(fw * cols, fh * rows)
    for i, f in enumerate(frames):
        s.paste(f, (i % cols) * fw, (i // cols) * fh)
    return s


def preview(sprites, path, scale=4, bg=(52, 74, 58, 255), pad=6, cols=8):
    """Контактный лист для проверки глазами."""
    cell_w = max(s.w for s in sprites) + pad
    cell_h = max(s.h for s in sprites) + pad
    rows = (len(sprites) + cols - 1) // cols
    img = Image.new('RGBA', (cell_w * cols, cell_h * rows), bg)
    for i, s in enumerate(sprites):
        ox = (i % cols) * cell_w + (cell_w - s.w) // 2
        oy = (i // cols) * cell_h + (cell_h - s.h) // 2
        img.alpha_composite(s.im, (ox, oy))
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(path)
