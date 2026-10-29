import { SETTINGS } from './settings';
import type { BodyId, Outfit } from '../systems/HeroArt';

/** Параметры персонажа игрока. */
export interface PlayerConfig {
  /** Размер квадратного спрайта на экране в пикселях. */
  displaySize: number;
  /** пикселей в секунду */
  speed: number;
  /** радиус для столкновений */
  radius: number;
}

/** Параметры врага. */
export interface EnemyConfig {
  name: string;
  /** Тело куклы и надетые вещи (systems/HeroArt.ts): из них рисуется лист кадров в 8 сторон. */
  body: BodyId;
  outfit: Outfit;
  /** Ширина на экране в пикселях (высота — в пропорциях кадра). Равна кадру тела — пиксели 1:1. */
  displaySize: number;
  speed: number;
  radius: number;
  /** Радиус тела для расталкивания мобов. */
  separationRadius: number;
  hp: number;
  /** Урон от касания / атаки */
  damage: number;
  flying?: boolean;
}

/** Персонажи, за которых можно играть. Новый персонаж = новая запись тут. */
export const PLAYER_CHARACTERS = {
  swordsman: { ...SETTINGS.player },
} satisfies Record<string, PlayerConfig>;

/** Параметры мобов; поведение реализуется в наследниках Mob. Все враги — куклы из HeroArt: своё тело и обычные вещи. */
export const ENEMY_TYPES = {
  skeleton: { name: 'Скелет-мечник', body: 'skeleton', outfit: { weapon: 'sword', head: 'helm' }, displaySize: 32, speed: 34, radius: 5, separationRadius: 8, hp: 7, damage: 9 },
  archer: { name: 'Скелет-лучник', body: 'skeleton', outfit: { weapon: 'bow', belt: 'quiver' }, displaySize: 32, speed: 30, radius: 5, separationRadius: 8, hp: 4, damage: 6 },
  // орда Бездны: кадр орка 36, огра 48, Короля 64 (телосложение — в HeroArt.ts)
  orc: { name: 'Орк-рубака', body: 'orc', outfit: { legs: 'loincloth', body: 'hide', weapon: 'axe' }, displaySize: 36, speed: 40, radius: 6, separationRadius: 9, hp: 6, damage: 8 },
  ogre: { name: 'Огр-громила', body: 'ogre', outfit: { legs: 'loincloth', weapon: 'club' }, displaySize: 48, speed: 22, radius: 10, separationRadius: 13, hp: 18, damage: 13 },
  king: { name: 'Король Бездны', body: 'abyssKing', outfit: { weapon: 'orb' }, displaySize: 64, speed: 26, radius: 14, separationRadius: 18, hp: 70, damage: 12, flying: true },
} satisfies Record<string, EnemyConfig>;

export type PlayerCharacterId = keyof typeof PLAYER_CHARACTERS;
export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export const DEFAULT_PLAYER: PlayerCharacterId = 'swordsman';
