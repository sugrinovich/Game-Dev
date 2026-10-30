/*
 * Объём для пиксельных спрайтов, нарисованных кодом. Свет падает сверху-слева:
 * верхний и левый край силуэта получают тёплый блик, нижний и правый — холодную тень,
 * плюс мягкий градиент по высоте кадра (верх светлее, низ темнее — объект «стоит» на полу).
 */

// ---------------- светотень по нормали: примитивы для рисования объёмных форм ----------------
/** Прямоугольник на холсте; пустой — пропускается. */
interface Box { x: number; y: number; w: number; h: number }
function fill(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
const WARM = [255, 244, 220] as const;
const COOL = [24, 20, 40] as const;
/** Тон цвета: k > 0 — к тёплому свету, k < 0 — к холодной тени. */
export function tone(hex: string, k: number): string {
  const v = parseInt(hex.slice(1, 7), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const target = k >= 0 ? WARM : COOL;
  const a = Math.min(1, k >= 0 ? k * 0.6 : -k * 0.7);
  return `#${ch.map((x, i) => Math.round(x + (target[i]! - x) * a).toString(16).padStart(2, '0')).join('')}`;
}
/** Направление на свет: сверху-слева и чуть на зрителя — как у светотени силуэтов ниже. */
const LIGHT_DIR = { x: -0.5, y: -0.62, z: 0.6 } as const;
/** Ступени тона материала: блик, свет, основной, тень, глубокая тень. */
export type Ramp = readonly [string, string, string, string, string];
/** Готовые палитры: одна и та же палитра не пересчитывается (текстуры 3D-моделей спрашивают её на каждый пиксель). */
const rampCache = new Map<string, Ramp>();
export function ramp(base: string): Ramp {
  let r = rampCache.get(base);
  if (!r) { r = [tone(base, 0.55), tone(base, 0.25), base, tone(base, -0.3), tone(base, -0.6)]; rampCache.set(base, r); }
  return r;
}
/** Номер ступени тона для нормали (nx, ny, nz): чем больше света падает, тем светлее. */
export function lit(nx: number, ny: number, nz: number): number {
  const d = nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + nz * LIGHT_DIR.z;
  return d > 0.92 ? 0 : d > 0.7 ? 1 : d > 0.42 ? 2 : d > 0.18 ? 3 : 4;
}
/**
 * Объёмная форма, вписанная в прямоугольник r: |u|^k + |v|^k ≤ 1 (k = 2 — овал, 3–4 — скруглённый брусок).
 * Тон — по нормали поверхности, ступенями. Одинаковые соседние пиксели рисуются одной полоской.
 */
export function blob(c: CanvasRenderingContext2D, r: Box, tones: Ramp, k = 2): void {
  const rx = r.w / 2, ry = r.h / 2, cx = r.x + rx, cy = r.y + ry;
  for (let y = r.y; y < r.y + r.h; y++) {
    const v = (y + 0.5 - cy) / ry, ny = Math.sign(v) * Math.abs(v) ** (k - 1);
    let x0 = r.x, cur = '';
    for (let x = r.x; x <= r.x + r.w; x++) {
      let col = '';
      const u = (x + 0.5 - cx) / rx;
      if (x < r.x + r.w && Math.abs(u) ** k + Math.abs(v) ** k <= 1) {
        const nx = Math.sign(u) * Math.abs(u) ** (k - 1);
        col = tones[lit(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)))]!;
      }
      if (col !== cur) { if (cur) fill(c, cur, x0, y, x - x0, 1); x0 = x; cur = col; }
    }
  }
}
/** Вертикальный цилиндр (рука, нога, рукоять): тон по столбцам, свет слева. */
export function tube(c: CanvasRenderingContext2D, r: Box, tones: Ramp): void {
  for (let x = r.x; x < r.x + r.w; x++) {
    const u = r.w < 2 ? 0 : ((x + 0.5 - r.x) / r.w) * 2 - 1;
    fill(c, tones[lit(u, -0.15, Math.sqrt(1 - u * u))]!, x, r.y, 1, r.h);
  }
}
/** Конус-трапеция (мантия, юбка): верх шириной от xt0 до xt1, низ — от xb0 до xb1; тон по столбцам. */
export function cone(c: CanvasRenderingContext2D, y0: number, y1: number, xt0: number, xt1: number, xb0: number, xb1: number, tones: Ramp): void {
  for (let y = y0; y < y1; y++) {
    const k = (y - y0) / Math.max(1, y1 - y0 - 1);
    const l = Math.round(xt0 + (xb0 - xt0) * k), r = Math.round(xt1 + (xb1 - xt1) * k);
    let x0 = l, cur = '';
    for (let x = l; x <= r + 1; x++) {
      const u = ((x + 0.5 - l) / (r + 1 - l)) * 2 - 1;
      const col = x > r ? '' : tones[lit(u, -0.15, Math.sqrt(Math.max(0, 1 - u * u)))]!;
      if (col !== cur) { if (cur) fill(c, cur, x0, y, x - x0, 1); x0 = x; cur = col; }
    }
  }
}


