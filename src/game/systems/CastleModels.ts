import Phaser from 'phaser';
import { GAME } from '../configs/game';
import { add, CAMERA_PITCH, cross, MODEL_AXES, mul, norm, renderModel, type Axes, type Mark, type Paint, type Part, type Shade, type Surface, type Vec, type View } from './Rig3D';
import { addOutline, addVolume, ramp, tone, type Ramp } from './Volume';

/*
 * Объекты замка — 3D-модели, как и персонажи (Rig3D.ts): знамёна, колонны, ворота, жаровни, торговец, постройки, котик;
 * из тех же тел CastleArt.ts собирает стены и башни. Модель строится от точки на полу под объектом
 * (y вверх, z к камере, 1 единица = 1 пиксель игры) и рисуется в GAME.resolution раз детальнее пикселей игры.
 * Огонь, искры и блики — плоская анимация поверх модели (overlay).
 */

const RES = GAME.resolution;
const TAU = Math.PI * 2;

/** Анимации объектов: число кадров в цикле и скорость (кадров в секунду). Больше кадров — плавнее движение. */
export const ANIM = {
  banner: { frames: 32, rate: 20 },
  brazier: { frames: 24, rate: 24 },
  merchant: { frames: 32, rate: 16 },
  catRun: { frames: 12, rate: 20 },
  catSit: { frames: 12, rate: 6 },
} as const;

/** Модель на один кадр: тела, точечные детали и плоская анимация поверх (в пикселях игры). */
export interface Model { parts: Part[]; marks?: Mark[]; overlay?: (c: CanvasRenderingContext2D) => void }
/** Где в кадре точка на полу под объектом (пиксели игры). */
export interface Anchor { x: number; y: number }

// ---------------- тела ----------------
export function ball(c: Vec, r: Vec, paint: Paint, axes?: Axes): Part { return { shape: axes ? { kind: 'ball', c, r, axes } : { kind: 'ball', c, r }, paint }; }
export function rod(a: Vec, b: Vec, r: number, paint: Paint): Part { return { shape: { kind: 'rod', a, b, r }, paint }; }
export function cyl(a: Vec, b: Vec, r: number, paint: Paint): Part { return { shape: { kind: 'cyl', a, b, r }, paint }; }
export function box(c: Vec, r: Vec, paint: Paint, axes: Axes = MODEL_AXES): Part { return { shape: { kind: 'box', c, r, axes }, paint }; }
/** Материал одного цвета без светотени (тёмные швы, ниши). */
export function flat(color: string): Paint { return () => color; }
/** Оси тела, повёрнутого вокруг вертикали на угол a (зубцы башни по кругу, ткань в складках). */
export function yaw(a: number): Axes { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; }
/** Оси тела, наклонённого в плоскости экрана на угол a (против часовой). */
export function roll(a: number): Axes { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; }
/** Точка на передней стороне эллипсоида по долям ширины и высоты — для заклёпок, глаз, бликов. */
export function front(c: Vec, r: Vec, lx: number, ly: number): { p: Vec; n: Vec } {
  const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  return { p: [c[0] + lx * r[0] * 1.03, c[1] + ly * r[1] * 1.03, c[2] + lz * r[2] * 1.03], n: [lx / r[0], ly / r[1], lz / r[2]] };
}
/** Предсказуемый «случайный» шум по координатам: камни и угли одинаковые при каждом запуске. */
export function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

// ---------------- текстуры из моделей ----------------
interface ResData { resolution?: number }
/** Во сколько раз текстура детальнее пикселей игры (у 3D-моделей — GAME.resolution, у прочих — 1). */
export function textureResolution(t: Phaser.Textures.Texture): number { return (t.customData as ResData).resolution ?? 1; }

/** Рисует модель в область холста: x0, y0 — пиксели холста, w x h — пиксели игры. Поверх уже нарисованного. */
export function drawModel(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, anchor: Anchor, model: Model, view: Partial<View> = {}): void {
  const W = Math.round(w * RES), H = Math.round(h * RES);
  const img = c.getImageData(x0, y0, W, H);
  renderModel({ data: img.data, width: W, x: 0, y: 0, w: W, h: H }, anchor.x * RES, anchor.y * RES, model.parts, model.marks ?? [], { facing: 0, scale: RES, ...view });
  c.putImageData(img, x0, y0);
  drawOverlay(c, x0, y0, W, H, model.overlay);
}

/** Плоская анимация модели (огонь, искры, пар) в область холста W x H (пиксели холста) от x0, y0. */
function drawOverlay(c: CanvasRenderingContext2D, x0: number, y0: number, W: number, H: number, overlay?: (c: CanvasRenderingContext2D) => void): void {
  if (!overlay) return;
  c.save(); c.translate(x0, y0); c.beginPath(); c.rect(0, 0, W, H); c.clip(); c.scale(RES, RES);
  overlay(c);
  c.restore();
}

/**
 * Холст текстуры, из которого часто читают пиксели (светотень, контур, рисование по полосам): браузер держит его
 * в обычной памяти, а не в видеокарте — чтение быстрое, экран загрузки не подвисает. Пустой, если ключ уже занят.
 */
export function readableCanvas(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true });
  return scene.textures.addCanvas(key, canvas);
}

/**
 * Сколько пикселей холста рисовать за одно задание экрана загрузки (больше — рывок анимации загрузки):
 * со сглаживанием краёв около 20 мс — заставка не дёргается.
 */
const PIXELS_PER_JOB = 96 * 64 * RES * RES;
/**
 * Крупная модель (стена, кадр огра или короля) больше одного задания — рисуется полосами строк по столько пикселей
 * (около 10 мс): ни одно задание не дольше кадра, анимация загрузки идёт ровно.
 */
export const STRIP_PIXELS = PIXELS_PER_JOB / 4;

/** Полосы строк [начало, конец) высоты h при ширине w — по STRIP_PIXELS пикселей. */
export function strips(w: number, h: number): [number, number][] {
  const rows = Math.max(1, Math.floor(STRIP_PIXELS / Math.max(1, w))), out: [number, number][] = [];
  for (let y = 0; y < h; y += rows) out.push([y, Math.min(h, y + rows)]);
  return out;
}

