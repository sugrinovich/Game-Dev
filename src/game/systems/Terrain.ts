import Phaser from 'phaser';
import type { Point } from '../types';

/** Генератор случайных чисел с seed: одна и та же карта по одному и тому же числу. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }

export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x: number, y: number, seed: number): number {
  return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 11) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 23) * 0.12;
}

export interface Ellipse { x: number; y: number; rx: number; ry: number }
export interface PathSpec { points: Point[]; width: number }

/** Цвета местности. Новая локация = новая тема. */
export interface Theme {
  grass: number[]; moss: number[]; dirt: number[]; plaza: number[]; water: number[]; mud: number[]; rune: number;
}

export const THEMES: Record<string, Theme> = {
  hollow: {
    grass: [0x35553a, 0x426a3f, 0x517f46, 0x659550],
    moss: [0x2c4a3a, 0x376048, 0x45765a],
    dirt: [0x5a4330, 0x70543a, 0x886a48, 0xa08258],
    plaza: [0x4d4a58, 0x625f70, 0x77748a],
    water: [0x234a63, 0x2d6280, 0x3f7f9c, 0x7ab8cc],
    mud: [0x4a3a2c, 0x5c4a38],
    rune: 0x5fe0d4,
  },
};

export interface TerrainSpec {
  width: number; height: number; seed: number; theme: Theme;
  ponds?: Ellipse[]; paths?: PathSpec[]; clearings?: Ellipse[]; plazas?: Ellipse[];
  rune?: { x: number; y: number; r: number };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function segDist(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Phaser.Math.Clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

/** Поле местности: вода, тропы, поляны. Рисуется пиксель в пиксель (без тайлов). */
export class Terrain {
  constructor(readonly spec: TerrainSpec) {}

  /** >0 — внутри водоёма (чем больше, тем глубже). */
  water(x: number, y: number): number {
    let best = -9;
    for (const p of this.spec.ponds ?? []) {
      const d = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry) + (fbm(x / 14, y / 14, this.spec.seed + 5) - 0.5) * 0.42;
      best = Math.max(best, 1 - d);
    }
    return best;
  }

  /** >0 — на тропе (расстояние до края). */
  path(x: number, y: number): number {
    let best = -99;
    for (const p of this.spec.paths ?? []) {
      let d = 1e9;
      for (let i = 0; i < p.points.length - 1; i++) d = Math.min(d, segDist(x, y, p.points[i]!, p.points[i + 1]!));
      best = Math.max(best, p.width / 2 + (fbm(x / 9, y / 9, this.spec.seed + 9) - 0.5) * 5 - d);
    }
    return best;
  }

  clearing(x: number, y: number, list: Ellipse[] | undefined): number {
    let best = -9;
    for (const c of list ?? []) {
      const d = Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry) + (fbm(x / 12, y / 12, this.spec.seed + 3) - 0.5) * 0.25;
      best = Math.max(best, 1 - d);
    }
    return best;
  }

  isBlocked(x: number, y: number): boolean {
    if (x < 4 || y < 4 || x > this.spec.width - 4 || y > this.spec.height - 4) return true;
    return this.water(x, y) > 0.06;
  }

  /** Тип клетки для миникарты: 0 трава, 1 тропа, 2 вода, 3 поляна. */
  kindAt(x: number, y: number): number {
    if (this.water(x, y) > 0.02) return 2;
    if (this.path(x, y) > 0) return 1;
    if (this.clearing(x, y, this.spec.clearings) > 0 || this.clearing(x, y, this.spec.plazas) > 0) return 3;
    return 0;
  }

