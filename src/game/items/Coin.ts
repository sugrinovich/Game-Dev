import Phaser from 'phaser';
import { ANIMATIONS, TEXTURES } from '../configs/assets';
import { DEPTH } from '../configs/game';

/** Монета на земле. Сама ничего не делает, подбором занимается CoinSpawner. */
export class Coin extends Phaser.GameObjects.Sprite {
  readonly radius = 14;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.coin);
    scene.add.existing(this);
    this.setDepth(DEPTH.items);
    this.play(ANIMATIONS.coin);
  }
}
