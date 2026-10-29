import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import {
  BUILDING_IDS, BUILDINGS, LOCATIONS, POULTICE_PRICE, WEAPON_NAMES, type BuildingId, type LocationId,
} from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { audio } from '../systems/Sfx';
import { PText } from '../ui/PText';
import { addCastleAmbience, addCastleFront, CASTLE_BOUNDS, HALL_GROUND_KEY, HALL_SIZE, paintCastleGround } from '../systems/CastleArt';
import { MapBounds } from '../systems/MapBounds';
import { session, type Report } from '../state/Session';
import { WorldScene } from './WorldScene';
import type { ChoiceOption } from './UIScene';

const MAP_W = HALL_SIZE.w;
const MAP_H = HALL_SIZE.h;
const FIRE = { x: 320, y: 232 };
const GATE = { x: 320, y: 106 };
/** Котик в зале: бегает к случайным точкам пола, иногда садится отдохнуть. Скорость — пиксели в секунду. */
const CAT = { speed: 70, radius: 4, sitChance: 0.35, area: { x0: 60, x1: 580, y0: 120, y1: 380 } } as const;

interface Plot {
  id: BuildingId;
  sprite: Phaser.GameObjects.Sprite;
  /** Масштаб, до которого постройка уменьшена под рост героя. */
  scale: number;
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
    const map = new MapBounds(MAP_W, MAP_H, CASTLE_BOUNDS);
    paintCastleGround(this, HALL_GROUND_KEY, MAP_W, MAP_H, 'hall');
    this.add.image(0, 0, HALL_GROUND_KEY).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.initWorld(map, 'base');
    addCastleAmbience(this, MAP_W, 'hall');
    addCastleFront(this, this.colliders, MAP_W, MAP_H, 'hall', null);   // ближняя стена — поверх героя

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
      this.groundShadow(x, 148, 1.2);
      this.colliders.add(x, 144, 10);
    }
    for (const [x, y] of [[78, 284], [562, 284], [268, 136], [372, 136]] as const) {
      this.fitToHero(this.prop('castle_brazier', x, y));
      this.groundShadow(x, y, 0.9, 0.7);
      const glow = this.add.image(x, y - 24, TEXTURES.glow).setTint(0xffae58).setScale(2.6).setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 20);
      this.tweens.add({ targets: glow, alpha: 0.18, duration: 600 + x, yoyo: true, repeat: -1 });
      this.colliders.add(x, y - 3, 6);
    }
    this.fitToHero(this.prop('castle_merchant', 320, 362));
    this.groundShadow(320, 362, 1.3);
    for (const dx of [-12, 0, 12]) this.colliders.add(320 + dx, 357, 8);
    new PText(this, 320, 366, 'ТОРГОВЕЦ', { ax: 0.5, color: COLORS.gold }).setDepth(DEPTH.prompt - 1);
    this.interactables.push({ x: 320, y: 350, radius: 30, promptY: 34, label: () => 'Торговец · купить предметы', use: () => this.ui.openShop() });
    for (const id of BUILDING_IDS) {
      const cfg = BUILDINGS[id];
      new PText(this, cfg.x, cfg.y + 6, cfg.name, { ax: 0.5, color: COLORS.dim }).setDepth(cfg.y + 24);
    }
  }

  private buildCampfire(): void {
    this.fitToHero(this.prop('castle_brazier', FIRE.x, FIRE.y));
    this.add.image(FIRE.x, FIRE.y, TEXTURES.shadow).setScale(1.3, 0.8).setDepth(FIRE.y - 3);
    this.colliders.add(FIRE.x, FIRE.y, 10);
    this.fireGlow = this.add.image(FIRE.x, FIRE.y - 18, TEXTURES.glow).setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(7).setAlpha(0.42).setDepth(DEPTH.fx - 30);
    this.interactables.push({
      x: FIRE.x, y: FIRE.y + 6, radius: 34, promptY: 36,
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
    this.petShadow = this.add.image(380, 262, TEXTURES.shadow).setScale(0.6, 0.5);
    this.pet = this.add.sprite(380, 262, 'cat_sit', '0').setOrigin(0.5, 15 / 16).play('cat_sit');
  }

  // ---------------- постройки ----------------
  private buildPlot(id: BuildingId): void {
    const cfg = BUILDINGS[id];
    const sprite = this.prop(`castle_${id}`, cfg.x, cfg.y);
    const plot: Plot = { id, sprite, scale: this.fitToHero(sprite), mark: null, lights: [] };
    this.groundShadow(cfg.x, cfg.y, 1.4);
    this.plots.set(id, plot);
    this.refreshPlot(id, false);
    // коллайдеры по ширине уменьшенной постройки
    for (let dx = -15; dx <= 15; dx += 10) this.colliders.add(cfg.x + dx, cfg.y - 3, 6);
    this.interactables.push({
      x: cfg.x, y: cfg.y + 8, radius: 32, promptY: 44,
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
    plot.sprite.setOrigin(0.5, 1).setScale(plot.scale);
    plot.sprite.setTint(lv === 0 ? 0xb7b9c6 : 0xffffff);
    plot.lights.forEach((l) => l.destroy());
    plot.lights = [];
    const glow = (x: number, y: number, tint: number, scale: number, a: number): void => {
      plot.lights.push(this.add.image(x, y, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(a).setDepth(DEPTH.fx - 20));
    };
    // свет от горна, фонаря, золота и зелья — по точкам на рисунке постройки (лист 44x32)
    if (id === 'workshop' && lv > 0) glow(cfg.x - 15, cfg.y - 18, 0xff8a2a, 1, 0.45);
    if (id === 'hut' && lv >= 2) glow(cfg.x + 17, cfg.y - 16, 0xffd060, 0.8, 0.4);
    if (id === 'storage' && lv > 0) glow(cfg.x, cfg.y - 17, 0xffd76a, 0.9, 0.3);
    if (id === 'garden' && lv > 0) glow(cfg.x - 2, cfg.y - 22, 0x5fe0a4, 0.8, 0.35);
    if (pop) {
      const k = plot.scale;
      this.tweens.add({ targets: plot.sprite, scaleY: { from: k * 1.18, to: k }, scaleX: { from: k * 0.9, to: k }, duration: 380, ease: 'Back.easeOut' });
    }
  }

  private openBuildMenu(id: BuildingId): void {
    const cfg = BUILDINGS[id];
    const lv = session.data.buildings[id];
    const options: ChoiceOption[] = [];
    if (id === 'garden' && lv > 0 && session.data.gardenStage >= 3) {
      options.push({
        label: 'Собрать урожай', desc: `Готовые эликсиры (не больше ${SETTINGS.base.poulticeMax}).`,
        onChoose: () => {
          const gain = session.harvestGarden();
          audio.play('pickup'); this.refreshPlot('garden', true);
          this.ui.message(gain > 0 ? `Эликсиры: +${gain}` : 'Сумка эликсиров полна', 'castle_potion');
        },
      });
    }
    if (lv < 3) {
      const price = cfg.prices[lv]!;
      options.push({
        label: lv === 0 ? 'Обустроить' : `Улучшить до ур. ${lv + 1}`, cost: price, desc: cfg.effects[lv],
        enabled: session.canAfford(price),
        onChoose: () => { this.constructBuilding(id); },
      });
    }
    if (id === 'workshop' && lv >= 1) {
      options.push({
        label: `Сделать эликсир (${session.data.poultice}/${SETTINGS.base.poulticeMax})`, cost: POULTICE_PRICE,
        desc: `Лечит ${SETTINGS.base.poulticeHeal} здоровья. Применяется клавишей Q на арене.`,
        enabled: session.canAfford(POULTICE_PRICE) && session.data.poultice < SETTINGS.base.poulticeMax,
        onChoose: () => {
          if (session.craftPotion()) audio.play('heal');
          this.openBuildMenu(id);
        },
      });
    }
    options.push({ label: 'Закрыть', onChoose: () => undefined });
    const lines = [cfg.description, `Ваш кошелёк: ${session.data.coins} монет`];
    if (lv > 0) lines.push(`Уровень ${lv}: ${cfg.effects[lv - 1]}`);
    if (id === 'workshop') lines.push(`Оружие: ${WEAPON_NAMES[lv]} (урон ${session.damage})`);
    if (id === 'garden' && lv > 0) lines.push(`Рост: ${session.data.gardenStage}/3`);
    this.ui.openChoice({ title: `${cfg.name}${lv ? ` · ур. ${lv}` : ''}`, lines, options, width: 350 });
  }

  private constructBuilding(id: BuildingId): void {
    if (!session.upgrade(id)) return;
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
        this.fx.dust(cfg.x + Phaser.Math.Between(-10, 10), cfg.y - 4);
        this.fx.burst({ x: cfg.x + Phaser.Math.Between(-8, 8), y: cfg.y - 10, count: 6, speed: [20, 60], angle: [-Math.PI, 0], life: [0.2, 0.5], size: [1, 3], tints: [0xffeaa0, 0xc58f58, 0xffffff], gravity: 200, depth: cfg.y + 10 });
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
    this.ui.openChoice({
      title: 'Испытания ордена',
      lines: [`Оружие: ${WEAPON_NAMES[session.weaponLevel]} · урон ${session.damage}`, `Монет за врага: +${session.killBonus} · эликсиров: ${session.data.poultice}`],
      options, width: 330,
    });
  }

  private startExpedition(location: LocationId): void {
    session.clearRun();
    audio.play('portal');
    this.goTo(SCENES.expedition, { location });
  }

  private showReport(r: Report): void {
    const lines: string[] = [];
    lines.push(`Побеждено врагов: ${r.kills}.`);
    lines.push(`Заработано монет: ${r.coins}. Они уже в кошельке.`);
    if (r.cleared) lines.push('Арена пройдена! Прогресс сохранён.');
    if (r.king) lines.push('Король Бездны повержен!');
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
      this.fx.burst({ x: FIRE.x + Phaser.Math.Between(-3, 3), y: FIRE.y - 26, count: 1, speed: [5, 18], angle: [-Math.PI * 0.65, -Math.PI * 0.35], life: [1, 2], size: [1, 2], tints: [0xffc24a, 0xf58a2a, 0xffeaa0], gravity: -12, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    }
    this.smokeT -= dt;
    const wl = session.data.buildings.workshop;
    if (this.smokeT <= 0 && wl >= 2) {
      this.smokeT = 0.35;
      const c = BUILDINGS.workshop;
      this.fx.burst({ x: c.x - 15, y: c.y - 33, count: 1, speed: [4, 10], angle: [-Math.PI * 0.6, -Math.PI * 0.4], life: [1.2, 2.2], size: [3, 5], tints: [0x8a8498, 0xb8b0c0], gravity: -10, depth: DEPTH.fx - 8 });
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
      this.petT = Phaser.Math.FloatBetween(1.5, 4);
      const sit = Math.random() < CAT.sitChance;
      this.petTarget = sit ? { x: this.pet.x, y: this.pet.y }
        : { x: Phaser.Math.Between(CAT.area.x0, CAT.area.x1), y: Phaser.Math.Between(CAT.area.y0, CAT.area.y1) };
      if (sit && Math.random() < 0.4) this.fx.floatText(this.pet.x, this.pet.y - 16, '♥', 0xff8aa8);
    }
    const dx = this.petTarget.x - this.pet.x, dy = this.petTarget.y - this.pet.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      // упёрся в постройку или колонну — сразу выбирает новую цель
      if (this.move(this.pet, (dx / d) * CAT.speed * dt, (dy / d) * CAT.speed * dt, CAT.radius)) this.petT = 0;
      this.pet.play('cat_run', true).setFlipX(dx > 0);
    } else this.pet.play('cat_sit', true);
    this.pet.setDepth(this.pet.y);
    this.petShadow.setPosition(this.pet.x, this.pet.y + 1).setDepth(this.pet.y - 0.5);
  }

  /** Золотой «!» над постройкой, которую уже можно построить или улучшить. */
  private updateMarks(): void {
    for (const id of BUILDING_IDS) {
      const plot = this.plots.get(id)!;
      const lv = session.data.buildings[id];
      const ready = (lv < 3 && session.canAfford(BUILDINGS[id].prices[lv]!)) || (id === 'garden' && lv > 0 && session.data.gardenStage >= 3);
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
