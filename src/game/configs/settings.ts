/** Единый файл игровых параметров, которые удобно менять для баланса. */
export const SETTINGS = {
  phaseTwoCoins: 10,
  phaseTwoSpeedMultiplier: 1.2,
  player: { maxHp: 10, speed: 210, radius: 16, invulnerabilitySeconds: 0.7 },
  enemy: { speed: 100, hp: 3, damage: 1, radius: 14 },
  spawn: { startCount: 3, intervalSeconds: 2.5, maxEnemies: 14, telegraphSeconds: 0.8, minDistanceFromPlayer: 220, edgeMargin: 30 },
  coinSpawn: { edgeMargin: 40, minDistanceFromPlayer: 140 },
  weapons: {
    blaster: { name: 'Бластер', description: 'Пуля летит в ближайшего врага', cooldown: 0.45, damage: 1, speed: 420, radius: 5 },
    sword: { name: 'Мечи', description: 'Два меча вращаются вокруг игрока', cooldown: 0.5, damage: 2, speed: 0, radius: 12 },
    pulse: { name: 'Импульс', description: 'Круговая волна поражает врагов рядом', cooldown: 1.1, damage: 2, speed: 0, radius: 90 },
  },
} as const;

export type WeaponId = keyof typeof SETTINGS.weapons;
