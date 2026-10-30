import Phaser from 'phaser';
import { GAME } from '../configs/game';
import { archY, DOORWAY } from './CastleArt';
import { ball, box, bricks, cyl, dot, flame, hash, M, modelSheetJobs, rod, yaw, type Anchor, type Model } from './CastleModels';
import { add, CAMERA_PITCH, cross, mul, norm, type Axes, type Mark, type Paint, type Part, type Shade, type Surface, type Vec } from './Rig3D';
import { ramp, type Ramp } from './Volume';

/*
 * Тронный зал и его комнаты — 3D-модели (Rig3D.ts) в том же стиле, что и остальной замок (CastleModels.ts):
 * трон с мёртвым королём, створки дверей в нишах задней стены (сами проёмы, дверь покоев и ворота выхода вырезаны в стенах,
 * CastleArt.ts); в покоях — кровать и сундук,
 * в кузне — лавовая печь, гном-кузнец у наковальни, витрины с оружием и доспехами; в целебнице — ведьма у котла
 * и полки с колбами. Начало координат модели — пол под предметом; точка опоры кадра стоит там же (pinned).
 */

const TAU = Math.PI * 2;

/** Анимации: кадров в цикле и кадров в секунду. */
export const HALL_ANIM = {
  riftFire: { frames: 16, rate: 12 },
  standard: { frames: 24, rate: 12 },
  furnace: { frames: 12, rate: 10 },
  smith: { frames: 16, rate: 12 },
  witch: { frames: 20, rate: 12 },
} as const;

/** Материалы зала (палитры от блика к тени, см. ramp в Volume.ts). */
const H = {
  bone: ramp('#e2d9bf'), boneDark: ramp('#b4a98c'),
  velvet: ramp('#8c1f33'), velvetDark: ramp('#5c1422'), ermine: ramp('#f0ece2'), carpet: ramp('#7a2a3c'),
  oak: ramp('#6e4c30'), oakDark: ramp('#47301f'),
  iron: ramp('#3e3c48'), ironLight: ramp('#6c6a78'),
  leather: ramp('#6a4428'), apron: ramp('#5a3a22'),
  dwarfSkin: ramp('#e0a882'), beard: ramp('#c8622a'), shirt: ramp('#3e5a48'), trousers: ramp('#4a3e3a'),
  witchSkin: ramp('#b6c89a'), robe: ramp('#3a2450'), robeDark: ramp('#2a1a3a'), hatBand: ramp('#7a5ab0'), hair: ramp('#7a7a8a'),
  brew: ramp('#5ae07a'), candle: ramp('#efe6cc'),
} as const satisfies Record<string, Ramp>;
/** Цвета без светотени: пустоты, огонь, зелье. */
const C = { void: '#0e0a12', shade: '#2a1e20', ember: '#ffb040', brew: '#9cffb0', web: '#b8b4c4', gem: '#c83040' } as const;

/** Поворот вокруг оси x: верх бруска наклоняется к зрителю (a > 0) или от него. */
function tilt(a: number): Axes { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; }
const archTop = archY;
/** Доски с железными полосами и тёмными щелями (x, y — от −1 до 1 по грани). */
const planks: Paint = (s) => {
  if (Math.abs(Math.abs(s.y) - 0.55) < 0.07) return H.iron;
  return ((s.x + 1) * 3) % 1 < 0.08 ? H.oakDark : Math.floor((s.x + 1) * 3) % 2 ? H.oak : ramp('#76523a');
};
// ---------------- трон с мёртвым королём ----------------
const THRONE = { w: 84, h: 68, ax: 42, ay: 59 } as const;

/** Помост в две ступени: посередине алая дорожка с золотой каймой, по передней кромке — золото. */
function dais(parts: Part[]): void {
  const step = (y: number, half: Vec, z: number): Part => box([0, y, z], half, (s) => {
    const x = s.x * half[0], top = s.n[1] > 0.5;
    if (Math.abs(x) < 8) return top || s.n[2] > 0.5 ? (Math.abs(x) > 6.8 ? M.gold : H.carpet) : M.stoneDark;
    if (top && s.z > 0.86) return M.gold;
    return top ? M.stoneLight : M.stone;
  });
  parts.push(step(1.5, [38, 1.5, 15], 2), step(4.5, [30, 1.5, 10], -2));
}

/** Трон: резное основание в золотой раме, бархатная подушка, стрельчатая спинка с рамками, столбы с шарами, подлокотники-львы. */
function throneChair(parts: Part[], marks: Mark[]): void {
  const backTop = (x: number): number => 44 + 8 * (1 - Math.abs(x) / 13);
  parts.push(
    box([0, 10.5, -4], [12, 4.5, 7.5], (s) => (s.n[2] > 0.5 && (Math.abs(s.x) > 0.86 || Math.abs(s.y) > 0.72) ? M.gold : H.oakDark)),
    box([0, 15.8, -3.5], [10.6, 1.2, 6.8], H.velvet),
    box([0, 31, -11], [13, 21, 1.6], (s) => {
      const x = s.x * 13, y = 31 + s.y * 21, top = backTop(x);
      if (y > top) return null;
      if (s.n[2] < 0.5) return H.oakDark;
      const edge = Math.min(13 - Math.abs(x), top - y, y - 10);
      if (edge < 1.8) return M.gold;
      if (edge < 2.6) return H.oakDark;
      if (Math.abs(edge - 3.4) < 0.35) return M.gold;
      return Math.abs(x) % 3 < 0.3 && y < 40 ? H.velvetDark : H.velvet;
    }),
    ball([0, 52.6, -11], [1.8, 2.4, 1.8], M.gold), ball([0, 55.4, -11], [0.9, 0.9, 0.9], M.goldBright),
  );
  for (const x of [-13.6, 13.6]) {
    parts.push(
      cyl([x, 9, -11], [x, 46, -11], 1.7, (s) => (((s.y + 1) * 18.5) % 9 < 1 ? M.gold : H.oakDark)),
      ball([x, 47.4, -11], [2, 2, 2], M.gold), cyl([x, 49, -11], [x, 51.5, -11], 0.5, M.gold),
      box([x * 0.93, 19.4, -2.6], [1.9, 1, 7.4], H.oakDark), ball([x * 0.93, 19.8, 5], [2.1, 2.1, 2.1], M.gold),
      box([x * 0.93, 13, 3.6], [1.4, 6, 1.3], H.oakDark),
    );
  }
  // золотая корона-герб на спинке над головой короля
  for (const [x, y] of [[-2.4, 45.6], [-1.2, 44.8], [0, 46], [1.2, 44.8], [2.4, 45.6], [-2, 44], [-1, 44], [0, 44], [1, 44], [2, 44]] as const) {
    marks.push({ p: [x, y, -9.3], color: '#f2d060', n: [0, 0, 1] });
  }
}

