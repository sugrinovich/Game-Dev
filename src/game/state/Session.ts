import { GAME } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { BAG, BUILDING_IDS, BUILDINGS, CHEST_UNLOCK, ECONOMY, EQUIPMENT, EQUIPMENT_IDS, GARDEN_YIELD, LOCATIONS, POULTICE_PRICE, ROOM_IDS, ROOMS, SHOP_ITEMS, type BuildingId, type EquipmentId, type ItemStat, type LocationId, type RoomId, type ShopItemId } from '../configs/items';

/** Место предмета в рюкзаке: левая верхняя клетка и поворот (четверти оборота по часовой стрелке). */
export interface BagSpot { x: number; y: number; rot: number }

export interface SaveData {
  version: 1;
  buildings: Record<BuildingId, number>;
  /** Открытые комнаты тронного зала. */
  rooms: Record<RoomId, boolean>;
  gardenStage: number;
  poultice: number;
  stats: { expeditions: number; kills: number; deaths: number; kingDefeated: boolean };
  intro: boolean;
  coins: number;
  inventory: Record<EquipmentId, boolean>;
  /** Действует ли предмет: доспех надет или вещь лежит в рюкзаке. */
  equipped: Record<EquipmentId, boolean>;
  bag: Partial<Record<EquipmentId, BagSpot>>;
  cleared: LocationId[];
}

const zero = <T extends string>(keys: readonly T[]): Record<T, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
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
    version: 1,
    buildings: zero(BUILDING_IDS),
    rooms: Object.fromEntries(ROOM_IDS.map((id) => [id, ROOMS[id].price === 0])) as Record<RoomId, boolean>,
    gardenStage: 0,
    poultice: 1,
    stats: { expeditions: 0, kills: 0, deaths: 0, kingDefeated: false },
    intro: false,
    coins: ECONOMY.startingCoins,
    inventory: none(),
    equipped: none(),
    bag: {},
    cleared: [],
  };
}

