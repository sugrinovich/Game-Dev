import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { DEPTH, GAME } from '../configs/game';
import type { PassageConfig } from '../configs/items';
import type { Colliders } from './Colliders';
import { ball, box, cyl, drawModel, hash, hiresTexture, propTextureJobs, stoneAt, yaw, type Masonry, type Model } from './CastleModels';
import { CAMERA_PITCH, type Mark, type Part, type Shade } from './Rig3D';
import { addOutline, addVolume, ramp, roundCorners, tone } from './Volume';

/*
 * Замок: пол (плиты, ковёр, герб — рисуется плоско, один раз) и всё, что над полом, — 3D-модели (CastleModels.ts):
 * стены из выпуклых камней с кромкой и цоколем, витражи в нишах, круглые башни с зубцами, боковые стены,
 * передний парапет и объекты зала. Модели рисуются в GAME.resolution раз детальнее пикселей игры.
 */

/** Темы: тронный зал, три арены и две комнаты зала (кузня, целебница). */
export type CastleTheme = 'hall' | 'courtyard' | 'crypt' | 'forge' | 'smithy' | 'apothecary';
/** Границы, за которые не пройти: у краёв карты (боковых стен нет) — side, задняя стена — top, нижняя — bottom. */
export const CASTLE_BOUNDS = { side: 8, top: 88, bottom: 24 } as const;
/** Размеры карт: зал замка, арена и комната зала (пол рисуется заранее, при загрузке). */
export const HALL_SIZE = { w: 640, h: 496 } as const;
export const ARENA_SIZE = { w: 560, h: 384 } as const;
export const ROOM_SIZE = { w: 480, h: 280 } as const;
export const HALL_GROUND_KEY = 'base-ground';
export function arenaGroundKey(theme: CastleTheme): string { return `arena-ground-${theme}`; }
export function roomGroundKey(theme: CastleTheme): string { return `room-ground-${theme}`; }
const PALETTES = {
  hall: { floor: ['#424956', '#48505e', '#4e5663'], wall: '#343b49', trim: '#bd9856', cloth: '#762e40', light: '#97b7d1' },
  courtyard: { floor: ['#605f59', '#69685f', '#727066'], wall: '#494c50', trim: '#bd9856', cloth: '#354f68', light: '#9dbbce' },
  crypt: { floor: ['#343e4b', '#394554', '#414d5b'], wall: '#292f40', trim: '#8499b5', cloth: '#3d3a69', light: '#74b8ca' },
  forge: { floor: ['#4c3e40', '#544447', '#5e4a48'], wall: '#382e36', trim: '#c58b4e', cloth: '#7a3033', light: '#e7935a' },
  smithy: { floor: ['#3e3634', '#443b38', '#4b413c'], wall: '#34292c', trim: '#c58b4e', cloth: '#6a2a24', light: '#e7935a' },
  apothecary: { floor: ['#3a4440', '#404a45', '#47524b'], wall: '#2e3836', trim: '#9ab07a', cloth: '#35553e', light: '#9ee0a0' },
} as const;
type Palette = (typeof PALETTES)[CastleTheme];
/** Арены: на полу круг ристалища и герб. */
const ARENA_THEMES: readonly CastleTheme[] = ['courtyard', 'crypt', 'forge'];
/** Двери тронного зала в задней стене (x середины проёма, пиксели игры): слева от трона — целебница, справа — кузня. */
export const HALL_DOOR_X = [200, 440] as const;
/** Чёрный костёр посреди тронного зала — проход к аренам: середина и радиус разлома в полу вокруг него. */
export const HALL_FIRE = { x: HALL_SIZE.w / 2, y: 268, rift: 54 } as const;
/**
 * Дверной проём в стене (единицы модели): полуширина, высота пят арки и вершины, глубина ниши.
 * Створки (заперта / открыта) — отдельные спрайты точно по этой форме (HallModels.ts).
 */
export const DOORWAY = { half: 12, spring: 24, apex: 35, recess: 10 } as const;
/** Задняя стена темы: окна (доли ширины), угловые башни, дверные проёмы (x, пиксели игры). */
interface WallLayout { windows: readonly number[]; doors: readonly number[] }
const ARENA_WALL: WallLayout = { windows: [0.2, 0.8], doors: [] };
const LAYOUTS: Record<CastleTheme, WallLayout> = {
  hall: { windows: [], doors: HALL_DOOR_X },
  courtyard: ARENA_WALL, crypt: ARENA_WALL, forge: ARENA_WALL,
  smithy: { windows: [], doors: [] },
  apothecary: { windows: [0.5], doors: [] },
};

/**
 * Ворота в задней и нижней стене — сквозной проём во всю высоту стены: полуширина (пиксели); у всех ворот по краям —
 * одинаковые столбы: полуширина и полуглубина, насколько выше стены (единицы модели), радиус золотого шара на макушке.
 */
export const GATE = { half: 20, post: { half: 6, rise: 8 }, finial: 3.6 } as const;
/** Проёмы комнаты арены (пиксели карты): x ворот в задней стене и в нижней. */
export interface RoomPassages { top?: number; bottom?: number }
/** Решётки ворот задней и нижней стены (ключи текстур). */
export const PORTCULLIS = { top: 'portcullis-top', front: 'portcullis-front' } as const;
/** Луч света из витража: размер текстуры и число пылинок в нём. */
const SHAFT = { w: 94, h: 152, dust: 7 } as const;

type Paint2D = (ctx: CanvasRenderingContext2D) => void;