/** Грудная клетка: грудина, рёбра через одно с тёмными щелями, под рёбрами пустота. */
const ribs: Paint = (s) => {
  if (Math.abs(s.x) < 0.14) return H.bone;
  if (s.y < -0.55) return C.shade;
  return Math.floor((s.y + 1) * 4.5) % 2 === 0 ? H.bone : C.shade;
};
/** Горностай: белый мех с чёрными хвостиками. */
const ermine: Paint = (s) => (hash(Math.floor((s.x + 1) * 7), Math.floor((s.z + 1) * 4), 3) > 0.8 ? '#1a1416' : H.ermine);

/** Король Бездны давно мёртв: скелет в мантии осел на троне, череп склонён, корона съехала, скипетр выпал на ступени. */
function deadKing(parts: Part[], marks: Mark[]): void {
  const bone = (a: Vec, b: Vec, r = 0.8): Part => rod(a, b, r, H.bone);
  parts.push(
    ball([0, 24.5, -8], [9.6, 10.5, 3.4], H.velvet),
    ball([-6.2, 24, -4], [3.8, 7.6, 3.6], H.velvet), ball([6.2, 24, -4], [3.8, 7.6, 3.6], H.velvet),
    ball([0, 25.6, -4.6], [4.4, 5.2, 3.2], ribs),
    ball([0, 31, -5.2], [8.8, 2.2, 4.4], ermine),
    ball([0, 18, -1.2], [7.6, 2.8, 6.6], (s) => (s.z > 0.75 && s.y < 0.2 ? M.gold : H.velvet)),
    box([0, 13.4, 6], [6.8, 4.4, 0.6], (s) => (s.y < -0.5 + 0.35 * Math.sin(s.x * 9) ? null : s.y < -0.2 ? H.velvetDark : H.velvet)),
    rod([0, 29.6, -4.6], [-1.2, 32.8, -3.4], 0.75, H.bone),
  );
  // череп склонён набок, челюсть отвисла
  parts.push(ball([-1.4, 35.4, -2.8], [3.2, 3.4, 3.1], H.bone), ball([-1.2, 32.5, -1.8], [2.3, 1.1, 2.1], H.boneDark));
  for (const [x, y] of [[-2.6, 35.6], [-0.2, 35.4]] as const) {
    marks.push({ p: [x, y, 0.2], color: '#1a1214', n: [0, 0, 1] }, { p: [x + 0.6, y - 0.5, 0.2], color: '#1a1214', n: [0, 0, 1] });
  }
  marks.push({ p: [-1.3, 34.1, 0.3], color: C.shade, n: [0, 0, 1] });
  for (let x = -2.8; x <= 0.4; x += 0.8) marks.push({ p: [x, 33.2, 0.1], color: '#d8ceb0', n: [0, 0, 1] });
  crown(parts, marks, [-0.9, 38.6, -2.9]);
  // правая рука лежит на подлокотнике, пальцы свисают; левая уронила скипетр и висит за подлокотником
  parts.push(
    rod([-7, 29.2, -4.6], [-9.8, 25.6, -3.8], 1.9, H.velvet), bone([-7, 29, -4.6], [-11.4, 23.6, -3]), bone([-11.4, 23.6, -3], [-12.6, 20.8, 2]),
    ball([-12.6, 20.6, 3.2], [1.3, 0.7, 1.5], H.bone),
    rod([7, 29.2, -4.6], [9.8, 25.6, -3.6], 1.9, H.velvet), bone([7, 29, -4.6], [11.8, 23.4, -2]), bone([11.8, 23.4, -2], [14.4, 18.6, 1.4]),
    ball([14.6, 17.4, 1.8], [1.1, 1.5, 1], H.bone),
  );
  for (const dx of [-0.8, 0, 0.8]) marks.push({ p: [-12.6 + dx, 19.8, 4.6], color: '#d8ceb0', n: [0, 0, 1] }, { p: [-12.6 + dx, 19, 4.8], color: '#d8ceb0', n: [0, 0, 1] });
  for (const x of [-2.8, 2.8]) {
    parts.push(bone([x, 17.4, 1], [x * 1.08, 17.4, 6.4], 1), bone([x * 1.08, 17, 6.6], [x * 1.12, 7, 7.2], 0.85), ball([x * 1.12, 6.7, 8.2], [1.2, 0.7, 1.9], H.boneDark));
  }
  // скипетр на ступенях
  parts.push(rod([4, 6.5, 5.5], [18.5, 3.6, 13], 0.55, M.gold), ball([19.4, 3.9, 13.6], [1.5, 1.5, 1.5], M.goldBright), ball([3.2, 6.6, 5.1], [0.8, 0.8, 0.8], M.gold));
  marks.push({ p: [19.4, 5.2, 14.6], color: C.gem, n: [0, 0.5, 1] });
  cobwebs(marks);
}

/** Корона съехала набок: золотой обод с камнями и зубцами. */
function crown(parts: Part[], marks: Mark[], c: Vec): void {
  const u = norm([0.32, 1, 0.08]), e1 = norm(cross(u, [0, 0, 1])), e2 = cross(u, e1), r = 3;
  parts.push(cyl(add(c, mul(u, -0.9)), add(c, mul(u, 0.9)), r, M.gold));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    parts.push(ball(add(add(c, mul(u, 1.5)), add(mul(e1, Math.cos(a) * r * 0.92), mul(e2, Math.sin(a) * r * 0.92))), [0.6, 0.7, 0.6], M.goldBright));
  }
  marks.push({ p: add(c, [-1.2, 0, r]), color: C.gem, n: [0, 0, 1] }, { p: add(c, [0.6, 0.2, r]), color: '#3a6ac8', n: [0, 0, 1] });
}

/** Паутина: нити между столбом трона, подлокотником и короной. */
function cobwebs(marks: Mark[]): void {
  const strand = (a: Vec, b: Vec, sag: number): void => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      marks.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t], color: C.web });
    }
  };
  strand([-13.6, 40, -10], [-12.6, 21.4, 1], 1.2);
  strand([-13.6, 34, -10], [-10.6, 24, -2.6], 0.8);
  strand([-11.8, 44, -9.4], [-3.4, 39.6, -2.2], 1.4);
}

function throne(): Model {
  const parts: Part[] = [], marks: Mark[] = [];
  dais(parts);
  throneChair(parts, marks);
  deadKing(parts, marks);
  return { parts, marks };
}

// ---------------- створки дверей в нишах задней стены ----------------
/** Кадр створок: проём DOORWAY (CastleArt.ts), точка опоры — середина порога на линии стены. */
const LEAF = { w: 32, h: 44, ax: 16, ay: 40 } as const;
const inLeaf = (x: number, y: number): boolean => Math.abs(x) <= DOORWAY.half && y >= 0 && y <= archTop(x, DOORWAY.half, DOORWAY.spring, DOORWAY.apex);

