import Phaser from 'phaser';
import { GAME } from '../configs/game';
import { ball, box, firePaint, readableCanvas, rod, VIEW_DIR, type Anchor, type Model } from './CastleModels';
import { renderModel, type Axes, type Paint, type Part, type Surface, type Vec } from './Rig3D';
import type { Ramp } from './Volume';

/*
 * Эффекты магии и особых ударов — 3D-модели (Rig3D.ts), как огненный шар: огонь, молнии и призраки светятся сами
 * (по краю силуэта темнее, к середине ярче — объём видно по полосам), лёд и кристаллы — со светотенью.
 * Тёмного контура нет: это свет. Каждый эффект — лист кадров; one-shot (repeat 0) играется один раз и исчезает.
 * Модель строится вокруг точки опоры (anchor), 1 единица = 1 пиксель игры; рисуется детальнее (res).
 */

const TAU = Math.PI * 2;
/** Детальность эффектов: как у фигур (эффекты крупные и рядом с героем). */
const RES = GAME.resolution * 1.2;

/** Светится сам: по краю силуэта — edge, дальше — mid, середина — core. */
function glowPaint(edge: string, mid: string, core: string): (s: Surface) => string {
  return (s) => {
    const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];
    return d < 0.45 ? edge : d < 0.75 ? mid : core;
  };
}
/** То же при взгляде сбоку (эффекты, которые поворачиваются по направлению удара: молния, выпад). */
function sideGlow(edge: string, mid: string, core: string): (s: Surface) => string {
  return (s) => (s.n[2] < 0.45 ? edge : s.n[2] < 0.8 ? mid : core);
}
const BOLT = sideGlow('#2a78d8', '#8ad8ff', '#ffffff');
const SPIRIT = glowPaint('#4ab8c8', '#b4f4ff', '#ffffff');
const SHOCK = glowPaint('#3a6ad8', '#8ad0ff', '#f0fbff');
const ICE: Ramp = ['#ffffff', '#e4f6ff', '#b4e0f8', '#7ab4dc', '#4a7aa8'];
const EMERALD = glowPaint('#2a9a4a', '#8ae890', '#e8ffe0');
/** Дуга удара — светлая сталь со светотенью (спрайт окрашивают в цвет оружия); огонь сбоку; кровь; тьма посоха. */
const BLADE_ARC: Ramp = ['#ffffff', '#eef6ff', '#c8e2ff', '#94bce8', '#5a84c0'];
const FIRE_SIDE = sideGlow('#d8401a', '#ff9a2a', '#fff4c8');
const BLOOD: Ramp = ['#ffd8d8', '#ff6a78', '#d01e30', '#8a0a1c', '#44040e'];
const DARK_FIRE = glowPaint('#0c0612', '#3a1660', '#a060e0');
const DARK_CORE: Ramp = ['#6a3a9a', '#3a1a5a', '#22102e', '#140818', '#08040a'];
const GOLD_GLOW = sideGlow('#c08a2a', '#ffd870', '#fffbe0');

/** Оси бруска, повёрнутого на угол a вокруг вертикали и наклонённого наружу на tiltOut. */
function standing(a: number, tiltOut: number): Axes {
  const out: Vec = [Math.cos(a), 0, Math.sin(a)], up: Vec = [out[0] * Math.sin(tiltOut), Math.cos(tiltOut), out[2] * Math.sin(tiltOut)];
  const side: Vec = [-out[2], 0, out[0]];
  const fwd: Vec = [side[1] * up[2] - side[2] * up[1], side[2] * up[0] - side[0] * up[2], side[0] * up[1] - side[1] * up[0]];
  return [side, up, fwd];
}
/** Кристалл (лёд, изумруд): четырёхгранный брусок, сужается к острию. */
function shard(c: Vec, half: Vec, axes: Axes, paint: Paint): Part {
  return box(c, half, (s) => (s.y > 0.3 && Math.abs(s.x) > (1 - s.y) / 0.7 ? null : typeof paint === 'function' ? paint(s) : paint), axes);
}

