import Phaser from 'phaser';
import { COLORS, DEPTH, GAME, SCENES } from '../configs/game';
import { TEXTURES } from '../configs/assets';
import { EQUIPMENT_IDS, RESOURCES, RESOURCE_INFO, SHOP_ITEMS, type Cost, type ResourceId, type ShopItemId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText } from '../ui/PText';
import { addCostRow, costWidth, drawPanel, drawPlate } from '../ui/Panel';
import type { WorldScene } from './WorldScene';

export interface ChoiceOption {
  label: string;
  icon?: string;
  desc?: string;
  cost?: Cost;
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

/** Интерфейс поверх игры: полоски, ресурсы, подсказки, меню и окна выбора. */
export class UIScene extends Phaser.Scene {
  private world: WorldScene | null = null;
  private mode: 'base' | 'expedition' = 'base';
  private hud!: Phaser.GameObjects.Container;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: PText;
  private packText!: PText;
  private packIcon!: Phaser.GameObjects.Image;
  private potionText!: PText;
  private coinText!: PText;
  private dashG!: Phaser.GameObjects.Graphics;
  private objective!: PText;
  private objectivePlate!: Phaser.GameObjects.Graphics;
  private resList: { icon: Phaser.GameObjects.Image; text: PText }[] = [];
  private carryList: { icon: Phaser.GameObjects.Image; text: PText }[] = [];
  private hint!: PText;
  private hintTimer = 14;
  private toasts: Toast[] = [];
  private bannerText: PText | null = null;
  private bossG!: Phaser.GameObjects.Graphics;
  private bossName!: PText;
  private boss: { name: string; frac: number } | null = null;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private lastHp = 0;
  private hpShown = 0;
  private minimap: MinimapSpec | null = null;
  private miniImg: Phaser.GameObjects.Image | null = null;
  private miniG!: Phaser.GameObjects.Graphics;
  private modal: { spec: ChoiceSpec; sel: number; box: Phaser.GameObjects.Container } | null = null;
  private closedAt = -1000;
  private objectiveText = '';
  ready = false;

  constructor() { super({ key: SCENES.ui }); }

  get modalOpen(): boolean { return this.modal !== null || this.time.now - this.closedAt < 180; }

  create(): void {
    this.resList = []; this.carryList = []; this.toasts = [];
    this.modal = null; this.minimap = null; this.miniImg = null; this.bannerText = null;
    this.cameras.main.setRoundPixels(true);
    this.hud = this.add.container(0, 0);
    // здоровье
    this.hpBar = this.add.graphics();
    const heart = this.add.image(4, 3, TEXTURES.sprites, 'icon_heart').setOrigin(0, 0);
    this.hpText = new PText(this, 100, 5, '', { ax: 0 });
    this.packIcon = this.add.image(4, 20, TEXTURES.sprites, 'icon_backpack').setOrigin(0, 0);
    this.packText = new PText(this, 24, 23, '');
    const potion = this.add.image(4, 37, TEXTURES.sprites, 'icon_poultice').setOrigin(0, 0);
    this.potionText = new PText(this, 24, 40, '');
    this.add.image(4, 55, 'castle_coin').setOrigin(0, 0);
    this.coinText = new PText(this, 24, 58, '', { color: COLORS.gold });
    const inventoryButton = new PText(this, W - 8, H - 17, '[I] Инвентарь', { ax: 1, color: COLORS.gold });
    const inventoryZone = this.add.zone(W - 108, H - 22, 104, 22).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    inventoryZone.on('pointerdown', () => { if (!this.modal && this.world?.player.alive && !this.world.transitioning) this.openInventory(); });
    inventoryButton.setDepth(1);
    this.dashG = this.add.graphics();
    this.add.image(4, H - 20, TEXTURES.sprites, 'icon_dash').setOrigin(0, 0);
    this.objectivePlate = this.add.graphics();
    this.objective = new PText(this, W / 2, 21, '', { ax: 0.5, color: COLORS.gold });
    this.hint = new PText(this, W / 2, H - 28, 'WASD — ходьба   ПРОБЕЛ / ЛКМ — удар   SHIFT — рывок\nE — действие   Q — эликсир   ESC — меню   M — звук', { ax: 0.5, ay: 1, color: COLORS.dim });
    this.bossG = this.add.graphics();
    this.bossName = new PText(this, W / 2, H - 59, '', { ax: 0.5, color: COLORS.bad });
    this.miniG = this.add.graphics();
    this.damageFlash = this.add.rectangle(0, 0, W, H, 0xb02e4c, 0).setOrigin(0, 0).setDepth(-1);
    this.hud.add([heart, potion]);
    for (let i = 0; i < RESOURCES.length; i++) {
      const icon = this.add.image(W - 36, 4 + i * 14, TEXTURES.sprites, RESOURCE_INFO[RESOURCES[i]!].icon).setOrigin(0, 0).setScale(0.8);
      const text = new PText(this, W - 4, 6 + i * 14, '0', { ax: 1 });
      this.resList.push({ icon, text });
    }
    for (let i = 0; i < RESOURCES.length; i++) {
      const icon = this.add.image(W - 36, 64 + i * 13, TEXTURES.sprites, RESOURCE_INFO[RESOURCES[i]!].icon).setOrigin(0, 0).setScale(0.75);
      const text = new PText(this, W - 4, 66 + i * 13, '0', { ax: 1 });
      this.carryList.push({ icon, text });
    }

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
    this.ready = true;
  }

