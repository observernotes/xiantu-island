#!/usr/bin/env python3
"""Verify actual O-table execution, required checks, source identity and guards."""
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))
def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

flags = dict(protectCharmWired=True, protectCharmN=1, protectCharmOpenFixtureTableExecuted=True,
    formalTipsWired=True, formalInstanceSource=True, softOpenedEntrance=True,
    softOpenedFormalSettle=True, softOpenedProtectCharm=True, released=False)
opened, regression = read('open-summary.json'), read('regression-summary.json')
runtime, protection, audit = read('v06p1-enhance-open-evidence.json'), read('protection-check.json'), read('source-path-audit.json')
closed = read('regression/enhance-closed/v06p1-enhance-closed-evidence.json')
assert all(row['passed'] for row in [opened, regression, runtime, protection, audit])
assert all(row[k] == v for row in [runtime, opened, regression, protection] for k, v in flags.items())
assert closed['passed'] is True and closed['softOpenedProtectCharm'] is True and closed['released'] is False
assert closed['openFixtureTableExecuted'] is False
closed_graphs = [row for row in closed['evidence'] if row.get('graph')]
assert len(closed_graphs) == 6
assert sum(row['graph'] == 'formal-open' for row in closed_graphs) == 2
assert sum(row['graph'] == 'memory-closed' for row in closed_graphs) == 4
for row in closed_graphs:
    assert row['flagLoads'] == (0 if row['graph'] == 'formal-open' else 1)
    assert row['storageWrites'] == 0
    assert row['softOpenedProtectCharm'] is True and row['released'] is False
assert runtime['acceptanceDesign'] == 'design/28 §4.3 O01–O06'
cases = ['O01', 'O02', 'O03', 'O04', 'O05', 'O06']
graphs = [row for row in runtime['evidence'] if row.get('suite') == 'v06p1-enhance-open-graph']
assert len(graphs) == 28
assert sum(row['graph'] == 'formal-open' for row in graphs) == 22
assert sum(row['graph'] == 'memory-closed' for row in graphs) == 6
for row in graphs:
    assert row['flagLoads'] == (0 if row['graph'] == 'formal-open' else 1)
    assert row['featureOverrideCalls'] == 0
    assert row['softOpenedProtectCharm'] is True and row['released'] is False
    assert row['result']['softOpenedProtectCharm'] is True and row['result']['released'] is False
mains = [row for row in graphs if row['graph'] == 'formal-open' and not row['freshSsrRefresh'] and row['invalidTable'] is None]
assert sorted(row['dataMode'] for row in mains) == ['shared', 'snapshot']
executed = {}
for row in mains:
    table = row['result']['protectCharmOpenFixtureTable']
    assert table['cases'] == cases
    assert table['source'] == 'default-ForgeGate-committed-result'
    assert table['productionFixtureInstances'] is False
    assert row['result']['protectCharmOpenFixtureTableExecuted'] is True
    assert row['flagLoads'] == 0
    assert row['result']['formalInstances']['productionFixtureInstances'] is False
    for key in cases:
        assert table[key]['executed'] is True and len(table[key]['evidenceKeys']) > 0
        executed.setdefault(key, {'executed': True, 'evidenceKeys': []})['evidenceKeys'].append(
            row['dataMode'] + '/formal-open/result.protectCharmOpenFixtureTable.' + key)
    assert table['O02']['dropOnFailTargets'] == [5, 6]
    assert len(row['savedStateEvidence']) == 11
for mode in ['shared', 'snapshot']:
    assert any(row['dataMode'] == mode and row['freshSsrRefresh'] and row['graph'] == 'formal-open' for row in graphs)
    assert any(row['dataMode'] == mode and row['freshSsrRefresh'] and row['graph'] == 'memory-closed' for row in graphs)
assert protection['unauthorizedDifferences'] == [] and protection['oldEvidenceDifferences'] == []
assert all(audit['sourceUnchanged'].values())
source_hashes = {}
for manifest in [regression, opened]:
    for name, expected in manifest['testedSourceSha256'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
        source_hashes[name] = expected
checks = {**regression['checks'], **opened['checks']}
diff = subprocess.run(['git', 'diff', '--check'], cwd=ROOT, stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
(OUT / 'diff-check.log').write_text(diff.stdout, encoding='utf-8')
checks['diff-check'] = {'command': ['git', 'diff', '--check'], 'cwd': str(ROOT),
    'environment': {}, 'stdin': '/dev/null', 'exitCode': diff.returncode, 'assertions': None}
write('diff-check.result.json', checks['diff-check'])
required = ['tsc', 'v06p1-enhance-open', 'v06p1-enhance-closed', 'v06p1-forge-open',
    'v06p1-forge-closed', 'v06p1-market-closed', 'v06d-closed', 'v06c-closed',
    'datalint-shared', 'datalint-snapshot', 'diff-check']
assert all(checks[key]['exitCode'] == 0 for key in required)
assert all(checks[key]['stdin'] == '/dev/null' for key in required)
counts = {key: checks[key]['assertions'] for key in required if key.startswith('v06')}
assert all(isinstance(value, int) and value > 0 for value in counts.values())
floors = {'v06p1-enhance-open': 17676, 'v06p1-enhance-closed': 30834,
    'v06p1-forge-open': 6380, 'v06p1-forge-closed': 20413,
    'v06p1-market-closed': 24194, 'v06d-closed': 15059, 'v06c-closed': 10714}
assert all(counts[key] >= floor for key, floor in floors.items()), counts
assert counts['v06p1-enhance-open'] == runtime['assertions']
summary = {'passed': True, **flags, 'scope': '本窗=护符 soft-open 生产口径 ≠ 进包 ≠ 发版；formalOpen/softOpened兼容soft-open，released:false',
    'acceptanceDesign': runtime['acceptanceDesign'], 'protectCharmOpenFixtureTable': executed,
    'checks': checks, 'suiteAssertions': counts, 'totalSuiteAssertions': sum(counts.values()),
    'testedSourceSha256': source_hashes, 'notRun': ['snapshot', 'build', 'sync', 'release', 'Pages']}
write('selfcheck-summary.json', summary)
write('evidence-check.json', {'passed': True, **flags, 'acceptanceDesign': runtime['acceptanceDesign'],
    'protectCharmOpenFixtureTable': executed, 'formalGraphs': ['shared', 'snapshot'],
    'freshSsrPayloadsPerRoot': 11, 'formalSourcePayloadsPerRoot': 6,
    'formalOpenGraphsFlagLoads0': 22, 'memoryClosedGraphsFlagLoads1': 6,
    'closedRunnerGraphs': 6, 'closedRunnerMemoryGraphsFlagLoads1': 4,
    'featureOverrideCalls': 0, 'assertionFloors': floors,
    'productionSourceUnchanged': True, 'oldQaUnchanged': True, 'requiredChecksExit0': True,
    'concurrencyScope': '同一 SSR realm 的 Gate/Progress/slot 及内存 IDB；不外推多浏览器',
    'resourceChangeScope': '预检后事务草稿前复核及同步承载回调草稿篡改；不外推任意外部直接写字段'})
print(json.dumps({'passed': True, 'suiteAssertions': counts,
    'totalSuiteAssertions': sum(counts.values()), **flags}, ensure_ascii=False))
