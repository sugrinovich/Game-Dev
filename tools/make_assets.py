"""Запуск: python3 tools/make_assets.py  — перерисовывает все спрайты в src/assets/.

Статичные и анимированные объекты упаковываются в один атлас (sprites.png + sprites.json),
шрифты — в BMFont (fonts/), фоны титульного экрана — отдельные PNG (title/).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from pxlib import *
import gen_props, gen_base, gen_mobs, gen_title, gen_fonts

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets')


def last_ink_row(s):
    for y in range(s.h - 1, -1, -1):
        for x in range(s.w):
            if s.px[x, y][3] > 0:
                return y
    return s.h - 1


def pack(sprites, path_png, path_json, width=512):
    items = sorted(sprites.items(), key=lambda kv: (-kv[1].h, kv[0]))
    x = y = 1; rowh = 0; placed = []
    for name, s in items:
        if x + s.w + 1 > width:
            x = 1; y += rowh + 1; rowh = 0
        placed.append((name, s, x, y)); x += s.w + 1; rowh = max(rowh, s.h)
    H = 1
    while H < y + rowh + 2: H *= 2
    atlas = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    frames = {}
    for name, s, px, py in placed:
        atlas.alpha_composite(s.im, (px, py))
        base = name.rsplit('_', 1)[0] if name.rsplit('_', 1)[-1].isdigit() else name
        piv_y = (last_ink_row(s) - 1) / s.h
        frames[name] = {'frame': {'x': px, 'y': py, 'w': s.w, 'h': s.h}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': s.w, 'h': s.h}, 'sourceSize': {'w': s.w, 'h': s.h},
                        'pivot': {'x': 0.5, 'y': round(piv_y, 4)}}
    atlas.save(path_png)
    json.dump({'frames': frames, 'meta': {'image': os.path.basename(path_png), 'size': {'w': width, 'h': H}, 'scale': '1'}}, open(path_json, 'w'))
    print(f'atlas: {len(frames)} кадров, {width}x{H}')


def main():
    os.makedirs(ROOT, exist_ok=True)
    sprites = {}
    sprites.update(gen_props.all_props('.'))
    sprites.update(gen_base.all_base())
    sprites.update(gen_mobs.all_mobs_fx())
    sprites.update({f'icon_{k}': v for k, v in gen_mobs.all_icons().items()})
    # Анимированные кадры: опорная точка — центр холста (кроме объектов, стоящих на земле)
    for name, s in sprites.items():
        pass
    pack(sprites, os.path.join(ROOT, 'sprites.png'), os.path.join(ROOT, 'sprites.json'))
    td = os.path.join(ROOT, 'title'); os.makedirs(td, exist_ok=True)
    for k, s in gen_title.all_title().items():
        s.save(os.path.join(td, k + '.png'))
    gen_fonts.all_fonts(os.path.join(ROOT, 'fonts'))
    print('готово')


if __name__ == '__main__':
    main()
