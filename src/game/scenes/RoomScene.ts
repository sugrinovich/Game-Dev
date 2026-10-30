import Phaser from 'phaser';
import { TEXTURES } from '../configs/assets';
import { COLORS, DEPTH, SCENES } from '../configs/game';
import { ROOMS, type RoomId } from '../configs/items';
import { SETTINGS } from '../configs/settings';
import { addCastleAmbience, addCastleFront, addCastleGround, paintCastleGround, ROOM_BOUNDS, ROOM_SIZE, roomGroundKey } from '../systems/CastleArt';
import { MapBounds } from '../systems/MapBounds';
import { audio } from '../systems/Sfx';
import { session } from '../state/Session';
import { WorldScene } from './WorldScene';

const MAP_W = ROOM_SIZE.w;
const MAP_H = ROOM_SIZE.h;
/** Проём в передней стене посередине — выход в тронный зал; герой входит здесь. */
const DOOR = { x: MAP_W / 2, y: MAP_H - ROOM_BOUNDS.bottom - 6 } as const;
const SPAWN = { x: MAP_W / 2, y: MAP_H - 64 } as const;
/**
 * Кузня: лавовая печь посередине, гном у наковальни, витрины с оружием и доспехами; бочка для закалки, тачка с углём
 * и точильный круг — для атмосферы.
 */
const SMITHY = {
  furnace: { x: MAP_W / 2, y: 108 }, smith: { x: 150, y: 184 }, rack: { x: 92, y: 114 }, armor: [{ x: 372, y: 116 }, { x: 408, y: 116 }],
  barrel: { x: 206, y: 194 }, cart: { x: 404, y: 196 }, grind: { x: 62, y: 190 },
} as const;
/** Целебница: ведьма у котла посередине, полки с колбами вдоль задней стены; стол алхимика и кадка с травами. */
const APOTHECARY = { witch: { x: MAP_W / 2, y: 182 }, shelves: [{ x: 110, y: 112 }, { x: 370, y: 112 }], table: { x: 392, y: 196 }, herbs: { x: 82, y: 192 } } as const;
/** Как часто из устья печи летят искры (с). */
const FORGE_SPARKS_EVERY = 0.25;

/** Комната тронного зала: кузня или целебница. Выход — проём в передней стене. */
export class RoomScene extends WorldScene {
  private room: RoomId = 'smithy';
  private sparkT = 0;

  constructor() { super({ key: SCENES.room }); }

  init(data: { room?: RoomId }): void {
    this.room = data.room && session.data.rooms[data.room] ? data.room : 'smithy';
  }

  create(): void {
    const key = roomGroundKey(this.room);
    const map = new MapBounds(MAP_W, MAP_H, ROOM_BOUNDS);
    paintCastleGround(this, key, MAP_W, MAP_H, this.room);
    addCastleGround(this, key, MAP_W);
    this.initWorld(map, 'base');
    addCastleAmbience(this, MAP_W, this.room);
    addCastleFront(this, this.colliders, MAP_W, MAP_H, this.room, DOOR.x);   // ближняя стена с проёмом в зал
    if (this.room === 'smithy') this.buildSmithy();
    else this.buildApothecary();
    this.interactables.push({ x: DOOR.x, y: DOOR.y, radius: 26, promptY: 30, label: () => 'Выйти в тронный зал', use: () => this.goTo(SCENES.base, { from: this.room }) });
    this.add.image(DOOR.x, MAP_H - 30, TEXTURES.glow).setTint(0xffc070).setBlendMode(Phaser.BlendModes.ADD).setScale(2, 1).setAlpha(0.18).setDepth(DEPTH.fx - 25);

    this.createPlayer(SPAWN.x, SPAWN.y);
    this.player.setDepth(SPAWN.y);
    audio.music('calm');
    this.whenUi(() => {
      this.ui.banner(ROOMS[this.room].name, COLORS.blade, 1.6);
    });
  }

