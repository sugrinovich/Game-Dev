import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { BUILDINGS, POULTICE_PRICE, ROOMS, WEAPON_NAMES, type RoomId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { addCastleAmbience, addCastleFront, addCastleGround, CASTLE_BOUNDS, paintCastleGround, ROOM_SIZE, roomGroundKey } from '../systems/CastleArt';
import { MapBounds } from '../systems/MapBounds';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText } from '../ui/PText';
import { WorldScene } from './WorldScene';
import type { ChoiceOption } from './UIScene';

const MAP_W = ROOM_SIZE.w;
const MAP_H = ROOM_SIZE.h;
/** Проём в передней стене посередине — выход в тронный зал; герой входит здесь. */
const DOOR = { x: MAP_W / 2, y: MAP_H - CASTLE_BOUNDS.bottom - 6 } as const;
const SPAWN = { x: MAP_W / 2, y: MAP_H - 64 } as const;
/** Кузня: лавовая печь посередине, гном у наковальни, витрины с оружием и доспехами. */
const SMITHY = { furnace: { x: MAP_W / 2, y: 108 }, smith: { x: 156, y: 188 }, rack: { x: 96, y: 114 }, armor: [{ x: 376, y: 116 }, { x: 410, y: 116 }] } as const;
/** Целебница: ведьма у котла посередине, полки с колбами вдоль задней стены. */
const APOTHECARY = { witch: { x: MAP_W / 2, y: 182 }, shelves: [{ x: 110, y: 112 }, { x: 370, y: 112 }] } as const;
/** Как часто из устья печи летят искры (с). */
const FORGE_SPARKS_EVERY = 0.25;

/** Комната тронного зала: кузня или целебница. Выход — проём в передней стене. */
export class RoomScene extends WorldScene {
  private room: RoomId = 'smithy';
  private sparkT = 0;
  private mark: { x: number; y: number; ready: () => boolean; text: PText | null } | null = null;
  private markT = 0;

  constructor() { super({ key: SCENES.room }); }

  init(data: { room?: RoomId }): void {
    this.room = data.room && session.data.rooms[data.room] ? data.room : 'smithy';
  }

  create(): void {
    this.mark = null;
    const key = roomGroundKey(this.room);
    const map = new MapBounds(MAP_W, MAP_H, CASTLE_BOUNDS);
    paintCastleGround(this, key, MAP_W, MAP_H, this.room);
    addCastleGround(this, key, MAP_W);
    this.initWorld(map, 'base');
    addCastleAmbience(this, MAP_W, this.room);
    addCastleFront(this, this.colliders, MAP_W, MAP_H, this.room, DOOR.x);   // ближняя стена с проёмом в зал
    if (this.room === 'smithy') this.buildSmithy();
    else this.buildApothecary();
    this.interactables.push({ x: DOOR.x, y: DOOR.y, radius: 26, promptY: 30, label: () => 'Выйти в тронный зал', use: () => this.goTo(SCENES.base, { from: this.room }) });
    this.add.image(DOOR.x, MAP_H - 30, TEXTURES.glow).setTint(0xffc070).setBlendMode(Phaser.BlendModes.ADD).setScale(2, 1).setAlpha(0.18).setDepth(DEPTH.fx - 25);

    this.createPlayer(SPAWN.x, SPAWN.y);
    this.player.setDepth(SPAWN.y);
    audio.music('calm');
    this.whenUi(() => {
      this.ui.setObjective(`${ROOMS[this.room].name} · выход внизу`);
      this.ui.banner(ROOMS[this.room].name, COLORS.blade, 1.6);
    });
  }

