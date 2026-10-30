import Phaser from 'phaser';
import { GAME } from '../configs/game';
import { MODEL_AXES as MODEL_AXES_I, renderModel, type Axes, type Mark, type Part, type Surface, type Vec } from './Rig3D';
import { addOutline, type Ramp as Ramp3 } from './Volume';
import { readableCanvas } from './CastleModels';

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

/** Размер иконки в пикселях игры. */
export const ICON_SIZE = 16;

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

// ---------------- иконки — 3D-модели ----------------
/*
 * Иконки 16x16 пикселей игры — маленькие 3D-модели (Rig3D.ts), нарисованные в GAME.resolution раз детальнее:
 * объём по нормали, блики и контур. Модель строится вокруг центра иконки, 1 единица = 1 пиксель игры, y вверх.
 */
type Shape3 = Part['paint'];
const I = {
  ruby: ['#ffd8e0', '#ff7a92', '#e0304e', '#a8183a', '#6a0c24'],
  glass: ['#ffffff', '#dceef6', '#aac4d0', '#7a92a2', '#4a5a6a'],
  potion: ['#ffb0c0', '#ff5a78', '#d02848', '#981c34', '#5a0c1c'],
  cork: ['#e0b080', '#c8945a', '#9a6a3a', '#6a4426', '#3a2414'],
  gold: ['#fff8d0', '#ffe070', '#e8bc40', '#b8862a', '#7a5214'],
  goldDark: ['#f0d070', '#d0a040', '#a87a26', '#7a5214', '#4a300a'],
  leather: ['#d8a070', '#b07a48', '#8a5a34', '#6a4226', '#3e2414'],
  leatherDark: ['#8a5a34', '#6a4226', '#4a2a16', '#331c0e', '#1e0e06'],
  feather: ['#ffffff', '#eef6fc', '#c8dcf0', '#9ab4d4', '#6a84a8'],
  steel: ['#ffffff', '#e8eef4', '#c2cad6', '#8e98aa', '#5a6476'],
  iron: ['#d8dee8', '#aab2c0', '#7e8898', '#5a6272', '#383e4a'],
  mail: ['#c8d0dc', '#9aa4b4', '#727c8c', '#525a68', '#343a46'],
  mailDark: ['#7a8494', '#5a6272', '#424a58', '#2e343e', '#1c2028'],
  slate: ['#7a86b0', '#5a6690', '#424c70', '#2e3654', '#1c2238'],
} as const satisfies Record<string, Ramp3>;
/** Небольшой наклон камеры к иконке: видна и передняя сторона, и чуть-чуть верх. */
const ICON_PITCH = 0.2;
const GLINT = '#ffffff';

const icBall = (c: Vec, r: Vec, paint: Shape3, axes?: Axes): Part => ({ shape: axes ? { kind: 'ball', c, r, axes } : { kind: 'ball', c, r }, paint });
const icRod = (a: Vec, b: Vec, r: number, paint: Shape3): Part => ({ shape: { kind: 'rod', a, b, r }, paint });
const icBox = (c: Vec, r: Vec, axes: Axes, paint: Shape3): Part => ({ shape: { kind: 'box', c, r, axes }, paint });
/** Оси, повёрнутые в плоскости экрана на угол a (радианы, против часовой): вторая ось — «вверх» детали. */
function tilt(a: number): Axes { return [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]]; }

interface IconModel { parts: Part[]; marks?: Mark[]; facing?: number; pitch?: number }

/** Кривая сердца (x² + y² − 1)³ − x²y³ ≤ 0, растянутая на круг радиуса 1: внутри ли точка. */
function inHeart(x: number, y: number): boolean {
  const u = x * 1.18, v = y * 1.2 + 0.12;
  return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0;
}

