import Phaser from 'phaser';
import { outfitFor } from '../characters/Player';
import { COLORS, DEPTH, GAME, KEYS, MOUSE_LABEL } from '../configs/game';
import type { PlayerDirection } from '../configs/assets';
import { ensureHeroSheet, FIGURE_SCALE, heroAnimKey, heroAttackFrame, heroOrigin, STARTER_OUTFIT } from '../systems/HeroArt';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { RARITIES } from '../configs/items';
import { buttonTextY, drawButton, drawDropdown, drawPanel, drawRowHighlight, drawTitleRibbon, UI } from './Panel';
import { EQUIPMENT } from '../configs/items';
import { PText } from './PText';

/*
 * Обучающая карточка: показывается один раз (session.firstTime) — при первом входе в зал, первом открытии
 * инвентаря и сундука; снова — из меню («Обучение»). Вверху — живой пример, как маленькое видео: наш рыцарь ходит,
 * бьёт и делает рывок (клавиши подсвечиваются в такт), или курсор перекладывает вещь. Ниже — клавиши и что они делают.
 * Закрывается кнопкой «Понятно» или клавишей E.
 */

export type TipId = 'controls' | 'inventory' | 'chest';
/** Пример вверху карточки: рыцарь в деле, меч из карманов в сумку (с поворотом), вещь из карманов в сундук. */
type Demo = 'hero' | 'bag' | 'chest';
interface TipSpec { title: string; menu: string; demo: Demo; keys: readonly (readonly [string, string])[]; note?: string }

export const TIP_IDS: readonly TipId[] = ['controls', 'inventory', 'chest'];
export const TIPS: Record<TipId, TipSpec> = {
  controls: {
    title: 'Управление', menu: 'Основные кнопки', demo: 'hero',
    keys: [
      [`${KEYS.up.label} ${KEYS.left.label} ${KEYS.down.label} ${KEYS.right.label}`, 'ходьба'], [KEYS.attack.label, 'удар'], [KEYS.dash.label, 'рывок'],
      [KEYS.interact.label, 'действие'], [KEYS.potion.label, 'эликсир'], [KEYS.inventory.label, 'инвентарь'], [KEYS.menu.label, 'меню'],
    ],
  },
  inventory: {
    title: 'Инвентарь', menu: 'Инвентарь', demo: 'bag',
    keys: [[MOUSE_LABEL, 'перетащить вещь'], [KEYS.rotate.label, 'повернуть вещь в руке'], [KEYS.inventory.label, 'открыть и закрыть']],
    note: 'Действует то, что надето или лежит в сумке. Кнопка «Оружие в руке» — что держать в руке.',
  },
  chest: {
    title: 'Сундук', menu: 'Сундук', demo: 'chest',
    keys: [[MOUSE_LABEL, 'переложить вещь в сундук и обратно']],
    note: 'Вещи в сундуке не занимают карманы. Сундук можно расширять.',
  },
};

/**
 * Размеры: ширина окна, поля, отступ сверху (под лентой), высота примера (с рыцарем — выше), строка клавиш,
 * клетка в примере, высота клавиши, отступ подписи над клетками, кнопка «Понятно», зазор между клавишей и подписью.
 */
const CARD = { w: 320, pad: 14, title: 24, demoH: 58, heroDemoH: 72, bagDemoH: 83, row: 18, cell: 22, cap: 13, label: 15, btnW: 84, btnH: 16, capGap: 6 } as const;
/** Больше стольких клавиш — в две колонки, чтобы карточка помещалась на экране. */
const ONE_COLUMN_MAX = 4;
/** Пример с переносом вещи длится столько секунд и повторяется по кругу. */
const DEMO_LOOP = 3.2;

/**
 * «Видео» рыцаря: отрезки по очереди — какая клавиша нажата (номер строки клавиш, -1 — никакая), куда смотрит,
 * скорость по x и y (в долях HERO_DEMO.speed), удар или нет, сколько длится (с). Путь замкнут: рыцарь возвращается.
 */
