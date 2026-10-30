import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { CHEST, LOCATIONS, ROOM_IDS, ROOMS, type LocationId, type RoomId } from '../configs/items';
import { AbyssSmoke } from '../systems/AbyssSmoke';
import { audio } from '../systems/Sfx';
import { SETTINGS } from '../configs/settings';
import { PText } from '../ui/PText';
import { addCastleAmbience, addCastleFront, addCastleGround, HALL_DOOR_X, HALL_FIRE, HALL_GROUND_KEY, HALL_SIZE, paintCastleGround, ROOM_BOUNDS, WALL_BANNER } from '../systems/CastleArt';
import { textureResolution } from '../systems/CastleModels';
import { MapBounds } from '../systems/MapBounds';
import { session, type Report } from '../state/Session';
import { formatTime, type ExpeditionMode } from './ExpeditionScene';
import { WorldScene } from './WorldScene';
import type { ChoiceOption } from './UIScene';

const MAP_W = HALL_SIZE.w;
const MAP_H = HALL_SIZE.h;
/** Линия задней стены: проёмы дверей вырезаны в ней (CastleArt.ts), створки стоят в нишах на этой линии. */
const WALL_Y = ROOM_BOUNDS.top;
const THRONE = { x: MAP_W / 2, y: 104 } as const;
/** Двери комнат в задней стене (x — середина порога): слева от трона — целебница, справа — кузня. */
const DOORS: Record<RoomId, number> = { apothecary: HALL_DOOR_X[0], smithy: HALL_DOOR_X[1] };
/** Колоннада и флаги вокруг чёрного костра, торговец у нижней левой колонны, знамёна на задней стене. */
const PILLARS = [[236, 176], [404, 176], [236, 338], [404, 338]] as const;
/** Флаги — на линии колонн, ровно посередине между верхней и нижней колонной. */
const STANDARD_Y = (PILLARS[0][1] + PILLARS[2][1]) / 2;
const STANDARDS = [[PILLARS[0][0], STANDARD_Y], [PILLARS[1][0], STANDARD_Y]] as const;
const MERCHANT = { x: 178, y: 348 } as const;
const BANNERS = [110, 262, 378, 530] as const;
/** Сундук-хранилище у левой стены и манекены с доспехами вдоль стен. */
const CHEST_SPOT = { x: 88, y: 146 } as const;
const MANNEQUINS = [[84, 238], [556, 238]] as const;
/** Чёрный костёр: молнии бьют раз в every секунд (случайно в пределах), длина молнии (пиксели), как часто летят искры (с). */
const RIFT = { bolt: { every: [1.4, 3.2], reach: [70, 110], ms: 130 }, sparkEvery: 0.15 } as const;
/** Где появляется герой (на сколько пикселей ниже трона, двери или костра). */
const SPAWN_GAP = { throne: 46, door: 26, fire: 62 } as const;
/** Вкладки разлома: режимы. */
const RIFT_TABS = ['Сюжет', 'Рейтинг'] as const;
/** Искры у трона после отдыха — когда экран уже светлеет (мс от начала отдыха). */
const REST_FX_DELAY = 3900;
/** Котик в зале: бегает к случайным точкам пола, иногда садится отдохнуть. Скорость — пиксели в секунду. */
const CAT = { speed: 70, radius: 4, sitChance: 0.35, area: { x0: 60, x1: 580, y0: 140, y1: 420 } } as const;

/** Золотой «!» над тем, что уже можно открыть или улучшить. */
interface ReadyMark { x: number; y: number; ready: () => boolean; text: PText | null }

