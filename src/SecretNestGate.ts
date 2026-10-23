import quests from '@xt/balance/quests.json';
import realms from '@xt/balance/realms.json';
import secretRooms from '@xt/balance/secret_rooms.json';
import monsters from '@xt/balance/monsters.json';
import strings from '@xt/balance/strings_zh.json';
import { SECRET_NEST_INTRO_ID, isSecretNestIntroEnabled, readSignClosed, refuseEnter,
  refuseStart, refuseReward } from './SecretNestClosed';
import type { Progress } from './Progress';
import { dailyQuestDay } from './DailyQuests';
import { featureEnabled } from './features';
import { beginSecretBoonRun, onSecretBoonRoomClear, getSecretBoonState, clearRunBoons } from './SecretBoonRuntime';

export interface SecretNestGateProgress {
  readonly level: number;
  readonly realm: { readonly id: string };
  readonly quests: Record<string, { readonly state: string } | undefined>;
}
export interface SecretNestReturnPosition { readonly mapId: string; readonly x: number; readonly y: number; }

/** 演武定稿硬读：接线覆写；不改 secret_rooms.json 字节。 */
export const SECRET_NEST_MIN_LOOP = {
  theme: 'wanyao_nest' as const,
  acceptRoom: 'combat_01' as const,
  slotsOverride: { melee: 2, ranged: 1 } as const,
  poolAllow: {
    melee: ['shadow_wolf', 'demonized_ape', 'tree_demon_sapling'] as const,
    ranged: ['poison_spider'] as const,
  },
  /** melee 抽签偏好：狼＞猿＞分身（定稿语义，不改表） */
  meleePref: ['shadow_wolf', 'demonized_ape', 'tree_demon_sapling'] as const,
  levelClipSuggest: [30, 34] as const,
  reward: { exp: 12, stones: 20, item: null } as const,
  bossRoomRequired: false as const,
} as const;

export type SecretNestRoomId = 'secret_nest_gate_stub' | 'combat_01';
/** stub＝旧占位；playable＝最小可玩局（combat_01）。均不进 Progress／存档。 */
export interface SecretNestRoom {
  readonly id: SecretNestRoomId;
  readonly returnPosition: SecretNestReturnPosition;
  readonly playable?: boolean;
}

export interface SecretNestMob {
  readonly id: string;
  readonly monsterId: string;
  readonly role: 'melee' | 'ranged';
  readonly level: number;
  readonly hp: number;
  readonly atk: number;
  readonly exp: number;
  readonly name: string;
  alive: boolean;
}

export interface SecretNestRunRoom {
  readonly id: 'combat_01';
  readonly theme: 'wanyao_nest';
  readonly slotsOverride: { readonly melee: number; readonly ranged: number };
  mobs: SecretNestMob[];
  cleared: boolean;
}

/** 局内 run：仅内存；禁新存档 schema。 */
export interface SecretNestRun {
  readonly theme: 'wanyao_nest';
  readonly returnPosition: SecretNestReturnPosition;
  readonly rooms: SecretNestRunRoom[];
  roomIndex: number;
  cleared: boolean;
  rewarded: boolean;
}

export type SecretNestDenied = { readonly allowed: false; readonly tipKey: string; readonly text: string };
export type SecretNestStartOk = { readonly allowed: true; readonly run: SecretNestRun; readonly room: SecretNestRoom };
export type SecretNestRewardOk = {
  readonly allowed: true;
  readonly exp: number;
  readonly stones: number;
  readonly item: null;
  readonly receipt: { readonly expGained: number; readonly stonesGranted: number };
  readonly expResult: ReturnType<Progress['gainExp']>;
};

const denied = (tipKey: string, text: string): SecretNestDenied => ({ allowed: false, tipKey, text });
const copy = <T>(value: T): T => structuredClone(value);

let activeRun: SecretNestRun | undefined;

const monsterTable = monsters as { id: string; name?: string; level?: number; hp?: number; atk?: number; exp?: number }[];
const monsterById = Object.fromEntries(monsterTable.map(entry => [entry.id, entry]));

function secretMul(): { hp: number; exp: number } {
  const monster = (secretRooms as { monster?: { secretHpMul?: number; secretExpMul?: number } }).monster;
  return {
    hp: typeof monster?.secretHpMul === 'number' ? monster.secretHpMul : 1.5,
    exp: typeof monster?.secretExpMul === 'number' ? monster.secretExpMul : 1.5,
  };
}

