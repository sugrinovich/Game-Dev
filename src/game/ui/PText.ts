import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS } from '../configs/game';
import { FONT_INK, FONT_RES, FONTS, type FontKey } from './PixelFont';

export interface PTextOptions {
  /** ui — обычный текст, big — плоские надписи, title — объёмное название игры. */
  font?: FontKey;
  color?: number;
  /** 0 — слева, 0.5 — по центру, 1 — справа */
  ax?: number;
  ay?: number;
  shadow?: boolean;
  maxWidth?: number;
  scale?: number;
  /** По надписи иногда пробегает искра (см. startGlints). */
  shine?: boolean;
}

/** Надписи, по которым может пробежать искра. */
const shiny = new Set<PText>();
/**
 * Искра: ширина светлой полосы и её наклон (верх полосы впереди низа) — пиксели игры; время пробега (мс);
 * glow — размер и яркость светящейся точки, бегущей вместе с полосой.
 */
const GLINT = { band: 8, slant: 2.5, ms: 800, glow: 0.14, glowAlpha: 0.75 } as const;
/** Ширина буквы в рисунке шрифта (без промежутка) — для плавного перехода света внутри буквы. */
const GLYPH_W = 5;

function gray(k: number): number { const v = Math.round(255 * Math.max(0, Math.min(1, k))); return (v << 16) | (v << 8) | v; }

/** Текст пиксельным шрифтом с тенью (шрифт загружается в BootScene). */
export class PText extends Phaser.GameObjects.Container {
  private readonly main: Phaser.GameObjects.BitmapText;
  private readonly back?: Phaser.GameObjects.BitmapText;
  private readonly font: FontKey;
  /** Копия надписи для искры: складывается со светом, светятся только буквы в полосе. */
  private shine?: Phaser.GameObjects.DynamicBitmapText;
  private spark?: Phaser.GameObjects.Image;
  /** Где сейчас полоса искры — в пикселях рисунка шрифта от начала строки. */
  private glintX = -1e9;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: PTextOptions = {}) {
    super(scene, x, y);
    const font = opts.font ?? 'ui';
    this.font = font;
    const ax = opts.ax ?? 0;
    const ay = opts.ay ?? 0;
    // у шрифтов игры контур и тень уже нарисованы в самих буквах; отдельная тень — по желанию
    // буквы нарисованы детальнее пикселей игры: размер в пикселях игры уменьшает их до нужной высоты
    const size = FONTS[font].lineHeight;
    if (opts.shadow === true) {
      this.back = scene.add.bitmapText(1, 1, font, text, size).setOrigin(ax, ay).setTint(COLORS.shadow);
      this.add(this.back);
    }
    this.main = scene.add.bitmapText(0, 0, font, text, size).setOrigin(ax, ay).setTint(opts.color ?? COLORS.text);
    this.add(this.main);
    if (ax === 0.5) { this.main.setCenterAlign(); this.back?.setCenterAlign(); } else if (ax === 1) { this.main.setRightAlign(); this.back?.setRightAlign(); }
    if (opts.maxWidth) { this.main.setMaxWidth(opts.maxWidth); this.back?.setMaxWidth(opts.maxWidth); }
    if (opts.scale) this.setScale(opts.scale);
    if (opts.shine) { shiny.add(this); this.once(Phaser.GameObjects.Events.DESTROY, () => shiny.delete(this)); }
    scene.add.existing(this);
  }

  setText(text: string): this {
    if (this.main.text !== text) { this.main.setText(text); this.back?.setText(text); this.shine?.setText(text); }
    return this;
  }

  setColor(color: number): this { this.main.setTint(color); return this; }

  /** y для надписи, чтобы её буквы встали ровно посередине по высоте вокруг centerY (кнопки, ленты, строки меню). */
  static centerY(centerY: number, font: FontKey = 'ui'): number { return Math.round(centerY - FONT_INK[font].center); }

  get textWidth(): number { return this.main.width; }
  get textHeight(): number { return this.main.height; }

  /** Искра пробегает по буквам слева направо: светлеют только сами буквы в узкой косой полосе, впереди — светящаяся точка. */
  glint(): void {
    if (this.shine?.visible) return;
    // пикселей рисунка шрифта на пиксель игры; у крупного шрифта буквы, полоса и наклон вдвое шире
    const R = FONT_RES * FONTS[this.font].detail, k = FONTS[this.font].scale * R;
    if (!this.shine) {
      const m = this.main;
      this.shine = this.scene.add.dynamicBitmapText(0, 0, this.font, m.text, FONTS[this.font].lineHeight).setOrigin(m.originX, m.originY).setBlendMode(Phaser.BlendModes.ADD);
      if (m.originX === 0.5) this.shine.setCenterAlign(); else if (m.originX === 1) this.shine.setRightAlign();
      if (m.maxWidth) this.shine.setMaxWidth(m.maxWidth);
      const half = (GLINT.band * k) / 2, slant = GLINT.slant * k, w = GLYPH_W * k;
      const lit = (x: number): number => gray(1 - Math.abs(x - this.glintX) / half);
      this.shine.setDisplayCallback((d) => {
        d.tint.topLeft = lit(d.x + slant); d.tint.topRight = lit(d.x + w + slant);
        d.tint.bottomLeft = lit(d.x - slant); d.tint.bottomRight = lit(d.x + w - slant);
        return d;
      });
      this.add(this.shine);
      if (this.scene.textures.exists(TEXTURES.glow)) {
        this.spark = this.scene.add.image(0, 0, TEXTURES.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(GLINT.glow * FONTS[this.font].scale).setVisible(false);
        this.add(this.spark);
      }
    }
    const left = -this.textWidth * this.main.originX / this.scaleX, top = -this.textHeight * this.main.originY / this.scaleY;
    const height = this.textHeight / this.scaleY, total = (this.textWidth / this.scaleX) * R;
    this.shine.setVisible(true);
    this.spark?.setVisible(true).setY(top + height * 0.35);
    this.scene.tweens.addCounter({
      from: -GLINT.band * k, to: total + GLINT.band * k, duration: GLINT.ms, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        this.glintX = tw.getValue() ?? 0;
        this.spark?.setX(left + this.glintX / R).setAlpha(GLINT.glowAlpha * Math.sin(tw.progress * Math.PI));
      },
      onComplete: () => { this.shine?.setVisible(false); this.spark?.setVisible(false); this.glintX = -1e9; },
    });
  }
}

/** Раз в every секунд (случайно в пределах) искра пробегает по случайной видимой надписи сцены с shine: true. */
export function startGlints(scene: Phaser.Scene, every: readonly [number, number]): void {
  const next = (): void => {
    scene.time.delayedCall(Phaser.Math.FloatBetween(every[0], every[1]) * 1000, () => {
      const pool = [...shiny].filter((t) => t.scene === scene && t.active && t.visible && t.alpha > 0.5 && t.textWidth > 0 && t.parentContainer?.visible !== false);
      Phaser.Utils.Array.GetRandom(pool)?.glint();
      next();
    });
  };
  next();
}
