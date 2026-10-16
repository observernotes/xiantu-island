"""Compare task-wide SHA evidence; permit only the soft-open changes authorized here."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_market_open_preamble'
ROOTS = {'shared': pathlib.Path('/workspace/xiantu'), 'wt': ROOT / 'data',
         'game': pathlib.Path('/workspace/xiantu/game/data')}
SOURCE_ROOTS = {'wt': ROOT, 'game': pathlib.Path('/workspace/xiantu/game')}
AUTHORIZED_SOURCES = {'wt:src/MarketOpenFlag.ts', 'wt:src/MarketGate.ts',
                      'wt:src/scenes/GameScene.ts', 'wt:src/v06p1-market-open.test.ts'}


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None


def collect():
    files = {}
    for mode, root in ROOTS.items():
        for folder in ['balance', 'maps']:
            for file in sorted((root / folder).rglob('*.json')):
                files[f'{mode}:{file.relative_to(root)}'] = sha(file)
        for name in ['features.json', 'balance/market_consign.json']:
            files[f'{mode}:{name}'] = sha(root / name)
    for mode, root in SOURCE_ROOTS.items():
        for file in sorted((root / 'src').rglob('*')):
            if file.is_file():
                files[f'{mode}:{file.relative_to(root)}'] = sha(file)
    return files


before = json.loads((OUT / 'protected-before.json').read_text())
after = collect()
assert before.keys() == after.keys(), 'Only the explicitly recorded absent market table may appear'
changes = []
for key, old in before.items():
    new = after[key]
    if new == old:
        continue
    assert key in AUTHORIZED_SOURCES or key.endswith(':balance/market_consign.json'), key
    changes.append({'key': key, 'before': old, 'after': new})

flip = json.loads((OUT / 'market-flip.json').read_text())
old_market = json.loads((OUT / 'market_consign.before.json').read_bytes())
market_bytes = [p.joinpath('balance/market_consign.json').read_bytes() for p in ROOTS.values()]
assert all(b == market_bytes[0] for b in market_bytes)
market = json.loads(market_bytes[0])
assert market['enabled'] is True
old_market['enabled'] = True
old_market['meta']['status'] = market['meta']['status']
assert market == old_market, 'Only enabled and authorized meta.status handoff may change'
assert hashlib.sha256(market_bytes[0]).hexdigest() == flip['afterSha256']

baseline = json.loads((OUT / 'baseline.json').read_text())['baseline']
old_gate = subprocess.check_output(['git', 'show', f'{baseline}:src/MarketGate.ts']).decode()
expected_gate = old_gate.replace('rules.enabled === false', 'rules.enabled === true').replace(
    '/** 无前台接线。正式每入口首先走 Closed；只有 Vite SSR 内存图可进入真实 Progress 事务。 */',
    '/** 正式 soft-open；每入口保留关态拦截，仅 Vite SSR 内存关态图注入 false。 */')
assert (ROOT / 'src/MarketGate.ts').read_text() == expected_gate, 'Gate numerical validation and implementation unchanged'
flag = (ROOT / 'src/MarketOpenFlag.ts').read_text()
assert flag == '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isMarketOpenForFixture(): boolean { return true; }\n'

gifts = {}
for mode, root in ROOTS.items():
    found = []
    def visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == 'gifts':
                    found.append(child['enabled'])
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(json.loads((root / 'balance/npcs.json').read_bytes()))
    assert found == [False] * 10
    gifts[mode] = {'count': len(found), 'allFalse': True}
    shops = json.loads((root / 'balance/shops.json').read_bytes())
    assert shops and all(isinstance(v, list) for v in shops.values())

source_diff = subprocess.check_output(['git', 'diff', '--unified=0', baseline, '--', 'src/MarketOpenFlag.ts',
    'src/MarketGate.ts', 'src/scenes/GameScene.ts', 'src/v06p1-market-open.test.ts']).decode()
(OUT / 'authorized-source.diff').write_text(source_diff)
(OUT / 'protected-after.json').write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n')
result = {'passed': True, 'protectedPaths': len(before), 'unchangedPaths': len(before) - len(changes),
          'authorizedChanges': changes, 'unauthorizedChanges': [], 'marketNumericFieldsUnchanged': True,
          'marketThreeRootsSameBytes': True, 'marketEnabled': True, 'marketTableSha': flip['afterSha256'],
          'gifts': gifts, 'gamePhase': 5, 'ShopPanelUnchanged': True, 'mapsUnchanged': True,
          'gameSourcesUnchanged': True, 'sourceDiff': 'authorized-source.diff'}
(OUT / 'protected-diff.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False))