/**
 * Модель в холст по полосам (x0, y0 — пиксели холста): задания для экрана загрузки. model — строится при первом задании.
 * Холст читается один раз в начале и пишется один раз в конце: чтение холста посреди рисования медленное.
 */
export function drawModelJobs(ctx: () => CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, anchor: Anchor, model: () => Model, view: Partial<View> = {}): (() => void)[] {
  const W = Math.round(w * RES), H = Math.round(h * RES);
  let built: Model | null = null, img: ImageData | null = null;
  const jobs = strips(W, H).map(([r0, r1]) => () => {
    const m = built ??= model(), buf = img ??= ctx().getImageData(x0, y0, W, H);
    renderModel({ data: buf.data, width: W, x: 0, y: r0, w: W, h: r1 - r0 }, anchor.x * RES, anchor.y * RES - r0, m.parts, m.marks ?? [], { facing: 0, scale: RES, ...view });
  });
  jobs.push(() => {
    const m = built ??= model(), c = ctx();
    if (img) c.putImageData(img, x0, y0);
    img = null;
    drawOverlay(c, x0, y0, W, H, m.overlay);
  });
  return jobs;
}

/**
 * Лист кадров из 3D-модели: w x h пикселей игры на кадр, frames кадров. Задания рисуют по несколько кадров
 * со светотенью и контуром, последнее регистрирует кадры и анимацию (ключ анимации = ключ текстуры; у одного кадра её нет).
 * Плоская анимация (огонь, искры, пар) рисуется после контура: это свет — без тёмной обводки и без светотени.
 */
export function modelSheetJobs(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, rate: number, anchor: Anchor, build: (f: number) => Model, view: Partial<View> = {}): (() => void)[] {
  const W = w * RES, H = h * RES;
  const perJob = Math.max(1, Math.floor(PIXELS_PER_JOB / (W * H)));
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const jobs: (() => void)[] = [() => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    tex = readableCanvas(scene, key, W * frames, H);
    if (!tex) return;
    tex.getContext().imageSmoothingEnabled = false;
    (tex.customData as ResData).resolution = RES;
  }];
  const ctx = (): CanvasRenderingContext2D => tex!.getContext();
  // модель кадра без плоской анимации; анимация запоминается и рисуется после контура
  const overlays: ((c: CanvasRenderingContext2D) => void)[] = [];
  const bare = (f: number): Model => { const m = build(f); if (m.overlay) overlays[f] = m.overlay; return { ...m, overlay: undefined }; };
  for (let f0 = 0; f0 < frames; f0 += perJob) {
    const f1 = Math.min(frames, f0 + perJob);
    // кадр крупнее задания — по полосам; несколько мелких кадров — за одно задание
    if (perJob === 1 && W * H > STRIP_PIXELS) jobs.push(...drawModelJobs(ctx, f0 * W, 0, w, h, anchor, () => bare(f0), view).map((job) => () => { if (tex) job(); }));
    else jobs.push(() => { if (tex) for (let f = f0; f < f1; f++) drawModel(ctx(), f * W, 0, w, h, anchor, bare(f), view); });
    // светотень и контур — по кадру за задание, затем огонь и искры
    for (let f = f0; f < f1; f++) jobs.push(() => { if (tex) { addVolume(ctx(), W, H, W, H, f * W); addOutline(ctx(), W, H, W, H, f * W); drawOverlay(ctx(), f * W, 0, W, H, overlays[f]); } });
  }
  jobs.push(() => {
    if (!tex) return;
    tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    if (frames === 1) return;
    for (let f = 0; f < frames; f++) tex.add(String(f), 0, f * W, 0, W, H);
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({ key, frames: Array.from({ length: frames }, (_, f) => ({ key, frame: String(f) })), frameRate: rate, repeat: -1 });
  });
  return jobs;
}

/**
 * Холст в GAME.resolution раз детальнее, по заданиям (для стен): первое создаёт холст (если его ещё нет — иначе все
 * задания пропускаются), steps — шаги рисования (ctx — холст), последнее регистрирует текстуру.
 */
export function hiresTextureJobs(scene: Phaser.Scene, key: string, w: number, h: number, steps: (ctx: () => CanvasRenderingContext2D) => (() => void)[]): (() => void)[] {
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const ctx = (): CanvasRenderingContext2D => tex!.getContext();
  return [
    () => {
      if (scene.textures.exists(key)) return;
      tex = readableCanvas(scene, key, w * RES, h * RES);
      if (!tex) return;
      tex.getContext().imageSmoothingEnabled = false;
      (tex.customData as ResData).resolution = RES;
    },
    ...steps(ctx).map((step) => () => { if (tex) step(); }),
    () => { tex?.refresh(); tex?.setFilter(Phaser.Textures.FilterMode.LINEAR); tex = null; },
  ];
}

/** Холст в GAME.resolution раз детальнее (для стен): рисует paint и регистрирует текстуру. */
export function hiresTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = readableCanvas(scene, key, w * RES, h * RES);
  if (!tex) return;
  const c = tex.getContext(); c.imageSmoothingEnabled = false;
  (tex.customData as ResData).resolution = RES;
  paint(c);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

// ---------------- плоская анимация поверх моделей (пиксели игры, шаг — пиксель холста) ----------------
const STEP = 1 / RES;
export function dot(c: CanvasRenderingContext2D, color: string, x: number, y: number, w = STEP, h = STEP): void { c.fillStyle = color; c.fillRect(x, y, w, h); }

/** Языки пламени по столбцам в пиксель холста: основание на baseY, высота «дышит» с фазой p (0..1). */
export function flame(c: CanvasRenderingContext2D, cx: number, baseY: number, half: number, height: number, p: number): void {
  const t = p * TAU;
  for (let x = -half; x <= half; x += STEP) {
    const envelope = 1 - (x / (half + 1)) ** 2;
    const h = Math.max(1, height * envelope * (0.72 + 0.28 * Math.sin(t * 2 + x * 1.7) + 0.12 * Math.sin(t * 3 - x)));
    for (const [color, k] of [['#c8401e', 1], ['#f07a2a', 0.8], ['#ffc04a', 0.55], ['#fff2b8', Math.abs(x) < half * 0.5 ? 0.3 : 0]] as const) {
      const lh = Math.round(h * k * RES) / RES;
      if (lh > 0) dot(c, color, cx + x, baseY - lh, STEP, lh);
    }
  }
}
/** Блик-звёздочка: белый центр и золотые лучи. */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number): void {
  dot(c, '#ffffff', x, y, 1, 1);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) dot(c, '#fff0a0', x + dx * 0.75 + 0.25 * (1 - Math.abs(dx)), y + dy * 0.75 + 0.25 * (1 - Math.abs(dy)), 0.5, 0.5);
}

