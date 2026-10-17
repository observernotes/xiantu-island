#!/usr/bin/env python3
"""汇总实际命令结果与 O 表证据；不代替测试，不改业务输入。"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
NAMES = ['tsc', 'v06p1-enchant-open', 'v06p1-enchant-closed',
         'v06p1-enhance-open', 'v06p1-enhance-closed', 'v06p1-forge-open',
         'v06p1-forge-closed', 'v06p1-market-closed', 'v06d-closed',
         'v06c-closed', 'datalint-shared', 'datalint-snapshot', 'diff-check']
FLAGS = dict(enchantClosedTipsWired=True, beastCoreMapped=True,
             enchantOpenFixtureTableExecuted=True, formalInstanceSource=True,
             softOpenedEnchant=False, EnchantOpenFlag=False, released=False,
             protectCharmSoftOpenPreserved=True, EnhanceOpenFlagPreserved=True)

def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

checks = []
def check(name, actual, expected):
    checks.append(dict(name=name, passed=actual == expected, actual=actual, expected=expected))

results = {name: read(name + '.result.json') for name in NAMES}
for name, row in results.items():
    check(name + ':exit', row['exitCode'], 0)
    check(name + ':stdin', row.get('stdin'), '/dev/null')
    if name.startswith('v06'):
        check(name + ':assertions', isinstance(row.get('assertions'), int) and row['assertions'] > 0, True)
opened = read('v06p1-enchant-open-evidence.json')
closed = read('regression/enchant-closed/v06p1-enchant-closed-evidence.json')
protection = read('protection-check.json')
check('open:passed', opened['passed'], True)
check('closed:passed', closed['passed'], True)
check('protection:passed', protection['passed'], True)
check('frozen:MATCH', protection['frozenByteMatch'], True)
check('independent-review:passed', read('independent-review.json')['passed'], True)
check('prior-evidence:passed', read('prior-evidence-after.json')['passed'], True)
for key, value in FLAGS.items():
    check('open:' + key, opened.get(key), value)
for case in [f'O{i:02}' for i in range(1, 9)]:
    check(case + ':executed', opened['cases'][case]['executed'], True)
for case in [f'C{i:02}' for i in range(1, 11)]:
    check(case + ':executed', closed['cases'][case]['executed'], True)
check('closed:zero-writes', closed['storageWrites'], 0)
check('closed:zero-sentinels', closed['sentinelCalls'], 0)
total = sum(row.get('assertions') or 0 for row in results.values())
passed = all(row['passed'] for row in checks)
summary = dict(passed=passed, **FLAGS, scope='本窗=附灵开态夹具全表 ≠ soft-open ≠ release ≠ 进包',
               commands=results, testAssertions=total, openAssertions=results['v06p1-enchant-open']['assertions'],
               protectionAssertions=protection['assertions'], cases=opened['cases'],
               forbiddenCommandsRun=[], stdin='/dev/null', out=str(OUT), blockers=[] if passed else ['见 evidence-check.json'])
write('selfcheck-summary.json', summary)
write('evidence-check.json', dict(passed=passed, checks=checks, **FLAGS))
print(json.dumps(dict(passed=passed, testAssertions=total, openAssertions=summary['openAssertions'],
                      failed=[row for row in checks if not row['passed']]), ensure_ascii=False))
raise SystemExit(0 if passed else 1)
