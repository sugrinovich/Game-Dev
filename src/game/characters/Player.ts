import Phaser from 'phaser';
import type { PlayerConfig } from '../configs/characters';
import { PLAYER_WALK_ANIMATIONS, PLAYER_IDLE_ANIMATIONS, type PlayerDirection } from '../configs/assets';
import { DEPTH } from '../configs/game';

type MoveKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

/** Персонаж игрока: движение стрелками / WASD и анимации. */
export class Player extends Phaser.GameObjects.Sprite {
  readonly config: PlayerConfig;

  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: MoveKeys;
  private facing: PlayerDirection = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    super(scene, x, y, config.texture);
    this.config = config;
    this.setDisplaySize(config.displaySize, config.displaySize);
    this.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    scene.add.existing(this);
    this.setDepth(DEPTH.player);
    this.play(PLAYER_IDLE_ANIMATIONS.down);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MoveKeys;
  }

  /** Вызывается каждый кадр. dt — секунды с прошлого кадра. */
  tick(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    // Движение по четырём направлениям: вертикальная клавиша имеет приоритет.
    if (dy !== 0) dx = 0;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      this.x += dx * this.config.speed * dt;
      this.y += dy * this.config.speed * dt;
    }
    const marginX = Math.min(this.config.radius, this.scene.scale.width / 2);
    const marginY = Math.min(this.config.radius, this.scene.scale.height / 2);
    this.x = Phaser.Math.Clamp(this.x, marginX, this.scene.scale.width - marginX);
    this.y = Phaser.Math.Clamp(this.y, marginY, this.scene.scale.height - marginY);

    if (moving) {
      this.facing = this.getFacingDirection(dx, dy);
      this.play(PLAYER_WALK_ANIMATIONS[this.facing], true);
    } else {
      this.play(PLAYER_IDLE_ANIMATIONS[this.facing], true);
    }

  }

  private getFacingDirection(dx: number, dy: number): PlayerDirection {
    if (dy !== 0) return dy < 0 ? 'up' : 'down';
    return dx < 0 ? 'left' : 'right';
  }
}
