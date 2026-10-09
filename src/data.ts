// 读表：全部来自策划/数值目录，字段见 design/01_配置表规范.md
import monsters from '../../balance/monsters.json';
import drops from '../../balance/drops.json';
import items from '../../balance/items.json';
import growth from '../../balance/player_growth.json';
import expCurve from '../../balance/exp_curve.json';
import qingyun from '../../maps/qingyun_village.json';
import realmsRaw from '../../balance/realms.json';
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
import materials from '../../balance/materials.json';
// materials.json 结构和 items.json 一样，启动时合成一张物品表
export const ITEMS: Record<string, ItemDef> = Object.fromEntries([...(items as ItemDef[]), ...(materials as unknown as ItemDef[])].map(i => [i.id, i]));
export const GROWTH = growth as any;
export const EXP_TO_NEXT = (expCurve as any).expToNext as Record<string, number>;
export const MAX_LEVEL = (expCurve as any).maxLevel as number;
export const TILED_MAPS: Record<string, any> = { qingyun_village: qingyun, bamboo_forest: bamboo, lingxi_path: lingxi };

/** 境界突破关口：到这一级修为满后需要找 NPC 突破（design/02_新手任务.md 第三节） */
export const BREAKTHROUGH_LEVELS: number[] = (realmsRaw as any[]).map(r => r.levelMax).filter((lv: number) => lv < (expCurve as any).maxLevel);

/** 已有精灵图集的 sprite 键（art/sprites/），其余用色块占位 */
export const ATLASES = ['player_sword_m', 'mon_spirit_rabbit', 'mon_bamboo_snake', 'mon_mountain_mandrill', 'npc_village_elder', 'npc_grocer_wang', 'npc_doctor_sun', 'fx_sword_slash'];
/** 地图对应的图块与背景区域（art/tiles/README.md） */
export const MAP_AREA: Record<string, string> = { qingyun_village: 'qingyun', bamboo_forest: 'bamboo', lingxi_path: 'bamboo', field_test: 'qingyun' };
export const AREAS = ['qingyun', 'bamboo'];

import npcs from '../../balance/npcs.json';
import quests from '../../balance/quests.json';
import realms from '../../balance/realms.json';
import questScript from '../../design/02_新手任务.md?raw';

export interface NpcDef { id: string; name: string; map: string; sprite: string; dialog: string[]; quests: string[]; shop?: boolean; }
export interface QuestObjective { type: 'kill' | 'collect' | 'reach' | 'breakthrough'; target?: string; count?: number; consume?: boolean; map?: string; realm?: string; }
export interface QuestDef {
  id: string; name: string; giver: string; turnIn: string; reqLevel: number; objectives: QuestObjective[];
  rewards: { exp: number; spiritStone: number; items: { item: string; count: number }[]; job?: string }; next: string | null;
}
export const NPCS: Record<string, NpcDef> = Object.fromEntries((npcs as NpcDef[]).map(n => [n.id, n]));
export const QUESTS: Record<string, QuestDef> = Object.fromEntries((quests as QuestDef[]).map(q => [q.id, q]));
export const QUEST_ORDER: string[] = (quests as QuestDef[]).map(q => q.id);
export const REALMS = realms as any[];

/** 一行台词：speaker 为空表示系统提示；cue 是演出标记（breakthrough / job） */
export interface Line { speaker: string | null; text: string; player?: boolean; cue?: string; }
export type ScriptBlock = 'accept' | 'progress' | 'turnIn' | 'notReady' | 'bossIntro' | 'bossDeath';

/** 解析 design/02_新手任务.md 的对话脚本：### 任务 · 名称（`id`） 下面的 **接取/进行中/交付/…** 小节 */
function parseScript(md: string) {
  const out: Record<string, Partial<Record<ScriptBlock, Line[]>>> = {};
  let qid: string | null = null, block: ScriptBlock | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^###\s.*（`(q_\w+)`）/);
    if (h) { qid = h[1]; out[qid] = {}; block = null; continue; }
    if (line.startsWith('## ')) { qid = null; continue; }
    if (!qid) continue;
    const b = line.match(/^\*\*(.+?)\*\*/);
    if (b && !line.startsWith('-')) {
      const t = b[1];
      block = t.startsWith('接取') ? 'accept' : t.startsWith('进行中') ? 'progress' : t.startsWith('修为未满') ? 'notReady'
        : t.startsWith('交付') ? 'turnIn' : t.startsWith('首领登场') ? 'bossIntro' : t.startsWith('首领战败') ? 'bossDeath' : null;
      if (block) out[qid][block] = [];
      continue;
    }
    if (!block || !line.startsWith('- ')) continue;
    const body = line.slice(2);
    let m: RegExpMatchArray | null;
    if ((m = body.match(/^【(.+?)】(.*)$/))) out[qid][block]!.push({ speaker: m[1], text: m[2].replace(/（[^）]*）$/, '').trim() || m[2] });
    else if ((m = body.match(/^〈玩家〉(.*)$/))) out[qid][block]!.push({ speaker: '你', text: m[1], player: true });
    else if ((m = body.match(/^（(.*)）$/))) {
      const t = m[1].replace(/\*\*/g, '');
      if (t.startsWith('突破演出')) out[qid][block]!.push({ speaker: null, text: '', cue: 'breakthrough' });
      else if (t.startsWith('转职演出')) out[qid][block]!.push({ speaker: null, text: '', cue: 'job' });
      else if (t.startsWith('系统提示')) out[qid][block]!.push({ speaker: null, text: t.replace(/^系统提示[:：]/, '') });
    }
  }
  return out;
}
export const SCRIPTS = parseScript(questScript);
