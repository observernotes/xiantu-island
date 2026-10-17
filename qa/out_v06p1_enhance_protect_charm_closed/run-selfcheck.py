#!/usr/bin/env python3
"""护器符关态接线 QA；所有命令 stdin=/dev/null，旧证据只读。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/workspace/xiantu/wt/dev')
SHARED = Path('/workspace/xiantu')
OUT = ROOT / 'qa/out_v06p1_enhance_protect_charm_closed'
SCOPE = '本窗=护符映射接线 ≠ design/28 O01–O06 开态全表 ≠ soft-open ≠ release ≠ 进包；formalOpen/softOpened仅兼容既有状态'
EVIDENCE = dict(protectCharmWired=True, protectCharmN=1, formalTipsWired=True,
    formalInstanceSource=True, softOpenedEntrance=True, softOpenedFormalSettle=True,
    softOpenedProtectCharm=False, released=False)
TABLES = {
    'materials.json': '79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052',
    'items.json': 'f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3',
    'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
}
FROZEN = {
    'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
    'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
    'strings_zh.json': 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09',
    'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
    'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
}
FLAGS = {
    'EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
}
AUTHORIZED = {'src/EnhanceGate.ts', 'src/EnhanceProgress.ts', 'src/v06p1-enhance-open.test.ts',
    'scripts/v06p1-enhance-open-test.mjs', 'scripts/v06p1-enhance-closed-test.mjs',
    'scripts/v06p1-forge-open-test.mjs', 'scripts/v06p1-forge-closed-test.mjs',
    'scripts/v06p1-market-closed-test.mjs', *('data/balance/' + n for n in TABLES)}
# 首轮发现 game strings 在开工前已是正式944键，v06d 历史 runner 的936前提须适配。
# 保留原捕获SHA，单列获准回归差异，不改写写前清单。
REGRESSION_ADAPTATIONS = {'scripts/v06d-closed-test.mjs'}
CHECKS = {
    'tsc': (['npx', 'tsc', '--noEmit'], ROOT, {}),
    'v06p1-enhance-open': (['npm', 'run', 'test:v06p1-enhance-open'], ROOT,
        {'XT_ENHANCE_QA_OUT': str(OUT)}),
    'v06p1-enhance-closed': (['npm', 'run', 'test:v06p1-enhance-closed'], ROOT,
        {'ENHANCE_CLOSED_OUT': str(OUT / 'regression/enhance-closed')}),
    'v06p1-forge-open': (['npm', 'run', 'test:v06p1-forge-open'], ROOT,
        {'OUT_DIR': str(OUT / 'regression/forge-open')}),
    'v06p1-forge-closed': (['npm', 'run', 'test:v06p1-forge-closed'], ROOT,
        {'FORGE_CLOSED_OUT': str(OUT / 'regression/forge-closed')}),
    'v06p1-market-closed': (['npm', 'run', 'test:v06p1-market-closed'], ROOT,
        {'MARKET_CLOSED_OUT': str(OUT / 'regression/market-closed')}),
    'v06d-closed': (['npm', 'run', 'test:v06d-closed'], ROOT,
        {'OUT_DIR': str(OUT / 'regression/v06d-closed')}),
    'v06c-closed': (['npm', 'run', 'test:v06c-closed'], ROOT,
        {'OUT_DIR': str(OUT / 'regression/v06c-closed')}),
    'datalint-shared': (['python3', str(SHARED / 'qa/tools/datalint.py')], SHARED, {}),
    'datalint-snapshot': (['python3', str(SHARED / 'qa/tools/datalint.py')], ROOT / 'data', {}),
    'json-shared': (['python3', '-c', 'import subprocess; [subprocess.run(["python3","-m","json.tool","balance/"+n],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,check=True) for n in '+repr(list(TABLES))+']; print("3 JSON files PASS")'], SHARED, {}),
    'json-snapshot': (['python3', '-c', 'import subprocess; [subprocess.run(["python3","-m","json.tool","balance/"+n],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,check=True) for n in '+repr(list(TABLES))+']; print("3 JSON files PASS")'], ROOT / 'data', {}),
    'diff-check': (['git', 'diff', '--check'], ROOT, {}),
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def protected():
    files = {}
    for directory in [ROOT / 'src', ROOT / 'scripts', ROOT / 'data', SHARED / 'balance',
            SHARED / 'maps', SHARED / 'game/src', SHARED / 'game/data']:
        for p in directory.rglob('*'):
            if not p.is_file() or p.suffix == '.pyc':
                continue
            if p.is_relative_to(ROOT) and str(p.relative_to(ROOT)) in AUTHORIZED:
                continue
            files[str(p)] = digest(p)
    return files

def prior():
    return {str(p.relative_to(ROOT)): digest(p) for p in (ROOT / 'qa').rglob('*')
        if p.is_file() and not p.is_relative_to(OUT)}

def delta(before, after):
    return [{'path': n, 'before': before.get(n), 'after': after.get(n)}
        for n in sorted(set(before) | set(after)) if before.get(n) != after.get(n)]

def boundary():
    frozen = {str(base / 'balance' / n): {'expected': h, 'actual': digest(base / 'balance' / n)}
        for base in [SHARED, ROOT / 'data'] for n, h in FROZEN.items()}
    frozen.update({str(base / n): {'expected': h, 'actual': digest(base / n)}
        for base in [ROOT / 'src', SHARED / 'game/src'] for n, h in FLAGS.items()})
    targets = {str(base / 'balance' / n): {'expected': h, 'actual': digest(base / 'balance' / n)}
        for base in [SHARED, ROOT / 'data'] for n, h in TABLES.items()}
    for row in [*frozen.values(), *targets.values()]:
        row['match'] = row['expected'] == row['actual']
    gifts = []
    def visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == 'gifts': gifts.append(child.get('enabled'))
                visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    visit(json.loads((ROOT / 'data/balance/npcs.json').read_text()))
    phase = int(re.search(r'GAME_PHASE\s*=\s*(\d+)', (ROOT / 'src/data.ts').read_text()).group(1))
    keys = {str(base): len(json.loads((base / 'balance/strings_zh.json').read_text())) for base in [SHARED, ROOT / 'data']}
    return {'frozen': frozen, 'targets': targets, 'GAME_PHASE': phase, 'stringsKeys': keys,
        'gifts': gifts, 'passed': all(r['match'] for r in [*frozen.values(), *targets.values()])
        and phase == 5 and all(n == 944 for n in keys.values()) and len(gifts) == 10 and all(n is False for n in gifts)}

def capture():
    assert not (OUT / 'protected-before.json').exists(), 'baseline must not be overwritten'
    write('protected-before.json', protected())
    write('prior-evidence-before.json', prior())
    write('boundary-before.json', boundary())
    (OUT / 'status-before.md').write_bytes((ROOT / 'status/炼器阁.md').read_bytes())
    (OUT / 'initial-status.log').write_bytes(subprocess.check_output(['git','status','--short'],cwd=ROOT,stdin=subprocess.DEVNULL))
    write('initial-git.json', {'head': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip(),
        'originDev': subprocess.check_output(['git','rev-parse','origin/dev'],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip(),
        'branch': subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip(),
        'fetchPull': 'git fetch && git pull --ff-only origin dev: exit 0, Already up to date (captured in Codex log)', 'stdin': '/dev/null'})
    print('captured protected files and existing QA', flush=True)
    return 0

def run(name):
    command, cwd, extra = CHECKS[name]
    env = os.environ.copy()
    for key in ['OUT_DIR','XT_ENHANCE_QA_OUT','ENHANCE_CLOSED_OUT','FORGE_CLOSED_OUT','MARKET_CLOSED_OUT']:
        env.pop(key, None)
    env.update(extra)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT / (name + '.log')).open('w', encoding='utf-8') as stream:
        result = subprocess.run(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=stream,stderr=subprocess.STDOUT)
    counts = re.findall(r'\b(\d+)\s+assertions\b', (OUT / (name + '.log')).read_text())
    record = {'command': command,'cwd': str(cwd),'environment': extra,'stdin':'/dev/null',
        'startedAt': started,'exitCode': result.returncode,'assertions': int(counts[-1]) if counts else None}
    write(name + '.result.json', record)
    print(json.dumps({'check':name,**record},ensure_ascii=False),flush=True)
    return result.returncode

def protection():
    after = protected()
    old_after = prior()
    all_changes = delta(json.loads((OUT/'protected-before.json').read_text()),after)
    authorized_regression = [r for r in all_changes if Path(r['path']).is_relative_to(ROOT)
        and str(Path(r['path']).relative_to(ROOT)) in REGRESSION_ADAPTATIONS]
    changes = [r for r in all_changes if r not in authorized_regression]
    old_changes = delta(json.loads((OUT/'prior-evidence-before.json').read_text()),old_after)
    write('protected-after.json', after)
    write('prior-evidence-after.json', old_after)
    bounds = boundary()
    result = dict(passed=not changes and not old_changes and bounds['passed'],protectedFiles=len(after),
        unauthorizedDifferences=changes,authorizedRegressionDifferences=authorized_regression,
        oldEvidenceFiles=len(old_after),oldEvidenceDifferences=old_changes,
        boundary=bounds,**EVIDENCE,scope=SCOPE,notRun=['snapshot','build','sync','release'])
    write('protection-check.json', result)
    print(json.dumps({'protection':result['passed'],'protectedFiles':len(after),'oldEvidenceFiles':len(old_after),
        'unauthorizedDifferences':changes,'oldEvidenceDifferences':old_changes},ensure_ascii=False),flush=True)
    return 0 if result['passed'] else 1

def summary():
    checks = {n:json.loads((OUT/(n+'.result.json')).read_text()) for n in CHECKS if (OUT/(n+'.result.json')).exists()}
    protect = json.loads((OUT/'protection-check.json').read_text())
    evidence = json.loads((OUT/'evidence-check.json').read_text())
    counts = {n:r['assertions'] for n,r in checks.items() if r['assertions'] is not None}
    result = dict(passed=len(checks)==len(CHECKS) and all(r['exitCode']==0 for r in checks.values()) and protect['passed'] and evidence['passed'],
        **EVIDENCE,scope=SCOPE,checks=checks,suiteAssertions=counts,totalSuiteAssertions=sum(counts.values()),
        testedSourceSha256={n:digest(ROOT/n) for n in sorted(AUTHORIZED | REGRESSION_ADAPTATIONS)},notRun=['snapshot','build','sync','release'])
    write('selfcheck-summary.json',result)
    print(json.dumps({'summary':result['passed'],'suiteAssertions':counts,'totalSuiteAssertions':sum(counts.values())}),flush=True)
    return 0 if result['passed'] else 1

actions = {'capture': capture,'protection':protection,'summary':summary}
codes = [actions[n]() if n in actions else run(n) for n in (sys.argv[1:] or list(CHECKS))]
sys.exit(max(codes,default=0))
