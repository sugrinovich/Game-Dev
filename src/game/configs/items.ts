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
 * растёт по уровням до maxLevel (chestCapacity); upgrades — цены уровней 2, 3, 4, 5; perLevel — клеток в ряду окна.
 */
export const CHEST = { price: 40, upgrades: [30, 50, 80, 120], perLevel: 8, maxLevel: 5 } as const;
/** Сколько мест в сундуке уровня level: поровну на уровень, а на последнем — ровно столько, сколько всего вещей в игре. */
export function chestCapacity(level: number): number { return Math.round((EQUIPMENT_IDS.length * Math.min(level, CHEST.maxLevel)) / CHEST.maxLevel); }

export const EQUIPMENT_IDS = [
  'sword', 'orcAxe', 'katana', 'bow', 'knightSword', 'guardGlaive', 'thunderHammer', 'hunterBow', 'fireKatana', 'iceGreatsword',
  'helmet', 'armor', 'greaves', 'gloves', 'guardHelm', 'guardCuirass', 'guardGreaves', 'guardGauntlets',
  'oldBag', 'travelBag', 'knightBag',
  'fireScroll', 'sparkWand', 'frostShard', 'lifeStone', 'stormOrb', 'meteorScroll', 'frostVortex', 'spiritBlades', 'darkStaff', 'bloodSweep',
  'ring', 'necklace', 'strongBelt', 'windBoots', 'vampireRing', 'secondWind', 'shadowCloak', 'luckCharm',
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
/** Всё, что продаёт торговец (эликсиры не продаются: один восполняется отдыхом у костра). */
export type ShopItemId = EquipmentId;

/** Слоты доспехов на персонаже — в инвентаре слева от героя. */
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = { head: 'Шлем', chest: 'Нагрудник', legs: 'Штаны', hands: 'Перчатки' };
/** Что предмет улучшает: урон, здоровье, скорость бега, перезарядку рывка и монеты за врагов (speed, dash, coins — в процентах). */
export type ItemStat = 'damage' | 'maxHp' | 'speed' | 'dash' | 'coins';
export type ItemKind = 'weapon' | 'magic' | 'buff' | 'armor' | 'pack';
export const ITEM_KIND_NAMES: Record<ItemKind, string> = { weapon: 'Оружие', magic: 'Магия', buff: 'Усиление', armor: 'Доспех', pack: 'Сумка' };
/** Отделы лавки торговца (вкладки): какие виды предметов в каждом. В пустом — «Товара пока нет». */
export const SHOP_DEPARTMENTS: readonly { name: string; kinds: readonly ItemKind[] }[] = [
  { name: 'Оружие', kinds: ['weapon'] },
  { name: 'Броня', kinds: ['armor'] },
  { name: 'Магия', kinds: ['magic'] },
  { name: 'Бафы', kinds: ['buff'] },
  { name: 'Сумки', kinds: ['pack'] },
];
/**
 * Сумка — сетка клеток. Оружие, магия и усиления действуют, только пока лежат в сумке; оружие складывается — каждое
 * добавляет к одному удару свою черту (WEAPON_TRAITS в characters/Player.ts); оружие в руке — только вид;
 * то, что не поместилось, носится в карманах. Предметы можно поворачивать.
 * Без сумки — BAG_START (1x3); купленная сумка, надетая в слот сумки, делает сетку больше (три уровня, самая большая —
 * BAG 4x5, под неё размечено окно инвентаря).
 */
export const BAG_START = { cols: 1, rows: 3 } as const;
export const BAG = { cols: 4, rows: 5 } as const;
export interface BagSize { cols: number; rows: number }
/** Карманы героя: столько вещей носится с собой, не действуя (сюда же попадают покупки и снятые доспехи). */
export const POCKETS = 8;

/**
 * Классы (редкость) предметов — от обычного к легендарному: название, фон клетки, кант и цвет подписи. Порядок здесь —
 * порядок товаров в лавке (сначала обычные, потом редкие и выше). Палка в руке без оружия — кулаки, у неё класса нет.
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
  /** Картинка в сумке точно по форме предмета (клетки shape), иначе — иконка посередине. */
  bagArt?: string;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentItem> = {
  sword: { name: 'Старый меч', kind: 'weapon', rarity: 'common', shape: ['#', '#', '#'], icon: 'castle_sword', bagArt: 'bag_sword', wear: 'sword', price: 30, stat: 'damage', bonus: 2, description: 'Урон +2. Удар дальше и шире.' },
  orcAxe: { name: 'Топор орка', kind: 'weapon', rarity: 'common', shape: ['##', '#.', '#.'], icon: 'item_orc_axe', bagArt: 'bag_orc_axe', wear: 'axe', price: 40, stat: 'damage', bonus: 3, description: 'Урон +3. Удар тяжелее и медленнее: дрожь и круг урона там, куда бьёте.' },
  katana: { name: 'Ржавая катана', kind: 'weapon', rarity: 'common', shape: ['#', '#', '#'], icon: 'item_katana', bagArt: 'bag_katana', wear: 'katana', price: 35, stat: 'damage', bonus: 2, description: 'Урон +2. Удар быстрее, дальше и шире; второй удар следом, ржавые искры.' },
  bow: { name: 'Деревянный лук', kind: 'weapon', rarity: 'common', shape: ['#.', '##', '#.'], icon: 'item_bow', bagArt: 'bag_bow', wear: 'woodBow', price: 35, stat: 'damage', bonus: 2, description: 'Урон +2. К удару добавляется стрела вперёд.' },
  knightSword: { name: 'Меч рыцаря', kind: 'weapon', rarity: 'rare', shape: ['#', '#', '#'], icon: 'item_knight_sword', bagArt: 'bag_knight_sword', wear: 'knightSword', price: 90, stat: 'damage', bonus: 4, description: 'Урон +4. Удар заметно дальше и шире, золотой след.' },
  // редкие (зелёные) — открываются после 4 обычных своего отдела; сила умеренная — выше будут синие, фиолетовые, оранжевые
  guardGlaive: { name: 'Глефа стража', kind: 'weapon', rarity: 'rare', shape: ['#', '#', '#'], icon: 'item_guard_glaive', bagArt: 'bag_guard_glaive', wear: 'glaive', price: 85, stat: 'damage', bonus: 3, description: 'Урон +3. К удару добавляется укол далеко вперёд.' },
  thunderHammer: { name: 'Молот грома', kind: 'weapon', rarity: 'rare', shape: ['##', '.#', '.#'], icon: 'item_thunder_hammer', bagArt: 'bag_thunder_hammer', wear: 'hammer', price: 95, stat: 'damage', bonus: 4, description: 'Урон +4. Удар тяжелее: дрожь и волна молний там, куда бьёте.' },
  hunterBow: { name: 'Лук охотника', kind: 'weapon', rarity: 'rare', shape: ['#.', '##', '#.'], icon: 'item_hunter_bow', bagArt: 'bag_hunter_bow', wear: 'hunterBow', price: 90, stat: 'damage', bonus: 3, description: 'Урон +3. К удару добавляется залп из трёх стрел.' },
  // зачарованные (синие) — открываются, когда куплены все редкие своего отдела
  fireKatana: { name: 'Огненная катана', kind: 'weapon', rarity: 'enchanted', shape: ['#', '#', '#'], icon: 'item_fire_katana', bagArt: 'bag_fire_katana', wear: 'fireKatana', price: 170, stat: 'damage', bonus: 5, description: 'Урон +5. Быстрый двойной удар, по линии удара вспыхивает огненная волна: ещё +2 урона.' },
  iceGreatsword: { name: 'Ледяной двуручник', kind: 'weapon', rarity: 'enchanted', shape: ['#', '#', '#'], icon: 'item_ice_greatsword', bagArt: 'bag_ice_greatsword', wear: 'iceGreatsword', price: 180, stat: 'damage', bonus: 6, description: 'Урон +6. Тяжёлый широкий удар дальше прочих, по линии удара прорастает лёд: ещё +2 урона.' },
  helmet: { name: 'Старый шлем', kind: 'armor', rarity: 'common', slot: 'head', icon: 'item_helmet', wear: 'helm', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  armor: { name: 'Старая кольчуга', kind: 'armor', rarity: 'common', slot: 'chest', icon: 'castle_armor', wear: 'chainmail', price: 45, stat: 'maxHp', bonus: 20, description: 'Максимальное здоровье +20.' },
  greaves: { name: 'Старые поножи', kind: 'armor', rarity: 'common', slot: 'legs', icon: 'item_greaves', wear: 'greaves', price: 20, stat: 'maxHp', bonus: 10, description: 'Максимальное здоровье +10.' },
  gloves: { name: 'Старые перчатки', kind: 'armor', rarity: 'common', slot: 'hands', icon: 'item_gloves', wear: 'gloves', price: 25, stat: 'damage', bonus: 1, description: 'Урон +1.' },
  guardHelm: { name: 'Шлем стража', kind: 'armor', rarity: 'rare', slot: 'head', icon: 'item_guard_helm', wear: 'guardHelm', price: 70, stat: 'maxHp', bonus: 18, description: 'Максимальное здоровье +18. Сталь с золотым гребнем и алым плюмажем.' },
  guardCuirass: { name: 'Кираса стража', kind: 'armor', rarity: 'rare', slot: 'chest', icon: 'item_guard_cuirass', wear: 'guardCuirass', price: 110, stat: 'maxHp', bonus: 35, description: 'Максимальное здоровье +35. Полированный нагрудник с гербом и наплечниками.' },
  guardGreaves: { name: 'Поножи стража', kind: 'armor', rarity: 'rare', slot: 'legs', icon: 'item_guard_greaves', wear: 'guardGreaves', price: 70, stat: 'maxHp', bonus: 18, description: 'Максимальное здоровье +18. Латы на ногах, золотые наколенники.' },
  guardGauntlets: { name: 'Рукавицы стража', kind: 'armor', rarity: 'rare', slot: 'hands', icon: 'item_guard_gauntlets', wear: 'guardGauntlets', price: 75, stat: 'damage', bonus: 2, description: 'Урон +2. Латные рукавицы с золотыми манжетами.' },
  // сумки — три уровня: наденьте в слот сумки (под доспехами), и сетка станет больше; без сумки — BAG_START
  oldBag: { name: 'Старая сумка', kind: 'pack', rarity: 'common', icon: 'castle_satchel', price: 35, bagSize: { cols: 2, rows: 3 }, description: 'Наденьте в слот сумки — сумка станет 2×3.' },
  travelBag: { name: 'Походная сумка', kind: 'pack', rarity: 'rare', icon: 'item_travel_bag', price: 90, bagSize: { cols: 3, rows: 4 }, description: 'Наденьте в слот сумки — сумка станет 3×4.' },
  knightBag: { name: 'Сумка рыцаря', kind: 'pack', rarity: 'enchanted', icon: 'item_knight_bag', price: 170, bagSize: { cols: 4, rows: 5 }, description: 'Наденьте в слот сумки — сумка станет 4×5, самой большой.' },
  // магия — действует сама, пока лежит в сумке (как именно — MAGIC в characters/Player.ts)
  fireScroll: { name: 'Тлеющий свиток огня', kind: 'magic', rarity: 'common', shape: ['#', '#'], icon: 'item_fire_scroll', price: 35, description: 'Раз в 4 с из героя во все стороны летят мини-фаерболы: урон 2 всем рядом.' },
  sparkWand: { name: 'Треснувший жезл искр', kind: 'magic', rarity: 'common', shape: ['#', '#'], icon: 'item_spark_wand', price: 35, description: 'Раз в 3 с молния бьёт вперёд, куда смотрит герой: урон 2 всем на пути.' },
  frostShard: { name: 'Ледяной осколок', kind: 'magic', rarity: 'common', shape: ['#'], icon: 'item_frost_shard', price: 30, description: 'Раз в 5 с ледяная волна отбрасывает врагов вокруг: урон 1.' },
  lifeStone: { name: 'Тусклый камень жизни', kind: 'magic', rarity: 'common', shape: ['#'], icon: 'item_life_stone', price: 30, description: 'Раз в 5 с восстанавливает 1 здоровья.' },
  stormOrb: { name: 'Сфера грозы', kind: 'magic', rarity: 'rare', shape: ['#'], icon: 'item_storm_orb', price: 90, description: 'Шар молний кружит вокруг героя и бьёт тех, кого коснётся (урон 1).' },
  meteorScroll: { name: 'Свиток метеора', kind: 'magic', rarity: 'rare', shape: ['#', '#'], icon: 'item_meteor_scroll', price: 95, description: 'Раз в 6 с перед героем падает огненный шар: взрыв, урон 3.' },
  frostVortex: { name: 'Ледяной вихрь', kind: 'magic', rarity: 'rare', shape: ['#', '#'], icon: 'item_frost_vortex', price: 90, description: 'Раз в 6 с вперёд идёт вихрь осколков льда и ранит всех на пути.' },
  spiritBlades: { name: 'Призрачные клинки', kind: 'magic', rarity: 'rare', shape: ['##'], icon: 'item_spirit_blades', price: 95, description: 'Раз в 7 с вокруг героя на 3 с кружат три призрачных клинка (урон 1).' },
  darkStaff: { name: 'Посох тьмы', kind: 'magic', rarity: 'enchanted', shape: ['#', '#', '#'], icon: 'item_dark_staff', price: 160, description: 'Раз в 4 с в ближайшего врага летит чёрный огненный шар: взрыв тьмы, урон 4.' },
  bloodSweep: { name: 'Кровавый размах', kind: 'magic', rarity: 'enchanted', shape: ['#', '#'], icon: 'item_blood_sweep', price: 150, description: 'Раз в 5 с вокруг героя разлетаются осколки крови: урон 2, каждое попадание лечит 1 (до 3).' },
  ring: { name: 'Сломанное кольцо силы', kind: 'buff', rarity: 'common', shape: ['#'], icon: 'item_ring', price: 30, stat: 'damage', bonus: 1, description: 'Урон +1. Из трещины в камне сочится сила: при попадании — алые искры.' },
  necklace: { name: 'Потерянное ожерелье скорости', kind: 'buff', rarity: 'common', shape: ['##'], icon: 'item_necklace', price: 30, stat: 'speed', bonus: 10, description: 'Скорость бега +10%. За бегущим героем вьётся ветер.' },
  strongBelt: { name: 'Потёртый пояс силача', kind: 'buff', rarity: 'common', shape: ['##'], icon: 'item_strong_belt', price: 30, stat: 'maxHp', bonus: 15, description: 'Максимальное здоровье +15.' },
  vampireRing: { name: 'Перстень вампира', kind: 'buff', rarity: 'rare', shape: ['#'], icon: 'item_vampire_ring', price: 85, description: 'Каждое 4-е попадание лечит 1 здоровья: из врага к герою тянутся алые искры.' },
  secondWind: { name: 'Амулет второго дыхания', kind: 'buff', rarity: 'rare', shape: ['#'], icon: 'item_second_wind', price: 100, description: 'Раз за вылазку смертельный удар оставляет 1 здоровья и миг неуязвимости.' },
  shadowCloak: { name: 'Плащ тени', kind: 'buff', rarity: 'rare', shape: ['##'], icon: 'item_shadow_cloak', price: 80, description: 'После рывка ещё миг неуязвимости, за героем тянутся тени.' },
  luckCharm: { name: 'Талисман удачи', kind: 'buff', rarity: 'rare', shape: ['#'], icon: 'item_luck_charm', price: 80, stat: 'coins', bonus: 20, description: 'Монеты за врагов +20%.' },
  windBoots: { name: 'Стоптанные сапоги ветра', kind: 'buff', rarity: 'common', shape: ['#'], icon: 'item_wind_boots', price: 30, stat: 'dash', bonus: 25, description: 'Рывок перезаряжается на 25% быстрее.' },
};

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = EQUIPMENT;
/**
 * Монеты: стартовые, за обычного врага и за Короля (умножаются на уровень арены и бонус талисмана удачи).
 * testCoins — для теста: кошелёк при каждом запуске пополняется до стольких монет (0 — выключено, перед публикацией — 0).
 * mobCoins — 3, а не меньше: иначе +20% талисмана удачи округлялись бы в ноль.
 */
export const ECONOMY = { startingCoins: 30, mobCoins: 3, bossCoins: 20, testCoins: 0 } as const;

export type LocationId = 'courtyard' | 'crypt' | 'forge';
/**
 * Этажи арены бесконечны: на каждом своя волна, каждый bossEvery-й — Король Бездны; врагов в волне не больше
 * maxWave; с каждым этажом враги крепче на hpPerFloor, а после каждого босса — ещё на hpGrowth (доли здоровья):
 * без роста по этажам сложенное в сумке оружие убивало всех с одного удара.
 */
export const ARENA_FLOORS = {
  bossEvery: 10, maxWave: 18, hpGrowth: 0.25, hpPerFloor: 0.08,
  /** Пауза между этажами (секунды) и передышка после этажа с Королём — разрядка перед новым ростом. */
  waveDelay: 2.5, bossBreather: 6,
  /** Враги волны появляются не ближе стольких пикселей к герою. */
  spawnDistance: 112,
} as const;

/**
 * План прогрессии арены: с этажа from действует фаза — до следующей фазы; последняя — до конца вылазки.
 * Каждая фаза меняет одно: mobs — кто приходит в волне (по кругу, в этом порядке), rifts — открываются ли разломы
 * в полу (если они есть на арене). Каждый bossEvery-й этаж — Король, фаза на нём не важна.
 */
export interface ArenaPhase { from: number; mobs: readonly EnemyTypeId[]; rifts: boolean }
export const ARENA_PHASES: readonly ArenaPhase[] = [
  { from: 1, mobs: ['skeleton'], rifts: false },                                      // учимся: один тип врага
  { from: 3, mobs: ['skeleton', 'orc'], rifts: false },                               // + орки — быстрее
  { from: 4, mobs: ['skeleton', 'orc', 'archer'], rifts: false },                     // + лучники — угроза издалека
  { from: 6, mobs: ['skeleton', 'orc', 'archer', 'skeleton', 'orc', 'orc'], rifts: true },  // + разломы, дальше — всё вместе
  { from: 11, mobs: ['skeleton', 'orc', 'archer', 'skeleton', 'orc', 'ogre'], rifts: true }, // после Короля — огры (удар по кругу)
];
/** Фаза плана на этом этаже. */
export function arenaPhase(floor: number): ArenaPhase {
  return ARENA_PHASES.filter((p) => p.from <= floor).at(-1) ?? ARENA_PHASES[0]!;
}

/**
 * Разломы в полу (первая арена, с фазы, где rifts: true): открываются сразу по group штук раз в every секунд (случайно
 * в пределах, когда прежние закрылись), живут life секунд, раскрываются за open секунд; в радиусе radius герой идёт
 * медленнее (slow — доля скорости); не ближе minGap к герою и друг к другу при появлении.
 */
export const FLOOR_RIFT = { every: [5, 8], life: 8, open: 0.7, radius: 132, slow: 0.5, group: 3, minGap: 60 } as const;

/**
 * Усиления вылазки: после каждого Короля игрок выбирает одно из BOON_CHOICES случайных (лекция 7: выбор сильнее
 * автоматического улучшения). Действуют до конца вылазки и складываются. stat и bonus — как у предметов
 * (Session.bonus); heal — сразу вылечить; poultice — сразу добавить эликсиров.
 */
export type RunBoonId = 'fury' | 'swift' | 'vigor' | 'greed' | 'flask';
export interface RunBoon { name: string; description: string; icon: string; stat?: ItemStat; bonus?: number; heal?: number; poultice?: number }
export const RUN_BOONS: Record<RunBoonId, RunBoon> = {
  fury: { name: 'Ярость Бездны', description: 'Урон +1 до конца вылазки.', icon: 'item_ring', stat: 'damage', bonus: 1 },
  swift: { name: 'Лёгкий шаг', description: 'Бег +15% до конца вылазки.', icon: 'item_necklace', stat: 'speed', bonus: 15 },
  vigor: { name: 'Крепость', description: 'Здоровье +15 до конца вылазки и сразу лечит 15.', icon: 'item_strong_belt', stat: 'maxHp', bonus: 15, heal: 15 },
  greed: { name: 'Жадность', description: 'Монеты за врагов +25% до конца вылазки.', icon: 'item_luck_charm', stat: 'coins', bonus: 25 },
  flask: { name: 'Запасной эликсир', description: 'Ещё один эликсир (Q) прямо сейчас.', icon: 'ui_potion', poultice: 1 },
};
export const RUN_BOON_IDS = Object.keys(RUN_BOONS) as RunBoonId[];
export const BOON_CHOICES = 3;
/**
 * Арена — уровень: этажи один за другим без конца — на каждом волна врагов (firstWave на первом, на perFloor больше на
 * каждом следующем), каждый ARENA_FLOORS.bossEvery-й — босс. Рекорд — сколько этажей пройдено за вылазку.
 * mobs — чьи листы кадров рисуются при загрузке (кто приходит — решает ARENA_PHASES; огр первой арены рисуется позже,
 * пока открыто окно выбора после Короля); rifts — разломы Бездны: объёмный разлом на задней стене и замедляющие в полу.
 */
export interface LocationConfig {
  id: LocationId; name: string; level: number; stars: number; description: string;
  theme: 'courtyard' | 'crypt' | 'forge';
  firstWave: number; perFloor: number; hpMultiplier: number; reward: number;
  mobs: readonly EnemyTypeId[];
  rifts?: { wall: boolean; floor: boolean };
  /** Арена ещё не сделана: в меню «в разработке», войти нельзя. */
  soon?: boolean;
}
export const LOCATIONS: LocationConfig[] = [
  { id: 'courtyard', name: 'Арена Короля Бездны', level: 1, stars: 1, theme: 'courtyard', mobs: ['skeleton', 'archer', 'orc'], rifts: { wall: true, floor: true },
    description: 'Колизей, расколотый Бездной: волны без конца, разломы в полу замедляют. Каждый 10-й этаж — Король Бездны.', hpMultiplier: 1, reward: 25, firstWave: 2, perFloor: 1 },
  { id: 'crypt', name: 'Арена Арахнидового монстра', level: 2, stars: 2, theme: 'crypt', mobs: ['skeleton', 'archer', 'orc', 'ogre'],
    soon: true, description: 'В разработке: огры, своя арена и свой босс.', hpMultiplier: 1.3, reward: 40, firstWave: 3, perFloor: 1 },
  { id: 'forge', name: 'Арена Магмового правителя', level: 3, stars: 3, theme: 'forge', mobs: ['skeleton', 'archer', 'orc', 'ogre'],
    soon: true, description: 'В разработке: огненная арена и Магмовый правитель.', hpMultiplier: 1.6, reward: 60, firstWave: 4, perFloor: 1 },
];

/**
 * Правило лавки (Session.lockedBy): вещи каждого класса в отделе закрыты, пока в этом отделе не куплены все вещи
 * предыдущего класса (обычные → редкие → зачарованные → …).
 */
/** Отдел лавки, где продаётся предмет. */
export function departmentOf(id: EquipmentId): (typeof SHOP_DEPARTMENTS)[number] | undefined {
  return SHOP_DEPARTMENTS.find((d) => d.kinds.includes(EQUIPMENT[id].kind));
}
