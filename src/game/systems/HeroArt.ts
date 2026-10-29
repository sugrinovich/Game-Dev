import Phaser from 'phaser';
import { HERO_SHEET, PLAYER_DIRECTIONS, type PlayerDirection } from '../configs/assets';
import { addOutline, addVolume, blob, cone, ramp, roundCorners, tube, type Ramp } from './Volume';

/*
 * Герой — «кукла»: базовое тело + вещи, которые цепляются к точкам крепления (Rig).
 * Тело на каждом кадре сообщает, где голова, торс, бёдра, ноги, руки и кисть с оружием.
 * Вещь знает только свой слот и рисует себя относительно этих точек на нужных слоях.
 * Новая вещь = новая запись в GEAR (и поле wear у предмета в лавке).
 * Тело тоже сменное (BODIES) и со своим телосложением (Build): враги — та же кукла с телом
 * skeleton, orc, ogre или abyssKing и теми же вещами. Поэтому все ходят в 8 сторон.
 */

export type HeroAnimKind = 'walk' | 'idle';
type View = 'front' | 'back' | 'side';
type Ctx = CanvasRenderingContext2D;
interface Box { x: number; y: number; w: number; h: number }

/** Сегменты руки и ноги (координаты в кадре 32x32). */
interface Arm { upper: Box; lower: Box; hand: Box }
interface Leg { upper: Box; lower: Box; foot: Box; far: boolean }

/** Точки крепления на одном кадре. */
export interface Rig {
  view: View;
  /** Смещение тела вниз при дыхании и шаге (0 или 1). */
  b: number;
  /** Фаза анимации от 0 до 1: огонь, свечение, колыхание ткани. */
  p: number;
  blink: boolean;
  /** Вполоборота: 0 — прямо, −1 — повёрнут влево (вправо рисуется зеркалом). */
  turn: number;
  head: Box;
  torso: Box;
  hips: Box;
  /** Порядок: сначала дальняя (рисуется первой). */
  legs: Leg[];
  arms: Arm[];
  /** Кисть, держащая оружие, — всегда правая рука персонажа. */
  grip: Box;
  /** Где эта кисть на экране (до зеркального отражения): −1 — слева, 1 — справа. */
  gripSide: number;
  /** Вид сбоку: оружие в дальней руке — рисуется за телом, тело его частично закрывает. */
  gripFar: boolean;
  /** Куда смотрит остриё: вверх (спереди и сзади) или вперёд-вверх (сбоку). */
  weaponAngled: boolean;
}

/** Слои отрисовки снизу вверх. Тело рисует свои части на legs/torso/arms/head/hands. */
const STAGES = ['behind', 'farHand', 'legs', 'legwear', 'torso', 'bodywear', 'arms', 'sleeves', 'belt', 'head', 'headwear', 'held', 'hands'] as const;
type Stage = (typeof STAGES)[number];
type Painter = (c: Ctx, r: Rig) => void;