/** Тронный зал — хаб замка: трон павшего короля (сохранение и характеристики), двери комнат, сундук, торговец, чёрный костёр к аренам. */
export class BaseScene extends WorldScene {
  private leaves = new Map<RoomId, Phaser.GameObjects.Sprite>();
  private chestSprite: Phaser.GameObjects.Sprite | null = null;
  private marks: ReadyMark[] = [];
  private smoke!: AbyssSmoke;
  private riftGlow!: Phaser.GameObjects.Image;
  private boltIn = 2;
  private sparkT = 0;
  private flies: { img: Phaser.GameObjects.Image; a: number; b: number; r: number; x: number; y: number }[] = [];
  private pet!: Phaser.GameObjects.Sprite;
  private petShadow!: Phaser.GameObjects.Image;
  private petTarget = { x: 380, y: 300 };
  private petT = 0;
  private markT = 0;
  private arrived: Report | null = null;
  private intro = false;
  private from: RoomId | null = null;

  constructor() { super({ key: SCENES.base }); }

  init(data: { intro?: boolean; arrival?: boolean; from?: RoomId }): void {
    this.arrived = data.arrival ? session.lastReport : null;
    this.intro = !!data.intro;
    this.from = data.from && ROOM_IDS.includes(data.from) ? data.from : null;
  }

  create(): void {
    this.leaves.clear();
    this.marks = [];
    this.flies = [];
    const map = new MapBounds(MAP_W, MAP_H, ROOM_BOUNDS);   // в зале есть боковые стены
    paintCastleGround(this, HALL_GROUND_KEY, MAP_W, MAP_H, 'hall');
    addCastleGround(this, HALL_GROUND_KEY, MAP_W);
    this.initWorld(map, 'base');
    addCastleAmbience(this, MAP_W, 'hall');
    addCastleFront(this, this.colliders, MAP_W, MAP_H, 'hall', null);   // ближняя стена — поверх героя

    this.buildThrone();
    for (const id of ROOM_IDS) this.buildDoor(id);
    this.buildRiftFire();
    this.buildHall();
    this.buildChest();
    this.buildPet();

    // тёплый вечер: лёгкая синева поверх всего мира + светляки
    this.add.rectangle(0, 0, MAP_W, MAP_H, 0x182334, 0.06).setOrigin(0, 0).setDepth(DEPTH.overlay - 5);
    for (let i = 0; i < 8; i++) {
      const img = this.add.image(0, 0, TEXTURES.glow).setTint(0xe6c992).setBlendMode(Phaser.BlendModes.ADD).setScale(0.16).setDepth(DEPTH.fx - 10);
      this.flies.push({ img, a: Math.random() * 6, b: Math.random() * 6, r: Phaser.Math.Between(8, 26), x: Phaser.Math.Between(60, MAP_W - 60), y: Phaser.Math.Between(130, MAP_H - 70) });
    }

    const spawn = this.spawnPoint();
    this.createPlayer(spawn.x, spawn.y);
    this.player.setDepth(spawn.y);
    audio.music('calm');
    this.whenUi(() => this.ui.showTip('controls'));

    this.time.delayedCall(550, () => {
      if (this.arrived) this.showReport(this.arrived);
      else if (this.intro) this.ui.banner('Тронный зал', COLORS.blade, 3);
    });
  }

  /** У трона (новая игра, «Продолжить»), у костра (после арены) или у двери комнаты, из которой вышли. */
  private spawnPoint(): { x: number; y: number } {
    if (this.arrived) return { x: HALL_FIRE.x, y: HALL_FIRE.y + SPAWN_GAP.fire };
    if (this.from) return { x: DOORS[this.from], y: WALL_Y + SPAWN_GAP.door };
    return { x: THRONE.x, y: THRONE.y + SPAWN_GAP.throne };
  }

