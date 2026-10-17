// Aggregate this window's production O table, isolated regression and preservation evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { smithServicesSoftOpenOutput, assertSmithServicesSoftOpenOutput } from './v06p1-smith-services-soft-open-output.mjs';
import { fileURLToPath } from 'node:url';
import { flagShas, expectedShas, closedOutDirs, checkSettlement } from './v06p1-smith-services-open-protection.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const tipFull = git('rev-parse', 'HEAD'), tip = git('rev-parse', '--short', 'HEAD');
const out = path.resolve(process.env.SMITH_SERVICES_OPEN_OUT ?? smithServicesSoftOpenOutput(root));
assertSmithServicesSoftOpenOutput(root, out);
for (const preserved of closedOutDirs)
  assert.ok(out !== preserved && !out.startsWith(preserved + path.sep), 'selfcheck cannot write preserved evidence');
const read = name => fs.readFile(path.join(out, name), 'utf8').then(JSON.parse);
const [evidence, regressions, fixture, protection, closed, servicesClosed, delivery] = await Promise.all([
  read('evidence.json'), read('regressions/regression-summary.json'),
  read('fixture-regression/evidence.json'), read('protection-check.json'),
  read('regressions/v06p1-smith-services-closed/evidence.json'),
  read('services-closed/evidence.json'), read('delivery-protection-check.json'),
]);
const required = {
  passed: true, smithServicesUiWired: true, smithServicesOpenFixtureTableExecuted: true,
  allOpenCasesPassed: true, o05FormalProductionSuccess: true, o09StaleForgeEnhanceBlocked: true,
  productionFormalPath: true, fixtureQualificationInjected: false, fixtureCarrierInstalled: false,
  singleGameSceneCurrentProgressBypassClaimed: false, lostCompletedEnchant: false,
  softOpenedSmithServicesUi: true, released: false, newOpenFlag: false,
  settlementUnchanged: true, fourFlagsPreserved: true, closedOutUnchanged: true,
  stringsDiskKeys: 1013, stringsSsrKeys: 1013, stringsSsrInjected43: false,
  GAME_PHASE: 5, gifts0: true, giftsFalseCount: 10,
};
for (const [key, expected] of Object.entries(required)) assert.equal(evidence[key], expected, `production hard gate ${key}`);
assert.equal(evidence.status, 'PASS', 'production table is fully PASS');
assert.equal(evidence.enhanceSha, expectedShas.enhance, 'authoritative enhance SHA');
assert.equal(evidence.stringsSha, expectedShas.strings, 'authoritative strings1013 SHA');
assert.equal(evidence.dataSha, expectedShas.data, 'authoritative data.ts SHA');
assert.deepEqual(evidence.flagShas, flagShas, 'all four authoritative formal Flag SHAs');
assert.deepEqual(evidence.blocked, {}, 'production table contains no blocked cases');

