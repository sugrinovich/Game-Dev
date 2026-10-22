import Phaser from 'phaser';
import { SLIME_HEAD_Y, SLIME_ORIGIN, TEXTURES } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { DEPTH } from '../configs/game';
import type { Arena, Point } from '../types';
import { Slime } from './Slime';
import type { MobVariant } from './Mob';

type State = 'chase' | 'crouch' | 'leap' | 'recover';
const SLAM_RADIUS = 42;

/**
 * Король слизней — огромный слизень с короной.
 * Каждые несколько секунд прыгает на игрока (красный круг заранее показывает место), на 66% и 33% здоровья зовёт слизней.
 * События: 'summon' (x, y), 'phase' (текст), 'died'.
 */
export class SlimeKing extends Slime {
  private mode: State = 'chase';
  private timer = 0;
  private leapCd = 3.5;
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private lift = 0;
  private summoned = 0;
  private readonly crown: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, arena, variant, ENEMY_TYPES.king);
    this.showBar = false;
    this.contactCd = 1.2;
    this.crown = scene.add.image(x, y, TEXTURES.sprites, 'crown').setOrigin(0.5, 1);
    this.makeShadow(0);
    this.shadow?.setVisible(false);
  }

  protected override move(dt: number, target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const enraged = this.hp < this.maxHp * 0.34;
    if (this.mode === 'chase') {
      if (dist < 400) super.move(dt, target);
      this.leapCd -= dt;
      if (this.leapCd <= 0 && dist < 280) {
        this.mode = 'crouch'; this.timer = 0.85;
        this.toX = target.x; this.toY = target.y;
        this.arena.fx.ring(this.toX, this.toY, SLAM_RADIUS, 0xff5a4a, 0.85);
        this.arena.playSfx('warn');
      }
    } else if (this.mode === 'crouch') {
      this.timer -= dt;
      const k = 1 - this.timer / 0.85;
      this.setScale(this.baseScale * (1 + 0.12 * k), this.baseScale * (1 - 0.22 * k));
      if (this.timer <= 0) { this.mode = 'leap'; this.timer = 0.45; this.fromX = this.x; this.fromY = this.y; }
    } else if (this.mode === 'leap') {
      this.timer -= dt;
      const k = 1 - Math.max(0, this.timer) / 0.45;
      const nx = Phaser.Math.Linear(this.fromX, this.toX, k), ny = Phaser.Math.Linear(this.fromY, this.toY, k);
      this.arena.move(this, nx - this.x, ny - this.y, 4, true);
      this.lift = Math.sin(k * Math.PI) * 46;
      this.setScale(this.baseScale * (1 - 0.1 * Math.sin(k * Math.PI)), this.baseScale * (1 + 0.15 * Math.sin(k * Math.PI)));
      if (this.timer <= 0) this.land(target);
    } else {
      this.timer -= dt;
      this.setScale(this.baseScale);
      if (this.timer <= 0) { this.mode = 'chase'; this.leapCd = enraged ? 2.6 : 4.6; }
    }
  }

  private land(target: Point): void {
    this.lift = 0;
    this.mode = 'recover'; this.timer = 0.8;
    this.setScale(this.baseScale * 1.18, this.baseScale * 0.8);
    this.arena.playSfx('slam');
    this.arena.shake(0.014, 320);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.arena.fx.dust(this.x + Math.cos(a) * 26, this.y + Math.sin(a) * 16);
    }
    this.arena.fx.burst({ x: this.x, y: this.y - 4, count: 22, speed: [40, 110], life: [0.3, 0.7], size: [2, 4], tints: [0x63c99f, 0x98f0bf], gravity: 150, depth: this.y + 5 });
    if (Math.hypot(target.x - this.x, target.y - this.y) < SLAM_RADIUS + 4) this.arena.hurtPlayer(14, this.x, this.y);
  }

  protected override onHurt(): void {
    const frac = this.hp / this.maxHp;
    if (this.summoned === 0 && frac < 0.67) this.summon('Король зовёт слизней!', 1);
    else if (this.summoned === 1 && frac < 0.34) this.summon('Король в ярости!', 2);
  }

  private summon(msg: string, n: number): void {
    this.summoned = n;
    this.arena.playSfx('roar');
    this.arena.shake(0.01, 400);
    this.emit('phase', msg);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit('summon', this.x + Math.cos(a) * 50, this.y + Math.sin(a) * 40);
    }
  }

  override syncVisuals(dt: number): void {
    super.syncVisuals(dt);
    if (this.dead) return;
    this.setOrigin(SLIME_ORIGIN.x, SLIME_ORIGIN.y + this.lift / this.displayHeight);
    const col = Number(this.frame.name) % 8;
    const headY = SLIME_HEAD_Y[col] ?? 24;
    const sc = this.scaleY;
    this.crown.setPosition(this.x, this.y - this.lift + (headY - 40) * sc + 2).setScale(sc * 0.95).setDepth(this.y + 1);
    this.crown.setAngle(Math.sin(this.scene.time.now / 300) * 4);
    this.slimeShadow.setDepth(DEPTH.decals + 2).setY(this.y).setVisible(this.mode !== 'leap');
  }

  override destroy(fromScene?: boolean): void {
    this.crown?.destroy();
    super.destroy(fromScene);
  }
}
