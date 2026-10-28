import Phaser from 'phaser';
import { hash2 } from './Terrain';

export type CastleTheme = 'hall' | 'courtyard' | 'crypt' | 'forge';
export const CASTLE_BOUNDS = { side: 28, top: 88, bottom: 24 } as const;
const PALETTES = {
  hall: { floor: ['#424956', '#48505e', '#4e5663'], wall: '#343b49', trim: '#bd9856', cloth: '#762e40', light: '#97b7d1' },
  courtyard: { floor: ['#605f59', '#69685f', '#727066'], wall: '#494c50', trim: '#bd9856', cloth: '#354f68', light: '#9dbbce' },
  crypt: { floor: ['#343e4b', '#394554', '#414d5b'], wall: '#292f40', trim: '#8499b5', cloth: '#3d3a69', light: '#74b8ca' },
  forge: { floor: ['#4c3e40', '#544447', '#5e4a48'], wall: '#382e36', trim: '#c58b4e', cloth: '#7a3033', light: '#e7935a' },
} as const;

type Paint = (ctx: CanvasRenderingContext2D) => void;
function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function poly(c: CanvasRenderingContext2D, color: string, points: number[][]): void {
  c.fillStyle = color; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x!, y!) : c.moveTo(x!, y!));
  c.closePath(); c.fill();
}
function texture(scene: Phaser.Scene, key: string, w: number, h: number, paint: Paint): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext(); ctx.imageSmoothingEnabled = false;
  paint(ctx); tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
function shield(c: CanvasRenderingContext2D, x: number, y: number, color = '#823749'): void {
  poly(c, '#d6b66d', [[x, y], [x + 18, y], [x + 18, y + 14], [x + 9, y + 22], [x, y + 14]]);
  poly(c, color, [[x + 2, y + 2], [x + 16, y + 2], [x + 16, y + 13], [x + 9, y + 19], [x + 2, y + 13]]);
  rect(c, '#e8d29b', x + 8, y + 4, 2, 12); rect(c, '#e8d29b', x + 4, y + 7, 10, 2);
}
function table(c: CanvasRenderingContext2D): void {
  rect(c, '#171c27', 4, 34, 58, 27); rect(c, '#4b3431', 8, 40, 6, 19); rect(c, '#4b3431', 50, 40, 6, 19);
  rect(c, '#72513c', 4, 33, 58, 12); rect(c, '#b58655', 4, 33, 58, 3);
  for (let x = 8; x < 60; x += 13) rect(c, '#503a30', x, 37, 1, 7);
  rect(c, '#c4a265', 9, 43, 4, 2); rect(c, '#c4a265', 53, 43, 4, 2);
}

