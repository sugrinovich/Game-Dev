import Phaser from 'phaser';
import type { Mob, MobVariant } from '../characters/Mob';
import { Slime } from '../characters/Slime';
import { Sporeling } from '../characters/Sporeling';
import { Wasp } from '../characters/Wasp';
import { SlimeKing } from '../characters/SlimeKing';
import type { EnemyTypeId } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import type { Arena, Point } from '../types';

const MAX_MOVEMENT_STEP_SECONDS = 1 / 60;
const SEPARATION_TOLERANCE = 0.1;

const MOB_CLASSES = { slime: Slime, sporeling: Sporeling, wasp: Wasp, king: SlimeKing } satisfies Record<EnemyTypeId,
  new (scene: Phaser.Scene, x: number, y: number, arena: Arena, variant?: MobVariant) => Mob>;

/** Задержка появления врага: на земле виден круг-предупреждение. */
interface PendingSpawn {
  x: number;
  y: number;
  type: EnemyTypeId;
  timeLeft: number;
}

export interface EnemyManagerOptions {
  width: number;
  height: number;
  /** Можно ли поставить моба в эту точку (не вода, не дерево). */
  isFree: (x: number, y: number) => boolean;
  /** Какого моба позвать волной в этой точке карты. */
  pickType: (x: number, y: number) => EnemyTypeId;
}

/**
 * Управляет всеми врагами: когда и где они появляются,
 * как идут к игроку и не слипаются ли друг с другом.
 */
export class EnemyManager {
  readonly enemies: Mob[] = [];
  /** Вызывается, когда моб погиб (для босса, счётчиков и т.п.). */
  onDied: ((mob: Mob) => void) | null = null;
  onPhase: ((message: string) => void) | null = null;

  private readonly pending: PendingSpawn[] = [];
  private spawnTimer = 0;
  private readonly config = { ...SETTINGS.spawn };
  /** Волны выключены (например, во время боя с боссом можно остановить). */
  wavesEnabled = true;

  get activeCount(): number { return this.enemies.length + this.pending.length; }

  constructor(private readonly scene: Phaser.Scene, private readonly arena: Arena, private readonly opts: EnemyManagerOptions) {}

  /** Сразу ставит моба на карту (начальная расстановка, призыв босса). */
  spawn(type: EnemyTypeId, x: number, y: number, variant?: MobVariant): Mob {
    const MobClass = MOB_CLASSES[type];
    const mob = new MobClass(this.scene, x, y, this.arena, variant);
    mob.once('died', () => {
      const i = this.enemies.indexOf(mob);
      if (i >= 0) this.enemies.splice(i, 1);
      this.onDied?.(mob);
    });
    if (mob instanceof SlimeKing) {
      mob.on('summon', (sx: number, sy: number) => this.queueSpawnAt('slime', sx, sy, 0.7));
      mob.on('phase', (msg: string) => this.onPhase?.(msg));
    }
    this.enemies.push(mob);
    return mob;
  }

  update(dt: number, target: Point): void {
    if (this.wavesEnabled) this.updateSpawnTimer(dt, target);
    this.updatePending(dt);

    // При задержке кадра решаем движение и контакты небольшими шагами.
    const steps = Math.max(1, Math.ceil(dt / MAX_MOVEMENT_STEP_SECONDS));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const enemy of [...this.enemies]) {
        enemy.chase(step, target);
      }
      this.separate();
    }
    for (const enemy of this.enemies) enemy.syncVisuals(dt);
  }

  private updateSpawnTimer(dt: number, target: Point): void {
    this.spawnTimer += dt;
    if (this.spawnTimer < this.config.intervalSeconds) return;

    this.spawnTimer = 0;
    if (this.enemies.length + this.pending.length < this.config.maxEnemies) {
      this.queueSpawn(target);
    }
  }

  /** Случайная точка за пределами экрана, но не слишком далеко от игрока. */
  private queueSpawn(target: Point): void {
    for (let i = 0; i < 24; i++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const r = Phaser.Math.FloatBetween(this.config.minDistanceFromPlayer, this.config.maxDistanceFromPlayer);
      const x = target.x + Math.cos(a) * r, y = target.y + Math.sin(a) * r;
      if (x < 24 || y < 24 || x > this.opts.width - 24 || y > this.opts.height - 24 || !this.opts.isFree(x, y)) continue;
      this.queueSpawnAt(this.opts.pickType(x, y), x, y);
      return;
    }
  }

  private queueSpawnAt(type: EnemyTypeId, x: number, y: number, scale?: number): void {
    this.arena.fx.ring(x, y, 12, 0x63c99f, this.config.telegraphSeconds);
    this.pending.push({ x, y, type, timeLeft: this.config.telegraphSeconds });
    if (scale) this.babyScale.set(`${x}|${y}`, scale);
  }
  private readonly babyScale = new Map<string, number>();

  /** После задержки появляется моб. */
  private updatePending(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const spawn = this.pending[i];
      if (!spawn) continue;
      spawn.timeLeft -= dt;

      if (spawn.timeLeft <= 0) {
        this.pending.splice(i, 1);
        const key = `${spawn.x}|${spawn.y}`;
        const scale = this.babyScale.get(key);
        this.babyScale.delete(key);
        this.arena.fx.poof(spawn.x, spawn.y, 0.7);
        this.spawn(spawn.type, spawn.x, spawn.y, scale ? { scale, hpMul: 0.5 } : undefined);
      }
    }
  }

  /** Расталкивает врагов, чтобы они не стояли друг в друге. */
  private separate(): void {
    // Сдвиг одной пары может сблизить соседей, поэтому повторяем проход.
    for (let pass = 0; pass < SETTINGS.mobSpacing.iterations; pass++) {
      if (!this.separatePairs()) break;
    }
  }

  private separatePairs(): boolean {
    let changed = false;
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (!a || !b || a.config.flying !== b.config.flying) continue;
        const minDistance = a.config.separationRadius + b.config.separationRadius + SETTINGS.mobSpacing.gap;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= (minDistance - SEPARATION_TOLERANCE) ** 2) continue;
        changed = true;
        const distance = Math.sqrt(distanceSquared);
        if (distance === 0) {
          // У совпавших центров нет направления: разводим врагов по горизонтали.
          this.arena.move(a, -minDistance / 2, 0, a.config.radius, a.config.flying);
          this.arena.move(b, minDistance / 2, 0, b.config.radius, b.config.flying);
        } else if (distance < minDistance) {
          const push = (minDistance - distance) / 2;
          this.arena.move(a, -(dx / distance) * push, -(dy / distance) * push, a.config.radius, a.config.flying);
          this.arena.move(b, (dx / distance) * push, (dy / distance) * push, b.config.radius, b.config.flying);
        }
      }
    }
    return changed;
  }

  /** Урон по сектору (удар игрока). Возвращает число пораженных мобов. */
  strike(x: number, y: number, dirX: number, dirY: number, range: number, halfArc: number, damage: number): number {
    let hits = 0;
    const base = Math.atan2(dirY, dirX);
    for (const m of [...this.enemies]) {
      const dx = m.x - x, dy = (m.y - (m.config.flying ? 10 : 6)) - y;
      const d = Math.hypot(dx, dy);
      if (d > range + m.config.radius) continue;
      if (d > m.config.radius && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - base)) > halfArc) continue;
      m.hurt(damage, x, y, SETTINGS.combat.knockback * (damage > 3 ? 1.4 : 1));
      hits++;
    }
    return hits;
  }

  clear(): void {
    for (const e of [...this.enemies]) e.destroy();
    this.enemies.length = 0;
    this.pending.length = 0;
  }
}
