import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';

/** Где рождаются клубы (прямоугольник), куда ползут (driftX, driftY) и насколько расползаются (±spread) за жизнь клуба, глубина, как часто (с). */
export interface SmokeSource { x: number; y: number; w: number; h: number; driftX: number; driftY: number; spread: number; depth: number; every: number }

/** Клуб дыма: время жизни (с), размер в начале и в конце (масштаб мягкого пятна), насколько непрозрачен. */
const PUFF = { life: [2.2, 3.4], scale: [0.25, 0.9], alpha: 0.6 } as const;
/** Цвета тьмы: почти чёрный с лиловым отливом. */
const TINTS = [0x050208, 0x0c0614, 0x160a24, 0x1e0e30] as const;

/** Чёрный дым Бездны: мягкие тёмные клубы выползают из проёма (ворота, окно), расползаются, растут и тают. */
export class AbyssSmoke {
  private wait = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly src: SmokeSource) {}

  update(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.src.every * Phaser.Math.FloatBetween(0.6, 1.4);
    this.puff();
  }

  private puff(): void {
    const s = this.src, life = Phaser.Math.FloatBetween(PUFF.life[0], PUFF.life[1]) * 1000;
    const img = this.scene.add.image(s.x + Math.random() * s.w, s.y + Math.random() * s.h, TEXTURES.glow)
      .setTint(Phaser.Utils.Array.GetRandom([...TINTS])).setScale(PUFF.scale[0]).setAlpha(0).setDepth(s.depth);
    const k = Phaser.Math.FloatBetween(0.6, 1.2);
    const x = img.x + s.driftX * k + Phaser.Math.FloatBetween(-s.spread, s.spread), y = img.y + s.driftY * k + Phaser.Math.FloatBetween(-s.spread, s.spread) * 0.5;
    this.scene.tweens.add({ targets: img, x, y, scale: PUFF.scale[1] * k, duration: life, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
    this.scene.tweens.add({ targets: img, alpha: PUFF.alpha, duration: life * 0.3, yoyo: true, hold: life * 0.3, ease: 'Sine.easeInOut' });
  }
}