/** Заперто: дверь из досок в глубине ниши, железные полосы с гвоздями, крест-накрест цепи и большой замок. */
function leafLocked(): Model {
  const D = DOORWAY, z = -D.recess + 2.5, parts: Part[] = [], marks: Mark[] = [];
  parts.push(box([0, D.apex / 2, z], [D.half, D.apex / 2, 0.6], (s) => {
    const x = s.x * D.half, y = D.apex / 2 + (s.y * D.apex) / 2;
    if (!inLeaf(x, y)) return null;
    if (Math.abs(x) < 0.45) return H.oakDark;
    if (Math.abs(y - 7) < 0.8 || Math.abs(y - 19) < 0.8) return H.iron;
    return (x + D.half) % 4 < 0.35 ? H.oakDark : Math.floor((x + D.half) / 4) % 2 ? H.oak : ramp('#76523a');
  }));
  const link = (s: Surface): Shade => (Math.floor((s.y + 1) * 7) % 2 ? H.iron : H.ironLight);
  parts.push(rod([-9, 21, z + 0.9], [9, 4, z + 0.9], 0.55, link), rod([9, 21, z + 0.9], [-9, 4, z + 0.9], 0.55, link));
  parts.push(
    box([0, 10.4, z + 1.7], [2.2, 2.4, 0.9], M.gold),
    rod([-1.3, 12.6, z + 1.7], [-1.3, 14.4, z + 1.7], 0.45, H.ironLight), rod([1.3, 12.6, z + 1.7], [1.3, 14.4, z + 1.7], 0.45, H.ironLight),
    rod([-1.3, 14.6, z + 1.7], [1.3, 14.6, z + 1.7], 0.45, H.ironLight),
  );
  marks.push({ p: [0, 10.6, z + 2.7], color: '#2a1e14', n: [0, 0, 1] }, { p: [0, 9.8, z + 2.7], color: '#2a1e14', n: [0, 0, 1] });
  for (const y of [7, 19]) for (const x of [-8, -4, 4, 8]) marks.push({ p: [x, y, z + 0.7], color: '#8a8898', n: [0, 0, 1] });
  return { parts, marks };
}

/** Открыто: створки распахнуты и лежат на откосах ниши; в глубине — тёплый свет комнаты (нарисован на стене). */
function leafOpen(): Model {
  const D = DOORWAY, a = Math.atan2(D.recess, 4), len = Math.hypot(4, D.recess) / 2;
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    parts.push(box([side * (D.half - 1.8), D.spring / 2 + 0.5, -D.recess / 2 + 0.4], [len * 0.92, D.spring / 2 + 0.5, 0.5], planks, yaw(-side * a)));
    parts.push(ball([side * (D.half - 2.6), 11, -D.recess / 2 + 1.4], [0.7, 0.7, 0.7], M.gold));
  }
  return { parts };
}

// ---------------- предметы зала: сундук, чёрный костёр, флаги ----------------
/** Сундук: корпус в железных полосах с уголками; запертый — цепи и замок, открытый — откинутая крышка и золото внутри. */
function chest(open: boolean): Model {
  const body: Paint = (s) => {
    if (Math.abs(Math.abs(s.x) - 0.62) < 0.08 || (Math.abs(s.x) > 0.9 && Math.abs(s.y) > 0.7)) return M.metal;
    return s.n[2] > 0.9 && ((s.y + 1) * 1.5) % 1 < 0.1 ? H.oakDark : H.oak;
  };
  const parts: Part[] = [box([0, 5, 0], [11, 5, 6.5], body)];
  const marks: Mark[] = [];
  if (open) {
    parts.push(
      box([0, 10.2, 0], [10, 0.4, 5.6], (s) => (hash(Math.floor((s.x + 1) * 8), Math.floor((s.z + 1) * 4), 7) > 0.55 ? M.goldBright : M.gold)),
      box([0, 15.6, -7.6], [11, 6, 0.9], (s) => {
        if (s.n[2] < 0.5) return Math.abs(Math.abs(s.x) - 0.62) < 0.08 ? M.metal : H.oak;
        return Math.abs(s.x) > 0.84 || Math.abs(s.y) > 0.76 ? M.gold : H.velvet;   // изнанка крышки — бархат в золотой кайме
      }, tilt(-0.25)),
    );
    marks.push({ p: [-3, 10.8, 1], color: C.gem, n: [0, 1, 0] }, { p: [4, 10.8, -1], color: '#3a6ac8', n: [0, 1, 0] }, { p: [1, 10.8, 3], color: '#ffffff', n: [0, 1, 0] });
  } else {
    parts.push(cyl([-11, 10, 0], [11, 10, 0], 6.5, (s) => (Math.abs(s.n[0]) < 0.9 && Math.abs(Math.abs(s.y) - 0.62) < 0.08 ? M.metal : H.oak)));
    const link = (s: Surface): Shade => (Math.floor((s.y + 1) * 6) % 2 ? H.iron : H.ironLight);
    parts.push(rod([-8, 16.4, 0], [-8, 0.5, 6.9], 0.5, link), rod([8, 16.4, 0], [8, 0.5, 6.9], 0.5, link));
    parts.push(box([0, 7.4, 7.2], [2, 2.2, 0.8], M.gold), rod([-1.2, 9.6, 7.2], [-1.2, 11.2, 7.2], 0.4, H.ironLight), rod([1.2, 9.6, 7.2], [1.2, 11.2, 7.2], 0.4, H.ironLight), rod([-1.2, 11.4, 7.2], [1.2, 11.4, 7.2], 0.4, H.ironLight));
    marks.push({ p: [0, 7.4, 8.1], color: '#2a1e14', n: [0, 0, 1] });
  }
  for (const x of [-10, 10]) marks.push({ p: [x, 2, 6.6], color: '#d6b66d', n: [0, 0, 1] });
  return { parts, marks };
}

/**
 * Чёрный костёр посреди тронного зала — проход к аренам: кольцо закопчённых камней, обугленные поленья,
 * лиловые угли и осколки кристаллов Бездны; над ними рвётся чёрное пламя с лиловой каймой, бьют молнии, летят искры.
 * Разлом в полу под ним нарисован в полу зала (CastleArt.ts).
 */
