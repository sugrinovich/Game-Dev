/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

export const GAME = {
  title: 'ОСАДА БЕЗДНЫ',
  subtitle: 'последний рыцарь замка',
  /** Внутреннее разрешение. Окно масштабируется целым числом раз — пиксели остаются квадратными. */
  width: 480,
  height: 270,
  targetFps: 60,
  frameHistory: 5,
  backgroundColor: 0x10151e,
  saveKey: 'abyss-siege/save-v1',
  settingsKey: 'abyss-siege/settings-v1',
} as const;

export const SCENES = {
  boot: 'BootScene',
  preload: 'PreloadScene',
  menu: 'MenuScene',
  base: 'BaseScene',
  expedition: 'ExpeditionScene',
  ui: 'UIScene',
} as const;

/** Объекты мира сортируются по Y (глубина = Y ног). Эти слои всегда сверху. */
export const DEPTH = {
  ground: -10,
  decals: -5,
  fx: 100000,
  prompt: 100100,
  overlay: 100200,
} as const;

export const COLORS = {
  text: 0xfff0ce,
  dim: 0xa5a9b1,
  good: 0x9be06a,
  bad: 0xff6a5a,
  gold: 0xf2d060,
  shadow: 0x1d1822,
  panel: 0x202735,
  panelLight: 0x394354,
  accent: 0xd8b46a,
} as const;