export const GEAR_SLOTS = ['legs', 'feet', 'body', 'belt', 'head', 'weapon'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
interface GearVisual { slot: GearSlot; paint: Partial<Record<Stage, Painter>> }

const TAU = Math.PI * 2;
const S = HERO_SHEET.frameSize;
const COLUMNS = HERO_SHEET.walkFrames + HERO_SHEET.idleFrames;
const C = {
  skin: '#e2b48c', skinShade: '#c08a68', skinLight: '#f2cfa8', skinDark: '#a07050',
  hair: '#6a4026', hairLight: '#8a5a36', hairDark: '#4a2a18', eye: '#1d1822',
  shorts: '#7a5a3a', shortsShade: '#5e4229', shortsLight: '#94704a', rope: '#c8a870',
  mail: '#8a94a0', mailDark: '#5e6874', mailLight: '#c0c8d0',
  leather: '#6a4630', leatherLight: '#8a6040', gold: '#e4b650',
  wood: '#8a5328', woodDark: '#4a2a14', woodLight: '#b87a40',
  steel: '#c8d0d8', steelLight: '#f0f4f8',
  bone: '#e8e0c8', boneShade: '#b8ae98', hollow: '#2a2430', eyeGlow: '#ff5a4a', eyeDim: '#7a2a2a',
  iron: '#7a7f88', ironLight: '#a8adb5', ironDark: '#4e525a', rust: '#8a5a3a', string: '#e8e0c8', fletch: '#c84a4a',
} as const;

function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function px(c: Ctx, color: string, x: number, y: number): void { rect(c, color, x, y, 1, 1); }
function box(c: Ctx, color: string, r: Box): void { rect(c, color, r.x, r.y, r.w, r.h); }
/** Та же ступень на тон темнее: дальняя нога, рука в тени. */
function dim(r: Ramp): Ramp { return [r[1], r[2], r[3], r[4], r[4]]; }

/** Часть тела как цилиндр: светлый край слева (со стороны света), тень справа. */
function cyl(c: Ctx, r: Box, base: string, light: string, shade: string): void {
  box(c, base, r);
  if (r.w >= 3) rect(c, light, r.x, r.y, 1, r.h);
  if (r.w >= 2) rect(c, shade, r.x + r.w - 1, r.y, 1, r.h);
}

// ---------------- скелет: точки крепления для кадра ----------------
/**
 * Телосложение: кадр и размеры частей тела в пикселях. Точки крепления на каждом кадре считаются из них,
 * поэтому одна и та же кукла (и те же вещи) годится и для героя, и для огра, и для Короля Бездны.
 */
interface Build {
  /** Кадр frame x frame; ground — строка под ступнями (точка опоры спрайта). */
  frame: number; ground: number;
  /** Голова: ширина спереди и сбоку, высота. */
  head: { w: number; side: number; h: number };
  /** Торс: ширина спереди, вполоборота и сбоку, высота; hips — высота бёдер. */
  torso: { w: number; diag: number; side: number; h: number }; hips: number;
  /** Нога: толщина, зазор между ногами спереди, бедро, голень, стопа. */
  leg: { w: number; gap: number; upper: number; lower: number; foot: number };
  /** Рука: толщина, плечо, предплечье (спереди; сбоку на пиксель короче), кисть. */
  arm: { w: number; upper: number; lower: number; hand: number };
  /** Размах шага и взмаха рук при ходьбе. */
  stride: number; swing: number;
  /** Скорость анимаций, кадров в секунду: тяжёлые ходят медленнее. */
  walkRate: number; idleRate: number;
}

const HUMAN_BUILD: Build = {
  frame: S, ground: 30, head: { w: 8, side: 7, h: 7 }, torso: { w: 10, diag: 8, side: 6, h: 7 }, hips: 4,
  leg: { w: 3, gap: 2, upper: 3, lower: 2, foot: 2 }, arm: { w: 2, upper: 3, lower: 3, hand: 2 },
  stride: 3, swing: 2, walkRate: HERO_SHEET.walkRate, idleRate: HERO_SHEET.idleRate,
};
/** Орк ростом с человека, но шире в плечах и с руками толще; кадр шире — чтобы влезло лезвие топора. */
const ORC_BUILD: Build = {
  ...HUMAN_BUILD, frame: 36, ground: 32, torso: { w: 12, diag: 10, side: 8, h: 7 }, arm: { w: 3, upper: 3, lower: 3, hand: 2 }, walkRate: 16,
};
/** Огр: кадр 48, огромный торс, короткие толстые ноги, длинные ручищи, маленькая голова. */
const OGRE_BUILD: Build = {
  frame: 48, ground: 45, head: { w: 10, side: 9, h: 9 }, torso: { w: 20, diag: 16, side: 14, h: 13 }, hips: 6,
  leg: { w: 6, gap: 2, upper: 4, lower: 4, foot: 3 }, arm: { w: 5, upper: 6, lower: 6, hand: 4 },
  stride: 4, swing: 2, walkRate: 11, idleRate: 6,
};
/** Король Бездны: кадр 64, высокий, ноги скрыты мантией (шаг — лишь лёгкое колыхание). */
const KING_BUILD: Build = {
  frame: 64, ground: 61, head: { w: 10, side: 9, h: 10 }, torso: { w: 16, diag: 14, side: 12, h: 15 }, hips: 6,
  leg: { w: 5, gap: 2, upper: 7, lower: 7, foot: 3 }, arm: { w: 4, upper: 7, lower: 6, hand: 3 },
  stride: 2, swing: 1, walkRate: 9, idleRate: 6,
};

function buildRig(B: Build, dir: PlayerDirection, kind: HeroAnimKind, p: number): Rig {
  const walk = kind === 'walk';
  const s = walk ? Math.sin(p * TAU) : 0;
  const b = walk ? (Math.abs(s) > 0.5 ? 1 : 0) : (Math.sin(p * TAU) > 0.4 ? 1 : 0);
  const blink = !walk && p >= 0.83 && p < 0.92;
  const cx = B.frame / 2;
  // по высоте снизу вверх: стопа, голень, бедро — стоят на полу; бёдра, торс, голова и руки качаются (b)
  const footY = B.ground - B.leg.foot, lowerY = footY - B.leg.lower, upperY = lowerY - B.leg.upper;
  const hipsY = upperY - B.hips + b, torsoY = hipsY - B.torso.h, headY = torsoY - B.head.h, armY = torsoY + 1;
  if (dir === 'left' || dir === 'right') {
    const tx = cx - Math.floor(B.torso.side / 2);
    const stride = walk ? Math.round(s * B.stride) : 0;
    const lift = walk ? Math.max(0, Math.round(Math.cos(p * TAU) * (B.stride / 2))) : 0;
    const leg = (dx: number, up: number, far: boolean): Leg => ({
      upper: { x: tx + 1 + Math.round(dx / 2), y: upperY, w: B.leg.w, h: B.leg.upper },
      lower: { x: tx + 1 + dx, y: lowerY - up, w: B.leg.w, h: B.leg.lower },
      foot: { x: tx + dx, y: footY - up, w: B.leg.w + 1, h: B.leg.foot },
      far,
    });
    const arm = walk ? -Math.round(s * B.swing) : 0;
    const ax = tx + Math.floor((B.torso.side - B.arm.w) / 2), lowerH = B.arm.lower - 1;
    const hand = { x: ax + arm, y: armY + B.arm.upper + lowerH, w: B.arm.w, h: B.arm.hand };
    // правая рука: при взгляде вправо (рисуется зеркалом) — ближняя; при взгляде влево — дальняя, её кисть у груди за телом
    const nearGrip = dir === 'right';
    const farHand = { x: tx - B.arm.w - Math.round(arm / 2), y: hand.y - 1, w: B.arm.w, h: B.arm.hand };
    return {
      view: 'side', b, p, blink, turn: 0,
      head: { x: tx - 1, y: headY, w: B.head.side, h: B.head.h },
      torso: { x: tx, y: torsoY, w: B.torso.side, h: B.torso.h },
      hips: { x: tx, y: hipsY, w: B.torso.side, h: B.hips },
      legs: [leg(-stride, 0, true), leg(stride, lift, false)],
      arms: [{ upper: { x: ax, y: armY, w: B.arm.w, h: B.arm.upper }, lower: { x: ax + Math.round(arm / 2), y: armY + B.arm.upper, w: B.arm.w, h: lowerH }, hand }],
      grip: nearGrip ? hand : farHand, gripSide: -1, gripFar: !nearGrip, weaponAngled: true,
    };
  }
  // спереди и сзади; диагональ — вполоборота: торс уже, голова и ноги смещены в сторону поворота
  const back = dir.startsWith('up');
  const diag = dir.includes('-');
  const turn = diag ? -1 : 0;
  const tw = diag ? B.torso.diag : B.torso.w, tx = cx - Math.floor(tw / 2);
  const armL = walk ? Math.round(-s * (B.swing * 0.75)) : 0;
  const sidestep = diag && walk ? Math.round(s) : 0;   // по диагонали ноги шагают ещё и вбок
  const leg = (x: number, up: number, far: boolean): Leg => ({
    upper: { x, y: upperY, w: B.leg.w, h: B.leg.upper }, lower: { x, y: lowerY - up, w: B.leg.w, h: B.leg.lower },
    foot: { x, y: footY - up, w: B.leg.w, h: B.leg.foot }, far,
  });
  // оружие в правой руке: спереди она слева на экране, сзади — справа. Стороны «вправо» рисуются зеркалом,
  // поэтому для них до отражения берём другую руку — после отражения оружие снова окажется в правой.
  const gripSide = (back ? 1 : -1) * (dir.endsWith('right') ? -1 : 1);
  const arm = (x: number, a: number, side: number): Arm => {
    const grips = side === gripSide;   // кисть с оружием шире — она обхватывает рукоять
    const lowerY = armY + B.arm.upper;
    return {
      upper: { x, y: armY, w: B.arm.w, h: B.arm.upper }, lower: { x, y: lowerY, w: B.arm.w, h: B.arm.lower + a },
      hand: { x: grips && side < 0 ? x - 1 : x, y: lowerY + B.arm.lower + a, w: grips ? B.arm.w + 1 : B.arm.w, h: B.arm.hand },
    };
  };
  const left = arm(tx - B.arm.w, armL, -1), right = arm(tx + tw, -armL, 1);
  // дальняя нога в тени: вполоборота спереди это правая на экране, сзади — левая
  const up = (k: number): number => Math.max(0, Math.round(k * (B.stride - 1)));
  const legL = leg(cx - B.leg.gap / 2 - B.leg.w + sidestep, up(s), diag && back);
  const legR = leg(cx + B.leg.gap / 2 - (diag ? 1 : 0) - sidestep, up(-s), diag && !back);
  return {
    view: back ? 'back' : 'front', b, p, blink, turn,
    head: { x: cx - B.head.w / 2 + turn, y: headY, w: B.head.w, h: B.head.h },
    torso: { x: tx, y: torsoY, w: tw, h: B.torso.h },
    hips: { x: tx, y: hipsY, w: tw, h: B.hips },
    legs: legR.far ? [legR, legL] : [legL, legR],
    arms: [left, right],
    grip: gripSide < 0 ? left.hand : right.hand, gripSide, gripFar: false, weaponAngled: false,
  };
}

// ---------------- тела ----------------
const HUMAN: Partial<Record<Stage, Painter>> = {
  legs: (c, r) => {
    for (const l of r.legs) {
      // дальняя нога в тени целиком
      const [base, light, shade] = l.far ? [C.skinShade, C.skinShade, C.skinDark] : [C.skin, C.skinLight, C.skinShade];
      cyl(c, l.upper, base, light, shade); cyl(c, l.lower, base, light, shade);
      box(c, base, l.foot); px(c, light, l.foot.x, l.foot.y); rect(c, shade, l.foot.x, l.foot.y + 1, l.foot.w, 1);
    }
  },
  torso: (c, { torso: t, view }) => {
    box(c, C.skin, t);
    rect(c, C.skinShade, t.x + t.w - 2, t.y, 2, t.h); rect(c, C.skinDark, t.x + t.w - 1, t.y + 1, 1, t.h - 1);
    rect(c, C.skinLight, t.x + 1, t.y, 1, 4); rect(c, C.skinLight, t.x + 1, t.y, t.w - 4, 1);
    rect(c, C.skinShade, t.x, t.y + t.h - 1, t.w, 1);
    const mid = t.x + Math.floor(t.w / 2) - 1;
    if (view === 'back') { rect(c, C.skinShade, mid, t.y + 1, 1, 5); px(c, C.skinShade, t.x + 2, t.y + 2); px(c, C.skinShade, t.x + t.w - 3, t.y + 2); }
    if (view === 'front') { rect(c, C.skinShade, t.x + 1, t.y + 3, 3, 1); rect(c, C.skinShade, t.x + t.w - 5, t.y + 3, 3, 1); px(c, C.skinShade, mid, t.y + 5); }
  },
  arms: (c, r) => {
    for (const a of r.arms) {
      cyl(c, a.upper, C.skin, C.skinLight, C.skinShade); cyl(c, a.lower, C.skin, C.skinLight, C.skinShade);
      px(c, C.skinLight, a.upper.x, a.upper.y);
    }
  },
  head: (c, { head: h, view, b, blink, turn }) => {
    const eye = blink ? C.skinShade : C.eye;
    const { x, y } = h;
    if (view === 'back') {
      rect(c, C.hair, x - 1, y - 2, h.w + 2, 8); rect(c, C.hairLight, x + 1, y - 2, 4, 1); rect(c, C.hairLight, x, y + 1, 1, 3);
      rect(c, C.hairDark, x + h.w - 1, y - 1, 2, 7); rect(c, C.hairDark, x - 1, y + 5, h.w + 2, 1);
      rect(c, C.skinShade, x + 1, y + 6, 6, 1);
      // вполоборота виден краешек щеки, прямо — оба уха
      if (turn) { px(c, C.skin, x - 1, y + 3); px(c, C.skinShade, x - 1, y + 4); } else { px(c, C.skinShade, x - 1, y + 3); px(c, C.skinShade, x + h.w, y + 3); }
    } else if (view === 'front') {
      box(c, C.skin, h); rect(c, C.skinShade, x + h.w - 1, y, 1, h.h); rect(c, C.skinShade, x + 1, y + 6, 6, 1);
      rect(c, C.hair, x - 1, y - 2, h.w + 2, 3); rect(c, C.hair, x, y + 1, h.w, 1); rect(c, C.hair, x - 1, y + 1, 1, 3); rect(c, C.hair, x + h.w, y + 1, 1, 3);
      rect(c, C.hairLight, x + 1, y - 2, 4, 1); rect(c, C.hairDark, x + h.w - 1, y - 2, 2, 3); rect(c, C.hairDark, x + h.w, y + 1, 1, 3); rect(c, C.hairDark, x + h.w - 3, y + 1, 3, 1);
      if (turn) rect(c, C.hair, x + h.w - 2, y + 1, 2, 4);   // вполоборота справа виден затылок
      rect(c, C.skinLight, x, y + 2, 1, 3);
      px(c, C.skinShade, x - 1, y + 4); px(c, C.skinShade, turn ? x + h.w - 3 : x + h.w, y + 4);
      px(c, eye, x + 2 + turn, y + 3); px(c, eye, x + 5 + turn, y + 3); rect(c, C.skinShade, x + 3 + turn, y + 5, 2, 1);
    } else {
      box(c, C.skin, h); rect(c, C.skinShade, 13, 11 + b, 5, 1); px(c, C.skin, 11, 9 + b);
      rect(c, C.hair, 12, 3 + b, 8, 3); rect(c, C.hair, 16, 6 + b, 4, 4); px(c, C.hair, 12, 6 + b);
      rect(c, C.hairLight, 14, 3 + b, 3, 1); rect(c, C.hairDark, 18, 5 + b, 2, 5); px(c, C.skinLight, 12, 7 + b);
      px(c, C.skinShade, 16, 9 + b); px(c, eye, 13, 8 + b);
    }
  },
  // дальняя рука сбоку: кисть вынесена перед грудью, между ней и телом виден кусочек предплечья
  farHand: (c, r) => { if (r.gripFar) { box(c, C.skinShade, r.grip); rect(c, C.skinDark, r.grip.x + r.grip.w, r.grip.y, r.torso.x - r.grip.x - r.grip.w, 1); } },
  hands: (c, r) => {
    for (const a of r.arms) box(c, C.skin, a.hand);
    if (r.view === 'side' && !r.gripFar) px(c, C.skinShade, r.grip.x + 1, r.grip.y + 1);
  },
};

/** Скелет: те же точки крепления, что у героя, — поэтому на него надеваются те же вещи. */
const SKELETON: Partial<Record<Stage, Painter>> = {
  legs: (c, r) => {
    for (const l of r.legs) {
      const bone = l.far ? C.boneShade : C.bone;
      rect(c, bone, l.upper.x + 1, l.upper.y, 1, l.upper.h);
      rect(c, bone, l.lower.x, l.lower.y, 3, 1); rect(c, bone, l.lower.x + 1, l.lower.y + 1, 1, l.lower.h - 1);
      px(c, bone, l.foot.x + 1, l.foot.y); rect(c, bone, l.foot.x, l.foot.y + 1, l.foot.w, 1);
    }
    // таз
    const h = r.hips;
    if (r.view === 'side') { rect(c, C.bone, h.x + 1, h.y, 4, 2); px(c, C.boneShade, h.x + 2, h.y + 2); return; }
    rect(c, C.bone, h.x + 1, h.y, 3, 2); rect(c, C.bone, h.x + h.w - 4, h.y, 3, 2);
    rect(c, C.boneShade, h.x + Math.floor(h.w / 2) - 1, h.y, 2, 3); rect(c, C.bone, h.x + 2, h.y + 2, h.w - 4, 1);
  },
  torso: (c, { torso: t, view }) => {
    const side = view === 'side';
    // грудная клетка: тень внутри, рёбра сужаются книзу, ниже — только позвоночник
    rect(c, C.hollow, t.x + 1, t.y + 1, t.w - 2, 4);
    rect(c, C.bone, side ? t.x : t.x - 1, t.y, side ? t.w : t.w + 2, 1);
    for (const y of [t.y + 2, t.y + 4]) { const inset = y - t.y >= 4 ? 1 : 0; rect(c, C.bone, t.x + (side ? 0 : inset), y, t.w - (side ? 1 : inset * 2), 1); }
    const spine = side ? t.x + t.w - 2 : t.x + Math.floor(t.w / 2) - 1;
    rect(c, view === 'front' ? C.boneShade : C.bone, spine, t.y, side ? 1 : 2, t.h);
    if (side) rect(c, C.boneShade, t.x, t.y + 1, 1, 4);
    if (view === 'back') { px(c, C.boneShade, t.x + 2, t.y + 1); px(c, C.boneShade, t.x + t.w - 3, t.y + 1); }
  },
  arms: (c, r) => {
    for (const a of r.arms) {
      rect(c, C.bone, a.upper.x, a.upper.y, 1, a.upper.h); px(c, C.bone, a.upper.x + 1, a.upper.y);
      rect(c, C.boneShade, a.upper.x, a.upper.y + a.upper.h - 1, 2, 1);
      rect(c, C.bone, a.lower.x, a.lower.y, 1, a.lower.h);
    }
  },
  head: (c, { head: h, view, blink, turn }) => {
    const glow = blink ? C.eyeDim : C.eyeGlow;
    rect(c, C.bone, h.x + 1, h.y - 3, h.w - 2, 1);
    if (view === 'back') {
      rect(c, C.bone, h.x, h.y - 2, h.w, 7); rect(c, C.boneShade, h.x + h.w - 1, h.y - 2, 1, 7);
      rect(c, C.boneShade, h.x + Math.floor(h.w / 2) - 1, h.y + 5, 2, 2);
    } else if (view === 'front') {
      rect(c, C.bone, h.x, h.y - 2, h.w, 6); rect(c, C.boneShade, h.x + h.w - 1, h.y - 2, 1, 6);
      rect(c, C.bone, h.x + 1, h.y + 4, h.w - 2, 2); rect(c, C.boneShade, h.x + 2, h.y + 6, h.w - 4, 1);
      for (let x = h.x + 2; x < h.x + h.w - 2; x += 2) px(c, C.hollow, x, h.y + 4);
      // вполоборота глазницы и нос сдвинуты в сторону поворота
      rect(c, C.hollow, h.x + 1 + turn, h.y + 1, 2, 2); rect(c, C.hollow, h.x + 5 + turn, h.y + 1, 2, 2);
      px(c, glow, h.x + 2 + turn, h.y + 2); px(c, glow, h.x + 5 + turn, h.y + 2);
      rect(c, C.hollow, h.x + 3 + turn, h.y + 3, 2, 1);
    } else {
      rect(c, C.bone, h.x, h.y - 2, h.w, 6); rect(c, C.boneShade, h.x + h.w - 2, h.y - 2, 2, 6);
      rect(c, C.bone, h.x, h.y + 4, 4, 2); px(c, C.hollow, h.x + 1, h.y + 4);
      rect(c, C.hollow, h.x + 1, h.y + 1, 2, 2); px(c, glow, h.x + 1, h.y + 2);
      px(c, C.hollow, h.x, h.y + 3);
    }
  },
  farHand: (c, r) => { if (r.gripFar) rect(c, C.boneShade, r.grip.x, r.grip.y, r.torso.x - r.grip.x, 1); },
  hands: (c, r) => { for (const a of r.arms) { rect(c, C.bone, a.hand.x, a.hand.y, a.hand.w, 1); px(c, C.boneShade, a.hand.x, a.hand.y + 1); } },
};

/** Материалы орды — ступени тона от блика к тени (см. ramp). */
const M = {
  orc: ramp('#6a9a42'), ogre: ramp('#a8865e'), belly: ramp('#c8a67a'),
  leather: ramp('#7a5236'), fur: ramp('#8a7458'), iron: ramp('#7e848e'), wood: ramp('#7a4a26'), cloth: ramp('#6e4c30'),
  robe: ramp('#4a3062'), armor: ramp('#4a3e64'), plate: ramp('#5e5080'), gold: ramp('#c8a048'), bone: ramp('#d8d0c0'),
  void: ['#2a1a3a', '#1a1028', '#0e0818', '#08040e', '#050208'], orb: ['#ffffff', '#f0c8ff', '#c070ff', '#8030d0', '#4a1880'],
} as const satisfies Record<string, Ramp>;
/** Мелкие детали орды: клыки, глаза, волосы, ногти, руны, пламя Бездны. */
const H = {
  tusk: '#f0e6c8', orcEye: '#ff4a2a', ogreEye: '#ffd040', hair: '#2a1c14', nail: '#e8dcc0',
  rune: '#c060ff', runeBright: '#e0a0ff', flame: '#8a30e0', flameTip: '#e0a0ff',
} as const;

/** Орк: зелёная кожа, тяжёлая челюсть с клыками, острые уши, гребень волос, обмотки на ногах. */
const ORC: Partial<Record<Stage, Painter>> = {
  legs: (c, r) => {
    blob(c, r.hips, M.orc, 4);
    for (const l of r.legs) {
      const skin = l.far ? dim(M.orc) : M.orc;
      tube(c, l.upper, skin); tube(c, l.lower, skin);
      rect(c, M.leather[3], l.lower.x, l.lower.y, l.lower.w, 1);   // обмотка под коленом
      blob(c, l.foot, l.far ? dim(M.leather) : M.leather, 4);
    }
  },
  torso: (c, { torso: t, view }) => {
    blob(c, { ...t, h: t.h + 1 }, M.orc, 4);
    const mid = t.x + t.w / 2;
    if (view === 'side') { blob(c, { x: t.x - 1, y: t.y + 3, w: 5, h: 5 }, M.orc, 2); return; }   // живот вперёд
    if (view === 'back') {
      rect(c, M.orc[3], mid - 1, t.y + 1, 1, t.h - 1);
      px(c, M.orc[3], t.x + 2, t.y + 2); px(c, M.orc[3], t.x + t.w - 3, t.y + 2);   // лопатки
      return;
    }
    // грудь и пресс
    rect(c, M.orc[3], t.x + 2, t.y + 3, t.w / 2 - 3, 1); rect(c, M.orc[3], mid + 1, t.y + 3, t.w / 2 - 3, 1);
    px(c, M.orc[3], mid - 1, t.y + 5); px(c, M.orc[3], mid, t.y + 5);
  },
  arms: (c, r) => {
    for (const a of r.arms) {
      blob(c, { x: a.upper.x, y: a.upper.y - 1, w: a.upper.w, h: a.upper.h + 1 }, M.orc, 2.5);   // круглое плечо
      tube(c, a.lower, M.orc);
      rect(c, M.leather[2], a.lower.x, a.lower.y + a.lower.h - 1, a.lower.w, 1);   // наруч
    }
  },
  head: (c, { head: h, view, blink, turn }) => {
    const { x, y, w } = h, eye = blink ? M.orc[3] : H.orcEye;
    if (view === 'side') {
      blob(c, { x: x + 1, y: y - 1, w: w - 1, h: 7 }, M.orc, 2.5);                // затылок и макушка
      blob(c, { x: x - 1, y: y + 3, w: 6, h: 4 }, M.orc, 3);                      // тяжёлая челюсть вперёд
      px(c, M.orc[2], x + w - 1, y + 2); px(c, M.orc[3], x + w, y + 1);           // острое ухо назад
      rect(c, M.orc[4], x, y + 2, 3, 1); px(c, eye, x + 1, y + 3);               // надбровье и глаз
      rect(c, C.hollow, x - 1, y + 5, 3, 1); px(c, H.tusk, x, y + 4);             // рот и клык
      rect(c, H.hair, x + 2, y - 2, 4, 2);                                        // гребень
      return;
    }
    for (const [ex, s] of [[x - 1, -1], [x + w, 1]] as const) { px(c, M.orc[2], ex, y + 3); px(c, M.orc[3], ex + s, y + 2); }   // уши
    blob(c, { x: x - 1, y: y + 3, w: w + 2, h: 4 }, M.orc, 3);   // челюсть шире лба
    blob(c, { x, y: y - 1, w, h: 6 }, M.orc, 2.5);
    if (view === 'back') { rect(c, H.hair, x + 3, y - 2, 2, 5); return; }
    const f = x + turn;
    rect(c, M.orc[4], f + 1, y + 2, w - 2, 1);                      // тяжёлое надбровье
    px(c, eye, f + 2, y + 3); px(c, eye, f + 5, y + 3);
    px(c, M.orc[3], f + 3, y + 4); px(c, M.orc[3], f + 4, y + 4);   // широкий нос
    rect(c, C.hollow, f + 2, y + 5, 4, 1);
    for (const tx of [f + 1, f + 6]) { px(c, H.tusk, tx, y + 5); px(c, H.tusk, tx, y + 4); }   // клыки из нижней челюсти
    rect(c, H.hair, f + 3, y - 2, 2, 2);
  },
  farHand: (c, r) => { if (r.gripFar) { blob(c, r.grip, dim(M.orc), 4); rect(c, M.orc[4], r.grip.x + r.grip.w, r.grip.y, r.torso.x - r.grip.x - r.grip.w, 1); } },
  hands: (c, r) => { for (const a of r.arms) blob(c, a.hand, M.orc, 4); },
};

/** Огр: горбатый великан, голова низко между плечами, пузо, нижняя челюсть с клыками, наручи. */
const OGRE: Partial<Record<Stage, Painter>> = {
  legs: (c, r) => {
    blob(c, r.hips, M.ogre, 4);
    const side = r.view === 'side';
    for (const l of r.legs) {
      const skin = l.far ? dim(M.ogre) : M.ogre;
      tube(c, l.upper, skin); tube(c, { ...l.lower, h: l.lower.h + 1 }, skin);
      const f = l.foot;
      blob(c, { x: f.x - (side ? 1 : 0), y: f.y - 1, w: f.w + (side ? 1 : 0), h: f.h + 1 }, skin, 3);
      if (r.view === 'back') continue;
      // ногти на пальцах
      if (side) px(c, H.nail, f.x, f.y + f.h - 2);
      else { px(c, H.nail, f.x + 1, f.y + f.h - 2); px(c, H.nail, f.x + f.w - 2, f.y + f.h - 2); }
    }
  },
  torso: (c, { torso: t, view, turn }) => {
    const mid = t.x + t.w / 2;
    if (view === 'side') {
      blob(c, { x: t.x + 2, y: t.y - 3, w: t.w - 2, h: t.h + 4 }, M.ogre, 3);   // горб: спина выше головы
      blob(c, { x: t.x - 3, y: t.y + 3, w: t.w - 2, h: t.h - 1 }, M.belly, 2);  // пузо вперёд
      px(c, M.belly[4], t.x, t.y + 9);
      return;
    }
    blob(c, { x: t.x, y: t.y - 1, w: t.w, h: t.h + 2 }, M.ogre, 3);
    if (view === 'back') {
      rect(c, M.ogre[3], mid - 1, t.y + 2, 1, t.h - 3);   // хребет
      for (const [dx, dy] of [[-5, 3], [4, 3], [-3, 6], [2, 7], [-6, 8]] as const) px(c, M.ogre[4], mid + dx, t.y + dy);   // клочья шерсти
      return;
    }
    blob(c, { x: t.x + 3, y: t.y + 4, w: t.w - 6, h: t.h - 3 }, M.belly, 2);   // пузо
    rect(c, M.ogre[3], t.x + 3, t.y + 3, t.w / 2 - 4, 1); rect(c, M.ogre[3], mid + 1, t.y + 3, t.w / 2 - 4, 1);   // грудь
    px(c, M.belly[4], mid - 1 + turn, t.y + 9);   // пупок
    for (let i = 0; i < 4; i++) px(c, M.ogre[4], t.x + 4 + i, t.y + 6 + i);   // старый шрам
  },
  arms: (c, r) => {
    for (const a of r.arms) {
      blob(c, { x: a.upper.x - 1, y: a.upper.y - 2, w: a.upper.w + 2, h: a.upper.h + 1 }, M.ogre, 2.4);   // могучее плечо
      tube(c, a.lower, M.ogre);
      const by = a.lower.y + a.lower.h - 3;
      tube(c, { x: a.lower.x, y: by, w: a.lower.w, h: 2 }, M.leather); px(c, M.iron[0], a.lower.x + 1, by);   // наруч с заклёпкой
    }
  },
  head: (c, { head: h, view, blink, turn }) => {
    const eye = blink ? M.ogre[3] : H.ogreEye;
    const x = h.x, y = h.y + 3, w = h.w;   // голова сидит низко, между плечами
    if (view === 'side') {
      const sx = x - 2;
      blob(c, { x: sx + 1, y, w: w - 1, h: 7 }, M.ogre, 2.4);
      blob(c, { x: sx - 1, y: y + 4, w: 7, h: 5 }, M.ogre, 3);   // нижняя челюсть вперёд
      blob(c, { x: sx - 1, y: y + 2, w: 3, h: 3 }, M.ogre, 2);    // нос картошкой
      rect(c, M.ogre[4], sx, y + 2, 4, 1); px(c, eye, sx + 2, y + 3);
      rect(c, C.hollow, sx - 1, y + 7, 4, 1); px(c, H.tusk, sx, y + 6); px(c, H.tusk, sx, y + 5);
      px(c, M.ogre[3], sx + w - 2, y + 3); px(c, M.ogre[3], sx + w - 2, y + 4);   // ухо
      return;
    }
    for (const ex of [x - 1, x + w]) { px(c, M.ogre[3], ex, y + 3); px(c, M.ogre[3], ex, y + 4); }   // уши
    blob(c, { x: x - 1, y: y + 4, w: w + 2, h: 5 }, M.ogre, 3);   // челюсть шире лба
    blob(c, { x, y, w, h: 7 }, M.ogre, 2.4);
    if (view === 'back') { for (const dx of [3, 5, 7]) px(c, H.hair, x + dx, y + 1); rect(c, M.ogre[3], x + 1, y + 7, w - 2, 1); return; }
    const f = x + turn;
    rect(c, M.ogre[4], f + 1, y + 3, w - 2, 1);   // надбровье
    px(c, eye, f + 2, y + 4); px(c, eye, f + w - 3, y + 4);
    blob(c, { x: f + 3, y: y + 4, w: 4, h: 3 }, M.ogre, 2);   // нос
    rect(c, C.hollow, f + 1, y + 7, w - 2, 1);
    for (const tx of [f + 2, f + w - 3]) { px(c, H.tusk, tx, y + 6); px(c, H.tusk, tx, y + 7); }
    px(c, H.hair, f + 4, y); px(c, H.hair, f + 6, y + 1);
  },
  farHand: (c, r) => { if (r.gripFar) { blob(c, r.grip, dim(M.ogre), 3); rect(c, M.ogre[4], r.grip.x + r.grip.w, r.grip.y + 1, r.torso.x - r.grip.x - r.grip.w, 2); } },
  hands: (c, r) => { for (const a of r.arms) blob(c, a.hand, M.ogre, 3); },
};

/** Подол мантии Короля: где он у земли (у одной ноги подъём всегда 0). */
function groundOf(r: Rig): number { return Math.max(...r.legs.map((l) => l.foot.y + l.foot.h)); }

/** Рог короны (для левого; правый — зеркально): смещение от основания и двойная ли толщина. */
const KING_HORN: readonly (readonly [number, number, boolean])[] = [[0, 0, true], [1, -1, true], [2, -2, true], [3, -3, false], [3, -4, false], [3, -5, false]];

/** Король Бездны: доспех с руной-оком, наплечники с шипами, капюшон-пустота с горящими глазами, корона из рогов. */
const KING: Partial<Record<Stage, Painter>> = {
  // ног нет — мантия до земли; подол колышется, по нему бежит пламя Бездны
  legs: (c, r) => {
    const h = r.hips, side = r.view === 'side', bottom = groundOf(r);
    const sway = Math.round(Math.sin(r.p * TAU) * 1.5);
    const spread = side ? 3 : 5, trail = side ? 2 : 0;   // сбоку подол отстаёт назад
    const l0 = h.x - spread + sway + trail, r0 = h.x + h.w - 1 + spread + sway + trail;
    cone(c, h.y, bottom, h.x, h.x + h.w - 1, l0, r0, M.robe);
    for (const k of [0.3, 0.55, 0.8]) {   // складки
      for (let y = h.y + 3; y < bottom - 2; y++) {
        const q = (y - h.y) / (bottom - h.y);
        const l = h.x + (l0 - h.x) * q, rr = h.x + h.w - 1 + (r0 - h.x - h.w + 1) * q;
        px(c, M.robe[3], Math.round(l + (rr - l) * k), y);
      }
    }
    for (let x = l0 - 1; x <= r0 + 1; x++) {
      const fh = 2 + Math.round((Math.sin(r.p * TAU * 2 + x * 0.7) + 1) * 1.5);
      rect(c, H.flame, x, bottom - fh, 1, fh); rect(c, H.flameTip, x, bottom - fh, 1, Math.min(2, fh - 2));
    }
  },
  torso: (c, { torso: t, view, p, turn }) => {
    if (view === 'back') { cone(c, t.y - 1, t.y + t.h + 2, t.x + 1, t.x + t.w - 2, t.x - 1, t.x + t.w, M.robe); return; }   // плащ
    blob(c, { x: t.x, y: t.y - 1, w: t.w, h: t.h + 2 }, M.armor, 4);
    tube(c, { x: t.x + 1, y: t.y + t.h - 2, w: t.w - 2, h: 2 }, M.gold);   // пояс
    if (view === 'side') return;
    // руна-око Бездны мерцает
    const rune = Math.sin(p * TAU * 2) > 0 ? H.rune : H.runeBright, cx = t.x + t.w / 2 - 1 + turn, cy = t.y + 5;
    for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]] as const) px(c, rune, cx + dx, cy + dy);
    px(c, '#ffffff', cx, cy);
  },
  arms: (c, r) => {
    for (const a of r.arms) {
      tube(c, a.upper, M.armor); tube(c, a.lower, M.armor);
      rect(c, M.gold[1], a.lower.x, a.lower.y, a.lower.w, 1);   // золотая кайма наруча
      blob(c, { x: a.upper.x - 2, y: a.upper.y - 3, w: a.upper.w + 4, h: 7 }, M.plate, 2.2);   // наплечник
      const sx = a.upper.x + Math.floor(a.upper.w / 2);
      px(c, M.bone[1], sx, a.upper.y - 4); px(c, M.bone[2], sx, a.upper.y - 5); px(c, M.bone[3], sx, a.upper.y - 6);   // шип
    }
  },
  head: (c, { head: h, view, p, turn }) => {
    const { x, y, w } = h, glow = Math.sin(p * TAU * 2) > 0.3 ? '#ffffff' : H.runeBright;
    // рога короны: толстые у обруча, загибаются наружу, к острию тоньше и темнее
    const horn = (hx: number, s: number): void => {
      KING_HORN.forEach(([dx, dy, wide], i) => {
        const tones = M.bone[i < 2 ? 1 : i < 4 ? 2 : 3];
        px(c, tones, hx + dx * s, y - 1 + dy);
        if (wide) px(c, M.bone[i < 2 ? 0 : 2], hx + dx * s - s, y - 1 + dy);
      });
    };
    blob(c, { x: x - 1, y: y - 1, w: w + 2, h: h.h + 2 }, M.robe, 2.2);   // капюшон
    tube(c, { x, y: y - 1, w, h: 2 }, M.gold);                             // обруч
    if (view === 'side') {
      horn(x + 1, -1); horn(x + w - 2, 1);
      blob(c, { x: x - 1, y: y + 3, w: 5, h: 6 }, M.void, 2);
      px(c, glow, x, y + 5);
      return;
    }
    horn(x + 1, -1); horn(x + w - 2, 1);
    px(c, H.rune, x + w / 2 - 1 + turn, y - 1);   // камень в обруче
    if (view === 'back') { rect(c, M.robe[3], x + w / 2 - 1, y + 2, 1, h.h - 2); return; }
    blob(c, { x: x + 2 + turn, y: y + 3, w: w - 4, h: h.h - 3 }, M.void, 2);   // пустота под капюшоном
    px(c, glow, x + 3 + turn, y + 5); px(c, glow, x + w - 4 + turn, y + 5);
  },
  farHand: (c, r) => { if (r.gripFar) { blob(c, r.grip, dim(M.armor), 3); rect(c, M.armor[4], r.grip.x + r.grip.w, r.grip.y + 1, r.torso.x - r.grip.x - r.grip.w, 1); } },
  hands: (c, r) => { for (const a of r.arms) { blob(c, a.hand, M.armor, 3); px(c, M.bone[1], a.hand.x, a.hand.y + a.hand.h - 1); } },
};

