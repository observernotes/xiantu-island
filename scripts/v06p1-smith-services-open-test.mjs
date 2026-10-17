// Execute design/32 O01–O11 in isolated SSR graphs with real disk tables and canonical APIs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { checkProtection, snapshotProtection, root, shared, implementationBaseline, expectedShas, flagShas, closedOutDirs } from './v06p1-smith-services-open-protection.mjs';

const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const tipFull = git('rev-parse', 'HEAD'), tip = git('rev-parse', '--short', 'HEAD');
const out = path.resolve(process.env.SMITH_SERVICES_OPEN_OUT ?? process.env.OUT_DIR ?? path.join(root, `qa/out_v06p1_smith_services_open_${tip}`));
for (const closed of closedOutDirs)
  assert.ok(out !== closed && !out.startsWith(`${closed}${path.sep}`), 'open evidence cannot overwrite a preserved closed out');
const families = Object.keys(flagShas), services = ['forge', 'enhance', 'enchant', 'salvage'];
const phaserStub = `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
  Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  Input: { Keyboard: { JustDown: key => { const down = !!key?._justDown; if (key) key._justDown = false; return down; } } },
  Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Linear: (from, to, amount) => from + (to - from) * amount } };`;
let executionPassed = false, failure, protection, startupBaseline;
const before = await snapshotProtection();
const startupFile = process.env.SMITH_SERVICES_OPEN_BASELINE ?? '/tmp/smith-services-open-before.json';
try { startupBaseline = JSON.parse(await fs.readFile(startupFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'protection-before.json'), `${JSON.stringify(before, null, 2)}\n`);
const graphs = [], cases = {};
const oldAccess = Object.getOwnPropertyDescriptor(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__');

function mergeCases(result, keyPrefix) {
  for (const [id, record] of Object.entries(result.cases)) {
    const old = cases[id], keys = record.evidenceKeys.map(key => `${keyPrefix}/${key}`);
    const next = { ...record, evidenceKeys: keys, evidence: { [keyPrefix]: record.evidence ?? {} } };
    cases[id] = old ? { executed: old.executed && next.executed, passed: old.passed && next.passed,
      ...(old.blocked || next.blocked ? { blocked: [...new Set([old.blocked, next.blocked].filter(Boolean))].join('; ') } : {}),
      evidenceKeys: [...old.evidenceKeys, ...keys], evidence: { ...old.evidence, ...next.evidence } } : next;
  }
}

async function runGraph(dataMode, dataRoot, invalidProtectMapping = false) {
  const transformedFlags = {};
  let transformedProtectMapping = 0;
  const graphName = `${dataMode}-${invalidProtectMapping ? 'invalid-protect-mapping-' : ''}real-ssr`;
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    ssr: { noExternal: ['phaser'] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'smith-services-open-isolated-renderer-and-closure', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0smith-open-phaser'; },
      load(id) { if (id === '\0smith-open-phaser') return phaserStub; },
      transform(source, id) {
        if (invalidProtectMapping && id.endsWith('/balance/enhance_protect_charm.json')) {
          transformedProtectMapping++;
          return JSON.stringify({ itemId: '__unmapped_protect_charm__', countPerSettlement: 1 });
        }
        const family = families.find(name => id.endsWith(`/src/${name}OpenFlag.ts`));
        if (!family) return;
        assert.match(source, /return true;/u, `${family}: isolated closure starts from original formal true`);
        transformedFlags[family] = (transformedFlags[family] ?? 0) + 1;
        // Only this isolated SSR graph gains a false override for O11. Disk and production stay byte-identical.
        return `let __smithOpenFixtureValue = true;\n${source.replace('return true;', 'return __smithOpenFixtureValue;')}\nexport function __setOpen(value) { __smithOpenFixtureValue = value; }`;
      },
    }],
  });
  try {
    const flags = {};
    for (const family of families) {
      flags[family] = await server.ssrLoadModule(`/src/${family}OpenFlag.ts`);
      assert.equal(flags[family][`is${family}OpenForFixture`](), true, `${dataMode}/${family}: formal flag initially true`);
    }
    const controls = {
      setRoute(value = {}) {
        const panels = value.panels && typeof value.panels === 'object' ? value.panels : {};
        globalThis.__XT_SMITH_SERVICES_UI_ACCESS__ = { ...value, ...panels };
      },
      setGate(name, value) {
        const family = families.find(family => family.toLowerCase() === name.toLowerCase());
        assert.ok(family, `known isolated Gate family ${name}`);
        flags[family].__setOpen(value);
      },
    };
    controls.setRoute({});
    const runtimeData = await server.ssrLoadModule('/src/data.ts');
    const runtimeStrings = await server.ssrLoadModule('@xt/balance/strings_zh.json');
    assert.equal(runtimeData.GAME_PHASE, 5, `${dataMode}: runtime GAME_PHASE=5`);
    assert.equal(Object.keys(runtimeStrings.default).length, 1013, `${dataMode}: runtime reads disk strings1013 without injection`);
    const suite = await server.ssrLoadModule(invalidProtectMapping
      ? '/src/v06p1-smith-services-open-gates.test.ts' : '/src/v06p1-smith-services-open.test.ts');
    const options = { dataMode, graph: graphName, controls, invalidProtectMapping };
    const raw = invalidProtectMapping ? await suite.runInvalidProtectMappingCase(options)
      : await suite.runSmithServicesOpenTests(options);
    const result = invalidProtectMapping ? { cases: raw.cases ?? (raw.O07 ? { O07: raw.O07 } : { O07: raw }), assertions: raw.assertions ?? 0 } : raw;
    if (invalidProtectMapping) assert.equal(transformedProtectMapping, 1, `${graphName}: precisely one in-memory invalid mapping injected`);
    // Every graph must restore injected closure so one case cannot conceal a production-default regression.
    assert.deepEqual(families.map(name => flags[name][`is${name}OpenForFixture`]()), [true, true, true, true], `${dataMode}: four flags restored after intentional closure`);
    controls.setRoute({});
    const graph = { dataMode, dataRoot, graph: graphName, ...result, transformedFlags, transformedProtectMapping,
      invalidProtectMapping,
      fourInitialGateFlags: true, stringsDiskKeys: 1013, stringsSsrInjected43: false,
      scopeInjection: 'isolated SSR false closures only; no production authorization injection' };
    graphs.push(graph);
    mergeCases(result, invalidProtectMapping ? `${dataMode}-invalid-protect-mapping` : dataMode);
  } finally { await server.close(); }
}