const caseIds = Array.from({ length: 11 }, (_, index) => `O${String(index + 1).padStart(2, '0')}`);
const checkCase = (row, label) => {
  assert.equal(row?.executed, true, `${label} executed`);
  assert.equal(row.passed, true, `${label} passed`);
  assert.ok(!row.blocked && !row.blockReason, `${label} has no blocker`);
  assert.ok(Array.isArray(row.evidenceKeys) && row.evidenceKeys.length > 0, `${label} trace keys present`);
};
assert.deepEqual(Object.keys(evidence.cases).sort(), caseIds, 'production O01–O11 complete');
for (const id of caseIds) checkCase(evidence.cases[id], id);
assert.ok(Array.isArray(evidence.graphs), 'production SSR graph records present');
assert.equal(evidence.graphs.length, 4, 'two roots each execute production and invalid-protect graphs');
const trace = new Map(), roots = {};
for (const mode of ['snapshot', 'shared']) {
  const formal = evidence.graphs.filter(row => row.dataMode === mode && row.invalidProtectMapping === false);
  const invalid = evidence.graphs.filter(row => row.dataMode === mode && row.invalidProtectMapping === true);
  assert.equal(formal.length, 1, `${mode} has one production graph`);
  assert.equal(invalid.length, 1, `${mode} has one isolated invalid-protect graph`);
  assert.deepEqual(Object.keys(formal[0].cases).sort(), caseIds, `${mode} all production cases executed`);
  for (const graph of [...formal, ...invalid]) {
    assert.equal(graph.stringsDiskKeys, 1013, `${mode} graph uses disk strings1013`);
    assert.equal(graph.stringsSsrInjected43, false, `${mode} graph has no SSR43 string injection`);
    assert.equal(graph.fourInitialGateFlags, true, `${mode} graph starts at four formal true flags`);
    const prefix = graph.invalidProtectMapping ? `${mode}-invalid-protect-mapping` : mode;
    for (const [id, row] of Object.entries(graph.cases)) {
      checkCase(row, `${prefix}/${id}`);
      assert.deepEqual(evidence.cases[id].evidence[prefix], row.evidence, `${prefix}/${id} full trace matches graph`);
      for (const key of row.evidenceKeys) {
        const traced = `${prefix}/${key}`;
        assert.ok(!trace.has(traced), `unique evidence trace ${traced}`);
        trace.set(traced, { mode, graph: graph.graph, case: id });
        assert.ok(evidence.cases[id].evidenceKeys.includes(traced), `${traced} retained by aggregate`);
      }
    }
  }
  const o05 = formal[0].cases.O05.evidence, o09 = formal[0].cases.O09.evidence;
  for (const [key, expected] of Object.entries({ productionFormalPath: true, o05FormalProductionSuccess: true,
    fixtureQualificationInjected: false, fixtureCarrierInstalled: false })) assert.equal(o05[key], expected, `${mode}/O05 ${key}`);
  assert.equal(o05.formalProductionSuccess.result.state, 'committed', `${mode}/O05 committed result`);
  assert.equal(o05.formalProductionSuccess.result.destroyed, true, `${mode}/O05 actual complete destruction`);
  assert.equal(o05.formalProductionSuccess.destructionOutputReceiptSameTransaction, true, `${mode}/O05 atomic complete effect`);
  assert.equal(o09.o09StaleForgeEnhanceBlocked, true, `${mode}/O09 formal CAS safety`);
  assert.equal(o09.singleGameSceneCurrentProgressBypassClaimed, false, `${mode}/O09 no UI bypass claim`);
  assert.equal(o09.staleCrossObjectWritersBlocked.length, 2, `${mode}/O09 both old writers exercised`);
  for (const service of ['forge', 'enhance']) {
    const row = o09.staleCrossObjectWritersBlocked.find(item => item.scenario.includes(`stale-${service}-`));
    assert.ok(row, `${mode}/O09 old ${service} trace`);
    assert.equal(row.twoRealControllers, true, `${mode}/O09 real Controllers`);
    assert.equal(row.secondObjectSource, 'Progress.loadAsync(1)', `${mode}/O09 actual second Progress`);
    assert.equal(row.initialCompleteSnapshotsMatched, true, `${mode}/O09 no initial metadata conflict`);
    assert.equal(row.staleResult.allowed, false, `${mode}/O09 old ${service} rejected`);
    assert.equal(row.staleResult.tipKey, `${service}.fixture.stale`, `${mode}/O09 old ${service} stale`);
    assert.equal(row.lostCompletedEnchant, false, `${mode}/O09 enchant retained`);
    assert.equal(row.restoredSpentStones, false, `${mode}/O09 spent stones retained`);
    assert.equal(row.safetyPassed, true, `${mode}/O09 safety passed`);
  }
  assert.ok(o09.salvageCompetition.some(row => row.finalStorageSnapshotCas && row.accepted === 1
    && row.rejected === 1 && row.writes === 1 && row.safetyPassed), `${mode}/O09 simultaneous production salvage CAS`);
  roots[mode] = { productionGraph: formal[0].graph, invalidProtectGraph: invalid[0].graph,
    assertions: formal[0].assertions + invalid[0].assertions, allElevenCasesPassed: true,
    o05FormalProductionSuccess: true, o09StaleForgeEnhanceBlocked: true };
}
for (const [id, row] of Object.entries(evidence.cases)) {
  for (const key of row.evidenceKeys) assert.equal(trace.get(key)?.case, id, `${id} evidence key resolves: ${key}`);
  for (const mode of ['snapshot', 'shared']) assert.ok(row.evidenceKeys.some(key => key.startsWith(`${mode}/`)), `${id} has ${mode} evidence`);
}

