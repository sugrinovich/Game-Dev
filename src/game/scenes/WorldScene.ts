import Phaser from 'phaser';
import { Player } from '../characters/Player';
import { DEFAULT_PLAYER, PLAYER_CHARACTERS } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, GAME, SCENES } from '../configs/game';
import { Colliders, moveCircle } from '../systems/Colliders';
import { Effects } from '../systems/Effects';
import { audio } from '../systems/Sfx';
import type { Terrain } from '../systems/Terrain';
import { PText } from '../ui/PText';
import type { Arena, Point } from '../types';
import type { ResourceId } from '../configs/items';
import type { UIScene } from './UIScene';

/** Предмет мира, с которым можно взаимодействовать клавишей E. */
export interface Interactable {
  x: number; y: number; radius: number;
  /** Высота подсказки над точкой. */
  promptY: number;
  /** Текст подсказки; null — сейчас недоступно. */
  label: () => string | null;
  /** Секунд удержания клавиши (0 — обычное нажатие). */
  hold?: number;
  use: () => void;
}

/** Общая основа лагеря и вылазки: карта, камера, игрок, подсказки «Нажми E», пауза. */
export abstract class WorldScene extends Phaser.Scene implements Arena {
  fx!: Effects;
  player!: Player;
  terrain!: Terrain;
  readonly colliders = new Colliders();
  protected ui!: UIScene;
  protected readonly interactables: Interactable[] = [];
  protected mapW = 0;
  protected mapH = 0;
  transitioning = false;

  private prompt!: PText;
  private holdGfx!: Phaser.GameObjects.Graphics;
  private holdTime = 0;
  private hitStopLeft = 0;
  private current: Interactable | null = null;

  protected initWorld(terrain: Terrain, mode: 'base' | 'expedition'): void {
    this.terrain = terrain;
    this.mapW = terrain.spec.width;
    this.mapH = terrain.spec.height;
    this.transitioning = false;
    this.interactables.length = 0;
    this.holdTime = 0;
    this.hitStopLeft = 0;
    this.current = null;
    this.fx = new Effects(this);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH).setBackgroundColor(GAME.backgroundColor).setRoundPixels(true);
    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.prompt = new PText(this, 0, 0, '', { ax: 0.5, ay: 1 }).setDepth(DEPTH.prompt).setVisible(false);
    this.holdGfx = this.add.graphics().setDepth(DEPTH.prompt);

    if (!this.scene.isActive(SCENES.ui)) this.scene.launch(SCENES.ui);
    this.ui = this.scene.get(SCENES.ui) as UIScene;
    this.whenUi(() => this.ui.bind(this, mode));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.blocked() || !p.leftButtonDown()) return;
      this.player.attackToward(p.worldX, p.worldY);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.input.off('pointerdown'); this.fx.clear(); });
  }

  /** Интерфейс запускается параллельно и готов не сразу: всё, что его трогает, делаем через этот метод. */
  protected whenUi(fn: () => void): void {
    if (this.ui.ready) fn();
    else this.ui.events.once(Phaser.Scenes.Events.CREATE, fn);
  }

  protected createPlayer(x: number, y: number): Player {
    this.player = new Player(this, x, y, PLAYER_CHARACTERS[DEFAULT_PLAYER], this);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.centerOn(x, y);
    return this.player;
  }

  /** Картинка из атласа, поставленная «ногами» в точку (x, y); глубина — по Y. */
  protected prop(frame: string, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, TEXTURES.sprites, frame);
    if (img.frame.customPivot) img.setOrigin(img.frame.pivotX, img.frame.pivotY); else img.setOrigin(0.5, 1);
    return img.setDepth(y);
  }

  protected animProp(key: string, first: string, x: number, y: number): Phaser.GameObjects.Sprite {
    const s = this.add.sprite(x, y, TEXTURES.sprites, first);
    if (s.frame.customPivot) s.setOrigin(s.frame.pivotX, s.frame.pivotY); else s.setOrigin(0.5, 1);
    s.play(key);
    return s.setDepth(y);
  }

  protected blocked(): boolean { return this.ui.modalOpen || this.transitioning || !this.player.alive; }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    if (!this.ui.ready) return;
    if (this.ui.modalOpen || this.transitioning) {
      this.player.drain();
      this.fx.update(dt);
      return;
    }
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= delta;
      this.fx.update(dt);
      return;
    }
    this.player.tick(dt);
    this.tick(dt);
    this.updateInteract(dt);
    this.fx.update(dt);
  }

  /** Логика конкретной сцены каждый кадр. */
  protected abstract tick(dt: number): void;

  // ---------------- взаимодействие ----------------
  private updateInteract(dt: number): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (this.player.alive && !this.player.frozen) {
      for (const it of this.interactables) {
        const d = Math.hypot(it.x - this.player.x, it.y - this.player.y);
        if (d <= it.radius && d < bestD && it.label() !== null) { best = it; bestD = d; }
      }
    }
    if (best !== this.current) { this.holdTime = 0; this.current = best; }
    this.holdGfx.clear();
    if (!best) { this.prompt.setVisible(false); return; }
    const label = best.label() ?? '';
    this.prompt.setText(`[E] ${label}`).setPosition(Math.round(best.x), Math.round(best.y - best.promptY + Math.sin(this.time.now / 220) * 1.5)).setVisible(true);
    if (best.hold && best.hold > 0) {
      if (this.player.interactHeld()) {
        this.holdTime += dt;
        const k = Math.min(1, this.holdTime / best.hold);
        this.holdGfx.fillStyle(COLORS.shadow, 0.9).fillRect(best.x - 14, best.y - best.promptY + 4, 28, 5);
        this.holdGfx.fillStyle(COLORS.accent, 1).fillRect(best.x - 13, best.y - best.promptY + 5, Math.floor(26 * k), 3);
        if (this.holdTime >= best.hold) { this.holdTime = 0; this.player.drain(); best.use(); }
      } else this.holdTime = 0;
    } else if (this.player.interactPressed()) {
      audio.play('click');
      best.use();
    }
  }

  // ---------------- Arena ----------------
  move(e: Point, dx: number, dy: number, radius: number, flying = false): boolean {
    return moveCircle(e, dx, dy, radius, flying, this.colliders, this.terrain);
  }

  playerStrike(_x: number, _y: number, _dx: number, _dy: number, _range: number, _arc: number, _damage: number): number { return 0; }

  hurtPlayer(amount: number, fromX: number, fromY: number): void { this.player.hurt(amount, fromX, fromY); }

  dropLoot(_x: number, _y: number, _kind: ResourceId, _amount: number): void { /* в лагере добычи нет */ }

  shake(intensity: number, ms = 150): void { this.cameras.main.shake(ms, intensity); }

  hitStop(ms: number): void { this.hitStopLeft = Math.max(this.hitStopLeft, ms); }

  playSfx(name: string): void { audio.play(name); }

  /** Плавный переход на другую сцену. */
  protected goTo(scene: string, data?: object): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.frozen = true;
    this.prompt.setVisible(false);
    this.holdGfx.clear();
    this.cameras.main.fadeOut(420, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