// ---------------- объёмный огонь (светится сам, без теней) ----------------
/** Чёрное пламя — объёмное: по краю силуэта лиловая кайма, к середине темнее, сердцевина почти чёрная (светится само, без теней). */
export const VIEW_DIR = [Math.sin(CAMERA_PITCH), Math.cos(CAMERA_PITCH)] as const;
export const flamePaint: Paint = (s) => {
  const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];   // насколько точка смотрит в камеру
  return d < 0.45 ? '#c080ff' : d < 0.65 ? '#7a30c0' : d < 0.82 ? '#2a1048' : '#0a0410';
};
/** Живой огонь — объёмный: по краю силуэта красная кайма, к середине оранжевый и жёлтый, сердцевина почти белая. */
export const firePaint: Paint = (s) => {
  const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];
  return d < 0.4 ? '#d8401a' : d < 0.62 ? '#ff8a2a' : d < 0.84 ? '#ffc850' : '#fff4c8';
};
/** Язык пламени: стопка сжимающихся кверху шаров, верх колышется (phase — фаза колыхания); y0 — где основание. */
export function flameTongue(parts: Part[], x: number, z: number, height: number, width: number, phase: number, paint: Paint = flamePaint, y0 = 3): void {
  const n = 4;
  for (let k = 0; k < n; k++) {
    const t = k / n, r = width * (1 - t * 0.72), sway = Math.sin(phase + t * 3) * 2.2 * t;
    parts.push(ball([x + sway, y0 + height * t, z], [r, (height / n) * 0.95, r], paint));
  }
}

// ---------------- материалы ----------------
export const M = {
  iron: ramp('#4a4656'), ironLight: ramp('#7a7f8c'), bronze: ramp('#9a7442'), bronzeLight: ramp('#c8a060'),
  wood: ramp('#7d5a3c'), woodDark: ramp('#5a3e28'), woodLight: ramp('#b58655'), gold: ramp('#d6b66d'), goldBright: ramp('#f0d070'),
  cloth: ramp('#762e40'), clothDark: ramp('#5a2232'), drape: ramp('#8a3448'), linen: ramp('#e0d5b8'), pillow: ramp('#f4ecd8'),
  skin: ramp('#d9ad82'), coat: ramp('#335868'), hat: ramp('#2f5560'), hatLight: ramp('#4a7a86'), beard: ramp('#e8dcc0'), feather: ramp('#c84a5a'),
  glassRed: ramp('#b74460'), glassBlue: ramp('#4a8ac0'), glass: ramp('#a8c8d4'), potion: ramp('#3fc08a'), cork: ramp('#b99465'),
  steel: ['#ffffff', '#eef2f6', '#c8d0d8', '#94a0ae', '#626c7a'], brick: ramp('#6a4440'), brickDark: ramp('#4a3634'),
  terracotta: ramp('#a0543a'), leaf: ramp('#56924a'), leafLight: ramp('#82b95a'), stone: ramp('#6a7484'), stoneDark: ramp('#545d6c'),
  stoneLight: ramp('#7a8494'), metal: ramp('#b6b3a0'), water: ramp('#3a7a98'), fur: ramp('#e08a3a'), furDark: ramp('#a8561e'), cream: ramp('#f4e2c4'),
} as const satisfies Record<string, Ramp>;

// ---------------- объекты ----------------
/**
 * Жаровня 24x32: тренога с коленами и кольцом-распоркой, лапы-шары; бронзовая чаша с золотым поясом и заклёпками,
 * на ней обод; в чаше — объёмные угли (рдеют каждый в своей фазе), над ними объёмные языки пламени (firePaint);
 * поверх — круглые искры, летящие вверх. BRAZIER: где чаша, высота и ширина пламени, сколько углей и искр.
 */
