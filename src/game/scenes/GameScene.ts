import Phaser from 'phaser';
import { Player } from '../characters/Player';
import { DEFAULT_PLAYER, PLAYER_CHARACTERS } from '../configs/characters';
import { SCENES } from '../configs/game';
import { DEFAULT_LOCATION, LOCATIONS } from '../configs/locations';
import { Arena } from '../locations/Arena';
import { CoinSpawner } from '../systems/CoinSpawner';
import { EnemyManager } from '../systems/EnemyManager';
import { GameOverMenu } from '../ui/GameOverMenu';
import { Hud } from '../ui/Hud';
import { PauseMenu } from '../ui/PauseMenu';

type Mode = 'playing' | 'paused' | 'gameover';

/**
 * Главный экран: арена, игрок, враги, монета и интерфейс.
 * Сцена только собирает всё вместе, а логика живёт в своих папках.
 */
export class GameScene extends Phaser.Scene {
  private arena!: Arena;
  private player!: Player;
  private enemies!: EnemyManager;
  private coins!: CoinSpawner;
  private hud!: Hud;
  private pauseMenu!: PauseMenu;
  private gameOverMenu!: GameOverMenu;

  private coinCount = 0;
  private mode: Mode = 'playing';

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    const location = LOCATIONS[DEFAULT_LOCATION];
    const character = PLAYER_CHARACTERS[DEFAULT_PLAYER];

    this.coinCount = 0;
    this.mode = 'playing';
    this.anims.resumeAll();

    this.arena = new Arena(this, location);
    this.player = new Player(this, location.playerStart.x, location.playerStart.y, character);
    this.enemies = new EnemyManager(this, this.arena, location.enemySpawn);
    this.coins = new CoinSpawner(this, this.arena, location.coinSpawn);

    this.hud = new Hud(this);
    this.hud.setHp(this.player.hp, character.maxHp);
    this.hud.setCoins(0);

    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
    });
    this.gameOverMenu = new GameOverMenu(this, () => this.restart());

    this.enemies.begin(this.player);
    this.coins.spawnIfNone(this.player);
    this.bindKeys();
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'playing') return;

    const dt = Math.min(delta, 50) / 1000;

    this.player.tick(dt, this.arena);
    this.enemies.update(dt, this.player);

    if (this.coins.tryCollect(this.player)) {
      this.coinCount += 1;
      this.hud.setCoins(this.coinCount);
    }

    const attacker = this.enemies.findTouching(this.player);
    if (attacker && this.player.takeDamage(attacker.config.damage)) {
      this.hud.setHp(this.player.hp, this.player.config.maxHp);
      if (this.player.isDead) this.gameOver();
    }
  }

  // ---------- состояния игры ----------

  private pause(): void {
    this.mode = 'paused';
    this.anims.pauseAll();
    this.pauseMenu.show();
  }

  private resume(): void {
    this.mode = 'playing';
    this.anims.resumeAll();
    this.pauseMenu.hide();
  }

  private gameOver(): void {
    this.mode = 'gameover';
    this.anims.pauseAll();
    this.gameOverMenu.show(this.coinCount);
  }

  private restart(): void {
    this.scene.restart();
  }

  // ---------- клавиши ----------

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    const togglePause = (): void => {
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused') this.resume();
    };
    keyboard.on('keydown-ESC', togglePause);
    keyboard.on('keydown-P', togglePause);
    keyboard.on('keydown-R', () => {
      if (this.mode !== 'playing') this.restart();
    });
  }
}
