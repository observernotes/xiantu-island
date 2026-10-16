// 正式旗已软开；双数据根关态只替换 Vite SSR 内存模块，仅在 qa/out_v06d_closed 留证，不保存正式表。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), gameData = path.join(shared, 'game/data');
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const out = path.join(root, 'qa/out_v06d_closed');
const closedStrings = {
  'tower.closed.feature': '锁妖塔尚未开放。',
  'tower.closed.entrance': '锁妖塔入口暂不可用，可查看说明。',
  'tower.closed.no_climb': '锁妖塔尚未开放，暂不可开爬。',
  'tower.closed.no_floor': '锁妖塔尚未开放，暂不可进入楼层。',
  'tower.closed.no_reward': '锁妖塔尚未开放，首通奖励暂不可领取。',
  'tower.closed.no_title': '锁妖塔尚未开放，称号暂不可解锁。',
  'tower.closed.exit_or_save': '锁妖塔尚未开放，退出与存档不推进爬塔。',
  'tower.closed.load_refresh': '锁妖塔仍未开放，读档后不可开爬或领奖。',
};
const marketClosedStrings = {
  'market.closed.feature': '坊市寄售尚未开放。',
  'market.closed.list': '坊市寄售尚未开放，暂不可上架。',
  'market.closed.withdraw': '坊市寄售尚未开放，暂不可撤回。',
  'market.closed.claim': '坊市寄售尚未开放，暂不可领取。',
  'market.closed.no_deal': '坊市寄售尚未开放，不成交、不写收益收据。',
  'market.closed.no_reward': '坊市寄售尚未开放，寄售收益暂不可领取。',
  'market.closed.load_refresh': '读档或刷新后仍未开放，寄售操作暂不可用。',
  'market.closed.slot_or_item': '坊市寄售尚未开放，栏位或物品异常，暂不可操作。',
};
const forgeClosedStrings = {
  'forge.closed.feature': '炼器打造尚未开放。',
  'forge.closed.entrance': '欧冶匠暂不提供打造，可查看说明。',
  'forge.closed.craft': '炼器打造尚未开放，暂不可打造。',
  'forge.closed.no_submit': '炼器打造尚未开放，暂不可提交图纸或材料。',
  'forge.closed.no_result': '炼器打造尚未开放，不产出成品。',
  'forge.closed.no_grade': '炼器打造尚未开放，不展示或结算品质档。',
  'forge.closed.load_refresh': '读档或刷新后炼器仍未开放，暂不可打造。',
  'forge.closed.later_service': '强化、附灵与分解等后续服务尚未开放。',
};
const apiTips = {
  featureClosed: 'tower.closed.feature', interactEntranceClosed: 'tower.closed.entrance',
  refuseClimb: 'tower.closed.no_climb', refuseFloor: 'tower.closed.no_floor',
  refuseReward: 'tower.closed.no_reward', refuseTitle: 'tower.closed.no_title',
  refuseExitOrSaveClimbAdvance: 'tower.closed.exit_or_save', refuseLoadRefresh: 'tower.closed.load_refresh',
};
const expectedSha = {
  'balance/tower_floors.json': '735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6',
  'balance/titles.json': 'd765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c',
  'balance/npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'balance/quests.json': 'c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b',
  'balance/strings_zh.json': 'fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967',
};
const marketStringsSha = 'c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27';
const towerStringsSha = '6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f';
const originalStringsSha = '4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385';
const originalStringsSemanticSha = '81d364627ea128a3125c1def299f1d94804cee7b7e511ff417dd4bf9ff24c7a9';
const originalMapSemanticSha = '70f71037b6ed1b4736255a7c5cbbbf16f871ee0aba9ac6f95dfbd5c099768a79';
const featureSha = '69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8';
const titleIds = [10, 20, 30].map(floor => `title_tower_${floor}`);
const before = new Map(), dataByMode = new Map(), sharedBytes = new Map(), evidence = [];
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const shaOrNull = async file => {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const mapObjects = map => map.layers.filter(layer => layer.type === 'objectgroup' && layer.name === 'objects')
  .flatMap(layer => layer.objects);
const runtimeObjects = map => mapObjects(map).map(object => ({ ...object, w: object.width, h: object.height,
  props: Object.fromEntries((object.properties ?? []).map(property => [property.name, property.value])) }));
const report = row => { evidence.push(row); console.log(JSON.stringify(row)); };

async function protectTables() {
  // 全 balance 覆盖 secret_*、quests intro、gifts 等禁改表；每根分别守护既有字节。
  for (const [, dataRoot] of modes) {
    const names = await fs.readdir(path.join(dataRoot, 'balance'));
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const file = path.join(dataRoot, 'balance', name);
      before.set(file, await shaOrNull(file));
    }
    for (const name of ['features.json', 'maps/youying_tower.json']) {
      const file = path.join(dataRoot, name);
      before.set(file, await shaOrNull(file));
    }
  }
  for (const file of [path.join(root, 'src/features.ts'), path.join(root, 'src/data.ts'), path.join(root, 'src/TowerOpenFlag.ts'),
    ...['balance/strings_zh.json', 'balance/tower_floors.json', 'balance/titles.json', 'balance/npcs.json',
      'features.json', 'maps/youying_tower.json'].map(name => path.join(gameData, name))]) {
    before.set(file, await shaOrNull(file));
  }
}

