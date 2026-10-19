/**
 * design/38 · 杀人夺宝生成器（关态可测）
 * 外观选型：表内 sprite=mon_black_robe_minion（人形战斗）＋头顶名号；
 * 玩家素体／outfit 变体成本过高，本刀最小可用。无新 OpenFlag。
 */
import { DROPS, MONSTERS, type MonsterDef } from './data';
import type { Monster } from './scenes/Monster';

export const ROGUE_TEMPLATE_ID = 'rogue_cultivator';
export const ROGUE_MAP_ID = 'luoxia_outskirts_2';
export const ROGUE_MAX_ALIVE = 2;
export const ROGUE_RESPAWN_MS = 45_000;
export const ROGUE_DROP_T1 = 'drop_seize_rogue_t1';
export const ROGUE_DROP_T2 = 'drop_seize_rogue_t2';

/** 称谓池 × 名号池 →「散修·青岚」 */
export const ROGUE_TITLE_POOL = ['散修', '路人修士', '劫道客'] as const;
export const ROGUE_NAME_POOL = [
  '青岚', '无痕', '暮雨', '寒潭', '孤鸿', '断川',
  '沉锋', '夜泊', '听雪', '归尘', '碎星', '渡川',
] as const;

export type RogueTier = 'T1' | 'T2';

/** T2 覆盖（落表报告定值） */
export const ROGUE_T2_OVERRIDE = {
  level: 20,
  hp: 663,
  atk: 73,
  def: 12,
  exp: 40,
  dropTable: ROGUE_DROP_T2,
} as const;

/** 落霞郊野·荒驿可行走候选（贴近现网黑袍刷点；不改地图） */
export const ROGUE_SPAWN_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 960, y: 768 },
  { x: 1320, y: 608 },
  { x: 1568, y: 480 },
  { x: 1984, y: 832 },
  { x: 2464, y: 704 },
  { x: 2720, y: 640 },
];

export type Rng = () => number; // [0,1)

export function defaultRng(): number {
  return Math.random();
}

/** 表未落／模板不存在／专属 drop 缺 → 关态零实体 */
export function rogueTablesReady(
  monsters: Record<string, MonsterDef | undefined> = MONSTERS,
  drops: Record<string, unknown> = DROPS as Record<string, unknown>,
): boolean {
  const def = monsters[ROGUE_TEMPLATE_ID];
  if (!def) return false;
  if (!drops[ROGUE_DROP_T1] || !drops[ROGUE_DROP_T2]) return false;
  return true;
}

export function rollDisplayName(rng: Rng = defaultRng): string {
  const title = ROGUE_TITLE_POOL[Math.floor(rng() * ROGUE_TITLE_POOL.length)]!;
  const name = ROGUE_NAME_POOL[Math.floor(rng() * ROGUE_NAME_POOL.length)]!;
  return `${title}·${name}`;
}

export function rollTier(rng: Rng = defaultRng): RogueTier {
  return rng() < 0.5 ? 'T1' : 'T2';
}

/** 浅拷贝模板并按档覆盖；T1 保持表内默认（含 drop_seize_rogue_t1） */
export function buildRogueDef(tier: RogueTier, displayName: string): MonsterDef | null {
  const base = MONSTERS[ROGUE_TEMPLATE_ID];
  if (!base) return null;
  if (tier === 'T1') {
    return { ...base, name: displayName };
  }
  return {
    ...base,
    name: displayName,
    level: ROGUE_T2_OVERRIDE.level,
    hp: ROGUE_T2_OVERRIDE.hp,
    atk: ROGUE_T2_OVERRIDE.atk,
    def: ROGUE_T2_OVERRIDE.def,
    exp: ROGUE_T2_OVERRIDE.exp,
    dropTable: ROGUE_T2_OVERRIDE.dropTable,
  };
}

/** 是否应打 loot.seize：仅夺宝目标，且已走过 spawnDrop 表路径 */
export function shouldEmitSeizeTip(m: { seizeLoot?: boolean } | null | undefined, dropTableResolved: boolean): boolean {
  return !!m?.seizeLoot && dropTableResolved;
}

export interface RogueSpawnHost {
  mapId: string;
  now: () => number;
  aliveRogueCount: () => number;
  /** 调度死亡后再刷（45s）；host 用 scene.time.delayedCall */
  scheduleRespawn: (delayMs: number) => void;
  spawnOne: (def: MonsterDef, x: number, y: number, meta: { displayName: string; tier: RogueTier }) => Monster | null;
}

/**
 * 入图补足 ≤2；死亡后 45s 再尝试补足（重新 roll）。
 * 开关＝有无模板／表／接线（本类被挂上即接线）；无 OpenFlag。
 */
export class RogueCultivatorSpawner {
  constructor(
    private readonly host: RogueSpawnHost,
    private readonly rng: Rng = defaultRng,
  ) {}

  get enabled(): boolean {
    return this.host.mapId === ROGUE_MAP_ID && rogueTablesReady();
  }

  onEnterMap(): void {
    this.tryFill();
  }

  onRogueDead(_m: Monster): void {
    if (!this.enabled) return;
    this.host.scheduleRespawn(ROGUE_RESPAWN_MS);
  }

  tryFill(): void {
    if (!this.enabled) return;
    while (this.host.aliveRogueCount() < ROGUE_MAX_ALIVE) {
      if (!this.spawnOnce()) break;
    }
  }

  private spawnOnce(): boolean {
    const displayName = rollDisplayName(this.rng);
    const tier = rollTier(this.rng);
    const def = buildRogueDef(tier, displayName);
    if (!def) return false;
    const point = ROGUE_SPAWN_POINTS[Math.floor(this.rng() * ROGUE_SPAWN_POINTS.length)]!;
    const jitterX = Math.floor((this.rng() - 0.5) * 48);
    return !!this.host.spawnOne(def, point.x + jitterX, point.y, { displayName, tier });
  }
}