const RIFT_FIRE = { w: 72, h: 84, ax: 36, ay: 70, ring: 12 } as const;
function riftFire(f: number): Model {
  const p = f / HALL_ANIM.riftFire.frames, R = RIFT_FIRE.ring, parts: Part[] = [], marks: Mark[] = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU;
    parts.push(ball([Math.cos(a) * R, 1.4, Math.sin(a) * R], [2.7, 2, 2.3], ramp(hash(k, 1, 3) > 0.5 ? '#3a3644' : '#2a2832')));
  }
  parts.push(ball([0, 0.8, 0], [R - 2, 1, R - 3], (s) => {
    const k = hash(Math.floor((s.x + 1) * 6 + f), Math.floor((s.z + 1) * 5), 11);
    return k > 0.75 ? '#c080ff' : k > 0.45 ? '#5a2a8a' : '#120a18';
  }));
  const log = ramp('#1e1418');
  parts.push(rod([-8, 1.2, -3], [7, 3.6, 4], 1.4, log), rod([8, 1.2, -4], [-6, 3.4, 4], 1.4, log), rod([0, 1, -8], [1, 3.8, 7], 1.3, log));
  for (const [x, z, h] of [[-13, -4, 9], [12, -6, 11], [3, -12, 8]] as const) {
    parts.push(rod([x, 0, z], [x * 1.15, h, z * 1.15], 1, ramp('#3a1a5a')));
    marks.push({ p: [x * 1.15, h + 0.6, z * 1.15], color: '#e0b8ff' });
  }
  for (let i = 0; i < 6; i++) marks.push({ p: [(hash(i, 2, 5) - 0.5) * 14, 3.6, (hash(i, 3, 5) - 0.5) * 8], color: (f + i) % 3 ? '#b060ff' : '#ffffff' });
  // объёмное чёрное пламя: большой язык посередине и четыре поменьше вокруг, каждый колышется в своей фазе
  flameTongue(parts, 0, 0, 26 * (0.85 + 0.15 * Math.sin(p * TAU * 2)), 8, p * TAU);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    flameTongue(parts, Math.cos(a) * 5.5, Math.sin(a) * 4, 15 + 4 * Math.sin(p * TAU * 2 + i * 1.7), 4.5, p * TAU + i * 1.3);
  }
  return {
    parts, marks,
    overlay: (c) => {
      for (let i = 0; i < 5; i++) {
        const k = (p * 2 + i / 5) % 1;
        dot(c, k < 0.6 ? '#c080ff' : '#5a2a8a', RIFT_FIRE.ax - 8 + i * 4 + Math.sin(k * TAU + i) * 2, RIFT_FIRE.ay - 20 - k * 40, 0.5, 0.5);
      }
      if (hash(f, 1, 9) > 0.45) bolt(c, RIFT_FIRE.ax + (hash(f, 2, 9) - 0.5) * 8, RIFT_FIRE.ay - 24, 14, f);
      if (hash(f, 3, 9) > 0.7) bolt(c, RIFT_FIRE.ax + (hash(f, 4, 9) - 0.5) * 10, RIFT_FIRE.ay - 18, 10, f + 40);
    },
  };
}

/** Чёрное пламя — объёмное: по краю силуэта лиловая кайма, к середине темнее, сердцевина почти чёрная (светится само, без теней). */
const VIEW_DIR = [Math.sin(CAMERA_PITCH), Math.cos(CAMERA_PITCH)] as const;
const flamePaint: Paint = (s) => {
  const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];   // насколько точка смотрит в камеру
  return d < 0.45 ? '#c080ff' : d < 0.65 ? '#7a30c0' : d < 0.82 ? '#2a1048' : '#0a0410';
};
/** Язык пламени: стопка сжимающихся кверху шаров, верх колышется (phase — фаза колыхания). */
function flameTongue(parts: Part[], x: number, z: number, height: number, width: number, phase: number): void {
  const n = 4;
  for (let k = 0; k < n; k++) {
    const t = k / n, r = width * (1 - t * 0.72), sway = Math.sin(phase + t * 3) * 2.2 * t;
    parts.push(ball([x + sway, 3 + height * t, z], [r, (height / n) * 0.95, r], flamePaint));
  }
}

/** Молния: ломаная из точки (x, y) вверх, len колен; seed — какая. Лиловое свечение и белая сердцевина. */
function bolt(c: CanvasRenderingContext2D, x: number, y: number, len: number, seed: number): void {
  let px = x, py = y;
  for (let i = 0; i < len; i++) {
    const nx = px + (hash(seed, i, 5) - 0.5) * 7, ny = py - 2 - hash(seed, i, 7) * 3;
    for (let k = 0; k <= 4; k++) {
      const qx = px + ((nx - px) * k) / 4, qy = py + ((ny - py) * k) / 4;
      dot(c, '#c080ff', qx - 0.5, qy - 0.5, 1, 1);
      dot(c, '#ffffff', qx, qy, 0.5, 0.5);
    }
    px = nx; py = ny;
  }
}

/** Герб замка на ткани: четверти красная и синяя накрест, золотой крест. u — поперёк (−1..1), v — вверх (−1..1). */
function heraldic(u: number, v: number): Ramp {
  if (Math.abs(u) < 0.14 || Math.abs(v - 0.25) < 0.1) return M.gold;
  return (u < 0) === (v > 0.25) ? ramp('#b02a3a') : ramp('#2a4a92');
}

/** Флаг на древке: каменное основание, древко с золотым навершием, перекладина; полотнище с гербом колышется, внизу — «ласточкин хвост» с бахромой. */
const STANDARD = { w: 36, h: 70, ax: 14, ay: 64, cols: 8, colW: 2, top: 51.4, edge: 24, notch: 6 } as const;
function standard(f: number): Model {
  const t = (f / HALL_ANIM.standard.frames) * TAU, S = STANDARD, parts: Part[] = [];
  parts.push(
    box([0, 1.5, 0], [4.5, 1.5, 4.5], M.stoneDark), box([0, 3.6, 0], [3, 0.6, 3], M.stone),
    cyl([0, 4, 0], [0, 56, 0], 0.9, H.oakDark), ball([0, 57.6, 0], [1.4, 1.9, 1.4], M.gold),
    cyl([-0.6, 52, 0], [S.cols * S.colW + 2, 52, 0], 0.6, H.oakDark), ball([S.cols * S.colW + 2.4, 52, 0], [0.9, 0.9, 0.9], M.gold),
  );
  const mid = (S.cols - 1) / 2, width = S.cols * S.colW;
  for (let i = 0; i < S.cols; i++) {
    const cx = 1.6 + i * S.colW, phase = i * 0.8 + t, k = i / (S.cols - 1);
    const bottom = S.edge + (1 - Math.abs(i - mid) / mid) * S.notch;
    const h = (S.top - bottom) / 2, cy = (S.top + bottom) / 2;
    parts.push(box([cx + Math.sin(t) * 0.5 * k, cy, Math.sin(phase) * 1.1 * k], [S.colW / 2 + 0.05, h, 0.45], (s) => {
      const y = cy + s.y * h;
      if (y < bottom + 1.2) return M.gold;
      return heraldic(((cx - 1.6) / (width - S.colW)) * 2 - 1, ((y - S.edge) / (S.top - S.edge)) * 2 - 1);
    }, yaw(Math.cos(phase) * 0.45 * k)));
  }
  return { parts };
}

