"""仅在临时测试副本预演两行提案；不修改正式测试、配方或旧 QA 证据。"""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
OLD = "const formalRecipeKeys = new Set(['shared:balance/recipes.json', 'wt:balance/recipes.json']);"
NEW = "const formalRecipeKeys = new Set(['shared:balance/recipes.json', 'wt:balance/recipes.json', 'game:balance/recipes.json']);"
rows = []
for case, legacy_rel in [('forge', 'qa/out_v06p1_forge_formal/closed'),
                         ('market', 'qa/out_v06p1_forge_formal/market-closed')]:
    script = ROOT / f'scripts/v06p1-{case}-closed-test.mjs'
    source = script.read_text()
    assert source.count(OLD) == 1
    legacy = ROOT / legacy_rel
    with tempfile.TemporaryDirectory(prefix='enhance-expectation-preflight-') as temp:
        backup = Path(temp) / 'legacy'
        if legacy.exists():
            shutil.copytree(legacy, backup)
        temporary = ROOT / f'scripts/.v06p1-enhance-{case}-proposal-test.mjs'
        assert not temporary.exists()
        try:
            temporary.write_text(source.replace(OLD, NEW))
            with (OUT / f'{case}-recipes-proposal-preflight.log').open('w') as log:
                p = subprocess.run(['timeout', '120s', 'node', str(temporary)], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
            if legacy.exists():
                shutil.copytree(legacy, OUT / 'proposal-preflight-evidence' / case, dirs_exist_ok=True)
            rows.append({'case': case, 'exitCode': p.returncode, 'formalScriptModified': False,
                         'formalNpmRegressionPassed': False, 'proposalOnly': True})
        finally:
            temporary.unlink(missing_ok=True)
            if legacy.exists():
                shutil.rmtree(legacy)
            if backup.exists():
                shutil.copytree(backup, legacy)
(OUT / 'recipes-proposal-preflight.json').write_text(json.dumps(rows, indent=2) + '\n')
print(json.dumps(rows, indent=2))
raise SystemExit(0 if all(row['exitCode'] == 0 for row in rows) else 1)
