import Phaser from 'phaser';
import { HERO_SHEET, type PlayerDirection, PLAYER_DIRECTIONS, TEXTURES } from '../configs/assets';
import { CANVAS_SCALE, COLORS, DEPTH, GAME, KEYS } from '../configs/game';
import { ARMOR_SLOTS, BAG, EQUIPMENT, EQUIPMENT_IDS, ITEM_KIND_NAMES, POCKETS, RARITIES, type ArmorSlot, type EquipmentId } from '../configs/items';
import { outfitFor } from '../characters/Player';
import { ensureHeroSheet, heroAnimKey, heroOrigin, heroPortraitJobs, heroPortraitKey, PORTRAIT_TAG, portraitSide } from '../systems/HeroArt';
import { addIcon, BAG_ART } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import { session, shapeCells, type BagSpot } from '../state/Session';
import { buttonTextY, drawButton, drawDropdown, drawPanel, drawRowHighlight, drawTitleRibbon, UI } from './Panel';
import { PText } from './PText';
import { FONT_INK } from './PixelFont';

/*
 * Инвентарь-рюкзак. Слева — снаряжение одним столбцом: четыре слота доспехов (шлем, нагрудник, штаны, перчатки)
 * и слот сумки; рядом герой (медленно поворачивается — видна объёмная модель).
 * Справа — рюкзак-сетка: оружие, магия и усиления занимают клетки своей формой и действуют, только пока лежат в нём.
 * Под рюкзаком — карманы (POCKETS мест): вещи с собой, которые не действуют (сюда же попадают покупки и снятые доспехи).
 * Предмет берут и кладут кликом или перетаскиванием, поворачивают клавишей R. Клавиатура (KEYS): WASD — выбор клетки,
 * E — взять, положить, надеть или снять; TAB — закрыть. Наведите на вещь — рядом подсказка: что она даёт (TIP).
 * Подсказку по управлению показывает обучающая карточка (TutorialCard).
 */

const W = GAME.width;
/** Клетка сумки, слота и кармана (пиксели). */
const CELL = 22;
/** Иконки рисовались под клетку 26 — во столько раз они меньше теперь. */
const ICON_K = CELL / 26;
/**
 * Отступы раскладки: pad — от краёв окна, gap — между столбцом снаряжения, героем и сумкой; title — от верхней кромки
 * окна до надписей (под лентой заголовка), label — от верха надписи до клеток под ней, section — между блоками.
 */
const SPACE = { pad: 12, gap: 14, title: 34, label: 15, section: 8 } as const;
/** Снаряжение: четыре слота доспехов одним столбцом, под ними — слот сумки (надетая сумка делает сетку больше). */
const SLOT_GAP = 4;
const GEAR_H = (ARMOR_SLOTS.length + 1) * CELL + ARMOR_SLOTS.length * SLOT_GAP;
/** Кнопки внизу справа (для мыши и телефона): «Повернуть» вещь в руке и «Закрыть» окно. */
const BTN = { w: 76, h: 16, gap: 8 } as const;
/** Подписи кнопок внизу окна. */
const BUTTON_LABELS = { rotate: 'Повернуть', close: 'Закрыть', hand: 'Оружие в руке' } as const;
type ButtonId = keyof typeof BUTTON_LABELS;
/** Ширина кнопок: «Оружие в руке» длиннее остальных. */
const BUTTON_W: Record<ButtonId, number> = { rotate: BTN.w, hand: 96, close: BTN.w };
/**
 * Список «Оружие в руке» над кнопкой: ширина, высота строки (нечётная — у 7 строк букв поровну места сверху и снизу),
 * поле от рамки до строк, зазор до кнопки, клетка под иконкой, отступ внутри строки (слева и справа) и от клетки до текста.
 */
const HAND_MENU = { w: 150, row: 17, pad: 3, gap: 4, icon: 13, inset: 3, text: 5 } as const;
/** Отметка у того, что сейчас в руке (у правого края строки). */
const IN_HAND = 'в руке';
/** Строка без оружия: в руке остаётся палка, как кулаки. */
const NO_WEAPON = 'Без оружия';
/**
 * Подсказка у вещи под курсором: ширина, поле внутри рамки, зазор от клетки и от края экрана;
 * slack — пустота под буквами последней строки (строка шрифта выше самих букв). В карманах вещь не действует — пометка.
 */
const TIP = { w: 150, pad: 5, gap: 4, edge: 4, slack: 3 } as const;
const TIP_POCKET = 'В кармане — не действует';
/**
 * Раскладка: слева сверху — снаряжение и герой (высота блока leftH), под ними — карманы в ряд; справа — сумка во всю
 * высоту; кнопки — под сумкой. Что делает вещь — в подсказке при наведении (TIP).
 */