/** Манекены с доспехами в зале — крупнее, чем в кузне. */
const HALL_ARMOR_SCALE = 1.25;

// ---------------- кузня ----------------
const FURNACE = { w: 112, h: 92, ax: 56, ay: 84, mouth: 12 } as const;
/** Лава: светлые жилы плывут по тёмной корке (t — фаза анимации). */
function lavaAt(x: number, z: number, t: number): string {
  const v = Math.sin(x * 0.5 + t) + Math.sin(z * 0.9 - x * 0.2 - t * 1.4) * 0.7;
  return v > 1.2 ? '#fff6c0' : v > 0.6 ? '#ffd060' : v > -0.2 ? '#ff8a2a' : v > -0.9 ? '#e0501e' : '#7a2010';
}

/** Большая лавовая печь: кирпичный горн с аркой устья, внутри кипит лава; колпак, дымоход, жёлоб с лавой, мехи, уголь. */
function furnace(f: number): Model {
  const t = (f / HALL_ANIM.furnace.frames) * TAU, m = FURNACE.mouth;
  const inMouth = (x: number, y: number): boolean => Math.abs(x) < m && y < 4 + archTop(x, m, 8, 14) - 4;
  const brick = bricks(M.brickDark, '#22161a', 6, 10);
  const parts: Part[] = [
    box([0, 10, -8], [34, 10, 9], (s) => {
      const x = s.x * 34, y = 10 + s.y * 10;
      if (s.n[2] > 0.9 && inMouth(x, y)) return null;
      if (s.n[1] > 0.9) return M.brickDark;
      return hash(Math.floor(x / 3), Math.floor(y / 2), 11) > 0.93 ? '#ff7a2a' : brick(s);
    }),
    box([0, 9, -14], [m, 9, 0.6], (s) => lavaAt(s.x * m, s.y * 6, t)),
    box([0, 1, -8], [m, 1, 5.6], (s) => lavaAt(s.x * m, s.z * 6, t)),
    box([0, 27, -10], [28, 7, 7.5], (s) => (s.y < -0.75 ? M.bronze : bricks(M.brick, '#2a1c1c', 4, 9)(s))),
    box([0, 44, -12], [11, 10, 5], (s) => (s.n[1] > 0.9 ? '#120c0c' : bricks(M.brickDark, '#1a1214', 5, 4)(s))),
    box([0, 1.4, 6], [28, 1.4, 4.4], (s) => (s.n[1] > 0.9 && Math.abs(s.x) < 0.93 && Math.abs(s.z) < 0.6 ? lavaAt(s.x * 26, s.z * 4, t * 0.7) : M.stoneDark)),
  ];
  for (let k = 0; k <= 8; k++) {
    const x = -(m + 2) + (k / 8) * 2 * (m + 2);
    parts.push(ball([x, archTop(x, m + 2, 8, 16), 1.2], [2.8, 2.4, 1.8], k % 2 ? M.stoneLight : M.stone));
  }
  // мехи слева, уголь и клещи справа
  parts.push(
    box([-40, 5, 0], [5, 2.6, 7], (s) => (Math.abs(s.y) < 0.6 ? H.leather : H.oak), tilt(0.25)),
    rod([-40, 7, 7], [-40, 11, 13], 0.6, H.oak), cyl([-40, 3, -7.6], [-40, 3, -5], 1, H.iron),
    cyl([38, 0, 4], [38, 6, 4], 5, (s) => (s.n[1] > 0.9 ? '#141012' : H.iron)),
    rod([33, 14, -2], [37, 30, -3], 0.5, H.ironLight), rod([35, 14, -2], [37, 30, -3], 0.5, H.ironLight),
  );
  for (let i = 0; i < 7; i++) parts.push(ball([36 + (i % 3) * 2 - 2, 6 + Math.floor(i / 3) * 0.8, 3 + (i % 2) * 2], [1.4, 1, 1.4], ramp('#2a2426')));
  return {
    parts,
    overlay: (c) => {
      flame(c, FURNACE.ax, FURNACE.ay - 9, 9, 7, f / HALL_ANIM.furnace.frames);
      for (let i = 0; i < 4; i++) {
        const k = ((f / HALL_ANIM.furnace.frames) + i / 4) % 1;
        dot(c, k < 0.5 ? '#ffd060' : '#ff8a2a', FURNACE.ax - 6 + i * 4, FURNACE.ay - 30 - k * 24, 0.5, 0.5);
      }
    },
  };
}

/**
 * Гном-кузнец у наковальни: коренастый, в кожаном фартуке, рыжая борода с косами и золотыми бусинами, железный шлем;
 * левой рукой медленно поднимает молот и бьёт по раскалённой заготовке, правой держит её клещами. На ударе — искры.
 */
