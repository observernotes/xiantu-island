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
import luoxiaTown from '@xt/maps/luoxia_town.json';
import wanyaoOuter1 from '@xt/maps/wanyao_outer_1.json';
import wanyaoOuter2 from '@xt/maps/wanyao_outer_2.json';
import wanyaoDeep1 from '@xt/maps/wanyao_deep_1.json';
import wanyaoDeep2 from '@xt/maps/wanyao_deep_2.json';
import tianjianSect from '@xt/maps/tianjian_sect.json';
import tianjianSwordTomb from '@xt/maps/tianjian_sword_tomb.json';
import trialTaixuStage from '@xt/maps/trial_taixu_stage.json';
import trialLingfuRange from '@xt/maps/trial_lingfu_range.json';
import trialYouyingVault from '@xt/maps/trial_youying_vault.json';
import trialWanshouPen from '@xt/maps/trial_wanshou_pen.json';
import altar from '@xt/maps/trial_foundation_altar.json';
import breakthrough from '@xt/balance/breakthrough.json';
import strings from '@xt/balance/strings_zh.json';

/** 地图与任务共用版本阶段过滤；phase 表示首次启用阶段。 */
export const GAME_PHASE = 5;
export function inPhase(p: { phase?: unknown; phaseMin?: unknown; phaseMax?: unknown } | undefined, phase = GAME_PHASE) {
  const first = Number(p?.phase), lo = Number(p?.phaseMin), hi = Number(p?.phaseMax);
  return !(Number.isFinite(first) && phase < first) && !(Number.isFinite(lo) && phase < lo) && !(Number.isFinite(hi) && phase > hi);
}

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
  touchDamage: boolean; noDamage?: boolean; knockback: number;
  /** 接触伤害倍率（可选，演武堂填；缺省 1） */
  touchDamageMul?: number;
  /** 规范：respawnMs 0 = 不重生（打死消失）；>0 = 多少毫秒后原地重生 */
  respawnMs: number;
  /** 打不死（木人桩）：照常扣血飘字，打空立刻回满 */
  immortal?: boolean;
  /** 血不会低于这个值 */
  minHp?: number;
  /** 不扣血 */
  invulnerable?: boolean;
  vision?: { length: number; halfAngleDeg: number; detectMs: number; decayMul: number };
  attack?: { type: string; damageRatio: number; range: { w: number; h: number }; cooldownMs: number; knockback: number; telegraphMs?: number };
  skills?: MonsterSkill[];
  sprite: string; dropTable: string | null; isBoss: boolean;
}
export interface ItemDef {
  id: string; name: string; type: string; slot?: string; stats?: Record<string, number>; effect?: any; icon?: string; appearance?: string;
  price?: number;
  phase?: number; phaseMin?: number; phaseMax?: number; enabled?: boolean; placeholder?: boolean;
  kind?: string; toolType?: string; sect?: string; reqLevel?: number;
  unlockSkill?: string;
  gather?: { castMs: number; respawnMs: number; maps?: string[] };
}
export interface DropTable { spiritStone: [number, number]; items: { item: string; chance: number; count: [number, number] }[] }

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries((monsters as MonsterDef[]).map(m => [m.id, m]));
export const DROPS = drops as unknown as Record<string, DropTable>;
import materials from '@xt/balance/materials.json';
// materials.json 结构和 items.json 一样，启动时合成一张物品表
export const ITEMS: Record<string, ItemDef> = Object.fromEntries([...(items as ItemDef[]), ...(materials as unknown as ItemDef[])].map(i => [i.id, i]));
import recipesRaw from '@xt/balance/recipes.json';
export type PillQuality = 'low' | 'mid' | 'high' | 'supreme';
export type FireResult = 'skipped' | 'inZone' | 'perfect' | 'missed';
export interface RecipeDef {
  id: string; name: string; output: string; outputCount: number; materials: { item: string; count: number }[];
  recipeLevel?: number; baseRate?: number; fuelStones?: number; realm: string; price?: number; reqLevel: number;
  type?: string; phase?: number;
}
/** 只读丹方规则；formula/newItems 仅为备注，物品仍只从 items/materials 读。 */
export const RECIPES: Record<string, RecipeDef> = Object.fromEntries((recipesRaw.recipes as RecipeDef[]).filter(r => inPhase(r)).map(r => [r.id, r]));
export const ALCHEMY_RULES = recipesRaw.rules;
export const GROWTH = growth as any;
export const EXP_TO_NEXT = (expCurve as any).expToNext as Record<string, number>;
export const MAX_LEVEL = (expCurve as any).maxLevel as number;
export const TILED_MAPS: Record<string, any> = {
  qingyun_village: qingyun, bamboo_forest: bamboo, lingxi_path: lingxi,
  luoxia_outskirts_1: luoxia1, luoxia_outskirts_2: luoxia2, luoxia_town: luoxiaTown,
  trial_foundation_altar: altar,
  wanyao_outer_1: wanyaoOuter1, wanyao_outer_2: wanyaoOuter2,
  wanyao_deep_1: wanyaoDeep1, wanyao_deep_2: wanyaoDeep2,
  tianjian_sect: tianjianSect, tianjian_sword_tomb: tianjianSwordTomb,
  trial_taixu_stage: trialTaixuStage, trial_lingfu_range: trialLingfuRange,
  trial_youying_vault: trialYouyingVault, trial_wanshou_pen: trialWanshouPen,
};

