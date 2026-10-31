import { litCel, type Ramp } from './Volume';

/*
 * Маленький 3D-рендер для персонажей и предметов. Модель — набор простых тел: эллипсоиды (голова, туловище, кисти),
 * капсулы (кости рук и ног, рукояти), цилиндры (колонны, башни, бочки) и бруски (клинки, столешницы). Каждый пиксель кадра — луч от камеры;
 * ближайшее тело (буфер глубины) даёт цвет: материал по нормали берёт ступень тона из палитры (ramp),
 * свет — сверху-слева, как у всей графики. Поэтому выходит пиксель-арт, а не размытый рендер.
 * Камера ортографическая и смотрит сверху-спереди — как вид всей игры.
 *
 * Координаты модели: пол — y = 0, y вверх, персонаж смотрит вперёд по +z; 1 единица = 1 пиксель кадра по ширине.
 */

export type Vec = readonly [number, number, number];
export type Axes = readonly [Vec, Vec, Vec];

export function add(a: Vec, b: Vec): Vec { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a: Vec, b: Vec): Vec { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function mul(a: Vec, k: number): Vec { return [a[0] * k, a[1] * k, a[2] * k]; }
export function dot(a: Vec, b: Vec): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a: Vec, b: Vec): Vec { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function norm(a: Vec): Vec { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/** Точка поверхности, на которую «натягивается» текстура. */
export interface Surface {
  /** Координаты внутри тела от −1 до 1 по его осям; у капсулы y — вдоль кости, от начала a (−1) к концу b (1). */
  x: number; y: number; z: number;
  /** Нормаль в координатах модели: z > 0 — точка смотрит вперёд, туда же, куда персонаж. */
  n: Vec;
}
/** Цвет точки: палитра (тон выберет свет) или готовый цвет без светотени (глаза, огонь); null — здесь вырез. */
export type Shade = Ramp | string | null;
/** Материал части: одна палитра на всю часть или «текстура» — функция от точки поверхности. */
export type Paint = Ramp | ((s: Surface) => Shade);

export type Shape =
  /** Эллипсоид: центр, радиусы по осям (оси — по умолчанию оси модели). */
  | { kind: 'ball'; c: Vec; r: Vec; axes?: Axes }
  /** Капсула: отрезок от a до b толщиной r. */
  | { kind: 'rod'; a: Vec; b: Vec; r: number }
  /** Цилиндр с плоскими торцами (колонна, башня, бочка): ось от a до b, радиус r. */
  | { kind: 'cyl'; a: Vec; b: Vec; r: number }
  /** Брусок: центр, полуразмеры по осям. */
  | { kind: 'box'; c: Vec; r: Vec; axes: Axes };
export interface Part { shape: Shape; paint: Paint }
/** Точечная деталь (глаз, заклёпка): рисуется, если её не заслоняет тело; с нормалью n — только повёрнутая к камере. */
export interface Mark { p: Vec; color: string; n?: Vec }

export const MODEL_AXES: Axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Наклон камеры: насколько она смотрит сверху (радианы). */
/** Наклон камеры: 45° сверху — видны верх объектов (крыши, плечи, головы) и их бока. */
export const CAMERA_PITCH = (45 * Math.PI) / 180;
/** Деталь видна, если лежит не глубже поверхности на столько единиц. */
const MARK_DEPTH = 0.9;
/** Деталь с нормалью видна, если повёрнута к камере хотя бы на столько (косинус угла). */
const MARK_FACING = 0.15;

/** Как смотреть на модель: поворот вокруг вертикали (0 — лицом к камере), пикселей кадра на единицу модели, наклон камеры. */
/** aa — сглаживать края (по умолчанию да). */
export interface View { facing: number; scale?: number; pitch?: number; aa?: boolean }

/**
 * Поворот модели к камере: персонаж повёрнут вокруг вертикали на facing (0 — лицом к камере, «вниз» по экрану),
 * камера наклонена на pitch. Строки матрицы: x экрана (вправо), y экрана (вниз), глубина (к камере).
 * Матрица ортогональна — обратная к ней транспонированная.
 */
function cameraMatrix(facing: number, pitch = CAMERA_PITCH): number[] {
  const c = Math.cos(facing), s = Math.sin(facing), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [c, 0, s, -s * sp, -cp, c * sp, -s * cp, sp, c * cp];
}
function toCam(m: number[], v: Vec): Vec {
  return [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
}
function toModel(m: number[], v: Vec): Vec {
  return [m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2], m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2], m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2]];
}

