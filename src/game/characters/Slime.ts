import Phaser from 'phaser';
import { SLIME_RUN_ANIMATIONS, TEXTURES } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { DEPTH } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import type { Point } from '../types';
import { Mob } from './Mob';

/** Преследование по четырём направлениям без карты и поиска пути. */
export class Slime extends Mob {
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ENEMY_TYPES.slime);
    this.play(SLIME_RUN_ANIMATIONS.down);
    this.anims.setProgress(Math.random());
    this.shadow = scene.add.image(x, y, TEXTURES.slimeRunShadow, this.frame.name)
      .setScale(this.scaleX, this.scaleY).setDepth(DEPTH.shadows);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow);
      this.shadow.destroy();
    });
  }

  // POST_UPDATE идёт после анимации, движения и расталкивания толпы.
  private readonly syncShadow = (): void => {
    this.shadow.setPosition(this.x, this.y).setVisible(this.visible).setAlpha(this.alpha);
    if (this.shadow.frame.name !== this.frame.name) this.shadow.setFrame(this.frame.name);
  };

  protected move(dt: number, target: Point): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const reach = this.config.radius + SETTINGS.player.radius;
    if (Math.hypot(dx, dy) <= reach) return;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const across = Math.abs(horizontal ? dy : dx);
    const stopOffset = across < reach ? Math.sqrt(reach * reach - across * across) : 0;
    const distance = Math.min(this.speed * dt,
      Math.max(0, Math.abs(horizontal ? dx : dy) - stopOffset));
    if (horizontal) {
      this.x += Math.sign(dx) * distance;
      this.face(SLIME_RUN_ANIMATIONS[dx < 0 ? 'left' : 'right']);
    } else {
      this.y += Math.sign(dy) * distance;
      this.face(SLIME_RUN_ANIMATIONS[dy < 0 ? 'up' : 'down']);
    }
  }

  private face(animation: string): void {
    if (this.anims.currentAnim?.key === animation) return;
    // На повороте сохраняем фазу прыжка, чтобы тело не меняло высоту скачком.
    const progress = this.anims.getProgress();
    this.play(animation);
    this.anims.setProgress(progress);
  }
}
