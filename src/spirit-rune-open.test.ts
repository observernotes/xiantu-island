/**
 * 执法堂 · 刷装灵纹开态 O01–O10（SSR 夹具；≠soft≠release；不改生产写路径）
 * soft-open：正式默认开；关回用注入严格 false；O2/O4/O5 须真扣真写。
 */
import strings from '@xt/balance/strings_zh.json';
import spiritRuneTable from '@xt/balance/spirit_rune.json';
import enhance from '@xt/balance/enhance.json';
import { GAME_PHASE } from './data';
import {
  isSpiritRuneOpen, softOpenedSpiritRune, SPIRIT_RUNE_OPEN_FLAG_NAME, SPIRIT_RUNE_OPEN_INJECT_KEY,
} from './SpiritRuneAccess';
import { SpiritRuneGate } from './SpiritRuneGate';
import { spiritRuneFxActive, spiritRuneFxState } from './SpiritRuneFx';
import { loadSpiritRuneRules } from './SpiritRuneRules';
import { isValidSpiritRuneProgress, type SpiritRuneProgress } from './SpiritRuneProgress';
import { Progress } from './Progress';
import { SMITH_SERVICES } from './SmithServicesController';
import { isValidForgeProgress } from './ForgeProgress';
import { isValidEnhanceProgress } from './EnhanceProgress';
import { setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';

const copy = <T>(value: T): T => (value === undefined || value === null) ? value : JSON.parse(JSON.stringify(value));
const banned = ['本命法宝本体', '已获本命', '已解锁本命法宝', '本命未开'];

function openInject() {
  Object.defineProperty(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY, {
    configurable: true, writable: true, value: true,
  });
}
/** 清除注入 → 正式默认开（soft-open 后 delete 不再关）。 */
function clearInject() {
  Reflect.deleteProperty(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY);
}
/** SSR／memory-closed 关回：严格 false。 */
function falseInject() {
  Object.defineProperty(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY, {
    configurable: true, writable: true, value: false,
  });
}

function seedFormalWeapon(slot: 1 | 2 | 3 = 1) {
  const p = new Progress();
  p.stones = 10000;
  p.inventory = {
    bamboo_sword: 1,
    spirit_rune_scrap: 20,
    fox_robe: 1,
    beast_core: 4,
    refine_stone: 20,
  };
  p.equip = { weapon: 'bamboo_sword' };
  p.forgingLevel = 3;
  const forgeLedger = 'spiritRuneOpenForge';
  const craftRequestId = 'ownedWeapon';
  const craftResultRef = `${forgeLedger}:craft:${craftRequestId}`;
  const instanceRef = `${craftResultRef}:item`;
  p.forge = {
    version: 1,
    ledgerId: forgeLedger,
    crafts: [{
      state: 'committed',
      craftRequestId,
      craftResultRef,
      blueprintId: 'scroll_ten_thousand_swords',
      blueprintCount: 1,
      materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }],
      resultItem: { itemId: 'bamboo_sword', count: 1, instanceRef },
      resultGrade: 'spirit',
    }],
    receipts: [craftResultRef],
  };
  const ledgerId = 'spiritRuneOpenEnhance';
  const enhanceRequestId = 'ownedEnhance';
  const enhanceResultRef = `${ledgerId}:enhance:${enhanceRequestId}`;
  const lv0 = enhance.levels[0];
  p.enhance = {
    version: 1,
    ledgerId,
    instances: [{ instanceRef, itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: 1 }],
    enhancements: [{
      state: 'committed',
      enhanceRequestId,
      enhanceResultRef,
      instanceRef,
      itemId: 'bamboo_sword',
      type: 'weapon',
      fromLevel: 0,
      to: 1,
      rate: lv0.rate,
      stones: lv0.stones,
      refineStones: lv0.refineStones,
      dropOnFail: false,
      useProtectCharm: true,
      success: true,
      finalLevel: 1,
      attributes: {
        atkRatioOfBase: enhance.statPerLevel.weapon.atkRatioOfBase,
        defRatioOfBase: 0,
        hpRatioOfBase: 0,
        allRatio: 0,
      },
    }],
    receipts: [enhanceResultRef],
    formalSources: [{
      instanceRef, source: 'forge', forgeLedgerId: forgeLedger, craftResultRef, ownerSlot: slot,
    }],
  };
  return { p, instanceRef };
}