const HERO_DEMO = { speed: 40, scale: 1.25, start: { x: -24, y: 40 } } as const;
interface Shot { cap: number; dir: PlayerDirection; vx: number; vy: number; attack?: boolean; dur: number }
const SHOTS: readonly Shot[] = [
  { cap: 0, dir: 'right', vx: 1, vy: 0, dur: 1.2 },
  { cap: 0, dir: 'down', vx: 0, vy: 1, dur: 0.6 },
  { cap: 1, dir: 'down', vx: 0, vy: 0, attack: true, dur: 0.45 },
  { cap: 0, dir: 'left', vx: -1, vy: 0, dur: 0.6 },
  { cap: 2, dir: 'left', vx: -3, vy: 0, dur: 0.2 },
  { cap: 0, dir: 'up', vx: 0, vy: -1, dur: 0.6 },
  { cap: -1, dir: 'down', vx: 0, vy: 0, dur: 0.6 },
];
const SHOTS_LENGTH = SHOTS.reduce((sum, s) => sum + s.dur, 0);
/** Клавиша в списке: рамка, подпись (при нажатии опускается вместе с клавишей), где стоит. */
interface Cap { g: Phaser.GameObjects.Graphics; label: PText; x: number; y: number; w: number; labelY: number }
/**
 * Пример сумки: клетка, сетка сумки, поле снизу и по бокам, длина цикла (с); доли цикла: курсор взял меч из карманов,
 * донёс до сумки, R — поворот (начало и конец), меч положен.
 */
const BAG_DEMO = { cell: 18, cols: 5, rows: 3, margin: 8, side: 16, loop: 4.4, pick: 0.2, over: 0.42, turn: [0.5, 0.62], drop: 0.72 } as const;
/**
 * Вторая сцена примера инвентаря: курсор жмёт «Оружие в руке», в списке выбирает старый меч — герой берёт его в руку.
 * Длина (с), доли цикла: нажата кнопка, открыт список, курсор на мече, меч в руке; размеры кнопки и списка, где герой.
 */
const HAND_DEMO = { loop: 4, press: 0.2, open: 0.27, over: 0.48, take: 0.56, btnW: 80, btnH: 14, row: 15, menuW: 90, pad: 3, heroX: 70 } as const;
/** Меч в руке над сумкой: зелёный — помещается (как в окне инвентаря). */
const HELD_FIT = { fill: 0x2f6a3a, edge: 0x5ae07a } as const;

