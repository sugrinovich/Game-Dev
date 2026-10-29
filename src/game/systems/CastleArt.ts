import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { DEPTH } from '../configs/game';
import type { Colliders } from './Colliders';
import { addOutline, addVolume, blob, htube, lit, ramp, roundCorners, slab, tone, tube, type Ramp } from './Volume';

export type CastleTheme = 'hall' | 'courtyard' | 'crypt' | 'forge';
export const CASTLE_BOUNDS = { side: 28, top: 88, bottom: 24 } as const;
/** Размеры карт: зал замка и арена (пол рисуется заранее, при загрузке). */
export const HALL_SIZE = { w: 640, h: 416 } as const;
export const ARENA_SIZE = { w: 640, h: 448 } as const;
export const HALL_GROUND_KEY = 'base-ground';
export function arenaGroundKey(theme: CastleTheme): string { return `arena-ground-${theme}`; }
const PALETTES = {
  hall: { floor: ['#424956', '#48505e', '#4e5663'], wall: '#343b49', trim: '#bd9856', cloth: '#762e40', light: '#97b7d1' },
  courtyard: { floor: ['#605f59', '#69685f', '#727066'], wall: '#494c50', trim: '#bd9856', cloth: '#354f68', light: '#9dbbce' },
  crypt: { floor: ['#343e4b', '#394554', '#414d5b'], wall: '#292f40', trim: '#8499b5', cloth: '#3d3a69', light: '#74b8ca' },
  forge: { floor: ['#4c3e40', '#544447', '#5e4a48'], wall: '#382e36', trim: '#c58b4e', cloth: '#7a3033', light: '#e7935a' },
} as const;
/** Луч света из витража: размер текстуры и число пылинок в нём. */
const SHAFT = { w: 94, h: 152, dust: 7 } as const;
/** Анимации объектов: число кадров в цикле и скорость (кадров в секунду). Больше кадров — плавнее движение. */
const ANIM = {
  banner: { frames: 32, rate: 20 },
  gate: { frames: 32, rate: 24 },
  brazier: { frames: 24, rate: 24 },
  merchant: { frames: 32, rate: 16 },
  workshop: { frames: 24, rate: 24 },
  hut: { frames: 24, rate: 16 },
  storage: { frames: 24, rate: 16 },
  garden: { frames: 24, rate: 20 },
  catRun: { frames: 12, rate: 20 },
  catSit: { frames: 12, rate: 6 },
} as const;
const TAU = Math.PI * 2;

type Paint = (ctx: CanvasRenderingContext2D) => void;

/** Предсказуемый «случайный» шум по координатам: узор пола одинаковый при каждом запуске. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}
export function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
export function poly(c: CanvasRenderingContext2D, color: string, points: number[][]): void {
  c.fillStyle = color; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x!, y!) : c.moveTo(x!, y!));
  c.closePath(); c.fill();
}
/** volume — наложить светотень и контур (см. Volume.ts); для объектов да, для пола и иконок нет. */
export function texture(scene: Phaser.Scene, key: string, w: number, h: number, paint: Paint, volume = false): void {
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
/** Блик-звёздочка: белый центр и золотые лучи. */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number): void {
  px(c, '#ffffff', x, y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(c, '#fff0a0', x + dx, y + dy);
}
// ---------------- «3D» в пиксель-арте: вид сверху-спереди (3/4), свет сверху-слева ----------------
/** Освещённость столбца цилиндра: n от −1 (левый край) до 1 (правый). Ступеньками — как в пиксель-арте. */
function cylLight(n: number): number {
  const k = 0.4 - 0.9 * Math.max(0, n + 0.3) - 0.5 * Math.max(0, -n - 0.7);
  return Math.round(k / 0.2) * 0.2;
}
/** Эллипс из горизонтальных полосок (так в 3/4 выглядит круг на полу или крышка цилиндра). */
export function ellipse(c: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry: number): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    rect(c, color, cx - half, cy + dy, half * 2 + 1, 1);
  }
}
/** Цилиндр: тело со светотенью по столбцам, сверху — светлая крышка-эллипс. Нижний край — на baseY + ry. */
export function cylinder(c: CanvasRenderingContext2D, cx: number, baseY: number, rx: number, ry: number, height: number, color: string, top = tone(color, 0.35)): void {
  for (let x = -rx; x <= rx; x++) {
    const n = x / rx;
    const arc = Math.round(ry * Math.sqrt(Math.max(0, 1 - n * n)));
    rect(c, tone(color, cylLight(n)), cx + x, baseY - height, 1, height + arc);
  }
  ellipse(c, top, cx, baseY - height, rx, ry);
}
/** Брус: верхняя грань глубиной depth и передняя высотой h; рёбра скруглены, свет сверху-слева (см. slab в Volume.ts). */
export function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, depth: number, h: number, color: string, top = tone(color, 0.3)): void {
  slab(c, x, y, w, depth, h, color, top);
}
/** Рисовать только внутри многоугольника (щит, плащ, ниша): что именно — задаёт paint. */
export function clipPoly(c: CanvasRenderingContext2D, points: number[][], paint: () => void): void {
  c.save(); c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
  c.closePath(); c.clip(); paint(); c.restore();
}
/** Ткань в складках: строка шириной w, тон по столбцу — складки вдоль ткани; phase сдвигает их (колыхание). */
function foldRow(c: CanvasRenderingContext2D, x: number, y: number, w: number, tones: Ramp, phase: number, amp = 0.6): void {
  let x0 = x, cur = '';
  for (let i = 0; i <= w; i++) {
    const nx = amp * Math.cos(i * 0.9 + phase) + (i === 0 ? -0.3 : i === w - 1 ? 0.4 : 0);
    const col = i === w ? '' : tones[lit(nx, -0.1, Math.sqrt(Math.max(0, 1 - nx * nx)))]!;
    if (col !== cur) { if (cur) rect(c, cur, x0, y, x + i - x0, 1); x0 = x + i; cur = col; }
  }
}
/** Выпуклый щит-герб 18x22: золотая кайма, поле и крест с бликом сверху-слева. */
function shieldEmblem(c: CanvasRenderingContext2D, x: number, y: number, field = '#823749'): void {
  const box = { x: x - 1, y: y - 2, w: 21, h: 26 };
  clipPoly(c, [[x, y], [x + 18, y], [x + 18, y + 14], [x + 9, y + 22], [x, y + 14]], () => blob(c, box, ramp('#d6b66d'), 2.5));
  clipPoly(c, [[x + 2, y + 2], [x + 16, y + 2], [x + 16, y + 13], [x + 9, y + 19], [x + 2, y + 13]], () => blob(c, box, ramp(field), 2.5));
  tube(c, { x: x + 8, y: y + 4, w: 2, h: 12 }, ramp('#e8d29b')); htube(c, { x: x + 4, y: y + 7, w: 10, h: 2 }, ramp('#e8d29b'));
}
/** Чаша — нижняя половина шара под краем на rimY (глубина depth): тон по нормали. */
function bowl(c: CanvasRenderingContext2D, cx: number, rimY: number, rx: number, depth: number, tones: Ramp): void {
  c.save(); c.beginPath(); c.rect(cx - rx - 1, rimY, rx * 2 + 3, depth + 1); c.clip();
  blob(c, { x: cx - rx, y: rimY - depth, w: rx * 2 + 1, h: depth * 2 }, tones, 2);
  c.restore();
}

