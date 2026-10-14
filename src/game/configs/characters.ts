import { ANIMATIONS, TEXTURES } from './assets';
import { SETTINGS } from './settings';

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
  hp: number;
  radius: number;
}

/** Персонажи, за которых можно играть. Новый персонаж = новая запись тут. */
export const PLAYER_CHARACTERS = {
  potato: {
    name: 'Картошка',
    texture: TEXTURES.player,
    animation: ANIMATIONS.player,
    ...SETTINGS.player,
  },
} satisfies Record<string, PlayerConfig>;

/** Типы врагов. Новый враг = новая запись тут (и картинка в assets). */
export const ENEMY_TYPES = {
  alien: {
    texture: TEXTURES.enemy,
    animation: ANIMATIONS.enemy,
    ...SETTINGS.enemy,
  },
} satisfies Record<string, EnemyConfig>;

export type PlayerCharacterId = keyof typeof PLAYER_CHARACTERS;
export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export const DEFAULT_PLAYER: PlayerCharacterId = 'potato';
