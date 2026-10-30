import Phaser from 'phaser';
import { ENEMY_TYPES, type EnemyConfig } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import { SLASH_ORIGIN } from '../systems/MobArt';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';

/**
 * Как бьёт громила: дальность, замах (успейте отойти), пауза после удара и между ударами.
 * slamRadius > 0 — удар дубиной по земле: круг-предупреждение и урон всем в круге.
 */
interface BruteAttack { reach: number; windup: number; recover: number; cooldown: number; slamRadius: number }
const ORC_ATTACK: BruteAttack = { reach: 18, windup: 0.35, recover: 0.3, cooldown: 1.1, slamRadius: 0 };
const OGRE_ATTACK: BruteAttack = { reach: 26, windup: 0.75, recover: 0.6, cooldown: 2.2, slamRadius: 26 };

type State = 'chase' | 'windup' | 'recover';

/** Громила орды: идёт к герою (в 8 сторон), замахивается (краснеет, оружие занесено) и бьёт: орк — наискось, огр — сверху в землю. */
abstract class Brute extends Mob {
  private mode: State = 'chase';
  private timer = 0;
  private cooldown = 0.8;
  private readonly slamAt = new Phaser.Math.Vector2();

  protected constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig, private readonly attack: BruteAttack, arena: Arena, variant: MobVariant, shadow: number) {
    super(scene, x, y, config, arena, variant);
    this.makeShadow(shadow);
  }

  protected move(dt: number, target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.mode === 'chase') {
      this.face(dx, dy);
      const walking = dist > this.attack.reach - 4;
      if (walking) this.step(dt, dx, dy);
      this.animate(walking);
      if (dist < this.attack.reach && this.cooldown <= 0) this.windUp(dx / dist, dy / dist);
    } else if (this.mode === 'windup') {
      this.timer -= dt;
      this.windupPose(this.timer, this.attack.windup);
      if (this.timer <= 0) {
        this.strike(target, dx / dist, dy / dist);
        this.mode = 'recover'; this.timer = this.attack.recover; this.cooldown = this.attack.cooldown;
        this.recoverPose(0, this.timer);
      }
    } else if ((this.timer -= dt) <= 0) this.mode = 'chase';
    else this.recoverPose(this.attack.recover - this.timer, this.timer);
  }

  private windUp(ux: number, uy: number): void {
    this.mode = 'windup'; this.timer = this.attack.windup;
    this.animate(false);
    this.setTint(0xff9a8a);
    this.arena.playSfx('warn');
    if (this.attack.slamRadius > 0) {
      // удар по земле перед собой: круг показывает, куда упадёт дубина
      this.slamAt.set(this.x + ux * this.attack.reach * 0.6, this.y + uy * this.attack.reach * 0.6);
      this.arena.fx.ring(this.slamAt.x, this.slamAt.y, this.attack.slamRadius, 0xff5a4a, this.attack.windup);
    }
  }

  private strike(target: Point, ux: number, uy: number): void {
    this.clearTint();
    if (this.attack.slamRadius > 0) {
      const { x, y } = this.slamAt;
      this.arena.playSfx('slam');
      this.arena.shake(0.006, 140);
      this.arena.fx.dust(x - 8, y); this.arena.fx.dust(x + 8, y);
      this.arena.fx.burst({ x, y, count: 14, speed: [30, 90], angle: [-Math.PI, 0], life: [0.3, 0.6], size: [2, 3], tints: [0x6a5a48, 0x8a7a68, 0x4a3a30], gravity: 200, depth: y + 2 });
      if (Math.hypot(target.x - x, target.y - y) <= this.attack.slamRadius + SETTINGS.player.radius) this.arena.hurtPlayer(this.config.damage, x, y);
      return;
    }
    this.arena.playSfx('swing');
    const fx = this.scene.add.sprite(this.x + ux * 4, this.y - 10 + uy * 4, 'slash', '0')
      .setOrigin(SLASH_ORIGIN.x, SLASH_ORIGIN.y).setRotation(Math.atan2(uy, ux)).setDepth(this.y + 30).setTint(0xffc8a0).setScale(0.85);
    fx.play('slash');
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    if (Math.hypot(target.x - this.x, target.y - this.y) <= this.attack.reach + SETTINGS.player.radius) this.arena.hurtPlayer(this.config.damage, this.x, this.y);
  }
}

/** Орк-рубака: быстрый, бьёт топором после короткого замаха. */
export class Orc extends Brute {
  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.orc, ORC_ATTACK, arena, variant, 0.8);
  }
  protected override deathTints(): number[] { return [0x5a8a3a, 0x3a6a2a, 0x6a4630]; }
}

/** Огр-громила: медленный и толстый, бьёт дубиной по земле — круг показывает, куда отойти. */
export class Ogre extends Brute {
  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.ogre, OGRE_ATTACK, arena, variant, 1.4);
  }
  protected override deathTints(): number[] { return [0xa08060, 0x7a5a40, 0x6a4a2a]; }
}
