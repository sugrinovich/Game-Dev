import Phaser from 'phaser';
import { ENEMY_TYPES } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';

type State = 'walk' | 'windup' | 'cool';
const NOTICE = 170;
const BURST_RADIUS = 32;

/** Гриб-споровик: медленно идёт к игроку, замирает и выпускает облако спор. */
export class Sporeling extends Mob {
  private mode: State = 'walk';
  private timer = 0;
  private cooldown = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.sporeling, arena, variant);
    this.setOrigin(0.5, 0.88);
    this.play('sporeling-walk');
    this.makeShadow(0.7);
  }

  protected move(dt: number, target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.mode === 'walk') {
      if (dist < NOTICE && dist > 26) {
        this.arena.move(this, (dx / dist) * this.speed * dt, (dy / dist) * this.speed * dt, this.config.radius);
        this.play('sporeling-walk', true);
        this.setFlipX(dx < 0);
      } else if (dist >= NOTICE) {
        this.setFrame('sporeling_walk_0');
        this.anims.stop();
      }
      if (dist < 40 && this.cooldown <= 0) {
        this.mode = 'windup'; this.timer = 0.62;
        this.play('sporeling-puff');
        this.arena.fx.ring(this.x, this.y, BURST_RADIUS, 0x55c3e8, 0.62);
        this.arena.playSfx('warn');
      }
    } else if (this.mode === 'windup') {
      this.timer -= dt;
      this.x += Math.sin(this.timer * 80) * 0.25;
      if (this.timer <= 0) {
        this.arena.fx.burst({ x: this.x, y: this.y - 8, count: 26, speed: [20, 70], life: [0.5, 0.9], size: [2, 4], tints: [0x55c3e8, 0xb5f0ff, 0x2f7fc2], drag: 2, depth: this.y + 5 });
        this.arena.playSfx('poof');
        if (Math.hypot(target.x - this.x, target.y - this.y) < BURST_RADIUS + SETTINGS.player.radius) this.arena.hurtPlayer(this.config.damage, this.x, this.y);
        this.mode = 'cool'; this.timer = 0.6; this.cooldown = 2.2;
        this.play('sporeling-walk');
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.mode = 'walk';
    }
  }

  protected override deathTints(): number[] { return [0xd94a64, 0xf6efe0, 0x55c3e8]; }
}
