/** Постройки, магазин и локации. Новая постройка/локация = новая запись здесь. Единственная валюта — монеты. */

export const BUILDING_IDS = ['workshop', 'hut', 'storage', 'garden'] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export interface BuildingConfig {
  name: string;
  /** Где стоит на карте зала (опорная точка — «ноги» здания). */
  x: number;
  y: number;
  /** Цена в монетах за постройку / улучшение до уровня 1, 2, 3. */
  prices: [number, number, number];
  /** Что даёт каждый уровень (строки показываются в окне постройки). */
  effects: [string, string, string];
  description: string;
}

export const BUILDINGS: Record<BuildingId, BuildingConfig> = {
  workshop: {
    name: 'Оружейная', x: 176, y: 176,
    description: 'Кузница ордена. Улучшайте оружие за монеты.',
    prices: [40, 80, 140],
    effects: ['Стальной меч: урон +1. Открывает эликсиры.', 'Меч ордена: урон +1, удары чаще.', 'Королевский клинок: урон +1, мощный нокбэк.'],
  },
  hut: {
    name: 'Покои рыцаря', x: 464, y: 176,
    description: 'Крепкий дом — крепкое здоровье.',
    prices: [35, 70, 120],
    effects: ['Макс. здоровье +20.', 'Макс. здоровье +20 ещё раз.', 'Макс. здоровье +20 и уютный очаг.'],
  },
  storage: {
    name: 'Казначейство', x: 168, y: 304,
    description: 'Каждый уровень увеличивает награду за врагов.',
    prices: [30, 60, 100],
    effects: ['+2 монеты за врага.', 'Ещё +2 монеты за врага.', 'Ещё +2 монеты за врага.'],
  },
  garden: {
    name: 'Аптекарский стол', x: 470, y: 306,
    description: 'Травы растут после каждой вылазки. Урожай — эликсиры.',
    prices: [25, 50, 90],
    effects: ['Урожай: 1 эликсир.', 'Урожай: 2 эликсира.', 'Урожай: 3 эликсира.'],
  },
};

export const WEAPON_NAMES = ['Палка', 'Стальной меч', 'Меч ордена', 'Королевский клинок'] as const;
/** Цена эликсира в оружейной (дешевле, чем у торговца). */
export const POULTICE_PRICE = 8;
/** Сколько эликсиров даёт урожай аптекарского стола на уровне 1, 2, 3. */
export const GARDEN_YIELD: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

export const EQUIPMENT_IDS = ['sword', 'armor', 'satchel'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
export type ShopItemId = EquipmentId | 'potion';
/** wear — какая вещь появляется на герое, когда предмет надет: id из GEAR в systems/HeroArt.ts (проверяется в Player). */
export const SHOP_ITEMS = {
  sword: { name: 'Меч стража', icon: 'castle_sword', wear: 'sword', price: 30, bonus: 2, description: 'Урон +2. Купленный меч нужно экипировать в инвентаре.' },
  armor: { name: 'Кольчуга', icon: 'castle_armor', wear: 'chainmail', price: 45, bonus: 20, description: 'Максимальное здоровье +20. Отдохните у жаровни после экипировки.' },
  satchel: { name: 'Кошель охотника', icon: 'castle_satchel', wear: 'purse', price: 25, bonus: 3, description: 'Монеты за каждого врага +3.' },
  potion: { name: 'Эликсир здоровья', icon: 'castle_potion', price: 12, description: 'Восстанавливает 35 здоровья. Использовать: Q на арене.' },
} as const;
export const ECONOMY = { startingCoins: 30, mobCoins: 6, bossCoins: 30, coinsPerTreasury: 2 } as const;

export type LocationId = 'courtyard' | 'crypt' | 'forge';
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string;
  theme: 'courtyard' | 'crypt' | 'forge';
  waves: number[]; hpMultiplier: number; reward: number;
}
export const LOCATIONS: LocationConfig[] = [
  { id: 'courtyard', name: 'Турнирный двор', level: 1, stars: 1, theme: 'courtyard',
    description: 'Две волны нежити и орков, затем Король Бездны.', waves: [3, 4], hpMultiplier: 1, reward: 25 },
  { id: 'crypt', name: 'Забытый склеп', level: 2, stars: 2, theme: 'crypt',
    description: 'Три волны в древнем склепе. Приходят огры, враги выносливее.', waves: [4, 4, 5], hpMultiplier: 1.3, reward: 40 },
  { id: 'forge', name: 'Багровая кузня', level: 3, stars: 3, theme: 'forge',
    description: 'Последнее испытание: три волны и разъярённый Король Бездны.', waves: [5, 6, 6], hpMultiplier: 1.6, reward: 60 },
];
