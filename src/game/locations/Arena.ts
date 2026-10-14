import Phaser from 'phaser';
import { DEPTH } from '../configs/game';
import type { LocationConfig } from '../configs/locations';
import type { Point } from '../types';

/**
 * Локация: рисует пол, сетку и стены и знает границы игрового поля.
 * Персонажи спрашивают у неё, где можно ходить.
 */
export class Arena {
  readonly bounds: Phaser.Geom.Rectangle;

  constructor(scene: Phaser.Scene, config: LocationConfig) {
    const { x, y, width, height } = config.bounds;
    this.bounds = new Phaser.Geom.Rectangle(x, y, width, height);

    // пол
    scene.add.rectangle(x, y, width, height, config.floorColor).setOrigin(0, 0).setDepth(DEPTH.floor);

    // сетка
    const grid = scene.add.graphics().setDepth(DEPTH.floor);
    grid.lineStyle(1, config.gridColor, 1);
    for (let gx = x + config.gridSize; gx < x + width; gx += config.gridSize) {
      grid.lineBetween(gx, y, gx, y + height);
    }
    for (let gy = y + config.gridSize; gy < y + height; gy += config.gridSize) {
      grid.lineBetween(x, gy, x + width, gy);
    }

    // стены (рамка снаружи поля)
    const t = config.wallThickness;
    scene.add
      .rectangle(x + width / 2, y + height / 2, width + t, height + t)
      .setStrokeStyle(t, config.wallColor)
      .setDepth(DEPTH.floor + 1);
  }

  /** Случайная точка внутри арены, не ближе margin к стенам. */
  randomPoint(margin: number): Point {
    return {
      x: Phaser.Math.Between(this.bounds.left + margin, this.bounds.right - margin),
      y: Phaser.Math.Between(this.bounds.top + margin, this.bounds.bottom - margin),
    };
  }

  /** Не даёт объекту выйти за стены. */
  keepInside(target: Point, radius: number): void {
    target.x = Phaser.Math.Clamp(target.x, this.bounds.left + radius, this.bounds.right - radius);
    target.y = Phaser.Math.Clamp(target.y, this.bounds.top + radius, this.bounds.bottom - radius);
  }
}