/** Языки пламени по столбцам: основание на baseY, высота «дышит» от кадра к кадру. */
function flame(c: CanvasRenderingContext2D, cx: number, baseY: number, half: number, height: number, f: number, frames: number): void {
  const t = (f / frames) * Math.PI * 2;
  for (let x = -half; x <= half; x++) {
    const envelope = 1 - (x / (half + 1)) ** 2;
    const h = Math.max(1, Math.round(height * envelope * (0.72 + 0.28 * Math.sin(t * 2 + x * 1.7) + 0.12 * Math.sin(t * 3 - x))));
    const layer = (color: string, k: number): void => { const lh = Math.round(h * k); if (lh > 0) rect(c, color, cx + x, baseY - lh, 1, lh); };
    layer('#c8401e', 1); layer('#f07a2a', 0.8); layer('#ffc04a', 0.55);
    if (Math.abs(x) < half * 0.5) layer('#fff2b8', 0.3);
  }
}
/** Сколько кадров листа рисовать за одно задание: так ни одно задание экрана загрузки не выходит за бюджет кадра. */
const FRAMES_PER_JOB = 8;
type SheetPaint = (c: CanvasRenderingContext2D, f: number) => void;

/**
 * Лист анимации по частям: первое задание создаёт холст, каждое следующее рисует и оттеняет
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

/** Палитра котика. */
const CAT = { fur: '#e08a3a', dark: '#a8561e', cream: '#f4e2c4', eye: '#7ad040', nose: '#f08a9a' } as const;

