import Phaser from 'phaser';
import { UI_COLORS, textStyle } from '../configs/ui';

/** Простая кнопка: прямоугольник с текстом, подсвечивается при наведении. */
export class Button extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void) {
    super(scene, x, y);

    const background = scene.add.rectangle(0, 0, 240, 52, UI_COLORS.button).setStrokeStyle(2, UI_COLORS.buttonBorder);
    const text = scene.add.text(0, 0, label, textStyle(22)).setOrigin(0.5);
    this.add([background, text]);

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => background.setFillStyle(UI_COLORS.buttonHover));
    background.on('pointerout', () => background.setFillStyle(UI_COLORS.button));
    background.on('pointerup', onClick);

    scene.add.existing(this);
  }
}
