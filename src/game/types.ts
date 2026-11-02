import type { Effects } from './systems/Effects';

/** Любая точка на экране (подходит и для спрайтов, у них тоже есть x и y). */
export interface Point {
  x: number;
  y: number;
}

/** То, что мобы и игрок могут просить у текущей сцены (карта, урон, эффекты). */
export interface Arena {
  readonly fx: Effects;
  /** Здесь бой (арена): магия из сумки действует только тут. */
  readonly combat: boolean;
  /** Двигает круг радиуса radius с учётом деревьев, камней и воды. Возвращает true, если упёрся. */
  move(e: Point, dx: number, dy: number, radius: number, flying?: boolean): boolean;
  /** Удар игрока по сектору. Возвращает число пораженных целей. */
  playerStrike(x: number, y: number, dirX: number, dirY: number, range: number, halfArc: number, damage: number): number;
  hurtPlayer(amount: number, fromX: number, fromY: number): void;
  /** Ближайший живой враг не дальше range от точки (самонаводящаяся магия); нет — null. */
  nearestEnemy(x: number, y: number, range: number): (Point & { active: boolean }) | null;
  shake(intensity: number, ms?: number): void;
  hitStop(ms: number): void;
  playSfx(name: string): void;
}
