import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { AbyssKing } from '../characters/AbyssKing';
import { ENEMY_TYPES, type EnemyTypeId } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { ARENA_FLOORS, ECONOMY, LOCATIONS, type LocationConfig, type LocationId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { AbyssSmoke } from '../systems/AbyssSmoke';
import { addCastleAmbience, addCastleFront, addCastleGround, ARENA_RIFT, ARENA_SIZE, arenaGroundKey, paintCastleGround, ROOM_BOUNDS, WALL_BANNER } from '../systems/CastleArt';
import { ARENA_RIFTS, textureResolution } from '../systems/CastleModels';
import { EnemyManager } from '../systems/EnemyManager';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import type { Circle } from '../systems/Colliders';
import { MapBounds } from '../systems/MapBounds';
import { session } from '../state/Session';
import { WorldScene } from './WorldScene';

const MAP_W = ARENA_SIZE.w;
const MAP_H = ARENA_SIZE.h;
/** Разлом Бездны: герой появляется над ним (на столько пикселей выше середины), радиус, где можно «шагнуть» обратно. */
const RIFT_SPAWN_UP = 44;
const RIFT_REACH = 34;
const RIFT = { x: MAP_W / 2, y: MAP_H - ARENA_RIFT.up } as const;
const BOSS_START = { x: MAP_W / 2, y: 150 };
const WAVE_DELAY = 2.5;
const SPAWN_DISTANCE = 112;
/** Знамёна на задней стене (доли ширины). */
const BANNER_AT = [0.12, 0.37, 0.63, 0.88] as const;
/** Состав волны по порядку появления (по кругу); огры — только со второй арены (на первой вместо них орки). */
const WAVE_ORDER: EnemyTypeId[] = ['skeleton', 'orc', 'archer', 'skeleton', 'orc', 'ogre'];
/** Где появляются враги — доли ширины и высоты арены (на любой её величине точки разойдутся по всей площадке). */
const SPAWN_AT = [
  [0.2, 0.3], [0.5, 0.27], [0.8, 0.3], [0.1, 0.48], [0.35, 0.45], [0.65, 0.45], [0.9, 0.48],
  [0.15, 0.68], [0.85, 0.68], [0.3, 0.75], [0.7, 0.75],
] as const;
const SPAWN_POINTS = SPAWN_AT.map(([x, y]) => ({ x: Math.round(MAP_W * x), y: Math.round(MAP_H * y) }));
/** Колонны: отступ от боковых стен и высота рядов (доли высоты арены). */
const PILLARS = { side: 72, rows: [0.38, 0.74] } as const;

/**
 * Разломы в полу (первая арена): открываются сразу по group штук раз в every секунд (случайно в пределах, когда прежние
 * закрылись), живут life секунд, раскрываются за open секунд; в радиусе radius герой идёт медленнее (slow — доля
 * скорости); не ближе minGap к герою и друг к другу при появлении.
 */
const FLOOR_RIFT = { every: [5, 8], life: 8, open: 0.7, radius: 132, slow: 0.5, group: 3, minGap: 60 } as const;
/**
 * Сама воронка — препятствие: на экране она — широкий эллипс, поэтому тело — три круга в ряд (сдвиг по x и радиус),
 * сквозь неё не пройти. Её можно бить, как врага: hits ударов — и она рассыпается вместе с зоной замедления.
 * hitR — насколько велика воронка для удара (к дальности меча), reach — её полуширина (не открываться на враге).
 */
const RIFT_BODY = { circles: [[-12, 11], [0, 12], [12, 11]] as const, reach: 23, hitR: 16, hits: 4 } as const;
/** Разлом на задней стене: низ модели — на линии пола у стены (y карты). */
const WALL_RIFT_Y = ROOM_BOUNDS.top;
interface FloorRift {
  x: number; y: number; t: number; hits: number;
  img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Graphics; body: Circle[];
}

/**
 * Одна сцена для всех арен (уровней). Арена — площадка в четырёх стенах: волны врагов, после последней — босс,
 * награда; проходится на время. Разлом Бездны внизу арены (удерживая E) — путь в замок. На первой арене стены
 * расколоты Бездной, а в полу иногда открываются разломы, замедляющие героя.
 */
export class ExpeditionScene extends WorldScene {
  private location: LocationConfig = LOCATIONS[0]!;
  /** Сколько этажей пройдено подряд за эту вылазку (рекорд арены — в сохранении). */
  private floorsCleared = 0;
  private floorRifts: FloorRift[] = [];
  private nextRiftIn = 0;
  private smoke!: AbyssSmoke;
  private enemies!: EnemyManager;
  private king: AbyssKing | null = null;
  private kingDown = false;
  private cleared = false;
  private ending = false;
  private wave = 0;
  private nextWaveIn = WAVE_DELAY;

  constructor() { super({ key: SCENES.expedition }); }

  /** Свой пол у каждой темы: рисуется один раз (в загрузке) и переиспользуется. */
  private get groundKey(): string { return arenaGroundKey(this.location.theme); }

  init(data: { location?: LocationId }): void {
    const requested = LOCATIONS.find((loc) => loc.id === data.location);
    this.location = requested && session.isUnlocked(requested.id) && !requested.soon ? requested : LOCATIONS[0]!;
  }

  create(): void {
    this.king = null;
    this.kingDown = false;
    this.cleared = false;
    this.ending = false;
    this.wave = 0;
    this.nextWaveIn = WAVE_DELAY;
    this.floorsCleared = 0;
    this.floorRifts = [];
    this.nextRiftIn = Phaser.Math.FloatBetween(FLOOR_RIFT.every[0], FLOOR_RIFT.every[1]);
    const map = new MapBounds(MAP_W, MAP_H, ROOM_BOUNDS);
    paintCastleGround(this, this.groundKey, MAP_W, MAP_H, this.location.theme);
    addCastleGround(this, this.groundKey, MAP_W);
    this.initWorld(map, 'expedition');
    addCastleAmbience(this, MAP_W, this.location.theme);
    addCastleFront(this, this.colliders, MAP_W, MAP_H, this.location.theme, null);   // ближняя стена — сплошная
    this.enemies = new EnemyManager(this, this, {
      width: MAP_W, height: MAP_H,
      isFree: (x, y) => !map.isBlocked(x, y) && !this.colliders.overlaps(x, y, 10),
      pickType: () => 'skeleton',
    });
    this.enemies.wavesEnabled = false;
    this.enemies.onDied = (mob) => this.onMobDied(mob);
    this.enemies.onPhase = (msg) => this.ui.banner(msg, COLORS.bad, 2);
    this.placeProps();
    this.placeRift();
    this.placeWallRift();
    this.createPlayer(RIFT.x, RIFT.y - RIFT_SPAWN_UP);
    this.player.onDeath = () => {
      this.ui.banner('Вы потерпели поражение', COLORS.bad, 2);
      this.time.delayedCall(2200, () => this.finish(true));
    };
    audio.music('tense');
    this.whenUi(() => {
      this.ui.banner(`${this.location.level}. ${this.location.name}`, COLORS.blade, 2.2);
      this.updateObjective();
      this.buildMinimap();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.enemies.clear(); });
  }

  private placeProps(): void {
    for (const k of BANNER_AT) {
      const x = Math.round(MAP_W * k);
      const b = this.prop('castle_banner', x, WALL_BANNER.y).setTint(this.location.theme === 'crypt' ? 0x9aaeee : 0xffffff);
      b.setScale(b.scaleX * WALL_BANNER.scale);
    }
    for (const x of [PILLARS.side, MAP_W - PILLARS.side]) for (const y of PILLARS.rows.map((k) => Math.round(MAP_H * k))) {
      this.prop('castle_pillar', x, y);
      this.groundShadow(x, y, 1.2);
      this.colliders.add(x, y - 4, 10);
    }
    const tint = this.location.theme === 'crypt' ? 0x85cbe7 : this.location.theme === 'forge' ? 0xff783f : 0xffc174;
    for (const x of [100, MAP_W - 100]) {
      this.fitToHero(this.prop('castle_brazier', x, 116));
      this.groundShadow(x, 116, 0.9, 0.7);
      this.colliders.add(x, 112, 6);
      const light = this.add.image(x, 92, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(3.5).setAlpha(0.3).setDepth(DEPTH.fx - 20);
      this.tweens.add({ targets: light, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  /** Разлом Бездны внизу арены (нарисован в полу): лиловое сияние и чёрный дым; удерживая E — назад в замок. */
  private placeRift(): void {
    const { x, y } = RIFT;
    const glow = this.add.image(x, y, TEXTURES.glow).setTint(0x7a2ac0).setBlendMode(Phaser.BlendModes.ADD).setScale(3, 1.4).setAlpha(0.35).setDepth(DEPTH.decals + 2);
    this.tweens.add({ targets: glow, alpha: 0.18, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.smoke = new AbyssSmoke(this, { x: x - 6, y: y - 4, w: 12, h: 4, driftX: 0, driftY: -30, spread: 12, depth: y + 1, every: 0.2 });
    this.interactables.push({
      x, y, radius: RIFT_REACH, promptY: 30, hold: SETTINGS.expedition.returnHoldSeconds,
      label: () => this.cleared ? 'Победа! Вернуться в замок' : 'Вернуться в замок (держите)',
      use: () => this.finish(false),
    });
  }

  /** Следующий этаж: обычная волна (на каждом этаже врагов больше), на последнем — босс. */
  private nextFloor(): void {
    this.wave++;
    if (this.wave >= ARENA_FLOORS) { this.ui.banner(`Этаж ${this.wave} / ${ARENA_FLOORS}`, COLORS.bad, 1.4); this.spawnBoss(); }
    else this.spawnWave();
  }

  /** Этаж зачищен: счёт пройденных подряд растёт. */
  private floorCleared(): void {
    this.floorsCleared = this.wave;
    if (this.floorsCleared < ARENA_FLOORS) this.ui.banner(`Этаж ${this.floorsCleared} пройден`, COLORS.blade, 1.4);
  }

  private spawnWave(): void {
    const count = this.location.firstWave + (this.wave - 1) * this.location.perFloor;
    this.ui.banner(`Этаж ${this.wave} / ${ARENA_FLOORS}`, COLORS.blade, 1.4);
    for (let i = 0; i < count; i++) {
      const free = SPAWN_POINTS.filter((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) >= SPAWN_DISTANCE);
      const p = free[i % free.length] ?? SPAWN_POINTS[i % SPAWN_POINTS.length]!;
      const next = WAVE_ORDER[i % WAVE_ORDER.length]!;
      const type: EnemyTypeId = next === 'ogre' && this.location.level === 1 ? 'orc' : next;
      this.fx.ring(p.x, p.y, 16, COLORS.gold, 0.6);
      this.enemies.spawn(type, p.x, p.y, { hpMul: this.location.hpMultiplier });
    }
  }

  private spawnBoss(): void {
    const far = SPAWN_POINTS.find((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) > SPAWN_DISTANCE) ?? BOSS_START;
    this.king = this.enemies.spawn('king', far.x, far.y, { hpMul: this.location.hpMultiplier }) as AbyssKing;
    this.ui.banner(ENEMY_TYPES.king.name, COLORS.bad, 2);
    audio.play('roar');
  }

  private completeArena(): void {
    this.cleared = true;
    session.completeArena(this.location.id);
    session.earnCoins(this.location.reward);
    this.ui.message(`Награда за арену: +${this.location.reward} монет`, 'castle_coin');
    this.ui.banner('Арена пройдена!', COLORS.blade, 3);
    this.ui.setBoss(null);
    audio.play('victory');
    this.updateObjective();
  }

  private updateObjective(): void {
    this.ui.setObjective(this.cleared ? `Все ${ARENA_FLOORS} этажей пройдены · разлом внизу — путь в замок`
      : `Этаж ${Math.max(1, this.wave)}/${ARENA_FLOORS} · врагов: ${this.enemies.activeCount}`);
  }

  private buildMinimap(): void {
    this.ui.setMinimap({ key: this.groundKey, w: 80, h: Math.round((80 * MAP_H) / MAP_W), worldW: MAP_W, worldH: MAP_H,
      markers: () => [
        { ...RIFT, color: COLORS.gold },
        ...this.enemies.enemies.map((m) => ({ x: m.x, y: m.y, color: COLORS.bad, blink: m === this.king })),
      ],
    });
  }

  override playerStrike(x: number, y: number, dx: number, dy: number, range: number, arc: number, damage: number): number {
    return this.enemies.strike(x, y, dx, dy, range, arc, damage) + this.strikeRifts(x, y, dx, dy, range, arc);
  }

  /** Удар по воронкам в полу (как по врагам: в дальности и в дуге взмаха); RIFT_BODY.hits ударов — воронка рассыпается. */
  private strikeRifts(x: number, y: number, dx: number, dy: number, range: number, arc: number): number {
    let hits = 0;
    const base = Math.atan2(dy, dx);
    for (const rift of this.floorRifts) {
      if (rift.hits >= RIFT_BODY.hits || rift.t < FLOOR_RIFT.open) continue;
      const d = Phaser.Math.Distance.Between(x, y, rift.x, rift.y);
      if (d > range + RIFT_BODY.hitR || Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(rift.y - y, rift.x - x) - base)) > arc) continue;
      hits++;
      rift.hits++;
      const broken = rift.hits >= RIFT_BODY.hits;
      this.fx.burst({ x: rift.x, y: rift.y - 6, count: broken ? 26 : 8, speed: [20, broken ? 90 : 50], life: [0.3, 0.7], size: [1, 3], tints: [0xd8a8ff, 0x8a3ad0, 0x4b5265], gravity: 80, depth: rift.y + 1 });
      this.tweens.add({ targets: rift.img, x: rift.x + Phaser.Math.Between(-2, 2), duration: 50, yoyo: true, repeat: 1, onComplete: () => rift.img.setX(rift.x) });
      audio.play(broken ? 'portal' : 'hit');
      // рассыпалась: сразу закрывается (последняя часть жизни — сжатие), препятствие и замедление уходят
      if (broken) { rift.t = Math.max(rift.t, FLOOR_RIFT.life - FLOOR_RIFT.open); for (const c of rift.body) this.colliders.remove(c); }
    }
    return hits;
  }

  private onMobDied(mob: Mob): void {
    const boss = mob === this.king;
    const coins = (boss ? ECONOMY.bossCoins : ECONOMY.mobCoins) * this.location.level;
    session.earnCoins(coins);
    this.fx.floatText(mob.x, mob.y - 30, `+${coins}`, COLORS.gold);
    this.ui.message(`+${coins} монет`, 'castle_coin');
    const coin = addIcon(this, mob.x, mob.y - 14, 'castle_coin').setDepth(DEPTH.fx);
    this.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, duration: 650, onComplete: () => coin.destroy() });
    if (boss) { this.kingDown = true; this.ui.setBoss(null); }
  }

  private finish(died: boolean): void {
    if (this.ending) return;
    this.ending = true;
    const floors = session.recordArenaFloors(this.location.id, this.floorsCleared);
    const report = session.finishRun(died, this.kingDown, this.cleared);
    report.floors = floors;
    audio.play('portal');
    this.goTo(SCENES.base, { arrival: true });
  }

  /** Уйти с арены из меню: не поражение — раны остаются, смерть не засчитывается. */
  abandonRun(): void { this.finish(false); }

  goMenu(): void {
    session.clearRun(); session.hp = session.maxHp; session.save();
    this.scene.stop(SCENES.ui); this.goTo(SCENES.menu);
  }

  protected tick(dt: number): void {
    this.smoke.update(dt);
    if (!this.player.alive) return;
    this.enemies.update(dt, this.player);
    if (!this.player.alive) return;
    if (this.player.potionPressed()) {
      if (session.data.poultice > 0 && session.hp < session.maxHp) {
        session.data.poultice--; this.player.heal(SETTINGS.base.poulticeHeal); session.save();
      } else { audio.play('error'); this.ui.message(session.data.poultice > 0 ? 'Здоровье уже полное' : 'Нет эликсиров'); }
    }
    this.tickFloorRifts(dt);
    if (this.king && !this.kingDown) this.ui.setBoss(ENEMY_TYPES.king.name, this.king.hp / this.king.maxHp);
    if (!this.cleared && this.enemies.activeCount === 0) {
      if (this.wave > this.floorsCleared) this.floorCleared();
      if (this.floorsCleared >= ARENA_FLOORS) { this.completeArena(); return; }
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) { this.nextWaveIn = WAVE_DELAY; this.nextFloor(); }
    }
    this.updateObjective();
  }

  // ---------------- разломы Бездны ----------------
  /** Объёмный разлом посередине задней стены (между знамёнами): лиловое сияние дышит, из тьмы вылетают искры. */
  private placeWallRift(): void {
    if (!this.location.rifts?.wall) return;
    const W = ARENA_RIFTS.wall, x = MAP_W / 2;
    const rift = this.add.image(x, WALL_RIFT_Y, W.key).setOrigin(W.anchor.x / W.w, W.anchor.y / W.h).setDepth(DEPTH.ground + 2);
    rift.setScale(1 / textureResolution(rift.texture));
    const glow = this.add.image(x, WALL_RIFT_Y - 26, TEXTURES.glow).setTint(0x9a40ff).setBlendMode(Phaser.BlendModes.ADD).setScale(2, 3).setAlpha(0.4).setDepth(DEPTH.ground + 3);
    this.tweens.add({ targets: glow, alpha: 0.2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.time.addEvent({ delay: 450, loop: true, callback: () => this.fx.burst({ x: x + Phaser.Math.Between(-4, 4), y: WALL_RIFT_Y - 26 + Phaser.Math.Between(-12, 12), count: 1, speed: [6, 18], life: [0.6, 1.2], size: [1, 2], tints: [0xd8a8ff, 0x9a40ff], gravity: -10, blend: Phaser.BlendModes.ADD, depth: DEPTH.ground + 4 }) });
  }

  /** Разломы в полу: открываются время от времени, замедляют героя рядом с собой и закрываются. */
  private tickFloorRifts(dt: number): void {
    const R = FLOOR_RIFT;
    let slow = 1;
    for (const rift of this.floorRifts) {
      rift.t += dt;
      const k = rift.t < R.open ? rift.t / R.open : rift.t > R.life - R.open ? (R.life - rift.t) / R.open : 1;
      rift.img.setScale(Math.max(0, k) / textureResolution(rift.img.texture)); rift.glow.setAlpha(0.35 * k);
      rift.ring.clear().lineStyle(1, 0xb070ff, 0.35 * k).strokeEllipse(rift.x, rift.y, R.radius * 2 * k, R.radius * 1.2 * k);
      if (k > 0.5 && rift.hits < RIFT_BODY.hits && Phaser.Math.Distance.Between(this.player.x, this.player.y, rift.x, rift.y) < R.radius * k) slow = R.slow;
    }
    this.player.speedMul = slow;
    for (const rift of this.floorRifts.filter((r) => r.t >= R.life)) { rift.img.destroy(); rift.glow.destroy(); rift.ring.destroy(); for (const c of rift.body) this.colliders.remove(c); }
    this.floorRifts = this.floorRifts.filter((r) => r.t < R.life);
    if (!this.location.rifts?.floor || this.cleared) return;
    // новая тройка — когда прежние закрылись и прошло время
    if (this.floorRifts.length > 0) return;
    this.nextRiftIn -= dt;
    if (this.nextRiftIn > 0) return;
    this.nextRiftIn = Phaser.Math.FloatBetween(R.every[0], R.every[1]);
    for (let i = 0; i < R.group; i++) this.openFloorRift();
  }

  /** Новый разлом — в свободном месте пола, не под героем и не на разломе возврата. */
  private openFloorRift(): void {
    const R = FLOOR_RIFT, b = ROOM_BOUNDS;
    for (let tries = 0; tries < 12; tries++) {
      const x = Phaser.Math.Between(b.side + R.radius, MAP_W - b.side - R.radius), y = Phaser.Math.Between(b.top + R.radius, MAP_H - b.bottom - ARENA_RIFT.up - R.radius);
      // не под героем, не на другом разломе и не на враге (воронка — препятствие, враг бы застрял)
      const near = [this.player, ...this.floorRifts].some((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) < R.minGap)
        || this.enemies.enemies.some((m) => Phaser.Math.Distance.Between(x, y, m.x, m.y) < RIFT_BODY.reach + m.config.radius + 4);
      if (near || this.map.isBlocked(x, y) || this.colliders.overlaps(x, y, 12)) continue;
      // кристаллы торчат вверх — глубина по y, как у объектов: герой за разломом заходит за кристаллы
      const F = ARENA_RIFTS.floor, img = this.add.image(x, y, F.key).setOrigin(F.anchor.x / F.w, F.anchor.y / F.h).setDepth(y).setScale(0);
      const glow = this.add.image(x, y - 4, TEXTURES.glow).setTint(0x8a30e0).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 1.2).setAlpha(0).setDepth(DEPTH.decals + 1);
      this.floorRifts.push({ x, y, t: 0, hits: 0, img, glow, ring: this.add.graphics().setDepth(DEPTH.decals + 1), body: RIFT_BODY.circles.map(([dx, r]) => this.colliders.add(x + dx, y, r)) });
      this.fx.burst({ x, y, count: 10, speed: [10, 40], life: [0.3, 0.7], size: [1, 2], tints: [0xc080ff, 0x8a30e0], gravity: -20, depth: DEPTH.fx });
      audio.play('portal');
      return;
    }
  }
}