/** 境界突破关口：到这一级修为满后需要找 NPC 突破（design/02_新手任务.md 第三节） */
export const BREAKTHROUGH_LEVELS: number[] = (realmsRaw as any[]).map(r => r.levelMax).filter((lv: number) => lv < (expCurve as any).maxLevel);
/** breakthrough.json：溢出池只给了转化比例，上限不在表里 */
export const BREAKTHROUGH = breakthrough as {
  overflowPoolRatio: number; pillQualityBonus?: Record<string, number>; insightBonusPerPoint?: number; insightBonusCap?: number;
  clearMindPillBonus?: number; pityPerFail?: number; maxRate?: number;
};
import trialsRaw from '@xt/balance/trials.json';
export interface TrialSpawn { monster: string; side: 'both' | 'alternate' | 'left' | 'right'; everyMs: number; perSide?: number }
export interface TrialHazard { type: string; everyMs: number; count: number; radius: number; telegraphMs: number; playerDamageRatioOfMaxHp: number; nearObjective?: number }
export interface TrialWave { fromMs: number; toMs: number; spawns: TrialSpawn[]; total?: number; hazard?: TrialHazard; despawnAll?: boolean }
export interface TrialDef {
  id: string; name: string; realmFrom: string; realmTo: string; type: string; map: string; durationMs: number;
  waves?: TrialWave[];
  objective?: { id: string; name: string; hp: number; def?: number; x?: number | string; monsterDamageMul?: number; hitHalfWidth?: number; climbJumpVelocity?: number };
  /** 按怪物 id 覆盖行为，只在这场试炼里生效 */
  behaviorOverrides?: Record<string, { useAttack?: boolean; objectiveHit?: 'contact' | 'attack' }>;
  lamps?: { count: number; timeLimitMs: number; hitSkill: string };
  draw?: { talismans: number; strokesMin: number; strokesMax: number; wrongStroke: string; timeLimitMs: number };
  targets?: { monster: string; total: number; timeLimitMs: number; maxActive: number; refillDelayMs: number; moveSpeed: number };
  patrols?: { monster: string; count: number; turnPauseMs: number };
  item?: string;
  tame?: { monster: string; fluteMs: number; interruptOn: string[] };
}
export const TRIALS: Record<string, TrialDef> = Object.fromEntries((trialsRaw as unknown as TrialDef[]).map(t => [t.id, t]));
/** 地图 id → 防守类试炼（目前只有筑基台） */
export const TRIAL_BY_MAP: Record<string, TrialDef> = Object.fromEntries(Object.values(TRIALS).filter(t => t.type === 'defend' && t.map).map(t => [t.map, t]));