/** Объекты замка — по заданию на объект: экран загрузки выполняет их понемногу за кадр, и анимация не подвисает. */
export function castleTextureJobs(scene: Phaser.Scene): (() => void)[] {
  return [
    // Знамя колышется: строки ткани сдвигаются по синусоиде (низ — сильнее), по ткани бегут складки.
    ...sheetJobs(scene, 'castle_banner', 30, 58, ANIM.banner.frames, ANIM.banner.rate, (c, f) => {
      const t = (f / ANIM.banner.frames) * TAU, cloth = ramp('#6e2a40');
      const sway = (y: number): number => Math.round(Math.sin(t + y * 0.12) * ((y - 4) / 54) * 2.2);
      for (let y = 4; y < 58; y++) {
        const inset = y >= 47 ? y - 47 : 0;
        const w = 20 - inset * 2;
        if (w <= 0) continue;
        const l = 5 + inset + sway(y);
        foldRow(c, l, y, w, cloth, t + y * 0.05 + inset * 0.9);
        if (y >= 46) { px(c, '#d5b16a', l, y); px(c, '#d5b16a', l + w - 1, y); }
      }
      shieldEmblem(c, 6 + sway(26), 16);
      // древко с золотыми шарами на концах
      htube(c, { x: 2, y: 2, w: 26, h: 4 }, ramp('#a07a44'));
      for (const x of [0, 25]) blob(c, { x, y: 0, w: 5, h: 6 }, ramp('#d5b16a'), 2);
    }),
    // Колонна стоит на полу (вид 3/4): квадратная плита, круглый ствол с каннелюрами, капитель — у всего видна верхняя грань.
    () => texture(scene, 'castle_pillar', 32, 64, (c) => {
      const stone = '#6a7484';
      block(c, 3, 52, 26, 6, 5, '#5a6372');
      cylinder(c, 16, 53, 9, 3, 40, stone);
      for (const x of [-6, -3, 0, 3, 6]) rect(c, tone(stone, cylLight(x / 9) - 0.3), 16 + x, 21, 1, 31);
      cylinder(c, 16, 17, 10, 3, 2, '#ac8d53');
      block(c, 4, 3, 24, 6, 6, '#7a8494');
      rect(c, tone('#7a8494', -0.2), 4, 12, 24, 1);
      rect(c, '#3a4250', 19, 28, 1, 4); px(c, '#3a4250', 20, 32); rect(c, '#3a4250', 20, 33, 1, 4);
      rect(c, '#4f6a48', 4, 61, 5, 1); px(c, '#6a8a58', 5, 60); rect(c, '#4f6a48', 24, 61, 4, 1);
    }, true),
    // Ворота: кладка и арка из выпуклых камней, внутри переливается портал, решётка из круглых прутьев.
    ...sheetJobs(scene, 'castle_gate', 88, 86, ANIM.gate.frames, ANIM.gate.rate, (c, f) => {
      const t = (f / ANIM.gate.frames) * TAU, stoneCol = '#6e7885';
      const arch = [[20, 84], [20, 30], [30, 22], [44, 17], [58, 22], [68, 30], [68, 84]];
      poly(c, '#171e2b', [[2, 84], [2, 25], [18, 8], [44, 0], [70, 8], [86, 25], [86, 84]]);
      clipPoly(c, [[6, 84], [6, 26], [22, 12], [44, 5], [66, 12], [82, 26], [82, 84]], () => {
        rect(c, tone(stoneCol, -0.6), 0, 0, 88, 86);
        for (let y = 2, row = 0; y < 84; y += 8, row++) {
          for (let x = -6 + (row % 2) * 7; x < 88; x += 14) blob(c, { x, y, w: 13, h: 7 }, ramp(tone(stoneCol, hash2(x, y, 3) > 0.7 ? -0.12 : 0)), 4);
        }
      });
      poly(c, '#131c2b', arch);
      c.save(); c.beginPath(); arch.forEach(([x, y], i) => i ? c.lineTo(x! - 1, y!) : c.moveTo(x! + 2, y!)); c.closePath(); c.clip();
      // одинаковые соседние пиксели рисуются одной полоской — так быстрее, чем по пикселю
      const portal = (x: number, y: number): string => {
        const v = Math.sin(x * 0.25 + y * 0.18 - t) + Math.sin(y * 0.3 + t * 2 - x * 0.1);
        return v > 1.3 ? '#9ff5ea' : v > 0.6 ? '#5fe0d4' : v > -0.2 ? '#2a8a8e' : v > -1 ? '#1a5a66' : '#123a48';
      };
      for (let y = 17; y < 84; y++) {
        let x0 = 21, color = portal(21, y);
        for (let x = 22; x <= 67; x++) {
          const next = x < 67 ? portal(x, y) : '';
          if (next !== color) { rect(c, color, x0, y, x - x0, 1); x0 = x; color = next; }
        }
      }
      c.restore();
      // решётка: круглые прутья с остриями, поперечина
      for (const x of [27, 36, 45, 54, 63]) {
        rect(c, '#151b27', x - 1, 29, 4, 19); tube(c, { x, y: 29, w: 2, h: 19 }, ramp('#a5a49a'));
        poly(c, '#a5a49a', [[x, 48], [x + 2, 48], [x + 1, 54]]); px(c, '#e0e0d4', x, 48);
      }
      htube(c, { x: 22, y: 27, w: 44, h: 4 }, ramp('#7a7468'));
      // камни арки по контуру проёма
      for (let i = 0; i < arch.length - 1; i++) {
        const [x0, y0] = arch[i]!, [x1, y1] = arch[i + 1]!, n = Math.max(1, Math.round(Math.hypot(x1! - x0!, y1! - y0!) / 8));
        for (let k = 0; k < n; k++) {
          const q = (k + 0.5) / n;
          blob(c, { x: Math.round(x0! + (x1! - x0!) * q) - 5, y: Math.round(y0! + (y1! - y0!) * q) - 4, w: 10, h: 8 }, ramp(tone(stoneCol, 0.2)), 2.6);
        }
      }
      // табличка с камнем, порог
      block(c, 36, 4, 16, 2, 8, '#b8903f');
      const gem = ['#2a8a8e', '#5fe0d4', '#9ff5ea', '#ffffff'] as const;
      blob(c, { x: 41, y: 7, w: 6, h: 5 }, ramp(gem[Math.round((0.5 - 0.5 * Math.cos(t)) * (gem.length - 2))]!), 2);
      block(c, 2, 79, 84, 2, 4, '#92989c');
    }),
    // Жаровня 24x32 (вид 3/4): тренога с круглыми лапами, бронзовая чаша-полушар, сверху угли, из них растёт огонь.
    ...sheetJobs(scene, 'castle_brazier', 24, 32, ANIM.brazier.frames, ANIM.brazier.rate, (c, f) => {
      const p = f / ANIM.brazier.frames;
      const iron = ramp('#4a4656'), bronze = ramp('#9a7442');
      tube(c, { x: 11, y: 19, w: 2, h: 9 }, ramp(tone('#4a4656', -0.4)));
      for (let y = 19; y < 29; y++) { const d = Math.floor((y - 19) / 4); tube(c, { x: 5 - d, y, w: 2, h: 1 }, iron); tube(c, { x: 17 + d, y, w: 2, h: 1 }, iron); }
      for (const x of [2, 18]) blob(c, { x, y: 28, w: 4, h: 3 }, iron, 2);
      bowl(c, 12, 13, 10, 8, bronze);
      ellipse(c, bronze[1], 12, 13, 10, 3);
      ellipse(c, '#2a1414', 12, 13, 8, 2);
      for (let i = 0; i < 8; i++) px(c, (i + f) % 3 ? '#a0341e' : '#ffb040', 5 + i * 2, 12 + (i % 3));
      for (const x of [5, 9, 13, 17]) px(c, bronze[0], x, 18);   // заклёпки на боку чаши
      flame(c, 12, 13, 7, 12, f, ANIM.brazier.frames);
      for (const off of [0, 0.5]) {
        const q = (p + off) % 1;
        px(c, q < 0.6 ? '#ffe08a' : '#f07a2a', 7 + Math.round(off * 10 + Math.sin(q * TAU) * 1.5), 9 - Math.floor(q * 9));
      }
    }),
    // Торговец 40x32 (вид 3/4): стоит за прилавком, товары на столешнице; дышит, моргает, подбрасывает монету.
    ...sheetJobs(scene, 'castle_merchant', 40, 32, ANIM.merchant.frames, ANIM.merchant.rate, (c, f) => {
      const n = ANIM.merchant.frames, p = f / n;
      const dy = Math.sin(p * TAU) > 0.3 ? 1 : 0;
      const blink = p >= 0.8 && p < 0.86;
      const coat = '#335868', skin = ramp('#d9ad82');
      tube(c, { x: 8, y: 13 + dy, w: 4, h: 6 }, ramp(tone(coat, -0.2)));       // левая рука лежит на прилавке
      blob(c, { x: 11, y: 11 + dy, w: 18, h: 12 }, ramp(coat), 3);               // кафтан
      htube(c, { x: 12, y: 16 + dy, w: 16, h: 2 }, ramp('#d6b66d')); px(c, '#fff0a0', 19, 16 + dy);
      tube(c, { x: 28, y: 10 + dy, w: 3, h: 6 }, ramp(tone(coat, -0.1)));      // правая рука поднята
      blob(c, { x: 27, y: 8 + dy, w: 5, h: 4 }, skin, 2);
      // первая половина цикла — монета летит по дуге, вторая — лежит в ладони
      const coinY = p < 0.5 ? 7 - Math.round(Math.sin((p / 0.5) * Math.PI) * 6) : 7;
      blob(c, { x: 28, y: coinY - 1, w: 4, h: 3 }, ramp('#d9a640'), 2);
      blob(c, { x: 14, y: 4 + dy, w: 12, h: 9 }, skin, 2.2);                     // голова
      if (blink) { rect(c, '#272838', 17, 8 + dy, 2, 1); rect(c, '#272838', 21, 8 + dy, 2, 1); }
      else { rect(c, '#272838', 17, 7 + dy, 2, 2); rect(c, '#272838', 21, 7 + dy, 2, 2); px(c, '#ffffff', 17, 7 + dy); px(c, '#ffffff', 21, 7 + dy); }
      blob(c, { x: 15, y: 9 + dy, w: 10, h: 6 }, ramp('#e8dcc0'), 2);            // борода
      blob(c, { x: 11, y: 2 + dy, w: 18, h: 5 }, ramp('#2f5560'), 2);            // поля шляпы
      cylinder(c, 20, 4 + dy, 5, 1, 3, '#3b6874', '#5a8a96');
      rect(c, '#d6b66d', 15, 3 + dy, 11, 1);
      px(c, '#c84a5a', 24, 1 + dy); px(c, '#ff8a8a', 25, dy);
      // прилавок: скруглённый брус, драпировка в складках с золотой бахромой
      block(c, 1, 17, 38, 7, 7, '#72513c', '#b58655');
      for (let y = 24; y < 28; y++) foldRow(c, 4, y, 32, ramp('#8a3448'), y * 0.15, 0.5);
      for (let x = 4; x < 36; x += 3) { px(c, '#d6b66d', x + 1, 28); px(c, '#d6b66d', x + 2, 29); }
      blob(c, { x: 8, y: 17, w: 5, h: 3 }, skin, 2);
      // зелья — круглые колбы с горлышком и пробкой
      for (const [x, glass] of [[5, '#b74460'], [34, '#4a8ac0']] as const) {
        blob(c, { x: x - 3, y: 16, w: 7, h: 7 }, ramp(glass), 2);
        tube(c, { x: x - 1, y: 12, w: 2, h: 4 }, ramp('#c9d5d3')); rect(c, '#b99465', x - 1, 11, 2, 1); px(c, '#ffffff', x - 2, 17);
      }
      cylinder(c, 15, 21, 3, 1, 2, '#c99a40', '#ffe1a0');
      cylinder(c, 22, 20, 2, 1, 1, '#c99a40', '#ffe1a0');
      if (p >= 0.19 && p < 0.25) sparkle(c, 5, 15);
      if (p >= 0.69 && p < 0.75) sparkle(c, 34, 15);
    }),
    // Оружейная 44x32 (вид 3/4): печь с жаром сверху, стойка с оружием, наковальня, бочка с водой; молот бьёт.
    ...sheetJobs(scene, 'castle_workshop', 44, 32, ANIM.workshop.frames, ANIM.workshop.rate, (c, f) => {
      const p = f / ANIM.workshop.frames;
      const STRIKE = 0.7;
      const wood = '#7d5a3c', brick = '#6a4440';
      // стойка у дальнего края
      for (const x of [16, 40]) tube(c, { x, y: 3, w: 2, h: 18 }, ramp(tone(wood, -0.2)));
      block(c, 15, 1, 28, 2, 2, wood);
      for (const x of [21, 27]) { tube(c, { x, y: 5, w: 2, h: 10 }, ramp('#c3cdd2')); px(c, '#eef0e8', x, 5); htube(c, { x: x - 2, y: 15, w: 6, h: 1 }, ramp('#d6b66d')); tube(c, { x, y: 16, w: 2, h: 3 }, ramp('#7d5241')); }
      rect(c, '#7d5241', 33, 5, 1, 13); poly(c, '#98a3ae', [[34, 6], [38, 5], [39, 11], [34, 10]]); rect(c, '#d4dae0', 38, 6, 1, 4);
      block(c, 15, 18, 28, 2, 2, tone(wood, -0.1));
      // печь: дымоход, жар в топке виден сверху, устье спереди
      block(c, 3, 0, 8, 3, 8, '#4a3634');
      block(c, 1, 11, 13, 6, 14, brick);
      c.save(); c.beginPath(); c.rect(2, 18, 11, 12); c.clip();
      rect(c, tone(brick, -0.5), 2, 18, 11, 12);
      for (let y = 18, row = 0; y < 30; y += 3, row++) for (let x = row % 2 ? -1 : 2; x < 13; x += 5) blob(c, { x, y, w: 5, h: 3 }, ramp(brick), 4);
      c.restore();
      const heat = ['#ff8a2a', '#ffae48', '#ff9a3a', '#ffc860'] as const;
      const glow = heat[Math.floor(p * 8) % heat.length]!;
      ellipse(c, '#1a1012', 7, 14, 4, 2); ellipse(c, glow, 7, 14, 3, 1); px(c, '#ffe9a0', 7 + Math.round(Math.sin(p * TAU * 2)), 14);
      rect(c, '#1a1012', 4, 21, 6, 5); rect(c, glow, 5, 22, 4, 4); rect(c, '#ffe9a0', 6, 23, 2, Math.sin(p * TAU * 4) > 0 ? 3 : 2);
      // бочка для закалки
      cylinder(c, 39, 28, 4, 2, 7, '#6a4a34', '#3a7a98');
      for (const y of [24, 27]) htube(c, { x: 35, y, w: 9, h: 1 }, ramp('#4a4044'));
      px(c, '#bfe4f5', 38 + Math.round(Math.sin(p * TAU) * 2), 21);
      // наковальня
      block(c, 19, 27, 14, 2, 2, '#3a404c');
      tube(c, { x: 23, y: 23, w: 6, h: 4 }, ramp('#4a5260'));
      blob(c, { x: 31, y: 19, w: 7, h: 4 }, ramp('#8a95a3'), 2);   // рог наковальни
      block(c, 17, 19, 16, 3, 3, '#7a8594', '#b8c0c8');
      rect(c, p >= STRIKE ? '#ffe08a' : '#ff8a3a', 22, 20, 6, 1);
      // молот медленно поднимается, быстро падает и чуть отскакивает
      const hy = p < 0.55 ? 15 - Math.round(8 * Math.sin((p / 0.55) * Math.PI / 2))
        : p < STRIKE ? 7 + Math.round((9 * (p - 0.55)) / (STRIKE - 0.55))
        : 16 - Math.round(Math.sin(((p - STRIKE) / (1 - STRIKE)) * Math.PI));
      blob(c, { x: 22, y: hy, w: 7, h: 3 }, ramp('#a8b0ba'), 4);
      htube(c, { x: 29, y: hy + 1, w: 6, h: 1 }, ramp('#7d5241'));
      if (p >= STRIKE) {
        const k = (p - STRIKE) / (1 - STRIKE);
        if (k < 0.15) { px(c, '#ffffff', 21, 19); px(c, '#ffffff', 29, 19); }
        for (const a of [-2.6, -2.1, -1.6, -1.1, -0.6]) {
          const r = 2 + k * 9;
          px(c, k < 0.6 ? '#ffe08a' : '#f07a2a', 25 + Math.round(Math.cos(a) * r), 19 + Math.round(Math.sin(a) * r * 0.8 + k * k * 4));
        }
      }
    }),
    // Покои 44x32 (вид 3/4): мягкая кровать — пухлые подушки и одеяло, балдахин на круглых столбиках, тумбочка с фонарём.
    ...sheetJobs(scene, 'castle_hut', 44, 32, ANIM.hut.frames, ANIM.hut.rate, (c, f) => {
      const p = f / ANIM.hut.frames;
      const wood = '#6d4e3a', cloth = '#752e41', linen = '#e0d5b8';
      for (const x of [4, 32]) cylinder(c, x, 16, 1, 1, 15, wood);
      htube(c, { x: 5, y: 1, w: 27, h: 5 }, ramp(cloth));   // балдахин — свёрнутая ткань
      rect(c, '#d5b16a', 5, 5, 27, 1);
      for (let x = 6; x < 32; x += 3) px(c, '#d5b16a', x, 6);
      block(c, 5, 7, 27, 1, 7, wood);
      for (const x of [10, 18, 26]) { px(c, '#d5b16a', x, 10); px(c, '#d5b16a', x - 1, 11); px(c, '#d5b16a', x + 1, 11); px(c, '#d5b16a', x, 12); }
      blob(c, { x: 4, y: 14, w: 29, h: 5 }, ramp(linen), 4);
      for (const x of [11, 25]) blob(c, { x: x - 5, y: 13, w: 11, h: 5 }, ramp('#f4ecd8'), 2);   // подушки
      blob(c, { x: 4, y: 18, w: 29, h: 10 }, ramp(cloth), 4);                                    // одеяло
      htube(c, { x: 5, y: 18, w: 27, h: 2 }, ramp(linen));                                       // отогнутый край простыни
      for (let x = 9; x < 31; x += 7) { px(c, '#d5b16a', x, 22); px(c, '#d5b16a', x - 1, 23); px(c, '#d5b16a', x + 1, 23); px(c, '#d5b16a', x, 24); }
      htube(c, { x: 3, y: 27, w: 31, h: 4 }, ramp(wood));   // рама
      for (const x of [3, 33]) cylinder(c, x, 29, 1, 1, 9, wood, '#d5b16a');
      // тумбочка и фонарь, пламя мерцает
      block(c, 36, 19, 7, 3, 8, wood);
      px(c, '#d5b16a', 39, 24);
      cylinder(c, 39, 19, 2, 1, 6, '#3a3034', '#5a5050');
      const lit = Math.sin(p * TAU * 3) > 0;
      blob(c, { x: 37, y: 14, w: 5, h: 5 }, ramp(lit ? '#ffd060' : '#ffb848'), 2); px(c, '#fff4c0', 38, 15);
      px(c, '#8a8070', 39, 11); px(c, '#8a8070', 38, 12); px(c, '#8a8070', 40, 12);
    }),
    // Казначейство 44x32 (вид 3/4): сундук с выпуклой крышкой, золото из щели, монеты на полу бликуют.
    ...sheetJobs(scene, 'castle_storage', 44, 32, ANIM.storage.frames, ANIM.storage.rate, (c, f) => {
      const p = f / ANIM.storage.frames;
      const wood = '#855b3c', metal = '#b6b3a0';
      cylinder(c, 4, 29, 3, 1, 2, '#c99a40', '#ffe1a0');
      cylinder(c, 40, 29, 3, 1, 1, '#c99a40', '#ffe1a0'); px(c, '#5fe0d4', 40, 27); px(c, '#bff8f0', 41, 27);
      blob(c, { x: 7, y: 14, w: 30, h: 15 }, ramp(wood), 5);   // стенка сундука со скруглёнными рёбрами
      for (const y of [20, 24]) rect(c, tone(wood, -0.25), 8, y, 28, 1);
      // крышка — полуцилиндр, лежащий вдоль сундука: верх дуги светлый, передний край темнее
      const lidK = (y: number): number => Math.round((0.45 - ((y - 4) / 11) * 0.9) / 0.15) * 0.15;
      for (let y = 4; y <= 15; y++) {
        const inset = y === 4 ? 2 : y === 5 ? 1 : 0;
        rect(c, tone('#a07848', lidK(y)), 7 + inset, y, 30 - inset * 2, 1);
      }
      const shine = ['#c48a30', '#e4a840', '#ffd76a', '#fff0a0'] as const;
      rect(c, shine[Math.round((0.5 - 0.5 * Math.cos(p * TAU)) * (shine.length - 1))]!, 7, 15, 30, 1);
      for (const x of [11, 31]) {
        for (let y = 4; y <= 28; y++) { const k = y <= 15 ? lidK(y) : -0.1; rect(c, tone(metal, k), x, y, 3, 1); px(c, tone(metal, k + 0.3), x, y); }
        for (const y of [9, 20, 26]) px(c, '#5a5850', x + 1, y);
      }
      blob(c, { x: 19, y: 13, w: 6, h: 7 }, ramp('#d7b461'), 4);
      rect(c, '#3e3031', 21, 16, 2, 1); px(c, '#3e3031', 21, 17);
      // блик в три шага: вспыхивает, раскрывается звёздочкой, гаснет — и переходит на следующую точку
      const spots = [[3, 26], [14, 6], [40, 27], [22, 14]] as const;
      const step = Math.floor(p * spots.length * 3);
      const [sx, sy] = spots[Math.floor(step / 3)]!;
      if (step % 3 === 1) sparkle(c, sx, sy); else px(c, step % 3 ? '#ffffff' : '#fff0a0', sx, sy);
    }),
    // Аптекарский стол 44x32 (вид 3/4): на столешнице горшок с травами, колба над горелкой, флакон и ступка.
    ...sheetJobs(scene, 'castle_garden', 44, 32, ANIM.garden.frames, ANIM.garden.rate, (c, f) => {
      const p = f / ANIM.garden.frames;
      const sway = Math.round(Math.sin(p * TAU) * 1.4);
      for (const x of [3, 38]) tube(c, { x, y: 25, w: 3, h: 6 }, ramp(tone('#72513c', -0.2)));
      block(c, 1, 14, 42, 8, 3, '#72513c', '#b58655');
      for (const y of [17, 20]) rect(c, tone('#b58655', -0.15), 1, y, 42, 1);
      cylinder(c, 7, 19, 4, 1, 4, '#a0543a', '#4a3020');
      for (const [x, h, col] of [[5, 6, '#56924a'], [7, 9, '#82b95a'], [9, 5, '#56924a'], [6, 4, '#3b7240']] as const) {
        rect(c, col, x, 15 - h + 2, 1, h - 2); rect(c, col, x + sway, 15 - h, 1, 2);
      }
      px(c, '#e07a9a', 7 + sway, 5); px(c, '#ffb0c8', 7 + sway, 6);
      cylinder(c, 20, 19, 3, 1, 2, '#5b6472', '#3a404c');
      const lit = Math.sin(p * TAU * 4) > 0 ? 1 : 0;
      rect(c, lit ? '#ffb040' : '#ff8a2a', 19, 15 - lit, 2, 1 + lit); px(c, '#fff2b8', 19, 15);
      blob(c, { x: 16, y: 6, w: 9, h: 9 }, ramp('#8fb8c8'), 2);
      c.save(); c.beginPath(); c.rect(15, 10, 11, 6); c.clip();
      blob(c, { x: 16, y: 6, w: 9, h: 9 }, ramp('#3fc08a'), 2);   // жидкость — нижняя половина шара
      c.restore();
      rect(c, '#7fe8b8', 17, 10, 7, 1);
      tube(c, { x: 19, y: 1, w: 3, h: 5 }, ramp('#8fb8c8')); px(c, '#e8f6ff', 19, 2);
      px(c, '#e8f6ff', 17, 8); px(c, '#e8f6ff', 18, 7);
      for (const [bx, off] of [[19, 0], [22, 0.45], [20, 0.75]] as const) px(c, '#d0ffe8', bx, 14 - Math.floor(((p + off) % 1) * 9));
      cylinder(c, 31, 19, 3, 1, 6, '#c9d5d3', '#e8f0f0');
      cylinder(c, 31, 19, 3, 1, 3, '#d04a6a');
      rect(c, '#c9d5d3', 30, 10, 3, 3); rect(c, '#b99465', 30, 9, 3, 1); px(c, '#ffffff', 29, 14);
      cylinder(c, 39, 19, 3, 1, 3, '#8a8a96', '#4a4a56');
      rect(c, '#7d5241', 40 + Math.round(Math.sin(p * TAU)), 12, 1, 5);
    }),
    // Котик 20x16 (смотрит влево, вправо — отражением): бег галопом и сидение — хвост вздрагивает, кот моргает.
    ...sheetJobs(scene, 'cat_run', 20, 16, ANIM.catRun.frames, ANIM.catRun.rate, (c, f) => {
      const t = (f / ANIM.catRun.frames) * TAU, fur = ramp(CAT.fur);
      const bob = Math.round(-Math.abs(Math.sin(t)) * 1.5);
      const reach = Math.round(Math.sin(t) * 2);   // передние лапы тянутся вперёд, задние — назад, и наоборот
      const leg = (x: number, color: string): void => tube(c, { x, y: 11 + bob, w: 2, h: 4 - bob }, ramp(color));
      leg(6 - reach, CAT.dark); leg(14 + reach, CAT.dark);
      blob(c, { x: 5, y: 7 + bob, w: 11, h: 5 }, fur, 2);
      rect(c, CAT.cream, 7, 10 + bob, 6, 1);
      for (const x of [8, 10, 12]) px(c, CAT.dark, x, 7 + bob);
      leg(5 - reach, CAT.fur); leg(13 + reach, CAT.fur);
      const sw = Math.round(Math.sin(t + 1));
      px(c, CAT.fur, 15, 8 + bob); px(c, CAT.fur, 16, 7 + bob); px(c, CAT.fur, 17, 6 + bob + sw); px(c, CAT.dark, 18, 5 + bob + sw);
      blob(c, { x: 1, y: 4 + bob, w: 7, h: 5 }, fur, 2);
      rect(c, CAT.fur, 2, 2 + bob, 1, 2); rect(c, CAT.fur, 5, 2 + bob, 1, 2); px(c, CAT.dark, 2, 2 + bob); px(c, CAT.dark, 5, 2 + bob);
      px(c, CAT.eye, 3, 6 + bob); px(c, CAT.nose, 1, 7 + bob); px(c, CAT.cream, 2, 8 + bob);
    }),
    ...sheetJobs(scene, 'cat_sit', 20, 16, ANIM.catSit.frames, ANIM.catSit.rate, (c, f) => {
      const p = f / ANIM.catSit.frames, fur = ramp(CAT.fur);
      const swish = Math.round(Math.abs(Math.sin(p * TAU)) * 2);
      const blink = p >= 0.75 && p < 0.84;
      htube(c, { x: 10, y: 13, w: 6, h: 2 }, fur); px(c, CAT.fur, 16, 13); px(c, CAT.dark, 16 + (swish > 0 ? 1 : 0), 13 - swish);
      blob(c, { x: 7, y: 8, w: 9, h: 7 }, fur, 2);
      for (const [x, y] of [[12, 9], [13, 10], [14, 11]] as const) px(c, CAT.dark, x, y);
      blob(c, { x: 6, y: 7, w: 5, h: 8 }, fur, 3);
      blob(c, { x: 7, y: 9, w: 3, h: 5 }, ramp(CAT.cream), 2);
      rect(c, CAT.cream, 6, 14, 2, 1); rect(c, CAT.cream, 9, 14, 2, 1);
      blob(c, { x: 5, y: 3, w: 7, h: 5 }, fur, 2);
      rect(c, CAT.fur, 6, 1, 1, 2); rect(c, CAT.fur, 10, 1, 1, 2); px(c, CAT.nose, 6, 2); px(c, CAT.nose, 10, 2);
      if (blink) { px(c, CAT.dark, 6, 5); px(c, CAT.dark, 10, 5); } else { px(c, CAT.eye, 6, 5); px(c, CAT.eye, 10, 5); }
      px(c, CAT.nose, 8, 6); px(c, CAT.cream, 7, 7); px(c, CAT.cream, 9, 7);
    }),
  ];
}

