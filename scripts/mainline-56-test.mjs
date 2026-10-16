// 无浏览器、无监听端口：两种数据根均调用真实任务/场景方法，仅替换 Phaser 渲染容器。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['snapshot', path.join(root, 'data')]];
try { modes.push(['shared', sharedRoot(root)]); }
catch { /* 独立快照工程没有共享目录。 */ }
const featurePaths = new Set([path.join(root, 'data/features.json'), ...modes.map(([, dataRoot]) => path.join(dataRoot, 'features.json'))]);
const featureHash = async file => {
  try { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const featuresBefore = await Promise.all([...featurePaths].map(async file => [file, await featureHash(file)]));
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const displayKeys = ['nameKey', 'descriptionKey', 'dialogueKeys'];
let snapshotTargets;

try {
  for (const [mode, dataRoot] of modes) {
    const [quests, npcs, strings] = await Promise.all(['quests', 'npcs', 'strings_zh'].map(name => readJson(path.join(dataRoot, 'balance', `${name}.json`))));
    const targets = ['q_elder_exam', 'q_main_06'].map(id => {
      const q = quests.find(candidate => candidate.id === id);
      assert(q, `${mode}: 缺少 ${id}`);
      const keys = [q.nameKey, q.descriptionKey, ...Object.values(q.dialogueKeys ?? {})];
      assert.equal(keys.length, 5, `${mode}: ${id} 应有五个展示 key`);
      return { id, display: Object.fromEntries(displayKeys.map(key => [key, q[key]])), strings: Object.fromEntries(keys.map(key => [key, strings[key]])) };
    });
    if (snapshotTargets) assert.deepEqual(targets, snapshotTargets, '共享与tip快照的两章展示字段、十个strings须同步');
    else snapshotTargets = targets;
    for (const [npcId, questId] of [['tianjian_elder', 'q_elder_exam'], ['hunter_lei', 'q_main_06']]) {
      assert(npcs.find(npc => npc.id === npcId)?.quests.includes(questId), `${mode}: ${npcId}.quests 必须挂载 ${questId}`);
    }
    for (const npc of npcs) if (npc.affinity?.gifts) {
      assert.equal(npc.affinity.gifts.enabled, false, `${mode}: ${npc.id} gifts 继续关闭`);
    }
    const server = await createServer({
      root, configFile: false,
      resolve: { alias: { '@xt': dataRoot } },
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom', logLevel: 'error',
      plugins: [{ name: 'mainline-56-render-stub', enforce: 'pre',
        resolveId(id) { if (id === 'phaser') return '\0mainline-56-phaser'; },
        load(id) {
          if (id !== '\0mainline-56-phaser') return;
          return `class Sprite {} export default { WEBGL: 2, Scene: class {},
            Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
            Scenes: { Events: { SHUTDOWN: 'shutdown' } },
            Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } } };`;
        },
      }], ssr: { noExternal: ['phaser'] },
    });
    try {
      await server.ssrLoadModule('/src/mainline-56.test.ts');
      console.log(JSON.stringify({ suite: 'mainline-56', dataMode: mode, passed: true }));
    } finally { await server.close(); }
  }
} finally {
  for (const [file, before] of featuresBefore) {
    assert.equal(await featureHash(file), before, `主线5–6章自测不得改动 ${file}`);
  }
}