/** 已有精灵图集的 sprite 键（art/sprites/），其余用色块占位 */
import assets from './gen/assets.json';
/** 素材清单由 sync 扫 art/sprites/*.anims.json 自动生成（src/gen/assets.json），不再手写 */
export interface AtlasInfo { key: string; kind: string; origin: [number, number]; bodySize: [number, number] | null; }
export const ATLAS_INFO: Record<string, AtlasInfo> = Object.fromEntries((assets.atlases as AtlasInfo[]).map(a => [a.key, a]));
export const ATLASES: string[] = Object.keys(ATLAS_INFO);
/** 地图对应的图块与背景区域（art/tiles/README.md） */
export const MAP_AREA: Record<string, string> = {
  qingyun_village: 'qingyun', bamboo_forest: 'bamboo', lingxi_path: 'lingxi',
  luoxia_outskirts_1: 'luoxia', luoxia_outskirts_2: 'luoxia', luoxia_town: 'luoxia',
  trial_foundation_altar: 'altar', field_test: 'qingyun',
  wanyao_outer_1: 'wanyao', wanyao_outer_2: 'wanyao',
  wanyao_deep_1: 'wanyao', wanyao_deep_2: 'wanyao',
  tianjian_sect: 'tianjian', tianjian_sword_tomb: 'tianjian',
  trial_taixu_stage: 'taixu', trial_lingfu_range: 'lingfu',
  trial_youying_vault: 'youying', trial_wanshou_pen: 'wanshou',
};
export const AREAS: string[] = assets.areas;
export const BACKGROUNDS: { key: string; path: string }[] = assets.backgrounds;
/** sync 只登记已转正且存在的技能 @64 图标，避免加载 _pending 或缺失文件。 */
export const SKILL_ICONS: { key: string; path: string }[] = assets.skillIcons;

import npcs from '@xt/balance/npcs.json';
import quests from '@xt/balance/quests.json';
import realms from '@xt/balance/realms.json';
import questScript from '@xt/design/02_新手任务.md?raw';

export interface FerryRoute {
  id: string; label: string; targetMap: string; targetPortal?: string | null; cost: number;
  reqLevel?: number; unlockQuest?: string; phaseMin?: number; phaseMax?: number;
}
export interface NpcService { type: string; sect: string; config: string }
export interface NpcDef { id: string; name: string; map: string; sprite: string; dialog: string[]; quests: string[]; phase?: number; shop?: boolean; ferryRoutes?: FerryRoute[]; services?: NpcService[]; }
export interface QuestObjective { type: 'kill' | 'collect' | 'reach' | 'breakthrough' | 'talk' | 'craft' | 'trial'; target?: string; count?: number; consume?: boolean; map?: string; realm?: string; trial?: string; }
export interface QuestDef {
  id: string; name: string; giver: string; turnIn: string; reqLevel: number; objectives: QuestObjective[];
  prereq?: string; phase?: number; reqRealm?: string; sect?: string; daily?: boolean; skillsPending?: string[];
  nameKey?: string; descriptionKey?: string;
  dialogueKeys?: { offer?: string; progress?: string; complete?: string };
  balanceTodo?: string[];
  rewards: {
    exp: number; spiritStone: number; items: { item: string; count: number }[];
    job?: string; skills?: { id: string; level: number }[]; recipes?: string[];
    sectContribution?: number | null;
  }; next: string | null;
}
/** 新任务优先读文案表，旧任务仍保留 name 兼容。 */
export function questName(q: QuestDef) {
  const value = (strings as unknown as Record<string, unknown>)[q.nameKey ?? ''];
  return typeof value === 'string' ? value : q.name;
}
export function questDescription(q: QuestDef) {
  const value = (strings as unknown as Record<string, unknown>)[q.descriptionKey ?? ''];
  return typeof value === 'string' ? value : '';
}
export const NPCS: Record<string, NpcDef> = Object.fromEntries((npcs as NpcDef[]).map(n => [n.id, n]));
// 锁定原因需要任务名称，未来阶段的任务也保留名称供界面展示。
export const QUEST_NAMES: Record<string, string> = Object.fromEntries((quests as QuestDef[]).map(q => [q.id, questName(q)]));
export const QUESTS: Record<string, QuestDef> = Object.fromEntries((quests as QuestDef[]).filter(q => inPhase(q)).map(q => [q.id, q]));
export const QUEST_ORDER: string[] = Object.keys(QUESTS);
export const REALMS = realms as any[];

