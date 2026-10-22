import type { ResourceId } from './configs/items';
import type { Effects } from './systems/Effects';

/** Любая точка на экране (подходит и для спрайтов, у них тоже есть x и y). */
export interface Point {
  x: number;
  y: number;
}

/** То, что мобы и игрок могут просить у текущей сцены (карта, урон, добыча, эффекты). */
export interface Arena {
  readonly fx: Effects;
  /** Двигает круг радиуса radius с учётом деревьев, камней и воды. Возвращает true, если упёрся. */
  move(e: Point, dx: number, dy: number, radius: number, flying?: boolean): boolean;
  /** Удар игрока по сектору. Возвращает число пораженных целей. */
  playerStrike(x: number, y: number, dirX: number, dirY: number, range: number, halfArc: number, damage: number): number;
  hurtPlayer(amount: number, fromX: number, fromY: number): void;
  dropLoot(x: number, y: number, kind: ResourceId, amount: number): void;
  shake(intensity: number, ms?: number): void;
  hitStop(ms: number): void;
  playSfx(name: string): void;
}
