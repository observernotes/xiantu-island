/**
 * 职业登记补充表。balance 暂缺职业表和四宗 rewards.job，映射单独登记，
 * 技能数值/前置/点数/树来自 skills，入宗等级、赠技、道袍来自 quests/items。
 */
import registry from './config/classes.json';
import { ITEMS, NPCS, QUESTS } from './data';
import { SKILL_LIST, SkillDef } from './skills';

export interface ClassDef {
  id: string; name: string; sect: string; job: number; joinQuest: string;
  /** 山门来自任务交付 NPC，道袍来自任务奖励物品。 */
  map?: string; robeId?: string;
}
export const CLASS_RULES = registry.rules;
export const CLASS_LIST: ClassDef[] = registry.classes.map(c => ({
  ...c,
  map: NPCS[QUESTS[c.joinQuest]?.turnIn]?.map,
  robeId: QUESTS[c.joinQuest]?.rewards.items?.find(reward => {
    const item = ITEMS[reward.item] as typeof ITEMS[string] & { sect?: string };
    return item?.slot === 'robe' && item.sect === c.sect && !!item.appearance;
  })?.item,
}));
export const CLASSES: Record<string, ClassDef> = Object.fromEntries(CLASS_LIST.map(c => [c.id, c]));
export function classDef(job: string): ClassDef | undefined { return CLASSES[job]; }
export function classForQuest(questId: string): ClassDef | undefined {
  return CLASS_LIST.find(c => c.joinQuest === questId);
}
export function skillsForClass(job: string): SkillDef[] {
  const c = classDef(job);
  const sect = c?.sect ?? CLASS_RULES.unjoinedSkillSect;
  return SKILL_LIST.filter(s => s.sect === sect && s.job === (c?.job ?? CLASS_RULES.advanceJob));
}
export function classEntrySkill(c: ClassDef): SkillDef | undefined {
  return skillsForClass(c.id).find(s => s.key === CLASS_RULES.entryKey && s.type !== 'passive');
}
export function classGiftSkills(c: ClassDef): { id: string; level: number }[] {
  const q = QUESTS[c.joinQuest];
  const gifts = new Map((q?.rewards.skills ?? []).map(s => [s.id, s.level]));
  // skillsPending 已在 skills.json 登记，统一读取该职业三项主动/增益，补齐缺失奖励字段。
  for (const s of skillsForClass(c.id)) if (s.type !== 'passive' && !gifts.has(s.id)) gifts.set(s.id, CLASS_RULES.giftLevel);
  // 按技能树顺序先发 default:A 入门技；奖励数组先列回风剑时也不抢占 A。
  return skillsForClass(c.id).filter(skill => gifts.has(skill.id))
    .map(skill => ({ id: skill.id, level: gifts.get(skill.id)! }));
}
export function classRobe(c: ClassDef): string | undefined {
  return QUESTS[c.joinQuest]?.rewards.items?.find(reward => {
    const item = ITEMS[reward.item] as typeof ITEMS[string] & { sect?: string };
    return item?.slot === 'robe' && item.sect === c.sect && !!item.appearance;
  })?.item;
}
export function classMinLevel(c: ClassDef): number { return QUESTS[c.joinQuest]?.reqLevel ?? 0; }
