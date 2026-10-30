/** Комнаты замка, сундук, магазин и локации. Новая комната/локация = новая запись здесь. Единственная валюта — монеты. */
import type { GearId } from '../systems/HeroArt';
import type { EnemyTypeId } from './characters';

/** Комнаты тронного зала: кузня и целебница, открываются за плату (один раз). */
export const ROOM_IDS = ['smithy', 'apothecary'] as const;
export type RoomId = (typeof ROOM_IDS)[number];
export interface RoomConfig { name: string; /** Сколько монет стоит открыть (0 — открыто сразу). */ price: number; description: string }
export const ROOMS: Record<RoomId, RoomConfig> = {
  smithy: { name: 'Кузня', price: 50, description: 'Гном-кузнец работает у лавовой печи.' },
  apothecary: { name: 'Целебница', price: 100, description: 'Комната ведьмы, полная трав и зелий.' },
};
/**
 * Сундук-хранилище в тронном зале: сюда перекладывают вещи из карманов. Доступ покупается (price), потом вместимость
 * растёт по уровням: perLevel мест за уровень, до maxLevel; upgrades — цены уровней 2, 3, 4, 5.
 */
export const CHEST = { price: 40, upgrades: [30, 50, 80, 120], perLevel: 8, maxLevel: 5 } as const;

