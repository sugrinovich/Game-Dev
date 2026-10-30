import Phaser from 'phaser';
import { GAME } from '../configs/game';

/*
 * Собственный шрифт «Осады Бездны» — рисуется кодом, файлов нет.
 * ui  — пиксельные капители: строчные буквы — те же заглавные, только ниже, как надписи на щитах и плитах.
 * big — тот же рисунок вдвое крупнее со «срезом широкого пера»: у каждого штриха срезаны
 *       верхний левый и нижний правый углы, как в готическом письме. Надписи (заголовки окон, ленты) — плоские,
 *       чистая светлая сталь клинка: без затемнений, только верх чуть ярче — отблеск света.
 * title — название игры: тот же рисунок, но объёмный — блик по верхним граням и выдавленная на 2 пикселя нижняя грань.
 * ui — плоский, та же чистая сталь, только тёмный контур, без тени. Иногда по надписи пробегает искра (PText.glint).
 * Цвета «запечены» в оттенках серого (тинт текста их умножает), вокруг — тёмный контур.
 * Буква раскрашивается как раньше (градиент, блик, контур — в пикселях игры), а уже готовая цветная буква
 * увеличивается до чёткости игры (GAME.resolution) по правилу Scale2x: полосы металла, блик и контур
 * сохраняют прежнюю толщину, а ступеньки диагоналей и углы сглаживаются.
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

type Art = (string | null)[][];


/**
 * Буква в пикселях холста: раскрашенная в пикселях игры и увеличенная простым удвоением пикселей до чёткости игры.
 * (Сглаживание Scale2x дорисовывало точки на стыках диагоналей — буквы выглядели неровными.)
 */
function hiresArt(art: Art): Art {
  for (let k = 1; k < GAME.resolution; k *= 2) art = art.flatMap((line) => { const row = line.flatMap((p) => [p, p]); return [row, [...row]]; });
  return art;
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

/** Сталь клинка сверху вниз: верх в отблеске света, дальше ровный светлый металл — без тёмных полос. */
const BLADE = ['#ffffff', '#ffffff', '#f3f6f9', '#eef2f6', '#eef2f6', '#eaeff4', '#eaeff4'] as const;

/**
 * Размеры шрифтов: scale — увеличение рисунка, spacing — промежуток между буквами, space — ширина пробела,
 * ramp — оттенки лицевой стороны сверху вниз, bevel — блик по верхним граням штрихов (объём),
 * extrude — глубина выдавленной нижней грани (её оттенки; пусто — буква плоская).
 */
export const FONTS = {
  // в окнах, на кнопках и лентах — чистые ровные буквы без тёмного контура (контур давал «полоски» между буквами)
  ui: { scale: 1, pen: false, bevel: false, outline: false, spacing: 1, space: 3, lineHeight: 12, ramp: BLADE, extrude: [] },
  big: { scale: 2, pen: false, bevel: false, outline: false, spacing: 2, space: 6, lineHeight: 22, ramp: BLADE, extrude: [] },
  title: { scale: 2, pen: false, bevel: true, outline: true, spacing: 2, space: 6, lineHeight: 22, ramp: BLADE, extrude: ['#686868', '#444444'] },
  // надписи прямо на игровом поле (подписи на полу, всплывающие числа, «!») — с контуром, иначе теряются на камне
  world: { scale: 1, pen: false, bevel: false, outline: true, spacing: 1, space: 3, lineHeight: 12, ramp: BLADE, extrude: [] },
  worldBig: { scale: 2, pen: false, bevel: false, outline: true, spacing: 2, space: 6, lineHeight: 22, ramp: BLADE, extrude: [] },
} as const;
/** Контур и тень букв (тинт их почти не меняет — тёмное остаётся тёмным). */
const INK = '#140f1c';
/** Поля вокруг рисунка буквы под контур, тень и выдавленную грань. */
const PAD = { left: 1, top: 1, right: 2 } as const;

/**
 * Объёмная буква: лицевая сторона с градиентом и бликом на верхних гранях штрихов,
 * выдавленная вниз «толщина» (у big), тёмный контур и тень вправо-вниз (у ui).
 */
function shadeGlyph(bmp: boolean[][], key: FontKey): Art {
  const f = FONTS[key];
  const extrude = f.extrude;
  const depth = extrude.length;
  const w = bmp[0]!.length + PAD.left + PAD.right, h = bmp.length + PAD.top + depth + 2;
  const out: (string | null)[][] = Array.from({ length: h }, () => new Array<string | null>(w).fill(null));
  const on = (x: number, y: number): boolean => bmp[y]?.[x] === true;
  bmp.forEach((line, y) => line.forEach((v, x) => {
    if (!v) return;
    const shade = f.ramp[Math.min(f.ramp.length - 1, Math.floor((y / bmp.length) * f.ramp.length))]!;
    out[y + PAD.top]![x + PAD.left] = !on(x, y - 1) && f.bevel ? '#ffffff' : shade;   // блик на верхней грани штриха
    for (let d = 1; d <= depth; d++) if (!on(x, y + d)) {
      const row = out[y + PAD.top + d]!;
      if (row[x + PAD.left] === null) row[x + PAD.left] = extrude[d - 1]!;
    }
  }));
  if (!f.outline) return out;
  // контур вокруг буквы и её «толщины» + тень вправо-вниз
  const solid = out.map((row) => row.map((v) => v !== null));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid[y]![x]) continue;
    const near = solid[y - 1]?.[x] || solid[y + 1]?.[x] || solid[y]![x - 1] || solid[y]![x + 1];
    if (near) out[y]![x] = INK;
  }
  return out;
}
export type FontKey = keyof typeof FONTS;
/**
 * Где внутри строки шрифта нарисованы буквы (пиксели игры от верха строки; измерено по рисункам букв с контуром):
 * top — между верхом заглавных и строчных, bottom — низ букв, center — их середина. По center надпись ставится ровно
 * посередине кнопки, ленты или строки меню (высота строки шрифта больше самих букв).
 */
