import Phaser from 'phaser';
import { COLORS } from '../configs/game';
import { RESOURCES, RESOURCE_INFO, type Cost } from '../configs/items';
import { TEXTURES } from '../configs/assets';
import { session } from '../state/Session';
import { PText } from './PText';

/** Рамка в пиксельном стиле: тёмный контур, золотистая кромка, срезанные углы. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number = COLORS.panel): void {
  g.fillStyle(0x1d1822, 1).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(0xa07c4c, 1).fillRect(x + 2, y + 1, w - 4, h - 2).fillRect(x + 1, y + 2, w - 2, h - 4);
  g.fillStyle(0xd9b878, 1).fillRect(x + 3, y + 2, w - 6, 1).fillRect(x + 2, y + 3, 1, h - 6);
  g.fillStyle(0x6b4f3a, 1).fillRect(x + 3, y + h - 3, w - 6, 1).fillRect(x + w - 3, y + 3, 1, h - 6);
  g.fillStyle(fill, 1).fillRect(x + 4, y + 3, w - 8, h - 6);
  g.fillStyle(0x3a2d44, 1).fillRect(x + 4, y + 3, w - 8, 1);
}

/** Маленькая плашка для HUD. */
export function drawPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.72): void {
  g.fillStyle(0x1d1822, alpha).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(0x4a3a50, alpha).fillRect(x + 1, y + 1, w - 2, 1);
}

/** Ряд «значок + число» для стоимости. Возвращает ширину ряда. Отрисовка слева направо от x. */
export function addCostRow(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, cost: Cost, enabled = true): number {
  let cx = x;
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    if (n <= 0) continue;
    const have = session.data.resources[r];
    const ok = have >= n;
    const icon = scene.add.image(cx, y + 6, TEXTURES.sprites, RESOURCE_INFO[r].icon).setScale(0.75).setOrigin(0, 0.5);
    if (!enabled) icon.setAlpha(0.5);
    parent.add(icon);
    const t = new PText(scene, cx + 13, y + 1, `${n}`, { color: ok ? COLORS.good : COLORS.bad });
    parent.add(t);
    cx += 13 + t.textWidth + 5;
  }
  return cx - x;
}

export function costWidth(cost: Cost): number {
  let w = 0;
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    if (n > 0) w += 13 + `${n}`.length * 7 + 5;
  }
  return w;
}
