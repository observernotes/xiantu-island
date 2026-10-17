#!/usr/bin/env python3
"""核实际 runner 运行证据，不以静态文档替代 C 表旁证。"""
import hashlib
import json
from pathlib import Path

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_enhance_protect_charm_closed'
EXPECTED = dict(protectCharmWired=True, protectCharmN=1, formalTipsWired=True,
    formalInstanceSource=True, softOpenedEntrance=True, softOpenedFormalSettle=True,
    softOpenedProtectCharm=False, released=False)
opened = json.loads((OUT / 'v06p1-enhance-open-evidence.json').read_text())
closed = json.loads((OUT / 'regression/enhance-closed/v06p1-enhance-closed-evidence.json').read_text())
audit = json.loads((OUT / 'source-path-audit.json').read_text())
assert opened['passed'] and closed['passed']
assert audit['result'] == 'PASS_STATIC_REVIEW' and audit['findings'] == []
assert audit['productionConsumer']['onlyNonTestConsumer'] is True
assert audit['productionConsumer']['fixtureInstancesInjected'] is False
for name, expected_sha in audit['sourceSha256'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected_sha
for evidence in [opened, closed]:
    for name, value in EXPECTED.items():
        assert evidence[name] == value and type(evidence[name]) is type(value), (name, evidence[name])
graphs = [r for r in opened['evidence'] if r['suite'] == 'v06p1-enhance-open-graph']
assert len(graphs) == 28
main = [r for r in graphs if r['graph'] == 'formal-open' and not r['freshSsrRefresh'] and r['invalidTable'] is None]
assert [r['dataMode'] for r in main] == ['shared', 'snapshot']
for graph in graphs:
    assert graph['flagLoads'] == (1 if graph['graph'] == 'memory-closed' else 0)
    assert graph['featureOverrideCalls'] == 0
    for name, value in EXPECTED.items():
        assert graph['result'][name] == value
    assert graph['result']['protectCharmOpenFixtureTableExecuted'] is False
for graph in main:
    proof = graph['result']['protectCharmMapping']
    assert proof['cases'] == [f'C{i:02d}' for i in range(1,9)]
    assert len(proof['mappingMutations']) == 19
    assert proof['falseCharmReads'] == 0
    assert proof['incompleteMappingTip'] == 'enhance.formal.protect'
    assert proof['missingCharmTip'] == 'enhance.formal.resources'
    for name in ['zeroSideEffects','duplicatePayloadIncludesUseProtectCharm','loadDedupeWithoutSupplement']:
        assert proof[name] is True
    assert proof['productionFixtureInstances'] is False
    assert proof['openFixtureTableExecuted'] is False
    assert proof['minimalWiringProof'] == ['success-consumes-N',
        'dropOnFail-failure-keeps-level-and-consumes-N','missing-charm-resources']
    assert len(graph['savedStateEvidence']) == 8
    assert [p['state'] for p in graph['savedStateEvidence']][-2:] == ['protect-charm-success','protect-charm-failure-kept']
fresh = [r for r in graphs if r['freshSsrRefresh']]
assert len(fresh) == 4
assert all(len(r['savedStateEvidence']) == 8 for r in fresh)
memory = [r for r in closed['evidence'] if r['suite'] == 'protect-charm-memory-closed']
assert {r['dataMode'] for r in memory} == {'shared','snapshot'}
for row in memory:
    assert row['passed'] and row['memoryClosedFlag'] is False and row['ForgeOpenFlag'] is True
    assert row['requestsProtect'] == [False,True]
    assert row['protectCharmCount'] == 3 and row['randomCalls'] == row['transactionCalls'] == 0
    assert row['zeroSideEffects'] is True
before = json.loads((OUT / 'protected-before.json').read_text())
game_strings = '/workspace/xiantu/game/data/balance/strings_zh.json'
assert before[game_strings] == 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09'
assert hashlib.sha256(Path(game_strings).read_bytes()).hexdigest() == before[game_strings]
result = dict(passed=True,**EXPECTED,acceptanceDesign='design/28 C01–C08',
    scope='本窗=护符映射接线 ≠ design/28 开态全表 ≠ soft-open ≠ release ≠ 进包',
    compatibilityMeaning='formalOpen/softOpened沿用既有入口/无符正式状态',
    cases={f'C{i:02d}': {'programEvidence':True,'enforcementSignoff':False,
        'files':['v06p1-enhance-open-evidence.json','regression/enhance-closed/v06p1-enhance-closed-evidence.json','source-path-audit.json']}
        for i in range(1,9)},
    runtimeGraphs=len(graphs),formalDiskGraphs=sum(r['graph']=='formal-open' for r in graphs),
    memoryClosedGraphs=sum(r['graph']=='memory-closed' for r in graphs),freshSsrGraphs=len(fresh),
    mappingMutationCasesPerRoot=19,falseCharmReads=0,minimalWiringProof=main[0]['result']['protectCharmMapping']['minimalWiringProof'],
    protectCharmOpenFixtureTableExecuted=False,sourcePathAudit='source-path-audit.json',
    historicalRunnerAdaptation={'reason':'game strings在开工前已为指定944键版本，旧runner仍假定936；仅适配断言，不写表',
        'gameStringsBeforeAfter':before[game_strings],'initialFailures':'attempts/before-game-strings-adaptation/',
        'sharedGenerator':'shared已存在演武落表生成器，旧全树检查补精确路径及59b821c2…SHA；未复制至wt/game',
        'secondFailures':'attempts/before-shared-generator-adaptation/'},
    notRun=['snapshot','build','sync','release'])
(OUT / 'evidence-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'evidence':True,'runtimeGraphs':len(graphs),'freshSsrGraphs':len(fresh),**EXPECTED},ensure_ascii=False))
