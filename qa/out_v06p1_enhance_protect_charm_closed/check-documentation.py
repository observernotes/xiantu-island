#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path('/workspace/xiantu/wt/dev')
SHARED = Path('/workspace/xiantu')
OUT = ROOT / 'qa/out_v06p1_enhance_protect_charm_closed'
summary = json.loads((OUT / 'selfcheck-summary.json').read_text())
assert summary['passed']
for name, expected in summary['testedSourceSha256'].items():
    actual = hashlib.sha256((ROOT/name).read_bytes()).hexdigest() if (ROOT/name).is_file() else None
    assert actual == expected, name
names = ['reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_CLOSED_HANDOFF.md',
    'reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_CLOSED_RESULT.md','status/炼器阁.md']
proof = {}
for name in names:
    content = (ROOT/name).read_bytes()
    decoded = content.decode('utf-8')
    assert content == (SHARED/name).read_bytes(), name
    assert 'C01–C08' in decoded and '无程序自检阻断' in decoded
    proof[name] = {'sha256':hashlib.sha256(content).hexdigest(),'utf8':True,'synced':True,'lines':len(decoded.splitlines())}
status = (ROOT/'status/炼器阁.md').read_text()
assert len(status.splitlines()) <= 30 and status.count('\n## ') == 4
tip = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip()
subject = subprocess.check_output(['git','log','-1','--format=%s'],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip()
if subject.startswith('feat('):
    (OUT/'implementation-tip.json').write_text(json.dumps({'sha':tip,'subject':subject,'baseline':'0cd3fc9',
        'files':subprocess.check_output(['git','diff-tree','--no-commit-id','--name-only','-r',tip],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).splitlines()},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
record = {'passed':True,'files':proof,'testedSourcesMatch':True,'statusFourSections':True,
    'notRun':['snapshot','build','sync','release'],'scope':'本令≠开态全表≠soft-open≠release≠进包'}
(OUT/'documentation-check.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record,ensure_ascii=False))