const LEFT_H = Math.max(GEAR_H, 112);
// высота — по самому высокому столбцу: сумка справа или снаряжение с карманами слева
const CONTENT_H = Math.max(BAG.rows * CELL, LEFT_H + SPACE.section + SPACE.label + CELL);
const WIN_W = 330, WIN_H = SPACE.title + SPACE.label + CONTENT_H + SPACE.section + BTN.h + SPACE.pad;
const WIN = { x: Math.round((GAME.width - WIN_W) / 2), y: Math.round((GAME.height - WIN_H) / 2), w: WIN_W, h: WIN_H } as const;
/** Верх надписей и верх клеток под ними. */
const LABEL_Y = WIN.y + SPACE.title, CELLS_Y = LABEL_Y + SPACE.label;
const SLOTS = { x: WIN.x + SPACE.pad, y: CELLS_Y } as const;
const GRID = { x: WIN.x + WIN.w - SPACE.pad - BAG.cols * CELL, y: CELLS_Y } as const;
/**
 * Герой — по центру места между снаряжением и сумкой (и по ширине, и по высоте блока): ноги ниже середины на
 * половину роста героя на экране (halfHeight, пиксели окна); увеличение; поворот раз в turnEvery с.
 */
const HERO_AREA = GRID.x - SPACE.gap - (SLOTS.x + CELL + SPACE.gap);
const HERO_HALF_HEIGHT = 40;
const HERO = { x: SLOTS.x + CELL + SPACE.gap + HERO_AREA / 2, y: CELLS_Y + LEFT_H / 2 + HERO_HALF_HEIGHT, scale: 3, turnEvery: 1.1 } as const;
const STASH = { x: SLOTS.x, y: CELLS_Y + LEFT_H + SPACE.section + SPACE.label } as const;
/** Сколько ячеек в карманах. */
const STASH_SIZE = POCKETS;
/** Как герой поворачивается в окне: по кругу. */
const TURN: readonly PlayerDirection[] = ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'];
/**
 * Портрет героя (HeroArt.heroPortraitJobs) детальнее обычного листа — пиксель в пиксель с экраном. Рисуется в фоне,
 * пока окно открыто: не дольше budgetMs за кадр; пока сторона не готова, показан обычный лист.
 */
const PORTRAIT = { res: HERO.scale * CANVAS_SCALE, budgetMs: 10 } as const;

/** Цвета клетки предмета — по его классу (редкости): заливка и кант. */
function tileColors(id: EquipmentId): { fill: number; edge: number } { return RARITIES[EQUIPMENT[id].rarity]; }

type Focus = { area: 'slot'; i: number } | { area: 'pack' } | { area: 'bag'; x: number; y: number } | { area: 'stash'; i: number };
/** Предмет в руке: поворот, за какую клетку формы взят, откуда (чтобы вернуть при отмене). */
interface Held { id: EquipmentId; rot: number; gx: number; gy: number; from: BagSpot | null }

/** Что окну нужно от интерфейса. */
export interface InventoryHost { message(text: string, icon?: string): void }

