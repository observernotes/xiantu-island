// timeout 60s node scripts/secret-nest-min-loop-test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedRel = [
  'balance/secret_rooms.json',
  'balance/monsters.json',
  'balance/drops.json',
  'balance/quests.json',
  'balance/fly_zones.json',
  'features.json',
];
const before = new Map();
for (const [, dataRoot] of modes) {
  for (const rel of protectedRel) {
    const file = path.join(dataRoot, rel);
    try { before.set(file, hash(await fs.readFile(file))); }
    catch (error) { if (error.code === 'ENOENT') before.set(file, null); else throw error; }
  }
}
const expected = {
  'balance/secret_rooms.json': {
    shared: null, // shared root may differ; snapshot = 现网
    snapshot: 'edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4',
  },
  'balance/monsters.json': '4a6f9b4ec8d95b10f86ed46598775be4a294b9b2689d72f587ef323d07971521',
  'balance/drops.json': '72147189e2bec55a08b94fad8b54c2460b4ca65a85a52aac7f5b6f369d73f233',
};

let total = 0;
for (const [mode, dataRoot] of modes) {
  for (const [rel, want] of Object.entries(expected)) {
    const file = path.join(dataRoot, rel);
    const got = hash(await fs.readFile(file));
    if (typeof want === 'string') assert.equal(got, want, `${mode} ${rel}`);
    else if (want[mode]) assert.equal(got, want[mode], `${mode} ${rel}`);
  }
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'secret-nest-min-loop-phaser', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0secret-nest-phaser'; },
      load(id) {
        if (id !== '\0secret-nest-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {},
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: () => false } } };`;
      },
    }],
    ssr: { noExternal: ['phaser'] },
  });
  try {
    const suite = await server.ssrLoadModule('/src/secret-nest-min-loop.test.ts');
    const result = await suite.runSecretNestMinLoopTests({ dataMode: mode });
    total += result.assertions;
    console.log(JSON.stringify({ suite: 'secret-nest-min-loop', dataMode: mode, assertions: result.assertions, passed: true,
      newOpenFlag: false, soft: false, release: false }));
  } finally {
    await server.close();
  }
}
for (const [file, sha] of before) {
  if (sha === null) continue;
  assert.equal(hash(await fs.readFile(file)), sha, `自测不得改动 ${file}`);
}
console.log(`secret-nest-min-loop tests ok: ${total} assertions; 无新 OpenFlag；secret_rooms/monsters/drops SHA 不变`);
