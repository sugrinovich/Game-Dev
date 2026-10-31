import Phaser from 'phaser';
import { GAME } from '../configs/game';
import { sheetJobs } from './CastleArt';
import { ball, firePaint, readableCanvas, VIEW_DIR, type Model } from './CastleModels';
import { renderModel, type Paint, type Part } from './Rig3D';

/*
 * Эффекты ударов и огненный шар Короля Бездны — всё рисуется кодом, файлов нет.
 * Сами враги (скелеты, орки, огры, Король) — куклы в 8 сторон из HeroArt.ts.
 */

const TAU = Math.PI * 2;

/** Точка вращения взмаха клинка: от неё дуга расходится вперёд. */
export const SLASH_ORIGIN = { x: 6 / 48, y: 0.5 } as const;


/** Мягкое пятно света или дыма (HD): середина color, к краю прозрачно. */
function puff(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.globalAlpha = alpha; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
}

/** Дуга удара клинком (HD): светлый серп, нарастает за 3 кадра и гаснет; по внешнему краю — белая кромка. */
function paintSlash(c: CanvasRenderingContext2D, f: number): void {
  const a0 = -1.2, a1 = 1.2, ox = 6, oy = 16, steps = 28;
  const span = a0 + (a1 - a0) * Math.min(1, (f + 1) / 3), fade = f >= 3 ? f - 2 : 0, outer = 26 - fade;
  const at = (i: number): number => a0 + ((span - a0) * i) / steps;
  c.globalAlpha = fade > 1 ? 0.5 : 1;
  c.beginPath();
  for (let i = 0; i <= steps; i++) c.lineTo(ox + Math.cos(at(i)) * outer, oy + Math.sin(at(i)) * outer);
  for (let i = steps; i >= 0; i--) {
    const u = (at(i) - a0) / (a1 - a0), r = outer - Math.max(0.2, (6 - fade * 2) * Math.sin(Math.PI * u));
    c.lineTo(ox + Math.cos(at(i)) * r, oy + Math.sin(at(i)) * r);
  }
  const g = c.createRadialGradient(ox, oy, outer - 7, ox, oy, outer);
  g.addColorStop(0, 'rgba(138, 200, 255, 0)'); g.addColorStop(0.6, '#a8d8ff'); g.addColorStop(1, '#ffffff');
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = 0.7; c.lineCap = 'round';
  c.beginPath(); c.arc(ox, oy, outer - 0.3, a0 + 0.15, span - 0.05); c.stroke();
  c.globalAlpha = 1;
}

/** Искра удара (HD): лучистая звезда с белым ядром, гаснет к жёлтому. */
function paintSpark(c: CanvasRenderingContext2D, f: number): void {
  const long = [6.5, 5, 3, 1.5][f] ?? 1, short = [4, 3, 1.8, 0.6][f] ?? 0, core = f < 2 ? '#ffffff' : f < 3 ? '#fff0a0' : '#ffb040';
  c.save(); c.shadowColor = '#ffd070'; c.shadowBlur = 2; c.lineCap = 'round';
  c.strokeStyle = '#fff0a0'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(8 - long, 8); c.lineTo(8 + long, 8); c.moveTo(8, 8 - long); c.lineTo(8, 8 + long); c.stroke();
  c.strokeStyle = '#ffd070'; c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(8 - short, 8 - short); c.lineTo(8 + short, 8 + short); c.moveTo(8 - short, 8 + short); c.lineTo(8 + short, 8 - short); c.stroke();
  c.restore();
  puff(c, 8, 8, 2.2 - f * 0.4, core, 1);
}

/** Пыль из-под ног (HD): три мягких клуба расходятся и тают. */
function paintDust(c: CanvasRenderingContext2D, f: number): void {
  const alpha = [0.85, 0.65, 0.45, 0.22][f] ?? 0.2;
  for (const [x, y, r] of [[5, 8, 2.4], [11, 8, 2.4], [8, 6, 2.6]] as const) puff(c, x + (x < 8 ? -f : x > 8 ? f : 0), y - f * 0.5, r + f * 0.6, '#c8b8a0', alpha);
}

/** Облачко исчезновения (HD): кольцо мягких клубов расходится, в первых кадрах — белая вспышка. */
function paintPoof(c: CanvasRenderingContext2D, f: number): void {
  const alpha = [1, 0.85, 0.65, 0.4, 0.18][f] ?? 0.15, r = 3 + f * 2;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + 0.3;
    puff(c, 12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r * 0.8, 3.6 - f * 0.4, '#ece8f4', alpha);
  }
  if (f < 2) puff(c, 12, 12, 4 - f, '#ffffff', 1);
}

