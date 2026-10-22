/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

export const GAME = {
  title: 'ЛАГЕРЬ У ЧАЩИ',
  subtitle: 'выживание · вылазки · строительство',
  /** Внутреннее разрешение. Окно масштабируется целым числом раз — пиксели остаются квадратными. */
  width: 480,
  height: 270,
  targetFps: 60,
  frameHistory: 5,
  backgroundColor: 0x17131c,
  saveKey: 'camp-at-the-thicket/save-v1',
  settingsKey: 'camp-at-the-thicket/settings-v1',
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
  dim: 0x9a8f86,
  good: 0x9be06a,
  bad: 0xff6a5a,
  gold: 0xf2d060,
  shadow: 0x1d1822,
  panel: 0x2a2030,
  panelLight: 0x4a3a50,
  accent: 0x5fe0d4,
} as const;
