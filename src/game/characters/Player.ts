import Phaser from 'phaser';
import { textureResolution } from '../systems/CastleModels';
import type { PlayerConfig } from '../configs/characters';
import { HERO_ORIGIN, TEXTURES, type PlayerDirection } from '../configs/assets';
import { COLORS, KEYS } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { session } from '../state/Session';
import { EQUIPMENT, EQUIPMENT_IDS, type EquipmentId } from '../configs/items';
import { ensureHeroSheet, facingOf, FIGURE_SCALE, GEAR, heroAnimKey, heroAttackFrame, playKeepingStep, STARTER_OUTFIT, weaponTip, type GearId, type HeroAnimKind, type Outfit } from '../systems/HeroArt';
import { ARROW_TEXTURE, ensureArrowTexture } from './Skeleton';
import { playSpellFx, SPELL_RADIUS, type SpellFxKey } from '../systems/SpellArt';
import type { Arena, Point } from '../types';
import { fitSlash, SLASH_ORIGIN } from '../systems/MobArt';

type MoveKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
type ActionKeys = Record<'interact', Phaser.Input.Keyboard.Key>;
type Buffered = 'attack' | 'dash' | 'interact' | 'potion';

/** Нажатие запоминается на это время: быстрый тап не потеряется даже при просадке кадров. */
const INPUT_BUFFER_SECONDS = 0.18;
/**
 * Оружие в руке — только вид: какого цвета дуга и зона удара (null — без дуги) и наклоняется ли герой
 * (steady — лук: стреляет прямо). Сам удар — по всему оружию в сумке (WEAPON_TRAITS).
 */
interface SwingLook { slash: { tint: number } | null; steady?: boolean }
const DEFAULT_LOOK: SwingLook = { slash: { tint: 0xffffff } };
/** Дуга удара — на столько пикселей дальше конца оружия в руке (как у мобов); урон — от героя до неё. */
const SLASH_GAP = 6;
const SWING_LOOKS: Partial<Record<GearId, SwingLook>> = {
  axe: { slash: { tint: 0xffc890 } },
  katana: { slash: { tint: 0xffb488 } },
  fireKatana: { slash: { tint: 0xffa060 } },
  iceGreatsword: { slash: { tint: 0xa8e0ff } },
  knightSword: { slash: { tint: 0xffe08a } },
  hammer: { slash: { tint: 0x9ad8ff } },
  glaive: { slash: null },
  woodBow: { slash: null, steady: true },
  hunterBow: { slash: null, steady: true },
};
/**
 * Базовый удар (палка — как кулаки): урон в strikeAt, весь взмах — length (с); frames — когда сменяются кадры удара
 * (0 — занесено, 1–2 — рывок, 3 — удар, 4 — проводка, 5 — возврат); пауза между ударами, дальность, полудуга,
 * замирание на попадании (у тяжёлого оружия — heavyHitStopMs). Оружие в сумке ускоряет или замедляет всё это (speed).
 */
const BASE_SWING = {
  strikeAt: 0.07, length: 0.24, frames: [0.03, 0.055, 0.07, 0.13, 0.2], cooldown: SETTINGS.combat.attackCooldown,
  range: SETTINGS.combat.attackRange, halfArc: SETTINGS.combat.attackHalfArc, hitStopMs: SETTINGS.combat.hitStopMs, heavyHitStopMs: 75,
} as const;

/**
 * Оружие складывается: каждое оружие в сумке добавляет к одному удару по пробелу свою черту — неважно, что в руке.
 * Черты собираются вместе и не дублируются (одна дрожь, один след), звук — общий: у каждой черты свой голос.
 * reach и arc — насколько дальше и шире (мечи, катана); speed — во сколько раз дольше удар и пауза (катана быстрее,
 * топор и молот тяжелее; множители перемножаются); double — второй удар следом (катана); heavy — дрожь камеры
 * и каменная крошка (топор, молот); circle — круг урона вокруг места удара (топор); shock — волна молний по земле
 * (молот); thrust — укол далеко вперёд (глефа); arrows — стрелы вперёд (луки); sparks — искры из-под клинка;
 * trail — цвет следа удара (меч рыцаря — золото); burn — огненная волна по линии каждого удара (огненная катана);
 * frost — ледяные кристаллы по линии удара (ледяной двуручник). Урон волн — BLADE_WAVE.
 */
interface WeaponTrait { reach?: number; arc?: number; speed?: number; double?: boolean; heavy?: boolean; circle?: number; shock?: boolean; thrust?: number; arrows?: number; sparks?: readonly number[]; trail?: number; burn?: boolean; frost?: boolean }
const WEAPON_TRAITS: Partial<Record<EquipmentId, WeaponTrait>> = {
  sword: { reach: 3, arc: 0.15 },
  knightSword: { reach: 6, arc: 0.25, trail: 0xffe08a, sparks: [0xfff0a0, 0xffd060, 0xffffff] },
  katana: { reach: 6, arc: 0.3, speed: 0.75, double: true, sparks: [0xd8783a, 0xffc080, 0x8a4a2a] },
  orcAxe: { reach: 2, speed: 1.35, heavy: true, circle: SPELL_RADIUS.cleave },
  thunderHammer: { reach: 2, speed: 1.35, heavy: true, shock: true },
  guardGlaive: { speed: 1.1, thrust: 40 },
  bow: { arrows: 1 },
  hunterBow: { speed: 1.15, arrows: 3 },
  // зачарованные: огненная катана быстрая и двойная, ледяной двуручник тяжёлый, дальний и широкий
  fireKatana: { reach: 7, arc: 0.3, speed: 0.75, double: true, burn: true, trail: 0xffa060, sparks: [0xffd060, 0xff8a2a, 0xfff4c0] },
  iceGreatsword: { reach: 11, arc: 0.45, speed: 1.3, heavy: true, frost: true, trail: 0xa8e0ff, sparks: [0xe0f8ff, 0x9ad8ff, 0xffffff] },
};
/** Урон волн зачарованных клинков (вдобавок к удару): огонь — в каждом ударе катаны, лёд — в первом. */
const BLADE_WAVE = { burn: 2, frost: 2 } as const;
/** Сложенные черты одного удара и его ритм. */
interface Combo {
  reach: number; arc: number; speed: number; double: boolean; heavy: boolean; circle: number; shock: boolean; thrust: number;
  arrows: number; sparks: number[]; trail: number | null; melee: boolean; burn: boolean; frost: boolean;
}
/**
 * Второй удар катаны — через столько секунд после первого (дуга зеркальная); круг топора — урон и доля дальности,
 * где его середина; укол глефы — полудуга.
 */
