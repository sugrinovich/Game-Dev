import Phaser from 'phaser';
import { HERO_SHEET, PLAYER_DIRECTIONS, type PlayerDirection } from '../configs/assets';
import { GAME } from '../configs/game';
import { add, CAMERA_PITCH, cross, dot, MODEL_AXES, mul, norm, project, renderModel, sub, type Axes, type Mark, type Paint, type Part, type Shade, type Surface, type Vec } from './Rig3D';
import { addOutline, addVolume, ramp, type Ramp } from './Volume';

/*
 * Персонажи — объёмные куклы со скелетом.
 * Скелет: таз, туловище, голова, плечо–локоть–кисть и бедро–колено–лодыжка. Поза кадра (шаг, взмах рук, дыхание)
 * задаёт углы суставов, а положения костей считаются от таза к кистям и стопам (прямая кинематика).
 * На кости надеты части тела — простые 3D-тела из Rig3D.ts: капсулы рук и ног, эллипсоиды головы, туловища, кистей.
 * Вещи (GEAR) знают свой слот и «натягиваются» на тело: перекрашивают его части своей текстурой (кольчуга, перчатки,
 * поножи) или добавляют свои тела (шлем, кошель, колчан). Оружие крепится к кисти, рукоять — перпендикулярно
 * предплечью: опущенная рука держит клинок вперёд, согнутая в локте — вверх.
 * 8 сторон — одна и та же модель, повёрнутая вокруг вертикали: оружие всегда в правой руке, без зеркал.
 * С оружием ближнего боя в листе есть и кадры удара (STRIKES): крупные бьют сверху вниз, остальные — по диагонали.
 * Тело сменное (BODIES): человек, скелет, орк, огр, Король Бездны — у каждого своё телосложение (Build).
 *
 * Координаты модели: пол — y = 0, y вверх, персонаж смотрит вперёд по +z, его правая сторона — по −x.
 * Единица модели — пиксель игры; лист рисуется в GAME.resolution раз детальнее, спрайт показывается уменьшенным.
 *
 * Чтобы картинка не «рябила», тело смещается только на целые пиксели листа (покачивание при шаге, дыхание):
 * голова и туловище в каждом кадре рисуются одинаково, двигаются лишь руки и ноги.
 */

export type HeroAnimKind = 'walk' | 'idle';
/** Поза кадра: ходьба, покой или удар (кадры удара берутся по одному, см. heroAttackFrame). */
type PoseKind = HeroAnimKind | 'attack';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const S = HERO_SHEET.frameSize;
/** Пикселей листа на пиксель игры. */
const RES = GAME.resolution;
/** Один пиксель листа по вертикали экрана — в единицах модели: на столько (кратно) поднимается и опускается тело. */
const PIXEL_Y = 1 / (RES * Math.cos(CAMERA_PITCH));
/** Сдвиг по экрану, округлённый до пикселя листа. */
function snap(v: number): number { return Math.round(v * RES) / RES; }
const COLUMNS = HERO_SHEET.walkFrames + HERO_SHEET.idleFrames;
/** Куда повёрнут персонаж в каждой из 8 сторон (градусы; 0 — лицом к камере, вниз по экрану). */
const FACING: Record<PlayerDirection, number> = { down: 0, 'down-left': -45, left: -90, 'up-left': -135, up: 180, 'up-right': 135, right: 90, 'down-right': 45 };

// ---------------- телосложение и скелет ----------------
/** Телосложение: размеры костей и частей тела в пикселях кадра. Высоты туловища, плеч и головы — над тазом. */
export interface Build {
  /** Кадр frame x frame; ground — строка пола (точка опоры спрайта). */
  frame: number; ground: number;
  /** Ноги: полуширина таза до сустава, бедро, голень, их толщина; стопа — радиусы и вынос вперёд. */
  leg: { hip: number; thigh: number; shin: number; r: readonly [number, number]; foot: Vec; toe: number };
  pelvis: Vec;
  torso: { y: number; z: number; r: Vec };
  shoulder: { w: number; y: number };
  head: { y: number; z: number; r: Vec };
  neck: number;
  /** Руки: плечо, предплечье, их толщина, радиус кисти. */
  arm: { upper: number; fore: number; r: readonly [number, number]; hand: number };
  /** Размах бедра при шаге, сгиб колена в переносе, взмах рук (градусы). */
  stride: number; knee: number; swing: number;
  /** Скорость анимаций, кадров в секунду: тяжёлые ходят медленнее. */
  walkRate: number; idleRate: number;
  /** Как бьёт оружием: крупные — сверху вниз по земле перед собой, остальные — по диагонали. */
  strike: Strike;
}

const HUMAN_BUILD: Build = {
  frame: S, ground: 30,
  leg: { hip: 1.7, thigh: 3.8, shin: 3.6, r: [1.55, 1.3], foot: [1.35, 1, 1.9], toe: 0.7 },
  pelvis: [3, 1.9, 2], torso: { y: 5, z: 0, r: [3.7, 3.9, 2.4] }, shoulder: { w: 3.5, y: 7.6 },
  head: { y: 12.6, z: 0.3, r: [4, 4, 3.7] }, neck: 1.3,
  arm: { upper: 3.2, fore: 3, r: [1.15, 1.05], hand: 1.25 },
  stride: 26, knee: 50, swing: 24, walkRate: HERO_SHEET.walkRate, idleRate: HERO_SHEET.idleRate, strike: 'diagonal',
};
/** Скелет: те же кости, что у человека, но тонкие — на него надеваются те же вещи. */
const SKELETON_BUILD: Build = {
  ...HUMAN_BUILD,
  leg: { ...HUMAN_BUILD.leg, r: [0.8, 0.75], foot: [1.1, 0.8, 1.7] },
  pelvis: [2.4, 1.3, 1.5], torso: { y: 5.2, z: 0, r: [3.3, 3.4, 2.2] }, head: { y: 12.4, z: 0.3, r: [3.7, 3.8, 3.5] }, neck: 0.7,
  arm: { upper: 3.2, fore: 3, r: [0.7, 0.65], hand: 0.95 },
};
/** Орк ростом с человека, но шире в плечах, с толстыми руками; кадр шире — чтобы влез топор. */
const ORC_BUILD: Build = {
  frame: 36, ground: 32,
  leg: { hip: 2, thigh: 3.8, shin: 3.4, r: [1.9, 1.6], foot: [1.6, 1.1, 2.1], toe: 0.7 },
  pelvis: [3.6, 2.2, 2.6], torso: { y: 5.2, z: 0.2, r: [4.8, 4.3, 3] }, shoulder: { w: 4.6, y: 7.8 },
  head: { y: 12, z: 0.7, r: [3.9, 3.8, 3.6] }, neck: 1.8,
  arm: { upper: 3.4, fore: 3.2, r: [1.6, 1.45], hand: 1.6 },
  stride: 24, knee: 46, swing: 22, walkRate: 16, idleRate: HERO_SHEET.idleRate, strike: 'diagonal',
};
/** Огр: кадр 48, огромный торс с пузом, короткие толстые ноги, длинные ручищи, маленькая голова низко и вперёд. */
const OGRE_BUILD: Build = {
  frame: 48, ground: 45,
  leg: { hip: 3.2, thigh: 4.2, shin: 3.8, r: [3, 2.6], foot: [2.6, 1.6, 3], toe: 1 },
  pelvis: [6, 3, 4.6], torso: { y: 8, z: 1, r: [8.4, 7.4, 5.8] }, shoulder: { w: 7.8, y: 11.5 },
  head: { y: 15.5, z: 3.4, r: [4.6, 4.4, 4.2] }, neck: 2.5,
  arm: { upper: 6.4, fore: 6.2, r: [2.7, 2.5], hand: 2.8 },
  stride: 20, knee: 40, swing: 18, walkRate: 11, idleRate: 6, strike: 'overhead',
};
/** Король Бездны: кадр 64, высокий; ноги скрыты мантией (шаг — лишь лёгкое колыхание). */
const KING_BUILD: Build = {
  frame: 64, ground: 61,
  leg: { hip: 2.6, thigh: 7, shin: 7, r: [2.2, 2], foot: [2, 1.4, 2.6], toe: 0.8 },
  pelvis: [5, 3, 4], torso: { y: 7.5, z: 0, r: [6.8, 7.2, 4.4] }, shoulder: { w: 6.8, y: 12.2 },
  head: { y: 19.5, z: 0.4, r: [4.8, 5, 4.6] }, neck: 2.2,
  arm: { upper: 6.4, fore: 5.6, r: [2, 1.85], hand: 2 },
  stride: 10, knee: 20, swing: 10, walkRate: 9, idleRate: 6, strike: 'diagonal',
};