export const EQUIPMENT_IDS = ['sword', 'helmet', 'armor', 'greaves', 'gloves', 'oldBag'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
/** Всё, что продаёт торговец (эликсиры не продаются: один восполняется отдыхом у костра). */
export type ShopItemId = EquipmentId;

/** Слоты доспехов на персонаже — в инвентаре слева от героя. */
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = { head: 'Шлем', chest: 'Нагрудник', legs: 'Штаны', hands: 'Перчатки' };
/** Что предмет улучшает: урон или здоровье. */
export type ItemStat = 'damage' | 'maxHp';
export type ItemKind = 'weapon' | 'magic' | 'buff' | 'armor' | 'pack';
export const ITEM_KIND_NAMES: Record<ItemKind, string> = { weapon: 'Оружие', magic: 'Магия', buff: 'Усиление', armor: 'Доспех', pack: 'Сумка' };
/** Отделы лавки торговца (вкладки после «Все»): какие виды предметов в каждом. В пустом — «Товара пока нет». */
export const SHOP_DEPARTMENTS: readonly { name: string; kinds: readonly ItemKind[] }[] = [
  { name: 'Оружие', kinds: ['weapon'] },
  { name: 'Броня', kinds: ['armor', 'pack'] },
  { name: 'Магия', kinds: ['magic'] },
  { name: 'Бафы', kinds: ['buff'] },
];
/**
 * Сумка — сетка клеток. Оружие, магия и усиления действуют, только пока лежат в сумке;
 * то, что не поместилось, носится в карманах. Предметы можно поворачивать.
 * BAG_START — сумка без покупной (в слоте сумки пусто); BAG — самая большая, под неё размечено окно инвентаря.
 */
export const BAG_START = { cols: 1, rows: 3 } as const;
export const BAG = { cols: 5, rows: 4 } as const;
export interface BagSize { cols: number; rows: number }
/** Карманы героя: столько вещей носится с собой, не действуя (сюда же попадают покупки и снятые доспехи). */
export const POCKETS = 8;

/**
 * Классы (редкость) предметов — от обычного к легендарному: название, фон клетки, кант и цвет подписи.
 * Пока все предметы обычные; остальные классы — на будущее. Палка в руке без оружия — кулаки, у неё класса нет.
 */
export const RARITIES = {
  common: { name: 'Обычный', fill: 0x3a3e48, edge: 0x9aa0ac, text: 0xc4cad4 },
  rare: { name: 'Редкий', fill: 0x223e2a, edge: 0x6ac070, text: 0x8ae090 },
  enchanted: { name: 'Зачарованный', fill: 0x203654, edge: 0x5aa0e0, text: 0x80c0ff },
  epic: { name: 'Эпический', fill: 0x382250, edge: 0xb070e0, text: 0xd0a0ff },
  legendary: { name: 'Легендарный', fill: 0x4a3216, edge: 0xf0a040, text: 0xffc060 },
} as const;
export type Rarity = keyof typeof RARITIES;

export interface ShopItem { name: string; icon: string; price: number; description: string }
export interface EquipmentItem extends ShopItem {
  kind: ItemKind;
  /** Класс предмета: цвет фона в инвентаре и лавке, подпись в описании. */
  rarity: Rarity;
  /** Доспех надевается в слот на персонаже, остальное кладётся в сумку: форма — строки, '#' — занятая клетка. */
  slot?: ArmorSlot;
  shape?: readonly string[];
  /** Сумка: надевается в слот сумки, и сетка становится такого размера. */
  bagSize?: BagSize;
  stat?: ItemStat;
  bonus?: number;
  /** Какая вещь появляется на герое, когда предмет надет: id из GEAR в systems/HeroArt.ts. */
  wear?: GearId;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentItem> = {
  sword: { name: 'Старый меч', kind: 'weapon', rarity: 'common', shape: ['#', '#', '#'], icon: 'castle_sword', wear: 'sword', price: 30, stat: 'damage', bonus: 2, description: 'Урон +2.' },
  helmet: { name: 'Старый шлем', kind: 'armor', rarity: 'common', slot: 'head', icon: 'item_helmet', wear: 'helm', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  armor: { name: 'Старая кольчуга', kind: 'armor', rarity: 'common', slot: 'chest', icon: 'castle_armor', wear: 'chainmail', price: 45, stat: 'maxHp', bonus: 20, description: 'Максимальное здоровье +20.' },
  greaves: { name: 'Старые поножи', kind: 'armor', rarity: 'common', slot: 'legs', icon: 'item_greaves', wear: 'greaves', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  gloves: { name: 'Старые перчатки', kind: 'armor', rarity: 'common', slot: 'hands', icon: 'item_gloves', wear: 'gloves', price: 25, stat: 'damage', bonus: 1, description: 'Урон +1.' },
  oldBag: { name: 'Старая сумка', kind: 'pack', rarity: 'common', icon: 'castle_satchel', price: 35, bagSize: { cols: 2, rows: 3 }, description: 'Наденьте в слот сумки: сумка станет 2×3.' },
};

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = EQUIPMENT;
export const ECONOMY = { startingCoins: 30, mobCoins: 6, bossCoins: 30 } as const;

export type LocationId = 'courtyard' | 'crypt' | 'forge';
/**
 * Арена сюжета — площадка в четырёх стенах: волны врагов (сколько в каждой), после последней — босс. У каждой арены
 * свой будущий босс (по нему и название); пока все три идут на общей старой арене с Королём Бездны.
 * mobs — какие враги приходят на этой арене: из пройденных арен собирается орда режима «Рейтинг».
 */
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string;
  theme: 'courtyard' | 'crypt' | 'forge';
  waves: number[]; hpMultiplier: number; reward: number;
  mobs: readonly EnemyTypeId[];
}
export const LOCATIONS: LocationConfig[] = [
  { id: 'courtyard', name: 'Арена Короля Бездны', level: 1, stars: 1, theme: 'courtyard', mobs: ['skeleton', 'archer', 'orc'],
    description: 'Три волны нежити и орков, в конце — Король Бездны.', hpMultiplier: 1, reward: 25, waves: [3, 4, 5] },
  { id: 'crypt', name: 'Арена Арахнидового монстра', level: 2, stars: 2, theme: 'crypt', mobs: ['skeleton', 'archer', 'orc', 'ogre'],
    description: 'Четыре волны, приходят огры. Своя арена и босс — скоро, пока бой на старой арене.', hpMultiplier: 1.3, reward: 40, waves: [4, 5, 5, 6] },
  { id: 'forge', name: 'Арена Магмового правителя', level: 3, stars: 3, theme: 'forge', mobs: ['skeleton', 'archer', 'orc', 'ogre'],
    description: 'Пять волн и разъярённый босс. Своя арена — скоро, пока бой на старой арене.', hpMultiplier: 1.6, reward: 60, waves: [5, 5, 6, 6, 7] },
];

/**
 * «Рейтинг» — бой на время: герой в точке посередине арены, волны без конца. Арена (тема) рейтинга; первая волна
 * и прирост врагов с каждой волной; через сколько секунд приходит следующая, даже если прежняя не добита;
 * на сколько крепче враги с каждой волной.
 */
export const RATING = { location: 'courtyard' as LocationId, firstWave: 3, perWave: 1, every: 14, hpPerWave: 0.08 } as const;
