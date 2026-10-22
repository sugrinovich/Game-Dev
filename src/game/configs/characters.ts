import { TEXTURES } from './assets';
import { SETTINGS } from './settings';
import type { ResourceId } from './items';

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

export interface Drop { kind: ResourceId; chance: number; min: number; max: number }

/** Параметры врага. */
export interface EnemyConfig {
  name: string;
  texture: string;
  /** Кадр в атласе (для мобов из атласа) */
  frame?: string;
  displaySize: number;
  speed: number;
  radius: number;
  /** Радиус тела для расталкивания мобов. */
  separationRadius: number;
  hp: number;
  /** Урон от касания / атаки */
  damage: number;
  drops: Drop[];
  flying?: boolean;
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
    name: 'Слизень', texture: TEXTURES.slimeRun, displaySize: 64, ...SETTINGS.enemy, hp: 4, damage: 7,
    drops: [{ kind: 'gel', chance: 0.75, min: 1, max: 2 }],
  },
  sporeling: {
    name: 'Споровик', texture: TEXTURES.sprites, frame: 'sporeling_walk_0', displaySize: 32, speed: 21, radius: 7, separationRadius: 9, hp: 8, damage: 10,
    drops: [{ kind: 'spores', chance: 0.9, min: 1, max: 2 }, { kind: 'berries', chance: 0.25, min: 1, max: 1 }],
  },
  wasp: {
    name: 'Шершень', texture: TEXTURES.sprites, frame: 'wasp_0', displaySize: 32, speed: 62, radius: 5, separationRadius: 8, hp: 3, damage: 7, flying: true,
    drops: [{ kind: 'stinger', chance: 0.5, min: 1, max: 1 }],
  },
  king: {
    name: 'Король слизней', texture: TEXTURES.slimeRun, displaySize: 150, speed: 24, radius: 22, separationRadius: 26, hp: 70, damage: 11,
    drops: [{ kind: 'royal_gel', chance: 1, min: 1, max: 1 }, { kind: 'gel', chance: 1, min: 6, max: 8 }],
  },
} satisfies Record<string, EnemyConfig>;

export type PlayerCharacterId = keyof typeof PLAYER_CHARACTERS;
export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export const DEFAULT_PLAYER: PlayerCharacterId = 'swordsman';
