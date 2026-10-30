import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { AbyssKing } from '../characters/AbyssKing';
import { ENEMY_TYPES, type EnemyTypeId } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, GAME, SCENES } from '../configs/game';
import { ECONOMY, LOCATIONS, roomEntry, type ArenaRoomConfig, type LocationConfig, type LocationId, type PassageConfig } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { addCastleAmbience, addCastleFront, addCastleGround, ARENA_SIZE, arenaGroundKey, CASTLE_BOUNDS, GATE, GATE_BARS_UP, paintCastleGround, passageAt, PORTCULLIS, roomPassages, WALL_BANNER, type RoomPassages } from '../systems/CastleArt';
import { EnemyManager } from '../systems/EnemyManager';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import { MapBounds } from '../systems/MapBounds';
import { session } from '../state/Session';
import { WorldScene } from './WorldScene';

const MAP_W = ARENA_SIZE.w;
const MAP_H = ARENA_SIZE.h;
/** На сколько пикселей от проёма входа появляется герой (снизу — от нижнего края карты). */
const ENTRY_GAP = { bottom: 66, top: 30 } as const;
/** Насколько близко к открытому проходу подойти, чтобы перейти в следующую комнату. */
const PASSAGE_REACH = 14;
/** Решётка поднимается за столько миллисекунд. */
const GATE_LIFT_MS = 700;
const BOSS_START = { x: MAP_W / 2, y: 150 };
const WAVE_DELAY = 2.5;
const SPAWN_DISTANCE = 112;
/** Знамёна на задней стене (доли ширины); то, что попало на дверь, не вешается. */
const BANNER_AT = [0.12, 0.37, 0.63, 0.88] as const;
const BANNER_CLEAR = 52;
/** Состав волны по порядку появления (по кругу); огры — только со второй арены (на первой вместо них орки). */
const WAVE_ORDER: EnemyTypeId[] = ['skeleton', 'orc', 'archer', 'skeleton', 'orc', 'ogre'];
const SPAWN_POINTS = [
  { x: 140, y: 140 }, { x: 280, y: 126 }, { x: 420, y: 140 },
  { x: 116, y: 220 }, { x: 444, y: 220 }, { x: 176, y: 290 }, { x: 384, y: 290 },
];

/**
 * Одна сцена для трёх арен. Арена — цепочка комнат: в каждой свои волны, после них поднимается решётка прохода
 * в следующую комнату (проходы в разных стенах). В последней комнате — Король Бездны, награда и возврат в зал.
 */
export class ExpeditionScene extends WorldScene {
  private location: LocationConfig = LOCATIONS[0]!;
  private roomIndex = 0;
  private entry: PassageConfig = { side: 'bottom', at: 0.5 };
  private passages: RoomPassages = {};
  private exitGate: Phaser.GameObjects.Image | null = null;
  private exitOpen = false;
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

  private get room(): ArenaRoomConfig { return this.location.rooms[this.roomIndex]!; }

  init(data: { location?: LocationId; room?: number }): void {
    const requested = LOCATIONS.find((loc) => loc.id === data.location);
    this.location = requested && session.isUnlocked(requested.id) ? requested : LOCATIONS[0]!;
    this.roomIndex = Phaser.Math.Clamp(data.room ?? 0, 0, this.location.rooms.length - 1);
    this.entry = roomEntry(this.location, this.roomIndex);
    const exit = this.room.exit;
    this.passages = roomPassages(MAP_W, exit ? [this.entry, exit] : [this.entry]);
  }

  /** Где герой появляется: чуть внутри комнаты от проёма входа. */
  private startPoint(): { x: number; y: number } {
    const x = passageAt(this.entry, MAP_W);
    return this.entry.side === 'bottom' ? { x, y: MAP_H - ENTRY_GAP.bottom } : { x, y: CASTLE_BOUNDS.top + ENTRY_GAP.top };
  }