/** Сердце-рубин: одно гладкое выпуклое тело, обрезанное по кривой сердца, — без складок; блики на левой доле. */
function heartModel(): IconModel {
  return {
    parts: [icBall([0, 0, 0], [7.6, 7.4, 4.2], (s) => (inHeart(s.x, s.y) ? I.ruby : null))],
    marks: [{ p: [-3.8, 3.4, 3.4], color: GLINT, n: [0, 0, 1] }, { p: [-3, 4.2, 3.1], color: '#ffe8ee', n: [0, 0, 1] }, { p: [-4.6, 2.6, 3.2], color: '#ffe8ee', n: [0, 0, 1] }],
  };
}

/** Флакон: стеклянная колба, в нижней части — эликсир с ярким краем, горлышко, венчик и пробка. */
function potionModel(): IconModel {
  return {
    parts: [
      icBall([0, -2.2, 0], [5.2, 5, 5], (s) => (s.y > 0.16 ? I.glass : s.y > 0.04 ? I.ruby : I.potion)),
      icRod([0, 2, 0], [0, 4.8, 0], 1.7, I.glass),
      icBall([0, 5, 0], [2.4, 0.8, 2.4], I.glass),
      icRod([0, 5.6, 0], [0, 7, 0], 1.4, I.cork),
    ],
    marks: [{ p: [-2.6, 0.6, 4.2], color: GLINT, n: [0, 0, 1] }, { p: [-3.2, -0.6, 3.8], color: GLINT, n: [0, 0, 1] }, { p: [1.8, -4.6, 4.4], color: '#ffc8d4', n: [0, 0, 1] }],
  };
}