// ---------------- огненный шар — 3D-модель ----------------
/**
 * Огненный шар Короля Бездны: раскалённое ядро, по нему клубы пламени кольцами (шар вращается, клубы дышат),
 * между клубами — тёмные пятна остывающей корки; вокруг мягкое сияние. Огонь светится сам: по краю силуэта красный,
 * к середине жёлтый и белый (firePaint). Кадр size x size пикселей игры, кадров в цикле, скорость;
 * детальность в 1,5 раза выше обычной — на заставке шар показан в 1,5 раза крупнее.
 */
const FIREBALL = { size: 40, frames: 8, rate: 18, r: 10, res: GAME.resolution * 1.5, halo: 19 } as const;
/** Кольца клубов: высота (доля радиуса) и сколько клубов; размер клуба (доля радиуса) и насколько он дышит. */
const FIRE_RINGS = [[-0.6, 4], [0, 6], [0.62, 4]] as const;
const FIRE_LUMP = { size: 0.36, breathe: 0.22, out: 0.8 } as const;
/** Остывшая корка: тёмная середина, по краю — огонь. */
const crustPaint: Paint = (s) => {
  const d = s.n[1] * VIEW_DIR[0] + s.n[2] * VIEW_DIR[1];
  return d < 0.55 ? '#ff7a22' : d < 0.8 ? '#a8300e' : '#4a140a';
};

/**
 * Кадр f: за цикл каждое кольцо поворачивается ровно на один клуб — последний кадр стыкуется с первым;
 * фаза дыхания клуба зависит от его места на кольце, поэтому стык тоже незаметен.
 */
function fireballModel(f: number): Model {
  const t = f / FIREBALL.frames, R = FIREBALL.r, parts: Part[] = [ball([0, 0, 0], [R, R, R], firePaint)];
  FIRE_RINGS.forEach(([lat, n], k) => {
    const ring = Math.sqrt(1 - lat * lat) * R * FIRE_LUMP.out;
    for (let i = 0; i < n; i++) {
      const a = ((i + t) / n) * TAU + k * 0.7, phase = TAU * (2 * t + (i + t) / n);
      const size = R * FIRE_LUMP.size * (1 + FIRE_LUMP.breathe * Math.sin(phase));
      parts.push(ball([Math.cos(a) * ring, lat * R * FIRE_LUMP.out, Math.sin(a) * ring], [size, size, size], firePaint));
      // корка — между клубами: пятна остывшей породы на ядре
      const b = a + Math.PI / n, cr = Math.sqrt(1 - lat * lat) * R * 0.9, crust = R * (k === 1 ? 0.26 : 0.2);
      if ((i + k) % 2 === 0) parts.push(ball([Math.cos(b) * cr, lat * R * 0.9, Math.sin(b) * cr], [crust, crust * 0.8, crust], crustPaint));
    }
  });
  return { parts };
}

/** Огненный шар Короля Бездны (нужен уже заставке на экране загрузки); повторный вызов ничего не делает. */
export function makeFireballSheet(scene: Phaser.Scene): void {
  const key = 'fireball';
  if (scene.textures.exists(key)) return;
  const { size, frames, res } = FIREBALL, F = Math.round(size * res);
  const tex = readableCanvas(scene, key, F * frames, F);
  if (!tex) return;
  (tex.customData as { resolution?: number }).resolution = res;
  const c = tex.getContext();
  for (let f = 0; f < frames; f++) {
    const img = c.createImageData(F, F), m = fireballModel(f);
    renderModel({ data: img.data, width: F, x: 0, y: 0, w: F, h: F }, F / 2, F / 2, m.parts, [], { facing: 0, scale: res });
    c.putImageData(img, f * F, 0);
    // сияние — позади шара
    const x = f * F + F / 2, glow = c.createRadialGradient(x, F / 2, FIREBALL.r * res * 0.6, x, F / 2, FIREBALL.halo * res);
    glow.addColorStop(0, 'rgba(255, 150, 50, 0.55)'); glow.addColorStop(0.5, 'rgba(240, 90, 30, 0.2)'); glow.addColorStop(1, 'rgba(176, 42, 20, 0)');
    c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = glow; c.fillRect(f * F, 0, F, F); c.restore();
    tex.add(String(f), 0, f * F, 0, F, F);
  }
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  if (scene.anims.exists(key)) scene.anims.remove(key);
  scene.anims.create({ key, frames: Array.from({ length: frames }, (_, f) => ({ key, frame: String(f) })), frameRate: FIREBALL.rate, repeat: -1 });
}

/** Эффекты ударов и иконки интерфейса — экран загрузки выполняет задания понемногу. */
export function effectTextureJobs(scene: Phaser.Scene): (() => void)[] {
  return [
    ...sheetJobs(scene, 'slash', 48, 32, 5, 26, paintSlash, false, 0, true),
    ...sheetJobs(scene, 'spark', 16, 16, 4, 22, paintSpark, false, 0, true),
    ...sheetJobs(scene, 'dust', 16, 12, 4, 14, paintDust, false, 0, true),
    ...sheetJobs(scene, 'poof', 24, 24, 5, 14, paintPoof, false, 0, true),
  ];
}
