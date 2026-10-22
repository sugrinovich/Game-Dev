import Phaser from 'phaser';
import { ENEMY_TYPES } from '../configs/characters';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';

type State = 'hover' | 'aim' | 'dash' | 'recover';
const ORBIT = 58;

/** Шершень: кружит вокруг игрока, предупреждает миганием и бросается. Летает над деревьями. */
export class Wasp extends Mob {
  private mode: State = 'hover';
  private timer = Phaser.Math.FloatBetween(1, 2.2);
  private orbit = Math.random() * Math.PI * 2;
  private dirX = 0;
  private dirY = 0;
  private hitThisDash = false;
  private bob = Math.random() * 6;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.wasp, arena, variant);
    this.setOrigin(0.5, 0.88);
    this.play('wasp');
    this.makeShadow(0.5);
  }

  protected move(dt: number, target: Point): void {
    this.bob += dt * 7;
    this.timer -= dt;
    const dx = target.x - this.x, dy = target.y - this.y;
    if (this.mode === 'hover') {
      this.orbit += dt * 1.4;
      const tx = target.x + Math.cos(this.orbit) * ORBIT, ty = target.y + Math.sin(this.orbit) * ORBIT;
      const vx = tx - this.x, vy = ty - this.y;
      const l = Math.hypot(vx, vy) || 1;
      const sp = Math.min(this.speed, l * 3);
      this.arena.move(this, (vx / l) * sp * dt, (vy / l) * sp * dt, this.config.radius, true);
      this.setFlipX(dx > 0);
      if (this.timer <= 0 && Math.hypot(dx, dy) < 160) { this.mode = 'aim'; this.timer = 0.45; this.setTint(0xff7a6a); this.arena.playSfx('warn'); }
    } else if (this.mode === 'aim') {
      const l = Math.hypot(dx, dy) || 1;
      this.dirX = dx / l; this.dirY = dy / l;
      this.setFlipX(dx > 0);
      if (this.timer <= 0) { this.mode = 'dash'; this.timer = 0.38; this.hitThisDash = false; this.clearTint(); }
    } else if (this.mode === 'dash') {
      this.arena.move(this, this.dirX * 190 * dt, this.dirY * 190 * dt, this.config.radius, true);
      if (!this.hitThisDash) {
        const before = this.contactCd;
        this.touch(target);
        if (this.contactCd > before) this.hitThisDash = true;
      }
      if (this.timer <= 0) { this.mode = 'recover'; this.timer = 0.7; }
    } else if (this.timer <= 0) {
      this.mode = 'hover'; this.timer = Phaser.Math.FloatBetween(1.2, 2.4);
    }
  }

  override syncVisuals(dt: number): void {
    super.syncVisuals(dt);
    // «высота» полёта: спрайт чуть качается над тенью
    this.setOrigin(0.5, 0.88 + 0.06 + Math.sin(this.bob) * 0.04);
  }

  protected override deathTints(): number[] { return [0xf2d060, 0x2a1a18, 0xd8f0ff]; }
}