interface Body { build: Build; paint: Partial<Record<Stage, Painter>> }
const BODIES = {
  human: { build: HUMAN_BUILD, paint: HUMAN },
  skeleton: { build: HUMAN_BUILD, paint: SKELETON },
  orc: { build: ORC_BUILD, paint: ORC },
  ogre: { build: OGRE_BUILD, paint: OGRE },
  abyssKing: { build: KING_BUILD, paint: KING },
} satisfies Record<string, Body>;
export type BodyId = keyof typeof BODIES;

// ---------------- вещи ----------------
/** Лезвие топора: длина строк сверху вниз — полумесяц. */
const AXE_BLADE = [2, 4, 5, 5, 4, 2] as const;
/** Дубина: длина от кисти вверх, в каких строках шипы; толщина растёт каждые growEvery строк до maxW. */
const CLUB = { length: 24, spikes: [13, 17, 21], growEvery: 5, maxW: 6, slope: 0.3 } as const;
function clubWidth(i: number): number { return Math.min(CLUB.maxW, 2 + Math.floor(Math.max(0, i) / CLUB.growEvery)); }
/** Сфера Короля Бездны: центр выше верха кисти на lift, радиус r. Отсюда же вылетают огненные шары. */
export const ORB = { lift: 7, r: 4 } as const;
/** Длинное древко или клинок, вертикально у кисти (вид спереди/сзади). x — столбец рядом с кистью. */
function uprightColumn(r: Rig): number { return r.gripSide > 0 ? r.grip.x + r.grip.w - 1 : r.grip.x - 1; }

