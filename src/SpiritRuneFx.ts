import { isSpiritRuneOpen } from './SpiritRuneAccess';
import type { Progress } from './Progress';
import { SpiritRuneGate } from './SpiritRuneGate';

export type SpiritRuneFxId = 'FX1' | 'FX2' | 'FX3';

export interface SpiritRuneFxState {
  fx1DamageLabel: string | null;
  fx2Aura: boolean;
  fx3Trail: boolean;
}

/**
 * FX1 跳字差分／FX2 常驻轻灵光／FX3 攻击短拖尾。
 * 关态／Flag 未开：三者均不出现（与写操作零副作用一致）；不替代飞剑／不捆飞行。
 */
export function spiritRuneFxState(progress: Progress, hostInstanceRef: string | null | undefined): SpiritRuneFxState {
  const off: SpiritRuneFxState = { fx1DamageLabel: null, fx2Aura: false, fx3Trail: false };
  if (!isSpiritRuneOpen() || !hostInstanceRef) return off;
  const gate = new SpiritRuneGate(progress);
  if (!gate.hostHasAffix(hostInstanceRef)) return off;
  const bag = progress.spiritRune?.bags.find(row => row.hostInstanceRef === hostInstanceRef);
  const first = bag?.slots.find(slot => slot.affixId != null)?.affixId ?? null;
  return {
    fx1DamageLabel: first, // 词条短标签；美术色相另令
    fx2Aura: true,
    fx3Trail: true,
  };
}

export function spiritRuneFxActive(progress: Progress, hostInstanceRef: string | null | undefined, id: SpiritRuneFxId): boolean {
  const state = spiritRuneFxState(progress, hostInstanceRef);
  if (id === 'FX1') return state.fx1DamageLabel != null;
  if (id === 'FX2') return state.fx2Aura;
  return state.fx3Trail;
}
