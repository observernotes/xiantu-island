// #19 功法与 #20 灵气 tip 已开启，gifts 仍关闭；关态夹具与其他变体仅在内存克隆，原版模块由 git show 读取，不修改正式门禁。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.XT_DATA ??= 'snapshot';
const dataRoot = findRoot(root);
const baseline = '8cca2a4090b044e0bb6468d2369f38334200dfae';
const original = name => execFileSync('git', ['show', `${baseline}:src/${name}.ts`], { cwd: root, encoding: 'utf8' });
const oldSources = Object.fromEntries(['SkillCombat', 'Seclusion', 'Progress'].map(name => [name, original(name)]));
const rawGongfa = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/gongfa_grades.json'), 'utf8'));
const rawQi = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/qi_density.json'), 'utf8'));
const fixedNow = Date.UTC(2026, 9, 16, 8);
let assertions = 0, combatCases = 0, seclusionCases = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const bytes = n => { const b = Buffer.allocUnsafe(8); b.writeDoubleBE(n); return b.toString('hex'); };
const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key), clear: () => saved.clear(),
  key: index => [...saved.keys()][index] ?? null,
  get length() { return saved.size; },
};

function allDisabled(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, child]) => key === 'enabled' ? child === false : allDisabled(child));
}
function enabledFlags(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key === 'enabled' ? [child] : enabledFlags(child));
}
check(rawGongfa.enabled === true, 'tip 发布快照正式功法表根门禁已开启');
equal(rawGongfa.bindings.length, 38, 'tip 正式功法表保留 38 条绑定');
check(rawGongfa.bindings.every(binding => binding.enabled === true), 'tip 正式功法表 38 条绑定全部开启');
check(allDisabled(rawGongfa.future), 'tip 正式功法表 future 门禁仍全部关闭');
equal(enabledFlags(rawGongfa.future).length, 7, 'tip 正式功法表保留 7 处 future 关门禁');
const gongfaGates = enabledFlags(rawGongfa);
equal([gongfaGates.length, gongfaGates.filter(enabled => enabled === true).length,
  gongfaGates.filter(enabled => enabled === false).length], [46, 39, 7], 'tip 正式功法表 enabled 总数及开关计数保持 46/39/7');
check(rawQi.enabled === true && rawQi.display.enabled === true && rawQi.meditation.enabled === true,
  'tip 正式灵气表根、display 与 meditation 门禁已开启');
check(rawQi.future.gathering.enabled === false, 'tip 正式灵气表 future.gathering 门禁仍关闭');
const qiGates = enabledFlags(rawQi);
equal([qiGates.length, qiGates.filter(enabled => enabled === true).length,
  qiGates.filter(enabled => enabled === false).length], [4, 3, 1], 'tip 正式灵气表 enabled 总数及开关计数保持 4/3/1');