export function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
export function poly(c: CanvasRenderingContext2D, color: string, points: number[][]): void {
  c.fillStyle = color; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x!, y!) : c.moveTo(x!, y!));
  c.closePath(); c.fill();
}
/** volume — наложить светотень и контур (см. Volume.ts); для объектов да, для пола и иконок нет. */
export function texture(scene: Phaser.Scene, key: string, w: number, h: number, paint: Paint2D, volume = false): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext(); ctx.imageSmoothingEnabled = false;
  paint(ctx);
  if (volume) { roundCorners(ctx, w, h, w, h); addVolume(ctx, w, h, w, h); addOutline(ctx, w, h, w, h); }
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
function shield(c: CanvasRenderingContext2D, x: number, y: number, color = '#823749'): void {
  poly(c, '#d6b66d', [[x, y], [x + 18, y], [x + 18, y + 14], [x + 9, y + 22], [x, y + 14]]);
  poly(c, color, [[x + 2, y + 2], [x + 16, y + 2], [x + 16, y + 13], [x + 9, y + 19], [x + 2, y + 13]]);
  rect(c, '#e8d29b', x + 8, y + 4, 2, 12); rect(c, '#e8d29b', x + 4, y + 7, 10, 2);
}
export function px(c: CanvasRenderingContext2D, color: string, x: number, y: number): void { rect(c, color, x, y, 1, 1); }
/** Эллипс из горизонтальных полосок (так в 3/4 выглядит круг на полу или крышка цилиндра). */
export function ellipse(c: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry: number): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    rect(c, color, cx - half, cy + dy, half * 2 + 1, 1);
  }
}
/** Рисовать только внутри многоугольника (щит, плащ, ниша): что именно — задаёт paint. */
export function clipPoly(c: CanvasRenderingContext2D, points: number[][], paint: () => void): void {
  c.save(); c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
  c.closePath(); c.clip(); paint(); c.restore();
}

/** Сколько кадров листа рисовать за одно задание: так ни одно задание экрана загрузки не выходит за бюджет кадра. */
const FRAMES_PER_JOB = 8;
type SheetPaint = (c: CanvasRenderingContext2D, f: number) => void;

/**
 * Плоский лист анимации по частям (заставка): первое задание создаёт холст, каждое следующее рисует и оттеняет
 * несколько кадров, последнее регистрирует кадры и анимацию (ключ анимации = ключ текстуры).
 * shading — светотень и контур (огню и вспышкам не нужны), repeat — −1 по кругу, 0 — один раз (эффекты).
 */
export function sheetJobs(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, frameRate: number, paint: SheetPaint, shading = true, repeat = -1): (() => void)[] {
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const jobs: (() => void)[] = [() => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    tex = scene.textures.createCanvas(key, w * frames, h);
    if (tex) tex.getContext().imageSmoothingEnabled = false;
  }];
  for (let f0 = 0; f0 < frames; f0 += FRAMES_PER_JOB) {
    jobs.push(() => {
      if (!tex) return;
      const ctx = tex.getContext();
      const f1 = Math.min(frames, f0 + FRAMES_PER_JOB);
      for (let f = f0; f < f1; f++) {
        ctx.save(); ctx.translate(f * w, 0);
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        paint(ctx, f);
        ctx.restore();
      }
      if (shading) {
        roundCorners(ctx, (f1 - f0) * w, h, w, h, f0 * w);
        addVolume(ctx, (f1 - f0) * w, h, w, h, f0 * w); addOutline(ctx, (f1 - f0) * w, h, w, h, f0 * w);
      }
    });
  }
  jobs.push(() => {
    if (!tex) return;
    tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let f = 0; f < frames; f++) tex.add(String(f), 0, f * w, 0, w, h);
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({ key, frames: Array.from({ length: frames }, (_, f) => ({ key, frame: String(f) })), frameRate, repeat });
  });
  return jobs;
}

/** Лист анимации целиком, сразу (когда плавность загрузки не важна). */
export function sheet(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, frameRate: number, paint: SheetPaint, shading = true): void {
  for (const job of sheetJobs(scene, key, w, h, frames, frameRate, paint, shading)) job();
}

/** Объекты замка (3D-модели) — по заданиям: экран загрузки выполняет их понемногу за кадр, и анимация не подвисает. */
export function castleTextureJobs(scene: Phaser.Scene): (() => void)[] { return propTextureJobs(scene); }

/** Предсказуемый «случайный» шум по координатам: узор пола одинаковый при каждом запуске. */
const hash2 = hash;