/** Круги на полу бьют от точки на столько выше ног — враги меряются так же (EnemyManager.strike): ноги к ногам. */
const FLOOR_HIT = 6;
/** circleAt — где круг топора и волна молота: доля дальности удара (1 — на линии удара, там же, где дуга). */
const COMBO = { doubleDelay: 0.1, circleDamage: 1, circleAt: 1, thrustArc: 0.3 } as const;

/**
 * Магия в сумке действует сама по таймеру (every — раз во сколько секунд), только в бою; все эффекты — 3D (SpellArt.ts).
 * Свиток огня — мини-фаерболы во все стороны (FIRE_NOVA); жезл искр — молния вперёд по прицелу (узкий конус reach x halfArc);
 * ледяной осколок — волна, отбрасывающая врагов; камень жизни — лечит.
 */
const MAGIC = {
  fireScroll: { every: 4, radius: SPELL_RADIUS.fireRing, damage: 2 },
  sparkWand: { every: 3, reach: 70, halfArc: 0.22, damage: 2 },
  frostShard: { every: 5, radius: SPELL_RADIUS.frostRing, damage: 1 },
  lifeStone: { every: 5, heal: 1 },
  // редкие: метеор падает перед героем; вихрь идёт вперёд и ранит на пути; клинки кружат вокруг несколько секунд
  meteorScroll: { every: 6, ahead: 44, radius: 26, damage: 3, fall: 450, height: 90 },
  frostVortex: { every: 6, speed: 70, life: 1.3, tick: 0.25, radius: 14, damage: 1 },
  spiritBlades: { every: 7, duration: 3, count: 3, radius: 30, spin: 5, tick: 0.35, hitR: 8, damage: 1 },
  // зачарованные: посох тьмы — чёрный шар в ближайшего врага (в пределах range; нет врага — повтор через retry с);
  // кровавый размах — осколки крови вокруг героя, каждое попадание лечит heal (не больше maxHeal за раз)
  darkStaff: { every: 4, range: 300, speed: 150, lift: 12, radius: SPELL_RADIUS.darkBlast, damage: 4, retry: 0.5 },
  bloodSweep: { every: 5, radius: SPELL_RADIUS.bloodRing, damage: 2, heal: 1, maxHeal: 3 },
} as const;
type MagicId = keyof typeof MAGIC;
/**
 * Свиток огня: из героя во все стороны разлетаются мини-фаерболы (те же шары, что мечут Короли на заставке) и
 * вспыхивают на краю круга урона — урон в этот миг. count — сколько шаров, flight — сколько летят (с), lift — высота
 * над полом, scale — размер (шар Короля на заставке — 0,9, метеор — 0,35).
 */
const FIRE_NOVA = { count: 8, flight: 0.32, lift: 8, scale: 0.2, trail: [0xffe070, 0xffa030, 0xf05a1e], pop: [0xfffbe0, 0xffe070, 0xffa030, 0xf05a1e] } as const;
/** Сфера грозы (редкая магия): кружит вокруг героя всё время боя (радиус, скорость — рад/с) и бьёт тех, кого коснулась. */
const STORM_ORB = { radius: 30, spin: 3, tick: 0.6, hitR: 9, damage: 1, lift: 8 } as const;
/**
 * Редкие усиления: перстень вампира лечит каждое every-е попадание; амулет второго дыхания раз за вылазку оставляет
 * 1 здоровья и даёт неуязвимость; плащ тени — неуязвимость после рывка и тени за героем (shadowEvery — как часто).
 */
const RARE_BUFFS = { vampire: { every: 4, heal: 1 }, secondWind: { iFrames: 1.5 }, cloak: { iFrames: 0.35, shadowEvery: 0.035, shadowMs: 260 } } as const;
interface Vortex { sprite: Phaser.GameObjects.Sprite; vx: number; vy: number; life: number; tick: number }
/** Стрела героя: скорость (пиксели в секунду), сколько летит, высота над полом, радиус попадания; веер залпа (радианы между стрелами). */
const PLAYER_ARROW = { speed: 240, life: 0.9, height: 12, hitR: 7, spread: 0.2 } as const;
/** Волна молота: на сколько дальше героя (доля дальности удара), радиус и урон. */
const HAMMER_SHOCK = { at: 0.75, radius: 18, damage: 1 } as const;
interface ShotArrow { img: Phaser.GameObjects.Image; pos: Point; vx: number; vy: number; life: number }
/**
 * Вещи-усиления в сумке видны в бою: сломанное кольцо силы — алые искры на попадании; ожерелье скорости — ветер
 * за бегущим героем (every — раз во сколько секунд клочок ветра).
 */