export class TutorialCard {
  private readonly box: Phaser.GameObjects.Container;
  private readonly demoG: Phaser.GameObjects.Graphics;
  private readonly caps: Cap[] = [];
  private item: Phaser.GameObjects.Image | null = null;
  private cursorG: Phaser.GameObjects.Graphics | null = null;
  private hero: Phaser.GameObjects.Sprite | null = null;
  /** Пример инвентаря: что видно в сцене с сумкой и в сцене «Оружие в руке» (переключаются по очереди). */
  private bagScene: Phaser.GameObjects.Components.Visible[] = [];
  private handScene: Phaser.GameObjects.Components.Visible[] = [];
  private handSheets = { stick: '', sword: '' };
  private handHero: Phaser.GameObjects.Sprite | null = null;
  private heroSheet = '';
  private heroAnim = '';
  private readonly x0: number;
  private readonly y0: number;
  private readonly demoH: number;
  private t = 0;
  private closed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly spec: TipSpec, private readonly onClose: () => void) {
    const W = GAME.width, H = GAME.height, inner = CARD.w - CARD.pad * 2;
    const noteText = spec.note ? new PText(scene, 0, 0, spec.note, { color: COLORS.dim, maxWidth: inner }) : null;
    const noteH = noteText ? noteText.textHeight + 6 : 0;
    const cols = spec.keys.length > ONE_COLUMN_MAX ? 2 : 1, rows = Math.ceil(spec.keys.length / cols);
    this.demoH = spec.demo === 'hero' ? CARD.heroDemoH : spec.demo === 'bag' ? CARD.bagDemoH : CARD.demoH;
    const h = CARD.title + this.demoH + 10 + rows * CARD.row + noteH + 8 + CARD.btnH + CARD.pad;
    const px = Math.round((W - CARD.w) / 2), py = Math.round((H - h) / 2);
    this.x0 = px + CARD.pad; this.y0 = py + CARD.title;
    this.box = scene.add.container(0, 0).setDepth(DEPTH.overlay + 10);
    const dim = scene.add.rectangle(0, 0, W, H, 0x0b0919, 0.7).setOrigin(0, 0).setInteractive();
    const frame = scene.add.graphics();
    drawPanel(frame, px, py, CARD.w, h);
    const title = new PText(scene, W / 2, 0, spec.title, { font: 'big', ax: 0.5, color: COLORS.blade });
    title.setY(drawTitleRibbon(frame, W / 2, py, title.textWidth));
    // поле примера: у рыцаря — каменный пол, как в замке
    if (spec.demo === 'hero') this.floor(frame, this.x0, this.y0, inner, this.demoH);
    else frame.fillStyle(UI.ironDark, 1).fillRect(this.x0, this.y0, inner, this.demoH);
    frame.lineStyle(1, UI.iron, 1).strokeRect(this.x0 + 0.5, this.y0 + 0.5, inner - 1, this.demoH - 1);
    this.demoG = scene.add.graphics();
    this.box.add([dim, frame, title, this.demoG]);
    // клавиши и что они делают (в одну или две колонки)
    const keysY = this.y0 + this.demoH + 10;
    const items = spec.keys.map(([key, what]) => {
      const label = new PText(scene, 0, 0, key, { color: COLORS.text }), text = new PText(scene, 0, 0, what, { color: COLORS.label });
      const w = Math.ceil(label.textWidth) + 8;
      return { label, text, w, full: w + CARD.capGap + Math.ceil(text.textWidth) };
    });
    const colX = this.columnsX(items.map((it) => it.full), rows, cols, inner);
    items.forEach(({ label, text, w }, i) => {
      const x = colX[Math.floor(i / rows)]!, y = keysY + (i % rows) * CARD.row, cy = PText.centerY(y + CARD.cap / 2);
      label.setPosition(x + 4, cy);
      text.setPosition(x + w + CARD.capGap, cy);
      const g = scene.add.graphics();
      this.caps.push({ g, label, x, y, w, labelY: cy });
      this.box.add([g, label, text]);
    });
    let y = keysY + rows * CARD.row;
    if (noteText) { noteText.setPosition(this.x0, y + 2); this.box.add(noteText); y += noteH; }
    this.button(Math.round(W / 2 - CARD.btnW / 2), y + 8);
    if (spec.demo === 'hero') this.makeHero();
    else if (spec.demo === 'bag') this.makeBag();
    else this.makeItem();
    this.box.setAlpha(0);
    scene.tweens.add({ targets: this.box, alpha: 1, duration: 200, ease: 'Cubic.easeOut' });
    audio.play('select');
    this.update(0);
  }

  update(dt: number): void {
    if (this.closed) return;
    this.t += dt;
    if (this.spec.demo === 'hero') this.demoHero();
    else if (this.spec.demo === 'bag') this.demoBag();
    else this.demoMove();
  }

  onKey(ev: KeyboardEvent): void { if (ev.code === KEYS.interact.code) this.close(); }

  /** Закрыть и сообщить (например, открыть инвентарь после подсказки). */
  close(): void {
    if (this.closed) return;
    this.destroy();
    audio.play('click');
    this.onClose();
  }

  /** Убрать без обратного вызова (смена сцены). */
  destroy(): void {
    this.closed = true;
    this.box.destroy();
  }

  // ---------------- части окна ----------------
  /**
   * Где начинается каждая колонка клавиш. Одна колонка — от левого поля; несколько — поровну свободного места
   * слева, между колонками и справа (по самой длинной строке колонки), чтобы отступы были симметричными.
   */
  private columnsX(widths: number[], rows: number, cols: number, inner: number): number[] {
    if (cols === 1) return [this.x0];
    const colW = Array.from({ length: cols }, (_, c) => Math.max(...widths.slice(c * rows, (c + 1) * rows)));
    const space = (inner - colW.reduce((a, b) => a + b, 0)) / (cols + 1);
    let x = this.x0 + space;
    return colW.map((w) => { const at = Math.round(x); x += w + space; return at; });
  }

  /** Кнопка «Понятно»: под курсором светлеет и чуть приподнимается. */
  private button(bx: number, by: number): void {
    const g = this.scene.add.graphics(), text = new PText(this.scene, GAME.width / 2, 0, `Понятно · ${KEYS.interact.label}`, { ax: 0.5, color: COLORS.label });
    const paint = (hover: boolean): void => {
      const lift = hover ? 1 : 0;
      g.clear();
      drawButton(g, bx, by - lift, CARD.btnW, CARD.btnH, hover);
      text.setY(buttonTextY(by - lift, CARD.btnH)).setColor(hover ? COLORS.label : COLORS.text);   // под курсором — ярче
    };
    paint(false);
    const zone = this.scene.add.zone(bx, by, CARD.btnW, CARD.btnH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { paint(true); audio.play('select'); });
    zone.on('pointerout', () => paint(false));
    zone.on('pointerdown', () => this.close());
    this.box.add([g, text, zone]);
  }

  /** Каменный пол примера: плиты в два тона с тёмными швами, как в тронном зале. */
  private floor(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const TW = 16, TH = 8;
    g.fillStyle(0x2a2f3a, 1).fillRect(x, y, w, h);
    for (let row = 0; row * TH < h; row++) for (let col = -1; col * TW < w; col++) {
      const tx = x + col * TW + (row % 2) * (TW / 2), ty = y + row * TH;
      const left = Math.max(x, tx), right = Math.min(x + w, tx + TW - 1), bottom = Math.min(y + h, ty + TH - 1);
      if (right <= left || bottom <= ty) continue;
      g.fillStyle((col + row) % 3 ? 0x424956 : 0x4a5260, 1).fillRect(left, ty, right - left, bottom - ty);
    }
  }

  /** Клавиша-кнопка: железная рамка, тёмное поле; нажатая — золотая и чуть ниже. */
  private keycap(c: Cap, down: boolean): void {
    const dy = down ? 1 : 0, h = CARD.cap;
    c.label.setY(c.labelY + dy);
    c.g.clear();
    if (!down) c.g.fillStyle(0x000000, 0.5).fillRect(c.x, c.y + h, c.w, 1);
    c.g.fillStyle(down ? UI.gold : UI.ironLight, 1).fillRect(c.x, c.y + dy, c.w, h);
    c.g.fillStyle(down ? UI.goldDark : UI.ironDark, 1).fillRect(c.x + 1, c.y + 1 + dy, c.w - 2, h - 2);
  }

  // ---------------- пример: рыцарь ----------------
  private makeHero(): void {
    this.heroSheet = ensureHeroSheet(this.scene, outfitFor(session.data.equipped));
    const o = heroOrigin();
    this.hero = this.scene.add.sprite(0, 0, this.heroSheet, '0').setOrigin(o.x, o.y).setScale(HERO_DEMO.scale / (GAME.resolution * FIGURE_SCALE));
    this.box.add(this.hero);
  }

  /** Где рыцарь в момент t цикла: проходим отрезки, складывая пройденный путь; какой отрезок сейчас и какая доля его прошла. */
  private shotAt(t: number): { shot: Shot; k: number; x: number; y: number } {
    let x = 0, y = 0, rest = t % SHOTS_LENGTH;
    for (const shot of SHOTS) {
      const d = Math.min(rest, shot.dur);
      x += shot.vx * HERO_DEMO.speed * d; y += shot.vy * HERO_DEMO.speed * d;
      if (rest <= shot.dur) return { shot, k: rest / shot.dur, x, y };
      rest -= shot.dur;
    }
    return { shot: SHOTS[SHOTS.length - 1]!, k: 1, x, y };
  }

  private demoHero(): void {
    const { shot, k, x, y } = this.shotAt(this.t), hero = this.hero;
    this.caps.forEach((c, i) => this.keycap(c, i === shot.cap));
    if (!hero) return;
    hero.setPosition(Math.round(GAME.width / 2 + HERO_DEMO.start.x + x), Math.round(this.y0 + HERO_DEMO.start.y + y));
    const g = this.demoG.clear();
    g.fillStyle(0x000000, 0.35).fillEllipse(hero.x, hero.y, 14, 5);
    if (shot.attack) {
      // взмах — кадры удара по порядку
      this.heroAnim = '';
      hero.stop().setFrame(heroAttackFrame(shot.dir, Math.min(5, Math.floor(k * 6))));
      return;
    }
    const moving = shot.vx !== 0 || shot.vy !== 0, key = heroAnimKey(this.heroSheet, moving ? 'walk' : 'idle', shot.dir);
    if (key !== this.heroAnim) { this.heroAnim = key; hero.play(key); }
    hero.anims.timeScale = Math.abs(shot.vx) > 1 ? 2.5 : 1;
    // рывок — пыль позади
    if (Math.abs(shot.vx) > 1) for (let i = 1; i <= 3; i++) g.fillStyle(0xc8ccd8, 0.5 - i * 0.12).fillCircle(hero.x + i * 5, hero.y - 2, 2.5 - i * 0.5);
  }

  // ---------------- пример: перенос вещи ----------------
  private makeItem(): void {
    const rows = this.demoRows();
    this.box.add([
      new PText(this.scene, rows.from.x, rows.from.y - CARD.label, 'Карманы', { color: COLORS.dim }),
      new PText(this.scene, rows.to.x, rows.to.y - CARD.label, 'Сундук', { color: COLORS.dim }),
    ]);
    this.item = addIcon(this.scene, 0, 0, 'item_helmet', 1);
    this.cursorG = this.scene.add.graphics();
    this.box.add([this.item, this.cursorG]);   // курсор — поверх вещи
  }

  /** Ряды примера: три клетки карманов слева и три клетки сундука справа. */
  private demoRows(): { from: { x: number; y: number }; to: { x: number; y: number } } {
    const C = CARD.cell, y = this.y0 + this.demoH - C - 8;
    return { from: { x: this.x0 + 16, y }, to: { x: this.x0 + CARD.w - CARD.pad * 2 - 16 - C * 3, y } };
  }

  /** Тащит ли курсор вещь сейчас (середина цикла). */
  private dragging(): boolean { const k = (this.t % DEMO_LOOP) / DEMO_LOOP; return k > 0.3 && k < 0.65; }

  /**
   * «Перенос»: курсор подходит к вещи в карманах, берёт её, несёт в свободную клетку и кладёт — клетка вспыхивает
   * зелёным. Вещь — как в инвентаре: на цветном фоне своего вида с кантом.
   */
  private demoMove(): void {
    const g = this.demoG.clear(), C = CARD.cell, rows = this.demoRows(), cy = rows.from.y;
    // ЛКМ зажата, пока вещь несут
    this.caps.forEach((c, i) => this.keycap(c, i === 0 && this.dragging()));
    for (let i = 0; i < 3; i++) { this.demoCell(g, rows.from.x + i * C, cy); this.demoCell(g, rows.to.x + i * C, cy); }
    this.arrow(g, GAME.width / 2 - 1, cy + C / 2);
    const from = rows.from, to = { x: rows.to.x + C, y: cy };   // кладём в среднюю клетку
    const k = (this.t % DEMO_LOOP) / DEMO_LOOP;
    const start = { x: this.x0 + 4, y: this.y0 + this.demoH - 6 };
    const pick = { x: from.x + C / 2, y: from.y + C / 2 }, drop = { x: to.x + C / 2, y: to.y + C / 2 };
    let cur = start, item = pick;
    if (k < 0.25) cur = lerp(start, pick, ease(k / 0.25));
    else if (k < 0.3) cur = pick;
    else if (k < 0.65) { cur = lerp(pick, drop, ease((k - 0.3) / 0.35)); item = cur; }
    else { cur = lerp(drop, start, ease(Math.min(1, (k - 0.75) / 0.25) * (k > 0.75 ? 1 : 0))); item = drop; }
    if (k >= 0.65 && k < 0.85) g.lineStyle(1, 0x5ae07a, 1 - (k - 0.65) / 0.2).strokeRect(to.x + 0.5, to.y + 0.5, C - 1, C - 1);
    this.tile(g, item.x - C / 2, item.y - C / 2, C, C, RARITIES.common);
    this.item?.setPosition(Math.round(item.x), Math.round(item.y));
    this.cursor(cur);
  }

  // ---------------- пример: меч в сумку с поворотом ----------------
  /** Карманы (три клетки) слева — напротив среднего ряда сумки; сетка сумки справа — с равными полями по бокам. */
  private bagLayout(): { pocket: { x: number; y: number }; grid: { x: number; y: number } } {
    const D = BAG_DEMO, y = this.y0 + this.demoH - D.rows * D.cell - D.margin;
    return { pocket: { x: this.x0 + D.side, y: y + D.cell }, grid: { x: this.x0 + CARD.w - CARD.pad * 2 - D.side - D.cols * D.cell, y } };
  }

  private makeBag(): void {
    const L = this.bagLayout();
    const labels = [
      new PText(this.scene, L.pocket.x, L.pocket.y - CARD.label, 'Карманы', { color: COLORS.dim }),
      new PText(this.scene, L.grid.x, L.grid.y - CARD.label, 'Сумка', { color: COLORS.dim }),
    ];
    this.item = addIcon(this.scene, 0, 0, 'castle_sword', 1);
    this.bagScene = [...labels, this.item];
    this.box.add([...labels, this.item]);
    this.makeHandScene();
    this.cursorG = this.scene.add.graphics();
    this.box.add(this.cursorG);   // курсор — поверх всего
  }

  /** Сцена «Оружие в руке»: герой с палкой, кнопка и список (подписи — здесь, рамки рисуются каждый кадр). */
  private makeHandScene(): void {
    const H = HAND_DEMO, b = this.handButton(), o = heroOrigin();
    this.handSheets = { stick: ensureHeroSheet(this.scene, STARTER_OUTFIT), sword: ensureHeroSheet(this.scene, { ...STARTER_OUTFIT, weapon: 'sword' }) };
    this.handHero = this.scene.add.sprite(this.x0 + H.heroX, this.y0 + this.demoH - 10, this.handSheets.stick, '0').setOrigin(o.x, o.y).setScale(HERO_DEMO.scale / (GAME.resolution * FIGURE_SCALE));
    const btnText = new PText(this.scene, b.x + H.btnW / 2, buttonTextY(b.y, H.btnH), 'Оружие в руке', { ax: 0.5, color: COLORS.text });
    const rows = [EQUIPMENT.sword.name, 'Без оружия'].map((label, i) => new PText(this.scene, b.x + H.btnW - H.menuW + H.pad + 5, buttonTextY(this.handMenuY() + H.pad + i * H.row, H.row), label, { color: COLORS.label }));
    this.handScene = [this.handHero, btnText, ...rows];
    this.box.add([this.handHero, btnText, ...rows]);
  }

  /** Кнопка «Оружие в руке» в примере — справа внизу поля. */
  private handButton(): { x: number; y: number } {
    return { x: this.x0 + CARD.w - CARD.pad * 2 - BAG_DEMO.side - HAND_DEMO.btnW, y: this.y0 + this.demoH - BAG_DEMO.margin - HAND_DEMO.btnH };
  }
  /** Верх списка над кнопкой (две строки). */
  private handMenuY(): number { return this.handButton().y - 3 - (HAND_DEMO.row * 2 + HAND_DEMO.pad * 2); }

  /** Пример инвентаря по кругу: сначала сцена с сумкой, потом — «Оружие в руке». */
  private demoBag(): void {
    const t = this.t % (BAG_DEMO.loop + HAND_DEMO.loop), bag = t < BAG_DEMO.loop;
    for (const o of this.bagScene) o.setVisible(bag);
    for (const o of this.handScene) o.setVisible(!bag);
    if (bag) this.demoBagScene(t / BAG_DEMO.loop);
    else this.demoHandScene((t - BAG_DEMO.loop) / HAND_DEMO.loop);
  }

  /**
   * «Оружие в руке»: курсор подводится к кнопке и жмёт (ЛКМ), открывается список; курсор на «Старый меч», нажатие —
   * список закрывается, герой берёт меч в руку (вспыхивают искры).
   */
  private demoHandScene(k: number): void {
    const H = HAND_DEMO, g = this.demoG.clear(), b = this.handButton(), menuY = this.handMenuY(), mx = b.x + H.btnW - H.menuW;
    const clicking = (k >= H.press && k < H.open) || (k >= H.over + 0.02 && k < H.take);
    this.caps.forEach((c, i) => this.keycap(c, i === 0 && clicking));
    const start = { x: this.x0 + H.heroX + 30, y: this.y0 + this.demoH - 10 };
    const onBtn = { x: b.x + H.btnW / 2, y: b.y + H.btnH / 2 }, onSword = { x: mx + 30, y: menuY + H.pad + H.row / 2 };
    let cur = start;
    if (k < H.press) cur = lerp(start, onBtn, ease(k / H.press));
    else if (k < H.open) cur = onBtn;
    else if (k < H.over) cur = lerp(onBtn, onSword, ease((k - H.open) / (H.over - H.open)));
    else if (k < H.take) cur = onSword;
    else cur = lerp(onSword, start, ease(Math.min(1, (k - H.take) / 0.3)));
    // кнопка: под курсором светлее, при нажатии чуть ниже
    const overBtn = k >= H.press - 0.04 && k < H.open + 0.03;
    drawButton(g, b.x, b.y, H.btnW, H.btnH, overBtn);
    // список: рамка, строка под курсором — алая
    const menu = k >= H.open && k < H.take;
    this.handScene.slice(2).forEach((t) => t.setVisible(menu));
    const swordRow = this.handScene[2] as PText | undefined;
    if (menu) {
      drawDropdown(g, mx, menuY, H.menuW, H.row * 2 + H.pad * 2);
      const on = k >= H.over - 0.04;
      if (on) drawRowHighlight(g, mx + H.pad, menuY + H.pad, H.menuW - H.pad * 2, H.row);
      swordRow?.setColor(on ? COLORS.hover : COLORS.label);
    }
    // герой: до выбора — с палкой, после — с мечом и искрами
    const sheet = k >= H.take ? this.handSheets.sword : this.handSheets.stick, hero = this.handHero;
    if (hero) {
      const key = heroAnimKey(sheet, 'idle', 'down');
      if (hero.texture.key !== sheet || hero.anims.currentAnim?.key !== key) hero.setTexture(sheet, '0').play(key);
      g.fillStyle(0x000000, 0.35).fillEllipse(hero.x, hero.y, 14, 5);
      if (k >= H.take && k < H.take + 0.15) {
        const a = 1 - (k - H.take) / 0.15;
        for (let i = 0; i < 6; i++) g.fillStyle(0xfff0a0, a).fillCircle(hero.x + Math.cos(i) * (8 + i), hero.y - 18 + Math.sin(i * 2) * 8, 1.2);
      }
    }
    this.item?.setVisible(false);
    this.cursor(cur);
  }

  /**
   * Как в окне инвентаря: курсор берёт меч из карманов (ЛКМ зажата) и несёт в сумку — там меч занимает три клетки
   * торчком (зелёные — помещается); R — меч поворачивается поперёк; ЛКМ отпущена — меч лёг, клетки вспыхивают.
   */
  private demoBagScene(k: number): void {
    const D = BAG_DEMO, C = D.cell, L = this.bagLayout(), g = this.demoG.clear();
    const holding = k >= D.pick && k < D.drop, turning = k >= D.turn[0] && k < D.turn[1];
    this.caps.forEach((c, i) => this.keycap(c, (i === 0 && holding) || (i === 1 && turning)));
    for (let i = 0; i < 3; i++) this.demoCell(g, L.pocket.x + i * C, L.pocket.y, C);
    for (let y = 0; y < D.rows; y++) for (let x = 0; x < D.cols; x++) this.demoCell(g, L.grid.x + x * C, L.grid.y + y * C, C);
    this.arrow(g, Math.round((L.pocket.x + 3 * C + L.grid.x) / 2), L.pocket.y + C / 2);
    const start = { x: this.x0 + 4, y: this.y0 + this.demoH - 6 };
    const pick = { x: L.pocket.x + C / 2, y: L.pocket.y + C / 2 }, mid = { x: L.grid.x + 2.5 * C, y: L.grid.y + 1.5 * C };   // средняя клетка сумки
    let cur = start;
    if (k < D.pick) cur = lerp(start, pick, ease(k / D.pick));
    else if (k < D.over) cur = lerp(pick, mid, ease((k - D.pick) / (D.over - D.pick)));
    else if (k < D.drop) cur = mid;
    else cur = lerp(mid, start, ease(Math.min(1, ((k - D.drop) / (1 - D.drop)) * 1.5)));
    if (k < D.over) {
      // в карманах и в пути — вещь в одну клетку
      const at = k < D.pick ? pick : cur;
      this.tile(g, at.x - C / 2, at.y - C / 2, C, C, RARITIES.common);
      this.item?.setPosition(Math.round(at.x), Math.round(at.y)).setScale(0.9 / GAME.resolution).setAngle(0);
    } else {
      // в сумке меч длиной в три клетки: торчком, после R — поперёк (поворот вокруг средней клетки)
      const turn = k < D.turn[0] ? 0 : Math.min(1, (k - D.turn[0]) / (D.turn[1] - D.turn[0])), across = turn >= 0.5;
      const w = (across ? 3 : 1) * C, h = (across ? 1 : 3) * C, placed = k >= D.drop;
      this.tile(g, mid.x - w / 2, mid.y - h / 2, w, h, placed ? RARITIES.common : HELD_FIT);
      if (placed && k < D.drop + 0.12) g.lineStyle(1, HELD_FIT.edge, 1 - (k - D.drop) / 0.12).strokeRect(mid.x - w / 2 - 0.5, mid.y - h / 2 - 0.5, w + 1, h + 1);
      this.item?.setPosition(Math.round(mid.x), Math.round(mid.y)).setScale(1.4 / GAME.resolution).setAngle(turn * 90);
    }
    this.cursor(cur);
  }

  /** Вещь на цветном фоне своего вида с кантом (как в инвентаре). */
  private tile(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, kind: { fill: number; edge: number }): void {
    const ix = Math.round(x) + 1, iy = Math.round(y) + 1;
    g.fillStyle(kind.fill, 1).fillRect(ix, iy, w - 2, h - 2).lineStyle(1, kind.edge, 1).strokeRect(ix + 0.5, iy + 0.5, w - 3, h - 3);
  }

  /** Стрелка «откуда — куда» между рядами клеток. */
  private arrow(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(UI.goldDark, 1).fillTriangle(x - 5, y - 4, x + 5, y, x - 5, y + 4);
  }

  /** Курсор мыши (белая стрелка с тёмным краем) — поверх вещи. */
  private cursor(at: { x: number; y: number }): void {
    const px = Math.round(at.x + 2), py = Math.round(at.y + 2), cg = this.cursorG?.clear();
    cg?.fillStyle(0x0b0919, 1).fillTriangle(px - 1, py - 1, px + 8, py + 7, px - 1, py + 11);
    cg?.fillStyle(0xffffff, 1).fillTriangle(px, py, px + 6, py + 6, px, py + 9);
  }

  private demoCell(g: Phaser.GameObjects.Graphics, x: number, y: number, C: number = CARD.cell): void {
    g.fillStyle(UI.iron, 1).fillRect(x, y, C, C);
    g.fillStyle(0x0c0a12, 1).fillRect(x + 1, y + 1, C - 2, C - 2);
  }
}

/** Плавный разгон и торможение (0..1 → 0..1). */
function ease(v: number): number { return v * v * (3 - 2 * v); }

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, k: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