const BRAZIER = { bowlY: 16, bowl: [9.5, 6, 7.5] as Vec, rim: 18.6, flame: 13, flameW: 4.4, coals: 9, sparks: 3 } as const;
/** Уголь: по краю силуэта тёмный, к середине рдеет; heat 0..1 — насколько раскалён сейчас. */
function coalPaint(heat: number): Paint {
  return (s) => {
    const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];
    return d < 0.45 ? '#2a1414' : d < 0.7 ? (heat > 0.5 ? '#c8401e' : '#7a2414') : heat > 0.5 ? '#ffc04a' : '#e86a24';
  };
}
function brazier(f: number): Model {
  const p = f / ANIM.brazier.frames, B = BRAZIER, parts: Part[] = [], marks: Mark[] = [];
  const legs = [[-6.5, 3.5], [6.5, 3.5], [0, -6.5]] as const;
  for (const [x, z] of legs) {
    const knee: Vec = [x * 1.05, 6, z * 1.05];
    parts.push(rod([x * 0.32, B.bowlY - 3.4, z * 0.32], knee, 0.8, M.iron), rod(knee, [x * 0.92, 1.2, z * 0.92], 0.75, M.iron), ball([x * 0.92, 0.9, z * 0.92], [1.5, 0.9, 1.5], M.ironLight));
  }
  legs.forEach(([x, z], i) => { const [x2, z2] = legs[(i + 1) % legs.length]!; parts.push(rod([x * 1.05, 6, z * 1.05], [x2 * 1.05, 6, z2 * 1.05], 0.45, M.ironLight)); });
  const bowl: [Vec, Vec] = [[0, B.bowlY, 0], B.bowl];
  parts.push(
    ball(bowl[0], bowl[1], (s) => (s.y > 0.42 ? null : s.y > -0.05 && s.y < 0.16 ? M.gold : M.bronze)),
    ball([0, B.rim, 0], [9.7, 1, 7.7], (s) => (s.x * s.x + s.z * s.z < 0.74 ? null : M.bronzeLight)),
    ball([0, B.rim - 0.4, 0], [8.7, 0.8, 6.7], flat('#1a0c0c')),
  );
  // угли: кучка комьев, каждый рдеет в своей фазе
  for (let i = 0; i < B.coals; i++) {
    const a = (i / B.coals) * TAU * 2.3, r = 2 + (i % 3) * 2.1, heat = 0.5 + 0.5 * Math.sin(p * TAU + i * 1.9);
    parts.push(ball([Math.cos(a) * r, B.rim + 0.4 + (i % 2) * 0.5, Math.sin(a) * r * 0.75], [1.9, 1.3, 1.7], coalPaint(heat)));
  }
  // пламя: большой язык посередине, три поменьше вокруг — колышутся в своих фазах
  flameTongue(parts, 0, 0, B.flame * (0.85 + 0.15 * Math.sin(p * TAU * 2)), B.flameW, p * TAU, firePaint, B.rim);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    flameTongue(parts, Math.cos(a) * 3.6, Math.sin(a) * 2.6, B.flame * 0.55 + 1.6 * Math.sin(p * TAU * 2 + i * 2.1), B.flameW * 0.55, p * TAU + i * 1.4, firePaint, B.rim);
  }
  for (const x of [-0.65, -0.32, 0, 0.32, 0.65]) marks.push({ ...front(bowl[0], bowl[1], x, 0.05), color: '#fff0a0' });
  return {
    parts, marks,
    overlay: (c) => {
      for (let i = 0; i < B.sparks; i++) {
        const q = (p + i / B.sparks) % 1, x = 12 + (i - 1) * 3 + Math.sin(q * TAU + i) * 1.5, y = 9 - q * 9;
        c.globalAlpha = 1 - q * 0.8; c.fillStyle = q < 0.5 ? '#fff0a0' : '#f07a2a';
        c.beginPath(); c.arc(x, y, 0.55 - q * 0.25, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    },
  };
}

/** Колонна 32x64: плита, база, ствол с каннелюрами, золотое кольцо и капитель; трещина и мох у основания. */
function pillar(): Model {
  const flutes: Paint = (s) => (Math.cos(Math.atan2(s.z, s.x) * 10) > 0.55 && Math.abs(s.n[1]) < 0.9 ? M.stoneDark : M.stone);
  return {
    parts: [
      box([0, 2.5, 0], [12.5, 2.5, 7.5], M.stoneDark),
      cyl([0, 5, 0], [0, 7.5, 0], 10.5, M.stoneLight),
      cyl([0, 7.5, 0], [0, 48.5, 0], 8.5, flutes),
      cyl([0, 48.5, 0], [0, 51, 0], 10, M.gold),
      box([0, 53.5, 0], [12.5, 2.5, 7.5], M.stoneLight),
    ],
    marks: [
      ...[30, 31, 32, 33, 35, 36].map((y, i): Mark => ({ p: [3 + (i > 3 ? 1 : 0), y, 8.6], color: '#3a4250', n: [0, 0, 1] })),
      ...[-10, -9, -8, 9, 10].map((x): Mark => ({ p: [x, 5.2, 7.7], color: '#5a7a4c', n: [0, 0, 1] })),
    ],
  };
}

/**
 * Знамя 30x58: перекладина с золотыми шарами, подвешена на шнуре; полотно из узких полос, развёрнутых волной (складки),
 * снизу — клин с кистью; по краям золотая кайма, на полотне — герб ордена (как на заставке): золотая оправа,
 * слева алое поле, справа синее, золотой крест. BANNER: полосы (и насколько соседние заходят друг на друга — без щелей),
 * верх и низ полотна, глубина клина, кайма.
 */
const BANNER = { cols: 16, colW: 1.32, overlap: 0.2, top: 53, low: 7, notch: 8, trim: 0.9 } as const;
const HERALD = { red: ramp('#b02a3a'), blue: ramp('#2a4a92') } as const;
function banner(f: number): Model {
  const t = (f / ANIM.banner.frames) * TAU, B = BANNER, half = (B.cols * B.colW) / 2;
  const sway = Math.sin(t) * 0.8;
  // низ клина — ровная линия от краёв к острию посередине (не ступеньками по полосам)
  const bottomAt = (gx: number): number => B.low + (Math.min(half, Math.abs(gx)) / half) * B.notch;
  const cloth = (gx: number, gy: number): Shade | null => {
    const bottom = bottomAt(gx);
    if (gy < bottom) return null;
    if (gy < bottom + 1.2 || Math.abs(gx) > half - B.trim) return M.gold;   // кайма по краю клина и по бокам
    // щит: золотая оправа, четверти, крест
    const inShield = (k: number): boolean => gy <= 43 - k && gy >= 24 + k && Math.abs(gx) <= (gy >= 33 ? 8 - k : (8 - k) * Math.sqrt(Math.max(0, (gy - 24 - k) / (9 - k))));
    if (!inShield(0)) return M.cloth;
    if (!inShield(1.4)) return M.gold;
    if (Math.abs(gx) < 0.8 || Math.abs(gy - 37) < 0.8) return M.goldBright;
    return gx < 0 ? HERALD.red : HERALD.blue;
  };
  const parts: Part[] = [];
  for (let i = 0; i < B.cols; i++) {
    const cx = -half + B.colW / 2 + i * B.colW, phase = i * 0.55 + t;
    const bottom = bottomAt(Math.abs(cx) - B.colW / 2);   // полоса — до самой нижней точки своего края, лишнее срезает cloth
    const h = (B.top - bottom) / 2, cy = (B.top + bottom) / 2;
    parts.push(box([cx + sway * (1 - cy / B.top), cy, Math.sin(phase) * 0.7], [B.colW / 2 + B.overlap, h, 0.5], (s) => cloth(cx + (s.x * B.colW) / 2, cy + s.y * h), yaw(Math.cos(phase) * 0.3)));
  }
  parts.push(
    cyl([-13, 55, 0.5], [13, 55, 0.5], 1.6, M.wood), ball([-13.6, 55, 0.5], [2.4, 2.4, 2.4], M.gold), ball([13.6, 55, 0.5], [2.4, 2.4, 2.4], M.gold),
    rod([-11, 56, 0.3], [0, 61, 0], 0.35, M.gold), rod([11, 56, 0.3], [0, 61, 0], 0.35, M.gold), ball([0, 61.2, 0], [0.9, 0.9, 0.9], M.ironLight),
    // кисть под острием клина
    rod([sway, B.low, 0], [sway, B.low - 2.4, 0.2], 0.3, M.gold), ball([sway, B.low - 3.6, 0.2], [0.9, 1.5, 0.9], M.gold),
  );
  return { parts };
}

// ---------------- разломы Бездны на арене ----------------
/**
 * 3D-разломы первой арены — не как трещина под костром тронного зала: на задней стене — рваная дыра во тьму с лиловыми
 * кристаллами по краю и выбитыми камнями; в полу — воронка: вздыбленные плиты пола, кристаллы торчат наружу, внутри тьма.
 * Размеры текстур (пиксели игры) и где у них точка опоры (у стены — низ на линии пола, у воронки — середина в полу).
 */
export const ARENA_RIFTS = {
  wall: { key: 'arena_wall_rift', w: 48, h: 62, anchor: { x: 24, y: 60 } },
  floor: { key: 'arena_floor_rift', w: 96, h: 60, anchor: { x: 48, y: 40 } },
  exit: { key: 'arena_exit_rift', w: 64, h: 44, anchor: { x: 32, y: 22 } },
} as const;
const CRYSTAL = ramp('#8a3ad0'), CRYSTAL_TIP = ramp('#d8a8ff'), RIFT_STONE = ramp('#3a4054'), RIFT_SLAB = ramp('#4b5265');
const RIFT_FRAME = ramp('#555c70'), RIFT_GROOVE = ramp('#2a2e3c'), RIFT_GOLD = ramp('#c8a048');
/** Руна на камне — светится лиловым. */
const RUNE = '#e0b0ff';

/**
 * Тьма разлома: чёрная середина, спиральные завихрения Бездны, яркий светящийся ободок у края
 * (r — расстояние от середины 0..1, a — угол).
 */
function voidShade(r: number, a = 0): Shade {
  if (r < 0.25) return '#05030a';
  if (r > 0.86) return '#6a2ab8';
  if (r > 0.78) return '#c070ff';   // светящийся ободок
  const swirl = Math.sin(a * 2 + r * 9) > 0.35;
  return swirl ? '#2c1054' : r < 0.55 ? '#0c0618' : '#1c0b34';
}
/** Оси бруска, повёрнутого в плоскости стены (x — вдоль угла a, y — поперёк, z — из стены). */
function inWall(a: number): Axes { return [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]]; }

