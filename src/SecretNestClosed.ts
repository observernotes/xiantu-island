import quests from '@xt/balance/quests.json';
import strings from '@xt/balance/strings_zh.json';

export const SECRET_NEST_INTRO_ID = 'q_secret_nest_intro';

export type SecretNestClosedTipKey = 'secret.closed.feature' | 'secret.closed.entrance'
  | 'secret.closed.sign_readable' | 'secret.closed.quest_offer' | 'secret.closed.quest_progress'
  | 'secret.closed.no_enter' | 'secret.closed.no_start' | 'secret.closed.no_reward';
export interface SecretNestClosedTip {
  readonly allowed: false;
  readonly tipKey: SecretNestClosedTipKey;
  readonly text: string;
}

/** 正式任务表是唯一开放依据；运行时按 phase 筛掉任务或旧档 done 均不代表开放。 */
export function isSecretNestIntroEnabled(): boolean {
  return (quests as { id: string; enabled?: boolean }[])
    .find(quest => quest.id === SECRET_NEST_INTRO_ID)?.enabled === true;
}

/** 关态只读说明，不接受 Progress，也不创建秘境局、推进任务或结算收益。 */
function closed(tipKey: SecretNestClosedTipKey): SecretNestClosedTip {
  const table = strings as Record<string, unknown>;
  return { allowed: false, tipKey, text: typeof table[tipKey] === 'string' ? table[tipKey] as string : tipKey };
}

export function featureClosed() { return closed('secret.closed.feature'); }
export function readSignClosed() { return closed('secret.closed.sign_readable'); }
export function interactEntranceClosed() { return closed('secret.closed.entrance'); }
export function refuseQuestOffer() { return closed('secret.closed.quest_offer'); }
export function refuseQuestProgress() { return closed('secret.closed.quest_progress'); }
export function refuseEnter() { return closed('secret.closed.no_enter'); }
export function refuseStart() { return closed('secret.closed.no_start'); }
export function refuseReward() { return closed('secret.closed.no_reward'); }