/**
 * Хват оружия (градусы): плечо чуть вперёд, локоть согнут — предплечье смотрит вперёд-вниз, а рукоять (перпендикулярно ему) —
 * вверх-вперёд. roll — поворот кулака вокруг предплечья наружу: рукоять остаётся перпендикулярной предплечью,
 * но клинок отклоняется от тела и виден сбоку от него, а не перед грудью.
 */
const HOLD = { shoulder: 20, elbow: 50, spread: 18, roll: 22 } as const;
/** Свободная рука: лёгкий сгиб в локте, чуть в сторону от тела. */
const FREE = { elbow: 14, spread: 8, walkBend: 12 } as const;

type Strike = 'overhead' | 'diagonal';
/**
 * Кадр удара (градусы): плечо s (вперёд от «вниз»; 90 — вперёд, 180 — вверх) и sp (наружу от тела, минус — поперёк груди),
 * сгиб локтя e; куда смотрит оружие — w и wsp (так же, как рука); lean — корпус подаётся вперёд (доля высоты туловища);
 * free — подъём свободной руки; low — оружие уходит ниже ног (удар в землю, см. STRIKE_ROOM).
 * Оружие не параллельно предплечью (разница ≥ 25°) — кисть то отстаёт, то «хлещет» вперёд.
 */
interface StrikeKey { s: number; sp: number; e: number; w: number; wsp: number; lean: number; free: number; low?: boolean }
/**
 * Место в кадрах удара в землю (low, доля кадра): below — под ногами (у смотрящего на нас «перед» — ниже ног на экране),
 * floor — под ногами с любой стороны (кончик дубины уходит в землю), ahead — впереди (в профиль «перед» — вбок). Фигура в этих кадрах сдвинута, точка опоры кадра — у ног,
 * так что на экране она стоит на месте, а дубина не обрезается краем кадра.
 */
const STRIKE_ROOM = { below: 0.22, floor: 0.06, ahead: 0.12 } as const;
/** Удар по кадрам: 0 — оружие занесено (держится весь замах), 1–2 — рывок, 3 — удар, 4 — проводка, 5 — возврат к покою. */
const STRIKES: Record<Strike, readonly StrikeKey[]> = {
  // сверху вниз: дубина за головой → над головой → вперёд → в землю перед собой; вторая рука идёт следом.
  // Длинная дубина огра должна влезать в кадр со всех сторон — поэтому локоть согнут, а не рука во всю длину
  overhead: [
    { s: 140, sp: 10, e: 50, w: 275, wsp: 0, lean: -0.1, free: 150 },
    { s: 105, sp: 8, e: 20, w: 210, wsp: 0, lean: -0.04, free: 125 },
    { s: 90, sp: 5, e: 0, w: 160, wsp: 0, lean: 0.06, free: 90 },
    { s: 55, sp: 0, e: 20, w: 35, wsp: 0, lean: 0.2, free: 60, low: true },
    { s: 50, sp: 0, e: 15, w: 30, wsp: 0, lean: 0.18, free: 45, low: true },
    { s: 40, sp: 10, e: 30, w: 145, wsp: 0, lean: 0.08, free: 15 },
  ],
  // по диагонали: клинок над правым плечом → через грудь → вниз к левому бедру; свободная рука уходит назад
  diagonal: [
    { s: 145, sp: 35, e: 25, w: 235, wsp: 30, lean: -0.06, free: 25 },
    { s: 135, sp: 25, e: 15, w: 185, wsp: 25, lean: 0, free: 10 },
    { s: 105, sp: 5, e: 5, w: 140, wsp: 0, lean: 0.08, free: -10 },
    { s: 75, sp: -25, e: 0, w: 40, wsp: -40, lean: 0.2, free: -30 },
    { s: 55, sp: -35, e: 5, w: 25, wsp: -50, lean: 0.18, free: -25 },
    { s: 40, sp: -10, e: 30, w: 120, wsp: -10, lean: 0.06, free: 0 },
  ],
};
/** Сторона по x модели: правая (−x) и левая (+x); суффиксы имён частей тела. */
const SIDES = [-1, 1] as const;
const SIDE = ['R', 'L'] as const;

/** Кость с тремя суставами: плечо–локоть–запястье или бедро–колено–лодыжка. */
export interface Limb { a: Vec; b: Vec; c: Vec }
/** Скелет на одном кадре. */
export interface Pose {
  /** Фаза анимации от 0 до 1: огонь, свечение, колыхание ткани. */
  p: number; blink: boolean;
  /** Тазобедренный центр, центр туловища, центр головы. */
  pelvis: Vec; chest: Vec; head: Vec;
  /** [правая, левая]. */
  legs: readonly [Limb, Limb]; arms: readonly [Limb, Limb];
  /** Кулак правой руки и оси оружия в нём: up — вдоль рукояти, fore — вдоль предплечья, side — поперёк. */
  grip: { at: Vec; up: Vec; fore: Vec; side: Vec };
}

/** Направление кости руки: pitch — вперёд от «вниз», spread — в сторону от тела. */
function armDir(pitch: number, spread: number, side: number): Vec {
  return [side * Math.sin(spread), -Math.cos(pitch) * Math.cos(spread), Math.sin(pitch) * Math.cos(spread)];
}

