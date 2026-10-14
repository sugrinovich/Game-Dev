import Phaser from 'phaser';
import { DEPTH } from '../configs/game';
import { UI_COLORS, textStyle } from '../configs/ui';
import { Button } from './Button';

interface PauseMenuHandlers {
  onResume: () => void;
  onRestart: () => void;
}

/** Меню паузы: затемнение, заголовок и две кнопки. */
export class PauseMenu {
  private readonly container: Phaser.GameObjects.Container;
  private isOpen = false;

  constructor(scene: Phaser.Scene, handlers: PauseMenuHandlers) {
    const { width, height } = scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    const overlay = scene.add.rectangle(cx, cy, width, height, UI_COLORS.overlay, 0.65);
    const title = scene.add.text(cx, cy - 110, 'ПАУЗА', textStyle(48)).setOrigin(0.5);
    const hint = scene.add
      .text(cx, cy - 62, 'Esc — продолжить · R — заново', textStyle(16, UI_COLORS.textMuted))
      .setOrigin(0.5);
    const resume = new Button(scene, cx, cy + 10, 'Продолжить', () => {
      if (this.isOpen) handlers.onResume();
    });
    const restart = new Button(scene, cx, cy + 78, 'Заново', () => {
      if (this.isOpen) handlers.onRestart();
    });

    this.container = scene.add
      .container(0, 0, [overlay, title, hint, resume, restart])
      .setDepth(DEPTH.menu)
      .setVisible(false);
  }

  show(): void {
    this.isOpen = true;
    this.container.setVisible(true);
  }

  hide(): void {
    this.isOpen = false;
    this.container.setVisible(false);
  }
}
