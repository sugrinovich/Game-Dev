import Phaser from 'phaser';
import { URLS } from '../configs/assets';
import { SCENES } from '../configs/game';

/** Грузит только шрифты — чтобы экран загрузки уже мог писать текст. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.boot });
  }

  preload(): void {
    this.load.bitmapFont('ui', URLS.fontUiPng, URLS.fontUiFnt);
    this.load.bitmapFont('big', URLS.fontBigPng, URLS.fontBigFnt);
  }

  create(): void {
    this.scene.start(SCENES.preload);
  }
}
