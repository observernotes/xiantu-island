// Reproduce the legacy payload using only the pinned tag's game code and data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(fixtureDir, '../../..');
const tag = 'v0.4.3';
const commit = 'd343ea537bd8e83e267491ba48241a90792c63fd';
const output = path.join(fixtureDir, 'full-fox-tianjian.json');
assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'usage: node scripts/fixtures/v0.4/generate.mjs [--check]');
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
assert.equal(git(['rev-parse', `${tag}^{commit}`]), commit, 'legacy tag must still match its recorded commit');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-v043-fixture-'));
const legacy = path.join(temp, 'legacy');
const originalRandom = Math.random;
const originalStorage = globalThis.localStorage;
let worktreeAdded = false;
let server;
try {
  git(['worktree', 'add', '--detach', legacy, commit]);
  worktreeAdded = true;
  await fs.symlink(path.join(repo, 'node_modules'), path.join(legacy, 'node_modules'), 'dir');
  assert.equal(git(['-C', legacy, 'rev-parse', 'HEAD']), commit);
  server = await createServer({
    root: legacy, configFile: false,
    resolve: { alias: { '@xt': path.join(legacy, 'data') } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error',
    plugins: [{
      name: 'legacy-fixture-render-stub', enforce: 'pre',
      resolveId(id, importer) {
        if (id === 'phaser') return '\0legacy-fixture-phaser';
        if (id === './gen/assets.json' && importer === path.join(legacy, 'src/data.ts')) return '\0legacy-fixture-assets';
      },
      load(id) {
        // The tag ignores generated render metadata. No save or balance fields come from it.
        if (id === '\0legacy-fixture-assets') return 'export default { atlases: [], areas: [], skillIcons: [] };';
        if (id !== '\0legacy-fixture-phaser') return;
        return `class Sprite {} export default { Scene: class {},
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Math: { Between: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)) },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } } };`;
      },
    }],
    ssr: { noExternal: ['phaser'] },
  });
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
  const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
  const { MONSTERS, QUESTS } = await server.ssrLoadModule('/src/data.ts');
  let seed = 0x043f0a;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const p = new Progress();
  const quests = new QuestSystem(p);
  const pending = [];
  const scene = Object.assign(Object.create(GameScene.prototype), {
    prog: p, quests,
    player: { x: 1180, y: 700, hp: p.hp, maxHp: p.maxHp },
    time: { delayedCall() {} },
    tweens: { add(config) { config.onComplete?.(); } },
    drops: { remove() {} },
    log() {}, levelUpFx() {},
    // Drop sprites and their flight animation are replaced; collect() stays legacy code.
    spawnDrop(x, y, itemId, count) { pending.push({ x, y, itemId, count, body: {}, destroy() {} }); },
  });
  const kills = {};
  const kill = id => {
    assert.ok(MONSTERS[id], `legacy monster exists: ${id}`);
    scene.onMobDead({ def: MONSTERS[id], grantRewards: true, x: 1180, y: 700 });
    for (const drop of pending.splice(0)) scene.collect(drop);
    kills[id] = (kills[id] ?? 0) + 1;
  };
  const until = (predicate, id) => {
    for (let attempts = 0; !predicate(); attempts++) {
      assert.ok(attempts < 1000, `bounded legacy farming: ${id}`);
      kill(id);
    }
  };
  const accept = id => {
    assert.equal(quests.available(id), true, `legacy quest available: ${id}`);
    const offer = quests.talk(QUESTS[id].giver);
    assert.equal(typeof offer.after, 'function');
    assert.equal(offer.after(), undefined);
    assert.equal(quests.isActive(id), true, `legacy quest accepted: ${id}`);
  };
  const turnIn = id => {
    assert.equal(quests.complete(id), true, `legacy objectives complete: ${id}`);
    const reward = quests.talk(QUESTS[id].turnIn).after?.();
    assert.equal(reward?.quest.id, id);
    scene.giveRewards(reward.quest, reward.broke);
    assert.equal(p.quests[id].state, 'done');
  };

  accept('q_awaken');
  quests.onReach('chest_lookout');
  turnIn('q_awaken');
  accept('q_bamboo');
  until(() => quests.complete('q_bamboo'), 'spirit_rabbit');
  turnIn('q_bamboo');
  until(() => p.level >= QUESTS.q_snake.reqLevel, 'bamboo_snake');
  accept('q_snake');
  until(() => quests.complete('q_snake'), 'bamboo_snake');
  turnIn('q_snake');
  until(() => p.level >= QUESTS.q_breakthrough.reqLevel, 'mountain_mandrill');
  accept('q_breakthrough');
  until(() => quests.complete('q_breakthrough'), 'mountain_mandrill');
  turnIn('q_breakthrough');
  accept('q_fox');
  until(() => quests.complete('q_fox'), 'demon_fox');
  turnIn('q_fox');

  // Real legacy skill-window operations: four spent SP, hit mastery and a custom hotbar.
  for (const id of ['sword_qi_slash', 'sword_qi_slash', 'whirl_sword', 'tianjian_heart']) {
    assert.deepEqual(p.addSkillPoint(id), { ok: true });
  }
  p.addMastery('sword_qi_slash', 23);
  p.addMastery('whirl_sword', 7);
  assert.equal(p.bindHotbar(6, 'sword_qi_slash'), true);
  assert.equal(p.bindHotbar(3, 'whirl_sword'), true);
  assert.equal(p.bindHotbar(7, 'light_body'), true);
  // Leave positive non-full vitals using the legacy combat formulas.
  p.hp -= p.damageFrom(MONSTERS.mountain_mandrill.atk);
  p.mp -= p.skillMpCost('sword_qi_slash');
  assert.ok(p.hp > 0 && p.hp < p.maxHp);
  assert.ok(p.mp > 0 && p.mp < p.maxMp);
  assert.equal(p.spSpent(1), 4);
  assert.equal(p.job, 'tianjian_disciple');
  const originalFields = Object.keys(new Progress()).sort();
  assert.deepEqual(Object.keys(p).sort(), originalFields, 'only original legacy Progress own fields');
  for (const field of ['questRewardVersion', 'classVersion', 'moralVersion', 'senseState', 'talismanLevel', 'position']) {
    assert.equal(Object.hasOwn(p, field), false, `${field} did not exist on legacy Progress`);
  }
  p.save();
  const raw = storage.get('xiantu_save_v1');
  assert.equal(raw, JSON.stringify(p), 'capture the exact payload emitted by legacy save()');
  const formatted = JSON.stringify(JSON.parse(raw), null, 2) + '\n';
  assert.equal(JSON.stringify(JSON.parse(formatted)), raw, 'formatting changes whitespace only');
  if (process.argv.includes('--check')) assert.equal(await fs.readFile(output, 'utf8'), formatted, 'committed fixture must reproduce byte-for-byte');
  else await fs.writeFile(output, formatted);
  console.log(JSON.stringify({
    mode: process.argv.includes('--check') ? 'check' : 'generate', tag, commit,
    sha256: createHash('sha256').update(formatted).digest('hex'),
    fieldCount: originalFields.length, kills,
    level: p.level, exp: p.exp, hp: p.hp, mp: p.mp, maxHp: p.maxHp, maxMp: p.maxMp,
    stones: p.stones, job: p.job, spEarned: p.spEarned(1), spSpent: p.spSpent(1),
    skills: p.skills, skillGifted: p.skillGifted, skillMastery: p.skillMastery, hotbar: p.hotbar,
  }, null, 2));
} finally {
  Math.random = originalRandom;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  await server?.close();
  if (worktreeAdded) git(['worktree', 'remove', '--force', legacy]);
  await fs.rm(temp, { recursive: true, force: true });
}