/** Где точка модели окажется относительно точки опоры (x, y — единицы модели на экране, вниз — плюс). */
export function project(p: Vec, facing: number, pitch = CAMERA_PITCH): { x: number; y: number } {
  const c = toCam(cameraMatrix(facing, pitch), p);
  return { x: c[0], y: c[1] };
}

const rgbCache = new Map<string, number>();
function rgb(hex: string): number {
  let v = rgbCache.get(hex);
  if (v === undefined) { v = parseInt(hex.slice(1, 7), 16); rgbCache.set(hex, v); }
  return v;
}

/** Точки внутри пикселя для сглаживания краёв (сетка 2x2). */
const AA_SAMPLES = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const;

/** Результат пересечения луча с телом (общий, чтобы не создавать объекты на каждый пиксель). */
const hit = { d: 0, nx: 0, ny: 0, nz: 1, lx: 0, ly: 0, lz: 0 };
/** Луч капсулы стартует «у камеры» — достаточно далеко перед моделью. */
const FAR = 1000;

/** Тело в координатах камеры (уже в пикселях кадра), его размеры и рамка на экране. */
interface CamShape { shape: Shape; c: Vec; b: Vec; axes: Axes; r: Vec; x0: number; x1: number; y0: number; y1: number }

function prepare(m: number[], shape: Shape, k: number): CamShape {
  if (shape.kind === 'rod' || shape.kind === 'cyl') {
    const a = mul(toCam(m, shape.a), k), b = mul(toCam(m, shape.b), k), r = shape.r * k;
    return { shape, c: a, b, axes: MODEL_AXES, r: [r, r, r], x0: Math.min(a[0], b[0]) - r, x1: Math.max(a[0], b[0]) + r, y0: Math.min(a[1], b[1]) - r, y1: Math.max(a[1], b[1]) + r };
  }
  const c = mul(toCam(m, shape.c), k), src = shape.axes ?? MODEL_AXES, rs = mul(shape.r, k);
  const axes: Axes = [toCam(m, src[0]), toCam(m, src[1]), toCam(m, src[2])];
  // полуразмер рамки по x и y экрана
  let ex = 0, ey = 0;
  for (let i = 0; i < 3; i++) {
    const r = rs[i]!;
    if (shape.kind === 'box') { ex += Math.abs(axes[i]![0]) * r; ey += Math.abs(axes[i]![1]) * r; }
    else { ex += (axes[i]![0] * r) ** 2; ey += (axes[i]![1] * r) ** 2; }
  }
  if (shape.kind === 'ball') { ex = Math.sqrt(ex); ey = Math.sqrt(ey); }
  return { shape, c, b: c, axes, r: rs, x0: c[0] - ex, x1: c[0] + ex, y0: c[1] - ey, y1: c[1] + ey };
}

/** Временные массивы для пересечений — без новых объектов на каждый пиксель. */
const al = new Float64Array(3), be = new Float64Array(3);

/** Эллипсоид: луч (x, y) вдоль глубины. Ближняя к камере точка — больший корень. */
function hitBall(s: CamShape, r: Vec, x: number, y: number): boolean {
  let qa = 0, qb = 0, qc = -1;
  for (let i = 0; i < 3; i++) {
    const ax = s.axes[i]!;
    al[i] = ((x - s.c[0]) * ax[0] + (y - s.c[1]) * ax[1]) / r[i]!;
    be[i] = ax[2] / r[i]!;
    qa += be[i]! * be[i]!; qb += 2 * al[i]! * be[i]!; qc += al[i]! * al[i]!;
  }
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return false;
  const t = (-qb + Math.sqrt(disc)) / (2 * qa);
  hit.d = s.c[2] + t;
  hit.lx = al[0]! + be[0]! * t; hit.ly = al[1]! + be[1]! * t; hit.lz = al[2]! + be[2]! * t;
  const g0 = hit.lx / r[0]!, g1 = hit.ly / r[1]!, g2 = hit.lz / r[2]!;
  hit.nx = g0 * s.axes[0][0] + g1 * s.axes[1][0] + g2 * s.axes[2][0];
  hit.ny = g0 * s.axes[0][1] + g1 * s.axes[1][1] + g2 * s.axes[2][1];
  hit.nz = g0 * s.axes[0][2] + g1 * s.axes[1][2] + g2 * s.axes[2][2];
  return true;
}

