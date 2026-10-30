import Phaser from 'phaser';
import { COLORS, DEPTH, GAME, GLINT_EVERY, KEYS, SCENES } from '../configs/game';
import { TEXTURES } from '../configs/assets';
import { EQUIPMENT, EQUIPMENT_IDS, RARITIES, SHOP_DEPARTMENTS, SHOP_ITEMS, type ShopItemId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText, startGlints } from '../ui/PText';
import { addCostRow, BAR_COLORS, buttonTextY, costWidth, drawBar, drawButton, drawPanel, drawPlate, drawRibbon, drawTitleRibbon, UI } from '../ui/Panel';
import { ChestWindow } from '../ui/ChestWindow';
import { InventoryWindow } from '../ui/InventoryWindow';
import { TIP_IDS, TIPS, TutorialCard, type TipId } from '../ui/TutorialCard';
import { addIcon } from '../systems/IconArt';
import type { WorldScene } from './WorldScene';

export interface ChoiceOption {
  label: string;
  icon?: string;
  /** Подложка под иконкой (цвет класса предмета в лавке): заливка и кант. */
  iconTile?: { fill: number; edge: number };
  desc?: string;
  /** Цена в монетах. */
  cost?: number;
  enabled?: boolean;
  /** Вернуть true, чтобы окно осталось открытым (например, переключатель звука). */
  onChoose: () => boolean | void;
}

export interface ChoiceSpec {
  title: string;
  lines?: string[];
  options: ChoiceOption[];
  closable?: boolean;
  width?: number;
  onClose?: () => void;
  /** Вкладки над списком (лавка: «Все», «Оружие»…): active — выбранная, onSelect — переключить (мышью или A / D). */
  tabs?: { labels: readonly string[]; active: number; onSelect: (i: number) => void };
  /** Окно размером как для этого списка (самая полная вкладка): при переключении вкладок оно не прыгает. */
  sizeLike?: readonly ChoiceOption[];
  /** Кнопка внизу окна (например, «Закрыть» в лавке) — отдельно от списка, чтобы не выглядела товаром. */
  closeButton?: string;
  /** Что делает кнопка внизу вместо закрытия окна (например, «Назад» — вернуться к прежнему меню). */
  closeAction?: () => void;
}

interface Toast { kind: string; count: number; text: PText; icon: Phaser.GameObjects.Image | null; timer: number; label: string }
export interface MinimapSpec { key: string; w: number; h: number; worldW: number; worldH: number; markers: () => { x: number; y: number; color: number; blink?: boolean }[] }

const W = GAME.width;
const H = GAME.height;
/** Длительность плавного появления окна. */
const MODAL_FADE_MS = 160;
/** Высота строки в окне выбора; длинные списки (лавка) — плотнее, чтобы окно влезло в экран. */
const MODAL_ROW = { normal: 19, compact: 15, compactAfter: 8 } as const;
/** Высота ленты крупного объявления: поле в 20 строк — у 16 строк букв по 2 сверху и снизу. */
const BANNER_H = 23;
/** Заголовок меню (паузы): только его закрывает клавиша меню. */
const PAUSE_TITLE = 'Меню';
/** Уведомления — поверх окон (например, «В карманах нет места» видно и при открытой лавке). */
const TOAST_DEPTH = DEPTH.overlay + 30;
/** Окно выбора: от верхней кромки до первой строки (под лентой заголовка) и поле снизу. */
const MODAL_SPACE = { top: 24, bottom: 12 } as const;
/**
 * Экран отдыха: насколько темнеет (почти до чёрного), как долго гаснет и светлеет, сколько держится надпись
 * (всего около 4,8 с).
 */
const REST_SCREEN = { dark: 0.94, fadeMs: 900, holdMs: 3000 } as const;
/** Подложка под иконкой товара (цвет класса) — квадрат такой стороны. */
const ICON_TILE = 15;
/** Первая вкладка лавки — все товары. */
const SHOP_ALL = 'Все';
/** Кнопка внизу окна выбора: наименьшая ширина (длинная надпись — шире, с полями padX слева и справа), высота, отступ над ней. */
const MODAL_CLOSE = { w: 84, padX: 12, h: 16, gap: 8 } as const;
/** Вкладки над списком: высота, зазор между вкладками, отступ под ними. */
const MODAL_TABS = { h: 16, gap: 4, below: 8 } as const;
/** Как часто обновлять счётчик FPS (клавиша ` / Ё), секунды. */
const FPS_REFRESH = 0.25;
/**
 * Табличка состояния в левом верхнем углу. Верхний ряд — сердце и полоска здоровья до правого поля,
 * нижний — эликсиры и монеты (с середины таблички).
 * pad — поле от края таблички до содержимого со всех сторон, gap — от иконки до того, что справа, rowGap — между рядами.
 */
