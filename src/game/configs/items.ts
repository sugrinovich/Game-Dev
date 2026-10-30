/** Улучшения, комнаты замка, магазин и локации. Новое улучшение/комната/локация = новая запись здесь. Единственная валюта — монеты. */
import type { GearId } from '../systems/HeroArt';

/**
 * Улучшения по уровням (ключи — как в старых сохранениях): оружие куёт гном в кузне, здоровье и награду за врагов
 * даёт трон павшего короля, травы для эликсиров растит ведьма в целебнице.
 */
export const BUILDING_IDS = ['workshop', 'hut', 'storage', 'garden'] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export interface BuildingConfig {
  name: string;
  /** Цена в монетах за улучшение до уровня 1, 2, 3. */
  prices: [number, number, number];
  /** Что даёт каждый уровень (строки показываются в окне постройки). */
  effects: [string, string, string];
  description: string;
}

export const BUILDINGS: Record<BuildingId, BuildingConfig> = {
  workshop: {
    name: 'Перековка оружия',
    description: 'Гном-кузнец перековывает оружие у лавовой печи.',
    prices: [40, 80, 140],
    effects: ['Стальной меч: урон +1.', 'Меч ордена: урон +1, удары чаще.', 'Королевский клинок: урон +1, мощный нокбэк.'],
  },
  hut: {
    name: 'Стойкость',
    description: 'Клятва у трона: больше здоровья.',
    prices: [35, 70, 120],
    effects: ['Макс. здоровье +20.', 'Макс. здоровье +20 ещё раз.', 'Макс. здоровье +20 ещё раз.'],
  },
  storage: {
    name: 'Казна ордена',
    description: 'Каждый уровень увеличивает награду за врагов.',
    prices: [30, 60, 100],
    effects: ['+2 монеты за врага.', 'Ещё +2 монеты за врага.', 'Ещё +2 монеты за врага.'],
  },
  garden: {
    name: 'Травы ведьмы',
    description: 'Травы растут после каждой вылазки. Урожай — эликсиры.',
    prices: [25, 50, 90],
    effects: ['Урожай: 1 эликсир.', 'Урожай: 2 эликсира.', 'Урожай: 3 эликсира.'],
  },
};

/** Комнаты тронного зала: кузня и целебница, открываются за плату (один раз). */
export const ROOM_IDS = ['smithy', 'apothecary'] as const;
export type RoomId = (typeof ROOM_IDS)[number];
export interface RoomConfig { name: string; /** Сколько монет стоит открыть (0 — открыто сразу). */ price: number; description: string }
export const ROOMS: Record<RoomId, RoomConfig> = {
  smithy: { name: 'Кузня', price: 50, description: 'Гном-кузнец перековывает оружие у лавовой печи.' },
  apothecary: { name: 'Целебница', price: 100, description: 'Ведьма варит эликсиры и растит травы.' },
};
/** Сундук в тронном зале заперт, пока не пройдена эта арена; открытый сундук — это инвентарь (I). */
export const CHEST_UNLOCK: LocationId = 'courtyard';

export const WEAPON_NAMES = ['Палка', 'Стальной меч', 'Меч ордена', 'Королевский клинок'] as const;
/** Цена эликсира у ведьмы (дешевле, чем у торговца). */
export const POULTICE_PRICE = 8;
/** Сколько эликсиров даёт урожай трав ведьмы на уровне 1, 2, 3. */
export const GARDEN_YIELD: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

