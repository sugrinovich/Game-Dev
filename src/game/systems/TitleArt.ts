import Phaser from 'phaser';
import { TEXTURES, type PlayerDirection } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { COLORS, GAME } from '../configs/game';
import { PText } from '../ui/PText';
import { clipPoly, ellipse, poly, px, rect, sheet, texture } from './CastleArt';
import { Effects, makeUtilityTextures } from './Effects';
import { ensureHeroSheet, gripOffset, heroAnimKey, heroOrigin, ORB } from './HeroArt';
import { blob, lit, ramp, tube } from './Volume';
import { makeFireballSheet } from './MobArt';
import { makeCrestTexture } from './IconArt';

/*
 * Заставка «Осада Бездны» для загрузки и главного меню: ночь, замок на холме, рыцарь перед воротами,
 * с востока идёт орда (орки, огры, скелеты), над ней парят Короли Бездны и мечут в замок огненные шары.
 * Всё рисуется кодом при первом показе (несколько миллисекунд), без файлов.
 */

const W = GAME.width;
const H = GAME.height;
const TAU = Math.PI * 2;

/** Слои заставки: фон, существа (по Y), огонь, затемнение, интерфейс. */
export const TITLE_DEPTH = { bg: -1000, fire: 400, vignette: 800, ui: 1000 } as const;

/** Расстановка и ритм сцены. Скорости — пиксели в секунду, время — секунды. */
const SIEGE = {
  horizon: 198,
  knight: { x: 196, y: 262 },
  kings: [{ x: 404, y: 214 }, { x: 458, y: 208 }],
  /** Короли смотрят на замок вполоборота — видно лицо-пустоту и сферу. */
  kingFacing: 'down-left' as PlayerDirection,
  castleTarget: { x0: 24, x1: 140, y0: 96, y1: 160 },
  fireEvery: [2.2, 3.6] as const,
  fireFlight: 1.5,
  fireScale: 1.5,
  respawnX: 500,
  fadeX: [250, 290] as const,
  emberEvery: 0.05,
} as const;

type MarcherKind = 'orc' | 'ogre' | 'skeleton' | 'archer';
const MARCH_SPEED: Record<MarcherKind, number> = { orc: 16, ogre: 9, skeleton: 13, archer: 12 };
const HORDE: { kind: MarcherKind; x: number; y: number }[] = [
  { kind: 'orc', x: 330, y: 228 }, { kind: 'ogre', x: 365, y: 236 }, { kind: 'skeleton', x: 395, y: 232 },
  { kind: 'ogre', x: 470, y: 244 }, { kind: 'archer', x: 415, y: 250 }, { kind: 'orc', x: 300, y: 256 },
  { kind: 'skeleton', x: 350, y: 262 }, { kind: 'orc', x: 448, y: 263 },
];

