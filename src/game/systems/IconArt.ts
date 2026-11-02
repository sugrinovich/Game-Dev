import Phaser from 'phaser';
import { CANVAS_SCALE, GAME } from '../configs/game';
import { add, MODEL_AXES as MODEL_AXES_I, mul, renderModel, type Axes, type Mark, type Part, type Shade, type Surface, type Vec } from './Rig3D';
import { addOutline, addVolume, type Ramp as Ramp3 } from './Volume';
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
  wood: ['#d8a468', '#b07c44', '#8a5a2e', '#64401e', '#3e2610'],
  bone: ['#fffaf0', '#ece4cc', '#cfc4a4', '#a89c7c', '#7a7058'],
  rust: ['#e0a070', '#c07848', '#9a5430', '#6e3a20', '#4a2414'],
  wrap: ['#7a7896', '#5a5874', '#403e58', '#2c2a40', '#1a1828'],
  sapphire: ['#d8ecff', '#8ac0ff', '#4a8ae8', '#2a5ab0', '#16346e'],
  royal: ['#8aa8e8', '#5a7ac8', '#3a58a0', '#263c74', '#16244a'],
  parchment: ['#fff4dc', '#f0dcb4', '#d8bc8c', '#b0946a', '#7a6448'],
  emerald: ['#e0ffd8', '#8ae890', '#3ab860', '#1e7a3c', '#0e4a22'],
  ice: ['#ffffff', '#e4f6ff', '#b4e0f8', '#7ab4dc', '#4a7aa8'],
  ember: ['#fff8c0', '#ffd060', '#ff8a2a', '#d0401a', '#7a1a0c'],
  plate: ['#ffffff', '#e8eef6', '#c6cedc', '#9aa4b6', '#6e788c'],
  plume: ['#ff9aa4', '#e8505e', '#c8303c', '#8a1a26', '#540c14'],
  darkWood: ['#8a6448', '#64462e', '#4a321e', '#321e10', '#1e1008'],
  shadow: ['#9a86c8', '#6a5498', '#4a3874', '#2e2250', '#1a1230'],
  spirit: ['#ffffff', '#d8faff', '#9ae8f4', '#5ab8c8', '#2a7a8a'],
  leaf: ['#b8f0a0', '#7ac860', '#4a9a40', '#2e6a2a', '#1a4018'],
  cloth: ['#ff8a9a', '#d84a5a', '#a82a3a', '#701a26', '#400c14'],
  blood: ['#ffc8cc', '#ff5a68', '#d01e30', '#8a0a1c', '#44040e'],
  darkOrb: ['#b07ae8', '#6a3aa8', '#3a1a5a', '#1e0c2e', '#0a0410'],
  emberDark: ['#c8502a', '#8a2e1a', '#5a1e14', '#3a120c', '#200806'],
} as const satisfies Record<string, Ramp3>;
/** Небольшой наклон камеры к иконке: видна и передняя сторона, и чуть-чуть верх. */
const ICON_PITCH = 0.2;
const GLINT = '#ffffff';

const icBall = (c: Vec, r: Vec, paint: Shape3, axes?: Axes): Part => ({ shape: axes ? { kind: 'ball', c, r, axes } : { kind: 'ball', c, r }, paint });
const icRod = (a: Vec, b: Vec, r: number, paint: Shape3): Part => ({ shape: { kind: 'rod', a, b, r }, paint });
const icBox = (c: Vec, r: Vec, axes: Axes, paint: Shape3): Part => ({ shape: { kind: 'box', c, r, axes }, paint });
/** Оси, повёрнутые в плоскости экрана на угол a (радианы, против часовой): вторая ось — «вверх» детали. */
function tilt(a: number): Axes { return [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]]; }

/** Наклон граней клинка к ребру (радианы): левая грань ловит свет, правая — в тени, как у настоящей стали. */
const BEVEL = 0.55;
/**
 * Клинок с ребром посередине (ромб в сечении): два бруска, наклонённых к ребру, — грань на свету и грань в тени, а не
 * плоская заливка. c, r, axes — как у бруска (r[0] — полуширина, r[1] — полудлина); paint получает x по всей ширине
 * клинка (−1 — левая кромка, 1 — правая), как у одного бруска.
 */
function bevelBlade(c: Vec, r: Vec, axes: Axes, paint: (s: Surface) => Shade): Part[] {
  const [ax, ay, az] = axes, cos = Math.cos(BEVEL), sin = Math.sin(BEVEL), hw = r[0] / (2 * cos);
  return [-1, 1].map((side): Part => {
    // наружная кромка половины уходит назад, нормаль грани смотрит в её сторону
    const across = add(mul(ax, cos), mul(az, -side * sin)), face = add(mul(az, cos), mul(ax, side * sin));
    return icBox(add(c, mul(across, side * hw)), [hw, r[1], r[2] / 2], [across, ay, face], (s) => paint({ ...s, x: (s.x + side) / 2 }));
  });
}
/** Сталь клинка: кромка (edge) светлее — заточена, дол (fuller) вдоль ребра темнее; острие срезано (tip — доля длины). */
function steelPaint(body: Ramp3, edge: Ramp3, fuller: Ramp3, tip: number, sharp: number): (s: Surface) => Shade {
  return (s) => {
    if (s.y > tip && Math.abs(s.x) > (1 - s.y) * sharp) return null;
    if (Math.abs(s.x) > 0.78) return edge;
    return Math.abs(s.x) < 0.16 && s.y < tip - 0.05 ? fuller : body;
  };
}

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
      ...bevelBlade(at(2.4), [1, 4.8, 0.45], axes, steelPaint(I.iron, I.steel, I.mail, 0.7, 3.4)),
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
function satchelModel(): IconModel { return bagIcon(I.leather, I.leatherDark, I.gold, 1); }
/** Походная сумка: крупнее, зелёное сукно, железная застёжка. */
function travelBagModel(): IconModel { return bagIcon(I.leaf, I.leatherDark, I.iron, 1.12); }
/** Сумка рыцаря: самая большая, синяя с золотым гербовым замком. */
function knightBagModel(): IconModel { return bagIcon(I.royal, I.sapphire, I.gold, 1.22); }
/** Сумка: мешок (body), клапан (flap), застёжка (clasp); k — во сколько раз крупнее старой. */
function bagIcon(body: Ramp3, flap: Ramp3, clasp: Ramp3, k: number): IconModel {
  return {
    parts: [
      icBall([0, -1.6, 0], [6 * k, 4.6 * k, 3.2], body),
      icBall([0, 0.8 * k, 0.8], [5.4 * k, 2.6 * k, 2.8], (s) => (s.z < -0.3 ? null : flap)),
      icBall([0, -0.6, 3.1], [1.2 * k, 1.2 * k, 0.8], clasp),
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

// ---------------- новое оружие и украшения ----------------
const TAU = Math.PI * 2;
/** Оси «по диагонали снизу-слева вверх-вправо»: d — вдоль оружия, q — поперёк (влево-вверх), z — к зрителю. */
const DIAG: Vec = [Math.SQRT1_2, Math.SQRT1_2, 0], ACROSS: Vec = [-Math.SQRT1_2, Math.SQRT1_2, 0];
const DIAG_AXES: Axes = [ACROSS, DIAG, [0, 0, 1]];
const alongDiag = (t: number, q = 0): Vec => [DIAG[0] * t + ACROSS[0] * q, DIAG[1] * t + ACROSS[1] * q, 0];

/** Топор орка: топорище по диагонали в кожаной обмотке, лезвие полумесяцем с зазубринами, на обухе — костяной шип. */
function orcAxeModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-7), alongDiag(6.4), 0.75, I.wood),
      icRod(alongDiag(-5.4), alongDiag(-2.6), 0.9, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.leather : I.leatherDark)),
      icBall(alongDiag(3.4, 2.8), [2.9, 3.3, 0.9], (s) => {
        if (s.x < -0.2 && Math.abs(s.y) > 0.35 + (s.x + 1) * 0.5) return null;   // к топорищу уже — полумесяц
        if (s.x > 0.72 && Math.floor((s.y + 1) * 4) % 2 === 0) return null;      // зазубрины
        return s.x > 0.45 ? I.plate : I.iron;
      }, DIAG_AXES),
      icRod(alongDiag(3.4, -0.4), alongDiag(4.2, -3.6), 0.55, I.bone),
    ],
    marks: [{ p: alongDiag(3, 3.6), color: GLINT, n: [0, 0, 1] }, { p: alongDiag(2.2, 1.6), color: '#8a5a3a', n: [0, 0, 1] }],
  };
}