  /** Мерцающее пятно света (жаровня, отсвет из двери, костёр). */
  private light(x: number, y: number, tint: number, scale: number, alpha: number): Phaser.GameObjects.Image {
    const glow = this.add.image(x, y, TEXTURES.glow).setTint(tint).setScale(scale).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 20);
    this.tweens.add({ targets: glow, alpha: alpha * 0.65, duration: Phaser.Math.Between(500, 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return glow;
  }

  // ---------------- трон ----------------
  private buildThrone(): void {
    this.prop('hall_throne', THRONE.x, THRONE.y);
    for (let x = THRONE.x - 33; x <= THRONE.x + 33; x += 11) this.colliders.add(x, THRONE.y, 8);
    for (const dx of [-54, 54]) {
      const x = THRONE.x + dx, y = THRONE.y + 14;
      this.fitToHero(this.prop('castle_brazier', x, y));
      this.groundShadow(x, y, 0.9, 0.7);
      this.colliders.add(x, y - 3, 6);
      this.light(x, y - 24, 0xffae58, 2.6, 0.28);
    }
    this.interactables.push({ x: THRONE.x, y: THRONE.y + 18, radius: 40, promptY: 70, label: () => 'Трон павшего короля', use: () => this.openThrone() });
  }

  private openThrone(): void {
    this.ui.openChoice({
      title: 'Трон павшего короля',
      lines: ['Король давно мёртв. Замок держится на вас.', `Здоровье ${session.hp}/${session.maxHp} · кошелёк: ${session.data.coins} монет`],
      options: [
        { label: 'Отдохнуть и сохранить', desc: 'Здоровье и эликсир восполнятся, игра сохранится.', onChoose: () => { this.rest(); } },
        { label: 'Закрыть', onChoose: () => undefined },
      ],
      width: 320,
    });
  }

  /**
   * Отдых у трона (из меню трона или отказ шагнуть в разлом раненым): экран гаснет с надписью «Отдых у трона»,
   * в темноте — здоровье и эликсир, сохранение и герой перед троном; когда свет вернётся — искры у трона.
   */
  private rest(): void {
    audio.play('rest');
    this.ui.restScreen('Отдых у трона', () => {
      session.rest();
      this.placePlayer(THRONE.x, THRONE.y + SPAWN_GAP.throne);
    });
    this.time.delayedCall(REST_FX_DELAY, () => this.restFx());
  }

  private restFx(): void {
    this.fx.burst({ x: THRONE.x, y: THRONE.y - 30, count: 18, speed: [10, 50], angle: [-Math.PI, 0], life: [0.6, 1.2], size: [2, 3], tints: [0xffc24a, 0xffeaa0, 0x9be06a], gravity: -20, depth: DEPTH.fx });
    this.ui.message('Вы отдохнули. Игра сохранена');
  }

  // ---------------- двери комнат ----------------
  /** Дверь в задней стене: проём вырезан в стене, в нише — створки (заперта или распахнута); название — на полу у порога. */
  private buildDoor(id: RoomId): void {
    const x = DOORS[id], cfg = ROOMS[id];
    this.leaves.set(id, this.prop(session.data.rooms[id] ? 'hall_leaf_open' : 'hall_leaf_locked', x, WALL_Y));
    for (const dx of [-21, 21]) this.colliders.add(x + dx, WALL_Y + 4, 4);
    new PText(this, x, WALL_Y + 10, cfg.name, { ax: 0.5, ay: 0, color: COLORS.dim, font: 'world' }).setDepth(DEPTH.decals + 1);
    if (session.data.rooms[id]) this.light(x, WALL_Y - 6, 0xffb060, 1.1, 0.3);
    this.interactables.push({
      x, y: WALL_Y + 12, radius: 24, promptY: 36,
      label: () => (session.data.rooms[id] ? `Войти: ${cfg.name}` : `${cfg.name} · открыть за ${cfg.price}`),
      use: () => this.useDoor(id),
    });
    this.marks.push({ x, y: WALL_Y - 48, ready: () => !session.data.rooms[id] && session.canAfford(cfg.price), text: null });
  }

  private useDoor(id: RoomId): void {
    if (session.data.rooms[id]) { this.goTo(SCENES.room, { room: id }); return; }
    const cfg = ROOMS[id];
    this.ui.openChoice({
      title: cfg.name, lines: [cfg.description, `Кошелёк: ${session.data.coins} монет`],
      options: [
        { label: `Открыть за ${cfg.price} монет`, cost: cfg.price, enabled: session.canAfford(cfg.price), onChoose: () => { this.unlockRoom(id); } },
        { label: 'Не сейчас', onChoose: () => undefined },
      ],
      width: 300,
    });
  }

  private unlockRoom(id: RoomId): void {
    if (!session.unlockRoom(id)) return;
    const x = DOORS[id];
    audio.play('build');
    this.leaves.get(id)?.setTexture('hall_leaf_open');
    this.light(x, WALL_Y - 6, 0xffb060, 1.1, 0.3);
    this.fx.poof(x, WALL_Y - 12, 1.4);
    this.fx.burst({ x, y: WALL_Y - 20, count: 24, speed: [30, 100], life: [0.5, 1], size: [2, 3], tints: [0xf2d060, 0xfff0a0, 0xc58f58], gravity: 80, depth: DEPTH.fx });
    this.ui.banner(`Открыто: ${ROOMS[id].name}`, COLORS.blade, 2.4);
  }

  // ---------------- чёрный костёр — к аренам ----------------
  /** Чёрный костёр над разломом посреди зала: лиловое сияние, чёрный дым вверх, искры и молнии; E — выбор арены. */
  private buildRiftFire(): void {
    const { x, y } = HALL_FIRE;
    this.prop('hall_rift_fire', x, y);
    this.colliders.add(x, y - 2, 16);
    this.riftGlow = this.add.image(x, y, TEXTURES.glow).setTint(0x7a2ac0).setBlendMode(Phaser.BlendModes.ADD).setScale(4.4, 2).setAlpha(0.4).setDepth(DEPTH.decals + 2);
    this.tweens.add({ targets: this.riftGlow, alpha: 0.22, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.light(x, y - 22, 0x9a40ff, 3.2, 0.3);
    this.smoke = new AbyssSmoke(this, { x: x - 8, y: y - 16, w: 16, h: 6, driftX: 0, driftY: -48, spread: 18, depth: y + 1, every: 0.12 });
    new PText(this, x, y + 34, 'Разлом · к аренам', { ax: 0.5, ay: 0, color: COLORS.dim, font: 'world' }).setDepth(DEPTH.decals + 1);
    // подойти можно с любой стороны: точка — в самом костре, радиус больше его препятствия
    this.interactables.push({ x, y, radius: 44, promptY: 74, label: () => 'Шагнуть в разлом · арены', use: () => this.enterRift() });
  }

  /** Молния из чёрного пламени: ломаная вверх-вбок, гаснет за доли секунды; разлом вспыхивает. */
  private strikeBolt(): void {
    const { x, y } = HALL_FIRE, g = this.add.graphics().setDepth(DEPTH.fx - 5).setBlendMode(Phaser.BlendModes.ADD);
    const reach = Phaser.Math.Between(RIFT.bolt.reach[0], RIFT.bolt.reach[1]), side = Math.random() < 0.5 ? -1 : 1;
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x, y - 26)];
    for (let i = 1; i <= 9; i++) {
      const k = i / 9;
      pts.push(new Phaser.Math.Vector2(x + side * k * reach * 0.45 + Phaser.Math.Between(-7, 7), y - 26 - k * reach));
    }
    g.lineStyle(3, 0x9a40ff, 0.7).strokePoints(pts);
    g.lineStyle(1, 0xf4e0ff, 1).strokePoints(pts);
    this.tweens.add({ targets: g, alpha: 0, delay: RIFT.bolt.ms * 0.4, duration: RIFT.bolt.ms, onComplete: () => g.destroy() });
    this.riftGlow.setAlpha(0.8);
    this.fx.burst({ x, y: y - 26, count: 8, speed: [20, 60], life: [0.2, 0.5], size: [1, 2], tints: [0xe0b8ff, 0xffffff], blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
  }

  // ---------------- зал: колонны, флаги, торговец, сундук, манекены ----------------
  private buildHall(): void {
    for (const x of BANNERS) { const b = this.prop('castle_banner', x, WALL_BANNER.y); b.setScale(b.scaleX * WALL_BANNER.scale); }
    for (const [x, y] of PILLARS) {
      this.prop('castle_pillar', x, y);
      this.groundShadow(x, y, 1.2);
      this.colliders.add(x, y - 4, 10);
    }
    for (const [x, y] of STANDARDS) {
      this.prop('hall_standard', x, y);
      this.groundShadow(x, y, 0.5, 0.5);
      this.colliders.add(x, y - 2, 5);
    }
    for (const [x, y] of MANNEQUINS) {
      this.prop('hall_armor', x, y);
      this.groundShadow(x, y, 0.6, 0.5);
      this.colliders.add(x, y - 2, 6);
    }
    this.prop('castle_merchant', MERCHANT.x, MERCHANT.y);
    this.groundShadow(MERCHANT.x, MERCHANT.y, 1.6);
    for (const dx of [-10, 2, 14]) this.colliders.add(MERCHANT.x + dx, MERCHANT.y - 2, 7);
    new PText(this, MERCHANT.x, MERCHANT.y + 6, 'ТОРГОВЕЦ', { ax: 0.5, color: COLORS.gold, font: 'world' }).setDepth(DEPTH.prompt - 1);
    this.interactables.push({ x: MERCHANT.x, y: MERCHANT.y + 4, radius: 30, promptY: 40, label: () => 'Торговец · купить предметы', use: () => this.ui.openShop() });
  }

  /** Сундук-хранилище у левой стены: сначала покупается доступ, потом расширяется; внутри — перекладывание вещей из карманов. */
  private buildChest(): void {
    const { x, y } = CHEST_SPOT;
    this.chestSprite = this.prop(session.chestUnlocked ? 'room_chest_open' : 'room_chest_locked', x, y);
    this.groundShadow(x, y, 1.3, 0.7);
    for (const dx of [-8, 8]) this.colliders.add(x + dx, y - 2, 8);
    this.interactables.push({
      x, y: y + 12, radius: 24, promptY: 34,
      label: () => (session.chestUnlocked ? `Сундук · ${session.data.chest.length}/${session.chestCapacity}` : `Сундук · открыть за ${CHEST.price}`),
      use: () => this.openChestMenu(),
    });
  }

  private openChestMenu(): void {
    const price = session.chestNextPrice, lv = session.data.chestLevel;
    if (!session.chestUnlocked) {
      this.ui.openChoice({
        title: 'Сундук', width: 300,
        lines: ['Хранилище для любых вещей: сюда перекладывают их из карманов.', `Кошелёк: ${session.data.coins} монет`],
        options: [
          { label: `Купить сундук · ${CHEST.perLevel} мест`, cost: CHEST.price, enabled: session.canAfford(CHEST.price), onChoose: () => { this.upgradeChest(); } },
          { label: 'Не сейчас', onChoose: () => undefined },
        ],
      });
      return;
    }
    this.ui.openChoice({
      title: `Сундук · ур. ${lv}`, width: 300,
      lines: [`Занято: ${session.data.chest.length}/${session.chestCapacity} · карманы: ${session.pocketItems.length}`, `Кошелёк: ${session.data.coins} монет`],
      options: [
        { label: 'Открыть сундук', onChoose: () => this.ui.openChest() },
        price === null
          ? { label: `Вместимость ${session.chestCapacity} (макс.)`, enabled: false, onChoose: () => undefined }
          : { label: `Расширить до ${session.chestCapacity + CHEST.perLevel} мест`, cost: price, enabled: session.canAfford(price), onChoose: () => { this.upgradeChest(); } },
        { label: 'Закрыть', onChoose: () => undefined },
      ],
    });
  }

  private upgradeChest(): void {
    const first = !session.chestUnlocked;
    if (!session.upgradeChest()) return;
    audio.play('build');
    this.chestSprite?.setTexture('room_chest_open');
    const { x, y } = CHEST_SPOT;
    this.fx.burst({ x, y: y - 14, count: 20, speed: [30, 90], life: [0.5, 1], size: [2, 3], tints: [0xf2d060, 0xfff0a0, 0xc58f58], gravity: 80, depth: DEPTH.fx });
    this.ui.banner(first ? 'Сундук открыт' : `Сундук: ${session.chestCapacity} мест`, COLORS.blade, 2);
    this.openChestMenu();
  }

  private buildPet(): void {
    this.petShadow = this.add.image(380, 300, TEXTURES.shadow).setScale(0.6, 0.5);
    this.pet = this.add.sprite(380, 300, 'cat_sit', '0').setOrigin(0.5, 15 / 16).play('cat_sit');
    this.pet.setScale(1 / textureResolution(this.pet.texture));
  }

  // ---------------- вылазка ----------------
  /**
   * Разлом — как лавка: вкладки «Сюжет» и «Рейтинг» сверху (при открытии — «Сюжет»), под ними — что выбрать;
   * внизу красная кнопка «Остаться в замке».
   */
  private openExpeditionBoard(tab = 0): void {
    const story = this.storyOptions(), rating = this.ratingOptions();
    this.ui.openChoice({
      title: 'Разлом Бездны', width: 360,
      tabs: { labels: RIFT_TABS, active: tab, onSelect: (i) => this.openExpeditionBoard(i) },
      lines: tab === 0
        ? [`Урон: ${session.damage} · здоровье: ${session.hp}/${session.maxHp} · эликсиров: ${session.data.poultice}/${SETTINGS.base.poulticeMax}`]
        : [session.data.ratingBest ? `Рекорд: ${formatTime(session.data.ratingBest)}` : 'Рекорда пока нет.'],
      options: tab === 0 ? story : rating,
      sizeLike: story.length >= rating.length ? story : rating,
      closeButton: 'Остаться в замке',
    });
  }

  /** «Сюжет»: арены по очереди — следующая открывается после победы над боссом предыдущей. */
  private storyOptions(): ChoiceOption[] {
    return LOCATIONS.map((loc) => {
      const unlocked = session.isUnlocked(loc.id);
      return {
        label: `${loc.level}. ${loc.name}${session.data.cleared.includes(loc.id) ? ' · пройдено' : unlocked ? '' : ' · закрыто'}`,
        desc: unlocked ? `${loc.description} Награда: ${loc.reward} монет.` : 'Победите всех врагов и босса предыдущей арены.',
        enabled: unlocked,
        onChoose: () => { this.startExpedition({ location: loc.id }); },
      };
    });
  }

  /** «Рейтинг»: бой на время в центре арены; открыт после первой пройденной арены. */
  private ratingOptions(): ChoiceOption[] {
    const open = session.ratingMobs.length > 0;
    return [{
      label: open ? 'Начать бой на время' : 'Бой на время · закрыто', enabled: open,
      desc: open ? 'Вы в центре арены, волны без конца — враги из пройденных арен сюжета.' : 'Откроется, когда пройдёте первую арену сюжета.',
      onChoose: () => { this.startExpedition({ mode: 'rating' }); },
    }];
  }

  /** Раненым в разлом — сначала вопрос: «Нет» отправляет отдохнуть у трона. */
  private enterRift(): void {
    if (session.hp >= session.maxHp) { this.openExpeditionBoard(); return; }
    this.ui.openChoice({
      title: 'Разлом Бездны', width: 300,
      lines: [`У вас не полное здоровье (${session.hp}/${session.maxHp}).`, 'Вы уверены, что хотите продолжить?'],
      options: [
        { label: 'Да', desc: 'Шагнуть к аренам как есть.', onChoose: () => { this.openExpeditionBoard(); return true; } },
        { label: 'Нет', desc: 'Вы отдохнёте у трона: здоровье и эликсир восполнятся.', onChoose: () => { this.rest(); } },
      ],
    });
  }

  private startExpedition(data: { location?: LocationId; mode?: ExpeditionMode }): void {
    session.clearRun();
    audio.play('portal');
    this.goTo(SCENES.expedition, data);
  }

  private showReport(r: Report): void {
    const lines: string[] = [];
    if (r.rating) lines.push(`Вы продержались: ${formatTime(r.rating.time)}.`, r.rating.record ? 'Новый рекорд!' : `Рекорд: ${formatTime(session.data.ratingBest)}.`);
    lines.push(`Побеждено врагов: ${r.kills}.`);
    lines.push(r.coins > 0 ? `Заработано монет: ${r.coins}. Они уже в кошельке.` : 'Увы, но вы ничего не заработали.');
    if (r.cleared) lines.push('Арена пройдена! Прогресс сохранён.');
    if (r.king) lines.push('Король Бездны повержен!');
    this.ui.openChoice({ title: r.died ? 'Вас принесли в замок' : 'Возвращение в зал', lines, options: [{ label: 'Хорошо', onChoose: () => undefined }], closable: true, width: 310 });
    session.lastReport = null;
  }

  goMenu(): void {
    session.save();
    this.scene.stop(SCENES.ui);
    this.goTo(SCENES.menu);
  }

  // ---------------- каждый кадр ----------------
  protected tick(dt: number): void {
    const now = this.time.now / 1000;
    this.smoke.update(dt);
    this.updateRift(dt);
    for (const f of this.flies) {
      f.a += dt * 0.7; f.b += dt * 0.5;
      f.img.setPosition(f.x + Math.sin(f.a) * f.r, f.y + Math.cos(f.b) * f.r * 0.6).setAlpha(0.3 + 0.7 * Math.abs(Math.sin(now * 1.6 + f.a)));
    }
    this.updatePet(dt);
    this.markT -= dt;
    if (this.markT <= 0) { this.markT = 0.6; this.updateMarks(); }
    if (this.player.potionPressed()) this.ui.message('Эликсиры пригодятся на арене');
  }

  /** Искры из чёрного пламени и молнии через случайные промежутки. */
  private updateRift(dt: number): void {
    const { x, y } = HALL_FIRE;
    if ((this.sparkT -= dt) <= 0) {
      this.sparkT = RIFT.sparkEvery;
      this.fx.burst({ x: x + Phaser.Math.Between(-8, 8), y: y - 20, count: 1, speed: [10, 30], angle: [-Math.PI * 0.75, -Math.PI * 0.25], life: [0.8, 1.6], size: [1, 2], tints: [0xc080ff, 0x9a40ff, 0xffffff], gravity: -12, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    }
    if ((this.boltIn -= dt) <= 0) {
      this.boltIn = Phaser.Math.FloatBetween(RIFT.bolt.every[0], RIFT.bolt.every[1]);
      this.strikeBolt();
    }
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
      // упёрся в колонну, костёр или трон — сразу выбирает новую цель
      if (this.move(this.pet, (dx / d) * CAT.speed * dt, (dy / d) * CAT.speed * dt, CAT.radius)) this.petT = 0;
      this.pet.play('cat_run', true).setFlipX(dx > 0);
    } else this.pet.play('cat_sit', true);
    this.pet.setDepth(this.pet.y);
    this.petShadow.setPosition(this.pet.x, this.pet.y + 1).setDepth(this.pet.y - 0.5);
  }

  /** Золотой «!» над троном или дверью, когда на улучшение или открытие уже хватает монет. */
  private updateMarks(): void {
    for (const m of this.marks) {
      const ready = m.ready();
      if (ready && !m.text) {
        m.text = new PText(this, m.x, m.y, '!', { font: 'worldBig', ax: 0.5, ay: 1, color: COLORS.gold }).setDepth(DEPTH.fx);
        this.tweens.add({ targets: m.text, y: m.y - 4, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!ready && m.text) {
        this.tweens.killTweensOf(m.text);
        m.text.destroy();
        m.text = null;
      }
    }
  }
}