function poseFor(B: Build, kind: PoseKind, p: number, armed: boolean): Pose {
  const walk = kind === 'walk', ph = p * TAU;
  const strike = kind === 'attack' ? STRIKES[B.strike][Math.round(p * HERO_SHEET.attackFrames)]! : null;
  // ноги в противофазе; нога, идущая вперёд, сгибает колено (перенос)
  const phase = [0, Math.PI];
  const legs = SIDES.map((side, i) => {
    const a = walk ? Math.sin(ph + phase[i]!) * B.stride * DEG : 0;
    const k = walk ? Math.max(0, Math.cos(ph + phase[i]!)) * B.knee * DEG : 0;
    const hip: Vec = [side * B.leg.hip, 0, 0];
    const knee = add(hip, mul([0, -Math.cos(a), Math.sin(a)], B.leg.thigh));
    return { a: hip, b: knee, c: add(knee, mul([0, -Math.cos(a - k), Math.sin(a - k)], B.leg.shin)) };
  });
  // таз стоит так высоко, чтобы опорная стопа касалась пола: при широком шаге он опускается — тело покачивается.
  // Опускается ровно на целые пиксели листа, иначе туловище и голова перерисовывались бы по-разному
  const rest = B.leg.foot[1] + B.leg.thigh + B.leg.shin;
  const drop = Math.round((rest - B.leg.foot[1] + Math.min(legs[0]!.c[1], legs[1]!.c[1])) / PIXEL_Y) * PIXEL_Y;
  const pelvis: Vec = [0, rest - drop, 0];
  // дыхание в покое: туловище, голова и руки приподнимаются на один пиксель листа
  const breath = kind === 'idle' && Math.sin(ph) > 0 ? PIXEL_Y : 0;
  // в ударе корпус подаётся вперёд (и чуть вниз), плечи и голова — вместе с ним
  const lean = strike ? strike.lean * B.torso.r[1] : 0, dip = Math.abs(lean) * 0.25;
  const at = (v: Vec): Vec => add(v, pelvis);
  const arms = SIDES.map((side, i): Limb & { pitch: number; spread: number } => {
    const s = walk ? Math.sin(ph + phase[i]!) : 0;   // рука идёт навстречу ноге своей стороны
    const holding = armed && i === 0;
    let pitch = (holding ? HOLD.shoulder - s * B.swing * 0.3 : -s * B.swing) * DEG;
    let bend = (holding ? HOLD.elbow : FREE.elbow + Math.max(0, -s) * FREE.walkBend) * DEG;
    let spread = (holding ? HOLD.spread : FREE.spread) * DEG;
    if (strike) {
      pitch = (holding ? strike.s : strike.free) * DEG;
      if (holding) { bend = strike.e * DEG; spread = strike.sp * DEG; }
    }
    const shoulder = at([side * B.shoulder.w, B.shoulder.y + breath - dip, lean]);
    const elbow = add(shoulder, mul(armDir(pitch, spread, side), B.arm.upper));
    return { a: shoulder, b: elbow, c: add(elbow, mul(armDir(pitch + bend, spread, side), B.arm.fore)), pitch: pitch + bend, spread };
  });
  const r = arms[0]!;
  const fore = armDir(r.pitch, r.spread, SIDES[0]);
  const at0 = add(r.c, mul(fore, B.arm.hand * 0.5));
  const body = { pelvis: at([0, 0, 0]), chest: at([0, B.torso.y + breath - dip, B.torso.z + lean]), head: at([0, B.head.y + breath - dip * 1.5, B.head.z + lean * 1.4]) };
  const legsOut: Pose['legs'] = [{ a: at(legs[0]!.a), b: at(legs[0]!.b), c: at(legs[0]!.c) }, { a: at(legs[1]!.a), b: at(legs[1]!.b), c: at(legs[1]!.c) }];
  if (strike) {
    // в ударе оружие смотрит туда, куда задано кадром; ось «вдоль предплечья» — перпендикуляр к нему в той же плоскости
    const up = armDir(strike.w * DEG, strike.wsp * DEG, SIDES[0]);
    const across = norm(sub(fore, mul(up, dot(fore, up))));
    return { p, blink: false, ...body, legs: legsOut, arms: [arms[0]!, arms[1]!], grip: { at: at0, up, fore: across, side: norm(cross(up, across)) } };
  }
  // рукоять перпендикулярна предплечью: в плоскости взмаха руки, затем кулак повёрнут наружу (вокруг предплечья)
  const swingUp: Vec = [0, Math.sin(r.pitch), Math.cos(r.pitch)];
  let outward = norm(cross(swingUp, fore));
  if (outward[0] * SIDES[0] < 0) outward = mul(outward, -1);
  const up = norm(add(mul(swingUp, Math.cos(HOLD.roll * DEG)), mul(outward, Math.sin(HOLD.roll * DEG))));
  return {
    p, blink: !walk && p >= 0.83 && p < 0.92, ...body, legs: legsOut,
    arms: [arms[0]!, arms[1]!],
    grip: { at: at0, up, fore, side: norm(cross(up, fore)) },
  };
}

// ---------------- части тела ----------------
type Parts = Map<string, Part>;
/** Всё, что собирается на кадр: части тела по именам, точечные детали, поза и телосложение. */
interface Dressing { parts: Parts; marks: Mark[]; pose: Pose; build: Build }
type Dresser = (d: Dressing) => void;

function ball(c: Vec, r: Vec, paint: Paint, axes?: Axes): Part { return { shape: axes ? { kind: 'ball', c, r, axes } : { kind: 'ball', c, r }, paint }; }
function rod(a: Vec, b: Vec, r: number, paint: Paint): Part { return { shape: { kind: 'rod', a, b, r }, paint }; }
function brick(c: Vec, r: Vec, axes: Axes, paint: Paint): Part { return { shape: { kind: 'box', c, r, axes }, paint }; }
function flat(color: string): Paint { return () => color; }
function both(name: string): string[] { return [name + SIDE[0], name + SIDE[1]]; }

/** Перекрасить части текстурой вещи; under — прежняя текстура (для мест, которые вещь не закрывает). */
function repaint(parts: Parts, names: readonly string[], paint: (s: Surface, under: (s: Surface) => Shade) => Shade): void {
  for (const name of names) {
    const part = parts.get(name);
    if (!part) continue;
    const old = part.paint;
    const under = (s: Surface): Shade => (typeof old === 'function' ? old(s) : old);
    parts.set(name, { shape: part.shape, paint: (s) => paint(s, under) });
  }
}

/** Точка на поверхности эллипсоида по долям ширины lx и высоты ly, на передней стороне — для глаз, пряжек, рун. */
function onBall(c: Vec, r: Vec, lx: number, ly: number, out = 1.03): { p: Vec; n: Vec } {
  const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  return { p: add(c, [lx * r[0] * out, ly * r[1] * out, lz * r[2] * out]), n: norm([lx / r[0], ly / r[1], lz / r[2]]) };
}
function markOn(d: Dressing, c: Vec, r: Vec, lx: number, ly: number, color: string): void { d.marks.push({ ...onBall(c, r, lx, ly), color }); }
/** Пара глаз на лице. */
function eyes(d: Dressing, color: string, lx: number, ly: number): void {
  for (const x of [-lx, lx]) markOn(d, d.pose.head, d.build.head.r, x, ly, color);
}

/** Где центр кисти: чуть дальше запястья вдоль предплечья. */
function handAt(B: Build, l: Limb): Vec { return add(l.c, mul(norm(sub(l.c, l.b)), B.arm.hand * 0.4)); }

/** Общее тело: таз, туловище, шея, голова; руки и ноги из капсул; кисти и стопы. limbs — материал рук и ног. */
function bodyParts(d: Dressing, skin: Paint, limbs: Paint = skin): void {
  const { parts, pose: P, build: B } = d;
  parts.set('pelvis', ball(add(P.pelvis, [0, B.pelvis[1] * 0.35, 0]), B.pelvis, skin));
  parts.set('torso', ball(P.chest, B.torso.r, skin));
  parts.set('neck', rod(add(P.chest, [0, B.torso.r[1] * 0.7, 0]), add(P.head, [0, -B.head.r[1] * 0.6, 0]), B.neck, skin));
  parts.set('head', ball(P.head, B.head.r, skin));
  P.legs.forEach((l, i) => {
    parts.set(`thigh${SIDE[i]}`, rod(l.a, l.b, B.leg.r[0], limbs));
    parts.set(`shin${SIDE[i]}`, rod(l.b, l.c, B.leg.r[1], limbs));
    parts.set(`foot${SIDE[i]}`, ball(add(l.c, [0, 0, B.leg.toe]), B.leg.foot, limbs));
  });
  P.arms.forEach((a, i) => {
    parts.set(`upper${SIDE[i]}`, rod(a.a, a.b, B.arm.r[0], limbs));
    parts.set(`fore${SIDE[i]}`, rod(a.b, a.c, B.arm.r[1], limbs));
    parts.set(`hand${SIDE[i]}`, ball(handAt(B, a), [B.arm.hand, B.arm.hand, B.arm.hand], limbs));
  });
}