function clipLevel(playerLevel: number): number {
  const [lo, hi] = SECRET_NEST_MIN_LOOP.levelClipSuggest;
  if (!Number.isFinite(playerLevel)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(playerLevel)));
}

function rollMobs(playerLevel: number): SecretNestMob[] {
  const level = clipLevel(playerLevel);
  const mul = secretMul();
  const { melee, ranged } = SECRET_NEST_MIN_LOOP.slotsOverride;
  const mobs: SecretNestMob[] = [];
  for (let i = 0; i < melee; i++) {
    const monsterId = SECRET_NEST_MIN_LOOP.meleePref[i % SECRET_NEST_MIN_LOOP.meleePref.length]!;
    const def = monsterById[monsterId];
    if (!def) throw new Error(`secret nest pool missing melee id ${monsterId}`);
    mobs.push({
      id: `nest:combat_01:melee:${i + 1}`,
      monsterId,
      role: 'melee',
      level,
      hp: Math.max(1, Math.round((def.hp ?? 1) * mul.hp)),
      atk: Math.max(1, Math.round(def.atk ?? 1)),
      exp: Math.max(0, Math.round((def.exp ?? 0) * mul.exp)),
      name: def.name ?? monsterId,
      alive: true,
    });
  }
  for (let i = 0; i < ranged; i++) {
    const monsterId = SECRET_NEST_MIN_LOOP.poolAllow.ranged[i % SECRET_NEST_MIN_LOOP.poolAllow.ranged.length]!;
    const def = monsterById[monsterId];
    if (!def) throw new Error(`secret nest pool missing ranged id ${monsterId}`);
    mobs.push({
      id: `nest:combat_01:ranged:${i + 1}`,
      monsterId,
      role: 'ranged',
      level,
      hp: Math.max(1, Math.round((def.hp ?? 1) * mul.hp)),
      atk: Math.max(1, Math.round(def.atk ?? 1)),
      exp: Math.max(0, Math.round((def.exp ?? 0) * mul.exp)),
      name: def.name ?? monsterId,
      alive: true,
    });
  }
  return mobs;
}

function gateCheck(prog: SecretNestGateProgress): SecretNestDenied | null {
  if (!isSecretNestIntroEnabled()) return null; // caller maps to refuse*
  if (prog.quests[SECRET_NEST_INTRO_ID]?.state !== 'done') {
    return denied('secret.gate.intro_required', '请先完成雷猎户的林下秘门引导。');
  }
  const intro = (quests as { id: string; reqRealm?: string; reqLevel?: number }[])
    .find(quest => quest.id === SECRET_NEST_INTRO_ID);
  const foundation = realms.findIndex(realm => realm.id === 'foundation');
  const requiredRealm = realms.findIndex(realm => realm.id === (intro?.reqRealm ?? 'foundation'));
  const currentRealm = realms.findIndex(realm => realm.id === prog.realm.id);
  if (foundation < 0 || requiredRealm < 0 || currentRealm < Math.max(foundation, requiredRealm)) {
    return denied('secret.gate.realm_required', '达到筑基境界后方可进入万妖巢穴。');
  }
  const reqLevel = intro?.reqLevel;
  if (typeof reqLevel !== 'number' || !Number.isFinite(reqLevel) || reqLevel < 0
    || !Number.isFinite(prog.level) || prog.level < reqLevel) {
    return denied('secret.gate.level_required', `达到${reqLevel ?? 30}级后方可进入万妖巢穴。`);
  }
  return null;
}

export function readSecretNestSign() {
  if (!isSecretNestIntroEnabled()) return readSignClosed();
  const table = strings as Record<string, unknown>;
  return { allowed: true as const, lines: ['secret.quest.intro.sign_a', 'secret.quest.intro.sign_b',
    'secret.quest.intro.sign_c'].map(key => typeof table[key] === 'string' ? table[key] as string : key) };
}

/** 仅 stub 占位；可玩闭环请走 startSecretNest（C04：stub  alone ≠ O）。 */
export function enterSecretNest(prog: SecretNestGateProgress, returnPosition: SecretNestReturnPosition) {
  if (!isSecretNestIntroEnabled()) return refuseEnter();
  const fail = gateCheck(prog);
  if (fail) return fail;
  return { allowed: true as const, room: { id: 'secret_nest_gate_stub' as const,
    returnPosition: { ...returnPosition }, playable: false as const } };
}