/** Каменная кладка, витражи и ковёр: одна готовая текстура на тему, без объектов на каждый тайл. */
export function paintCastleGround(scene: Phaser.Scene, key: string, w: number, h: number, theme: CastleTheme): void {
  if (scene.textures.exists(key)) return;   // пол не меняется — рисуем один раз, повторный вход в сцену без рывка
  const p = PALETTES[theme];
  texture(scene, key, w, h, (c) => {
    rect(c, '#151b27', 0, 0, w, h);
    // плиты пола: фаска, трещины, мох и мелкий сор
    for (let y = 80; y < h; y += 16) for (let x = 16; x < w - 16; x += 32) {
      const tx = x - (Math.floor(y / 16) % 2) * 16;
      const tone = Math.floor(hash2(x, y, 73) * p.floor.length);
      rect(c, p.floor[tone]!, tx, y, 31, 15);
      rect(c, '#ffffff10', tx, y, 30, 1); rect(c, '#ffffff08', tx, y + 1, 1, 13);
      rect(c, '#00000026', tx + 1, y + 14, 30, 1); rect(c, '#0000001c', tx + 30, y + 1, 1, 13);
      if (hash2(x, y, 91) > 0.65) { rect(c, '#20273666', tx + 10, y + 6, 5, 1); rect(c, '#20273666', tx + 15, y + 7, 1, 3); px(c, '#20273666', tx + 16, y + 10); }
      if (hash2(x, y, 17) > 0.85) for (let i = 0; i < 5; i++) px(c, i % 2 ? '#5a7a4c88' : '#4f6a4888', tx + 2 + Math.floor(hash2(x, y, i + 30) * 26), y + 11 + (i % 3));
      if (hash2(x, y, 53) > 0.9) { rect(c, '#232a38', tx + 20, y + 9, 2, 1); px(c, '#8a90a0', tx + 20, y + 8); }
    }
    paintBackWall(c, w, p);
    paintSideWalls(c, w, h, p);
    // тень от стен на полу
    for (let i = 0; i < 10; i++) rect(c, `rgba(10, 12, 20, ${0.4 - i * 0.04})`, CASTLE_BOUNDS.side, WALL.floorY + i, w - CASTLE_BOUNDS.side * 2, 1);
    for (const x of [w * 0.2, w * 0.8]) paintWindow(c, x, p);
    if (theme === 'hall') {
      const cx = w / 2;
      rect(c, '#272630', cx - 43, 88, 86, h - 118);
      rect(c, p.cloth, cx - 39, 88, 78, h - 122);
      rect(c, '#00000022', cx - 39, 88, 78, 6);
      for (const x of [cx - 36, cx + 34]) rect(c, p.trim, x, 88, 2, h - 122);
      for (const x of [cx - 33, cx + 32]) rect(c, '#00000030', x, 88, 1, h - 122);
      for (let y = 100; y < h - 38; y += 24) {
        for (const x of [cx - 30, cx + 29]) poly(c, '#b88656', [[x, y], [x + 3, y + 4], [x, y + 8], [x - 3, y + 4]]);
        poly(c, '#00000018', [[cx, y + 6], [cx + 8, y + 12], [cx, y + 18], [cx - 8, y + 12]]);
      }
      for (let x = cx - 38; x < cx + 39; x += 2) { rect(c, p.trim, x, h - 34, 1, 3); px(c, '#00000040', x + 1, h - 33); }
      rect(c, '#ffffff07', cx - 32, 88, 22, h - 122);
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
    shield(c, w / 2 - 9, h / 2 + 4, p.cloth);
    // мягкое затемнение по краям зала: у стен и у переднего парапета
    const side = CASTLE_BOUNDS.side, frontY = h - WALL.front.h + WALL.front.top;
    for (let i = 0; i < 12; i++) {
      const a = (12 - i) * 0.022;
      rect(c, `rgba(8, 10, 18, ${a})`, side + i, WALL.floorY, 1, frontY - WALL.floorY); rect(c, `rgba(8, 10, 18, ${a})`, w - side - 1 - i, WALL.floorY, 1, frontY - WALL.floorY);
      rect(c, `rgba(8, 10, 18, ${a})`, side, frontY - 1 - i, w - side * 2, 1);
    }
    for (const x of [WALL.tower.inset, w - WALL.tower.inset]) paintTower(c, x, WALL.tower.baseY, WALL.tower.height, p);
  });
}

// ---------------- стены: объёмная кладка, круглые башни, передний парапет ----------------
type Palette = (typeof PALETTES)[CastleTheme];
/**
 * Стены замка в пикселях: верх кладки (толщина стены, видна сверху), ряд камня, цоколь у пола, толщина боковых стен,
 * круглые башни по углам (центр от края, радиусы основания, где основание, высота дальних и ближних,
 * высота ряда камней, число зубцов), передний парапет
 * (высота слоя, где начинается его верх, глубина верха, половина проёма для ворот арены).
 */
const WALL = {
  cap: 10, stone: { w: 32, h: 12 }, plinthY: 78, plinthH: 10, floorY: 88, sideCap: 20,
  tower: { inset: 22, rx: 24, ry: 8, baseY: 94, height: 80, frontHeight: 44, course: 8, merlons: 10 },
  front: { h: 56, top: 24, cap: 6, gate: 32 },
} as const;

/** Камень-«подушка»: выпуклый, блик сверху-слева; оттенок чуть гуляет, на редких — трещина или мох. */
function stone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, n: number): void {
  const col = n > 0.85 ? tone(base, -0.18) : n > 0.6 ? tone(base, 0.08) : n < 0.15 ? tone(base, -0.08) : base;
  blob(c, { x, y, w, h }, ramp(col), 4);
  if (n > 0.95) { px(c, tone(col, -0.6), x + 9, y + 3); px(c, tone(col, -0.6), x + 10, y + 4); px(c, tone(col, -0.6), x + 10, y + 5); }
  if (n < 0.04) for (let i = 0; i < 4; i++) px(c, i % 2 ? '#5a7a4c' : '#4f6a48', x + 3 + i * 2, y + h - 2 + (i % 2));
}