  /** Тёплое (или холодное) мерцающее пятно света. */
  private light(x: number, y: number, tint: number, scale: number, alpha: number): void {
    const glow = this.add.image(x, y, TEXTURES.glow).setTint(tint).setScale(scale).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 20);
    this.tweens.add({ targets: glow, alpha: alpha * 0.65, duration: Phaser.Math.Between(500, 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Предмет у стены и круги-препятствия вокруг его основания. */
  private furniture(key: string, x: number, y: number, blockers: readonly (readonly [number, number, number])[]): Phaser.GameObjects.Sprite {
    const s = this.prop(key, x, y);
    for (const [dx, dy, r] of blockers) this.colliders.add(x + dx, y + dy, r);
    return s;
  }

  // ---------------- кузня ----------------
  private buildSmithy(): void {
    const S = SMITHY;
    this.furniture('room_furnace', S.furnace.x, S.furnace.y, [[-36, -4, 12], [-18, -4, 12], [0, -4, 12], [18, -4, 12], [36, -4, 12], [-54, -2, 8], [51, 0, 8]]);
    this.light(S.furnace.x, S.furnace.y - 16, 0xff7a2a, 5.2, 0.42);
    this.furniture('npc_smith', S.smith.x, S.smith.y, [[0, -2, 7], [19, -1, 6]]);
    this.light(S.smith.x + 19, S.smith.y - 12, 0xffa040, 1.4, 0.35);
    this.furniture('room_weapons', S.rack.x, S.rack.y, [[-14, -2, 7], [0, -2, 7], [14, -2, 7]]);
    for (const a of S.armor) this.furniture('room_armor', a.x, a.y, [[0, -2, 6]]);
    this.interactables.push({ x: S.smith.x + 8, y: S.smith.y + 10, radius: 32, promptY: 50, label: () => 'Гном-кузнец · перековать оружие', use: () => this.openSmith() });
    this.mark = { x: S.smith.x, y: S.smith.y - 40, ready: () => this.canUpgrade('workshop'), text: null };
  }

  private canUpgrade(id: 'workshop' | 'garden'): boolean {
    const lv = session.data.buildings[id];
    return lv < 3 && session.canAfford(BUILDINGS[id].prices[lv]!);
  }

  private openSmith(): void {
    const lv = session.data.buildings.workshop, cfg = BUILDINGS.workshop;
    const options: ChoiceOption[] = [];
    if (lv < 3) {
      options.push({
        label: `Перековать: ${WEAPON_NAMES[lv + 1]}`, cost: cfg.prices[lv], desc: cfg.effects[lv],
        enabled: this.canUpgrade('workshop'), onChoose: () => { this.forge(); },
      });
    }
    options.push({ label: 'Уйти', onChoose: () => undefined });
    this.ui.openChoice({
      title: 'Гном-кузнец',
      lines: [lv < 3 ? '«Принёс монеты? Тогда раздувай мехи!»' : '«Лучше этого клинка уже не выковать.»', `Оружие: ${WEAPON_NAMES[lv]} · урон ${session.damage}`, `Кошелёк: ${session.data.coins} монет`],
      options, width: 330,
    });
  }

  private forge(): void {
    if (!session.upgrade('workshop')) return;
    const { x, y } = SMITHY.smith;
    audio.play('build');
    this.shake(0.004, 160);
    this.fx.burst({ x: x + 19, y: y - 14, count: 30, speed: [30, 110], angle: [-Math.PI, 0], life: [0.4, 0.9], size: [1, 3], tints: [0xfff0a0, 0xffc060, 0xff8a2a], gravity: 120, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    this.ui.banner(`Выковано: ${WEAPON_NAMES[session.data.buildings.workshop]}`, COLORS.blade, 2.4);
    this.openSmith();
  }

  // ---------------- целебница ----------------
  private buildApothecary(): void {
    const A = APOTHECARY;
    for (const s of A.shelves) this.furniture('room_shelves', s.x, s.y, [[-14, -2, 7], [0, -2, 7], [14, -2, 7]]);
    this.furniture('npc_witch', A.witch.x, A.witch.y, [[-6, -2, 6], [7, 0, 8]]);
    this.light(A.witch.x + 7, A.witch.y - 10, 0x5ae07a, 2.2, 0.3);
    this.interactables.push({ x: A.witch.x + 4, y: A.witch.y + 12, radius: 34, promptY: 50, label: () => 'Ведьма · зелья и травы', use: () => this.openWitch() });
    this.mark = { x: A.witch.x - 6, y: A.witch.y - 48, ready: () => session.data.buildings.garden > 0 && session.data.gardenStage >= 3, text: null };
  }

  private openWitch(): void {
    const lv = session.data.buildings.garden, cfg = BUILDINGS.garden, max = SETTINGS.base.poulticeMax;
    const options: ChoiceOption[] = [{
      label: `Сварить эликсир (${session.data.poultice}/${max})`, cost: POULTICE_PRICE,
      desc: `Лечит ${SETTINGS.base.poulticeHeal} здоровья. Пить на арене — клавиша Q.`,
      enabled: session.canAfford(POULTICE_PRICE) && session.data.poultice < max,
      onChoose: () => { if (session.craftPotion()) { audio.play('heal'); this.brewFx(); } this.openWitch(); },
    }];
    if (lv > 0 && session.data.gardenStage >= 3) {
      options.push({
        label: 'Забрать зелья из трав', desc: `Готовые эликсиры (не больше ${max}).`,
        onChoose: () => {
          const gain = session.harvestGarden();
          audio.play('pickup');
          this.ui.message(gain > 0 ? `Эликсиры: +${gain}` : 'Сумка эликсиров полна', 'castle_potion');
          this.openWitch();
        },
      });
    }
    if (lv < 3) {
      options.push({
        label: lv === 0 ? 'Посадить травы' : `Больше трав: ур. ${lv + 1}`, cost: cfg.prices[lv], desc: `${cfg.effects[lv]} Травы растут после каждой вылазки.`,
        enabled: this.canUpgrade('garden'), onChoose: () => { if (session.upgrade('garden')) { audio.play('build'); this.brewFx(); } this.openWitch(); },
      });
    }
    options.push({ label: 'Уйти', onChoose: () => undefined });
    const growth = lv > 0 ? ` · травы: ${session.data.gardenStage}/3` : '';
    this.ui.openChoice({
      title: 'Ведьма',
      lines: ['«Зелья, травы и немного тьмы…»', `Эликсиров: ${session.data.poultice}/${max}${growth}`, `Кошелёк: ${session.data.coins} монет`],
      options, width: 340,
    });
  }

  /** Котёл вспыхивает зелёными искрами. */
  private brewFx(): void {
    const { x, y } = APOTHECARY.witch;
    this.fx.burst({ x: x + 7, y: y - 10, count: 24, speed: [20, 70], angle: [-Math.PI, 0], life: [0.5, 1], size: [1, 3], tints: [0x9cffb0, 0x5ae07a, 0xffffff], gravity: -20, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
  }

  goMenu(): void {
    session.save();
    this.scene.stop(SCENES.ui);
    this.goTo(SCENES.menu);
  }

  // ---------------- каждый кадр ----------------
  protected tick(dt: number): void {
    if (this.room === 'smithy' && (this.sparkT -= dt) <= 0) {
      this.sparkT = FORGE_SPARKS_EVERY;
      const { x, y } = SMITHY.furnace;
      this.fx.burst({ x: x + Phaser.Math.Between(-11, 11), y: y - 18, count: 1, speed: [10, 30], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [0.8, 1.6], size: [1, 2], tints: [0xffc04a, 0xff8a2a, 0xfff0a0], gravity: -10, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    }
    this.markT -= dt;
    if (this.markT <= 0) { this.markT = 0.6; this.updateMark(); }
    if (this.player.potionPressed()) this.ui.message('Эликсиры пригодятся на арене');
  }

  /** Золотой «!» над кузнецом или ведьмой, когда можно перековать оружие или забрать зелья. */
  private updateMark(): void {
    const m = this.mark;
    if (!m) return;
    const ready = m.ready();
    if (ready && !m.text) {
      m.text = new PText(this, m.x, m.y, '!', { font: 'big', ax: 0.5, ay: 1, color: COLORS.gold }).setDepth(DEPTH.fx);
      this.tweens.add({ targets: m.text, y: m.y - 4, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!ready && m.text) {
      this.tweens.killTweensOf(m.text);
      m.text.destroy();
      m.text = null;
    }
  }
}
