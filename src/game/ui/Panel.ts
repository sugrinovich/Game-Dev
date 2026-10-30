import Phaser from 'phaser';
import { COLORS } from '../configs/game';
import { session } from '../state/Session';
import { FONT_INK } from './PixelFont';
import { PText } from './PText';
import { addIcon } from '../systems/IconArt';

/*
 * Рыцарский интерфейс: тёмная воронёная сталь, золотые накладки и алое сукно.
 * Всё рисуется Graphics-примитивами — без картинок.
 */

/** Цвета интерфейса. */
export const UI = {
  ironDark: 0x15141c, iron: 0x3a3c48, ironLight: 0x6e7282, field: 0x16121e,
  gold: 0xd6b66d, goldLight: 0xf2d060, goldDark: 0x7a5a2a,
  cloth: 0x8a1e2a, clothLight: 0xb03040, clothDark: 0x52101a,
} as const;

export interface PanelOptions {
  /** Прозрачность поля (рама всегда плотная). */
  alpha?: number;
  /** Алый вымпел с золотым крестом над верхней кромкой (главное меню). */
  pennant?: boolean;
  /** Тонкие золотые линии внутри поля сверху и снизу (у маленьких табличек их лучше убрать — меньше тесноты). */
  rules?: boolean;
}

/** Золотой ромб-наконечник (концы полосок, украшения). */
export function drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.fillStyle(UI.goldDark, 1).fillRect(cx - 1, cy - 3, 3, 7).fillRect(cx - 3, cy - 1, 7, 3).fillRect(cx - 2, cy - 2, 5, 5);
  g.fillStyle(UI.gold, 1).fillRect(cx - 1, cy - 2, 3, 5).fillRect(cx - 2, cy - 1, 5, 3);
  g.fillStyle(UI.goldLight, 1).fillRect(cx - 1, cy - 1, 1, 1);
}

