import type { SavePosition } from './Progress';

/** 仅保存已经确认的结果；楼层房间、怪物和进行中的会话均不进存档。 */
export interface TowerProgress {
  highestClearedFloor: number;
  firstClearClaimed: number[];
  titles: string[];
  returnPosition?: SavePosition;
}

const titleIds = ['title_tower_10', 'title_tower_20', 'title_tower_30'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const floor = (value: unknown, min: number): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= min && value <= 30;

/** 缺字段的旧档由 Progress 保持 undefined；已有塔袋必须是完整、安全的数据结构。 */
export function isValidTowerProgress(value: unknown): value is TowerProgress {
  if (!record(value) || !Reflect.ownKeys(value).every(key => typeof key === 'string'
    && ['highestClearedFloor', 'firstClearClaimed', 'titles', 'returnPosition'].includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'))) return false;
  if (!floor(value.highestClearedFloor, 0) || !Array.isArray(value.firstClearClaimed)
    || !Array.from(value.firstClearClaimed).every(n => floor(n, 1) && n <= (value.highestClearedFloor as number))
    || new Set(value.firstClearClaimed).size !== value.firstClearClaimed.length
    || !Array.isArray(value.titles) || !Array.from(value.titles).every(id => typeof id === 'string' && titleIds.includes(id))
    || new Set(value.titles).size !== value.titles.length) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'returnPosition')) {
    const at = value.returnPosition;
    if (!record(at) || !Reflect.ownKeys(at).every(key => typeof key === 'string'
      && ['mapId', 'x', 'y'].includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(at, key), 'value'))
      || at.mapId !== 'youying_tower' || typeof at.x !== 'number' || !Number.isFinite(at.x)
      || typeof at.y !== 'number' || !Number.isFinite(at.y)) return false;
  }
  return true;
}

/** 每次使用独立容器，避免不同存档或调用者共享可变数组。 */
export function emptyTowerProgress(): TowerProgress {
  return { highestClearedFloor: 0, firstClearClaimed: [], titles: [] };
}