  paint(scene: Phaser.Scene, key: string): void {
    const { width: W, height: H, theme: T, seed } = this.spec;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, W, H);
    if (!tex) throw new Error('Не удалось создать текстуру местности');
    const ctx = tex.getContext();
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const put = (i: number, c: number): void => {
      data[i] = (c >> 16) & 255; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
    };
    const pick = (pal: number[], v: number, bx: number, by: number, dither = 0.18): number => {
      const k = v + ((BAYER[(by & 3) * 4 + (bx & 3)]! / 16) - 0.5) * dither;
      return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(k * pal.length)))]!;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const h = hash2(x, y, seed);
        const w = this.water(x, y);
        let c: number;
        if (w > 0) {
          const v = Math.min(0.99, w * 1.25);
          c = w < 0.1 ? T.water[3]! : pick(T.water, 0.15 + v * 0.55, x, y, 0.4);
          if (w < 0.1 && (x + y) % 2) c = T.water[2]!;
          if (hash2(x, y, seed + 31) < 0.006 || hash2(x - 1, y, seed + 31) < 0.006 || hash2(x - 2, y, seed + 31) < 0.006) c = T.water[3]!;
        } else if (w > -0.16) {
          c = w > -0.07 ? T.mud[0]! : T.mud[1]!;
          if (h < 0.1) c = T.dirt[0]!;
        } else {
          const p = this.path(x, y);
          const pl = this.clearing(x, y, this.spec.plazas);
          const cl = this.clearing(x, y, this.spec.clearings);
          if (pl > 0) {
            // булыжная площадка: камни 5x4 со швами
            const row = Math.floor(y / 4);
            const cx = x + (row % 2) * 3;
            const seam = y % 4 === 3 || cx % 6 === 5;
            const n = hash2(Math.floor(cx / 6), row, seed + 2);
            c = seam ? T.plaza[0]! : (n < 0.34 ? T.plaza[1]! : n < 0.8 ? T.plaza[2]! : T.plaza[1]!);
            if (!seam && (cx % 6 === 0 || y % 4 === 0)) c = T.plaza[2]!;
            if (pl < 0.08) c = T.plaza[0]!;
          } else if (p > 0 || cl > 0) {
            const edge = Math.min(p > 0 ? p : 9, cl > 0 ? cl * 14 : 9);
            const n = fbm(x / 9, y / 9, seed + 4);
            c = pick(T.dirt, 0.25 + n * 0.6, x, y, 0.3);
            if (edge < 1.6) c = T.dirt[0]!;
            else if (edge < 2.8 && h < 0.5) c = T.dirt[1]!;
            if (h < 0.018) c = 0x9c9aa8;
            else if (h > 0.985) c = T.dirt[3]!;
          } else {
            const n = fbm(x / 26, y / 26, seed);
            const mossy = fbm(x / 44 + 90, y / 44 + 40, seed + 17) > 0.6;
            c = mossy ? pick(T.moss, n, x, y) : pick(T.grass, 0.1 + n * 0.85, x, y);
            if (h < 0.035) c = T.grass[0]!;
            else if (h < 0.06) c = T.grass[3]!;
            else if (h > 0.9992) c = 0xf2e6c0;
            else if (h > 0.9985) c = 0xe8b84a;
            // трава «кустится» у края тропы
            if (p > -2.5 && p <= 0 && h < 0.45) c = T.grass[2]!;
          }
        }
        put(i, c);
      }
    }
    const rn = this.spec.rune;
    if (rn) {
      for (let y = Math.max(0, rn.y - rn.r - 4); y < Math.min(H, rn.y + rn.r + 4); y++) {
        for (let x = Math.max(0, rn.x - rn.r - 4); x < Math.min(W, rn.x + rn.r + 4); x++) {
          const d = Math.hypot(x - rn.x, y - rn.y);
          const a = Math.atan2(y - rn.y, x - rn.x);
          const ring = Math.abs(d - rn.r) < 1.2 || Math.abs(d - (rn.r - 8)) < 0.7;
          const tick = d > rn.r - 8 && d < rn.r && Math.abs(Math.sin(a * 4)) > 0.985;
          const dark = d < rn.r - 8 && fbm(x / 6, y / 6, seed + 70) > 0.55 && ((x + y) & 1) === 0;
          if (ring || tick) put((y * W + x) * 4, T.rune);
          else if (d < rn.r - 1.5 && dark) put((y * W + x) * 4, 0x2a2a3c);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }
}
