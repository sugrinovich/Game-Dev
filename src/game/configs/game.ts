/** Общие настройки игры: размер экрана, имена сцен, порядок отрисовки. */

/**
 * Управление: одна клавиша на каждое действие (code — KeyboardEvent.code, label — как подписать на клавише).
 * Удар — пробел, в ту сторону, куда смотрит герой. menu — открыть и закрыть меню (паузу); остальные окна
 * закрываются своей кнопкой «Закрыть», инвентарь — inventory. Не ESC: в браузере он выходит из полноэкранного режима
 * и может не дойти до игры. В окнах выбора: W / S — пункт, E — выбрать.
 */
export const KEYS = {
  up: { code: 'KeyW', label: 'W' }, left: { code: 'KeyA', label: 'A' }, down: { code: 'KeyS', label: 'S' }, right: { code: 'KeyD', label: 'D' },
  attack: { code: 'Space', label: 'ПРОБЕЛ' },
  dash: { code: 'ShiftLeft', label: 'SHIFT' },
  interact: { code: 'KeyE', label: 'E' },
  potion: { code: 'KeyQ', label: 'Q' },
  inventory: { code: 'Tab', label: 'TAB' },
  rotate: { code: 'KeyR', label: 'R' },
  menu: { code: 'KeyP', label: 'P' },
} as const;
/** Подпись левой кнопки мыши (перетаскивание в окнах; на телефоне — касание). */
export const MOUSE_LABEL = 'ЛКМ';

export const GAME = {
  /** Название игры на заставке и подзаголовок под ним. */
  title: 'ПОСЛЕДНИЙ РЫЦАРЬ',
  subtitle: 'Осада Бездны',
  /** Размер экрана игры в её пикселях: все координаты сцен и интерфейса — в этих единицах. */
  width: 480,
  height: 270,
  /**
   * Чёткость: сколько пикселей холста приходится на пиксель игры. Камеры увеличивают сцену в столько же раз,
   * поэтому прежняя графика выглядит как раньше, а персонажи, иконки и текст рисуются в этом разрешении — детальнее.
   */
  resolution: 2,
  /**
   * Гладкие пиксели: при увеличении «лесенки» на краях срезаются ровными линиями (systems/SmoothPixels.ts).
   * Выключено: каждый кадр копирует весь холст во второй WebGL-холст (просадка FPS), а срезанные углы на мелком узоре
   * камня мигают при прокрутке — пол и стены «рябят». Холст и так увеличивается в целое число пикселей экрана.
   */
  smoothPixels: false,
  targetFps: 60,
  frameHistory: 5,
  backgroundColor: 0x10151e,
  /** Ключ сохранения: v2 — новая схема (карманы, сундук, подсказки); старые сохранения не читаются. */
  saveKey: 'abyss-siege/save-v2',
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
