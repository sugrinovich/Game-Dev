import Phaser from 'phaser';
import {
  ATLAS_ANIMS, PLAYER_DIRECTIONS, PLAYER_IDLE_ANIMATIONS, PLAYER_IDLE_SHEET, PLAYER_WALK_ANIMATIONS, PLAYER_WALK_SHEET,
  SLIME_DIRECTIONS, SLIME_RUN_ANIMATIONS, SLIME_RUN_SHEET, TEXTURES, URLS,
} from '../configs/assets';
import { COLORS, GAME, SCENES } from '../configs/game';
import { makeUtilityTextures } from '../systems/Effects';
import { PText } from '../ui/PText';
import { drawPanel } from '../ui/Panel';

const TIPS = [
  'Бейте по деревьям и камням дубиной — так добывают ресурсы.',
  'Рюкзак ограничен: вернитесь к обелиску, пока он не заполнился.',
  'Рывок (SHIFT) даёт мгновение неуязвимости.',
  'Огород созревает после каждой вылазки.',
  'Король слизней прячется в глубине Лощины.',
];

/** Экран загрузки: название игры, полоса прогресса и подсказка. Заодно создаёт все анимации. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.preload });
  }

  preload(): void {
    const { width: W, height: H } = GAME;
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);
    const g = this.add.graphics();
    for (let y = 0; y < H; y += 3) {
      const k = y / H;
      g.fillStyle(Phaser.Display.Color.GetColor(Math.round(14 + 26 * k), Math.round(11 + 18 * k), Math.round(26 + 34 * k)), 1).fillRect(0, y, W, 3);
    }
    const title = new PText(this, W / 2, 78, GAME.title, { font: 'big', ax: 0.5, ay: 0.5, color: COLORS.gold, scale: 3 });
    new PText(this, W / 2, 112, GAME.subtitle, { ax: 0.5, color: COLORS.dim });
    this.tweens.add({ targets: title, y: 74, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const bw = 220, bx = (W - bw) / 2, by = 176;
    const barBg = this.add.graphics();
    drawPanel(barBg, bx - 6, by - 6, bw + 12, 22);
    const bar = this.add.graphics();
    const pct = new PText(this, W / 2, by + 22, 'Загрузка…', { ax: 0.5, color: COLORS.text });
    new PText(this, W / 2, H - 22, TIPS[Math.floor(Math.random() * TIPS.length)] ?? '', { ax: 0.5, color: COLORS.dim });
    let shine = 0;
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(0x3f7a82, 1).fillRect(bx, by, Math.round(bw * v), 10);
      bar.fillStyle(0x5fe0d4, 1).fillRect(bx, by, Math.round(bw * v), 4);
      pct.setText(`Загрузка… ${Math.round(v * 100)}%`);
    });
    this.time.addEvent({ delay: 60, loop: true, callback: () => { shine = (shine + 9) % bw; bar.fillStyle(0xffffff, 0.35).fillRect(bx + shine, by, 3, 4); } });

    this.load.spritesheet(TEXTURES.player, URLS.player, { frameWidth: PLAYER_WALK_SHEET.frameSize, frameHeight: PLAYER_WALK_SHEET.frameSize });
    this.load.spritesheet(TEXTURES.playerIdle, URLS.playerIdle, { frameWidth: PLAYER_IDLE_SHEET.frameSize, frameHeight: PLAYER_IDLE_SHEET.frameSize });
    this.load.spritesheet(TEXTURES.slimeRun, URLS.slimeRun, { frameWidth: SLIME_RUN_SHEET.frameSize, frameHeight: SLIME_RUN_SHEET.frameSize });
    this.load.spritesheet(TEXTURES.slimeRunShadow, URLS.slimeRunShadow, { frameWidth: SLIME_RUN_SHEET.frameSize, frameHeight: SLIME_RUN_SHEET.frameSize });
    this.load.atlas(TEXTURES.sprites, URLS.spritesPng, URLS.spritesJson);
    this.load.image('title_sky', URLS.titleSky);
    this.load.image('title_moon', URLS.titleMoon);
    this.load.image('title_hills', URLS.titleHills);
    this.load.image('title_forest_far', URLS.titleForestFar);
    this.load.image('title_forest_near', URLS.titleForestNear);
    this.load.image('title_ground', URLS.titleGround);
    this.load.image('title_vignette', URLS.titleVignette);
  }

  create(): void {
    makeUtilityTextures(this);
    this.createAnimations();
    // чтобы экран загрузки успевали прочитать, даже когда всё загрузилось мгновенно
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.menu));
    });
  }

  private createAnimations(): void {
    PLAYER_DIRECTIONS.forEach((direction, row) => {
      this.anims.create({
        key: PLAYER_WALK_ANIMATIONS[direction],
        frames: this.anims.generateFrameNumbers(TEXTURES.player, { start: row * PLAYER_WALK_SHEET.columns, end: row * PLAYER_WALK_SHEET.columns + PLAYER_WALK_SHEET.columns - 1 }),
        frameRate: PLAYER_WALK_SHEET.frameRate, repeat: -1,
      });
      this.anims.create({
        key: PLAYER_IDLE_ANIMATIONS[direction],
        frames: this.anims.generateFrameNumbers(TEXTURES.playerIdle, { start: row * PLAYER_IDLE_SHEET.columns, end: row * PLAYER_IDLE_SHEET.columns + (PLAYER_IDLE_SHEET.framesPerRow[row] ?? 12) - 1 }),
        frameRate: PLAYER_IDLE_SHEET.frameRate, repeat: -1,
      });
    });
    SLIME_DIRECTIONS.forEach((direction, row) => {
      this.anims.create({
        key: SLIME_RUN_ANIMATIONS[direction],
        frames: this.anims.generateFrameNumbers(TEXTURES.slimeRun, { start: row * SLIME_RUN_SHEET.columns, end: row * SLIME_RUN_SHEET.columns + SLIME_RUN_SHEET.columns - 1 }),
        frameRate: SLIME_RUN_SHEET.frameRate, repeat: -1,
      });
    });
    for (const a of ATLAS_ANIMS) {
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNames(TEXTURES.sprites, { prefix: a.prefix, start: 0, end: a.count - 1 }),
        frameRate: a.rate, repeat: a.loop ? -1 : 0,
      });
    }
  }
}