/** Кристалл-осколок от base в сторону dir длиной len: четырёхгранный, сужается к светлому острию. */
function crystal(base: Vec, dir: Vec, len: number, w: number): Part {
  const u = norm(dir), side = norm(cross(u, Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), fwd = cross(side, u);
  return box(add(base, mul(u, len / 2)), [w, len / 2, w * 0.75], (s) => {
    if (s.y > 0.15 && Math.abs(s.x) > (1 - s.y) / 0.85) return null;
    return s.y > 0.45 ? CRYSTAL_TIP : CRYSTAL;
  }, [side, u, fwd]);
}

/** Разлом в задней стене: тьма, кольцо сколотого камня, кристаллы по краю наружу и вперёд, выбитые камни вокруг. */
function wallRift(): Model {
  const cy = 30, rx = 7, ry = 17, marks: Mark[] = [], parts: Part[] = [
    ball([0, cy, -0.6], [rx + 3, ry + 3.5, 1], (s) => (Math.hypot(s.x, s.y) > 0.6 ? RIFT_STONE : null)),
    ball([0, cy, 0], [rx, ry, 1.6], (s) => voidShade(Math.hypot(s.x, s.y), Math.atan2(s.y, s.x))),
  ];
  // каменная арка: резные блоки с бороздой посередине, на каждом втором — светящаяся руна; замковый камень с золотом
  const blocks = 12;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2, x = Math.cos(a) * (rx + 4.6), y = cy + Math.sin(a) * (ry + 4.4), top = i === blocks / 4 * 3;
    parts.push(box([x, y, 0.9], [top ? 2.6 : 1.9, top ? 2.2 : 1.6, 1.4], (q) => (Math.abs(q.x) < 0.14 && q.n[2] > 0.5 ? RIFT_GROOVE : top && q.y > 0.6 ? RIFT_GOLD : RIFT_FRAME), inWall(a + Math.PI / 2)));
    if (i % 2 === 0) marks.push({ p: [x, y, 2.4], color: RUNE, n: [0, 0, 1] });
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + hash(i, 1, 7) * 0.4, len = 5 + hash(i, 2, 7) * 6;
    parts.push(crystal([Math.cos(a) * (rx + 0.5), cy + Math.sin(a) * (ry + 0.5), 0.6], [Math.cos(a) * 0.8, Math.sin(a) * 0.5, 0.55], len, 1.1));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, d = 1.45 + hash(i, 3, 7) * 0.25;
    parts.push(box([Math.cos(a) * rx * d * 1.3, cy + Math.sin(a) * ry * d, 0.8], [1.8 + hash(i, 4, 7), 1.3, 1.2], RIFT_STONE, yaw(hash(i, 5, 7) - 0.5)));
  }
  return { parts, marks };
}