  /** Мир сообщает, какая сцена сейчас под интерфейсом. */
  bind(world: WorldScene, mode: 'base' | 'expedition'): void {
    this.world = world;
    this.mode = mode;
    this.closeModal(false);
    this.minimap = null;
    this.miniImg?.destroy(); this.miniImg = null;
    this.boss = null;
    for (const t of this.toasts) { t.text.destroy(); t.icon?.destroy(); }
    this.toasts.length = 0;
    this.bannerText?.destroy(); this.bannerText = null;
    this.lastHp = session.hp; this.hpShown = session.hp;
    this.hintTimer = 14;
    this.hint.setAlpha(1);
    const exp = mode === 'expedition';
    this.packIcon.setVisible(exp); this.packText.setVisible(exp);
    this.resList.forEach((r) => { r.icon.setVisible(!exp); r.text.setVisible(!exp); });
    this.scene.bringToTop();
  }

  setObjective(text: string): void { this.objectiveText = text; }

  setMinimap(spec: MinimapSpec | null): void {
    this.minimap = spec;
    this.miniImg?.destroy(); this.miniImg = null;
    if (spec) this.miniImg = this.add.image(W - 4 - spec.w, 4, spec.key).setOrigin(0, 0).setDisplaySize(spec.w, spec.h);
  }

  setBoss(name: string | null, frac = 1): void {
    this.boss = name ? { name, frac } : null;
    if (name) this.bossName.setText(name);
  }

  // ---------------- всплывающие сообщения ----------------
  pickup(kind: ResourceId, n: number): void {
    this.toast(kind, n, RESOURCE_INFO[kind].icon, RESOURCE_INFO[kind].name);
  }

  message(text: string, icon?: string): void { this.toast(`m:${text}`, 0, icon, text); }

  private toast(kind: string, n: number, icon: string | undefined, label: string): void {
    const ex = this.toasts.find((t) => t.kind === kind && t.timer > 0.4);
    if (ex) { ex.count += n; ex.timer = 2.4; ex.text.setText(n ? `+${ex.count} ${ex.label}` : ex.label); return; }
    const t = new PText(this, 24, 0, n ? `+${n} ${label}` : label, { color: COLORS.text });
    const img = icon ? (icon.startsWith('castle_') ? this.add.image(6, 0, icon) : this.add.image(6, 0, TEXTURES.sprites, icon)).setOrigin(0, 0.5).setScale(0.8) : null;
    this.toasts.push({ kind, count: n, text: t, icon: img, timer: 2.4, label });
  }

