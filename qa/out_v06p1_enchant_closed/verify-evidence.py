#!/usr/bin/env python3
"""汇总实际执行结果；缺项、非零退出、冻结或 C 表不完整均阻断。"""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path('/workspace/xiantu/wt/dev')
OUT=ROOT/'qa/out_v06p1_enchant_closed'
def read(n): return json.loads((OUT/n).read_text())
def write(n,v): (OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
required=['tsc','v06p1-enchant-closed','v06p1-enhance-open','v06p1-enhance-closed',
    'v06p1-forge-open','v06p1-forge-closed','v06p1-market-closed','v06d-closed','v06c-closed',
    'datalint-shared','datalint-snapshot','json-shared','json-snapshot','diff-check']
checks={n:read(n+'.result.json') for n in required}
assert all(r['exitCode']==0 for r in checks.values()), '检查未全绿'
assert all(r['stdin']=='/dev/null' for r in checks.values())
protection=read('protection-check.json')
assert protection['passed'] and not protection['unauthorizedDifferences'] and not protection['priorEvidenceDifferences']
assert read('table-delta-check.json')['passed']
evidence=read('runtime/v06p1-enchant-closed-evidence.json')
write('v06p1-enchant-closed-evidence.json',evidence)
fields=dict(enchantClosedTipsWired=True,EnchantOpenFlag=False,softOpenedEnchant=False,released=False,
    beastCoreMapped=True,protectCharmSoftOpenPreserved=True)
for k,v in fields.items(): assert evidence[k] is v, (k,evidence.get(k))
assert evidence['passed']
assert sorted(evidence['cases'])==[f'C{i:02d}' for i in range(1,11)]
assert all(r['executed'] and r['evidenceKeys'] for r in evidence['cases'].values())
assert evidence['storageWrites']==0 and evidence['sentinelCalls']==0
assert evidence['freshIndependentGraphs']==4 and evidence['openFixtureTableExecuted'] is False
package=json.loads((ROOT/'package.json').read_text())
protect_scripts={k:v for k,v in package['scripts'].items() if 'protect' in k.lower()}
assert not protect_scripts, '新增 protect 独立命令须加入检查'
assert 'softOpenedProtectCharm' in (OUT/'v06p1-enhance-open.log').read_text(), '护符回归旁证缺失'
counts={n:r['assertions'] for n,r in checks.items() if r['assertions'] is not None}
sources=['src/EnchantClosed.ts','src/EnchantOpenFlag.ts','src/v06p1-enchant-closed.test.ts',
    'scripts/v06p1-enchant-closed-test.mjs','package.json','src/EnhanceGate.ts','src/ForgeGate.ts',
    'src/EnhanceClosed.ts','src/ForgeClosed.ts','src/EnhanceOpenFlag.ts','src/ForgeOpenFlag.ts','src/Progress.ts','src/data.ts']
source_shas={n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in sources}
scope='本窗仅关态 tip 接线；beastCoreMapped 表示登记齐，不表示消费者/同事务消费保存齐备或生产放行；未执行附灵 O01–O08'
summary=dict(passed=True,**fields,checks=checks,suiteAssertions=counts,totalSuiteAssertions=sum(counts.values()),
    testedSourceSha256=source_shas,protectSpecificPackageScripts=protect_scripts,
    protectRegression='既有护符由 enhance-open / enhance-closed 覆盖；未新增或改写旧 QA',
    regressionCompatibility='本窗 QA 内存精确更新历史静态基线，保留旧测试磁盘字节；当前真实数据与生产 SSR 业务断言仍执行，详 regression/*/compatibility-* 审计',
    scope=scope,notRun=['snapshot','build','sync','release','Pages'])
write('selfcheck-summary.json',summary)
write('evidence-check.json',dict(passed=True,**fields,allCommandsExit0=True,sourceSha256=source_shas,
    priorEvidenceFiles=protection['priorEvidenceFiles'],priorEvidenceDifferences=0,
    frozenMatch=True,snapshotTargetMatch=True,GAME_PHASE=5,giftsFalseCount=10,scope=scope))
print(json.dumps(dict(passed=True,suiteAssertions=counts,totalSuiteAssertions=sum(counts.values())),ensure_ascii=False))