import sectRanks from '@xt/balance/sect_ranks.json';
import shops from '@xt/balance/shops.json';
import sectDonations from '@xt/balance/sect_donations.json';
export interface SectRankDef {
  id: string; name: string; nameKey: string; icon: string; availableInV05: boolean;
  reqContribution: number | null; reqRealm: string | null;
  promotion: { mode: string; dialogueKeys: Record<string, string> };
  unlocks: { libraryTier: string; shopShelf: string; dispatch: boolean };
  balanceTodo: string[];
}
export interface SectRanksConfig {
  version: string; enabled: boolean;
  rules: { rankOrder: string[]; initialRank: string; v05MaxRank: string; contributionBasis: string; promotionSpendsContribution: boolean; demoteOnSpend: boolean };
  ranks: SectRankDef[];
  sects: { id: string; name: string; promotionNpc: string; stewardNpc: string; titles: Record<string, { name: string; nameKey: string }> }[];
}
export interface SectShopGood { item: string; reqRank: string; costContribution: number | null; enabled: boolean; balanceTodo?: string[] }
export interface SectDonationOffer {
  id: string; sect: string; npc: string; item: string; reqRank: string; enabled: boolean;
  count: number | null; rewards: { sectContribution: number | null }; dailyLimit: number | null; balanceTodo: string[];
}
export interface SectDonationsConfig { version: string; enabled: boolean; offers: SectDonationOffer[] }
export type ShopEntry = string | SectShopGood;
export const SECT_RANKS = sectRanks as SectRanksConfig;
/** 旧字符串仍是灵石货架；宗门消费者只接受明确的贡献商品对象。 */
export const SHOPS = shops as Record<string, ShopEntry[]>;
export const SECT_DONATIONS = sectDonations as SectDonationsConfig;

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

import pacing from '@xt/balance/solo_pacing.json';

/**
 * 平时回蓝。player_growth 没有通用回蓝字段，借用打坐的 meditation.mpRegenPctPer5s
 * （0.03 = 每 5 秒回复最大灵力的 3%）。天剑心法的 mpRegenPer10s 另外再加。
 */
export const MP_REGEN_FRACTION_PER_5S = Number((pacing as { meditation?: { mpRegenPctPer5s?: number } }).meditation?.mpRegenPctPer5s ?? 0.03);

/** 宗门闭关参数只读接入，数值由 solo_pacing.json 管理（附录 G8）。 */
export interface SectSeclusionConfig {
  readonly desc: string;
  readonly unlockRealm: string;
  readonly density: number;
  readonly roomMul: number;
  readonly options: readonly number[];
  readonly contributionCost: Readonly<Record<string, number>>;
  readonly dailyQuestContribution: number;
  readonly maxYearsPerRealDay: number;
}
export const SECT_SECLUSION: Readonly<SectSeclusionConfig> = pacing.sectSeclusion;
export const SECLUSION_RULES = pacing.seclusion;
export const DENSITY_REF = pacing.densityRef;
export const LIFESPAN = pacing.lifespan;

