import Phaser from 'phaser';
import type { EnemyConfig } from '../configs/characters';
import { COLORS, DEPTH } from '../configs/game';
import { TEXTURES, type PlayerDirection } from '../configs/assets';
import { SETTINGS } from '../configs/settings';
import { session } from '../state/Session';
import { ensureHeroSheet, facingOf, heroAnimKey, heroAttackFrame, heroOrigin, playKeepingStep } from '../systems/HeroArt';
import type { Arena, Point } from '../types';

const SPEED_VARIATION = { min: 0.9, max: 1.15 } as const;
/**
 * Кадры удара по времени (секунды): в начале замаха (доля raise) оружие поднимается, потом держится занесённым;
 * за before до удара — рывок; после удара impact секунд — кадр удара, затем проводка, за back до конца паузы — возврат.
 */
const SWING = { raise: 0.3, before: 0.1, impact: 0.12, back: 0.12 } as const;

export interface MobVariant { scale?: number; hpMul?: number }

/**
 * Общие здоровье, урон, отбрасывание и смерть; поведение движения задаёт конкретный моб.
 * Каждый моб — кукла из HeroArt (тело и вещи из конфига): лист кадров ходьбы и покоя в 8 сторон.
 */
export abstract class Mob extends Phaser.GameObjects.Sprite {
  readonly config: EnemyConfig;
  hp: number;
  maxHp: number;
  dead = false;
  protected readonly speed: number;
  protected readonly arena: Arena;
  protected readonly baseScale: number;
  protected contactCd = 0.5;
  protected shadow: Phaser.GameObjects.Image | null = null;
  protected showBar = true;
  protected facing: PlayerDirection = 'down';
  private readonly sheet: string;
  private knockX = 0;
  private knockY = 0;
  private barTimer = 0;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private flashTimer = 0;

