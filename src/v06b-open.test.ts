import companionsRaw from '@xt/balance/companions.json';
import flyZonesRaw from '@xt/balance/fly_zones.json';
import npcsRaw from '@xt/balance/npcs.json';
import { parseAffinityIndex, type AffinityConfig } from './Affinity';
import { activeCompanion, canInvite, COMPANION_MODES, invite, parseCompanionsConfig,
  SU_COMPANION_ID, SU_COMPANION_NPC_ID, type CompanionInviteStatus, type CompanionProgress, type CompanionsConfig } from './Companions';
import { REALMS } from './data';
import { featureEnabled, featureFlags } from './features';
import { canSustainFlight, parseFlyZonesConfig, requestSustainFlight,
  type FlightRejectionReason, type SustainFlightRequest } from './FlyZones';
import { Progress } from './Progress';
import { createIndexedDbBackend, createMemorySaveBackend, saveStore, setSaveBackend } from './SaveStore';

/** 开态仅来自内存克隆；正式表、features、地图和运行时物理均不改。 */
export async function runV06bOpenTests(): Promise<void> {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const formalBefore = JSON.stringify([companionsRaw, flyZonesRaw, npcsRaw]);
  const flagsBefore = featureFlags();
  eq(featureEnabled('indexedDbSaves'), true, '沿用正式 IDB 开态，禁止覆盖 flag');
  eq(companionsRaw.enabled, false, '正式同门根保持关闭');
  eq(companionsRaw.companions[0].enabled, false, '正式苏师姐条目保持关闭');
  eq(flyZonesRaw.enabled, false, '正式持续飞行根保持关闭');
  const affinityChecked = parseAffinityIndex(npcsRaw);
  eq(affinityChecked.errors, [], '正式好感配置有效');
  const affinity = affinityChecked.config;
  ok(affinity, '正式好感配置可读');
  for (const entry of Object.values(affinity)) eq(entry.gifts.enabled, false, '所有 NPC 赠礼始终关闭');
  const su = affinity[SU_COMPANION_NPC_ID];
  eq(su.enabled, true, '沿用苏师姐已有好感开态');
  const threshold = su.tiers.find(tier => tier.id === 'confidant')?.min;
  ok(threshold !== undefined && threshold > su.min, '知交阈值读取正式 tiers.min');

  // 只改克隆中的三处 enabled，绝不向文件或会话 feature 写入。
  const openRaw = clone(companionsRaw), openFlyRaw = clone(flyZonesRaw);
  openRaw.enabled = true;
  openRaw.companions[0].enabled = true;
  openFlyRaw.enabled = true;
  const checked = parseCompanionsConfig(openRaw), flyChecked = parseFlyZonesConfig(openFlyRaw);
  eq(checked.errors, [], '双开同门夹具通过原解析器');
  eq(flyChecked.errors, [], '开态飞行夹具通过原解析器');
  const open = checked.config, fly = flyChecked.config;
  const closed = parseCompanionsConfig(companionsRaw).config;
  const closedFly = parseFlyZonesConfig(flyZonesRaw).config;
  ok(open && fly && closed && closedFly, '开关态对照配置均可用');
  eq([open.enabled, open.companions[0].enabled, fly.enabled], [true, true, true], '仅夹具临时双开');
  const restored = clone(openRaw), restoredFly = clone(openFlyRaw);
  restored.enabled = false; restored.companions[0].enabled = false; restoredFly.enabled = false;
  eq([restored, restoredFly], [companionsRaw, flyZonesRaw], '夹具除三处开关外与正式表完全相同');

  const expectedInvite = (status: CompanionInviteStatus) => ({ status, canInvite: status === 'ok',
    showInvite: status === 'ok', hintKey: `companion.invite.${status}` });
  const progressAt = (value = threshold) => {
    let transactions = 0;
    const progress: CompanionProgress = {
      affinity: { [SU_COMPANION_NPC_ID]: value },
      runSaveTransaction<T>(apply: () => T | undefined) { transactions++; return apply(); },
    };
    return { progress, transactions: () => transactions };
  };
  const assertRejected = (config: CompanionsConfig | null, dependencies: AffinityConfig | null,
    progress: CompanionProgress, status: CompanionInviteStatus, message: string, companionId = SU_COMPANION_ID) => {
    const before = JSON.stringify(progress);
    eq(canInvite(config, dependencies, progress, companionId), expectedInvite(status), `${message}：资格提示`);
    eq(invite(config, dependencies, progress, companionId), expectedInvite(status), `${message}：请求拒绝`);
    eq(JSON.stringify(progress), before, `${message}：不改关系、好感或收据`);
  };
  const qualified = progressAt();
  const rootClosed = clone(openRaw); rootClosed.enabled = false;
  const entryClosed = clone(openRaw); entryClosed.companions[0].enabled = false;
  const missing = clone(openRaw); missing.companions = [];
  for (const config of [closed, rootClosed, entryClosed, missing].map(raw => parseCompanionsConfig(raw).config)) {
    assertRejected(config, affinity, qualified.progress, 'disabled', '根关、条目关或缺条目先于达知交');
    const unreadable = new Proxy({}, { get() { throw new Error('关态不得读取存档或事务'); } }) as CompanionProgress;
    eq(invite(config, null, unreadable, '__invalid'), expectedInvite('disabled'), '关态先于坏依赖和坏请求，且不读存档');
  }
  eq(qualified.transactions(), 0, '关态邀请不进入事务');

  const unavailable = progressAt();
  unavailable.progress.companionRelations = { [SU_COMPANION_ID]: { mode: 'stay' } };
  const affinityDisabled = clone(affinity) as Record<string, any>;
  affinityDisabled[SU_COMPANION_NPC_ID].enabled = false;
  const noTier = clone(affinity) as Record<string, any>;
  noTier[SU_COMPANION_NPC_ID].tiers = su.tiers.filter(tier => tier.id !== 'confidant');
  for (const dependencies of [null, {}, affinityDisabled, noTier]) {
    assertRejected(open, dependencies, unavailable.progress, 'unavailable', '好感缺失、关闭或缺知交档位先于已有关系');
  }
  const badMapping = clone(open) as Record<string, any>;
  badMapping.companions[0].npcId = '__wrong_npc';
  eq(parseCompanionsConfig(badMapping).config, null, '坏 NPC 映射在原解析器被拒绝');
  assertRejected(badMapping as typeof open, affinity, unavailable.progress, 'unavailable', '运行时也防御坏 NPC 映射');
  assertRejected(open, affinity, unavailable.progress, 'unavailable', '无效同门请求不误邀苏师姐', '__invalid');
  eq(unavailable.transactions(), 0, 'unavailable 不进入保存事务');

  for (const mode of COMPANION_MODES) {
    const existing = progressAt(threshold - 1);
    existing.progress.companionRelations = { [SU_COMPANION_ID]: { mode } };
    assertRejected(open, affinity, existing.progress, 'already', '已有关系优先于未达知交');
    eq(existing.transactions(), 0, '重复邀请不进事务、不重置原指令');
  }
  const below = progressAt(threshold - 1);
  assertRejected(open, affinity, below.progress, 'need_confidant', '差一点知交仍无可执行邀请入口');
  eq(below.transactions(), 0, '未达知交不初始化关系、不保存');
  const shifted = clone(affinity) as Record<string, any>;
  shifted[SU_COMPANION_NPC_ID].tiers.find((tier: { id: string }) => tier.id === 'confidant').min++;
  eq(canInvite(open, shifted, qualified.progress).status, 'need_confidant', '门槛随内存 tiers.min 改变，未硬编码正式数值');

  // 将领礼、送礼与背包依赖设为不可读；任何误读都会导致 ok 断言失败。
  let forbiddenReads = 0;
  const forbidden = (key: PropertyKey): never => { forbiddenReads++; throw new Error(`邀请不得读取 ${String(key)}`); };
  const guardedAffinity: AffinityConfig = { ...affinity, [SU_COMPANION_NPC_ID]: new Proxy(su, {
    get(target, key, receiver) {
      if (key === 'gifts' || key === 'unlocks') return forbidden(key);
      return Reflect.get(target, key, receiver);
    },
  }) };
  for (const value of [threshold, su.max]) {
    const h = progressAt(value);
    for (const key of ['relationshipState', 'claimedAffinityRewards', 'confidant_gift', 'gifts', 'inventory', 'addItem', 'spawnCompanion']) {
      Object.defineProperty(h.progress, key, { get: () => forbidden(key) });
    }
    eq(canInvite(open, guardedAffinity, h.progress), expectedInvite('ok'), '达到或超过知交，不读领礼与送礼依赖即可邀请');
    eq(h.transactions(), 0, '预览资格不写存档');
    eq(invite(open, guardedAffinity, h.progress), expectedInvite('ok'), '邀请成功只写关系事务');
    eq(h.progress.companionRelations, { [SU_COMPANION_ID]: { mode: 'follow' } }, '成功只建立唯一 follow 关系');
    eq(h.progress.affinity, { [SU_COMPANION_NPC_ID]: value }, '邀请不改好感');
    eq(h.transactions(), 1, '成功邀请只执行一次事务');
    eq(invite(open, guardedAffinity, h.progress), expectedInvite('already'), '成功后重复邀请为 already');
    eq(h.transactions(), 1, '重复邀请不再保存');
  }
  eq(forbiddenReads, 0, '邀请全过程对礼物、收据、背包与实体依赖零读取');

  // 正式 IDB flag 为 true；使用真实外层异步事务的 draft 调用既有同步邀请 API。
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const slotBefore = Progress.getActiveSlot(), backend = createMemorySaveBackend();
  let writes = 0;
  const disk = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { disk.set(key, String(value)); },
    removeItem: (key: string) => { disk.delete(key); },
  } });
  setSaveBackend({ ...backend, async write(slot) { writes++; await backend.write(slot); } });
  try {
    for (const claimed of [false, true]) {
      const p = new Progress();
      p.affinity[SU_COMPANION_NPC_ID] = threshold;
      if (claimed) p.relationshipState.claimedAffinityRewards.push(`${SU_COMPANION_NPC_ID}|confidant_gift`);
      const before = p.exportSave(), receiptsBefore = clone(p.relationshipState.claimedAffinityRewards), writesBefore = writes;
      const invited = await p.runSaveTransaction(draft => {
        const result = invite(open, affinity, draft);
        return result.status === 'ok' ? result : undefined;
      }, { async: true });
      eq(invited, expectedInvite('ok'), '未领礼和已领礼均可经正式异步事务邀请');
      eq(writes - writesBefore, 1, '关系随真实异步事务只写一次');
      const relations = { [SU_COMPANION_ID]: { mode: 'follow' } };
      const after = p.exportSave();
      eq(after.companionRelations, relations, '异步提交后内存只增加唯一 follow 关系');
      delete after.companionRelations;
      eq(after, before, '除关系外所有进度原样保留，不发礼、不改收据或背包');
      eq((await saveStore.readSlot(Progress.getActiveSlot()))?.data.companionRelations, relations, '唯一 follow 关系实际落入存档');
      const loaded = await Progress.load({ async: true });
      eq(loaded.companionRelations, relations, '异步读档保持 follow 关系');
      eq(loaded.relationshipState.claimedAffinityRewards, receiptsBefore, '重载保留原领礼收据');
      eq(activeCompanion(open, loaded), { id: SU_COMPANION_ID, mode: 'follow' }, '开态只读投影唯一关系，不创建 AI');
      const repeatWrites = writes;
      eq(invite(open, affinity, loaded), expectedInvite('already'), '重载后再邀不重复建立关系');
      assertRejected(closed, affinity, loaded, 'disabled', '同一已存关系换回正式关态仍先拒绝');
      eq(activeCompanion(closed, loaded), null, '正式关态不激活保存的关系');
      eq(writes, repeatWrites, '重复与关态请求均不新增写盘');
      await loaded.flushSaves();
    }
  } finally {
    Progress.setActiveSlot(slotBefore);
    setSaveBackend(createIndexedDbBackend());
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }

  const request: SustainFlightRequest = { realmId: fly.unlockRealm, realmOrder: REALMS.map(realm => realm.id),
    ownsSkill: true, mapId: fly.maps[0], inFlyZone: true, mp: fly.mpPerSecond };
  const hint = { locked_realm: 'fly.locked_realm', disabled: 'fly.zone_disabled', unavailable: 'fly.zone_unavailable', mp_low: 'fly.mp_low' };
  const assertFlight = (config: typeof fly, input: SustainFlightRequest, reason: FlightRejectionReason, message: string) => {
    const before = JSON.stringify(input), expected = { ok: false, reason, messageKey: hint[reason] };
    eq(canSustainFlight(config, input), expected, `${message}：门禁结果`);
    eq(requestSustainFlight(config, input), { ...expected, entered: false, mpSpent: 0 }, `${message}：拒绝不进入飞行、不扣蓝`);
    eq(JSON.stringify(input), before, `${message}：不修改请求状态`);
  };
  for (const config of [fly, closedFly]) {
    assertFlight(config, { ...request, realmId: REALMS[0].id, ownsSkill: false, mapId: '__outside', inFlyZone: false, mp: 0 },
      'locked_realm', '境界优先于总开关、技能、区域与耗蓝');
  }
  assertFlight(fly, { ...request, realmId: '__missing_realm' }, 'locked_realm', '无效境界不能绕过门禁');
  for (const ownsSkill of [false, true]) for (const mapId of ['__outside', ...fly.maps]) for (const inFlyZone of [false, true]) {
    const input = { ...request, ownsSkill, mapId, inFlyZone, mp: 0 };
    assertFlight(closedFly, input, 'disabled', '正式关态先于技能、白名单、区域和灵力');
    if (!ownsSkill || !fly.maps.includes(mapId) || !inFlyZone) {
      assertFlight(fly, input, 'unavailable', '临时开态必须同时满足技能、地图白名单与有效区域，优先于缺蓝');
      assertFlight(fly, { ...input, mp: request.mp }, 'unavailable', '灵力充足也不能绕过技能或区域门禁');
    } else {
      assertFlight(fly, input, 'mp_low', '技能与区域均满足后才检查持续耗蓝');
    }
  }
  for (const mp of [fly.mpPerSecond - 1, -1, NaN, Infinity]) {
    assertFlight(fly, { ...request, mp }, 'mp_low', '持续耗蓝读取 mpPerSecond 且拒绝非有限灵力');
  }
  const realmOnly = { realmId: REALMS[0].id, realmOrder: request.realmOrder } as SustainFlightRequest;
  for (const key of ['ownsSkill', 'mapId', 'inFlyZone', 'mp']) {
    Object.defineProperty(realmOnly, key, { get() { throw new Error(`境界拒绝不得读取 ${key}`); } });
  }
  eq(canSustainFlight(fly, realmOnly).reason, 'locked_realm', '开态境界失败立即短路');
  const noMpRead = { ...request, inFlyZone: false };
  Object.defineProperty(noMpRead, 'mp', { get() { throw new Error('区域拒绝不得读取灵力'); } });
  eq(canSustainFlight(fly, noMpRead).reason, 'unavailable', '区域门禁先于灵力读取');
  const closedOnly = { realmId: request.realmId, realmOrder: request.realmOrder } as SustainFlightRequest;
  for (const key of ['ownsSkill', 'mapId', 'inFlyZone', 'mp']) {
    Object.defineProperty(closedOnly, key, { get() { throw new Error(`关态不得读取 ${key}`); } });
  }
  eq(canSustainFlight(closedFly, closedOnly).reason, 'disabled', '正式关态短路，不读取开态依赖');
  // 本轮只验门禁拒绝优先级，不承诺全条件满足后的真实持续飞行。
  eq(JSON.stringify([companionsRaw, flyZonesRaw, npcsRaw]), formalBefore, '测试结束正式导入表原样保留');
  eq(featureFlags(), flagsBefore, '测试不翻任何正式或会话 feature flag');
  eq(featureEnabled('indexedDbSaves'), true, '测试结束 IDB 仍为 true');
  console.log(`v06b open fixture tests ok: ${assertions} assertions (邀请优先级、无领礼依赖、真实异步存档、持续飞行拒绝门禁、正式关态对照)`);
}
