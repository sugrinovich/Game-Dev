import type { Point } from '../types';

/** Отступы стен замка от краёв карты: слева/справа, сверху (стена с окнами), снизу. */
export interface MapEdges { side: number; top: number; bottom: number }
/** Круглая арена: эллипс пола на карте (середина и полуоси) — за ним стена колизея. */
export interface MapOval { cx: number; cy: number; rx: number; ry: number }

/**
 * Границы карты: за стенами пройти нельзя. Препятствия внутри зала и арен
 * (колонны, жаровни, постройки) — круги в Colliders.
 */
export class MapBounds {
  constructor(readonly width: number, readonly height: number, readonly edges: MapEdges, readonly oval?: MapOval) {}

  /** Точка за стенами? */
  isBlocked(x: number, y: number): boolean {
    const e = this.edges, o = this.oval;
    if (o && ((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2 > 1) return true;
    return x < e.side || x > this.width - e.side || y < e.top || y > this.height - e.bottom;
  }

  /** Точку за краем круглой арены — обратно на край (для летающих). */
  pullInside(p: Point): void {
    const o = this.oval;
    if (!o) return;
    const k = Math.hypot((p.x - o.cx) / o.rx, (p.y - o.cy) / o.ry);
    if (k > 1) { p.x = o.cx + (p.x - o.cx) / k; p.y = o.cy + (p.y - o.cy) / k; }
  }
}
