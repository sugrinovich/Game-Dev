import Phaser from 'phaser';
import { addOutline } from './Volume';

/*
 * Иконки и эмблемы — объёмные, как предметы в локациях. Приём «выпуклой подушки» (emboss):
 * высота фигуры растёт от края к середине, свет сверху-слева — верхние и левые грани светлые,
 * нижние и правые в тени. Поверх — гравировка, камни и блики; вокруг — тёмный контур.
 */

type Ctx = CanvasRenderingContext2D;
type Inside = (x: number, y: number) => boolean;
/** Оттенки от самого тёмного к самому светлому (или выбор оттенков по точке). */
type Ramp = readonly string[] | ((x: number, y: number) => readonly string[]);

function px(c: Ctx, color: string, x: number, y: number): void { c.fillStyle = color; c.fillRect(x, y, 1, 1); }

/** Точка внутри многоугольника (по центру пикселя). */
export function inPoly(points: readonly (readonly [number, number])[]): Inside {
  return (x, y) => {
    const X = x + 0.5, Y = y + 0.5;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
      if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
/** Точка внутри круга. */
export function inCircle(cx: number, cy: number, r: number): Inside { return (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r; }
/** Точка у отрезка (толстая линия: клинок, рукоять). */
export function nearSegment(x0: number, y0: number, x1: number, y1: number, half: number): Inside {
  return (x, y) => {
    const X = x + 0.5, Y = y + 0.5, dx = x1 - x0, dy = y1 - y0;
    const t = Phaser.Math.Clamp(((X - x0) * dx + (Y - y0) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(X - (x0 + dx * t), Y - (y0 + dy * t)) <= half;
  };
}

/**
 * Выпуклая заливка фигуры в прямоугольнике w x h: depth — на сколько пикселей от края фигура «поднимается».
 * Свет сверху-слева: грань, где высота растёт вправо-вниз, обращена к свету — она светлее.
 */
export function emboss(c: Ctx, w: number, h: number, inside: Inside, ramp: Ramp, depth = 3): void {
  const dist = new Float32Array(w * h).fill(0);
  const queue: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!inside(x, y)) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    dist[i] = edge ? 1 : Infinity;
    if (edge) queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j]! > dist[i]! + 1) { dist[j] = dist[i]! + 1; queue.push(j); }
    }
  }
  const H = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : Math.min(dist[y * w + x]!, depth) / depth);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (dist[y * w + x] === 0) continue;
    const gx = H(x + 1, y) - H(x - 1, y), gy = H(x, y + 1) - H(x, y - 1);
    const light = 0.55 + (gx + gy) * 0.9 - (y / h - 0.5) * 0.25;
    const r = typeof ramp === 'function' ? ramp(x, y) : ramp;
    px(c, r[Phaser.Math.Clamp(Math.round(light * (r.length - 1)), 0, r.length - 1)]!, x, y);
  }
}

/** Палитры материалов: от тени к блику. */
export const MATERIAL = {
  gold: ['#3a2408', '#6a4410', '#9a6a1a', '#c8942a', '#e8bc40', '#ffe070', '#fff8d0'],
  steel: ['#22283a', '#3e4658', '#646e82', '#929cae', '#c2cad6', '#e8eef4', '#ffffff'],
  ruby: ['#3a0812', '#6a1222', '#981c34', '#c42a48', '#e84a66', '#ff8aa0', '#ffd0d8'],
  glass: ['#2a3440', '#4a5a6a', '#7a90a0', '#a8c0cc', '#d8eaf2', '#ffffff'],
  leather: ['#2a160c', '#4a2a16', '#6a4226', '#8a5a34', '#b07a48', '#d09a64'],
  feather: ['#4a5a7a', '#7a90b0', '#b0c8e0', '#e0eef8', '#ffffff'],
  navy: ['#0e1430', '#18224a', '#243468', '#34488a', '#4a62aa', '#7a92d0'],
  cloth: ['#2a0610', '#4a0c1a', '#701428', '#962038', '#b8304a', '#e05a70'],
  cork: ['#3a2414', '#6a4426', '#9a6a3a', '#c8945a'],
} as const;