/** Дальняя стена: сверху видна её толщина (камни кромки), ниже — кладка из выпуклых камней, у пола — круглый цоколь. */
function paintBackWall(c: CanvasRenderingContext2D, w: number, p: Palette): void {
  const { cap, stone: S, plinthY, plinthH } = WALL;
  rect(c, tone(p.wall, -0.65), 0, cap, w, plinthY - cap);   // швы
  for (let y = cap, row = 0; y < plinthY; y += S.h, row++) {
    for (let x = -24 + (row % 2) * 16; x < w; x += S.w) stone(c, x, y, S.w - 1, S.h - 1, p.wall, hash2(x, y, 7));
  }
  for (let x = -8; x < w; x += 24) blob(c, { x, y: 0, w: 23, h: cap + 1 }, ramp(tone(p.wall, 0.35)), 4);
  rect(c, '#00000048', 0, cap + 1, w, 2);   // тень от кромки на кладке
  htube(c, { x: 0, y: plinthY, w, h: plinthH }, ramp(tone(p.wall, 0.15)));
  for (let x = 20; x < w; x += 48) rect(c, tone(p.wall, -0.45), x, plinthY + 2, 1, plinthH - 3);
}

/** Боковые стены: сверху — камни кромки поперёк стены, у пола — узкая внутренняя грань (слева в тени, справа на свету). */
function paintSideWalls(c: CanvasRenderingContext2D, w: number, h: number, p: Palette): void {
  const face = CASTLE_BOUNDS.side - WALL.sideCap;
  for (const left of [true, false]) {
    const capX = left ? 0 : w - WALL.sideCap, faceX = left ? WALL.sideCap : w - CASTLE_BOUNDS.side;
    rect(c, tone(p.wall, -0.65), left ? 0 : w - CASTLE_BOUNDS.side, 0, CASTLE_BOUNDS.side, h);
    for (let y = -6, row = 0; y < h; y += WALL.stone.h, row++) {
      blob(c, { x: capX, y, w: WALL.sideCap - 1, h: WALL.stone.h - 1 }, ramp(tone(p.wall, 0.3 - (hash2(row, left ? 1 : 2, 11) > 0.7 ? 0.1 : 0))), 4);
      blob(c, { x: faceX, y: y + (row % 2) * 6, w: face, h: WALL.stone.h - 1 }, ramp(tone(p.wall, left ? -0.25 : 0.1)), 4);
    }
  }
}

