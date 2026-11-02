import Phaser from 'phaser';
import { CANVAS_SCALE } from '../configs/game';
import { readableCanvas } from './CastleModels';

/*
 * Парадный портрет на колонне тронного зала (HD, рисуется кодом): золотая рама, фон — триколор,
 * человек в тёмном костюме с белой рубашкой и бордовым галстуком; внизу — латунная табличка с подписью.
 * Размеры — пиксели игры; холст детальнее (CANVAS_SCALE) — портрет на экране пиксель в пиксель.
 */

/** Ключ текстуры, размер рамы (пиксели игры), ширина рамы, подпись на табличке. */
export const PORTRAIT = { key: 'hall_portrait', w: 16, h: 21, frame: 1.6, caption: 'В. В. Путин' } as const;
const R = CANVAS_SCALE * 2;

function ellipse(c: CanvasRenderingContext2D, color: string, x: number, y: number, rx: number, ry: number): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

/** Картина внутри рамы: фон, плечи и костюм, лицо и волосы. (0, 0) — левый верх холста картины, w x h. */
function paintSitter(c: CanvasRenderingContext2D, w: number, h: number): void {
  // фон — российский флаг, приглушённый
  const bands = ['#e8e8ec', '#2a4ea0', '#c0303a'];
  bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i * h) / 3, w, h / 3 + 0.1); });
  const shade = c.createRadialGradient(w / 2, h * 0.42, 1, w / 2, h * 0.42, h * 0.7);
  shade.addColorStop(0, 'rgba(10, 14, 30, 0.05)'); shade.addColorStop(1, 'rgba(10, 14, 30, 0.55)');
  c.fillStyle = shade; c.fillRect(0, 0, w, h);
  const cx = w / 2;
  // плечи: тёмно-синий костюм, белая рубашка, бордовый галстук
  c.fillStyle = '#1c2236';
  c.beginPath(); c.moveTo(cx - 6.2, h); c.quadraticCurveTo(cx - 6, h * 0.68, cx - 2.2, h * 0.62); c.lineTo(cx + 2.2, h * 0.62); c.quadraticCurveTo(cx + 6, h * 0.68, cx + 6.2, h); c.fill();
  c.fillStyle = '#f2f2f4'; c.beginPath(); c.moveTo(cx - 1.4, h * 0.62); c.lineTo(cx + 1.4, h * 0.62); c.lineTo(cx, h * 0.82); c.fill();
  c.fillStyle = '#7a1a2a'; c.beginPath(); c.moveTo(cx - 0.45, h * 0.65); c.lineTo(cx + 0.45, h * 0.65); c.lineTo(cx + 0.6, h * 0.86); c.lineTo(cx, h * 0.92); c.lineTo(cx - 0.6, h * 0.86); c.fill();
  c.strokeStyle = '#0e1220'; c.lineWidth = 0.25;
  c.beginPath(); c.moveTo(cx - 1.4, h * 0.62); c.lineTo(cx - 0.4, h * 0.9); c.moveTo(cx + 1.4, h * 0.62); c.lineTo(cx + 0.4, h * 0.9); c.stroke();
  // шея и лицо: узкое, высокий лоб, светлые редеющие волосы по бокам
  ellipse(c, '#d8a888', cx, h * 0.6, 1.3, 1.1);
  const fy = h * 0.4, face = c.createLinearGradient(cx - 2.4, 0, cx + 2.4, 0);
  face.addColorStop(0, '#c89070'); face.addColorStop(0.45, '#ecc2a2'); face.addColorStop(1, '#c08868');
  c.fillStyle = face; c.beginPath(); c.ellipse(cx, fy, 2.35, 3.15, 0, 0, Math.PI * 2); c.fill();
  ellipse(c, '#c89070', cx - 2.35, fy + 0.3, 0.45, 0.75); ellipse(c, '#c89070', cx + 2.35, fy + 0.3, 0.45, 0.75);
  c.fillStyle = '#b8a07a';
  c.beginPath(); c.ellipse(cx - 1.9, fy - 1.6, 0.7, 1.3, 0.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + 1.9, fy - 1.6, 0.7, 1.3, -0.3, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(190, 165, 125, 0.55)'; c.beginPath(); c.ellipse(cx, fy - 2.7, 1.6, 0.45, 0, 0, Math.PI * 2); c.fill();
  // брови, глаза, нос, губы
  c.strokeStyle = '#a08a6a'; c.lineWidth = 0.22;
  c.beginPath(); c.moveTo(cx - 1.5, fy - 0.55); c.lineTo(cx - 0.55, fy - 0.65); c.moveTo(cx + 0.55, fy - 0.65); c.lineTo(cx + 1.5, fy - 0.55); c.stroke();
  for (const dx of [-1, 1]) { ellipse(c, '#f4f0ea', cx + dx, fy - 0.15, 0.42, 0.22); ellipse(c, '#4a6a9a', cx + dx, fy - 0.15, 0.2, 0.2); }
  c.strokeStyle = '#a8705a'; c.lineWidth = 0.2;
  c.beginPath(); c.moveTo(cx + 0.1, fy - 0.2); c.lineTo(cx + 0.35, fy + 0.9); c.lineTo(cx - 0.2, fy + 1); c.stroke();
  c.strokeStyle = '#9a5a4a'; c.lineWidth = 0.25;
  c.beginPath(); c.moveTo(cx - 0.75, fy + 1.75); c.quadraticCurveTo(cx, fy + 1.85, cx + 0.75, fy + 1.75); c.stroke();
  // блик на лбу
  ellipse(c, 'rgba(255, 240, 225, 0.45)', cx - 0.5, fy - 1.9, 0.9, 0.5);
}

/** Текстура портрета (один раз): золотая рама с фаской, картина, тень под рамой и табличка. */
export function makePortraitTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PORTRAIT.key)) return;
  const P = PORTRAIT, plate = 3.2, W = P.w, H = P.h + plate;
  const tex = readableCanvas(scene, P.key, Math.round(W * R), Math.round(H * R));
  if (!tex) return;
  const c = tex.getContext();
  c.imageSmoothingEnabled = true;
  c.scale(R, R);
  // рама: золото с фаской (светлее сверху-слева)
  const gold = c.createLinearGradient(0, 0, W, P.h);
  gold.addColorStop(0, '#fff0a8'); gold.addColorStop(0.4, '#d6a84a'); gold.addColorStop(1, '#7a5418');
  c.fillStyle = gold; c.fillRect(0, 0, W, P.h);
  c.fillStyle = '#5a3c10'; c.fillRect(P.frame - 0.3, P.frame - 0.3, W - P.frame * 2 + 0.6, P.h - P.frame * 2 + 0.6);
  c.save(); c.translate(P.frame, P.frame);
  c.beginPath(); c.rect(0, 0, W - P.frame * 2, P.h - P.frame * 2); c.clip();
  paintSitter(c, W - P.frame * 2, P.h - P.frame * 2);
  c.restore();
  // табличка под рамой
  const py = P.h + 0.6;
  c.fillStyle = '#b8903a'; c.fillRect(2.2, py, W - 4.4, plate - 1);
  c.fillStyle = '#2a1e10'; c.font = `bold ${1.5}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(P.caption, W / 2, py + (plate - 1) / 2 + 0.1);
  (tex.customData as { resolution?: number }).resolution = R;
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
