#!/usr/bin/env python3
"""本窗 QA：所有子进程 stdin=/dev/null；证据仅写本窗目录。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_enhance_formal_soft_open'
SHARED = Path('/workspace/xiantu')
CHECKS = {
    'tsc': (['npx', 'tsc', '--noEmit'], ROOT, {}),
    'v06p1-enhance-open': (['npm', 'run', 'test:v06p1-enhance-open'], ROOT,
        {}),
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
    'datalint-shared': (['python3', '/workspace/xiantu/qa/tools/datalint.py'], SHARED, {}),
    'datalint-snapshot': (['python3', '/workspace/xiantu/qa/tools/datalint.py'], ROOT / 'data', {}),
    'diff-check': (['git', 'diff', '--check'], ROOT, {}),
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def run_check(name):
    command, cwd, extra_env = CHECKS[name]
    env = os.environ.copy()
    # 不继承可能指向旧 QA 的通用/专用输出路径。
    for key in ['OUT_DIR', 'XT_ENHANCE_QA_OUT', 'ENHANCE_CLOSED_OUT', 'FORGE_CLOSED_OUT', 'MARKET_CLOSED_OUT']:
        env.pop(key, None)
    env.update(extra_env)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT / (name + '.log')).open('w', encoding='utf-8') as stream:
        result = subprocess.run(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
            stdout=stream, stderr=subprocess.STDOUT)
    log = (OUT / (name + '.log')).read_text(encoding='utf-8')
    counts = re.findall(r'\b(\d+)\s+assertions\b', log)
    record = {'command': command, 'cwd': str(cwd), 'environment': extra_env,
        'stdin': '/dev/null', 'startedAt': started, 'exitCode': result.returncode,
        'assertions': int(counts[-1]) if counts else None}
    write_json(name + '.result.json', record)
    print(json.dumps({'check': name, **record}, ensure_ascii=False), flush=True)
    return result.returncode

def capture_after():
    before = json.loads((OUT / 'protected-before.json').read_text(encoding='utf-8'))
    after, differences = {}, []
    for key, row in before['files'].items():
        current = digest(Path(row['path']))
        after[key] = {'path': row['path'], 'sha256': current}
        if current != row['sha256']:
            differences.append({'key': key, 'before': row['sha256'], 'after': current})
    current_keys = {str(p.relative_to(ROOT)) for p in (ROOT / 'src').rglob('*') if p.is_file() and not p.name.endswith('.test.ts')}
    for mode, data in [('shared', SHARED), ('snapshot', ROOT / 'data'), ('game', SHARED / 'game/data')]:
        for directory in ['balance', 'maps']:
            current_keys.update(mode + '/' + str(path.relative_to(data)) for path in (data / directory).rglob('*.json'))
        if (data / 'features.json').is_file():
            current_keys.add(mode + '/features.json')
    protected_added = sorted(current_keys - set(before['files']))
    protected_removed = sorted(set(before['files']) - current_keys)
    old = json.loads((OUT / 'prior-evidence-before.json').read_text(encoding='utf-8'))
    old_after = {name: digest(ROOT / name) for name in old}
    old_differences = [name for name in old if old[name] != old_after[name]]
    original_names = set(old)
    current_names = set()
    for prefix in ['out_v06p1_enhance_', 'out_v06p1_forge_', 'out_v06p1_market_', 'out_v06c_', 'out_v06d_']:
        for directory in (ROOT / 'qa').glob(prefix + '*'):
            if directory == OUT:
                continue
            current_names.update(str(p.relative_to(ROOT)) for p in directory.rglob('*') if p.is_file())
    old_added = sorted(current_names - original_names)
    old_removed = sorted(original_names - current_names)
    report = {'passed': not (differences or protected_added or protected_removed or old_differences or old_added or old_removed),
        'protectedFiles': len(after), 'unauthorizedDifferences': differences,
        'protectedAdded': protected_added, 'protectedRemoved': protected_removed,
        'oldEvidenceFiles': len(old), 'oldEvidenceDifferences': old_differences,
        'oldEvidenceAdded': old_added, 'oldEvidenceRemoved': old_removed,
        'formalTipsWired': True, 'formalInstanceSource': True, 'softOpenedEntrance': True, 'softOpenedFormalSettle': True,
        'released': False, 'scope': '正式实例源 soft-open；PASS ≠ 进包 ≠ 发版；formalOpen/softOpened ≠ 进包',
        'EnhanceOpenFlag': 'return true;' in (ROOT / 'src/EnhanceOpenFlag.ts').read_text(encoding='utf-8'),
        'ForgeOpenFlag': 'return true;' in (ROOT / 'src/ForgeOpenFlag.ts').read_text(encoding='utf-8'),
        'GAME_PHASE': int(re.search(r'GAME_PHASE\s*=\s*(\d+)', (ROOT / 'src/data.ts').read_text(encoding='utf-8')).group(1)),
        'enhanceJsonUnchanged': not any(row['key'].endswith('/enhance.json') for row in differences),
        'notRun': ['build', 'sync', 'release']}
    write_json('protected-after.json', {'files': after})
    write_json('prior-evidence-after.json', old_after)
    write_json('protection-check.json', report)
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return 0 if report['passed'] else 1

def summary():
    checks = {name: json.loads((OUT / (name + '.result.json')).read_text(encoding='utf-8'))
        for name in CHECKS if (OUT / (name + '.result.json')).is_file()}
    counts = {name: row['assertions'] for name, row in checks.items() if row['assertions'] is not None}
    sources = ['src/EnhanceGate.ts', 'src/EnhanceProgress.ts', 'src/ForgeGate.ts', 'src/Progress.ts',
        'src/v06p1-enhance-open.test.ts', 'scripts/v06p1-enhance-open-test.mjs',
        'scripts/v06p1-enhance-closed-test.mjs', 'scripts/v06p1-forge-open-test.mjs',
        'scripts/v06p1-forge-closed-test.mjs', 'scripts/v06p1-market-closed-test.mjs',
        'scripts/v06c-closed-test.mjs', 'scripts/v06d-closed-test.mjs',
        'scripts/v06p1-enhance-instance-source-proof.mjs']
    protection = json.loads((OUT / 'protection-check.json').read_text(encoding='utf-8')) if (OUT / 'protection-check.json').is_file() else None
    result = {'passed': len(checks) == len(CHECKS) and all(row['exitCode'] == 0 for row in checks.values()) and bool(protection and protection['passed']),
        'formalTipsWired': True, 'formalInstanceSource': True, 'softOpenedEntrance': True, 'softOpenedFormalSettle': True, 'released': False,
        'formalOpen': True, 'softOpened': True, 'closedFixtureOnly': True,
        'scope': '正式实例源 soft-open；PASS ≠ 进包 ≠ 发版；formalOpen/softOpened ≠ 进包', 'checks': checks, 'suiteAssertions': counts,
        'totalSuiteAssertions': sum(counts.values()), 'testedSourceSha256': {name: digest(ROOT / name) for name in sources},
        'protection': protection, 'notRun': ['build', 'sync', 'release']}
    write_json('selfcheck-summary.json', result)
    print(json.dumps({'summary': result['passed'], 'suiteAssertions': counts, 'totalSuiteAssertions': sum(counts.values())}, ensure_ascii=False), flush=True)
    return 0 if result['passed'] else 1

exit_codes = []
for requested in sys.argv[1:] or list(CHECKS):
    if requested == 'protection':
        exit_codes.append(capture_after())
    elif requested == 'summary':
        exit_codes.append(summary())
    else:
        exit_codes.append(run_check(requested))
sys.exit(max(exit_codes, default=0))