export function exitSecretNest(room: SecretNestRoom) {
  if (!isSecretNestIntroEnabled()) return refuseEnter();
  clearRunBoons();
  return { allowed: true as const, returnPosition: { ...room.returnPosition } };
}

export function getSecretNestRun(): SecretNestRun | undefined {
  return activeRun ? copy(activeRun) : undefined;
}

/** 测试／场景销毁：无条件清空局内 run（不发奖、不检门禁）。 */
export function resetSecretNestRunForTests() {
  clearRunBoons();
  activeRun = undefined;
}

/** 场景销毁等同 reset；命名给 GameScene 调用。 */
export function abandonSecretNestSession() {
  clearRunBoons();
  activeRun = undefined;
}

/** 倒地即清机缘与未决卡组；复起不恢复旧层。 */
export function onSecretNestPlayerDown() {
  clearRunBoons();
}

/**
 * design/40 最小开局：门禁通过后生成 1 房 combat_01（slotsOverride 2/1＋池 4 id）。
 * 局内态仅内存；≠开态 Flag。
 */
export function startSecretNest(
  prog?: SecretNestGateProgress,
  returnPosition?: SecretNestReturnPosition,
): SecretNestStartOk | SecretNestDenied | ReturnType<typeof refuseStart> {
  if (!isSecretNestIntroEnabled()) return refuseStart();
  if (!prog || !returnPosition
    || !Number.isFinite(returnPosition.x) || !Number.isFinite(returnPosition.y)
    || typeof returnPosition.mapId !== 'string' || !returnPosition.mapId) {
    return denied('secret.gate.no_start', '当前仅开放入口占位，暂不可开启秘境挑战。');
  }
  const fail = gateCheck(prog);
  if (fail) return fail;
  if (activeRun) return denied('secret.gate.busy', '本次巢穴挑战尚未退出。');
  const room: SecretNestRunRoom = {
    id: SECRET_NEST_MIN_LOOP.acceptRoom,
    theme: SECRET_NEST_MIN_LOOP.theme,
    slotsOverride: { ...SECRET_NEST_MIN_LOOP.slotsOverride },
    mobs: rollMobs(prog.level),
    cleared: false,
  };
  activeRun = {
    theme: SECRET_NEST_MIN_LOOP.theme,
    returnPosition: { ...returnPosition },
    rooms: [room],
    roomIndex: 0,
    cleared: false,
    rewarded: false,
  };
  beginSecretBoonRun(prog);
  return {
    allowed: true,
    run: copy(activeRun),
    room: {
      id: SECRET_NEST_MIN_LOOP.acceptRoom,
      returnPosition: { ...returnPosition },
      playable: true,
    },
  };
}

/** 占位／夹具清怪；不走 QuestSystem.onKill（隔离 q_main_06）。 */
export function clearSecretNestMob(mobId: string):
  | { allowed: true; run: SecretNestRun; mob: SecretNestMob; cleared: boolean }
  | SecretNestDenied
  | ReturnType<typeof refuseStart> {
  if (!isSecretNestIntroEnabled()) return refuseStart();
  if (!activeRun) return denied('secret.gate.no_start', '尚未开启巢穴挑战。');
  const run = copy(activeRun);
  const room = run.rooms[run.roomIndex];
  if (!room) return denied('secret.gate.no_start', '当前没有可战斗房间。');
  const mob = room.mobs.find(entry => entry.id === mobId);
  if (!mob) return denied('secret.gate.mob', '当前房间没有这只妖物。');
  if (!mob.alive) return denied('secret.gate.dead', '已清除的妖物不能再次击杀。');
  mob.alive = false;
  if (!room.mobs.some(entry => entry.alive)) {
    room.cleared = true;
    run.cleared = run.rooms.every(entry => entry.cleared);
    onSecretBoonRoomClear(room.id);
  }
  activeRun = run;
  return { allowed: true, run: copy(activeRun), mob: copy(mob), cleared: room.cleared };
}

