import Phaser from 'phaser';
import { ANIMATIONS, TEXTURES } from '../configs/assets';
import { SCENES } from '../configs/game';

/**
 * Загружает картинки и создаёт анимации, потом запускает игру.
 * Новая картинка = новая строка в preload() и ключ в configs/assets.ts.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    // Путь в new URL(...) должен быть написан прямо в строке: так его понимает Vite.
    this.load.spritesheet(TEXTURES.player, new URL('../../assets/characters/player-potato.png', import.meta.url).href, {
      frameWidth: 56,
      frameHeight: 56,
    });
    this.load.spritesheet(TEXTURES.enemy, new URL('../../assets/characters/enemy-alien.png', import.meta.url).href, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet(TEXTURES.coin, new URL('../../assets/items/coin.png', import.meta.url).href, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image(TEXTURES.spawnMarker, new URL('../../assets/ui/spawn-marker.png', import.meta.url).href);
  }

  create(): void {
    this.anims.create({
      key: ANIMATIONS.player,
      frames: this.anims.generateFrameNumbers(TEXTURES.player, { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: ANIMATIONS.enemy,
      frames: this.anims.generateFrameNumbers(TEXTURES.enemy, { start: 0, end: 3 }),
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({
      key: ANIMATIONS.coin,
      frames: this.anims.generateFrameNumbers(TEXTURES.coin, { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });

    this.scene.start(SCENES.game);
  }
}
