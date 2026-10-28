import Phaser from 'phaser';
import { SLIME_ORIGIN, SLIME_RUN_ANIMATIONS, TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import {
  BUILDING_IDS, BUILDINGS, LOCATIONS, POULTICE_COST, RESOURCE_INFO, RESOURCES, WEAPON_NAMES, type BuildingId, type LocationId,
} from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { audio } from '../systems/Sfx';
import { PText } from '../ui/PText';
import { CASTLE_BOUNDS, paintCastleGround } from '../systems/CastleArt';
import { Terrain, THEMES } from '../systems/Terrain';
import { session, type Report } from '../state/Session';
import { WorldScene } from './WorldScene';
import type { ChoiceOption } from './UIScene';

const MAP_W = 640;
const MAP_H = 416;
const FIRE = { x: 320, y: 232 };
const GATE = { x: 320, y: 106 };
const HOP = [0.15, 0.7, 1.5, 1.7, 1.3, 0.35, 0.1, 0.15];

interface Plot {
  id: BuildingId;
  sprite: Phaser.GameObjects.Image;
  mark: PText | null;
  lights: Phaser.GameObjects.Image[];
}

/** Замковый зал: отдых, торговля, улучшения и ворота на арены. */
export class BaseScene extends WorldScene {
  private plots = new Map<BuildingId, Plot>();
  private fireGlow!: Phaser.GameObjects.Image;
  private smokeT = 0;
  private emberT = 0;
  private flies: { img: Phaser.GameObjects.Image; a: number; b: number; r: number; x: number; y: number }[] = [];
  private pet!: Phaser.GameObjects.Sprite;
  private petShadow!: Phaser.GameObjects.Image;
  private petTarget = { x: 380, y: 262 };
  private petT = 0;
  private objT = 0;
  private markT = 0;
  private arrived: Report | null = null;
  private intro = false;

  constructor() { super({ key: SCENES.base }); }

  init(data: { intro?: boolean; arrival?: boolean }): void {
    this.arrived = data.arrival ? session.lastReport : null;
    this.intro = !!data.intro;
  }

  create(): void {
    this.plots.clear();
    this.flies = [];
    const terrain = new Terrain({ width: MAP_W, height: MAP_H, seed: 4242, theme: THEMES.hollow!, bounds: CASTLE_BOUNDS });
    paintCastleGround(this, 'base-ground', MAP_W, MAP_H, 'hall');
    this.add.image(0, 0, 'base-ground').setOrigin(0, 0).setDepth(DEPTH.ground);
    this.initWorld(terrain, 'base');

    this.buildHall();
    this.buildCampfire();
    this.buildGate();
    for (const id of BUILDING_IDS) this.buildPlot(id);
    this.buildPet();

    // тёплый вечер: лёгкая синева поверх всего мира + светляки
    this.add.rectangle(0, 0, 480, 270, 0x182334, 0.06).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay - 5);
    for (let i = 0; i < 8; i++) {
      const img = this.add.image(0, 0, TEXTURES.glow).setTint(0xe6c992).setBlendMode(Phaser.BlendModes.ADD).setScale(0.16).setDepth(DEPTH.fx - 10);
      this.flies.push({ img, a: Math.random() * 6, b: Math.random() * 6, r: Phaser.Math.Between(8, 26), x: Phaser.Math.Between(60, MAP_W - 60), y: Phaser.Math.Between(110, MAP_H - 60) });
    }

    const from = this.arrived ? { x: GATE.x, y: GATE.y + 52 } : { x: FIRE.x, y: FIRE.y + 40 };
    this.createPlayer(from.x, from.y);
    this.player.setDepth(from.y);
    audio.music('calm');
    this.whenUi(() => this.refreshObjective());

    this.time.delayedCall(550, () => {
      if (this.arrived) this.showReport(this.arrived);
      else if (this.intro) this.ui.banner('Добро пожаловать в Зал клинков', COLORS.gold, 3);
    });
  }

  // ---------------- мир ----------------
  private buildHall(): void {
    for (const x of [70, 236, 404, 570]) {
      this.prop('castle_banner', x, 78);
      this.prop('castle_pillar', x, 148);
      this.colliders.add(x, 144, 10);
    }
    for (const [x, y] of [[78, 284], [562, 284], [268, 136], [372, 136]] as const) {
      this.prop('castle_brazier', x, y);
      const glow = this.add.image(x, y - 28, TEXTURES.glow).setTint(0xffae58).setScale(2.6).setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 20);
      this.tweens.add({ targets: glow, alpha: 0.18, duration: 600 + x, yoyo: true, repeat: -1 });
      this.colliders.add(x, y - 3, 6);
    }
    this.prop('castle_merchant', 320, 362);
    this.colliders.add(320, 353, 22);
    new PText(this, 320, 374, 'ТОРГОВЕЦ', { ax: 0.5, color: COLORS.gold }).setDepth(DEPTH.prompt - 1);
    this.interactables.push({ x: 320, y: 338, radius: 42, promptY: 62, label: () => 'Торговец · купить предметы', use: () => this.ui.openShop() });
    for (const id of BUILDING_IDS) {
      const cfg = BUILDINGS[id];
      new PText(this, cfg.x, cfg.y + 23, cfg.name, { ax: 0.5, color: COLORS.dim }).setDepth(cfg.y + 24);
    }
  }

  private buildCampfire(): void {
    this.prop('castle_brazier', FIRE.x, FIRE.y);
    this.add.image(FIRE.x, FIRE.y, TEXTURES.shadow).setScale(1.8, 1).setDepth(FIRE.y - 3);
    this.colliders.add(FIRE.x, FIRE.y, 10);
    this.fireGlow = this.add.image(FIRE.x, FIRE.y - 14, TEXTURES.glow).setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(7).setAlpha(0.42).setDepth(DEPTH.fx - 30);
    this.interactables.push({
      x: FIRE.x, y: FIRE.y + 6, radius: 38, promptY: 40,
      label: () => 'Отдохнуть и сохранить',
      use: () => this.rest(),
    });
  }

  private rest(): void {
    audio.play('rest');
    if (session.hp < session.maxHp) session.hp = session.maxHp;
    session.save();
    this.fx.burst({ x: FIRE.x, y: FIRE.y - 16, count: 18, speed: [10, 50], angle: [-Math.PI, 0], life: [0.6, 1.2], size: [2, 3], tints: [0xffc24a, 0xffeaa0, 0x9be06a], gravity: -20, depth: DEPTH.fx });
    this.ui.message('Вы отдохнули. Игра сохранена');
  }

  private buildGate(): void {
    const g = this.prop('castle_gate', GATE.x, GATE.y + 4);
    g.setOrigin(0.5, 0.96);
    this.colliders.add(GATE.x - 26, GATE.y, 8); this.colliders.add(GATE.x + 26, GATE.y, 8);
    this.colliders.add(GATE.x - 14, GATE.y - 4, 6); this.colliders.add(GATE.x + 14, GATE.y - 4, 6);
    this.add.image(GATE.x, GATE.y - 30, TEXTURES.glow).setTint(0x5fe0d4).setBlendMode(Phaser.BlendModes.ADD).setScale(3.6).setAlpha(0.3).setDepth(DEPTH.fx - 25);
    this.interactables.push({
      x: GATE.x, y: GATE.y + 22, radius: 48, promptY: 66,
      label: () => 'Выбрать арену',
      use: () => this.openExpeditionBoard(),
    });
  }

  private buildPet(): void {
    this.petShadow = this.add.image(380, 262, TEXTURES.shadow).setScale(0.7);
    this.pet = this.add.sprite(380, 262, TEXTURES.slimeRun).setOrigin(SLIME_ORIGIN.x, SLIME_ORIGIN.y).setScale(0.8);
    this.pet.play(SLIME_RUN_ANIMATIONS.down);
    this.pet.setTint(0xd8ffe8);
  }

  // ---------------- постройки ----------------
  private buildPlot(id: BuildingId): void {
    const cfg = BUILDINGS[id];
    const sprite = this.prop(`castle_${id}`, cfg.x, cfg.y);
    const plot: Plot = { id, sprite, mark: null, lights: [] };
    this.plots.set(id, plot);
    this.refreshPlot(id, false);
    // коллайдеры по ширине постройки
    for (let dx = -22; dx <= 22; dx += 11) this.colliders.add(cfg.x + dx, cfg.y - 4, 7);
    this.interactables.push({
      x: cfg.x, y: cfg.y + 10, radius: 44, promptY: 74,
      label: () => this.buildLabel(id),
      use: () => this.openBuildMenu(id),
    });
  }

  private buildLabel(id: BuildingId): string {
    const lv = session.data.buildings[id];
    const name = BUILDINGS[id].name;
    if (id === 'garden' && lv > 0 && session.data.gardenStage >= 3) return 'Собрать урожай';
    if (lv === 0) return `Обустроить: ${name}`;
    if (lv < 3) return `Улучшить: ${name}`;
    return name;
  }

  private refreshPlot(id: BuildingId, pop: boolean): void {
    const plot = this.plots.get(id)!;
    const cfg = BUILDINGS[id];
    const lv = session.data.buildings[id];
    plot.sprite.setTexture(`castle_${id}`).setOrigin(0.5, 1);
    plot.sprite.setTint(lv === 0 ? 0xb7b9c6 : 0xffffff);
    plot.lights.forEach((l) => l.destroy());
    plot.lights = [];
    const glow = (x: number, y: number, tint: number, scale: number, a: number): void => {
      plot.lights.push(this.add.image(x, y, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(a).setDepth(DEPTH.fx - 20));
    };
    if (id === 'workshop' && lv > 0) glow(cfg.x, cfg.y - 14, 0xff8a2a, 1.6, 0.4);
    if (id === 'hut' && lv >= 2) glow(cfg.x + (lv === 3 ? -14 : 14), cfg.y - 20, 0xffd060, 1.2, 0.4);
    if (pop) {
      this.tweens.add({ targets: plot.sprite, scaleY: { from: 1.18, to: 1 }, scaleX: { from: 0.9, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
  }

  private openBuildMenu(id: BuildingId): void {
    const cfg = BUILDINGS[id];
    const lv = session.data.buildings[id];
    const options: ChoiceOption[] = [];
    if (id === 'garden' && lv > 0 && session.data.gardenStage >= 3) {
      options.push({
        label: 'Собрать урожай', desc: 'Свежие ягоды и волокно — в склад.',
        onChoose: () => { const gain = session.harvestGarden(); if (gain) { audio.play('pickup'); this.refreshPlot('garden', true); this.ui.message('Урожай собран!', 'icon_berries'); } },
      });
    }
    if (lv < 3) {
      const cost = cfg.costs[lv]!;
      options.push({
        label: lv === 0 ? 'Обустроить' : `Улучшить до ур. ${lv + 1}`, cost, desc: cfg.effects[lv],
        enabled: session.canAfford(cost),
        onChoose: () => { this.constructBuilding(id, cost); },
      });
    }
    if (id === 'workshop' && lv >= 1) {
      options.push({
        label: `Сделать эликсир (${session.data.poultice}/${SETTINGS.base.poulticeMax})`, cost: POULTICE_COST,
        desc: `Лечит ${SETTINGS.base.poulticeHeal} здоровья. Применяется клавишей Q на арене.`,
        enabled: session.canAfford(POULTICE_COST) && session.data.poultice < SETTINGS.base.poulticeMax,
        onChoose: () => {
          if (session.data.poultice < SETTINGS.base.poulticeMax && session.pay(POULTICE_COST)) {
            session.data.poultice += 1; session.save(); audio.play('heal');
          }
          this.openBuildMenu(id);
        },
      });
    }
    options.push({ label: 'Закрыть', onChoose: () => undefined });
    const lines = [cfg.description];
    if (lv > 0) lines.push(`Уровень ${lv}: ${cfg.effects[lv - 1]}`);
    if (id === 'workshop') lines.push(`Оружие: ${WEAPON_NAMES[lv]} (урон ${session.damage})`);
    if (id === 'garden' && lv > 0) lines.push(`Рост: ${session.data.gardenStage}/3`);
    this.ui.openChoice({ title: `${cfg.name}${lv ? ` · ур. ${lv}` : ''}`, lines, options, width: 350 });
  }

  private constructBuilding(id: BuildingId, cost: Parameters<typeof session.upgrade>[1]): void {
    if (!session.upgrade(id, cost)) return;
    const cfg = BUILDINGS[id];
    const plot = this.plots.get(id)!;
    this.player.frozen = true;
    this.transitioning = true;
    audio.play('build');
    plot.sprite.setTint(0xd8b46a);
    if (plot.sprite.frame.customPivot) plot.sprite.setOrigin(plot.sprite.frame.pivotX, plot.sprite.frame.pivotY);
    let n = 0;
    const hammer = this.time.addEvent({
      delay: 220, repeat: 6,
      callback: () => {
        n++;
        this.fx.dust(cfg.x + Phaser.Math.Between(-18, 18), cfg.y - 4);
        this.fx.burst({ x: cfg.x + Phaser.Math.Between(-14, 14), y: cfg.y - 16, count: 6, speed: [20, 60], angle: [-Math.PI, 0], life: [0.2, 0.5], size: [1, 3], tints: [0xffeaa0, 0xc58f58, 0xffffff], gravity: 200, depth: cfg.y + 10 });
        this.tweens.add({ targets: plot.sprite, x: cfg.x + (n % 2 ? 1 : -1), duration: 40, yoyo: true });
      },
    });
    this.time.delayedCall(1700, () => {
      hammer.remove();
      plot.sprite.setX(cfg.x);
      this.refreshPlot(id, true);
      this.fx.poof(cfg.x, cfg.y - 10, 1.6);
      this.fx.burst({ x: cfg.x, y: cfg.y - 20, count: 30, speed: [30, 110], life: [0.5, 1], size: [2, 3], tints: [0xf2d060, 0xfff0a0, 0x5fe0d4], gravity: 60, depth: cfg.y + 12 });
      this.shake(0.004, 160);
      audio.play('victory');
      const lv = session.data.buildings[id];
      this.ui.banner(lv === 1 ? `Обустроено: ${cfg.name}` : `${cfg.name}: уровень ${lv}`, COLORS.gold, 2.4);
      this.player.frozen = false;
      this.transitioning = false;
      this.refreshObjective();
    });
  }

  // ---------------- вылазка ----------------
  private openExpeditionBoard(): void {
    const options: ChoiceOption[] = LOCATIONS.map((loc) => {
      const unlocked = session.isUnlocked(loc.id);
      return {
        label: `${loc.level}. ${loc.name}${session.data.cleared.includes(loc.id) ? ' · пройдено' : unlocked ? '' : ' · закрыто'}`,
        desc: unlocked ? `${loc.description} Награда: ${loc.reward} монет.` : 'Победите всех врагов и босса предыдущей арены.',
        enabled: unlocked,
        onChoose: () => { this.startExpedition(loc.id); },
      };
    });
    options.push({ label: 'Остаться в замке', onChoose: () => undefined });
    const pack = `Рюкзак: ${session.capacity} мест`;
    this.ui.openChoice({
      title: 'Испытания ордена',
      lines: [`Оружие: ${WEAPON_NAMES[session.weaponLevel]} · урон ${session.damage}`, `${pack} · эликсиров: ${session.data.poultice}`],
      options, width: 330,
    });
  }

  private startExpedition(location: LocationId): void {
    session.clearCarry();
    audio.play('portal');
    this.goTo(SCENES.expedition, { location });
  }

  private showReport(r: Report): void {
    const lines: string[] = [];
    const parts = RESOURCES.filter((k) => (r.loot[k] ?? 0) > 0).map((k) => `${RESOURCE_INFO[k].name} ×${r.loot[k]}`);
    lines.push(parts.length ? `Добыча: ${parts.join(', ')}.` : 'Рюкзак пуст.');
    if (r.died && r.lost > 0) lines.push(`На арене осталось ${r.lost} шт. добычи.`);
    lines.push(`Побеждено врагов: ${r.kills}.`);
    lines.push(`Заработано монет: ${r.coins}. Они уже в кошельке.`);
    if (r.cleared) lines.push('Арена пройдена! Прогресс сохранён.');
    if (r.king) lines.push('Король слизней повержен!');
    if (session.data.buildings.garden > 0 && session.data.gardenStage >= 3) lines.push('Травы у аптекаря готовы.');
    this.ui.openChoice({ title: r.died ? 'Вас принесли в замок' : 'Возвращение в зал', lines, options: [{ label: 'Хорошо', onChoose: () => undefined }], closable: true, width: 310 });
    session.lastReport = null;
  }

  private refreshObjective(): void {
    const cleared = session.data.cleared.length;
    this.ui.setObjective(cleared === LOCATIONS.length ? 'Все арены пройдены · I — инвентарь' : `Арены: ${cleared}/${LOCATIONS.length} · ворота на севере`);

  }

  goMenu(): void {
    session.save();
    this.scene.stop(SCENES.ui);
    this.goTo(SCENES.menu);
  }

  // ---------------- каждый кадр ----------------
  protected tick(dt: number): void {
    const now = this.time.now / 1000;
    this.fireGlow.setAlpha(0.38 + Math.sin(now * 17) * 0.04 + Math.sin(now * 7.3) * 0.03).setScale(7 + Math.sin(now * 11) * 0.12);
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = 0.09;
      this.fx.burst({ x: FIRE.x + Phaser.Math.Between(-4, 4), y: FIRE.y - 18, count: 1, speed: [5, 18], angle: [-Math.PI * 0.65, -Math.PI * 0.35], life: [1, 2], size: [1, 2], tints: [0xffc24a, 0xf58a2a, 0xffeaa0], gravity: -12, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    }
    this.smokeT -= dt;
    const wl = session.data.buildings.workshop;
    if (this.smokeT <= 0 && wl >= 2) {
      this.smokeT = 0.35;
      const c = BUILDINGS.workshop;
      this.fx.burst({ x: c.x + (wl === 2 ? 22 : 26), y: c.y - (wl === 2 ? 56 : 64), count: 1, speed: [4, 10], angle: [-Math.PI * 0.6, -Math.PI * 0.4], life: [1.2, 2.2], size: [3, 5], tints: [0x8a8498, 0xb8b0c0], gravity: -10, depth: DEPTH.fx - 8 });
    }
    for (const f of this.flies) {
      f.a += dt * 0.7; f.b += dt * 0.5;
      f.img.setPosition(f.x + Math.sin(f.a) * f.r, f.y + Math.cos(f.b) * f.r * 0.6).setAlpha(0.3 + 0.7 * Math.abs(Math.sin(now * 1.6 + f.a)));
    }
    this.updatePet(dt);
    this.markT -= dt;
    if (this.markT <= 0) { this.markT = 0.6; this.updateMarks(); }
    this.objT -= dt;
    if (this.objT <= 0) { this.objT = 2; this.refreshObjective(); }
    if (this.player.potionPressed()) this.ui.message('Эликсиры пригодятся на арене');
  }

  private updatePet(dt: number): void {
    this.petT -= dt;
    if (this.petT <= 0) {
      this.petT = Phaser.Math.FloatBetween(2, 5);
      const a = Math.random() * Math.PI * 2, r = Phaser.Math.Between(20, 70);
      this.petTarget = { x: FIRE.x + Math.cos(a) * r * 1.4, y: FIRE.y + 24 + Math.sin(a) * r * 0.6 };
      if (Math.random() < 0.3) this.fx.floatText(this.pet.x, this.pet.y - 22, '♥', 0xff8aa8);
    }
    const dx = this.petTarget.x - this.pet.x, dy = this.petTarget.y - this.pet.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const f = HOP[Number(this.pet.frame.name) % 8] ?? 1;
      this.move(this.pet, (dx / d) * 22 * f * dt, (dy / d) * 22 * f * dt, 5);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      const key = SLIME_RUN_ANIMATIONS[dir];
      if (this.pet.anims.currentAnim?.key !== key) { const p = this.pet.anims.getProgress(); this.pet.play(key); this.pet.anims.setProgress(p); }
    }
    this.pet.setDepth(this.pet.y);
    this.petShadow.setPosition(this.pet.x, this.pet.y + 1).setDepth(this.pet.y - 0.5);
  }

  /** Золотой «!» над постройкой, которую уже можно построить или улучшить. */
  private updateMarks(): void {
    for (const id of BUILDING_IDS) {
      const plot = this.plots.get(id)!;
      const lv = session.data.buildings[id];
      const ready = (lv < 3 && session.canAfford(BUILDINGS[id].costs[lv]!)) || (id === 'garden' && lv > 0 && session.data.gardenStage >= 3);
      const top = plot.sprite.y - plot.sprite.displayHeight * plot.sprite.originY - 4;
      if (ready && !plot.mark) {
        plot.mark = new PText(this, plot.sprite.x, top, '!', { font: 'big', ax: 0.5, ay: 1, color: COLORS.gold }).setDepth(DEPTH.fx);
        this.tweens.add({ targets: plot.mark, y: top - 4, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!ready && plot.mark) {
        this.tweens.killTweensOf(plot.mark);
        plot.mark.destroy();
        plot.mark = null;
      }
    }
  }
}
