// Aggregate independently produced O01-O11, regression and preservation evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'qa/out_v06p1_smith_services_open_fixture');
const read = name => fs.readFile(path.join(out, name), 'utf8').then(JSON.parse);
const evidence = await read('evidence.json');
const suite = await read('smith-services-open-result.json');
const regressions = await read('regressions/regression-summary.json');
const protection = await read('protection-check.json');
const required = {
  smithServicesUiWired: true,
  smithServicesOpenFixtureTableExecuted: true,
  softOpenedSmithServicesUi: false,
  released: false,
  newOpenFlag: false,
  settlementUnchanged: true,
  stringsSsrInjected43: false,
};
for (const [key, expected] of Object.entries(required)) assert.equal(evidence[key], expected, `hard evidence gate ${key}`);
assert.equal(suite.passed, true, 'open fixture suite passed');
assert.equal(regressions.passed, true, 'all required regressions passed');
assert.equal(protection.passed, true, 'preservation and frozen-byte checks passed');
const cases = evidence.cases ?? suite.cases;
const evidenceRows = evidence.evidence;
assert.ok(Array.isArray(evidenceRows), 'executed evidence rows present');
const labels = new Set(evidenceRows.map(row => row.label));
const expectedIds = Array.from({ length: 11 }, (_, i) => `O${String(i + 1).padStart(2, '0')}`);
assert.deepEqual(Object.keys(cases).sort(), expectedIds, 'all eleven O cases present');
for (const id of expectedIds) {
  assert.equal(cases[id].executed, true, `${id} executed`);
  assert.ok(cases[id].evidenceKeys.length > 0, `${id} has traceable evidenceKeys`);
  for (const key of cases[id].evidenceKeys) assert.ok(labels.has(key), `${id} evidenceKey resolves: ${key}`);
  assert.ok(cases[id].assertions > 0, `${id} contains real assertions`);
  if (id === 'O05' && cases[id].status === 'blocked') {
    assert.equal(cases[id].passed, false, 'blocked O05 cannot count as success');
    assert.ok(cases[id].blockReason, 'blocked O05 has explicit reason');
  } else assert.equal(cases[id].passed, true, `${id} passed`);
}
if (cases.O05.status !== 'blocked') assert.ok(evidenceRows.some(row => row.case === 'O05'
  && (row.result?.destroyed === true || row.completeGateReturn?.result?.destroyed === true)), 'O05 success requires actual full destroyed result');
const audits = await Promise.all(['tsc', 'datalint-shared', 'datalint-snapshot', 'diff-check'].map(async name => {
  const row = await read(`audit/${name}.result.json`);
  assert.equal(row.exitCode, 0, `${name} exit zero`);
  return { name, ...row };
}));
const baseline = await read('baseline.json');
assert.equal(baseline.baselineHas7b06f5a, true);
const readonlyUi = [];
for (const [file, expectedSha] of Object.entries(baseline.userUiFilesReadonly)) {
  const actualSha = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  assert.equal(actualSha, expectedSha, 'interface owner file remains byte-identical: ' + file);
  readonlyUi.push({ file, expectedSha, actualSha, match: true });
}
const o05BlockReason = cases.O05.status === 'blocked' ? cases.O05.blockReason : null;
const summary = {
  passed: true,
  completeOpenSuccess: !o05BlockReason,
  generatedAt: new Date().toISOString(),
  baselineHas7b06f5a: baseline.baselineHas7b06f5a,
  evidenceFlags: required,
  oTableAssertCounts: Object.fromEntries(expectedIds.map(id => [id, cases[id].assertions ?? cases[id].assertCount ?? null])),
  openAssertions: suite.assertions,
  regressionAssertions: regressions.totalAssertions,
  totalAssertions: suite.assertions + regressions.totalAssertions,
  assertionCountPolicy: 'Recorded assertions; v06b counts sum printed component totals and exclude unreported outer static checks. Overall count is a lower bound.',
  regressions: regressions.results.map(({ name, exitCode, assertions }) => ({ name, exitCode, assertions })),
  audits,
  protectionCheck: 'protection-check.json',
  readonlyUi,
  cases,
  o05BlockReason,
  notSoftOpenReleasePack: true,
  scope: '本窗=完整炼器服务 UI 开态夹具全表 ≠ soft-open ≠ release ≠ 进包',
};
await fs.writeFile(path.join(out, 'selfcheck-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, totalAssertions: summary.totalAssertions, o05BlockReason, notSoftOpenReleasePack: true }));
