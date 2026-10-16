import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const features = path.join(root, 'data/features.json');
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

if (!process.argv.includes('--single-mode')) {
  const before = await fs.readFile(features);
  assert.equal(md5(before), '16fa150878794fd82cccf76a25b48d5a', 'indexedDbSaves 正式开态 features 字节基线');
  try {
    for (const mode of ['snapshot', 'shared']) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--single-mode'], {
          cwd: root, env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`encounter-props ${mode} failed: ${code}`)));
      });
    }
  } finally {
    assert.deepEqual(await fs.readFile(features), before, 'fixture 执行前后 features 逐字节不变');
    console.log(`encounter-props features MD5: ${md5(await fs.readFile(features))} (unchanged)`);
  }
} else {
  // 只替换 Phaser 的分配宿主；GameScene、Runtime、Sense 和 Progress 使用真实实现。
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'encounter-props-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0encounter-props-phaser'; },
      load(id) {
        if (id !== '\0encounter-props-phaser') return;
        return `class Sprite {} class Rectangle {} export default {
          WEBGL: 2, Scene: class {}, Physics: { Arcade: { Sprite } },
          GameObjects: { Sprite, Rectangle, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }, BlendModes: { NORMAL: 0 }
        };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    await legacySaveFixture(server);
    await server.ssrLoadModule('/src/encounter-props.test.ts');
    console.log(`encounter-props XT_DATA=${process.env.XT_DATA}: passed`);
  } finally { await server.close(); }
}
