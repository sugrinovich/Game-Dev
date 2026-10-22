import Phaser from 'phaser';
import { COLORS } from '../configs/game';

export interface PTextOptions {
  font?: 'ui' | 'big';
  color?: number;
  /** 0 — слева, 0.5 — по центру, 1 — справа */
  ax?: number;
  ay?: number;
  shadow?: boolean;
  maxWidth?: number;
  scale?: number;
}

/** Текст пиксельным шрифтом с тенью (шрифт загружается в BootScene). */
export class PText extends Phaser.GameObjects.Container {
  private readonly main: Phaser.GameObjects.BitmapText;
  private readonly back?: Phaser.GameObjects.BitmapText;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: PTextOptions = {}) {
    super(scene, x, y);
    const font = opts.font ?? 'ui';
    const ax = opts.ax ?? 0;
    const ay = opts.ay ?? 0;
    if (opts.shadow !== false) {
      this.back = scene.add.bitmapText(1, 1, font, text).setOrigin(ax, ay).setTint(COLORS.shadow);
      this.add(this.back);
    }
    this.main = scene.add.bitmapText(0, 0, font, text).setOrigin(ax, ay).setTint(opts.color ?? COLORS.text);
    this.add(this.main);
    if (ax === 0.5) { this.main.setCenterAlign(); this.back?.setCenterAlign(); } else if (ax === 1) { this.main.setRightAlign(); this.back?.setRightAlign(); }
    if (opts.maxWidth) { this.main.setMaxWidth(opts.maxWidth); this.back?.setMaxWidth(opts.maxWidth); }
    if (opts.scale) this.setScale(opts.scale);
    scene.add.existing(this);
  }

  setText(text: string): this {
    if (this.main.text !== text) { this.main.setText(text); this.back?.setText(text); }
    return this;
  }

  setColor(color: number): this { this.main.setTint(color); return this; }

  get textWidth(): number { return this.main.width; }
  get textHeight(): number { return this.main.height; }
}