async function withRuntime(variant, run) {
  const gongfa = structuredClone(rawGongfa), qi = structuredClone(rawQi);
  if (variant === 'closed') {
    gongfa.enabled = false;
    for (const binding of gongfa.bindings) binding.enabled = false;
    check(allDisabled(gongfa), '关态夹具关闭根与全部绑定，future 保持关闭');
    qi.enabled = false;
    qi.display.enabled = false;
    qi.meditation.enabled = false;
    qi.future.gathering.enabled = false;
    check(allDisabled(qi), '关态夹具关闭灵气表全部四处 enabled 门禁');
  } else if (variant === 'broken') {
    delete gongfa.grades;
    delete qi.tiers;
  } else if (variant === 'open-clone') {
    // #19 功法与 #20 灵气 tip 已开启；重复设为开态让此内存变体保持幂等，gathering 仍关闭。
    gongfa.enabled = true;
    for (const binding of gongfa.bindings) binding.enabled = true;
    qi.enabled = true;
    qi.display.enabled = true;
    qi.meditation.enabled = true;
    qi.future.gathering.enabled = false;
    // 用真实表最高品阶倍率检查 none：即使品阶可用，也不能读取伤害倍率。
    const none = gongfa.bindings.find(binding => binding.skillId === 'spirit_bolt');
    none.effectMode = 'none';
    none.initialGrade = gongfa.rules.gradeOrder.at(-1);
  }
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error',
    plugins: [{ name: `gongfa-qi-legacy-${variant}`, enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0gongfa-qi-phaser';
        if (id.endsWith('/balance/gongfa_grades.json')) return '\0gongfa-qi-gongfa';
        if (id.endsWith('/balance/qi_density.json')) return '\0gongfa-qi-density';
        for (const name of Object.keys(oldSources)) {
          if (id === `/src/__gongfa_qi_legacy_${name}.ts`) return path.join(root, `src/__gongfa_qi_legacy_${name}.ts`);
        }
      },
      load(id) {
        if (id === '\0gongfa-qi-gongfa') return `export default ${JSON.stringify(gongfa)};`;
        if (id === '\0gongfa-qi-density') return `export default ${JSON.stringify(qi)};`;
        for (const [name, source] of Object.entries(oldSources)) {
          if (id === path.join(root, `src/__gongfa_qi_legacy_${name}.ts`)) return source;
        }
        if (id === '\0gongfa-qi-phaser') return `class Sprite {} export default {
          WEBGL: 2, Scene: class {}, Physics: { Arcade: { Sprite } },
          GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }
        };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    await legacySaveFixture(server);
    const clock = await server.ssrLoadModule('/src/GameClock.ts');
    clock.setGameTimeSource(() => fixedNow);
    const data = await server.ssrLoadModule('/src/data.ts');
    const skills = await server.ssrLoadModule('/src/skills.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { Progress: OldProgress } = await server.ssrLoadModule('/src/__gongfa_qi_legacy_Progress.ts');
    const { CLASS_LIST } = await server.ssrLoadModule('/src/classes.ts');
    const { SkillCombat } = await server.ssrLoadModule('/src/SkillCombat.ts');
    const { SkillCombat: OldCombat } = await server.ssrLoadModule('/src/__gongfa_qi_legacy_SkillCombat.ts');
    const { Seclusion } = await server.ssrLoadModule('/src/Seclusion.ts');
    const { Seclusion: OldSeclusion } = await server.ssrLoadModule('/src/__gongfa_qi_legacy_Seclusion.ts');
    const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
    await run({ variant, data, skills, Progress, OldProgress, CLASS_LIST, SkillCombat, OldCombat, Seclusion, OldSeclusion, QuestSystem, gongfa });
  } finally { await server.close(); }
}

function combatTrace(runtime, Combat, def, level, crit, multiplier, splash) {
  const Progress = Combat === runtime.OldCombat ? runtime.OldProgress : runtime.Progress;
  const p = new Progress();
  p.level = Math.max(20, level);
  p.job = runtime.CLASS_LIST.find(cls => cls.sect === def.sect && cls.job === def.job)?.id ?? '';
  p.quests.q_breakthrough = { state: 'done', kills: {} };
  p.skills = { [def.id]: level };
  const trace = { ratios: [], hits: [], numbers: [], events: [], knock: [] };
  const damage = p.skillDamageTo;
  p.skillDamageTo = function(id, lv, monLevel, monDef, ratio, forceCrit) {
    trace.ratios.push(bytes(ratio));
    return damage.call(this, id, lv, monLevel, monDef, ratio, forceCrit);
  };
  const scene = {
    prog: p, player: { x: 100, y: 100, facing: 1, depth: 2 }, time: { now: 1234 },
    add: { graphics: () => ({ setDepth() { return this; } }) },
    events: { once() {}, emit(name, event) { if (name === 'skill:hit') trace.events.push([name, event]); } },
    damageNumber: (...args) => trace.numbers.push(args),
  };
  const mobs = [0, 1].map(index => ({
    x: 130 + index * 40, y: 100, dead: false,
    def: { id: `legacy-target-${index}`, level: p.level + index * 5, def: 7 + index * 11 },
    body: { height: 32, setVelocityX: value => trace.knock.push([index, value]) },
    takeHit: (...args) => trace.hits.push([index, ...args]),
  }));
  const random = Math.random;
  try {
    Math.random = () => 0.375;
    const combat = new Combat(scene);
    combat.applyHits(def.id, level, mobs, { hits: new Set(), maxTargets: 2, crit }, multiplier, splash);
  } finally { Math.random = random; }
  trace.mastery = p.skillMastery;
  return trace;
}

function compareCombat(runtime, expectedMul = () => 1) {
  const derivedSource = runtime.skills.SKILL_LIST.find(skill => runtime.skills.skillNumber(skill, 'splashDamageRatio', 1) > 0);
  check(derivedSource, `${runtime.variant}: 真技能表含已配平的派生伤害倍率夹具`);
  for (const def of runtime.skills.SKILL_LIST.filter(skill => skill.damageRatio > 0 && skill.type !== 'passive')) {
    const levels = [...new Set([1, Math.max(1, Math.ceil(def.maxLevel / 2)), def.maxLevel])];
    for (const level of levels) for (const crit of [false, true]) {
      const ownDerived = runtime.skills.skillNumber(def, 'splashDamageRatio', level);
      const derived = ownDerived > 0 ? ownDerived
        : runtime.skills.skillNumber(derivedSource, 'splashDamageRatio', Math.min(level, derivedSource.maxLevel));
      for (const [multiplier, splash] of [[1, false], [derived, true]]) {
        const legacy = combatTrace(runtime, runtime.OldCombat, def, level, crit, multiplier, splash);
        const actual = combatTrace(runtime, runtime.SkillCombat, def, level, crit, multiplier, splash);
        const mul = expectedMul(def.id);
        if (mul === 1) {
          equal(JSON.stringify(actual), JSON.stringify(legacy), `${runtime.variant}/${def.id}/Lv${level}/crit${crit}/derived${splash}: ratio字节、伤害、命中事件逐字节相同`);
        } else {
          const expectedRatio = runtime.skills.skillNumber(def, 'damageRatio', level) * mul * multiplier;
          check(actual.ratios.length > 0, `${def.id}: 开态实际进入伤害公式`);
          equal(actual.ratios, actual.ratios.map(() => bytes(expectedRatio)), `${def.id}: 开态只对根damageRatio乘一次品阶倍率，派生不重复乘`);
        }
        combatCases++;
      }
    }
  }
}

function seclusionTrace(runtime, Engine, options) {
  const Progress = Engine === runtime.OldSeclusion ? runtime.OldProgress : runtime.Progress;
  const p = new Progress();
  const unlock = runtime.data.REALMS.find(realm => realm.id === runtime.data.SECT_SECLUSION.unlockRealm);
  p.level = options.level ?? unlock.levelMin;
  p.job = 'tianjian_disciple';
  p.sectContribution = options.cost === false ? 0 : 10000;
  p.age = options.life === false ? p.lifespanCap : 16;
  p.ageUpdatedAt = fixedNow;
  if (options.daily) {
    const day = new Date(fixedNow);
    p.seclusionDay = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    p.seclusionYearsToday = runtime.data.SECT_SECLUSION.maxYearsPerRealDay;
  }
  if (options.position) p.setPosition(options.position, 64, 128);
  const engine = new Engine(p), request = { mode: 'sect' };
  const preview = { locked: engine.locked(request), reason: engine.check(request, options.years, fixedNow) };
  const result = engine.settle(request, options.years, fixedNow);
  return { preview, result, saved: p.exportSave() };
}

function compareSeclusion(runtime) {
  const options = runtime.data.SECT_SECLUSION.options;
  const maps = Object.entries(runtime.data.TILED_MAPS).filter(([, map]) => map.properties?.some(prop => prop.name === 'qiDensity'));
  const positions = maps.length ? [maps[0][0], maps.at(-1)[0]] : [undefined];
  for (const years of options) for (const position of positions) {
    for (const state of [{}, { cost: false }, { life: false }, { daily: true }, { level: 1 }]) {
      const config = { years, position, ...state };
      const old = seclusionTrace(runtime, runtime.OldSeclusion, config);
      const current = seclusionTrace(runtime, runtime.Seclusion, config);
      const label = `${runtime.variant}/闭关${JSON.stringify(config)}`;
      equal(current.saved.affinity, {}, `${label}: 新增好感存档保持空默认，不产生玩法效果`);
      equal(current.saved.relationshipState, {
        version: 1, questChoices: {}, appliedQuestHooks: [], appliedAffinitySources: [],
        claimedAffinityRewards: [], pendingAffinitySources: [], quarantinedFlags: {},
      }, `${label}: 新增关系存档保持空默认，无来源、收据或选择效果`);
      // 只排除已逐字段断言的两项新增存档，其余预览、收益及历史字段仍逐字节比较。
      const { affinity, relationshipState, ...legacySaved } = current.saved;
      equal(JSON.stringify({ ...current, saved: legacySaved }), JSON.stringify(old), `${label}: 资格预览、收益和历史存档逐字节相同`);
      if (!Object.keys(state).length) check(current.result.ok && current.result.gained + current.result.overflowed > 0,
        `${runtime.variant}: 真实宗门闭关仍有收益`);
      seclusionCases++;
    }
  }
}

function exerciseLegacyEntries(runtime) {
  const p = new runtime.Progress();
  p.level = 10;
  p.quests.q_breakthrough = { state: 'done', kills: {} };
  const skill = runtime.skills.SKILLS.spirit_bolt;
  const earned = p.spEarned.bind(p);
  p.spEarned = job => job === 0 ? 3 * skill.spCost : earned(job);
  equal(p.addSkillPoint(skill.id), { ok: true }, `${runtime.variant}: 坏表不阻塞真实技能学习`);
  equal(p.addSkillPoint(skill.id), { ok: true }, `${runtime.variant}: 坏表不阻塞真实技能升级`);
  equal(p.skillLevel(skill.id), 2, `${runtime.variant}: 学习升级实际累加`);
  check(!Object.hasOwn(p.exportSave(), 'gongfaState'), '本轮不写 gongfaState 存档字段');
  const mapIds = Object.keys(runtime.data.TILED_MAPS).slice(0, 2);
  check(mapIds.length > 0, '真实地图夹具存在');
  for (const id of mapIds) check(p.setPosition(id, 64, 128), `${runtime.variant}: 坏表不阻塞探索落点保存 ${id}`);
  const q = new runtime.Progress(), quests = new runtime.QuestSystem(q);
  check(quests.accept('q_awaken'), `${runtime.variant}: 坏表不阻塞真实任务接取`);
  quests.onReach('chest_lookout');
  const result = quests.turnIn('q_awaken', false, 'return');
  equal(result?.quest.id, 'q_awaken', `${runtime.variant}: 坏表不阻塞真实任务交付`);
  equal(q.quests.q_awaken?.state, 'done', `${runtime.variant}: 任务实际完成`);
}

await withRuntime('closed', runtime => {
  check(runtime.data.GONGFA_GRADES && runtime.data.GONGFA_GRADES.enabled === false,
    '关态夹具功法配置校验成功且保持关闭');
  check(runtime.data.QI_DENSITY && runtime.data.QI_DENSITY.enabled === false,
    '关态夹具灵气配置校验成功且保持关闭');
  compareCombat(runtime);
  compareSeclusion(runtime);
  exerciseLegacyEntries(runtime);
});
await withRuntime('broken', runtime => {
  equal(runtime.data.GONGFA_GRADES, null, '坏功法表降级为配置不可用');
  equal(runtime.data.QI_DENSITY, null, '坏灵气表降级为配置不可用');
  check(runtime.data.GONGFA_GRADES_ERRORS.length > 0, '坏功法表保留结构错误诊断');
  check(runtime.data.QI_DENSITY_ERRORS.length > 0, '坏灵气表保留结构错误诊断');
  compareCombat(runtime);
  compareSeclusion(runtime);
  exerciseLegacyEntries(runtime);
});
await withRuntime('open-clone', runtime => {
  check(runtime.data.GONGFA_GRADES?.enabled === true, '内存开态克隆实际校验成功，不能因配置不可用漏过接线断言');
  const bindings = new Map(runtime.gongfa.bindings.map(binding => [binding.skillId, binding]));
  const grades = new Map(runtime.gongfa.grades.map(grade => [grade.id, grade]));
  compareCombat(runtime, id => {
    const binding = bindings.get(id);
    return binding?.effectMode === 'damage_ratio' ? grades.get(binding.initialGrade).effectMul : 1;
  });
  compareSeclusion(runtime);
});
console.log(JSON.stringify({ passed: true, suite: 'gongfa-qi-legacy', baseline, assertions, combatCases, seclusionCases,
  coverage: ['tip-open-closed-fixture-and-malformed-tables', 'all-positive-damageRatio-skills', 'ratio-IEEE754-bytes-and-hit-JSON',
    'levels-crit-derived-segments', 'open-clone-once-and-none', 'real-skill-learning-upgrade', 'exploration-position-save',
    'real-quest-accept-turnIn', 'real-seclusion-check-settle-and-save', 'empty-relationship-save-defaults'] }));
