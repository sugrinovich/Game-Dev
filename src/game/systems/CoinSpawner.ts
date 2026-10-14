import Phaser from 'phaser';
import type { Player } from '../characters/Player';
import type { LocationConfig } from '../configs/locations';
import { Coin } from '../items/Coin';
import type { Arena } from '../locations/Arena';
import type { Point } from '../types';

type CoinSpawnConfig = LocationConfig['coinSpawn'];

/**
 * Следит, чтобы на арене была ровно одна монета.
 * Новая появляется только после того, как старую подобрали.
 */
export class CoinSpawner {
  private coin: Coin | null = null;
  private readonly scene: Phaser.Scene;
  private readonly arena: Arena;
  private readonly config: CoinSpawnConfig;

  constructor(scene: Phaser.Scene, arena: Arena, config: CoinSpawnConfig) {
    this.scene = scene;
    this.arena = arena;
    this.config = config;
  }

  /** Создаёт монету, только если на поле её сейчас нет. */
  spawnIfNone(avoid: Point): void {
    if (this.coin) return;

    let point = this.arena.randomPoint(this.config.edgeMargin);
    for (let i = 0; i < 20; i++) {
      if (Phaser.Math.Distance.Between(point.x, point.y, avoid.x, avoid.y) >= this.config.minDistanceFromPlayer) break;
      point = this.arena.randomPoint(this.config.edgeMargin);
    }
    this.coin = new Coin(this.scene, point.x, point.y);
  }

  /** Если игрок коснулся монеты — убирает её, создаёт следующую и возвращает true. */
  tryCollect(player: Player): boolean {
    if (!this.coin) return false;

    const distance = Phaser.Math.Distance.Between(player.x, player.y, this.coin.x, this.coin.y);
    if (distance > player.config.radius + this.coin.radius) return false;

    this.coin.destroy();
    this.coin = null;
    this.spawnIfNone(player);
    return true;
  }
}
