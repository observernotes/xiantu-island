// 读表：全部来自策划/数值目录，字段见 design/01_配置表规范.md
import monsters from '../../balance/monsters.json';
import drops from '../../balance/drops.json';
import items from '../../balance/items.json';
import growth from '../../balance/player_growth.json';
import expCurve from '../../balance/exp_curve.json';
import qingyun from '../../maps/qingyun_village.json';
import bamboo from '../../maps/bamboo_forest.json';
import lingxi from '../../maps/lingxi_path.json';

export interface MonsterDef {
  id: string; name: string; level: number; hp: number; atk: number; def: number; exp: number;
  aggressive: boolean; aggroRange?: number; moveSpeed: number; patrolRange: number;
  touchDamage: boolean; noDamage?: boolean; knockback: number; respawnMs: number;
  attack?: { type: string; damageRatio: number; range: { w: number; h: number }; cooldownMs: number; knockback: number };
  sprite: string; dropTable: string | null; isBoss: boolean;
}
export interface ItemDef { id: string; name: string; type: string; slot?: string; stats?: Record<string, number>; effect?: any; }
export interface DropTable { spiritStone: [number, number]; items: { item: string; chance: number; count: [number, number] }[] }

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries((monsters as MonsterDef[]).map(m => [m.id, m]));
export const DROPS = drops as unknown as Record<string, DropTable>;
export const ITEMS: Record<string, ItemDef> = Object.fromEntries((items as ItemDef[]).map(i => [i.id, i]));
export const GROWTH = growth as any;
export const EXP_TO_NEXT = (expCurve as any).expToNext as Record<string, number>;
export const MAX_LEVEL = (expCurve as any).maxLevel as number;
export const TILED_MAPS: Record<string, any> = { qingyun_village: qingyun, bamboo_forest: bamboo, lingxi_path: lingxi };

/** 境界突破关口：到这一级修为满后需要找 NPC 突破（design/02_新手任务.md 第三节） */
export const BREAKTHROUGH_LEVELS = [9];

/** 已有精灵图集的 sprite 键（art/sprites/），其余用色块占位 */
export const ATLASES = ['player_sword_m', 'mon_spirit_rabbit', 'mon_bamboo_snake', 'mon_mountain_mandrill'];