/** Разлом в полу: воронка тьмы, вокруг вздыбленные наружу плиты пола, из глубины торчат кристаллы. */
function floorRift(): Model {
  const R = 22, marks: Mark[] = [], parts: Part[] = [ball([0, 0, 0], [R, 0.5, R], (s) => voidShade(Math.hypot(s.x, s.z), Math.atan2(s.z, s.x)))];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + hash(i, 1, 9) * 0.3, out: Vec = [Math.cos(a), 0, Math.sin(a)];
    const up = norm([out[0] * 0.55, 1, out[2] * 0.55]), tangent: Vec = [-out[2], 0, out[0]];
    parts.push(box(add(mul(out, R + 2), [0, 1.4, 0]), [4.2, 1.2, 3.2], (q) => (q.n[1] > 0.5 && Math.abs(q.x) < 0.1 ? RIFT_GROOVE : RIFT_SLAB), [tangent, up, cross(tangent, up)]));
    if (i % 2 === 0) marks.push({ p: add(mul(out, R + 2), [0, 2.8, 0]), color: RUNE, n: [0, 1, 0] });   // руна на плите
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.5, len = 9 + hash(i, 2, 9) * 8;
    parts.push(crystal([Math.cos(a) * 10, -0.5, Math.sin(a) * 10], [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5], len, 1.6));
  }
  parts.push(crystal([1, -0.5, 0], [0.15, 1, 0.1], 15, 1.9), crystal([-3, -0.5, 2], [-0.3, 1, 0.2], 11, 1.5), crystal([3, -0.5, -2], [0.3, 1, -0.2], 10, 1.4));
  return { parts, marks };
}

/**
 * Разлом-выход внизу арены (держать E — домой): плоский — по нему ходят. Кольцо резных плит вровень с полом
 * с золотой вставкой и светящимися рунами, внутри — закрученная тьма с ярким ободком; не похож на разломы-ловушки
 * (те с кристаллами и вздыбленными плитами). EXIT_RIFT: радиус тьмы, сколько плит, их ширина.
 */
const EXIT_RIFT = { r: 20, slabs: 14, slab: 3.4 } as const;
function exitRift(): Model {
  const R = EXIT_RIFT.r, marks: Mark[] = [], parts: Part[] = [ball([0, 0.2, 0], [R, 0.5, R], (s) => voidShade(Math.hypot(s.x, s.z), Math.atan2(s.z, s.x)))];
  for (let i = 0; i < EXIT_RIFT.slabs; i++) {
    const a = (i / EXIT_RIFT.slabs) * TAU, out: Vec = [Math.cos(a), 0, Math.sin(a)], tangent: Vec = [-out[2], 0, out[0]];
    const len = (TAU * (R + EXIT_RIFT.slab)) / EXIT_RIFT.slabs / 2 - 0.35;
    parts.push(box(add(mul(out, R + EXIT_RIFT.slab), [0, 0.9, 0]), [len, 0.9, EXIT_RIFT.slab], (q) => {
      if (q.n[1] < 0.5) return RIFT_STONE;
      if (Math.abs(q.z + 0.15) < 0.12) return RIFT_GOLD;   // золотая вставка по кругу
      return Math.abs(q.x) > 0.9 ? RIFT_GROOVE : RIFT_SLAB;
    }, [tangent, [0, 1, 0], out]));
    if (i % 2 === 0) marks.push({ p: add(mul(out, R + EXIT_RIFT.slab * 1.45), [0, 1.9, 0]), color: RUNE, n: [0, 1, 0] });
  }
  return { parts, marks };
}

/**
 * Торговец 52x40 сидит у колонны на ящике: перед ним коврик с товаром (зелья, шлем, меч, монеты, свиток),
 * рядом заплечный мешок со скаткой; дышит, моргает, подбрасывает монету.
 */
function merchant(f: number): Model {
  const p = f / ANIM.merchant.frames;
  const dy = Math.sin(p * TAU) > 0.3 ? 0.5 : 0;
  const blink = p >= 0.8 && p < 0.86;
  const hx = -3, head: [Vec, Vec] = [[hx, 18.4 + dy, -1.2], [4.2, 4, 3.8]];
  // монета: первая половина цикла — летит и вертится, вторая — лежит в ладони
  const palm: Vec = [3.4, 12.6 + dy, 2.4];
  const coinY = p < 0.5 ? palm[1] + 1 + Math.sin((p / 0.5) * Math.PI) * 6 : palm[1] + 0.6;
  const spin = p < 0.5 ? p * TAU * 4 : Math.PI / 2;
  const axis: Vec = [Math.cos(spin) * 0.45, Math.sin(spin) * 0.45, 0];
  const crate: Paint = (s) => (s.n[1] > 0.9 ? M.woodLight : Math.abs(s.x) > 0.86 || Math.abs(s.y) > 0.8 ? M.woodDark : (s.y + 1) % 0.5 < 0.08 ? M.woodDark : M.wood);
  const rug: Paint = (s) => (Math.abs(s.x) > 0.9 || Math.abs(s.z) > 0.82 ? M.gold : Math.abs(((s.x + 1) * 4) % 1 - 0.5) + Math.abs(((s.z + 1) * 2) % 1 - 0.5) < 0.22 ? M.drape : M.cloth);
  const parts: Part[] = [
    box([3, 0.2, 7], [15, 0.2, 5.4], rug),
    box([hx, 2.4, -3], [6, 2.4, 4.4], crate),
    // ноги: колени выше сиденья, голени вниз, сапоги
    ...[-5.4, -0.6].flatMap((x): Part[] => [
      rod([x, 6, -1.4], [x - 0.4, 8, 4.4], 1.7, M.coat), rod([x - 0.4, 7.8, 4.6], [x - 0.2, 1.6, 5.6], 1.4, M.coat),
      ball([x - 0.2, 1.2, 6.6], [1.7, 1.2, 2.4], M.woodDark),
    ]),
    ball([hx, 11.4 + dy, -2], [5.8, 5.6, 3.9], (s) => (s.y > -0.38 && s.y < -0.16 ? M.gold : M.coat)),
    ball(head[0], head[1], M.skin),
    ball([hx, 17.6 + dy, 2.5], [1.1, 1, 0.9], M.skin),
    ball([hx, 16.1 + dy, 0.8], [3.4, 2.8, 2.6], M.beard),
    cyl([hx, 21.6 + dy, -1.2], [hx, 22.3 + dy, -1.2], 6.6, M.hat),
    cyl([hx, 22.3 + dy, -1.2], [hx, 25 + dy, -1.2], 3.9, (s) => (s.y < -0.35 && Math.abs(s.n[1]) < 0.9 ? M.gold : M.hatLight)),
    ball([hx + 3.4, 24.8 + dy, -1.6], [0.8, 2.3, 0.6], M.feather, roll(-0.4)),
    // правая рука на колене, левая с монетой
    rod([hx - 5.4, 14.4 + dy, -2], [hx - 4.4, 9.6, 4], 1.6, M.coat), ball([hx - 4.2, 9, 4.8], [1.5, 1.2, 1.5], M.skin),
    rod([hx + 5.4, 14.4 + dy, -2], [palm[0], palm[1] - 0.6, palm[2] - 0.8], 1.5, M.coat), ball(palm, [1.4, 1.1, 1.4], M.skin),
    cyl([palm[0] - axis[0], coinY - axis[1], palm[2]], [palm[0] + axis[0], coinY + axis[1], palm[2]], 1.5, M.goldBright),
    // товар на коврике
    ball([10, 2.4, 5], [2.6, 2.4, 2.4], M.ironLight), box([10, 0.6, 5], [3, 0.4, 2.8], M.iron),
    box([2, 0.9, 10], [6, 0.35, 0.8], M.steel), box([-4.4, 0.9, 10], [0.6, 0.6, 2.2], M.gold),
    cyl([15, 0.4, 9], [15, 1.6, 9], 1.9, M.gold), cyl([16.4, 1.6, 9.6], [16.4, 2.6, 9.6], 1.6, M.gold),
    cyl([4, 0.8, 4.2], [9, 0.8, 4.2], 0.9, M.linen),
    // заплечный мешок со скаткой
    ball([14, 6, -3], [5, 6, 4], (s) => (Math.abs(s.x) < 0.12 || Math.abs(s.y - 0.1) < 0.1 ? M.woodDark : M.cork)),
    cyl([9.4, 12.6, -3], [18.6, 12.6, -3], 2, M.cloth),
  ];
  for (const [x, z, glass] of [[-12, 8, M.glassRed], [-8.4, 10, M.glassBlue], [-15, 10.4, M.potion]] as const) {
    parts.push(ball([x, 2.4, z], [2.2, 2.2, 2.2], glass), cyl([x, 4.2, z], [x, 5.8, z], 0.7, M.glass), cyl([x, 5.8, z], [x, 6.5, z], 0.8, M.cork));
  }
  const eye = blink ? '#7a5a48' : '#272838';
  const marks: Mark[] = [-1.5, 1.5].flatMap((x): Mark[] => [{ p: [hx + x, 19.2 + dy, 2.4], color: eye, n: [0, 0, 1] }, ...(blink ? [] : [{ p: [hx + x - 0.5, 19.7 + dy, 2.4] as Vec, color: '#ffffff', n: [0, 0, 1] as Vec }])]);
  for (let x = -11; x <= 17; x += 2.5) marks.push({ p: [x, 0.5, 12.5], color: '#d6b66d', n: [0, 0, 1] });
  return { parts, marks, overlay: (c) => { if (p >= 0.19 && p < 0.25) sparkle(c, 36, 20); if (p >= 0.69 && p < 0.75) sparkle(c, 13, 30); } };
}
/** Торговец повёрнут вполоборота — видно, что он сидит (бёдра в профиль). */
const MERCHANT_FACING = 0.55;