const SMITH = { w: 56, h: 48, ax: 22, ay: 43, strike: 0.6 } as const;
function smith(f: number): Model {
  const p = f / HALL_ANIM.smith.frames, S = SMITH.strike;
  // угол молота: медленно вверх, быстро вниз, лёгкий отскок
  const angle = p < S ? -0.6 + 2.4 * Math.sin((p / S) * Math.PI / 2) : p < S + 0.08 ? 1.8 - 2.4 * ((p - S) / 0.08) : -0.6 + 0.25 * Math.sin(((p - S - 0.08) / (1 - S - 0.08)) * Math.PI);
  const hit = p >= S + 0.06 && p < S + 0.2;
  const shoulder: Vec = [5.6, 13.6, 0.4], elbow: Vec = [8.6, 12, 1.2];
  const dir: Vec = [Math.cos(angle), Math.sin(angle), 0], hand = add(elbow, mul(dir, 3.6)), head = add(hand, mul(dir, 6));
  const parts: Part[] = [
    // наковальня на пне
    cyl([15, 0, 1], [15, 4.6, 1], 3.6, (s) => (s.n[1] > 0.9 ? H.oak : H.oakDark)),
    box([15, 5.6, 1], [2.2, 1, 1.6], H.iron), box([15, 7.6, 1], [4.6, 1.2, 2.4], M.steel), ball([20.4, 7.8, 1], [2.2, 0.9, 1.2], M.steel),
    box([14.4, 9, 1.6], [2.6, 0.3, 0.7], () => (hit ? '#ffe9a0' : '#ff8a2a')),
    // ноги и тело
    rod([-2.4, 5.4, 0], [-2.4, 1.6, 0.4], 1.9, H.trousers), rod([2.4, 5.4, 0], [2.4, 1.6, 0.4], 1.9, H.trousers),
    ball([-2.4, 1.2, 1.2], [2.1, 1.3, 2.7], H.leather), ball([2.4, 1.2, 1.2], [2.1, 1.3, 2.7], H.leather),
    ball([0, 10, 0], [6.2, 6, 4.6], H.shirt),
    ball([0, 9.2, 1.1], [5.4, 6.2, 3.9], (s) => (s.z < 0.1 ? null : s.y > 0.78 ? H.leather : H.apron)),
    ball([0, 6.6, 0], [6.4, 0.9, 4.8], (s) => (s.z > 0.85 && Math.abs(s.x) < 0.14 ? M.gold : H.leather)),
    // голова: нос-картошка, кустистые брови, борода с косами, шлем
    ball([0, 18.4, 0.6], [3.7, 3.7, 3.4], H.dwarfSkin), ball([0, 18, 3.9], [1.3, 1.2, 1.1], H.dwarfSkin),
    ball([0, 15.4, 2.4], [4, 4.2, 2.6], H.beard),
    rod([-1.3, 12.4, 3.8], [-1.5, 8.2, 4.8], 0.95, H.beard), rod([1.3, 12.4, 3.8], [1.5, 8.2, 4.8], 0.95, H.beard),
    ball([-1.5, 7.8, 4.9], [0.9, 0.9, 0.9], M.gold), ball([1.5, 7.8, 4.9], [0.9, 0.9, 0.9], M.gold),
    ball([-1.4, 19.6, 3.2], [1.3, 0.6, 0.7], H.beard), ball([1.4, 19.6, 3.2], [1.3, 0.6, 0.7], H.beard),
    ball([0, 20.4, 0.4], [4, 2.6, 3.8], (s) => (s.y < 0.05 ? null : M.ironLight)), cyl([0, 20.2, 0.4], [0, 21, 0.4], 4, M.bronze),
    // правая рука с клещами, левая с молотом
    rod([-5.6, 13.6, 0.4], [-3, 10.2, 4], 1.8, H.shirt), ball([-2.6, 9.8, 4.6], [1.5, 1.5, 1.5], H.dwarfSkin),
    rod([-2.2, 9.8, 4.6], [12.6, 9.2, 2], 0.45, H.ironLight),
    rod(shoulder, elbow, 1.9, H.shirt), rod(elbow, hand, 1.7, H.dwarfSkin), ball(hand, [1.5, 1.5, 1.5], H.dwarfSkin),
    rod(hand, head, 0.55, H.oak), box(head, [1, 1.8, 1.2], M.steel, [[dir[0], dir[1], 0], [-dir[1], dir[0], 0], [0, 0, 1]]),
  ];
  const marks: Mark[] = [{ p: [-1.2, 18.8, 3.8], color: '#272838', n: [0, 0, 1] }, { p: [1.2, 18.8, 3.8], color: '#272838', n: [0, 0, 1] }];
  return {
    parts, marks,
    overlay: (c) => {
      if (!hit) return;
      const k = (p - S - 0.06) / 0.14;
      for (const a of [-2.8, -2.3, -1.9, -1.4, -0.9, -0.5]) {
        const r = 2 + k * 10;
        dot(c, k < 0.5 ? '#fff0a0' : '#ff8a2a', SMITH.ax + 14 + Math.cos(a) * r, SMITH.ay - 10 + Math.sin(a) * r * 0.8 + k * k * 5, 1, 1);
      }
    },
  };
}

/** Витрина с оружием: стойка из досок, мечи, топор, копьё и боевой молот, посередине — щит с гербом. */
function weaponRack(): Model {
  const parts: Part[] = [
    box([-20, 13, -2], [1.4, 13, 1.4], H.oak), box([20, 13, -2], [1.4, 13, 1.4], H.oak),
    box([0, 22, -2], [21, 1, 1.2], H.oak), box([0, 4, -1], [21, 1, 2.6], H.oakDark),
  ];
  const sword = (x: number): void => {
    parts.push(box([x, 13, -0.6], [0.9, 8.5, 0.35], M.steel), box([x, 4.6, -0.6], [2.6, 0.5, 0.6], M.gold), rod([x, 1.6, -0.6], [x, 4, -0.6], 0.55, H.leather), ball([x, 1.2, -0.6], [0.8, 0.8, 0.8], M.gold));
  };
  sword(-16); sword(-12.4);
  parts.push(rod([-7.4, 1, -0.4], [-7.4, 25, -0.4], 0.5, H.oak), ball([-7.4, 26.6, -0.4], [0.8, 2.2, 0.5], M.steel));
  parts.push(rod([12, 1, -0.4], [12, 20, -0.4], 0.6, H.oak), box([13.8, 18, -0.4], [2.4, 2.6, 0.4], M.steel));
  parts.push(rod([17, 1, -0.4], [17, 17, -0.4], 0.6, H.oak), box([17, 17.6, -0.4], [2.4, 1.6, 1.6], H.ironLight));
  parts.push(box([2.6, 13, 0.4], [4.4, 6, 0.5], (s) => {
    const half = s.y > -0.2 ? 1 : (s.y + 1) / 0.8;
    if (Math.abs(s.x) > half) return null;
    if (Math.abs(s.x) > half - 0.2 || s.y > 0.84 || Math.abs(s.z) < 0.9) return M.gold;
    return Math.abs(s.x) < 0.14 || Math.abs(s.y - 0.3) < 0.12 ? M.gold : (s.x < 0) === (s.y > 0.3) ? ramp('#b02a3a') : ramp('#2a4a92');
  }));
  return { parts };
}

/** Доспехи на манекене: крестовина, кольчуга, кираса с золотой кромкой, наплечники, шлем-ведро с плюмажем. */
function armorStand(): Model {
  const mail: Paint = (s) => (Math.floor((s.y + 1) * 6) % 2 === 0 && Math.floor((s.x + 1) * 7 + (s.y + 1) * 3) % 2 === 0 ? ramp('#4c5664') : ramp('#727c8a'));
  const plate: Ramp = ['#f4f8fc', '#c4ccd8', '#949eae', '#6a7484', '#464e5c'];
  const parts: Part[] = [
    box([0, 0.8, 0], [6, 0.8, 1.2], H.oakDark), box([0, 0.8, 0], [1.2, 0.8, 5], H.oakDark),
    cyl([0, 1, 0], [0, 15, 0], 0.8, H.oak),
    ball([0, 19, 0], [5.6, 6, 3.6], mail),
    ball([0, 20, 0.8], [5.2, 5.4, 3.2], (s) => (s.z < 0.2 ? null : s.y > 0.78 || Math.abs(s.x) > 0.86 ? M.gold : plate)),
    ball([-5.4, 24, 0], [2.4, 1.8, 2.4], plate), ball([5.4, 24, 0], [2.4, 1.8, 2.4], plate),
    cyl([0, 25.6, 0], [0, 31.4, 0], 3.4, (s) => (s.n[2] > 0.3 && s.y > 0.1 && s.y < 0.4 ? '#141018' : s.y > 0.8 ? M.gold : plate)),
    ball([0, 31.6, 0], [3.4, 1.8, 3.4], plate),
  ];
  for (let i = 0; i < 4; i++) parts.push(ball([0, 33.6 - i * 0.3, -0.6 - i * 1.1], [1.1 - i * 0.12, 1, 1.2], ramp(i ? '#d84040' : '#f4f0e8')));
  return { parts };
}

