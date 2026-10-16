#!/usr/bin/env python3
"""Capture all existing protected files, including preexisting QA evidence."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_forge_formal'
ROOTS = [
    Path('/workspace/xiantu/balance'), Path('/workspace/xiantu/maps'),
    Path('/workspace/xiantu/game/balance'), Path('/workspace/xiantu/game/maps'),
    Path('/workspace/xiantu/game/src'),
    Path('/workspace/xiantu/game/data/balance'), Path('/workspace/xiantu/game/data/maps'),
    ROOT / 'data/balance', ROOT / 'data/maps', ROOT / 'src', ROOT / 'scripts',
    ROOT / 'qa/out_v06p1_forge_closed',
    ROOT / 'qa/out_v06p1_forge_open_fixture',
    ROOT / 'qa/out_v06p1_forge_open_preamble',
]
FILES = [ROOT / 'package.json', ROOT / 'data/features.json',
         Path('/workspace/xiantu/features.json'),
         Path('/workspace/xiantu/game/data/features.json'),
         Path('/workspace/xiantu/game/features.json')]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stdin=subprocess.DEVNULL, text=True).strip()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def capture():
    files = {}
    roots = {}
    for root in ROOTS:
        roots[str(root)] = root.exists()
        if root.is_dir():
            for path in sorted(root.rglob('*')):
                if path.is_file():
                    files[str(path)] = digest(path)
    for path in FILES:
        roots[str(path)] = path.exists()
        if path.is_file():
            files[str(path)] = digest(path)
    recipes = {}
    for path in [Path('/workspace/xiantu/balance/recipes.json'), ROOT / 'data/balance/recipes.json']:
        data = json.loads(path.read_text())
        rows = data if isinstance(data, list) else data.get('recipes', [])
        recipes[str(path)] = {'sha256': digest(path), 'recipes': len(rows),
            'forge': [row for row in rows if row.get('type') == 'forge']}
    return {'roots': roots, 'files': files, 'recipes': recipes,
            'git': {'head': git('rev-parse', 'HEAD'),
                    'originDev': git('rev-parse', 'origin/dev'),
                    'status': git('status', '--short'),
                    'baselineAncestor': subprocess.run(['git', 'merge-base', '--is-ancestor', '801c3ab', 'HEAD'], cwd=ROOT, stdin=subprocess.DEVNULL).returncode == 0}}

phase = sys.argv[1] if len(sys.argv) > 1 else 'before'
OUT.mkdir(parents=True, exist_ok=True)
result = capture()
target = OUT / f'protected-{phase}.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'path': str(target), 'files': len(result['files']), 'recipes': result['recipes'], 'git': {k: v for k, v in result['git'].items() if k != 'status'}}, ensure_ascii=False, indent=2))
