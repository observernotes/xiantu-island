#!/usr/bin/env python3
"""Run one authorized self-check; all child stdin streams are /dev/null."""
import json, re, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
CHECKS = {
    'typecheck': (['npx', 'tsc', '--noEmit'], ROOT),
    'closed': (['npm', 'run', 'test:v06p1-attr-ui-closed'], ROOT),
    'binding-success': (['npm', 'run', 'test:v06p1-attr-ui-binding-success'], ROOT),
    'map-api': (['npm', 'run', 'test:v06p1-attr-ui-map-api'], ROOT),
    'map-services': (['npm', 'run', 'test:v06p1-attr-ui-map-services'], ROOT),
    'equip': (['npm', 'run', 'test:equip'], ROOT),
    'appearance': (['npm', 'run', 'test:appearance'], ROOT),
    'datalint-shared': (['python3', '/workspace/xiantu/qa/tools/datalint.py'], Path('/workspace/xiantu')),
    'datalint-snapshot': (['python3', '/workspace/xiantu/qa/tools/datalint.py'], ROOT / 'data'),
    'diff-check': (['git', 'diff', '--check'], ROOT),
}
name = sys.argv[1]
cmd, cwd = CHECKS[name]
start = time.time()
result = subprocess.run(cmd, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=180)
text = result.stdout
(OUT / 'logs').mkdir(exist_ok=True)
(OUT / 'logs' / (name + '.log')).write_text(text)
counts = re.findall(r'(\d+) assertions', text)
passed = result.returncode == 0
if name.startswith('datalint-'):
    passed = passed and '问题 0 条' in text
row = {'name': name, 'command': cmd, 'cwd': str(cwd), 'stdin': '/dev/null', 'exitCode': result.returncode, 'passed': passed, 'assertions': int(counts[-1]) if counts else None, 'durationSeconds': round(time.time()-start,3), 'log': 'logs/' + name + '.log'}
(OUT / 'logs' / (name + '.result.json')).write_text(json.dumps(row, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(row, ensure_ascii=False))
print(text[-1600:])
sys.exit(0 if passed else result.returncode or 1)