// ---------------- целебница ----------------
/**
 * Ведьма у котла: длинная лиловая мантия, зеленоватая кожа, длинный нос, седые космы, остроконечная шляпа с пряжкой;
 * мешает зелье длинной ложкой по кругу. Котёл на трёх ножках над огнём, зелье бурлит пузырями, поднимается пар.
 */
const WITCH = { w: 64, h: 64, ax: 32, ay: 58 } as const;
function witch(f: number): Model {
  const p = f / HALL_ANIM.witch.frames, t = p * TAU;
  const pot: Vec = [7, 7, 4], tip: Vec = [pot[0] + Math.cos(t) * 3, 9.4, pot[2] + Math.sin(t) * 2.4];
  const hands: Vec = [-1 + Math.cos(t) * 1.4, 15.6, 2.4 + Math.sin(t) * 1];
  const parts: Part[] = [
    // котёл: чаша без верха, обод, бурлящее зелье, ножки, дрова
    ball(pot, [8, 6.4, 6.6], (s) => (s.y > 0.5 ? null : H.iron)),
    ball([pot[0], 10.2, pot[2]], [8.2, 0.9, 6.8], (s) => (s.x * s.x + s.z * s.z < 0.8 ? null : H.ironLight)),
    ball([pot[0], 10, pot[2]], [7.4, 0.5, 6], (s) => (hash(Math.floor((s.x + 1) * 5 + p * 10), Math.floor((s.z + 1) * 4), 13) > 0.8 ? C.brew : H.brew)),
    ...[-0.7, 1.4, 3.5].map((a): Part => rod([pot[0] + Math.cos(a) * 6, 2, pot[2] + Math.sin(a) * 5], [pot[0] + Math.cos(a) * 7, 0, pot[2] + Math.sin(a) * 6], 0.6, H.iron)),
    rod([pot[0] - 6, 0.8, pot[2] + 4], [pot[0] + 6, 0.8, pot[2] + 5], 1, H.oakDark), rod([pot[0] - 5, 0.8, pot[2] + 6], [pot[0] + 5, 0.8, pot[2] + 3], 1, H.oak),
    // мантия расширяется книзу, по подолу — тёмная кайма
    ball([-6, 7, -2], [6.2, 8, 5], (s) => (s.y < -0.75 ? null : s.y < -0.55 ? H.robeDark : H.robe)),
    cyl([-6, 0, -2], [-6, 2, -2], 5, H.robeDark),
    ball([-6, 16, -2], [4.6, 4.6, 3.6], H.robe),
    // голова, нос, космы
    ball([-6, 22.4, -1.4], [3.3, 3.5, 3.2], H.witchSkin),
    rod([-6, 22.2, 1.4], [-5.4, 20.8, 4.4], 0.75, H.witchSkin), ball([-5.3, 20.6, 4.5], [0.6, 0.6, 0.6], H.witchSkin),
    ball([-6, 21, -3.6], [4, 5.4, 2.6], H.hair), ball([-9.4, 19, -1.2], [1.6, 4.4, 2], H.hair), ball([-2.6, 19, -1.2], [1.6, 4.4, 2], H.hair),
    // шляпа: широкие поля, конус кольцами с изломом, пряжка
    cyl([-6, 25.8, -1.4], [-6, 26.4, -1.4], 6.2, H.robeDark),
    cyl([-6, 26.4, -1.4], [-6, 28, -1.4], 4, (s) => (Math.abs(s.n[1]) < 0.9 && s.y < 0.2 ? H.hatBand : H.robeDark)),
    box([-6, 27.1, 2.6], [1.1, 0.8, 0.3], M.gold),
  ];
  for (let k = 0; k < 6; k++) {
    const r = 3.6 * (1 - k / 6) + 0.4, bend = (k / 6) ** 2 * 3;
    parts.push(cyl([-6 - bend, 28 + k * 2, -1.4 - bend * 0.5], [-6 - bend, 30 + k * 2, -1.4 - bend * 0.5], r, H.robeDark));
  }
  // руки в рукавах держат длинную ложку
  parts.push(
    rod([-9.4, 18.6, -1.6], [hands[0] - 1.2, hands[1], hands[2]], 1.5, H.robe), rod([-2.6, 18.6, -1.6], [hands[0] + 1.2, hands[1] + 0.6, hands[2]], 1.5, H.robe),
    ball([hands[0] - 0.8, hands[1], hands[2] + 0.6], [1, 1, 1], H.witchSkin), ball([hands[0] + 1, hands[1] + 0.6, hands[2] + 0.6], [1, 1, 1], H.witchSkin),
    rod([hands[0] - 2, hands[1] + 2.6, hands[2] - 0.6], tip, 0.55, H.oak),
  );
  const marks: Mark[] = [{ p: [-7.3, 22.8, 1.7], color: '#e0f070', n: [0, 0, 1] }, { p: [-4.7, 22.8, 1.7], color: '#e0f070', n: [0, 0, 1] }];
  for (let i = 0; i < 4; i++) {
    const k = (p * 2 + i / 4) % 1;
    marks.push({ p: [pot[0] - 5 + i * 3.4, 10.4 + k * 1.2, pot[2] + Math.sin(i * 2) * 3], color: k < 0.8 ? C.brew : '#ffffff' });
  }
  return {
    parts, marks,
    overlay: (c) => {
      flame(c, WITCH.ax + 7, WITCH.ay + 1, 5, 3, p);
      for (let i = 0; i < 5; i++) {
        const k = (p + i / 5) % 1;
        dot(c, '#bff5c8', WITCH.ax + 4 + i * 2 + Math.sin(k * TAU + i) * 2, WITCH.ay - 13 - k * 18, 1, 1);
      }
    },
  };
}

