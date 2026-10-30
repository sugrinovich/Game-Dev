import Phaser from 'phaser';
import type { PlayerConfig } from '../configs/characters';
import { HERO_ORIGIN, TEXTURES, type PlayerDirection } from '../configs/assets';
import { COLORS, KEYS } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { session } from '../state/Session';
import { EQUIPMENT, EQUIPMENT_IDS, type EquipmentId } from '../configs/items';
import { ensureHeroSheet, facingOf, FIGURE_SCALE, GEAR, heroAnimKey, heroAttackFrame, playKeepingStep, STARTER_OUTFIT, type HeroAnimKind, type Outfit } from '../systems/HeroArt';
import type { Arena } from '../types';
import { SLASH_ORIGIN } from '../systems/MobArt';

type MoveKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
type ActionKeys = Record<'interact', Phaser.Input.Keyboard.Key>;
type Buffered = 'attack' | 'dash' | 'interact' | 'potion';

/** Нажатие запоминается на это время: быстрый тап не потеряется даже при просадке кадров. */
const INPUT_BUFFER_SECONDS = 0.18;
/**
 * Взмах игрока (секунды): урон — в strikeAt, весь взмах — length. frames — когда сменяются кадры удара
 * (0 — занесено, 1–2 — рывок, 3 — удар ровно в strikeAt, 4 — проводка, 5 — возврат).
 */
const SWING = { strikeAt: 0.07, length: 0.24, frames: [0.03, 0.055, 0.07, 0.13, 0.2] } as const;
/** Клавиши действий (KEYS): удар — в ту сторону, куда смотрит герой. Правый Shift — та же клавиша рывка. */
const ACTION_CODES: Record<string, Buffered> = {
  [KEYS.attack.code]: 'attack', [KEYS.dash.code]: 'dash', ShiftRight: 'dash', [KEYS.interact.code]: 'interact', [KEYS.potion.code]: 'potion',
};

/** Во что одет герой: стартовая одежда, поверх — надетые предметы (каждый занимает свой слот). */
export function outfitFor(equipped: Record<EquipmentId, boolean>): Outfit {
  const outfit: Outfit = { ...STARTER_OUTFIT };
  for (const id of EQUIPMENT_IDS) {
    const wear = EQUIPMENT[id].wear;
    // в руке — только основное оружие; без него — палка из стартового набора
    if (EQUIPMENT[id].kind === 'weapon' && id !== session.mainWeapon) continue;
    if (equipped[id] && wear) outfit[GEAR[wear].slot] = wear;
  }
  return outfit;
}

/** Надетые вещи одним числом: проверка «переоделся ли» каждый кадр без создания объектов (меньше мусора — ровнее кадры). */
function equippedMask(): number {
  let mask = 0;
  for (let i = 0; i < EQUIPMENT_IDS.length; i++) if (session.data.equipped[EQUIPMENT_IDS[i]!]) mask |= 1 << i;
  // и какое оружие в руке
  const main = session.mainWeapon;
  return mask + (main ? (EQUIPMENT_IDS.indexOf(main) + 1) << EQUIPMENT_IDS.length : 0);
}

/** Персонаж игрока: движение WASD, взмах оружием (пробел, по направлению взгляда), рывок и анимации. Внешний вид зависит от надетых вещей. */
export class Player extends Phaser.GameObjects.Sprite {
  readonly config: PlayerConfig;
  /** Вызывается один раз, когда здоровье кончилось. */
  onDeath: (() => void) | null = null;
  alive = true;
  /** Блокирует управление (диалоги, переходы). */
  frozen = false;

