"""Replay this window's checks from wt/dev; keep all outputs in this QA directory."""
from pathlib import Path
import json
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
name = sys.argv[1]
commands = {
    'tsc': ['npx', 'tsc', '--noEmit'],
    'diff-check': ['git', 'diff', '--check'],
}
for suite in ('v06p1-enhance-open', 'v06p1-enhance-closed', 'v06p1-forge-open',
              'v06p1-forge-closed', 'v06p1-market-closed', 'v06d-closed', 'v06c-closed'):
    commands[suite] = ['npm', 'run', 'test:' + suite]
command = commands[name]
env = dict(os.environ, XT_ENHANCE_QA_OUT=str(OUT), OUT_DIR=str(OUT / name),
           FORGE_CLOSED_OUT=str(OUT / name), MARKET_CLOSED_OUT=str(OUT / name))
with (OUT / (name + '.log')).open('wb') as log:
    result = subprocess.run(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                            stdout=log, stderr=subprocess.STDOUT)
output = (OUT / (name + '.log')).read_text()
counts = re.findall(r'(\d+) assertions', output)
record = {'command': command, 'cwd': str(ROOT), 'stdin': '/dev/null',
          'exitCode': result.returncode,
          'assertions': int(counts[-1]) if counts else None}
(OUT / (name + '.result.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False))
print('\n'.join(output.splitlines()[-6:]))
sys.exit(result.returncode)
