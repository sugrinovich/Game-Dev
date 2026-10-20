/** Ключи картинок и анимаций. Файлы лежат в src/assets, грузятся в BootScene. */

export const TEXTURES = {
  player: 'player',
  playerIdle: 'player-idle',
  slimeRun: 'slime-run',
  slimeRunShadow: 'slime-run-shadow',
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

// Строки листа слизи: вниз, вверх, влево, вправо.
export const SLIME_DIRECTIONS = ['down', 'up', 'left', 'right'] as const;
export const SLIME_RUN_ANIMATIONS = {
  down: 'slime-run-down', up: 'slime-run-up',
  left: 'slime-run-left', right: 'slime-run-right',
} as const;
export const SLIME_RUN_SHEET = { frameSize: 64, columns: 8, frameRate: 12 } as const;
