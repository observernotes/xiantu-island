#!/usr/bin/env python3
"""Compare this window's full snapshots and report the fixed scope boundaries."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_forge_formal'
EXPECTED_RECIPES_SHA = '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f'
AUTHORIZED = {
    str(ROOT / name) for name in [
        'src/ForgeGate.ts', 'src/ForgeProgress.ts', 'src/v06p1-forge-open.test.ts',
        'scripts/v06p1-forge-open-test.mjs', 'scripts/v06p1-forge-closed-test.mjs',
        'scripts/v06p1-market-closed-test.mjs', 'package.json',
    ]
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

before = json.loads((OUT / 'protected-before.json').read_text())
after = json.loads((OUT / 'protected-after.json').read_text())
old, new = before['files'], after['files']
changes = [{'path': key, 'before': old.get(key), 'after': new.get(key)}
           for key in sorted(old.keys() | new.keys()) if old.get(key) != new.get(key)]
root_changes = [{'path': key, 'before': before['roots'].get(key), 'after': after['roots'].get(key)}
               for key in sorted(before['roots'].keys() | after['roots'].keys())
               if before['roots'].get(key) != after['roots'].get(key)]
unauthorized = [row for row in changes if row['path'] not in AUTHORIZED]
comparison = {'passed': not unauthorized and not root_changes, 'beforeFiles': len(old), 'afterFiles': len(new),
    'authorizedChanges': [row for row in changes if row['path'] in AUTHORIZED],
    'unauthorizedChanges': unauthorized, 'unauthorizedDifferenceCount': len(unauthorized) + len(root_changes),
    'existenceChanges': root_changes}
(OUT / 'protection-diff.json').write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + '\n')

data_roots = [Path('/workspace/xiantu'), ROOT / 'data', Path('/workspace/xiantu/game/data')]
gifts, smiths, forge_files = {}, {}, []
def count_gifts(value):
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key == 'gifts':
                found.append(child.get('enabled') if isinstance(child, dict) else None)
            found.extend(count_gifts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(count_gifts(child))
    return found

for data_root in data_roots:
    npcs = json.loads((data_root / 'balance/npcs.json').read_text())
    gift_flags = count_gifts(npcs)
    gifts[str(data_root)] = {'count': len(gift_flags), 'allFalse': all(flag is False for flag in gift_flags)}
    smith = next(npc for npc in npcs if npc['id'] == 'smith_ou')
    smiths[str(data_root)] = {'servicesPresent': 'services' in smith, 'quests': smith.get('quests')}
    forge_files.extend(str(path) for path in (data_root / 'balance').glob('forge_*.json'))

recipe_paths = [Path('/workspace/xiantu/balance/recipes.json'), ROOT / 'data/balance/recipes.json']
recipe_checks = {}
for path in recipe_paths:
    data = json.loads(path.read_text())
    recipe_checks[str(path)] = {'sha256': sha(path), 'recipes': len(data['recipes']),
                               'forgeCount': sum(row.get('type') == 'forge' for row in data['recipes'])}
original_recipes = json.loads(subprocess.check_output(['git', 'show', '801c3ab:data/balance/recipes.json'],
                                                     cwd=ROOT, stdin=subprocess.DEVNULL, text=True))
formal_recipes = json.loads((ROOT / 'data/balance/recipes.json').read_text())
original_recipes['recipes'].append({
    'id': 'recipe_forge_bamboo_sword', 'name': '青竹剑', 'type': 'forge',
    'blueprint': 'scroll_ten_thousand_swords',
    'materials': [{'item': 'spirit_copper', 'count': 1}, {'item': 'refine_stone', 'count': 1}],
    'output': 'bamboo_sword', 'outputCount': 1,
})
scene = ROOT / 'src/scenes/GameScene.ts'
flag = ROOT / 'src/ForgeOpenFlag.ts'
phase = re.search(r'export const GAME_PHASE\s*=\s*(\d+)', (ROOT / 'src/data.ts').read_text())
old_qa_roots = [str(ROOT / f'qa/{name}') + '/' for name in
               ['out_v06p1_forge_closed', 'out_v06p1_forge_open_fixture', 'out_v06p1_forge_open_preamble']]
old_qa_changes = [row for row in changes if any(row['path'].startswith(prefix) for prefix in old_qa_roots)]
market_paths = [data_root / 'balance/market_consign.json' for data_root in data_roots]
boundary = {
    'passed': comparison['passed'], 'protectedFiles': len(old),
    'unauthorizedDifferenceCount': comparison['unauthorizedDifferenceCount'],
    'recipes': recipe_checks, 'recipesOnlyAppendOneFormalRow': original_recipes == formal_recipes,
    'ForgeOpenFlag': {'unchanged': old[str(flag)] == new[str(flag)], 'sha256': sha(flag),
                      'formalTrue': flag.read_text() == '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isForgeOpenForFixture(): boolean { return true; }\n'},
    'GAME_PHASE': int(phase.group(1)) if phase else None,
    'gifts': gifts, 'smithOu': smiths, 'forgeConfigFiles': forge_files,
    'gameSceneUnchanged': old[str(scene)] == new[str(scene)],
    'fullForgeUiAdded': any(row['path'].startswith(str(ROOT / 'src') + '/') and row['before'] is None for row in changes),
    'marketConsignUnchanged': all(old[str(path)] == new[str(path)] for path in market_paths),
    'oldForgeQaUnchanged': not old_qa_changes, 'oldForgeQaChanges': old_qa_changes,
    'formalOpen': True, 'released': False, 'packaged': False,
}
checks = [comparison['passed'], original_recipes == formal_recipes,
          boundary['ForgeOpenFlag']['unchanged'], boundary['ForgeOpenFlag']['formalTrue'],
          boundary['GAME_PHASE'] == 5, boundary['gameSceneUnchanged'], not boundary['fullForgeUiAdded'],
          boundary['marketConsignUnchanged'], boundary['oldForgeQaUnchanged'], not forge_files,
          all(row['count'] == 10 and row['allFalse'] for row in gifts.values()),
          all(not row['servicesPresent'] and row['quests'] == [] for row in smiths.values()),
          all(row['sha256'] == EXPECTED_RECIPES_SHA and row['forgeCount'] == 1 and row['recipes'] == 12
              for row in recipe_checks.values())]
boundary['passed'] = all(checks)
(OUT / 'boundary-check.json').write_text(json.dumps(boundary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': boundary['passed'], 'protectedFiles': len(old),
                  'authorizedChangeCount': len(comparison['authorizedChanges']),
                  'unauthorizedDifferenceCount': comparison['unauthorizedDifferenceCount'],
                  'oldForgeQaUnchanged': boundary['oldForgeQaUnchanged']}, ensure_ascii=False, indent=2))
raise SystemExit(0 if boundary['passed'] else 1)
