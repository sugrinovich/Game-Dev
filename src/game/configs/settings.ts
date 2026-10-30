/** Движение персонажей, бой, появление мобов. Все числа — в пикселях внутреннего разрешения (480x270). */
export const SETTINGS = {
  player: { displaySize: 32, speed: 60, radius: 5 },
  mobSpacing: { gap: 2, iterations: 8 },
  /** Волны мобов в вылазке: дальше от игрока, чем виден экран. */
  spawn: { intervalSeconds: 9, maxEnemies: 22, telegraphSeconds: 0.9, minDistanceFromPlayer: 170, maxDistanceFromPlayer: 280 },
  combat: {
    baseDamage: 2, attackCooldown: 0.42, attackRange: 26, attackHalfArc: 1.15, hitStopMs: 45,
    iFrames: 0.9, dashSpeed: 210, dashTime: 0.17, dashCooldown: 1.2, knockback: 140,
  },
  /** poulticeMax — сколько эликсиров восполняет отдых у костра (купить их нельзя). */
  base: { baseHp: 60, poulticeHeal: 35, poulticeMax: 1 },
  expedition: { returnHoldSeconds: 1.3 },
  /** Крупные объекты зала (торговец, постройки, жаровни) уменьшаются до этой высоты — примерно рост героя. */
  props: { maxHeight: 32 },
} as const;
