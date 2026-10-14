import { ANIMATIONS, TEXTURES } from './assets';

/** Параметры персонажа игрока. */
export interface PlayerConfig {
  name: string;
  texture: string;
  animation: string;
  maxHp: number;
  /** пикселей в секунду */
  speed: number;
  /** радиус для столкновений */
  radius: number;
  /** сколько секунд после удара нельзя получить урон */
  invulnerabilitySeconds: number;
}

/** Параметры врага. */
export interface EnemyConfig {
  texture: string;
  animation: string;
  speed: number;
  damage: number;
  radius: number;
}

/** Персонажи, за которых можно играть. Новый персонаж = новая запись тут. */
export const PLAYER_CHARACTERS = {
  potato: {
    name: 'Картошка',
    texture: TEXTURES.player,
    animation: ANIMATIONS.player,
    maxHp: 10,
    speed: 210,
    radius: 16,
    invulnerabilitySeconds: 0.7,
  },
} satisfies Record<string, PlayerConfig>;

/** Типы врагов. Новый враг = новая запись тут (и картинка в assets). */
export const ENEMY_TYPES = {
  alien: {
    texture: TEXTURES.enemy,
    animation: ANIMATIONS.enemy,
    speed: 100,
    damage: 1,
    radius: 14,
  },
} satisfies Record<string, EnemyConfig>;

export type PlayerCharacterId = keyof typeof PLAYER_CHARACTERS;
export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export const DEFAULT_PLAYER: PlayerCharacterId = 'potato';