/** Ржавая катана: клинок звеньями чуть выгнут, ржавые пятна, круглая цуба, оплётка рукояти ромбами. */
function katanaModel(): IconModel { return katanaIcon(null); }
/** Огненная катана: тот же клинок раскалён — светлая кромка, тёмно-алый обух, искры по клинку. */
function fireKatanaModel(): IconModel { return katanaIcon({ edge: I.ember, back: I.emberDark }); }
/** Катана; fire — раскалённый клинок (без ржавчины). */
function katanaIcon(fire: { edge: Ramp3; back: Ramp3 } | null): IconModel {
  const at = (t: number): Vec => alongDiag(-1.6 + t * 9.6, -1.1 * t * t);
  const parts: Part[] = [
    icRod(alongDiag(-7.4), alongDiag(-2.6), 0.7, (s) => (((s.y + 1) * 4 + (s.x + 1) * 1.5) % 1 < 0.5 ? I.wrap : I.bone)),
    icBall(alongDiag(-2.2), [1.9, 0.45, 1.9], I.iron, DIAG_AXES),
  ];
  for (let i = 0; i < 3; i++) {
    const a = at(i / 3), b = at((i + 1) / 3), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), last = i === 2;
    const dir: Vec = [dx / len, dy / len, 0], axes: Axes = [[-dir[1], dir[0], 0], dir, [0, 0, 1]];
    parts.push(...bevelBlade([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], [0.9, len / 2 + 0.1, 0.4], axes, (s) => {
      if (last && s.y > 0 && s.x < s.y * 2 - 1) return null;   // острие: срез от обуха к кромке
      if (fire) return s.x > 0.3 ? fire.edge : fire.back;
      if (Math.sin(s.y * 5 + i * 2.3) > 0.55 && s.x < 0.3) return I.rust;
      return s.x > 0.55 ? I.plate : s.x > 0 ? I.steel : I.iron;
    }));
  }
  const glints = fire ? [0.25, 0.55, 0.85].map((t) => ({ p: at(t), color: '#fff4c0', n: [0, 0, 1] as Vec })) : [];
  return { parts, marks: [{ p: at(0.45), color: GLINT, n: [0, 0, 1] }, ...glints] };
}

/** Ледяной двуручник: длинный широкий клинок изо льда, гарда и навершие — сапфир, обмотка синяя. */
function iceGreatswordModel(): IconModel {
  const at = (t: number): Vec => alongDiag(t);
  return {
    parts: [
      icBall(at(-8.2), [1.3, 1.3, 1.3], I.sapphire),
      icRod(at(-7.2), at(-3.8), 0.8, (s) => (Math.floor((s.y + 1) * 4) % 2 ? I.royal : I.leatherDark)),
      icRod(alongDiag(-3.2, -3.6), alongDiag(-3.2, 3.6), 0.75, I.sapphire),
      ...bevelBlade(at(3), [1.6, 6.2, 0.5], DIAG_AXES, steelPaint(I.ice, I.feather, I.sapphire, 0.78, 4.5)),
    ],
    marks: [{ p: at(1.4), color: GLINT, n: [0, 0, 1] }, { p: at(5), color: '#e0f8ff', n: [0, 0, 1] }],
  };
}

/** Посох тьмы: тёмное древко с серебряными кольцами, на навершии в рогатой оправе — чёрная сфера с лиловым отсветом. */
function darkStaffModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-8), alongDiag(3.2), 0.75, (s) => (Math.abs(((s.y + 1) * 4) % 1 - 0.5) < 0.1 ? I.iron : I.darkWood)),
      icBall(alongDiag(3.4), [1.5, 0.8, 1.5], I.iron, DIAG_AXES),
      icRod(alongDiag(3.6, 1.4), alongDiag(6.6, 2.6), 0.45, I.iron), icRod(alongDiag(3.6, -1.4), alongDiag(6.6, -2.6), 0.45, I.iron),
      icBall(alongDiag(6), [2.6, 2.6, 2.6], I.darkOrb),
    ],
    marks: [{ p: alongDiag(5.4, 0.9), color: '#d8b0ff', n: [0, 0, 1] }, { p: alongDiag(7.6, -1.8), color: '#a060e0' }, { p: alongDiag(8.2, 1.6), color: '#a060e0' }],
  };
}

