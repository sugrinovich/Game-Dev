import Phaser from 'phaser';
import { SCENES } from '../configs/game';
import { LOADING_FONTS, makePixelFonts } from '../ui/PixelFont';

/** Рисует шрифты экрана загрузки (файлов нет) — чтобы он сразу мог писать текст; шрифты мира — этапом загрузки. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.boot });
  }

  create(): void {
    makePixelFonts(this, LOADING_FONTS);
    this.scene.start(SCENES.preload);
  }
}