/** Небольшие пиксельные объекты рисуются один раз при загрузке. */
export function makeCastleTextures(scene: Phaser.Scene): void {
  texture(scene, 'castle_banner', 30, 58, (c) => {
    rect(c, '#161c27', 2, 2, 27, 4); rect(c, '#d5b16a', 1, 1, 28, 2);
    poly(c, '#5c2739', [[5, 4], [25, 4], [25, 48], [15, 57], [5, 48]]);
    rect(c, '#984359', 7, 4, 3, 42); rect(c, '#bd9856', 23, 4, 1, 44); shield(c, 6, 16);
  });
  texture(scene, 'castle_pillar', 36, 78, (c) => {
    rect(c, '#161c27', 3, 4, 30, 74); rect(c, '#46505f', 8, 9, 20, 60);
    rect(c, '#87909b', 9, 10, 5, 58); rect(c, '#626e7d', 15, 10, 7, 58);
    for (const y of [4, 12, 65, 71]) { rect(c, '#697484', 4, y, 28, 5); rect(c, '#a7a7a1', 4, y, 28, 1); }
    rect(c, '#ac8d53', 8, 18, 20, 2); rect(c, '#262e3b', 24, 21, 2, 42);
  });
  texture(scene, 'castle_gate', 88, 86, (c) => {
    poly(c, '#171e2b', [[2, 84], [2, 25], [18, 8], [44, 0], [70, 8], [86, 25], [86, 84]]);
    poly(c, '#6e7885', [[6, 84], [6, 26], [22, 12], [44, 5], [66, 12], [82, 26], [82, 84]]);
    poly(c, '#131c2b', [[20, 84], [20, 30], [30, 22], [44, 17], [58, 22], [68, 30], [68, 84]]);
    rect(c, '#202e42', 25, 37, 38, 47); rect(c, '#38465a', 30, 45, 28, 38);
    for (const x of [27, 36, 45, 54, 63]) { rect(c, '#a5a49a', x, 30, 2, 18); poly(c, '#a5a49a', [[x, 48], [x + 2, 48], [x + 1, 54]]); }
    for (let y = 30; y < 80; y += 12) { rect(c, '#343d4c', 6, y, 14, 2); rect(c, '#343d4c', 68, y, 14, 2); }
    rect(c, '#d2ae65', 37, 6, 14, 7); rect(c, '#92989c', 2, 80, 84, 4);
  });
  texture(scene, 'castle_brazier', 38, 44, (c) => {
    rect(c, '#1b202b', 7, 39, 24, 4); rect(c, '#9d865e', 10, 37, 18, 3);
    rect(c, '#555567', 16, 24, 6, 13);
    poly(c, '#bd9856', [[4, 22], [34, 22], [28, 31], [10, 31]]);
    poly(c, '#e67c39', [[8, 21], [10, 9], [15, 15], [20, 1], [23, 14], [29, 8], [30, 21]]);
    poly(c, '#ffda79', [[13, 22], [16, 14], [19, 19], [23, 10], [26, 22]]);
    rect(c, '#f1e4ad', 18, 19, 6, 4); rect(c, '#e0bf7a', 5, 23, 28, 2);
  });
  texture(scene, 'castle_workshop', 68, 66, (c) => {
    rect(c, '#322b2d', 8, 5, 51, 32); rect(c, '#9c7453', 8, 5, 51, 3);
    for (let x = 15; x <= 49; x += 17) { rect(c, '#c3cdd2', x, 9, 3, 26); rect(c, '#e6e6d8', x, 9, 1, 24); rect(c, '#d6b66d', x - 4, 27, 11, 3); rect(c, '#7d5241', x, 30, 3, 6); }
    table(c); poly(c, '#98a3ae', [[17, 29], [45, 29], [51, 24], [51, 32], [39, 37], [38, 41], [21, 41], [24, 36]]);
    rect(c, '#465264', 25, 35, 12, 4); rect(c, '#dfd9bd', 17, 29, 28, 2);
  });
  texture(scene, 'castle_hut', 68, 66, (c) => {
    rect(c, '#6d4e3a', 6, 19, 55, 43); rect(c, '#b08c59', 6, 19, 55, 3);
    rect(c, '#a4a99e', 11, 25, 44, 28); rect(c, '#e0d5b8', 13, 27, 16, 8);
    rect(c, '#752e41', 12, 37, 44, 19); rect(c, '#ae625e', 12, 37, 44, 3);
    rect(c, '#d5b16a', 48, 40, 2, 15); rect(c, '#3e2b29', 8, 55, 52, 5); shield(c, 26, 0);
  });
  texture(scene, 'castle_storage', 68, 66, (c) => {
    rect(c, '#222633', 8, 16, 53, 43); rect(c, '#855b3c', 10, 20, 48, 35);
    poly(c, '#b38a55', [[10, 20], [18, 12], [49, 12], [58, 20], [58, 32], [10, 32]]);
    rect(c, '#45383a', 10, 32, 48, 3);
    for (const x of [17, 47]) { rect(c, '#b6b3a0', x, 17, 4, 37); rect(c, '#e1d2a1', x, 18, 1, 34); }
    rect(c, '#d7b461', 30, 29, 9, 10); rect(c, '#3e3031', 34, 33, 2, 4);
    for (const x of [15, 23, 43]) { rect(c, '#bd8d38', x, 57, 8, 4); rect(c, '#f4d578', x, 56, 7, 2); }
  });
  texture(scene, 'castle_garden', 68, 66, (c) => {
    table(c); rect(c, '#394536', 5, 4, 58, 4);
    for (const [x, col] of [[13, '#d57882'], [30, '#85b5b3'], [48, '#a5b67b']] as const) {
      rect(c, '#d0b99a', x + 3, 12, 5, 4); rect(c, '#8d9b9f', x + 2, 16, 7, 5);
      rect(c, col, x, 21, 11, 12); rect(c, '#d6e5d0', x + 2, 22, 2, 6);
      rect(c, '#817c42', x + 4, 6, 2, 3);
    }
    rect(c, '#e0c797', 24, 36, 20, 4); rect(c, '#7a5845', 34, 36, 1, 4);
  });
  texture(scene, 'castle_merchant', 68, 68, (c) => {
    poly(c, '#3b6874', [[23, 10], [31, 3], [42, 7], [46, 20], [42, 37], [20, 37]]);
    rect(c, '#d9ad82', 28, 12, 12, 14); rect(c, '#272838', 30, 16, 2, 2); rect(c, '#272838', 37, 16, 2, 2);
    rect(c, '#cfbea0', 29, 23, 10, 5); rect(c, '#bf9a60', 22, 29, 3, 10);
    table(c); rect(c, '#335868', 18, 37, 31, 16); shield(c, 25, 37, '#335868');
    for (const x of [9, 48, 53]) { rect(c, '#dca943', x, 29, 5, 4); rect(c, '#f3d78d', x, 29, 5, 1); }
  });
  texture(scene, 'castle_crate', 28, 28, (c) => {
    rect(c, '#24232c', 1, 1, 26, 26); rect(c, '#80573b', 3, 3, 22, 22);
    for (const x of [3, 12, 22]) rect(c, '#bd8e59', x, 3, 3, 22);
    for (const y of [3, 22]) rect(c, '#ba8b58', 3, y, 22, 3);
    for (const x of [5, 22]) for (const y of [5, 22]) rect(c, '#34333e', x, y, 1, 1);
  });
  texture(scene, 'castle_supplies', 26, 24, (c) => {
    poly(c, '#b19c73', [[9, 4], [18, 4], [23, 15], [22, 22], [4, 22], [3, 15]]);
    rect(c, '#5b4436', 9, 5, 9, 2); rect(c, '#d5be8e', 6, 12, 3, 8);
    rect(c, '#7e9a68', 12, 1, 7, 3); rect(c, '#cc7181', 17, 14, 4, 4);
  });
  texture(scene, 'castle_coin', 16, 16, (c) => {
    poly(c, '#9d6b30', [[5, 1], [11, 1], [15, 5], [15, 11], [11, 15], [5, 15], [1, 11], [1, 5]]);
    rect(c, '#e4b650', 4, 3, 9, 10); rect(c, '#ffe1a0', 4, 3, 8, 2); rect(c, '#b67f32', 7, 6, 3, 6); rect(c, '#ffe1a0', 7, 5, 2, 6);
  });
  texture(scene, 'castle_sword', 16, 16, (c) => {
    poly(c, '#d2d9d6', [[10, 1], [14, 1], [14, 5], [6, 13], [3, 10]]);
    rect(c, '#6f8498', 7, 7, 3, 3); poly(c, '#d4af62', [[2, 8], [8, 14], [10, 12], [4, 6]]); rect(c, '#794f37', 2, 12, 3, 3);
  });
  texture(scene, 'castle_armor', 16, 16, (c) => {
    poly(c, '#a4b3c4', [[2, 3], [6, 1], [10, 1], [14, 3], [15, 7], [12, 8], [12, 15], [4, 15], [4, 8], [1, 7]]);
    rect(c, '#52627c', 7, 2, 3, 12); rect(c, '#e0cf95', 4, 10, 8, 2);
  });
  texture(scene, 'castle_satchel', 16, 16, (c) => {
    rect(c, '#d3a575', 5, 1, 7, 4); rect(c, '#684633', 2, 4, 13, 11); rect(c, '#ad774b', 3, 4, 11, 7); rect(c, '#d5b16a', 7, 9, 4, 3);
  });
  texture(scene, 'castle_potion', 16, 16, (c) => {
    rect(c, '#b99465', 6, 0, 5, 3); rect(c, '#c9d5d3', 5, 3, 7, 4); rect(c, '#71869b', 3, 7, 11, 8); rect(c, '#b74460', 4, 9, 9, 5); rect(c, '#f5c5bb', 5, 7, 2, 5);
  });
}

