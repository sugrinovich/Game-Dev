import Phaser from 'phaser';
import { HERO_SHEET, TEXTURES, type PlayerDirection } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { COLORS, GAME } from '../configs/game';
import { ensureArrowTexture } from '../characters/Skeleton';
import { FONT_INK } from '../ui/PixelFont';
import { PText } from '../ui/PText';
import { poly, texture } from './CastleArt';
import { ball, box, cyl, drawModel, drawModelJobs, hiresTexture, hiresTextureJobs, M, modelSheetJobs, rod, stoneAt, textureResolution, yaw, type Masonry, type Model } from './CastleModels';
import { Effects, makeUtilityTextures } from './Effects';
import { gripOffset, heroModel, heroOrigin, ORB, type Build, type HeroAnimKind, type Outfit, type Pose } from './HeroArt';
import { CREST_RES, makeCrestTexture } from './IconArt';
import { makeFireballSheet } from './MobArt';
import { add, mul, norm, project, sub, type Axes, type Mark, type Paint, type Part, type Shade, type Surface, type Vec } from './Rig3D';
import { addOutline, ramp, type Ramp } from './Volume';

/*
 * Заставка «Осада Бездны» для загрузки и главного меню: ночь, круглый 3D-замок за кольцевым рвом, ворота с опущенным
 * мостом смотрят на восток; у моста — рыцарь в латах, с востока прёт орда (орки, огры, скелеты): лучники стреляют
 * по стенам, Короли Бездны мечут огненные шары. Небо, горы и поле — плоский фон; замок и рыцарь — 3D-модели
 * (Rig3D.ts), рисуются один раз при первом показе.
 */

const W = GAME.width;
const H = GAME.height;
const TAU = Math.PI * 2;

/** Слои заставки: фон, существа (по Y), огонь, затемнение, интерфейс. */
export const TITLE_DEPTH = { bg: -1000, fire: 400, vignette: 800, ui: 1000 } as const;

/** Расстановка и ритм сцены. Скорости — пиксели в секунду, время — секунды. */
const SIEGE = {
  horizon: 198,
  knight: { x: 140, y: 248 },
  kings: [{ x: 404, y: 214 }, { x: 458, y: 208 }],
  /** Короли смотрят на замок вполоборота — видно лицо-пустоту и сферу (kingTurn — тот же поворот модели в радианах). */
  kingFacing: 'down-left' as PlayerDirection,
  kingTurn: -Math.PI / 4,
  /** Пехота и лучники идут влево, к замку (поворот модели). */
  marchTurn: -Math.PI / 2,
  fireEvery: [2.2, 3.6] as const,
  fireFlight: 1.5,
  fireScale: 1.5,
  respawnX: 500,
  /** Пехота доходит до рыцаря и растворяется. */
  fadeX: [180, 215] as const,
  emberEvery: 0.05,
  /** Лучники встают на этом расстоянии (x) и стреляют по стенам: раз в every секунд, стрела летит flight секунд дугой высотой arc. */
  archers: { stopX: [292, 340] as const, every: [1.6, 3] as const, flight: [1, 1.4] as const, arc: 46 },
  /** Блики на воде рва. */
  sparkles: 10,
} as const;

type MarcherKind = 'orc' | 'ogre' | 'skeleton' | 'archer';

/**
 * Лист врага только для заставки: одна сторона, одна анимация (доля полного листа на 8 сторон) — рисуется первыми
 * заданиями загрузки (siegeTextureJobs); полные листы для игры рисуются этапами загрузки позже.
 * Ключ текстуры — он же ключ анимации.
 */
function splashKey(kind: MarcherKind | 'king', anim: HeroAnimKind): string { return `siege_${kind}_${anim}`; }
function splashJobs(scene: Phaser.Scene, kind: MarcherKind | 'king', anim: HeroAnimKind, facing: number): (() => void)[] {
  const key = splashKey(kind, anim);
  if (scene.textures.exists(key)) return [];
  const e = ENEMY_TYPES[kind], { build } = heroModel(e.outfit, e.body, anim, 0);
  const frames = anim === 'walk' ? HERO_SHEET.walkFrames : HERO_SHEET.idleFrames;
  const rate = anim === 'walk' ? build.walkRate : build.idleRate;
  return modelSheetJobs(scene, key, build.frame, build.frame, frames, rate, { x: build.frame / 2, y: build.ground }, (f) => heroModel(e.outfit, e.body, anim, f / frames), { facing, scale: GAME.resolution });
}
const MARCH_SPEED: Record<MarcherKind, number> = { orc: 16, ogre: 9, skeleton: 13, archer: 12 };
const HORDE: { kind: MarcherKind; x: number; y: number }[] = [
  { kind: 'orc', x: 330, y: 228 }, { kind: 'ogre', x: 365, y: 236 }, { kind: 'skeleton', x: 395, y: 232 },
  { kind: 'ogre', x: 470, y: 244 }, { kind: 'archer', x: 415, y: 250 }, { kind: 'orc', x: 300, y: 256 },
  { kind: 'skeleton', x: 350, y: 262 }, { kind: 'orc', x: 448, y: 263 }, { kind: 'archer', x: 470, y: 224 },
];

// ---------------- фон: небо, луна, горы, замок, поле ----------------
const SKY = [[11, 8, 24], [20, 13, 38], [34, 18, 46], [58, 22, 52], [92, 26, 48], [138, 42, 42], [192, 72, 42]] as const;
const SOIL = [[18, 12, 22], [26, 18, 30], [36, 22, 34], [52, 28, 36], [84, 36, 36]] as const;