// ---------------- эффекты ----------------
/**
 * Свечение позади эффекта — запекается в кадры, как сияние огненного шара: цвет (r, g, b), радиус и подъём над точкой
 * опоры (пиксели игры), сплющенность по высоте (кольцо на полу — 0,62, шар — 1), сила. У one-shot вспыхивает и гаснет
 * вместе с эффектом, у повторяющихся — ровное.
 */
interface FxGlow { rgb: string; r: number; lift?: number; flat: number; alpha: number }
/** Описание листа: размер кадра, точка опоры, кадров, скорость, повтор, вид сбоку (pitch 0 — для поворачиваемых). */
interface FxSheet { w: number; h: number; anchor: Anchor; frames: number; rate: number; repeat: number; side?: boolean; glow?: FxGlow; build: (t: number) => Model }

/** Язык пламени-капля: одно вытянутое тело (без «ступенек») и острый кончик, чуть отклонённый (sway). */
function flameDrop(parts: Part[], x: number, z: number, h: number, w: number, sway: number, paint: Paint = firePaint): void {
  parts.push(ball([x, h * 0.36, z], [w, h * 0.4, w], paint), ball([x + sway, h * 0.78, z], [w * 0.5, h * 0.26, w * 0.5], paint));
}

/** Огненное кольцо (взрыв метеора и тьмы): языки пламени по кругу вырастают и опадают; радиус — R. */
function fireRing(R: number, paint: Paint = firePaint): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], n = Math.round(R * 0.65), grow = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.55) / 0.45);
    if (grow < 0.05) return { parts };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = R * (0.75 + 0.25 * t), h = 14 * grow * (0.75 + 0.35 * Math.abs(Math.sin(i * 2.3)));
      flameDrop(parts, Math.cos(a) * r, Math.sin(a) * r, h, 2.6 * grow + 0.8, Math.sin(t * TAU + i) * 1.2, paint);
    }
    // в первые кадры — вспышка в середине: огненный шар лопается
    const flash = 1 - t / 0.35;
    if (flash > 0) parts.push(ball([0, 5 * flash, 0], [R * 0.4 * flash, R * 0.32 * flash, R * 0.4 * flash], paint));
    return { parts };
  };
}

/** Ледяная волна: кольцо кристаллов прорастает из земли наружу и тает; в середине — колючий куст льда. */
function frostRing(R: number): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], n = Math.round(R * 0.38), grow = Math.min(1, t * 2.2) * (1 - Math.max(0, t - 0.6) / 0.4);
    if (grow < 0.05) return { parts };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2, r = R * (0.55 + 0.45 * Math.min(1, t * 1.8)), h = (7 + 5 * ((i * 7) % 3) / 2) * grow;
      parts.push(shard([Math.cos(a) * r, h / 2, Math.sin(a) * r], [1.8 * grow + 0.4, h / 2, 1.4], standing(a, 0.25), ICE));
      parts.push(shard([Math.cos(a + 0.3) * r * 0.85, h * 0.3, Math.sin(a + 0.3) * r * 0.85], [1.1 * grow + 0.3, h * 0.3, 0.9], standing(a + 0.3, 0.5), ICE));
    }
    for (let i = 0; i < 3; i++) parts.push(shard([0, 3.6 * grow, 0], [1.4 * grow, 4.2 * grow, 1.1], standing(i * 2.1, 0.3), ICE));
    // светящийся иней по земле
    parts.push(ball([0, 0, 0], [R * grow, 0.3, R * grow], (q) => (Math.hypot(q.x, q.z) > 0.92 ? '#d8f4ff' : null)));
    return { parts };
  };
}

/** Лечение: изумрудные кристаллики по спирали поднимаются вокруг героя и тают. */
function healSpiral(t: number): Model {
  const parts: Part[] = [], fade = 1 - Math.max(0, t - 0.6) / 0.4;
  for (let i = 0; i < 7; i++) {
    const a = t * TAU * 1.2 + (i / 7) * TAU, y = 2 + t * 16 + i * 1.2, s = 1.6 * fade;
    if (s > 0.1) parts.push(shard([Math.cos(a) * 7, y, Math.sin(a) * 7], [s * 1.3, s * 2.2, s], standing(a, 0), EMERALD));
  }
  return { parts };
}