/** Кровавый размах: из капли крови веером торчат алые осколки-клинки. */
function bloodSweepModel(): IconModel {
  const shard = (a: number, h: number, w: number): Part => icBox([-Math.sin(a) * h / 2, -3 + Math.cos(a) * h / 2, 0], [w, h / 2, w * 0.6], tilt(a), (s) => {
    if (s.y > 0.4 && Math.abs(s.x) > (1 - s.y) / 0.6) return null;   // острие
    return s.x < -0.2 ? I.blood : I.ruby;
  });
  return {
    facing: -0.3,
    parts: [shard(-0.9, 9, 1.3), shard(-0.3, 12, 1.6), shard(0.35, 11, 1.5), shard(0.95, 8, 1.2), icBall([0, -3.6, 0.6], [3.4, 3, 2.6], I.blood)],
    marks: [{ p: [-1, -3, 3], color: '#ffe0e4', n: [0, 0, 1] }, { p: [-1.6, 4, 1.4], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Деревянный лук со стрелой: плечи дугой, обмотка у рукояти, роговые концы, тетива; стрела с наконечником и оперением. */
function bowIconModel(): IconModel {
  const n = 8, pt = (i: number): Vec => { const t = (i / n) * 2 - 1; return [-2.6 + t * t * 3.2 - 0.6 * t, t * 7.2, 0]; };
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) parts.push(icRod(pt(i), pt(i + 1), Math.abs(i + 0.5 - n / 2) < 1 ? 0.85 : 0.65, Math.abs(i + 0.5 - n / 2) < 1 ? I.leatherDark : I.wood));
  parts.push(icBall(pt(0), [0.75, 0.75, 0.75], I.bone), icBall(pt(n), [0.75, 0.75, 0.75], I.bone));
  parts.push({ shape: { kind: 'rod', a: pt(0), b: pt(n), r: 0.35 }, paint: () => '#e8e0c8' });
  // стрела поперёк: древко, наконечник, оперение
  parts.push(icRod([-5.6, 0.6, 0.8], [6, 0.6, 0.8], 0.4, I.wood), icBox([6.6, 0.6, 0.8], [1.2, 0.8, 0.3], MODEL_AXES_I, (s) => (Math.abs(s.y) > 1 - s.x ? null : I.steel)));
  for (const dy of [-0.9, 0.9]) parts.push(icBall([-5.4, 0.6 + dy, 0.8], [1.3, 0.55, 0.3], I.potion));
  return { parts, facing: -0.15 };
}

/** Сломанное кольцо силы: золотой обод с отломанным куском, на нём треснувший рубин — из трещины сочится алый свет. */
function ringModel(): IconModel {
  const parts: Part[] = [], R = 5, gap = 2;
  for (let i = 0; i < 18; i++) {
    if (i >= 12 && i < 12 + gap) continue;   // отломанный кусок
    const a = (i / 18) * TAU - Math.PI / 2;
    parts.push(icBall([Math.cos(a) * R, Math.sin(a) * R * 0.8 - 1.2, Math.sin(a) * 1.4], [1.15, 1.15, 1.15], i % 3 ? I.gold : I.goldDark));
  }
  parts.push(icBox([0, 3.6, 0.6], [1.9, 1, 1.4], MODEL_AXES_I, I.goldDark), icBall([0, 4.8, 0.8], [2.2, 2, 1.8], I.ruby));
  return {
    parts, pitch: 0.35,
    marks: [{ p: [-0.8, 5.9, 2.4], color: GLINT, n: [0, 0, 1] }, { p: [0.4, 4.6, 2.6], color: '#2a0810', n: [0, 0, 1] }, { p: [0.9, 4.1, 2.5], color: '#2a0810', n: [0, 0, 1] }, { p: [1.3, 3.7, 2.3], color: '#ff6a5a', n: [0, 0, 1] }],
  };
}

/** Потерянное ожерелье скорости: серебряная цепочка подковой, подвеска — голубой кристалл с белыми крылышками. */
function necklaceModel(): IconModel {
  const parts: Part[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (0.05 + (i / 14) * 0.9);
    parts.push(icBall([Math.cos(a) * 6, 6.4 - Math.sin(a) * 7.4, 0], [0.75, 0.75, 0.75], i % 2 ? I.steel : I.iron));
  }
  parts.push(
    icBall([0, -2.6, 0.6], [1.9, 2.8, 1.5], I.sapphire),
    icBall([-2.8, -1.6, 0.2], [2, 0.9, 0.4], I.feather, tilt(0.5)), icBall([2.8, -1.6, 0.2], [2, 0.9, 0.4], I.feather, tilt(-0.5)),
    icBall([0, 0.6, 0.6], [1, 0.7, 0.8], I.gold),
  );
  return { parts, marks: [{ p: [-0.7, -1.6, 2.1], color: GLINT, n: [0, 0, 1] }] };
}

/** Меч рыцаря (редкий): длинный клинок с долом, широкая золотая гарда с расширенными концами, сапфир в навершии. */
function knightSwordModel(): IconModel {
  const at = (t: number): Vec => alongDiag(t);
  return {
    parts: [
      icBall(at(-7.4), [1.25, 1.25, 1.25], I.sapphire),
      icRod(at(-6.4), at(-3.8), 0.75, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.royal : I.leatherDark)),
      icRod(alongDiag(-3.2, -3.4), alongDiag(-3.2, 3.4), 0.7, I.gold),
      icBall(alongDiag(-3.2, 3.8), [0.9, 0.9, 0.9], I.gold), icBall(alongDiag(-3.2, -3.8), [0.9, 0.9, 0.9], I.gold),
      ...bevelBlade(at(2.6), [1.15, 5.4, 0.45], DIAG_AXES, steelPaint(I.steel, I.plate, I.iron, 0.75, 4)),
    ],
    marks: [{ p: at(1), color: GLINT, n: [0, 0, 1] }, { p: at(-7.6), color: '#ffffff', n: [0, 0, 1] }],
  };
}

/** Тлеющий свиток огня: свёрнутый пергамент с тёмными концами, алая сургучная печать, над ним — огонёк. */
function fireScrollModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-5), alongDiag(4.4), 2.6, I.parchment),
      icRod(alongDiag(-6.2), alongDiag(-4.8), 2.9, I.wood), icRod(alongDiag(4.2), alongDiag(5.6), 2.9, I.wood),
      icBall([0.4, -0.6, 2.4], [1.6, 1.6, 0.7], I.ruby),
      icBall([3.2, 5.4, 0.6], [1.5, 2.1, 1.3], I.ember), icBall([3.4, 7, 0.6], [0.8, 1.2, 0.7], I.ember),
    ],
    marks: [{ p: [-2.4, 1.6, 2.6], color: GLINT, n: [0, 0, 1] }, { p: [0.4, -0.4, 3.2], color: '#ffd0d8', n: [0, 0, 1] }],
  };
}

/** Треснувший жезл искр: деревянный жезл с обмоткой, на конце — голубой кристалл с трещиной, вокруг искры. */
function sparkWandModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-7), alongDiag(3.4), 0.8, I.wood),
      icRod(alongDiag(-4.6), alongDiag(-2.6), 1, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.leather : I.leatherDark)),
      icBall(alongDiag(3.4), [1.6, 0.8, 1.6], I.gold, DIAG_AXES),
      icBall(alongDiag(5.6), [1.7, 2.6, 1.5], I.sapphire, DIAG_AXES),
    ],
    marks: [
      { p: alongDiag(5.2, 0.6), color: '#16346e', n: [0, 0, 1] }, { p: alongDiag(5.9, -0.4), color: '#16346e', n: [0, 0, 1] },
      { p: alongDiag(6.4, 2.4), color: '#e0f4ff' }, { p: alongDiag(7.6, -1.6), color: '#e0f4ff' }, { p: alongDiag(4.8, -2.6), color: '#ffffff' },
    ],
  };
}

