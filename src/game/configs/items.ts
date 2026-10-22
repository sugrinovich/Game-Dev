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
  /** Где стоит на карте лагеря (опорная точка — «ноги» здания). */
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
    name: 'Мастерская', x: 176, y: 176,
    description: 'Здесь делают оружие и припарки.',
    costs: [{ wood: 8, stone: 4 }, { wood: 15, stone: 10, fiber: 6 }, { wood: 24, stone: 18, gel: 6, royal_gel: 1 }],
    effects: ['Шипастая дубина: урон +1. Открывает припарки.', 'Костяная палица: урон +1, удары чаще.', 'Королевский молот: урон +1, мощный нокбэк.'],
  },
  hut: {
    name: 'Хижина', x: 464, y: 176,
    description: 'Крепкий дом — крепкое здоровье.',
    costs: [{ wood: 10, fiber: 6 }, { wood: 18, stone: 8, fiber: 10 }, { wood: 28, stone: 14, gel: 8, spores: 5 }],
    effects: ['Макс. здоровье +20.', 'Макс. здоровье +20 ещё раз.', 'Макс. здоровье +20 и уютный очаг.'],
  },
  storage: {
    name: 'Склад', x: 168, y: 304,
    description: 'Больше места в рюкзаке — дальше вылазки.',
    costs: [{ wood: 12, stone: 6 }, { wood: 20, stone: 12, fiber: 8 }, { wood: 30, stone: 22, stinger: 4 }],
    effects: ['Рюкзак +12 мест.', 'Рюкзак +12 мест.', 'Рюкзак +12 мест.'],
  },
  garden: {
    name: 'Огород', x: 470, y: 306,
    description: 'Растёт после каждой вылазки. Урожай — ягоды и волокно.',
    costs: [{ wood: 6, fiber: 8 }, { wood: 12, fiber: 12, gel: 3 }, { wood: 18, fiber: 16, spores: 4 }],
    effects: ['Урожай: 4 ягоды, 2 волокна.', 'Урожай: 6 ягод, 3 волокна.', 'Урожай: 9 ягод, 5 волокон.'],
  },
};

export const WEAPON_NAMES = ['Дубина', 'Шипастая дубина', 'Костяная палица', 'Королевский молот'] as const;
export const POULTICE_COST: Cost = { berries: 2, fiber: 1 };
export const GARDEN_YIELD: Record<number, Cost> = { 1: { berries: 4, fiber: 2 }, 2: { berries: 6, fiber: 3 }, 3: { berries: 9, fiber: 5 } };

export type LocationId = 'hollow' | 'caves' | 'swamp';
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string; theme: string;
  /** false — локация только намечена, играть в неё пока нельзя. */
  playable: boolean;
  requires?: string;
  loot: ResourceId[];
  mobs: string[];
}

export const LOCATIONS: LocationConfig[] = [
  {
    id: 'hollow', name: 'Мшистая Лощина', level: 1, stars: 1, theme: 'hollow', playable: true,
    description: 'Сырой лес у границы лагеря. Слизни, грибы-споровики и шершни. В глубине живёт Король слизней.',
    loot: ['wood', 'stone', 'fiber', 'berries', 'gel', 'spores', 'stinger'], mobs: ['Слизень', 'Споровик', 'Шершень', 'Король слизней'],
  },
  {
    id: 'caves', name: 'Каменные Пещеры', level: 2, stars: 2, theme: 'hollow', playable: false,
    requires: 'Победите Короля слизней',
    description: 'Тёмные туннели с рудой и летучими тварями. Скоро.',
    loot: ['stone'], mobs: ['Скоро'],
  },
  {
    id: 'swamp', name: 'Туманное Болото', level: 3, stars: 3, theme: 'hollow', playable: false,
    requires: 'Пройдите Каменные Пещеры',
    description: 'Ядовитые топи и древние руины. Скоро.',
    loot: ['spores'], mobs: ['Скоро'],
  },
];
