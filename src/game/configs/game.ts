/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

export const GAME = {
  title: 'ОСАДА БЕЗДНЫ',
  subtitle: 'последний рыцарь замка',
  /** Размер экрана игры в её пикселях: все координаты сцен и интерфейса — в этих единицах. */
  width: 480,
  height: 270,
  /**
   * Чёткость: сколько пикселей холста приходится на пиксель игры. Камеры увеличивают сцену в столько же раз,
   * поэтому прежняя графика выглядит как раньше, а персонажи, иконки и текст рисуются в этом разрешении — детальнее.
   */
  resolution: 2,
  /** Гладкие пиксели: при увеличении «лесенки» на краях срезаются ровными линиями (systems/SmoothPixels.ts). false — как раньше. */
  smoothPixels: true,
  targetFps: 60,
  frameHistory: 5,
  backgroundColor: 0x10151e,
  saveKey: 'abyss-siege/save-v1',
  settingsKey: 'abyss-siege/settings-v1',
} as const;

/** Как часто по надписям пробегает искра (секунды, случайно в пределах): в HUD — реже, чтобы не мешать игре. */
export const GLINT_EVERY = { hud: [7, 12], menu: [2.5, 5] } as const;

export const SCENES = {
  boot: 'BootScene',
  preload: 'PreloadScene',
  menu: 'MenuScene',
  base: 'BaseScene',
  room: 'RoomScene',
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
  /** Текст — светлая сталь клинка (как клинок меча на экране загрузки, но в отблеске света). */
  text: 0xdfe7f0,
  dim: 0xa5a9b1,
  /** Заголовки, ленты и название игры — сталь в самом ярком отблеске. */
  blade: 0xeef3f8,
  /** Надписи меню и окон — светлая сталь; под курсором темнеют до цвета клинка (hover), у золотых — goldHover. */
  label: 0xf2f6fa,
  hover: 0xa8b0bc,
  goldHover: 0xb8963c,
  good: 0x9be06a,
  bad: 0xff6a5a,
  gold: 0xf2d060,
  shadow: 0x1d1822,
  panel: 0x202735,
  panelLight: 0x394354,
  accent: 0xd8b46a,
} as const;