/** Витраж в глубокой нише: арка из выпуклых камней, откосы (левый в тени, правый на свету), круглый подоконник. */
function paintWindow(c: CanvasRenderingContext2D, x: number, p: Palette): void {
  const arch: number[][] = [[x - 20, 68], [x - 20, 30], [x, 10], [x + 20, 30], [x + 20, 68]];
  poly(c, '#161e2b', arch);
  poly(c, tone(p.wall, -0.45), [[x - 17, 64], [x - 17, 31], [x, 15], [x - 13, 32], [x - 13, 62]]);   // левый откос
  poly(c, tone(p.wall, 0.15), [[x + 17, 64], [x + 17, 31], [x, 15], [x + 13, 32], [x + 13, 62]]);    // правый откос
  // стёкла в свинцовой сетке
  const panes = [p.light, p.cloth, p.trim, '#5a7ab0', p.light];
  c.save(); c.beginPath();
  [[x - 13, 62], [x - 13, 32], [x, 19], [x + 13, 32], [x + 13, 62]].forEach(([px0, py0], i) => i ? c.lineTo(px0!, py0!) : c.moveTo(px0!, py0!));
  c.closePath(); c.clip();
  for (let gy = 18; gy < 62; gy += 5) for (let gx = Math.floor(x - 13); gx < x + 13; gx += 4) {
    rect(c, panes[Math.floor(hash2(gx, gy, 5) * panes.length)]!, gx, gy, 4, 5);
    rect(c, '#ffffff22', gx, gy, 4, 1); rect(c, '#303b5099', gx, gy, 1, 5);
  }
  c.restore();
  rect(c, '#303b50', x - 1, 19, 3, 44); rect(c, '#303b50', x - 13, 40, 27, 3);
  // арка: камни по контуру ниши
  for (let i = 0; i < arch.length - 1; i++) {
    const [x0, y0] = arch[i]!, [x1, y1] = arch[i + 1]!, n = Math.max(1, Math.round(Math.hypot(x1! - x0!, y1! - y0!) / 7));
    for (let k = 0; k < n; k++) {
      const q = (k + 0.5) / n, ax = x0! + (x1! - x0!) * q, ay = y0! + (y1! - y0!) * q;
      blob(c, { x: Math.round(ax) - 4, y: Math.round(ay) - 3, w: 8, h: 7 }, ramp(tone(p.wall, 0.25)), 2.5);
    }
  }
  htube(c, { x: x - 22, y: 64, w: 44, h: 5 }, ramp(tone(p.wall, 0.3)));
  rect(c, p.trim, x - 18, 63, 36, 1);
}

