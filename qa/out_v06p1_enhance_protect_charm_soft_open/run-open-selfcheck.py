#!/usr/bin/env python3
"""Replay this window's formal soft-open checks without writing previous QA outputs."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
FLAGS = {
    'protectCharmWired': True, 'protectCharmN': 1,
    'protectCharmOpenFixtureTableExecuted': True,
    'formalTipsWired': True, 'formalInstanceSource': True,
    'softOpenedEntrance': True, 'softOpenedFormalSettle': True,
    'softOpenedProtectCharm': True, 'released': False,
}
checks = {}
old = [OUT / n for n in ['tsc.log', 'tsc.result.json', 'v06p1-enhance-open.log',
    'v06p1-enhance-open.result.json', 'v06p1-enhance-open-evidence.json', 'open-summary.json']]
if any(p.exists() for p in old):
    archive = OUT / 'attempts' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    archive.mkdir(parents=True)
    for p in old:
        if p.exists():
            p.rename(archive / p.name)
for name, command, overrides in [
    ('tsc', ['npx', 'tsc', '--noEmit'], {}),
    ('v06p1-enhance-open', ['npm', 'run', 'test:v06p1-enhance-open'],
        {'XT_ENHANCE_QA_OUT': str(OUT)}),
]:
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT / (name + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=ROOT, env={**{k:v for k,v in os.environ.items() if k not in ['OUT_DIR','XT_ENHANCE_QA_OUT','ENHANCE_CLOSED_OUT','FORGE_CLOSED_OUT','MARKET_CLOSED_OUT']}, **overrides},
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
    output = (OUT / (name + '.log')).read_text(encoding='utf-8')
    counts = re.findall(r'tests ok:\s*(\d+)\s+assertions', output)
    record = {'command': command, 'cwd': str(ROOT), 'environment': overrides,
        'stdin': '/dev/null', 'startedAt': started, 'exitCode': result.returncode,
        'assertions': int(counts[-1]) if counts else None}
    checks[name] = record
    (OUT / (name + '.result.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(name, 'exit', result.returncode, 'assertions', record['assertions'], flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
sources = ['src/v06p1-enhance-open.test.ts', 'scripts/v06p1-enhance-open-test.mjs',
    'src/EnhanceGate.ts', 'src/EnhanceProgress.ts', 'src/scenes/GameScene.ts']
summary = {'passed': True, **FLAGS, 'checks': checks,
    'testedSourceSha256': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in sources}}
(OUT / 'open-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
