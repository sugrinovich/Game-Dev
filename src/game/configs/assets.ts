/** Ключи картинок и анимаций. Файлов картинок нет: всё рисуется кодом на экране загрузки (systems/*Art.ts). */

export const TEXTURES = {
  px: 'px',
  glow: 'glow',
  shadow: 'shadow',
} as const;

// Порядок направлений = порядок строк в листах героя. Диагонали — вполоборота (правые — зеркалом левых).
export const PLAYER_DIRECTIONS = ['down', 'left', 'right', 'up', 'down-left', 'down-right', 'up-left', 'up-right'] as const;
export type PlayerDirection = (typeof PLAYER_DIRECTIONS)[number];

/** Лист героя: кадр 32x32, в строке сначала кадры ходьбы, затем покоя. Скорость — кадров в секунду. */
export const HERO_SHEET = { frameSize: 32, walkFrames: 12, walkRate: 18, idleFrames: 12, idleRate: 8 } as const;
/** Ноги героя на кадре 32x32 — точка, за которую его ставят на землю. */
export const HERO_ORIGIN = { x: 0.5, y: 30 / 32 } as const;