  create(): void {
    this.king = null;
    this.kingDown = false;
    this.bossSpawned = false;
    this.cleared = false;
    this.ending = false;
    this.wave = 0;
    this.nextWaveIn = WAVE_DELAY;
    this.exitGate = null;
    this.exitOpen = false;
    const map = new MapBounds(MAP_W, MAP_H, CASTLE_BOUNDS);
    paintCastleGround(this, this.groundKey, MAP_W, MAP_H, this.location.theme, this.passages);
    addCastleGround(this, this.groundKey, MAP_W, this.passages);
    this.initWorld(map, 'expedition');
    addCastleAmbience(this, MAP_W, this.location.theme);
    addCastleFront(this, this.colliders, MAP_W, MAP_H, this.location.theme, this.passages.bottom ?? null);   // ближняя стена; проём — если вход снизу
    this.enemies = new EnemyManager(this, this, {
      width: MAP_W, height: MAP_H,
      isFree: (x, y) => !map.isBlocked(x, y) && !this.colliders.overlaps(x, y, 10),
      pickType: () => 'skeleton',
    });
    this.enemies.wavesEnabled = false;
    this.enemies.onDied = (mob) => this.onMobDied(mob);
    this.enemies.onPhase = (msg) => this.ui.banner(msg, COLORS.bad, 2);
    this.placeProps();
    this.placeReturnGate();
    if (this.room.exit) this.exitGate = this.placeGate(this.room.exit);
    const start = this.startPoint();
    this.createPlayer(start.x, start.y);
    this.player.onDeath = () => {
      this.ui.banner('Вы потерпели поражение', COLORS.bad, 2);
      this.time.delayedCall(2200, () => this.finish(true));
    };
    audio.music('tense');
    this.whenUi(() => {
      const title = this.roomIndex === 0 ? `${this.location.level}. ${this.location.name}` : `Комната ${this.roomIndex + 1} из ${this.location.rooms.length}`;
      this.ui.banner(title, COLORS.blade, 2.2);
      this.updateObjective();
      this.buildMinimap();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.enemies.clear(); });
  }