/** Молния (жезл искр): ломаная из светящихся звеньев вдоль +x длиной L; узлы — искры-шарики. Каждый кадр — свой излом. */
function boltLine(L: number): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], n = 9, f = Math.round(t * 8);
    const pts: Vec[] = Array.from({ length: n + 1 }, (_, i): Vec => [(i / n) * L, i === 0 || i === n ? 0 : Math.sin(i * 2.7 + f * 1.9) * 3.4, 0]);
    for (let i = 0; i < n; i++) parts.push(rod(pts[i]!, pts[i + 1]!, 1.3, BOLT));
    for (let i = 2; i < n; i += 3) parts.push(ball(pts[i]!, [1.9, 1.9, 1.9], BOLT));
    return { parts };
  };
}

/** Ударная волна (молот грома): по земле расходятся голубые зубцы-искры, над серединой — вспышка. */
function shockRing(R: number): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], n = 12, r = R * (0.3 + 0.7 * t), k = 1 - t;
    if (k < 0.05) return { parts };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      parts.push(shard([Math.cos(a) * r, 2.5 * k, Math.sin(a) * r], [0.9 * k + 0.3, 3 * k + 0.5, 0.7], standing(a, 0.8), SHOCK));
    }
    if (t < 0.4) parts.push(ball([0, 3, 0], [4 * (1 - t * 2), 3 * (1 - t * 2), 4 * (1 - t * 2)], SHOCK));
    return { parts };
  };
}

/** Круг топора: по кругу из земли выбиваются каменные обломки (со светотенью) и оседают, в середине — облачко пыли. */
const STONE: Ramp = ['#c8c0b0', '#a29a8a', '#7e7768', '#5c564a', '#3c382e'];
const DUST = glowPaint('#7a7060', '#a89a84', '#c8bca4');
function cleaveRing(R: number): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], n = Math.round(R * 0.5), up = Math.sin(t * Math.PI), r = R * (0.5 + 0.5 * t);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.15, s = 2 + ((i * 5) % 3) * 0.5;
      parts.push(box([Math.cos(a) * r, 1 + up * (3 + (i % 3)), Math.sin(a) * r], [s, s * 0.8, s], STONE, standing(a + i, 0.4 + i * 0.1)));
    }
    if (t < 0.7) parts.push(ball([0, 1.5, 0], [R * 0.45 * (0.5 + t), 2.4 * (1 - t), R * 0.45 * (0.5 + t)], DUST));
    return { parts };
  };
}

/** Выпад глефы: вытянутый светящийся наконечник вдоль +x — вспыхивает и гаснет. */
function thrustFlash(L: number): (t: number) => Model {
  return (t) => {
    const k = Math.sin(t * Math.PI);
    return { parts: [ball([L * 0.55, 0, 0], [L * 0.5 * (0.6 + 0.4 * k), 1.8 * k + 0.3, 1.8 * k + 0.3], GOLD_GLOW)] };
  };
}

/** Шар грозы: сфера разрядов, вокруг неё вращаются три дуги-молнии. */
function stormOrb(t: number): Model {
  const parts: Part[] = [ball([0, 0, 0], [4, 4, 4], SHOCK)];
  for (let k = 0; k < 3; k++) {
    const a0 = t * TAU + (k * TAU) / 3, tilt = k * 1.1;
    for (let i = 0; i < 4; i++) {
      const a = a0 + i * 0.35, b = a + 0.35, p = (x: number): Vec => [Math.cos(x) * 6, Math.sin(x) * Math.sin(tilt) * 6, Math.sin(x) * Math.cos(tilt) * 6];
      parts.push(rod(p(a), p(b), 0.55, BOLT));
    }
  }
  return { parts };
}