const expectedRegressions = ['v06p1-smith-services-closed', 'v06p1-attr-ui-closed',
  'v06p1-attr-ui-binding-success', 'v06p1-attr-ui-map-api', 'v06p1-attr-ui-map-services',
  'v06p1-forge-closed', 'v06p1-enhance-closed', 'v06p1-enchant-closed', 'v06p1-salvage-closed',
  'v06p1-forge-open', 'v06p1-enhance-open', 'v06p1-enchant-open', 'v06p1-salvage-open',
  'v06p1-market-closed', 'v06p1-market-open', 'v06b-closed', 'v06b-open',
  'v06c-closed', 'v06c-open', 'v06d-closed', 'v06d-open', 'save-slots'];
assert.equal(regressions.passed, true, 'all required regressions passed');
assert.equal(regressions.results.length, 22, 'all 22 regression suites ran');
assert.deepEqual(regressions.results.map(row => row.name).sort(), expectedRegressions.sort(), 'complete regression suite names without duplication');
for (const row of regressions.results) assert.equal(row.exitCode, 0, `${row.name} exit zero`);
assert.equal(fixture.passed, true, 'fixture companion regression passed');
assert.equal(fixture.isolatedFixtureRegressionOnly, true, 'fixture companion only supplies isolated regression');
assert.equal(fixture.productionO05Claimed, false, 'fixture companion cannot authorize production O05');
assert.equal(fixture.softOpenedSmithServicesUi, true, 'fixture records the authorized delivery evidence bit, independently of graph flags');
for (const key of ['released', 'newOpenFlag']) assert.equal(fixture[key], false, `fixture ${key}`);

