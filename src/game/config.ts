import Phaser from 'phaser';
import { GAME } from './configs/game';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { BaseScene } from './scenes/BaseScene';
import { ExpeditionScene } from './scenes/ExpeditionScene';
import { UIScene } from './scenes/UIScene';

/** Целое число раз увеличиваем картинку 480x270 — пиксели остаются ровными квадратами. */
function pickZoom(): number {
  const k = Math.min(window.innerWidth / GAME.width, window.innerHeight / GAME.height);
  // Маленькие окна растягиваем дробно, чтобы игра не была крошечной; от x2 и выше — только целые.
  return k >= 2 ? Math.floor(k) : Math.max(0.5, k);
}

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME.width,
    height: GAME.height,
    backgroundColor: GAME.backgroundColor,
    // Nearest-фильтр сохраняет пиксельные текстуры; roundPixels убирает «дрожание» на дробных координатах.
    pixelArt: true,
    roundPixels: true,
    // requestAnimationFrame синхронизирует отрисовку с обновлением экрана.
    fps: { target: GAME.targetFps, panicMax: 0, deltaHistory: GAME.frameHistory },
    scene: [BootScene, PreloadScene, MenuScene, BaseScene, ExpeditionScene, UIScene],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: pickZoom(),
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
  };

  const game = new Phaser.Game(config);
  window.addEventListener('resize', () => {
    game.scale.setZoom(pickZoom());
    game.scale.refresh();
  });
  return game;
}
