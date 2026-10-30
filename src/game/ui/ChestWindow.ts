import Phaser from 'phaser';
import { COLORS, DEPTH, GAME, KEYS } from '../configs/game';
import { ARMOR_SLOT_NAMES, CHEST, EQUIPMENT, ITEM_KIND_NAMES, POCKETS, RARITIES, type EquipmentId } from '../configs/items';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { buttonTextY, drawButton, drawPanel, drawTitleRibbon, UI } from './Panel';
import { PText } from './PText';

/*
 * Сундук-хранилище тронного зала. Сверху — карманы героя (POCKETS мест), ниже — сундук (по CHEST.perLevel мест
 * за уровень, ряды по CHEST.perLevel клеток). Клик или E по вещи перекладывает её: из карманов в сундук и обратно.
 * В сундуке и карманах вещи не действуют; надеть или положить в рюкзак — в инвентаре.
 * Клавиатура: WASD — выбор клетки или кнопки «Закрыть», E — переложить или закрыть (KEYS). Мышью — клик.
 */

/**
 * Клетка и отступы: pad — от краёв окна и между сеткой и описанием, title — от верхней кромки до первой надписи
 * (под лентой заголовка), label — от верха надписи до клеток, section — от клеток до следующей надписи.
 */
const CELL = 24;
const SPACE = { pad: 14, title: 24, label: 15, section: 10 } as const;
const WIN_W = 400;
/** Кнопка «Закрыть» в правом нижнем углу окна. */
const CLOSE_BTN = { w: 76, h: 16 } as const;

/** Раскладка окна под нынешний размер сундука (rows рядов): окно по содержимому, посередине экрана, без пустоты снизу. */
function chestLayout(rows: number) {
  const h = SPACE.title + SPACE.label + CELL + SPACE.section + SPACE.label + rows * CELL + SPACE.section + CLOSE_BTN.h + SPACE.pad;
  const win = { x: Math.round((GAME.width - WIN_W) / 2), y: Math.round((GAME.height - h) / 2), w: WIN_W, h };
  const pockets = { x: win.x + SPACE.pad, y: win.y + SPACE.title + SPACE.label };
  const grid = { x: pockets.x, y: pockets.y + CELL + SPACE.section + SPACE.label, cols: CHEST.perLevel };
  const infoX = grid.x + CHEST.perLevel * CELL + SPACE.pad;
  const close = { x: win.x + win.w - SPACE.pad - CLOSE_BTN.w, y: grid.y + rows * CELL + SPACE.section, ...CLOSE_BTN };
  return { win, pockets, grid, close, info: { x: infoX, y: pockets.y, w: win.x + win.w - SPACE.pad - infoX } };
}

type Focus = { area: 'pockets' | 'chest' | 'close'; i: number };

