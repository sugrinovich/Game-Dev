import type { Point } from '../types';
import type { Terrain } from './Terrain';

export interface Circle { x: number; y: number; r: number }

const CELL = 32;
const key = (cx: number, cy: number): number => (cx + 64) * 4096 + (cy + 64);

/** Неподвижные препятствия (стволы, камни, постройки) в сетке — быстрый поиск соседей. */
export class Colliders {
  private readonly cells = new Map<number, Circle[]>();

  add(x: number, y: number, r: number): Circle {
    const c = { x, y, r };
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const k = key(cx, cy);
      const list = this.cells.get(k);
      if (list) list.push(c); else this.cells.set(k, [c]);
    }
    return c;
  }

  remove(c: Circle): void {
    const x0 = Math.floor((c.x - c.r) / CELL), x1 = Math.floor((c.x + c.r) / CELL);
    const y0 = Math.floor((c.y - c.r) / CELL), y1 = Math.floor((c.y + c.r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const list = this.cells.get(key(cx, cy));
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
  }

  overlaps(x: number, y: number, r: number): boolean {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const list = this.cells.get(key(cx, cy));
      if (!list) continue;
      for (const c of list) {
        const rr = c.r + r;
        if ((c.x - x) ** 2 + (c.y - y) ** 2 < rr * rr) return true;
      }
    }
    return false;
  }
}

/** Двигает круг по карте: упирается в препятствия и воду, но скользит вдоль них. */
export function moveCircle(e: Point, dx: number, dy: number, r: number, flying: boolean, colliders: Colliders, terrain: Terrain): boolean {
  const W = terrain.spec.width, H = terrain.spec.height;
  if (flying) {
    e.x = Math.min(W - 6, Math.max(6, e.x + dx));
    e.y = Math.min(H - 6, Math.max(6, e.y + dy));
    return false;
  }
  const blockedAt = (x: number, y: number): boolean =>
    terrain.isBlocked(x, y) || terrain.isBlocked(x - r * 0.8, y) || terrain.isBlocked(x + r * 0.8, y) || colliders.overlaps(x, y, r);
  const stuck = blockedAt(e.x, e.y);
  let blocked = false;
  if (dx !== 0) {
    if (stuck || !blockedAt(e.x + dx, e.y)) e.x += dx; else blocked = true;
  }
  if (dy !== 0) {
    if (stuck || !blockedAt(e.x, e.y + dy)) e.y += dy; else blocked = true;
  }
  return blocked;
}
