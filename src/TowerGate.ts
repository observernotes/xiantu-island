import floors from '@xt/balance/tower_floors.json';
import titles from '@xt/balance/titles.json';
import strings from '@xt/balance/strings_zh.json';
import type { Progress, SavePosition } from './Progress';
import type { PillQuality } from './data';
import { emptyTowerProgress, isValidTowerProgress, type TowerProgress } from './TowerProgress';
import { isTowerOpenForFixture } from './TowerOpenFlag';
import * as TowerClosed from './TowerClosed';

export interface TowerMob {
  id: string;
  monsterId: string;
  role: string;
  alive: boolean;
  isSplitChild: boolean;
  canSplit: boolean;
  parentId?: string;
  affixes: string[];
}
/** 单房占位会话只活在当前 Gate 中；存档没有怪物、房间或自动续爬指令。 */
export interface TowerSession {
  floor: number;
  mobs: TowerMob[];
  cleared: boolean;
  completed: boolean;
  returnPosition: SavePosition;
}
export interface TowerTitle { id: string; name: string; desc: string; }
export interface TowerAllowed {
  allowed: true;
  floorCount?: number;
  session?: TowerSession;
  progress?: TowerProgress;
  title?: TowerTitle;
  rewarded?: boolean;
  completed?: boolean;
  returnPosition?: SavePosition;
  mob?: TowerMob;
}
export interface TowerDenied { allowed: false; tipKey: string; text: string; }
export type TowerGateResult = TowerAllowed | TowerDenied;
const denied = (reason: string, text: string): TowerDenied => ({ allowed: false, tipKey: `tower.fixture.${reason}`, text });
const busy = () => denied('busy', '正在保存塔内进度，请稍候。');
const copy = <T>(value: T): T => structuredClone(value);
const isPillQuality = (value: unknown): value is PillQuality => typeof value === 'string'
  && ['low', 'mid', 'high', 'supreme'].includes(value);

/** 正式图的每个操作先交给 Closed；只有 SSR 内存图才能接触会话和真实进度事务。 */
export class TowerGate {
  #session: TowerSession | undefined;
  #busy = false;

  constructor(private readonly progress: Progress) {}

  /** 返回副本，场景和夹具不能靠改对象跳层、复活或伪造清层。 */
  get session(): TowerSession | undefined { return this.#session ? copy(this.#session) : undefined; }

  feature(): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.featureClosed();
    return { allowed: true, floorCount: floors.meta.floorCount };
  }