// ---------------- пол ----------------
/** Пол: плиты с фаской, трещинами и мхом, ковёр (в зале) или круг арены, герб, тени от стен. Одна плоская текстура на тему. */
function paintFloor(scene: Phaser.Scene, key: string, w: number, h: number, theme: CastleTheme): void {
  const p = PALETTES[theme];
  texture(scene, key, w, h, (c) => {
    rect(c, '#151b27', 0, 0, w, h);
    for (let y = 80; y < h; y += 16) for (let x = 0; x < w + 32; x += 32) {
      const tx = x - (Math.floor(y / 16) % 2) * 16;
      const tone = Math.floor(hash2(x, y, 73) * p.floor.length);
      rect(c, p.floor[tone]!, tx, y, 31, 15);
      rect(c, '#ffffff10', tx, y, 30, 1); rect(c, '#ffffff08', tx, y + 1, 1, 13);
      rect(c, '#00000026', tx + 1, y + 14, 30, 1); rect(c, '#0000001c', tx + 30, y + 1, 1, 13);
      if (hash2(x, y, 91) > 0.65) { rect(c, '#20273666', tx + 10, y + 6, 5, 1); rect(c, '#20273666', tx + 15, y + 7, 1, 3); px(c, '#20273666', tx + 16, y + 10); }
      if (hash2(x, y, 17) > 0.85) for (let i = 0; i < 5; i++) px(c, i % 2 ? '#5a7a4c88' : '#4f6a4888', tx + 2 + Math.floor(hash2(x, y, i + 30) * 26), y + 11 + (i % 3));
      if (hash2(x, y, 53) > 0.9) { rect(c, '#232a38', tx + 20, y + 9, 2, 1); px(c, '#8a90a0', tx + 20, y + 8); }
    }
    if (theme === 'hall') {
      paintCarpet(c, w / 2, HALL_FIRE.y - HALL_FIRE.rift + 6, p);
      paintRift(c, HALL_FIRE.x, HALL_FIRE.y, HALL_FIRE.rift);
    } else if (!ARENA_THEMES.includes(theme)) {
      paintRoomFloor(c, w, h, theme);
      paintWallShadows(c, w);
      return;
    } else {
      c.strokeStyle = p.trim; c.lineWidth = 2;
      c.beginPath(); c.ellipse(w / 2, h / 2 + 20, 112, 78, 0, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.ellipse(w / 2, h / 2 + 20, 104, 72, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, x = w / 2 + Math.cos(a) * 108, y = h / 2 + 20 + Math.sin(a) * 75;
        rect(c, p.trim, Math.round(x) - 2, Math.round(y) - 2, 4, 4); px(c, '#ffffff55', Math.round(x) - 2, Math.round(y) - 2);
      }
      if (theme === 'forge') for (let i = 0; i < 40; i++) {
        const x = 40 + Math.floor(hash2(i, 1, 99) * (w - 80)), y = 100 + Math.floor(hash2(i, 2, 99) * (h - 140));
        rect(c, '#ff6a2a66', x, y, 3 + (i % 4), 1); px(c, '#ffc06088', x + 1, y);
      }
    }
    if (theme === 'hall') shield(c, w / 2 - 9, 140, p.cloth); else shield(c, w / 2 - 9, h / 2 + 4, p.cloth);
    edgeShade(c, w, h);
    paintWallShadows(c, w);
  });
}

/** Тень задней стены на полу: чёткая полоса и мягкий край под ней. */
const WALL_SHADOW = { back: 12, alpha: 0.42, fade: 3 } as const;
function paintWallShadows(c: CanvasRenderingContext2D, w: number): void {
  const S = WALL_SHADOW, top = WALL.floorY;
  rect(c, `rgba(6, 8, 16, ${S.alpha})`, 0, top, w, S.back);
  rect(c, `rgba(6, 8, 16, ${S.alpha * 0.4})`, 0, top + S.back, w, S.fade);
}

/** Мягкое затемнение пола у нижней стены. */
function edgeShade(c: CanvasRenderingContext2D, w: number, h: number): void {
  const frontY = h - WALL.front.h + WALL.front.top;
  for (let i = 0; i < 12; i++) rect(c, `rgba(8, 10, 18, ${(12 - i) * 0.022})`, 0, frontY - 1 - i, w, 1);
}

/** Ковёр от трона: кайма, золотые полосы и ромбы, тень у трона; внизу — бахрома (до разлома). */
function paintCarpet(c: CanvasRenderingContext2D, cx: number, end: number, p: Palette): void {
  const len = end - WALL.floorY;
  rect(c, '#272630', cx - 43, WALL.floorY, 86, len + 4);
  rect(c, p.cloth, cx - 39, WALL.floorY, 78, len);
  rect(c, '#00000022', cx - 39, WALL.floorY, 78, 6);
  for (const x of [cx - 36, cx + 34]) rect(c, p.trim, x, WALL.floorY, 2, len);
  for (const x of [cx - 33, cx + 32]) rect(c, '#00000030', x, WALL.floorY, 1, len);
  for (let y = 100; y < end - 16; y += 24) {
    for (const x of [cx - 30, cx + 29]) poly(c, '#b88656', [[x, y], [x + 3, y + 4], [x, y + 8], [x - 3, y + 4]]);
    poly(c, '#00000018', [[cx, y + 6], [cx + 8, y + 12], [cx, y + 18], [cx - 8, y + 12]]);
  }
  for (let x = cx - 38; x < cx + 39; x += 2) { rect(c, p.trim, x, end, 1, 3); px(c, '#00000040', x + 1, end + 1); }
  rect(c, '#ffffff07', cx - 32, WALL.floorY, 22, len);
}

/**
 * Разлом в полу под чёрным костром: опалённое пятно, рваные трещины во все стороны с тёмными краями и лиловым светом
 * в глубине, осколки плит. Рисуется в пол один раз (свет и искры — в сцене).
 */
function paintRift(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let k = 8; k >= 1; k--) ellipse(c, `rgba(6, 3, 12, ${0.07 + (8 - k) * 0.025})`, cx, cy, (r * k) / 8, ((r * k) / 8) * 0.62);
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + hash2(i, 1, 71) * 0.5, x = cx, y = cy;
    const len = r * (0.7 + hash2(i, 2, 71) * 0.5);
    for (let d = 0; d < len; d += 2) {
      a += (hash2(i, d, 73) - 0.5) * 0.7;
      x += Math.cos(a) * 2; y += Math.sin(a) * 2 * 0.62;
      const wide = d < len * 0.5 ? 2 : 1;
      rect(c, '#07040c', Math.round(x) - 1, Math.round(y), wide + 1, 1);
      px(c, d < len * 0.35 ? '#c080ff' : '#7a2ac0', Math.round(x), Math.round(y));
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = hash2(i, 3, 79) * Math.PI * 2, d = r * (0.3 + hash2(i, 4, 79) * 0.7);
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.62);
    rect(c, '#2a2836', x, y, 2, 1); px(c, '#5a5868', x, y - 1);
  }
  ellipse(c, '#05030a', cx, cy, 11, 6);
}

