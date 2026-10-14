import Phaser from 'phaser';
import type { EnemyConfig } from '../configs/characters';
import { DEPTH } from '../configs/game';
import type { Point } from '../types';

/** Враг: просто идёт к цели. */
export class Enemy extends Phaser.GameObjects.Sprite {
  readonly config: EnemyConfig;
  private readonly speed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig) {
    super(scene, x, y, config.texture);
    this.config = config;
    // у каждого врага чуть своя скорость, чтобы толпа не шла идеальной кучей
    this.speed = config.speed * Phaser.Math.FloatBetween(0.9, 1.15);

    scene.add.existing(this);
    this.setDepth(DEPTH.enemies);
    this.play(config.animation);
    this.anims.setProgress(Math.random());
  }

  chase(dt: number, target: Point): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.x += (dx / distance) * this.speed * dt;
    this.y += (dy / distance) * this.speed * dt;
    this.setFlipX(dx < 0);
  }
}