// ---------------- иконки 16x16 ----------------
function paintHeart(c: Ctx): void {
  // рубиновое сердце: два круга-«лопасти» и острый низ
  const left = inCircle(5.2, 6, 3.6), right = inCircle(10.8, 6, 3.6), tip = inPoly([[1.6, 6.5], [14.4, 6.5], [8, 14.8]]);
  emboss(c, 16, 16, (x, y) => left(x, y) || right(x, y) || tip(x, y), MATERIAL.ruby, 4);
  px(c, '#ffffff', 4, 4); px(c, '#ffe0e8', 5, 3); px(c, '#ffe0e8', 3, 5); px(c, '#ffd0d8', 10, 4);
}

function paintPotion(c: Ctx): void {
  const bulb = inCircle(8, 10.5, 5.6), neck = inPoly([[6, 2], [10, 2], [10, 6], [6, 6]]);
  emboss(c, 16, 16, (x, y) => bulb(x, y) || neck(x, y), MATERIAL.glass, 2);
  const liquid = inCircle(8, 10.5, 4.6);
  emboss(c, 16, 16, (x, y) => liquid(x, y) && y >= 9, MATERIAL.ruby, 3);
  for (let x = 4; x <= 11; x++) if (liquid(x, 9)) px(c, '#ff9aac', x, 9);
  emboss(c, 16, 16, inPoly([[5, 0], [11, 0], [11, 3], [5, 3]]), MATERIAL.cork, 2);
  px(c, '#ffffff', 5, 8); px(c, '#ffffff', 5, 9); px(c, '#ffd0d8', 7, 13); px(c, '#ffd0d8', 10, 11);
}

function paintCoin(c: Ctx): void {
  emboss(c, 16, 16, inCircle(8, 8, 7.2), MATERIAL.gold, 3);
  // чеканка: кольцо и выпуклый крест
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (d > 4.8 && d < 5.6) px(c, x + y < 16 ? '#9a6a1a' : '#fff0a0', x, y);
  }
  for (let i = 5; i <= 10; i++) { px(c, '#fff4c0', 7, i); px(c, '#fff4c0', i, 7); px(c, '#8a5a18', 8, i); px(c, '#8a5a18', i, 8); }
  px(c, '#ffffff', 4, 3); px(c, '#ffffff', 3, 4);
}

function paintDash(c: Ctx): void {
  emboss(c, 16, 16, inPoly([[3, 5], [8, 5], [8, 11], [13, 11], [15, 13], [15, 15], [2, 15], [2, 12], [3, 11]]), MATERIAL.leather, 2);
  for (let x = 2; x <= 14; x++) px(c, '#1a0e08', x, 15);
  for (let x = 3; x <= 7; x++) px(c, x % 2 ? '#f2d060' : '#c8942a', x, 6);
  emboss(c, 16, 16, inPoly([[8, 7], [15, 1], [14, 5], [16, 5], [12, 8], [14, 9], [9, 10]]), MATERIAL.feather, 2);
  for (const [x, y] of [[11, 4], [12, 6], [11, 8]] as const) px(c, '#7a90b0', x, y);
}

function paintSword(c: Ctx): void {
  emboss(c, 16, 16, nearSegment(5.5, 10.5, 14.5, 1.5, 1.3), MATERIAL.steel, 2);
  for (let i = 0; i < 7; i++) px(c, '#ffffff', 8 + i, 7 - i);
  emboss(c, 16, 16, nearSegment(3, 8.5, 7.5, 13, 1.1), MATERIAL.gold, 2);
  emboss(c, 16, 16, nearSegment(2, 14, 4.5, 11.5, 1), MATERIAL.leather, 1);
  emboss(c, 16, 16, inCircle(1.8, 14.2, 1.6), MATERIAL.ruby, 1);
  px(c, '#ffffff', 1, 13);
}

