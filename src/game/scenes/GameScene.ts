import Phaser from 'phaser';
import { Player } from '../characters/Player';
import { DEFAULT_PLAYER, PLAYER_CHARACTERS } from '../configs/characters';
import { SCENES } from '../configs/game';
import { EnemyManager } from '../systems/EnemyManager';

const MAX_FRAME_DELTA_MS = 50;

/** Только персонаж и мобы; камера неподвижна, поле равно размеру окна. */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: EnemyManager;
  private paused = false;

  constructor() { super(SCENES.game); }

  create(): void {
    this.paused = false;
    this.anims.resumeAll();
    this.cameras.main.setScroll(0, 0).setRoundPixels(false);
    this.player = new Player(this, this.scale.width / 2, this.scale.height / 2,
      PLAYER_CHARACTERS[DEFAULT_PLAYER]);
    this.enemies = new EnemyManager(this);
    this.enemies.begin(this.player);

    const keyboard = this.input.keyboard;
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (event.code === 'KeyF') {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
      }
      if (event.code === 'KeyR') this.scene.restart();
      if (event.code === 'Escape' || event.code === 'KeyP') this.setPaused(!this.paused);
    };
    const onBlur = (): void => this.setPaused(true);
    keyboard?.on('keydown', onKey);
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown', onKey);
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.anims.resumeAll();
    });
  }

  update(_time: number, delta: number): void {
    if (this.paused) return;
    const dt = Math.min(delta, MAX_FRAME_DELTA_MS) / 1000;
    this.player.tick(dt);
    this.enemies.update(dt, this.player);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.anims.pauseAll();
    else this.anims.resumeAll();
  }
}
