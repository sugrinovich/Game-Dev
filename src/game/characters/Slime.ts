import Phaser from 'phaser';
import { SLIME_ORIGIN, SLIME_RUN_ANIMATIONS, TEXTURES } from '../configs/assets';
import { ENEMY_TYPES, type EnemyConfig } from '../configs/characters';
import { DEPTH } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';

/** Скорость по кадрам прыжка: в воздухе быстрее, в приземлении почти стоит. */
const HOP_SPEED = [0.15, 0.7, 1.5, 1.7, 1.3, 0.35, 0.1, 0.15] as const;
const AGGRO_RADIUS = 150;

/** Слизень: прыгает за игроком, а если игрока нет рядом — бродит. */
export class Slime extends Mob {
  protected readonly slimeShadow: Phaser.GameObjects.Image;
  private wanderX = 0;
  private wanderY = 0;
  private wanderT = 0;
  private stuckT = 0;
  private sideT = 0;
  private sideSign = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}, config: EnemyConfig = ENEMY_TYPES.slime) {
    super(scene, x, y, config, arena, variant);
    this.setOrigin(SLIME_ORIGIN.x, SLIME_ORIGIN.y);
    this.play(SLIME_RUN_ANIMATIONS.down);
    this.anims.setProgress(Math.random());
    this.slimeShadow = scene.add.image(x, y, TEXTURES.slimeRunShadow, this.frame.name)
      .setOrigin(SLIME_ORIGIN.x, SLIME_ORIGIN.y).setScale(this.scaleX, this.scaleY).setDepth(DEPTH.decals + 2);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow);
      this.slimeShadow.destroy();
    });
  }

  // POST_UPDATE идёт после анимации, движения и расталкивания толпы.
  private readonly syncShadow = (): void => {
    if (!this.active) return;
    this.slimeShadow.setPosition(this.x, this.y).setVisible(this.visible).setAlpha(this.alpha).setScale(this.scaleX, this.scaleY);
    if (this.slimeShadow.frame.name !== this.frame.name) this.slimeShadow.setFrame(this.frame.name);
  };

  protected hopFactor(): number { return HOP_SPEED[Number(this.frame.name) % 8] ?? 1; }

  protected move(dt: number, target: Point): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    let mx = 0;
    let my = 0;
    if (dist < AGGRO_RADIUS) {
      mx = dx / (dist || 1); my = dy / (dist || 1);
      this.touch(target);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = Phaser.Math.FloatBetween(1.5, 3.5);
        const a = Math.random() < 0.4 ? 0 : Phaser.Math.FloatBetween(0, Math.PI * 2);
        this.wanderX = Math.random() < 0.4 ? 0 : Math.cos(a) * 0.6;
        this.wanderY = Math.random() < 0.4 ? 0 : Math.sin(a) * 0.6;
      }
      mx = this.wanderX; my = this.wanderY;
    }
    // упёрлись в дерево — обходим сбоку
    if (this.sideT > 0) {
      this.sideT -= dt;
      const t = mx; mx = -my * this.sideSign; my = t * this.sideSign;
    }
    const step = this.speed * this.hopFactor() * dt;
    // у самого игрока останавливаемся (как в исходной версии — не наезжаем на него)
    const stop = this.config.radius + SETTINGS.player.radius;
    const go = dist > stop || dist >= AGGRO_RADIUS;
    if ((mx !== 0 || my !== 0) && go) {
      const blocked = this.arena.move(this, mx * step, my * step, this.config.radius);
      if (blocked && step > 0.01) {
        this.stuckT += dt;
        if (this.stuckT > 0.35 && this.sideT <= 0) { this.sideT = 0.7; this.sideSign = Math.random() < 0.5 ? 1 : -1; this.stuckT = 0; }
      } else { this.stuckT = Math.max(0, this.stuckT - dt); }
    }
    if (mx !== 0 || my !== 0) {
      const horizontal = Math.abs(mx) > Math.abs(my);
      this.face(SLIME_RUN_ANIMATIONS[horizontal ? (mx < 0 ? 'left' : 'right') : (my < 0 ? 'up' : 'down')]);
    }
  }

  protected face(animation: string): void {
    if (this.anims.currentAnim?.key === animation) return;
    // На повороте сохраняем фазу прыжка, чтобы тело не меняло высоту скачком.
    const progress = this.anims.getProgress();
    this.play(animation);
    this.anims.setProgress(progress);
  }

  protected override deathTints(): number[] { return [0x63c99f, 0x98f0bf, 0x51a38a]; }
}
