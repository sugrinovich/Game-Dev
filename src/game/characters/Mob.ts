import Phaser from 'phaser';
import type { EnemyConfig } from '../configs/characters';
import { DEPTH } from '../configs/game';
import type { Point } from '../types';

const SPEED_VARIATION = { min: 0.9, max: 1.15 } as const;

/** Общие размер и скорость; поведение движения задаёт конкретный моб. */
export abstract class Mob extends Phaser.GameObjects.Sprite {
  readonly config: EnemyConfig;
  protected readonly speed: number;

  protected constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig) {
    super(scene, x, y, config.texture);
    this.config = config;
    // у каждого врага чуть своя скорость, чтобы толпа не шла идеальной кучей
    this.speed = config.speed * Phaser.Math.FloatBetween(SPEED_VARIATION.min, SPEED_VARIATION.max);

    scene.add.existing(this);
    this.setDepth(DEPTH.enemies);
    this.setDisplaySize(config.displaySize, config.displaySize);
  }

  chase(dt: number, target: Point): void {
    this.move(dt, target);
  }

  protected abstract move(dt: number, target: Point): void;

}
