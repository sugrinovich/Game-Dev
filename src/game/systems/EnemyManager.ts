import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { Slime } from '../characters/Slime';
import type { EnemyTypeId } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import type { Point } from '../types';


const MAX_MOVEMENT_STEP_SECONDS = 1 / 60;
const SEPARATION_TOLERANCE = 0.1;

const MOB_CLASSES = { slime: Slime } satisfies Record<EnemyTypeId,
  new (scene: Phaser.Scene, x: number, y: number) => Mob>;

/** Задержка появления врага без отдельного спрайта метки. */
interface PendingSpawn {
  x: number;
  y: number;
  timeLeft: number;
}

/**
 * Управляет всеми врагами: когда и где они появляются,
 * как идут к игроку и не слипаются ли друг с другом.
 */
export class EnemyManager {
  readonly enemies: Mob[] = [];

  private readonly pending: PendingSpawn[] = [];
  private spawnTimer = 0;
  private readonly scene: Phaser.Scene;
  private readonly config = { ...SETTINGS.spawn, enemyType: 'slime' as const };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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

    // При задержке кадра решаем движение и контакты небольшими шагами.
    const steps = Math.max(1, Math.ceil(dt / MAX_MOVEMENT_STEP_SECONDS));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const enemy of this.enemies) {
        enemy.chase(step, target);
      }
      this.separate();
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

  /** Выбираем наиболее удалённую из случайных точек в окне. */
  private queueSpawn(target: Point): void {
    const { width, height } = this.scene.scale;
    const marginX = Math.min(this.config.edgeMargin, width / 2);
    const marginY = Math.min(this.config.edgeMargin, height / 2);
    let point = { x: width / 2, y: height / 2 };
    let farthest = -1;
    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const candidate = {
        x: Phaser.Math.FloatBetween(marginX, width - marginX),
        y: Phaser.Math.FloatBetween(marginY, height - marginY),
      };
      const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
      if (distance > farthest) { point = candidate; farthest = distance; }
      if (distance >= this.config.minDistanceFromPlayer && distance <= this.config.maxDistanceFromPlayer) {
        point = candidate;
        break;
      }
    }
    this.pending.push({ ...point, timeLeft: this.config.telegraphSeconds });
  }

  /** После задержки появляется моб. */
  private updatePending(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const spawn = this.pending[i];
      if (!spawn) continue;
      spawn.timeLeft -= dt;

      if (spawn.timeLeft <= 0) {
        this.pending.splice(i, 1);
        const MobClass = MOB_CLASSES[this.config.enemyType];
        this.enemies.push(new MobClass(this.scene, spawn.x, spawn.y));
      }
    }
  }

  /** Расталкивает врагов, чтобы они не стояли друг в друге. */
  private separate(): void {
    // Сдвиг одной пары может сблизить соседей, поэтому повторяем проход.
    for (let pass = 0; pass < SETTINGS.mobSpacing.iterations; pass++) {
      let changed = this.separatePairs();
      for (const enemy of this.enemies) {
        const { x, y } = enemy;
        const marginX = Math.min(enemy.config.separationRadius, this.scene.scale.width / 2);
        const marginY = Math.min(enemy.config.separationRadius, this.scene.scale.height / 2);
        enemy.x = Phaser.Math.Clamp(enemy.x, marginX, this.scene.scale.width - marginX);
        enemy.y = Phaser.Math.Clamp(enemy.y, marginY, this.scene.scale.height - marginY);
        changed ||= enemy.x !== x || enemy.y !== y;
      }
      if (!changed) break;
    }
  }

  private separatePairs(): boolean {
    let changed = false;
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (!a || !b) continue;
        const minDistance = a.config.separationRadius + b.config.separationRadius + SETTINGS.mobSpacing.gap;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= (minDistance - SEPARATION_TOLERANCE) ** 2) continue;
        changed = true;
        const distance = Math.sqrt(distanceSquared);
        if (distance === 0) {
          // У совпавших центров нет направления: разводим врагов по горизонтали.
          a.x -= minDistance / 2;
          b.x += minDistance / 2;
        } else if (distance < minDistance) {
          const push = (minDistance - distance) / 2;
          a.x -= (dx / distance) * push;
          a.y -= (dy / distance) * push;
          b.x += (dx / distance) * push;
          b.y += (dy / distance) * push;
        }
      }
    }
    return changed;
  }
}