/** Ледяной вихрь: столб осколков льда закручивается спиралью вверх, кольца шире к верху. */
function vortex(t: number): Model {
  const parts: Part[] = [];
  for (let i = 0; i < 14; i++) {
    const y = i * 1.5, a = t * TAU * 2 + i * 0.9, r = 2.5 + y * 0.45;
    parts.push(shard([Math.cos(a) * r, y, Math.sin(a) * r], [0.8, 1.6, 0.6], standing(a + Math.PI / 2, 1.1), ICE));
  }
  parts.push(ball([0, 1, 0], [3, 1, 3], glowPaint('#7ab4dc', '#d8f4ff', '#ffffff')));
  return { parts };
}

/** Призрачный клинок: светящийся меч остриём вверх (на экране его поворачивают по кругу). */
function spiritBlade(): Model {
  return {
    parts: [
      box([0, 6, 0], [0.5, 6, 1.3], (s) => (s.y > 0.75 && Math.abs(s.z) > (1 - s.y) * 4 ? null : SPIRIT(s))),
      box([0, -0.4, 0], [0.7, 0.5, 3], SPIRIT), rod([0, -0.8, 0], [0, -3.6, 0], 0.6, SPIRIT),
    ],
  };
}

/**
 * Радиусы кругов (пиксели игры, по полу): кольца огня и льда вокруг героя — между героем и краем помещается ещё один
 * герой; круг топора — у линии удара. По ним же считается урон (Player.ts).
 */
export const SPELL_RADIUS = { fireRing: 40, frostRing: 40, cleave: 30, bloodRing: 44, darkBlast: 20 } as const;

// ---------------- волны ударов (вид сбоку, поворачиваются по направлению удара) ----------------
/**
 * Дуга удара на кадре: от точки вращения (anchor) — внешний радиус r и полудуга half (пиксели игры, радианы).
 * MobArt.fitSlash растягивает дугу по дальности удара. Кадр выше дуги — она видна целиком.
 */
export const SLASH_ARC = { r: 26, half: 1.2, frames: 5 } as const;
/** Точка дуги (вид сбоку: x — вперёд по удару, y — вверх): угол a от направления удара, радиус r. */
function arcPoint(a: number, r: number): Vec { return [Math.cos(a) * r, -Math.sin(a) * r, 0]; }
/** Оси, у которых y смотрит от точки вращения наружу под углом a: язык пламени и кристалл — остриём наружу. */
function outwardAxes(a: number): Axes {
  const out: Vec = [Math.cos(a), -Math.sin(a), 0];
  return [[-out[1], out[0], 0], out, [0, 0, 1]];
}
/** Взмах в кадре t: дуга раскрывается сверху вниз за первые кадры (span — до какого угла), потом истончается (fade). */
function sweep(t: number): { span: number; fade: number } {
  const f = t * (SLASH_ARC.frames - 1), H = SLASH_ARC.half;
  return { span: -H + 2 * H * Math.min(1, (f + 1) / 3), fade: f >= 3 ? f - 2 : 0 };
}
/** Углы n звеньев дуги, раскрытой до span: середина звена и доля u вдоль всей дуги. */
function arcLinks(span: number, n: number): { a0: number; a1: number; a: number; u: number }[] {
  const H = SLASH_ARC.half;
  return Array.from({ length: n }, (_, i) => {
    const a0 = -H + ((span + H) * i) / n, a1 = -H + ((span + H) * (i + 1)) / n, a = (a0 + a1) / 2;
    return { a0, a1, a, u: (a + H) / (2 * H) };
  });
}

/** Дуга удара (герой и мобы): серповидная полоса стали-света из звеньев — толще посередине, к концам сходит на нет. */
function slashArc(t: number): Model {
  const { span, fade } = sweep(t), outer = SLASH_ARC.r - fade;
  return {
    parts: arcLinks(span, 16).map(({ a0, a1, u }) => {
      const th = Math.max(0.5, (5 - fade * 1.6) * Math.sin(Math.PI * u));
      return rod(arcPoint(a0, outer - th / 2), arcPoint(a1, outer - th / 2), th / 2, BLADE_ARC);
    }),
  };
}