/**
 * Круглая башня (вид 3/4): ствол-цилиндр со светотенью по столбцам, ряды камней изгибаются по дуге основания,
 * бойница спереди, наверху — зубцы по кругу. baseY — середина основания.
 */
function paintTower(c: CanvasRenderingContext2D, cx: number, baseY: number, height: number, p: Palette): void {
  const { rx, ry, course, merlons } = WALL.tower;
  const body = ramp(tone(p.wall, 0.22)), joint = tone(p.wall, -0.6), top = baseY - height;
  ellipse(c, '#00000050', cx + 3, baseY + 2, rx + 4, ry + 2);   // тень на полу
  for (let x = -rx; x <= rx; x++) {
    const n = x / (rx + 0.5), nz = Math.sqrt(1 - n * n), arc = Math.round(ry * nz), k = lit(n, -0.15, nz);
    rect(c, body[k]!, cx + x, top, 1, height + arc);
    // ряды камней идут по дуге; каждый камень выпуклый: светлее сверху, темнее снизу
    for (let y = course, row = 0; y < height; y += course, row++) {
      const y0 = top + y - course + arc;
      if (k > 0) px(c, body[k - 1]!, cx + x, y0 + 1);
      if (k < 4) px(c, body[k + 1]!, cx + x, y0 + course - 1);
      px(c, joint, cx + x, y0 + course);
      if ((x + rx + (row % 2) * 6) % 12 === 0) rect(c, joint, cx + x, y0 + 1, 1, course - 1);
    }
  }
  // бойница
  rect(c, '#0e121c', cx - 1, top + 26, 3, 14); rect(c, body[0], cx - 2, top + 40, 5, 1);
  // верх: площадка за зубцами и круглые зубцы по краю — дальние в тени, ближние поверх
  ellipse(c, body[1], cx, top, rx, ry);
  ellipse(c, tone(p.wall, -0.5), cx, top + 1, rx - 5, ry - 3);
  for (const front of [false, true]) {
    for (let i = 0; i < merlons; i++) {
      const a = ((i + 0.5) / merlons) * TAU, sy = Math.sin(a);
      if ((sy > 0) !== front) continue;
      const mx = cx + Math.round(Math.cos(a) * (rx - 3)), my = top + Math.round(sy * (ry - 1));
      blob(c, { x: mx - 4, y: my - 7, w: 8, h: 9 }, front ? body : ramp(tone(p.wall, -0.1)), 3);
    }
  }
}

