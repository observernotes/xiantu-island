import companionsRaw from '@xt/balance/companions.json';
import npcsRaw from '@xt/balance/npcs.json';
import { parseAffinityIndex } from './Affinity';
import { activeCompanion, canControlCompanion, COMPANION_MODES, invite, parseCompanionsConfig, SU_COMPANION_ID } from './Companions';
import { featureEnabled } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, createMemorySaveBackend, saveStore, setSaveBackend } from './SaveStore';

/** 正式开态旁证；用关态夹具和正式异步存档接口验证关系保留。 */
export async function runCompanionsSaveTests(): Promise<void> {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
  };
  const same = (actual: unknown, expected: unknown, message: string) => eq(JSON.stringify(actual), JSON.stringify(expected), message);
  const closedInput = structuredClone(companionsRaw);
  closedInput.enabled = false;
  closedInput.companions[0].enabled = false;
  const config = parseCompanionsConfig(closedInput).config;
  const affinity = parseAffinityIndex(npcsRaw).config;
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const activeSlotBefore = Progress.getActiveSlot();
  const backend = createMemorySaveBackend();
  let writes = 0;
  setSaveBackend({ ...backend, async write(slot) { writes++; await backend.write(slot); } });
  const disk = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { disk.set(key, String(value)); },
    removeItem: (key: string) => { disk.delete(key); },
  } });
  try {
    eq(featureEnabled('indexedDbSaves'), true, '正式异步存档开态，不修改任何功能开关');
    eq(companionsRaw.enabled, true, '正式同门根已软开');
    eq(companionsRaw.companions[0].enabled, true, '正式苏师姐条目已软开');
    eq(config?.enabled, false, '显式关态夹具关闭同门根');
    {
      const oldSave = new Progress().exportSave();
      delete oldSave.companionRelations;
      eq(await saveStore.writeSlot(1, oldSave), true, '旧档可写入真实存档接口');
      const loaded = await Progress.load({ async: true, slot: 1 });
      eq(loaded.companionRelations, undefined, '关态旧档不创建关系容器');
      eq(Object.prototype.hasOwnProperty.call(loaded.exportSave(), 'companionRelations'), false, '旧档导出仍缺该字段');
      eq(await loaded.save({ async: true }), true, '旧档异步保存成功');
      eq(Object.prototype.hasOwnProperty.call((await saveStore.readSlot(1))?.data, 'companionRelations'), false, '旧档落盘不补空关系');
    }
    for (const mode of COMPANION_MODES) {
      const p = await Progress.load({ async: true, slot: 1 });
      const relation = { [SU_COMPANION_ID]: { mode } };
      p.companionRelations = relation;
      eq(await p.save({ async: true }), true, '已有关系异步保存成功');
      const loaded = await Progress.load({ async: true, slot: 1 });
      same(loaded.companionRelations, relation, '异步读档保留原关系与 mode');
      eq(activeCompanion(config, loaded), null, '关态真实读档不激活实体');
      eq(canControlCompanion(config, loaded), false, '关态真实读档不可切换模式');
      const beforeWrites = writes, before = loaded.exportSave(), relationBefore = loaded.companionRelations;
      const result = invite(config, affinity, loaded);
      eq(result.hintKey, 'companion.invite.disabled', '既有关系失效邀请仍先提示关态');
      eq(result.canInvite, false, '关态没有可执行邀请入口');
      eq(writes, beforeWrites, '关闭邀请不触发异步存档写入');
      eq(loaded.companionRelations, relationBefore, '关态拒绝不重建关系对象');
      same(loaded.exportSave(), before, '关闭邀请不改任何玩家状态');
      same((await saveStore.readSlot(1))?.data.companionRelations, relation, '关态原磁盘 mode 保持');
      const imported = await Progress.load({ async: true, slot: 2 });
      eq(await imported.importSave(loaded.exportSave(), { async: true }), true, '合法关态关系可异步导入');
      same(imported.companionRelations, relation, '导入保留 mode');
      same((await Progress.load({ async: true, slot: 2 })).companionRelations, relation, '导入后重载保留 mode');
    }
    {
      const loaded = await Progress.load({ async: true, slot: 1 });
      for (const malformed of [null, [], { [SU_COMPANION_ID]: { mode: 'invalid' } }, { another_companion: { mode: 'follow' } }]) {
        const before = loaded.exportSave(), beforeWrites = writes;
        eq(await loaded.importSave({ ...before, companionRelations: malformed }, { async: true }), false, '坏关系异步导入被拒绝');
        eq(writes, beforeWrites, '坏关系导入不写盘');
        same(loaded.exportSave(), before, '坏关系导入不覆盖现有 mode');
      }
    }
    console.log(`companions save tests ok: ${assertions} assertions (formal open, closed fixture, async save/load/import, modes retained while closed, legacy shape, invalid import rejected)`);
  } finally {
    Progress.setActiveSlot(activeSlotBefore);
    setSaveBackend(createIndexedDbBackend());
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