/** Окно: железная рама со скосами, тёмное поле, золотые уголки-накладки и заклёпки по сторонам. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opts: PanelOptions = {}): void {
  // рама: контур со срезанными углами, сталь с бликом сверху-слева и тенью снизу-справа
  g.fillStyle(UI.ironDark, 1).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(UI.iron, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(UI.ironLight, 1).fillRect(x + 2, y + 1, w - 4, 1).fillRect(x + 1, y + 2, 1, h - 4);
  g.fillStyle(UI.ironDark, 1).fillRect(x + 2, y + h - 2, w - 4, 1).fillRect(x + w - 2, y + 2, 1, h - 4);
  // поле с утопленной кромкой и тонкой золотой линией внутри
  g.fillStyle(UI.field, opts.alpha ?? 0.96).fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle(0x000000, 0.45).fillRect(x + 3, y + 3, w - 6, 1).fillRect(x + 3, y + 3, 1, h - 6);
  if (opts.rules !== false) g.fillStyle(UI.goldDark, 0.8).fillRect(x + 6, y + 5, w - 12, 1).fillRect(x + 6, y + h - 6, w - 12, 1);
  // золотые уголки-накладки с заклёпкой
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]] as const) {
    g.fillStyle(UI.goldDark, 1).fillRect(sx > 0 ? cx : cx - 7, sy > 0 ? cy : cy - 2, 8, 3).fillRect(sx > 0 ? cx : cx - 2, sy > 0 ? cy : cy - 7, 3, 8);
    g.fillStyle(UI.gold, 1).fillRect(sx > 0 ? cx + 1 : cx - 6, sy > 0 ? cy + 1 : cy - 1, 6, 1).fillRect(sx > 0 ? cx + 1 : cx - 1, sy > 0 ? cy + 1 : cy - 6, 1, 6);
    g.fillStyle(UI.goldLight, 1).fillRect(cx + sx, cy + sy, 1, 1);
  }
  // заклёпки посередине сторон
  g.fillStyle(UI.gold, 1).fillRect(Math.round(x + w / 2) - 1, y, 2, 2).fillRect(Math.round(x + w / 2) - 1, y + h - 2, 2, 2);
  if (h > 40) g.fillRect(x, Math.round(y + h / 2) - 1, 2, 2).fillRect(x + w - 2, Math.round(y + h / 2) - 1, 2, 2);
  if (opts.pennant) {
    const cx = Math.round(x + w / 2);
    g.fillStyle(UI.cloth, 1).fillRect(cx - 9, y - 7, 18, 9);
    g.fillTriangle(cx - 9, y + 2, cx + 9, y + 2, cx, y + 7);
    g.fillStyle(UI.gold, 1).fillRect(cx - 9, y - 7, 18, 1).fillRect(cx - 1, y - 5, 2, 7).fillRect(cx - 4, y - 3, 8, 2);
  }
}

/** Алая лента с раздвоенными хвостами — под заголовки окон, баннеры и цель. cx — центр, w — ширина ленты. */
export function drawRibbon(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, h = 14, alpha = 1): void {
  const x = Math.round(cx - w / 2);
  // концы ленты: загнуты назад и чуть ниже основной полосы, на внешнем крае — вырез «ласточкин хвост»
  const tail = Math.max(8, Math.round(h * 0.55)), drop = Math.max(3, Math.round(h * 0.2)), notch = Math.max(3, Math.round(h * 0.25));
  for (const side of [-1, 1] as const) {
    const inner = side < 0 ? x + 3 : x + w - 3, outer = side < 0 ? x - tail : x + w + tail;
    const top = y + drop, bottom = y + h + drop, mid = (top + bottom) / 2, cut = outer - side * notch;
    g.fillStyle(UI.clothDark, alpha);
    g.fillTriangle(inner, top, outer, top, cut, mid);
    g.fillTriangle(inner, top, cut, mid, inner, bottom);
    g.fillTriangle(inner, bottom, cut, mid, outer, bottom);
    // кромки хвоста и тёмная складка там, где лента уходит назад
    g.fillStyle(UI.goldDark, alpha).fillRect(Math.min(inner, outer), top, Math.abs(outer - inner), 1).fillRect(Math.min(inner, outer), bottom - 1, Math.abs(outer - inner), 1);
    const edge = side < 0 ? x : x + w;
    g.fillStyle(0x2a0810, alpha).fillTriangle(edge, y + h, edge + side * 3, y + h, edge + side * 3, y + h + drop);
  }
  g.fillStyle(UI.cloth, alpha).fillRect(x, y, w, h);
  g.fillStyle(UI.clothLight, alpha).fillRect(x, y + 1, w, 1);
  g.fillStyle(UI.clothDark, alpha).fillRect(x, y + h - 2, w, 1);
  g.fillStyle(UI.gold, alpha).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1);
}

/** y надписи на кнопке drawButton: буквы посередине видимого поля (между верхним кантом и тёмной полосой снизу). */
export function buttonTextY(y: number, h: number): number { return PText.centerY(y + (h - 1) / 2); }

/** Кнопка: алая полоса с золотыми кантами; под курсором (hover) — светлее, с бликом сверху. */
export function drawButton(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hover: boolean): void {
  g.fillStyle(hover ? UI.clothLight : UI.cloth, 1).fillRect(x, y, w, h);
  g.fillStyle(0xffffff, hover ? 0.22 : 0.1).fillRect(x, y + 1, w, 1);
  g.fillStyle(UI.clothDark, 1).fillRect(x, y + h - 2, w, 1);
  g.fillStyle(hover ? UI.goldLight : UI.gold, 1).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1);
}

/** Поля ленты заголовка вокруг самих букв (не строки шрифта): надпись не прилипает к золотым кантам. */
export const TITLE_RIBBON = { padX: 14, padY: 5, minW: 80 } as const;
/**
 * Лента заголовка окна (шрифт big): по центру cx, середина ленты — на cy (обычно верхняя кромка окна), высота — по
 * буквам плюс поля, ширина — по надписи. Возвращает y для надписи, чтобы буквы встали ровно посередине ленты.
 */
export function drawTitleRibbon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, textW: number): number {
  // высота: буквы + поля + кант сверху, тёмная полоса и кант снизу — поля над и под буквами равны
  const ink = FONT_INK.big, h = ink.bottom - ink.top + TITLE_RIBBON.padY * 2 + 3;
  const w = Math.max(TITLE_RIBBON.minW, Math.round(textW + TITLE_RIBBON.padX * 2)), y = Math.round(cy - h / 2);
  drawRibbon(g, cx, y, w, h);
  // середина видимого поля: от строки под верхним кантом до строки над тёмной полосой снизу
  return PText.centerY(y + (h - 2) / 2, 'big');
}

