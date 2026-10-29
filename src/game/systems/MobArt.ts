import Phaser from 'phaser';
import { ellipse, px, rect, sheet, sheetJobs } from './CastleArt';

/*
 * Эффекты ударов и огненный шар Короля Бездны — всё рисуется кодом, файлов нет.
 * Сами враги (скелеты, орки, огры, Король) — куклы в 8 сторон из HeroArt.ts.
 */

const TAU = Math.PI * 2;

/** Точка вращения взмаха клинка: от неё дуга расходится вперёд. */
export const SLASH_ORIGIN = { x: 6 / 48, y: 0.5 } as const;


/** Заливка по формуле, полосками одного цвета (быстрее, чем по пикселю). */
function fill(c: CanvasRenderingContext2D, w: number, h: number, color: (x: number, y: number) => string): void {
  for (let y = 0; y < h; y++) {
    let x0 = 0, cur = color(0, y);
    for (let x = 1; x <= w; x++) {
      const next = x < w ? color(x, y) : '#';
      if (next !== cur) { if (cur) rect(c, cur, x0, y, x - x0, 1); x0 = x; cur = next; }
    }
  }
}




/** Дуга удара клинком: нарастает за 3 кадра и гаснет. Без контура — это свет. */
function paintSlash(c: CanvasRenderingContext2D, f: number): void {
  const a0 = -1.2, a1 = 1.2, ox = 6, oy = 16;
  const span = a0 + (a1 - a0) * Math.min(1, (f + 1) / 3);
  const fade = f >= 3 ? f - 2 : 0;
  fill(c, 48, 32, (x, y) => {
    const dx = x - ox, dy = y - oy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (a < a0 || a > span) return '';
    const u = (a - a0) / (a1 - a0);
    const thick = (6 - fade * 2) * Math.sin(Math.PI * u);
    const outer = 26 - fade;
    if (r > outer || r < outer - thick) return '';
    const k = (outer - r) / Math.max(1, thick);
    return fade > 1 ? '#8ac8ff' : k < 0.3 ? '#ffffff' : k < 0.7 ? '#d8f0ff' : '#8ac8ff';
  });
}

function paintSpark(c: CanvasRenderingContext2D, f: number): void {
  const long = [6, 5, 3, 1][f] ?? 1, short = [4, 3, 2, 0][f] ?? 0;
  const core = f < 2 ? '#ffffff' : f < 3 ? '#fff0a0' : '#ffb040';
  for (let i = -long; i <= long; i++) { px(c, i === 0 ? core : '#fff0a0', 8 + i, 8); px(c, '#fff0a0', 8, 8 + i); }
  for (let i = 1; i <= short; i++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) px(c, '#ffd070', 8 + sx * i, 8 + sy * i);
}

function paintDust(c: CanvasRenderingContext2D, f: number): void {
  const a = ['dd', 'b0', '80', '40'][f] ?? '40';
  for (const [x, y, r] of [[5, 8, 2], [10, 8, 2], [8, 6, 2]] as const) ellipse(c, `#b8a890${a}`, x + (x < 8 ? -f : x > 8 ? f : 0), y - Math.floor(f / 2), r + Math.floor(f / 2), Math.max(1, r - 1 + Math.floor(f / 3)));
}

function paintPoof(c: CanvasRenderingContext2D, f: number): void {
  const a = ['ff', 'e0', 'b0', '70', '30'][f] ?? '30';
  const r = 3 + f * 2;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + 0.3;
    ellipse(c, `#e8e4f0${a}`, 12 + Math.round(Math.cos(ang) * r), 12 + Math.round(Math.sin(ang) * r * 0.8), 3 - Math.floor(f / 3), 2);
  }
  if (f < 2) ellipse(c, '#ffffff', 12, 12, 3 - f, 3 - f);
}

/** Огненный шар Короля Бездны (нужен уже заставке на экране загрузки); повторный вызов ничего не делает. */
export function makeFireballSheet(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fireball')) sheet(scene, 'fireball', 40, 40, 8, 18, paintFireball, false);
}

/** Эффекты ударов и иконки интерфейса — экран загрузки выполняет задания понемногу. */
export function effectTextureJobs(scene: Phaser.Scene): (() => void)[] {
  return [
    ...sheetJobs(scene, 'slash', 48, 32, 5, 26, paintSlash, false, 0),
    ...sheetJobs(scene, 'spark', 16, 16, 4, 22, paintSpark, false, 0),
    ...sheetJobs(scene, 'dust', 16, 12, 4, 14, paintDust, false, 0),
    ...sheetJobs(scene, 'poof', 24, 24, 5, 14, paintPoof, false, 0),
  ];
}

/** Огненный шар: клубящийся край, белое ядро. Без контура и светотени — это свет. */
function paintFireball(c: CanvasRenderingContext2D, f: number): void {
  const t = (f / 8) * TAU;
  const color = (x: number, y: number): string => {
    const dx = x - 20, dy = y - 20, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const edge = 15 + 1.5 * Math.sin(a * 5 + t) + 1.2 * Math.sin(a * 9 - t * 2);
    if (r >= edge) return '';
    const k = r / edge;
    return k < 0.35 ? '#fffbe0' : k < 0.55 ? '#ffe070' : k < 0.75 ? '#ffa030' : k < 0.9 ? '#f05a1e' : '#b02a14';
  };
  for (let y = 0; y < 40; y++) {
    let x0 = 0, cur = color(0, y);
    for (let x = 1; x <= 40; x++) {
      const next = x < 40 ? color(x, y) : '#';
      if (next !== cur) { if (cur) rect(c, cur, x0, y, x - x0, 1); x0 = x; cur = next; }
    }
  }
}
