import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import type { ResourceId } from '../configs/items';
import type { Arena } from '../types';
import type { Circle, Colliders } from './Colliders';

export type NodeKind = 'tree' | 'rock' | 'bush' | 'berry' | 'mushroom';

interface NodeDef {
  hp: number; collider: number; reach: number; kind: NodeKind;
  drop: { res: ResourceId; min: number; max: number }[];
  chips: number[]; shadow: number;
}

/** Что можно добыть ударом дубины. Ключ — имя кадра в атласе. */
export const NODE_DEFS: Record<string, NodeDef> = {
  tree_oak_a: { hp: 8, collider: 5, reach: 9, kind: 'tree', drop: [{ res: 'wood', min: 2, max: 3 }], chips: [0x9a6c46, 0x56924a, 0x82b95a], shadow: 1.7 },
  tree_oak_b: { hp: 8, collider: 5, reach: 9, kind: 'tree', drop: [{ res: 'wood', min: 2, max: 3 }], chips: [0x9a6c46, 0x56924a, 0x82b95a], shadow: 1.7 },
  tree_oak_c: { hp: 7, collider: 5, reach: 9, kind: 'tree', drop: [{ res: 'wood', min: 2, max: 3 }], chips: [0x9a6c46, 0x56924a, 0x82b95a], shadow: 1.5 },
  tree_pine_a: { hp: 8, collider: 4, reach: 8, kind: 'tree', drop: [{ res: 'wood', min: 2, max: 4 }], chips: [0x9a6c46, 0x2c5436, 0x3b7240], shadow: 1.3 },
  tree_pine_b: { hp: 7, collider: 4, reach: 8, kind: 'tree', drop: [{ res: 'wood', min: 2, max: 3 }], chips: [0x9a6c46, 0x2c5436, 0x3b7240], shadow: 1.2 },
  rock_s: { hp: 5, collider: 6, reach: 9, kind: 'rock', drop: [{ res: 'stone', min: 1, max: 2 }], chips: [0x9594a6, 0xc0bfcc, 0x717084], shadow: 0.9 },
  rock_m: { hp: 8, collider: 9, reach: 12, kind: 'rock', drop: [{ res: 'stone', min: 2, max: 3 }], chips: [0x9594a6, 0xc0bfcc, 0x717084], shadow: 1.2 },
  rock_l: { hp: 12, collider: 14, reach: 16, kind: 'rock', drop: [{ res: 'stone', min: 3, max: 5 }], chips: [0x9594a6, 0xc0bfcc, 0x717084], shadow: 1.7 },
  bush_a: { hp: 2, collider: 0, reach: 11, kind: 'bush', drop: [{ res: 'fiber', min: 1, max: 2 }], chips: [0x56924a, 0x82b95a, 0x3b7240], shadow: 1.0 },
  bush_b: { hp: 2, collider: 0, reach: 10, kind: 'bush', drop: [{ res: 'fiber', min: 1, max: 2 }], chips: [0x56924a, 0x82b95a, 0x3b7240], shadow: 0.9 },
  bush_berry: { hp: 1, collider: 0, reach: 11, kind: 'berry', drop: [{ res: 'berries', min: 2, max: 4 }], chips: [0xe0506a, 0x56924a, 0xffa0a8], shadow: 1.0 },
  mushroom_glow_0: { hp: 1, collider: 0, reach: 9, kind: 'mushroom', drop: [{ res: 'spores', min: 1, max: 2 }], chips: [0x55c3e8, 0xb5f0ff, 0x2f7fc2], shadow: 0.7 },
};