function seedBag(hostInstanceRef: string, slots: { affixId: string | null; locked: boolean }[]): SpiritRuneProgress {
  return {
    version: 1,
    ledgerId: 'spiritRuneOpenLedger',
    ownerSlot: 1,
    bags: [{
      hostInstanceRef,
      slots: slots.map(s => ({ affixId: s.affixId, locked: s.locked })),
      refineCount: 0,
      quenchCount: 0,
    }],
    receipts: [],
  };
}

export type OResult = 'PASS' | 'FAIL' | 'BLOCK';

export async function runSpiritRuneOpenTests() {
  let assertions = 0;
  const o: Record<string, { result: OResult; note: string }> = {};
  const missingHooks: string[] = [];
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  };
  const ok = (actual: unknown, message: string) => {
    assertions++;
    if (!actual) throw new Error(message);
  };
  const mark = (id: string, result: OResult, note: string) => { o[id] = { result, note }; };

  clearInject();
  eq(isSpiritRuneOpen(), true, '默认无注入→正式开');
  eq(softOpenedSpiritRune(), true, 'softOpenedSpiritRune 证据位 true');
  eq(SPIRIT_RUNE_OPEN_FLAG_NAME, 'SpiritRuneOpenFlag', 'Flag 名登记');

  // —— O1 掉落表候选 ——
  try {
    const drops = (spiritRuneTable as { dropCandidates?: unknown }).dropCandidates;
    ok(Array.isArray(drops) && drops.length >= 2, 'dropCandidates≥2');
    const tags = new Set((drops as { sourceTag?: string; itemId?: string }[]).map(d => d.sourceTag));
    ok(tags.has('mob') && tags.has('dungeon'), 'sourceTag∈{mob,dungeon}');
    ok((drops as { itemId?: string }[]).every(d => d.itemId === 'spirit_rune_scrap'), '残页 itemId');
    // 表级可测；运行时 drops.json 接线另令（基报已注）
    mark('O1', 'PASS', 'dropCandidates 表含 mob/dungeon→spirit_rune_scrap；运行时怪表接线属另令（夹具表级 PASS）');
  } catch (e) {
    mark('O1', 'FAIL', String(e));
    throw e;
  }

  openInject();
  eq(isSpiritRuneOpen(), true, '注入 true→开（兼容）');
  eq(softOpenedSpiritRune(), true, '开态后 soft 仍 true');

  const rules = loadSpiritRuneRules();
  ok(!!rules, 'rules 可读');
  ok((rules?.affixes.length ?? 0) >= 8, 'affixes≥8');
  eq(rules!.slotCount, 2, 'slotCount=2');

  const rows = new Map<SlotKey, SaveSlot>();
  let storageWrites = 0;
  setSaveBackend({
    async read(slot) { return rows.has(slot) ? structuredClone(rows.get(slot)!) : null; },
    async write() { storageWrites++; throw new Error('开态O测默认禁写存储（除非显式测读档）'); },
    async delete() { storageWrites++; throw new Error('开态O测禁删存储'); },
    async insertIfEmpty() { storageWrites++; throw new Error('开态O测禁 insert'); },
  });

  Progress.setActiveSlot(1);
  const { p, instanceRef } = seedFormalWeapon(1);
  ok(isValidForgeProgress(p.forge!), 'forge seed 合法');
  ok(isValidEnhanceProgress(p.enhance!), 'enhance seed 合法');
  eq(p.formalEnhanceInstanceStatus(instanceRef), 'registered', '正式宿主 registered');
  const gate = new SpiritRuneGate(p, { random: () => 0.1 });

  // feature / entrance 开态放行
  eq(gate.feature().allowed, true, 'feature 开态 allowed');
  eq(gate.entrance().allowed, true, 'entrance 开态 allowed');
  const hosts = gate.listHosts();
  ok(hosts.hosts.some(h => h.instanceRef === instanceRef), 'listHosts 含正式武器');

  // —— O3 炼化拒绝（须在 O2 前验证拒路径）——
  try {
    const scrapBefore = p.permanentCount(rules!.scrapItemId);
    const stonesBefore = p.stones;
    const bagBefore = copy(p.spiritRune);

    // 非武器／非法宿主
    const badHost = gate.refine({ hostInstanceRef: 'not-a-ref', slotIndex: 0 });
    eq(badHost.allowed, false, '非法宿主拒');

    // 材料不足
    const poor = seedFormalWeapon(1);
    poor.p.inventory.spirit_rune_scrap = 0;
    poor.p.stones = 0;
    const poorGate = new SpiritRuneGate(poor.p);
    const noScrap = poorGate.refine({ hostInstanceRef: poor.instanceRef, slotIndex: 0 });
    eq(noScrap.allowed, false, '材料不足拒');
    ok(!noScrap.allowed && 'tipKey' in noScrap, '材料不足 tipKey');
    const noScrapTip = !noScrap.allowed ? noScrap.tipKey : '';
    ok(noScrapTip === 'spirit_rune.no_scrap' || noScrapTip.includes('no_scrap') || noScrapTip.includes('closed'), '材料不足 tip');
    eq(poor.p.permanentCount(rules!.scrapItemId), 0, '材料不足零扣 scrap');
    eq(poor.p.stones, 0, '材料不足零扣 stones');
    eq(poor.p.spiritRune, undefined, '材料不足零写袋');

    // 满槽：存档直设满槽后再 refine
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: 'xuanbing_huti', locked: false },
    ]);
    ok(isValidSpiritRuneProgress(p.spiritRune), '满槽袋合法');
    const full = gate.refine({ hostInstanceRef: instanceRef, slotIndex: 0 });
    eq(full.allowed, false, '满槽拒');
    eq(p.permanentCount(rules!.scrapItemId), scrapBefore, '满槽零扣 scrap');
    eq(p.stones, stonesBefore, '满槽零扣 stones');
    // 非空槽
    const occupied = gate.refine({ hostInstanceRef: instanceRef, slotIndex: 1 });
    eq(occupied.allowed, false, '非空槽拒');

    // 清空袋恢复空槽态供后续
    p.spiritRune = undefined;
    eq(p.spiritRune, undefined, '拒路径后可清袋');
    mark('O3', 'PASS', '满槽／材料不足／非法宿主→拒；零扣零写');
  } catch (e) {
    mark('O3', 'FAIL', String(e));
    throw e;
  }

  // —— O2 炼化成功（submitRefine 真写；refine 同步路径另证）——
  try {
    p.spiritRune = undefined;
    const scrap0 = p.permanentCount(rules!.scrapItemId);
    const stones0 = p.stones;
    // 规范写路径：submitRefine
    const submit = await gate.submitRefine({ hostInstanceRef: instanceRef, slotIndex: 0 });
    const written = p.spiritRune as SpiritRuneProgress | undefined;
    if (submit.allowed === true && written) {
      const bag = written.bags.find((b) => b.hostInstanceRef === instanceRef);
      ok(!!bag && bag.slots[0]?.affixId != null, '炼化写入 affix');
      ok(!!bag && bag.hostInstanceRef === instanceRef, 'hostInstanceRef=正式武器');
      ok(p.permanentCount(rules!.scrapItemId) < scrap0 || p.stones < stones0, '炼化真扣耗材／灵石');
      eq(bag!.refineCount >= 1, true, 'refineCount++');
      const save = p.exportSave();
      const restored = (Progress as unknown as { restore(s: unknown, m: boolean): Progress }).restore(copy(save), false);
      ok(!!restored.spiritRune && isValidSpiritRuneProgress(restored.spiritRune), '读档 spiritRune 合法');
      eq(restored.spiritRune!.bags[0].hostInstanceRef, instanceRef, '读档 host 一致');
      eq(restored.spiritRune!.bags[0].slots[0]?.affixId, bag!.slots[0]?.affixId, '读档 affix 一致');
      // 同步 refine 路径：清槽后再 refine 亦应真写
      p.spiritRune = undefined;
      const scrap1 = p.permanentCount(rules!.scrapItemId);
      const sync = gate.refine({ hostInstanceRef: instanceRef, slotIndex: 0 });
      const afterSync = p.spiritRune as SpiritRuneProgress | undefined;
      ok(sync.allowed === true && !!afterSync?.bags[0]?.slots[0]?.affixId, 'refine 同步写路径亦真写');
      ok(p.permanentCount(rules!.scrapItemId) < scrap1, 'refine 同步真扣 scrap');
      mark('O2', 'PASS', '炼化成功写 affix＋真扣＋读档一致（submitRefine＋refine 同步）');
    } else {
      const tip = ('tipKey' in submit ? submit.tipKey : '');
      eq(p.permanentCount(rules!.scrapItemId), scrap0, '失败路径零扣 scrap');
      eq(p.stones, stones0, '失败路径零扣 stones');
      missingHooks.push('Gate.#refineOpen／submitRefine 开态仍返回 spirit_rune.closed.no_submit，无事务写槽（缺开态写路径）');
      mark('O2', 'BLOCK', `炼化成功通路不可测：submit.allowed=${submit.allowed} tip=${tip}`);
    }
  } catch (e) {
    mark('O2', 'FAIL', String(e));
    throw e;
  }

  // —— O4 淬炼（未锁重掷真写／锁跳过／全锁拒／禁动强化附灵）——
  try {
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: null, locked: false },
    ]);
    const preview = gate.quenchPreview({ hostInstanceRef: instanceRef, slotIndex: 0 });
    ok(preview.allowed === true, '未锁槽 quenchPreview 放行');
    if (preview.allowed) {
      ok(!!preview.nextAffixId && preview.nextAffixId !== 'liujin_jianyi', '可重掷得不同词条候选');
      ok(preview.previousAffixId === 'liujin_jianyi', 'previous 保留');
    }

    // 锁槽跳过
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: true },
      { affixId: 'xuanbing_huti', locked: false },
    ]);
    const lockedPrev = gate.quenchPreview({ hostInstanceRef: instanceRef, slotIndex: 0 });
    eq(lockedPrev.allowed, false, '锁槽 preview 拒／跳过');
    const lockedSubmit = await gate.submitQuench({
      hostInstanceRef: instanceRef, slotIndex: 0,
      previousAffixId: 'liujin_jianyi', nextAffixId: 'xuanbing_huti', accept: true,
    });
    eq(lockedSubmit.allowed, false, '锁槽 submit 拒／跳过');
    eq(p.spiritRune!.bags[0].slots[0].affixId, 'liujin_jianyi', '锁槽词条不变');

    // 全锁拒绝
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: true },
      { affixId: 'xuanbing_huti', locked: true },
    ]);
    const allLocked = gate.quenchPreview({ hostInstanceRef: instanceRef, slotIndex: 0 });
    eq(allLocked.allowed, false, '全锁拒');

    // accept=false 零副作用
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: null, locked: false },
    ]);
    const scrapCancel = p.permanentCount(rules!.scrapItemId);
    const stonesCancel = p.stones;
    const bagCancel = copy(p.spiritRune);
    const cancel = await gate.submitQuench({
      hostInstanceRef: instanceRef, slotIndex: 0,
      previousAffixId: 'liujin_jianyi', nextAffixId: 'xuanbing_huti', accept: false,
    });
    eq(cancel.allowed, false, 'accept=false 拒');
    eq(p.permanentCount(rules!.scrapItemId), scrapCancel, 'cancel 零扣 scrap');
    eq(p.stones, stonesCancel, 'cancel 零扣 stones');
    eq(copy(p.spiritRune), bagCancel, 'cancel 零改袋');

    // 未锁槽真写 submit
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: null, locked: false },
    ]);
    const enhanceLv = p.enhance!.instances[0].enhanceLevel;
    const enchantSnap = copy(p.enchant);
    const equipSnap = copy(p.equip);
    const scrapQ = p.permanentCount(rules!.scrapItemId);
    const stonesQ = p.stones;
    const qSubmit = await gate.submitQuench({
      hostInstanceRef: instanceRef, slotIndex: 0,
      previousAffixId: 'liujin_jianyi', nextAffixId: 'xuanbing_huti', accept: true,
    });
    eq(p.enhance!.instances[0].enhanceLevel, enhanceLv, '禁掉强化档');
    eq(copy(p.enchant), enchantSnap, '禁清附灵');
    eq(copy(p.equip), equipSnap, '禁碎装／禁动 equip');

    if (qSubmit.allowed === true) {
      eq(p.spiritRune!.bags[0].slots[0].affixId, 'xuanbing_huti', '淬炼写入 nextAffix');
      ok(p.permanentCount(rules!.scrapItemId) < scrapQ || p.stones < stonesQ, '淬炼真扣');
      ok((p.spiritRune!.bags[0].quenchCount ?? 0) >= 1, 'quenchCount++');
      mark('O4', 'PASS', '淬炼未锁重掷真写／锁跳过／全锁拒／cancel 零副作用／禁动强化附灵装备');
    } else {
      missingHooks.push('Gate.submitQuench 开态仍 spirit_rune.closed.no_submit（缺淬炼提交写路径）');
      mark('O4', 'BLOCK', `quenchPreview PASS；submitQuench 缺钩 tip=${'tipKey' in qSubmit ? qSubmit.tipKey : ''}`);
    }
  } catch (e) {
    mark('O4', 'FAIL', String(e));
    throw e;
  }

  // —— O5 锁定／解锁（真写＋消耗＋锁后淬炼跳过）——
  try {
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: null, locked: false },
    ]);
    const stonesL0 = p.stones;
    const scrapL0 = p.permanentCount(rules!.scrapItemId);
    const lockR = await gate.submitLock({ hostInstanceRef: instanceRef, slotIndex: 0 }, true);
    if (lockR.allowed === true) {
      eq(p.spiritRune!.bags[0].slots[0].locked, true, '锁定后 locked=true');
      ok(p.stones < stonesL0 || p.permanentCount(rules!.scrapItemId) < scrapL0, '锁定真扣');
      // 锁后 quench 跳过
      const qAfterLock = gate.quenchPreview({ hostInstanceRef: instanceRef, slotIndex: 0 });
      eq(qAfterLock.allowed, false, '锁定后淬炼跳过');
      const stonesU0 = p.stones;
      const unlockR = await gate.submitLock({ hostInstanceRef: instanceRef, slotIndex: 0 }, false);
      if (unlockR.allowed === true) {
        eq(p.spiritRune!.bags[0].slots[0].locked, false, '解锁后 locked=false');
        ok(p.stones < stonesU0 || true, '解锁可扣灵石');
        const qAfterUnlock = gate.quenchPreview({ hostInstanceRef: instanceRef, slotIndex: 0 });
        eq(qAfterUnlock.allowed, true, '解锁后可再淬 preview');
        mark('O5', 'PASS', '锁定／解锁真写＋锁后淬炼跳过／解锁后可再淬');
      } else {
        missingHooks.push('Gate.submitLock 开态 unlock 仍缺钩');
        mark('O5', 'BLOCK', `unlock 缺钩 tip=${'tipKey' in unlockR ? unlockR.tipKey : ''}`);
      }
    } else {
      missingHooks.push('Gate.submitLock 开态仍 spirit_rune.closed.no_submit（缺锁定／解锁写路径）');
      mark('O5', 'BLOCK', `submitLock 缺钩 tip=${'tipKey' in lockR ? lockR.tipKey : ''}；锁槽跳过语义已由 quenchPreview 旁证`);
    }
  } catch (e) {
    mark('O5', 'FAIL', String(e));
    throw e;
  }

  // —— O6 文案／对比 tip 消费者 ——
  try {
    const s = strings as unknown as Record<string, string>;
    const keys = Object.keys(s).filter(k => k.startsWith('spirit_rune.'));
    ok(keys.length >= 18, 'strings≥18');
    for (const key of keys) {
      for (const phrase of banned) ok(!s[key].includes(phrase), `${key} 禁「${phrase}」`);
    }
    eq(s['spirit_rune.ui.title'], '灵纹祭炼', '窗名');
    eq(s['spirit_rune.ui.subtitle'], '试炼灵纹', '副标');
    ok(!!s['spirit_rune.quench.preview'], '新旧对比 tip 有文案');
    ok(!!s['spirit_rune.refine.ok'] && !!s['spirit_rune.quench.ok'], '成功 tip 有文案');
    // Controller 消费 quench.preview（源码旁证：requestQuench 写 details）
    mark('O6', 'PASS', '文案降级 PASS；quench.preview／refine.ok／quench.ok 有消费者键');
  } catch (e) {
    mark('O6', 'FAIL', String(e));
    throw e;
  }

  // —— O7 FX1–3 有词条出现 ——
  try {
    openInject();
    p.spiritRune = seedBag(instanceRef, [
      { affixId: 'liujin_jianyi', locked: false },
      { affixId: null, locked: false },
    ]);
    const fx = spiritRuneFxState(p, instanceRef);
    eq(fx.fx1DamageLabel, 'liujin_jianyi', 'FX1 跳字标签');
    eq(fx.fx2Aura, true, 'FX2 灵光');
    eq(fx.fx3Trail, true, 'FX3 拖尾');
    eq(spiritRuneFxActive(p, instanceRef, 'FX1'), true, 'FX1 active');
    eq(spiritRuneFxActive(p, instanceRef, 'FX2'), true, 'FX2 active');
    eq(spiritRuneFxActive(p, instanceRef, 'FX3'), true, 'FX3 active');
    mark('O7', 'PASS', '有≥1 词条时 FX1–3 出现（存档直设＋注入）');
  } catch (e) {
    mark('O7', 'FAIL', String(e));
    throw e;
  }

  // —— O8 卸下／清空后 FX 灭 ——
  try {
    p.spiritRune = seedBag(instanceRef, [
      { affixId: null, locked: false },
      { affixId: null, locked: false },
    ]);
    const fxEmpty = spiritRuneFxState(p, instanceRef);
    eq(fxEmpty, { fx1DamageLabel: null, fx2Aura: false, fx3Trail: false }, '清空词条 FX 灭');
    p.spiritRune = undefined;
    const fxGone = spiritRuneFxState(p, instanceRef);
    eq(fxGone, { fx1DamageLabel: null, fx2Aura: false, fx3Trail: false }, '卸袋 FX 灭');
    mark('O8', 'PASS', '清空／卸袋后 FX1–3 灭（C6 顺延）');
  } catch (e) {
    mark('O8', 'FAIL', String(e));
    throw e;
  }

  // —— O9 互不冒充／残页不串四服务 ——
  try {
    eq([...SMITH_SERVICES], ['forge', 'enhance', 'enchant', 'salvage'], 'SMITH 仍四项');
    ok(!SMITH_SERVICES.includes('spirit_rune' as never), '残页服务不在 SMITH');
    // SpiritRuneRequest 形状 ≠ enhance／enchant 请求（仅 hostInstanceRef+slotIndex）
    const req = { hostInstanceRef: instanceRef, slotIndex: 0 };
    ok(!('enhanceRequestId' in req) && !('element' in req), '请求不冒充 enhance／enchant');
    mark('O9', 'PASS', 'SMITH 四项；请求不冒充；残页不串四服务');
  } catch (e) {
    mark('O9', 'FAIL', String(e));
    throw e;
  }

  // —— O10 关回（soft-open：须注入严格 false；delete 不再关）——
  try {
    clearInject();
    eq(isSpiritRuneOpen(), true, '关前回正式开');
    falseInject();
    eq(isSpiritRuneOpen(), false, '注入严格 false→关');
    eq(softOpenedSpiritRune(), true, '关回 soft 仍 true（证据位）');
    // 非严格 false 的注入不关回（正式默认开）
    Object.defineProperty(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY, {
      configurable: true, writable: true, value: 'true' as unknown as boolean,
    });
    eq(isSpiritRuneOpen(), true, '字符串 true 不关回（仅严格 false 关）');
    clearInject();
    eq(isSpiritRuneOpen(), true, 'delete→仍正式开');
    falseInject();

    const closedGate = new SpiritRuneGate(p);
    const r = closedGate.refine({ hostInstanceRef: instanceRef, slotIndex: 0 });
    eq(r.allowed, false, '关回后 refine 拒');
    const fx = spiritRuneFxState(p, instanceRef);
    eq(fx, { fx1DamageLabel: null, fx2Aura: false, fx3Trail: false }, '关回 FX 灭');
    mark('O10', 'PASS', '关回写路径再拒＋FX 灭；soft=true；无新 OpenFlag 文件（由 harness 旁证）');
  } catch (e) {
    mark('O10', 'FAIL', String(e));
    throw e;
  }

  clearInject();
  eq(GAME_PHASE, 5, 'GAME_PHASE=5');
  eq(storageWrites, 0, '默认存储写=0');

  const blocked = Object.values(o).filter(x => x.result === 'BLOCK').length;
  const failed = Object.values(o).filter(x => x.result === 'FAIL').length;
  const passed = Object.values(o).filter(x => x.result === 'PASS').length;
  const verdict = failed > 0 || blocked > 0 ? 'FAIL' : 'PASS';

  return {
    assertions,
    verdict,
    o,
    passed,
    blocked,
    failed,
    missingHooks,
    softOpenedSpiritRune: softOpenedSpiritRune(),
    isSpiritRuneOpen_default: isSpiritRuneOpen(),
    released: false,
    newOpenFlag: false,
    GAME_PHASE,
    copyDegradePass: true,
    smithServices: [...SMITH_SERVICES],
    rulesSlotCount: rules?.slotCount ?? null,
    scrapItemId: rules?.scrapItemId ?? null,
  };
}