/** Монета: толстый диск, чуть повёрнутый, — видно ребро; на лицевой стороне кольцо и выпуклый крест. */
function coinModel(): IconModel {
  return {
    facing: -0.45,
    parts: [icBall([0, 0, 0], [7, 7, 1.7], (s) => {
      if (s.z < 0.35) return I.goldDark;   // ребро
      const r = Math.hypot(s.x, s.y);
      if (r > 0.64 && r < 0.76) return I.goldDark;
      return (Math.abs(s.x) < 0.13 || Math.abs(s.y) < 0.13) && r < 0.5 ? I.gold : r < 0.64 ? I.goldDark : I.gold;
    })],
    marks: [{ p: [-3.6, 3.4, 1.4], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Крылатый сапог (рывок): подошва, каблук, носок, голенище с отворотом, золотые пряжки и крыло из перьев сзади. */
function bootModel(): IconModel {
  const feather = (c: Vec, a: number, len: number): Part => icBall(c, [0.9, len, 0.5], I.feather, tilt(a));
  return {
    facing: -0.35, pitch: 0.25,
    parts: [
      icBox([1, -5.6, 0], [5.2, 0.7, 2.1], MODEL_AXES_I, I.leatherDark),
      icBox([-2.6, -4.8, 0], [1.5, 1.3, 2], MODEL_AXES_I, I.leatherDark),
      icBall([1.8, -3.5, 0], [4.6, 2.3, 2.3], I.leather),
      icRod([-1.8, -3.4, 0], [-2.2, 3.2, 0], 2.5, I.leather),
      icBall([-2.2, 3.8, 0], [3.1, 1.3, 3.1], I.leatherDark),
      feather([-5.2, 3.6, -0.8], 0.9, 2.8), feather([-5.8, 1.6, -0.8], 1.25, 2.6), feather([-5.6, -0.4, -0.8], 1.55, 2.2),
    ],
    marks: [0.8, -1.2].flatMap((y) => [{ p: [-0.4, y, 0] as Vec, color: '#ffe070', n: [1, 0, 0] as Vec }, { p: [-0.4, y + 0.6, 0.6] as Vec, color: '#ffe070', n: [1, 0, 0] as Vec }]),
  };
}

/** Меч по диагонали: навершие-рубин, рукоять, гарда поперёк, клинок с острием. */
function swordModel(): IconModel {
  const d: Vec = [Math.SQRT1_2, Math.SQRT1_2, 0], q: Vec = [-Math.SQRT1_2, Math.SQRT1_2, 0], axes: Axes = [q, d, [0, 0, 1]];
  const at = (t: number): Vec => [d[0] * t, d[1] * t, 0];
  return {
    parts: [
      icBall(at(-7), [1.1, 1.1, 1.1], I.ruby),
      icRod(at(-6.2), at(-3.4), 0.75, I.leather),
      icBox(at(-2.9), [3, 0.6, 0.8], axes, I.gold),
      icBox(at(2.4), [1, 4.8, 0.45], axes, (s) => (s.y > 0.7 && Math.abs(s.x) > (1 - s.y) * 3.4 ? null : s.x < -0.1 ? I.steel : I.iron)),
    ],
    marks: [{ p: at(0.5), color: GLINT, n: [0, 0, 1] }],
  };
}

/** Узор кольчуги на иконке. */
function mailIcon(s: Surface): Ramp3 {
  const row = Math.floor((s.y + 1) * 6);
  return row % 2 === 0 && Math.floor((s.x + 1) * 7 + row * 0.5) % 2 === 0 ? I.mailDark : I.mail;
}

/** Кольчуга: рубаха с рукавами, золотой ворот, кожаный пояс с пряжкой. */
function armorModel(): IconModel {
  return {
    parts: [
      icRod([-4, 3.8, 0], [-6.4, -1, 0.4], 1.9, mailIcon), icRod([4, 3.8, 0], [6.4, -1, 0.4], 1.9, mailIcon),
      icBall([0, 0, 0], [5, 6.6, 3], (s) => (s.y > 0.84 ? I.gold : s.y < -0.6 && s.y > -0.82 ? I.leather : mailIcon(s))),
    ],
    marks: [{ p: [0, -4.7, 2.2], color: '#ffe070', n: [0, 0, 1] }, { p: [-2.2, 3.4, 2.4], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Кошель: мешочек с клапаном, золотая застёжка, ремешок. */
function satchelModel(): IconModel {
  return {
    parts: [
      icBall([0, -1.6, 0], [6, 4.6, 3.2], I.leather),
      icBall([0, 0.8, 0.8], [5.4, 2.6, 2.8], (s) => (s.z < -0.3 ? null : I.leatherDark)),
      icBall([0, -0.6, 3.1], [1.2, 1.2, 0.8], I.gold),
      icRod([-4.4, 1.6, 0], [-1.4, 6.2, 0], 0.65, I.leatherDark), icRod([4.4, 1.6, 0], [1.4, 6.2, 0], 0.65, I.leatherDark), icRod([-1.4, 6.2, 0], [1.4, 6.2, 0], 0.65, I.leatherDark),
    ],
    marks: [{ p: [-3.4, -0.8, 2.6], color: '#e8b888', n: [0, 0, 1] }],
  };
}

/** Шлем: железный купол с тёмным ободом, нащёчники и назатыльник, в проёме лица — темнота, наносник, заклёпки. */
function helmetModel(): IconModel {
  // оболочка оставлена над ободом, по бокам (нащёчники) и сзади; спереди посередине — проём лица
  const shell = (s: Surface): Ramp3 | null => {
    const sides = Math.abs(s.x) > 0.5 || s.z < -0.3;
    if (s.y < -0.2 && !(sides && s.y > -0.85)) return null;
    return s.y < 0 && s.y > -0.2 ? I.mailDark : I.iron;
  };
  return {
    facing: -0.35,
    parts: [
      icBall([0, -0.4, 0], [5.5, 6.2, 5.1], (s) => (s.y > -0.9 ? '#1c1a22' : null)),
      icBall([0, 0, 0], [6.1, 6.9, 5.7], shell),
      icBox([0, -2.6, 5.5], [0.8, 2.6, 0.55], MODEL_AXES_I, I.iron),
    ],
    marks: [{ p: [-2.4, 5.4, 3.2], color: GLINT, n: [0, 0, 1] }, { p: [0, 7, 0.6], color: '#ffe070', n: [0, 1, 0] }, { p: [-4.4, 0.2, 3.6], color: '#ffe070', n: [0, 0, 1] }],
  };
}

/** Поножи: выпуклые железные щитки голеней на ремнях, наколенники и пластины на стопах. */
function greavesModel(): IconModel {
  const leg = (x: number): Part[] => [
    icBall([x, -6.2, 1], [2.3, 1.1, 2.7], I.iron),
    icBall([x, -1.8, 0], [2.4, 4.6, 2], (s) => (Math.abs(s.y + 0.15) < 0.09 || Math.abs(s.y - 0.45) < 0.09 ? I.leatherDark : I.iron)),
    icBall([x, 3.6, 0.6], [2.7, 2.3, 2.5], I.steel),
  ];
  return { facing: -0.3, parts: [...leg(-3), ...leg(3)], marks: [{ p: [-3.8, 4.6, 2.6], color: GLINT, n: [0, 0, 1] }, { p: [2.2, 4.6, 2.6], color: GLINT, n: [0, 0, 1] }] };
}

/** Латная перчатка: короткий раструб с золотой каймой, ладонь, пальцы, большой палец, стальная пластина на костяшках. */
function gloveModel(): IconModel {
  return {
    facing: -0.3,
    parts: [
      icRod([0, -6.4, 0], [0, -3.6, 0], 3.2, I.leather),
      icBall([0, -6.6, 0], [3.9, 1.2, 3.5], I.gold),
      icBall([0, -0.8, 0], [3.9, 3.5, 2.4], I.leather),
      ...[-2.4, -0.8, 0.8, 2.4].map((x) => icRod([x, 1.6, 0.3], [x * 1.05, 5.2, 0.9], 1, I.leather)),
      icRod([3.4, -1.6, 0.4], [5.6, 0.8, 0.9], 1.1, I.leather),
      icBall([0, 1.8, 1.4], [3.9, 1.2, 1.4], I.steel),
    ],
    marks: [{ p: [-1.8, 2.4, 2.5], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Модель → текстура size x size пикселей игры (в GAME.resolution раз детальнее) с тонким контуром. */
function modelTexture(scene: Phaser.Scene, key: string, model: IconModel, size = ICON_SIZE): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const F = size * GAME.resolution;
  const tex = readableCanvas(scene, key, F, F);
  if (!tex) return;
  const c = tex.getContext(); c.imageSmoothingEnabled = false;
  const img = c.createImageData(F, F);
  renderModel({ data: img.data, width: F, x: 0, y: 0, w: F, h: F }, F / 2, F / 2, model.parts, model.marks ?? [], { facing: model.facing ?? 0, pitch: model.pitch ?? ICON_PITCH, scale: GAME.resolution });
  c.putImageData(img, 0, 0);
  addOutline(c, F, F, F, F);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Иконка на сцене: текстура детальнее пикселей игры — уменьшаем до размера ICON_SIZE (умножить на scale). */
export function addIcon(scene: Phaser.Scene, x: number, y: number, key: string, scale = 1): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setScale(scale / GAME.resolution);
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
  const tex = readableCanvas(scene, key, w, h);
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

/** Иконки интерфейса и лавки — 3D-модели, по заданию на иконку. */
export function iconTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const icons: [string, () => IconModel][] = [
    ['ui_heart', heartModel], ['ui_potion', potionModel], ['ui_dash', bootModel],
    ['castle_coin', coinModel], ['castle_sword', swordModel], ['castle_armor', armorModel],
    ['castle_satchel', satchelModel], ['castle_potion', potionModel],
    ['item_helmet', helmetModel], ['item_greaves', greavesModel], ['item_gloves', gloveModel],
  ];
  return icons.map(([key, model]) => () => modelTexture(scene, key, model()));
}