export class ResourceNode {
  hp: number;
  alive = true;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private collider: Circle | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly arena: Arena, private readonly colliders: Colliders,
    readonly frame: string, readonly x: number, readonly y: number, readonly def: NodeDef) {
    this.hp = def.hp;
    this.shadow = scene.add.image(x, y + 1, TEXTURES.shadow).setScale(def.shadow).setDepth(y - 0.7);
    this.sprite = scene.add.sprite(x, y, TEXTURES.sprites, frame).setDepth(y);
    if (frame === 'mushroom_glow_0') this.sprite.play('glow-mushroom');
    if (def.collider > 0) this.collider = colliders.add(x, y, def.collider);
  }

  /** Удар по ресурсу. */
  hit(damage: number, fromX: number): void {
    if (!this.alive) return;
    this.hp -= damage;
    const d = this.def;
    this.arena.fx.burst({ x: this.x, y: this.y - 8, count: d.kind === 'rock' ? 6 : 8, speed: [25, 70], angle: [-Math.PI, 0], life: [0.25, 0.5], size: [2, 3], tints: d.chips, gravity: 220, depth: this.y + 3 });
    this.arena.playSfx(d.kind === 'rock' ? 'mine' : d.kind === 'tree' ? 'chop' : 'leaf');
    const dir = this.x >= fromX ? 1 : -1;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0).setScale(1);
    this.scene.tweens.add({ targets: this.sprite, angle: dir * (d.kind === 'rock' ? 0 : 4), scaleX: d.kind === 'rock' ? 1.06 : 1, scaleY: d.kind === 'rock' ? 0.94 : 1, duration: 60, yoyo: true, repeat: 1 });
    if (d.kind === 'tree') this.arena.fx.burst({ x: this.x + Phaser.Math.Between(-8, 8), y: this.y - 34, count: 2, speed: [5, 20], life: [0.8, 1.3], size: [2, 3], tints: [0x56924a, 0x82b95a, 0x3b7240], gravity: 40, depth: this.y + 3 });
    if (this.hp <= 0) this.destroyNode(dir);
  }

  private destroyNode(dir: number): void {
    this.alive = false;
    if (this.collider) this.colliders.remove(this.collider);
    const { x, y } = this;
    for (const dr of this.def.drop) this.arena.dropLoot(x, y - 4, dr.res, Phaser.Math.Between(dr.min, dr.max));
    const stumpAt = (): void => { this.scene.add.image(x, y, TEXTURES.sprites, 'stump').setDepth(y); };
    switch (this.def.kind) {
      case 'tree':
        this.arena.playSfx('chop');
        this.scene.tweens.add({
          targets: this.sprite, angle: dir * 88, alpha: 0, duration: 520, ease: 'Cubic.easeIn',
          onComplete: () => { this.arena.fx.dust(x + dir * 30, y); this.arena.shake(0.003, 80); this.sprite.destroy(); stumpAt(); },
        });
        this.arena.fx.burst({ x, y: y - 30, count: 16, speed: [20, 70], life: [0.7, 1.4], size: [2, 3], tints: this.def.chips, gravity: 60, depth: y + 3 });
        break;
      case 'rock':
        this.arena.playSfx('mine');
        this.arena.fx.dust(x, y);
        this.arena.fx.burst({ x, y: y - 6, count: 14, speed: [30, 90], life: [0.3, 0.6], size: [2, 4], tints: this.def.chips, gravity: 240, depth: y + 3 });
        this.sprite.setTexture(TEXTURES.sprites, 'rubble');
        this.scene.tweens.add({ targets: this.sprite, scaleY: { from: 1.4, to: 1 }, duration: 160 });
        break;
      case 'berry':
        this.sprite.setFrame('bush_berry_empty');
        this.arena.fx.burst({ x, y: y - 8, count: 10, speed: [20, 60], life: [0.4, 0.8], size: [2, 3], tints: this.def.chips, gravity: 160, depth: y + 3 });
        break;
      default:
        this.arena.fx.burst({ x, y: y - 6, count: 12, speed: [20, 70], life: [0.4, 0.8], size: [2, 3], tints: this.def.chips, gravity: 120, depth: y + 3 });
        this.sprite.destroy();
        break;
    }
    this.shadow.destroy();
  }

  destroy(): void { this.sprite.destroy(); this.shadow.destroy(); if (this.collider) this.colliders.remove(this.collider); }
}
