import Phaser from 'phaser';
import type { Mob } from '../characters/Mob';
import { SlimeKing } from '../characters/SlimeKing';
import type { EnemyTypeId } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { type ResourceId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { EnemyManager } from '../systems/EnemyManager';
import { LootManager } from '../systems/Loot';
import { NODE_DEFS, ResourceNode } from '../systems/Nodes';
import { audio } from '../systems/Sfx';
import { Terrain, THEMES, mulberry32, type Ellipse } from '../systems/Terrain';
import { session } from '../state/Session';
import { WorldScene } from './WorldScene';

const MAP_W = 960;
const MAP_H = 672;
const START = { x: 480, y: 566 };
const ARENA = { x: 480, y: 132, r: 74 };
const MINI = { w: 80, h: 56 };

/** Локация 1 — Мшистая Лощина. Карта каждый раз новая; цель — собрать ресурсы и победить Короля слизней. */
export class ExpeditionScene extends WorldScene {
  private enemies!: EnemyManager;
  private loot!: LootManager;
  private nodes: ResourceNode[] = [];
  private king: SlimeKing | null = null;
  private kingDown = false;
  private bossShown = false;
  private ending = false;
  private beacon: { x: number; y: number } | null = null;
  private leafT = 0;
  private shafts: Phaser.GameObjects.Rectangle[] = [];
  private objT = 0;
  private treeDots: { x: number; y: number }[] = [];
  /** Кроны, которые становятся полупрозрачными, когда игрок стоит за ними. */
  private canopies: { img: Phaser.GameObjects.Image; node: ResourceNode | null }[] = [];

  constructor() { super({ key: SCENES.expedition }); }

  create(): void {
    this.nodes = [];
    this.king = null;
    this.kingDown = false;
    this.bossShown = false;
    this.ending = false;
    this.beacon = null;
    this.treeDots = [];
    this.canopies = [];
    this.shafts = [];
    const seed = Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);

    // --- рельеф: тропа к арене, пруды, поляна на старте ---
    const trail = [{ x: START.x, y: START.y - 10 }];
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const y = START.y - 10 - ((START.y - ARENA.y - 70) * i) / steps;
      trail.push({ x: i === steps ? ARENA.x : Phaser.Math.Clamp(480 + (rng() - 0.5) * 360, 150, 810), y });
    }
    trail.push({ x: ARENA.x, y: ARENA.y + ARENA.r });
    const ponds: Ellipse[] = [];
    for (let tries = 0; tries < 80 && ponds.length < 3; tries++) {
      const p = { x: 100 + rng() * (MAP_W - 200), y: 230 + rng() * 300, rx: 36 + rng() * 26, ry: 22 + rng() * 16 };
      if (trail.some((t) => Math.hypot(t.x - p.x, (t.y - p.y) * 0.8) < p.rx + 54)) continue;
      if (ponds.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 130)) continue;
      ponds.push(p);
    }
    const terrain = new Terrain({
      width: MAP_W, height: MAP_H, seed, theme: THEMES.hollow!,
      ponds, paths: [{ points: trail, width: 17 }],
      clearings: [{ x: START.x, y: START.y - 6, rx: 78, ry: 34 }, { x: ARENA.x, y: ARENA.y, rx: ARENA.r + 6, ry: ARENA.r * 0.82 }],
      rune: { x: ARENA.x, y: ARENA.y, r: ARENA.r - 12 },
    });
    terrain.paint(this, 'exp-ground');
    this.add.image(0, 0, 'exp-ground').setOrigin(0, 0).setDepth(DEPTH.ground);
    this.initWorld(terrain, 'expedition');

    this.loot = new LootManager(this, this.fx);
    this.loot.onPickup = (kind, n) => this.ui.pickup(kind, n);
    this.enemies = new EnemyManager(this, this, {
      width: MAP_W, height: MAP_H,
      isFree: (x, y) => !this.terrain.isBlocked(x, y) && !this.colliders.overlaps(x, y, 8) && Math.hypot(x - START.x, y - START.y) > 130,
      pickType: (_x, y): EnemyTypeId => {
        const r = Math.random();
        if (y > 450) return r < 0.85 ? 'slime' : 'sporeling';
        if (y > 250) return r < 0.5 ? 'slime' : r < 0.8 ? 'sporeling' : 'wasp';
        return r < 0.3 ? 'slime' : r < 0.6 ? 'sporeling' : 'wasp';
      },
    });
    this.enemies.onDied = (m) => this.onMobDied(m);
    this.enemies.onPhase = (msg) => this.ui.banner(msg, COLORS.bad, 2.2);

    this.placeProps(rng, trail, ponds);
    this.placeMobs(rng);
    this.placeObelisk();

    this.createPlayer(START.x, START.y + 8);
    this.player.onDeath = () => this.onPlayerDeath();

    // атмосфера: лёгкая тень по краям, лучи света, пыльца
    this.add.image(0, 0, 'title_vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay - 6).setAlpha(0.55);
    for (let i = 0; i < 4; i++) {
      const r = this.add.rectangle(60 + i * 120, -20, 22, 340, 0xfff0b0, 0.05).setOrigin(0.5, 0).setRotation(-0.35).setScrollFactor(0).setDepth(DEPTH.overlay - 7).setBlendMode(Phaser.BlendModes.ADD);
      this.shafts.push(r);
    }

    audio.music('tense');
    this.whenUi(() => {
      this.buildMinimap();
      this.ui.banner('Мшистая Лощина', COLORS.gold, 2.4);
      this.ui.setObjective('Цель: найдите Короля слизней');
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.loot.clear(); this.enemies.clear(); });
  }

  // ---------------- генерация карты ----------------
  private placeProps(rng: () => number, trail: { x: number; y: number }[], ponds: Ellipse[]): void {
    const placed: { x: number; y: number; r: number }[] = [];
    const t = this.terrain;
    const okSpot = (x: number, y: number, r: number, clearTrail = true): boolean => {
      if (x < 20 || y < 20 || x > MAP_W - 20 || y > MAP_H - 20) return false;
      if (t.water(x, y) > -0.45) return false;
      if (clearTrail && t.path(x, y) > -16) return false;
      if (Math.hypot(x - START.x, (y - START.y) * 1.3) < 96) return false;
      if (Math.hypot(x - ARENA.x, (y - ARENA.y) * 1.2) < ARENA.r + 8) return false;
      for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < p.r + r) return false;
      return true;
    };
    const node = (frame: string, x: number, y: number): void => {
      const def = NODE_DEFS[frame];
      if (!def) return;
      const n = new ResourceNode(this, this, this.colliders, frame, x, y, def);
      this.nodes.push(n);
      if (def.kind === 'tree') { this.treeDots.push({ x, y }); this.canopies.push({ img: n.sprite, node: n }); }
    };
    const wall = (frame: string, x: number, y: number): void => {
      this.canopies.push({ img: this.prop(frame, x, y), node: null });
      this.add.image(x, y + 1, TEXTURES.shadow).setScale(1.6).setDepth(y - 0.7);
      this.colliders.add(x, y, 6);
      this.treeDots.push({ x, y });
    };
    const treeFrames = ['tree_oak_a', 'tree_oak_b', 'tree_oak_c', 'tree_pine_a', 'tree_pine_b'];

    // сплошная стена леса по краям
    for (let y = 0; y < MAP_H + 24; y += 22) {
      for (let x = -4; x < MAP_W + 24; x += 24) {
        const px = x + (rng() - 0.5) * 14 + (Math.floor(y / 22) % 2) * 11, py = y + (rng() - 0.5) * 10;
        const edge = Math.min(px, MAP_W - px, py, MAP_H - py);
        if (edge > 34) continue;
        wall(treeFrames[Math.floor(rng() * treeFrames.length)]!, px, py);
      }
    }
    // кольцо мёртвых деревьев и валунов вокруг арены
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.45) continue;
      const x = ARENA.x + Math.cos(a) * (ARENA.r + 20), y = ARENA.y + Math.sin(a) * (ARENA.r * 0.84 + 18);
      if (i % 2) { this.prop('tree_dead', x, y); this.colliders.add(x, y, 5); this.add.image(x, y + 1, TEXTURES.shadow).setScale(1.1).setDepth(y - 0.7); }
      else node('rock_l', x, y);
      placed.push({ x, y, r: 16 });
    }
    // деревья: чем севернее, тем гуще и мрачнее
    let trees = 0;
    for (let i = 0; i < 2500 && trees < 120; i++) {
      const x = 40 + rng() * (MAP_W - 80), y = 40 + rng() * (MAP_H - 80);
      const north = 1 - y / MAP_H;
      if (rng() > 0.18 + north * 0.55 || !okSpot(x, y, 14)) continue;
      const frame = north > 0.55 && rng() < 0.5 ? (rng() < 0.5 ? 'tree_pine_a' : 'tree_pine_b') : treeFrames[Math.floor(rng() * treeFrames.length)]!;
      node(frame, x, y);
      placed.push({ x, y, r: 14 });
      trees++;
    }
    // камни
    for (let i = 0, n = 0; i < 500 && n < 30; i++) {
      const x = 40 + rng() * (MAP_W - 80), y = 60 + rng() * (MAP_H - 140);
      if (!okSpot(x, y, 14)) continue;
      node(rng() < 0.4 ? 'rock_s' : rng() < 0.7 ? 'rock_m' : 'rock_l', x, y);
      placed.push({ x, y, r: 14 }); n++;
    }
    // ягодные кусты — ближе к старту, волокно — везде
    for (let i = 0, n = 0; i < 400 && n < 16; i++) {
      const x = 50 + rng() * (MAP_W - 100), y = 300 + rng() * 320;
      if (!okSpot(x, y, 12, false)) continue;
      node('bush_berry', x, y); placed.push({ x, y, r: 12 }); n++;
    }
    for (let i = 0, n = 0; i < 600 && n < 34; i++) {
      const x = 50 + rng() * (MAP_W - 100), y = 60 + rng() * (MAP_H - 120);
      if (!okSpot(x, y, 10, false)) continue;
      node(rng() < 0.5 ? 'bush_a' : 'bush_b', x, y); placed.push({ x, y, r: 10 }); n++;
    }
    // светящиеся грибы — в тени севера
    for (let i = 0, n = 0; i < 500 && n < 14; i++) {
      const x = 50 + rng() * (MAP_W - 100), y = 70 + rng() * 360;
      if (!okSpot(x, y, 12)) continue;
      node('mushroom_glow_0', x, y); placed.push({ x, y, r: 12 }); n++;
      this.add.image(x, y - 6, TEXTURES.glow).setTint(0x55c3e8).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.28).setDepth(y + 1);
    }
    // украшения: трава, цветы, папоротники, брёвна, пеньки, красные грибы
    const decor = ['grass_a', 'grass_b', 'fern', 'flower_red', 'flower_yellow', 'flower_blue', 'flower_white', 'pebbles', 'mushroom_red'];
    for (let i = 0, n = 0; i < 1600 && n < 300; i++) {
      const x = 30 + rng() * (MAP_W - 60), y = 30 + rng() * (MAP_H - 60);
      if (t.water(x, y) > -0.3 || t.path(x, y) > -2 && rng() < 0.6) continue;
      this.prop(decor[Math.floor(rng() * decor.length)]!, x, y); n++;
    }
    for (let i = 0, n = 0; i < 300 && n < 9; i++) {
      const x = 60 + rng() * (MAP_W - 120), y = 80 + rng() * (MAP_H - 200);
      if (!okSpot(x, y, 16)) continue;
      const log = rng() < 0.5;
      this.prop(log ? 'log' : 'stump', x, y); this.colliders.add(x, y, log ? 7 : 5);
      placed.push({ x, y, r: 14 }); n++;
    }
    for (const p of ponds) {
      for (let k = 0; k < 7; k++) {
        const a = rng() * Math.PI * 2, x = p.x + Math.cos(a) * (p.rx + 2), y = p.y + Math.sin(a) * (p.ry + 4);
        if (t.water(x, y) > 0.05 || t.water(x, y) < -0.4) continue;
        this.prop(k % 2 ? 'reeds' : 'flower_white', x, y);
      }
    }
    void trail;
  }

  private placeMobs(rng: () => number): void {
    const spot = (y0: number, y1: number): { x: number; y: number } => {
      for (let i = 0; i < 60; i++) {
        const x = 60 + rng() * (MAP_W - 120), y = y0 + rng() * (y1 - y0);
        if (!this.terrain.isBlocked(x, y) && !this.colliders.overlaps(x, y, 12) && Math.hypot(x - START.x, y - START.y) > 150 && Math.hypot(x - ARENA.x, y - ARENA.y) > ARENA.r + 30) return { x, y };
      }
      return { x: START.x - 120, y: START.y - 200 };
    };
    for (let i = 0; i < 10; i++) { const p = spot(300, MAP_H - 120); this.enemies.spawn('slime', p.x, p.y); }
    for (let i = 0; i < 5; i++) { const p = spot(180, 520); this.enemies.spawn('sporeling', p.x, p.y); }
    for (let i = 0; i < 4; i++) { const p = spot(60, 380); this.enemies.spawn('wasp', p.x, p.y); }
    this.king = this.enemies.spawn('king', ARENA.x, ARENA.y + 6) as SlimeKing;
  }

  private placeObelisk(): void {
    const o = this.animProp('obelisk', 'obelisk_0', START.x, START.y - 24);
    o.setOrigin(0.5, 0.92);
    this.add.image(START.x, START.y - 28, TEXTURES.shadow).setScale(1.6, 0.9).setDepth(START.y - 25);
    this.add.image(START.x, START.y - 44, TEXTURES.glow).setTint(0x5fe0d4).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setAlpha(0.35).setDepth(DEPTH.fx - 20);
    this.colliders.add(START.x, START.y - 26, 9);
    this.interactables.push({
      x: START.x, y: START.y - 16, radius: 40, promptY: 62, hold: SETTINGS.expedition.returnHoldSeconds,
      label: () => 'Вернуться в лагерь (держите)', use: () => this.finish(false),
    });
  }

  private spawnBeacon(x: number, y: number): void {
    this.beacon = { x, y };
    const o = this.animProp('obelisk', 'obelisk_1', x, y);
    o.setOrigin(0.5, 0.92);
    this.add.image(x, y - 22, TEXTURES.glow).setTint(0xf2d060).setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0.4).setDepth(DEPTH.fx - 20);
    this.colliders.add(x, y + 2, 9);
    this.fx.poof(x, y, 1.6);
    this.interactables.push({
      x, y: y + 8, radius: 40, promptY: 62, hold: SETTINGS.expedition.returnHoldSeconds,
      label: () => 'Вернуться в лагерь (держите)', use: () => this.finish(false),
    });
  }

  private buildMinimap(): void {
    if (this.textures.exists('minimap')) this.textures.remove('minimap');
    const tex = this.textures.createCanvas('minimap', MINI.w, MINI.h);
    if (!tex) return;
    const ctx = tex.getContext();
    const colors = [0x3c6440, 0x8a6a48, 0x3f7f9c, 0x70543a];
    for (let y = 0; y < MINI.h; y++) {
      for (let x = 0; x < MINI.w; x++) {
        const k = this.terrain.kindAt((x + 0.5) * (MAP_W / MINI.w), (y + 0.5) * (MAP_H / MINI.h));
        ctx.fillStyle = `#${colors[k]!.toString(16).padStart(6, '0')}`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = '#1f3a2a';
    for (const d of this.treeDots) ctx.fillRect(Math.floor(d.x / (MAP_W / MINI.w)), Math.floor(d.y / (MAP_H / MINI.h)), 1, 1);
    tex.refresh();
    this.ui.setMinimap({
      key: 'minimap', w: MINI.w, h: MINI.h, worldW: MAP_W, worldH: MAP_H,
      markers: () => {
        const list: { x: number; y: number; color: number; blink?: boolean }[] = [{ x: START.x, y: START.y - 24, color: 0x5fe0d4 }];
        if (this.king && !this.kingDown) list.push({ x: this.king.x, y: this.king.y, color: 0xff5a4a, blink: true });
        if (this.beacon) list.push({ x: this.beacon.x, y: this.beacon.y, color: 0xf2d060 });
        return list;
      },
    });
  }

  // ---------------- бой и добыча ----------------
  override playerStrike(x: number, y: number, dx: number, dy: number, range: number, arc: number, damage: number): number {
    let hits = this.enemies.strike(x, y, dx, dy, range, arc, damage);
    const base = Math.atan2(dy, dx);
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const nx = n.x - x, ny = n.y - 6 - y;
      const d = Math.hypot(nx, ny);
      if (d > range + n.def.reach) continue;
      if (d > n.def.reach && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(ny, nx) - base)) > arc) continue;
      n.hit(damage, x);
      hits++;
    }
    return hits;
  }

  override dropLoot(x: number, y: number, kind: ResourceId, amount: number): void {
    this.loot.spawn(x, y, kind, amount);
  }

  private onMobDied(m: Mob): void {
    if (m === this.king || m instanceof SlimeKing) {
      this.kingDown = true;
      this.ui.setBoss(null);
      this.ui.banner('Король слизней повержен!', COLORS.gold, 3.2);
      this.ui.setObjective('Цель: вернитесь к обелиску');
      audio.play('victory');
      this.shake(0.012, 500);
      this.fx.burst({ x: m.x, y: m.y - 10, count: 50, speed: [30, 140], life: [0.6, 1.4], size: [2, 4], tints: [0xf2d060, 0x63c99f, 0xfff0a0], gravity: 100, depth: DEPTH.fx });
      this.dropLoot(m.x, m.y, 'stone', 3);
      this.spawnBeacon(ARENA.x, ARENA.y + 34);
    }
  }

  private onPlayerDeath(): void {
    this.ui.banner('Вы потеряли сознание…', COLORS.bad, 2.6);
    this.time.delayedCall(2200, () => this.finish(true));
  }

  /** Конец вылазки: добыча уезжает на склад, переходим в лагерь. */
  private finish(died: boolean): void {
    if (this.ending) return;
    this.ending = true;
    session.finishRun(died, this.kingDown);
    audio.play('portal');
    this.goTo(SCENES.base, { arrival: true });
  }

  abandonRun(): void { this.finish(true); }

  goMenu(): void {
    session.clearCarry();
    session.hp = session.maxHp;
    session.save();
    this.scene.stop(SCENES.ui);
    this.goTo(SCENES.menu);
  }

  /** Если игрок за деревом — крона просвечивает, чтобы героя было видно. */
  private fadeCanopies(dt: number): void {
    const px = this.player.x, py = this.player.y;
    for (const c of this.canopies) {
      const s = c.img;
      if (!s.active || (c.node && !c.node.alive)) continue;
      if (Math.abs(s.x - px) > 44 || s.y < py - 4 || s.y - py > 80) { if (s.alpha < 1) s.setAlpha(Math.min(1, s.alpha + dt * 4)); continue; }
      const behind = Math.abs(s.x - px) < s.displayWidth * 0.42 && s.y > py && s.y - py < s.displayHeight * 0.95;
      const target = behind ? 0.45 : 1;
      s.setAlpha(s.alpha + Math.sign(target - s.alpha) * Math.min(Math.abs(target - s.alpha), dt * 5));
    }
  }

  // ---------------- каждый кадр ----------------
  protected tick(dt: number): void {
    this.enemies.update(dt, this.player);
    this.loot.update(dt, this.player);

    if (this.player.potionPressed()) {
      if (session.data.poultice > 0 && session.hp < session.maxHp) {
        session.data.poultice -= 1;
        this.player.heal(SETTINGS.base.poulticeHeal);
      } else { audio.play('error'); this.ui.message(session.data.poultice > 0 ? 'Здоровье и так полное' : 'Припарок нет'); }
    }

    // бой с боссом: полоска здоровья появляется, когда игрок подошёл к арене
    const k = this.king;
    if (k && !this.kingDown && !k.dead) {
      const d = Math.hypot(this.player.x - k.x, this.player.y - k.y);
      if (d < 150 && !this.bossShown) { this.bossShown = true; this.ui.banner('Король слизней', COLORS.bad, 2); audio.play('roar'); }
      this.ui.setBoss(this.bossShown && d < 330 ? 'Король слизней' : null, k.hp / k.maxHp);
    }

    // листья и пыльца в воздухе
    this.leafT -= dt;
    if (this.leafT <= 0) {
      this.leafT = 0.22;
      const cam = this.cameras.main;
      this.fx.burst({ x: cam.scrollX + Math.random() * 520 - 20, y: cam.scrollY - 6, count: 1, speed: [6, 16], angle: [Math.PI * 0.2, Math.PI * 0.8], life: [3, 4.5], size: [2, 3], tints: [0x82b95a, 0xd9b45a, 0x56924a, 0xfff0b0], gravity: 5, endScale: 0.6, depth: DEPTH.fx - 50 });
    }
    this.fadeCanopies(dt);
    const now = this.time.now / 1000;
    this.shafts.forEach((s, i) => s.setAlpha(0.035 + 0.03 * Math.sin(now * 0.5 + i * 1.7)));

    this.objT -= dt;
    if (this.objT <= 0) {
      this.objT = 1;
      if (!this.kingDown && this.player.y < 330) this.ui.setObjective('Цель: найдите Короля слизней');
    }
  }
}
