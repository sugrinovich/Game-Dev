import Phaser from 'phaser';
import { PLAYER_IDLE_ANIMATIONS, TEXTURES } from '../configs/assets';
import { COLORS, GAME, SCENES } from '../configs/game';
import { paintCastleGround } from '../systems/CastleArt';
import { Effects } from '../systems/Effects';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { PText } from '../ui/PText';
import { drawPanel } from '../ui/Panel';

interface Item { label: string; enabled: boolean; run: () => void }
type Page = 'main' | 'confirm' | 'bye';

const W = GAME.width;
const H = GAME.height;

/** Титульный экран: зал замка и меню «Начать играть / Продолжить / Выйти». */
export class MenuScene extends Phaser.Scene {
  private page: Page = 'main';
  private items: Item[] = [];
  private sel = 0;
  private ui!: Phaser.GameObjects.Container;
  private fx!: Effects;
  private emberT = 0;
  private busy = false;

  constructor() { super({ key: SCENES.menu }); }

  create(): void {
    this.busy = false;
    this.page = 'main';
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.fx = new Effects(this);
    this.buildBackdrop();
    this.buildLogo();
    this.ui = this.add.container(0, 0).setDepth(50);
    this.showMain();

    const kb = this.input.keyboard;
    kb?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    this.input.on('pointerdown', () => this.wake());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { kb?.off('keydown'); this.input.off('pointerdown'); });
    new PText(this, W - 4, H - 3, 'v0.1 · прототип', { ax: 1, ay: 1, color: COLORS.dim }).setDepth(60);
  }

  private wake(): void { audio.init(); audio.music('calm'); }

  private buildBackdrop(): void {
    paintCastleGround(this, 'menu-castle', W, H, 'hall');
    this.add.image(0, 0, 'menu-castle').setOrigin(0, 0);
    for (const x of [42, 130, 350, 438]) {
      this.add.image(x, 142, 'castle_pillar').setOrigin(0.5, 1);
      this.add.image(x, 60, 'castle_banner').setOrigin(0.5, 1);
    }
    for (const x of [82, 398]) {
      this.add.image(x, 232, 'castle_brazier').setOrigin(0.5, 1).setScale(1.2);
      const glow = this.fx.glow(x, 205, 4, 0xffac56, 0.35);
      this.tweens.add({ targets: glow, alpha: 0.23, duration: 650, yoyo: true, repeat: -1 });
    }
    this.add.sprite(240, 234, TEXTURES.playerIdle).setOrigin(0.5, 0.68).play(PLAYER_IDLE_ANIMATIONS.down);
    this.add.image(0, 0, 'title_vignette').setOrigin(0, 0).setDepth(20).setAlpha(0.7);
  }

  private buildLogo(): void {
    const t = new PText(this, W / 2, 40, GAME.title, { font: 'big', ax: 0.5, ay: 0.5, color: COLORS.gold, scale: 2 }).setDepth(30);
    this.tweens.add({ targets: t, y: 43, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(0xa07c4c, 1).fillRect(W / 2 - 110, 70, 100, 1).fillRect(W / 2 + 10, 70, 100, 1);
    g.fillStyle(0xf2d060, 1).fillRect(W / 2 - 2, 68, 4, 4).fillRect(W / 2 - 1, 67, 2, 6).fillRect(W / 2 - 3, 69, 6, 2);
    new PText(this, W / 2, 78, GAME.subtitle, { ax: 0.5, color: 0xd8c8a8 }).setDepth(30);
  }

  // ---------------- страницы меню ----------------
  private show(items: Item[], title = '', lines: string[] = []): void {
    this.items = items;
    this.sel = Math.max(0, items.findIndex((i) => i.enabled));
    this.ui.removeAll(true);
    const bw = 170, rowH = 20;
    const extra = lines.length ? lines.length * 12 + 8 : 0;
    const ph = items.length * rowH + 14 + (title ? 20 : 0) + extra;
    const px = Math.round((W - bw) / 2), py = 104;
    const g = this.add.graphics();
    drawPanel(g, px - 12, py - 8, bw + 24, ph);
    this.ui.add(g);
    let y = py;
    if (title) { this.ui.add(new PText(this, W / 2, y - 2, title, { ax: 0.5, color: COLORS.gold })); y += 18; }
    lines.forEach((l, i) => this.ui.add(new PText(this, W / 2, y + i * 12, l, { ax: 0.5, color: COLORS.dim })));
    y += extra;
    items.forEach((it, i) => {
      const ry = y + i * rowH;
      const hl = this.add.graphics();
      hl.setName(`hl${i}`);
      this.ui.add(hl);
      const label = new PText(this, W / 2, ry + 4, it.label, { ax: 0.5, color: it.enabled ? COLORS.text : COLORS.dim });
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
    const bw = 170, rowH = 20, px = Math.round((W - bw) / 2);
    this.items.forEach((it, i) => {
      const hl = this.ui.getByName(`hl${i}`) as Phaser.GameObjects.Graphics | null;
      const label = this.ui.getByName(`lb${i}`) as PText | null;
      if (!hl || !label) return;
      hl.clear();
      const on = i === this.sel;
      if (on) {
        const ry = (hl as unknown as { _y: number })._y;
        hl.fillStyle(COLORS.panelLight, 1).fillRect(px - 2, ry, bw + 4, rowH - 2).fillStyle(0x8a795c, 1).fillRect(px - 2, ry, bw + 4, 1);
      }
      label.setText(on ? `▶ ${it.label} ◀` : it.label).setColor(!it.enabled ? COLORS.dim : on ? 0xffffff : COLORS.text);
    });
  }

  private showMain(): void {
    this.page = 'main';
    const hasSave = session.hasSave();
    this.show([
      { label: 'Начать игру', enabled: true, run: () => (hasSave ? this.showConfirm() : this.startNew()) },
      { label: 'Продолжить', enabled: hasSave, run: () => this.continueGame() },
      { label: 'Выйти', enabled: true, run: () => this.bye() },
    ]);
  }

  private showConfirm(): void {
    this.page = 'confirm';
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
    this.page = 'bye';
    this.busy = true;
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.ui.removeAll(true);
      this.add.rectangle(0, 0, W, H, 0x0b0919, 1).setOrigin(0, 0).setDepth(200);
      new PText(this, W / 2, H / 2 - 12, 'До встречи в замке!', { font: 'big', ax: 0.5, ay: 0.5, color: COLORS.gold }).setDepth(201);
      new PText(this, W / 2, H / 2 + 14, 'Вкладку можно закрывать.', { ax: 0.5, color: COLORS.dim }).setDepth(201);
      this.cameras.main.fadeIn(600, 0, 0, 0);
      audio.music('off');
      window.setTimeout(() => window.close(), 900);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    this.wake();
    if (this.busy) return;
    const n = this.items.length;
    if (ev.code === 'ArrowDown' || ev.code === 'KeyS') this.move(1, n);
    else if (ev.code === 'ArrowUp' || ev.code === 'KeyW') this.move(-1, n);
    else if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'KeyE') this.activate(this.sel);
    else if (ev.code === 'Escape' && this.page === 'confirm') this.showMain();
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

  override update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.fx.update(dt);
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = 0.07;
      this.fx.burst({ x: (Math.random() < 0.5 ? 82 : 398) + Phaser.Math.Between(-5, 5), y: 205, count: 1, speed: [6, 18], angle: [-Math.PI * 0.65, -Math.PI * 0.35], life: [0.9, 1.8], size: [1, 2], tints: [0xffc24a, 0xf58a2a, 0xffeaa0], gravity: -14, blend: Phaser.BlendModes.ADD, depth: 20 });
    }
  }
}