const HUD = { x: 2, y: 2, w: 132, pad: 7, gap: 4, rowGap: 4, icon: 16, barH: 8 } as const;
const HUD_ROW1 = HUD.y + HUD.pad, HUD_ROW2 = HUD_ROW1 + HUD.icon + HUD.rowGap;
const HUD_H = HUD_ROW2 + HUD.icon + HUD.pad - HUD.y;
/** Золотые ромбы на концах полоски выступают за неё на столько пикселей. */
const BAR_TIP = 3;
const HP_BAR_X = HUD.x + HUD.pad + HUD.icon + HUD.gap + BAR_TIP;
const HP_BAR = { x: HP_BAR_X, y: HUD_ROW1 + (HUD.icon - HUD.barH) / 2, w: HUD.x + HUD.w - HUD.pad - BAR_TIP - HP_BAR_X } as const;
/** Сдвиг текста относительно иконки 16x16, чтобы цифры стояли по её середине. */
const ICON_TEXT_DY = 3;
/** Сдвиг строки текста, чтобы заглавные (7 пикселей) стояли по середине полоски. */
const BAR_TEXT_DY = (HUD.barH - 7) / 2 - 2;
/** Нижние плашки: рывок слева и кнопка инвентаря справа — одной высоты, с полями. */
/** Плашки внизу (рывок, «Инвентарь»): высота нечётная — у 7 строк букв поровну места сверху и снизу. */
const PLATE = { h: 23, pad: 5, margin: 2 } as const;
const DASH_BAR_W = 50;
/** Зазор между табличкой состояния и лентой цели. */
const RIBBON_GAP = 10;
/** Кнопка паузы в правом верхнем углу (на телефоне — вход в меню): квадрат высотой с нижние плашки, две полоски-знак. */
const PAUSE_BTN = { size: PLATE.h, margin: PLATE.margin, barW: 3, barH: 9, barGap: 3 } as const;
/** Миникарта стоит левее кнопки паузы: от правого края экрана до миникарты. */
const MINIMAP_RIGHT = PAUSE_BTN.margin + PAUSE_BTN.size + 8;

/** Интерфейс поверх игры в рыцарском стиле: табличка состояния, ленты, плашки, окна выбора. */
export class UIScene extends Phaser.Scene {
  private world: WorldScene | null = null;
  private mode: 'base' | 'expedition' = 'base';
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: PText;
  private potionText!: PText;
  private coinText!: PText;
  private dashG!: Phaser.GameObjects.Graphics;
  private toastG!: Phaser.GameObjects.Graphics;
  private heartGlow!: Phaser.GameObjects.Image;
  private dashGlow!: Phaser.GameObjects.Image;
  private objective!: PText;
  private objectivePlate!: Phaser.GameObjects.Graphics;
  private toasts: Toast[] = [];
  private bannerText: Phaser.GameObjects.Container | null = null;
  private bossG!: Phaser.GameObjects.Graphics;
  private bossName!: PText;
  private boss: { name: string; frac: number } | null = null;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private lastHp = 0;
  private hpShown = 0;
  private minimap: MinimapSpec | null = null;
  private miniImg: Phaser.GameObjects.Image | null = null;
  private miniG!: Phaser.GameObjects.Graphics;
  /** Отметки на миникарте — поверх картинки карты. */
  private minimapMarks!: Phaser.GameObjects.Graphics;
  /**
   * Открытое окно выбора: sel — выделенный пункт (−1 — ничего; номер сразу за пунктами — кнопка внизу),
   * hits — где на экране пункты и кнопка; buttonHover — кнопка внизу выделена наведением мыши (а не клавишами).
   */
  private modal: { spec: ChoiceSpec; sel: number; box: Phaser.GameObjects.Container; hits: { i: number; x: number; y: number; w: number; h: number }[]; buttonHover?: boolean } | null = null;
  /** Окно инвентаря-рюкзака или сундука-хранилища (свои, не список). */
  private inventory: InventoryWindow | ChestWindow | null = null;
  /** Обучающая карточка (показывается один раз на каждую подсказку). */
  private tip: TutorialCard | null = null;
  private closedAt = -1000;
  /** Меню открыто через паузу (клавиша, кнопка «II», уход со вкладки): пока оно или окна из него открыты — мир стоит. */
  private pauseMenu = false;
  private paused = false;
  /** Мерцание иконок HUD — замирает вместе с миром. */
  private hudPulses: Phaser.Tweens.Tween[] = [];
  private objectiveText = '';
  private fpsText!: PText;
  private fpsT = 0;
  ready = false;

  constructor() { super({ key: SCENES.ui }); }

  get modalOpen(): boolean { return this.modal !== null || this.inventory !== null || this.tip !== null || this.resting || this.time.now - this.closedAt < 180; }
  /** Идёт экран отдыха — герой стоит, клавиши не действуют. */
  private resting = false;

  /** Отдых: экран почти гаснет, посередине надпись; в темноте — onDark (лечение, перенос героя), потом свет возвращается. */
  restScreen(text: string, onDark: () => void): void {
    if (this.resting) return;
    this.closeModal(false);
    this.resting = true;
    const R = REST_SCREEN, depth = TOAST_DEPTH - 1;
    const shade = this.add.rectangle(0, 0, W, H, 0x05040a, 1).setOrigin(0, 0).setAlpha(0).setDepth(depth);
    const label = new PText(this, W / 2, PText.centerY(H / 2, 'big'), text, { font: 'big', ax: 0.5, color: COLORS.blade }).setAlpha(0).setDepth(depth);
    this.tweens.add({ targets: shade, alpha: R.dark, duration: R.fadeMs, ease: 'Sine.easeIn', onComplete: onDark });
    this.tweens.add({ targets: label, alpha: 1, delay: R.fadeMs / 2, duration: R.fadeMs / 2 });
    this.tweens.add({
      targets: [shade, label], alpha: 0, delay: R.fadeMs + R.holdMs, duration: R.fadeMs, ease: 'Sine.easeOut',
      onComplete: () => { shade.destroy(); label.destroy(); this.resting = false; this.closedAt = this.time.now; },
    });
  }