/**
 * Оружие в правой руке: upright — у бока (спереди/сзади), side — в руке сбоку.
 * Сбоку в дальней руке оно рисуется за телом, в ближней — перед ним.
 */
function weaponPaint(upright: Painter, side: Painter): Partial<Record<Stage, Painter>> {
  return {
    behind: (c, r) => { if (!r.weaponAngled) upright(c, r); else if (r.gripFar) side(c, r); },
    held: (c, r) => { if (r.weaponAngled && !r.gripFar) side(c, r); },
  };
}

export const GEAR = {
  shorts: {
    slot: 'legs',
    paint: {
      legwear: (c, { hips: h, view }) => {
        box(c, C.shorts, h); rect(c, C.rope, h.x, h.y, h.w, 1);
        rect(c, C.shortsShade, h.x + h.w - (view === 'side' ? 2 : 3), h.y + 1, view === 'side' ? 2 : 3, h.h - 1);
        rect(c, C.shortsLight, h.x, h.y + 1, 1, h.h - 1);
        if (view !== 'side') {
          rect(c, C.shorts, h.x, h.y + h.h, 4, 1); rect(c, C.shorts, h.x + h.w - 4, h.y + h.h, 4, 1);
          rect(c, C.shortsShade, h.x + Math.floor(h.w / 2) - 1, h.y + 2, 2, h.h - 2);   // шов и тень между ногами
        }
      },
    },
  },
  chainmail: {
    slot: 'body',
    paint: {
      bodywear: (c, { torso: t }) => {
        rect(c, C.mail, t.x, t.y, t.w, t.h + 2);
        for (let y = t.y + 1; y < t.y + t.h + 1; y += 2) for (let x = t.x + ((y - t.y) % 4 === 1 ? 0 : 1); x < t.x + t.w; x += 2) px(c, C.mailDark, x, y);
        rect(c, C.mailLight, t.x, t.y, 1, t.h); rect(c, C.mailLight, t.x + 2, t.y, t.w - 4, 1);
        rect(c, C.mailDark, t.x, t.y + t.h + 1, t.w, 1); rect(c, C.mailDark, t.x + t.w - 1, t.y + 1, 1, t.h);
        rect(c, C.leather, t.x, t.y + t.h - 1, t.w, 1); px(c, C.gold, t.x + Math.floor(t.w / 2) - 1, t.y + t.h - 1);
      },
      sleeves: (c, r) => { for (const a of r.arms) { box(c, C.mail, a.upper); px(c, C.mailLight, a.upper.x, a.upper.y); rect(c, C.mailDark, a.upper.x + 1, a.upper.y + 1, 1, a.upper.h - 1); } },
    },
  },
  purse: {
    slot: 'belt',
    paint: {
      // ремень через грудь и кошель на левом бедре героя
      belt: (c, { view, torso: t, hips: h }) => {
        const side = view === 'side';
        for (let i = 0; i < 7; i++) px(c, C.leather, side ? t.x + 4 - Math.round(i / 3) : view === 'back' ? t.x + t.w - 2 - i : t.x + 1 + i, t.y + i);
        const x = side ? h.x + 3 : view === 'back' ? h.x - 1 : h.x + h.w - 2;
        rect(c, C.leather, x, h.y, 3, 3); rect(c, C.leatherLight, x, h.y, 3, 1); px(c, C.gold, x + 1, h.y + 2);
      },
    },
  },
  stick: {
    slot: 'weapon',
    paint: weaponPaint((c, r) => {
      const x = uprightColumn(r), y = r.grip.y;
      rect(c, C.woodDark, x, y - 9, 2, 17); rect(c, C.wood, x, y - 9, 1, 17);
      px(c, C.woodLight, x, y - 5); px(c, C.woodLight, x, y + 3);
    }, (c, { grip: g }) => {
      for (let y = g.y - 9; y <= g.y + 7; y++) { const x = g.x - Math.round((g.y - y) * 0.25); px(c, C.wood, x, y); px(c, C.woodDark, x + 1, y); }
      px(c, C.woodLight, g.x - 1, g.y - 4);
    }),
  },
  sword: {
    slot: 'weapon',
    paint: weaponPaint((c, r) => {
      const x = uprightColumn(r), y = r.grip.y;
      rect(c, C.steel, x, y - 10, 2, 9); rect(c, C.steelLight, x, y - 10, 1, 8); px(c, C.steel, x, y - 11);
      rect(c, C.gold, x - 2, y - 1, 6, 1); rect(c, C.leather, x, y, 2, 2); px(c, C.gold, x, y + 2);
    }, (c, { grip: g }) => {
      for (let i = 2; i <= 10; i++) { const x = g.x - Math.round(i * 0.45); px(c, C.steel, x, g.y - i); if (i < 9) px(c, C.steelLight, x + 1, g.y - i); }
      rect(c, C.gold, g.x - 1, g.y - 1, 4, 1); px(c, C.gold, g.x + 1, g.y + 2);
    }),
  },
  bow: {
    slot: 'weapon',
    // рукоять в кисти, плечи лука изгибаются наружу, тетива — прямая
    paint: weaponPaint((c, r) => {
      const inward = r.gripSide > 0 ? -1 : 1;
      const mid = uprightColumn(r) + inward, y = r.grip.y;
      for (let t = -9; t <= 8; t++) px(c, Math.abs(t) < 2 ? C.leather : C.wood, mid - inward * Math.round(3 * (t / 9) ** 2), y + t);
      rect(c, C.string, mid - inward * 3, y - 7, 1, 14);
    }, (c, { grip: g }) => {
      for (let t = -8; t <= 8; t++) px(c, Math.abs(t) < 2 ? C.leather : C.wood, g.x - 1 + Math.round(3 * (t / 8) ** 2), g.y + t);
      rect(c, C.string, g.x + 2, g.y - 7, 1, 15);
    }),
  },
  quiver: {
    slot: 'belt',
    paint: {
      // спереди из-за правого плеча торчат стрелы, сзади и сбоку виден сам колчан
      behind: (c, { view, torso: t }) => {
        if (view !== 'front') return;
        for (const [x, top] of [[t.x + t.w, t.y - 5], [t.x + t.w + 1, t.y - 4]] as const) { rect(c, C.wood, x, top + 1, 1, 5); px(c, C.fletch, x, top); }
      },
      belt: (c, { view, torso: t }) => {
        if (view === 'front') { for (let i = 0; i < 7; i++) px(c, C.leather, t.x + t.w - 2 - i, t.y + i); return; }
        const qx = view === 'back' ? t.x + t.w - 3 : t.x + t.w - 1;
        for (const [x, top] of [[qx + 1, t.y - 5], [qx + 2, t.y - 4]] as const) { rect(c, C.wood, x, top + 1, 1, 4); px(c, C.fletch, x, top); }
        rect(c, C.leather, qx, t.y - 1, 3, 8); rect(c, C.leatherLight, qx, t.y - 1, 1, 8); rect(c, C.gold, qx, t.y + 1, 3, 1);
      },
    },
  },
  helm: {
    slot: 'head',
    paint: {
      // ржавый железный шлем: круглый купол с гребнем, обод над глазами, наносник спереди, назатыльник сбоку
      headwear: (c, { head: h, view }) => {
        rect(c, C.iron, h.x + 1, h.y - 4, h.w - 2, 1); rect(c, C.iron, h.x - 1, h.y - 3, h.w + 2, 3);
        rect(c, C.ironLight, h.x, h.y - 3, 2, 2); rect(c, C.ironDark, h.x + h.w - 1, h.y - 3, 2, 3);
        rect(c, C.ironLight, h.x + Math.floor(h.w / 2) - 1, h.y - 4, 1, 4);
        rect(c, C.ironDark, h.x - 1, h.y, h.w + 2, 1);
        if (view === 'front') rect(c, C.iron, h.x + Math.floor(h.w / 2) - 1, h.y + 1, 2, 2);
        if (view === 'side') rect(c, C.iron, h.x + h.w - 2, h.y + 1, 3, 3);
        if (view === 'back') rect(c, C.iron, h.x - 1, h.y + 1, h.w + 2, 2);
        px(c, C.rust, h.x + 2, h.y - 2); px(c, C.rust, h.x + h.w - 3, h.y - 1);
      },
    },
  },
  // ---------------- вещи орды ----------------
  hide: {
    slot: 'body',
    paint: {
      // меховой воротник и ремень через грудь
      bodywear: (c, { torso: t, view }) => {
        if (view === 'side') tube(c, { x: t.x + 3, y: t.y, w: 2, h: t.h }, M.leather);
        else for (let i = 0; i < t.h; i++) px(c, M.leather[i % 3 ? 2 : 3], view === 'back' ? t.x + t.w - 2 - i : t.x + 1 + i, t.y + i);
        blob(c, { x: t.x + 1, y: t.y - 2, w: t.w - 2, h: 4 }, M.fur, 2);
        for (let x = t.x + 2; x < t.x + t.w - 2; x += 2) px(c, M.fur[3], x, t.y + 1);
      },
      // железный наплечник с шипом — на плече без оружия
      sleeves: (c, r) => {
        const a = r.arms[r.arms.length > 1 && r.gripSide < 0 ? 1 : 0]!.upper;
        blob(c, { x: a.x - 1, y: a.y - 2, w: a.w + 2, h: 4 }, M.iron, 2);
        px(c, C.steelLight, a.x + 1, a.y - 3); px(c, C.rust, a.x + a.w - 1, a.y);
      },
    },
  },
  loincloth: {
    slot: 'legs',
    paint: {
      // повязка на бёдрах, кожаный пояс с костяной пряжкой и передник, который качается при шаге
      legwear: (c, { hips: h, view, p }) => {
        blob(c, { ...h, h: h.h + 1 }, M.cloth, 4);
        rect(c, M.leather[3], h.x, h.y, h.w, 1);
        const fw = Math.max(3, Math.round(h.w / 3)), fl = Math.ceil(h.h / 2) + 1, sway = Math.round(Math.sin(p * TAU) * 0.6);
        const fx = view === 'side' ? h.x - 1 + sway : h.x + Math.floor((h.w - fw) / 2) + sway;
        tube(c, { x: fx, y: h.y + h.h, w: fw, h: fl }, M.cloth);
        if (view !== 'back') px(c, C.bone, view === 'side' ? h.x + 1 : h.x + Math.floor(h.w / 2) - 1, h.y);
      },
    },
  },
  axe: {
    slot: 'weapon',
    // топор: рукоять, полукруглое лезвие наружу, светлая заточенная кромка
    paint: weaponPaint((c, r) => {
      const x = uprightColumn(r), y = r.grip.y, out = r.gripSide < 0 ? -1 : 1;
      rect(c, C.woodDark, x, y - 11, 2, 17); rect(c, C.wood, x, y - 11, 1, 17); px(c, C.woodLight, x, y - 5);
      AXE_BLADE.forEach((len, i) => {
        const bx = out < 0 ? x - len : x + 2;
        tube(c, { x: bx, y: y - 11 + i, w: len, h: 1 }, M.iron);
        px(c, C.steelLight, out < 0 ? bx : bx + len - 1, y - 11 + i);
      });
    }, (c, { grip: g }) => {
      const at = (y: number): number => g.x - Math.round((g.y - y) * 0.25);
      for (let y = g.y - 11; y <= g.y + 5; y++) { px(c, C.wood, at(y), y); px(c, C.woodDark, at(y) + 1, y); }
      AXE_BLADE.forEach((len, i) => {
        const y = g.y - 11 + i, bx = at(y) - len;
        tube(c, { x: bx, y, w: len, h: 1 }, M.iron); px(c, C.steelLight, bx, y);
      });
    }),
  },
  club: {
    slot: 'weapon',
    // дубина огра: к верху толще (растёт наружу, от тела), в навершие вбиты железные шипы
    paint: weaponPaint((c, r) => {
      const x = uprightColumn(r), y = r.grip.y + r.grip.h, out = r.gripSide < 0 ? -1 : 1;
      for (let i = 0; i < CLUB.length; i++) {
        const w = clubWidth(i), x0 = out < 0 ? x + 2 - w : x;
        tube(c, { x: x0, y: y - i, w, h: 1 }, M.wood);
        if ((CLUB.spikes as readonly number[]).includes(i)) px(c, C.ironLight, out < 0 ? x0 - 1 : x0 + w, y - i);
      }
      px(c, C.ironLight, x + (out < 0 ? 0 : 1), y - CLUB.length);
    }, (c, { grip: g }) => {
      for (let i = -3; i < CLUB.length; i++) {
        const w = clubWidth(i), x0 = g.x - Math.round(i * CLUB.slope) - Math.floor(w / 2);
        tube(c, { x: x0, y: g.y - i, w, h: 1 }, M.wood);
        if ((CLUB.spikes as readonly number[]).includes(i)) px(c, C.ironLight, x0 - 1, g.y - i);
      }
    }),
  },
  orb: {
    slot: 'weapon',
    // сфера Бездны парит над ладонью: от кисти к ней тянется нить силы, вокруг кружат искры
    paint: {
      held: (c, { grip: g, p }) => {
        const cx = g.x + Math.floor(g.w / 2), cy = g.y - ORB.lift + Math.round(Math.sin(p * TAU));
        for (let y = cy + ORB.r + 1; y < g.y; y++) if ((y + Math.floor(p * 12)) % 3) px(c, H.rune, cx, y);
        blob(c, { x: cx - ORB.r, y: cy - ORB.r, w: ORB.r * 2 + 1, h: ORB.r * 2 + 1 }, M.orb, 2);
        for (let i = 0; i < 3; i++) {
          const a = p * TAU + (i * TAU) / 3;
          px(c, H.runeBright, cx + Math.round(Math.cos(a) * (ORB.r + 2)), cy + Math.round(Math.sin(a) * (ORB.r + 2) * 0.6));
        }
      },
    },
  },
} satisfies Record<string, GearVisual>;