/** Полки целебницы: стеллаж из досок, разноцветные колбы и банки, книги, череп, свечи; сверху свисают пучки трав. */
function shelves(): Model {
  const glasses = [M.glassRed, M.glassBlue, M.potion, ramp('#a060d0'), ramp('#e0c040')];
  const parts: Part[] = [
    box([-20, 20, -3], [1.4, 20, 4], H.oakDark), box([20, 20, -3], [1.4, 20, 4], H.oakDark),
    box([0, 39.4, -3], [21.4, 0.8, 4.4], H.oak), box([0, 20, -6.6], [19, 20, 0.6], ramp('#3a2a20')),
  ];
  for (const y of [1, 13, 26]) parts.push(box([0, y, -3], [19, 0.8, 4], H.oak));
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = [1.8, 13.8, 26.8][shelf]!;
    for (let i = 0; i < 6; i++) {
      const x = -16 + i * 6.4 + hash(i, shelf, 3) * 1.6, kind = Math.floor(hash(i, shelf, 5) * 4);
      const glass = glasses[Math.floor(hash(i, shelf, 9) * glasses.length)]!;
      if (kind === 0) parts.push(ball([x, y + 2.4, -2], [2.2, 2.4, 2.2], glass), cyl([x, y + 4.4, -2], [x, y + 6.4, -2], 0.7, M.glass), cyl([x, y + 6.4, -2], [x, y + 7.2, -2], 0.8, M.cork));
      else if (kind === 1) parts.push(cyl([x, y, -2], [x, y + 5, -2], 2, (s) => (s.y > 0.6 ? M.cork : glass)));
      else if (kind === 2) parts.push(box([x, y + 3.6, -2.6], [2.4, 3.6, 2], i % 2 ? H.velvet : ramp('#2a4a6a')), box([x + 1.6, y + 3.2, -2.6], [0.8, 3.2, 2], ramp('#4a6a3a')));
      else parts.push(cyl([x, y, -2], [x, y + 3.6, -2], 0.9, H.candle), ball([x, y + 4.4, -2], [0.6, 0.9, 0.6], () => C.ember));
    }
  }
  parts.push(ball([12, 17.4, -1.6], [2.4, 2.6, 2.2], H.bone));
  for (const x of [-14, -4, 8, 16]) {
    parts.push(rod([x, 39, -1], [x + 0.4, 34, -0.6], 0.4, H.oakDark), ball([x + 0.4, 32.6, -0.6], [1.6, 2.6, 1.4], M.leaf), ball([x + 0.8, 31, -0.2], [1, 1.6, 1], M.leafLight));
  }
  return { parts, marks: [{ p: [11.2, 17.8, 0.5], color: '#1a1214', n: [0, 0, 1] }, { p: [12.8, 17.8, 0.5], color: '#1a1214', n: [0, 0, 1] }] };
}

// ---------------- листы кадров ----------------
/**
 * Лист кадров модели, у всех кадров точка опоры — в anchor (пол под предметом), чтобы prop() ставил его «ногами» в точку.
 * scale — во сколько раз крупнее нарисовать (кадр, точка опоры и плоская анимация поверх растут вместе с моделью).
 */
function pinned(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, rate: number, anchor: Anchor, build: (f: number) => Model, scale = 1, facing = 0): (() => void)[] {
  const W = Math.round(w * scale), Hh = Math.round(h * scale), a = { x: Math.round(anchor.x * scale), y: Math.round(anchor.y * scale) };
  const scaled = (f: number): Model => {
    const m = build(f), overlay = m.overlay;
    return overlay ? { ...m, overlay: (c) => { c.save(); c.scale(scale, scale); overlay(c); c.restore(); } } : m;
  };
  return [...modelSheetJobs(scene, key, W, Hh, frames, rate, a, scale === 1 ? build : scaled, { scale: GAME.resolution * scale, facing }), () => {
    const tex = scene.textures.get(key);
    for (const name of tex.getFrameNames(true)) {
      const frame = tex.get(name);
      frame.customPivot = true; frame.pivotX = a.x / W; frame.pivotY = a.y / Hh;
    }
  }];
}

/** Сундук в зале крупнее и повёрнут в три четверти: видны крышка, перед и бок. */
const CHEST_VIEW = { scale: 1.3, facing: 0.5 } as const;
/** Крупнее обычного: большая лавовая печь и гном-кузнец (иначе теряются в просторной кузне). */
const SMITHY_SCALE = { furnace: 1.35, smith: 1.25 } as const;

/** Все модели тронного зала и комнат — задания для экрана загрузки. */
export function hallTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const still = (key: string, w: number, h: number, anchor: Anchor, build: () => Model): (() => void)[] => pinned(scene, key, w, h, 1, 1, anchor, build);
  return [
    ...still('hall_throne', THRONE.w, THRONE.h, { x: THRONE.ax, y: THRONE.ay }, throne),
    ...still('hall_leaf_open', LEAF.w, LEAF.h, { x: LEAF.ax, y: LEAF.ay }, leafOpen),
    ...still('hall_leaf_locked', LEAF.w, LEAF.h, { x: LEAF.ax, y: LEAF.ay }, leafLocked),
    ...pinned(scene, 'hall_rift_fire', RIFT_FIRE.w, RIFT_FIRE.h, HALL_ANIM.riftFire.frames, HALL_ANIM.riftFire.rate, { x: RIFT_FIRE.ax, y: RIFT_FIRE.ay }, riftFire),
    ...pinned(scene, 'hall_standard', STANDARD.w, STANDARD.h, HALL_ANIM.standard.frames, HALL_ANIM.standard.rate, { x: STANDARD.ax, y: STANDARD.ay }, standard),
    ...pinned(scene, 'hall_armor', 20, 44, 1, 1, { x: 10, y: 40 }, armorStand, HALL_ARMOR_SCALE),
    ...pinned(scene, 'room_chest_locked', 32, 32, 1, 1, { x: 16, y: 24 }, () => chest(false), CHEST_VIEW.scale, CHEST_VIEW.facing),
    ...pinned(scene, 'room_chest_open', 32, 36, 1, 1, { x: 16, y: 26 }, () => chest(true), CHEST_VIEW.scale, CHEST_VIEW.facing),
    ...pinned(scene, 'room_furnace', FURNACE.w, FURNACE.h, HALL_ANIM.furnace.frames, HALL_ANIM.furnace.rate, { x: FURNACE.ax, y: FURNACE.ay }, furnace, SMITHY_SCALE.furnace),
    ...pinned(scene, 'npc_smith', SMITH.w, SMITH.h, HALL_ANIM.smith.frames, HALL_ANIM.smith.rate, { x: SMITH.ax, y: SMITH.ay }, smith, SMITHY_SCALE.smith),
    ...still('room_weapons', 52, 40, { x: 26, y: 35 }, weaponRack),
    ...still('room_armor', 20, 44, { x: 10, y: 40 }, armorStand),
    ...pinned(scene, 'npc_witch', WITCH.w, WITCH.h, HALL_ANIM.witch.frames, HALL_ANIM.witch.rate, { x: WITCH.ax, y: WITCH.ay }, witch),
    ...still('room_shelves', 52, 52, { x: 26, y: 46 }, shelves),
  ];
}