// ---------------- материалы ----------------
/** Палитры материалов: ступени тона от блика к тени (см. ramp в Volume.ts). */
const M = {
  skin: ramp('#e2b48c'), hair: ramp('#6a4026'), bone: ramp('#e0d8c0'),
  orc: ramp('#6a9a42'), orcDark: ramp('#4a7430'), ogre: ramp('#a8865e'), belly: ramp('#c8a67a'), darkHair: ramp('#3a2a1c'), tusk: ramp('#f0e6c8'),
  shorts: ramp('#7a5a3a'), rope: ramp('#c8a870'), trousers: ramp('#4a4258'),
  mail: ramp('#727c8a'), mailDark: ramp('#4c5664'), leather: ramp('#6a4630'), leatherDark: ramp('#4a2e1e'), glove: ramp('#5a3a26'), gloveCuff: ramp('#7a5236'),
  gold: ramp('#c8a048'), wood: ramp('#8a5328'),
  /** Полированная сталь светлая даже в тени — клинок не теряется на кольчуге. */
  steel: ['#ffffff', '#f4f8fc', '#dde5ee', '#c2cbd8', '#a2acbc'], iron: ramp('#7a7f88'), ironDark: ramp('#4e525a'),
  cloth: ramp('#6e4c30'), fur: ramp('#8a7458'), fletch: ramp('#c84a4a'),
  robe: ramp('#4a3062'), robeFold: ramp('#3a2450'), armor: ramp('#4a3e64'), plate: ramp('#5e5080'),
  orb: ['#ffffff', '#f0c8ff', '#c070ff', '#8030d0', '#4a1880'],
} as const satisfies Record<string, Ramp>;
/** Цвета без светотени: глаза, впадины, огонь, руны. */
const C = {
  eye: '#1d1822', skinShade: '#b07a58', hollow: '#2a2430', eyeGlow: '#ff5a4a', eyeDim: '#7a2a2a',
  orcEye: '#ff4a2a', ogreEye: '#ffd040', mouth: '#2a1418', nail: '#e8dcc0', rust: '#8a5a3a', steelLight: '#f0f4f8', gold: '#f2d060',
  rune: '#c060ff', runeBright: '#e0a0ff', flame: '#8a30e0', flameTip: '#e0a0ff', void: '#0e0818', white: '#ffffff', string: '#e8e0c8',
} as const;

// ---------------- тела ----------------
/** Человек: кожа, волосы шапкой (лицо открыто), глаза и рот. */
const human: Dresser = (d) => {
  const { parts, pose: P, build: B } = d;
  bodyParts(d, M.skin);
  parts.set('hair', ball(add(P.head, [0, 0.35, -0.25]), mul(B.head.r, 1.07), (s) => (s.y > 0.28 || s.z < -0.1 || (Math.abs(s.x) > 0.84 && s.y > -0.2) ? M.hair : null)));
  eyes(d, P.blink ? C.skinShade : C.eye, 0.34, -0.02);
  markOn(d, P.head, B.head.r, 0, -0.42, C.skinShade);
};

/** Глазницы, нос и линия зубов черепа — тёмные впадины. */
function skullHollow(s: Surface): boolean {
  if (s.z < 0.4) return false;
  const socket = Math.abs(Math.abs(s.x) - 0.38) < 0.2 && Math.abs(s.y + 0.02) < 0.24;
  const nose = Math.abs(s.x) < 0.1 && s.y < -0.26 && s.y > -0.44;
  return socket || nose;
}

/** Скелет: тонкие кости, рёбра полосами (между ними пустота), позвоночник, череп с горящими глазами. */
const skeleton: Dresser = (d) => {
  const { parts, pose: P, build: B } = d;
  bodyParts(d, M.bone);
  parts.set('torso', ball(P.chest, B.torso.r, (s) => (s.y < -0.5 ? null : (Math.abs(s.x) < 0.14 && s.z > 0) || Math.floor((s.y + 1) * 3.2) % 2 === 0 ? M.bone : C.hollow)));
  parts.set('spine', rod(P.pelvis, add(P.chest, [0, B.torso.r[1] * 0.8, -B.torso.r[2] * 0.4]), 0.75, M.bone));
  parts.set('head', ball(P.head, B.head.r, (s) => (skullHollow(s) ? C.hollow : M.bone)));
  parts.set('jaw', ball(add(P.head, [0, -B.head.r[1] * 0.62, B.head.r[2] * 0.2]), [B.head.r[0] * 0.66, B.head.r[1] * 0.36, B.head.r[2] * 0.7], (s) => (s.z > 0.5 && Math.abs(s.y - 0.2) < 0.18 ? C.hollow : M.bone)));
  eyes(d, P.blink ? C.eyeDim : C.eyeGlow, 0.38, -0.02);
};

/** Орк: зелёная кожа, тяжёлое надбровье, челюсть с клыками, острые уши, гребень, обмотки на запястьях и голенях. */
const orc: Dresser = (d) => {
  const { parts, pose: P, build: B } = d;
  const hr = B.head.r;
  bodyParts(d, M.orc);
  parts.set('head', ball(P.head, hr, (s) => (s.z > 0.4 && s.y > 0.1 && s.y < 0.32 ? M.orcDark : M.orc)));
  const jaw = add(P.head, [0, -hr[1] * 0.42, hr[2] * 0.25]), jr: Vec = [hr[0] * 0.95, hr[1] * 0.5, hr[2] * 0.85];
  parts.set('jaw', ball(jaw, jr, (s) => (s.z > 0.6 && Math.abs(s.y - 0.1) < 0.14 && Math.abs(s.x) < 0.55 ? C.mouth : M.orc)));
  for (const side of SIDES) {
    const base = add(jaw, [side * jr[0] * 0.5, 0, jr[2] * 0.85]);
    parts.set(`tusk${side}`, rod(base, add(base, [side * 0.2, 1.6, 0.3]), 0.5, M.tusk));
    const ear = add(P.head, [side * hr[0] * 0.85, hr[1] * 0.15, -0.4]);
    parts.set(`ear${side}`, rod(ear, add(ear, [side * 1.8, 1, -0.8]), 0.6, M.orc));
  }
  parts.set('mohawk', ball(add(P.head, [0, hr[1] * 0.7, -0.3]), [0.9, hr[1] * 0.55, hr[2] * 0.95], (s) => (s.y > -0.3 ? M.darkHair : null)));
  eyes(d, P.blink ? '#4a7430' : C.orcEye, 0.34, 0.02);
  repaint(parts, both('fore'), (s, under) => (s.y > 0.55 ? M.leather : under(s)));
  repaint(parts, both('shin'), (s, under) => (s.y < -0.5 ? M.leather : under(s)));
};

