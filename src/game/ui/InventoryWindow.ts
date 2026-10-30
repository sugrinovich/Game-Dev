import Phaser from 'phaser';
import { PLAYER_DIRECTIONS, TEXTURES, type PlayerDirection } from '../configs/assets';
import { COLORS, DEPTH, GAME } from '../configs/game';
import { ARMOR_SLOT_NAMES, ARMOR_SLOTS, BAG, EQUIPMENT, EQUIPMENT_IDS, ITEM_KIND_NAMES, type ArmorSlot, type EquipmentId, type ItemKind } from '../configs/items';
import { outfitFor } from '../characters/Player';
import { ensureHeroSheet, heroAnimKey, heroOrigin } from '../systems/HeroArt';
import { addIcon } from '../systems/IconArt';
import { audio } from '../systems/Sfx';
import { session, shapeCells, type BagSpot } from '../state/Session';
import { drawPanel, drawRibbon, UI } from './Panel';
import { PText } from './PText';

/*
 * Инвентарь-рюкзак. Слева — герой: четыре слота доспехов (шлем, нагрудник, штаны, перчатки), сам герой
 * (медленно поворачивается — видна объёмная модель).
 * Справа — рюкзак-сетка: оружие, магия и усиления занимают клетки своей формой и действуют, только пока лежат в нём.
 * Не поместившееся ждёт в сундуке. Предмет берут и кладут кликом или перетаскиванием, поворачивают R / правой кнопкой.
 * Клавиатура: стрелки — выбор клетки, E / Enter — взять, положить, надеть или снять.
 */

const W = GAME.width;
/** Окно и граница между героем и рюкзаком. */
const WIN = { x: 12, y: 26, w: 456, h: 226, split: 194 } as const;
/** Клетка рюкзака, слота и сундука (пиксели). */
const CELL = 26;
/** Столбец слотов доспехов. */
const SLOTS = { x: 22, y: 56, gap: 4 } as const;
/** Герой: точка под ногами, увеличение, через сколько секунд он поворачивается на 45°. */
const HERO = { x: 124, y: 168, scale: 3, turnEvery: 1.1 } as const;
const GRID = { x: 206, y: 56 } as const;
const INFO = { x: 348, y: 56, w: 110 } as const;
const STASH = { x: 206, y: 180 } as const;
const HINT = { x: 206, y: 212 } as const;
/** Сколько ячеек в сундуке: по одной на каждый предмет. */
const STASH_SIZE = EQUIPMENT_IDS.length;
/** Как герой поворачивается в окне: по кругу. */
const TURN: readonly PlayerDirection[] = ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'];

/** Цвета клеток по виду предмета: заливка и кант. */
const KIND_COLORS: Record<ItemKind, { fill: number; edge: number }> = {
  weapon: { fill: 0x26324a, edge: 0x8aa8d0 },
  magic: { fill: 0x34204a, edge: 0xb070e0 },
  buff: { fill: 0x22382a, edge: 0x7ac070 },
  armor: { fill: 0x3a2e22, edge: 0xc8a060 },
};

type Focus = { area: 'slot'; i: number } | { area: 'bag'; x: number; y: number } | { area: 'stash'; i: number };
/** Предмет в руке: поворот, за какую клетку формы взят, откуда (чтобы вернуть при отмене). */
interface Held { id: EquipmentId; rot: number; gx: number; gy: number; from: BagSpot | null }

/** Что окну нужно от интерфейса. */
export interface InventoryHost { message(text: string, icon?: string): void }