/** Небо и земля (HD): градиенты — небо к багровому горизонту, зарево Бездны справа, земля с волнистым краем. */
function paintSkyAndSoil(c: CanvasRenderingContext2D): void {
  const rgb = (p: readonly number[], a = 1): string => `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
  // HD: небо — плавный градиент от тёмного верха к багровому краю у горизонта
  const sky = c.createLinearGradient(0, 0, 0, SIEGE.horizon);
  sky.addColorStop(0, rgb(SKY[0])); sky.addColorStop(0.55, rgb(SKY[1])); sky.addColorStop(0.85, rgb(SKY[2])); sky.addColorStop(1, rgb(SKY[3]));
  c.fillStyle = sky; c.fillRect(0, 0, W, SIEGE.horizon + 4);
  // зарево Бездны справа у горизонта — мягкое пятно (эллипс шире, чем выше)
  c.save(); c.translate(410, 205); c.scale(1.25, 0.72);
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, 230);
  glow.addColorStop(0, rgb(SKY[6], 0.85)); glow.addColorStop(0.25, rgb(SKY[5], 0.6)); glow.addColorStop(0.55, rgb(SKY[4], 0.25)); glow.addColorStop(1, rgb(SKY[4], 0));
  c.fillStyle = glow; c.fillRect(-400, -400, 800, 800); c.restore();
  // земля: волнистый край; к низу и вправо (к зареву) светлее
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) c.lineTo(x, SIEGE.horizon + Math.sin(x * 0.05) * 2);
  c.lineTo(W, H); c.closePath();
  const soil = c.createLinearGradient(0, SIEGE.horizon, 0, H);
  soil.addColorStop(0, rgb(SOIL[0])); soil.addColorStop(1, rgb(SOIL[2]));
  c.fillStyle = soil; c.fill();
  const warm = c.createLinearGradient(260, 0, W, 0);
  warm.addColorStop(0, rgb(SOIL[4], 0)); warm.addColorStop(1, rgb(SOIL[4], 0.5));
  c.fillStyle = warm; c.fill();
}

/** Мягкая точка (HD): звезда, камешек. */
function dotHD(c: CanvasRenderingContext2D, color: string, x: number, y: number, r: number): void {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

/** Предсказуемый «случайный» генератор: картинка одинаковая при каждом запуске. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function paintSky(c: CanvasRenderingContext2D): void {
  const rnd = seeded(7);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 330, y = rnd() * 130, bright = rnd() < 0.2;
    dotHD(c, bright ? '#ffffff' : '#b0a8d0', x, y, bright ? 0.6 : 0.4);
    if (rnd() < 0.08) { c.strokeStyle = 'rgba(160, 150, 200, 0.6)'; c.lineWidth = 0.25; c.beginPath(); c.moveTo(x - 1.6, y); c.lineTo(x + 1.6, y); c.moveTo(x, y - 1.6); c.lineTo(x, y + 1.6); c.stroke(); }
  }
  // луна (HD): мягкий ореол, диск освещён слева, кратеры
  const halo = c.createRadialGradient(78, 42, 12, 78, 42, 30);
  halo.addColorStop(0, 'rgba(232, 224, 200, 0.22)'); halo.addColorStop(1, 'rgba(232, 224, 200, 0)');
  c.fillStyle = halo; c.fillRect(40, 4, 80, 80);
  const disk = c.createLinearGradient(63, 42, 93, 42);
  disk.addColorStop(0, '#f0e8d2'); disk.addColorStop(0.6, '#e2d8c0'); disk.addColorStop(1, '#a89e88');
  c.fillStyle = disk; c.beginPath(); c.arc(78, 42, 15, 0, Math.PI * 2); c.fill();
  for (const [x, y, r] of [[72, 36, 3], [83, 47, 2], [76, 50, 1.2], [86, 35, 1.1]] as const) { dotHD(c, 'rgba(160, 150, 130, 0.55)', x, y, r); dotHD(c, 'rgba(255, 250, 235, 0.35)', x - r * 0.3, y - r * 0.3, r * 0.5); }
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
      if (x0! > 260 && y1! > y0!) { c.strokeStyle = rim; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0!, y0!); c.lineTo(x1!, y1!); c.stroke(); }   // подсвеченный склон
    }
  }
}

function paintField(c: CanvasRenderingContext2D): void {
  const rnd = seeded(21);
  c.lineCap = 'round';
  // кочки и пучки травы, тёмные пятна
  for (let i = 0; i < 60; i++) { const x = rnd() * W, y = SIEGE.horizon + 4 + rnd() * 66; c.strokeStyle = '#4a3438'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.6, y - 2); c.moveTo(x + 1, y); c.lineTo(x + 1.8, y - 1.5); c.stroke(); }
  for (let i = 0; i < 14; i++) { const x = rnd() * W, y = SIEGE.horizon + 8 + rnd() * 60; c.fillStyle = 'rgba(36, 26, 40, 0.8)'; c.beginPath(); c.ellipse(x, y, 3, 1.1, 0, 0, Math.PI * 2); c.fill(); }
  // огненные трещины — Бездна пробивается сквозь землю: светящиеся ломаные
  for (let k = 0; k < 6; k++) {
    let x = 290 + rnd() * 180, y = 210 + rnd() * 55;
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < 18; i++) { x -= 1 + rnd() * 1.6; y += (rnd() - 0.5) * 2.4; pts.push([x, y]); }
    c.save(); c.shadowColor = '#ff7a2a'; c.shadowBlur = 3;
    for (const [color, width] of [['#c83a1a', 1.2], ['#ffc060', 0.4]] as const) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); pts.forEach(([px0, py0], i) => (i ? c.lineTo(px0, py0) : c.moveTo(px0, py0))); c.stroke(); }
    c.restore();
  }
  // сломанные копья и порванный стяг на поле боя
  for (const [x, y] of [[236, 236], [262, 250], [282, 226]] as const) {
    c.strokeStyle = '#5a4030'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4, y - 12); c.stroke();
    c.fillStyle = '#9aa0a8'; c.beginPath(); c.moveTo(x + 3.4, y - 11); c.lineTo(x + 5.2, y - 14.5); c.lineTo(x + 4.8, y - 10.6); c.closePath(); c.fill();
  }
  poly(c, '#6a1a24', [[263, 238], [270, 240], [266, 244], [270, 247], [263, 246]]);
}

// ---------------- герб замка: на стягах, воротах, щите и сюрко рыцаря ----------------
const DEG = Math.PI / 180;
/** Материалы рыцаря и гербов: полированные латы (светлые даже в тени), золото, цвета герба, плащ, кожа, плюмаж. */
const KNIGHT_GEAR = {
  plate: ['#f4f8fc', '#c4ccd8', '#949eae', '#6a7484', '#464e5c'],
  plateDark: ['#b4bcc8', '#8a94a4', '#687282', '#4c5464', '#343a46'],
  gold: ['#fff4c4', '#f2d060', '#d4a644', '#a47a2c', '#6c4c1c'],
  red: ramp('#b02a3a'), blue: ramp('#2a4a92'), cape: ramp('#8e1c2c'), lining: ramp('#4a1222'),
  leather: ramp('#5a3a24'), plume: ramp('#e04040'), plumeTip: ramp('#f4f0e8'),
} as const satisfies Record<string, Ramp>;
/** Щели и проёмы — без светотени. */
const VOID = '#0e0a14';

/** Герб: четверти красная и синяя накрест и золотой крест. u — поперёк (−1 — левый край для зрителя), v — вверх (1 — верх). */
function heraldry(u: number, v: number): Ramp {
  if (Math.abs(u) < 0.13 || Math.abs(v - 0.25) < 0.12) return KNIGHT_GEAR.gold;
  return (u < 0) === (v > 0.25) ? KNIGHT_GEAR.red : KNIGHT_GEAR.blue;
}

/** Кайтовый щит: сверху прямой, книзу сходится в острие; золотые кайма и торец, внутри — герб. */
const shieldPaint: Paint = (s) => {
  const half = s.y > -0.15 ? 1 : (s.y + 1) / 0.85;
  if (Math.abs(s.x) > half) return null;
  if (Math.abs(s.z) < 0.9 || Math.abs(s.x) > half - 0.18 || s.y > 0.84) return KNIGHT_GEAR.gold;
  return heraldry(s.x, s.y);
};

/** Стяг: золотая кайма, герб, низ — «ласточкин хвост». */
const bannerPaint: Paint = (s) => {
  if (s.y < -0.7 && Math.abs(s.x) < (-0.7 - s.y) * 3.3) return null;
  if (Math.abs(s.x) > 0.84 || s.y > 0.9) return KNIGHT_GEAR.gold;
  return heraldry(s.x, s.y);
};

// ---------------- замок в 3D ----------------
/**
 * Круглый замок — 3D-модель на том же поле, что и орда; начало координат — центр замка на земле.
 * Вокруг — кольцевой ров в каменной обкладке; на цоколе — кольцо стен с зубцами и башни с черепичными конусами;
 * в центре — круглый донжон с башенкой, гербовым стягом и флагом. Надвратная башня с опущенным мостом смотрит
 * на восток, на орду; восточные грани — в алом зареве Бездны. Рисуется один раз.
 */
const CASTLE_VIEW = { facing: 0, pitch: 0.5 } as const;
/** Размер замка: пикселей игры на единицу модели. */
const CASTLE_SCALE = 1.15;
/** Текстура замка (пиксели игры) и где в ней центр замка; CASTLE_AT — куда центр встаёт на экране (на поле, ниже горизонта). */
const CASTLE_TEX = { w: 160, h: 152, ax: 80, ay: 112 } as const;
const CASTLE_AT = { x: 70, y: 212 } as const;
const CASTLE = {
  stone: '#5a5468', ember: '#6a3c50', top: '#6e687e', joint: '#1c1824', court: '#3a3240', wet: '#2a3236',
  bank: '#1e1624', trim: '#7a7488', iron: '#3a3844', wood: '#6a4a2e', glass: '#ffb050', mullion: '#6a3418',
} as const;
/** Черепица: два тона вперемежку (на восточных скатах — в зареве), тёмный нижний край каждого ряда. */
const ROOF = { tile: ['#5a2030', '#682838'], ember: ['#8a3040', '#9a3c4c'], edge: '#3a1424', rows: 10 } as const;
/** Кладка: камни мельче, чем у стен зала, — замок вдали; обкладка рва — один ряд крупных плит. */
const CASTLE_STONES: Masonry = { w: 6, h: 3, shift: 3, x0: 0, y0: 0, edge: 0.7, joint: CASTLE.joint };
/** Радиусы колец от центра: цоколь, вода рва, обкладка с бровкой; стена: середина, полутолщина, высота над цоколем, звенья. */
const RING = { plinth: 54, plinthH: 3, water: 62, kerb: 66, bank: 1.5, wall: 44, wallHalf: 2.2, wallH: 22, segments: 24 } as const;
/** Брусчатка двора. */
const COBBLES: Masonry = { w: 2.6, h: 2, shift: 1.3, x0: 0, y0: 0, edge: 0.4, joint: '#241e2a' };
const KERB_STONES: Masonry = { w: 4, h: RING.kerb - RING.bank - RING.water, shift: 0, x0: 0, y0: RING.water, edge: 0.6, joint: CASTLE.joint };
/**
 * Ворота: угол на кольце (0 — восток, к орде; π/2 — к зрителю) ровно на звене стены; полуширина и глубина надвратной
 * башни, её высота; полуширина и высота проёма до арки; боковые башни — смещение по углу, радиус, высота; мост — длина.
 */
const GATE = { angle: (4 * TAU) / RING.segments, half: 9, depth: 5, h: 36, open: 5, openH: 10, tower: 0.22, towerR: 6, towerH: 40, bridge: 16 } as const;
/** Башни на кольце: угол (градусы), радиус, высота стены и конуса крыши, есть ли светлое окно к зрителю. */
const TOWERS = [
  { deg: 133, r: 8.5, h: 34, roof: 18, window: true }, { deg: 200, r: 8, h: 38, roof: 19, window: true },
  { deg: 262, r: 8, h: 44, roof: 20, window: false }, { deg: 322, r: 8, h: 40, roof: 19, window: true },
] as const;
/** Донжон: центр, радиус, высота, крыша; башенка сбоку. */
const KEEP = { c: [-4, 0, -6] as Vec, r: 15, h: 64, roof: 26, turret: { deg: 150, r: 5, h: 76, roof: 14 } } as const;
const ORIGIN: Vec = [0, 0, 0];

interface TowerSpec { r: number; h: number; roof: number }
interface CastleWindow { p: Vec; a: number }

/** Точка на окружности радиуса r вокруг c на высоте y (угол a: 0 — восток, π/2 — к зрителю). */
function onRing(c: Vec, r: number, a: number, y: number): Vec { return [c[0] + r * Math.cos(a), y, c[2] + r * Math.sin(a)]; }
/** Оси бруска на окружности под углом a: его z смотрит наружу от центра, x — вдоль окружности. */
function outward(a: number): Axes { return yaw(Math.PI / 2 - a); }
/** Точка у ворот: r — от центра вдоль оси ворот, x — поперёк (вправо, если смотреть на ворота снаружи), y — высота. */
function gatePoint(r: number, x: number, y: number): Vec {
  const a = GATE.angle;
  return [r * Math.cos(a) + x * Math.sin(a), y, r * Math.sin(a) - x * Math.cos(a)];
}
function towerCenter(t: (typeof TOWERS)[number]): Vec { return onRing(ORIGIN, RING.wall, t.deg * DEG, 0); }
function turretCenter(): Vec { return onRing(KEEP.c, KEEP.r - 1, KEEP.turret.deg * DEG, 0); }
function cylWindow(c: Vec, r: number, deg: number, y: number): CastleWindow { return { p: onRing(c, r + 0.1, deg * DEG, y), a: deg * DEG }; }

/** Окна, в которых горит свет: мерцают поверх готовой картинки. */
const WINDOWS: readonly CastleWindow[] = [
  ...[62, 118].flatMap((d) => [20, 34, 48].map((y) => cylWindow(KEEP.c, KEEP.r, d, y))),
  cylWindow(KEEP.c, KEEP.r, 90, 54),
  cylWindow(turretCenter(), KEEP.turret.r, 120, 64),
  ...TOWERS.filter((t) => t.window).map((t) => cylWindow(towerCenter(t), t.r, 100, t.h * 0.72)),
  { p: gatePoint(RING.plinth + 0.1, 0, RING.plinthH + GATE.openH + 17), a: GATE.angle },
];
/** Факелы по сторонам ворот. */
const TORCHES: readonly Vec[] = [-1, 1].map((side) => gatePoint(RING.plinth + 1.2, side * (GATE.open + 2.6), RING.plinthH + GATE.openH + 1.5));

/** Камень грани: восточные грани в зареве. */
function stone(s: Surface, x: number, y: number, seed: number): Shade {
  return stoneAt(CASTLE_STONES, x, y, s.n[0] > 0.55 ? CASTLE.ember : CASTLE.stone, seed);
}
const merlonPaint: Paint = (s) => (s.y > 0.9 ? ramp(CASTLE.top) : ramp(s.n[0] > 0.55 ? CASTLE.ember : CASTLE.stone));

/** Ров: вода с лунной рябью (у дальнего берега — тень), обкладка из плит и земляная бровка; цоколь замка — мокрый у воды. */
function moatAndPlinth(parts: Part[]): void {
  const ring = (half: number, s: Surface): number => Math.hypot(s.x * half, s.z * half);
  parts.push(box([0, -1.6, 0], [RING.water, 0.8, RING.water], (s) => {
    const r = ring(RING.water, s), z = s.z * RING.water, x = s.x * RING.water;
    if (s.n[1] < 0.6 || r >= RING.water || r < RING.plinth - 1) return null;
    if (z < 0 && r > RING.water - 2.5) return '#101830';
    const w = Math.sin(x * 0.45 + z * 1.2) + Math.sin(x * 0.9 - z * 0.5) * 0.6;
    return w > 1.25 ? '#6a7aa8' : w > 0.7 ? '#2e3a64' : w < -1 ? '#141a36' : '#1c2448';
  }));
  parts.push(box([0, -0.4, 0], [RING.kerb, 0.4, RING.kerb], (s) => {
    const r = ring(RING.kerb, s);
    if (s.n[1] < 0.6 || r < RING.water || r >= RING.kerb) return null;
    if (r > RING.kerb - RING.bank) return ramp(CASTLE.bank);
    return stoneAt(KERB_STONES, Math.atan2(s.z, s.x) * r, r, CASTLE.stone, 5, -1);
  }));
  parts.push(box([0, RING.plinthH, 0], [RING.wall, 0.05, RING.wall], (s) => {
    const x = s.x * RING.wall, z = s.z * RING.wall;
    if (s.n[1] < 0.6 || Math.hypot(x, z) > RING.wall - 1) return null;
    return stoneAt(COBBLES, x, z, CASTLE.court, 7, -1);
  }));
  parts.push(cyl([0, -2.4, 0], [0, RING.plinthH, 0], RING.plinth, (s) => {
    if (s.n[1] > 0.6) return ramp(CASTLE.court);
    const y = -2.4 + ((s.y + 1) / 2) * (RING.plinthH + 2.4);
    return stoneAt(CASTLE_STONES, Math.atan2(s.z, s.x) * RING.plinth, y, y < 0.4 ? CASTLE.wet : s.n[0] > 0.55 ? CASTLE.ember : CASTLE.stone, 3);
  }));
}

/** Кольцо стены из звеньев: кладка, бойницы, светлый верх, по два зубца на звене; звено ворот пропущено; на фасаде — стяг. */
function curtainWall(parts: Part[]): void {
  const step = TAU / RING.segments, half = (RING.wall * step) / 2 + 0.3, mid = RING.plinthH + RING.wallH / 2, top = RING.plinthH + RING.wallH;
  for (let i = 0; i < RING.segments; i++) {
    const a = i * step;
    if (Math.abs(a - GATE.angle) < step / 2) continue;
    parts.push(box(onRing(ORIGIN, RING.wall, a, mid), [half, RING.wallH / 2, RING.wallHalf], (s) => {
      if (s.y > 0.95) return ramp(CASTLE.top);
      const y = mid + (s.y * RING.wallH) / 2;
      if (s.z > 0.95 && Math.abs(s.x) < 0.05 && y > RING.plinthH + 9 && y < RING.plinthH + 14) return VOID;
      return stone(s, RING.wall * a - s.x * half, y, 11);
    }, outward(a)));
    for (const k of [-0.25, 0.25]) parts.push(box(onRing(ORIGIN, RING.wall + RING.wallHalf * 0.5, a + k * step, top + 1.2), [1.7, 1.2, RING.wallHalf * 0.5], merlonPaint, outward(a + k * step)));
  }
  const a = 95 * DEG;
  parts.push(box(onRing(ORIGIN, RING.wall + RING.wallHalf + 0.3, a, top - 8), [2.8, 7, 0.2], bannerPaint, outward(a)));
}

/** Конус черепицы рядами с золотым шпилем; pennant — красный флажок на шпиле. */
function coneRoof(parts: Part[], c: Vec, r: number, y0: number, h: number, pennant: boolean): void {
  for (let k = 0; k < ROOF.rows; k++) {
    const rk = r * (1 - k / ROOF.rows) + 0.25, n = Math.max(5, Math.round((TAU * rk) / 2.2)), ya = y0 + (k * h) / ROOF.rows;
    parts.push(cyl([c[0], ya, c[2]], [c[0], ya + h / ROOF.rows, c[2]], rk, (s) => {
      if (s.y < -0.45) return ramp(ROOF.edge);
      const col = Math.floor(((Math.atan2(s.z, s.x) + Math.PI) / TAU) * n + (k % 2) * 0.5);
      return ramp((s.n[0] > 0.55 ? ROOF.ember : ROOF.tile)[col % 2]!);
    }));
  }
  const tip = y0 + h;
  parts.push(ball([c[0], tip + 0.6, c[2]], [0.9, 1.2, 0.9], KNIGHT_GEAR.gold), rod([c[0], tip, c[2]], [c[0], tip + 4.5, c[2]], 0.25, KNIGHT_GEAR.gold));
  if (pennant) parts.push(box([c[0] + 2, tip + 3.6, c[2]], [2, 0.9, 0.15], (s) => (Math.abs(s.y) > 1 - (s.x + 1) / 2 ? null : KNIGHT_GEAR.red)));
}

/** Круглая башня: кладка по кругу с бойницами, пояс машикулей (тёмные проёмы между консолями), зубцы, крыша. */
function roundTower(parts: Part[], c: Vec, t: TowerSpec, seed: number, pennant = true): void {
  const [x, , z] = c, belt = t.r + 1.4, top = t.h + 3, slit = Math.PI / 3;
  parts.push(cyl([x, -1, z], [x, t.h, z], t.r, (s) => {
    const a = Math.atan2(s.z, s.x), y = -1 + ((s.y + 1) / 2) * (t.h + 1), k = Math.round(a / slit);
    if (Math.abs(a - k * slit) * t.r < 0.45 && y > t.h * (k % 2 ? 0.3 : 0.55) && y < t.h * (k % 2 ? 0.4 : 0.65)) return VOID;
    return stone(s, a * t.r, y, seed);
  }));
  const corbels = Math.round((TAU * belt) / 2);
  parts.push(cyl([x, t.h, z], [x, top, z], belt, (s) => {
    if (s.y > 0.95) return ramp(CASTLE.top);
    const a = Math.atan2(s.z, s.x);
    if (s.y < -0.35 && Math.floor(((a + Math.PI) / TAU) * corbels) % 2 === 0) return VOID;
    return ramp(s.n[0] > 0.55 ? CASTLE.ember : CASTLE.trim);
  }));
  const n = Math.round((TAU * belt) / 3.4);
  for (let j = 0; j < n; j++) { const b = (j / n) * TAU; parts.push(box(onRing(c, belt - 0.55, b, top + 1.2), [0.95, 1.2, 0.55], merlonPaint, outward(b))); }
  if (t.roof > 0) coneRoof(parts, c, t.r + 0.9, top - 0.5, t.roof, pennant);
}

/** Надвратная башня: арка с клинчатыми камнями, тёмный проезд, полуподнятая решётка, герб над аркой, факелы, зубцы; мост на цепях. */
function gatehouse(parts: Part[]): void {
  const a = GATE.angle, ax = outward(a), mid = (GATE.h - 1) / 2, floor = RING.plinthH, arch = floor + GATE.openH;
  for (const side of [-1, 1]) roundTower(parts, onRing(ORIGIN, RING.plinth - GATE.towerR, a + side * GATE.tower, 0), { r: GATE.towerR, h: GATE.towerH, roof: 0 }, 30 + side);
  parts.push(box(gatePoint(RING.plinth - GATE.depth, 0, mid), [GATE.half, mid + 1, GATE.depth], (s) => {
    if (s.y > 0.97) return ramp(CASTLE.top);
    const x = s.x * GATE.half, y = mid + s.y * (mid + 1);
    if (s.z > 0.95 && Math.abs(x) < GATE.open && y > floor && y < arch + Math.sqrt(Math.max(0, GATE.open ** 2 - x * x))) return null;
    return stone(s, Math.abs(s.z) > 0.95 ? x : s.z * GATE.depth, y, 31);
  }, ax));
  parts.push(box(gatePoint(RING.plinth - 1.4, 0, arch), [GATE.open, GATE.openH, 0.3], () => VOID, ax));
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * Math.PI, r = GATE.open + 0.7;
    parts.push(ball(gatePoint(RING.plinth + 0.1, r * Math.cos(t), arch + r * Math.sin(t)), [1.05, 0.85, 0.45], ramp(k % 2 ? CASTLE.trim : CASTLE.top), ax));
  }
  const low = floor + GATE.openH * 0.45, high = arch + GATE.open;
  for (let x = -4; x <= 4; x += 2) parts.push(rod(gatePoint(RING.plinth - 0.7, x, low), gatePoint(RING.plinth - 0.7, x, high), 0.35, ramp(CASTLE.iron)));
  for (const y of [low + 1, low + 4]) parts.push(rod(gatePoint(RING.plinth - 0.6, -GATE.open, y), gatePoint(RING.plinth - 0.6, GATE.open, y), 0.3, ramp(CASTLE.iron)));
  parts.push(box(gatePoint(RING.plinth + 0.25, 0, arch + GATE.open + 4), [2.4, 3, 0.25], shieldPaint, ax));
  for (let x = -GATE.half + 1; x <= GATE.half - 1; x += 3.2) parts.push(box(gatePoint(RING.plinth - 0.6, x, GATE.h + 1.2), [0.95, 1.2, 0.6], merlonPaint, ax));
  for (const p of TORCHES) {
    parts.push(rod(add(p, mul(ax[2], -1)), add(p, [0, -1.2, 0]), 0.3, ramp(CASTLE.iron)));
    parts.push(ball(add(p, [0, 0.6, 0]), [0.7, 1.1, 0.7], () => '#ffd060'), ball(add(p, [0, 1.5, 0]), [0.4, 0.7, 0.4], () => '#ff8a2a'));
  }
  // опущенный мост: доски поперёк, две железные полосы вдоль; цепи от башни к краю моста
  const end = RING.plinth + GATE.bridge, w = GATE.open - 0.4;
  parts.push(box(gatePoint(RING.plinth + GATE.bridge / 2, 0, 0.3), [w, 0.45, GATE.bridge / 2], (s) => {
    if (s.y < 0.9) return ramp(CASTLE.bank);
    if (Math.abs(Math.abs(s.x) - 0.7) < 0.07) return ramp(CASTLE.iron);
    return ((s.z + 1) * GATE.bridge) % 1.6 < 0.25 ? '#2a1a10' : ramp(CASTLE.wood);
  }, ax));
  for (const side of [-1, 1]) {
    const from = gatePoint(RING.plinth + 0.3, side * w, arch + 4), to = gatePoint(end - 0.5, side * w, 0.9);
    parts.push(rod(from, to, 0.3, (s) => (Math.floor((s.y + 1) * 9) % 2 ? ramp(CASTLE.iron) : ramp(CASTLE.trim))));
  }
}

/** Донжон с башенкой, гербовый стяг на перекладине и флаг с гербом на шпиле. */
function keep(parts: Part[]): void {
  roundTower(parts, KEEP.c, KEEP, 40, false);
  roundTower(parts, turretCenter(), KEEP.turret, 41);
  const a = 90 * DEG;
  parts.push(box(onRing(KEEP.c, KEEP.r + 0.5, a, 32), [3.4, 11, 0.2], bannerPaint, outward(a)));
  parts.push(rod(onRing(KEEP.c, KEEP.r + 0.8, a - 0.27, 43.3), onRing(KEEP.c, KEEP.r + 0.8, a + 0.27, 43.3), 0.35, KNIGHT_GEAR.gold));
  const tip = KEEP.h + 2.5 + KEEP.roof, [x, , z] = KEEP.c;
  parts.push(cyl([x, tip, z], [x, tip + 12, z], 0.45, ramp(CASTLE.iron)));
  parts.push(box([x + 4, tip + 9.6, z], [4, 2.4, 0.2], (s) => heraldry(s.x, s.y + 0.25)));
}

/** Окно: каменная арка-наличник и светлое стекло с переплётом. */
function windowParts(parts: Part[], w: CastleWindow): void {
  const ax = outward(w.a);
  const arched = (s: Surface): boolean => s.y < 0.35 || Math.abs(s.x) < Math.sqrt(Math.max(0, 1 - ((s.y - 0.35) / 0.65) ** 2));
  parts.push(box(w.p, [1.6, 2.3, 0.2], (s) => (arched(s) ? ramp(CASTLE.trim) : null), ax));
  parts.push(box(add(w.p, mul(ax[2], 0.15)), [1.1, 1.8, 0.2], (s) => {
    if (!arched(s)) return null;
    return Math.abs(s.x) < 0.16 || Math.abs(s.y + 0.1) < 0.1 ? CASTLE.mullion : CASTLE.glass;
  }, ax));
}

/** Весь замок: ров и цоколь, кольцо стен, ворота с мостом, башни, донжон, светлые окна. */
function castleModel(): Model {
  const parts: Part[] = [];
  moatAndPlinth(parts);
  curtainWall(parts);
  gatehouse(parts);
  TOWERS.forEach((t, i) => roundTower(parts, towerCenter(t), t, 20 + i));
  keep(parts);
  for (const w of WINDOWS) windowParts(parts, w);
  return { parts };
}

/** Где на экране точка модели замка. */
function castleScreen(p: Vec): { x: number; y: number } {
  const q = project(p, CASTLE_VIEW.facing, CASTLE_VIEW.pitch);
  return { x: CASTLE_AT.x + q.x * CASTLE_SCALE, y: CASTLE_AT.y + q.y * CASTLE_SCALE };
}

/** Случайная точка на стене, донжоне, надвратной или передней башне — куда летят стрелы и огненные шары. */
function castleTarget(): { x: number; y: number } {
  const k = Math.random(), f = Phaser.Math.FloatBetween;
  if (k < 0.35) return castleScreen(onRing(ORIGIN, RING.wall + RING.wallHalf, f(50, 125) * DEG, f(8, RING.plinthH + RING.wallH)));
  if (k < 0.65) return castleScreen(onRing(KEEP.c, KEEP.r, f(50, 130) * DEG, f(15, KEEP.h)));
  if (k < 0.85) return castleScreen(gatePoint(RING.plinth, f(-GATE.half, GATE.half), f(16, GATE.h)));
  const t = TOWERS[Math.random() < 0.5 ? 0 : 1];
  return castleScreen(onRing(towerCenter(t), t.r, f(70, 130) * DEG, f(10, t.h)));
}

// ---------------- рыцарь в 3D ----------------
/**
 * Рыцарь — кукла героя (Rig3D) в латах поверх кольчуги: шлем-ведро, сюрко с гербом замка, пояс и ножны,
 * плащ, кайтовый щит, меч. Крупнее героя в KNIGHT.scale раз.
 */
const KNIGHT = { frames: 12, rate: 8, scale: 1.6, w: 52, h: 68, ax: 26, ay: 64, facing: 0.75 } as const;
/** Щит развёрнут к зрителю (поворот в модели — против поворота рыцаря). */
const SHIELD_YAW = 0.3 - KNIGHT.facing;
const KNIGHT_OUTFIT: Outfit = { body: 'chainmail', legs: 'greaves', hands: 'gloves', weapon: 'sword' };

function along(a: Vec, b: Vec, k: number): Vec { return add(a, mul(sub(b, a), k)); }
/** Латы с золотой кромкой: у капсулы y идёт вдоль кости (−1 — начало, 1 — конец). */
function plateEdge(edge: number): Paint { return (s) => (edge > 0 ? s.y > edge : s.y < edge) ? KNIGHT_GEAR.gold : KNIGHT_GEAR.plate; }

/** Латы: наплечники в два ряда, налокотники, наручи, латные перчатки; набедренники, наколенники, поножи, башмаки из пластин. */
function plateArmor(parts: Part[], marks: Mark[], P: Pose, B: Build): void {
  const G = KNIGHT_GEAR;
  P.arms.forEach((arm, i) => {
    const side = i === 0 ? -1 : 1;
    parts.push(ball(add(arm.a, [side * 0.4, 0.6, 0]), [1.9, 1.4, 2.0], plateEdge(-0.5)), ball(add(arm.a, [side * 0.7, -0.4, 0]), [1.7, 1.0, 1.8], plateEdge(-0.4)));
    parts.push(ball(arm.b, [1.35, 1.35, 1.35], G.plate));
    parts.push(rod(along(arm.b, arm.c, 0.2), along(arm.b, arm.c, 0.85), B.arm.r[1] * 1.3, plateEdge(0.7)));
    parts.push(ball(add(arm.c, mul(norm(sub(arm.c, arm.b)), B.arm.hand * 0.4)), [1.5, 1.5, 1.5], G.plate));
    marks.push({ p: add(arm.a, [side * 0.4, 2.0, 0]), color: '#fff4c4', n: [0, 1, 0] });
  });
  for (const leg of P.legs) {
    parts.push(rod(along(leg.a, leg.b, 0.25), along(leg.a, leg.b, 0.9), B.leg.r[0] * 1.15, plateEdge(0.75)));
    parts.push(ball(add(leg.b, [0, 0, 0.5]), [1.6, 1.5, 1.4], G.plate));
    marks.push({ p: add(leg.b, [0, 0, 1.95]), color: '#f2d060', n: [0, 0, 1] });
    parts.push(rod(along(leg.b, leg.c, 0.15), along(leg.b, leg.c, 0.85), B.leg.r[1] * 1.3, plateEdge(-0.75)));
    parts.push(ball(add(leg.c, [0, 0.1, B.leg.toe + 0.2]), mul(B.leg.foot, 1.15), (s) => (Math.floor((s.z + 1) * 2.5) % 2 ? G.plate : G.plateDark)));
  }
}

/** Сюрко с гербом замка: грудь и спина, золотые кайма и крест, юбка в три яруса с разрезом; кожаный пояс с пряжкой, ножны. */
function surcoat(parts: Part[], P: Pose, B: Build): void {
  const G = KNIGHT_GEAR, R = B.torso.r, [cx, , cz] = P.chest;
  parts.push(ball(P.chest, [R[0] * 1.08, R[1], R[2] * 1.14], (s) => {
    if (s.y > 0.62 || Math.abs(s.x) > 0.9) return null;
    if (s.y > 0.5 || Math.abs(s.x) > 0.8) return G.gold;
    return heraldry(s.z > 0 ? s.x : -s.x, s.y);
  }));
  const waist = P.chest[1] - R[1] * 0.55, hem = P.legs[0].b[1] + 1, tier = (waist - hem) / 3;
  for (let k = 0; k < 3; k++) {
    const y1 = waist - k * tier;
    parts.push(cyl([cx, y1 - tier, cz], [cx, y1, cz], 3.3 + k * 0.3, (s) => {
      if (k === 2 && s.n[2] > 0.9 && Math.abs(s.n[0]) < 0.14) return null;
      if (k === 2 && s.y < -0.55) return G.gold;
      return heraldry(s.n[2] > 0 ? s.n[0] : -s.n[0], -0.5);
    }));
  }
  parts.push(ball([cx, waist, cz], [R[0] * 0.95, 0.6, R[2] * 1.05], (s) => (s.z > 0.8 && Math.abs(s.x) < 0.14 ? G.gold : G.leather)));
  const hip = add(P.pelvis, [B.pelvis[0] * 1.1, 0.8, -0.6]);
  parts.push(rod(hip, add(hip, [0.6, -6.3, -1.8]), 0.55, (s) => (s.y > 0.8 || s.y < -0.85 ? G.gold : G.leather)));
}

/**
 * Шлем-ведро: смотровая щель, золотой крест на лице, обод и кромка, дыхательные отверстия; купол с гребнем; плюмаж колышется.
 * HELM — радиус (доля головы; шире волос куклы, иначе они торчат), верх ведра и высота купола (доли высоты головы).
 */
const HELM = { r: 1.12, top: 0.5, dome: 0.68 } as const;
function greatHelm(parts: Part[], marks: Mark[], P: Pose, B: Build, t: number): void {
  const G = KNIGHT_GEAR, r = B.head.r[0] * HELM.r, h = B.head.r[1];
  const bottom = add(P.head, [0, -h * 0.9, 0]), top = add(P.head, [0, h * HELM.top, 0]);
  parts.push(cyl(bottom, top, r, (s) => {
    const face = s.n[2] > 0.25;
    if (face && Math.abs(s.n[0]) < 0.1 && s.y < 0.55) return G.gold;
    if (face && s.y > 0.08 && s.y < 0.3) return VOID;
    return s.y > 0.8 || s.y < -0.85 ? G.gold : G.plate;
  }));
  parts.push(ball(top, [r, h * HELM.dome, r], (s) => (Math.abs(s.x) < 0.1 ? G.gold : G.plate)));
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + 0.45 + (i % 3) * 0.17, y = -h * 0.35 - Math.floor(i / 3) * 0.8;
    marks.push({ p: add(P.head, [Math.cos(a) * r * 1.02, y, Math.sin(a) * r * 1.02]), color: VOID, n: [Math.cos(a), 0, Math.sin(a)] });
  }
  const crown = top[1] + h * HELM.dome + 0.3;
  for (let i = 0; i < 5; i++) {
    const p: Vec = [P.head[0], crown + 0.2 - i * 0.3 + Math.sin(t + i) * 0.25, P.head[2] - 0.3 - i * 1.15];
    parts.push(ball(p, [1.25 - i * 0.12, 1.15 - i * 0.1, 1.3], i === 0 ? G.plumeTip : G.plume));
  }
}

/** Плащ: накидка на плечах, полотнища за спиной волной (изнанка тёмная, по низу золотая кайма), золотые застёжки. */
function cape(parts: Part[], P: Pose, B: Build, t: number): void {
  const G = KNIGHT_GEAR, R = B.torso.r;
  const top = P.chest[1] + R[1] * 0.75, bottom = P.legs[0].b[1] - 1.2, back = P.chest[2] - R[2] - 0.8;
  const cloth: Paint = (s) => (s.y < -0.86 ? G.gold : s.n[2] > 0.3 ? G.lining : G.cape);
  for (let i = 0; i < 6; i++) {
    const ph = i * 1.1 + t;
    parts.push(box([-4 + i * 1.6, (top + bottom) / 2, back - Math.sin(ph) * 0.5], [0.9, (top - bottom) / 2, 0.35], cloth, yaw(Math.cos(ph) * 0.4)));
  }
  parts.push(ball(add(P.chest, [0, R[1] * 0.5, -0.4]), [R[0] * 1.18, 1.7, R[2] * 1.15], (s) => (s.z > 0.35 ? null : G.cape)));
  for (const x of [-1, 1]) parts.push(ball(add(P.chest, [x * 2.4, R[1] * 0.62, R[2] * 0.8]), [0.6, 0.6, 0.5], G.gold));
}

/** Щит в левой руке: герб замка, золотой умбон на перекрестье, заклёпки по кайме. */
function knightShield(parts: Part[], marks: Mark[], P: Pose): void {
  const axes = yaw(SHIELD_YAW), half: Vec = [3.3, 4.6, 0.5], c = add(P.arms[1].c, [1.2, 0.6, 2.4]);
  const face = (x: number, y: number, out: number): Vec => add(add(add(c, mul(axes[0], x * half[0])), mul(axes[1], y * half[1])), mul(axes[2], out));
  parts.push(box(c, half, shieldPaint, axes));
  parts.push(ball(face(0, 0.25, 0.5), [0.75, 0.75, 0.45], KNIGHT_GEAR.gold, axes));
  for (const [x, y] of [[-0.9, 0.7], [0.9, 0.7], [-0.9, 0.05], [0.9, 0.05], [-0.5, -0.5], [0.5, -0.5], [0, 0.92]] as const) {
    marks.push({ p: face(x, y, 0.55), color: '#fff4c4', n: axes[2] });
  }
}

function knightModel(f: number): Model {
  const p = f / KNIGHT.frames, t = p * TAU;
  const { parts, marks, pose: P, build: B } = heroModel(KNIGHT_OUTFIT, 'human', 'idle', p);
  plateArmor(parts, marks, P, B);
  surcoat(parts, P, B);
  greatHelm(parts, marks, P, B, t);
  cape(parts, P, B, t);
  knightShield(parts, marks, P);
  // блик бежит по клинку
  const k = (p * 1.6) % 1.6;
  if (k < 1) marks.push({ p: add(P.grip.at, mul(P.grip.up, 3 + k * 9)), color: '#ffffff' }, { p: add(P.grip.at, mul(P.grip.up, 2.4 + k * 9)), color: '#fff0a0' });
  return { parts, marks };
}

/** Листы врагов заставки: король парит, пехота идёт, лучник стоит и стреляет. */
const SPLASH: [MarcherKind | 'king', HeroAnimKind, number][] = [
  ['king', 'idle', SIEGE.kingTurn], ...(['orc', 'ogre', 'skeleton', 'archer'] as const).map((k): [MarcherKind, HeroAnimKind, number] => [k, 'walk', SIEGE.marchTurn]),
  ['archer', 'idle', SIEGE.marchTurn],
];

/**
 * Тяжёлые текстуры заставки (небо, замок, рыцарь, орда, огненный шар) — по заданиям: экран загрузки показывается
 * сразу, а сцена осады проявляется, когда готова (иначе первый кадр ждал бы больше секунды). Готовое пропускается.
 */
export function siegeTextureJobs(scene: Phaser.Scene): (() => void)[] {
  const has = (key: string): boolean => scene.textures.exists(key), R = GAME.resolution, w = CASTLE_TEX.w * R, h = CASTLE_TEX.h * R;
  return [
    ...(has('siege_bg') ? [] : [() => texture(scene, 'siege_bg', W, H, (c) => { paintSkyAndSoil(c); paintSky(c); paintField(c); }, false, true)]),
    ...hiresTextureJobs(scene, 'siege_castle', CASTLE_TEX.w, CASTLE_TEX.h, (ctx) => [
      ...drawModelJobs(ctx, 0, 0, CASTLE_TEX.w, CASTLE_TEX.h, { x: CASTLE_TEX.ax, y: CASTLE_TEX.ay }, castleModel, { ...CASTLE_VIEW, scale: R * CASTLE_SCALE }),
      () => addOutline(ctx(), w, h, w, h),
    ]),
    ...(has('title_knight') ? [] : modelSheetJobs(scene, 'title_knight', KNIGHT.w, KNIGHT.h, KNIGHT.frames, KNIGHT.rate, { x: KNIGHT.ax, y: KNIGHT.ay }, knightModel, { facing: KNIGHT.facing, scale: R * KNIGHT.scale })),
    () => makeFireballSheet(scene), () => ensureArrowTexture(scene),
    ...SPLASH.flatMap(([kind, anim, facing]) => splashJobs(scene, kind, anim, facing)),
  ];
}

/** Лёгкое для первого кадра заставки: точки, сияние, тень, герб, затемнение краёв. Повторный вызов ничего не делает. */
export function makeTitleBasics(scene: Phaser.Scene): void {
  makeUtilityTextures(scene);
  makeCrestTexture(scene);
  if (scene.textures.exists('title_vignette')) return;
  // затемнение по краям экрана (раньше — картинка title_vignette.png)
  texture(scene, 'title_vignette', W, H, (c) => {
    // HD: плавное затемнение от середины к краям (эллипс по размеру экрана)
    c.save(); c.translate(W / 2, H / 2); c.scale(W / 2, H / 2);
    const g = c.createRadialGradient(0, 0, 0.6, 0, 0, 1.25);
    g.addColorStop(0, 'rgba(8, 6, 16, 0)'); g.addColorStop(1, 'rgba(8, 6, 16, 1)');
    c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
  }, false, true);
}

// ---------------- логотип ----------------
/**
 * Логотип сверху вниз: герб, название, золотая черта с камнем, девиз. Зазоры между ними и от верха экрана одинаковые (gap)
 * и считаются по самим буквам (FONT_INK), а не по строке шрифта; название покачивается вниз на bob — черта ниже его самой
 * нижней точки. crestHalf — половина видимой высоты герба; outline — контур названия над буквами;
 * длинное название уменьшается до ширины экрана без margin по краям.
 */
const LOGO = { gap: 4, crestHalf: 21, titleScale: 2, bob: 2, outline: 1, margin: 16 } as const;
/** Черта под названием — 3D-модель: кадр (пиксели игры), половина высоты прутьев (ромб посередине выступает), наклон камеры (почти анфас). */
const DIVIDER = { key: 'title_divider', w: 236, h: 14, half: 2.5, pitch: 0.3, bar: 104 } as const;

/** Черта: два золотых прута, сужающихся к шарикам на концах; посередине — золотой ромб с рубином и бусины по бокам. */
function dividerModel(): Model {
  const ruby = ramp('#c83040'), parts: Part[] = [
    box([0, 0, 0], [3.3, 3.3, 1.3], M.gold, [[Math.SQRT1_2, Math.SQRT1_2, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0], [0, 0, 1]]),
    ball([0, 0, 1.2], [1.7, 1.7, 1.2], ruby),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      ball([side * 6.6, 0, 0], [1.3, 1.3, 1.3], M.goldBright),
      rod([side * 9, 0, 0], [side * (DIVIDER.bar - 30), 0, 0], 0.95, M.gold),
      rod([side * (DIVIDER.bar - 30), 0, 0], [side * DIVIDER.bar, 0, 0], 0.6, M.gold),
      ball([side * (DIVIDER.bar + 1.4), 0, 0], [1.4, 1.4, 1.4], M.goldBright),
    );
  }
  return { parts, marks: [{ p: [-0.6, 0.7, 2.3], color: '#ffd0d8', n: [0, 0, 1] }] };
}

function makeDividerTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DIVIDER.key)) return;
  const { w, h } = DIVIDER, R = GAME.resolution;
  hiresTexture(scene, DIVIDER.key, w, h, (c) => {
    drawModel(c, 0, 0, w, h, { x: w / 2, y: h / 2 }, dividerModel(), { pitch: DIVIDER.pitch });
    addOutline(c, w * R, h * R, w * R, h * R);
  });
}

/** Герб, название и девиз — одинаковые на загрузке и в меню. Возвращает Y под логотипом (с зазором). */
export function addTitleLogo(scene: Phaser.Scene): number {
  const d = TITLE_DEPTH.ui, ink = FONT_INK.title, gap = LOGO.gap;
  const crestY = gap + LOGO.crestHalf;
  const title = new PText(scene, W / 2, 0, GAME.title, { font: 'title', ax: 0.5, ay: 0, color: COLORS.blade, shine: true });
  const scale = Math.min(LOGO.titleScale, (W - LOGO.margin * 2) / title.textWidth);
  // верх контура букв — на gap ниже герба
  title.setScale(scale).setY(crestY + LOGO.crestHalf + gap + LOGO.outline - ink.top * scale);
  const titleBottom = title.y + ink.bottom * scale + LOGO.bob;
  // золотое сияние за гербом и тёплый ореол за названием — мягко дышат
  const crestGlow = scene.add.image(W / 2, crestY, TEXTURES.glow).setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.32).setDepth(d - 1);
  const titleGlow = scene.add.image(W / 2, title.y + ink.center * scale, TEXTURES.glow).setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(6.5, 1.1).setAlpha(0.22).setDepth(d - 1);
  scene.tweens.add({ targets: [crestGlow, titleGlow], alpha: '-=0.12', duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.add.image(W / 2, crestY, 'title_crest').setScale(1 / CREST_RES).setDepth(d);
  const bobbing = scene.add.container(0, 0, [title]).setDepth(d);
  scene.tweens.add({ targets: bobbing, y: LOGO.bob, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  makeDividerTexture(scene);
  const lineY = titleBottom + gap + DIVIDER.half;
  scene.add.image(W / 2, lineY, DIVIDER.key).setScale(1 / GAME.resolution).setDepth(d);
  const subTop = lineY + DIVIDER.half + gap - FONT_INK.ui.top;
  new PText(scene, W / 2, subTop, GAME.subtitle, { ax: 0.5, color: COLORS.text, shine: true }).setDepth(d);
  return subTop + FONT_INK.ui.bottom + gap;
}

// ---------------- живая сцена ----------------
/** Пехота идёт до рыцаря; лучник встаёт на stopX и стреляет по стенам (shotIn — секунд до выстрела). */
interface Marcher { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; speed: number; fadeX: number; idle: string | null; stopX: number | null; shotIn: number }
interface Arrow { sprite: Phaser.GameObjects.Image; from: Phaser.Math.Vector2; to: Phaser.Math.Vector2; t: number; flight: number }
interface Fireball { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; t: number; from: Phaser.Math.Vector2; ctrl: Phaser.Math.Vector2; to: Phaser.Math.Vector2 }

/** Фон заставки: рисует текстуры (один раз), расставляет замок, рыцаря и орду и оживляет их каждый кадр. */
export class SiegeBackdrop {
  private readonly fx: Effects;
  private readonly marchers: Marcher[] = [];
  private readonly arrows: Arrow[] = [];
  private readonly kings: Phaser.GameObjects.Sprite[] = [];
  private fireball: Fireball | null = null;
  private fireIn = 1;
  private emberT = 0;
  private auraT = 0;
  private readonly pos = new Phaser.Math.Vector2();

  constructor(private readonly scene: Phaser.Scene) {
    makeTitleBasics(scene);
    for (const job of siegeTextureJobs(scene)) job();   // в меню всё уже готово — заданий нет
    this.fx = new Effects(scene);
    const R = GAME.resolution;
    scene.add.image(0, 0, 'siege_bg').setOrigin(0, 0).setScale(1 / GAME.resolution).setDepth(TITLE_DEPTH.bg);
    const riftGlow = scene.add.image(429, 160, TEXTURES.glow).setTint(0xa040ff).setBlendMode(Phaser.BlendModes.ADD).setScale(3, 5).setAlpha(0.35).setDepth(TITLE_DEPTH.bg + 1);
    scene.tweens.add({ targets: riftGlow, alpha: 0.2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(CASTLE_AT.x - CASTLE_TEX.ax, CASTLE_AT.y - CASTLE_TEX.ay, 'siege_castle').setOrigin(0, 0).setScale(1 / R).setDepth(TITLE_DEPTH.bg + 2);
    this.addCastleLights();
    for (const k of SIEGE.kings) this.addKing(k.x, k.y);
    for (const h of HORDE) this.addMarcher(h.kind, h.x, h.y);
    scene.add.image(SIEGE.knight.x, SIEGE.knight.y, TEXTURES.shadow).setScale(1.3, 0.8).setDepth(SIEGE.knight.y - 1);
    scene.add.sprite(SIEGE.knight.x, SIEGE.knight.y, 'title_knight', '0').setOrigin(KNIGHT.ax / KNIGHT.w, KNIGHT.ay / KNIGHT.h).setScale(1 / R).setDepth(SIEGE.knight.y).play('title_knight');

    const onUpdate = (_t: number, delta: number): void => this.update(Math.min(delta, 50) / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate); this.fx.clear(); });
  }

  /** Окна замка и факелы у ворот мерцают тёплым светом, по воде рва пробегают лунные блики. */
  private addCastleLights(): void {
    const d = TITLE_DEPTH.bg + 3;
    const flicker = (p: Vec, scale: number, alpha: number): void => {
      const { x, y } = castleScreen(p);
      const glow = this.scene.add.image(x, y, TEXTURES.glow).setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha).setDepth(d);
      this.scene.tweens.add({ targets: glow, alpha: alpha * 0.45, duration: Phaser.Math.Between(260, 700), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 600), ease: 'Sine.easeInOut' });
    };
    for (const w of WINDOWS) flicker(w.p, 0.5, 0.45);
    for (const t of TORCHES) flicker(t, 0.9, 0.6);
    for (let i = 0; i < SIEGE.sparkles; i++) {
      const spark = this.scene.add.image(0, 0, TEXTURES.px).setTint(0xc8d8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(d);
      const move = (): void => {
        const { x, y } = castleScreen(onRing(ORIGIN, Phaser.Math.FloatBetween(RING.plinth + 1.5, RING.water - 1), Phaser.Math.FloatBetween(45, 170) * DEG, -0.8));
        spark.setPosition(Math.round(x), Math.round(y)).setScale(Phaser.Math.FloatBetween(0.5, 1), 0.5);
      };
      move();
      this.scene.tweens.add({ targets: spark, alpha: 0.9, duration: 500, yoyo: true, repeat: -1, delay: i * 330, repeatDelay: Phaser.Math.Between(300, 1400), onRepeat: move });
    }
  }

  private addKing(x: number, y: number): void {
    const glow = this.scene.add.image(x, y - 30, TEXTURES.glow).setTint(0x8a3aff).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 3).setAlpha(0.3).setDepth(y - 2);
    const key = splashKey('king', 'idle'), o = heroOrigin(ENEMY_TYPES.king.body);
    const king = this.scene.add.sprite(x, y, key, '0').setOrigin(o.x, o.y).setScale(1 / GAME.resolution).setDepth(y).play(key);
    king.anims.setProgress(Math.random());
    this.scene.tweens.add({ targets: [king, glow], y: '-=4', duration: 1600 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.kings.push(king);
  }

  private addMarcher(kind: MarcherKind, x: number, y: number): void {
    const key = splashKey(kind, 'walk'), o = heroOrigin(ENEMY_TYPES[kind].body);
    const sprite = this.scene.add.sprite(x, y, key, '0').setOrigin(o.x, o.y).setScale(1 / GAME.resolution).play(key);
    sprite.setDepth(y).anims.setProgress(Math.random());
    const shadow = this.scene.add.image(x, y, TEXTURES.shadow).setScale(kind === 'ogre' ? 1.3 : 0.7, 0.7).setDepth(y - 1);
    const stopX = kind === 'archer' ? Phaser.Math.Between(SIEGE.archers.stopX[0], SIEGE.archers.stopX[1]) : null;
    const idle = kind === 'archer' ? splashKey(kind, 'idle') : null;
    this.marchers.push({ sprite, shadow, speed: MARCH_SPEED[kind], fadeX: Phaser.Math.Between(SIEGE.fadeX[0], SIEGE.fadeX[1]), idle, stopX, shotIn: 0.5 });
  }

  private update(dt: number): void {
    this.fx.update(dt);
    // орда идёт к замку: пехота у рыцаря растворяется и снова выходит из-за правого края, лучники встают и стреляют
    for (const m of this.marchers) {
      const s = m.sprite;
      if (m.idle && m.stopX !== null && s.x <= m.stopX) {
        if (s.anims.currentAnim?.key !== m.idle) s.play(m.idle);
        if ((m.shotIn -= dt) <= 0) { m.shotIn = Phaser.Math.FloatBetween(SIEGE.archers.every[0], SIEGE.archers.every[1]); this.shoot(s); }
      } else {
        s.x -= m.speed * dt;
        s.setAlpha(s.x < m.fadeX ? Math.max(0, s.alpha - dt * 1.5) : Math.min(1, s.alpha + dt * 1.5));
        if (s.alpha <= 0) s.x = SIEGE.respawnX + Math.random() * 40;
      }
      m.shadow.setPosition(s.x, s.y + 1).setAlpha(s.alpha);
    }
    this.updateArrows(dt);
    this.auraT -= dt;
    if (this.auraT <= 0 && this.kings.length) {
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

  /** Лучник стреляет: стрела летит дугой к случайной точке на стенах замка. */
  private shoot(archer: Phaser.GameObjects.Sprite): void {
    const to = castleTarget();
    const from = new Phaser.Math.Vector2(archer.x - 6, archer.y - 16);
    const sprite = this.scene.add.image(from.x, from.y, 'arrow').setDepth(TITLE_DEPTH.fire - 5);
    this.arrows.push({ sprite, from, to: new Phaser.Math.Vector2(to.x, to.y), t: 0, flight: Phaser.Math.FloatBetween(SIEGE.archers.flight[0], SIEGE.archers.flight[1]) });
  }

  /** Стрелы летят по параболе, остриём по ходу полёта; у стены — искры и каменная крошка. */
  private updateArrows(dt: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.t = Math.min(1, a.t + dt / a.flight);
      const lift = (t: number): number => -SIEGE.archers.arc * 4 * t * (1 - t);
      const x = Phaser.Math.Linear(a.from.x, a.to.x, a.t), y = Phaser.Math.Linear(a.from.y, a.to.y, a.t) + lift(a.t);
      const t2 = Math.min(1, a.t + 0.02);
      const nx = Phaser.Math.Linear(a.from.x, a.to.x, t2), ny = Phaser.Math.Linear(a.from.y, a.to.y, t2) + lift(t2);
      a.sprite.setPosition(x, y).setRotation(Math.atan2(ny - y, nx - x));
      if (a.t < 1) continue;
      this.fx.burst({ x, y, count: 5, speed: [10, 35], life: [0.2, 0.45], size: [1, 2], tints: [0xfff0c0, 0xffc060, 0x8a8494], gravity: 80, depth: TITLE_DEPTH.fire - 4 });
      a.sprite.destroy();
      this.arrows.splice(i, 1);
    }
  }

  private updateFire(dt: number): void {
    if (!this.fireball) {
      this.fireIn -= dt;
      if (this.fireIn <= 0 && this.kings.length) this.launch();
      return;
    }
    const fb = this.fireball;
    fb.t = Math.min(1, fb.t + dt / SIEGE.fireFlight);
    const u = 1 - fb.t;
    this.pos.set(u * u * fb.from.x + 2 * u * fb.t * fb.ctrl.x + fb.t * fb.t * fb.to.x, u * u * fb.from.y + 2 * u * fb.t * fb.ctrl.y + fb.t * fb.t * fb.to.y);
    const back = Math.atan2(fb.sprite.y - this.pos.y, fb.sprite.x - this.pos.x);
    fb.sprite.setPosition(this.pos.x, this.pos.y).setScale(Math.min(SIEGE.fireScale, 0.3 + fb.t * 4) / textureResolution(fb.sprite.texture));
    fb.glow.setPosition(this.pos.x, this.pos.y);
    this.fx.burst({ x: this.pos.x, y: this.pos.y, count: 3, speed: [10, 40], angle: [back - 0.6, back + 0.6], life: [0.3, 0.7], size: [3, 7], tints: [0xffe070, 0xffa030, 0xf05a1e, 0xb02a14], gravity: -15, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire - 1 });
    if (fb.t >= 1) this.explode(fb);
  }

  /** Сфера над ладонью Короля вспыхивает — и в замок летит огромный огненный шар. */
  private launch(): void {
    const king = Phaser.Utils.Array.GetRandom(this.kings);
    const grip = gripOffset(ENEMY_TYPES.king.body, SIEGE.kingFacing);
    const from = new Phaser.Math.Vector2(king.x + grip.x, king.y + grip.y - ORB.lift);
    const target = castleTarget(), to = new Phaser.Math.Vector2(target.x, target.y);
    const ctrl = new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - 80);
    this.fx.burst({ x: from.x, y: from.y, count: 14, speed: [20, 60], life: [0.3, 0.6], size: [2, 4], tints: [0xa040ff, 0xe0a0ff, 0xffffff], blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.fire });
    const sprite = this.scene.add.sprite(from.x, from.y, 'fireball', '0').setDepth(TITLE_DEPTH.fire).play('fireball');
    sprite.setScale(0.3 / textureResolution(sprite.texture));
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
