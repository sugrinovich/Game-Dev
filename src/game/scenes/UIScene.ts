import Phaser from 'phaser';
import { COLORS, DEPTH, GAME, GLINT_EVERY, SCENES } from '../configs/game';
import { TEXTURES } from '../configs/assets';
import { EQUIPMENT_IDS, SHOP_ITEMS, type ShopItemId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText, startGlints } from '../ui/PText';
import { addCostRow, BAR_COLORS, costWidth, drawBar, drawPanel, drawPlate, drawRibbon, UI } from '../ui/Panel';
import { InventoryWindow } from '../ui/InventoryWindow';
import { addIcon } from '../systems/IconArt';
import type { WorldScene } from './WorldScene';

export interface ChoiceOption {
  label: string;
  icon?: string;
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
}

interface Toast { kind: string; count: number; text: PText; icon: Phaser.GameObjects.Image | null; timer: number; label: string }
export interface MinimapSpec { key: string; w: number; h: number; worldW: number; worldH: number; markers: () => { x: number; y: number; color: number; blink?: boolean }[] }

const W = GAME.width;
const H = GAME.height;
/** Длительность плавного появления окна. */
const MODAL_FADE_MS = 160;
/** Высота строки в окне выбора; длинные списки (лавка) — плотнее, чтобы окно влезло в экран. */
const MODAL_ROW = { normal: 19, compact: 15, compactAfter: 8 } as const;
/** Как часто обновлять счётчик FPS (клавиша ` / Ё), секунды. */
const FPS_REFRESH = 0.25;
/**
 * Табличка состояния в левом верхнем углу. Верхний ряд — сердце и полоска здоровья до правого поля
 * (запас здоровья видно по делениям), нижний — эликсиры и монеты (с середины таблички).
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
const PLATE = { h: 22, pad: 5, margin: 2 } as const;
const DASH_BAR_W = 50;
/** Зазор между табличкой состояния и лентой цели. */
const RIBBON_GAP = 10;
/** Здоровье на одно деление полоски. */
const HP_PER_TICK = 20;

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
  private hintPlate!: Phaser.GameObjects.Graphics;
  private objective!: PText;
  private objectivePlate!: Phaser.GameObjects.Graphics;
  private hint!: PText;
  private hintTimer = 14;
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
  private modal: { spec: ChoiceSpec; sel: number; box: Phaser.GameObjects.Container } | null = null;
  /** Окно инвентаря-рюкзака (своё, не список). */
  private inventory: InventoryWindow | null = null;
  private closedAt = -1000;
  private objectiveText = '';
  private fpsText!: PText;
  private fpsT = 0;
  ready = false;

  constructor() { super({ key: SCENES.ui }); }

  get modalOpen(): boolean { return this.modal !== null || this.inventory !== null || this.time.now - this.closedAt < 180; }

  create(): void {
    this.toasts = [];
    this.modal = null; this.inventory = null; this.minimap = null; this.miniImg = null; this.bannerText = null;
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
    const invLabel = new PText(this, 0, plateY + (PLATE.h - 7) / 2 - 2, '[I] Инвентарь', { ax: 0.5, color: COLORS.gold, shine: true });
    const invW = Math.ceil(invLabel.textWidth) + PLATE.pad * 4, invX = W - PLATE.margin - invW;
    invLabel.setX(invX + invW / 2);
    drawPlate(invPlate, invX, plateY, invW, PLATE.h);
    const inventoryZone = this.add.zone(invX, plateY, invW, PLATE.h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    inventoryZone.on('pointerover', () => invLabel.setColor(COLORS.goldHover));
    inventoryZone.on('pointerout', () => invLabel.setColor(COLORS.gold));
    inventoryZone.on('pointerdown', () => { if (!this.modal && !this.inventory && this.world?.player.alive && !this.world.transitioning) this.openInventory(); });
    this.objectivePlate = this.add.graphics();
    this.objective = new PText(this, W / 2, 4, '', { ax: 0.5, color: COLORS.text, shine: true });
    this.hintPlate = this.add.graphics();
    this.hint = new PText(this, W / 2, H - 26, 'WASD — ходьба   ПРОБЕЛ / ЛКМ — удар   SHIFT — рывок\nE — действие   Q — эликсир   ESC — меню   M — звук', { ax: 0.5, ay: 1, color: COLORS.dim });
    drawPlate(this.hintPlate, Math.round(W / 2 - this.hint.textWidth / 2) - 8, H - 28 - this.hint.textHeight, this.hint.textWidth + 16, this.hint.textHeight + 6, 0.7);
    this.toastG = this.add.graphics();
    this.bossG = this.add.graphics();
    this.bossName = new PText(this, W / 2, H - 64, '', { ax: 0.5, color: COLORS.text });
    this.miniG = this.add.graphics();
    this.fpsText = new PText(this, 4, HUD.y + HUD_H + 3, '', { color: COLORS.good }).setVisible(false);
    this.damageFlash = this.add.rectangle(0, 0, W, H, 0xb02e4c, 0).setOrigin(0, 0).setDepth(-1);

    const kb = this.input.keyboard;
    kb?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
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

  /** Мягкое свечение (аддитивное) — ставится под иконку. */
  private glow(x: number, y: number, tint: number, scale: number, alpha = 0.35): Phaser.GameObjects.Image {
    return this.add.image(x, y, TEXTURES.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha);
  }

  private pulse(target: Phaser.GameObjects.Image, ms: number): void {
    this.tweens.add({ targets: target, alpha: target.alpha * 0.4, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Мир сообщает, какая сцена сейчас под интерфейсом. */
  bind(world: WorldScene, mode: 'base' | 'expedition'): void {
    this.world = world;
    this.mode = mode;
    this.closeModal(false);
    this.inventory?.close();
    this.minimap = null;
    this.miniImg?.destroy(); this.miniImg = null;
    this.minimapMarks?.clear();
    this.boss = null;
    for (const t of this.toasts) { t.text.destroy(); t.icon?.destroy(); }
    this.toasts.length = 0;
    this.bannerText?.destroy(); this.bannerText = null;
    this.lastHp = session.hp; this.hpShown = session.hp;
    this.hintTimer = 14;
    this.hint.setAlpha(1); this.hintPlate.setAlpha(1);
    this.scene.bringToTop();
  }

  setObjective(text: string): void { this.objectiveText = text; }

  setMinimap(spec: MinimapSpec | null): void {
    this.minimap = spec;
    this.miniImg?.destroy(); this.miniImg = null;
    if (spec) this.miniImg = this.add.image(W - 5 - spec.w, 5, spec.key).setOrigin(0, 0).setDisplaySize(spec.w, spec.h);
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
    const t = new PText(this, 24, 0, n ? `+${n} ${label}` : label, { color: COLORS.text });
    const img = icon ? addIcon(this, 6, 0, icon, 0.8).setOrigin(0, 0.5) : null;
    this.toasts.push({ kind, count: n, text: t, icon: img, timer: 2.4, label });
  }

  /** Крупная надпись на алой ленте посреди экрана. */
  banner(text: string, color: number = COLORS.blade, seconds = 2.6): void {
    this.bannerText?.destroy();
    const label = new PText(this, 0, 0, text, { font: 'big', ax: 0.5, ay: 0.5, color });
    const ribbon = this.add.graphics();
    drawRibbon(ribbon, 0, -11, label.textWidth + 28, 22);
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
    // здоровье
    if (session.hp < this.lastHp) this.damageFlash.setAlpha(0.35);
    this.lastHp = session.hp;
    this.damageFlash.setAlpha(Math.max(0, this.damageFlash.alpha - dt * 1.2));
    this.hpShown += (session.hp - this.hpShown) * Math.min(1, dt * 10);
    this.hpBar.clear();
    drawBar(this.hpBar, HP_BAR.x, HP_BAR.y, HP_BAR.w, HUD.barH, session.hp / session.maxHp, BAR_COLORS.health, this.hpShown / session.maxHp, Math.round(session.maxHp / HP_PER_TICK));
    this.hpText.setText(`${Math.ceil(session.hp)}/${session.maxHp}`);
    // сердце бьётся: при малом здоровье — часто и ярко
    const low = session.hp / session.maxHp < 0.3;
    this.heartGlow.setAlpha((low ? 0.35 : 0.22) + (low ? 0.3 : 0.12) * (0.5 + 0.5 * Math.sin(this.time.now / (low ? 90 : 380))));
    this.potionText.setText(`×${session.data.poultice}`).setColor(session.data.poultice > 0 ? COLORS.text : COLORS.dim);
    this.coinText.setText(`${session.data.coins}`);
    // рывок
    const cd = w.player.dashCd / SETTINGS.combat.dashCooldown;
    this.dashG.clear();
    const dashX = PLATE.margin + PLATE.pad + HUD.icon + HUD.gap + BAR_TIP;
    drawBar(this.dashG, dashX, H - PLATE.margin - PLATE.h / 2 - 2, DASH_BAR_W, 4, 1 - cd, cd > 0 ? { ...BAR_COLORS.dash, light: BAR_COLORS.dash.fill } : BAR_COLORS.dash);
    this.dashGlow.setAlpha(cd > 0 ? 0.08 : 0.3 + 0.12 * Math.sin(this.time.now / 250));
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
    // подсказка управления
    this.hintTimer -= dt;
    this.hint.setAlpha(this.modal || this.inventory ? 0 : Math.max(0, Math.min(1, this.hintTimer)));
    this.inventory?.update(dt);
    this.hintPlate.setAlpha(this.hint.alpha);
    // всплывашки
    this.toastG.clear();
    this.toasts.forEach((t, i) => {
      t.timer -= dt;
      const y = H - 58 - (this.toasts.length - 1 - i) * 16;
      const a = Math.min(1, t.timer * 2);
      drawPlate(this.toastG, 2, y - 8, t.text.textWidth + 28, 15, 0.8 * a);
      t.text.setPosition(24, y - 6).setAlpha(a);
      t.icon?.setPosition(6, y).setAlpha(a);
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
      const x0 = W - 5 - m.w, y0 = 5;
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
    if (this.inventory) { this.inventory.onKey(ev); return; }
    const m = this.modal;
    if (m) {
      const n = m.spec.options.length;
      if (ev.code === 'ArrowUp' || ev.code === 'KeyW') { this.select((m.sel + n - 1) % n); }
      else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') { this.select((m.sel + 1) % n); }
      else if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'KeyE') { this.choose(m.sel); }
      else if (ev.code === 'Escape' || (ev.code === 'KeyP' && m.spec.title === 'Пауза')) { if (m.spec.closable !== false) { this.close(); } }
      return;
    }
    if (ev.code === 'KeyI' && this.world?.player.alive && !this.world.transitioning) { this.openInventory(); return; }
    if ((ev.code === 'Escape' || ev.code === 'KeyP') && this.world && !this.world.transitioning && this.world.player?.alive) this.openPause();
  }

  // ---------------- окна выбора ----------------
  get isModalOpen(): boolean { return this.modal !== null || this.inventory !== null; }

  openChoice(spec: ChoiceSpec): void {
    this.inventory?.close();
    const wasOpen = this.modal !== null;
    this.closeModal(false);
    const first = Math.max(0, spec.options.findIndex((o) => o.enabled !== false));
    this.modal = { spec, sel: first, box: this.add.container(0, 0).setDepth(DEPTH.overlay) };
    audio.play('select');
    this.renderModal();
    // плавно показываем только новое окно; переход между окнами (например, после покупки) — без мигания
    if (!wasOpen) {
      this.modal.box.setAlpha(0).setY(6);
      this.tweens.add({ targets: this.modal.box, alpha: 1, y: 0, duration: MODAL_FADE_MS, ease: 'Cubic.easeOut' });
    }
  }

  private select(i: number): void {
    if (!this.modal || this.modal.sel === i) return;
    this.modal.sel = i; audio.play('select'); this.renderModal();
  }

  private choose(i: number): void {
    const m = this.modal;
    if (!m) return;
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
    const pw = spec.width ?? 270;
    const rowH = spec.options.length > MODAL_ROW.compactAfter ? MODAL_ROW.compact : MODAL_ROW.normal;
    const bodyLines = spec.lines ?? [];
    const bodyText = bodyLines.length ? new PText(this, 0, 0, bodyLines.join('\n'), { color: COLORS.text, maxWidth: pw - 28 }) : null;
    const bodyH = bodyText ? bodyText.textHeight + 6 : 0;
    const sel = spec.options[m.sel];
    const descText = sel?.desc ? new PText(this, 0, 0, sel.desc, { color: COLORS.dim, maxWidth: pw - 28 }) : null;
    const descH = descText ? descText.textHeight + 8 : 0;
    const ph = 30 + bodyH + spec.options.length * rowH + descH + 10;
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph);
    // заголовок на алой ленте поверх верхней кромки окна
    const title = new PText(this, W / 2, py - 4, spec.title, { font: 'big', ax: 0.5, color: COLORS.blade });
    drawRibbon(g, W / 2, py - 6, Math.max(80, title.textWidth + 24), 22);
    box.add([dim, g, title]);
    let y = py + 26;
    if (bodyText) { bodyText.setPosition(px + 14, y); box.add(bodyText); y += bodyH; }
    spec.options.forEach((o, i) => {
      const ry = y + i * rowH;
      const on = o.enabled !== false;
      if (i === m.sel) {
        // выбранный пункт: алая полоса с золотыми кантами и меч-указатель
        const hl = this.add.graphics();
        hl.fillStyle(UI.clothDark, 0.9).fillRect(px + 6, ry, pw - 12, rowH - 2);
        hl.fillStyle(UI.gold, 1).fillRect(px + 6, ry, pw - 12, 1).fillRect(px + 6, ry + rowH - 3, pw - 12, 1);
        const shine = this.add.image(px + 15, ry + 8, TEXTURES.glow).setTint(0xffd070).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setAlpha(0.45);
        box.add([hl, shine, addIcon(this, px + 15, ry + 8, 'castle_sword', 0.75)]);
      }
      if (o.icon) box.add(addIcon(this, px + 33, ry + 8, o.icon, 0.85));
      box.add(new PText(this, px + (o.icon ? 45 : 26), ry + 3, o.label, { color: on ? (i === m.sel ? COLORS.hover : COLORS.label) : COLORS.dim }));
      if (o.cost) addCostRow(this, box, px + pw - 12 - costWidth(o.cost), ry + 3, o.cost, on);
      const zone = this.add.zone(px + 8, ry, pw - 16, rowH - 2).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => this.choose(i));
      box.add(zone);
    });
    y += spec.options.length * rowH + 4;
    if (descText) { descText.setPosition(px + 14, y); box.add(descText); }
    if (spec.closable !== false) box.add(new PText(this, px + pw - 8, py + ph + 3, 'ESC — закрыть', { ax: 1, color: COLORS.dim }));
    dim.on('pointerdown', () => { /* клик мимо окна ничего не делает */ });
  }

  // ---------------- меню паузы ----------------
  openShop(): void {
    const ids: ShopItemId[] = [...EQUIPMENT_IDS, 'potion'];
    this.openChoice({
      title: 'Лавка снабженца', width: 350,
      lines: [`Кошелёк: ${session.data.coins} монет · покупки — в сундук инвентаря (I)`],
      options: [
        ...ids.map((id): ChoiceOption => ({
          label: `${SHOP_ITEMS[id].name} · ${id !== 'potion' && session.data.inventory[id] ? 'куплено' : `${SHOP_ITEMS[id].price} мон.`}`,
          icon: SHOP_ITEMS[id].icon, desc: SHOP_ITEMS[id].description,
          enabled: session.canBuy(id),
          onChoose: () => {
            if (session.buy(id)) { audio.play('pickup'); this.message('Предмет в сундуке (I)', SHOP_ITEMS[id].icon); }
            this.openShop();
          },
        })),
        { label: 'Открыть инвентарь', onChoose: () => this.openInventory() },
        { label: 'Закрыть', onChoose: () => undefined },
      ],
    });
  }

  /** Инвентарь-рюкзак: доспехи на герое, вещи в рюкзаке, сундук (ui/InventoryWindow.ts). */
  openInventory(): void {
    if (this.inventory) return;
    this.closeModal(false);
    this.inventory = new InventoryWindow(this, this, () => { this.inventory = null; this.closedAt = this.time.now; });
  }

  openPause(): void {
    const w = this.world as (WorldScene & { abandonRun?: () => void; goMenu?: () => void }) | null;
    if (!w) return;
    const options: ChoiceOption[] = [
      { label: 'Продолжить', onChoose: () => undefined },
      { label: audio.muted ? 'Звук: выключен' : 'Звук: включён', onChoose: () => { audio.toggleMute(); this.openPause(); return true; } },
    ];
    if (this.mode === 'expedition' && w.abandonRun) {
      options.push({ label: 'Вернуться в замок', desc: 'Арена не будет пройдена. Монеты останутся.', onChoose: () => { this.confirm('Покинуть арену?', ['Заработанные монеты сохранятся.'], () => w.abandonRun?.()); return true; } });
    }
    options.push({ label: 'В главное меню', desc: 'Замок и монеты сохранятся.', onChoose: () => { this.confirm('Выйти в меню?', ['Прогресс замка и монеты сохранены.'], () => w.goMenu?.()); return true; } });
    this.openChoice({ title: 'Пауза', options, width: 250 });
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