/** Пол комнаты зала: в кузне — копоть и тлеющие угли, в целебнице — листья и пятна зелий. */
function paintRoomFloor(c: CanvasRenderingContext2D, w: number, h: number, theme: CastleTheme): void {
  const cx = w / 2;
  if (theme === 'smithy') {
    for (let i = 0; i < 26; i++) {
      const x = 40 + Math.floor(hash2(i, 3, 41) * (w - 80)), y = WALL.floorY + 14 + Math.floor(hash2(i, 4, 41) * (h - 150));
      ellipse(c, '#1a141466', x, y, 5 + (i % 4) * 2, 2 + (i % 3));
    }
    for (let i = 0; i < 30; i++) {
      const x = cx - 90 + Math.floor(hash2(i, 5, 43) * 180), y = WALL.floorY + 8 + Math.floor(hash2(i, 6, 43) * 50);
      rect(c, '#ff6a2a66', x, y, 2 + (i % 3), 1); px(c, '#ffc06088', x, y);
    }
  } else {
    for (let i = 0; i < 18; i++) {
      const x = 50 + Math.floor(hash2(i, 7, 47) * (w - 100)), y = WALL.floorY + 20 + Math.floor(hash2(i, 8, 47) * (h - 160));
      if (i % 3 === 0) ellipse(c, '#4aa06a33', x, y, 6, 2);
      else { px(c, '#6a9a4a', x, y); px(c, '#82b95a', x + 1, y); px(c, '#56924a', x, y + 1); }
    }
  }
  edgeShade(c, w, h);
}

// ---------------- стены: 3D-модели ----------------
/**
 * Стены — толстые блоки, как в подземельях с видом сверху: у каждой стены хорошо видна светлая кромка (вид сверху,
 * толщина cap пикселей игры, с тёмным контуром снаружи и светлым краем внутри), у задней и нижней стены — ещё и лицевая
 * грань из кладки. Снаружи — тьма. Задняя стена стоит на линии пола floorY: грань высотой face (единицы модели),
 * над ней кромка. Цоколь (радиус), камни кладки. Окна — небольшие витражи в нишах. Нижняя стена (слой поверх героя):
 * высота слоя h, кромка сверху, под ней грань высотой frontFace; проём ворот.
 */
const WALL = {
  floorY: 88, texH: 108, plinth: 5.5, stone: { w: 32, h: 12.5 }, face: 50, cap: 28,
  window: { half: 11, glass: 7, sill: 15, spring: 33, apex: 44, glassApex: 40 },
  front: { h: 74, top: 0, face: 40 },
} as const;
/** Знамёна на задней стене: где низ полотна (y на карте) и во сколько раз меньше обычного — чтобы висели на грани, под кромкой. */
export const WALL_BANNER = { y: 86, scale: 0.7 } as const;
/** Где на экране верх задней грани и начало кромки над ней. */
const BACK_CAP_Y = Math.round(WALL.floorY - WALL.face * Math.cos(CAMERA_PITCH)) - WALL.cap;
/** Пол в моделях стен: точка пола y (пиксели карты) лежит на глубине y / sin наклона камеры. */
const FLOOR_DEPTH = 1 / Math.sin(CAMERA_PITCH);
/** Где у нижней стены верх кромки (от верха её слоя). */
const FRONT_CAP_TOP = Math.round(WALL.front.h - WALL.front.face * Math.cos(CAMERA_PITCH)) - WALL.cap;
/**
 * Решётка ворот стоит посередине толщины стены, между столбами: на столько пикселей выше линии пола у лицевой грани
 * (у задней стены — выше её линии пола, у нижней — выше нижнего края карты).
 */
export const GATE_BARS_UP = WALL.cap / 2;

/** Кладка передней грани стены: камни 32 x 12.5, каждый второй ряд сдвинут на половину. */
function faceGrid(p: Palette, y0: number): Masonry {
  return { w: WALL.stone.w, h: WALL.stone.h, shift: WALL.stone.w / 2, x0: -24, y0, edge: 1.5, joint: tone(p.wall, -0.65) };
}
/** Кромка стены сверху: камни 24 пикселя вдоль стены, во всю её глубину. */
function capGrid(p: Palette, depth: number): Masonry {
  return { w: 24, h: depth, shift: 0, x0: -8, y0: 0, edge: 1.5, joint: tone(p.wall, -0.5) };
}

/**
 * Стена — объёмный брусок: на переднюю грань натянута кладка (hole — вырез под нишу окна или проём),
 * на верхнюю — кромка из камней поперёк стены (дальний край светлее). Низ стены — y0, верх — top, передняя грань — z = 0.
 */
function wallBlock(parts: Part[], w: number, y0: number, top: number, depth: number, base: string, p: Palette, seed: number, hole?: (x: number, y: number) => boolean): void {
  const face = faceGrid(p, y0), mid = (y0 + top) / 2, half = (top - y0) / 2, hw = w / 2 + 8;
  parts.push(box([w / 2, mid, -1.5], [hw, half, 1.5], (s) => {
    if (s.n[2] < 0.5) return null;
    const x = w / 2 + s.x * hw, y = mid + s.y * half;
    return hole?.(x, y) ? null : stoneAt(face, x, y, base, seed);
  }));
  if (depth <= 0) return;   // кромка рисуется отдельно, видом сверху (capModel)
  const cap = capGrid(p, depth), capBase = tone(p.wall, 0.3), capFront = ramp(tone(p.wall, 0.1));
  parts.push(box([w / 2, top + 1.5, -depth / 2], [hw, 1.5, depth / 2], (s) => {
    const x = w / 2 + s.x * hw;
    if (hole?.(x, top + 2)) return null;
    return s.n[1] > 0.5 ? stoneAt(cap, x, ((1 - s.z) / 2) * depth, capBase, seed + 1, -1) : capFront;
  }));
}

/** Острая арка: высота над пролётом шириной 2·half в точке x (от spring до apex). */
export function archY(x: number, half: number, spring: number, apex: number): number {
  return spring + (apex - spring) * Math.sqrt(Math.max(0, 1 - Math.abs(x) / half));
}

