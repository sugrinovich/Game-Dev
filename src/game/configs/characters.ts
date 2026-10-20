import { TEXTURES } from './assets';
import { SETTINGS } from './settings';

/** Параметры персонажа игрока. */
export interface PlayerConfig {
  texture: string;
  /** Размер квадратного спрайта на экране в пикселях. */
  displaySize: number;
  /** пикселей в секунду */
  speed: number;
  /** радиус для столкновений */
  radius: number;
}

/** Параметры врага. */
export interface EnemyConfig {
  texture: string;
  displaySize: number;
  speed: number;
  radius: number;
  /** Радиус тела для расталкивания мобов. */
  separationRadius: number;
}

/** Персонажи, за которых можно играть. Новый персонаж = новая запись тут. */
export const PLAYER_CHARACTERS = {
  swordsman: {
    texture: TEXTURES.player,
    ...SETTINGS.player,
  },
} satisfies Record<string, PlayerConfig>;

/** Параметры мобов; поведение реализуется в наследниках Mob. */
export const ENEMY_TYPES = {
  slime: {
    texture: TEXTURES.slimeRun,
    displaySize: 128,
    ...SETTINGS.enemy,
  },
} satisfies Record<string, EnemyConfig>;

export type PlayerCharacterId = keyof typeof PLAYER_CHARACTERS;
export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export const DEFAULT_PLAYER: PlayerCharacterId = 'swordsman';