export interface BarColors { fill: number; light: number; back: number }
export const BAR_COLORS = {
  health: { fill: 0xb02e4c, light: 0xe0506a, back: 0x3a1420 },
  dash: { fill: 0x3f8a96, light: 0x5fe0d4, back: 0x16262c },
  boss: { fill: 0xb88a28, light: 0xfff0a0, back: 0x2a1e10 },
} as const satisfies Record<string, BarColors>;

/**
 * Полоска в железной оправе с золотыми ромбами на концах.
 * lag — «тень» прежнего значения (отпадающее здоровье), ticks — деления на равные части.
 */
export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, colors: BarColors, lag = frac, ticks = 0): void {
  g.fillStyle(UI.ironDark, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle(UI.iron, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(colors.back, 1).fillRect(x, y, w, h);
  const fw = Math.round(w * Phaser.Math.Clamp(frac, 0, 1));
  const lw = Math.round(w * Phaser.Math.Clamp(lag, 0, 1));
  if (lw > fw) g.fillStyle(0xf2e0c0, 0.55).fillRect(x + fw, y, lw - fw, h);
  g.fillStyle(colors.fill, 1).fillRect(x, y, fw, h);
  g.fillStyle(colors.light, 1).fillRect(x, y, fw, Math.max(1, Math.floor(h / 3)));
  g.fillStyle(0x000000, 0.25).fillRect(x, y + h - 1, fw, 1);
  if (ticks > 1) { g.fillStyle(UI.ironDark, 0.6); for (let i = 1; i < ticks; i++) g.fillRect(x + Math.round((w * i) / ticks), y, 1, h); }
  drawDiamond(g, x - 3, y + Math.floor(h / 2));
  drawDiamond(g, x + w + 2, y + Math.floor(h / 2));
}

/** Выпадающий список (оружие в руке): тёмное поле, железный кант, золотые уголки — как у окон. */
export function drawDropdown(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(UI.ironDark, 0.98).fillRect(x, y, w, h);
  g.lineStyle(1, UI.iron, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle(UI.gold, 1).fillRect(x, y, 2, 2).fillRect(x + w - 2, y, 2, 2).fillRect(x, y + h - 2, 2, 2).fillRect(x + w - 2, y + h - 2, 2, 2);
}

/** Выбранная строка списка — как в окнах выбора: алая полоса с золотыми кантами сверху и снизу. */
export function drawRowHighlight(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(UI.clothDark, 0.9).fillRect(x, y, w, h);
  g.fillStyle(UI.gold, 1).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1);
}

/** Небольшая плашка: подсказки, всплывающие сообщения, кнопки. Золотой кант сверху и уголки. */
export function drawPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.8): void {
  g.fillStyle(UI.ironDark, alpha).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(UI.goldDark, alpha).fillRect(x + 2, y, w - 4, 1).fillRect(x + 2, y + h - 1, w - 4, 1);
  g.fillStyle(UI.gold, alpha).fillRect(x, y + 1, 1, 1).fillRect(x + w - 1, y + 1, 1, 1).fillRect(x, y + h - 2, 1, 1).fillRect(x + w - 1, y + h - 2, 1, 1);
}

/** Цена «монета + число»: зелёная, если хватает монет. Отрисовка слева направо от x. Возвращает ширину. */
/** Цена: монета и число, оба по середине строки centerY. */
export function addCostRow(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, centerY: number, price: number, enabled = true): number {
  const icon = addIcon(scene, x, centerY, 'castle_coin', 0.75).setOrigin(0, 0.5);
  if (!enabled) icon.setAlpha(0.5);
  const t = new PText(scene, x + 13, PText.centerY(centerY), `${price}`, { color: session.data.coins >= price ? COLORS.good : COLORS.bad });
  parent.add([icon, t]);
  return 13 + t.textWidth;
}

/** Ширина ряда цены (монета + цифры шрифта ui). */
export function costWidth(price: number): number {
  return 13 + `${price}`.length * 6;
}
