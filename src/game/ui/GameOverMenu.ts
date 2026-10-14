import Phaser from 'phaser';
import { DEPTH } from '../configs/game';
import { UI_COLORS, textStyle } from '../configs/ui';
import { Button } from './Button';

/** Экран поражения: сколько монет собрано и кнопка «Играть снова». */
export class GameOverMenu {
  private readonly container: Phaser.GameObjects.Container;
  private readonly resultText: Phaser.GameObjects.Text;
  private isOpen = false;

  constructor(scene: Phaser.Scene, onRestart: () => void) {
    const { width, height } = scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    const overlay = scene.add.rectangle(cx, cy, width, height, UI_COLORS.overlay, 0.7);
    const title = scene.add.text(cx, cy - 100, 'Картошку съели!', textStyle(44)).setOrigin(0.5);
    this.resultText = scene.add.text(cx, cy - 40, '', textStyle(24, UI_COLORS.textMuted)).setOrigin(0.5);
    const restart = new Button(scene, cx, cy + 40, 'Играть снова', () => {
      if (this.isOpen) onRestart();
    });
    const hint = scene.add.text(cx, cy + 90, 'или нажми R', textStyle(16, UI_COLORS.textMuted)).setOrigin(0.5);

    this.container = scene.add
      .container(0, 0, [overlay, title, this.resultText, restart, hint])
      .setDepth(DEPTH.menu)
      .setVisible(false);
  }

  show(coins: number): void {
    this.isOpen = true;
    this.resultText.setText(`Собрано монет: ${coins}`);
    this.container.setVisible(true);
  }
}