export const EQUIPMENT_IDS = ['sword', 'rune', 'satchel', 'helmet', 'armor', 'greaves', 'gloves'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
export type ShopItemId = EquipmentId | 'potion';

/** Слоты доспехов на персонаже — в инвентаре слева от героя. */
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = { head: 'Шлем', chest: 'Нагрудник', legs: 'Штаны', hands: 'Перчатки' };
/** Что предмет улучшает: урон, здоровье, монеты за врага или скорость ударов (секунд между ударами меньше). */
export type ItemStat = 'damage' | 'maxHp' | 'killBonus' | 'attackSpeed';
export type ItemKind = 'weapon' | 'magic' | 'buff' | 'armor';
export const ITEM_KIND_NAMES: Record<ItemKind, string> = { weapon: 'Оружие', magic: 'Магия', buff: 'Усиление', armor: 'Доспех' };
/**
 * Рюкзак — сетка клеток. Оружие, магия и усиления действуют, только пока лежат в рюкзаке;
 * то, что не поместилось, ждёт в сундуке. Предметы можно поворачивать.
 */
export const BAG = { cols: 5, rows: 4 } as const;

export interface ShopItem { name: string; icon: string; price: number; description: string }
export interface EquipmentItem extends ShopItem {
  kind: ItemKind;
  /** Доспех надевается в слот на персонаже, остальное кладётся в рюкзак: форма — строки, '#' — занятая клетка. */
  slot?: ArmorSlot;
  shape?: readonly string[];
  stat: ItemStat;
  bonus: number;
  /** Какая вещь появляется на герое, когда предмет надет: id из GEAR в systems/HeroArt.ts. */
  wear?: GearId;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentItem> = {
  sword: { name: 'Меч стража', kind: 'weapon', shape: ['#', '#', '#'], icon: 'castle_sword', wear: 'sword', price: 30, stat: 'damage', bonus: 2, description: 'Урон +2.' },
  rune: { name: 'Руна ярости', kind: 'magic', shape: ['#.', '##', '#.'], icon: 'item_rune', price: 35, stat: 'attackSpeed', bonus: 0.06, description: 'Удары чаще: на 0,06 с между ударами меньше.' },
  satchel: { name: 'Кошель охотника', kind: 'buff', shape: ['##', '##'], icon: 'castle_satchel', wear: 'purse', price: 25, stat: 'killBonus', bonus: 3, description: 'Монеты за каждого врага +3.' },
  helmet: { name: 'Шлем стража', kind: 'armor', slot: 'head', icon: 'item_helmet', wear: 'helm', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  armor: { name: 'Кольчуга', kind: 'armor', slot: 'chest', icon: 'castle_armor', wear: 'chainmail', price: 45, stat: 'maxHp', bonus: 20, description: 'Максимальное здоровье +20. Отдохните у жаровни после экипировки.' },
  greaves: { name: 'Поножи', kind: 'armor', slot: 'legs', icon: 'item_greaves', wear: 'greaves', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  gloves: { name: 'Латные перчатки', kind: 'armor', slot: 'hands', icon: 'item_gloves', wear: 'gloves', price: 25, stat: 'damage', bonus: 1, description: 'Урон +1.' },
};

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
  ...EQUIPMENT,
  potion: { name: 'Эликсир здоровья', icon: 'castle_potion', price: 12, description: 'Восстанавливает 35 здоровья. Использовать: Q на арене.' },
};
export const ECONOMY = { startingCoins: 30, mobCoins: 6, bossCoins: 30, coinsPerTreasury: 2 } as const;

export type LocationId = 'courtyard' | 'crypt' | 'forge';
/** Ворота между комнатами арены: в какой стене (top — задняя, bottom — нижняя) и где — доля ширины стены (0..1). */
export type PassageSide = 'top' | 'bottom';
export interface PassageConfig { side: PassageSide; at: number }
/**
 * Комната арены: волны (сколько врагов в каждой) и ворота в задней стене в следующую комнату (at — где по ширине,
 * у каждой комнаты своё место) — шипы уходят в пол после последней волны. У последней комнаты ворот нет:
 * там после волн приходит Король Бездны.
 */
export interface ArenaRoomConfig { waves: number[]; exit?: PassageConfig & { side: 'top' } }
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string;
  theme: 'courtyard' | 'crypt' | 'forge';
  rooms: ArenaRoomConfig[]; hpMultiplier: number; reward: number;
}
export const LOCATIONS: LocationConfig[] = [
  { id: 'courtyard', name: 'Турнирный двор', level: 1, stars: 1, theme: 'courtyard',
    description: 'Три комнаты: нежить и орки, в последней — Король Бездны.', hpMultiplier: 1, reward: 25,
    rooms: [{ waves: [3], exit: { side: 'top', at: 0.3 } }, { waves: [2, 3], exit: { side: 'top', at: 0.7 } }, { waves: [] }] },
  { id: 'crypt', name: 'Забытый склеп', level: 2, stars: 2, theme: 'crypt',
    description: 'Четыре комнаты древнего склепа. Приходят огры, враги выносливее.', hpMultiplier: 1.3, reward: 40,
    rooms: [{ waves: [4], exit: { side: 'top', at: 0.7 } }, { waves: [2, 3], exit: { side: 'top', at: 0.3 } }, { waves: [5], exit: { side: 'top', at: 0.5 } }, { waves: [] }] },
  { id: 'forge', name: 'Багровая кузня', level: 3, stars: 3, theme: 'forge',
    description: 'Последнее испытание: четыре комнаты и разъярённый Король Бездны.', hpMultiplier: 1.6, reward: 60,
    rooms: [{ waves: [5], exit: { side: 'top', at: 0.35 } }, { waves: [3, 3], exit: { side: 'top', at: 0.7 } }, { waves: [6], exit: { side: 'top', at: 0.3 } }, { waves: [] }] },
];

const OPPOSITE: Record<PassageSide, PassageSide> = { top: 'bottom', bottom: 'top' };
/** Откуда герой входит в комнату: в первую — через ворота снизу, в следующие — с противоположной стороны прохода. */
export function roomEntry(loc: LocationConfig, room: number): PassageConfig {
  const prev = loc.rooms[room - 1]?.exit;
  return prev ? { side: OPPOSITE[prev.side], at: prev.at } : { side: 'bottom', at: 0.5 };
}
