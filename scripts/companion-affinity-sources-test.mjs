// timeout 60s node scripts/companion-affinity-sources-test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = path.join(root, 'data');
const npcId = 'senior_sister_su', companionId = 'companion_senior_sister_su';
const questIds = ['q_su_fellow_meet', 'q_su_fellow_tour', 'q_su_fellow_confide'];
const bannedQuests = ['q_main_02', 'q_elder_exam'];
const sources = questIds.map(quest => ({ type: 'quest', quest, on: 'done', once: true, delta: 100 }));
const receipt = quest => `${npcId}|quest|${quest}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedHashes = {
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
};
let assertions = 0;
const eq = (actual, expected, label) => { assertions++; assert.deepEqual(actual, expected, label); };
const ok = (actual, label) => { assertions++; assert.ok(actual, label); };
const readJson = async rel => JSON.parse(await fs.readFile(path.join(dataRoot, rel), 'utf8'));
const before = new Map();
for (const [mode, dir] of [['snapshot', dataRoot], ['shared', sharedRoot(root)]]) {
  for (const [rel, expected] of Object.entries(expectedHashes)) {
    const file = path.join(dir, rel), actual = sha(await fs.readFile(file));
    eq(actual, expected, `${mode} ${rel} 固定 SHA`);
    before.set(file, actual);
  }
}
// 本刀只落分支快照；共享根尚未接线，不把 shared 冒充第二轮正式接线测试。
for (const rel of ['balance/quests.json', 'balance/npcs.json', 'balance/strings_zh.json', 'features.json']) {
  const file = path.join(dataRoot, rel);
  before.set(file, sha(await fs.readFile(file)));
}

const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const disk = new Map();
let writes = 0, server;
try {
  const [quests, npcs, strings, companions, skills] = await Promise.all([
    readJson('balance/quests.json'), readJson('balance/npcs.json'), readJson('balance/strings_zh.json'),
    readJson('balance/companions.json'), readJson('balance/skills.json'),
  ]);
  const su = npcs.find(npc => npc.id === npcId);
  ok(su, '苏师姐 NPC 存在');
  eq(su.quests, questIds, 'NPC 明挂三任务，保证 npcQuestIds 可逐一发现');
  eq(su.affinity.sources, sources, '恰好三条 quest/done/once/delta100，禁止第四来源');
  eq(su.affinity.sources.reduce((sum, source) => sum + source.delta, 0), 300, '三来源合计 300');
  eq(su.affinity.gifts.enabled, false, 'gifts.enabled 仍 false');
  for (const id of bannedQuests) {
    eq(su.quests.includes(id), false, `${id} 不挂苏 NPC 入口`);
    eq(su.affinity.sources.some(source => source.quest === id), false, `${id} 不在苏来源`);
  }
  for (const [index, id] of questIds.entries()) {
    const matches = quests.filter(quest => quest.id === id);
    eq(matches.length, 1, `${id} 唯一`);
    const q = matches[0], key = `quest.su_fellow_${['meet', 'tour', 'confide'][index]}`;
    ok(typeof q.name === 'string' && /[\u3400-\u9fff]/u.test(q.name), `${id} 中文任务名`);
    eq(q.giver, npcId, `${id} giver`);
    eq(q.turnIn, npcId, `${id} turnIn`);
    eq(q.objectives, [{ type: 'talk', target: npcId }], `${id} 仅 talk 苏`);
    eq(q.prereq, questIds[index - 1] ?? null, `${id} prereq`);
    eq(q.next, questIds[index + 1] ?? null, `${id} next`);
    eq(q.reqLevel, null, `${id} reqLevel=null`);
    eq(q.rewards, {}, `${id} rewards={}`);
    eq(q.phase, 5, `${id} phase=5`);
    eq(q.nameKey, `${key}.name`, `${id} nameKey`);
    eq(q.descriptionKey, `${key}.description`, `${id} descriptionKey`);
    eq(q.dialogueKeys, { offer: `${key}.offer`, progress: `${key}.progress`, complete: `${key}.complete` }, `${id} 对话键`);
    for (const suffix of ['name', 'description', 'offer', 'progress', 'complete']) {
      ok(typeof strings[`${key}.${suffix}`] === 'string' && strings[`${key}.${suffix}`].trim(), `${key}.${suffix} 文案完整`);
    }
    eq(strings[q.nameKey], q.name, `${id} 中文名与 nameKey 对齐`);
  }

  server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  });
  for (const rel of ['npcs', 'quests', 'strings_zh']) {
    const resolved = await server.pluginContainer.resolveId(`@xt/balance/${rel}.json`);
    eq(path.normalize(resolved?.id ?? ''), path.join(dataRoot, `balance/${rel}.json`), `${rel} 实际解析分支快照`);
  }
  await legacySaveFixture(server);
  const { AFFINITY, AFFINITY_ERRORS, QUESTS, GAME_PHASE } = await server.ssrLoadModule('/src/data.ts');
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
  const { parseAffinityIndex, getAffinity, consumeQuestAffinitySources, stageQuestAffinityCompletion,
    consumeEncounterAffinityHooks, applyAffinityDelta, claimAffinityUnlock } = await server.ssrLoadModule('/src/Affinity.ts');
  const { parseCompanionsConfig, canInvite, invite } = await server.ssrLoadModule('/src/Companions.ts');
  const { featureFlags } = await server.ssrLoadModule('/src/features.ts');
  eq(AFFINITY_ERRORS, [], '正式 affinity 索引合法');
  ok(AFFINITY, '正式 affinity 索引可用');
  eq(AFFINITY[npcId].sources, sources, '运行态加载实际三来源');
  eq(GAME_PHASE, 5, 'GAME_PHASE 不抬');
  eq(Object.keys(featureFlags()).filter(key => /OpenFlag|companionOpen|softOpenedCompanion/i.test(key)), [], '无新同行开关');
  const companionConfig = parseCompanionsConfig(companions, skills.skills);
  eq(companionConfig.errors, [], '冻结 companions/skills 解析合法');
  ok(companionConfig.config, '既有同门配置可用');
  eq(companionConfig.config.reviveMs, 30000, '既有 reviveMs 不漂');
  eq(companionConfig.config.companions[0].id, companionId, '既有 companionId 不漂');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => disk.get(key) ?? null,
    setItem: (key, value) => { writes++; disk.set(key, value); },
    removeItem: key => disk.delete(key),
  } });
  const snapshot = p => JSON.stringify(p.exportSave());
  const value = p => p.affinity[npcId] ?? AFFINITY[npcId].initial;
  const rewards = p => JSON.stringify({ exp: p.exp, stones: p.stones, inventory: p.inventory, skills: p.skills });
  const invitation = p => canInvite(companionConfig.config, AFFINITY, p, companionId).status;

  function completeChain(affinityConfig, label, afterDone) {
    const p = new Progress(), quest = new QuestSystem(p, () => 10_000_000, affinityConfig);
    eq(p.level, 1, `${label} 最低角色等级可接`);
    eq(quest.npcQuestIds(npcId), questIds, `${label} 真实 NPC 可发现全部三任务`);
    eq(invitation(p), 'need_confidant', `${label} 未完成前须知交`);
    const originalRewards = rewards(p);
    for (const [index, id] of questIds.entries()) {
      eq(questIds.map(candidate => quest.available(candidate)), questIds.map((_, i) => i === index), `${label} ${id} 链依次开放`);
      const offer = quest.talk(npcId, id);
      eq(offer.lines[0]?.text, strings[QUESTS[id].dialogueKeys.offer], `${label} ${id} 实际 offer 文案`);
      ok(offer.after, `${label} ${id} 对话提供接取`);
      offer.after();
      eq(quest.state(id), 'active', `${label} ${id} 正常接取`);
      eq(quest.complete(id), false, `${label} ${id} 接取后尚未完成 talk`);
      const beforeWrongNpc = value(p);
      quest.onTalk('village_elder');
      quest.onKill('slime');
      eq(quest.complete(id), false, `${label} ${id} 其他 NPC/击杀不推进 talk`);
      eq(value(p), beforeWrongNpc, `${label} ${id} 其他 NPC/击杀不涨好感`);
      const completion = quest.talk(npcId, id);
      eq(completion.lines[0]?.text, strings[QUESTS[id].dialogueKeys.complete], `${label} ${id} 实际 complete 文案`);
      ok(completion.after, `${label} ${id} 对话提供交付`);
      ok(completion.after()?.settled, `${label} ${id} 真实交付成功`);
      eq(quest.state(id), 'done', `${label} ${id} 成为 done`);
      eq(rewards(p), originalRewards, `${label} ${id} 无额外物品/经验/技能奖励`);
      afterDone(p, id, index);
      const after = snapshot(p), afterWrites = writes;
      eq(quest.turnIn(id), undefined, `${label} ${id} 重交拒绝`);
      eq(quest.accept(id), false, `${label} ${id} done 后不可重接`);
      eq(snapshot(p), after, `${label} ${id} 重交不改存档`);
      eq(writes, afterWrites, `${label} ${id} 重交不写盘`);
    }
    eq(questIds.map(id => quest.state(id)), ['done', 'done', 'done'], `${label} 三任务均合法 done 一次`);
    eq(value(p), 300, `${label} 三 done 达 300`);
    eq(getAffinity(AFFINITY, npcId, p).tier?.id, 'confidant', `${label} 达 confidant`);
    eq(invitation(p), 'ok', `${label} 未领 confidant_gift 即可邀请`);
    return p;
  }

  const p = completeChain(AFFINITY, '正式快照', (progress, id, index) => {
    eq(value(progress), (index + 1) * 100, `${id} 首次 done 正好 +100`);
    eq(progress.relationshipState.appliedAffinitySources, questIds.slice(0, index + 1).map(receipt), `${id} once 收据`);
    eq(progress.relationshipState.pendingAffinitySources, [], `${id} 已消费无 pending`);
    const after = snapshot(progress);
    eq(stageQuestAffinityCompletion(AFFINITY, id, progress), true, `${id} 收据重放安全`);
    eq(consumeQuestAffinitySources(AFFINITY, progress), { status: 'consumed', count: 0 }, `${id} 消费重放为零`);
    eq(snapshot(progress), after, `${id} sources once 不重复`);
    eq(invitation(progress), index === 2 ? 'ok' : 'need_confidant', `${id} 仅第三 done 达邀请档`);
    eq(JSON.parse(disk.get('xiantu_save_v1')).affinity[npcId], (index + 1) * 100, `${id} 好感落盘`);
  });
  eq(p.relationshipState.claimedAffinityRewards, [], '达知交未自动领礼');
  const unreadableGift = new Proxy(p, { get(target, key, receiver) {
    if (key === 'relationshipState' || key === 'confidant_gift') throw new Error('邀请不得读取礼物依赖');
    return Reflect.get(target, key, receiver);
  } });
  eq(invitation(unreadableGift), 'ok', 'canInvite 不读取礼物收据');
  eq(claimAffinityUnlock(AFFINITY, npcId, 'confidant_gift', p).status, 'claimed', '独立档位礼可照旧主动领取');
  eq(invitation(p), 'ok', '已领 confidant_gift 仍可邀请');
  const beforeInviteAffinity = value(p), beforeInviteInventory = JSON.stringify(p.inventory);
  eq(invite(companionConfig.config, AFFINITY, p, companionId).status, 'ok', '达到知交走既有 invite');
  eq(p.companionRelations, { [companionId]: { mode: 'follow' } }, '既有 invite 建立 follow 关系');
  eq(value(p), beforeInviteAffinity, '邀请不扣好感');
  eq(JSON.stringify(p.inventory), beforeInviteInventory, '邀请不改礼物物品');

  const closedNpcs = structuredClone(npcs);
  closedNpcs.find(npc => npc.id === npcId).affinity.enabled = false;
  const closed = parseAffinityIndex(closedNpcs);
  eq(closed.errors, [], '内存闭态夹具合法，不改正式表');
  completeChain(closed.config, 'pending 消费夹具', (progress, id, index) => {
    eq(value(progress), index * 100, `${id} 闭态 done 先不加值`);
    eq(progress.relationshipState.pendingAffinitySources, [{ sourceId: receipt(id), npc: npcId, quest: id }], `${id} 真实 done 入 pending`);
    eq(consumeQuestAffinitySources(closed.config, progress), { status: 'consumed', count: 0 }, `${id} 闭态不消费`);
    eq(consumeQuestAffinitySources(AFFINITY, progress), { status: 'consumed', count: 1 }, `${id} 登记来源消费一次`);
    eq(value(progress), (index + 1) * 100, `${id} 消费正好 +100`);
    const after = snapshot(progress);
    eq(consumeQuestAffinitySources(AFFINITY, progress), { status: 'consumed', count: 0 }, `${id} 再次消费不重复`);
    eq(snapshot(progress), after, `${id} 重复消费无副作用`);
  });

  const unrelated = new Progress();
  for (const id of bannedQuests) {
    const beforeValue = value(unrelated);
    eq(stageQuestAffinityCompletion(AFFINITY, id, unrelated), true, `${id} 不阻塞既有结算`);
    eq(value(unrelated), beforeValue, `${id} done 不给苏好感`);
    eq(applyAffinityDelta(AFFINITY, npcId, 100, unrelated, receipt(id)).reason, 'invalid_source', `${id} 伪造收据拒绝`);
  }
  unrelated.encounters = { resolved: { enc_su_probe: 'help' }, pendingHooks: [{
    attemptId: 'su-affinity-probe', encounterId: 'enc_su_probe', payload: { affinity: [{ npc: npcId, delta: 100 }] },
  }] };
  const beforeEncounter = snapshot(unrelated);
  eq(consumeEncounterAffinityHooks(AFFINITY, unrelated), { status: 'consumed', count: 0 }, '未登记 encounter 不消费苏好感');
  eq(snapshot(unrelated), beforeEncounter, 'encounter 无好感或收据副作用');
  console.log(JSON.stringify({ suite: 'companion-affinity-sources', dataMode: 'snapshot', dataRoot,
    assertions, passed: true, affinity: 300, tier: 'confidant', sources: 3, giftsEnabled: false,
    newOpenFlag: false, soft: false, release: false }));
} finally {
  if (server) await server.close();
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  for (const [file, expected] of before) eq(sha(await fs.readFile(file)), expected, `自测不得改动 ${file}`);
}
console.log(`companion-affinity-sources tests ok: ${assertions} assertions; snapshot 正式接线；shared/snapshot companions/skills SHA 冻结；≠开态≠soft≠release`);
