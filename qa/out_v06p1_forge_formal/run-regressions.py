#!/usr/bin/env python3
"""Run unchanged regressions while preserving all preexisting output bytes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import tempfile

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_forge_formal'
CASES = ['v06d-closed', 'v06c-closed']

def snapshot(directory):
    if not directory.exists():
        return {'exists': False, 'files': {}, 'directories': []}
    files, directories = {}, []
    for path in sorted(directory.rglob('*')):
        name = str(path.relative_to(directory))
        if path.is_symlink():
            files[name] = {'symlink': str(path.readlink())}
        elif path.is_file():
            files[name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        elif path.is_dir():
            directories.append(name)
    return {'exists': True, 'files': files, 'directories': directories}

OUT.mkdir(parents=True, exist_ok=True)
backup_root = Path(tempfile.mkdtemp(prefix='xiantu-forge-formal-regressions-'))
before, records = {}, []
try:
    for case in CASES:
        original = ROOT / 'qa' / ('out_' + case.replace('-', '_'))
        before[case] = snapshot(original)
        if original.exists():
            shutil.copytree(original, backup_root / case, symlinks=True)
    (OUT / 'regression-output-before.json').write_text(json.dumps(before, ensure_ascii=False, indent=2) + '\n')

    def run(case):
        log = OUT / (case + '.log')
        with log.open('w') as stream:
            result = subprocess.run(['npm', 'run', 'test:' + case], cwd=ROOT, stdin=subprocess.DEVNULL,
                                    stdout=stream, stderr=subprocess.STDOUT)
        found = re.search(r'v06[cd] closed tests ok: (\d+) assertions', log.read_text())
        return {'case': case, 'command': 'npm run test:' + case, 'exitCode': result.returncode,
                'assertions': int(found.group(1)) if found else None, 'log': str(log.relative_to(ROOT))}

    with ThreadPoolExecutor(max_workers=2) as pool:
        records = list(pool.map(run, CASES))
    for record in records:
        case = record['case']
        original = ROOT / 'qa' / ('out_' + case.replace('-', '_'))
        produced = snapshot(original)
        changed = [name for name, details in produced['files'].items()
                   if details != before[case]['files'].get(name)]
        record['newOrChangedEvidence'] = []
        for name in changed:
            source = original / name
            target = OUT / 'regressions' / case / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_symlink():
                target.symlink_to(source.readlink())
            else:
                shutil.copy2(source, target)
            record['newOrChangedEvidence'].append(str(target.relative_to(ROOT)))
finally:
    restoration = {}
    for case in CASES:
        if case not in before:
            continue
        original = ROOT / 'qa' / ('out_' + case.replace('-', '_'))
        if original.exists():
            shutil.rmtree(original)
        if before[case]['exists']:
            shutil.copytree(backup_root / case, original, symlinks=True)
        after = snapshot(original)
        restoration[case] = {'restoredExactly': after == before[case],
                             'filesBefore': len(before[case]['files']), 'filesAfter': len(after['files'])}
    (OUT / 'regressions.json').write_text(json.dumps({'passed': bool(records)
        and all(record['exitCode'] == 0 and record['assertions'] is not None for record in records)
        and all(row['restoredExactly'] for row in restoration.values()),
        'tests': records, 'outputPreservation': restoration}, ensure_ascii=False, indent=2) + '\n')
    if all(row['restoredExactly'] for row in restoration.values()):
        shutil.rmtree(backup_root)

result = json.loads((OUT / 'regressions.json').read_text())
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result['passed'] else 1)