/** Ледяной осколок: три острых кристалла льда из одного основания, разной высоты. */
function frostShardModel(): IconModel {
  const shard = (x: number, a: number, h: number, w: number): Part => icBox([x + Math.sin(a) * h / 2, -5 + h / 2, 0], [w, h / 2, w * 0.7], tilt(a), (s) => {
    if (s.y > 0.4 && Math.abs(s.x) > (1 - s.y) / 0.6) return null;   // острие
    return s.x < -0.2 ? I.ice : I.glass;
  });
  return {
    facing: -0.4,
    parts: [shard(-2.6, 0.45, 9, 1.6), shard(2.6, -0.4, 10, 1.6), shard(0, 0, 14, 2.1), icBall([0, -5.4, 0], [5, 1.4, 3], I.ice)],
    marks: [{ p: [-0.6, 3, 1.6], color: GLINT, n: [0, 0, 1] }, { p: [-3.6, 0, 1.2], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Тусклый камень жизни: круглый зелёный камень в золотой оправе из четырёх лапок. */
function lifeStoneModel(): IconModel {
  const parts: Part[] = [icBall([0, -0.4, -0.6], [5.6, 5.6, 1.4], I.goldDark), icBall([0, 0, 0.6], [4.4, 4.4, 3], I.emerald)];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    parts.push(icRod([Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0], [Math.cos(a) * 3.6, Math.sin(a) * 3.6, 2.6], 0.6, I.gold));
  }
  return { parts, marks: [{ p: [-1.6, 1.8, 3.4], color: GLINT, n: [0, 0, 1] }, { p: [-0.8, 2.4, 3.3], color: '#ffffff', n: [0, 0, 1] }] };
}

/** Потёртый пояс силача: кожаный ремень дугой с дырочками и большой золотой пряжкой. */
function strongBeltModel(): IconModel {
  const parts: Part[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.15 + (i / 5) * 0.7), b = Math.PI * (0.15 + ((i + 1) / 5) * 0.7);
    if (i < 5) parts.push(icRod([Math.cos(a) * 7, Math.sin(a) * 4 - 3, 0], [Math.cos(b) * 7, Math.sin(b) * 4 - 3, 0], 1.7, i % 2 ? I.leather : I.leatherDark));
  }
  parts.push(icBox([0, -4.4, 1.4], [2.6, 2.4, 0.6], MODEL_AXES_I, (s) => (Math.abs(s.x) < 0.55 && Math.abs(s.y) < 0.5 ? null : I.gold)), icRod([-0.4, -4.4, 1.8], [1.6, -4.4, 1.8], 0.4, I.steel));
  return { parts, marks: [{ p: [4.6, 0.6, 1.6], color: '#2a160c', n: [0, 0, 1] }, { p: [5.8, -1.2, 1.6], color: '#2a160c', n: [0, 0, 1] }, { p: [-1.6, -3, 2.1], color: GLINT, n: [0, 0, 1] }] };
}

/** Стоптанный сапог ветра: потёртый кожаный сапог с заплатой на носке, голенище перевязано голубой лентой. */
function windBootModel(): IconModel {
  return {
    facing: -0.35, pitch: 0.25,
    parts: [
      icBox([1, -5.6, 0], [5.2, 0.7, 2.1], MODEL_AXES_I, I.leatherDark),
      icBall([1.8, -3.5, 0], [4.6, 2.3, 2.3], (s) => (s.x > 0.45 && s.y > -0.2 ? I.cork : I.leather)),
      icRod([-1.8, -3.4, 0], [-2.2, 3.4, 0], 2.5, I.leather),
      icBall([-2.2, 1.6, 0], [3, 0.9, 3], I.ice), icRod([0.6, 1.8, 1.6], [4, 3.4, 1], 0.5, I.ice), icRod([0.6, 1.4, 1.6], [3.6, -0.4, 1.2], 0.5, I.ice),
    ],
    marks: [{ p: [-3.4, 0.6, 2.4], color: GLINT, n: [0, 0, 1] }, { p: [4.4, -2.6, 2.2], color: '#3a2414', n: [0, 0, 1] }],
  };
}

// ---------------- редкие (зелёные) предметы ----------------
/** Глефа стража: древко по диагонали в железных кольцах, наверху — изогнутое лезвие с золотой втулкой. */
function glaiveModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-7.4), alongDiag(2.6), 0.6, (s) => (Math.abs(((s.y + 1) * 3) % 1 - 0.5) < 0.1 ? I.iron : I.darkWood)),
      icRod(alongDiag(2.2), alongDiag(3.4), 0.9, I.gold),
      ...bevelBlade(alongDiag(5.4, 0.6), [1.4, 2.6, 0.4], DIAG_AXES, (s) => (s.y > 0.4 && s.x < (s.y - 0.4) * 3 - 1 ? null : s.x > 0.6 ? I.plate : I.steel)),
    ],
    marks: [{ p: alongDiag(5, 1), color: GLINT, n: [0, 0, 1] }, { p: alongDiag(2.8, 0, ), color: '#4a8ae8', n: [0, 0, 1] }],
  };
}

/** Молот грома: тёмное топорище в синей обмотке, тяжёлый боёк с золотыми обручами, на торце — голубая руна. */
function hammerModel(): IconModel {
  const head: Axes = [DIAG, ACROSS, [0, 0, 1]];
  return {
    parts: [
      icRod(alongDiag(-7), alongDiag(3.6), 0.75, I.darkWood),
      icRod(alongDiag(-5.4), alongDiag(-3), 0.95, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.royal : I.leatherDark)),
      { shape: { kind: 'cyl', a: add(alongDiag(4.6), mul(head[1], -4.2)), b: add(alongDiag(4.6), mul(head[1], 4.2)), r: 2.3 }, paint: (s) => (Math.abs(s.y) > 0.55 && Math.abs(s.y) < 0.75 ? I.gold : I.iron) },
    ],
    marks: [{ p: alongDiag(4.6, 4.3), color: '#8ad8ff', n: [0, 0, 1] }, { p: alongDiag(3.6, 2), color: GLINT, n: [0, 0, 1] }],
  };
}

/** Лук охотника: тёмное дерево, зелёная обмотка, золотые накладки; стрела с зелёным оперением. */
function hunterBowModel(): IconModel {
  const m = bowIconModel();
  return { ...m, parts: m.parts.map((p, i) => (i < 8 ? { ...p, paint: Math.abs(i + 0.5 - 4) < 1 ? I.leaf : I.darkWood } : i < 10 ? { ...p, paint: I.gold } : p)) };
}

/** Шлем стража: полированный купол с золотым ободом, нащёчники, золотой гребень и алый плюмаж назад. */
function guardHelmModel(): IconModel {
  const parts: Part[] = [
    icBall([0, -0.4, 0], [5.5, 6.2, 5.1], (s) => (s.y > -0.9 ? '#1c1a22' : null)),
    icBall([0, 0, 0], [6.1, 6.9, 5.7], (s) => {
      const sides = Math.abs(s.x) > 0.5 || s.z < -0.3;
      if (s.y < -0.2 && !(sides && s.y > -0.85)) return null;
      return s.y < 0.08 && s.y > -0.2 ? I.gold : I.plate;
    }),
    icRod([0, 6.6, 3], [0, 6.8, -3], 0.6, I.gold),
  ];
  for (let i = 0; i < 4; i++) parts.push(icBall([0, 7.6 + Math.sin((i / 3) * Math.PI) * 1.4, 1.6 - i * 1.8], [0.9, 1.3, 1.2], I.plume));
  return { facing: -0.35, parts, marks: [{ p: [-2.4, 4.6, 3.6], color: GLINT, n: [0, 0, 1] }] };
}

