import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const md5 = bytes => createHash('md5').update(bytes).digest('hex');
async function guardedTables() {
  const roots = [path.resolve('data')];
  // 与 root.mjs 一致：没有共享目录的机器仍可用仓库快照运行。
  try { roots.push(sharedRoot(process.cwd())); } catch { /* 仅有 snapshot */ }
  // features 正式默认固定读取工程快照；encounters 同时守护 snapshot 与 shared。
  const files = [...new Set([path.resolve('data/features.json'), ...roots.map(root => path.join(root, 'balance/encounters.json'))])];
  return Promise.all(files.map(async file => {
    const bytes = await readFile(file), parsed = JSON.parse(bytes.toString());
    if (file.endsWith('features.json')) assert.equal(parsed.lifeSkillCurve, false, `${file}: lifeSkillCurve 必须保持 false`);
    else {
      assert.equal(parsed.encounters.length, 5, `${file}: 五事件`);
      assert.equal(parsed.encounters.filter(row => row.enabled === true).length, 0, `${file}: 正式 enabled 计数 0`);
      assert.ok(parsed.encounters.every(row => row.enabled === false), `${file}: 正式五事件全部严格 false`);
    }
    return { file, bytes, hash: md5(bytes) };
  }));
}

// 快照、共享表各用独立模块图；坏表只在内存替换，不改正式 JSON。
if (!process.argv.includes('--single-mode')) {
  const initial = await guardedTables();
  try {
    for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
          cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`encounter ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
      });
    }
  } finally {
    const final = await guardedTables();
    for (const [index, snapshot] of initial.entries()) {
      assert.equal(final[index].file, snapshot.file);
      assert.deepEqual(final[index].bytes, snapshot.bytes, `${snapshot.file}: suite 前后原始字节不变`);
      assert.equal(final[index].hash, snapshot.hash, `${snapshot.file}: suite 前后 MD5 不变`);
      console.log(`encounter closed-table guard PASS: ${snapshot.file} md5=${snapshot.hash}, bytes unchanged`);
    }
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
      const { listEncounters, previewEncounter, triggerEncounter, evaluateEncounterEligibility,
        listEligibleEncounters, previewEncounterOutcome, settleEncounterOutcome } = await server.ssrLoadModule('/src/Encounter.ts');
      const forbidden = new Proxy({}, { get() { throw new Error('坏表不得读 ctx/save/opts'); }, ownKeys() { throw new Error('坏表不得遍历上下文'); } });
      assert.equal(data.ENCOUNTERS, null, '坏表配置不可用');
      assert.ok(data.ENCOUNTERS_ERRORS.some(error => error.includes('$.rules')), '坏表保留路径诊断');
      assert.deepEqual(listEncounters(data.ENCOUNTERS), [], '坏表只停新列表查询');
      assert.deepEqual(listEligibleEncounters(data.ENCOUNTERS, forbidden), [], '坏表候选为空不消费 ctx');
      assert.deepEqual(evaluateEncounterEligibility(data.ENCOUNTERS, 'enc_stranded_cultivator', forbidden), { eligible: false, reason: 'invalid' });
      assert.deepEqual(previewEncounter(data.ENCOUNTERS, 'enc_stranded_cultivator', forbidden), { status: 'unavailable', reason: 'invalid' });
      assert.deepEqual(triggerEncounter(data.ENCOUNTERS, 'enc_stranded_cultivator', forbidden), { status: 'rejected', reason: 'invalid' });
      assert.deepEqual(previewEncounterOutcome(data.ENCOUNTERS, 'enc_stranded_cultivator', 'rescued'), { status: 'unavailable', reason: 'invalid' });
      assert.deepEqual(settleEncounterOutcome(data.ENCOUNTERS, 'enc_stranded_cultivator', 'rescued', forbidden, forbidden), { status: 'rejected', reason: 'invalid' });
      assert.ok(data.MORAL_STATE, '奇遇坏表不影响已有两轴配置');
      assert.ok(data.GONGFA_GRADES && data.QI_DENSITY, '奇遇坏表不影响其他新增表');
      assert.equal(data.GONGFA_GRADES_ERRORS.length, 0);
      assert.equal(data.QI_DENSITY_ERRORS.length, 0);
      console.log('encounter invalid table tests ok: all 7 APIs guarded, existing moral state and other tables load');
    }
    console.log(`encounter ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
