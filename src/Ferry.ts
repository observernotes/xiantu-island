import { inPhase, QUEST_NAMES, TILED_MAPS, t, type FerryRoute } from './data';
import type { Progress } from './Progress';
import { featureEnabled, FEATURE_UNAVAILABLE } from './features';

/** v0.5 新增地图；旧地图与筑基台不受新地图入口开关影响。 */
export const V05_MAPS = new Set([
  'luoxia_town', 'wanyao_outer_1', 'wanyao_outer_2', 'wanyao_deep_1', 'wanyao_deep_2',
  'tianjian_sect', 'tianjian_sword_tomb',
  'trial_taixu_stage', 'trial_lingfu_range', 'trial_youying_vault', 'trial_wanshou_pen',
]);
export const FIRST_CLASS_TRIAL_MAPS = new Set([
  'trial_taixu_stage', 'trial_lingfu_range', 'trial_youying_vault', 'trial_wanshou_pen',
]);
const RETURN_MAPS: Record<string, string> = {
  wanyao_deep_2: 'wanyao_deep_1', wanyao_deep_1: 'wanyao_outer_2',
  wanyao_outer_2: 'wanyao_outer_1', wanyao_outer_1: 'luoxia_town',
  tianjian_sword_tomb: 'tianjian_sect', tianjian_sect: 'luoxia_town',
};

/** 关闭新地图入口时仍保留旧存档沿回程路径离开的能力。 */
export function mapEntryOpen(targetMap: string, currentMap?: string, returning = false): boolean {
  if (!featureEnabled('fiveSectClasses') && FIRST_CLASS_TRIAL_MAPS.has(targetMap)) return false;
  return featureEnabled('v05Maps') || !V05_MAPS.has(targetMap)
    || !!currentMap && (RETURN_MAPS[currentMap] === targetMap || returning && V05_MAPS.has(currentMap));
}

/** G8：保留所有航线，只提示按阶段、等级、已完成任务顺序遇到的首个门槛。 */
export function ferryLockedReason(route: FerryRoute, prog: Pick<Progress, 'level' | 'quests' | 'stones'>): string | undefined {
  if (!mapEntryOpen(route.targetMap)) return FEATURE_UNAVAILABLE;
  if (!inPhase(route)) return t('sys.portal_locked');
  if (prog.level < (route.reqLevel ?? 0)) return t('sys.portal_level', { lv: route.reqLevel! });
  if (route.unlockQuest && prog.quests[route.unlockQuest]?.state !== 'done')
    return t('ferry.locked_quest', { quest: QUEST_NAMES[route.unlockQuest] ?? route.unlockQuest });
  if (!TILED_MAPS[route.targetMap] && route.targetMap !== 'field_test') return t('sys.portal_locked');
  if (prog.stones < route.cost) return t('ui.shop.not_enough');
  return undefined;
}
