import Phaser from 'phaser';
import { Player } from '../characters/Player';
import { DEFAULT_PLAYER, PLAYER_CHARACTERS } from '../configs/characters';
import { TEXTURES } from '../configs/assets';
import { DEPTH, GAME, SCENES } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { Colliders, moveCircle } from '../systems/Colliders';
import { textureResolution } from '../systems/CastleModels';
import { Effects } from '../systems/Effects';
import { audio } from '../systems/Sfx';
import type { MapBounds } from '../systems/MapBounds';
import { PText } from '../ui/PText';
import { drawPlate, UI } from '../ui/Panel';
import type { Arena, Point } from '../types';
import type { UIScene } from './UIScene';

/**
 * Камера плавно догоняет героя (скорость сглаживания, 1/с): шаги героя по пикселям неровные,
 * а сглаженная точка движется ровно — карта прокручивается без дрожи, в том числе по диагонали.
 */
const CAMERA_SMOOTH = 10;
/** Скорость плавного появления и исчезновения подсказки «[E]» (доля в секунду). */
const PROMPT_FADE_SPEED = 12;

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
  map!: MapBounds;
  readonly colliders = new Colliders();
  protected ui!: UIScene;
  protected readonly interactables: Interactable[] = [];
  protected mapW = 0;
  protected mapH = 0;
  transitioning = false;

  private prompt!: PText;
  private holdGfx!: Phaser.GameObjects.Graphics;
  private holdTime = 0;
  private promptAlpha = 0;
  private hitStopLeft = 0;
  private current: Interactable | null = null;
  private readonly cameraTarget = { x: 0, y: 0 };

  protected initWorld(map: MapBounds, mode: 'base' | 'expedition'): void {
    this.map = map;
    this.mapW = map.width;
    this.mapH = map.height;
    this.transitioning = false;
    this.interactables.length = 0;
    this.colliders.clear();
    this.holdTime = 0;
    this.promptAlpha = 0;
    this.hitStopLeft = 0;
    this.current = null;
    this.fx = new Effects(this);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH).setBackgroundColor(GAME.backgroundColor).setRoundPixels(true).setZoom(GAME.resolution);
    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.prompt = new PText(this, 0, 0, '', { ax: 0.5, ay: 1 }).setDepth(DEPTH.prompt).setVisible(false);
    this.holdGfx = this.add.graphics().setDepth(DEPTH.prompt - 1);   // под текстом подсказки: плашка и полоска удержания

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
    this.cameraTarget.x = x;
    this.cameraTarget.y = y;
    this.cameras.main.startFollow(this.cameraTarget, true, 1, 1);
    this.cameras.main.centerOn(x, y);
    return this.player;
  }

  /** Объект, поставленный «ногами» в точку (x, y); глубина — по Y. Анимированные объекты замка сразу оживают. */
  protected prop(frame: string, x: number, y: number): Phaser.GameObjects.Sprite {
    const animated = this.anims.exists(frame);
    const img = this.add.sprite(x, y, frame, animated ? '0' : undefined);
    if (img.frame.customPivot) img.setOrigin(img.frame.pivotX, img.frame.pivotY); else img.setOrigin(0.5, 1);
    // случайная фаза, чтобы одинаковые объекты не двигались синхронно
    if (animated) { img.play(frame); img.anims.setProgress(Math.random()); }
    // 3D-модели нарисованы детальнее пикселей игры — показываем их обычного размера
    return img.setScale(1 / textureResolution(img.texture)).setDepth(y);
  }

  /** Мягкая тень на полу под объектом: sx, sy — во сколько раз растянуть стандартную тень 32x12. */
  protected groundShadow(x: number, y: number, sx: number, sy = 0.8): Phaser.GameObjects.Image {
    return this.add.image(x, y, TEXTURES.shadow).setScale(sx, sy).setDepth(y - 1);
  }

  /** Уменьшает крупный объект до роста героя. Возвращает получившийся масштаб. */
  protected fitToHero(img: Phaser.GameObjects.Sprite): number {
    const res = textureResolution(img.texture);
    const scale = Math.min(1, SETTINGS.props.maxHeight / (img.height / res)) / res;
    img.setScale(scale);
    return scale;
  }

  protected blocked(): boolean { return this.ui.modalOpen || this.transitioning || !this.player.alive; }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    if (!this.ui.ready) return;
    if (this.ui.modalOpen || this.transitioning) {
      this.player.drain();
      this.fx.update(dt);
      this.syncCameraTarget(dt);
      return;
    }
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= delta;
      this.fx.update(dt);
      this.syncCameraTarget(dt);
      return;
    }
    this.player.tick(dt);
    this.tick(dt);
    this.syncCameraTarget(dt);
    this.updateInteract(dt);
    this.fx.update(dt);
  }

  /** Сглаживание не зависит от частоты кадров (60, 120, 144 Гц — одинаково). Прокрутку до целых пикселей округляет камера. */
  private syncCameraTarget(dt: number): void {
    const k = 1 - Math.exp(-CAMERA_SMOOTH * dt);
    this.cameraTarget.x += (this.player.x - this.cameraTarget.x) * k;
    this.cameraTarget.y += (this.player.y - this.cameraTarget.y) * k;
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
    this.promptAlpha += ((best ? 1 : 0) - this.promptAlpha) * Math.min(1, dt * PROMPT_FADE_SPEED);
    this.prompt.setAlpha(this.promptAlpha).setVisible(this.promptAlpha > 0.02);
    if (!best) { this.drawPromptPlate(); return; }
    const label = best.label() ?? '';
    this.prompt.setText(`[E] ${label}`);
    // у самой стены подсказка не уходит за край карты
    const half = this.prompt.textWidth / 2 + 6;
    this.prompt.setPosition(Math.round(Phaser.Math.Clamp(best.x, half, this.mapW - half)), Math.round(best.y - best.promptY + Math.sin(this.time.now / 220) * 1.5));
    this.drawPromptPlate();
    if (best.hold && best.hold > 0) {
      if (this.player.interactHeld()) {
        this.holdTime += dt;
        const k = Math.min(1, this.holdTime / best.hold);
        this.holdGfx.fillStyle(UI.ironDark, 0.9).fillRect(best.x - 14, best.y - best.promptY + 4, 28, 5);
        this.holdGfx.fillStyle(UI.gold, 1).fillRect(best.x - 13, best.y - best.promptY + 5, Math.floor(26 * k), 3);
        if (this.holdTime >= best.hold) { this.holdTime = 0; this.player.drain(); best.use(); }
      } else this.holdTime = 0;
    } else if (this.player.interactPressed()) {
      audio.play('click');
      best.use();
    }
  }

  /** Плашка под подсказкой «[E] …» — гаснет вместе с текстом. */
  private drawPromptPlate(): void {
    if (!this.prompt.visible) return;
    const pw = this.prompt.textWidth + 10, ph = this.prompt.textHeight + 3;
    drawPlate(this.holdGfx, Math.round(this.prompt.x - pw / 2), Math.round(this.prompt.y - ph), pw, ph, 0.8 * this.promptAlpha);
  }

  // ---------------- Arena ----------------
  move(e: Point, dx: number, dy: number, radius: number, flying = false): boolean {
    return moveCircle(e, dx, dy, radius, flying, this.colliders, this.map);
  }

  playerStrike(_x: number, _y: number, _dx: number, _dy: number, _range: number, _arc: number, _damage: number): number { return 0; }

  hurtPlayer(amount: number, fromX: number, fromY: number): void { this.player.hurt(amount, fromX, fromY); }

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
