import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS, GAME, GLINT_EVERY, SCENES } from '../configs/game';
import { LOCATIONS, ROOM_IDS } from '../configs/items';
import { ENEMY_TYPES } from '../configs/characters';
import { ensureArrowTexture } from '../characters/Skeleton';
import { PText, startGlints } from '../ui/PText';
import { drawDiamond, drawPlate, UI } from '../ui/Panel';
import { ARENA_SIZE, arenaGroundKey, castleGroundJobs, castleFrontJobs, castleTextureJobs, HALL_GROUND_KEY, HALL_SIZE, ROOM_SIZE, roomGroundKey } from '../systems/CastleArt';
import { Effects } from '../systems/Effects';
import { heroSheetJobs, STARTER_OUTFIT } from '../systems/HeroArt';
import { effectTextureJobs } from '../systems/MobArt';
import { iconTextureJobs } from '../systems/IconArt';
import { hallTextureJobs } from '../systems/HallModels';
import { audio } from '../systems/Sfx';
import { addTitleLogo, SiegeBackdrop, TITLE_DEPTH } from '../systems/TitleArt';

const W = GAME.width;
const H = GAME.height;

/** Сколько миллисекунд за кадр отдавать на рисование текстур: остальное время — анимации заставки (60 FPS). */
const JOB_BUDGET_MS = 6;
/** Полоса-меч: начало клинка у гарды, середина клинка по высоте, длина клинка; раскалённый край в пикселях. */
const SWORD = { x: 136, y: 124, len: 216, hot: 22 } as const;
/** Как часто сменяется строка летописи или совета внизу (с). */
const STORY_EVERY = 3.6;

const CHRONICLE = [
  'Год Пепельной луны. Над долиной разверзлась Бездна.',
  'Её короли ведут орков, огров и мёртвых к замку.',
  'Гарнизон пал. У ворот — последний рыцарь.',
  'В шортах и с палкой. Но клинок куётся в бою.',
];

const TIPS = [
  'Торговец внизу зала продаёт снаряжение за монеты.',
  'I — инвентарь. Купленные вещи нужно надеть.',
  'Рывок (SHIFT) даёт миг неуязвимости — и от стрел тоже.',
  'Скелет-мечник краснеет перед ударом — отступите.',
  'Лучник держит дистанцию: подберитесь вплотную.',
  'Победите все волны и босса, чтобы открыть следующую арену.',
  'Монеты сохраняются даже при поражении.',
  'Казначейство добавляет монеты за каждого врага.',
];

/** Этап загрузки: подпись на экране и задания на отрисовку. */
interface Stage { label: string; jobs: (() => void)[] }

/**
 * Экран загрузки «Осада Бездны»: живая заставка, меч-полоса, который куют от гарды к острию,
 * и одна строка внизу — летопись осады, затем советы. Файлов нет — все текстуры рисуются здесь понемногу каждый кадр, без подвисаний.
 * В конце ждёт нажатия: так браузер разрешает звук, и в меню сразу играет музыка.
 */
export class PreloadScene extends Phaser.Scene {
  private stages: Stage[] = [];
  private stageIndex = 0;
  private jobsTotal = 0;
  private jobsDone = 0;
  private finished = false;
  private leaving = false;
  private fx!: Effects;
  private sword!: Phaser.GameObjects.Graphics;
  private edgeGlow!: Phaser.GameObjects.Image;
  private status!: PText;
  private press!: PText;
  private story!: PText;
  private storyIndex = 0;
  private sparkT = 0;

  constructor() {
    super({ key: SCENES.preload });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME.backgroundColor).setZoom(GAME.resolution).centerOn(W / 2, H / 2);
    new SiegeBackdrop(this);
    this.add.image(0, 0, 'title_vignette').setOrigin(0, 0).setDepth(TITLE_DEPTH.vignette).setAlpha(0.55);
    addTitleLogo(this);
    this.fx = new Effects(this);
    const d = TITLE_DEPTH.ui;
    this.sword = this.add.graphics().setDepth(d);
    this.edgeGlow = this.add.image(SWORD.x, SWORD.y, TEXTURES.glow).setTint(0xff8a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9, 0.5).setDepth(d + 1);
    this.status = new PText(this, W / 2, SWORD.y + 10, '', { ax: 0.5, color: COLORS.text, shine: true }).setDepth(d);
    startGlints(this, GLINT_EVERY.menu);
    this.buildStory();
    this.press = new PText(this, W / 2, SWORD.y + 26, 'Нажмите любую клавишу', { ax: 0.5, color: COLORS.blade, shine: true }).setDepth(d).setAlpha(0);

