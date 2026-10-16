import strings from '@xt/balance/strings_zh.json';

export type TowerClosedTipKey = 'tower.closed.feature' | 'tower.closed.entrance'
  | 'tower.closed.no_climb' | 'tower.closed.no_floor' | 'tower.closed.no_reward'
  | 'tower.closed.no_title' | 'tower.closed.exit_or_save' | 'tower.closed.load_refresh';

export interface TowerClosedTip {
  readonly allowed: false;
  readonly tipKey: TowerClosedTipKey;
  readonly text: string;
}

/** 本窗永久关态；配表、资格和旧档记录均不能授权爬塔，不另造开放开关。 */
function closed(tipKey: TowerClosedTipKey): TowerClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不创建爬塔、不保存、不结算收益。
export function featureClosed() { return closed('tower.closed.feature'); }
export function interactEntranceClosed() { return closed('tower.closed.entrance'); }
export function refuseClimb() { return closed('tower.closed.no_climb'); }
export function refuseFloor() { return closed('tower.closed.no_floor'); }
export function refuseReward() { return closed('tower.closed.no_reward'); }
export function refuseTitle() { return closed('tower.closed.no_title'); }
export function refuseExitOrSaveClimbAdvance() { return closed('tower.closed.exit_or_save'); }
export function refuseLoadRefresh() { return closed('tower.closed.load_refresh'); }
