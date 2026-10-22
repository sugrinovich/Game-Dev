import Phaser from 'phaser';
import { COLORS } from '../configs/game';
import { TEXTURES } from '../configs/assets';
import { RESOURCE_INFO, type ResourceId } from '../configs/items';
import { session } from '../state/Session';
import type { Effects } from './Effects';
import { audio } from './Sfx';

interface Drop {
  kind: ResourceId; icon: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number; z: number; vz: number; age: number;
}

/** Добыча на земле: вылетает дугой, притягивается к игроку и падает в рюкзак. */
export class LootManager {
  private readonly drops: Drop[] = [];
  private fullCooldown = 0;
  onPickup: ((kind: ResourceId, amount: number) => void) | null = null;
  onFull: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly fx: Effects) {}

  spawn(x: number, y: number, kind: ResourceId, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.FloatBetween(18, 46);
      const icon = this.scene.add.image(x, y, TEXTURES.sprites, RESOURCE_INFO[kind].icon).setOrigin(0.5, 0.8);
      const shadow = this.scene.add.image(x, y, TEXTURES.shadow).setScale(0.35);
      this.drops.push({ kind, icon, shadow, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 6, vz: Phaser.Math.FloatBetween(70, 110), age: 0 });
    }
  }

  update(dt: number, player: Phaser.GameObjects.Sprite & { alive: boolean }): void {
    this.fullCooldown = Math.max(0, this.fullCooldown - dt);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      if (d.z > 0 || d.vz > 0) {
        d.vz -= 320 * dt; d.z += d.vz * dt;
        if (d.z <= 0) { d.z = 0; d.vz = d.vz < -40 ? -d.vz * 0.35 : 0; d.vx *= 0.4; d.vy *= 0.4; }
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      const dx = player.x - d.x, dy = (player.y - 6) - d.y;
      const dist = Math.hypot(dx, dy);
      const room = session.carryCount < session.capacity;
      if (d.age > 0.4 && player.alive) {
        if (dist < 48 && room) {
          const pull = 150 + (48 - dist) * 4;
          d.x += (dx / dist) * pull * dt; d.y += (dy / dist) * pull * dt;
        }
        if (dist < 11) {
          if (room) {
            session.addCarry(d.kind, 1);
            audio.play('pickup');
            this.fx.burst({ x: d.x, y: d.y - 4, count: 4, speed: [10, 30], life: [0.2, 0.35], size: [1, 2], tints: [0xfff0a0, 0xffffff], depth: d.y + 4 });
            this.onPickup?.(d.kind, 1);
            d.icon.destroy(); d.shadow.destroy();
            this.drops.splice(i, 1);
            continue;
          } else if (this.fullCooldown <= 0) {
            this.fullCooldown = 2.5;
            this.fx.floatText(player.x, player.y - 30, 'Рюкзак полон!', COLORS.bad);
            audio.play('error');
            this.onFull?.();
          }
        }
      }
      const bob = d.z <= 0 ? Math.sin(d.age * 5 + i) * 1.2 : 0;
      d.icon.setPosition(d.x, d.y - d.z - 2 + bob).setDepth(d.y + 0.2);
      d.shadow.setPosition(d.x, d.y + 1).setDepth(d.y - 0.6).setAlpha(Math.max(0.25, 1 - d.z / 30));
    }
  }

  clear(): void { for (const d of this.drops) { d.icon.destroy(); d.shadow.destroy(); } this.drops.length = 0; }
}