/** Луч от камеры и сфера-торец капсулы: расстояние до встречи или Infinity. */
function capHit(e: Vec, rad: number, x: number, y: number): number {
  const ocx = x - e[0], ocy = y - e[1], ocz = FAR - e[2];
  const h = ocz * ocz - (ocx * ocx + ocy * ocy + ocz * ocz - rad * rad);
  return h > 0 ? ocz - Math.sqrt(h) : Infinity;
}

/** Капсула (формула пересечения луча с капсулой И. Квилеса). Луч идёт от камеры: (x, y, FAR) → −z. */
function hitRod(s: CamShape, rad: number, x: number, y: number): boolean {
  const a = s.c, b = s.b;
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const oax = x - a[0], oay = y - a[1], oaz = FAR - a[2];
  const baba = bax * bax + bay * bay + baz * baz, bard = -baz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = -oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const qa = baba - bard * bard;
  let t = -1;
  if (qa > 1e-9) {
    const qb = baba * rdoa - baoa * bard, qc = baba * oaoa - baoa * baoa - rad * rad * baba;
    const h = qb * qb - qa * qc;
    if (h < 0) return false;
    t = (-qb - Math.sqrt(h)) / qa;
    const along = baoa + t * bard;
    if (along <= 0 || along >= baba) t = -1;
  }
  if (t < 0) {
    // торцы-полусферы: ближний к камере
    t = Math.min(capHit(a, rad, x, y), capHit(b, rad, x, y));
    if (t === Infinity) return false;
  }
  const pz = FAR - t;
  const k = baba > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * bax + (y - a[1]) * bay + (pz - a[2]) * baz) / baba)) : 0;
  hit.d = pz;
  hit.nx = (x - a[0] - bax * k) / rad; hit.ny = (y - a[1] - bay * k) / rad; hit.nz = (pz - a[2] - baz * k) / rad;
  hit.lx = 0; hit.ly = k * 2 - 1; hit.lz = 0;
  return true;
}

/** Цилиндр с плоскими торцами (формула И. Квилеса): бок или ближний к камере торец. */
function hitCyl(s: CamShape, rad: number, x: number, y: number): boolean {
  const a = s.c, b = s.b;
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const ocx = x - a[0], ocy = y - a[1], ocz = FAR - a[2];
  const baba = bax * bax + bay * bay + baz * baz, bard = -baz, baoc = bax * ocx + bay * ocy + baz * ocz;
  const k2 = baba - bard * bard;
  let t: number, along: number, cap = 0;
  if (k2 > 1e-9) {
    const k1 = baba * -ocz - baoc * bard, k0 = baba * (ocx * ocx + ocy * ocy + ocz * ocz) - baoc * baoc - rad * rad * baba;
    const h = k1 * k1 - k2 * k0;
    if (h < 0) return false;
    const sh = Math.sqrt(h);
    t = (-k1 - sh) / k2;
    const yy = baoc + t * bard;
    if (yy > 0 && yy < baba) along = yy / baba;
    else {
      if (Math.abs(bard) < 1e-9) return false;
      cap = yy < 0 ? -1 : 1;
      t = ((yy < 0 ? 0 : baba) - baoc) / bard;
      if (Math.abs(k1 + k2 * t) >= sh) return false;
      along = cap < 0 ? 0 : 1;
    }
  } else {
    // ось смотрит прямо в камеру — виден только ближний торец (круг)
    if (ocx * ocx + ocy * ocy > rad * rad) return false;
    cap = baz > 0 ? 1 : -1;
    t = FAR - (cap > 0 ? b[2] : a[2]);
    along = cap > 0 ? 1 : 0;
  }
  const pz = FAR - t;
  hit.d = pz;
  if (cap) { const l = Math.sqrt(baba); hit.nx = (bax / l) * cap; hit.ny = (bay / l) * cap; hit.nz = (baz / l) * cap; }
  else { hit.nx = (x - a[0] - bax * along) / rad; hit.ny = (y - a[1] - bay * along) / rad; hit.nz = (pz - a[2] - baz * along) / rad; }
  hit.lx = 0; hit.ly = along * 2 - 1; hit.lz = 0;
  return true;
}