function paintArmor(c: Ctx): void {
  emboss(c, 16, 16, inPoly([[3, 2], [6, 1], [10, 1], [13, 2], [16, 6], [13, 8], [13, 16], [3, 16], [3, 8], [0, 6]]), MATERIAL.steel, 3);
  for (let y = 4; y < 15; y += 2) for (let x = 4 + (y % 4 === 0 ? 1 : 0); x < 13; x += 2) px(c, '#3e4658', x, y);
  for (let x = 5; x <= 10; x++) px(c, x % 2 ? '#f2d060' : '#c8942a', x, 2);
  for (let x = 3; x <= 12; x++) px(c, '#6a4226', x, 11);
  px(c, '#f2d060', 8, 11); px(c, '#ffffff', 4, 4);
}

function paintSatchel(c: Ctx): void {
  emboss(c, 16, 16, (x, y) => ((x + 0.5 - 8) / 6.4) ** 2 + ((y + 0.5 - 10.5) / 5) ** 2 <= 1 || inPoly([[5, 3], [11, 3], [10, 6], [6, 6]])(x, y), MATERIAL.leather, 3);
  for (let x = 4; x <= 11; x++) px(c, '#2a160c', x, 6);
  emboss(c, 16, 16, inCircle(8, 10, 2.2), MATERIAL.gold, 1);
  px(c, '#fff8d0', 7, 9); px(c, '#d09a64', 4, 8); px(c, '#d09a64', 5, 7);
  for (const x of [6, 10]) { px(c, '#c8942a', x, 2); px(c, '#c8942a', x, 1); }
}

/** Герб ордена 52x40: щит на скрещённых мечах, корона с камнями. */
export function paintCrest(c: Ctx): void {
  const W = 52, H = 40;
  emboss(c, W, H, (x, y) => nearSegment(8, 36, 45, 5, 1.6)(x, y) || nearSegment(44, 36, 7, 5, 1.6)(x, y), MATERIAL.steel, 2);
  for (const [x0, y0, x1, y1] of [[6, 31, 12, 37], [46, 31, 40, 37]] as const) emboss(c, W, H, nearSegment(x0, y0, x1, y1, 1.3), MATERIAL.gold, 2);
  for (const [cx, cy] of [[5, 38], [47, 38]] as const) emboss(c, W, H, inCircle(cx, cy, 1.8), MATERIAL.ruby, 1);
  const shield = inPoly([[13, 5], [39, 5], [39, 23], [26, 38], [13, 23]]);
  const field = inPoly([[15, 7], [37, 7], [37, 22], [26, 35], [15, 22]]);
  emboss(c, W, H, shield, MATERIAL.gold, 2);
  emboss(c, W, H, field, (x) => (x < 26 ? MATERIAL.cloth : MATERIAL.navy), 4);
  emboss(c, W, H, (x, y) => field(x, y) && ((x >= 25 && x <= 26) || (y >= 13 && y <= 14)), MATERIAL.gold, 1);
  emboss(c, W, H, inPoly([[19, 5], [19, 0], [22, 3], [26, 0], [30, 3], [33, 0], [33, 5]]), MATERIAL.gold, 2);
  for (const [x, col] of [[22, '#e84a66'], [26, '#5fe0d4'], [30, '#e84a66']] as const) { px(c, col, x, 3); px(c, '#ffffff', x, 2); }
  px(c, '#ffffff', 16, 8); px(c, '#ffffff', 17, 8); px(c, '#ffffff', 16, 9);
}

/** Холст → рисунок → контур → текстура. */
function iconTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext(); c.imageSmoothingEnabled = false;
  paint(c);
  addOutline(c, w, h, w, h);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Герб для заставки (рисуется сразу — он нужен уже экрану загрузки). */
export function makeCrestTexture(scene: Phaser.Scene): void {
  if (!scene.textures.exists('title_crest')) iconTexture(scene, 'title_crest', 52, 40, paintCrest);
}

/** Иконки интерфейса и лавки — по заданию на иконку. */
export function iconTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const icons: [string, (c: Ctx) => void][] = [
    ['ui_heart', paintHeart], ['ui_potion', paintPotion], ['ui_dash', paintDash],
    ['castle_coin', paintCoin], ['castle_sword', paintSword], ['castle_armor', paintArmor],
    ['castle_satchel', paintSatchel], ['castle_potion', paintPotion],
  ];
  return icons.map(([key, paint]) => () => iconTexture(scene, key, 16, 16, paint));
}