async function checkFormal(mode, dataRoot) {
  const data = {};
  for (const [name, expected] of Object.entries(expectedSha)) {
    const bytes = await fs.readFile(path.join(dataRoot, name));
    eq(hash(bytes), expected, `${mode}: ${name} 固定 SHA`);
    if (mode === 'shared') sharedBytes.set(name, bytes);
    else eq(bytes.equals(sharedBytes.get(name)), true, `${mode}: ${name} 与共享同字节`);
    data[name] = JSON.parse(bytes.toString('utf8'));
  }
  const strings = data['balance/strings_zh.json'];
  const entries = Object.entries(strings);
  eq(entries.length, 928, `${mode}/C10: 只有原 904 与 tower、market、forge 各八键`);
  eq(entries.slice(904, 912), Object.entries(closedStrings), `${mode}/C10: tower 八键顺序及文案逐字相等`);
  eq(entries.slice(912, 920), Object.entries(marketClosedStrings), `${mode}/C10: market 八键区间及文案逐字相等`);
  eq(entries.slice(920), Object.entries(forgeClosedStrings), `${mode}/C10: forge 八键只追加在末尾，文案逐字相等`);
  eq(hash(JSON.stringify(entries.slice(0, 904))), originalStringsSemanticSha, `${mode}/C10: 原 904 键语义不变`);
  // 依次还原 forge、market、tower 末项逗号与新增八行，证明原 904 项每个字节都未改。
  const rawStrings = sharedBytes.get('balance/strings_zh.json').toString('utf8');
  const marketBytes = rawStrings.replace(/,\n(?: {2}"forge\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(marketBytes), marketStringsSha, `${mode}/C10: 删除 forge 八行即还原原 920 项完整文件 SHA`);
  const towerBytes = marketBytes.replace(/,\n(?: {2}"market\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(towerBytes), towerStringsSha, `${mode}/C10: 删除 forge、market 十六行即还原原 912 项完整文件 SHA`);
  const originalBytes = towerBytes.replace(/,\n(?: {2}"tower\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(originalBytes), originalStringsSha, `${mode}/C10: 删除 forge、market、tower 二十四行即还原原 904 项完整文件 SHA`);
  for (const [key, text] of Object.entries(closedStrings)) {
    eq(strings[key], text, `${mode}: ${key} 正式文案`);
    ok(Array.from(text).length <= 40, `${mode}: ${key} 不超过 40 字`);
  }
  eq(strings['ferry.route_youying_tower'], '前往幽影楼', `${mode}/C02: 既有渡口 label 原文不变`);
  const tower = data['balance/tower_floors.json'], titles = data['balance/titles.json'];
  eq(tower.meta.floorCount, 30, `${mode}/C10: 只读楼层数 30`);
  eq(tower.floors.map(floor => floor.floor), Array.from({ length: 30 }, (_, index) => index + 1), `${mode}/C10: 层号连续且唯一`);
  eq(tower.meta.firstClearOnly, true, `${mode}: 首通一次契约只读`);
  eq(tower.meta.startFromRule, { expression: 'max(1, highestClearedFloor - 10)', minFloor: 1, highestClearedFloorMinus: 10 }, `${mode}: 每日起层规则只读`);
  eq([tower.meta.roomRule.respawn, tower.meta.roomRule.advanceWhen], [false, 'allMobsClearedIncludingSplitChildren'], `${mode}/C09: 怪物复活与分裂清层契约只读`);
  eq(titles.map(title => title.id), titleIds, `${mode}/C10: 三条正式称号仍在`);
  for (const [index, title] of titles.entries()) {
    const floor = [10, 20, 30][index];
    eq([title.name, title.desc], [strings[`title.tower_${floor}.name`], strings[`title.tower_${floor}.desc`]], `${mode}: 只读称号沿用既有字符串`);
    eq(tower.floors[floor - 1].firstClearRewards.titles.map(item => item.id), [title.id], `${mode}: 楼层只读引用正式称号 id`);
  }
  const npcs = data['balance/npcs.json'];
  const route = npcs.find(npc => npc.id === 'ferry_master').ferryRoutes.find(item => item.id === 'youying_tower');
  eq(route, { id: 'youying_tower', label: 'ferry.route_youying_tower', targetMap: 'youying_tower', targetPortal: null, cost: 0 }, `${mode}/C02: 航线仍免费抵达幽影楼山门`);
  let gifts = 0;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { eq(child?.enabled, false, `${mode}/C10: gifts 全 false`); gifts++; }
      visit(child);
    }
  };
  visit(npcs);
  eq(gifts, 10, `${mode}/C10: 实际核查全部 10 处 gifts`);
  const bytes = await fs.readFile(path.join(dataRoot, 'maps/youying_tower.json'));
  if (mode === 'shared') sharedBytes.set('maps/youying_tower.json', bytes);
  else eq(bytes.equals(sharedBytes.get('maps/youying_tower.json')), true, `${mode}: 山门地图与共享同字节`);
  const map = JSON.parse(bytes.toString('utf8')), objects = mapObjects(map);
  const entrances = objects.filter(object => object.name === 'tower_climb_entrance');
  eq(entrances.length, 1, `${mode}/C02: 唯一爬塔说明入口`);
  const entrance = entrances[0];
  eq(entrance.type, 'tower_climb', `${mode}: 爬塔说明对象不伪装传送门或渡口`);
  ok(!(entrance.properties ?? []).some(property => ['target', 'targetMap', 'targetPortal'].includes(property.name)), `${mode}: 关态入口没有楼层传送目标`);
  eq(new Set(objects.map(object => object.id)).size, objects.length, `${mode}: 对象 id 不重复`);
  ok(map.nextobjectid > Math.max(...objects.map(object => object.id)), `${mode}: nextobjectid 有效`);
  for (const object of objects.filter(object => ['npc', 'ferry', 'rope', 'ladder', 'playerStart'].includes(object.type))) {
    const nearX = object.type === 'ferry' ? entrance.x >= object.x - 28 && entrance.x <= object.x + object.width + 28
      : Math.abs(entrance.x - object.x) <= Math.max(40, object.width ?? 0);
    ok(!nearX || Math.abs(entrance.y - object.y) > Math.max(48, object.height ?? 0), `${mode}: 入口避开既有 ${object.name}`);
  }
  const originalMap = clone(map);
  for (const layer of originalMap.layers) if (layer.objects) layer.objects = layer.objects.filter(object => object.name !== 'tower_climb_entrance');
  originalMap.nextobjectid = 11;
  eq(hash(JSON.stringify(originalMap)), originalMapSemanticSha, `${mode}: 只新增说明对象，既有山门对象与地形不变`);
  data['maps/youying_tower.json'] = map;
  dataByMode.set(mode, data);
  report({ suite: 'v06d-closed-static', dataMode: mode, formalOpen: true, closedFixtureOnly: true,
    softOpened: true, released: false, passed: true, strings: entries.length, giftsEnabled: false,
    floorCount: 30, towerSha: expectedSha['balance/tower_floors.json'], titlesSha: expectedSha['balance/titles.json'],
    stringsSha: expectedSha['balance/strings_zh.json'], npcsSha: expectedSha['balance/npcs.json'], mapSha: hash(bytes) });
}

function displayFactory(visuals) {
  return (kind, text) => {
    const events = new Map(), data = new Map();
    const visual = { kind, text, width: 40, events,
      setOrigin() { return this; }, setDepth() { return this; }, setStrokeStyle() { return this; },
      setInteractive() { this.interactive = true; return this; }, setVisible() { return this; },
      setPosition() { return this; }, setScrollFactor() { return this; }, add() { return this; },
      setName(name) { this.name = name; return this; }, on(event, callback) { events.set(event, callback); return this; },
      getData(key) { return data.get(key); }, setData(key, value) { data.set(key, value); return this; },
    };
    visuals.push(visual); return visual;
  };
}

async function runGraph(mode, dataRoot, closedFixtureOnly, refreshPayload = null) {
  const flagId = '\0v06d-memory-tower-flag';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06d-closed-memory-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0v06d-phaser';
        if (closedFixtureOnly && /(?:^|\/)TowerOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) return 'export function isTowerOpenForFixture() { return false; }';
        if (id !== '\0v06d-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Linear: (from, to, amount) => from + (to - from) * amount } };`;
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
    const flag = await server.ssrLoadModule('/src/TowerOpenFlag.ts');
    eq(flag.isTowerOpenForFixture(), !closedFixtureOnly, `${mode}: 正式旗 true；关态仅 SSR 内存注入 false`);
    if (!closedFixtureOnly) {
      report({ suite: 'v06d-closed-formal-graph', dataMode: mode, graph: 'formal-open',
        formalOpen: true, softOpened: true, released: false, passed: true, assertions });
      return;
    }
    const api = await server.ssrLoadModule('/src/TowerClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
    const data = await server.ssrLoadModule('/src/data.ts');
    const features = await server.ssrLoadModule('/src/features.ts');
    const { ferryLockedReason, sectEntryMap } = await server.ssrLoadModule('/src/Ferry.ts');
    const flagsBefore = clone(features.featureFlags());
    // 正式 GameScene 在构图和 travelToMap 前都按既有开关同步山门注册。
    data.syncTalismanMapAvailability();
    eq(data.GAME_PHASE, 5, `${mode}: GAME_PHASE 保持 5`);
    eq(features.featureEnabled('indexedDbSaves'), true, `${mode}: 正式 IDB 开关不改`);
    ok(!Object.keys(flagsBefore).some(key => /tower/i.test(key)), `${mode}: 不臆造塔开放开关`);
    const objects = runtimeObjects(dataByMode.get(mode)['maps/youying_tower.json']);
    const entrance = objects.find(object => object.name === 'tower_climb_entrance');
    const entranceLines = ['tower.closed.entrance', 'tower.closed.feature'].map(key => ({ speaker: null, text: closedStrings[key] }));
    let fixtures = 0;

    function exercise(p, label) {
      // 所有真正保存、事务、收益入口若被调用立即失败，禁止“写后还原”掩盖副作用。
      for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
        'settleQuestRewards', 'gainExp', 'addItem', 'removeItem', 'grantSkill', 'grantRecipe']) {
        Object.defineProperty(p, method, { configurable: true, value: () => { throw new Error(`${label}: 关态禁止调用 ${method}`); } });
      }
      // 直接播种模拟存档槽作对照，不调用游戏保存；拒绝后应保留已有完整原文。
      saved.set('v06d-existing-slot', JSON.stringify(p.exportSave()));
      const beforeState = clone(p), beforeSave = p.exportSave(), writesBefore = storageWrites, diskSaveBefore = [...saved];
      const logs = [], dialogs = [], callbacks = [], transitions = [], visuals = [];
      const display = displayFactory(visuals);
      const scene = Object.assign(Object.create(GameScene.prototype), {
        travelling: false, prog: p, map: { id: 'youying_tower', objects },
        player: { x: entrance.x, y: entrance.y, dead: false, state2: 'ground', body: { setVelocityX() {} } },
        textures: { exists: () => false }, cache: { json: { get: () => undefined } }, interactionPrompts: [],
        add: { rectangle: () => display('rectangle'), container: () => display('container'), text: (_x, _y, text) => display('text', text) },
        log: text => logs.push(text), dialog: { open: false,
          show: (lines, _speaker, after) => { dialogs.push(lines); callbacks.push(after); } },
        closeItemPanels() {}, scene: { restart: args => transitions.push(args) },
        travelToMap: (...args) => transitions.push(args),
        encounterRuntime: { interact: () => { throw new Error(`${label}: 爬塔关态优先于其它交互`); } },
        trialObjects: { interact: () => { throw new Error(`${label}: 不借试炼进层`); } },
      });
      scene.drawObject(entrance);
      const visual = visuals.find(item => item.name === entrance.name);
      ok(visual?.interactive, `${label}/C02: 真实 drawObject 入口可点击`);
      eq(typeof visual.events.get('pointerdown'), 'function', `${label}/C02: 实际 pointerdown 已接线`);
      ok(scene.interactionPrompts.some(prompt => prompt.object === entrance), `${label}/C02: 实际入口有邻近键盘提示`);
      ok(visuals.some(item => item.text === closedStrings['tower.closed.feature']), `${label}/C01: 常显正式功能说明`);
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [name, key] of Object.entries(apiTips)) {
          eq(api[name].length, 0, `${label}: ${name} 不接收写入意图或 Progress`);
          eq(api[name](), { allowed: false, tipKey: key, text: closedStrings[key] }, `${label}/C01–C09: ${name} 重复只读拒绝`);
        }
        for (const titleId of titleIds) {
          eq(api.refuseTitle(), { allowed: false, tipKey: 'tower.closed.no_title', text: closedStrings['tower.closed.no_title'] },
            `${label}/C06: 尝试 ${titleId} 仍只读拒绝，不接收解锁写入意图`);
        }
        for (const interact of [() => scene.tryInteractTowerClosed(), () => scene.tryInteract(), () => visual.events.get('pointerdown')()]) {
          const count = dialogs.length;
          interact();
          eq(dialogs.length, count + 1, `${label}/C02: 邻近/通用/点击每次均展示说明`);
          eq(dialogs.at(-1), entranceLines, `${label}/C01–C02: 入口及功能说明可关闭重读`);
          eq(logs.at(-1), closedStrings['tower.closed.entrance'], `${label}/C02: 日志使用入口 tip`);
          eq(callbacks.at(-1), undefined, `${label}/C01–C07: 无开爬、领奖或推进回调`);
        }
        eq(transitions, [], `${label}/C02–C09: 不传送、不进层、不重启场景`);
        eq(clone(p), beforeState, `${label}/C03–C09: 完整 Progress、资产、次数、最高层、首通、称号及怪物夹具零增量`);
        eq(p.exportSave(), beforeSave, `${label}/C03–C09: 序列化存档零增量`);
        eq([...saved], diskSaveBefore, `${label}/C07: 内存存档原文不变`);
        eq(storageWrites, writesBefore, `${label}/C07: 不触发存储写入`);
      }
      // 同名对象仅在幽影楼山门消费；山门落点、渡口、NPC 与绳梯不被当成开爬。
      const count = dialogs.length;
      scene.map = { id: 'luoxia_town', objects: [entrance] };
      eq(scene.tryInteractTowerClosed(), false, `${label}/C02: 其它场景不消费同名入口`);
      scene.map = { id: 'youying_tower', objects };
      for (const object of objects.filter(object => ['npc', 'ferry', 'playerStart', 'rope', 'ladder'].includes(object.type))) {
        Object.assign(scene.player, { x: object.x, y: object.y });
        eq(scene.tryInteractTowerClosed(), false, `${label}/C02: ${object.name} 不是爬塔`);
      }
      Object.assign(scene.player, { x: entrance.x, y: entrance.y });
      scene.senseMap = { objectVisible: () => false };
      eq(scene.tryInteractTowerClosed(), false, `${label}: 隐藏对象不提前交互`);
      eq(dialogs.length, count, `${label}/C02: 山门/渡口落点不触发爬塔说明或创建流程`);
      eq(clone(p), beforeState, `${label}: 拒绝与非入口路径结束后完整状态仍不变`);
      fixtures++;
      return beforeSave;
    }

    // 尚无正式塔存档结构；以下字段只存在于测试夹具，不登记为游戏存档字段。
    const legacyFixture = (highest, state) => ({ highestClearedFloor: highest, climbCount: highest ? 2 : 0,
      firstClearFloors: highest ? [1, 10].filter(floor => floor <= highest) : [],
      titles: titleIds.filter((_title, index) => [10, 20, 30][index] <= highest),
      pendingFirstClear: state === 'pending' ? [Math.max(1, highest)] : [],
      flow: state === 'none' ? null : { floor: Math.max(1, highest), state,
        allMobsCleared: state === 'all-clear', parentCleared: state === 'split-child-alive',
        splitChildrenAlive: state === 'split-child-alive' ? 2 : 0, monsterDead: state === 'monster-dead', respawnRequested: state === 'respawn' },
    });
    let payload;
    if (!refreshPayload) {
      for (const level of [1, 30]) for (const highest of [0, 10, 20, 30]) {
        for (const state of ['none', 'climbing', 'pending', 'monster-dead', 'respawn', 'split-child-alive', 'all-clear']) {
          const p = new Progress();
          p.level = level; p.exp = 7; p.stones = 1234; p.inventory = { hp_pill: 3 };
          p.position = { mapId: 'youying_tower', x: entrance.x, y: entrance.y };
          p.__closedTowerLegacyFixture = legacyFixture(highest, state);
          payload = exercise(p, `${mode}/level=${level}/highest=${highest}/${state}`);
        }
      }
      // 使用真实渡口菜单选择回调，证明确实仍传入山门目标；此步允许普通渡口航行。
      const p = new Progress(), route = data.NPCS.ferry_master.ferryRoutes.find(item => item.id === 'youying_tower');
      eq(ferryLockedReason(route, p), undefined, `${mode}/C02: 正式渡口门控仍放行山门`);
      eq(sectEntryMap(route.targetMap), 'youying_tower', `${mode}/C02: 不把山门替换为塔内楼层`);
      const choices = [], transitions = [], beforeFerry = clone(p), beforeFerrySave = p.exportSave();
      const ferryScene = Object.assign(Object.create(GameScene.prototype), {
        map: { id: 'luoxia_town', objects: [] }, prog: p, travelling: false,
        player: { body: { setVelocityX() {} } }, quests: { onTalk() {} }, closeItemPanels() {},
        dialog: { choose: (_line, _sprite, options) => choices.push(...options) },
        log: () => { throw new Error('正式山门航线不应被爬塔关态拒绝'); },
        travelToMap: async (...args) => transitions.push(args),
      });
      ferryScene.talkTo('ferry_master');
      const choice = choices.find(item => item.label === '前往幽影楼');
      ok(choice && !choice.disabled, `${mode}/C02: 原 label 航线选项仍可选`);
      await choice.onSelect();
      eq(transitions.map(args => args.slice(0, 3)), [['youying_tower', undefined, false]], `${mode}/C02: 实际渡口回调只前往山门`);
      eq(clone(p), beforeFerry, `${mode}/C02: 免费渡口选择不创建爬塔或改变资产`);
      eq(p.exportSave(), beforeFerrySave, `${mode}/C02: 渡口选择无塔存档增量`);
    } else payload = clone(refreshPayload);

    // 真实 Progress.restore 仅恢复既有正式字段；塔旧记录由测试夹具显式重附，不扩展正式 schema。
    const serialized = JSON.stringify(payload), writesBeforeLoad = storageWrites;
    const restored = Progress.restore(JSON.parse(serialized), false);
    eq(storageWrites, writesBeforeLoad, `${mode}/C08: 真实无持久化 restore 不写正式或内存存档`);
    eq([restored.stones, restored.inventory, restored.position], [payload.stones, payload.inventory, payload.position], `${mode}/C08: 真实读档保留既有资产与山门位置`);
    restored.__closedTowerLegacyFixture = clone(payload.__closedTowerLegacyFixture);
    eq(restored.__closedTowerLegacyFixture, payload.__closedTowerLegacyFixture, `${mode}/C08: 测试专用旧塔记录原样重附`);
    exercise(restored, `${mode}/${refreshPayload ? 'fresh-ssr-refresh' : 'real-restore'}/legacy`);
    const memoryReload = Object.assign(new Progress(), JSON.parse(serialized));
    eq(memoryReload.__closedTowerLegacyFixture, payload.__closedTowerLegacyFixture, `${mode}/C08: JSON 内存存读保持旧最高层、首通、称号及流程夹具`);
    exercise(memoryReload, `${mode}/json-save-reload/legacy`);
    eq(features.featureFlags(), flagsBefore, `${mode}: 测试全程不改 feature 开关`);
    eq(storageWrites, 0, `${mode}: 所有拒绝、读档、刷新、渡口检查均未触发存储写入`);
    report({ suite: 'v06d-closed-runtime', dataMode: mode, graph: 'memory-closed',
      formalOpen: true, closedFixtureOnly: true, freshSsrRefresh: !!refreshPayload, passed: true, fixtures,
      cases: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09'],
      zeroArgumentApis: 8, storageWrites, closed: true, softOpened: true, released: false,
      legacyFixtureOnly: true, formalTowerSchemaAdded: false, assertions });
    return payload;
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
try {
  await protectTables();
  for (const [mode, dataRoot] of modes) await checkFormal(mode, dataRoot);
  for (const name of ['balance/strings_zh.json', 'maps/youying_tower.json']) {
    eq((await fs.readFile(path.join(gameData, name))).equals(sharedBytes.get(name)), true, `game 根 ${name} 与共享、wt 快照同字节`);
  }
  eq(await shaOrNull(path.join(root, 'data/features.json')), featureSha, '正式 features 未改开放状态');
  const source = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  ok(/J\(k\.z\)[\s\S]{0,200}this\.tryInteractTowerClosed\(\)/u.test(source), '真实 Z 键交互链先接关态入口');
  ok(/J\(k\.up\)[^\n]+this\.tryInteract\(\)/u.test(source), '真实 ↑ 键接通用 tryInteract 门禁');
  for (const [mode, dataRoot] of modes) {
    await runGraph(mode, dataRoot, false);
    const payload = await runGraph(mode, dataRoot, true);
    // 新 Vite SSR 图模拟刷新，模块和 Progress 均重新构造，旧记录仍不能授权放行。
    await runGraph(mode, dataRoot, true, payload);
  }
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `只读测试前后 SHA 不变：${file}`);
  await fs.writeFile(path.join(out, 'v06d-closed-evidence.json'), `${JSON.stringify({ assertions,
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    protectedFiles: Object.fromEntries(before), evidence }, null, 2)}\n`);
}
console.log(`v06d closed tests ok: ${assertions} assertions; C01–C10 自动化部分通过；shared/snapshot/game 字符串与山门地图同字节；tower_floors/titles/gifts/原904文案保持；formalOpen:true、closedFixtureOnly:true；正式已软开；关态仅内存夹具，无收益/通层/首通/称号/存储增量；未发版`);
