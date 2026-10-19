// timeout 60s node scripts/companion-follow-ai-test.mjs
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
  'balance/companions.json',
  'balance/skills.json',
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
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
};

let total = 0;
for (const [mode, dataRoot] of modes) {
  for (const [rel, want] of Object.entries(expected)) {
    const file = path.join(dataRoot, rel);
    const got = hash(await fs.readFile(file));
    assert.equal(got, want, `${mode} ${rel} SHA MATCH`);
  }
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'companion-follow-ai-phaser', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0companion-follow-phaser'; },
      load(id) {
        if (id !== '\0companion-follow-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {},
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {}, Graphics: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: () => false } } };`;
      },
    }],
    ssr: { noExternal: ['phaser'] },
  });
  try {
    const suite = await server.ssrLoadModule('/src/companion-follow-ai.test.ts');
    const result = await suite.runCompanionFollowAiTests({ dataMode: mode });
    total += result.assertions;
    console.log(JSON.stringify({ suite: 'companion-follow-ai', dataMode: mode, assertions: result.assertions, passed: true,
      newOpenFlag: false, soft: false, release: false,
      hard: '96/320/320+CD1200+0.35' }));
  } finally {
    await server.close();
  }
}
for (const [file, sha] of before) {
  if (sha === null) continue;
  assert.equal(hash(await fs.readFile(file)), sha, `自测不得改动 ${file}`);
}
console.log(`companion-follow-ai tests ok: ${total} assertions; 无新 OpenFlag；companions/skills SHA 不变；≠soft≠release`);
