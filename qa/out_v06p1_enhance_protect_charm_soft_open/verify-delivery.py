#!/usr/bin/env python3
"""Sync the three authorized UTF-8 documents and verify this delivery."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
SHARED = Path('/workspace/xiantu')
NAMES = ['reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_SOFT_OPEN_HANDOFF.md',
    'reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_SOFT_OPEN_RESULT.md', 'status/炼器阁.md']
flags = dict(protectCharmWired=True, protectCharmN=1, protectCharmOpenFixtureTableExecuted=True,
    formalTipsWired=True, formalInstanceSource=True, softOpenedEntrance=True,
    softOpenedFormalSettle=True, softOpenedProtectCharm=True, released=False)
implementation = json.loads((OUT/'implementation-tip.json').read_text())['implementationTip']
summary = json.loads((OUT/'selfcheck-summary.json').read_text())
records = {}
for name in NAMES:
    raw = (ROOT/name).read_bytes()
    text = raw.decode('utf-8')
    assert '\ufffd' not in text and not raw.startswith(b'\xef\xbb\xbf'), name
    assert not re.search(r'TODO|TBD|PLACEHOLDER|待填|占位', text), name
    assert 'softOpenedProtectCharm' in text and 'released' in text, name
    if name.startswith('reports/'):
        assert implementation in text, name
        blocks = re.findall(r'```json\s*\n(.*?)\n```', text, re.S)
        assert any(all(json.loads(block).get(k) == v for k, v in flags.items()) for block in blocks), name
        assert f"{summary['totalSuiteAssertions']:,}" in text or str(summary['totalSuiteAssertions']) in text, name
    else:
        assert len(text.splitlines()) <= 30
        assert re.findall(r'^## (.+)$', text, re.M) == ['当前', '实现与验证', '交付与旁证', '边界与下一棒']
    (SHARED/name).parent.mkdir(parents=True, exist_ok=True)
    (SHARED/name).write_bytes(raw)
    assert (SHARED/name).read_bytes() == raw
    records[name] = {'sha256': hashlib.sha256(raw).hexdigest(), 'utf8': True,
        'sharedCopyMatch': True, 'lines': len(text.splitlines())}
diff = subprocess.run(['git','diff','--check'], cwd=ROOT, stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
assert diff.returncode == 0, diff.stdout
result = {'passed': True, 'implementationTip': implementation, 'documents': records,
    'sharedUtf8Sync': True, 'statusAtMost30Lines': True, 'statusFourSections': True,
    'evidence': flags, 'diffCheckExitCode': diff.returncode}
(OUT/'documentation-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
