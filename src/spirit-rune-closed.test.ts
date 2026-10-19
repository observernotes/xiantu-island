import strings from '@xt/balance/strings_zh.json';
import * as Closed from './SpiritRuneClosed';
import { isSpiritRuneOpen, softOpenedSpiritRune, SPIRIT_RUNE_OPEN_FLAG_NAME } from './SpiritRuneAccess';
import { SpiritRuneGate } from './SpiritRuneGate';
import { spiritRuneFxActive, spiritRuneFxState } from './SpiritRuneFx';
import { loadSpiritRuneRules } from './SpiritRuneRules';
import { Progress } from './Progress';
import { SMITH_SERVICES } from './SmithServicesController';
import { setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const banned = ['本命法宝本体', '已获本命', '已解锁本命法宝', '本命未开'];

export async function runSpiritRuneClosedTests() {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  };
  const ok = (actual: unknown, message: string) => { assertions++; if (!actual) throw new Error(message); };

  // Flag：仅登记名，无 OpenFlag 文件，消费者恒关
  eq(SPIRIT_RUNE_OPEN_FLAG_NAME, 'SpiritRuneOpenFlag', 'Flag 名登记');
  eq(isSpiritRuneOpen(), false, 'SpiritRuneOpenFlag 消费者恒关');
  eq(softOpenedSpiritRune(), false, 'softOpenedSpiritRune 证据位仍 false');

  // 文案降级
  const keys = Object.keys(strings).filter(k => k.startsWith('spirit_rune.'));
  ok(keys.length >= 18, 'strings 含 §5.2 缺键');
  for (const key of keys) {
    const text = (strings as unknown as Record<string, string>)[key];
    for (const phrase of banned) ok(!text.includes(phrase), `${key} 禁「${phrase}」`);
  }
  eq((strings as unknown as Record<string, string>)['spirit_rune.closed.refine'], '灵纹祭炼尚未开放。', '关态炼化 tip');
  eq((strings as unknown as Record<string, string>)['spirit_rune.ui.title'], '灵纹祭炼', '窗名降级');
  eq((strings as unknown as Record<string, string>)['spirit_rune.ui.subtitle'], '试炼灵纹', '副标降级');

  // 不塞欧冶匠四服务
  eq([...SMITH_SERVICES], ['forge', 'enhance', 'enchant', 'salvage'], '灵纹不在欧冶匠四服务');

  // 表可读（骨架；2A 定稿前结构契约）
  const rules = loadSpiritRuneRules();
  ok(!!rules, 'spirit_rune.json 结构可消费');
  ok((rules?.affixes.length ?? 0) >= 8, '词条池≥8');

  // 存储哨兵：关态不得写
  const rows = new Map<SlotKey, SaveSlot>();
  let storageWrites = 0;
  setSaveBackend({
    async read(slot) { return rows.has(slot) ? structuredClone(rows.get(slot)!) : null; },
    async write() { storageWrites++; throw new Error('灵纹关态不得写存储'); },
    async delete() { storageWrites++; throw new Error('灵纹关态不得删存储'); },
    async insertIfEmpty() { storageWrites++; throw new Error('灵纹关态不得 insert'); },
  });

  const p = new Progress();
  const before = copy(p);
  const beforeSave = p.exportSave();
  const gate = new SpiritRuneGate(p);

  const closedTips = [
    Closed.featureClosed(), Closed.refuseEntrance(), Closed.refuseRefine(), Closed.refuseQuench(),
    Closed.refuseLock(), Closed.refuseUnlock(), Closed.refuseSubmit(), Closed.refuseLoadRefresh(),
  ];
  for (const tip of closedTips) {
    eq(tip.allowed, false, `${tip.tipKey} allowed=false`);
    eq(tip.text, (strings as unknown as Record<string, string>)[tip.tipKey], `${tip.tipKey} 读 strings`);
    ok(tip.tipKey.startsWith('spirit_rune.closed.'), `${tip.tipKey} 分层`);
  }

  const feature = gate.feature();
  eq(feature.allowed, false, 'feature 关态拒');
  ok('tipKey' in feature && feature.tipKey === 'spirit_rune.closed.feature', 'feature tip');

  const entrance = gate.entrance();
  eq(entrance.allowed, false, 'entrance 关态拒');

  const refine = gate.refine({ hostInstanceRef: 'forge_x:craft:y:item', slotIndex: 0 });
  eq(refine.allowed, false, 'refine 关态拒');
  ok('tipKey' in refine && refine.tipKey === 'spirit_rune.closed.refine', 'refine tip');

  const quench = gate.quenchPreview({ hostInstanceRef: 'forge_x:craft:y:item', slotIndex: 0 });
  eq(quench.allowed, false, 'quench 关态拒');

  const lock = await gate.submitLock({ hostInstanceRef: 'forge_x:craft:y:item', slotIndex: 0 }, true);
  eq(lock.allowed, false, 'lock 关态拒');
  const unlock = await gate.submitLock({ hostInstanceRef: 'forge_x:craft:y:item', slotIndex: 0 }, false);
  eq(unlock.allowed, false, 'unlock 关态拒');
  const submit = await gate.submitRefine({ hostInstanceRef: 'forge_x:craft:y:item', slotIndex: 0 });
  eq(submit.allowed, false, 'submitRefine 关态拒');

  // FX1–3 关态不出现
  const fx = spiritRuneFxState(p, 'forge_x:craft:y:item');
  eq(fx, { fx1DamageLabel: null, fx2Aura: false, fx3Trail: false }, 'FX 全关');
  eq(spiritRuneFxActive(p, 'forge_x:craft:y:item', 'FX1'), false, 'FX1 off');
  eq(spiritRuneFxActive(p, 'forge_x:craft:y:item', 'FX2'), false, 'FX2 off');
  eq(spiritRuneFxActive(p, 'forge_x:craft:y:item', 'FX3'), false, 'FX3 off');

  // 零副作用
  eq(copy(p), before, 'Progress 内存不变');
  eq(p.exportSave(), beforeSave, 'exportSave 不变');
  eq(p.spiritRune, undefined, 'spiritRune 袋未创建');
  eq(storageWrites, 0, '存储写=0');
  eq(isSpiritRuneOpen(), false, '调用后 Flag 仍关');
  eq(softOpenedSpiritRune(), false, '调用后 soft 仍 false');

  // listHosts 只读不写
  const hosts = gate.listHosts();
  eq(hosts.allowed, true, 'listHosts 只读允许');
  eq(copy(p), before, 'listHosts 后 Progress 仍不变');

  return {
    assertions,
    SpiritRuneOpenFlag: false,
    softOpenedSpiritRune: false,
    released: false,
    newOpenFlagFile: false,
    smithServicesUnchanged: true,
    fxClosed: true,
    copyDegradePass: true,
    rulesReadyFrom2A: !!rules && rules.affixes.length >= 8 && rules.slotCount === 2,
    awaiting2ATables: false,
    tableSha256: 'cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88',
  };
}
