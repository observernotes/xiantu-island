"""Verify this window against its pre-edit byte and directory manifest."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_forge_open_preamble'
before = json.loads((OUT / 'protected-before.json').read_text())
allowed = {str(ROOT / name) for name in [
    'src/ForgeOpenFlag.ts', 'src/scenes/GameScene.ts',
    'src/v06p1-forge-open.test.ts', 'scripts/v06p1-forge-open-test.mjs',
    'scripts/v06p1-forge-closed-test.mjs', 'scripts/v06p1-market-closed-test.mjs',
]}

def digest(path):
    p = Path(path)
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None

after = {name: digest(name) for name in before['files']}
changed = [{'file': name, 'before': sha, 'after': after[name], 'authorized': name in allowed}
           for name, sha in before['files'].items() if after[name] != sha]
directory_changes = []
after_directories = {}
for directory, names in before['directories'].items():
    p = Path(directory)
    current = sorted(str(f.relative_to(p)) for f in p.rglob('*') if f.is_file())
    after_directories[directory] = current
    if current != names:
        directory_changes.append({'directory': directory,
                                  'added': sorted(set(current) - set(names)),
                                  'removed': sorted(set(names) - set(current))})
for code_root in [ROOT, Path('/workspace/xiantu/game')]:
    p = code_root / 'src'
    expected = {name for name in before['files'] if name.startswith(str(p) + '/')}
    current = {str(f) for f in p.rglob('*') if f.is_file()}
    if current != expected:
        directory_changes.append({'directory': str(p), 'added': sorted(current - expected),
                                  'removed': sorted(expected - current)})
unauthorized = [row for row in changed if not row['authorized']]
result = {'passed': not unauthorized and not directory_changes, 'baseline': before['baseline'],
          'protectedFiles': len(after), 'unchangedFiles': len(after) - len(changed),
          'authorizedDifferences': changed, 'unauthorizedDifferences': unauthorized,
          'directoryDifferences': directory_changes, 'formalOpen': True,
          'closedFixtureOnly': True, 'softOpened': True, 'released': False}
(OUT / 'protected-after.json').write_text(json.dumps(
    {'baseline': before['baseline'], 'files': after, 'directories': after_directories},
    ensure_ascii=False, indent=2) + '\n')
(OUT / 'protected-diff.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
assert result['passed'], 'Unauthorized byte or directory differences'