export type GearId = keyof typeof GEAR;
export type Outfit = Partial<Record<GearSlot, GearId>>;
/** Стартовая одежда: шорты и палка. Это обычные вещи — их заменяет то, что надето в тот же слот. */
export const STARTER_OUTFIT: Outfit = { legs: 'shorts', weapon: 'stick' };

export function heroSheetKey(outfit: Outfit, body: BodyId = 'human'): string { return `${body}:${GEAR_SLOTS.map((s) => outfit[s] ?? '-').join('.')}`; }
export function heroAnimKey(sheet: string, kind: HeroAnimKind, dir: PlayerDirection): string { return `${sheet}-${kind}-${dir}`; }

// ---------------- сборка листа ----------------
function paintFrame(c: Ctx, outfit: Outfit, body: BodyId, dir: PlayerDirection, kind: HeroAnimKind, p: number): void {
  const { build, paint: bodyPaint } = BODIES[body];
  const rig = buildRig(build, dir, kind, p);
  const worn: GearVisual[] = GEAR_SLOTS.flatMap((s) => { const id = outfit[s]; return id ? [GEAR[id]] : []; });
  const paint = (): void => {
    for (const stage of STAGES) {
      bodyPaint[stage]?.(c, rig);
      for (const g of worn) g.paint[stage]?.(c, rig);
    }
  };
  // вправо (и вправо по диагонали) — зеркало левой стороны
  if (dir.endsWith('right')) { c.save(); c.translate(build.frame, 0); c.scale(-1, 1); paint(); c.restore(); } else paint();
}

