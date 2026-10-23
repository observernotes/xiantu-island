import secretBoons from '@xt/balance/secret_boons.json';
import { featureEnabled } from './features';

export interface SecretBoonEffect {
  stat: string;
  op: string;
  value: number;
  trigger: string;
  intervalMs?: number;
}

export interface SecretBoonDefinition {
  id: string;
  name: string;
  nameKey?: string;
  tier: string;
  stackMode: string;
  effects: SecretBoonEffect[];
  weight?: number;
  maxStacks?: number;
  exclusiveGroup?: string;
  fallback?: boolean;
}

export interface SecretBoonTier { id: string; weight: number; }
export type SecretBoonLayers = Record<string, number>;
export interface SecretBoonState {
  pendingHand: SecretBoonDefinition[] | undefined;
  layers: SecretBoonLayers;
  panelOpen: boolean;
}

/** design/49 演武定稿：仅此九条由软闸启用，表内 enabled／phase 与数值原样保留。 */
export const SECRET_BOON_RUNTIME_IDS = [
  'sb_vigor', 'sb_focus', 'sb_force', 'sb_guard', 'sb_spring', 'sb_flow',
  'sb_breath', 'sb_sip', 'sb_balance',
] as const;

const runtimeIds = new Set<string>(SECRET_BOON_RUNTIME_IDS);
export const SECRET_BOON_DEFINITIONS: readonly SecretBoonDefinition[] = secretBoons.boons
  .filter(boon => runtimeIds.has(boon.id));
export const SECRET_BOON_TIERS: readonly SecretBoonTier[] = secretBoons.tiers;

const copy = <T>(value: T): T => structuredClone(value);
const stackCount = (layers: Readonly<SecretBoonLayers>, id: string) => {
  const count = layers[id];
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
};

/** 纯规则钩子：definitions 是调用方已批准的子集，生产只传上述九条。 */
export function filterSecretBoonCandidates(
  definitions: readonly SecretBoonDefinition[],
  layers: Readonly<SecretBoonLayers> = {},
): SecretBoonDefinition[] {
  const selectedGroups = new Map<string, string>();
  for (const boon of definitions) {
    if (boon.exclusiveGroup && stackCount(layers, boon.id) > 0) {
      selectedGroups.set(boon.exclusiveGroup, boon.id);
    }
  }
  return definitions.filter(boon => {
    const groupChoice = boon.exclusiveGroup ? selectedGroups.get(boon.exclusiveGroup) : undefined;
    if (groupChoice && groupChoice !== boon.id) return false;
    // fallback 缺省 maxStacks，且 instant 不持有局内层。
    return boon.fallback || boon.maxStacks === undefined || stackCount(layers, boon.id) < boon.maxStacks;
  });
}

function weightedPick<T>(entries: readonly T[], weight: (entry: T) => number, random: () => number): T | undefined {
  const legal = entries.filter(entry => Number.isFinite(weight(entry)) && weight(entry) > 0);
  const total = legal.reduce((sum, entry) => sum + weight(entry), 0);
  if (total <= 0) return undefined;
  const value = random();
  let remaining = (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0) * total;
  for (const entry of legal) {
    remaining -= weight(entry);
    if (remaining < 0) return entry;
  }
  return legal[legal.length - 1];
}

/** 先按非空合法档权重、再按条目 weight；fallback 仅补不足且不参加常规抽签。 */
export function drawSecretBoonHand(
  definitions: readonly SecretBoonDefinition[] = SECRET_BOON_DEFINITIONS,
  layers: Readonly<SecretBoonLayers> = {},
  random: () => number = Math.random,
  tiers: readonly SecretBoonTier[] = SECRET_BOON_TIERS,
): SecretBoonDefinition[] {
  let candidates = filterSecretBoonCandidates(definitions, layers);
  const hand: SecretBoonDefinition[] = [];
  const removeChoice = (choice: SecretBoonDefinition) => {
    candidates = candidates.filter(boon => boon.id !== choice.id
      && (!choice.exclusiveGroup || boon.exclusiveGroup !== choice.exclusiveGroup));
  };
  while (hand.length < 3) {
    const regular = candidates.filter(boon => !boon.fallback
      && typeof boon.weight === 'number' && Number.isFinite(boon.weight) && boon.weight > 0);
    const eligibleTiers = tiers.filter(tier => regular.some(boon => boon.tier === tier.id));
    const tier = weightedPick(eligibleTiers, entry => entry.weight, random);
    if (!tier) break;
    const choice = weightedPick(regular.filter(boon => boon.tier === tier.id), boon => boon.weight!, random);
    if (!choice) break;
    hand.push(choice);
    removeChoice(choice);
  }
  for (const fallback of [...candidates]) {
    if (hand.length === 3) break;
    if (!fallback.fallback || !candidates.some(boon => boon.id === fallback.id)) continue;
    hand.push(fallback);
    removeChoice(fallback);
  }
  return copy(hand);
}

