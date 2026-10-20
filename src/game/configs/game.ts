/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

export const GAME = {
  width: 960,
  height: 640,
  targetFps: 60,
  frameHistory: 5,
  backgroundColor: 0x17131c,
} as const;

export const SCENES = {
  boot: 'BootScene',
  game: 'GameScene',
} as const;

/** Что рисуется поверх чего: больше число — ближе к игроку. */
export const DEPTH = {
  shadows: 1.5,
  enemies: 4,
  player: 5,
} as const;

