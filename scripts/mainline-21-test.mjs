// timeout 60s node scripts/mainline-21-test.mjs：只在内存中跑卷一主线与 tracker 断言。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const featurePaths = new Set([path.join(root, 'data/features.json')]);
try { featurePaths.add(path.join(sharedRoot(root), 'features.json')); }
catch { /* 独立快照工程没有共享目录。 */ }
const featureHash = async file => {
  try { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const featuresBefore = await Promise.all([...featurePaths].map(async file => [file, await featureHash(file)]));
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'mainline-21-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0mainline-21-phaser'; },
    load(id) {
      if (id !== '\0mainline-21-phaser') return;
      return `class Sprite {} export default { WEBGL: 2, Scene: class {},
        Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
        Scenes: { Events: { SHUTDOWN: 'shutdown' } },
        Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } } };`;
    },
  }], ssr: { noExternal: ['phaser'] },
});
try {
  await legacySaveFixture(server);
  await server.ssrLoadModule('/src/mainline-21.test.ts');
} finally {
  await server.close();
  for (const [file, before] of featuresBefore) {
    assert.equal(await featureHash(file), before, `主线自测不得改动 ${file}`);
  }
}