/** Горизонтальный цилиндр (стержень, карниз, валик): тон по строкам, верх светлее. */
export function htube(c: CanvasRenderingContext2D, r: Box, tones: Ramp): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    const v = r.h < 2 ? 0 : ((y + 0.5 - r.y) / r.h) * 2 - 1;
    fill(c, tones[lit(-0.15, v, Math.sqrt(1 - v * v))]!, r.x, y, r.w, 1);
  }
}
/**
 * Скруглённый брус в виде 3/4: верхняя грань глубиной d и передняя высотой h.
 * Обе грани — «подушки»: рёбра скруглены, блик по верхнему краю и слева, тень справа и у пола, углы срезаны.
 */
export function slab(c: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, color: string, top = tone(color, 0.3)): void {
  blob(c, { x, y, w, h: d + 2 }, ramp(top), 6);
  blob(c, { x, y: y + d, w, h }, ramp(color), 5);
}

/** Сила эффектов: 0 — нет, 1 — полностью цвет света/тени. */
export const VOLUME = {
  rimTop: 0.3, rimLeft: 0.16, rimBottom: 0.3, rimRight: 0.2,
  topLight: 0.16, bottomShade: 0.3,
} as const;
const LIGHT = [255, 244, 220] as const;
const SHADOW = [24, 20, 40] as const;
/** Тёмные пиксели, связанные с пустотой, считаются контуром и не меняются. */
const OUTLINE_LUMA = 48;

/**
 * Накладывает светотень на холст с кадрами frameW x frameH, лежащими сеткой.
 * Края соседних кадров не влияют друг на друга, поэтому все кадры анимации освещены одинаково.
 * x0, y0 — левый верхний угол обрабатываемой области (на границе кадра): лист можно оттенять по частям.
 * Написано «в лоб», без замыканий и временных массивов на каждый пиксель: лист рисуется за пару миллисекунд.
 */
export function addVolume(c: CanvasRenderingContext2D, w: number, h: number, frameW: number, frameH: number, x0 = 0, y0 = 0): void {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  const n = w * h;
  // «снаружи» = пустота + тёмный контур, до которого можно дойти из пустоты (в пределах кадра)
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] === 0) { outside[i] = 1; queue[tail++] = i; }
  const visit = (j: number): void => {
    if (outside[j]) return;
    const k = j * 4;
    if (d[k]! * 299 + d[k + 1]! * 587 + d[k + 2]! * 114 < OUTLINE_LUMA * 1000) { outside[j] = 1; queue[tail++] = j; }
  };
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w, y = (i - x) / w, fx = x % frameW, fy = y % frameH;
    if (fx > 0) visit(i - 1);
    if (fx < frameW - 1) visit(i + 1);
    if (fy > 0) visit(i - w);
    if (fy < frameH - 1) visit(i + w);
  }
  for (let y = 0; y < h; y++) {
    const fy = y % frameH, g = fy / frameH;
    const gradLit = (Math.max(0, 0.35 - g) / 0.35) * VOLUME.topLight;
    const gradDark = (Math.max(0, g - 0.55) / 0.45) * VOLUME.bottomShade;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (outside[i]) continue;
      const fx = x % frameW;
      let lit = (fy === 0 || outside[i - w]) ? VOLUME.rimTop : (fx === 0 || outside[i - 1]) ? VOLUME.rimLeft : 0;
      let dark = (fy === frameH - 1 || outside[i + w]) ? VOLUME.rimBottom : (fx === frameW - 1 || outside[i + 1]) ? VOLUME.rimRight : 0;
      lit = Math.min(1, lit + gradLit); dark = Math.min(1, dark + gradDark);
      const k = i * 4;
      for (let ch = 0; ch < 3; ch++) {
        let v = d[k + ch]!;
        v += (LIGHT[ch]! - v) * lit;
        v += (SHADOW[ch]! - v) * dark;
        d[k + ch] = v;
      }
    }
  }
  c.putImageData(img, x0, y0);
}

