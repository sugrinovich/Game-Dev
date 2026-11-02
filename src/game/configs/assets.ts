/** Ключи картинок и анимаций. Файлов картинок нет: всё рисуется кодом на экране загрузки (systems/*Art.ts). */

export const TEXTURES = {
  px: 'px',
  /** Мягкая круглая точка (HD): частицы — искры, дым, пыль. */
  dot: 'fx_dot',
  glow: 'glow',
  shadow: 'shadow',
} as const;

// Порядок направлений = порядок строк в листах героя. Диагонали — вполоборота (правые — зеркалом левых).
export const PLAYER_DIRECTIONS = ['down', 'left', 'right', 'up', 'down-left', 'down-right', 'up-left', 'up-right'] as const;
export type PlayerDirection = (typeof PLAYER_DIRECTIONS)[number];

/**
 * Лист героя: кадр 40x40 (запас по краям — длинное оружие в кадрах удара не обрезается), в строке сначала кадры ходьбы,
 * затем покоя. Скорость — кадров в секунду.
 */
export const HERO_SHEET = { frameSize: 40, walkFrames: 12, walkRate: 18, idleFrames: 12, idleRate: 8, attackFrames: 6 } as const;
/** Ноги героя на кадре 40x40 — точка, за которую его ставят на землю (ground в телосложении человека, HeroArt.ts). */
export const HERO_ORIGIN = { x: 0.5, y: 34 / 40 } as const;
