// 每种数据模式独立模块图；tip 已开 #19/#20/lifeSkillCurve/五事件/九人好感/两题 questHooks，gifts 仍关。
// 关态仅用 structuredClone fixture，正式表前后逐字节守护。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const md5 = bytes => createHash('md5').update(bytes).digest('hex');
function enabledValues(parsed) {
  const enabled = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'enabled') enabled.push(child);
      visit(child);
    }
  };
  visit(parsed);
  return enabled;
}
async function guardedTables() {
  const roots = [path.resolve('data')];
  try { roots.push(sharedRoot(process.cwd())); } catch { /* 沿既有 snapshot 回退。 */ }
  const files = [...new Set([path.resolve('data/features.json'), ...roots.flatMap(root => [
    'encounters.json', 'gongfa_grades.json', 'qi_density.json', 'npcs.json', 'karma_flags.json',
  ].map(file => path.join(root, 'balance', file)))])];
  return Promise.all(files.map(async file => {
    const bytes = await readFile(file), parsed = JSON.parse(bytes.toString());
    if (file.endsWith('/features.json')) {
      assert.equal(md5(bytes), '16fa150878794fd82cccf76a25b48d5a', 'tip 开态 features 固定 MD5');
      assert.equal(parsed.lifeSkillCurve, true, 'tip 开态，lifeSkillCurve 已开启');
      assert.equal(parsed.indexedDbSaves, true, 'tip 开态，indexedDbSaves 已开启');
    } else if (file.endsWith('/encounters.json')) {
      assert.equal(parsed.encounters.length, 5, `${file}: 五事件`);
      assert.ok(parsed.encounters.every(row => row.enabled === true), `${file}: tip 临时开态，正式五事件全部严格 true`);
    } else if (file.endsWith('/npcs.json')) {
      const affinities = parsed.filter(row => Object.hasOwn(row, 'affinity')).map(row => row.affinity);
      assert.equal(affinities.length, 9, `${file}: 正式九人好感块`);
      assert.ok(affinities.every(row => row?.enabled === true), `${file}: tip 开态，九人 affinity.enabled 全部严格 true`);
      assert.equal(affinities.filter(row => row?.gifts?.enabled === false).length, 9, `${file}: 九个 affinity.gifts.enabled 全部严格 false`);
    } else if (file.endsWith('/karma_flags.json')) {
      assert.deepEqual(parsed.questHooks.map(row => row.id).sort(), ['prologue_medicine', 'sect_tianjian_sword'], `${file}: 正式两题 questHooks`);
      assert.ok(parsed.questHooks.every(row => row.enabled === true), `${file}: tip 开态，两题 questHooks.enabled 全部严格 true`);
    } else if (file.endsWith('/gongfa_grades.json')) {
      assert.equal(parsed.enabled, true, `${file}: tip 开态，#19 功法品阶根 enabled 严格 true`);
      assert.equal(parsed.bindings.length, 38, `${file}: 正式 38 个功法绑定`);
      assert.ok(parsed.bindings.every(row => row.enabled === true), `${file}: tip 开态，38 个 bindings.enabled 全部严格 true`);
      const futureEnabled = enabledValues(parsed.future);
      assert.equal(futureEnabled.length, 7, `${file}: future 七处 enabled`);
      assert.ok(futureEnabled.every(value => value === false), `${file}: future enabled 全部严格 false`);
      const enabled = enabledValues(parsed);
      assert.equal(enabled.length, 46, `${file}: 正式 46 处 enabled`);
      assert.equal(enabled.filter(value => value === true).length, 39, `${file}: tip 开态，39 处 enabled 严格 true`);
      assert.equal(enabled.filter(value => value === false).length, 7, `${file}: future 七处 enabled 严格 false`);
    } else if (file.endsWith('/qi_density.json')) {
      assert.equal(parsed.enabled, true, `${file}: tip 开态，#20 灵气浓度根 enabled 严格 true`);
      assert.equal(parsed.display.enabled, true, `${file}: tip 开态，display.enabled 严格 true`);
      assert.equal(parsed.meditation.enabled, true, `${file}: tip 开态，meditation.enabled 严格 true`);
      assert.equal(parsed.future.gathering.enabled, false, `${file}: future.gathering.enabled 严格 false`);
      const enabled = enabledValues(parsed);
      assert.equal(enabled.length, 4, `${file}: 正式四处 enabled`);
      assert.equal(enabled.filter(value => value === true).length, 3, `${file}: tip 开态，三处 enabled 严格 true`);
      assert.equal(enabled.filter(value => value === false).length, 1, `${file}: future 一处 enabled 严格 false`);
    }
    return { file, bytes, hash: md5(bytes) };
  }));
}

if (!process.argv.includes('--single-mode')) {
  const initial = await guardedTables();
  try {
    for (const mode of ['snapshot', 'shared']) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--single-mode'], {
          cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`encounter-runner ${mode} failed: ${code}`)));
      });
    }
  } finally {
    const final = await guardedTables();
    for (const [index, snapshot] of initial.entries()) {
      assert.equal(final[index].file, snapshot.file);
      assert.deepEqual(final[index].bytes, snapshot.bytes, `${snapshot.file}: suite 前后原始字节不变`);
      assert.equal(final[index].hash, snapshot.hash, `${snapshot.file}: suite 前后 MD5 不变`);
      console.log(`encounter-runner open-table guard PASS: ${snapshot.file} md5=${snapshot.hash}, bytes unchanged`);
    }
  }
} else {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'encounter-runner-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0encounter-runner-phaser'; },
      load(id) { if (id === '\0encounter-runner-phaser') return 'export default {Scene:class {},Physics:{Arcade:{Sprite:class {}}},GameObjects:{NineSlice:class {}},Scenes:{Events:{SHUTDOWN:"shutdown"}},Math:{Clamp:(n,min,max)=>Math.max(min,Math.min(max,n))},Geom:{Rectangle:class {constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}}}};'; },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    await legacySaveFixture(server);
    await server.ssrLoadModule('/src/encounter-runner.test.ts');
    await server.ssrLoadModule('/src/encounter-battle.test.ts');
    console.log(`encounter-runner XT_DATA=${process.env.XT_DATA}: passed`);
  } finally { await server.close(); }
}
