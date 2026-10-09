// 读表：全部来自策划/数值目录，字段见 design/01_配置表规范.md
import monsters from '@xt/balance/monsters.json';
import drops from '@xt/balance/drops.json';
import items from '@xt/balance/items.json';
import growth from '@xt/balance/player_growth.json';
import expCurve from '@xt/balance/exp_curve.json';
import qingyun from '@xt/maps/qingyun_village.json';
import realmsRaw from '@xt/balance/realms.json';
import bamboo from '@xt/maps/bamboo_forest.json';
import lingxi from '@xt/maps/lingxi_path.json';
import luoxia1 from '@xt/maps/luoxia_outskirts_1.json';
import luoxia2 from '@xt/maps/luoxia_outskirts_2.json';
import altar from '@xt/maps/trial_foundation_altar.json';
import breakthrough from '@xt/balance/breakthrough.json';

/** 首领技能。字段见 01_配置表规范 附录：interruptible 缺省 false，grantRewards 缺省 false，despawnWithOwner 缺省 true */
export interface MonsterSkill {
  id: string; name: string; type: string;
  damageRatio?: number; count?: number; speed?: number; cooldownMs?: number;
  distance?: number; telegraphMs?: number; summon?: string; hpBelow?: number;
  once?: boolean; grantRewards?: boolean; despawnWithOwner?: boolean;
  interruptible?: boolean; fx?: string; knockback?: number;
}
export interface MonsterDef {
  id: string; name: string; level: number; hp: number; atk: number; def: number; exp: number;
  aggressive: boolean; aggroRange?: number; moveSpeed: number; patrolRange: number;
  touchDamage: boolean; noDamage?: boolean; knockback: number; respawnMs: number;
  attack?: { type: string; damageRatio: number; range: { w: number; h: number }; cooldownMs: number; knockback: number; telegraphMs?: number };
  skills?: MonsterSkill[];
  sprite: string; dropTable: string | null; isBoss: boolean;
}
export interface ItemDef { id: string; name: string; type: string; slot?: string; stats?: Record<string, number>; effect?: any; icon?: string; }
export interface DropTable { spiritStone: [number, number]; items: { item: string; chance: number; count: [number, number] }[] }

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries((monsters as MonsterDef[]).map(m => [m.id, m]));
export const DROPS = drops as unknown as Record<string, DropTable>;
import materials from '@xt/balance/materials.json';
// materials.json 结构和 items.json 一样，启动时合成一张物品表
export const ITEMS: Record<string, ItemDef> = Object.fromEntries([...(items as ItemDef[]), ...(materials as unknown as ItemDef[])].map(i => [i.id, i]));
export const GROWTH = growth as any;
export const EXP_TO_NEXT = (expCurve as any).expToNext as Record<string, number>;
export const MAX_LEVEL = (expCurve as any).maxLevel as number;
export const TILED_MAPS: Record<string, any> = { qingyun_village: qingyun, bamboo_forest: bamboo, lingxi_path: lingxi, luoxia_outskirts_1: luoxia1, luoxia_outskirts_2: luoxia2, trial_foundation_altar: altar };

/** 境界突破关口：到这一级修为满后需要找 NPC 突破（design/02_新手任务.md 第三节） */
export const BREAKTHROUGH_LEVELS: number[] = (realmsRaw as any[]).map(r => r.levelMax).filter((lv: number) => lv < (expCurve as any).maxLevel);
/** breakthrough.json：溢出池只给了转化比例，上限不在表里 */
export const BREAKTHROUGH = breakthrough as { overflowPoolRatio: number };

/** 已有精灵图集的 sprite 键（art/sprites/），其余用色块占位 */
import assets from './gen/assets.json';
/** 素材清单由 sync 扫 art/sprites/*.anims.json 自动生成（src/gen/assets.json），不再手写 */
export interface AtlasInfo { key: string; kind: string; origin: [number, number]; bodySize: [number, number] | null; }
export const ATLAS_INFO: Record<string, AtlasInfo> = Object.fromEntries((assets.atlases as AtlasInfo[]).map(a => [a.key, a]));
export const ATLASES: string[] = Object.keys(ATLAS_INFO);
/** 地图对应的图块与背景区域（art/tiles/README.md） */
export const MAP_AREA: Record<string, string> = { qingyun_village: 'qingyun', bamboo_forest: 'bamboo', lingxi_path: 'lingxi', luoxia_outskirts_1: 'luoxia', luoxia_outskirts_2: 'luoxia', trial_foundation_altar: 'altar', field_test: 'qingyun' };
export const AREAS: string[] = assets.areas;

import npcs from '@xt/balance/npcs.json';
import quests from '@xt/balance/quests.json';
import realms from '@xt/balance/realms.json';
import questScript from '@xt/design/02_新手任务.md?raw';

export interface NpcDef { id: string; name: string; map: string; sprite: string; dialog: string[]; quests: string[]; shop?: boolean; }
export interface QuestObjective { type: 'kill' | 'collect' | 'reach' | 'breakthrough' | 'talk' | 'craft'; target?: string; count?: number; consume?: boolean; map?: string; realm?: string; }
export interface QuestDef {
  id: string; name: string; giver: string; turnIn: string; reqLevel: number; objectives: QuestObjective[];
  rewards: {
    exp: number; spiritStone: number; items: { item: string; count: number }[];
    job?: string; skills?: { id: string; level: number }[];
  }; next: string | null;
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

import strings from '@xt/balance/strings_zh.json';
import pacing from '@xt/balance/solo_pacing.json';

/**
 * 平时回蓝。player_growth 没有通用回蓝字段，借用打坐的 meditation.mpRegenPctPer5s
 * （0.03 = 每 5 秒回复最大灵力的 3%）。天剑心法的 mpRegenPer10s 另外再加。
 */
export const MP_REGEN_FRACTION_PER_5S = Number((pacing as { meditation?: { mpRegenPctPer5s?: number } }).meditation?.mpRegenPctPer5s ?? 0.03);

/** strings_zh.json 里还没有的界面文案。有表内 key 时以表为准，不要改 data/。 */
const LOCAL_STRINGS: Record<string, string> = {
  'skill.req_block': '还不能加点：{req}',
  'skill.maxed': '这门功法已经满级了',
  'skill.no_sp': '技能点不足',
  'skill.locked': '突破到炼气期后才能修习功法',
  'realm.overflow_tip': '溢出修为 {n}/{max}，突破后返还',
  'realm.overflow_full': '溢出修为已满，突破后返还。',
  'realm.overflow_gain': '（存入溢出池）',
};

/** 文案：按 key 取 balance/strings_zh.json，缺了再用本地兜底，{var} 替换 */
export function t(key: string, vars: Record<string, string | number> = {}) {
  const table = strings as unknown as Record<string, unknown>;
  const fromTable = typeof table[key] === 'string' ? table[key] as string : undefined;
  const raw = fromTable ?? LOCAL_STRINGS[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