export const FONT_INK: Record<FontKey, { top: number; bottom: number; center: number }> = {
  // буквы без контура (измерено на экране; bottom — первая строка под буквами): ui — 7 строк, big — 16
  ui: { top: 2, bottom: 9, center: 5.5 },
  big: { top: 4, bottom: 20, center: 12 },
  title: { top: 5, bottom: 21, center: 13 },
  world: { top: 2, bottom: 11, center: 6.5 },
  worldBig: { top: 5, bottom: 20, center: 12.5 },
};

interface CharData {
  x: number; y: number; width: number; height: number; centerX: number; centerY: number;
  xOffset: number; yOffset: number; xAdvance: number; data: object; kerning: object;
  u0: number; v0: number; u1: number; v1: number;
}

/** Рисует глифы в текстуру и регистрирует bitmap-шрифт в кеше Phaser (как если бы он был загружен из файла). */
function makeFont(scene: Phaser.Scene, key: FontKey): void {
  const f = FONTS[key];
  const glyphs = charset().map((ch) => ({ ch, cell: cellFor(ch) })).filter((g): g is { ch: string; cell: Cell } => g.cell !== null);
  const R = GAME.resolution, W = 256 * R, gap = 1;
  // раскладка по строкам атласа
  let x = gap, y = gap, rowH = 0;
  const placed = glyphs.map((g) => {
    const bmp = bitmap(g.cell.rows, f.scale, f.pen);
    const art = hiresArt(shadeGlyph(bmp, key));
    // пустые столбцы по краям рисунка буквы не в счёт: иначе между буквами появляются лишние зазоры
    const cols = bmp[0]!.length, used = (cx: number): boolean => bmp.some((line) => line[cx] === true);
    let lead = 0, trail = 0;
    while (lead < cols - 1 && !used(lead)) lead++;
    while (trail < cols - 1 - lead && !used(cols - 1 - trail)) trail++;
    const w = art[0]!.length, h = art.length, advance = (cols - lead - trail + f.spacing) * R;
    if (x + w + gap > W) { x = gap; y += rowH + gap; rowH = 0; }
    const at = { ...g, art, x, y, w, h, advance, lead };
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
  const add = (code: number, px: number, py: number, w: number, h: number, yOffset: number, advance: number, lead = 0): void => {
    chars[code] = {
      x: px, y: py, width: w, height: h, centerX: Math.floor(w / 2), centerY: Math.floor(h / 2),
      xOffset: -(PAD.left + lead) * GAME.resolution, yOffset, xAdvance: advance, data: {}, kerning: {},
      u0: px / W, v0: 1 - py / H, u1: (px + w) / W, v1: 1 - (py + h) / H,
    };
  };
  for (const p of placed) add(p.ch.charCodeAt(0), p.x, p.y, p.w, p.h, (p.cell.row * f.scale - PAD.top) * R, p.advance, p.lead);
  add(32, 0, 0, 0, 0, 0, (f.space + f.spacing) * R);
  if (scene.cache.bitmapFont.exists(key)) scene.cache.bitmapFont.remove(key);
  // размер шрифта — в пикселях холста; PText просит размер в пикселях игры, и буквы показываются уменьшенными
  scene.cache.bitmapFont.add(key, { data: { font: key, size: f.lineHeight * R, lineHeight: f.lineHeight * R, chars }, texture: texKey, frame: null });
}

/** Создаёт оба шрифта игры. Вызывается один раз при запуске (BootScene). */
export function makePixelFonts(scene: Phaser.Scene): void {
  makeFont(scene, 'ui');
  makeFont(scene, 'big');
  makeFont(scene, 'title');
  makeFont(scene, 'world');
  makeFont(scene, 'worldBig');
}

/** Для проверки вне игры: рисунок символа в пикселях. */
export function glyphPixels(ch: string, key: FontKey): { row: number; advance: number; art: (string | null)[][] } | null {
  const cell = cellFor(ch);
  if (!cell) return null;
  const bmp = bitmap(cell.rows, FONTS[key].scale, FONTS[key].pen), R = GAME.resolution;
  return { row: (cell.row * FONTS[key].scale - PAD.top) * R, advance: (bmp[0]!.length + FONTS[key].spacing) * R, art: hiresArt(shadeGlyph(bmp, key)) };
}
