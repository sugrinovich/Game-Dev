"""Растровые шрифты (BMFont) с кириллицей: 'ui' — DejaVu Sans Mono 11px, 'big' — GNU Unifont 16px."""
from PIL import Image, ImageDraw, ImageFont
import os

DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
UNIFONT = '/usr/share/fonts/opentype/unifont/unifont_jp.otf'


def charset():
    cs = [chr(c) for c in range(32, 127)]
    cs += [chr(c) for c in range(0x410, 0x450)] + ['Ё', 'ё']
    cs += list('«»—–…×·•°№←→↑↓✓▶◀▲▼★♥')
    return cs


def build(name, path, size, out_dir):
    font = ImageFont.truetype(path, size)
    asc, desc = font.getmetrics()
    line_h = asc + desc
    cells = []
    for ch in charset():
        adv = int(round(font.getlength(ch)))
        tmp = Image.new('L', (adv + 8, line_h + 4), 0)
        d = ImageDraw.Draw(tmp); d.fontmode = '1'
        d.text((2, 0), ch, font=font, fill=255)
        bb = tmp.getbbox()
        if ch == ' ' or bb is None:
            cells.append((ch, None, 0, 0, adv))
            continue
        cells.append((ch, tmp.crop(bb), bb[0] - 2, bb[1], adv))
    W = 256
    x = y = 1; rowh = 0
    placed = []
    for ch, img, xo, yo, adv in cells:
        if img is None:
            placed.append((ch, 0, 0, 0, 0, xo, yo, adv)); continue
        if x + img.width + 1 > W:
            x = 1; y += rowh + 1; rowh = 0
        placed.append((ch, x, y, img.width, img.height, xo, yo, adv, img))
        x += img.width + 1; rowh = max(rowh, img.height)
    H = 1
    while H < y + rowh + 2:
        H *= 2
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    chars = []
    for p in placed:
        if len(p) == 8:
            chars.append(f'<char id="{ord(p[0])}" x="0" y="0" width="0" height="0" xoffset="0" yoffset="0" xadvance="{p[7]}" page="0" chnl="15"/>')
            continue
        ch, px, py, w, h, xo, yo, adv, img = p
        mask = img.point(lambda v: 255 if v > 100 else 0)
        atlas.paste((255, 255, 255, 255), (px, py), mask)
        chars.append(f'<char id="{ord(ch)}" x="{px}" y="{py}" width="{w}" height="{h}" xoffset="{xo}" yoffset="{yo}" xadvance="{adv}" page="0" chnl="15"/>')
    atlas.save(os.path.join(out_dir, f'{name}.png'))
    xml = (f'<?xml version="1.0"?>\n<font>\n<info face="{name}" size="{size}" bold="0" italic="0"/>\n'
           f'<common lineHeight="{line_h}" base="{asc}" scaleW="{W}" scaleH="{H}" pages="1" packed="0"/>\n'
           f'<pages><page id="0" file="{name}.png"/></pages>\n<chars count="{len(chars)}">\n' + '\n'.join(chars) + '\n</chars>\n</font>\n')
    open(os.path.join(out_dir, f'{name}.fnt'), 'w').write(xml)


def all_fonts(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    build('ui', DEJAVU, 11, out_dir)
    build('big', UNIFONT, 16, out_dir)
