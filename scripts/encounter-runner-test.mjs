import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const md5 = bytes => createHash('md5').update(bytes).digest('hex');
async function guardedTables() {
  const roots = [path.resolve('data')];
  try { roots.push(sharedRoot(process.cwd())); } catch { /* 沿既有 snapshot 回退。 */ }
  const files = [...new Set([path.resolve('data/features.json'), ...roots.flatMap(root => [
    'encounters.json', 'gongfa_grades.json', 'qi_density.json', 'npcs.json', 'karma_flags.json',
  ].map(file => path.join(root, 'balance', file)))])];
  return Promise.all(files.map(async file => {
    const bytes = await readFile(file), parsed = JSON.parse(bytes.toString());
    if (file.endsWith('/features.json')) {
      assert.equal(md5(bytes), 'a06c3638796fd1bed9af3d45c038c954', 'features 固定 MD5');
      assert.equal(parsed.lifeSkillCurve, false, 'lifeSkillCurve 保持 false');
    } else if (file.endsWith('/encounters.json')) {
      assert.equal(parsed.encounters.length, 5, `${file}: 五事件`);
      assert.ok(parsed.encounters.every(row => row.enabled === false), `${file}: 正式五事件全部严格 false`);
    } else {
      const enabled = [];
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (key === 'enabled') enabled.push(child);
          visit(child);
        }
      };
      visit(parsed);
      assert.ok(enabled.length > 0, `${file}: 找到关闭门禁`);
      assert.ok(enabled.every(value => value === false), `${file}: #19/#20/affinity/questHooks 关态`);
    }
    return { file, bytes, hash: md5(bytes) };
  }));
}

// 每种数据模式独立模块图，开态只在 structuredClone fixture 内，正式表前后逐字节守护。
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
      console.log(`encounter-runner closed-table guard PASS: ${snapshot.file} md5=${snapshot.hash}, bytes unchanged`);
    }
  }
} else {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'encounter-runner-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0encounter-runner-phaser'; },
      load(id) { if (id === '\0encounter-runner-phaser') return 'export default {GameObjects:{NineSlice:class {}},Scenes:{Events:{SHUTDOWN:"shutdown"}}};'; },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    await server.ssrLoadModule('/src/encounter-runner.test.ts');
    console.log(`encounter-runner XT_DATA=${process.env.XT_DATA}: passed`);
  } finally { await server.close(); }
}