/** Витраж в нише: тёмная ниша, косые откосы (левый в тени, правый на свету), стёкла в свинцовой сетке, арка из камней, подоконник. */
function windowParts(parts: Part[], marks: Mark[], wx: number, p: Palette): void {
  const W = WALL.window, mid = (W.sill + W.apex) / 2, half = (W.apex - W.sill) / 2 + 1, cross = (W.sill + W.spring) / 2;
  const inGlass = (x: number, y: number): boolean => Math.abs(x) <= W.glass && y >= W.sill + 1.5 && y <= archY(x, W.glass, W.spring, W.glassApex);
  const panes = [p.light, p.cloth, p.trim, '#5a7ab0', p.light];
  const lead = '#303b50';
  parts.push(
    box([wx, mid, -5], [W.half, half, 1], (s) => (inNiche(s.x * W.half, mid + s.y * half) ? '#161e2b' : null)),
    box([wx - W.half + 2.6, cross, -2.5], [2.6, (W.spring - W.sill) / 2, 0.5], ramp(tone(p.wall, -0.05)), yaw(0.8)),
    box([wx + W.half - 2.6, cross, -2.5], [2.6, (W.spring - W.sill) / 2, 0.5], ramp(tone(p.wall, 0.05)), yaw(-0.8)),
    box([wx, mid, -3.5], [W.glass, half, 0.4], (s) => {
      const x = s.x * W.glass, y = mid + s.y * half;
      if (!inGlass(x, y)) return null;
      if (Math.abs(x) < 0.7 || Math.abs(y - cross) < 0.7) return lead;
      const gx = Math.floor((x + W.glass) / 3.5), gy = Math.floor((y - W.sill) / 4);
      if ((x + W.glass) % 3.5 < 0.45 || (y - W.sill) % 4 < 0.45) return lead;
      return panes[Math.floor(hash2(gx, gy, 5) * panes.length)]!;
    }),
    cyl([wx - W.half - 3, W.sill, 2], [wx + W.half + 3, W.sill, 2], 1.8, ramp(tone(p.wall, 0.3))),
  );
  for (let k = 0; k <= 6; k++) {
    const x = -W.half - 1 + ((2 * W.half + 2) * k) / 6;
    parts.push(ball([wx + x, archY(x, W.half + 1, W.spring, W.apex + 1), 0.4], [3, 2.6, 2], ramp(tone(p.wall, 0.25))));
  }
  for (let x = -W.half + 2; x <= W.half - 2; x += 2) marks.push({ p: [wx + x, W.sill + 2, 2.2], color: p.trim });
}

/** Ниша окна (пролёт шириной 2·half, низ — подоконник, верх — острая арка) относительно середины окна. */
function inNiche(x: number, y: number): boolean {
  const W = WALL.window;
  return Math.abs(x) <= W.half && y >= W.sill && y <= archY(x, W.half, W.spring, W.apex);
}

/** Проём двери в стене (относительно середины проёма): от пола до стрельчатой арки. */
function inDoorway(x: number, y: number): boolean {
  const D = DOORWAY;
  return Math.abs(x) <= D.half && y >= -1 && y <= archY(x, D.half, D.spring, D.apex);
}

/**
 * Дверной проём, вырезанный в стене: ниша с полом и порогом на линии пола, косые откосы (левый в тени, правый на свету),
 * в глубине — тёплый отсвет комнаты и темнота; вокруг — камни арки с золотым замковым камнем, блоки косяков,
 * пилястры по бокам и карниз над аркой. Створки дверей — отдельные спрайты в нише.
 */
function doorwayParts(parts: Part[], dx: number, p: Palette): void {
  const D = DOORWAY, light = ramp(tone(p.wall, 0.28)), stone = ramp(tone(p.wall, 0.12));
  const inArch = (x: number, y: number): boolean => Math.abs(x) <= D.half + 2 && y <= archY(x, D.half + 2, D.spring, D.apex + 1);
  parts.push(
    box([dx, D.apex / 2, -D.recess - 0.5], [D.half + 2, D.apex / 2 + 1, 0.5], (s) => {
      const x = s.x * (D.half + 2), y = D.apex / 2 + s.y * (D.apex / 2 + 1);
      if (!inArch(x, y)) return null;
      return y < 3 ? '#4a3424' : y < 9 ? '#2e2018' : y < 18 ? '#1a1216' : '#0e0a12';
    }),
    box([dx, 0.4, -D.recess / 2], [D.half + 1, 0.4, D.recess / 2], ramp(tone(p.wall, -0.35))),
    box([dx, 0.6, 1.4], [D.half + 3, 0.6, 1.6], light),
  );
  const a = Math.atan2(D.recess, 4), len = Math.hypot(4, D.recess) / 2;
  for (const side of [-1, 1]) {
    parts.push(box([dx + side * (D.half - 1), D.spring / 2, -D.recess / 2], [len, D.spring / 2, 0.6], ramp(tone(p.wall, side < 0 ? -0.05 : 0.05)), yaw(-side * a)));
    for (let k = 0; k * 5.4 < D.spring; k++) parts.push(box([dx + side * (D.half + 2.6), k * 5.4 + 2.7, 0.6], [2.6 + (k % 2) * 0.6, 2.6, 1.2], k % 2 ? light : stone));
    const px = dx + side * (D.half + 9);
    parts.push(
      box([px, 1.5, 2.4], [3.4, 1.5, 2.6], stone),
      cyl([px, 3, 2.4], [px, D.apex + 3, 2.4], 2.4, (s) => (Math.cos(Math.atan2(s.z, s.x) * 6) > 0.6 && Math.abs(s.n[1]) < 0.9 ? stone : light)),
      box([px, D.apex + 4.2, 2.4], [3.6, 1.2, 2.8], light),
    );
  }
  for (let k = 0; k <= 10; k++) {
    const x = -(D.half + 1.5) + (k / 10) * 2 * (D.half + 1.5);
    parts.push(ball([dx + x, archY(x, D.half + 1.5, D.spring, D.apex + 1.5), 0.6], [3.2, 2.8, 2.2], k === 5 ? ramp(p.trim) : light));
  }
  parts.push(box([dx, D.apex + 6.4, 2.4], [D.half + 13, 1.4, 2.8], (s) => (s.y > 0.4 && s.n[1] < 0.5 ? ramp(p.trim) : light)));
}