// Delivery authorization is independent of the injected closed graph values.
for (const [name, row] of [['closed', closed], ['services-closed', servicesClosed]]) {
  for (const [key, expected] of Object.entries({ passed: true, softOpenedSmithServicesUi: true,
    released: false, newOpenFlag: false, localStorageWrites: 0, indexedDbOpens: 0,
    sentinelCalls: 0 })) assert.equal(row[key], expected, `${name} ${key}`);
  assert.deepEqual(Object.keys(row.cases).sort(), Array.from({ length: 11 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`), `${name} C01–C11 complete`);
  for (const [id, value] of Object.entries(row.cases)) checkCase(value, `${name}/${id}`);
}
for (const key of ['submitCalls', 'settlementRandomCalls', 'fullBusinessStateDelta'])
  assert.equal(closed[key], 0, `closed zero-write ${key}`);
assert.equal(servicesClosed.storageWrites, 0, 'services-closed has zero service writes');
assert.equal(delivery.passed, true, 'all source, table and historical artifact bytes preserved');
for (const key of ['productionSourcesMatch', 'allTablesMatch', 'oldArtifactsMatch', 'flagMatch'])
  assert.equal(delivery[key], true, `delivery ${key}`);

const audits = await Promise.all(['tsc', 'datalint-shared', 'datalint-snapshot', 'diff-check'].map(async name => {
  const row = await read(`audit/${name}.result.json`);
  assert.equal(row.exitCode, 0, `${name} exit zero`);
  if (name.startsWith('datalint')) assert.equal(row.zeroProblems, true, `${name} has zero problems`);
  return { name, ...row };
}));
assert.equal(protection.passed, true, 'preservation check passed');
assert.equal(protection.closedOutUnchanged, true, 'all preserved old outputs unchanged');
assert.equal(protection.settlementUnchanged, true, 'four canonical settlement callbacks unchanged');
const currentCallbacks = await checkSettlement();
for (const [family, expectedSha] of Object.entries(flagShas)) {
  assert.equal(evidence.fourFlagMatch[family], 'MATCH', `${family} evidence Flag SHA MATCH`);
  assert.equal(protection.fourFlagMatch[family], 'MATCH', `${family} protection Flag SHA MATCH`);
  const callback = protection.settlementCallbacks[family];
  assert.equal(callback.match, true, `${family} callback MATCH`);
  assert.equal(callback.currentSha, callback.baselineSha, `${family} callback hash equality`);
  assert.deepEqual(callback, currentCallbacks[family], `${family} callback protection is current`);
  const actualFlagSha = createHash('sha256').update(await fs.readFile(path.join(root, `src/${family}OpenFlag.ts`))).digest('hex');
  assert.equal(actualFlagSha, expectedSha, `${family} current formal Flag bytes`);
}
for (const mode of ['snapshot', 'shared']) {
  const row = protection.roots[mode];
  assert.equal(row.enhanceSha, expectedShas.enhance, `${mode} enhance frozen SHA`);
  assert.equal(row.stringsSha, expectedShas.strings, `${mode} strings1013 frozen SHA`);
  assert.equal(row.stringsDiskKeys, 1013, `${mode} strings count`);
  assert.equal(row.stringsSsrInjected43, false, `${mode} no SSR strings injection`);
  assert.equal(row.GAME_PHASE, 5, `${mode} GAME_PHASE`);
  assert.equal(row.gifts0, true, `${mode} gifts0`);
  assert.equal(row.giftsFalseCount, 10, `${mode} gifts 10 false`);
}
const readonlyUi = [];
for (const file of ['src/SmithServicesController.ts', 'src/SmithServicesPanel.ts', 'src/scenes/GameScene.ts']) {
  const expectedSha = createHash('sha256').update(execFileSync('git', ['show', `39d006d:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })).digest('hex');
  const actualSha = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  assert.equal(actualSha, expectedSha, `interface owner file remains byte-identical to 39d006d: ${file}`);
  readonlyUi.push({ file, baseline: '39d006d', expectedSha, actualSha, match: true });
}
const count = (value, label) => {
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} is a recorded nonnegative assertion count`);
  return value;
};
const openAssertions = count(evidence.assertions, 'production assertions');
assert.equal(openAssertions, evidence.graphs.reduce((sum, graph) => sum + count(graph.assertions, 'graph assertions'), 0), 'production assertion sum matches graphs');
const fixtureRegressionAssertions = count(fixture.assertions, 'fixture regression assertions');
const regressionAssertions = regressions.results.reduce((sum, row) => sum + (row.assertions == null ? 0 : count(row.assertions, `${row.name} assertions`)), 0);
assert.equal(regressionAssertions, regressions.totalAssertions, 'regression assertion sum matches reported total');
const summary = {
  passed: true, completeOpenSuccess: true, generatedAt: new Date().toISOString(),
  tip, tipFull, evidenceTip: evidence.tip, evidenceTipFull: evidence.tipFull, outDir: out,
  evidenceFlags: required, allOpenCasesPassed: true, roots,
  memoryClosed: { passed: true, closedAssertions: closed.assertions, servicesClosedAssertions: servicesClosed.assertions,
    serviceWrites: 0, evidenceBitIsNotProductionFlag: true },
  deliveryProtection: { passed: true, productionSourcesMatch: true, allTablesMatch: true, oldArtifactsMatch: true },
  openAssertions, fixtureRegressionAssertions, regressionAssertions,
  totalAssertionsLowerBound: openAssertions + fixtureRegressionAssertions + regressionAssertions,
  assertionCountPolicy: 'Counts come from current evidence and suite reports, never fixed constants. Missing printed counts contribute zero; v06b component totals omit unreported outer checks, so the total is a lower bound.',
  regressions: regressions.results.map(({ name, exitCode, assertions }) => ({ name, exitCode, assertions })),
  audits, protectionCheck: 'protection-check.json', settlementCallbacks: currentCallbacks, readonlyUi,
  oTable: Object.fromEntries(caseIds.map(id => [id, { executed: true, passed: true, evidenceKeys: evidence.cases[id].evidenceKeys }])),
  fixtureCompanion: { passed: true, isolatedFixtureRegressionOnly: true, productionO05Claimed: false,
    evidence: 'fixture-regression/evidence.json', assertions: fixtureRegressionAssertions },
  softOpenedSmithServicesUi: true, released: false, newOpenFlag: false, notRelease: true, notReleasePack: true,
  scope: '本窗=完整炼器服务 UI soft-open preamble 程序自检；≠ release ≠ 进包 ≠ 发版；交接引子配合及独立执法 soft smoke，本窗不代执法、不 fan-out',
};
await fs.writeFile(path.join(out, 'selfcheck-summary.json'), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(out, 'validation.json'), JSON.stringify({ ...summary, ...required,
  fourFlagMatch: evidence.fourFlagMatch, enhanceSha: evidence.enhanceSha, stringsSha: evidence.stringsSha }, null, 2) + '\n');
await fs.writeFile(path.join(out, 'PASS'), 'PASS: authorized soft-open preamble selfcheck; independent enforcement soft smoke pending; not release or pack.\n');
console.log(JSON.stringify({ passed: true, allOpenCasesPassed: true, openAssertions, fixtureRegressionAssertions,
  regressionAssertions, totalAssertionsLowerBound: summary.totalAssertionsLowerBound,
  regressionSuites: regressions.results.length, softOpenedSmithServicesUi: true, released: false, newOpenFlag: false, notRelease: true, outDir: out }));