  private readonly wasd: MoveKeys;
  private readonly act: ActionKeys;
  private readonly buffers: Record<Buffered, number> = { attack: 0, dash: 0, interact: 0, potion: 0 };
  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    const a = ACTION_CODES[ev.code];
    if (a && !ev.repeat) this.buffers[a] = INPUT_BUFFER_SECONDS;
  };
  private readonly shadow: Phaser.GameObjects.Image;
  private facing: PlayerDirection = 'down';
  private aimX = 0;
  private aimY = 1;
  private attackT = 0;       // 0 — не бьёт, иначе секунд с начала взмаха
  private struck = false;
  private attackCd = 0;
  private dashT = 0;
  dashCd = 0;
  private dashX = 0;
  private dashY = 0;
  private iFrames = 0;
  private knockX = 0;
  private knockY = 0;
  private stepTimer = 0;
  private slashSprite: Phaser.GameObjects.Sprite | null = null;
  /** Ключ листа кадров для текущей одежды. */
  private sheet: string;
  private gearMask = equippedMask();

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig, private readonly arena: Arena) {
    const sheet = ensureHeroSheet(scene, outfitFor(session.data.equipped));
    super(scene, x, y, sheet, '0');
    this.sheet = sheet;
    this.config = config;
    this.setOrigin(HERO_ORIGIN.x, HERO_ORIGIN.y);
    this.setDisplaySize(config.displaySize * FIGURE_SCALE, config.displaySize * FIGURE_SCALE);
    this.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.shadow = scene.add.image(x, y, TEXTURES.shadow).setScale(0.8);

    scene.add.existing(this);
    this.play(this.animKey('idle'));

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.wasd = keyboard.addKeys({ up: K.W, down: K.S, left: K.A, right: K.D }) as MoveKeys;
    this.act = keyboard.addKeys({ interact: K.E }) as ActionKeys;
    keyboard.addKeys({ a: K.SPACE, b: K.SHIFT, c: K.Q, d: K.TAB });   // перехват: браузер не прокручивает страницу и не уводит фокус по TAB
    keyboard.on('keydown', this.onKeyDown);
    this.once(Phaser.GameObjects.Events.DESTROY, () => { this.shadow.destroy(); keyboard.off('keydown', this.onKeyDown); });
  }

  private animKey(kind: HeroAnimKind): string { return heroAnimKey(this.sheet, kind, this.facing); }

  /** Переоделся (надел или снял вещь) — берём лист с новой одеждой и показываем вспышку. */
  private checkGearChange(): void {
    const mask = equippedMask();
    if (mask === this.gearMask) return;
    this.gearMask = mask;
    const sheet = ensureHeroSheet(this.scene, outfitFor(session.data.equipped));
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    this.arena.fx.burst({ x: this.x, y: this.y - 12, count: 14, speed: [10, 40], life: [0.4, 0.8], size: [1, 3], tints: [0xf2d060, 0xfff0a0, 0xffffff], gravity: -20, depth: this.y + 5 });
  }

  /** Множитель скорости шага от окружения (разлом в полу замедляет); сцена задаёт его каждый кадр, 1 — обычный шаг. */
  speedMul = 1;

  get facingVec(): { x: number; y: number } { return { x: this.aimX, y: this.aimY }; }

  /** Перенос (например, к трону после отдыха): вместе с тенью, лицом к камере, в покое. */
  teleport(x: number, y: number): void {
    this.setPosition(x, y).setDepth(y);
    this.shadow.setPosition(x, y + 1).setDepth(y - 0.5);
    this.setAim(0, 1);
    playKeepingStep(this, this.animKey('idle'));
  }
  get invulnerable(): boolean { return this.iFrames > 0 || this.dashT > 0; }
  get isDashing(): boolean { return this.dashT > 0; }

  private take(a: Buffered): boolean {
    if (this.buffers[a] <= 0) return false;
    this.buffers[a] = 0;
    return true;
  }

  interactPressed(): boolean { return this.take('interact'); }
  interactHeld(): boolean { return this.act.interact.isDown; }
  /** Сбрасывает «только что нажато» у всех клавиш (пока открыто меню). */
  drain(): void {
    for (const k of Object.keys(this.buffers) as Buffered[]) this.buffers[k] = 0;
  }
  potionPressed(): boolean { return this.take('potion'); }

  private setAim(x: number, y: number): void {
    this.aimX = x; this.aimY = y;
    this.facing = facingOf(x, y, this.facing);
  }

  private canAttack(): boolean { return this.attackCd <= 0 && this.attackT <= 0 && this.dashT <= 0 && this.alive && !this.frozen; }

  tryAttack(): void {
    if (!this.canAttack()) return;
    this.attackT = 0.0001;
    this.struck = false;
    this.attackCd = session.attackCooldown;
    this.arena.playSfx('swing');
    const ang = Math.atan2(this.aimY, this.aimX);
    this.slashSprite?.destroy();
    this.slashSprite = this.scene.add.sprite(this.x + this.aimX * 4, this.y - 9 + this.aimY * 4, 'slash', '0')
      .setOrigin(SLASH_ORIGIN.x, SLASH_ORIGIN.y).setRotation(ang).setDepth(this.y + 30);
    this.slashSprite.play('slash');
    this.slashSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { this.slashSprite?.destroy(); this.slashSprite = null; });
  }

  /** Вызывается каждый кадр. dt — секунды с прошлого кадра. */
  tick(dt: number): void {
    if (!this.alive) return;
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    for (const k of Object.keys(this.buffers) as Buffered[]) this.buffers[k] = Math.max(0, this.buffers[k] - dt);

    let dx = 0;
    let dy = 0;
    if (!this.frozen) {
      if (this.wasd.left.isDown) dx -= 1;
      if (this.wasd.right.isDown) dx += 1;
      if (this.wasd.up.isDown) dy -= 1;
      if (this.wasd.down.isDown) dy += 1;
      if (this.buffers.attack > 0 && this.canAttack()) { this.buffers.attack = 0; this.tryAttack(); }
      if (this.buffers.dash > 0 && this.dashCd <= 0 && this.dashT <= 0) { this.buffers.dash = 0; this.tryDash(dx, dy); }
    }
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }

    // knockback затухает
    if (this.knockX !== 0 || this.knockY !== 0) {
      this.arena.move(this, this.knockX * dt, this.knockY * dt, this.config.radius);
      const k = Math.max(0, 1 - 9 * dt);
      this.knockX *= k; this.knockY *= k;
      if (Math.hypot(this.knockX, this.knockY) < 6) { this.knockX = 0; this.knockY = 0; }
    }

    let moving = false;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.arena.move(this, this.dashX * SETTINGS.combat.dashSpeed * dt, this.dashY * SETTINGS.combat.dashSpeed * dt, this.config.radius);
      if (Math.random() < 0.7) this.arena.fx.burst({ x: this.x, y: this.y - 6, count: 1, speed: [0, 8], life: [0.15, 0.3], size: [3, 5], tints: [0xb8fff4, 0xffffff], depth: this.y - 1 });
      moving = true;
    } else if (len > 0) {
      const slow = (this.attackT > 0 ? 0.45 : 1) * this.speedMul;
      this.arena.move(this, dx * this.config.speed * slow * dt, dy * this.config.speed * slow * dt, this.config.radius);
      moving = true;
      this.setAim(dx, dy);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = 0.28; this.arena.fx.dust(this.x, this.y); }
    }

    this.updateAttack(dt);

    this.checkGearChange();
    if (this.attackT > 0) this.showSwing();
    else playKeepingStep(this, this.animKey(moving ? 'walk' : 'idle'));

    // визуальные эффекты: мигание после урона и «поза» взмаха
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y + 1).setDepth(this.y - 0.5);
    if (this.iFrames > 0 && this.dashT <= 0) this.setAlpha(Math.floor(this.iFrames * 18) % 2 ? 0.35 : 1);
    else this.setAlpha(this.dashT > 0 ? 0.65 : 1);
  }

  private updateAttack(dt: number): void {
    if (this.attackT <= 0) {
      this.setAngle(0).setScale((this.config.displaySize * FIGURE_SCALE) / this.width);
      return;
    }
    this.attackT += dt;
    const t = this.attackT;
    if (!this.struck && t >= SWING.strikeAt) {
      this.struck = true;
      const hit = this.arena.playerStrike(this.x, this.y - 8, this.aimX, this.aimY, SETTINGS.combat.attackRange, SETTINGS.combat.attackHalfArc, session.damage);
      if (hit > 0) this.arena.hitStop(SETTINGS.combat.hitStopMs);
    }
    const k = Math.min(1, t / SWING.length);
    const lean = Math.sin(k * Math.PI) * 9;
    this.setAngle((this.aimX >= 0 ? 1 : -1) * lean * (this.aimX === 0 ? 0 : 1));
    const sq = Math.sin(k * Math.PI) * 0.08;
    const base = (this.config.displaySize * FIGURE_SCALE) / this.width;
    this.setScale(base * (1 + sq), base * (1 - sq * 0.8));
    if (t >= SWING.length) this.attackT = 0;
  }

  /** Кадр удара по времени взмаха: оружие в руке замахивается и бьёт в сторону прицела. */
  private showSwing(): void {
    let k = 0;
    while (k < SWING.frames.length && this.attackT >= SWING.frames[k]!) k++;
    const frame = heroAttackFrame(this.facing, k);
    if (!this.texture.has(frame)) return;
    this.anims.stop();
    this.setFrame(frame);
  }

  private tryDash(dx: number, dy: number): void {
    if (this.dashCd > 0 || this.dashT > 0 || !this.alive) return;
    const l = Math.hypot(dx, dy);
    this.dashX = l > 0 ? dx / l : this.aimX;
    this.dashY = l > 0 ? dy / l : this.aimY;
    this.dashT = SETTINGS.combat.dashTime;
    this.dashCd = SETTINGS.combat.dashCooldown;
    this.arena.playSfx('dash');
    this.arena.fx.dust(this.x, this.y);
  }

  /** Урон игроку. Возвращает true, если урон прошёл. */
  hurt(amount: number, fromX: number, fromY: number): boolean {
    if (!this.alive || this.invulnerable) return false;
    session.hp = Math.max(0, session.hp - amount);
    this.iFrames = SETTINGS.combat.iFrames;
    const dx = this.x - fromX, dy = this.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    this.knockX = (dx / l) * SETTINGS.combat.knockback;
    this.knockY = (dy / l) * SETTINGS.combat.knockback;
    this.setTint(0xff6a5a);
    this.scene.time.delayedCall(110, () => this.clearTint());
    this.arena.fx.floatText(this.x, this.y - 28, `-${amount}`, COLORS.bad);
    this.arena.fx.burst({ x: this.x, y: this.y - 10, count: 8, speed: [30, 80], life: [0.2, 0.4], size: [2, 3], tints: [0xe0506a, 0xb02e4c], gravity: 120, depth: this.y + 5 });
    this.arena.playSfx('hurt');
    this.arena.shake(0.006, 160);
    if (session.hp <= 0) {
      this.alive = false;
      this.arena.playSfx('death');
      this.play(this.animKey('idle'));
      this.scene.tweens.add({ targets: this, angle: 90, alpha: 0.5, duration: 450, ease: 'Cubic.easeOut' });
      this.onDeath?.();
    }
    return true;
  }

  heal(amount: number): void {
    session.hp = Math.min(session.maxHp, session.hp + amount);
    this.arena.fx.floatText(this.x, this.y - 28, `+${amount}`, COLORS.good);
    this.arena.fx.burst({ x: this.x, y: this.y - 8, count: 12, speed: [10, 40], angle: [-Math.PI, 0], life: [0.5, 0.9], size: [2, 3], tints: [0x9be06a, 0xd8ffb0], gravity: -30, depth: this.y + 5 });
    this.arena.playSfx('heal');
  }

  revive(x: number, y: number): void {
    this.alive = true; this.setPosition(x, y).setAngle(0).setAlpha(1);
    this.iFrames = 1; this.knockX = this.knockY = 0;
  }
}