/** Цоколь вдоль стены длиной len, прерванный у проёмов (середина и полуширина каждого). */
function plinthParts(parts: Part[], len: number, gaps: readonly (readonly [number, number])[], p: Palette): void {
  const plinth = ramp(tone(p.wall, 0.15)), sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  let from = -8;
  for (const [at, half] of [...sorted, [len + 8 + 40, 0] as const]) {
    const to = at - half - 1;
    if (to > from) parts.push(cyl([from, WALL.plinth, 1], [to, WALL.plinth, 1], WALL.plinth, plinth));
    from = at + half + 1;
  }
}

/** Лицевая грань задней стены с окнами и дверными проёмами: низ — на линии пола (кромка сверху — capModel). */
function backWallModel(w: number, theme: CastleTheme, gateX?: number): Model {
  const parts: Part[] = [], marks: Mark[] = [], p = PALETTES[theme], layout = LAYOUTS[theme], doors = layout.doors;
  const windows = layout.windows.map((k) => w * k), inGate = (x: number): boolean => gateX !== undefined && Math.abs(x - gateX) < GATE.half;
  wallBlock(parts, w, WALL.plinth * 2, WALL.face, 0, p.wall, p, 7,
    (x, y) => inGate(x) || windows.some((wx) => inNiche(x - wx, y)) || doors.some((dx) => inDoorway(x - dx, y)));
  const gaps = doors.map((dx) => [dx, DOORWAY.half] as const);
  plinthParts(parts, w, gateX === undefined ? gaps : [...gaps, [gateX, GATE.half + GATE.post.half * 2] as const], p);
  for (const wx of windows) windowParts(parts, marks, wx, p);
  for (const dx of doors) doorwayParts(parts, dx, p);
  if (gateX !== undefined) gatePosts(parts, w, gateX, WALL.face, WALL.floorY, p);
  return { parts, marks };
}

/**
 * Столб ворот — башенка на всю толщину стены, чуть выше её: верх — плитки той же сетки, что и кромка (светлее),
 * поэтому кромка плавно переходит в столб без ступеньки; под верхом золотой пояс, на макушке золотой шар.
 * c — середина основания (x, z), half — полуразмеры (x, z); floorY(z) — где на экране пол под глубиной z.
 */
function gatePost(parts: Part[], c: readonly [number, number], half: readonly [number, number], height: number, p: Palette, floorY: (z: number) => number, grid: CapGrid): void {
  const face = faceGrid(p, 0), base = tone(p.wall, 0.12), top = tone(p.wall, 0.58), trim = ramp(p.trim), lift = height * Math.cos(CAMERA_PITCH);
  parts.push(box([c[0], height / 2, c[1]], [half[0], height / 2, half[1]], (s) => {
    const x = c[0] + s.x * half[0], y = height / 2 + (s.y * height) / 2;
    if (s.n[1] > 0.5) return capTile(p, x, floorY(c[1] + s.z * half[1]) - lift, top, grid);
    if (Math.abs(y - (height - 3)) < 1.4) return trim;
    return stoneAt(face, x, y, base, 41);
  }));
  const r = GATE.finial;
  parts.push(ball([c[0], height + r - 0.6, c[1]], [r, r, r], trim));
}

/**
 * Пара столбов по краям ворот в задней или нижней стене: от внутреннего края стены до её лицевой грани
 * (и на 2 единицы вперёд — столб чуть выступает). wallH — высота стены, anchorY — экранная y пола у лицевой грани.
 */
function gatePosts(parts: Part[], w: number, gateX: number, wallH: number, anchorY: number, p: Palette): void {
  const P = GATE.post, sin = Math.sin(CAMERA_PITCH), back = WALL.cap * FLOOR_DEPTH, front = 2;
  for (const side of [-1, 1]) {
    gatePost(parts, [gateX + side * (GATE.half + P.half), (front - back) / 2], [P.half, (front + back) / 2], wallH + P.rise, p, (z) => anchorY + z * sin, tileGrid(w));
  }
}

/** Ворота в нижней стене: за проёмом сгущается тьма (полупрозрачно — герой в проёме виден). */
function paintFrontDark(c: CanvasRenderingContext2D, gateX: number, top: number): void {
  const R = GAME.resolution, y0 = Math.max(0, top) * R, y1 = WALL.front.h * R;
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(5, 6, 10, 0)'); g.addColorStop(1, 'rgba(5, 6, 10, 0.85)');
  c.fillStyle = g; c.fillRect((gateX - GATE.half) * R, y0, GATE.half * 2 * R, y1 - y0);
}

/** Ворота в задней стене: за проёмом — коридор, уходящий во тьму (рисуется под стеной, виден только в проёме). */
function paintBackCorridor(c: CanvasRenderingContext2D, gateX: number, p: Palette): void {
  const R = GAME.resolution, x = (gateX - GATE.half) * R, y0 = BACK_CAP_Y * R, y1 = WALL.floorY * R;
  const g = c.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, tone(p.floor[0], -0.2)); g.addColorStop(0.55, tone(p.floor[0], -0.65)); g.addColorStop(1, '#05060a');
  c.fillStyle = g; c.fillRect(x, y0, GATE.half * 2 * R, y1 - y0);
}

/**
 * Плитки на верху всех стен — одна сетка в координатах экрана (CAP_TILE): задняя, боковые и нижняя стены сходятся
 * без швов, как одна сплошная кладка. У каждой плитки светлая фаска сверху-слева и тень снизу-справа.
 */
const CAP_TILE = 14;
/** Сетка плиток кромки: ширина плитки и откуда отсчёт по x. Ряды — от верха задней кромки (BACK_CAP_Y) по всей карте. */
interface CapGrid { w: number; x0: number }