export function fixtureClearSecretNestMobs():
  | { allowed: true; run: SecretNestRun; cleared: boolean }
  | SecretNestDenied
  | ReturnType<typeof refuseStart> {
  if (!isSecretNestIntroEnabled()) return refuseStart();
  if (!activeRun) return denied('secret.gate.no_start', '尚未开启巢穴挑战。');
  let last: ReturnType<typeof clearSecretNestMob> | undefined;
  while (activeRun?.rooms[activeRun.roomIndex]?.mobs.some(mob => mob.alive)) {
    const mob = activeRun.rooms[activeRun.roomIndex]!.mobs.find(entry => entry.alive)!;
    last = clearSecretNestMob(mob.id);
    if (!last.allowed) return last;
  }
  return { allowed: true, run: copy(activeRun!), cleared: !!activeRun?.cleared };
}

/**
 * 通关结算一行（演武定稿 exp=12／stones=20）。
 * 须已清房且未发过；日倍软闸关＝基线且不读写额度，开则按表乘本行 exp／stones 并日计数。
 * 仍不开 loot；日倍与机缘正交，离境清机缘不重置日倍额度。
 * 机缘软闸关则不开；开则选后再结算，局内机缘离境即散、不进永久结算。
 */
export function rewardSecretNest(prog?: Progress):
  SecretNestRewardOk | SecretNestDenied | ReturnType<typeof refuseReward> {
  if (!isSecretNestIntroEnabled()) return refuseReward();
  if (!prog || !activeRun) {
    return denied('secret.gate.no_reward', '当前仅开放入口占位，暂无可领取收益。');
  }
  if (!activeRun.cleared) {
    return denied('secret.gate.uncleared', '请先肃清巢穴战斗房后再领取通关结算。');
  }
  if (activeRun.rewarded) {
    return denied('secret.gate.rewarded', '本次通关结算已发放。');
  }
  if (getSecretBoonState().pendingHand) {
    return denied('secret.boon.pending', '请先选择本房机缘，再领取通关结算。');
  }
  let exp: number = SECRET_NEST_MIN_LOOP.reward.exp;
  let stones: number = SECRET_NEST_MIN_LOOP.reward.stones;
  if (!Number.isSafeInteger(prog.stones) || prog.stones < 0
    || !Number.isSafeInteger(prog.stones + stones)) {
    return denied('secret.gate.no_reward', '通关结算无法入账，请检查存档。');
  }
  if (featureEnabled('secret_daily_bonus')) {
    const runs = Number(secretRooms.rewards?.dailyBonus?.runs) || 0;
    const mul = Number(secretRooms.rewards?.dailyBonus?.mul) || 1;
    const bonusExp = Math.floor(exp * mul);
    const bonusStones = Math.floor(stones * mul);
    // 先确保基线及可能的日倍均可入账；拒绝路径也不读取或换写日倍字段。
    if (!Number.isSafeInteger(bonusExp) || bonusExp < 0
      || !Number.isSafeInteger(bonusStones) || bonusStones < 0
      || !Number.isSafeInteger(prog.stones + bonusStones)) {
      return denied('secret.gate.no_reward', '通关结算无法入账，请检查存档。');
    }
    const day = dailyQuestDay();
    const count = prog.secretNestDailyBonusDay === day ? prog.secretNestDailyBonusCount : 0;
    const remaining = count < runs;
    if (remaining) {
      exp = bonusExp;
      stones = bonusStones;
    }
    // 仅即将发放时落日键及已占额度；已满保持原计数，不让 boon 清层干预。
    prog.secretNestDailyBonusDay = day;
    prog.secretNestDailyBonusCount = remaining ? count + 1 : count;
  }
  clearRunBoons();
  const settled = prog.gainExp(exp, prog.level, 'quest');
  prog.stones += stones;
  activeRun = { ...activeRun, rewarded: true };
  return {
    allowed: true,
    exp,
    stones,
    item: null,
    receipt: { expGained: settled.gained, stonesGranted: stones },
    expResult: settled,
  };
}

/** 退出并清理局内 run；通关结算由 Scene 在清房后先调 rewardSecretNest。 */
export function exitSecretNestSession():
  | { allowed: true; returnPosition: SecretNestReturnPosition; cleared: boolean; rewarded: boolean }
  | SecretNestDenied
  | ReturnType<typeof refuseEnter> {
  if (!isSecretNestIntroEnabled()) return refuseEnter();
  if (!activeRun) return denied('secret.gate.no_start', '当前没有可退出的巢穴挑战。');
  const returnPosition = { ...activeRun.returnPosition };
  const cleared = activeRun.cleared;
  const rewarded = activeRun.rewarded;
  clearRunBoons();
  activeRun = undefined;
  return { allowed: true, returnPosition, cleared, rewarded };
}