  /** Тёплое (или холодное) мерцающее пятно света. */
  private light(x: number, y: number, tint: number, scale: number, alpha: number): void {
    const glow = this.add.image(x, y, TEXTURES.glow).setTint(tint).setScale(scale).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 20);
    this.tweens.add({ targets: glow, alpha: alpha * 0.65, duration: Phaser.Math.Between(500, 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Предмет у стены и круги-препятствия вокруг его основания. */
  private furniture(key: string, x: number, y: number, blockers: readonly (readonly [number, number, number])[]): Phaser.GameObjects.Sprite {
    const s = this.prop(key, x, y);
    for (const [dx, dy, r] of blockers) this.colliders.add(x + dx, y + dy, r);
    return s;
  }

  // ---------------- кузня ----------------
  /** Кузня — пока без торговли: печь, кузнец за работой и обстановка. */
  private buildSmithy(): void {
    const S = SMITHY;
    this.furniture('room_furnace', S.furnace.x, S.furnace.y, [[-36, -4, 12], [-18, -4, 12], [0, -4, 12], [18, -4, 12], [36, -4, 12], [-54, -2, 8], [51, 0, 8]]);
    this.light(S.furnace.x, S.furnace.y - 16, 0xff7a2a, 5.2, 0.42);
    this.light(S.furnace.x, S.furnace.y + 6, 0xff5a1a, 3.4, 0.3);
    this.furniture('npc_smith', S.smith.x, S.smith.y, [[0, -2, 7], [19, -1, 6]]);
    this.light(S.smith.x + 19, S.smith.y - 12, 0xffa040, 1.4, 0.35);
    this.furniture('room_weapons', S.rack.x, S.rack.y, [[-14, -2, 7], [0, -2, 7], [14, -2, 7]]);
    for (const a of S.armor) this.furniture('room_armor', a.x, a.y, [[0, -2, 6]]);
    this.furniture('room_quench', S.barrel.x, S.barrel.y, [[0, -3, 10]]);
    this.furniture('room_coal_cart', S.cart.x, S.cart.y, [[-10, -3, 10], [10, -3, 10]]);
    this.furniture('room_grindstone', S.grind.x, S.grind.y, [[0, -3, 10]]);
    for (const p of [S.barrel, S.cart, S.grind]) this.groundShadow(p.x, p.y, 1.2, 0.7);
  }

  // ---------------- целебница ----------------
  private buildApothecary(): void {
    const A = APOTHECARY;
    for (const s of A.shelves) this.furniture('room_shelves', s.x, s.y, [[-14, -2, 7], [0, -2, 7], [14, -2, 7]]);
    this.furniture('npc_witch', A.witch.x, A.witch.y, [[-6, -2, 6], [7, 0, 8]]);
    this.light(A.witch.x + 7, A.witch.y - 10, 0x5ae07a, 2.2, 0.3);
    this.furniture('room_alchemy', A.table.x, A.table.y, [[-16, -3, 9], [0, -3, 9], [16, -3, 9]]);
    this.light(A.table.x + 10, A.table.y - 22, 0xffc070, 1.2, 0.3);
    this.furniture('room_herbs', A.herbs.x, A.herbs.y, [[-8, -3, 9], [8, -3, 9]]);
    this.light(A.herbs.x, A.herbs.y - 12, 0x7ad0ff, 1.4, 0.22);
    for (const p of [A.table, A.herbs]) this.groundShadow(p.x, p.y, 1.4, 0.7);
    this.interactables.push({ x: A.witch.x + 4, y: A.witch.y + 12, radius: 34, promptY: 50, label: () => 'Ведьма', use: () => this.openWitch() });
  }

  /** Ведьма пока ничего не продаёт (эликсир восполняет отдых у костра) — только подсказывает. */
  private openWitch(): void {
    this.brewFx();
    this.ui.openChoice({
      title: 'Ведьма',
      lines: ['«Зелья, травы и немного тьмы…»', 'Эликсир не купить: отдохни у чёрного костра — и один всегда будет с тобой.', `Эликсиров: ${session.data.poultice}/${SETTINGS.base.poulticeMax}`],
      options: [{ label: 'Уйти', onChoose: () => undefined }],
      width: 340,
    });
  }

  /** Котёл вспыхивает зелёными искрами. */
  private brewFx(): void {
    const { x, y } = APOTHECARY.witch;
    this.fx.burst({ x: x + 7, y: y - 10, count: 24, speed: [20, 70], angle: [-Math.PI, 0], life: [0.5, 1], size: [1, 3], tints: [0x9cffb0, 0x5ae07a, 0xffffff], gravity: -20, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
  }

  goMenu(): void {
    session.save();
    this.scene.stop(SCENES.ui);
    this.goTo(SCENES.menu);
  }

  // ---------------- каждый кадр ----------------
  protected tick(dt: number): void {
    if (this.room === 'smithy' && (this.sparkT -= dt) <= 0) {
      this.sparkT = FORGE_SPARKS_EVERY;
      const { x, y } = SMITHY.furnace;
      this.fx.burst({ x: x + Phaser.Math.Between(-11, 11), y: y - 18, count: 1, speed: [10, 30], angle: [-Math.PI * 0.7, -Math.PI * 0.3], life: [0.8, 1.6], size: [1, 2], tints: [0xffc04a, 0xff8a2a, 0xfff0a0], gravity: -10, blend: Phaser.BlendModes.ADD, depth: DEPTH.fx });
    }
    if (this.player.potionPressed()) this.ui.message('Эликсиры пригодятся на арене');
  }
}