function sameFocus(a: Focus, b: Focus): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export class InventoryWindow {
  private readonly box: Phaser.GameObjects.Container;
  /** То, что перерисовывается при каждом изменении: клетки, предметы, тексты. */
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  /** Подпись над сеткой: размер сумки меняется, когда надевают другую. */
  private readonly bagLabel: PText;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hero: Phaser.GameObjects.Sprite;
  private sheet = '';
  private outfit = outfitFor(session.data.equipped);
  /** Задания портрета, которые ещё не выполнены; показан ли сейчас портрет (а не обычный лист). */
  private portraitJobs: (() => void)[] = [];
  private showingPortrait = false;
  private turn = 0;
  private turnT: number = HERO.turnEvery;
  private focus: Focus = { area: 'bag', x: 0, y: 0 };
  private held: Held | null = null;
  /** Куда нажали мышью: если отпустили в другом месте — это перетаскивание. */
  private pressed: Focus | null = null;
  /** Над какой кнопкой курсор (подсветка). */
  private hoverBtn: ButtonId | null = null;
  /** Открыт ли список «Оружие в руке» и какая строка выбрана. */
  private handMenu: { sel: number } | null = null;
  /** Показывать ли подсказку у выбранной клетки: после наведения мышью или хода клавишами (не сразу при открытии). */
  private tip = false;
  private readonly onMove = (p: Phaser.Input.Pointer): void => this.pointerMove(p);
  private readonly onDown = (p: Phaser.Input.Pointer): void => this.pointerDown(p);
  private readonly onUp = (p: Phaser.Input.Pointer): void => this.pointerUp(p);

  constructor(private readonly scene: Phaser.Scene, private readonly host: InventoryHost, private readonly onClose: () => void) {
    this.box = scene.add.container(0, 0).setDepth(DEPTH.overlay);
    const dim = scene.add.rectangle(0, 0, W, GAME.height, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const frame = scene.add.graphics();
    drawPanel(frame, WIN.x, WIN.y, WIN.w, WIN.h);
    const title = new PText(scene, W / 2, 0, 'Инвентарь', { font: 'big', ax: 0.5, color: COLORS.blade });
    title.setY(drawTitleRibbon(frame, W / 2, WIN.y, title.textWidth));
    const pedestal = scene.add.image(HERO.x, HERO.y, TEXTURES.shadow).setScale(2.2, 1.6);
    this.sheet = ensureHeroSheet(scene, this.outfit);
    const o = heroOrigin();
    this.hero = scene.add.sprite(HERO.x, HERO.y, this.sheet, '0').setOrigin(o.x, o.y);
    this.dropPortraits();
    this.queuePortraits();
    this.g = scene.add.graphics();
    this.bagLabel = new PText(scene, GRID.x, LABEL_Y, '', { color: COLORS.gold });
    this.box.add([dim, frame, title, pedestal, this.hero, this.g,
      new PText(scene, SLOTS.x, LABEL_Y, 'Снаряжение', { color: COLORS.gold }),
      this.bagLabel,
      new PText(scene, STASH.x, STASH.y - SPACE.label, 'Карманы', { color: COLORS.gold }),
    ]);
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointerup', this.onUp);
    this.box.setAlpha(0);
    scene.tweens.add({ targets: this.box, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
    audio.play('select');
    this.refresh();
  }

  /** Каждый кадр: герой поворачивается, чтобы было видно его со всех сторон. */
  update(dt: number): void {
    this.drawPortrait();
    if ((this.turnT -= dt) > 0) return;
    this.turnT = HERO.turnEvery;
    this.turn = (this.turn + 1) % TURN.length;
    this.playHero();
  }

  onKey(ev: KeyboardEvent): void {
    const k = ev.code, menu = this.handMenu;
    // в списке «Оружие в руке»: W / S — выбор строки, E — взять в руку
    if (menu && k !== KEYS.inventory.code) {
      const n = this.handOptions().length;
      if (k === KEYS.up.code || k === KEYS.down.code) { menu.sel = (menu.sel + (k === KEYS.up.code ? n - 1 : 1)) % n; audio.play('select'); this.refresh(); }
      else if (k === KEYS.interact.code) this.chooseHand(menu.sel);
      return;
    }
    if (k === KEYS.up.code) this.move(0, -1);
    else if (k === KEYS.down.code) this.move(0, 1);
    else if (k === KEYS.left.code) this.move(-1, 0);
    else if (k === KEYS.right.code) this.move(1, 0);
    else if (k === KEYS.interact.code) this.activate();
    else if (k === KEYS.rotate.code) this.rotate();
    else if (k === KEYS.inventory.code) this.close();   // вещь в руке вернётся на место (close → cancel)
  }

  close(): void {
    this.cancel();
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointerup', this.onUp);
    this.dropPortraits();
    this.box.destroy();
    this.onClose();
  }

  // ---------------- действия ----------------
  private activate(): void {
    const f = this.focus, h = this.held;
    if (f.area === 'pack') { this.activatePack(); return; }
    if (f.area === 'slot') {
      const id = this.slotItem(ARMOR_SLOTS[f.i]!);
      if (h || !id) { if (h) audio.play('error'); return; }
      session.stash(id); audio.play('click'); this.changed();
      return;
    }
    if (f.area === 'stash') {
      if (h) { this.held = null; audio.play('click'); this.changed(); return; }   // вещь уже в карманах — просто отпускаем
      const id = this.stashItems()[f.i];
      if (!id) return;
      if (EQUIPMENT[id].slot) { session.wearArmor(id); audio.play('pickup'); this.changed(); return; }
      if (EQUIPMENT[id].bagSize) { this.wearPack(id); return; }
      const [gx, gy] = shapeCells(id, 0)[0]!;
      this.held = { id, rot: 0, gx, gy, from: null };
      audio.play('select'); this.refresh();
      return;
    }
    if (h) {
      if (!session.placeInBag(h.id, f.x - h.gx, f.y - h.gy, h.rot)) { audio.play('error'); return; }
      this.held = null; audio.play('pickup'); this.changed();
      return;
    }
    const id = session.bagItemAt(f.x, f.y);
    const spot = id ? session.data.bag[id] : undefined;
    if (!id || !spot) return;
    this.held = { id, rot: spot.rot, gx: f.x - spot.x, gy: f.y - spot.y, from: { ...spot } };
    session.stash(id);   // пока предмет в руке, он не действует
    audio.play('select'); this.changed();
  }

  /** Слот сумки: пустой — ничего; с сумкой — снять её в карманы (если вещи поместятся в стартовую сумку). */
  private activatePack(): void {
    if (this.held || !session.packItem) { if (this.held) audio.play('error'); return; }
    if (session.removePack()) { audio.play('click'); this.changed(); return; }
    audio.play('error'); this.host.message('Вещи не поместятся в маленькую сумку');
  }

  /** Надеть сумку из карманов в слот сумки — сетка становится больше. */
  private wearPack(id: EquipmentId): void {
    if (session.wearPack(id)) { audio.play('pickup'); this.changed(); return; }
    audio.play('error'); this.host.message('Вещи не поместятся в эту сумку', EQUIPMENT[id].icon);
  }

  /** Поворот предмета в руке на четверть оборота; за ту же клетку формы он и остаётся взятым. */
  private rotate(): void {
    const h = this.held;
    if (!h) return;
    const index = Math.max(0, shapeCells(h.id, h.rot).findIndex(([x, y]) => x === h.gx && y === h.gy));
    h.rot = (h.rot + 1) % 4;
    [h.gx, h.gy] = shapeCells(h.id, h.rot)[index]!;
    audio.play('select'); this.refresh();
  }

  /** Отмена: предмет в руке возвращается туда, откуда взят. */
  private cancel(): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (h.from) session.placeInBag(h.id, h.from.x, h.from.y, h.from.rot);
    this.changed();
  }

  private move(dx: number, dy: number): void {
    const f = this.focus, slots = ARMOR_SLOTS.length, bag = session.bagSize;
    if (f.area === 'slot') {
      if (dx > 0) this.focus = { area: 'bag', x: 0, y: Math.min(f.i, bag.rows - 1) };
      else if (dy > 0 && f.i === slots - 1) this.focus = { area: 'pack' };
      else if (dy) this.focus = { area: 'slot', i: Phaser.Math.Clamp(f.i + dy, 0, slots - 1) };
    } else if (f.area === 'pack') {
      if (dx > 0) this.focus = { area: 'bag', x: 0, y: bag.rows - 1 };
      else if (dy < 0) this.focus = { area: 'slot', i: slots - 1 };
      else if (dy > 0) this.focus = { area: 'stash', i: 0 };
    } else if (f.area === 'bag') {
      const x = f.x + dx, y = f.y + dy;
      if (x < 0) this.focus = { area: 'slot', i: Math.min(f.y, slots - 1) };
      else if (y >= bag.rows) this.focus = { area: 'stash', i: Math.min(f.x, STASH_SIZE - 1) };
      else this.focus = { area: 'bag', x: Math.min(bag.cols - 1, x), y: Math.max(0, y) };
    } else if (dy < 0) this.focus = { area: 'slot', i: slots - 1 };
    else if (dx) this.focus = f.i + dx >= STASH_SIZE ? { area: 'bag', x: 0, y: bag.rows - 1 } : { area: 'stash', i: Math.max(0, f.i + dx) };
    this.tip = true;
    this.refresh();
  }

  // ---------------- мышь ----------------
  private hitTest(px: number, py: number): Focus | null {
    const inside = (x: number, y: number, w: number, h: number): boolean => px >= x && py >= y && px < x + w && py < y + h;
    for (let i = 0; i < ARMOR_SLOTS.length; i++) if (inside(SLOTS.x, this.slotY(i), CELL, CELL)) return { area: 'slot', i };
    if (inside(SLOTS.x, this.slotY(ARMOR_SLOTS.length), CELL, CELL)) return { area: 'pack' };
    if (inside(GRID.x, GRID.y, session.bagSize.cols * CELL, session.bagSize.rows * CELL)) return { area: 'bag', x: Math.floor((px - GRID.x) / CELL), y: Math.floor((py - GRID.y) / CELL) };
    if (inside(STASH.x, STASH.y, STASH_SIZE * CELL, CELL)) return { area: 'stash', i: Math.floor((px - STASH.x) / CELL) };
    return null;
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    if (this.handMenu) {
      const row = this.handRowAt(p.worldX, p.worldY);
      if (row >= 0 && row !== this.handMenu.sel) { this.handMenu.sel = row; this.refresh(); }
    }
    const btn = this.buttonAt(p.worldX, p.worldY);
    if (btn !== this.hoverBtn) { this.hoverBtn = btn; this.refresh(); }
    const f = this.hitTest(p.worldX, p.worldY);
    // курсор ушёл с клеток — подсказка прячется (рамка выбора остаётся)
    if (!f) { if (this.tip) { this.tip = false; this.refresh(); } return; }
    if (!sameFocus(f, this.focus) || !this.tip) { this.focus = f; this.tip = true; this.refresh(); }
  }

  /** Где кнопки: «Закрыть» у правого края, «Повернуть» или «Сделать основным» — левее. */
  private buttonRect(id: ButtonId): { x: number; y: number } {
    const y = CELLS_Y + CONTENT_H + SPACE.section, close = WIN.x + WIN.w - SPACE.pad - BTN.w;
    return { x: id === 'close' ? close : close - BTN.gap - BUTTON_W[id], y };
  }

  /** Кнопки, которые сейчас видны: «Повернуть» — только с вещью в руке. */
  private buttons(): ButtonId[] { return this.held ? ['rotate', 'close'] : ['hand', 'close']; }

  // ---------------- оружие в руке ----------------
  /** Строки списка: оружие из сумки и «без оружия» (палка). */
  private handOptions(): (EquipmentId | null)[] {
    return [...EQUIPMENT_IDS.filter((id) => session.data.equipped[id] && EQUIPMENT[id].kind === 'weapon'), null];
  }

  /** Где список: над кнопкой «Оружие в руке», по её правому краю. */
  private handMenuRect(): { x: number; y: number; w: number; h: number } {
    const M = HAND_MENU, b = this.buttonRect('hand'), h = this.handOptions().length * M.row + M.pad * 2;
    return { x: b.x + BUTTON_W.hand - M.w, y: b.y - M.gap - h, w: M.w, h };
  }

  /** Номер строки списка под точкой (или -1). */
  private handRowAt(px: number, py: number): number {
    const r = this.handMenuRect(), i = Math.floor((py - r.y - HAND_MENU.pad) / HAND_MENU.row);
    return px >= r.x && px < r.x + r.w && i >= 0 && i < this.handOptions().length && py >= r.y + HAND_MENU.pad ? i : -1;
  }

  private toggleHandMenu(): void {
    const options = this.handOptions();
    this.handMenu = this.handMenu ? null : { sel: Math.max(0, options.indexOf(session.mainWeapon)) };
    audio.play('select'); this.refresh();
  }

  /** Взять в руку выбранное (или убрать оружие) — герой сразу переодевается. */
  private chooseHand(i: number): void {
    const id = this.handOptions()[i];
    if (id === undefined) return;
    session.setMainWeapon(id);
    this.handMenu = null;
    audio.play('pickup'); this.changed();
  }

  /**
   * Список поверх окна — как окна выбора: рамка с золотыми уголками, выбранная строка — алая полоса с золотыми кантами.
   * У каждой строки клетка под иконкой (у «без оружия» — пустая), поэтому названия стоят в одну колонку;
   * у того, что сейчас в руке, справа приглушённая отметка «в руке».
   */
  private drawHandMenu(): void {
    if (!this.handMenu) return;
    // свой слой поверх клеток и иконок окна
    const M = HAND_MENU, r = this.handMenuRect(), main = session.mainWeapon, g = this.add(this.scene.add.graphics());
    drawDropdown(g, r.x, r.y, r.w, r.h);
    const x0 = r.x + M.pad, w = r.w - M.pad * 2;
    this.handOptions().forEach((id, i) => {
      const y = r.y + M.pad + i * M.row, on = i === this.handMenu!.sel, color = on ? COLORS.hover : COLORS.label;
      if (on) drawRowHighlight(g, x0, y, w, M.row);
      const tx = x0 + M.inset, ty = y + (M.row - M.icon) / 2;
      const tile = id ? tileColors(id) : { fill: UI.ironDark, edge: UI.iron };
      g.fillStyle(tile.fill, 1).fillRect(tx, ty, M.icon, M.icon).lineStyle(1, tile.edge, 0.8).strokeRect(tx + 0.5, ty + 0.5, M.icon - 1, M.icon - 1);
      if (id) this.icon(EQUIPMENT[id].icon, tx + M.icon / 2, ty + M.icon / 2, 0.7);
      const textY = buttonTextY(y, M.row);
      this.text(tx + M.icon + M.text, textY, id ? EQUIPMENT[id].name : NO_WEAPON, color);
      if (id === main) this.text(x0 + w - M.inset, textY, IN_HAND, on ? COLORS.hover : COLORS.dim, undefined, 1);
    });
  }

  private buttonAt(px: number, py: number): ButtonId | null {
    for (const id of this.buttons()) {
      const r = this.buttonRect(id);
      if (px >= r.x && py >= r.y && px < r.x + BUTTON_W[id] && py < r.y + BTN.h) return id;
    }
    return null;
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) return;
    // открыт список «Оружие в руке»: клик по строке — выбрать, мимо (кроме самой кнопки) — закрыть список
    if (this.handMenu) {
      const row = this.handRowAt(p.worldX, p.worldY);
      if (row >= 0) { this.chooseHand(row); return; }
      if (this.buttonAt(p.worldX, p.worldY) !== 'hand') { this.handMenu = null; this.refresh(); return; }
    }
    const btn = this.buttonAt(p.worldX, p.worldY);
    if (btn === 'close') { audio.play('click'); this.close(); return; }
    if (btn === 'rotate') { this.rotate(); return; }
    if (btn === 'hand') { this.toggleHandMenu(); return; }
    const f = this.hitTest(p.worldX, p.worldY);
    if (!f) return;
    this.focus = f;
    this.pressed = f;
    this.activate();
  }

  /** Отпустили в другой клетке с предметом в руке — положить туда (перетаскивание). */
  private pointerUp(p: Phaser.Input.Pointer): void {
    const f = this.hitTest(p.worldX, p.worldY), from = this.pressed;
    this.pressed = null;
    if (!this.held || !f || !from || sameFocus(f, from)) return;
    this.focus = f;
    this.activate();
  }

  // ---------------- состояние ----------------
  private slotY(i: number): number { return SLOTS.y + i * (CELL + SLOT_GAP); }
  private slotItem(slot: ArmorSlot): EquipmentId | undefined { return EQUIPMENT_IDS.find((id) => EQUIPMENT[id].slot === slot && session.data.equipped[id]); }
  /** Карманы: купленное, но не надетое, не в рюкзаке и не в сундуке тронного зала (и не в руке). */
  private stashItems(): EquipmentId[] { return session.pocketItems.filter((id) => id !== this.held?.id); }

  /** Снаряжение изменилось: герой переодевается. */
  private changed(): void {
    const outfit = outfitFor(session.data.equipped), sheet = ensureHeroSheet(this.scene, outfit);
    if (sheet !== this.sheet) {
      this.outfit = outfit; this.sheet = sheet;
      this.playHero();
      this.dropPortraits();
      this.queuePortraits();
    }
    this.refresh();
  }

  /** Герой смотрит в сторону TURN[turn]: портретом, если эта сторона уже нарисована, иначе обычным листом. */
  private playHero(): void {
    const dir = TURN[this.turn] ?? PLAYER_DIRECTIONS[0], side = portraitSide(dir), key = this.portraitKey();
    this.showingPortrait = this.scene.anims.exists(key);
    if (this.showingPortrait) this.hero.setTexture(key, '0').setFlipX(side.flip).play(key);
    else this.hero.setTexture(this.sheet, '0').setFlipX(false).play(heroAnimKey(this.sheet, 'idle', dir));
    // в окне герой одного размера, как бы детально ни был нарисован лист
    this.hero.setScale((HERO.scale * HERO_SHEET.frameSize) / this.hero.frame.realWidth);
  }

  private portraitKey(): string { return heroPortraitKey(this.outfit, portraitSide(TURN[this.turn] ?? PLAYER_DIRECTIONS[0]).dir); }

  /** Стороны портрета по порядку поворота, начиная с текущей (зеркальные — одна текстура на две стороны). */
  private queuePortraits(): void {
    const sides = new Set(TURN.map((_, i) => portraitSide(TURN[(this.turn + i) % TURN.length]!).dir));
    this.portraitJobs = [...sides].flatMap((dir) => heroPortraitJobs(this.scene, this.outfit, dir, PORTRAIT.res));
  }

  /** Дорисовывает портрет понемногу за кадр; как только текущая сторона готова — герой сменяется на портрет. */
  private drawPortrait(): void {
    if (this.portraitJobs.length === 0) return;
    const until = performance.now() + PORTRAIT.budgetMs;
    while (this.portraitJobs.length > 0 && performance.now() < until) this.portraitJobs.shift()!();
    if (!this.showingPortrait && this.scene.anims.exists(this.portraitKey())) this.playHero();
  }

  /** Убирает портреты других нарядов и недорисованные (окно закрыли посреди рисования): они занимают память видеокарты. */
  private dropPortraits(): void {
    for (const key of this.scene.textures.getTextureKeys()) {
      if (!key.includes(PORTRAIT_TAG) || key === this.hero.texture.key) continue;
      if (key.startsWith(`${this.sheet}${PORTRAIT_TAG}`) && this.scene.anims.exists(key)) continue;
      this.scene.textures.remove(key);
      this.scene.anims.remove(key);
    }
  }

  // ---------------- отрисовка ----------------
  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const g = this.g.clear();
    if (!this.hero.anims.isPlaying) this.playHero();
    this.drawSlots(g);
    this.drawBag(g);
    this.drawStash(g);
    this.drawHeld(g);
    this.drawButtons(g);
    this.drawHandMenu();
    this.drawTip();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.dynamic.push(o); this.box.add(o); return o; }
  private icon(key: string, x: number, y: number, scale = 1, alpha = 1): Phaser.GameObjects.Image { return this.add(addIcon(this.scene, x, y, key, scale).setAlpha(alpha)); }
  private text(x: number, y: number, s: string, color: number, maxWidth?: number, ax = 0): PText { return this.add(new PText(this.scene, x, y, s, maxWidth ? { color, maxWidth, ax } : { color, ax })); }

  /**
   * Кнопки внизу: под курсором светлеют; «Повернуть» — только с вещью в руке курсора, «Сделать основным» /
   * «Убрать из руки» — для оружия в сумке, на которое навели.
   */
  private drawButtons(g: Phaser.GameObjects.Graphics): void {
    for (const id of this.buttons()) {
      const r = this.buttonRect(id), w = BUTTON_W[id], on = this.hoverBtn === id, lift = on ? 1 : 0;
      const label = BUTTON_LABELS[id];
      drawButton(g, r.x, r.y - lift, w, BTN.h, on);
      this.text(r.x + w / 2, buttonTextY(r.y - lift, BTN.h), label, on ? COLORS.label : COLORS.text, undefined, 0.5);
    }
  }

  /** Клетка: тёмное поле в железной кромке (видно и пустую); выбранная — золотая рамка. */
  private cell(g: Phaser.GameObjects.Graphics, x: number, y: number, w = CELL, h = CELL): void {
    g.fillStyle(UI.iron, 1).fillRect(x, y, w, h);
    g.fillStyle(UI.ironDark, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(0x000000, 0.4).fillRect(x + 1, y + 1, w - 2, 1);
  }

  private focusFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w = CELL, h = CELL): void {
    g.lineStyle(1, UI.goldLight, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawSlots(g: Phaser.GameObjects.Graphics): void {
    // слот сумки — последним в столбце снаряжения
    const packY = this.slotY(ARMOR_SLOTS.length), pack = session.packItem;
    this.cell(g, SLOTS.x, packY);
    if (pack) g.fillStyle(tileColors(pack).fill, 1).fillRect(SLOTS.x + 2, packY + 2, CELL - 4, CELL - 4);
    this.icon(pack ? EQUIPMENT[pack].icon : 'castle_satchel', SLOTS.x + CELL / 2, packY + CELL / 2, 1.25 * ICON_K, pack ? 1 : 0.18);
    if (this.focus.area === 'pack') this.focusFrame(g, SLOTS.x, packY);
    ARMOR_SLOTS.forEach((slot, i) => {
      const y = this.slotY(i), id = this.slotItem(slot);
      this.cell(g, SLOTS.x, y);
      if (id) {
        g.fillStyle(tileColors(id).fill, 1).fillRect(SLOTS.x + 2, y + 2, CELL - 4, CELL - 4);
        this.icon(EQUIPMENT[id].icon, SLOTS.x + CELL / 2, y + CELL / 2, 1.25 * ICON_K);
      } else {
        // пустой слот: блёклая подсказка, что сюда надевается
        const hint = EQUIPMENT_IDS.find((it) => EQUIPMENT[it].slot === slot);
        if (hint) this.icon(EQUIPMENT[hint].icon, SLOTS.x + CELL / 2, y + CELL / 2, 1.25 * ICON_K, 0.18);
      }
      if (this.focus.area === 'slot' && this.focus.i === i) this.focusFrame(g, SLOTS.x, y);
    });
  }

  /** Предмет формой из клеток: заливка по виду, кант только по внешнему краю формы, иконка посередине. */
  private drawItem(g: Phaser.GameObjects.Graphics, id: EquipmentId, ox: number, oy: number, rot: number, alpha = 1, tint?: number): void {
    const cells = shapeCells(id, rot), kind = tileColors(id);
    const has = (x: number, y: number): boolean => cells.some(([cx, cy]) => cx === x && cy === y);
    for (const [cx, cy] of cells) {
      const x = ox + cx * CELL, y = oy + cy * CELL;
      g.fillStyle(tint ?? kind.fill, alpha * (tint ? 0.55 : 1)).fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      // соседние клетки той же вещи сливаются: между ними нет зазора
      if (has(cx + 1, cy)) g.fillRect(x + CELL - 1, y + 1, 2, CELL - 2);
      if (has(cx, cy + 1)) g.fillRect(x + 1, y + CELL - 1, CELL - 2, 2);
      g.fillStyle(kind.edge, alpha);
      if (!has(cx, cy - 1)) g.fillRect(x + 1, y + 1, CELL - 2, 1);
      if (!has(cx - 1, cy)) g.fillRect(x + 1, y + 1, 1, CELL - 2);
      if (!has(cx + 1, cy)) g.fillRect(x + CELL - 2, y + 1, 1, CELL - 2);
      if (!has(cx, cy + 1)) g.fillRect(x + 1, y + CELL - 2, CELL - 2, 1);
    }
    const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
    const art = EQUIPMENT[id].bagArt;
    // картинка по форме предмета — клетка в клетку (поворачивается вместе с формой); иначе — иконка посередине
    if (art) { this.add(this.scene.add.image(ox + (w * CELL) / 2, oy + (h * CELL) / 2, art).setScale(CELL / (BAG_ART.cell * BAG_ART.res)).setAlpha(alpha).setAngle(rot * 90)); return; }
    const scale = (Math.min(w, h) >= 2 ? 2 : 1.5) * ICON_K;
    this.icon(EQUIPMENT[id].icon, ox + (w * CELL) / 2, oy + (h * CELL) / 2, scale, alpha).setAngle(rot * 90);
  }

  private drawBag(g: Phaser.GameObjects.Graphics): void {
    const bag = session.bagSize;
    this.bagLabel.setText(`Сумка ${bag.cols}×${bag.rows}`);
    for (let y = 0; y < bag.rows; y++) for (let x = 0; x < bag.cols; x++) this.cell(g, GRID.x + x * CELL, GRID.y + y * CELL);
    for (const id of EQUIPMENT_IDS) {
      const spot = session.data.bag[id];
      if (spot) this.drawItem(g, id, GRID.x + spot.x * CELL, GRID.y + spot.y * CELL, spot.rot);
    }
    const f = this.focus;
    if (f.area === 'bag' && !this.held) this.focusFrame(g, GRID.x + f.x * CELL, GRID.y + f.y * CELL);
  }

  private drawStash(g: Phaser.GameObjects.Graphics): void {
    const items = this.stashItems();
    for (let i = 0; i < STASH_SIZE; i++) {
      const x = STASH.x + i * CELL, id = items[i];
      this.cell(g, x, STASH.y);
      if (id) {
        g.fillStyle(tileColors(id).fill, 1).fillRect(x + 2, STASH.y + 2, CELL - 4, CELL - 4);
        this.icon(EQUIPMENT[id].icon, x + CELL / 2, STASH.y + CELL / 2, 1.25 * ICON_K);
      }
      if (this.focus.area === 'stash' && this.focus.i === i) this.focusFrame(g, x, STASH.y);
    }
  }

  /** Вещь в выбранной клетке (слот, сумка, рюкзак или карман), если там что-то есть. */
  private focusedItem(): EquipmentId | undefined {
    const f = this.focus;
    if (f.area === 'slot') return this.slotItem(ARMOR_SLOTS[f.i]!);
    if (f.area === 'pack') return session.packItem;
    if (f.area === 'bag') return session.bagItemAt(f.x, f.y) ?? undefined;
    return this.stashItems()[f.i];
  }

  /** Левый верхний угол выбранной клетки. */
  private focusCell(): { x: number; y: number } {
    const f = this.focus;
    if (f.area === 'slot') return { x: SLOTS.x, y: this.slotY(f.i) };
    if (f.area === 'pack') return { x: SLOTS.x, y: this.slotY(ARMOR_SLOTS.length) };
    if (f.area === 'bag') return { x: GRID.x + f.x * CELL, y: GRID.y + f.y * CELL };
    return { x: STASH.x + f.i * CELL, y: STASH.y };
  }

  /**
   * Подсказка у вещи под курсором: название цветом класса, класс и вид, что вещь даёт (описание из лавки); в карманах —
   * пометка, что вещь не действует. Справа от клетки, а если не влезает в экран — слева; не выходит за верх и низ.
   */
  private drawTip(): void {
    const id = this.focusedItem();
    if (!this.tip || !id || this.held || this.handMenu) return;
    const item = EQUIPMENT[id], rarity = RARITIES[item.rarity], inner = TIP.w - TIP.pad * 2;
    const g = this.add(this.scene.add.graphics());
    const lines: [string, number][] = [[item.name, rarity.text], [`${rarity.name} · ${ITEM_KIND_NAMES[item.kind]}`, COLORS.dim], [item.description, COLORS.text]];
    if (this.focus.area === 'stash') lines.push([TIP_POCKET, COLORS.bad]);
    const texts = lines.map(([s, color]) => this.text(0, 0, s, color, inner));
    const h = texts.reduce((sum, t) => sum + t.textHeight, 0) - TIP.slack + TIP.pad * 2;
    const cell = this.focusCell(), right = cell.x + CELL + TIP.gap;
    const x = right + TIP.w <= W - TIP.edge ? right : cell.x - TIP.gap - TIP.w;
    const y = Phaser.Math.Clamp(cell.y, TIP.edge, GAME.height - TIP.edge - h);
    drawDropdown(g, x, y, TIP.w, h);
    let ty = y + TIP.pad - FONT_INK.ui.top;
    for (const t of texts) { t.setPosition(x + TIP.pad, ty); ty += t.textHeight; }
  }

  /** Предмет в руке — над рюкзаком: зелёный, если помещается, красный — если нет; над карманами — в их ячейке. */
  private drawHeld(g: Phaser.GameObjects.Graphics): void {
    const h = this.held, f = this.focus;
    if (!h) return;
    if (f.area === 'bag') {
      const x = f.x - h.gx, y = f.y - h.gy, fits = session.canPlace(h.id, x, y, h.rot);
      this.drawItem(g, h.id, GRID.x + x * CELL, GRID.y + y * CELL, h.rot, 0.85, fits ? 0x3a9a4a : 0xb02e3a);
    } else if (f.area === 'stash') {
      this.icon(EQUIPMENT[h.id].icon, STASH.x + f.i * CELL + CELL / 2, STASH.y + CELL / 2, 1.5 * ICON_K, 0.9);
      this.focusFrame(g, STASH.x + f.i * CELL, STASH.y);
    } else this.icon(EQUIPMENT[h.id].icon, GRID.x - 10, GRID.y + 8, 1.5 * ICON_K, 0.9);
  }
}