/** Огр: горбатый великан, пузо, плечи-валуны, голова низко между плечами, челюсть с клыками, наручи. */
const ogre: Dresser = (d) => {
  const { parts, marks, pose: P, build: B } = d;
  const hr = B.head.r, tr = B.torso.r;
  bodyParts(d, M.ogre);
  parts.set('belly', ball(add(P.chest, [0, -tr[1] * 0.35, tr[2] * 0.45]), [tr[0] * 0.75, tr[1] * 0.65, tr[2] * 0.7], M.belly));
  P.arms.forEach((a, i) => parts.set(`boulder${SIDE[i]}`, ball(add(a.a, [0, 0.6, 0]), [B.arm.r[0] * 1.45, B.arm.r[0] * 1.3, B.arm.r[0] * 1.4], M.ogre)));
  repaint(parts, both('fore'), (s, under) => (s.y > 0.2 && s.y < 0.7 ? M.leather : under(s)));
  const jaw = add(P.head, [0, -hr[1] * 0.45, hr[2] * 0.35]), jr: Vec = [hr[0] * 1.05, hr[1] * 0.55, hr[2] * 0.8];
  parts.set('jaw', ball(jaw, jr, (s) => (s.z > 0.6 && Math.abs(s.y - 0.15) < 0.13 ? C.mouth : M.ogre)));
  parts.set('nose', ball(add(P.head, [0, -hr[1] * 0.05, hr[2] * 0.95]), [1.3, 1.1, 1.1], M.ogre));
  for (const side of SIDES) {
    const base = add(jaw, [side * jr[0] * 0.55, 0.2, jr[2] * 0.8]);
    parts.set(`tusk${side}`, rod(base, add(base, [0, 1.8, 0.3]), 0.6, M.tusk));
    parts.set(`ear${side}`, ball(add(P.head, [side * hr[0], 0, -0.5]), [0.9, 1.4, 1], M.ogre));
  }
  parts.set('head', ball(P.head, hr, (s) => (s.z > 0.4 && s.y > 0.08 && s.y < 0.28 ? M.belly : M.ogre)));
  eyes(d, P.blink ? '#7a5a3a' : C.ogreEye, 0.36, 0.0);
  for (const [x, z] of [[-0.8, 0.5], [0.6, 0.2], [0, -0.6]] as const) marks.push({ p: add(P.head, [x, hr[1] * 0.98, z]), color: '#2a1c14', n: [0, 1, 0] });
  P.legs.forEach((l) => marks.push({ p: add(l.c, [0, -0.2, B.leg.toe + B.leg.foot[2] * 1.02]), color: C.nail, n: [0, 0, 1] }));
};

/** Король Бездны: мантия до пола с пламенем по подолу, доспех с руной-оком, наплечники с шипами, капюшон-пустота, корона из рогов. */
const king: Dresser = (d) => {
  const { parts, marks, pose: P, build: B } = d;
  const hr = B.head.r, tr = B.torso.r;
  bodyParts(d, M.armor);
  for (const n of ['pelvis', ...both('thigh'), ...both('shin'), ...both('foot')]) parts.delete(n);
  // мантия: верх купола — у пояса, ниже пола обрезана; подол колышется
  const sway = snap(Math.sin(P.p * TAU) * 0.6);
  parts.set('robe', ball([sway, 0, -0.4], [9.5, P.pelvis[1] + 2.5, 7.5], (s) => {
    if (s.y < 0) return null;
    const a = Math.atan2(s.z, s.x);
    const fire = 0.07 + 0.05 * (Math.sin(a * 7 + P.p * TAU * 2) + 1);
    if (s.y < fire) return s.y < fire * 0.55 ? C.flame : C.flameTip;
    return Math.sin(a * 6) > 0.8 ? M.robeFold : M.robe;
  }));
  parts.set('torso', ball(P.chest, tr, (s) => (s.y < -0.68 && s.y > -0.86 ? M.gold : M.armor)));
  // руна-око на груди мерцает
  const rune = Math.sin(P.p * TAU * 2) > 0 ? C.rune : C.runeBright;
  for (const [x, y] of [[0, 0.22], [-0.1, 0.14], [0.1, 0.14], [-0.2, 0.06], [0.2, 0.06], [-0.1, -0.02], [0.1, -0.02], [0, -0.1]] as const) markOn(d, P.chest, tr, x, y, rune);
  markOn(d, P.chest, tr, 0, 0.06, C.white);
  P.arms.forEach((a, i) => {
    const side = SIDES[i]!;
    const top = add(a.a, [side * 0.6, 1.2, 0]);
    parts.set(`pauldron${SIDE[i]}`, ball(top, [3.4, 2.4, 3.2], M.plate));
    parts.set(`spike${SIDE[i]}`, rod(add(top, [0, 1.8, 0]), add(top, [side * 0.6, 4.6, 0]), 0.6, M.bone));
  });
  repaint(parts, both('fore'), (s, under) => (s.y < -0.65 ? M.gold : under(s)));
  // капюшон: впереди — пустота с горящими глазами; золотой обруч
  parts.set('head', ball(P.head, hr, (s) => {
    if (s.z > 0.35 && s.y < 0.42 && Math.abs(s.x) < 0.72) return C.void;
    return s.y > 0.48 && s.y < 0.66 ? M.gold : M.robe;
  }));
  const glow = Math.sin(P.p * TAU * 2) > 0.3 ? C.white : C.runeBright;
  eyes(d, glow, 0.3, 0.05);
  // рога короны: от обруча наружу и вверх, к острию тоньше
  for (const side of SIDES) {
    const base = add(P.head, [side * hr[0] * 0.55, hr[1] * 0.75, 0]);
    const mid = add(base, [side * 1.6, 2, 0]);
    parts.set(`horn${side}`, rod(base, mid, 0.8, M.bone));
    parts.set(`hornTip${side}`, rod(mid, add(mid, [side * 0.3, 2.4, 0]), 0.5, M.bone));
  }
  marks.push({ p: add(P.head, [0, hr[1] * 0.6, hr[2] * 0.82]), color: C.rune, n: [0, 0.4, 1] });
};

interface Body { build: Build; dress: Dresser }
const BODIES = {
  human: { build: HUMAN_BUILD, dress: human },
  skeleton: { build: SKELETON_BUILD, dress: skeleton },
  orc: { build: ORC_BUILD, dress: orc },
  ogre: { build: OGRE_BUILD, dress: ogre },
  abyssKing: { build: KING_BUILD, dress: king },
} satisfies Record<string, Body>;
export type BodyId = keyof typeof BODIES;