  create(): void {
    this.toasts = [];
    this.hudPulses = []; this.pauseMenu = false; this.paused = false;
    this.modal = null; this.inventory = null; this.tip = null; this.minimap = null; this.miniImg = null; this.bannerText = null;
    this.cameras.main.setRoundPixels(true).setZoom(GAME.resolution).centerOn(W / 2, H / 2);
    // табличка состояния: здоровье, эликсиры, монеты — рамка рисуется один раз
    drawPanel(this.add.graphics(), HUD.x, HUD.y, HUD.w, HUD_H, { alpha: 0.82, rules: false });
    // мягкие свечения за иконками (под ними): сердце бьётся, эликсир и монеты мерцают
    const left = HUD.x + HUD.pad, top = HUD_ROW1, row2 = HUD_ROW2, coins = HUD.x + HUD.w / 2 + 2;
    this.heartGlow = this.glow(left + 8, top + 8, 0xff3a5a, 0.6);
    this.pulse(this.glow(left + 8, row2 + 8, 0xff5a7a, 0.5), 1400);
    this.pulse(this.glow(coins + 8, row2 + 8, 0xffc040, 0.5), 1900);
    addIcon(this, left, top, 'ui_heart').setOrigin(0, 0);
    this.hpBar = this.add.graphics();
    this.hpText = new PText(this, HP_BAR.x + HP_BAR.w / 2, HP_BAR.y + BAR_TEXT_DY, '', { ax: 0.5, shine: true });
    addIcon(this, left, row2, 'ui_potion').setOrigin(0, 0);
    this.potionText = new PText(this, left + HUD.icon + HUD.gap, row2 + ICON_TEXT_DY, '');
    addIcon(this, coins, row2, 'castle_coin').setOrigin(0, 0);
    this.coinText = new PText(this, coins + HUD.icon + HUD.gap, row2 + ICON_TEXT_DY, '', { color: COLORS.gold, shine: true });
    // рывок: крылатый сапог и полоска внизу слева
    const plateY = H - PLATE.margin - PLATE.h, iconY = plateY + (PLATE.h - HUD.icon) / 2;
    drawPlate(this.add.graphics(), PLATE.margin, plateY, PLATE.pad * 2 + HUD.icon + HUD.gap + BAR_TIP * 2 + DASH_BAR_W, PLATE.h);
    this.dashGlow = this.glow(PLATE.margin + PLATE.pad + HUD.icon / 2, iconY + HUD.icon / 2, 0x5fe0d4, 0.5);
    addIcon(this, PLATE.margin + PLATE.pad, iconY, 'ui_dash').setOrigin(0, 0);
    this.dashG = this.add.graphics();
    // кнопка инвентаря
    // кнопка по ширине надписи, надпись — по центру
    const invPlate = this.add.graphics();
    const invLabel = new PText(this, 0, PText.centerY(plateY + PLATE.h / 2), 'Инвентарь', { ax: 0.5, color: COLORS.gold, shine: true });
    const invW = Math.ceil(invLabel.textWidth) + PLATE.pad * 4, invX = W - PLATE.margin - invW;
    invLabel.setX(invX + invW / 2);
    drawPlate(invPlate, invX, plateY, invW, PLATE.h);
    const inventoryZone = this.add.zone(invX, plateY, invW, PLATE.h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    inventoryZone.on('pointerover', () => invLabel.setColor(COLORS.goldHover));
    inventoryZone.on('pointerout', () => invLabel.setColor(COLORS.gold));
    inventoryZone.on('pointerdown', () => { if (!this.modal && !this.inventory && this.world?.player.alive && !this.world.transitioning) this.openInventory(); });
    this.makePauseButton();
    this.objectivePlate = this.add.graphics();
    this.objective = new PText(this, W / 2, 4, '', { ax: 0.5, color: COLORS.text, shine: true });
    this.toastG = this.add.graphics().setDepth(TOAST_DEPTH);
    this.bossG = this.add.graphics();
    this.bossName = new PText(this, W / 2, H - 64, '', { ax: 0.5, color: COLORS.text });
    this.miniG = this.add.graphics();
    this.fpsText = new PText(this, 4, HUD.y + HUD_H + 3, '', { color: COLORS.good }).setVisible(false);
    this.damageFlash = this.add.rectangle(0, 0, W, H, 0xb02e4c, 0).setOrigin(0, 0).setDepth(-1);

    const kb = this.input.keyboard;
    kb?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.hoverModal(p));
    this.input.once('pointerdown', () => audio.init());
    kb?.once('keydown', () => audio.init());
    const onBlur = (): void => {
      if (this.world && this.mode === 'expedition' && !this.modal) this.openPause();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.world = null; this.ready = false;
      kb?.off('keydown'); this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });
    // искра по надписям HUD — редко, чтобы не отвлекать в бою
    startGlints(this, GLINT_EVERY.hud);
    this.ready = true;
  }

  /** Кнопка паузы: под курсором знак светлеет; нажатие открывает меню (то же, что клавиша меню). */
  private makePauseButton(): void {
    const B = PAUSE_BTN, x = W - B.margin - B.size, y = B.margin, g = this.add.graphics();
    const paint = (hover: boolean): void => {
      g.clear();
      drawPlate(g, x, y, B.size, B.size);
      const bx = x + (B.size - B.barW * 2 - B.barGap) / 2, by = y + (B.size - B.barH) / 2;
      g.fillStyle(hover ? UI.goldLight : UI.gold, 1).fillRect(bx, by, B.barW, B.barH).fillRect(bx + B.barW + B.barGap, by, B.barW, B.barH);
    };
    paint(false);
    const zone = this.add.zone(x, y, B.size, B.size).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => paint(true));
    zone.on('pointerout', () => paint(false));
    zone.on('pointerdown', () => { if (!this.modal && !this.inventory && !this.tip) this.tryOpenPause(); });
  }

  /** Меню открывается, если герой жив и сцена не меняется. */
  private tryOpenPause(): void {
    if (this.world && !this.world.transitioning && this.world.player?.alive) this.openPause();
  }

  /** Мягкое свечение (аддитивное) — ставится под иконку. */
  private glow(x: number, y: number, tint: number, scale: number, alpha = 0.35): Phaser.GameObjects.Image {
    return this.add.image(x, y, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha);
  }

  private pulse(target: Phaser.GameObjects.Image, ms: number): void {
    this.hudPulses.push(this.tweens.add({ targets: target, alpha: target.alpha * 0.4, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  }

  /**
   * Пауза: пока открыто меню (и то, что открыто из него — обучение, подтверждение), сцена мира стоит целиком
   * (герой, враги, огонь, частицы), мерцание HUD тоже. Закрыли — всё продолжается с того же места.
   */
  private syncPause(w: WorldScene): void {
    const want = this.pauseMenu && this.modalOpen;
    if (!want) this.pauseMenu = false;
    if (want === this.paused) return;
    this.paused = want;
    if (want) w.scene.pause(); else w.scene.resume();
    for (const t of this.hudPulses) { if (want) t.pause(); else t.resume(); }
  }

  /** Мир сообщает, какая сцена сейчас под интерфейсом. */
  bind(world: WorldScene, mode: 'base' | 'expedition'): void {
    this.world = world;
    this.mode = mode;
    this.closeModal(false);
    this.inventory?.close();
    this.tip?.destroy(); this.tip = null;
    this.pauseMenu = false; this.paused = false;
    for (const t of this.hudPulses) t.resume();
    this.minimap = null;
    this.miniImg?.destroy(); this.miniImg = null;
    this.minimapMarks?.clear();
    this.boss = null;
    this.objectiveText = '';   // надпись цели сверху — только там, где сцена её задаёт (на аренах)
    for (const t of this.toasts) { t.text.destroy(); t.icon?.destroy(); }
    this.toasts.length = 0;
    this.bannerText?.destroy(); this.bannerText = null;
    this.lastHp = session.hp; this.hpShown = session.hp;
    this.scene.bringToTop();
  }

  setObjective(text: string): void { this.objectiveText = text; }

  setMinimap(spec: MinimapSpec | null): void {
    this.minimap = spec;
    this.miniImg?.destroy(); this.miniImg = null;
    if (spec) this.miniImg = this.add.image(W - MINIMAP_RIGHT - spec.w, 5, spec.key).setOrigin(0, 0).setDisplaySize(spec.w, spec.h);
    this.minimapMarks?.destroy();
    this.minimapMarks = this.add.graphics();
  }

  setBoss(name: string | null, frac = 1): void {
    this.boss = name ? { name, frac } : null;
    if (name) this.bossName.setText(name);
  }

  // ---------------- всплывающие сообщения ----------------
  message(text: string, icon?: string): void { this.toast(`m:${text}`, 0, icon, text); }

  private toast(kind: string, n: number, icon: string | undefined, label: string): void {
    const ex = this.toasts.find((t) => t.kind === kind && t.timer > 0.4);
    if (ex) { ex.count += n; ex.timer = 2.4; ex.text.setText(n ? `+${ex.count} ${ex.label}` : ex.label); return; }
    const t = new PText(this, 24, 0, n ? `+${n} ${label}` : label, { color: COLORS.text }).setDepth(TOAST_DEPTH);
    const img = icon ? addIcon(this, 6, 0, icon, 0.8).setOrigin(0, 0.5).setDepth(TOAST_DEPTH) : null;
    this.toasts.push({ kind, count: n, text: t, icon: img, timer: 2.4, label });
  }

  /** Крупная надпись на алой ленте посреди экрана. */
  banner(text: string, color: number = COLORS.blade, seconds = 2.6): void {
    this.bannerText?.destroy();
    // буквы — посередине видимого поля ленты (между верхним кантом и тёмной полосой снизу)
    const label = new PText(this, 0, PText.centerY(-11 + (BANNER_H - 2) / 2, 'big'), text, { font: 'big', ax: 0.5, color });
    const ribbon = this.add.graphics();
    drawRibbon(ribbon, 0, -11, label.textWidth + 28, BANNER_H);
    const halo = this.add.image(0, 0, TEXTURES.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale((label.textWidth + 40) / 40, 0.9).setAlpha(0.35);
    const b = this.add.container(W / 2, 78, [halo, ribbon, label]).setAlpha(0).setScale(1.4);
    this.bannerText = b;
    this.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: seconds * 1000, duration: 500, onComplete: () => { if (this.bannerText === b) this.bannerText = null; b.destroy(); } });
  }

  // ---------------- обновление HUD ----------------
  override update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const w = this.world;
    if (!w || !w.player) return;
    this.syncPause(w);
    // здоровье
    if (session.hp < this.lastHp) this.damageFlash.setAlpha(0.35);
    this.lastHp = session.hp;
    this.damageFlash.setAlpha(Math.max(0, this.damageFlash.alpha - dt * 1.2));
    this.hpShown += (session.hp - this.hpShown) * Math.min(1, dt * 10);
    this.hpBar.clear();
    drawBar(this.hpBar, HP_BAR.x, HP_BAR.y, HP_BAR.w, HUD.barH, session.hp / session.maxHp, BAR_COLORS.health, this.hpShown / session.maxHp);   // без делений: они чёрными полосками резали цифры
    this.hpText.setText(`${Math.ceil(session.hp)}/${session.maxHp}`);
    // сердце бьётся: при малом здоровье — часто и ярко
    const low = session.hp / session.maxHp < 0.3;
    if (!this.paused) this.heartGlow.setAlpha((low ? 0.35 : 0.22) + (low ? 0.3 : 0.12) * (0.5 + 0.5 * Math.sin(this.time.now / (low ? 90 : 380))));
    this.potionText.setText(`×${session.data.poultice}`).setColor(session.data.poultice > 0 ? COLORS.text : COLORS.dim);
    this.coinText.setText(`${session.data.coins}`);
    // рывок
    const cd = w.player.dashCd / SETTINGS.combat.dashCooldown;
    this.dashG.clear();
    const dashX = PLATE.margin + PLATE.pad + HUD.icon + HUD.gap + BAR_TIP;
    drawBar(this.dashG, dashX, H - PLATE.margin - PLATE.h / 2 - 2, DASH_BAR_W, 4, 1 - cd, cd > 0 ? { ...BAR_COLORS.dash, light: BAR_COLORS.dash.fill } : BAR_COLORS.dash);
    if (!this.paused) this.dashGlow.setAlpha(cd > 0 ? 0.08 : 0.3 + 0.12 * Math.sin(this.time.now / 250));
    // цель: лента по центру экрана, но не заходит на табличку состояния (хвосты ленты — ещё 8 пикселей)
    this.objective.setText(this.objectiveText);
    this.objectivePlate.clear();
    const ribbonW = this.objective.textWidth + 16;
    const ribbonX = Math.round(Math.max(W / 2, HUD.x + HUD.w + RIBBON_GAP + ribbonW / 2));
    this.objective.setX(ribbonX);
    if (this.objectiveText) drawRibbon(this.objectivePlate, ribbonX, 3, ribbonW, 14);
    this.objective.setVisible(!!this.objectiveText);
    // счётчик кадров: зелёный — плавные 60, красный — есть просадки
    if (this.fpsText.visible && (this.fpsT -= dt) <= 0) {
      this.fpsT = FPS_REFRESH;
      const fps = Math.round(this.game.loop.actualFps);
      this.fpsText.setText(`FPS ${fps}`).setColor(fps >= 58 ? COLORS.good : COLORS.bad);
    }
    this.inventory?.update(dt);
    this.tip?.update(dt);
    // всплывашки
    this.toastG.clear();
    this.toasts.forEach((t, i) => {
      t.timer -= dt;
      const y = H - 58 - (this.toasts.length - 1 - i) * 16;
      const a = Math.min(1, t.timer * 2);
      drawPlate(this.toastG, 2, y - 8, t.text.textWidth + 28, 15, 0.8 * a);
      t.text.setPosition(24, y - 6).setAlpha(a);
      t.icon?.setPosition(6, y - 1).setAlpha(a);
    });
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      if (this.toasts[i]!.timer <= 0) { this.toasts[i]!.text.destroy(); this.toasts[i]!.icon?.destroy(); this.toasts.splice(i, 1); }
    }
    // босс
    this.bossG.clear();
    this.bossName.setVisible(!!this.boss);
    if (this.boss) {
      const bw = 220, bx = W / 2 - bw / 2, by = H - 46;
      drawRibbon(this.bossG, W / 2, by - 19, this.bossName.textWidth + 20, 14);
      drawBar(this.bossG, bx, by, bw, 7, this.boss.frac, BAR_COLORS.boss, this.boss.frac, 4);
    }
    // миникарта
    this.miniG.clear();
    if (this.minimap && this.miniImg) {
      const m = this.minimap;
      const x0 = W - MINIMAP_RIGHT - m.w, y0 = 5;
      // железная оправа с золотыми уголками; сама карта — картинка поверх рамки
      this.miniG.fillStyle(UI.ironDark, 1).fillRect(x0 - 3, y0 - 3, m.w + 6, m.h + 6);
      this.miniG.fillStyle(UI.iron, 1).fillRect(x0 - 2, y0 - 2, m.w + 4, m.h + 4);
      this.miniG.fillStyle(UI.gold, 1).fillRect(x0 - 3, y0 - 3, 3, 3).fillRect(x0 + m.w, y0 - 3, 3, 3).fillRect(x0 - 3, y0 + m.h, 3, 3).fillRect(x0 + m.w, y0 + m.h, 3, 3);
      const marks = this.minimapMarks;
      marks.clear();
      for (const mk of m.markers()) {
        if (mk.blink && Math.floor(this.time.now / 350) % 2) continue;
        marks.fillStyle(mk.color, 1).fillRect(Math.round(x0 + mk.x / m.worldW * m.w) - 1, Math.round(y0 + mk.y / m.worldH * m.h) - 1, 3, 3);
      }
      marks.fillStyle(0xffffff, 1).fillRect(Math.round(x0 + w.player.x / m.worldW * m.w) - 1, Math.round(y0 + w.player.y / m.worldH * m.h) - 1, 3, 3);
    }
  }

  // ---------------- клавиши ----------------
  private onKey(ev: KeyboardEvent): void {
    audio.init();
    if (ev.code === 'KeyM') { const m = audio.toggleMute(); this.message(m ? 'Звук выключен' : 'Звук включён'); return; }
    if (ev.code === 'Backquote') { this.fpsText.setVisible(!this.fpsText.visible); this.fpsT = 0; return; }
    if (ev.code === 'KeyF') { if (this.scale.isFullscreen) this.scale.stopFullscreen(); else this.scale.startFullscreen(); return; }
    if (this.tip) { this.tip.onKey(ev); return; }
    if (this.inventory) { this.inventory.onKey(ev); return; }
    const m = this.modal;
    if (m) {
      const n = m.spec.options.length + (m.spec.closeButton ? 1 : 0);   // кнопка внизу — последний шаг выбора
      const from = m.sel < 0 ? (ev.code === KEYS.up.code ? 0 : n - 1) : m.sel;   // ничего не выделено — W с конца, S с начала
      const tabs = m.spec.tabs;
      if (tabs && (ev.code === KEYS.left.code || ev.code === KEYS.right.code)) {
        const k = tabs.labels.length;
        audio.play('select'); tabs.onSelect((tabs.active + (ev.code === KEYS.left.code ? k - 1 : 1)) % k);
      } else if (ev.code === KEYS.up.code) { m.buttonHover = false; this.select((from + n - 1) % n); }
      else if (ev.code === KEYS.down.code) { m.buttonHover = false; this.select((from + 1) % n); }
      else if (ev.code === KEYS.interact.code) { this.choose(m.sel); }
      else if (ev.code === KEYS.menu.code && m.spec.title === PAUSE_TITLE) { this.close(); }   // клавиша меню закрывает только меню; остальные окна — своей кнопкой
      return;
    }
    if (ev.code === KEYS.inventory.code && this.world?.player.alive && !this.world.transitioning) { this.openInventory(); return; }
    if (ev.code === KEYS.menu.code) this.tryOpenPause();
  }

  // ---------------- окна выбора ----------------
  get isModalOpen(): boolean { return this.modal !== null || this.inventory !== null; }

  openChoice(spec: ChoiceSpec): void {
    this.inventory?.close();
    const wasOpen = this.modal !== null;
    this.closeModal(false);
    // сначала ничего не выделено: пункт выделяется наведением мыши (или клавишами W / S)
    this.modal = { spec, sel: -1, box: this.add.container(0, 0).setDepth(DEPTH.overlay), hits: [] };
    audio.play('select');
    this.renderModal();
    // плавно показываем только новое окно; переход между окнами (например, после покупки) — без мигания
    if (!wasOpen) {
      this.modal.box.setAlpha(0).setY(6);
      this.tweens.add({ targets: this.modal.box, alpha: 1, y: 0, duration: MODAL_FADE_MS, ease: 'Cubic.easeOut' });
    }
  }

  /**
   * Мышь над окном выбора: наведённый пункт выделяется и остаётся выделенным, даже если курсор ушёл. Кнопка внизу —
   * как кнопки в инвентаре: подсвечена, пока курсор на ней; ушёл — не выделено ничего.
   */
  private hoverModal(p: Phaser.Input.Pointer): void {
    const m = this.modal;
    if (!m) return;
    const button = m.spec.closeButton ? m.spec.options.length : -2;
    const hit = m.hits.find((r) => p.worldX >= r.x && p.worldX < r.x + r.w && p.worldY >= r.y && p.worldY < r.y + r.h);
    if (hit) { m.buttonHover = hit.i === button; this.select(hit.i); return; }
    if (m.sel === button && m.buttonHover) { m.buttonHover = false; this.select(-1); }
  }

  private select(i: number): void {
    if (!this.modal || this.modal.sel === i) return;
    this.modal.sel = i;
    if (i >= 0) audio.play('select');
    this.renderModal();
  }

  private choose(i: number): void {
    const m = this.modal;
    if (!m) return;
    if (m.spec.closeButton && i === m.spec.options.length) {
      audio.play('click');
      if (m.spec.closeAction) m.spec.closeAction(); else this.close();
      return;
    }
    const o = m.spec.options[i];
    if (!o) return;
    if (o.enabled === false) { audio.play('error'); return; }
    audio.play('click');
    const keep = o.onChoose();
    if (this.modal !== m) return;
    if (keep === true) this.renderModal(); else this.close();
  }

  private close(): void {
    const spec = this.modal?.spec;
    this.closeModal(true);
    spec?.onClose?.();
  }

  private closeModal(markClosed: boolean): void {
    if (!this.modal) return;
    this.modal.box.destroy();
    this.modal = null;
    if (markClosed) this.closedAt = this.time.now;
  }

  private renderModal(): void {
    const m = this.modal;
    if (!m) return;
    const { spec } = m;
    const box = m.box;
    box.removeAll(true);
    m.hits = [];
    const pw = spec.width ?? 270;
    const sized = spec.sizeLike ?? spec.options, rows = Math.max(spec.options.length, sized.length);
    const rowH = rows > MODAL_ROW.compactAfter ? MODAL_ROW.compact : MODAL_ROW.normal;
    const bodyLines = spec.lines ?? [];
    const bodyText = bodyLines.length ? new PText(this, 0, 0, bodyLines.join('\n'), { color: COLORS.text, maxWidth: pw - 28 }) : null;
    const bodyH = bodyText ? bodyText.textHeight + 6 : 0;
    const sel = spec.options[m.sel];
    const descText = sel?.desc ? new PText(this, 0, 0, sel.desc, { color: COLORS.dim, maxWidth: pw - 28 }) : null;
    // место под описание — по самому длинному: окно не меняет размер и не сдвигается, когда пункт выбирают мышью
    const descH = Math.max(0, ...[...spec.options, ...sized].map((o) => {
      if (!o.desc) return 0;
      const probe = new PText(this, 0, 0, o.desc, { color: COLORS.dim, maxWidth: pw - 28 });
      const h = probe.textHeight + 8;
      probe.destroy();
      return h;
    }));
    const tabsH = spec.tabs ? MODAL_TABS.h + MODAL_TABS.below : 0;
    const closeH = spec.closeButton ? MODAL_CLOSE.gap + MODAL_CLOSE.h : 0;
    const ph = MODAL_SPACE.top + tabsH + bodyH + rows * rowH + descH + closeH + MODAL_SPACE.bottom;
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph);
    // заголовок на алой ленте поверх верхней кромки окна
    const title = new PText(this, W / 2, 0, spec.title, { font: 'big', ax: 0.5, color: COLORS.blade });
    title.setY(drawTitleRibbon(g, W / 2, py, title.textWidth));
    box.add([dim, g, title]);
    let y = py + MODAL_SPACE.top;
    if (spec.tabs) { this.renderTabs(box, spec.tabs, px + 14, y, pw - 28); y += tabsH; }
    if (bodyText) { bodyText.setPosition(px + 14, y); box.add(bodyText); y += bodyH; }
    spec.options.forEach((o, i) => {
      const ry = y + i * rowH;
      const on = o.enabled !== false;
      const cy = ry + (rowH - 2) / 2;   // середина строки: по ней — значки, надпись и цена
      if (i === m.sel) {
        // выбранный пункт: алая полоса с золотыми кантами и меч-указатель
        const hl = this.add.graphics();
        hl.fillStyle(UI.clothDark, 0.9).fillRect(px + 6, ry, pw - 12, rowH - 2);
        hl.fillStyle(UI.gold, 1).fillRect(px + 6, ry, pw - 12, 1).fillRect(px + 6, ry + rowH - 3, pw - 12, 1);
        const shine = this.add.image(px + 15, cy, TEXTURES.glow).setTint(0xffd070).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setAlpha(0.45);
        box.add([hl, shine, addIcon(this, px + 15, cy, 'castle_sword', 0.75)]);
      }
      if (o.iconTile) {
        const T = ICON_TILE, tile = this.add.graphics(), tx = px + 33 - T / 2, ty = Math.round(cy - T / 2);
        tile.fillStyle(o.iconTile.fill, 1).fillRect(tx, ty, T, T).lineStyle(1, o.iconTile.edge, 1).strokeRect(tx + 0.5, ty + 0.5, T - 1, T - 1);
        box.add(tile);
      }
      if (o.icon) box.add(addIcon(this, px + 33, cy, o.icon, 0.85));
      box.add(new PText(this, px + (o.icon ? 45 : 26), PText.centerY(cy), o.label, { color: on ? (i === m.sel ? COLORS.hover : COLORS.label) : COLORS.dim }));
      if (o.cost) addCostRow(this, box, px + pw - 12 - costWidth(o.cost), cy, o.cost, on);
      const zone = this.add.zone(px + 8, ry, pw - 16, rowH - 2).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      m.hits.push({ i, x: px + 8, y: ry, w: pw - 16, h: rowH - 2 });
      zone.on('pointerdown', () => this.choose(i));
      box.add(zone);
    });
    y += rows * rowH + 4;
    if (descText) { descText.setPosition(px + 14, y); box.add(descText); }
    if (spec.closeButton) this.renderCloseButton(box, spec.closeButton, py + ph - MODAL_SPACE.bottom - MODAL_CLOSE.h, m.sel === spec.options.length, spec.options.length);
    dim.on('pointerdown', () => { /* клик мимо окна ничего не делает */ });
  }

  /** Красная кнопка внизу по центру окна: выбрана (под курсором или с клавиатуры) — светлее и чуть выше. */
  private renderCloseButton(box: Phaser.GameObjects.Container, label: string, y: number, on: boolean, index: number): void {
    const B = MODAL_CLOSE, lift = on ? 1 : 0, g = this.add.graphics();
    const text = new PText(this, W / 2, buttonTextY(y - lift, B.h), label, { ax: 0.5, color: on ? COLORS.label : COLORS.text });
    const w = Math.max(B.w, Math.ceil(text.textWidth) + B.padX * 2), x = Math.round(W / 2 - w / 2);
    drawButton(g, x, y - lift, w, B.h, on);
    const zone = this.add.zone(x, y, w, B.h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.modal?.hits.push({ i: index, x, y, w, h: B.h });
    zone.on('pointerdown', () => this.choose(index));
    box.add([g, text, zone]);   // надпись — поверх кнопки
  }

  /** Вкладки в ряд на всю ширину: выбранная — алая с золотом, остальные — тёмные; под курсором светлеют. */
  private renderTabs(box: Phaser.GameObjects.Container, tabs: NonNullable<ChoiceSpec['tabs']>, x0: number, y: number, w: number): void {
    const T = MODAL_TABS, n = tabs.labels.length, tw = (w - T.gap * (n - 1)) / n;
    tabs.labels.forEach((label, i) => {
      const x = Math.round(x0 + i * (tw + T.gap)), right = Math.round(x0 + i * (tw + T.gap) + tw), on = i === tabs.active;
      const g = this.add.graphics(), text = new PText(this, (x + right) / 2, buttonTextY(y, T.h), label, { ax: 0.5, color: on ? COLORS.text : COLORS.dim });
      const paint = (hover: boolean): void => {
        g.clear();
        if (on) drawButton(g, x, y, right - x, T.h, hover);
        else drawPlate(g, x, y, right - x, T.h, hover ? 1 : 0.8);
        text.setColor(on || hover ? COLORS.label : COLORS.dim);
      };
      paint(false);
      const zone = this.add.zone(x, y, right - x, T.h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => paint(true));
      zone.on('pointerout', () => paint(false));
      zone.on('pointerdown', () => { if (!on) { audio.play('select'); tabs.onSelect(i); } });
      box.add([g, text, zone]);
    });
  }

  // ---------------- меню паузы ----------------
  /**
   * Лавка: вкладки сверху — «Все» и отделы (оружие, броня, магия, бафы), под ними товары выбранной вкладки.
   * Покупка уходит в карманы; если они полны — уведомление.
   */
  openShop(tab = 0): void {
    const dep = SHOP_DEPARTMENTS[tab - 1];
    const item = (id: ShopItemId): ChoiceOption => ({
      label: `${SHOP_ITEMS[id].name} · ${session.data.inventory[id] ? 'куплено' : `${SHOP_ITEMS[id].price} мон.`}`,
      icon: SHOP_ITEMS[id].icon, iconTile: RARITIES[EQUIPMENT[id].rarity],
      desc: `Класс: ${RARITIES[EQUIPMENT[id].rarity].name.toLowerCase()}\n${SHOP_ITEMS[id].description}`,
      enabled: session.canBuy(id),
      onChoose: () => {
        if (session.pocketsFree <= 0) { audio.play('error'); this.message('В карманах нет места', SHOP_ITEMS[id].icon); }
        else if (session.buy(id)) { audio.play('pickup'); this.message('Предмет в карманах', SHOP_ITEMS[id].icon); }
        this.openShop(tab);
        return true;
      },
    });
    const all = EQUIPMENT_IDS.map(item), shown = EQUIPMENT_IDS.filter((id) => !dep || dep.kinds.includes(EQUIPMENT[id].kind)).map(item);
    this.openChoice({
      title: 'Лавка снабженца', width: 350,
      tabs: { labels: [SHOP_ALL, ...SHOP_DEPARTMENTS.map((d) => d.name)], active: tab, onSelect: (i) => this.openShop(i) },
      lines: [shown.length ? `Кошелёк: ${session.data.coins} монет` : 'Товара пока нет — загляните позже.'],
      options: shown,
      sizeLike: all,
      closeButton: 'Закрыть',
    });
  }

  /**
   * Обучающая карточка: показывается один раз (запоминается в сохранении); then — что открыть после неё
   * (или сразу, если подсказку уже видели). again — показать снова (из меню «Обучение»).
   */
  showTip(id: TipId, then?: () => void, again = false): void {
    if (this.tip) return;
    if (!session.firstTime(id) && !again) { then?.(); return; }
    this.closeModal(false);
    this.tip = new TutorialCard(this, TIPS[id], () => {
      this.tip = null; this.closedAt = this.time.now;
      // открываем окно чуть позже: тот же клик не должен попасть в него
      if (then) this.time.delayedCall(60, then);
    });
  }

  /** Инвентарь-рюкзак: доспехи на герое, вещи в рюкзаке, карманы (ui/InventoryWindow.ts). В первый раз — подсказка. */
  openInventory(): void {
    if (this.inventory || this.tip) return;
    this.showTip('inventory', () => {
      if (this.inventory) return;
      this.closeModal(false);
      this.inventory = new InventoryWindow(this, this, () => { this.inventory = null; this.closedAt = this.time.now; });
    });
  }

  /** Сундук-хранилище тронного зала: перекладывание вещей между карманами и сундуком (ui/ChestWindow.ts). В первый раз — подсказка. */
  openChest(): void {
    if (this.inventory || this.tip) return;
    this.showTip('chest', () => {
      if (this.inventory) return;
      this.closeModal(false);
      this.inventory = new ChestWindow(this, () => { this.inventory = null; this.closedAt = this.time.now; });
    });
  }

  openPause(): void {
    const w = this.world as (WorldScene & { abandonRun?: () => void; goMenu?: () => void }) | null;
    if (!w) return;
    const options: ChoiceOption[] = [
      { label: 'Продолжить', onChoose: () => undefined },
      { label: 'Обучение', onChoose: () => { this.openTutorials(); return true; } },
      { label: audio.muted ? 'Звук: выключен' : 'Звук: включён', onChoose: () => { audio.toggleMute(); this.openPause(); return true; } },
    ];
    if (this.mode === 'expedition' && w.abandonRun) {
      options.push({ label: 'Вернуться в замок', onChoose: () => { this.confirm('Покинуть арену?', ['Заработанные монеты сохранятся.'], this.leavePause(() => w.abandonRun?.())); return true; } });
    }
    options.push({ label: 'Выйти на главную', onChoose: () => { this.confirm('Выйти на главную?', ['Прогресс замка и монеты сохранены.'], this.leavePause(() => w.goMenu?.())); return true; } });
    this.openChoice({ title: PAUSE_TITLE, options, width: 250 });
    this.pauseMenu = true;
    this.syncPause(w);
  }

  /** Выход из меню паузы в другую сцену: сначала мир снова идёт, иначе затемнение перехода не доиграет. */
  private leavePause(go: () => void): () => void {
    return () => {
      this.pauseMenu = false;
      if (this.world) this.syncPause(this.world);
      go();
    };
  }

  /** Обучение: снова посмотреть любую обучающую карточку; после неё — обратно к списку. */
  private openTutorials(): void {
    this.openChoice({
      title: 'Обучение', width: 250,
      options: [
        ...TIP_IDS.map((id): ChoiceOption => ({ label: TIPS[id].menu, onChoose: () => { this.showTip(id, () => this.openTutorials(), true); return true; } })),
      ],
      closeButton: 'Назад', closeAction: () => this.openPause(),
    });
  }

  confirm(title: string, lines: string[], onYes: () => void): void {
    this.openChoice({
      title, lines, width: 250,
      options: [
        { label: 'Да', onChoose: () => { onYes(); } },
        { label: 'Нет', onChoose: () => undefined },
      ],
    });
  }
}