/**
 * Скругление прямых углов силуэта. Угол скругляется, если деталь в обе стороны от него не короче minSide,
 * а обе его стороны ровные (снаружи пусто) на длину flat. Крупный угол срезается на radius 2
 * (в первой строке 2 пикселя, во второй — 1), мелкий — на 1 пиксель. Тонкие детали (ноги, руки, клинки)
 * и уже круглые формы (у ступенек эллипса стороны короткие) не трогаются.
 */
export const ROUNDING = [
  { radius: 2, minSide: 6, flat: 4 },
  { radius: 1, minSide: 4, flat: 3 },
] as const;
type Rounding = (typeof ROUNDING)[number];
/** Углы: куда смотрят две пустые стороны угла. */
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/**
 * Срезает углы силуэтов в каждом кадре (рисовать до светотени и контура — они лягут уже по скруглённому краю).
 * За краем кадра — не пустота: то, что обрезано краем кадра, не скругляется.
 */
export function roundCorners(c: CanvasRenderingContext2D, w: number, h: number, frameW: number, frameH: number, x0 = 0, y0 = 0): void {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  // прозрачность пикселя кадра с началом (ox, oy); −1 — за краем кадра
  const alpha = (ox: number, oy: number, fx: number, fy: number): number =>
    fx < 0 || fy < 0 || fx >= frameW || fy >= frameH ? -1 : d[((oy + fy) * w + ox + fx) * 4 + 3]!;
  // сторона угла от (fx, fy) вглубь по (dx, dy): деталь не короче minSide, снаружи (по (nx, ny)) пусто на flat пикселей
  const side = (ox: number, oy: number, fx: number, fy: number, dx: number, dy: number, nx: number, ny: number, r: Rounding): boolean => {
    for (let k = 0; k < r.minSide; k++) if (alpha(ox, oy, fx + dx * k, fy + dy * k) <= 0) return false;
    for (let k = 0; k < r.flat; k++) if (alpha(ox, oy, fx + dx * k + nx, fy + dy * k + ny) !== 0) return false;
    return true;
  };
  const cut: number[] = [];
  for (let y = 0; y < h; y++) {
    const fy = y % frameH, oy = y - fy;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i * 4 + 3] === 0) continue;
      const fx = x % frameW, ox = x - fx;
      for (const [sx, sy] of CORNERS) {
        if (alpha(ox, oy, fx + sx, fy) !== 0 || alpha(ox, oy, fx, fy + sy) !== 0 || alpha(ox, oy, fx - sx, fy - sy) <= 0) continue;
        const r = ROUNDING.find((t) => side(ox, oy, fx, fy, -sx, 0, 0, sy, t) && side(ox, oy, fx, fy, 0, -sy, sx, 0, t));
        if (!r) continue;
        cut.push(i);
        if (r.radius === 2) cut.push(i - sx, i - sy * w);
        break;
      }
    }
  }
  // срезаем после обхода: решение по каждому углу принято по исходной картинке
  for (const i of cut) d[i * 4 + 3] = 0;
  c.putImageData(img, x0, y0);
}

/** Цвет контура вокруг силуэтов. */
const OUTLINE = [29, 24, 34] as const;

/** Тёмный контур в 1 пиксель вокруг силуэта в каждом кадре — объект читается на любом полу. */
export function addOutline(c: CanvasRenderingContext2D, w: number, h: number, frameW: number, frameH: number, x0 = 0, y0 = 0): void {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y % frameH;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i * 4 + 3]! > 0) continue;
      const fx = x % frameW;
      if ((fx > 0 && d[(i - 1) * 4 + 3]! > 0) || (fx < frameW - 1 && d[(i + 1) * 4 + 3]! > 0)
        || (fy > 0 && d[(i - w) * 4 + 3]! > 0) || (fy < frameH - 1 && d[(i + w) * 4 + 3]! > 0)) edge[i] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!edge[i]) continue;
    d[i * 4] = OUTLINE[0]; d[i * 4 + 1] = OUTLINE[1]; d[i * 4 + 2] = OUTLINE[2]; d[i * 4 + 3] = 255;
  }
  c.putImageData(img, x0, y0);
}
