import Phaser from 'phaser';
import { COLORS, GAME, GLINT_EVERY, KEYS, SCENES } from '../configs/game';
import { addTitleLogo, SiegeBackdrop, TITLE_DEPTH } from '../systems/TitleArt';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText, startGlints } from '../ui/PText';
import { drawPanel, UI } from '../ui/Panel';
import { addIcon } from '../systems/IconArt';

interface Item { label: string; enabled: boolean; run: () => void }

const W = GAME.width;
const H = GAME.height;
/** Панель меню: ширина, высота строки, верх не выше top; pennant — сколько вымпел панели выступает над первым пунктом. */
const MENU = { w: 170, rowH: 20, top: 124, pennant: 15 } as const;


/** Титульный экран: заставка «Осада Бездны» и меню «Начать игру / Продолжить / Выйти». */
export class MenuScene extends Phaser.Scene {
  private items: Item[] = [];
  private sel = 0;
  private ui!: Phaser.GameObjects.Container;
  /** Мечи-указатели слева и справа от выбранного пункта. */
  private cursors: Phaser.GameObjects.Image[] = [];
  private busy = false;
  /** Верх первого пункта: под логотипом с отступом. */
  private top: number = MENU.top;

  constructor() { super({ key: SCENES.menu }); }

  create(): void {
    this.busy = false;
    this.cameras.main.setZoom(GAME.resolution).centerOn(W / 2, H / 2).fadeIn(500, 0, 0, 0);
    new SiegeBackdrop(this);
    this.add.image(0, 0, 'title_vignette').setOrigin(0, 0).setDepth(TITLE_DEPTH.vignette).setAlpha(0.55);
    this.top = Math.max(MENU.top, addTitleLogo(this) + MENU.pennant);
    this.ui = this.add.container(0, 0).setDepth(TITLE_DEPTH.ui + 10);
    this.showMain();
    startGlints(this, GLINT_EVERY.menu);

    const kb = this.input.keyboard;
    kb?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    this.input.on('pointerdown', () => this.wake());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { kb?.off('keydown'); this.input.off('pointerdown'); });
    new PText(this, W - 4, H - 3, 'v0.2 · прототип', { ax: 1, ay: 1, color: COLORS.dim }).setDepth(TITLE_DEPTH.ui + 20);
  }

  private wake(): void { audio.init(); audio.music('calm'); }

  // ---------------- страницы меню ----------------
  private show(items: Item[], title = '', lines: string[] = []): void {
    this.items = items;
    this.sel = Math.max(0, items.findIndex((i) => i.enabled));
    this.ui.removeAll(true);
    const bw = MENU.w, rowH = MENU.rowH;
    const extra = lines.length ? lines.length * 12 + 8 : 0;
    const ph = items.length * rowH + 14 + (title ? 20 : 0) + extra;
    const px = Math.round((W - bw) / 2), py = this.top;
    const g = this.add.graphics();
    drawPanel(g, px - 12, py - 8, bw + 24, ph, { alpha: 0.88, pennant: true });
    this.ui.add(g);
    this.cursors = [addIcon(this, 0, 0, 'castle_sword'), addIcon(this, 0, 0, 'castle_sword').setFlipX(true)];
    this.ui.add(this.cursors);
    let y = py;
    if (title) { this.ui.add(new PText(this, W / 2, y - 2, title, { ax: 0.5, color: COLORS.gold })); y += 18; }
    lines.forEach((l, i) => this.ui.add(new PText(this, W / 2, y + i * 12, l, { ax: 0.5, color: COLORS.dim })));
    y += extra;
    items.forEach((it, i) => {
      const ry = y + i * rowH;
      const hl = this.add.graphics();
      hl.setName(`hl${i}`);
      this.ui.add(hl);
      const label = new PText(this, W / 2, PText.centerY(ry + (rowH - 2) / 2), it.label, { ax: 0.5, color: it.enabled ? COLORS.label : COLORS.dim, shine: it.enabled });
      label.setName(`lb${i}`);
      this.ui.add(label);
      const zone = this.add.zone(px - 4, ry, bw + 8, rowH - 2).setOrigin(0, 0).setInteractive({ useHandCursor: it.enabled });
      zone.on('pointerover', () => { if (it.enabled && this.sel !== i) { this.sel = i; audio.play('select'); this.paintSel(); } });
      zone.on('pointerdown', () => { this.wake(); this.activate(i); });
      this.ui.add(zone);
      (hl as unknown as { _y: number })._y = ry;
    });
    this.paintSel();
  }

  private paintSel(): void {
    const bw = MENU.w, rowH = MENU.rowH, px = Math.round((W - bw) / 2);
    this.items.forEach((it, i) => {
      const hl = this.ui.getByName(`hl${i}`) as Phaser.GameObjects.Graphics | null;
      const label = this.ui.getByName(`lb${i}`) as PText | null;
      if (!hl || !label) return;
      hl.clear();
      const on = i === this.sel;
      if (on) {
        const ry = (hl as unknown as { _y: number })._y;
        hl.fillStyle(UI.clothDark, 0.9).fillRect(px - 2, ry, bw + 4, rowH - 2).fillStyle(UI.gold, 1).fillRect(px - 2, ry, bw + 4, 1).fillRect(px - 2, ry + rowH - 3, bw + 4, 1);
        const half = label.textWidth / 2 + 14;
        this.cursors[0]?.setPosition(W / 2 - half, ry + 8);
        this.cursors[1]?.setPosition(W / 2 + half, ry + 8);
      }
      label.setColor(!it.enabled ? COLORS.dim : on ? COLORS.hover : COLORS.label);
    });
  }

  private showMain(): void {
    const hasSave = session.hasSave();
    this.show([
      { label: 'Начать игру', enabled: true, run: () => (hasSave ? this.showConfirm() : this.startNew()) },
      { label: 'Продолжить', enabled: hasSave, run: () => this.continueGame() },
      { label: 'Выйти', enabled: true, run: () => this.bye() },
    ]);
  }

  private showConfirm(): void {
    this.show([
      { label: 'Да, начать заново', enabled: true, run: () => this.startNew() },
      { label: 'Отмена', enabled: true, run: () => this.showMain() },
    ], 'Новая игра?', ['Старое сохранение будет стёрто.']);
  }

  private startNew(): void {
    session.newGame();
    this.go(SCENES.base, { intro: true });
  }

  private continueGame(): void {
    if (!session.load()) { audio.play('error'); return; }
    this.go(SCENES.base, {});
  }

  private go(scene: string, data: object): void {
    if (this.busy) return;
    this.busy = true;
    audio.play('portal');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }

  private bye(): void {
    this.busy = true;
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.ui.removeAll(true);
      this.add.rectangle(0, 0, W, H, 0x0b0919, 1).setOrigin(0, 0).setDepth(TITLE_DEPTH.ui + 30);
      new PText(this, W / 2, H / 2 - 12, 'До встречи в замке!', { font: 'big', ax: 0.5, ay: 0.5, color: COLORS.blade }).setDepth(TITLE_DEPTH.ui + 31);
      new PText(this, W / 2, H / 2 + 14, 'Вкладку можно закрывать.', { ax: 0.5, color: COLORS.dim }).setDepth(TITLE_DEPTH.ui + 31);
      this.cameras.main.fadeIn(600, 0, 0, 0);
      audio.music('off');
      window.setTimeout(() => window.close(), 900);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    this.wake();
    if (this.busy) return;
    const n = this.items.length;
    if (ev.code === KEYS.down.code) this.move(1, n);
    else if (ev.code === KEYS.up.code) this.move(-1, n);
    else if (ev.code === KEYS.interact.code) this.activate(this.sel);
  }

  private move(d: number, n: number): void {
    for (let k = 1; k <= n; k++) {
      const i = (this.sel + d * k + n * 4) % n;
      if (this.items[i]?.enabled) { this.sel = i; break; }
    }
    audio.play('select');
    this.paintSel();
  }

  private activate(i: number): void {
    const it = this.items[i];
    if (!it || this.busy) return;
    if (!it.enabled) { audio.play('error'); return; }
    audio.play('click');
    it.run();
  }
}
