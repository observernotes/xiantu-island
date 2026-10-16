// 双数据根加载真实关态 API / 任务 / 地图交互；只在内存注入旧档和伪开任务。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const introId = 'q_secret_nest_intro';
const closedStrings = {
  'secret.closed.feature': '万妖巢穴尚未开放。',
  'secret.closed.entrance': '石门尚未开放，可查看说明，暂不可进入。',
  'secret.closed.sign_readable': '路牌可反复阅读，仅作说明，不推进任务。',
  'secret.closed.quest_offer': '万妖巢穴引导尚未开放，暂不可接取。',
  'secret.closed.quest_progress': '引导尚未开放，暂不可推进或交付。',
  'secret.closed.no_enter': '秘境尚未开放，暂不可进入。',
  'secret.closed.no_start': '秘境尚未开放，暂不可开局或抽取房间。',
  'secret.closed.no_reward': '秘境尚未开放，机缘与各类收益暂不可领取。',
};
// design/21 要求既有八句一字不动，关态不得消费这些开态说明。
const introStrings = {
  'secret.quest.intro.name': '林下秘门',
  'secret.quest.intro.offer': '营地旁的石门开了，先去读读路牌。',
  'secret.quest.intro.sign_a': '门后房间次次不同，机缘离境即散。',
  'secret.quest.intro.sign_b': '倒下不扣修为，已获物资只能带回一半。',
  'secret.quest.intro.sign_c': '每日前三次入境有加成，途中退出也计次。',
  'secret.quest.intro.progress': '先看看石门路牌，回来我再指路。',
  'secret.quest.intro.complete': '路已记下。准备妥当，就去门前启程吧。',
  'secret.quest.intro.description': '听雷猎户说石门已开，先去读路牌。',
};
const originalIntro = {
  id: introId, name: '林下秘门', nameKey: 'secret.quest.intro.name',
  descriptionKey: 'secret.quest.intro.description', phase: 6, enabled: false,
  giver: 'hunter_lei', turnIn: 'hunter_lei', reqLevel: 30, reqRealm: 'foundation', prereq: 'q_main_04',
  objectives: [{ type: 'reach', map: 'wanyao_outer_1', target: 'secret_nest_sign' }], rewards: {}, next: null,
  dialogueKeys: { offer: 'secret.quest.intro.offer', progress: 'secret.quest.intro.progress', complete: 'secret.quest.intro.complete' },
  balanceTodo: [], note: 'next:null 表示无后续链，不是待填数值；地图对象和入口消费者接好后再落表。',
};
const apiTips = {
  featureClosed: 'secret.closed.feature', readSignClosed: 'secret.closed.sign_readable',
  interactEntranceClosed: 'secret.closed.entrance', refuseQuestOffer: 'secret.closed.quest_offer',
  refuseQuestProgress: 'secret.closed.quest_progress', refuseEnter: 'secret.closed.no_enter',
  refuseStart: 'secret.closed.no_start', refuseReward: 'secret.closed.no_reward',
};
const objectNames = ['secret_nest_sign', 'secret_nest_entrance', 'secret_nest_return'];
const before = new Map(), staticData = new Map(), sharedBytes = new Map();
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const shaOrNull = async file => {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const clone = value => JSON.parse(JSON.stringify(value));

async function protectTables() {
  // 全部正式 balance 表连同 features 和目标地图均做前后 SHA 守护。
  // secret_rooms 可被并行工位更新，故不要求它跨数据根同字节；测试本身仍不得写它。
  for (const [, dataRoot] of modes) {
    const names = await fs.readdir(path.join(dataRoot, 'balance'));
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const file = path.join(dataRoot, 'balance', name);
      before.set(file, await shaOrNull(file));
    }
    for (const name of ['features.json', 'maps/wanyao_outer_1.json']) {
      const file = path.join(dataRoot, name);
      before.set(file, await shaOrNull(file));
    }
  }
}

