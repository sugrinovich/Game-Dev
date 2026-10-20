/** Движение персонажей, появление и расталкивание мобов. */
export const SETTINGS = {
  player: { displaySize: 168, speed: 168, radius: 16 },
  enemy: { speed: 80, radius: 14, separationRadius: 24 },
  mobSpacing: { gap: 6, iterations: 12 },
  spawn: { startCount: 3, intervalSeconds: 2.5, maxEnemies: 14, telegraphSeconds: 0.8, minDistanceFromPlayer: 220, maxDistanceFromPlayer: 520, edgeMargin: 30 },
} as const;
