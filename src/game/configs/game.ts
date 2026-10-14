/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

export const GAME = {
  width: 960,
  height: 640,
  backgroundColor: '#0f172a',
} as const;

export const SCENES = {
  boot: 'BootScene',
  game: 'GameScene',
} as const;

/** Что рисуется поверх чего: больше число — ближе к игроку. */
export const DEPTH = {
  floor: 0,
  items: 2,
  markers: 3,
  enemies: 4,
  player: 5,
  hud: 20,
  menu: 40,
} as const;