/** Сколько пикселей кадров рисовать за одно задание: строка героя целиком, у крупных тел — частями. */
const PIXELS_PER_JOB = S * S * COLUMNS;

/**
 * Лист кадров для набора одежды: ходьба и покой в 8 сторон. По заданию на строку (направление) или её часть:
 * рисование + скругление + светотень + контур; последнее задание регистрирует кадры и анимации.
 * Пусто, если лист уже готов. Экран загрузки выполняет задания понемногу — без рывков.
 */
export function heroSheetJobs(scene: Phaser.Scene, outfit: Outfit, body: BodyId = 'human'): (() => void)[] {
  const key = heroSheetKey(outfit, body);
  if (scene.textures.exists(key)) return [];
  const { build } = BODIES[body];
  const F = build.frame;
  const w = F * COLUMNS, h = F * PLAYER_DIRECTIONS.length;
  const perJob = Math.max(1, Math.floor(PIXELS_PER_JOB / (F * F)));
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const jobs: (() => void)[] = [() => {
    tex = scene.textures.createCanvas(key, w, h);
    if (tex) tex.getContext().imageSmoothingEnabled = false;
  }];
  PLAYER_DIRECTIONS.forEach((dir, row) => {
    for (let col0 = 0; col0 < COLUMNS; col0 += perJob) jobs.push(() => {
      if (!tex) return;
      const c = tex.getContext();
      const col1 = Math.min(COLUMNS, col0 + perJob);
      for (let col = col0; col < col1; col++) {
        const walk = col < HERO_SHEET.walkFrames;
        const p = walk ? col / HERO_SHEET.walkFrames : (col - HERO_SHEET.walkFrames) / HERO_SHEET.idleFrames;
        c.save(); c.translate(col * F, row * F);
        c.beginPath(); c.rect(0, 0, F, F); c.clip();   // рисунок не залезает в соседний кадр
        paintFrame(c, outfit, body, dir, walk ? 'walk' : 'idle', p);
        c.restore();
      }
      const x0 = col0 * F, cw = (col1 - col0) * F;
      roundCorners(c, cw, F, F, F, x0, row * F);
      addVolume(c, cw, F, F, F, x0, row * F);
      addOutline(c, cw, F, F, F, x0, row * F);
    });
  });
  jobs.push(() => {
    if (!tex) return;
    tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    PLAYER_DIRECTIONS.forEach((dir, row) => {
      for (let col = 0; col < COLUMNS; col++) tex!.add(String(row * COLUMNS + col), 0, col * F, row * F, F, F);
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

/** Точка опоры (под ступнями) на кадре тела — origin спрайта. */
export function heroOrigin(body: BodyId = 'human'): { x: number; y: number } {
  const { build } = BODIES[body];
  return { x: 0.5, y: build.ground / build.frame };
}

/** Где кисть с оружием (середина её верхнего края) относительно точки опоры — в покое, при взгляде в сторону dir. */
export function gripOffset(body: BodyId, dir: PlayerDirection): { x: number; y: number } {
  const { build } = BODIES[body];
  const g = buildRig(build, dir, 'idle', 0).grip;
  const x = g.x + Math.floor(g.w / 2) + 0.5 - build.frame / 2;
  return { x: dir.endsWith('right') ? -x : x, y: g.y - build.ground };
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
  if (current === key) return;
  const keepPhase = !!current && current.includes('-walk-') && key.includes('-walk-');
  const progress = keepPhase ? sprite.anims.getProgress() : 0;
  sprite.play(key);
  if (keepPhase) sprite.anims.setProgress(progress);
}