/** strings_zh.json 里还没有的界面文案。有表内 key 时以表为准，不要改 data/。 */
const LOCAL_STRINGS: Record<string, string> = {
  'ui.shop.menu': '商店',
  'ui.shop.confirm': '花费{price}灵石购买{item}。',
  'ui.shop.complete': '已购买{item}。',
  'ui.shop.not_enough': '灵石不足。',
  'sect.ui.title': '宗门成长',
  'sect.ui.rank': '当前职位：{title}',
  'sect.ui.contribution': '宗门贡献：{contribution}',
  'sect.ui.locked_rank': '达到{rank}后开放。',
  'sect.ui.not_member': '先拜入本宗，再议门中事务。',
  'sect.ui.requirements_unmet': '贡献或境界尚未达到要求。',
  'sect.ui.config_pending': '此项尚在筹备，请稍后再来。',
  'sect.ui.closed': '此项尚未开放。',
  'sect.ui.invalid_rank': '宗门职位记录有误，暂无法办理。',
  'sect.ui.contribution_short': '宗门贡献不足。',
  'sect.ui.bag_full': '行囊空位不足，请先整理。',
  'sect.ui.save_failed': '此次未能保存，请重试。',
  'sect.ui.confirm': '确认',
  'sect.ui.cancel': '稍后再说',
  'sect.shop.menu': '宗门商店',
  'sect.shop.confirm': '花费{contribution}贡献兑换{item}。',
  'sect.shop.complete': '已兑换{item}。',
  'sect.library.menu': '藏经阁',
  'sect.library.confirm': '花费{contribution}贡献换取{item}。',
  'sect.library.complete': '已换取{item}，修习仍须满足条件。',
  'sect.library.learned': '这门功法已学会，无须再换秘籍。',
  'sect.donation.menu': '上交材料',
  'sect.donation.confirm': '交出{count}份{item}，获{contribution}贡献。',
  'sect.donation.complete': '已上交{item}，获得{contribution}贡献。',
  'sect.donation.material_short': '材料不足，无法上交。',
  'sect.donation.daily_limit': '今日上交已达上限。',
  'sect.donation.quest_warning': '上交后，日常任务可能缺少材料。',
  'sect.donation.remaining': '今日还可上交{remaining}批。',
  'sect.donation.day_changed': '上交额度已刷新，请重新确认。',
  'sys.seclusion_done': '闭关 {years} 年，修为增加 {exp}（溢出 {overflow}），消耗贡献 {cost}，年龄 {age} 岁。',
  'sys.seclusion_daily': '今日闭关已用 {used}/{max} 年。',
  'sys.seclusion_life': '剩余寿元不足以闭关 {years} 年。',
  'sys.lifespan_warn': '寿元还剩 {years} 年。',
  'skill.req_block': '还不能加点：{req}',
  'skill.maxed': '这门功法已经满级了',
  'skill.no_sp': '技能点不足',
  'skill.locked': '突破到炼气期后才能修习功法',
  'realm.overflow_tip': '溢出修为 {n}/{max}，突破后返还',
  'realm.overflow_full': '溢出修为已满，突破后返还。',
  'realm.overflow_gain': '（存入溢出池）',
  'trial.need_pill': '没有{item}，筑基台上走不了一步。先去备好丹药再来。',
  'trial.enter_hint': '入阵后守住阵眼 {sec} 秒。对话结束即入阵（筑基丹此时消耗）。',
  'trial.consume': '消耗了 {item}',
  'trial.player_down': '你在阵中倒下，试炼中断。筑基丹已耗，修为无损。',
  'trial.retreat': '心魔退散，阵眼稳住了……',
};

/** 文案：按 key 取 balance/strings_zh.json，缺了再用本地兜底，{var} 替换 */
export function t(key: string, vars: Record<string, string | number> = {}) {
  const table = strings as unknown as Record<string, unknown>;
  const fromTable = typeof table[key] === 'string' ? table[key] as string : undefined;
  const raw = fromTable ?? LOCAL_STRINGS[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
