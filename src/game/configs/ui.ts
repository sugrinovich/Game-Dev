import Phaser from 'phaser';

/** Цвета и шрифты интерфейса. Меняйте тут, а не в каждом файле. */

export const UI_COLORS = {
  text: '#ffffff',
  textMuted: '#cbd5e1',
  hpFill: 0xef4444,
  hpBack: 0x3f1d1d,
  hpBorder: 0x7f1d1d,
  overlay: 0x000000,
  button: 0x334155,
  buttonHover: 0x475569,
  buttonBorder: 0x94a3b8,
} as const;

export const UI_FONT = 'system-ui, sans-serif';

/** Готовый стиль текста: размер и цвет, остальное одинаковое везде. */
export function textStyle(size: number, color: string = UI_COLORS.text): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI_FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#000000',
    strokeThickness: Math.round(size / 6),
  };
}