async function checkFormal(mode, dataRoot) {
  const data = {};
  for (const name of ['balance/quests.json', 'balance/strings_zh.json', 'maps/wanyao_outer_1.json']) {
    const bytes = await fs.readFile(path.join(dataRoot, name));
    if (mode === 'shared') sharedBytes.set(name, bytes);
    else {
      eq(bytes.equals(sharedBytes.get(name)), true, `${name}: 共享/快照同字节`);
      eq(hash(bytes), hash(sharedBytes.get(name)), `${name}: 共享/快照 SHA 一致`);
    }
    data[name] = JSON.parse(bytes.toString('utf8'));
  }
  const quests = data['balance/quests.json'], strings = data['balance/strings_zh.json'];
  const intros = quests.filter(q => q.id === introId);
  eq(intros.length, 1, `${mode}: 只有一条既有秘境引导`);
  eq(intros[0], originalIntro, `${mode}: intro 关态和全部既有字段不变`);
  for (const [key, text] of Object.entries({ ...closedStrings, ...introStrings })) {
    eq(strings[key], text, `${mode}: ${key} 原文`);
    if (key.startsWith('secret.closed.')) ok(Array.from(text).length <= 40, `${mode}: ${key} ≤40字`);
  }
  const map = data['maps/wanyao_outer_1.json'];
  const objects = map.layers.filter(layer => layer.type === 'objectgroup' && layer.name === 'objects').flatMap(layer => layer.objects);
  for (const name of objectNames) {
    const matches = objects.filter(object => object.name === name);
    eq(matches.length, 1, `${mode}: 地图唯一对象 ${name}`);
    ok(matches[0].type !== 'portal', `${mode}: ${name} 不伪造传送门`);
    ok(!(matches[0].properties ?? []).some(prop => prop.name === 'target'), `${mode}: ${name} 无地图传送目标`);
  }
  ok(map.nextobjectid > Math.max(...objects.map(object => object.id)), `${mode}: nextobjectid 正确`);
  eq(new Set(objects.map(object => object.id)).size, objects.length, `${mode}: 对象 ID 不重复`);
  const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
  let gifts = 0;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { eq(child?.enabled, false, `${mode}: gifts 仍关`); gifts++; }
      visit(child);
    }
  };
  visit(npcs);
  ok(gifts > 0, `${mode}: 实际核查 gifts 配置`);
  staticData.set(mode, data);
  console.log(JSON.stringify({ suite: 'v06c-closed-formal', dataMode: mode, introEnabled: false, giftsEnabled: false,
    questsSha: hash(sharedBytes.get('balance/quests.json')), stringsSha: hash(sharedBytes.get('balance/strings_zh.json')),
    mapSha: hash(sharedBytes.get('maps/wanyao_outer_1.json')) }));
}