/** Каменная кладка, окна и ковёр: одна готовая текстура, без объектов на каждый тайл. */
export function paintCastleGround(scene: Phaser.Scene, key: string, w: number, h: number, theme: CastleTheme): void {
  const p = PALETTES[theme];
  texture(scene, key, w, h, (c) => {
    rect(c, '#151b27', 0, 0, w, h);
    for (let y = 80; y < h - 16; y += 16) for (let x = 16; x < w - 16; x += 32) {
      const shift = (Math.floor(y / 16) % 2) * 16;
      const tone = Math.floor(hash2(x, y, 73) * p.floor.length);
      rect(c, p.floor[tone]!, x - shift, y, 31, 15);
      rect(c, '#ffffff0b', x - shift, y, 30, 1);
      if (hash2(x, y, 91) > 0.65) { rect(c, '#20273655', x + 10 - shift, y + 6, 5, 1); rect(c, '#20273655', x + 15 - shift, y + 7, 1, 3); }
    }
    for (let y = 8; y < 80; y += 12) for (let x = -24; x < w; x += 32) {
      const sx = x + (Math.floor(y / 12) % 2) * 16;
      rect(c, p.wall, sx, y, 31, 11); rect(c, '#ffffff12', sx + 1, y, 29, 1);
    }
    for (const x of [16, w - 24]) { rect(c, p.wall, x, 8, 8, h - 24); rect(c, '#747783', x, 80, 2, h - 104); }
    rect(c, '#85878c', 24, 78, w - 48, 2); rect(c, '#202535', 24, 81, w - 48, 7);
    rect(c, '#252b36', 24, h - 24, w - 48, 8); rect(c, p.trim, 28, h - 24, w - 56, 1);
    for (const x of [w * 0.2, w * 0.8]) {
      poly(c, '#161e2b', [[x - 18, 66], [x - 18, 30], [x, 12], [x + 18, 30], [x + 18, 66]]);
      poly(c, p.light, [[x - 13, 62], [x - 13, 32], [x, 19], [x + 13, 32], [x + 13, 62]]);
      rect(c, '#303b50', x - 1, 19, 3, 44); rect(c, '#303b50', x - 13, 40, 27, 3);
      poly(c, '#b5c8d00a', [[x - 13, 88], [x + 13, 88], [x + 80, 240], [x - 5, 240]]);
    }
    if (theme === 'hall') {
      rect(c, '#272630', w / 2 - 43, 88, 86, h - 118);
      rect(c, p.cloth, w / 2 - 39, 88, 78, h - 122);
      for (const x of [w / 2 - 36, w / 2 + 34]) rect(c, p.trim, x, 88, 2, h - 122);
      for (let y = 100; y < h - 38; y += 24) {
        for (const x of [w / 2 - 30, w / 2 + 29]) poly(c, '#b88656', [[x, y], [x + 3, y + 4], [x, y + 8], [x - 3, y + 4]]);
      }
      rect(c, '#ffffff07', w / 2 - 32, 88, 22, h - 122);
    } else {
      c.strokeStyle = p.trim; c.lineWidth = 2;
      c.beginPath(); c.ellipse(w / 2, h / 2 + 20, 112, 78, 0, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.ellipse(w / 2, h / 2 + 20, 104, 72, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, x = w / 2 + Math.cos(a) * 108, y = h / 2 + 20 + Math.sin(a) * 75;
        rect(c, p.trim, Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
    shield(c, w / 2 - 9, h / 2 + 4, p.cloth);
  });
}