// ---------------- фон: небо, луна, горы, замок, поле ----------------
const SKY = [[11, 8, 24], [20, 13, 38], [34, 18, 46], [58, 22, 52], [92, 26, 48], [138, 42, 42], [192, 72, 42]] as const;
const SOIL = [[18, 12, 22], [26, 18, 30], [36, 22, 34], [52, 28, 36], [84, 36, 36]] as const;
/** Матрица Байера 4x4: «пиксельный» плавный переход между цветами. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Небо и земля — попиксельно через ImageData (в сотни раз быстрее fillRect на каждый пиксель). */
function paintSkyAndSoil(c: CanvasRenderingContext2D): void {
  const img = c.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dither = BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5;
    const glow = Math.max(0, 1 - Math.hypot((x - 410) * 0.8, (y - 205) * 1.4) / 230);
    const ground = y >= SIEGE.horizon + Math.round(Math.sin(x * 0.05) * 2);
    const pal = ground ? SOIL : SKY;
    const v = ground ? ((y - SIEGE.horizon) / 72) * 0.5 + Math.max(0, (x - 260) / 220) * 0.45 : Math.pow(y / 200, 1.7) * 0.55 + glow * glow * 0.75;
    const col = pal[Math.max(0, Math.min(pal.length - 1, Math.round(v * (pal.length - 1) + dither)))]!;
    const i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

/** Предсказуемый «случайный» генератор: картинка одинаковая при каждом запуске. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function paintSky(c: CanvasRenderingContext2D): void {
  const rnd = seeded(7);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * 330), y = Math.floor(rnd() * 130);
    px(c, rnd() < 0.2 ? '#ffffff' : '#a8a0c8', x, y);
    if (rnd() < 0.08) { px(c, '#6a6488', x - 1, y); px(c, '#6a6488', x + 1, y); px(c, '#6a6488', x, y - 1); px(c, '#6a6488', x, y + 1); }
  }
  // луна с ореолом, освещена слева
  for (const [r, a] of [[26, '10'], [21, '18']] as const) ellipse(c, `#e8e0c8${a}`, 78, 42, r, r);
  ellipse(c, '#e8e0c8', 78, 42, 15, 15);
  for (let dy = -15; dy <= 15; dy++) { const half = Math.round(15 * Math.sqrt(Math.max(0, 1 - (dy / 15.5) ** 2))); rect(c, '#b8ae98', 78 + half - 4, 42 + dy, 4, 1); }
  for (const [x, y, r] of [[72, 36, 3], [83, 47, 2], [76, 50, 1], [86, 35, 1]] as const) ellipse(c, '#c8bea8', x, y, r, r);
  // разлом Бездны на горизонте
  const rift = [[420, 118], [426, 140], [418, 158], [428, 178], [421, 200], [433, 200], [440, 176], [431, 156], [438, 138], [428, 116]];
  poly(c, '#4a1660', rift.map(([x, y]) => [x! + (x! < 429 ? -4 : 4), y!]));
  poly(c, '#a040d0', rift);
  poly(c, '#ffd0ff', rift.map(([x, y]) => [429 + (x! - 429) * 0.35, y!]));
  // горы: дальний и ближний хребты, правые склоны подсвечены заревом
  for (const [base, amp, col, rim, seed] of [[168, 22, '#1c1228', '#4a1e34', 3], [184, 14, '#140d1e', '#3a1628', 9]] as const) {
    const r2 = seeded(seed);
    const pts: number[][] = [[0, SIEGE.horizon + 2]];
    for (let x = 0; x <= W; x += 24) pts.push([x, base - Math.round(Math.abs(Math.sin(x * 0.021 + seed)) * amp + r2() * 6)]);
    pts.push([W, SIEGE.horizon + 2]);
    poly(c, col, pts);
    for (let i = 1; i < pts.length - 2; i++) {
      const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!;
      if (x0! > 260 && y1! > y0!) for (let x = x0!; x < x1!; x++) px(c, rim, x, Math.round(y0! + ((y1! - y0!) * (x - x0!)) / (x1! - x0!)));
    }
  }
}

/** Замок на холме ночью: свет луны слева, справа — алое зарево Бездны по краю. */
const CASTLE = { stone: '#3e3850', roof: '#4a1a28', rim: '#7a3a4a', course: 6 } as const;

/** Стена или донжон: каменный брус со скруглёнными рёбрами, ряды кладки, круглые зубцы поверху. */
function castleWall(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const S = ramp(CASTLE.stone);
  blob(c, { x, y, w, h }, S, 6);
  for (let yy = y + CASTLE.course - 1, row = 0; yy < y + h - 1; yy += CASTLE.course, row++) {
    rect(c, S[3], x + 1, yy, w - 2, 1);
    for (let xx = x + 3 + (row % 2) * 4; xx < x + w - 2; xx += 8) rect(c, S[3], xx, yy - CASTLE.course + 1, 1, CASTLE.course - 1);
  }
  for (let xx = x; xx < x + w - 2; xx += 6) blob(c, { x: xx, y: y - 4, w: 5, h: 5 }, S, 2.5);
  rect(c, CASTLE.rim, x + w - 2, y, 2, h);
}

/** Круглая башня: ствол-цилиндр (ряды камней по дуге), коническая черепичная крыша, алый край справа. */
function castleTower(c: CanvasRenderingContext2D, cx: number, baseY: number, r: number, h: number, roofTop: number): void {
  const S = ramp(CASTLE.stone), R = ramp(CASTLE.roof), top = baseY - h;
  for (let x = -r; x <= r; x++) {
    const n = x / (r + 0.5), nz = Math.sqrt(1 - n * n), arc = Math.round(3 * nz);
    rect(c, x >= r - 1 ? CASTLE.rim : S[lit(n, -0.1, nz)]!, cx + x, top, 1, h + arc);
    for (let yy = CASTLE.course; yy < h; yy += CASTLE.course) px(c, S[4], cx + x, top + yy + arc);
  }
  // крыша-конус: тон по столбцам, у карниза темнее
  const eave = r + 3;
  for (let y = roofTop; y <= top + 2; y++) {
    const half = Math.round((eave * (y - roofTop)) / (top + 2 - roofTop));
    for (let x = -half; x <= half; x++) {
      const n = half ? x / (half + 0.5) : 0;
      rect(c, x >= half - 1 && half > 2 ? '#7a2a3a' : R[Math.min(4, lit(n, -0.35, Math.sqrt(1 - n * n)) + (y > top ? 1 : 0))]!, cx + x, y, 1, 1);
    }
  }
}

function paintCastle(c: CanvasRenderingContext2D): void {
  poly(c, '#120c18', [[0, 158], [40, 148], [120, 156], [176, 184], [204, 200], [0, 200]]);
  castleWall(c, 14, 128, 140, 34);
  castleWall(c, 56, 64, 52, 66);
  castleTower(c, 21, 162, 13, 78, 52);
  castleTower(c, 136, 162, 12, 70, 62);
  rect(c, '#2a2030', 81, 36, 1, 28); poly(c, '#a02a3a', [[82, 37], [97, 40], [82, 45]]); px(c, '#d6b66d', 81, 35);
  poly(c, '#120c18', [[76, 162], [76, 146], [84, 140], [92, 146], [92, 162]]);
  for (const x of [79, 83, 87]) tube(c, { x, y: 146, w: 1, h: 16 }, ramp('#3a3448'));
  // окна горят: тёплый свет с бликом
  for (const [x, y] of [[18, 100], [24, 118], [66, 80], [80, 80], [94, 80], [72, 104], [88, 104], [132, 108], [138, 126], [40, 140], [120, 140]] as const) {
    blob(c, { x: x - 1, y: y - 1, w: 4, h: 5 }, ramp('#ff9a3a'), 3); px(c, '#ffe0a0', x, y);
  }
}

function paintField(c: CanvasRenderingContext2D): void {
  const rnd = seeded(21);
  for (let i = 0; i < 60; i++) { const x = Math.floor(rnd() * W), y = SIEGE.horizon + 4 + Math.floor(rnd() * 66); rect(c, '#3a2a30', x, y - 2, 1, 2); px(c, '#4a3438', x + 1, y - 1); }
  for (let i = 0; i < 14; i++) { const x = Math.floor(rnd() * W), y = SIEGE.horizon + 8 + Math.floor(rnd() * 60); ellipse(c, '#241a28', x, y, 3, 1); px(c, '#4a3a44', x - 1, y - 1); }
  // огненные трещины — Бездна пробивается сквозь землю
  for (let k = 0; k < 6; k++) {
    let x = 290 + Math.floor(rnd() * 180), y = 210 + Math.floor(rnd() * 55);
    for (let i = 0; i < 18; i++) { rect(c, '#c83a1a', x, y, 2, 1); px(c, '#ffc060', x, y); x -= 1 + Math.floor(rnd() * 2); y += Math.floor(rnd() * 3) - 1; }
  }
  // сломанные копья и порванный стяг на поле боя
  for (const [x, y] of [[236, 236], [262, 250], [282, 226]] as const) { for (let i = 0; i < 12; i++) px(c, '#5a4030', x + Math.floor(i / 3), y - i); px(c, '#9aa0a8', x + 4, y - 12); }
  poly(c, '#6a1a24', [[263, 238], [270, 240], [266, 244], [270, 247], [263, 246]]);
}

// ---------------- существа ----------------
/** Материалы рыцаря — ступени тона от блика к тени (свет сверху-слева, как у всех спрайтов). */
const KNIGHT = {
  steel: ramp('#8a94a4'), steelFar: ramp('#5e6678'), cloth: ramp('#ddd5c4'), cross: ramp('#b02a3a'), cape: ramp('#7a1a26'),
  plume: ramp('#c83030'), gold: ramp('#d6b66d'), field: ramp('#2c4a8a'), blade: ramp('#d0d8e2'),
} as const;

/** Рыцарь 48x56 смотрит вправо: меч занесён над плечом, щит выставлен вперёд, плащ и плюмаж развеваются. */
function paintKnight(c: CanvasRenderingContext2D, f: number): void {
  const t = (f / 8) * TAU, b = Math.sin(t) > 0.5 ? 1 : 0, K = KNIGHT;
  const wave = (i: number): number => Math.round(Math.sin(t + i * 0.8) * 2);
  // плащ: складки идут вдоль ткани (от плеч вниз-влево) и бегут волной
  clipPoly(c, [[20, 18], [27, 18], [25, 30], [23, 44], [17 + wave(3), 53], [5 + wave(4), 51], [7 + wave(2), 38], [12 + wave(1), 26]], () => {
    for (let y = 16; y < 56; y++) {
      let x0 = 0, cur = '';
      for (let x = 0; x <= 30; x++) {
        const fold = Math.sin((x * 0.93 + y * 0.36) * 0.7 - t) + (x < 12 ? -0.4 : 0);   // левый край плаща дальше от света
        const col = x === 30 ? '' : K.cape[fold > 0.55 ? 1 : fold > -0.45 ? 2 : 3];
        if (col !== cur) { if (cur) rect(c, cur, x0, y, x - x0, 1); x0 = x; cur = col; }
      }
    }
  });
  // ноги в латах: дальняя в тени, у ближней — наколенник и сабатон
  tube(c, { x: 18, y: 38, w: 5, h: 13 }, K.steelFar); blob(c, { x: 16, y: 49, w: 7, h: 5 }, K.steelFar, 3);
  tube(c, { x: 26, y: 38, w: 5, h: 13 }, K.steel); blob(c, { x: 25, y: 42, w: 7, h: 4 }, K.steel, 2); blob(c, { x: 26, y: 49, w: 9, h: 5 }, K.steel, 3);
  // сюрко с алым крестом, золотой пояс
  blob(c, { x: 17, y: 25 + b, w: 15, h: 17 }, K.cloth, 4);
  rect(c, K.cross[2], 19, 31 + b, 11, 3); rect(c, K.cross[1], 19, 31 + b, 11, 1);
  tube(c, { x: 23, y: 27 + b, w: 3, h: 12 }, K.cross);
  tube(c, { x: 17, y: 35 + b, w: 15, h: 1 }, K.gold);
  // кираса и наплечники: дальний — в тени, ближний — поверх
  blob(c, { x: 27, y: 16 + b, w: 7, h: 6 }, K.steelFar, 2);
  blob(c, { x: 18, y: 17 + b, w: 13, h: 10 }, K.steel, 3);
  blob(c, { x: 15, y: 16 + b, w: 7, h: 6 }, K.steel, 2);
  // плюмаж за шлемом, шлем-«ведро» с забралом и золотым обручем
  const plume = [[24, 5 + b], [28, 3 + b], [22, 1 + b], [14 + wave(2), 3 + b], [16 + wave(3), 8 + b], [22, 7 + b]];
  clipPoly(c, plume, () => blob(c, { x: 13, y: b, w: 16, h: 9 }, K.plume, 2));
  blob(c, { x: 20, y: 4 + b, w: 10, h: 14 }, K.steel, 3);
  rect(c, '#1d1822', 25, 11 + b, 6, 1); for (const y of [13, 15]) px(c, '#1d1822', 28, y + b);
  tube(c, { x: 20, y: 9 + b, w: 10, h: 1 }, K.gold);
  // рука с мечом над плечом; блик бежит по клинку
  tube(c, { x: 13, y: 12 + b, w: 4, h: 9 }, K.steel); blob(c, { x: 12, y: 9 + b, w: 6, h: 4 }, K.steel, 3);
  tube(c, { x: 14, y: b, w: 2, h: 10 }, K.blade);
  rect(c, K.gold[1], 11, 9 + b, 8, 1); px(c, K.gold[3], 18, 9 + b); px(c, K.gold[2], 15, 13 + b);
  const glint = Math.floor((f / 8) * 14);
  if (glint < 10) { px(c, '#ffffff', 14, glint + b); px(c, '#fff0a0', 15, glint + b); }
  // щит с гербом: выпуклый — блик сверху-слева, тень снизу-справа
  const box = { x: 28, y: 18 + b, w: 15, h: 23 };
  clipPoly(c, [[29, 21 + b], [41, 21 + b], [41, 32 + b], [35, 39 + b], [29, 32 + b]], () => blob(c, box, K.gold, 2.5));
  clipPoly(c, [[30, 22 + b], [40, 22 + b], [40, 32 + b], [35, 37 + b], [30, 32 + b]], () => blob(c, box, K.field, 2.5));
  rect(c, K.gold[1], 34, 23 + b, 1, 13); rect(c, K.gold[3], 35, 23 + b, 1, 13);
  rect(c, K.gold[1], 31, 27 + b, 9, 1); rect(c, K.gold[3], 31, 28 + b, 9, 1);
}

/** Текстуры заставки. Повторный вызов ничего не делает. */
function makeSiegeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('siege_bg')) return;
  texture(scene, 'siege_bg', W, H, (c) => { paintSkyAndSoil(c); paintSky(c); paintCastle(c); paintField(c); });
  sheet(scene, 'title_knight', 48, 56, 8, 8, paintKnight);
  makeFireballSheet(scene);
  makeCrestTexture(scene);
  // затемнение по краям экрана (раньше — картинка title_vignette.png)
  texture(scene, 'title_vignette', W, H, (c) => {
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
      const i = (y * W + x) * 4;
      img.data[i] = 8; img.data[i + 1] = 6; img.data[i + 2] = 16; img.data[i + 3] = Math.round(Math.max(0, d - 0.6) * 1.6 * 255);
    }
    c.putImageData(img, 0, 0);
  });
  // орда — те же куклы в 8 сторон, что и в бою
  for (const e of Object.values(ENEMY_TYPES)) ensureHeroSheet(scene, e.outfit, e.body);
}

