import { GAME } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { ARENA_FLOORS, BAG_START, CHEST, ECONOMY, EQUIPMENT, EQUIPMENT_IDS, LOCATIONS, POCKETS, ROOM_IDS, ROOMS, SHOP_ITEMS, type BagSize, type EquipmentId, type ItemStat, type LocationId, type RoomId, type ShopItemId } from '../configs/items';
import type { EnemyTypeId } from '../configs/characters';

/** Место предмета в рюкзаке: левая верхняя клетка и поворот (четверти оборота по часовой стрелке). */
export interface BagSpot { x: number; y: number; rot: number }

export interface SaveData {
  version: 2;
  /** Открытые комнаты тронного зала. */
  rooms: Record<RoomId, boolean>;
  poultice: number;
  stats: { expeditions: number; kills: number; deaths: number; kingDefeated: boolean };
  intro: boolean;
  coins: number;
  inventory: Record<EquipmentId, boolean>;
  /** Действует ли предмет: доспех надет или вещь лежит в рюкзаке. */
  equipped: Record<EquipmentId, boolean>;
  bag: Partial<Record<EquipmentId, BagSpot>>;
  /** Вещи в сундуке-хранилище тронного зала (не действуют и не занимают карманы). */
  chest: EquipmentId[];
  /** Уровень сундука: 0 — доступ не куплен, дальше вместимость CHEST.perLevel за уровень. */
  chestLevel: number;
  cleared: LocationId[];
  /** Какие обучающие подсказки игрок уже видел (каждая показывается один раз). */
  tips: string[];
  /** Основное оружие — его герой держит в руке (из оружия в сумке); null — в руке палка, как кулаки. */
  mainWeapon: EquipmentId | null;
  /** Рекорд каждой арены: больше всего этажей, пройденных подряд за одну вылазку. */
  arenaBest: Partial<Record<LocationId, number>>;
}

const none = (): Record<EquipmentId, boolean> => Object.fromEntries(EQUIPMENT_IDS.map((id) => [id, false])) as Record<EquipmentId, boolean>;

