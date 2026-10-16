import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

// 独立模块图双跑；坏表仅替换测试内 NPC 模块，不改正式 JSON。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`affinity ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const npcs = JSON.parse(readFileSync(path.join(findRoot(process.cwd()), 'balance/npcs.json'), 'utf8'));
  const invalidNpcs = structuredClone(npcs);
  invalidNpcs.find(npc => npc.affinity).affinity.min = null;
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'affinity-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/npcs.json')) return '\0affinity-invalid-table'; },
      load(id) { if (id === '\0affinity-invalid-table') return `export default ${JSON.stringify(invalidNpcs)};`; },
    }] : [],
  });
  try {
    if (!invalid) {
      await legacySaveFixture(server);
      await server.ssrLoadModule('/src/affinity.test.ts');
      await server.ssrLoadModule('/src/relationship-save.test.ts');
    }
    else {
      const { AFFINITY, AFFINITY_ERRORS, NPCS, QUESTS } = await server.ssrLoadModule('/src/data.ts');
      const { getAffinity, applyAffinityDelta } = await server.ssrLoadModule('/src/Affinity.ts');
      assert.equal(AFFINITY, null, '坏表停止好感查询');
      assert.ok(AFFINITY_ERRORS.some(error => error.includes('.affinity.min')), '坏表保留路径诊断');
      const save = { village_elder: 40 }, before = JSON.stringify(save);
      assert.deepEqual(getAffinity(AFFINITY, 'village_elder', save), { status: 'unavailable', reason: 'invalid' });
      assert.deepEqual(applyAffinityDelta(AFFINITY, 'village_elder', 40, save), { status: 'rejected', reason: 'invalid' });
      assert.equal(JSON.stringify(save), before, '坏表无存档副作用');
      assert.equal(Object.keys(NPCS).length, npcs.length, '一块好感坏表不影响原 NPC 索引');
      assert.deepEqual(NPCS.tianjian_envoy, npcs.find(npc => npc.id === 'tianjian_envoy'), '无好感块的 NPC 对白任务保持可用');
      assert.ok(QUESTS.q_awaken, '原序章任务仍可查询');
      console.log('affinity invalid table tests ok: unavailable index, rejected delta, unchanged save and legacy NPC/quest data');
    }
    console.log(`affinity ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
