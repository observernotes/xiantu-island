"""Verify fixed data/source baselines and preserve previous enhance QA evidence."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = json.loads((OUT / 'protected-before.json').read_text())
allowed = {'snapshot/balance/strings_zh.json', 'src/EnhanceGate.ts', 'src/v06p1-enhance-open.test.ts'}
changed = []
for key, row in baseline['files'].items():
    path = Path(row['path'])
    current = digest(path) if path.is_file() else None
    if current != row['sha256']:
        changed.append({'file': key, 'before': row['sha256'], 'after': current})
unexpected = [row for row in changed if row['file'] not in allowed]
old = json.loads((OUT / 'prior-evidence-before.json').read_text())
old_changes = [p for p, sha in old.items() if not (ROOT / p).is_file() or digest(ROOT / p) != sha]
old_directories = ('qa/out_v06p1_enhance_open_preamble', 'qa/out_v06p1_enhance_open_fixture',
                   'qa/out_v06p1_enhance_closed')
old_current = {str(p.relative_to(ROOT)) for directory in old_directories
               for p in (ROOT / directory).rglob('*') if p.is_file()}
old_added = sorted(old_current - old.keys())
fixed = {
    'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
    'src/ForgeGate.ts': '44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86',
    'data/balance/enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
    'data/balance/recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
    'data/balance/strings_zh.json': 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09',
}
hashes = {name: digest(ROOT / name) for name in fixed}
assert hashes == fixed
assert not unexpected, unexpected
assert not old_changes, old_changes
assert not old_added, old_added
flag = (ROOT / 'src/EnhanceOpenFlag.ts').read_text()
assert 'return true;' in flag
assert len(json.loads((ROOT / 'data/balance/strings_zh.json').read_text())) == 944
record = {'base': baseline['base'], 'checkedFiles': len(baseline['files']),
          'changed': changed, 'unauthorizedDifferences': len(unexpected),
          'priorEvidenceFilesUnchanged': len(old), 'priorEvidenceDifferences': old_changes,
          'priorEvidenceAddedFiles': old_added,
          'fixedSha256': hashes, 'enhanceOpenFlag': True,
          'formalTipsWired': True, 'formalInstanceSource': False,
          'released': False, 'softOpenedEntrance': True,
          'trackedDiff': subprocess.check_output(['git', 'diff', '--name-only', baseline['base']],
                                               cwd=ROOT, stdin=subprocess.DEVNULL, text=True).splitlines()}
(OUT / 'protected-after.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False, indent=2))