  protected constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig, arena: Arena, variant: MobVariant = {}) {
    const sheet = ensureHeroSheet(scene, config.outfit, config.body);
    super(scene, x, y, sheet, '0');
    this.sheet = sheet;
    this.config = config;
    this.arena = arena;
    this.maxHp = Math.max(1, Math.round(config.hp * (variant.hpMul ?? 1)));
    this.hp = this.maxHp;
    // у каждого врага чуть своя скорость, чтобы толпа не шла идеальной кучей
    this.speed = config.speed * Phaser.Math.FloatBetween(SPEED_VARIATION.min, SPEED_VARIATION.max);

    scene.add.existing(this);
    // displaySize — ширина на экране; высота — в тех же пропорциях, что и кадр
    this.setScale((config.displaySize / this.width) * (variant.scale ?? 1));
    this.baseScale = this.scaleX;
    const origin = heroOrigin(config.body);
    this.setOrigin(origin.x, origin.y);
    this.animate(false);
  }

  /** Повернуться к (dx, dy): 8 сторон, на границе секторов направление не мигает. */
  protected face(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.facing = facingOf(dx, dy, this.facing);
  }

  /** Ходьба или покой в текущую сторону; при повороте шаг не сбивается. */
  protected animate(walking: boolean): void { playKeepingStep(this, heroAnimKey(this.sheet, walking ? 'walk' : 'idle', this.facing)); }

  /** Замах: left — секунд до удара, total — длина замаха. */
  protected windupPose(left: number, total: number): void {
    this.strikeFrame(left > total * (1 - SWING.raise) ? 5 : left > SWING.before ? 0 : left > SWING.before / 2 ? 1 : 2);
  }

  /** После удара: since — секунд с удара, left — секунд до конца паузы. */
  protected recoverPose(since: number, left: number): void {
    this.strikeFrame(since < SWING.impact ? 3 : left > SWING.back ? 4 : 5);
  }

  /** Кадр удара оружием в руке; у кого нет оружия ближнего боя — просто стоит. */
  private strikeFrame(k: number): void {
    const frame = heroAttackFrame(this.facing, k);
    if (!this.texture.has(frame)) { this.animate(false); return; }
    this.anims.stop();
    this.setFrame(frame);
  }

  /** Шаг в направлении (dx, dy). Возвращает true, если упёрся в препятствие. */
  protected step(dt: number, dx: number, dy: number, speedMul = 1): boolean {
    const l = Math.hypot(dx, dy) || 1;
    return this.arena.move(this, (dx / l) * this.speed * speedMul * dt, (dy / l) * this.speed * speedMul * dt, this.config.radius, this.config.flying);
  }

  /** Вызывается каждый кадр менеджером врагов. */
  chase(dt: number, target: Point): void {
    if (this.dead) return;
    this.contactCd = Math.max(0, this.contactCd - dt);
    if (this.knockX !== 0 || this.knockY !== 0) {
      this.arena.move(this, this.knockX * dt, this.knockY * dt, this.config.radius, this.config.flying);
      const k = Math.max(0, 1 - 8 * dt);
      this.knockX *= k; this.knockY *= k;
      if (Math.hypot(this.knockX, this.knockY) < 5) { this.knockX = 0; this.knockY = 0; }
    }
    this.move(dt, target);
  }

  protected abstract move(dt: number, target: Point): void;

  /** Общий кадр: глубина, тень, полоска здоровья, вспышка. Вызывает менеджер после движения. */
  syncVisuals(dt: number): void {
    if (this.dead) return;
    this.setDepth(this.y);
    this.shadow?.setPosition(this.x, this.y + 1).setDepth(this.y - 0.5);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) { this.clearTint(); this.setTintMode(Phaser.TintModes.MULTIPLY); }
    }
    if (this.barTimer > 0) {
      this.barTimer -= dt;
      this.drawBar();
      if (this.barTimer <= 0) { this.bar?.destroy(); this.bar = null; }
    }
  }

  private drawBar(): void {
    if (!this.showBar) return;
    if (!this.bar) this.bar = this.scene.add.graphics();
    const w = Math.max(14, this.config.radius * 2 + 4);
    const top = this.y - this.displayHeight * this.originY - 6;
    const g = this.bar;
    g.clear().setDepth(DEPTH.fx - 5);
    g.fillStyle(0x1d1822, 1).fillRect(this.x - w / 2 - 1, top - 1, w + 2, 4);
    g.fillStyle(0x6a2a3a, 1).fillRect(this.x - w / 2, top, w, 2);
    g.fillStyle(0xe0506a, 1).fillRect(this.x - w / 2, top, Math.ceil(w * Math.max(0, this.hp) / this.maxHp), 2);
  }

  /** Урон от игрока. */
  hurt(damage: number, fromX: number, fromY: number, knockback: number): void {
    if (this.dead) return;
    this.hp -= damage;
    this.barTimer = 2.2;
    this.flashTimer = 0.09;
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    const dx = this.x - fromX, dy = this.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    const kb = knockback / Math.max(1, this.config.radius / 7);
    this.knockX = (dx / l) * kb;
    this.knockY = (dy / l) * kb;
    this.arena.fx.hitSpark(this.x - dx / l * 2, this.y - 8);
    this.arena.fx.floatText(this.x, this.y - this.displayHeight * this.originY * 0.7, `${damage}`, COLORS.gold);
    this.arena.playSfx('hit');
    this.onHurt();
    if (this.hp <= 0) this.die();
  }

  protected onHurt(): void { /* переопределяется боссом */ }

  protected die(): void {
    if (this.dead) return;
    this.dead = true;
    this.bar?.destroy(); this.bar = null;
    this.arena.fx.poof(this.x, this.y - 6, Math.max(1, this.baseScale));
    this.arena.fx.burst({ x: this.x, y: this.y - 6, count: 10, speed: [30, 90], life: [0.3, 0.6], size: [2, 4], tints: this.deathTints(), gravity: 160, depth: this.y + 5 });
    this.arena.playSfx('splat');
    this.arena.shake(0.004, 100);
    session.runKills += 1;
    this.emit('died', this);
    this.shadow?.destroy();
    this.destroy();
  }

  protected deathTints(): number[] { return [0xffffff]; }

  /** Урон игроку при касании. */
  protected touch(target: Point, damage = this.config.damage): void {
    if (this.contactCd > 0) return;
    const reach = this.config.radius + SETTINGS.player.radius + 1;
    if (Math.hypot(target.x - this.x, target.y - this.y) <= reach) {
      this.contactCd = 0.9;
      this.arena.hurtPlayer(damage, this.x, this.y);
    }
  }

  protected makeShadow(scale: number): void {
    this.shadow = this.scene.add.image(this.x, this.y, TEXTURES.shadow).setScale(scale);
  }

  override destroy(fromScene?: boolean): void {
    this.bar?.destroy();
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