// ---------------- вещи ----------------
export const GEAR_SLOTS = ['legs', 'body', 'belt', 'head', 'hands', 'weapon'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
interface GearVisual { slot: GearSlot; dress: Dresser }

/** Самая тонкая деталь (полутолщина): тоньше пикселя она пропадала бы, когда видна «с ребра». */
const MIN_HALF = 0.5;

/** Точка у кулака с оружием: up — вдоль рукояти, fore — вдоль предплечья, side — поперёк. */
function onGrip(P: Pose, up: number, fore = 0, side = 0): Vec {
  const g = P.grip;
  return add(add(add(g.at, mul(g.up, up)), mul(g.fore, fore)), mul(g.side, side));
}
function gripAxes(P: Pose): Axes { return [P.grip.side, P.grip.up, P.grip.fore]; }
/** Направление лезвия топора: вперёд и наружу от тела (оружие в правой руке, наружу — это −x), поперёк рукояти. */
function bladeOut(P: Pose): Vec {
  const out = add(P.grip.fore, [-0.9, 0, 0]);
  return norm(sub(out, mul(P.grip.up, dot(out, P.grip.up))));
}

/** Дубина огра: от кисти вниз и вверх, к верху толще; в навершие вбиты шипы. */
const CLUB = { from: -3, length: 19, segments: 5, r0: 0.9, r1: 2.4, spikes: [11, 14, 17] } as const;
/** Сфера Короля Бездны: центр выше кулака на lift пикселей экрана, радиус r. Отсюда же вылетают огненные шары. */
export const ORB = { lift: 7, r: 4 } as const;
/** Лук: полудлина плеча, насколько концы отогнуты назад к лучнику. */
const BOW = { half: 7.5, bend: 2.6 } as const;

/** Узор кольчуги: ряды колец, в каждом втором ряду — тёмные звенья через одно. */
function mailAt(s: Surface): Ramp {
  const row = Math.floor((s.y + 1) * 5);
  return row % 2 === 0 && Math.floor((s.x + 1) * 6 + row * 0.5) % 2 === 0 ? M.mailDark : M.mail;
}

export const GEAR = {
  shorts: {
    slot: 'legs',
    // шорты на верёвке: таз и верх бёдер (у капсулы бедра y от −1 у таза до 1 у колена)
    dress: ({ parts }) => {
      repaint(parts, ['pelvis'], (s) => (s.y > 0.55 ? M.rope : M.shorts));
      repaint(parts, both('thigh'), (s, under) => (s.y < 0.15 ? M.shorts : under(s)));
    },
  },
  greaves: {
    slot: 'legs',
    // штаны и железные поножи с наколенниками, сапоги
    dress: ({ parts, pose: P, build: B }) => {
      repaint(parts, ['pelvis', ...both('thigh')], () => M.trousers);
      repaint(parts, both('shin'), () => M.iron);
      repaint(parts, both('foot'), () => M.leatherDark);
      P.legs.forEach((l, i) => parts.set(`knee${SIDE[i]}`, ball(add(l.b, [0, 0, 0.4]), mul([1, 1, 1], B.leg.r[0] * 0.95), M.iron)));
    },
  },
  chainmail: {
    slot: 'body',
    // кольчуга на туловище и плечах, кожаный пояс с золотой пряжкой
    dress: (d) => {
      const { parts, pose: P, build: B } = d;
      repaint(parts, ['torso'], (s) => (s.y < -0.62 ? M.leather : mailAt(s)));
      repaint(parts, both('upper'), (s) => mailAt({ ...s, x: s.x * 0.5 }));
      markOn(d, P.chest, B.torso.r, 0, -0.74, C.gold);
    },
  },
  purse: {
    slot: 'belt',
    // ремень через грудь (с правого плеча к левому бедру) и кошель на левом бедре
    dress: (d) => {
      const { parts, marks, pose: P, build: B } = d;
      repaint(parts, ['torso'], (s, under) => (Math.abs(s.x * 0.75 + s.y) < 0.15 ? M.leather : under(s)));
      const hip = add(P.pelvis, [B.pelvis[0] * 0.95, 0.3, B.pelvis[2] * 0.35]);
      parts.set('pouch', brick(hip, [0.9, 1.2, 1.1], MODEL_AXES, M.leather));
      parts.set('pouchFlap', brick(add(hip, [0.05, 0.8, 0]), [1, 0.45, 1.2], MODEL_AXES, M.leatherDark));
      marks.push({ p: add(hip, [1, 0.3, 0]), color: C.gold, n: [1, 0, 0] });
    },
  },
  helm: {
    slot: 'head',
    // железный шлем: купол чуть больше головы, лицо открыто, сзади назатыльник, обод над глазами, наносник
    dress: ({ parts, marks, pose: P, build: B }) => {
      const r = mul(B.head.r, 1.13);
      parts.set('helm', ball(add(P.head, [0, 0.4, 0]), r, (s) => {
        if (s.y < -0.05 && !(s.z < -0.25 && s.y > -0.65)) return null;
        return s.y < 0.1 && s.y > -0.05 ? M.ironDark : M.iron;
      }));
      parts.set('nasal', rod(add(P.head, [0, 0.4, r[2] * 0.95]), add(P.head, [0, -B.head.r[1] * 0.35, B.head.r[2] * 1.05]), 0.55, M.iron));
      for (const [x, z] of [[1.2, 0.6], [-1.5, -0.8]] as const) marks.push({ p: add(P.head, [x, r[1] * 1.3, z]), color: C.rust, n: [0, 1, 0] });
    },
  },
  gloves: {
    slot: 'hands',
    // кожаные перчатки с раструбом до середины предплечья (у капсулы предплечья y от −1 у локтя до 1 у кисти)
    dress: ({ parts }) => {
      repaint(parts, both('hand'), () => M.glove);
      repaint(parts, both('fore'), (s, under) => (s.y > -0.1 ? (s.y < 0.2 ? M.gloveCuff : M.glove) : under(s)));
    },
  },
  quiver: {
    slot: 'belt',
    // колчан за спиной (из-за плеча торчат стрелы) и ремень через грудь
    dress: ({ parts, pose: P, build: B }) => {
      const back = -(B.torso.r[2] + 0.9);
      const bottom = add(P.pelvis, [-1.4, B.torso.y * 0.45, back]), top = add(P.pelvis, [1.6, B.torso.y + B.torso.r[1] * 0.75, back]);
      parts.set('quiver', rod(bottom, top, 1.25, M.leather));
      const dir = norm(sub(top, bottom));
      [-0.6, 0.6].forEach((o, i) => {
        const tip = add(add(top, [o, 0, 0]), mul(dir, 3));
        parts.set(`arrow${i}`, rod(add(top, [o, 0, 0]), tip, 0.5, M.wood));
        parts.set(`fletch${i}`, ball(tip, [0.65, 0.65, 0.65], M.fletch));
      });
      repaint(parts, ['torso'], (s, under) => (Math.abs(s.x * 0.8 - s.y) < 0.16 ? M.leather : under(s)));
    },
  },
  stick: {
    slot: 'weapon',
    dress: ({ parts, marks, pose: P }) => {
      parts.set('stick', rod(onGrip(P, -3.5), onGrip(P, 10.5), 0.75, M.wood));
      marks.push({ p: onGrip(P, 5, 0.8), color: '#b87a40' });
    },
  },
  sword: {
    slot: 'weapon',
    // навершие, рукоять в кулаке, гарда поперёк, клинок с острием
    dress: ({ parts, pose: P }) => {
      parts.set('pommel', ball(onGrip(P, -2.6), [0.85, 0.85, 0.85], M.gold));
      parts.set('hilt', rod(onGrip(P, -2.1), onGrip(P, 1.2), 0.6, M.leather));
      parts.set('guard', brick(onGrip(P, 1.7), [2.5, MIN_HALF, 0.55], gripAxes(P), M.gold));
      parts.set('blade', brick(onGrip(P, 7.4), [0.95, 5.3, MIN_HALF], gripAxes(P), (s) => (s.y > 0.78 && Math.abs(s.x) > (1 - s.y) * 4.5 ? null : M.steel)));
    },
  },
  bow: {
    slot: 'weapon',
    // плечи лука изгибаются дугой (середина — в кулаке, концы отогнуты назад), тетива прямая
    dress: ({ parts, pose: P }) => {
      const pts = Array.from({ length: 7 }, (_, i) => { const t = i / 3 - 1; return onGrip(P, t * BOW.half, -t * t * BOW.bend); });
      for (let i = 0; i < 6; i++) parts.set(`bow${i}`, rod(pts[i]!, pts[i + 1]!, 0.6, i === 2 || i === 3 ? M.leather : M.wood));
      parts.set('bowString', rod(pts[0]!, pts[6]!, 0.5, flat(C.string)));
    },
  },
  axe: {
    slot: 'weapon',
    // топорище и полукруглое лезвие наружу-вперёд, светлая заточенная кромка
    dress: ({ parts, pose: P }) => {
      parts.set('haft', rod(onGrip(P, -4.5), onGrip(P, 9.5), 0.7, M.wood));
      const out = bladeOut(P);
      const axes: Axes = [norm(cross(P.grip.up, out)), P.grip.up, out];
      parts.set('axeHead', brick(add(onGrip(P, 7.4), mul(out, 2)), [MIN_HALF, 2.4, 1.9], axes, (s) => {
        if (s.z < 0 && Math.abs(s.y) > 0.45 + s.z * 0.5 + 0.5) return null;   // к топорищу уже — полумесяц
        return s.z > 0.6 ? M.steel : M.iron;
      }));
    },
  },
  club: {
    slot: 'weapon',
    // дубина: к верху толще, в навершие вбиты железные шипы
    dress: ({ parts, marks, pose: P }) => {
      const step = CLUB.length / CLUB.segments;
      for (let i = 0; i < CLUB.segments; i++) {
        const r = CLUB.r0 + ((CLUB.r1 - CLUB.r0) * i) / (CLUB.segments - 1);
        parts.set(`club${i}`, rod(onGrip(P, CLUB.from + i * step), onGrip(P, CLUB.from + (i + 1) * step), r, M.wood));
      }
      const out = bladeOut(P);
      for (const at of CLUB.spikes) {
        const r = CLUB.r0 + ((CLUB.r1 - CLUB.r0) * (at - CLUB.from)) / CLUB.length;
        for (const dir of [out, mul(out, -1), P.grip.side]) marks.push({ p: add(onGrip(P, at), mul(dir, r + 0.5)), color: C.steelLight });
      }
    },
  },
  orb: {
    slot: 'weapon',
    // сфера Бездны парит над ладонью: к ней тянется нить силы, вокруг кружат искры
    dress: ({ parts, marks, pose: P }) => {
      const lift = (ORB.lift + snap(Math.sin(P.p * TAU))) / Math.cos(CAMERA_PITCH);
      const c = add(P.grip.at, [0, lift, 0]);
      parts.set('orb', ball(c, [ORB.r, ORB.r, ORB.r], M.orb));
      for (let y = 1; y < lift - ORB.r; y++) if ((y + Math.floor(P.p * 12)) % 3) marks.push({ p: add(P.grip.at, [0, y, 0]), color: C.rune });
      for (let i = 0; i < 3; i++) {
        const a = P.p * TAU + (i * TAU) / 3;
        marks.push({ p: add(c, [Math.cos(a) * (ORB.r + 2), Math.sin(a * 2) * 0.8, Math.sin(a) * (ORB.r + 2)]), color: C.runeBright });
      }
    },
  },
  // ---------------- вещи орды ----------------
  hide: {
    slot: 'body',
    // меховой воротник, ремень через грудь и железный наплечник на левом плече (без оружия)
    dress: ({ parts, marks, pose: P, build: B }) => {
      const tr = B.torso.r;
      parts.set('collar', ball(add(P.chest, [0, tr[1] * 0.78, 0]), [tr[0] * 0.85, 1.6, tr[2] * 1.05], M.fur));
      repaint(parts, ['torso'], (s, under) => (Math.abs(s.x * 0.8 + s.y) < 0.16 ? M.leather : under(s)));
      const sh = P.arms[1].a;
      parts.set('pauldron', ball(add(sh, [0.4, 0.6, 0]), [2.2, 1.7, 2.2], M.iron));
      marks.push({ p: add(sh, [0.4, 2.4, 0]), color: C.steelLight, n: [0, 1, 0] });
    },
  },
  loincloth: {
    slot: 'legs',
    // повязка на бёдрах с поясом, костяная пряжка, передник качается при шаге
    dress: ({ parts, marks, pose: P, build: B }) => {
      repaint(parts, ['pelvis'], (s) => (s.y > 0.45 ? M.leatherDark : M.cloth));
      const pr = B.pelvis, sway = snap(Math.sin(P.p * TAU) * 0.4);
      parts.set('apron', brick(add(P.pelvis, [sway, -pr[1] * 0.8, pr[2] * 0.95]), [pr[0] * 0.42, pr[1] * 1.1, MIN_HALF], MODEL_AXES, M.cloth));
      marks.push({ p: add(P.pelvis, [0, pr[1] * 0.95, pr[2] * 1.05]), color: C.nail, n: [0, 0, 1] });
    },
  },
} satisfies Record<string, GearVisual>;

export type GearId = keyof typeof GEAR;
export type Outfit = Partial<Record<GearSlot, GearId>>;
/** Стартовая одежда: шорты и палка. Это обычные вещи — их заменяет то, что надето в тот же слот. */
export const STARTER_OUTFIT: Outfit = { legs: 'shorts', weapon: 'stick' };

export function heroSheetKey(outfit: Outfit, body: BodyId = 'human'): string { return `${body}:${GEAR_SLOTS.map((s) => outfit[s] ?? '-').join('.')}`; }
export function heroAnimKey(sheet: string, kind: HeroAnimKind, dir: PlayerDirection): string { return `${sheet}-${kind}-${dir}`; }
/** Кадр удара k (0 — занесено, 3 — удар, 5 — возврат; см. STRIKES) в сторону dir. Есть только у листов с оружием ближнего боя. */
export function heroAttackFrame(dir: PlayerDirection, k: number): string { return `attack-${dir}-${k}`; }
/** Оружие ближнего боя: с ним в листе есть кадры удара. */
const MELEE: ReadonlySet<GearId> = new Set<GearId>(['stick', 'sword', 'axe', 'club']);

// ---------------- сборка листа ----------------
/** Модель на один кадр: скелет в позе, тело и надетые вещи. Одна и та же для всех 8 сторон. */
function dressFor(outfit: Outfit, body: BodyId, kind: PoseKind, p: number): Dressing {
  const { build, dress } = BODIES[body];
  const d: Dressing = { parts: new Map(), marks: [], pose: poseFor(build, kind, p, outfit.weapon !== undefined), build };
  dress(d);
  for (const slot of GEAR_SLOTS) { const id = outfit[slot]; if (id) GEAR[id].dress(d); }
  return d;
}

/** Модель персонажа на один кадр — для заставки, где к ней добавляются щит, плащ и плюмаж. */
export function heroModel(outfit: Outfit, body: BodyId, kind: HeroAnimKind, p: number): { parts: Part[]; marks: Mark[]; pose: Pose; build: Build } {
  const d = dressFor(outfit, body, kind, p);
  return { parts: [...d.parts.values()], marks: d.marks, pose: d.pose, build: d.build };
}

/** Сколько пикселей кадров рисовать за одно задание: у героя — несколько сторон одной позы, у Короля — по одной. */
const PIXELS_PER_JOB = S * S * RES * RES * 6;

/**
 * Лист кадров для набора одежды: ходьба и покой в 8 сторон, в GAME.resolution раз детальнее пикселей игры;
 * с оружием ближнего боя — ещё столбцы кадров удара (heroAttackFrame).
 * Задание — одна поза (столбец листа), собранная один раз и нарисованная с нескольких сторон, затем светотень и контур;
 * последнее задание регистрирует кадры и анимации. Пусто, если лист уже готов.
 */
export function heroSheetJobs(scene: Phaser.Scene, outfit: Outfit, body: BodyId = 'human'): (() => void)[] {
  const key = heroSheetKey(outfit, body);
  if (scene.textures.exists(key)) return [];
  const { build } = BODIES[body];
  const F = build.frame * RES, rows = PLAYER_DIRECTIONS.length;
  const perJob = Math.max(1, Math.floor(PIXELS_PER_JOB / (F * F)));
  const strikes = outfit.weapon && MELEE.has(outfit.weapon) ? HERO_SHEET.attackFrames : 0, columns = COLUMNS + strikes;
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const jobs: (() => void)[] = [() => {
    tex = scene.textures.createCanvas(key, F * columns, F * rows);
    if (tex) tex.getContext().imageSmoothingEnabled = false;
  }];
  for (let col = 0; col < columns; col++) for (let row0 = 0; row0 < rows; row0 += perJob) jobs.push(() => {
    if (!tex) return;
    const c = tex.getContext();
    const row1 = Math.min(rows, row0 + perJob), x0 = col * F, y0 = row0 * F, h = (row1 - row0) * F;
    const kind: PoseKind = col < HERO_SHEET.walkFrames ? 'walk' : col < COLUMNS ? 'idle' : 'attack';
    const p = kind === 'walk' ? col / HERO_SHEET.walkFrames : kind === 'idle' ? (col - HERO_SHEET.walkFrames) / HERO_SHEET.idleFrames : (col - COLUMNS) / HERO_SHEET.attackFrames;
    const model = dressFor(outfit, body, kind, p);
    const parts = [...model.parts.values()];
    const img = c.createImageData(F, h);
    for (let row = row0; row < row1; row++) {
      const facing = FACING[PLAYER_DIRECTIONS[row]!] * DEG, feet = kind === 'attack' ? strikeFeet(build, row, col - COLUMNS) : { x: build.frame / 2, y: build.ground };
      renderModel({ data: img.data, width: F, x: 0, y: (row - row0) * F, w: F, h: F }, feet.x * RES, feet.y * RES, parts, model.marks, { facing, scale: RES });
    }
    c.putImageData(img, x0, y0);
    addVolume(c, F, h, F, F, x0, y0);
    addOutline(c, F, h, F, F, x0, y0);
  });
  jobs.push(() => {
    if (!tex) return;
    tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    PLAYER_DIRECTIONS.forEach((dir, row) => {
      // если в кадрах удара фигура стоит выше — у всех кадров своя точка опоры (у ног), иначе спрайт прыгал бы
      const lifted = strikes > 0 && STRIKES[build.strike].some((key) => key.low);
      for (let col = 0; col < COLUMNS; col++) {
        const frame = tex!.add(String(row * COLUMNS + col), 0, col * F, row * F, F, F);
        if (lifted) pinFeet(frame, build, { x: build.frame / 2, y: build.ground });
      }
      for (let k = 0; k < strikes; k++) {
        const frame = tex!.add(heroAttackFrame(dir, k), 0, (COLUMNS + k) * F, row * F, F, F);
        if (lifted) pinFeet(frame, build, strikeFeet(build, row, k));
      }
      const anim = (kind: HeroAnimKind, start: number, count: number, frameRate: number): void => {
        const k = heroAnimKey(key, kind, dir);
        if (scene.anims.exists(k)) scene.anims.remove(k);
        scene.anims.create({ key: k, frames: Array.from({ length: count }, (_, i) => ({ key, frame: String(row * COLUMNS + start + i) })), frameRate, repeat: -1 });
      };
      anim('walk', 0, HERO_SHEET.walkFrames, build.walkRate);
      anim('idle', HERO_SHEET.walkFrames, HERO_SHEET.idleFrames, build.idleRate);
    });
  });
  return jobs;
}

/** Где ноги в кадре удара k (пиксели кадра): в ударе в землю фигура приподнята и отодвинута назад (STRIKE_ROOM). */
function strikeFeet(build: Build, row: number, k: number): { x: number; y: number } {
  const F = build.frame;
  if (!STRIKES[build.strike][k]!.low) return { x: F / 2, y: build.ground };
  const facing = FACING[PLAYER_DIRECTIONS[row]!] * DEG;
  return { x: F / 2 - Math.round(F * STRIKE_ROOM.ahead * Math.sin(facing)), y: build.ground - Math.round(F * (STRIKE_ROOM.floor + STRIKE_ROOM.below * Math.max(0, Math.cos(facing)))) };
}

/** Точка опоры кадра — у ног: при смене кадра спрайт сам ставит её в свою позицию. */
function pinFeet(frame: Phaser.Textures.Frame | null, build: Build, feet: { x: number; y: number }): void {
  if (!frame) return;
  frame.customPivot = true;
  frame.pivotX = feet.x / build.frame;
  frame.pivotY = feet.y / build.frame;
}

/** Точка опоры (под ступнями) на кадре тела — origin спрайта. */
export function heroOrigin(body: BodyId = 'human'): { x: number; y: number } {
  const { build } = BODIES[body];
  return { x: 0.5, y: build.ground / build.frame };
}

/** Где кулак с оружием относительно точки опоры (пиксели игры, у спрайта обычного размера) — в покое, при взгляде в сторону dir. */
export function gripOffset(body: BodyId, dir: PlayerDirection): { x: number; y: number } {
  return project(poseFor(BODIES[body].build, 'idle', 0, true).grip.at, FACING[dir] * DEG);
}

/** Лист кадров сразу (если его ещё нет). Возвращает ключ текстуры. */
export function ensureHeroSheet(scene: Phaser.Scene, outfit: Outfit, body: BodyId = 'human'): string {
  for (const job of heroSheetJobs(scene, outfit, body)) job();
  return heroSheetKey(outfit, body);
}

const OCTANTS: PlayerDirection[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
/** Запас угла (радианы): на границе секторов персонаж не мигает между двумя направлениями. */
const FACING_HYSTERESIS = 0.15;

/** Куда смотреть при движении (dx, dy): 8 сторон. current — текущее направление, держится, пока угол рядом с ним. */
export function facingOf(dx: number, dy: number, current?: PlayerDirection): PlayerDirection {
  const a = Math.atan2(dy, dx);
  if (current && Math.abs(Phaser.Math.Angle.Wrap(a - OCTANTS.indexOf(current) * (Math.PI / 4))) < Math.PI / 8 + FACING_HYSTERESIS) return current;
  return OCTANTS[Math.round(a / (Math.PI / 4)) & 7]!;
}

/** Смена анимации без рывка: при повороте во время ходьбы шаг продолжается с той же фазы. */
export function playKeepingStep(sprite: Phaser.GameObjects.Sprite, key: string): void {
  const current = sprite.anims.currentAnim?.key;
  // после кадров удара анимация остановлена — её нужно запустить снова, даже если ключ тот же
  if (current === key && sprite.anims.isPlaying) return;
  const keepPhase = !!current && current.includes('-walk-') && key.includes('-walk-');
  const progress = keepPhase ? sprite.anims.getProgress() : 0;
  sprite.play(key);
  if (keepPhase) sprite.anims.setProgress(progress);
}