/** Кирпичная кладка на грани бруска: ряды со сдвигом, тёмные швы. */
export function bricks(base: Ramp, joint: string, rows: number, cols: number): (s: Surface) => Shade {
  return (s) => {
    const r = (s.y + 1) * rows / 2, c = (s.x + 1) * cols / 2 + (Math.floor(r) % 2) * 0.5;
    return r % 1 < 0.18 || c % 1 < 0.1 ? joint : base;
  };
}

/** Котик бежит галопом (CAT_FRAME, смотрит влево): передние и задние лапы тянутся навстречу, хвост вздрагивает. */
function catRun(f: number): Model {
  const t = (f / ANIM.catRun.frames) * TAU, bob = -Math.abs(Math.sin(t)) * 1.2, reach = Math.sin(t) * 2;
  const stripes: Paint = (s) => (s.y > 0.2 && Math.sin(s.x * 9) > 0.55 ? M.furDark : s.y < -0.45 ? M.cream : M.fur);
  const parts: Part[] = [
    ball([0.5, 5.2 + bob, 0], [5, 2.6, 2.4], stripes),
    ball([-5.6, 7.3 + bob, 0], [2.8, 2.5, 2.4], M.fur), ball([-7.6, 6.6 + bob, 0], [1.3, 1.1, 1.3], M.cream),
    rod([-6.3, 9 + bob, 1.1], [-6.7, 10.8 + bob, 1.2], 0.6, M.fur), rod([-6.3, 9 + bob, -1.1], [-6.7, 10.8 + bob, -1.2], 0.6, M.furDark),
  ];
  for (const [x, z, k] of [[-3, 1.3, 1], [-3, -1.3, -1], [3.6, 1.3, -1], [3.6, -1.3, 1]] as const) {
    parts.push(rod([x, 4.4 + bob, z], [x + reach * k, 0.8, z], 0.8, z > 0 ? M.fur : M.furDark));
  }
  const sw = Math.sin(t + 1);
  parts.push(rod([5.2, 6 + bob, 0], [7, 8 + bob, 0], 0.7, M.fur), rod([7, 8 + bob, 0], [8.4, 10 + bob + sw, 0], 0.6, M.furDark));
  return { parts, marks: [{ p: [-7.6, 8 + bob, 1.5], color: '#7ad040', n: [-0.5, 0, 0.8] }, { p: [-8.8, 6.9 + bob, 0.6], color: '#f08a9a', n: [-1, 0, 0.3] }] };
}

/**
 * Бег по диагонали — та же модель, повёрнутая вокруг вертикали: «вниз» — бежит влево и к камере (видна мордочка),
 * «вверх» — влево и от камеры (видна спина). Вправо — те же кадры, отражённые спрайтом.
 */
/** Кадр котика (пиксели игры) и где в нём лапы на полу: снизу запас — при беге по диагонали зад ближе к камере и ниже. */
export const CAT_FRAME = { w: 20, h: 22, x: 10, y: 17 } as const;
export const CAT_DIAGONAL = { down: { key: 'cat_run_down', facing: 0.8 }, up: { key: 'cat_run_up', facing: -0.8 } } as const;

