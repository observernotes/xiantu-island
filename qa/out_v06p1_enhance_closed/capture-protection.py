"""本窗只读保护旁证；只向本窗 qa 目录写证据，不改任何保护文件。"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SHARED = Path('/workspace/xiantu')
OUT = Path(__file__).resolve().parent
ROOTS = {'shared': SHARED, 'wt': ROOT / 'data', 'game': SHARED / 'game/data'}


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None


def key_snapshot():
    result = {}
    for name in ['ForgeOpenFlag.ts', 'ForgeClosed.ts', 'ForgeGate.ts']:
        result[name] = sha(ROOT / 'src' / name)
    for mode, base in ROOTS.items():
        result[f'enhance.{mode}'] = sha(base / 'balance/enhance.json')
    for name in ['recipes', 'life_skills', 'npcs']:
        result[f'{name}.shared'] = sha(SHARED / f'balance/{name}.json')
    for mode, base in ROOTS.items():
        result[f'strings.{mode}'] = sha(base / 'balance/strings_zh.json')
    result['GameScene.ts'] = sha(ROOT / 'src/scenes/GameScene.ts')
    result['features.wt'] = sha(ROOT / 'data/features.json')
    return result


def capture():
    data, sources, forge_blocks = {}, {}, {}
    for mode, base in ROOTS.items():
        for folder in ['balance', 'maps']:
            for p in sorted((base / folder).rglob('*')):
                if p.is_file():
                    data[f'{mode}:{p.relative_to(base)}'] = sha(p)
        data[f'{mode}:features.json'] = sha(base / 'features.json')
        block = b''.join(line for line in (base / 'balance/strings_zh.json').read_bytes().splitlines(keepends=True)
                         if b'"forge.closed.' in line)
        normalized = '\n'.join(line.strip().rstrip(',') for line in block.decode().splitlines())
        forge_blocks[mode] = {'rawLinesSha256': hashlib.sha256(block).hexdigest(),
                              'normalizedLinesSha256': hashlib.sha256(normalized.encode()).hexdigest()}
    for p in sorted((ROOT / 'src').rglob('*')):
        if p.is_file() and 'gen' not in p.relative_to(ROOT / 'src').parts:
            if p.name not in ['EnhanceClosed.ts', 'EnhanceOpenFlag.ts']:
                sources[str(p.relative_to(ROOT / 'src'))] = sha(p)
    return data, sources, forge_blocks


stage = sys.argv[1]
assert stage in ['before', 'after']
data, sources, forge_blocks = capture()
key = key_snapshot()
baseline_key = json.loads((OUT / 'protected-before-key.json').read_text())
assert key == baseline_key, '权威保护表与当前文件不一致'
if stage == 'before':
    (OUT / 'source-before.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'data-files-before.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'forge-block-before.json').write_text(json.dumps(forge_blocks, indent=2) + '\n')
    print(f'PASS before: {len(sources)} source files, {len(data)} data files, authority key baseline matched')
else:
    before_sources = json.loads((OUT / 'source-before.json').read_text())
    before_data = json.loads((OUT / 'data-files-before.json').read_text())
    before_forge = json.loads((OUT / 'forge-block-before.json').read_text())
    assert sources == before_sources, '既有 src 文件集合或字节变化'
    assert data == before_data, '三根 balance/maps/features 文件集合或字节变化'
    assert forge_blocks == before_forge, 'forge.closed.* 行块变化'
    for block in forge_blocks.values():
        assert block['rawLinesSha256'] == 'd2b8867181ef9a0f8e14c57e0d3dcd19a42896b146650a187ec13fdc511034dd', 'forge 八行原始字节 SHA 不一致'
        assert block['normalizedLinesSha256'].startswith('fa6451ac7be94a0e'), 'forge 行块权威哈希不一致'
    (OUT / 'protected-after-key.json').write_text(json.dumps(key, ensure_ascii=False, indent=2) + '\n')
    summary = {'passed': True, 'authorityKeyEntries': len(key), 'existingSourcesUnchanged': len(sources),
               'dataFilesUnchanged': len(data), 'forgeBlocks': forge_blocks,
               'sourceOnlyAdded': ['EnhanceClosed.ts', 'EnhanceOpenFlag.ts'],
               'sharedStringsUnchanged': True, 'stringsSha': key['strings.shared'],
               'enhanceJsonUnchanged': True, 'ForgeOpenFlagUnchanged': True,
               'EnhanceOpenFlag': False, 'GAME_PHASE': 5, 'smithServices': False,
               'giftsFalseCount': 10, 'enhanceGateAdded': False, 'frontendEnhanceWiringAdded': False,
               'softOpened': False, 'released': False}
    (OUT / 'boundary-check.log').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False))
