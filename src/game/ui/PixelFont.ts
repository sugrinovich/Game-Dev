import Phaser from 'phaser';

/*
 * Собственный шрифт «Осады Бездны» — рисуется кодом, файлов нет.
 * ui  — пиксельные капители: строчные буквы — те же заглавные, только ниже, как надписи на щитах и плитах.
 * big — тот же рисунок вдвое крупнее со «срезом широкого пера»: у каждого штриха срезаны
 *       верхний левый и нижний правый углы, как в готическом письме.
 * Объём «запечён» в оттенках серого (тинт текста их умножает): градиент сверху вниз, тёмный контур,
 * у ui — тень вправо-вниз, у big — металлический блик и выдавленная на 2 пикселя нижняя грань.
 */

type Glyph = readonly string[];

/** Заглавные: 7 строк (0–6), 8-я строка — выносной элемент под строкой (Д, Ц, Щ). */
const CAPS: Record<string, Glyph> = {
  А: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  Б: ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
  В: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  Г: ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
  Д: ['.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
  Е: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  Ж: ['#.#.#', '#.#.#', '.###.', '..#..', '.###.', '#.#.#', '#.#.#'],
  З: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  И: ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
  К: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  Л: ['.####', '.#..#', '.#..#', '.#..#', '.#..#', '#...#', '#...#'],
  М: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  Н: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  О: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  П: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
  Р: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  С: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  Т: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  У: ['#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  Ф: ['..#..', '.###.', '#.#.#', '#.#.#', '#.#.#', '.###.', '..#..'],
  Х: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Ц: ['#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'],
  Ч: ['#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'],
  Ш: ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],
  Щ: ['#.#.#.', '#.#.#.', '#.#.#.', '#.#.#.', '#.#.#.', '#.#.#.', '######', '.....#'],
  Ъ: ['##...', '.#...', '.#...', '.###.', '.#..#', '.#..#', '.###.'],
  Ы: ['#...#', '#...#', '#...#', '###.#', '#.#.#', '#.#.#', '###.#'],
  Ь: ['#....', '#....', '#....', '####.', '#...#', '#...#', '####.'],
  Э: ['.###.', '#...#', '....#', '.####', '....#', '#...#', '.###.'],
  Ю: ['#..##.', '#.#..#', '#.#..#', '###..#', '#.#..#', '#.#..#', '#..##.'],
  Я: ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};
/** Латинские буквы, совпадающие с кириллицей по рисунку. */
const SAME_AS: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' };
/** Строки заглавной, из которых складывается капитель (5 строк); выносной элемент сохраняется. */
const SMALL_ROWS = [0, 2, 3, 4, 6] as const;
/** Капители, которые не получаются выбрасыванием строк — нарисованы отдельно. */
const SMALL: Record<string, Glyph> = {
  М: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  К: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  Ф: ['.###.', '#.#.#', '#.#.#', '.###.', '..#..'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
};
/** Значки над буквой (строка над заглавной / над капителью). */
const ACCENTS: Record<string, { base: string; mark: string }> = {
  Ё: { base: 'Е', mark: '.#.#.' }, Й: { base: 'И', mark: '.###.' },
};

/** Цифры и знаки: строки от верха заглавной (top), ширина = длина строки. */
const MARKS: Record<string, { top: number; rows: Glyph }> = {
  '0': { top: 0, rows: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'] },
  '1': { top: 0, rows: ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '#####'] },
  '2': { top: 0, rows: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'] },
  '3': { top: 0, rows: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'] },
  '4': { top: 0, rows: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'] },
  '5': { top: 0, rows: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'] },
  '6': { top: 0, rows: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'] },
  '7': { top: 0, rows: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'] },
  '8': { top: 0, rows: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'] },
  '9': { top: 0, rows: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'] },
  '.': { top: 6, rows: ['#'] },
  ',': { top: 6, rows: ['.#', '#.'] },
  ':': { top: 2, rows: ['#', '.', '.', '#'] },
  ';': { top: 2, rows: ['.#', '..', '..', '.#', '#.'] },
  '!': { top: 0, rows: ['#', '#', '#', '#', '#', '.', '#'] },
  '?': { top: 0, rows: ['.###.', '#...#', '...#.', '..#..', '..#..', '.....', '..#..'] },
  '-': { top: 3, rows: ['####'] },
  '–': { top: 3, rows: ['#####'] },
  '—': { top: 3, rows: ['#######'] },
  '_': { top: 7, rows: ['#####'] },
  '+': { top: 1, rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  '=': { top: 2, rows: ['####', '....', '####'] },
  '×': { top: 1, rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  '*': { top: 1, rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'] },
  '/': { top: 0, rows: ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'] },
  '\\': { top: 0, rows: ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'] },
  '%': { top: 0, rows: ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'] },
  '(': { top: 0, rows: ['.#', '#.', '#.', '#.', '#.', '#.', '.#'] },
  ')': { top: 0, rows: ['#.', '.#', '.#', '.#', '.#', '.#', '#.'] },
  '[': { top: 0, rows: ['##', '#.', '#.', '#.', '#.', '#.', '##'] },
  ']': { top: 0, rows: ['##', '.#', '.#', '.#', '.#', '.#', '##'] },
  '{': { top: 0, rows: ['.##', '.#.', '.#.', '#..', '.#.', '.#.', '.##'] },
  '}': { top: 0, rows: ['##.', '.#.', '.#.', '..#', '.#.', '.#.', '##.'] },
  '<': { top: 1, rows: ['..#', '.#.', '#..', '.#.', '..#'] },
  '>': { top: 1, rows: ['#..', '.#.', '..#', '.#.', '#..'] },
  '«': { top: 1, rows: ['..#.#', '.#.#.', '#.#..', '.#.#.', '..#.#'] },
  '»': { top: 1, rows: ['#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..'] },
  "'": { top: 0, rows: ['#', '#'] },
  '"': { top: 0, rows: ['#.#', '#.#'] },
  '`': { top: 0, rows: ['#.', '.#'] },
  '$': { top: 0, rows: ['.###.', '#.#..', '.###.', '..#.#', '.###.', '..#..', '.....'] },
  '&': { top: 0, rows: ['.##..', '#..#.', '.##..', '.#..#', '#.##.', '#..#.', '.##.#'] },
  '#': { top: 0, rows: ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'] },
  '|': { top: 0, rows: ['#', '#', '#', '#', '#', '#', '#'] },
  '·': { top: 3, rows: ['#'] },
  '•': { top: 2, rows: ['.#.', '###', '.#.'] },
  '…': { top: 6, rows: ['#.#.#'] },
  '°': { top: 0, rows: ['.#.', '#.#', '.#.'] },
  '№': { top: 0, rows: ['#..#...', '##.#...', '#.##.##', '#..##.#', '#..#.##', '#..#...', '#..#...'] },
  '▶': { top: 0, rows: ['#...', '##..', '###.', '####', '###.', '##..', '#...'] },
  '◀': { top: 0, rows: ['...#', '..##', '.###', '####', '.###', '..##', '...#'] },
  '▲': { top: 1, rows: ['...#...', '..###..', '.#####.', '#######'] },
  '▼': { top: 2, rows: ['#######', '.#####.', '..###..', '...#...'] },
  '→': { top: 1, rows: ['...#.', '....#', '#####', '....#', '...#.'] },
  '←': { top: 1, rows: ['.#...', '#....', '#####', '#....', '.#...'] },
  '↑': { top: 0, rows: ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'] },
  '↓': { top: 0, rows: ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'] },
  '★': { top: 0, rows: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'] },
  '♥': { top: 0, rows: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] },
  '✓': { top: 1, rows: ['.....#', '....#.', '#..#..', '.##...', '..#...'] },
};

/** Глиф в координатах ячейки: строки сверху вниз, row — номер первой строки от верха ячейки. */
interface Cell { row: number; rows: Glyph }

/** Над заглавной — 2 строки (для Ё, Й), под строкой — 1 строка выносных элементов. */
const CAP_TOP = 2;

function cap(ch: string): Glyph | undefined { return CAPS[ch] ?? (SAME_AS[ch] ? CAPS[SAME_AS[ch]!] : undefined); }

function small(ch: string): Glyph | undefined {
  const big = cap(ch);
  if (!big) return undefined;
  const own = SMALL[ch] ?? (SAME_AS[ch] ? SMALL[SAME_AS[ch]!] : undefined);
  return own ?? [...SMALL_ROWS.map((r) => big[r]!), ...big.slice(7)];
}

/** Рисунок символа: заглавная, капитель (для строчной), буква со значком, цифра или знак. */
function cellFor(ch: string): Cell | null {
  const upper = ch.toUpperCase();
  const isLower = ch !== upper;
  const accent = ACCENTS[upper];
  if (accent) {
    const body = isLower ? small(accent.base) : cap(accent.base);
    if (!body) return null;
    // над капителью значок на строку выше её верха, над заглавной — в строке над буквой
    return isLower ? { row: CAP_TOP, rows: [accent.mark, '.'.repeat(accent.mark.length), ...body] } : { row: CAP_TOP - 1, rows: [accent.mark, ...body] };
  }
  const letter = isLower ? small(upper) : cap(upper);
  if (letter) return { row: CAP_TOP + (isLower ? 2 : 0), rows: letter };
  const mark = MARKS[ch];
  return mark ? { row: CAP_TOP + mark.top, rows: mark.rows } : null;
}

/** Всё, что умеет шрифт: кириллица, латиница (строчные — капителью), цифры и знаки. */
function charset(): string[] {
  const letters = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return [...letters, ...letters.toLowerCase(), ...Object.keys(MARKS)];
}

/** Пиксели глифа (true — закрашен) в масштабе scale; pen — срез широкого пера для крупного шрифта. */
function bitmap(rows: Glyph, scale: number, pen: boolean): boolean[][] {
  const at = (x: number, y: number): boolean => rows[y]?.[x] === '#';
  const out = Array.from({ length: rows.length * scale }, () => new Array<boolean>(rows[0]!.length * scale).fill(false));
  rows.forEach((line, y) => [...line].forEach((c, x) => {
    if (c !== '#') return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) out[y * scale + dy]![x * scale + dx] = true;
    if (!pen) return;
    // широкое перо: середина горизонтального штриха тонкая (одна строка), концы и вертикали — толстые
    const up = at(x, y - 1), down = at(x, y + 1);
    if (!up && !down && at(x - 1, y) && at(x + 1, y)) {
      const keep = y <= 3 ? 0 : scale - 1;
      for (let dy = 0; dy < scale; dy++) if (dy !== keep) for (let dx = 0; dx < scale; dx++) out[y * scale + dy]![x * scale + dx] = false;
    }
    if (!at(x - 1, y) && !up) out[y * scale]![x * scale] = false;
    if (!at(x + 1, y) && !down) out[y * scale + scale - 1]![x * scale + scale - 1] = false;
  }));
  return out;
}

/**
 * Размеры шрифтов: scale — увеличение рисунка, spacing — промежуток между буквами, space — ширина пробела,
 * ramp — оттенки лицевой стороны сверху вниз, extrude — глубина выдавленной нижней грани (её оттенки).
 */
export const FONTS = {
  ui: { scale: 1, pen: false, spacing: 1, space: 3, lineHeight: 12, ramp: ['#ffffff', '#ffffff', '#e4e4e4', '#c8c8c8'], extrude: [] },
  big: { scale: 2, pen: true, spacing: 2, space: 6, lineHeight: 22, ramp: ['#ffffff', '#f4f4f4', '#dcdcdc', '#c4c4c4', '#a8a8a8'], extrude: ['#686868', '#444444'] },
} as const;
/** Контур и тень букв (тинт их почти не меняет — тёмное остаётся тёмным). */
const INK = '#140f1c';
/** Поля вокруг рисунка буквы под контур, тень и выдавленную грань. */
const PAD = { left: 1, top: 1, right: 2 } as const;

/**
 * Объёмная буква: лицевая сторона с градиентом и бликом на верхних гранях штрихов,
 * выдавленная вниз «толщина» (у big), тёмный контур и тень вправо-вниз (у ui).
 */
function shadeGlyph(bmp: boolean[][], key: FontKey): (string | null)[][] {
  const f = FONTS[key];
  const depth = f.extrude.length;
  const w = bmp[0]!.length + PAD.left + PAD.right, h = bmp.length + PAD.top + depth + 2;
  const out: (string | null)[][] = Array.from({ length: h }, () => new Array<string | null>(w).fill(null));
  const on = (x: number, y: number): boolean => bmp[y]?.[x] === true;
  bmp.forEach((line, y) => line.forEach((v, x) => {
    if (!v) return;
    const shade = f.ramp[Math.min(f.ramp.length - 1, Math.floor((y / bmp.length) * f.ramp.length))]!;
    out[y + PAD.top]![x + PAD.left] = !on(x, y - 1) && f.pen ? '#ffffff' : shade;   // блик на верхней грани штриха
    for (let d = 1; d <= depth; d++) if (!on(x, y + d)) {
      const row = out[y + PAD.top + d]!;
      if (row[x + PAD.left] === null) row[x + PAD.left] = f.extrude[d - 1]!;
    }
  }));
  // контур вокруг буквы и её «толщины» + тень вправо-вниз
  const solid = out.map((row) => row.map((v) => v !== null));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid[y]![x]) continue;
    const near = solid[y - 1]?.[x] || solid[y + 1]?.[x] || solid[y]![x - 1] || solid[y]![x + 1] || (!f.pen && solid[y - 1]?.[x - 1]);
    if (near) out[y]![x] = INK;
  }
  return out;
}
export type FontKey = keyof typeof FONTS;

interface CharData {
  x: number; y: number; width: number; height: number; centerX: number; centerY: number;
  xOffset: number; yOffset: number; xAdvance: number; data: object; kerning: object;
  u0: number; v0: number; u1: number; v1: number;
}

/** Рисует глифы в текстуру и регистрирует bitmap-шрифт в кеше Phaser (как если бы он был загружен из файла). */
function makeFont(scene: Phaser.Scene, key: FontKey): void {
  const f = FONTS[key];
  const glyphs = charset().map((ch) => ({ ch, cell: cellFor(ch) })).filter((g): g is { ch: string; cell: Cell } => g.cell !== null);
  const W = 256, gap = 1;
  // раскладка по строкам атласа
  let x = gap, y = gap, rowH = 0;
  const placed = glyphs.map((g) => {
    const bmp = bitmap(g.cell.rows, f.scale, f.pen);
    const art = shadeGlyph(bmp, key);
    const w = art[0]!.length, h = art.length, advance = bmp[0]!.length + f.spacing;
    if (x + w + gap > W) { x = gap; y += rowH + gap; rowH = 0; }
    const at = { ...g, art, x, y, w, h, advance };
    x += w + gap; rowH = Math.max(rowH, h);
    return at;
  });
  const H = y + rowH + gap;
  const texKey = `font_${key}`;
  if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  const tex = scene.textures.createCanvas(texKey, W, H);
  if (!tex) return;
  const c = tex.getContext();
  for (const p of placed) p.art.forEach((line, dy) => line.forEach((color, dx) => { if (color) { c.fillStyle = color; c.fillRect(p.x + dx, p.y + dy, 1, 1); } }));
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const chars: Record<number, CharData> = {};
  const add = (code: number, px: number, py: number, w: number, h: number, yOffset: number, advance: number): void => {
    chars[code] = {
      x: px, y: py, width: w, height: h, centerX: Math.floor(w / 2), centerY: Math.floor(h / 2),
      xOffset: -PAD.left, yOffset, xAdvance: advance, data: {}, kerning: {},
      u0: px / W, v0: 1 - py / H, u1: (px + w) / W, v1: 1 - (py + h) / H,
    };
  };
  for (const p of placed) add(p.ch.charCodeAt(0), p.x, p.y, p.w, p.h, p.cell.row * f.scale - PAD.top, p.advance);
  add(32, 0, 0, 0, 0, 0, f.space + f.spacing);
  if (scene.cache.bitmapFont.exists(key)) scene.cache.bitmapFont.remove(key);
  scene.cache.bitmapFont.add(key, { data: { font: key, size: f.lineHeight, lineHeight: f.lineHeight, chars }, texture: texKey, frame: null });
}

/** Создаёт оба шрифта игры. Вызывается один раз при запуске (BootScene). */
export function makePixelFonts(scene: Phaser.Scene): void {
  makeFont(scene, 'ui');
  makeFont(scene, 'big');
}

/** Для проверки вне игры: рисунок символа в пикселях. */
export function glyphPixels(ch: string, key: FontKey): { row: number; advance: number; art: (string | null)[][] } | null {
  const cell = cellFor(ch);
  if (!cell) return null;
  const bmp = bitmap(cell.rows, FONTS[key].scale, FONTS[key].pen);
  return { row: cell.row * FONTS[key].scale - PAD.top, advance: bmp[0]!.length + FONTS[key].spacing, art: shadeGlyph(bmp, key) };
}
