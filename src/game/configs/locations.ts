import type { EnemyTypeId } from './characters';

/** Всё, что описывает одну локацию: размер, цвета, правила появления врагов и монет. */
export interface LocationConfig {
  name: string;
  /** игровое поле внутри экрана */
  bounds: { x: number; y: number; width: number; height: number };
  floorColor: number;
  gridColor: number;
  wallColor: number;
  gridSize: number;
  wallThickness: number;
  playerStart: { x: number; y: number };
  enemySpawn: {
    enemyType: EnemyTypeId;
    /** сколько врагов в начале */
    startCount: number;
    /** новый враг каждые N секунд */
    intervalSeconds: number;
    maxEnemies: number;
    /** сколько секунд горит красная метка до появления врага */
    telegraphSeconds: number;
    minDistanceFromPlayer: number;
    /** отступ от стен */
    edgeMargin: number;
  };
  coinSpawn: {
    edgeMargin: number;
    minDistanceFromPlayer: number;
  };
}

export const LOCATIONS = {
  arena: {
    name: 'Арена',
    bounds: { x: 40, y: 80, width: 880, height: 520 },
    floorColor: 0x1e293b,
    gridColor: 0x273449,
    wallColor: 0x64748b,
    gridSize: 40,
    wallThickness: 8,
    playerStart: { x: 480, y: 340 },
    enemySpawn: {
      enemyType: 'alien',
      startCount: 3,
      intervalSeconds: 2.5,
      maxEnemies: 14,
      telegraphSeconds: 0.8,
      minDistanceFromPlayer: 220,
      edgeMargin: 30,
    },
    coinSpawn: {
      edgeMargin: 40,
      minDistanceFromPlayer: 140,
    },
  },
} satisfies Record<string, LocationConfig>;

export type LocationId = keyof typeof LOCATIONS;

export const DEFAULT_LOCATION: LocationId = 'arena';