export function castleFrontKey(theme: CastleTheme, gateX: number | null): string { return `castle-front-${theme}-${gateX ?? 'solid'}`; }

/**
 * Передний парапет и ближние башни — отдельный слой поверх героя: подходя к нижней стене, он заходит за кладку.
 * gateX — середина проёма для ворот (на аренах), null — сплошная стена.
 */
export function paintCastleFront(scene: Phaser.Scene, w: number, h: number, theme: CastleTheme, gateX: number | null): void {
  const key = castleFrontKey(theme, gateX);
  if (scene.textures.exists(key)) return;
  const p = PALETTES[theme], F = WALL.front;
  texture(scene, key, w, F.h, (c) => {
    const faceY = F.top + F.cap;
    rect(c, tone(p.wall, -0.7), 0, faceY, w, F.h - faceY);
    for (let y = faceY, row = 0; y < F.h; y += WALL.stone.h, row++) {
      for (let x = -24 + (row % 2) * 16; x < w; x += WALL.stone.w) stone(c, x, y, WALL.stone.w - 1, WALL.stone.h - 1, tone(p.wall, -0.12), hash2(x, y + h, 7));
    }
    for (let x = -8; x < w; x += 24) blob(c, { x, y: F.top, w: 23, h: F.cap + 2 }, ramp(tone(p.wall, 0.35)), 4);
    rect(c, '#00000040', 0, faceY + 2, w, 2);
    if (gateX !== null) {
      // проём для ворот: по краям — круглые столбы с шарами
      c.clearRect(gateX - F.gate, 0, F.gate * 2, F.h);
      for (const x of [gateX - F.gate - 1, gateX + F.gate + 1]) {
        cylinder(c, x, F.h - 2, 6, 2, F.h - F.top + 2, tone(p.wall, 0.05));
        blob(c, { x: x - 5, y: F.top - 12, w: 11, h: 10 }, ramp(tone(p.wall, 0.25)), 2);
      }
    }
    for (const x of [WALL.tower.inset, w - WALL.tower.inset]) paintTower(c, x, F.h + 4, WALL.tower.frontHeight, p);
  });
}

/** Ставит передний парапет поверх всего на карте и препятствия у оснований четырёх угловых башен. */
export function addCastleFront(scene: Phaser.Scene, colliders: Colliders, w: number, h: number, theme: CastleTheme, gateX: number | null): void {
  paintCastleFront(scene, w, h, theme, gateX);
  scene.add.image(0, h - WALL.front.h, castleFrontKey(theme, gateX)).setOrigin(0, 0).setDepth(h + 1);
  const r = 12, dx = WALL.tower.inset + 12;
  for (const x of [dx, w - dx]) { colliders.add(x, WALL.floorY + 2, r); colliders.add(x, h - CASTLE_BOUNDS.bottom - 2, r); }
}

/** Мерцающие лучи света из витражей и пылинки, медленно плывущие в них. */
export function addCastleAmbience(scene: Phaser.Scene, w: number, theme: CastleTheme): void {
  const key = `castle_shaft_${theme}`;
  if (!scene.textures.exists(key)) {
    texture(scene, key, SHAFT.w, SHAFT.h, (c) => {
      const g = c.createLinearGradient(0, 0, 0, SHAFT.h);
      g.addColorStop(0, `${PALETTES[theme].light}30`); g.addColorStop(1, `${PALETTES[theme].light}00`);
      c.fillStyle = g; c.beginPath();
      c.moveTo(0, 0); c.lineTo(26, 0); c.lineTo(SHAFT.w, SHAFT.h); c.lineTo(SHAFT.w - 85, SHAFT.h); c.closePath(); c.fill();
    });
  }
  [w * 0.2, w * 0.8].forEach((x, i) => {
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