/** Кираса стража: нагрудник с золотой каймой и крестом-гербом, круглые наплечники. */
function guardCuirassModel(): IconModel {
  return {
    parts: [
      icBall([0, -0.4, 0], [5.2, 6.6, 3], (s) => {
        if (s.y > 0.82 || (s.y < -0.55 && s.y > -0.72)) return I.gold;
        if (s.y < -0.72) return I.leather;
        if (s.z > 0.35 && ((Math.abs(s.x) < 0.09 && s.y > -0.4 && s.y < 0.6) || (Math.abs(s.y - 0.22) < 0.08 && Math.abs(s.x) < 0.32))) return I.gold;
        return I.plate;
      }),
      icBall([-5, 4, 0], [2.3, 1.8, 2.3], (s) => (s.y < -0.5 ? I.gold : I.plate)), icBall([5, 4, 0], [2.3, 1.8, 2.3], (s) => (s.y < -0.5 ? I.gold : I.plate)),
    ],
    marks: [{ p: [-2.2, 3.2, 2.6], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Поножи стража: стальные голени с золотым пояском, золотые наколенники, стальные башмаки. */
function guardGreavesModel(): IconModel {
  const leg = (x: number): Part[] => [
    icBall([x, -6.2, 1], [2.3, 1.1, 2.7], I.plate),
    icBall([x, -1.8, 0], [2.4, 4.6, 2], (s) => (Math.abs(s.y + 0.1) < 0.1 ? I.gold : I.plate)),
    icBall([x, 3.6, 0.6], [2.7, 2.3, 2.5], I.gold),
  ];
  return { facing: -0.3, parts: [...leg(-3), ...leg(3)], marks: [{ p: [-3.8, 4.6, 2.6], color: GLINT, n: [0, 0, 1] }, { p: [2.2, -1, 2.2], color: GLINT, n: [0, 0, 1] }] };
}

/** Рукавицы стража: стальная латная перчатка с золотым раструбом и пластиной на костяшках. */
function guardGauntletModel(): IconModel {
  return {
    facing: -0.3,
    parts: [
      icRod([0, -6.4, 0], [0, -3.6, 0], 3.3, I.gold),
      icBall([0, -0.8, 0], [3.9, 3.5, 2.4], I.plate),
      ...[-2.4, -0.8, 0.8, 2.4].map((x) => icRod([x, 1.6, 0.3], [x * 1.05, 5.2, 0.9], 1, I.plate)),
      icRod([3.4, -1.6, 0.4], [5.6, 0.8, 0.9], 1.1, I.plate),
      icBall([0, 1.8, 1.4], [3.9, 1.2, 1.4], I.gold),
    ],
    marks: [{ p: [-1.8, 2.4, 2.5], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Сфера грозы: голубой шар с белым ядром, вокруг — три дуги-молнии. */
function stormOrbModel(): IconModel {
  const parts: Part[] = [icBall([0, 0, 0], [4.6, 4.6, 4.6], I.sapphire)];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) {
    const a = i * 0.45 + k * 2.1, b = a + 0.45, t = k * 1.1, p = (x: number): Vec => [Math.cos(x) * 6.6, Math.sin(x) * Math.sin(t) * 6.6, Math.sin(x) * Math.cos(t) * 6.6];
    parts.push({ shape: { kind: 'rod', a: p(a), b: p(b), r: 0.5 }, paint: () => '#bfe8ff' });
  }
  return { parts, marks: [{ p: [-1.6, 1.8, 4.2], color: GLINT, n: [0, 0, 1] }] };
}

/** Свиток метеора: тёмно-алый свиток с золотыми концами, на нём — горящий камень. */
function meteorScrollModel(): IconModel {
  return {
    parts: [
      icRod(alongDiag(-5), alongDiag(4.4), 2.6, I.cloth),
      icRod(alongDiag(-6.2), alongDiag(-4.8), 2.9, I.gold), icRod(alongDiag(4.2), alongDiag(5.6), 2.9, I.gold),
      icBall([2.4, 3.6, 1.6], [2.6, 2.6, 2.4], I.ember), icBall([4.4, 5.6, 1], [1.2, 1.2, 1], I.ember),
    ],
    marks: [{ p: [1.6, 4.6, 3.6], color: '#fff8c0', n: [0, 0, 1] }, { p: [2.8, 2.8, 3.8], color: '#4a1a0c', n: [0, 0, 1] }],
  };
}

/** Ледяной вихрь: воронка из колец ледяного ветра (шире к верху), по кольцам — осколки льда. */
function frostVortexModel(): IconModel {
  const parts: Part[] = [];
  for (let i = 0; i < 5; i++) {
    const y = -5.5 + i * 2.6, r = 1.6 + i * 1.2;
    parts.push(icBall([Math.sin(i) * 0.6, y, 0], [r, 0.9, r * 0.7], (q) => (Math.hypot(q.x, q.z) < 0.55 ? null : i % 2 ? I.ice : I.glass)));
    const a = i * 1.7;
    parts.push(icBox([Math.cos(a) * (r + 0.4), y + 0.4, Math.sin(a) * r * 0.7 + 0.6], [0.7, 1.1, 0.4], tilt(a), I.ice));
  }
  return { parts, pitch: 0.3, marks: [{ p: [-2, 5.2, 3.4], color: GLINT, n: [0, 0, 1] }] };
}

/** Призрачные клинки: три светящихся меча веером остриями вверх. */
function spiritBladesModel(): IconModel {
  // три клинка рядом, крайние наклонены наружу; у каждого — гарда и рукоять
  const blade = (x: number, a: number): Part[] => {
    const ax = tilt(a), up: Vec = [-Math.sin(a), Math.cos(a), 0], at = (t: number): Vec => [x + up[0] * t, -4 + up[1] * t, 0];
    return [
      icBox(at(5), [0.75, 4.4, 0.3], ax, (s) => (s.y > 0.75 && Math.abs(s.x) > (1 - s.y) * 4 ? null : I.spirit)),
      icBox(at(0.4), [1.8, 0.4, 0.4], ax, I.spirit), icRod(at(0), at(-2.2), 0.45, I.spirit),
    ];
  };
  return { parts: [...blade(-4.2, 0.35), ...blade(4.2, -0.35), ...blade(0, 0)], marks: [{ p: [0, 4, 1], color: GLINT, n: [0, 0, 1] }] };
}

/** Перстень вампира: тёмное серебро, кроваво-красный камень, по бокам — два белых клыка. */
function vampireRingModel(): IconModel {
  const parts: Part[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU - Math.PI / 2;
    parts.push(icBall([Math.cos(a) * 5, Math.sin(a) * 5 * 0.8 - 1.2, Math.sin(a) * 1.4], [1.1, 1.1, 1.1], I.iron));
  }
  parts.push(icBall([0, 4.6, 0.8], [2.4, 2.2, 1.9], I.potion));
  for (const x of [-2.6, 2.6]) parts.push(icBox([x, 2.6, 1.4], [0.5, 1.3, 0.4], tilt(x > 0 ? -0.3 : 0.3), (s) => (s.y < -0.4 && Math.abs(s.x) > (s.y + 1) * 1.6 ? null : I.bone)));
  return { parts, pitch: 0.35, marks: [{ p: [-0.8, 5.6, 2.6], color: GLINT, n: [0, 0, 1] }] };
}

/** Амулет второго дыхания: золотой круг на цепочке, в нём — белое перо. */
function secondWindModel(): IconModel {
  const parts: Part[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.1 + (i / 10) * 0.8);
    parts.push(icBall([Math.cos(a) * 5.2, 7 - Math.sin(a) * 4, -0.5], [0.6, 0.6, 0.6], I.gold));
  }
  parts.push(icBall([0, -1.4, 0], [4.6, 4.6, 1.2], (s) => (Math.hypot(s.x, s.y) > 0.72 ? I.gold : I.goldDark)));
  parts.push(icBall([0.4, -1.2, 1.1], [1.2, 3.4, 0.4], I.feather, tilt(-0.5)));
  return { parts, marks: [{ p: [-2.4, 0.6, 1.4], color: GLINT, n: [0, 0, 1] }] };
}

/** Плащ тени: тёмно-фиолетовый плащ складками с капюшоном и серебряной застёжкой. */
function shadowCloakModel(): IconModel {
  return {
    parts: [
      icBall([0, -1.4, 0], [5.6, 6, 2.4], (s) => (Math.sin(s.x * 9) > 0.55 ? I.slate : I.shadow)),
      icBall([0, 4.6, -0.6], [3.4, 2.8, 2.6], (s) => (s.z > 0.5 && s.y < 0.3 ? '#120c1a' : I.shadow)),
      icBall([0, 2.4, 2.2], [0.9, 0.9, 0.6], I.steel),
    ],
    marks: [{ p: [-2.6, 0, 2.2], color: '#c8b8f0', n: [0, 0, 1] }],
  };
}

/** Талисман удачи: золотой клевер-четырёхлистник с изумрудом в середине. */
function luckCharmModel(): IconModel {
  const parts: Part[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    parts.push(icBall([Math.cos(a) * 3, Math.sin(a) * 3, 0], [2.7, 2.7, 1.2], I.gold));
  }
  parts.push(icBall([0, 0, 0.8], [1.8, 1.8, 1.4], I.emerald), icRod([2, -2.4, -0.4], [4.6, -6.4, -0.4], 0.6, I.goldDark));
  return { parts, marks: [{ p: [-3.4, 3.6, 1.2], color: GLINT, n: [0, 0, 1] }] };
}

// ---------------- картинки в сумке — точно по форме предмета ----------------
/**
 * Картинка предмета в сумке рисуется по его клеткам: клетка — BAG_ART.cell единиц модели (как иконка), детальность
 * res — пиксель в пиксель с экраном при клетке сумки 26 пикселей игры. Ничего не выходит за занятые клетки:
 * у топора (форма Г) топорище — по левому столбцу, лезвие — в верхнем ряду; у лука (форма Т) лук слева, стрела —
 * в правую клетку; длинное оружие — вертикально на три клетки. Начало координат — середина формы, y вверх.
 */
export const BAG_ART = { cell: ICON_SIZE, res: CANVAS_SCALE * 26 / ICON_SIZE } as const;
const UP_AXES: Axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Меч вертикально на 1x3: навершие, рукоять в обмотке, гарда, клинок с ребром, долом, светлой кромкой и острием. */
function bagSword(blade: Ramp3, edge: Ramp3, fuller: Ramp3, guard: Ramp3, pommel: Ramp3, wrap: Ramp3, guardHalf: number): IconModel {
  return {
    parts: [
      icBall([0, -21.5, 0], [1.6, 1.6, 1.6], pommel),
      icRod([0, -20.4, 0], [0, -14.6, 0], 1, (s) => (Math.floor((s.y + 1) * 4) % 2 ? wrap : I.leatherDark)),
      icRod([-guardHalf, -13.6, 0], [guardHalf, -13.6, 0], 1, guard),
      icBall([-guardHalf, -13.6, 0], [1.3, 1.3, 1.3], guard), icBall([guardHalf, -13.6, 0], [1.3, 1.3, 1.3], guard),
      ...bevelBlade([0, 4.6, 0], [1.9, 17.4, 0.6], UP_AXES, steelPaint(blade, edge, fuller, 0.88, 8)),
    ],
    marks: [{ p: [-0.8, 6, 0.9], color: GLINT, n: [0, 0, 1] }, { p: [-0.9, -6, 0.9], color: GLINT, n: [0, 0, 1] }, { p: [0, -13.2, 1.1], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Ржавая катана вертикально: оплётка ромбами, круглая цуба, клинок выгнут, пятна ржавчины, острие наискось. */
function bagKatana(fire: { edge: Ramp3; back: Ramp3 } | null): IconModel {
  const parts: Part[] = [
    icRod([0, -22, 0], [0, -13.6, 0], 1.1, (s) => (((s.y + 1) * 5 + (s.x + 1) * 2) % 1 < 0.5 ? I.wrap : I.bone)),
    icBall([0, -12.8, 0], [3, 0.7, 2.2], I.iron),
  ];
  for (let i = 0; i < 4; i++) {
    const y0 = -12 + i * 8.6, y1 = y0 + 8.6, x0 = -0.012 * (y0 + 12) ** 2 * 0.25, x1 = -0.012 * (y1 + 12) ** 2 * 0.25, last = i === 3;
    const len = Math.hypot(x1 - x0, y1 - y0), dir: Vec = [(x1 - x0) / len, (y1 - y0) / len, 0];
    parts.push(...bevelBlade([(x0 + x1) / 2, (y0 + y1) / 2, 0], [1.4, len / 2 + 0.2, 0.6], [[dir[1], -dir[0], 0], dir, [0, 0, 1]], (s) => {
      if (last && s.y > 0.1 && s.x < (s.y - 0.1) * 2.6 - 1) return null;
      if (fire) return s.x > 0.6 ? I.ember : s.x > 0.2 ? fire.edge : fire.back;
      if (Math.sin(s.y * 4 + i * 2.1) > 0.6 && s.x < 0.2) return I.rust;
      return s.x > 0.6 ? I.plate : s.x > 0 ? I.steel : I.iron;
    }));
  }
  const glints = fire ? [-6, 4, 14].map((y) => ({ p: [0.4 - 0.003 * (y + 12) ** 2, y, 0.9] as Vec, color: '#fff4c0', n: [0, 0, 1] as Vec })) : [];
  return { parts, marks: [{ p: [0.4, 2, 0.9], color: GLINT, n: [0, 0, 1] }, ...glints] };
}

/** Топор орка на Г (2x3): топорище по левому столбцу, лезвие — полумесяцем в верхнем ряду вправо, шип — влево. */
function bagOrcAxe(): IconModel {
  const hx = -8;
  return {
    parts: [
      icRod([hx, -22, 0], [hx, 20, 0], 1.3, I.wood),
      icRod([hx, -14, 0], [hx, -7, 0], 1.55, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.leather : I.leatherDark)),
      icBall([hx + 9.4, 15.6, 0], [9, 6.8, 1.4], (s) => {
        if (s.x < -0.3 && Math.abs(s.y) > 0.5 + (s.x + 1) * 0.4) return null;   // к топорищу уже — полумесяц
        if (s.x > 0.78 && Math.floor((s.y + 1) * 4) % 2 === 0) return null;   // зазубрины
        return s.x > 0.5 ? I.plate : s.x > 0.1 ? I.steel : I.iron;
      }),
      icRod([hx, 15.6, 0], [hx - 6, 17.6, 0], 1, I.bone),
    ],
    marks: [{ p: [hx + 12, 18, 0.9], color: GLINT, n: [0, 0, 1] }, { p: [hx + 4.6, 14, 0.9], color: '#8a5a3a', n: [0, 0, 1] }],
  };
}

/** Лук на Т (2x3): тетива слева, плечи дугой вправо в левом столбце; стрела по среднему ряду, наконечник — в правой клетке. */
function bagBow(): IconModel {
  const n = 8, pt = (i: number): Vec => { const t = (i / n) * 2 - 1; return [-12 + (1 - t * t) * 8.4, t * 21.5, 0]; };
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) parts.push(icRod(pt(i), pt(i + 1), Math.abs(i + 0.5 - n / 2) < 1 ? 1.3 : 1, Math.abs(i + 0.5 - n / 2) < 1 ? I.leatherDark : I.wood));
  parts.push(icBall(pt(0), [1.2, 1.2, 1.2], I.bone), icBall(pt(n), [1.2, 1.2, 1.2], I.bone));
  parts.push({ shape: { kind: 'rod', a: pt(0), b: pt(n), r: 0.45 }, paint: () => '#e8e0c8' });
  parts.push(icRod([-12, 0, 1.2], [11, 0, 1.2], 0.6, I.wood), icBox([13, 0, 1.2], [2.2, 1.6, 0.5], UP_AXES, (s) => (Math.abs(s.y) > (1 - s.x) / 1.2 ? null : I.steel)));
  for (const dy of [-1.6, 1.6]) parts.push(icBall([-9.6, dy, 1.2], [2.6, 1, 0.4], I.potion));
  return { parts };
}

/** Глефа вертикально на 1x3: древко в кольцах, золотая втулка, изогнутое лезвие сверху, подток снизу. */
function bagGlaive(): IconModel {
  return {
    parts: [
      icRod([0, -22, 0], [0, 10, 0], 1, (s) => (Math.abs(((s.y + 1) * 5) % 1 - 0.5) < 0.08 ? I.iron : I.darkWood)),
      icBall([0, -22.4, 0], [1.3, 1.3, 1.3], I.iron), icRod([0, 9.4, 0], [0, 11.6, 0], 1.5, I.gold),
      ...bevelBlade([1, 17, 0], [2.2, 6, 0.6], UP_AXES, (s) => (s.y > 0.4 && s.x < (s.y - 0.4) * 3 - 1 ? null : s.x > 0.6 ? I.plate : Math.abs(s.x) < 0.15 ? I.iron : I.steel)),
    ],
    marks: [{ p: [1.4, 17, 0.8], color: GLINT, n: [0, 0, 1] }, { p: [0, 10.6, 1.6], color: '#4a8ae8', n: [0, 0, 1] }],
  };
}

/** Молот грома на форме «##/.#/.#»: топорище по правому столбцу, боёк поперёк верхнего ряда. */
function bagHammer(): IconModel {
  const hx = 8;
  return {
    parts: [
      icRod([hx, -22, 0], [hx, 14, 0], 1.3, I.darkWood),
      icRod([hx, -14, 0], [hx, -7, 0], 1.6, (s) => (Math.floor((s.y + 1) * 3) % 2 ? I.royal : I.leatherDark)),
      { shape: { kind: 'cyl', a: [-13, 16, 0], b: [14, 16, 0], r: 5.4 }, paint: (s) => (Math.abs(s.y) > 0.62 && Math.abs(s.y) < 0.76 ? I.gold : I.iron) },
    ],
    marks: [{ p: [-13.8, 16, 0], color: '#8ad8ff', n: [-1, 0, 0] }, { p: [-6, 19, 4.1], color: GLINT, n: [0, 0, 1] }],
  };
}

/** Лук охотника на Т: как деревянный, тёмное дерево, зелёная обмотка, золотые накладки. */
function bagHunterBow(): IconModel {
  const m = bagBow();
  return { ...m, parts: m.parts.map((p, i) => (i < 8 ? { ...p, paint: Math.abs(i + 0.5 - 4) < 1 ? I.leaf : I.darkWood } : i < 10 ? { ...p, paint: I.gold } : p)) };
}

/** Картинка в сумке: w x h клеток, модель вокруг середины формы. */
function bagArtTexture(scene: Phaser.Scene, key: string, w: number, h: number, model: IconModel): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const R = BAG_ART.res, W = Math.round(w * BAG_ART.cell * R), H = Math.round(h * BAG_ART.cell * R);
  const tex = readableCanvas(scene, key, W, H);
  if (!tex) return;
  const c = tex.getContext(), img = c.createImageData(W, H);
  renderModel({ data: img.data, width: W, x: 0, y: 0, w: W, h: H }, W / 2, H / 2, model.parts, model.marks ?? [], { facing: model.facing ?? 0, pitch: 0, scale: R });
  c.putImageData(img, 0, 0);
  addVolume(c, W, H, W, H);
  addOutline(c, W, H, W, H);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
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
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** Иконка на сцене: текстура детальнее пикселей игры — уменьшаем до размера ICON_SIZE (умножить на scale). */
export function addIcon(scene: Phaser.Scene, x: number, y: number, key: string, scale = 1): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setScale(scale / GAME.resolution);
}

// ---------------- герб на заставке ----------------
/**
 * Герб ордена — 3D-модель, как иконки: выпуклый щит-«подушка» в золотой оправе (слева алое поле, справа синее,
 * золотой крест), над ним корона с камнями, за щитом накрест два меча рукоятями вниз.
 * Размер кадра (пиксели игры); щит: полуширина, верх, где начинает сужаться, острие (единицы модели от середины кадра, y вверх),
 * ширина золотой оправы и креста, высота перекладины креста; наклон камеры — чуть сверху, видна толщина щита.
 */
const CREST = { w: 56, h: 44 } as const;
const SHIELD = { half: 13, top: 15, waist: -3, tip: -18, rim: 1.8, cross: 0.9, crossY: 6.5 } as const;
const CREST_PITCH = 0.25;
/** Герб детальнее пикселей игры — пиксель в пиксель с экраном (показан на заставке крупно). */
export const CREST_RES = CANVAS_SCALE;
const CREST_INK = {
  crimson: ['#ff9aa8', '#e8526a', '#c0304c', '#8a1c36', '#560c1e'],
  navy: ['#a8bcff', '#6a84d8', '#3a529a', '#263872', '#141c44'],
} as const satisfies Record<string, Ramp3>;

/** Полуширина щита на высоте y (inset — на сколько уже, для оправы); −1 — выше или ниже щита. Низ сужается дугой к острию. */
function shieldHalf(y: number, inset: number): number {
  const top = SHIELD.top - inset, tip = SHIELD.tip + inset * 1.4, w = SHIELD.half - inset;
  if (y > top || y < tip) return -1;
  if (y >= SHIELD.waist) return w;
  const k = (SHIELD.waist - y) / (SHIELD.waist - tip);
  return w * Math.sqrt(1 - k * k);
}
const inShield = (x: number, y: number, inset: number): boolean => Math.abs(x) <= shieldHalf(y, inset);

/** Меч за щитом: рукоять у (side·hx, hy), острие вверх-наружу; клинок с долом и сужением к острию, золотая гарда, рубин в навершии. */
function crestSword(side: number): Part[] {
  const pommel: Vec = [side * -21, -17.6, -2.4], guard: Vec = [side * -16.2, -13.4, -2.4], tip: Vec = [side * 19.6, 15.4, -2.4];
  const len = Math.hypot(tip[0] - guard[0], tip[1] - guard[1]), d: Vec = [(tip[0] - guard[0]) / len, (tip[1] - guard[1]) / len, 0];
  const axes: Axes = [[-d[1], d[0], 0], d, [0, 0, 1]], at = (t: number): Vec => [guard[0] + d[0] * t, guard[1] + d[1] * t, guard[2]];
  return [
    icBox(at(len / 2), [1.5, len / 2, 0.45], axes, (q) => {
      if (q.y > 0.9 && Math.abs(q.x) > (1 - q.y) * 10) return null;   // острие
      return Math.abs(q.x) < 0.16 && q.y < 0.8 ? I.iron : q.x * side < 0 ? I.steel : I.iron;
    }),
    icBox(at(0), [4.2, 0.7, 0.9], axes, I.gold),
    icRod(at(-0.6), at(-4.4), 0.8, I.leather),
    icBall(pommel, [1.6, 1.6, 1.6], I.gold), icBall(add(pommel, [0, 0, 1.2]), [0.9, 0.9, 0.7], I.ruby),
  ];
}

function crestModel(): IconModel {
  const R: Vec = [20, 26, 3.4], cy = -1.5;
  const face = (q: Surface): Ramp3 | null => {
    const x = q.x * R[0], y = cy + q.y * R[1];
    if (q.z < 0 || !inShield(x, y, 0)) return null;
    if (!inShield(x, y, SHIELD.rim)) return I.gold;
    if (Math.abs(x) < SHIELD.cross || Math.abs(y - SHIELD.crossY) < SHIELD.cross) return I.gold;
    return x < 0 ? CREST_INK.crimson : CREST_INK.navy;
  };
  const parts: Part[] = [
    ...crestSword(1), ...crestSword(-1),
    // толщина щита — золотое ребро под выпуклой лицевой стороной
    icBox([0, cy, -0.4], [SHIELD.half + 0.5, 17.2, 1.6], MODEL_AXES_I, (q) => (inShield(q.x * (SHIELD.half + 0.5), cy + q.y * 17.2, -0.4) ? I.goldDark : null)),
    icBall([0, cy, 0.9], R, face),
    // корона: обод, три зубца с шариками, камни на ободе
    icBox([0, 17, 0.6], [6.6, 1.5, 1.6], MODEL_AXES_I, I.gold),
    ...[-4.8, 0, 4.8].flatMap((x): Part[] => [icBall([x, 19.4, 0.6], [1.2, 2.4, 1.1], I.gold), icBall([x, 21.8, 0.6], [0.8, 0.8, 0.8], I.gold)]),
  ];
  const marks: Mark[] = [
    { p: [-2.6, 17, 2.3], color: '#e84a66', n: [0, 0, 1] }, { p: [0, 17, 2.3], color: '#5fe0d4', n: [0, 0, 1] }, { p: [2.6, 17, 2.3], color: '#e84a66', n: [0, 0, 1] },
    { p: [-8.4, 11.6, 3.9], color: GLINT, n: [0, 0, 1] }, { p: [-7.4, 12, 3.9], color: GLINT, n: [0, 0, 1] },
  ];
  return { parts, marks, pitch: CREST_PITCH };
}

/** Герб для заставки (рисуется сразу — он нужен уже экрану загрузки). Показывать уменьшенным в CREST_RES раз. */
export function makeCrestTexture(scene: Phaser.Scene): void {
  const key = 'title_crest';
  if (scene.textures.exists(key)) return;
  const W = CREST.w * CREST_RES, H = CREST.h * CREST_RES, model = crestModel();
  const tex = readableCanvas(scene, key, W, H);
  if (!tex) return;
  const c = tex.getContext(), img = c.createImageData(W, H);
  renderModel({ data: img.data, width: W, x: 0, y: 0, w: W, h: H }, W / 2, H / 2, model.parts, model.marks ?? [], { facing: 0, pitch: model.pitch ?? ICON_PITCH, scale: CREST_RES });
  c.putImageData(img, 0, 0);
  addOutline(c, W, H, W, H);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** Иконки интерфейса и лавки — 3D-модели, по заданию на иконку. */
export function iconTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const icons: [string, () => IconModel][] = [
    ['ui_heart', heartModel], ['ui_potion', potionModel], ['ui_dash', bootModel],
    ['castle_coin', coinModel], ['castle_sword', swordModel], ['castle_armor', armorModel],
    ['castle_satchel', satchelModel], ['castle_potion', potionModel],
    ['item_helmet', helmetModel], ['item_greaves', greavesModel], ['item_gloves', gloveModel],
    ['item_orc_axe', orcAxeModel], ['item_katana', katanaModel], ['item_bow', bowIconModel],
    ['item_ring', ringModel], ['item_necklace', necklaceModel], ['item_knight_sword', knightSwordModel],
    ['item_fire_scroll', fireScrollModel], ['item_spark_wand', sparkWandModel], ['item_frost_shard', frostShardModel],
    ['item_life_stone', lifeStoneModel], ['item_strong_belt', strongBeltModel], ['item_wind_boots', windBootModel],
    ['item_guard_glaive', glaiveModel], ['item_thunder_hammer', hammerModel], ['item_hunter_bow', hunterBowModel],
    ['item_guard_helm', guardHelmModel], ['item_guard_cuirass', guardCuirassModel], ['item_guard_greaves', guardGreavesModel], ['item_guard_gauntlets', guardGauntletModel],
    ['item_storm_orb', stormOrbModel], ['item_meteor_scroll', meteorScrollModel], ['item_frost_vortex', frostVortexModel], ['item_spirit_blades', spiritBladesModel],
    ['item_fire_katana', fireKatanaModel], ['item_ice_greatsword', iceGreatswordModel], ['item_dark_staff', darkStaffModel], ['item_blood_sweep', bloodSweepModel],
    ['item_travel_bag', travelBagModel], ['item_knight_bag', knightBagModel],
    ['item_vampire_ring', vampireRingModel], ['item_second_wind', secondWindModel], ['item_shadow_cloak', shadowCloakModel], ['item_luck_charm', luckCharmModel],
  ];
  const bagArt: [string, number, number, () => IconModel][] = [
    ['bag_sword', 1, 3, () => bagSword(I.iron, I.steel, I.mail, I.gold, I.ruby, I.leather, 4.6)],
    ['bag_knight_sword', 1, 3, () => bagSword(I.steel, I.plate, I.iron, I.gold, I.sapphire, I.royal, 5.8)],
    ['bag_katana', 1, 3, () => bagKatana(null)], ['bag_fire_katana', 1, 3, () => bagKatana({ edge: I.ember, back: I.emberDark })],
    ['bag_ice_greatsword', 1, 3, () => bagSword(I.ice, I.feather, I.sapphire, I.sapphire, I.sapphire, I.royal, 6.4)], ['bag_orc_axe', 2, 3, bagOrcAxe], ['bag_bow', 2, 3, bagBow],
    ['bag_guard_glaive', 1, 3, bagGlaive], ['bag_thunder_hammer', 2, 3, bagHammer], ['bag_hunter_bow', 2, 3, bagHunterBow],
  ];
  return [
    ...icons.map(([key, model]) => () => modelTexture(scene, key, model())),
    ...bagArt.map(([key, w, h, model]) => () => bagArtTexture(scene, key, w, h, model())),
  ];
}
