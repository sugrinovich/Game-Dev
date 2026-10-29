import Phaser from 'phaser';
import { SCENES } from '../configs/game';
import { makePixelFonts } from '../ui/PixelFont';

/** Рисует шрифты игры (файлов нет) — чтобы экран загрузки уже мог писать текст. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.boot });
  }

  create(): void {
    makePixelFonts(this);
    this.scene.start(SCENES.preload);
  }
}
