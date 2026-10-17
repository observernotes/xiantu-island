import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), dataRoot = path.join(root, 'data');
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')));
const diskStrings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const legacyStrings = { ...diskStrings };
const removedKeys = Object.keys(legacyStrings).filter(key => key.startsWith('ui.equip.inst.'));
for (const key of removedKeys) delete legacyStrings[key];
if (Object.keys(diskStrings).length !== 970 || removedKeys.length !== 10 || Object.keys(legacyStrings).length !== 960) throw new Error('Unexpected string isolation input');
const isolation = { stringsDiskKeys: 970, stringsSsrLegacyKeys: 960, stringsSsrRemovedKeys: removedKeys, diskWrites: 0, historicalRegressionOnly: true, softOpenedSmithServicesUi: false, released: false };
const evidence = [];
for (const service of ['enhance']) {
  const title = service[0].toUpperCase() + service.slice(1);
  let payloads;
  for (const [openFixture, refresh] of [[true, false], [false, false], [true, true], [false, true]]) {
    const phaserId = '\0smith-gate-regression-phaser', flagId = '\0smith-gate-regression-closed', stringsId = '\0smith-gate-regression-strings960';
    const server = await createServer({ root, configFile: false,
      optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@xt': dataRoot } }, server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom', logLevel: 'error', ssr: { noExternal: ['phaser'] },
      plugins: [{name:'smith-gate-runtime', enforce:'pre', resolveId(id) {
        if (id === 'phaser') return phaserId;
        if (/(?:^|\/)strings_zh\.json$/.test(id)) return stringsId;
        if (!openFixture && new RegExp('(?:^|/)' + title + 'OpenFlag(?:\\.ts)?$').test(id)) return flagId;
      }, load(id) {
        if (id === stringsId) return 'export default ' + JSON.stringify(legacyStrings);
        if (id === flagId) return `export function is${title}OpenForFixture() { return false; }`;
        if (id === phaserId) return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 }, Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} }, Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }, Input: { Keyboard: { JustDown: key => { const down = !!key?._justDown; if (key) key._justDown = false; return down; } } }, Math: { Clamp: (value,min,max) => Math.min(max,Math.max(min,value)), Linear: (from,to,amount) => from+(to-from)*amount } };`;
      }}]
    });
    const graph = openFixture ? 'formal-open' : 'memory-closed';
    try {
      const mod = await server.ssrLoadModule(`/src/v06p1-${service}-open.test.ts`);
      const result = await mod[`run${title}OpenFixtureTests`]({ openFixture, dataMode: 'snapshot', refreshPayloads: refresh ? payloads : null });
      if (openFixture && !refresh) payloads = result.payloads;
      const { payloads: savedPayloads, ...summary } = result;
      const row = { service, graph, refresh, passed: true, isolation, result: summary };
      evidence.push(row); console.log(JSON.stringify({service,graph,refresh,passed:true,assertions:result.assertions}));
    } catch (error) {
      evidence.push({ service, graph, refresh, isolation, passed:false, error:String(error.stack ?? error) });
      console.log(JSON.stringify({ service, graph, refresh, passed:false, error:String(error) }));
      break;
    } finally { await server.close(); }
  }
}
await fs.writeFile(path.join(root,'qa/out_v06p1_smith_services_closed/regressions/enhance-gate-runtime-isolated-evidence.json'), JSON.stringify(evidence,null,2)+'\n');
if (evidence.some(row => !row.passed)) process.exitCode = 1;
