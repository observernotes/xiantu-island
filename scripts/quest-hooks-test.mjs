import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

// 两种数据根分别验证真表和仅破坏 questHooks 的模块图，不改正式 JSON。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`quest hooks ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const original = JSON.parse(await readFile(path.join(findRoot(process.cwd()), 'balance/karma_flags.json'), 'utf8'));
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'quest-hooks-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/karma_flags.json')) return '\0quest-hooks-invalid-table'; },
      load(id) { if (id === '\0quest-hooks-invalid-table') return `export default ${JSON.stringify({ ...original, questHooks: 'invalid' })};`; },
    }] : [],
  });
  try {
    if (!invalid) await server.ssrLoadModule('/src/quest-hooks.test.ts');
    else {
      const { QUEST_HOOKS, QUEST_HOOKS_ERRORS, MORAL_STATE } = await server.ssrLoadModule('/src/data.ts');
      const { previewQuestHook, settleQuestHook } = await server.ssrLoadModule('/src/QuestHooks.ts');
      const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
      assert.equal(QUEST_HOOKS, null, '坏选择表仅停新查询');
      assert.ok(QUEST_HOOKS_ERRORS.some(error => error.includes('$.questHooks')), '保留选择字段诊断');
      assert.deepEqual(MORAL_STATE, original.rules.moralState, '既有两轴规则保持不变');
      const progress = new Progress();
      assert.equal(progress.daoHeart, MORAL_STATE.daoHeart.initial, '旧角色道心初始化不受坏选择表影响');
      assert.equal(progress.morality, MORAL_STATE.morality.initial, '旧角色善恶初始化不受坏选择表影响');
      const before = JSON.stringify(progress.exportSave());
      assert.deepEqual(previewQuestHook(QUEST_HOOKS, 'prologue_medicine', 'return', progress), { status: 'unavailable', reason: 'invalid' });
      assert.deepEqual(settleQuestHook(QUEST_HOOKS, 'prologue_medicine', 'return', progress), { status: 'rejected', reason: 'invalid' });
      assert.equal(JSON.stringify(progress.exportSave()), before, '坏表拒绝不改角色存档数据');
      console.log('quest hooks invalid table tests ok: queries unavailable, legacy moral state unchanged');
    }
    console.log(`quest hooks ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
