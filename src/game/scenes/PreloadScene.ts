import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { CANVAS_SCALE, COLORS, GAME, SCENES } from '../configs/game';
import { LOCATIONS, ROOM_IDS } from '../configs/items';
import { ENEMY_TYPES, type EnemyTypeId } from '../configs/characters';
import { ensureArrowTexture } from '../characters/Skeleton';
import { PText } from '../ui/PText';
import { drawDiamond, drawPlate, UI } from '../ui/Panel';
import { makePixelFonts, WORLD_FONTS } from '../ui/PixelFont';
import { arenaJobs, castleGroundJobs, castleFrontJobs, castleTextureJobs, HALL_GROUND_KEY, HALL_SIZE, ROOM_SIZE, roomGroundKey } from '../systems/CastleArt';
import { Effects } from '../systems/Effects';
import { heroSheetJobs, STARTER_OUTFIT } from '../systems/HeroArt';
import { effectTextureJobs } from '../systems/MobArt';
import { iconTextureJobs } from '../systems/IconArt';
import { spellTextureJobs } from '../systems/SpellArt';
import { hallTextureJobs } from '../systems/HallModels';
import { audio } from '../systems/Sfx';
import { addTitleLogo, makeTitleBasics, SiegeBackdrop, siegeTextureJobs, TITLE_DEPTH } from '../systems/TitleArt';

const W = GAME.width;
const H = GAME.height;

/**
 * Сколько миллисекунд за кадр отдавать на рисование текстур: остальное время — анимации заставки (кадр при 60 FPS —
 * 16,7 мс, заставка рисуется за 2–3). Задание, которое не успеет в бюджет, ждёт следующего кадра (JOB_GUESS_MS).
 */
const JOB_BUDGET_MS = 14;
/**
 * Новое задание не начинается, если по времени прошлого задания этапа оно не успеет в бюджет кадра: иначе задание
 * на 11 мс, начатое на 11-й мс, растягивало кадр вдвое — заставка дёргалась. Первое задание кадра выполняется всегда.
 */
const JOB_GUESS_MS = 4;
/** Полоса-меч: начало клинка у гарды, середина клинка по высоте, длина клинка; раскалённый край в пикселях. */
const SWORD = { x: 136, y: 124, len: 216, hot: 22 } as const;
/**
 * Устройство без мыши и клавиатуры (телефон, планшет): управления касанием в игре пока нет — вместо «Нажмите любую
 * клавишу» заставка честно говорит, что нужна клавиатура (лекция 5: способ ввода — часть UX).
 */
const TOUCH_ONLY = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true;
const PRESS_TEXT = TOUCH_ONLY ? 'Нужна клавиатура: игра пока только для компьютера' : 'Нажмите любую клавишу';
/**
 * Полоса загрузки плавно догоняет настоящий прогресс (доля готовых заданий): за секунду проходит ease-долю отставания,
 * но не медленнее minSpeed (доля полосы в секунду) — без рывков и остановок, то быстрее, то медленнее. Конец загрузки —
 * когда полоса дошла до конца.
 */
const BAR = { ease: 3, minSpeed: 0.02 } as const;
/** Сцена осады проявляется из темноты, когда её текстуры готовы (мс). */
const BACKDROP_FADE_MS = 700;
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

/**
 * Чьи листы кадров рисуются при загрузке: враги открытых арен и Король Бездны. Остальные (огр арен «в разработке»)
 * нарисуются сами, когда впервые понадобятся (ensureHeroSheet), — огр один занимал четверть загрузки.
 */
