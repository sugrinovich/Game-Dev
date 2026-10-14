import Phaser from 'phaser';
import { DEPTH } from '../configs/game';
import { SETTINGS, type WeaponId } from '../configs/settings';
import type { Point } from '../types';
import type { EnemyManager } from './EnemyManager';

export class Weapons {
  private cooldown = 0;
  private angle = 0;
  private readonly visuals: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly enemies: EnemyManager, private readonly player: Point) {}

  update(dt: number, id: WeaponId): void {
    this.cooldown -= dt;
    this.angle += dt * 3;
    if (id === 'sword') this.updateSwords();
    if (this.cooldown > 0) return;
    const config = SETTINGS.weapons[id];
    if (id === 'blaster') this.shoot(config.damage, config.speed);
    if (id === 'sword') this.hitAround(42, config.damage);
    if (id === 'pulse') this.hitAround(config.radius, config.damage);
    this.cooldown = config.cooldown;
  }

  private shoot(damage: number, speed: number): void {
    const target = this.enemies.enemies.reduce<Phaser.GameObjects.Sprite | null>((best, enemy) => {
      if (!best) return enemy;
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < Phaser.Math.Distance.Between(this.player.x, this.player.y, best.x, best.y) ? enemy : best;
    }, null);
    if (!target) return;
    const bullet = this.scene.add.circle(this.player.x, this.player.y, 5, 0xfacc15).setDepth(DEPTH.player);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    this.scene.tweens.add({ targets: bullet, x: target.x, y: target.y, duration: (distance / speed) * 1000, onComplete: () => { this.enemies.damage(target as never, damage); bullet.destroy(); } });
  }

  private hitAround(radius: number, damage: number): void {
    for (const enemy of [...this.enemies.enemies]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) <= radius) this.enemies.damage(enemy, damage);
    }
  }

  private updateSwords(): void {
    while (this.visuals.length < 2) this.visuals.push(this.scene.add.rectangle(0, 0, 8, 34, 0xcbd5e1).setDepth(DEPTH.player));
    this.visuals.forEach((visual, index) => { const sword = visual as Phaser.GameObjects.Rectangle; const angle = this.angle + index * Math.PI; sword.setPosition(this.player.x + Math.cos(angle) * 42, this.player.y + Math.sin(angle) * 42).setRotation(angle + Math.PI / 2); });
  }
}