export class ChestWindow {
  private readonly box: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  /** То, что перерисовывается при каждом изменении: иконки и тексты. */
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private focus: Focus = { area: 'pockets', i: 0 };
  private readonly L = chestLayout(Math.max(1, Math.ceil(session.chestCapacity / CHEST.perLevel)));
  private readonly onMove = (p: Phaser.Input.Pointer): void => this.pointerMove(p);
  private readonly onDown = (p: Phaser.Input.Pointer): void => this.pointerDown(p);

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void) {
    this.box = scene.add.container(0, 0).setDepth(DEPTH.overlay);
    const dim = scene.add.rectangle(0, 0, GAME.width, GAME.height, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const frame = scene.add.graphics();
    drawPanel(frame, this.L.win.x, this.L.win.y, this.L.win.w, this.L.win.h);
    const title = new PText(scene, GAME.width / 2, 0, 'Сундук', { font: 'big', ax: 0.5, color: COLORS.blade });
    title.setY(drawTitleRibbon(frame, GAME.width / 2, this.L.win.y, title.textWidth));
    this.g = scene.add.graphics();
    this.box.add([dim, frame, title, this.g,
      new PText(scene, this.L.pockets.x, this.L.pockets.y - SPACE.label, `Карманы · ${POCKETS} мест`, { color: COLORS.gold }),
    ]);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerdown', this.onDown);
    this.box.setAlpha(0);
    scene.tweens.add({ targets: this.box, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
    audio.play('select');
    this.refresh();
  }

  update(_dt: number): void { /* окно статичное */ }

  onKey(ev: KeyboardEvent): void {
    const k = ev.code;
    if (k === KEYS.up.code) this.move(0, -1);
    else if (k === KEYS.down.code) this.move(0, 1);
    else if (k === KEYS.left.code) this.move(-1, 0);
    else if (k === KEYS.right.code) this.move(1, 0);
    else if (k === KEYS.interact.code) this.activate();
  }

  close(): void {
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerdown', this.onDown);
    this.box.destroy();
    this.onClose();
  }

  // ---------------- действия ----------------
  /** Переложить выбранную вещь: из карманов в сундук или из сундука в карманы. */
  private activate(): void {
    if (this.focus.area === 'close') { this.close(); return; }
    const id = this.itemAt(this.focus);
    if (!id) return;
    const ok = this.focus.area === 'pockets' ? session.toChest(id) : session.fromChest(id);
    audio.play(ok ? 'pickup' : 'error');
    this.refresh();
  }

  private move(dx: number, dy: number): void {
    const f = this.focus, cols = this.L.grid.cols, cap = session.chestCapacity;
    if (f.area === 'close') {
      if (dy < 0) this.focus = { area: 'chest', i: Math.max(0, cap - 1) };
    } else if (f.area === 'pockets') {
      if (dy > 0 && cap > 0) this.focus = { area: 'chest', i: Math.min(f.i, cap - 1) };
      else this.focus = { area: 'pockets', i: Phaser.Math.Clamp(f.i + dx, 0, POCKETS - 1) };
    } else {
      const i = f.i + dx + dy * cols;
      if (dy < 0 && f.i < cols) this.focus = { area: 'pockets', i: Math.min(f.i, POCKETS - 1) };
      else if (dy > 0 && i >= cap) this.focus = { area: 'close', i: 0 };   // ниже последнего ряда — кнопка «Закрыть»
      else this.focus = { area: 'chest', i: Phaser.Math.Clamp(i, 0, cap - 1) };
    }
    audio.play('select');
    this.refresh();
  }

  private itemAt(f: Focus): EquipmentId | undefined {
    return f.area === 'pockets' ? session.pocketItems[f.i] : f.area === 'chest' ? session.data.chest[f.i] : undefined;
  }

  // ---------------- мышь ----------------
  private hitTest(px: number, py: number): Focus | null {
    const inside = (x: number, y: number, w: number, h: number): boolean => px >= x && py >= y && px < x + w && py < y + h;
    if (inside(this.L.pockets.x, this.L.pockets.y, POCKETS * CELL, CELL)) return { area: 'pockets', i: Math.floor((px - this.L.pockets.x) / CELL) };
    const b = this.L.close;
    if (inside(b.x, b.y, b.w, b.h)) return { area: 'close', i: 0 };
    const cap = session.chestCapacity, rows = Math.ceil(cap / this.L.grid.cols);
    if (!inside(this.L.grid.x, this.L.grid.y, this.L.grid.cols * CELL, rows * CELL)) return null;
    const i = Math.floor((py - this.L.grid.y) / CELL) * this.L.grid.cols + Math.floor((px - this.L.grid.x) / CELL);
    return i < cap ? { area: 'chest', i } : null;
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    const f = this.hitTest(p.worldX, p.worldY);
    if (f && (f.area !== this.focus.area || f.i !== this.focus.i)) { this.focus = f; this.refresh(); }
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    const f = this.hitTest(p.worldX, p.worldY);
    if (!f) return;
    this.focus = f;
    this.activate();
  }

  // ---------------- отрисовка ----------------
  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const g = this.g.clear(), cap = session.chestCapacity;
    for (let i = 0; i < POCKETS; i++) this.slot(g, this.L.pockets.x + i * CELL, this.L.pockets.y, session.pocketItems[i], this.focus.area === 'pockets' && this.focus.i === i);
    this.text(this.L.grid.x, this.L.grid.y - SPACE.label, `Сундук · ${session.data.chest.length}/${cap} · ур. ${session.data.chestLevel}`, COLORS.gold);
    for (let i = 0; i < cap; i++) {
      const x = this.L.grid.x + (i % this.L.grid.cols) * CELL, y = this.L.grid.y + Math.floor(i / this.L.grid.cols) * CELL;
      this.slot(g, x, y, session.data.chest[i], this.focus.area === 'chest' && this.focus.i === i);
    }
    this.drawClose(g);
    this.drawInfo();
  }

  /** Клетка: тёмное поле; с вещью — заливка по виду предмета и иконка; выбранная — золотая рамка. */
  private slot(g: Phaser.GameObjects.Graphics, x: number, y: number, id: EquipmentId | undefined, on: boolean): void {
    g.fillStyle(UI.iron, 1).fillRect(x, y, CELL, CELL);
    g.fillStyle(UI.ironDark, 1).fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    g.fillStyle(0x000000, 0.4).fillRect(x + 1, y + 1, CELL - 2, 1);
    if (id) {
      g.fillStyle(RARITIES[EQUIPMENT[id].rarity].fill, 1).fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      this.add(addIcon(this.scene, x + CELL / 2, y + CELL / 2, EQUIPMENT[id].icon, 1.15));
    }
    if (on) g.lineStyle(1, UI.goldLight, 1).strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
  }

  /** Кнопка «Закрыть»: алая с золотыми кантами; под курсором — ярче. */
  private drawClose(g: Phaser.GameObjects.Graphics): void {
    const b = this.L.close, on = this.focus.area === 'close', lift = on ? 1 : 0;
    drawButton(g, b.x, b.y - lift, b.w, b.h, on);
    this.text(b.x + b.w / 2, buttonTextY(b.y - lift, b.h), 'Закрыть', on ? COLORS.label : COLORS.text, undefined, 0.5);
  }

  /** Описание вещи под выбором и что с ней сделает E. */
  private drawInfo(): void {
    if (this.focus.area === 'close') return;
    const id = this.itemAt(this.focus), inPockets = this.focus.area === 'pockets';
    if (!id) {
      const t = this.text(this.L.info.x, this.L.info.y, 'Пустая клетка', COLORS.gold);
      this.text(this.L.info.x, this.L.info.y + t.textHeight + 4, inPockets ? 'Снятые доспехи и вынутые из сумки вещи лежат в карманах.' : 'Сюда можно переложить вещь из карманов.', COLORS.dim, this.L.info.w);
      return;
    }
    const it = EQUIPMENT[id];
    const t = this.text(this.L.info.x, this.L.info.y, it.name, COLORS.gold, this.L.info.w);
    const kind = it.slot ? ARMOR_SLOT_NAMES[it.slot] : ITEM_KIND_NAMES[it.kind];
    const b = this.text(this.L.info.x, this.L.info.y + t.textHeight + 4, `${kind} · ${inPockets ? 'в карманах' : 'в сундуке'}\n${it.description}`, COLORS.text, this.L.info.w);
    // предупреждение, только если переложить некуда
    const full = inPockets ? (session.data.chest.length >= session.chestCapacity ? 'Сундук полон' : '') : (session.pocketsFree <= 0 ? 'Карманы полны' : '');
    if (full) this.text(this.L.info.x, b.y + b.textHeight + 6, full, COLORS.bad, this.L.info.w);
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.dynamic.push(o); this.box.add(o); return o; }
  private text(x: number, y: number, s: string, color: number, maxWidth?: number, ax = 0): PText {
    return this.add(new PText(this.scene, x, y, s, maxWidth ? { color, maxWidth, ax } : { color, ax }));
  }
}
