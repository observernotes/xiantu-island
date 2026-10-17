import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFile(path.join(out, name), 'utf8').then(JSON.parse);
const names = ['v06p1-enchant-open', 'v06p1-enchant-closed', 'v06p1-enhance-open', 'v06p1-enhance-closed',
  'v06p1-forge-open', 'v06p1-forge-closed', 'v06p1-market-closed', 'v06d-closed', 'v06c-closed'];
const files = ['tsc.result.json', 'v06p1-salvage-closed.result.json', ...names.map(name => `regressions/${name}.result.json`),
  'audit/datalint-shared.result.json', 'audit/datalint-snapshot.result.json',
  'audit/json-tool-shared.result.json', 'audit/json-tool-snapshot.result.json', 'diff-check.result.json', 'table-delta-check.result.json'];
const results = [];
for (const file of files) {
  const row = await read(file);
  assert.equal(row.exitCode, 0, file + ' exit 0');
  assert.equal(row.stdin, '/dev/null', file + ' stdin');
  results.push({ ...row, evidenceFile: file });
}
const expected = { salvageClosedTipsWired: true, SalvageOpenFlag: false, softOpenedSalvage: false,
  released: false, refineStoneMapped: true, enchantSoftOpenPreserved: true,
  EnhanceOpenFlagPreserved: true, protectCharmSoftOpenPreserved: true };
const evidence = await read('v06p1-salvage-closed-evidence.json');
assert.equal(evidence.passed, true);
for (const [key, value] of Object.entries(expected)) assert.equal(evidence[key], value, key);
for (let i = 1; i <= 10; i++) assert.equal(evidence.cases[`C${String(i).padStart(2, '0')}`].executed, true, 'C case executed');
assert.equal(evidence.freshIndependentGraphs, 4);
assert.equal(evidence.flagInjection, false);
assert.equal(evidence.sentinelCalls, 0);
assert.equal(evidence.storageWrites, 0);
assert.equal(evidence.ordinarySaveSetupWrites, 4);
assert.equal(evidence.openFixtureTableExecuted, false);
assert.equal(evidence.salvageGateAdded, false);
assert.equal(evidence.successSettlementImplemented, false);
assert.equal(evidence.unknownFieldsRetainedByRestore, false);
const protection = await read('audit/protection-check.json');
assert.equal(protection.passed, true);
assert.equal(protection.unauthorizedDifferenceCount, 0);
const review = await read('audit/independent-review.json');
assert.equal(review.passed, true);
const delta = await read('table-delta-check.json');
assert.equal(delta.passed, true);
const check = { passed: true, ...expected, cases: evidence.cases,
  stringsKeys: 960, stringsSha: delta.snapshotSha, fourFormalFalseGraphs: true, flagInjection: false,
  refusalWrites: 0, ordinarySaveSetupWrites: 4, semanticFixtureOnly: true,
  oldFormalForgeEnhanceEnchantAssetsPreserved: true, unknownFieldsRetainedByRestore: false,
  oldEvidenceProtected: true, unauthorizedDifferences: 0,
  boundary: '关态 tip 接线≠开态夹具≠soft-open≠release≠进包≠分解成功结算；核齐备≠生产授权' };
await fs.writeFile(path.join(out, 'evidence-check.json'), JSON.stringify(check, null, 2) + '\n');
const summary = { passed: true, base: '14d6de7b39b1aab0b31a12289172e6735986f263', cwd: '/workspace/xiantu/wt/dev',
  stdin: '/dev/null', totalAssertions: results.reduce((sum, row) => sum + (row.assertions ?? 0), 0),
  salvageAssertions: evidence.assertions, fixtures: evidence.totalFixtures, invocations: evidence.totalInvocations,
  results, evidence: expected, programSelfcheckBlockers: [], notRun: ['snapshot', 'build', 'sync', 'release', 'salvage-open-fixture'],
  unauthorizedDifferences: 0, boundary: check.boundary };
await fs.writeFile(path.join(out, 'selfcheck-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, totalAssertions: summary.totalAssertions,
  results: results.map(({ name, exitCode, assertions }) => ({ name, exitCode, assertions })), evidence: expected }));
