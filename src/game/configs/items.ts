/** Ресурсы, постройки и локации. Новая постройка/локация = новая запись здесь. */

export const RESOURCES = ['wood', 'stone', 'fiber', 'berries', 'gel', 'spores', 'stinger', 'royal_gel'] as const;
export type ResourceId = (typeof RESOURCES)[number];

export const RESOURCE_INFO: Record<ResourceId, { name: string; icon: string }> = {
  wood: { name: 'Дерево', icon: 'icon_wood' },
  stone: { name: 'Камень', icon: 'icon_stone' },
  fiber: { name: 'Волокно', icon: 'icon_fiber' },
  berries: { name: 'Ягоды', icon: 'icon_berries' },
  gel: { name: 'Слизь', icon: 'icon_gel' },
  spores: { name: 'Споры', icon: 'icon_spores' },
  stinger: { name: 'Жало', icon: 'icon_stinger' },
  royal_gel: { name: 'Королевский гель', icon: 'icon_royal_gel' },
};

export type Cost = Partial<Record<ResourceId, number>>;

export const BUILDING_IDS = ['workshop', 'hut', 'storage', 'garden'] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export interface BuildingConfig {
  name: string;
  /** Где стоит на карте зала (опорная точка — «ноги» здания). */
  x: number;
  y: number;
  /** Стоимость постройки / улучшения до уровня 1, 2, 3. */
  costs: [Cost, Cost, Cost];
  /** Что даёт каждый уровень (строки показываются в окне постройки). */
  effects: [string, string, string];
  description: string;
}

export const BUILDINGS: Record<BuildingId, BuildingConfig> = {
  workshop: {
    name: 'Оружейная', x: 176, y: 176,
    description: 'Кузница ордена. Улучшайте оружие за трофеи.',
    costs: [{ wood: 8, stone: 4 }, { wood: 15, stone: 10, fiber: 6 }, { wood: 24, stone: 18, gel: 6, royal_gel: 1 }],
    effects: ['Стальной меч: урон +1. Открывает эликсиры.', 'Меч ордена: урон +1, удары чаще.', 'Королевский клинок: урон +1, мощный нокбэк.'],
  },
  hut: {
    name: 'Покои рыцаря', x: 464, y: 176,
    description: 'Крепкий дом — крепкое здоровье.',
    costs: [{ wood: 10, fiber: 6 }, { wood: 18, stone: 8, fiber: 10 }, { wood: 28, stone: 14, gel: 8, spores: 5 }],
    effects: ['Макс. здоровье +20.', 'Макс. здоровье +20 ещё раз.', 'Макс. здоровье +20 и уютный очаг.'],
  },
  storage: {
    name: 'Казначейство', x: 168, y: 304,
    description: 'Больше места в рюкзаке — дальше вылазки.',
    costs: [{ wood: 12, stone: 6 }, { wood: 20, stone: 12, fiber: 8 }, { wood: 30, stone: 22, stinger: 4 }],
    effects: ['Рюкзак +12 мест.', 'Рюкзак +12 мест.', 'Рюкзак +12 мест.'],
  },
  garden: {
    name: 'Аптекарский стол', x: 470, y: 306,
    description: 'Растёт после каждой вылазки. Урожай — ягоды и волокно.',
    costs: [{ wood: 6, fiber: 8 }, { wood: 12, fiber: 12, gel: 3 }, { wood: 18, fiber: 16, spores: 4 }],
    effects: ['Урожай: 4 ягоды, 2 волокна.', 'Урожай: 6 ягод, 3 волокна.', 'Урожай: 9 ягод, 5 волокон.'],
  },
};

export const WEAPON_NAMES = ['Учебный меч', 'Стальной меч', 'Меч ордена', 'Королевский клинок'] as const;
export const POULTICE_COST: Cost = { berries: 2, fiber: 1 };
export const GARDEN_YIELD: Record<number, Cost> = { 1: { berries: 4, fiber: 2 }, 2: { berries: 6, fiber: 3 }, 3: { berries: 9, fiber: 5 } };

export const EQUIPMENT_IDS = ['sword', 'armor', 'satchel'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
export type ShopItemId = EquipmentId | 'potion';
export const SHOP_ITEMS = {
  sword: { name: 'Меч стража', icon: 'castle_sword', price: 30, bonus: 2, description: 'Урон +2. Купленный меч нужно экипировать в инвентаре.' },
  armor: { name: 'Кольчуга', icon: 'castle_armor', price: 45, bonus: 20, description: 'Максимальное здоровье +20. Отдохните у жаровни после экипировки.' },
  satchel: { name: 'Походная сумка', icon: 'castle_satchel', price: 25, bonus: 12, description: 'Вместимость рюкзака +12. Монеты не занимают место.' },
  potion: { name: 'Эликсир здоровья', icon: 'castle_potion', price: 12, description: 'Восстанавливает 35 здоровья. Использовать: Q на арене.' },
} as const;
export const ECONOMY = { startingCoins: 30, mobCoins: 6, bossCoins: 30 } as const;

// Старые id сохраняются, чтобы не потерять прогресс существующих сохранений.
export type LocationId = 'hollow' | 'caves' | 'swamp';
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string;
  theme: 'courtyard' | 'crypt' | 'forge';
  waves: number[]; hpMultiplier: number; reward: number;
}
export const LOCATIONS: LocationConfig[] = [
  { id: 'hollow', name: 'Турнирный двор', level: 1, stars: 1, theme: 'courtyard',
    description: 'Две волны чудовищ, затем Король слизней.', waves: [3, 4], hpMultiplier: 1, reward: 25 },
  { id: 'caves', name: 'Забытый склеп', level: 2, stars: 2, theme: 'crypt',
    description: 'Три волны в древнем склепе. Враги выносливее.', waves: [4, 4, 5], hpMultiplier: 1.3, reward: 40 },
  { id: 'swamp', name: 'Багровая кузня', level: 3, stars: 3, theme: 'forge',
    description: 'Последнее испытание: три волны и усиленный король.', waves: [5, 6, 6], hpMultiplier: 1.6, reward: 60 },
];