/** Плитки кромки чуть подогнаны по ширине: ровно от края до края карты, без обрезков. */
function tileGrid(w: number): CapGrid {
  return { w: w / Math.round(w / CAP_TILE), x0: 0 };
}
/** Блок кладки на верху стен: низ блока — его лицевая грань (темнее), сверху и слева — светлая фаска. */
const BLOCK = { band: 4, bevel: 1, joint: 1 } as const;
/**
 * Плитка верха стены — блок, затемнённый с нижней стороны; ряды сдвинуты на полблока, как кирпичи.
 * x, y — экран; base — цвет верха блока (у столбов ворот светлее).
 */
function capTile(p: Palette, x: number, y: number, base: string, grid: CapGrid): Shade {
  const ry = (y - BACK_CAP_Y) / CAP_TILE, row = Math.floor(ry), v = (ry - row) * CAP_TILE;
  const rx = (x - grid.x0 - (((row % 2) + 2) % 2) * (grid.w / 2)) / grid.w, col = Math.floor(rx), u = (rx - col) * grid.w;
  const k = (hash2(col, row, 31) - 0.5) * 0.08;   // блоки чуть разные по тону
  if (u > grid.w - BLOCK.joint || v > CAP_TILE - BLOCK.joint) return tone(p.wall, -0.6);
  if (v > CAP_TILE - BLOCK.joint - BLOCK.band) return v < CAP_TILE - BLOCK.joint - BLOCK.band + 1 ? tone(base, -0.12 + k) : tone(base, -0.42 + k);
  if (v < BLOCK.bevel || u < BLOCK.bevel) return tone(base, 0.22 + k);
  return tone(base, k);
}

/**
 * Кромка задней или нижней стены, вид сверху: плитки общей сетки; светлый край снизу — там, где кромка переходит
 * в видимую лицевую грань, и у торцов проёма ворот; тёмная линия сверху (topLine — где она нужна).
 * y0 — где на экране верх кромки; hole — проём ворот (x).
 */
function capModel(w: number, thick: number, y0: number, p: Palette, topLine: (x: number) => boolean, hole?: (x: number) => boolean): Model {
  const rim = ramp(tone(p.wall, 0.75)), outline = '#090b12', hx = w / 2, hz = thick / 2, grid = tileGrid(w);
  return {
    parts: [box([hx, 1, hz], [hx, 1, hz], (s) => {
      // вид сверху: x экрана — x модели, y экрана — z модели
      const x = hx + s.x * hx, across = hz + s.z * hz;
      if (hole?.(x)) return null;
      if (hole && (hole(x - 1.2) || hole(x + 1.2))) return rim;
      if (thick - across < 1.2) return rim;
      if (across < 1.2 && topLine(x)) return outline;
      return capTile(p, x, y0 + across, tone(p.wall, 0.42), grid);
    })],
  };
}

/** Кромка в текстуру: вид сверху, прямо в пиксели игры (x0, y0 — пиксели игры). */
function drawCap(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, model: Model): void {
  const R = GAME.resolution;
  drawModel(c, x0 * R, y0 * R, w, h, { x: 0, y: 0 }, model, { pitch: Math.PI / 2 });
}

/** Нижняя стена (слой поверх героя): лицевая грань кладки (кромка сверху — capModel); проём для ворот или двери со столбами. */
function frontWallModel(w: number, h: number, gateX: number | null, p: Palette): Model {
  const F = WALL.front, parts: Part[] = [];
  wallBlock(parts, w, -8, F.face, 0, tone(p.wall, -0.12), p, 9, gateX === null ? undefined : (x) => Math.abs(x - gateX) < GATE.half);
  if (gateX !== null) gatePosts(parts, w, gateX, F.face, h, p);
  return { parts };
}

/** Текстура стены: у комнат арены своя для каждого положения проёма (variant). */
function wallKey(key: string, part: 'back', variant?: number): string {
  return `${key}-wall-${part}${variant === undefined ? '' : `-${variant}`}`;
}

/** Рисует текстуру, только если её ещё нет (одинаковые стены у разных комнат рисуются один раз). */
function once(scene: Phaser.Scene, key: string, paint: () => void): () => void {
  return () => { if (!scene.textures.exists(key)) paint(); };
}

/** Пол и стены темы — задания для экрана загрузки (пол — плоский, стены — 3D); pass — проёмы комнаты арены. */
export function castleGroundJobs(scene: Phaser.Scene, key: string, w: number, h: number, theme: CastleTheme, pass: RoomPassages = {}): (() => void)[] {
  const p = PALETTES[theme], back = wallKey(key, 'back', pass.top);
  return [
    once(scene, back, () => hiresTexture(scene, back, w, WALL.texH, (c) => {
      const gateX = pass.top;
      if (gateX !== undefined) paintBackCorridor(c, gateX, p);
      // сначала кромка, потом стена: столбы ворот выше стены и встают поверх кромки
      drawCap(c, 0, BACK_CAP_Y, w, WALL.cap, capModel(w, WALL.cap, BACK_CAP_Y, p, () => true, gateX === undefined ? undefined : (x) => Math.abs(x - gateX) < GATE.half));
      drawModel(c, 0, 0, w, WALL.texH, { x: 0, y: WALL.floorY }, backWallModel(w, theme, gateX));
    })),
    once(scene, key, () => paintFloor(scene, key, w, h, theme)),
  ];
}

/** Где проём в стене комнаты арены: x середины ворот (пиксели карты) в задней или нижней стене. */
export function passageAt(pass: PassageConfig, w: number): number { return Math.round(w * pass.at); }

/** Все проёмы комнаты арены: вход и выход. */
export function roomPassages(w: number, list: readonly PassageConfig[]): RoomPassages {
  const out: RoomPassages = {};
  for (const pass of list) out[pass.side] = passageAt(pass, w);
  return out;
}