    this.stages = this.textureStages();
    this.jobsTotal = this.stages.reduce((n, s) => n + s.jobs.length, 0);
    this.drawSword(0);
  }

  /** Всё, что рисуется кодом, — по этапам с понятными названиями. */
  private textureStages(): Stage[] {
    return [
      { label: 'Возводим стены замка', jobs: [...castleTextureJobs(this), ...hallTextureJobs(this)] },
      {
        label: 'Мостим залы и арены', jobs: [
          ...castleGroundJobs(this, HALL_GROUND_KEY, HALL_SIZE.w, HALL_SIZE.h, 'hall'),
          ...castleFrontJobs(this, HALL_SIZE.w, HALL_SIZE.h, 'hall', null),
          // арены: четыре сплошные стены
          ...LOCATIONS.flatMap((loc) => [
            ...castleGroundJobs(this, arenaGroundKey(loc.theme), ARENA_SIZE.w, ARENA_SIZE.h, loc.theme),
            ...castleFrontJobs(this, ARENA_SIZE.w, ARENA_SIZE.h, loc.theme, null),
          ]),
          // комнаты тронного зала: покои, кузня, целебница — со своими стенами и проёмом в зал
          ...ROOM_IDS.flatMap((id) => castleGroundJobs(this, roomGroundKey(id), ROOM_SIZE.w, ROOM_SIZE.h, id)),
          ...ROOM_IDS.flatMap((id) => castleFrontJobs(this, ROOM_SIZE.w, ROOM_SIZE.h, id, ROOM_SIZE.w / 2)),
        ],
      },
      // заранее — стартовая одежда; другие наборы рисуются при переодевании (около 30 мс, в окне инвентаря — на паузе)
      { label: 'Куём доспехи героя', jobs: heroSheetJobs(this, STARTER_OUTFIT) },
      { label: 'Собираем орду Бездны', jobs: Object.values(ENEMY_TYPES).flatMap((e) => heroSheetJobs(this, e.outfit, e.body)) },
      { label: 'Чеканим монеты и гербы', jobs: iconTextureJobs(this) },
      { label: 'Закаляем клинки', jobs: effectTextureJobs(this) },
      { label: 'Точим стрелы', jobs: [() => ensureArrowTexture(this)] },
    ];
  }

  /** Одна строка внизу: сначала по очереди летопись осады, потом советы — сменяются с плавным затуханием. */
  private buildStory(): void {
    const d = TITLE_DEPTH.ui;
    const lines = [...CHRONICLE, ...TIPS.map((t) => `Совет: ${t}`)];
    drawPlate(this.add.graphics().setDepth(d), 0, H - 16, W, 16, 0.75);
    this.story = new PText(this, W / 2, H - 14, lines[0]!, { ax: 0.5, color: COLORS.text, shine: true }).setDepth(d);
    this.time.addEvent({
      delay: STORY_EVERY * 1000, loop: true,
      callback: () => this.tweens.add({
        targets: this.story, alpha: 0, duration: 250, yoyo: true,
        onYoyo: () => {
          // летопись — один раз по порядку, дальше по кругу только советы
          this.storyIndex = this.storyIndex + 1 < lines.length ? this.storyIndex + 1 : CHRONICLE.length;
          const line = lines[this.storyIndex]!;
          this.story.setText(line).setColor(this.storyIndex < CHRONICLE.length ? COLORS.text : COLORS.dim);
        },
      }),
    });
  }

  override update(_t: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.fx.update(dt);
    if (this.finished) return;
    const start = performance.now();
    while (this.stageIndex < this.stages.length && performance.now() - start < JOB_BUDGET_MS) {
      const stage = this.stages[this.stageIndex]!;
      const job = stage.jobs.shift();
      if (job) { job(); this.jobsDone++; } else this.stageIndex++;
    }
    const v = this.jobsTotal ? this.jobsDone / this.jobsTotal : 1;
    this.drawSword(v);
    this.forgeSparks(dt, v);
    const stage = this.stages[this.stageIndex];
    if (stage) { this.status.setText(`${stage.label}… ${Math.round(v * 100)}%`); return; }
    this.finish();
  }

  /** Всё готово: клинок выкован, ждём нажатия (заодно браузер разрешает звук). */
  private finish(): void {
    this.finished = true;
    this.drawSword(1);
    this.edgeGlow.setVisible(false);
    this.status.setText('Клинок выкован. Ворота замка открыты!').setColor(COLORS.gold);
    this.fx.burst({ x: SWORD.x + SWORD.len, y: SWORD.y, count: 24, speed: [20, 80], life: [0.4, 0.9], size: [1, 3], tints: [0xffffff, 0xfff0a0, 0xc8d0dc], gravity: 60, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.ui + 2 });
    this.tweens.add({ targets: this.press, alpha: { from: 0, to: 1 }, duration: 600, yoyo: true, repeat: -1, hold: 400 });
    const go = (): void => {
      if (this.leaving) return;
      this.leaving = true;
      audio.init(); audio.play('portal');
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.menu));
    };
    this.input.keyboard?.once('keydown', go);
    this.input.once('pointerdown', go);
  }

  /** Меч-полоса: тёмная заготовка, выкованная сталь с долом, раскалённый край; гарда, рукоять, навершие. */
  private drawSword(v: number): void {
    const g = this.sword, { x, y, len, hot } = SWORD;
    const forged = Math.round(len * Phaser.Math.Clamp(v, 0, 1));
    g.clear();
    g.fillStyle(UI.ironDark, 1).fillRect(x - 1, y - 3, len + 2, 7).fillTriangle(x + len, y - 3, x + len + 9, y + 0.5, x + len, y + 4);
    g.fillStyle(0x2a2a34, 1).fillRect(x, y - 2, len, 5);
    g.fillStyle(v >= 1 ? 0xc8d0dc : 0x2a2a34, 1).fillTriangle(x + len, y - 2, x + len + 7, y + 0.5, x + len, y + 3);
    g.fillStyle(0xa8b0bc, 1).fillRect(x, y - 2, forged, 5);
    g.fillStyle(0xe8eef4, 1).fillRect(x, y - 2, forged, 1);
    g.fillStyle(0x6a7282, 1).fillRect(x, y, forged, 1);
    g.fillStyle(0x525a6a, 1).fillRect(x, y + 2, forged, 1);
    if (v < 1) {
      for (let i = 0; i < hot && i < forged; i++) {
        const k = i / hot;   // 0 — у самого края, 1 — уже остыло
        const color = k < 0.15 ? 0xfff6c0 : k < 0.35 ? 0xffd060 : k < 0.6 ? 0xff8a2a : 0xc83a1a;
        g.fillStyle(color, 1 - k * 0.7).fillRect(x + forged - 1 - i, y - 2, 1, 5);
      }
    }
    // гарда, рукоять с обмоткой, навершие
    g.fillStyle(UI.ironDark, 1).fillRect(x - 4, y - 7, 4, 15);
    g.fillStyle(UI.gold, 1).fillRect(x - 3, y - 6, 2, 13);
    g.fillStyle(UI.goldLight, 1).fillRect(x - 3, y - 6, 1, 13);
    g.fillStyle(UI.ironDark, 1).fillRect(x - 15, y - 2, 11, 5);
    g.fillStyle(0x6a4630, 1).fillRect(x - 14, y - 1, 9, 3);
    g.fillStyle(0x4a3020, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x - 13 + i * 2, y - 1, 1, 3);
    drawDiamond(g, x - 18, y);
    this.edgeGlow.setPosition(x + forged, y);
  }

  /** Искры летят из-под молота у раскалённого края. */
  private forgeSparks(dt: number, v: number): void {
    if (v >= 1 || (this.sparkT -= dt) > 0) return;
    this.sparkT = 0.07;
    this.fx.burst({
      x: SWORD.x + Math.round(SWORD.len * v), y: SWORD.y, count: 2, speed: [20, 70], angle: [-Math.PI, 0], life: [0.25, 0.5],
      size: [1, 2], tints: [0xfff6c0, 0xffd060, 0xff8a2a], gravity: 160, blend: Phaser.BlendModes.ADD, depth: TITLE_DEPTH.ui + 2,
    });
  }
}
