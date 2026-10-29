/** Отступы стен замка от краёв карты: слева/справа, сверху (стена с окнами), снизу. */
export interface MapEdges { side: number; top: number; bottom: number }

/**
 * Границы карты: за стенами пройти нельзя. Препятствия внутри зала и арен
 * (колонны, жаровни, постройки) — круги в Colliders.
 */
export class MapBounds {
  constructor(readonly width: number, readonly height: number, readonly edges: MapEdges) {}

  /** Точка за стенами? */
  isBlocked(x: number, y: number): boolean {
    const e = this.edges;
    return x < e.side || x > this.width - e.side || y < e.top || y > this.height - e.bottom;
  }
}