/** Брусок: пересечение «плит» по трём осям; ближняя к камере грань даёт нормаль. */
function hitBox(s: CamShape, r: Vec, x: number, y: number): boolean {
  let lo = -Infinity, hi = Infinity, face = 0;
  const o = al, dz = be;
  for (let i = 0; i < 3; i++) {
    const ax = s.axes[i]!;
    o[i] = (x - s.c[0]) * ax[0] + (y - s.c[1]) * ax[1] - s.c[2] * ax[2];
    dz[i] = ax[2];
    if (Math.abs(dz[i]!) < 1e-9) { if (Math.abs(o[i]!) > r[i]!) return false; continue; }
    let t0 = (-r[i]! - o[i]!) / dz[i]!, t1 = (r[i]! - o[i]!) / dz[i]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t1 < hi) { hi = t1; face = i; }
    if (t0 > lo) lo = t0;
  }
  if (lo > hi || hi === Infinity) return false;
  hit.d = hi;
  hit.lx = (o[0]! + dz[0]! * hi) / r[0]!; hit.ly = (o[1]! + dz[1]! * hi) / r[1]!; hit.lz = (o[2]! + dz[2]! * hi) / r[2]!;
  const ax = s.axes[face]!, sign = Math.sign(dz[face]!) || 1;
  hit.nx = ax[0] * sign; hit.ny = ax[1] * sign; hit.nz = ax[2] * sign;
  return true;
}

/** Холст, куда рисуется кадр: пиксели RGBA, ширина строки, левый верхний угол кадра, ширина и высота кадра. */
export interface Target { data: Uint8ClampedArray; width: number; x: number; y: number; w: number; h: number }

/**
 * Рисует модель в кадр. anchor — где в кадре точка опоры (начало координат модели), view — поворот и масштаб.
 * Точечные детали при масштабе больше 1 — квадратики того же размера, что и пиксель модели.
 */