try {
  // Validate frozen authoritative bytes before running a single open action.
  await checkProtection(before, startupBaseline);
  for (const [dataMode, dataRoot] of [['snapshot', path.join(root, 'data')], ['shared', shared]]) {
    await runGraph(dataMode, dataRoot);
    await runGraph(dataMode, dataRoot, true);
  }
  assert.equal(Object.keys(cases).length, 11, 'O01–O11 each has evidence in both roots');
  assert.ok(Object.values(cases).every(record => record.executed && record.evidenceKeys.length > 0 && (record.passed || record.blocked)),
    'every O case executed and has PASS or explicit blocking evidence');
  executionPassed = true;
} catch (error) { failure = error; }
finally {
  try { protection = await checkProtection(before, startupBaseline); }
  catch (error) { executionPassed = false; failure ??= error; protection = { passed: false, error: String(error.stack ?? error) }; }
  if (oldAccess) Object.defineProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__', oldAccess);
  else delete globalThis.__XT_SMITH_SERVICES_UI_ACCESS__;
  const blocked = Object.fromEntries(Object.entries(cases).filter(([, record]) => record.blocked).map(([id, record]) => [id, record.blocked]));
  const evidence = { passed: executionPassed, status: executionPassed ? Object.keys(blocked).length ? 'PASS_WITH_BLOCKED_CASES' : 'PASS' : 'FAIL',
    allOpenCasesPassed: executionPassed && Object.values(cases).every(record => record.passed && !record.blocked),
    tip, tipFull, implementationBaseline, assertions: graphs.reduce((sum, graph) => sum + graph.assertions, 0),
    smithServicesUiWired: true, smithServicesOpenFixtureTableExecuted: executionPassed && Object.keys(cases).length === 11,
    softOpenedSmithServicesUi: false, released: false, newOpenFlag: false,
    settlementUnchanged: protection.passed === true, enhanceSha: expectedShas.enhance, flagShas,
    fourFlagsPreserved: protection.passed === true, fourFlagMatch: protection.fourFlagMatch,
    stringsDiskKeys: 1013, stringsSha: expectedShas.strings, stringsSsrInjected43: false, stringsSsrKeys: 1013,
    dataSha: expectedShas.data, GAME_PHASE: 5, gifts0: true, giftsFalseCount: 10,
    closedOutUnchanged: protection.closedOutUnchanged === true,
    managerEnforcementO01ToO11Pending: true, historicalCOTablesModified: false,
    fixtureOnly: true, noProductionAuthorizationInjection: true, cases, blocked, graphs,
    ...(failure ? { error: String(failure.stack ?? failure) } : {}) };
  await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify(protection, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'v06p1-smith-services-open-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'O01_O11.json'), `${JSON.stringify({ executed: evidence.smithServicesOpenFixtureTableExecuted, allOpenCasesPassed: evidence.allOpenCasesPassed, cases, blocked }, null, 2)}\n`);
  console.log(JSON.stringify({ passed: executionPassed, tip, tipFull, oTable: Object.fromEntries(Object.entries(cases).map(([id, row]) => [id, row.blocked ? 'BLOCKED' : row.passed ? 'PASS' : 'FAIL'])),
    softOpenedSmithServicesUi: false, released: false, newOpenFlag: false, outDir: out, blocked }));
}
if (failure) throw failure;
