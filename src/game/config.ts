import Phaser from 'phaser';
import { GAME } from './configs/game';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME.width,
    height: GAME.height,
    backgroundColor: GAME.backgroundColor,
    // Nearest-фильтр сохраняет пиксельные текстуры, дробные координаты — плавность.
    pixelArt: true,
    roundPixels: false,
    // Короткое сглаживание без стартового ограничения времени на 120 кадров.
    // requestAnimationFrame синхронизирует отрисовку с обновлением экрана.
    fps: { target: GAME.targetFps, panicMax: 0, deltaHistory: GAME.frameHistory },
    scene: [BootScene, GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
  };

  return new Phaser.Game(config);
}