async function runGraph(mode, dataRoot) {
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06c-closed-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0v06c-phaser'; },
      load(id) {
        if (id !== '\0v06c-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
            Linear: (from, to, amount) => from + (to - from) * amount } };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  let storageWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { storageWrites++; saved.set(key, String(value)); },
    removeItem: key => { storageWrites++; saved.delete(key); }, clear: () => { storageWrites++; saved.clear(); },
    key: index => [...saved.keys()][index] ?? null, get length() { return saved.size; },
  } });
  try {
    const api = await server.ssrLoadModule('/src/SecretNestClosed.ts');
    const { QUESTS, QUEST_ORDER, NPCS } = await server.ssrLoadModule('/src/data.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
    const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
    const features = await server.ssrLoadModule('/src/features.ts');
    const { gameNow } = await server.ssrLoadModule('/src/GameClock.ts');
    const flagsBefore = clone(features.featureFlags());
    const runtimeBefore = QUESTS[introId], orderBefore = [...QUEST_ORDER], npcBefore = [...NPCS.hunter_lei.quests];
    eq(api.SECRET_NEST_INTRO_ID, introId, `${mode}: 正式关态对象 ID`);
    eq(api.isSecretNestIntroEnabled(), false, `${mode}: 正式 enabled:false 明确关闭`);
    const phaseFilteredOut = !QUESTS[introId];
    const sourceIntro = staticData.get(mode)['balance/quests.json'].find(q => q.id === introId);
    let fixtures = 0;

    async function exercise(p, qs, label) {
      const beforeState = clone(p), beforeSave = p.exportSave(), writesBefore = storageWrites;
      const tips = [];
      const unsubscribe = qs.onBlocked(tip => tips.push(tip));
      const checkBlocked = (fn, expected, key, operation) => {
        tips.length = 0;
        eq(fn(), expected, `${label}: ${operation} 拒绝`);
        eq(tips.at(-1)?.tipKey, key, `${label}: ${operation} 正确 tipKey`);
        eq(tips.at(-1)?.text, closedStrings[key], `${label}: ${operation} 使用正式关态文案`);
      };
      try {
        for (let repeat = 0; repeat < 3; repeat++) {
          for (const [name, key] of Object.entries(apiTips)) {
            eq(api[name](), { allowed: false, tipKey: key, text: closedStrings[key] }, `${label}: ${name} 可重复只读`);
          }
          eq(api.isSecretNestIntroEnabled(), false, `${label}: 资格/旧档/伪开 QUESTS 不能覆盖正式关态`);
          eq(qs.available(introId), false, `${label}: 不可 available`);
          eq(qs.levelLocked(introId), false, `${label}: 关态优先于等级锁`);
          eq(qs.isActive(introId), false, `${label}: 旧档 active 不可执行`);
          ok(!qs.activeIds.includes(introId), `${label}: 不列入运行中任务`);
          ok(!qs.npcQuestIds('hunter_lei').includes(introId), `${label}: 不列入雷猎户可执行任务`);
          eq(qs.complete(introId), false, `${label}: 不可 complete`);
          checkBlocked(() => qs.accept(introId), false, 'secret.closed.quest_offer', 'accept');
          for (const force of [false, true]) {
            checkBlocked(() => qs.turnIn(introId, force), undefined, 'secret.closed.quest_progress', `turnIn force=${force}`);
            tips.length = 0;
            eq(await qs.turnInAsync(introId, force), undefined, `${label}: async turnIn 拒绝`);
            eq(tips.at(-1)?.tipKey, 'secret.closed.quest_progress', `${label}: async turnIn 提示`);
          }
          tips.length = 0;
          qs.onReach('secret_nest_sign');
          if (p.quests[introId]?.state === 'active') {
            eq(tips.at(-1)?.tipKey, 'secret.closed.quest_progress', `${label}: 旧档 reach 仍提示拒绝推进`);
          }
          qs.onTalk('hunter_lei');
          qs.onKill('巢心妖影');
          const key = p.quests[introId] ? 'secret.closed.quest_progress' : 'secret.closed.quest_offer';
          for (const async of [false, true]) {
            const result = async ? qs.talk('hunter_lei', introId, { async: true }) : qs.talk('hunter_lei', introId);
            eq(result.lines, [{ speaker: NPCS.hunter_lei.name, text: closedStrings[key] }], `${label}: 显式引导对话只显示关态说明`);
            eq(result.after, undefined, `${label}: 关态对话无可执行回调`);
            eq(result.blockedTip?.tipKey, key, `${label}: 对话附正确关态 tipKey`);
          }
          const normalTalk = qs.talk('hunter_lei');
          eq(normalTalk.blockedTip?.tipKey, key, `${label}: 普通雷猎户对话附关态说明，不占用正常主线对白`);
          ok(!normalTalk.lines.some(line => Object.values(introStrings).includes(line.text)), `${label}: 不消费 intro 开态原句`);

          const objects = objectNames.map((name, index) => ({ name, type: repeat === 1 ? 'portal' : index === 2 ? 'spawn' : 'sign',
            x: 320 + index * 80, y: 832, w: 0, h: 0,
            props: repeat === 1 ? { target: 'field_test', reqLevel: 1, unlockQuest: introId } : {} }));
          const logs = [], dialogs = [], callbacks = [], transitions = [];
          const scene = Object.assign(Object.create(GameScene.prototype), {
            travelling: false, prog: p, quests: qs, map: { id: 'wanyao_outer_1', objects },
            player: { x: 320, y: 832, body: { setVelocityX() {} } },
            log: text => logs.push(text), dialog: { show: (lines, _speaker, after) => { dialogs.push(lines); callbacks.push(after); } },
            closeItemPanels() {},
            scene: { restart: args => transitions.push(args) },
            travelToMap: (...args) => transitions.push(args),
            encounterRuntime: { interact: () => { throw new Error('秘境关态应优先于其它交互'); } },
          });
          for (const [index, name] of objectNames.slice(0, 2).entries()) {
            scene.player.x = objects[index].x;
            eq(scene.tryInteract(), true, `${label}: ${name} 真实 GameScene.tryInteract 可交互`);
            const tipKey = index === 0 ? 'secret.closed.sign_readable' : 'secret.closed.entrance';
            eq(logs.at(-1), closedStrings[tipKey], `${label}: ${name} 日志为关态说明`);
            eq(dialogs.at(-1), [{ speaker: null, text: closedStrings[tipKey] }], `${label}: ${name} 说明可展示`);
          }
          scene.player.x = objects[2].x;
          eq(scene.tryInteractSecretNest(), false, `${label}: return 占位落点不抢 NPC 交互`);
          scene.showSecretNestClosed('secret_nest_return');
          eq(logs.at(-1), closedStrings['secret.closed.feature'], `${label}: 失效 return 仅给未开放说明`);
          scene.talkTo('hunter_lei', introId);
          eq(logs.at(-1), closedStrings[key], `${label}: 真实 GameScene.talkTo 显式引导关态提示`);
          eq(dialogs.at(-1), [{ speaker: NPCS.hunter_lei.name, text: closedStrings[key] }], `${label}: 显式引导对白无开态文案`);
          eq(callbacks.at(-1), undefined, `${label}: 显式关态对白无结束后回调`);
          if (p.quests.q_main_06?.state === 'done') {
            scene.sectTrialOfferFor = () => undefined;
            scene.trialOfferFor = () => null;
            scene.sectGrowth = { services: () => [], ordinaryCatalog: () => ({ ok: false }),
              ordinarySellCatalog: () => ({ ok: false }), recipeCatalog: () => ({ ok: false }) };
            scene.talkTo('hunter_lei');
            eq(dialogs.at(-1), [{ speaker: NPCS.hunter_lei.name, text: closedStrings[key] }], `${label}: 雷猎户闲聊展示关态说明`);
            eq(callbacks.at(-1), undefined, `${label}: 纯关态闲聊结束不保存或发奖`);
          }
          eq(transitions, [], `${label}: 不传送、不重启或建局`);
          eq(clone(p), beforeState, `${label}: 完整 Progress / 任务 / 资产 / boon / 日奖状态零变化`);
          eq(p.exportSave(), beforeSave, `${label}: 序列化存档零变化`);
          eq(storageWrites, writesBefore, `${label}: 不写存档`);
        }
      } finally { unsubscribe(); }
      fixtures++;
    }

    function verifyRenderedInteractions() {
      const rawMap = staticData.get(mode)['maps/wanyao_outer_1.json'];
      const mapObjects = rawMap.layers.filter(layer => layer.type === 'objectgroup' && layer.name === 'objects')
        .flatMap(layer => layer.objects).map(object => ({ ...object, w: object.width, h: object.height,
          props: Object.fromEntries((object.properties ?? []).map(property => [property.name, property.value])) }));
      const noTip = () => { throw new Error('return 占位不应吞掉营地 NPC 的对话按键'); };
      const camp = Object.assign(Object.create(GameScene.prototype), {
        map: { id: 'wanyao_outer_1', objects: mapObjects }, player: { x: 490, y: 832 }, log: noTip, dialog: { show: noTip },
      });
      eq(camp.tryInteractSecretNest(), false, `${mode}: 实际地图 x490 靠近 return 时不抢猎户对话`);
      for (const withArt of [false, true]) {
        const p = new Progress(), beforeState = clone(p), beforeSave = p.exportSave();
        const visuals = [], logs = [], dialogs = [], callbacks = [];
        function display(kind, text) {
          const events = new Map(), data = new Map();
          const item = { kind, text, width: 40, events, anims: { stop() {} },
            texture: { has: () => true, firstFrame: 'first' },
            setOrigin() { return this; }, setDepth() { return this; }, setStrokeStyle() { return this; },
            setInteractive() { this.interactive = true; return this; },
            setVisible() { return this; }, setPosition() { return this; }, add() { return this; },
            setName(name) { this.name = name; return this; },
            on(event, callback) { events.set(event, callback); return this; }, off() { return this; },
            getData(key) { return data.get(key); }, setData(key, value) { data.set(key, value); return this; },
            setFrame(frame) { this.frame = frame; return this; },
          };
          visuals.push(item); return item;
        }
        const scene = Object.assign(Object.create(GameScene.prototype), {
          prog: p, player: { dead: false, body: { setVelocityX() {} } }, travelling: false,
          textures: { exists: key => withArt && key === 'prop_secret_door' },
          cache: { json: { get: () => undefined } }, anims: { exists: () => false }, interactionPrompts: [],
          add: { sprite: () => display('sprite'), rectangle: () => display('rectangle'), container: () => display('container'),
            text: (_x, _y, text) => display('text', text) },
          log: text => logs.push(text), dialog: { open: false,
            show: (lines, _speaker, after) => { dialogs.push(lines); callbacks.push(after); } },
        });
        for (const name of objectNames.slice(0, 2)) {
          const object = mapObjects.find(object => object.name === name);
          scene.drawObject(object);
          const visual = visuals.find(visual => visual.name === name);
          ok(visual?.interactive, `${mode}/art=${withArt}: ${name} 可点击`);
          eq(typeof visual.events.get('pointerdown'), 'function', `${mode}/art=${withArt}: ${name} 点击已接线`);
          ok(scene.interactionPrompts.some(prompt => prompt.object === object), `${mode}/art=${withArt}: ${name} 有键盘说明提示`);
          if (name === 'secret_nest_entrance' && withArt) {
            eq(visual.getData('propAnimation'), 'prop_secret_door_closed', `${mode}: 石门始终显示关闭态`);
          }
          for (let repeat = 0; repeat < 2; repeat++) {
            visual.events.get('pointerdown')();
            const key = name === 'secret_nest_sign' ? 'secret.closed.sign_readable' : 'secret.closed.entrance';
            eq(logs.at(-1), closedStrings[key], `${mode}: ${name} 点击重复显示关态日志`);
            eq(dialogs.at(-1), [{ speaker: null, text: closedStrings[key] }], `${mode}: ${name} 点击重复显示说明`);
            eq(callbacks.at(-1), undefined, `${mode}: ${name} 点击不留下开局/领奖回调`);
          }
        }
        ok(visuals.some(visual => visual.text === closedStrings['secret.closed.feature']), `${mode}: 地图入口可见未开放说明`);
        eq(clone(p), beforeState, `${mode}: 绘制及点击完整状态零变化`);
        eq(p.exportSave(), beforeSave, `${mode}: 绘制及点击序列化状态零变化`);
      }
    }

    try {
      verifyRenderedInteractions();
      // 先测实际 phase 过滤表；再注入 enabled:true + phase:5，证明不是借“不在 QUESTS”拒绝。
      for (const inject of [false, true]) {
        if (inject) {
          QUESTS[introId] = { ...clone(sourceIntro), enabled: true, phase: 5 };
          if (!QUEST_ORDER.includes(introId)) QUEST_ORDER.push(introId);
          if (!NPCS.hunter_lei.quests.includes(introId)) NPCS.hunter_lei.quests.push(introId);
        }
        for (const qualified of [false, true]) for (const main06Done of [false, true]) {
          for (const legacyState of ['none', 'active', 'reached', 'done']) {
            const p = new Progress();
            p.level = qualified ? 30 : 1; p.exp = 7; p.stones = 1234;
            p.inventory = { hp_pill: 3, pillar_shard_2: 1 };
            if (qualified) p.quests.q_main_04 = { state: 'done', kills: {} };
            p.quests.q_main_06 = { state: main06Done ? 'done' : 'active', kills: { millennium_tree_demon: 0 } };
            if (legacyState !== 'none') p.quests[introId] = {
              state: legacyState === 'done' ? 'done' : 'active', kills: {}, crafted: {}, reached: legacyState === 'reached' || legacyState === 'done',
            };
            p.position = { mapId: 'wanyao_outer_1', x: 320, y: 832 };
            const qs = new QuestSystem(p, () => gameNow());
            p.sectDailyContributionClaims = ['closed-existing-claim'];
            p.dailyQuestCompletions = { tianjian: ['closed-existing-claim'] };
            p.buffs = [{ id: 'closed-existing-boon', stat: 'attack', value: 2, until: 9999999999999 }];
            // 保存、事务和发收益若被触发立即失败，避免“写了又还原”被状态快照掩盖。
            for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync', 'settleQuestRewards', 'gainExp', 'addItem']) {
              p[method] = () => { throw new Error(`${mode}: 关态禁止调用 ${method}`); };
            }
            const label = `${mode}/inject=${inject}/qualified=${qualified}/main06=${main06Done}/${legacyState}`;
            await exercise(p, qs, label);
          }
        }
      }
      // 使用真实存读档恢复 done 旧档，再重试入口、路牌和任务；存读本身在请求快照之前完成。
      const indexedBefore = features.featureEnabled('indexedDbSaves');
      features.setFeatureFlag('indexedDbSaves', false);
      try {
        const p = new Progress(); p.level = 30; p.stones = 2345; p.inventory = { hp_pill: 2 };
        p.quests.q_main_04 = { state: 'done', kills: {} };
        p.quests[introId] = { state: 'done', kills: {}, reached: true };
        ok(p.save(), `${mode}: 内存存储夹具真实保存`);
        const restored = Progress.load();
        eq(restored.quests[introId]?.state, 'done', `${mode}: 真实读档保留旧 done`);
        await exercise(restored, new QuestSystem(restored, () => gameNow()), `${mode}/save-reload/done`);
      } finally { features.setFeatureFlag('indexedDbSaves', indexedBefore); }
    } finally {
      if (runtimeBefore) QUESTS[introId] = runtimeBefore; else delete QUESTS[introId];
      QUEST_ORDER.splice(0, QUEST_ORDER.length, ...orderBefore);
      NPCS.hunter_lei.quests.splice(0, NPCS.hunter_lei.quests.length, ...npcBefore);
    }
    eq(features.featureFlags(), flagsBefore, `${mode}: 内存 feature 夹具已恢复`);
    eq(api.isSecretNestIntroEnabled(), false, `${mode}: 测试结束正式 intro 仍关`);
    console.log(JSON.stringify({ suite: 'v06c-closed-runtime', dataMode: mode, passed: true, fixtures,
      phaseFilteredOut, runtimeEnabledFixtureRejected: true, saveReloadChecked: true, assertions }));
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
    await server.close();
  }
}

try {
  await protectTables();
  for (const [mode, dataRoot] of modes) await checkFormal(mode, dataRoot);
  for (const [mode, dataRoot] of modes) await runGraph(mode, dataRoot);
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `关态测试前后不得写表/地图/features: ${file}`);
}
console.log(`v06c closed tests ok: ${assertions} assertions; shared/snapshot 同字节；intro/gifts 仍关；交互可重读、任务/场景/资产零变化；全部保护表前后 SHA 不变`);
