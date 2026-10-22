/** Ключи картинок и анимаций. Файлы лежат в src/assets, грузятся в PreloadScene. */

export const TEXTURES = {
  player: 'player',
  playerIdle: 'player-idle',
  slimeRun: 'slime-run',
  slimeRunShadow: 'slime-run-shadow',
  /** Атлас всех нарисованных объектов (tools/make_assets.py). */
  sprites: 'sprites',
  px: 'px',
  glow: 'glow',
  shadow: 'shadow',
} as const;

/** Адреса файлов. Vite сам подставляет правильные пути при сборке. */
export const URLS = {
  player: new URL('../../assets/characters/player-swordsman.png', import.meta.url).href,
  playerIdle: new URL('../../assets/characters/player-swordsman-idle.png', import.meta.url).href,
  slimeRun: new URL('../../assets/characters/slime-run.png', import.meta.url).href,
  slimeRunShadow: new URL('../../assets/characters/slime-run-shadow.png', import.meta.url).href,
  spritesPng: new URL('../../assets/sprites.png', import.meta.url).href,
  spritesJson: new URL('../../assets/sprites.json', import.meta.url).href,
  fontUiPng: new URL('../../assets/fonts/ui.png', import.meta.url).href,
  fontUiFnt: new URL('../../assets/fonts/ui.fnt', import.meta.url).href,
  fontBigPng: new URL('../../assets/fonts/big.png', import.meta.url).href,
  fontBigFnt: new URL('../../assets/fonts/big.fnt', import.meta.url).href,
  titleSky: new URL('../../assets/title/title_sky.png', import.meta.url).href,
  titleMoon: new URL('../../assets/title/title_moon.png', import.meta.url).href,
  titleHills: new URL('../../assets/title/title_hills.png', import.meta.url).href,
  titleForestFar: new URL('../../assets/title/title_forest_far.png', import.meta.url).href,
  titleForestNear: new URL('../../assets/title/title_forest_near.png', import.meta.url).href,
  titleGround: new URL('../../assets/title/title_ground.png', import.meta.url).href,
  titleVignette: new URL('../../assets/title/title_vignette.png', import.meta.url).href,
} as const;

// Порядок направлений совпадает с порядком строк в обоих листах персонажа.
export const PLAYER_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type PlayerDirection = (typeof PLAYER_DIRECTIONS)[number];

export const PLAYER_WALK_ANIMATIONS: Record<PlayerDirection, string> = {
  down: 'player-walk-down', left: 'player-walk-left', right: 'player-walk-right', up: 'player-walk-up',
};

export const PLAYER_IDLE_ANIMATIONS: Record<PlayerDirection, string> = {
  down: 'player-idle-down', left: 'player-idle-left', right: 'player-idle-right', up: 'player-idle-up',
};
export const PLAYER_WALK_SHEET = { frameSize: 64, columns: 8, frameRate: 10 } as const;
export const PLAYER_IDLE_SHEET = { frameSize: 64, columns: 12, framesPerRow: [12, 12, 12, 4], frameRate: 6 } as const;
/** Ноги персонажа на кадре 64x64 — точка, за которую его ставят на землю. */
export const PLAYER_ORIGIN = { x: 0.5, y: 0.68 } as const;

// Строки листа слизи: вниз, вверх, влево, вправо.
export const SLIME_DIRECTIONS = ['down', 'up', 'left', 'right'] as const;
export const SLIME_RUN_ANIMATIONS = {
  down: 'slime-run-down', up: 'slime-run-up',
  left: 'slime-run-left', right: 'slime-run-right',
} as const;
export const SLIME_RUN_SHEET = { frameSize: 64, columns: 8, frameRate: 12 } as const;
export const SLIME_ORIGIN = { x: 0.5, y: 0.625 } as const;
/** Высота головы слизня по кадрам цикла прыжка — для короны короля. */
export const SLIME_HEAD_Y = [27, 22, 19, 18, 21, 33, 26, 28] as const;

/** Анимации из атласа: ключ, префикс кадров, число кадров, скорость, зацикленность. */
export const ATLAS_ANIMS = [
  { key: 'campfire', prefix: 'campfire_', count: 6, rate: 9, loop: true },
  { key: 'torch', prefix: 'torch_', count: 4, rate: 8, loop: true },
  { key: 'gate', prefix: 'gate_', count: 6, rate: 7, loop: true },
  { key: 'obelisk', prefix: 'obelisk_', count: 4, rate: 4, loop: true },
  { key: 'sporeling-walk', prefix: 'sporeling_walk_', count: 6, rate: 8, loop: true },
  { key: 'sporeling-puff', prefix: 'sporeling_puff_', count: 4, rate: 7, loop: false },
  { key: 'wasp', prefix: 'wasp_', count: 4, rate: 16, loop: true },
  { key: 'slash', prefix: 'slash_', count: 5, rate: 26, loop: false },
  { key: 'spark', prefix: 'spark_', count: 4, rate: 22, loop: false },
  { key: 'dust', prefix: 'dust_', count: 4, rate: 14, loop: false },
  { key: 'poof', prefix: 'poof_', count: 5, rate: 14, loop: false },
  { key: 'glow-mushroom', prefix: 'mushroom_glow_', count: 2, rate: 2, loop: true },
] as const;
