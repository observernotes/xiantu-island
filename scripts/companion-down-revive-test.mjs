// timeout 60s node scripts/companion-down-revive-test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
assert.notEqual(modes[0][1], modes[1][1], 'shared/snapshot 必须使用两份数据根');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedRel = ['balance/companions.json', 'balance/skills.json', 'balance/fly_zones.json', 'features.json'];
const expected = {
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  'balance/fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'features.json': '69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8',
};
async function fileHash(file) {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const before = new Map();
for (const [mode, dataRoot] of modes) {
  for (const rel of protectedRel) {
    const file = path.join(dataRoot, rel);
    const sha = await fileHash(file);
    before.set(file, sha);
    // features 发版配置仅存在工程快照；共享根的缺失也在 finally 守护。
    if (mode === 'shared' && rel === 'features.json' && sha === null) continue;
    assert.equal(sha, expected[rel], `${mode} ${rel} SHA MATCH`);
  }
}

let total = 0;
try {
  for (const [mode, dataRoot] of modes) {
    const server = await createServer({
      root, configFile: false,
      // 显式覆盖配置，防止两轮都沿分支默认别名读 shared。
      resolve: { alias: { '@xt': dataRoot } },
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom', logLevel: 'error',
      plugins: [{ name: 'companion-down-revive-phaser', enforce: 'pre',
        resolveId(id) { if (id === 'phaser') return '\0companion-down-revive-phaser'; },
        load(id) {
          if (id !== '\0companion-down-revive-phaser') return;
          return `class Sprite {} export default { WEBGL: 2, Scene: class {},
            Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {}, Graphics: class {} },
            Geom: { Rectangle: class { constructor(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;} },
              Intersects: { RectangleToRectangle: (a,b) => a.x < b.x+b.width && a.x+a.width > b.x
                && a.y < b.y+b.height && a.y+a.height > b.y } },
            Scenes: { Events: { SHUTDOWN: 'shutdown' } },
            Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
            Input: { Keyboard: { JustDown: () => false } } };`;
        },
      }],
      ssr: { noExternal: ['phaser'] },
    });
    try {
      const resolved = await server.pluginContainer.resolveId('@xt/balance/companions.json');
      assert.equal(path.normalize(resolved?.id ?? ''), path.join(dataRoot, 'balance/companions.json'), `${mode} 实际解析根`);
      const suite = await server.ssrLoadModule('/src/companion-down-revive.test.ts');
      const result = await suite.runCompanionDownReviveTests({ dataMode: mode });
      total += result.assertions;
      console.log(JSON.stringify({ suite: 'companion-down-revive', dataMode: mode, dataRoot, assertions: result.assertions,
        passed: true, newOpenFlag: false, soft: false, release: false,
        hard: 'reviveMs30000+sceneLocal+fatalHitReflectFalse+maxHp+iFrames1000+原地+41-45unchanged' }));
    } finally {
      await server.close();
    }
  }
} finally {
  for (const [file, sha] of before) assert.equal(await fileHash(file), sha, `自测不得改动 ${file}`);
}
console.log(`companion-down-revive tests ok: ${total} assertions; shared/snapshot 两根；companions/skills/fly_zones/features SHA 不变；无新 OpenFlag；≠soft≠release`);