  banner(text: string, color: number = COLORS.gold, seconds = 2.6): void {
    this.bannerText?.destroy();
    const b = new PText(this, W / 2, 78, text, { font: 'big', ax: 0.5, ay: 0.5, color }).setAlpha(0).setScale(1.4);
    this.bannerText = b;
    this.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: seconds * 1000, duration: 500, onComplete: () => { if (this.bannerText === b) this.bannerText = null; b.destroy(); } });
  }

  // ---------------- обновление HUD ----------------
  override update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const w = this.world;
    if (!w || !w.player) return;
    const exp = this.mode === 'expedition';
    // здоровье
    if (session.hp < this.lastHp) this.damageFlash.setAlpha(0.35);
    this.lastHp = session.hp;
    this.damageFlash.setAlpha(Math.max(0, this.damageFlash.alpha - dt * 1.2));
    this.hpShown += (session.hp - this.hpShown) * Math.min(1, dt * 10);
    const barW = Math.min(110, 40 + session.maxHp * 0.5);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x1d1822, 1).fillRect(22, 3, barW + 2, 11);
    this.hpBar.fillStyle(0x5a2030, 1).fillRect(23, 4, barW, 9);
    this.hpBar.fillStyle(0xb02e4c, 1).fillRect(23, 4, Math.max(0, Math.round(barW * this.hpShown / session.maxHp)), 9);
    this.hpBar.fillStyle(0xe0506a, 1).fillRect(23, 4, Math.max(0, Math.round(barW * session.hp / session.maxHp)), 3);
    this.hpText.setPosition(26 + barW + 4, 5).setText(`${Math.ceil(session.hp)}/${session.maxHp}`);
    // рюкзак
    if (exp) {
      const full = session.carryCount >= session.capacity;
      this.packText.setText(`${session.carryCount}/${session.capacity}`).setColor(full ? COLORS.bad : COLORS.text);
    }
    this.potionText.setText(`Q ×${session.data.poultice}`).setColor(session.data.poultice > 0 ? COLORS.text : COLORS.dim);
    this.coinText.setText(`${session.data.coins}`);
    // рывок
    const cd = w.player.dashCd / SETTINGS.combat.dashCooldown;
    this.dashG.clear();
    this.dashG.fillStyle(0x1d1822, 1).fillRect(22, H - 15, 42, 7);
    this.dashG.fillStyle(0x3a2d44, 1).fillRect(23, H - 14, 40, 5);
    this.dashG.fillStyle(cd > 0 ? 0x5a8a9a : 0x5fe0d4, 1).fillRect(23, H - 14, Math.round(40 * (1 - cd)), 5);
    // цель
    this.objective.setText(this.objectiveText);
    this.objectivePlate.clear();
    if (this.objectiveText) { const tw = this.objective.textWidth + 12; drawPlate(this.objectivePlate, W / 2 - tw / 2, 18, tw, 15); }
    this.objective.setVisible(!!this.objectiveText);
    // ресурсы
    if (!exp) {
      RESOURCES.forEach((r, i) => {
        const n = session.data.resources[r];
        this.resList[i]!.text.setText(`${n}`).setColor(n > 0 ? COLORS.text : COLORS.dim);
        this.resList[i]!.icon.setAlpha(n > 0 ? 1 : 0.45);
      });
    }
    let row = 0;
    RESOURCES.forEach((r, i) => {
      const n = session.carry[r];
      const vis = exp && n > 0;
      const e = this.carryList[i]!;
      e.icon.setVisible(vis); e.text.setVisible(vis);
      if (vis) {
        const y = 64 + (this.minimap ? this.minimap.h - 56 : 0) + row * 13;
        e.icon.setY(y); e.text.setY(y + 2).setText(`${n}`);
        row++;
      }
    });
    // подсказка управления
    this.hintTimer -= dt;
    this.hint.setAlpha(this.modal ? 0 : Math.max(0, Math.min(1, this.hintTimer)));
    // всплывашки
    this.toasts.forEach((t, i) => {
      t.timer -= dt;
      const y = H - 56 - (this.toasts.length - 1 - i) * 14;
      t.text.setPosition(24, y - 5).setAlpha(Math.min(1, t.timer * 2));
      t.icon?.setPosition(6, y).setAlpha(Math.min(1, t.timer * 2));
    });
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      if (this.toasts[i]!.timer <= 0) { this.toasts[i]!.text.destroy(); this.toasts[i]!.icon?.destroy(); this.toasts.splice(i, 1); }
    }
    // босс
    this.bossG.clear();
    this.bossName.setVisible(!!this.boss);
    if (this.boss) {
      const bw = 220, bx = W / 2 - bw / 2, by = H - 46;
      this.bossG.fillStyle(0x1d1822, 1).fillRect(bx - 2, by - 2, bw + 4, 12);
      this.bossG.fillStyle(0x5a2030, 1).fillRect(bx, by, bw, 8);
      this.bossG.fillStyle(0xd9a830, 1).fillRect(bx, by, Math.max(0, Math.round(bw * this.boss.frac)), 8);
      this.bossG.fillStyle(0xfff0a0, 1).fillRect(bx, by, Math.max(0, Math.round(bw * this.boss.frac)), 2);
    }
    // миникарта
    this.miniG.clear();
    if (this.minimap && this.miniImg) {
      const m = this.minimap;
      const x0 = W - 4 - m.w;
      this.miniG.lineStyle(1, 0x1d1822, 1).strokeRect(x0 - 0.5, 3.5, m.w + 1, m.h + 1);
      for (const mk of m.markers()) {
        if (mk.blink && Math.floor(this.time.now / 350) % 2) continue;
        this.miniG.fillStyle(mk.color, 1).fillRect(Math.round(x0 + mk.x / m.worldW * m.w) - 1, Math.round(4 + mk.y / m.worldH * m.h) - 1, 3, 3);
      }
      this.miniG.fillStyle(0xffffff, 1).fillRect(Math.round(x0 + w.player.x / m.worldW * m.w) - 1, Math.round(4 + w.player.y / m.worldH * m.h) - 1, 3, 3);
    }
  }

  // ---------------- клавиши ----------------
  private onKey(ev: KeyboardEvent): void {
    audio.init();
    if (ev.code === 'KeyM') { const m = audio.toggleMute(); this.message(m ? 'Звук выключен' : 'Звук включён'); return; }
    if (ev.code === 'KeyF') { if (this.scale.isFullscreen) this.scale.stopFullscreen(); else this.scale.startFullscreen(); return; }
    const m = this.modal;
    if (m) {
      const n = m.spec.options.length;
      if (ev.code === 'ArrowUp' || ev.code === 'KeyW') { this.select((m.sel + n - 1) % n); }
      else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') { this.select((m.sel + 1) % n); }
      else if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'KeyE') { this.choose(m.sel); }
      else if (ev.code === 'Escape' || (ev.code === 'KeyI' && m.spec.title === 'Инвентарь') || (ev.code === 'KeyP' && m.spec.title === 'Пауза')) { if (m.spec.closable !== false) { this.close(); } }
      return;
    }
    if (ev.code === 'KeyI' && this.world?.player.alive && !this.world.transitioning) { this.openInventory(); return; }
    if ((ev.code === 'Escape' || ev.code === 'KeyP') && this.world && !this.world.transitioning && this.world.player?.alive) this.openPause();
  }

  // ---------------- окна выбора ----------------
  get isModalOpen(): boolean { return this.modal !== null; }

  openChoice(spec: ChoiceSpec): void {
    this.closeModal(false);
    const first = Math.max(0, spec.options.findIndex((o) => o.enabled !== false));
    this.modal = { spec, sel: first, box: this.add.container(0, 0).setDepth(DEPTH.overlay) };
    audio.play('select');
    this.renderModal();
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
    const rowH = 19;
    const bodyLines = spec.lines ?? [];
    const bodyText = bodyLines.length ? new PText(this, 0, 0, bodyLines.join('\n'), { color: COLORS.text, maxWidth: pw - 28 }) : null;
    const bodyH = bodyText ? bodyText.textHeight + 6 : 0;
    const sel = spec.options[m.sel];
    const descText = sel?.desc ? new PText(this, 0, 0, sel.desc, { color: COLORS.dim, maxWidth: pw - 28 }) : null;
    const descH = descText ? descText.textHeight + 8 : 0;
    const ph = 34 + bodyH + spec.options.length * rowH + descH + 10;
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph);
    box.add([dim, g]);
    box.add(new PText(this, W / 2, py + 9, spec.title, { font: 'big', ax: 0.5, color: COLORS.gold }));
    let y = py + 31;
    if (bodyText) { bodyText.setPosition(px + 14, y); box.add(bodyText); y += bodyH; }
    spec.options.forEach((o, i) => {
      const ry = y + i * rowH;
      const on = o.enabled !== false;
      if (i === m.sel) {
        const hl = this.add.graphics();
        hl.fillStyle(COLORS.panelLight, 1).fillRect(px + 8, ry, pw - 16, rowH - 2);
        hl.fillStyle(0x8a795c, 1).fillRect(px + 8, ry, pw - 16, 1);
        box.add(hl);
        box.add(new PText(this, px + 11, ry + 4, '▶', { color: COLORS.gold }));
      }
      if (o.icon) box.add(this.add.image(px + 29, ry + 9, o.icon).setScale(0.85));
      box.add(new PText(this, px + (o.icon ? 43 : 24), ry + 4, o.label, { color: on ? (i === m.sel ? 0xffffff : COLORS.text) : COLORS.dim }));
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
      lines: [`Ваш кошелёк: ${session.data.coins} монет`, 'Покупки попадают в инвентарь. Экипировка — I.'],
      options: [
        ...ids.map((id): ChoiceOption => ({
          label: `${SHOP_ITEMS[id].name} · ${id !== 'potion' && session.data.inventory[id] ? 'куплено' : `${SHOP_ITEMS[id].price} мон.`}`,
          icon: SHOP_ITEMS[id].icon, desc: SHOP_ITEMS[id].description,
          enabled: session.canBuy(id),
          onChoose: () => {
            if (session.buy(id)) { audio.play('pickup'); this.message('Предмет в инвентаре', SHOP_ITEMS[id].icon); }
            this.openShop();
          },
        })),
        { label: 'Открыть инвентарь', onChoose: () => this.openInventory() },
        { label: 'Закрыть', onChoose: () => undefined },
      ],
    });
  }

  openInventory(): void {
    this.openChoice({
      title: 'Инвентарь', width: 350,
      lines: [`Урон: ${session.damage} · здоровье: ${Math.ceil(session.hp)}/${session.maxHp} · рюкзак: ${session.capacity}`,
        `Монеты: ${session.data.coins} · эликсиры: ${session.data.poultice}/${SETTINGS.base.poulticeMax} (Q)`],
      options: [
        ...EQUIPMENT_IDS.map((id): ChoiceOption => ({
          label: `${SHOP_ITEMS[id].name} · ${!session.data.inventory[id] ? 'нет' : session.data.equipped[id] ? 'надето' : 'в сумке'}`,
          icon: SHOP_ITEMS[id].icon, enabled: session.data.inventory[id],
          desc: `${SHOP_ITEMS[id].description} ${session.data.inventory[id] ? 'Enter / клик — надеть или снять.' : 'Продаётся у торговца в замке.'}`,
          onChoose: () => {
            if (!session.toggleEquipment(id)) this.message('Сначала освободите рюкзак');
            this.openInventory();
          },
        })),
        { label: 'Закрыть', onChoose: () => undefined },
      ],
    });
  }

  openPause(): void {
    const w = this.world as (WorldScene & { abandonRun?: () => void; goMenu?: () => void }) | null;
    if (!w) return;
    const options: ChoiceOption[] = [
      { label: 'Продолжить', onChoose: () => undefined },
      { label: audio.muted ? 'Звук: выключен' : 'Звук: включён', onChoose: () => { audio.toggleMute(); this.openPause(); return true; } },
    ];
    if (this.mode === 'expedition' && w.abandonRun) {
      options.push({ label: 'Вернуться в замок', desc: 'Половина ресурсов потеряется. Монеты останутся.', onChoose: () => { this.confirm('Покинуть арену?', ['Вы потеряете половину добычи из рюкзака.'], () => w.abandonRun?.()); return true; } });
    }
    options.push({ label: 'В главное меню', desc: 'Замок сохранится. Добыча из рюкзака пропадёт.', onChoose: () => { this.confirm('Выйти в меню?', ['Прогресс замка и монеты сохранены.', this.mode === 'expedition' ? 'Добыча из рюкзака будет потеряна.' : ''].filter(Boolean), () => w.goMenu?.()); return true; } });
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