// ---------------- логотип ----------------
/** Логотип сверху вниз: герб (высота 40), отступ, название (верх строки), золотая черта, девиз. */
const LOGO = { crestY: 2, titleY: 44, ruleY: 90, subtitleY: 95, bottom: 106 } as const;
/** Герб, название и девиз — одинаковые на загрузке и в меню. Возвращает Y под логотипом. */
export function addTitleLogo(scene: Phaser.Scene): number {
  const d = TITLE_DEPTH.ui;
  // золотое сияние за гербом и тёплый ореол за названием — мягко дышат
  const crestGlow = scene.add.image(W / 2, LOGO.crestY + 20, TEXTURES.glow).setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.32).setDepth(d - 1);
  const titleGlow = scene.add.image(W / 2, LOGO.titleY + 22, TEXTURES.glow).setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(6.5, 1.1).setAlpha(0.22).setDepth(d - 1);
  scene.tweens.add({ targets: [crestGlow, titleGlow], alpha: '-=0.12', duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.add.image(W / 2, LOGO.crestY, 'title_crest').setOrigin(0.5, 0).setDepth(d);
  // название ниже герба с отступом (верх строки, а не центр — буквы не заходят под мечи герба)
  const title = scene.add.container(0, 0).setDepth(d);
  title.add(new PText(scene, W / 2, LOGO.titleY, GAME.title, { font: 'big', ax: 0.5, ay: 0, color: COLORS.gold, scale: 2 }));
  scene.tweens.add({ targets: title, y: 2, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  const g = scene.add.graphics().setDepth(d);
  const r = LOGO.ruleY;
  g.fillStyle(0xa07c4c, 1).fillRect(W / 2 - 112, r, 102, 1).fillRect(W / 2 + 10, r, 102, 1);
  g.fillStyle(0xf2d060, 1).fillRect(W / 2 - 2, r - 2, 4, 4).fillRect(W / 2 - 1, r - 3, 2, 6).fillRect(W / 2 - 3, r - 1, 6, 2);
  new PText(scene, W / 2, LOGO.subtitleY, GAME.subtitle, { ax: 0.5, color: 0xd8c8a8 }).setDepth(d);
  return LOGO.bottom;
}

// ---------------- живая сцена ----------------
interface Marcher { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; speed: number; fadeX: number }
interface Fireball { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; t: number; from: Phaser.Math.Vector2; ctrl: Phaser.Math.Vector2; to: Phaser.Math.Vector2 }

/** Фон заставки: рисует текстуры (один раз), расставляет героев и оживляет их каждый кадр. */
export class SiegeBackdrop {
  private readonly fx: Effects;
  private readonly marchers: Marcher[] = [];
  private readonly kings: Phaser.GameObjects.Sprite[] = [];
  private fireball: Fireball | null = null;
  private fireIn = 1;
  private emberT = 0;
  private auraT = 0;
  private readonly pos = new Phaser.Math.Vector2();

  constructor(private readonly scene: Phaser.Scene) {
    makeUtilityTextures(scene);
    makeSiegeTextures(scene);
    this.fx = new Effects(scene);
    scene.add.image(0, 0, 'siege_bg').setOrigin(0, 0).setDepth(TITLE_DEPTH.bg);
    const riftGlow = scene.add.image(429, 160, TEXTURES.glow).setTint(0xa040ff).setBlendMode(Phaser.BlendModes.ADD).setScale(3, 5).setAlpha(0.35).setDepth(TITLE_DEPTH.bg + 1);
    scene.tweens.add({ targets: riftGlow, alpha: 0.2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (const k of SIEGE.kings) this.addKing(k.x, k.y);
    for (const h of HORDE) this.addMarcher(h.kind, h.x, h.y);
    scene.add.image(SIEGE.knight.x, SIEGE.knight.y, TEXTURES.shadow).setScale(1.2, 0.8).setDepth(SIEGE.knight.y - 1);
    scene.add.sprite(SIEGE.knight.x, SIEGE.knight.y, 'title_knight', '0').setOrigin(0.5, 1).setDepth(SIEGE.knight.y).play('title_knight');

    const onUpdate = (_t: number, delta: number): void => this.update(Math.min(delta, 50) / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate); this.fx.clear(); });
  }

  private addKing(x: number, y: number): void {
    const glow = this.scene.add.image(x, y - 30, TEXTURES.glow).setTint(0x8a3aff).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 3).setAlpha(0.3).setDepth(y - 2);
    const e = ENEMY_TYPES.king, key = ensureHeroSheet(this.scene, e.outfit, e.body), o = heroOrigin(e.body);
    const king = this.scene.add.sprite(x, y, key, '0').setOrigin(o.x, o.y).setDepth(y).play(heroAnimKey(key, 'idle', SIEGE.kingFacing));
    king.anims.setProgress(Math.random());
    this.scene.tweens.add({ targets: [king, glow], y: '-=4', duration: 1600 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.kings.push(king);
  }

  private addMarcher(kind: MarcherKind, x: number, y: number): void {
    const e = ENEMY_TYPES[kind], key = ensureHeroSheet(this.scene, e.outfit, e.body), o = heroOrigin(e.body);
    const sprite = this.scene.add.sprite(x, y, key, '0').setOrigin(o.x, o.y).play(heroAnimKey(key, 'walk', 'left'));
    sprite.setDepth(y).anims.setProgress(Math.random());
    const shadow = this.scene.add.image(x, y, TEXTURES.shadow).setScale(kind === 'ogre' ? 1.3 : 0.7, 0.7).setDepth(y - 1);
    this.marchers.push({ sprite, shadow, speed: MARCH_SPEED[kind], fadeX: Phaser.Math.Between(SIEGE.fadeX[0], SIEGE.fadeX[1]) });
  }

  private update(dt: number): void {
    this.fx.update(dt);
    // орда идёт к замку; у рыцаря растворяется и снова выходит из-за правого края
    for (const m of this.marchers) {
      const s = m.sprite;
      s.x -= m.speed * dt;
      s.setAlpha(s.x < m.fadeX ? Math.max(0, s.alpha - dt * 1.5) : Math.min(1, s.alpha + dt * 1.5));
      if (s.alpha <= 0) s.x = SIEGE.respawnX + Math.random() * 40;
      m.shadow.setPosition(s.x, s.y + 1).setAlpha(s.alpha);
    }
    this.auraT -= dt;
    if (this.auraT <= 0) {
      this.auraT = 0.12;
      const k = Phaser.Utils.Array.GetRandom(this.kings);
      this.fx.burst({ x: k.x + Phaser.Math.Between(-14, 14), y: k.y - 6, count: 1, speed: [8, 20], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [0.8, 1.4], size: [1, 3], tints: [0xa040ff, 0xe0a0ff], gravity: -10, blend: Phaser.BlendModes.ADD, depth: k.y + 1 });
    }
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = SIEGE.emberEvery;
      this.fx.burst({ x: Phaser.Math.Between(0, W), y: H - Phaser.Math.Between(0, 8), count: 1, speed: [10, 30], angle: [-Math.PI * 0.72, -Math.PI * 0.55], life: [2, 4], size: [1, 2], tints: [0xff8a3a, 0xffc060, 0xc04aff], gravity: -6, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire - 1 });
    }
    this.updateFire(dt);
  }

  private updateFire(dt: number): void {
    if (!this.fireball) {
      this.fireIn -= dt;
      if (this.fireIn <= 0) this.launch();
      return;
    }
    const fb = this.fireball;
    fb.t = Math.min(1, fb.t + dt / SIEGE.fireFlight);
    const u = 1 - fb.t;
    this.pos.set(u * u * fb.from.x + 2 * u * fb.t * fb.ctrl.x + fb.t * fb.t * fb.to.x, u * u * fb.from.y + 2 * u * fb.t * fb.ctrl.y + fb.t * fb.t * fb.to.y);
    const back = Math.atan2(fb.sprite.y - this.pos.y, fb.sprite.x - this.pos.x);
    fb.sprite.setPosition(this.pos.x, this.pos.y).setScale(Math.min(SIEGE.fireScale, 0.3 + fb.t * 4));
    fb.glow.setPosition(this.pos.x, this.pos.y);
    this.fx.burst({ x: this.pos.x, y: this.pos.y, count: 3, speed: [10, 40], angle: [back - 0.6, back + 0.6], life: [0.3, 0.7], size: [3, 7], tints: [0xffe070, 0xffa030, 0xf05a1e, 0xb02a14], gravity: -15, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire - 1 });
    if (fb.t >= 1) this.explode(fb);
  }

  /** Сфера над ладонью Короля вспыхивает — и в замок летит огромный огненный шар. */
  private launch(): void {
    const king = Phaser.Utils.Array.GetRandom(this.kings);
    const grip = gripOffset(ENEMY_TYPES.king.body, SIEGE.kingFacing);
    const from = new Phaser.Math.Vector2(king.x + grip.x, king.y + grip.y - ORB.lift);
    const to = new Phaser.Math.Vector2(Phaser.Math.Between(SIEGE.castleTarget.x0, SIEGE.castleTarget.x1), Phaser.Math.Between(SIEGE.castleTarget.y0, SIEGE.castleTarget.y1));
    const ctrl = new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - 80);
    this.fx.burst({ x: from.x, y: from.y, count: 14, speed: [20, 60], life: [0.3, 0.6], size: [2, 4], tints: [0xa040ff, 0xe0a0ff, 0xffffff], blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire });
    const sprite = this.scene.add.sprite(from.x, from.y, 'fireball', '0').setScale(0.3).setDepth(TITLE_DEPTH.fire).play('fireball');
    const glow = this.scene.add.image(from.x, from.y, TEXTURES.glow).setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4).setAlpha(0.45).setDepth(TITLE_DEPTH.fire - 2);
    this.fireball = { sprite, glow, t: 0, from, ctrl, to };
  }

  private explode(fb: Fireball): void {
    const { x, y } = fb.to;
    this.fx.burst({ x, y, count: 40, speed: [30, 140], life: [0.4, 1], size: [2, 6], tints: [0xfffbe0, 0xffe070, 0xffa030, 0xf05a1e], gravity: 60, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire });
    this.fx.burst({ x, y, count: 12, speed: [10, 40], life: [1, 2], size: [4, 8], tints: [0x3a3040, 0x5a4a50], gravity: -30, depth: TITLE_DEPTH.fire - 3 });
    const flash = this.scene.add.image(x, y, TEXTURES.glow).setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setScale(1).setAlpha(0.9).setDepth(TITLE_DEPTH.fire);
    this.scene.tweens.add({ targets: flash, scale: 6, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(160, 0.004);
    fb.sprite.destroy(); fb.glow.destroy();
    this.fireball = null;
    this.fireIn = Phaser.Math.FloatBetween(SIEGE.fireEvery[0], SIEGE.fireEvery[1]);
  }
}
