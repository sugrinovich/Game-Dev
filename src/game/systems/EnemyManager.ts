import Phaser from 'phaser';
import { Enemy } from '../characters/Enemy';
import type { Player } from '../characters/Player';
import { TEXTURES } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { DEPTH } from '../configs/game';
import type { LocationConfig } from '../configs/locations';
import type { Arena } from '../locations/Arena';
import type { Point } from '../types';

type EnemySpawnConfig = LocationConfig['enemySpawn'];

/** Враг, который ещё не появился: на его месте мигает красная метка. */
interface PendingSpawn {
  x: number;
  y: number;
  timeLeft: number;
  marker: Phaser.GameObjects.Image;
}

/**
 * Управляет всеми врагами: когда и где они появляются,
 * как идут к игроку и не слипаются ли друг с другом.
 */
export class EnemyManager {
  readonly enemies: Enemy[] = [];

  private readonly pending: PendingSpawn[] = [];
  private spawnTimer = 0;
  private readonly scene: Phaser.Scene;
  private readonly arena: Arena;
  private readonly config: EnemySpawnConfig;

  constructor(scene: Phaser.Scene, arena: Arena, config: EnemySpawnConfig) {
    this.scene = scene;
    this.arena = arena;
    this.config = config;
  }

  /** Первые враги в начале игры. */
  begin(target: Point): void {
    for (let i = 0; i < this.config.startCount; i++) {
      this.queueSpawn(target);
    }
  }

  update(dt: number, target: Point): void {
    this.updateSpawnTimer(dt, target);
    this.updatePending(dt);

    for (const enemy of this.enemies) {
      enemy.chase(dt, target);
    }
    this.separate();
  }

  /** Враг, который сейчас касается игрока (или null). */
  findTouching(player: Player): Enemy | null {
    return (
      this.enemies.find(
        (enemy) =>
          Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y) <
          enemy.config.radius + player.config.radius,
      ) ?? null
    );
  }

  damage(enemy: Enemy, amount: number): void {
    enemy.hp -= amount;
    enemy.setTint(0xffdd88);
    if (enemy.hp <= 0) {
      enemy.destroy();
      const index = this.enemies.indexOf(enemy);
      if (index >= 0) this.enemies.splice(index, 1);
    }
  }

  private updateSpawnTimer(dt: number, target: Point): void {
    this.spawnTimer += dt;
    if (this.spawnTimer < this.config.intervalSeconds) return;

    this.spawnTimer = 0;
    if (this.enemies.length + this.pending.length < this.config.maxEnemies) {
      this.queueSpawn(target);
    }
  }

  /** Выбирает место и ставит туда мигающую метку. */
  private queueSpawn(target: Point): void {
    let point = this.arena.randomPoint(this.config.edgeMargin);
    for (let i = 0; i < 20; i++) {
      if (Phaser.Math.Distance.Between(point.x, point.y, target.x, target.y) >= this.config.minDistanceFromPlayer) break;
      point = this.arena.randomPoint(this.config.edgeMargin);
    }

    const marker = this.scene.add.image(point.x, point.y, TEXTURES.spawnMarker).setDepth(DEPTH.markers);
    this.pending.push({ x: point.x, y: point.y, timeLeft: this.config.telegraphSeconds, marker });
  }

  /** Когда метка догорела — на её месте появляется враг. */
  private updatePending(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const spawn = this.pending[i];
      if (!spawn) continue;
      spawn.timeLeft -= dt;
      spawn.marker.setAlpha(0.55 + 0.45 * Math.sin(spawn.timeLeft * 18));

      if (spawn.timeLeft <= 0) {
        spawn.marker.destroy();
        this.pending.splice(i, 1);
        this.enemies.push(new Enemy(this.scene, spawn.x, spawn.y, ENEMY_TYPES[this.config.enemyType]));
      }
    }
  }

  /** Расталкивает врагов, чтобы они не стояли друг в друге. */
  private separate(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (!a || !b) continue;
        const minDistance = a.config.radius + b.config.radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < minDistance) {
          const push = (minDistance - distance) / 2;
          a.x -= (dx / distance) * push;
          a.y -= (dy / distance) * push;
          b.x += (dx / distance) * push;
          b.y += (dy / distance) * push;
        }
      }
      const enemy = this.enemies[i];
      if (enemy) this.arena.keepInside(enemy, enemy.config.radius);
    }
  }
}
