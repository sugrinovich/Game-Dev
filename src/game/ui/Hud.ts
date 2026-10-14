import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { DEPTH } from '../configs/game';
import { UI_COLORS, textStyle } from '../configs/ui';

/** Верхняя панель: полоска здоровья слева, счётчик монет справа. */
export class Hud {
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly coinText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const { width } = scene.scale;
    const barX = 40;
    const barY = 32;
    const barWidth = 220;
    const barHeight = 26;

    // здоровье
    scene.add
      .rectangle(barX, barY, barWidth, barHeight, UI_COLORS.hpBack)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, UI_COLORS.hpBorder)
      .setDepth(DEPTH.hud);
    this.hpFill = scene.add
      .rectangle(barX, barY, barWidth, barHeight, UI_COLORS.hpFill)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.hud);
    this.hpText = scene.add
      .text(barX + barWidth / 2, barY, '', textStyle(16))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud + 1);

    // монеты
    scene.add.image(width - 112, barY, TEXTURES.coin, 0).setDepth(DEPTH.hud);
    this.coinText = scene.add
      .text(width - 90, barY, '0', textStyle(24))
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.hud);

    // подсказка
    scene.add
      .text(width / 2, barY, 'Esc — пауза', textStyle(16, UI_COLORS.textMuted))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
  }

  setHp(hp: number, maxHp: number): void {
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this.hpFill.setScale(ratio, 1).setVisible(ratio > 0);
    this.hpText.setText(`${hp} / ${maxHp}`);
  }

  setCoins(coins: number): void {
    this.coinText.setText(String(coins));
  }
}
