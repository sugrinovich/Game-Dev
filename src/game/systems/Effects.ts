import Phaser from 'phaser';
import { textureResolution } from './CastleModels';
import { COLORS, DEPTH } from '../configs/game';
import { TEXTURES } from '../configs/assets';
import { PText } from '../ui/PText';

interface Part {
  img: Phaser.GameObjects.Image;
  vx: number; vy: number; gy: number; life: number; max: number; endScale: number; baseScale: number; drag: number;
}

export interface BurstOptions {
  x: number; y: number; count: number;
  speed?: [number, number]; angle?: [number, number];
  life?: [number, number]; gravity?: number; size?: [number, number];
  tints?: number[]; drag?: number; endScale?: number; depth?: number; blend?: Phaser.BlendModes;
}

/** Мелкие эффекты: частицы, вспышки, всплывающие числа. Частицы — простые картинки без внешних плагинов. */
export class Effects {
  private readonly parts: Part[] = [];
  /** Погасшие частицы не удаляются, а ждут повторного использования: меньше мусора — ровнее 60 кадров. */
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  burst(o: BurstOptions): void {
    const [s0, s1] = o.speed ?? [20, 60];
    const [a0, a1] = o.angle ?? [0, Math.PI * 2];
    const [l0, l1] = o.life ?? [0.3, 0.6];
    const [z0, z1] = o.size ?? [1, 2];
    const tints = o.tints ?? [0xffffff];
    for (let i = 0; i < o.count; i++) {
      const a = Phaser.Math.FloatBetween(a0, a1);
      const sp = Phaser.Math.FloatBetween(s0, s1);
      const life = Phaser.Math.FloatBetween(l0, l1);
      const sc = Phaser.Math.FloatBetween(z0, z1) / DOT_SIZE;   // HD: частица — мягкая круглая точка
      const img = (this.pool.pop() ?? this.scene.add.image(0, 0, TEXTURES.dot)).setPosition(o.x, o.y).setVisible(true).setAlpha(1)
        .setTint(Phaser.Utils.Array.GetRandom(tints)).setScale(sc).setDepth(o.depth ?? DEPTH.fx).setBlendMode(o.blend ?? Phaser.BlendModes.NORMAL);
      this.parts.push({ img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gy: o.gravity ?? 0, life, max: life, endScale: o.endScale ?? 0, baseScale: sc, drag: o.drag ?? 0 });
    }
  }

  update(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.img.setVisible(false); this.pool.push(p.img);
        this.parts[i] = this.parts[this.parts.length - 1]!; this.parts.pop();
        continue;
      }
      p.vy += p.gy * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.img.x += p.vx * dt; p.img.y += p.vy * dt;
      const t = p.life / p.max;
      p.img.setScale(p.endScale + (p.baseScale - p.endScale) * t).setAlpha(Math.min(1, t * 2));
    }
  }

  /** Проигрывает разовую анимацию эффекта (лист с тем же ключом) и удаляет спрайт. */
  anim(x: number, y: number, key: string, scale = 1, depth: number = DEPTH.fx, tint?: number): Phaser.GameObjects.Sprite {
    const s = this.scene.add.sprite(x, y, key, '0').setDepth(depth);
    s.setScale(scale / textureResolution(s.texture));   // эффекты нарисованы в HD
    s.setOrigin(0.5, 0.5);
    if (tint !== undefined) s.setTint(tint);
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    return s;
  }

  hitSpark(x: number, y: number): void { this.anim(x, y, 'spark'); }
  dust(x: number, y: number): void { this.anim(x, y + 2, 'dust', 1, y + 1); }
  poof(x: number, y: number, scale = 1): void { this.anim(x, y - 4, 'poof', scale); }

  floatText(x: number, y: number, text: string, color: number = COLORS.text, big = false): void {
    const t = new PText(this.scene, x, y, text, { ax: 0.5, ay: 1, color, font: big ? 'worldBig' : 'world' }).setDepth(DEPTH.fx + 5);
    this.scene.tweens.add({ targets: t, y: y - 16, duration: 650, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 380, duration: 270, onComplete: () => t.destroy() });
  }

  glow(x: number, y: number, scale: number, tint: number, alpha: number): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, TEXTURES.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale).setAlpha(alpha);
  }

  /** Круг-предупреждение на земле (удар босса, появление моба). */
  ring(x: number, y: number, radius: number, color: number, seconds: number): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.decals + 1);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state, t: 1, duration: seconds * 1000,
      onUpdate: () => {
        g.clear();
        g.lineStyle(1, color, 0.9).strokeCircle(x, y, radius);
        g.fillStyle(color, 0.12 + 0.25 * state.t).fillCircle(x, y, radius * (0.3 + 0.7 * state.t));
      },
      onComplete: () => g.destroy(),
    });
  }

  clear(): void {
    for (const p of this.parts) p.img.destroy();
    for (const img of this.pool) img.destroy();
    this.parts.length = 0; this.pool.length = 0;
  }
}

/** Сторона текстуры частицы (пикселей холста): частица size пикселей игры показывается с масштабом size / DOT_SIZE. */
const DOT_SIZE = 8;

/** Создаёт служебные текстуры: точка, мягкая точка частиц, свечение, тень. */
export function makeUtilityTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (!tm.exists(TEXTURES.dot)) {
    const c = tm.createCanvas(TEXTURES.dot, DOT_SIZE, DOT_SIZE);
    if (c) {
      const ctx = c.getContext(), r = DOT_SIZE / 2, g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, DOT_SIZE, DOT_SIZE); c.refresh();
    }
  }
  if (!tm.exists(TEXTURES.px)) {
    const c = tm.createCanvas(TEXTURES.px, 2, 2);
    if (c) { const ctx = c.getContext(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2, 2); c.refresh(); }
  }
  if (!tm.exists(TEXTURES.glow)) {
    const c = tm.createCanvas(TEXTURES.glow, 64, 64);
    if (c) {
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); c.refresh();
    }
  }
  if (!tm.exists(TEXTURES.shadow)) {
    const c = tm.createCanvas(TEXTURES.shadow, 32, 12);
    if (c) {
      const ctx = c.getContext();
      ctx.fillStyle = 'rgba(20,12,28,0.38)';
      for (let y = 0; y < 12; y++) {
        const k = 1 - Math.pow((y - 5.5) / 6, 2);
        const w = Math.round(32 * Math.sqrt(Math.max(0, k)));
        ctx.fillRect(16 - w / 2, y, w, 1);
      }
      c.refresh();
    }
  }
}