/** Огненная волна (огненная катана): по линии удара вырастают языки пламени остриём наружу и опадают. */
function flameWave(t: number): Model {
  const { span, fade } = sweep(t), k = 1 - fade / 3, parts: Part[] = [];
  for (const { a, u } of arcLinks(span, 9)) {
    const h = (5 + 3 * Math.sin(Math.PI * u)) * k, w = 1.5 * k + 0.4, ax = outwardAxes(a), base = arcPoint(a, SLASH_ARC.r - 7);
    parts.push(ball(add3(base, ax[1], h * 0.4), [w, h * 0.42, w], FIRE_SIDE, ax), ball(add3(base, ax[1], h * 0.85), [w * 0.5, h * 0.25, w * 0.5], FIRE_SIDE, ax));
  }
  return { parts };
}

/** Ледяная волна (ледяной двуручник): по линии удара прорастают кристаллы льда остриём наружу и тают. */
function iceWave(t: number): Model {
  const { span, fade } = sweep(t), k = 1 - fade / 3, parts: Part[] = [];
  arcLinks(span, 8).forEach(({ a, u }, i) => {
    const h = (4 + 4 * Math.sin(Math.PI * u) + (i % 2) * 1.5) * k, ax = outwardAxes(a + (i % 2 ? 0.08 : -0.08));
    parts.push(shard(add3(arcPoint(a, SLASH_ARC.r - 7), ax[1], h / 2), [1.3 * k + 0.3, h / 2, 1], ax, ICE));
  });
  return { parts };
}
/** p + dir * k. */
function add3(p: Vec, dir: Vec, k: number): Vec { return [p[0] + dir[0] * k, p[1] + dir[1] * k, p[2] + dir[2] * k]; }

// ---------------- магия зачарованного класса ----------------
/** Чёрный огненный шар (посох тьмы): тёмное ядро, вокруг кружат языки тьмы с лиловым отсветом. */
function darkBall(t: number): Model {
  const parts: Part[] = [ball([0, 0, 0], [4.6, 4.6, 4.6], DARK_CORE)];
  for (let i = 0; i < 6; i++) {
    const a = t * TAU + (i * TAU) / 6;
    parts.push(ball([Math.cos(a) * 4.6, Math.sin(a * 2) * 1.8, Math.sin(a) * 4.6], [2.1, 2.1, 2.1], DARK_FIRE));
  }
  return { parts };
}

/** Кровавый размах: вокруг героя разлетаются наклонённые наружу осколки крови и капли — до радиуса R, затем тают. */
function bloodBurst(R: number): (t: number) => Model {
  return (t) => {
    const parts: Part[] = [], k = 1 - Math.max(0, t - 0.7) / 0.3, r = 6 + (R - 6) * Math.sin(Math.min(1, t * 1.3) * Math.PI / 2);
    if (k < 0.05) return { parts };
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + t * 0.8, s = (1.3 + (i % 3) * 0.3) * k, y = 3 + Math.sin(t * Math.PI) * (i % 2 ? 4 : 2);
      parts.push(shard([Math.cos(a) * r, y, Math.sin(a) * r], [s * 0.9, s * 2, s * 0.7], standing(a, 1.1), BLOOD));
      parts.push(ball([Math.cos(a + 0.2) * r * 0.82, y * 0.6, Math.sin(a + 0.2) * r * 0.82], [s * 0.6, s * 0.6, s * 0.6], BLOOD));
    }
    return { parts };
  };
}

