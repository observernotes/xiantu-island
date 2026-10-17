import hashlib
import json
from pathlib import Path
import subprocess

root = Path('/workspace/xiantu/wt/feat/ui-smith-services')
out = Path(__file__).resolve().parent
implementation = '1e256ea77061d6f77b3e447c834bb17ba8682dc3'
baseline = 'abff11da3e5b251187649bc8a37ef9d7b8729fa2'
read = lambda name: json.loads((out / name).read_text())
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
git = lambda *args: subprocess.check_output(['git', *args], cwd=root, stdin=subprocess.DEVNULL)
subprocess.run(['git', 'merge-base', '--is-ancestor', baseline, 'HEAD'], cwd=root,
               stdin=subprocess.DEVNULL, check=True)
assert git('branch', '--show-current').decode().strip() == 'feat/ui-smith-services'
assert git('diff', '--name-only', baseline, '--', 'src', 'data/balance') == b''

required = dict(passed=True, softOpenedSmithServicesUi=True, released=False, newOpenFlag=False,
                allOpenCasesPassed=True, o05FormalProductionSuccess=True, productionFormalPath=True,
                fixtureQualificationInjected=False, fixtureCarrierInstalled=False,
                o09StaleForgeEnhanceBlocked=True, lostCompletedEnchant=False,
                singleGameSceneCurrentProgressBypassClaimed=False, settlementUnchanged=True,
                stringsDiskKeys=1013, stringsSsrInjected43=False, GAME_PHASE=5, gifts0=True)
evidence, validation = read('evidence.json'), read('validation.json')
for name, row in [('evidence', evidence), ('validation', validation)]:
    for key, expected in required.items():
        assert row[key] == expected, (name, key, row[key])
    assert row['tipFull'] == implementation
    assert set(row['fourFlagMatch'].values()) == {'MATCH'}
assert evidence['blocked'] == {}
assert len(evidence['cases']) == 11
assert all(row['executed'] and row['passed'] and row['evidenceKeys'] for row in evidence['cases'].values())

protection = read('protection-check.json')
assert protection['passed'] and protection['closedOutUnchanged'] and protection['settlementUnchanged']
frozen = protection['after']['frozen']
for file, expected in frozen.items():
    assert sha(file) == expected, file
for folder, expected in protection['before']['closedOut'].items():
    base = Path(folder)
    assert base.exists() == expected['exists'], folder
    current = {str(file.relative_to(base)): sha(file) for file in base.rglob('*') if file.is_file()} if base.exists() else {}
    assert current == expected['files'], folder
for row in protection['roots'].values():
    assert row['enhanceSha'] == evidence['enhanceSha']
    assert row['stringsSha'] == evidence['stringsSha'] and row['stringsDiskKeys'] == 1013
    assert row['gifts0'] and row['giftsFalseCount'] == 10 and row['GAME_PHASE'] == 5

before = read('audit/protected-before.json')
for group in ['products', 'tables', 'artifacts']:
    for file, expected in before[group].items():
        assert sha(file) == expected, (group, file)
delivery = read('delivery-protection-check.json')
for key in ['passed', 'productionSourcesMatch', 'allTablesMatch', 'oldArtifactsMatch', 'flagMatch']:
    assert delivery[key] is True, key
for file, expected in read('audit/tested-source-manifest.json')['sha256'].items():
    assert sha(root / file) == expected, file
    assert hashlib.sha256(git('show', implementation + ':' + file)).hexdigest() == expected, file

regressions = read('regressions/regression-summary.json')
assert regressions['passed'] and len(regressions['results']) == 22
assert all(row['exitCode'] == 0 and Path(row['log']).is_file() for row in regressions['results'])
for file in ['regressions/v06p1-smith-services-closed/evidence.json', 'services-closed/evidence.json']:
    row = read(file)
    assert row['passed'] and row['softOpenedSmithServicesUi'] and not row['released'] and not row['newOpenFlag']
    assert len(row['cases']) == 11 and all(case['executed'] and case['passed'] for case in row['cases'].values())
    assert all(row[key] == 0 for key in ['localStorageWrites', 'indexedDbOpens', 'sentinelCalls'])
assert read('services-closed/evidence.json')['storageWrites'] == 0
closed = read('regressions/v06p1-smith-services-closed/evidence.json')
assert all(closed[key] == 0 for key in ['submitCalls', 'settlementRandomCalls', 'fullBusinessStateDelta'])
for name in ['tsc', 'datalint-shared', 'datalint-snapshot', 'diff-check']:
    row = read('audit/' + name + '.result.json')
    assert row['exitCode'] == 0
    if name.startswith('datalint'):
        assert row['zeroProblems'] is True
fixture = read('fixture-regression/evidence.json')
assert fixture['passed'] and fixture['isolatedFixtureRegressionOnly'] and not fixture['productionO05Claimed']
assert fixture['softOpenedSmithServicesUi'] and not fixture['released'] and not fixture['newOpenFlag']
for relative in ['status/炼器阁.md', 'status/炼器阁·界面接入.md']:
    local, shared = (root / relative).read_bytes(), (Path('/workspace/xiantu') / relative).read_bytes()
    assert local == shared and len(local.decode('utf-8').splitlines()) <= 30
for name in ['HANDOFF', 'RESULT']:
    relative = f'reports/炼器阁/V06P1_SMITH_SERVICES_SOFT_OPEN_{name}.md'
    assert (root / relative).read_bytes() == (Path('/workspace/xiantu') / relative).read_bytes()
assert (out / 'PASS').is_file()
print(json.dumps(dict(passed=True, implementationTip=implementation, baselineContainsAbff11d=True,
                      hardGates=required, allTestedSourceBytesMatchImplementationTree=True,
                      unauthorizedProductOrTableChanges=0, historicalOutputChanges=0,
                      regressionSuites=22, regressionAssertions=regressions['totalAssertions'],
                      servicesClosedAssertions=read('services-closed/evidence.json')['assertions'],
                      totalAssertionsLowerBound=validation['totalAssertionsLowerBound'] + read('services-closed/evidence.json')['assertions'],
                      independentEnforcement=False, enforcementSoftSmokePending=True), indent=2))
