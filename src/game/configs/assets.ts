/** Ключи картинок и анимаций. Файлы лежат в src/assets, грузятся в BootScene. */

export const TEXTURES = {
  player: 'player-potato',
  enemy: 'enemy-alien',
  coin: 'coin',
  spawnMarker: 'spawn-marker',
} as const;

export const ANIMATIONS = {
  player: 'player-walk',
  enemy: 'enemy-walk',
  coin: 'coin-spin',
} as const;
