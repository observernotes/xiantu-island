// 第二 forge 青钢 2B：正式开图消歧＋SSR 关态图零写；不经 enchant/salvage 陈旧 compat 链。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const out = process.env.FORGE_AZURE_WIRE_OUT ?? path.join(root, 'qa/out_forge_azure_steel_wire');
const recipesSha = '3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd';
const forgeOpenFlagSha = '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e';
const freeze = {
  'items.json': '0ea68e4b289b07fadb5d81516efc4796a102c3dbe14f793158a83aa41dd4e8e0',
  'materials.json': '1055536f181ae0a1f94d1a25e20473ea6f4be0b8289655dc4007c9c0295f6d4a',
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'spirit_rune.json': 'cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const eq = (a, e, m) => assert.deepEqual(a, e, m);
const ok = (v, m) => assert.ok(v, m);

await fs.mkdir(out, { recursive: true });
const evidence = [];

// 静态：recipes／冻结表／无新 OpenFlag
eq(hash(await fs.readFile(path.join(root, 'data/balance/recipes.json'))), recipesSha, 'wt recipes SHA=落表核');
eq(hash(await fs.readFile(path.join(shared, 'balance/recipes.json'))), recipesSha, 'shared recipes SHA=落表核');
eq(hash(await fs.readFile(path.join(root, 'src/ForgeOpenFlag.ts'))), forgeOpenFlagSha, 'ForgeOpenFlag 未改');
ok(!await fs.access(path.join(root, 'src/AzureSteelOpenFlag.ts')).then(() => true, () => false), '无新 AzureSteelOpenFlag');
ok(!await fs.access(path.join(root, 'src/ForgeAzureOpenFlag.ts')).then(() => true, () => false), '无新 ForgeAzureOpenFlag');
for (const [name, expected] of Object.entries(freeze)) {
  eq(hash(await fs.readFile(path.join(root, 'data/balance', name))), expected, `wt 冻结 ${name}`);
  eq(hash(await fs.readFile(path.join(shared, 'balance', name))), expected, `shared 冻结 ${name}`);
}
evidence.push({ static: true, recipesSha, forgeOpenFlagSha, freeze, newOpenFlag: false });

async function runGraph(openFixture) {
  const flagId = '\0forge-azure-wire-flag';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': path.join(root, 'data') } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{
      name: 'forge-azure-wire-flag', enforce: 'pre',
      resolveId(id) {
        if (!openFixture && /(?:^|\/)ForgeOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) return 'export function isForgeOpenForFixture() { return false; }';
      },
    }],
  });
  try {
    const suite = await server.ssrLoadModule('/src/forge-azure-steel-wire.test.ts');
    const result = await suite.runForgeAzureSteelWireTests({ openFixture });
    ok(result.assertions > 0, 'assertions executed');
    evidence.push({ graph: openFixture ? 'formal-open' : 'memory-closed', ...result });
    return result;
  } finally {
    await server.close();
  }
}

const opened = await runGraph(true);
const closed = await runGraph(false);
eq(opened.recipesForgeCount, 2, '开图 forge=2');
eq(closed.closedZeroSideEffect, true, '关态零副作用');
eq(opened.newOpenFlag, false, '无新 OpenFlag');
eq(closed.softOpen, false, '≠soft');
eq(closed.release, false, '≠release');

await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify({
  passed: true, recipesSha, forgeOpenFlagSha, freeze, evidence,
  softOpen: false, release: false, newOpenFlag: false, gamePhase: 5,
}, null, 2)}\n`);
console.log(`forge-azure-steel-wire ok: openAssertions=${opened.assertions} closedAssertions=${closed.assertions}; recipesSHA=${recipesSha.slice(0, 8)}…; newOpenFlag=false; ≠soft≠release; GAME_PHASE=5`);
