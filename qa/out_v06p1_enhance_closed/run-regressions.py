"""运行正式 npm 命令，将本次证据另存本窗并恢复旧窗所有既有字节。"""
import concurrent.futures
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
CASES = {
    'v06p1-forge-closed': 'qa/out_v06p1_forge_formal/closed',
    'v06p1-market-closed': 'qa/out_v06p1_forge_formal/market-closed',
    'v06d-closed': 'qa/out_v06d_closed',
    'v06c-closed': None,
    'v06d-open': 'qa/out_v06d_open_fixture',
}


def run(case):
    rel = CASES[case]
    legacy = ROOT / rel if rel else None
    with tempfile.TemporaryDirectory(prefix=f'enhance-preserve-{case}-') as temp:
        backup = Path(temp) / 'legacy'
        if legacy and legacy.exists():
            shutil.copytree(legacy, backup)
        try:
            if (OUT / f'{case}.log').exists():
                shutil.copy2(OUT / f'{case}.log', OUT / f'{case}.initial.log')
            with (OUT / f'{case}.log').open('w') as log:
                p = subprocess.run(['npm', 'run', f'test:{case}'], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
            if legacy and legacy.exists():
                shutil.copytree(legacy, OUT / 'regression-evidence' / case, dirs_exist_ok=True)
            row = {'command': f'npm run test:{case}', 'exitCode': p.returncode,
                   'log': f'{case}.log', 'legacyEvidenceRestored': True}
            (OUT / f'{case}.result.json').write_text(json.dumps(row, indent=2) + '\n')
            return row
        finally:
            if legacy:
                if legacy.exists():
                    shutil.rmtree(legacy)
                if backup.exists():
                    shutil.copytree(backup, legacy)


selected = sys.argv[1:] or list(CASES)
assert all(case in CASES for case in selected)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    updated = {row['command']: row for row in pool.map(run, selected)}
previous = json.loads((OUT / 'regression-summary.json').read_text()) if (OUT / 'regression-summary.json').exists() else []
updated = {**{row['command']: row for row in previous}, **updated}
results = list(updated.values())
(OUT / 'regression-summary.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
raise SystemExit(0 if all(r['exitCode'] == 0 for r in results) else 1)