  private placeProps(): void {
    for (const k of BANNER_AT) {
      const x = Math.round(MAP_W * k);
      if (this.passages.top !== undefined && Math.abs(x - this.passages.top) < BANNER_CLEAR) continue;
      const b = this.prop('castle_banner', x, WALL_BANNER.y).setTint(this.location.theme === 'crypt' ? 0x9aaeee : 0xffffff);
      b.setScale(b.scaleX * WALL_BANNER.scale);
    }
    for (const x of [64, MAP_W - 64]) for (const y of [150, 286]) {
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

  /** Вход: ворота снизу или опущенная решётка за спиной; у входа можно отступить в замок. */
  private placeReturnGate(): void {
    const start = this.startPoint();
    this.placeGate(this.entry);
    this.interactables.push({
      x: start.x, y: start.y, radius: 30, promptY: 40, hold: SETTINGS.expedition.returnHoldSeconds,
      label: () => this.cleared ? 'Победа! Вернуться в замок' : 'Вернуться в замок (держите)',
      use: () => this.finish(false),
    });
  }

  /** Опущенная решётка ворот — посередине толщины стены, между столбами (низ текстуры — на 1 пиксель ниже острий). */
  private placeGate(pass: PassageConfig): Phaser.GameObjects.Image {
    const at = passageAt(pass, MAP_W), k = 1 / GAME.resolution;
    if (pass.side === 'top') return this.add.image(at, CASTLE_BOUNDS.top - GATE_BARS_UP + 1, PORTCULLIS.top).setOrigin(0.5, 1).setScale(k).setDepth(DEPTH.ground + 3);
    return this.add.image(at, MAP_H - GATE_BARS_UP + 1, PORTCULLIS.front).setOrigin(0.5, 1).setScale(k).setDepth(MAP_H + 2);
  }

  /** Комната зачищена: решётка выхода поднимается. */
  private openExit(): void {
    this.exitOpen = true;
    const gate = this.exitGate;
    // решётка уходит вверх, в стену, и гаснет
    if (gate) this.tweens.add({ targets: gate, y: gate.y - 26, alpha: 0, duration: GATE_LIFT_MS, ease: 'Sine.easeIn' });
    this.ui.banner('Проход открыт!', COLORS.blade, 2);
    audio.play('portal');
  }

  /** Герой дошёл до открытого прохода — следующая комната. */
  private checkExit(): void {
    const exit = this.room.exit;
    if (!exit) return;
    const p = this.player;
    if (p.y < CASTLE_BOUNDS.top + PASSAGE_REACH && Math.abs(p.x - passageAt(exit, MAP_W)) < GATE.half) this.goTo(SCENES.expedition, { location: this.location.id, room: this.roomIndex + 1 });
  }

  private spawnWave(): void {
    const count = this.room.waves[this.wave]!;
    this.wave++;
    this.ui.banner(`Волна ${this.wave} / ${this.room.waves.length}`, COLORS.blade, 1.4);
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
    const room = `Комната ${this.roomIndex + 1}/${this.location.rooms.length}`;
    this.ui.setObjective(this.cleared ? 'Победа · у входа — путь в замок'
      : this.exitOpen ? `${room} · проход открыт`
      : this.bossSpawned ? `${room} · босс · врагов: ${this.enemies.activeCount}`
      : `${room} · волна ${Math.max(1, this.wave)}/${Math.max(1, this.room.waves.length)} · врагов: ${this.enemies.activeCount}`);
  }

  /** Точка на миникарте у проёма (вход или выход). */
  private passagePoint(pass: PassageConfig): { x: number; y: number } {
    return { x: passageAt(pass, MAP_W), y: pass.side === 'top' ? CASTLE_BOUNDS.top : MAP_H - 40 };
  }

  private buildMinimap(): void {
    this.ui.setMinimap({ key: this.groundKey, w: 80, h: 56, worldW: MAP_W, worldH: MAP_H,
      markers: () => [
        { ...this.passagePoint(this.room.exit ?? this.entry), color: COLORS.gold },
        ...this.enemies.enemies.map((m) => ({ x: m.x, y: m.y, color: COLORS.bad, blink: m === this.king })),
      ],
    });
  }

  override playerStrike(x: number, y: number, dx: number, dy: number, range: number, arc: number, damage: number): number {
    return this.enemies.strike(x, y, dx, dy, range, arc, damage);
  }

  private onMobDied(mob: Mob): void {
    const boss = mob === this.king;
    const coins = (boss ? ECONOMY.bossCoins : ECONOMY.mobCoins) * this.location.level + session.killBonus;
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
    session.finishRun(died, this.kingDown, this.cleared);
    audio.play('portal');
    this.goTo(SCENES.base, { arrival: true });
  }

  abandonRun(): void { this.finish(true); }

  goMenu(): void {
    session.clearRun(); session.hp = session.maxHp; session.save();
    this.scene.stop(SCENES.ui); this.goTo(SCENES.menu);
  }

  protected tick(dt: number): void {
    if (!this.player.alive) return;
    this.enemies.update(dt, this.player);
    if (!this.player.alive) return;
    if (this.player.potionPressed()) {
      if (session.data.poultice > 0 && session.hp < session.maxHp) {
        session.data.poultice--; this.player.heal(SETTINGS.base.poulticeHeal); session.save();
      } else { audio.play('error'); this.ui.message(session.data.poultice > 0 ? 'Здоровье уже полное' : 'Нет эликсиров'); }
    }
    if (this.king && !this.kingDown) this.ui.setBoss(ENEMY_TYPES.king.name, this.king.hp / this.king.maxHp);
    if (!this.cleared && !this.exitOpen && this.enemies.activeCount === 0) {
      if (this.bossSpawned && this.kingDown) { this.completeArena(); return; }
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) {
        this.nextWaveIn = WAVE_DELAY;
        if (this.wave < this.room.waves.length) this.spawnWave();
        else if (this.room.exit) this.openExit();
        else if (!this.bossSpawned) this.spawnBoss();
        else this.completeArena();
      }
    }
    if (this.exitOpen) this.checkExit();
    this.updateObjective();
  }
}