/** Все эффекты: ключ текстуры и анимации — ключ записи. */
export const SPELL_FX = {
  fx_meteor_blast: { w: 72, h: 58, anchor: { x: 36, y: 34 }, frames: 10, rate: 24, repeat: 0, glow: { rgb: '255, 140, 40', r: 30, flat: 0.62, alpha: 0.6 }, build: fireRing(24) },
  fx_frost_ring: { w: 100, h: 76, anchor: { x: 50, y: 42 }, frames: 10, rate: 22, repeat: 0, glow: { rgb: '150, 220, 255', r: 46, flat: 0.62, alpha: 0.35 }, build: frostRing(SPELL_RADIUS.frostRing) },
  fx_heal: { w: 26, h: 34, anchor: { x: 13, y: 28 }, frames: 10, rate: 18, repeat: 0, glow: { rgb: '90, 230, 120', r: 13, lift: 10, flat: 1, alpha: 0.45 }, build: healSpiral },
  fx_bolt: { w: 76, h: 16, anchor: { x: 2, y: 8 }, frames: 4, rate: 24, repeat: 0, side: true, build: boltLine(70) },
  fx_shock: { w: 52, h: 40, anchor: { x: 26, y: 24 }, frames: 8, rate: 24, repeat: 0, glow: { rgb: '120, 190, 255', r: 24, flat: 0.62, alpha: 0.5 }, build: shockRing(20) },
  fx_cleave: { w: 84, h: 62, anchor: { x: 42, y: 34 }, frames: 8, rate: 22, repeat: 0, build: cleaveRing(SPELL_RADIUS.cleave) },
  fx_thrust: { w: 44, h: 10, anchor: { x: 2, y: 5 }, frames: 5, rate: 30, repeat: 0, side: true, build: thrustFlash(40) },
  fx_storm_orb: { w: 18, h: 18, anchor: { x: 9, y: 9 }, frames: 8, rate: 16, repeat: -1, side: true, glow: { rgb: '140, 210, 255', r: 9, flat: 1, alpha: 0.55 }, build: stormOrb },
  fx_vortex: { w: 34, h: 36, anchor: { x: 17, y: 30 }, frames: 8, rate: 18, repeat: -1, glow: { rgb: '170, 225, 255', r: 15, lift: 9, flat: 1, alpha: 0.35 }, build: vortex },
  fx_spirit_blade: { w: 10, h: 18, anchor: { x: 5, y: 13 }, frames: 1, rate: 1, repeat: 0, side: true, build: spiritBlade },
  // волны ударов: один кадр-размер с дугой (точка вращения слева посередине), поворачиваются и тянутся по дальности
  fx_slash: { w: 48, h: 60, anchor: { x: 6, y: 30 }, frames: SLASH_ARC.frames, rate: 26, repeat: 0, side: true, build: slashArc },
  fx_flame_wave: { w: 48, h: 60, anchor: { x: 6, y: 30 }, frames: SLASH_ARC.frames, rate: 22, repeat: 0, side: true, build: flameWave },
  fx_ice_wave: { w: 48, h: 60, anchor: { x: 6, y: 30 }, frames: SLASH_ARC.frames, rate: 20, repeat: 0, side: true, build: iceWave },
  fx_dark_ball: { w: 28, h: 28, anchor: { x: 14, y: 14 }, frames: 8, rate: 16, repeat: -1, glow: { rgb: '170, 80, 255', r: 13, flat: 1, alpha: 0.6 }, build: darkBall },
  fx_dark_blast: { w: 64, h: 52, anchor: { x: 32, y: 30 }, frames: 10, rate: 22, repeat: 0, glow: { rgb: '150, 60, 230', r: 26, flat: 0.62, alpha: 0.6 }, build: fireRing(SPELL_RADIUS.darkBlast, DARK_FIRE) },
  fx_blood_ring: { w: 110, h: 84, anchor: { x: 55, y: 46 }, frames: 10, rate: 22, repeat: 0, glow: { rgb: '230, 30, 50', r: 48, flat: 0.62, alpha: 0.3 }, build: bloodBurst(SPELL_RADIUS.bloodRing) },
} as const satisfies Record<string, FxSheet>;
export type SpellFxKey = keyof typeof SPELL_FX;

