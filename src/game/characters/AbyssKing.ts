import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { ENEMY_TYPES } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import { gripOffset, heroOrigin, ORB } from '../systems/HeroArt';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';

/**
 * Король Бездны: держит дистанцию, мечет огненные шары в точку под героем (круг — куда упадёт),
 * на 2/3 и 1/3 здоровья призывает скелетов. Время — секунды, расстояния — пиксели.
 */
const KING = {
  keep: 80, castEvery: 2.6, castEnraged: 1.6, flight: 0.9, blastRadius: 24, hover: 4,
  phases: [0.66, 0.33],
} as const;

/** Точка опоры на кадре Короля: парение поднимает её над тенью. */
const ORIGIN = heroOrigin(ENEMY_TYPES.king.body);

interface Bolt { sprite: Phaser.GameObjects.Sprite; from: Phaser.Math.Vector2; ctrl: Phaser.Math.Vector2; to: Phaser.Math.Vector2; t: number }

export class AbyssKing extends Mob {
  private castT = 1.5;
  private bob = 0;
  private phase = 0;
  private readonly bolts: Bolt[] = [];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly pos = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.king, arena, variant);
    this.showBar = false;   // у босса своя полоска внизу экрана
    this.glow = scene.add.image(x, y, TEXTURES.glow).setTint(0x8a3aff).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 3).setAlpha(0.35);
    this.makeShadow(1.4);
  }

  protected move(dt: number, target: Point): void {
    this.updateBolts(dt, target);
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.face(dx, dy);
    // держит дистанцию: подлетает издалека, отлетает, если герой слишком близко (смотрит на героя всегда)
    const dir = dist > KING.keep + 20 ? 1 : dist < KING.keep - 20 ? -1 : 0;
    if (dir) this.step(dt, dx * dir, dy * dir);
    this.animate(dir !== 0);
    this.touch(target);
    if ((this.castT -= dt) <= 0) {
      this.castT = this.hp < this.maxHp / 3 ? KING.castEnraged : KING.castEvery;
      this.cast(target);
    }
  }

  /** Сфера над ладонью вспыхивает — и в точку под героем летит огненный шар. */
  private cast(target: Point): void {
    // смещение кулака — в пикселях игры для спрайта обычного размера; размер Короля задаёт масштаб относительно него
    const grip = gripOffset(this.config.body, this.facing), k = this.displayWidth / this.config.displaySize;
    const from = new Phaser.Math.Vector2(this.x + grip.x * k, this.y + (grip.y - ORB.lift) * k - this.lift);
    const to = new Phaser.Math.Vector2(target.x, target.y);
    const ctrl = new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - 50);
    this.arena.fx.ring(to.x, to.y, KING.blastRadius, 0xff7a2a, KING.flight);
    this.arena.fx.burst({ x: from.x, y: from.y, count: 12, speed: [20, 60], life: [0.3, 0.6], size: [2, 4], tints: [0xa040ff, 0xe0a0ff, 0xffffff], blend: Phaser.BlendModes.ADD, depth: this.y + 40 });
    this.arena.playSfx('warn');
    const sprite = this.scene.add.sprite(from.x, from.y, 'fireball', '0').setScale(0.4).play('fireball');
    this.bolts.push({ sprite, from, ctrl, to, t: 0 });
  }

  private updateBolts(dt: number, target: Point): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.t = Math.min(1, b.t + dt / KING.flight);
      const u = 1 - b.t;
      this.pos.set(u * u * b.from.x + 2 * u * b.t * b.ctrl.x + b.t * b.t * b.to.x, u * u * b.from.y + 2 * u * b.t * b.ctrl.y + b.t * b.t * b.to.y);
      b.sprite.setPosition(this.pos.x, this.pos.y).setScale(0.4 + b.t * 0.5).setDepth(b.to.y + 50);
      this.arena.fx.burst({ x: this.pos.x, y: this.pos.y, count: 1, speed: [5, 25], life: [0.2, 0.45], size: [2, 4], tints: [0xffe070, 0xffa030, 0xf05a1e], gravity: -15, blend: Phaser.BlendModes.ADD, depth: b.to.y + 49 });
      if (b.t < 1) continue;
      // взрыв: урон, если герой не ушёл из круга
      const { x, y } = b.to;
      this.arena.fx.burst({ x, y, count: 28, speed: [30, 120], life: [0.3, 0.8], size: [2, 5], tints: [0xfffbe0, 0xffe070, 0xffa030, 0xf05a1e], gravity: 60, blend: Phaser.BlendModes.ADD, depth: y + 5 });
      this.arena.playSfx('slam');
      this.arena.shake(0.006, 160);
      if (Math.hypot(target.x - x, target.y - y) <= KING.blastRadius + SETTINGS.player.radius) this.arena.hurtPlayer(this.config.damage, x, y);
      b.sprite.destroy();
      this.bolts.splice(i, 1);
    }
  }

  /** На 2/3 и 1/3 здоровья — призыв мёртвых. */
  protected override onHurt(): void {
    const threshold = KING.phases[this.phase];
    if (threshold === undefined || this.hp > this.maxHp * threshold) return;
    this.phase++;
    this.emit('phase', this.phase === 1 ? 'Король Бездны призывает мёртвых!' : 'Бездна в ярости!');
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit('summon', this.x + Math.cos(a) * 50, this.y + Math.sin(a) * 40);
    }
  }

  /** Высота парения над тенью. */
  private get lift(): number { return KING.hover + Math.sin(this.bob) * 2; }

  override syncVisuals(dt: number): void {
    super.syncVisuals(dt);
    if (this.dead) return;
    this.bob += dt * 2;
    this.setOrigin(ORIGIN.x, ORIGIN.y + this.lift / this.height);
    this.glow.setPosition(this.x, this.y - 30 - this.lift).setDepth(this.y - 1);
  }

  protected override deathTints(): number[] { return [0xa040ff, 0xe0a0ff, 0x2a1a3a]; }

  override destroy(fromScene?: boolean): void {
    for (const b of this.bolts) b.sprite.destroy();
    this.bolts.length = 0;
    this.glow?.destroy();
    super.destroy(fromScene);
  }
}