function sameFocus(a: Focus, b: Focus): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export class InventoryWindow {
  private readonly box: Phaser.GameObjects.Container;
  /** То, что перерисовывается при каждом изменении: клетки, предметы, тексты. */
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hero: Phaser.GameObjects.Sprite;
  private sheet = '';
  private turn = 0;
  private turnT: number = HERO.turnEvery;
  private focus: Focus = { area: 'bag', x: 0, y: 0 };
  private held: Held | null = null;
  /** Куда нажали мышью: если отпустили в другом месте — это перетаскивание. */
  private pressed: Focus | null = null;
  private readonly onMove = (p: Phaser.Input.Pointer): void => this.pointerMove(p);
  private readonly onDown = (p: Phaser.Input.Pointer): void => this.pointerDown(p);
  private readonly onUp = (p: Phaser.Input.Pointer): void => this.pointerUp(p);

  constructor(private readonly scene: Phaser.Scene, _host: InventoryHost, private readonly onClose: () => void) {
    this.box = scene.add.container(0, 0).setDepth(DEPTH.overlay);
    const dim = scene.add.rectangle(0, 0, W, GAME.height, 0x0b0919, 0.62).setOrigin(0, 0).setInteractive();
    const frame = scene.add.graphics();
    drawPanel(frame, WIN.x, WIN.y, WIN.w, WIN.h);
    frame.fillStyle(UI.goldDark, 0.8).fillRect(WIN.x + WIN.split, WIN.y + 18, 1, WIN.h - 30);
    const title = new PText(scene, W / 2, WIN.y - 4, 'Инвентарь', { font: 'big', ax: 0.5, color: COLORS.blade });
    drawRibbon(frame, W / 2, WIN.y - 6, Math.max(80, title.textWidth + 24), 22);
    const pedestal = scene.add.image(HERO.x, HERO.y, TEXTURES.shadow).setScale(2.2, 1.6);
    this.sheet = ensureHeroSheet(scene, outfitFor(session.data.equipped));
    const o = heroOrigin();
    this.hero = scene.add.sprite(HERO.x, HERO.y, this.sheet, '0').setOrigin(o.x, o.y).setScale(HERO.scale / GAME.resolution);
    this.g = scene.add.graphics();
    this.box.add([dim, frame, title, pedestal, this.hero, this.g,
      new PText(scene, SLOTS.x, 44, 'Снаряжение', { color: COLORS.gold }),
      new PText(scene, GRID.x, 44, `Рюкзак ${BAG.cols}×${BAG.rows}`, { color: COLORS.gold }),
      new PText(scene, STASH.x, STASH.y - 13, 'Сундук — здесь вещи не действуют', { color: COLORS.dim }),
      new PText(scene, HINT.x, HINT.y, 'ЛКМ / E — взять, положить, надеть\nR / ПКМ — повернуть   ESC — отмена', { color: COLORS.dim }),
      new PText(scene, WIN.x + WIN.w - 10, WIN.y + WIN.h - 16, 'I / ESC — закрыть', { ax: 1, color: COLORS.dim }),
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
    if ((this.turnT -= dt) > 0) return;
    this.turnT = HERO.turnEvery;
    this.turn = (this.turn + 1) % TURN.length;
    this.playHero();
  }

  onKey(ev: KeyboardEvent): void {
    const k = ev.code;
    if (k === 'ArrowUp' || k === 'KeyW') this.move(0, -1);
    else if (k === 'ArrowDown' || k === 'KeyS') this.move(0, 1);
    else if (k === 'ArrowLeft' || k === 'KeyA') this.move(-1, 0);
    else if (k === 'ArrowRight' || k === 'KeyD') this.move(1, 0);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyE') this.activate();
    else if (k === 'KeyR') this.rotate();
    else if (k === 'Escape') { if (this.held) this.cancel(); else this.close(); }
    else if (k === 'KeyI') this.close();
  }

  close(): void {
    this.cancel();
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointerup', this.onUp);
    this.box.destroy();
    this.onClose();
  }

  // ---------------- действия ----------------
  private activate(): void {
    const f = this.focus, h = this.held;
    if (f.area === 'slot') {
      const id = this.slotItem(ARMOR_SLOTS[f.i]!);
      if (h || !id) { if (h) audio.play('error'); return; }
      session.stash(id); audio.play('click'); this.changed();
      return;
    }
    if (f.area === 'stash') {
      if (h) { this.held = null; audio.play('click'); this.changed(); return; }   // вещь уже в сундуке — просто отпускаем
      const id = this.stashItems()[f.i];
      if (!id) return;
      if (EQUIPMENT[id].slot) { session.wearArmor(id); audio.play('pickup'); this.changed(); return; }
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
    const f = this.focus, slots = ARMOR_SLOTS.length;
    if (f.area === 'slot') {
      if (dx > 0) this.focus = { area: 'bag', x: 0, y: Math.min(f.i, BAG.rows - 1) };
      else if (dy) this.focus = { area: 'slot', i: Phaser.Math.Clamp(f.i + dy, 0, slots - 1) };
    } else if (f.area === 'bag') {
      const x = f.x + dx, y = f.y + dy;
      if (x < 0) this.focus = { area: 'slot', i: Math.min(f.y, slots - 1) };
      else if (y >= BAG.rows) this.focus = { area: 'stash', i: Math.min(f.x, STASH_SIZE - 1) };
      else this.focus = { area: 'bag', x: Math.min(BAG.cols - 1, x), y: Math.max(0, y) };
    } else if (dy < 0) this.focus = { area: 'bag', x: Math.min(f.i, BAG.cols - 1), y: BAG.rows - 1 };
    else if (dx) this.focus = f.i + dx < 0 ? { area: 'slot', i: slots - 1 } : { area: 'stash', i: Math.min(STASH_SIZE - 1, f.i + dx) };
    this.refresh();
  }

  // ---------------- мышь ----------------
  private hitTest(px: number, py: number): Focus | null {
    const inside = (x: number, y: number, w: number, h: number): boolean => px >= x && py >= y && px < x + w && py < y + h;
    for (let i = 0; i < ARMOR_SLOTS.length; i++) if (inside(SLOTS.x, this.slotY(i), CELL, CELL)) return { area: 'slot', i };
    if (inside(GRID.x, GRID.y, BAG.cols * CELL, BAG.rows * CELL)) return { area: 'bag', x: Math.floor((px - GRID.x) / CELL), y: Math.floor((py - GRID.y) / CELL) };
    if (inside(STASH.x, STASH.y, STASH_SIZE * CELL, CELL)) return { area: 'stash', i: Math.floor((px - STASH.x) / CELL) };
    return null;
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    const f = this.hitTest(p.worldX, p.worldY);
    if (f && !sameFocus(f, this.focus)) { this.focus = f; this.refresh(); }
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) { this.rotate(); return; }
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
  private slotY(i: number): number { return SLOTS.y + i * (CELL + SLOTS.gap); }
  private slotItem(slot: ArmorSlot): EquipmentId | undefined { return EQUIPMENT_IDS.find((id) => EQUIPMENT[id].slot === slot && session.data.equipped[id]); }
  /** Сундук: купленное, но не надетое и не в рюкзаке (и не в руке). */
  private stashItems(): EquipmentId[] { return EQUIPMENT_IDS.filter((id) => session.data.inventory[id] && !session.data.equipped[id] && id !== this.held?.id); }

  /** Снаряжение изменилось: герой переодевается. */
  private changed(): void {
    const sheet = ensureHeroSheet(this.scene, outfitFor(session.data.equipped));
    if (sheet !== this.sheet) { this.sheet = sheet; this.playHero(); }
    this.refresh();
  }

  private playHero(): void { this.hero.setTexture(this.sheet, '0').play(heroAnimKey(this.sheet, 'idle', TURN[this.turn] ?? PLAYER_DIRECTIONS[0])); }

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
    this.drawInfo();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.dynamic.push(o); this.box.add(o); return o; }
  private icon(key: string, x: number, y: number, scale = 1, alpha = 1): Phaser.GameObjects.Image { return this.add(addIcon(this.scene, x, y, key, scale).setAlpha(alpha)); }
  private text(x: number, y: number, s: string, color: number, maxWidth?: number): PText { return this.add(new PText(this.scene, x, y, s, maxWidth ? { color, maxWidth } : { color })); }

  /** Клетка: тёмное поле с утопленной кромкой; выбранная — золотая рамка. */
  private cell(g: Phaser.GameObjects.Graphics, x: number, y: number, w = CELL, h = CELL): void {
    g.fillStyle(UI.ironDark, 1).fillRect(x, y, w, h);
    g.fillStyle(UI.field, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(0x000000, 0.4).fillRect(x + 1, y + 1, w - 2, 1);
  }

  private focusFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w = CELL, h = CELL): void {
    g.lineStyle(1, UI.goldLight, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawSlots(g: Phaser.GameObjects.Graphics): void {
    ARMOR_SLOTS.forEach((slot, i) => {
      const y = this.slotY(i), id = this.slotItem(slot);
      this.cell(g, SLOTS.x, y);
      if (id) {
        g.fillStyle(KIND_COLORS.armor.fill, 1).fillRect(SLOTS.x + 2, y + 2, CELL - 4, CELL - 4);
        this.icon(EQUIPMENT[id].icon, SLOTS.x + CELL / 2, y + CELL / 2, 1.25);
      } else {
        // пустой слот: блёклая подсказка, что сюда надевается
        const hint = EQUIPMENT_IDS.find((it) => EQUIPMENT[it].slot === slot);
        if (hint) this.icon(EQUIPMENT[hint].icon, SLOTS.x + CELL / 2, y + CELL / 2, 1.25, 0.18);
      }
      if (this.focus.area === 'slot' && this.focus.i === i) this.focusFrame(g, SLOTS.x, y);
    });
  }

  /** Предмет формой из клеток: заливка по виду, кант только по внешнему краю формы, иконка посередине. */
  private drawItem(g: Phaser.GameObjects.Graphics, id: EquipmentId, ox: number, oy: number, rot: number, alpha = 1, tint?: number): void {
    const cells = shapeCells(id, rot), kind = KIND_COLORS[EQUIPMENT[id].kind];
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
    const scale = Math.min(w, h) >= 2 ? 2 : 1.5;
    this.icon(EQUIPMENT[id].icon, ox + (w * CELL) / 2, oy + (h * CELL) / 2, scale, alpha).setAngle(rot * 90);
  }

  private drawBag(g: Phaser.GameObjects.Graphics): void {
    for (let y = 0; y < BAG.rows; y++) for (let x = 0; x < BAG.cols; x++) this.cell(g, GRID.x + x * CELL, GRID.y + y * CELL);
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
        g.fillStyle(KIND_COLORS[EQUIPMENT[id].kind].fill, 1).fillRect(x + 2, STASH.y + 2, CELL - 4, CELL - 4);
        this.icon(EQUIPMENT[id].icon, x + CELL / 2, STASH.y + CELL / 2, 1.25);
      }
      if (this.focus.area === 'stash' && this.focus.i === i) this.focusFrame(g, x, STASH.y);
    }
  }

  /** Предмет в руке — над рюкзаком: зелёный, если помещается, красный — если нет; над сундуком — в его ячейке. */
  private drawHeld(g: Phaser.GameObjects.Graphics): void {
    const h = this.held, f = this.focus;
    if (!h) return;
    if (f.area === 'bag') {
      const x = f.x - h.gx, y = f.y - h.gy, fits = session.canPlace(h.id, x, y, h.rot);
      this.drawItem(g, h.id, GRID.x + x * CELL, GRID.y + y * CELL, h.rot, 0.85, fits ? 0x3a9a4a : 0xb02e3a);
    } else if (f.area === 'stash') {
      this.icon(EQUIPMENT[h.id].icon, STASH.x + f.i * CELL + CELL / 2, STASH.y + CELL / 2, 1.5, 0.9);
      this.focusFrame(g, STASH.x + f.i * CELL, STASH.y);
    } else this.icon(EQUIPMENT[h.id].icon, GRID.x - 12, GRID.y + 8, 1.5, 0.9);
  }

  /** Описание: предмет в руке или под курсором, пустой слот или клетка. */
  private drawInfo(): void {
    const f = this.focus;
    let id: EquipmentId | undefined = this.held?.id, place = this.held ? 'в руке' : '';
    let title = '', body = '';
    if (!id && f.area === 'bag') { id = session.bagItemAt(f.x, f.y) ?? undefined; place = 'в рюкзаке'; }
    if (!id && f.area === 'stash') { id = this.stashItems()[f.i]; place = 'в сундуке'; }
    if (!id && f.area === 'slot') {
      const slot = ARMOR_SLOTS[f.i]!;
      id = this.slotItem(slot); place = 'надето';
      if (!id) { title = ARMOR_SLOT_NAMES[slot]; body = 'Слот пуст. Доспехи продаёт торговец в замке.'; }
    }
    if (id) {
      const it = EQUIPMENT[id];
      title = it.name;
      body = `${it.slot ? ARMOR_SLOT_NAMES[it.slot] : ITEM_KIND_NAMES[it.kind]} · ${place}\n${it.description}`;
    } else if (!title) { title = 'Пустая клетка'; body = 'Положите сюда оружие, магию или усиление из сундука.'; }
    const t = this.text(INFO.x, INFO.y, title, COLORS.gold, INFO.w);
    this.text(INFO.x, INFO.y + t.textHeight + 4, body, COLORS.text, INFO.w);
  }
}
