import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { AbyssKing } from '../characters/AbyssKing';
import { ENEMY_TYPES, type EnemyTypeId } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { ECONOMY, LOCATIONS, RATING, type LocationConfig, type LocationId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { AbyssSmoke } from '../systems/AbyssSmoke';
import { addCastleAmbience, addCastleFront, addCastleGround, ARENA_RIFT, ARENA_SIZE, arenaGroundKey, paintCastleGround, ROOM_BOUNDS, WALL_BANNER } from '../systems/CastleArt';
import { EnemyManager } from '../systems/EnemyManager';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
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

/** Режим вылазки: арена сюжета (волны и босс) или «Рейтинг» (бой на время, волны без конца). */
export type ExpeditionMode = 'story' | 'rating';

/** Время боя для надписей: «мм:сс». */
export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Одна сцена для трёх арен сюжета и «Рейтинга». Арена — площадка в четырёх стенах: волны врагов, после последней —
 * босс, награда. В «Рейтинге» герой стоит в точке посередине, волны идут без конца (враги — из пройденных арен),
 * считается время. Разлом Бездны внизу арены (удерживая E) — путь в замок.
 */
export class ExpeditionScene extends WorldScene {
  private location: LocationConfig = LOCATIONS[0]!;
  private mode: ExpeditionMode = 'story';
  /** «Рейтинг»: сколько секунд идёт бой и какие враги приходят. */
  private elapsed = 0;
  private ratingMobs: EnemyTypeId[] = [];
  private smoke!: AbyssSmoke;
  private enemies!: EnemyManager;
  private king: AbyssKing | null = null;
  private kingDown = false;
  private bossSpawned = false;
  private cleared = false;
  private ending = false;
  private wave = 0;
  private nextWaveIn = WAVE_DELAY;

  constructor() { super({ key: SCENES.expedition }); }

  /** Свой пол у каждой темы: рисуется один раз (в загрузке) и переиспользуется. */
  private get groundKey(): string { return arenaGroundKey(this.location.theme); }

  init(data: { location?: LocationId; mode?: ExpeditionMode }): void {
    this.ratingMobs = session.ratingMobs;
    this.mode = data.mode === 'rating' && this.ratingMobs.length > 0 ? 'rating' : 'story';
    const requested = LOCATIONS.find((loc) => loc.id === (this.mode === 'rating' ? RATING.location : data.location));
    this.location = requested && session.isUnlocked(requested.id) ? requested : LOCATIONS[0]!;
  }

  create(): void {
    this.king = null;
    this.kingDown = false;
    this.bossSpawned = false;
    this.cleared = false;
    this.ending = false;
    this.wave = 0;
    this.nextWaveIn = this.mode === 'rating' ? RATING.every : WAVE_DELAY;   // в «Рейтинге» отсчёт ускоряется, пока врагов нет
    this.elapsed = 0;
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
    // в «Рейтинге» — точка посередине арены, в сюжете — у разлома
    if (this.mode === 'rating') this.createPlayer(MAP_W / 2, Math.round(MAP_H / 2));
    else this.createPlayer(RIFT.x, RIFT.y - RIFT_SPAWN_UP);
    this.player.onDeath = () => {
      this.ui.banner('Вы потерпели поражение', COLORS.bad, 2);
      this.time.delayedCall(2200, () => this.finish(true));
    };
    audio.music('tense');
    this.whenUi(() => {
      this.ui.banner(this.mode === 'rating' ? 'Рейтинг · на время' : `${this.location.level}. ${this.location.name}`, COLORS.blade, 2.2);
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

  private spawnWave(): void {
    const count = this.location.waves[this.wave]!;
    this.wave++;
    this.ui.banner(`Волна ${this.wave} / ${this.location.waves.length}`, COLORS.blade, 1.4);
    for (let i = 0; i < count; i++) {
      const free = SPAWN_POINTS.filter((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) >= SPAWN_DISTANCE);
      const p = free[i % free.length] ?? SPAWN_POINTS[i % SPAWN_POINTS.length]!;
      const next = WAVE_ORDER[i % WAVE_ORDER.length]!;
      const type: EnemyTypeId = next === 'ogre' && this.location.level === 1 ? 'orc' : next;
      this.fx.ring(p.x, p.y, 16, COLORS.gold, 0.6);
      this.enemies.spawn(type, p.x, p.y, { hpMul: this.location.hpMultiplier });
    }
  }

  /** «Рейтинг»: волна растёт с каждым разом, враги — по кругу из орды пройденных арен и всё крепче. */
  private spawnRatingWave(): void {
    const count = RATING.firstWave + this.wave * RATING.perWave, hpMul = 1 + this.wave * RATING.hpPerWave;
    this.wave++;
    this.ui.banner(`Волна ${this.wave}`, COLORS.blade, 1.2);
    for (let i = 0; i < count; i++) {
      const free = SPAWN_POINTS.filter((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) >= SPAWN_DISTANCE);
      const p = free[i % free.length] ?? SPAWN_POINTS[i % SPAWN_POINTS.length]!;
      this.fx.ring(p.x, p.y, 16, COLORS.gold, 0.6);
      this.enemies.spawn(this.ratingMobs[(this.wave + i) % this.ratingMobs.length]!, p.x, p.y, { hpMul });
    }
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
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
    if (this.mode === 'rating') {
      const best = session.data.ratingBest;
      this.ui.setObjective(`Время ${formatTime(this.elapsed)}${best ? ` · рекорд ${formatTime(best)}` : ''} · волна ${this.wave} · врагов: ${this.enemies.activeCount}`);
      return;
    }
    this.ui.setObjective(this.cleared ? 'Победа · разлом внизу — путь в замок'
      : this.bossSpawned ? `Босс · врагов: ${this.enemies.activeCount}`
      : `Волна ${Math.max(1, this.wave)}/${this.location.waves.length} · врагов: ${this.enemies.activeCount}`);
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
    return this.enemies.strike(x, y, dx, dy, range, arc, damage);
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
    if (this.mode === 'rating') session.finishRating(died, this.elapsed);
    else session.finishRun(died, this.kingDown, this.cleared);
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
    if (this.mode === 'rating') { this.tickRating(dt); return; }
    if (this.king && !this.kingDown) this.ui.setBoss(ENEMY_TYPES.king.name, this.king.hp / this.king.maxHp);
    if (!this.cleared && this.enemies.activeCount === 0) {
      if (this.bossSpawned && this.kingDown) { this.completeArena(); return; }
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) {
        this.nextWaveIn = WAVE_DELAY;
        if (this.wave < this.location.waves.length) this.spawnWave();
        else if (!this.bossSpawned) this.spawnBoss();
        else this.completeArena();
      }
    }
    this.updateObjective();
  }

  /** «Рейтинг»: идёт время; следующая волна — когда прежняя добита (после паузы) или через RATING.every секунд. */
  private tickRating(dt: number): void {
    this.elapsed += dt;
    this.nextWaveIn -= this.enemies.activeCount === 0 ? dt * (RATING.every / WAVE_DELAY) : dt;
    if (this.nextWaveIn <= 0) { this.nextWaveIn = RATING.every; this.spawnRatingWave(); }
    this.updateObjective();
  }
}
