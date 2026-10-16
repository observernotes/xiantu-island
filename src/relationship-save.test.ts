import { Progress, RELATIONSHIP_BACKUP_KEY } from './Progress';
import { createRelationshipState, isValidAffinity, isValidRelationshipState, normalizeRelationshipState, RELATIONSHIP_VERSION } from './RelationshipState';

let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function check(value: unknown, message: string): asserts value { equal(!!value, true, message); }
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const dateNowBefore = Date.now;
const saveKey = 'xiantu_save_v1';
const disk: Record<string, string> = {};
let writes = 0, rejectSave = false, rejectBackup = false;
const now = Date.now();
const fields = (p: Progress) => ({ affinity: p.affinity, relationshipState: p.relationshipState });
function load(saved: Record<string, unknown>) { disk[saveKey] = JSON.stringify(saved); return Progress.load(); }
function oldSave() {
  const saved = new Progress().exportSave();
  delete saved.affinity; delete saved.relationshipState;
  return saved;
}

try {
  Date.now = () => now;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => disk[key] ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      if (key === saveKey && rejectSave || key === RELATIONSHIP_BACKUP_KEY && rejectBackup) throw new Error('injected relationship storage failure');
      disk[key] = String(value);
    },
    removeItem: (key: string) => { delete disk[key]; },
  } });

  const defaults = { affinity: {}, relationshipState: createRelationshipState() };
  equal(fields(new Progress()), defaults, '新档关系为空且从版本1开始');
  {
    const saved = oldSave();
    saved.quests = { q_awaken: { state: 'done', kills: {} }, q_fox: { state: 'done', kills: {} } };
    const raw = JSON.stringify(saved), p = load(saved);
    equal(disk[RELATIONSHIP_BACKUP_KEY], raw, '首次升级前保留原始旧档备份');
    equal(fields(p), defaults, '旧档已完成任务不补来源、好感或奖励');
    const persisted = JSON.parse(disk[saveKey]);
    equal({ affinity: persisted.affinity, relationshipState: persisted.relationshipState }, defaults, '关系容器与版本一起保存');
    const afterWrites = writes;
    equal(fields(Progress.load()), defaults, '重复load不推断历史并保持空关系');
    equal(writes, afterWrites, '当前版本不重复写迁移');
    const otherOldSave = oldSave(); otherOldSave.stones = 77;
    load(otherOldSave);
    equal(disk[RELATIONSHIP_BACKUP_KEY], raw, '后续旧档不覆盖第一份迁移前备份');
  }
  {
    const p = new Progress();
    p.affinity = { village_elder: -12, future_npc: 345 };
    p.relationshipState.pendingAffinitySources = [{ sourceId: 'village_elder|quest|q_awaken', npc: 'village_elder', quest: 'q_awaken' }];
    p.relationshipState.appliedAffinitySources = ['doctor_sun|quest|q_medicine'];
    p.relationshipState.claimedAffinityRewards = ['doctor_sun|confidant_gift'];
    p.relationshipState.questChoices = { q_legacy: 'chosen' };
    p.relationshipState.appliedQuestHooks = ['q_legacy'];
    p.relationshipState.quarantinedFlags = { unknown_flag: { original: 'invalid', details: [null, false, 1] } };
    const expected = fields(p), saved = p.exportSave();
    equal(fields(load(saved)), expected, '合法负值、未知NPC旧值和全部关系收据可load往返');
    const imported = new Progress();
    equal(imported.importSave(saved), true, '合法关系状态可严格导入');
    equal(fields(imported), expected, '导入保留全部关系字段，不根据配置改旧值');
    equal(fields(Progress.load()), expected, '导入后的关系可落盘往返');
  }
  {
    const p = new Progress(), saved = p.exportSave();
    for (const affinity of [null, [], 'bad', { village_elder: null }, { village_elder: '30' }, { village_elder: 0.5 }, { village_elder: Number.MAX_SAFE_INTEGER + 1 }]) {
      const before = p.exportSave(), beforeWrites = writes;
      equal(p.importSave({ ...saved, affinity }), false, '严格导入拒绝坏好感形状/数值');
      equal(p.exportSave(), before, '坏好感不覆盖当前角色');
      equal(writes, beforeWrites, '坏好感不写盘');
    }
    const badStates: unknown[] = [null, [], 'bad', { ...createRelationshipState(), version: 0 },
      { ...createRelationshipState(), appliedAffinitySources: ['village_elder|quest|q_awaken', 'village_elder|quest|q_awaken'] },
      { ...createRelationshipState(), claimedAffinityRewards: [null] },
      { ...createRelationshipState(), pendingAffinitySources: [{ sourceId: 'wrong', npc: 'village_elder', quest: 'q_awaken' }] },
      { ...createRelationshipState(), appliedAffinitySources: ['village_elder|quest|q_awaken'],
        pendingAffinitySources: [{ sourceId: 'village_elder|quest|q_awaken', npc: 'village_elder', quest: 'q_awaken' }] },
      { ...createRelationshipState(), pendingAffinitySources: Array(1) },
      { ...createRelationshipState(), questChoices: { q_awaken: null } },
      { ...createRelationshipState(), quarantinedFlags: [] },
    ];
    for (const relationshipState of badStates) {
      const before = p.exportSave(), beforeWrites = writes;
      equal(p.importSave({ ...saved, relationshipState }), false, '严格导入拒绝坏关系收据/队列');
      equal(p.exportSave(), before, '坏关系不覆盖当前角色');
      equal(writes, beforeWrites, '坏关系不写盘');
    }
    const before = p.exportSave(), diskBefore = disk[saveKey];
    rejectSave = true;
    equal(p.importSave({ ...saved, affinity: { village_elder: 17 } }), false, '导入写盘失败返回失败');
    equal(p.exportSave(), before, '导入写盘失败恢复完整内存');
    equal(disk[saveKey], diskBefore, '导入写盘失败保留磁盘原档');
    rejectSave = false;
  }
  {
    const saved = new Progress().exportSave();
    saved.affinity = { village_elder: null, doctor_sun: '30', grocer_wang: 12, future_npc: -8 };
    const p = load(saved);
    equal(p.affinity, { grocer_wang: 12, future_npc: -8 }, 'load过滤坏数值，保留合法整数，绝不转换null/字符串');
    check(isValidAffinity(p.affinity), '安全降级后好感均为安全整数');
    const malformed = { ...createRelationshipState(), appliedAffinitySources: ['corrupt receipt'] };
    const broken = load({ ...saved, relationshipState: malformed });
    equal(broken.relationshipState, malformed, '损坏收据原样保留，不清空防重状态');
    equal(isValidRelationshipState(broken.relationshipState), false, '损坏收据让关系消费者暂停');
    broken.ensureDefaults();
    equal(broken.relationshipState, malformed, '重复ensureDefaults仍不清坏收据');
    equal(normalizeRelationshipState({ version: 1 }), createRelationshipState(), '仅缺失关系容器可补空');
  }
  {
    delete disk[RELATIONSHIP_BACKUP_KEY];
    const saved = oldSave(), raw = JSON.stringify(saved);
    rejectBackup = true;
    const blocked = load(saved);
    equal(blocked.relationshipState.version, 0, '备份失败时关系保持未就绪版本');
    equal(isValidRelationshipState(blocked.relationshipState), false, '备份失败禁止关系消费者结算');
    equal(disk[saveKey], raw, '备份失败不覆盖原档');
    blocked.ensureDefaults();
    equal(blocked.relationshipState.version, 0, 'ensureDefaults不能绕过失败的备份');
    rejectBackup = false;
    const restored = Progress.load();
    equal(restored.relationshipState.version, RELATIONSHIP_VERSION, '备份恢复后重新load可完成迁移');
    equal(disk[RELATIONSHIP_BACKUP_KEY], raw, '重试迁移仍先保存原始备份');
  }
  console.log(JSON.stringify({ suite: 'relationship-save', passed: true, assertions }));
} finally {
  Date.now = dateNowBefore;
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