/** Решётка ворот — 3D: круглые прутья с остриями внизу и три перекладины, во всю ширину проёма; height — высота стены. */
function portcullisModel(height: number): Model {
  const iron = ramp('#4a505e'), tip = ramp('#c0c4d0'), half = GATE.half, parts: Part[] = [];
  for (let x = -half + 2.5; x <= half - 2.5; x += 5) parts.push(cyl([x, 2, -2], [x, height, -2], 1.3, iron), ball([x, 1.2, -2], [1.2, 2.2, 1.2], tip));
  for (const k of [0.3, 0.62, 0.94]) parts.push(cyl([-half, height * k, -1.2], [half, height * k, -1.2], 1, iron));
  return { parts };
}

/** Решётки ворот задней и нижней стены (высотой со свою стену); низ текстуры — на 1 пиксель ниже острий. */
export function portcullisJobs(scene: Phaser.Scene): (() => void)[] {
  const w = GATE.half * 2 + 2;
  const job = (key: string, height: number): () => void => {
    const th = Math.ceil(height * Math.cos(CAMERA_PITCH)) + 4;
    return once(scene, key, () => hiresTexture(scene, key, w, th, (c) => drawModel(c, 0, 0, w, th, { x: w / 2, y: th - 1 }, portcullisModel(height))));
  };
  return [job(PORTCULLIS.top, WALL.face), job(PORTCULLIS.front, WALL.front.face)];
}

/** Пол и стены темы сразу (если их ещё нет). */
export function paintCastleGround(scene: Phaser.Scene, key: string, w: number, h: number, theme: CastleTheme, pass: RoomPassages = {}): void {
  for (const job of castleGroundJobs(scene, key, w, h, theme, pass)) job();
}

/** Ставит пол и заднюю стену (за всеми объектами); pass — проёмы комнаты арены. */
export function addCastleGround(scene: Phaser.Scene, key: string, _w: number, pass: RoomPassages = {}): void {
  scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.ground);
  scene.add.image(0, 0, wallKey(key, 'back', pass.top)).setOrigin(0, 0).setScale(1 / GAME.resolution).setDepth(DEPTH.ground + 1);
}

export function castleFrontKey(theme: CastleTheme, gateX: number | null): string { return `castle-front-${theme}-${gateX ?? 'solid'}`; }

/**
 * Передний парапет и ближние башни — отдельный слой поверх героя: подходя к нижней стене, он заходит за кладку.
 * gateX — середина проёма для ворот (на аренах), null — сплошная стена.
 */
export function paintCastleFront(scene: Phaser.Scene, w: number, h: number, theme: CastleTheme, gateX: number | null): void {
  const key = castleFrontKey(theme, gateX);
  if (scene.textures.exists(key)) return;
  const p = PALETTES[theme], F = WALL.front, top = FRONT_CAP_TOP;
  hiresTexture(scene, key, w, F.h, (c) => {
    if (gateX !== null) paintFrontDark(c, gateX, top);
    drawCap(c, 0, Math.max(0, top), w, WALL.cap, capModel(w, WALL.cap, h - F.h + Math.max(0, top), p, () => true, gateX === null ? undefined : (x) => Math.abs(x - gateX) < GATE.half));
    drawModel(c, 0, 0, w, F.h, { x: 0, y: F.h }, frontWallModel(w, h, gateX, p));
  });
}

/** Ставит передний парапет поверх всего на карте и препятствия у оснований четырёх угловых башен (если они есть). */
export function addCastleFront(scene: Phaser.Scene, _colliders: Colliders, w: number, h: number, theme: CastleTheme, gateX: number | null): void {
  paintCastleFront(scene, w, h, theme, gateX);
  scene.add.image(0, h - WALL.front.h, castleFrontKey(theme, gateX)).setOrigin(0, 0).setScale(1 / GAME.resolution).setDepth(h + 1);
}

/** Мерцающие лучи света из витражей и пылинки, медленно плывущие в них. */
export function addCastleAmbience(scene: Phaser.Scene, w: number, theme: CastleTheme): void {
  const layout = LAYOUTS[theme];
  const key = `castle_shaft_${theme}`;
  if (!scene.textures.exists(key)) {
    texture(scene, key, SHAFT.w, SHAFT.h, (c) => {
      const g = c.createLinearGradient(0, 0, 0, SHAFT.h);
      g.addColorStop(0, `${PALETTES[theme].light}30`); g.addColorStop(1, `${PALETTES[theme].light}00`);
      c.fillStyle = g; c.beginPath();
      c.moveTo(0, 0); c.lineTo(26, 0); c.lineTo(SHAFT.w, SHAFT.h); c.lineTo(SHAFT.w - 85, SHAFT.h); c.closePath(); c.fill();
    });
  }
  layout.windows.map((k) => w * k).forEach((x, i) => {
    const shaft = scene.add.image(x - 13, CASTLE_BOUNDS.top, key).setOrigin(0, 0).setDepth(DEPTH.decals + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
    scene.tweens.add({ targets: shaft, alpha: 1, duration: 2600 + i * 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let k = 0; k < SHAFT.dust; k++) {
      const t = Math.random();
      const mote = scene.add.image(x - 13 + t * 67 + Math.random() * 26, CASTLE_BOUNDS.top + t * SHAFT.h, TEXTURES.px)
        .setTint(0xf0e6c8).setScale(0.5).setAlpha(0).setDepth(DEPTH.fx - 40);
      scene.tweens.add({ targets: mote, alpha: Phaser.Math.FloatBetween(0.3, 0.7), duration: 1200, delay: Math.random() * 2000, yoyo: true, hold: 2000, repeat: -1, repeatDelay: Math.random() * 1500 });
      scene.tweens.add({ targets: mote, y: mote.y - Phaser.Math.Between(8, 20), x: mote.x + Phaser.Math.Between(-6, 6), duration: Phaser.Math.Between(3000, 6000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  });
}
