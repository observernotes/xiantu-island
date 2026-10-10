import { inPhase, QUEST_NAMES, TILED_MAPS, t, type FerryRoute } from './data';
import type { Progress } from './Progress';

/** G8：保留所有航线，只提示按阶段、等级、已完成任务顺序遇到的首个门槛。 */
export function ferryLockedReason(route: FerryRoute, prog: Pick<Progress, 'level' | 'quests' | 'stones'>): string | undefined {
  if (!inPhase(route)) return t('sys.portal_locked');
  if (prog.level < (route.reqLevel ?? 0)) return t('sys.portal_level', { lv: route.reqLevel! });
  if (route.unlockQuest && prog.quests[route.unlockQuest]?.state !== 'done')
    return t('ferry.locked_quest', { quest: QUEST_NAMES[route.unlockQuest] ?? route.unlockQuest });
  if (!TILED_MAPS[route.targetMap] && route.targetMap !== 'field_test') return t('sys.portal_locked');
  if (prog.stones < route.cost) return t('ui.shop.not_enough');
  return undefined;
}
