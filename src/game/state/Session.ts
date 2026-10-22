import { GAME } from '../configs/game';
import { SETTINGS } from '../configs/settings';
import { BUILDING_IDS, GARDEN_YIELD, RESOURCES, type BuildingId, type Cost, type ResourceId } from '../configs/items';

export interface SaveData {
  version: 1;
  resources: Record<ResourceId, number>;
  buildings: Record<BuildingId, number>;
  gardenStage: number;
  poultice: number;
  stats: { expeditions: number; kills: number; deaths: number; kingDefeated: boolean };
  intro: boolean;
}

const zero = <T extends string>(keys: readonly T[]): Record<T, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;

function fresh(): SaveData {
  return {
    version: 1,
    resources: { ...zero(RESOURCES), wood: 4, fiber: 2 },
    buildings: zero(BUILDING_IDS),
    gardenStage: 0,
    poultice: 1,
    stats: { expeditions: 0, kills: 0, deaths: 0, kingDefeated: false },
    intro: false,
  };
}

/** Итоги вылазки для окна отчёта в лагере. */
export interface Report { died: boolean; loot: Partial<Record<ResourceId, number>>; lost: number; kills: number; king: boolean }

/** Всё, что игра помнит: сохранение + текущая вылазка. Один общий объект на игру. */
class Session {
  data: SaveData = fresh();
  hp = 60;
  carry: Record<ResourceId, number> = zero(RESOURCES);
  runKills = 0;
  lastReport: Report | null = null;

  hasSave(): boolean {
    try { return localStorage.getItem(GAME.saveKey) !== null; } catch { return false; }
  }

  newGame(): void {
    this.data = fresh();
    this.hp = this.maxHp;
    this.clearCarry();
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
        resources: { ...base.resources, ...parsed.resources },
        buildings: { ...base.buildings, ...parsed.buildings },
        stats: { ...base.stats, ...parsed.stats },
      };
      this.hp = this.maxHp;
      this.clearCarry();
      return true;
    } catch { return false; }
  }

  save(): void {
    try { localStorage.setItem(GAME.saveKey, JSON.stringify(this.data)); } catch { /* приватный режим — играем без сохранения */ }
  }

  // ---- параметры героя, зависящие от построек ----
  get maxHp(): number { return SETTINGS.base.baseHp + SETTINGS.base.hpPerHut * this.data.buildings.hut; }
  get weaponLevel(): number { return this.data.buildings.workshop; }
  get damage(): number { return SETTINGS.combat.baseDamage + this.weaponLevel; }
  get attackCooldown(): number { return SETTINGS.combat.attackCooldown - 0.04 * Math.max(0, this.weaponLevel - 1); }
  get capacity(): number { return SETTINGS.base.baseBackpack + SETTINGS.base.backpackPerStorage * this.data.buildings.storage; }
  get carryCount(): number { return RESOURCES.reduce((n, r) => n + this.carry[r], 0); }

  clearCarry(): void { for (const r of RESOURCES) this.carry[r] = 0; this.runKills = 0; }

  canAfford(cost: Cost): boolean {
    return RESOURCES.every((r) => (cost[r] ?? 0) <= this.data.resources[r]);
  }

  pay(cost: Cost): boolean {
    if (!this.canAfford(cost)) return false;
    for (const r of RESOURCES) this.data.resources[r] -= cost[r] ?? 0;
    return true;
  }

  /** Кладёт добычу в рюкзак. Возвращает, сколько реально поместилось. */
  addCarry(kind: ResourceId, amount: number): number {
    const room = Math.max(0, this.capacity - this.carryCount);
    const n = Math.min(room, amount);
    this.carry[kind] += n;
    return n;
  }

  /** Завершение вылазки: добыча переезжает на склад. */
  finishRun(died: boolean, king: boolean): Report {
    const loot: Partial<Record<ResourceId, number>> = {};
    let lost = 0;
    for (const r of RESOURCES) {
      let n = this.carry[r];
      if (died) { const l = Math.floor(n * SETTINGS.expedition.deathLossShare); lost += l; n -= l; }
      if (n > 0) { loot[r] = n; this.data.resources[r] += n; }
    }
    this.data.stats.expeditions += 1;
    this.data.stats.kills += this.runKills;
    if (died) this.data.stats.deaths += 1;
    if (king) this.data.stats.kingDefeated = true;
    if (this.data.buildings.garden > 0 && this.data.gardenStage < 3) this.data.gardenStage += 1;
    const report = { died, loot, lost, kills: this.runKills, king };
    this.lastReport = report;
    this.clearCarry();
    this.hp = this.maxHp;
    this.save();
    return report;
  }

  /** Улучшение здания (или первая постройка). */
  upgrade(id: BuildingId, cost: Cost): boolean {
    if (this.data.buildings[id] >= 3 || !this.pay(cost)) return false;
    this.data.buildings[id] += 1;
    if (id === 'garden' && this.data.buildings.garden === 1) this.data.gardenStage = 0;
    this.hp = this.maxHp;
    this.save();
    return true;
  }

  harvestGarden(): Cost | null {
    const lv = this.data.buildings.garden;
    if (lv === 0 || this.data.gardenStage < 3) return null;
    const gain = GARDEN_YIELD[lv] ?? {};
    for (const r of RESOURCES) this.data.resources[r] += gain[r] ?? 0;
    this.data.gardenStage = 0;
    this.save();
    return gain;
  }
}

export const session = new Session();
