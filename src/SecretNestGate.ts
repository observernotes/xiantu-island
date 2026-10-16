import quests from '@xt/balance/quests.json';
import realms from '@xt/balance/realms.json';
import strings from '@xt/balance/strings_zh.json';
import { SECRET_NEST_INTRO_ID, isSecretNestIntroEnabled, readSignClosed, refuseEnter,
  refuseStart, refuseReward } from './SecretNestClosed';

export interface SecretNestGateProgress {
  readonly level: number;
  readonly realm: { readonly id: string };
  readonly quests: Record<string, { readonly state: string } | undefined>;
}
export interface SecretNestReturnPosition { readonly mapId: string; readonly x: number; readonly y: number; }
/** 只有当前场景持有的单房占位；不进入 Progress、存档或正式房间系统。 */
export interface SecretNestRoom {
  readonly id: 'secret_nest_gate_stub';
  readonly returnPosition: SecretNestReturnPosition;
}
const denied = (tipKey: string, text: string) => ({ allowed: false as const, tipKey, text });

export function readSecretNestSign() {
  if (!isSecretNestIntroEnabled()) return readSignClosed();
  const table = strings as Record<string, unknown>;
  return { allowed: true as const, lines: ['secret.quest.intro.sign_a', 'secret.quest.intro.sign_b',
    'secret.quest.intro.sign_c'].map(key => typeof table[key] === 'string' ? table[key] as string : key) };
}

export function enterSecretNest(prog: SecretNestGateProgress, returnPosition: SecretNestReturnPosition) {
  if (!isSecretNestIntroEnabled()) return refuseEnter();
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
  return { allowed: true as const, room: { id: 'secret_nest_gate_stub' as const,
    returnPosition: { ...returnPosition } } };
}

export function exitSecretNest(room: SecretNestRoom) {
  if (!isSecretNestIntroEnabled()) return refuseEnter();
  return { allowed: true as const, returnPosition: { ...room.returnPosition } };
}

/** 本刀只开放单房占位；完整开局与一切收益仍无执行入口。 */
export function startSecretNest() {
  if (!isSecretNestIntroEnabled()) return refuseStart();
  return denied('secret.gate.no_start', '当前仅开放入口占位，暂不可开启秘境挑战。');
}
export function rewardSecretNest() {
  if (!isSecretNestIntroEnabled()) return refuseReward();
  return denied('secret.gate.no_reward', '当前仅开放入口占位，暂无可领取收益。');
}
