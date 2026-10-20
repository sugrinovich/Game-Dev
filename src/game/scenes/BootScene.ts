import Phaser from 'phaser';
import { PLAYER_DIRECTIONS, PLAYER_IDLE_ANIMATIONS, PLAYER_IDLE_SHEET, PLAYER_WALK_ANIMATIONS, PLAYER_WALK_SHEET, TEXTURES } from '../configs/assets';
import { SCENES } from '../configs/game';
import { SLIME_DIRECTIONS, SLIME_RUN_ANIMATIONS, SLIME_RUN_SHEET } from '../configs/assets';

/**
 * Загружает картинки и создаёт анимации, потом запускает игру.
 * Новая картинка = новая строка в preload() и ключ в configs/assets.ts.
 */
export class BootScene extends Phaser.Scene {
  private loadFailed = false;
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.loadFailed = false;
    this.load.on('loaderror', () => { this.loadFailed = true; });
    this.load.spritesheet(TEXTURES.playerIdle, new URL('../../assets/characters/player-swordsman-idle.png', import.meta.url).href, {
      frameWidth: PLAYER_IDLE_SHEET.frameSize,
      frameHeight: PLAYER_IDLE_SHEET.frameSize,
    });
    this.load.spritesheet(TEXTURES.player, new URL('../../assets/characters/player-swordsman.png', import.meta.url).href, {
      frameWidth: PLAYER_WALK_SHEET.frameSize,
      frameHeight: PLAYER_WALK_SHEET.frameSize,
    });
    this.load.spritesheet(TEXTURES.slimeRun, new URL('../../assets/characters/slime-run.png', import.meta.url).href, {
      frameWidth: SLIME_RUN_SHEET.frameSize,
      frameHeight: SLIME_RUN_SHEET.frameSize,
    });
    this.load.spritesheet(TEXTURES.slimeRunShadow, new URL('../../assets/characters/slime-run-shadow.png', import.meta.url).href, {
      frameWidth: SLIME_RUN_SHEET.frameSize,
      frameHeight: SLIME_RUN_SHEET.frameSize,
    });
  }

  create(): void {
    if (this.loadFailed) {
      this.add.text(16, 16, 'Не удалось загрузить спрайты. Обновите страницу.', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
        wordWrap: { width: Math.max(1, this.scale.width - 32) },
      });
      return;
    }
    this.textures.get(TEXTURES.slimeRunShadow).setFilter(Phaser.Textures.FilterMode.NEAREST);

    PLAYER_DIRECTIONS.forEach((direction, row) => {
      const start = row * PLAYER_IDLE_SHEET.columns;
      this.anims.create({
        key: PLAYER_IDLE_ANIMATIONS[direction],
        frames: this.anims.generateFrameNumbers(TEXTURES.playerIdle, {
          start, end: start + PLAYER_IDLE_SHEET.framesPerRow[row] - 1,
        }),
        frameRate: PLAYER_IDLE_SHEET.frameRate,
        repeat: -1,
      });
    });
    this.textures.get(TEXTURES.playerIdle).setFilter(Phaser.Textures.FilterMode.NEAREST);
    PLAYER_DIRECTIONS.forEach((direction, row) => {
      const start = row * PLAYER_WALK_SHEET.columns;
      this.anims.create({
        key: PLAYER_WALK_ANIMATIONS[direction],
        frames: this.anims.generateFrameNumbers(TEXTURES.player, {
          start, end: start + PLAYER_WALK_SHEET.columns - 1,
        }),
        frameRate: PLAYER_WALK_SHEET.frameRate,
        repeat: -1,
      });
    });
    for (const { texture, sheet, animations } of [
      { texture: TEXTURES.slimeRun, sheet: SLIME_RUN_SHEET, animations: SLIME_RUN_ANIMATIONS },
    ]) {
      this.textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
      SLIME_DIRECTIONS.forEach((direction, row) => {
        const start = row * sheet.columns;
        this.anims.create({
          key: animations[direction],
          frames: this.anims.generateFrameNumbers(texture, {
            start, end: start + sheet.columns - 1,
          }),
          frameRate: sheet.frameRate,
          repeat: -1,
        });
      });
    }
    this.scene.start(SCENES.game);
  }
}