/** Лист эффекта по кадру за задание (экран загрузки); последнее задание регистрирует кадры и анимацию. */
function fxSheetJobs(scene: Phaser.Scene, key: SpellFxKey): (() => void)[] {
  if (scene.textures.exists(key)) return [];
  const S: FxSheet = SPELL_FX[key], W = Math.round(S.w * RES), H = Math.round(S.h * RES);
  let tex: Phaser.Textures.CanvasTexture | null = null;
  const jobs: (() => void)[] = [() => {
    tex = readableCanvas(scene, key, W * S.frames, H);
    if (tex) (tex.customData as { resolution?: number }).resolution = RES;
  }];
  for (let f = 0; f < S.frames; f++) jobs.push(() => {
    if (!tex) return;
    const c = tex.getContext(), img = c.createImageData(W, H), m = S.build(S.frames > 1 ? f / (S.frames - 1) : 0);
    renderModel({ data: img.data, width: W, x: 0, y: 0, w: W, h: H }, S.anchor.x * RES, S.anchor.y * RES, m.parts, m.marks ?? [], { facing: 0, scale: RES, ...(S.side ? { pitch: 0 } : {}) });
    c.putImageData(img, f * W, 0);
    if (S.glow) bakeGlow(c, f * W, W, H, S, S.repeat === 0 && S.frames > 1 ? f / (S.frames - 1) : -1);
  });
  jobs.push(() => {
    if (!tex) return;
    tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (let f = 0; f < S.frames; f++) {
      const frame = tex.add(String(f), 0, f * W, 0, W, H);
      if (frame) { frame.customPivot = true; frame.pivotX = S.anchor.x / S.w; frame.pivotY = S.anchor.y / S.h; }
    }
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({ key, frames: Array.from({ length: S.frames }, (_, f) => ({ key, frame: String(f) })), frameRate: S.rate, repeat: S.repeat });
  });
  return jobs;
}

/** Свечение позади кадра x0 (FxGlow): t — доля анимации one-shot (вспыхивает и гаснет, растёт вместе с кольцом), −1 — ровное. */
function bakeGlow(c: CanvasRenderingContext2D, x0: number, W: number, H: number, S: FxSheet, t: number): void {
  const g = S.glow!, k = t < 0 ? 1 : Math.sin(Math.PI * Math.min(1, t * 1.15)), R = g.r * RES * (t < 0 ? 1 : 0.6 + 0.4 * t);
  if (k < 0.02) return;
  c.save();
  c.beginPath(); c.rect(x0, 0, W, H); c.clip();   // не залезть в соседний кадр
  c.globalCompositeOperation = 'destination-over';
  c.translate(x0 + S.anchor.x * RES, (S.anchor.y - (g.lift ?? 0)) * RES);
  c.scale(1, g.flat);
  const grad = c.createRadialGradient(0, 0, 0, 0, 0, R);
  grad.addColorStop(0, `rgba(${g.rgb}, ${g.alpha * k})`);
  grad.addColorStop(0.55, `rgba(${g.rgb}, ${g.alpha * k * 0.4})`);
  grad.addColorStop(1, `rgba(${g.rgb}, 0)`);
  c.fillStyle = grad;
  c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();
}

/** Все листы эффектов — задания для экрана загрузки. */
export function spellTextureJobs(scene: Phaser.Scene): (() => void)[] {
  return (Object.keys(SPELL_FX) as SpellFxKey[]).flatMap((key) => fxSheetJobs(scene, key));
}

/**
 * Эффект на сцене: точка опоры — в (x, y), размер — пиксели игры; one-shot исчезает сам по окончании.
 * rotation — поворот (для молнии и выпада — направление удара).
 */
export function playSpellFx(scene: Phaser.Scene, key: SpellFxKey, x: number, y: number, depth: number, rotation = 0): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(x, y, key, '0').setScale(1 / RES).setDepth(depth).setRotation(rotation);
  if (SPELL_FX[key].frames > 1) sprite.play(key);
  if (SPELL_FX[key].repeat === 0) {
    if (SPELL_FX[key].frames > 1) sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }
  return sprite;
}
