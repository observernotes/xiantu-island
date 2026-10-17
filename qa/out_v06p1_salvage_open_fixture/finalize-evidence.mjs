import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const checks = [];
for (const [name, command, args] of [
  ['tsc', 'npx', ['tsc', '--noEmit']],
  ['diff-check', 'git', ['diff', '--check']],
  ['protection', 'python3', [path.join(out, 'protection.py'), 'check']],
]) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  fs.writeFileSync(path.join(out, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''));
  const row = { name, command: [command, ...args], cwd: root, stdin: '/dev/null', startedAt,
    finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal };
  write(name + '.result.json', row); checks.push(row);
  assert.equal(result.status, 0, name + ' exit 0');
}
const open = read('v06p1-salvage-open-evidence.json');
const regressions = read('regressions/regression-summary.json');
assert.equal(open.passed, true); assert.equal(regressions.passed, true);
assert.equal(open.formalClosedGraphCount, 4);
assert.equal(open.formalGraph.SalvageOpenFlag, false);
assert.equal(open.formalGraph.flagLoads, 0); assert.equal(open.memoryOpenGraph.flagLoads, 1);
for (const name of ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08']) assert.equal(open.cases[name].executed, true, name);
const expected = {
  salvageClosedTipsWired: true, refineStoneMapped: true, salvageOpenFixtureTableExecuted: true,
  formalInstanceSource: true, softOpenedSalvage: false, SalvageOpenFlag: false, released: false,
  enchantSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true, protectCharmSoftOpenPreserved: true,
};
for (const [key, value] of Object.entries(expected)) assert.equal(open[key], value, key);
for (const mode of ['shared', 'snapshot']) {
  const result = read('regressions/datalint-' + mode + '.result.json');
  assert.equal(result.exitCode, 0); checks.push(result);
}
const protection = read('protection-check.json'); assert.equal(protection.passed, true);
const sourceShas = Object.fromEntries(['src/SalvageGate.ts', 'src/SalvageProgress.ts', 'src/Progress.ts',
  'src/SalvageOpenFlag.ts', 'src/v06p1-salvage-open.test.ts', 'scripts/v06p1-salvage-open-test.mjs', 'package.json']
  .map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
write('evidence-check.json', { passed: true, expected, actual: Object.fromEntries(Object.keys(expected).map(key => [key, open[key]])),
  cases: open.cases, formalGraph: open.formalGraph, memoryOpenGraph: open.memoryOpenGraph,
  freshSsrRoundtrip: open.freshSsrRoundtrip, protectionMatched: protection.passed,
  fixtureCarrier: 'Explicit single-SSR backend only; default has no qualification or atomic carrier and refuses writes.',
  boundary: open.boundary });
write('selfcheck-summary.json', { passed: true, baseline: '29ddb7f54deb6c1439397b5d2e7c438639ceff5c',
  cwd: root, stdin: '/dev/null', ...expected, openAssertions: open.assertions,
  regressionAssertions: regressions.totalAssertions, totalAssertions: open.assertions + regressions.totalAssertions,
  graphCount: open.graphCount, cases: open.cases, checks, regressions: regressions.results,
  sourceShas, protectionFileCount: protection.protectedFileCount,
  notRun: ['snapshot', 'build', 'sync', 'release', 'Pages'],
  codexLog: read('codex-log-reference.json').log, boundary: open.boundary });
console.log(JSON.stringify({ passed: true, openAssertions: open.assertions, regressionAssertions: regressions.totalAssertions,
  totalAssertions: open.assertions + regressions.totalAssertions, graphCount: open.graphCount, ...expected }));
