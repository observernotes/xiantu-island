// timeout 60s node scripts/companion-support-sword-shield-test.mjs
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
const protectedRel = ['balance/companions.json', 'balance/skills.json', 'balance/npcs.json', 'balance/quests.json', 'features.json'];
const expected = {
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  // design/47 来源仅接入正式快照；两根的既有独立字节均冻结。
  'balance/npcs.json': {
    shared: '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
    snapshot: '243109d7b2f80877e83f737f951646d1170c1c39f9929a664c4359d9cfe1d134',
  },
  'balance/quests.json': {
    shared: 'c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b',
    snapshot: 'ec9289b5f9ecabceadf39b3bf921c11389b34d7ac18a7398d26fbd3dc3f089c4',
  },
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
    assert.equal(sha, typeof expected[rel] === 'string' ? expected[rel] : expected[rel][mode], `${mode} ${rel} SHA MATCH`);
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
      plugins: [{ name: 'companion-support-sword-shield-phaser', enforce: 'pre',
        resolveId(id) { if (id === 'phaser') return '\0companion-support-sword-shield-phaser'; },
        load(id) {
          if (id !== '\0companion-support-sword-shield-phaser') return;
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
      const suite = await server.ssrLoadModule('/src/companion-support-sword-shield.test.ts');
      const result = await suite.runCompanionSupportSwordShieldTests({ dataMode: mode });
      total += result.assertions;
      console.log(JSON.stringify({ suite: 'companion-support-sword-shield', dataMode: mode, dataRoot, assertions: result.assertions,
        passed: true, newOpenFlag: false, soft: false, release: false,
        hard: 'primary_area_and_support+sword_shield+N2+MP30+CD30000+buff60000+damageReduce0.05+forbidEmit+41-47unchanged' }));
    } finally {
      await server.close();
    }
  }
} finally {
  for (const [file, sha] of before) assert.equal(await fileHash(file), sha, `自测不得改动 ${file}`);
}
console.log(`companion-support-sword-shield tests ok: ${total} assertions; shared/snapshot 两根；companions/skills/npcs/quests/features SHA 不变；无新 OpenFlag；≠soft≠release`);
