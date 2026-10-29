import Phaser from 'phaser';
import { ENEMY_TYPES, type EnemyConfig } from '../configs/characters';
import { SETTINGS } from '../configs/settings';
import type { Arena, Point } from '../types';
import { Mob, type MobVariant } from './Mob';
import { SLASH_ORIGIN } from '../systems/MobArt';

/** Мечник: дистанция удара, замах (успейте отойти), пауза между ударами. */
const WARRIOR = { reach: 20, windup: 0.4, recover: 0.35, cooldown: 1.2 } as const;
/** Лучник: держит дистанцию, целится и стреляет. Скорости — пиксели в секунду. */
const ARCHER = { keepMin: 70, keepMax: 130, range: 200, aim: 0.7, cooldown: 2.4, strafe: 0.6, arrowSpeed: 150, arrowLife: 1.8, arrowHeight: 12 } as const;
const ARROW_TEXTURE = 'arrow';

/** Скелет — та же кукла, что и герой, с телом skeleton (вещи — в ENEMY_TYPES). */
abstract class SkeletonMob extends Mob {
  protected constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig, arena: Arena, variant: MobVariant) {
    super(scene, x, y, config, arena, variant);
    this.makeShadow(0.7);
  }

  protected override deathTints(): number[] { return [0xe8e0c8, 0xb8ae98, 0x7a705e]; }
}

type WarriorState = 'chase' | 'windup' | 'recover';

/** Скелет-мечник: идёт к игроку, замахивается (краснеет) и рубит. */
export class SkeletonWarrior extends SkeletonMob {
  private mode: WarriorState = 'chase';
  private timer = 0;
  private cooldown = 0.6;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.skeleton, arena, variant);
  }

  protected move(dt: number, target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.mode === 'chase') {
      this.face(dx, dy);
      const walking = dist > WARRIOR.reach - 4;
      if (walking) this.step(dt, dx, dy);
      this.animate(walking);
      if (dist < WARRIOR.reach && this.cooldown <= 0) {
        this.mode = 'windup'; this.timer = WARRIOR.windup;
        this.setTint(0xff9a8a);
        this.arena.playSfx('warn');
      }
    } else if (this.mode === 'windup') {
      this.timer -= dt;
      this.animate(false);
      if (this.timer <= 0) {
        this.clearTint();
        this.slash(target);
        this.mode = 'recover'; this.timer = WARRIOR.recover; this.cooldown = WARRIOR.cooldown;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.mode = 'chase';
    }
  }

  private slash(target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const l = Math.hypot(dx, dy) || 1;
    this.arena.playSfx('swing');
    const fx = this.scene.add.sprite(this.x + (dx / l) * 4, this.y - 9 + (dy / l) * 4, 'slash', '0')
      .setOrigin(SLASH_ORIGIN.x, SLASH_ORIGIN.y).setRotation(Math.atan2(dy, dx)).setDepth(this.y + 30).setTint(0xd8d0ff).setScale(0.85);
    fx.play('slash');
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    if (l <= WARRIOR.reach + SETTINGS.player.radius) this.arena.hurtPlayer(this.config.damage, this.x, this.y);
  }
}

/** Стрела летит над полом: x, y — точка на полу (для столкновений), картинка — выше на ARCHER.arrowHeight. */
interface Arrow { img: Phaser.GameObjects.Image; pos: Point; vx: number; vy: number; life: number }

/** Стрела 11x3: оперение, древко, наконечник. Рисуется один раз. */
export function ensureArrowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ARROW_TEXTURE)) return;
  const tex = scene.textures.createCanvas(ARROW_TEXTURE, 11, 3);
  if (!tex) return;
  const c = tex.getContext();
  const r = (color: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  r('#e8e0c8', 0, 0, 2, 1); r('#c84a4a', 0, 2, 2, 1); r('#e8e0c8', 1, 1, 1, 1);
  r('#8a5328', 2, 1, 7, 1);
  r('#c8d0d8', 9, 0, 1, 3); r('#f0f4f8', 10, 1, 1, 1);
  tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Скелет-лучник: держится на расстоянии, обходит по кругу, целится (рыжеет) и стреляет. */
export class SkeletonArcher extends SkeletonMob {
  private mode: 'move' | 'aim' = 'move';
  private timer = 0;
  private cooldown = Phaser.Math.FloatBetween(1, 2);
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private readonly arrows: Arrow[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, arena: Arena, variant: MobVariant = {}) {
    super(scene, x, y, ENEMY_TYPES.archer, arena, variant);
    ensureArrowTexture(scene);
  }

  protected move(dt: number, target: Point): void {
    this.updateArrows(dt, target);
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.cooldown -= dt;
    this.face(dx, dy);
    if (this.mode === 'aim') {
      this.animate(false);
      this.timer -= dt;
      if (this.timer <= 0) { this.clearTint(); this.shoot(target); this.mode = 'move'; this.cooldown = ARCHER.cooldown; }
      return;
    }
    // слишком близко — отходит, далеко — подходит, на своей дистанции — обходит по кругу
    if (dist < ARCHER.keepMin) this.step(dt, -dx, -dy);
    else if (dist > ARCHER.keepMax) this.step(dt, dx, dy);
    else if (this.step(dt, -dy * this.strafeDir, dx * this.strafeDir, ARCHER.strafe)) this.strafeDir *= -1;
    this.animate(true);
    if (this.cooldown <= 0 && dist < ARCHER.range) {
      this.mode = 'aim'; this.timer = ARCHER.aim;
      this.setTint(0xffc080);
      this.arena.fx.ring(this.x, this.y, 10, 0xffb040, ARCHER.aim);
      this.arena.playSfx('warn');
    }
  }

  private shoot(target: Point): void {
    const dx = target.x - this.x, dy = target.y - this.y;
    const l = Math.hypot(dx, dy) || 1;
    const pos = { x: this.x, y: this.y };
    const img = this.scene.add.image(pos.x, pos.y - ARCHER.arrowHeight, ARROW_TEXTURE).setRotation(Math.atan2(dy, dx));
    this.arrows.push({ img, pos, vx: (dx / l) * ARCHER.arrowSpeed, vy: (dy / l) * ARCHER.arrowSpeed, life: ARCHER.arrowLife });
    this.arena.playSfx('swing');
  }

  private updateArrows(dt: number, target: Point): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.life -= dt;
      const blocked = this.arena.move(a.pos, a.vx * dt, a.vy * dt, 1);
      const hit = Math.hypot(target.x - a.pos.x, target.y - a.pos.y) < SETTINGS.player.radius + 4;
      if (hit) this.arena.hurtPlayer(this.config.damage, a.pos.x, a.pos.y);
      if (hit || blocked || a.life <= 0) {
        this.arena.fx.burst({ x: a.pos.x, y: a.pos.y - ARCHER.arrowHeight, count: 4, speed: [10, 40], life: [0.2, 0.4], size: [1, 2], tints: [0x8a5328, 0xe8e0c8], gravity: 120, depth: a.pos.y + 5 });
        a.img.destroy();
        this.arrows.splice(i, 1);
        continue;
      }
      a.img.setPosition(a.pos.x, a.pos.y - ARCHER.arrowHeight).setDepth(a.pos.y + 1);
    }
  }

  override destroy(fromScene?: boolean): void {
    for (const a of this.arrows) a.img.destroy();
    this.arrows.length = 0;
    super.destroy(fromScene);
  }
}