const TRINKET_FX = { ring: [0xff4a3a, 0xffa080, 0xb0202a], wind: { every: 0.07, tints: [0xe0f6ff, 0xa8d8f0] } } as const;
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

/** Удар оружия в руке (без оружия — палка, обычный взмах). */
function lookFor(weapon: GearId | undefined): SwingLook { return (weapon && SWING_LOOKS[weapon]) || DEFAULT_LOOK; }

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
  /** Ключ листа кадров для текущей одежды; удар оружия в руке. */
  private sheet: string;
  private gearMask = equippedMask();
  private look: SwingLook = DEFAULT_LOOK;
  /** Текущий удар: сложенное оружие (снято при нажатии) и ритм. */
  private swing: { C: Combo; strikeAt: number; length: number; frames: number[] } | null = null;
  private readonly arrows: ShotArrow[] = [];
  /** Эффекты вокруг героя, идущие вместе с ним (aroundHero). */
  private readonly following: { sprite: Phaser.GameObjects.Sprite; depth: number }[] = [];
  private windT = 0;
  /** Сколько секунд до следующего срабатывания магии из сумки. */
  // первые срабатывания разнесены: несколько заклинаний в сумке не вспыхивают в одно мгновение
  private readonly magicT = Object.fromEntries(Object.entries(MAGIC).map(([id, m], i) => [id, m.every * (0.4 + 0.13 * i)])) as Record<MagicId, number>;
  /** Сфера грозы, вихри льда, призрачные клинки (сколько ещё кружат и их угол), попадания для перстня вампира. */
  private orb: { sprite: Phaser.GameObjects.Sprite; a: number; tick: number } | null = null;
  private readonly vortices: Vortex[] = [];
  private blades: { sprites: Phaser.GameObjects.Sprite[]; a: number; left: number; tick: number } | null = null;
  /** Чёрные шары посоха тьмы в полёте: цель (пока жива, шар доворачивает к ней) и точка на полу под шаром. */
  private readonly darkBalls: { sprite: Phaser.GameObjects.Sprite; target: Point & { active: boolean }; x: number; y: number; tx: number; ty: number }[] = [];
  /** Мини-фаерболы свитка огня в полёте и доля пути (0 — у героя, 1 — на краю круга). */
  private nova: { balls: Phaser.GameObjects.Sprite[]; t: number } | null = null;
  private hits = 0;
  private secondWindUsed = false;
  private shadowT = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig, private readonly arena: Arena) {
    // в замке — пока без надетых вещей (одежда оруженосца, скины — потом); вещи действуют и видны только в бою
    const outfit = outfitFor(session.data.equipped), sheet = ensureHeroSheet(scene, outfit);
    super(scene, x, y, sheet, '0');
    this.sheet = sheet;
    this.look = lookFor(outfit.weapon);
    ensureArrowTexture(scene);
    this.config = config;
    this.setOrigin(HERO_ORIGIN.x, HERO_ORIGIN.y);
    this.setDisplaySize(config.displaySize * FIGURE_SCALE, config.displaySize * FIGURE_SCALE);
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
    this.once(Phaser.GameObjects.Events.DESTROY, () => { this.shadow.destroy(); keyboard.off('keydown', this.onKeyDown); for (const a of this.arrows) a.img.destroy(); this.clearMagic(); });
  }

  private animKey(kind: HeroAnimKind): string { return heroAnimKey(this.sheet, kind, this.facing); }

  /** Переоделся (надел или снял вещь) — берём лист с новой одеждой и показываем вспышку. */
  private checkGearChange(): void {
    const mask = equippedMask();
    if (mask === this.gearMask) return;
    this.gearMask = mask;
    const outfit = outfitFor(session.data.equipped), sheet = ensureHeroSheet(this.scene, outfit);
    this.look = lookFor(outfit.weapon);
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
    const C = this.combo(), k = C.speed;
    this.swing = { C, strikeAt: BASE_SWING.strikeAt * k, length: BASE_SWING.length * k, frames: BASE_SWING.frames.map((f) => f * k) };
    this.attackCd = BASE_SWING.cooldown * k;
    // дуга взмаха — сразу (если в руке клинок, а не лук)
    if (C.melee) this.slash(C, false);
  }

  /** Черты всего оружия в сумке, сложенные в один удар (то, что в руке, — только вид). */
  private combo(): Combo {
    const c: Combo = { reach: 0, arc: 0, speed: 1, double: false, heavy: false, circle: 0, shock: false, thrust: 0, arrows: 0, sparks: [], trail: null, melee: false, burn: false, frost: false };
    let weapons = 0;
    // в замке вещи не действуют: удар — обычный, палкой
    if (!this.arena.combat) { c.melee = true; return c; }
    for (const id of EQUIPMENT_IDS) {
      const t = WEAPON_TRAITS[id];
      if (!t || !session.data.equipped[id]) continue;
      weapons++;
      c.reach += t.reach ?? 0; c.arc += t.arc ?? 0; c.speed *= t.speed ?? 1;
      c.double ||= t.double === true; c.heavy ||= t.heavy === true; c.shock ||= t.shock === true;
      c.burn ||= t.burn === true; c.frost ||= t.frost === true;
      c.circle = Math.max(c.circle, t.circle ?? 0); c.thrust = Math.max(c.thrust, t.thrust ?? 0); c.arrows = Math.max(c.arrows, t.arrows ?? 0);
      if (t.sparks && c.sparks.length < 6) c.sparks.push(...t.sparks);
      if (t.trail !== undefined) c.trail = t.trail;
      if (!t.arrows) c.melee = true;   // любое оружие ближнего боя в сумке — и удар тоже
    }
    if (weapons === 0) c.melee = true;   // без оружия — палка (кулаки)
    return c;
  }

  /** Момент удара: всё сложенное оружие разом — удар по дуге, стрелы, укол, круг, волна; второй удар катаны следом. */
  private strike(): void {
    const C = this.swing!.C;
    this.strikeSound(C, true);
    if (C.arrows) this.shoot(C.arrows);
    if (C.melee) this.meleeHit(C, true);
    if (C.double) this.scene.time.delayedCall(COMBO.doubleDelay * 1000, () => {
      if (!this.alive || !this.active) return;
      this.strikeSound(C, false);
      if (C.melee) this.meleeHit(C, false); else this.shoot(C.arrows);
    });
  }

  /** Общий звук удара: голос каждой сложенной черты разом (второй удар катаны — свой свист и звон). */
  private strikeSound(C: Combo, first: boolean): void {
    if (C.melee) this.arena.playSfx('slash');
    if (C.double) this.arena.playSfx('shing');
    if (!first) return;
    if (C.heavy) this.arena.playSfx('heavy');
    if (C.thrust) this.arena.playSfx('thrust');
    if (C.shock) this.arena.playSfx('thunder');
    if (C.arrows) this.arena.playSfx('bow');
    if (C.burn) this.arena.playSfx('fire');
    if (C.frost) this.arena.playSfx('frost');
  }

  /** Удар по дуге с чертами оружия; first — первый удар (дрожь, круг, волна, укол — только в нём, без наслоения). */
  private meleeHit(C: Combo, first: boolean): void {
    const range = this.reachOf(C), arc = BASE_SWING.halfArc + C.arc, fx = this.arena.fx;
    const at = { x: this.x + this.aimX * range * 0.6, y: this.y - 8 + this.aimY * range * 0.6 };
    if (!first) this.slash(C, true);
    let hit = this.arena.playerStrike(this.x, this.y - 8, this.aimX, this.aimY, range, arc, session.damage);
    // волны зачарованных клинков — по той же дуге: огонь в каждом ударе, лёд — в первом
    if (C.burn) { this.bladeWave('fx_flame_wave', C); hit += this.arena.playerStrike(this.x, this.y - 8, this.aimX, this.aimY, range, arc, BLADE_WAVE.burn); }
    if (first && C.frost) { this.bladeWave('fx_ice_wave', C); hit += this.arena.playerStrike(this.x, this.y - 8, this.aimX, this.aimY, range, arc, BLADE_WAVE.frost); }
    if (first && C.thrust > range) {
      playSpellFx(this.scene, 'fx_thrust', this.x + this.aimX * 4, this.y - 9 + this.aimY * 4, this.y + 31, Math.atan2(this.aimY, this.aimX));
      hit += this.arena.playerStrike(this.x, this.y - 8, this.aimX, this.aimY, C.thrust, COMBO.thrustArc, session.damage);
    }
    const gx = this.x + this.aimX * range * COMBO.circleAt, gy = this.y + this.aimY * range * COMBO.circleAt;
    if (first && C.circle) {
      playSpellFx(this.scene, 'fx_cleave', gx, gy, gy + 2);
      hit += this.arena.playerStrike(gx, gy - FLOOR_HIT, 1, 0, C.circle, Math.PI, COMBO.circleDamage);
    }
    if (first && C.shock) {
      playSpellFx(this.scene, 'fx_shock', gx, gy, gy + 2);
      hit += this.arena.playerStrike(gx, gy - FLOOR_HIT, 1, 0, HAMMER_SHOCK.radius, Math.PI, HAMMER_SHOCK.damage);
    }
    if (first && C.heavy) fx.burst({ x: at.x, y: at.y + 8, count: 10, speed: [20, 60], life: [0.3, 0.6], size: [2, 4], tints: [0xc8b8a0, 0x9a8a74], gravity: -10, depth: this.y + 29 });
    if (C.sparks.length) fx.burst({ x: at.x, y: at.y, count: 8, speed: [30, 90], life: [0.15, 0.35], size: [1, 2], tints: C.sparks, gravity: 120, blend: Phaser.BlendModes.ADD, depth: this.y + 31 });
    if (hit <= 0) return;
    this.arena.hitStop(C.heavy ? BASE_SWING.heavyHitStopMs : BASE_SWING.hitStopMs);
    if (first && C.heavy) this.arena.shake(0.004, 120);
    this.landed(at.x, at.y);
    if (session.data.equipped.ring) fx.burst({ x: at.x, y: at.y, count: 10, speed: [20, 60], life: [0.3, 0.6], size: [1, 3], tints: [...TRINKET_FX.ring], gravity: -40, blend: Phaser.BlendModes.ADD, depth: this.y + 31 });
  }

  /** Дуга удара: цвет — оружия в руке (золотой, если в сумке меч рыцаря), дальше — шире; mirrored — второй удар катаны. */
  private slash(C: Combo, mirrored: boolean): void {
    const ang = Math.atan2(this.aimY, this.aimX);
    const sprite = this.scene.add.sprite(this.x + this.aimX * 4, this.y - 9 + this.aimY * 4, 'fx_slash', '0')
      .setOrigin(SLASH_ORIGIN.x, SLASH_ORIGIN.y).setRotation(ang).setDepth(this.y + 30).setTint(this.zoneColor(C)).setFlipY(mirrored);
    // дуга — ровно по зоне урона: чуть дальше конца оружия, длиннее удар — дальше дуга
    fitSlash(sprite, this.reachOf(C), BASE_SWING.halfArc + C.arc, 4);
    sprite.play('fx_slash');
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  /**
   * Дальность удара: сложенное оружие (BASE_SWING.range + C.reach), но не ближе SLASH_GAP за концом оружия в руке —
   * дуга никогда не рисуется на самом клинке, перед носом героя.
   */
  private reachOf(C: Combo): number {
    return Math.max(BASE_SWING.range + C.reach, weaponTip(this.scene, this.sheet) * this.config.displaySize * FIGURE_SCALE + SLASH_GAP);
  }

  /** Волна зачарованного клинка (3D) — там же, где дуга удара, и такой же величины. */
  private bladeWave(key: 'fx_flame_wave' | 'fx_ice_wave', C: Combo): void {
    const ang = Math.atan2(this.aimY, this.aimX);
    const sprite = playSpellFx(this.scene, key, this.x + this.aimX * 4, this.y - 9 + this.aimY * 4, this.y + 32, ang);
    fitSlash(sprite, this.reachOf(C), BASE_SWING.halfArc + C.arc, 4);
  }

  /** Цвет дуги и зоны удара: золото меча рыцаря, иначе — оружия в руке. */
  private zoneColor(C: Combo): number { return C.trail ?? (this.look.slash ?? DEFAULT_LOOK.slash!).tint; }

  /** Стрелы из лука: летят над полом туда, куда смотрит герой; залпом — веером (count стрел). */
  private shoot(count: number): void {
    const base = Math.atan2(this.aimY, this.aimX);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * PLAYER_ARROW.spread, dx = Math.cos(a), dy = Math.sin(a);
      const pos = { x: this.x + dx * 6, y: this.y + dy * 6 };
      const img = this.scene.add.image(pos.x, pos.y - PLAYER_ARROW.height, ARROW_TEXTURE).setRotation(a);
      this.arrows.push({ img, pos, vx: dx * PLAYER_ARROW.speed, vy: dy * PLAYER_ARROW.speed, life: PLAYER_ARROW.life });
    }
  }

  /** Удар оружием попал: перстень вампира считает попадания и каждое every-е лечит — алые искры от врага к герою. */
  private landed(x: number, y: number): void {
    if (!session.data.equipped.vampireRing || ++this.hits % RARE_BUFFS.vampire.every !== 0 || session.hp >= session.maxHp) return;
    session.hp = Math.min(session.maxHp, session.hp + RARE_BUFFS.vampire.heal);
    const fx = this.arena.fx, ang = Math.atan2(this.y - 10 - y, this.x - x);
    fx.burst({ x, y, count: 8, speed: [60, 110], angle: [ang - 0.25, ang + 0.25], life: [0.2, 0.35], size: [1, 2], tints: [0xff4a5a, 0xff9aa8], blend: Phaser.BlendModes.ADD, depth: this.y + 31 });
    fx.burst({ x: this.x, y: this.y - 10, count: 6, speed: [5, 20], life: [0.3, 0.5], size: [1, 2], tints: [0xff4a5a], gravity: -30, blend: Phaser.BlendModes.ADD, depth: this.y + 31 });
  }

  /** Стрелы героя: попала во врага (или в воронку) — урон и щепки; в стену или пролетела своё — щепки. */
  private updateArrows(dt: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.life -= dt;
      const blocked = this.arena.move(a.pos, a.vx * dt, a.vy * dt, 1, true);
      const hit = this.arena.playerStrike(a.pos.x, a.pos.y - 6, a.vx, a.vy, PLAYER_ARROW.hitR, Math.PI, session.damage) > 0;
      if (hit) this.landed(a.pos.x, a.pos.y - PLAYER_ARROW.height);
      if (hit && session.data.equipped.ring) this.arena.fx.burst({ x: a.pos.x, y: a.pos.y - PLAYER_ARROW.height, count: 8, speed: [20, 60], life: [0.3, 0.6], size: [1, 3], tints: [...TRINKET_FX.ring], gravity: -40, blend: Phaser.BlendModes.ADD, depth: a.pos.y + 5 });
      if (hit || blocked || a.life <= 0) {
        this.arena.fx.burst({ x: a.pos.x, y: a.pos.y - PLAYER_ARROW.height, count: 4, speed: [10, 40], life: [0.2, 0.4], size: [1, 2], tints: [0x8a5328, 0xe8e0c8], gravity: 120, depth: a.pos.y + 5 });
        a.img.destroy();
        this.arrows.splice(i, 1);
        continue;
      }
      a.img.setPosition(a.pos.x, a.pos.y - PLAYER_ARROW.height).setDepth(a.pos.y + 1);
    }
  }

  /** Магия из сумки: у каждой вещи свой таймер; сработала — заклинание вокруг героя или вперёд. Плюс то, что живёт дольше кадра. */
  private castMagic(dt: number): void {
    for (const id of Object.keys(MAGIC) as MagicId[]) {
      if (!session.data.equipped[id] || (this.magicT[id] -= dt) > 0) continue;
      this.magicT[id] = MAGIC[id].every;
      this.cast(id);
    }
    this.updateFollowing();
    this.updateDarkBalls(dt);
    this.updateNova(dt);
    this.updateOrb(dt);
    this.updateVortices(dt);
    this.updateBlades(dt);
  }

  private cast(id: MagicId): void {
    const x = this.x, y = this.y;
    if (id === 'fireScroll') {
      this.fireNova();
      this.arena.playSfx('fire');
    } else if (id === 'sparkWand') {
      const M = MAGIC.sparkWand;
      playSpellFx(this.scene, 'fx_bolt', x, y - 10, y + 31, Math.atan2(this.aimY, this.aimX));
      this.arena.playSfx('zap');
      this.arena.playerStrike(x, y - 8, this.aimX, this.aimY, M.reach, M.halfArc, M.damage);
    } else if (id === 'frostShard') {
      const M = MAGIC.frostShard;
      this.aroundHero('fx_frost_ring', -1);
      this.arena.playSfx('frost');
      this.arena.playerStrike(x, y - FLOOR_HIT, 1, 0, M.radius, Math.PI, M.damage);
    } else if (id === 'lifeStone') {
      if (session.hp >= session.maxHp) return;
      session.hp = Math.min(session.maxHp, session.hp + MAGIC.lifeStone.heal);
      this.aroundHero('fx_heal', 2);
      this.arena.playSfx('chime');
    } else if (id === 'darkStaff') this.darkBall();
    else if (id === 'bloodSweep') {
      const M = MAGIC.bloodSweep;
      this.aroundHero('fx_blood_ring', -1);
      this.arena.playSfx('blades');
      const hits = this.arena.playerStrike(x, y - FLOOR_HIT, 1, 0, M.radius, Math.PI, M.damage);
      const heal = Math.min(M.maxHeal, hits * M.heal);
      if (heal > 0 && session.hp < session.maxHp) { session.hp = Math.min(session.maxHp, session.hp + heal); this.arena.playSfx('heal'); }
    } else if (id === 'meteorScroll') this.meteor();
    else if (id === 'frostVortex') {
      const M = MAGIC.frostVortex, sprite = playSpellFx(this.scene, 'fx_vortex', x + this.aimX * 10, y + this.aimY * 10, y);
      this.vortices.push({ sprite, vx: this.aimX * M.speed, vy: this.aimY * M.speed, life: M.life, tick: 0 });
      this.arena.playSfx('wind');
    } else if (id === 'spiritBlades') {
      const M = MAGIC.spiritBlades;
      this.blades?.sprites.forEach((b) => b.destroy());
      this.arena.playSfx('blades');
      this.blades = { sprites: Array.from({ length: M.count }, () => playSpellFx(this.scene, 'fx_spirit_blade', x, y, y).setBlendMode(Phaser.BlendModes.ADD)), a: 0, left: M.duration, tick: 0 };
    }
  }

  /**
   * Эффект вокруг героя (кольца огня и льда, лечение): идёт вместе с ним, пока играет — герой всегда посередине.
   * depth — на сколько ближе героя по глубине (кольцо — позади: его дальняя половина за героем, ближняя — ниже ног).
   */
  private aroundHero(key: SpellFxKey, depth: number): void {
    this.following.push({ sprite: playSpellFx(this.scene, key, this.x, this.y, this.y + depth), depth });
  }

  /** Эффекты вокруг героя — на его место каждый кадр; доигравшие убираются из списка. */
  private updateFollowing(): void {
    for (let i = this.following.length - 1; i >= 0; i--) {
      const f = this.following[i]!;
      if (f.sprite.active) f.sprite.setPosition(this.x, this.y).setDepth(this.y + f.depth);
      else this.following.splice(i, 1);
    }
  }

  /** Посох тьмы: чёрный шар вылетает из-за плеча в ближайшего врага; врага нет — посох ждёт retry с. */
  private darkBall(): void {
    const M = MAGIC.darkStaff, target = this.arena.nearestEnemy(this.x, this.y, M.range);
    if (!target) { this.magicT.darkStaff = M.retry; return; }
    this.arena.playSfx('fire');
    const sprite = playSpellFx(this.scene, 'fx_dark_ball', this.x, this.y - M.lift, this.y + 40);
    this.darkBalls.push({ sprite, target, x: this.x, y: this.y, tx: target.x, ty: target.y });
  }

  /** Чёрные шары летят к цели (пока она жива — следом за ней); долетел — взрыв тьмы по кругу. */
  private updateDarkBalls(dt: number): void {
    const M = MAGIC.darkStaff;
    for (let i = this.darkBalls.length - 1; i >= 0; i--) {
      const b = this.darkBalls[i]!;
      if (b.target.active) { b.tx = b.target.x; b.ty = b.target.y; }
      const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), step = M.speed * dt;
      if (d > step) {
        b.x += (dx / d) * step; b.y += (dy / d) * step;
        b.sprite.setPosition(b.x, b.y - M.lift).setDepth(b.y + 40);
        continue;
      }
      b.sprite.destroy();
      this.darkBalls.splice(i, 1);
      playSpellFx(this.scene, 'fx_dark_blast', b.tx, b.ty, b.ty + 2);
      this.arena.playerStrike(b.tx, b.ty - FLOOR_HIT, 1, 0, M.radius, Math.PI, M.damage);
      this.arena.shake(0.003, 100);
      this.arena.playSfx('slam');
    }
  }

  /** Свиток огня: мини-фаерболы появляются у героя, каждый со своего кадра анимации — не мерцают в такт. */
  private fireNova(): void {
    this.nova?.balls.forEach((b) => b.destroy());
    const balls = Array.from({ length: FIRE_NOVA.count }, () => {
      const ball = this.scene.add.sprite(this.x, this.y - FIRE_NOVA.lift, 'fireball', '0').play('fireball');
      ball.anims.setProgress(Math.random());
      return ball.setScale(FIRE_NOVA.scale / textureResolution(ball.texture));
    });
    this.nova = { balls, t: 0 };
  }

  /** Мини-фаерболы летят от героя (вместе с ним) к краю круга, за ними — искры; долетели — вспышка и урон по кругу. */
  private updateNova(dt: number): void {
    const n = this.nova, M = MAGIC.fireScroll, fx = this.arena.fx;
    if (!n) return;
    n.t = Math.min(1, n.t + dt / FIRE_NOVA.flight);
    const r = M.radius * Phaser.Math.Easing.Quadratic.Out(n.t);
    const at = (i: number): Point => {
      const a = (i / n.balls.length) * Math.PI * 2;
      return { x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r * 0.6 };
    };
    n.balls.forEach((ball, i) => {
      const p = at(i), top = p.y - FIRE_NOVA.lift;
      ball.setPosition(p.x, top).setDepth(p.y + 1);
      fx.burst({ x: p.x, y: top, count: 1, speed: [5, 20], life: [0.2, 0.4], size: [1, 3], tints: [...FIRE_NOVA.trail], gravity: -15, blend: Phaser.BlendModes.ADD, depth: p.y });
    });
    if (n.t < 1) return;
    n.balls.forEach((ball, i) => {
      const p = at(i);
      fx.burst({ x: p.x, y: p.y - FIRE_NOVA.lift, count: 6, speed: [15, 50], life: [0.2, 0.45], size: [1, 3], tints: [...FIRE_NOVA.pop], gravity: 40, blend: Phaser.BlendModes.ADD, depth: p.y + 1 });
      ball.destroy();
    });
    this.nova = null;
    this.arena.playerStrike(this.x, this.y - FLOOR_HIT, 1, 0, M.radius, Math.PI, M.damage);
  }

  /** Свиток метеора: огненный шар падает с высоты в точку перед героем — взрыв огненным кольцом, урон по кругу. */
  private meteor(): void {
    const M = MAGIC.meteorScroll, tx = this.x + this.aimX * M.ahead, ty = this.y + this.aimY * M.ahead;
    const ball = this.scene.add.sprite(tx + 20, ty - M.height, 'fireball', '0').play('fireball').setDepth(ty + 40);
    this.arena.playSfx('fire');
    ball.setScale(0.35 / textureResolution(ball.texture));
    this.scene.tweens.add({
      targets: ball, x: tx, y: ty - 6, duration: M.fall, ease: 'Quad.easeIn',
      onComplete: () => {
        ball.destroy();
        playSpellFx(this.scene, 'fx_meteor_blast', tx, ty, ty + 2);
        this.arena.playerStrike(tx, ty - 6, 1, 0, M.radius, Math.PI, M.damage);
        this.arena.shake(0.005, 140);
        this.arena.playSfx('slam');
      },
    });
  }

  /** Сфера грозы: пока лежит в сумке — кружит вокруг героя (то перед ним, то за ним) и бьёт тех, кого коснулась. */
  private updateOrb(dt: number): void {
    if (!session.data.equipped.stormOrb) { this.orb?.sprite.destroy(); this.orb = null; return; }
    const O = STORM_ORB;
    this.orb ??= { sprite: playSpellFx(this.scene, 'fx_storm_orb', this.x, this.y, this.y).setBlendMode(Phaser.BlendModes.ADD), a: 0, tick: O.tick };
    const o = this.orb;
    o.a += O.spin * dt;
    const ox = this.x + Math.cos(o.a) * O.radius, oy = this.y + Math.sin(o.a) * O.radius * 0.6;
    o.sprite.setPosition(ox, oy - O.lift).setDepth(oy);
    if ((o.tick -= dt) <= 0) { o.tick = O.tick; if (this.arena.playerStrike(ox, oy - 6, 1, 0, O.hitR, Math.PI, O.damage) > 0) this.arena.playSfx('zap'); }
  }

  /** Вихри льда идут вперёд и раз в tick ранят всех рядом; кончились — тают. */
  private updateVortices(dt: number): void {
    const M = MAGIC.frostVortex;
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i]!;
      v.life -= dt;
      v.sprite.setPosition(v.sprite.x + v.vx * dt, v.sprite.y + v.vy * dt).setDepth(v.sprite.y);
      if ((v.tick -= dt) <= 0) { v.tick = M.tick; this.arena.playerStrike(v.sprite.x, v.sprite.y - 6, 1, 0, M.radius, Math.PI, M.damage); }
      if (v.life <= 0) { v.sprite.destroy(); this.vortices.splice(i, 1); }
    }
  }

  /** Призрачные клинки кружат вокруг героя остриём по ходу вращения и раз в tick ранят тех, кого задели. */
  private updateBlades(dt: number): void {
    const b = this.blades, M = MAGIC.spiritBlades;
    if (!b) return;
    b.a += M.spin * dt; b.left -= dt;
    const strike = (b.tick -= dt) <= 0;
    if (strike) b.tick = M.tick;
    b.sprites.forEach((sp, i) => {
      const a = b.a + (i / b.sprites.length) * Math.PI * 2, bx = this.x + Math.cos(a) * M.radius, by = this.y + Math.sin(a) * M.radius * 0.6;
      sp.setPosition(bx, by - 6).setRotation(a + Math.PI).setDepth(by).setAlpha(Math.min(1, b.left * 3));
      if (strike) this.arena.playerStrike(bx, by - 6, 1, 0, M.hitR, Math.PI, M.damage);
    });
    if (b.left <= 0) { b.sprites.forEach((sp) => sp.destroy()); this.blades = null; }
  }

  /** Убирает всё, что магия оставила на сцене (уход со сцены). */
  private clearMagic(): void {
    this.following.length = 0;
    this.orb?.sprite.destroy(); this.orb = null;
    for (const v of this.vortices) v.sprite.destroy();
    this.vortices.length = 0;
    this.blades?.sprites.forEach((sp) => sp.destroy()); this.blades = null;
    for (const b of this.darkBalls) b.sprite.destroy();
    this.darkBalls.length = 0;
    this.nova?.balls.forEach((b) => b.destroy()); this.nova = null;
  }

  /** Плащ тени: в рывке за героем остаются тёмные тени его фигуры и тают. */
  private shadowTrail(dt: number): void {
    if (!session.data.equipped.shadowCloak || (this.shadowT -= dt) > 0) return;
    this.shadowT = RARE_BUFFS.cloak.shadowEvery;
    const ghost = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name).setOrigin(this.originX, this.originY)
      .setScale(this.scaleX, this.scaleY).setTint(0x2a1a4a).setAlpha(0.55).setDepth(this.y - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: RARE_BUFFS.cloak.shadowMs, onComplete: () => ghost.destroy() });
  }

  /** Ожерелье скорости в сумке: за бегущим героем вьются клочки ветра. */
  private windTrail(dt: number, moving: boolean): void {
    if (!moving || !session.data.equipped.necklace || (this.windT -= dt) > 0) return;
    this.windT = TRINKET_FX.wind.every;
    this.arena.fx.burst({ x: this.x - this.aimX * 6, y: this.y - 6 - this.aimY * 3, count: 1, speed: [5, 15], life: [0.25, 0.45], size: [2, 3], tints: [...TRINKET_FX.wind.tints], gravity: -20, blend: Phaser.BlendModes.ADD, depth: this.y - 1 });
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
      this.shadowTrail(dt);
      // плащ тени: после рывка ещё миг неуязвимости
      if (this.dashT <= 0 && session.data.equipped.shadowCloak) this.iFrames = Math.max(this.iFrames, RARE_BUFFS.cloak.iFrames);
      this.arena.move(this, this.dashX * SETTINGS.combat.dashSpeed * dt, this.dashY * SETTINGS.combat.dashSpeed * dt, this.config.radius);
      if (Math.random() < 0.7) this.arena.fx.burst({ x: this.x, y: this.y - 6, count: 1, speed: [0, 8], life: [0.15, 0.3], size: [3, 5], tints: [0xb8fff4, 0xffffff], depth: this.y - 1 });
      moving = true;
    } else if (len > 0) {
      const slow = (this.attackT > 0 ? 0.45 : 1) * this.speedMul * session.moveMul;
      this.arena.move(this, dx * this.config.speed * slow * dt, dy * this.config.speed * slow * dt, this.config.radius);
      moving = true;
      this.setAim(dx, dy);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = 0.28; this.arena.fx.dust(this.x, this.y); }
    }

    this.updateAttack(dt);
    this.updateArrows(dt);
    this.windTrail(dt, moving && this.dashT <= 0);
    if (this.arena.combat && !this.frozen) this.castMagic(dt);

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
    const sw = this.swing;
    if (!sw) { this.attackT = 0; return; }
    if (!this.struck && t >= sw.strikeAt) {
      this.struck = true;
      this.strike();
    }
    if (this.look.steady) { if (t >= sw.length) this.attackT = 0; return; }
    const k = Math.min(1, t / sw.length);
    const lean = Math.sin(k * Math.PI) * 9;
    this.setAngle((this.aimX >= 0 ? 1 : -1) * lean * (this.aimX === 0 ? 0 : 1));
    const sq = Math.sin(k * Math.PI) * 0.08;
    const base = (this.config.displaySize * FIGURE_SCALE) / this.width;
    this.setScale(base * (1 + sq), base * (1 - sq * 0.8));
    if (t >= sw.length) this.attackT = 0;
  }

  /** Кадр удара по времени взмаха: оружие в руке замахивается и бьёт в сторону прицела. */
  private showSwing(): void {
    const frames = this.swing?.frames ?? BASE_SWING.frames;
    let k = 0;
    while (k < frames.length && this.attackT >= frames[k]!) k++;
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
    this.dashCd = session.dashCooldown;
    this.arena.playSfx('dash');
    this.arena.fx.dust(this.x, this.y);
  }

  /** Урон игроку. Возвращает true, если урон прошёл. */
  hurt(amount: number, fromX: number, fromY: number): boolean {
    if (!this.alive || this.invulnerable) return false;
    // амулет второго дыхания: раз за вылазку смертельный удар оставляет 1 здоровья
    if (session.hp - amount <= 0 && session.data.equipped.secondWind && !this.secondWindUsed && this.arena.combat) {
      this.secondWindUsed = true;
      session.hp = 1;
      this.iFrames = RARE_BUFFS.secondWind.iFrames;
      this.arena.fx.floatText(this.x, this.y - 30, 'Второе дыхание!', COLORS.gold);
      this.arena.fx.burst({ x: this.x, y: this.y - 10, count: 20, speed: [30, 80], life: [0.4, 0.8], size: [1, 3], tints: [0xfff0a0, 0xffd060, 0xffffff], gravity: -40, blend: Phaser.BlendModes.ADD, depth: this.y + 5 });
      this.arena.playSfx('heal');
      return true;
    }
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
