import Phaser from 'phaser';
import type { PlayerConfig } from '../configs/characters';
import { DEPTH } from '../configs/game';
import type { Arena } from '../locations/Arena';

type MoveKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

/** Персонаж игрока: движение стрелками / WASD, здоровье, неуязвимость после удара. */
export class Player extends Phaser.GameObjects.Sprite {
  readonly config: PlayerConfig;
  hp: number;

  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: MoveKeys;
  private invulnerableLeft = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    super(scene, x, y, config.texture);
    this.config = config;
    this.hp = config.maxHp;

    scene.add.existing(this);
    this.setDepth(DEPTH.player);

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

  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** Вызывается каждый кадр. dt — секунды с прошлого кадра. */
  tick(dt: number, arena: Arena): void {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      this.x += (dx / length) * this.config.speed * dt;
      this.y += (dy / length) * this.config.speed * dt;
    }
    arena.keepInside(this, this.config.radius);

    if (dx !== 0) this.setFlipX(dx < 0);
    if (moving) {
      this.anims.play(this.config.animation, true);
    } else {
      this.anims.stop();
      this.setFrame(0);
    }

    this.updateInvulnerability(dt);
  }

  /** Возвращает true, если урон прошёл (а не был проигнорирован из-за неуязвимости). */
  takeDamage(amount: number): boolean {
    if (this.invulnerableLeft > 0 || this.isDead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableLeft = this.config.invulnerabilitySeconds;
    this.setTint(0xff8888);
    return true;
  }

  private updateInvulnerability(dt: number): void {
    if (this.invulnerableLeft <= 0) return;

    this.invulnerableLeft = Math.max(0, this.invulnerableLeft - dt);
    if (this.invulnerableLeft === 0 && !this.isDead) {
      this.clearTint();
      this.setAlpha(1);
    } else {
      // мигание
      this.setAlpha(Math.floor(this.invulnerableLeft * 16) % 2 === 0 ? 0.4 : 1);
    }
  }
}