/** Котик сидит (CAT_FRAME, смотрит на зрителя): хвост вздрагивает, кот моргает. */
function catSit(f: number): Model {
  const p = f / ANIM.catSit.frames, swish = Math.abs(Math.sin(p * TAU)) * 2, blink = p >= 0.75 && p < 0.84;
  const parts: Part[] = [
    ball([0.6, 3, -0.6], [3.6, 3, 2.8], M.fur),
    ball([-0.4, 5.6, 0.6], [2.6, 3.4, 2.2], (s) => (s.z > 0.4 && Math.abs(s.x) < 0.45 ? M.cream : M.fur)),
    ball([-0.4, 9.8, 0.8], [2.8, 2.5, 2.4], M.fur), ball([-0.4, 9.2, 2.6], [1.2, 0.9, 0.8], M.cream),
    rod([-1.8, 11.4, 0.6], [-2.3, 13.2, 0.6], 0.6, M.fur), rod([1, 11.4, 0.6], [1.5, 13.2, 0.6], 0.6, M.fur),
    rod([-1.3, 4, 1.8], [-1.3, 0.6, 2.2], 0.75, M.cream), rod([0.5, 4, 1.8], [0.5, 0.6, 2.2], 0.75, M.cream),
    rod([3.4, 0.9, 0.8], [6, 0.9, 2], 0.8, M.fur), rod([6, 0.9, 2], [7, 1 + swish, 2.4], 0.7, M.furDark),
  ];
  const eye = blink ? '#a8561e' : '#7ad040';
  return { parts, marks: [{ p: [-1.6, 10.2, 3], color: eye, n: [0, 0, 1] }, { p: [0.8, 10.2, 3], color: eye, n: [0, 0, 1] }, { p: [-0.4, 9.4, 3.5], color: '#f08a9a', n: [0, 0, 1] }] };
}

/** Все объекты замка — листы кадров из 3D-моделей, по заданиям для экрана загрузки. */
export function propTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const sheet = (key: string, w: number, h: number, a: { frames: number; rate: number }, anchor: Anchor, build: (f: number) => Model, facing = 0): (() => void)[] =>
    modelSheetJobs(scene, key, w, h, a.frames, a.rate, anchor, build, { facing });
  return [
    ...sheet('castle_banner', 30, 58, ANIM.banner, { x: 15, y: 57 }, banner),
    ...modelSheetJobs(scene, 'castle_pillar', 32, 64, 1, 1, { x: 16, y: 60 }, pillar),
    ...sheet('castle_brazier', 24, 32, ANIM.brazier, { x: 12, y: 29 }, brazier),
    ...sheet('castle_merchant', 52, 40, ANIM.merchant, { x: 26, y: 31 }, merchant, MERCHANT_FACING),
    ...sheet('cat_run', CAT_FRAME.w, CAT_FRAME.h, ANIM.catRun, CAT_FRAME, catRun),
    ...sheet(CAT_DIAGONAL.down.key, CAT_FRAME.w, CAT_FRAME.h, ANIM.catRun, CAT_FRAME, catRun, CAT_DIAGONAL.down.facing),
    ...sheet(CAT_DIAGONAL.up.key, CAT_FRAME.w, CAT_FRAME.h, ANIM.catRun, CAT_FRAME, catRun, CAT_DIAGONAL.up.facing),
    ...sheet('cat_sit', CAT_FRAME.w, CAT_FRAME.h, ANIM.catSit, CAT_FRAME, catSit),
    ...modelSheetJobs(scene, ARENA_RIFTS.wall.key, ARENA_RIFTS.wall.w, ARENA_RIFTS.wall.h, 1, 1, ARENA_RIFTS.wall.anchor, wallRift),
    ...modelSheetJobs(scene, ARENA_RIFTS.floor.key, ARENA_RIFTS.floor.w, ARENA_RIFTS.floor.h, 1, 1, ARENA_RIFTS.floor.anchor, floorRift),
    ...modelSheetJobs(scene, ARENA_RIFTS.exit.key, ARENA_RIFTS.exit.w, ARENA_RIFTS.exit.h, 1, 1, ARENA_RIFTS.exit.anchor, exitRift),
  ];
}

/**
 * Сетка кладки: камень w x h (пиксели игры), сдвиг каждого второго ряда, начало сетки, ширина фаски, цвет шва.
 * Кладка «натягивается» на грань бруска: stoneAt даёт цвет точки грани.
 */
export interface Masonry { w: number; h: number; shift: number; x0: number; y0: number; edge: number; joint: string }

/**
 * Цвет кладки в точке (x — вдоль грани, y — вверх по грани): швы слева и снизу камня, у камня фаска —
 * свет сверху-слева, поэтому верхний и левый край светлее, нижний и правый темнее. lift < 0 — грань светлее (верхняя).
 */
export function stoneAt(m: Masonry, x: number, y: number, base: string, seed: number, lift = 0): Shade {
  const ry = (y - m.y0) / m.h, row = Math.floor(ry);
  const rx = (x - m.x0 - (((row % 2) + 2) % 2) * m.shift) / m.w, col = Math.floor(rx);
  const u = (rx - col) * m.w, v = (1 - (ry - row)) * m.h;   // от левого и от верхнего края камня
  const J = 0.8;
  if (u < J || v > m.h - J) return m.joint;
  const tones = stoneTone(base, hash(col, row, seed));
  const t = (k: number): string => tones[Math.max(0, Math.min(4, k + lift))]!;
  const top = v < m.edge, left = u < J + m.edge, bottom = v > m.h - J - m.edge, right = u > m.w - m.edge;
  if (top && left) return t(0);
  if (bottom && right) return t(4);
  if (top || left) return t(1);
  if (bottom || right) return t(3);
  return t(2);
}

/** Камень-«подушка» кладки: выпуклый, тон чуть гуляет по шуму n. */
const stoneCache = new Map<string, readonly [Ramp, Ramp, Ramp, Ramp]>();
export function stoneTone(base: string, n: number): Ramp {
  let v = stoneCache.get(base);
  if (!v) { v = [ramp(tone(base, -0.18)), ramp(tone(base, 0.08)), ramp(tone(base, -0.08)), ramp(base)]; stoneCache.set(base, v); }
  return n > 0.85 ? v[0] : n > 0.6 ? v[1] : n < 0.15 ? v[2] : v[3];
}