/** Итоги вылазки для окна отчёта в лагере. */
export interface Report { died: boolean; kills: number; king: boolean; coins: number; cleared: boolean }

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
        buildings: { ...base.buildings, ...parsed.buildings },
        rooms: { ...base.rooms, ...parsed.rooms },
        stats: { ...base.stats, ...parsed.stats },
        inventory: { ...base.inventory, ...parsed.inventory },
        equipped: { ...base.equipped, ...parsed.equipped },
        bag: {},
        cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((id) => LOCATIONS.some((l) => l.id === id)) : [],
      };
      this.data.coins = Number.isFinite(this.data.coins) ? Math.max(0, Math.floor(this.data.coins)) : base.coins;
      // старые сохранения: кто уже ковал оружие или растил травы, тому кузня и целебница открыты
      if (this.data.buildings.workshop > 0) this.data.rooms.smithy = true;
      if (this.data.buildings.garden > 0) this.data.rooms.apothecary = true;
      this.restoreBag(parsed.bag ?? {});
      this.hp = this.maxHp;
      this.clearRun();
      return true;
    } catch { return false; }
  }

  save(): void {
    try { localStorage.setItem(GAME.saveKey, JSON.stringify(this.data)); } catch { /* приватный режим — играем без сохранения */ }
  }

  // ---- параметры героя: постройки + надетые доспехи и вещи в рюкзаке ----
  /** Сколько дают все действующие предметы. */
  bonus(stat: ItemStat): number {
    return EQUIPMENT_IDS.reduce((sum, id) => sum + (this.data.equipped[id] && EQUIPMENT[id].stat === stat ? EQUIPMENT[id].bonus : 0), 0);
  }
  get maxHp(): number { return SETTINGS.base.baseHp + SETTINGS.base.hpPerHut * this.data.buildings.hut + this.bonus('maxHp'); }
  get weaponLevel(): number { return this.data.buildings.workshop; }
  get damage(): number { return SETTINGS.combat.baseDamage + this.weaponLevel + this.bonus('damage'); }
  get attackCooldown(): number { return SETTINGS.combat.attackCooldown - 0.04 * Math.max(0, this.weaponLevel - 1) - this.bonus('attackSpeed'); }
  /** Доплата за каждого врага: казначейство + предметы. */
  get killBonus(): number { return ECONOMY.coinsPerTreasury * this.data.buildings.storage + this.bonus('killBonus'); }

  clearRun(): void { this.runKills = 0; this.runCoins = 0; }

  earnCoins(amount: number): void {
    this.data.coins += amount;
    this.runCoins += amount;
    this.save();
  }

  canBuy(id: ShopItemId): boolean {
    return this.data.coins >= SHOP_ITEMS[id].price && (id === 'potion' ? this.data.poultice < SETTINGS.base.poulticeMax : !this.data.inventory[id]);
  }

  buy(id: ShopItemId): boolean {
    if (!this.canBuy(id)) return false;
    this.data.coins -= SHOP_ITEMS[id].price;
    if (id === 'potion') this.data.poultice += 1;
    else this.data.inventory[id] = true;
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
      return X >= 0 && Y >= 0 && X < BAG.cols && Y < BAG.rows && this.bagItemAt(X, Y, id) === null;
    });
  }

  /** Положить вещь в рюкзак — она начинает действовать. Доспехи в рюкзак не кладутся. */
  placeInBag(id: EquipmentId, x: number, y: number, rot: number): boolean {
    if (!this.data.inventory[id] || EQUIPMENT[id].slot || !this.canPlace(id, x, y, rot)) return false;
    this.data.bag[id] = { x, y, rot };
    this.data.equipped[id] = true;
    this.save();
    return true;
  }

  /** Надеть доспех в его слот на персонаже (то, что было в слоте, уходит в сундук). */
  wearArmor(id: EquipmentId): boolean {
    const slot = EQUIPMENT[id].slot;
    if (!this.data.inventory[id] || !slot) return false;
    for (const other of EQUIPMENT_IDS) if (EQUIPMENT[other].slot === slot) this.data.equipped[other] = false;
    this.data.equipped[id] = true;
    this.save();
    return true;
  }

  /** Снять доспех или вынуть вещь из рюкзака: она уходит в сундук и перестаёт действовать. */
  stash(id: EquipmentId): void {
    delete this.data.bag[id];
    this.data.equipped[id] = false;
    this.hp = Math.min(this.hp, this.maxHp);
    this.save();
  }

  /** Раскладка из сохранения: только купленные вещи, без наложений. Старые сохранения (надето, но места нет) раскладываются сами. */
  private restoreBag(saved: Partial<Record<EquipmentId, BagSpot>>): void {
    for (const id of EQUIPMENT_IDS) {
      const owned = !!this.data.inventory[id];
      if (EQUIPMENT[id].slot) { this.data.equipped[id] = owned && !!this.data.equipped[id]; continue; }
      const spot = saved[id];
      const fits = owned && spot && Number.isInteger(spot.x) && Number.isInteger(spot.y) && this.canPlace(id, spot.x, spot.y, spot.rot | 0);
      const place = fits ? { x: spot.x, y: spot.y, rot: spot.rot | 0 } : owned && this.data.equipped[id] ? this.freeSpot(id) : null;
      if (place) this.data.bag[id] = place;
      this.data.equipped[id] = place !== null;
    }
  }

  /** Первое свободное место для вещи (слева направо, сверху вниз; можно повернуть). */
  private freeSpot(id: EquipmentId): BagSpot | null {
    for (let rot = 0; rot < 4; rot++) for (let y = 0; y < BAG.rows; y++) for (let x = 0; x < BAG.cols; x++) if (this.canPlace(id, x, y, rot)) return { x, y, rot };
    return null;
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

  /** Сундук в тронном зале открывается после победы на арене CHEST_UNLOCK. */
  get chestUnlocked(): boolean { return this.data.cleared.includes(CHEST_UNLOCK); }

  pay(price: number): boolean {
    if (!this.canAfford(price)) return false;
    this.data.coins -= price;
    return true;
  }

  /** Эликсир у ведьмы за монеты. */
  craftPotion(): boolean {
    if (this.data.poultice >= SETTINGS.base.poulticeMax || !this.pay(POULTICE_PRICE)) return false;
    this.data.poultice += 1;
    this.save();
    return true;
  }

  /** Завершение вылазки: монеты уже в кошельке, обновляем статистику. */
  finishRun(died: boolean, king: boolean, cleared = false): Report {
    this.data.stats.expeditions += 1;
    this.data.stats.kills += this.runKills;
    if (died) this.data.stats.deaths += 1;
    if (king) this.data.stats.kingDefeated = true;
    if (this.data.buildings.garden > 0 && this.data.gardenStage < 3) this.data.gardenStage += 1;
    const report = { died, kills: this.runKills, king, coins: this.runCoins, cleared };
    this.lastReport = report;
    this.clearRun();
    this.hp = this.maxHp;
    this.save();
    return report;
  }

  /** Улучшение: оружие, здоровье, награда за врагов или травы. */
  upgrade(id: BuildingId): boolean {
    const lv = this.data.buildings[id];
    if (lv >= 3 || !this.pay(BUILDINGS[id].prices[lv]!)) return false;
    this.data.buildings[id] += 1;
    if (id === 'garden' && this.data.buildings.garden === 1) this.data.gardenStage = 0;
    this.hp = this.maxHp;
    this.save();
    return true;
  }

  /** Урожай трав ведьмы: эликсиры (не больше лимита). Возвращает, сколько получено. */
  harvestGarden(): number {
    const lv = this.data.buildings.garden;
    if (lv === 0 || this.data.gardenStage < 3) return 0;
    const gain = Math.min(GARDEN_YIELD[lv] ?? 0, SETTINGS.base.poulticeMax - this.data.poultice);
    this.data.poultice += gain;
    this.data.gardenStage = 0;
    this.save();
    return gain;
  }
}

export const session = new Session();
