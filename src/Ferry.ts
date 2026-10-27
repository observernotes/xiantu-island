import { inPhase, QUEST_NAMES, TILED_MAPS, TRIALS, NPCS, QUESTS, SECT_GATE_MAPS, t, type FerryRoute } from './data';
import type { Progress, SavePosition } from './Progress';
import { featureEnabled, FEATURE_UNAVAILABLE } from './features';
export { SECT_GATE_MAPS } from './data';

/** v0.5 新增地图；旧地图与筑基台不受新地图入口开关影响。 */
export const V05_MAPS = new Set([
  'chiyan_slope_1', 'chiyan_slope_2', 'chiyan_core',
  'luoxia_town', 'wanyao_outer_1', 'wanyao_outer_2', 'wanyao_deep_1', 'wanyao_deep_2',
  'tianjian_sect', 'tianjian_sword_tomb',
  ...SECT_GATE_MAPS,
  'trial_taixu_stage', 'trial_lingfu_range', 'trial_youying_vault', 'trial_wanshou_pen',
]);
export const FIRST_CLASS_TRIAL_MAPS = new Set([
  'trial_taixu_stage', 'trial_lingfu_range', 'trial_youying_vault', 'trial_wanshou_pen',
]);
const RETURN_MAPS: Record<string, string> = {
  chiyan_slope_1: 'luoxia_town', chiyan_slope_2: 'chiyan_slope_1',
  chiyan_core: 'luoxia_town',
  wanyao_deep_2: 'wanyao_deep_1', wanyao_deep_1: 'wanyao_outer_2',
  wanyao_outer_2: 'wanyao_outer_1', wanyao_outer_1: 'luoxia_town',
  tianjian_sword_tomb: 'tianjian_sect', tianjian_sect: 'luoxia_town',
  taixu_temple: 'luoxia_town', lingfu_pavilion: 'luoxia_town',
  youying_tower: 'luoxia_town', wanshou_mountain: 'luoxia_town',
  trial_taixu_stage: 'taixu_temple', trial_lingfu_range: 'lingfu_pavilion',
  trial_youying_vault: 'youying_tower', trial_wanshou_pen: 'wanshou_mountain',
};

/** 山门未注册时保留本宗试炼图入口兜底；是否准入仍由门控判定。 */
export function sectEntryMap(map: string): string {
  if (TILED_MAPS[map]) return map;
  const trial = Object.values(TRIALS).find(tr => tr.quest && NPCS[QUESTS[tr.quest]?.turnIn]?.map === map);
  return trial && TILED_MAPS[trial.map] ? trial.map : map;
}

/** 旧试炼入口落点升到已注册山门；缺山门时保留原试炼兜底。 */
export function sectTrialReturnPosition(position: SavePosition): SavePosition {
  if (!FIRST_CLASS_TRIAL_MAPS.has(position.mapId)) return position;
  const trial = Object.values(TRIALS).find(tr => tr.quest && tr.map === position.mapId);
  const elderId = trial?.quest ? QUESTS[trial.quest]?.turnIn : undefined;
  const mapId = elderId ? NPCS[elderId]?.map : undefined;
  if (!mapId || !SECT_GATE_MAPS.has(mapId) || !TILED_MAPS[mapId]) return position;
  type TiledObject = {
    type?: string; class?: string; name?: string; x: number; y: number;
    properties?: { name: string; value: unknown }[];
  };
  const objects: TiledObject[] = TILED_MAPS[mapId].layers.flatMap((layer: { objects?: TiledObject[] }) => layer.objects ?? []);
  const valid = (o: TiledObject) => Number.isFinite(o.x) && Number.isFinite(o.y);
  const at = objects.find(o => valid(o) && (o.type || o.class) === 'npc'
    && (o.properties?.find(p => p.name === 'npc')?.value ?? o.name) === elderId)
    ?? objects.find(o => valid(o) && ((o.type || o.class) === 'playerStart' || o.name === 'playerStart'));
  return at ? { mapId, x: at.x, y: at.y } : position;
}

/** 关闭新地图入口时仍保留旧存档沿回程路径离开的能力。 */
export function mapEntryOpen(targetMap: string, currentMap?: string, returning = false): boolean {
  if (!featureEnabled('fiveSectClasses') && SECT_GATE_MAPS.has(targetMap)
    && !(targetMap === 'lingfu_pavilion' && featureEnabled('talismanCraft'))) return false;
  targetMap = sectEntryMap(targetMap);
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
  if (!TILED_MAPS[sectEntryMap(route.targetMap)] && route.targetMap !== 'field_test') return t('sys.portal_locked');
  if (prog.stones < route.cost) return t('ui.shop.not_enough');
  return undefined;
}
