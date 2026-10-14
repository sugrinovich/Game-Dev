import Phaser from 'phaser';
import { Player } from '../characters/Player';
import { DEFAULT_PLAYER, PLAYER_CHARACTERS } from '../configs/characters';
import { DEPTH, SCENES } from '../configs/game';
import { DEFAULT_LOCATION, LOCATIONS } from '../configs/locations';
import { Arena } from '../locations/Arena';
import { CoinSpawner } from '../systems/CoinSpawner';
import { EnemyManager } from '../systems/EnemyManager';
import { GameOverMenu } from '../ui/GameOverMenu';
import { Hud } from '../ui/Hud';
import { PauseMenu } from '../ui/PauseMenu';
import { SETTINGS, type WeaponId } from '../configs/settings';
import { Weapons } from '../systems/Weapons';

type Mode = 'playing' | 'paused' | 'selecting' | 'gameover';

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
  private weapons!: Weapons;

  private coinCount = 0;
  private mode: Mode = 'playing';
  private phase = 1;
  private weaponId: WeaponId | null = null;
  private selectionObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    const location = LOCATIONS[DEFAULT_LOCATION];
    const character = PLAYER_CHARACTERS[DEFAULT_PLAYER];

    this.coinCount = 0;
    this.mode = 'playing';
    this.phase = 1;
    this.weaponId = null;
    this.anims.resumeAll();

    this.arena = new Arena(this, location);
    this.player = new Player(this, location.playerStart.x, location.playerStart.y, character);
    this.enemies = new EnemyManager(this, this.arena, location.enemySpawn);
    this.coins = new CoinSpawner(this, this.arena, location.coinSpawn);

    this.hud = new Hud(this);
    this.hud.setHp(this.player.hp, character.maxHp);
    this.hud.setCoins(0);
    this.hud.setPhase(1);

    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
    });
    this.gameOverMenu = new GameOverMenu(this, () => this.restart());

    this.enemies.begin(this.player);
    this.weapons = new Weapons(this, this.enemies, this.player);
    this.coins.spawnIfNone(this.player);
    this.bindKeys();
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'playing') return;

    const dt = Math.min(delta, 50) / 1000;
    const phaseSpeed = this.phase === 2 ? SETTINGS.phaseTwoSpeedMultiplier : 1;

    this.player.tick(dt * phaseSpeed, this.arena);
    this.enemies.update(dt * phaseSpeed, this.player);
    if (this.weaponId) this.weapons.update(dt * phaseSpeed, this.weaponId);

    if (this.coins.tryCollect(this.player)) {
      this.coinCount += 1;
      this.hud.setCoins(this.coinCount);
      if (this.coinCount >= SETTINGS.phaseTwoCoins && this.phase === 1) this.startPhaseTwo();
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

  private startPhaseTwo(): void {
    this.phase = 2;
    this.mode = 'selecting';
    const title = this.add.text(480, 150, 'Фаза 2: выберите оружие', { fontSize: '28px', color: '#f8fafc' }).setOrigin(0.5).setDepth(DEPTH.menu);
    this.selectionObjects.push(title);
    (Object.keys(SETTINGS.weapons) as WeaponId[]).forEach((id, index) => {
      const config = SETTINGS.weapons[id];
      const button = this.add.text(180 + index * 300, 300, `${config.name}\n${config.description}`, { fontSize: '18px', color: '#0f172a', backgroundColor: '#facc15', padding: { x: 14, y: 12 }, align: 'center', wordWrap: { width: 240 } }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(DEPTH.menu);
      button.on('pointerdown', () => this.selectWeapon(id));
      this.selectionObjects.push(button);
    });
  }

  private selectWeapon(id: WeaponId): void {
    this.weaponId = id;
    this.mode = 'playing';
    this.selectionObjects.forEach((object) => object.destroy());
    this.selectionObjects = [];
    this.hud.setPhase(2, SETTINGS.weapons[id].name);
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
