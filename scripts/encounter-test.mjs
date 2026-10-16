import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// 快照、共享表各用独立模块图；坏表只在内存替换，不改正式 JSON。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`encounter ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'encounter-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/encounters.json')) return '\0encounter-invalid-table'; },
      load(id) { if (id === '\0encounter-invalid-table') return 'export default {rules:null,encounters:[]};'; },
    }] : [],
  });
  try {
    if (!invalid) await server.ssrLoadModule('/src/encounter.test.ts');
    else {
      const data = await server.ssrLoadModule('/src/data.ts');
      const { listEncounters, previewEncounter, triggerEncounter } = await server.ssrLoadModule('/src/Encounter.ts');
      assert.equal(data.ENCOUNTERS, null, '坏表配置不可用');
      assert.ok(data.ENCOUNTERS_ERRORS.some(error => error.includes('$.rules')), '坏表保留路径诊断');
      assert.deepEqual(listEncounters(data.ENCOUNTERS), [], '坏表只停新列表查询');
      assert.deepEqual(previewEncounter(data.ENCOUNTERS, 'enc_stranded_cultivator'), { status: 'unavailable', reason: 'invalid' });
      assert.deepEqual(triggerEncounter(data.ENCOUNTERS, 'enc_stranded_cultivator'), { status: 'rejected', reason: 'invalid' });
      assert.ok(data.MORAL_STATE, '奇遇坏表不影响已有两轴配置');
      assert.ok(data.GONGFA_GRADES && data.QI_DENSITY, '奇遇坏表不影响其他新增表');
      assert.equal(data.GONGFA_GRADES_ERRORS.length, 0);
      assert.equal(data.QI_DENSITY_ERRORS.length, 0);
      console.log('encounter invalid table tests ok: queries unavailable, existing moral state and other tables load');
    }
    console.log(`encounter ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