  interactEntrance(entranceId = 'tower_climb_entrance'): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.interactEntranceClosed();
    if (entranceId !== 'tower_climb_entrance') return denied('entrance', '请由锁妖塔爬塔入口进入。');
    return { allowed: true };
  }

  async startClimb(entranceId: string, returnPosition: SavePosition): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseClimb();
    if (this.#busy) return busy();
    if (this.#session) return denied('active', '本次爬塔尚未退出。');
    if (entranceId !== 'tower_climb_entrance' || !returnPosition || returnPosition.mapId !== 'youying_tower'
      || !Number.isFinite(returnPosition.x) || !Number.isFinite(returnPosition.y)) {
      return denied('entrance', '请由幽影楼山门的锁妖塔爬塔入口进入。');
    }
    if (!this.validProgress()) return denied('progress', '塔进度无法读取，请检查存档。');
    const at = { mapId: returnPosition.mapId, x: returnPosition.x, y: returnPosition.y };
    const progress = this.currentProgress();
    const start = Math.max(floors.meta.startFromRule.minFloor,
      progress.highestClearedFloor - floors.meta.startFromRule.highestClearedFloorMinus);
    this.#busy = true;
    try {
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        draft.tower = { ...progress, returnPosition: copy(at) };
        // 房间不进档；中断或刷新后仍落在入口一侧。
        draft.position = copy(at);
        return true;
      });
      if (saved !== true) return denied('save', '塔入口进度保存失败，请重试。');
      this.#session = this.makeSession(start, at);
      return { allowed: true, session: this.session, progress: this.currentProgress() };
    } finally { this.#busy = false; }
  }

  /** 指定层只能读取当前房，不能借重复进入复活已死怪或跳过清层。 */
  enterFloor(floor?: number): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseFloor();
    if (this.#busy) return busy();
    if (!this.#session || floor !== undefined && floor !== this.#session.floor) {
      return denied('floor', '只能进入本次爬塔的当前楼层。');
    }
    return { allowed: true, session: this.session };
  }

  /** 可控战斗入口仍走真实死亡、分裂、清层和首通事务；仅省略实机伤害过程。 */
  async clearMob(id: string): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseFloor();
    if (this.#busy) return busy();
    const current = this.#session;
    if (!current) return denied('floor', '尚未开始爬塔。');
    const candidate = copy(current);
    const mob = candidate.mobs.find(entry => entry.id === id);
    if (!mob) return denied('mob', '当前楼层没有这只怪物。');
    if (!mob.alive) return denied('dead', '已清除的怪物不能再次死亡或复活。');
    mob.alive = false;
    if (mob.canSplit) {
      const split = floors.meta.affixDefs.split;
      for (let i = 0; i < split.childCount; i++) candidate.mobs.push({
        id: `${mob.id}:split:${i + 1}`, monsterId: mob.monsterId, role: mob.role,
        alive: true, isSplitChild: true, canSplit: split.childCanSplit, parentId: mob.id,
        affixes: mob.affixes.filter(affix => split.childInheritAffixes.includes(affix)),
      });
    }
    if (candidate.mobs.some(entry => entry.alive)) {
      this.#session = candidate;
      return { allowed: true, session: this.session, mob: copy(mob), rewarded: false };
    }
    // 最后一只死亡直到事务确认才对外发布；失败保留原活态，允许原请求重试。
    this.#busy = true;
    try {
      const settlement = await this.progress.runSaveTransactionAsync(draft => this.settleFloor(draft, candidate.floor));
      if (!settlement) return denied('save', '清层与首通奖励保存失败，请重试。');
      candidate.cleared = true;
      candidate.completed = candidate.floor === floors.meta.floorCount;
      this.#session = candidate;
      return { allowed: true, session: this.session, mob: copy(mob), rewarded: settlement.rewarded,
        completed: candidate.completed, progress: this.currentProgress() };
    } finally { this.#busy = false; }
  }

  /** 自动化与占位房可调用；每只本体及后来生成的小体都逐次经过 clearMob。 */
  async fixtureClearRemainingMobs(): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseFloor();
    if (this.#busy) return busy();
    if (!this.#session) return denied('floor', '尚未开始爬塔。');
    let result: TowerGateResult = { allowed: true, session: this.session, rewarded: false };
    while (this.#session?.mobs.some(mob => mob.alive)) {
      const mob = this.#session.mobs.find(entry => entry.alive)!;
      result = await this.clearMob(mob.id);
      if (!result.allowed) return result;
    }
    return result;
  }

  respawnMob(_id: string): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseFloor();
    return denied('respawn', floors.meta.roomRule.respawn === false ? '塔内怪物不复活。' : '当前不可复活塔内怪物。');
  }

  async advanceFloor(): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseFloor();
    if (this.#busy) return busy();
    const current = this.#session;
    if (!current || !current.cleared || current.mobs.some(mob => mob.alive)) {
      return denied('uncleared', '请先清除本层全部怪物及分裂小体。');
    }
    if (current.floor === floors.meta.floorCount) return { allowed: true, completed: true, session: this.session };
    this.#session = this.makeSession(current.floor + 1, current.returnPosition);
    return { allowed: true, completed: false, session: this.session };
  }

  /** 首通已随清层事务发放；此入口只确认收据，不能补领、重发或越层领。 */
  async claimFirstClear(floor?: number): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseReward();
    if (this.#busy) return busy();
    if (!this.validProgress() || !this.#session?.cleared || floor !== undefined && floor !== this.#session.floor
      || !this.progress.tower?.firstClearClaimed.includes(this.#session.floor)) {
      return denied('reward', '本层尚未完成清层与首通结算。');
    }
    return { allowed: true, rewarded: false, progress: this.currentProgress() };
  }

  /** 称号只由首通原子事务解锁；查询不能把已有收据当成补发请求。 */
  unlockTitle(id: string): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseTitle();
    if (!this.validProgress() || !this.progress.tower?.titles.includes(id)) return denied('title', '该塔称号尚未解锁。');
    const title = this.title(id);
    if (!title) return denied('title', '该塔称号尚未登记。');
    return { allowed: true, title, rewarded: false };
  }

  async exitClimb(): Promise<TowerGateResult> {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseExitOrSaveClimbAdvance();
    if (this.#busy) return busy();
    if (!this.#session || !this.validProgress()) return denied('exit', '当前没有可退出的爬塔房间。');
    const at = copy(this.#session.returnPosition);
    this.#busy = true;
    try {
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        // 退出只记录回落点；未清楼层没有补结算、推进或自动重开的机会。
        draft.tower = { ...this.currentProgress(draft), returnPosition: copy(at) };
        draft.position = copy(at);
        return true;
      });
      if (saved !== true) return denied('save', '退出落点保存失败，请重试。');
      this.#session = undefined;
      return { allowed: true, returnPosition: at, progress: this.currentProgress() };
    } finally { this.#busy = false; }
  }

  /** 只读已提交进度；加载不会重建房间、补奖或清空旧收据。 */
  loadProgress(): TowerGateResult {
    if (!isTowerOpenForFixture()) return TowerClosed.refuseLoadRefresh();
    if (!this.validProgress()) return denied('progress', '塔进度无法读取，请检查存档。');
    return { allowed: true, progress: this.currentProgress() };
  }

  private validProgress(): boolean { return this.progress.tower === undefined || isValidTowerProgress(this.progress.tower); }
  private currentProgress(progress = this.progress): TowerProgress { return copy(progress.tower ?? emptyTowerProgress()); }

  private makeSession(floor: number, returnPosition: SavePosition): TowerSession {
    const definition = floors.floors.find(entry => entry.floor === floor)!;
    const mobs: TowerMob[] = [];
    for (const group of definition.mobs) for (let i = 0; i < group.count; i++) {
      const affixes = floors.meta.affixScope.includes(group.role) ? [...definition.affixes] : [];
      mobs.push({ id: `tower:${floor}:${mobs.length + 1}`, monsterId: group.monsterId, role: group.role,
        alive: true, isSplitChild: false, canSplit: affixes.includes('split'), affixes });
    }
    return { floor, mobs, cleared: false, completed: false, returnPosition: copy(returnPosition) };
  }

  private settleFloor(draft: Progress, floor: number): { rewarded: boolean } | undefined {
    if (draft.tower !== undefined && !isValidTowerProgress(draft.tower)) return undefined;
    const progress = this.currentProgress(draft);
    const definition = floors.floors.find(entry => entry.floor === floor);
    if (!definition) return undefined;
    progress.highestClearedFloor = Math.max(progress.highestClearedFloor, floor);
    if (progress.firstClearClaimed.includes(floor)) {
      draft.tower = progress;
      return { rewarded: false };
    }
    const reward = definition.firstClearRewards;
    if (!Number.isSafeInteger(draft.stones) || draft.stones < 0
      || !Number.isSafeInteger(draft.stones + reward.spirit_stone)) return undefined;
    for (const item of reward.items) {
      if (!draft.canAddCraftedItem(item.item, item.count)) return undefined;
      // 塔表已经声明奖励品质；旧丹药没有 qualityEnabled 也须保留高品，不能改正式物品表。
      if ('quality' in item) {
        // 未知品质视为配置错误，整笔回滚，不允许默默降档。
        if (!isPillQuality(item.quality)) return undefined;
        draft.addCraftedPill(item.item, item.count, item.quality);
      } else if (!draft.addCraftedItem(item.item, item.count)) return undefined;
    }
    draft.stones += reward.spirit_stone;
    progress.firstClearClaimed.push(floor);
    for (const rewardTitle of reward.titles) {
      if (!this.title(rewardTitle.id)) return undefined;
      if (!progress.titles.includes(rewardTitle.id)) progress.titles.push(rewardTitle.id);
    }
    progress.firstClearClaimed.sort((a, b) => a - b);
    draft.tower = progress;
    return { rewarded: true };
  }

  private title(id: string): TowerTitle | undefined {
    const title = titles.find(entry => entry.id === id);
    if (!title) return undefined;
    // 正式名与描述只读登记表及既有字符串，忽略生成表中的旧占位 name。
    const key = id.replace('title_tower_', 'title.tower_');
    const text = strings as Record<string, unknown>;
    const name = text[`${key}.name`], desc = text[`${key}.desc`];
    return { id, name: typeof name === 'string' && name === title.name ? name : title.name,
      desc: typeof desc === 'string' && desc === title.desc ? desc : title.desc };
  }
}
