import Phaser from 'phaser';
import { GAME } from './configs/game';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { BaseScene } from './scenes/BaseScene';
import { RoomScene } from './scenes/RoomScene';
import { ExpeditionScene } from './scenes/ExpeditionScene';
import { UIScene } from './scenes/UIScene';
import { attachSmoothPixels } from './systems/SmoothPixels';

/**
 * Увеличение картинки 480x270 так, чтобы на игровой пиксель приходилось целое число ФИЗИЧЕСКИХ пикселей экрана
 * (с учётом масштаба Windows/macOS 125%, 150%, Retina). Иначе пиксели разной ширины и карта «рябит» при прокрутке.
 * Возвращает CSS-пиксели на пиксель игры; холст в GAME.resolution раз больше, поэтому его увеличение — в столько же раз меньше.
 */
function pickZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min(window.innerWidth / GAME.width, window.innerHeight / GAME.height) * dpr;
  // совсем маленькое окно (меньше 480x270 физических пикселей) — только тогда дробно
  return (k >= 1 ? Math.floor(k) : Math.max(0.5, k)) / dpr;
}

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME.width * GAME.resolution,
    height: GAME.height * GAME.resolution,
    backgroundColor: GAME.backgroundColor,
    // Nearest-фильтр сохраняет резкими пиксельные спрайты и bitmap-шрифты.
    pixelArt: true,
    smoothPixelArt: false,
    // спрайты стоят ровно на целых пикселях, как и карта — ничего не «дрожит» друг относительно друга
    roundPixels: true,
    // просим у браузера производительную видеокарту (на ноутбуках с двумя GPU)
    powerPreference: 'high-performance',
    // requestAnimationFrame синхронизирует отрисовку с обновлением экрана.
    fps: { target: GAME.targetFps, panicMax: 0, deltaHistory: GAME.frameHistory },
    scene: [BootScene, PreloadScene, MenuScene, BaseScene, RoomScene, ExpeditionScene, UIScene],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: pickZoom() / GAME.resolution,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // во весь экран уходит сам контейнер — вместе с холстом гладких пикселей
      fullscreenTarget: parent,
    },
    input: { activePointers: 2 },
  };

  const game = new Phaser.Game(config);
  if (GAME.smoothPixels) game.events.once(Phaser.Core.Events.READY, () => attachSmoothPixels(game));
  window.addEventListener('resize', () => {
    game.scale.setZoom(pickZoom() / GAME.resolution);
    game.scale.refresh();
  });
  return game;
}
