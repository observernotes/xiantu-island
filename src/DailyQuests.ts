import { SECT_SECLUSION, type QuestDef } from './data';
import type { Progress } from './Progress';

/** 日常按运行端本地日历的 05:00 换日；闭关的午夜日界另行保留。 */
export function dailyQuestDay(now = Date.now()) {
  const day = new Date(now);
  if (day.getHours() < 5) day.setDate(day.getDate() - 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export const DAILY_QUEST_LIMIT = 3;
const SECTS = new Set(['tianjian', 'taixu', 'lingfu', 'youying', 'wanshou']);
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** 只有字段缺失才回退；显式 0 是有效奖励，null 及非法配置不得开放。 */
export function dailyContribution(q: QuestDef): number | undefined {
  const amount = Object.prototype.hasOwnProperty.call(q.rewards, 'sectContribution')
    ? q.rewards.sectContribution : SECT_SECLUSION.dailyQuestContribution;
  return nonnegativeInteger(amount) ? amount : undefined;
}

export function dailyRewardsReady(q: QuestDef) {
  return !!q.sect && SECTS.has(q.sect) && !q.balanceTodo?.length
    && nonnegativeInteger(q.rewards.exp) && nonnegativeInteger(q.rewards.spiritStone)
    && dailyContribution(q) !== undefined;
}

/** 奖励已经结算；场景只用此回执显示日志，不能再次发奖。 */
export interface DailyQuestReward {
  exp: ReturnType<Progress['gainExp']>;
  contribution: number;
  items: { item: string; count: number; equipped?: boolean }[];
  skills: string[];
}