/** Клетки формы предмета после rot четвертей оборота по часовой стрелке; левая верхняя клетка рамки — (0, 0). */
export function shapeCells(id: EquipmentId, rot: number): [number, number][] {
  let cells: [number, number][] = [];
  (EQUIPMENT[id].shape ?? ['#']).forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
  for (let r = 0; r < ((rot % 4) + 4) % 4; r++) cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function fresh(): SaveData {
  return {
    version: 2,
    rooms: Object.fromEntries(ROOM_IDS.map((id) => [id, ROOMS[id].price === 0])) as Record<RoomId, boolean>,
    poultice: 1,
    stats: { expeditions: 0, kills: 0, deaths: 0, kingDefeated: false },
    intro: false,
    coins: ECONOMY.startingCoins,
    inventory: none(),
    equipped: none(),
    bag: {},
    chest: [],
    chestLevel: 0,
    cleared: [],
    tips: [],
    mainWeapon: null,
    arenaBest: {},
  };
}

/** Итоги вылазки для окна отчёта в лагере. */
/** Итоги вылазки; floors — сколько этажей пройдено подряд и побит ли рекорд арены. */
export interface Report { died: boolean; kills: number; king: boolean; coins: number; cleared: boolean; floors?: { count: number; record: boolean } }

/** Всё, что игра помнит: сохранение + текущая вылазка. Один общий объект на игру. */
class Session {
  data: SaveData = fresh();
  hp = 60;
  runKills = 0;
  runCoins = 0;
  lastReport: Report | null = null;

  hasSave(): boolean {
    try { return localStorage.getItem(GAME.saveKey) !== null; } catch { return false; }
  }

  newGame(): void {
    this.data = fresh();
    this.hp = this.maxHp;
    this.clearRun();
    this.lastReport = null;
    this.save();
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(GAME.saveKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = fresh();
      this.data = {
        ...base, ...parsed,
        rooms: { ...base.rooms, ...parsed.rooms },
        stats: { ...base.stats, ...parsed.stats },
        inventory: { ...base.inventory, ...parsed.inventory },
        equipped: { ...base.equipped, ...parsed.equipped },
        bag: {},
        chest: Array.isArray(parsed.chest) ? parsed.chest.filter((id, i, all) => EQUIPMENT_IDS.includes(id) && all.indexOf(id) === i) : [],
        chestLevel: Math.max(0, Math.min(CHEST.maxLevel, Math.floor(Number(parsed.chestLevel) || 0))),
        cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((id) => LOCATIONS.some((l) => l.id === id)) : [],
        tips: Array.isArray(parsed.tips) ? parsed.tips.filter((t) => typeof t === 'string') : [],
        mainWeapon: EQUIPMENT_IDS.find((id) => id === parsed.mainWeapon) ?? null,
        arenaBest: Object.fromEntries(LOCATIONS.filter((l) => Number(parsed.arenaBest?.[l.id]) > 0).map((l) => [l.id, Math.min(ARENA_FLOORS, Math.floor(Number(parsed.arenaBest![l.id])))])),
      };
      this.data.coins = Number.isFinite(this.data.coins) ? Math.max(0, Math.floor(this.data.coins)) : base.coins;
      this.data.poultice = Math.max(0, Math.min(SETTINGS.base.poulticeMax, Math.floor(Number(this.data.poultice) || 0)));
      // в сундуке — только купленное и не надетое
      this.data.chest = this.data.chest.filter((id) => this.data.inventory[id]).slice(0, this.chestCapacity);
      for (const id of this.data.chest) this.data.equipped[id] = false;
      this.restoreBag(parsed.bag ?? {});
      // сохранение без основного оружия: в руку — первое оружие из сумки (как было раньше)
      if (!('mainWeapon' in parsed)) this.data.mainWeapon = EQUIPMENT_IDS.find((id) => this.data.equipped[id] && EQUIPMENT[id].kind === 'weapon') ?? null;
      this.hp = this.maxHp;
      this.clearRun();
      return true;
    } catch { return false; }
  }

  /** Обучающая подсказка: true — показать сейчас (и запомнить, что показана), false — уже видели. */
  firstTime(tip: string): boolean {
    if (this.data.tips.includes(tip)) return false;
    this.data.tips.push(tip);
    this.save();
    return true;
  }

  save(): void {
    try { localStorage.setItem(GAME.saveKey, JSON.stringify(this.data)); } catch { /* приватный режим — играем без сохранения */ }
  }

  // ---- параметры героя: постройки + надетые доспехи и вещи в рюкзаке ----
  /** Сколько дают все действующие предметы. */
  bonus(stat: ItemStat): number {
    return EQUIPMENT_IDS.reduce((sum, id) => sum + (this.data.equipped[id] && EQUIPMENT[id].stat === stat ? EQUIPMENT[id].bonus ?? 0 : 0), 0);
  }
  /** Размер сумки: у надетой в слот сумки — свой, без неё — стартовый. */
  get bagSize(): BagSize {
    const pack = this.packItem;
    return pack ? EQUIPMENT[pack].bagSize! : BAG_START;
  }
  /** Основное оружие (только если лежит в сумке) — его герой держит в руке. */
  get mainWeapon(): EquipmentId | null {
    const id = this.data.mainWeapon;
    return id && this.data.equipped[id] && EQUIPMENT[id].kind === 'weapon' ? id : null;
  }
  /** Сделать оружие из сумки основным (null — убрать из руки: останется палка). */
  setMainWeapon(id: EquipmentId | null): boolean {
    if (id && (!this.data.equipped[id] || EQUIPMENT[id].kind !== 'weapon')) return false;
    this.data.mainWeapon = id;
    this.save();
    return true;
  }
  /** Сумка, надетая в слот сумки. */
  get packItem(): EquipmentId | undefined { return EQUIPMENT_IDS.find((id) => EQUIPMENT[id].bagSize && this.data.equipped[id]); }
  get maxHp(): number { return SETTINGS.base.baseHp + this.bonus('maxHp'); }
  get damage(): number { return SETTINGS.combat.baseDamage + this.bonus('damage'); }
  get attackCooldown(): number { return SETTINGS.combat.attackCooldown; }

  clearRun(): void { this.runKills = 0; this.runCoins = 0; }

  earnCoins(amount: number): void {
    this.data.coins += amount;
    this.runCoins += amount;
    this.save();
  }

  /** Хватает ли монет и не куплено ли уже (место в карманах проверяет buy: если его нет — покупка не проходит). */
  canBuy(id: ShopItemId): boolean {
    return this.data.coins >= SHOP_ITEMS[id].price && !this.data.inventory[id];
  }

  buy(id: ShopItemId): boolean {
    if (!this.canBuy(id) || this.pocketsFree <= 0) return false;
    this.data.coins -= SHOP_ITEMS[id].price;
    this.data.inventory[id] = true;
    this.save();
    return true;
  }

  // ---- рюкзак и доспехи ----
  /** Какой предмет лежит в клетке рюкзака (кроме skip). */
  bagItemAt(x: number, y: number, skip?: EquipmentId): EquipmentId | null {
    for (const id of EQUIPMENT_IDS) {
      const spot = this.data.bag[id];
      if (!spot || id === skip) continue;
      if (shapeCells(id, spot.rot).some(([cx, cy]) => spot.x + cx === x && spot.y + cy === y)) return id;
    }
    return null;
  }

  /** Поместится ли предмет: все клетки внутри рюкзака и не заняты другими вещами. */
  canPlace(id: EquipmentId, x: number, y: number, rot: number): boolean {
    return shapeCells(id, rot).every(([cx, cy]) => {
      const X = x + cx, Y = y + cy;
      return X >= 0 && Y >= 0 && X < this.bagSize.cols && Y < this.bagSize.rows && this.bagItemAt(X, Y, id) === null;
    });
  }

  /** Положить вещь в рюкзак — она начинает действовать. Доспехи в рюкзак не кладутся. */
  placeInBag(id: EquipmentId, x: number, y: number, rot: number): boolean {
    if (!this.data.inventory[id] || EQUIPMENT[id].slot || EQUIPMENT[id].bagSize || !this.canPlace(id, x, y, rot)) return false;
    this.data.bag[id] = { x, y, rot };
    this.data.equipped[id] = true;
    // первое оружие в сумке сразу берётся в руку
    if (EQUIPMENT[id].kind === 'weapon' && !this.mainWeapon) this.data.mainWeapon = id;
    this.save();
    return true;
  }

  /** Надеть доспех в его слот на персонаже (то, что было в слоте, уходит в карманы). */
  wearArmor(id: EquipmentId): boolean {
    const slot = EQUIPMENT[id].slot;
    if (!this.data.inventory[id] || !slot) return false;
    for (const other of EQUIPMENT_IDS) if (EQUIPMENT[other].slot === slot) this.data.equipped[other] = false;
    this.data.equipped[id] = true;
    this.save();
    return true;
  }

  /** Надеть сумку в слот сумки (прежняя уходит в карманы) — сетка становится её размера. */
  wearPack(id: EquipmentId): boolean {
    if (!this.data.inventory[id] || !EQUIPMENT[id].bagSize) return false;
    const old = this.packItem;
    if (old) this.data.equipped[old] = false;
    this.data.equipped[id] = true;
    if (this.bagFits()) { this.save(); return true; }
    // в новую сумку раскладка не влезает — оставляем прежнюю
    this.data.equipped[id] = false;
    if (old) this.data.equipped[old] = true;
    return false;
  }

  /** Снять сумку: можно, только если всё из неё поместится в стартовую. */
  removePack(): boolean {
    const pack = this.packItem;
    if (!pack) return false;
    this.data.equipped[pack] = false;
    if (this.bagFits()) { this.save(); return true; }
    this.data.equipped[pack] = true;
    return false;
  }

  /** Все вещи в сумке лежат в пределах её нынешнего размера. */
  private bagFits(): boolean {
    return EQUIPMENT_IDS.every((id) => {
      const spot = this.data.bag[id];
      return !spot || shapeCells(id, spot.rot).every(([cx, cy]) => spot.x + cx < this.bagSize.cols && spot.y + cy < this.bagSize.rows);
    });
  }

  /** Снять доспех или вынуть вещь из сумки: она уходит в карманы и перестаёт действовать. */
  stash(id: EquipmentId): void {
    delete this.data.bag[id];
    this.data.equipped[id] = false;
    if (this.data.mainWeapon === id) this.data.mainWeapon = null;
    this.hp = Math.min(this.hp, this.maxHp);
    this.save();
  }

  /** Раскладка из сохранения: только купленные вещи, без наложений. Старые сохранения (надето, но места нет) раскладываются сами. */
  private restoreBag(saved: Partial<Record<EquipmentId, BagSpot>>): void {
    // сначала то, что надевается в слоты (и сумка — от неё зависит размер сетки), потом вещи в сумке
    for (const id of EQUIPMENT_IDS) if (EQUIPMENT[id].slot || EQUIPMENT[id].bagSize) this.data.equipped[id] = !!this.data.inventory[id] && !!this.data.equipped[id];
    for (const id of EQUIPMENT_IDS) {
      const owned = !!this.data.inventory[id];
      if (EQUIPMENT[id].slot || EQUIPMENT[id].bagSize) continue;
      const spot = saved[id];
      const fits = owned && spot && Number.isInteger(spot.x) && Number.isInteger(spot.y) && this.canPlace(id, spot.x, spot.y, spot.rot | 0);
      const place = fits ? { x: spot.x, y: spot.y, rot: spot.rot | 0 } : owned && this.data.equipped[id] ? this.freeSpot(id) : null;
      if (place) this.data.bag[id] = place;
      this.data.equipped[id] = place !== null;
    }
  }

  /** Первое свободное место для вещи (слева направо, сверху вниз; можно повернуть). */
  private freeSpot(id: EquipmentId): BagSpot | null {
    const { cols, rows } = this.bagSize;
    for (let rot = 0; rot < 4; rot++) for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (this.canPlace(id, x, y, rot)) return { x, y, rot };
    return null;
  }

  /** Орда «Рейтинга»: все виды врагов из пройденных арен сюжета (пусто — рейтинг ещё закрыт). */
  get ratingMobs(): EnemyTypeId[] {
    const mobs = new Set<EnemyTypeId>();
    for (const loc of LOCATIONS) if (this.data.cleared.includes(loc.id)) for (const m of loc.mobs) mobs.add(m);
    return [...mobs];
  }

  /** Конец вылазки: пройдено floors этажей подряд — запоминается больший результат. Возвращает, побит ли рекорд. */
  recordArenaFloors(id: LocationId, floors: number): { count: number; record: boolean } {
    const record = floors > (this.data.arenaBest[id] ?? 0);
    if (record) this.data.arenaBest[id] = floors;
    this.save();
    return { count: floors, record };
  }

  isUnlocked(id: LocationId): boolean {
    const index = LOCATIONS.findIndex((loc) => loc.id === id);
    return index === 0 || (index > 0 && this.data.cleared.includes(LOCATIONS[index - 1]!.id));
  }

  completeArena(id: LocationId): void {
    if (!this.data.cleared.includes(id)) this.data.cleared.push(id);
    this.save();
  }

  canAfford(price: number): boolean { return this.data.coins >= price; }

  /** Открыть комнату тронного зала за её цену. */
  unlockRoom(id: RoomId): boolean {
    if (this.data.rooms[id]) return true;
    if (!this.pay(ROOMS[id].price)) return false;
    this.data.rooms[id] = true;
    this.save();
    return true;
  }

  // ---- карманы и сундук-хранилище ----
  /** Карманы: купленное, но не надетое, не в рюкзаке и не в сундуке. */
  get pocketItems(): EquipmentId[] { return EQUIPMENT_IDS.filter((id) => this.data.inventory[id] && !this.data.equipped[id] && !this.data.chest.includes(id)); }
  get pocketsFree(): number { return POCKETS - this.pocketItems.length; }
  get chestUnlocked(): boolean { return this.data.chestLevel > 0; }
  get chestCapacity(): number { return this.data.chestLevel * CHEST.perLevel; }
  /** Цена следующего шага: купить доступ к сундуку или следующий уровень; null — уже максимум. */
  get chestNextPrice(): number | null {
    const lv = this.data.chestLevel;
    return lv === 0 ? CHEST.price : lv < CHEST.maxLevel ? CHEST.upgrades[lv - 1]! : null;
  }

  /** Купить доступ к сундуку или расширить его на CHEST.perLevel мест. */
  upgradeChest(): boolean {
    const price = this.chestNextPrice;
    if (price === null || !this.pay(price)) return false;
    this.data.chestLevel += 1;
    this.save();
    return true;
  }

  /** Переложить вещь из карманов в сундук (если в нём есть место). */
  toChest(id: EquipmentId): boolean {
    if (!this.pocketItems.includes(id) || this.data.chest.length >= this.chestCapacity) return false;
    this.data.chest.push(id);
    this.save();
    return true;
  }

  /** Достать вещь из сундука в карманы (если в них есть место). */
  fromChest(id: EquipmentId): boolean {
    if (!this.data.chest.includes(id) || this.pocketsFree <= 0) return false;
    this.data.chest = this.data.chest.filter((other) => other !== id);
    this.save();
    return true;
  }

  pay(price: number): boolean {
    if (!this.canAfford(price)) return false;
    this.data.coins -= price;
    return true;
  }

  /** Отдых у трона: здоровье полностью, эликсиры восполняются (купить их нельзя — один всегда с собой), сохранение. */
  rest(): void {
    this.hp = this.maxHp;
    this.data.poultice = SETTINGS.base.poulticeMax;
    this.save();
  }

  /** Завершение вылазки: монеты уже в кошельке, обновляем статистику. */
  finishRun(died: boolean, king: boolean, cleared = false): Report {
    this.data.stats.expeditions += 1;
    this.data.stats.kills += this.runKills;
    if (died) this.data.stats.deaths += 1;
    if (king) this.data.stats.kingDefeated = true;
    const report = { died, kills: this.runKills, king, coins: this.runCoins, cleared };
    this.lastReport = report;
    this.clearRun();
    // лечит только поражение: героя приносят в замок; ушедший сам возвращается с теми ранами, что есть
    if (died) this.hp = this.maxHp;
    this.save();
    return report;
  }

}

export const session = new Session();