// 全部局内态仅存模块内存，不挂 Progress／存档，不能复制为永久成长。
let owner: object | undefined;
let layers: SecretBoonLayers = {};
let pendingHand: SecretBoonDefinition[] | undefined;
let panelOpen = false;
const clearedRooms = new Set<string>();

function restore(stat: 'hp' | 'mp', ratio: number) {
  if (!owner) return;
  const target = owner as Record<string, unknown>;
  const current = target[stat], maximum = target[stat === 'hp' ? 'maxHp' : 'maxMp'];
  if (typeof current !== 'number' || !Number.isFinite(current)
    || typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum < 0) return;
  target[stat] = Math.max(0, Math.min(maximum, current + maximum * ratio));
}

function applyEffects(boon: SecretBoonDefinition, trigger: string, count: number) {
  for (const effect of boon.effects) {
    if (effect.trigger === trigger && effect.op === 'restore_max_ratio'
      && (effect.stat === 'hp' || effect.stat === 'mp') && Number.isFinite(effect.value)) {
      restore(effect.stat, effect.value * count);
    }
  }
}

export function beginSecretBoonRun(player: object): void {
  clearRunBoons();
  owner = player;
}

/** 已有 room_clear 层先触发；本房之后选择的 spring／flow 不回补本次清房。 */
export function onSecretBoonRoomClear(roomId: string): void {
  if (!owner || roomId === 'start' || !roomId || clearedRooms.has(roomId) || pendingHand) return;
  // 关闸时也记录已清房，避免同房在会话覆盖开闸后重新发牌。
  clearedRooms.add(roomId);
  if (!featureEnabled('secret_boon_runtime')) return;
  for (const boon of SECRET_BOON_DEFINITIONS) {
    const count = stackCount(layers, boon.id);
    if (count > 0) applyEffects(boon, 'room_clear', count);
  }
  const hand = drawSecretBoonHand(SECRET_BOON_DEFINITIONS, layers);
  if (hand.length > 0) {
    pendingHand = hand;
    panelOpen = true;
  }
}

export function getSecretBoonState(): SecretBoonState {
  return { pendingHand: pendingHand ? copy(pendingHand) : undefined, layers: { ...layers }, panelOpen };
}

export function chooseSecretBoon(id: string): boolean {
  if (!owner || !featureEnabled('secret_boon_runtime')) return false;
  const boon = pendingHand?.find(choice => choice.id === id);
  if (!boon) return false;
  if (boon.stackMode !== 'instant') layers[boon.id] = stackCount(layers, boon.id) + 1;
  applyEffects(boon, 'choose', 1);
  pendingHand = undefined;
  panelOpen = false;
  return true;
}

export function closeSecretBoonPanel(): void {
  panelOpen = false;
}

export function reopenSecretBoonPanel(): void {
  if (pendingHand && featureEnabled('secret_boon_runtime')) panelOpen = true;
}

/** 退出／通关／倒地共用：先移除层，再按不带机缘的 maxima 收敛当前 HP／MP。 */
export function clearRunBoons(): void {
  const previousOwner = owner;
  layers = {};
  pendingHand = undefined;
  panelOpen = false;
  clearedRooms.clear();
  owner = undefined;
  if (!previousOwner) return;
  const target = previousOwner as Record<string, unknown>;
  for (const stat of ['hp', 'mp'] as const) {
    const current = target[stat], maximum = target[stat === 'hp' ? 'maxHp' : 'maxMp'];
    if (typeof current === 'number' && Number.isFinite(current)
      && typeof maximum === 'number' && Number.isFinite(maximum) && maximum >= 0) {
      target[stat] = Math.max(0, Math.min(maximum, current));
    }
  }
}

/** 返回加法比例（例如 vigor=0.06）；调用方用 1＋ratio，且仅绑定玩家可获得。 */
export function secretBoonRatio(player: object, stat: string): number {
  if (player !== owner || !featureEnabled('secret_boon_runtime')) return 0;
  let ratio = 0;
  for (const boon of SECRET_BOON_DEFINITIONS) {
    const count = stackCount(layers, boon.id);
    if (!count) continue;
    for (const effect of boon.effects) {
      if (effect.stat === stat && effect.trigger === 'passive' && effect.op === 'add_ratio') {
        ratio += effect.value * count;
      }
    }
  }
  return ratio;
}