function preloadEnemies(): EnemyTypeId[] {
  const open = LOCATIONS.filter((loc) => !loc.soon).flatMap((loc) => loc.mobs);
  return [...new Set<EnemyTypeId>([...open, 'king'])];
}

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
  /** Сколько длилось прошлое задание (мс): по нему решаем, успеет ли следующее в этот кадр. */
  private lastJobMs = JOB_GUESS_MS;
  private finished = false;
  /** Сколько полосы показано (догоняет настоящий прогресс). */
  private shown = 0;
  private leaving = false;
  private fx!: Effects;
  private sword!: Phaser.GameObjects.Graphics;
  private edgeGlow!: Phaser.GameObjects.Image;
  private status!: PText;
  private press!: PText;
  private story!: PText;
  private storyIndex = 0;

  constructor() {
    super({ key: SCENES.preload });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME.backgroundColor).setZoom(CANVAS_SCALE).centerOn(W / 2, H / 2);
    // первый кадр — сразу: логотип, полоса и летопись; сцена осады рисуется первым этапом и проявляется (showBackdrop)
    makeTitleBasics(this);
    this.add.image(0, 0, 'title_vignette').setOrigin(0, 0).setScale(1 / GAME.resolution).setDepth(TITLE_DEPTH.vignette).setAlpha(0.55);
    addTitleLogo(this);
    this.fx = new Effects(this);
    const d = TITLE_DEPTH.ui;
    this.sword = this.add.graphics().setDepth(d);
    this.edgeGlow = this.add.image(SWORD.x, SWORD.y, TEXTURES.glow).setTint(0xff8a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9, 0.5).setDepth(d + 1);
    this.status = new PText(this, W / 2, SWORD.y + 10, '', { ax: 0.5, color: COLORS.text, shine: true }).setDepth(d);
    this.buildStory();
    this.press = new PText(this, W / 2, SWORD.y + 26, PRESS_TEXT, { ax: 0.5, color: COLORS.blade, shine: true }).setDepth(d).setAlpha(0);

    this.stages = this.textureStages();
    this.jobsTotal = this.stages.reduce((n, s) => n + s.jobs.length, 0);
    this.drawSword(0);
  }

  /** Всё, что рисуется кодом, — по этапам с понятными названиями. */
  private textureStages(): Stage[] {
    return [
      { label: 'Разжигаем осаду', jobs: [...siegeTextureJobs(this), () => this.showBackdrop()] },
      { label: 'Возводим стены замка', jobs: [...castleTextureJobs(this), ...hallTextureJobs(this)] },
      {
        label: 'Мостим залы и арены', jobs: [
          ...castleGroundJobs(this, HALL_GROUND_KEY, HALL_SIZE.w, HALL_SIZE.h, 'hall'),
          ...castleFrontJobs(this, HALL_SIZE.w, HALL_SIZE.h, 'hall', null),
          // арены — круглые колизеи; «скоро» — не готовим (их ещё не открыть)
          ...LOCATIONS.filter((loc) => !loc.soon).flatMap((loc) => arenaJobs(this, loc.theme)),
          // комнаты тронного зала: покои, кузня, целебница — со своими стенами и проёмом в зал
          ...ROOM_IDS.flatMap((id) => castleGroundJobs(this, roomGroundKey(id), ROOM_SIZE.w, ROOM_SIZE.h, id)),
          ...ROOM_IDS.flatMap((id) => castleFrontJobs(this, ROOM_SIZE.w, ROOM_SIZE.h, id, ROOM_SIZE.w / 2)),
        ],
      },
      // заранее — стартовая одежда; другие наборы рисуются при переодевании (около 30 мс, в окне инвентаря — на паузе)
      { label: 'Куём доспехи героя', jobs: heroSheetJobs(this, STARTER_OUTFIT) },
      { label: 'Собираем орду Бездны', jobs: preloadEnemies().flatMap((id) => heroSheetJobs(this, ENEMY_TYPES[id].outfit, ENEMY_TYPES[id].body)) },
      { label: 'Чеканим монеты и гербы', jobs: iconTextureJobs(this) },
      { label: 'Закаляем клинки', jobs: effectTextureJobs(this) },
      { label: 'Заговариваем свитки', jobs: spellTextureJobs(this) },
      { label: 'Точим стрелы', jobs: [() => ensureArrowTexture(this), ...WORLD_FONTS.map((key) => () => makePixelFonts(this, [key]))] },
    ];
  }

  /** Сцена осады готова: появляется под логотипом, из темноты. */
  private showBackdrop(): void {
    new SiegeBackdrop(this);   // живая сцена: орда идёт, лучники стреляют, Короли мечут огонь (текстуры уже готовы)
    const cover = this.add.rectangle(0, 0, W, H, GAME.backgroundColor).setOrigin(0, 0).setDepth(TITLE_DEPTH.vignette - 1);
    this.tweens.add({ targets: cover, alpha: 0, duration: BACKDROP_FADE_MS, ease: 'Sine.easeOut', onComplete: () => cover.destroy() });
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
    let ran = false;
    while (this.stageIndex < this.stages.length) {
      const elapsed = performance.now() - start;
      if (ran && elapsed + this.lastJobMs > JOB_BUDGET_MS) break;
      const stage = this.stages[this.stageIndex]!;
      const job = stage.jobs.shift();
      if (!job) { this.stageIndex++; this.lastJobMs = JOB_GUESS_MS; continue; }
      const t0 = performance.now();
      job();
      this.lastJobMs = performance.now() - t0;
      this.jobsDone++;
      ran = true;
    }
    const target = this.jobsTotal ? this.jobsDone / this.jobsTotal : 1;
    if (this.stageIndex >= this.stages.length && this.shown >= target) { this.finish(); return; }
    this.shown = Math.min(target, this.shown + Math.max(BAR.minSpeed * dt, (target - this.shown) * (1 - Math.exp(-BAR.ease * dt))));
    this.drawSword(this.shown);
    const stage = this.stages[Math.min(this.stageIndex, this.stages.length - 1)]!;
    this.status.setText(`${stage.label}… ${Math.floor(this.shown * 100)}%`);
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
    const forged = len * Phaser.Math.Clamp(v, 0, 1);   // без округления: клинок растёт плавно, а не по пикселю
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
}