export function renderModel(t: Target, anchorX: number, anchorY: number, parts: Iterable<Part>, marks: readonly Mark[], view: View): void {
  const FW = t.w, FH = t.h, k = view.scale ?? 1, m = cameraMatrix(view.facing, view.pitch);
  // градиент по высоте — только у моделей «на полу» (у вида строго сверху, как кромки стен, его нет)
  const grounded = (view.pitch ?? CAMERA_PITCH) < 1.2;
  const depth = new Float32Array(FW * FH).fill(-Infinity);
  // какая часть видна в пикселе (−1 — пусто): по этому сглаживаются края фигуры и стыки частей
  const owner = new Int32Array(FW * FH).fill(-1);
  const put = (px: number, py: number, color: number, alpha = 255): void => {
    const k = ((t.y + py) * t.width + t.x + px) * 4;
    t.data[k] = (color >> 16) & 255; t.data[k + 1] = (color >> 8) & 255; t.data[k + 2] = color & 255; t.data[k + 3] = alpha;
  };
  const prepared = [...parts].map((part) => ({ part, s: prepare(m, part.shape, k) }));
  /** Луч в точке (x, y) кадра относительно опоры: пересекает ли часть pi (результат — в hit). */
  const hits = (pi: number, x: number, y: number): boolean => {
    const { part, s } = prepared[pi]!, sh = part.shape;
    return sh.kind === 'ball' ? hitBall(s, s.r, x, y) : sh.kind === 'rod' ? hitRod(s, s.r[0], x, y) : sh.kind === 'cyl' ? hitCyl(s, s.r[0], x, y) : hitBox(s, s.r, x, y);
  };
  /** Цвет точки части pi после попадания (hit): раскраска и светотень; −1 — часть здесь прозрачна. */
  const shadeHit = (pi: number, y: number): number => {
    const part = prepared[pi]!.part, sh = part.shape;
    const l = Math.hypot(hit.nx, hit.ny, hit.nz) || 1;
    const nx = hit.nx / l, ny = hit.ny / l, nz = hit.nz / l;
    let shade: Shade;
    if (typeof part.paint === 'function') {
      const n = toModel(m, [nx, ny, nz]);
      // у капсулы «вокруг кости» — по нормали в модели
      const round = sh.kind === 'rod' || sh.kind === 'cyl';
      shade = part.paint({ x: round ? n[0] : hit.lx, y: hit.ly, z: round ? n[2] : hit.lz, n });
    } else shade = part.paint;
    if (shade === null) return -1;
    return typeof shade === 'string' ? rgb(shade) : litCel(shade, nx, ny, nz, grounded ? -y / k : null);
  };
  prepared.forEach(({ s }, pi) => {
    const px0 = Math.max(0, Math.floor(anchorX + s.x0)), px1 = Math.min(FW - 1, Math.ceil(anchorX + s.x1));
    const py0 = Math.max(0, Math.floor(anchorY + s.y0)), py1 = Math.min(FH - 1, Math.ceil(anchorY + s.y1));
    for (let py = py0; py <= py1; py++) {
      const y = py + 0.5 - anchorY;
      for (let px = px0; px <= px1; px++) {
        const i = py * FW + px;
        if (!hits(pi, px + 0.5 - anchorX, y) || hit.d <= depth[i]!) continue;
        const color = shadeHit(pi, y);
        if (color < 0) continue;
        depth[i] = hit.d; owner[i] = pi;
        put(px, py, color);
      }
    }
  });
  if (view.aa !== false) antialias();
  /**
   * Сглаживание краёв (HD): пиксели на границе — край фигуры или стык разных частей — пересчитываются по AA_SAMPLES
   * точкам внутри пикселя (проверяются только части этого пикселя и его соседей), цвет и прозрачность усредняются.
   * Узоры внутри одной части (кладка, швы) не трогаются — остаются чёткими.
   */
  function antialias(): void {
    // 1) дешёвый проход: пиксель на границе, если хоть один из 8 соседей принадлежит другой части (или это край кадра)
    const edge = new Uint8Array(FW * FH);
    const differ = (i: number, j: number): void => { if (owner[i] !== owner[j]) { edge[i] = 1; edge[j] = 1; } };
    for (let py = 0; py < FH; py++) for (let px = 0; px < FW; px++) {
      const i = py * FW + px, right = px + 1 < FW, down = py + 1 < FH;
      if (owner[i]! >= 0 && (px === 0 || py === 0 || !right || !down)) edge[i] = 1;
      if (right) differ(i, i + 1);
      if (down) { differ(i, i + FW); if (right) differ(i, i + FW + 1); if (px > 0) differ(i, i + FW - 1); }
    }
    // 2) только пиксели на границе: AA_SAMPLES точек, проверяются части этого пикселя и его соседей
    const near: number[] = [], done: [number, number, number][] = [];
    for (let i = 0; i < FW * FH; i++) {
      if (!edge[i]) continue;
      const px = i % FW, py = (i - px) / FW;
      near.length = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy;
        const n = x < 0 || y < 0 || x >= FW || y >= FH ? -1 : owner[y * FW + x]!;
        if (n >= 0 && !near.includes(n)) near.push(n);
      }
      if (near.length === 0) continue;
      let r = 0, g = 0, b = 0, cover = 0;
      for (const [sx, sy] of AA_SAMPLES) {
        const x = px + sx - anchorX, y = py + sy - anchorY;
        let best = -Infinity, color = -1;
        for (const pi of near) {
          if (!hits(pi, x, y) || hit.d <= best) continue;
          const c = shadeHit(pi, y);
          if (c >= 0) { best = hit.d; color = c; }
        }
        if (color < 0) continue;
        r += (color >> 16) & 255; g += (color >> 8) & 255; b += color & 255; cover++;
      }
      if (cover > 0) done.push([i, ((r / cover) << 16) | ((g / cover) << 8) | (b / cover), Math.round((cover / AA_SAMPLES.length) * 255)]);
    }
    for (const [i, color, alpha] of done) put(i % FW, Math.floor(i / FW), color, alpha);
  }
  const size = Math.max(1, Math.round(k));
  for (const mk of marks) {
    const c = mul(toCam(m, mk.p), k);
    const px = Math.floor(anchorX + c[0] - (size - 1) / 2), py = Math.floor(anchorY + c[1] - (size - 1) / 2);
    if (mk.n && toCam(m, mk.n)[2] < MARK_FACING) continue;
    // HD: точечная деталь (глаз, заклёпка, пуговица) — круглая, а не квадрат
    const mid = (size - 1) / 2, round = (size / 2) ** 2 + 0.25;
    for (let y = py; y < py + size; y++) for (let x = px; x < px + size; x++) {
      if (size > 2 && (x - px - mid) ** 2 + (y - py - mid) ** 2 > round) continue;
      if (x < 0 || y < 0 || x >= FW || y >= FH || c[2] < depth[y * FW + x]! - MARK_DEPTH * k) continue;
      put(x, y, rgb(mk.color));
    }
  }
}
