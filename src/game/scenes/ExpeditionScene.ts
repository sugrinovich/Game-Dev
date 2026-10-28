import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { SlimeKing } from '../characters/SlimeKing';
import type { EnemyTypeId } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { ECONOMY, LOCATIONS, type LocationConfig, type LocationId, type ResourceId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { CASTLE_BOUNDS, paintCastleGround } from '../systems/CastleArt';
import { EnemyManager } from '../systems/EnemyManager';
import { LootManager } from '../systems/Loot';
import { NODE_DEFS, ResourceNode } from '../systems/Nodes';
import { audio } from '../systems/Sfx';
import { Terrain, THEMES } from '../systems/Terrain';
import { session } from '../state/Session';
import { WorldScene } from './WorldScene';

const MAP_W = 640;
const MAP_H = 448;
const START = { x: MAP_W / 2, y: 374 };
const BOSS_START = { x: MAP_W / 2, y: 160 };
const WAVE_DELAY = 2.5;
const SPAWN_DISTANCE = 112;
const SPAWN_POINTS = [
  { x: 164, y: 150 }, { x: 320, y: 134 }, { x: 476, y: 150 },
  { x: 136, y: 254 }, { x: 504, y: 254 }, { x: 200, y: 330 }, { x: 440, y: 330 },
];

/** Одна сцена для трёх арен: конечные волны, босс, награда и возврат в зал. */
export class ExpeditionScene extends WorldScene {
  private location: LocationConfig = LOCATIONS[0]!;
  private enemies!: EnemyManager;
  private loot!: LootManager;
  private nodes: ResourceNode[] = [];
  private king: SlimeKing | null = null;
  private kingDown = false;
  private bossSpawned = false;
  private cleared = false;
  private ending = false;
  private wave = 0;
  private nextWaveIn = WAVE_DELAY;

  constructor() { super({ key: SCENES.expedition }); }

  init(data: { location?: LocationId }): void {
    const requested = LOCATIONS.find((loc) => loc.id === data.location);
    this.location = requested && session.isUnlocked(requested.id) ? requested : LOCATIONS[0]!;
  }

  create(): void {
    this.nodes = [];
    this.king = null;
    this.kingDown = false;
    this.bossSpawned = false;
    this.cleared = false;
    this.ending = false;
    this.wave = 0;
    this.nextWaveIn = WAVE_DELAY;
    const terrain = new Terrain({ width: MAP_W, height: MAP_H, seed: this.location.level, theme: THEMES.hollow!, bounds: CASTLE_BOUNDS });
    paintCastleGround(this, 'arena-ground', MAP_W, MAP_H, this.location.theme);
    this.add.image(0, 0, 'arena-ground').setOrigin(0, 0).setDepth(DEPTH.ground);
    this.initWorld(terrain, 'expedition');
    this.loot = new LootManager(this, this.fx);
    this.loot.onPickup = (kind, n) => this.ui.pickup(kind, n);
    this.enemies = new EnemyManager(this, this, {
      width: MAP_W, height: MAP_H,
      isFree: (x, y) => !terrain.isBlocked(x, y) && !this.colliders.overlaps(x, y, 10),
      pickType: () => 'slime',
    });
    this.enemies.wavesEnabled = false;
    this.enemies.onDied = (mob) => this.onMobDied(mob);
    this.enemies.onPhase = (msg) => this.ui.banner(msg, COLORS.bad, 2);
    this.placeProps();
    this.placeReturnGate();
    this.createPlayer(START.x, START.y);
    this.player.onDeath = () => {
      this.ui.banner('Вы потерпели поражение', COLORS.bad, 2);
      this.time.delayedCall(2200, () => this.finish(true));
    };
    audio.music('tense');
    this.whenUi(() => {
      this.ui.banner(`${this.location.level}. ${this.location.name}`, COLORS.gold, 2.2);
      this.updateObjective();
      this.buildMinimap();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.loot.clear(); this.enemies.clear(); });
  }

  private placeProps(): void {
    for (const x of [70, 230, 410, 570]) {
      this.prop('castle_banner', x, 78).setTint(this.location.theme === 'crypt' ? 0x9aaeee : 0xffffff);
    }
    for (const x of [72, MAP_W - 72]) for (const y of [162, 302]) {
      this.prop('castle_pillar', x, y);
      this.colliders.add(x, y - 4, 10);
    }
    const tint = this.location.theme === 'crypt' ? 0x85cbe7 : this.location.theme === 'forge' ? 0xff783f : 0xffc174;
    for (const x of [114, MAP_W - 114]) {
      this.prop('castle_brazier', x, 116);
      this.colliders.add(x, 112, 6);
      const light = this.add.image(x, 90, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(3.5).setAlpha(0.3).setDepth(DEPTH.fx - 20);
      this.tweens.add({ targets: light, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
    }
    // Добыча для старых улучшений базы остаётся доступна на каждой арене.
    for (const x of [110, 530]) {
      for (const [frame, y] of [['castle_crate', 342], ['rock_m', 210], ['castle_supplies', 386]] as const) {
        const def = NODE_DEFS[frame];
        if (def) this.nodes.push(new ResourceNode(this, this, this.colliders, frame, x, y, def));
      }
    }
  }

  private placeReturnGate(): void {
    this.prop('castle_gate', START.x, MAP_H - 20).setScale(0.7).setAlpha(0.85);
    this.interactables.push({
      x: START.x, y: MAP_H - 48, radius: 34, promptY: 68, hold: SETTINGS.expedition.returnHoldSeconds,
      label: () => this.cleared ? 'Победа! Вернуться в замок' : 'Вернуться в замок (держите)',
      use: () => this.finish(false),
    });
  }

  private spawnWave(): void {
    const count = this.location.waves[this.wave]!;
    this.wave++;
    this.ui.banner(`Волна ${this.wave} / ${this.location.waves.length}`, COLORS.gold, 1.4);
    for (let i = 0; i < count; i++) {
      const free = SPAWN_POINTS.filter((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) >= SPAWN_DISTANCE);
      const p = free[i % free.length] ?? SPAWN_POINTS[i % SPAWN_POINTS.length]!;
      const type: EnemyTypeId = i % 4 === 3 && this.location.level > 1 ? 'wasp' : i % 3 === 2 ? 'sporeling' : 'slime';
      this.fx.ring(p.x, p.y, 16, COLORS.gold, 0.6);
      this.enemies.spawn(type, p.x, p.y, { hpMul: this.location.hpMultiplier });
    }
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const far = SPAWN_POINTS.find((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) > SPAWN_DISTANCE) ?? BOSS_START;
    this.king = this.enemies.spawn('king', far.x, far.y, { hpMul: this.location.hpMultiplier }) as SlimeKing;
    this.ui.banner('Король слизней', COLORS.bad, 2);
    audio.play('roar');
  }

  private completeArena(): void {
    this.cleared = true;
    session.completeArena(this.location.id);
    session.earnCoins(this.location.reward);
    this.ui.message(`Награда за арену: +${this.location.reward} монет`, 'castle_coin');
    this.ui.banner('Арена пройдена!', COLORS.gold, 3);
    this.ui.setBoss(null);
    audio.play('victory');
    this.updateObjective();
  }

  private updateObjective(): void {
    this.ui.setObjective(this.cleared ? 'Победа · выход внизу арены' : this.bossSpawned ? `Босс · врагов: ${this.enemies.activeCount}` : `Волна ${Math.max(1, this.wave)}/${this.location.waves.length} · врагов: ${this.enemies.activeCount}`);
  }

  private buildMinimap(): void {
    this.ui.setMinimap({ key: 'arena-ground', w: 80, h: 56, worldW: MAP_W, worldH: MAP_H,
      markers: () => [
        { x: START.x, y: MAP_H - 40, color: COLORS.gold },
        ...this.enemies.enemies.map((m) => ({ x: m.x, y: m.y, color: COLORS.bad, blink: m === this.king })),
      ],
    });
  }

  override playerStrike(x: number, y: number, dx: number, dy: number, range: number, arc: number, damage: number): number {
    let hits = this.enemies.strike(x, y, dx, dy, range, arc, damage);
    const base = Math.atan2(dy, dx);
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const nx = n.x - x, ny = n.y - 6 - y;
      const d = Math.hypot(nx, ny);
      if (d > range + n.def.reach) continue;
      if (d > n.def.reach && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(ny, nx) - base)) > arc) continue;
      n.hit(damage, x); hits++;
    }
    return hits;
  }

  override dropLoot(x: number, y: number, kind: ResourceId, amount: number): void { this.loot.spawn(x, y, kind, amount); }

  private onMobDied(mob: Mob): void {
    const boss = mob === this.king;
    const coins = (boss ? ECONOMY.bossCoins : ECONOMY.mobCoins) * this.location.level;
    session.earnCoins(coins);
    this.fx.floatText(mob.x, mob.y - 30, `+${coins}`, COLORS.gold);
    this.ui.message(`+${coins} монет`, 'castle_coin');
    const coin = this.add.image(mob.x, mob.y - 14, 'castle_coin').setDepth(DEPTH.fx);
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
    session.clearCarry(); session.hp = session.maxHp; session.save();
    this.scene.stop(SCENES.ui); this.goTo(SCENES.menu);
  }

  protected tick(dt: number): void {
    if (!this.player.alive) return;
    this.enemies.update(dt, this.player);
    this.loot.update(dt, this.player);
    if (!this.player.alive) return;
    if (this.player.potionPressed()) {
      if (session.data.poultice > 0 && session.hp < session.maxHp) {
        session.data.poultice--; this.player.heal(SETTINGS.base.poulticeHeal); session.save();
      } else { audio.play('error'); this.ui.message(session.data.poultice > 0 ? 'Здоровье уже полное' : 'Нет эликсиров'); }
    }
    if (this.king && !this.kingDown) this.ui.setBoss('Король слизней', this.king.hp / this.king.maxHp);
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
}
